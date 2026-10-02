require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

(async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "..", "Documents", "whistleblower_management_schema.sql"),
    "utf8"
  );

  const db = require("../src/config/db");
  const cfg = (await db.getPool()).pool.config.connectionConfig;
  await db.end();
  const conn = await mysql.createConnection({
    host: cfg.host,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log("Schema applied successfully.");
  } catch (err) {
    console.error("Schema apply failed:", err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
