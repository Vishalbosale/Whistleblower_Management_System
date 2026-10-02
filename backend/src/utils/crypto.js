const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

// SECRET_ENCRYPTION_KEY can be any length — hashing it down to 32 bytes
// means the env var doesn't have to be an exact-size key itself.
const deriveKey = () => {
    const secret = process.env.SECRET_ENCRYPTION_KEY;

    if (!secret) {
        throw new Error("SECRET_ENCRYPTION_KEY is not set — required to store secrets (e.g. the SAML SP private key) at rest");
    }

    return crypto.createHash("sha256").update(secret).digest();
};

// Stored as iv:authTag:ciphertext (all hex) so it fits in one TEXT column.
const encryptSecret = (plaintext) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), ciphertext.toString("hex")].join(":");
};

const decryptSecret = (stored) => {
    const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
};

module.exports = { encryptSecret, decryptSecret };
