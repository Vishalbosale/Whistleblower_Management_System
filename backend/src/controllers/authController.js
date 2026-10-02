const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { signToken } = require("../utils/tokens");
const { getSettings: getSamlSettings } = require("../services/samlAuthService");

const getRolesForUser = async (userId) => {
    const [rows] = await db.query(
        `SELECT r.role_code, r.role_name
         FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = ? AND ur.active_flag = 1 AND r.active_flag = 1`,
        [userId]
    );

    return rows;
};

const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    // keepLocalPasswordLogin=false only takes effect once SSO is actually
    // enabled — otherwise turning it off first would lock everyone out.
    const samlSettings = await getSamlSettings();

    if (samlSettings.isEnabled && !samlSettings.keepLocalPasswordLogin) {
        return res.status(403).json({ message: "Password sign-in is disabled — use SSO to sign in." });
    }

    const [users] = await db.query(
        "SELECT * FROM users WHERE username = ? AND status_code = 'ACTIVE'",
        [username]
    );

    const user = users[0];

    if (!user || !user.password_hash) {
        return res.status(401).json({ message: "Invalid username or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
        await db.query(
            `INSERT INTO login_history (user_id, login_type, login_status, failure_reason)
             VALUES (?, 'PASSWORD', 'FAILURE', 'Invalid password')`,
            [user.user_id]
        );

        return res.status(401).json({ message: "Invalid username or password" });
    }

    const roles = await getRolesForUser(user.user_id);
    const roleCodes = roles.map((r) => r.role_code);

    const token = signToken({
        userId: user.user_id,
        username: user.username,
        roles: roleCodes
    });

    await db.query("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);
    await db.query(
        `INSERT INTO login_history (user_id, login_type, login_status)
         VALUES (?, 'PASSWORD', 'SUCCESS')`,
        [user.user_id]
    );

    res.json({
        token,
        user: {
            userId: user.user_id,
            username: user.username,
            fullName: user.full_name,
            email: user.email
        },
        roles: roleCodes
    });
};

const me = async (req, res) => {
    const [users] = await db.query(
        "SELECT user_id, username, full_name, email, employee_id FROM users WHERE user_id = ?",
        [req.user.userId]
    );

    const user = users[0];

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    const roles = await getRolesForUser(user.user_id);

    res.json({
        user: {
            userId: user.user_id,
            username: user.username,
            fullName: user.full_name,
            email: user.email,
            employeeId: user.employee_id
        },
        roles: roles.map((r) => r.role_code)
    });
};

module.exports = { login, me, getRolesForUser };
