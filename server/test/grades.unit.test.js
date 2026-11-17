"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { _test: rules } = require("../routes/grades.routes");

test("academic levels have the requested number of periods", () => {
  assert.equal(rules.PERIODS_BY_LEVEL.primaire, 6);
  assert.equal(rules.PERIODS_BY_LEVEL.secondaire, 4);
  assert.equal(rules.normalizeGradePeriod(6, "primaire"), 6);
  assert.equal(rules.normalizeGradePeriod(5, "secondaire"), null);
});

test("scores below 50 percent are failures and 50 percent passes", () => {
  assert.equal(rules.gradeScoreStatus(49.99), "failed");
  assert.equal(rules.gradeScoreStatus(50), "passed");
  assert.equal(rules.gradeScoreStatus(null), "missing");
});

test("grade summary excludes missing grades from pass rate and average", () => {
  assert.deepEqual(rules.summarizeGrades([
    { score: 40 },
    { score: 50 },
    { score: 70 },
    { score: null }
  ]), {
    totalStudents: 4,
    entered: 3,
    missing: 1,
    average: 53.33,
    passed: 2,
    failed: 1,
    passRate: 66.7,
    highest: 70,
    lowest: 40
  });
});
