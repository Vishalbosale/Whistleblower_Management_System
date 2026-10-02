const db = require("../config/db");
const { getMasterValueId } = require("../utils/masterLookup");

// The complaint-handling procedure as a state machine. Every stage change in
// the system goes through setComplaintStatus/setCaseStatus so that the status
// column and the *_status_history audit trail can never disagree, and so the
// legal transitions live in one readable table rather than being scattered
// across controllers.

// --- Complaint stage (owned by the WB Committee, before the IU is involved) --
const COMPLAINT_STAGES = {
    RECEIVED: "Received",
    UNDER_REVIEW: "Acknowledged / under review",
    INFO_REQUESTED: "Additional details requested from whistle-blower",
    CONVERTED_TO_CASE: "Forwarded to Investigation Unit",
    CLOSED: "Closed"
};

// --- Case stage (post-forwarding) -------------------------------------------
const CASE_STAGES = {
    OPEN: "Open",
    ASSIGNED: "Assigned to Investigation Unit",
    UNDER_INVESTIGATION: "Under investigation",
    INFO_REQUESTED: "Awaiting additional details from whistle-blower",
    IVR_SUBMITTED: "Investigation report submitted",
    IVR_CLARIFICATION: "Clarification sought on investigation report",
    WBC_REVIEW: "Report placed before WB Committee",
    DAC_REVIEW: "DAC proceedings initiated",
    IMPLEMENTATION: "Implementing committee recommendations",
    CLOSED: "Closed"
};

// Which case stages accept which action. Guarding here means an out-of-order
// request (a stale browser tab, a replayed call) is rejected with a clear
// message instead of corrupting the trail.
const CASE_ACTION_PRECONDITIONS = {
    SUBMIT_IVR: ["ASSIGNED", "UNDER_INVESTIGATION", "IVR_CLARIFICATION", "INFO_REQUESTED"],
    SEEK_IVR_CLARIFICATION: ["IVR_SUBMITTED", "WBC_REVIEW"],
    // Allowed again from WBC_REVIEW (not just the initial IVR_SUBMITTED) so the
    // committee can table the report over several sittings — each call logs
    // its own meeting and history entry. It stops being available the moment
    // WBC_DECISION runs, since that moves the case out of WBC_REVIEW.
    PLACE_BEFORE_WBC: ["IVR_SUBMITTED", "WBC_REVIEW"],
    WBC_DECISION: ["WBC_REVIEW"],
    INITIATE_DAC: ["DAC_REVIEW"],
    IMPLEMENT: ["IMPLEMENTATION"],
    REQUEST_DETAILS: ["OPEN", "ASSIGNED", "UNDER_INVESTIGATION", "IVR_SUBMITTED", "WBC_REVIEW", "IVR_CLARIFICATION"],
    CLOSE: ["DAC_REVIEW", "IMPLEMENTATION", "WBC_REVIEW", "INFO_REQUESTED", "OPEN", "ASSIGNED", "UNDER_INVESTIGATION"]
};

// Timeline entries the Investigation Unit does not see.
//
// The IU is an internal party, so this is not confidentiality in the same sense
// as the complainant's view — it is scope. An investigator is shown the case
// they were given and the traffic between them and the committee; the
// committee's own deliberation, the disciplinary proceedings that follow, and
// who is handling the file on the committee side are not theirs to read.
//
// DETAILS_REQUESTED and DETAILS_RECEIVED are hidden because the IU sees the
// committee-forwarded version (DETAILS_SHARED_WITH_IU) instead — the raw
// exchange with the complainant is not routed to them.
const IU_HIDDEN_ACTIONS = [
    "PLACED_BEFORE_WBC",
    "WBC_DECISION_RECORDED",
    "DAC_INITIATED",
    "DAC_CONCLUDED",
    "RECOMMENDATION_IMPLEMENTED",
    "TRANSFERRED_TO_WBC_MEMBER",
    "DETAILS_REQUESTED",
    "DETAILS_RECEIVED"
];

// Remarks are free text, so an entry is shown to the IU only when an IU user
// wrote it — a committee member's note is internal deliberation.
const isVisibleToIu = (entry) => {
    if (IU_HIDDEN_ACTIONS.includes(entry.action_code)) {
        return false;
    }

    if (entry.action_code === "REMARK_ADDED") {
        return !!entry.performedByIu;
    }

    return true;
};

class WorkflowError extends Error {
    constructor(message, status = 409) {
        super(message);
        this.status = status;
    }
}

