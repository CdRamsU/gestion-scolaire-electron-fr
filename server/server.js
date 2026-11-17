// server.js
// Gestion Scolaire : serveur Express + PostgreSQL et interface dans ../Public/index.html

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { execFile } = require("child_process");
const session = require("express-session");
const pgSessionFactory = require("connect-pg-simple");
const registerSettingsRoutes = require("./routes/settings.routes");
const registerStudentsRoutes = require("./routes/students.routes");
const registerPaymentsRoutes = require("./routes/payments.routes");
const registerReportsRoutes = require("./routes/reports.routes");
const registerClosuresRoutes = require("./routes/closures.routes");
const registerGradesRoutes = require("./routes/grades.routes");

const app = express();
const PORT = process.env.PORT || 3000;
const SSL_PORT = Number(process.env.SSL_PORT || 8443);
const FORCE_HTTPS_REDIRECT = String(process.env.FORCE_HTTPS_REDIRECT || "1") === "1";
const APP_READ_ONLY = String(process.env.APP_READ_ONLY || "0") === "1";

/* =========================
   Middleware
========================= */
app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use("/api/configuration", express.json({ limit: "200kb" }));
app.use(express.json());

/* =========================
   Database (PostgreSQL only)
========================= */
const DB_CLIENT = "postgres";
const pgPool = require("./postgres/client").makePool();
const configuration = require("./config/service").createConfiguration(pgPool);
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-change-this-secret";
const PgSessionStore = pgSessionFactory(session);

const PG_IDENTIFIER_MAP = {
  fullName: '"fullName"',
  className: '"className"',
  monthlyDue: '"monthlyDue"',
  classEffectiveMonth: '"classEffectiveMonth"',
  matricule: '"matricule"',
  isActive: '"isActive"',
  createdAt: '"createdAt"',
  studentId: '"studentId"',
  monthKey: '"monthKey"',
  feeType: '"feeType"'
};

const SQL_ACTIVE_TRUE = "TRUE";
const DEFAULT_LEVEL_MONTHLY_DUE_USD = Object.freeze({
  maternelle: 30,
  primaire: 35,
  secondaire: 50,
  secondaire4eH: 70
});
const LEGACY_LEVEL_MONTHLY_DUE_USD = Object.freeze({
  maternelle: 35,
  primaire: 30,
  secondaire: 50,
  secondaire4eH: 70
});
const BUSINESS_TIMEZONE = String(process.env.BUSINESS_TIMEZONE || process.env.TZ || "Africa/Lubumbashi");
const SETTINGS_CACHE_TTL_MS = Math.max(250, Number(process.env.SETTINGS_CACHE_TTL_MS || 5000));
const HOT_API_CACHE_TTL_MS = Math.max(200, Number(process.env.HOT_API_CACHE_TTL_MS || 1200));
const runtimeCache = {
  schoolYearStartYear: { value: null, expiresAt: 0 },
  levelMonthlyDueUSDBySchoolYear: new Map()
};
const hotApiCache = new Map();
const REQUIRED_FEE_TYPES = Object.freeze([
  { code: "TUITION", labelFr: "Minerval", defaultCurrency: "USD", defaultAmount: 0, billingCycle: "monthly", active: true },
  { code: "BUS", labelFr: "Bus", defaultCurrency: "USD", defaultAmount: 10, billingCycle: "monthly", active: true },

  { code: "ETAT_T1_PM", labelFr: "Frais de l'État — 1re tranche (Maternelle/Primaire)", defaultCurrency: "CDF", defaultAmount: 9000, billingCycle: "annual", active: true },
  { code: "ETAT_T2_PM", labelFr: "Frais de l'État — 2e tranche (Maternelle/Primaire)", defaultCurrency: "CDF", defaultAmount: 9000, billingCycle: "annual", active: true },
  { code: "ETAT_T3_PM", labelFr: "Frais de l'État — 3e tranche (Maternelle/Primaire)", defaultCurrency: "CDF", defaultAmount: 9000, billingCycle: "annual", active: true },

  { code: "ETAT_T1_78", labelFr: "Frais de l'État — 1re tranche (7e/8e)", defaultCurrency: "CDF", defaultAmount: 16500, billingCycle: "annual", active: true },
  { code: "ETAT_T2_78", labelFr: "Frais de l'État — 2e tranche (7e/8e)", defaultCurrency: "CDF", defaultAmount: 16500, billingCycle: "annual", active: true },
  { code: "ETAT_T3_78", labelFr: "Frais de l'État — 3e tranche (7e/8e)", defaultCurrency: "CDF", defaultAmount: 16500, billingCycle: "annual", active: true },

  { code: "ETAT_T1_SEC_GENERAL", labelFr: "Frais de l'État — 1re tranche (Secondaire général)", defaultCurrency: "CDF", defaultAmount: 21500, billingCycle: "annual", active: true },
  { code: "ETAT_T2_SEC_GENERAL", labelFr: "Frais de l'État — 2e tranche (Secondaire général)", defaultCurrency: "CDF", defaultAmount: 21500, billingCycle: "annual", active: true },
  { code: "ETAT_T3_SEC_GENERAL", labelFr: "Frais de l'État — 3e tranche (Secondaire général)", defaultCurrency: "CDF", defaultAmount: 21500, billingCycle: "annual", active: true },

  { code: "ETAT_T1_SEC_TECH", labelFr: "Frais de l'État — 1re tranche (Secondaire technique)", defaultCurrency: "CDF", defaultAmount: 22500, billingCycle: "annual", active: true },
  { code: "ETAT_T2_SEC_TECH", labelFr: "Frais de l'État — 2e tranche (Secondaire technique)", defaultCurrency: "CDF", defaultAmount: 22500, billingCycle: "annual", active: true },
  { code: "ETAT_T3_SEC_TECH", labelFr: "Frais de l'État — 3e tranche (Secondaire technique)", defaultCurrency: "CDF", defaultAmount: 22500, billingCycle: "annual", active: true },

  { code: "ETAT_MINERVAL", labelFr: "Minerval de l'État", defaultCurrency: "CDF", defaultAmount: 2500, billingCycle: "annual", active: true },
  { code: "ETAT_FRAIS_TECHNIQUE", labelFr: "Frais technique", defaultCurrency: "CDF", defaultAmount: 17500, billingCycle: "annual", active: true },

  { code: "EXAMEN_ETAT_4E", labelFr: "Examen d'État (4e)", defaultCurrency: "CDF", defaultAmount: 160000, billingCycle: "annual", active: true },
  { code: "TENASOSP_8E", labelFr: "Frais TENASOSP (8e)", defaultCurrency: "CDF", defaultAmount: 40000, billingCycle: "annual", active: true },
  { code: "ENROLEMENT_8E", labelFr: "Frais d’enrôlement (8e)", defaultCurrency: "CDF", defaultAmount: 20000, billingCycle: "annual", active: true },
  { code: "ENROLEMENT_4E", labelFr: "Frais d’enrôlement (4e)", defaultCurrency: "CDF", defaultAmount: 55000, billingCycle: "annual", active: true }
]);
const REMOVED_REQUIRED_FEE_TYPE_CODES = Object.freeze([
  "ETAT_BULLETIN",
  "ETAT_FORMATION_IPP"
]);
const LEGACY_FEE_TYPE_ALIASES = Object.freeze({
  ETAT_BULLETIN: Object.freeze({
    codes: Object.freeze(["CD", "BULLETIN"]),
    labels: Object.freeze(["bulletin"])
  }),
  ETAT_MINERVAL: Object.freeze({
    codes: Object.freeze(["MINERVAL_ET_L_ETAT", "MINERVAL_ETAT", "MINERVAL_DE_L_ETAT"]),
    labels: Object.freeze(["minerval de l etat", "minerval etat"])
  })
});

function normalizeLevelMonthlyDueConfig(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const parseFee = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Number(n) : fallback;
  };
  const base = {
    maternelle: parseFee(obj.maternelle, DEFAULT_LEVEL_MONTHLY_DUE_USD.maternelle),
    primaire: parseFee(obj.primaire, DEFAULT_LEVEL_MONTHLY_DUE_USD.primaire),
    secondaire: parseFee(obj.secondaire, DEFAULT_LEVEL_MONTHLY_DUE_USD.secondaire),
    secondaire4eH: parseFee(obj.secondaire4eH, DEFAULT_LEVEL_MONTHLY_DUE_USD.secondaire4eH)
  };
  const monthlyOverrides = {};
  const rawOverrides = obj.monthlyOverrides && typeof obj.monthlyOverrides === "object"
    ? obj.monthlyOverrides
    : {};
  for (const [monthKey, monthConfig] of Object.entries(rawOverrides)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || ""))) continue;
    if (!monthConfig || typeof monthConfig !== "object") continue;
    monthlyOverrides[monthKey] = {
      maternelle: parseFee(monthConfig.maternelle, base.maternelle),
      primaire: parseFee(monthConfig.primaire, base.primaire),
      secondaire: parseFee(monthConfig.secondaire, base.secondaire),
      secondaire4eH: parseFee(monthConfig.secondaire4eH, base.secondaire4eH)
    };
  }
  return { ...base, monthlyOverrides };
}

function cloneJsonLike(value) {
  // API payloads are treated as immutable once cached.
  // Returning the same reference avoids expensive deep clones on hot paths.
  return value;
}
function invalidateSettingsRuntimeCache() {
  runtimeCache.schoolYearStartYear = { value: null, expiresAt: 0 };
  runtimeCache.levelMonthlyDueUSDBySchoolYear = new Map();
}
function purgeHotApiCache() {
  hotApiCache.clear();
}
function cacheKeyForApi(req, scope) {
  const role = String(req.auth?.role || req.session?.user?.role || "anon").toLowerCase();
  const url = String(req.originalUrl || req.url || "");
  return `${scope}|${role}|${url}`;
}
async function getCachedHotApiValue(key, loader) {
  const now = Date.now();
  const cached = hotApiCache.get(key);
  if (cached && cached.expiresAt > now) {
    if (cached.promise) return cached.promise;
    return cloneJsonLike(cached.value);
  }
  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      hotApiCache.set(key, {
        value: cloneJsonLike(value),
        expiresAt: Date.now() + HOT_API_CACHE_TTL_MS,
        promise: null
      });
      return cloneJsonLike(value);
    })
    .catch((err) => {
      hotApiCache.delete(key);
      throw err;
    });
  hotApiCache.set(key, {
    value: null,
    expiresAt: now + HOT_API_CACHE_TTL_MS,
    promise
  });
  return promise;
}

function toPgSql(sql) {
  let out = String(sql || "");
  out = out.replace(/\?/g, () => "$" + (++toPgSql._paramIdx));
  for (const [raw, quoted] of Object.entries(PG_IDENTIFIER_MAP)) {
    const re = new RegExp(`(?<!")\\b${raw}\\b(?!")`, "g");
    out = out.replace(re, quoted);
  }
  return out;
}

// Promisified helpers
function run(sql, params = []) {
  toPgSql._paramIdx = 0;
  const pgSql = toPgSql(sql);
  return pgPool.query(pgSql, params).then((result) => ({
    lastID: null,
    changes: Number(result.rowCount || 0)
  }));
}
function get(sql, params = []) {
  toPgSql._paramIdx = 0;
  const pgSql = toPgSql(sql);
  return pgPool.query(pgSql, params).then((result) => result.rows[0]);
}
function all(sql, params = []) {
  toPgSql._paramIdx = 0;
  const pgSql = toPgSql(sql);
  return pgPool.query(pgSql, params).then((result) => result.rows || []);
}

