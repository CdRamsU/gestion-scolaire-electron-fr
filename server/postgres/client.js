// PostgreSQL client helper (NOT wired into runtime yet)
// Utilise les variables d'environnement PostgreSQL standard.
//
// Required env:
//   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// Optional:
//   PGSSL=true|false   (default false)

let Pool;
try {
  ({ Pool } = require("pg"));
} catch (err) {
  throw new Error(
    "Missing dependency 'pg'. Run: npm install pg (inside server/)."
  );
}

function isTrue(v) {
  return String(v || "").toLowerCase() === "true";
}

function makePool() {
  return new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "ecolepos",
    user: process.env.PGUSER || "ecolepos_user",
    password: process.env.PGPASSWORD || "ecolepos_pass",
    ssl: isTrue(process.env.PGSSL) ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PGPOOL_MAX || 20),
    idleTimeoutMillis: 30000,
    // Fail fast instead of queueing forever when the pool is exhausted or PG is
    // unreachable — a hung request looks like "API indisponible" to the app.
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000)
  });
}

module.exports = {
  makePool
};
