const { canViewComplaint, canViewCase } = require("../utils/caseAccess");

// Route-level ownership gates, so every :id endpoint is scoped without each
// controller repeating the check. A file the caller cannot see returns 404
// rather than 403 — a committee member should not be able to discover which
// complaint numbers a colleague is handling by watching the status code.
const requireComplaintAccess = async (req, res, next) => {
    if (await canViewComplaint(req.params.id, req.user)) {
        return next();
    }

    res.status(404).json({ message: "Complaint not found" });
};

const requireCaseAccess = async (req, res, next) => {
    if (await canViewCase(req.params.id, req.user)) {
        return next();
    }

    res.status(404).json({ message: "Case not found" });
};

module.exports = { requireComplaintAccess, requireCaseAccess };
