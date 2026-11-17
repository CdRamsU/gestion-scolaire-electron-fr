// Clôture de caisse journalière — endpoints + table dédiée.
// GET  /api/closures?limit=60        → historique (récent d'abord)
// POST /api/closures                 → enregistre une clôture
function registerClosuresRoutes(app, deps) {
  const { requireAuth, requireRole, run, all, writeAudit, BUSINESS_TIMEZONE = "Africa/Lubumbashi" } = deps;

  const ready = (async () => {
    await run(`
      CREATE TABLE IF NOT EXISTS cash_closures (
        id BIGSERIAL PRIMARY KEY,
        "closureDate" DATE NOT NULL,
        "cashierUsername" TEXT NOT NULL,
        "inUsd" NUMERIC NOT NULL DEFAULT 0,
        "inCdf" NUMERIC NOT NULL DEFAULT 0,
        "outUsd" NUMERIC NOT NULL DEFAULT 0,
        "outCdf" NUMERIC NOT NULL DEFAULT 0,
        "expectedUsd" NUMERIC NOT NULL DEFAULT 0,
        "expectedCdf" NUMERIC NOT NULL DEFAULT 0,
        "countedUsd" NUMERIC NOT NULL DEFAULT 0,
        "countedCdf" NUMERIC NOT NULL DEFAULT 0,
        denominations JSONB,
        note TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS cash_closures_date_idx ON cash_closures ("closureDate")`);
  })().catch((err) => {
    console.error("[closures] init table failed:", String(err?.message || err));
  });

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  function businessDateISO(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (byType.year && byType.month && byType.day) {
      return `${byType.year}-${byType.month}-${byType.day}`;
    }
    return new Date(date).toISOString().slice(0, 10);
  }

  app.get("/api/closures", requireAuth, async (req, res) => {
    try {
      await ready;
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 60));
      const rows = await all(
        `SELECT id, to_char("closureDate", 'YYYY-MM-DD') AS "closureDate", "cashierUsername",
                "inUsd", "inCdf", "outUsd", "outCdf",
                "expectedUsd", "expectedCdf", "countedUsd", "countedCdf",
                denominations, note, "createdAt"
         FROM cash_closures
         ORDER BY "createdAt" DESC
         LIMIT ?`,
        [limit]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.post("/api/closures", requireAuth, requireRole("admin", "caissier", "comptable"), async (req, res) => {
    try {
      await ready;
      const b = req.body || {};
      const closureDate = businessDateISO();
      const cashier = String(req.auth?.username || "inconnu");
      let denominations = null;
      if (b.denominations && typeof b.denominations === "object") {
        try { denominations = JSON.stringify(b.denominations); } catch (_) { denominations = null; }
      }
      const note = String(b.note || "").slice(0, 500) || null;

      const row = {
        inUsd: toNum(b.inUsd), inCdf: toNum(b.inCdf),
        outUsd: toNum(b.outUsd), outCdf: toNum(b.outCdf),
        expectedUsd: toNum(b.expectedUsd), expectedCdf: toNum(b.expectedCdf),
        countedUsd: toNum(b.countedUsd), countedCdf: toNum(b.countedCdf)
      };

      await run(
        `INSERT INTO cash_closures
          ("closureDate", "cashierUsername",
           "inUsd", "inCdf", "outUsd", "outCdf",
           "expectedUsd", "expectedCdf", "countedUsd", "countedCdf",
           denominations, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
        [
          closureDate, cashier,
          row.inUsd, row.inCdf, row.outUsd, row.outCdf,
          row.expectedUsd, row.expectedCdf, row.countedUsd, row.countedCdf,
          denominations, note
        ]
      );
      await writeAudit({
        actorId: req.auth?.sub,
        actorUsername: cashier,
        actorRole: req.auth?.role,
        action: "create",
        entityType: "cash_closure",
        entityId: closureDate,
        details: {
          ...row,
          diffUsd: row.countedUsd - row.expectedUsd,
          diffCdf: row.countedCdf - row.expectedCdf
        }
      });
      res.json({ ok: true, closureDate, cashier });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}

module.exports = registerClosuresRoutes;
