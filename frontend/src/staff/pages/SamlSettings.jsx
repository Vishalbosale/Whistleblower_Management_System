import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./SamlSettings.css";

const ATTRIBUTE_OPTIONS = [
    { value: "employeeId", label: "Employee ID (match key)" },
    { value: "email", label: "Email" },
    { value: "displayName", label: "Display name" }
];

const DEFAULT_MAPPINGS = [
    { attribute: "employeeId", claim: "" },
    { attribute: "email", claim: "" },
    { attribute: "displayName", claim: "" }
];

const DEFAULT_FORM = {
    isEnabled: false,
    idpMetadataUrl: "",
    idpSignOnUrl: "",
    idpEntityId: "",
    idpSigningCerts: [],
    mappings: DEFAULT_MAPPINGS,
    allowedEmailDomains: "",
    samlBinding: "POST",
    allowUnsolicited: true,
    signAuthnRequest: false,
    wantAssertionSigned: true,
    wantResponseSigned: false,
    forceAuthn: false,
    keepLocalPasswordLogin: true
};

// Admin-only two-step wizard: Step 1 configures the identity provider trust
// (our SP side is read-only/generated; the IdP side is fetched or entered),
// Step 2 maps SAML claims to portal attributes and sets protocol options.
// "Test & Save" validates everything server-side before persisting — there
// is no separate silent save.
const SamlSettings = () => {
    const [step, setStep] = useState(1);
    const [sp, setSp] = useState(null);
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [fetching, setFetching] = useState(false);
    const [fetchError, setFetchError] = useState("");
    const [fetchNotice, setFetchNotice] = useState("");

    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [saveError, setSaveError] = useState("");

    const load = async () => {
        setLoading(true);
        setError("");

        try {
            const data = await api.get("/saml-settings", { auth: true });
            const { sp: spInfo, ...settings } = data;
            setSp(spInfo);
            setForm({
                ...DEFAULT_FORM,
                ...settings,
                mappings: settings.mappings?.length ? settings.mappings : DEFAULT_MAPPINGS
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

    const updateMapping = (index, patch) =>
        setForm((f) => ({
            ...f,
            mappings: f.mappings.map((m, i) => (i === index ? { ...m, ...patch } : m))
        }));

    const addMapping = () =>
        setForm((f) => ({ ...f, mappings: [...f.mappings, { attribute: "employeeId", claim: "" }] }));

    const removeMapping = (index) =>
        setForm((f) => ({ ...f, mappings: f.mappings.filter((_, i) => i !== index) }));

    const updateCert = (index, value) =>
        setForm((f) => ({ ...f, idpSigningCerts: f.idpSigningCerts.map((c, i) => (i === index ? value : c)) }));

    const addCert = () => setForm((f) => ({ ...f, idpSigningCerts: [...f.idpSigningCerts, ""] }));

    const removeCert = (index) =>
        setForm((f) => ({ ...f, idpSigningCerts: f.idpSigningCerts.filter((_, i) => i !== index) }));

    const handleFetchMetadata = async () => {
        setFetchError("");
        setFetchNotice("");
        setFetching(true);

        try {
            const parsed = await api.post(
                "/saml-settings/fetch-metadata",
                { metadataUrl: form.idpMetadataUrl },
                { auth: true }
            );

            setForm((f) => ({
                ...f,
                idpSignOnUrl: parsed.idpSignOnUrl,
                idpEntityId: parsed.idpEntityId,
                idpSigningCerts: parsed.idpSigningCerts
            }));
            setFetchNotice("Fetched — sign-on URL, entity ID and signing certificate filled in below.");
        } catch (err) {
            setFetchError(err.message);
        } finally {
            setFetching(false);
        }
    };

    const handleTestAndSave = async () => {
        setSaveError("");
        setResult(null);
        setSaving(true);

        try {
            const response = await api.post(
                "/saml-settings/test-and-save",
                {
                    ...form,
                    idpSigningCerts: form.idpSigningCerts.filter((c) => c.trim()),
                    mappings: form.mappings.filter((m) => m.claim.trim())
                },
                { auth: true }
            );

            setResult(response);

            if (response.success) {
                const { sp: spInfo, ...settings } = response.settings;
                setSp(spInfo);
                setForm({ ...DEFAULT_FORM, ...settings });
            }
        } catch (err) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading || !form) {
        return <p className="staff-empty">Loading...</p>;
    }

    const hasEmployeeIdMapping = form.mappings.some((m) => m.attribute === "employeeId" && m.claim.trim());

    return (
        <div>
            <div className="staff-page-header">
                <h1>ADFS SAML Authentication</h1>
            </div>

            <p className="staff-note">
                Configures single sign-on for the admin/investigator console via ADFS (SAML 2.0). This never affects
                the anonymous whistle-blower reporting portal. A SAML sign-in only ever matches an existing account by
                Employee ID — it never creates one or changes roles.
            </p>

            {error && <div className="staff-error">{error}</div>}

            <div className="staff-card" style={{ marginBottom: 16 }}>
                <label className="saml-enable-toggle">
                    <input
                        type="checkbox"
                        checked={form.isEnabled}
                        onChange={(e) => updateField("isEnabled", e.target.checked)}
                    />
                    Enable ADFS SAML sign-in
                </label>
                <label className="saml-enable-toggle">
                    <input
                        type="checkbox"
                        checked={form.keepLocalPasswordLogin}
                        onChange={(e) => updateField("keepLocalPasswordLogin", e.target.checked)}
                    />
                    Keep local username/password login available alongside SSO
                </label>
            </div>

            <div className="saml-steps">
                <button
                    type="button"
                    className={`saml-step ${step === 1 ? "saml-step-active" : ""}`}
                    onClick={() => setStep(1)}
                >
                    <span className="saml-step-index">1</span>
                    Configure identity provider
                </button>
                <button
                    type="button"
                    className={`saml-step ${step === 2 ? "saml-step-active" : ""}`}
                    onClick={() => setStep(2)}
                >
                    <span className="saml-step-index">2</span>
                    Attribute mapping &amp; options
                </button>
            </div>

            {step === 1 && (
                <>
                    <div className="staff-card">
                        <h2 className="staff-section-title">Service provider (this application)</h2>
                        <p className="staff-note">
                            Generated by this application — paste these into the ADFS relying-party trust. Read-only.
                        </p>

                        <div className="staff-form-grid">
                            <div className="staff-form-group">
                                <label>Metadata URL</label>
                                <input type="text" readOnly value={sp?.metadataUrl || ""} />
                            </div>
                            <div className="staff-form-group">
                                <label>Assertion Consumer Service (ACS) URL</label>
                                <input type="text" readOnly value={sp?.acsUrl || ""} />
                            </div>
                            <div className="staff-form-group">
                                <label>Entity ID</label>
                                <input type="text" readOnly value={sp?.entityId || ""} />
                            </div>
                        </div>
                    </div>

                    <div className="staff-card">
                        <h2 className="staff-section-title">Identity provider (ADFS)</h2>

                        <div className="staff-form-group" style={{ marginBottom: 16 }}>
                            <label>IdP metadata URL</label>
                            <div className="saml-inline-row">
                                <input
                                    type="text"
                                    placeholder="https://adfs.corp.example.com/federationmetadata/2007-06/federationmetadata.xml"
                                    value={form.idpMetadataUrl}
                                    onChange={(e) => updateField("idpMetadataUrl", e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="staff-btn"
                                    onClick={handleFetchMetadata}
                                    disabled={fetching || !form.idpMetadataUrl}
                                >
                                    {fetching ? "Fetching..." : "Fetch"}
                                </button>
                            </div>
                            <span className="staff-muted">
                                Fetches and auto-fills the fields below. Stored so the certificate can be re-fetched
                                on rollover.
                            </span>
                            {fetchError && <div className="staff-error">{fetchError}</div>}
                            {fetchNotice && <div className="staff-success">{fetchNotice}</div>}
                        </div>

                        <div className="staff-form-grid">
                            <div className="staff-form-group">
                                <label>Sign-on URL *</label>
                                <input
                                    type="text"
                                    value={form.idpSignOnUrl}
                                    onChange={(e) => updateField("idpSignOnUrl", e.target.value)}
                                    required
                                />
                            </div>

                            <div className="staff-form-group">
                                <label>IdP entity ID *</label>
                                <input
                                    type="text"
                                    value={form.idpEntityId}
                                    onChange={(e) => updateField("idpEntityId", e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="staff-form-group">
                            <label>Signing certificate(s) *</label>
                            {form.idpSigningCerts.length === 0 && (
                                <span className="staff-muted">No certificate on file yet.</span>
                            )}
                            {form.idpSigningCerts.map((cert, index) => (
                                <div className="saml-inline-row" key={index}>
                                    <textarea
                                        rows={3}
                                        className="saml-cert-textarea"
                                        placeholder="-----BEGIN CERTIFICATE----- or raw base64 body"
                                        value={cert}
                                        onChange={(e) => updateCert(index, e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="staff-btn staff-btn-danger"
                                        onClick={() => removeCert(index)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button type="button" className="staff-btn" onClick={addCert}>
                                + Add certificate
                            </button>
                        </div>
                    </div>
                </>
            )}

            {step === 2 && (
                <>
                    <div className="staff-card">
                        <h2 className="staff-section-title">Attribute mapping</h2>
                        <p className="staff-note">
                            Maps a SAML claim URI to a portal attribute. Employee ID is the required match key — a
                            sign-in with no match (or no Employee ID claim at all) is refused; no account is ever
                            created or changed.
                        </p>

                        <div className="staff-table-wrap">
                            <table className="staff-table">
                                <thead>
                                    <tr>
                                        <th>Portal attribute</th>
                                        <th>SAML claim URI</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.mappings.map((mapping, index) => (
                                        <tr key={index}>
                                            <td>
                                                <select
                                                    value={mapping.attribute}
                                                    onChange={(e) => updateMapping(index, { attribute: e.target.value })}
                                                >
                                                    {ATTRIBUTE_OPTIONS.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/..."
                                                    value={mapping.claim}
                                                    onChange={(e) => updateMapping(index, { claim: e.target.value })}
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="staff-btn staff-btn-danger"
                                                    onClick={() => removeMapping(index)}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <button type="button" className="staff-btn" onClick={addMapping}>
                            + Add row
                        </button>

                        {!hasEmployeeIdMapping && (
                            <div className="staff-error" style={{ marginTop: 12 }}>
                                A mapping for Employee ID with a claim URI is required.
                            </div>
                        )}
                    </div>

                    <div className="staff-card">
                        <h2 className="staff-section-title">Options</h2>

                        <div className="staff-form-grid">
                            <div className="staff-form-group">
                                <label>Allowed email domains *</label>
                                <input
                                    type="text"
                                    placeholder="axisfinance.com, corp.axisfinance.com"
                                    value={form.allowedEmailDomains}
                                    onChange={(e) => updateField("allowedEmailDomains", e.target.value)}
                                    required
                                />
                                <span className="staff-muted">Comma-separated. Subdomains of a listed domain are included.</span>
                            </div>

                            <div className="staff-form-group">
                                <label>SAML binding</label>
                                <select
                                    value={form.samlBinding}
                                    onChange={(e) => updateField("samlBinding", e.target.value)}
                                >
                                    <option value="POST">HTTP POST</option>
                                    <option value="REDIRECT">HTTP Redirect</option>
                                </select>
                            </div>
                        </div>

                        <div className="saml-toggle-grid">
                            <label className="saml-enable-toggle">
                                <input
                                    type="checkbox"
                                    checked={form.allowUnsolicited}
                                    onChange={(e) => updateField("allowUnsolicited", e.target.checked)}
                                />
                                Allow unsolicited (IdP-initiated) sign-in
                            </label>

                            <label className="saml-enable-toggle">
                                <input
                                    type="checkbox"
                                    checked={form.signAuthnRequest}
                                    onChange={(e) => updateField("signAuthnRequest", e.target.checked)}
                                />
                                Sign AuthnRequest
                            </label>

                            <label className="saml-enable-toggle">
                                <input
                                    type="checkbox"
                                    checked={form.wantAssertionSigned}
                                    onChange={(e) => updateField("wantAssertionSigned", e.target.checked)}
                                />
                                Require signed assertion
                            </label>

                            <label className="saml-enable-toggle">
                                <input
                                    type="checkbox"
                                    checked={form.wantResponseSigned}
                                    onChange={(e) => updateField("wantResponseSigned", e.target.checked)}
                                />
                                Require signed response
                            </label>

                            <label className="saml-enable-toggle">
                                <input
                                    type="checkbox"
                                    checked={form.forceAuthn}
                                    onChange={(e) => updateField("forceAuthn", e.target.checked)}
                                />
                                Force re-authentication at the IdP
                            </label>
                        </div>
                    </div>
                </>
            )}

            <div className="staff-card">
                <div className="staff-actions-row">
                    {step === 1 && (
                        <button type="button" className="staff-btn staff-btn-primary" onClick={() => setStep(2)}>
                            Next: Attribute mapping &amp; options
                        </button>
                    )}
                    {step === 2 && (
                        <>
                            <button type="button" className="staff-btn" onClick={() => setStep(1)}>
                                Back
                            </button>
                            <button
                                type="button"
                                className="staff-btn staff-btn-primary"
                                onClick={handleTestAndSave}
                                disabled={saving}
                            >
                                {saving ? "Testing & saving..." : "Test & Save"}
                            </button>
                        </>
                    )}
                </div>
                <p className="staff-note">
                    {step === 1
                        ? "Continue to attribute mapping & options before testing and saving."
                        : "Re-fetches the IdP metadata (when a URL is on file), parses its certificate, and checks every required field before anything is persisted."}
                </p>

                {saveError && <div className="staff-error">{saveError}</div>}

                {result && (
                    <>
                        <div className={result.success ? "staff-success" : "staff-error"}>
                            {result.success ? "Saved." : "Not saved — see the checks below."}
                        </div>

                        <div className="staff-table-wrap">
                            <table className="staff-table">
                                <thead>
                                    <tr>
                                        <th>Check</th>
                                        <th>Result</th>
                                        <th>Detail</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.steps.map((step_, i) => (
                                        <tr key={i}>
                                            <td>{step_.name}</td>
                                            <td>
                                                <span
                                                    className={`staff-badge staff-badge-${step_.ok ? "success" : "danger"}`}
                                                >
                                                    {step_.ok ? "Passed" : "Failed"}
                                                </span>
                                            </td>
                                            <td>{step_.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SamlSettings;
