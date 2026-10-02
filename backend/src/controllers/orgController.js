const db = require("../config/db");

const listDepartments = async (req, res) => {
    const [rows] = await db.query(
        "SELECT department_id AS id, department_name AS name FROM departments WHERE active_flag = 1 ORDER BY department_name"
    );

    res.json(rows);
};

module.exports = { listDepartments };
