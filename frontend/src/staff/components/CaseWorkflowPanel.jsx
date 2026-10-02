import React, { useState } from "react";
import { useMasters } from "../../context/MastersContext";

// The stage-appropriate half of the case screen. `availableActions` comes from
// the server, which computes it from the case's current stage and the caller's
// role — so this component only decides how each action looks, never whether
// it is offered. Every action is re-checked server side when submitted.

const Field = ({ label, children, full }) => (
    <div className={`staff-form-group${full ? " full-width" : ""}`}>
        <label>{label}</label>
        {children}
    </div>
);

// "Submission of IVR by IU", and the resubmission that answers a committee
// query. A pending clarification is shown inline so the investigator is
// answering the actual question rather than working from memory.
const InvestigationReportForm = ({ openClarification, latestReport, onSubmit }) => {
    const [form, setForm] = useState({
        findings: "",
        rootCause: "",
        evidenceSummary: "",
        recommendation: "",
        conclusion: "",
        clarificationResponse: ""
    });
    const [files, setFiles] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            // Report and evidence go up together, so the findings are never
            // filed without the documents that support them.
            const payload = new FormData();

            Object.entries(form).forEach(([key, value]) => {
                if (value) {
                    payload.append(key, value);
                }
            });

            files.forEach((file) => payload.append("files", file));

            await onSubmit(payload);
            setFiles([]);
        } finally {
            setSubmitting(false);
        }
    };

    const isResubmission = !!latestReport;

    return (
        <form className="staff-card" id="investigation-report-form" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">
                {isResubmission ? "Re-submit the Investigation Report" : "Submit the Investigation Report (IVR)"}
            </h2>

            {openClarification && (
                <div className="staff-readonly-banner">
                    <strong>The WB Committee has asked for clarification:</strong>
                    <br />
                    {openClarification.details}
                </div>
            )}

            <div className="staff-form-grid">
                <Field label="Findings *" full>
                    <textarea rows="4" value={form.findings} onChange={set("findings")} required />
                </Field>

                <Field label="Root Cause" full>
                    <textarea rows="3" value={form.rootCause} onChange={set("rootCause")} />
                </Field>

                <Field label="Evidence Summary" full>
                    <textarea rows="3" value={form.evidenceSummary} onChange={set("evidenceSummary")} />
                </Field>

                <Field label="Recommendation" full>
                    <textarea rows="3" value={form.recommendation} onChange={set("recommendation")} />
                </Field>

                <Field label="Conclusion *" full>
                    <textarea rows="3" value={form.conclusion} onChange={set("conclusion")} required />
                </Field>

                {openClarification && (
                    <Field label="Response to the committee's clarification" full>
                        <textarea rows="3" value={form.clarificationResponse} onChange={set("clarificationResponse")} />
                    </Field>
                )}

                <Field label="Supporting Documents" full>
                    <input
                        type="file"
                        multiple
                        onChange={(e) => setFiles(Array.from(e.target.files || []))}
                    />
                    <p className="staff-note" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>
                        Evidence, working papers, statements. Attached to this version of the report and
                        downloadable by the WB Committee. Up to 10 files, 25&nbsp;MB each.
                    </p>

                    {files.length > 0 && (
                        <ul className="staff-file-preview">
                            {files.map((file) => (
                                <li key={file.name}>{file.name}</li>
                            ))}
                        </ul>
                    )}
                </Field>
            </div>

            <div className="staff-actions-row">
                <button type="submit" className="staff-btn staff-btn-primary" disabled={submitting}>
                    {submitting
                        ? "Submitting..."
                        : isResubmission
                          ? "Re-submit Report"
                          : `Submit Report${files.length ? ` with ${files.length} document(s)` : ""}`}
                </button>
            </div>
        </form>
    );
};

// The Investigation Unit asking the committee to obtain something from the
// whistle-blower. The IU has no channel of its own — it does not know who the
// complainant is — so the committee sends it or declines it.
const ProposeDetailsForm = ({ onSubmit }) => {
    const [question, setQuestion] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            await onSubmit({ question });
            setQuestion("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="staff-card" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">Ask the WB Committee for More Details</h2>
            <p className="staff-note">
                Write the question here and the WB Committee will provide the details.
            </p>

            <div className="staff-remark-form">
                <textarea
                    rows="3"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. Can the complainant confirm which branch raised these payments?"
                />
            </div>

            <div className="staff-actions-row" style={{ marginTop: 0 }}>
                <button type="submit" className="staff-btn" disabled={submitting || !question.trim()}>
                    {submitting ? "Sending..." : "Send to WB Committee"}
                </button>
            </div>
        </form>
    );
};

