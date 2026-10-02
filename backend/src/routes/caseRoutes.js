const express = require("express");
const router = express.Router();

const {
    createCase,
    listCases,
    listWorkbench,
    getWorkbenchStats,
    getCase,
    assignCase,
    addCaseRemark
} = require("../controllers/caseController");
const { requestDetailsForCase } = require("../controllers/complaintController");
const {
    getInvestigation,
    submitReport,
    seekClarification,
    uploadInvestigationDocument,
    proposeDetailsRequest
} = require("../controllers/investigationController");
const {
    getWbcSummary,
    placeBeforeCommittee,
    recordDecision,
    recordDacOutcome,
    recordImplementation,
    reviewDetailsProposal,
    forwardResponse,
    closeCase
} = require("../controllers/wbcController");
const { transferCase } = require("../controllers/transferController");
const { exportCaseJourney } = require("../controllers/exportController");
const { requireAuth, requireAdmin, requireWbc, requireInvestigationUnit } = require("../middleware/auth");
const { requireCaseAccess } = require("../middleware/access");
const { upload } = require("../middleware/upload");
const { validateBody, numericParams, scalarQuery } = require("../middleware/validate");

numericParams(router, "id", "clarificationId");

const LONG = 10000;
const SHORT = 5000;


router.use(requireAuth);

// --- Listing -----------------------------------------------------------------
// Scoped inside the controllers: a committee member sees the files they own, an
// Investigation Unit user the cases assigned to them, Admin everything.
router.use(scalarQuery);

router.get("/", listCases);
router.get("/workbench", listWorkbench);
router.get("/workbench/stats", getWorkbenchStats);
router.post(
    "/",
    requireWbc,
    validateBody({
        text: { remarks: SHORT },
        ids: [
            "complaintId",
            "caseTypeId",
            "priorityId",
            "riskCategoryId",
            "investigationUnitId",
            "investigationOfficerId"
        ],
        dates: ["dueDate"]
    }),
    createCase
);

// Everything below addresses one case, and is gated on being allowed to see it.
router.use("/:id", requireCaseAccess);

router.get("/:id", getCase);
router.get("/:id/investigation", getInvestigation);
router.get("/:id/wbc", getWbcSummary);
router.post("/:id/remarks", validateBody({ text: { remarks: SHORT } }), addCaseRemark);

// --- Investigation Unit ------------------------------------------------------
// "Submission of IVR by IU", and the resubmission that answers a committee
// clarification. Supporting documents ride along with the submission, so the
// findings and the evidence behind them are filed in one action.
router.post(
    "/:id/investigation/reports",
    requireInvestigationUnit,
    upload.array("files", 10),
    validateBody({
        text: {
            findings: LONG,
            rootCause: LONG,
            evidenceSummary: LONG,
            recommendation: LONG,
            conclusion: LONG,
            clarificationResponse: LONG,
            documentCategory: 100
        }
    }),
    submitReport
);

router.post(
    "/:id/investigation/documents",
    requireInvestigationUnit,
    upload.array("files", 10),
    validateBody({ text: { category: 100 }, ids: ["reportId"] }),
    uploadInvestigationDocument
);

// The IU cannot write to the whistle-blower directly — it asks the committee.
router.post(
    "/:id/investigation/detail-requests",
    requireInvestigationUnit,
    validateBody({ text: { question: SHORT } }),
    proposeDetailsRequest
);

// --- WB Committee ------------------------------------------------------------
// "Clarification required for IVR submitted? -> Y" — send it back to the IU.
router.post(
    "/:id/investigation/clarifications",
    requireWbc,
    validateBody({ text: { details: SHORT }, dates: ["responseDueDate"] }),
    seekClarification
);

// Forward or decline what the Investigation Unit asked to put to the complainant.
router.patch(
    "/:id/detail-requests/:clarificationId",
    requireWbc,
    validateBody({ text: { question: SHORT, remarks: SHORT } }),
    reviewDetailsProposal
);

// Pass the complainant's answer on to the Investigation Unit. The answer
// reaches the IU by this route and no other.
router.post(
    "/:id/detail-requests/:clarificationId/forward",
    requireWbc,
    validateBody({ text: { sharedText: LONG } }),
    forwardResponse
);

// "Report and observations placed before WB Committee."
router.post(
    "/:id/wbc/meetings",
    requireWbc,
    validateBody({ text: { agenda: 1000, observations: SHORT }, dates: ["meetingDate"], idLists: ["memberIds"] }),
    placeBeforeCommittee
);

// "Execute WB Committee decision" / "Recommended by WB Committee? (DAC/Other)".
router.post(
    "/:id/wbc/decisions",
    requireWbc,
    validateBody({
        text: { recommendation: 50, actionTaken: SHORT, decisionRemarks: SHORT },
        ids: ["nextWorkflowOwnerId", "chairpersonId"],
        idLists: ["dacMemberIds"]
    }),
    recordDecision
);

// "Initiate appropriate DAC proceedings / other actions."
router.post(
    "/:id/dac/outcome",
    requireWbc,
    validateBody({ text: { outcome: 50, decisionSummary: SHORT, penaltyDetails: SHORT } }),
    recordDacOutcome
);

// "Implement committee recommendations."
router.post("/:id/implementation", requireWbc, validateBody({ text: { notes: SHORT } }), recordImplementation);

// The committee writing to the whistle-blower after the case reached the IU.
router.post(
    "/:id/request-details",
    requireWbc,
    validateBody({ text: { question: SHORT } }),
    requestDetailsForCase
);

// "Send suitable response to WB towards the closure of complaint. Case Closure."
router.post(
    "/:id/close",
    requireWbc,
    validateBody({ text: { closureReason: SHORT, responseToWhistleblower: SHORT, remarks: SHORT } }),
    closeCase
);

// --- Administrator -----------------------------------------------------------
// Reassignment is Admin's alone — it is the remedy for whoever holds a file
// becoming unavailable, and the case resumes from the stage it had reached.
router.patch("/:id/transfer", requireAdmin, validateBody({ text: { remarks: SHORT }, ids: ["wbcOwnerId", "investigationOfficerId"] }), transferCase);
router.patch(
    "/:id/assign",
    requireAdmin,
    validateBody({
        text: { remarks: SHORT },
        ids: ["investigationOfficerId", "reviewerId", "escalationOwnerId"],
        dates: ["investigationDueDate"]
    }),
    assignCase
);

// "Export full case journey ... to PDF."
router.get("/:id/export", requireAdmin, exportCaseJourney);

module.exports = router;
