// Screens 6.2/6.3 describe branch/region/department/designation as
// "Text/HRMS" fields — normally auto-populated from HRMS (a Phase 4
// integration). Until then we find-or-create a matching master row by
// name so the FK columns on complainants/respondents stay populated
// and normalized without blocking manual entry.
const resolveOrCreate = async (conn, { table, idCol, codeCol, nameCol, name }) => {
    if (!name || !name.trim()) {
        return null;
    }

    const trimmed = name.trim();

    const [existing] = await conn.query(
        `SELECT ${idCol} AS id FROM ${table} WHERE ${nameCol} = ? LIMIT 1`,
        [trimmed]
    );

    if (existing.length) {
        return existing[0].id;
    }

    const code = `${trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 24)}_${Date.now()
        .toString(36)
        .slice(-4)}`;

    const [result] = await conn.query(
        `INSERT INTO ${table} (${codeCol}, ${nameCol}) VALUES (?, ?)`,
        [code, trimmed]
    );

    return result.insertId;
};

const resolveRegion = (conn, name) =>
    resolveOrCreate(conn, { table: "regions", idCol: "region_id", codeCol: "region_code", nameCol: "region_name", name });

const resolveBranch = (conn, name) =>
    resolveOrCreate(conn, { table: "branches", idCol: "branch_id", codeCol: "branch_code", nameCol: "branch_name", name });

const resolveDepartment = (conn, name) =>
    resolveOrCreate(conn, { table: "departments", idCol: "department_id", codeCol: "department_code", nameCol: "department_name", name });

const resolveDesignation = (conn, name) =>
    resolveOrCreate(conn, { table: "designations", idCol: "designation_id", codeCol: "designation_code", nameCol: "designation_name", name });

const resolveOrgUnit = async (conn, { branch, region, department, designation } = {}) => ({
    branchId: await resolveBranch(conn, branch),
    regionId: await resolveRegion(conn, region),
    departmentId: await resolveDepartment(conn, department),
    designationId: await resolveDesignation(conn, designation)
});

module.exports = { resolveOrgUnit };
