import React from "react";
import Icon from "../../components/Icon/Icon";

/* =========================================================
   TABLE STATES
   Shimmer rows while a query is in flight, and an
   illustrated empty state when it comes back with nothing —
   so a list never flashes as a bare white box.
========================================================= */

export const TableSkeleton = ({ columns, rows = 5 }) => (
    <>
        {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="staff-skeleton-row">
                {Array.from({ length: columns }).map((__, colIndex) => (
                    <td key={colIndex}>
                        <span
                            className="wms-skeleton staff-skeleton-bar"
                            /* Uneven widths read as data rather than a grid. */
                            style={{ width: `${58 + ((rowIndex + colIndex) % 4) * 12}%` }}
                        />
                    </td>
                ))}
            </tr>
        ))}
    </>
);

export const TableEmpty = ({
    icon = "inbox",
    title = "Nothing to show",
    hint
}) => (
    <div className="staff-empty">
        <span className="staff-empty-icon">
            <Icon name={icon} size={26} strokeWidth={1.5} />
        </span>

        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
    </div>
);