async function initDb() {
  const schemaFile = path.join(__dirname, "postgres", "schema.sql");
  const ddl = await fs.promises.readFile(schemaFile, "utf8");
  await pgPool.query(ddl);
  await pgPool.query(
    `ALTER TABLE payments
     ADD COLUMN IF NOT EXISTS "feeType" TEXT NOT NULL DEFAULT 'Minerval'`
  );
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "receiptNo" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "createdByUserId" BIGINT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "createdByUsername" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "feeTypeId" BIGINT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "paidForMonth" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "fxRate" NUMERIC`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "amountUSDReceived" NUMERIC(12,2)`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "amountCDFReceived" NUMERIC(14,2)`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "receiptDeviceId" BIGINT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "receiptDeviceCode" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "studentNameSnapshot" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "studentMatriculeSnapshot" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "classNameSnapshot" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "levelSnapshot" TEXT`);
  // Mode de paiement : NULL/'cash' = espèces (compte dans la caisse) ; 'staff_benefit'
  // = prise en charge (personnel), réglé hors caisse — exclu de tous les totaux d'espèces.
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT`);
  // Document de reçu IMMUABLE (source de vérité) : figé à la finalisation du paiement.
  // Contient les décisions d'affichage déjà résolues (mois ou non, cycle, montants…).
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "receiptDoc" JSONB`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "cancelledByUserId" BIGINT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "cancelledByUsername" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "cancelledAmount" NUMERIC`);
  // A cancellation removes money from the caisse only when it was truly returned.
  // Fee-entry mistakes must use the audited reclassification workflow instead.
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "cancellationCashReturned" BOOLEAN`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "dueAmountSnapshot" NUMERIC`);
  await pgPool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS "dueCurrencySnapshot" TEXT`);
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_fee_type_id_fk'
      ) THEN
        ALTER TABLE payments
          ADD CONSTRAINT payments_fee_type_id_fk
          FOREIGN KEY ("feeTypeId") REFERENCES fee_types(id) ON DELETE SET NULL;
      END IF;
    EXCEPTION WHEN undefined_table THEN
      -- fee_types may be created later in init; this block is retried below.
      NULL;
    END $$;
  `).catch(() => {});
  await pgPool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS payments_receipt_no_unique_idx
     ON payments ("receiptNo")
     WHERE "receiptNo" IS NOT NULL`
  );
  await pgPool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS payments_client_request_id_unique_idx
     ON payments ("clientRequestId")
     WHERE "clientRequestId" IS NOT NULL`
  );
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS receipt_counters (
      "receiptYear" INTEGER PRIMARY KEY,
      "lastSeq" BIGINT NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS receipt_devices (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "deviceKey" TEXT NOT NULL UNIQUE,
      code TEXT UNIQUE,
      label TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS receipt_device_counters (
      "deviceId" BIGINT NOT NULL REFERENCES receipt_devices(id) ON DELETE RESTRICT,
      "receiptYear" INTEGER NOT NULL,
      "lastSeq" BIGINT NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("deviceId", "receiptYear")
    )`
  );
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_receipt_device_id_fk') THEN
        ALTER TABLE payments
          ADD CONSTRAINT payments_receipt_device_id_fk
          FOREIGN KEY ("receiptDeviceId") REFERENCES receipt_devices(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS fee_types (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "schoolYearStartYear" INTEGER NOT NULL,
      code TEXT NOT NULL,
      "labelFr" TEXT NOT NULL,
      "defaultCurrency" TEXT NOT NULL CHECK ("defaultCurrency" IN ('USD','CDF')),
      "defaultAmount" NUMERIC NOT NULL DEFAULT 0,
      "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
      "dueMonth" TEXT,
      "hasFixedPrice" BOOLEAN NOT NULL DEFAULT TRUE,
      "scopeLevel" TEXT,
      "scopeLevels" TEXT[] NOT NULL DEFAULT '{}',
      "scopeClasses" TEXT[] NOT NULL DEFAULT '{}',
      "pricingRules" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "skipAutoPrint" BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "schoolYearStartYear" INTEGER`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "billingCycle" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "dueMonth" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "hasFixedPrice" BOOLEAN NOT NULL DEFAULT TRUE`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "scopeLevel" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "scopeLevels" TEXT[]`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "scopeClasses" TEXT[]`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "pricingRules" JSONB`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "skipAutoPrint" BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
  await pgPool.query(`UPDATE fee_types SET "scopeClasses" = '{}'::text[] WHERE "scopeClasses" IS NULL`).catch(() => {});
  await pgPool.query(`UPDATE fee_types SET "scopeLevels" = CASE WHEN "scopeLevel" IS NULL THEN '{}'::text[] ELSE ARRAY["scopeLevel"] END WHERE "scopeLevels" IS NULL OR cardinality("scopeLevels") = 0`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ALTER COLUMN "scopeLevels" SET DEFAULT '{}'::text[]`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ALTER COLUMN "scopeLevels" SET NOT NULL`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ALTER COLUMN "scopeClasses" SET DEFAULT '{}'::text[]`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ALTER COLUMN "scopeClasses" SET NOT NULL`).catch(() => {});
  await pgPool.query(`UPDATE fee_types SET "pricingRules" = '[]'::jsonb WHERE "pricingRules" IS NULL`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ALTER COLUMN "pricingRules" SET DEFAULT '[]'::jsonb`).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ALTER COLUMN "pricingRules" SET NOT NULL`).catch(() => {});
  await pgPool.query(`UPDATE fee_types SET "billingCycle" = COALESCE(NULLIF("billingCycle", ''), 'monthly')`).catch(() => {});
  await pgPool.query(`UPDATE fee_types SET "billingCycle" = 'monthly' WHERE "billingCycle" NOT IN ('monthly','annual','item')`).catch(() => {});
  await pgPool.query(`UPDATE fee_types SET "scopeLevel" = NULL WHERE "scopeLevel" NOT IN ('maternelle','primaire','secondaire')`).catch(() => {});
  // Recreate the check so 'item' is accepted (drop any older 2-value version first).
  await pgPool.query(`ALTER TABLE fee_types DROP CONSTRAINT IF EXISTS fee_types_billing_cycle_check`).catch(() => {});
  await pgPool.query(`
    DO $$
    BEGIN
      ALTER TABLE fee_types
        ADD CONSTRAINT fee_types_billing_cycle_check
        CHECK ("billingCycle" IN ('monthly','annual','item'));
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$;
  `).catch(() => {});
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fee_types_scope_level_check'
      ) THEN
        ALTER TABLE fee_types
          ADD CONSTRAINT fee_types_scope_level_check
          CHECK ("scopeLevel" IS NULL OR "scopeLevel" IN ('maternelle','primaire','secondaire'));
      END IF;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$;
  `).catch(() => {});
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS student_fee_overrides (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "studentId" TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      "feeTypeId" BIGINT NOT NULL REFERENCES fee_types(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('USD','CDF')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE ("studentId", "feeTypeId")
    )`
  );
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS receipt_prints (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "paymentId" BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      "printedBy" BIGINT REFERENCES users(id) ON DELETE SET NULL,
      "printedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  // Immutable allocation-correction events. The payment row keeps representing the
  // original cash movement; only its fee allocation is updated by the admin route.
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS payment_reclassifications (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "paymentId" BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      "oldFeeTypeId" BIGINT REFERENCES fee_types(id) ON DELETE SET NULL,
      "oldFeeType" TEXT NOT NULL,
      "newFeeTypeId" BIGINT REFERENCES fee_types(id) ON DELETE SET NULL,
      "newFeeType" TEXT NOT NULL,
      reason TEXT NOT NULL,
      "correctedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "correctedByUserId" BIGINT REFERENCES users(id) ON DELETE SET NULL,
      "correctedByUsername" TEXT
    )`
  );
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS student_bus_subscription (
      "studentId" TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      "startMonth" TEXT NOT NULL,
      "endMonth" TEXT,
      "category" TEXT,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedByUserId" BIGINT,
      "updatedByUsername" TEXT
    )`
  );
  // Migration idempotente : catégorie d'abonnement bus (pour regrouper par bus).
  await pgPool.query(
    `ALTER TABLE student_bus_subscription ADD COLUMN IF NOT EXISTS "category" TEXT`
  );
  // "Mois fin" remplacé par la catégorie : on efface les anciennes valeurs endMonth
  // (les abonnements deviennent ouverts, actifs à partir du mois de début).
  // Auto-limitée : après le 1er passage, le WHERE ne correspond à rien (no-op).
  await pgPool.query(
    `UPDATE student_bus_subscription SET "endMonth" = NULL WHERE "endMonth" IS NOT NULL`
  );
  // Prise en charge des frais de scolarité (enfant du personnel) : avantage en nature.
  // startMonth = 1er mois couvert ; endMonth = dernier mois couvert (NULL = ouvert).
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS student_tuition_benefit (
      "studentId" TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      "startMonth" TEXT NOT NULL,
      "endMonth" TEXT,
      "employeeName" TEXT,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedByUserId" BIGINT,
      "updatedByUsername" TEXT
    )`
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS payments_student_feetype_idx
     ON payments ("studentId", "feeTypeId")`
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS payments_student_month_effective_idx
     ON payments ("studentId", COALESCE("paidForMonth","monthKey"))`
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS payments_fee_type_month_effective_idx
     ON payments ("feeTypeId", COALESCE("paidForMonth","monthKey"))`
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS receipt_prints_payment_id_idx
     ON receipt_prints ("paymentId")`
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS payment_reclassifications_payment_id_idx
     ON payment_reclassifications ("paymentId", "correctedAt" DESC, id DESC)`
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS students_active_created_idx
     ON students ("isActive", "createdAt" DESC)`
  );
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payments_fee_type_id_fk'
      ) THEN
        ALTER TABLE payments
          ADD CONSTRAINT payments_fee_type_id_fk
          FOREIGN KEY ("feeTypeId") REFERENCES fee_types(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `).catch(() => {});
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS spending (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "date" DATE NOT NULL,
      category TEXT NOT NULL,
      amount NUMERIC NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL CHECK (currency IN ('USD','CDF')),
      "fxRate" NUMERIC,
      note TEXT,
      "createdByUserId" BIGINT,
      "createdByUsername" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL
    )`
  ).catch(async (e) => {
    // Fallback for DBs without pgcrypto extension enabled yet.
    if (!String(e.message || e).toLowerCase().includes("gen_random_uuid")) throw e;
    await pgPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS spending (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "date" DATE NOT NULL,
        category TEXT NOT NULL,
        amount NUMERIC NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL CHECK (currency IN ('USD','CDF')),
        "fxRate" NUMERIC,
        note TEXT,
        "createdByUserId" BIGINT,
        "createdByUsername" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL
      )`
    );
  });
  await pgPool.query(`ALTER TABLE spending ADD COLUMN IF NOT EXISTS "createdByUserId" BIGINT`).catch(() => {});
  await pgPool.query(`ALTER TABLE spending ADD COLUMN IF NOT EXISTS "createdByUsername" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE spending ADD COLUMN IF NOT EXISTS "schoolYearStartYear" INTEGER`).catch(() => {});
  await pgPool.query(`ALTER TABLE spending ADD COLUMN IF NOT EXISTS "appliesToMonth" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE spending ADD COLUMN IF NOT EXISTS "caisseBoxKey" TEXT`).catch(() => {});
  await pgPool.query(
    `UPDATE spending
     SET "schoolYearStartYear" = CASE
       WHEN EXTRACT(MONTH FROM "date")::int >= 9 THEN EXTRACT(YEAR FROM "date")::int
       ELSE EXTRACT(YEAR FROM "date")::int - 1
     END
     WHERE "schoolYearStartYear" IS NULL`
  ).catch(() => {});
  await pgPool.query(
    `UPDATE spending
     SET "appliesToMonth" = CASE
       WHEN "schoolYearStartYear" IS NOT NULL
         AND to_char("date", 'YYYY-MM') >= ("schoolYearStartYear"::text || '-09')
         AND to_char("date", 'YYYY-MM') <= (("schoolYearStartYear" + 1)::text || '-08')
         THEN to_char("date", 'YYYY-MM')
       WHEN "schoolYearStartYear" IS NOT NULL
         THEN ("schoolYearStartYear"::text || '-09')
       ELSE to_char("date", 'YYYY-MM')
     END
     WHERE "appliesToMonth" IS NULL OR btrim("appliesToMonth") = ''`
  ).catch(() => {});
  await pgPool.query(`ALTER TABLE spending ALTER COLUMN "schoolYearStartYear" SET NOT NULL`).catch(() => {});
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS spending_school_year_date_idx
     ON spending ("schoolYearStartYear", "date" DESC, "createdAt" DESC)`
  ).catch(() => {});
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS spending_school_year_month_idx
     ON spending ("schoolYearStartYear", "appliesToMonth", "date" DESC, "createdAt" DESC)`
  ).catch(() => {});
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS spending_caisse_box_idx
     ON spending ("schoolYearStartYear", "caisseBoxKey", "date" DESC, "createdAt" DESC)`
  ).catch(() => {});
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS caisse_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "date" DATE NOT NULL,
      "appliesToMonth" TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('transfer','exchange')),
      "sourceBoxKey" TEXT NOT NULL,
      "counterpartyBoxKey" TEXT NOT NULL,
      "sourceCurrency" TEXT NOT NULL CHECK ("sourceCurrency" IN ('USD','CDF')),
      "sourceAmount" NUMERIC NOT NULL CHECK ("sourceAmount" > 0),
      "counterCurrency" TEXT CHECK ("counterCurrency" IS NULL OR "counterCurrency" IN ('USD','CDF')),
      "counterAmount" NUMERIC NOT NULL DEFAULT 0 CHECK ("counterAmount" >= 0),
      "fxRate" NUMERIC,
      note TEXT,
      "schoolYearStartYear" INTEGER NOT NULL,
      "createdByUserId" BIGINT,
      "createdByUsername" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL
    )`
  ).catch(async (e) => {
    if (!String(e.message || e).toLowerCase().includes("gen_random_uuid")) throw e;
    await pgPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS caisse_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "date" DATE NOT NULL,
        "appliesToMonth" TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('transfer','exchange')),
        "sourceBoxKey" TEXT NOT NULL,
        "counterpartyBoxKey" TEXT NOT NULL,
        "sourceCurrency" TEXT NOT NULL CHECK ("sourceCurrency" IN ('USD','CDF')),
        "sourceAmount" NUMERIC NOT NULL CHECK ("sourceAmount" > 0),
        "counterCurrency" TEXT CHECK ("counterCurrency" IS NULL OR "counterCurrency" IN ('USD','CDF')),
        "counterAmount" NUMERIC NOT NULL DEFAULT 0 CHECK ("counterAmount" >= 0),
        "fxRate" NUMERIC,
        note TEXT,
        "schoolYearStartYear" INTEGER NOT NULL,
        "createdByUserId" BIGINT,
        "createdByUsername" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL
      )`
    );
  });
  await pgPool.query(`ALTER TABLE caisse_transfers ADD COLUMN IF NOT EXISTS "createdByUserId" BIGINT`).catch(() => {});
  await pgPool.query(`ALTER TABLE caisse_transfers ADD COLUMN IF NOT EXISTS "createdByUsername" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE caisse_transfers ADD COLUMN IF NOT EXISTS "schoolYearStartYear" INTEGER`).catch(() => {});
  await pgPool.query(`ALTER TABLE caisse_transfers ADD COLUMN IF NOT EXISTS "appliesToMonth" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE caisse_transfers ADD COLUMN IF NOT EXISTS "counterCurrency" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE caisse_transfers ADD COLUMN IF NOT EXISTS "counterAmount" NUMERIC NOT NULL DEFAULT 0`).catch(() => {});
  await pgPool.query(`ALTER TABLE caisse_transfers ADD COLUMN IF NOT EXISTS "fxRate" NUMERIC`).catch(() => {});
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS caisse_transfers_school_year_date_idx
     ON caisse_transfers ("schoolYearStartYear", "date" DESC, "createdAt" DESC)`
  ).catch(() => {});
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS caisse_transfers_source_idx
     ON caisse_transfers ("schoolYearStartYear", "sourceBoxKey", "date" DESC, "createdAt" DESC)`
  ).catch(() => {});
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS caisse_transfers_counterparty_idx
     ON caisse_transfers ("schoolYearStartYear", "counterpartyBoxKey", "date" DESC, "createdAt" DESC)`
  ).catch(() => {});
  // Migration: la caisse de l'État-minerval a été renommée 'minerval_etat' -> 'fee_etat_minerval'.
  await pgPool.query(`UPDATE spending SET "caisseBoxKey" = 'fee_etat_minerval' WHERE "caisseBoxKey" = 'minerval_etat'`).catch(() => {});
  await pgPool.query(`UPDATE caisse_transfers SET "sourceBoxKey" = 'fee_etat_minerval' WHERE "sourceBoxKey" = 'minerval_etat'`).catch(() => {});
  await pgPool.query(`UPDATE caisse_transfers SET "counterpartyBoxKey" = 'fee_etat_minerval' WHERE "counterpartyBoxKey" = 'minerval_etat'`).catch(() => {});
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      "passwordHash" TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','caissier','comptable')),
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL
    )`
  );
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "actorId" BIGINT,
      "actorUsername" TEXT,
      "actorRole" TEXT,
      action TEXT NOT NULL,
      "entityType" TEXT NOT NULL,
      "entityId" TEXT,
      details JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL
    )`
  );
  await pgPool.query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pgPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "classEffectiveMonth" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "schoolYearStartYear" INTEGER`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "matricule" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS sex TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "parentName" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "parentPhone" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "parentPhoneAlt" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "familyId" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "familyName" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "address" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "emergencyContact" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "studentNote" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "inactiveReasonCategory" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "inactiveReasonNote" TEXT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "inactiveAt" TIMESTAMPTZ`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "inactiveByUserId" BIGINT`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS "inactiveByUsername" TEXT`).catch(() => {});
  await pgPool.query(
    `UPDATE students
     SET "schoolYearStartYear" = (
       CASE
         WHEN COALESCE(NULLIF("classEffectiveMonth", ''), TO_CHAR("createdAt", 'YYYY-MM')) ~ '^[0-9]{4}-[0-9]{2}$' THEN
           (
             CASE
               WHEN SUBSTRING(COALESCE(NULLIF("classEffectiveMonth", ''), TO_CHAR("createdAt", 'YYYY-MM')) FROM 6 FOR 2)::int >= 9
                 THEN SUBSTRING(COALESCE(NULLIF("classEffectiveMonth", ''), TO_CHAR("createdAt", 'YYYY-MM')) FROM 1 FOR 4)::int
               ELSE SUBSTRING(COALESCE(NULLIF("classEffectiveMonth", ''), TO_CHAR("createdAt", 'YYYY-MM')) FROM 1 FOR 4)::int - 1
             END
           )
         ELSE EXTRACT(YEAR FROM COALESCE("createdAt", NOW()))::int
       END
     )
     WHERE "schoolYearStartYear" IS NULL`
  ).catch(() => {});
  await pgPool.query(`UPDATE students SET "schoolYearStartYear" = EXTRACT(YEAR FROM NOW())::int WHERE "schoolYearStartYear" IS NULL`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ALTER COLUMN "schoolYearStartYear" SET NOT NULL`).catch(() => {});
  await pgPool.query(`ALTER TABLE students ALTER COLUMN "schoolYearStartYear" SET DEFAULT EXTRACT(YEAR FROM NOW())::int`).catch(() => {});
  await pgPool.query(
    `UPDATE students
     SET "matricule" = UPPER(COALESCE(NULLIF(TRIM("matricule"), ''), TRIM(id)))
     WHERE COALESCE(NULLIF(TRIM("matricule"), ''), '') = ''`
  ).catch(() => {});
  await pgPool.query(`ALTER TABLE students ALTER COLUMN "matricule" SET NOT NULL`).catch(() => {});
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS students_school_year_active_created_idx
     ON students ("schoolYearStartYear", "isActive", "createdAt" DESC)`
  ).catch(() => {});
  await pgPool.query(`CREATE INDEX IF NOT EXISTS students_family_id_idx ON students ("familyId")`).catch(() => {});
  await pgPool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS students_school_year_matricule_unique_idx
     ON students ("schoolYearStartYear", UPPER("matricule"))`
  ).catch(() => {});

  await migrateFeeTypesToSchoolYearScope();
  const mojibakeCleanup = await repairKnownMojibakeText().catch(() => ({ studentsFixed: 0, paymentsFixed: 0 }));
  if (Number(mojibakeCleanup?.studentsFixed || 0) > 0 || Number(mojibakeCleanup?.paymentsFixed || 0) > 0) {
    console.log(
      `🧹 Nettoyage texte mojibake: students=${Number(mojibakeCleanup.studentsFixed || 0)}, payments=${Number(mojibakeCleanup.paymentsFixed || 0)}`
    );
  }

  // Link existing payment rows to TUITION by default when feeTypeId is missing.
  await pgPool.query(
    `UPDATE payments p
     SET "feeTypeId" = ft.id,
         "paidForMonth" = COALESCE(p."paidForMonth", p."monthKey"),
         "paidAt" = COALESCE(p."paidAt", p."createdAt")
     FROM students s
     JOIN fee_types ft
       ON ft."schoolYearStartYear" = s."schoolYearStartYear"
      AND ft.code = CASE
       WHEN LOWER(COALESCE(p."feeType", '')) = ANY(ARRAY[
         '',
         'frais de scolarité',
         'frais de scolarite',
         'frais de scolaire',
         'frais scolaire',
         'minerval'
       ]) THEN 'TUITION'
       ELSE ft.code
     END
     WHERE s.id = p."studentId"
       AND p."feeTypeId" IS NULL`
  ).catch(async () => {
    await pgPool.query(
      `UPDATE payments p
       SET "feeTypeId" = ft.id,
           "paidForMonth" = COALESCE(p."paidForMonth", p."monthKey"),
           "paidAt" = COALESCE(p."paidAt", p."createdAt")
       FROM students s
       JOIN fee_types ft
         ON ft."schoolYearStartYear" = s."schoolYearStartYear"
        AND ft.code = 'TUITION'
       WHERE s.id = p."studentId"
         AND p."feeTypeId" IS NULL`
    ).catch(() => {});
  });

  // Backfill payment receipt metadata for older rows (best effort).
  await pgPool.query(
    `UPDATE payments p
     SET "receiptNo" = COALESCE(p."receiptNo", 'ECO-' || EXTRACT(YEAR FROM COALESCE(p."createdAt", NOW()))::int || '-' || LPAD(p.id::text, 4, '0')),
         "studentNameSnapshot" = COALESCE(p."studentNameSnapshot", s."fullName"),
         "studentMatriculeSnapshot" = COALESCE(p."studentMatriculeSnapshot", s."matricule", s.id),
         "classNameSnapshot" = COALESCE(p."classNameSnapshot", s."className"),
         "levelSnapshot" = COALESCE(p."levelSnapshot", s.level)
     FROM students s
     WHERE s.id = p."studentId"
       AND (
         p."receiptNo" IS NULL OR
         p."studentNameSnapshot" IS NULL OR
         p."studentMatriculeSnapshot" IS NULL OR
         p."classNameSnapshot" IS NULL OR
         p."levelSnapshot" IS NULL
       )`
  ).catch(() => {});

  const usersCount = await get(`SELECT COUNT(*)::int AS c FROM users`);
  if (!Number(usersCount?.c)) {
    const seedUsers = [
      {
        username: process.env.ADMIN_USER || "admin",
        password: process.env.ADMIN_PASS || "admin123",
        role: "admin"
      },
      {
        username: process.env.CAISSIER_USER || "caissier",
        password: process.env.CAISSIER_PASS || "caissier123",
        role: "caissier"
      },
      {
        username: process.env.COMPTABLE_USER || "comptable",
        password: process.env.COMPTABLE_PASS || "comptable123",
        role: "comptable"
      }
    ];
    for (const u of seedUsers) {
      await run(
        `INSERT INTO users (username, "passwordHash", role, "isActive", "createdAt")
         VALUES (?, ?, ?, TRUE, ?)`,
        [u.username, makePasswordHash(u.password), u.role, nowIso()]
      );
    }
  }

  const schoolYearSetting = await get(`SELECT key FROM app_settings WHERE key = 'schoolYearStartYear'`);
  if (!schoolYearSetting) {
    const startYear = getDefaultSchoolYearStartYear();
    await run(
      `INSERT INTO app_settings (key, value, "updatedAt") VALUES (?, ?::jsonb, NOW())`,
      ["schoolYearStartYear", JSON.stringify({ startYear })]
    );
  }
  const levelDueSetting = await get(`SELECT key FROM app_settings WHERE key = 'levelMonthlyDueUSD'`);
  if (!levelDueSetting) {
    await run(
      `INSERT INTO app_settings (key, value, "updatedAt") VALUES (?, ?::jsonb, NOW())`,
      ["levelMonthlyDueUSD", JSON.stringify(DEFAULT_LEVEL_MONTHLY_DUE_USD)]
    );
  }
  const activeSchoolYearStartYear = await getSchoolYearStartYearSetting();
  await ensureLevelMonthlyDueSettingForSchoolYear(activeSchoolYearStartYear).catch(() => {});
  await migrateLegacyBackfillTuitionAmounts().catch(() => {});
  await migrateLegacyOcrPartialTuitionAmounts().catch(() => {});
  try {
    const dueSnapshotBackfill = await snapshotExistingPaymentDues();
    console.log("Payment due snapshot backfill:", dueSnapshotBackfill);
  } catch (err) {
    console.error("Payment due snapshot backfill failed:", err?.message || err);
  }
  try {
    const benefitSync = await syncAllStudentTuitionBenefitPayments();
    console.log("Tuition benefit monthly sync:", benefitSync);
  } catch (err) {
    console.error("Tuition benefit monthly sync failed:", err?.message || err);
  }
}

