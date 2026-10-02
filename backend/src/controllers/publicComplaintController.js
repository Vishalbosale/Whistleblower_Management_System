const path = require("path");
const db = require("../config/db");
const {
    createComplaint: createComplaintRecord,
    verifyTrackingCredentials
} = require("../services/complaintService");
const { getMasterValueId } = require("../utils/masterLookup");
const { storeUploadedFile, sendDocument } = require("../services/fileStorage");
const { SLA, daysBetween } = require("../utils/sla");
const { recordResponse } = require("../services/clarificationService");
const { toComplainantStatus, toComplainantTimeline } = require("../services/complainantView");

const toIntOrNull = (value) => (value === undefined || value === null || value === "" ? null : Number(value));
const toBool = (value) => value === true || value === "true" || value === "1" || value === 1;
const parseJson = (value, fallback) => {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

// Submitted as multipart/form-data (the form supports an optional
// attachment). Scalar fields arrive as strings via multer; complainant/
// respondents arrive as JSON-encoded strings since FormData can't nest.
const submitComplaint = async (req, res) => {
    const body = req.body;
    const complainant = parseJson(body.complainant, {});
    const anonymityTypeId = toIntOrNull(body.anonymityTypeId);
    const anonymousTypeId = await getMasterValueId("ANONYMITY_TYPE", "ANONYMOUS");
    const isAnonymousComplaint = Number(anonymityTypeId) === Number(anonymousTypeId);

    if (!isAnonymousComplaint && !String(complainant.email || "").trim()) {
        return res.status(400).json({ message: "Email ID is required for named complaints." });
    }

    const input = {
        dateOfReceipt: body.dateOfReceipt,
        complaintReferenceId: body.complaintReferenceId || null,
        addressedToId: toIntOrNull(body.addressedToId),
        languageId: toIntOrNull(body.languageId),
        channelReference: body.channelReference || null,
        channelId: toIntOrNull(body.channelId),
        natureId: toIntOrNull(body.natureId),
        classificationId: toIntOrNull(body.classificationId),
        subClassificationId: toIntOrNull(body.subClassificationId),
        complainantTypeId: toIntOrNull(body.complainantTypeId),
        anonymityTypeId,
        complainantReferenceId: body.complainantReferenceId || null,
        description: body.description,
        severityId: toIntOrNull(body.severityId),
        declaration: toBool(body.declaration),
        complainant,
        respondents: parseJson(body.respondents, [])
    };

    const result = await createComplaintRecord(input, { forcePostbox: toBool(body.wantsPostbox) });

    if (req.file) {
        const categoryId = await getMasterValueId("DOCUMENT_CATEGORY", "COMPLAINT_ATTACHMENT");
        const stored = await storeUploadedFile(req.file);

        await db.query(
            `INSERT INTO documents
                (complaint_id, document_category_id, document_name, file_name, file_type, mime_type,
                 file_size_bytes, storage_path, hash_value)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                result.complaintId,
                categoryId,
                req.file.originalname,
                stored.fileName,
                path.extname(req.file.originalname).replace(".", ""),
                req.file.mimetype,
                req.file.size,
                stored.key,
                stored.sha256
            ]
        );
    }

    res.status(201).json({
        complaintId: result.complaintNo,
        password: result.postboxPassword
    });
};

const REASON_MESSAGES = {
    NOT_FOUND: "Invalid Complaint ID or Password",
    INVALID: "Invalid Complaint ID or Password",
    LOCKED: "Too many failed attempts. Please try again after 15 minutes."
};

const trackComplaint = async (req, res) => {
    const { complaintId, password } = req.body;

    if (!complaintId || !password) {
        return res.status(400).json({ message: "Complaint ID and Password are required" });
    }

    const result = await verifyTrackingCredentials(complaintId, password);

    if (!result.ok) {
        return res.status(401).json({ message: REASON_MESSAGES[result.reason] });
    }

    const [complaints] = await db.query(
        `SELECT st.value_code AS statusCode, c.ack_to_wb_date, cs.case_id
         FROM complaints c
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         LEFT JOIN cases cs ON cs.complaint_id = c.complaint_id
         WHERE c.complaint_id = ?`,
        [result.complaintId]
    );

    const complaint = complaints[0];

    // An open request tells the whistle-blower exactly what is being asked,
    // by when, and how many reminders have gone out — the same 6-day clock
    // the committee sees, so the deadline is never a surprise.
    const [clarifications] = await db.query(
        `SELECT clarification_id AS id, clarification_question AS question, raised_at AS raisedAt,
            response_due_date AS responseDueDate, reminder_count AS remindersSent, status_code AS statusCode,
            response_text AS responseText, responded_at AS respondedAt
         FROM complaint_clarifications
         WHERE complaint_id = ?
         ORDER BY clarification_id ASC`,
        [result.complaintId]
    );

    const current = clarifications[clarifications.length - 1] || null;
    const openClarification = current?.statusCode === "OPEN" ? current : null;
    const respondedClarification = current?.statusCode === "RESPONDED" ? current : null;

    // Only allow-listed action codes are exposed below. Clarification text is
    // read from the complainant's own request/response records, never from
    // internal status-history remarks.
    const [complaintHistory] = await db.query(
        `SELECT action_code AS action, performed_at AS at
         FROM complaint_status_history WHERE complaint_id = ?`,
        [result.complaintId]
    );

    const [caseHistory] = await db.query(
        `SELECT h.action_code AS action, h.performed_at AS at
         FROM case_status_history h
         JOIN cases cs ON cs.case_id = h.case_id
         WHERE cs.complaint_id = ?`,
        [result.complaintId]
    );

    const [responseDocuments] = await db.query(
        `SELECT d.document_id AS id, d.document_name AS name, d.file_size_bytes AS sizeBytes,
                d.uploaded_at AS uploadedAt
         FROM documents d
         JOIN master_values mv ON mv.master_value_id = d.document_category_id
         WHERE d.complaint_id = ? AND d.is_active = 1 AND mv.value_code = 'CLARIFICATION_RESPONSE'
         ORDER BY d.uploaded_at ASC`,
        [result.complaintId]
    );

    const history = [...complaintHistory, ...caseHistory].sort((a, b) => new Date(a.at) - new Date(b.at));

    res.json({
        status: toComplainantStatus({
            complaintStatusCode: complaint?.statusCode,
            acknowledged: !!complaint?.ack_to_wb_date,
            hasCase: !!complaint?.case_id,
            openClarification,
            respondedClarification
        }),
        informationRequired: openClarification
            ? {
                  id: openClarification.id,
                  question: openClarification.question,
                  raisedAt: openClarification.raisedAt,
                  responseDueDate: openClarification.responseDueDate,
                  remindersSent: openClarification.remindersSent,
                  responseDays: SLA.WB_RESPONSE_DAYS,
                  totalReminders: SLA.REMINDER_COUNT,
                  daysRemaining: daysBetween(new Date(), openClarification.responseDueDate)
              }
            : null,
        // Confirmation that their answer arrived, without saying anything about
        // what is being done with it.
        informationSubmitted: respondedClarification
            ? {
                  submittedAt: respondedClarification.respondedAt,
                  question: respondedClarification.question,
                  responseText: respondedClarification.responseText
              }
            : null,
        history: toComplainantTimeline(history, clarifications, responseDocuments)
    });
};

const downloadPublicDocument = async (req, res) => {
    const { complaintId, password, documentId } = req.body;

    if (!complaintId || !password || !documentId) {
        return res.status(400).json({ message: "Complaint ID, Password and Document ID are required" });
    }

    const result = await verifyTrackingCredentials(complaintId, password);

    if (!result.ok) {
        return res.status(401).json({ message: REASON_MESSAGES[result.reason] });
    }

    const [documents] = await db.query(
        `SELECT d.document_name AS name, d.storage_path AS storagePath, d.mime_type AS mimeType
         FROM documents d
         JOIN master_values mv ON mv.master_value_id = d.document_category_id
         WHERE d.document_id = ? AND d.complaint_id = ? AND d.is_active = 1
           AND mv.value_code = 'CLARIFICATION_RESPONSE'`,
        [documentId, result.complaintId]
    );

    const document = documents[0];

    if (!document) {
        return res.status(404).json({ message: "Document not found" });
    }

    const sent = document.storagePath
        ? await sendDocument(res, { key: document.storagePath, name: document.name, mimeType: document.mimeType })
        : false;

    if (!sent) {
        return res.status(410).json({ message: "The stored file is no longer available" });
    }
};

const respondToClarification = async (req, res) => {
    const { complaintId, password, clarificationId, responseText } = req.body;

    if (!complaintId || !password) {
        return res.status(400).json({ message: "Complaint ID and Password are required" });
    }

    const result = await verifyTrackingCredentials(complaintId, password);

    if (!result.ok) {
        return res.status(401).json({ message: REASON_MESSAGES[result.reason] });
    }

    if (!responseText || !responseText.trim()) {
        return res.status(400).json({ message: "Response text is required" });
    }

    await db.query(
        `INSERT INTO anonymous_responses (complaint_id, clarification_id, response_text)
         VALUES (?, ?, ?)`,
        [result.complaintId, clarificationId || null, responseText]
    );

    // "Additional details from WB? -> Y" — this both stops the reminder/
    // auto-close clock and returns the complaint (and its case, if it has one)
    // to the stage the request interrupted, with the WB Committee notified.
    const outcome = await recordResponse({
        complaintId: result.complaintId,
        clarificationId: clarificationId ? Number(clarificationId) : null,
        responseText
    });

    if (req.file) {
        const categoryId = await getMasterValueId("DOCUMENT_CATEGORY", "CLARIFICATION_RESPONSE");
        const stored = await storeUploadedFile(req.file);

        // case_id is carried even though access to a bare complaint never
        // extends to the Investigation Unit (complaintVisibilityFilter excludes
        // it outright) — once the committee releases this file, the IU needs a
        // case to inherit permission from, or shared_with_iu = 1 would still
        // lead nowhere. shared_with_iu = 0 until then: whatever the complainant
        // attaches is held for the WB Committee to review first.
        await db.query(
            `INSERT INTO documents
                (complaint_id, case_id, document_category_id, document_name, file_name, file_type, mime_type,
                 file_size_bytes, storage_path, hash_value, shared_with_iu)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                result.complaintId,
                outcome.caseId || null,
                categoryId,
                req.file.originalname,
                stored.fileName,
                path.extname(req.file.originalname).replace(".", ""),
                req.file.mimetype,
                req.file.size,
                stored.key,
                stored.sha256
            ]
        );
    }

    res.json({
        message: outcome.matched
            ? "Your response has been submitted and sent to the Whistle-blower Committee."
            : "Your response has been recorded."
    });
};

module.exports = { submitComplaint, trackComplaint, respondToClarification, downloadPublicDocument };
