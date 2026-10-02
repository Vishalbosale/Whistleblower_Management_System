const express = require("express");
const cors = require("cors");
require("dotenv").config({ quiet: true });

const db = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const masterRoutes = require("./routes/masterRoutes");
const complaintRoutes = require("./routes/complaintRoutes");
const publicRoutes = require("./routes/publicRoutes");
const caseRoutes = require("./routes/caseRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const documentRoutes = require("./routes/documentRoutes");
const orgRoutes = require("./routes/orgRoutes");
const adminRoutes = require("./routes/adminRoutes");
const samlSettingsRoutes = require("./routes/samlSettingsRoutes");
const samlAuthRoutes = require("./routes/samlAuthRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const slaScheduler = require("./services/slaScheduler");
const { assertStorageConfigured } = require("./config/storage");

// Documents are stored in S3 only; refuse to start without a bucket and region.
assertStorageConfigured();

const app = express();

app.use(cors());
app.use(express.json());
// The SAML ACS endpoint receives the IdP's response as a real browser form
// POST (application/x-www-form-urlencoded), not JSON.
app.use(express.urlencoded({ extended: true }));

// Express 5 leaves req.body undefined when a request carries no body at all,
// which turns a legitimate "just acknowledge it, no remarks" PATCH into a
// TypeError in the handler. Normalising once here keeps every controller free
// to read optional fields straight off req.body.
app.use((req, res, next) => {
    if (!req.body) {
        req.body = {};
    }

    next();
});

// Basic API test
app.get("/api/health", (req, res) => {
    res.json({
        message: "Backend is working fine"
    });
});

// MySQL connection test
app.get("/api/test-db", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT 1 AS result");

        res.json({
            success: true,
            message: "MySQL connection successful",
            data: rows
        });

    } catch (error) {
        console.error("MySQL Error:", error);

        res.status(500).json({
            success: false,
            message: "MySQL connection failed"
        });
    }
});

app.use("/api/auth", authRoutes);
app.use("/api/auth/saml", samlAuthRoutes);
app.use("/api/masters", masterRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/saml-settings", samlSettingsRoutes);
app.use("/api/notifications", notificationRoutes);

// Centralized error handler — Express 5 forwards rejected promises from
// async route handlers here automatically.
app.use((err, req, res, next) => {
    console.error(err);

    if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Duplicate record" });
    }

    const status = err.status || 500;

    // Client errors (bad JSON, oversized body, WorkflowError) carry a message
    // written for the caller. Anything else is an internal failure whose
    // message could expose SQL or file paths, so it stays in the log.
    res.status(status).json({
        message: status < 500 || err.expose ? err.message : "Internal server error"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Drives the reminder / auto-close clock on outstanding requests for
    // additional details from the whistle-blower.
    slaScheduler.start();
});
