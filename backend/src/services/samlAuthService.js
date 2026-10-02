const selfsigned = require("selfsigned");
const samlify = require("samlify");
const xmllintValidator = require("@authenio/samlify-node-xmllint");
const { DOMParser } = require("@xmldom/xmldom");
const xpath = require("xpath");

const db = require("../config/db");
const { encryptSecret, decryptSecret } = require("../utils/crypto");

// samlify refuses to parse any SAML message at all until a schema validator
// is registered (it would otherwise be "potentially vulnerable" per its own
// error) — this wires up the XSD validity check for every inbound message.
samlify.setSchemaValidator(xmllintValidator);

const ROW_ID = 1;

const BASE_URL = (process.env.APP_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

// The SP side of Step 1 — read-only/generated, never entered by the admin.
const SP_ENTITY_ID = `${BASE_URL}/api/auth/saml`;
const SP_METADATA_URL = `${BASE_URL}/api/auth/saml/metadata`;
const SP_ACS_URL = `${BASE_URL}/api/auth/saml/acs`;

const BINDING_URN = {
    POST: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    REDIRECT: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
};

const bindingKey = (samlBinding) => (samlBinding === "REDIRECT" ? "redirect" : "post");

// A refusal the caller should show to the admin/user as-is (as opposed to an
// unexpected library/network error, which the controller logs and hides).
class SamlAuthError extends Error {}

// ---------------------------------------------------------------------------
// Settings shape
// ---------------------------------------------------------------------------

const parseJsonArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (!value) {
        return [];
    }

    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

// Normalises the DB row into the camelCase shape the wizard and the runtime
// SAML flow both work with.
const toSettings = (row) => ({
    isEnabled: Boolean(row.is_enabled),
    idpMetadataUrl: row.idp_metadata_url || "",
    idpSignOnUrl: row.idp_sign_on_url || "",
    idpEntityId: row.idp_entity_id || "",
    idpSigningCerts: parseJsonArray(row.idp_signing_certs),
    mappings: parseJsonArray(row.mappings),
    allowedEmailDomains: row.allowed_email_domains || "",
    samlBinding: row.saml_binding || "POST",
    allowUnsolicited: Boolean(row.allow_unsolicited),
    signAuthnRequest: Boolean(row.sign_authn_request),
    wantAssertionSigned: Boolean(row.want_assertion_signed),
    wantResponseSigned: Boolean(row.want_response_signed),
    forceAuthn: Boolean(row.force_authn),
    keepLocalPasswordLogin: row.keep_local_password_login === null ? true : Boolean(row.keep_local_password_login),
    hasSpKeyPair: Boolean(row.sp_certificate),
    updatedAt: row.updated_at
});

const getSettingsRow = async () => {
    const [rows] = await db.query("SELECT * FROM saml_settings WHERE id = ?", [ROW_ID]);
    return rows[0];
};

const getSettings = async () => toSettings(await getSettingsRow());

// ---------------------------------------------------------------------------
// SP signing keypair
//
// The wizard never asks the admin for an SP private key — Step 1 only shows
// the SP side as read-only/generated values (metadata, ACS, entityId). This
// self-signed keypair is what backs that metadata's signing certificate and
// "Sign AuthnRequest"; it's generated once, lazily, and the private key is
// the one real secret this feature stores (encrypted at rest, like the old
// AD bind password was).
// ---------------------------------------------------------------------------

const generateSpKeyPair = async () => {
    const { private: privateKey, cert: certificate } = await selfsigned.generate(
        [{ name: "commonName", value: SP_ENTITY_ID }],
        { days: 3650, keySize: 2048, algorithm: "sha256" }
    );

    return { privateKey, certificate };
};

const ensureSpKeyPair = async () => {
    const row = await getSettingsRow();

    if (row?.sp_certificate && row?.sp_private_key_encrypted) {
        return { certificate: row.sp_certificate, privateKey: decryptSecret(row.sp_private_key_encrypted) };
    }

    const { certificate, privateKey } = await generateSpKeyPair();

    await db.query("UPDATE saml_settings SET sp_certificate = ?, sp_private_key_encrypted = ? WHERE id = ?", [
        certificate,
        encryptSecret(privateKey),
        ROW_ID
    ]);

    return { certificate, privateKey };
};

// ---------------------------------------------------------------------------
// IdP metadata — fetch (Step 1 "Fetch" button) and entity construction
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 8000;

const fetchIdpMetadataXml = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
            throw new SamlAuthError(`The metadata URL responded with HTTP ${response.status}.`);
        }

        return await response.text();
    } catch (error) {
        if (error.name === "AbortError") {
            throw new SamlAuthError("Timed out fetching the metadata URL.");
        }

        if (error instanceof SamlAuthError) {
            throw error;
        }

        throw new SamlAuthError(`Could not reach the metadata URL: ${error.message}`);
    } finally {
        clearTimeout(timer);
    }
};

