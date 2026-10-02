const express = require("express");
const router = express.Router();

const {
    listUsers,
    createUser,
    updateUserStatus,
    assignRole,
    removeRole,
    deleteUser,
    getUserWorkload
} = require("../controllers/userController");
const { requireAuth, requireRole, requireAdmin } = require("../middleware/auth");
const { validateBody, numericParams, scalarQuery } = require("../middleware/validate");

numericParams(router, "id", "roleId");

router.use(requireAuth);

// Read access is open to any authenticated staff user (the forwarding and
// transfer screens need it to pick an investigation officer or a committee
// member) — every mutation is ADMIN-only.
router.use(scalarQuery);

router.get("/", listUsers);

router.post(
    "/",
    requireAdmin,
    validateBody({ text: { username: 100, fullName: 200, email: 254, employeeId: 50 } }),
    createUser
);
router.get("/:id/workload", requireAdmin, getUserWorkload);
router.patch("/:id/status", requireAdmin, validateBody({ text: { status: 20 } }), updateUserStatus);
router.delete("/:id", requireAdmin, deleteUser);
router.post("/:id/roles", requireAdmin, validateBody({ ids: ["roleId"] }), assignRole);
router.delete("/:id/roles/:roleId", requireAdmin, removeRole);

module.exports = router;
