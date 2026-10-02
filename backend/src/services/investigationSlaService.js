const db = require("../config/db");
const { SLA, daysBetween, toIsoDate } = require("../utils/sla");
const { notify } = require("./notify");

// "On referral to IU: set a 90-day completion SLA. Auto-reminder to the
// assigned IU every 30 days until final report submission."
//
// The SLA clock (`cases.iu_sla_due_date`) is set once, at case creation, in
// caseController.createCase — a case exists from the moment of referral, so
// that is also the moment the clock starts. This sweep only handles the
// reminder side: it fires at day 30, 60, 90, ... for any case that has no
// investigation_reports row yet, and simply stops once one appears — a
// revision cycle after that first submission (WBC seeks clarification, IU
// resubmits) does not restart the reminders.
//
// Unlike the complaint-clarification sweep this has no reminder cap or
// auto-closure: an overdue investigation stays open and keeps nagging every
// 30 days until a report actually lands.
const runIuReminderSweep = async () => {
    const [cases] = await db.query(`
        SELECT cs.case_id AS caseId, cs.case_no AS caseNo, cs.case_open_date AS caseOpenDate,
               cs.iu_sla_due_date AS iuSlaDueDate, cs.iu_reminder_count AS reminderCount,
               u.email, u.username
        FROM cases cs
        LEFT JOIN users u ON u.user_id = cs.investigation_officer_id
        LEFT JOIN master_values st ON st.master_value_id = cs.status_id
        WHERE cs.iu_sla_due_date IS NOT NULL
          AND (st.value_code IS NULL OR st.value_code NOT IN ('CLOSED', 'REJECTED'))
          AND NOT EXISTS (SELECT 1 FROM investigation_reports ir WHERE ir.case_id = cs.case_id)
    `);

    const remindersSent = [];

    for (const row of cases) {
        const elapsed = daysBetween(row.caseOpenDate, new Date());
        const dueReminderNo = Math.floor(elapsed / SLA.IU_REMINDER_INTERVAL_DAYS);

        if (dueReminderNo > 0 && dueReminderNo > row.reminderCount) {
            await db.query("UPDATE cases SET iu_reminder_count = ? WHERE case_id = ?", [dueReminderNo, row.caseId]);

            await notify({
                caseId: row.caseId,
                templateCode: "IU_SLA_REMINDER",
                recipient: row.email || row.username,
                mergeData: {
                    reminderNo: dueReminderNo,
                    dueDate: toIsoDate(row.iuSlaDueDate)
                }
            });

            remindersSent.push({ caseId: row.caseId, caseNo: row.caseNo, reminderNo: dueReminderNo });
        }
    }

    return { checked: cases.length, remindersSent };
};

module.exports = { runIuReminderSweep };
