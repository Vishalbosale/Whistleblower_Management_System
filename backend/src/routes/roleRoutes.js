const express = require("express");
const router = express.Router();

const { listRoles } = require("../controllers/roleController");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth, listRoles);

module.exports = router;