const pickSignOnUrl = (idpMeta) => {
    const redirect = idpMeta.getSingleSignOnService("redirect");
    if (typeof redirect === "string") {
        return redirect;
    }

    const post = idpMeta.getSingleSignOnService("post");
    return typeof post === "string" ? post : null;
};

// Parses raw IdP metadata XML into the three fields Step 1 auto-fills:
// signOnUrl, idpEntityId, signingCerts[].
const parseIdpMetadataXml = (xml) => {
    let idp;

    try {
        idp = samlify.IdentityProvider({ metadata: xml });
    } catch (error) {
        throw new SamlAuthError(`Could not parse the metadata document: ${error.message}`);
    }

    const idpEntityId = idp.entityMeta.getEntityID();
    const idpSignOnUrl = pickSignOnUrl(idp.entityMeta);

    let certs = idp.entityMeta.getX509Certificate("signing");
    certs = certs ? (Array.isArray(certs) ? certs : [certs]) : [];

    if (!idpEntityId || !idpSignOnUrl || certs.length === 0) {
        throw new SamlAuthError(
            "The metadata is missing an entityID, a SingleSignOnService endpoint, or a signing certificate."
        );
    }

    return { idpEntityId, idpSignOnUrl, idpSigningCerts: certs };
};

const buildIdp = (settings) =>
    samlify.IdentityProvider({
        entityID: settings.idpEntityId,
        signingCert: settings.idpSigningCerts,
        // Mirrors our own signAuthnRequest choice — see the "Test & Save"
        // notes in samlSettingsController.js for why this can't drift.
        wantAuthnRequestsSigned: settings.signAuthnRequest,
        singleSignOnService: [
            {
                Binding: BINDING_URN[settings.samlBinding] || BINDING_URN.POST,
                Location: settings.idpSignOnUrl,
                isDefault: true
            }
        ]
    });

const buildSp = (settings, spCertificate, spPrivateKey) =>
    samlify.ServiceProvider({
        entityID: SP_ENTITY_ID,
        authnRequestsSigned: settings.signAuthnRequest,
        wantAssertionsSigned: settings.wantAssertionSigned,
        wantMessageSigned: settings.wantResponseSigned,
        privateKey: settings.signAuthnRequest ? spPrivateKey : undefined,
        signingCert: spCertificate,
        assertionConsumerService: [{ Binding: BINDING_URN.POST, Location: SP_ACS_URL, isDefault: true }]
    });

const getSpMetadataXml = async () => {
    const { certificate, privateKey } = await ensureSpKeyPair();
    const settings = await getSettings();

    return buildSp(settings, certificate, privateKey).getMetadata();
};

// ---------------------------------------------------------------------------
// Outstanding AuthnRequest tracking
//
// Correlates a login response back to a request this SP actually issued, so
// a response with no InResponseTo (or an unrecognised one) can be told apart
// from a genuine SP-initiated round trip. In-memory and per-process — fine
// for this app's single-instance deployment; a multi-instance deployment
// would need a shared store instead.
// ---------------------------------------------------------------------------

const REQUEST_TTL_MS = 10 * 60 * 1000;
const pendingRequests = new Map();

const rememberRequestId = (id) => {
    pendingRequests.set(id, Date.now() + REQUEST_TTL_MS);

    if (pendingRequests.size > 500) {
        const now = Date.now();
        for (const [key, expiresAt] of pendingRequests) {
            if (expiresAt < now) {
                pendingRequests.delete(key);
            }
        }
    }
};

// One-time use: a replayed InResponseTo must not validate twice.
const consumeRequestId = (id) => {
    const expiresAt = pendingRequests.get(id);
    pendingRequests.delete(id);
    return Boolean(expiresAt) && expiresAt > Date.now();
};

// ---------------------------------------------------------------------------
// SP-initiated login
// ---------------------------------------------------------------------------

