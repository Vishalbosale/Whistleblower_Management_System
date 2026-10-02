import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { statusBadgeClass, actionLabel } from "../statusBadge";
import SlaBadge from "../components/SlaBadge";
import DetailsRequestCard from "../components/DetailsRequestCard";
import DocumentList from "../components/DocumentList";
import StaffAlertBanner from "../components/StaffAlertBanner";
import "./CaseDetail.css";

// The WB Committee's view of a complaint, from arrival through to the point it
// is either forwarded to the Investigation Unit or closed. The steps rendered
// here follow the handling procedure: acknowledge within 4 days, decide whether
// the information is sufficient, then forward within 5 days or write back to
// the whistle-blower for more.
//
// Layout note: reuses CaseDetail.css's summary-bar/tabs/cd-kv2 classes so a
// complaint reads the same way a case does — every field and permission
// check below is unchanged, only regrouped into a pinned summary bar + tabs.
const TABS = [
    { id: "overview", label: "Overview" },
    { id: "actions", label: "Actions" },
    { id: "documents", label: "Documents" },
    { id: "history", label: "History" }
];

const ComplaintDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [policy, setPolicy] = useState(null);
    const [error, setError] = useState("");
    const [actionMessage, setActionMessage] = useState("");
    const [acking, setAcking] = useState(false);
    const [routing, setRouting] = useState(null);
    const [ackRemarks, setAckRemarks] = useState("");

    const [committeeMembers, setCommitteeMembers] = useState([]);
    const [investigators, setInvestigators] = useState([]);
    const [transferTo, setTransferTo] = useState("");
    const [transferRemarks, setTransferRemarks] = useState("");
    const [forwardForm, setForwardForm] = useState({ investigationOfficerId: "", dueDate: "", remarks: "" });
    const [closeRemarks, setCloseRemarks] = useState("");
    const [activeTab, setActiveTab] = useState("overview");

    const load = useCallback(async () => {
        setError("");

        try {
            const result = await api.get(`/complaints/${id}`, { auth: true });
            setData(result);
        } catch (err) {
            setError(err.message);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    // A new complaint id starts back on Overview rather than keeping whichever
    // tab was open on the last one.
    useEffect(() => {
        setActiveTab("overview");
    }, [id]);

    useEffect(() => {
        // Only Admins can read the SLA config endpoint; everyone else falls back
        // to the defaults baked into the cards.
        api.get("/admin/sla/config", { auth: true }).then(setPolicy).catch(() => {});
        api.get("/users?group=WBC&activeOnly=1", { auth: true }).then(setCommitteeMembers).catch(() => {});
        api.get("/users?group=IU&activeOnly=1", { auth: true }).then(setInvestigators).catch(() => {});
    }, []);

    const run = async (label, fn) => {
        setActionMessage("");
        setError("");

        try {
            const result = await fn();
            setActionMessage(result?.message || label);
            await load();
            return result;
        } catch (err) {
            setError(err.message);
            return null;
        }
    };

    const handleAcknowledge = async () => {
        setAcking(true);

        try {
            await run("Complaint acknowledged.", () =>
                api.patch(`/complaints/${id}/acknowledge`, { remarks: ackRemarks || undefined }, { auth: true })
            );
            setAckRemarks("");
        } finally {
            setAcking(false);
        }
    };

    const handleRequestDetails = (question) =>
        run("Additional details requested.", () =>
            api.post(`/complaints/${id}/request-details`, { question }, { auth: true })
        );

    const handleTransfer = async (event) => {
        event.preventDefault();

        if (!transferTo) {
            return;
        }

        const result = await run("Complaint transferred.", () =>
            api.patch(
                `/complaints/${id}/transfer`,
                { wbcOwnerId: Number(transferTo), remarks: transferRemarks || undefined },
                { auth: true }
            )
        );

        if (result) {
            setTransferTo("");
            setTransferRemarks("");
        }
    };

    const handleForward = async (event) => {
        event.preventDefault();

        if (!forwardForm.investigationOfficerId) {
            return;
        }

        const result = await run("Forwarded to the Investigation Unit.", () =>
            api.post(
                `/complaints/${id}/forward-to-iu`,
                {
                    investigationOfficerId: Number(forwardForm.investigationOfficerId),
                    dueDate: forwardForm.dueDate || null,
                    remarks: forwardForm.remarks || null
                },
                { auth: true }
            )
        );

        if (result?.caseId) {
            navigate(`/staff/cases/${result.caseId}`);
        }
    };

    const handleRoute = async (target) => {
        if (
            target === "CLOSE" &&
            !window.confirm("Close this complaint and send a closing response to the whistle-blower?")
        ) {
            return;
        }

        setRouting(target);

        try {
            const result = await run("Complaint routed.", () =>
                api.patch(`/complaints/${id}/route`, { target, remarks: closeRemarks || undefined }, { auth: true })
            );

            if (result?.caseId) {
                navigate(`/staff/cases/${result.caseId}`);
            }
        } finally {
            setRouting(null);
        }
    };

    if (error && !data) {
        return <div className="staff-error">{error}</div>;
    }

    if (!data) {
        return <div className="staff-empty">Loading...</div>;
    }

    const { complaint, complainant, respondents, documents, history, clarifications, sla, permissions } = data;
    const isClosed = complaint.statusCode === "CLOSED" || complaint.statusCode === "REJECTED";
    const forwarded = !!data.case;
    const respondedRequest = clarifications?.find((c) => c.statusCode === "RESPONDED");

    // Newest first, per the redesign — same treatment as the Case Timeline.
    const historyNewestFirst = history ? [...history].reverse() : [];

    const hasActionsContent =
        permissions.canAcknowledge ||
        permissions.canForward ||
        permissions.canTransfer ||
        (permissions.canClose && !forwarded) ||
        !isClosed;

    const goToActionsTab = () => setActiveTab("actions");

    return (
        <div>
            <div className="cd-summary-bar">
                <div className="cd-summary-top">
                    <div className="cd-summary-id">
                        <h1>{complaint.complaint_no}</h1>
                        <span className={statusBadgeClass(complaint.statusCode)}>{complaint.statusName}</span>
                        <SlaBadge label="Acknowledgement" sla={sla.acknowledgement} />
                        {complaint.ack_to_wb_date && !forwarded && !isClosed && (
                            <SlaBadge label="Forward to IU" sla={sla.forwardToIu} />
                        )}
                    </div>

                    {data.case && (
                        <div className="cd-summary-actions">
                            <button
                                type="button"
                                className="staff-btn staff-btn-primary"
                                onClick={() => navigate(`/staff/cases/${data.case.id}`)}
                            >
                                View Case {data.case.caseNo}
                            </button>
                        </div>
                    )}
                </div>

                <dl className="cd-summary-facts">
                    <div className="cd-fact">
                        <dt className="cd-fact-label">Date of Receipt</dt>
                        <dd className="cd-fact-value">{complaint.date_of_receipt?.slice(0, 10)}</dd>
                    </div>
                    <div className="cd-fact">
                        <dt className="cd-fact-label">WB Committee Owner</dt>
                        <dd className="cd-fact-value">{complaint.wbcOwnerName || "Unassigned"}</dd>
                    </div>
                    <div className="cd-fact">
                        <dt className="cd-fact-label">Forwarded to IU</dt>
                        <dd className="cd-fact-value">
                            {complaint.forwarded_to_iu_date ? complaint.forwarded_to_iu_date.slice(0, 10) : "-"}
                        </dd>
                    </div>
                </dl>
            </div>

            {actionMessage && <div className="staff-success">{actionMessage}</div>}
            {error && <div className="staff-error">{error}</div>}

            {respondedRequest && !isClosed && !forwarded && (
                <StaffAlertBanner icon="megaphone" anchor="details-request-card" onNavigate={goToActionsTab}>
                    The whistle-blower has responded to your request for additional details — review it below.
                </StaffAlertBanner>
            )}

            {data.case && (
                <div className="staff-readonly-banner">
                    This complaint has been forwarded to the Investigation Unit as{" "}
                    <button type="button" className="staff-link-btn" onClick={() => navigate(`/staff/cases/${data.case.id}`)}>
                        {data.case.caseNo}
                    </button>
                    {data.case.investigationOfficerName ? ` (${data.case.investigationOfficerName})` : ""}. Continue the
                    workflow from the case screen.
                </div>
            )}

            <div className="cd-tabs" role="tablist">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        className={`cd-tab${activeTab === tab.id ? " is-active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                        {tab.id === "actions" && respondedRequest && !isClosed && !forwarded && (
                            <span className="cd-tab-dot" aria-label="Needs attention" />
                        )}
                    </button>
                ))}
            </div>

            <div className="cd-panel" role="tabpanel">
                {activeTab === "overview" && (
                    <>
                        <div className="staff-card">
                            <h2 className="staff-section-title">Complaint Summary</h2>
                            <dl className="staff-kv cd-kv2">
                                <dt>Acknowledged On</dt>
                                <dd>{complaint.ack_to_wb_date ? complaint.ack_to_wb_date.slice(0, 10) : "Not acknowledged"}</dd>
                                <dt>Channel</dt>
                                <dd>{complaint.channelName}</dd>
                                <dt>Nature</dt>
                                <dd>{complaint.natureName}</dd>
                                <dt>Classification</dt>
                                <dd>{complaint.classificationName || "-"}</dd>
                                <dt>Severity</dt>
                                <dd>{complaint.severityName}</dd>
                            </dl>
                            <h3 className="staff-subsection-title">Description</h3>
                            <p className="staff-note" style={{ margin: 0 }}>
                                {complaint.complaint_description}
                            </p>
                        </div>

                        <div className="staff-card">
                            <h2 className="staff-section-title">Complainant</h2>
                            {complainant?.isAnonymous ? (
                                <p>This complaint was submitted anonymously.</p>
                            ) : complainant?.identityWithheld ? (
                                <p>The complainant's identity is withheld from your role.</p>
                            ) : (
                                <dl className="staff-kv cd-kv2">
                                    <dt>Name</dt>
                                    <dd>{complainant?.employeeName || "-"}</dd>
                                    <dt>Email</dt>
                                    <dd>{complainant?.email || "-"}</dd>
                                    <dt>Mobile</dt>
                                    <dd>{complainant?.mobile || "-"}</dd>
                                    <dt>Branch</dt>
                                    <dd>{complainant?.branch || "-"}</dd>
                                    <dt>Region</dt>
                                    <dd>{complainant?.region || "-"}</dd>
                                </dl>
                            )}
                        </div>

                        {respondents?.length > 0 && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Respondent(s)</h2>
                                {respondents.map((r) => (
                                    <dl className="staff-kv cd-kv2" key={r.respondent_id} style={{ marginBottom: 10 }}>
                                        <dt>Name</dt>
                                        <dd>{r.employee_name || "-"}</dd>
                                        <dt>Department</dt>
                                        <dd>{r.department_name || "-"}</dd>
                                        <dt>Remarks</dt>
                                        <dd>{r.remarks || "-"}</dd>
                                    </dl>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === "actions" && (
                    <>
                        {/* Step 2 — acknowledgement to the complainant within 4 days. */}
                        {permissions.canAcknowledge && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Step 1 — Acknowledge the Complaint</h2>
                                <p className="staff-note">
                                    The procedure requires the WB Committee to acknowledge a complaint within 4 days
                                    of receipt. Acknowledging also makes you the owner of this complaint.
                                </p>

                                <div className="staff-remark-form">
                                    <label htmlFor="ackRemarks">Remarks (visible to the complainant)</label>
                                    <textarea
                                        id="ackRemarks"
                                        rows="3"
                                        value={ackRemarks}
                                        onChange={(e) => setAckRemarks(e.target.value)}
                                        placeholder="Optional remarks for the complainant..."
                                    />
                                </div>

                                <div className="staff-actions-row">
                                    <button
                                        type="button"
                                        className="staff-btn staff-btn-primary"
                                        onClick={handleAcknowledge}
                                        disabled={acking}
                                    >
                                        {acking ? "Acknowledging..." : "Acknowledge Complaint"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* "Is the information sufficient to conduct an inquiry?" — the N branch. */}
                        {!isClosed && (
                            <DetailsRequestCard
                                clarifications={clarifications}
                                sla={sla.whistleblowerResponse}
                                canRequest={permissions.canRequestDetails}
                                onRequest={handleRequestDetails}
                                policy={policy}
                            />
                        )}

                        {/* The Y branch — forward to the Investigation Unit within 5 days. */}
                        {permissions.canForward && (
                            <form className="staff-card" onSubmit={handleForward}>
                                <h2 className="staff-section-title">Step 2 — Forward to the Investigation Unit</h2>
                                <p className="staff-note">
                                    Due within 5 days of receipt. Once forwarded, the complainant's identity is
                                    withheld from everyone in the Investigation Unit.
                                </p>

                                <div className="staff-form-grid">
                                    <div className="staff-form-group">
                                        <label>Investigation Officer *</label>
                                        <select
                                            value={forwardForm.investigationOfficerId}
                                            onChange={(e) =>
                                                setForwardForm((f) => ({ ...f, investigationOfficerId: e.target.value }))
                                            }
                                            required
                                        >
                                            <option value="">Select an officer</option>
                                            {investigators.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.fullName} ({o.username})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="staff-form-group">
                                        <label>Investigation Due Date</label>
                                        <input
                                            type="date"
                                            value={forwardForm.dueDate}
                                            onChange={(e) => setForwardForm((f) => ({ ...f, dueDate: e.target.value }))}
                                        />
                                    </div>

                                    <div className="staff-form-group full-width">
                                        <label>Remarks for the Investigation Unit</label>
                                        <textarea
                                            rows="3"
                                            value={forwardForm.remarks}
                                            onChange={(e) => setForwardForm((f) => ({ ...f, remarks: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="staff-actions-row">
                                    <button
                                        type="submit"
                                        className="staff-btn staff-btn-primary"
                                        disabled={!forwardForm.investigationOfficerId}
                                    >
                                        Forward to Investigation Unit
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Admin can move the file to a different committee member at any stage. */}
                        {permissions.canTransfer && (
                            <form className="staff-card" onSubmit={handleTransfer}>
                                <h2 className="staff-section-title">Transfer to Another WB Committee Member</h2>
                                <p className="staff-note">
                                    Available to Administrators at any stage. Currently owned by{" "}
                                    <strong>{complaint.wbcOwnerName || "nobody"}</strong>.
                                </p>

                                <div className="staff-form-grid">
                                    <div className="staff-form-group">
                                        <label>New Owner *</label>
                                        <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} required>
                                            <option value="">Select a committee member</option>
                                            {committeeMembers
                                                .filter((m) => String(m.id) !== String(complaint.wbc_owner_id))
                                                .map((m) => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.fullName} ({m.username})
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                    <div className="staff-form-group">
                                        <label>Reason</label>
                                        <input
                                            type="text"
                                            value={transferRemarks}
                                            onChange={(e) => setTransferRemarks(e.target.value)}
                                            placeholder="e.g. workload rebalancing, conflict of interest"
                                        />
                                    </div>
                                </div>

                                <div className="staff-actions-row">
                                    <button type="submit" className="staff-btn" disabled={!transferTo}>
                                        Transfer Complaint
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Dispositions that don't go to the Investigation Unit. */}
                        {permissions.canClose && !forwarded && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Other Dispositions</h2>

                                <div className="staff-remark-form">
                                    <label htmlFor="closeRemarks">Response to the whistle-blower</label>
                                    <textarea
                                        id="closeRemarks"
                                        rows="3"
                                        value={closeRemarks}
                                        onChange={(e) => setCloseRemarks(e.target.value)}
                                        placeholder="Explain the outcome — sent with the closing communication."
                                    />
                                </div>

                                <div className="staff-actions-row">
                                    <button
                                        type="button"
                                        className="staff-btn"
                                        onClick={() => handleRoute("HR")}
                                        disabled={!!routing}
                                    >
                                        {routing === "HR" ? "Assigning..." : "Refer to HR"}
                                    </button>

                                    <button
                                        type="button"
                                        className="staff-btn"
                                        onClick={() => handleRoute("CUSTOMER")}
                                        disabled={!!routing}
                                    >
                                        {routing === "CUSTOMER" ? "Assigning..." : "Refer to Customer Service"}
                                    </button>

                                    <button
                                        type="button"
                                        className="staff-btn staff-btn-danger"
                                        onClick={() => handleRoute("CLOSE")}
                                        disabled={!!routing}
                                    >
                                        {routing === "CLOSE" ? "Closing..." : "Close and Respond to Whistle-blower"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {!hasActionsContent && <p className="cd-empty">Nothing to action here.</p>}
                    </>
                )}

                {activeTab === "documents" && (
                    <div className="staff-card">
                        <h2 className="staff-section-title">Documents</h2>
                        <DocumentList documents={documents} emptyText="Nothing has been filed yet." />
                    </div>
                )}

                {activeTab === "history" && (
                    <div className="staff-card">
                        <h2 className="staff-section-title">History</h2>
                        <ul className="staff-timeline">
                            {historyNewestFirst.map((h) => (
                                <li key={h.history_id}>
                                    <strong>{actionLabel(h.action_code)}</strong>
                                    {h.remarks ? <span className="staff-workflow-answer">{h.remarks}</span> : null}
                                    <span className="staff-muted">
                                        {h.performedByName || "System"} · {new Date(h.performed_at).toLocaleString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ComplaintDetail;
