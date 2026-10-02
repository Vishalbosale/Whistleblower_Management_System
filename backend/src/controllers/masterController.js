const db = require("../config/db");

const getMasterValues = async (req, res) => {
    const { code } = req.params;

    const [rows] = await db.query(
        `SELECT mv.master_value_id AS id, mv.value_code AS code, mv.value_name AS name,
                mv.parent_value_id AS parentId, mv.display_order AS displayOrder
         FROM master_values mv
         JOIN master_types mt ON mt.master_type_id = mv.master_type_id
         WHERE mt.master_code = ? AND mv.active_flag = 1
         ORDER BY mv.display_order, mv.value_name`,
        [code]
    );

    res.json(rows);
};

module.exports = { getMasterValues };
