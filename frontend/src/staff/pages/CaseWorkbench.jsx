import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useMasters } from "../../context/MastersContext";
import { useAuth } from "../context/AuthContext";
import { isAdmin, canActAsWbc, constituencyOf } from "../roles";
import { statusBadgeClass } from "../statusBadge";
import { TableSkeleton, TableEmpty } from "../components/TableState";
import Icon from "../../components/Icon/Icon";
import StatusOverviewChart from "../components/StatusOverviewChart";
import {
    TERMINAL_CODES,
    daysUntil,
    relativeDue,
    initialsOf,
    priorityClass,
    ownerOf
} from "../workbenchUtils";
import "./CaseWorkbench.css";

const QUEUE_STATUS_CODES = ["RECEIVED", "CONVERTED_TO_CASE"];

// One page of the workbench feeds the table and the KPI tiles, so it is
// pulled at the server's ceiling rather than the default 20. The status
// overview chart below draws from its own full-scope endpoint instead, so it
// is never limited by this page size.
const PAGE_SIZE = 100;

const DEFAULT_FILTERS = { status: "", priority: "", officer: "", search: "" };

// The three KPI tiles that don't map to a server-side filter (overdue / due
// this week / unassigned) narrow the table client-side instead, over the same
// page of rows the tiles themselves were counted from — so the number on a
// tile and the rows it reveals can never disagree.
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
    },
    // A pre-case complaint always has no IU officer yet (it hasn't been
    // forwarded), so it counts as unassigned too, not just an actual CASE
    // row with a cleared assignment.
    unassigned: {
        label: "Unassigned",
        test: (row, terminal) => !row.assignedTo && !terminal
    }
};

