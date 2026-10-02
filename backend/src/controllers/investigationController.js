const path = require("path");
const db = require("../config/db");
const { getMasterValueId } = require("../utils/masterLookup");
const { storeUploadedFile } = require("../services/fileStorage");
const { notify, notifyRole } = require("../services/notify");
const { WBC_ROLES, IU_ROLES, isInvestigationUnit } = require("../utils/permissions");
const { setCaseStatus, assertCaseStage, WorkflowError } = require("../services/workflowService");
const { proposeAdditionalDetails } = require("../services/clarificationService");

// "Submission of IVR by IU" and the clarification loop that follows it
// ("Clarification required for IVR submitted? -> Y -> back to the IU").
//
// Each round trip produces a new investigation_reports row rather than editing
// the last one, so the committee can see exactly what was submitted, what was
// queried, and what came back.

const loadCaseStage = async (caseId, conn = db) => {
    const [rows] = await conn.query(
        `SELECT cs.case_id, cs.case_no, cs.complaint_id, cs.investigation_officer_id,
                st.value_code AS statusCode, inv.investigation_id
         FROM cases cs
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         LEFT JOIN investigations inv ON inv.case_id = cs.case_id
         WHERE cs.case_id = ?`,
        [caseId]
    );

    if (!rows[0]) {
        throw new WorkflowError("Case not found", 404);
    }

    return rows[0];
};

// Creates the investigations row for cases that reached the IU by a route that
// didn't open one (the legacy manual case-creation path).
const ensureInvestigation = async (conn, caseRow) => {
    if (caseRow.investigation_id) {
        return caseRow.investigation_id;
    }

    const statusId = await getMasterValueId("INVESTIGATION_STATUS", "IN_PROGRESS", conn);

    const [result] = await conn.query(
        `INSERT INTO investigations
            (case_id, investigation_number, investigation_start_date, investigation_officer_id, status_id)
         VALUES (?, ?, CURDATE(), ?, ?)`,
        [caseRow.case_id, `IVR-${caseRow.case_no}`, caseRow.investigation_officer_id, statusId]
    );

    return result.insertId;
};

const getInvestigation = async (req, res) => {
    const { id } = req.params;

    const [investigations] = await db.query(
        `SELECT inv.*, st.value_name AS statusName, u.full_name AS investigationOfficerName,
                d.department_name AS investigationUnit
         FROM investigations inv
         LEFT JOIN master_values st ON st.master_value_id = inv.status_id
         LEFT JOIN users u ON u.user_id = inv.investigation_officer_id
         LEFT JOIN departments d ON d.department_id = inv.investigation_department_id
         WHERE inv.case_id = ?`,
        [id]
    );

    const [reports] = await db.query(
        `SELECT r.report_id AS id, r.report_number AS reportNumber, r.version_no AS versionNo,
                r.submission_date AS submissionDate, r.findings, r.root_cause AS rootCause,
                r.evidence_summary AS evidenceSummary, r.recommendation, r.conclusion,
                r.clarification_response AS clarificationResponse,
                rs.value_code AS statusCode, rs.value_name AS statusName,
                u.full_name AS submittedByName
         FROM investigation_reports r
         LEFT JOIN master_values rs ON rs.master_value_id = r.report_status_id
         LEFT JOIN users u ON u.user_id = r.submitted_by
         WHERE r.case_id = ?
         ORDER BY r.version_no DESC`,
        [id]
    );

    // Supporting documents, grouped onto the report version they were filed
    // with so a resubmission's evidence is distinguishable from the original's.
    const [reportDocuments] = await db.query(
        `SELECT d.document_id AS id, d.investigation_report_id AS reportId, d.document_name AS name,
                d.file_type AS fileType, d.file_size_bytes AS sizeBytes, d.uploaded_at AS uploadedAt,
                cat.value_name AS category, u.full_name AS uploadedByName
         FROM documents d
         LEFT JOIN master_values cat ON cat.master_value_id = d.document_category_id
         LEFT JOIN users u ON u.user_id = d.uploaded_by
         WHERE d.case_id = ? AND d.is_active = 1
           AND (d.shared_with_iu = 1 OR ? = 0)
         ORDER BY d.document_id DESC`,
        [id, isInvestigationUnit(req.user.roles) ? 1 : 0]
    );

    for (const report of reports) {
        report.documents = reportDocuments.filter((d) => Number(d.reportId) === Number(report.id));
    }

    const [clarifications] = await db.query(
        `SELECT c.investigation_clarification_id AS id, c.investigation_report_id AS reportId,
                c.clarification_details AS details, c.raised_date AS raisedDate,
                c.response_due_date AS responseDueDate, c.investigator_response AS response,
                c.response_date AS responseDate, c.status_code AS statusCode,
                ru.full_name AS raisedByName, du.full_name AS respondedByName
         FROM investigation_clarifications c
         LEFT JOIN users ru ON ru.user_id = c.raised_by
         LEFT JOIN users du ON du.user_id = c.responded_by
         WHERE c.investigation_report_id IN (SELECT report_id FROM investigation_reports WHERE case_id = ?)
         ORDER BY c.investigation_clarification_id DESC`,
        [id]
    );

    res.json({
        investigation: investigations[0] || null,
        reports,
        // reportDocuments above is already scoped to what this caller may see —
        // shared_with_iu = 1, or everything for anyone other than the IU.
        documents: reportDocuments,
        clarifications,
        openClarification: clarifications.find((c) => c.statusCode === "OPEN") || null
    });
};

