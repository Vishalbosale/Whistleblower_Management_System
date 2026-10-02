import React, { useState } from "react";

// The WB Committee writing to the whistle-blower for more information —
// available both before the complaint is forwarded to the Investigation Unit
// and afterwards, while the case is being worked.
//
// The card doubles as the status view for a request that is already out, so
// the committee can see the deadline and how many of the three reminders have
// gone before deciding what to do next.
const DetailsRequestCard = ({ clarifications = [], sla, canRequest, canForward, onRequest, onForward, policy }) => {
    const [question, setQuestion] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sharedText, setSharedText] = useState("");
    const [forwarding, setForwarding] = useState(false);

    const open = clarifications.find((c) => c.statusCode === "OPEN");
    // The complainant has answered; it sits here until the committee reviews
    // it and decides what — if anything — the Investigation Unit may see.
    const responded = clarifications.find((c) => c.statusCode === "RESPONDED");
    // PROPOSED entries are Investigation Unit requests still awaiting the
    // committee's decision — they belong in the review card, not in history.
    const history = clarifications.filter((c) => !["OPEN", "PROPOSED", "RESPONDED"].includes(c.statusCode));

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!question.trim()) {
            return;
        }

        setSubmitting(true);

        try {
            await onRequest(question.trim());
            setQuestion("");
        } finally {
            setSubmitting(false);
        }
    };

    const handleForward = async () => {
        setForwarding(true);

        try {
            await onForward({ clarificationId: responded.id, sharedText: sharedText.trim() || undefined });
            setSharedText("");
        } finally {
            setForwarding(false);
        }
    };

    const responseDays = policy?.WB_RESPONSE_DAYS ?? 6;
    const reminderCount = policy?.REMINDER_COUNT ?? 3;
    const reminderInterval = policy?.REMINDER_INTERVAL_DAYS ?? 2;

    return (
        <div className="staff-card" id="details-request-card">
            <h2 className="staff-section-title">Additional Details from the Whistle-blower</h2>

            {open ? (
                <div className="staff-workflow-pending">
                    <p className="staff-workflow-question">“{open.question}”</p>

                    <dl className="staff-kv">
                        <dt>Requested by</dt>
                        <dd>{open.raisedByName || "-"}</dd>
                        <dt>Requested on</dt>
                        <dd>{new Date(open.raisedAt).toLocaleString()}</dd>
                        <dt>Response due</dt>
                        <dd>
                            {sla?.dueDate || String(open.responseDueDate).slice(0, 10)}{" "}
                            <span className="staff-badge staff-badge-warning">{responseDays}-day window</span>
                        </dd>
                        <dt>Reminders sent</dt>
                        <dd>
                            {open.reminderCount} of {reminderCount}
                            <span className="staff-muted">
                                {" "}
                                — sent every {reminderInterval} days
                            </span>
                        </dd>
                    </dl>

                    <p className="staff-note">
                        If nothing is received within {responseDays} days of the request, this complaint is closed
                        automatically on the WB Committee's behalf.
                    </p>
                </div>
            ) : responded ? (
                // The complainant has answered. This answer is not yet visible to
                // the Investigation Unit and stays that way until it is forwarded —
                // requirement: the response must first be received by the WB
                // Committee, which reviews it before anything reaches the IU.
                <div className="staff-workflow-pending">
                    <p className="staff-workflow-question">“{responded.question}”</p>

                    <dl className="staff-kv">
                        <dt>Response received</dt>
                        <dd>{new Date(responded.raisedAt).toLocaleString()}</dd>
                        <dt>Whistle-blower's answer</dt>
                        <dd>{responded.responseText}</dd>
                    </dl>

                    {canForward ? (
                        <>
                            <p className="staff-note">
                                Not yet visible to the Investigation Unit. Forward it as-is, or edit the wording
                                below first — this is the point to redact anything that would identify the
                                complainant before the IU sees it.
                            </p>

                            <div className="staff-remark-form">
                                <label htmlFor="sharedText">What the Investigation Unit will see (optional edit)</label>
                                <textarea
                                    id="sharedText"
                                    rows="3"
                                    value={sharedText}
                                    onChange={(e) => setSharedText(e.target.value)}
                                    placeholder={responded.responseText}
                                />
                            </div>

                            <div className="staff-actions-row" style={{ marginTop: 0 }}>
                                <button
                                    type="button"
                                    className="staff-btn staff-btn-primary"
                                    onClick={handleForward}
                                    disabled={forwarding}
                                >
                                    {forwarding ? "Forwarding..." : "Forward to Investigation Unit"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="staff-note">Awaiting the WB Committee's review before this reaches the Investigation Unit.</p>
                    )}
                </div>
            ) : (
                canRequest && (
                    <form className="staff-remark-form" onSubmit={handleSubmit}>
                        <label htmlFor="detailsQuestion">
                            What do you need from the whistle-blower?
                        </label>
                        <textarea
                            id="detailsQuestion"
                            rows="3"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="e.g. Please share the invoice numbers and the name of the vendor involved."
                        />

                        <p className="staff-note">
                            They will have {responseDays} days to reply. {reminderCount} reminders go out at{" "}
                            {reminderInterval}-day intervals, and the case closes automatically if nothing arrives.
                        </p>

                        <div className="staff-actions-row" style={{ marginTop: 0 }}>
                            <button
                                type="submit"
                                className="staff-btn staff-btn-primary"
                                disabled={submitting || !question.trim()}
                            >
                                {submitting ? "Sending..." : "Request Additional Details"}
                            </button>
                        </div>
                    </form>
                )
            )}

            {!open && !responded && !canRequest && history.length === 0 && (
                <p className="staff-empty" style={{ padding: "10px 0" }}>
                    No additional details have been requested.
                </p>
            )}

            {history.length > 0 && (
                <div className="staff-workflow-history">
                    <h3 className="staff-subsection-title">Previous requests</h3>
                    <ul className="staff-timeline">
                        {history.map((c) => (
                            <li key={c.id}>
                                <strong>{c.question}</strong>
                                {c.statusCode === "EXPIRED" ? (
                                    <span className="staff-badge staff-badge-danger">
                                        No response — closed after {responseDays} days
                                    </span>
                                ) : c.statusCode === "DECLINED" ? (
                                    <span className="staff-badge staff-badge-neutral">
                                        Investigation Unit request — not forwarded
                                    </span>
                                ) : (
                                    <span className="staff-workflow-answer">
                                        {c.responseText || "Closed without a response"}
                                    </span>
                                )}
                                <span className="staff-muted">
                                    {c.raisedByName ? `${c.raisedByName} · ` : ""}
                                    {new Date(c.raisedAt).toLocaleDateString()}
                                    {c.respondedAt ? ` · answered ${new Date(c.respondedAt).toLocaleDateString()}` : ""}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default DetailsRequestCard;
