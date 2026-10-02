import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../../components/Icon/Icon";
import "./CaseWorkbench.css";

// Administrator's user console: find a user, change what they can do, and take
// their access away when they leave.
//
// Deactivation and deletion are deliberately not the same button. Deletion is
// refused while a user still holds open work, and refused outright once they
// appear on committee or disciplinary records — those have to be kept. In both
// cases the answer is to deactivate, which removes access and leaves the audit
// trail intact.
const STATUS_FILTERS = [
    { value: "", label: "All statuses" },
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" },
    { value: "LOCKED", label: "Locked" },
    { value: "DISABLED", label: "Disabled" }
];

const UserManagement = () => {
    const { user: currentUser } = useAuth();

    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(true);

    const [searchInput, setSearchInput] = useState("");
    const [filters, setFilters] = useState({ search: "", status: "", group: "" });
    const debounceRef = useRef(null);

    const [newUser, setNewUser] = useState({ username: "", fullName: "", email: "", employeeId: "" });
    const [creating, setCreating] = useState(false);
    const [roleAssignment, setRoleAssignment] = useState({});
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);

        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });

        try {
            const [userList, roleList] = await Promise.all([
                api.get(`/users?${params.toString()}`, { auth: true }),
                api.get("/roles", { auth: true })
            ]);

            setUsers(userList);
            setRoles(roleList);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setFilters((f) => ({ ...f, search: searchInput }));
        }, 300);

        return () => clearTimeout(debounceRef.current);
    }, [searchInput]);

    const run = async (userId, fallback, fn) => {
        setError("");
        setNotice("");
        setBusyId(userId);

        try {
            const result = await fn();
            setNotice(result?.message || fallback);
            await load();
            return result;
        } catch (err) {
            setError(err.message);
            return null;
        } finally {
            setBusyId(null);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setError("");
        setNotice("");
        setCreating(true);

        try {
            const result = await api.post("/users", newUser, { auth: true });
            setNotice(
                `User "${newUser.username}" created. Temporary password: ${result.tempPassword} (share securely — it won't be shown again).`
            );
            setNewUser({ username: "", fullName: "", email: "", employeeId: "" });
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleAssignRole = (user) => {
        const roleId = roleAssignment[user.id];
        if (!roleId) return;

        return run(user.id, "Role assigned.", () =>
            api.post(`/users/${user.id}/roles`, { roleId: Number(roleId) }, { auth: true })
        );
    };

    const handleRemoveRole = (user, roleCode) => {
        const role = roles.find((r) => r.code === roleCode || r.name === roleCode);

        if (!role) {
            setError(`Could not resolve the role "${roleCode}"`);
            return;
        }

        if (!window.confirm(`Remove the ${roleCode} role from ${user.fullName}?`)) {
            return;
        }

        return run(user.id, "Role removed.", () => api.del(`/users/${user.id}/roles/${role.id}`, { auth: true }));
    };

    const handleStatusToggle = (user) => {
        const nextStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

        return run(user.id, "User status updated.", () =>
            api.patch(`/users/${user.id}/status`, { status: nextStatus }, { auth: true })
        );
    };

    const handleDelete = async (user) => {
        if (
            !window.confirm(
                `Permanently delete ${user.fullName}?\n\nIf they appear on any committee or disciplinary record this will be refused — deactivate them instead.`
            )
        ) {
            return;
        }

        await run(user.id, "User deleted.", () => api.del(`/users/${user.id}`, { auth: true }));
    };

    const activeFilterCount = Object.values(filters).filter(Boolean).length;

    const toggleStatus = (status) =>
        setFilters((f) => ({ ...f, status: f.status === status ? "" : status }));

    // Counts over the currently loaded (filter-scoped) list, same as the Case
    // Workbench's KPI tiles — a number here and the rows a tile reveals can
    // never disagree, at the cost of not being a separate org-wide total.
    const counts = useMemo(() => {
        let active = 0;
        let locked = 0;

        users.forEach((u) => {
            if (u.status === "ACTIVE") active += 1;
            else if (u.status === "LOCKED") locked += 1;
        });

        return { active, locked };
    }, [users]);

    const chips = useMemo(() => {
        const list = [];

        if (filters.status) {
            const option = STATUS_FILTERS.find((s) => s.value === filters.status);
            list.push({ key: "status", label: "Status", value: option ? option.label : filters.status });
        }
        if (filters.group) {
            const labels = { WBC: "WB Committee", IU: "Investigation Unit" };
            list.push({ key: "group", label: "Group", value: labels[filters.group] || filters.group });
        }
        if (filters.search) {
            list.push({ key: "search", label: "Search", value: filters.search });
        }

        return list;
    }, [filters]);

    const handleClearOne = (key) => {
        if (key === "search") {
            setSearchInput("");
            return;
        }
        setFilters((f) => ({ ...f, [key]: "" }));
    };

    return (
        <div className="wb">
            <header className="wb-hero">
                <div className="wb-hero-copy">
                    <span className="wb-eyebrow">
                        <Icon name="users" size={13} />
                        Administration
                    </span>

                    <h1>User Management</h1>

                    <p className="wb-hero-sub">
                        Find a user, change what they can do, and take their access away when they leave.
                    </p>
                </div>

                <div className="wb-hero-side">
                    <div className="wb-hero-metric">
                        <b>{users.length}</b>
                        <span>user{users.length === 1 ? "" : "s"}</span>
                    </div>
                </div>
            </header>

            <div className="wb-kpis">
                <button
                    type="button"
                    className={`wb-kpi wb-kpi--brand${!filters.status ? " is-active" : ""}`}
                    onClick={() => setFilters((f) => ({ ...f, status: "" }))}
                    title="Show every user"
                >
                    <span className="wb-kpi-value">{users.length}</span>
                    <span className="wb-kpi-label">
                        <Icon name="users" size={13} />
                        Total Users
                    </span>
                </button>

                <button
                    type="button"
                    className={`wb-kpi wb-kpi--info${filters.status === "ACTIVE" ? " is-active" : ""}`}
                    onClick={() => toggleStatus("ACTIVE")}
                    title="Filter the list to active users"
                >
                    <span className="wb-kpi-value">{counts.active}</span>
                    <span className="wb-kpi-label">
                        <Icon name="check" size={13} />
                        Active
                    </span>
                </button>

                <button
                    type="button"
                    className={`wb-kpi wb-kpi--danger${counts.locked ? " is-hot" : ""}${
                        filters.status === "LOCKED" ? " is-active" : ""
                    }`}
                    onClick={() => toggleStatus("LOCKED")}
                    title="Filter the list to locked users"
                >
                    <span className="wb-kpi-value">{counts.locked}</span>
                    <span className="wb-kpi-label">
                        <Icon name="alert" size={13} />
                        Locked
                    </span>
                </button>
            </div>

            {error && <div className="staff-error">{error}</div>}
            {notice && <div className="staff-success">{notice}</div>}

            <div className="wb-toolbar">
                <label className="wb-field wb-field-search">
                    <span>Search</span>
                    <span className="staff-search">
                        <Icon name="search" size={16} />
                        <input
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Name, username, email or employee ID"
                        />
                    </span>
                </label>

                <label className="wb-field">
                    <span>Status</span>
                    <select
                        className={filters.status ? "is-set" : ""}
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                    >
                        {STATUS_FILTERS.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="wb-field">
                    <span>Group</span>
                    <select
                        className={filters.group ? "is-set" : ""}
                        value={filters.group}
                        onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))}
                    >
                        <option value="">All groups</option>
                        <option value="WBC">WB Committee</option>
                        <option value="IU">Investigation Unit</option>
                    </select>
                </label>

                <span className="wb-toolbar-spacer" />

                <button
                    type="button"
                    className="wb-reset"
                    onClick={() => {
                        setSearchInput("");
                        setFilters({ search: "", status: "", group: "" });
                    }}
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

            <div className="wb-table-card">
                <div className="wb-scroll">
                {loading ? (
                    <p className="staff-empty">Loading...</p>
                ) : users.length === 0 ? (
                    <p className="staff-empty">No users match those filters.</p>
                ) : (
                        <table className="staff-table wb-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Status</th>
                                    <th>Roles</th>
                                    <th>Add Role</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => {
                                    const isSelf = u.id === currentUser?.userId;

                                    return (
                                        <tr key={u.id}>
                                            <td>
                                                <strong>{u.fullName}</strong>
                                                <span className="staff-muted">
                                                    {u.username}
                                                    {u.email ? ` · ${u.email}` : ""}
                                                    {isSelf ? " · you" : ""}
                                                </span>
                                            </td>

                                            <td>
                                                <span
                                                    className={`staff-badge staff-badge-${
                                                        u.status === "ACTIVE" ? "success" : "neutral"
                                                    }`}
                                                >
                                                    {u.status}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="staff-role-chips">
                                                    {u.roleCodes.length === 0 && <span className="staff-muted">None</span>}

                                                    {u.roleCodes.map((code) => (
                                                        <span key={code} className="staff-role-chip">
                                                            {code}
                                                            <button
                                                                type="button"
                                                                aria-label={`Remove ${code}`}
                                                                title={`Remove ${code}`}
                                                                onClick={() => handleRemoveRole(u, code)}
                                                                disabled={busyId === u.id}
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>

                                            <td>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <select
                                                        value={roleAssignment[u.id] || ""}
                                                        onChange={(e) =>
                                                            setRoleAssignment((r) => ({ ...r, [u.id]: e.target.value }))
                                                        }
                                                    >
                                                        <option value="">Select role</option>
                                                        {roles
                                                            .filter((r) => !u.roleCodes.includes(r.code))
                                                            .map((r) => (
                                                                <option key={r.id} value={r.id}>
                                                                    {r.name}
                                                                </option>
                                                            ))}
                                                    </select>

                                                    <button
                                                        type="button"
                                                        className="staff-btn"
                                                        onClick={() => handleAssignRole(u)}
                                                        disabled={busyId === u.id || !roleAssignment[u.id]}
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            </td>

                                            <td>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <button
                                                        type="button"
                                                        className="staff-btn"
                                                        onClick={() => handleStatusToggle(u)}
                                                        disabled={busyId === u.id || isSelf}
                                                        title={
                                                            isSelf
                                                                ? "You cannot deactivate your own account"
                                                                : undefined
                                                        }
                                                    >
                                                        {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="staff-btn staff-btn-danger"
                                                        onClick={() => handleDelete(u)}
                                                        disabled={busyId === u.id || isSelf}
                                                    >
                                                        Delete
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

            <form className="staff-card" onSubmit={handleCreateUser}>
                <h2 className="staff-section-title">Create User</h2>
                <p className="staff-note">
                    A temporary password is generated and shown once. Assign the new user a role afterwards — without
                    one they can sign in but see nothing.
                </p>

                <div className="staff-form-grid">
                    <div className="staff-form-group">
                        <label>Username *</label>
                        <input
                            type="text"
                            value={newUser.username}
                            onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
                            required
                        />
                    </div>

                    <div className="staff-form-group">
                        <label>Full Name *</label>
                        <input
                            type="text"
                            value={newUser.fullName}
                            onChange={(e) => setNewUser((u) => ({ ...u, fullName: e.target.value }))}
                            required
                        />
                    </div>

                    <div className="staff-form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={newUser.email}
                            onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                        />
                    </div>

                    <div className="staff-form-group">
                        <label>Employee ID</label>
                        <input
                            type="text"
                            value={newUser.employeeId}
                            onChange={(e) => setNewUser((u) => ({ ...u, employeeId: e.target.value }))}
                        />
                    </div>
                </div>

                <div className="staff-actions-row">
                    <button type="submit" className="staff-btn staff-btn-primary" disabled={creating}>
                        {creating ? "Creating..." : "Create User"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default UserManagement;
