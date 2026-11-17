"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");
const { Client } = require("pg");
const { isReturningStudentMatch } = require("../student-returning");

const SERVER_DIR = path.resolve(__dirname, "..");
const SERVER_ENTRY = path.join(SERVER_DIR, "server.js");

const ADMIN_USER = process.env.TEST_ADMIN_USER || process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || process.env.ADMIN_PASS || "admin123";

let baseUrl = "";
let serverPort = 0;
let serverProcess = null;
let serverLogs = "";

test("returning student matching accepts a prior name without prenom", () => {
  assert.equal(
    isReturningStudentMatch(
      { id: "CURRENT", matricule: "CURRENT", fullName: "KABONGO MBUYI Jean", sex: "M" },
      { id: "PREVIOUS", matricule: "PREVIOUS", fullName: "MBUYI KABONGO", sex: "M" }
    ),
    true
  );
  assert.equal(
    isReturningStudentMatch(
      { id: "CURRENT", matricule: "CURRENT", fullName: "KABONGO MBUYI Jean", sex: "M" },
      { id: "PREVIOUS", matricule: "PREVIOUS", fullName: "KABONGO MBUYI", sex: "F" }
    ),
    true,
    "Incorrect legacy sex data must not prevent a name match"
  );
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad2(v) {
  return String(v).padStart(2, "0");
}

function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function addDaysISO(dateIso, days) {
  const m = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0)));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function uniqueToken(prefix = "T") {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to reserve a free port")));
        return;
      }
      const port = address.port;
      server.close((err) => {
        if (err) return reject(err);
        resolve(port);
      });
    });
  });
}

async function waitForHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.status === 200) return;
      lastError = new Error(`health status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(200);
  }
  throw new Error(`Server did not become healthy in ${timeoutMs}ms: ${lastError ? lastError.message : "unknown error"}`);
}

async function startServer() {
  serverPort = await getFreePort();
  baseUrl = `http://127.0.0.1:${serverPort}`;
  serverLogs = "";

  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(serverPort),
      FORCE_HTTPS_REDIRECT: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => {
    serverLogs += String(chunk);
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverLogs += String(chunk);
  });

  await waitForHealth(baseUrl, 35000);
}

async function stopServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;

  if (proc.exitCode != null) return;

  const waited = new Promise((resolve) => proc.once("exit", resolve));
  proc.kill("SIGINT");
  const timeout = sleep(5000).then(() => "timeout");
  const result = await Promise.race([waited, timeout]);
  if (result === "timeout" && proc.exitCode == null) {
    proc.kill("SIGKILL");
    await waited;
  }
}

class ApiClient {
  constructor(url) {
    this.url = url;
    this.cookies = new Map();
  }

  cookieHeader() {
    const parts = [];
    for (const [name, value] of this.cookies.entries()) {
      parts.push(`${name}=${value}`);
    }
    return parts.join("; ");
  }

  storeCookies(headers) {
    const rawCookies = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [];
    if (!rawCookies.length) {
      const fallback = headers.get("set-cookie");
      if (fallback) rawCookies.push(fallback);
    }
    for (const raw of rawCookies) {
      const first = String(raw || "").split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!name) continue;
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(method, apiPath, options = {}) {
    const headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };
    const cookieHeader = this.cookieHeader();
    if (cookieHeader) headers.Cookie = cookieHeader;
    let body;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const res = await fetch(`${this.url}${apiPath}`, {
      method,
      headers,
      body,
      redirect: "manual"
    });
    this.storeCookies(res.headers);
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (_) {
        json = null;
      }
    }
    return { status: res.status, text, json };
  }
}

function statusMessage(method, apiPath, res) {
  return `${method} ${apiPath} => ${res.status}\n${res.text || "<empty>"}`;
}

async function expectStatus(client, method, apiPath, expectedStatus, options = {}) {
  const res = await client.request(method, apiPath, options);
  assert.equal(res.status, expectedStatus, statusMessage(method, apiPath, res));
  return res.json;
}

async function loginAs(client, username, password) {
  const body = await expectStatus(client, "POST", "/api/auth/login", 200, {
    body: { username, password }
  });
  assert.equal(body?.ok, true, "Login should return ok=true");
  assert.ok(body?.user?.id != null, "Login should return user id");
  return body.user;
}

async function createStudent(adminClient) {
  const mk = monthKey();
  const matricule = uniqueToken("TS").replace(/[^A-Z0-9]/g, "").slice(0, 18);
  const student = await expectStatus(adminClient, "POST", "/api/students", 200, {
    body: {
      fullName: `API Test Student ${uniqueToken("S")}`,
      level: "primaire",
      className: "1e A",
      sex: "M",
      monthlyDue: 30,
      classEffectiveMonth: mk,
      matricule
    }
  });
  assert.equal(String(student?.id || ""), matricule, "Student id should match manual matricule");
  return String(student.id);
}

async function createSexLinkedStudent(adminClient, sex = "M") {
  const mk = monthKey();
  const student = await expectStatus(adminClient, "POST", "/api/students", 200, {
    body: {
      fullName: `API Sex Linked Student ${uniqueToken("S")}`,
      level: "primaire",
      className: "1e A",
      sex,
      monthlyDue: 30,
      classEffectiveMonth: mk
    }
  });
  assert.equal(String(student?.sex || "").toUpperCase(), String(sex || "").toUpperCase(), "Student sex should match the creation payload");
  assert.equal(String(student?.id || "").slice(-1).toUpperCase(), String(sex || "").toUpperCase(), "Auto-generated student id should encode sex");
  return {
    id: String(student.id || ""),
    fullName: String(student.fullName || ""),
    sex: String(student.sex || "")
  };
}

async function reserveAndCreatePayment(
  adminClient,
  studentId,
  {
    amount = 10,
    currency = "USD",
    feeCode = "TUITION",
    createdAtIso = null,
    paidForMonthOverride = null
  } = {}
) {
  const mk = String(paidForMonthOverride || monthKey());
  const receiptDeviceKey = "device:api-integration-tests";

  const createdAt = String(createdAtIso || `${localDateISO()}T12:00:00.000Z`);
  const payment = await expectStatus(adminClient, "POST", "/api/payments", 200, {
    body: {
      studentId,
      paidForMonth: mk,
      amount,
      currency,
      feeCode,
      note: "api integration test",
      receiptDeviceKey,
      forceRequestedMonth: true,
      created_at: createdAt
    }
  });
  assert.ok(payment?.id != null, "Payment id should be returned");
  assert.ok(typeof payment?.receiptNo === "string" && payment.receiptNo.length > 0, "Payment receipt number should be returned");
  return String(payment.id);
}

async function createRoleUser(adminClient, role) {
  const username = uniqueToken(`u_${role}_`).toLowerCase();
  const password = `Pwd_${Math.floor(Math.random() * 1e6)}_A`;
  const row = await expectStatus(adminClient, "POST", "/api/users", 200, {
    body: { username, password, role }
  });
  assert.equal(row?.role, role, `Expected created role ${role}`);
  return { id: String(row.id), username, password, role };
}

async function cleanupPayment(adminClient, paymentId) {
  if (!paymentId) return;
  const res = await adminClient.request("DELETE", `/api/payments/${encodeURIComponent(String(paymentId))}`);
  if (res.status !== 200 && res.status !== 404) {
    throw new Error(`cleanup payment failed: ${statusMessage("DELETE", `/api/payments/${paymentId}`, res)}`);
  }
}

async function cleanupStudent(adminClient, studentId) {
  if (!studentId) return;
  const res = await adminClient.request("DELETE", `/api/students/${encodeURIComponent(String(studentId))}`);
  if (res.status !== 200 && res.status !== 404) {
    throw new Error(`cleanup student failed: ${statusMessage("DELETE", `/api/students/${studentId}`, res)}`);
  }
}

async function cleanupSpending(adminClient, spendingId) {
  if (!spendingId) return;
  const res = await adminClient.request("DELETE", `/api/spending/${encodeURIComponent(String(spendingId))}`);
  if (res.status !== 200 && res.status !== 404) {
    throw new Error(`cleanup spending failed: ${statusMessage("DELETE", `/api/spending/${spendingId}`, res)}`);
  }
}

async function cleanupCaisseTransfer(adminClient, transferId, schoolYearStartYear = null) {
  if (!transferId) return;
  const suffix = schoolYearStartYear
    ? `?schoolYearStartYear=${encodeURIComponent(String(schoolYearStartYear))}`
    : "";
  const res = await adminClient.request("DELETE", `/api/caisse-transfers/${encodeURIComponent(String(transferId))}${suffix}`);
  if (res.status !== 200 && res.status !== 404) {
    throw new Error(`cleanup caisse transfer failed: ${statusMessage("DELETE", `/api/caisse-transfers/${transferId}`, res)}`);
  }
}

async function cleanupUser(adminClient, userId) {
  if (!userId) return;
  const res = await adminClient.request("DELETE", `/api/users/${encodeURIComponent(String(userId))}`);
  if (res.status !== 200 && res.status !== 404) {
    throw new Error(`cleanup user failed: ${statusMessage("DELETE", `/api/users/${userId}`, res)}`);
  }
}