const CaseWorkbench = () => {
    const navigate = useNavigate();
    const { roles } = useAuth();
    const caseStatuses = useMasters("CASE_STATUS");
    const complaintStatuses = useMasters("COMPLAINT_STATUS");
    const priorities = useMasters("PRIORITY");

    // The complaint queue (GET /complaints) is WBC/Admin only — an
    // Investigation Unit caller gets a 403, not a real zero. And the
    // "360° View" is meant to be an org-wide picture, which only Admin
    // actually gets back from GET /cases; everyone else is scoped to their
    // own files, so the label would be misleading for them.
    const admin = isAdmin(roles);
    const wbc = canActAsWbc(roles);

    const [officers, setOfficers] = useState([]);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState("");
    const [result, setResult] = useState({ data: [], total: 0 });
    const [totals, setTotals] = useState({ complaints: null, cases: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showInsights, setShowInsights] = useState(true);
    const [quickFilter, setQuickFilter] = useState(null);
    const debounceRef = useRef(null);

    const workbenchStatusOptions = useMemo(() => {
        const casesOptions = caseStatuses.map((s) => ({ value: `CASE:${s.code}`, label: s.name, group: "Case" }));
        const complaintOptions = complaintStatuses
            .filter((s) => !QUEUE_STATUS_CODES.includes(s.code))
            .map((s) => ({ value: `COMPLAINT:${s.code}`, label: s.name, group: "Pre-Case Complaint" }));

        return [...casesOptions, ...complaintOptions];
    }, [caseStatuses, complaintStatuses]);

    const load = async (activeFilters) => {
        setLoading(true);
        setError("");

        const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        Object.entries(activeFilters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });

        try {
            const data = await api.get(`/cases/workbench?${params.toString()}`, { auth: true });
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadTotals = async () => {
        try {
            const [complaintsRes, casesRes] = await Promise.all([
                wbc ? api.get("/complaints?pageSize=1", { auth: true }) : Promise.resolve(null),
                admin ? api.get("/cases?pageSize=1", { auth: true }) : Promise.resolve(null)
            ]);

            setTotals({
                complaints: complaintsRes ? complaintsRes.total : null,
                cases: casesRes ? casesRes.total : null
            });
        } catch {
            // Org-wide context is supplementary — leave the workbench usable if it fails.
        }
    };

    useEffect(() => {
        load(filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    useEffect(() => {
        loadTotals();
        api.get("/users", { auth: true }).then(setOfficers).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const handleClearOne = (key) => {
        if (key === "quick") {
            setQuickFilter(null);
            return;
        }
        if (key === "search") {
            // Let the debounce clear filters.search, so the box and the query
            // never disagree about what is being searched for.
            setSearchInput("");
            return;
        }
        handleFilterChange(key, "");
    };

    // A tile toggles its own quick filter off on a second click, same as
    // removing its chip below.
    const toggleQuickFilter = (key) => setQuickFilter((current) => (current === key ? null : key));

    /* --- What feeds the KPI tiles. The status breakdown itself is now drawn
           from its own full-scope endpoint (StatusOverviewChart), not this
           page-of-100, so it is not computed here any more. --- */
    const insights = useMemo(() => {
        const rows = result.data;
        const counts = { overdue: 0, dueWithinWeek: 0, unassigned: 0 };

        rows.forEach((row) => {
            const terminal = TERMINAL_CODES.includes(row.statusCode);

            Object.entries(QUICK_FILTERS).forEach(([key, { test }]) => {
                if (test(row, terminal)) counts[key] += 1;
            });
        });

        return { loaded: rows.length, ...counts };
    }, [result.data]);

    // The rows the table actually shows: the loaded page, narrowed by
    // whichever quick-filter tile is active (if any).
    const visibleRows = useMemo(() => {
        if (!quickFilter) return result.data;

        const { test } = QUICK_FILTERS[quickFilter];
        return result.data.filter((row) => test(row, TERMINAL_CODES.includes(row.statusCode)));
    }, [result.data, quickFilter]);

    /* --- Active filters, as individually removable chips. --- */
    const chips = useMemo(() => {
        const list = [];

        if (quickFilter) {
            list.push({ key: "quick", label: "Quick filter", value: QUICK_FILTERS[quickFilter].label });
        }
        if (filters.status) {
            const option = workbenchStatusOptions.find((o) => o.value === filters.status);
            list.push({ key: "status", label: "Status", value: option ? `${option.group}: ${option.label}` : filters.status });
        }
        if (filters.priority) {
            const option = priorities.find((p) => String(p.id) === String(filters.priority));
            list.push({ key: "priority", label: "Priority", value: option ? option.name : filters.priority });
        }
        if (filters.officer) {
            const option = officers.find((o) => String(o.id) === String(filters.officer));
            list.push({ key: "officer", label: "Officer", value: option ? option.fullName : filters.officer });
        }
        if (filters.search) {
            list.push({ key: "search", label: "Search", value: filters.search });
        }

        return list;
    }, [filters, quickFilter, workbenchStatusOptions, priorities, officers]);

    const partial = result.total > insights.loaded;

    const handleRowClick = (row) => {
        if (row.recordType === "CASE") {
            navigate(`/staff/cases/${row.id}`);
        } else {
            navigate(`/staff/complaints/${row.id}`);
        }
    };

    return (
        <div className="wb">
            <header className="wb-hero">
                <div className="wb-hero-copy">
                    <span className="wb-eyebrow">
                        <Icon name="briefcase" size={13} />
                        {constituencyOf(roles)}
                    </span>

                    <h1>Case Workbench</h1>

                    <p className="wb-hero-sub">
                        Every case and every complaint past intake that is yours to move — with where it sits in the
                        procedure, what the clock says, and who is carrying it.
                    </p>
                </div>

                <div className="wb-hero-side">
                    <button
                        type="button"
                        className="wb-insights-btn"
                        aria-expanded={showInsights}
                        onClick={() => setShowInsights((open) => !open)}
                    >
                        <Icon name="chevronRight" size={15} />
                        {showInsights ? "Hide insights" : "Show insights"}
                    </button>

                    <div className="wb-hero-metric">
                        <b>{result.total}</b>
                        <span>work item{result.total === 1 ? "" : "s"}</span>
                    </div>
                </div>
            </header>

            <div className="wb-kpis">
                <button
                    type="button"
                    className={`wb-kpi wb-kpi--brand${!quickFilter ? " is-active" : ""}`}
                    onClick={() => setQuickFilter(null)}
                    title="Show every work item — clears the quick filter"
                >
                    <span className="wb-kpi-value">{result.total}</span>
                    <span className="wb-kpi-label">
                        <Icon name="briefcase" size={13} />
                        Work Items
                    </span>
                </button>

                {wbc && totals.complaints !== null && (
                    <button
                        type="button"
                        className="wb-kpi wb-kpi--muted"
                        onClick={() => navigate("/staff/complaints")}
                        title="Open the Complaint Queue"
                    >
                        <span className="wb-kpi-value">{totals.complaints}</span>
                        <span className="wb-kpi-label">
                            <Icon name="inbox" size={13} />
                            Total Complaints
                        </span>
                    </button>
                )}

                {admin && totals.cases !== null && (
                    <button
                        type="button"
                        className="wb-kpi wb-kpi--muted"
                        onClick={() => setQuickFilter(null)}
                        title="Show every work item — clears the quick filter"
                    >
                        <span className="wb-kpi-value">{totals.cases}</span>
                        <span className="wb-kpi-label">
                            <Icon name="scale" size={13} />
                            Total Cases · 360°
                        </span>
                    </button>
                )}

                <button
                    type="button"
                    className={`wb-kpi wb-kpi--danger${insights.overdue ? " is-hot" : ""}${
                        quickFilter === "overdue" ? " is-active" : ""
                    }`}
                    onClick={() => toggleQuickFilter("overdue")}
                    title="Filter the list to overdue items"
                >
                    <span className="wb-kpi-value">{insights.overdue}</span>
                    <span className="wb-kpi-label">
                        <Icon name="alert" size={13} />
                        Past Due
                    </span>
                </button>

                <button
                    type="button"
                    className={`wb-kpi wb-kpi--warning${insights.dueWithinWeek ? " is-hot" : ""}${
                        quickFilter === "dueWithinWeek" ? " is-active" : ""
                    }`}
                    onClick={() => toggleQuickFilter("dueWithinWeek")}
                    title="Filter the list to items due within seven days"
                >
                    <span className="wb-kpi-value">{insights.dueWithinWeek}</span>
                    <span className="wb-kpi-label">
                        <Icon name="clock" size={13} />
                        Due This Week
                    </span>
                </button>

                <button
                    type="button"
                    className={`wb-kpi wb-kpi--info${quickFilter === "unassigned" ? " is-active" : ""}`}
                    onClick={() => toggleQuickFilter("unassigned")}
                    title="Filter the list to items with no Investigation Officer yet"
                >
                    <span className="wb-kpi-value">{insights.unassigned}</span>
                    <span className="wb-kpi-label">
                        <Icon name="users" size={13} />
                        Unassigned
                    </span>
                </button>
            </div>

            {showInsights && (
                <section className="wb-insights wb-insights-single">
                    <StatusOverviewChart
                        activeStatus={filters.status}
                        onSelectStatus={(recordType, statusCode) =>
                            handleFilterChange("status", `${recordType}:${statusCode}`)
                        }
                    />
                </section>
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
                        {workbenchStatusOptions.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.group}: {s.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="wb-field">
                    <span>Priority</span>
                    <select
                        className={filters.priority ? "is-set" : ""}
                        value={filters.priority}
                        onChange={(e) => handleFilterChange("priority", e.target.value)}
                    >
                        <option value="">All priorities</option>
                        {priorities.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </label>

                {officers.length > 0 && (
                    <label className="wb-field">
                        <span>Officer</span>
                        <select
                            className={filters.officer ? "is-set" : ""}
                            value={filters.officer}
                            onChange={(e) => handleFilterChange("officer", e.target.value)}
                        >
                            <option value="">All officers</option>
                            {officers.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.fullName}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

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
                                <th>Type</th>
                                <th>Reference</th>
                                <th>Priority</th>
                                <th>Risk Category</th>
                                <th>Owner</th>
                                <th>Due Date</th>
                                <th>Status</th>
                                <th aria-label="Open" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && visibleRows.length === 0 && <TableSkeleton columns={8} />}

                            {visibleRows.map((row) => {
                                const isCase = row.recordType === "CASE";
                                const owner = ownerOf(row);
                                const terminal = TERMINAL_CODES.includes(row.statusCode);
                                const days = row.dueDate && !terminal ? daysUntil(row.dueDate) : null;

                                let dueClass = "wb-due";
                                if (days !== null && days < 0) dueClass += " is-overdue";
                                else if (days !== null && days <= 3) dueClass += " is-soon";

                                return (
                                    <tr key={`${row.recordType}-${row.id}`} onClick={() => handleRowClick(row)}>
                                        <td>
                                            <span className={`wb-type ${isCase ? "wb-type-case" : "wb-type-pre"}`}>
                                                {isCase ? "Case" : "Pre-case"}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="wb-ref">
                                                <b className={row.caseNo ? "" : "is-pending"}>
                                                    {row.caseNo || "Case pending"}
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
                                            <span className="wb-owner">
                                                <span className={`wb-avatar-sm${owner ? "" : " is-vacant"}`}>
                                                    {owner ? initialsOf(owner) : "—"}
                                                </span>
                                                {owner || (isCase ? "Unassigned" : "Ethics Officer")}
                                            </span>
                                        </td>

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
                            title="No work items found"
                            hint={
                                activeFilterCount > 0
                                    ? "Try clearing or widening your filters."
                                    : "Cases appear here once complaints move past intake."
                            }
                        />
                    )}
                </div>

                {visibleRows.length > 0 && (
                    <div className="wb-table-foot">
                        <span>
                            Showing <b>{visibleRows.length}</b> of <b>{result.total}</b> work item
                            {result.total === 1 ? "" : "s"}
                            {quickFilter && ` (filtered to ${QUICK_FILTERS[quickFilter].label.toLowerCase()})`}
                        </span>

                        {partial && (
                            <span className="wb-truncated">
                                <Icon name="info" size={13} />
                                Narrow the filters to reach the rest
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CaseWorkbench;
