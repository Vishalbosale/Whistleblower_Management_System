const db = require("../config/db");

const applyMergeFields = (text, mergeData) =>
    (text || "").replace(/{{\s*(\w+)\s*}}/g, (match, key) =>
        mergeData[key] !== undefined && mergeData[key] !== null ? mergeData[key] : match
    );

// Free text (a clarification question, a remark) goes into a notification
// merge field as-is from whoever typed it — capped so one long request
// doesn't blow out a subject/message line the recipient is meant to be able
// to act on without opening the case.
const truncate = (text, max = 140) => {
    if (!text) return text;
    const trimmed = text.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
};

// Phase 1 = log-only notifications: writes a row to notification_history
// so the fact a notification "happened" is auditable in-app. Real SMTP
// sending is a Phase 4 integration item — this function is the single
// place that will need to change when that lands.
//
// `mergeData` supplements the complaint/case numbers looked up here, for
// templates that quote a due date, a reminder number, a decision, etc.
const notify = async ({
    complaintId = null,
    caseId = null,
    templateCode,
    recipient,
    mergeData = {},
    notificationType = "IN_APP"
}) => {
    const [templates] = await db.query(
        "SELECT template_id, subject, template_body FROM notification_templates WHERE template_code = ? AND active_flag = 1",
        [templateCode]
    );

    const template = templates[0] || null;
    const merged = { ...mergeData };

    if (complaintId) {
        const [rows] = await db.query("SELECT complaint_no FROM complaints WHERE complaint_id = ?", [complaintId]);
        merged.complaintNo = merged.complaintNo || rows[0]?.complaint_no || "";
    }

    if (caseId) {
        const [rows] = await db.query("SELECT case_no FROM cases WHERE case_id = ?", [caseId]);
        merged.caseNo = merged.caseNo || rows[0]?.case_no || "";
    }

    const subject = template ? applyMergeFields(template.subject, merged) : templateCode;
    const message = template ? applyMergeFields(template.template_body, merged) : null;

    await db.query(
        `INSERT INTO notification_history
            (complaint_id, case_id, template_id, notification_type, recipient, subject, message, sent_datetime, delivery_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'SENT')`,
        [
            complaintId,
            caseId,
            template ? template.template_id : null,
            notificationType,
            recipient || "N/A",
            subject,
            message
        ]
    );
};

// Where a message to the whistle-blower goes. Anonymous complainants have no
// email address — for them the "delivery" is the post box on the public
// portal, which is what they log into to read updates and respond.
const complainantRecipient = async (complaintId) => {
    const [rows] = await db.query(
        `SELECT c.complaint_no, comp.is_anonymous, comp.email_id
         FROM complaints c
         LEFT JOIN complainants comp ON comp.complaint_id = c.complaint_id
         WHERE c.complaint_id = ?`,
        [complaintId]
    );

    const row = rows[0];

    if (!row) {
        return "unknown";
    }

    if (!row.is_anonymous && row.email_id) {
        return row.email_id;
    }

    return `postbox:${row.complaint_no}`;
};

// Fan-out to every active holder of a role — used to alert "the WB Committee"
// or "the Investigation Unit" rather than one named person.
const notifyRole = async ({ roleCodes, ...rest }) => {
    const [users] = await db.query(
        `SELECT DISTINCT u.email, u.username
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id AND ur.active_flag = 1
         JOIN roles r ON r.role_id = ur.role_id
         WHERE r.role_code IN (?) AND u.status_code = 'ACTIVE'`,
        [roleCodes]
    );

    for (const user of users) {
        await notify({ ...rest, recipient: user.email || user.username });
    }
};

module.exports = { notify, notifyRole, complainantRecipient, truncate };