async function withPgClient(work) {
  const client = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "ecolepos",
    user: process.env.PGUSER || "ecolepos_user",
    password: process.env.PGPASSWORD || "ecolepos_pass",
    ssl: String(process.env.PGSSL || "").toLowerCase() === "true" ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function purgeFeeTypesByCodePrefix(prefix) {
  const normalizedPrefix = String(prefix || "").trim().toUpperCase();
  if (!normalizedPrefix) return;
  await withPgClient(async (client) => {
    await client.query(
      `DELETE FROM student_fee_overrides
       WHERE "feeTypeId" IN (
         SELECT id FROM fee_types WHERE UPPER(code) LIKE $1
       )`,
      [`${normalizedPrefix}%`]
    );
    await client.query(
      `UPDATE payments
       SET "feeTypeId" = NULL
       WHERE "feeTypeId" IN (
         SELECT id FROM fee_types WHERE UPPER(code) LIKE $1
       )`,
      [`${normalizedPrefix}%`]
    );
    await client.query(
      `DELETE FROM fee_types
       WHERE UPPER(code) LIKE $1`,
      [`${normalizedPrefix}%`]
    );
  });
}

async function purgeFeeTypeByCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) return;
  await withPgClient(async (client) => {
    await client.query(
      `DELETE FROM student_fee_overrides
       WHERE "feeTypeId" IN (
         SELECT id FROM fee_types WHERE UPPER(code) = $1
       )`,
      [normalizedCode]
    );
    await client.query(
      `UPDATE payments
       SET "feeTypeId" = NULL
       WHERE "feeTypeId" IN (
         SELECT id FROM fee_types WHERE UPPER(code) = $1
       )`,
      [normalizedCode]
    );
    await client.query(
      `DELETE FROM fee_types
       WHERE UPPER(code) = $1`,
      [normalizedCode]
    );
  });
}

test.before(async () => {
  await purgeFeeTypesByCodePrefix("FT_SCOPE");
  await startServer();
});

test.after(async () => {
  await stopServer();
});

test("auth: login, me, logout, unauthorized me", { timeout: 120000 }, async () => {
  const client = new ApiClient(baseUrl);

  await expectStatus(client, "GET", "/api/auth/me", 401);

  const user = await loginAs(client, ADMIN_USER, ADMIN_PASS);
  assert.equal(String(user.role).toLowerCase(), "admin", "Test suite requires admin credentials");

  const me = await expectStatus(client, "GET", "/api/auth/me", 200);
  assert.equal(String(me?.user?.username || "").toLowerCase(), String(ADMIN_USER).toLowerCase());

  const health = await expectStatus(client, "GET", "/api/admin/system-health", 200);
  assert.equal(health?.ok, true, "Admin system health should return ok=true");
  assert.ok(health?.local, "Local execution should expose direct local health");
  assert.equal(health?.local?.database?.ok, true, "System health should verify PostgreSQL");

  await expectStatus(client, "POST", "/api/auth/logout", 200);
  await expectStatus(client, "GET", "/api/auth/me", 401);
});

