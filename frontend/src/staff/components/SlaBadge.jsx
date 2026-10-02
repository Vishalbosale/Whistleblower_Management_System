import React from "react";

// Renders one deadline from the handling procedure — acknowledgement within
// 4 days, forwarding to the Investigation Unit within 5 — as a pill that says
// how much room is left, or how far past due it is.
const SlaBadge = ({ label, sla }) => {
    if (!sla) {
        return null;
    }

    const { dueDate, completed, daysRemaining, breached, targetDays } = sla;

    let variant;
    let text;

    if (completed) {
        variant = breached ? "danger" : "success";
        text = breached ? `${label}: done ${Math.abs(daysRemaining)}d late` : `${label}: done on time`;
    } else if (breached) {
        variant = "danger";
        text = `${label}: overdue by ${Math.abs(daysRemaining)}d`;
    } else if (daysRemaining <= 1) {
        variant = "warning";
        text = daysRemaining === 0 ? `${label}: due today` : `${label}: due tomorrow`;
    } else {
        variant = "info";
        text = `${label}: ${daysRemaining}d left`;
    }

    return (
        <span className={`staff-badge staff-badge-${variant}`} title={`${targetDays}-day target — due ${dueDate}`}>
            {text}
        </span>
    );
};

export default SlaBadge;
