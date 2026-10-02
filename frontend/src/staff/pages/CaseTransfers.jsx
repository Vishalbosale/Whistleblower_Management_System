import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { statusBadgeClass } from "../statusBadge";
import Icon from "../../components/Icon/Icon";
import "./CaseWorkbench.css";

// Administrator's transfer console — every open file with whoever is currently
// holding it, and one place to move it when they are unavailable.
//
// Admin is the only role that sees all files and the only one that can move
// them. A transfer changes who is standing at the current stage; it never
// rewinds the case, so work already done is preserved.
const CaseTransfers = () => {
    const [data, setData] = useState({ cases: [], complaints: [] });
    const [committeeMembers, setCommitteeMembers] = useState([]);
    const [investigators, setInvestigators] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [loading, setLoading] = useState(true);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const debounceRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const result = await api.get(
                `/admin/transfers${search ? `?search=${encodeURIComponent(search)}` : ""}`,
                { auth: true }
            );
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        api.get("/users?group=WBC&activeOnly=1", { auth: true }).then(setCommitteeMembers).catch(() => {});
        api.get("/users?group=IU&activeOnly=1", { auth: true }).then(setInvestigators).catch(() => {});
    }, []);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSearch(searchInput), 300);

        return () => clearTimeout(debounceRef.current);
    }, [searchInput]);

    const draftFor = (key) => drafts[key] || { wbcOwnerId: "", investigationOfficerId: "", remarks: "" };

    const setDraft = (key, patch) =>
        setDrafts((d) => ({ ...d, [key]: { ...draftFor(key), ...patch } }));

    const submit = async (key, request) => {
        setError("");
        setNotice("");
        setBusyId(key);

        try {
            const result = await request();
            setNotice(result?.message || "Transferred.");
            setDrafts((d) => ({ ...d, [key]: { wbcOwnerId: "", investigationOfficerId: "", remarks: "" } }));
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const transferCase = (row) => {
        const key = `case-${row.id}`;
        const draft = draftFor(key);

        if (!draft.wbcOwnerId && !draft.investigationOfficerId) {
            return;
        }

        return submit(key, () =>
            api.patch(
                `/cases/${row.id}/transfer`,
                {
                    wbcOwnerId: draft.wbcOwnerId ? Number(draft.wbcOwnerId) : null,
                    investigationOfficerId: draft.investigationOfficerId
                        ? Number(draft.investigationOfficerId)
                        : null,
                    remarks: draft.remarks || null
                },
                { auth: true }
            )
        );
    };

    // A complaint that has not reached the Investigation Unit yet has only a
    // committee owner to move, so it uses the complaint-level transfer.
    const transferComplaint = (row) => {
        const key = `complaint-${row.complaintId}`;
        const draft = draftFor(key);

        if (!draft.wbcOwnerId) {
            return;
        }

        return submit(key, () =>
            api.patch(
                `/complaints/${row.complaintId}/transfer`,
                { wbcOwnerId: Number(draft.wbcOwnerId), remarks: draft.remarks || null },
                { auth: true }
            )
        );
    };

    const personSelect = (key, field, people, currentId, placeholder) => (
        <select
            value={draftFor(key)[field]}
            onChange={(e) => setDraft(key, { [field]: e.target.value })}
        >
            <option value="">{placeholder}</option>
            {people
                .filter((p) => String(p.id) !== String(currentId))
                .map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.fullName} ({p.username})
                    </option>
                ))}
        </select>
    );

    const totalOpen = data.cases.length + data.complaints.length;

    return (
        <div className="wb">
            <header className="wb-hero">
                <div className="wb-hero-copy">
                    <span className="wb-eyebrow">
                        <Icon name="briefcase" size={13} />
                        Administration
                    </span>

                    <h1>Case Transfers</h1>

                    <p className="wb-hero-sub">
                        Use this when whoever holds a file becomes unavailable. The case continues from the stage it
                        has already reached — transferring never restarts it.
                    </p>
                </div>

                <div className="wb-hero-side">
                    <div className="wb-hero-metric">
                        <b>{totalOpen}</b>
                        <span>open file{totalOpen === 1 ? "" : "s"}</span>
                    </div>
                </div>
            </header>

            <div className="wb-kpis">
                <a href="#transfers-cases" className="wb-kpi wb-kpi--brand">
                    <span className="wb-kpi-value">{data.cases.length}</span>
                    <span className="wb-kpi-label">
                        <Icon name="briefcase" size={13} />
                        Cases with IU
                    </span>
                </a>

                <a href="#transfers-complaints" className="wb-kpi wb-kpi--muted">
                    <span className="wb-kpi-value">{data.complaints.length}</span>
                    <span className="wb-kpi-label">
                        <Icon name="inbox" size={13} />
                        Complaints at Committee
                    </span>
                </a>
            </div>

            <div className="wb-toolbar">
                <label className="wb-field wb-field-search">
                    <span>Search</span>
                    <span className="staff-search">
                        <Icon name="search" size={16} />
                        <input
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search by case or complaint number"
                        />
                    </span>
                </label>
            </div>

            {error && <div className="staff-error">{error}</div>}
            {notice && <div className="staff-success">{notice}</div>}

            {loading ? (
                <div className="staff-empty">Loading...</div>
            ) : (
                <>
                    <h2 className="staff-section-title" id="transfers-cases">Cases with the Investigation Unit</h2>

                    <div className="wb-table-card">
                        <div className="wb-scroll">
                        {data.cases.length === 0 ? (
                            <p className="staff-empty">No open cases.</p>
                        ) : (
                                <table className="staff-table wb-table">
                                    <thead>
                                        <tr>
                                            <th>Case</th>
                                            <th>Stage</th>
                                            <th>Committee Owner</th>
                                            <th>Investigation Officer</th>
                                            <th>Transfer To</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.cases.map((row) => {
                                            const key = `case-${row.id}`;

                                            return (
                                                <tr key={key}>
                                                    <td>
                                                        <Link className="staff-table-link" to={`/staff/cases/${row.id}`}>
                                                            {row.caseNo}
                                                        </Link>
                                                        <span className="staff-muted">{row.complaintNo}</span>
                                                    </td>

                                                    <td>
                                                        <span className={statusBadgeClass(row.statusCode)}>
                                                            {row.statusName}
                                                        </span>
                                                    </td>

                                                    <td>{row.wbcOwnerName || <span className="staff-muted">Unassigned</span>}</td>
                                                    <td>
                                                        {row.investigationOfficerName || (
                                                            <span className="staff-muted">Unassigned</span>
                                                        )}
                                                    </td>

                                                    <td>
                                                        <div className="staff-transfer-cell">
                                                            {personSelect(
                                                                key,
                                                                "wbcOwnerId",
                                                                committeeMembers,
                                                                row.wbcOwnerId,
                                                                "Committee — unchanged"
                                                            )}

                                                            {personSelect(
                                                                key,
                                                                "investigationOfficerId",
                                                                investigators,
                                                                row.investigationOfficerId,
                                                                "Investigator — unchanged"
                                                            )}

                                                            <input
                                                                type="text"
                                                                value={draftFor(key).remarks}
                                                                onChange={(e) => setDraft(key, { remarks: e.target.value })}
                                                                placeholder="Reason"
                                                            />

                                                            <button
                                                                type="button"
                                                                className="staff-btn staff-btn-primary"
                                                                onClick={() => transferCase(row)}
                                                                disabled={
                                                                    busyId === key ||
                                                                    (!draftFor(key).wbcOwnerId &&
                                                                        !draftFor(key).investigationOfficerId)
                                                                }
                                                            >
                                                                {busyId === key ? "Moving..." : "Transfer"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                        )}
                        </div>
                    </div>

                    <h2 className="staff-section-title" id="transfers-complaints">
                        Complaints Not Yet With the Investigation Unit
                    </h2>

                    <div className="wb-table-card">
                        <div className="wb-scroll">
                        {data.complaints.length === 0 ? (
                            <p className="staff-empty">No open complaints at the committee stage.</p>
                        ) : (
                                <table className="staff-table wb-table">
                                    <thead>
                                        <tr>
                                            <th>Complaint</th>
                                            <th>Stage</th>
                                            <th>Committee Owner</th>
                                            <th>Transfer To</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.complaints.map((row) => {
                                            const key = `complaint-${row.complaintId}`;

                                            return (
                                                <tr key={key}>
                                                    <td>
                                                        <Link
                                                            className="staff-table-link"
                                                            to={`/staff/complaints/${row.complaintId}`}
                                                        >
                                                            {row.complaintNo}
                                                        </Link>
                                                    </td>

                                                    <td>
                                                        <span className={statusBadgeClass(row.statusCode)}>
                                                            {row.statusName}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        {row.wbcOwnerName || (
                                                            <span className="staff-muted">Unclaimed — any member can pick it up</span>
                                                        )}
                                                    </td>

                                                    <td>
                                                        <div className="staff-transfer-cell">
                                                            {personSelect(
                                                                key,
                                                                "wbcOwnerId",
                                                                committeeMembers,
                                                                row.wbcOwnerId,
                                                                "Select a committee member"
                                                            )}

                                                            <input
                                                                type="text"
                                                                value={draftFor(key).remarks}
                                                                onChange={(e) => setDraft(key, { remarks: e.target.value })}
                                                                placeholder="Reason"
                                                            />

                                                            <button
                                                                type="button"
                                                                className="staff-btn staff-btn-primary"
                                                                onClick={() => transferComplaint(row)}
                                                                disabled={busyId === key || !draftFor(key).wbcOwnerId}
                                                            >
                                                                {busyId === key ? "Moving..." : "Transfer"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                        )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CaseTransfers;
