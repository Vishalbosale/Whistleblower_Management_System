const db = require("../config/db");

const cache = new Map();

// Resolves a master_values.master_value_id from (masterCode, valueCode),
// e.g. ("COMPLAINT_STATUS", "RECEIVED"). Small in-memory cache since these
// are effectively static lookup/config values.
const getMasterValueId = async (masterCode, valueCode, conn = db) => {
    const cacheKey = `${masterCode}:${valueCode}`;

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const [rows] = await conn.query(
        `SELECT mv.master_value_id AS id
         FROM master_values mv
         JOIN master_types mt ON mt.master_type_id = mv.master_type_id
         WHERE mt.master_code = ? AND mv.value_code = ?
         LIMIT 1`,
        [masterCode, valueCode]
    );

    const id = rows[0]?.id ?? null;
    cache.set(cacheKey, id);

    return id;
};

// Resolves the value_code text for a given master_value_id (used to make
// server-side decisions like "is this complaint anonymous?").
const getMasterValueCode = async (masterValueId, conn = db) => {
    if (!masterValueId) {
        return null;
    }

    const [rows] = await conn.query(
        "SELECT value_code AS code FROM master_values WHERE master_value_id = ? LIMIT 1",
        [masterValueId]
    );

    return rows[0]?.code ?? null;
};

module.exports = { getMasterValueId, getMasterValueCode };
