// Diagnoses S3 upload problems without writing anything to the bucket.
//   npm run check:s3
// Run it on the same host (and with the same AWS_PROFILE, if any) as the backend.
const { HeadBucketCommand } = require("@aws-sdk/client-s3");
const { storage, assertStorageConfigured } = require("../src/config/storage");
const { createS3Client } = require("../src/services/fileStorage");

const { bucket, region, endpoint, keyPrefix } = storage.s3;

const hints = {
    CredentialsProviderError:
        "No AWS credentials found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env, or attach an instance/task role, or use an AWS_PROFILE.",
    PermanentRedirect: "The bucket is in a different region than S3_REGION.",
    NoSuchBucket: "No bucket with that name — check S3_BUCKET.",
    NotFound: "No bucket with that name, or it is in another region — check S3_BUCKET and S3_REGION.",
    Forbidden: "Credentials were found but the role cannot access this bucket — check the IAM policy and bucket policy.",
    AccessDenied: "Credentials were found but the role cannot access this bucket — check the IAM policy and bucket policy.",
    InvalidAccessKeyId: "The access key id is not valid — check AWS_ACCESS_KEY_ID.",
    SignatureDoesNotMatch: "The secret access key does not match the key id — check AWS_SECRET_ACCESS_KEY (no spaces or quotes).",
    ExpiredToken: "The credentials have expired — refresh them (e.g. `aws sso login`)."
};

(async () => {
    console.log(
        `bucket=${bucket} region=${region} prefix=${keyPrefix}${endpoint ? ` endpoint=${endpoint}` : ""} ` +
            `credentials=${storage.s3.credentials ? "access key from .env" : "SDK default chain (role/profile)"}`
    );

    try {
        assertStorageConfigured();
    } catch (error) {
        return console.log(`FAIL: ${error.message}`);
    }

    const client = createS3Client();

    try {
        const creds = await client.config.credentials();
        console.log(`1. credentials: OK (key id ${String(creds.accessKeyId).slice(0, 4)}…)`);
    } catch (error) {
        return console.log(`1. credentials: FAIL — ${error.name}\n   ${hints[error.name] || error.message}`);
    }

    try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        console.log("2. bucket reachable: OK");
        console.log(`   Uploads also need s3:PutObject on arn:aws:s3:::${bucket}/${keyPrefix}*`);
    } catch (error) {
        console.log(`2. bucket reachable: FAIL — ${error.name} (HTTP ${error.$metadata?.httpStatusCode})`);
        console.log(`   ${hints[error.name] || error.message}`);
    }
})();
