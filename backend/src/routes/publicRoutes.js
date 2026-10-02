const express = require("express");
const router = express.Router();

const {
    submitComplaint,
    trackComplaint,
    respondToClarification,
    downloadPublicDocument
} = require("../controllers/publicComplaintController");
const { upload } = require("../middleware/upload");
const { validateBody } = require("../middleware/validate");

const CREDENTIALS = { complaintId: 50, password: 200 };

// complainant / respondents are JSON-encoded strings inside the multipart form.
const submitShape = {
    text: {
        description: 10000,
        complaintReferenceId: 100,
        channelReference: 200,
        complainantReferenceId: 100,
        complainant: 20000,
        respondents: 100000,
        declaration: 10,
        wantsPostbox: 10
    },
    ids: [
        "anonymityTypeId",
        "addressedToId",
        "languageId",
        "channelId",
        "natureId",
        "classificationId",
        "subClassificationId",
        "complainantTypeId",
        "severityId"
    ],
    dates: ["dateOfReceipt"]
};

router.post("/complaints", upload.single("file"), validateBody(submitShape), submitComplaint);
router.post("/complaints/track", validateBody({ text: CREDENTIALS }), trackComplaint);
router.post(
    "/complaints/respond",
    upload.single("file"),
    validateBody({ text: { ...CREDENTIALS, responseText: 10000 }, ids: ["clarificationId"] }),
    respondToClarification
);
router.post(
    "/complaints/document-download",
    validateBody({ text: CREDENTIALS, ids: ["documentId"] }),
    downloadPublicDocument
);

module.exports = router;
