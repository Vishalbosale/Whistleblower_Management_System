const db = require("../config/db");

// `notification_history.recipient` is a free-text email/username string set
// at send time (the same value every `notify()` call site resolves via
// `officer.email || officer.username`) — there is no user_id column, so a
// caller's own notifications are found by matching either of their own
// identifiers back against it.
const recipientIdentifiers = async (userId) => {
    const [rows] = await db.query("SELECT email, username FROM users WHERE user_id = ?", [userId]);
    const user = rows[0];

    return [user?.email, user?.username].filter(Boolean);
};

// The staff topbar bell: a short, actionable list — case/complaint reference,
// the merged subject and message (case ID + role + request text + due date
// already resolved in by notify()), when it was sent, and whether it's been
// opened yet.
const listNotifications = async (req, res) => {
    const identifiers = await recipientIdentifiers(req.user.userId);

    if (!identifiers.length) {
        return res.json({ data: [], unreadCount: 0 });
    }

    const [rows] = await db.query(
        `SELECT nh.notification_id AS id, nh.subject, nh.message,
                nh.case_id AS caseId, cs.case_no AS caseNo,
                nh.complaint_id AS complaintId, c.complaint_no AS complaintNo,
                nh.sent_datetime AS sentAt, nh.read_at AS readAt
         FROM notification_history nh
         LEFT JOIN cases cs ON cs.case_id = nh.case_id
         LEFT JOIN complaints c ON c.complaint_id = nh.complaint_id
         WHERE nh.recipient IN (?) AND nh.notification_type = 'IN_APP'
         ORDER BY nh.sent_datetime DESC
         LIMIT 50`,
        [identifiers]
    );

    const data = rows.map(({ readAt, ...row }) => ({ ...row, read: !!readAt }));
    const unreadCount = data.filter((row) => !row.read).length;

    res.json({ data, unreadCount });
};

const markNotificationRead = async (req, res) => {
    const { id } = req.params;
    const identifiers = await recipientIdentifiers(req.user.userId);

    if (!identifiers.length) {
        return res.status(404).json({ message: "Notification not found" });
    }

    const [result] = await db.query(
        "UPDATE notification_history SET read_at = NOW() WHERE notification_id = ? AND recipient IN (?) AND read_at IS NULL",
        [id, identifiers]
    );

    if (!result.affectedRows) {
        // Already read, or not this user's — either way there is nothing to do.
        return res.json({ message: "OK" });
    }

    res.json({ message: "Marked as read" });
};

module.exports = { listNotifications, markNotificationRead };