test("payments + receipts: create, list, patch date, cleanup", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let paymentId = "";
  try {
    studentId = await createStudent(admin);
    paymentId = await reserveAndCreatePayment(admin, studentId);

    const payments = await expectStatus(
      admin,
      "GET",
      `/api/payments?studentId=${encodeURIComponent(studentId)}`,
      200
    );
    assert.ok(Array.isArray(payments), "Payments response should be an array");
    assert.ok(payments.some((row) => String(row?.id || "") === paymentId), "Created payment should be listed");

    const receipts = await expectStatus(
      admin,
      "GET",
      `/api/receipts?studentId=${encodeURIComponent(studentId)}`,
      200
    );
    assert.ok(Array.isArray(receipts), "Receipts response should be an array");
    const receipt = receipts.find((row) => String(row?.id || "") === paymentId);
    assert.ok(receipt, "Created payment should appear in receipts list");
    assert.ok(typeof receipt.receiptNo === "string" && receipt.receiptNo.length > 0, "Receipt number should be present");

    const patched = await expectStatus(
      admin,
      "PATCH",
      `/api/payments/${encodeURIComponent(paymentId)}`,
      200,
      { body: { createdAt: localDateISO() } }
    );
    assert.ok(String(patched?.createdAt || "").startsWith(localDateISO()), "patched createdAt should start with requested date");
  } finally {
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("receipt reclassification changes only accounting allocation and records an audit event", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  const cashier = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let paymentId = "";
  let cashierUser = null;
  try {
    const settings = await expectStatus(admin, "GET", "/api/settings", 200);
    const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    const tuitionMonth = `${schoolYearStart}-09`;
    const matricule = uniqueToken("RC").replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const student = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Receipt Correction ${uniqueToken("S")}`,
        level: "primaire",
        className: "1e A",
        sex: "M",
        monthlyDue: 30,
        classEffectiveMonth: tuitionMonth,
        matricule
      }
    });
    studentId = String(student.id || "");
    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 10,
      feeCode: "TUITION",
      paidForMonthOverride: tuitionMonth
    });
    const before = await expectStatus(admin, "GET", `/api/payments/${encodeURIComponent(paymentId)}`, 200);
    const tuitionStatusBefore = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${encodeURIComponent(String(before?.paidForMonth || ""))}`,
      200
    );
    const options = await expectStatus(admin, "GET", `/api/payments/${encodeURIComponent(paymentId)}/reclassification-options`, 200);
    const target = options?.feeTypes?.find((row) => String(row?.id || "") !== String(before?.feeTypeId || ""));
    assert.ok(target?.id, "Expected another active fee type for reclassification");

    cashierUser = await createRoleUser(admin, "caissier");
    await loginAs(cashier, cashierUser.username, cashierUser.password);
    await expectStatus(cashier, "POST", `/api/payments/${encodeURIComponent(paymentId)}/reclassify`, 403, {
      body: { feeTypeId: target.id, reason: "Unauthorized attempt" }
    });

    const corrected = await expectStatus(admin, "POST", `/api/payments/${encodeURIComponent(paymentId)}/reclassify`, 200, {
      body: { feeTypeId: target.id, reason: "Erreur de saisie du caissier" }
    });
    assert.equal(String(corrected?.feeTypeId || ""), String(target.id));
    assert.equal(corrected?.corrected, true);
    assert.equal(Number(corrected?.correctionCount || 0), 1);
    assert.equal(corrected?.latestCorrection?.oldFeeType, before?.feeType);
    assert.equal(corrected?.latestCorrection?.newFeeType, target.labelFr);
    assert.equal(corrected?.receiptDoc?.correction?.reason, "Erreur de saisie du caissier");
    assert.equal(corrected?.receiptDoc?.cashAllocation?.code, "TUITION");
    assert.equal(corrected?.receiptDoc?.cashAllocation?.label, before?.feeType);

    const paymentRows = await expectStatus(admin, "GET", `/api/payments?studentId=${encodeURIComponent(studentId)}`, 200);
    const correctedPaymentRow = paymentRows.find((row) => String(row?.id || "") === paymentId);
    assert.ok(correctedPaymentRow, "Corrected payment should remain in the payment list");
    assert.equal(String(correctedPaymentRow?.cashFeeTypeId || ""), String(before?.feeTypeId || ""));
    assert.equal(correctedPaymentRow?.cashFeeType, before?.feeType, "Payment list should expose the original caisse label");

    const tuitionStatusAfter = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${encodeURIComponent(String(before?.paidForMonth || ""))}`,
      200
    );
    assert.equal(
      Number(tuitionStatusAfter?.remaining || 0),
      Number(tuitionStatusBefore?.remaining || 0) + Number(before?.amount || 0),
      "Moving the payment away from tuition should restore that amount to the tuition balance"
    );

    for (const key of ["id", "receiptNo", "studentId", "amount", "currency", "createdAt", "paidAt", "fxRate", "amountUSDReceived", "amountCDFReceived", "paidForMonth"]) {
      assert.deepEqual(corrected?.[key], before?.[key], `${key} must remain unchanged by reclassification`);
    }

    const history = await expectStatus(admin, "GET", `/api/payments/${encodeURIComponent(paymentId)}/corrections`, 200);
    assert.equal(history.length, 1);
    assert.equal(history[0]?.reason, "Erreur de saisie du caissier");

    const listed = await expectStatus(admin, "GET", `/api/receipts?studentId=${encodeURIComponent(studentId)}`, 200);
    const listedReceipt = listed.find((row) => String(row?.id || "") === paymentId);
    assert.equal(listedReceipt?.corrected, true, "Receipt history should expose the corrected marker");
    assert.equal(String(listedReceipt?.feeTypeId || ""), String(target.id));
  } finally {
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    if (cashierUser?.id) await cleanupUser(admin, cashierUser.id);
    await cashier.request("POST", "/api/auth/logout");
    await admin.request("POST", "/api/auth/logout");
  }
});

test("payments entered before school-year start still count by paid month", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let paymentId = "";
  try {
    const settings = await expectStatus(admin, "GET", "/api/settings", 200);
    const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    const targetMonth = `${schoolYearStart}-09`;
    const preStartDate = `${schoolYearStart}-06-15`;
    const matricule = uniqueToken("SYPM").replace(/[^A-Z0-9]/g, "").slice(0, 18);

    const student = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `School Year Payment ${uniqueToken("S")}`,
        level: "primaire",
        className: "1e A",
        sex: "M",
        monthlyDue: 30,
        classEffectiveMonth: targetMonth,
        matricule
      }
    });
    studentId = String(student?.id || "");
    assert.ok(studentId, "Expected student id for school-year payment test");

    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 10,
      createdAtIso: `${preStartDate}T12:00:00.000Z`,
      paidForMonthOverride: targetMonth
    });

    const payments = await expectStatus(
      admin,
      "GET",
      `/api/payments?studentId=${encodeURIComponent(studentId)}`,
      200
    );
    const paymentRow = Array.isArray(payments)
      ? payments.find((row) => String(row?.id || "") === paymentId)
      : null;
    assert.ok(paymentRow, "Payment should still be listed in the active school year");
    assert.equal(
      String(paymentRow?.paidForMonth || paymentRow?.monthKey || ""),
      targetMonth,
      "Payment should keep the paid month inside the active school year"
    );

    const receipts = await expectStatus(
      admin,
      "GET",
      `/api/receipts?studentId=${encodeURIComponent(studentId)}`,
      200
    );
    assert.ok(
      Array.isArray(receipts) && receipts.some((row) => String(row?.id || "") === paymentId),
      "Receipt should be included even when created before the school-year start date"
    );

    const daily = await expectStatus(
      admin,
      "GET",
      `/api/reports/daily-entries?date=${encodeURIComponent(preStartDate)}`,
      200
    );
    assert.ok(
      Array.isArray(daily?.details) && daily.details.some((row) => String(row?.id || "") === paymentId),
      "Daily entries should include the payment because its paid month belongs to the active school year"
    );

    const summary = await expectStatus(
      admin,
      "GET",
      `/api/reports/summary?month=${encodeURIComponent(targetMonth)}`,
      200
    );
    const summaryRow = Array.isArray(summary?.rows)
      ? summary.rows.find((row) => String(row?.id || "") === studentId)
      : null;
    assert.ok(summaryRow, "Monthly summary should include the student for the paid month");
    assert.ok(Number(summaryRow?.paid || 0) >= 10, "Monthly summary should count the payment on the paid month");
  } finally {
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("spending: create, list filtered, delete", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let paymentId = "";
  let spendingId = "";
  try {
    studentId = await createStudent(admin);
    const settings = await expectStatus(admin, "GET", "/api/settings", 200);
    const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    const targetMonth = `${schoolYearStart}-09`;
    const isolatedDate = `${schoolYearStart}-06-15`;
    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 10,
      createdAtIso: `${isolatedDate}T12:00:00.000Z`,
      paidForMonthOverride: targetMonth
    });
    const today = isolatedDate;

    const created = await expectStatus(admin, "POST", "/api/spending", 200, {
      body: {
        date: today,
        category: "Salaire",
        amount: 5,
        currency: "USD",
        note: "api integration spending",
        appliesToMonth: targetMonth
      }
    });
    spendingId = String(created?.id || "");
    assert.ok(spendingId, "Spending id should be returned");
    assert.equal(String(created?.appliesToMonth || ""), targetMonth, "Spending should keep the selected school-month");

    const rows = await expectStatus(
      admin,
      "GET",
      `/api/spending?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`,
      200
    );
    assert.ok(Array.isArray(rows), "Spending list should be an array");
    const spendingRow = rows.find((row) => String(row?.id || "") === spendingId);
    assert.ok(spendingRow, "Created spending should be listed");
    assert.equal(String(spendingRow?.appliesToMonth || ""), targetMonth, "Spending list should expose the selected school-month");

    await expectStatus(admin, "POST", "/api/spending", 400, {
      body: {
        date: today,
        category: "Salaire",
        amount: 1,
        currency: "USD",
        note: "invalid school month",
        appliesToMonth: `${schoolYearStart}-07`
      }
    });

    await expectStatus(admin, "POST", "/api/spending", 409, {
      body: {
        date: today,
        category: "Salaire",
        amount: 50,
        currency: "USD",
        note: "must fail insufficient balance",
        appliesToMonth: targetMonth
      }
    });

    const deletedId = spendingId;
    await expectStatus(admin, "DELETE", `/api/spending/${encodeURIComponent(spendingId)}`, 200);
    spendingId = "";

    const afterRows = await expectStatus(
      admin,
      "GET",
      `/api/spending?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`,
      200
    );
    assert.ok(!afterRows.some((row) => String(row?.id || "") === deletedId), "Deleted spending should not be listed");
  } finally {
    await cleanupSpending(admin, spendingId);
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("spending balance carries over to next day", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let paymentId = "";
  let spendingId = "";
  try {
    studentId = await createStudent(admin);
    const paymentDate = "2099-01-10";
    const spendingDate = addDaysISO(paymentDate, 1);
    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 10,
      createdAtIso: `${paymentDate}T12:00:00.000Z`
    });

    const spending = await expectStatus(admin, "POST", "/api/spending", 200, {
      body: {
        date: spendingDate,
        category: "Report carryover test",
        amount: 5,
        currency: "USD",
        note: "carryover should allow next-day spending"
      }
    });
    spendingId = String(spending?.id || "");
    assert.ok(spendingId, "Spending id should be returned when using carried balance");
  } finally {
    await cleanupSpending(admin, spendingId);
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("caisse transfer funds a fee box before caisse spending is allowed", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let paymentId = "";
  let spendingId = "";
  let transferId = "";
  let schoolYearStart = null;
  try {
    const settings = await expectStatus(admin, "GET", "/api/settings", 200);
    schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    const targetMonth = `${schoolYearStart}-09`;
    const isolatedDate = `${schoolYearStart}-06-15`;
    studentId = await createStudent(admin);
    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 15,
      currency: "USD",
      feeCode: "TUITION",
      createdAtIso: `${isolatedDate}T12:00:00.000Z`,
      paidForMonthOverride: targetMonth
    });

    await expectStatus(admin, "POST", "/api/spending", 409, {
      body: {
        date: isolatedDate,
        category: "Caisse [ETAT_MINERVAL] - Minerval de l'Etat",
        caisseBoxKey: "fee_etat_minerval",
        amount: 5,
        currency: "USD",
        note: "must fail before transfer",
        appliesToMonth: targetMonth
      }
    });

    const transfer = await expectStatus(admin, "POST", "/api/caisse-transfers", 200, {
      body: {
        date: isolatedDate,
        appliesToMonth: targetMonth,
        mode: "transfer",
        sourceBoxKey: "minerval",
        counterpartyBoxKey: "fee_etat_minerval",
        sourceCurrency: "USD",
        sourceAmount: 5,
        schoolYearStartYear: schoolYearStart,
        note: "fund etat minerval caisse"
      }
    });
    transferId = String(transfer?.id || "");
    assert.ok(transferId, "Transfer id should be returned");

    const spending = await expectStatus(admin, "POST", "/api/spending", 200, {
      body: {
        date: isolatedDate,
        category: "Caisse [ETAT_MINERVAL] - Minerval de l'Etat",
        caisseBoxKey: "fee_etat_minerval",
        amount: 5,
        currency: "USD",
        note: "allowed after transfer",
        appliesToMonth: targetMonth
      }
    });
    spendingId = String(spending?.id || "");
    assert.ok(spendingId, "Caisse spending should succeed after transfer");
  } finally {
    await cleanupSpending(admin, spendingId);
    await cleanupCaisseTransfer(admin, transferId, schoolYearStart);
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("caisse exchange lets generic spending use received minerval currency", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let tuitionPaymentId = "";
  let stateMinervalPaymentId = "";
  let transferId = "";
  let spendingId = "";
  let schoolYearStart = null;
  try {
    const settings = await expectStatus(admin, "GET", "/api/settings", 200);
    schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    const targetMonth = `${schoolYearStart}-09`;
    const isolatedDate = `${schoolYearStart}-06-16`;
    studentId = await createStudent(admin);
    tuitionPaymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 10,
      currency: "USD",
      feeCode: "TUITION",
      createdAtIso: `${isolatedDate}T12:00:00.000Z`,
      paidForMonthOverride: targetMonth
    });
    stateMinervalPaymentId = await withPgClient(async (client) => {
      const feeTypeRow = await client.query(
        `SELECT id, "labelFr"
         FROM fee_types
         WHERE UPPER(code) = 'ETAT_MINERVAL'
           AND "schoolYearStartYear" = $1
         ORDER BY id DESC
         LIMIT 1`,
        [schoolYearStart]
      );
      assert.ok(feeTypeRow.rows?.[0]?.id, "Expected ETAT_MINERVAL fee type id for exchange test");
      const inserted = await client.query(
        `INSERT INTO payments (
           "studentId", "monthKey", amount, currency, "feeType",
           "feeTypeId", "paidForMonth", "createdAt"
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          studentId,
          targetMonth,
          1000,
          "CDF",
          String(feeTypeRow.rows[0].labelFr || "Minerval de l'Etat"),
          Number(feeTypeRow.rows[0].id),
          targetMonth,
          `${isolatedDate}T12:10:00.000Z`
        ]
      );
      return String(inserted.rows?.[0]?.id || "");
    });

    await expectStatus(admin, "POST", "/api/spending", 409, {
      body: {
        date: isolatedDate,
        category: "Salaire",
        amount: 500,
        currency: "CDF",
        note: "must fail before exchange",
        appliesToMonth: targetMonth
      }
    });

    const transfer = await expectStatus(admin, "POST", "/api/caisse-transfers", 200, {
      body: {
        date: isolatedDate,
        appliesToMonth: targetMonth,
        mode: "exchange",
        sourceBoxKey: "minerval",
        counterpartyBoxKey: "fee_etat_minerval",
        sourceCurrency: "USD",
        sourceAmount: 1,
        counterCurrency: "CDF",
        fxRate: 1000,
        schoolYearStartYear: schoolYearStart,
        note: "usd to cdf"
      }
    });
    transferId = String(transfer?.id || "");
    assert.ok(transferId, "Exchange id should be returned");
    assert.equal(Number(transfer?.counterAmount || 0), 1000, "Exchange should compute received CDF from the rate");

    const spending = await expectStatus(admin, "POST", "/api/spending", 200, {
      body: {
        date: isolatedDate,
        category: "Salaire",
        amount: 500,
        currency: "CDF",
        note: "allowed after exchange",
        appliesToMonth: targetMonth
      }
    });
    spendingId = String(spending?.id || "");
    assert.ok(spendingId, "Generic CDF spending should succeed after exchange into minerval");
  } finally {
    await cleanupSpending(admin, spendingId);
    await cleanupCaisseTransfer(admin, transferId, schoolYearStart);
    await cleanupPayment(admin, stateMinervalPaymentId);
    await cleanupPayment(admin, tuitionPaymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("reports: summary, late students, bus summary, daily entries", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);
  const mk = monthKey();
  const today = localDateISO();
  try {
    const summary = await expectStatus(admin, "GET", `/api/reports/summary?month=${encodeURIComponent(mk)}`, 200);
    assert.equal(summary?.monthKey, mk);
    assert.ok(Array.isArray(summary?.rows), "Summary rows should be an array");
    assert.ok(summary?.tuition && typeof summary.tuition === "object", "Summary should include tuition-only collections");
    assert.ok(Object.prototype.hasOwnProperty.call(summary.tuition, "receivedUSD"), "Tuition summary should include receivedUSD");
    assert.ok(Object.prototype.hasOwnProperty.call(summary.tuition, "receivedCDF"), "Tuition summary should include receivedCDF");
    assert.ok(Object.prototype.hasOwnProperty.call(summary.bus || {}, "collectedUSD"), "Summary bus totals should separate USD");
    assert.ok(Object.prototype.hasOwnProperty.call(summary.bus || {}, "collectedCDF"), "Summary bus totals should separate CDF");

    const late = await expectStatus(admin, "GET", `/api/reports/late-students?month=${encodeURIComponent(mk)}`, 200);
    assert.equal(late?.monthKey, mk);
    assert.ok(Array.isArray(late?.rows), "Late-students rows should be an array");

    const bus = await expectStatus(admin, "GET", `/api/reports/bus-summary?month=${encodeURIComponent(mk)}`, 200);
    assert.equal(bus?.monthKey, mk);
    assert.ok(Array.isArray(bus?.rows), "Bus summary rows should be an array");
    assert.ok(Object.prototype.hasOwnProperty.call(bus || {}, "paidCount"), "Bus summary should include paidCount");
    assert.ok(Object.prototype.hasOwnProperty.call(bus || {}, "unpaidCount"), "Bus summary should include unpaidCount");
    assert.ok(Object.prototype.hasOwnProperty.call(bus || {}, "partialCount"), "Bus summary should include partialCount");
    assert.ok(Object.prototype.hasOwnProperty.call(bus || {}, "collectedUSD"), "Bus summary should include collectedUSD");
    assert.ok(Object.prototype.hasOwnProperty.call(bus || {}, "collectedCDF"), "Bus summary should include collectedCDF");

    const duplicates = await expectStatus(admin, "GET", "/api/reports/duplicate-students", 200);
    assert.ok(Array.isArray(duplicates?.rows), "Duplicate-students report should include rows");
    assert.ok(Object.prototype.hasOwnProperty.call(duplicates || {}, "exactMatches"), "Duplicate report should include exactMatches");
    assert.ok(Object.prototype.hasOwnProperty.call(duplicates || {}, "similarMatches"), "Duplicate report should include similarMatches");

    const enrollmentStats = await expectStatus(admin, "GET", "/api/reports/enrollment-stats", 200);
    assert.ok(Object.prototype.hasOwnProperty.call(enrollmentStats || {}, "newStudents"), "Enrollment stats should include newStudents");
    assert.ok(Object.prototype.hasOwnProperty.call(enrollmentStats || {}, "returningStudents"), "Enrollment stats should include returningStudents");
    assert.ok(Object.prototype.hasOwnProperty.call(enrollmentStats || {}, "highestEnrollmentDate"), "Enrollment stats should include the peak date");

    const daily = await expectStatus(
      admin,
      "GET",
      `/api/reports/daily-entries?date=${encodeURIComponent(today)}`,
      200
    );
    assert.equal(daily?.date, today);
    assert.ok(Array.isArray(daily?.details), "Daily entries should include details array");

    const dailyCaisse = await expectStatus(admin, "GET", `/api/reports/daily-caisse-entries?date=${encodeURIComponent(today)}`, 200);
    assert.ok(Object.prototype.hasOwnProperty.call(dailyCaisse || {}, "totalStudentsEnrolled"), "Daily caisse report should include enrolled students");
    assert.ok(Object.prototype.hasOwnProperty.call(dailyCaisse || {}, "totalActiveStudents"), "Daily caisse report should include total active students");
  } finally {
    await admin.request("POST", "/api/auth/logout");
  }
});

