const { runReminderSweep } = require("./clarificationService");
const { runIuReminderSweep } = require("./investigationSlaService");

// Drives the reminder/auto-close clock for outstanding additional-details
// requests. An in-process timer is deliberate for this phase: it needs no
// extra infrastructure, and the sweep is idempotent, so a restart at any point
// simply picks the schedule back up. Swap it for a real job runner (cron,
// Agenda, a queue) when the deployment gains one.
//
// The sweep is also exposed over the API (POST /api/admin/sla/run) so an
// administrator — or a test — can force a pass instead of waiting for the tick.

const DEFAULT_INTERVAL_MINUTES = 60;

let timer = null;

const runOnce = async (label = "scheduled") => {
    try {
        const result = await runReminderSweep();
        const iuResult = await runIuReminderSweep();

        if (result.remindersSent.length || result.expired.length) {
            console.log(
                `[sla] ${label} sweep: ${result.remindersSent.length} reminder(s) sent, ` +
                    `${result.expired.length} complaint(s) closed for no response`
            );
        }

        if (iuResult.remindersSent.length) {
            console.log(`[sla] ${label} sweep: ${iuResult.remindersSent.length} IU SLA reminder(s) sent`);
        }

        return { ...result, iu: iuResult };
    } catch (error) {
        // A failed sweep must not take the API process down with it — the next
        // tick retries, and nothing has been half-applied (each clarification
        // is handled in its own transaction).
        console.error("[sla] sweep failed:", error.message);
        throw error;
    }
};

const start = ({ intervalMinutes = Number(process.env.SLA_SWEEP_MINUTES) || DEFAULT_INTERVAL_MINUTES } = {}) => {
    if (timer) {
        return timer;
    }

    runOnce("startup").catch(() => {});

    timer = setInterval(() => {
        runOnce().catch(() => {});
    }, intervalMinutes * 60 * 1000);

    // Don't hold the event loop open on shutdown.
    timer.unref?.();

    console.log(`[sla] reminder sweep running every ${intervalMinutes} minute(s)`);

    return timer;
};

const stop = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

module.exports = { start, stop, runOnce };
