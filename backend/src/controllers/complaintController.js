const path = require("path");
const db = require("../config/db");
const { createComplaint: createComplaintRecord } = require("../services/complaintService");
const { getMasterValueId } = require("../utils/masterLookup");
const { canViewIdentity, maskValue, isAdmin, canActAsWbc, WBC_ROLES, IU_ROLES } = require("../utils/permissions");
const { notify, notifyRole, complainantRecipient } = require("../services/notify");
const { storeUploadedFile } = require("../services/fileStorage");
const { resolveOrgUnit } = require("../utils/orgLookup");
const { generateCaseNo } = require("../utils/generateIds");
const { SLA, dueStatus, toIsoDate } = require("../utils/sla");
const { requestAdditionalDetails } = require("../services/clarificationService");
const { setComplaintStatus, setCaseStatus, WorkflowError } = require("../services/workflowService");
const { complaintVisibilityFilter, canViewComplaint } = require("../utils/caseAccess");
const { markViewed } = require("../utils/entityViews");

const maskComplainant = (row, canView) => {
    if (!row) return null;

    // Anonymous complaints have no identity to reveal to anyone; named ones are
    // revealed only to roles cleared for it (never the Investigation Unit).
    if (row.is_anonymous) {
        return {
            isAnonymous: true,
            employeeName: null,
            employeeId: null,
            email: null,
            mobile: null,
            branch: row.branch_name,
            region: row.region_name,
            department: row.department_name,
            designation: row.designation_name
        };
    }

    return {
        isAnonymous: false,
        identityWithheld: !canView,
        employeeName: maskValue(row.employee_name, canView),
        employeeId: maskValue(row.employee_id, canView),
        email: maskValue(row.email_id, canView),
        mobile: maskValue(row.mobile_number, canView),
        branch: row.branch_name,
        region: row.region_name,
        department: row.department_name,
        designation: row.designation_name
    };
};

const createComplaint = async (req, res) => {
    const result = await createComplaintRecord(req.body, { createdBy: req.user.userId });
    res.status(201).json(result);
};

