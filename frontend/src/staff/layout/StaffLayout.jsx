import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canActAsWbc, isAdmin, isInvestigationUnit, constituencyOf } from "../roles";
import { api } from "../../lib/api";
import { useIdleTimeout } from "../../lib/useIdleTimeout";
import Icon from "../../components/Icon/Icon";
import "./StaffLayout.css";
import "../staff-common.css";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const NOTIFICATION_REFRESH_MS = 30000;

/* Initials for the avatar chip — "Priya Nair" -> "PN". */
const initialsOf = (name = "") =>
    name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "U";

const StaffLayout = () => {
    const { user, roles, logout } = useAuth();
    const navigate = useNavigate();
    const [navOpen, setNavOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const notificationRef = useRef(null);

    useEffect(() => {
        let active = true;

        const loadNotifications = async () => {
            try {
                const result = await api.get("/notifications", { auth: true });

                if (active) {
                    setNotifications(result.data || []);
                    setUnreadCount(result.unreadCount || 0);
                }
            } catch {
                // Notifications are supplementary; a failed refresh must not block the staff console.
            }
        };

        loadNotifications();
        const refreshTimer = window.setInterval(loadNotifications, NOTIFICATION_REFRESH_MS);

        return () => {
            active = false;
            window.clearInterval(refreshTimer);
        };
    }, []);

    const handleOpenNotification = async (note) => {
        setNotificationsOpen(false);

        if (!note.read) {
            setNotifications((list) => list.map((n) => (n.id === note.id ? { ...n, read: true } : n)));
            setUnreadCount((count) => Math.max(count - 1, 0));
            api.patch(`/notifications/${note.id}/read`, {}, { auth: true }).catch(() => {});
        }

        if (note.caseId) {
            navigate(`/staff/cases/${note.caseId}`);
        } else if (note.complaintId) {
            navigate(`/staff/complaints/${note.complaintId}`);
        }
    };

    useEffect(() => {
        const closeNotifications = (event) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setNotificationsOpen(false);
            }
        };

        document.addEventListener("mousedown", closeNotifications);
        return () => document.removeEventListener("mousedown", closeNotifications);
    }, []);

    const handleLogout = (reason) => {
        logout();
        navigate("/post-box-login", reason ? { state: { notice: reason } } : undefined);
    };

    // StaffLayout only mounts once ProtectedRoute has confirmed a session, so
    // the idle clock can run unconditionally for as long as this layout is on
    // screen — it unmounts (and the listeners with it) the moment the user
    // logs out or the token is rejected elsewhere.
    useIdleTimeout(
        IDLE_TIMEOUT_MS,
        () => handleLogout("You were logged out after 5 minutes of inactivity."),
        true
    );

    const closeNav = () => setNavOpen(false);

    return (
        <div className="staff-shell">
            <aside className={`staff-sidebar${navOpen ? " is-open" : ""}`}>
                <div className="staff-brand">
                    <span className="staff-brand-mark">
                        <Icon name="shieldCheck" size={19} strokeWidth={2} />
                    </span>

                    <span className="staff-brand-copy">
                        <strong>WMS</strong>
                        <small>Staff Console</small>
                    </span>
                </div>

                <nav className="staff-nav" onClick={closeNav}>
                    <span className="staff-nav-label">Workspace</span>

                    {/* Complaint intake belongs to the WB Committee and Admin.
                        The Investigation Unit works from the case workbench and
                        is refused the complaint API outright — showing the link
                        would only ever lead to a 403. */}
                    {canActAsWbc(roles) && (
                        <NavLink to="/staff/complaints" className="staff-nav-link">
                            <Icon name="inbox" size={18} />
                            <span>Complaint Queue</span>
                        </NavLink>
                    )}

                    <NavLink to="/staff/cases" className="staff-nav-link">
                        <Icon name="briefcase" size={18} />
                        <span>{isInvestigationUnit(roles) ? "My Cases" : "Case Workbench"}</span>
                    </NavLink>

                    {isAdmin(roles) && (
                        <>
                            <span className="staff-nav-label">Administration</span>

                            <NavLink to="/staff/users" className="staff-nav-link">
                                <Icon name="users" size={18} />
                                <span>User Management</span>
                            </NavLink>

                            <NavLink to="/staff/transfers" className="staff-nav-link">
                                <Icon name="briefcase" size={18} />
                                <span>Case Transfers</span>
                            </NavLink>

                            <NavLink to="/staff/saml-settings" className="staff-nav-link">
                                <Icon name="settings" size={18} />
                                <span>SAML Authentication</span>
                            </NavLink>
                        </>
                    )}
                </nav>

                <div className="staff-sidebar-foot">
                    <Icon name="lock" size={13} />
                    <span>Confidential — audited access</span>
                </div>
            </aside>

            {/* Backdrop for the mobile drawer */}
            {navOpen && (
                <div
                    className="staff-nav-backdrop"
                    onClick={closeNav}
                    aria-hidden="true"
                />
            )}

            <div className="staff-main">
                <header className="staff-topbar">
                    <button
                        type="button"
                        className="staff-nav-toggle"
                        aria-label="Toggle navigation"
                        aria-expanded={navOpen}
                        onClick={() => setNavOpen((open) => !open)}
                    >
                        <Icon name={navOpen ? "close" : "menu"} size={20} />
                    </button>

                    <div className="staff-topbar-right">
                        <div className="staff-notifications" ref={notificationRef}>
                            <button
                                type="button"
                                className={`staff-notification-btn${unreadCount ? " has-unread" : ""}`}
                                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                                aria-expanded={notificationsOpen}
                                onClick={() => setNotificationsOpen((open) => !open)}
                            >
                                <Icon name="bell" size={19} />
                                {unreadCount > 0 && (
                                    <span className="staff-notification-count">
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
                            </button>

                            {notificationsOpen && (
                                <div className="staff-notification-menu" role="dialog" aria-label="Notifications">
                                    <div className="staff-notification-heading">
                                        <strong>Notifications</strong>
                                        <span>{unreadCount} unread</span>
                                    </div>

                                    {notifications.length > 0 ? (
                                        <div className="staff-notification-list">
                                            {notifications.map((note) => (
                                                <button
                                                    type="button"
                                                    className={`staff-notification-item${note.read ? "" : " is-unread"}`}
                                                    key={note.id}
                                                    onClick={() => handleOpenNotification(note)}
                                                >
                                                    <span className="staff-notification-item-icon">
                                                        <Icon name={note.caseId ? "briefcase" : "inbox"} size={15} />
                                                    </span>
                                                    <span className="staff-notification-item-copy">
                                                        <strong>{note.caseNo || note.complaintNo}</strong>
                                                        <span>{note.subject}</span>
                                                        <span className="staff-notification-item-time">
                                                            {new Date(note.sentAt).toLocaleString()}
                                                        </span>
                                                    </span>
                                                    <Icon name="chevronRight" size={15} />
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="staff-notification-empty">No notifications yet.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="staff-user-info">
                            <span className="staff-avatar">
                                {initialsOf(user?.fullName)}
                            </span>

                            <span className="staff-user-copy">
                                <strong>{user?.fullName}</strong>
                                <span title={roles.join(", ")}>{constituencyOf(roles)}</span>
                            </span>
                        </div>

                        <button
                            type="button"
                            className="staff-logout-btn"
                            onClick={() => handleLogout()}
                        >
                            <Icon name="logout" size={15} />
                            <span>Logout</span>
                        </button>
                    </div>
                </header>

                <main className="staff-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default StaffLayout;