// Files attached to a report submission. Written after the report row exists so
// each document is tied to the version it was filed with; a failure here leaves
// the report intact rather than losing the whole submission.
const attachReportDocuments = async (files, { caseId, complaintId, reportId, userId, category }) => {
    const categoryId = await getMasterValueId("DOCUMENT_CATEGORY", category || "INVESTIGATION_REPORT");
    const attached = [];

    for (const file of files) {
        const stored = await storeUploadedFile(file);

        const [result] = await db.query(
            `INSERT INTO documents
                (complaint_id, case_id, investigation_report_id, document_category_id, document_name,
                 file_name, file_type, mime_type, file_size_bytes, storage_path, hash_value, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                complaintId,
                caseId,
                reportId,
                categoryId,
                file.originalname,
                stored.fileName,
                path.extname(file.originalname).replace(".", ""),
                file.mimetype,
                file.size,
                stored.key,
                stored.sha256,
                userId
            ]
        );

        attached.push({ documentId: result.insertId, name: file.originalname });
    }

    return attached;
};

// "Submission of IVR by IU". Also the return leg of the clarification loop —
// when an open clarification exists, submitting closes it and files the answer
// alongside the new version of the report.
const submitReport = async (req, res) => {
    const { id } = req.params;
    const { findings, rootCause, evidenceSummary, recommendation, conclusion, clarificationResponse } = req.body;

    if (!findings || !findings.trim()) {
        return res.status(400).json({ message: "Findings are required" });
    }

    if (!conclusion || !conclusion.trim()) {
        return res.status(400).json({ message: "A conclusion is required" });
    }

    const caseRow = await loadCaseStage(id);

    assertCaseStage(caseRow.statusCode, "SUBMIT_IVR");

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const investigationId = await ensureInvestigation(conn, caseRow);
        const submittedStatusId = await getMasterValueId("REPORT_STATUS", "SUBMITTED", conn);

        const [versionRows] = await conn.query(
            "SELECT COALESCE(MAX(version_no), 0) AS maxVersion FROM investigation_reports WHERE case_id = ?",
            [id]
        );

        const versionNo = Number(versionRows[0].maxVersion) + 1;

        const [result] = await conn.query(
            `INSERT INTO investigation_reports
                (case_id, investigation_id, report_number, version_no, submission_date, findings,
                 root_cause, evidence_summary, recommendation, conclusion, clarification_response,
                 report_status_id, submitted_by)
             VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                investigationId,
                `IVR-${caseRow.case_no}-V${versionNo}`,
                versionNo,
                findings,
                rootCause || null,
                evidenceSummary || null,
                recommendation || null,
                conclusion,
                clarificationResponse || null,
                submittedStatusId,
                req.user.userId
            ]
        );

        // Close whatever the committee had queried, recording the answer.
        await conn.query(
            `UPDATE investigation_clarifications
             SET investigator_response = COALESCE(?, investigator_response), response_date = CURDATE(),
                 responded_by = ?, status_code = 'CLOSED'
             WHERE status_code = 'OPEN'
               AND investigation_report_id IN (SELECT report_id FROM investigation_reports WHERE case_id = ?)`,
            [clarificationResponse || null, req.user.userId, id]
        );

        const isResubmission = versionNo > 1;

        await setCaseStatus(conn, {
            caseId: id,
            toCode: "IVR_SUBMITTED",
            actionCode: isResubmission ? "IVR_RESUBMITTED" : "IVR_SUBMITTED",
            remarks: `Investigation report ${isResubmission ? `v${versionNo} re-submitted` : "submitted"} by the Investigation Unit`,
            userId: req.user.userId
        });

        await conn.commit();

        // The form posts the report and its supporting documents together, so
        // the investigator files evidence in the same action as the findings.
        const attachments = req.files?.length
            ? await attachReportDocuments(req.files, {
                  caseId: id,
                  complaintId: caseRow.complaint_id,
                  reportId: result.insertId,
                  userId: req.user.userId,
                  category: req.body.documentCategory
              })
            : [];

        await notifyRole({
            roleCodes: WBC_ROLES,
            caseId: id,
            complaintId: caseRow.complaint_id,
            templateCode: "IVR_SUBMITTED",
            mergeData: { versionNo, submittedByRole: "Investigation Unit" }
        });

        res.status(201).json({
            reportId: result.insertId,
            versionNo,
            attachments,
            message: `Investigation report submitted${attachments.length ? ` with ${attachments.length} document(s)` : ""}`
        });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// "Clarification required for IVR submitted? -> Y" — the WB Committee sends the
// report back to the Investigation Unit. Appears at both decision diamonds in
// the procedure: straight after submission, and again after the report and
// observations have been placed before the committee.
const seekClarification = async (req, res) => {
    const { id } = req.params;
    const { details, responseDueDate } = req.body;

    if (!details || !details.trim()) {
        return res.status(400).json({ message: "Clarification details are required" });
    }

    const caseRow = await loadCaseStage(id);

    assertCaseStage(caseRow.statusCode, "SEEK_IVR_CLARIFICATION");

    const [reports] = await db.query(
        "SELECT report_id FROM investigation_reports WHERE case_id = ? ORDER BY version_no DESC LIMIT 1",
        [id]
    );

    if (!reports[0]) {
        return res.status(409).json({ message: "No investigation report has been submitted for this case yet" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        await conn.query(
            `INSERT INTO investigation_clarifications
                (investigation_report_id, clarification_required, clarification_details, raised_date,
                 response_due_date, raised_by, status_code)
             VALUES (?, 1, ?, CURDATE(), ?, ?, 'OPEN')`,
            [reports[0].report_id, details, responseDueDate || null, req.user.userId]
        );

        const clarificationStatusId = await getMasterValueId("REPORT_STATUS", "CLARIFICATION_SOUGHT", conn);

        await conn.query("UPDATE investigation_reports SET report_status_id = ? WHERE report_id = ?", [
            clarificationStatusId,
            reports[0].report_id
        ]);

        await setCaseStatus(conn, {
            caseId: id,
            toCode: "IVR_CLARIFICATION",
            actionCode: "IVR_CLARIFICATION_SOUGHT",
            remarks: details,
            userId: req.user.userId
        });

        await conn.commit();

        await notifyRole({
            roleCodes: IU_ROLES,
            caseId: id,
            complaintId: caseRow.complaint_id,
            templateCode: "IVR_CLARIFICATION_SOUGHT"
        });

        res.status(201).json({ message: "Clarification sought from the Investigation Unit" });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// Attach evidence to the investigation outside a report submission — an
// exhibit that arrives later, the signed copy of a report already filed.
const uploadInvestigationDocument = async (req, res) => {
    const { id } = req.params;
    const files = req.files?.length ? req.files : req.file ? [req.file] : [];

    if (!files.length) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    const caseRow = await loadCaseStage(id);

    let reportId = req.body.reportId ? Number(req.body.reportId) : null;

    if (reportId) {
        const [owned] = await db.query(
            "SELECT report_id FROM investigation_reports WHERE report_id = ? AND case_id = ?",
            [reportId, id]
        );

        if (!owned.length) {
            return res.status(400).json({ message: "That report does not belong to this case" });
        }
    } else {
        // Default to the current report version so the file lands somewhere
        // meaningful rather than floating loose on the case.
        const [latest] = await db.query(
            "SELECT report_id FROM investigation_reports WHERE case_id = ? ORDER BY version_no DESC LIMIT 1",
            [id]
        );

        reportId = latest[0]?.report_id || null;
    }

    const attached = await attachReportDocuments(files, {
        caseId: id,
        complaintId: caseRow.complaint_id,
        reportId,
        userId: req.user.userId,
        category: req.body.category
    });

    res.status(201).json({ attachments: attached, documentId: attached[0]?.documentId });
};

// The Investigation Unit asking the WB Committee to obtain more from the
// whistle-blower. The IU never contacts the complainant directly — it does not
// know who they are, and the committee is the only channel.
const proposeDetailsRequest = async (req, res) => {
    const { id } = req.params;

    const result = await proposeAdditionalDetails({
        caseId: Number(id),
        question: req.body.question,
        userId: req.user.userId
    });

    res.status(201).json({
        message: "Sent to the WB Committee. They will forward it to the whistle-blower or decline it.",
        ...result
    });
};

module.exports = {
    getInvestigation,
    submitReport,
    seekClarification,
    uploadInvestigationDocument,
    proposeDetailsRequest
};
