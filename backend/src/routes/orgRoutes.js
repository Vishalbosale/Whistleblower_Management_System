const express = require("express");
const router = express.Router();

const { listDepartments } = require("../controllers/orgController");
const { requireAuth } = require("../middleware/auth");

router.get("/departments", requireAuth, listDepartments);

module.exports = router;
