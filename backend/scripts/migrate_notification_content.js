// Idempotent DDL for richer notification content: notification_history only
// ever stored the merged subject line, never a body, and had no read/unread
// marker — so the in-app notification list had nowhere to put case ID +
// requester role + request text + due date, or to track what a user has
// already seen. Safe to run repeatedly.
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

const addColumn = async (table, column, definition) => {
    if (await columnExists(table, column)) {
        return false;
    }

    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`  + ${table}.${column}`);

    return true;
};

const migrate = async () => {
    console.log("Applying notification-content migration...");

    // The fully merged template body (case ID, requester role, request text,
    // due date all resolved in) — subject stays a short line, message is what
    // the notification list actually shows.
    await addColumn("notification_history", "message", "TEXT NULL");

    // NULL = unread. Set once the recipient opens the notification from the
    // in-app list.
    await addColumn("notification_history", "read_at", "DATETIME NULL");

    console.log("Notification-content migration complete.");
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
