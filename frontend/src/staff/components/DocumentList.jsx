import React, { useState } from "react";
import { api } from "../../lib/api";
import Icon from "../../components/Icon/Icon";

const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (value) => {
    if (!value) return null;
    return new Date(value).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
};

// Downloadable list of attachments. Access is decided server side — a document
// follows the case or complaint it belongs to — so anything listed here is
// something this user is entitled to open.
const DocumentList = ({ documents = [], emptyText = "No documents." }) => {
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const handleDownload = async (doc) => {
        setBusyId(doc.id);
        setError("");

        try {
            await api.download(`/documents/${doc.id}/download`, doc.name);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    if (!documents.length) {
        return <p className="staff-empty" style={{ padding: "10px 0" }}>{emptyText}</p>;
    }

    return (
        <>
            {error && <div className="staff-error">{error}</div>}

            <ul className="staff-doc-list">
                {documents.map((doc) => (
                    <li key={doc.id}>
                        <Icon name="lock" size={14} />

                        <span className="staff-doc-name">
                            {doc.name}
                            {/* sharedWithIu is only ever present for a committee/Admin
                                caller — the backend never sends withheld documents to
                                the Investigation Unit in the first place, so this
                                badge is not what enforces the rule, just a note about it. */}
                            {doc.sharedWithIu === 0 && (
                                <span className="staff-badge staff-badge-warning" style={{ marginLeft: 8 }}>
                                    Withheld from IU
                                </span>
                            )}
                        </span>

                        <span className="staff-muted">
                            {[doc.category, formatSize(doc.sizeBytes), doc.uploadedByName, formatDateTime(doc.uploadedAt)]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>

                        <button
                            type="button"
                            className="staff-btn"
                            onClick={() => handleDownload(doc)}
                            disabled={busyId === doc.id}
                        >
                            {busyId === doc.id ? "Downloading..." : "Download"}
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
};

export default DocumentList;
