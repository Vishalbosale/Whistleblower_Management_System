import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useMasters } from "../../context/MastersContext";
import { statusBadgeClass } from "../statusBadge";
import { TableSkeleton, TableEmpty } from "../components/TableState";
import Icon from "../../components/Icon/Icon";
import "./CaseWorkbench.css";

const QUEUE_STATUS_CODES = ["RECEIVED", "CONVERTED_TO_CASE"];

// Same page ceiling as the Case Workbench, and for the same reason — the KPI
// tiles below count this loaded page, so they should see as much of the
// queue as the server will hand back in one round trip.
const PAGE_SIZE = 100;

const DEFAULT_FILTERS = { status: "", severity: "", channel: "", search: "", dateFrom: "", dateTo: "" };

const ComplaintQueue = () => {
    const navigate = useNavigate();
    const allStatuses = useMasters("COMPLAINT_STATUS");
    const severities = useMasters("SEVERITY");
    const channels = useMasters("CHANNEL");

    const queueStatuses = useMemo(
        () => allStatuses.filter((s) => QUEUE_STATUS_CODES.includes(s.code)),
        [allStatuses]
    );
    const receivedStatus = queueStatuses.find((s) => s.code === "RECEIVED");
    const convertedStatus = queueStatuses.find((s) => s.code === "CONVERTED_TO_CASE");

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState("");
    const [result, setResult] = useState({ data: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const debounceRef = useRef(null);

    const load = async (activeFilters) => {
        setLoading(true);
        setError("");

        const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        params.set("queue", "1");
        Object.entries(activeFilters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });

        try {
            const data = await api.get(`/complaints?${params.toString()}`, { auth: true });
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setFilters((f) => ({ ...f, search: searchInput }));
        }, 300);

        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput]);

    const handleFilterChange = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

    const activeFilterCount = Object.values(filters).filter(Boolean).length;

    const handleClearFilters = () => {
        setSearchInput("");
        setFilters(DEFAULT_FILTERS);
    };

    const handleClearOne = (key) => {
        if (key === "search") {
            setSearchInput("");
            return;
        }
        handleFilterChange(key, "");
    };

    // Toggle a KPI tile's status filter: click again to clear it, same as
    // removing its chip below.
    const toggleStatus = (id) => {
        const value = String(id);
        handleFilterChange("status", filters.status === value ? "" : value);
    };

    // Status-wise counts for the KPI tiles, over this loaded page — same
    // caveat as the Case Workbench's tiles: accurate for what's on screen,
    // not a separate full-scope aggregate.
    const counts = useMemo(() => {
        let received = 0;
        let converted = 0;

        result.data.forEach((c) => {
            if (c.statusCode === "RECEIVED") received += 1;
            else if (c.statusCode === "CONVERTED_TO_CASE") converted += 1;
        });

        return { received, converted };
    }, [result.data]);

    const chips = useMemo(() => {
        const list = [];

        if (filters.status) {
            const option = queueStatuses.find((s) => String(s.id) === String(filters.status));
            list.push({ key: "status", label: "Status", value: option ? option.name : filters.status });
        }
        if (filters.severity) {
            const option = severities.find((s) => String(s.id) === String(filters.severity));
            list.push({ key: "severity", label: "Severity", value: option ? option.name : filters.severity });
        }
        if (filters.channel) {
            const option = channels.find((c) => String(c.id) === String(filters.channel));
            list.push({ key: "channel", label: "Channel", value: option ? option.name : filters.channel });
        }
        if (filters.dateFrom) {
            list.push({ key: "dateFrom", label: "From", value: filters.dateFrom });
        }
        if (filters.dateTo) {
            list.push({ key: "dateTo", label: "To", value: filters.dateTo });
        }
        if (filters.search) {
            list.push({ key: "search", label: "Search", value: filters.search });
        }

        return list;
    }, [filters, queueStatuses, severities, channels]);

    const handleRowClick = (row) => navigate(`/staff/complaints/${row.id}`);

    return (
        <div className="wb">
            <header className="wb-hero">
                <div className="wb-hero-copy">
                    <span className="wb-eyebrow">
                        <Icon name="inbox" size={13} />
                        Pre-Case Queue
                    </span>

                    <h1>Complaint Queue</h1>

                    <p className="wb-hero-sub">
                        Complaints received but not yet resolved at intake — acknowledge, triage, or convert them to a
                        case.
                    </p>
                </div>

                <div className="wb-hero-side">
                    <div className="wb-hero-metric">
                        <b>{result.total}</b>
                        <span>complaint{result.total === 1 ? "" : "s"}</span>
                    </div>
                </div>
            </header>

            <div className="wb-kpis">
                <button
                    type="button"
                    className={`wb-kpi wb-kpi--brand${!filters.status ? " is-active" : ""}`}
                    onClick={() => handleFilterChange("status", "")}
                    title="Show every queued complaint"
                >
                    <span className="wb-kpi-value">{result.total}</span>
                    <span className="wb-kpi-label">
                        <Icon name="inbox" size={13} />
                        In Queue
                    </span>
                </button>

                {receivedStatus && (
                    <button
                        type="button"
                        className={`wb-kpi wb-kpi--warning${
                            String(filters.status) === String(receivedStatus.id) ? " is-active" : ""
                        }`}
                        onClick={() => toggleStatus(receivedStatus.id)}
                        title="Filter the list to received, not-yet-converted complaints"
                    >
                        <span className="wb-kpi-value">{counts.received}</span>
                        <span className="wb-kpi-label">
                            <Icon name="alert" size={13} />
                            Received
                        </span>
                    </button>
                )}

                {convertedStatus && (
                    <button
                        type="button"
                        className={`wb-kpi wb-kpi--info${
                            String(filters.status) === String(convertedStatus.id) ? " is-active" : ""
                        }`}
                        onClick={() => toggleStatus(convertedStatus.id)}
                        title="Filter the list to complaints already converted to a case"
                    >
                        <span className="wb-kpi-value">{counts.converted}</span>
                        <span className="wb-kpi-label">
                            <Icon name="scale" size={13} />
                            Converted to Case
                        </span>
                    </button>
                )}
            </div>

            <div className="wb-toolbar">
                <label className="wb-field">
                    <span>Status</span>
                    <select
                        className={filters.status ? "is-set" : ""}
                        value={filters.status}
                        onChange={(e) => handleFilterChange("status", e.target.value)}
                    >
                        <option value="">All Statuses</option>
                        {queueStatuses.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="wb-field">
                    <span>Severity</span>
                    <select
                        className={filters.severity ? "is-set" : ""}
                        value={filters.severity}
                        onChange={(e) => handleFilterChange("severity", e.target.value)}
                    >
                        <option value="">All Severities</option>
                        {severities.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="wb-field">
                    <span>Channel</span>
                    <select
                        className={filters.channel ? "is-set" : ""}
                        value={filters.channel}
                        onChange={(e) => handleFilterChange("channel", e.target.value)}
                    >
                        <option value="">All Channels</option>
                        {channels.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="wb-field">
                    <span>From</span>
                    <input
                        type="date"
                        className={filters.dateFrom ? "is-set" : ""}
                        value={filters.dateFrom}
                        onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                        title="Date of receipt from"
                    />
                </label>

                <label className="wb-field">
                    <span>To</span>
                    <input
                        type="date"
                        className={filters.dateTo ? "is-set" : ""}
                        value={filters.dateTo}
                        onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                        title="Date of receipt to"
                    />
                </label>

                <label className="wb-field wb-field-search">
                    <span>Search</span>
                    <span className="staff-search">
                        <Icon name="search" size={16} />
                        <input
                            type="text"
                            placeholder="Complaint no / reference"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                    </span>
                </label>

                <span className="wb-toolbar-spacer" />

                <button
                    type="button"
                    className="wb-reset"
                    onClick={handleClearFilters}
                    disabled={activeFilterCount === 0}
                >
                    <Icon name="close" size={14} />
                    Clear all
                </button>
            </div>

            {chips.length > 0 && (
                <div className="wb-chips">
                    <span className="wb-chips-label">Filtered by</span>

                    {chips.map((chip) => (
                        <span className="wb-chip" key={chip.key}>
                            {chip.label}: <b>{chip.value}</b>
                            <button
                                type="button"
                                onClick={() => handleClearOne(chip.key)}
                                aria-label={`Remove ${chip.label} filter`}
                            >
                                <Icon name="close" size={11} strokeWidth={2.4} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {error && <div className="staff-error">{error}</div>}

            <div className="wb-table-card">
                <div className="wb-scroll">
                    <table className="staff-table wb-table">
                        <thead>
                            <tr>
                                <th>Complaint No</th>
                                <th>Date of Receipt</th>
                                <th>Ack Date</th>
                                <th>Complainant</th>
                                <th>Severity</th>
                                <th>Channel</th>
                                <th>Status</th>
                                <th aria-label="Open" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && result.data.length === 0 && <TableSkeleton columns={8} />}

                            {result.data.map((c) => (
                                <tr key={c.id} onClick={() => handleRowClick(c)}>
                                    <td>
                                        <span className="wb-ref">
                                            <b>{c.complaintNo}</b>
                                        </span>
                                    </td>
                                    <td>{c.dateOfReceipt ? c.dateOfReceipt.slice(0, 10) : <span className="staff-muted">—</span>}</td>
                                    <td>{c.ackToWbDate ? c.ackToWbDate.slice(0, 10) : <span className="staff-muted">—</span>}</td>
                                    <td>{c.complainantName || <span className="staff-muted">—</span>}</td>
                                    <td>{c.severity ? <span className="staff-badge">{c.severity}</span> : <span className="staff-muted">—</span>}</td>
                                    <td>{c.channel || <span className="staff-muted">—</span>}</td>
                                    <td>
                                        <span className={statusBadgeClass(c.statusCode)}>{c.status || "—"}</span>
                                    </td>
                                    <td className="wb-go">
                                        <Icon name="chevronRight" size={16} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {!loading && result.data.length === 0 && (
                        <TableEmpty
                            icon="inbox"
                            title="No complaints found"
                            hint={
                                activeFilterCount > 0
                                    ? "Try clearing or widening your filters."
                                    : "New complaints will appear here as they arrive."
                            }
                        />
                    )}
                </div>

                {result.data.length > 0 && (
                    <div className="wb-table-foot">
                        <span>
                            Showing <b>{result.data.length}</b> of <b>{result.total}</b> complaint
                            {result.total === 1 ? "" : "s"}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ComplaintQueue;
