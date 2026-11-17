"use strict";
const { catalog, validateValue } = require("./catalog");
const failure = (status, message) => Object.assign(new Error(message), { status });
function createConfiguration(pool) {
  async function read(db = pool) {
    const result = await db.query('SELECT key, value, "updatedAt" FROM app_settings WHERE key = ANY($1::text[])', [catalog.map(d => d.key)]);
    const rows = new Map(result.rows.map(r => [r.key, r]));
    return catalog.map(d => ({ ...d, value: rows.has(d.key) ? rows.get(d.key).value : d.default, updatedAt: rows.get(d.key)?.updatedAt || null, source: rows.has(d.key) ? "database" : "compatibility-default" }));
  }
  async function values() { return Object.fromEntries((await read()).map(d => [d.key, d.value])); }
  async function update({ key, value, previousValue, confirmed }, actor) {
    const def = catalog.find(d => d.key === key);
    if (!def) throw failure(400, "Paramètre inconnu.");
    let next; try { next = validateValue(def, value); } catch (e) { throw failure(400, e.message); }
    if (def.risk !== "safe" && confirmed !== true) throw failure(409, "Confirmez les zones affectées avant d’appliquer.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Also serializes first writes, where there is no row to lock yet.
      await client.query("SELECT pg_advisory_xact_lock(73482019)");
      const current = (await read(client)).find(d => d.key === key);
      if (JSON.stringify(current.value) !== JSON.stringify(previousValue)) throw failure(409, "Ce paramètre a changé. Actualisez avant de réessayer.");
      if (JSON.stringify(current.value) !== JSON.stringify(next)) {
        await client.query('INSERT INTO app_settings(key,value,"updatedAt") VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=NOW()', [key, JSON.stringify(next)]);
        await client.query('INSERT INTO audit_logs("actorId","actorUsername","actorRole",action,"entityType","entityId",details,"createdAt") VALUES($1,$2,$3,\'update\',\'setting\',$4,$5::jsonb,NOW())', [actor.sub, actor.username, actor.role, key, JSON.stringify({ before: current.value, after: next, risk: def.risk, area: def.area, schemaVersion: 1 })]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  }
  function guard(key) {
    return async (req, res, next) => {
      try { if ((await values())[key] === false) return res.status(403).json({ error: "Capacité désactivée dans le Centre de contrôle.", feature: key }); next(); }
      catch (e) { next(e); }
    };
  }
  return { read, values, update, guard };
}
module.exports = { createConfiguration };
