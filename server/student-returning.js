"use strict";

// Confirmed by the school: these matricules belong to the same student even
// though the matricule was regenerated for the new school year.
const VERIFIED_MATRICULE_LINKS = Object.freeze([
  Object.freeze(["TS22725F", "TS8288F"])
]);

// A list/report comparison evaluates the same student against many rows from
// the adjacent school year. Cache immutable normalization work by row object;
// this preserves the matching algorithm while avoiding millions of repeated
// Unicode, regex, date and phone normalizations.
const identityFeatureCache = new WeakMap();

function normalizeNameTokens(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedMatricule(student) {
  return String(student?.matricule || student?.id || "").trim().toUpperCase();
}

function matriculesAreVerifiedLink(left, right) {
  if (!left || !right || left === right) return false;
  return VERIFIED_MATRICULE_LINKS.some((group) => group.includes(left) && group.includes(right));
}

function normalizedDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function normalizedPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : "";
}

function studentIdentityFeatures(student) {
  if (!student || typeof student !== "object") {
    const nameTokens = normalizeNameTokens(student?.fullName);
    const phones = [];
    return {
      matricule: normalizedMatricule(student),
      birthDate: normalizedDate(student?.dateOfBirth),
      phones,
      phoneSet: new Set(phones),
      nameTokens,
      nameTokenSet: new Set(nameTokens),
      sortedName: nameTokens.slice().sort().join(" "),
      initials: nameTokens.map((token) => token[0]).sort().join("")
    };
  }
  const cached = identityFeatureCache.get(student);
  if (cached) return cached;
  const phones = [student.parentPhone, student.parentPhoneAlt].map(normalizedPhone).filter(Boolean);
  const nameTokens = normalizeNameTokens(student.fullName);
  const features = {
    matricule: normalizedMatricule(student),
    birthDate: normalizedDate(student.dateOfBirth),
    phones,
    phoneSet: new Set(phones),
    nameTokens,
    nameTokenSet: new Set(nameTokens),
    sortedName: nameTokens.slice().sort().join(" "),
    initials: nameTokens.map((token) => token[0]).sort().join("")
  };
  identityFeatureCache.set(student, features);
  return features;
}

function identitySignalsCompatible(current, previous) {
  const currentBirthDate = studentIdentityFeatures(current).birthDate;
  const previousBirthDate = studentIdentityFeatures(previous).birthDate;
  if (currentBirthDate && previousBirthDate && currentBirthDate !== previousBirthDate) return false;
  return true;
}

function hasCorroboratingIdentitySignal(current, previous) {
  const currentFeatures = studentIdentityFeatures(current);
  const previousFeatures = studentIdentityFeatures(previous);
  const currentBirthDate = currentFeatures.birthDate;
  const previousBirthDate = previousFeatures.birthDate;
  if (currentBirthDate && previousBirthDate && currentBirthDate === previousBirthDate) return true;

  const currentPhones = currentFeatures.phones;
  const previousPhones = previousFeatures.phones;
  return currentPhones.some((phone) => previousFeatures.phoneSet.has(phone));
}

function priorNameIsContainedInCurrent(current, previous) {
  const currentTokens = studentIdentityFeatures(current).nameTokens;
  const previousTokens = studentIdentityFeatures(previous).nameTokens;
  if (!currentTokens.length || !previousTokens.length) return false;
  if (!identitySignalsCompatible(current, previous)) return false;

  const currentSet = studentIdentityFeatures(current).nameTokenSet;
  if (!previousTokens.every((token) => currentSet.has(token))) return false;

  // Family name + post-name can identify a legacy row that lacks a first name.
  // A single-word legacy name needs a matching birth date or parent phone too.
  return previousTokens.length >= 2 || hasCorroboratingIdentitySignal(current, previous);
}

function levenshteinDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = saved;
    }
  }
  return previous[right.length];
}

function stringSimilarity(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - (levenshteinDistance(left, right) / Math.max(left.length, right.length, 1));
}

