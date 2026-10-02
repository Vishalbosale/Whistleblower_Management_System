// What the complainant is allowed to see about their own case.
//
// The post box is the one surface an outsider reads, so it works from an
// allow-list, never a deny-list: a status or event that is not named here is
// simply not shown. That way a new internal stage or action code added later
// cannot leak by default — it just doesn't appear until somebody deliberately
// maps it.
//
// Internal deliberation — committee remarks, investigator findings, DAC
// proceedings, transfers between staff — has no representation here at all.
// Note that no `remarks` field is carried through: the internal note attached
// to a status change is never surfaced, only the fact that the stage changed.

const STATUS = {
    RECEIVED: "Complaint Received",
    ACKNOWLEDGED: "Complaint Acknowledged",
    INFO_REQUIRED: "Additional Information Required",
    INFO_SUBMITTED: "Additional Information Submitted",
    CLOSED: "Case Closed"
};

// The complainant's status is derived from internal state rather than mapped
// one-to-one from it, because several internal stages collapse to the same
// outward answer. Whether a case exists at all — and everything about the
// investigation once it does (IVR_SUBMITTED, WBC_REVIEW, DAC_REVIEW) — is
// internal-only: the complainant keeps seeing "Complaint Acknowledged" the
// whole way through, right up to closure.
//
// Order matters: the most specific, most recent situation wins.
const toComplainantStatus = ({
    complaintStatusCode,
    acknowledged,
    hasCase,
    openClarification,
    respondedClarification
}) => {
    if (complaintStatusCode === "CLOSED" || complaintStatusCode === "REJECTED") {
        return STATUS.CLOSED;
    }

    // A live request for information outranks everything else — it is the one
    // status that asks the complainant to do something.
    if (openClarification) {
        return STATUS.INFO_REQUIRED;
    }

    // Their answer is in and with the committee. Shown until the case moves on.
    if (respondedClarification) {
        return STATUS.INFO_SUBMITTED;
    }

    if (hasCase || acknowledged) {
        return STATUS.ACKNOWLEDGED;
    }

    return STATUS.RECEIVED;
};

// Internal action codes that have an outward meaning, and what that meaning is.
// Anything absent is internal and is dropped.
const VISIBLE_ACTIONS = {
    ACKNOWLEDGED: STATUS.ACKNOWLEDGED,
    DETAILS_REQUESTED: STATUS.INFO_REQUIRED,
    DETAILS_RECEIVED: STATUS.INFO_SUBMITTED,
    CLOSED: STATUS.CLOSED,
    CASE_CLOSED: STATUS.CLOSED,
    CLOSED_NO_RESPONSE: STATUS.CLOSED
};

// Deliberately NOT visible, listed so the omission reads as a decision rather
// than an oversight: CASE_CREATED, CASE_ASSIGNED, CASE_REASSIGNED,
// CASE_TRANSFERRED, TRANSFERRED_TO_WBC_MEMBER (who is handling it is internal),
// FORWARDED_TO_IU (that a case exists at all is internal — the complainant
// keeps seeing "Complaint Acknowledged"), IVR_SUBMITTED, IVR_RESUBMITTED,
// IVR_CLARIFICATION_SOUGHT (investigation progress), PLACED_BEFORE_WBC,
// WBC_DECISION_RECORDED, DAC_INITIATED, DAC_CONCLUDED,
// RECOMMENDATION_IMPLEMENTED (committee and disciplinary deliberation),
// DETAILS_REQUEST_PROPOSED / _DECLINED / DETAILS_SHARED_WITH_IU (traffic
// between the IU and the committee), REMARK_ADDED (internal notes).

const toComplainantTimeline = (rows = [], clarifications = [], documents = []) => {
    const timeline = rows
        .filter((row) => VISIBLE_ACTIONS[row.action] && !["DETAILS_REQUESTED", "DETAILS_RECEIVED"].includes(row.action))
        .map((row) => ({
            status: VISIBLE_ACTIONS[row.action],
            at: row.at
        }));

    clarifications.forEach((clarification) => {
        if (clarification.raisedAt && clarification.question) {
            timeline.push({
                status: STATUS.INFO_REQUIRED,
                at: clarification.raisedAt,
                detail: clarification.question,
                detailType: "question"
            });
        }

        if (clarification.respondedAt && clarification.responseText) {
            timeline.push({
                status: STATUS.INFO_SUBMITTED,
                at: clarification.respondedAt,
                detail: clarification.responseText,
                detailType: "response"
            });
        }
    });

    const responseEntries = timeline.filter((row) => row.detailType === "response");
    documents.forEach((document) => {
        const uploadedAt = new Date(document.uploadedAt);
        const matchingResponses = responseEntries.filter((entry) => new Date(entry.at) <= uploadedAt);
        const responseEntry = matchingResponses[matchingResponses.length - 1] || responseEntries[responseEntries.length - 1];

        if (responseEntry) {
            responseEntry.documents = [...(responseEntry.documents || []), document];
        }
    });

    return timeline
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        // Collapse only duplicate plain status entries. Details remain attached
        // to each request/response so the complainant can follow the exchange.
        .filter((row, index, all) => {
            const previous = all[index - 1];
            return row.detail || !previous || previous.status !== row.status || previous.detail;
        });
};

module.exports = { STATUS, toComplainantStatus, toComplainantTimeline, VISIBLE_ACTIONS };
