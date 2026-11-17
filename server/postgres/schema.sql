-- PostgreSQL schema for Gestion Scolaire
-- Core runtime schema used by server/server.js

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  matricule TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('maternelle', 'primaire', 'secondaire')),
  "className" TEXT NOT NULL,
  sex TEXT CHECK (sex IN ('M','F')),
  "dateOfBirth" DATE,
  "monthlyDue" NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'CDF')),
  "parentName" TEXT,
  "parentPhone" TEXT,
  "parentPhoneAlt" TEXT,
  "familyId" TEXT,
  "familyName" TEXT,
  "address" TEXT,
  "emergencyContact" TEXT,
  "studentNote" TEXT,
  "inactiveReasonCategory" TEXT,
  "inactiveReasonNote" TEXT,
  "inactiveAt" TIMESTAMPTZ,
  "inactiveByUserId" BIGINT,
  "inactiveByUsername" TEXT,
  "schoolYearStartYear" INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::int,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  "studentMatriculeSnapshot" TEXT,
  "monthKey" TEXT NOT NULL CHECK ("monthKey" ~ '^[0-9]{4}-[0-9]{2}$'),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'CDF')),
  "amountUSDReceived" NUMERIC(12,2),
  "amountCDFReceived" NUMERIC(14,2),
  "feeType" TEXT NOT NULL DEFAULT 'Frais de scolarité',
  note TEXT,
  "cancelledAt" TIMESTAMPTZ,
  "cancelledByUserId" BIGINT,
  "cancelledByUsername" TEXT,
  "cancellationReason" TEXT,
  "cancelledAmount" NUMERIC(12,2),
  "dueAmountSnapshot" NUMERIC(12,2),
  "dueCurrencySnapshot" TEXT CHECK ("dueCurrencySnapshot" IS NULL OR "dueCurrencySnapshot" IN ('USD','CDF')),
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments ("studentId");
CREATE INDEX IF NOT EXISTS idx_payments_month_key ON payments ("monthKey");
CREATE INDEX IF NOT EXISTS idx_students_created_at ON students ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments ("createdAt" DESC);

-- Stable identity for every cashier workstation. The browser/Electron client
-- keeps deviceKey locally; the server owns the human-readable C01/C02 code.
CREATE TABLE IF NOT EXISTS receipt_devices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "deviceKey" TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  label TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_device_counters (
  "deviceId" BIGINT NOT NULL REFERENCES receipt_devices(id) ON DELETE RESTRICT,
  "receiptYear" INTEGER NOT NULL,
  "lastSeq" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("deviceId", "receiptYear")
);

-- One overall percentage per student and academic period. Primary school uses
-- periods 1-6; secondary school uses periods 1-4 (enforced by the API because
-- the valid range depends on the student's level).
CREATE TABLE IF NOT EXISTS student_grades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  "schoolYearStartYear" INTEGER NOT NULL,
  period SMALLINT NOT NULL CHECK (period BETWEEN 1 AND 6),
  score NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  "updatedByUserId" BIGINT,
  "updatedByUsername" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("studentId", "schoolYearStartYear", period)
);

CREATE INDEX IF NOT EXISTS idx_student_grades_year_period
  ON student_grades ("schoolYearStartYear", period);
CREATE INDEX IF NOT EXISTS idx_student_grades_student
  ON student_grades ("studentId");

CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','caissier','comptable')),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "actorId" BIGINT,
  "actorUsername" TEXT,
  "actorRole" TEXT,
  action TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  details JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
