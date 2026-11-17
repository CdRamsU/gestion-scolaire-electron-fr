"use strict";
const { version } = require("../package.json");
module.exports = function registerControlCenter(app, { configuration, pgPool, requireAuth, requireRole, getSchoolYearStartYearSetting, schoolYearLabelFromStartYear, getServerNetworkAddresses, BUSINESS_TIMEZONE }) {
  app.get("/api/configuration/runtime", requireAuth, async (req, res, next) => {
    try { res.set("Cache-Control", "no-store").json({ values: await configuration.values() }); } catch (e) { next(e); }
  });
  app.get("/api/configuration", requireAuth, requireRole("admin"), async (req, res, next) => {
    try {
      const [settings, year, history] = await Promise.all([
        configuration.read(), getSchoolYearStartYearSetting(),
        pgPool.query('SELECT id,"entityId","actorUsername","createdAt",details FROM audit_logs WHERE "entityType"=\'setting\' ORDER BY "createdAt" DESC,id DESC LIMIT 20')
      ]);
      res.set("Cache-Control", "no-store").json({ settings, schoolYear: schoolYearLabelFromStartYear(year), version, database: "connected", backup: "unknown", addresses: getServerNetworkAddresses(), businessTimezone: BUSINESS_TIMEZONE, history: history.rows, checkedAt: new Date().toISOString() });
    } catch (e) { next(e); }
  });
  app.patch("/api/configuration", requireAuth, requireRole("admin"), async (req, res) => {
    try { await configuration.update(req.body || {}, req.auth); res.json({ ok: true }); }
    catch (e) { if (!e.status) console.error("Configuration update failed", e); res.status(e.status || 500).json({ error: e.status ? e.message : "Enregistrement impossible. Aucun changement appliqué." }); }
  });
};
