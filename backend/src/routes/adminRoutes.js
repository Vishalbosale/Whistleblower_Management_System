const express = require("express");
const router = express.Router();

const { requireAuth, requireAdmin } = require("../middleware/auth");
const { runOnce } = require("../services/slaScheduler");
const { listTransferableCases } = require("../controllers/transferController");
const { SLA } = require("../utils/sla");

router.use(requireAuth);

// The turnaround times the workflow is built around, so the UI can quote them
// without hard-coding a second copy. Readable by any signed-in staff user —
// these are the published rules of the procedure, and the committee screens
// quote them back to the people applying them.
router.get("/sla/config", (req, res) => {
    res.json(SLA);
});

// The reminder/auto-close clock normally ticks on a timer inside the API
// process. This forces a pass — useful for verifying the rule end to end
// without waiting, and for catching up after the process has been down.
router.post("/sla/run", requireAdmin, async (req, res) => {
    const result = await runOnce("manual");
    res.json(result);
});

// Every open file with who currently holds it, for the transfer console. Admin
// is the only role that sees all of them, and the only one that can move them.
router.get("/transfers", requireAdmin, listTransferableCases);

module.exports = router;
