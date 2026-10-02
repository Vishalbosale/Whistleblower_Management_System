const express = require("express");
const router = express.Router();

const { listNotifications, markNotificationRead } = require("../controllers/notificationController");
const { requireAuth } = require("../middleware/auth");
const { numericParams } = require("../middleware/validate");

numericParams(router, "id");

router.get("/", requireAuth, listNotifications);
router.patch("/:id/read", requireAuth, markNotificationRead);

module.exports = router;
