const db = require("../config/db");
const { getMasterValueId } = require("../utils/masterLookup");
const { generateMeetingNo, generateDacReferenceNo } = require("../utils/generateIds");
const { notify, notifyRole, complainantRecipient } = require("../services/notify");
const { IU_ROLES } = require("../utils/permissions");
const { reviewProposal, forwardResponseToIu } = require("../services/clarificationService");
const {
    setCaseStatus,
    setComplaintStatus,
    assertCaseStage,
    WorkflowError
} = require("../services/workflowService");

// The WB Committee end of the procedure: taking the investigation report,
// placing it before the committee, executing the committee's decision (DAC
// proceedings or implementing its recommendations), and closing the case with
// a response to the whistle-blower.

// Where each committee recommendation sends the case next.
//
// "Recommended by WB Committee? (DAC/Other)" — Y opens disciplinary or other
// formal proceedings; N goes straight to implementing whatever the committee
// directed. Both arms converge on the closure step.
const RECOMMENDATION_ROUTING = {
    DAC: { nextStage: "DAC_REVIEW", opensDac: true, label: "Refer to the Disciplinary Action Committee" },
    OTHER_ACTION: { nextStage: "IMPLEMENTATION", opensDac: false, label: "Other proceedings / corrective action" },
    IMPLEMENT: { nextStage: "IMPLEMENTATION", opensDac: false, label: "Implement committee recommendations" },
    NO_ACTION: { nextStage: "IMPLEMENTATION", opensDac: false, label: "No further action" }
};

const loadCase = async (caseId, conn = db) => {
    const [rows] = await conn.query(
        `SELECT cs.case_id, cs.case_no, cs.complaint_id, st.value_code AS statusCode
         FROM cases cs
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         WHERE cs.case_id = ?`,
        [caseId]
    );

    if (!rows[0]) {
        throw new WorkflowError("Case not found", 404);
    }

    return rows[0];
};

const getWbcSummary = async (req, res) => {
    const { id } = req.params;

    const [meetings] = await db.query(
        `SELECT m.meeting_id AS id, m.meeting_no AS meetingNo, m.meeting_date AS meetingDate,
                m.agenda, m.decision_summary AS decisionSummary, u.full_name AS createdByName
         FROM wbc_meetings m
         LEFT JOIN users u ON u.user_id = m.created_by
         WHERE m.case_id = ?
         ORDER BY m.meeting_id DESC`,
        [id]
    );

    const [members] = await db.query(
        `SELECT mm.meeting_id AS meetingId, mm.member_role AS memberRole,
                mm.attendance_status AS attendanceStatus, u.full_name AS memberName
         FROM wbc_meeting_members mm
         JOIN users u ON u.user_id = mm.user_id
         WHERE mm.meeting_id IN (SELECT meeting_id FROM wbc_meetings WHERE case_id = ?)`,
        [id]
    );

    const [decisions] = await db.query(
        `SELECT d.wbc_decision_id AS id, d.meeting_id AS meetingId, d.action_taken AS actionTaken,
                d.dac_reference_no AS dacReferenceNo, d.decision_date AS decisionDate,
                d.decision_remarks AS decisionRemarks, rt.value_code AS recommendationCode,
                rt.value_name AS recommendationName, owner.full_name AS nextOwnerName,
                u.full_name AS createdByName
         FROM wbc_decisions d
         LEFT JOIN master_values rt ON rt.master_value_id = d.recommendation_type_id
         LEFT JOIN users owner ON owner.user_id = d.next_workflow_owner_id
         LEFT JOIN users u ON u.user_id = d.created_by
         WHERE d.case_id = ?
         ORDER BY d.wbc_decision_id DESC`,
        [id]
    );

    const [dacCases] = await db.query(
        `SELECT dc.dac_case_id AS id, dc.dac_reference_no AS referenceNo, dc.created_date AS createdDate,
                st.value_name AS statusName, chair.full_name AS chairpersonName
         FROM dac_cases dc
         LEFT JOIN master_values st ON st.master_value_id = dc.status_id
         LEFT JOIN users chair ON chair.user_id = dc.chairperson_id
         WHERE dc.case_id = ?`,
        [id]
    );

    const [closure] = await db.query(
        `SELECT c.closure_date AS closureDate, c.closure_sent_to_wb_date AS responseSentDate,
                c.closure_reason AS closureReason, c.closure_remarks AS closureRemarks,
                c.closure_communication_sent AS responseSent, u.full_name AS closedByName
         FROM case_closures c
         LEFT JOIN users u ON u.user_id = c.closed_by
         WHERE c.case_id = ?`,
        [id]
    );

    res.json({
        meetings: meetings.map((m) => ({
            ...m,
            members: members.filter((mm) => mm.meetingId === m.id)
        })),
        decisions,
        dacCase: dacCases[0] || null,
        closure: closure[0] || null
    });
};

