// One-off: move documents uploaded before the S3 cutover off local disk.
//
// Rows whose storage_path is still a local filesystem path (anything not under
// the configured S3_KEY_PREFIX) are uploaded to S3 and rewritten to hold the object key.
//
//   node scripts/migrate_uploads_to_s3.js --dry-run        count what would move
//   node scripts/migrate_uploads_to_s3.js                  upload + update rows
//   node scripts/migrate_uploads_to_s3.js --delete-local   ...and remove each local file once its row is updated
//
// Uses the same credential chain as the app (instance profile / role, or
// AWS_PROFILE locally). Safe to re-run: migrated rows are skipped.
require("dotenv").config({ quiet: true });
const fs = require("fs");
const db = require("../src/config/db");
const { storage, assertStorageConfigured } = require("../src/config/storage");
const { storeUploadedFile } = require("../src/services/fileStorage");

const dryRun = process.argv.includes("--dry-run");
const deleteLocal = process.argv.includes("--delete-local");

const run = async () => {
    assertStorageConfigured();

    const [rows] = await db.query(
        `SELECT document_id, document_name, mime_type, storage_path
         FROM documents
         WHERE storage_path IS NOT NULL AND storage_path NOT LIKE ?`,
        [`${storage.s3.keyPrefix}%`]
    );

    console.log(`${rows.length} document(s) still on local disk${dryRun ? " (dry run)" : ""}`);

    let migrated = 0;
    const missing = [];

    for (const row of rows) {
        if (!fs.existsSync(row.storage_path)) {
            missing.push(row.document_id);
            continue;
        }

        if (dryRun) {
            continue;
        }

        const stored = await storeUploadedFile({
            buffer: fs.readFileSync(row.storage_path),
            originalname: row.document_name,
            mimetype: row.mime_type || "application/octet-stream"
        });

        await db.query("UPDATE documents SET storage_path = ?, file_name = ?, hash_value = ? WHERE document_id = ?", [
            stored.key,
            stored.fileName,
            stored.sha256,
            row.document_id
        ]);

        if (deleteLocal) {
            fs.unlinkSync(row.storage_path);
        }

        migrated += 1;
    }

    console.log(`migrated: ${migrated}`);

    if (missing.length) {
        console.log(`local file missing for document_id(s): ${missing.join(", ")} — left untouched`);
    }
};

run()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
