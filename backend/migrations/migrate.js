// Node.js migration runner (mysql2 + dotenv + SSL).
//
//   npm run migrate                              apply every pending migrations/V*.sql, in version order
//   node migrations/migrate.js V1.0.0__init.sql  apply one file (name inside migrations/, or a path)
//   node migrations/migrate.js --force           re-run files already recorded as 'success'
//
// Credentials come from src/config/db.js: AWS Secrets Manager when DB_Secret_name
// is set, otherwise DB_HOST / DB_USER / DB_PASSWORD / DB_PORT from .env.
// SSL is controlled by DB_SSL / DB_SSL_CA (see .env.example).
//
// Each .sql file is idempotent. On failure the open transaction is rolled back
// and a 'failed' row is written to the migrations table (if it exists yet).
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { loadCredentials } = require("../src/config/db");

const MIGRATIONS_DIR = __dirname;

// ---------- logging ----------
const stamp = () => new Date().toISOString();
const log = (msg) => console.log(`[${stamp()}] ${msg}`);
const fail = (msg) => console.error(`[${stamp()}] ERROR ${msg}`);

// ---------- SSL ----------
// DB_SSL=true  -> verify the server certificate against the bundled AWS RDS CA list,
//                 or against the PEM file in DB_SSL_CA when that is set.
// DB_SSL=false -> plain connection (local MySQL only).
const sslOptions = () => {
  if (String(process.env.DB_SSL).toLowerCase() !== "true") return undefined;
  if (process.env.DB_SSL_CA) {
    return { ca: fs.readFileSync(process.env.DB_SSL_CA, "utf8"), rejectUnauthorized: true };
  }
  return { ...require("aws-ssl-profiles"), rejectUnauthorized: true };
};

// ---------- which files to run ----------
// "V1.0.0__init.sql" matches; "V1.0.0__init.down.sql" (rollback script) does not.
const isMigration = (f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f) && !f.endsWith(".down.sql");

// Sort by numeric version parts so V1.10.0 runs after V1.2.0.
const versionKey = (f) => f.match(/^V([\d.]+)__/)[1].split(".").map(Number);
const byVersion = (a, b) => {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  }
  return 0;
};

const versionOf = (file) => "V" + versionKey(file).join(".");

const alreadyApplied = async (conn, file) => {
  try {
    const [rows] = await conn.query(
      "SELECT 1 FROM migrations WHERE script_name = ? AND status = 'success' LIMIT 1",
      [file]
    );
    return rows.length > 0;
  } catch {
    return false; // migrations table (or the database) doesn't exist yet
  }
};

const recordFailure = async (conn, file, err) => {
  try {
    await conn.query(
      "INSERT INTO migrations (version, script_name, status, notes) VALUES (?, ?, 'failed', ?)",
      [versionOf(file), file, String(err.message).slice(0, 2000)]
    );
  } catch {
    // Failure happened before the migrations table existed; nothing to log to.
  }
};

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const target = args.find((a) => !a.startsWith("--"));

  // Resolve the file list.
  let files;
  if (target) {
    const full = path.isAbsolute(target) ? target : fs.existsSync(target) ? path.resolve(target) : path.join(MIGRATIONS_DIR, target);
    if (!fs.existsSync(full)) {
      fail(`Migration file not found: ${target}`);
      process.exit(1);
    }
    files = [full];
  } else {
    files = fs.readdirSync(MIGRATIONS_DIR).filter(isMigration).sort(byVersion).map((f) => path.join(MIGRATIONS_DIR, f));
  }
  if (!files.length) {
    log("No migration files found.");
    return;
  }

  // Connect WITHOUT a default database: Step 1 of the script creates it.
  // multipleStatements lets one query() run the whole file.
  let conn;
  try {
    const cfg = await loadCredentials();
    log(`Connecting to ${cfg.host}:${cfg.port} as ${cfg.user} (SSL ${sslOptions() ? "on" : "off"})`);
    conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      ssl: sslOptions(),
      multipleStatements: true,
      connectTimeout: 15000,
    });
  } catch (err) {
    fail(`Could not connect: ${err.message}`);
    process.exit(1);
  }

  try {
    // Select the database if it already exists, so the tracking-table checks work.
    // On a first run it doesn't exist yet; the script creates and USEs it itself.
    const dbName = process.env.DB_NAME;
    if (dbName) await conn.query(`USE \`${dbName.replace(/`/g, "")}\``).catch(() => {});

    for (const full of files) {
      const file = path.basename(full);
      if (!force && (await alreadyApplied(conn, file))) {
        log(`SKIP  ${file} (already applied)`);
        continue;
      }

      log(`START ${file}`);
      const t0 = Date.now();
      try {
        await conn.query(fs.readFileSync(full, "utf8"));
        log(`DONE  ${file} in ${Date.now() - t0} ms`);
      } catch (err) {
        fail(`${file} failed: ${err.message}`);
        // Undo the seed/tracking transaction if one is open. DDL already committed
        // is harmless to re-run because the script is idempotent.
        await conn.query("ROLLBACK").catch(() => {});
        log(`ROLLBACK issued for ${file}`);
        await recordFailure(conn, file, err);
        process.exitCode = 1;
        break; // never run later migrations after a failure
      }
    }
  } finally {
    await conn.end().catch(() => {});
    log("Connection closed.");
  }
})().catch((err) => {
  fail(err.stack || err.message);
  process.exit(1);
});
