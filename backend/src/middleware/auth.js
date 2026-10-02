const { verifyToken } = require("../utils/tokens");
const { ADMIN_ROLES, WBC_ROLES, IU_ROLES } = require("../utils/permissions");

const requireAuth = (req, res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ message: "Authentication required" });
    }

    try {
        req.user = verifyToken(token);
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};

// Usage: requireRole("WBC_MEMBER")
const requireRole = (...allowedRoles) => (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const hasRole = userRoles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
        return res.status(403).json({ message: "Insufficient role permissions" });
    }

    next();
};

// Guards named after the three constituencies the workflow is written around,
// so route definitions read like the procedure rather than like a role list.
const requireAdmin = requireRole(...ADMIN_ROLES);
const requireWbc = requireRole(...WBC_ROLES);
const requireInvestigationUnit = requireRole(...IU_ROLES, ...ADMIN_ROLES);

module.exports = { requireAuth, requireRole, requireAdmin, requireWbc, requireInvestigationUnit };
