// End-to-end walk through the whistle-blower complaint-handling procedure,
// driven entirely through the HTTP API as the three logged-in user types.
//
// Run against a live server:  node scripts/workflow_smoke.js
//
// Covers the happy path (acknowledge -> forward -> IVR -> clarification ->
// resubmit -> committee -> decision -> closure) plus the four added rules:
// Admin transfer, the 6-day/3-reminder/auto-close details request, and the
// identity firewall around the Investigation Unit.
require("dotenv").config({ quiet: true });

const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const db = require("../src/config/db");

let failures = 0;
let checks = 0;

const check = (label, condition, detail = "") => {
    checks += 1;

    if (condition) {
        console.log(`  ok   ${label}`);
    } else {
        failures += 1;
        console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    }
};

const call = async (path, { method = "GET", token, body, form } = {}) => {
    const headers = {};

    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: form || (body ? JSON.stringify(body) : undefined)
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    return { status: response.status, data };
};

const login = async (username, password) => {
    const { status, data } = await call("/api/auth/login", { method: "POST", body: { username, password } });

    if (status !== 200) {
        throw new Error(`login failed for ${username}: ${data?.message || status}`);
    }

    return data.token;
};

const masterValueId = async (masterCode, valueCode) => {
    const [rows] = await db.query(
        `SELECT mv.master_value_id AS id FROM master_values mv
         JOIN master_types mt ON mt.master_type_id = mv.master_type_id
         WHERE mt.master_code = ? AND mv.value_code = ?`,
        [masterCode, valueCode]
    );

    return rows[0]?.id;
};

const userId = async (username) => {
    const [rows] = await db.query("SELECT user_id AS id FROM users WHERE username = ?", [username]);
    return rows[0]?.id;
};