const assertCaseStage = (currentCode, action) => {
    const allowed = CASE_ACTION_PRECONDITIONS[action];

    if (!allowed) {
        return;
    }

    if (!allowed.includes(currentCode)) {
        throw new WorkflowError(
            `This action is not available while the case is "${CASE_STAGES[currentCode] || currentCode}".`
        );
    }
};

// Moves a complaint to `toCode` and records the hop. Returns the new status id.
// `toCode` may be null to log an action that annotates the complaint without
// moving it along the procedure — a transfer of ownership, say.
const setComplaintStatus = async (conn, { complaintId, toCode, actionCode, remarks = null, userId = null }) => {
    const [rows] = await conn.query("SELECT current_status_id FROM complaints WHERE complaint_id = ?", [complaintId]);

    if (!rows[0]) {
        throw new WorkflowError("Complaint not found", 404);
    }

    const fromStatusId = rows[0].current_status_id;
    const toStatusId = toCode ? await getMasterValueId("COMPLAINT_STATUS", toCode, conn) : fromStatusId;

    if (!toStatusId) {
        throw new WorkflowError(`Unknown complaint status "${toCode}"`, 500);
    }

    if (toCode) {
        await conn.query("UPDATE complaints SET current_status_id = ?, updated_by = ? WHERE complaint_id = ?", [
            toStatusId,
            userId,
            complaintId
        ]);
    }

    await conn.query(
        `INSERT INTO complaint_status_history (complaint_id, from_status_id, to_status_id, action_code, remarks, performed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [complaintId, fromStatusId, toStatusId, actionCode, remarks, userId]
    );

    return toStatusId;
};

// Same for a case. `toCode` may be null to log an action that annotates the
// case without moving it (a remark, a reminder, an implementation note).
const setCaseStatus = async (conn, { caseId, toCode, actionCode, remarks = null, userId = null }) => {
    const [rows] = await conn.query("SELECT status_id FROM cases WHERE case_id = ?", [caseId]);

    if (!rows[0]) {
        throw new WorkflowError("Case not found", 404);
    }

    const fromStatusId = rows[0].status_id;
    const toStatusId = toCode ? await getMasterValueId("CASE_STATUS", toCode, conn) : fromStatusId;

    if (!toStatusId) {
        throw new WorkflowError(`Unknown case status "${toCode}"`, 500);
    }

    if (toCode) {
        await conn.query("UPDATE cases SET status_id = ?, updated_by = ? WHERE case_id = ?", [
            toStatusId,
            userId,
            caseId
        ]);
    }

    await conn.query(
        `INSERT INTO case_status_history (case_id, from_status_id, to_status_id, action_code, remarks, performed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [caseId, fromStatusId, toStatusId, actionCode, remarks, userId]
    );

    return toStatusId;
};

// Full workflow context for one complaint: its case (if forwarded), the open
// additional-details request (if any), and the current stage codes. Controllers
// lean on this so each one doesn't re-derive the same joins.
const loadContext = async (conn, { complaintId = null, caseId = null }) => {
    const [rows] = await conn.query(
        `SELECT c.complaint_id, c.complaint_no, c.date_of_receipt, c.ack_to_wb_date,
                c.forwarded_to_iu_date, c.wbc_owner_id,
                cst.value_code AS complaintStatusCode, cst.value_name AS complaintStatusName,
                cs.case_id, cs.case_no, cs.investigation_officer_id, cs.due_date,
                kst.value_code AS caseStatusCode, kst.value_name AS caseStatusName
         FROM complaints c
         LEFT JOIN master_values cst ON cst.master_value_id = c.current_status_id
         LEFT JOIN cases cs ON cs.complaint_id = c.complaint_id
         LEFT JOIN master_values kst ON kst.master_value_id = cs.status_id
         WHERE ${caseId ? "cs.case_id = ?" : "c.complaint_id = ?"}
         LIMIT 1`,
        [caseId || complaintId]
    );

    const context = rows[0];

    if (!context) {
        throw new WorkflowError(caseId ? "Case not found" : "Complaint not found", 404);
    }

    const [clarifications] = await conn.query(
        `SELECT * FROM complaint_clarifications
         WHERE complaint_id = ? AND status_code = 'OPEN'
         ORDER BY clarification_id DESC LIMIT 1`,
        [context.complaint_id]
    );

    context.openClarification = clarifications[0] || null;

    return context;
};

module.exports = {
    COMPLAINT_STAGES,
    CASE_STAGES,
    CASE_ACTION_PRECONDITIONS,
    WorkflowError,
    IU_HIDDEN_ACTIONS,
    isVisibleToIu,
    assertCaseStage,
    setComplaintStatus,
    setCaseStatus,
    loadContext
};