// "Report and observations placed before WB Committee."
const placeBeforeCommittee = async (req, res) => {
    const { id } = req.params;
    const { meetingDate, agenda, memberIds = [], observations } = req.body;

    const caseRow = await loadCase(id);

    assertCaseStage(caseRow.statusCode, "PLACE_BEFORE_WBC");

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const meetingNo = await generateMeetingNo(conn);

        const [result] = await conn.query(
            `INSERT INTO wbc_meetings (meeting_no, case_id, meeting_date, agenda, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [
                meetingNo,
                id,
                meetingDate || new Date().toISOString().slice(0, 10),
                agenda || `Investigation report and observations for case ${caseRow.case_no}`,
                req.user.userId
            ]
        );

        const meetingId = result.insertId;

        for (const memberId of memberIds) {
            await conn.query(
                `INSERT INTO wbc_meeting_members (meeting_id, user_id, member_role)
                 VALUES (?, ?, 'MEMBER')
                 ON DUPLICATE KEY UPDATE attendance_status = 'PRESENT'`,
                [meetingId, memberId]
            );
        }

        // The tabling member is always on the record as present.
        await conn.query(
            `INSERT INTO wbc_meeting_members (meeting_id, user_id, member_role)
             VALUES (?, ?, 'CONVENER')
             ON DUPLICATE KEY UPDATE member_role = 'CONVENER'`,
            [meetingId, req.user.userId]
        );

        // Accepting the report for review clears the clarification flag on it.
        const acceptedStatusId = await getMasterValueId("REPORT_STATUS", "ACCEPTED", conn);

        const [latestReport] = await conn.query(
            "SELECT report_id FROM investigation_reports WHERE case_id = ? ORDER BY version_no DESC LIMIT 1",
            [id]
        );

        if (latestReport[0]) {
            await conn.query("UPDATE investigation_reports SET report_status_id = ? WHERE report_id = ?", [
                acceptedStatusId,
                latestReport[0].report_id
            ]);
        }

        await setCaseStatus(conn, {
            caseId: id,
            toCode: "WBC_REVIEW",
            actionCode: "PLACED_BEFORE_WBC",
            remarks: observations
                ? `Report and observations placed before the WB Committee (${meetingNo}) — ${observations}`
                : `Report and observations placed before the WB Committee (${meetingNo})`,
            userId: req.user.userId
        });

        await conn.commit();

        res.status(201).json({ meetingId, meetingNo, message: "Report placed before the WB Committee" });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// "Execute WB Committee decision" plus the "Recommended by WB Committee?
// (DAC/Other)" fork that follows it.
const recordDecision = async (req, res) => {
    const { id } = req.params;
    const { recommendation, actionTaken, decisionRemarks, nextWorkflowOwnerId, chairpersonId, dacMemberIds = [] } =
        req.body;

    const routing = RECOMMENDATION_ROUTING[recommendation];

    if (!routing) {
        return res.status(400).json({
            message: `recommendation must be one of ${Object.keys(RECOMMENDATION_ROUTING).join(", ")}`
        });
    }

    if (!actionTaken || !actionTaken.trim()) {
        return res.status(400).json({ message: "actionTaken is required — record what the committee decided" });
    }

    const caseRow = await loadCase(id);

    assertCaseStage(caseRow.statusCode, "WBC_DECISION");

    const [meetings] = await db.query(
        "SELECT meeting_id FROM wbc_meetings WHERE case_id = ? ORDER BY meeting_id DESC LIMIT 1",
        [id]
    );

    if (!meetings[0]) {
        return res.status(409).json({ message: "No WB Committee meeting has been recorded for this case" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        let dacReferenceNo = null;

        if (routing.opensDac) {
            dacReferenceNo = await generateDacReferenceNo(conn);

            const dacStatusId = await getMasterValueId("DAC_STATUS", "INITIATED", conn);

            const [dacResult] = await conn.query(
                `INSERT INTO dac_cases
                    (dac_reference_no, complaint_id, case_id, chairperson_id, dac_owner_id, status_id,
                     created_date, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
                [
                    dacReferenceNo,
                    caseRow.complaint_id,
                    id,
                    chairpersonId || null,
                    nextWorkflowOwnerId || null,
                    dacStatusId,
                    req.user.userId
                ]
            );

            for (const memberId of dacMemberIds) {
                await conn.query(
                    `INSERT INTO dac_members (dac_case_id, user_id, member_role) VALUES (?, ?, 'MEMBER')
                     ON DUPLICATE KEY UPDATE is_active = 1`,
                    [dacResult.insertId, memberId]
                );
            }
        }

        const recommendationTypeId = await getMasterValueId("RECOMMENDATION_TYPE", recommendation, conn);

        await conn.query(
            `INSERT INTO wbc_decisions
                (meeting_id, case_id, action_taken, dac_reference_no, recommendation_type_id,
                 decision_date, decision_remarks, next_workflow_owner_id, created_by)
             VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?, ?)`,
            [
                meetings[0].meeting_id,
                id,
                actionTaken,
                dacReferenceNo,
                recommendationTypeId,
                decisionRemarks || null,
                nextWorkflowOwnerId || null,
                req.user.userId
            ]
        );

        await conn.query("UPDATE wbc_meetings SET decision_summary = ? WHERE meeting_id = ?", [
            actionTaken,
            meetings[0].meeting_id
        ]);

        await setCaseStatus(conn, {
            caseId: id,
            toCode: routing.nextStage,
            actionCode: routing.opensDac ? "DAC_INITIATED" : "WBC_DECISION_RECORDED",
            remarks: `${routing.label}: ${actionTaken}` + (dacReferenceNo ? ` (${dacReferenceNo})` : ""),
            userId: req.user.userId
        });

        await conn.commit();

        res.status(201).json({
            message: `Committee decision recorded — ${routing.label}`,
            nextStage: routing.nextStage,
            dacReferenceNo
        });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// Conclusion of the DAC proceedings the committee referred the case to. The
// full disciplinary module (show-cause notices, respondent submissions,
// conflict checks) is out of scope here — this records the outcome that the
// case needs in order to move on to closure.
const recordDacOutcome = async (req, res) => {
    const { id } = req.params;
    const { outcome, decisionSummary, penaltyDetails } = req.body;

    if (!outcome) {
        return res.status(400).json({ message: "outcome is required" });
    }

    const caseRow = await loadCase(id);

    assertCaseStage(caseRow.statusCode, "INITIATE_DAC");

    const [dacCases] = await db.query("SELECT dac_case_id FROM dac_cases WHERE case_id = ?", [id]);

    if (!dacCases[0]) {
        return res.status(409).json({ message: "No DAC proceedings have been initiated for this case" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const outcomeId = await getMasterValueId("DAC_OUTCOME", outcome, conn);

        if (!outcomeId) {
            throw new WorkflowError(`Unknown DAC outcome "${outcome}"`, 400);
        }

        await conn.query(
            `INSERT INTO dac_decisions
                (dac_case_id, decision_date, outcome_id, decision_notes, penalty_details, created_by)
             VALUES (?, CURDATE(), ?, ?, ?, ?)`,
            [dacCases[0].dac_case_id, outcomeId, decisionSummary || null, penaltyDetails || null, req.user.userId]
        );

        const concludedStatusId = await getMasterValueId("DAC_STATUS", "CONCLUDED", conn);

        await conn.query("UPDATE dac_cases SET status_id = ? WHERE dac_case_id = ?", [
            concludedStatusId,
            dacCases[0].dac_case_id
        ]);

        await setCaseStatus(conn, {
            caseId: id,
            toCode: "IMPLEMENTATION",
            actionCode: "DAC_CONCLUDED",
            remarks: decisionSummary || `DAC proceedings concluded — ${outcome}`,
            userId: req.user.userId
        });

        await conn.commit();

        res.status(201).json({ message: "DAC outcome recorded", nextStage: "IMPLEMENTATION" });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// "Implement committee recommendations" — logged against the case without
// moving it, so several implementation steps can be recorded before closure.
const recordImplementation = async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;

    if (!notes || !notes.trim()) {
        return res.status(400).json({ message: "notes are required" });
    }

    const caseRow = await loadCase(id);

    assertCaseStage(caseRow.statusCode, "IMPLEMENT");

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        await setCaseStatus(conn, {
            caseId: id,
            toCode: null,
            actionCode: "RECOMMENDATION_IMPLEMENTED",
            remarks: notes,
            userId: req.user.userId
        });

        await conn.commit();

        res.status(201).json({ message: "Implementation recorded" });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// "Send suitable response to WB towards the closure of complaint. Case Closure."
const closeCase = async (req, res) => {
    const { id } = req.params;
    const { closureReason, responseToWhistleblower, remarks } = req.body;

    if (!closureReason || !closureReason.trim()) {
        return res.status(400).json({ message: "closureReason is required" });
    }

    if (!responseToWhistleblower || !responseToWhistleblower.trim()) {
        return res
            .status(400)
            .json({ message: "A response to the whistle-blower is required before the case can be closed" });
    }

    const caseRow = await loadCase(id);

    if (caseRow.statusCode === "CLOSED") {
        return res.status(409).json({ message: "This case is already closed" });
    }

    assertCaseStage(caseRow.statusCode, "CLOSE");

    const [meetings] = await db.query(
        "SELECT meeting_no, meeting_date FROM wbc_meetings WHERE case_id = ? ORDER BY meeting_id DESC LIMIT 1",
        [id]
    );

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        await conn.query(
            `INSERT INTO case_closures
                (case_id, status_code, closure_date, closure_sent_to_wb_date, closed_wbc_meeting_no,
                 closed_wbc_meeting_date, closure_reason, closure_remarks, closure_communication_sent, closed_by)
             VALUES (?, 'CLOSED', CURDATE(), CURDATE(), ?, ?, ?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE
                closure_date = VALUES(closure_date),
                closure_sent_to_wb_date = VALUES(closure_sent_to_wb_date),
                closure_reason = VALUES(closure_reason),
                closure_remarks = VALUES(closure_remarks),
                closure_communication_sent = 1,
                closed_by = VALUES(closed_by)`,
            [
                id,
                meetings[0]?.meeting_no || null,
                meetings[0]?.meeting_date || null,
                closureReason,
                remarks || responseToWhistleblower,
                req.user.userId
            ]
        );

        // Any details request still hanging over the complaint is moot now.
        await conn.query(
            "UPDATE complaint_clarifications SET status_code = 'CLOSED', closed_reason = 'CASE_CLOSED' WHERE complaint_id = ? AND status_code = 'OPEN'",
            [caseRow.complaint_id]
        );

        await setCaseStatus(conn, {
            caseId: id,
            toCode: "CLOSED",
            actionCode: "CASE_CLOSED",
            remarks: closureReason,
            userId: req.user.userId
        });

        await setComplaintStatus(conn, {
            complaintId: caseRow.complaint_id,
            toCode: "CLOSED",
            actionCode: "CLOSED",
            remarks: responseToWhistleblower,
            userId: req.user.userId
        });

        const investigationDoneId = await getMasterValueId("INVESTIGATION_STATUS", "COMPLETED", conn);

        await conn.query(
            "UPDATE investigations SET status_id = ?, investigation_completion_date = CURDATE() WHERE case_id = ?",
            [investigationDoneId, id]
        );

        await conn.commit();

        await notify({
            complaintId: caseRow.complaint_id,
            caseId: id,
            templateCode: "CASE_CLOSED_RESPONSE",
            recipient: await complainantRecipient(caseRow.complaint_id),
            mergeData: { response: responseToWhistleblower }
        });

        await notifyRole({
            roleCodes: IU_ROLES,
            caseId: id,
            complaintId: caseRow.complaint_id,
            templateCode: "CASE_CLOSED_RESPONSE"
        });

        res.json({ message: "Case closed and a response sent to the whistle-blower" });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// The committee's answer to an Investigation Unit request for more information
// from the whistle-blower: forward it (starting the 6-day clock, optionally
// reworded) or decline it with a reason.
const reviewDetailsProposal = async (req, res) => {
    const { clarificationId } = req.params;
    const { approve, question, remarks } = req.body;

    if (typeof approve !== "boolean") {
        return res.status(400).json({ message: "approve must be true or false" });
    }

    const [owned] = await db.query(
        "SELECT clarification_id FROM complaint_clarifications WHERE clarification_id = ? AND case_id = ?",
        [clarificationId, req.params.id]
    );

    if (!owned.length) {
        return res.status(404).json({ message: "No pending Investigation Unit request found on this case" });
    }

    const result = await reviewProposal({
        clarificationId: Number(clarificationId),
        approve,
        question,
        remarks,
        userId: req.user.userId
    });

    res.json({
        message: result.forwarded
            ? `Request forwarded to the whistle-blower. Response due ${result.dueDate}.`
            : "Request declined and the Investigation Unit notified.",
        ...result
    });
};

// The committee passing the complainant's answer on to the Investigation Unit.
// This is the only route by which the complainant's response reaches the IU.
const forwardResponse = async (req, res) => {
    const { clarificationId } = req.params;

    const [owned] = await db.query(
        "SELECT clarification_id FROM complaint_clarifications WHERE clarification_id = ? AND case_id = ?",
        [clarificationId, req.params.id]
    );

    if (!owned.length) {
        return res.status(404).json({ message: "No response awaiting forwarding on this case" });
    }

    const result = await forwardResponseToIu({
        clarificationId: Number(clarificationId),
        sharedText: req.body.sharedText,
        userId: req.user.userId
    });

    res.json({ message: "Response forwarded to the Investigation Unit.", ...result });
};

module.exports = {
    RECOMMENDATION_ROUTING,
    getWbcSummary,
    reviewDetailsProposal,
    forwardResponse,
    placeBeforeCommittee,
    recordDecision,
    recordDacOutcome,
    recordImplementation,
    closeCase
};