test("report 11 keeps bus USD and CDF amounts in separate columns", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);
  let studentId = "";
  let paymentId = "";
  try {
    const settings = await expectStatus(admin, "GET", "/api/settings", 200);
    const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    const targetMonth = `${schoolYearStart}-09`;
    const matricule = uniqueToken("B11").replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const student = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Bus CDF Report ${uniqueToken("S")}`,
        level: "primaire",
        className: "1e A",
        sex: "F",
        monthlyDue: 30,
        classEffectiveMonth: targetMonth,
        matricule
      }
    });
    studentId = String(student?.id || "");
    await expectStatus(admin, "PUT", `/api/students/${encodeURIComponent(studentId)}/bus-subscription`, 200, {
      body: {
        active: true,
        startMonth: targetMonth,
        category: "Test CDF",
        monthlyAmount: 80000,
        monthlyCurrency: "CDF"
      }
    });
    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 30000,
      currency: "CDF",
      feeCode: "BUS",
      paidForMonthOverride: targetMonth
    });

    const report = await expectStatus(admin, "GET", `/api/reports/bus-summary?month=${encodeURIComponent(targetMonth)}`, 200);
    const row = report?.rows?.find((entry) => String(entry?.id || "") === studentId);
    assert.ok(row, "Bus student should appear in report 11");
    assert.equal(Number(row.dueUSD || 0), 0);
    assert.equal(Number(row.dueCDF || 0), 80000);
    assert.equal(Number(row.paidUSD || 0), 0);
    assert.equal(Number(row.paidCDF || 0), 30000);
    assert.equal(Number(row.remainingUSD || 0), 0);
    assert.equal(Number(row.remainingCDF || 0), 50000);
    assert.ok(Number(report.expectedCDF || 0) >= 80000);
    assert.ok(Number(report.collectedCDF || 0) >= 30000);
    assert.ok(Number(report.remainingCDF || 0) >= 50000);
  } finally {
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("reports: daily caisse entries include minerval and keep caisse totals", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);
  const today = localDateISO();
  const settings = await expectStatus(admin, "GET", "/api/settings", 200);
  const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
  const targetMonth = `${schoolYearStart}-09`;
  let studentId = "";
  let tuitionPaymentId = "";
  let stateMinervalPaymentId = "";
  try {
    const matricule = uniqueToken("TC").replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const createdStudent = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Daily Caisse Report ${uniqueToken("S")}`,
        level: "primaire",
        className: "1e A",
        sex: "M",
        monthlyDue: 30,
        classEffectiveMonth: targetMonth,
        matricule
      }
    });
    studentId = String(createdStudent?.id || "");
    tuitionPaymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 10,
      currency: "USD",
      feeCode: "TUITION",
      createdAtIso: `${today}T11:00:00.000Z`,
      paidForMonthOverride: targetMonth
    });
    stateMinervalPaymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 17.45,
      currency: "USD",
      feeCode: "ETAT_MINERVAL",
      createdAtIso: `${today}T12:00:00.000Z`,
      paidForMonthOverride: targetMonth
    });

    const report = await expectStatus(
      admin,
      "GET",
      `/api/reports/daily-caisse-entries?date=${encodeURIComponent(today)}`,
      200
    );
    assert.equal(report?.date, today);
    assert.ok(Array.isArray(report?.details), "Daily caisse report should include details array");
    assert.ok(Array.isArray(report?.aggregates), "Daily caisse report should include aggregates array");

    const stateMinervalDetail = report.details.find((row) => String(row?.id || "") === stateMinervalPaymentId) || null;
    const tuitionDetail = report.details.find((row) => String(row?.id || "") === tuitionPaymentId) || null;
    assert.ok(stateMinervalDetail, "Expected non-minerval payment to appear in the caisse report");
    assert.ok(tuitionDetail, "Expected minerval payment to appear in the caisse report");
    assert.equal(String(tuitionDetail?.boxKey || ""), "minerval", "Tuition payment should map to the minerval caisse");
    assert.equal(Number(tuitionDetail?.amount || 0), 10, "Expected tuition payment amount to be preserved");
    assert.equal(String(stateMinervalDetail?.boxKey || ""), "fee_etat_minerval", "State minerval payment should map to its caisse");
    assert.equal(Number(stateMinervalDetail?.amount || 0), 17.45, "Expected state minerval payment amount to be preserved");

    const minervalAggregate = report.aggregates.find((row) => String(row?.boxKey || "") === "minerval") || null;
    const stateMinervalAggregate = report.aggregates.find((row) => String(row?.boxKey || "") === "fee_etat_minerval") || null;
    assert.ok(minervalAggregate, "Expected minerval aggregate row in caisse report");
    assert.ok(Number(minervalAggregate?.totalUSD || 0) >= 10, "Minerval aggregate should include the created tuition payment");
    assert.ok(stateMinervalAggregate, "Expected state minerval aggregate row in caisse report");
    assert.ok(Number(stateMinervalAggregate?.totalUSD || 0) >= 17.45, "State minerval aggregate should include the created non-minerval payment");
  } finally {
    await cleanupPayment(admin, stateMinervalPaymentId);
    await cleanupPayment(admin, tuitionPaymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("CAS SOCIAL tuition due is 0 (full exemption, all levels)", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);
  const settings = await expectStatus(admin, "GET", "/api/settings", 200);
  const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
  const mk = `${schoolYearStart}-09`;

  let student7eId = "";
  let student4eId = "";
  try {
    const createCasSocialSecondary = async ({ className, expectedDue, sex }) => {
      const matricule = uniqueToken("CS").replace(/[^A-Z0-9]/g, "").slice(0, 18);
      const created = await expectStatus(admin, "POST", "/api/students", 200, {
        body: {
          fullName: `CAS Social ${className} ${uniqueToken("S")}`,
          level: "secondaire",
          className,
          sex,
          monthlyDue: 0,
          classEffectiveMonth: mk,
          studentNote: "CAS SOCIAL",
          matricule
        }
      });
      const studentId = String(created?.id || "");
      assert.ok(studentId, "Expected created CAS SOCIAL student id");

      const status = await expectStatus(
        admin,
        "GET",
        `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${encodeURIComponent(mk)}`,
        200
      );
      assert.equal(
        Number(status?.dueAmount || 0),
        expectedDue,
        `Expected tuition due ${expectedDue} for ${className} CAS SOCIAL`
      );

      const monthly = await expectStatus(
        admin,
        "GET",
        `/api/students/${encodeURIComponent(studentId)}?month=${encodeURIComponent(mk)}`,
        200
      );
      assert.equal(
        Number(monthly?.due || 0),
        expectedDue,
        `Expected /api/students/:id month due ${expectedDue} for ${className} CAS SOCIAL`
      );

      return studentId;
    };

    student7eId = await createCasSocialSecondary({
      className: "7e EB - General A",
      expectedDue: 0,
      sex: "M"
    });
    student4eId = await createCasSocialSecondary({
      className: "4e H - Scientifique B",
      expectedDue: 0,
      sex: "F"
    });

    const list = await expectStatus(admin, "GET", `/api/students?month=${encodeURIComponent(mk)}`, 200);
    const row7e = Array.isArray(list) ? list.find((r) => String(r?.id || "") === student7eId) : null;
    const row4e = Array.isArray(list) ? list.find((r) => String(r?.id || "") === student4eId) : null;
    assert.equal(Number(row7e?.due || 0), 0, "Expected list due 0 for 7e CAS SOCIAL");
    assert.equal(Number(row4e?.due || 0), 0, "Expected list due 0 for 4e H CAS SOCIAL");
  } finally {
    await cleanupStudent(admin, student7eId);
    await cleanupStudent(admin, student4eId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("students: old lookup and enroll existing student", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let enrolledStudentId = "";
  let currentYearStudentId = "";
  let paymentId = "";
  let originalSchoolYearStart = null;
  try {
    const settings = await expectStatus(admin, "GET", "/api/settings", 200);
    const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    originalSchoolYearStart = schoolYearStart;
    const previousSchoolYearStart = schoolYearStart - 1;
    const prevMonth = `${previousSchoolYearStart}-09`;
    const currentStartMonth = `${schoolYearStart}-09`;
    const matricule = uniqueToken("OLD").replace(/[^A-Z0-9]/g, "").slice(0, 18);

    await expectStatus(admin, "PATCH", "/api/settings", 200, {
      body: { schoolYearStartYear: previousSchoolYearStart }
    });
    const created = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Old Student ${uniqueToken("S")}`,
        level: "primaire",
        className: "1e A",
        sex: "F",
        monthlyDue: 30,
        classEffectiveMonth: prevMonth,
        matricule
      }
    });
    studentId = String(created?.id || "");
    assert.ok(studentId, "Expected created student id");

    await expectStatus(admin, "PATCH", "/api/settings", 200, {
      body: { schoolYearStartYear: schoolYearStart }
    });
    const currentMatricule = uniqueToken("CUR").replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const createdCurrent = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Current Student ${uniqueToken("S")}`,
        level: "primaire",
        className: "3e A",
        sex: "M",
        monthlyDue: 40,
        classEffectiveMonth: currentStartMonth,
        matricule: currentMatricule
      }
    });
    currentYearStudentId = String(createdCurrent?.id || "");
    assert.ok(currentYearStudentId, "Expected current school-year student id");

    await expectStatus(admin, "PATCH", `/api/students/${encodeURIComponent(studentId)}/active`, 200, {
      body: { isActive: false, inactiveReasonCategory: "Autre", inactiveReasonNote: "Test de réinscription" }
    });

    const lookup = await expectStatus(
      admin,
      "GET",
      `/api/students/old?q=${encodeURIComponent(matricule)}`,
      200
    );
    assert.ok(Array.isArray(lookup?.rows), "Old-students lookup should return rows");
    const oldLookupRow = lookup.rows.find((row) => String(row?.id || "") === studentId);
    assert.ok(oldLookupRow, "Inactive student from previous school year should appear in old lookup");
    assert.equal(String(oldLookupRow?.matricule || ""), matricule, "Old-students lookup should expose the stable matricule");

    const lookupFallback = await expectStatus(
      admin,
      "GET",
      `/api/students/old?q=${encodeURIComponent(currentMatricule)}`,
      200
    );
    assert.ok(Array.isArray(lookupFallback?.rows), "Fallback old-students lookup should return rows");
    assert.ok(
      lookupFallback.rows.some((row) => String(row?.id || "") === currentYearStudentId),
      "Lookup should fallback to next enrollment window when default window has no match"
    );

    const enrolled = await expectStatus(
      admin,
      "POST",
      `/api/students/${encodeURIComponent(studentId)}/enroll`,
      200,
      {
        body: {
          level: "primaire",
          className: "2e A",
          monthlyDue: 33,
          classEffectiveMonth: currentStartMonth
        }
      }
    );
    enrolledStudentId = String(enrolled?.id || "");
    assert.equal(Boolean(enrolled?.isActive), true, "Enrolled student should be active");
    assert.ok(enrolledStudentId, "Enroll should return the current school-year student id");
    assert.notEqual(enrolledStudentId, studentId, "Re-enrollment should create a distinct current school-year row");
    assert.equal(String(enrolled?.matricule || ""), matricule, "Re-enrollment should keep the same visible matricule");
    assert.equal(String(enrolled?.className || ""), "2e A", "Enroll should update class");
    assert.equal(Number(enrolled?.monthlyDue || 0), 33, "Enroll should update monthlyDue");
    assert.equal(
      String(enrolled?.classEffectiveMonth || ""),
      currentStartMonth,
      "Enroll should update classEffectiveMonth"
    );

    const reenrolledAgain = await expectStatus(
      admin,
      "POST",
      `/api/students/${encodeURIComponent(studentId)}/enroll`,
      200,
      {
        body: {
          monthlyDue: 35
        }
      }
    );
    assert.equal(
      String(reenrolledAgain?.id || ""),
      enrolledStudentId,
      "Re-enrolling the same historical student should reuse the current-year row"
    );
    assert.equal(String(reenrolledAgain?.matricule || ""), matricule, "Reused current-year row should keep the same matricule");
    assert.equal(Number(reenrolledAgain?.monthlyDue || 0), 35, "Reused current-year row should be updated in place");

    const currentYearRows = await expectStatus(admin, "GET", "/api/students?includeInactive=1", 200);
    const sameMatriculeRows = (Array.isArray(currentYearRows) ? currentYearRows : []).filter(
      (row) => String(row?.matricule || row?.id || "").toUpperCase() === matricule
    );
    assert.equal(
      sameMatriculeRows.length,
      1,
      "Only one current school-year row should exist for the reenrolled matricule"
    );

    const payment = await expectStatus(admin, "POST", "/api/payments", 200, {
      body: {
        studentId: enrolledStudentId,
        paidForMonth: currentStartMonth,
        amount: 10,
        currency: "USD",
        feeCode: "TUITION",
        note: "reenrollment matricule snapshot test"
      }
    });
    paymentId = String(payment?.id || "");
    assert.ok(paymentId, "Expected payment id after reenrollment");
    assert.equal(String(payment?.matricule || ""), matricule, "Payment receipt payload should keep the stable matricule");
  } finally {
    if (Number.isFinite(originalSchoolYearStart)) {
      await admin.request("PATCH", "/api/settings", {
        body: { schoolYearStartYear: originalSchoolYearStart }
      }).catch(() => {});
    }
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, enrolledStudentId);
    await cleanupStudent(admin, studentId);
    await cleanupStudent(admin, currentYearStudentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("students: correcting sex rekeys the student and keeps linked rows attached", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let updatedStudentId = "";
  let paymentId = "";
  try {
    const created = await createSexLinkedStudent(admin, "M");
    studentId = created.id;

    const feeTypes = await expectStatus(admin, "GET", "/api/fee-types", 200);
    assert.ok(Array.isArray(feeTypes) && feeTypes.length > 0, "Expected fee types to exist");
    const tuitionFeeType = feeTypes.find((ft) => String(ft?.code || "").toUpperCase() === "TUITION") || feeTypes[0];
    assert.ok(tuitionFeeType?.id != null, "Expected a fee type id for the override test");

    await expectStatus(admin, "POST", `/api/students/${encodeURIComponent(studentId)}/fees`, 200, {
      body: {
        feeTypeId: Number(tuitionFeeType.id),
        amount: 77,
        currency: "USD",
        active: true
      }
    });

    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 12,
      currency: "USD",
      feeCode: "TUITION"
    });

    const updated = await expectStatus(admin, "PATCH", `/api/students/${encodeURIComponent(studentId)}/profile`, 200, {
      body: {
        fullName: created.fullName,
        sex: "F"
      }
    });
    updatedStudentId = String(updated?.id || "");
    assert.ok(updatedStudentId, "Sex correction should return the new student id");
    assert.notEqual(updatedStudentId, studentId, "Sex correction should rekey the student");
    assert.equal(String(updated?.sex || "").toUpperCase(), "F", "Sex should be updated on the returned student row");
    assert.equal(String(updated?.matricule || ""), updatedStudentId, "Matricule should follow the rekeyed student id");
    assert.ok(updatedStudentId.endsWith("F"), "The corrected id should reflect the new sex");

    await expectStatus(admin, "GET", `/api/students/${encodeURIComponent(studentId)}`, 404);

    const currentStudent = await expectStatus(admin, "GET", `/api/students/${encodeURIComponent(updatedStudentId)}`, 200);
    assert.equal(String(currentStudent?.sex || "").toUpperCase(), "F", "The rekeyed student should be readable by the new id");
    assert.equal(String(currentStudent?.matricule || ""), updatedStudentId, "The rekeyed student should expose the new matricule");

    const payments = await expectStatus(
      admin,
      "GET",
      `/api/payments?studentId=${encodeURIComponent(updatedStudentId)}`,
      200
    );
    const paymentRow = Array.isArray(payments)
      ? payments.find((row) => String(row?.id || "") === paymentId)
      : null;
    assert.ok(paymentRow, "The payment should move to the new student id");
    assert.equal(String(paymentRow?.studentId || ""), updatedStudentId, "The payment studentId should be rekeyed");
    assert.equal(String(paymentRow?.matricule || ""), updatedStudentId, "The receipt payload should expose the new matricule");

    const feeRows = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(updatedStudentId)}/fees`,
      200
    );
    const movedOverride = Array.isArray(feeRows)
      ? feeRows.find((row) => Number(row?.feeTypeId || 0) === Number(tuitionFeeType.id))
      : null;
    assert.ok(movedOverride, "The fee override should still be attached after the rekey");
    assert.equal(String(movedOverride?.studentId || ""), updatedStudentId, "The fee override studentId should follow the rekeyed student");
  } finally {
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, updatedStudentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("role permissions: forbidden + allowed routes per role", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  let studentId = "";
  let paymentId = "";
  let historicalPaymentId = "";
  let caissierUser = null;
  let comptableUser = null;
  let spendingId = "";
  let transferId = "";

  try {
    caissierUser = await createRoleUser(admin, "caissier");
    comptableUser = await createRoleUser(admin, "comptable");
    studentId = await createStudent(admin);
    paymentId = await reserveAndCreatePayment(admin, studentId);

    const caissier = new ApiClient(baseUrl);
    await loginAs(caissier, caissierUser.username, caissierUser.password);

    await expectStatus(caissier, "GET", "/api/admin/system-health", 403);

    await expectStatus(caissier, "PATCH", `/api/payments/${encodeURIComponent(paymentId)}`, 403, {
      body: { createdAt: localDateISO() }
    });
    await expectStatus(caissier, "DELETE", `/api/payments/${encodeURIComponent(paymentId)}`, 403);
    // Politique: un caissier peut VOIR et IMPRIMER tous les rapports (lecture seule).
    await expectStatus(caissier, "GET", `/api/reports/bus-summary?month=${encodeURIComponent(monthKey())}`, 200);
    await expectStatus(caissier, "GET", `/api/reports/daily-caisse-entries?date=${encodeURIComponent(localDateISO())}`, 200);
    await expectStatus(caissier, "GET", `/api/reports/daily-entries?date=${encodeURIComponent(localDateISO())}`, 200);

    const spending = await expectStatus(caissier, "POST", "/api/spending", 200, {
      body: {
        date: localDateISO(),
        category: "Fournitures",
        amount: 3,
        currency: "USD",
        note: "caissier allowed create"
      }
    });
    spendingId = String(spending?.id || "");
    assert.ok(spendingId, "Caissier spending creation should return id");
    const settings = await expectStatus(caissier, "GET", "/api/settings", 200);
    const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
    const targetMonth = `${schoolYearStart}-09`;
    const historicalDate = `${targetMonth}-15`;
    const historicalPayment = await expectStatus(caissier, "POST", "/api/payments", 200, {
      body: {
        studentId,
        paid_for_month: targetMonth,
        monthKey: targetMonth,
        amount: 1,
        currency: "USD",
        feeCode: "TUITION",
        note: "caissier historical payment",
        created_at: `${historicalDate}T12:00:00.000Z`,
        forceRequestedMonth: true
      }
    });
    historicalPaymentId = String(historicalPayment?.id || "");
    assert.ok(historicalPaymentId, "Caissier historical payment should return id");
    assert.equal(
      String(historicalPayment?.paidForMonth || historicalPayment?.monthKey || ""),
      targetMonth,
      "Caissier historical payment should keep the requested month"
    );
    assert.ok(
      String(historicalPayment?.createdAt || "").startsWith(historicalDate),
      "Caissier historical payment should keep the requested payment date"
    );
    await expectStatus(caissier, "PATCH", `/api/students/${encodeURIComponent(studentId)}/profile`, 200, {
      body: { monthlyDue: 42 }
    });
    await expectStatus(caissier, "PUT", `/api/students/${encodeURIComponent(studentId)}/tuition-benefit`, 200, {
      body: {
        active: true,
        startMonth: targetMonth,
        endMonth: targetMonth,
        employeeName: "Permission test"
      }
    });
    await expectStatus(caissier, "PATCH", "/api/settings", 403, {
      body: { schoolYearStartYear: schoolYearStart }
    });
    const transfer = await expectStatus(caissier, "POST", "/api/caisse-transfers", 200, {
      body: {
        date: localDateISO(),
        appliesToMonth: targetMonth,
        mode: "transfer",
        sourceBoxKey: "minerval",
        counterpartyBoxKey: "bus",
        sourceCurrency: "USD",
        sourceAmount: 1,
        schoolYearStartYear: schoolYearStart,
        note: "caissier transfer allowed"
      }
    });
    transferId = String(transfer?.id || "");
    assert.ok(transferId, "Caissier transfer creation should return id");
    await expectStatus(caissier, "DELETE", `/api/spending/${encodeURIComponent(spendingId)}`, 403);
    await expectStatus(caissier, "DELETE", `/api/caisse-transfers/${encodeURIComponent(transferId)}`, 403);
    await expectStatus(caissier, "POST", `/api/payments/${encodeURIComponent(paymentId)}/cancel`, 400, {
      body: { reason: "", cashReturned: true }
    });
    await expectStatus(caissier, "POST", `/api/payments/${encodeURIComponent(paymentId)}/cancel`, 400, {
      body: { reason: "Erreur de saisie test" }
    });
    const cancelledPayment = await expectStatus(caissier, "POST", `/api/payments/${encodeURIComponent(paymentId)}/cancel`, 200, {
      body: { reason: "Erreur de saisie test", cashReturned: true }
    });
    assert.equal(Boolean(cancelledPayment?.cancelled), true, "Cashier should be able to cancel a receipt");
    assert.equal(Number(cancelledPayment?.amount || 0), 0, "Cancelled payment must have zero effective amount");
    assert.equal(Number(cancelledPayment?.originalAmount || 0), 10, "Cancelled receipt must preserve its original amount");
    assert.equal(String(cancelledPayment?.cancellationReason || ""), "Erreur de saisie test", "Cancellation reason should be preserved");
    assert.equal(cancelledPayment?.cancellationCashReturned, true, "Cancellation must record that cash was returned");
    await expectStatus(caissier, "POST", `/api/payments/${encodeURIComponent(paymentId)}/cancel`, 409, {
      body: { reason: "Deuxieme annulation", cashReturned: true }
    });
    await expectStatus(caissier, "POST", `/api/payments/${encodeURIComponent(paymentId)}/print`, 409);
    const dailyEntriesAfterCancel = await expectStatus(caissier, "GET", `/api/reports/daily-entries?date=${encodeURIComponent(localDateISO())}`, 200);
    assert.equal(
      (dailyEntriesAfterCancel?.details || []).some((row) => String(row?.id || "") === paymentId),
      false,
      "Cancelled receipt must be excluded from daily-entry reports"
    );
    await caissier.request("POST", "/api/auth/logout");

    const comptable = new ApiClient(baseUrl);
    await loginAs(comptable, comptableUser.username, comptableUser.password);
    await expectStatus(comptable, "GET", `/api/reports/bus-summary?month=${encodeURIComponent(monthKey())}`, 200);
    await expectStatus(comptable, "PATCH", "/api/settings", 403, {
      body: { schoolYearStartYear: schoolYearStart }
    });
    await expectStatus(comptable, "DELETE", `/api/payments/${encodeURIComponent(paymentId)}?allYears=1`, 200);
    paymentId = "";
    await expectStatus(comptable, "DELETE", `/api/spending/${encodeURIComponent(spendingId)}`, 403);
    await comptable.request("POST", "/api/auth/logout");
  } finally {
    await cleanupSpending(admin, spendingId);
    await cleanupCaisseTransfer(admin, transferId);
    await cleanupPayment(admin, historicalPaymentId);
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await cleanupUser(admin, caissierUser?.id || "");
    await cleanupUser(admin, comptableUser?.id || "");
    await admin.request("POST", "/api/auth/logout");
  }
});

test("school-year fee setup stays isolated between years", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  const initialSettings = await expectStatus(admin, "GET", "/api/settings", 200);
  const currentYear = Number(initialSettings?.schoolYearStartYear || new Date().getFullYear());
  const nextYear = currentYear + 1;
  const currentLevelFees = initialSettings?.levelMonthlyDueUSD || {};
  const feeCode = uniqueToken("FT_SCOPE").replace(/[^A-Z0-9]/gi, "_").toUpperCase().slice(0, 40);
  const feeLabel = `Frais ${feeCode}`;
  const currentDueMonth = `${currentYear}-11`;
  const nextDueMonth = `${nextYear}-11`;

  try {
    const created = await expectStatus(admin, "POST", "/api/fee-types", 200, {
      body: {
        code: feeCode,
        labelFr: feeLabel,
        defaultCurrency: "USD",
        defaultAmount: 12,
        billingCycle: "annual",
        dueMonth: currentDueMonth,
        hasFixedPrice: false,
        scopeLevels: ["maternelle", "primaire"]
      }
    });
    assert.equal(Number(created?.schoolYearStartYear || 0), currentYear, "Fee type should be created in the active school year");
    assert.equal(created?.dueMonth, currentDueMonth, "Fee due month should be stored in the active school year");
    assert.equal(created?.hasFixedPrice, false, "Open-price fee should keep its pricing mode");
    assert.equal(Number(created?.defaultAmount || 0), 0, "Open-price fee should not retain a default amount");
    assert.deepEqual(created?.scopeLevels, ["maternelle", "primaire"], "Fee should support multiple target levels");

    await expectStatus(admin, "PATCH", "/api/settings", 200, {
      body: { schoolYearStartYear: nextYear }
    });

    const switchedSettings = await expectStatus(admin, "GET", "/api/settings", 200);
    assert.equal(Number(switchedSettings?.schoolYearStartYear || 0), nextYear, "Expected to switch to the next school year");

    const nextYearFees = await expectStatus(admin, "GET", "/api/fee-types?includeInactive=1", 200);
    const nextYearFee = Array.isArray(nextYearFees)
      ? nextYearFees.find((row) => String(row?.code || "") === feeCode)
      : null;
    assert.ok(nextYearFee, "Expected the fee type to be copied into the next school year");
    assert.equal(Boolean(nextYearFee?.active), true, "Copied fee type should start active");
    assert.equal(nextYearFee?.dueMonth, nextDueMonth, "Copied fee due month should move into the next school year");
    assert.equal(nextYearFee?.hasFixedPrice, false, "Copied fee should preserve open-price mode");
    assert.deepEqual(nextYearFee?.scopeLevels, ["maternelle", "primaire"], "Copied fee should preserve multiple target levels");

    const nextYearPrimaire = Number(currentLevelFees?.primaire || 0) + 7;
    const nextYearFeeSettings = await expectStatus(admin, "PATCH", "/api/settings/level-fees", 200, {
      body: {
        primaire: nextYearPrimaire,
        recalculateExisting: false
      }
    });
    assert.equal(
      Number(nextYearFeeSettings?.levelMonthlyDueUSD?.primaire || 0),
      nextYearPrimaire,
      "Expected next-year level fees to update"
    );

    await expectStatus(admin, "DELETE", `/api/fee-types/${encodeURIComponent(String(nextYearFee.id))}`, 200);
    const nextYearFeesAfterDelete = await expectStatus(admin, "GET", "/api/fee-types?includeInactive=1", 200);
    const deletedNextYearFee = Array.isArray(nextYearFeesAfterDelete)
      ? nextYearFeesAfterDelete.find((row) => String(row?.code || "") === feeCode)
      : null;
    assert.equal(Boolean(deletedNextYearFee?.active), false, "Deleting in the next year should only inactivate that year's fee type");

    await expectStatus(admin, "PATCH", "/api/settings", 200, {
      body: { schoolYearStartYear: currentYear }
    });

    const restoredSettings = await expectStatus(admin, "GET", "/api/settings", 200);
    assert.equal(Number(restoredSettings?.schoolYearStartYear || 0), currentYear, "Expected to restore the original school year");
    assert.equal(
      Number(restoredSettings?.levelMonthlyDueUSD?.primaire || 0),
      Number(currentLevelFees?.primaire || 0),
      "Changing next-year level fees should not alter the current year's fees"
    );

    const currentYearFees = await expectStatus(admin, "GET", "/api/fee-types?includeInactive=1", 200);
    const currentYearFee = Array.isArray(currentYearFees)
      ? currentYearFees.find((row) => String(row?.code || "") === feeCode)
      : null;
    assert.ok(currentYearFee, "Expected the original-year fee type to still exist");
    assert.equal(Boolean(currentYearFee?.active), true, "Deleting in the next year must not deactivate the current-year fee type");
  } finally {
    await purgeFeeTypeByCode(feeCode).catch(() => {});
    await admin.request("PATCH", "/api/settings", {
      body: { schoolYearStartYear: currentYear }
    });
    await admin.request("POST", "/api/auth/logout");
  }
});

test("paid tuition months keep their original due after a price change", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  const settings = await expectStatus(admin, "GET", "/api/settings", 200);
  const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
  const paidMonth = `${schoolYearStart}-09`;
  const unpaidMonth = `${schoolYearStart}-10`;
  let studentId = "";
  let paymentId = "";

  try {
    const matricule = uniqueToken("LOCK").replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const student = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Locked Tuition ${uniqueToken("S")}`,
        level: "secondaire",
        className: "3e H - Scientifique A",
        sex: "M",
        monthlyDue: 70,
        currency: "USD",
        classEffectiveMonth: paidMonth,
        matricule
      }
    });
    studentId = String(student?.id || "");
    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 70,
      currency: "USD",
      feeCode: "TUITION",
      paidForMonthOverride: paidMonth
    });

    const beforeChange = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${paidMonth}`,
      200
    );
    assert.equal(Number(beforeChange?.dueAmount || 0), 70);
    assert.equal(Number(beforeChange?.remaining || 0), 0);

    await expectStatus(admin, "PATCH", `/api/students/${encodeURIComponent(studentId)}/profile`, 200, {
      body: { monthlyDue: 80 }
    });

    const paidMonthAfterChange = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${paidMonth}`,
      200
    );
    const unpaidMonthAfterChange = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${unpaidMonth}`,
      200
    );
    assert.equal(Number(paidMonthAfterChange?.dueAmount || 0), 70, "Paid month should keep the original 70 USD obligation");
    assert.equal(Number(paidMonthAfterChange?.remaining || 0), 0, "Paid month must remain fully settled");
    assert.equal(Number(unpaidMonthAfterChange?.dueAmount || 0), 80, "Unpaid month should adopt the new 80 USD fee");
    assert.equal(Number(unpaidMonthAfterChange?.remaining || 0), 80, "Unpaid month should remain due at the new amount");
  } finally {
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("monthly tuition overrides change unpaid months but preserve paid month snapshots", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  const settings = await expectStatus(admin, "GET", "/api/settings", 200);
  const originalFees = settings?.levelMonthlyDueUSD || {};
  const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
  const paidMonth = `${schoolYearStart}-09`;
  const unpaidMonth = `${schoolYearStart}-10`;
  let studentId = "";
  let paymentId = "";

  const saveFees = (monthlyOverrides) => expectStatus(admin, "PATCH", "/api/settings/level-fees", 200, {
    body: {
      maternelle: Number(originalFees.maternelle || 0),
      primaire: Number(originalFees.primaire || 0),
      secondaire: Number(originalFees.secondaire || 0),
      secondaire4eH: Number(originalFees.secondaire4eH || 0),
      monthlyOverrides,
      recalculateExisting: false
    }
  });

  try {
    const baselineOverrides = { ...(originalFees.monthlyOverrides || {}) };
    delete baselineOverrides[paidMonth];
    delete baselineOverrides[unpaidMonth];
    await saveFees(baselineOverrides);

    const student = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Monthly Override ${uniqueToken("S")}`,
        level: "secondaire",
        className: "3e H - Scientifique A",
        sex: "F",
        monthlyDue: 70,
        currency: "USD",
        classEffectiveMonth: paidMonth,
        matricule: uniqueToken("MONTH").replace(/[^A-Z0-9]/g, "").slice(0, 18)
      }
    });
    studentId = String(student?.id || "");
    paymentId = await reserveAndCreatePayment(admin, studentId, {
      amount: 70,
      currency: "USD",
      feeCode: "TUITION",
      paidForMonthOverride: paidMonth
    });

    await saveFees({
      ...baselineOverrides,
      [paidMonth]: { secondaire: 100 },
      [unpaidMonth]: { secondaire: 80 }
    });

    const paidStatus = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${paidMonth}`,
      200
    );
    const unpaidStatus = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${unpaidMonth}`,
      200
    );
    assert.equal(Number(paidStatus?.dueAmount || 0), 70, "Paid September must keep its original price");
    assert.equal(Number(paidStatus?.remaining || 0), 0, "Paid September must remain settled");
    assert.equal(Number(unpaidStatus?.dueAmount || 0), 80, "Unpaid October must use its monthly override");
  } finally {
    await cleanupPayment(admin, paymentId);
    await cleanupStudent(admin, studentId);
    await saveFees(originalFees.monthlyOverrides || {}).catch(() => {});
    await admin.request("POST", "/api/auth/logout");
  }
});

