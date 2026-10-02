const db = require("../config/db");
const { generateCaseNo } = require("../utils/generateIds");
const { getMasterValueId } = require("../utils/masterLookup");
const {
    canViewIdentity,
    maskValue,
    isAdmin,
    isWbc,
    isInvestigationUnit,
    canActAsWbc,
    roleLabel,
    IU_ROLES
} = require("../utils/permissions");
const {
    canEditCase,
    caseVisibilityFilter,
    complaintVisibilityFilter,
    canViewCase,
    seesEverything
} = require("../utils/caseAccess");
const { notify } = require("../services/notify");
const { markViewed } = require("../utils/entityViews");
const { SLA, dueStatus, toIsoDate, addDays } = require("../utils/sla");
const {
    CASE_STAGES,
    CASE_ACTION_PRECONDITIONS,
    setCaseStatus,
    isVisibleToIu
} = require("../services/workflowService");

// Which workflow actions this user may take on a case at its current stage.
// The UI renders exactly these, and each controller re-checks the stage server
// side — this is the convenience layer, not the enforcement layer.
const availableCaseActions = (
    statusCode,
    roles,
    { hasOpenClarification, hasProposal, hasResponseToForward, hasReport, hasMeeting }
) => {
    const allowed = (action) => (CASE_ACTION_PRECONDITIONS[action] || []).includes(statusCode);
    const actions = [];

    if (statusCode === "CLOSED") {
        return actions;
    }

    if (isInvestigationUnit(roles) && allowed("SUBMIT_IVR")) {
        actions.push("SUBMIT_IVR");
    }

    if (canActAsWbc(roles)) {
        if (allowed("SEEK_IVR_CLARIFICATION") && hasReport) {
            actions.push("SEEK_IVR_CLARIFICATION");
        }
        if (allowed("PLACE_BEFORE_WBC") && hasReport) {
            actions.push("PLACE_BEFORE_WBC");
        }
        if (allowed("WBC_DECISION") && hasMeeting) {
            actions.push("WBC_DECISION");
        }
        if (allowed("INITIATE_DAC")) {
            actions.push("DAC_OUTCOME");
        }
        if (allowed("IMPLEMENT")) {
            actions.push("IMPLEMENT");
        }
        // A pending IU proposal must be dealt with first — the service refuses
        // a second active request, so offering the form here would only fail.
        if (allowed("REQUEST_DETAILS") && !hasOpenClarification && !hasProposal) {
            actions.push("REQUEST_DETAILS");
        }
        if (allowed("CLOSE")) {
            actions.push("CLOSE");
        }
    }

    // The Investigation Unit cannot write to the whistle-blower itself — it
    // asks the committee to do it, and a committee member forwards or declines.
    if (isInvestigationUnit(roles) && allowed("REQUEST_DETAILS") && !hasOpenClarification && !hasProposal) {
        actions.push("PROPOSE_DETAILS_REQUEST");
    }

    if (canActAsWbc(roles) && hasProposal) {
        actions.push("REVIEW_DETAILS_PROPOSAL");
    }

    // The complainant has answered and the committee must decide what of it the
    // Investigation Unit sees. Until it does, the answer goes no further.
    if (canActAsWbc(roles) && hasResponseToForward) {
        actions.push("FORWARD_RESPONSE_TO_IU");
    }

    // Reassignment is Admin's alone: it exists for when the person holding a
    // file is unavailable, and letting the committee move its own work would
    // defeat the ownership boundary the rest of this function enforces.
    if (isAdmin(roles)) {
        actions.push("TRANSFER_CASE");
    }

    return actions;
};

