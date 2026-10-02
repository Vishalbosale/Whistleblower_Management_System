import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeRouteFor } from "../roles";

// `requireRole` accepts a single role code or a list of codes, any one of which
// grants access. The server enforces the same rules independently — this only
// keeps users out of screens that would fail for them anyway.
const ProtectedRoute = ({ children, requireRole }) => {
    const { user, roles, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="staff-loading">Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/post-box-login" replace />;
    }

    if (requireRole) {
        const allowed = Array.isArray(requireRole) ? requireRole : [requireRole];

        // A role mismatch here is never the user's dead end — it means this
        // path isn't theirs (a stale bookmark, a restored tab, a shared
        // link). Send them to the route their own role actually works from
        // instead of stranding them on a blank "no access" screen.
        if (!roles.some((role) => allowed.includes(role))) {
            const home = homeRouteFor(roles);
            return location.pathname === home ? null : <Navigate to={home} replace />;
        }
    }

    return children;
};

export default ProtectedRoute;