const buildLoginRequest = async (settings) => {
    const { certificate, privateKey } = await ensureSpKeyPair();
    const sp = buildSp(settings, certificate, privateKey);
    const idp = buildIdp(settings);
    const key = bindingKey(settings.samlBinding);

    const result = sp.createLoginRequest(idp, key, settings.forceAuthn ? { forceAuthn: true } : undefined);
    rememberRequestId(result.id);

    if (key === "redirect") {
        return { mode: "redirect", url: result.context };
    }

    return { mode: "post", actionUrl: result.entityEndpoint, samlRequest: result.context };
};

// ---------------------------------------------------------------------------
// ACS — validates the inbound response and returns the claimed employee ID
// ---------------------------------------------------------------------------

// samlify's own signature check (flow.js) always requires *some* valid
// signature (message- or assertion-level) before it will return a result at
// all. These extra checks enforce *which* one the admin has required,
// inspecting the same XML samlify just cryptographically verified.
const checkSignatureLocations = (samlContent) => {
    const doc = new DOMParser().parseFromString(samlContent, "text/xml");

    const hasMessageSignature =
        xpath.select("/*[local-name()='Response']/*[local-name()='Signature']", doc).length > 0;
    const hasAssertionSignature =
        xpath.select("/*[local-name()='Response']/*[local-name()='Assertion']/*[local-name()='Signature']", doc)
            .length > 0;

    return { hasMessageSignature, hasAssertionSignature };
};

const readClaim = (attributes, claimUri) => {
    if (!attributes || !claimUri) {
        return null;
    }

    const raw = attributes[claimUri];
    if (raw == null || raw === "") {
        return null;
    }

    return Array.isArray(raw) ? raw[0] : raw;
};

const emailDomainAllowed = (email, allowedCsv) => {
    const domain = String(email).split("@")[1]?.toLowerCase();

    if (!domain) {
        return false;
    }

    const allowed = String(allowedCsv || "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);

    return allowed.some((a) => domain === a || domain.endsWith(`.${a}`));
};

// Parses and validates the SAMLResponse on `req`, enforces the admin's
// signing/unsolicited policy, and resolves the mapped Employee ID claim.
// Never touches the users table or issues a token — that's the caller's job
// once it has the employeeId in hand.
const parseAcsResponse = async (req, settings) => {
    const { certificate, privateKey } = await ensureSpKeyPair();
    const sp = buildSp(settings, certificate, privateKey);
    const idp = buildIdp(settings);

    let result;

    try {
        result = await sp.parseLoginResponse(idp, "post", req);
    } catch (error) {
        throw new SamlAuthError(`The identity provider's response could not be verified (${error.message}).`);
    }

    const inResponseTo = result.extract?.response?.inResponseTo || result.extract?.response?.InResponseTo;

    if (inResponseTo) {
        if (!consumeRequestId(inResponseTo)) {
            throw new SamlAuthError("This sign-in link has expired or was already used.");
        }
    } else if (!settings.allowUnsolicited) {
        throw new SamlAuthError("Unsolicited sign-in is not permitted for this configuration.");
    }

    const { hasMessageSignature, hasAssertionSignature } = checkSignatureLocations(result.samlContent);

    if (settings.wantResponseSigned && !hasMessageSignature) {
        throw new SamlAuthError("The identity provider's response is not signed at the message level.");
    }

    if (settings.wantAssertionSigned && !hasAssertionSignature) {
        throw new SamlAuthError("The identity provider's assertion is not signed.");
    }

    const attributes = result.extract?.attributes || {};
    const employeeIdMapping = settings.mappings.find((m) => m.attribute === "employeeId");
    const emailMapping = settings.mappings.find((m) => m.attribute === "email");

    const employeeId = employeeIdMapping ? readClaim(attributes, employeeIdMapping.claim) : null;
    const email = emailMapping ? readClaim(attributes, emailMapping.claim) : null;

    if (!employeeId) {
        throw new SamlAuthError("The identity provider did not send the mapped Employee ID claim.");
    }

    if (!email || !emailDomainAllowed(email, settings.allowedEmailDomains)) {
        throw new SamlAuthError("The signed-in email domain is not permitted for single sign-on.");
    }

    return { employeeId };
};

module.exports = {
    SP_ENTITY_ID,
    SP_METADATA_URL,
    SP_ACS_URL,
    SamlAuthError,
    toSettings,
    getSettings,
    getSettingsRow,
    fetchIdpMetadataXml,
    parseIdpMetadataXml,
    getSpMetadataXml,
    buildLoginRequest,
    parseAcsResponse
};
