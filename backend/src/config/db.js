const mysql = require("mysql2/promise");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require("dotenv").config({ quiet: true });

// DB credentials come from AWS Secrets Manager. .env only names the secret:
//
//   DB_Secret_name   id/name of the secret (JSON). Recognised keys, first match wins:
//                      username | user | DB_USER
//                      password | DB_PASSWORD
//                      host | DB_HOST, port | DB_PORT, dbname | database | DB_NAME (all optional)
//   DB_HOST / DB_PORT / DB_NAME in .env, when set, override the secret's values
//   (so local dev can point at localhost while the secret describes RDS).
//   S3_REGION / AWS_REGION   region the secret lives in
//
// If DB_Secret_name is unset, DB_USER / DB_PASSWORD from .env are used (local dev).

const pick = (obj, keys) => {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return undefined;
};

async function loadCredentials() {
    const secretName = process.env.DB_Secret_name || process.env.DB_SECRET_NAME;
    if (!secretName) {
        return {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT),
        };
    }

    const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || process.env.S3_REGION,
    });
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretName.trim() }));
    if (!res.SecretString) throw new Error(`Secret "${secretName}" has no SecretString`);

    let s;
    try {
        s = JSON.parse(res.SecretString);
    } catch {
        throw new Error(`Secret "${secretName}" is not valid JSON`);
    }

    const user = pick(s, ["username", "user", "DB_USER"]);
    const password = pick(s, ["password", "DB_PASSWORD"]);
    if (!user || password === undefined) {
        throw new Error(`Secret "${secretName}" must contain a username and password`);
    }

    return {
        host: process.env.DB_HOST || pick(s, ["host", "DB_HOST"]),
        user,
        password,
        database: process.env.DB_NAME || pick(s, ["dbname", "database", "DB_NAME"]),
        port: Number(process.env.DB_PORT || pick(s, ["port", "DB_PORT"])),
    };
}

// The secret is fetched asynchronously, but callers `require` this module and
// use it synchronously, so the pool is created lazily on first use and every
// method waits for it.
let poolPromise;
function getPool() {
    if (!poolPromise) {
        poolPromise = loadCredentials()
            .then((cfg) =>
                mysql.createPool({
                    ...cfg,
                    waitForConnections: true,
                    connectionLimit: 10,
                    queueLimit: 0,
                })
            )
            .catch((err) => {
                poolPromise = undefined; // let the next call retry
                throw err;
            });
    }
    return poolPromise;
}

module.exports = {
    loadCredentials,
    getPool,
    query: async (...args) => (await getPool()).query(...args),
    execute: async (...args) => (await getPool()).execute(...args),
    getConnection: async (...args) => (await getPool()).getConnection(...args),
    end: async () => (poolPromise ? (await poolPromise).end() : undefined),
};