(async () => {
    console.log(`Running workflow smoke test against ${BASE}\n`);

    const admin = await login("admin", "Admin@123");
    const wbc1 = await login("wbc.member1", "Wbc@123");
    const wbc2 = await login("wbc.member2", "Wbc@123");
    const iu = await login("iu.officer", "Iu@12345");
    const iuHead = await login("iu.head", "Iu@12345");

    const ids = {
        channel: await masterValueId("CHANNEL", "PORTAL"),
        nature: await masterValueId("COMPLAINT_NATURE", "FRAUD"),
        severity: await masterValueId("SEVERITY", "HIGH"),
        anonNamed: await masterValueId("ANONYMITY_TYPE", "NAMED"),
        anonymous: await masterValueId("ANONYMITY_TYPE", "ANONYMOUS"),
        complainantType: await masterValueId("COMPLAINANT_TYPE", "EMPLOYEE")
    };

    // ---------------------------------------------------------------- intake
    console.log("1. Whistle-blower reports the issue through the portal");

    const submitForm = new FormData();
    submitForm.append("dateOfReceipt", new Date().toISOString().slice(0, 10));
    submitForm.append("channelId", String(ids.channel));
    submitForm.append("natureId", String(ids.nature));
    submitForm.append("severityId", String(ids.severity));
    submitForm.append("anonymityTypeId", String(ids.anonNamed));
    submitForm.append("complainantTypeId", String(ids.complainantType));
    submitForm.append("description", "Smoke test: suspected invoice fraud in the regional office.");
    submitForm.append("declaration", "true");
    submitForm.append("wantsPostbox", "true");
    submitForm.append(
        "complainant",
        JSON.stringify({ employeeName: "Test Whistleblower", email: "wb@example.test", mobileNumber: "9999999999" })
    );

    const submitted = await call("/api/public/complaints", { method: "POST", form: submitForm });
    check("complaint submitted", submitted.status === 201, JSON.stringify(submitted.data));

    const complaintNo = submitted.data.complaintId;
    const postboxPassword = submitted.data.password;

    const [complaintRows] = await db.query("SELECT complaint_id FROM complaints WHERE complaint_no = ?", [complaintNo]);
    const complaintId = complaintRows[0].complaint_id;

    // ------------------------------------------------------- acknowledgement
    console.log("\n2. Acknowledgement by the WB Committee (4-day SLA)");

    const ack = await call(`/api/complaints/${complaintId}/acknowledge`, { method: "PATCH", token: wbc1 });
    check("acknowledged", ack.status === 200, JSON.stringify(ack.data));
    check("4-day acknowledgement SLA reported", ack.data?.sla?.targetDays === 4);
    check("acknowledged within SLA", ack.data?.sla?.breached === false);

    const afterAck = await call(`/api/complaints/${complaintId}`, { token: wbc1 });
    check("stage is Under Review", afterAck.data.complaint.statusCode === "UNDER_REVIEW");
    check("WB Committee owner claimed on acknowledgement", !!afterAck.data.complaint.wbc_owner_id);

    // ------------------------------------------- Admin transfer (extra rule 1)
    console.log("\n3. Admin transfers the case to another WB Committee member");

    const transfer = await call(`/api/complaints/${complaintId}/transfer`, {
        method: "PATCH",
        token: admin,
        body: { wbcOwnerId: await userId("wbc.member2"), remarks: "Rebalancing committee workload" }
    });
    check("admin can transfer", transfer.status === 200, JSON.stringify(transfer.data));

    const notCommittee = await call(`/api/complaints/${complaintId}/transfer`, {
        method: "PATCH",
        token: admin,
        body: { wbcOwnerId: await userId("iu.officer") }
    });
    check("transfer to a non-committee user is rejected", notCommittee.status === 400);

    // wbc2 now owns it, so this tests the role guard rather than visibility.
    const wbcTransfer = await call(`/api/complaints/${complaintId}/transfer`, {
        method: "PATCH",
        token: wbc2,
        body: { wbcOwnerId: await userId("wbc.member1") }
    });
    check("a committee member cannot transfer, even their own file", wbcTransfer.status === 403);

    // And the member it moved away from can no longer see it at all.
    const formerOwnerRead = await call(`/api/complaints/${complaintId}`, { token: wbc1 });
    check("the previous owner loses sight of the complaint", formerOwnerRead.status === 404);

    // ------------------- additional details before forwarding (extra rule 2a)
    console.log("\n4. Information insufficient — committee writes to the whistle-blower");

    const request1 = await call(`/api/complaints/${complaintId}/request-details`, {
        method: "POST",
        token: wbc2,
        body: { question: "Please share the invoice numbers and the vendor name." }
    });
    check("details requested", request1.status === 201, JSON.stringify(request1.data));

    const duplicate = await call(`/api/complaints/${complaintId}/request-details`, {
        method: "POST",
        token: wbc2,
        body: { question: "Second open request" }
    });
    check("only one open request at a time", duplicate.status === 409);

    const parked = await call(`/api/complaints/${complaintId}`, { token: wbc2 });
    check("complaint parked at Additional Details Requested", parked.data.complaint.statusCode === "INFO_REQUESTED");
    check("6-day response window", parked.data.sla.whistleblowerResponse?.targetDays === 6);
    check("3 reminders planned", parked.data.sla.whistleblowerResponse?.totalReminders === 3);

    // The whistle-blower answers through the post box.
    const respondForm = new FormData();
    respondForm.append("complaintId", complaintNo);
    respondForm.append("password", postboxPassword);
    respondForm.append("clarificationId", String(request1.data.clarificationId));
    respondForm.append("responseText", "Invoices INV-4471 and INV-4489, vendor Acme Supplies.");

    const responded = await call("/api/public/complaints/respond", { method: "POST", form: respondForm });
    check("whistle-blower responds via the post box", responded.status === 200, JSON.stringify(responded.data));

    const resumed = await call(`/api/complaints/${complaintId}`, { token: wbc2 });
    check("complaint returns to Under Review", resumed.data.complaint.statusCode === "UNDER_REVIEW");

    // ------------------------------------------------------- forward to the IU
    console.log("\n5. Forward to the Investigation Unit (5-day SLA)");

    const badOfficer = await call(`/api/complaints/${complaintId}/forward-to-iu`, {
        method: "POST",
        token: wbc2,
        body: { investigationOfficerId: await userId("wbc.member1") }
    });
    check("cannot forward to a non-IU user", badOfficer.status === 400);

    const forward = await call(`/api/complaints/${complaintId}/forward-to-iu`, {
        method: "POST",
        token: wbc2,
        body: { investigationOfficerId: await userId("iu.officer"), remarks: "Please investigate." }
    });
    check("forwarded to the IU", forward.status === 201, JSON.stringify(forward.data));
    check("5-day forwarding SLA reported", forward.data?.sla?.targetDays === 5);

    const caseId = forward.data.caseId;

    // ------------------------------------- identity firewall (extra rule 3)
    console.log("\n6. Identity firewall around the Investigation Unit");

    const iuCase = await call(`/api/cases/${caseId}`, { token: iu });
    check("IU can open its own case", iuCase.status === 200);
    check("IU cannot see the complainant name", iuCase.data.complainant?.employeeName !== "Test Whistleblower");
    check("identity marked withheld for the IU", iuCase.data.complainant?.identityWithheld === true);
    check("IU has no identity permission", iuCase.data.permissions?.canViewIdentity === false);

    const wbcCase = await call(`/api/cases/${caseId}`, { token: wbc2 });
    check("committee can see the complainant name", wbcCase.data.complainant?.employeeName === "Test Whistleblower");

    const iuComplaintQueue = await call("/api/complaints", { token: iu });
    check("IU is shut out of the complaint queue", iuComplaintQueue.status === 403);

    const iuComplaint = await call(`/api/complaints/${complaintId}`, { token: iu });
    check("IU cannot read the complaint record directly", iuComplaint.status === 403);

    // ---------------------------------------------------- IVR submission loop
    console.log("\n7. Submission of the IVR by the Investigation Unit");

    const wbcSubmit = await call(`/api/cases/${caseId}/investigation/reports`, {
        method: "POST",
        token: wbc2,
        body: { findings: "x", conclusion: "y" }
    });
    check("committee cannot submit the IVR", wbcSubmit.status === 403);

    const ivr1 = await call(`/api/cases/${caseId}/investigation/reports`, {
        method: "POST",
        token: iu,
        body: {
            findings: "Two invoices were raised against a vendor with no purchase order.",
            rootCause: "Purchase-order control not enforced at the regional office.",
            evidenceSummary: "Invoice copies, approval emails, vendor master extract.",
            recommendation: "Recover the amount and enforce the PO control.",
            conclusion: "Allegation substantiated in part."
        }
    });
    check("IVR submitted", ivr1.status === 201, JSON.stringify(ivr1.data));
    check("first version is v1", ivr1.data.versionNo === 1);

    console.log("\n8. Committee seeks clarification, IU resubmits");

    const clarify = await call(`/api/cases/${caseId}/investigation/clarifications`, {
        method: "POST",
        token: wbc2,
        body: { details: "Quantify the financial impact and confirm whether the vendor is related to any employee." }
    });
    check("clarification sought", clarify.status === 201, JSON.stringify(clarify.data));

    const afterClarify = await call(`/api/cases/${caseId}`, { token: iu });
    check("case is back with the IU", afterClarify.data.case.statusCode === "IVR_CLARIFICATION");
    check("IU is offered the resubmit action", afterClarify.data.workflow.availableActions.includes("SUBMIT_IVR"));

    const ivr2 = await call(`/api/cases/${caseId}/investigation/reports`, {
        method: "POST",
        token: iu,
        body: {
            findings: "Two invoices, total 4.7 lakh, no purchase order.",
            conclusion: "Allegation substantiated in part.",
            clarificationResponse: "Impact is 4.7 lakh. No relationship found between the vendor and any employee."
        }
    });
    check("IVR resubmitted as v2", ivr2.status === 201 && ivr2.data.versionNo === 2, JSON.stringify(ivr2.data));

    // ------------------------------------------------- before the committee
    console.log("\n9. Report and observations placed before the WB Committee");

    const meeting = await call(`/api/cases/${caseId}/wbc/meetings`, {
        method: "POST",
        token: wbc2,
        body: {
            agenda: "Consideration of the investigation report",
            memberIds: [await userId("wbc.member1"), await userId("wbc.owner")],
            observations: "Control failure confirmed."
        }
    });
    check("meeting recorded", meeting.status === 201, JSON.stringify(meeting.data));

    const atCommittee = await call(`/api/cases/${caseId}`, { token: wbc2 });
    check("case is before the committee", atCommittee.data.case.statusCode === "WBC_REVIEW");
    check("decision action offered", atCommittee.data.workflow.availableActions.includes("WBC_DECISION"));

    // ------------------- details request after the case reached the IU (2b)
    console.log("\n10. Committee writes to the whistle-blower again, post-assignment");

    const request2 = await call(`/api/cases/${caseId}/request-details`, {
        method: "POST",
        token: wbc2,
        body: { question: "Do you have the approval emails for these invoices?" }
    });
    check("details requested from the case screen", request2.status === 201, JSON.stringify(request2.data));

    const caseParked = await call(`/api/cases/${caseId}`, { token: wbc2 });
    check("case parked awaiting the whistle-blower", caseParked.data.case.statusCode === "INFO_REQUESTED");

    // Force the clock forward to prove the reminders and the auto-close.
    console.log("\n11. Reminder schedule and auto-closure on silence");

    const clarificationId = request2.data.clarificationId;

    const sweepAt = async (daysAgo) => {
        await db.query(
            `UPDATE complaint_clarifications
             SET raised_at = DATE_SUB(NOW(), INTERVAL ? DAY),
                 response_due_date = DATE_ADD(DATE(DATE_SUB(NOW(), INTERVAL ? DAY)), INTERVAL 6 DAY)
             WHERE clarification_id = ?`,
            [daysAgo, daysAgo, clarificationId]
        );

        return call("/api/admin/sla/run", { method: "POST", token: admin });
    };

    const day1 = await sweepAt(1);
    check("no reminder on day 1", day1.data.remindersSent.length === 0);

    const day2 = await sweepAt(2);
    check("reminder 1 on day 2", day2.data.remindersSent[0]?.reminderNo === 1, JSON.stringify(day2.data));

    const day3 = await sweepAt(3);
    check("no second reminder on day 3", day3.data.remindersSent.length === 0);

    const day4 = await sweepAt(4);
    check("reminder 2 on day 4", day4.data.remindersSent[0]?.reminderNo === 2);

    const day6 = await sweepAt(6);
    check("reminder 3 on day 6", day6.data.remindersSent[0]?.reminderNo === 3);
    check("not yet closed on day 6", day6.data.expired.length === 0);

    const day7 = await sweepAt(7);
    check("closed once the 6-day window has passed", day7.data.expired.length === 1, JSON.stringify(day7.data));

    const closed = await call(`/api/cases/${caseId}`, { token: wbc2 });
    check("case closed", closed.data.case.statusCode === "CLOSED");

    const closedComplaint = await call(`/api/complaints/${complaintId}`, { token: wbc2 });
    check("complaint closed with it", closedComplaint.data.complaint.statusCode === "CLOSED");
    check(
        "closure attributed to the WB Committee",
        closedComplaint.data.history.some((h) => h.action_code === "CLOSED_NO_RESPONSE")
    );

    const [reminderRows] = await db.query(
        `SELECT COUNT(*) AS c FROM notification_history nh
         JOIN notification_templates nt ON nt.template_id = nh.template_id
         WHERE nh.complaint_id = ? AND nt.template_code = 'CLARIFICATION_REMINDER'`,
        [complaintId]
    );
    check("exactly 3 reminders were sent", Number(reminderRows[0].c) === 3, `sent ${reminderRows[0].c}`);

    const reSweep = await call("/api/admin/sla/run", { method: "POST", token: admin });
    check("sweep is idempotent once closed", reSweep.data.expired.length === 0);

    // The first scenario ends in auto-closure, so it never reaches the
    // committee's decision. Scenario B walks an anonymous complaint all the way
    // down the "Recommended by WB Committee? (DAC/Other)" branch to closure.
    console.log("\n--- Scenario B: anonymous complaint through DAC to closure ---");

    console.log("\n12. Anonymous complaint forwarded to the IU");

    const anonForm = new FormData();
    anonForm.append("dateOfReceipt", new Date().toISOString().slice(0, 10));
    anonForm.append("channelId", String(ids.channel));
    anonForm.append("natureId", String(ids.nature));
    anonForm.append("severityId", String(ids.severity));
    anonForm.append("anonymityTypeId", String(ids.anonymous));
    anonForm.append("description", "Smoke test B: anonymous report of expense manipulation.");
    anonForm.append("declaration", "true");
    anonForm.append("wantsPostbox", "true");

    const anonSubmit = await call("/api/public/complaints", { method: "POST", form: anonForm });
    check("anonymous complaint submitted", anonSubmit.status === 201, JSON.stringify(anonSubmit.data));

    const [anonRows] = await db.query("SELECT complaint_id FROM complaints WHERE complaint_no = ?", [
        anonSubmit.data.complaintId
    ]);
    const complaintB = anonRows[0].complaint_id;

    await call(`/api/complaints/${complaintB}/acknowledge`, {
        method: "PATCH",
        token: wbc1,
        body: { remarks: "Acknowledged." }
    });

    const forwardB = await call(`/api/complaints/${complaintB}/forward-to-iu`, {
        method: "POST",
        token: wbc1,
        body: { investigationOfficerId: await userId("iu.officer") }
    });
    check("scenario B forwarded", forwardB.status === 201, JSON.stringify(forwardB.data));

    const caseB = forwardB.data.caseId;

    const anonToIu = await call(`/api/cases/${caseB}`, { token: iu });
    check("anonymous complainant stays anonymous to the IU", anonToIu.data.complainant?.isAnonymous === true);
    check("no name is exposed for an anonymous complaint", !anonToIu.data.complainant?.employeeName);

    console.log("\n13. Out-of-order actions are refused");

    const earlyDecision = await call(`/api/cases/${caseB}/wbc/decisions`, {
        method: "POST",
        token: wbc1,
        body: { recommendation: "DAC", actionTaken: "Too early" }
    });
    check("cannot decide before the report is tabled", earlyDecision.status === 409, JSON.stringify(earlyDecision.data));

    const earlyClose = await call(`/api/cases/${caseB}/wbc/meetings`, { method: "POST", token: wbc1, body: {} });
    check("cannot table a meeting with no report", earlyClose.status === 409);

    console.log("\n14. IVR, committee decision to refer to DAC");

    await call(`/api/cases/${caseB}/investigation/reports`, {
        method: "POST",
        token: iu,
        body: { findings: "Expense claims inflated over six months.", conclusion: "Allegation substantiated." }
    });

    await call(`/api/cases/${caseB}/wbc/meetings`, {
        method: "POST",
        token: wbc1,
        body: { agenda: "Consideration of the investigation report", memberIds: [await userId("wbc.member2")] }
    });

    const decision = await call(`/api/cases/${caseB}/wbc/decisions`, {
        method: "POST",
        token: wbc1,
        body: {
            recommendation: "DAC",
            actionTaken: "Refer to the Disciplinary Action Committee.",
            chairpersonId: await userId("wbc.owner")
        }
    });
    check("committee decision recorded", decision.status === 201, JSON.stringify(decision.data));
    check("DAC proceedings opened", decision.data.nextStage === "DAC_REVIEW");
    check("DAC reference issued", !!decision.data.dacReferenceNo);

    console.log("\n15. DAC outcome, implementation and closure");

    const dacOutcome = await call(`/api/cases/${caseB}/dac/outcome`, {
        method: "POST",
        token: wbc1,
        body: { outcome: "DISCIPLINARY_ACTION", decisionSummary: "Written warning and recovery of the amount." }
    });
    check("DAC outcome recorded", dacOutcome.status === 201, JSON.stringify(dacOutcome.data));
    check("case moves to implementation", dacOutcome.data.nextStage === "IMPLEMENTATION");

    const implement = await call(`/api/cases/${caseB}/implementation`, {
        method: "POST",
        token: wbc1,
        body: { notes: "Warning issued and recovery initiated through payroll." }
    });
    check("implementation recorded", implement.status === 201, JSON.stringify(implement.data));

    const closeNoResponse = await call(`/api/cases/${caseB}/close`, {
        method: "POST",
        token: wbc1,
        body: { closureReason: "Action completed" }
    });
    check("closure requires a response to the whistle-blower", closeNoResponse.status === 400);

    const closeB = await call(`/api/cases/${caseB}/close`, {
        method: "POST",
        token: wbc1,
        body: {
            closureReason: "Allegation substantiated; disciplinary action completed.",
            responseToWhistleblower:
                "Your complaint was investigated, the allegation was substantiated and disciplinary action has been taken. The matter is now closed."
        }
    });
    check("case closed with a response to the whistle-blower", closeB.status === 200, JSON.stringify(closeB.data));

    const closedB = await call(`/api/cases/${caseB}`, { token: wbc1 });
    check("scenario B case is closed", closedB.data.case.statusCode === "CLOSED");
    check("no actions remain on a closed case", closedB.data.workflow.availableActions.length === 0);

    const [closureRows] = await db.query(
        "SELECT closure_communication_sent, closure_reason FROM case_closures WHERE case_id = ?",
        [caseB]
    );
    check("closure record written", !!closureRows[0]);
    check("response marked as sent", closureRows[0]?.closure_communication_sent === 1);

    const trackB = await call("/api/public/complaints/track", {
        method: "POST",
        body: { complaintId: anonSubmit.data.complaintId, password: anonSubmit.data.password }
    });
    // The post box speaks only the five predefined statuses (requirement 3) —
    // "Case Closed", not the raw master-value name or an internal action code.
    check(
        "whistle-blower sees the closed status in the post box",
        trackB.data.status === "Case Closed",
        JSON.stringify(trackB.data?.status)
    );
    check(
        "post box timeline uses the allowed status labels, not action codes",
        trackB.data.history.some((h) => h.status === "Case Closed"),
        JSON.stringify(trackB.data.history)
    );

    console.log("\n16. Committee decision that skips DAC");

    const anonFormC = new FormData();
    anonFormC.append("dateOfReceipt", new Date().toISOString().slice(0, 10));
    anonFormC.append("channelId", String(ids.channel));
    anonFormC.append("natureId", String(ids.nature));
    anonFormC.append("severityId", String(ids.severity));
    anonFormC.append("anonymityTypeId", String(ids.anonymous));
    anonFormC.append("description", "Smoke test C: process lapse, no disciplinary angle.");
    anonFormC.append("declaration", "true");

    const submitC = await call("/api/public/complaints", { method: "POST", form: anonFormC });
    const [rowsC] = await db.query("SELECT complaint_id FROM complaints WHERE complaint_no = ?", [
        submitC.data.complaintId
    ]);
    const complaintC = rowsC[0].complaint_id;

    await call(`/api/complaints/${complaintC}/acknowledge`, { method: "PATCH", token: wbc1, body: {} });

    const forwardC = await call(`/api/complaints/${complaintC}/forward-to-iu`, {
        method: "POST",
        token: wbc1,
        body: { investigationOfficerId: await userId("iu.head") }
    });

    const caseC = forwardC.data.caseId;

    // Forwarded to iu.head above, so iu.head is the one who can file on it —
    // iu.officer cannot see this case at all.
    const wrongOfficerFiling = await call(`/api/cases/${caseC}/investigation/reports`, {
        method: "POST",
        token: iu,
        body: { findings: "x", conclusion: "y" }
    });
    check("an investigator cannot file on someone else's case", wrongOfficerFiling.status === 404);

    await call(`/api/cases/${caseC}/investigation/reports`, {
        method: "POST",
        token: iuHead,
        body: { findings: "Process lapse, no mala fide intent.", conclusion: "Allegation not substantiated." }
    });

    await call(`/api/cases/${caseC}/wbc/meetings`, { method: "POST", token: wbc1, body: {} });

    const decisionC = await call(`/api/cases/${caseC}/wbc/decisions`, {
        method: "POST",
        token: wbc1,
        body: { recommendation: "IMPLEMENT", actionTaken: "Tighten the maker-checker control; no disciplinary action." }
    });
    check("non-DAC decision goes straight to implementation", decisionC.data.nextStage === "IMPLEMENTATION");

    const [dacCountC] = await db.query("SELECT COUNT(*) AS c FROM dac_cases WHERE case_id = ?", [caseC]);
    check("no DAC case opened on the non-DAC branch", Number(dacCountC[0].c) === 0);

    const closeC = await call(`/api/cases/${caseC}/close`, {
        method: "POST",
        token: wbc1,
        body: {
            closureReason: "Process lapse addressed.",
            responseToWhistleblower: "Your complaint was investigated and the underlying control has been strengthened."
        }
    });
    check("non-DAC branch closes", closeC.status === 200, JSON.stringify(closeC.data));

    // --- Ownership scoping ---------------------------------------------------
    console.log("\n--- Scenario D: ownership, documents and the IU relay ---");

    console.log("\n17. A complaint belongs to whoever acknowledged it");

    const formD = new FormData();
    formD.append("dateOfReceipt", new Date().toISOString().slice(0, 10));
    formD.append("channelId", String(ids.channel));
    formD.append("natureId", String(ids.nature));
    formD.append("severityId", String(ids.severity));
    formD.append("anonymityTypeId", String(ids.anonNamed));
    formD.append("complainantTypeId", String(ids.complainantType));
    formD.append("description", "Smoke test D: ownership and document handling.");
    formD.append("declaration", "true");
    formD.append("wantsPostbox", "true");
    formD.append("complainant", JSON.stringify({ employeeName: "Dana Scoped", email: "dana@example.test" }));

    const submitD = await call("/api/public/complaints", { method: "POST", form: formD });
    const [rowsD] = await db.query("SELECT complaint_id FROM complaints WHERE complaint_no = ?", [
        submitD.data.complaintId
    ]);
    const complaintD = rowsD[0].complaint_id;

    const unclaimedToWbc1 = await call(`/api/complaints/${complaintD}`, { token: wbc1 });
    const unclaimedToWbc2 = await call(`/api/complaints/${complaintD}`, { token: wbc2 });
    check("an unclaimed complaint is visible to every committee member", unclaimedToWbc1.status === 200);
    check("...and to the other member too", unclaimedToWbc2.status === 200);

    await call(`/api/complaints/${complaintD}/acknowledge`, { method: "PATCH", token: wbc1, body: {} });

    const claimedToWbc2 = await call(`/api/complaints/${complaintD}`, { token: wbc2 });
    check("once acknowledged it is invisible to other members", claimedToWbc2.status === 404);
    check(
        "acknowledging member keeps it",
        (await call(`/api/complaints/${complaintD}`, { token: wbc1 })).status === 200
    );
    check("Admin sees it regardless", (await call(`/api/complaints/${complaintD}`, { token: admin })).status === 200);

    const wbc2Queue = await call("/api/complaints?queue=1", { token: wbc2 });
    check(
        "it is absent from the other member's queue",
        !wbc2Queue.data.data.some((r) => r.id === complaintD),
        JSON.stringify(wbc2Queue.data.data.map((r) => r.id))
    );

    const adminQueue = await call("/api/complaints?queue=1", { token: admin });
    check("Admin's queue is the full list", adminQueue.data.total >= wbc2Queue.data.total);

    console.log("\n18. Forwarding scopes the case to the assigned officer");

    const forwardD = await call(`/api/complaints/${complaintD}/forward-to-iu`, {
        method: "POST",
        token: wbc1,
        body: { investigationOfficerId: await userId("iu.officer") }
    });
    const caseD = forwardD.data.caseId;
    check("forwarded", forwardD.status === 201, JSON.stringify(forwardD.data));

    check("assigned officer can see the case", (await call(`/api/cases/${caseD}`, { token: iu })).status === 200);
    check(
        "another investigator cannot",
        (await call(`/api/cases/${caseD}`, { token: iuHead })).status === 404
    );
    check(
        "a non-owning committee member cannot",
        (await call(`/api/cases/${caseD}`, { token: wbc2 })).status === 404
    );
    check("the owning committee member can", (await call(`/api/cases/${caseD}`, { token: wbc1 })).status === 200);

    console.log("\n19. IVR submitted with supporting documents");

    const reportForm = new FormData();
    reportForm.append("findings", "Duplicate vendor bank details across three payments.");
    reportForm.append("conclusion", "Allegation substantiated.");
    reportForm.append("recommendation", "Recover and tighten vendor master controls.");
    reportForm.append(
        "files",
        new Blob(["invoice ledger extract\n"], { type: "text/plain" }),
        "ledger-extract.txt"
    );
    reportForm.append("files", new Blob(["approval email chain\n"], { type: "text/plain" }), "approvals.txt");

    const ivrD = await call(`/api/cases/${caseD}/investigation/reports`, {
        method: "POST",
        token: iu,
        form: reportForm
    });
    check("report submitted with attachments", ivrD.status === 201, JSON.stringify(ivrD.data));
    check("both documents attached", ivrD.data.attachments?.length === 2);

    const invD = await call(`/api/cases/${caseD}/investigation`, { token: wbc1 });
    check("documents are grouped onto the report version", invD.data.reports[0].documents.length === 2);

    console.log("\n20. Document downloads follow the file");

    const docId = ivrD.data.attachments[0].documentId;

    const dl = async (token) => {
        const r = await fetch(`${BASE}/api/documents/${docId}/download`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return { status: r.status, body: r.status === 200 ? await r.text() : null };
    };

    const iuDownload = await dl(iu);
    check("the investigating officer can download", iuDownload.status === 200, `status ${iuDownload.status}`);
    check("the file content comes back", iuDownload.body?.includes("invoice ledger extract"));

    const wbcDownload = await dl(wbc1);
    check("the owning committee member can download", wbcDownload.status === 200);
    check("Admin can download", (await dl(admin)).status === 200);
    check("an unrelated investigator cannot", (await dl(iuHead)).status === 404);
    check("a non-owning committee member cannot", (await dl(wbc2)).status === 404);

    const missing = await fetch(`${BASE}/api/documents/99999999/download`, {
        headers: { Authorization: `Bearer ${admin}` }
    });
    check("unknown document ids 404 rather than erroring", missing.status === 404);

    console.log("\n21. IU asks the committee to obtain more details");

    const directByIu = await call(`/api/cases/${caseD}/request-details`, {
        method: "POST",
        token: iu,
        body: { question: "Trying to bypass the committee" }
    });
    check("the IU cannot write to the whistle-blower directly", directByIu.status === 403);

    const proposal = await call(`/api/cases/${caseD}/investigation/detail-requests`, {
        method: "POST",
        token: iu,
        body: { question: "Can the complainant confirm which branch raised the payments?" }
    });
    check("the IU can propose a request", proposal.status === 201, JSON.stringify(proposal.data));

    const withProposal = await call(`/api/cases/${caseD}`, { token: wbc1 });
    check(
        "the committee is offered the review action",
        withProposal.data.workflow.availableActions.includes("REVIEW_DETAILS_PROPOSAL")
    );
    check(
        "nothing has gone to the whistle-blower yet",
        withProposal.data.case.statusCode !== "INFO_REQUESTED",
        withProposal.data.case.statusCode
    );

    const trackBeforeForward = await call("/api/public/complaints/track", {
        method: "POST",
        body: { complaintId: submitD.data.complaintId, password: submitD.data.password }
    });
    check("the complainant sees no request while it is only proposed", !trackBeforeForward.data.informationRequired);

    const declineThenRepropose = await call(
        `/api/cases/${caseD}/detail-requests/${proposal.data.clarificationId}`,
        { method: "PATCH", token: wbc1, body: { approve: false, remarks: "Already covered in the file." } }
    );
    check("the committee can decline", declineThenRepropose.status === 200, JSON.stringify(declineThenRepropose.data));

    const proposal2 = await call(`/api/cases/${caseD}/investigation/detail-requests`, {
        method: "POST",
        token: iu,
        body: { question: "Which branch raised these payments?" }
    });
    check("the IU can propose again after a decline", proposal2.status === 201);

    const forwarded = await call(`/api/cases/${caseD}/detail-requests/${proposal2.data.clarificationId}`, {
        method: "PATCH",
        token: wbc1,
        body: { approve: true, question: "Please confirm which branch raised these payments." }
    });
    check("the committee can forward it", forwarded.status === 200, JSON.stringify(forwarded.data));
    check("a 6-day clock starts on forwarding", !!forwarded.data.dueDate);

    const afterForward = await call(`/api/cases/${caseD}`, { token: wbc1 });
    check("the case now awaits the whistle-blower", afterForward.data.case.statusCode === "INFO_REQUESTED");

    const trackAfterForward = await call("/api/public/complaints/track", {
        method: "POST",
        body: { complaintId: submitD.data.complaintId, password: submitD.data.password }
    });
    check("the complainant sees the forwarded question", !!trackAfterForward.data.informationRequired);
    check(
        "reworded by the committee, not the IU's draft",
        trackAfterForward.data.informationRequired.question === "Please confirm which branch raised these payments."
    );

    console.log("\n22. Admin reassignment when someone is unavailable");

    const wbcReassign = await call(`/api/cases/${caseD}/transfer`, {
        method: "PATCH",
        token: wbc1,
        body: { investigationOfficerId: await userId("iu.head") }
    });
    check("a committee member cannot reassign", wbcReassign.status === 403);

    const wbcAssign = await call(`/api/cases/${caseD}/assign`, {
        method: "PATCH",
        token: wbc1,
        body: { investigationOfficerId: await userId("iu.head"), escalationOwnerId: await userId("wbc.owner") }
    });
    check("the old assign route is Admin-only too", wbcAssign.status === 403);

    const stageBefore = afterForward.data.case.statusCode;

    const adminReassign = await call(`/api/cases/${caseD}/transfer`, {
        method: "PATCH",
        token: admin,
        body: {
            wbcOwnerId: await userId("wbc.member2"),
            investigationOfficerId: await userId("iu.head"),
            remarks: "Both original holders are on leave"
        }
    });
    check("Admin can move both sides at once", adminReassign.status === 200, JSON.stringify(adminReassign.data));

    const afterReassign = await call(`/api/cases/${caseD}`, { token: admin });
    check("the case resumes from the same stage", afterReassign.data.case.statusCode === stageBefore);
    check("the new committee owner is recorded", afterReassign.data.case.wbcOwnerName === "Rohan Deshpande");
    check("the new investigator is recorded", afterReassign.data.case.investigationOfficerName === "Farida Sheikh");

    check("the new officer can now see it", (await call(`/api/cases/${caseD}`, { token: iuHead })).status === 200);
    check("the previous officer cannot", (await call(`/api/cases/${caseD}`, { token: iu })).status === 404);
    check("the new owner can see it", (await call(`/api/cases/${caseD}`, { token: wbc2 })).status === 200);
    check("the previous owner cannot", (await call(`/api/cases/${caseD}`, { token: wbc1 })).status === 404);
    check("the new officer can download the evidence", (await dl(iuHead)).status === 200);

    const reassignToOutsider = await call(`/api/cases/${caseD}/transfer`, {
        method: "PATCH",
        token: admin,
        body: { investigationOfficerId: await userId("wbc.member1") }
    });
    check("cannot hand a case to someone outside the IU", reassignToOutsider.status === 400);

    console.log("\n23. Admin user administration");

    const searched = await call("/api/users?search=farida", { token: admin });
    check("users can be searched", searched.data.length === 1 && searched.data[0].username === "iu.head");

    const workload = await call(`/api/users/${await userId("iu.head")}/workload`, { token: admin });
    check("open workload is reported", workload.data.cases >= 1, JSON.stringify(workload.data));

    const deleteBusy = await call(`/api/users/${await userId("iu.head")}`, { method: "DELETE", token: admin });
    check("a user holding open work cannot be deleted", deleteBusy.status === 409, JSON.stringify(deleteBusy.data));

    const deactivate = await call(`/api/users/${await userId("iu.head")}/status`, {
        method: "PATCH",
        token: admin,
        body: { status: "INACTIVE" }
    });
    check("but they can be deactivated", deactivate.status === 200);
    check("and the stranded work is reported back", deactivate.data.workload.cases >= 1);

    const selfDeactivate = await call(`/api/users/${await userId("admin")}/status`, {
        method: "PATCH",
        token: admin,
        body: { status: "INACTIVE" }
    });
    check("Admin cannot deactivate itself", selfDeactivate.status === 409);

    await call(`/api/users/${await userId("iu.head")}/status`, {
        method: "PATCH",
        token: admin,
        body: { status: "ACTIVE" }
    });

    const spare = await call("/api/users", {
        method: "POST",
        token: admin,
        body: { username: `smoke.temp.${Date.now()}`, fullName: "Temp Smoke User" }
    });
    check("a user can be created", spare.status === 201);

    const [investigatorRole] = await db.query("SELECT role_id FROM roles WHERE role_code = 'INVESTIGATOR'");

    const addRole = await call(`/api/users/${spare.data.userId}/roles`, {
        method: "POST",
        token: admin,
        body: { roleId: investigatorRole[0].role_id }
    });
    check("a role can be added", addRole.status === 200);

    const removeRoleRes = await call(
        `/api/users/${spare.data.userId}/roles/${investigatorRole[0].role_id}`,
        { method: "DELETE", token: admin }
    );
    check("a role can be removed", removeRoleRes.status === 200, JSON.stringify(removeRoleRes.data));

    const [adminRole] = await db.query("SELECT role_id FROM roles WHERE role_code = 'ADMIN'");
    const stripLastAdmin = await call(`/api/users/${await userId("admin")}/roles/${adminRole[0].role_id}`, {
        method: "DELETE",
        token: admin
    });
    check("the last Administrator cannot be stripped of the role", stripLastAdmin.status === 409);

    const deleteSpare = await call(`/api/users/${spare.data.userId}`, { method: "DELETE", token: admin });
    check("an idle user can be deleted", deleteSpare.status === 200, JSON.stringify(deleteSpare.data));

    const nonAdminUserWrite = await call(`/api/users/${await userId("wbc.member1")}/status`, {
        method: "PATCH",
        token: wbc1,
        body: { status: "INACTIVE" }
    });
    check("non-Admins cannot administer users", nonAdminUserWrite.status === 403);

    const transfersConsole = await call("/api/admin/transfers", { token: admin });
    check("the transfer console lists open files", transfersConsole.status === 200);
    check("with their current holders", transfersConsole.data.cases.some((c) => c.id === caseD));
    check(
        "non-Admins cannot open the transfer console",
        (await call("/api/admin/transfers", { token: wbc1 })).status === 403
    );

    // --- Response routing, complainant status, and internal confidentiality --
    console.log("\n--- Scenario E: response routing, complainant status, IU scope ---");

    console.log("\n24. Set up a case with an internal remark and a details request");

    const formE = new FormData();
    formE.append("dateOfReceipt", new Date().toISOString().slice(0, 10));
    formE.append("channelId", String(ids.channel));
    formE.append("natureId", String(ids.nature));
    formE.append("severityId", String(ids.severity));
    formE.append("anonymityTypeId", String(ids.anonNamed));
    formE.append("complainantTypeId", String(ids.complainantType));
    formE.append("description", "Smoke test E: routing and confidentiality checks.");
    formE.append("declaration", "true");
    formE.append("wantsPostbox", "true");
    formE.append("complainant", JSON.stringify({ employeeName: "Ellis Router", email: "ellis@example.test" }));

    const submitE = await call("/api/public/complaints", { method: "POST", form: formE });
    const [rowsE] = await db.query("SELECT complaint_id FROM complaints WHERE complaint_no = ?", [
        submitE.data.complaintId
    ]);
    const complaintE = rowsE[0].complaint_id;

    await call(`/api/complaints/${complaintE}/acknowledge`, { method: "PATCH", token: wbc1, body: {} });

    const forwardE = await call(`/api/complaints/${complaintE}/forward-to-iu`, {
        method: "POST",
        token: wbc1,
        body: { investigationOfficerId: await userId("iu.officer") }
    });
    const caseE = forwardE.data.caseId;

    // An internal note from the committee — must never reach the complainant,
    // and must not reach the IU either (it did not write it).
    await call(`/api/cases/${caseE}/remarks`, {
        method: "POST",
        token: wbc1,
        body: { remarks: "Internal: possible conflict of interest with the finance head, verify quietly." }
    });

    console.log("\n25. The complainant's answer lands with the committee, not the IU");

    const requestE = await call(`/api/complaints/${complaintE}/request-details`, {
        method: "POST",
        token: wbc1,
        body: { question: "Which cost centre does this relate to?" }
    });
    check("details requested against the case", requestE.status === 201, JSON.stringify(requestE.data));

    const trackOpenE = await call("/api/public/complaints/track", {
        method: "POST",
        body: { complaintId: submitE.data.complaintId, password: submitE.data.password }
    });
    check(
        "the complainant sees 'Additional Information Required'",
        trackOpenE.data.status === "Additional Information Required",
        trackOpenE.data.status
    );

    const respondFormE = new FormData();
    respondFormE.append("complaintId", submitE.data.complaintId);
    respondFormE.append("password", submitE.data.password);
    respondFormE.append("clarificationId", String(requestE.data.clarificationId));
    respondFormE.append("responseText", "Cost centre CC-4471, approved by Priya Nair in Finance.");
    respondFormE.append(
        "file",
        new Blob(["cost centre approval scan\n"], { type: "text/plain" }),
        "approval-scan.txt"
    );

    const respondedE = await call("/api/public/complaints/respond", { method: "POST", form: respondFormE });
    check("the complainant can submit the answer", respondedE.status === 200, JSON.stringify(respondedE.data));

    const trackAnsweredE = await call("/api/public/complaints/track", {
        method: "POST",
        body: { complaintId: submitE.data.complaintId, password: submitE.data.password }
    });
    check(
        "the complainant sees 'Additional Information Submitted'",
        trackAnsweredE.data.status === "Additional Information Submitted",
        trackAnsweredE.data.status
    );
    check("no live request is shown once answered", !trackAnsweredE.data.informationRequired);

    const iuBeforeForwardE = await call(`/api/cases/${caseE}`, { token: iu });
    check(
        "the IU sees no trace of the unforwarded answer",
        !iuBeforeForwardE.data.clarifications.some((c) => c.statusCode === "RESPONDED"),
        JSON.stringify(iuBeforeForwardE.data.clarifications)
    );

    const [attachmentRowE] = await db.query(
        "SELECT document_id, shared_with_iu FROM documents WHERE complaint_id = ? ORDER BY document_id DESC LIMIT 1",
        [complaintE]
    );
    check("the attachment is held back from the IU", attachmentRowE[0].shared_with_iu === 0);

    const iuAttachmentDownloadBefore = await fetch(`${BASE}/api/documents/${attachmentRowE[0].document_id}/download`, {
        headers: { Authorization: `Bearer ${iu}` }
    });
    check("the IU cannot download the held-back attachment", iuAttachmentDownloadBefore.status === 404);

    const wbcAttachmentDownload = await fetch(`${BASE}/api/documents/${attachmentRowE[0].document_id}/download`, {
        headers: { Authorization: `Bearer ${wbc1}` }
    });
    check("the committee can download it immediately", wbcAttachmentDownload.status === 200);

    console.log("\n26. The committee reviews and forwards it on");

    const wbcCaseViewE = await call(`/api/cases/${caseE}`, { token: wbc1 });
    check(
        "the committee is offered the forward action",
        wbcCaseViewE.data.workflow.availableActions.includes("FORWARD_RESPONSE_TO_IU")
    );

    const respondedEntryE = wbcCaseViewE.data.clarifications.find((c) => c.statusCode === "RESPONDED");
    check("the committee sees the raw answer", respondedEntryE?.responseText?.includes("Priya Nair"));

    const iuDirectForward = await call(
        `/api/cases/${caseE}/detail-requests/${requestE.data.clarificationId}/forward`,
        { method: "POST", token: iu, body: {} }
    );
    check("the IU cannot forward its own request", iuDirectForward.status === 403);

    // The committee redacts the name before it goes to the Investigation Unit.
    const forwardEResult = await call(
        `/api/cases/${caseE}/detail-requests/${requestE.data.clarificationId}/forward`,
        { method: "POST", token: wbc1, body: { sharedText: "Cost centre CC-4471, approver confirmed internally." } }
    );
    check("the committee forwards a redacted version", forwardEResult.status === 200, JSON.stringify(forwardEResult.data));

    const [attachmentRowAfterE] = await db.query("SELECT shared_with_iu FROM documents WHERE document_id = ?", [
        attachmentRowE[0].document_id
    ]);
    check("the attachment is released at the same time", attachmentRowAfterE[0].shared_with_iu === 1);

    const iuAfterForwardE = await call(`/api/cases/${caseE}`, { token: iu });
    const iuVisibleEntryE = iuAfterForwardE.data.clarifications.find((c) => c.id === requestE.data.clarificationId);
    check("the IU now sees the forwarded entry", !!iuVisibleEntryE);
    check(
        "...with the committee's wording, not the complainant's raw text",
        iuVisibleEntryE?.responseText === "Cost centre CC-4471, approver confirmed internally.",
        iuVisibleEntryE?.responseText
    );
    check(
        "the complainant's name never appears in what the IU can read",
        !JSON.stringify(iuAfterForwardE.data).includes("Priya Nair")
    );

    const iuDownloadAfterE = await fetch(`${BASE}/api/documents/${attachmentRowE[0].document_id}/download`, {
        headers: { Authorization: `Bearer ${iu}` }
    });
    check("the IU can now download the released attachment", iuDownloadAfterE.status === 200);

    console.log("\n27. Internal deliberation stays internal");

    check(
        "the committee's internal remark never reaches the IU's timeline",
        !iuAfterForwardE.data.timeline.some((t) => (t.remarks || "").includes("conflict of interest")),
        JSON.stringify(iuAfterForwardE.data.timeline.map((t) => t.action_code))
    );

    const trackFinalE = await call("/api/public/complaints/track", {
        method: "POST",
        body: { complaintId: submitE.data.complaintId, password: submitE.data.password }
    });
    const complainantSeenActionsE = trackFinalE.data.history.map((h) => h.status);
    check(
        "the complainant's timeline uses only the four allowed labels",
        complainantSeenActionsE.every((s) =>
            ["Complaint Acknowledged", "Additional Information Required", "Additional Information Submitted", "Case Closed"].includes(s)
        ),
        JSON.stringify(complainantSeenActionsE)
    );
    check(
        "the internal remark text never appears anywhere in the complainant's payload",
        !JSON.stringify(trackFinalE.data).includes("conflict of interest")
    );
    check(
        "the case-assignment/forwarding machinery is invisible to the complainant",
        !JSON.stringify(trackFinalE.data).toLowerCase().includes("iu.officer")
    );

    console.log("\n28. Investigation Officer sees the handover context for an assigned case");

    check("the case exposes when and by whom it was forwarded", !!iuAfterForwardE.data.forwarding);
    check(
        "...naming the forwarding WB Committee member",
        iuAfterForwardE.data.forwarding?.forwardedByName === "Meera Iyer",
        iuAfterForwardE.data.forwarding?.forwardedByName
    );

    console.log(`\n${checks - failures}/${checks} checks passed`);

    await db.end();
    process.exit(failures ? 1 : 0);
})().catch(async (error) => {
    console.error("\nSmoke test crashed:", error);
    await db.end().catch(() => {});
    process.exit(1);
});
