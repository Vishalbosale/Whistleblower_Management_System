const db = require("../config/db");
const { notify } = require("../services/notify");
const { WBC_ROLES, IU_ROLES } = require("../utils/permissions");
const { setCaseStatus, setComplaintStatus, WorkflowError } = require("../services/workflowService");

// Reassignment, which belongs to Admin alone.
//
// It exists for the case where whoever is holding a file becomes unavailable —
// a committee member on leave, an investigator who has left. Admin moves the
// file to someone else and the case carries on from exactly the stage it had
// reached; a transfer never rewinds the procedure, it only changes who is
// standing at that point.
//
// Both sides move through here: the WB Committee owner (held on the complaint)
// and the Investigation Unit officer (held on the case), together or singly.

const rolesOf = async (userId) => {
    const [rows] = await db.query(
        `SELECT u.user_id, u.full_name, u.email, u.username, u.status_code,
                GROUP_CONCAT(r.role_code) AS roleCodes
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.user_id AND ur.active_flag = 1
         LEFT JOIN roles r ON r.role_id = ur.role_id
         WHERE u.user_id = ?
         GROUP BY u.user_id`,
        [userId]
    );

    const user = rows[0];

    if (!user) {
        return null;
    }

    user.roles = (user.roleCodes || "").split(",").filter(Boolean);

    return user;
};

const assertEligible = (user, allowedRoles, label) => {
    if (!user) {
        throw new WorkflowError(`${label} not found`, 404);
    }

    if (user.status_code !== "ACTIVE") {
        throw new WorkflowError(`${user.full_name} is not an active user`, 400);
    }

    if (!user.roles.some((role) => allowedRoles.includes(role))) {
        throw new WorkflowError(`${user.full_name} is not ${label}`, 400);
    }
};

