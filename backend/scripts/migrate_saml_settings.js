// Idempotent DDL for ADFS SAML 2.0 authentication, replacing the earlier
// AD/LDAP config screen (which never reached the login path — see the old
// migrate_ad_settings.js, now removed). Safe to run repeatedly.
require("dotenv").config({ quiet: true });
const db = require("../src/config/db");

const migrate = async () => {
    console.log("Applying SAML settings migration...");

    // The AD screen was config-only and never wired to real login — nothing
    // downstream reads this table, so it's dropped outright rather than kept
    // dormant.
    await db.query("DROP TABLE IF EXISTS ad_settings");

    await db.query(`
        CREATE TABLE IF NOT EXISTS saml_settings (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
            is_enabled TINYINT(1) NOT NULL DEFAULT 0,

            idp_metadata_url VARCHAR(1000) NULL,
            idp_sign_on_url VARCHAR(1000) NULL,
            idp_entity_id VARCHAR(500) NULL,
            idp_signing_certs JSON NULL,

            mappings JSON NULL,
            allowed_email_domains VARCHAR(1000) NULL,

            saml_binding ENUM('POST', 'REDIRECT') NOT NULL DEFAULT 'POST',
            allow_unsolicited TINYINT(1) NOT NULL DEFAULT 1,
            sign_authn_request TINYINT(1) NOT NULL DEFAULT 0,
            want_assertion_signed TINYINT(1) NOT NULL DEFAULT 1,
            want_response_signed TINYINT(1) NOT NULL DEFAULT 0,
            force_authn TINYINT(1) NOT NULL DEFAULT 0,
            keep_local_password_login TINYINT(1) NOT NULL DEFAULT 1,

            -- The SP's own auto-generated signing keypair (see samlAuthService.js).
            -- Generated lazily on first use, not entered by the admin.
            sp_certificate TEXT NULL,
            sp_private_key_encrypted TEXT NULL,

            updated_by BIGINT UNSIGNED NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_saml_settings_singleton CHECK (id = 1),
            CONSTRAINT fk_saml_settings_updated_by FOREIGN KEY (updated_by)
                REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL
        )
    `);

    // The one row the controller always reads/writes — the CHECK constraint
    // above keeps a second row from ever being inserted alongside it.
    await db.query("INSERT IGNORE INTO saml_settings (id) VALUES (1)");

    console.log("SAML settings migration complete.");
};

module.exports = { migrate };

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Migration failed:", error);
            process.exit(1);
        });
}
