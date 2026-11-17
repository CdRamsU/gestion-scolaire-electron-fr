const https = require("https");
const { buildReturningStudentIdSet, buildReturningStudentMatches } = require("../student-returning");

// Merge only item-sale caisses; retain each currency and every cash movement.
function combineArticleCaisseRows(rows, articleBoxKeys) {
  const fields = ["count", "entreesUSD", "entreesCDF", "depensesUSD", "depensesCDF",
    "transfertInUSD", "transfertInCDF", "transfertOutUSD", "transfertOutCDF", "totalUSD", "totalCDF",
    "totalEntryUSD", "totalEntryCDF", "totalExitUSD", "totalExitCDF"];
  const result = [];
  let articles = null;
  for (const row of rows) {
    if (!articleBoxKeys.has(row.boxKey)) { result.push(row); continue; }
    if (!articles) {
      articles = { boxKey: "articles_vendus_groupes", boxLabel: "Articles vendus" };
      fields.forEach(field => { articles[field] = 0; });
      result.push(articles);
    }
    fields.forEach(field => { articles[field] += Number(row[field] || 0); });
  }
  return result;
}

function registerReportsRoutes(app, deps) {
  const {
    requireRole,
    get,
    all,
    normalizeMonthKey,
    getLevelMonthlyDueSetting,
    getStudentTuitionMonthlyDue,
    getStudentFeeExpectedForMonth,
    getStudentFeeMonthStatus,
    isBusSubscriptionActiveForMonth,
    normalizeCurrency,
    BUSINESS_TIMEZONE,
    getSchoolYearStartYearSetting,
    schoolYearLabelFromStartYear,
    getFeeTypeByCode,
    normalizeBillingCycle,
    run,
    writeAudit
  } = deps;

  function paymentTenderSplit(row) {
    const hasBreakdown = row?.amountUSDReceived != null || row?.amountCDFReceived != null;
    if (hasBreakdown) {
      return {
        usd: Math.max(0, Number(row?.amountUSDReceived || 0)),
        cdf: Math.max(0, Number(row?.amountCDFReceived || 0))
      };
    }
    const amount = Math.max(0, Number(row?.amount || 0));
    return normalizeCurrency(row?.currency) === "CDF" ? { usd: 0, cdf: amount } : { usd: amount, cdf: 0 };
  }

  function normalizeStudentNameForDuplicateCheck(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function levenshteinDistance(a, b) {
    const aa = String(a || "");
    const bb = String(b || "");
    if (!aa) return bb.length;
    if (!bb) return aa.length;
    const previous = Array.from({ length: bb.length + 1 }, (_, i) => i);
    for (let i = 1; i <= aa.length; i += 1) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= bb.length; j += 1) {
        const saved = previous[j];
        previous[j] = Math.min(
          previous[j] + 1,
          previous[j - 1] + 1,
          diagonal + (aa[i - 1] === bb[j - 1] ? 0 : 1)
        );
        diagonal = saved;
      }
    }
    return previous[bb.length];
  }

  function duplicateNameSimilarity(a, b) {
    const aa = normalizeStudentNameForDuplicateCheck(a);
    const bb = normalizeStudentNameForDuplicateCheck(b);
    if (!aa || !bb) return 0;
    if (aa === bb) return 1;
    const direct = 1 - (levenshteinDistance(aa, bb) / Math.max(aa.length, bb.length, 1));
    const sortedA = aa.split(" ").filter(Boolean).sort().join(" ");
    const sortedB = bb.split(" ").filter(Boolean).sort().join(" ");
    const reordered = 1 - (levenshteinDistance(sortedA, sortedB) / Math.max(sortedA.length, sortedB.length, 1));
    return Math.max(direct, reordered);
  }

  app.get("/api/reports/duplicate-students", requireRole("admin", "comptable", "caissier"), async (req, res) => {
    try {
      const schoolYearStartYear = await getSchoolYearStartYearSetting();
      const students = await all(
        `SELECT id, COALESCE(NULLIF("matricule", ''), id) AS matricule, "fullName", level, "className", "isActive"
         FROM students
         WHERE "schoolYearStartYear" = ?
         ORDER BY "fullName" ASC, id ASC`,
        [schoolYearStartYear]
      );
      const rows = [];
      for (let i = 0; i < students.length; i += 1) {
        for (let j = i + 1; j < students.length; j += 1) {
          const left = students[i];
          const right = students[j];
          const leftNormalized = normalizeStudentNameForDuplicateCheck(left.fullName);
          const rightNormalized = normalizeStudentNameForDuplicateCheck(right.fullName);
          if (!leftNormalized || !rightNormalized) continue;
          const exact = leftNormalized.split(" ").sort().join(" ") === rightNormalized.split(" ").sort().join(" ");
          const similarity = duplicateNameSimilarity(left.fullName, right.fullName);
          if (!exact && similarity < 0.82) continue;
          rows.push({
            matchType: exact ? "exact" : "similar",
            similarity: Number(similarity.toFixed(3)),
            left: {
              id: left.id,
              matricule: left.matricule,
              fullName: left.fullName,
              level: left.level,
              className: left.className,
              isActive: Number(left.isActive) !== 0
            },
            right: {
              id: right.id,
              matricule: right.matricule,
              fullName: right.fullName,
              level: right.level,
              className: right.className,
              isActive: Number(right.isActive) !== 0
            }
          });
        }
      }
      rows.sort((a, b) => {
        if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
        return b.similarity - a.similarity;
      });
      res.json({
        schoolYearStartYear,
        schoolYearLabel: schoolYearLabelFromStartYear(schoolYearStartYear),
        totalStudents: students.length,
        exactMatches: rows.filter((row) => row.matchType === "exact").length,
        similarMatches: rows.filter((row) => row.matchType === "similar").length,
        rows
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get("/api/reports/enrollment-stats", requireRole("admin", "comptable", "caissier"), async (req, res) => {
    try {
      const activeSchoolYear = await getSchoolYearStartYearSetting();
      const requestedYear = Number(req.query.schoolYearStartYear);
      const schoolYearStartYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
        ? requestedYear
        : activeSchoolYear;
      const students = await all(
        `SELECT s.id, s.matricule, s."fullName", s.sex, s."dateOfBirth", s."parentPhone", s."parentPhoneAlt",
                TO_CHAR(s."createdAt" AT TIME ZONE ?, 'YYYY-MM-DD') AS "enrollmentDate"
         FROM students s
         WHERE s."schoolYearStartYear" = ?
           AND COALESCE(s."isActive", TRUE) = TRUE`,
        [BUSINESS_TIMEZONE, schoolYearStartYear]
      );
      const previousStudents = await all(
        `SELECT id, matricule, "fullName", sex, "dateOfBirth", "parentPhone", "parentPhoneAlt"
         FROM students
         WHERE "schoolYearStartYear" = ?`,
        [schoolYearStartYear - 1]
      );
      const returningStudentIds = buildReturningStudentIdSet(students, previousStudents);
      const byDay = new Map();
      let returningStudents = 0;
      for (const student of students || []) {
        if (returningStudentIds.has(String(student.id))) {
          returningStudents += 1;
        }
        const day = String(student.enrollmentDate || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) byDay.set(day, Number(byDay.get(day) || 0) + 1);
      }
      const peak = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
      res.json({
        schoolYearStartYear,
        schoolYearLabel: schoolYearLabelFromStartYear(schoolYearStartYear),
        totalStudents: students.length,
        newStudents: students.length - returningStudents,
        returningStudents,
        highestEnrollmentDate: peak?.[0] || null,
        highestEnrollmentCount: Number(peak?.[1] || 0)
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  app.get("/api/reports/student-continuity", requireRole("admin", "comptable", "caissier"), async (req, res) => {
    try {
      const activeSchoolYear = await getSchoolYearStartYearSetting();
      const requestedYear = Number(req.query.schoolYearStartYear);
      const schoolYearStartYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
        ? requestedYear
        : activeSchoolYear;
      const selectIdentity = `id, COALESCE(NULLIF(matricule, ''), id) AS matricule, "fullName", sex,
        "dateOfBirth", "parentPhone", "parentPhoneAlt", level, "className", "isActive"`;
      const students = await all(
        `SELECT ${selectIdentity}
         FROM students
         WHERE "schoolYearStartYear" = ?
           AND COALESCE("isActive", TRUE) = TRUE
         ORDER BY "fullName" ASC, id ASC`,
        [schoolYearStartYear]
      );
      const previousStudents = await all(
        `SELECT ${selectIdentity}
         FROM students
         WHERE "schoolYearStartYear" = ?
         ORDER BY "fullName" ASC, id ASC`,
        [schoolYearStartYear - 1]
      );
      const matches = buildReturningStudentMatches(students, previousStudents);
      const summarizeStudent = (student) => student ? ({
        id: student.id,
        matricule: student.matricule || student.id,
        fullName: student.fullName,
        level: student.level,
        className: student.className,
        isActive: Number(student.isActive) !== 0
      }) : null;
      const rows = matches.map((match) => ({
        status: match.status,
        confidence: match.confidence,
        similarity: Number(match.score || 0),
        reason: match.reason,
        current: summarizeStudent(match.current),
        previous: summarizeStudent(match.previous)
      }));
      rows.sort((a, b) => {
        const order = { returning: 0, review: 1, new: 2 };
        const statusDiff = Number(order[a.status] ?? 9) - Number(order[b.status] ?? 9);
        if (statusDiff) return statusDiff;
        if (b.similarity !== a.similarity) return b.similarity - a.similarity;
        return String(a.current?.fullName || "").localeCompare(String(b.current?.fullName || ""), "fr", { sensitivity: "base" });
      });
      res.json({
        schoolYearStartYear,
        schoolYearLabel: schoolYearLabelFromStartYear(schoolYearStartYear),
        previousSchoolYearStartYear: schoolYearStartYear - 1,
        previousSchoolYearLabel: schoolYearLabelFromStartYear(schoolYearStartYear - 1),
        totalStudents: students.length,
        returningStudents: rows.filter((row) => row.status === "returning").length,
        newStudents: rows.filter((row) => row.status === "new").length,
        reviewStudents: rows.filter((row) => row.status === "review").length,
        rows
      });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  /* ===== Relances WhatsApp (API Cloud Meta) ===== */
  const WHATSAPP_CONFIG_KEY = "whatsapp_config";

  async function getWhatsappConfig(){
    let cfg = {};
    try{
      const row = await get(`SELECT value FROM app_settings WHERE key = ?`, [WHATSAPP_CONFIG_KEY]);
      if(row && row.value){ cfg = typeof row.value === "string" ? JSON.parse(row.value) : row.value; }
    }catch(_){ cfg = {}; }
    return {
      token: String(cfg.token || process.env.WHATSAPP_TOKEN || "").trim(),
      phoneId: String(cfg.phoneId || process.env.WHATSAPP_PHONE_ID || "").trim(),
      template: String(cfg.template || process.env.WHATSAPP_TEMPLATE || "").trim(),
      lang: String(cfg.lang || process.env.WHATSAPP_LANG || "fr").trim() || "fr"
    };
  }
  function whatsappConfigured(cfg){ return Boolean(cfg.token && cfg.phoneId && cfg.template); }

  // Envoie un message "template" à un numéro via l'API Cloud de Meta.
  function sendWhatsappTemplate(cfg, toPhone, params){
    return new Promise((resolve) => {
      const to = String(toPhone || "").replace(/[^\d]/g, ""); // chiffres uniquement, indicatif compris
      if(!to){ resolve({ ok: false, error: "numéro manquant" }); return; }
      const body = JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: cfg.template,
          language: { code: cfg.lang || "fr" },
          components: [{ type: "body", parameters: (params || []).map((t) => ({ type: "text", text: String(t == null ? "" : t) })) }]
        }
      });
      const req = https.request({
        method: "POST",
        hostname: "graph.facebook.com",
        path: `/v20.0/${encodeURIComponent(cfg.phoneId)}/messages`,
        headers: { "Authorization": `Bearer ${cfg.token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      }, (r) => {
        let data = ""; r.on("data", (c) => { data += c; });
        r.on("end", () => {
          if(r.statusCode >= 200 && r.statusCode < 300){ resolve({ ok: true }); }
          else { let e = data; try{ e = JSON.parse(data)?.error?.message || data; }catch(_){} resolve({ ok: false, error: `HTTP ${r.statusCode}: ${String(e).slice(0,160)}` }); }
        });
      });
      req.on("error", (e) => resolve({ ok: false, error: String(e.message || e) }));
      req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
      req.write(body); req.end();
    });
  }

  // Config (admin) — ne renvoie jamais le token en clair.
  app.get("/api/relances/whatsapp-config", requireRole("admin"), async (req, res) => {
    try{
      const cfg = await getWhatsappConfig();
      res.json({ configured: whatsappConfigured(cfg), phoneId: cfg.phoneId, template: cfg.template, lang: cfg.lang, hasToken: Boolean(cfg.token) });
    }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
  });

  app.patch("/api/relances/whatsapp-config", requireRole("admin"), async (req, res) => {
    try{
      const cur = await getWhatsappConfig();
      const next = {
        token: req.body?.token != null && String(req.body.token).trim() !== "" ? String(req.body.token).trim() : cur.token,
        phoneId: req.body?.phoneId != null ? String(req.body.phoneId).trim() : cur.phoneId,
        template: req.body?.template != null ? String(req.body.template).trim() : cur.template,
        lang: req.body?.lang != null ? String(req.body.lang).trim() || "fr" : cur.lang
      };
      await run(
        `INSERT INTO app_settings (key, value, "updatedAt") VALUES (?, ?::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
        [WHATSAPP_CONFIG_KEY, JSON.stringify(next)]
      );
      await writeAudit?.({ actorId: req.auth?.sub, actorUsername: req.auth?.username, actorRole: req.auth?.role,
        action: "update", entityType: "setting", entityId: WHATSAPP_CONFIG_KEY,
        details: { phoneId: next.phoneId, template: next.template, lang: next.lang, tokenSet: Boolean(next.token) } });
      res.json({ configured: whatsappConfigured(next), phoneId: next.phoneId, template: next.template, lang: next.lang, hasToken: Boolean(next.token) });
    }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
  });

  // Envoi groupé des relances pour un frais + mois donnés.
  app.post("/api/relances/send-whatsapp", requireRole("admin", "comptable"), async (req, res) => {
    try{
      const cfg = await getWhatsappConfig();
      if(!whatsappConfigured(cfg)){
        return res.json({ ok: false, configured: false, error: "WhatsApp non configuré (token, ID de numéro et modèle requis).", sent: 0, failed: 0, skipped: 0 });
      }
      let monthKey = normalizeMonthKey(req.body?.month);
      if(!monthKey) return res.status(400).json({ error: "month (YYYY-MM) requis" });
      const schoolYearStartYear = await getActiveSchoolYearStartYear();
      const code = String(req.body?.feeCode || "TUITION").trim().toUpperCase() || "TUITION";
      const feeType = await getFeeTypeByCode(code, { schoolYearStartYear });
      if(!feeType || normalizeBillingCycle(feeType.billingCycle) === "item"){
        return res.status(400).json({ error: "Frais invalide pour relance." });
      }
      monthKey = normalizeMonthKey(feeType.dueMonth) || monthKey;
      const onlyIds = Array.isArray(req.body?.studentIds) ? new Set(req.body.studentIds.map(String)) : null;
      const monthLabelFr = (() => {
        const m = Number(String(monthKey).split("-")[1] || 0);
        return ["","janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"][m] || monthKey;
      })();
      const students = await all(
        `SELECT * FROM students WHERE "schoolYearStartYear" = ? AND COALESCE("isActive", TRUE) = TRUE`,
        [schoolYearStartYear]
      );
      let sent = 0, failed = 0, skipped = 0; const errors = [];
      for(const s of students){
        if(onlyIds && !onlyIds.has(String(s.id))) continue;
        const st = await getStudentFeeMonthStatus({ student: s, feeType, monthKey });
        const remaining = Number(Number(st.remaining || 0).toFixed(2));
        const due = Number(Number(st.dueAmount || 0).toFixed(2));
        if(due <= 0.0049 || remaining <= 0.0049) continue; // pas en retard
        const phone = String(s.parentPhone || s.parentPhoneAlt || "").replace(/[^\d]/g, "");
        if(!phone){ skipped += 1; continue; }
        const amountTxt = `${remaining.toLocaleString("en-US",{maximumFractionDigits:2})} ${st.currency || "USD"}`;
        const r = await sendWhatsappTemplate(cfg, phone, [String(s.fullName || ""), String(feeType.labelFr || code), monthLabelFr, amountTxt]);
        if(r.ok) sent += 1; else { failed += 1; if(errors.length < 5) errors.push(`${s.fullName}: ${r.error}`); }
      }
      await writeAudit?.({ actorId: req.auth?.sub, actorUsername: req.auth?.username, actorRole: req.auth?.role,
        action: "send-relances-whatsapp", entityType: "relance", entityId: `${code}:${monthKey}`,
        details: { feeCode: code, monthKey, sent, failed, skipped } });
      res.json({ ok: true, configured: true, feeLabel: feeType.labelFr, monthKey, sent, failed, skipped, errors });
    }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
  });

  function normalizeSchoolYearStartYear(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const y = Math.floor(n);
    if (y < 2000 || y > 2100) return null;
    return y;
  }

  function buildSchoolYearMonthBounds(startYear) {
    const safeStartYear = normalizeSchoolYearStartYear(startYear);
    if (!safeStartYear) return null;
    return {
      startYear: safeStartYear,
      startMonth: `${safeStartYear}-09`,
      endMonth: `${safeStartYear + 1}-08`
    };
  }

  async function getActiveSchoolYearStartYear() {
    const configured = normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
    if (configured) return configured;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? year : (year - 1);
  }

  async function getActiveSchoolYearMonthBounds() {
    return buildSchoolYearMonthBounds(await getActiveSchoolYearStartYear());
  }

  const FEE_DISTRIBUTION_SETTING_PREFIX = "feeDistributionConfig";
  const DEFAULT_FEE_DISTRIBUTION_CONFIG = Object.freeze({
    admissionDeductionsUSD: { uniforme: 20, promo: 10, journalEcusson: 6 },
    uniformeLevels: ["maternelle"],
    admissionPricesUSD: {
      maternelle: 40,
      primaire: 20,
      secondaire: 35,
      secondaire4eHLow: 20,
      secondaire4eHHigh: 35
    },
    minerval: { monthlyPriceUSD: 10, months: 10, fourthHMonths: 9 },
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

  function distributionSettingKey(schoolYearStartYear) {
    const safeYear = normalizeSchoolYearStartYear(schoolYearStartYear);
    return safeYear ? `${FEE_DISTRIBUTION_SETTING_PREFIX}:${safeYear}` : FEE_DISTRIBUTION_SETTING_PREFIX;
  }

  function normalizeDistributionNumber(value, fallback, { min = 0, max = 1000000 } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number(fallback || 0);
    return Math.min(max, Math.max(min, Number(n.toFixed(2))));
  }

  function normalizeDistributionInteger(value, fallback, { min = 1, max = 12 } = {}) {
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
      const label = String(raw || "").replace(/\s+/g, " ").trim();
      if (!label) continue;
      const key = normalizeFeeLabelKey(label);
      if (!key || seen.has(key)) continue;
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
        uniforme: normalizeDistributionNumber(deductions.uniforme, base.admissionDeductionsUSD.uniforme, { max: 1000 }),
        promo: normalizeDistributionNumber(deductions.promo, base.admissionDeductionsUSD.promo, { max: 1000 }),
        journalEcusson: normalizeDistributionNumber(deductions.journalEcusson ?? deductions.journalEtEcusson, base.admissionDeductionsUSD.journalEcusson, { max: 1000 })
      },
      uniformeLevels: uniformLevels.length ? uniformLevels : base.uniformeLevels.slice(),
      admissionPricesUSD: {
        maternelle: normalizeDistributionNumber(prices.maternelle, base.admissionPricesUSD.maternelle, { max: 1000 }),
        primaire: normalizeDistributionNumber(prices.primaire, base.admissionPricesUSD.primaire, { max: 1000 }),
        secondaire: normalizeDistributionNumber(prices.secondaire, base.admissionPricesUSD.secondaire, { max: 1000 }),
        secondaire4eHLow: normalizeDistributionNumber(prices.secondaire4eHLow ?? prices["4eHLow"], base.admissionPricesUSD.secondaire4eHLow, { max: 1000 }),
        secondaire4eHHigh: normalizeDistributionNumber(prices.secondaire4eHHigh ?? prices["4eHHigh"], base.admissionPricesUSD.secondaire4eHHigh, { max: 1000 })
      },
      minerval: {
        monthlyPriceUSD: normalizeDistributionNumber(minerval.monthlyPriceUSD ?? minerval.pricePerStudentPerMonthUSD, base.minerval.monthlyPriceUSD, { max: 1000 }),
        months: normalizeDistributionInteger(minerval.months ?? minerval.numberOfMonths, base.minerval.months, { min: 1, max: 12 }),
        fourthHMonths: normalizeDistributionInteger(minerval.fourthHMonths ?? minerval.months4eH ?? minerval.secondaire4eHMonths, base.minerval.fourthHMonths, { min: 1, max: 12 })
      },
      exchangeRateCDFPerUSD: normalizeDistributionNumber(src.exchangeRateCDFPerUSD ?? src.taux ?? src.rate, base.exchangeRateCDFPerUSD, { min: 1, max: 1000000 }),
      fourthHClasses: fourthHClasses.length ? fourthHClasses : base.fourthHClasses.slice()
    };
  }

  async function readFeeDistributionConfig(schoolYearStartYear) {
    const key = distributionSettingKey(schoolYearStartYear);
    try {
      const row = await get(
        `SELECT value FROM app_settings WHERE key IN (?, ?) ORDER BY CASE WHEN key = ? THEN 0 ELSE 1 END LIMIT 1`,
        [key, FEE_DISTRIBUTION_SETTING_PREFIX, key]
      );
      if (row && row.value != null) {
        const val = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        return normalizeFeeDistributionConfig(val);
      }
    } catch (_) { /* defaults */ }
    return normalizeFeeDistributionConfig();
  }

  const BASE_CAISSE_BOX_DEFINITIONS = Object.freeze([
    { key: "minerval", label: "Minerval", codes: ["TUITION"] },
    { key: "bus", label: "Bus", codes: ["BUS"] },
    { key: "examen_etat_4e", label: "Examen d'Etat (4e)", codes: ["EXAMEN_ETAT_4E"] },
    { key: "enrolement_4e", label: "Frais d'enrolement (4e)", codes: ["ENROLEMENT_4E"] },
    { key: "enrolement_8e", label: "Frais d'enrolement (8e)", codes: ["ENROLEMENT_8E"] },
    { key: "frais_etat_tranches", label: "Frais de l'Etat + frais technique", codes: ["ETAT_FRAIS_TECHNIQUE"], codePrefixes: ["ETAT_T1_", "ETAT_T2_", "ETAT_T3_"] },
    { key: "tenasosp", label: "Frais TENASOSP", codes: ["TENASOSP_8E"] },
    { key: "fee_etat_minerval", label: "Minerval de l'Etat", codes: ["ETAT_MINERVAL"] }
  ]);
  const PARENT_CHANGE_COUNTERPARTY_BOX_KEY = "external_parent_change";
  const PARENT_CHANGE_TRANSFER_NOTE_PREFIX = "Change parent";

  function normalizeFeeLabelKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function isParentChangeTransferRecord(row = {}) {
    return String(row?.mode || "").trim().toLowerCase() === "exchange"
      && String(row?.counterpartyBoxKey || "").trim() === PARENT_CHANGE_COUNTERPARTY_BOX_KEY
      && normalizeFeeLabelKey(row?.note).startsWith(normalizeFeeLabelKey(PARENT_CHANGE_TRANSFER_NOTE_PREFIX));
  }

  function isTuitionFeeValue(value) {
    const raw = String(value || "").trim();
    const labelKey = normalizeFeeLabelKey(raw);
    return raw.toUpperCase() === "TUITION"
      || labelKey === "minerval"
      || labelKey === "frais de scolarite"
      || labelKey === "frais de scolaire"
      || labelKey === "frais scolaire"
      || /frais\s*(de\s*)?scola/.test(labelKey);
  }

  function caisseBoxMatchesFeeCode(box, feeCode) {
    const code = String(feeCode || "").trim().toUpperCase();
    if (!code || !box) return false;
    const directCodes = Array.isArray(box.codes) ? box.codes.map((entry) => String(entry || "").toUpperCase()) : [];
    if (directCodes.includes(code)) return true;
    const prefixes = Array.isArray(box.codePrefixes) ? box.codePrefixes.map((entry) => String(entry || "").toUpperCase()) : [];
    return prefixes.some((prefix) => prefix && code.startsWith(prefix));
  }

  function dynamicCaisseBoxKeyFromFeeCode(feeCode) {
    const code = String(feeCode || "").trim().toUpperCase();
    if (!code) return "";
    return `fee_${code.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
  }

  function dynamicCaisseBoxKeyFromLabel(label) {
    const normalized = normalizeFeeLabelKey(label).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized ? `fee_${normalized}` : "fee_autres";
  }

  async function getCaisseFeeContextForSchoolYear(schoolYearStartYear) {
    const targetYear = normalizeSchoolYearStartYear(schoolYearStartYear);
    const defs = BASE_CAISSE_BOX_DEFINITIONS.map((box) => ({ ...box }));
    const feeTypeRows = targetYear
      ? await all(
          `SELECT code, "labelFr"
           FROM fee_types
           WHERE "schoolYearStartYear" = ?
             AND active = TRUE
           ORDER BY id ASC`,
          [targetYear]
        )
      : [];
    const feeCodeByLabel = new Map();
    const knownCodes = new Set(["TUITION", "BUS"]);
    for (const row of feeTypeRows || []) {
      const code = String(row?.code || "").trim().toUpperCase();
      if (!code) continue;
      knownCodes.add(code);
      const labelKey = normalizeFeeLabelKey(row?.labelFr || "");
      if (labelKey) feeCodeByLabel.set(labelKey, code);
      const coveredByBase = defs.some((box) => caisseBoxMatchesFeeCode(box, code));
      if (coveredByBase) continue;
      const key = dynamicCaisseBoxKeyFromFeeCode(code);
      if (!key) continue;
      defs.push({
        key,
        label: String(row?.labelFr || code).trim() || code,
        codeTag: code,
        codes: [code],
        dynamic: true
      });
    }
    return { definitions: defs, feeCodeByLabel, knownCodes };
  }

  function resolvePaymentFeeCode(row, feeContext) {
    const directCode = String(row?.feeCode || row?.fee_type_code || "").trim().toUpperCase();
    if (directCode) return directCode;
    const rawFeeType = String(row?.feeType || row?.feeTypeLabel || "").trim();
    const uppercaseFeeType = rawFeeType.toUpperCase();
    if (uppercaseFeeType && feeContext?.knownCodes?.has(uppercaseFeeType)) return uppercaseFeeType;
    if (isTuitionFeeValue(rawFeeType)) return "TUITION";
    const byLabel = feeContext?.feeCodeByLabel?.get(normalizeFeeLabelKey(rawFeeType));
    return String(byLabel || "").trim().toUpperCase();
  }

  function feeDistributionLevelKey(levelValue, classValue, config) {
    const level = String(levelValue || "").trim().toLowerCase();
    const classKey = normalizeFeeLabelKey(classValue || "");
    const fourthHClasses = Array.isArray(config?.fourthHClasses) ? config.fourthHClasses : [];
    const matchesConfigured4eH = fourthHClasses.some((label) => {
      const target = normalizeFeeLabelKey(label);
      return target && (classKey === target || classKey.startsWith(`${target} `));
    });
    const matches4eH = level === "secondaire" && (matchesConfigured4eH || /^4e\s*h\b/.test(classKey));
    if (matches4eH) return "secondaire4eH";
    if (level === "maternelle") return "maternelle";
    if (level === "primaire") return "primaire";
    return "secondaire";
  }

  function emptyDistributionRows() {
    return [
      { key: "maternelle", label: "Maternelle" },
      { key: "primaire", label: "Primaire" },
      { key: "secondaire", label: "Secondaire" },
      { key: "secondaire4eH", label: "4e H" }
    ];
  }

  function roundMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(2));
  }

/**
 * Rapport de repartition des frais (annee scolaire active)
 */
app.get("/api/reports/fee-distribution", requireRole("admin"), async (req, res) => {
  try {
    const yearBounds = await getActiveSchoolYearMonthBounds();
    const requestedScope = String(req.query?.scope || "year").trim().toLowerCase();
    const requestedMonth = normalizeMonthKey(req.query?.month);
    const isMonthlyScope = requestedScope === "month" && requestedMonth
      && requestedMonth >= yearBounds.startMonth
      && requestedMonth <= yearBounds.endMonth;
    const bounds = isMonthlyScope
      ? { ...yearBounds, startMonth: requestedMonth, endMonth: requestedMonth }
      : yearBounds;
    const schoolYearStartYear = yearBounds.startYear;
    const config = await readFeeDistributionConfig(schoolYearStartYear);
    const taux = Math.max(1, Number(config.exchangeRateCDFPerUSD || 0) || 1);
    const schoolYearLabel = typeof schoolYearLabelFromStartYear === "function"
      ? schoolYearLabelFromStartYear(schoolYearStartYear)
      : `${schoolYearStartYear}-${schoolYearStartYear + 1}`;

    const baseAdmissionRows = emptyDistributionRows().map((row) => ({
      ...row,
      nbEleves: 0,
      recuUSD: 0,
      recuCDF: 0,
      totalEqUSD: 0,
      uniforme: 0,
      promo: 0,
      journalEcusson: 0,
      reste: 0
    }));
    const baseMinervalRows = emptyDistributionRows().map((row) => ({
      ...row,
      nbEleves: 0,
      nbMois: Number(row.key === "secondaire4eH" ? (config.minerval.fourthHMonths || 9) : (config.minerval.months || 10)),
      minervalAttendu: 0,
      recuUSD: 0,
      recuCDF: 0,
      recuEqUSD: 0,
      ecart: 0
    }));
    const admissionByKey = new Map(baseAdmissionRows.map((row) => [row.key, row]));
    const minervalByKey = new Map(baseMinervalRows.map((row) => [row.key, row]));

    const admissionRowsRaw = await all(
      `SELECT p.id, p.amount, p.currency, p."amountUSDReceived", p."amountCDFReceived", p."fxRate",
              COALESCE(p."paidForMonth", p."monthKey") AS "paidForMonth",
              COALESCE(p."levelSnapshot", s.level) AS level,
              COALESCE(p."classNameSnapshot", s."className") AS "className",
              COALESCE(ft.code, '') AS "feeCode",
              COALESCE(p."feeType", ft."labelFr", '') AS "feeType"
       FROM payments p
       LEFT JOIN students s ON s.id = p."studentId"
       LEFT JOIN fee_types ft ON ft.id = p."feeTypeId"
       WHERE COALESCE(p."paidForMonth", p."monthKey") >= ?
         AND COALESCE(p."paidForMonth", p."monthKey") <= ?
         AND p."cancelledAt" IS NULL
         AND p."paymentMethod" IS DISTINCT FROM 'staff_benefit'
         AND (
           COALESCE(ft.code, '') LIKE 'FRAIS_ADMIN%'
           OR COALESCE(p."feeType", '') ILIKE 'Frais Admin%'
           OR COALESCE(p."feeType", '') ILIKE 'Frais d%admission%'
         )`,
      [bounds.startMonth, bounds.endMonth]
    );

    for (const row of admissionRowsRaw || []) {
      const key = feeDistributionLevelKey(row.level, row.className, config);
      const target = admissionByKey.get(key) || admissionByKey.get("secondaire");
      const tender = paymentTenderSplit(row);
      target.nbEleves += 1;
      target.recuUSD += Number(tender.usd || 0);
      target.recuCDF += Number(tender.cdf || 0);
    }

    const uniformLevels = new Set(Array.isArray(config.uniformeLevels) ? config.uniformeLevels : []);
    for (const row of baseAdmissionRows) {
      const nb = Number(row.nbEleves || 0);
      row.recuUSD = roundMoney(row.recuUSD);
      row.recuCDF = roundMoney(row.recuCDF);
      row.totalEqUSD = roundMoney(row.recuUSD + (row.recuCDF / taux));
      row.uniforme = roundMoney((uniformLevels.has(row.key) ? Number(config.admissionDeductionsUSD.uniforme || 0) : 0) * nb);
      row.promo = roundMoney(Number(config.admissionDeductionsUSD.promo || 0) * nb);
      row.journalEcusson = roundMoney(Number(config.admissionDeductionsUSD.journalEcusson || 0) * nb);
      row.reste = roundMoney(row.totalEqUSD - row.uniforme - row.promo - row.journalEcusson);
    }
    const admissionTotal = {
      key: "total",
      label: "TOTAL",
      nbEleves: baseAdmissionRows.reduce((s, r) => s + Number(r.nbEleves || 0), 0),
      recuUSD: roundMoney(baseAdmissionRows.reduce((s, r) => s + Number(r.recuUSD || 0), 0)),
      recuCDF: roundMoney(baseAdmissionRows.reduce((s, r) => s + Number(r.recuCDF || 0), 0)),
      totalEqUSD: roundMoney(baseAdmissionRows.reduce((s, r) => s + Number(r.totalEqUSD || 0), 0)),
      uniforme: roundMoney(baseAdmissionRows.reduce((s, r) => s + Number(r.uniforme || 0), 0)),
      promo: roundMoney(baseAdmissionRows.reduce((s, r) => s + Number(r.promo || 0), 0)),
      journalEcusson: roundMoney(baseAdmissionRows.reduce((s, r) => s + Number(r.journalEcusson || 0), 0)),
      reste: roundMoney(baseAdmissionRows.reduce((s, r) => s + Number(r.reste || 0), 0))
    };

    const enrolledRows = await all(
      `SELECT id, level, "className"
       FROM students
       WHERE "schoolYearStartYear" = ?
         AND COALESCE("isActive", TRUE) = TRUE`,
      [schoolYearStartYear]
    );
    for (const student of enrolledRows || []) {
      const key = feeDistributionLevelKey(student.level, student.className, config);
      const target = minervalByKey.get(key) || minervalByKey.get("secondaire");
      target.nbEleves += 1;
    }

    const tuitionRowsRaw = await all(
      `SELECT p.id, p.amount, p.currency, p."amountUSDReceived", p."amountCDFReceived", p."fxRate",
              COALESCE(p."paidForMonth", p."monthKey") AS "paidForMonth",
              COALESCE(p."levelSnapshot", s.level) AS level,
              COALESCE(p."classNameSnapshot", s."className") AS "className",
              COALESCE(ft.code, '') AS "feeCode",
              COALESCE(p."feeType", ft."labelFr", '') AS "feeType"
       FROM payments p
       LEFT JOIN students s ON s.id = p."studentId"
       LEFT JOIN fee_types ft ON ft.id = p."feeTypeId"
       WHERE COALESCE(p."paidForMonth", p."monthKey") >= ?
         AND COALESCE(p."paidForMonth", p."monthKey") <= ?
         AND p."cancelledAt" IS NULL
         AND p."paymentMethod" IS DISTINCT FROM 'staff_benefit'
         AND (
           COALESCE(ft.code, '') = 'TUITION'
           OR COALESCE(p."feeType", '') ILIKE '%Minerval%'
           OR COALESCE(p."feeType", '') ILIKE 'Frais de scolarit%'
         )`,
      [bounds.startMonth, bounds.endMonth]
    );
    for (const row of tuitionRowsRaw || []) {
      const key = feeDistributionLevelKey(row.level, row.className, config);
      const target = minervalByKey.get(key) || minervalByKey.get("secondaire");
      const tender = paymentTenderSplit(row);
      target.recuUSD += Number(tender.usd || 0);
      target.recuCDF += Number(tender.cdf || 0);
    }

    const monthlyPrice = Number(config.minerval.monthlyPriceUSD || 0);
    const months = Number(config.minerval.months || 0);
    const fourthHMonths = Number(config.minerval.fourthHMonths || 9);
    for (const row of baseMinervalRows) {
      const rowMonths = isMonthlyScope ? 1 : (row.key === "secondaire4eH" ? fourthHMonths : months);
      row.nbMois = rowMonths;
      row.minervalAttendu = roundMoney(Number(row.nbEleves || 0) * monthlyPrice * rowMonths);
      row.recuUSD = roundMoney(row.recuUSD);
      row.recuCDF = roundMoney(row.recuCDF);
      row.recuEqUSD = roundMoney(row.recuUSD + (row.recuCDF / taux));
      row.ecart = roundMoney(row.recuEqUSD - row.minervalAttendu);
    }
    const minervalTotal = {
      key: "total",
      label: "TOTAL",
      nbEleves: baseMinervalRows.reduce((s, r) => s + Number(r.nbEleves || 0), 0),
      nbMois: isMonthlyScope ? 1 : (months === fourthHMonths ? months : null),
      nbMoisLabel: isMonthlyScope ? "1" : (months === fourthHMonths ? String(months) : `${months} / ${fourthHMonths}`),
      minervalAttendu: roundMoney(baseMinervalRows.reduce((s, r) => s + Number(r.minervalAttendu || 0), 0)),
      recuUSD: roundMoney(baseMinervalRows.reduce((s, r) => s + Number(r.recuUSD || 0), 0)),
      recuCDF: roundMoney(baseMinervalRows.reduce((s, r) => s + Number(r.recuCDF || 0), 0)),
      recuEqUSD: roundMoney(baseMinervalRows.reduce((s, r) => s + Number(r.recuEqUSD || 0), 0)),
      ecart: roundMoney(baseMinervalRows.reduce((s, r) => s + Number(r.ecart || 0), 0))
    };

    res.json({
      ok: true,
      scope: isMonthlyScope ? "month" : "year",
      requestedScope,
      month: isMonthlyScope ? requestedMonth : null,
      schoolYearStartYear,
      schoolYearLabel,
      startMonth: bounds.startMonth,
      endMonth: bounds.endMonth,
      schoolYearStartMonth: yearBounds.startMonth,
      schoolYearEndMonth: yearBounds.endMonth,
      settings: config,
      admissionFeeCodes: ["FRAIS_ADMIN", "FRAIS_ADMIN_PRI", "FRAIS_ADMIN_SEC", "FRAIS_ADMIN_4E_H"],
      minervalFeeCode: "TUITION",
      tables: {
        admission: {
          title: "Répartition Frais d'admission",
          rows: [...baseAdmissionRows, admissionTotal],
          totals: admissionTotal
        },
        minerval: {
          title: "Minerval",
          rows: [...baseMinervalRows, minervalTotal],
          totals: minervalTotal
        }
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Daily entries report (DB truth)
 * query: ?date=YYYY-MM-DD
 */
app.get("/api/reports/daily-entries", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const dateIso = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return res.status(400).json({ error: "date (YYYY-MM-DD) requis" });
    }

    const schoolYearBounds = await getActiveSchoolYearMonthBounds();
    const detailRows = await all(
      `SELECT p.id, p."receiptNo", p.amount, p.currency, p."amountUSDReceived", p."amountCDFReceived", p."fxRate", p."createdAt",
              COALESCE(p."levelSnapshot", s.level) AS level,
              COALESCE(p."feeType", ft."labelFr", 'Paiement') AS "feeType",
              COALESCE(p."paidForMonth", p."monthKey") AS "paidForMonth"
       FROM payments p
       LEFT JOIN students s ON s.id = p."studentId"
       LEFT JOIN fee_types ft ON ft.id = p."feeTypeId"
       WHERE (p."createdAt" AT TIME ZONE ?)::date = ?::date
         AND COALESCE(p."paidForMonth", p."monthKey") >= ?
         AND COALESCE(p."paidForMonth", p."monthKey") <= ?
         AND p."cancelledAt" IS NULL
         AND p."paymentMethod" IS DISTINCT FROM 'staff_benefit'
       ORDER BY p."createdAt" DESC, p.id DESC`,
      [BUSINESS_TIMEZONE, dateIso, schoolYearBounds.startMonth, schoolYearBounds.endMonth]
    );

    const details = detailRows.map((r) => {
      const amount = Number(r.amount || 0);
      const currency = normalizeCurrency(r.currency) || "USD";
      const fxRate = Number(r.fxRate || 0) || null;
      const tender = paymentTenderSplit(r);
      return {
        id: r.id,
        receiptNo: r.receiptNo || null,
        createdAt: r.createdAt || null,
        level: r.level || null,
        feeType: r.feeType || "Paiement",
        paidForMonth: normalizeMonthKey(r.paidForMonth) || null,
        amount,
        currency,
        amountUSD: tender.usd,
        amountCDF: tender.cdf,
        fxRate
      };
    });

    const grouped = new Map();
    for (const row of details) {
      const level = String(row.level || "secondaire");
      const feeType = String(row.feeType || "Paiement");
      const paidForMonth = row.paidForMonth || "—";
      const key = `${level}||${feeType}||${paidForMonth}`;
      const current = grouped.get(key) || {
        level,
        feeType,
        paidForMonth,
        count: 0,
        totalUSD: 0,
        totalCDF: 0
      };
      current.count += 1;
      current.totalUSD += Number(row.amountUSD || 0);
      current.totalCDF += Number(row.amountCDF || 0);
      grouped.set(key, current);
    }

    const aggregates = Array.from(grouped.values()).sort((a, b) => {
      const l = String(a.level || "").localeCompare(String(b.level || ""), "fr");
      if (l !== 0) return l;
      const f = String(a.feeType || "").localeCompare(String(b.feeType || ""), "fr");
      if (f !== 0) return f;
      return String(a.paidForMonth || "").localeCompare(String(b.paidForMonth || ""));
    });

    const totalEntries = details.length;
    const totalUSD = details.reduce((s, d) => s + Number(d.amountUSD || 0), 0);
    const totalCDF = details.reduce((s, d) => s + Number(d.amountCDF || 0), 0);

    res.json({
      date: dateIso,
      totalEntries,
      totalUSD,
      totalCDF,
      aggregates,
      details
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Daily entries by caisse
 * query: ?date=YYYY-MM-DD
 */
function dailyCaisseEntriesHandler({ combineArticles = false } = {}) {
  return async (req, res) => {
  try {
    const dateIso = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return res.status(400).json({ error: "date (YYYY-MM-DD) requis" });
    }

    const schoolYearBounds = await getActiveSchoolYearMonthBounds();
    const feeContext = await getCaisseFeeContextForSchoolYear(schoolYearBounds?.startYear);
    const detailRows = await all(
      `SELECT p.id, p."receiptNo", p.amount, p.currency, p."amountUSDReceived", p."amountCDFReceived", p."fxRate", p."createdAt",
              COALESCE(p."feeType", ft."labelFr", 'Paiement') AS "feeType",
              COALESCE(ft.code, '') AS "feeCode",
              COALESCE(p."paidForMonth", p."monthKey") AS "paidForMonth"
       FROM payments p
       LEFT JOIN fee_types ft ON ft.id = p."feeTypeId"
       WHERE (p."createdAt" AT TIME ZONE ?)::date = ?::date
         AND COALESCE(p."paidForMonth", p."monthKey") >= ?
         AND COALESCE(p."paidForMonth", p."monthKey") <= ?
         AND p."cancelledAt" IS NULL
         AND p."paymentMethod" IS DISTINCT FROM 'staff_benefit'
       ORDER BY p."createdAt" DESC, p.id DESC`,
      [BUSINESS_TIMEZONE, dateIso, schoolYearBounds.startMonth, schoolYearBounds.endMonth]
    );

    const details = [];
    for (const row of detailRows) {
      const feeType = String(row?.feeType || "Paiement").trim() || "Paiement";
      const feeCode = resolvePaymentFeeCode(row, feeContext);
      let box = feeContext.definitions.find((entry) => caisseBoxMatchesFeeCode(entry, feeCode)) || null;
      if (!box) {
        const fallbackKey = feeCode ? dynamicCaisseBoxKeyFromFeeCode(feeCode) : dynamicCaisseBoxKeyFromLabel(feeType);
        box = {
          key: fallbackKey,
          label: feeType || "Autres frais",
          dynamic: true
        };
      }
      const amount = Number(row?.amount || 0);
      const currency = normalizeCurrency(row?.currency) || "USD";
      const tender = paymentTenderSplit(row);
      details.push({
        id: row?.id ?? null,
        receiptNo: row?.receiptNo || null,
        createdAt: row?.createdAt || null,
        boxKey: box.key,
        boxLabel: box.label || "Caisse",
        feeCode: feeCode || null,
        feeType,
        paidForMonth: normalizeMonthKey(row?.paidForMonth) || null,
        amount,
        currency,
        amountUSD: tender.usd,
        amountCDF: tender.cdf,
        fxRate: Number(row?.fxRate || 0) || null
      });
    }

    // Solde du jour par caisse = entrées (paiements) − dépenses − transferts sortants + transferts entrants.
    const grouped = new Map();
    const labelForBox = (key) => {
      const def = feeContext.definitions.find((d) => d.key === key);
      return def ? def.label : (key || "Caisse");
    };
    const getBox = (key, label) => {
      const k = String(key || "autres");
      let cur = grouped.get(k);
      if (!cur) {
        cur = { boxKey: k, boxLabel: label || labelForBox(k),
          count: 0, entreesUSD: 0, entreesCDF: 0, depensesUSD: 0, depensesCDF: 0,
          transfertInUSD: 0, transfertInCDF: 0, transfertOutUSD: 0, transfertOutCDF: 0,
          totalUSD: 0, totalCDF: 0 };
        grouped.set(k, cur);
      }
      return cur;
    };
    // 1) Entrées (paiements)
    for (const row of details) {
      const box = getBox(row.boxKey, row.boxLabel);
      box.count += 1;
      box.entreesUSD += Number(row.amountUSD || 0);
      box.entreesCDF += Number(row.amountCDF || 0);
    }
    // 2) Dépenses du jour (sorties) par caisse
    const spendingRows = await all(
      `SELECT "caisseBoxKey", amount, currency FROM spending
       WHERE ("date" = ?::date OR ("createdAt" AT TIME ZONE ?)::date = ?::date)
         AND "schoolYearStartYear" = ?
         AND COALESCE(category, '') NOT ILIKE 'Paid - %'`,
      [dateIso, BUSINESS_TIMEZONE, dateIso, schoolYearBounds.startYear]
    ).catch(() => []);
    for (const sp of (spendingRows || [])) {
      const key = String(sp.caisseBoxKey || "").trim() || "minerval";
      const box = getBox(key);
      const amt = Number(sp.amount || 0);
      if (String(sp.currency).toUpperCase() === "CDF") box.depensesCDF += amt; else box.depensesUSD += amt;
    }
    // 3) Transferts / changes du jour : sortie de la source, entrée chez la contrepartie
    const transferRows = await all(
      `SELECT mode, "sourceBoxKey", "counterpartyBoxKey", "sourceCurrency", "sourceAmount", "counterCurrency", "counterAmount", note
       FROM caisse_transfers WHERE "date" = ?::date AND "schoolYearStartYear" = ?`,
      [dateIso, schoolYearBounds.startYear]
    ).catch(() => []);
    for (const tr of (transferRows || [])) {
      const isParentChange = isParentChangeTransferRecord(tr);
      const src = getBox(String(tr.sourceBoxKey || "").trim());
      const dst = isParentChange ? null : getBox(String(tr.counterpartyBoxKey || "").trim());
      const srcAmt = Number(tr.sourceAmount || 0);
      const srcCur = String(tr.sourceCurrency || "USD").toUpperCase();
      // Volet de base : la source perd sourceAmount, la contrepartie le reçoit (même devise).
      if (srcCur === "CDF") { src.transfertOutCDF += srcAmt; if (dst) dst.transfertInCDF += srcAmt; }
      else { src.transfertOutUSD += srcAmt; if (dst) dst.transfertInUSD += srcAmt; }
      // Volet d'échange : la contrepartie rend counterAmount à la source (devise de contrepartie).
      const mode = String(tr.mode || "").trim().toLowerCase();
      const counterCur = tr.counterCurrency ? String(tr.counterCurrency).toUpperCase() : null;
      const counterAmt = Number(tr.counterAmount || 0);
      if (mode === "exchange" && counterCur && counterAmt > 0) {
        if (counterCur === "CDF") { if (dst) dst.transfertOutCDF += counterAmt; src.transfertInCDF += counterAmt; }
        else { if (dst) dst.transfertOutUSD += counterAmt; src.transfertInUSD += counterAmt; }
      }
    }
    // 4) Net par caisse
    for (const box of grouped.values()) {
      box.totalEntryUSD = Number(box.entreesUSD || 0) + Number(box.transfertInUSD || 0);
      box.totalEntryCDF = Number(box.entreesCDF || 0) + Number(box.transfertInCDF || 0);
      box.totalExitUSD = Number(box.depensesUSD || 0) + Number(box.transfertOutUSD || 0);
      box.totalExitCDF = Number(box.depensesCDF || 0) + Number(box.transfertOutCDF || 0);
      box.totalUSD = box.entreesUSD - box.depensesUSD - box.transfertOutUSD + box.transfertInUSD;
      box.totalCDF = box.entreesCDF - box.depensesCDF - box.transfertOutCDF + box.transfertInCDF;
    }

    let aggregates = Array.from(grouped.values())
      .filter((b) => b.count > 0 || b.totalUSD !== 0 || b.totalCDF !== 0 ||
        b.depensesUSD || b.depensesCDF || b.transfertInUSD || b.transfertInCDF || b.transfertOutUSD || b.transfertOutCDF)
      .sort((a, b) => String(a.boxLabel || "").localeCompare(String(b.boxLabel || ""), "fr", { sensitivity: "base" }));
    if (combineArticles) {
      // Include inactive catalog entries: historical receipts and movements still count.
      const articleFees = await all(
        `SELECT code, "labelFr", "billingCycle" FROM fee_types WHERE "schoolYearStartYear" = ?`,
        [schoolYearBounds.startYear]
      );
      const articleBoxKeys = new Set();
      for (const fee of articleFees) {
        if (normalizeBillingCycle(fee.billingCycle) !== "item") continue;
        const code = String(fee.code || "").trim().toUpperCase();
        const box = feeContext.definitions.find(entry => caisseBoxMatchesFeeCode(entry, code));
        articleBoxKeys.add(box?.key || (code ? dynamicCaisseBoxKeyFromFeeCode(code) : dynamicCaisseBoxKeyFromLabel(fee.labelFr)));
      }
      aggregates = combineArticleCaisseRows(aggregates, articleBoxKeys);
    }
    const totalEntries = details.length;
    const totalUSD = aggregates.reduce((sum, b) => sum + Number(b.totalUSD || 0), 0);
    const totalCDF = aggregates.reduce((sum, b) => sum + Number(b.totalCDF || 0), 0);
    const totalEntryUSD = aggregates.reduce((sum, b) => sum + Number(b.totalEntryUSD || 0), 0);
    const totalEntryCDF = aggregates.reduce((sum, b) => sum + Number(b.totalEntryCDF || 0), 0);
    const totalExitUSD = aggregates.reduce((sum, b) => sum + Number(b.totalExitUSD || 0), 0);
    const totalExitCDF = aggregates.reduce((sum, b) => sum + Number(b.totalExitCDF || 0), 0);
    const enrolledThatDay = await get(
      `SELECT COUNT(*) AS count
       FROM students
       WHERE "schoolYearStartYear" = ?
         AND ("createdAt" AT TIME ZONE ?)::date = ?::date`,
      [schoolYearBounds.startYear, BUSINESS_TIMEZONE, dateIso]
    );
    const activeStudents = await get(
      `SELECT COUNT(*) AS count
       FROM students
       WHERE "schoolYearStartYear" = ?
         AND "isActive" = TRUE`,
      [schoolYearBounds.startYear]
    );

    res.json({
      date: dateIso,
      totalEntries,
      totalStudentsEnrolled: Number(enrolledThatDay?.count || 0),
      totalActiveStudents: Number(activeStudents?.count || 0),
      totalEntryUSD,
      totalEntryCDF,
      totalExitUSD,
      totalExitCDF,
      totalUSD,
      totalCDF,
      aggregates,
      ...(combineArticles ? {} : { details })
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
  };
}
app.get("/api/reports/daily-caisse-entries", requireRole("admin", "comptable", "caissier"), dailyCaisseEntriesHandler());
app.get("/api/reports/daily-caisse-articles-summary", requireRole("admin"), dailyCaisseEntriesHandler({ combineArticles: true }));

/**
 * Reports summary for a month
 * query: ?month=YYYY-MM
 */
app.get("/api/reports/summary", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const monthKey = normalizeMonthKey(req.query.month);
    if (!monthKey) return res.status(400).json({ error: "month (YYYY-MM) requis" });
    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const students = await all(
      `SELECT * FROM students WHERE "schoolYearStartYear" = ?`,
      [schoolYearStartYear]
    );
    const activeStudents = students.filter((s) => Number(s.isActive) !== 0);
    const busFeeType = await getFeeTypeByCode("BUS", { schoolYearStartYear });
    const tuitionFeeType = await getFeeTypeByCode("TUITION", { schoolYearStartYear });
    const busSubs = await all(`SELECT * FROM student_bus_subscription WHERE active = TRUE`);
    const busSubMap = new Map(busSubs.map((r) => [String(r.studentId), r]));
    const busPayments = busFeeType
      ? await all(
          `SELECT "studentId", amount, currency, "amountUSDReceived", "amountCDFReceived"
           FROM payments
           WHERE COALESCE("paidForMonth","monthKey") = ? AND "feeTypeId" = ? AND "cancelledAt" IS NULL`,
          [monthKey, busFeeType.id]
        )
      : [];
    const busPaidMap = new Map();
    const busTenderReceived = { usd: 0, cdf: 0 };
    for (const payment of busPayments) {
      const studentId = String(payment.studentId || "");
      busPaidMap.set(studentId, Number(busPaidMap.get(studentId) || 0) + Number(payment.amount || 0));
      const tender = paymentTenderSplit(payment);
      busTenderReceived.usd += Number(tender.usd || 0);
      busTenderReceived.cdf += Number(tender.cdf || 0);
    }
    // Prise en charge (personnel) : montant non-cash de tuition par élève pour ce mois.
    // Le "reçu" du résumé est en ESPÈCES uniquement -> on retranche ce montant.
    const benefitPaidRows = tuitionFeeType
      ? await all(
          `SELECT "studentId", COALESCE(SUM(amount), 0) AS paid
           FROM payments
           WHERE COALESCE("paidForMonth","monthKey") = ? AND "feeTypeId" = ? AND "paymentMethod" = 'staff_benefit'
           GROUP BY "studentId"`,
          [monthKey, tuitionFeeType.id]
        )
      : [];
    const benefitPaidMap = new Map(benefitPaidRows.map((p) => [String(p.studentId), Number(p.paid || 0)]));
    const tuitionCashRows = tuitionFeeType
      ? await all(
          `SELECT amount, currency, "amountUSDReceived", "amountCDFReceived"
           FROM payments
           WHERE COALESCE("paidForMonth","monthKey") = ?
             AND "feeTypeId" = ?
             AND "cancelledAt" IS NULL
             AND COALESCE("paymentMethod", '') <> 'staff_benefit'`,
          [monthKey, tuitionFeeType.id]
        )
      : [];
    const tuitionCashReceived = tuitionCashRows.reduce((sum, payment) => {
      const tender = paymentTenderSplit(payment);
      sum.usd += Number(tender.usd || 0);
      sum.cdf += Number(tender.cdf || 0);
      return sum;
    }, { usd: 0, cdf: 0 });
    const levelDueConfig = await getLevelMonthlyDueSetting({ schoolYearStartYear });

    const totalStudents = activeStudents.length;

    let paidAtLeastOnce = 0;
    let unpaidCount = 0;

    let totalIfAllPay = 0;

    const perLevel = {
      maternelle: { students: 0, totalIfAllPay: 0 },
      primaire: { students: 0, totalIfAllPay: 0 },
      secondaire: { students: 0, totalIfAllPay: 0 },
    };
    const busPerLevel = {
      maternelle: { subscribed: 0, expected: 0, collected: 0, remaining: 0 },
      primaire: { subscribed: 0, expected: 0, collected: 0, remaining: 0 },
      secondaire: { subscribed: 0, expected: 0, collected: 0, remaining: 0 },
    };
    let busExpected = 0;
    let busCollected = 0;
    let busRemaining = 0;

    const owingList = [];
    const busOwingList = [];
    const rows = [];

    for (const s of activeStudents) {
      const dueFallback = getStudentTuitionMonthlyDue(s, { levelDueConfig });
      const tuitionStatus = tuitionFeeType
        ? await getStudentFeeMonthStatus({ student: s, feeType: tuitionFeeType, monthKey })
        : {
            dueAmount: dueFallback,
            paidSoFar: 0,
            remaining: dueFallback,
            status: dueFallback > 0 ? "En retard" : "À jour",
            currency: normalizeCurrency(s.currency) || "USD"
          };
      const due = Number(tuitionStatus.dueAmount || 0);
      const fullPaid = Number(tuitionStatus.paidSoFar || 0);
      const benefitPaid = Number(benefitPaidMap.get(String(s.id)) || 0);
      // "reçu" affiché = ESPÈCES (on retire la prise en charge). Le statut/reste, lui,
      // reflète le RÈGLEMENT réel (prise en charge incluse) : l'élève couvert reste "À jour".
      const paid = Math.max(0, fullPaid - benefitPaid);
      const remaining = Number(tuitionStatus.remaining || 0);
      const status = String(tuitionStatus.status || (remaining > 0 ? (fullPaid > 0 ? "Partiel" : "En retard") : "À jour"));
      const currency = normalizeCurrency(tuitionStatus.currency) || "USD";
      const isExempt = due === 0;

      rows.push({
        id: s.id,
        fullName: s.fullName,
        level: s.level,
        className: s.className,
        due,
        paid,
        remaining,
        status,
        currency
      });

      // Only count toward expected totals if NOT exempt
      if (!isExempt) {
        totalIfAllPay += due;
        if (perLevel[s.level]) {
          perLevel[s.level].students += 1;
          perLevel[s.level].totalIfAllPay += due;
        }
      }

      // Paid/unpaid logic (ignore exempt students). "Réglé" inclut la prise en charge.
      if (!isExempt && fullPaid > 0) paidAtLeastOnce += 1;
      if (!isExempt && remaining > 0 && status === "En retard") unpaidCount += 1;

      // Only show in owing list if they actually owe money
      if (!isExempt && remaining > 0) {
        owingList.push({
          id: s.id,
          fullName: s.fullName,
          level: s.level,
          className: s.className,
          due,
          paid,
          remaining,
          status,
          currency
        });
      }

      if (busFeeType) {
        const busSub = busSubMap.get(String(s.id));
        const busLevelKey = ["maternelle", "primaire", "secondaire"].includes(String(s.level)) ? String(s.level) : "secondaire";
        if (isBusSubscriptionActiveForMonth(busSub, monthKey)) {
          const expectedBusCfg = await getStudentFeeExpectedForMonth({ student: s, feeType: busFeeType, monthKey });
          const expectedBus = Number(expectedBusCfg.amount || 0);
          const collectedBus = Number(busPaidMap.get(s.id) || 0);
          const remainBus = Math.max(0, expectedBus - collectedBus);
          busPerLevel[busLevelKey].subscribed += 1;
          busPerLevel[busLevelKey].expected += expectedBus;
          busPerLevel[busLevelKey].collected += collectedBus;
          busPerLevel[busLevelKey].remaining += remainBus;
          busExpected += expectedBus;
          busCollected += collectedBus;
          busRemaining += remainBus;
          if (expectedBus > 0 && remainBus > 0) {
            busOwingList.push({
              id: s.id,
              fullName: s.fullName,
              level: s.level,
              className: s.className,
              due: expectedBus,
              paid: collectedBus,
              remaining: remainBus,
              currency: expectedBusCfg.currency || busFeeType.defaultCurrency || "USD"
            });
          }
        }
      }
    }

    owingList.sort((a, b) => b.remaining - a.remaining);
    busOwingList.sort((a, b) => b.remaining - a.remaining);
    rows.sort((a, b) => {
      const l = String(a.level || "").localeCompare(String(b.level || ""), "fr");
      if (l !== 0) return l;
      const c = String(a.className || "").localeCompare(String(b.className || ""), "fr");
      if (c !== 0) return c;
      return String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr");
    });

    res.json({
      monthKey,
      totalStudents,
      paidAtLeastOnce,
      unpaidCount,
      totalIfAllPay,
      perLevel,
      tuition: {
        feeTypeId: tuitionFeeType?.id || null,
        feeTypeLabel: tuitionFeeType?.labelFr || "Minerval",
        receivedUSD: tuitionCashReceived.usd,
        receivedCDF: tuitionCashReceived.cdf
      },
      bus: {
        feeTypeId: busFeeType?.id || null,
        feeTypeLabel: busFeeType?.labelFr || "Bus",
        expected: busExpected,
        collected: busCollected,
        collectedUSD: busTenderReceived.usd,
        collectedCDF: busTenderReceived.cdf,
        remaining: busRemaining,
        perLevel: busPerLevel,
        owingList: busOwingList
      },
      owingList,
      rows,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Late/partial tuition rows for a month (server truth).
 * query: ?month=YYYY-MM
 */
app.get("/api/reports/late-students", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    let monthKey = normalizeMonthKey(req.query.month);
    if (!monthKey) return res.status(400).json({ error: "month (YYYY-MM) requis" });

    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    // feeCode optionnel : permet de cibler n'importe quel frais (défaut: Minerval).
    const requestedCode = String(req.query.feeCode || "").trim().toUpperCase();
    const targetCode = requestedCode || "TUITION";
    const tuitionFeeType = await getFeeTypeByCode(targetCode, { schoolYearStartYear });
    if (!tuitionFeeType) {
      return res.json({ monthKey, rows: [], totalStudents: 0, totalRemaining: 0, feeTypeCode: targetCode, feeTypeLabel: targetCode });
    }
    // Les articles (vente) ne sont jamais "en retard".
    if (normalizeBillingCycle(tuitionFeeType.billingCycle) === "item") {
      return res.json({ monthKey, rows: [], totalStudents: 0, totalRemaining: 0, feeTypeCode: tuitionFeeType.code, feeTypeLabel: tuitionFeeType.labelFr });
    }
    monthKey = normalizeMonthKey(tuitionFeeType.dueMonth) || monthKey;
    const students = await all(
      `SELECT * FROM students
       WHERE "schoolYearStartYear" = ?
         AND COALESCE("isActive", TRUE) = TRUE`,
      [schoolYearStartYear]
    );
    const rows = [];
    const LATE_REMAIN_EPSILON = 0.0049;
    const asMoney = (value) => Number(Number(value || 0).toFixed(2));
    for (const s of students) {
      const st = await getStudentFeeMonthStatus({ student: s, feeType: tuitionFeeType, monthKey });
      const due = asMoney(st.dueAmount);
      const paid = asMoney(st.paidSoFar);
      const remaining = asMoney(st.remaining);
      if (due <= LATE_REMAIN_EPSILON || remaining <= LATE_REMAIN_EPSILON) continue;
      rows.push({
        id: s.id,
        fullName: s.fullName,
        level: s.level,
        className: s.className,
        due,
        paid,
        remaining,
        status: st.status,
        currency: st.currency || "USD",
        lastPaidAt: st.lastPaidAt || null
      });
    }

    rows.sort((a, b) => {
      const l = String(a.level || "").localeCompare(String(b.level || ""), "fr");
      if (l !== 0) return l;
      const c = String(a.className || "").localeCompare(String(b.className || ""), "fr");
      if (c !== 0) return c;
      return String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr");
    });

    const totalRemaining = rows.reduce((sum, r) => sum + Number(r.remaining || 0), 0);
    res.json({
      monthKey,
      totalStudents: rows.length,
      totalRemaining,
      feeTypeCode: tuitionFeeType.code,
      feeTypeLabel: tuitionFeeType.labelFr,
      rows
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/reports/bus-summary", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const monthKey = normalizeMonthKey(req.query.month);
    if (!monthKey) return res.status(400).json({ error: "month (YYYY-MM) requis" });
    const summary = await (async () => {
      const fakeReq = { query: { month: monthKey } };
      void fakeReq;
      return null;
    })();
    void summary;
    // Reuse summary source instead of duplicating core computations:
    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const students = await all(
      `SELECT * FROM students
       WHERE "schoolYearStartYear" = ?
         AND COALESCE("isActive", TRUE) = TRUE`,
      [schoolYearStartYear]
    );
    const busFeeType = await getFeeTypeByCode("BUS", { schoolYearStartYear });
    if (!busFeeType) {
      return res.json({
        monthKey,
        feeTypeId: null,
        feeTypeLabel: "Bus",
        expected: 0,
        collected: 0,
        remaining: 0,
        expectedUSD: 0,
        expectedCDF: 0,
        collectedUSD: 0,
        collectedCDF: 0,
        remainingUSD: 0,
        remainingCDF: 0,
        perLevel: {
          maternelle: { subscribed: 0, expectedUSD: 0, expectedCDF: 0, collectedUSD: 0, collectedCDF: 0, remainingUSD: 0, remainingCDF: 0 },
          primaire: { subscribed: 0, expectedUSD: 0, expectedCDF: 0, collectedUSD: 0, collectedCDF: 0, remainingUSD: 0, remainingCDF: 0 },
          secondaire: { subscribed: 0, expectedUSD: 0, expectedCDF: 0, collectedUSD: 0, collectedCDF: 0, remainingUSD: 0, remainingCDF: 0 }
        },
        owingList: []
      });
    }
    const busSubs = await all(`SELECT * FROM student_bus_subscription WHERE active = TRUE`);
    const busSubMap = new Map(busSubs.map((r) => [String(r.studentId), r]));
    const busPayments = await all(
      `SELECT "studentId", amount, currency, "amountUSDReceived", "amountCDFReceived"
       FROM payments
       WHERE COALESCE("paidForMonth","monthKey") = ? AND "feeTypeId" = ? AND "cancelledAt" IS NULL`,
      [monthKey, busFeeType.id]
    );
    const busTenderByStudent = new Map();
    const busTenderReceived = { usd: 0, cdf: 0 };
    for (const payment of busPayments) {
      const studentId = String(payment.studentId || "");
      const tender = paymentTenderSplit(payment);
      const studentTender = busTenderByStudent.get(studentId) || { usd: 0, cdf: 0 };
      studentTender.usd += Number(tender.usd || 0);
      studentTender.cdf += Number(tender.cdf || 0);
      busTenderByStudent.set(studentId, studentTender);
      busTenderReceived.usd += Number(tender.usd || 0);
      busTenderReceived.cdf += Number(tender.cdf || 0);
    }
    const perLevel = {
      maternelle: { subscribed: 0, expectedUSD: 0, expectedCDF: 0, collectedUSD: 0, collectedCDF: 0, remainingUSD: 0, remainingCDF: 0 },
      primaire: { subscribed: 0, expectedUSD: 0, expectedCDF: 0, collectedUSD: 0, collectedCDF: 0, remainingUSD: 0, remainingCDF: 0 },
      secondaire: { subscribed: 0, expectedUSD: 0, expectedCDF: 0, collectedUSD: 0, collectedCDF: 0, remainingUSD: 0, remainingCDF: 0 }
    };
    const totalsByCurrency = {
      expectedUSD: 0,
      expectedCDF: 0,
      remainingUSD: 0,
      remainingCDF: 0
    };
    const owingList = [];
    const rows = [];
    let paidCount = 0;
    let unpaidCount = 0;
    let partialCount = 0;
    for (const s of students) {
      const sub = busSubMap.get(String(s.id));
      if (!isBusSubscriptionActiveForMonth(sub, monthKey)) continue;
      const monthStatus = await getStudentFeeMonthStatus({ student: s, feeType: busFeeType, monthKey });
      const due = Number(monthStatus?.dueAmount || 0);
      const paid = Number(monthStatus?.paidSoFar || 0);
      const remain = Number(monthStatus?.remaining || 0);
      const balanceCurrency = normalizeCurrency(monthStatus?.currency || busFeeType.defaultCurrency) || "USD";
      const tender = busTenderByStudent.get(String(s.id)) || { usd: 0, cdf: 0 };
      const dueUSD = balanceCurrency === "USD" ? due : 0;
      const dueCDF = balanceCurrency === "CDF" ? due : 0;
      const remainingUSD = balanceCurrency === "USD" ? remain : 0;
      const remainingCDF = balanceCurrency === "CDF" ? remain : 0;
      let status = "A jour";
      if (due > 0 && remain <= 0) {
        status = "Payé";
        paidCount += 1;
      } else if (due > 0 && paid > 0) {
        status = "Partiel";
        partialCount += 1;
      } else if (due > 0) {
        status = "Non payé";
        unpaidCount += 1;
      }
      const levelKey = ["maternelle", "primaire", "secondaire"].includes(String(s.level)) ? String(s.level) : "secondaire";
      perLevel[levelKey].subscribed += 1;
      perLevel[levelKey].expectedUSD += dueUSD;
      perLevel[levelKey].expectedCDF += dueCDF;
      perLevel[levelKey].collectedUSD += Number(tender.usd || 0);
      perLevel[levelKey].collectedCDF += Number(tender.cdf || 0);
      perLevel[levelKey].remainingUSD += remainingUSD;
      perLevel[levelKey].remainingCDF += remainingCDF;
      totalsByCurrency.expectedUSD += dueUSD;
      totalsByCurrency.expectedCDF += dueCDF;
      totalsByCurrency.remainingUSD += remainingUSD;
      totalsByCurrency.remainingCDF += remainingCDF;
      rows.push({
        id: s.id,
        fullName: s.fullName,
        due,
        paid,
        remaining: remain,
        currency: balanceCurrency,
        dueUSD,
        dueCDF,
        paidUSD: Number(tender.usd || 0),
        paidCDF: Number(tender.cdf || 0),
        remainingUSD,
        remainingCDF,
        status
      });
      if (due > 0 && remain > 0) {
        owingList.push({
          id: s.id,
          fullName: s.fullName,
          level: s.level,
          className: s.className,
          due,
          paid,
          remaining: remain,
          currency: balanceCurrency,
          dueUSD,
          dueCDF,
          paidUSD: Number(tender.usd || 0),
          paidCDF: Number(tender.cdf || 0),
          remainingUSD,
          remainingCDF
        });
      }
    }
    const statusRank = (status) => {
      const raw = String(status || "").toLowerCase();
      if (raw === "non payé" || raw === "non paye") return 0;
      if (raw === "partiel") return 1;
      if (raw === "payé" || raw === "paye") return 2;
      return 3;
    };
    rows.sort((a, b) => {
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      return String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr");
    });
    owingList.sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr"));
    res.json({
      monthKey,
      feeTypeId: busFeeType.id,
      feeTypeLabel: busFeeType.labelFr || "Bus",
      expected: totalsByCurrency.expectedUSD,
      collected: busTenderReceived.usd,
      collectedUSD: busTenderReceived.usd,
      collectedCDF: busTenderReceived.cdf,
      remaining: totalsByCurrency.remainingUSD,
      expectedUSD: totalsByCurrency.expectedUSD,
      expectedCDF: totalsByCurrency.expectedCDF,
      remainingUSD: totalsByCurrency.remainingUSD,
      remainingCDF: totalsByCurrency.remainingCDF,
      paidCount,
      unpaidCount,
      partialCount,
      perLevel,
      rows,
      owingList
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Bus — liste des abonnés (par catégorie), indépendamment du paiement.
 * Renvoie tous les abonnements actifs des élèves actifs, avec leur catégorie.
 */
app.get("/api/reports/bus-subscribers", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const rows = await all(
      `SELECT s.id AS "studentId", s."fullName", s.level, s."className", s.matricule,
              bs."category", bs."startMonth"
       FROM student_bus_subscription bs
       JOIN students s ON s.id = bs."studentId"
       WHERE bs.active = TRUE
         AND COALESCE(s."isActive", TRUE) = TRUE
         AND s."schoolYearStartYear" = ?`,
      [schoolYearStartYear]
    );
    const subscribers = (rows || []).map((r) => ({
      studentId: r.studentId,
      fullName: r.fullName || "",
      level: r.level || "",
      className: r.className || "",
      matricule: r.matricule || r.studentId || "",
      category: r.category != null && String(r.category).trim() !== "" ? String(r.category).trim() : null,
      startMonth: r.startMonth || null
    }));
    // Liste des catégories réellement utilisées (pour le filtre côté client).
    const usedCategories = Array.from(
      new Set(subscribers.map((s) => s.category).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b), "fr", { sensitivity: "base" }));
    subscribers.sort((a, b) => {
      const ca = (a.category || "￿").toLowerCase();
      const cb = (b.category || "￿").toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb, "fr", { sensitivity: "base" });
      return String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr", { numeric: true, sensitivity: "base" });
    });
    res.json({ total: subscribers.length, categories: usedCategories, subscribers });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Prise en charge (personnel) — liste des élèves dont le minerval est pris en charge,
 * avec l'employé, la période et le montant total couvert (non-cash).
 */
app.get("/api/reports/tuition-benefits", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const rows = await all(
      `SELECT s.id AS "studentId", s."fullName", s.level, s."className", s.matricule,
              b."employeeName", b."startMonth", b."endMonth",
              COALESCE(cov.months, 0) AS "coveredMonths",
              COALESCE(cov.total_usd, 0) AS "coveredUSD",
              COALESCE(cov.total_cdf, 0) AS "coveredCDF"
       FROM student_tuition_benefit b
       JOIN students s ON s.id = b."studentId"
       LEFT JOIN (
         SELECT "studentId",
                COUNT(*) AS months,
                COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0) AS total_usd,
                COALESCE(SUM(CASE WHEN currency = 'CDF' THEN amount ELSE 0 END), 0) AS total_cdf
         FROM payments WHERE "paymentMethod" = 'staff_benefit'
         GROUP BY "studentId"
       ) cov ON cov."studentId" = s.id
       WHERE b.active = TRUE
         AND COALESCE(s."isActive", TRUE) = TRUE
         AND s."schoolYearStartYear" = ?`,
      [schoolYearStartYear]
    );
    const beneficiaries = (rows || []).map((r) => ({
      studentId: r.studentId,
      fullName: r.fullName || "",
      level: r.level || "",
      className: r.className || "",
      matricule: r.matricule || r.studentId || "",
      employeeName: r.employeeName != null && String(r.employeeName).trim() !== "" ? String(r.employeeName).trim() : null,
      startMonth: r.startMonth || null,
      endMonth: r.endMonth || null,
      coveredMonths: Number(r.coveredMonths || 0),
      coveredUSD: Number(r.coveredUSD || 0),
      coveredCDF: Number(r.coveredCDF || 0)
    }));
    beneficiaries.sort((a, b) =>
      String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr", { numeric: true, sensitivity: "base" })
    );
    const totalUSD = beneficiaries.reduce((s, x) => s + Number(x.coveredUSD || 0), 0);
    const totalCDF = beneficiaries.reduce((s, x) => s + Number(x.coveredCDF || 0), 0);
    res.json({ total: beneficiaries.length, totalUSD, totalCDF, beneficiaries });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
}

module.exports = registerReportsRoutes;