function tokenDiceSimilarity(leftTokens, rightTokens, leftSet = null, rightSet = null) {
  const left = leftSet || new Set(leftTokens);
  const right = rightSet || new Set(rightTokens);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function returningStudentCandidate(current, previous) {
  if (!current || !previous) return null;
  const currentFeatures = studentIdentityFeatures(current);
  const previousFeatures = studentIdentityFeatures(previous);
  const currentMatricule = currentFeatures.matricule;
  const previousMatricule = previousFeatures.matricule;
  if (currentMatricule && previousMatricule && currentMatricule === previousMatricule) {
    return { score: 1, confidence: "certain", reason: "same_matricule" };
  }
  if (matriculesAreVerifiedLink(currentMatricule, previousMatricule)) {
    return { score: 1, confidence: "certain", reason: "verified_matricule_link" };
  }
  if (!identitySignalsCompatible(current, previous)) return null;

  const currentTokens = currentFeatures.nameTokens;
  const previousTokens = previousFeatures.nameTokens;
  if (!currentTokens.length || !previousTokens.length) return null;

  const currentSorted = currentFeatures.sortedName;
  const previousSorted = previousFeatures.sortedName;
  const corroborated = hasCorroboratingIdentitySignal(current, previous);
  if (currentSorted === previousSorted && (currentTokens.length >= 2 || corroborated)) {
    return { score: 0.98, confidence: "certain", reason: "same_name" };
  }
  if (priorNameIsContainedInCurrent(current, previous)) {
    return { score: corroborated ? 0.97 : 0.93, confidence: "certain", reason: "name_contained" };
  }

  // Fuzzy comparison tolerates reordered names and small spelling/data-entry differences.
  // It intentionally requires at least two name parts to avoid matching common single names.
  if (currentTokens.length < 2 || previousTokens.length < 2) return null;
  const tokenSimilarity = tokenDiceSimilarity(
    currentTokens,
    previousTokens,
    currentFeatures.nameTokenSet,
    previousFeatures.nameTokenSet
  );
  const currentInitials = currentFeatures.initials;
  const previousInitials = previousFeatures.initials;
  if (tokenSimilarity < 0.45 && currentInitials !== previousInitials) return null;
  const characterSimilarity = stringSimilarity(currentSorted, previousSorted);
  if (tokenSimilarity < 0.45 && characterSimilarity < 0.72) return null;

  let score = (tokenSimilarity * 0.55) + (characterSimilarity * 0.45);
  if (corroborated) score = Math.min(0.97, score + 0.08);
  score = Number(score.toFixed(3));
  if (score < 0.58) return null;
  return {
    score,
    confidence: score >= 0.9 ? "certain" : (score >= 0.72 ? "probable" : "possible"),
    reason: corroborated ? "similar_name_identity" : "similar_name"
  };
}

function isReturningStudentMatch(current, previous) {
  const candidate = returningStudentCandidate(current, previous);
  return Boolean(candidate && candidate.score >= 0.72);
}

function buildReturningStudentMatches(currentStudents, previousStudents) {
  const current = Array.isArray(currentStudents) ? currentStudents : [];
  const previous = Array.isArray(previousStudents) ? previousStudents : [];
  const candidates = [];
  for (let currentIndex = 0; currentIndex < current.length; currentIndex += 1) {
    for (let previousIndex = 0; previousIndex < previous.length; previousIndex += 1) {
      const match = returningStudentCandidate(current[currentIndex], previous[previousIndex]);
      if (match) candidates.push({ currentIndex, previousIndex, ...match });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.currentIndex - b.currentIndex || a.previousIndex - b.previousIndex);

  const assignedCurrent = new Set();
  const assignedPrevious = new Set();
  const rows = current.map((student) => ({
    current: student,
    previous: null,
    status: "new",
    confidence: "none",
    score: 0,
    reason: "no_match"
  }));
  for (const candidate of candidates) {
    if (candidate.score < 0.72) continue;
    if (assignedCurrent.has(candidate.currentIndex) || assignedPrevious.has(candidate.previousIndex)) continue;
    assignedCurrent.add(candidate.currentIndex);
    assignedPrevious.add(candidate.previousIndex);
    rows[candidate.currentIndex] = {
      current: current[candidate.currentIndex],
      previous: previous[candidate.previousIndex],
      status: "returning",
      confidence: candidate.confidence,
      score: candidate.score,
      reason: candidate.reason
    };
  }

  // Keep the best lower-confidence suggestion visible in the report without
  // counting it as an old student until a person verifies it.
  for (const candidate of candidates) {
    if (candidate.score >= 0.72 || candidate.score < 0.58) continue;
    if (assignedCurrent.has(candidate.currentIndex) || assignedPrevious.has(candidate.previousIndex)) continue;
    assignedCurrent.add(candidate.currentIndex);
    assignedPrevious.add(candidate.previousIndex);
    rows[candidate.currentIndex] = {
      current: current[candidate.currentIndex],
      previous: previous[candidate.previousIndex],
      status: "review",
      confidence: "possible",
      score: candidate.score,
      reason: candidate.reason
    };
  }
  return rows;
}

function buildReturningStudentIdSet(currentStudents, previousStudents) {
  const current = Array.isArray(currentStudents) ? currentStudents : [];
  const previous = Array.isArray(previousStudents) ? previousStudents : [];
  const indexes = {
    matricule: new Map(), token: new Map(), initials: new Map(), birthDate: new Map(), phone: new Map()
  };
  const add = (map, key, index) => {
    if (!key) return;
    const rows = map.get(key) || [];
    rows.push(index);
    map.set(key, rows);
  };
  for (let i = 0; i < previous.length; i += 1) {
    const f = studentIdentityFeatures(previous[i]);
    add(indexes.matricule, f.matricule, i);
    for (const token of f.nameTokenSet) add(indexes.token, token, i);
    add(indexes.initials, f.initials, i);
    add(indexes.birthDate, f.birthDate, i);
    for (const phone of f.phoneSet) add(indexes.phone, phone, i);
  }

  const candidates = [];
  for (let currentIndex = 0; currentIndex < current.length; currentIndex += 1) {
    const f = studentIdentityFeatures(current[currentIndex]);
    const possible = new Set();
    const include = (map, key) => { for (const i of map.get(key) || []) possible.add(i); };
    include(indexes.matricule, f.matricule);
    for (const linked of VERIFIED_MATRICULE_LINKS) {
      if (linked.includes(f.matricule)) for (const matricule of linked) include(indexes.matricule, matricule);
    }
    for (const token of f.nameTokenSet) include(indexes.token, token);
    include(indexes.initials, f.initials);
    include(indexes.birthDate, f.birthDate);
    for (const phone of f.phoneSet) include(indexes.phone, phone);

    // A score >= .72 must share one of the indexed signals above. With no
    // token/initial/identity corroboration, the formula's maximum is < .72.
    for (const previousIndex of possible) {
      const match = returningStudentCandidate(current[currentIndex], previous[previousIndex]);
      if (match && match.score >= 0.72) candidates.push({ currentIndex, previousIndex, ...match });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.currentIndex - b.currentIndex || a.previousIndex - b.previousIndex);
  const assignedCurrent = new Set();
  const assignedPrevious = new Set();
  const ids = new Set();
  for (const candidate of candidates) {
    if (assignedCurrent.has(candidate.currentIndex) || assignedPrevious.has(candidate.previousIndex)) continue;
    assignedCurrent.add(candidate.currentIndex);
    assignedPrevious.add(candidate.previousIndex);
    ids.add(String(current[candidate.currentIndex].id));
  }
  return ids;
}

module.exports = {
  normalizeNameTokens,
  returningStudentCandidate,
  buildReturningStudentMatches,
  isReturningStudentMatch,
  buildReturningStudentIdSet
};
