"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildReturningStudentMatches,
  isReturningStudentMatch,
  returningStudentCandidate
} = require("../student-returning");

test("recognizes the same student when the matricule changes between school years", () => {
  const previous = { id: "TS22725F", matricule: "TS22725F", fullName: "Tshibola Tshinzela Miradi", sex: "F" };
  const current = { id: "TS8288F", matricule: "TS8288F", fullName: "Nom saisi différemment", sex: "F" };

  assert.equal(isReturningStudentMatch(current, previous), true);
  assert.deepEqual(returningStudentCandidate(current, previous), {
    score: 1,
    confidence: "certain",
    reason: "verified_matricule_link"
  });
});

test("recognizes identical names with different unlinked matricules", () => {
  assert.equal(
    isReturningStudentMatch(
      { id: "CURRENT", matricule: "NEW-42", fullName: "Tshibola Tshinzela Miradi" },
      { id: "PREVIOUS", matricule: "OLD-42", fullName: "TSHIBOLA TSHINZELA MIRADI" }
    ),
    true
  );
});

test("keeps a close spelling match and exposes its confidence", () => {
  const previous = { id: "OLD", fullName: "Mbuyi Tshibola Miradi" };
  const current = { id: "NEW", fullName: "TSHIBOLA MBUYI MIRADY" };
  const candidate = returningStudentCandidate(current, previous);

  assert.ok(candidate);
  assert.ok(candidate.score >= 0.72);
  assert.equal(isReturningStudentMatch(current, previous), true);
});

test("matches each previous-year student at most once", () => {
  const rows = buildReturningStudentMatches(
    [
      { id: "CURRENT-1", fullName: "Kabongo Mbuyi Jean" },
      { id: "CURRENT-2", fullName: "Kabongo Mbuyi Jean" }
    ],
    [{ id: "PREVIOUS-1", fullName: "Kabongo Mbuyi Jean" }]
  );

  assert.equal(rows.filter((row) => row.status === "returning").length, 1);
  assert.equal(rows.filter((row) => row.status === "new").length, 1);
});

test("does not match names when known birth dates conflict", () => {
  assert.equal(
    isReturningStudentMatch(
      { id: "CURRENT", fullName: "Kabongo Mbuyi Jean", dateOfBirth: "2012-01-01" },
      { id: "PREVIOUS", fullName: "Kabongo Mbuyi Jean", dateOfBirth: "2011-01-01" }
    ),
    false
  );
});
