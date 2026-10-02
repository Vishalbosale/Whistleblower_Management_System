import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useMasters } from "../../context/MastersContext";
import { statusBadgeClass } from "../statusBadge";
import { TableSkeleton, TableEmpty } from "../components/TableState";
import Icon from "../../components/Icon/Icon";
import { TERMINAL_CODES, daysUntil, relativeDue, priorityClass } from "../workbenchUtils";
import "./CaseWorkbench.css";

// The Investigation Unit's landing page — every case assigned to them (the
// server scopes GET /cases/workbench to the caller's own assignments once
// they hold no WBC/Admin role), without the committee-oriented pipeline/
// workload panels that belong on the shared Case Workbench instead.
const PAGE_SIZE = 100;
const DEFAULT_FILTERS = { status: "", search: "" };

// Mirrors CaseWorkbench's QUICK_FILTERS — the KPI tiles narrow the table
// client-side over the same loaded page they were counted from, so a tile's
// number and the rows it reveals can never disagree.
const QUICK_FILTERS = {
    overdue: {
        label: "Past Due",
        test: (row, terminal) => !terminal && row.dueDate && daysUntil(row.dueDate) < 0
    },
    dueWithinWeek: {
        label: "Due This Week",
        test: (row, terminal) => {
            if (terminal || !row.dueDate) return false;
            const days = daysUntil(row.dueDate);
            return days >= 0 && days <= 7;
        }
    }
};

