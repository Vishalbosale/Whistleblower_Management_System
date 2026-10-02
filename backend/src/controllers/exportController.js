const PDFDocument = require("pdfkit");
const db = require("../config/db");

// "Export full case journey (complaint details, referrals, remarks,
// attachments list, status history, timeline) to PDF" — Admin only, so this
// runs unmasked: no identity firewall, no IU-visibility filtering. It queries
// independently of caseController.getCase rather than reusing it, because
// that function's payload is shaped by role-based masking/filtering that
// simply does not apply here.
const H1 = 16;
const H2 = 12;
const BODY = 10;

const section = (doc, title) => {
    doc.moveDown(0.8).fontSize(H2).fillColor("#111827").text(title, { underline: true });
    doc.moveDown(0.2).fontSize(BODY).fillColor("#111827");
};

const kv = (doc, label, value) => {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value ?? "—");
};

const fmt = (value) => (value ? new Date(value).toLocaleString() : "—");

const exportCaseJourney = async (req, res) => {
    const { id } = req.params;

    const [cases] = await db.query(
        `SELECT cs.*, c.complaint_no AS complaintNo, c.complaint_description AS complaintDescription,
                c.date_of_receipt AS dateOfReceipt,
                owner.full_name AS wbcOwnerName, ct.value_name AS caseType, pr.value_name AS priority,
                rc.value_name AS riskCategory, st.value_name AS status,
                io.full_name AS investigationOfficerName
         FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         LEFT JOIN master_values ct ON ct.master_value_id = cs.case_type_id
         LEFT JOIN master_values pr ON pr.master_value_id = cs.priority_id
         LEFT JOIN master_values rc ON rc.master_value_id = cs.risk_category_id
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         LEFT JOIN users io ON io.user_id = cs.investigation_officer_id
         WHERE cs.case_id = ?`,
        [id]
    );

    const caseRow = cases[0];

    if (!caseRow) {
        return res.status(404).json({ message: "Case not found" });
    }

    const [complainantRows] = await db.query("SELECT * FROM complainants WHERE complaint_id = ?", [
        caseRow.complaint_id
    ]);
    const complainant = complainantRows[0];

    const [complaintHistory] = await db.query(
        `SELECT h.*, u.full_name AS performedByName
         FROM complaint_status_history h
         LEFT JOIN users u ON u.user_id = h.performed_by
         WHERE h.complaint_id = ?
         ORDER BY h.performed_at ASC`,
        [caseRow.complaint_id]
    );

    const [caseHistory] = await db.query(
        `SELECT h.*, u.full_name AS performedByName
         FROM case_status_history h
         LEFT JOIN users u ON u.user_id = h.performed_by
         WHERE h.case_id = ?
         ORDER BY h.performed_at ASC`,
        [id]
    );

    const [documents] = await db.query(
        `SELECT d.document_name AS name, d.uploaded_at AS uploadedAt, cat.value_name AS category,
                u.full_name AS uploadedByName
         FROM documents d
         LEFT JOIN master_values cat ON cat.master_value_id = d.document_category_id
         LEFT JOIN users u ON u.user_id = d.uploaded_by
         WHERE (d.case_id = ? OR d.complaint_id = ?) AND d.is_active = 1
         ORDER BY d.uploaded_at ASC`,
        [id, caseRow.complaint_id]
    );

    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="case-${caseRow.case_no}-journey.pdf"`);
    doc.pipe(res);

    doc.fontSize(H1).text(`Case Journey — ${caseRow.case_no}`, { align: "left" });
    doc.fontSize(BODY).fillColor("#4b5563").text(`Complaint ${caseRow.complaintNo}`);
    doc.fillColor("#111827");

    const isAnonymous = !!complainant?.is_anonymous;

    section(doc, "Complaint Details");
    kv(doc, "Date of Receipt", fmt(caseRow.dateOfReceipt));
    kv(doc, "Anonymous Complainant", isAnonymous ? "Yes" : "No");
    if (!isAnonymous && complainant) {
        kv(doc, "Complainant Name", complainant.employee_name);
        kv(doc, "Complainant Employee ID", complainant.employee_id);
        kv(doc, "Complainant Email", complainant.email_id);
    }
    kv(doc, "Description", caseRow.complaintDescription);

    section(doc, "Referral & Case Details");
    kv(doc, "WB Committee Owner", caseRow.wbcOwnerName);
    kv(doc, "Case Type", caseRow.caseType);
    kv(doc, "Priority", caseRow.priority);
    kv(doc, "Risk Category", caseRow.riskCategory);
    kv(doc, "Investigation Officer", caseRow.investigationOfficerName);
    kv(doc, "Case Open Date", fmt(caseRow.case_open_date));
    kv(doc, "Due Date", caseRow.due_date ? fmt(caseRow.due_date) : "—");
    kv(doc, "Investigation SLA Due Date (90 days)", caseRow.iu_sla_due_date ? fmt(caseRow.iu_sla_due_date) : "—");
    kv(doc, "Current Status", caseRow.status);

    section(doc, "Status History & Timeline");
    doc.font("Helvetica-Bold").text("Complaint stage");
    doc.font("Helvetica");
    if (!complaintHistory.length) {
        doc.text("No history recorded.");
    }
    complaintHistory.forEach((h) => {
        doc.text(`${fmt(h.performed_at)} — ${h.action_code} (${h.performedByName || "system"})`);
        if (h.remarks) doc.fillColor("#4b5563").text(`   Remark: ${h.remarks}`).fillColor("#111827");
    });

    doc.moveDown(0.4).font("Helvetica-Bold").text("Case stage");
    doc.font("Helvetica");
    if (!caseHistory.length) {
        doc.text("No history recorded.");
    }
    caseHistory.forEach((h) => {
        doc.text(`${fmt(h.performed_at)} — ${h.action_code} (${h.performedByName || "system"})`);
        if (h.remarks) doc.fillColor("#4b5563").text(`   Remark: ${h.remarks}`).fillColor("#111827");
    });

    section(doc, "Attachments");
    if (!documents.length) {
        doc.text("No documents attached.");
    }
    documents.forEach((d) => {
        doc.text(`${d.name} — ${d.category || "Uncategorised"} — uploaded by ${d.uploadedByName || "unknown"} on ${fmt(d.uploadedAt)}`);
    });

    doc.end();
};

module.exports = { exportCaseJourney };
