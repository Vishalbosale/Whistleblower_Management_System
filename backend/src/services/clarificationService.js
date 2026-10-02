const db = require("../config/db");
const { SLA, addDays, toIsoDate, daysBetween } = require("../utils/sla");
const { notify, notifyRole, complainantRecipient, truncate } = require("./notify");
const { setComplaintStatus, setCaseStatus, WorkflowError } = require("./workflowService");
const { WBC_ROLES, IU_ROLES } = require("../utils/permissions");

// "Write to WB to share additional details" — the WB Committee asking the
// whistle-blower for more information. Per the handling procedure this can be
// raised before the complaint is forwarded to the Investigation Unit (the
// "is the information sufficient to conduct an inquiry?" decision) and also
// afterwards, while the IU is already working the case.
//
// Either way the same clock applies: the complainant has 6 days, three
// reminders go out at 2-day intervals, and silence closes the file.
//
// Timing note: the due date is a calendar date (raised date + 6), so the third
// reminder goes out on day 6 and expiry is only actioned once that day has
// fully passed. The complainant is never sent a final reminder and a closure
// notice in the same breath.

const requestAdditionalDetails = async ({ complaintId, caseId = null, question, userId }) => {
    if (!question || !question.trim()) {
        throw new WorkflowError("A question for the whistle-blower is required", 400);
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [openRows] = await conn.query(
            `SELECT clarification_id, status_code FROM complaint_clarifications
             WHERE complaint_id = ? AND status_code IN ('OPEN', 'PROPOSED') LIMIT 1`,
            [complaintId]
        );

        if (openRows.length) {
            throw new WorkflowError(
                openRows[0].status_code === "PROPOSED"
                    ? "The Investigation Unit has a pending request awaiting your review — forward or decline it first"
                    : "A request for additional details is already open on this complaint"
            );
        }

        const [stageRows] = await conn.query(
            `SELECT cst.value_code AS complaintStatus, kst.value_code AS caseStatus
             FROM complaints c
             LEFT JOIN master_values cst ON cst.master_value_id = c.current_status_id
             LEFT JOIN cases cs ON cs.complaint_id = c.complaint_id
             LEFT JOIN master_values kst ON kst.master_value_id = cs.status_id
             WHERE c.complaint_id = ?`,
            [complaintId]
        );

        const stage = stageRows[0];

        if (!stage) {
            throw new WorkflowError("Complaint not found", 404);
        }

        const dueDate = toIsoDate(addDays(new Date(), SLA.WB_RESPONSE_DAYS));

        const [result] = await conn.query(
            `INSERT INTO complaint_clarifications
                (complaint_id, case_id, clarification_question, raised_by, response_due_date,
                 status_code, prior_complaint_status, prior_case_status)
             VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
            [complaintId, caseId, question.trim(), userId, dueDate, stage.complaintStatus, stage.caseStatus]
        );

        const remarks = `Additional details requested from the whistle-blower. Response due ${dueDate}.`;

        await setComplaintStatus(conn, {
            complaintId,
            toCode: "INFO_REQUESTED",
            actionCode: "DETAILS_REQUESTED",
            remarks,
            userId
        });

        if (caseId) {
            await setCaseStatus(conn, {
                caseId,
                toCode: "INFO_REQUESTED",
                actionCode: "DETAILS_REQUESTED",
                remarks,
                userId
            });
        }

        await conn.commit();

        await notify({
            complaintId,
            caseId,
            templateCode: "CLARIFICATION_REQUESTED",
            recipient: await complainantRecipient(complaintId),
            mergeData: {
                dueDate,
                responseDays: SLA.WB_RESPONSE_DAYS,
                requestedByRole: "WB Committee",
                question: truncate(question.trim())
            }
        });

        return { clarificationId: result.insertId, dueDate };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// The Investigation Unit asking for more information from the whistle-blower.
//
// The IU has no channel to the complainant — it does not know who they are, and
// must not. So its request is filed as a proposal and sits with the WB
// Committee, which either forwards it (starting the 6-day clock) or declines
// it. Nothing reaches the complainant until a committee member sends it.
const proposeAdditionalDetails = async ({ caseId, question, userId }) => {
    if (!question || !question.trim()) {
        throw new WorkflowError("A question for the whistle-blower is required", 400);
    }

    const [caseRows] = await db.query(
        `SELECT cs.case_id, cs.complaint_id, c.wbc_owner_id
         FROM cases cs JOIN complaints c ON c.complaint_id = cs.complaint_id
         WHERE cs.case_id = ?`,
        [caseId]
    );

    const caseRow = caseRows[0];

    if (!caseRow) {
        throw new WorkflowError("Case not found", 404);
    }

    const [active] = await db.query(
        `SELECT status_code FROM complaint_clarifications
         WHERE complaint_id = ? AND status_code IN ('OPEN', 'PROPOSED') LIMIT 1`,
        [caseRow.complaint_id]
    );

    if (active.length) {
        throw new WorkflowError(
            active[0].status_code === "PROPOSED"
                ? "A request is already with the WB Committee awaiting review"
                : "A request for additional details is already open with the whistle-blower"
        );
    }

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // No due date yet — the clock starts when the committee forwards it.
        const [result] = await conn.query(
            `INSERT INTO complaint_clarifications
                (complaint_id, case_id, clarification_question, raised_by, status_code, origin)
             VALUES (?, ?, ?, ?, 'PROPOSED', 'IU')`,
            [caseRow.complaint_id, caseId, question.trim(), userId]
        );

        await setCaseStatus(conn, {
            caseId,
            toCode: null,
            actionCode: "DETAILS_REQUEST_PROPOSED",
            remarks: `Investigation Unit asked the WB Committee to obtain further details: ${question.trim()}`,
            userId
        });

        await conn.commit();

        // Straight to the committee member who owns the file, falling back to
        // the whole committee if it is unowned.
        if (caseRow.wbc_owner_id) {
            const [owner] = await db.query("SELECT email, username FROM users WHERE user_id = ?", [
                caseRow.wbc_owner_id
            ]);

            await notify({
                complaintId: caseRow.complaint_id,
                caseId,
                templateCode: "DETAILS_REQUEST_PROPOSED",
                recipient: owner[0]?.email || owner[0]?.username || "N/A",
                mergeData: { requestedByRole: "Investigation Unit", question: truncate(question.trim()) }
            });
        } else {
            await notifyRole({
                roleCodes: WBC_ROLES,
                complaintId: caseRow.complaint_id,
                caseId,
                templateCode: "DETAILS_REQUEST_PROPOSED",
                mergeData: { requestedByRole: "Investigation Unit", question: truncate(question.trim()) }
            });
        }

        return { clarificationId: result.insertId, complaintId: caseRow.complaint_id };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// The committee's answer to such a proposal. Forwarding turns it into an
// ordinary request to the whistle-blower — same 6-day window, same three
// reminders, same auto-closure — optionally reworded by the committee.
const reviewProposal = async ({ clarificationId, approve, question, remarks, userId }) => {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            "SELECT * FROM complaint_clarifications WHERE clarification_id = ? AND status_code = 'PROPOSED'",
            [clarificationId]
        );

        const proposal = rows[0];

        if (!proposal) {
            throw new WorkflowError("No pending Investigation Unit request found", 404);
        }

        if (!approve) {
            await conn.query(
                `UPDATE complaint_clarifications
                 SET status_code = 'DECLINED', closed_reason = ?, forwarded_by = ?
                 WHERE clarification_id = ?`,
                [remarks || "Declined by the WB Committee", userId, clarificationId]
            );

            await setCaseStatus(conn, {
                caseId: proposal.case_id,
                toCode: null,
                actionCode: "DETAILS_REQUEST_DECLINED",
                remarks: remarks || "WB Committee declined to put this request to the whistle-blower",
                userId
            });

            await conn.commit();

            await notifyRole({
                roleCodes: IU_ROLES,
                complaintId: proposal.complaint_id,
                caseId: proposal.case_id,
                templateCode: "DETAILS_REQUEST_DECLINED"
            });

            return { forwarded: false };
        }

        const [stageRows] = await conn.query(
            `SELECT cst.value_code AS complaintStatus, kst.value_code AS caseStatus
             FROM complaints c
             LEFT JOIN master_values cst ON cst.master_value_id = c.current_status_id
             LEFT JOIN cases cs ON cs.complaint_id = c.complaint_id
             LEFT JOIN master_values kst ON kst.master_value_id = cs.status_id
             WHERE c.complaint_id = ?`,
            [proposal.complaint_id]
        );

        const dueDate = toIsoDate(addDays(new Date(), SLA.WB_RESPONSE_DAYS));
        const finalQuestion = (question || proposal.clarification_question).trim();

        // raised_at is reset so the 6-day window runs from the moment the
        // committee actually sent it, not from when the IU drafted it.
        await conn.query(
            `UPDATE complaint_clarifications
             SET status_code = 'OPEN', clarification_question = ?, response_due_date = ?,
                 raised_at = NOW(), forwarded_by = ?, reminder_count = 0,
                 prior_complaint_status = ?, prior_case_status = ?
             WHERE clarification_id = ?`,
            [
                finalQuestion,
                dueDate,
                userId,
                stageRows[0]?.complaintStatus || null,
                stageRows[0]?.caseStatus || null,
                clarificationId
            ]
        );

        const note = `Additional details requested from the whistle-blower on behalf of the Investigation Unit. Response due ${dueDate}.`;

        await setComplaintStatus(conn, {
            complaintId: proposal.complaint_id,
            toCode: "INFO_REQUESTED",
            actionCode: "DETAILS_REQUESTED",
            remarks: note,
            userId
        });

        if (proposal.case_id) {
            await setCaseStatus(conn, {
                caseId: proposal.case_id,
                toCode: "INFO_REQUESTED",
                actionCode: "DETAILS_REQUESTED",
                remarks: note,
                userId
            });
        }

        await conn.commit();

        await notify({
            complaintId: proposal.complaint_id,
            caseId: proposal.case_id,
            templateCode: "CLARIFICATION_REQUESTED",
            recipient: await complainantRecipient(proposal.complaint_id),
            mergeData: {
                dueDate,
                responseDays: SLA.WB_RESPONSE_DAYS,
                requestedByRole: "WB Committee",
                question: truncate(finalQuestion)
            }
        });

        await notifyRole({
            roleCodes: IU_ROLES,
            complaintId: proposal.complaint_id,
            caseId: proposal.case_id,
            templateCode: "DETAILS_REQUEST_FORWARDED",
            mergeData: { dueDate }
        });

        return { forwarded: true, dueDate };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// The whistle-blower answered. Close the request and put the complaint (and
// the case, if one exists) back into the stage the request interrupted.
const recordResponse = async ({ complaintId, clarificationId, responseText }) => {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT * FROM complaint_clarifications
             WHERE complaint_id = ? AND status_code = 'OPEN'
             ${clarificationId ? "AND clarification_id = ?" : ""}
             ORDER BY clarification_id DESC LIMIT 1`,
            clarificationId ? [complaintId, clarificationId] : [complaintId]
        );

        const clarification = rows[0];

        if (!clarification) {
            await conn.rollback();
            return { matched: false };
        }

        // The answer always lands with the WB Committee first. Where a case
        // exists, it stops at RESPONDED until a committee member reviews it and
        // forwards it on — the complainant's words must never travel straight
        // to the Investigation Unit. With no case yet there is nobody to
        // forward to, so the request closes here.
        const awaitingForward = !!clarification.case_id;

        await conn.query(
            `UPDATE complaint_clarifications
             SET response_text = ?, responded_at = NOW(), status_code = ?, closed_reason = ?
             WHERE clarification_id = ?`,
            [
                responseText,
                awaitingForward ? "RESPONDED" : "CLOSED",
                awaitingForward ? null : "RESPONDED",
                clarification.clarification_id
            ]
        );

        const remarks = "Additional details received from the whistle-blower.";

        // "Additional details from WB? -> Y" returns the file to the WB
        // Committee for the sufficiency decision it was parked on.
        await setComplaintStatus(conn, {
            complaintId,
            toCode: clarification.prior_complaint_status || "UNDER_REVIEW",
            actionCode: "DETAILS_RECEIVED",
            remarks
        });

        if (clarification.case_id) {
            await setCaseStatus(conn, {
                caseId: clarification.case_id,
                toCode: clarification.prior_case_status || "UNDER_INVESTIGATION",
                actionCode: "DETAILS_RECEIVED",
                remarks
            });
        }

        await conn.commit();

        // Only the committee is told. The IU learns of it when the response is
        // forwarded, not when it arrives.
        await notifyRole({
            roleCodes: WBC_ROLES,
            complaintId,
            caseId: clarification.case_id,
            templateCode: "DETAILS_RECEIVED"
        });

        return {
            matched: true,
            clarificationId: clarification.clarification_id,
            caseId: clarification.case_id,
            awaitingForward
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// The committee passing the complainant's answer on to the Investigation Unit.
//
// `sharedText` defaults to the answer verbatim, but the committee can edit it —
// it is the only party that can see both the answer and the complainant's
// identity, so it is the only one that can judge whether the raw wording would
// give the complainant away. Attachments are released at the same moment.
const forwardResponseToIu = async ({ clarificationId, sharedText, userId }) => {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            "SELECT * FROM complaint_clarifications WHERE clarification_id = ? AND status_code = 'RESPONDED'",
            [clarificationId]
        );

        const clarification = rows[0];

        if (!clarification) {
            throw new WorkflowError("No response is awaiting forwarding on this case", 404);
        }

        const forwarded = (sharedText || clarification.response_text || "").trim();

        if (!forwarded) {
            throw new WorkflowError("There is nothing to forward", 400);
        }

        await conn.query(
            `UPDATE complaint_clarifications
             SET shared_with_iu_text = ?, response_forwarded_at = NOW(), response_forwarded_by = ?,
                 status_code = 'CLOSED', closed_reason = 'FORWARDED_TO_IU'
             WHERE clarification_id = ?`,
            [forwarded, userId, clarificationId]
        );

        // Release the attachments that came with the answer.
        await conn.query(
            `UPDATE documents d
             JOIN master_values mv ON mv.master_value_id = d.document_category_id
             SET d.shared_with_iu = 1
             WHERE d.complaint_id = ? AND mv.value_code = 'CLARIFICATION_RESPONSE'`,
            [clarification.complaint_id]
        );

        await setCaseStatus(conn, {
            caseId: clarification.case_id,
            toCode: null,
            actionCode: "DETAILS_SHARED_WITH_IU",
            remarks: forwarded,
            userId
        });

        await conn.commit();

        await notifyRole({
            roleCodes: IU_ROLES,
            complaintId: clarification.complaint_id,
            caseId: clarification.case_id,
            templateCode: "DETAILS_SHARED_WITH_IU"
        });

        return { caseId: clarification.case_id, sharedText: forwarded };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

const sendReminder = async (clarification, reminderNo) => {
    await db.query(
        "UPDATE complaint_clarifications SET reminder_count = ?, last_reminder_at = NOW() WHERE clarification_id = ?",
        [reminderNo, clarification.clarification_id]
    );

    await notify({
        complaintId: clarification.complaint_id,
        caseId: clarification.case_id,
        templateCode: "CLARIFICATION_REMINDER",
        recipient: await complainantRecipient(clarification.complaint_id),
        mergeData: {
            reminderNo,
            totalReminders: SLA.REMINDER_COUNT,
            dueDate: toIsoDate(clarification.response_due_date)
        }
    });

    return { complaintId: clarification.complaint_id, reminderNo };
};

// No response inside the 6-day window: the WB Committee closes the complaint,
// and the case with it. Recorded against the raising committee member so the
// audit trail attributes the closure to the committee, not to the scheduler.
const expireClarification = async (clarification) => {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        await conn.query(
            `UPDATE complaint_clarifications
             SET status_code = 'EXPIRED', closed_reason = 'NO_RESPONSE_WITHIN_SLA'
             WHERE clarification_id = ?`,
            [clarification.clarification_id]
        );

        const remarks =
            `Closed by the WB Committee: no additional details were received from the whistle-blower ` +
            `within ${SLA.WB_RESPONSE_DAYS} days of the request (${SLA.REMINDER_COUNT} reminders sent).`;

        await setComplaintStatus(conn, {
            complaintId: clarification.complaint_id,
            toCode: "CLOSED",
            actionCode: "CLOSED_NO_RESPONSE",
            remarks,
            userId: clarification.raised_by
        });

        if (clarification.case_id) {
            await setCaseStatus(conn, {
                caseId: clarification.case_id,
                toCode: "CLOSED",
                actionCode: "CLOSED_NO_RESPONSE",
                remarks,
                userId: clarification.raised_by
            });

            await conn.query(
                `INSERT INTO case_closures (case_id, status_code, closure_date, closure_reason, closure_remarks, closed_by)
                 VALUES (?, 'CLOSED', CURDATE(), 'NO_RESPONSE_FROM_WHISTLEBLOWER', ?, ?)
                 ON DUPLICATE KEY UPDATE closure_reason = VALUES(closure_reason)`,
                [clarification.case_id, remarks, clarification.raised_by]
            );
        }

        await conn.commit();

        await notify({
            complaintId: clarification.complaint_id,
            caseId: clarification.case_id,
            templateCode: "COMPLAINT_CLOSED_NO_RESPONSE",
            recipient: await complainantRecipient(clarification.complaint_id)
        });

        return { complaintId: clarification.complaint_id, caseId: clarification.case_id };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

// One pass of the reminder/expiry clock. Idempotent — re-running it the same
// day sends nothing twice, because reminder_count gates each reminder and the
// status flip gates the closure.
const runReminderSweep = async () => {
    const [open] = await db.query(
        "SELECT * FROM complaint_clarifications WHERE status_code = 'OPEN' ORDER BY clarification_id"
    );

    const remindersSent = [];
    const expired = [];

    for (const clarification of open) {
        const elapsed = daysBetween(clarification.raised_at, new Date());
        const overdue = daysBetween(new Date(), clarification.response_due_date) < 0;

        // Reminders on day 2, 4 and 6. A sweep that has been down for a while
        // catches up to the reminder that is due now rather than firing all
        // the missed ones at once.
        const dueReminderNo = Math.min(
            Math.floor(elapsed / SLA.REMINDER_INTERVAL_DAYS),
            SLA.REMINDER_COUNT
        );

        if (dueReminderNo > clarification.reminder_count) {
            remindersSent.push(await sendReminder(clarification, dueReminderNo));
        }

        if (overdue) {
            expired.push(await expireClarification(clarification));
        }
    }

    return { checked: open.length, remindersSent, expired };
};

module.exports = {
    requestAdditionalDetails,
    proposeAdditionalDetails,
    reviewProposal,
    recordResponse,
    forwardResponseToIu,
    runReminderSweep
};
