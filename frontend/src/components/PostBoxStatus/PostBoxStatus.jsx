import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { POSTBOX_CREDS_KEY } from "../../lib/postboxSession";
import { useIdleTimeout } from "../../lib/useIdleTimeout";
import Icon from "../Icon/Icon";
import "./PostBoxStatus.css";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// The server, not this component, decides what a complainant may see: the
// /track endpoint returns only five predefined status labels (see
// backend/src/services/complainantView.js) and the timeline is already those
// labels, with every internal action code, remark, and staff name stripped
// out before it leaves the API. Nothing here maps or reinterprets a code —
// there is nothing left to map.

const PostBoxStatus = () => {
    const navigate = useNavigate();

    const [creds, setCreds] = useState(null);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState("");
    const [responseText, setResponseText] = useState("");
    const [file, setFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState("");
    const [downloadingDocument, setDownloadingDocument] = useState(null);

    const loadStatus = async (credentials) => {
        setError("");

        try {
            const data = await api.post("/public/complaints/track", credentials);
            setStatus(data);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        const stored = sessionStorage.getItem(POSTBOX_CREDS_KEY);

        if (!stored) {
            navigate("/post-box-login");
            return;
        }

        const parsed = JSON.parse(stored);
        setCreds(parsed);
        loadStatus(parsed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleLogout = (reason) => {
        sessionStorage.removeItem(POSTBOX_CREDS_KEY);
        navigate("/post-box-login", reason ? { state: { notice: reason } } : undefined);
    };

    // Only ticks once credentials have actually been loaded (see the effect
    // above) — before that there's nothing logged in to time out.
    useIdleTimeout(
        IDLE_TIMEOUT_MS,
        () => handleLogout("You were logged out after 5 minutes of inactivity."),
        !!creds
    );

    const handleRespond = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitMessage("");

        if (!responseText.trim()) {
            setError("Please enter a response.");
            return;
        }

        setSubmitting(true);

        try {
            const formData = new FormData();
            formData.append("complaintId", creds.complaintId);
            formData.append("password", creds.password);
            formData.append("clarificationId", status.informationRequired?.id || "");
            formData.append("responseText", responseText);
            if (file) {
                formData.append("file", file);
            }

            await api.post("/public/complaints/respond", formData, { isFormData: true });

            setSubmitMessage("Your response has been submitted successfully.");
            setResponseText("");
            setFile(null);
            await loadStatus(creds);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDocumentDownload = async (document) => {
        setError("");
        setDownloadingDocument(document.id);

        try {
            await api.downloadPublic(
                "/public/complaints/document-download",
                { complaintId: creds.complaintId, password: creds.password, documentId: document.id },
                document.name
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setDownloadingDocument(null);
        }
    };

    if (!creds) {
        return null;
    }

    return (
        <div className="postbox-status-page">
            <div className="postbox-status-card">
                <div className="postbox-status-header">
                    <div className="postbox-status-title">
                        <span className="postbox-status-mark">
                            <Icon name="mailbox" size={19} />
                        </span>

                        <div>
                            <h1>Post Box Status</h1>
                            <span className="postbox-status-id">
                                Complaint ID: <code>{creds.complaintId}</code>
                            </span>
                        </div>
                    </div>

                    <button type="button" className="postbox-status-logout" onClick={() => handleLogout()}>
                        <Icon name="logout" size={15} />
                        <span>Logout</span>
                    </button>
                </div>

                {error && (
                    <div className="login-error">
                        <Icon name="alert" size={15} />
                        <span>{error}</span>
                    </div>
                )}
                {submitMessage && (
                    <div className="postbox-status-success">
                        <Icon name="checkCircle" size={15} />
                        <span>{submitMessage}</span>
                    </div>
                )}

                {status && (
                    <>
                        <div className="postbox-status-current">
                            <span className="postbox-status-pulse" aria-hidden="true" />

                            <div>
                                <span className="postbox-status-label">Current Status</span>
                                <span className="postbox-status-value">{status.status}</span>
                            </div>
                        </div>

                        {status.history?.length > 0 && (
                            <div className="postbox-status-history">
                                <h2>
                                    <Icon name="clock" size={16} />
                                    History
                                </h2>
                                <ul className="postbox-status-timeline">
                                    {status.history.map((h, i) => (
                                        <li key={i}>
                                            <span className="postbox-status-timeline-action">{h.status}</span>
                                            {h.detail && (
                                                <span className="postbox-status-timeline-remarks">{h.detail}</span>
                                            )}
                                            {h.documents?.map((document) => (
                                                <button
                                                    type="button"
                                                    className="postbox-status-document"
                                                    key={document.id}
                                                    onClick={() => handleDocumentDownload(document)}
                                                    disabled={downloadingDocument === document.id}
                                                >
                                                    <Icon name="document" size={15} />
                                                    <span>{document.name}</span>
                                                    <span className="postbox-status-document-action">
                                                        {downloadingDocument === document.id ? "Downloading..." : "Download"}
                                                    </span>
                                                </button>
                                            ))}
                                            <span className="postbox-status-timeline-date">
                                                {new Date(h.at).toLocaleString()}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                            </div>
                        )}

                        {status.informationRequired ? (
                            <div className="postbox-status-clarification">
                                <h2>
                                    <Icon name="megaphone" size={16} />
                                    Information Required
                                </h2>

                                <p className="clarification-question">
                                    {status.informationRequired.question}
                                </p>

                                {/* The deadline is the whole point of this
                                    request — silence closes the complaint, so
                                    it is stated plainly rather than buried. */}
                                <p
                                    className={`clarification-deadline${
                                        status.informationRequired.daysRemaining <= 2 ? " is-urgent" : ""
                                    }`}
                                >
                                    <Icon name="clock" size={15} />
                                    <span>
                                        Please reply by{" "}
                                        <strong>
                                            {String(status.informationRequired.responseDueDate).slice(0, 10)}
                                        </strong>{" "}
                                        {status.informationRequired.daysRemaining >= 0
                                            ? `(${status.informationRequired.daysRemaining} day${
                                                  status.informationRequired.daysRemaining === 1 ? "" : "s"
                                              } left)`
                                            : "(overdue)"}
                                        . If we do not hear from you, your complaint will be closed.
                                        {status.informationRequired.remindersSent > 0 &&
                                            ` ${status.informationRequired.remindersSent} of ${status.informationRequired.totalReminders} reminders sent.`}
                                    </span>
                                </p>

                                <form onSubmit={handleRespond}>
                                    <label htmlFor="responseText">Your Response</label>
                                    <textarea
                                        id="responseText"
                                        rows="5"
                                        value={responseText}
                                        onChange={(e) => setResponseText(e.target.value)}
                                        placeholder="Type your response to the clarification request..."
                                    />

                                    <label htmlFor="responseFile">Upload Additional Documents</label>
                                    <input
                                        id="responseFile"
                                        type="file"
                                        onChange={(e) => setFile(e.target.files[0] || null)}
                                    />

                                    <button type="submit" className="login-button" disabled={submitting}>
                                        {submitting ? (
                                            <>
                                                <span className="wms-spinner" />
                                                <span>Submitting…</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Submit Response</span>
                                                <Icon name="arrowRight" size={15} />
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        ) : status.informationSubmitted ? (
                            // Answered, and now with the WB Committee for review — the
                            // complainant is told their response arrived, nothing about
                            // what happens to it next; that is the committee's to decide.
                            <p className="postbox-status-none">
                                <Icon name="checkCircle" size={16} />
                                Your response has been submitted and is with the Whistle-blower Committee.
                            </p>
                        ) : (
                            <p className="postbox-status-none">
                                <Icon name="checkCircle" size={16} />
                                No clarification has been requested at this time.
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PostBoxStatus;
