const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "Public", "app", "payments.js"),
  "utf8"
);

test("confirmation registers the payment before starting receipt printing", () => {
  const start = source.indexOf("async function confirmPayment()");
  assert.notEqual(start, -1);
  const body = source.slice(start);
  const registerAt = body.indexOf("await syncSinglePaymentCreate(payment)");
  const printAt = body.indexOf("printCurrentReceipt(payment");
  assert.ok(registerAt >= 0, "confirmation must await server registration");
  assert.ok(printAt > registerAt, "printing must happen after registration succeeds");
});

test("printing rejects previews and locally pending payments", () => {
  const start = source.indexOf("async function printCurrentReceipt(");
  const end = source.indexOf("window.addEventListener(\"afterprint\"", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /baseData\.pendingSync/);
  assert.match(body, /String\(baseData\.id\) === \"preview\"/);
  assert.match(body, /Impossible de vérifier le paiement sur le serveur/);
});
