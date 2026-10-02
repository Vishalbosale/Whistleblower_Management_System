import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import Icon from "../../components/Icon/Icon";

// "Remove existing charts; replace with a single chart giving a clear
// overview of all submitted cases" + "show status-wise ticket counts" — one
// horizontal bar per status, sourced from the caller's full scope (not the
// workbench's 100-row page), so the count is never a silent undercount.
//
// One series (ticket counts), so one hue does the whole chart — identity
// here is carried by the row label, not by color, so no legend is needed.
//
// Each bar is also a filter: `onSelectStatus(recordType, statusCode)` sets
// the workbench's own status filter (a real server round-trip, since this
// chart already reads a wider scope than the loaded page) — `activeStatus`
// (the `"CASE:CODE"` / `"COMPLAINT:CODE"` value the toolbar filter holds)
// highlights whichever bar that resolves to.
const StatusOverviewChart = ({ onSelectStatus, activeStatus }) => {
    const [stats, setStats] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        api
            .get("/cases/workbench/stats", { auth: true })
            .then((data) => {
                if (cancelled) return;
                setStats(data.stats || []);
                setTotal(data.total || 0);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const bars = useMemo(
        () => [...stats].sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
        [stats]
    );

    const max = Math.max(1, ...bars.map((b) => b.count));

    return (
        <article className="wb-panel wb-panel-wide">
            <div className="wb-panel-head">
                <Icon name="scale" size={17} />
                <div>
                    <div className="wb-panel-title">Cases &amp; Complaints by Status</div>
                    <div className="wb-panel-note">
                        {loading
                            ? "Loading…"
                            : `${total} ticket${total === 1 ? "" : "s"} in your view — click a status to filter the list.`}
                    </div>
                </div>
            </div>

            {error && <div className="staff-error">{error}</div>}

            {!loading && !error && bars.length === 0 && <div className="wb-panel-empty">Nothing to plot yet.</div>}

            {bars.length > 0 && (
                <div className="wb-status-chart">
                    {bars.map((bar) => {
                        const value = `${bar.recordType}:${bar.statusCode}`;
                        const isActive = activeStatus === value;

                        return (
                            <button
                                type="button"
                                className={`wb-status-row${isActive ? " is-active" : ""}`}
                                key={value}
                                onClick={() => onSelectStatus?.(bar.recordType, bar.statusCode)}
                                title={`Filter the list to ${bar.recordType === "CASE" ? "cases" : "pre-case complaints"} — ${bar.status} (${bar.count})`}
                            >
                                <span className="wb-status-label">
                                    <span className={`wb-status-kind${bar.recordType === "CASE" ? "" : " is-precase"}`}>
                                        {bar.recordType === "CASE" ? "Case" : "Pre-case"}
                                    </span>
                                    {bar.status}
                                </span>

                                <span className="wb-status-track">
                                    <span
                                        className="wb-status-fill"
                                        style={{ width: `${Math.max((bar.count / max) * 100, 2)}%` }}
                                    />
                                </span>

                                <span className="wb-status-count">{bar.count}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </article>
    );
};

export default StatusOverviewChart;
