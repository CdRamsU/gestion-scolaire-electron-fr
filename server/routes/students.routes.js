const { buildReturningStudentIdSet } = require("../student-returning");

function registerStudentsRoutes(app, deps) {
  const {
    requireRole,
    get,
    all,
    run,
    pgPool,
    writeAudit,
    normalizeBillingCycle,
    normalizeCurrency,
    normalizeMonthKey,
    getStudentBusSubscription,
    getStudentBusPricing,
    getStudentTuitionBenefit,
    syncStudentTuitionBenefitPayments,
    getFeeTypeByCode,
    compareMonthKeys,
    resolveFeeType,
    buildStudentFeeExpectationContext,
    getStudentFeeTimelineStatus,
    getAnnualPaymentLockStatusForCurrentSchoolYear,
    getTranchePrerequisiteStatus,
    getStudentFeeMonthStatus,
    SQL_ACTIVE_TRUE,
    buildStudentFeeExpectationContextFromPreload,
    normalizePaymentRowsForFeeContext,
    getFeeTypeLegacyLabelCandidates,
    parseStudentBusSubscriptionRow,
    defaultMonthlyDueForLevelClass,
    normalizeLevel,
    normalizeSex,
    normalizeDateOfBirth,
    normalizeOptionalText,
    normalizeStudentMatricule,
    makeStudentId,
    nowIso,
    getDefaultTuitionFeeType,
    getTuitionLabelCandidates,
    toDateOnlyISO,
    getStudentTuitionMonthlyDue,
    getLevelMonthlyDueSetting,
    getSchoolYearStartYearSetting,
    snapshotExistingPaymentDues
  } = deps;

  function normalizeSchoolYearStartYear(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const y = Math.floor(n);
    if (y < 2000 || y > 2100) return null;
    return y;
  }
  function isActiveStudentRecord(student) {
    if (!student) return false;
    return student.isActive !== false && student.isActive !== 0 && student.isActive !== "0";
  }
  const INACTIVE_REASON_CATEGORIES = Object.freeze([
    "Doublon",
    "Déménagement",
    "Transfert",
    "Abandon",
    "Exclusion",
    "Fin de cycle",
    "Autre"
  ]);
  function normalizeInactiveReasonCategory(value) {
    const raw = String(value || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    const normalized = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const match = INACTIVE_REASON_CATEGORIES.find((label) =>
      label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalized
    );
    return match || "";
  }

async function getActiveSchoolYearStartYear() {
  const configured = normalizeSchoolYearStartYear(await getSchoolYearStartYearSetting());
  if (configured) return configured;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? year : (year - 1);
}

const CLASS_CODE_CAPACITY = 50;
const CLASS_CODE_LEVELS = new Set(["maternelle", "primaire", "secondaire"]);
const CLASS_CODE_LETTERS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");

function normalizeClassCodeLetter(value) {
  const raw = String(value || "").trim().toUpperCase();
  return /^[A-Z]$/.test(raw) ? raw : "";
}

function splitClassBaseAndCode(levelValue, className) {
  const lvl = normalizeLevel(levelValue);
  const raw = String(className || "").trim().replace(/\s+/g, " ");
  if (!raw) return { base: "", code: "" };
  if (!CLASS_CODE_LEVELS.has(lvl)) return { base: raw, code: "" };
  const match = raw.match(/^(.*\S)\s+([A-Z])$/i);
  if (!match) return { base: raw, code: "" };
  return {
    base: String(match[1] || "").trim(),
    code: normalizeClassCodeLetter(match[2])
  };
}

function firstAvailableClassCode(countByCode) {
  for (const code of CLASS_CODE_LETTERS) {
    if (Number(countByCode.get(code) || 0) < CLASS_CODE_CAPACITY) return code;
  }
  return null;
}

function makeClassCodeError(message, httpStatus = 400, code = "CLASS_CODE_ERROR", details = null) {
  const err = new Error(message);
  err.httpStatus = Number(httpStatus || 400);
  err.code = String(code || "CLASS_CODE_ERROR");
  if (details && typeof details === "object") err.details = details;
  return err;
}

function sendClassCodeError(res, err) {
  if (!(err && Number.isFinite(Number(err.httpStatus || NaN)))) return false;
  const payload = { error: String(err.message || "Erreur classe/code") };
  if (err.code) payload.code = String(err.code);
  if (err.details && typeof err.details === "object") {
    Object.assign(payload, err.details);
  }
  res.status(Number(err.httpStatus || 400)).json(payload);
  return true;
}

async function enforceClassCodeCapacity({
  level,
  className,
  schoolYearStartYear,
  excludeStudentId = null,
  autoAdvance = false,
  enforceCapacity = true
} = {}) {
  const lvl = normalizeLevel(level);
  const classNameRaw = String(className || "").trim();
  const parsed = splitClassBaseAndCode(lvl, classNameRaw);
  if (!CLASS_CODE_LEVELS.has(lvl)) {
    return {
      applied: false,
      normalizedClassName: classNameRaw,
      classBase: parsed.base || classNameRaw,
      classCode: parsed.code || ""
    };
  }
  if (!parsed.base || !parsed.code) {
    throw makeClassCodeError(
      "Pour maternelle/primaire/secondaire, la classe doit inclure un code (ex: 2e A ou 7e EB - Général A).",
      400,
      "CLASS_CODE_REQUIRED",
      {
        level: lvl,
        className: classNameRaw,
        classCodeCapacity: CLASS_CODE_CAPACITY
      }
    );
  }
  if (!enforceCapacity) {
    return {
      applied: true,
      normalizedClassName: `${parsed.base} ${parsed.code}`.trim(),
      classBase: parsed.base,
      classCode: parsed.code,
      classCodeCount: null,
      classCodeCapacity: CLASS_CODE_CAPACITY,
      suggestedCode: parsed.code
    };
  }

  const where = [
    `level = ?`,
    `"schoolYearStartYear" = ?`,
    `"isActive" = ${SQL_ACTIVE_TRUE}`
  ];
  const params = [lvl, Number(schoolYearStartYear)];
  if (excludeStudentId) {
    where.push(`id <> ?`);
    params.push(String(excludeStudentId));
  }
  const rows = await all(
    `SELECT id, "className"
     FROM students
     WHERE ${where.join(" AND ")}`,
    params
  );
  const countByCode = new Map();
  for (const code of CLASS_CODE_LETTERS) countByCode.set(code, 0);
  for (const row of Array.isArray(rows) ? rows : []) {
    const p = splitClassBaseAndCode(lvl, row?.className || "");
    if (p.base !== parsed.base) continue;
    const code = normalizeClassCodeLetter(p.code);
    if (!code) continue;
    countByCode.set(code, Number(countByCode.get(code) || 0) + 1);
  }
  const classCodeCount = Number(countByCode.get(parsed.code) || 0);
  const suggestedCode = firstAvailableClassCode(countByCode);
  return {
    applied: true,
    normalizedClassName: `${parsed.base} ${parsed.code}`.trim(),
    classBase: parsed.base,
    classCode: parsed.code,
    classCodeCount,
    classCodeCapacity: CLASS_CODE_CAPACITY,
    suggestedCode: suggestedCode || parsed.code,
    capacityReached: classCodeCount >= CLASS_CODE_CAPACITY,
    autoAdvanced: false
  };
}

app.get("/api/students/:id/fees", requireRole("admin"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const student = await get(`SELECT id, "fullName" FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });
    const rows = await all(
      `SELECT sfo.id, sfo."studentId", sfo."feeTypeId", sfo.amount, sfo.currency, sfo.active,
              ft.code, ft."labelFr", ft."defaultCurrency", ft."defaultAmount", ft."billingCycle", ft."hasFixedPrice", ft."scopeLevel", ft."scopeLevels", ft."scopeClasses"
       FROM student_fee_overrides sfo
       JOIN fee_types ft ON ft.id = sfo."feeTypeId"
       WHERE sfo."studentId" = ?
       ORDER BY ft."labelFr" ASC`,
      [studentId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      feeTypeId: r.feeTypeId,
      amount: Number(r.amount || 0),
      currency: r.currency,
      active: Boolean(r.active),
      feeType: {
        id: r.feeTypeId,
        code: r.code,
        labelFr: r.labelFr,
        defaultCurrency: r.defaultCurrency,
        defaultAmount: Number(r.defaultAmount || 0),
        billingCycle: normalizeBillingCycle(r.billingCycle),
        hasFixedPrice: r.hasFixedPrice !== false,
        scopeLevel: String(r.scopeLevel || "").trim().toLowerCase() || null,
        scopeLevels: Array.isArray(r.scopeLevels) ? r.scopeLevels.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean) : [],
        scopeClasses: Array.isArray(r.scopeClasses) ? r.scopeClasses.map((v) => String(v || "").trim()).filter(Boolean) : []
      }
    })));
  } catch (e) {
    if (sendClassCodeError(res, e)) return;
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/students/:id/fees", requireRole("admin"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const student = await get(`SELECT id, "schoolYearStartYear" FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });
    const feeTypeId = Number(req.body?.feeTypeId);
    const amount = Number(req.body?.amount);
    const currency = normalizeCurrency(req.body?.currency);
    const active = req.body?.active == null ? true : Boolean(req.body.active);
    if (!Number.isFinite(feeTypeId)) return res.status(400).json({ error: "feeTypeId requis" });
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "Le montant doit Ãªtre >= 0" });
    if (!currency) return res.status(400).json({ error: "La devise doit Ãªtre USD ou CDF" });
    const feeType = await get(
      `SELECT id, code, "labelFr"
       FROM fee_types
       WHERE id = ?
         AND "schoolYearStartYear" = ?
         AND active = TRUE`,
      [feeTypeId, Number(student.schoolYearStartYear)]
    );
    if (!feeType) return res.status(404).json({ error: "Type de frais introuvable" });

    const upsert = await pgPool.query(
      `INSERT INTO student_fee_overrides ("studentId", "feeTypeId", amount, currency, active)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("studentId","feeTypeId")
       DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, active = EXCLUDED.active
       RETURNING id, "studentId", "feeTypeId", amount, currency, active`,
      [studentId, feeTypeId, amount, currency, active]
    );
    const row = upsert.rows[0];
    await writeAudit({
      actorId: req.auth?.sub, actorUsername: req.auth?.username, actorRole: req.auth?.role,
      action: "upsert", entityType: "student_fee_override", entityId: String(row.id),
      details: { studentId, feeTypeId, amount, currency, active }
    });
    res.json({ ...row, amount: Number(row.amount || 0), active: Boolean(row.active) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Layer 2: Bus subscription (shared across devices; affects monthly bus expected amount)
app.get("/api/students/:id/bus-subscription", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const student = await get(`SELECT id, "fullName", "schoolYearStartYear" FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });
    const sub = await getStudentBusSubscription(studentId);
    const busPricing = await getStudentBusPricing(studentId, null, {
      schoolYearStartYear: student.schoolYearStartYear
    });
    res.json({
      studentId,
      active: Boolean(sub?.active),
      startMonth: sub?.startMonth || null,
      endMonth: sub?.endMonth || null,
      category: sub?.category || null,
      updatedAt: sub?.updatedAt || null,
      updatedByUsername: sub?.updatedByUsername || null,
      monthlyAmount: Number(busPricing.monthlyAmount || 0),
      monthlyCurrency: busPricing.currency || "USD",
      monthlyAmountSource: busPricing.source || "default",
      busFeeTypeId: busPricing.feeTypeId || null
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/students/:id/bus-subscription", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const student = await get(`SELECT id, "fullName", "schoolYearStartYear" FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });
    const busFeeType = await getFeeTypeByCode("BUS", { schoolYearStartYear: student.schoolYearStartYear });
    if (!busFeeType) return res.status(404).json({ error: "Type de frais BUS introuvable" });

    const active = req.body?.active == null ? true : Boolean(req.body.active);
    const startMonth = normalizeMonthKey(req.body?.startMonth);
    const endMonth = req.body?.endMonth == null || req.body?.endMonth === "" ? null : normalizeMonthKey(req.body?.endMonth);
    const category = req.body?.category == null || String(req.body.category).trim() === ""
      ? null
      : String(req.body.category).replace(/\s+/g, " ").trim().slice(0, 60);
    const monthlyAmountRaw = req.body?.monthlyAmount ?? req.body?.busAmount ?? null;
    const hasMonthlyAmountInput = monthlyAmountRaw != null && String(monthlyAmountRaw).trim() !== "";
    const monthlyAmount = hasMonthlyAmountInput
      ? Number(String(monthlyAmountRaw).replace(",", "."))
      : null;
    const monthlyCurrency = normalizeCurrency(req.body?.monthlyCurrency || req.body?.currency || busFeeType.defaultCurrency) || "USD";
    if (hasMonthlyAmountInput && (!Number.isFinite(monthlyAmount) || monthlyAmount < 0)) {
      return res.status(400).json({ error: "monthlyAmount doit Ãªtre un nombre >= 0" });
    }
    if (active && !startMonth) return res.status(400).json({ error: "startMonth (YYYY-MM) est requis quand actif" });
    if (startMonth && endMonth && compareMonthKeys(endMonth, startMonth) < 0) {
      return res.status(400).json({ error: "endMonth doit Ãªtre >= startMonth" });
    }

    const before = await getStudentBusSubscription(studentId);
    const beforeBusPricing = await getStudentBusPricing(studentId, busFeeType, {
      schoolYearStartYear: student.schoolYearStartYear
    });
    const finalStartMonth = startMonth || before?.startMonth || new Date().toISOString().slice(0, 7);
    await pgPool.query(
      `INSERT INTO student_bus_subscription ("studentId", active, "startMonth", "endMonth", "category", "updatedAt", "updatedByUserId", "updatedByUsername")
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)
       ON CONFLICT ("studentId") DO UPDATE SET
         active = EXCLUDED.active,
         "startMonth" = EXCLUDED."startMonth",
         "endMonth" = EXCLUDED."endMonth",
         "category" = EXCLUDED."category",
         "updatedAt" = NOW(),
         "updatedByUserId" = EXCLUDED."updatedByUserId",
         "updatedByUsername" = EXCLUDED."updatedByUsername"`,
      [studentId, active, finalStartMonth, endMonth, category, req.auth?.sub ? Number(req.auth.sub) : null, req.auth?.username || null]
    );
    if (hasMonthlyAmountInput) {
      await pgPool.query(
        `INSERT INTO student_fee_overrides ("studentId", "feeTypeId", amount, currency, active)
         VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT ("studentId","feeTypeId")
         DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, active = TRUE`,
        [studentId, Number(busFeeType.id), Number(monthlyAmount || 0), monthlyCurrency]
      );
    }
    const after = await getStudentBusSubscription(studentId);
    const afterBusPricing = await getStudentBusPricing(studentId, busFeeType, {
      schoolYearStartYear: student.schoolYearStartYear
    });
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "upsert",
      entityType: "bus_subscription",
      entityId: studentId,
      details: {
        before,
        after,
        busPricingBefore: beforeBusPricing,
        busPricingAfter: afterBusPricing
      }
    });
    res.json({
      studentId,
      active: Boolean(after?.active),
      startMonth: after?.startMonth || null,
      endMonth: after?.endMonth || null,
      category: after?.category || null,
      updatedAt: after?.updatedAt || null,
      updatedByUsername: after?.updatedByUsername || null,
      monthlyAmount: Number(afterBusPricing.monthlyAmount || 0),
      monthlyCurrency: afterBusPricing.currency || "USD",
      monthlyAmountSource: afterBusPricing.source || "default",
      busFeeTypeId: afterBusPricing.feeTypeId || null
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* ===== Prise en charge des frais de scolarité (enfant du personnel) ===== */
app.get("/api/students/:id/tuition-benefit", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const student = await get(`SELECT id FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Élève introuvable" });
    const b = await getStudentTuitionBenefit(studentId);
    res.json({
      studentId,
      active: Boolean(b?.active),
      startMonth: b?.startMonth || null,
      endMonth: b?.endMonth || null,
      employeeName: b?.employeeName || null,
      updatedAt: b?.updatedAt || null,
      updatedByUsername: b?.updatedByUsername || null
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/students/:id/tuition-benefit", requireRole("admin", "caissier"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const student = await get(`SELECT id, "fullName" FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Élève introuvable" });
    const active = req.body?.active == null ? true : Boolean(req.body.active);
    const startMonth = normalizeMonthKey(req.body?.startMonth);
    const endMonth = req.body?.endMonth == null || req.body?.endMonth === "" ? null : normalizeMonthKey(req.body?.endMonth);
    const employeeName = req.body?.employeeName == null || String(req.body.employeeName).trim() === ""
      ? null
      : String(req.body.employeeName).replace(/\s+/g, " ").trim().slice(0, 140);
    if (active && !startMonth) return res.status(400).json({ error: "startMonth (YYYY-MM) requis quand actif" });
    if (startMonth && endMonth && compareMonthKeys(endMonth, startMonth) < 0) {
      return res.status(400).json({ error: "endMonth doit être >= startMonth" });
    }
    const before = await getStudentTuitionBenefit(studentId);
    const finalStartMonth = startMonth || before?.startMonth || new Date().toISOString().slice(0, 7);
    await run(
      `INSERT INTO student_tuition_benefit ("studentId", active, "startMonth", "endMonth", "employeeName", "updatedAt", "updatedByUserId", "updatedByUsername")
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)
       ON CONFLICT ("studentId") DO UPDATE SET
         active = EXCLUDED.active,
         "startMonth" = EXCLUDED."startMonth",
         "endMonth" = EXCLUDED."endMonth",
         "employeeName" = EXCLUDED."employeeName",
         "updatedAt" = NOW(),
         "updatedByUserId" = EXCLUDED."updatedByUserId",
         "updatedByUsername" = EXCLUDED."updatedByUsername"`,
      [studentId, active, finalStartMonth, endMonth, employeeName, req.auth?.sub ? Number(req.auth.sub) : null, req.auth?.username || null]
    );
    const sync = await syncStudentTuitionBenefitPayments(studentId, {
      actorId: req.auth?.sub ? Number(req.auth.sub) : null,
      actorUsername: req.auth?.username || null
    });
    const after = await getStudentTuitionBenefit(studentId);
    await writeAudit({
      actorId: req.auth?.sub, actorUsername: req.auth?.username, actorRole: req.auth?.role,
      action: "upsert", entityType: "tuition_benefit", entityId: studentId,
      details: { before, after, coveredMonths: sync.inserted, removedMonths: sync.removed }
    });
    res.json({
      studentId,
      active: Boolean(after?.active),
      startMonth: after?.startMonth || null,
      endMonth: after?.endMonth || null,
      employeeName: after?.employeeName || null,
      coveredMonths: sync.inserted,
      updatedAt: after?.updatedAt || null
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Layer 1: student payment status by fee type (shared source for all clients)
app.get("/api/students/:id/status", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const student = await get(`SELECT * FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });
    const allowInactive = req.query.allowInactive === "1";
    if (!allowInactive && !isActiveStudentRecord(student)) {
      return res.status(409).json({
        error: "Eleve inactif. Reactivez-le avant d'enregistrer un paiement.",
        code: "STUDENT_INACTIVE",
        studentId
      });
    }

    const feeType = await resolveFeeType({
      feeTypeId: req.query.feeTypeId,
      feeCode: req.query.feeCode,
      feeLabel: req.query.feeType,
      schoolYearStartYear: student.schoolYearStartYear
    });
    if (!feeType) return res.status(400).json({ error: "feeTypeId/feeType requis" });

    const monthKey = normalizeMonthKey(req.query.month);
    const expectationContext = await buildStudentFeeExpectationContext({ student, feeType });
    const timeline = await getStudentFeeTimelineStatus({ student, feeType, context: expectationContext });
    const annualLock = await getAnnualPaymentLockStatusForCurrentSchoolYear({
      student,
      feeType,
      context: expectationContext
    });
    const tranchePrerequisite = await getTranchePrerequisiteStatus({
      student,
      feeType
    });
    const effectiveNextDueMonth = normalizeBillingCycle(feeType.billingCycle) === "annual"
      ? (annualLock.dueMonth || timeline.nextDueMonth)
      : timeline.nextDueMonth;
    const target = monthKey
      ? await getStudentFeeMonthStatus({ student, feeType, monthKey, context: expectationContext })
      : await getStudentFeeMonthStatus({ student, feeType, monthKey: effectiveNextDueMonth, context: expectationContext });

    res.json({
      studentId,
      feeTypeId: feeType.id,
      feeTypeCode: feeType.code,
      feeTypeLabel: feeType.labelFr,
      feeTypeBillingCycle: normalizeBillingCycle(feeType.billingCycle),
      feeTypeHasFixedPrice: feeType.hasFixedPrice !== false,
      monthsPaid: timeline.monthsPaid,
      monthsPartial: timeline.monthsPartial,
      nextDueMonth: effectiveNextDueMonth,
      timelineStatus: timeline.status,
      timelineRemaining: Number(timeline.remaining || 0),
      timelineDueAmount: Number(timeline.dueAmount || 0),
      timelineCurrency: timeline.currency,
      annualPaymentLocked: Boolean(annualLock.locked),
      annualPaymentLockMonth: annualLock.dueMonth || null,
      annualPaymentLockDueAmount: Number(annualLock.dueAmount || 0),
      annualPaymentLockRemaining: Number(annualLock.remaining || 0),
      annualPaymentLockCurrency: annualLock.currency || null,
      tranchePrerequisiteBlocked: Boolean(tranchePrerequisite.blocked),
      tranchePrerequisiteFeeCode: tranchePrerequisite.prerequisiteFeeCode || null,
      tranchePrerequisiteFeeTypeId: tranchePrerequisite.prerequisiteFeeTypeId || null,
      tranchePrerequisiteFeeLabel: tranchePrerequisite.prerequisiteFeeLabel || null,
      tranchePrerequisiteDueMonth: tranchePrerequisite.prerequisiteDueMonth || null,
      tranchePrerequisiteDueAmount: Number(tranchePrerequisite.prerequisiteDueAmount || 0),
      tranchePrerequisiteRemaining: Number(tranchePrerequisite.prerequisiteRemaining || 0),
      tranchePrerequisiteCurrency: tranchePrerequisite.prerequisiteCurrency || null,
      dueAmount: Number(target.dueAmount || 0),
      dueAmountUSD: target.currency === "USD" ? Number(target.dueAmount || 0) : null,
      currency: target.currency,
      paidSoFar: Number(target.paidSoFar || 0),
      remaining: Number(target.remaining || 0),
      status: target.status,
      lastPaidAt: target.lastPaidAt || null,
      selectedMonth: monthKey || timeline.nextDueMonth
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Bulk student status endpoint to speed up payment-page refresh.
// query: ?feeTypeId=...|feeCode=...|feeType=...&month=YYYY-MM(optional)&includeInactive=1(optional)
app.get("/api/students/statuses", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const feeType = await resolveFeeType({
      feeTypeId: req.query.feeTypeId,
      feeCode: req.query.feeCode,
      feeLabel: req.query.feeType,
      schoolYearStartYear
    });
    if (!feeType) return res.status(400).json({ error: "feeTypeId/feeType requis" });

    const monthKey = normalizeMonthKey(req.query.month);
    const includeInactive = req.query.includeInactive === "1";
    const statusWhere = [`"schoolYearStartYear" = ?`];
    const statusParams = [schoolYearStartYear];
    if (!includeInactive) {
      statusWhere.push(`"isActive" = ${SQL_ACTIVE_TRUE}`);
    }
    const students = await all(
      `SELECT * FROM students
       WHERE ${statusWhere.join(" AND ")}
       ORDER BY "createdAt" DESC`,
      statusParams
    );
    if (!students.length) {
      return res.json({
        feeTypeId: feeType.id,
        feeTypeCode: feeType.code,
        feeTypeLabel: feeType.labelFr,
        monthKey: monthKey || null,
        rows: []
      });
    }

    const feeCode = String(feeType?.code || "").toUpperCase();
    const studentIds = students.map((s) => String(s.id || "")).filter(Boolean);

    const [sharedStartYear, sharedLevelDueConfig, overrideRows] = await Promise.all([
      (feeCode === "TUITION" || feeCode === "ETAT_MINERVAL")
        ? Promise.resolve(schoolYearStartYear)
        : Promise.resolve(null),
      feeCode === "TUITION"
        ? getLevelMonthlyDueSetting({ schoolYearStartYear })
        : Promise.resolve(null),
      all(
        `SELECT "studentId", amount, currency, active
         FROM student_fee_overrides
         WHERE "feeTypeId" = ?
           AND "studentId" = ANY(?::text[])`,
        [feeType.id, studentIds]
      )
    ]);
    const overridesByStudent = new Map(
      (overrideRows || []).map((row) => [String(row.studentId || ""), row])
    );

    let busByStudent = new Map();
    if (feeCode === "BUS") {
      const busRows = await all(
        `SELECT "studentId", active, "startMonth", "endMonth", "updatedAt", "updatedByUserId", "updatedByUsername"
         FROM student_bus_subscription
         WHERE "studentId" = ANY(?::text[])`,
        [studentIds]
      );
      busByStudent = new Map(
        (busRows || []).map((row) => [String(row.studentId || ""), parseStudentBusSubscriptionRow(row)])
      );
    }

    const labels = getFeeTypeLegacyLabelCandidates(feeType);
    const paymentRows = await (monthKey && feeCode !== "ETAT_MINERVAL"
      ? all(
          `SELECT id, "studentId", COALESCE("paidForMonth","monthKey") AS "paidForMonth",
                  amount, currency, "fxRate", "dueAmountSnapshot", "dueCurrencySnapshot", "cancelledAt",
                  note, COALESCE("paidAt","createdAt") AS "paidAt"
           FROM payments
           WHERE "studentId" = ANY(?::text[])
             AND "cancelledAt" IS NULL
             AND COALESCE("paidForMonth","monthKey") = ?
             AND (
               "feeTypeId" = ?
               OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY(?::text[]))
             )`,
          [studentIds, monthKey, feeType.id, labels]
        )
      : all(
          `SELECT id, "studentId", COALESCE("paidForMonth","monthKey") AS "paidForMonth",
                  amount, currency, "fxRate", "dueAmountSnapshot", "dueCurrencySnapshot", "cancelledAt",
                  note, COALESCE("paidAt","createdAt") AS "paidAt"
           FROM payments
           WHERE "studentId" = ANY(?::text[])
             AND "cancelledAt" IS NULL
             AND (
               "feeTypeId" = ?
               OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY(?::text[]))
             )`,
          [studentIds, feeType.id, labels]
        ));
    const paymentsByStudent = new Map();
    for (const row of Array.isArray(paymentRows) ? paymentRows : []) {
      const sid = String(row?.studentId || "");
      if (!sid) continue;
      if (!paymentsByStudent.has(sid)) paymentsByStudent.set(sid, []);
      paymentsByStudent.get(sid).push({
        ...row,
        paidForMonth: normalizeMonthKey(row?.paidForMonth)
      });
    }

    const out = [];
    for (const student of students) {
      const sid = String(student?.id || "");
      const expectationContext = buildStudentFeeExpectationContextFromPreload({
        student,
        feeType,
        override: overridesByStudent.get(sid) || null,
        busSub: busByStudent.get(sid) || null,
        schoolYearStartYear: sharedStartYear,
        levelMonthlyDueConfig: sharedLevelDueConfig
      });
      const rawRows = paymentsByStudent.get(sid) || [];
      const normalizedRows = normalizePaymentRowsForFeeContext(rawRows, feeType, expectationContext);

      if (monthKey) {
        const st = await getStudentFeeMonthStatus({
          student,
          feeType,
          monthKey,
          context: expectationContext,
          paymentRows: normalizedRows
        });
        out.push({
          studentId: student.id,
          feeTypeId: feeType.id,
          feeTypeCode: feeType.code,
          feeTypeLabel: feeType.labelFr,
          status: st.status,
          dueAmount: Number(st.dueAmount || 0),
          currency: st.currency,
          paidSoFar: Number(st.paidSoFar || 0),
          remaining: Number(st.remaining || 0),
          lastPaidAt: st.lastPaidAt || null,
          selectedMonth: monthKey
        });
        continue;
      }

      const timeline = await getStudentFeeTimelineStatus({
        student,
        feeType,
        context: expectationContext,
        paymentRows: normalizedRows
      });
      out.push({
        studentId: student.id,
        feeTypeId: feeType.id,
        feeTypeCode: feeType.code,
        feeTypeLabel: feeType.labelFr,
        monthsPaid: timeline.monthsPaid,
        monthsPartial: timeline.monthsPartial,
        monthsUnpaid: Array.isArray(timeline.monthsUnpaid) ? timeline.monthsUnpaid : [],
        nextDueMonth: timeline.nextDueMonth,
        dueAmount: Number(timeline.dueAmount || 0),
        currency: timeline.currency,
        paidSoFar: Number(timeline.paidSoFar || 0),
        remaining: Number(timeline.remaining || 0),
        status: timeline.status,
        lastPaidAt: timeline.lastPaidAt || null,
        selectedMonth: timeline.nextDueMonth
      });
    }

    res.json({
      feeTypeId: feeType.id,
      feeTypeCode: feeType.code,
      feeTypeLabel: feeType.labelFr,
      monthKey: monthKey || null,
      rows: out
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/students/:id/family", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    const siblingStudentId = normalizeOptionalText(req.body.siblingStudentId, 100);
    const requestedFamilyId = normalizeOptionalText(req.body.familyId, 100);
    const student = await get(`SELECT * FROM students WHERE id = ?`, [studentId]);
    if (!student) return res.status(404).json({ error: "Élève introuvable" });
    if (!siblingStudentId && !requestedFamilyId) return res.status(400).json({ error: "Choisissez un frère, une sœur ou une famille" });

    let relative = null;
    if (siblingStudentId) {
      if (siblingStudentId === studentId) return res.status(400).json({ error: "Choisissez un autre élève" });
      relative = await get(`SELECT * FROM students WHERE id = ?`, [siblingStudentId]);
      if (!relative) return res.status(404).json({ error: "Frère ou sœur introuvable" });
    } else {
      relative = await get(`SELECT * FROM students WHERE "familyId" = ? ORDER BY "createdAt" DESC LIMIT 1`, [requestedFamilyId]);
      if (!relative) return res.status(404).json({ error: "Famille introuvable" });
    }

    const familyId = String(relative.familyId || `FAM-${relative.id}`).trim();
    const familyName = String(relative.familyName || relative.parentName || student.parentName || `Famille ${relative.id}`).trim();
    await run(`UPDATE students SET "familyId" = ?, "familyName" = ? WHERE id = ANY(?::text[])`, [familyId, familyName, [studentId, relative.id]]);
    const updated = await get(`SELECT * FROM students WHERE id = ?`, [studentId]);
    const siblings = await all(
      `SELECT id, "matricule", "fullName", "className", level, "isActive" FROM students WHERE "familyId" = ? ORDER BY "fullName" ASC`,
      [familyId]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "link-family",
      entityType: "student",
      entityId: studentId,
      details: { familyId, familyName, relativeStudentId: relative.id }
    });
    res.json({ student: updated, siblings });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Create student
 * body: { fullName, level, className, sex, monthlyDue, currency, dateOfBirth?, matricule? }
 */
app.post("/api/students", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const level = normalizeLevel(req.body.level);
    let className = String(req.body.className || "").trim(); // ex "6e A"
    const sex = normalizeSex(req.body.sex);
    const monthlyDueInput = req.body.monthlyDue;
    let monthlyDue = null;
    const currency = normalizeCurrency(req.body.currency) || "USD";
    const dateOfBirth = normalizeDateOfBirth(req.body.dateOfBirth);
    const parentName = normalizeOptionalText(req.body.parentName, 140);
    const parentPhone = normalizeOptionalText(req.body.parentPhone, 40);
    const parentPhoneAlt = normalizeOptionalText(req.body.parentPhoneAlt, 40);
    const requestedFamilyId = normalizeOptionalText(req.body.familyId, 100);
    const siblingStudentId = normalizeOptionalText(req.body.siblingStudentId, 100);
    let familyName = normalizeOptionalText(req.body.familyName, 160);
    const address = normalizeOptionalText(req.body.address, 220);
    const emergencyContact = normalizeOptionalText(req.body.emergencyContact, 140);
    const studentNote = normalizeOptionalText(req.body.studentNote, 500);
    const classEffectiveMonth = req.body.classEffectiveMonth
      ? normalizeMonthKey(req.body.classEffectiveMonth)
      : null;
    const matriculeInput = req.body.matricule;
    const manualMatricule = normalizeStudentMatricule(matriculeInput);

    if (!fullName) return res.status(400).json({ error: "Nom complet requis" });
    if (!level) return res.status(400).json({ error: "Le niveau doit Ãªtre maternelle|primaire|secondaire" });
    if (!className) return res.status(400).json({ error: "className requis (ex: 6e A)" });
    if (!sex) return res.status(400).json({ error: "Le sexe doit Ãªtre M ou F" });
    if (req.body.dateOfBirth != null && String(req.body.dateOfBirth).trim() !== "" && !dateOfBirth) {
      return res.status(400).json({ error: "dateOfBirth invalide (format attendu: JJ/MM/AAAA)" });
    }
    if (req.body.classEffectiveMonth && !classEffectiveMonth) {
      return res.status(400).json({ error: "classEffectiveMonth doit Ãªtre au format YYYY-MM" });
    }
    if (matriculeInput != null && String(matriculeInput).trim() !== "" && !manualMatricule) {
      return res.status(400).json({ error: "matricule invalide (A-Z, 0-9, ., _, /, -, max 40)" });
    }

    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const classCodeRule = await enforceClassCodeCapacity({
      level,
      className,
      schoolYearStartYear,
      autoAdvance: true
    });
    className = classCodeRule.normalizedClassName;
    monthlyDue = monthlyDueInput == null || monthlyDueInput === ""
      ? await defaultMonthlyDueForLevelClass(level, className, { schoolYearStartYear })
      : Number(monthlyDueInput);
    if (!Number.isFinite(monthlyDue) || monthlyDue < 0) {
      return res.status(400).json({ error: "monthlyDue doit Ãªtre un nombre >= 0" });
    }

    let matricule = manualMatricule;
    if (matricule) {
      const sameSchoolYear = await get(
        `SELECT id
         FROM students
         WHERE "schoolYearStartYear" = ?
           AND UPPER(COALESCE(NULLIF("matricule", ''), id)) = UPPER(?)
         LIMIT 1`,
        [schoolYearStartYear, matricule]
      );
      if (sameSchoolYear) {
        return res.status(409).json({ error: "Ce matricule existe dÃ©jÃ " });
      }
      const exists = await get(`SELECT id FROM students WHERE id = ?`, [matricule]);
      if (exists) {
        return res.status(409).json({ error: "Ce matricule existe dÃ©jÃ  dans une autre annÃ©e scolaire. Utilisez l'inscription ancien Ã©lÃ¨ve." });
      }
    } else {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = await makeStudentId(fullName, sex);
        const sameSchoolYear = await get(
          `SELECT id
           FROM students
           WHERE "schoolYearStartYear" = ?
             AND UPPER(COALESCE(NULLIF("matricule", ''), id)) = UPPER(?)
           LIMIT 1`,
          [schoolYearStartYear, candidate]
        );
        if (!sameSchoolYear) {
          matricule = candidate;
          break;
        }
      }
      if (!matricule) {
        throw new Error("Impossible de gÃ©nÃ©rer un matricule Ã©lÃ¨ve unique");
      }
    }
    const id = matricule;
    const createdAt = nowIso();
    let familyId = requestedFamilyId;
    if (siblingStudentId) {
      const sibling = await get(
        `SELECT id, "familyId", "familyName", "parentName", "parentPhone" FROM students WHERE id = ?`,
        [siblingStudentId]
      );
      if (!sibling) return res.status(400).json({ error: "L'élève choisi pour la fratrie est introuvable" });
      familyId = String(sibling.familyId || `FAM-${sibling.id}`).trim();
      familyName = familyName || sibling.familyName || sibling.parentName || parentName || `Famille ${sibling.id}`;
      await run(
        `UPDATE students SET "familyId" = ?, "familyName" = COALESCE(NULLIF("familyName", ''), ?) WHERE id = ?`,
        [familyId, familyName, sibling.id]
      );
    }
    if (familyId) {
      const existingFamily = await get(
        `SELECT "familyName", "parentName" FROM students WHERE "familyId" = ? ORDER BY "createdAt" DESC LIMIT 1`,
        [familyId]
      );
      familyName = familyName || existingFamily?.familyName || existingFamily?.parentName || parentName || "Famille";
    } else {
      familyId = `FAM-${matricule}`;
      familyName = familyName || parentName || `Famille ${fullName.split(/\s+/)[0] || matricule}`;
    }

    await run(
      `INSERT INTO students (
        id, "matricule", fullName, level, className, sex, "dateOfBirth", monthlyDue, currency, createdAt, "classEffectiveMonth", "schoolYearStartYear",
        "parentName", "parentPhone", "parentPhoneAlt", "address", "emergencyContact", "studentNote", "familyId", "familyName"
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, matricule, fullName, level, className, sex, dateOfBirth, monthlyDue, currency, createdAt, classEffectiveMonth, schoolYearStartYear,
        parentName, parentPhone, parentPhoneAlt, address, emergencyContact, studentNote, familyId, familyName
      ]
    );

    const student = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "create",
      entityType: "student",
      entityId: id,
      details: {
        fullName,
        level,
        className,
        sex,
        dateOfBirth,
        monthlyDue,
        currency,
        matricule,
        classEffectiveMonth,
        schoolYearStartYear,
        parentName,
        parentPhone,
        parentPhoneAlt,
        address,
        emergencyContact,
        studentNote,
        familyId,
        familyName,
        siblingStudentId
      }
    });
    res.json(student);
  } catch (e) {
    if (sendClassCodeError(res, e)) return;
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * List students (+ computed paid/remaining for a given month)
 * query: ?month=YYYY-MM
 */
app.get("/api/students", async (req, res) => {
  try {
    const monthKey = normalizeMonthKey(req.query.month) || null;
    const includeInactive = req.query.includeInactive === "1";
    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const where = [`s."schoolYearStartYear" = ?`];
    const params = [schoolYearStartYear];
    if (!includeInactive) {
      where.push(`s."isActive" = ${SQL_ACTIVE_TRUE}`);
    }
    const students = await all(
      `SELECT s.*
       FROM students s
       WHERE ${where.join(" AND ")}
       ORDER BY s."createdAt" DESC`,
      params
    );
    const previousStudents = await all(
      `SELECT id, matricule, "fullName", sex, "dateOfBirth", "parentPhone", "parentPhoneAlt"
       FROM students
       WHERE "schoolYearStartYear" = ?`,
      [schoolYearStartYear - 1]
    );
    const returningStudentIds = buildReturningStudentIdSet(students, previousStudents);
    for (const student of students) {
      student.isReturningStudent = returningStudentIds.has(String(student.id));
    }

    if (!monthKey) {
      return res.json(students);
    }
    const tuition = await getDefaultTuitionFeeType({ schoolYearStartYear });
    const tuitionId = Number(tuition?.id || 0);
    const tuitionLabels = getTuitionLabelCandidates();
    const paymentsRes = await pgPool.query(
      `SELECT "studentId", COALESCE(SUM(amount), 0) AS paid
       FROM payments
       WHERE COALESCE("paidForMonth","monthKey") = $1
         AND (
           ($2 > 0 AND "feeTypeId" = $2)
           OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY($3::text[]))
         )
       GROUP BY "studentId"`,
      [monthKey, tuitionId, tuitionLabels]
    );
    const payments = paymentsRes.rows || [];
    const levelDueConfig = await getLevelMonthlyDueSetting({ schoolYearStartYear });

    const paidMap = new Map(payments.map((p) => [p.studentId, Number(p.paid || 0)]));

    const enriched = students.map((s) => {
      const paid = paidMap.get(s.id) || 0;
      const due = getStudentTuitionMonthlyDue(s, { levelDueConfig });
      const remaining = Math.max(0, due - paid);
      const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
      return { ...s, monthKey, due, paid, remaining, status };
    });

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Lookup students from previous school year for re-enrollment
 * query: ?q=nom_ou_matricule&limit=30&targetSchoolYearStart=2026
 */
app.get("/api/students/old", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().toLowerCase();
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(100, Math.floor(parsedLimit)))
      : 30;

    const qLike = `%${query}%`;
    const safeCurrentStart = await getActiveSchoolYearStartYear();
    const requestedTargetStart = Number(req.query.targetSchoolYearStart);
    const requestedTargetIsValid = Number.isFinite(requestedTargetStart);

    const fetchRowsForTargetSchoolYearStart = async (targetSchoolYearStart) => {
      const normalizedTargetStart = Number(targetSchoolYearStart);
      const previousSchoolYearStart = normalizedTargetStart - 1;
      const countRow = await get(
        `SELECT COUNT(*) AS total
         FROM students
         WHERE "schoolYearStartYear" = ?
           AND (? = '' OR LOWER("fullName") LIKE ? OR LOWER(COALESCE(NULLIF("matricule", ''), id)) LIKE ?)`,
        [previousSchoolYearStart, query, qLike, qLike]
      );
      const totalCount = Number(countRow?.total || 0);
      const rows = await all(
        `SELECT id, COALESCE(NULLIF("matricule", ''), id) AS matricule, "fullName", level, "className", sex, "monthlyDue", currency,
                "classEffectiveMonth", "createdAt", "isActive", "schoolYearStartYear",
                COALESCE(NULLIF("classEffectiveMonth", ''), TO_CHAR("createdAt", 'YYYY-MM')) AS "enrollmentMonthKey"
         FROM students
         WHERE "schoolYearStartYear" = ?
           AND (? = '' OR LOWER("fullName") LIKE ? OR LOWER(COALESCE(NULLIF("matricule", ''), id)) LIKE ?)
         ORDER BY "createdAt" DESC, "fullName" ASC
         LIMIT ?`,
        [previousSchoolYearStart, query, qLike, qLike, limit]
      );
      return { rows, totalCount, targetSchoolYearStart: normalizedTargetStart, previousSchoolYearStart };
    };

    let lookup = null;
    if (requestedTargetIsValid) {
      lookup = await fetchRowsForTargetSchoolYearStart(Math.floor(requestedTargetStart));
    } else {
      const primaryWindow = await fetchRowsForTargetSchoolYearStart(safeCurrentStart);
      const nextEnrollmentWindow = await fetchRowsForTargetSchoolYearStart(safeCurrentStart + 1);
      const primaryCount = Number(primaryWindow.totalCount || 0);
      const nextCount = Number(nextEnrollmentWindow.totalCount || 0);

      if (query) {
        if (primaryCount > 0) lookup = primaryWindow;
        else if (nextCount > 0) lookup = nextEnrollmentWindow;
        else lookup = primaryWindow;
      } else {
        if (primaryCount === 0 && nextCount > 0) lookup = nextEnrollmentWindow;
        else if (nextCount === 0) lookup = primaryWindow;
        else lookup = nextCount > primaryCount ? nextEnrollmentWindow : primaryWindow;
      }
    }

    res.json({
      schoolYearStartYear: lookup.previousSchoolYearStart,
      schoolYearLabel: `${lookup.previousSchoolYearStart}-${lookup.targetSchoolYearStart}`,
      targetSchoolYearStartYear: lookup.targetSchoolYearStart,
      rows: lookup.rows
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Enroll existing (old) student for the new school year.
 * Keeps previous-year data intact by creating a new yearly student record.
 * body: { level?, className?, monthlyDue?, classEffectiveMonth? }
 */
app.post("/api/students/:id/enroll", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Ãƒâ€°lÃƒÂ¨ve introuvable" });

    const safeCurrentStart = await getActiveSchoolYearStartYear();
    const existingYear = normalizeSchoolYearStartYear(existing.schoolYearStartYear);
    const matricule =
      normalizeStudentMatricule(existing.matricule || existing.id)
      || String(existing.matricule || existing.id || "").trim().toUpperCase();
    if (!matricule) {
      return res.status(409).json({ error: "Matricule introuvable pour cet ancien Ã©lÃ¨ve" });
    }

    const currentYearStudent = await get(
      `SELECT *
       FROM students
       WHERE "schoolYearStartYear" = ?
         AND UPPER(COALESCE(NULLIF("matricule", ''), id)) = UPPER(?)
       ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, "createdAt" DESC
       LIMIT 1`,
      [safeCurrentStart, matricule, id]
    );
    const baselineStudent = currentYearStudent || existing;

    let level = normalizeLevel(baselineStudent.level);
    if (req.body?.level != null && String(req.body.level).trim() !== "") {
      const nextLevel = normalizeLevel(req.body.level);
      if (!nextLevel) {
        return res.status(400).json({ error: "Le niveau doit ÃƒÂªtre maternelle|primaire|secondaire" });
      }
      level = nextLevel;
    }
    if (!level) {
      return res.status(400).json({ error: "Niveau invalide" });
    }

    let className = String(baselineStudent.className || "").trim();
    if (req.body?.className != null && String(req.body.className).trim() !== "") {
      className = String(req.body.className).trim();
    }
    if (!className) {
      return res.status(400).json({ error: "className requis" });
    }

    let monthlyDue = Number(baselineStudent.monthlyDue || 0);
    if (req.body?.monthlyDue != null && String(req.body.monthlyDue).trim() !== "") {
      monthlyDue = Number(req.body.monthlyDue);
    }
    if (!Number.isFinite(monthlyDue) || monthlyDue < 0) {
      return res.status(400).json({ error: "monthlyDue doit ÃƒÂªtre un nombre >= 0" });
    }

    const classCodeRule = await enforceClassCodeCapacity({
      level,
      className,
      schoolYearStartYear: safeCurrentStart,
      excludeStudentId: currentYearStudent?.id || (existingYear && existingYear === safeCurrentStart ? id : null),
      enforceCapacity: false
    });
    className = classCodeRule.normalizedClassName;
    const defaultEffectiveMonth = `${safeCurrentStart}-09`;
    let classEffectiveMonth =
      normalizeMonthKey(baselineStudent.classEffectiveMonth) ||
      defaultEffectiveMonth;
    if (req.body?.classEffectiveMonth != null && String(req.body.classEffectiveMonth).trim() !== "") {
      classEffectiveMonth = normalizeMonthKey(req.body.classEffectiveMonth);
      if (!classEffectiveMonth) {
        return res.status(400).json({ error: "classEffectiveMonth doit ÃƒÂªtre au format YYYY-MM" });
      }
    }

    const wantsClassChange =
      level !== normalizeLevel(baselineStudent.level) ||
      className !== String(baselineStudent.className || "").trim();
    if (
      wantsClassChange &&
      req.auth?.role !== "admin" &&
      req.auth?.role !== "caissier"
    ) {
      return res.status(403).json({ error: "Seul admin ou caissier peut changer la classe/le niveau ÃƒÂ  l'inscription" });
    }

    async function updateCurrentYearStudent(targetStudent, mode) {
      await run(
        `UPDATE students
         SET "isActive" = TRUE, "matricule" = ?, level = ?, "className" = ?, "monthlyDue" = ?, "classEffectiveMonth" = ?
         WHERE id = ?`,
        [matricule, level, className, monthlyDue, classEffectiveMonth, targetStudent.id]
      );

      const updatedCurrent = await get(`SELECT * FROM students WHERE id = ?`, [targetStudent.id]);
      await writeAudit({
        actorId: req.auth?.sub,
        actorUsername: req.auth?.username,
        actorRole: req.auth?.role,
        action: "enroll-existing",
        entityType: "student",
        entityId: targetStudent.id,
        details: {
          mode,
          matricule,
          sourceStudentId: id,
          sourceSchoolYearStartYear: existingYear || null,
          targetSchoolYearStartYear: safeCurrentStart,
          before: {
            isActive: targetStudent.isActive,
            level: targetStudent.level,
            className: targetStudent.className,
            monthlyDue: targetStudent.monthlyDue,
            classEffectiveMonth: targetStudent.classEffectiveMonth
          },
          after: {
            id: updatedCurrent?.id,
            matricule: updatedCurrent?.matricule || updatedCurrent?.id,
            isActive: updatedCurrent?.isActive,
            level: updatedCurrent?.level,
            className: updatedCurrent?.className,
            monthlyDue: updatedCurrent?.monthlyDue,
            classEffectiveMonth: updatedCurrent?.classEffectiveMonth
          }
        }
      });

      return updatedCurrent;
    }

    if (currentYearStudent) {
      const mode = String(currentYearStudent.id) === String(id)
        ? "update-current-year"
        : "reuse-current-year-matricule";
      const updatedCurrent = await updateCurrentYearStudent(currentYearStudent, mode);
      return res.json(updatedCurrent);
    }

    const newStudentId = await makeStudentId(existing.fullName || "", existing.sex || "M");
    const createdAt = nowIso();
    try {
      await run(
        `INSERT INTO students (
          id, "matricule", "fullName", level, "className", sex, "dateOfBirth", "monthlyDue", currency, "createdAt", "classEffectiveMonth",
          "schoolYearStartYear", "parentName", "parentPhone", "parentPhoneAlt", "address", "emergencyContact", "studentNote", "familyId", "familyName", "isActive"
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          newStudentId,
          matricule,
          existing.fullName || "",
          level,
          className,
          existing.sex || null,
          existing.dateOfBirth || null,
          monthlyDue,
          normalizeCurrency(existing.currency) || "USD",
          createdAt,
          classEffectiveMonth,
          safeCurrentStart,
          existing.parentName || null,
          existing.parentPhone || null,
          existing.parentPhoneAlt || null,
          existing.address || null,
          existing.emergencyContact || null,
          existing.studentNote || null,
          existing.familyId || null,
          existing.familyName || null
        ]
      );
    } catch (insertErr) {
      if (String(insertErr?.code || "") === "23505") {
        const concurrentCurrentYearStudent = await get(
          `SELECT *
           FROM students
           WHERE "schoolYearStartYear" = ?
             AND UPPER(COALESCE(NULLIF("matricule", ''), id)) = UPPER(?)
           ORDER BY "createdAt" DESC
           LIMIT 1`,
          [safeCurrentStart, matricule]
        );
        if (concurrentCurrentYearStudent) {
          const updatedCurrent = await updateCurrentYearStudent(
            concurrentCurrentYearStudent,
            "reuse-current-year-matricule"
          );
          return res.json(updatedCurrent);
        }
      }
      throw insertErr;
    }

    const updated = await get(`SELECT * FROM students WHERE id = ?`, [newStudentId]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "enroll-existing",
      entityType: "student",
      entityId: newStudentId,
      details: {
        mode: "clone-to-new-school-year",
        matricule,
        sourceStudentId: id,
        sourceSchoolYearStartYear: existingYear || null,
        targetSchoolYearStartYear: safeCurrentStart,
        before: {
          isActive: existing.isActive,
          level: existing.level,
          className: existing.className,
          monthlyDue: existing.monthlyDue,
          classEffectiveMonth: existing.classEffectiveMonth
        },
        after: {
          id: updated?.id,
          matricule: updated?.matricule || updated?.id,
          isActive: updated?.isActive,
          level: updated?.level,
          className: updated?.className,
          monthlyDue: updated?.monthlyDue,
          classEffectiveMonth: updated?.classEffectiveMonth
        }
      }
    });

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Get one student (+ optional month totals)
 * /api/students/:id?month=YYYY-MM
 */
app.get("/api/students/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const monthKey = normalizeMonthKey(req.query.month) || null;

    const schoolYearStartYear = await getActiveSchoolYearStartYear();
    const student = await get(
      `SELECT * FROM students WHERE id = ? AND "schoolYearStartYear" = ?`,
      [id, schoolYearStartYear]
    );
    if (!student) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });

    if (!monthKey) return res.json(student);
    const tuition = await getDefaultTuitionFeeType({ schoolYearStartYear });
    const tuitionId = Number(tuition?.id || 0);
    const tuitionLabels = getTuitionLabelCandidates();
    const rowRes = await pgPool.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM payments
       WHERE "studentId" = $1
         AND COALESCE("paidForMonth","monthKey") = $2
         AND (
           ($3 > 0 AND "feeTypeId" = $3)
           OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY($4::text[]))
         )`,
      [id, monthKey, tuitionId, tuitionLabels]
    );
    const row = rowRes.rows?.[0] || { paid: 0 };

    const paid = Number(row?.paid || 0);
    const levelDueConfig = await getLevelMonthlyDueSetting({ schoolYearStartYear });
    const due = getStudentTuitionMonthlyDue(student, { levelDueConfig });
    const remaining = Math.max(0, due - paid);
    const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

    res.json({ ...student, monthKey, due, paid, remaining, status });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Update student
 * body: { fullName, level, className, monthlyDue, currency, dateOfBirth? }
 */
app.put("/api/students/:id", requireRole("admin", "comptable", "caissier"), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });

    const fullName = req.body.fullName != null ? String(req.body.fullName).trim() : existing.fullName;
    const level = req.body.level != null ? normalizeLevel(req.body.level) : existing.level;
    let className = req.body.className != null ? String(req.body.className).trim() : existing.className;
    const monthlyDue = req.body.monthlyDue != null ? Number(req.body.monthlyDue) : Number(existing.monthlyDue);
    const currency =
      req.body.currency != null ? normalizeCurrency(req.body.currency) || existing.currency : existing.currency;
    const dateOfBirth = req.body.dateOfBirth != null ? normalizeDateOfBirth(req.body.dateOfBirth) : existing.dateOfBirth;
    const parentName =
      req.body.parentName != null ? normalizeOptionalText(req.body.parentName, 140) : existing.parentName;
    const parentPhone =
      req.body.parentPhone != null ? normalizeOptionalText(req.body.parentPhone, 40) : existing.parentPhone;
    const parentPhoneAlt =
      req.body.parentPhoneAlt != null ? normalizeOptionalText(req.body.parentPhoneAlt, 40) : existing.parentPhoneAlt;
    const address =
      req.body.address != null ? normalizeOptionalText(req.body.address, 220) : existing.address;
    const emergencyContact =
      req.body.emergencyContact != null ? normalizeOptionalText(req.body.emergencyContact, 140) : existing.emergencyContact;
    const studentNote =
      req.body.studentNote != null ? normalizeOptionalText(req.body.studentNote, 500) : existing.studentNote;

    if (!fullName) return res.status(400).json({ error: "Nom complet requis" });
    if (!level) return res.status(400).json({ error: "Le niveau doit Ãªtre maternelle|primaire|secondaire" });
    if (!className) return res.status(400).json({ error: "className requis (ex: 6e A)" });
    if (!Number.isFinite(monthlyDue) || monthlyDue < 0) {
      return res.status(400).json({ error: "monthlyDue doit Ãªtre un nombre >= 0" });
    }
    if (req.body.dateOfBirth != null && String(req.body.dateOfBirth).trim() !== "" && !dateOfBirth) {
      return res.status(400).json({ error: "dateOfBirth invalide (format attendu: JJ/MM/AAAA)" });
    }
    if (
      className !== existing.className &&
      req.auth?.role !== "admin" &&
      req.auth?.role !== "caissier"
    ) {
      return res.status(403).json({ error: "Seul admin ou caissier peut changer la classe/le code" });
    }
    const existingLevel = normalizeLevel(existing.level);
    const classOrLevelChanged =
      className !== String(existing.className || "").trim() ||
      level !== existingLevel;
    if (classOrLevelChanged) {
      const targetSchoolYearStartYear =
        normalizeSchoolYearStartYear(existing.schoolYearStartYear) ||
        await getActiveSchoolYearStartYear();
      const classCodeRule = await enforceClassCodeCapacity({
        level,
        className,
        schoolYearStartYear: targetSchoolYearStartYear,
        excludeStudentId: id
      });
      className = classCodeRule.normalizedClassName;
    }

    await run(
      `UPDATE students
       SET fullName = ?, level = ?, className = ?, monthlyDue = ?, currency = ?,
           "dateOfBirth" = ?, "parentName" = ?, "parentPhone" = ?, "parentPhoneAlt" = ?, "address" = ?, "emergencyContact" = ?, "studentNote" = ?
       WHERE id = ?`,
      [fullName, level, className, monthlyDue, currency, dateOfBirth, parentName, parentPhone, parentPhoneAlt, address, emergencyContact, studentNote, id]
    );

    const updated = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update",
      entityType: "student",
      entityId: id,
      details: {
        before: {
          fullName: existing.fullName,
          level: existing.level,
          className: existing.className,
          monthlyDue: existing.monthlyDue,
          currency: existing.currency,
          dateOfBirth: existing.dateOfBirth,
          parentName: existing.parentName,
          parentPhone: existing.parentPhone,
          parentPhoneAlt: existing.parentPhoneAlt,
          address: existing.address,
          emergencyContact: existing.emergencyContact,
          studentNote: existing.studentNote
        },
        after: {
          fullName,
          level,
          className,
          monthlyDue,
          currency,
          dateOfBirth,
          parentName,
          parentPhone,
          parentPhoneAlt,
          address,
          emergencyContact,
          studentNote
        }
      }
    });
    res.json(updated);
  } catch (e) {
    if (sendClassCodeError(res, e)) return;
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Update student profile/contact details only
 * roles: admin + caissier + comptable
 * body: { fullName?, createdAt?, monthlyDue?, parentName?, parentPhone?, parentPhoneAlt?, address?, emergencyContact?, studentNote?, dateOfBirth? }
 */
app.patch("/api/students/:id/profile", requireRole("admin", "caissier", "comptable"), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });

    const fullName =
      req.body.fullName !== undefined
        ? String(req.body.fullName == null ? "" : req.body.fullName).trim().replace(/\s+/g, " ").slice(0, 140)
        : String(existing.fullName || "").trim();
    const parentName =
      req.body.parentName !== undefined ? normalizeOptionalText(req.body.parentName, 140) : existing.parentName;
    const parentPhone =
      req.body.parentPhone !== undefined ? normalizeOptionalText(req.body.parentPhone, 40) : existing.parentPhone;
    let monthlyDue = Number(existing.monthlyDue || 0);
    if (req.body.monthlyDue !== undefined) {
      const role = String(req.auth?.role || "").toLowerCase();
      if (role !== "admin" && role !== "caissier") {
        return res.status(403).json({ error: "Modification du frais mensuel reservee a admin / caissier" });
      }
      const nextMonthlyDue = Number(req.body.monthlyDue);
      if (!Number.isFinite(nextMonthlyDue) || nextMonthlyDue < 0) {
        return res.status(400).json({ error: "monthlyDue doit Ãªtre un nombre >= 0" });
      }
      if (nextMonthlyDue !== Number(existing.monthlyDue || 0)) {
        await snapshotExistingPaymentDues({ studentId: id, feeCode: "TUITION" });
      }
      monthlyDue = nextMonthlyDue;
    }
    let createdAt = existing.createdAt;
    if (req.body.createdAt !== undefined) {
      const createdDateIso = toDateOnlyISO(req.body.createdAt);
      if (!createdDateIso) {
        return res.status(400).json({ error: "date d'inscription invalide (format attendu: JJ/MM/AAAA)" });
      }
      // Store a stable timestamp for the chosen enrollment calendar day.
      createdAt = `${createdDateIso}T12:00:00.000Z`;
    }
    const dateOfBirth =
      req.body.dateOfBirth !== undefined ? normalizeDateOfBirth(req.body.dateOfBirth) : existing.dateOfBirth;
    const parentPhoneAlt =
      req.body.parentPhoneAlt !== undefined ? normalizeOptionalText(req.body.parentPhoneAlt, 40) : existing.parentPhoneAlt;
    const address =
      req.body.address !== undefined ? normalizeOptionalText(req.body.address, 220) : existing.address;
    const emergencyContact =
      req.body.emergencyContact !== undefined ? normalizeOptionalText(req.body.emergencyContact, 140) : existing.emergencyContact;
    const studentNote =
      req.body.studentNote !== undefined ? normalizeOptionalText(req.body.studentNote, 500) : existing.studentNote;
    let sex = existing.sex;
    if (req.body.sex !== undefined) {
      const nextSex = normalizeSex(req.body.sex);
      if (!nextSex) {
        return res.status(400).json({ error: "sex invalide (M ou F attendu)" });
      }
      sex = nextSex;
    }
    if (!fullName) {
      return res.status(400).json({ error: "Nom complet requis" });
    }
    if (req.body.dateOfBirth !== undefined && req.body.dateOfBirth != null && String(req.body.dateOfBirth).trim() !== "" && !dateOfBirth) {
      return res.status(400).json({ error: "dateOfBirth invalide (format attendu: JJ/MM/AAAA)" });
    }

    // Correcting the sex rekeys the student: the matricule encodes M/F, so a
    // new id is generated and every linked row follows it in one transaction.
    const sexChanged = req.body.sex !== undefined && sex !== normalizeSex(existing.sex);
    let targetId = id;
    if (sexChanged) {
      const newId = await makeStudentId(fullName, sex);
      const rekeyRow = {
        ...existing,
        id: newId,
        matricule: newId,
        sex,
        fullName,
        createdAt,
        monthlyDue,
        parentName,
        parentPhone,
        dateOfBirth,
        parentPhoneAlt,
        address,
        emergencyContact,
        studentNote
      };
      const cols = Object.keys(rekeyRow);
      const colSql = cols.map((c) => `"${c}"`).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`INSERT INTO students (${colSql}) VALUES (${placeholders})`, cols.map((c) => rekeyRow[c]));
        await client.query(
          `UPDATE payments SET "studentId" = $1, "studentMatriculeSnapshot" = $1 WHERE "studentId" = $2`,
          [newId, id]
        );
        await client.query(`UPDATE student_fee_overrides SET "studentId" = $1 WHERE "studentId" = $2`, [newId, id]);
        await client.query(`UPDATE student_bus_subscription SET "studentId" = $1 WHERE "studentId" = $2`, [newId, id]);
        await client.query(`UPDATE student_grades SET "studentId" = $1 WHERE "studentId" = $2`, [newId, id]);
        await client.query(`DELETE FROM students WHERE id = $1`, [id]);
        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
      targetId = newId;
    } else {
      await run(
        `UPDATE students
         SET "fullName" = ?, "createdAt" = ?, "monthlyDue" = ?, "parentName" = ?, "parentPhone" = ?, "dateOfBirth" = ?, "parentPhoneAlt" = ?, "address" = ?, "emergencyContact" = ?, "studentNote" = ?, sex = ?
         WHERE id = ?`,
        [fullName, createdAt, monthlyDue, parentName, parentPhone, dateOfBirth, parentPhoneAlt, address, emergencyContact, studentNote, sex, id]
      );
    }

    const updated = await get(`SELECT * FROM students WHERE id = ?`, [targetId]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update-profile",
      entityType: "student",
      entityId: targetId,
      details: {
        ...(sexChanged ? { rekeyedFrom: id, rekeyedTo: targetId } : {}),
        before: {
          fullName: existing.fullName,
          createdAt: existing.createdAt,
          monthlyDue: existing.monthlyDue,
          parentName: existing.parentName,
          parentPhone: existing.parentPhone,
          dateOfBirth: existing.dateOfBirth,
          parentPhoneAlt: existing.parentPhoneAlt,
          address: existing.address,
          emergencyContact: existing.emergencyContact,
          studentNote: existing.studentNote,
          sex: existing.sex
        },
        after: {
          fullName,
          createdAt,
          monthlyDue,
          parentName,
          parentPhone,
          dateOfBirth,
          parentPhoneAlt,
          address,
          emergencyContact,
          studentNote,
          sex
        }
      }
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Change student class/level (promotion/demotion)
 * roles: admin + caissier
 * body: { classId?, className?, level, effectiveMonth?, reason?, monthlyDue?, useDefaultMonthlyDue? }
 */
app.put("/api/students/:id/class", requireRole("admin", "caissier"), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });

    const level = req.body?.level != null ? normalizeLevel(req.body.level) : normalizeLevel(existing.level);
    const classNameRaw = req.body?.className ?? req.body?.classId;
    let className = classNameRaw != null ? String(classNameRaw).trim() : String(existing.className || "").trim();
    const effectiveMonth = req.body?.effectiveMonth == null || req.body?.effectiveMonth === ""
      ? null
      : normalizeMonthKey(req.body.effectiveMonth);
    const reason = req.body?.reason == null ? null : String(req.body.reason).trim();

    if (!level) return res.status(400).json({ error: "Le niveau doit Ãªtre maternelle|primaire|secondaire" });
    if (!className) return res.status(400).json({ error: "className (ou classId) requis" });
    if (req.body?.effectiveMonth != null && req.body?.effectiveMonth !== "" && !effectiveMonth) {
      return res.status(400).json({ error: "effectiveMonth doit Ãªtre au format YYYY-MM" });
    }
    const targetSchoolYearStartYear =
      normalizeSchoolYearStartYear(existing.schoolYearStartYear) ||
      await getActiveSchoolYearStartYear();
    const classCodeRule = await enforceClassCodeCapacity({
      level,
      className,
      schoolYearStartYear: targetSchoolYearStartYear,
      excludeStudentId: id
    });
    className = classCodeRule.normalizedClassName;

    const hasMonthlyDueInput = Object.prototype.hasOwnProperty.call(req.body || {}, "monthlyDue");
    const forceDefaultMonthlyDue = req.body?.useDefaultMonthlyDue === true;
    const previousDefaultMonthlyDue = await defaultMonthlyDueForLevelClass(existing.level, existing.className, {
      schoolYearStartYear: targetSchoolYearStartYear
    });
    const targetDefaultMonthlyDue = await defaultMonthlyDueForLevelClass(level, className, {
      schoolYearStartYear: targetSchoolYearStartYear
    });
    const existingMonthlyDue = Number(existing.monthlyDue);
    const withinAmountTolerance = (a, b) =>
      Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

    let nextMonthlyDue;
    let monthlyDuePolicy = "preserve-custom";
    if (hasMonthlyDueInput && req.body?.monthlyDue !== "") {
      nextMonthlyDue = Number(req.body.monthlyDue);
      monthlyDuePolicy = "explicit";
    } else if (!Number.isFinite(existingMonthlyDue)) {
      nextMonthlyDue = targetDefaultMonthlyDue;
      monthlyDuePolicy = "default-missing-existing";
    } else if (
      forceDefaultMonthlyDue ||
      withinAmountTolerance(existingMonthlyDue, previousDefaultMonthlyDue)
    ) {
      nextMonthlyDue = targetDefaultMonthlyDue;
      monthlyDuePolicy = forceDefaultMonthlyDue ? "force-default" : "default-aligned";
    } else {
      nextMonthlyDue = existingMonthlyDue;
    }
    if (!Number.isFinite(nextMonthlyDue) || nextMonthlyDue < 0) {
      return res.status(400).json({ error: "monthlyDue doit Ãªtre un nombre >= 0" });
    }
    const classEffectiveMonth = effectiveMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    await run(
      `UPDATE students SET level = ?, className = ?, "monthlyDue" = ?, "classEffectiveMonth" = ? WHERE id = ?`,
      [level, className, nextMonthlyDue, classEffectiveMonth, id]
    );
    const updated = await get(`SELECT * FROM students WHERE id = ?`, [id]);

    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "change-class",
      entityType: "student",
      entityId: id,
      details: {
        before: { level: existing.level, className: existing.className, monthlyDue: existing.monthlyDue },
        after: { level, className, monthlyDue: nextMonthlyDue, classEffectiveMonth },
        monthlyDuePolicy,
        previousDefaultMonthlyDue,
        targetDefaultMonthlyDue,
        effectiveMonth: classEffectiveMonth,
        reason: reason || null
      }
    });

    res.json(updated);
  } catch (e) {
    if (sendClassCodeError(res, e)) return;
    res.status(500).json({ error: String(e.message || e) });
  }
});
/**
 * Set student active/inactive
 * PATCH /api/students/:id/active
 * body: { isActive: true|false, inactiveReasonCategory?, inactiveReasonNote? }
 */
app.patch("/api/students/:id/active", requireRole("admin", "caissier"), async (req, res) => {
  try {
    const { id } = req.params;
    const isActive = req.body?.isActive;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive doit Ãªtre boolÃ©en" });
    }

    const existing = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });

    let inactiveReasonCategory = null;
    let inactiveReasonNote = null;
    if (isActive === false) {
      inactiveReasonCategory = normalizeInactiveReasonCategory(req.body?.inactiveReasonCategory ?? req.body?.reasonCategory ?? req.body?.category);
      inactiveReasonNote = normalizeOptionalText(req.body?.inactiveReasonNote ?? req.body?.reasonNote ?? req.body?.reason, 500);
      if (!inactiveReasonCategory) {
        return res.status(400).json({ error: "Choisissez une catÃ©gorie pour radier / inactiver l'Ã©lÃ¨ve." });
      }
      if (inactiveReasonCategory === "Autre" && !inactiveReasonNote) {
        return res.status(400).json({ error: "Expliquez la raison quand la catÃ©gorie est Autre." });
      }
    }

    if (isActive === false) {
      await run(
        `UPDATE students
         SET "isActive" = ?,
             "inactiveReasonCategory" = ?,
             "inactiveReasonNote" = ?,
             "inactiveAt" = NOW(),
             "inactiveByUserId" = ?,
             "inactiveByUsername" = ?
         WHERE id = ?`,
        [
          isActive,
          inactiveReasonCategory,
          inactiveReasonNote,
          req.auth?.sub ? Number(req.auth.sub) : null,
          req.auth?.username || null,
          id
        ]
      );
    } else {
      await run(
        `UPDATE students
         SET "isActive" = ?,
             "inactiveReasonCategory" = NULL,
             "inactiveReasonNote" = NULL,
             "inactiveAt" = NULL,
             "inactiveByUserId" = NULL,
             "inactiveByUsername" = NULL
         WHERE id = ?`,
        [isActive, id]
      );
    }

    const updated = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "set-active",
      entityType: "student",
      entityId: id,
      details: {
        isActive,
        inactiveReasonCategory,
        inactiveReasonNote
      }
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Admin-only: transfer receipt ownership, keep the audit trail, then close the duplicate.
app.get("/api/students/:id/merge-preview", requireRole("admin"), async (req, res) => {
  try {
    const duplicateId = String(req.params.id || "").trim();
    const targetId = String(req.query.targetId || "").trim();
    if (!duplicateId || !targetId || duplicateId === targetId) return res.status(400).json({ error: "Choisissez deux élèves différents." });
    const [duplicate, target] = await Promise.all([get(`SELECT * FROM students WHERE id = ?`, [duplicateId]), get(`SELECT * FROM students WHERE id = ?`, [targetId])]);
    if (!duplicate || !target) return res.status(404).json({ error: "Élève introuvable." });
    if (!isActiveStudentRecord(duplicate)) return res.status(409).json({ error: "Le dossier doublon est déjà inactif." });
    if (!isActiveStudentRecord(target)) return res.status(409).json({ error: "Le dossier à conserver doit être actif." });
    if (Number(duplicate.schoolYearStartYear) !== Number(target.schoolYearStartYear)) return res.status(409).json({ error: "Les deux dossiers doivent appartenir à la même année scolaire." });
    const payments = await all(`SELECT id, "receiptNo", "cancelledAt" FROM payments WHERE "studentId" = ? ORDER BY "createdAt" DESC`, [duplicateId]);
    const activePaymentCount = payments.filter((row) => !row.cancelledAt).length;
    res.json({
      duplicate: { id: duplicate.id, matricule: duplicate.matricule, fullName: duplicate.fullName, className: duplicate.className },
      target: { id: target.id, matricule: target.matricule, fullName: target.fullName, className: target.className },
      paymentCount: payments.length,
      activePaymentCount,
      cancelledPaymentCount: payments.length - activePaymentCount
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.post("/api/students/:id/merge-into", requireRole("admin"), async (req, res) => {
  const duplicateId = String(req.params.id || "").trim();
  const targetId = String(req.body?.targetStudentId || "").trim();
  const confirmationMatricule = String(req.body?.confirmationMatricule || "").trim();
  if (!duplicateId || !targetId || duplicateId === targetId) return res.status(400).json({ error: "Choisissez deux élèves différents." });
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const lockedStudents = await client.query(`SELECT * FROM students WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`, [[duplicateId, targetId]]);
    const duplicate = lockedStudents.rows.find((row) => String(row.id) === duplicateId);
    const target = lockedStudents.rows.find((row) => String(row.id) === targetId);
    if (!duplicate || !target) throw Object.assign(new Error("Élève introuvable."), { status: 404 });
    if (!isActiveStudentRecord(duplicate)) throw Object.assign(new Error("Le dossier doublon est déjà inactif."), { status: 409 });
    if (!isActiveStudentRecord(target)) throw Object.assign(new Error("Le dossier à conserver doit être actif."), { status: 409 });
    if (Number(duplicate.schoolYearStartYear) !== Number(target.schoolYearStartYear)) throw Object.assign(new Error("Les deux dossiers doivent appartenir à la même année scolaire."), { status: 409 });
    if (!confirmationMatricule || confirmationMatricule !== String(target.matricule || "")) throw Object.assign(new Error("Saisissez exactement le matricule du dossier à conserver pour confirmer."), { status: 400 });
    const paymentResult = await client.query(`SELECT id FROM payments WHERE "studentId" = $1 FOR UPDATE`, [duplicateId]);
    const paymentIds = paymentResult.rows.map((row) => Number(row.id));
    await client.query(`UPDATE payments SET "studentId" = $1 WHERE "studentId" = $2`, [targetId, duplicateId]);
    const note = `Fusionné dans ${target.fullName} (${target.matricule}). Paiements transférés sans modification des reçus.`;
    await client.query(`UPDATE students SET "isActive" = FALSE, "inactiveReasonCategory" = 'Doublon', "inactiveReasonNote" = $1, "inactiveAt" = NOW(), "inactiveByUserId" = $2, "inactiveByUsername" = $3 WHERE id = $4`, [note, req.auth?.sub ? Number(req.auth.sub) : null, req.auth?.username || null, duplicateId]);
    await client.query(`INSERT INTO audit_logs ("actorId", "actorUsername", "actorRole", action, "entityType", "entityId", details, "createdAt") VALUES ($1, $2, $3, 'merge-duplicate', 'student', $4, $5::jsonb, $6)`, [req.auth?.sub ? Number(req.auth.sub) : null, req.auth?.username || null, req.auth?.role || null, targetId, JSON.stringify({ duplicate: { id: duplicateId, matricule: duplicate.matricule, fullName: duplicate.fullName }, target: { id: targetId, matricule: target.matricule, fullName: target.fullName }, transferredPaymentIds: paymentIds, transferredPaymentCount: paymentIds.length, preservedReceiptNumbers: true }), nowIso()]);
    await client.query("COMMIT");
    res.json({ ok: true, targetStudentId: targetId, duplicateStudentId: duplicateId, transferredPaymentCount: paymentIds.length });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(Number(e.status || 500)).json({ error: String(e.message || e) });
  } finally { client.release(); }
});
/**
 * Delete student
 */
app.delete("/api/students/:id", requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await get(`SELECT * FROM students WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Ã‰lÃ¨ve introuvable" });

    await run(`DELETE FROM students WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "delete",
      entityType: "student",
      entityId: id,
      details: { fullName: existing.fullName, className: existing.className }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
}

module.exports = registerStudentsRoutes;
