// Turnaround times fixed by the whistle-blower complaint-handling procedure.
// Kept in one place so the API, the reminder scheduler and the UI banners all
// quote the same numbers.
const SLA = {
    // "Acknowledgement to complainant within 4 days by WB Committee"
    ACK_DAYS: 4,
    // "Forward complaint to IU within 5 days from the date of complaint receipt"
    FORWARD_TO_IU_DAYS: 5,
    // "Complainant must provide the details within 6 days"
    WB_RESPONSE_DAYS: 6,
    // "Three reminders will be sent at the interval of 2 days"
    REMINDER_INTERVAL_DAYS: 2,
    REMINDER_COUNT: 3,
    // "On referral to IU: 90-day completion SLA, reminder every 30 days until
    // final report submission."
    IU_INVESTIGATION_DAYS: 90,
    IU_REMINDER_INTERVAL_DAYS: 30
};

const toDate = (value) => (value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T00:00:00`));

const addDays = (value, days) => {
    const date = toDate(value);
    date.setDate(date.getDate() + days);
    return date;
};

const toIsoDate = (date) => (date ? toDate(date).toISOString().slice(0, 10) : null);

// Whole days from `from` until `to`, ignoring clock time. Negative = overdue.
const daysBetween = (from, to) => {
    const start = toDate(from);
    const end = toDate(to);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return Math.round((end - start) / 86400000);
};

// Due-date + breach summary for a deadline, as consumed by the staff UI.
// `completedOn` null means the clock is still running.
const dueStatus = (startDate, days, completedOn = null) => {
    if (!startDate) {
        return null;
    }

    const dueDate = addDays(startDate, days);
    const reference = completedOn ? toDate(completedOn) : new Date();
    const daysRemaining = daysBetween(reference, dueDate);

    return {
        dueDate: toIsoDate(dueDate),
        targetDays: days,
        completed: !!completedOn,
        daysRemaining,
        breached: daysRemaining < 0
    };
};

module.exports = { SLA, addDays, toIsoDate, daysBetween, dueStatus };
