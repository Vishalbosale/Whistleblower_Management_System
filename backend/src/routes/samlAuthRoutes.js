const express = require("express");
const router = express.Router();

const { spMetadata, status, initiateLogin, acs } = require("../controllers/samlAuthController");

// All public: this is the SAML front door, reached before anyone holds a
// session — the admin/investigator console side of the app only, per the
// spec (the anonymous reporter flow is untouched and lives under /api/public).
router.get("/metadata", spMetadata);
router.get("/status", status);
router.get("/login", initiateLogin);
router.post("/acs", acs);

module.exports = router;
