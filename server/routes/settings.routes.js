function registerSettingsRoutes(app, deps) {
  const {
    requireAuth,
    requireRole,
    getSchoolYearStartYearSetting,
    getLevelMonthlyDueSetting,
    schoolYearLabelFromStartYear,
    parseSchoolYearStartYear,
    run,
    writeAudit,
    invalidateSettingsRuntimeCache,
    purgeHotApiCache,
    normalizeLevelMonthlyDueConfig,
    recalculateLevelFeesEverywhere,
    snapshotExistingPaymentDues,
    ensureLevelMonthlyDueSettingForSchoolYear,
    all,
    normalizeFeeCode,
    normalizeFeeLabel,
    normalizeCurrency,
    normalizeBillingCycle,
    normalizeMonthKey,
    pgPool,
    get,
    ensureFeeTypesForSchoolYear
  } = deps;

  const PROTECTED_FEE_TYPE_CODES = new Set([
    "TUITION",
    "BUS",
    "ETAT_T1_PM",
    "ETAT_T2_PM",
    "ETAT_T3_PM",
    "ETAT_T1_78",
    "ETAT_T2_78",
    "ETAT_T3_78",
    "ETAT_T1_SEC_GENERAL",
    "ETAT_T2_SEC_GENERAL",
    "ETAT_T3_SEC_GENERAL",
    "ETAT_T1_SEC_TECH",
    "ETAT_T2_SEC_TECH",
    "ETAT_T3_SEC_TECH",
    "ETAT_MINERVAL",
    "ETAT_FRAIS_TECHNIQUE",
    "EXAMEN_ETAT_4E",
    "TENASOSP_8E",
    "ENROLEMENT_8E",
    "ENROLEMENT_4E"
  ]);
  const FEE_SCOPE_LEVELS = new Set(["maternelle", "primaire", "secondaire"]);
  const FEE_SCOPE_CLASSES_MAX = 80;
  const FEE_DISTRIBUTION_SETTING_PREFIX = "feeDistributionConfig";
  const DEFAULT_FEE_DISTRIBUTION_CONFIG = Object.freeze({
    admissionDeductionsUSD: {
      uniforme: 20,
      promo: 10,
      journalEcusson: 6
    },
    uniformeLevels: ["maternelle"],
    admissionPricesUSD: {
      maternelle: 40,
      primaire: 20,
      secondaire: 35,
      secondaire4eHLow: 20,
      secondaire4eHHigh: 35
    },
    minerval: {
      monthlyPriceUSD: 10,
      months: 10,
      fourthHMonths: 9
    },
    exchangeRateCDFPerUSD: 2400,
    fourthHClasses: [
      "4e H - Comm. & G.",
      "4e H - Coupe & C.",
      "4e H - Électricité",
      "4e H - Électronique",
      "4e H - Littéraire",
      "4e H - Méc. Auto",
      "4e H - Méc. Gén.",
      "4e H - Pédagogie",
      "4e H - Scientifique"
    ]
  });

  function parseFeeScopeLevel(rawValue, { allowEmpty = true } = {}) {
    const raw = String(rawValue ?? "").trim().toLowerCase();
    if (!raw || raw === "all" || raw === "tous") return allowEmpty ? null : undefined;
    if (FEE_SCOPE_LEVELS.has(raw)) return raw;
    return undefined;
  }

  function normalizeFeeScopeClasses(rawValue) {
    const values = Array.isArray(rawValue)
      ? rawValue
      : (typeof rawValue === "string" ? rawValue.split(/[,\n;|]+/g) : []);
    const out = [];
    const seen = new Set();
    for (const item of values) {
      const normalized = normalizeFeeLabel(item).replace(/\s+/g, " ").trim();
      if (!normalized) continue;
      const key = normalized
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    return out;
  }

  function normalizeFeeScopeLevels(rawValue, legacyLevel = null) {
    const values = Array.isArray(rawValue)
      ? rawValue
      : (typeof rawValue === "string" ? rawValue.split(/[,\n;|]+/g) : []);
    const out = [];
    for (const value of values) {
      const level = parseFeeScopeLevel(value, { allowEmpty: false });
      if (level && !out.includes(level)) out.push(level);
    }
    const legacy = parseFeeScopeLevel(legacyLevel, { allowEmpty: false });
    if (!out.length && legacy) out.push(legacy);
    return out;
  }

  function normalizeFeePricingRules(rawValue) {
    let values = rawValue;
    if (typeof rawValue === "string") {
      try {
        const parsed = JSON.parse(rawValue);
        values = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        values = [];
      }
    }
    if (!Array.isArray(values)) return [];
    const out = [];
    const seen = new Set();
    for (const item of values) {
      if (!item || typeof item !== "object") continue;
      const targetType = String(item.targetType || item.target_type || "").trim().toLowerCase();
      const level = parseFeeScopeLevel(item.level || item.scopeLevel || item.scope_level, { allowEmpty: false });
      const className = targetType === "class"
        ? normalizeFeeLabel(item.className || item.class || item.class_label).replace(/\s+/g, " ").trim()
        : "";
      const amount = Number(item.amount ?? item.defaultAmount ?? item.value ?? NaN);
      if ((targetType !== "level" && targetType !== "class") || !level) continue;
      if (targetType === "class" && !className) continue;
      if (!Number.isFinite(amount) || amount < 0) continue;
      const key = `${targetType}|${level}|${className.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        targetType,
        level,
        className: className || null,
        amount
      });
    }
    return out;
  }

  function mapFeeTypeRow(row) {
    const scopeLevel = parseFeeScopeLevel(row?.scopeLevel, { allowEmpty: true });
    const scopeLevels = normalizeFeeScopeLevels(row?.scopeLevels, scopeLevel);
    const scopeClasses = normalizeFeeScopeClasses(row?.scopeClasses);
    const pricingRules = normalizeFeePricingRules(row?.pricingRules);
    return {
      id: row.id,
      code: row.code,
      labelFr: row.labelFr,
      defaultCurrency: row.defaultCurrency,
      defaultAmount: Number(row.defaultAmount || 0),
      billingCycle: normalizeBillingCycle(row.billingCycle),
      dueMonth: normalizeMonthKey(row.dueMonth) || null,
      hasFixedPrice: row.hasFixedPrice !== false,
      scopeLevel: scopeLevels[0] || null,
      scopeLevels,
      scopeClasses,
      pricingRules,
      skipAutoPrint: Boolean(row.skipAutoPrint),
      active: Boolean(row.active),
      createdAt: row.createdAt,
      schoolYearStartYear: row.schoolYearStartYear == null ? null : Number(row.schoolYearStartYear)
    };
  }

  function feeDistributionSettingKey(schoolYearStartYear) {
    const safeYear = parseSchoolYearStartYear(schoolYearStartYear);
    return safeYear ? `${FEE_DISTRIBUTION_SETTING_PREFIX}:${safeYear}` : FEE_DISTRIBUTION_SETTING_PREFIX;
  }

  function normalizeMoneySetting(value, fallback, { min = 0, max = 1000000 } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number(fallback || 0);
    return Math.min(max, Math.max(min, Number(n.toFixed(2))));
  }

  function normalizeIntegerSetting(value, fallback, { min = 0, max = 120 } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number(fallback || 0);
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  function normalizeDistributionLevelList(value) {
    const values = Array.isArray(value)
      ? value
      : (typeof value === "string" ? value.split(/[,\n;|]+/g) : []);
    const allowed = new Set(["maternelle", "primaire", "secondaire", "secondaire4eH"]);
    const out = [];
    for (const raw of values) {
      const key = String(raw || "").trim();
      if (allowed.has(key) && !out.includes(key)) out.push(key);
    }
    return out;
  }

  function normalizeDistributionClassList(value) {
    const values = Array.isArray(value)
      ? value
      : (typeof value === "string" ? value.split(/[\n;|]+/g) : []);
    const out = [];
    const seen = new Set();
    for (const raw of values) {
      const label = normalizeFeeLabel(raw).replace(/\s+/g, " ").trim();
      if (!label) continue;
      const key = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
      if (out.length >= 80) break;
    }
    return out;
  }

  function normalizeFeeDistributionConfig(input = {}) {
    const base = JSON.parse(JSON.stringify(DEFAULT_FEE_DISTRIBUTION_CONFIG));
    const src = input && typeof input === "object" ? input : {};
    const deductions = src.admissionDeductionsUSD || src.deductions || {};
    const prices = src.admissionPricesUSD || src.admissionPrices || {};
    const minerval = src.minerval || {};
    const uniformLevels = normalizeDistributionLevelList(src.uniformeLevels || src.uniformLevels);
    const fourthHClasses = normalizeDistributionClassList(src.fourthHClasses || src.fourthHClassList);
    return {
      admissionDeductionsUSD: {
        uniforme: normalizeMoneySetting(deductions.uniforme, base.admissionDeductionsUSD.uniforme, { max: 1000 }),
        promo: normalizeMoneySetting(deductions.promo, base.admissionDeductionsUSD.promo, { max: 1000 }),
        journalEcusson: normalizeMoneySetting(deductions.journalEcusson ?? deductions.journalEtEcusson, base.admissionDeductionsUSD.journalEcusson, { max: 1000 })
      },
      uniformeLevels: uniformLevels.length ? uniformLevels : base.uniformeLevels.slice(),
      admissionPricesUSD: {
        maternelle: normalizeMoneySetting(prices.maternelle, base.admissionPricesUSD.maternelle, { max: 1000 }),
        primaire: normalizeMoneySetting(prices.primaire, base.admissionPricesUSD.primaire, { max: 1000 }),
        secondaire: normalizeMoneySetting(prices.secondaire, base.admissionPricesUSD.secondaire, { max: 1000 }),
        secondaire4eHLow: normalizeMoneySetting(prices.secondaire4eHLow ?? prices["4eHLow"], base.admissionPricesUSD.secondaire4eHLow, { max: 1000 }),
        secondaire4eHHigh: normalizeMoneySetting(prices.secondaire4eHHigh ?? prices["4eHHigh"], base.admissionPricesUSD.secondaire4eHHigh, { max: 1000 })
      },
      minerval: {
        monthlyPriceUSD: normalizeMoneySetting(minerval.monthlyPriceUSD ?? minerval.pricePerStudentPerMonthUSD, base.minerval.monthlyPriceUSD, { max: 1000 }),
        months: normalizeIntegerSetting(minerval.months ?? minerval.numberOfMonths, base.minerval.months, { min: 1, max: 12 }),
        fourthHMonths: normalizeIntegerSetting(minerval.fourthHMonths ?? minerval.months4eH ?? minerval.secondaire4eHMonths, base.minerval.fourthHMonths, { min: 1, max: 12 })
      },
      exchangeRateCDFPerUSD: normalizeMoneySetting(src.exchangeRateCDFPerUSD ?? src.taux ?? src.rate, base.exchangeRateCDFPerUSD, { min: 1, max: 1000000 }),
      fourthHClasses: fourthHClasses.length ? fourthHClasses : base.fourthHClasses.slice()
    };
  }

  async function readFeeDistributionConfig(schoolYearStartYear) {
    const key = feeDistributionSettingKey(schoolYearStartYear);
    try {
      const row = await get(
        `SELECT value FROM app_settings WHERE key IN (?, ?) ORDER BY CASE WHEN key = ? THEN 0 ELSE 1 END LIMIT 1`,
        [key, FEE_DISTRIBUTION_SETTING_PREFIX, key]
      );
      if (row && row.value != null) {
        const val = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        return normalizeFeeDistributionConfig(val);
      }
    } catch (_) { /* ignore and return defaults */ }
    return normalizeFeeDistributionConfig();
  }

  function normalizeFeeDueMonth(rawValue, schoolYearStartYear) {
    if (rawValue == null || String(rawValue).trim() === "") return null;
    const dueMonth = normalizeMonthKey(rawValue);
    const startYear = Number(schoolYearStartYear);
    if (!dueMonth || !Number.isFinite(startYear)) return undefined;
    const firstMonth = `${startYear}-09`;
    const lastMonth = `${startYear + 1}-08`;
    if (dueMonth < firstMonth || dueMonth > lastMonth) return undefined;
    return dueMonth;
  }

app.get("/api/settings", requireAuth, async (req, res) => {
  try {
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    const levelMonthlyDueUSD = await getLevelMonthlyDueSetting({ schoolYearStartYear });
    res.json({
      schoolYearStartYear,
      schoolYearLabel: schoolYearLabelFromStartYear(schoolYearStartYear),
      levelMonthlyDueUSD
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/settings/fee-distribution", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    const config = await readFeeDistributionConfig(schoolYearStartYear);
    res.json({
      ok: true,
      schoolYearStartYear,
      schoolYearLabel: schoolYearLabelFromStartYear(schoolYearStartYear),
      config
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch("/api/settings/fee-distribution", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    const before = await readFeeDistributionConfig(schoolYearStartYear);
    const next = normalizeFeeDistributionConfig({
      ...before,
      ...(req.body?.config && typeof req.body.config === "object" ? req.body.config : req.body)
    });
    const key = feeDistributionSettingKey(schoolYearStartYear);
    await run(
      `INSERT INTO app_settings (key, value, "updatedAt")
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [key, JSON.stringify(next)]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update",
      entityType: "setting",
      entityId: key,
      details: { schoolYearStartYear, before, after: next }
    });
    invalidateSettingsRuntimeCache();
    purgeHotApiCache();
    res.json({
      ok: true,
      schoolYearStartYear,
      schoolYearLabel: schoolYearLabelFromStartYear(schoolYearStartYear),
      config: next
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch("/api/settings", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const nextStartYear = parseSchoolYearStartYear(
      req.body?.schoolYearStartYear ?? req.body?.schoolYear
    );
    if (!nextStartYear) {
      return res.status(400).json({ error: "schoolYear doit être au format YYYY-YYYY (ex: 2025-2026)" });
    }

    const before = await getSchoolYearStartYearSetting();
    await run(
      `INSERT INTO app_settings (key, value, "updatedAt")
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      ["schoolYearStartYear", JSON.stringify({ startYear: nextStartYear })]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update",
      entityType: "setting",
      entityId: "schoolYearStartYear",
      details: {
        before: schoolYearLabelFromStartYear(before),
        after: schoolYearLabelFromStartYear(nextStartYear)
      }
    });
    await ensureFeeTypesForSchoolYear(nextStartYear, { sourceSchoolYearStartYear: before || null });
    await ensureLevelMonthlyDueSettingForSchoolYear(nextStartYear, before || null);
    invalidateSettingsRuntimeCache();
    purgeHotApiCache();
    res.json({
      ok: true,
      schoolYearStartYear: nextStartYear,
      schoolYearLabel: schoolYearLabelFromStartYear(nextStartYear)
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* ===== Catégories d'abonnement bus (liste gérée) ===== */
const BUS_CATEGORIES_KEY = "bus_categories";

function normalizeBusCategoryList(input) {
  const arr = Array.isArray(input)
    ? input
    : (typeof input === "string" ? input.split(/[\n;,]+/) : []);
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const name = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!name) continue;
    if (name.length > 60) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 60) break;
  }
  return out;
}

async function readBusCategories() {
  try {
    const row = await get(`SELECT value FROM app_settings WHERE key = ?`, [BUS_CATEGORIES_KEY]);
    if (row && row.value != null) {
      const val = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      return normalizeBusCategoryList(val?.categories ?? val);
    }
  } catch (_) { /* ignore */ }
  return [];
}

// Lecture : tous les rôles connectés (utilisée par le formulaire d'abonnement et le rapport).
app.get("/api/bus-categories", requireAuth, requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    res.json({ categories: await readBusCategories() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Écriture : admin uniquement.
app.put("/api/bus-categories", requireAuth, requireRole("admin", "caissier"), async (req, res) => {
  try {
    const before = await readBusCategories();
    const next = normalizeBusCategoryList(req.body?.categories ?? req.body);
    await run(
      `INSERT INTO app_settings (key, value, "updatedAt")
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [BUS_CATEGORIES_KEY, JSON.stringify({ categories: next })]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update",
      entityType: "setting",
      entityId: BUS_CATEGORIES_KEY,
      details: { before, after: next }
    });
    res.json({ categories: next });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch("/api/settings/level-fees", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    const before = await getLevelMonthlyDueSetting({ schoolYearStartYear });
    const recalculateExisting = req.body?.recalculateExisting !== false;
    const hasAnyInput = ["maternelle", "primaire", "secondaire", "secondaire4eH", "monthlyOverrides"].some((k) =>
      Object.prototype.hasOwnProperty.call(req.body || {}, k)
    );
    if (!hasAnyInput) {
      return res.status(400).json({ error: "Veuillez fournir maternelle, primaire, secondaire ou secondaire4eH." });
    }
    const next = normalizeLevelMonthlyDueConfig({
      ...before,
      maternelle: req.body?.maternelle,
      primaire: req.body?.primaire,
      secondaire: req.body?.secondaire,
      secondaire4eH: req.body?.secondaire4eH,
      monthlyOverrides: Object.prototype.hasOwnProperty.call(req.body || {}, "monthlyOverrides")
        ? req.body?.monthlyOverrides
        : before.monthlyOverrides
    });
    await snapshotExistingPaymentDues({ feeCode: "TUITION" });
    await run(
      `INSERT INTO app_settings (key, value, "updatedAt")
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [`levelMonthlyDueUSD:${schoolYearStartYear}`, JSON.stringify(next)]
    );
    let recalculation = null;
    if (recalculateExisting) {
      recalculation = await recalculateLevelFeesEverywhere({
        before,
        after: next,
        schoolYearStartYear
      });
    }
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update",
      entityType: "setting",
      entityId: `levelMonthlyDueUSD:${schoolYearStartYear}`,
      details: { schoolYearStartYear, before, after: next, recalculateExisting, recalculation }
    });
    invalidateSettingsRuntimeCache();
    purgeHotApiCache();
    res.json({ ok: true, levelMonthlyDueUSD: next, recalculation });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Fee types (shared across devices; admin manages defaults)
app.get("/api/fee-types", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "1";
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    await ensureFeeTypesForSchoolYear(schoolYearStartYear);
    const rows = await all(
      `SELECT id, code, "labelFr", "defaultCurrency", "defaultAmount", active, "createdAt",
              "billingCycle", "dueMonth", "hasFixedPrice", "scopeLevel", "scopeLevels", "scopeClasses", "pricingRules", "skipAutoPrint", "schoolYearStartYear"
       FROM fee_types
       WHERE "schoolYearStartYear" = ?
         ${includeInactive ? "" : "AND active = TRUE"}
       ORDER BY "labelFr" ASC`,
      [schoolYearStartYear]
    );
    res.json(rows.map(mapFeeTypeRow));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/fee-types", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    await ensureFeeTypesForSchoolYear(schoolYearStartYear);
    const code = normalizeFeeCode(req.body?.code || req.body?.labelFr);
    const labelFr = normalizeFeeLabel(req.body?.labelFr);
    const defaultCurrency = normalizeCurrency(req.body?.defaultCurrency) || "USD";
    const hasFixedPrice = req.body?.hasFixedPrice !== false;
    const defaultAmount = hasFixedPrice ? Number(req.body?.defaultAmount ?? 0) : 0;
    const billingCycle = normalizeBillingCycle(req.body?.billingCycle);
    const dueMonth = billingCycle === "annual"
      ? normalizeFeeDueMonth(req.body?.dueMonth, schoolYearStartYear)
      : null;
    const scopeLevels = normalizeFeeScopeLevels(req.body?.scopeLevels, req.body?.scopeLevel);
    const scopeLevel = scopeLevels[0] || null;
    const scopeClasses = normalizeFeeScopeClasses(req.body?.scopeClasses);
    const pricingRules = normalizeFeePricingRules(req.body?.pricingRules);
    const skipAutoPrint = Boolean(req.body?.skipAutoPrint ?? req.body?.skip_auto_print);
    if (!code) return res.status(400).json({ error: "code requis" });
    if (!labelFr) return res.status(400).json({ error: "labelFr requis" });
    if (!Number.isFinite(defaultAmount) || defaultAmount < 0) {
      return res.status(400).json({ error: "defaultAmount doit être >= 0" });
    }
    if (billingCycle === "annual" && code !== "TUITION" && dueMonth === null) {
      return res.status(400).json({ error: "dueMonth requis pour un frais annuel" });
    }
    if (dueMonth === undefined) return res.status(400).json({ error: "dueMonth invalide pour cette année scolaire" });
    if (scopeLevels.length > 3) return res.status(400).json({ error: "scopeLevels: maximum 3 niveaux" });
    if (scopeClasses.length > FEE_SCOPE_CLASSES_MAX) return res.status(400).json({ error: `scopeClasses: maximum ${FEE_SCOPE_CLASSES_MAX} classes` });
    if (pricingRules.length > 50) return res.status(400).json({ error: "pricingRules: maximum 50 regles" });
    const existingByCode = await get(
      `SELECT id FROM fee_types WHERE "schoolYearStartYear" = ? AND code = ?`,
      [schoolYearStartYear, code]
    );
    if (existingByCode?.id) {
      await snapshotExistingPaymentDues({ feeTypeId: Number(existingByCode.id) });
    }
    const inserted = await pgPool.query(
      `INSERT INTO fee_types ("schoolYearStartYear", code, "labelFr", "defaultCurrency", "defaultAmount", "billingCycle", "dueMonth", "hasFixedPrice", "scopeLevel", "scopeLevels", "scopeClasses", "pricingRules", "skipAutoPrint", active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,TRUE)
       ON CONFLICT ("schoolYearStartYear", code) DO UPDATE
         SET "labelFr" = EXCLUDED."labelFr",
             "defaultCurrency" = EXCLUDED."defaultCurrency",
              "defaultAmount" = EXCLUDED."defaultAmount",
              "billingCycle" = EXCLUDED."billingCycle",
              "dueMonth" = EXCLUDED."dueMonth",
              "hasFixedPrice" = EXCLUDED."hasFixedPrice",
              "scopeLevel" = EXCLUDED."scopeLevel",
              "scopeLevels" = EXCLUDED."scopeLevels",
             "scopeClasses" = EXCLUDED."scopeClasses",
             "pricingRules" = EXCLUDED."pricingRules",
             "skipAutoPrint" = EXCLUDED."skipAutoPrint",
             active = TRUE
       RETURNING id, code, "labelFr", "defaultCurrency", "defaultAmount", "billingCycle", "dueMonth", "hasFixedPrice", "scopeLevel", "scopeLevels", "scopeClasses", "pricingRules", "skipAutoPrint", active, "createdAt", "schoolYearStartYear"`,
      [schoolYearStartYear, code, labelFr, defaultCurrency, defaultAmount, billingCycle, dueMonth, hasFixedPrice, scopeLevel, scopeLevels, scopeClasses, JSON.stringify(pricingRules), skipAutoPrint]
    );
    const row = inserted.rows[0];
    await writeAudit({
      actorId: req.auth?.sub, actorUsername: req.auth?.username, actorRole: req.auth?.role,
      action: "upsert", entityType: "fee_type", entityId: String(row.id),
      details: { schoolYearStartYear, code, labelFr, defaultCurrency, defaultAmount, billingCycle, dueMonth, hasFixedPrice, scopeLevel, scopeLevels, scopeClasses, pricingRules, skipAutoPrint }
    });
    res.json(mapFeeTypeRow(row));
  } catch (e) {
    if (String(e.code || "") === "23505") return res.status(409).json({ error: "Ce code existe déjà" });
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/fee-types/:id", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    const existing = await get(
      `SELECT * FROM fee_types WHERE id = ? AND "schoolYearStartYear" = ?`,
      [id, schoolYearStartYear]
    );
    if (!existing) return res.status(404).json({ error: "Type de frais introuvable" });

    const code = req.body?.code != null ? normalizeFeeCode(req.body.code) : existing.code;
    const labelFr = req.body?.labelFr != null ? normalizeFeeLabel(req.body.labelFr) : existing.labelFr;
    const defaultCurrency = req.body?.defaultCurrency != null ? (normalizeCurrency(req.body.defaultCurrency) || existing.defaultCurrency) : existing.defaultCurrency;
    const hasFixedPrice = req.body?.hasFixedPrice != null ? Boolean(req.body.hasFixedPrice) : existing.hasFixedPrice !== false;
    const defaultAmount = hasFixedPrice
      ? (req.body?.defaultAmount != null ? Number(req.body.defaultAmount) : Number(existing.defaultAmount || 0))
      : 0;
    const billingCycle = req.body?.billingCycle != null ? normalizeBillingCycle(req.body.billingCycle) : normalizeBillingCycle(existing.billingCycle);
    const dueMonth = billingCycle === "annual"
      ? normalizeFeeDueMonth(
          Object.prototype.hasOwnProperty.call(req.body || {}, "dueMonth") ? req.body?.dueMonth : existing.dueMonth,
          schoolYearStartYear
        )
      : null;
    const scopeLevels = Object.prototype.hasOwnProperty.call(req.body || {}, "scopeLevels")
      || Object.prototype.hasOwnProperty.call(req.body || {}, "scopeLevel")
      ? normalizeFeeScopeLevels(req.body?.scopeLevels, req.body?.scopeLevel)
      : normalizeFeeScopeLevels(existing.scopeLevels, existing.scopeLevel);
    const scopeLevel = scopeLevels[0] || null;
    const scopeClasses = Object.prototype.hasOwnProperty.call(req.body || {}, "scopeClasses")
      ? normalizeFeeScopeClasses(req.body?.scopeClasses)
      : normalizeFeeScopeClasses(existing.scopeClasses);
    const pricingRules = Object.prototype.hasOwnProperty.call(req.body || {}, "pricingRules")
      ? normalizeFeePricingRules(req.body?.pricingRules)
      : normalizeFeePricingRules(existing.pricingRules);
    const hasSkipAutoPrintInput = Object.prototype.hasOwnProperty.call(req.body || {}, "skipAutoPrint")
      || Object.prototype.hasOwnProperty.call(req.body || {}, "skip_auto_print");
    const skipAutoPrint = hasSkipAutoPrintInput
      ? Boolean(req.body?.skipAutoPrint ?? req.body?.skip_auto_print)
      : Boolean(existing.skipAutoPrint);
    const active = req.body?.active != null ? Boolean(req.body.active) : Boolean(existing.active);
    if (!code || !labelFr) return res.status(400).json({ error: "code et labelFr sont requis" });
    if (!Number.isFinite(defaultAmount) || defaultAmount < 0) return res.status(400).json({ error: "defaultAmount doit être >= 0" });
    if (billingCycle === "annual" && code !== "TUITION" && dueMonth === null) {
      return res.status(400).json({ error: "dueMonth requis pour un frais annuel" });
    }
    if (dueMonth === undefined) return res.status(400).json({ error: "dueMonth invalide pour cette année scolaire" });
    if (scopeLevels.length > 3) return res.status(400).json({ error: "scopeLevels: maximum 3 niveaux" });
    if (scopeClasses.length > FEE_SCOPE_CLASSES_MAX) return res.status(400).json({ error: `scopeClasses: maximum ${FEE_SCOPE_CLASSES_MAX} classes` });
    if (pricingRules.length > 50) return res.status(400).json({ error: "pricingRules: maximum 50 regles" });

    await snapshotExistingPaymentDues({ feeTypeId: id });

    const updated = await pgPool.query(
      `UPDATE fee_types
       SET code = $1, "labelFr" = $2, "defaultCurrency" = $3, "defaultAmount" = $4, "billingCycle" = $5, "dueMonth" = $6, "hasFixedPrice" = $7, "scopeLevel" = $8, "scopeLevels" = $9, "scopeClasses" = $10, "pricingRules" = $11::jsonb, "skipAutoPrint" = $12, active = $13
       WHERE id = $14
       RETURNING id, code, "labelFr", "defaultCurrency", "defaultAmount", "billingCycle", "dueMonth", "hasFixedPrice", "scopeLevel", "scopeLevels", "scopeClasses", "pricingRules", "skipAutoPrint", active, "createdAt", "schoolYearStartYear"`,
      [code, labelFr, defaultCurrency, defaultAmount, billingCycle, dueMonth, hasFixedPrice, scopeLevel, scopeLevels, scopeClasses, JSON.stringify(pricingRules), skipAutoPrint, active, id]
    );
    const row = updated.rows[0];
    await writeAudit({
      actorId: req.auth?.sub, actorUsername: req.auth?.username, actorRole: req.auth?.role,
      action: "update", entityType: "fee_type", entityId: String(id),
      details: {
        before: {
          code: existing.code,
          labelFr: existing.labelFr,
          defaultCurrency: existing.defaultCurrency,
          defaultAmount: existing.defaultAmount,
          billingCycle: normalizeBillingCycle(existing.billingCycle),
          dueMonth: normalizeMonthKey(existing.dueMonth) || null,
          hasFixedPrice: existing.hasFixedPrice !== false,
          scopeLevel: normalizeFeeScopeLevels(existing.scopeLevels, existing.scopeLevel)[0] || null,
          scopeLevels: normalizeFeeScopeLevels(existing.scopeLevels, existing.scopeLevel),
          scopeClasses: normalizeFeeScopeClasses(existing.scopeClasses),
          pricingRules: normalizeFeePricingRules(existing.pricingRules),
          skipAutoPrint: Boolean(existing.skipAutoPrint),
          active: existing.active
        },
        after: { schoolYearStartYear, code, labelFr, defaultCurrency, defaultAmount, billingCycle, dueMonth, hasFixedPrice, scopeLevel, scopeLevels, scopeClasses, pricingRules, skipAutoPrint, active }
      }
    });
    res.json(mapFeeTypeRow(row));
  } catch (e) {
    if (String(e.code || "") === "23505") return res.status(409).json({ error: "Ce code existe déjà" });
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/fee-types/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide" });
    const schoolYearStartYear = await getSchoolYearStartYearSetting();
    const existing = await get(
      `SELECT * FROM fee_types WHERE id = ? AND "schoolYearStartYear" = ?`,
      [id, schoolYearStartYear]
    );
    if (!existing) return res.status(404).json({ error: "Type de frais introuvable" });

    const code = normalizeFeeCode(existing.code);
    if (PROTECTED_FEE_TYPE_CODES.has(code)) {
      return res.status(400).json({ error: "Type système protégé. Suppression non autorisée." });
    }

    // Suppression = désactivation : le frais disparaît des nouveaux paiements et de la liste
    // active, mais la ligne reste en base pour préserver l'historique des paiements et
    // l'isolation entre années scolaires. (Plus de refus quand le frais a déjà été utilisé.)
    await run(`UPDATE fee_types SET active = FALSE WHERE id = ?`, [id]);
    const outcome = "deactivated";
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "delete",
      entityType: "fee_type",
      entityId: String(id),
      details: {
        outcome,
        before: {
          schoolYearStartYear,
          code: existing.code,
          labelFr: existing.labelFr,
          defaultCurrency: existing.defaultCurrency,
          defaultAmount: existing.defaultAmount,
          billingCycle: normalizeBillingCycle(existing.billingCycle),
          scopeLevel: parseFeeScopeLevel(existing.scopeLevel, { allowEmpty: true }) || null,
          scopeClasses: normalizeFeeScopeClasses(existing.scopeClasses),
          active: Boolean(existing.active)
        },
        after: { schoolYearStartYear, active: false }
      }
    });
    res.json({ ok: true, id, outcome, active: false, labelFr: existing.labelFr });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
}

module.exports = registerSettingsRoutes;
