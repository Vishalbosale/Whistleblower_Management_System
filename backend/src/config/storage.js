require("dotenv").config({ quiet: true });

// The single place document storage is configured. Everything that touches S3
// or upload limits (services/fileStorage.js, middleware/upload.js, the scripts)
// reads from here — change a value in .env, or its default below, and it takes
// effect everywhere.
//
//   .env                  default      meaning
//   S3_BUCKET             (required)   bucket that holds every document
//   S3_REGION             (required)   e.g. ap-south-1 (a region, not a zone like ap-south-1a)
//   S3_KEY_PREFIX         documents/   folder inside the bucket
//   S3_ENCRYPTION         AES256       AES256 | aws:kms | none
//   S3_KMS_KEY_ID         (none)       only with S3_ENCRYPTION=aws:kms
//   S3_ENDPOINT           (none)       custom endpoint for MinIO / LocalStack in local dev
//   AWS_ACCESS_KEY_ID     (none)       access key for an IAM user limited to this bucket
//   AWS_SECRET_ACCESS_KEY (none)       its secret — set both or neither
//   AWS_SESSION_TOKEN     (none)       only for temporary credentials
//   UPLOAD_MAX_FILE_MB    25           largest single file
//   UPLOAD_MAX_FILES      10           files per request
//
// With no access key set, the AWS SDK resolves credentials itself — the
// instance/task role on AWS, or AWS_PROFILE (SSO) on a developer machine.
const env = (name, fallback) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "" ? fallback : value.trim();
};

const positiveInt = (name, fallback) => {
    const value = Number(env(name, fallback));
    return Number.isInteger(value) && value > 0 ? value : fallback;
};

// "docs" and "docs/" both mean the folder docs/.
const normalisePrefix = (prefix) => `${prefix.replace(/^\/+|\/+$/g, "")}/`;

const encryption = env("S3_ENCRYPTION", "AES256");

const accessKeyId = env("AWS_ACCESS_KEY_ID");
const secretAccessKey = env("AWS_SECRET_ACCESS_KEY");

const storage = {
    s3: {
        bucket: env("S3_BUCKET"),
        region: env("S3_REGION"),
        keyPrefix: normalisePrefix(env("S3_KEY_PREFIX", "documents")),
        // undefined = send no encryption header (bucket default applies)
        serverSideEncryption: encryption === "none" ? undefined : encryption,
        kmsKeyId: env("S3_KMS_KEY_ID"),
        endpoint: env("S3_ENDPOINT"),
        // undefined = let the SDK find a role / profile on its own
        credentials:
            accessKeyId && secretAccessKey
                ? { accessKeyId, secretAccessKey, sessionToken: env("AWS_SESSION_TOKEN") }
                : undefined
    },
    upload: {
        maxFileBytes: positiveInt("UPLOAD_MAX_FILE_MB", 25) * 1024 * 1024,
        maxFiles: positiveInt("UPLOAD_MAX_FILES", 10)
    }
};

// Throws a plain-language error if S3 is not configured. Called at boot so a
// missing setting stops the app there, not on the first upload.
const assertStorageConfigured = () => {
    const missing = [];

    if (!storage.s3.bucket) missing.push("S3_BUCKET");
    if (!storage.s3.region) missing.push("S3_REGION");

    if (missing.length) {
        throw new Error(`${missing.join(" and ")} must be set in .env — document uploads are stored in S3 only`);
    }

    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
        throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together");
    }

    if (!["AES256", "aws:kms", undefined].includes(storage.s3.serverSideEncryption)) {
        throw new Error('S3_ENCRYPTION must be "AES256", "aws:kms" or "none"');
    }
};

module.exports = { storage, assertStorageConfigured };
