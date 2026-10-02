import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../context/AuthContext";
import { statusBadgeClass, actionLabel } from "../statusBadge";
import { isAdmin } from "../roles";
import SlaBadge from "../components/SlaBadge";
import DetailsRequestCard from "../components/DetailsRequestCard";
import CaseWorkflowPanel from "../components/CaseWorkflowPanel";
import DocumentList from "../components/DocumentList";
import StaffAlertBanner from "../components/StaffAlertBanner";
import "./CaseDetail.css";

// A case from the point the complaint was forwarded to the Investigation Unit
// through to closure. What is offered here comes from the server's
// `workflow.availableActions`, which reflects both the case's stage in the
// handling procedure and who is signed in.
//
// Layout note: every field and permission check below is unchanged from the
// single-column version — this file only regroups the same blocks into a
// pinned summary bar + tabs so a long case is scannable instead of one big
// scroll. TABS lists id/label pairs; each tab's JSX is a case in the switch
// inside the render, not a separate component, so the many closures over
// `data`/`handlers` didn't need threading through props.
const TABS = [
    { id: "overview", label: "Overview" },
    { id: "investigation", label: "Investigation" },
    { id: "committee", label: "Committee & DAC" },
    { id: "assignment", label: "Assignment" },
    { id: "documents", label: "Documents" },
    { id: "history", label: "History" }
];

const CaseDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { roles } = useAuth();

    const [data, setData] = useState(null);
    const [investigation, setInvestigation] = useState(null);
    const [wbc, setWbc] = useState(null);
    const [policy, setPolicy] = useState(null);
    const [committeeMembers, setCommitteeMembers] = useState([]);
    const [investigators, setInvestigators] = useState([]);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [remarkText, setRemarkText] = useState("");
    const [submittingRemark, setSubmittingRemark] = useState(false);
    const [uploadingDocuments, setUploadingDocuments] = useState(false);
    const [transferTo, setTransferTo] = useState({ wbcOwnerId: "", investigationOfficerId: "", remarks: "" });
    const [exporting, setExporting] = useState(false);
    const [activeTab, setActiveTab] = useState("overview");

    const load = useCallback(async () => {
        setError("");

        try {
            const [caseData, investigationData, wbcData] = await Promise.all([
                api.get(`/cases/${id}`, { auth: true }),
                api.get(`/cases/${id}/investigation`, { auth: true }),
                api.get(`/cases/${id}/wbc`, { auth: true })
            ]);

            setData(caseData);
            setInvestigation(investigationData);
            setWbc(wbcData);
        } catch (err) {
            setError(err.message);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    // A new case id starts back on Overview rather than keeping whichever tab
    // was open on the last one.
    useEffect(() => {
        setActiveTab("overview");
    }, [id]);

    useEffect(() => {
        api.get("/admin/sla/config", { auth: true }).then(setPolicy).catch(() => {});
        api.get("/users?group=WBC&activeOnly=1", { auth: true }).then(setCommitteeMembers).catch(() => {});
        api.get("/users?group=IU&activeOnly=1", { auth: true }).then(setInvestigators).catch(() => {});
    }, []);

    const run = async (fallback, fn) => {
        setMessage("");
        setError("");

        try {
            const result = await fn();
            setMessage(result?.message || fallback);
            await load();
            return result;
        } catch (err) {
            setError(err.message);
            return null;
        }
    };

    const handlers = {
        // The report and its supporting documents post together as multipart,
        // so findings are never filed without the evidence behind them.
        submitReport: (formData) =>
            run("Investigation report submitted.", () =>
                api.post(`/cases/${id}/investigation/reports`, formData, { auth: true, isFormData: true })
            ),
        seekClarification: (body) =>
            run("Clarification sought.", () =>
                api.post(`/cases/${id}/investigation/clarifications`, body, { auth: true })
            ),
        placeBeforeCommittee: (body) =>
            run("Report placed before the committee.", () =>
                api.post(`/cases/${id}/wbc/meetings`, body, { auth: true })
            ),
        recordDecision: (body) =>
            run("Decision recorded.", () => api.post(`/cases/${id}/wbc/decisions`, body, { auth: true })),
        recordDacOutcome: (body) =>
            run("DAC outcome recorded.", () => api.post(`/cases/${id}/dac/outcome`, body, { auth: true })),
        recordImplementation: (body) =>
            run("Implementation recorded.", () => api.post(`/cases/${id}/implementation`, body, { auth: true })),
        closeCase: (body) => run("Case closed.", () => api.post(`/cases/${id}/close`, body, { auth: true })),

        proposeDetails: (body) =>
            run("Sent to the WB Committee.", () =>
                api.post(`/cases/${id}/investigation/detail-requests`, body, { auth: true })
            ),

        reviewProposal: ({ clarificationId, ...body }) =>
            run("Request reviewed.", () =>
                api.patch(`/cases/${id}/detail-requests/${clarificationId}`, body, { auth: true })
            ),

        // The complainant's answer sits with the committee until this runs — it
        // is the only route by which the Investigation Unit ever sees it.
        forwardResponse: ({ clarificationId, sharedText }) =>
            run("Response forwarded to the Investigation Unit.", () =>
                api.post(`/cases/${id}/detail-requests/${clarificationId}/forward`, { sharedText }, { auth: true })
            )
    };

    const handleRequestDetails = (question) =>
        run("Additional details requested from the whistle-blower.", () =>
            api.post(`/cases/${id}/request-details`, { question }, { auth: true })
        );

    const handleTransfer = async (event) => {
        event.preventDefault();

        if (!transferTo.wbcOwnerId && !transferTo.investigationOfficerId) {
            return;
        }

        const result = await run("Case transferred.", () =>
            api.patch(
                `/cases/${id}/transfer`,
                {
                    wbcOwnerId: transferTo.wbcOwnerId ? Number(transferTo.wbcOwnerId) : null,
                    investigationOfficerId: transferTo.investigationOfficerId
                        ? Number(transferTo.investigationOfficerId)
                        : null,
                    remarks: transferTo.remarks || null
                },
                { auth: true }
            )
        );

        if (result) {
            setTransferTo({ wbcOwnerId: "", investigationOfficerId: "", remarks: "" });
        }
    };

    const handleExport = async () => {
        setExporting(true);
        setError("");

        try {
            await api.download(`/cases/${id}/export`, `case-${data.case.case_no}-journey.pdf`);
        } catch (err) {
            setError(err.message);
        } finally {
            setExporting(false);
        }
    };

    const handleAddRemark = async (event) => {
        event.preventDefault();

        if (!remarkText.trim()) {
            return;
        }

        setSubmittingRemark(true);

        try {
            await run("Remark added.", () => api.post(`/cases/${id}/remarks`, { remarks: remarkText }, { auth: true }));
            setRemarkText("");
        } finally {
            setSubmittingRemark(false);
        }
    };

    const handleUploadDocuments = async (event) => {
        event.preventDefault();
        // React clears event.currentTarget once the handler yields, so the form
        // has to be captured before the first await.
        const form = event.currentTarget;
        const files = Array.from(form.elements.documents.files || []);

        if (!files.length) {
            return;
        }

        setUploadingDocuments(true);
        setError("");
        setMessage("");

        try {
            const formData = new FormData();
            files.forEach((file) => formData.append("files", file));
            const result = await api.post(`/cases/${id}/investigation/documents`, formData, {
                auth: true,
                isFormData: true
            });
            setMessage(result.message || `${files.length} document${files.length === 1 ? "" : "s"} uploaded.`);
            form.reset();
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setUploadingDocuments(false);
        }
    };

    if (error && !data) {
        return <div className="staff-error">{error}</div>;
    }

    if (!data) {
        return <div className="staff-empty">Loading...</div>;
    }

    const {
        case: caseRow,
        complainant,
        respondents,
        assignment,
        timeline,
        documents,
        clarifications,
        workflow,
        sla,
        permissions,
        canEdit,
        forwarding
    } = data;

    const actions = workflow.availableActions;

    // The three "someone is waiting on you" states this screen can be in.
    // Each is easy to miss because the card that actually handles it sits
    // further down the page, mixed in with everything else.
    const pendingProposal = clarifications?.find((c) => c.statusCode === "PROPOSED");
    const respondedRequest = clarifications?.find((c) => c.statusCode === "RESPONDED");
    const openInvestigationClarification = investigation?.openClarification;

    // Newest first, per the redesign — every other reader of `timeline`
    // (nothing else in this file) is untouched, so this reverses a copy
    // rather than the array itself.
    const timelineNewestFirst = [...timeline].reverse();

    const hasInvestigationContent =
        actions.some((a) =>
            ["REVIEW_DETAILS_PROPOSAL", "SUBMIT_IVR", "PROPOSE_DETAILS_REQUEST", "PLACE_BEFORE_WBC"].includes(a)
        ) ||
        actions.includes("REQUEST_DETAILS") ||
        clarifications?.length > 0 ||
        investigation?.reports?.length > 0;

    const hasCommitteeContent = wbc?.meetings?.length > 0 || wbc?.closure;

    const goToInvestigationTab = () => setActiveTab("investigation");

    return (
        <div>
            <div className="cd-summary-bar">
                <div className="cd-summary-top">
                    <div className="cd-summary-id">
                        <h1>{caseRow.case_no}</h1>
                        <span className={statusBadgeClass(caseRow.statusCode)}>{workflow.stageLabel}</span>
                        <SlaBadge label="Acknowledgement" sla={sla.acknowledgement} />
                        <SlaBadge label="Forward to IU" sla={sla.forwardToIu} />
                    </div>

                    <div className="cd-summary-actions">
                        {actions.includes("TRANSFER_CASE") && (
                            <button
                                type="button"
                                className="staff-btn staff-btn-primary"
                                onClick={() => navigate(`/staff/cases/${id}/assign`)}
                            >
                                {assignment ? "Reassign Investigator" : "Assign Investigator"}
                            </button>
                        )}

                        {isAdmin(roles) && (
                            <button type="button" className="staff-btn" onClick={handleExport} disabled={exporting}>
                                {exporting ? "Exporting..." : "Export PDF"}
                            </button>
                        )}
                    </div>
                </div>

                <dl className="cd-summary-facts">
                    <div className="cd-fact">
                        <dt className="cd-fact-label">Date of Receipt</dt>
                        <dd className="cd-fact-value">
                            {caseRow.dateOfReceipt ? String(caseRow.dateOfReceipt).slice(0, 10) : "-"}
                        </dd>
                    </div>
                    <div className="cd-fact">
                        <dt className="cd-fact-label">Assigned IU</dt>
                        <dd className="cd-fact-value">{caseRow.investigationOfficerName || "Not assigned"}</dd>
                    </div>
                    <div className="cd-fact">
                        <dt className="cd-fact-label">Investigation SLA Due</dt>
                        <dd className="cd-fact-value">
                            {caseRow.iu_sla_due_date ? caseRow.iu_sla_due_date.slice(0, 10) : "-"}
                        </dd>
                    </div>
                </dl>
            </div>

            {message && <div className="staff-success">{message}</div>}
            {error && <div className="staff-error">{error}</div>}

            {pendingProposal && actions.includes("REVIEW_DETAILS_PROPOSAL") && (
                <StaffAlertBanner icon="megaphone" anchor="wbc-review-proposal" onNavigate={goToInvestigationTab}>
                    The Investigation Unit has asked for additional details on this case — awaiting your decision.
                </StaffAlertBanner>
            )}

            {respondedRequest && actions.includes("FORWARD_RESPONSE_TO_IU") && (
                <StaffAlertBanner icon="megaphone" anchor="details-request-card" onNavigate={goToInvestigationTab}>
                    The whistle-blower has responded to your request for additional details — review and forward it
                    to the Investigation Unit.
                </StaffAlertBanner>
            )}

            {openInvestigationClarification && actions.includes("SUBMIT_IVR") && (
                <StaffAlertBanner icon="megaphone" anchor="investigation-report-form" onNavigate={goToInvestigationTab}>
                    The WB Committee has asked for clarification on your investigation report — respond below.
                </StaffAlertBanner>
            )}

            {!canEdit && (
                <div className="staff-readonly-banner">
                    You have read-only access to this case. Only the WB Committee, an Administrator, or the assigned
                    investigation officer, reviewer or escalation owner can update it.
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
                        {tab.id === "investigation" &&
                            (pendingProposal || respondedRequest || openInvestigationClarification) && (
                                <span className="cd-tab-dot" aria-label="Needs attention" />
                            )}
                    </button>
                ))}
            </div>

            <div className="cd-panel" role="tabpanel">
                {activeTab === "overview" && (
                    <>
                        {/* The handover record an Investigation Officer needs for an
                            assigned case: when it reached them and which committee
                            member sent it. */}
                        {permissions.isInvestigationUnit && forwarding && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Handover</h2>
                                <dl className="staff-kv cd-kv2">
                                    <dt>Forwarded by</dt>
                                    <dd>{forwarding.forwardedByName || "-"}</dd>
                                    <dt>Forwarded on</dt>
                                    <dd>{new Date(forwarding.forwardedAt).toLocaleString()}</dd>
                                    {forwarding.remarks && (
                                        <>
                                            <dt>Instructions</dt>
                                            <dd>{forwarding.remarks}</dd>
                                        </>
                                    )}
                                </dl>
                            </div>
                        )}

                        <div className="staff-card">
                            <h2 className="staff-section-title">Case Summary</h2>
                            <dl className="staff-kv cd-kv2">
                                <dt>Complaint No</dt>
                                <dd>{caseRow.complaintNo}</dd>
                                <dt>Stage</dt>
                                <dd>
                                    <span className={statusBadgeClass(caseRow.statusCode)}>{workflow.stageLabel}</span>
                                </dd>
                                <dt>WB Committee Owner</dt>
                                <dd>{caseRow.wbcOwnerName || "Unassigned"}</dd>
                                <dt>Investigation Officer</dt>
                                <dd>{caseRow.investigationOfficerName || "Not assigned"}</dd>
                                <dt>Priority</dt>
                                <dd>
                                    <span className="staff-badge">{caseRow.priority}</span>
                                </dd>
                                <dt>Risk Category</dt>
                                <dd>{caseRow.riskCategory}</dd>
                                <dt>Severity</dt>
                                <dd>{caseRow.severity}</dd>
                                <dt>Case Open Date</dt>
                                <dd>{caseRow.case_open_date?.slice(0, 10)}</dd>
                                <dt>Due Date</dt>
                                <dd>{caseRow.due_date ? caseRow.due_date.slice(0, 10) : "-"}</dd>
                                <dt>Investigation SLA (90 days)</dt>
                                <dd>{caseRow.iu_sla_due_date ? caseRow.iu_sla_due_date.slice(0, 10) : "-"}</dd>
                            </dl>
                            <h3 className="staff-subsection-title">Complaint Description</h3>
                            <p className="staff-note" style={{ margin: 0 }}>
                                {caseRow.complaintDescription}
                            </p>
                        </div>

                        <div className="staff-card">
                            <h2 className="staff-section-title">Complainant</h2>
                            {complainant?.isAnonymous ? (
                                <p>Anonymous complainant.</p>
                            ) : complainant?.identityWithheld ? (
                                permissions.isInvestigationUnit ? null : (
                                    <p>Identity withheld. Your role is not cleared to view complainant identities.</p>
                                )
                            ) : (
                                <dl className="staff-kv cd-kv2">
                                    <dt>Name</dt>
                                    <dd>{complainant?.employeeName || "-"}</dd>
                                    <dt>Email</dt>
                                    <dd>{complainant?.email || "-"}</dd>
                                    <dt>Mobile</dt>
                                    <dd>{complainant?.mobile || "-"}</dd>
                                </dl>
                            )}
                        </div>

                        {respondents?.length > 0 && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Respondent(s)</h2>
                                {respondents.map((r) => (
                                    <div key={r.respondent_id}>{r.employee_name || "Unnamed"}</div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === "investigation" && (
                    <>
                        {/* Stage-appropriate workflow actions. */}
                        <CaseWorkflowPanel
                            availableActions={actions}
                            investigation={investigation}
                            committeeMembers={committeeMembers}
                            proposal={pendingProposal}
                            handlers={handlers}
                        />

                        {/* The committee writing to the whistle-blower after
                            assignment, and reviewing what comes back before any of
                            it reaches the IU. */}
                        {(actions.includes("REQUEST_DETAILS") || clarifications?.length > 0) && (
                            <DetailsRequestCard
                                clarifications={clarifications}
                                sla={sla.whistleblowerResponse}
                                canRequest={actions.includes("REQUEST_DETAILS")}
                                canForward={actions.includes("FORWARD_RESPONSE_TO_IU")}
                                onRequest={handleRequestDetails}
                                onForward={handlers.forwardResponse}
                                policy={policy}
                            />
                        )}

                        {investigation?.reports?.length > 0 && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Investigation Report</h2>

                                {investigation.reports.map((r) => (
                                    <details key={r.id} className="staff-report" open={r === investigation.reports[0]}>
                                        <summary>
                                            <strong>
                                                {r.reportNumber} (v{r.versionNo})
                                            </strong>{" "}
                                            <span className="staff-badge staff-badge-info">{r.statusName}</span>
                                            <span className="staff-muted">
                                                {" "}
                                                {r.submittedByName} · {String(r.submissionDate).slice(0, 10)}
                                            </span>
                                        </summary>

                                        <dl className="staff-kv cd-kv2">
                                            <dt>Findings</dt>
                                            <dd>{r.findings}</dd>
                                            {r.rootCause && (
                                                <>
                                                    <dt>Root Cause</dt>
                                                    <dd>{r.rootCause}</dd>
                                                </>
                                            )}
                                            {r.evidenceSummary && (
                                                <>
                                                    <dt>Evidence</dt>
                                                    <dd>{r.evidenceSummary}</dd>
                                                </>
                                            )}
                                            {r.recommendation && (
                                                <>
                                                    <dt>Recommendation</dt>
                                                    <dd>{r.recommendation}</dd>
                                                </>
                                            )}
                                            <dt>Conclusion</dt>
                                            <dd>{r.conclusion}</dd>
                                            {r.clarificationResponse && (
                                                <>
                                                    <dt>Response to Committee</dt>
                                                    <dd>{r.clarificationResponse}</dd>
                                                </>
                                            )}
                                        </dl>

                                        <h3 className="staff-subsection-title">Supporting documents</h3>
                                        <DocumentList
                                            documents={r.documents}
                                            emptyText="No documents were filed with this version."
                                        />
                                    </details>
                                ))}

                                {investigation.clarifications?.length > 0 && (
                                    <>
                                        <h3 className="staff-subsection-title">Committee clarifications</h3>
                                        <ul className="staff-timeline">
                                            {investigation.clarifications.map((c) => (
                                                <li key={c.id}>
                                                    <strong>{c.details}</strong>
                                                    {c.response && (
                                                        <span className="staff-workflow-answer">{c.response}</span>
                                                    )}
                                                    <span className="staff-muted">
                                                        {c.raisedByName} · {String(c.raisedDate).slice(0, 10)} ·{" "}
                                                        {c.statusCode === "OPEN" ? "Awaiting response" : "Answered"}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}

                        {!hasInvestigationContent && (
                            <p className="cd-empty">Nothing to action here yet.</p>
                        )}
                    </>
                )}

                {activeTab === "committee" && (
                    <>
                        {wbc?.meetings?.length > 0 && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">WB Committee</h2>

                                {wbc.meetings.map((m) => (
                                    <dl className="staff-kv cd-kv2" key={m.id} style={{ marginBottom: 12 }}>
                                        <dt>Meeting</dt>
                                        <dd>
                                            {m.meetingNo} — {String(m.meetingDate).slice(0, 10)}
                                        </dd>
                                        <dt>Agenda</dt>
                                        <dd>{m.agenda || "-"}</dd>
                                        <dt>Members</dt>
                                        <dd>{m.members.map((mm) => mm.memberName).join(", ") || "-"}</dd>
                                        {m.decisionSummary && (
                                            <>
                                                <dt>Decision</dt>
                                                <dd>{m.decisionSummary}</dd>
                                            </>
                                        )}
                                    </dl>
                                ))}

                                {wbc.decisions?.length > 0 && (
                                    <>
                                        <h3 className="staff-subsection-title">Decisions</h3>
                                        <ul className="staff-timeline">
                                            {wbc.decisions.map((d) => (
                                                <li key={d.id}>
                                                    <strong>{d.recommendationName}</strong>
                                                    <span className="staff-workflow-answer">{d.actionTaken}</span>
                                                    <span className="staff-muted">
                                                        {d.createdByName} · {String(d.decisionDate).slice(0, 10)}
                                                        {d.dacReferenceNo ? ` · ${d.dacReferenceNo}` : ""}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}

                                {wbc.dacCase && (
                                    <>
                                        <h3 className="staff-subsection-title">DAC proceedings</h3>
                                        <dl className="staff-kv cd-kv2">
                                            <dt>Reference</dt>
                                            <dd>{wbc.dacCase.referenceNo}</dd>
                                            <dt>Status</dt>
                                            <dd>{wbc.dacCase.statusName}</dd>
                                            <dt>Chairperson</dt>
                                            <dd>{wbc.dacCase.chairpersonName || "-"}</dd>
                                        </dl>
                                    </>
                                )}
                            </div>
                        )}

                        {wbc?.closure && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Closure</h2>
                                <dl className="staff-kv cd-kv2">
                                    <dt>Closed On</dt>
                                    <dd>{String(wbc.closure.closureDate).slice(0, 10)}</dd>
                                    <dt>Closed By</dt>
                                    <dd>{wbc.closure.closedByName || "-"}</dd>
                                    <dt>Reason</dt>
                                    <dd>{wbc.closure.closureReason}</dd>
                                    <dt>Response to Whistle-blower</dt>
                                    <dd>{wbc.closure.closureRemarks || "-"}</dd>
                                    <dt>Response Sent</dt>
                                    <dd>{wbc.closure.responseSent ? "Yes" : "No"}</dd>
                                </dl>
                            </div>
                        )}

                        {!hasCommitteeContent && (
                            <p className="cd-empty">The case hasn't reached the committee yet.</p>
                        )}
                    </>
                )}

                {activeTab === "assignment" && (
                    <>
                        <div className="staff-card">
                            <h2 className="staff-section-title">Assignment</h2>
                            {assignment ? (
                                <dl className="staff-kv cd-kv2">
                                    <dt>Investigation Officer</dt>
                                    <dd>{assignment.investigationOfficerName || "-"}</dd>
                                    <dt>Reviewer</dt>
                                    <dd>{assignment.reviewerName || "-"}</dd>
                                    <dt>Escalation Owner</dt>
                                    <dd>{assignment.escalationOwnerName || "-"}</dd>
                                    <dt>Investigation Due Date</dt>
                                    <dd>
                                        {assignment.investigation_due_date
                                            ? assignment.investigation_due_date.slice(0, 10)
                                            : "-"}
                                    </dd>
                                </dl>
                            ) : (
                                <p>Not yet assigned.</p>
                            )}
                        </div>

                        {/* Admin can move the file to a different committee member at any stage. */}
                        {isAdmin(roles) && caseRow.statusCode !== "CLOSED" && (
                            <form className="staff-card" onSubmit={handleTransfer}>
                                <h2 className="staff-section-title">Transfer This Case</h2>
                                <p className="staff-note">
                                    For when whoever is holding this file is unavailable. Currently with{" "}
                                    <strong>{caseRow.wbcOwnerName || "no committee member"}</strong> on the committee
                                    side and{" "}
                                    <strong>{caseRow.investigationOfficerName || "no investigator"}</strong> on the
                                    investigation side. The case continues from its current stage — a transfer never
                                    rewinds it.
                                </p>

                                <div className="staff-form-grid">
                                    <div className="staff-form-group">
                                        <label>New WB Committee Owner</label>
                                        <select
                                            value={transferTo.wbcOwnerId}
                                            onChange={(e) =>
                                                setTransferTo((t) => ({ ...t, wbcOwnerId: e.target.value }))
                                            }
                                        >
                                            <option value="">Leave unchanged</option>
                                            {committeeMembers
                                                .filter((m) => String(m.id) !== String(caseRow.wbcOwnerId))
                                                .map((m) => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.fullName}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                    <div className="staff-form-group">
                                        <label>New Investigation Officer</label>
                                        <select
                                            value={transferTo.investigationOfficerId}
                                            onChange={(e) =>
                                                setTransferTo((t) => ({
                                                    ...t,
                                                    investigationOfficerId: e.target.value
                                                }))
                                            }
                                        >
                                            <option value="">Leave unchanged</option>
                                            {investigators
                                                .filter((m) => String(m.id) !== String(caseRow.investigation_officer_id))
                                                .map((m) => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.fullName}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                    <div className="staff-form-group full-width">
                                        <label>Reason</label>
                                        <input
                                            type="text"
                                            value={transferTo.remarks}
                                            onChange={(e) => setTransferTo((t) => ({ ...t, remarks: e.target.value }))}
                                            placeholder="e.g. on leave, left the organisation, conflict of interest"
                                        />
                                    </div>
                                </div>

                                <div className="staff-actions-row">
                                    <button
                                        type="submit"
                                        className="staff-btn"
                                        disabled={!transferTo.wbcOwnerId && !transferTo.investigationOfficerId}
                                    >
                                        Transfer Case
                                    </button>
                                </div>
                            </form>
                        )}
                    </>
                )}

                {activeTab === "documents" && (
                    <>
                        {permissions.isInvestigationUnit && canEdit && caseRow.statusCode !== "CLOSED" && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Upload More Case Documents</h2>
                                <p className="staff-note">
                                    Add evidence or supporting files after submitting the investigation report.
                                </p>
                                <form className="staff-upload-form" onSubmit={handleUploadDocuments}>
                                    <label htmlFor="caseDocuments">Select documents</label>
                                    <div className="staff-upload-row">
                                        <input
                                            id="caseDocuments"
                                            name="documents"
                                            type="file"
                                            multiple
                                            disabled={uploadingDocuments}
                                        />
                                        <button
                                            type="submit"
                                            className="staff-btn staff-btn-primary"
                                            disabled={uploadingDocuments}
                                        >
                                            {uploadingDocuments ? "Uploading..." : "Upload Documents"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        <div className="staff-card">
                            <h2 className="staff-section-title">All Case Documents</h2>
                            <p className="staff-note">
                                Everything filed against this case and the complaint behind it. Available to the
                                owning WB Committee member and the assigned Investigation Unit officer.
                            </p>
                            <DocumentList documents={documents} emptyText="Nothing has been filed yet." />
                        </div>
                    </>
                )}

                {activeTab === "history" && (
                    <>
                        {canEdit && caseRow.statusCode !== "CLOSED" && (
                            <div className="staff-card">
                                <h2 className="staff-section-title">Add Remark</h2>
                                <form className="staff-remark-form" onSubmit={handleAddRemark}>
                                    <textarea
                                        rows="3"
                                        value={remarkText}
                                        onChange={(e) => setRemarkText(e.target.value)}
                                        placeholder="Add an update or remark for this case..."
                                    />
                                    <div className="staff-actions-row" style={{ marginTop: 0 }}>
                                        <button
                                            type="submit"
                                            className="staff-btn staff-btn-primary"
                                            disabled={submittingRemark || !remarkText.trim()}
                                        >
                                            {submittingRemark ? "Adding..." : "Add Remark"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        <div className="staff-card">
                            <h2 className="staff-section-title">Case Timeline</h2>
                            <ul className="staff-timeline">
                                {timelineNewestFirst.map((t) => (
                                    <li key={t.history_id}>
                                        <strong>{actionLabel(t.action_code)}</strong>
                                        {t.remarks && <span className="staff-workflow-answer">{t.remarks}</span>}
                                        <span className="staff-muted">
                                            {t.performedByName || "System"} ·{" "}
                                            {new Date(t.performed_at).toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CaseDetail;
