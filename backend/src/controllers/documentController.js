const db = require("../config/db");
const { canViewCase, canViewComplaint } = require("../utils/caseAccess");
const { isInvestigationUnit } = require("../utils/permissions");
const { sendDocument } = require("../services/fileStorage");

// Documents follow the file they belong to: if you can open the case or the
// complaint, you can download what is attached to it, and otherwise you cannot.
//
// This matters more than usual here. Before, any signed-in user could pull any
// document by guessing its id, which would have walked straight around both the
// ownership boundary and the identity firewall.
//
// Note on the Investigation Unit: it *can* download complaint attachments for
// its own cases. The evidence is the substance of the investigation, so
// withholding it would make the case unworkable — but an attachment the
// complainant wrote may well name them, which no server-side rule can prevent.
// The masking guarantees cover the structured identity fields; attachments are
// a residual exposure the committee should weigh when forwarding a case.
const resolveAccess = async (document, user) => {
    // Held back from the Investigation Unit until the WB Committee releases it —
    // an attachment the complainant sent with an answer goes to the committee
    // first, like the answer itself.
    if (!document.shared_with_iu && isInvestigationUnit(user.roles || [])) {
        return false;
    }

    if (document.case_id) {
        return canViewCase(document.case_id, user);
    }

    if (document.complaint_id) {
        return canViewComplaint(document.complaint_id, user);
    }

    // Unattached documents have no file to inherit permission from.
    return false;
};

const downloadDocument = async (req, res) => {
    const { id } = req.params;

    const [rows] = await db.query(
        `SELECT document_id, document_name, storage_path, mime_type, complaint_id, case_id, shared_with_iu
         FROM documents WHERE document_id = ? AND is_active = 1`,
        [id]
    );

    const document = rows[0];

    if (!document) {
        return res.status(404).json({ message: "Document not found" });
    }

    if (!(await resolveAccess(document, req.user))) {
        // 404 rather than 403, so document ids cannot be probed for existence.
        return res.status(404).json({ message: "Document not found" });
    }

    const sent = document.storage_path
        ? await sendDocument(res, {
              key: document.storage_path,
              name: document.document_name,
              mimeType: document.mime_type
          })
        : false;

    if (!sent) {
        return res.status(410).json({ message: "The stored file is no longer available" });
    }
};

module.exports = { downloadDocument };