const transferCase = async (req, res) => {
    const { id } = req.params;
    const { wbcOwnerId, investigationOfficerId, remarks } = req.body;

    if (!wbcOwnerId && !investigationOfficerId) {
        return res
            .status(400)
            .json({ message: "Provide wbcOwnerId, investigationOfficerId, or both" });
    }

    const [caseRows] = await db.query(
        `SELECT cs.case_id, cs.case_no, cs.complaint_id, cs.investigation_officer_id,
                c.wbc_owner_id, st.value_code AS statusCode,
                owner.full_name AS currentOwnerName, io.full_name AS currentOfficerName
         FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         LEFT JOIN users io ON io.user_id = cs.investigation_officer_id
         WHERE cs.case_id = ?`,
        [id]
    );

    const caseRow = caseRows[0];

    if (!caseRow) {
        return res.status(404).json({ message: "Case not found" });
    }

    if (caseRow.statusCode === "CLOSED") {
        return res.status(409).json({ message: "This case is closed" });
    }

    const newOwner = wbcOwnerId ? await rolesOf(wbcOwnerId) : null;
    const newOfficer = investigationOfficerId ? await rolesOf(investigationOfficerId) : null;

    if (newOwner) {
        assertEligible(newOwner, WBC_ROLES, "a WB Committee member");
    }

    if (newOfficer) {
        assertEligible(newOfficer, IU_ROLES, "a member of the Investigation Unit");
    }

    const notes = [];
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        if (newOwner && Number(newOwner.user_id) !== Number(caseRow.wbc_owner_id)) {
            await conn.query("UPDATE complaints SET wbc_owner_id = ?, updated_by = ? WHERE complaint_id = ?", [
                newOwner.user_id,
                req.user.userId,
                caseRow.complaint_id
            ]);

            const note = `WB Committee owner changed from ${caseRow.currentOwnerName || "unassigned"} to ${newOwner.full_name}`;
            notes.push(note);

            await setComplaintStatus(conn, {
                complaintId: caseRow.complaint_id,
                toCode: null,
                actionCode: "TRANSFERRED_TO_WBC_MEMBER",
                remarks: remarks ? `${note} — ${remarks}` : note,
                userId: req.user.userId
            });
        }

        if (newOfficer && Number(newOfficer.user_id) !== Number(caseRow.investigation_officer_id)) {
            // A fresh assignment row keeps the handover history intact rather
            // than overwriting who held the case before.
            const [previous] = await conn.query(
                `SELECT reviewer_id, escalation_owner_id, investigation_due_date
                 FROM case_assignments WHERE case_id = ? ORDER BY assignment_id DESC LIMIT 1`,
                [id]
            );

            await conn.query(
                `INSERT INTO case_assignments
                    (case_id, investigation_officer_id, reviewer_id, escalation_owner_id,
                     investigation_due_date, assignment_remarks, assigned_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    newOfficer.user_id,
                    previous[0]?.reviewer_id || null,
                    previous[0]?.escalation_owner_id || null,
                    previous[0]?.investigation_due_date || null,
                    remarks || "Reassigned by an Administrator",
                    req.user.userId
                ]
            );

            await conn.query("UPDATE cases SET investigation_officer_id = ?, updated_by = ? WHERE case_id = ?", [
                newOfficer.user_id,
                req.user.userId,
                id
            ]);

            await conn.query("UPDATE investigations SET investigation_officer_id = ? WHERE case_id = ?", [
                newOfficer.user_id,
                id
            ]);

            const note = `Investigation officer changed from ${caseRow.currentOfficerName || "unassigned"} to ${newOfficer.full_name}`;
            notes.push(note);
        }

        if (!notes.length) {
            await conn.rollback();
            return res.status(409).json({ message: "That is already how this case is assigned" });
        }

        // Logged with toCode null: the case stays exactly where it was in the
        // procedure and proceeds from there under its new owner.
        await setCaseStatus(conn, {
            caseId: id,
            toCode: null,
            actionCode: "CASE_TRANSFERRED",
            remarks: remarks ? `${notes.join("; ")} — ${remarks}` : notes.join("; "),
            userId: req.user.userId
        });

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    for (const recipient of [newOwner, newOfficer].filter(Boolean)) {
        await notify({
            complaintId: caseRow.complaint_id,
            caseId: id,
            templateCode: "CASE_TRANSFERRED",
            recipient: recipient.email || recipient.username,
            mergeData: { newOwner: recipient.full_name }
        });
    }

    res.json({
        message: notes.join("; "),
        stageUnchanged: caseRow.statusCode,
        wbcOwnerName: newOwner?.full_name || caseRow.currentOwnerName,
        investigationOfficerName: newOfficer?.full_name || caseRow.currentOfficerName
    });
};

// Everything Admin can currently reassign, in one list, for the admin console.
// Deliberately unscoped — Admin is the role that sees all files.
const listTransferableCases = async (req, res) => {
    const { search } = req.query;

    const where = ["st.value_code <> 'CLOSED'"];
    const params = [];

    if (search) {
        where.push("(cs.case_no LIKE ? OR c.complaint_no LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await db.query(
        `SELECT cs.case_id AS id, cs.case_no AS caseNo, c.complaint_no AS complaintNo,
                c.complaint_id AS complaintId, st.value_code AS statusCode, st.value_name AS statusName,
                c.wbc_owner_id AS wbcOwnerId, owner.full_name AS wbcOwnerName,
                cs.investigation_officer_id AS investigationOfficerId, io.full_name AS investigationOfficerName
         FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         LEFT JOIN users io ON io.user_id = cs.investigation_officer_id
         WHERE ${where.join(" AND ")}
         ORDER BY cs.case_id DESC
         LIMIT 200`,
        params
    );

    // Complaints that have not reached the Investigation Unit yet still have a
    // committee owner who might need replacing.
    const [complaints] = await db.query(
        `SELECT c.complaint_id AS complaintId, c.complaint_no AS complaintNo,
                st.value_code AS statusCode, st.value_name AS statusName,
                c.wbc_owner_id AS wbcOwnerId, owner.full_name AS wbcOwnerName
         FROM complaints c
         LEFT JOIN cases cs ON cs.complaint_id = c.complaint_id
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         WHERE cs.case_id IS NULL AND st.value_code NOT IN ('CLOSED', 'REJECTED')
           ${search ? "AND c.complaint_no LIKE ?" : ""}
         ORDER BY c.complaint_id DESC
         LIMIT 200`,
        search ? [`%${search}%`] : []
    );

    res.json({ cases: rows, complaints });
};

module.exports = { transferCase, listTransferableCases };