// The committee's side of that relay: forward it (optionally reworded, since
// the committee is the one who has to phrase it for the complainant) or decline.
const ReviewProposalCard = ({ proposal, onReview }) => {
    const [question, setQuestion] = useState(proposal.question);
    const [remarks, setRemarks] = useState("");
    const [busy, setBusy] = useState(null);

    const run = async (approve) => {
        setBusy(approve ? "approve" : "decline");

        try {
            await onReview({ clarificationId: proposal.id, approve, question, remarks: remarks || null });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="staff-card" id="wbc-review-proposal">
            <h2 className="staff-section-title">Investigation Unit Request — Awaiting Your Decision</h2>

            <p className="staff-note">
                {proposal.raisedByName || "The Investigation Unit"} has asked you to obtain this from the
                whistle-blower. Nothing has been sent yet. Forwarding it starts the 6-day response window.
            </p>

            <div className="staff-form-grid">
                <Field label="Question to put to the whistle-blower" full>
                    <textarea rows="3" value={question} onChange={(e) => setQuestion(e.target.value)} />
                    <p className="staff-note" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>
                        Reword this if it would identify the investigation or the respondent.
                    </p>
                </Field>

                <Field label="Remarks (recorded on the case; shown to the IU if you decline)" full>
                    <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Field>
            </div>

            <div className="staff-actions-row">
                <button
                    type="button"
                    className="staff-btn staff-btn-primary"
                    onClick={() => run(true)}
                    disabled={!!busy || !question.trim()}
                >
                    {busy === "approve" ? "Forwarding..." : "Forward to Whistle-blower"}
                </button>

                <button type="button" className="staff-btn" onClick={() => run(false)} disabled={!!busy}>
                    {busy === "decline" ? "Declining..." : "Decline"}
                </button>
            </div>
        </div>
    );
};

// "Clarification required for IVR submitted? -> Y" — back to the IU.
const SeekClarificationForm = ({ onSubmit }) => {
    const [details, setDetails] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            await onSubmit({ details, responseDueDate: dueDate || null });
            setDetails("");
            setDueDate("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="staff-card" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">Seek Clarification from the Investigation Unit</h2>
            <p className="staff-note">
                Sends the report back to the Investigation Unit. They answer by submitting a new version.
            </p>

            <div className="staff-form-grid">
                <Field label="What needs clarifying? *" full>
                    <textarea rows="3" value={details} onChange={(e) => setDetails(e.target.value)} required />
                </Field>

                <Field label="Response Due Date">
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
            </div>

            <div className="staff-actions-row">
                <button type="submit" className="staff-btn" disabled={submitting || !details.trim()}>
                    {submitting ? "Sending..." : "Seek Clarification"}
                </button>
            </div>
        </form>
    );
};

// "Report and observations placed before WB Committee."
const PlaceBeforeCommitteeForm = ({ committeeMembers, onSubmit }) => {
    const [form, setForm] = useState({ meetingDate: "", agenda: "", observations: "" });
    const [memberIds, setMemberIds] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const toggleMember = (memberId) =>
        setMemberIds((ids) => (ids.includes(memberId) ? ids.filter((i) => i !== memberId) : [...ids, memberId]));

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            await onSubmit({ ...form, memberIds });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="staff-card" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">Place the Report Before the WB Committee</h2>

            <div className="staff-form-grid">
                <Field label="Meeting Date">
                    <input
                        type="date"
                        value={form.meetingDate}
                        onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
                    />
                </Field>

                <Field label="Agenda" full>
                    <textarea
                        rows="2"
                        value={form.agenda}
                        onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
                        placeholder="Consideration of the investigation report"
                    />
                </Field>

                <Field label="Observations" full>
                    <textarea
                        rows="3"
                        value={form.observations}
                        onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                    />
                </Field>

                <Field label="Members Present" full>
                    <div className="staff-checkbox-list">
                        {committeeMembers.map((m) => (
                            <label key={m.id} className="staff-checkbox">
                                <input
                                    type="checkbox"
                                    checked={memberIds.includes(m.id)}
                                    onChange={() => toggleMember(m.id)}
                                />
                                <span>{m.fullName}</span>
                            </label>
                        ))}
                    </div>
                </Field>
            </div>

            <div className="staff-actions-row">
                <button type="submit" className="staff-btn staff-btn-primary" disabled={submitting}>
                    {submitting ? "Recording..." : "Place Before Committee"}
                </button>
            </div>
        </form>
    );
};

