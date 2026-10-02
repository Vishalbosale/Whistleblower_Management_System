const express = require("express");
const router = express.Router();

const { login, me } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");

router.post("/login", validateBody({ text: { username: 100, password: 200 } }), login);
router.get("/me", requireAuth, me);

module.exports = router;
