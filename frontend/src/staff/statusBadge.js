// Maps a master value_code to a semantic badge color so staff can tell
// statuses apart at a glance instead of every status rendering the same
// gray pill.
const VARIANTS = {
    // Complaint stages
    RECEIVED: "neutral",
    UNDER_REVIEW: "info",
    ACCEPTED: "info",
    CONVERTED_TO_CASE: "info",
    REJECTED: "danger",
    CLOSED: "success",

    // Case stages, in procedure order
    OPEN: "neutral",
    ASSIGNED: "info",
    UNDER_INVESTIGATION: "info",
    // Waiting on the whistle-blower is the one stage with a deadline that
    // closes the case if it lapses, so it reads as a warning on both sides.
    INFO_REQUESTED: "warning",
    IVR_SUBMITTED: "info",
    IVR_CLARIFICATION: "warning",
    WBC_REVIEW: "warning",
    DAC_REVIEW: "warning",
    IMPLEMENTATION: "info",
    CETO_APPROVAL: "warning"
};

export const statusBadgeClass = (code) => `staff-badge staff-badge-${VARIANTS[code] || "neutral"}`;

// Timeline action codes, in the words the procedure uses.
export const ACTION_LABELS = {
    ACKNOWLEDGED: "Complaint acknowledged",
    DETAILS_REQUESTED: "Additional details requested from whistle-blower",
    DETAILS_RECEIVED: "Additional details received",
    CLOSED_NO_RESPONSE: "Closed — no response from whistle-blower",
    TRANSFERRED_TO_WBC_MEMBER: "Transferred to another WB Committee member",
    FORWARDED_TO_IU: "Forwarded to the Investigation Unit",
    CASE_CREATED: "Case opened",
    CASE_ASSIGNED: "Case assigned",
    CASE_REASSIGNED: "Case reassigned",
    IVR_SUBMITTED: "Investigation report submitted",
    IVR_RESUBMITTED: "Investigation report re-submitted",
    IVR_CLARIFICATION_SOUGHT: "Clarification sought from the Investigation Unit",
    PLACED_BEFORE_WBC: "Report placed before the WB Committee",
    WBC_DECISION_RECORDED: "WB Committee decision recorded",
    DAC_INITIATED: "DAC proceedings initiated",
    DAC_CONCLUDED: "DAC proceedings concluded",
    RECOMMENDATION_IMPLEMENTED: "Committee recommendation implemented",
    CASE_CLOSED: "Case closed",
    CLOSED: "Complaint closed",
    REMARK_ADDED: "Remark added"
};

export const actionLabel = (code) => ACTION_LABELS[code] || code;