function studentIdPrefixFromName(fullName) {
  const ascii = String(fullName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const letters = ascii.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 2);
  if (letters.length === 1) return `${letters}X`;
  return "ST";
}
async function makeStudentId(fullName, sex) {
  const prefix = (await configuration.values())["school.studentIdPrefix"] || studentIdPrefixFromName(fullName);
  const sexCode = normalizeSex(sex) || "M";

  for (let i = 0; i < 80; i += 1) {
    const fourDigits = String(Math.floor(Math.random() * 9000) + 1000);
    const candidate = `${prefix}${fourDigits}${sexCode}`;
    const exists = await get(`SELECT id FROM students WHERE id = ?`, [candidate]);
    if (!exists) return candidate;
  }

  const base = Date.now();
  for (let i = 0; i < 10000; i += 1) {
    const seq = String((base + i) % 10000).padStart(4, "0");
    const candidate = `${prefix}${seq}${sexCode}`;
    const exists = await get(`SELECT id FROM students WHERE id = ?`, [candidate]);
    if (!exists) return candidate;
  }
  throw new Error("Impossible de générer un identifiant élève unique");
}
function nowIso() {
  return new Date().toISOString();
}
function getDefaultSchoolYearStartYear(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? year : year - 1;
}
function schoolYearLabelFromStartYear(startYear) {
  const y = Number(startYear);
  if (!Number.isFinite(y)) return "";
  return `${y}-${y + 1}`;
}
function parseSchoolYearStartYear(input) {
  if (input == null) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    const n = Math.floor(input);
    if (n >= 2000 && n <= 2100) return n;
    return null;
  }
  const text = String(input).trim();
  if (!text) return null;
  const n = Number(text);
  if (Number.isFinite(n)) {
    const v = Math.floor(n);
    if (v >= 2000 && v <= 2100) return v;
  }
  const m = text.match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end !== start + 1) return null;
  if (start < 2000 || start > 2100) return null;
  return start;
}
function deriveSchoolYearStartYearFromDateInput(input, fallback = null) {
  const safeFallback = parseSchoolYearStartYear(fallback);
  if (input == null) return safeFallback;
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return safeFallback;
    const month = input.getMonth() + 1;
    const year = input.getFullYear();
    return month >= 9 ? year : (year - 1);
  }
  const text = String(input).trim();
  if (!text) return safeFallback;
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return safeFallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return safeFallback;
  }
  return month >= 9 ? year : (year - 1);
}
async function getSchoolYearStartYearSetting() {
  const now = Date.now();
  if (
    runtimeCache.schoolYearStartYear.expiresAt > now
    && Number.isFinite(runtimeCache.schoolYearStartYear.value)
  ) {
    return Number(runtimeCache.schoolYearStartYear.value);
  }
  const row = await get(`SELECT value FROM app_settings WHERE key = 'schoolYearStartYear'`);
  const fallback = getDefaultSchoolYearStartYear();
  let startYear = fallback;
  if (!row) {
    runtimeCache.schoolYearStartYear = {
      value: startYear,
      expiresAt: now + SETTINGS_CACHE_TTL_MS
    };
    return startYear;
  }
  try {
    const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    const n = Number(parsed?.startYear);
    if (Number.isFinite(n) && n >= 2000 && n <= 2100) startYear = Math.floor(n);
  } catch (_) {}
  runtimeCache.schoolYearStartYear = {
    value: startYear,
    expiresAt: now + SETTINGS_CACHE_TTL_MS
  };
  return startYear;
}
function getLevelMonthlyDueSettingKey(schoolYearStartYear) {
  const normalized = parseSchoolYearStartYear(schoolYearStartYear);
  return normalized ? `levelMonthlyDueUSD:${normalized}` : "levelMonthlyDueUSD";
}
async function ensureLevelMonthlyDueSettingForSchoolYear(targetSchoolYearStartYear, sourceSchoolYearStartYear = null) {
  const target = parseSchoolYearStartYear(targetSchoolYearStartYear);
  if (!target) return normalizeLevelMonthlyDueConfig(DEFAULT_LEVEL_MONTHLY_DUE_USD);
  const targetKey = getLevelMonthlyDueSettingKey(target);
  const existing = await get(`SELECT value FROM app_settings WHERE key = ?`, [targetKey]);
  if (existing) {
    const parsed = typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value;
    const normalized = normalizeLevelMonthlyDueConfig(parsed);
    runtimeCache.levelMonthlyDueUSDBySchoolYear.delete(String(target));
    return normalized;
  }
  const source = parseSchoolYearStartYear(sourceSchoolYearStartYear);
  let seed = null;
  if (source && source !== target) {
    seed = await getLevelMonthlyDueSetting({ schoolYearStartYear: source });
  } else {
    const legacy = await get(`SELECT value FROM app_settings WHERE key = 'levelMonthlyDueUSD'`);
    if (legacy?.value != null) {
      seed = typeof legacy.value === "string" ? JSON.parse(legacy.value) : legacy.value;
    }
  }
  const normalized = normalizeLevelMonthlyDueConfig(seed || DEFAULT_LEVEL_MONTHLY_DUE_USD);
  await run(
    `INSERT INTO app_settings (key, value, "updatedAt")
     VALUES (?, ?::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
    [targetKey, JSON.stringify(normalized)]
  );
  runtimeCache.levelMonthlyDueUSDBySchoolYear.delete(String(target));
  return normalized;
}
async function getLevelMonthlyDueSetting(options = {}) {
  const requestedYear = parseSchoolYearStartYear(
    typeof options === "object" && options !== null
      ? options.schoolYearStartYear
      : options
  );
  const schoolYearStartYear = requestedYear || await getSchoolYearStartYearSetting();
  const cacheKey = String(schoolYearStartYear);
  const now = Date.now();
  const cached = runtimeCache.levelMonthlyDueUSDBySchoolYear.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.value) {
    return normalizeLevelMonthlyDueConfig(cached.value);
  }
  const yearKey = getLevelMonthlyDueSettingKey(schoolYearStartYear);
  const row = await get(
    `SELECT value
     FROM app_settings
     WHERE key = ANY(?::text[])
     ORDER BY CASE WHEN key = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    [[yearKey, "levelMonthlyDueUSD"], yearKey]
  );
  const fallback = { ...DEFAULT_LEVEL_MONTHLY_DUE_USD };
  try {
    const parsed = row?.value == null
      ? fallback
      : (typeof row.value === "string" ? JSON.parse(row.value) : row.value);
    const normalized = normalizeLevelMonthlyDueConfig(parsed);
    runtimeCache.levelMonthlyDueUSDBySchoolYear.set(cacheKey, {
      value: normalized,
      expiresAt: now + SETTINGS_CACHE_TTL_MS
    });
    return normalized;
  } catch (_) {
    runtimeCache.levelMonthlyDueUSDBySchoolYear.set(cacheKey, {
      value: fallback,
      expiresAt: now + SETTINGS_CACHE_TTL_MS
    });
    return fallback;
  }
}
async function recalculateLevelFeesEverywhere({ before, after, schoolYearStartYear = null }) {
  const prev = normalizeLevelMonthlyDueConfig(before || {});
  const next = normalizeLevelMonthlyDueConfig(after || {});
  const targetSchoolYearStartYear = parseSchoolYearStartYear(schoolYearStartYear)
    || await getSchoolYearStartYearSetting();

  // Keep cas social untouched (monthlyDue = 0).
  // Recalculate only students currently on default-like dues. Custom dues stay untouched.
  const legacy = { maternelle: 35, primaire: 30, secondaire: 50, secondaire4eH: 70 };
  const matchAmounts = (a, b) =>
    [...new Set([Number(a), Number(b)].filter((n) => Number.isFinite(n) && n > 0))];

  const updateStudentRows = async ({ level, classFilterSql = "TRUE", candidates, newAmount }) => {
    if (!Array.isArray(candidates) || !candidates.length) return 0;
    const result = await pgPool.query(
      `UPDATE students s
       SET "monthlyDue" = $1
       WHERE s."schoolYearStartYear" = $2
         AND COALESCE(s."monthlyDue", 0) > 0
         AND s.level = $3
         AND ${classFilterSql}
         AND s."monthlyDue" = ANY($4::numeric[])`,
      [newAmount, targetSchoolYearStartYear, level, candidates]
    );
    return Number(result.rowCount || 0);
  };

  const stuMat = await updateStudentRows({
    level: "maternelle",
    classFilterSql: "TRUE",
    candidates: matchAmounts(prev.maternelle, legacy.maternelle),
    newAmount: next.maternelle
  });
  const stuPri = await updateStudentRows({
    level: "primaire",
    classFilterSql: "TRUE",
    candidates: matchAmounts(prev.primaire, legacy.primaire),
    newAmount: next.primaire
  });
  const stuSec4 = await updateStudentRows({
    level: "secondaire",
    classFilterSql: `COALESCE(s."className", '') ~* '^4e H\\\\b'`,
    candidates: matchAmounts(prev.secondaire4eH, legacy.secondaire4eH),
    newAmount: next.secondaire4eH
  });
  const stuSec = await updateStudentRows({
    level: "secondaire",
    classFilterSql: `COALESCE(s."className", '') !~* '^4e H\\\\b'`,
    candidates: matchAmounts(prev.secondaire, legacy.secondaire),
    newAmount: next.secondaire
  });

  return {
    studentsUpdated: stuMat + stuPri + stuSec + stuSec4,
    paymentsUpdated: 0,
    paymentsUpdatedByLevel: {
      maternelle: 0,
      primaire: 0,
      secondaire: 0,
      secondaire4eH: 0
    },
    studentsUpdatedByLevel: {
      maternelle: stuMat,
      primaire: stuPri,
      secondaire: stuSec,
      secondaire4eH: stuSec4
    }
  };
}
function inferSchoolYearStartYearFromPaymentRow(paymentRow) {
  const explicit = parseSchoolYearStartYear(paymentRow?.schoolYearStartYear ?? null);
  if (Number.isFinite(explicit)) return explicit;
  const monthKey = String(paymentRow?.paidForMonth || paymentRow?.monthKey || "").trim();
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return month >= 9 ? year : (year - 1);
}
function normalizeReceiptSequence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const seq = Math.floor(n);
  return seq >= 1 ? seq : null;
}
function getReceiptYearFromSchoolYearStartYear(schoolYearStartYear, fallbackDate = new Date()) {
  const parsed = parseSchoolYearStartYear(schoolYearStartYear);
  if (Number.isFinite(parsed)) return parsed + 1;
  const date = fallbackDate instanceof Date && Number.isFinite(fallbackDate.getTime())
    ? fallbackDate
    : new Date();
  return date.getFullYear();
}
function buildReceiptNoForYearSeq(receiptYear, seq, prefix = "ECO") {
  const yearNum = Number(receiptYear);
  const safeYear = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100
    ? Math.floor(yearNum)
    : new Date().getFullYear();
  const safeSeq = normalizeReceiptSequence(seq) || 1;
  return `${prefix}-${safeYear}-${String(safeSeq).padStart(4, "0")}`;
}
async function peekNextReceiptNumberForSchoolYear(schoolYearStartYear) {
  const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearStartYear);
  const result = await pgPool.query(
    `SELECT COALESCE(
       MAX(SUBSTRING("receiptNo" FROM '[A-Z0-9]+-[0-9]{4}-([0-9]+)$')::bigint),
       0
     ) AS max_seq
     FROM payments
     WHERE "receiptNo" ~ ('^[A-Z0-9]+-' || $1::text || '-[0-9]+$')`,
    [receiptYear]
  );
  const maxSeq = normalizeReceiptSequence(result.rows?.[0]?.max_seq) || 0;
  const seq = maxSeq + 1;
  return {
    receiptYear,
    seq,
    receiptNo: buildReceiptNoForYearSeq(receiptYear, seq, (await configuration.values())["receipts.prefix"])
  };
}
async function reserveNextReceiptNumberForSchoolYear(schoolYearStartYear) {
  const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearStartYear);
  const result = await pgPool.query(
    `WITH requested_year AS (
       SELECT $1::integer AS receipt_year
     ),
     existing_payments AS (
       SELECT COALESCE(
         MAX(SUBSTRING("receiptNo" FROM '[A-Z0-9]+-[0-9]{4}-([0-9]+)$')::bigint),
         0
       ) AS max_seq
       FROM payments
       CROSS JOIN requested_year
       WHERE "receiptNo" ~ ('^[A-Z0-9]+-' || requested_year.receipt_year::text || '-[0-9]+$')
     )
     INSERT INTO receipt_counters ("receiptYear", "lastSeq", "updatedAt")
     SELECT requested_year.receipt_year, (SELECT max_seq FROM existing_payments) + 1, NOW()
     FROM requested_year
     ON CONFLICT ("receiptYear")
     DO UPDATE SET
       "lastSeq" = GREATEST(
         receipt_counters."lastSeq",
         (SELECT max_seq FROM existing_payments)
       ) + 1,
       "updatedAt" = NOW()
     RETURNING "receiptYear", "lastSeq"`,
    [receiptYear]
  );
  const row = result.rows?.[0] || {};
  const seq = normalizeReceiptSequence(row.lastSeq) || 1;
  return {
    receiptYear,
    seq,
    receiptNo: buildReceiptNoForYearSeq(receiptYear, seq, (await configuration.values())["receipts.prefix"])
  };
}
function buildReceiptNoFromPaymentRow(paymentRow, options = {}) {
  const created = paymentRow?.createdAt ? new Date(paymentRow.createdAt) : new Date();
  const schoolYearStartYear = parseSchoolYearStartYear(options?.schoolYearStartYear ?? null)
    ?? inferSchoolYearStartYearFromPaymentRow(paymentRow);
  const receiptYear = getReceiptYearFromSchoolYearStartYear(schoolYearStartYear, created);
  const seq = normalizeReceiptSequence(options?.seq ?? paymentRow?.receiptSeq ?? paymentRow?.id)
    || normalizeReceiptSequence(Number(String(Date.now()).slice(-4)))
    || 1;
  return buildReceiptNoForYearSeq(receiptYear, seq);
}
function paymentRecordToReceiptJson(row) {
  if (!row) return null;
  const feeType = normalizeFeeLabel(row.feeType || "Minerval");
  const note = row.note == null ? null : decodeLikelyUtf8Mojibake(String(row.note));
  const createdByUsername = row.createdByUsername == null ? null : decodeLikelyUtf8Mojibake(String(row.createdByUsername));
  const studentNameRaw = row.studentNameSnapshot || row.fullName || null;
  const matriculeRaw = row.studentMatriculeSnapshot || row.matricule || row.studentId || null;
  const classNameRaw = row.classNameSnapshot || row.className || null;
  const latestCorrectionRaw = row.latestCorrection ?? row.latest_correction ?? null;
  const latestCorrection = latestCorrectionRaw == null
    ? null
    : (typeof latestCorrectionRaw === "string"
      ? (() => { try { return JSON.parse(latestCorrectionRaw); } catch (_) { return null; } })()
      : latestCorrectionRaw);
  const originalCashAllocationRaw = row.originalCashAllocation ?? row.original_cash_allocation ?? null;
  const originalCashAllocation = originalCashAllocationRaw == null
    ? null
    : (typeof originalCashAllocationRaw === "string"
      ? (() => { try { return JSON.parse(originalCashAllocationRaw); } catch (_) { return null; } })()
      : originalCashAllocationRaw);
  return {
    id: row.id,
    clientRequestId: row.clientRequestId || null,
    receiptNo: row.receiptNo || buildReceiptNoFromPaymentRow(row),
    receiptDeviceId: row.receiptDeviceId || null,
    receiptDeviceCode: row.receiptDeviceCode || null,
    studentId: row.studentId,
    matricule: matriculeRaw == null ? null : decodeLikelyUtf8Mojibake(String(matriculeRaw)),
    monthKey: row.monthKey,
    paidForMonth: row.paidForMonth || row.monthKey,
    feeTypeId: row.feeTypeId || null,
    amount: Number(row.amount || 0),
    amountUSDReceived: row.amountUSDReceived == null ? null : Number(row.amountUSDReceived || 0),
    amountCDFReceived: row.amountCDFReceived == null ? null : Number(row.amountCDFReceived || 0),
    originalAmount: row.cancelledAmount == null ? null : Number(row.cancelledAmount || 0),
    dueAmountSnapshot: row.dueAmountSnapshot == null ? null : Number(row.dueAmountSnapshot || 0),
    dueCurrencySnapshot: normalizeCurrency(row.dueCurrencySnapshot) || null,
    currency: row.currency || "USD",
    feeType,
    cashFeeTypeId: originalCashAllocation?.feeTypeId || latestCorrection?.oldFeeTypeId || null,
    cashFeeType: (originalCashAllocation?.feeType ?? latestCorrection?.oldFeeType) == null
      ? null
      : normalizeFeeLabel(originalCashAllocation?.feeType ?? latestCorrection?.oldFeeType),
    cashFeeTypeCode: originalCashAllocation?.feeTypeCode || null,
    paymentMethod: row.paymentMethod || null,
    receiptDoc: row.receiptDoc == null
      ? null
      : (typeof row.receiptDoc === "string" ? (() => { try { return JSON.parse(row.receiptDoc); } catch (_) { return null; } })() : row.receiptDoc),
    fxRate: row.fxRate == null ? null : Number(row.fxRate),
    note,
    createdAt: row.createdAt,
    paidAt: row.paidAt || row.createdAt,
    createdByUserId: row.createdByUserId || null,
    createdByUsername,
    cancelled: Boolean(row.cancelledAt),
    cancelledAt: row.cancelledAt || null,
    cancelledByUserId: row.cancelledByUserId || null,
    cancelledByUsername: row.cancelledByUsername == null ? null : decodeLikelyUtf8Mojibake(String(row.cancelledByUsername)),
    cancellationReason: row.cancellationReason == null ? null : decodeLikelyUtf8Mojibake(String(row.cancellationReason)),
    cancellationCashReturned: row.cancellationCashReturned == null ? null : Boolean(row.cancellationCashReturned),
    studentName: studentNameRaw == null ? null : decodeLikelyUtf8Mojibake(String(studentNameRaw)),
    className: classNameRaw == null ? null : decodeLikelyUtf8Mojibake(String(classNameRaw)),
    level: row.levelSnapshot || row.level || null,
    printCount: row.printCount == null ? undefined : Number(row.printCount || 0),
    correctionCount: Number(row.correctionCount ?? row.correction_count ?? 0),
    corrected: Number(row.correctionCount ?? row.correction_count ?? 0) > 0,
    latestCorrection
  };
}
function normalizeLevel(level) {
  const v = String(level || "").trim().toLowerCase();
  if (v === "maternelle" || v === "primaire" || v === "secondaire") return v;
  return null;
}
function normalizeCurrency(currency) {
  const v = String(currency || "").trim().toUpperCase();
  if (v === "USD" || v === "CDF") return v;
  return null;
}
function normalizeBillingCycle(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "annual" || v === "annuel" || v === "yearly") return "annual";
  // "item" = article vendu par l'école : sans mois, achetable plusieurs fois, jamais dû.
  if (v === "item" || v === "article" || v === "one_off" || v === "oneoff") return "item";
  return "monthly";
}
function normalizeSex(sex) {
  const v = String(sex || "").trim().toUpperCase();
  if (v === "M" || v === "F") return v;
  return null;
}
function normalizeStudentMatricule(value) {
  if (value == null) return null;
  const v = String(value).trim().toUpperCase();
  if (!v) return null;
  if (v.length > 40) return null;
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(v)) return null;
  return v;
}
function convertAmountByFx(amount, fromCurrency, toCurrency, fxRate) {
  const amt = Number(amount || 0);
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const rate = Number(fxRate || 0);
  if (!Number.isFinite(amt)) return NaN;
  if (!from || !to) return NaN;
  if (from === to) return amt;
  if (!(Number.isFinite(rate) && rate > 0)) return NaN;
  if (from === "USD" && to === "CDF") return amt * rate;
  if (from === "CDF" && to === "USD") return amt / rate;
  return NaN;
}
function normalizeMonthKey(monthKey) {
  const v = String(monthKey || "").trim();
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  return null;
}
function toDateOnlyISO(value) {
  if (value == null) return "";
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const fr = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) {
    const dd = Number(fr[1]);
    const mm = Number(fr[2]);
    const yyyy = Number(fr[3]);
    if (Number.isInteger(dd) && Number.isInteger(mm) && Number.isInteger(yyyy) && yyyy >= 1900 && yyyy <= 2100) {
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const d = new Date(Date.UTC(yyyy, mm - 1, dd));
        if (
          Number.isFinite(d.getTime()) &&
          d.getUTCFullYear() === yyyy &&
          d.getUTCMonth() + 1 === mm &&
          d.getUTCDate() === dd
        ) {
          return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        }
      }
    }
    return "";
  }
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function normalizeDateOfBirth(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = toDateOnlyISO(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const todayIso = toDateOnlyISO(new Date());
  if (todayIso && iso > todayIso) return null;
  if (Number(iso.slice(0, 4)) < 1900) return null;
  return iso;
}
function normalizeRole(role) {
  const v = String(role || "").trim().toLowerCase();
  if (v === "admin" || v === "caissier" || v === "comptable") return v;
  return null;
}
function normalizeFeeType(feeType) {
  const v = String(feeType || "").trim();
  return v || "Minerval";
}
function normalizeFeeCode(code) {
  const v = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
  return v || null;
}
function countMojibakeMarkers(text) {
  return (String(text || "").match(/Ã|Â|â€|â€™|â€œ|â€|â€“|â€”/g) || []).length;
}
function decodeLikelyUtf8Mojibake(text) {
  const input = String(text || "");
  if (!input || !/[ÃÂâ]/.test(input)) return input;
  try {
    const decoded = Buffer.from(input, "latin1").toString("utf8");
    if (!decoded || decoded.includes("�")) return input;
    if (countMojibakeMarkers(decoded) < countMojibakeMarkers(input)) return decoded;
  } catch (_) {}
  return input;
}
function normalizeFeeLabel(label) {
  const compact = String(label || "").trim().replace(/\s+/g, " ");
  return decodeLikelyUtf8Mojibake(compact);
}
function normalizeFeeLabelKey(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function getLegacyFeeAliasConfig(canonicalCode) {
  const code = normalizeFeeCode(canonicalCode);
  return LEGACY_FEE_TYPE_ALIASES[code] || { codes: [], labels: [] };
}
async function getAllKnownSchoolYearStartYears() {
  const years = new Set();
  const configured = parseSchoolYearStartYear(await getSchoolYearStartYearSetting().catch(() => null));
  if (configured) years.add(configured);
  const studentYears = await all(
    `SELECT DISTINCT "schoolYearStartYear"
     FROM students
     WHERE "schoolYearStartYear" IS NOT NULL`
  ).catch(() => []);
  for (const row of studentYears || []) {
    const year = parseSchoolYearStartYear(row?.schoolYearStartYear);
    if (year) years.add(year);
  }
  const feeYears = await all(
    `SELECT DISTINCT "schoolYearStartYear"
     FROM fee_types
     WHERE "schoolYearStartYear" IS NOT NULL`
  ).catch(() => []);
  for (const row of feeYears || []) {
    const year = parseSchoolYearStartYear(row?.schoolYearStartYear);
    if (year) years.add(year);
  }
  return Array.from(years).sort((a, b) => a - b);
}
async function findBestSourceFeeTypeSchoolYear(targetSchoolYearStartYear) {
  const target = parseSchoolYearStartYear(targetSchoolYearStartYear);
  if (!target) return null;
  const previous = await get(
    `SELECT "schoolYearStartYear"
     FROM fee_types
     WHERE "schoolYearStartYear" = ?
     LIMIT 1`,
    [target - 1]
  ).catch(() => null);
  const previousYear = parseSchoolYearStartYear(previous?.schoolYearStartYear);
  if (previousYear) return previousYear;
  const row = await get(
    `SELECT "schoolYearStartYear"
     FROM fee_types
     WHERE "schoolYearStartYear" IS NOT NULL
       AND "schoolYearStartYear" <> ?
     ORDER BY ABS("schoolYearStartYear" - ?) ASC, "schoolYearStartYear" DESC
     LIMIT 1`,
    [target, target]
  ).catch(() => null);
  return parseSchoolYearStartYear(row?.schoolYearStartYear);
}
async function cloneFeeTypesToSchoolYear({ sourceSchoolYearStartYear, targetSchoolYearStartYear } = {}) {
  const source = parseSchoolYearStartYear(sourceSchoolYearStartYear);
  const target = parseSchoolYearStartYear(targetSchoolYearStartYear);
  if (!source || !target || source === target) return 0;
  const result = await pgPool.query(
    `INSERT INTO fee_types (
       "schoolYearStartYear",
       code,
       "labelFr",
       "defaultCurrency",
       "defaultAmount",
       "billingCycle",
       "dueMonth",
       "hasFixedPrice",
       "scopeLevel",
       "scopeLevels",
       "scopeClasses",
       "pricingRules",
       "skipAutoPrint",
       active
     )
     SELECT
       $1,
       src.code,
       src."labelFr",
       src."defaultCurrency",
       src."defaultAmount",
       src."billingCycle",
       CASE
         WHEN src."dueMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
           THEN (CASE WHEN SUBSTRING(src."dueMonth", 6, 2)::int >= 9 THEN $1 ELSE $1 + 1 END)::text
                || '-' || SUBSTRING(src."dueMonth", 6, 2)
         ELSE NULL
       END,
       src."hasFixedPrice",
       src."scopeLevel",
       src."scopeLevels",
       src."scopeClasses",
       src."pricingRules",
       COALESCE(src."skipAutoPrint", FALSE),
       src.active
     FROM fee_types src
     LEFT JOIN fee_types existing
       ON existing."schoolYearStartYear" = $1
      AND existing.code = src.code
     WHERE src."schoolYearStartYear" = $2
       AND existing.id IS NULL`,
    [target, source]
  ).catch(() => ({ rowCount: 0 }));
  return Number(result.rowCount || 0);
}
async function deduplicateFeeTypesBySchoolYearAndCode() {
  const rows = await all(
    `SELECT id, code, "schoolYearStartYear"
     FROM fee_types
     WHERE "schoolYearStartYear" IS NOT NULL
     ORDER BY "schoolYearStartYear" ASC, code ASC, id ASC`
  ).catch(() => []);
  const canonicalByKey = new Map();
  for (const row of rows || []) {
    const id = Number(row?.id || 0);
    const year = parseSchoolYearStartYear(row?.schoolYearStartYear);
    const code = normalizeFeeCode(row?.code);
    if (!(id > 0) || !year || !code) continue;
    const key = `${year}|${code}`;
    if (!canonicalByKey.has(key)) {
      canonicalByKey.set(key, id);
      continue;
    }
    await mergeDuplicateFeeTypeIntoCanonical({
      duplicateId: id,
      canonicalId: canonicalByKey.get(key)
    });
  }
}
async function remapFeeTypeReferencesToSchoolYearRows() {
  await pgPool.query(
    `UPDATE payments p
     SET "feeTypeId" = target_ft.id
     FROM students s,
          fee_types current_ft,
          fee_types target_ft
     WHERE s.id = p."studentId"
       AND current_ft.id = p."feeTypeId"
       AND target_ft.code = current_ft.code
       AND target_ft."schoolYearStartYear" = s."schoolYearStartYear"
       AND target_ft.id <> current_ft.id`
  ).catch(() => {});
  await pgPool.query(
    `UPDATE student_fee_overrides sfo
     SET "feeTypeId" = target_ft.id
     FROM students s,
          fee_types current_ft,
          fee_types target_ft
     WHERE s.id = sfo."studentId"
       AND current_ft.id = sfo."feeTypeId"
       AND target_ft.code = current_ft.code
       AND target_ft."schoolYearStartYear" = s."schoolYearStartYear"
       AND target_ft.id <> current_ft.id`
  ).catch(() => {});
}
async function adoptLegacyFeeTypeCode(canonicalCode, { schoolYearStartYear = null } = {}) {
  const code = normalizeFeeCode(canonicalCode);
  if (!code) return;
  const targetYear = parseSchoolYearStartYear(schoolYearStartYear) || await getSchoolYearStartYearSetting();
  const canonical = await get(
    `SELECT id
     FROM fee_types
     WHERE code = ?
       AND "schoolYearStartYear" = ?
     LIMIT 1`,
    [code, targetYear]
  );
  if (canonical?.id) return;
  const aliasCodes = (getLegacyFeeAliasConfig(code).codes || []).map((c) => normalizeFeeCode(c)).filter(Boolean);
  if (!aliasCodes.length) return;
  const aliasRows = await all(
    `SELECT id, code
     FROM fee_types
     WHERE code = ANY(?::text[])
       AND "schoolYearStartYear" = ?
     ORDER BY id ASC`,
    [aliasCodes, targetYear]
  );
  const alias = aliasRows[0];
  if (!alias?.id) return;
  await run(`UPDATE fee_types SET code = ? WHERE id = ?`, [code, Number(alias.id)]);
}
async function mergeDuplicateFeeTypeIntoCanonical({ duplicateId, canonicalId }) {
  const dupId = Number(duplicateId);
  const canonId = Number(canonicalId);
  if (!(dupId > 0) || !(canonId > 0) || dupId === canonId) return;
  await pgPool.query("BEGIN");
  try {
    await pgPool.query(
      `UPDATE payments
       SET "feeTypeId" = $1
       WHERE "feeTypeId" = $2`,
      [canonId, dupId]
    );
    await pgPool.query(
      `INSERT INTO student_fee_overrides ("studentId", "feeTypeId", amount, currency, active)
       SELECT "studentId", $1, amount, currency, active
       FROM student_fee_overrides
       WHERE "feeTypeId" = $2
       ON CONFLICT ("studentId", "feeTypeId")
       DO UPDATE SET
         amount = EXCLUDED.amount,
         currency = EXCLUDED.currency,
         active = EXCLUDED.active`,
      [canonId, dupId]
    );
    await pgPool.query(
      `DELETE FROM student_fee_overrides
       WHERE "feeTypeId" = $1`,
      [dupId]
    );
    await pgPool.query(
      `DELETE FROM fee_types
       WHERE id = $1`,
      [dupId]
    );
    await pgPool.query("COMMIT");
  } catch (e) {
    await pgPool.query("ROLLBACK");
    throw e;
  }
}
async function harmonizeLegacyFeeTypes({ schoolYearStartYear = null } = {}) {
  const targetYear = parseSchoolYearStartYear(schoolYearStartYear) || await getSchoolYearStartYearSetting();
  const rows = await all(
    `SELECT id, code, "labelFr", active
     FROM fee_types
     WHERE "schoolYearStartYear" = ?
     ORDER BY id ASC`
    ,
    [targetYear]
  );
  for (const canonicalCodeRaw of Object.keys(LEGACY_FEE_TYPE_ALIASES)) {
    const canonicalCode = normalizeFeeCode(canonicalCodeRaw);
    if (!canonicalCode) continue;
    const canonical = rows.find((r) => normalizeFeeCode(r.code) === canonicalCode);
    if (!canonical?.id) continue;
    const aliasCfg = getLegacyFeeAliasConfig(canonicalCode);
    const aliasCodeSet = new Set((aliasCfg.codes || []).map((c) => normalizeFeeCode(c)).filter(Boolean));
    const aliasLabelKeySet = new Set((aliasCfg.labels || []).map((l) => normalizeFeeLabelKey(l)).filter(Boolean));
    const canonicalLabelKey = normalizeFeeLabelKey(canonical.labelFr);
    if (canonicalLabelKey) aliasLabelKeySet.add(canonicalLabelKey);

    for (const row of rows) {
      const rowId = Number(row?.id || 0);
      if (!(rowId > 0) || rowId === Number(canonical.id)) continue;
      const rowCode = normalizeFeeCode(row?.code);
      const rowLabelKey = normalizeFeeLabelKey(row?.labelFr);
      const isAliasCode = aliasCodeSet.has(rowCode);
      const isAliasLabel = rowLabelKey && aliasLabelKeySet.has(rowLabelKey);
      if (!isAliasCode && !isAliasLabel) continue;
      await mergeDuplicateFeeTypeIntoCanonical({ duplicateId: rowId, canonicalId: Number(canonical.id) });
    }
  }
}
async function ensureRequiredFeeTypes({ schoolYearStartYear = null } = {}) {
  const targetYear = parseSchoolYearStartYear(schoolYearStartYear) || await getSchoolYearStartYearSetting();
  for (const ft of REQUIRED_FEE_TYPES) {
    const code = normalizeFeeCode(ft.code);
    const labelFr = normalizeFeeLabel(ft.labelFr);
    const defaultCurrency = normalizeCurrency(ft.defaultCurrency) || "USD";
    const defaultAmount = Number(ft.defaultAmount || 0);
    const billingCycle = normalizeBillingCycle(ft.billingCycle);
    const active = ft.active !== false;
    if (!code || !labelFr || !Number.isFinite(defaultAmount) || defaultAmount < 0) continue;
    await adoptLegacyFeeTypeCode(code, { schoolYearStartYear: targetYear });
    await pgPool.query(
      `INSERT INTO fee_types ("schoolYearStartYear", code, "labelFr", "defaultCurrency", "defaultAmount", "billingCycle", active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("schoolYearStartYear", code) DO UPDATE SET
         "labelFr" = EXCLUDED."labelFr",
         "defaultCurrency" = EXCLUDED."defaultCurrency",
         "defaultAmount" = EXCLUDED."defaultAmount",
         "billingCycle" = EXCLUDED."billingCycle",
         active = EXCLUDED.active`,
      [targetYear, code, labelFr, defaultCurrency, defaultAmount, billingCycle, active]
    );
  }
}
async function deactivateRemovedRequiredFeeTypes({ schoolYearStartYear = null } = {}) {
  const targetYear = parseSchoolYearStartYear(schoolYearStartYear);
  const clauses = [`code = ANY($1::text[])`, `active = TRUE`];
  const params = [REMOVED_REQUIRED_FEE_TYPE_CODES.slice()];
  if (targetYear) {
    params.push(targetYear);
    clauses.push(`"schoolYearStartYear" = $${params.length}`);
  }
  await pgPool.query(
    `UPDATE fee_types
     SET active = FALSE
     WHERE ${clauses.join(" AND ")}`,
    params
  );
}
async function ensureFeeTypesForSchoolYear(schoolYearStartYear, { sourceSchoolYearStartYear = null } = {}) {
  const targetYear = parseSchoolYearStartYear(schoolYearStartYear);
  if (!targetYear) return [];
  let sourceYear = parseSchoolYearStartYear(sourceSchoolYearStartYear);
  if (!sourceYear || sourceYear === targetYear) {
    sourceYear = await findBestSourceFeeTypeSchoolYear(targetYear);
  }
  if (sourceYear && sourceYear !== targetYear) {
    await cloneFeeTypesToSchoolYear({
      sourceSchoolYearStartYear: sourceYear,
      targetSchoolYearStartYear: targetYear
    });
  }
  await ensureRequiredFeeTypes({ schoolYearStartYear: targetYear });
  await harmonizeLegacyFeeTypes({ schoolYearStartYear: targetYear });
  await deactivateRemovedRequiredFeeTypes({ schoolYearStartYear: targetYear });
  return all(
    `SELECT *
     FROM fee_types
     WHERE "schoolYearStartYear" = ?
     ORDER BY id ASC`,
    [targetYear]
  );
}
async function migrateFeeTypesToSchoolYearScope() {
  await pgPool.query(`ALTER TABLE fee_types ADD COLUMN IF NOT EXISTS "schoolYearStartYear" INTEGER`).catch(() => {});
  const activeSchoolYearStartYear = parseSchoolYearStartYear(await getSchoolYearStartYearSetting())
    || getDefaultSchoolYearStartYear();
  await run(
    `UPDATE fee_types
     SET "schoolYearStartYear" = ?
     WHERE "schoolYearStartYear" IS NULL`,
    [activeSchoolYearStartYear]
  ).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types DROP CONSTRAINT IF EXISTS fee_types_code_key`).catch(() => {});
  const knownYears = await getAllKnownSchoolYearStartYears();
  for (const year of knownYears) {
    if (year === activeSchoolYearStartYear) continue;
    await cloneFeeTypesToSchoolYear({
      sourceSchoolYearStartYear: activeSchoolYearStartYear,
      targetSchoolYearStartYear: year
    });
  }
  await deduplicateFeeTypesBySchoolYearAndCode();
  await pgPool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS fee_types_school_year_code_idx
     ON fee_types ("schoolYearStartYear", code)`
  ).catch(() => {});
  await pgPool.query(`ALTER TABLE fee_types ALTER COLUMN "schoolYearStartYear" SET NOT NULL`).catch(() => {});
  const finalYears = await getAllKnownSchoolYearStartYears();
  for (const year of finalYears) {
    await ensureFeeTypesForSchoolYear(year, { sourceSchoolYearStartYear: activeSchoolYearStartYear });
  }
  await deduplicateFeeTypesBySchoolYearAndCode();
  await remapFeeTypeReferencesToSchoolYearRows();
}
async function repairKnownMojibakeText() {
  const markerRegex = "(Ã|Â|â€|â€™|â€œ|â€|â€“|â€”|�)";
  await pgPool.query(
    `CREATE OR REPLACE FUNCTION public.repair_mojibake_win1252(input text)
     RETURNS text
     LANGUAGE plpgsql
     AS $$
     DECLARE
       out_text text;
     BEGIN
       IF input IS NULL THEN
         RETURN NULL;
       END IF;
       IF input !~ '(Ã|Â|â€|â€™|â€œ|â€|â€“|â€”|�)' THEN
         RETURN input;
       END IF;
       BEGIN
         out_text := convert_from(convert_to(input, 'WIN1252'), 'UTF8');
       EXCEPTION WHEN OTHERS THEN
         RETURN input;
       END;
       IF out_text IS NULL OR out_text = '' THEN
         RETURN input;
       END IF;
       IF out_text LIKE '%�%' THEN
         RETURN input;
       END IF;
       RETURN out_text;
     END;
     $$`
  );
  const { rows } = await pgPool.query(
    `WITH s AS (
       UPDATE students
       SET "className" = public.repair_mojibake_win1252("className")
       WHERE COALESCE("className", '') ~ $1
       RETURNING 1
     ), p AS (
       UPDATE payments
       SET
         "classNameSnapshot" = public.repair_mojibake_win1252("classNameSnapshot"),
         note = public.repair_mojibake_win1252(note),
         "feeType" = public.repair_mojibake_win1252("feeType"),
         "studentNameSnapshot" = public.repair_mojibake_win1252("studentNameSnapshot")
       WHERE COALESCE("classNameSnapshot", '') ~ $1
          OR COALESCE(note, '') ~ $1
          OR COALESCE("feeType", '') ~ $1
          OR COALESCE("studentNameSnapshot", '') ~ $1
       RETURNING 1
     )
     SELECT
       (SELECT COUNT(*)::int FROM s) AS "studentsFixed",
       (SELECT COUNT(*)::int FROM p) AS "paymentsFixed"`,
    [markerRegex]
  );
  return rows?.[0] || { studentsFixed: 0, paymentsFixed: 0 };
}
function normalizeOptionalText(value, maxLen = 240) {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  return v.slice(0, Math.max(1, Number(maxLen || 240)));
}
function normalizeClientRequestId(value) {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.length > 120) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(v)) return null;
  return v;
}
async function getFeeTypeByCode(code, options = {}) {
  const normalizedCode = normalizeFeeCode(code);
  if (!normalizedCode) return null;
  const targetYear = parseSchoolYearStartYear(options?.schoolYearStartYear) || await getSchoolYearStartYearSetting();
  await ensureFeeTypesForSchoolYear(targetYear).catch(() => {});
  const where = [`code = ?`, `"schoolYearStartYear" = ?`];
  const params = [normalizedCode, targetYear];
  if (options?.includeInactive === false) {
    where.push(`active = TRUE`);
  }
  return get(
    `SELECT *
     FROM fee_types
     WHERE ${where.join(" AND ")}
     ORDER BY id ASC
     LIMIT 1`,
    params
  );
}
async function getDefaultTuitionFeeType(options = {}) {
  const targetYear = parseSchoolYearStartYear(options?.schoolYearStartYear) || await getSchoolYearStartYearSetting();
  let row = await getFeeTypeByCode("TUITION", { schoolYearStartYear: targetYear, includeInactive: false });
  if (row) return row;
  row = await get(
    `SELECT *
     FROM fee_types
     WHERE "schoolYearStartYear" = ?
       AND "labelFr" = 'Minerval'
       AND active = TRUE
     ORDER BY id ASC
     LIMIT 1`,
    [targetYear]
  );
  if (row) return row;
  row = await get(
    `SELECT *
     FROM fee_types
     WHERE "schoolYearStartYear" = ?
       AND "labelFr" = 'Frais de scolarité'
       AND active = TRUE
     ORDER BY id ASC
     LIMIT 1`,
    [targetYear]
  );
  return row || null;
}
function getTuitionLabelCandidates() {
  return ["minerval", "frais de scolarité", "frais de scolarite", "frais de scolaire", "frais scolaire"];
}
async function resolveFeeType({ feeTypeId, feeCode, feeLabel, fallbackTuition = true, schoolYearStartYear = null }) {
  const targetYear = parseSchoolYearStartYear(schoolYearStartYear) || await getSchoolYearStartYearSetting();
  const hasExplicitSelector = Boolean(
    (feeTypeId != null && String(feeTypeId).trim())
    || String(feeCode || "").trim()
    || String(feeLabel || "").trim()
  );
  await ensureFeeTypesForSchoolYear(targetYear).catch(() => {});
  if (feeTypeId != null && String(feeTypeId).trim()) {
    const idNum = Number(feeTypeId);
    if (Number.isFinite(idNum)) {
      const byId = await get(
        `SELECT *
         FROM fee_types
         WHERE id = ?
           AND "schoolYearStartYear" = ?
           AND active = TRUE`,
        [idNum, targetYear]
      );
      if (byId) return byId;
    }
  }
  if (feeCode) {
    const byCode = await getFeeTypeByCode(normalizeFeeCode(feeCode), {
      schoolYearStartYear: targetYear,
      includeInactive: false
    });
    if (byCode) return byCode;
  }
  if (feeLabel) {
    const label = normalizeFeeLabel(feeLabel);
    const byLabel = await get(
      `SELECT *
       FROM fee_types
       WHERE "schoolYearStartYear" = ?
         AND "labelFr" = ?
         AND active = TRUE
       ORDER BY id ASC
       LIMIT 1`,
      [targetYear, label]
    );
    if (byLabel) return byLabel;
  }
  if (fallbackTuition && !hasExplicitSelector) return getDefaultTuitionFeeType({ schoolYearStartYear: targetYear });
  return null;
}

