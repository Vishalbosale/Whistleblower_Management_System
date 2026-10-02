// One-off Phase 1 seed: interim login users + notification templates +
// one extra document-category master value used by the anonymous
// clarification-response flow. Safe to re-run (uses INSERT IGNORE /
// ON DUPLICATE KEY UPDATE throughout).
require("dotenv").config({ quiet: true });
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { migrate } = require("../../scripts/migrate_workflow");
const { migrate: migrateSamlSettings } = require("../../scripts/migrate_saml_settings");
const { migrate: migrateChangeRequests } = require("../../scripts/migrate_change_requests");
const { migrate: migrateNotificationContent } = require("../../scripts/migrate_notification_content");
const { SLA } = require("../utils/sla");

const seedUser = async ({ username, fullName, email, password, roleCode }) => {
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await db.query("SELECT user_id FROM users WHERE username = ?", [username]);

    let userId;

    if (existing.length) {
        userId = existing[0].user_id;
        await db.query("UPDATE users SET password_hash = ?, full_name = ?, email = ? WHERE user_id = ?", [
            passwordHash,
            fullName,
            email,
            userId
        ]);
    } else {
        const [result] = await db.query(
            `INSERT INTO users (username, full_name, email, password_hash, status_code)
             VALUES (?, ?, ?, ?, 'ACTIVE')`,
            [username, fullName, email, passwordHash]
        );
        userId = result.insertId;
    }

    const [roles] = await db.query("SELECT role_id FROM roles WHERE role_code = ?", [roleCode]);

    if (roles.length) {
        await db.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE active_flag = 1`,
            [userId, roles[0].role_id]
        );
    }

    console.log(`Seeded user: ${username} / ${password} (${roleCode})`);
};

const seedTemplate = async ({ code, type, name, subject, body }) => {
    await db.query(
        `INSERT INTO notification_templates (template_code, template_type, template_name, subject, template_body)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE subject = VALUES(subject), template_body = VALUES(template_body)`,
        [code, type, name, subject, body]
    );
};

const seedDocumentCategory = async (code, name, displayOrder) => {
    await db.query(
        `INSERT IGNORE INTO master_values (master_type_id, value_code, value_name, display_order)
         SELECT master_type_id, ?, ?, ?
         FROM master_types WHERE master_code = 'DOCUMENT_CATEGORY'`,
        [code, name, displayOrder]
    );
};

// Like seedMasterValues, but also fixes up the display order of values that
// already exist. Used for the status lists, where the workflow inserts new
// stages *between* stages the base schema already shipped — appending them
// would leave the dropdowns and timelines out of procedure order.
const seedOrderedMasterValues = async (masterCode, values) => {
    for (let i = 0; i < values.length; i++) {
        const { code, name } = values[i];

        await db.query(
            `INSERT INTO master_values (master_type_id, value_code, value_name, display_order)
             SELECT master_type_id, ?, ?, ?
             FROM master_types WHERE master_code = ?
             ON DUPLICATE KEY UPDATE value_name = VALUES(value_name), display_order = VALUES(display_order)`,
            [code, name, i + 1, masterCode]
        );
    }
};

// The base schema script left several master types (case type, priority,
// risk category, complaint classification...) with no seeded values —
// needed for case creation to work in Phase 1.
const seedMasterValues = async (masterCode, values) => {
    for (let i = 0; i < values.length; i++) {
        const { code, name } = values[i];

        await db.query(
            `INSERT IGNORE INTO master_values (master_type_id, value_code, value_name, display_order)
             SELECT master_type_id, ?, ?, ?
             FROM master_types WHERE master_code = ?`,
            [code, name, i + 1, masterCode]
        );
    }
};

const seedSla = async ({ code, name, days, startEvent }) => {
    await db.query(
        `INSERT INTO sla_configurations (sla_code, sla_name, sla_type, target_days, start_event)
         VALUES (?, ?, 'CALENDAR_DAYS', ?, ?)
         ON DUPLICATE KEY UPDATE sla_name = VALUES(sla_name), target_days = VALUES(target_days),
                                 start_event = VALUES(start_event)`,
        [code, name, days, startEvent]
    );
};

(async () => {
    try {
        // The workflow columns must exist before anything below can reference
        // them, so the schema top-up runs as part of seeding. Both are
        // idempotent, so `npm run seed` remains safe to re-run at any time.
        await migrate();
        await migrateSamlSettings();
        await migrateChangeRequests();
        await migrateNotificationContent();

        await db.query("DELETE FROM user_roles");
        await db.query("DELETE FROM users");
        await db.query("DELETE FROM roles WHERE role_code = 'ADMIN'");

        await seedUser({
            username: "AFL2573",
            fullName: "WB Committee Member",
            email: "wbc.member@wms.local",
            password: "Uat@123",
            roleCode: "WBC_MEMBER"
        });

        await seedUser({
            username: "AFL1283",
            fullName: "Investigation Unit User",
            email: "iu.user@wms.local",
            password: "Uat@123",
            roleCode: "INVESTIGATOR"
        });

        await seedTemplate({
            code: "COMPLAINT_REGISTERED",
            type: "IN_APP",
            name: "Complaint Registered",
            subject: "Your complaint {{complaintNo}} has been registered",
            body: "Your complaint has been received and assigned reference {{complaintNo}}."
        });

        await seedTemplate({
            code: "NEW_COMPLAINT_RECEIVED",
            type: "IN_APP",
            name: "New Complaint Received",
            subject: "New complaint {{complaintNo}} received",
            body: "A new complaint has been received and is ready for WB Committee review."
        });

        await seedTemplate({
            code: "ACK_SENT",
            type: "IN_APP",
            name: "Acknowledgement Sent",
            subject: "Complaint {{complaintNo}} acknowledged",
            body: "Your complaint {{complaintNo}} has been acknowledged and is under review."
        });

        await seedTemplate({
            code: "CASE_ASSIGNED",
            type: "IN_APP",
            name: "Case Assigned",
            subject: "Case {{caseNo}} assigned to you by {{assignedByRole}} ({{dueDate}})",
            body:
                "You have been assigned as investigation officer for case {{caseNo}} by the {{assignedByRole}}. " +
                "Investigation due date: {{dueDate}}."
        });

        await seedTemplate({
            code: "CLARIFICATION_REQUESTED",
            type: "IN_APP",
            name: "Clarification Requested",
            subject: "{{requestedByRole}} requested more details on {{complaintNo}} — respond by {{dueDate}}",
            body:
                "The {{requestedByRole}} has asked: \"{{question}}\". Please log in to your post box and respond " +
                "on complaint {{complaintNo}} by {{dueDate}}."
        });

        await seedTemplate({
            code: "COMPLAINT_CLOSED",
            type: "IN_APP",
            name: "Complaint Closed",
            subject: "Complaint {{complaintNo}} closed",
            body: "Your complaint {{complaintNo}} has been closed."
        });

        // --- Workflow notifications ------------------------------------------
        // Every hop in the handling procedure tells somebody. Recipients are
        // resolved at send time (the complainant's email, or their post box for
        // anonymous complaints; role fan-out for the committee and the IU).
        await seedTemplate({
            code: "CLARIFICATION_REMINDER",
            type: "IN_APP",
            name: "Additional Details Reminder",
            subject: "Reminder {{reminderNo}} of {{totalReminders}} — details needed for {{complaintNo}} by {{dueDate}}",
            body:
                "This is reminder {{reminderNo}} of {{totalReminders}}. Please log in to your post box and provide " +
                "the additional details requested on complaint {{complaintNo}} by {{dueDate}}. If we do not hear " +
                "from you by then, the complaint will be closed."
        });

        await seedTemplate({
            code: "DETAILS_RECEIVED",
            type: "IN_APP",
            name: "Additional Details Received",
            subject: "Additional details received for {{complaintNo}}",
            body: "The whistle-blower has responded to the request for additional details on {{complaintNo}}."
        });

        await seedTemplate({
            code: "COMPLAINT_CLOSED_NO_RESPONSE",
            type: "IN_APP",
            name: "Closed — No Response",
            subject: "Complaint {{complaintNo}} closed",
            body:
                "Complaint {{complaintNo}} has been closed by the Whistle-blower Committee because the additional " +
                "details requested were not received within the time allowed."
        });

        await seedTemplate({
            code: "CASE_TRANSFERRED",
            type: "IN_APP",
            name: "Case Transferred",
            subject: "Complaint {{complaintNo}} transferred to you",
            body: "{{newOwner}} is now the WB Committee owner of complaint {{complaintNo}}."
        });

        await seedTemplate({
            code: "IVR_SUBMITTED",
            type: "IN_APP",
            name: "Investigation Report Submitted",
            subject: "Investigation report v{{versionNo}} submitted for {{caseNo}} by {{submittedByRole}}",
            body: "The {{submittedByRole}} has submitted version {{versionNo}} of the investigation report for {{caseNo}}."
        });

        await seedTemplate({
            code: "IVR_CLARIFICATION_SOUGHT",
            type: "IN_APP",
            name: "Clarification Sought on IVR",
            subject: "Clarification sought on the investigation report for {{caseNo}}",
            body: "The WB Committee has asked for clarification on the investigation report for case {{caseNo}}."
        });

        await seedTemplate({
            code: "IU_SLA_REMINDER",
            type: "IN_APP",
            name: "Investigation SLA Reminder",
            subject: "Reminder {{reminderNo}} — investigation report due for {{caseNo}} by {{dueDate}}",
            body:
                "This is reminder {{reminderNo}} of the 90-day investigation SLA for case {{caseNo}}. " +
                "The final report is due by {{dueDate}}."
        });

        await seedTemplate({
            code: "CASE_CLOSED_RESPONSE",
            type: "IN_APP",
            name: "Case Closed — Response to Whistle-blower",
            subject: "Complaint {{complaintNo}} — closure",
            body: "{{response}}"
        });

        // The Investigation Unit's relay through the committee.
        await seedTemplate({
            code: "DETAILS_REQUEST_PROPOSED",
            type: "IN_APP",
            name: "IU Requests Details via Committee",
            subject: "{{requestedByRole}} asked for further details on {{caseNo}}",
            body:
                "The {{requestedByRole}} has asked: \"{{question}}\". Review it on case {{caseNo}} and forward or " +
                "decline the request to the whistle-blower."
        });

        await seedTemplate({
            code: "DETAILS_REQUEST_FORWARDED",
            type: "IN_APP",
            name: "Details Request Forwarded",
            subject: "Your request on {{caseNo}} has been sent to the whistle-blower",
            body: "The WB Committee has put your request to the whistle-blower. A response is due by {{dueDate}}."
        });

        await seedTemplate({
            code: "DETAILS_REQUEST_DECLINED",
            type: "IN_APP",
            name: "Details Request Declined",
            subject: "Your request on {{caseNo}} was not forwarded",
            body: "The WB Committee decided not to put your request to the whistle-blower. See the case timeline."
        });

        // The complainant's answer, once the committee has reviewed it and
        // decided what the Investigation Unit may see of it.
        await seedTemplate({
            code: "DETAILS_SHARED_WITH_IU",
            type: "IN_APP",
            name: "Whistle-blower Response Shared",
            subject: "Additional details available on {{caseNo}}",
            body: "The WB Committee has reviewed the whistle-blower's response and shared it on case {{caseNo}}."
        });

        await seedDocumentCategory("CLARIFICATION_RESPONSE", "Clarification Response", 9);

        await seedMasterValues("CASE_TYPE", [
            { code: "CHANNEL_A", name: "Channel A" },
            { code: "CHANNEL_B", name: "Channel B" },
            { code: "REGULATOR", name: "Regulator" },
            { code: "MD_ESCALATION", name: "MD Escalation" },
            { code: "MANUAL", name: "Manual" }
        ]);

        await seedMasterValues("PRIORITY", [
            { code: "LOW", name: "Low" },
            { code: "MEDIUM", name: "Medium" },
            { code: "HIGH", name: "High" },
            { code: "CRITICAL", name: "Critical" }
        ]);

        await seedMasterValues("RISK_CATEGORY", [
            { code: "OPERATIONAL", name: "Operational" },
            { code: "FRAUD", name: "Fraud" },
            { code: "COMPLIANCE", name: "Compliance" },
            { code: "CONDUCT", name: "Conduct" },
            { code: "GOVERNANCE", name: "Governance" }
        ]);

        await seedMasterValues("COMPLAINT_CLASSIFICATION", [
            { code: "FINANCIAL", name: "Financial" },
            { code: "NON_FINANCIAL", name: "Non-Financial" },
            { code: "HR_CONDUCT", name: "HR / Conduct" },
            { code: "OPERATIONAL", name: "Operational" },
            { code: "REGULATORY", name: "Regulatory" },
            { code: "OTHER", name: "Other" }
        ]);

        // --- Workflow stages -------------------------------------------------
        // Listed in procedure order: the order here is the order the staff UI
        // shows them in.
        await seedOrderedMasterValues("COMPLAINT_STATUS", [
            { code: "RECEIVED", name: "Received" },
            { code: "UNDER_REVIEW", name: "Acknowledged / Under Review" },
            { code: "INFO_REQUESTED", name: "Additional Details Requested" },
            { code: "ACCEPTED", name: "Accepted" },
            { code: "CONVERTED_TO_CASE", name: "Forwarded to Investigation Unit" },
            { code: "REJECTED", name: "Rejected" },
            { code: "CLOSED", name: "Closed" }
        ]);

        await seedOrderedMasterValues("CASE_STATUS", [
            { code: "OPEN", name: "Open" },
            { code: "ASSIGNED", name: "Assigned to Investigation Unit" },
            { code: "UNDER_INVESTIGATION", name: "Under Investigation" },
            { code: "INFO_REQUESTED", name: "Awaiting Details from Whistle-blower" },
            { code: "IVR_SUBMITTED", name: "Investigation Report Submitted" },
            { code: "IVR_CLARIFICATION", name: "Clarification Sought from Investigation Unit" },
            { code: "WBC_REVIEW", name: "Before the WB Committee" },
            { code: "DAC_REVIEW", name: "DAC Proceedings" },
            { code: "IMPLEMENTATION", name: "Implementing Recommendations" },
            { code: "CETO_APPROVAL", name: "CEtO Approval" },
            { code: "CLOSED", name: "Closed" }
        ]);

        // "Recommended by WB Committee? (DAC/Other)"
        await seedMasterValues("RECOMMENDATION_TYPE", [
            { code: "DAC", name: "Refer to Disciplinary Action Committee" },
            { code: "OTHER_ACTION", name: "Other Proceedings / Corrective Action" },
            { code: "IMPLEMENT", name: "Implement Committee Recommendations" },
            { code: "NO_ACTION", name: "No Further Action" }
        ]);

        await seedMasterValues("REPORT_STATUS", [
            { code: "SUBMITTED", name: "Submitted" },
            { code: "CLARIFICATION_SOUGHT", name: "Clarification Sought" },
            { code: "ACCEPTED", name: "Accepted" }
        ]);

        await seedMasterValues("INVESTIGATION_STATUS", [
            { code: "IN_PROGRESS", name: "In Progress" },
            { code: "COMPLETED", name: "Completed" }
        ]);

        await seedMasterValues("DAC_STATUS", [
            { code: "INITIATED", name: "Initiated" },
            { code: "IN_PROGRESS", name: "In Progress" },
            { code: "CONCLUDED", name: "Concluded" }
        ]);

        await seedMasterValues("DAC_OUTCOME", [
            { code: "DISCIPLINARY_ACTION", name: "Disciplinary Action" },
            { code: "WARNING", name: "Warning / Counselling" },
            { code: "RECOVERY", name: "Recovery / Restitution" },
            { code: "TERMINATION", name: "Termination" },
            { code: "NO_ACTION", name: "No Action" }
        ]);

        // --- Turnaround times -------------------------------------------------
        // The numbers the procedure fixes. utils/sla.js is what the code reads;
        // these rows make them visible (and later editable) as configuration.
        await seedSla({
            code: "ACKNOWLEDGEMENT",
            name: "Acknowledgement to complainant by WB Committee",
            days: SLA.ACK_DAYS,
            startEvent: "COMPLAINT_REGISTERED"
        });

        await seedSla({
            code: "FORWARD_TO_IU",
            name: "Forward complaint to Investigation Unit",
            days: SLA.FORWARD_TO_IU_DAYS,
            startEvent: "COMPLAINT_REGISTERED"
        });

        await seedSla({
            code: "WB_ADDITIONAL_DETAILS",
            name: "Whistle-blower to provide additional details",
            days: SLA.WB_RESPONSE_DAYS,
            startEvent: "DETAILS_REQUESTED"
        });

        console.log("Seed complete.");
        process.exit(0);
    } catch (error) {
        console.error("Seed failed:", error);
        process.exit(1);
    }
})();