const MyCases = () => {
    const navigate = useNavigate();
    const caseStatuses = useMasters("CASE_STATUS");

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState("");
    const [result, setResult] = useState({ data: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [quickFilter, setQuickFilter] = useState(null);
    const debounceRef = useRef(null);

    const load = async (activeFilters) => {
        setLoading(true);
        setError("");

        const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        if (activeFilters.status) params.set("status", `CASE:${activeFilters.status}`);
        if (activeFilters.search) params.set("search", activeFilters.search);

        try {
            const data = await api.get(`/cases/workbench?${params.toString()}`, { auth: true });
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
    const activeFilterCount = Object.values(filters).filter(Boolean).length + (quickFilter ? 1 : 0);
    const handleClearFilters = () => {
        setSearchInput("");
        setFilters(DEFAULT_FILTERS);
        setQuickFilter(null);
    };
    const toggleQuickFilter = (key) => setQuickFilter((current) => (current === key ? null : key));

    const kpis = useMemo(() => {
        let overdue = 0;
        let dueWithinWeek = 0;
        let live = 0;

        result.data.forEach((row) => {
            if (TERMINAL_CODES.includes(row.statusCode)) return;
            live += 1;

            if (!row.dueDate) return;
            const days = daysUntil(row.dueDate);
            if (days < 0) overdue += 1;
            else if (days <= 7) dueWithinWeek += 1;
        });

        return { live, overdue, dueWithinWeek };
    }, [result.data]);

    const visibleRows = useMemo(() => {
        if (!quickFilter) return result.data;

        const { test } = QUICK_FILTERS[quickFilter];
        return result.data.filter((row) => test(row, TERMINAL_CODES.includes(row.statusCode)));
    }, [result.data, quickFilter]);

    const handleRowClick = (row) => navigate(`/staff/cases/${row.id}`);

    return (
        <div className="wb">
            <header className="wb-hero">
                <div className="wb-hero-copy">
                    <span className="wb-eyebrow">
                        <Icon name="briefcase" size={13} />
                        Investigation Unit
                    </span>

                    <h1>My Cases</h1>

                    <p className="wb-hero-sub">Every case assigned to you, with what the clock says about it.</p>
                </div>

                <div className="wb-hero-side">
                    <div className="wb-hero-metric">
                        <b>{result.total}</b>
                        <span>case{result.total === 1 ? "" : "s"}</span>
                    </div>
                </div>
            </header>

            <div className="wb-kpis">
                <button
                    type="button"
                    className={`wb-kpi wb-kpi--brand${!quickFilter ? " is-active" : ""}`}
                    onClick={() => setQuickFilter(null)}
                    title="Show every open case — clears the quick filter"
                >
                    <span className="wb-kpi-value">{kpis.live}</span>
                    <span className="wb-kpi-label">
                        <Icon name="briefcase" size={13} />
                        Open Cases
                    </span>
                </button>

                <button
                    type="button"
                    className={`wb-kpi wb-kpi--danger${kpis.overdue ? " is-hot" : ""}${
                        quickFilter === "overdue" ? " is-active" : ""
                    }`}
                    onClick={() => toggleQuickFilter("overdue")}
                    title="Filter the list to overdue cases"
                >
                    <span className="wb-kpi-value">{kpis.overdue}</span>
                    <span className="wb-kpi-label">
                        <Icon name="alert" size={13} />
                        Past Due
                    </span>
                </button>

                <button
                    type="button"
                    className={`wb-kpi wb-kpi--warning${kpis.dueWithinWeek ? " is-hot" : ""}${
                        quickFilter === "dueWithinWeek" ? " is-active" : ""
                    }`}
                    onClick={() => toggleQuickFilter("dueWithinWeek")}
                    title="Filter the list to cases due within seven days"
                >
                    <span className="wb-kpi-value">{kpis.dueWithinWeek}</span>
                    <span className="wb-kpi-label">
                        <Icon name="clock" size={13} />
                        Due This Week
                    </span>
                </button>
            </div>

            {quickFilter && (
                <div className="wb-chips">
                    <span className="wb-chips-label">Filtered by</span>
                    <span className="wb-chip">
                        Quick filter: <b>{QUICK_FILTERS[quickFilter].label}</b>
                        <button type="button" onClick={() => setQuickFilter(null)} aria-label="Remove quick filter">
                            <Icon name="close" size={11} strokeWidth={2.4} />
                        </button>
                    </span>
                </div>
            )}

            <div className="wb-toolbar">
                <label className="wb-field">
                    <span>Status</span>
                    <select
                        className={filters.status ? "is-set" : ""}
                        value={filters.status}
                        onChange={(e) => handleFilterChange("status", e.target.value)}
                    >
                        <option value="">All statuses</option>
                        {caseStatuses.map((s) => (
                            <option key={s.code} value={s.code}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="wb-field wb-field-search">
                    <span>Search</span>
                    <span className="staff-search">
                        <Icon name="search" size={16} />
                        <input
                            type="text"
                            placeholder="Case no / complaint no"
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

            {error && <div className="staff-error">{error}</div>}

            <div className="wb-table-card">
                <div className="wb-scroll">
                    <table className="staff-table wb-table">
                        <thead>
                            <tr>
                                <th>Reference</th>
                                <th>Priority</th>
                                <th>Risk Category</th>
                                <th>Due Date</th>
                                <th>Status</th>
                                <th aria-label="Open" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && visibleRows.length === 0 && <TableSkeleton columns={6} />}

                            {visibleRows.map((row) => {
                                const terminal = TERMINAL_CODES.includes(row.statusCode);
                                const days = row.dueDate && !terminal ? daysUntil(row.dueDate) : null;

                                let dueClass = "wb-due";
                                if (days !== null && days < 0) dueClass += " is-overdue";
                                else if (days !== null && days <= 3) dueClass += " is-soon";

                                return (
                                    <tr key={row.id} onClick={() => handleRowClick(row)}>
                                        <td>
                                            <span className="wb-ref">
                                                <b>
                                                    {row.caseNo}
                                                    {row.hasUnseenUpdate && (
                                                        <span className="staff-badge staff-badge-info" style={{ marginLeft: 8 }}>
                                                            New
                                                        </span>
                                                    )}
                                                </b>
                                                <span>{row.complaintNo}</span>
                                            </span>
                                        </td>

                                        <td>
                                            {row.priority ? (
                                                <span className={`wb-prio ${priorityClass(row.priority)}`}>
                                                    {row.priority}
                                                </span>
                                            ) : (
                                                <span className="staff-muted">—</span>
                                            )}
                                        </td>

                                        <td>{row.riskCategory || <span className="staff-muted">—</span>}</td>

                                        <td>
                                            {row.dueDate ? (
                                                <span className={dueClass}>
                                                    <time dateTime={row.dueDate.slice(0, 10)}>
                                                        {row.dueDate.slice(0, 10)}
                                                    </time>
                                                    {days !== null && (
                                                        <span className="wb-due-rel">{relativeDue(days)}</span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="staff-muted">—</span>
                                            )}
                                        </td>

                                        <td>
                                            <span className={statusBadgeClass(row.statusCode)}>{row.status || "—"}</span>
                                        </td>

                                        <td className="wb-go">
                                            <Icon name="chevronRight" size={16} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {!loading && visibleRows.length === 0 && (
                        <TableEmpty
                            icon="briefcase"
                            title="No cases assigned"
                            hint={
                                activeFilterCount > 0
                                    ? "Try clearing or widening your filters."
                                    : "Cases you're assigned to investigate will appear here."
                            }
                        />
                    )}
                </div>

                {visibleRows.length > 0 && (
                    <div className="wb-table-foot">
                        <span>
                            Showing <b>{visibleRows.length}</b> of <b>{result.total}</b> case
                            {result.total === 1 ? "" : "s"}
                            {quickFilter && ` (filtered to ${QUICK_FILTERS[quickFilter].label.toLowerCase()})`}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyCases;