function buildOverdueMonthKeys(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const keys = [];
  // Grace rule for tuition: a month becomes late on the 5th of the following month.
  // Example: January becomes late on February 5.
  const previousMonthIndex = month - 1;
  for (let i = 1; i < previousMonthIndex; i += 1) {
    keys.push(`${year}-${String(i).padStart(2, "0")}`);
  }
  if (previousMonthIndex >= 1 && now.getDate() > 5) {
    keys.push(`${year}-${String(previousMonthIndex).padStart(2, "0")}`);
  }
  return keys;
}

function buildSchoolYearMonthKeys(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 9 ? year : (year - 1);
  const keys = [];
  for (let i = 9; i <= 12; i += 1) {
    keys.push(`${startYear}-${String(i).padStart(2, "0")}`);
  }
  for (let i = 1; i <= 6; i += 1) {
    keys.push(`${startYear + 1}-${String(i).padStart(2, "0")}`);
  }
  return keys;
}
function getCurrentSchoolYearStartMonthKey(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // School year starts in September.
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-09`;
}

function monthKeyToDate(monthKey) {
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  return new Date(Date.UTC(y, mo - 1, 1));
}
function addMonthsToMonthKey(monthKey, count) {
  const base = monthKeyToDate(monthKey);
  if (!base || !Number.isFinite(Number(count))) return null;
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + Number(count));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
async function defaultMonthlyDueForLevelClass(levelRaw, classNameRaw, options = {}) {
  const cfg = await getLevelMonthlyDueSetting({ schoolYearStartYear: options?.schoolYearStartYear });
  return dueForLevelClassFromConfig(levelRaw, classNameRaw, cfg, options?.monthKey);
}
function dueForLevelClassFromConfig(levelRaw, classNameRaw, config, monthKey = null) {
  const level = String(levelRaw || "").toLowerCase();
  const className = String(classNameRaw || "").trim();
  const cfg = normalizeLevelMonthlyDueConfig(config || DEFAULT_LEVEL_MONTHLY_DUE_USD);
  const normalizedMonth = normalizeMonthKey(monthKey);
  const effective = normalizedMonth && cfg.monthlyOverrides?.[normalizedMonth]
    ? cfg.monthlyOverrides[normalizedMonth]
    : cfg;
  if (level === "maternelle") return Number(effective.maternelle || 0);
  if (level === "primaire") return Number(effective.primaire || 0);
  if (level === "secondaire") {
    if (/^4e H\b/i.test(className)) return Number(effective.secondaire4eH || 0);
    return Number(effective.secondaire || 0);
  }
  return 0;
}
function legacyMonthlyDueForLevelClass(levelRaw, classNameRaw) {
  return dueForLevelClassFromConfig(levelRaw, classNameRaw, LEGACY_LEVEL_MONTHLY_DUE_USD);
}
async function migrateLegacyBackfillTuitionAmounts() {
  const tuition = await getDefaultTuitionFeeType();
  const tuitionId = Number(tuition?.id || 0);
  if (!(tuitionId > 0)) return { updated: 0 };
  const currentCfg = await getLevelMonthlyDueSetting();
  const legacyCfg = LEGACY_LEVEL_MONTHLY_DUE_USD;
  const tuitionLabels = getTuitionLabelCandidates();

  const rows = await all(
    `SELECT p.id, p.amount, p.note, p."studentId",
            p."levelSnapshot", p."classNameSnapshot",
            s.level AS "studentLevel", s."className" AS "studentClassName"
     FROM payments p
     LEFT JOIN students s ON s.id = p."studentId"
     WHERE p.currency = 'USD'
       AND p.amount > 0
       AND p.note ILIKE 'Backfill historique PDF%'
       AND (
         p."feeTypeId" = ?
         OR (p."feeTypeId" IS NULL AND LOWER(COALESCE(p."feeType", '')) = ANY(?::text[]))
       )`,
    [tuitionId, tuitionLabels]
  );

  let updated = 0;
  for (const row of rows) {
    const amount = Number(row?.amount || 0);
    if (!(Number.isFinite(amount) && amount > 0)) continue;
    const level = row?.levelSnapshot || row?.studentLevel || "";
    const className = row?.classNameSnapshot || row?.studentClassName || "";
    const legacyDue = Number(dueForLevelClassFromConfig(level, className, legacyCfg) || 0);
    const currentDue = Number(dueForLevelClassFromConfig(level, className, currentCfg) || 0);
    if (!(legacyDue > 0) || !(currentDue > 0)) continue;
    if (Math.abs(amount - legacyDue) > 0.000001) continue;
    if (Math.abs(currentDue - legacyDue) <= 0.000001) continue;
    await run(`UPDATE payments SET amount = ? WHERE id = ?`, [currentDue, row.id]);
    updated += 1;
  }
  return { updated };
}
function parseLegacyOcrRemainingAmount(note) {
  const text = String(note || "").trim();
  if (!text) return null;
  const strict = text.match(/\(\s*[A-Za-zÀ-ÿ]{3,4}\s+([0-9]+(?:[.,][0-9]+)?)\s*\)\s*$/i);
  const loose = text.match(/([0-9]+(?:[.,][0-9]+)?)\s*\)?\s*$/);
  const raw = strict?.[1] ?? loose?.[1] ?? "";
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
async function migrateLegacyOcrPartialTuitionAmounts() {
  const tuition = await getDefaultTuitionFeeType();
  const tuitionId = Number(tuition?.id || 0);
  if (!(tuitionId > 0)) return { updated: 0 };
  const tuitionLabels = getTuitionLabelCandidates();
  const rows = await all(
    `SELECT p.id, p."studentId",
            COALESCE(p."paidForMonth", p."monthKey") AS "monthKey",
            p.amount, p.currency, p.note
     FROM payments p
     WHERE p.currency = 'USD'
       AND p.note ILIKE 'Correction import partiel OCR (%'
       AND (
         p."feeTypeId" = ?
         OR (p."feeTypeId" IS NULL AND LOWER(COALESCE(p."feeType", '')) = ANY(?::text[]))
       )
     ORDER BY p.id ASC`,
    [tuitionId, tuitionLabels]
  );
  if (!rows.length) return { updated: 0 };

  const studentCache = new Map();
  let updated = 0;
  for (const row of rows) {
    const rowId = Number(row?.id || 0);
    const studentId = String(row?.studentId || "").trim();
    const monthKey = normalizeMonthKey(row?.monthKey);
    const remainingTarget = parseLegacyOcrRemainingAmount(row?.note);
    if (!(rowId > 0) || !studentId || !monthKey || !Number.isFinite(remainingTarget)) continue;

    let student = studentCache.get(studentId);
    if (!student) {
      student = await get(`SELECT * FROM students WHERE id = ?`, [studentId]);
      if (!student) continue;
      studentCache.set(studentId, student);
    }
    const expected = await getStudentFeeExpectedForMonth({ student, feeType: tuition, monthKey });
    const due = Number(expected.amount || 0);
    if (!(Number.isFinite(due) && due >= 0)) continue;

    const otherRows = await all(
      `SELECT amount, currency, "fxRate"
       FROM payments
       WHERE "studentId" = ?
         AND COALESCE("paidForMonth","monthKey") = ?
         AND id <> ?
         AND (
           "feeTypeId" = ?
           OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY(?::text[]))
         )`,
      [studentId, monthKey, rowId, tuitionId, tuitionLabels]
    );
    const otherPaidUSD = Number(sumPaymentRowsInCurrency(otherRows, "USD"));
    const targetAmount = Math.max(0, due - remainingTarget - otherPaidUSD);
    const currentAmount = Number(row?.amount || 0);
    if (Math.abs(targetAmount - currentAmount) <= 0.000001) continue;
    await run(`UPDATE payments SET amount = ? WHERE id = ?`, [targetAmount, rowId]);
    updated += 1;
  }
  return { updated };
}
function compareMonthKeys(a, b) {
  const aa = normalizeMonthKey(a);
  const bb = normalizeMonthKey(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 0;
  return aa < bb ? -1 : 1;
}
function getCurrentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getDefaultTimelineMonthKey(now = new Date()) {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 9 || month <= 6) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  return `${year}-09`;
}
function isFutureMonthKey(monthKey, now = new Date()) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return false;
  return compareMonthKeys(mk, getCurrentMonthKey(now)) > 0;
}
function getStudentActivationMonth(student) {
  const effective = normalizeMonthKey(student?.classEffectiveMonth);
  if (effective) return effective;
  const created = student?.createdAt ? new Date(student.createdAt) : null;
  if (created && Number.isFinite(created.getTime())) {
    return `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