const listComplaints = async (req, res) => {
    const { status, severity, channel, dateFrom, dateTo, search, queue, mine, page = 1, pageSize = 20 } = req.query;

    const where = [];
    const params = [];

    // Ownership scoping: a committee member sees unclaimed complaints and the
    // ones they acknowledged, never a colleague's. Admin sees all.
    const visibility = complaintVisibilityFilter(req.user, "c");

    if (visibility.sql) {
        where.push(visibility.sql);
        params.push(...visibility.params);
    }

    if (queue) {
        // The Complaint Queue only ever shows intake-stage complaints — this is
        // enforced here (not just left to the frontend) so the restriction holds
        // even against a hand-edited request.
        const receivedId = await getMasterValueId("COMPLAINT_STATUS", "RECEIVED");
        const convertedId = await getMasterValueId("COMPLAINT_STATUS", "CONVERTED_TO_CASE");
        const queueIds = [receivedId, convertedId];

        if (status && queueIds.includes(Number(status))) {
            where.push("c.current_status_id = ?");
            params.push(status);
        } else {
            where.push("c.current_status_id IN (?, ?)");
            params.push(receivedId, convertedId);
        }
    } else if (status) {
        where.push("c.current_status_id = ?");
        params.push(status);
    }

    // "My bucket" for a WB Committee member — the complaints they own.
    if (mine === "1" || mine === "true") {
        where.push("c.wbc_owner_id = ?");
        params.push(req.user.userId);
    }

    if (severity) {
        where.push("c.severity_id = ?");
        params.push(severity);
    }
    if (channel) {
        where.push("c.channel_id = ?");
        params.push(channel);
    }
    if (dateFrom) {
        where.push("c.date_of_receipt >= ?");
        params.push(dateFrom);
    }
    if (dateTo) {
        where.push("c.date_of_receipt <= ?");
        params.push(dateTo);
    }
    if (search) {
        where.push("(c.complaint_no LIKE ? OR c.complaint_reference_id LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Number(pageSize) || 20, 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

    const [rows] = await db.query(
        `SELECT c.complaint_id AS id, c.complaint_no AS complaintNo, c.date_of_receipt AS dateOfReceipt,
                c.ack_to_wb_date AS ackToWbDate, c.complaint_description AS description,
                sev.value_name AS severity, st.value_name AS status, st.value_code AS statusCode, ch.value_name AS channel,
                comp.is_anonymous AS isAnonymous, comp.employee_name AS complainantName,
                owner.full_name AS wbcOwnerName, c.wbc_owner_id AS wbcOwnerId
         FROM complaints c
         LEFT JOIN master_values sev ON sev.master_value_id = c.severity_id
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         LEFT JOIN master_values ch ON ch.master_value_id = c.channel_id
         LEFT JOIN complainants comp ON comp.complaint_id = c.complaint_id
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         ${whereClause}
         ORDER BY c.complaint_id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const canView = canViewIdentity(req.user.roles);

    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM complaints c ${whereClause}`, params);

    res.json({
        data: rows.map((r) => ({
            ...r,
            complainantName: r.isAnonymous ? null : maskValue(r.complainantName, canView),
            // Acknowledgement is due 4 days from receipt; the queue flags what
            // is running out of time so the committee can triage on sight.
            acknowledgementSla: dueStatus(r.dateOfReceipt, SLA.ACK_DAYS, r.ackToWbDate)
        })),
        total: countRows[0].total,
        page: Number(page),
        pageSize: limit
    });
};

// Everything the complaint screen needs to render the current point in the
// handling procedure: the record, the audit trail, the additional-details
// requests and their clocks, and which actions this user may take next.
const getComplaint = async (req, res) => {
    const { id } = req.params;

    if (!(await canViewComplaint(id, req.user))) {
        // Indistinguishable from a genuine miss, so a committee member cannot
        // probe which complaint numbers a colleague is handling.
        return res.status(404).json({ message: "Complaint not found" });
    }

    const [complaints] = await db.query(
        `SELECT c.*, sev.value_name AS severityName, st.value_name AS statusName, st.value_code AS statusCode,
                ch.value_name AS channelName, nat.value_name AS natureName,
                cls.value_name AS classificationName, ct.value_name AS complainantTypeName,
                an.value_name AS anonymityTypeName, owner.full_name AS wbcOwnerName
         FROM complaints c
         LEFT JOIN master_values sev ON sev.master_value_id = c.severity_id
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         LEFT JOIN master_values ch ON ch.master_value_id = c.channel_id
         LEFT JOIN master_values nat ON nat.master_value_id = c.complaint_nature_id
         LEFT JOIN master_values cls ON cls.master_value_id = c.complaint_classification_id
         LEFT JOIN master_values ct ON ct.master_value_id = c.complainant_type_id
         LEFT JOIN master_values an ON an.master_value_id = c.anonymity_type_id
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         WHERE c.complaint_id = ?`,
        [id]
    );

    const complaint = complaints[0];

    if (!complaint) {
        return res.status(404).json({ message: "Complaint not found" });
    }

    await markViewed(req.user.userId, "COMPLAINT", id);

    const [complainantRows] = await db.query(
        `SELECT comp.*, b.branch_name, r.region_name, d.department_name, des.designation_name
         FROM complainants comp
         LEFT JOIN branches b ON b.branch_id = comp.branch_id
         LEFT JOIN regions r ON r.region_id = comp.region_id
         LEFT JOIN departments d ON d.department_id = comp.department_id
         LEFT JOIN designations des ON des.designation_id = comp.designation_id
         WHERE comp.complaint_id = ?`,
        [id]
    );

    const [respondents] = await db.query(
        `SELECT resp.*, b.branch_name, r.region_name, d.department_name, des.designation_name
         FROM complaint_respondents resp
         LEFT JOIN branches b ON b.branch_id = resp.branch_id
         LEFT JOIN regions r ON r.region_id = resp.region_id
         LEFT JOIN departments d ON d.department_id = resp.department_id
         LEFT JOIN designations des ON des.designation_id = resp.designation_id
         WHERE resp.complaint_id = ?`,
        [id]
    );

    const [documents] = await db.query(
        `SELECT document_id AS id, document_name AS name, file_name AS fileName, file_type AS fileType,
                uploaded_at AS uploadedAt
         FROM documents WHERE complaint_id = ? AND is_active = 1`,
        [id]
    );

    const [history] = await db.query(
        `SELECT h.*, u.full_name AS performedByName
         FROM complaint_status_history h
         LEFT JOIN users u ON u.user_id = h.performed_by
         WHERE h.complaint_id = ?
         ORDER BY h.performed_at ASC`,
        [id]
    );

    const [clarifications] = await db.query(
        `SELECT cl.clarification_id AS id, cl.clarification_question AS question, cl.raised_at AS raisedAt,
                cl.response_due_date AS responseDueDate, cl.response_text AS responseText,
                cl.responded_at AS respondedAt, cl.status_code AS statusCode,
                cl.reminder_count AS reminderCount, cl.last_reminder_at AS lastReminderAt,
                cl.closed_reason AS closedReason, cl.case_id AS caseId, u.full_name AS raisedByName
         FROM complaint_clarifications cl
         LEFT JOIN users u ON u.user_id = cl.raised_by
         WHERE cl.complaint_id = ?
         ORDER BY cl.clarification_id DESC`,
        [id]
    );

    const [caseRows] = await db.query(
        `SELECT cs.case_id AS id, cs.case_no AS caseNo, st.value_code AS statusCode, st.value_name AS statusName,
                u.full_name AS investigationOfficerName
         FROM cases cs
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         LEFT JOIN users u ON u.user_id = cs.investigation_officer_id
         WHERE cs.complaint_id = ?`,
        [id]
    );

    const roles = req.user.roles || [];
    const openClarification = clarifications.find((c) => c.statusCode === "OPEN") || null;
    const isTerminal = ["CLOSED", "REJECTED"].includes(complaint.statusCode);
    const forwarded = complaint.statusCode === "CONVERTED_TO_CASE" || caseRows.length > 0;

    res.json({
        complaint,
        complainant: maskComplainant(complainantRows[0], canViewIdentity(roles)),
        respondents,
        documents,
        history,
        clarifications,
        case: caseRows[0] || null,
        sla: {
            // "Acknowledgement to complainant within 4 days by WB Committee"
            acknowledgement: dueStatus(complaint.date_of_receipt, SLA.ACK_DAYS, complaint.ack_to_wb_date),
            // "Forward complaint to IU within 5 days from the date of complaint receipt"
            forwardToIu: dueStatus(complaint.date_of_receipt, SLA.FORWARD_TO_IU_DAYS, complaint.forwarded_to_iu_date),
            // "Complainant must provide the details within 6 days"
            whistleblowerResponse: openClarification
                ? {
                      dueDate: toIsoDate(openClarification.responseDueDate),
                      targetDays: SLA.WB_RESPONSE_DAYS,
                      remindersSent: openClarification.reminderCount,
                      totalReminders: SLA.REMINDER_COUNT
                  }
                : null
        },
        permissions: {
            canViewIdentity: canViewIdentity(roles),
            canAcknowledge: canActAsWbc(roles) && !complaint.ack_to_wb_date && !isTerminal,
            canRequestDetails: canActAsWbc(roles) && !openClarification && !isTerminal,
            canForward: canActAsWbc(roles) && !!complaint.ack_to_wb_date && !forwarded && !isTerminal,
            canClose: canActAsWbc(roles) && !isTerminal,
            canTransfer: isAdmin(roles)
        }
    });
};

// "Acknowledgement to complainant within 4 days by WB Committee" — the first
// step after a complaint lands in the portal. Acknowledging also claims the
// complaint for the acknowledging committee member unless it is already owned.
const acknowledgeComplaint = async (req, res) => {
    const { id } = req.params;
    const ackDate = req.body.ackDate || new Date().toISOString().slice(0, 10);
    const remarks = req.body.remarks || null;

    const [existing] = await db.query(
        `SELECT c.ack_to_wb_date, c.wbc_owner_id, c.date_of_receipt, st.value_code AS statusCode
         FROM complaints c
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         WHERE c.complaint_id = ?`,
        [id]
    );

    if (!existing[0]) {
        return res.status(404).json({ message: "Complaint not found" });
    }

    if (existing[0].ack_to_wb_date) {
        return res.status(409).json({ message: "This complaint has already been acknowledged" });
    }

    if (["CLOSED", "REJECTED"].includes(existing[0].statusCode)) {
        return res.status(409).json({ message: "This complaint is closed" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        await conn.query(
            `UPDATE complaints
             SET ack_to_wb_date = ?, wbc_owner_id = COALESCE(wbc_owner_id, ?), updated_by = ?
             WHERE complaint_id = ?`,
            [ackDate, req.user.userId, req.user.userId, id]
        );

        await setComplaintStatus(conn, {
            complaintId: id,
            toCode: "UNDER_REVIEW",
            actionCode: "ACKNOWLEDGED",
            remarks,
            userId: req.user.userId
        });

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    const sla = dueStatus(existing[0].date_of_receipt, SLA.ACK_DAYS, ackDate);

    await notify({
        complaintId: id,
        templateCode: "ACK_SENT",
        recipient: await complainantRecipient(id),
        mergeData: { ackDate }
    });

    res.json({ message: "Complaint acknowledged", ackDate, remarks, sla });
};

// "Is the information sufficient to conduct an inquiry? -> N -> Write to WB to
// share additional details." Also available after the case has gone to the IU,
// where the same 6-day/3-reminder/auto-close clock applies.
const requestDetails = async (req, res) => {
    const { id } = req.params;

    const [caseRows] = await db.query("SELECT case_id FROM cases WHERE complaint_id = ?", [id]);

    const result = await requestAdditionalDetails({
        complaintId: Number(id),
        caseId: caseRows[0]?.case_id || null,
        question: req.body.question,
        userId: req.user.userId
    });

    res.status(201).json({
        message: `Additional details requested. The whistle-blower has ${SLA.WB_RESPONSE_DAYS} days to respond.`,
        ...result
    });
};

// Same action reached from the case screen, once the complaint has already
// been forwarded to the Investigation Unit. This is the second of the two
// points the procedure allows the committee to write to the whistle-blower.
const requestDetailsForCase = async (req, res) => {
    const { id } = req.params;

    const [caseRows] = await db.query("SELECT complaint_id FROM cases WHERE case_id = ?", [id]);

    if (!caseRows[0]) {
        return res.status(404).json({ message: "Case not found" });
    }

    const result = await requestAdditionalDetails({
        complaintId: caseRows[0].complaint_id,
        caseId: Number(id),
        question: req.body.question,
        userId: req.user.userId
    });

    res.status(201).json({
        message:
            `Additional details requested. The whistle-blower has ${SLA.WB_RESPONSE_DAYS} days to respond; ` +
            `${SLA.REMINDER_COUNT} reminders will be sent at ${SLA.REMINDER_INTERVAL_DAYS}-day intervals and the ` +
            `case will be closed if nothing is received.`,
        ...result
    });
};

// "Forward complaint to IU within 5 days from the date of complaint receipt."
// Opens the case, hands it to an Investigation Unit officer and starts the
// investigation record in one step — from here on the complainant's identity
// is invisible to everyone working the case on the IU side.
const forwardToInvestigationUnit = async (req, res) => {
    const { id } = req.params;
    const { investigationOfficerId, investigationUnitId, priorityId, riskCategoryId, dueDate, remarks } = req.body;

    if (!investigationOfficerId) {
        return res.status(400).json({ message: "investigationOfficerId is required" });
    }

    const [complaints] = await db.query(
        `SELECT c.complaint_id, c.date_of_receipt, c.ack_to_wb_date, st.value_code AS statusCode
         FROM complaints c
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         WHERE c.complaint_id = ?`,
        [id]
    );

    const complaint = complaints[0];

    if (!complaint) {
        return res.status(404).json({ message: "Complaint not found" });
    }

    if (["CLOSED", "REJECTED"].includes(complaint.statusCode)) {
        return res.status(409).json({ message: "This complaint is closed" });
    }

    const [existingCase] = await db.query("SELECT case_id FROM cases WHERE complaint_id = ?", [id]);

    if (existingCase.length) {
        return res.status(409).json({ message: "This complaint has already been forwarded to the Investigation Unit" });
    }

    // The officer being handed the case must actually belong to the
    // Investigation Unit — otherwise the identity firewall means nothing.
    const [officerRoles] = await db.query(
        `SELECT r.role_code FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = ? AND ur.active_flag = 1`,
        [investigationOfficerId]
    );

    if (!officerRoles.some((r) => IU_ROLES.includes(r.role_code))) {
        return res.status(400).json({ message: "The selected user is not a member of the Investigation Unit" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const assignedStatusId = await getMasterValueId("CASE_STATUS", "ASSIGNED", conn);
        const caseTypeId = await getMasterValueId("CASE_TYPE", "MANUAL", conn);
        const investigationStatusId = await getMasterValueId("INVESTIGATION_STATUS", "IN_PROGRESS", conn);
        const caseNo = await generateCaseNo(conn);

        const [result] = await conn.query(
            `INSERT INTO cases
                (case_no, complaint_id, case_type_id, priority_id, risk_category_id,
                 investigation_unit_id, investigation_officer_id, case_open_date, due_date,
                 status_id, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?)`,
            [
                caseNo,
                id,
                caseTypeId,
                priorityId || (await getMasterValueId("PRIORITY", "MEDIUM", conn)),
                riskCategoryId || (await getMasterValueId("RISK_CATEGORY", "CONDUCT", conn)),
                investigationUnitId || null,
                investigationOfficerId,
                dueDate || null,
                assignedStatusId,
                remarks || "Forwarded to the Investigation Unit",
                req.user.userId
            ]
        );

        const caseId = result.insertId;

        await conn.query(
            `INSERT INTO case_assignments
                (case_id, investigation_officer_id, investigation_due_date, assignment_remarks, assigned_by)
             VALUES (?, ?, ?, ?, ?)`,
            [caseId, investigationOfficerId, dueDate || null, remarks || null, req.user.userId]
        );

        await conn.query(
            `INSERT INTO investigations
                (case_id, investigation_number, investigation_start_date, investigation_department_id,
                 investigation_officer_id, status_id)
             VALUES (?, ?, CURDATE(), ?, ?, ?)`,
            [caseId, `IVR-${caseNo}`, investigationUnitId || null, investigationOfficerId, investigationStatusId]
        );

        await conn.query(
            `INSERT INTO case_status_history (case_id, from_status_id, to_status_id, action_code, remarks, performed_by)
             VALUES (?, NULL, ?, 'FORWARDED_TO_IU', ?, ?)`,
            [caseId, assignedStatusId, remarks || "Complaint forwarded to the Investigation Unit", req.user.userId]
        );

        await conn.query("UPDATE complaints SET forwarded_to_iu_date = CURDATE() WHERE complaint_id = ?", [id]);

        await setComplaintStatus(conn, {
            complaintId: id,
            toCode: "CONVERTED_TO_CASE",
            actionCode: "FORWARDED_TO_IU",
            remarks: `Forwarded to the Investigation Unit as case ${caseNo}`,
            userId: req.user.userId
        });

        await conn.commit();

        const [officer] = await db.query("SELECT email, username FROM users WHERE user_id = ?", [
            investigationOfficerId
        ]);

        await notify({
            caseId,
            complaintId: id,
            templateCode: "CASE_ASSIGNED",
            recipient: officer[0]?.email || officer[0]?.username || "N/A",
            mergeData: { assignedByRole: "WB Committee", dueDate: dueDate || "no due date set" }
        });

        const sla = dueStatus(complaint.date_of_receipt, SLA.FORWARD_TO_IU_DAYS, new Date());

        res.status(201).json({ caseId, caseNo, message: "Complaint forwarded to the Investigation Unit", sla });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// "There should be an option for Admin to transfer the case to any other WB
// committee person at any stage." Ownership lives on the complaint, which the
// case reads through, so one update moves the file wherever it currently sits.
const transferComplaint = async (req, res) => {
    const { id } = req.params;
    const { wbcOwnerId, remarks } = req.body;

    if (!wbcOwnerId) {
        return res.status(400).json({ message: "wbcOwnerId is required" });
    }

    const [targets] = await db.query(
        `SELECT u.user_id, u.full_name, u.email, u.username, u.status_code,
                GROUP_CONCAT(r.role_code) AS roleCodes
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.user_id AND ur.active_flag = 1
         LEFT JOIN roles r ON r.role_id = ur.role_id
         WHERE u.user_id = ?
         GROUP BY u.user_id`,
        [wbcOwnerId]
    );

    const target = targets[0];

    if (!target) {
        return res.status(404).json({ message: "Target user not found" });
    }

    if (target.status_code !== "ACTIVE") {
        return res.status(400).json({ message: "The selected user is not active" });
    }

    const targetRoles = (target.roleCodes || "").split(",").filter(Boolean);

    if (!targetRoles.some((role) => WBC_ROLES.includes(role))) {
        return res.status(400).json({ message: "The selected user is not a WB Committee member" });
    }

    const [complaints] = await db.query(
        `SELECT c.complaint_id, c.wbc_owner_id, owner.full_name AS currentOwnerName, cs.case_id
         FROM complaints c
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         LEFT JOIN cases cs ON cs.complaint_id = c.complaint_id
         WHERE c.complaint_id = ?`,
        [id]
    );

    const complaint = complaints[0];

    if (!complaint) {
        return res.status(404).json({ message: "Complaint not found" });
    }

    if (Number(complaint.wbc_owner_id) === Number(wbcOwnerId)) {
        return res.status(409).json({ message: "This complaint is already owned by that committee member" });
    }

    const note =
        `Transferred from ${complaint.currentOwnerName || "unassigned"} to ${target.full_name}` +
        (remarks ? ` — ${remarks}` : "");

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        await conn.query("UPDATE complaints SET wbc_owner_id = ?, updated_by = ? WHERE complaint_id = ?", [
            wbcOwnerId,
            req.user.userId,
            id
        ]);

        // Logged without changing the stage — a transfer moves the owner, never
        // the case's position in the procedure.
        await setComplaintStatus(conn, {
            complaintId: id,
            toCode: null,
            actionCode: "TRANSFERRED_TO_WBC_MEMBER",
            remarks: note,
            userId: req.user.userId
        });

        if (complaint.case_id) {
            await setCaseStatus(conn, {
                caseId: complaint.case_id,
                toCode: null,
                actionCode: "TRANSFERRED_TO_WBC_MEMBER",
                remarks: note,
                userId: req.user.userId
            });
        }

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    await notify({
        complaintId: id,
        caseId: complaint.case_id || null,
        templateCode: "CASE_TRANSFERRED",
        recipient: target.email || target.username,
        mergeData: { newOwner: target.full_name }
    });

    res.json({ message: note, wbcOwnerId: Number(wbcOwnerId), wbcOwnerName: target.full_name });
};

const ROUTE_UNIT_NAMES = { HR: "HR", CUSTOMER: "Customer" };
const ROUTE_RISK_CATEGORY = { HR: "CONDUCT", CUSTOMER: "OPERATIONAL" };

// Dispositions that are not the Investigation Unit path: hand the complaint to
// HR or Customer service as a lightweight departmental case, or close it
// outright with a suitable response to the whistle-blower.
const routeComplaint = async (req, res) => {
    const { id } = req.params;
    const { target } = req.body;

    if (!["HR", "CUSTOMER", "CLOSE"].includes(target)) {
        return res.status(400).json({ message: "target must be one of HR, CUSTOMER, CLOSE" });
    }

    const [complaints] = await db.query(
        `SELECT c.complaint_id, st.value_code AS statusCode
         FROM complaints c
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         WHERE c.complaint_id = ?`,
        [id]
    );

    const complaint = complaints[0];

    if (!complaint) {
        return res.status(404).json({ message: "Complaint not found" });
    }

    if (["CONVERTED_TO_CASE", "CLOSED"].includes(complaint.statusCode)) {
        return res.status(409).json({ message: "This complaint has already been routed" });
    }

    if (target === "CLOSE") {
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // "Send suitable response to WB towards the closure of complaint."
            await conn.query(
                "UPDATE complaint_clarifications SET status_code = 'CLOSED', closed_reason = 'COMPLAINT_CLOSED' WHERE complaint_id = ? AND status_code = 'OPEN'",
                [id]
            );

            await setComplaintStatus(conn, {
                complaintId: id,
                toCode: "CLOSED",
                actionCode: "CLOSED",
                remarks: req.body.remarks || null,
                userId: req.user.userId
            });

            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }

        await notify({
            complaintId: id,
            templateCode: "COMPLAINT_CLOSED",
            recipient: await complainantRecipient(id)
        });

        return res.json({ message: "Complaint closed and a response sent to the whistle-blower" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const openStatusId = await getMasterValueId("CASE_STATUS", "OPEN", conn);
        const caseTypeId = await getMasterValueId("CASE_TYPE", "MANUAL", conn);
        const priorityId = await getMasterValueId("PRIORITY", "MEDIUM", conn);
        const riskCategoryId = await getMasterValueId("RISK_CATEGORY", ROUTE_RISK_CATEGORY[target], conn);
        const org = await resolveOrgUnit(conn, { department: ROUTE_UNIT_NAMES[target] });
        const caseNo = await generateCaseNo(conn);
        const remarks = `Routed to ${ROUTE_UNIT_NAMES[target]}`;

        const [result] = await conn.query(
            `INSERT INTO cases
                (case_no, complaint_id, case_type_id, priority_id, risk_category_id,
                 investigation_unit_id, case_open_date, status_id, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?)`,
            [caseNo, id, caseTypeId, priorityId, riskCategoryId, org.departmentId, openStatusId, remarks, req.user.userId]
        );

        const caseId = result.insertId;

        await conn.query(
            `INSERT INTO case_status_history (case_id, from_status_id, to_status_id, action_code, remarks, performed_by)
             VALUES (?, NULL, ?, 'CASE_CREATED', ?, ?)`,
            [caseId, openStatusId, remarks, req.user.userId]
        );

        await setComplaintStatus(conn, {
            complaintId: id,
            toCode: "CONVERTED_TO_CASE",
            actionCode: "CASE_CREATED",
            remarks,
            userId: req.user.userId
        });

        await conn.commit();

        res.status(201).json({ caseId, caseNo, message: remarks });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

const uploadComplaintDocument = async (req, res) => {
    const { id } = req.params;

    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    const categoryId = await getMasterValueId("DOCUMENT_CATEGORY", "COMPLAINT_ATTACHMENT");
    const stored = await storeUploadedFile(req.file);

    const [result] = await db.query(
        `INSERT INTO documents
            (complaint_id, document_category_id, document_name, file_name, file_type, mime_type,
             file_size_bytes, storage_path, hash_value, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            categoryId,
            req.file.originalname,
            stored.fileName,
            path.extname(req.file.originalname).replace(".", ""),
            req.file.mimetype,
            req.file.size,
            stored.key,
            stored.sha256,
            req.user.userId
        ]
    );

    res.status(201).json({ documentId: result.insertId });
};

module.exports = {
    createComplaint,
    listComplaints,
    getComplaint,
    acknowledgeComplaint,
    requestDetails,
    requestDetailsForCase,
    forwardToInvestigationUnit,
    transferComplaint,
    routeComplaint,
    uploadComplaintDocument
};
