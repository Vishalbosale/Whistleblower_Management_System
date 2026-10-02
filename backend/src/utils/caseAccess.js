const db = require("../config/db");
const { isAdmin, isWbc, isInvestigationUnit, hasAny } = require("./permissions");

// Who can see which complaints and cases.
//
// The rule is ownership, not role: a complaint becomes visible to one WB
// Committee member when they acknowledge it, and a case becomes visible to one
// Investigation Unit officer when it is assigned to them. Committee members do
// not see each other's files, and investigators do not see each other's.
//
// Exactly one role sees everything: WBC_MEMBER. It administers the workflow and is
// the only role that can move a file to someone else, so it must be able to see
// every file to do that.
//
// AUDITOR is deliberately NOT here. It is an oversight role and blanket read
// access would be defensible, but "only Admin will have visibility of all the
// complaints" is the rule, and a second all-seeing role is exactly the kind of
// quiet exception that makes such a rule untrue in practice. An auditor now
// sees what they own, like everybody else.
const GLOBAL_VIEW_ROLES = ["WBC_MEMBER"];

const seesEverything = (roles = []) => hasAny(roles, GLOBAL_VIEW_ROLES);

// Complaints, for the WB Committee's queue.
//
// An unclaimed complaint is visible to every committee member — somebody has to
// be able to pick it up and acknowledge it. From the moment it is acknowledged
// it belongs to the acknowledging member alone.
//
// Returns a SQL fragment to AND into a WHERE clause (null = no restriction)
// plus its bound parameters. `alias` is the alias of the `complaints` table.
const complaintVisibilityFilter = (user, alias = "c") => {
    const roles = user.roles || [];

    if (seesEverything(roles)) {
        return { sql: null, params: [] };
    }

    if (isWbc(roles)) {
        return {
            sql: `(${alias}.wbc_owner_id = ? OR ${alias}.wbc_owner_id IS NULL)`,
            params: [user.userId]
        };
    }

    // Nobody else has any business in the complaint queue — the Investigation
    // Unit included, which is refused the complaint routes outright.
    return { sql: "1 = 0", params: [] };
};

// Cases. A case is visible to the committee member who owns the underlying
// complaint and to the Investigation Unit user it is assigned to.
//
// `alias` is the alias of the `cases` table; `complaintAlias` is the alias of
// the joined `complaints` table (every calling query already joins it).
const caseVisibilityFilter = (user, alias = "cs", complaintAlias = "c") => {
    const roles = user.roles || [];

    if (seesEverything(roles)) {
        return { sql: null, params: [] };
    }

    const clauses = [];
    const params = [];

    if (isWbc(roles)) {
        clauses.push(`${complaintAlias}.wbc_owner_id = ?`);
        params.push(user.userId);
    }

    if (isInvestigationUnit(roles)) {
        clauses.push(`${alias}.investigation_officer_id = ?`);
        params.push(user.userId);

        // Reviewers and escalation owners named on the assignment can see it too
        // — but only on the CURRENT assignment. Matching any historical row
        // would leave a replaced investigator able to read the case forever,
        // which would quietly defeat the point of reassigning it.
        clauses.push(
            `EXISTS (SELECT 1 FROM case_assignments ca
                     WHERE ca.case_id = ${alias}.case_id
                       AND ca.assignment_id = (SELECT MAX(ca2.assignment_id)
                                               FROM case_assignments ca2
                                               WHERE ca2.case_id = ${alias}.case_id)
                       AND ? IN (ca.investigation_officer_id, ca.reviewer_id, ca.escalation_owner_id))`
        );
        params.push(user.userId);
    }

    if (!clauses.length) {
        return { sql: "1 = 0", params: [] };
    }

    return { sql: `(${clauses.join(" OR ")})`, params };
};

// Record-level counterparts, for the GET-one endpoints.
const canViewCase = async (caseId, user) => {
    const filter = caseVisibilityFilter(user);

    if (!filter.sql) {
        return true;
    }

    const [rows] = await db.query(
        `SELECT 1 FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         WHERE cs.case_id = ? AND ${filter.sql} LIMIT 1`,
        [caseId, ...filter.params]
    );

    return rows.length > 0;
};

const canViewComplaint = async (complaintId, user) => {
    const filter = complaintVisibilityFilter(user);

    if (!filter.sql) {
        return true;
    }

    const [rows] = await db.query(
        `SELECT 1 FROM complaints c WHERE c.complaint_id = ? AND ${filter.sql} LIMIT 1`,
        [complaintId, ...filter.params]
    );

    return rows.length > 0;
};

// Who may edit a case. Admin and the owning committee member steer the
// procedure; the assigned Investigation Unit user works the investigation.
// Everyone else who can see the case gets it read-only.
const canEditCase = async (caseId, user) => {
    const roles = user.roles || [];

    if (isAdmin(roles)) {
        return true;
    }

    if (!(await canViewCase(caseId, user))) {
        return false;
    }

    // A committee member who can see the case is its owner, by definition of
    // the filter above.
    if (isWbc(roles)) {
        return true;
    }

    const [rows] = await db.query(
        `SELECT investigation_officer_id, reviewer_id, escalation_owner_id
         FROM case_assignments WHERE case_id = ? ORDER BY assignment_id DESC LIMIT 1`,
        [caseId]
    );

    const assignment = rows[0];

    if (!assignment) {
        return false;
    }

    return [assignment.investigation_officer_id, assignment.reviewer_id, assignment.escalation_owner_id].includes(
        user.userId
    );
};

module.exports = {
    GLOBAL_VIEW_ROLES,
    seesEverything,
    complaintVisibilityFilter,
    caseVisibilityFilter,
    canViewCase,
    canViewComplaint,
    canEditCase
};