function schoolYearStartFromMonthKey(monthKey) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return null;
  const m = mk.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  return mo >= 9 ? y : (y - 1);
}
function isSecondary4eHStudent(student) {
  const level = normalizeLevel(student?.level);
  const className = normalizeTextAscii(student?.className || "");
  return level === "secondaire" && /^4e\s+h\b/.test(className);
}
function isSchoolYearTuitionMonth(monthKey, student = null) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return false;
  const month = Number(String(mk).slice(5, 7));
  if (!Number.isFinite(month)) return false;
  if (month === 6 && isSecondary4eHStudent(student)) return false;
  return month >= 9 || month <= 6;
}
function getAnnualDueMonthForStudent({ student, monthKey }) {
  const schoolStartYear = schoolYearStartFromMonthKey(monthKey);
  if (!Number.isFinite(schoolStartYear)) return null;
  const schoolStartMonth = `${schoolStartYear}-09`;
  const schoolEndMonth = `${schoolStartYear + 1}-06`;
  const activation = getStudentActivationMonth(student);
  if (compareMonthKeys(activation, schoolEndMonth) > 0) return null;
  if (compareMonthKeys(activation, schoolStartMonth) <= 0) return schoolStartMonth;
  return activation;
}
function normalizeTextAscii(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function normalizeFeeScopeLevel(value) {
  const normalized = normalizeLevel(value);
  return normalized || null;
}
function normalizeFeeScopeLevels(raw, legacyLevel = null) {
  const values = Array.isArray(raw)
    ? raw
    : (typeof raw === "string" ? raw.split(/[,\n;|]+/g) : []);
  const out = [];
  for (const value of values) {
    const level = normalizeFeeScopeLevel(value);
    if (level && !out.includes(level)) out.push(level);
  }
  const legacy = normalizeFeeScopeLevel(legacyLevel);
  if (!out.length && legacy) out.push(legacy);
  return out;
}
function normalizeFeeScopeClasses(raw) {
  const values = Array.isArray(raw)
    ? raw
    : (typeof raw === "string" ? raw.split(/[,\n;|]+/g) : []);
  const out = [];
  const seen = new Set();
  for (const item of values) {
    const compact = decodeLikelyUtf8Mojibake(String(item || "").trim().replace(/\s+/g, " "));
    if (!compact) continue;
    const key = normalizeTextAscii(compact).replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(compact);
  }
  return out;
}
function normalizeFeePricingRules(raw) {
  let values = raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
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
    const level = normalizeFeeScopeLevel(item.level || item.scopeLevel || item.scope_level || "");
    const className = targetType === "class"
      ? decodeLikelyUtf8Mojibake(String(item.className || item.class || item.class_label || "").trim().replace(/\s+/g, " "))
      : "";
    const amount = Number(item.amount ?? item.defaultAmount ?? item.value ?? NaN);
    if ((targetType !== "level" && targetType !== "class") || !level) continue;
    if (targetType === "class" && !className) continue;
    if (!Number.isFinite(amount) || amount < 0) continue;
    const key = `${targetType}|${level}|${normalizeTextAscii(className)}`;
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
function classMatchesScopedClassName(studentClassName, scopedClassName) {
  const studentKey = normalizeTextAscii(studentClassName).replace(/\s+/g, " ");
  const scopedKey = normalizeTextAscii(scopedClassName).replace(/\s+/g, " ");
  if (!studentKey || !scopedKey) return false;
  if (studentKey === scopedKey) return true;
  return studentKey.startsWith(`${scopedKey} `);
}
function resolveFeePricingRuleForStudent({ feeType, student, pricingRules = null }) {
  const rules = Array.isArray(pricingRules) ? pricingRules : normalizeFeePricingRules(feeType?.pricingRules);
  if (!student || !rules.length) return null;
  const studentLevel = normalizeLevel(student?.level);
  const className = String(student?.className || "");
  const classRule = rules.find((rule) =>
    rule.targetType === "class"
    && rule.level === studentLevel
    && classMatchesScopedClassName(className, rule.className || "")
  );
  if (classRule) return classRule;
  return rules.find((rule) => rule.targetType === "level" && rule.level === studentLevel) || null;
}
function getFeeTypeAmountForStudent({ feeType, student, pricingRules = null, fallbackAmount = 0 }) {
  const rule = resolveFeePricingRuleForStudent({ feeType, student, pricingRules });
  const raw = rule ? rule.amount : Number(feeType?.defaultAmount ?? fallbackAmount ?? 0);
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}
function isFeeScopeApplicableToStudent({ feeType, student }) {
  const scopeLevels = normalizeFeeScopeLevels(feeType?.scopeLevels, feeType?.scopeLevel);
  if (scopeLevels.length) {
    const studentLevel = normalizeLevel(student?.level);
    if (!scopeLevels.includes(studentLevel)) return false;
  }
  const scopeClasses = normalizeFeeScopeClasses(feeType?.scopeClasses);
  if (!scopeClasses.length) return true;
  return scopeClasses.some((scopeClassName) =>
    classMatchesScopedClassName(student?.className, scopeClassName)
  );
}
function hasCasSocialMarker(student) {
  const note = normalizeTextAscii(student?.studentNote || "");
  if (/\bcas\s*social\b/i.test(note)) return true;
  const due = Number(student?.monthlyDue);
  return Number.isFinite(due) && due <= 0;
}
function getStudentTuitionMonthlyDue(student, { levelDueConfig = null, baseDue = null } = {}) {
  const rawDue = Number(student?.monthlyDue || 0);
  // CAS SOCIAL = exonération totale (0$), tous niveaux. Plus de remise partielle.
  if (hasCasSocialMarker(student)) return 0;
  return Number.isFinite(rawDue) && rawDue >= 0 ? rawDue : 0;
}
function isPrimaryOrMaternelleStudent(student) {
  const level = normalizeLevel(student?.level);
  return level === "maternelle" || level === "primaire";
}
function getSecondaryClassFlags(student) {
  const level = normalizeLevel(student?.level);
  const cls = normalizeTextAscii(student?.className);
  const isSecondary = level === "secondaire";
  const is7e = /^7e\b/.test(cls);
  const is8e = /^8e\b/.test(cls);
  const is4e = /^4e\b/.test(cls);
  const is7e8e = isSecondary && (is7e || is8e);
  const is4eAll = isSecondary && is4e;
  const isH1to4 = isSecondary && /^([1-4](?:e|re|er|ere))\s*h\b/.test(cls);
  const hasGeneralKeyword = /pedagogie|scientifique|litteraire|general/.test(cls);
  const hasTechniqueKeyword = /comm|electronique|mec|electricite|coupe|technique/.test(cls);
  const isSecondaryGeneral = isH1to4 && hasGeneralKeyword;
  const isSecondaryTechnique = isH1to4 && hasTechniqueKeyword;
  return { isSecondary, is7e, is8e, is7e8e, is4eAll, isSecondaryGeneral, isSecondaryTechnique };
}
function isFeeTypeApplicableToStudent({ feeType, student }) {
  if (!isFeeScopeApplicableToStudent({ feeType, student })) return false;
  const code = String(feeType?.code || "").toUpperCase();
  if (!code) return true;
  if (code === "TUITION" || code === "BUS" || code === "ETAT_MINERVAL") return true;
  if (["ETAT_T1_PM", "ETAT_T2_PM", "ETAT_T3_PM"].includes(code)) {
    return isPrimaryOrMaternelleStudent(student);
  }
  const sec = getSecondaryClassFlags(student);
  if (["ETAT_T1_78", "ETAT_T2_78", "ETAT_T3_78"].includes(code)) {
    return sec.is7e8e;
  }
  if (["TENASOSP_8E", "ENROLEMENT_8E"].includes(code)) return sec.is8e;
  if (["ETAT_T1_SEC_GENERAL", "ETAT_T2_SEC_GENERAL", "ETAT_T3_SEC_GENERAL"].includes(code)) {
    return sec.isSecondaryGeneral;
  }
  if (["ETAT_T1_SEC_TECH", "ETAT_T2_SEC_TECH", "ETAT_T3_SEC_TECH", "ETAT_FRAIS_TECHNIQUE"].includes(code)) {
    return sec.isSecondaryTechnique;
  }
  if (["EXAMEN_ETAT_4E", "ENROLEMENT_4E"].includes(code)) {
    return sec.is4eAll;
  }
  return true;
}
function isFeeDueForMonth({ student, feeType, monthKey }) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return false;
  if (!isFeeTypeApplicableToStudent({ feeType, student })) return false;
  const code = String(feeType?.code || "").toUpperCase();
  if (code === "TUITION") return isSchoolYearTuitionMonth(mk, student);
  const cycle = normalizeBillingCycle(feeType?.billingCycle);
  if (cycle === "item") return false; // un article n'est jamais "dû" : pas de mois, achats libres
  if (cycle !== "annual") return true;
  const configuredDueMonth = normalizeMonthKey(feeType?.dueMonth);
  if (configuredDueMonth) return configuredDueMonth === mk;
  const annualDueMonth = getAnnualDueMonthForStudent({ student, monthKey: mk });
  return Boolean(annualDueMonth && annualDueMonth === mk);
}
function buildSequentialMonthKeys({ monthsBack = 12, monthsForward = 18, now = new Date() } = {}) {
  const out = [];
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  start.setUTCMonth(start.getUTCMonth() - monthsBack);
  for (let i = 0; i <= (monthsBack + monthsForward); i += 1) {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
async function getStudentBusSubscription(studentId) {
  if (!studentId) return null;
  const row = await get(
    `SELECT "studentId", active, "startMonth", "endMonth", "category", "updatedAt", "updatedByUserId", "updatedByUsername"
     FROM student_bus_subscription
     WHERE "studentId" = ?`,
    [String(studentId)]
  );
  return parseStudentBusSubscriptionRow(row);
}
function parseStudentBusSubscriptionRow(row) {
  if (!row) return null;
  return {
    studentId: row.studentId,
    active: Boolean(row.active),
    startMonth: normalizeMonthKey(row.startMonth) || null,
    endMonth: normalizeMonthKey(row.endMonth) || null,
    category: row.category != null && String(row.category).trim() !== "" ? String(row.category).trim() : null,
    updatedAt: row.updatedAt || null,
    updatedByUserId: row.updatedByUserId || null,
    updatedByUsername: row.updatedByUsername || null
  };
}

function parseStudentTuitionBenefitRow(row) {
  if (!row) return null;
  return {
    studentId: row.studentId,
    active: Boolean(row.active),
    startMonth: normalizeMonthKey(row.startMonth) || null,
    endMonth: normalizeMonthKey(row.endMonth) || null,
    employeeName: row.employeeName != null && String(row.employeeName).trim() !== "" ? String(row.employeeName).trim() : null,
    updatedAt: row.updatedAt || null,
    updatedByUserId: row.updatedByUserId || null,
    updatedByUsername: row.updatedByUsername || null
  };
}
async function getStudentTuitionBenefit(studentId) {
  if (!studentId) return null;
  const row = await get(
    `SELECT "studentId", active, "startMonth", "endMonth", "employeeName", "updatedAt", "updatedByUserId", "updatedByUsername"
     FROM student_tuition_benefit
     WHERE "studentId" = ?`,
    [String(studentId)]
  );
  return parseStudentTuitionBenefitRow(row);
}

// Keep one non-cash tuition payment per covered month that has actually started.
async function syncStudentTuitionBenefitPayments(studentId, { actorId = null, actorUsername = null } = {}) {
  const sid = String(studentId || "").trim();
  if (!sid) return { inserted: 0, removed: 0 };
  const student = await get(`SELECT * FROM students WHERE id = ?`, [sid]);
  if (!student) return { inserted: 0, removed: 0 };
  const schoolYearStartYear = parseSchoolYearStartYear(student.schoolYearStartYear)
    || await getSchoolYearStartYearSetting();
  const tuitionFeeType = await getFeeTypeByCode("TUITION", { schoolYearStartYear });
  const benefit = await getStudentTuitionBenefit(sid);
  if (!benefit || !benefit.active || !benefit.startMonth || !tuitionFeeType) {
    const del = await pgPool.query(
      `DELETE FROM payments WHERE "studentId" = $1 AND "paymentMethod" = 'staff_benefit'`,
      [sid]
    );
    const removed = Number(del.rowCount || 0);
    return { inserted: 0, removed };
  }
  const syStart = Number(schoolYearStartYear);
  const boundsStart = `${syStart}-09`;
  const boundsEnd = `${syStart + 1}-08`;
  const startMonth = benefit.startMonth >= boundsStart ? benefit.startMonth : boundsStart;
  const coverageEndMonth = benefit.endMonth && benefit.endMonth <= boundsEnd ? benefit.endMonth : boundsEnd;
  const businessMonthRow = await get(
    `SELECT TO_CHAR(NOW() AT TIME ZONE ?, 'YYYY-MM') AS "monthKey"`,
    [BUSINESS_TIMEZONE]
  );
  const currentMonth = normalizeMonthKey(businessMonthRow?.monthKey) || getCurrentMonthKey();
  const endMonth = coverageEndMonth <= currentMonth ? coverageEndMonth : currentMonth;
  const desiredByMonth = new Map();
  if (startMonth <= endMonth) {
    for (let mk = startMonth; mk <= endMonth; mk = addMonthsToMonthKey(mk, 1)) {
      const expected = await getStudentFeeExpectedForMonth({ student, feeType: tuitionFeeType, monthKey: mk });
      const amount = Number(expected?.amount || 0);
      if (!(amount > 0)) continue;
      desiredByMonth.set(mk, {
        amount,
        currency: normalizeCurrency(expected?.currency)
          || normalizeCurrency(tuitionFeeType.defaultCurrency)
          || "USD"
      });
    }
  }

  const existing = await all(
    `SELECT id, COALESCE("paidForMonth", "monthKey") AS "paidForMonth"
     FROM payments
     WHERE "studentId" = ? AND "paymentMethod" = 'staff_benefit'
     ORDER BY id ASC`,
    [sid]
  );
  const retainedMonths = new Set();
  const deleteIds = [];
  for (const row of existing) {
    const mk = normalizeMonthKey(row.paidForMonth);
    if (!mk || !desiredByMonth.has(mk) || retainedMonths.has(mk)) {
      deleteIds.push(Number(row.id));
      continue;
    }
    retainedMonths.add(mk);
  }
  let removed = 0;
  if (deleteIds.length) {
    const del = await pgPool.query(
      `DELETE FROM payments WHERE id = ANY($1::bigint[])`,
      [deleteIds]
    );
    removed = Number(del.rowCount || 0);
  }

  let inserted = 0;
  for (const [mk, expected] of desiredByMonth.entries()) {
    if (retainedMonths.has(mk)) continue;
    await pgPool.query(
      `INSERT INTO payments
         ("studentId", "monthKey", "paidForMonth", amount, currency, "dueAmountSnapshot", "dueCurrencySnapshot", "feeTypeId", "feeType",
          note, "paymentMethod", "receiptNo", "clientRequestId", "createdAt", "paidAt",
          "createdByUserId", "createdByUsername",
          "studentNameSnapshot", "studentMatriculeSnapshot", "classNameSnapshot", "levelSnapshot")
       VALUES ($1,$2,$2,$3,$4,$3,$4,$5,$6,$7,'staff_benefit',NULL,$8,NOW(),NOW(),$9,$10,$11,$12,$13,$14)`,
      [
        sid, mk, expected.amount, expected.currency, Number(tuitionFeeType.id), tuitionFeeType.labelFr || "Minerval",
        `Prise en charge (personnel)${benefit.employeeName ? " — " + benefit.employeeName : ""}`,
        `STAFFBEN-${sid}-${mk}`, actorId, actorUsername,
        student.fullName || null, student.matricule || null, student.className || null, student.level || null
      ]
    );
    inserted += 1;
  }
  return { inserted, removed };
}

async function syncAllStudentTuitionBenefitPayments() {
  const rows = await all(
    `SELECT "studentId" FROM student_tuition_benefit WHERE active = TRUE ORDER BY "studentId" ASC`
  );
  let inserted = 0;
  let removed = 0;
  for (const row of rows) {
    const result = await syncStudentTuitionBenefitPayments(row.studentId, {
      actorUsername: "system"
    });
    inserted += Number(result?.inserted || 0);
    removed += Number(result?.removed || 0);
  }
  if (inserted || removed) purgeHotApiCache();
  return { students: rows.length, inserted, removed };
}

let tuitionBenefitSyncRunning = false;
function startTuitionBenefitMonthlySync() {
  const timer = setInterval(async () => {
    if (tuitionBenefitSyncRunning) return;
    tuitionBenefitSyncRunning = true;
    try {
      await syncAllStudentTuitionBenefitPayments();
    } catch (err) {
      console.error("Tuition benefit scheduled sync failed:", err?.message || err);
    } finally {
      tuitionBenefitSyncRunning = false;
    }
  }, 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
}
async function getStudentBusPricing(studentId, busFeeType = null, options = {}) {
  if (!studentId) {
    return {
      feeTypeId: null,
      monthlyAmount: 0,
      currency: "USD",
      source: "default",
      overrideActive: false
    };
  }
  const studentSchoolYearStartYear = parseSchoolYearStartYear(
    options?.schoolYearStartYear
      ?? options?.student?.schoolYearStartYear
      ?? (await get(`SELECT "schoolYearStartYear" FROM students WHERE id = ?`, [String(studentId)]))?.schoolYearStartYear
  );
  const feeType = busFeeType || await getFeeTypeByCode("BUS", {
    schoolYearStartYear: studentSchoolYearStartYear
  });
  if (!feeType) {
    return {
      feeTypeId: null,
      monthlyAmount: 0,
      currency: "USD",
      source: "default",
      overrideActive: false
    };
  }
  const override = await get(
    `SELECT amount, currency, active
     FROM student_fee_overrides
     WHERE "studentId" = ? AND "feeTypeId" = ?`,
    [String(studentId), Number(feeType.id)]
  );
  const defaultCurrency = normalizeCurrency(feeType.defaultCurrency) || "USD";
  const overrideActive = Boolean(override && override.active !== false);
  const monthlyAmountRaw = overrideActive ? Number(override.amount || 0) : Number(feeType.defaultAmount || 0);
  return {
    feeTypeId: Number(feeType.id),
    monthlyAmount: Number.isFinite(monthlyAmountRaw) ? monthlyAmountRaw : 0,
    currency: overrideActive
      ? (normalizeCurrency(override.currency) || defaultCurrency)
      : defaultCurrency,
    source: overrideActive ? "override" : "default",
    overrideActive
  };
}
function isBusSubscriptionActiveForMonth(sub, monthKey) {
  if (!sub || sub.active === false) return false;
  const mk = normalizeMonthKey(monthKey);
  const start = normalizeMonthKey(sub.startMonth);
  const end = normalizeMonthKey(sub.endMonth);
  if (!mk || !start) return false;
  if (compareMonthKeys(mk, start) < 0) return false;
  if (end && compareMonthKeys(mk, end) > 0) return false;
  return true;
}
function isFeeMonthLate({ feeType, monthKey, now = new Date() }) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return false;
  const code = String(feeType?.code || "").toUpperCase();
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (code === "BUS") {
    // Bus due every 1st of the month: current month unpaid is late from the 1st.
    return compareMonthKeys(mk, nowMonth) <= 0;
  }
  // Only fees with currently defined due dates are marked late:
  // - TUITION (Minerval)
  // - ETAT_MINERVAL
  if (code !== "TUITION" && code !== "ETAT_MINERVAL") return false;
  // Monthly due date: late after the 5th of the following month.
  const nextMonth = addMonthsToMonthKey(mk, 1);
  if (!nextMonth) return false;
  const cutoff = new Date(`${nextMonth}-05T23:59:59.999Z`);
  return now.getTime() > cutoff.getTime();
}
function buildStudentFeeExpectationContextFromPreload({
  student,
  feeType,
  override = null,
  busSub = null,
  schoolYearStartYear = null,
  levelMonthlyDueConfig = null
}) {
  const code = String(feeType?.code || "").toUpperCase();
  const defaultCurrency = normalizeCurrency(feeType?.defaultCurrency) || "USD";
  const pricingRules = normalizeFeePricingRules(feeType?.pricingRules);
  const overrideActive = Boolean(override && override.active !== false);
  const overrideAmount = overrideActive ? Number(override.amount || 0) : 0;
  const overrideCurrency = overrideActive
    ? (normalizeCurrency(override.currency) || defaultCurrency)
    : defaultCurrency;
  let tuitionEffectiveMonth = null;
  let tuitionDueConfig = null;
  let etatMinervalEffectiveMonth = null;
  const startYear = Number.isFinite(Number(schoolYearStartYear))
    ? Number(schoolYearStartYear)
    : (parseSchoolYearStartYear(student?.schoolYearStartYear) || getDefaultSchoolYearStartYear());
  if (code === "TUITION") {
    const defaultEffectiveMonth = `${startYear}-09`;
    const enrollmentMonthFromCreatedAt = monthKeyFromDateValue(student?.createdAt);
    const rawEffectiveMonth = normalizeMonthKey(student.classEffectiveMonth) || enrollmentMonthFromCreatedAt;
    tuitionEffectiveMonth = rawEffectiveMonth
      ? (compareMonthKeys(rawEffectiveMonth, defaultEffectiveMonth) < 0
          ? defaultEffectiveMonth
          : rawEffectiveMonth)
      : defaultEffectiveMonth;
    tuitionDueConfig = normalizeLevelMonthlyDueConfig(levelMonthlyDueConfig || DEFAULT_LEVEL_MONTHLY_DUE_USD);
  }
  if (code === "ETAT_MINERVAL") {
    etatMinervalEffectiveMonth = `${startYear}-09`;
  }
  return {
    student,
    feeType,
    code,
    defaultCurrency,
    pricingRules,
    overrideActive,
    overrideAmount,
    overrideCurrency,
    busSub: code === "BUS" ? busSub : null,
    tuitionEffectiveMonth,
    tuitionDueConfig,
    etatMinervalEffectiveMonth
  };
}
async function buildStudentFeeExpectationContext({ student, feeType }) {
  const code = String(feeType?.code || "").toUpperCase();
  const override = await get(
    `SELECT amount, currency, active
     FROM student_fee_overrides
     WHERE "studentId" = ? AND "feeTypeId" = ?`,
    [student.id, feeType.id]
  );
  let busSub = null;
  let schoolYearStartYear = null;
  let levelMonthlyDueConfig = null;
  const studentSchoolYearStartYear = parseSchoolYearStartYear(student?.schoolYearStartYear)
    || await getSchoolYearStartYearSetting();
  if (code === "BUS") {
    busSub = await getStudentBusSubscription(student.id);
  }
  if (code === "TUITION") {
    schoolYearStartYear = studentSchoolYearStartYear;
    levelMonthlyDueConfig = await getLevelMonthlyDueSetting({ schoolYearStartYear });
  }
  if (code === "ETAT_MINERVAL") {
    schoolYearStartYear = studentSchoolYearStartYear;
  }
  return buildStudentFeeExpectationContextFromPreload({
    student,
    feeType,
    override,
    busSub,
    schoolYearStartYear,
    levelMonthlyDueConfig
  });
}
function getStudentFeeExpectedForMonthFromContext(context, monthKey) {
  const normalizedMonth = normalizeMonthKey(monthKey) || new Date().toISOString().slice(0, 7);
  const { student, feeType } = context || {};
  if (!student || !feeType) return { amount: 0, currency: "USD" };
  if (!isFeeTypeApplicableToStudent({ feeType, student })) {
    return {
      amount: 0,
      currency: context.defaultCurrency || normalizeCurrency(student.currency) || "USD"
    };
  }
  if (context.code === "BUS" && !isBusSubscriptionActiveForMonth(context.busSub, normalizedMonth)) {
    return {
      amount: 0,
      currency: context.defaultCurrency || "USD"
    };
  }
  if (context.code === "TUITION" && !isSchoolYearTuitionMonth(normalizedMonth, student)) {
    return {
      amount: 0,
      currency: normalizeCurrency(student.currency) || "USD"
    };
  }
  if (context.overrideActive) {
    return {
      amount: Number(context.overrideAmount || 0),
      currency: context.overrideCurrency || context.defaultCurrency || "USD"
    };
  }
  if (context.code === "TUITION") {
    const effectiveMonth = normalizeMonthKey(context.tuitionEffectiveMonth);
    if (effectiveMonth && compareMonthKeys(normalizedMonth, effectiveMonth) < 0) {
      return {
        amount: 0,
        currency: normalizeCurrency(student.currency) || "USD"
      };
    }
    const monthOverride = context.tuitionDueConfig?.monthlyOverrides?.[normalizedMonth] || null;
    const tuitionDue = monthOverride
      ? (hasCasSocialMarker(student)
          ? 0
          : dueForLevelClassFromConfig(student.level, student.className, context.tuitionDueConfig, normalizedMonth))
      : getStudentTuitionMonthlyDue(student);
    return {
      amount: tuitionDue,
      currency: normalizeCurrency(student.currency) || "USD"
    };
  }
  if (context.code === "ETAT_MINERVAL") {
    const effectiveMonth = normalizeMonthKey(context.etatMinervalEffectiveMonth);
    if (effectiveMonth && compareMonthKeys(normalizedMonth, effectiveMonth) < 0) {
      return {
        amount: 0,
        currency: context.defaultCurrency || "CDF"
      };
    }
  }
  const cycle = normalizeBillingCycle(feeType.billingCycle);
  if (!isFeeDueForMonth({ student, feeType: { ...feeType, billingCycle: cycle }, monthKey: normalizedMonth })) {
    return {
      amount: 0,
      currency: context.defaultCurrency || "USD"
    };
  }
  return {
    amount: getFeeTypeAmountForStudent({
      feeType,
      student,
      pricingRules: context.pricingRules,
      fallbackAmount: feeType.defaultAmount
    }),
    currency: context.defaultCurrency || "USD"
  };
}
async function getStudentFeeExpectedForMonth({ student, feeType, monthKey, context = null }) {
  if (!student || !feeType) return { amount: 0, currency: "USD" };
  const expectationContext = context || await buildStudentFeeExpectationContext({ student, feeType });
  return getStudentFeeExpectedForMonthFromContext(expectationContext, monthKey);
}
function lockedDueSnapshotFromPaymentRows(rows) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => !row?.cancelledAt && Number(row?.dueAmountSnapshot || 0) > 0)
    .sort((a, b) => {
      const dateDiff = Date.parse(String(a?.paidAt || a?.createdAt || "")) - Date.parse(String(b?.paidAt || b?.createdAt || ""));
      if (Number.isFinite(dateDiff) && dateDiff !== 0) return dateDiff;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
  const first = candidates[0];
  if (!first) return null;
  return {
    amount: Number(first.dueAmountSnapshot || 0),
    currency: normalizeCurrency(first.dueCurrencySnapshot) || normalizeCurrency(first.currency) || "USD"
  };
}
async function snapshotExistingPaymentDues({ studentId = null, feeTypeId = null, feeCode = null } = {}) {
  const clauses = [
    `p."dueAmountSnapshot" IS NULL`,
    `p.amount > 0`,
    `p."cancelledAt" IS NULL`
  ];
  const params = [];
  if (studentId) {
    clauses.push(`p."studentId" = ?`);
    params.push(String(studentId));
  }
  if (
    feeTypeId !== null &&
    feeTypeId !== undefined &&
    String(feeTypeId).trim() !== "" &&
    Number.isFinite(Number(feeTypeId))
  ) {
    clauses.push(`p."feeTypeId" = ?`);
    params.push(Number(feeTypeId));
  }
  if (feeCode) {
    clauses.push(`UPPER(COALESCE(ft.code, '')) = ?`);
    params.push(String(feeCode).toUpperCase());
  }
  const rows = await all(
    `SELECT p.id, p."studentId", p."feeTypeId", p."feeType",
            COALESCE(p."paidForMonth", p."monthKey") AS "paidForMonth",
            row_to_json(s) AS student,
            row_to_json(ft) AS "feeTypeRow"
     FROM payments p
     JOIN students s ON s.id = p."studentId"
     LEFT JOIN fee_types ft ON ft.id = p."feeTypeId"
     WHERE ${clauses.join(" AND ")}
     ORDER BY p.id ASC`,
    params
  );
  const contextCache = new Map();
  let snapshotted = 0;
  let skippedNoStudent = 0;
  let skippedNoFee = 0;
  let skippedNoDue = 0;
  let updateMisses = 0;
  for (const row of rows) {
    const student = row.student || null;
    if (!student) { skippedNoStudent += 1; continue; }
    let feeType = row.feeTypeRow || null;
    if (!feeType) {
      feeType = await resolveFeeType({
        feeTypeId: row.feeTypeId,
        feeLabel: row.feeType,
        schoolYearStartYear: student.schoolYearStartYear
      });
    }
    if (!feeType) { skippedNoFee += 1; continue; }
    const cacheKey = `${student.id}|${feeType.id}`;
    let context = contextCache.get(cacheKey);
    if (!context) {
      context = await buildStudentFeeExpectationContext({ student, feeType });
      contextCache.set(cacheKey, context);
    }
    const expected = getStudentFeeExpectedForMonthFromContext(context, row.paidForMonth);
    const amount = Number(expected?.amount || 0);
    const currency = normalizeCurrency(expected?.currency);
    if (!(amount > 0) || !currency) { skippedNoDue += 1; continue; }
    const updated = await run(
      `UPDATE payments
       SET "dueAmountSnapshot" = ?, "dueCurrencySnapshot" = ?
       WHERE id = ? AND "dueAmountSnapshot" IS NULL AND "cancelledAt" IS NULL`,
      [amount, currency, row.id]
    );
    const changes = Number(updated?.changes || 0);
    snapshotted += changes;
    if (!changes) updateMisses += 1;
  }
  return { scanned: rows.length, snapshotted, skippedNoStudent, skippedNoFee, skippedNoDue, updateMisses };
}
function getFeeTypeLegacyLabelCandidates(feeType) {
  const labels = new Set();
  const normalizedLabel = normalizeFeeLabel(feeType?.labelFr || "");
  if (normalizedLabel) labels.add(normalizedLabel.toLowerCase());
  const code = String(feeType?.code || "").toUpperCase();
  if (code === "TUITION") {
    for (const l of getTuitionLabelCandidates()) labels.add(String(l || "").toLowerCase());
  }
  return Array.from(labels);
}
function monthKeyFromDateValue(value) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function normalizeLegacyPaymentMonthForFee({ row, feeType, context = null }) {
  const rawMonth = normalizeMonthKey(row?.paidForMonth || row?.monthKey);
  const cycle = normalizeBillingCycle(feeType?.billingCycle);
  const code = String(feeType?.code || "").toUpperCase();
  const paidMonth = normalizeMonthKey(monthKeyFromDateValue(row?.paidAt || row?.createdAt));
  const effectiveMonth = normalizeMonthKey(context?.etatMinervalEffectiveMonth);
  const student = context?.student || null;

  if (cycle === "annual" && student) {
    const configuredDueMonth = normalizeMonthKey(feeType?.dueMonth);
    if (configuredDueMonth) return configuredDueMonth;
    const candidates = [rawMonth, paidMonth, effectiveMonth].filter(Boolean);
    for (const candidateMonth of candidates) {
      const dueMonth = getAnnualDueMonthForStudent({ student, monthKey: candidateMonth });
      if (dueMonth) return dueMonth;
    }
  }

  if (code === "ETAT_MINERVAL") {
    if (effectiveMonth) {
      if (!rawMonth || compareMonthKeys(rawMonth, effectiveMonth) < 0) {
        return paidMonth || effectiveMonth;
      }
    }
    return rawMonth || paidMonth || effectiveMonth || null;
  }
  return rawMonth || paidMonth || null;
}
async function getStudentFeePaymentRows({ studentId, feeType, monthKey = null, context = null }) {
  if (!studentId || !feeType?.id) return [];
  const labels = getFeeTypeLegacyLabelCandidates(feeType);
  const normalizedMonth = normalizeMonthKey(monthKey);
  const code = String(feeType?.code || "").toUpperCase();
  const cycle = normalizeBillingCycle(feeType?.billingCycle);
  const requiresAnnualMonthNormalization = cycle === "annual";
  if (normalizedMonth && code !== "ETAT_MINERVAL" && !requiresAnnualMonthNormalization) {
    return all(
      `SELECT id,
              COALESCE("paidForMonth","monthKey") AS "paidForMonth",
              amount,
              currency,
              "fxRate",
              "dueAmountSnapshot",
              "dueCurrencySnapshot",
              "cancelledAt",
              note,
              COALESCE("paidAt","createdAt") AS "paidAt"
       FROM payments
       WHERE "studentId" = ?
         AND COALESCE("paidForMonth","monthKey") = ?
         AND "cancelledAt" IS NULL
         AND (
           "feeTypeId" = ?
           OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY(?::text[]))
         )`,
      [studentId, normalizedMonth, feeType.id, labels]
    );
  }
  const rows = await all(
    `SELECT id, COALESCE("paidForMonth","monthKey") AS "paidForMonth", amount, currency, "fxRate",
            "dueAmountSnapshot", "dueCurrencySnapshot", "cancelledAt", note, COALESCE("paidAt","createdAt") AS "paidAt"
     FROM payments
     WHERE "studentId" = ?
       AND "cancelledAt" IS NULL
       AND (
         "feeTypeId" = ?
         OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY(?::text[]))
       )`,
    [studentId, feeType.id, labels]
  );
  const normalizedRows = (rows || []).map((row) => ({
    ...row,
    paidForMonth: normalizeLegacyPaymentMonthForFee({ row, feeType, context }) || normalizeMonthKey(row?.paidForMonth)
  }));
  if (!normalizedMonth) return normalizedRows;
  return normalizedRows.filter((row) => normalizeMonthKey(row?.paidForMonth) === normalizedMonth);
}
function normalizePaymentRowsForFeeContext(rows, feeType, context = null) {
  const code = String(feeType?.code || "").toUpperCase();
  const cycle = normalizeBillingCycle(feeType?.billingCycle);
  const list = Array.isArray(rows) ? rows : [];
  if (code !== "ETAT_MINERVAL" && cycle !== "annual") {
    return list.map((row) => ({
      ...row,
      paidForMonth: normalizeMonthKey(row?.paidForMonth || row?.monthKey)
    }));
  }
  return list.map((row) => ({
    ...row,
    paidForMonth: normalizeLegacyPaymentMonthForFee({ row, feeType, context }) || normalizeMonthKey(row?.paidForMonth)
  }));
}
function isLegacyBackfillTuitionPayment(row) {
  const note = String(row?.note || "").toLowerCase();
  return note.includes("backfill historique pdf");
}
function applyLegacyTuitionBackfillDue({ student, feeType, due, paid, paymentRows }) {
  const code = String(feeType?.code || "").toUpperCase();
  if (code !== "TUITION") return Number(due || 0);
  const currentDue = Number(due || 0);
  const paidAmount = Number(paid || 0);
  if (!(currentDue > 0) || !(paidAmount > 0)) return currentDue;
  const rows = Array.isArray(paymentRows) ? paymentRows : [];
  if (!rows.length) return currentDue;
  if (!rows.every((r) => isLegacyBackfillTuitionPayment(r))) return currentDue;
  const legacyDue = Number(legacyMonthlyDueForLevelClass(student?.level, student?.className) || 0);
  if (!(legacyDue > 0)) return currentDue;
  // If the month was already migrated to the new amount, keep current due.
  if (paidAmount > (legacyDue + 0.000001)) return currentDue;
  if (paidAmount + 1e-9 < legacyDue) return currentDue;
  return Math.min(currentDue, legacyDue);
}
function sumPaymentRowsInCurrency(rows, targetCurrency) {
  const outCurrency = normalizeCurrency(targetCurrency) || "USD";
  let total = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const amount = Number(row?.amount || 0);
    if (!(Number.isFinite(amount) && amount > 0)) continue;
    const from = normalizeCurrency(row?.currency) || outCurrency;
    let converted = convertAmountByFx(amount, from, outCurrency, row?.fxRate);
    if (!Number.isFinite(converted)) {
      converted = from === outCurrency ? amount : 0;
    }
    total += Number(converted || 0);
  }
  return total;
}
function latestPaymentDateIso(rows) {
  let bestMs = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const raw = row?.paidAt || row?.createdAt;
    const ms = Date.parse(String(raw || ""));
    if (Number.isFinite(ms) && ms > bestMs) bestMs = ms;
  }
  return bestMs > 0 ? new Date(bestMs).toISOString() : null;
}
async function getStudentFeeMonthStatus({ student, feeType, monthKey, context = null, paymentRows = null }) {
  const expected = await getStudentFeeExpectedForMonth({ student, feeType, monthKey, context });
  const normalizedMonth = normalizeMonthKey(monthKey);
  const paymentRowsRaw = Array.isArray(paymentRows)
    ? paymentRows
    : await getStudentFeePaymentRows({ studentId: student.id, feeType, monthKey: normalizedMonth, context });
  const paymentRowsNormalized = normalizePaymentRowsForFeeContext(paymentRowsRaw, feeType, context);
  const monthRows = normalizedMonth
    ? paymentRowsNormalized.filter((row) => normalizeMonthKey(row?.paidForMonth) === normalizedMonth)
    : paymentRowsNormalized;
  const dueLock = lockedDueSnapshotFromPaymentRows(monthRows);
  const statusCurrency = dueLock?.currency || expected.currency || "USD";
  const paid = Number(sumPaymentRowsInCurrency(monthRows, statusCurrency));
  const lastPaidAt = latestPaymentDateIso(monthRows);
  const dueRaw = Number(dueLock?.amount ?? expected.amount ?? 0);
  const due = dueLock
    ? dueRaw
    : applyLegacyTuitionBackfillDue({ student, feeType, due: dueRaw, paid, paymentRows: monthRows });
  const remaining = Math.max(0, due - paid);
  let status = "À jour";
  if (remaining > 0 && paid > 0) status = "Partiel";
  else if (remaining > 0 && paid <= 0) {
    if (isFutureMonthKey(monthKey)) status = "À jour";
    else status = isFeeMonthLate({ feeType, monthKey }) ? "En retard" : "Impayé";
  }
  return {
    monthKey: normalizedMonth || monthKey,
    dueAmount: due,
    currency: statusCurrency,
    paidSoFar: paid,
    remaining,
    status,
    lastPaidAt
  };
}
async function getStudentFeeTimelineStatus({ student, feeType, context = null, paymentRows = null }) {
  const months = buildSequentialMonthKeys();
  const expectationContext = context || await buildStudentFeeExpectationContext({ student, feeType });
  const paymentRowsRaw = Array.isArray(paymentRows)
    ? paymentRows
    : await getStudentFeePaymentRows({ studentId: student.id, feeType, context: expectationContext });
  const paymentRowsNormalized = normalizePaymentRowsForFeeContext(paymentRowsRaw, feeType, expectationContext);
  const paidRowsByMonth = new Map();
  for (const row of paymentRowsNormalized) {
    const mk = normalizeMonthKey(row?.paidForMonth);
    if (!mk) continue;
    if (!paidRowsByMonth.has(mk)) paidRowsByMonth.set(mk, []);
    paidRowsByMonth.get(mk).push(row);
  }
  const monthsPaid = [];
  const monthsPartial = [];
  const monthsUnpaid = [];
  let nextDueMonth = null;
  let paidSoFar = 0;
  let remaining = 0;
  let due = 0;
  let lastPaidAt = null;
  let expectedCurrency = normalizeCurrency(feeType.defaultCurrency) || "USD";
  const feeCode = String(feeType?.code || "").toUpperCase();
  for (const mk of months) {
    const expected = getStudentFeeExpectedForMonthFromContext(expectationContext, mk);
    const monthRows = paidRowsByMonth.get(mk);
    const dueLock = lockedDueSnapshotFromPaymentRows(monthRows);
    const dueRaw = Number(dueLock?.amount ?? expected.amount ?? 0);
    expectedCurrency = normalizeCurrency(dueLock?.currency || expected.currency) || expectedCurrency;
    const paid = Number(sumPaymentRowsInCurrency(monthRows, expectedCurrency));
    const monthLastPaidAt = latestPaymentDateIso(monthRows);
    const dueEffective = dueLock
      ? dueRaw
      : feeCode === "TUITION"
      ? applyLegacyTuitionBackfillDue({
          student,
          feeType,
          due: dueRaw,
          paid,
          paymentRows: monthRows
        })
        : dueRaw;
    due = dueEffective;
    const rem = Math.max(0, dueEffective - paid);
    // Display list of months already paid:
    // - normal path: month due > 0 and fully covered
    // - historical import path: month due == 0 (e.g. before effective month) but payment exists
    if ((due > 0 && rem <= 0) || (due <= 0 && paid > 0)) {
      monthsPaid.push(mk);
    } else if (due > 0 && paid > 0 && rem > 0) {
      monthsPartial.push(mk);
    }

    // Owed months up to the current month, with the exact remaining amount —
    // feeds the "Mois impayés" report (partial months show what's left).
    if (due > 0 && rem > 0 && !isFutureMonthKey(mk)) {
      monthsUnpaid.push({ monthKey: mk, due: dueEffective, paid, remaining: rem });
    }

    // Billing progression path: first month that is actually due and not fully paid
    if (!nextDueMonth && due > 0 && rem > 0) {
      nextDueMonth = mk;
      paidSoFar = paid;
      remaining = rem;
      lastPaidAt = monthLastPaidAt;
    }
  }
  if (!nextDueMonth) {
    const d = new Date();
    nextDueMonth = getDefaultTimelineMonthKey(d);
    const expectedNow = getStudentFeeExpectedForMonthFromContext(expectationContext, nextDueMonth);
    due = Number(expectedNow.amount || 0);
    expectedCurrency = normalizeCurrency(expectedNow.currency) || expectedCurrency;
    paidSoFar = due;
    remaining = 0;
    lastPaidAt = null;
  }
  let status = "À jour";
  if (remaining > 0 && paidSoFar > 0) status = "Partiel";
  else if (remaining > 0 && paidSoFar <= 0) {
    if (isFutureMonthKey(nextDueMonth)) status = "À jour";
    else status = isFeeMonthLate({ feeType, monthKey: nextDueMonth }) ? "En retard" : "Impayé";
  }
  return {
    monthsPaid,
    monthsPartial,
    monthsUnpaid,
    nextDueMonth,
    dueAmount: due,
    currency: expectedCurrency,
    paidSoFar,
    remaining,
    status,
    lastPaidAt
  };
}

async function getFirstPendingTuitionMonth(student) {
  const due = Number(student?.monthlyDue || 0);
  if (!(due > 0)) return null;

  const schoolMonths = buildSchoolYearMonthKeys();
  if (!schoolMonths.length) return null;
  const tuition = await getDefaultTuitionFeeType();
  const tuitionId = Number(tuition?.id || 0);
  const tuitionLabels = getTuitionLabelCandidates();
  const tuitionRowsRes = await pgPool.query(
    `SELECT COALESCE("paidForMonth","monthKey") AS "monthKey", COALESCE(SUM(amount), 0) AS paid
     FROM payments
     WHERE "studentId" = $1
       AND COALESCE("paidForMonth","monthKey") = ANY($2::text[])
       AND (
         ($3 > 0 AND "feeTypeId" = $3)
         OR ("feeTypeId" IS NULL AND LOWER(COALESCE("feeType", '')) = ANY($4::text[]))
       )
     GROUP BY COALESCE("paidForMonth","monthKey")`,
    [student.id, schoolMonths, tuitionId, tuitionLabels]
  );
  const tuitionRows = tuitionRowsRes.rows || [];
  const paidMap = new Map(tuitionRows.map((r) => [String(r.monthKey), Number(r.paid || 0)]));

  for (const monthKey of schoolMonths) {
    const paid = paidMap.get(monthKey) || 0;
    if (paid + 0.000001 < due) return monthKey;
  }
  return null;
}
async function getFirstPendingMonthForFee(student, feeType, context = null, paymentRows = null) {
  const timeline = await getStudentFeeTimelineStatus({ student, feeType, context, paymentRows });
  return timeline?.nextDueMonth || null;
}

async function getAnnualPaymentLockStatusForCurrentSchoolYear({
  student,
  feeType,
  context = null,
  paymentRows = null,
  now = new Date()
} = {}) {
  const cycle = normalizeBillingCycle(feeType?.billingCycle);
  const defaultCurrency = normalizeCurrency(feeType?.defaultCurrency) || "USD";
  if (cycle !== "annual" || !student || !feeType) {
    return {
      locked: false,
      dueMonth: null,
      dueAmount: 0,
      remaining: 0,
      paidSoFar: 0,
      currency: defaultCurrency,
      status: "À jour",
      lastPaidAt: null
    };
  }
  const studentSchoolYearStart = parseSchoolYearStartYear(student?.schoolYearStartYear);
  const referenceMonthKey = Number.isFinite(studentSchoolYearStart)
    ? `${studentSchoolYearStart}-09`
    : getCurrentMonthKey(now);
  const dueMonth = normalizeMonthKey(feeType?.dueMonth)
    || getAnnualDueMonthForStudent({ student, monthKey: referenceMonthKey });
  if (!dueMonth) {
    return {
      locked: false,
      dueMonth: null,
      dueAmount: 0,
      remaining: 0,
      paidSoFar: 0,
      currency: defaultCurrency,
      status: "À jour",
      lastPaidAt: null
    };
  }
  const expectationContext = context || await buildStudentFeeExpectationContext({ student, feeType });
  const monthStatus = await getStudentFeeMonthStatus({
    student,
    feeType,
    monthKey: dueMonth,
    context: expectationContext,
    paymentRows
  });
  const dueAmount = Number(monthStatus?.dueAmount || 0);
  const remaining = Math.max(0, Number(monthStatus?.remaining || 0));
  const paidSoFar = Number(monthStatus?.paidSoFar || 0);
  return {
    locked: dueAmount > 0 && remaining <= 0.000001,
    dueMonth,
    dueAmount,
    remaining,
    paidSoFar,
    currency: normalizeCurrency(monthStatus?.currency) || defaultCurrency,
    status: String(monthStatus?.status || "À jour"),
    lastPaidAt: monthStatus?.lastPaidAt || null
  };
}
function getTranchePrerequisiteFeeCode(feeTypeCode) {
  const code = String(feeTypeCode || "").trim().toUpperCase();
  const match = code.match(/^ETAT_T([23])_(.+)$/);
  if (!match) return null;
  const previousTranche = Number(match[1]) - 1;
  return `ETAT_T${previousTranche}_${match[2]}`;
}
async function getTranchePrerequisiteStatus({
  student,
  feeType,
  now = new Date()
} = {}) {
  const prerequisiteFeeCode = getTranchePrerequisiteFeeCode(feeType?.code);
  if (!student || !feeType || !prerequisiteFeeCode) {
    return {
      blocked: false,
      prerequisiteFeeCode: prerequisiteFeeCode || null,
      prerequisiteFeeTypeId: null,
      prerequisiteFeeLabel: null,
      prerequisiteDueMonth: null,
      prerequisiteDueAmount: 0,
      prerequisiteRemaining: 0,
      prerequisiteCurrency: normalizeCurrency(feeType?.defaultCurrency) || "CDF"
    };
  }
  const prerequisiteFeeType = await getFeeTypeByCode(prerequisiteFeeCode, {
    schoolYearStartYear: student?.schoolYearStartYear
  });
  if (!prerequisiteFeeType) {
    return {
      blocked: false,
      prerequisiteFeeCode,
      prerequisiteFeeTypeId: null,
      prerequisiteFeeLabel: null,
      prerequisiteDueMonth: null,
      prerequisiteDueAmount: 0,
      prerequisiteRemaining: 0,
      prerequisiteCurrency: "CDF"
    };
  }
  const prerequisiteContext = await buildStudentFeeExpectationContext({
    student,
    feeType: prerequisiteFeeType
  });
  const lock = await getAnnualPaymentLockStatusForCurrentSchoolYear({
    student,
    feeType: prerequisiteFeeType,
    context: prerequisiteContext,
    now
  });
  const prerequisiteDueAmount = Number(lock?.dueAmount || 0);
  const prerequisiteRemaining = Math.max(0, Number(lock?.remaining || 0));
  const blocked = prerequisiteDueAmount > 0 && prerequisiteRemaining > 0.000001;
  return {
    blocked,
    prerequisiteFeeCode,
    prerequisiteFeeTypeId: prerequisiteFeeType.id || null,
    prerequisiteFeeLabel: prerequisiteFeeType.labelFr || null,
    prerequisiteDueMonth: lock?.dueMonth || null,
    prerequisiteDueAmount,
    prerequisiteRemaining,
    prerequisiteCurrency: lock?.currency || normalizeCurrency(prerequisiteFeeType.defaultCurrency) || "CDF"
  };
}

function makePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}
function verifyPassword(password, passwordHash) {
  const parts = String(passwordHash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  } catch (_) {
    return false;
  }
}
function b64url(data) {
  return Buffer.from(data).toString("base64url");
}
function signToken(payload) {
  const json = JSON.stringify(payload);
  const body = b64url(json);
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload || typeof payload !== "object") return null;
  if (!payload.exp || Date.now() > Number(payload.exp)) return null;
  return payload;
}
function readAuthToken(req) {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}
function requireAuth(req, res, next) {
  if (req.session?.user) {
    req.auth = {
      sub: String(req.session.user.id),
      username: req.session.user.username,
      role: req.session.user.role
    };
    return next();
  }
  const token = readAuthToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.auth = payload;
      return next();
    }
  }
  return res.status(401).json({ error: "Non autorisé" });
}
function requireRole(...roles) {
  const allowed = new Set(roles.map((r) => String(r).toLowerCase()));
  return (req, res, next) => {
    const role = String(req.auth?.role || "").toLowerCase();
    if (!allowed.has(role)) return res.status(403).json({ error: "Accès interdit" });
    next();
  };
}
function requireSessionAuthPage(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith("/api/")) return next();
  return res.status(401).send(renderLoginPageHtml(req.originalUrl || "/"));
}
async function writeAudit({ actorId = null, actorUsername = null, actorRole = null, action, entityType, entityId = null, details = null }) {
  try {
    await run(
      `INSERT INTO audit_logs ("actorId", "actorUsername", "actorRole", action, "entityType", "entityId", details, "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
      [
        actorId,
        actorUsername,
        actorRole,
        String(action || ""),
        String(entityType || ""),
        entityId == null ? null : String(entityId),
        details == null ? null : JSON.stringify(details),
        nowIso()
      ]
    );
  } catch (_) {
    // Never block main flow due to audit write failure.
  }
}

function execFileAsync(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

const PUBLIC_DIR = path.join(__dirname, "..", "Public");
// Inline the shared palette on the session-gated sign-in page; no public asset exception.
const LOGIN_THEME_CSS = fs.readFileSync(path.join(PUBLIC_DIR, "app-theme.css"), "utf8");
const CERT_DIR = path.join(__dirname, "..", "certs");
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(CERT_DIR, "key.pem");
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(CERT_DIR, "cert.pem");
const SSL_ENABLED = fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH);

const sessionStore = new PgSessionStore({
  pool: pgPool,
  tableName: "user_sessions",
  createTableIfMissing: true
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || AUTH_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: SSL_ENABLED,
    maxAge: 12 * 60 * 60 * 1000
  }
}));

// Lightweight in-process API telemetry for the admin health dashboard.
// Keep only a small rolling window and never record request bodies or student data.
const HEALTH_METRIC_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const healthMetricBuckets = new Map();

function pruneHealthMetricBuckets(now = Date.now()) {
  const cutoffMinute = Math.floor((now - HEALTH_METRIC_RETENTION_MS) / 60000);
  for (const minute of healthMetricBuckets.keys()) {
    if (minute < cutoffMinute) healthMetricBuckets.delete(minute);
  }
}

function recordHealthRequestMetric(durationMs, statusCode) {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const bucket = healthMetricBuckets.get(minute) || { count: 0, errors5xx: 0, durations: [] };
  bucket.count += 1;
  if (Number(statusCode || 0) >= 500) bucket.errors5xx += 1;
  if (bucket.durations.length < 2000) bucket.durations.push(Math.max(0, Number(durationMs || 0)));
  healthMetricBuckets.set(minute, bucket);
  if (healthMetricBuckets.size > 11000) pruneHealthMetricBuckets(now);
}

function summarizeHealthRequestMetrics(periodMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  const cutoffMinute = Math.floor((now - Math.max(60000, Number(periodMs || 0))) / 60000);
  let count = 0;
  let errors5xx = 0;
  const durations = [];
  for (const [minute, bucket] of healthMetricBuckets.entries()) {
    if (minute < cutoffMinute) continue;
    count += Number(bucket.count || 0);
    errors5xx += Number(bucket.errors5xx || 0);
    durations.push(...(bucket.durations || []));
  }
  durations.sort((a, b) => a - b);
  const percentile = (p) => {
    if (!durations.length) return null;
    const index = Math.min(durations.length - 1, Math.max(0, Math.ceil(durations.length * p) - 1));
    return Number(durations[index].toFixed(1));
  };
  return {
    requestCount: count,
    errors5xx,
    errorRatePercent: count ? Number(((errors5xx / count) * 100).toFixed(3)) : 0,
    latencyP50Ms: percentile(0.5),
    latencyP95Ms: percentile(0.95),
    latencyMaxMs: durations.length ? Number(durations[durations.length - 1].toFixed(1)) : null
  };
}

app.use((req, res, next) => {
  const requestPath = String(req.path || "");
  if (!requestPath.startsWith("/api/") || requestPath === "/api/health" || requestPath === "/api/admin/system-health") {
    return next();
  }
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    recordHealthRequestMetric(durationMs, res.statusCode);
  });
  next();
});

// Keep hot GET caches coherent after successful API writes.
app.use((req, res, next) => {
  if (!String(req.path || "").startsWith("/api/")) return next();
  const method = String(req.method || "").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  res.on("finish", () => {
    if (res.statusCode < 500) {
      purgeHotApiCache();
      // Settings writes are infrequent; this keeps readers fresh without extra branching.
      invalidateSettingsRuntimeCache();
    }
  });
  next();
});

function renderLoginPageHtml(nextPath = "/", initialMessage = "") {
  const safeNext = String(nextPath || "/").startsWith("/") ? String(nextPath || "/") : "/";
  const safeMessage = String(initialMessage || "").slice(0, 240);
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connexion — Gestion Scolaire</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--text);display:grid;place-items:center;min-height:100vh}
    .card{width:min(92vw,420px);background:var(--panel);border:1px solid var(--border-strong);border-radius:16px;padding:18px 18px 16px;box-shadow:0 12px 28px rgba(17,24,39,.08)}
    h1{margin:0 0 12px;font-size:22px;color:var(--heading)}
    label{display:block;font-size:14px;font-weight:700;color:var(--muted);margin:10px 0 6px}
    input{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid var(--border-strong);font:inherit}
    button{margin-top:12px;width:100%;padding:12px;border:0;border-radius:12px;background:var(--action);color:var(--on-action);font-weight:800;cursor:pointer}
    .msg{min-height:18px;margin-top:10px;font-size:14px;color:var(--danger);font-weight:700}
    .hint{margin-top:8px;font-size:13px;color:var(--muted)}
  </style>
  <style media="screen">${LOGIN_THEME_CSS}</style>
</head>
<body>
  <form class="card" id="loginForm">
    <h1>Connexion</h1>
    <label for="u">Utilisateur</label>
    <input id="u" autocomplete="username" />
    <label for="p">Mot de passe</label>
    <input id="p" type="password" autocomplete="current-password" />
    <button type="submit">Se connecter</button>
    <div id="msg" class="msg"></div>
    <div class="hint">Accès privé. Authentification requise.</div>
  </form>
  <script>
    const form=document.getElementById('loginForm');
    const msg=document.getElementById('msg');
    const initialMessage=${JSON.stringify(safeMessage)};
    if(initialMessage) msg.textContent=initialMessage;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent='';
      const username=document.getElementById('u').value.trim();
      const password=document.getElementById('p').value;
      try{
        const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({username,password})});
        const data=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(data.error||'Échec de connexion');
        location.href=${JSON.stringify(safeNext)};
      }catch(err){ msg.textContent=String(err.message||err); }
    });
  </script>
</body>
</html>`;
}

/* =========================
   API Routes
========================= */

// Health
app.get("/api/health", (req, res) => {
  // Process liveness must not queue behind a large result set or an exhausted
  // database pool. /api/admin/system-health retains the explicit DB probe.
  res.json({
    ok: true,
    time: nowIso(),
    dbClient: DB_CLIENT,
    databaseCheck: "system-health",
    appReadOnly: APP_READ_ONLY
  });
});

async function getDiskHealth(targetPath) {
  try {
    if (typeof fs.promises.statfs !== "function") return null;
    const stats = await fs.promises.statfs(targetPath);
    const blockSize = Number(stats.bsize || 0);
    const totalBytes = blockSize * Number(stats.blocks || 0);
    const freeBytes = blockSize * Number(stats.bavail || stats.bfree || 0);
    if (!(totalBytes > 0)) return null;
    return {
      totalBytes,
      freeBytes,
      freePercent: Number(((freeBytes / totalBytes) * 100).toFixed(1))
    };
  } catch (_) {
    return null;
  }
}

async function collectCurrentSystemHealth() {
  const dbStarted = process.hrtime.bigint();
  let dbOk = false;
  let dbError = null;
  try {
    await pgPool.query("SELECT 1");
    dbOk = true;
  } catch (error) {
    dbError = String(error?.message || error || "Database unavailable").slice(0, 240);
  }
  const dbLatencyMs = Number((Number(process.hrtime.bigint() - dbStarted) / 1e6).toFixed(1));
  const memory = process.memoryUsage();
  const disk = await getDiskHealth(process.cwd());
  const metrics = {
    oneHour: summarizeHealthRequestMetrics(60 * 60 * 1000),
    twentyFourHours: summarizeHealthRequestMetrics(24 * 60 * 60 * 1000),
    sevenDays: summarizeHealthRequestMetrics(7 * 24 * 60 * 60 * 1000)
  };
  return {
    status: dbOk ? "healthy" : "offline",
    checkedAtUtc: nowIso(),
    environment: APP_READ_ONLY ? "lecture-seule" : "local",
    app: {
      ok: true,
      readOnly: APP_READ_ONLY,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid
    },
    database: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
    memory: {
      rssBytes: Number(memory.rss || 0),
      heapUsedBytes: Number(memory.heapUsed || 0),
      heapTotalBytes: Number(memory.heapTotal || 0)
    },
    host: {
      hostname: os.hostname(),
      platform: process.platform,
      loadAverage1m: Number((os.loadavg?.()[0] || 0).toFixed(2)),
      disk
    },
    metrics
  };
}

app.get("/api/admin/system-health", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const current = await collectCurrentSystemHealth();
    res.json({
      ok: true,
      generatedAtUtc: nowIso(),
      local: current
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

// Auth
app.post("/api/auth/login", async (req, res) => {
  try {
    const usernameInput = String(req.body.username || "").trim();
    const username = usernameInput.toLowerCase();
    const password = String(req.body.password || "");
    if (!username || !password) {
      return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
    }

    const user = await get(
      `SELECT id, username, "passwordHash", role, "isActive"
       FROM users
       WHERE LOWER(username) = LOWER(?)`,
      [username]
    );
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };
    await writeAudit({
      actorId: user.id,
      actorUsername: user.username,
      actorRole: user.role,
      action: "login",
      entityType: "auth",
      entityId: String(user.id),
      details: { username: user.username }
    });
    res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const current = req.auth || req.session?.user || null;
  req.session.destroy((destroyErr) => {
    if (destroyErr) {
      res.clearCookie("connect.sid");
      return res.status(500).json({ error: "Échec de la déconnexion" });
    }
    Promise.resolve()
      .then(async () => {
        if (current) {
          await writeAudit({
            actorId: current.sub || current.id,
            actorUsername: current.username,
            actorRole: current.role,
            action: "logout",
            entityType: "auth",
            entityId: String(current.sub || current.id || ""),
            details: { username: current.username }
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.auth.sub,
      username: req.auth.username,
      role: req.auth.role
    }
  });
});

function getServerNetworkAddresses() {
  const rows = [];
  for (const [adapterName, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = typeof entry.family === "string" ? entry.family : Number(entry.family) === 4 ? "IPv4" : "";
      const address = String(entry.address || "").trim();
      if (family !== "IPv4" || entry.internal || !address || address.startsWith("169.254.")) continue;
      const virtualAdapter = /virtual|vethernet|wsl|docker|hyper-v|vmware|loopback/i.test(adapterName);
      const privateRank = address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 3;
      rows.push({ address, rank: privateRank + (virtualAdapter ? 10 : 0) });
    }
  }
  return [...new Map(rows.sort((a, b) => a.rank - b.rank).map((row) => [row.address, row.address])).values()];
}

function businessDateISO(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

app.get("/api/server-info", requireAuth, (req, res) => {
  const addresses = getServerNetworkAddresses();
  const protocol = SSL_ENABLED ? "https" : "http";
  const port = SSL_ENABLED ? SSL_PORT : Number(PORT);
  res.json({
    addresses,
    port,
    businessTimezone: BUSINESS_TIMEZONE,
    businessDate: businessDateISO(),
    urls: addresses.map((address) => `${protocol}://${address}:${port}`)
  });
});

const featureRouteDeps = {
  requireAuth,
  requireRole,
  all,
  get,
  run,
  pgPool,
  writeAudit,
  schoolYearLabelFromStartYear,
  parseSchoolYearStartYear,
  getSchoolYearStartYearSetting,
  getLevelMonthlyDueSetting,
  ensureLevelMonthlyDueSettingForSchoolYear,
  invalidateSettingsRuntimeCache,
  purgeHotApiCache,
  normalizeLevelMonthlyDueConfig,
  recalculateLevelFeesEverywhere,
  snapshotExistingPaymentDues,
  normalizeFeeCode,
  normalizeFeeLabel,
  normalizeCurrency,
  normalizeBillingCycle,
  normalizeMonthKey,
  getStudentBusSubscription,
  getStudentBusPricing,
  getStudentTuitionBenefit,
  syncStudentTuitionBenefitPayments,
  getFeeTypeByCode,
  ensureFeeTypesForSchoolYear,
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
  normalizeClientRequestId,
  normalizeFeeType,
  getFirstPendingMonthForFee,
  convertAmountByFx,
  paymentRecordToReceiptJson,
  cacheKeyForApi,
  getCachedHotApiValue,
  buildReceiptNoFromPaymentRow,
  buildReceiptNoForYearSeq,
  getReceiptYearFromSchoolYearStartYear,
  peekNextReceiptNumberForSchoolYear,
  reserveNextReceiptNumberForSchoolYear,
  configuration,
  BUSINESS_TIMEZONE,
  getStudentFeeExpectedForMonth,
  isBusSubscriptionActiveForMonth
};

// All remaining API routes require authentication.
app.use("/api", (req, res, next) => {
  if (
    req.path === "/health" ||
    req.path === "/auth/login" ||
    req.path === "/auth/me" ||
    req.path === "/auth/logout" ||
    req.path === "/print/printers" ||
    req.path === "/print/receipt"
  ) {
    return next();
  }
  return requireAuth(req, res, next);
});

const READ_ONLY_MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_ONLY_ALLOWED_MUTATION_PATHS = new Set([
  "/auth/login",
  "/auth/logout"
]);

app.use("/api", (req, res, next) => {
  if (!APP_READ_ONLY) return next();
  const method = String(req.method || "").toUpperCase();
  if (!READ_ONLY_MUTATION_METHODS.has(method)) return next();
  if (READ_ONLY_ALLOWED_MUTATION_PATHS.has(req.path)) return next();
  return res.status(403).json({
    error: "Instance en lecture seule: les modifications sont desactivees sur ce serveur."
  });
});

app.get("/api/audit", requireAuth, requireRole("admin", "comptable"), async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;
    const rows = await all(
      `SELECT id, "actorId", "actorUsername", "actorRole", action, "entityType", "entityId", details, "createdAt"
       FROM audit_logs
       ORDER BY "createdAt" DESC
       LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/audit/manual", requireAuth, async (req, res) => {
  try {
    const action = String(req.body?.action || "").trim();
    const entityType = String(req.body?.entityType || "").trim();
    const entityId = req.body?.entityId == null ? null : String(req.body.entityId);
    const details = req.body?.details ?? null;
    if (!action || !entityType) {
      return res.status(400).json({ error: "action et entityType sont requis" });
    }
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action,
      entityType,
      entityId,
      details
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Admin user management
app.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, username, role, "isActive", "createdAt"
       FROM users
       ORDER BY username ASC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = normalizeRole(req.body.role);
    if (!username) return res.status(400).json({ error: "Nom d'utilisateur requis" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }
    if (!role) return res.status(400).json({ error: "Le rôle doit être admin|caissier|comptable" });

    const exists = await get(`SELECT id FROM users WHERE username = ?`, [username]);
    if (exists) return res.status(409).json({ error: "Ce nom d'utilisateur existe déjà" });

    await run(
      `INSERT INTO users (username, "passwordHash", role, "isActive", "createdAt")
       VALUES (?, ?, ?, TRUE, ?)`,
      [username, makePasswordHash(password), role, nowIso()]
    );
    const created = await get(
      `SELECT id, username, role, "isActive", "createdAt"
       FROM users
       WHERE username = ?`,
      [username]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "create",
      entityType: "user",
      entityId: String(created.id),
      details: { username, role }
    });
    res.json(created);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id requis" });

    const existing = await get(
      `SELECT id, username, role, "isActive"
       FROM users
       WHERE id = ?`,
      [id]
    );
    if (!existing) return res.status(404).json({ error: "Utilisateur introuvable" });

    const role = req.body.role != null ? normalizeRole(req.body.role) : existing.role;
    const isActive = req.body.isActive != null ? Boolean(req.body.isActive) : Boolean(existing.isActive);
    if (!role) return res.status(400).json({ error: "Le rôle doit être admin|caissier|comptable" });
    if (String(existing.id) === String(req.auth?.sub) && isActive === false) {
      return res.status(400).json({ error: "Vous ne pouvez pas désactiver votre propre compte" });
    }

    await run(
      `UPDATE users
       SET role = ?, "isActive" = ?
       WHERE id = ?`,
      [role, isActive, id]
    );
    const updated = await get(
      `SELECT id, username, role, "isActive", "createdAt"
       FROM users
       WHERE id = ?`,
      [id]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "update",
      entityType: "user",
      entityId: String(id),
      details: {
        before: { role: existing.role, isActive: existing.isActive },
        after: { role, isActive }
      }
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const password = String(req.body.password || "");
    if (!id) return res.status(400).json({ error: "id requis" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }
    const existing = await get(`SELECT id, username FROM users WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Utilisateur introuvable" });

    await run(
      `UPDATE users
       SET "passwordHash" = ?
       WHERE id = ?`,
      [makePasswordHash(password), id]
    );
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "reset-password",
      entityType: "user",
      entityId: String(id),
      details: { username: existing.username }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id requis" });

    const existing = await get(
      `SELECT id, username, role, "isActive"
       FROM users
       WHERE id = ?`,
      [id]
    );
    if (!existing) return res.status(404).json({ error: "Utilisateur introuvable" });

    if (String(existing.id) === String(req.auth?.sub)) {
      return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
    }

    if (String(existing.role || "").toLowerCase() === "admin" && Boolean(existing.isActive)) {
      const admins = await get(
        `SELECT COUNT(*)::int AS c
         FROM users
         WHERE role = 'admin' AND "isActive" = TRUE`
      );
      if (Number(admins?.c || 0) <= 1) {
        return res.status(400).json({ error: "Impossible de supprimer le dernier admin actif" });
      }
    }

    await run(`DELETE FROM users WHERE id = ?`, [id]);
    await writeAudit({
      actorId: req.auth?.sub,
      actorUsername: req.auth?.username,
      actorRole: req.auth?.role,
      action: "delete",
      entityType: "user",
      entityId: String(id),
      details: { username: existing.username, role: existing.role, isActive: existing.isActive }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

require("./routes/control-center.routes")(app, { configuration, pgPool, requireAuth, requireRole, getSchoolYearStartYearSetting, schoolYearLabelFromStartYear, getServerNetworkAddresses, BUSINESS_TIMEZONE });

app.use("/api", require("./config/capabilities").capabilityMiddleware(configuration));
featureRouteDeps.configuration = configuration;
registerSettingsRoutes(app, featureRouteDeps);

registerStudentsRoutes(app, featureRouteDeps);

registerPaymentsRoutes(app, featureRouteDeps);

registerReportsRoutes(app, featureRouteDeps);
require("./routes/custom-reports.routes")(app, featureRouteDeps);

registerClosuresRoutes(app, featureRouteDeps);

registerGradesRoutes(app, featureRouteDeps);

/**
 * Local print helpers
 * - macOS/Linux: CUPS (lpstat/lp)
 * - Windows: PowerShell (Win32_Printer + Out-Printer)
 */
function normalizePrinterName(value) {
  return String(value == null ? "" : value).trim();
}

function uniquePrinters(values) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const name = normalizePrinterName(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function isVirtualPdfLikePrinter(name) {
  const value = normalizePrinterName(name).toLowerCase();
  if (!value) return false;
  return /(print\s*to\s*pdf|save\s*as\s*pdf|microsoft\s*print\s*to\s*pdf|adobe\s*pdf|pdfcreator|pdf24|foxit\s*pdf|xps|onenote|fax)/i.test(
    value
  );
}

function parseJsonFromOutput(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

async function runPowerShell(script, { timeoutMs = 10000, envPatch = {} } = {}) {
  const encoded = Buffer.from(String(script || ""), "utf16le").toString("base64");
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encoded
  ];
  const commands = ["powershell.exe", "powershell"];
  let lastErr = null;
  for (const cmd of commands) {
    try {
      return await execFileAsync(cmd, args, {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, ...envPatch }
      });
    } catch (err) {
      if (String(err?.code || "") === "ENOENT") {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("PowerShell introuvable.");
}

async function listPrintersCups() {
  let printers = [];
  let defaultPrinter = "";
  try {
    const { stdout } = await execFileAsync("lpstat", ["-p"], { timeout: 7000, maxBuffer: 1024 * 1024 });
    printers = String(stdout || "")
      .split("\n")
      .map((line) => line.match(/^printer\s+([^\s]+)/))
      .filter(Boolean)
      .map((m) => m[1]);
  } catch (_) {
    printers = [];
  }
  try {
    const { stdout } = await execFileAsync("lpstat", ["-d"], { timeout: 7000, maxBuffer: 1024 * 1024 });
    const m = String(stdout || "").match(/system default destination:\s*(.+)\s*$/i);
    defaultPrinter = m ? normalizePrinterName(m[1]) : "";
  } catch (_) {
    defaultPrinter = "";
  }
  return { printers: uniquePrinters(printers), defaultPrinter };
}

async function listPrintersWindows() {
  const script = `
$ErrorActionPreference = 'Stop'
$printers = @(Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name)
$defaultPrinter = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -ExpandProperty Name -First 1)
[PSCustomObject]@{
  printers = $printers
  defaultPrinter = $defaultPrinter
} | ConvertTo-Json -Compress
`;
  const { stdout } = await runPowerShell(script, { timeoutMs: 10000 });
  const parsed = parseJsonFromOutput(stdout) || {};
  const printersRaw = Array.isArray(parsed?.printers)
    ? parsed.printers
    : (parsed?.printers == null ? [] : [parsed.printers]);
  return {
    printers: uniquePrinters(printersRaw),
    defaultPrinter: normalizePrinterName(parsed?.defaultPrinter)
  };
}

async function listAvailablePrinters() {
  if (process.platform === "win32") return listPrintersWindows();
  return listPrintersCups();
}

async function printReceiptCups({ tmpFile, printer, copies }) {
  const args = [];
  if (printer) args.push("-d", printer);
  if (copies > 1) args.push("-n", String(copies));
  args.push("-o", "raw", "-t", "Gestion Scolaire Receipt", tmpFile);
  const { stdout, stderr } = await execFileAsync("lp", args, {
    timeout: 12000,
    maxBuffer: 1024 * 1024
  });
  return String(stdout || stderr || "").trim() || null;
}

async function printReceiptWindows({ tmpFile, printer, copies }) {
  const script = `
$ErrorActionPreference = 'Stop'
$path = $env:ECOLEPOS_PRINT_FILE
$printer = $env:ECOLEPOS_PRINT_PRINTER
$copiesRaw = $env:ECOLEPOS_PRINT_COPIES
if (-not (Test-Path -LiteralPath $path)) { throw "Fichier d'impression introuvable." }
[int]$copies = 1
if (-not [int]::TryParse($copiesRaw, [ref]$copies)) { $copies = 1 }
if ($copies -lt 1) { $copies = 1 }
$bytes = [System.IO.File]::ReadAllBytes($path)
if (-not $bytes -or $bytes.Length -le 0) { throw "Fichier d'impression vide." }

if (-not $printer) {
  $printer = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -ExpandProperty Name -First 1)
  if (-not $printer) { throw "Aucune imprimante par défaut disponible." }
}
$exists = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $printer } | Select-Object -First 1
if (-not $exists) { throw ("Imprimante introuvable: " + $printer) }

if (-not ("EcolePosRawPrinter" -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class EcolePosRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
"@
}

function Send-RawPrinterBytes {
  param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][byte[]]$Data,
    [Parameter(Mandatory = $true)][string]$DocName
  )

  $hPrinter = [IntPtr]::Zero
  if (-not [EcolePosRawPrinter]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)) {
    throw ("Impossible d'ouvrir l'imprimante: " + $PrinterName)
  }
  try {
    $docInfo = New-Object EcolePosRawPrinter+DOCINFO
    $docInfo.pDocName = $DocName
    $docInfo.pDataType = "RAW"

    $jobId = [EcolePosRawPrinter]::StartDocPrinter($hPrinter, 1, $docInfo)
    if ($jobId -le 0) { throw "Echec StartDocPrinter." }
    try {
      if (-not [EcolePosRawPrinter]::StartPagePrinter($hPrinter)) { throw "Echec StartPagePrinter." }
      $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($Data.Length)
      try {
        [Runtime.InteropServices.Marshal]::Copy($Data, 0, $ptr, $Data.Length)
        [int]$written = 0
        if (-not [EcolePosRawPrinter]::WritePrinter($hPrinter, $ptr, $Data.Length, [ref]$written)) {
          throw "Echec WritePrinter."
        }
        if ($written -ne $Data.Length) {
          throw ("Impression partielle envoyée: " + $written + "/" + $Data.Length + " octets.")
        }
      } finally {
        if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }
      }
      if (-not [EcolePosRawPrinter]::EndPagePrinter($hPrinter)) { throw "Echec EndPagePrinter." }
    } finally {
      [void][EcolePosRawPrinter]::EndDocPrinter($hPrinter)
    }
  } finally {
    [void][EcolePosRawPrinter]::ClosePrinter($hPrinter)
  }
}

for ($i = 0; $i -lt $copies; $i++) {
  Send-RawPrinterBytes -PrinterName $printer -Data $bytes -DocName "Gestion Scolaire Receipt"
}
Write-Output "OK"
`;
  const { stdout, stderr } = await runPowerShell(script, {
    timeoutMs: 20000,
    envPatch: {
      ECOLEPOS_PRINT_FILE: tmpFile,
      ECOLEPOS_PRINT_PRINTER: printer || "",
      ECOLEPOS_PRINT_COPIES: String(copies || 1)
    }
  });
  return String(stdout || stderr || "").trim() || null;
}

async function printReceiptLocal({ tmpFile, printer, copies }) {
  if (process.platform === "win32") {
    return printReceiptWindows({ tmpFile, printer, copies });
  }
  return printReceiptCups({ tmpFile, printer, copies });
}

function formatPrintError(err) {
  const message = String(err?.stderr || err?.stdout || err?.message || err || "").trim();
  if (String(err?.code || "") === "ENOENT") {
    return process.platform === "win32"
      ? "PowerShell introuvable. Active l'impression Windows."
      : "Commande lp introuvable. Active l'impression systeme (CUPS).";
  }
  return message || "Echec impression locale.";
}

function toThermalSafeText(input, { allowAccents = false } = {}) {
  const fallbackMapAscii = {
    "À": "A", "Á": "A", "Â": "A", "Ã": "A", "Ä": "A", "Å": "A",
    "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a",
    "Ç": "C", "ç": "c",
    "È": "E", "É": "E", "Ê": "E", "Ë": "E",
    "è": "e", "é": "e", "ê": "e", "ë": "e",
    "Ì": "I", "Í": "I", "Î": "I", "Ï": "I",
    "ì": "i", "í": "i", "î": "i", "ï": "i",
    "Ò": "O", "Ó": "O", "Ô": "O", "Õ": "O", "Ö": "O", "Ø": "O",
    "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o",
    "Ù": "U", "Ú": "U", "Û": "U", "Ü": "U",
    "ù": "u", "ú": "u", "û": "u", "ü": "u",
    "Ý": "Y", "Ÿ": "Y", "ý": "y", "ÿ": "y",
    "Ñ": "N", "ñ": "n",
    "ß": "ss",
    "Ð": "D", "ð": "d",
    "Þ": "TH", "þ": "th",
    "Œ": "OE", "œ": "oe", "Æ": "AE", "æ": "ae"
  };

  const cleaned = String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[º]/g, "°")
    .replace(/[ŒœÆæ]/g, (ch) => fallbackMapAscii[ch] || ch);

  if (allowAccents) {
    return cleaned.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, " ");
  }

  return cleaned
    .replace(/N°/g, "No")
    .replace(/n°/g, "no")
    .replace(/[°]/g, "o")
    .replace(/[ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝŸýÿÑñßÐðÞþ]/g, (ch) => fallbackMapAscii[ch] || ch)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

const ESCPOS_CODE_PAGES = Object.freeze({
  CP850: { name: "CP850", index: 2 },   // Western Europe
  CP1252: { name: "CP1252", index: 16 } // Windows Latin-1
});

// Byte mapping for CP850. Keys are Unicode chars, values are output bytes.
const CP850_BYTE_MAP = Object.freeze({
  "¡": 0xAD, "¢": 0xBD, "£": 0x9C, "¤": 0xCF, "¥": 0xBE, "¦": 0xDD, "§": 0xF5, "¨": 0xF9,
  "©": 0xB8, "ª": 0xA6, "«": 0xAE, "¬": 0xAA, "®": 0xA9, "¯": 0xEE, "°": 0xF8, "±": 0xF1,
  "²": 0xFD, "³": 0xFC, "´": 0xEF, "µ": 0xE6, "¶": 0xF4, "·": 0xFA, "¸": 0xF7, "¹": 0xFB,
  "º": 0xA7, "»": 0xAF, "¼": 0xAC, "½": 0xAB, "¾": 0xF3, "¿": 0xA8,
  "À": 0xB7, "Á": 0xB5, "Â": 0xB6, "Ã": 0xC7, "Ä": 0x8E, "Å": 0x8F, "Æ": 0x92, "Ç": 0x80,
  "È": 0xD4, "É": 0x90, "Ê": 0xD2, "Ë": 0xD3, "Ì": 0xDE, "Í": 0xD6, "Î": 0xD7, "Ï": 0xD8,
  "Ð": 0xD1, "Ñ": 0xA5, "Ò": 0xE3, "Ó": 0xE0, "Ô": 0xE2, "Õ": 0xE5, "Ö": 0x99, "×": 0x9E,
  "Ø": 0x9D, "Ù": 0xEB, "Ú": 0xE9, "Û": 0xEA, "Ü": 0x9A, "Ý": 0xED, "Þ": 0xE8, "ß": 0xE1,
  "à": 0x85, "á": 0xA0, "â": 0x83, "ã": 0xC6, "ä": 0x84, "å": 0x86, "æ": 0x91, "ç": 0x87,
  "è": 0x8A, "é": 0x82, "ê": 0x88, "ë": 0x89, "ì": 0x8D, "í": 0xA1, "î": 0x8C, "ï": 0x8B,
  "ð": 0xD0, "ñ": 0xA4, "ò": 0x95, "ó": 0xA2, "ô": 0x93, "õ": 0xE4, "ö": 0x94, "÷": 0xF6,
  "ø": 0x9B, "ù": 0x97, "ú": 0xA3, "û": 0x96, "ü": 0x81, "ý": 0xEC, "þ": 0xE7, "ÿ": 0x98
});

const CP1252_SPECIAL_BYTE_MAP = Object.freeze({
  "€": 0x80
});

function resolveEscPosCodePage(codePageRaw) {
  const raw = String(codePageRaw || process.env.ECOLEPOS_ESCPOS_CODEPAGE || "CP1252")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (raw === "CP850" || raw === "850") return ESCPOS_CODE_PAGES.CP850;
  if (raw === "CP1252" || raw === "1252" || raw === "WINDOWS1252" || raw === "WPC1252") {
    return ESCPOS_CODE_PAGES.CP1252;
  }
  return ESCPOS_CODE_PAGES.CP1252;
}

function encodeTextByCodePage(text, codePageName) {
  const bytes = [];
  let hadUnmappable = false;
  const src = String(text || "");

  for (const ch of src) {
    if (ch === "\n") {
      bytes.push(0x0A);
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\t") {
      bytes.push(0x09);
      continue;
    }

    const codePoint = ch.codePointAt(0);
    if (codePoint >= 0x20 && codePoint <= 0x7E) {
      bytes.push(codePoint);
      continue;
    }

    let encodedByte = null;
    if (codePageName === "CP850") {
      if (Object.prototype.hasOwnProperty.call(CP850_BYTE_MAP, ch)) {
        encodedByte = CP850_BYTE_MAP[ch];
      }
    } else if (codePageName === "CP1252") {
      if (Object.prototype.hasOwnProperty.call(CP1252_SPECIAL_BYTE_MAP, ch)) {
        encodedByte = CP1252_SPECIAL_BYTE_MAP[ch];
      } else {
        const codeUnit = ch.charCodeAt(0);
        if (codeUnit >= 0xA0 && codeUnit <= 0xFF) {
          encodedByte = codeUnit;
        }
      }
    }

    if (encodedByte == null) {
      hadUnmappable = true;
      continue;
    }
    bytes.push(encodedByte);
  }

  return { buffer: Buffer.from(bytes), hadUnmappable };
}

function resolveEscPosCutCommand({ cutModeRaw = "", printerName = "" } = {}) {
  const normalizeMode = (value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const modeFromBody = normalizeMode(cutModeRaw);
  const modeFromEnv = normalizeMode(process.env.ECOLEPOS_ESCPOS_CUT_MODE || "");
  const printer = String(printerName || "").trim().toLowerCase();

  const defaultMode = /eco\s*250|eco250|usb\s*receipt\s*printer/.test(printer) ? "GSVA" : "GSV0";
  const mode = modeFromBody || modeFromEnv || defaultMode;

  if (mode === "GSV1") {
    return { cutModeUsed: "GSV1", cutCommand: Buffer.from([0x1d, 0x56, 0x01]) }; // GS V 1
  }
  if (mode === "GSVA") {
    return { cutModeUsed: "GSVA", cutCommand: Buffer.from([0x1d, 0x56, 0x41, 0x03]) }; // GS V A n
  }
  if (mode === "GSVB") {
    return { cutModeUsed: "GSVB", cutCommand: Buffer.from([0x1d, 0x56, 0x42, 0x03]) }; // GS V B n
  }
  if (mode === "ESCI") {
    return { cutModeUsed: "ESCI", cutCommand: Buffer.from([0x1b, 0x69]) }; // ESC i
  }
  if (mode === "ESCM") {
    return { cutModeUsed: "ESCM", cutCommand: Buffer.from([0x1b, 0x6d]) }; // ESC m
  }
  return { cutModeUsed: "GSV0", cutCommand: Buffer.from([0x1d, 0x56, 0x00]) }; // GS V 0
}

function normalizeReceiptBarcodeValue(value) {
  const raw = String(value == null ? "" : value).trim().toUpperCase();
  if (!raw || raw.length > 64 || !/^[A-Z0-9._/-]+$/.test(raw)) return "";
  return raw;
}

function buildEscPosCode128Barcode(value) {
  const barcodeValue = normalizeReceiptBarcodeValue(value);
  if (!barcodeValue) return Buffer.alloc(0);

  // Code 128 subset B supports the receipt identifier characters. HRI text is
  // printed below the bars so the receipt number remains readable by a person.
  const barcodeData = Buffer.from(`{B${barcodeValue}`, "ascii");
  return Buffer.concat([
    Buffer.from([0x1b, 0x61, 0x01]), // ESC a 1: center
    Buffer.from([0x1d, 0x48, 0x02]), // GS H 2: HRI below barcode
    Buffer.from([0x1d, 0x68, 0x40]), // GS h 64: barcode height
    Buffer.from([0x1d, 0x77, 0x02]), // GS w 2: module width
    Buffer.from([0x1d, 0x6b, 0x49, barcodeData.length]), // GS k 73 n: Code 128
    barcodeData,
    Buffer.from([0x0a]),
    Buffer.from([0x1b, 0x61, 0x00]) // ESC a 0: restore left alignment
  ]);
}

function buildEscPosReceiptPayload(text, {
  allowAccents = false,
  codePage = "",
  cutMode = "",
  printer = "",
  barcodeValue = ""
} = {}) {
  // Thermal printers are not UTF-8 by default: we explicitly select ESC/POS
  // code page and encode bytes for that code page. If unsupported, fall back
  // to ASCII-safe text to avoid broken symbols on paper.
  const normalized = String(text || "").replace(/\r?\n/g, "\n");
  const body = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  const initCommand = Buffer.from([0x1b, 0x40]); // ESC @
  const feedBeforeCut = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, 0x0a]); // line feeds before cut
  const barcodeCommand = buildEscPosCode128Barcode(barcodeValue);
  const { cutModeUsed, cutCommand } = resolveEscPosCutCommand({ cutModeRaw: cutMode, printerName: printer });

  if (allowAccents) {
    const page = resolveEscPosCodePage(codePage);
    const encoded = encodeTextByCodePage(body, page.name);
    if (!encoded.hadUnmappable) {
      const codePageCommand = Buffer.from([0x1b, 0x74, page.index]); // ESC t n
      return {
        payload: Buffer.concat([initCommand, codePageCommand, encoded.buffer, barcodeCommand, feedBeforeCut, cutCommand]),
        codePageUsed: page.name,
        cutModeUsed,
        barcodePrinted: barcodeCommand.length > 0,
        usedAsciiFallback: false
      };
    }
  }

  const asciiBody = toThermalSafeText(body, { allowAccents: false });
  return {
    payload: Buffer.concat([initCommand, Buffer.from(asciiBody, "ascii"), barcodeCommand, feedBeforeCut, cutCommand]),
    codePageUsed: "ASCII",
    cutModeUsed,
    barcodePrinted: barcodeCommand.length > 0,
    usedAsciiFallback: Boolean(allowAccents)
  };
}

app.get("/api/print/printers", async (req, res) => {
  try {
    const data = await listAvailablePrinters();
    res.json({
      printers: uniquePrinters(data?.printers || []),
      defaultPrinter: normalizePrinterName(data?.defaultPrinter)
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/print/receipt", async (req, res) => {
  const text = String(req.body?.text || "");
  const printerRaw = req.body?.printer;
  const cutModeRaw = req.body?.cutMode;
  const barcodeValueRaw = req.body?.barcodeValue;
  const copiesRaw = Number(req.body?.copies ?? 1);
  const copies = Number.isFinite(copiesRaw) ? Math.max(1, Math.min(10, Math.floor(copiesRaw))) : 1;
  let printer = printerRaw == null ? "" : String(printerRaw).trim();
  // Keep thermal output deterministic for this deployment: force CP1252 path.
  const allowExtendedChars = true;
  const codePage = "CP1252";

  if (!text.trim()) {
    return res.status(400).json({ error: "Texte requis" });
  }
  if (text.length > 100000) {
    return res.status(400).json({ error: "Texte trop long" });
  }
  if (printer.length > 120) {
    return res.status(400).json({ error: "Nom de l'imprimante trop long" });
  }
  if (printer && isVirtualPdfLikePrinter(printer)) {
    return res.status(400).json({
      error:
        "Imprimante PDF/XPS/Fax non compatible avec l'impression thermique brute. Utilisez l'aperçu puis Imprimer > Microsoft Print to PDF."
    });
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `ecolepos-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );

  try {
    if (!printer) {
      const printersData = await listAvailablePrinters();
      const availablePrinters = uniquePrinters(printersData?.printers || []);
      const defaultPrinter = normalizePrinterName(printersData?.defaultPrinter);
      if (defaultPrinter && !isVirtualPdfLikePrinter(defaultPrinter)) {
        printer = defaultPrinter;
      } else {
        const firstPhysicalPrinter = availablePrinters.find((name) => !isVirtualPdfLikePrinter(name)) || "";
        printer = firstPhysicalPrinter;
      }
      if (!printer) {
        return res.status(400).json({
          error:
            "Aucune imprimante thermique detectee. Utilisez l'aperçu puis Imprimer > Microsoft Print to PDF pour creer un PDF valide."
        });
      }
    }

    const safeText = toThermalSafeText(text, { allowAccents: allowExtendedChars });
    const payloadData = buildEscPosReceiptPayload(safeText, {
      allowAccents: allowExtendedChars,
      codePage,
      cutMode: cutModeRaw,
      printer,
      barcodeValue: barcodeValueRaw
    });
    await fs.promises.writeFile(tmpFile, payloadData.payload);
    const job = await printReceiptLocal({ tmpFile, printer, copies });
    res.json({
      ok: true,
      job: job || null,
      printerUsed: printer || null,
      codePageUsed: payloadData.codePageUsed,
      cutModeUsed: payloadData.cutModeUsed,
      barcodePrinted: payloadData.barcodePrinted,
      usedAsciiFallback: payloadData.usedAsciiFallback
    });
  } catch (e) {
    res.status(500).json({ error: formatPrintError(e) });
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
});

/* =========================
   Static frontend (Public) — session-gated
========================= */
app.get("/login", (req, res) => {
  if (req.session?.user) return res.redirect("/");
  const nextPathRaw = typeof req.query?.next === "string" ? req.query.next : "/";
  const messageRaw = typeof req.query?.msg === "string" ? req.query.msg : "";
  return res.send(renderLoginPageHtml(nextPathRaw, messageRaw));
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.path === "/login") return next();
  if (req.session?.user) return next();
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(401).send("Non autorisé");
  return res.send(renderLoginPageHtml(req.originalUrl || "/"));
});

app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (/\.(?:html|js|css)$/i.test(String(filePath || ""))) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }
}));

app.get("/", requireSessionAuthPage, (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("Public/index.html introuvable");
});

app.get(/^(?!\/api).*/, requireSessionAuthPage, (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("Public/index.html introuvable");
});

/* =========================
   Start
========================= */
// Browsers (Chromium/Electron) reuse idle keep-alive sockets for up to ~5 minutes.
// Node's default keepAliveTimeout is 5s: the server closes the socket first and the
// next POST sent on the stale socket fails with "Failed to fetch" (browsers retry
// GETs but never POSTs). Keep server-side timeouts above the client reuse window.
function tuneHttpServer(srv) {
  srv.keepAliveTimeout = 620000;
  srv.headersTimeout = 625000;
  return srv;
}

(async () => {
  try {
    await initDb();
    startTuitionBenefitMonthlySync();
    if (SSL_ENABLED) {
      const key = fs.readFileSync(SSL_KEY_PATH);
      const cert = fs.readFileSync(SSL_CERT_PATH);
      tuneHttpServer(https.createServer({ key, cert }, app)).listen(SSL_PORT, "0.0.0.0", () => {
        console.log(`✅ HTTPS server running on https://0.0.0.0:${SSL_PORT}`);
      });

      if (FORCE_HTTPS_REDIRECT) {
        http.createServer((req, res) => {
          const hostRaw = String(req.headers.host || `0.0.0.0:${PORT}`);
          const hostNoPort = hostRaw.replace(/:\d+$/, "");
          const location = `https://${hostNoPort}:${SSL_PORT}${req.url || "/"}`;
          res.statusCode = 302;
          res.setHeader("Location", location);
          res.end();
        }).listen(PORT, "0.0.0.0", () => {
          console.log(`↪️  HTTP redirect enabled on http://0.0.0.0:${PORT} -> https://0.0.0.0:${SSL_PORT}`);
        });
      } else {
        tuneHttpServer(http.createServer(app)).listen(PORT, "0.0.0.0", () => {
          console.log(`✅ HTTP server running on http://0.0.0.0:${PORT}`);
        });
      }
    } else {
      tuneHttpServer(http.createServer(app)).listen(PORT, "0.0.0.0", () => {
        console.log(`✅ Serveur démarré sur http://0.0.0.0:${PORT}`);
      });
    }
    console.log(`🗄️  DB Client: postgres`);
    console.log(`🧭 PGHOST=${process.env.PGHOST || "127.0.0.1"}`);
    console.log(`🧭 PGDATABASE=${process.env.PGDATABASE || "ecolepos"}`);
    console.log(`👀 APP_READ_ONLY=${APP_READ_ONLY ? "1" : "0"}`);
    console.log(`🔒 SSL enabled: ${SSL_ENABLED ? "yes" : "no"} (${SSL_CERT_PATH})`);
    console.log(`💡 Self-signed dev cert example: openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/key.pem -out certs/cert.pem -days 365 -subj "/CN=localhost"`);
    console.log(`🖥️  Frontend: ${PUBLIC_DIR}`);
  } catch (e) {
    console.error("❌ Échec du démarrage du serveur :", e);
    process.exit(1);
  }
})();
