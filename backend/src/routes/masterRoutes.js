const express = require("express");
const router = express.Router();

const { getMasterValues } = require("../controllers/masterController");

router.param("code", (req, res, next, value) =>
    /^[A-Za-z0-9_]{1,60}$/.test(value) ? next() : res.status(400).json({ message: "Invalid master code" })
);

router.get("/:code", getMasterValues);

module.exports = router;
