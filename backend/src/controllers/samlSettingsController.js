const db = require("../config/db");
const {
    SP_ENTITY_ID,
    SP_METADATA_URL,
    SP_ACS_URL,
    SamlAuthError,
    toSettings,
    getSettingsRow,
    fetchIdpMetadataXml,
    parseIdpMetadataXml
} = require("../services/samlAuthService");

const ROW_ID = 1;

const spInfo = () => ({ entityId: SP_ENTITY_ID, metadataUrl: SP_METADATA_URL, acsUrl: SP_ACS_URL });

const getSamlSettings = async (req, res) => {
    const row = await getSettingsRow();
    res.json({ ...toSettings(row), sp: spInfo() });
};

// Step 1's "Fetch" button: pulls the IdP metadata document server-side (avoids
// browser CORS restrictions against ADFS) and returns the three fields it
// auto-fills. Does not persist anything — that only happens on Test & Save.
const fetchIdpMetadata = async (req, res) => {
    const { metadataUrl } = req.body;

    if (!metadataUrl) {
        return res.status(400).json({ message: "metadataUrl is required" });
    }

    try {
        const xml = await fetchIdpMetadataXml(metadataUrl);
        const parsed = parseIdpMetadataXml(xml);
        res.json(parsed);
    } catch (error) {
        if (error instanceof SamlAuthError) {
            return res.status(400).json({ message: error.message });
        }

        throw error;
    }
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

// "Test & Save" per the spec: validate (re-fetch metadata when a URL is on
// file, parse its certificate, check every required field) and only persist
// once all of that passes — there is no separate silent "Save".
const testAndSaveSamlSettings = async (req, res) => {
    const {
        isEnabled,
        idpMetadataUrl,
        idpSignOnUrl,
        idpEntityId,
        idpSigningCerts,
        mappings,
        allowedEmailDomains,
        samlBinding,
        allowUnsolicited,
        signAuthnRequest,
        wantAssertionSigned,
        wantResponseSigned,
        forceAuthn,
        keepLocalPasswordLogin
    } = req.body;

    const checks = [];
    let effectiveSignOnUrl = idpSignOnUrl;
    let effectiveEntityId = idpEntityId;
    let effectiveCerts = Array.isArray(idpSigningCerts) ? idpSigningCerts : [];

    // Re-fetch on every save when a metadata URL is on file — this is also
    // how a rolled-over IdP signing certificate gets picked up, per the spec.
    if (idpMetadataUrl) {
        try {
            const xml = await fetchIdpMetadataXml(idpMetadataUrl);
            const parsed = parseIdpMetadataXml(xml);
            effectiveSignOnUrl = parsed.idpSignOnUrl;
            effectiveEntityId = parsed.idpEntityId;
            effectiveCerts = parsed.idpSigningCerts;
            checks.push({ name: "Fetch IdP metadata", ok: true, message: "Metadata fetched and parsed." });
        } catch (error) {
            checks.push({
                name: "Fetch IdP metadata",
                ok: false,
                message: error instanceof SamlAuthError ? error.message : error.message
            });
            // 200, not 400: a failed check is a normal validation outcome the
            // wizard renders (per-step pass/fail), not a request error.
            return res.json({ success: false, steps: checks });
        }
    } else {
        // Not a failure — just informational. Whether the manually-entered
        // fields are actually complete is what the "Required fields" check
        // below is for.
        checks.push({
            name: "Fetch IdP metadata",
            ok: true,
            message: "No metadata URL on file — using the manually-entered IdP fields as-is."
        });
    }

    const hasEmployeeIdMapping = Array.isArray(mappings)
        ? mappings.some((m) => m.attribute === "employeeId" && isNonEmptyString(m.claim))
        : false;

    const missingFields = [
        !isNonEmptyString(effectiveSignOnUrl) && "sign-on URL",
        !isNonEmptyString(effectiveEntityId) && "IdP entity ID",
        effectiveCerts.length === 0 && "signing certificate",
        !hasEmployeeIdMapping && "an Employee ID claim mapping",
        !isNonEmptyString(allowedEmailDomains) && "allowed email domains"
    ].filter(Boolean);

    // A disabled config can be saved as a work-in-progress draft with fields
    // still missing — enabling is what makes them mandatory.
    checks.push({
        name: "Required fields",
        ok: !isEnabled || missingFields.length === 0,
        message: missingFields.length
            ? isEnabled
                ? `Missing: ${missingFields.join(", ")}.`
                : `Saved as a draft (SAML sign-in disabled) — still missing: ${missingFields.join(", ")}.`
            : "All required fields are present."
    });

    checks.push({
        name: "Parse signing certificate",
        ok: !isEnabled || effectiveCerts.length > 0,
        message: effectiveCerts.length ? `${effectiveCerts.length} certificate(s) on file.` : "No signing certificate."
    });

    if (!checks.every((c) => c.ok)) {
        return res.json({ success: false, steps: checks });
    }

    await db.query(
        `UPDATE saml_settings SET
            is_enabled = ?, idp_metadata_url = ?, idp_sign_on_url = ?, idp_entity_id = ?, idp_signing_certs = ?,
            mappings = ?, allowed_email_domains = ?, saml_binding = ?, allow_unsolicited = ?, sign_authn_request = ?,
            want_assertion_signed = ?, want_response_signed = ?, force_authn = ?, keep_local_password_login = ?,
            updated_by = ?
         WHERE id = ?`,
        [
            isEnabled ? 1 : 0,
            idpMetadataUrl || null,
            effectiveSignOnUrl || null,
            effectiveEntityId || null,
            JSON.stringify(effectiveCerts),
            JSON.stringify(Array.isArray(mappings) ? mappings : []),
            allowedEmailDomains || null,
            samlBinding === "REDIRECT" ? "REDIRECT" : "POST",
            allowUnsolicited === false ? 0 : 1,
            signAuthnRequest ? 1 : 0,
            wantAssertionSigned === false ? 0 : 1,
            wantResponseSigned ? 1 : 0,
            forceAuthn ? 1 : 0,
            keepLocalPasswordLogin === false ? 0 : 1,
            req.user.userId,
            ROW_ID
        ]
    );

    const row = await getSettingsRow();
    res.json({ success: true, steps: checks, settings: { ...toSettings(row), sp: spInfo() } });
};

module.exports = { getSamlSettings, fetchIdpMetadata, testAndSaveSamlSettings };
