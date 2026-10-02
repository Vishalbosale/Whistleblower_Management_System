const db = require("../config/db");
const { signToken } = require("../utils/tokens");
const { getRolesForUser } = require("./authController");
const { getSettings, getSpMetadataXml, buildLoginRequest, parseAcsResponse, SamlAuthError } = require("../services/samlAuthService");

const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");

// Public — this is the "SP side (read-only, generated)" metadata document an
// admin pastes into ADFS's relying-party trust. Always available (the SP's
// own keypair is generated on first use) regardless of whether an IdP has
// been configured yet.
const spMetadata = async (req, res) => {
    const xml = await getSpMetadataXml();
    res.type("application/xml").send(xml);
};

// Public — tells the staff login page whether to offer an SSO option at all.
const status = async (req, res) => {
    const settings = await getSettings();
    res.json({ enabled: settings.isEnabled, keepLocalPasswordLogin: settings.keepLocalPasswordLogin });
};

// Public — SP-initiated login. Redirects (or auto-submits a form, depending
// on the configured binding) to the IdP's sign-on URL.
const initiateLogin = async (req, res) => {
    const settings = await getSettings();

    if (!settings.isEnabled) {
        return res.status(400).json({ message: "SAML sign-in is not enabled" });
    }

    const request = await buildLoginRequest(settings);

    if (request.mode === "redirect") {
        return res.redirect(request.url);
    }

    // HTTP-POST binding: the SAMLRequest has to leave via a real browser
    // navigation (a same-origin auto-submitting form), not a fetch response.
    res.type("html").send(`<!doctype html>
<html><body onload="document.forms[0].submit()">
<form method="POST" action="${escapeHtml(request.actionUrl)}">
<input type="hidden" name="SAMLRequest" value="${escapeHtml(request.samlRequest)}" />
</form>
</body></html>`);
};

const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const redirectWithError = (res, message) =>
    res.redirect(`${FRONTEND_BASE_URL}/staff/login?ssoError=${encodeURIComponent(message)}`);

// Public — Assertion Consumer Service. The browser lands here via the IdP's
// own auto-submitted form POST, so the outcome has to be a redirect back
// into the SPA, never a JSON response.
const acs = async (req, res) => {
    const settings = await getSettings();

    if (!settings.isEnabled) {
        return redirectWithError(res, "SAML sign-in is not enabled");
    }

    let employeeId;

    try {
        ({ employeeId } = await parseAcsResponse(req, settings));
    } catch (error) {
        if (error instanceof SamlAuthError) {
            return redirectWithError(res, error.message);
        }

        console.error("SAML ACS error:", error);
        return redirectWithError(res, "Sign-in failed — the identity provider's response could not be processed.");
    }

    // Match-only: the claim identifies an existing local account. Never
    // create one, never touch roles, and never persist anything about the
    // SAML identity itself (email/claims) beyond this lookup.
    const [users] = await db.query("SELECT * FROM users WHERE employee_id = ? AND status_code = 'ACTIVE'", [
        employeeId
    ]);
    const user = users[0];

    if (!user) {
        return redirectWithError(res, "No matching account was found for this employee ID.");
    }

    const roles = await getRolesForUser(user.user_id);
    const roleCodes = roles.map((r) => r.role_code);

    const token = signToken({ userId: user.user_id, username: user.username, roles: roleCodes });

    await db.query("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);
    await db.query(`INSERT INTO login_history (user_id, login_type, login_status) VALUES (?, 'SAML', 'SUCCESS')`, [
        user.user_id
    ]);

    res.redirect(`${FRONTEND_BASE_URL}/staff/sso-callback?token=${encodeURIComponent(token)}`);
};

module.exports = { spMetadata, status, initiateLogin, acs };
