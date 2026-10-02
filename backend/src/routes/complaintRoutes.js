const express = require("express");
const router = express.Router();

const {
    createComplaint,
    listComplaints,
    getComplaint,
    acknowledgeComplaint,
    requestDetails,
    forwardToInvestigationUnit,
    transferComplaint,
    routeComplaint,
    uploadComplaintDocument
} = require("../controllers/complaintController");
const { requireAuth, requireAdmin, requireWbc } = require("../middleware/auth");
const { requireComplaintAccess } = require("../middleware/access");
const { upload } = require("../middleware/upload");
const { validateBody, numericParams, scalarQuery } = require("../middleware/validate");

numericParams(router, "id");

const SHORT = 5000;


router.use(requireAuth);

// Complaint intake belongs to the WB Committee and Admin. The Investigation
// Unit works from the case screens and never browses the complaint queue —
// that separation is what keeps the complainant's identity out of its reach.
router.use(requireWbc);

router.use(scalarQuery);

router.get("/", listComplaints);
router.post("/", validateBody({ text: { description: 10000 } }), createComplaint);

// Everything below addresses one complaint, so it is scoped to complaints the
// caller owns (plus unclaimed ones, which any committee member may pick up).
router.use("/:id", requireComplaintAccess);

router.get("/:id", getComplaint);

// Step 2 of the procedure — acknowledgement within 4 days. Acknowledging an
// unclaimed complaint also claims it, making it that member's alone.
router.patch(
    "/:id/acknowledge",
    validateBody({ text: { remarks: SHORT }, dates: ["ackDate"] }),
    acknowledgeComplaint
);

// "Is the information sufficient to conduct an inquiry?" — N branch.
router.post("/:id/request-details", validateBody({ text: { question: SHORT } }), requestDetails);

// "Forward complaint to IU within 5 days from the date of complaint receipt."
router.post(
    "/:id/forward-to-iu",
    validateBody({
        text: { remarks: SHORT },
        ids: [
            "investigationOfficerId",
            "investigationUnitId",
            "priorityId",
            "riskCategoryId"
        ],
        dates: ["dueDate"]
    }),
    forwardToInvestigationUnit
);

// Admin-only: hand the file to a different WB Committee member, at any stage.
router.patch(
    "/:id/transfer",
    requireAdmin,
    validateBody({ text: { remarks: SHORT }, ids: ["wbcOwnerId"] }),
    transferComplaint
);

// Non-investigation dispositions: HR, Customer service, or direct closure.
router.patch("/:id/route", validateBody({ text: { target: 20, remarks: SHORT } }), routeComplaint);

router.post("/:id/documents", upload.single("file"), uploadComplaintDocument);

module.exports = router;
