const db = require("../config/db");

// "Highlight/flag any case that has a new update since the user last viewed
// it." One row per (viewer, entity) — a viewer's own private read marker,
// never shared between users, unlike everything else in this schema.
const markViewed = async (userId, entityType, entityId) => {
    await db.query(
        `INSERT INTO entity_views (user_id, entity_type, entity_id, last_viewed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_viewed_at = NOW()`,
        [userId, entityType, entityId]
    );
};

module.exports = { markViewed };
