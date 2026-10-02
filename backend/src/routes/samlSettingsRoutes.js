const express = require("express");
const router = express.Router();

const { getSamlSettings, fetchIdpMetadata, testAndSaveSamlSettings } = require("../controllers/samlSettingsController");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// The IdP trust configuration is sensitive enough that even read access is
// Admin-only, same as the AD settings screen it replaces.
router.use(requireAuth, requireAdmin);

router.get("/", getSamlSettings);

// POST rather than GET: it reaches out to the network and shouldn't be
// cached or replayable from a URL.
router.post("/fetch-metadata", fetchIdpMetadata);

// "Test & Save" is one action per the spec — it validates then persists,
// there's no separate silent save.
router.post("/test-and-save", testAndSaveSamlSettings);

module.exports = router;
