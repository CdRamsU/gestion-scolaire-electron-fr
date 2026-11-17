const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "server", "routes", "payments.routes.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "server", "postgres", "schema.sql"), "utf8");
const client = fs.readFileSync(path.join(root, "Public", "app", "payments.js"), "utf8");

test("receipt device identity and counters are server-owned", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS receipt_devices/);
  assert.match(schema, /"deviceKey" TEXT NOT NULL UNIQUE/);
  assert.match(schema, /PRIMARY KEY \("deviceId", "receiptYear"\)/);
  assert.match(routes, /ECO|receipts\.prefix/);
  assert.match(routes, /\$\{device\.code\}-\$\{receiptYear\}-\$\{String\(seq\)\.padStart\(6/);
});

test("payment allocation and insert share one transaction", () => {
  const beginAt = routes.indexOf('await tx.query("BEGIN")');
  const allocateAt = routes.indexOf("await allocateDeviceReceipt(tx", beginAt);
  const insertAt = routes.indexOf("INSERT INTO payments", allocateAt);
  const commitAt = routes.indexOf('await tx.query("COMMIT")', insertAt);
  assert.ok(beginAt >= 0 && allocateAt > beginAt && insertAt > allocateAt && commitAt > insertAt);
  assert.match(routes, /receiptNo and reservedPaymentId from older clients are intentionally[\s\S]*ignored/);
});

test("client sends stable device identity but no receipt number", () => {
  const start = client.indexOf("async function postPaymentToApi(payment)");
  const end = client.indexOf("async function findPaymentByClientRequestIdFromApi", start);
  const body = client.slice(start, end);
  assert.match(body, /await ensureReceiptDeviceRegistration\(\)/);
  assert.match(body, /receiptDeviceKey: device\.deviceKey/);
  assert.doesNotMatch(body, /receiptNo:/);
  assert.doesNotMatch(body, /reservedPaymentId:/);
});
