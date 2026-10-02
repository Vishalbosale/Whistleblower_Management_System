const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { generatePostboxPassword } = require("../utils/generateIds");
const { WBC_ROLES, IU_ROLES, ADMIN_ROLES } = require("../utils/permissions");

// `?group=WBC|IU` narrows the list to one constituency — the screens that
// pick a WB Committee member to transfer to, or an Investigation Unit officer
// to forward a case to, must not offer everybody.
const ROLE_GROUPS = { WBC: WBC_ROLES, IU: IU_ROLES };

const listUsers = async (req, res) => {
    const { group, activeOnly, search, status } = req.query;

    const where = [];
    const params = [];

    if (search) {
        where.push("(u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)");
        const like = `%${search}%`;
        params.push(like, like, like, like);
    }

    if (status) {
        where.push("u.status_code = ?");
        params.push(status);
    }

    if (group) {
        const codes = ROLE_GROUPS[String(group).toUpperCase()];

        if (!codes) {
            return res.status(400).json({ message: `group must be one of ${Object.keys(ROLE_GROUPS).join(", ")}` });
        }

        where.push(
            `EXISTS (SELECT 1 FROM user_roles ur2
                     JOIN roles r2 ON r2.role_id = ur2.role_id
                     WHERE ur2.user_id = u.user_id AND ur2.active_flag = 1 AND r2.role_code IN (?))`
        );
        params.push(codes);
    }

    if (activeOnly === "1" || activeOnly === "true") {
        where.push("u.status_code = 'ACTIVE'");
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [users] = await db.query(
        `SELECT u.user_id AS id, u.employee_id AS employeeId, u.username, u.full_name AS fullName,
                u.email, u.status_code AS status, u.last_login_at AS lastLoginAt,
                GROUP_CONCAT(r.role_code) AS roleCodes
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.user_id AND ur.active_flag = 1
         LEFT JOIN roles r ON r.role_id = ur.role_id
         ${whereClause}
         GROUP BY u.user_id
         ORDER BY u.user_id DESC`,
        params
    );

    res.json(
        users.map((u) => ({
            ...u,
            roleCodes: u.roleCodes ? u.roleCodes.split(",") : []
        }))
    );
};

const createUser = async (req, res) => {
    const { username, fullName, email, employeeId } = req.body;

    if (!username || !fullName) {
        return res.status(400).json({ message: "username and fullName are required" });
    }

    const tempPassword = generatePostboxPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const [result] = await db.query(
        `INSERT INTO users (employee_id, username, full_name, email, password_hash, status_code)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [employeeId || null, username, fullName, email || null, passwordHash]
    );

    res.status(201).json({ userId: result.insertId, tempPassword });
};

const updateUserStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["ACTIVE", "INACTIVE", "LOCKED", "DISABLED"];

    if (!allowed.includes(status)) {
        return res.status(400).json({ message: `status must be one of ${allowed.join(", ")}` });
    }

    if (status !== "ACTIVE" && Number(id) === Number(req.user.userId)) {
        return res.status(409).json({ message: "You cannot deactivate your own account" });
    }

    const [result] = await db.query("UPDATE users SET status_code = ? WHERE user_id = ?", [status, id]);

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
    }

    // Deactivation is allowed with work still open — that is exactly the
    // "someone is unavailable" case — but the files it strands are reported
    // back so Admin knows what to transfer.
    const workload = status === "ACTIVE" ? { complaints: 0, cases: 0 } : await openWorkloadOf(id);

    res.json({
        message:
            workload.complaints || workload.cases
                ? `User status updated. They still hold ${workload.complaints} open complaint(s) and ${workload.cases} open case(s) — transfer these.`
                : "User status updated",
        workload
    });
};

const assignRole = async (req, res) => {
    const { id } = req.params;
    const { roleId } = req.body;

    if (!roleId) {
        return res.status(400).json({ message: "roleId is required" });
    }

    await db.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE active_flag = 1`,
        [id, roleId]
    );

    res.json({ message: "Role assigned" });
};

const removeRole = async (req, res) => {
    const { id, roleId } = req.params;

    // The last WB Committee member must not be able to strip its own access
    // and lock everyone out of user management.
    const [role] = await db.query("SELECT role_code FROM roles WHERE role_id = ?", [roleId]);

    if (ADMIN_ROLES.includes(role[0]?.role_code)) {
        const [admins] = await db.query(
            `SELECT COUNT(*) AS c FROM user_roles ur
             JOIN roles r ON r.role_id = ur.role_id
             JOIN users u ON u.user_id = ur.user_id
               WHERE r.role_code IN (?) AND ur.active_flag = 1 AND u.status_code = 'ACTIVE'`,
              [ADMIN_ROLES]
        );

        if (Number(admins[0].c) <= 1) {
            return res.status(409).json({ message: "This is the last active WB Committee member — assign another first" });
        }
    }

    const [result] = await db.query("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?", [id, roleId]);

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "That user does not hold that role" });
    }

    res.json({ message: "Role removed" });
};

// Work this user is still holding. Deleting or deactivating them would strand
// it, so both paths report it and the caller transfers the files first.
const openWorkloadOf = async (userId) => {
    const [rows] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM complaints c
             LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
             WHERE c.wbc_owner_id = ? AND st.value_code NOT IN ('CLOSED', 'REJECTED')) AS complaints,
            (SELECT COUNT(*) FROM cases cs
             LEFT JOIN master_values st ON st.master_value_id = cs.status_id
             WHERE cs.investigation_officer_id = ? AND st.value_code <> 'CLOSED') AS cases`,
        [userId, userId]
    );

    return { complaints: Number(rows[0].complaints), cases: Number(rows[0].cases) };
};

const getUserWorkload = async (req, res) => {
    res.json(await openWorkloadOf(req.params.id));
};

// Deletion is the harder of the two options and often the wrong one: users are
// named all over the audit trail. The FKs that carry history are ON DELETE SET
// NULL so the trail survives, but committee and DAC membership are RESTRICT —
// for those the honest answer is "deactivate instead", not a silent cascade.
const deleteUser = async (req, res) => {
    const { id } = req.params;

    if (Number(id) === Number(req.user.userId)) {
        return res.status(409).json({ message: "You cannot delete your own account" });
    }

    const [users] = await db.query("SELECT username, full_name FROM users WHERE user_id = ?", [id]);

    if (!users[0]) {
        return res.status(404).json({ message: "User not found" });
    }

    const workload = await openWorkloadOf(id);

    if (workload.complaints || workload.cases) {
        return res.status(409).json({
            message:
                `${users[0].full_name} still holds ${workload.complaints} open complaint(s) and ` +
                `${workload.cases} open case(s). Transfer them first, or deactivate this user instead.`,
            workload
        });
    }

    try {
        await db.query("DELETE FROM users WHERE user_id = ?", [id]);
    } catch (error) {
        if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
            return res.status(409).json({
                message:
                    `${users[0].full_name} appears on committee or disciplinary records that must be kept. ` +
                    "Deactivate this user instead — that removes their access without breaking the audit trail."
            });
        }

        throw error;
    }

    res.json({ message: `${users[0].full_name} deleted` });
};

module.exports = {
    listUsers,
    createUser,
    updateUserStatus,
    assignRole,
    removeRole,
    deleteUser,
    getUserWorkload
};