// "Execute WB Committee decision" and the "Recommended by WB Committee?
// (DAC/Other)" fork.
const DecisionForm = ({ committeeMembers, onSubmit }) => {
    const recommendations = useMasters("RECOMMENDATION_TYPE");
    const [form, setForm] = useState({
        recommendation: "",
        actionTaken: "",
        decisionRemarks: "",
        chairpersonId: ""
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            await onSubmit({
                recommendation: form.recommendation,
                actionTaken: form.actionTaken,
                decisionRemarks: form.decisionRemarks || null,
                chairpersonId: form.chairpersonId ? Number(form.chairpersonId) : null
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="staff-card" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">Record the WB Committee Decision</h2>

            <div className="staff-form-grid">
                <Field label="Recommendation *">
                    <select
                        value={form.recommendation}
                        onChange={(e) => setForm((f) => ({ ...f, recommendation: e.target.value }))}
                        required
                    >
                        <option value="">Select</option>
                        {recommendations.map((r) => (
                            <option key={r.code} value={r.code}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                </Field>

                {form.recommendation === "DAC" && (
                    <Field label="DAC Chairperson">
                        <select
                            value={form.chairpersonId}
                            onChange={(e) => setForm((f) => ({ ...f, chairpersonId: e.target.value }))}
                        >
                            <option value="">Select</option>
                            {committeeMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.fullName}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}

                <Field label="Decision / Action Taken *" full>
                    <textarea
                        rows="3"
                        value={form.actionTaken}
                        onChange={(e) => setForm((f) => ({ ...f, actionTaken: e.target.value }))}
                        required
                    />
                </Field>

                <Field label="Remarks" full>
                    <textarea
                        rows="2"
                        value={form.decisionRemarks}
                        onChange={(e) => setForm((f) => ({ ...f, decisionRemarks: e.target.value }))}
                    />
                </Field>
            </div>

            {form.recommendation === "DAC" && (
                <p className="staff-note">Disciplinary proceedings will be opened and a DAC reference issued.</p>
            )}

            <div className="staff-actions-row">
                <button
                    type="submit"
                    className="staff-btn staff-btn-primary"
                    disabled={submitting || !form.recommendation || !form.actionTaken.trim()}
                >
                    {submitting ? "Recording..." : "Record Decision"}
                </button>
            </div>
        </form>
    );
};

// "Initiate appropriate DAC proceedings / other actions" — the outcome.
const DacOutcomeForm = ({ onSubmit }) => {
    const outcomes = useMasters("DAC_OUTCOME");
    const [form, setForm] = useState({ outcome: "", decisionSummary: "", penaltyDetails: "" });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            await onSubmit(form);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="staff-card" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">Record the DAC Outcome</h2>

            <div className="staff-form-grid">
                <Field label="Outcome *">
                    <select
                        value={form.outcome}
                        onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
                        required
                    >
                        <option value="">Select</option>
                        {outcomes.map((o) => (
                            <option key={o.code} value={o.code}>
                                {o.name}
                            </option>
                        ))}
                    </select>
                </Field>

                <Field label="Decision Summary" full>
                    <textarea
                        rows="3"
                        value={form.decisionSummary}
                        onChange={(e) => setForm((f) => ({ ...f, decisionSummary: e.target.value }))}
                    />
                </Field>

                <Field label="Penalty Details" full>
                    <textarea
                        rows="2"
                        value={form.penaltyDetails}
                        onChange={(e) => setForm((f) => ({ ...f, penaltyDetails: e.target.value }))}
                    />
                </Field>
            </div>

            <div className="staff-actions-row">
                <button type="submit" className="staff-btn staff-btn-primary" disabled={submitting || !form.outcome}>
                    {submitting ? "Recording..." : "Record DAC Outcome"}
                </button>
            </div>
        </form>
    );
};

// "Implement committee recommendations."
const ImplementationForm = ({ onSubmit }) => {
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            await onSubmit({ notes });
            setNotes("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="staff-card" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">Implement Committee Recommendations</h2>
            <p className="staff-note">Record each step as it is completed. The case stays open until you close it.</p>

            <div className="staff-remark-form">
                <textarea
                    rows="3"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Warning letter issued; recovery initiated through payroll."
                />
            </div>

            <div className="staff-actions-row" style={{ marginTop: 0 }}>
                <button type="submit" className="staff-btn" disabled={submitting || !notes.trim()}>
                    {submitting ? "Recording..." : "Record Implementation"}
                </button>
            </div>
        </form>
    );
};

// "Send suitable response to WB towards the closure of complaint. Case Closure."
const ClosureForm = ({ onSubmit }) => {
    const [form, setForm] = useState({ closureReason: "", responseToWhistleblower: "", remarks: "" });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!window.confirm("Close this case and send the response to the whistle-blower?")) {
            return;
        }

        setSubmitting(true);

        try {
            await onSubmit(form);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="staff-card" onSubmit={handleSubmit}>
            <h2 className="staff-section-title">Close the Case</h2>
            <p className="staff-note">
                The response below is sent to the whistle-blower — to their email, or to their post box if the
                complaint was anonymous.
            </p>

            <div className="staff-form-grid">
                <Field label="Closure Reason *" full>
                    <textarea
                        rows="2"
                        value={form.closureReason}
                        onChange={(e) => setForm((f) => ({ ...f, closureReason: e.target.value }))}
                        required
                    />
                </Field>

                <Field label="Response to the Whistle-blower *" full>
                    <textarea
                        rows="4"
                        value={form.responseToWhistleblower}
                        onChange={(e) => setForm((f) => ({ ...f, responseToWhistleblower: e.target.value }))}
                        placeholder="Explain the outcome in terms the complainant can act on."
                        required
                    />
                </Field>

                <Field label="Internal Remarks" full>
                    <textarea
                        rows="2"
                        value={form.remarks}
                        onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                    />
                </Field>
            </div>

            <div className="staff-actions-row">
                <button
                    type="submit"
                    className="staff-btn staff-btn-danger"
                    disabled={submitting || !form.closureReason.trim() || !form.responseToWhistleblower.trim()}
                >
                    {submitting ? "Closing..." : "Close Case and Respond"}
                </button>
            </div>
        </form>
    );
};

const CaseWorkflowPanel = ({
    availableActions = [],
    investigation,
    committeeMembers,
    proposal,
    handlers
}) => {
    const has = (action) => availableActions.includes(action);

    return (
        <>
            {/* The committee's decision on an IU request comes first — it is
                blocking someone else's work. */}
            {has("REVIEW_DETAILS_PROPOSAL") && proposal && (
                <ReviewProposalCard proposal={proposal} onReview={handlers.reviewProposal} />
            )}

            {has("SUBMIT_IVR") && (
                <InvestigationReportForm
                    openClarification={investigation?.openClarification}
                    latestReport={investigation?.reports?.[0]}
                    onSubmit={handlers.submitReport}
                />
            )}

            {has("PROPOSE_DETAILS_REQUEST") && <ProposeDetailsForm onSubmit={handlers.proposeDetails} />}

            {has("PLACE_BEFORE_WBC") && (
                <PlaceBeforeCommitteeForm
                    committeeMembers={committeeMembers}
                    onSubmit={handlers.placeBeforeCommittee}
                />
            )}

            {has("SEEK_IVR_CLARIFICATION") && <SeekClarificationForm onSubmit={handlers.seekClarification} />}

            {has("WBC_DECISION") && (
                <DecisionForm committeeMembers={committeeMembers} onSubmit={handlers.recordDecision} />
            )}

            {has("DAC_OUTCOME") && <DacOutcomeForm onSubmit={handlers.recordDacOutcome} />}

            {has("IMPLEMENT") && <ImplementationForm onSubmit={handlers.recordImplementation} />}

            {has("CLOSE") && <ClosureForm onSubmit={handlers.closeCase} />}
        </>
    );
};

export default CaseWorkflowPanel;
