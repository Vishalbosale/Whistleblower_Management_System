const express = require("express");
const router = express.Router();

const { downloadDocument } = require("../controllers/documentController");
const { requireAuth } = require("../middleware/auth");
const { numericParams } = require("../middleware/validate");

numericParams(router, "id");

router.get("/:id/download", requireAuth, downloadDocument);

module.exports = router;