const createCase = async (req, res) => {
    const {
        complaintId,
        caseTypeId,
        priorityId,
        riskCategoryId,
        investigationUnitId,
        investigationOfficerId,
        dueDate,
        remarks
    } = req.body;

    if (!complaintId || !caseTypeId || !priorityId || !riskCategoryId) {
        return res.status(400).json({ message: "complaintId, caseTypeId, priorityId and riskCategoryId are required" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const openStatusId = await getMasterValueId("CASE_STATUS", "OPEN", conn);
        const convertedStatusId = await getMasterValueId("COMPLAINT_STATUS", "CONVERTED_TO_CASE", conn);
        const caseNo = await generateCaseNo(conn);

        // "On referral to IU: set a 90-day completion SLA." A case is created
        // at the exact moment of referral, so the SLA clock starts here. Kept
        // distinct from the freeform, optionally-set `due_date` (and the
        // per-assignment `case_assignments.investigation_due_date` that can
        // backfill it) — this one is fixed by policy, not staff-entered.
        const iuSlaDueDate = toIsoDate(addDays(new Date(), SLA.IU_INVESTIGATION_DAYS));

        const [result] = await conn.query(
            `INSERT INTO cases
                (case_no, complaint_id, case_type_id, priority_id, risk_category_id,
                 investigation_unit_id, investigation_officer_id, case_open_date, due_date,
                 iu_sla_due_date, status_id, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?)`,
            [
                caseNo,
                complaintId,
                caseTypeId,
                priorityId,
                riskCategoryId,
                investigationUnitId || null,
                investigationOfficerId || null,
                dueDate || null,
                iuSlaDueDate,
                openStatusId,
                remarks || null,
                req.user.userId
            ]
        );

        const caseId = result.insertId;

        await conn.query(
            `INSERT INTO case_status_history (case_id, from_status_id, to_status_id, action_code, remarks, performed_by)
             VALUES (?, NULL, ?, 'CASE_CREATED', 'Case created from complaint', ?)`,
            [caseId, openStatusId, req.user.userId]
        );

        await conn.query(
            "UPDATE complaints SET current_status_id = ?, updated_by = ? WHERE complaint_id = ?",
            [convertedStatusId, req.user.userId, complaintId]
        );

        await conn.commit();

        res.status(201).json({ caseId, caseNo });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// The Case Workbench shows everything past the Complaint Queue: real cases
// plus complaints that have moved beyond Received/Converted-to-Case but
// don't have a cases row yet (e.g. just acknowledged, not yet forwarded). The
// two branches draw statuses from different master types, so the `status`
// filter is namespaced "CASE:<code>" / "COMPLAINT:<code>" to avoid id collisions.
//
// Investigation Unit users see only their own cases and none of the
// complaint-stage rows — intake is not theirs to browse.
const listWorkbench = async (req, res) => {
    const { status, priority, officer, search, mine, page = 1, pageSize = 20 } = req.query;

    const roles = req.user.roles || [];
    const iuOnly = isInvestigationUnit(roles) && !seesEverything(roles) && !isWbc(roles);
    const visibility = caseVisibilityFilter(req.user, "cs", "c");

    let statusRecordType = null;
    let statusId = null;

    if (status && status.includes(":")) {
        const [type, code] = status.split(":");
        if ((type === "CASE" || type === "COMPLAINT") && code) {
            statusRecordType = type;
            statusId = await getMasterValueId(type === "CASE" ? "CASE_STATUS" : "COMPLAINT_STATUS", code);
        }
    }

    const excludeComplaintBranch = statusRecordType === "CASE" || !!priority || !!officer || iuOnly;
    const excludeCaseBranch = statusRecordType === "COMPLAINT";

    const caseWhere = [];
    const caseParams = [];

    if (excludeCaseBranch) {
        caseWhere.push("1 = 0");
    } else {
        if (visibility.sql) {
            caseWhere.push(visibility.sql);
            caseParams.push(...visibility.params);
        }
        if (statusRecordType === "CASE") {
            caseWhere.push("cs.status_id = ?");
            caseParams.push(statusId);
        }
        if (priority) {
            caseWhere.push("cs.priority_id = ?");
            caseParams.push(priority);
        }
        if (officer) {
            caseWhere.push("cs.investigation_officer_id = ?");
            caseParams.push(officer);
        }
        // "My bucket": the WB Committee member who owns it, or the IU officer
        // it is assigned to, depending on who is asking.
        if (mine === "1" || mine === "true") {
            caseWhere.push(
                isInvestigationUnit(roles) ? "cs.investigation_officer_id = ?" : "c.wbc_owner_id = ?"
            );
            caseParams.push(req.user.userId);
        }
        if (search) {
            caseWhere.push("(cs.case_no LIKE ? OR c.complaint_no LIKE ?)");
            caseParams.push(`%${search}%`, `%${search}%`);
        }
    }

    const complaintWhere = ["st.value_code NOT IN ('RECEIVED', 'CONVERTED_TO_CASE')", "cs2.case_id IS NULL"];
    const complaintParams = [];

    if (excludeComplaintBranch) {
        complaintWhere.push("1 = 0");
    } else {
        // The pre-case rows obey the same ownership rule as the complaint queue.
        const complaintVisibility = complaintVisibilityFilter(req.user, "c");

        if (complaintVisibility.sql) {
            complaintWhere.push(complaintVisibility.sql);
            complaintParams.push(...complaintVisibility.params);
        }
        if (statusRecordType === "COMPLAINT") {
            complaintWhere.push("c.current_status_id = ?");
            complaintParams.push(statusId);
        }
        if (mine === "1" || mine === "true") {
            complaintWhere.push("c.wbc_owner_id = ?");
            complaintParams.push(req.user.userId);
        }
        if (search) {
            complaintWhere.push("c.complaint_no LIKE ?");
            complaintParams.push(`%${search}%`);
        }
    }

    const caseWhereClause = caseWhere.length ? `WHERE ${caseWhere.join(" AND ")}` : "";
    const complaintWhereClause = `WHERE ${complaintWhere.join(" AND ")}`;

    // "Highlight any case that has a new update since the user last viewed
    // it" — compare the latest status-history entry against the caller's own
    // entity_views row (never viewed = unseen; viewed but stale = unseen).
    const unionSql = `
        SELECT 'CASE' AS recordType, cs.case_id AS id, cs.case_no AS caseNo, c.complaint_id AS complaintId,
               c.complaint_no AS complaintNo, cs.case_open_date AS openDate,
               COALESCE(cs.due_date, cs.iu_sla_due_date) AS dueDate,
               pr.value_name AS priority, rc.value_name AS riskCategory,
               st.value_name AS status, st.value_code AS statusCode,
               u.full_name AS assignedTo, owner.full_name AS wbcOwnerName,
               GREATEST(
                   COALESCE((SELECT MAX(performed_at) FROM case_status_history WHERE case_id = cs.case_id), '1000-01-01'),
                   COALESCE((SELECT MAX(response_forwarded_at) FROM complaint_clarifications
                             WHERE case_id = cs.case_id AND response_forwarded_at IS NOT NULL), '1000-01-01')
               ) AS lastUpdateAt,
               (SELECT last_viewed_at FROM entity_views
                WHERE user_id = ? AND entity_type = 'CASE' AND entity_id = cs.case_id) AS lastViewedAt
        FROM cases cs
        JOIN complaints c ON c.complaint_id = cs.complaint_id
        LEFT JOIN master_values pr ON pr.master_value_id = cs.priority_id
        LEFT JOIN master_values rc ON rc.master_value_id = cs.risk_category_id
        LEFT JOIN master_values st ON st.master_value_id = cs.status_id
        LEFT JOIN users u ON u.user_id = cs.investigation_officer_id
        LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
        ${caseWhereClause}

        UNION ALL

        SELECT 'COMPLAINT' AS recordType, c.complaint_id AS id, NULL AS caseNo, c.complaint_id AS complaintId,
               c.complaint_no AS complaintNo, c.date_of_receipt AS openDate, NULL AS dueDate,
               NULL AS priority, NULL AS riskCategory,
               st.value_name AS status, st.value_code AS statusCode,
               NULL AS assignedTo, owner.full_name AS wbcOwnerName,
               (SELECT MAX(performed_at) FROM complaint_status_history WHERE complaint_id = c.complaint_id) AS lastUpdateAt,
               (SELECT last_viewed_at FROM entity_views
                WHERE user_id = ? AND entity_type = 'COMPLAINT' AND entity_id = c.complaint_id) AS lastViewedAt
        FROM complaints c
        LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
        LEFT JOIN cases cs2 ON cs2.complaint_id = c.complaint_id
        LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
        ${complaintWhereClause}
    `;

    const limit = Math.min(Number(pageSize) || 20, 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

    // The unseen-update subquery's `?` sits ahead of each branch's own WHERE
    // params in the SQL text, so the viewer's id is unshifted onto the front
    // of each branch's parameter list to match.
    const caseParamsWithViewer = [req.user.userId, ...caseParams];
    const complaintParamsWithViewer = [req.user.userId, ...complaintParams];

    const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM (${unionSql}) x`, [
        ...caseParamsWithViewer,
        ...complaintParamsWithViewer
    ]);

    const [rows] = await db.query(`SELECT * FROM (${unionSql}) x ORDER BY openDate DESC LIMIT ? OFFSET ?`, [
        ...caseParamsWithViewer,
        ...complaintParamsWithViewer,
        limit,
        offset
    ]);

    const data = rows.map(({ lastUpdateAt, lastViewedAt, ...row }) => ({
        ...row,
        hasUnseenUpdate: !!lastUpdateAt && (!lastViewedAt || new Date(lastUpdateAt) > new Date(lastViewedAt))
    }));

    res.json({ data, total: countRows[0].total, page: Number(page), pageSize: limit });
};

// "Show status-wise ticket counts" + "one chart giving a clear overview of
// all submitted cases" — a single GROUP BY over the caller's whole scope
// (not the workbench's page-of-100), so the dashboard's counts never
// silently under-report past that cap the way the old client-computed
// panels did.
const getWorkbenchStats = async (req, res) => {
    const roles = req.user.roles || [];
    const iuOnly = isInvestigationUnit(roles) && !seesEverything(roles) && !isWbc(roles);
    const visibility = caseVisibilityFilter(req.user, "cs", "c");

    const caseWhere = visibility.sql ? [visibility.sql] : [];
    const caseParams = visibility.sql ? [...visibility.params] : [];
    const caseWhereClause = caseWhere.length ? `WHERE ${caseWhere.join(" AND ")}` : "";

    const complaintVisibility = complaintVisibilityFilter(req.user, "c");
    const complaintWhere = ["st.value_code NOT IN ('RECEIVED', 'CONVERTED_TO_CASE')", "cs2.case_id IS NULL"];
    const complaintParams = [];

    if (iuOnly) {
        complaintWhere.push("1 = 0");
    } else if (complaintVisibility.sql) {
        complaintWhere.push(complaintVisibility.sql);
        complaintParams.push(...complaintVisibility.params);
    }

    const [caseCounts] = await db.query(
        `SELECT 'CASE' AS recordType, st.value_code AS statusCode, st.value_name AS status, COUNT(*) AS count
         FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         ${caseWhereClause}
         GROUP BY st.value_code, st.value_name`,
        caseParams
    );

    const [complaintCounts] = await db.query(
        `SELECT 'COMPLAINT' AS recordType, st.value_code AS statusCode, st.value_name AS status, COUNT(*) AS count
         FROM complaints c
         LEFT JOIN master_values st ON st.master_value_id = c.current_status_id
         LEFT JOIN cases cs2 ON cs2.complaint_id = c.complaint_id
         WHERE ${complaintWhere.join(" AND ")}
         GROUP BY st.value_code, st.value_name`,
        complaintParams
    );

    const stats = [...caseCounts, ...complaintCounts].map((row) => ({ ...row, count: Number(row.count) }));
    const total = stats.reduce((sum, row) => sum + row.count, 0);

    res.json({ stats, total });
};

const listCases = async (req, res) => {
    const { status, priority, officer, page = 1, pageSize = 20 } = req.query;

    // The filter references the joined complaints table (aliased `c` below) to
    // resolve WB Committee ownership.
    const visibility = caseVisibilityFilter(req.user, "cs", "c");
    const where = [];
    const params = [];

    if (visibility.sql) {
        where.push(visibility.sql);
        params.push(...visibility.params);
    }
    if (status) {
        where.push("cs.status_id = ?");
        params.push(status);
    }
    if (priority) {
        where.push("cs.priority_id = ?");
        params.push(priority);
    }
    if (officer) {
        where.push("cs.investigation_officer_id = ?");
        params.push(officer);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Number(pageSize) || 20, 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

    const [rows] = await db.query(
        `SELECT cs.case_id AS id, cs.case_no AS caseNo, cs.complaint_id AS complaintId,
                c.complaint_no AS complaintNo, cs.case_open_date AS caseOpenDate, cs.due_date AS dueDate,
                pr.value_name AS priority, rc.value_name AS riskCategory, st.value_name AS status,
                u.full_name AS investigationOfficer
         FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         LEFT JOIN master_values pr ON pr.master_value_id = cs.priority_id
         LEFT JOIN master_values rc ON rc.master_value_id = cs.risk_category_id
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         LEFT JOIN users u ON u.user_id = cs.investigation_officer_id
         ${whereClause}
         ORDER BY cs.case_id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const [countRows] = await db.query(
        `SELECT COUNT(*) AS total FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         ${whereClause}`,
        params
    );

    res.json({ data: rows, total: countRows[0].total, page: Number(page), pageSize: limit });
};

const getCase = async (req, res) => {
    const { id } = req.params;

    if (!(await canViewCase(id, req.user))) {
        // Same shape as a genuine miss: an Investigation Unit user should not be
        // able to probe which case numbers exist outside their assignments.
        return res.status(404).json({ message: "Case not found" });
    }

    const [cases] = await db.query(
        `SELECT cs.*, c.complaint_no AS complaintNo, c.complaint_description AS complaintDescription,
                c.date_of_receipt AS dateOfReceipt, c.ack_to_wb_date AS ackToWbDate,
                c.forwarded_to_iu_date AS forwardedToIuDate, c.wbc_owner_id AS wbcOwnerId,
                owner.full_name AS wbcOwnerName, sev.value_name AS severity,
                ct.value_name AS caseType, pr.value_name AS priority, rc.value_name AS riskCategory,
                st.value_name AS status, st.value_code AS statusCode,
                io.full_name AS investigationOfficerName, dept.department_name AS investigationUnit
         FROM cases cs
         JOIN complaints c ON c.complaint_id = cs.complaint_id
         LEFT JOIN master_values sev ON sev.master_value_id = c.severity_id
         LEFT JOIN master_values ct ON ct.master_value_id = cs.case_type_id
         LEFT JOIN master_values pr ON pr.master_value_id = cs.priority_id
         LEFT JOIN master_values rc ON rc.master_value_id = cs.risk_category_id
         LEFT JOIN master_values st ON st.master_value_id = cs.status_id
         LEFT JOIN users owner ON owner.user_id = c.wbc_owner_id
         LEFT JOIN users io ON io.user_id = cs.investigation_officer_id
         LEFT JOIN departments dept ON dept.department_id = cs.investigation_unit_id
         WHERE cs.case_id = ?`,
        [id]
    );

    const caseRow = cases[0];

    if (!caseRow) {
        return res.status(404).json({ message: "Case not found" });
    }

    await markViewed(req.user.userId, "CASE", id);

    const roles = req.user.roles || [];
    const canView = canViewIdentity(roles);

    const [complainantRows] = await db.query("SELECT * FROM complainants WHERE complaint_id = ?", [
        caseRow.complaint_id
    ]);

    const complainant = complainantRows[0];

    const [respondents] = await db.query("SELECT * FROM complaint_respondents WHERE complaint_id = ?", [
        caseRow.complaint_id
    ]);

    const [assignments] = await db.query(
        `SELECT ca.*, io.full_name AS investigationOfficerName, rv.full_name AS reviewerName,
                eo.full_name AS escalationOwnerName
         FROM case_assignments ca
         LEFT JOIN users io ON io.user_id = ca.investigation_officer_id
         LEFT JOIN users rv ON rv.user_id = ca.reviewer_id
         LEFT JOIN users eo ON eo.user_id = ca.escalation_owner_id
         WHERE ca.case_id = ?
         ORDER BY ca.assignment_id DESC LIMIT 1`,
        [id]
    );

    const [timeline] = await db.query(
        `SELECT h.*, u.full_name AS performedByName,
                EXISTS (SELECT 1 FROM user_roles ur
                        JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = h.performed_by AND ur.active_flag = 1
                          AND r.role_code IN (?)) AS performedByIu
         FROM case_status_history h
         LEFT JOIN users u ON u.user_id = h.performed_by
         WHERE h.case_id = ?
         ORDER BY h.performed_at ASC`,
        [IU_ROLES, id]
    );

    // An Investigation Unit user sees only what has been released to them —
    // attachments the complainant sent with an answer stay with the committee
    // until it forwards them.
    const [documents] = await db.query(
        `SELECT d.document_id AS id, d.document_name AS name, d.file_name AS fileName,
                d.file_size_bytes AS sizeBytes, d.uploaded_at AS uploadedAt, d.shared_with_iu AS sharedWithIu,
                cat.value_name AS category, u.full_name AS uploadedByName
         FROM documents d
         LEFT JOIN master_values cat ON cat.master_value_id = d.document_category_id
         LEFT JOIN users u ON u.user_id = d.uploaded_by
         WHERE (d.case_id = ? OR d.complaint_id = ?) AND d.is_active = 1
           ${isInvestigationUnit(roles) ? "AND d.shared_with_iu = 1" : ""}`,
        [id, caseRow.complaint_id]
    );

    const [clarifications] = await db.query(
        `SELECT cl.clarification_id AS id, cl.clarification_question AS question, cl.raised_at AS raisedAt,
                cl.response_due_date AS responseDueDate, cl.response_text AS responseText,
                cl.responded_at AS respondedAt, cl.status_code AS statusCode,
                cl.reminder_count AS reminderCount, cl.closed_reason AS closedReason,
                cl.origin, cl.shared_with_iu_text AS sharedWithIuText,
                cl.response_forwarded_at AS responseForwardedAt,
                u.full_name AS raisedByName, fwd.full_name AS forwardedByName
         FROM complaint_clarifications cl
         LEFT JOIN users u ON u.user_id = cl.raised_by
         LEFT JOIN users fwd ON fwd.user_id = cl.response_forwarded_by
         WHERE cl.complaint_id = ?
         ORDER BY cl.clarification_id DESC`,
        [caseRow.complaint_id]
    );

    const [reportCount] = await db.query(
        "SELECT COUNT(*) AS c FROM investigation_reports WHERE case_id = ?",
        [id]
    );

    const [meetingCount] = await db.query("SELECT COUNT(*) AS c FROM wbc_meetings WHERE case_id = ?", [id]);

    const openClarification = clarifications.find((c) => c.statusCode === "OPEN") || null;
    // A request the Investigation Unit has asked the committee to send on.
    const proposedClarification = clarifications.find((c) => c.statusCode === "PROPOSED") || null;
    // An answer that has arrived and is waiting for the committee to review and
    // pass to the Investigation Unit.
    const respondedClarification = clarifications.find((c) => c.statusCode === "RESPONDED") || null;

    const forIu = isInvestigationUnit(roles);

    // What the Investigation Unit is shown of the exchange with the complainant:
    // its own proposals, and answers the committee has actually forwarded — with
    // the committee's forwarded wording, never the complainant's raw text.
    const visibleClarifications = forIu
        ? clarifications
              .filter((c) => c.origin === "IU" || c.responseForwardedAt)
              .map((c) => ({
                  id: c.id,
                  question: c.question,
                  raisedAt: c.raisedAt,
                  statusCode: c.statusCode,
                  origin: c.origin,
                  raisedByName: c.raisedByName,
                  // The forwarded version only. response_text is withheld.
                  responseText: c.responseForwardedAt ? c.sharedWithIuText : null,
                  respondedAt: c.responseForwardedAt,
                  forwardedByName: c.forwardedByName,
                  closedReason: c.closedReason
              }))
        : clarifications;

    const visibleTimeline = forIu ? timeline.filter(isVisibleToIu) : timeline;

    // Requirement: the officer must be able to see when the case reached them
    // and which committee member sent it.
    const forwardedEntry = timeline.find((t) => t.action_code === "FORWARDED_TO_IU") || null;

    res.json({
        case: caseRow,
        // The identity firewall: for anyone in the Investigation Unit this is
        // withheld outright, which is the whole point of routing a case here.
        complainant: complainant
            ? {
                  isAnonymous: !!complainant.is_anonymous,
                  identityWithheld: !!complainant.is_anonymous || !canView,
                  employeeName: complainant.is_anonymous ? null : maskValue(complainant.employee_name, canView),
                  employeeId: complainant.is_anonymous ? null : maskValue(complainant.employee_id, canView),
                  email: complainant.is_anonymous ? null : maskValue(complainant.email_id, canView),
                  mobile: complainant.is_anonymous ? null : maskValue(complainant.mobile_number, canView)
              }
            : null,
        respondents,
        assignment: assignments[0] || null,
        timeline: visibleTimeline,
        documents,
        clarifications: visibleClarifications,
        // The handover record: when the case was forwarded, by whom, and with
        // what instruction.
        forwarding: forwardedEntry
            ? {
                  forwardedAt: forwardedEntry.performed_at,
                  forwardedByName: forwardedEntry.performedByName,
                  remarks: forwardedEntry.remarks
              }
            : null,
        workflow: {
            stageCode: caseRow.statusCode,
            stageLabel: CASE_STAGES[caseRow.statusCode] || caseRow.status,
            availableActions: availableCaseActions(caseRow.statusCode, roles, {
                hasOpenClarification: !!openClarification,
                hasProposal: !!proposedClarification,
                hasResponseToForward: !!respondedClarification,
                hasReport: Number(reportCount[0].c) > 0,
                hasMeeting: Number(meetingCount[0].c) > 0
            })
        },
        sla: {
            acknowledgement: dueStatus(caseRow.dateOfReceipt, SLA.ACK_DAYS, caseRow.ackToWbDate),
            forwardToIu: dueStatus(caseRow.dateOfReceipt, SLA.FORWARD_TO_IU_DAYS, caseRow.forwardedToIuDate),
            whistleblowerResponse: openClarification
                ? {
                      dueDate: toIsoDate(openClarification.responseDueDate),
                      targetDays: SLA.WB_RESPONSE_DAYS,
                      remindersSent: openClarification.reminderCount,
                      totalReminders: SLA.REMINDER_COUNT
                  }
                : null
        },
        permissions: {
            canViewIdentity: canView,
            isInvestigationUnit: isInvestigationUnit(roles)
        },
        canEdit: await canEditCase(id, req.user)
    });
};

const addCaseRemark = async (req, res) => {
    const { id } = req.params;
    const remarks = (req.body.remarks || "").trim();

    if (!remarks) {
        return res.status(400).json({ message: "Remarks are required" });
    }

    if (!(await canViewCase(id, req.user))) {
        return res.status(404).json({ message: "Case not found" });
    }

    if (!(await canEditCase(id, req.user))) {
        return res.status(403).json({ message: "You are not authorized to update this case" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        await setCaseStatus(conn, {
            caseId: id,
            toCode: null,
            actionCode: "REMARK_ADDED",
            remarks,
            userId: req.user.userId
        });

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    res.status(201).json({ message: "Remark added" });
};

// Reassigns the Investigation Unit side of a case. (Moving the WB Committee
// owner is a separate, Admin-only action on the complaint — see
// complaintController.transferComplaint.)
const assignCase = async (req, res) => {
    const { id } = req.params;
    const { investigationOfficerId, reviewerId, escalationOwnerId, investigationDueDate, remarks } = req.body;

    if (!investigationOfficerId || !escalationOwnerId) {
        return res.status(400).json({ message: "investigationOfficerId and escalationOwnerId are required" });
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [caseRows] = await conn.query(
            `SELECT cs.status_id, st.value_code AS statusCode
             FROM cases cs LEFT JOIN master_values st ON st.master_value_id = cs.status_id
             WHERE cs.case_id = ?`,
            [id]
        );

        if (!caseRows[0]) {
            await conn.rollback();
            return res.status(404).json({ message: "Case not found" });
        }

        if (caseRows[0].statusCode === "CLOSED") {
            await conn.rollback();
            return res.status(409).json({ message: "This case is closed" });
        }

        // A case already carrying a prior case_assignments row is being
        // reassigned, not assigned for the first time — the timeline
        // (and CaseDetail's "Reassign" button) should say so.
        const [existingAssignments] = await conn.query(
            "SELECT assignment_id FROM case_assignments WHERE case_id = ? LIMIT 1",
            [id]
        );

        const isReassignment = existingAssignments.length > 0;
        const actionCode = isReassignment ? "CASE_REASSIGNED" : "CASE_ASSIGNED";
        const defaultRemarks = isReassignment ? "Case reassigned" : "Case assigned";

        await conn.query(
            `INSERT INTO case_assignments
                (case_id, investigation_officer_id, reviewer_id, escalation_owner_id,
                 investigation_due_date, assignment_remarks, assigned_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                investigationOfficerId,
                reviewerId || null,
                escalationOwnerId,
                investigationDueDate || null,
                remarks || null,
                req.user.userId
            ]
        );

        await conn.query(
            `UPDATE cases SET investigation_officer_id = ?, due_date = COALESCE(?, due_date), updated_by = ?
             WHERE case_id = ?`,
            [investigationOfficerId, investigationDueDate || null, req.user.userId, id]
        );

        await conn.query("UPDATE investigations SET investigation_officer_id = ? WHERE case_id = ?", [
            investigationOfficerId,
            id
        ]);

        // A reassignment mid-flow must not rewind the case: only a case that
        // has not started moving is pushed to "Assigned".
        const rewindable = ["OPEN", "ASSIGNED"].includes(caseRows[0].statusCode);

        await setCaseStatus(conn, {
            caseId: id,
            toCode: rewindable ? "ASSIGNED" : null,
            actionCode,
            remarks: remarks || defaultRemarks,
            userId: req.user.userId
        });

        await conn.commit();

        const [officer] = await db.query("SELECT email, username FROM users WHERE user_id = ?", [
            investigationOfficerId
        ]);

        await notify({
            caseId: id,
            templateCode: "CASE_ASSIGNED",
            recipient: officer[0]?.email || officer[0]?.username || "N/A",
            mergeData: {
                assignedByRole: roleLabel(req.user.roles),
                dueDate: investigationDueDate || "no due date set"
            }
        });

        res.json({ message: isReassignment ? "Case reassigned" : "Case assigned" });
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

module.exports = {
    createCase,
    listCases,
    listWorkbench,
    getWorkbenchStats,
    getCase,
    assignCase,
    addCaseRemark,
    availableCaseActions
};
