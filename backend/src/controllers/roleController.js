const db = require("../config/db");

const listRoles = async (req, res) => {
    const [roles] = await db.query(
        "SELECT role_id AS id, role_code AS code, role_name AS name FROM roles WHERE active_flag = 1 ORDER BY role_name"
    );

    res.json(roles);
};

module.exports = { listRoles };
