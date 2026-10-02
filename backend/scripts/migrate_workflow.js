// Idempotent DDL for the whistle-blower complaint-handling workflow
// (acknowledgement -> sufficiency check -> IU -> IVR -> WBC -> DAC/closure).
//
// The base schema in Documents/whistleblower_management_schema.sql predates
// this workflow, so the extra columns it needs live here rather than being
// edited into that file — apply_schema.js stays replayable against a clean
// database, and this script tops it up. Safe to run repeatedly.
require("dotenv").config({ quiet: true });
const db = require("../src/config/db");

const columnExists = async (table, column) => {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column]
    );

    return rows.length > 0;
};

const constraintExists = async (name) => {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.table_constraints
         WHERE table_schema = DATABASE() AND constraint_name = ?`,
        [name]
    );

    return rows.length > 0;
};

const addColumn = async (table, column, definition) => {
    if (await columnExists(table, column)) {
        return false;
    }

    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`  + ${table}.${column}`);

    return true;
};

const addForeignKey = async (table, name, definition) => {
    if (await constraintExists(name)) {
        return false;
    }

    await db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition}`);
    console.log(`  + FK ${name}`);

    return true;
};

const migrate = async () => {
    console.log("Applying workflow migration...");

    // --- WB Committee ownership -------------------------------------------
    // The whole flow is anchored on the complaint (cases are 1:1 with it), so
    // the owning WB Committee member is held here and read through by the case
    // views. That keeps Admin's "transfer at any stage" a single-row update
    // with no complaint/case drift.
    await addColumn("complaints", "wbc_owner_id", "BIGINT UNSIGNED NULL AFTER current_status_id");
    await addForeignKey(
        "complaints",
        "fk_complaints_wbc_owner",
        "FOREIGN KEY (wbc_owner_id) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL"
    );

    await addColumn("complaints", "forwarded_to_iu_date", "DATE NULL AFTER ack_to_wb_date");

    // --- Additional-details requests to the whistle-blower ------------------
    // 6-day response window, three reminders at 2-day intervals, auto-close on
    // silence. case_id records whether the request was raised before or after
    // the complaint was forwarded to the Investigation Unit.
    await addColumn("complaint_clarifications", "case_id", "BIGINT UNSIGNED NULL AFTER complaint_id");
    await addForeignKey(
        "complaint_clarifications",
        "fk_clarifications_case",
        "FOREIGN KEY (case_id) REFERENCES cases(case_id) ON UPDATE CASCADE ON DELETE SET NULL"
    );

    await addColumn("complaint_clarifications", "reminder_count", "INT NOT NULL DEFAULT 0");
    // Stage the complaint/case was in when details were requested, so that a
    // reply puts the file back exactly where the request interrupted it.
    await addColumn("complaint_clarifications", "prior_complaint_status", "VARCHAR(80) NULL");
    await addColumn("complaint_clarifications", "prior_case_status", "VARCHAR(80) NULL");
    await addColumn("complaint_clarifications", "last_reminder_at", "DATETIME NULL");
    await addColumn("complaint_clarifications", "closed_reason", "VARCHAR(255) NULL");

    // The Investigation Unit cannot contact the whistle-blower directly — the
    // committee is the only channel. An IU request is therefore filed as a
    // PROPOSED clarification that a committee member forwards or declines; the
    // 6-day clock only starts on forwarding.
    await addColumn("complaint_clarifications", "origin", "VARCHAR(20) NOT NULL DEFAULT 'WBC'");
    await addColumn("complaint_clarifications", "forwarded_by", "BIGINT UNSIGNED NULL");
    await addForeignKey(
        "complaint_clarifications",
        "fk_clarifications_forwarded_by",
        "FOREIGN KEY (forwarded_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL"
    );

    // The complainant's answer comes back to the WB Committee, never straight
    // to the Investigation Unit. The committee reviews it and forwards what the
    // IU may see — `shared_with_iu_text` is that forwarded version, which can be
    // a redaction of `response_text` if the raw answer would identify the
    // complainant.
    await addColumn("complaint_clarifications", "shared_with_iu_text", "LONGTEXT NULL");
    await addColumn("complaint_clarifications", "response_forwarded_at", "DATETIME NULL");
    await addColumn("complaint_clarifications", "response_forwarded_by", "BIGINT UNSIGNED NULL");
    await addForeignKey(
        "complaint_clarifications",
        "fk_clarifications_response_forwarded_by",
        "FOREIGN KEY (response_forwarded_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL"
    );

    // Same gate for attachments. Files the complainant sends with an answer are
    // held from the Investigation Unit until the committee releases them;
    // everything else on a case is shared by default.
    await addColumn("documents", "shared_with_iu", "TINYINT(1) NOT NULL DEFAULT 1");

    // --- IVR resubmission --------------------------------------------------
    // The WB Committee can bounce an investigation report back for
    // clarification; the IU then submits a fresh version against the same case.
    await addColumn("investigation_reports", "version_no", "INT NOT NULL DEFAULT 1");
    await addColumn("investigation_reports", "clarification_response", "LONGTEXT NULL");

    // Supporting documents are attached to the report version they were filed
    // with, so a resubmission's evidence stays distinguishable from v1's.
    await addColumn("documents", "investigation_report_id", "BIGINT UNSIGNED NULL AFTER case_id");
    await addForeignKey(
        "documents",
        "fk_documents_investigation_report",
        "FOREIGN KEY (investigation_report_id) REFERENCES investigation_reports(report_id) ON UPDATE CASCADE ON DELETE SET NULL"
    );

    console.log("Workflow migration complete.");
};

module.exports = { migrate };

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Migration failed:", error);
            process.exit(1);
        });
}
