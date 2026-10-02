// Idempotent DDL for the 2026-09 change-request batch: the Investigation
// Unit's 90-day completion SLA (with 30-day reminders) and the "unseen
// update" flag on the dashboard/My Cases lists. Safe to run repeatedly.
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

const tableExists = async (table) => {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [table]
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

const migrate = async () => {
    console.log("Applying change-request migration...");

    // --- Investigation Unit completion SLA ----------------------------------
    // "On referral to IU: set a 90-day completion SLA. Auto-reminder to the
    // assigned IU every 30 days until final report submission." A case is
    // created at the moment of referral, so iu_sla_due_date is set once,
    // at creation, in caseController.createCase.
    await addColumn("cases", "iu_sla_due_date", "DATE NULL");
    await addColumn("cases", "iu_reminder_count", "INT NOT NULL DEFAULT 0");

    // --- Unseen-update tracking ----------------------------------------------
    // Per-viewer "last looked at this" timestamp, so the workbench/My Cases
    // lists can flag a row whose status history has moved on since. Keyed by
    // entity rather than a case/complaint FK, since one table covers both.
    if (!(await tableExists("entity_views"))) {
        await db.query(`
            CREATE TABLE entity_views (
                user_id BIGINT UNSIGNED NOT NULL,
                entity_type ENUM('COMPLAINT', 'CASE') NOT NULL,
                entity_id BIGINT UNSIGNED NOT NULL,
                last_viewed_at DATETIME NOT NULL,
                PRIMARY KEY (user_id, entity_type, entity_id),
                CONSTRAINT fk_entity_views_user FOREIGN KEY (user_id) REFERENCES users(user_id)
                    ON UPDATE CASCADE ON DELETE CASCADE
            )
        `);
        console.log("  + table entity_views");
    }

    console.log("Change-request migration complete.");
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
