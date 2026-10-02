// Undo the LAST successfully applied migration.
//
//   npm run rollback               shows what would be undone, changes nothing
//   npm run rollback -- --yes      actually runs it
//
// For a migration  V1.0.0__init.sql  the undo script is  V1.0.0__init.down.sql
// in this folder. After it succeeds, the migration's row is removed from the
// migrations table so `npm run migrate` can apply it again.
//
// DESTRUCTIVE: V1.0.0__init.down.sql drops every application table and its data.
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { loadCredentials } = require("../src/config/db");

// ---------- logging ----------
const stamp = () => new Date().toISOString();
const log = (msg) => console.log(`[${stamp()}] ${msg}`);
const fail = (msg) => console.error(`[${stamp()}] ERROR ${msg}`);

// ---------- SSL (same rules as migrate.js) ----------
const sslOptions = () => {
  if (String(process.env.DB_SSL).toLowerCase() !== "true") return undefined;
  if (process.env.DB_SSL_CA) {
    return { ca: fs.readFileSync(process.env.DB_SSL_CA, "utf8"), rejectUnauthorized: true };
  }
  return { ...require("aws-ssl-profiles"), rejectUnauthorized: true };
};

(async () => {
  const confirmed = process.argv.includes("--yes");
  const dbName = process.env.DB_NAME;
  if (!dbName) {
    fail("DB_NAME is not set in .env");
    process.exit(1);
  }

  let conn;
  try {
    const cfg = await loadCredentials();
    log(`Connecting to ${cfg.host}:${cfg.port} as ${cfg.user} (SSL ${sslOptions() ? "on" : "off"})`);
    conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: dbName,
      ssl: sslOptions(),
      multipleStatements: true,
      connectTimeout: 15000,
    });
  } catch (err) {
    fail(`Could not connect: ${err.message}`);
    process.exit(1);
  }

  try {
    // Find the most recent migration that succeeded.
    const [rows] = await conn.query(
      "SELECT id, script_name, executed_at FROM migrations WHERE status = 'success' ORDER BY id DESC LIMIT 1"
    );
    if (!rows.length) {
      log("Nothing to roll back: no successful migrations recorded.");
      return;
    }
    const last = rows[0];
    const downFile = last.script_name.replace(/\.sql$/, ".down.sql");
    const downPath = path.join(__dirname, downFile);

    if (!fs.existsSync(downPath)) {
      fail(`No undo script for ${last.script_name} (expected migrations/${downFile})`);
      process.exitCode = 1;
      return;
    }

    log(`Last migration: ${last.script_name} (applied ${last.executed_at.toISOString()})`);
    log(`Undo script:    ${downFile}`);

    // Dry run unless explicitly confirmed — this deletes data.
    if (!confirmed) {
      log(`DRY RUN. Re-run with --yes to execute ${downFile} against ${dbName}.`);
      return;
    }

    log(`START rollback of ${last.script_name}`);
    try {
      await conn.query(fs.readFileSync(downPath, "utf8"));
      // The down script keeps the migrations table, so forget the undone version.
      await conn.query("DELETE FROM migrations WHERE id = ?", [last.id]);
      log(`DONE  ${last.script_name} rolled back`);
    } catch (err) {
      fail(`Rollback failed: ${err.message}`);
      await conn.query("ROLLBACK").catch(() => {});
      await conn.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {}); // never leave checks off
      process.exitCode = 1;
    }
  } catch (err) {
    fail(err.message);
    process.exitCode = 1;
  } finally {
    await conn.end().catch(() => {});
    log("Connection closed.");
  }
})();
