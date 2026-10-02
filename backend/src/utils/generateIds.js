const crypto = require("crypto");

const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomAlphanumeric = (length) => {
    let out = "";

    for (let i = 0; i < length; i++) {
        out += ALPHANUMERIC[crypto.randomInt(ALPHANUMERIC.length)];
    }

    return out;
};

// Sequential-looking number scoped to the current year, backed by a
// COUNT(*) on the target table for the year — good enough for Phase 1
// volumes; a dedicated sequence table can replace this later if needed.
const generateYearlyNumber = async (pool, table, column, prefix) => {
    const year = new Date().getFullYear();

    const [rows] = await pool.query(
        `SELECT COUNT(*) AS c FROM ${table} WHERE ${column} LIKE ?`,
        [`${prefix}-${year}-%`]
    );

    const next = Number(rows[0].c) + 1;

    return `${prefix}-${year}-${String(next).padStart(6, "0")}`;
};

const generateComplaintNo = (pool) =>
    generateYearlyNumber(pool, "complaints", "complaint_no", "WMS");

const generateCaseNo = (pool) =>
    generateYearlyNumber(pool, "cases", "case_no", "CASE");

const generateMeetingNo = (pool) =>
    generateYearlyNumber(pool, "wbc_meetings", "meeting_no", "WBC");

const generateDacReferenceNo = (pool) =>
    generateYearlyNumber(pool, "dac_cases", "dac_reference_no", "DAC");

const generateTrackingToken = () => randomAlphanumeric(10);

const generatePostboxPassword = () => randomAlphanumeric(8);

module.exports = {
    generateComplaintNo,
    generateCaseNo,
    generateMeetingNo,
    generateDacReferenceNo,
    generateTrackingToken,
    generatePostboxPassword
};
