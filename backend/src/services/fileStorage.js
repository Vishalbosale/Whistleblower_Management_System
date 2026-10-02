const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { storage, assertStorageConfigured } = require("../config/storage");

// All document bytes live in S3 — nothing is written to local disk or the
// database. Only metadata and the object key (documents.storage_path) are kept
// in MySQL.
//
// Every setting (bucket, region, key prefix, encryption, endpoint) comes from
// config/storage.js — nothing is read from the environment here.
//
// Credentials: none are configured here. S3Client falls back to the default
// AWS credential chain, which on EC2/ECS/EKS resolves to the instance profile
// or task/IRSA role (locally: AWS_PROFILE / SSO). The role needs s3:PutObject
// and s3:GetObject on arn:aws:s3:::<bucket>/<S3_KEY_PREFIX>*.
const { s3 } = storage;

let client;

// The real cause (missing credentials, AccessDenied, wrong region) goes to the
// server log; the caller gets a clear 503 instead of an anonymous 500.
const storageUnavailable = (error) => {
    const wrapped = new Error("File storage is unavailable. Please try again or contact support.");
    wrapped.status = 503;
    wrapped.expose = true;
    wrapped.cause = error;
    console.error(`[s3] ${error.name}: ${error.message}`);
    return wrapped;
};

// The one place an S3 client is built (also used by scripts/check_s3.js), so
// credentials, region and endpoint can only ever come from config/storage.js.
const createS3Client = () => {
    assertStorageConfigured();

    return new S3Client({
        region: s3.region,
        // Only set when access keys are configured; otherwise the SDK's default
        // chain (instance/task role, AWS_PROFILE) applies.
        ...(s3.credentials ? { credentials: s3.credentials } : {}),
        // A custom endpoint (MinIO, LocalStack) needs path-style addressing.
        ...(s3.endpoint ? { endpoint: s3.endpoint, forcePathStyle: true } : {})
    });
};

const getClient = () => {
    client = client || createS3Client();
    return client;
};

// Uploads the in-memory file to S3 under a random key and returns what the
// documents row needs. The original filename is never part of the key.
const storeUploadedFile = async (file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `${s3.keyPrefix}${crypto.randomUUID()}${ext}`;
    const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

    try {
        await getClient().send(
            new PutObjectCommand({
                Bucket: s3.bucket,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
                ContentLength: file.buffer.length,
                ServerSideEncryption: s3.serverSideEncryption,
                SSEKMSKeyId: s3.serverSideEncryption === "aws:kms" ? s3.kmsKeyId : undefined,
                ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64")
            })
        );
    } catch (error) {
        throw storageUnavailable(error);
    }

    return { key, fileName: path.basename(key), sha256 };
};

// Sends a stored document to the client as a download. Returns false if the
// object no longer exists so the caller can answer 410.
const sendDocument = async (res, { key, name, mimeType }) => {
    let object;

    try {
        object = await getClient().send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
    } catch (error) {
        if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
            return false;
        }

        throw storageUnavailable(error);
    }

    // attachment() derives Content-Type from the filename, so the stored type
    // is applied after it.
    res.attachment(name);

    if (mimeType) {
        res.type(mimeType);
    }

    res.setHeader("X-Content-Type-Options", "nosniff");

    if (object.ContentLength !== undefined) {
        res.setHeader("Content-Length", object.ContentLength);
    }

    await new Promise((resolve, reject) => {
        object.Body.on("error", reject);
        res.on("close", resolve);
        object.Body.pipe(res);
    });

    return true;
};

module.exports = { createS3Client, storeUploadedFile, sendDocument };
