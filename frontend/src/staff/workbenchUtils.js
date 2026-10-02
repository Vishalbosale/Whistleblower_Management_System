// Shared by CaseWorkbench (WBC/Admin) and MyCases (IU) — both render the same
// case/complaint rows returned by GET /cases/workbench, just with different
// framing, so the small pure helpers for reading those rows live here once.

// Closed and Rejected are the two terminal states: nothing about them is
// "due", so they stay out of due-date math entirely.
export const TERMINAL_CODES = ["CLOSED", "REJECTED"];

// MySQL hands back dates as UTC-stamped strings; reading the calendar day out
// of them locally keeps "due today" from flipping a day either side of noon.
export const toLocalDay = (value) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
};

export const startOfToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export const daysUntil = (value) => Math.round((toLocalDay(value) - startOfToday()) / 86400000);

export const relativeDue = (days) => {
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `In ${days} days`;
};

export const initialsOf = (name) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase() || "?";

export const priorityClass = (priority) => {
    const value = (priority || "").toLowerCase();
    if (value.includes("high") || value.includes("critical") || value.includes("urgent")) return "wb-prio-high";
    if (value.includes("med") || value.includes("moderate")) return "wb-prio-medium";
    if (value.includes("low")) return "wb-prio-low";
    return "";
};

// Who is carrying the file: the Investigation Unit officer once it is a case,
// the WB Committee member who owns the complaint before that.
export const ownerOf = (row) =>
    row.recordType === "CASE" ? row.assignedTo || null : row.assignedTo || row.wbcOwnerName || null;