test("tuition benefits create monthly non-cash payments without prepaying future months", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  const initialSettings = await expectStatus(admin, "GET", "/api/settings", 200);
  const originalSchoolYear = Number(initialSettings?.schoolYearStartYear || new Date().getFullYear());
  const now = new Date();
  const elapsedSchoolYear = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const currentMonth = monthKey();
  const today = localDateISO();
  let currentStudentId = "";
  let futureStudentId = "";

  const createBenefitStudent = async (schoolYearStart, prefix) => {
    const matricule = uniqueToken(prefix).replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const student = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Benefit Monthly ${uniqueToken("S")}`,
        level: "primaire",
        className: "1e A",
        sex: "M",
        monthlyDue: 30,
        currency: "USD",
        classEffectiveMonth: `${schoolYearStart}-09`,
        matricule
      }
    });
    return String(student?.id || "");
  };

  try {
    if (originalSchoolYear !== elapsedSchoolYear) {
      await expectStatus(admin, "PATCH", "/api/settings", 200, {
        body: { schoolYearStartYear: elapsedSchoolYear }
      });
    }
    currentStudentId = await createBenefitStudent(elapsedSchoolYear, "BENNOW");
    const cashBefore = await expectStatus(
      admin,
      "GET",
      `/api/reports/daily-entries?date=${encodeURIComponent(today)}`,
      200
    );
    await expectStatus(admin, "PUT", `/api/students/${encodeURIComponent(currentStudentId)}/tuition-benefit`, 200, {
      body: {
        active: true,
        startMonth: `${elapsedSchoolYear}-09`,
        endMonth: `${elapsedSchoolYear + 1}-08`,
        employeeName: "Monthly benefit test"
      }
    });

    const currentPayments = await expectStatus(
      admin,
      "GET",
      `/api/payments?studentId=${encodeURIComponent(currentStudentId)}&allYears=1`,
      200
    );
    const benefitPayments = (Array.isArray(currentPayments) ? currentPayments : [])
      .filter((row) => String(row?.paymentMethod || "") === "staff_benefit");
    assert.ok(benefitPayments.length > 0, "Elapsed covered months should receive non-cash payments");
    assert.ok(
      benefitPayments.every((row) => String(row?.paidForMonth || row?.monthKey || "") <= currentMonth),
      "No tuition benefit payment should be created for a future month"
    );
    const cashAfter = await expectStatus(
      admin,
      "GET",
      `/api/reports/daily-entries?date=${encodeURIComponent(today)}`,
      200
    );
    assert.equal(Number(cashAfter?.totalUSD || 0), Number(cashBefore?.totalUSD || 0), "Non-cash benefits must not increase daily USD cash");
    assert.equal(Number(cashAfter?.totalCDF || 0), Number(cashBefore?.totalCDF || 0), "Non-cash benefits must not increase daily CDF cash");

    const futureSchoolYear = new Date().getFullYear() + 1;
    await expectStatus(admin, "PATCH", "/api/settings", 200, {
      body: { schoolYearStartYear: futureSchoolYear }
    });
    futureStudentId = await createBenefitStudent(futureSchoolYear, "BENFUT");
    const futureSync = await expectStatus(admin, "PUT", `/api/students/${encodeURIComponent(futureStudentId)}/tuition-benefit`, 200, {
      body: {
        active: true,
        startMonth: `${futureSchoolYear}-09`,
        endMonth: `${futureSchoolYear + 1}-08`,
        employeeName: "Future benefit test"
      }
    });
    assert.equal(Number(futureSync?.coveredMonths || 0), 0, "Future coverage must wait for its first month");
    const futurePayments = await expectStatus(
      admin,
      "GET",
      `/api/payments?studentId=${encodeURIComponent(futureStudentId)}&allYears=1`,
      200
    );
    assert.equal(
      (Array.isArray(futurePayments) ? futurePayments : []).filter((row) => String(row?.paymentMethod || "") === "staff_benefit").length,
      0,
      "The full future school year must not be added at once"
    );
  } finally {
    await cleanupStudent(admin, futureStudentId);
    await admin.request("PATCH", "/api/settings", {
      body: { schoolYearStartYear: originalSchoolYear }
    });
    await cleanupStudent(admin, currentStudentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("4e H secondary tuition is due from September through May only", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  const settings = await expectStatus(admin, "GET", "/api/settings", 200);
  const schoolYearStart = Number(settings?.schoolYearStartYear || new Date().getFullYear());
  let studentId = "";

  try {
    const matricule = uniqueToken("4H").replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const created = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `Tuition 4e H ${uniqueToken("S")}`,
        level: "secondaire",
        className: "4e H - Scientifique A",
        sex: "F",
        monthlyDue: 70,
        currency: "USD",
        classEffectiveMonth: `${schoolYearStart}-09`,
        matricule
      }
    });
    studentId = String(created?.id || "");

    const mayStatus = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${schoolYearStart + 1}-05`,
      200
    );
    const juneStatus = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeCode=TUITION&month=${schoolYearStart + 1}-06`,
      200
    );

    assert.ok(Number(mayStatus?.dueAmount || 0) > 0, "4e H tuition should still be due in May");
    assert.equal(Number(juneStatus?.dueAmount || 0), 0, "4e H tuition should not be due in June");
  } finally {
    await cleanupStudent(admin, studentId);
    await admin.request("POST", "/api/auth/logout");
  }
});

test("annual fee status uses the student's school year before payment exists", { timeout: 120000 }, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);

  const initialSettings = await expectStatus(admin, "GET", "/api/settings", 200);
  const currentYear = Number(initialSettings?.schoolYearStartYear || new Date().getFullYear());
  const nextYear = currentYear + 1;
  let studentId = "";

  try {
    await expectStatus(admin, "PATCH", "/api/settings", 200, {
      body: { schoolYearStartYear: nextYear }
    });

    const feeTypes = await expectStatus(admin, "GET", "/api/fee-types?includeInactive=1", 200);
    const annualFee = Array.isArray(feeTypes)
      ? feeTypes.find((row) => String(row?.code || "").toUpperCase() === "ETAT_MINERVAL")
      : null;
    assert.ok(annualFee?.id, "Expected ETAT_MINERVAL fee type in the active school year");

    const matricule = uniqueToken("SB").replace(/[^A-Z0-9]/g, "").slice(0, 18);
    const created = await expectStatus(admin, "POST", "/api/students", 200, {
      body: {
        fullName: `School Year Annual Fee ${uniqueToken("S")}`,
        level: "primaire",
        className: "1e A",
        sex: "F",
        monthlyDue: 35,
        classEffectiveMonth: `${nextYear}-09`,
        matricule
      }
    });
    studentId = String(created?.id || "");
    assert.equal(Number(created?.schoolYearStartYear || 0), nextYear, "Student should be created in the switched school year");

    const status = await expectStatus(
      admin,
      "GET",
      `/api/students/${encodeURIComponent(studentId)}/status?feeTypeId=${encodeURIComponent(String(annualFee.id))}&allowInactive=1`,
      200
    );

    assert.equal(
      String(status?.annualPaymentLockMonth || ""),
      `${nextYear}-09`,
      "Annual fee status should target the student's selected school year"
    );
    assert.ok(
      Number(status?.annualPaymentLockDueAmount || 0) > 0,
      "Annual fee due amount should be populated even before payment history exists"
    );
    assert.ok(
      Number(status?.annualPaymentLockRemaining || 0) > 0,
      "Annual fee remaining amount should stay unpaid before any ETAT_MINERVAL payment"
    );
    assert.equal(Boolean(status?.annualPaymentLocked), false, "Annual fee should not be marked locked before payment");
  } finally {
    await cleanupStudent(admin, studentId);
    await admin.request("PATCH", "/api/settings", {
      body: { schoolYearStartYear: currentYear }
    });
    await admin.request("POST", "/api/auth/logout");
  }
});

process.on("exit", () => {
  if (serverProcess && serverProcess.exitCode == null) {
    // Best effort cleanup if tests abort abruptly.
    serverProcess.kill("SIGKILL");
  }
});

process.on("uncaughtException", (err) => {
  err.message = `${err.message}\n\nServer logs:\n${serverLogs.slice(-4000)}`;
  throw err;
});

test('control center: permissions, atomic history, conflicts, capabilities and prefix', {timeout:120000}, async () => {
  const admin = new ApiClient(baseUrl);
  await loginAs(admin, ADMIN_USER, ADMIN_PASS);
  const guest = new ApiClient(baseUrl);
  await expectStatus(guest,'GET','/api/configuration',401);
  const initial = await expectStatus(admin,'GET','/api/configuration',200);
  assert.equal(initial.database,'connected');
  assert.equal(initial.backup,'unknown');
  const saved = new Map(initial.settings.map(d=>[d.key,d.value]));
  async function change(key,value,confirmed=true) {
    const current = await expectStatus(admin,'GET','/api/configuration',200);
    return expectStatus(admin,'PATCH','/api/configuration',200,{body:{key,value,previousValue:current.settings.find(d=>d.key===key).value,confirmed}});
  }
  const touched=['school.phone','features.payments','features.students','receipts.prefix','school.studentIdPrefix'];
  let testStudent, roleUser;
  try {
    await expectStatus(admin,'PATCH','/api/configuration',400,{body:{key:'unknown',value:'x'}});
    await expectStatus(admin,'PATCH','/api/configuration',409,{body:{key:'receipts.prefix',value:'TEST',previousValue:saved.get('receipts.prefix')}});
    await change('school.phone','TEST-CONTACT');
    await expectStatus(admin,'PATCH','/api/configuration',409,{body:{key:'school.phone',value:'STALE',previousValue:'stale'}});
    const changed=await expectStatus(admin,'GET','/api/configuration',200);
    const audit=changed.history.find(h=>h.entityId==='school.phone');
    assert.equal(audit.details.after,'TEST-CONTACT');
    assert.equal(audit.actorUsername,ADMIN_USER);
    roleUser = await createRoleUser(admin, 'caissier');
    const cashier = new ApiClient(baseUrl);
    await loginAs(cashier,roleUser.username,roleUser.password);
    await expectStatus(cashier,'GET','/api/configuration',403);
    await expectStatus(cashier,'PATCH','/api/configuration',403,{body:{key:'school.phone',value:'blocked',previousValue:'TEST-CONTACT'}});
    await expectStatus(cashier,'GET','/api/configuration/runtime',200);
    await change('features.payments',false);
    await expectStatus(admin,'POST','/api/payments',403,{body:{}});
    await expectStatus(admin,'GET','/api/receipts',200);
    await change('features.students',false);
    await expectStatus(admin,'POST','/api/students',403,{body:{}});
    await change('receipts.prefix','TEST');
    const runtime=await expectStatus(admin,'GET','/api/configuration/runtime',200);
    assert.equal(runtime.values['receipts.prefix'],'TEST');
    const receipt = await expectStatus(admin,'GET','/api/payments/next-receipt-no?receiptDeviceKey=device%3Aconfiguration-tests',200);
    assert.match(receipt.receiptNo,/^TEST-C[0-9]+-[0-9]{4}-[0-9]{6}$/);
    await change('features.students',true);
    await change('school.studentIdPrefix','SCHOOL');
    const created = await expectStatus(admin,'POST','/api/students',200,{body:{fullName:'Configuration Test',sex:'M',level:'primaire',className:'1e A'}});
    testStudent=created.id;
    assert.match(created.matricule,/^SCHOOL[0-9]{4}M$/);
  } finally {
    for(const key of touched) await change(key,saved.get(key));
    if(testStudent) await expectStatus(admin,'DELETE',`/api/students/${testStudent}`,200);
    if(roleUser) await expectStatus(admin,'DELETE',`/api/users/${roleUser.id}`,200);
  }
});
