const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { resolveOrgUnit } = require("../utils/orgLookup");
const { getMasterValueId, getMasterValueCode } = require("../utils/masterLookup");
const {
    generateComplaintNo,
    generateTrackingToken,
    generatePostboxPassword
} = require("../utils/generateIds");
const { notify, notifyRole } = require("./notify");

// Shared by both the internal manual-entry endpoint and the public
// anonymous-portal endpoint — the only difference is who's calling and
// whether a post box (anonymous_tracking) should be created.
const createComplaint = async (input, { createdBy = null, forcePostbox = false } = {}) => {
    const anonymityCode = await getMasterValueCode(input.anonymityTypeId);
    const isAnonymous = anonymityCode === "ANONYMOUS";

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const statusId = await getMasterValueId("COMPLAINT_STATUS", "RECEIVED", conn);

        let complaintNo;
        let complaintId;

        // Tiny retry loop in case two submissions race for the same
        // yearly sequence number (complaint_no is UNIQUE).
        for (let attempt = 0; attempt < 3; attempt++) {
            complaintNo = await generateComplaintNo(conn);

            try {
                const [result] = await conn.query(
                    `INSERT INTO complaints
                        (complaint_no, date_of_receipt, ack_to_wb_date, complaint_reference_id,
                         addressed_to_master_value_id, complaint_language_id, channel_reference,
                         channel_id, complaint_nature_id, complaint_classification_id,
                         complaint_sub_classification_id, complainant_type_id, anonymity_type_id,
                         complainant_reference_id, complaint_description, severity_id,
                         good_faith_confirmed, current_status_id, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        complaintNo,
                        input.dateOfReceipt,
                        input.ackToWbDate || null,
                        input.complaintReferenceId || complaintNo,
                        input.addressedToId || null,
                        input.languageId || null,
                        input.channelReference || null,
                        input.channelId,
                        input.natureId || null,
                        input.classificationId || null,
                        input.subClassificationId || null,
                        input.complainantTypeId || null,
                        input.anonymityTypeId || null,
                        input.complainantReferenceId || null,
                        input.description,
                        input.severityId || null,
                        input.declaration ? 1 : 0,
                        statusId,
                        createdBy
                    ]
                );

                complaintId = result.insertId;
                break;
            } catch (err) {
                if (err.code === "ER_DUP_ENTRY" && attempt < 2) {
                    continue;
                }
                throw err;
            }
        }

        // Complainant details are captured unless the complaint is
        // anonymous, per screen 6.2 ("hidden or blank for anonymous
        // complaints").
        const complainant = isAnonymous ? {} : input.complainant || {};
        const org = isAnonymous ? {} : await resolveOrgUnit(conn, complainant);

        await conn.query(
            `INSERT INTO complainants
                (complaint_id, employee_name, employee_id, branch_id, region_id, department_id,
                 designation_id, email_id, mobile_number, is_anonymous, identity_visibility_code)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                complaintId,
                isAnonymous ? null : complainant.employeeName || null,
                isAnonymous ? null : complainant.employeeId || null,
                org.branchId || null,
                org.regionId || null,
                org.departmentId || null,
                org.designationId || null,
                isAnonymous ? null : complainant.email || null,
                isAnonymous ? null : complainant.mobile || null,
                isAnonymous ? 1 : 0,
                isAnonymous ? "MASKED" : "RESTRICTED"
            ]
        );

        const respondents = input.respondents || [];

        for (const respondent of respondents) {
            if (!respondent || (!respondent.employeeName && !respondent.employeeId)) {
                continue;
            }

            const respOrg = await resolveOrgUnit(conn, respondent);

            await conn.query(
                `INSERT INTO complaint_respondents
                    (complaint_id, employee_id, employee_name, branch_id, region_id, department_id,
                     designation_id, remarks)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    complaintId,
                    respondent.employeeId || null,
                    respondent.employeeName || null,
                    respOrg.branchId || null,
                    respOrg.regionId || null,
                    respOrg.departmentId || null,
                    respOrg.designationId || null,
                    respondent.remarks || null
                ]
            );
        }

        let trackingToken = null;
        let postboxPassword = null;

        if (isAnonymous || forcePostbox) {
            trackingToken = generateTrackingToken();
            postboxPassword = generatePostboxPassword();
            const passwordHash = await bcrypt.hash(postboxPassword, 10);

            await conn.query(
                `INSERT INTO anonymous_tracking (complaint_id, tracking_token, password_hash)
                 VALUES (?, ?, ?)`,
                [complaintId, trackingToken, passwordHash]
            );
        }

        await conn.commit();

        await notify({
            complaintId,
            templateCode: "COMPLAINT_REGISTERED",
            recipient: isAnonymous ? "anonymous" : complainant.email || "N/A"
        });

        await notifyRole({
            roleCodes: ["WBC_MEMBER"],
            complaintId,
            templateCode: "NEW_COMPLAINT_RECEIVED"
        });

        return { complaintId, complaintNo, trackingToken, postboxPassword };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Verifies {complaintNo, password} against anonymous_tracking, applying
// lockout after repeated failures. Returns a result object instead of
// throwing for expected auth failures (bad creds/locked) so callers can
// map them to clean 401s without treating them as server errors.
const verifyTrackingCredentials = async (complaintNo, password) => {
    const [complaints] = await db.query(
        "SELECT complaint_id FROM complaints WHERE complaint_no = ?",
        [complaintNo]
    );

    const complaint = complaints[0];

    if (!complaint) {
        return { ok: false, reason: "NOT_FOUND" };
    }

    const [trackingRows] = await db.query(
        "SELECT * FROM anonymous_tracking WHERE complaint_id = ?",
        [complaint.complaint_id]
    );

    const tracking = trackingRows[0];

    if (!tracking) {
        return { ok: false, reason: "NOT_FOUND" };
    }

    if (tracking.locked_until && new Date(tracking.locked_until) > new Date()) {
        return { ok: false, reason: "LOCKED" };
    }

    const valid = await bcrypt.compare(password, tracking.password_hash);

    if (!valid) {
        const failedAttempts = tracking.failed_attempts + 1;
        const lockedUntil =
            failedAttempts >= MAX_FAILED_ATTEMPTS
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
                : null;

        await db.query(
            "UPDATE anonymous_tracking SET failed_attempts = ?, locked_until = ? WHERE tracking_id = ?",
            [failedAttempts, lockedUntil, tracking.tracking_id]
        );

        return { ok: false, reason: lockedUntil ? "LOCKED" : "INVALID" };
    }

    await db.query(
        "UPDATE anonymous_tracking SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE tracking_id = ?",
        [tracking.tracking_id]
    );

    return { ok: true, complaintId: complaint.complaint_id, trackingId: tracking.tracking_id };
};

module.exports = { createComplaint, verifyTrackingCredentials };
