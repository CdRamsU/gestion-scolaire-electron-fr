const crypto = require("crypto");
const { isManualHistory } = require("../config/capabilities");

function registerPaymentsRoutes(app, deps) {
  const {
    requireRole,
    pgPool,
    buildReceiptNoForYearSeq,
    getReceiptYearFromSchoolYearStartYear,
    peekNextReceiptNumberForSchoolYear,
    reserveNextReceiptNumberForSchoolYear,
    configuration,
    nowIso,
    normalizeMonthKey,
    normalizeClientRequestId,
    resolveFeeType,
    normalizeFeeType,
    normalizeCurrency,
    get,
    getFirstPendingMonthForFee,
    buildStudentFeeExpectationContext,
    getStudentFeeMonthStatus,
    getStudentFeeTimelineStatus,
    getAnnualPaymentLockStatusForCurrentSchoolYear,
    getTranchePrerequisiteStatus,
    convertAmountByFx,
    run,
    writeAudit,
    normalizeBillingCycle,
    paymentRecordToReceiptJson,
    all,
    toDateOnlyISO,
    cacheKeyForApi,
    getCachedHotApiValue,
    BUSINESS_TIMEZONE,
    getSchoolYearStartYearSetting,
    purgeHotApiCache
  } = deps;

  function normalizeSchoolYearStartYear(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const y = Math.floor(n);
    if (y < 2000 || y > 2100) return null;
    return y;
  }
  function normalizeReceiptDeviceKey(value) {
    const key = String(value || "").trim();
    if (!/^[A-Za-z0-9._:-]{12,160}$/.test(key)) return null;
    return key;
  }
  function normalizeReceiptDeviceLabel(value) {
    const label = String(value || "").replace(/\s+/g, " ").trim();
    return label ? label.slice(0, 120) : null;
  }
  async function getOrCreateReceiptDevice(db, rawKey, rawLabel = null) {
    const deviceKey = normalizeReceiptDeviceKey(rawKey) || "legacy-shared-device";
    const label = normalizeReceiptDeviceLabel(rawLabel);
    let result = await db.query(
      `UPDATE receipt_devices
       SET label = COALESCE($2, label), "lastSeenAt" = NOW()
       WHERE "deviceKey" = $1
       RETURNING id, code, "deviceKey", label`,
      [deviceKey, label]
    );
    if (result.rows[0]) return result.rows[0];

    // Serialize only the rare first registration. Reconnecting devices take
    // the UPDATE path and never consume or change their permanent code.
    await db.query(`SELECT pg_advisory_xact_lock(17032026)`);
    result = await db.query(
      `SELECT id, code, "deviceKey", label FROM receipt_devices WHERE "deviceKey" = $1`,
      [deviceKey]
    );
    if (result.rows[0]) return result.rows[0];
    const next = await db.query(
      `SELECT COALESCE(MAX(SUBSTRING(code FROM '^C([0-9]+)$')::int), 0) + 1 AS n
       FROM receipt_devices`
    );
    const code = `C${String(Number(next.rows[0].n || 1)).padStart(2, "0")}`;
    result = await db.query(
      `INSERT INTO receipt_devices ("deviceKey", code, label, "lastSeenAt")
       VALUES ($1,$2,$3,NOW())
       RETURNING id, code, "deviceKey", label`,
      [deviceKey, code, label]
    );
    return result.rows[0];
  }
  async function receiptPrefix() {
    const configured = String((await configuration.values())?.["receipts.prefix"] || "ECO")
      .trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return configured || "ECO";
  }
  async function peekDeviceReceipt(db, device, schoolYearStartYear) {
    const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearStartYear);
    const current = await db.query(
      `SELECT "lastSeq" FROM receipt_device_counters WHERE "deviceId" = $1 AND "receiptYear" = $2`,
      [device.id, receiptYear]
    );
    const seq = Math.max(0, Number(current.rows?.[0]?.lastSeq || 0)) + 1;
    return {
      receiptYear,
      seq,
      receiptNo: `${await receiptPrefix()}-${device.code}-${receiptYear}-${String(seq).padStart(6, "0")}`
    };
  }
  async function allocateDeviceReceipt(db, device, schoolYearStartYear) {
    const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearStartYear);
    const counter = await db.query(
      `INSERT INTO receipt_device_counters ("deviceId", "receiptYear", "lastSeq", "updatedAt")
       VALUES ($1,$2,1,NOW())
       ON CONFLICT ("deviceId", "receiptYear") DO UPDATE SET
         "lastSeq" = receipt_device_counters."lastSeq" + 1,
         "updatedAt" = NOW()
       RETURNING "lastSeq"`,
      [device.id, receiptYear]
    );
    const seq = Number(counter.rows[0].lastSeq);
    return {
      receiptYear,
      seq,
      receiptNo: `${await receiptPrefix()}-${device.code}-${receiptYear}-${String(seq).padStart(6, "0")}`
    };
  }
  function isActiveStudentRecord(student) {
    if (!student) return false;
    return student.isActive !== false && student.isActive !== 0 && student.isActive !== "0";
  }
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
  function normalizeRequestedReceiptNoForSchoolYear(value, schoolYearStartYear) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(/^[A-Z0-9]{1,12}-(\d{4})-(\d+)$/i);
    if (!match) return null;
    const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearStartYear);
    const parsedYear = Number(match[1]);
    const parsedSeq = Number(match[2]);
    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedSeq) || parsedSeq <= 0) return null;
    if (parsedYear !== receiptYear) return null;
    return raw.toUpperCase();
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

  function monthKeyFromDateOnly(dateIso) {
    const safeDate = toDateOnlyISO(dateIso);
    const match = String(safeDate || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
    return match ? `${match[1]}-${match[2]}` : null;
  }

  function monthKeyBelongsToSchoolYear(monthKey, schoolYearStartYear) {
    const safeMonthKey = normalizeMonthKey(monthKey);
    const bounds = buildSchoolYearMonthBounds(schoolYearStartYear);
    if (!safeMonthKey || !bounds) return false;
    return safeMonthKey >= bounds.startMonth && safeMonthKey <= bounds.endMonth;
  }

  function isTruthyQueryFlag(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    return ["1", "true", "yes", "y", "on", "all"].includes(raw);
  }

  function shouldIncludeAllYears(req) {
    return isTruthyQueryFlag(req?.query?.allYears);
  }

  function resolveSpendingAppliesToMonth(rawMonthKey, schoolYearStartYear, dateIso) {
    const explicitMonthKey = normalizeMonthKey(rawMonthKey);
    if (explicitMonthKey && monthKeyBelongsToSchoolYear(explicitMonthKey, schoolYearStartYear)) {
      return explicitMonthKey;
    }
    const dateMonthKey = monthKeyFromDateOnly(dateIso);
    if (dateMonthKey && monthKeyBelongsToSchoolYear(dateMonthKey, schoolYearStartYear)) {
      return dateMonthKey;
    }
    const bounds = buildSchoolYearMonthBounds(schoolYearStartYear);
    return bounds?.startMonth || dateMonthKey || explicitMonthKey || null;
  }

  async function getActiveSchoolYearMonthBounds() {
    const configured = normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
    const now = new Date();
    const fallback = (now.getMonth() + 1) >= 9 ? now.getFullYear() : (now.getFullYear() - 1);
    return buildSchoolYearMonthBounds(configured || fallback);
  }

  async function paymentRowsToApiJson(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    return list.map((row) => paymentRecordToReceiptJson(row));
  }

  const correctionSelectSql = `
    (SELECT COUNT(*)::int
       FROM payment_reclassifications pr
      WHERE pr."paymentId" = p.id) AS "correctionCount",
    (SELECT jsonb_build_object(
              'id', pr.id,
              'oldFeeTypeId', pr."oldFeeTypeId",
              'oldFeeType', pr."oldFeeType",
              'newFeeTypeId', pr."newFeeTypeId",
              'newFeeType', pr."newFeeType",
              'reason', pr.reason,
              'correctedAt', pr."correctedAt",
              'correctedByUsername', pr."correctedByUsername"
            )
       FROM payment_reclassifications pr
      WHERE pr."paymentId" = p.id
      ORDER BY pr."correctedAt" DESC, pr.id DESC
      LIMIT 1) AS "latestCorrection",
    (SELECT jsonb_build_object(
              'feeTypeId', pr."oldFeeTypeId",
              'feeType', COALESCE(pr."oldFeeType", original_ft."labelFr"),
              'feeTypeCode', original_ft.code
            )
       FROM payment_reclassifications pr
       LEFT JOIN fee_types original_ft ON original_ft.id = pr."oldFeeTypeId"
      WHERE pr."paymentId" = p.id
      ORDER BY pr."correctedAt" ASC, pr.id ASC
      LIMIT 1) AS "originalCashAllocation"`;

  // Construit le document de reçu IMMUABLE (figé à la finalisation du paiement).
  // Les DÉCISIONS d'affichage (mois ou non, cycle…) sont résolues UNE fois ici et gelées.
  function buildReceiptDocument({ payment, feeType, statusAfter = null, schoolYearStartYear = null, remainingAfter = null } = {}) {
    const cycle = normalizeBillingCycle(feeType?.billingCycle) || "monthly";
    const sy = Number(schoolYearStartYear);
    const remain = remainingAfter != null
      ? Number(remainingAfter)
      : (statusAfter ? Number(statusAfter.remaining || 0) : null);
    const doc = {
      v: 1,
      receiptNo: payment?.receiptNo || null,
      receiptDeviceCode: payment?.receiptDeviceCode || null,
      createdAt: payment?.createdAt || null,
      cashier: payment?.createdByUsername || null,
      student: {
        name: payment?.studentNameSnapshot || null,
        matricule: payment?.studentMatriculeSnapshot || payment?.studentId || null,
        className: payment?.classNameSnapshot || null,
        level: payment?.levelSnapshot || null
      },
      schoolYearLabel: Number.isFinite(sy) ? `${sy}-${sy + 1}` : null,
      fee: {
        label: payment?.feeType || feeType?.labelFr || null,
        code: feeType?.code || null,
        cycle
      },
      // Physical cash stays in the caisse selected when the receipt was issued.
      // Accounting reclassification may change `fee`, but never this allocation.
      cashAllocation: {
        label: payment?.feeType || feeType?.labelFr || null,
        code: feeType?.code || null
      },
      // Décision gelée : seul un frais mensuel porte un "mois payé".
      showMonth: cycle === "monthly",
      monthKey: payment?.paidForMonth || payment?.monthKey || null,
      amount: Number(payment?.amount || 0),
      currency: normalizeCurrency(payment?.currency) || "USD",
      amountUSDReceived: payment?.amountUSDReceived == null ? null : Number(payment.amountUSDReceived || 0),
      amountCDFReceived: payment?.amountCDFReceived == null ? null : Number(payment.amountCDFReceived || 0),
      dueAmountSnapshot: payment?.dueAmountSnapshot == null ? null : Number(payment.dueAmountSnapshot || 0),
      dueCurrencySnapshot: normalizeCurrency(payment?.dueCurrencySnapshot) || null,
      fxRate: payment?.fxRate != null ? Number(payment.fxRate) : null,
      remainingAfter: remain != null && Number.isFinite(remain) ? remain : null,
      remainingCurrency: statusAfter ? (normalizeCurrency(statusAfter.currency) || null) : null
    };
    try { doc.hash = crypto.createHash("sha1").update(JSON.stringify(doc)).digest("hex"); } catch (_) { /* optional */ }
    return doc;
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

  function normalizeCaisseBoxKey(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    return /^[a-z0-9_]+$/.test(raw) ? raw : "";
  }

  function normalizeFeeLabelKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function isParentChangeTransferPayload({ mode, counterpartyBoxKey, note } = {}) {
    return String(mode || "").trim().toLowerCase() === "exchange"
      && String(counterpartyBoxKey || "").trim() === PARENT_CHANGE_COUNTERPARTY_BOX_KEY
      && normalizeFeeLabelKey(note).startsWith(normalizeFeeLabelKey(PARENT_CHANGE_TRANSFER_NOTE_PREFIX));
  }

  const STATE_PAID_SPENDING_PREFIX = "Paid - ";
  function stripStatePaidSpendingPrefix(value) {
    const raw = String(value || "").trim();
    return normalizeFeeLabelKey(raw).startsWith(normalizeFeeLabelKey(STATE_PAID_SPENDING_PREFIX))
      ? raw.slice(STATE_PAID_SPENDING_PREFIX.length).trim()
      : raw;
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

  function findCaisseBoxDefinitionByKey(definitions, key) {
    const safeKey = normalizeCaisseBoxKey(key);
    if (!safeKey) return null;
    return (Array.isArray(definitions) ? definitions : []).find((row) => row.key === safeKey) || null;
  }

  function caisseSpendingCategoryLabel(boxLike) {
    const label = String(boxLike?.label || "").trim() || "Caisse";
    const codeTag = String(boxLike?.codeTag || "").trim().toUpperCase();
    if (codeTag) return `Caisse [${codeTag}] - ${label}`;
    return `Caisse - ${label}`;
  }

  function caisseBoxKeyFromSpendingCategory(category, definitions) {
    const categoryRaw = stripStatePaidSpendingPrefix(category);
    const codeTagged = categoryRaw.match(/^Caisse\s*\[([A-Za-z0-9_]+)\]\s*-/i);
    if (codeTagged) {
      const taggedCode = String(codeTagged[1] || "").trim().toUpperCase();
      const taggedBox = (Array.isArray(definitions) ? definitions : []).find((box) => {
        const boxTag = String(box?.codeTag || "").trim().toUpperCase();
        return boxTag === taggedCode || caisseBoxMatchesFeeCode(box, taggedCode);
      });
      if (taggedBox) return taggedBox.key;
    }
    const categoryNorm = normalizeFeeLabelKey(categoryRaw);
    if (!categoryNorm) return "";
    if (
      categoryNorm === normalizeFeeLabelKey("Caisse - Frais technique")
      || categoryNorm === normalizeFeeLabelKey("Caisse - Frais de l'Etat (toutes tranches)")
    ) {
      return "frais_etat_tranches";
    }
    for (const box of (Array.isArray(definitions) ? definitions : [])) {
      if (categoryNorm === normalizeFeeLabelKey(caisseSpendingCategoryLabel(box))) {
        return box.key;
      }
    }
    return "";
  }

  async function getCaisseFeeContextForSchoolYear(schoolYearStartYear, db = pgPool) {
    const targetYear = normalizeSchoolYearStartYear(schoolYearStartYear);
    const queryDb = db && typeof db.query === "function" ? db : pgPool;
    const defs = BASE_CAISSE_BOX_DEFINITIONS.map((box) => ({ ...box }));
    const feeTypeRes = await queryDb.query(
      `SELECT code, "labelFr"
       FROM fee_types
       WHERE "schoolYearStartYear" = $1
         AND active = TRUE
       ORDER BY id ASC`,
      [targetYear]
    );
    const feeCodeByLabel = new Map();
    const knownCodes = new Set(["TUITION", "BUS"]);
    for (const row of feeTypeRes.rows || []) {
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

  function currencyBucketKey(currency) {
    return normalizeCurrency(currency) === "CDF" ? "cdf" : "usd";
  }

  function roundCurrencyAmount(amount, currency) {
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 0;
    if (normalizeCurrency(currency) === "CDF") return Math.round(value);
    return Number(value.toFixed(2));
  }

  function normalizePositiveAmountByCurrency(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (normalizeCurrency(currency) === "CDF") {
      if (Math.abs(value - Math.round(value)) > 1e-9) return null;
      return Math.round(value);
    }
    const rounded = Number(value.toFixed(2));
    return rounded > 0 ? rounded : null;
  }

  function addCurrencyAmount(bucket, currency, amount) {
    if (!bucket) return;
    const key = currencyBucketKey(currency);
    const value = Number(amount || 0);
    if (!Number.isFinite(value) || value === 0) return;
    if (key === "cdf") {
      bucket.cdf = Math.round(Number(bucket.cdf || 0) + value);
      return;
    }
    bucket.usd = Number((Number(bucket.usd || 0) + value).toFixed(2));
  }

  function buildEmptyCaisseSnapshot(box) {
    return {
      ...box,
      entry: { usd: 0, cdf: 0 },
      exit: { usd: 0, cdf: 0 },
      net: { usd: 0, cdf: 0 }
    };
  }

  function computeExchangeCounterAmount(sourceAmount, sourceCurrency, counterCurrency, fxRate) {
    const safeSourceCurrency = normalizeCurrency(sourceCurrency) || "USD";
    const safeCounterCurrency = normalizeCurrency(counterCurrency) || "USD";
    const safeAmount = Number(sourceAmount || 0);
    const safeRate = Number(fxRate || 0);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) return null;
    if (safeSourceCurrency === safeCounterCurrency) {
      return roundCurrencyAmount(safeAmount, safeSourceCurrency);
    }
    if (!Number.isFinite(safeRate) || safeRate <= 0) return null;
    if (safeSourceCurrency === "USD" && safeCounterCurrency === "CDF") {
      return Math.round(safeAmount * safeRate);
    }
    if (safeSourceCurrency === "CDF" && safeCounterCurrency === "USD") {
      return Number((safeAmount / safeRate).toFixed(2));
    }
    return null;
  }

  async function getCaisseBoxSnapshotsUpToDate(dateIso, db = pgPool, options = {}) {
    const safeDate = String(dateIso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) return [];
    const queryDb = db && typeof db.query === "function" ? db : pgPool;
    const activeBounds = await getActiveSchoolYearMonthBounds();
    const targetBounds = buildSchoolYearMonthBounds(options?.schoolYearStartYear) || activeBounds;
    const feeContext = await getCaisseFeeContextForSchoolYear(targetBounds.startYear, queryDb);
    const definitions = feeContext.definitions;
    const byKey = new Map(definitions.map((box) => [box.key, buildEmptyCaisseSnapshot(box)]));
    const ensureSnapshot = (boxKey) => {
      const safeKey = normalizeCaisseBoxKey(boxKey);
      if (!safeKey) return null;
      const existing = byKey.get(safeKey);
      if (existing) return existing;
      const fallbackDef = findCaisseBoxDefinitionByKey(definitions, safeKey)
        || { key: safeKey, label: safeKey, codes: [] };
      const created = buildEmptyCaisseSnapshot(fallbackDef);
      byKey.set(safeKey, created);
      return created;
    };

    const paymentRes = await queryDb.query(
      `SELECT p.amount, p.currency, p."amountUSDReceived", p."amountCDFReceived",
              COALESCE(NULLIF(p."receiptDoc" #>> '{cashAllocation,code}', ''), original_ft.code, ft.code) AS "feeCode",
              COALESCE(NULLIF(p."receiptDoc" #>> '{cashAllocation,label}', ''), original_pr."oldFeeType", p."feeType", ft."labelFr") AS "feeType"
       FROM payments p
       LEFT JOIN fee_types ft ON ft.id = p."feeTypeId"
       LEFT JOIN LATERAL (
         SELECT pr."oldFeeTypeId", pr."oldFeeType"
           FROM payment_reclassifications pr
          WHERE pr."paymentId" = p.id
          ORDER BY pr."correctedAt" ASC, pr.id ASC
          LIMIT 1
       ) original_pr ON TRUE
       LEFT JOIN fee_types original_ft ON original_ft.id = original_pr."oldFeeTypeId"
       WHERE (p."createdAt" AT TIME ZONE $2)::date <= $1::date
         AND COALESCE(p."paidForMonth", p."monthKey") >= $3
         AND COALESCE(p."paidForMonth", p."monthKey") <= $4
         AND p."cancelledAt" IS NULL
         AND p."paymentMethod" IS DISTINCT FROM 'staff_benefit'`,
      [safeDate, BUSINESS_TIMEZONE, targetBounds.startMonth, targetBounds.endMonth]
    );
    for (const row of paymentRes.rows || []) {
      const feeCode = resolvePaymentFeeCode(row, feeContext);
      if (!feeCode) continue;
      const box = definitions.find((entry) => caisseBoxMatchesFeeCode(entry, feeCode));
      if (!box) continue;
      const target = ensureSnapshot(box.key);
      const tender = paymentTenderSplit(row);
      if (tender.usd > 0) addCurrencyAmount(target?.entry, "USD", tender.usd);
      if (tender.cdf > 0) addCurrencyAmount(target?.entry, "CDF", tender.cdf);
    }

    const spendingRes = await queryDb.query(
      `SELECT category, amount, currency, "caisseBoxKey"
       FROM spending
       WHERE "date" <= $1::date
         AND "schoolYearStartYear" = $2`,
      [safeDate, targetBounds.startYear]
    );
    for (const row of spendingRes.rows || []) {
      const explicitBoxKey = normalizeCaisseBoxKey(row?.caisseBoxKey);
      const derivedBoxKey = explicitBoxKey
        || caisseBoxKeyFromSpendingCategory(row?.category, definitions)
        || "minerval";
      const target = ensureSnapshot(derivedBoxKey) || ensureSnapshot("minerval");
      addCurrencyAmount(target?.exit, row.currency, row.amount);
    }

    const transferRes = await queryDb.query(
      `SELECT mode, "sourceBoxKey", "counterpartyBoxKey", "sourceCurrency", "sourceAmount", "counterCurrency", "counterAmount"
       FROM caisse_transfers
       WHERE "date" <= $1::date
         AND "schoolYearStartYear" = $2
       ORDER BY "date" ASC, "createdAt" ASC, id ASC`,
      [safeDate, targetBounds.startYear]
    );
    for (const row of transferRes.rows || []) {
      const sourceKey = normalizeCaisseBoxKey(row?.sourceBoxKey);
      const counterpartyKey = normalizeCaisseBoxKey(row?.counterpartyBoxKey);
      const sourceCurrency = normalizeCurrency(row?.sourceCurrency) || "USD";
      const counterCurrency = normalizeCurrency(row?.counterCurrency) || null;
      const sourceAmount = roundCurrencyAmount(row?.sourceAmount, sourceCurrency);
      const counterAmount = counterCurrency ? roundCurrencyAmount(row?.counterAmount, counterCurrency) : 0;
      const sourceSnapshot = ensureSnapshot(sourceKey);
      const counterpartySnapshot = ensureSnapshot(counterpartyKey);

      addCurrencyAmount(sourceSnapshot?.exit, sourceCurrency, sourceAmount);
      addCurrencyAmount(counterpartySnapshot?.entry, sourceCurrency, sourceAmount);

      if (String(row?.mode || "").trim().toLowerCase() === "exchange" && counterCurrency && counterAmount > 0) {
        addCurrencyAmount(counterpartySnapshot?.exit, counterCurrency, counterAmount);
        addCurrencyAmount(sourceSnapshot?.entry, counterCurrency, counterAmount);
      }
    }

    const rows = [];
    for (const box of definitions) {
      const snapshot = byKey.get(box.key);
      if (!snapshot) continue;
      snapshot.net.usd = Number((Number(snapshot.entry.usd || 0) - Number(snapshot.exit.usd || 0)).toFixed(2));
      snapshot.net.cdf = Math.round(Number(snapshot.entry.cdf || 0) - Number(snapshot.exit.cdf || 0));
      rows.push(snapshot);
    }
    for (const [boxKey, snapshot] of byKey.entries()) {
      if (rows.some((row) => row.key === boxKey)) continue;
      snapshot.net.usd = Number((Number(snapshot.entry.usd || 0) - Number(snapshot.exit.usd || 0)).toFixed(2));
      snapshot.net.cdf = Math.round(Number(snapshot.entry.cdf || 0) - Number(snapshot.exit.cdf || 0));
      rows.push(snapshot);
    }
    return rows;
  }

  async function getCaisseBoxAvailableAmount(dateIso, boxKey, currency, db = pgPool, options = {}) {
    const snapshots = await getCaisseBoxSnapshotsUpToDate(dateIso, db, options);
    const safeKey = normalizeCaisseBoxKey(boxKey);
    const row = snapshots.find((entry) => entry.key === safeKey);
    if (!row) return 0;
    if (normalizeCurrency(currency) === "CDF") return Math.max(0, Number(row.net?.cdf || 0));
    return Math.max(0, Number(row.net?.usd || 0));
  }

  async function lockCaisseBalanceKeys(client, schoolYearStartYear, legs = []) {
    const safeYear = normalizeSchoolYearStartYear(schoolYearStartYear);
    const unique = Array.from(new Set(
      (Array.isArray(legs) ? legs : [])
        .map((leg) => {
          const boxKey = normalizeCaisseBoxKey(leg?.boxKey);
          const currency = normalizeCurrency(leg?.currency);
          if (!safeYear || !boxKey || !currency) return "";
          return `${safeYear}|${boxKey}|${currency}`;
        })
        .filter(Boolean)
    )).sort();
    for (const token of unique) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, ["caisse-balance", token]);
    }
  }

app.post("/api/receipt-devices/register", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  const tx = await pgPool.connect();
  try {
    const deviceKey = normalizeReceiptDeviceKey(req.body?.deviceKey);
    if (!deviceKey) return res.status(400).json({ error: "deviceKey invalide" });
    await tx.query("BEGIN");
    const device = await getOrCreateReceiptDevice(tx, deviceKey, req.body?.label);
    await tx.query("COMMIT");
    res.json({ id: device.id, code: device.code, label: device.label || null });
  } catch (e) {
    await tx.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    tx.release();
  }
});

app.get("/api/receipt-devices", requireRole("admin", "comptable"), async (_req, res) => {
  try {
    const rows = await all(
      `SELECT d.id, d.code, d.label, d."createdAt", d."lastSeenAt",
              COALESCE(COUNT(p.id), 0)::int AS "paymentCount"
       FROM receipt_devices d
       LEFT JOIN payments p ON p."receiptDeviceId" = d.id
       GROUP BY d.id, d.code, d.label, d."createdAt", d."lastSeenAt"
       ORDER BY d.id ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Read-only preview. The number is allocated only inside POST /api/payments.
 */
app.get("/api/payments/next-receipt-no", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  const tx = await pgPool.connect();
  try {
    const activeSchoolYearStartYear = normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
    const deviceKey = normalizeReceiptDeviceKey(req.query?.receiptDeviceKey);
    if (!deviceKey) return res.status(400).json({ error: "receiptDeviceKey requis" });
    await tx.query("BEGIN");
    const device = await getOrCreateReceiptDevice(tx, deviceKey, req.query?.deviceLabel);
    const nextReceipt = await peekDeviceReceipt(tx, device, activeSchoolYearStartYear);
    await tx.query("COMMIT");
    res.json({ receiptNo: nextReceipt.receiptNo, deviceCode: device.code, preview: true });
  } catch (e) {
    await tx.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    tx.release();
  }
});

/**
 * Add payment
 * body: { studentId, monthKey, amount, currency, note }
 */
app.post("/api/payments", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const studentId = String(req.body.studentId || "").trim();
    const paidForMonth = normalizeMonthKey(req.body.paid_for_month || req.body.paidForMonth || req.body.monthKey);
    let amount = Number(req.body.amount ?? 0);
    const fxRate = req.body.fx_rate != null ? Number(req.body.fx_rate) : (req.body.fxRate != null ? Number(req.body.fxRate) : null);
    const amountUSDReceivedRaw = req.body.amountUSDReceived ?? req.body.amount_usd_received;
    const amountCDFReceivedRaw = req.body.amountCDFReceived ?? req.body.amount_cdf_received;
    const hasTenderBreakdown = amountUSDReceivedRaw != null || amountCDFReceivedRaw != null;
    const amountUSDReceived = hasTenderBreakdown ? Number(amountUSDReceivedRaw || 0) : null;
    const amountCDFReceived = hasTenderBreakdown ? Number(amountCDFReceivedRaw || 0) : null;
    const note = req.body.note != null ? String(req.body.note).trim() : null;
    const clientRequestId = normalizeClientRequestId(req.body.clientRequestId ?? req.body.client_request_id ?? null);
    const receiptDeviceKey = normalizeReceiptDeviceKey(req.body.receiptDeviceKey ?? req.body.receipt_device_key);
    const receiptDeviceLabel = normalizeReceiptDeviceLabel(req.body.receiptDeviceLabel ?? req.body.receipt_device_label);

    if (!studentId) return res.status(400).json({ error: "studentId requis" });
    if (hasTenderBreakdown && (
      !Number.isFinite(amountUSDReceived) || amountUSDReceived < 0 ||
      !Number.isFinite(amountCDFReceived) || amountCDFReceived < 0 ||
      !(amountUSDReceived > 0 || amountCDFReceived > 0)
    )) {
      return res.status(400).json({ error: "Montants USD/CDF recus invalides" });
    }
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Le montant doit Ãªtre > 0" });
    if (req.body.clientRequestId != null && !clientRequestId) {
      return res.status(400).json({ error: "clientRequestId invalide" });
    }

    const student = await get(`SELECT * FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });
    if (!isActiveStudentRecord(student)) {
      return res.status(409).json({
        error: "Eleve inactif. Reactivez-le avant d'enregistrer un paiement.",
        code: "STUDENT_INACTIVE",
        studentId
      });
    }
    const activeSchoolYearStartYear = normalizeSchoolYearStartYear(req.body?.schoolYearStartYear)
      || normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting().catch(() => null))
      || normalizeSchoolYearStartYear(student.schoolYearStartYear);
    const feeType = await resolveFeeType({
      feeTypeId: req.body.feeTypeId,
      feeCode: req.body.feeCode,
      feeLabel: req.body.feeType,
      schoolYearStartYear: activeSchoolYearStartYear
    });
    const feeTypeLabel = feeType?.labelFr || normalizeFeeType(req.body.feeType);
    const currency = normalizeCurrency(req.body.currency) || feeType?.defaultCurrency || "USD";
    if (!feeType) return res.status(400).json({ error: "Impossible de rÃ©soudre feeType" });
    // Un article (vente) se paie librement : pas de mois dû, pas de plafond sur le montant.
    if (hasTenderBreakdown) {
      const safeRate = Number(fxRate || 0);
      if (!(Number.isFinite(safeRate) && safeRate > 0)) {
        return res.status(400).json({ error: "Taux de change requis pour un paiement mixte" });
      }
      amount = currency === "CDF"
        ? Math.round(amountCDFReceived + (amountUSDReceived * safeRate))
        : Number((amountUSDReceived + (amountCDFReceived / safeRate)).toFixed(2));
    }
    const capabilities = await deps.configuration.values();
    if (feeType.code === "BUS" && capabilities["features.busPayments"] === false) return res.status(403).json({ error: "Paiements bus désactivés." });
    if (capabilities["features.manualHistory"] === false && isManualHistory(req.body, BUSINESS_TIMEZONE)) return res.status(403).json({ error: "Historique manuel désactivé." });
    const isItemFee = normalizeBillingCycle(feeType.billingCycle) === "item";
    const hasFixedPrice = feeType.hasFixedPrice !== false;
    // receiptNo and reservedPaymentId from older clients are intentionally
    // ignored. Only the server allocates the final number during the INSERT.

    if (clientRequestId) {
      const existingByClientRequest = await get(
        `SELECT p.*,
                (SELECT COUNT(*)::int FROM receipt_prints rp WHERE rp."paymentId" = p.id) AS "printCount"
         FROM payments p
         WHERE p."clientRequestId" = ?`,
        [clientRequestId]
      );
      if (existingByClientRequest) {
        const statusAfter = await getStudentFeeTimelineStatus({ student, feeType });
        return res.json({
          ...paymentRecordToReceiptJson(existingByClientRequest),
          appliedMonthKey: existingByClientRequest.paidForMonth || existingByClientRequest.monthKey || null,
          statusAfter: {
            monthsPaid: statusAfter.monthsPaid,
            monthsPartial: statusAfter.monthsPartial,
            nextDueMonth: statusAfter.nextDueMonth,
            dueAmount: Number(statusAfter.dueAmount || 0),
            currency: statusAfter.currency,
            paidSoFar: Number(statusAfter.paidSoFar || 0),
            remaining: Number(statusAfter.remaining || 0),
            status: statusAfter.status,
            feeTypeBillingCycle: normalizeBillingCycle(feeType.billingCycle)
          }
        });
      }
    }

    const createdAtOverrideRaw = req.body.created_at || req.body.createdAtOverride || req.body.createdAt;
    const canAddHistoricalPayment = req.auth?.role === "admin" || req.auth?.role === "caissier";
    let createdAtOverride = null;
    if (createdAtOverrideRaw != null && canAddHistoricalPayment) {
      const d = new Date(createdAtOverrideRaw);
      if (Number.isFinite(d.getTime())) createdAtOverride = d.toISOString();
    }
    const now = createdAtOverride ? new Date(createdAtOverride) : new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const requestedMonthKey = paidForMonth || currentMonthKey;
    const forceRequestedMonth = Boolean(req.body?.forceRequestedMonth) && canAddHistoricalPayment;
    const expectationContext = await buildStudentFeeExpectationContext({
      student,
      feeType,
      schoolYearStartYear: activeSchoolYearStartYear
    });
    const annualLock = await getAnnualPaymentLockStatusForCurrentSchoolYear({
      student,
      feeType,
      context: expectationContext
    });
    if (!forceRequestedMonth && annualLock.locked) {
      return res.status(409).json({
        error: "Ce frais annuel est dÃ©jÃ  payÃ© pour cette annÃ©e scolaire",
        code: "ANNUAL_FEE_ALREADY_PAID",
        monthKey: annualLock.dueMonth || null,
        dueAmount: Number(annualLock.dueAmount || 0),
        remaining: Number(annualLock.remaining || 0),
        currency: annualLock.currency || normalizeCurrency(feeType?.defaultCurrency) || "USD"
      });
    }
    const tranchePrerequisite = await getTranchePrerequisiteStatus({
      student,
      feeType,
      now
    });
    if (!forceRequestedMonth && tranchePrerequisite.blocked) {
      return res.status(409).json({
        error: "La tranche prÃ©cÃ©dente n'est pas encore soldÃ©e",
        code: "TRANCHE_PREREQUISITE_UNPAID",
        prerequisiteFeeCode: tranchePrerequisite.prerequisiteFeeCode || null,
        prerequisiteFeeTypeId: tranchePrerequisite.prerequisiteFeeTypeId || null,
        prerequisiteFeeLabel: tranchePrerequisite.prerequisiteFeeLabel || null,
        prerequisiteDueMonth: tranchePrerequisite.prerequisiteDueMonth || null,
        prerequisiteDueAmount: Number(tranchePrerequisite.prerequisiteDueAmount || 0),
        prerequisiteRemaining: Number(tranchePrerequisite.prerequisiteRemaining || 0),
        prerequisiteCurrency: tranchePrerequisite.prerequisiteCurrency || "CDF"
      });
    }
    const requiredMonthKey = normalizeBillingCycle(feeType.billingCycle) === "annual" && annualLock.dueMonth
      ? annualLock.dueMonth
      : await getFirstPendingMonthForFee(student, feeType, expectationContext);
    let appliedMonthKey = forceRequestedMonth ? requestedMonthKey : (requiredMonthKey || requestedMonthKey);
    if (!appliedMonthKey) {
      return res.status(400).json({ error: "Aucun mois payable n'a pu Ãªtre dÃ©terminÃ©" });
    }
    if (!forceRequestedMonth && requiredMonthKey && requestedMonthKey && requestedMonthKey !== requiredMonthKey) {
      // Default Layer 1 rule: force oldest unpaid month first (no skipping partials).
    }

    // Garde-fou : un paiement ne doit JAMAIS etre enregistre sur un mois hors de
    // l'annee scolaire active. Sinon il est invisible dans tous les rapports (bornes
    // par l'annee scolaire) -> le caissier croit que ca a echoue et ressaisit -> doublon
    // en caisse. On ramene le mois dans l'annee active : pour un frais annuel/article,
    // on utilise le mois de reference (debut d'annee) ; sinon le mois courant s'il est
    // dans l'annee, a defaut le debut d'annee.
    if (!forceRequestedMonth && !monthKeyBelongsToSchoolYear(appliedMonthKey, activeSchoolYearStartYear)) {
      const bounds = buildSchoolYearMonthBounds(activeSchoolYearStartYear);
      const cycle = normalizeBillingCycle(feeType.billingCycle);
      const todayMonthKey = monthKeyFromDateOnly(String(createdAtOverride || nowIso()).slice(0, 10));
      const clamped = (cycle !== "annual" && cycle !== "item"
          && todayMonthKey && monthKeyBelongsToSchoolYear(todayMonthKey, activeSchoolYearStartYear))
        ? todayMonthKey
        : (bounds?.startMonth || null);
      if (clamped) appliedMonthKey = clamped;
    }

    const monthStatusBefore = await getStudentFeeMonthStatus({
      student,
      feeType,
      monthKey: appliedMonthKey,
      context: expectationContext
    });
    const remainingBefore = Number(monthStatusBefore?.remaining || 0);
    if (!forceRequestedMonth && !isItemFee && hasFixedPrice) {
      const amountInDueCurrency = convertAmountByFx(
        amount,
        currency,
        monthStatusBefore?.currency || currency,
        fxRate
      );
      if (Number.isFinite(amountInDueCurrency) && amountInDueCurrency > (remainingBefore + 1e-9)) {
        const maxInInputCurrency = convertAmountByFx(
          remainingBefore,
          monthStatusBefore?.currency || currency,
          currency,
          fxRate
        );
        return res.status(409).json({
          error: "Montant supÃ©rieur au solde du mois sÃ©lectionnÃ©",
          code: "AMOUNT_EXCEEDS_MONTH_BALANCE",
          monthKey: appliedMonthKey,
          remaining: remainingBefore,
          remainingCurrency: monthStatusBefore?.currency || currency,
          maxAmountInInputCurrency: Number.isFinite(maxInInputCurrency) ? Number(maxInInputCurrency) : null,
          inputCurrency: currency
        });
      }
    }

    const createdAt = createdAtOverride || nowIso();
    const monthKey = appliedMonthKey;
    const paymentInsertValues = [
      studentId,
      monthKey,
      appliedMonthKey,
      amount,
      currency,
      (Number.isFinite(fxRate) ? fxRate : null),
      amountUSDReceived,
      amountCDFReceived,
      Number(monthStatusBefore?.dueAmount || 0) > 0 ? Number(monthStatusBefore.dueAmount) : null,
      Number(monthStatusBefore?.dueAmount || 0) > 0 ? (normalizeCurrency(monthStatusBefore.currency) || currency) : null,
      feeType.id,
      feeTypeLabel,
      note,
      createdAt,
      createdAt,
      req.auth?.sub ? Number(req.auth.sub) : null,
      req.auth?.username || null,
      clientRequestId,
      student.fullName || null,
      student.matricule || student.id || null,
      student.className || null,
      student.level || null
    ];

    let payment;
    const tx = await pgPool.connect();
    try {
      await tx.query("BEGIN");
      const device = await getOrCreateReceiptDevice(tx, receiptDeviceKey, receiptDeviceLabel);
      const allocation = await allocateDeviceReceipt(tx, device, activeSchoolYearStartYear);
      const inserted = await tx.query(
        `INSERT INTO payments (
           "studentId", "monthKey", "paidForMonth", amount, currency, "fxRate", "amountUSDReceived", "amountCDFReceived", "dueAmountSnapshot", "dueCurrencySnapshot", "feeTypeId", "feeType", note, "createdAt", "paidAt",
           "createdByUserId", "createdByUsername", "clientRequestId",
           "studentNameSnapshot", "studentMatriculeSnapshot", "classNameSnapshot", "levelSnapshot",
           "receiptNo", "receiptDeviceId", "receiptDeviceCode"
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
         RETURNING *`,
        [...paymentInsertValues, allocation.receiptNo, device.id, device.code]
      );
      payment = inserted.rows[0];
      const receiptDoc = buildReceiptDocument({
        payment, feeType, statusAfter: monthStatusBefore,
        schoolYearStartYear: activeSchoolYearStartYear, remainingAfter: null
      });
      await tx.query(
        `UPDATE payments SET "receiptDoc" = $1::jsonb WHERE id = $2`,
        [JSON.stringify(receiptDoc), payment.id]
      );
      payment.receiptDoc = receiptDoc;
      await tx.query("COMMIT");
    } catch (insertErr) {
      await tx.query("ROLLBACK").catch(() => {});
      if (String(insertErr?.code || "") === "23505" && clientRequestId) {
        const existingByClientRequest = await get(
          `SELECT p.*,
                  (SELECT COUNT(*)::int FROM receipt_prints rp WHERE rp."paymentId" = p.id) AS "printCount"
           FROM payments p
           WHERE p."clientRequestId" = ?`,
          [clientRequestId]
        );
        if (existingByClientRequest) {
          const statusAfter = await getStudentFeeTimelineStatus({ student, feeType });
          return res.json({
            ...paymentRecordToReceiptJson(existingByClientRequest),
            appliedMonthKey: existingByClientRequest.paidForMonth || existingByClientRequest.monthKey || null,
            statusAfter: {
              monthsPaid: statusAfter.monthsPaid,
              monthsPartial: statusAfter.monthsPartial,
              nextDueMonth: statusAfter.nextDueMonth,
              dueAmount: Number(statusAfter.dueAmount || 0),
              currency: statusAfter.currency,
              paidSoFar: Number(statusAfter.paidSoFar || 0),
              remaining: Number(statusAfter.remaining || 0),
              status: statusAfter.status,
              feeTypeBillingCycle: normalizeBillingCycle(feeType.billingCycle)
            }
          });
        }
      }
      throw insertErr;
    } finally {
      tx.release();
    }
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "create",
      entityType: "payment",
      entityId: String(payment.id),
      details: { studentId, paidForMonth: appliedMonthKey, requestedMonth: requestedMonthKey, forcedRequestedMonth: forceRequestedMonth, amount, currency, amountUSDReceived, amountCDFReceived, feeTypeId: feeType.id, feeType: feeTypeLabel, receiptNo: payment.receiptNo, receiptDeviceCode: payment.receiptDeviceCode || null }
    });
    const statusAfter = await getStudentFeeTimelineStatus({ student, feeType });
    res.json({
      ...paymentRecordToReceiptJson(payment),
      appliedMonthKey,
      statusAfter: {
        monthsPaid: statusAfter.monthsPaid,
        monthsPartial: statusAfter.monthsPartial,
        nextDueMonth: statusAfter.nextDueMonth,
        dueAmount: Number(statusAfter.dueAmount || 0),
        currency: statusAfter.currency,
        paidSoFar: Number(statusAfter.paidSoFar || 0),
        remaining: Number(statusAfter.remaining || 0),
        status: statusAfter.status,
        feeTypeBillingCycle: normalizeBillingCycle(feeType.billingCycle)
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * List payments (optional filters)
 * query: ?studentId=...&month=YYYY-MM
 */
app.get("/api/payments", async (req, res) => {
  try {
    const includeAllYears = shouldIncludeAllYears(req);
    const schoolYearBounds = includeAllYears ? null : await getActiveSchoolYearMonthBounds();
    const cacheKey = cacheKeyForApi(req, "payments-list");
    const payload = await getCachedHotApiValue(cacheKey, async () => {
      const studentId = req.query.studentId ? String(req.query.studentId).trim() : null;
      const monthKey = normalizeMonthKey(req.query.month) || null;
      const where = [];
      const params = [];
      if (!includeAllYears) {
        const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearBounds.startYear);
        where.push(`((COALESCE(p."paidForMonth", p."monthKey") >= ? AND COALESCE(p."paidForMonth", p."monthKey") <= ?) OR p."receiptNo" LIKE ?)`);
        params.push(schoolYearBounds.startMonth, schoolYearBounds.endMonth, `%-${receiptYear}-%`);
      }
      if (studentId) {
        where.push(`p."studentId" = ?`);
        params.push(studentId);
      }
      if (monthKey) {
        where.push(`p."monthKey" = ?`);
        params.push(monthKey);
      }

      // The list is refreshed in several views. Do not send the immutable
      // receipt document for every historical row: printing already reloads a
      // single payment by id, where receiptDoc remains available.
      const sql = `
        SELECT p.id, p."studentId", p."monthKey", p.amount, p.currency, p.note,
               p."createdAt", p."feeType", p."receiptNo", p."createdByUserId",
               p."createdByUsername", p."studentNameSnapshot", p."classNameSnapshot",
               p."levelSnapshot", p."feeTypeId", p."paidForMonth", p."paidAt",
               p."fxRate", p."clientRequestId", p."studentMatriculeSnapshot",
               p."receiptDeviceId", p."receiptDeviceCode",
               p."paymentMethod", p."cancelledAt", p."cancelledByUserId",
               p."cancelledByUsername", p."cancellationReason", p."cancelledAmount",
               p."dueAmountSnapshot", p."dueCurrencySnapshot", p."amountUSDReceived",
               p."amountCDFReceived",
               COALESCE(rp.c, 0)::int AS "printCount",
               ${correctionSelectSql}
        FROM payments p
        LEFT JOIN (
          SELECT "paymentId", COUNT(*)::int AS c
          FROM receipt_prints
          GROUP BY "paymentId"
        ) rp ON rp."paymentId" = p.id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY p."createdAt" DESC
      `;
      const rows = await all(sql, params);
      return paymentRowsToApiJson(rows);
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/payments/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID paiement requis" });
    // payments.id is BIGINT: a non-numeric id would make PG throw (HTTP 500).
    if (!/^\d+$/.test(id)) return res.status(404).json({ error: "Paiement introuvable" });
    const includeAllYears = shouldIncludeAllYears(req);
    const schoolYearBounds = includeAllYears ? null : await getActiveSchoolYearMonthBounds();
    const where = [
      `p.id = ?`
    ];
    const params = [id];
    if (!includeAllYears) {
      const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearBounds.startYear);
      where.push(`((COALESCE(p."paidForMonth", p."monthKey") >= ? AND COALESCE(p."paidForMonth", p."monthKey") <= ?) OR p."receiptNo" LIKE ?)`);
      params.push(schoolYearBounds.startMonth, schoolYearBounds.endMonth, `%-${receiptYear}-%`);
    }
    const row = await get(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM receipt_prints rp WHERE rp."paymentId" = p.id) AS "printCount",
              ${correctionSelectSql}
       FROM payments p
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!row) return res.status(404).json({ error: "Paiement introuvable" });
    res.json(paymentRecordToReceiptJson(row));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Update payment date
 * roles: admin only
 * body: { createdAt? | date? | paidAt? } in YYYY-MM-DD or JJ/MM/AAAA
 */
app.patch("/api/payments/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID paiement requis" });
    const includeAllYears = shouldIncludeAllYears(req);
    const schoolYearBounds = includeAllYears ? null : await getActiveSchoolYearMonthBounds();
    const where = [`id = ?`];
    const params = [id];
    if (!includeAllYears) {
      const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearBounds.startYear);
      where.push(`((COALESCE("paidForMonth", "monthKey") >= ? AND COALESCE("paidForMonth", "monthKey") <= ?) OR "receiptNo" LIKE ?)`);
      params.push(schoolYearBounds.startMonth, schoolYearBounds.endMonth, `%-${receiptYear}-%`);
    }

    const existing = await get(
      `SELECT * FROM payments
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!existing) return res.status(404).json({ error: "Paiement introuvable" });

    const rawDate = req.body?.createdAt ?? req.body?.date ?? req.body?.paidAt;
    if (rawDate == null || String(rawDate).trim() === "") {
      return res.status(400).json({ error: "Date paiement requise" });
    }
    const dateIso = toDateOnlyISO(rawDate);
    if (!dateIso) {
      return res.status(400).json({ error: "Date paiement invalide (format attendu: JJ/MM/AAAA)" });
    }
    const nextTimestamp = `${dateIso}T12:00:00.000Z`;

    await run(
      `UPDATE payments
       SET "createdAt" = ?, "paidAt" = ?
       WHERE id = ?`,
      [nextTimestamp, nextTimestamp, id]
    );

    const updated = await get(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM receipt_prints rp WHERE rp."paymentId" = p.id) AS "printCount",
              ${correctionSelectSql}
       FROM payments p
       WHERE p.id = ?`,
      [id]
    );

    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update-payment-date",
      entityType: "payment",
      entityId: id,
      details: {
        receiptNo: existing.receiptNo || null,
        before: {
          createdAt: existing.createdAt || null,
          paidAt: existing.paidAt || null
        },
        after: {
          createdAt: nextTimestamp,
          paidAt: nextTimestamp
        }
      }
    });

    res.json(paymentRecordToReceiptJson(updated));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Correct a receipt's accounting allocation without changing its cash movement.
 * Admin only. Immutable fields (amount/currency/date/student/receipt/fx/tender) are
 * deliberately absent from the UPDATE statement.
 */
app.get("/api/payments/:id/reclassification-options", requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^\d+$/.test(id)) return res.status(404).json({ error: "Paiement introuvable" });
    const payment = await get(`SELECT id, "feeTypeId", "paidForMonth", "monthKey" FROM payments WHERE id = ?`, [id]);
    if (!payment) return res.status(404).json({ error: "Paiement introuvable" });
    const monthKey = normalizeMonthKey(payment.paidForMonth || payment.monthKey);
    const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    const schoolYearStartYear = match
      ? (Number(match[2]) >= 9 ? Number(match[1]) : Number(match[1]) - 1)
      : normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting().catch(() => null));
    const rows = await all(
      `SELECT id, code, "labelFr", "defaultCurrency", "billingCycle"
         FROM fee_types
        WHERE "schoolYearStartYear" = ? AND active = TRUE AND id <> ?
        ORDER BY "labelFr" ASC, id ASC`,
      [schoolYearStartYear, payment.feeTypeId || 0]
    );
    res.json({ schoolYearStartYear, feeTypes: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/payments/:id/reclassify", requireRole("admin"), async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: "Paiement introuvable" });
  const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ").slice(0, 300);
  if (reason.length < 3) {
    return res.status(400).json({ error: "Motif de correction requis (minimum 3 caracteres)" });
  }

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [id]);
    const existing = locked.rows?.[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Paiement introuvable" });
    }
    if (existing.cancelledAt) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Un recu annule ne peut pas etre corrige" });
    }
    if (String(existing.paymentMethod || "").toLowerCase() === "staff_benefit") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Modifiez la prise en charge depuis le profil eleve" });
    }

    const monthKey = normalizeMonthKey(existing.paidForMonth || existing.monthKey);
    const monthMatch = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    const paymentSchoolYear = monthMatch
      ? (Number(monthMatch[2]) >= 9 ? Number(monthMatch[1]) : Number(monthMatch[1]) - 1)
      : normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting().catch(() => null));
    const targetFeeType = await resolveFeeType({
      feeTypeId: req.body?.feeTypeId,
      feeCode: req.body?.feeCode,
      feeLabel: req.body?.feeType,
      fallbackTuition: false,
      schoolYearStartYear: paymentSchoolYear
    });
    if (!targetFeeType) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Nouveau type de frais invalide pour cette annee scolaire" });
    }
    if (String(existing.feeTypeId || "") === String(targetFeeType.id)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Le nouveau type est identique au type actuel" });
    }

    const studentResult = await client.query(`SELECT * FROM students WHERE id = $1`, [existing.studentId]);
    const student = studentResult.rows?.[0];
    if (!student) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Eleve lie au paiement introuvable" });
    }
    const expectationContext = await buildStudentFeeExpectationContext({
      student,
      feeType: targetFeeType,
      schoolYearStartYear: paymentSchoolYear
    });
    const targetStatusBefore = await getStudentFeeMonthStatus({
      student,
      feeType: targetFeeType,
      monthKey,
      context: expectationContext
    });
    const correctedAt = nowIso();
    const correctedByUserId = req.auth?.sub ? Number(req.auth.sub) : null;
    const correctedByUsername = req.auth?.username || null;

    const originalCashResult = await client.query(
      `SELECT COALESCE(pr."oldFeeType", original_ft."labelFr") AS "oldFeeType",
              original_ft.code AS "oldFeeCode"
         FROM payment_reclassifications pr
         LEFT JOIN fee_types original_ft ON original_ft.id = pr."oldFeeTypeId"
        WHERE pr."paymentId" = $1
        ORDER BY pr."correctedAt" ASC, pr.id ASC
        LIMIT 1`,
      [id]
    );
    const originalCashRow = originalCashResult.rows?.[0] || null;

    const correctionInsert = await client.query(
      `INSERT INTO payment_reclassifications (
         "paymentId", "oldFeeTypeId", "oldFeeType", "newFeeTypeId", "newFeeType",
         reason, "correctedAt", "correctedByUserId", "correctedByUsername"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [id, existing.feeTypeId || null, existing.feeType || "Minerval", targetFeeType.id,
        targetFeeType.labelFr, reason, correctedAt, correctedByUserId, correctedByUsername]
    );

    const dueAmount = Number(targetStatusBefore?.dueAmount || 0);
    const currentDoc = existing.receiptDoc && typeof existing.receiptDoc === "object" ? existing.receiptDoc : {};
    const cashAllocation = currentDoc.cashAllocation && typeof currentDoc.cashAllocation === "object"
      ? currentDoc.cashAllocation
      : {
          label: originalCashRow?.oldFeeType || currentDoc.fee?.label || existing.feeType || "Minerval",
          code: originalCashRow?.oldFeeCode || currentDoc.fee?.code || null
        };
    const nextDoc = {
      ...currentDoc,
      fee: {
        ...(currentDoc.fee || {}),
        label: targetFeeType.labelFr,
        code: targetFeeType.code || null,
        cycle: normalizeBillingCycle(targetFeeType.billingCycle) || "monthly"
      },
      cashAllocation,
      showMonth: (normalizeBillingCycle(targetFeeType.billingCycle) || "monthly") === "monthly",
      dueAmountSnapshot: dueAmount > 0 ? dueAmount : null,
      dueCurrencySnapshot: dueAmount > 0
        ? (normalizeCurrency(targetStatusBefore?.currency) || normalizeCurrency(targetFeeType.defaultCurrency) || null)
        : null,
      correction: {
        corrected: true,
        oldFeeType: existing.feeType || "Minerval",
        newFeeType: targetFeeType.labelFr,
        correctedAt,
        correctedByUsername,
        reason
      }
    };
    delete nextDoc.hash;
    try { nextDoc.hash = crypto.createHash("sha1").update(JSON.stringify(nextDoc)).digest("hex"); } catch (_) { /* optional */ }

    await client.query(
      `UPDATE payments
          SET "feeTypeId" = $1,
              "feeType" = $2,
              "dueAmountSnapshot" = $3,
              "dueCurrencySnapshot" = $4,
              "receiptDoc" = $5::jsonb
        WHERE id = $6`,
      [targetFeeType.id, targetFeeType.labelFr, dueAmount > 0 ? dueAmount : null,
        dueAmount > 0 ? (normalizeCurrency(targetStatusBefore?.currency) || targetFeeType.defaultCurrency) : null,
        JSON.stringify(nextDoc), id]
    );
    await client.query("COMMIT");

    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "reclassify-payment",
      entityType: "payment",
      entityId: id,
      details: {
        receiptNo: existing.receiptNo || null,
        studentId: existing.studentId,
        amount: Number(existing.amount || 0),
        currency: existing.currency,
        createdAt: existing.createdAt,
        fxRate: existing.fxRate == null ? null : Number(existing.fxRate),
        before: { feeTypeId: existing.feeTypeId || null, feeType: existing.feeType || "Minerval" },
        after: { feeTypeId: targetFeeType.id, feeType: targetFeeType.labelFr },
        reason
      }
    });
    purgeHotApiCache();
    const updated = await get(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM receipt_prints rp WHERE rp."paymentId" = p.id) AS "printCount",
              ${correctionSelectSql}
         FROM payments p WHERE p.id = ?`,
      [id]
    );
    res.json({
      ...paymentRecordToReceiptJson(updated),
      correction: correctionInsert.rows?.[0] || null
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

app.get("/api/payments/:id/corrections", requireRole("admin", "comptable"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^\d+$/.test(id)) return res.status(404).json({ error: "Paiement introuvable" });
    const rows = await all(
      `SELECT id, "paymentId", "oldFeeTypeId", "oldFeeType", "newFeeTypeId", "newFeeType",
              reason, "correctedAt", "correctedByUserId", "correctedByUsername"
         FROM payment_reclassifications
        WHERE "paymentId" = ?
        ORDER BY "correctedAt" DESC, id DESC`,
      [id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/payments/:id/print", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID paiement requis" });
    const includeAllYears = shouldIncludeAllYears(req);
    const schoolYearBounds = includeAllYears ? null : await getActiveSchoolYearMonthBounds();
    const where = [`id = ?`];
    const params = [id];
    if (!includeAllYears) {
      const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearBounds.startYear);
      where.push(`((COALESCE("paidForMonth", "monthKey") >= ? AND COALESCE("paidForMonth", "monthKey") <= ?) OR "receiptNo" LIKE ?)`);
      params.push(schoolYearBounds.startMonth, schoolYearBounds.endMonth, `%-${receiptYear}-%`);
    }
    const payment = await get(
      `SELECT id, "receiptNo", "cancelledAt"
       FROM payments
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!payment) return res.status(404).json({ error: "Paiement introuvable" });
    if (payment.cancelledAt) return res.status(409).json({ error: "Un recu annule ne peut pas etre imprime" });
    const before = await get(
      `SELECT COUNT(*)::int AS c FROM receipt_prints WHERE "paymentId" = ?`,
      [id]
    );
    await run(
      `INSERT INTO receipt_prints ("paymentId", "printedBy", "printedAt")
       VALUES (?, ?, ?)`,
      [id, req.auth?.sub ? Number(req.auth.sub) : null, nowIso()]
    );
    const after = await get(
      `SELECT COUNT(*)::int AS c FROM receipt_prints WHERE "paymentId" = ?`,
      [id]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "print",
      entityType: "receipt",
      entityId: String(id),
      details: { receiptNo: payment.receiptNo || null, previousPrintCount: Number(before?.c || 0), currentPrintCount: Number(after?.c || 0) }
    });
    res.json({ ok: true, previousPrintCount: Number(before?.c || 0), currentPrintCount: Number(after?.c || 0) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/receipts", async (req, res) => {
  try {
    const includeAllYears = shouldIncludeAllYears(req);
    const schoolYearBounds = includeAllYears ? null : await getActiveSchoolYearMonthBounds();
    const cacheKey = cacheKeyForApi(req, "receipts-list");
    const payload = await getCachedHotApiValue(cacheKey, async () => {
      const studentId = req.query.studentId ? String(req.query.studentId).trim() : null;
      const from = req.query.from ? String(req.query.from).trim() : null;
      const to = req.query.to ? String(req.query.to).trim() : null;
      const where = [];
      const params = [];
      if (!includeAllYears) {
        const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearBounds.startYear);
        where.push(`((COALESCE(p."paidForMonth", p."monthKey") >= ? AND COALESCE(p."paidForMonth", p."monthKey") <= ?) OR p."receiptNo" LIKE ?)`);
        params.push(schoolYearBounds.startMonth, schoolYearBounds.endMonth, `%-${receiptYear}-%`);
      }
      if (studentId) {
        where.push(`p."studentId" = ?`);
        params.push(studentId);
      }
      if (from) {
        where.push(`DATE(p."createdAt") >= ?::date`);
        params.push(from);
      }
      if (to) {
        where.push(`DATE(p."createdAt") <= ?::date`);
        params.push(to);
      }
      const rows = await all(
        `SELECT p.*,
                COALESCE(rp.c, 0)::int AS "printCount",
                ${correctionSelectSql}
         FROM payments p
         LEFT JOIN (
           SELECT "paymentId", COUNT(*)::int AS c
           FROM receipt_prints
           GROUP BY "paymentId"
         ) rp ON rp."paymentId" = p.id
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY p."createdAt" DESC`,
        params
      );
      return paymentRowsToApiJson(rows);
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/payments/:id/cancel", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^\d+$/.test(id)) return res.status(404).json({ error: "Paiement introuvable" });
    const reason = String(req.body?.reason || "").trim().replace(/\s+/g, " ").slice(0, 300);
    if (reason.length < 3) {
      return res.status(400).json({ error: "Motif d'annulation requis (minimum 3 caracteres)" });
    }
    if (req.body?.cashReturned !== true) {
      return res.status(400).json({
        error: "Confirmez que l'argent a ete rembourse et retire de la caisse. Pour corriger un type de frais, utilisez Corriger le recu."
      });
    }

    const includeAllYears = shouldIncludeAllYears(req);
    const schoolYearBounds = includeAllYears ? null : await getActiveSchoolYearMonthBounds();
    const where = [`id = ?`];
    const params = [id];
    if (!includeAllYears) {
      const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearBounds.startYear);
      where.push(`((COALESCE("paidForMonth", "monthKey") >= ? AND COALESCE("paidForMonth", "monthKey") <= ?) OR "receiptNo" LIKE ?)`);
      params.push(schoolYearBounds.startMonth, schoolYearBounds.endMonth, `%-${receiptYear}-%`);
    }
    const existing = await get(
      `SELECT * FROM payments WHERE ${where.join(" AND ")}`,
      params
    );
    if (!existing) return res.status(404).json({ error: "Paiement introuvable" });
    if (existing.cancelledAt) return res.status(409).json({ error: "Ce recu est deja annule" });
    if (String(existing.paymentMethod || "").toLowerCase() === "staff_benefit") {
      return res.status(409).json({ error: "Modifiez la prise en charge depuis le profil eleve" });
    }

    const cancelledAt = nowIso();
    const result = await pgPool.query(
      `UPDATE payments
       SET "cancelledAmount" = amount,
           amount = 0,
           "cancelledAt" = $1,
           "cancelledByUserId" = $2,
           "cancelledByUsername" = $3,
           "cancellationReason" = $4,
           "cancellationCashReturned" = TRUE
       WHERE id = $5 AND "cancelledAt" IS NULL
       RETURNING *`,
      [cancelledAt, req.auth?.sub ? Number(req.auth.sub) : null, req.auth?.username || null, reason, id]
    );
    const updated = result.rows?.[0];
    if (!updated) return res.status(409).json({ error: "Ce recu est deja annule" });

    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "cancel",
      entityType: "payment",
      entityId: id,
      details: {
        receiptNo: existing.receiptNo || null,
        studentId: existing.studentId,
        monthKey: existing.paidForMonth || existing.monthKey,
        amount: Number(existing.amount || 0),
        currency: existing.currency,
        feeType: existing.feeType || "Minerval",
        cashReturned: true,
        reason
      }
    });
    purgeHotApiCache();
    res.json(paymentRecordToReceiptJson(updated));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/payments/:id", requireRole("admin", "comptable"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID paiement requis" });
    const includeAllYears = shouldIncludeAllYears(req);
    const schoolYearBounds = includeAllYears ? null : await getActiveSchoolYearMonthBounds();
    const where = [`id = ?`];
    const params = [id];
    if (!includeAllYears) {
      where.push(`COALESCE("paidForMonth", "monthKey") >= ?`, `COALESCE("paidForMonth", "monthKey") <= ?`);
      params.push(schoolYearBounds.startMonth, schoolYearBounds.endMonth);
    }

    const existing = await get(
      `SELECT * FROM payments
       WHERE ${where.join(" AND ")}`,
      params
    );
    if (!existing) return res.status(404).json({ error: "Paiement introuvable" });
    if (String(req.auth?.role || "").toLowerCase() === "comptable") {
      const created = existing.createdAt ? new Date(existing.createdAt) : null;
      const now = new Date();
      const sameDay = created &&
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth() &&
        created.getDate() === now.getDate();
      if (!sameDay) {
        return res.status(403).json({ error: "Comptable ne peut supprimer que les paiements du jour" });
      }
    }

    await run(`DELETE FROM payments WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "delete",
      entityType: "payment",
      entityId: id,
      details: {
        studentId: existing.studentId,
        monthKey: existing.monthKey,
        amount: existing.cancelledAmount == null ? existing.amount : existing.cancelledAmount,
        wasCancelled: Boolean(existing.cancelledAt),
        feeType: existing.feeType || "Minerval"
      }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Spending (DB source of truth when online; UI may keep local cache/outbox offline)
app.get("/api/spending", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const cacheKey = cacheKeyForApi(req, "spending-list");
    const payload = await getCachedHotApiValue(cacheKey, async () => {
      const schoolYearBounds = await getActiveSchoolYearMonthBounds();
      const activeSchoolYearStartYear = schoolYearBounds?.startYear || normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
      const from = req.query.from ? String(req.query.from).trim() : "";
      const to = req.query.to ? String(req.query.to).trim() : "";
      const category = req.query.category ? String(req.query.category).trim() : "";
      const where = [`"schoolYearStartYear" = ?`];
      const params = [activeSchoolYearStartYear];
      if (from) { where.push(`"date" >= ?::date`); params.push(from); }
      if (to) { where.push(`"date" <= ?::date`); params.push(to); }
      if (category) { where.push(`category = ?`); params.push(category); }
      const rows = await all(
        `SELECT id, "date", category, amount, currency, "fxRate", note,
                "appliesToMonth",
                "caisseBoxKey",
                "schoolYearStartYear",
                "createdByUserId", "createdByUsername", "createdAt"
         FROM spending
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY "date" DESC, "createdAt" DESC`,
        params
      );
      return rows.map((r) => ({
        id: r.id,
        date: toDateOnlyISO(r.date),
        category: r.category,
        amount: Number(r.amount || 0),
        currency: r.currency,
        fxRate: r.fxRate == null ? null : Number(r.fxRate),
        note: r.note || "",
        description: r.note || "",
        caisseBoxKey: normalizeCaisseBoxKey(r.caisseBoxKey),
        appliesToMonth: resolveSpendingAppliesToMonth(r.appliesToMonth, r.schoolYearStartYear, r.date),
        schoolYearStartYear: Number.isFinite(Number(r.schoolYearStartYear)) ? Number(r.schoolYearStartYear) : null,
        createdByUserId: r.createdByUserId || null,
        createdByUsername: r.createdByUsername || null,
        createdAt: r.createdAt
      }));
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/caisse-transfers", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const cacheKey = cacheKeyForApi(req, "caisse-transfers-list");
    const payload = await getCachedHotApiValue(cacheKey, async () => {
      const activeSchoolYearBounds = await getActiveSchoolYearMonthBounds();
      const activeSchoolYearStartYear = activeSchoolYearBounds?.startYear || normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
      const requestedSchoolYearStartYear = normalizeSchoolYearStartYear(req.query?.schoolYearStartYear);
      const targetSchoolYearStartYear = requestedSchoolYearStartYear || activeSchoolYearStartYear;
      const rows = await all(
        `SELECT id, "date", "appliesToMonth", mode,
                "sourceBoxKey", "counterpartyBoxKey",
                "sourceCurrency", "sourceAmount",
                "counterCurrency", "counterAmount",
                "fxRate", note, "schoolYearStartYear",
                "createdByUserId", "createdByUsername", "createdAt"
         FROM caisse_transfers
         WHERE "schoolYearStartYear" = ?
         ORDER BY "date" DESC, "createdAt" DESC`,
        [targetSchoolYearStartYear]
      );
      return rows.map((row) => ({
        id: row.id,
        date: toDateOnlyISO(row.date),
        appliesToMonth: resolveSpendingAppliesToMonth(row.appliesToMonth, row.schoolYearStartYear, row.date),
        mode: String(row.mode || "").trim().toLowerCase() === "exchange" ? "exchange" : "transfer",
        sourceBoxKey: normalizeCaisseBoxKey(row.sourceBoxKey),
        counterpartyBoxKey: normalizeCaisseBoxKey(row.counterpartyBoxKey),
        sourceCurrency: normalizeCurrency(row.sourceCurrency) || "USD",
        sourceAmount: roundCurrencyAmount(row.sourceAmount, row.sourceCurrency),
        counterCurrency: row.counterCurrency == null ? null : (normalizeCurrency(row.counterCurrency) || null),
        counterAmount: row.counterCurrency == null ? 0 : roundCurrencyAmount(row.counterAmount, row.counterCurrency),
        fxRate: row.fxRate == null ? null : Number(row.fxRate),
        note: row.note || "",
        schoolYearStartYear: Number.isFinite(Number(row.schoolYearStartYear)) ? Number(row.schoolYearStartYear) : null,
        createdByUserId: row.createdByUserId || null,
        createdByUsername: row.createdByUsername || null,
        createdAt: row.createdAt
      }));
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/caisse-transfers", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const date = String(req.body?.date || "").trim();
    const mode = String(req.body?.mode || "").trim().toLowerCase() === "exchange" ? "exchange" : "transfer";
    const sourceBoxKey = normalizeCaisseBoxKey(req.body?.sourceBoxKey ?? req.body?.source_box_key);
    const counterpartyBoxKey = normalizeCaisseBoxKey(req.body?.counterpartyBoxKey ?? req.body?.counterparty_box_key);
    const sourceCurrency = normalizeCurrency(req.body?.sourceCurrency ?? req.body?.source_currency) || "USD";
    const rawCounterCurrency = req.body?.counterCurrency ?? req.body?.counter_currency ?? null;
    const counterCurrency = mode === "exchange"
      ? (normalizeCurrency(rawCounterCurrency) || null)
      : sourceCurrency;
    const sourceAmount = normalizePositiveAmountByCurrency(req.body?.sourceAmount ?? req.body?.amount, sourceCurrency);
    const fxRate = mode === "exchange"
      ? Number(req.body?.fxRate ?? req.body?.fx_rate ?? 0)
      : null;
    const note = req.body?.note == null ? "" : String(req.body.note).trim();
    const isParentChangeTransfer = isParentChangeTransferPayload({ mode, counterpartyBoxKey, note });
    const activeSchoolYearBounds = await getActiveSchoolYearMonthBounds();
    const activeSchoolYearStartYear = activeSchoolYearBounds?.startYear || normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
    const requestedSchoolYearStartYear = normalizeSchoolYearStartYear(req.body?.schoolYearStartYear);
    const transferSchoolYearStartYear = requestedSchoolYearStartYear || activeSchoolYearStartYear;
    const rawAppliesToMonth = req.body?.appliesToMonth ?? req.body?.applies_to_month ?? null;
    const appliesToMonthInput = rawAppliesToMonth == null ? "" : String(rawAppliesToMonth).trim();
    const appliesToMonthProvided = appliesToMonthInput !== "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "La date doit etre au format YYYY-MM-DD" });
    }
    if (!sourceBoxKey) return res.status(400).json({ error: "Caisse source requise" });
    if (!counterpartyBoxKey) return res.status(400).json({ error: "Caisse contrepartie requise" });
    if (sourceBoxKey === counterpartyBoxKey) {
      return res.status(400).json({ error: "Choisissez deux caisses differentes" });
    }
    if (!sourceAmount) {
      return res.status(400).json({ error: "Montant source invalide" });
    }
    if (appliesToMonthProvided && !normalizeMonthKey(appliesToMonthInput)) {
      return res.status(400).json({ error: "Le mois impute doit etre au format YYYY-MM" });
    }
    if (appliesToMonthProvided && !monthKeyBelongsToSchoolYear(appliesToMonthInput, transferSchoolYearStartYear)) {
      return res.status(400).json({ error: "Le mois impute doit appartenir a l'annee scolaire active" });
    }
    if (mode === "exchange" && !counterCurrency) {
      return res.status(400).json({ error: "Devise recue requise pour le change" });
    }
    if (mode === "exchange" && counterCurrency === sourceCurrency) {
      return res.status(400).json({ error: "Le change doit utiliser deux devises differentes" });
    }
    if (mode === "exchange" && (!Number.isFinite(fxRate) || fxRate <= 0)) {
      return res.status(400).json({ error: "Taux invalide pour le change" });
    }
    const counterAmount = mode === "exchange"
      ? computeExchangeCounterAmount(sourceAmount, sourceCurrency, counterCurrency, fxRate)
      : roundCurrencyAmount(sourceAmount, sourceCurrency);
    if (!(Number(counterAmount || 0) > 0)) {
      return res.status(400).json({ error: "Montant recu invalide pour ce change" });
    }
    if (isParentChangeTransfer) {
      const nearestFive = Math.round(Number(counterAmount || 0) / 5) * 5;
      const isMultipleOfFive = Math.abs(Number(counterAmount || 0) - nearestFive) < 0.000001;
      if (sourceCurrency !== "CDF" || counterCurrency !== "USD" || Number(counterAmount || 0) < 5 || !isMultipleOfFive) {
        return res.status(400).json({ error: "Change parent: montant USD minimum 5 et par multiples de 5 uniquement." });
      }
    }
    const appliesToMonth = resolveSpendingAppliesToMonth(appliesToMonthInput, transferSchoolYearStartYear, date);

    const client = await pgPool.connect();
    let created = null;
    try {
      await client.query("BEGIN");
      const feeContext = await getCaisseFeeContextForSchoolYear(transferSchoolYearStartYear, client);
      const sourceBox = findCaisseBoxDefinitionByKey(feeContext.definitions, sourceBoxKey);
      const counterpartyBox = findCaisseBoxDefinitionByKey(feeContext.definitions, counterpartyBoxKey);
      if (!sourceBox || (!isParentChangeTransfer && !counterpartyBox)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Une des caisses selectionnees est introuvable pour cette annee scolaire" });
      }

      const lockLegs = [
        { boxKey: sourceBoxKey, currency: sourceCurrency }
      ];
      if (!isParentChangeTransfer) {
        lockLegs.push({ boxKey: counterpartyBoxKey, currency: sourceCurrency });
      }
      if (mode === "exchange" && counterCurrency) {
        if (!isParentChangeTransfer) {
          lockLegs.push({ boxKey: counterpartyBoxKey, currency: counterCurrency });
        }
        lockLegs.push({ boxKey: sourceBoxKey, currency: counterCurrency });
      }
      await lockCaisseBalanceKeys(client, transferSchoolYearStartYear, lockLegs);

      const sourceAvailable = await getCaisseBoxAvailableAmount(date, sourceBoxKey, sourceCurrency, client, {
        schoolYearStartYear: transferSchoolYearStartYear
      });
      if (sourceAmount > (sourceAvailable + 1e-9)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Montant source superieur au solde disponible dans la caisse source.",
          code: "CAISSE_TRANSFER_INSUFFICIENT_SOURCE",
          boxKey: sourceBoxKey,
          currency: sourceCurrency,
          requested: sourceAmount,
          available: Math.max(0, sourceAvailable)
        });
      }

      if (mode === "exchange" && counterCurrency && !isParentChangeTransfer) {
        const counterpartyAvailable = await getCaisseBoxAvailableAmount(date, counterpartyBoxKey, counterCurrency, client, {
          schoolYearStartYear: transferSchoolYearStartYear
        });
        if (counterAmount > (counterpartyAvailable + 1e-9)) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "La caisse contrepartie n'a pas assez d'argent dans la devise a remettre.",
            code: "CAISSE_TRANSFER_INSUFFICIENT_COUNTERPARTY",
            boxKey: counterpartyBoxKey,
            currency: counterCurrency,
            requested: counterAmount,
            available: Math.max(0, counterpartyAvailable)
          });
        }
      }

      const createdAt = nowIso();
      const row = await client.query(
        `INSERT INTO caisse_transfers (
           "date", "appliesToMonth", mode,
           "sourceBoxKey", "counterpartyBoxKey",
           "sourceCurrency", "sourceAmount",
           "counterCurrency", "counterAmount",
           "fxRate", note, "schoolYearStartYear",
           "createdByUserId", "createdByUsername", "createdAt"
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id, "date", "appliesToMonth", mode,
                   "sourceBoxKey", "counterpartyBoxKey",
                   "sourceCurrency", "sourceAmount",
                   "counterCurrency", "counterAmount",
                   "fxRate", note, "schoolYearStartYear",
                   "createdByUserId", "createdByUsername", "createdAt"`,
        [
          date,
          appliesToMonth,
          mode,
          sourceBoxKey,
          counterpartyBoxKey,
          sourceCurrency,
          sourceAmount,
          mode === "exchange" ? counterCurrency : sourceCurrency,
          mode === "exchange" ? counterAmount : roundCurrencyAmount(sourceAmount, sourceCurrency),
          mode === "exchange" ? fxRate : null,
          note,
          transferSchoolYearStartYear,
          req.auth?.sub ? Number(req.auth.sub) : null,
          req.auth?.username || null,
          createdAt
        ]
      );
      created = row.rows?.[0] || null;
      await client.query("COMMIT");
    } catch (errTx) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
      throw errTx;
    } finally {
      client.release();
    }

    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "create",
      entityType: "caisse_transfer",
      entityId: String(created?.id || ""),
      details: {
        date,
        appliesToMonth,
        mode,
        sourceBoxKey,
        counterpartyBoxKey,
        sourceCurrency,
        sourceAmount,
        counterCurrency: mode === "exchange" ? counterCurrency : sourceCurrency,
        counterAmount,
        fxRate: mode === "exchange" ? fxRate : null,
        schoolYearStartYear: transferSchoolYearStartYear
      }
    });
    purgeHotApiCache();
    res.json({
      id: created.id,
      date: toDateOnlyISO(created.date),
      appliesToMonth: resolveSpendingAppliesToMonth(created.appliesToMonth, created.schoolYearStartYear, created.date),
      mode: String(created.mode || "").trim().toLowerCase() === "exchange" ? "exchange" : "transfer",
      sourceBoxKey: normalizeCaisseBoxKey(created.sourceBoxKey),
      counterpartyBoxKey: normalizeCaisseBoxKey(created.counterpartyBoxKey),
      sourceCurrency: normalizeCurrency(created.sourceCurrency) || "USD",
      sourceAmount: roundCurrencyAmount(created.sourceAmount, created.sourceCurrency),
      counterCurrency: created.counterCurrency == null ? null : (normalizeCurrency(created.counterCurrency) || null),
      counterAmount: created.counterCurrency == null ? 0 : roundCurrencyAmount(created.counterAmount, created.counterCurrency),
      fxRate: created.fxRate == null ? null : Number(created.fxRate),
      note: created.note || "",
      schoolYearStartYear: Number.isFinite(Number(created.schoolYearStartYear)) ? Number(created.schoolYearStartYear) : transferSchoolYearStartYear,
      createdByUserId: created.createdByUserId || null,
      createdByUsername: created.createdByUsername || null,
      createdAt: created.createdAt
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/caisse-transfers/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id requis" });
    const activeSchoolYearBounds = await getActiveSchoolYearMonthBounds();
    const activeSchoolYearStartYear = activeSchoolYearBounds?.startYear || normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
    const requestedSchoolYearStartYear = normalizeSchoolYearStartYear(req.query?.schoolYearStartYear);
    const transferSchoolYearStartYear = requestedSchoolYearStartYear || activeSchoolYearStartYear;
    const existing = await get(
      `SELECT *
       FROM caisse_transfers
       WHERE id = ?
         AND "schoolYearStartYear" = ?`,
      [id, transferSchoolYearStartYear]
    );
    if (!existing) return res.status(404).json({ error: "Transfert caisse introuvable" });
    await run(`DELETE FROM caisse_transfers WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "delete",
      entityType: "caisse_transfer",
      entityId: id,
      details: {
        mode: existing.mode,
        sourceBoxKey: existing.sourceBoxKey,
        counterpartyBoxKey: existing.counterpartyBoxKey,
        sourceCurrency: existing.sourceCurrency,
        sourceAmount: Number(existing.sourceAmount || 0),
        counterCurrency: existing.counterCurrency || null,
        counterAmount: Number(existing.counterAmount || 0),
        schoolYearStartYear: transferSchoolYearStartYear
      }
    });
    purgeHotApiCache();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

async function getCashBalanceByCurrencyUpToDate(dateIso, db = pgPool, options = {}) {
  const safeDate = String(dateIso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    return {
      entryUSD: 0,
      entryCDF: 0,
      spendingUSD: 0,
      spendingCDF: 0,
      netUSD: 0,
      netCDF: 0
    };
  }

  const queryDb = db && typeof db.query === "function" ? db : pgPool;
  const activeBounds = await getActiveSchoolYearMonthBounds();
  const targetBounds = buildSchoolYearMonthBounds(options?.schoolYearStartYear) || activeBounds;
  const paymentsRes = await queryDb.query(
    `SELECT currency, COALESCE(SUM(amount), 0)::numeric AS total
     FROM payments
     WHERE ("createdAt" AT TIME ZONE $2)::date <= $1::date
       AND COALESCE("paidForMonth", "monthKey") >= $3
       AND COALESCE("paidForMonth", "monthKey") <= $4
       AND "paymentMethod" IS DISTINCT FROM 'staff_benefit'
     GROUP BY currency`,
    [safeDate, BUSINESS_TIMEZONE, targetBounds.startMonth, targetBounds.endMonth]
  );
  const spendingRes = await queryDb.query(
    `SELECT currency, COALESCE(SUM(amount), 0)::numeric AS total
     FROM spending
     WHERE "date" <= $1::date
       AND "schoolYearStartYear" = $2
     GROUP BY currency`,
    [safeDate, targetBounds.startYear]
  );

  let entryUSD = 0;
  let entryCDF = 0;
  for (const r of paymentsRes.rows || []) {
    const cur = normalizeCurrency(r.currency) || "USD";
    const v = Number(r.total || 0);
    if (!Number.isFinite(v)) continue;
    if (cur === "CDF") entryCDF += v;
    else entryUSD += v;
  }

  let spendingUSD = 0;
  let spendingCDF = 0;
  for (const r of spendingRes.rows || []) {
    const cur = normalizeCurrency(r.currency) || "USD";
    const v = Number(r.total || 0);
    if (!Number.isFinite(v)) continue;
    if (cur === "CDF") spendingCDF += v;
    else spendingUSD += v;
  }

  const netUSD = Number((entryUSD - spendingUSD).toFixed(2));
  const netCDF = Math.round(entryCDF - spendingCDF);
  return {
    entryUSD: Number(entryUSD || 0),
    entryCDF: Number(entryCDF || 0),
    spendingUSD: Number(spendingUSD || 0),
    spendingCDF: Number(spendingCDF || 0),
    netUSD,
    netCDF
  };
}

app.post("/api/spending", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const date = String(req.body?.date || "").trim();
    const category = String(req.body?.category || "").trim();
    const amount = Number(req.body?.amount ?? 0);
    const currency = normalizeCurrency(req.body?.currency) || "USD";
    const fxRate = req.body?.fxRate == null ? null : Number(req.body.fxRate);
    const note = req.body?.note == null ? null : String(req.body.note).trim();
    const requestedCaisseBoxKey = normalizeCaisseBoxKey(req.body?.caisseBoxKey ?? req.body?.caisse_box_key);
    const activeSchoolYearBounds = await getActiveSchoolYearMonthBounds();
    const activeSchoolYearStartYear = activeSchoolYearBounds?.startYear || normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
    const requestedSchoolYearStartYear = normalizeSchoolYearStartYear(req.body?.schoolYearStartYear);
    const spendingSchoolYearStartYear = requestedSchoolYearStartYear || activeSchoolYearStartYear;
    const rawAppliesToMonth = req.body?.appliesToMonth ?? req.body?.applies_to_month ?? req.body?.monthKey ?? null;
    const appliesToMonthInput = rawAppliesToMonth == null ? "" : String(rawAppliesToMonth).trim();
    const appliesToMonthProvided = appliesToMonthInput !== "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "La date doit Ãªtre au format YYYY-MM-DD" });
    if (!category) return res.status(400).json({ error: "CatÃ©gorie requise" });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Le montant doit Ãªtre > 0" });
    if (appliesToMonthProvided && !normalizeMonthKey(appliesToMonthInput)) {
      return res.status(400).json({ error: "Le mois imputÃ© doit Ãªtre au format YYYY-MM" });
    }
    if (appliesToMonthProvided && !monthKeyBelongsToSchoolYear(appliesToMonthInput, spendingSchoolYearStartYear)) {
      return res.status(400).json({ error: "Le mois imputÃ© doit appartenir Ã  l'annÃ©e scolaire active" });
    }
    const appliesToMonth = resolveSpendingAppliesToMonth(appliesToMonthInput, spendingSchoolYearStartYear, date);

    const client = await pgPool.connect();
    let spending = null;
    try {
      await client.query("BEGIN");
      const feeContext = await getCaisseFeeContextForSchoolYear(spendingSchoolYearStartYear, client);
      const explicitCaisseBoxKey = requestedCaisseBoxKey
        || caisseBoxKeyFromSpendingCategory(category, feeContext.definitions)
        || "";
      const balanceCaisseBoxKey = explicitCaisseBoxKey || "minerval";
      const caisseBox = findCaisseBoxDefinitionByKey(feeContext.definitions, balanceCaisseBoxKey);
      if (!caisseBox) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Caisse introuvable pour cette depense" });
      }
      await lockCaisseBalanceKeys(client, spendingSchoolYearStartYear, [
        { boxKey: balanceCaisseBoxKey, currency }
      ]);

      const availableRaw = await getCaisseBoxAvailableAmount(date, balanceCaisseBoxKey, currency, client, {
        schoolYearStartYear: spendingSchoolYearStartYear
      });
      const available = Number.isFinite(availableRaw) ? availableRaw : 0;
      if (!(available > 0)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Solde insuffisant: aucune dÃ©pense possible pour cette devise.",
          code: "SPENDING_INSUFFICIENT_BALANCE",
          date,
          caisseBoxKey: balanceCaisseBoxKey,
          currency,
          requested: amount,
          available: Math.max(0, available)
        });
      }
      if (amount > (available + 1e-9)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Montant de dÃ©pense supÃ©rieur au solde disponible.",
          code: "SPENDING_INSUFFICIENT_BALANCE",
          date,
          caisseBoxKey: balanceCaisseBoxKey,
          currency,
          requested: amount,
          available: Math.max(0, available)
        });
      }

      const createdAt = nowIso();
      const row = await client.query(
        `INSERT INTO spending ("date", category, amount, currency, "fxRate", note, "appliesToMonth", "caisseBoxKey", "schoolYearStartYear", "createdByUserId", "createdByUsername", "createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, "date", category, amount, currency, "fxRate", note, "appliesToMonth", "caisseBoxKey", "schoolYearStartYear", "createdByUserId", "createdByUsername", "createdAt"`,
        [date, category, amount, currency, fxRate, note, appliesToMonth, explicitCaisseBoxKey || null, spendingSchoolYearStartYear, req.auth?.sub ? Number(req.auth.sub) : null, req.auth?.username || null, createdAt]
      );
      spending = row.rows[0];
      await client.query("COMMIT");
    } catch (errTx) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
      throw errTx;
    } finally {
      client.release();
    }

    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "create",
      entityType: "spending",
      entityId: String(spending.id),
      details: {
        date,
        category,
        amount,
        currency,
        note,
        appliesToMonth,
        caisseBoxKey: normalizeCaisseBoxKey(spending.caisseBoxKey),
        schoolYearStartYear: spendingSchoolYearStartYear
      }
    });
    purgeHotApiCache();
    res.json({
      id: spending.id,
      date: toDateOnlyISO(spending.date),
      category: spending.category,
      amount: Number(spending.amount || 0),
      currency: spending.currency,
      fxRate: spending.fxRate == null ? null : Number(spending.fxRate),
      note: spending.note || "",
      description: spending.note || "",
      caisseBoxKey: normalizeCaisseBoxKey(spending.caisseBoxKey),
      appliesToMonth: resolveSpendingAppliesToMonth(spending.appliesToMonth, spending.schoolYearStartYear, spending.date),
      schoolYearStartYear: Number.isFinite(Number(spending.schoolYearStartYear)) ? Number(spending.schoolYearStartYear) : spendingSchoolYearStartYear,
      createdByUserId: spending.createdByUserId || null,
      createdByUsername: spending.createdByUsername || null,
      createdAt: spending.createdAt
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/spending/:id", requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id requis" });
    const activeSchoolYearBounds = await getActiveSchoolYearMonthBounds();
    const activeSchoolYearStartYear = activeSchoolYearBounds?.startYear || normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
    const requestedSchoolYearStartYear = normalizeSchoolYearStartYear(req.query?.schoolYearStartYear);
    const spendingSchoolYearStartYear = requestedSchoolYearStartYear || activeSchoolYearStartYear;
    const existing = await get(
      `SELECT * FROM spending WHERE id = ? AND "schoolYearStartYear" = ?`,
      [id, spendingSchoolYearStartYear]
    );
    if (!existing) return res.status(404).json({ error: "DÃ©pense introuvable" });
    await run(`DELETE FROM spending WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "delete",
      entityType: "spending",
      entityId: id,
      details: {
        category: existing.category,
        amount: existing.amount,
        currency: existing.currency,
        schoolYearStartYear: spendingSchoolYearStartYear
      }
    });
    purgeHotApiCache();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
}

module.exports = registerPaymentsRoutes;
