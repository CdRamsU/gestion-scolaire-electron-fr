/* global apiFetch, showToast */
"use strict";

const gradesUi = {
  loaded: false,
  loading: false,
  data: null,
  dirty: new Map(),
  invalid: new Set(),
  failuresOnly: false
};

const gradeEls = {
  level: document.getElementById("gradesLevel"),
  className: document.getElementById("gradesClass"),
  period: document.getElementById("gradesPeriod"),
  search: document.getElementById("gradesSearch"),
  failures: document.getElementById("gradesFailuresBtn"),
  save: document.getElementById("gradesSaveBtn"),
  export: document.getElementById("gradesExportBtn"),
  tbody: document.getElementById("gradesTbody"),
  empty: document.getElementById("gradesEmpty"),
  meta: document.getElementById("gradesMeta"),
  title: document.getElementById("gradesTableTitle"),
  saveState: document.getElementById("gradesSaveState"),
  entered: document.getElementById("gradesEntered"),
  missing: document.getElementById("gradesMissing"),
  average: document.getElementById("gradesAverage"),
  passRate: document.getElementById("gradesPassRate"),
  passed: document.getElementById("gradesPassed"),
  failed: document.getElementById("gradesFailed"),
  trend: document.getElementById("gradesTrend"),
  repeated: document.getElementById("gradesRepeated"),
  improving: document.getElementById("gradesImproving"),
  declining: document.getElementById("gradesDeclining")
  ,reportType: document.getElementById("gradesReportType")
  ,reportTitle: document.getElementById("gradesReportTitle")
  ,reportBody: document.getElementById("gradesReportBody")
  ,printReport: document.getElementById("gradesPrintReportBtn")
};

function gradeEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function gradeNotify(message, kind = "success") {
  if (typeof showToast === "function") showToast(message, { variant: kind === "error" ? "error" : "success" });
  else if (kind === "error") window.alert(message);
}

function gradeMaxPeriods() {
  return gradeEls.level?.value === "secondaire" ? 4 : 6;
}

function fillGradePeriods({ keep = true } = {}) {
  if (!gradeEls.period) return;
  const previous = keep ? Number(gradeEls.period.value || 1) : 1;
  const max = gradeMaxPeriods();
  gradeEls.period.innerHTML = Array.from({ length: max }, (_, index) =>
    `<option value="${index + 1}">P&eacute;riode ${index + 1}</option>`
  ).join("");
  gradeEls.period.value = String(Math.min(Math.max(previous, 1), max));
}

function gradeScore(row) {
  if (gradesUi.dirty.has(String(row.studentId))) return gradesUi.dirty.get(String(row.studentId));
  return row.score == null ? null : Number(row.score);
}

function currentGradeRows() {
  const query = String(gradeEls.search?.value || "").trim().toLowerCase();
  return (gradesUi.data?.rows || []).filter((row) => {
    const score = gradeScore(row);
    if (gradesUi.failuresOnly && !(score != null && score < 50)) return false;
    if (!query) return true;
    return `${row.fullName} ${row.matricule} ${row.studentId} ${row.className}`.toLowerCase().includes(query);
  });
}

function summarizeGradeRows(rows) {
  const scores = rows.map(gradeScore).filter((score) => score != null && Number.isFinite(Number(score))).map(Number);
  const failed = scores.filter((score) => score < 50).length;
  const passed = scores.length - failed;
  return {
    total: rows.length,
    entered: scores.length,
    missing: rows.length - scores.length,
    failed,
    passed,
    average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    passRate: scores.length ? (passed / scores.length) * 100 : null
  };
}

function renderGradeSummary() {
  const summary = summarizeGradeRows(gradesUi.data?.rows || []);
  gradeEls.entered.textContent = `${summary.entered} / ${summary.total}`;
  gradeEls.missing.textContent = `${summary.missing} à compléter`;
  gradeEls.average.textContent = summary.average == null ? "—" : `${summary.average.toFixed(1)}%`;
  gradeEls.passRate.textContent = summary.passRate == null ? "—" : `${summary.passRate.toFixed(1)}%`;
  gradeEls.passed.textContent = `${summary.passed} réussite${summary.passed === 1 ? "" : "s"}`;
  gradeEls.failed.textContent = String(summary.failed);
}

function renderGradeTrend() {
  const trend = gradesUi.data?.periodTrend || [];
  if (!trend.some((item) => item.entered)) {
    gradeEls.trend.innerHTML = `<div class="grades-no-data">Les moyennes apparaîtront après la première saisie.</div>`;
    return;
  }
  gradeEls.trend.innerHTML = trend.map((item) => {
    const average = item.average == null ? 0 : Number(item.average);
    const tone = average < 50 ? "is-failed" : "is-passed";
    return `<div class="grade-trend-row">
      <span>P${item.period}</span>
      <div class="grade-trend-track"><i class="${tone}" style="width:${Math.max(0, Math.min(100, average))}%"></i></div>
      <strong>${item.average == null ? "—" : `${average.toFixed(1)}%`}</strong>
      <small>${item.entered} note${item.entered === 1 ? "" : "s"}</small>
    </div>`;
  }).join("");
}

function gradeReportHeader(title) {
  const data = gradesUi.data;
  return `<div class="grade-report-doc-head">
    <div><strong>ETABLISSEMENT — SchoolSync</strong><span>Rapport académique</span></div>
    <div><strong>${gradeEscape(title)}</strong><span>${gradeEscape(data.schoolYearLabel)} · ${data.level === "primaire" ? "Primaire" : "Secondaire"} · Période ${data.period}</span></div>
  </div>`;
}

function renderGradeSummaryReport() {
  const rows = gradesUi.data?.rows || [];
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.className || "—");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const body = Array.from(groups.entries()).map(([className, classRows]) => {
    const summary = summarizeGradeRows(classRows);
    return `<tr><td><strong>${gradeEscape(className)}</strong></td><td>${summary.total}</td><td>${summary.entered}</td><td>${summary.missing}</td><td>${summary.average == null ? "—" : `${summary.average.toFixed(1)}%`}</td><td>${summary.passed}</td><td class="grade-report-failed">${summary.failed}</td><td>${summary.passRate == null ? "—" : `${summary.passRate.toFixed(1)}%`}</td></tr>`;
  }).join("");
  const overall = summarizeGradeRows(rows);
  return `${gradeReportHeader("Synthèse par classe")}
    <div class="grade-report-kpis"><div><span>Élèves</span><strong>${overall.total}</strong></div><div><span>Moyenne</span><strong>${overall.average == null ? "—" : `${overall.average.toFixed(1)}%`}</strong></div><div><span>Réussite</span><strong>${overall.passRate == null ? "—" : `${overall.passRate.toFixed(1)}%`}</strong></div><div><span>Échecs</span><strong>${overall.failed}</strong></div></div>
    <div class="table-wrap"><table class="grade-report-table"><thead><tr><th>Classe</th><th>Effectif</th><th>Saisies</th><th>Manquantes</th><th>Moyenne</th><th>Réussites</th><th>Échecs</th><th>Taux</th></tr></thead><tbody>${body || `<tr><td colspan="8">Aucune donnée</td></tr>`}</tbody></table></div>`;
}

function renderGradeFailuresReport() {
  const failures = (gradesUi.data?.rows || []).filter((row) => {
    const score = gradeScore(row);
    return score != null && Number(score) < 50;
  });
  const body = failures.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${gradeEscape(row.fullName)}</strong></td><td>${gradeEscape(row.matricule)}</td><td>${gradeEscape(row.className)}</td><td class="grade-report-failed"><strong>${Number(gradeScore(row)).toFixed(2)}%</strong></td><td>Remédiation / suivi</td></tr>`).join("");
  return `${gradeReportHeader("Liste des échecs")}
    <div class="grade-report-callout ${failures.length ? "is-alert" : "is-good"}"><strong>${failures.length}</strong><span>élève${failures.length === 1 ? "" : "s"} sous le seuil de 50% pour cette période</span></div>
    <div class="table-wrap"><table class="grade-report-table"><thead><tr><th>N°</th><th>Élève</th><th>Matricule</th><th>Classe</th><th>Note</th><th>Action recommandée</th></tr></thead><tbody>${body || `<tr><td colspan="6" class="grade-report-empty">Aucun échec enregistré pour cette sélection.</td></tr>`}</tbody></table></div>`;
}

function renderGradeProgressReport() {
  const data = gradesUi.data;
  const periods = Array.from({ length: data.maxPeriods }, (_, index) => index + 1);
  const rows = (data.studentProgress || []).slice().sort((a, b) => String(a.className).localeCompare(String(b.className), "fr") || String(a.fullName).localeCompare(String(b.fullName), "fr"));
  const body = rows.map((row) => {
    const currentRow = (data.rows || []).find((item) => String(item.studentId) === String(row.studentId));
    const periodScores = { ...(row.periodScores || {}) };
    if (currentRow) {
      const currentScore = gradeScore(currentRow);
      if (currentScore == null) delete periodScores[String(data.period)];
      else periodScores[String(data.period)] = Number(currentScore);
    }
    const enteredScores = periods.map((period) => periodScores[String(period)]).filter((score) => score != null).map(Number);
    const failures = enteredScores.filter((score) => score < 50).length;
    const average = enteredScores.length ? enteredScores.reduce((sum, score) => sum + score, 0) / enteredScores.length : null;
    const statusKey = failures >= 2 ? "repeated-failure" : failures === 1 ? "one-failure" : (enteredScores.length ? "satisfactory" : "missing");
    const periodCells = periods.map((period) => {
      const score = periodScores[String(period)];
      return `<td class="${score != null && Number(score) < 50 ? "grade-report-failed" : ""}">${score == null ? "—" : `${Number(score).toFixed(1)}%`}</td>`;
    }).join("");
    const status = statusKey === "repeated-failure" ? "Suivi prioritaire" : statusKey === "one-failure" ? "À suivre" : statusKey === "missing" ? "Non saisi" : "Satisfaisant";
    return `<tr><td><strong>${gradeEscape(row.fullName)}</strong><small>${gradeEscape(row.matricule)}</small></td><td>${gradeEscape(row.className)}</td>${periodCells}<td><strong>${average == null ? "—" : `${average.toFixed(1)}%`}</strong></td><td><span class="grade-report-status ${statusKey}">${status}</span></td></tr>`;
  }).join("");
  return `${gradeReportHeader("Progression annuelle")}
    <p class="grade-report-note">Vue cumulative de toutes les périodes saisies. Deux échecs ou plus déclenchent un suivi prioritaire.</p>
    <div class="table-wrap"><table class="grade-report-table grade-progress-table"><thead><tr><th>Élève</th><th>Classe</th>${periods.map((period) => `<th>P${period}</th>`).join("")}<th>Moyenne</th><th>Suivi</th></tr></thead><tbody>${body || `<tr><td colspan="${periods.length + 4}">Aucune donnée</td></tr>`}</tbody></table></div>`;
}

function renderGradeReport() {
  if (!gradeEls.reportBody || !gradesUi.data) return;
  const type = gradeEls.reportType?.value || "summary";
  const titles = { summary: "Synthèse de la période", failures: "Liste des échecs", progress: "Progression annuelle" };
  gradeEls.reportTitle.textContent = titles[type];
  gradeEls.reportBody.innerHTML = type === "failures"
    ? renderGradeFailuresReport()
    : type === "progress"
      ? renderGradeProgressReport()
      : renderGradeSummaryReport();
}

function renderGradeTable() {
  const rows = currentGradeRows();
  gradeEls.tbody.innerHTML = rows.map((row) => {
    const score = gradeScore(row);
    const result = score == null
      ? `<span class="grade-result is-missing">Non saisie</span>`
      : score < 50
        ? `<span class="grade-result is-failed">&Eacute;chec</span>`
        : `<span class="grade-result is-passed">R&eacute;ussite</span>`;
    const scoreValue = score == null ? "" : String(score);
    return `<tr data-student-id="${gradeEscape(row.studentId)}" class="${score != null && score < 50 ? "is-failed" : ""}">
      <td><strong>${gradeEscape(row.fullName)}</strong></td>
      <td><span class="grade-matricule">${gradeEscape(row.matricule)}</span></td>
      <td>${gradeEscape(row.className)}</td>
      <td><div class="grade-input-wrap"><input class="grade-input" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${gradeEscape(scoreValue)}" aria-label="Note de ${gradeEscape(row.fullName)} sur 100"><span>%</span></div></td>
      <td data-grade-result>${result}</td>
    </tr>`;
  }).join("");
  gradeEls.empty.hidden = rows.length > 0;
  gradeEls.tbody.parentElement.hidden = rows.length === 0;
  renderGradeSummary();
}

function updateGradeSaveState() {
  const count = gradesUi.dirty.size;
  const invalidCount = gradesUi.invalid.size;
  gradeEls.save.disabled = gradesUi.loading || count === 0 || invalidCount > 0;
  gradeEls.saveState.textContent = invalidCount
    ? `${invalidCount} note${invalidCount === 1 ? "" : "s"} invalide${invalidCount === 1 ? "" : "s"} (0 à 100)`
    : count
      ? `${count} modification${count === 1 ? "" : "s"} non enregistrée${count === 1 ? "" : "s"}`
      : "Toutes les notes sont enregistrées";
  gradeEls.saveState.classList.toggle("is-dirty", count > 0);
}

function updateGradeClassOptions(classes) {
  const current = gradeEls.className.value;
  gradeEls.className.innerHTML = `<option value="">Toutes les classes</option>` + (classes || []).map((name) =>
    `<option value="${gradeEscape(name)}">${gradeEscape(name)}</option>`
  ).join("");
  gradeEls.className.value = (classes || []).includes(current) ? current : "";
}

async function loadGradesPage({ force = false } = {}) {
  if (!gradeEls.level || gradesUi.loading) return;
  if (gradesUi.loaded && !force) return;
  gradesUi.loading = true;
  gradeEls.save.disabled = true;
  gradeEls.meta.textContent = "Chargement des élèves et des résultats…";
  try {
    const params = new URLSearchParams({
      level: gradeEls.level.value,
      period: gradeEls.period.value || "1"
    });
    if (gradeEls.className.value) params.set("className", gradeEls.className.value);
    const data = await apiFetch(`/api/grades?${params.toString()}`);
    gradesUi.data = data;
    gradesUi.loaded = true;
    gradesUi.dirty.clear();
    gradesUi.invalid.clear();
    updateGradeClassOptions(data.classes || []);
    gradeEls.title.textContent = `Saisie — Période ${data.period}`;
    gradeEls.meta.textContent = `${data.schoolYearLabel} · ${data.level === "primaire" ? "Primaire" : "Secondaire"} · ${data.className || "Toutes les classes"} · ${data.rows.length} élève${data.rows.length === 1 ? "" : "s"}`;
    gradeEls.repeated.textContent = String(data.insights?.repeatedFailures || 0);
    gradeEls.improving.textContent = String(data.insights?.improving || 0);
    gradeEls.declining.textContent = String(data.insights?.declining || 0);
    renderGradeTable();
    renderGradeTrend();
    renderGradeReport();
    updateGradeSaveState();
  } catch (error) {
    gradeEls.meta.textContent = `Impossible de charger les notes: ${error.message || error}`;
    gradeNotify(error.message || "Impossible de charger les notes", "error");
  } finally {
    gradesUi.loading = false;
    updateGradeSaveState();
  }
}

function mayDiscardGradeChanges() {
  return (gradesUi.dirty.size === 0 && gradesUi.invalid.size === 0) || window.confirm("Des notes n’ont pas été enregistrées. Continuer et les perdre ?");
}

async function changeGradeScope({ levelChanged = false } = {}) {
  if (!mayDiscardGradeChanges()) return false;
  if (levelChanged) {
    fillGradePeriods({ keep: false });
    gradeEls.className.value = "";
  }
  gradesUi.loaded = false;
  await loadGradesPage({ force: true });
  return true;
}

async function saveGrades() {
  if (!gradesUi.data || !gradesUi.dirty.size || gradesUi.loading) return;
  gradesUi.loading = true;
  updateGradeSaveState();
  gradeEls.saveState.textContent = "Enregistrement…";
  try {
    const grades = Array.from(gradesUi.dirty.entries()).map(([studentId, score]) => ({ studentId, score }));
    const result = await apiFetch("/api/grades/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolYearStartYear: gradesUi.data.schoolYearStartYear,
        level: gradesUi.data.level,
        period: gradesUi.data.period,
        grades
      })
    });
    gradesUi.dirty.clear();
    gradeNotify(`${result.saved || 0} note${result.saved === 1 ? "" : "s"} enregistrée${result.saved === 1 ? "" : "s"}`);
    gradesUi.loaded = false;
    gradesUi.loading = false;
    await loadGradesPage({ force: true });
  } catch (error) {
    gradesUi.loading = false;
    gradeEls.saveState.textContent = "Échec de l’enregistrement";
    gradeNotify(error.message || "Impossible d’enregistrer les notes", "error");
    updateGradeSaveState();
  }
}

function exportGradesCsv() {
  if (!gradesUi.data) return;
  const rows = currentGradeRows();
  const quote = (value) => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
  const lines = [
    ["Élève", "Matricule", "Classe", "Niveau", "Période", "Note sur 100", "Résultat"],
    ...rows.map((row) => {
      const score = gradeScore(row);
      return [row.fullName, row.matricule, row.className, gradesUi.data.level, gradesUi.data.period, score == null ? "" : score, score == null ? "Non saisie" : score < 50 ? "Échec" : "Réussite"];
    })
  ];
  const csv = `\uFEFF${lines.map((line) => line.map(quote).join(";")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `notes-${gradesUi.data.level}-periode-${gradesUi.data.period}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

fillGradePeriods({ keep: false });

gradeEls.level?.addEventListener("change", async (event) => {
  const previous = gradesUi.data?.level || "primaire";
  if (!(await changeGradeScope({ levelChanged: true }))) event.target.value = previous;
});
gradeEls.className?.addEventListener("change", async (event) => {
  const previous = gradesUi.data?.className || "";
  if (!(await changeGradeScope())) event.target.value = previous;
});
gradeEls.period?.addEventListener("change", async (event) => {
  const previous = gradesUi.data?.period || 1;
  if (!(await changeGradeScope())) event.target.value = String(previous);
});
gradeEls.search?.addEventListener("input", renderGradeTable);
gradeEls.failures?.addEventListener("click", () => {
  gradesUi.failuresOnly = !gradesUi.failuresOnly;
  gradeEls.failures.setAttribute("aria-pressed", String(gradesUi.failuresOnly));
  gradeEls.failures.classList.toggle("is-active", gradesUi.failuresOnly);
  gradeEls.failures.textContent = gradesUi.failuresOnly ? "Afficher tous" : "Afficher les échecs";
  renderGradeTable();
});
gradeEls.save?.addEventListener("click", saveGrades);
gradeEls.export?.addEventListener("click", exportGradesCsv);
gradeEls.reportType?.addEventListener("change", renderGradeReport);
gradeEls.printReport?.addEventListener("click", () => {
  document.body.classList.add("print-grades-report");
  const cleanup = () => document.body.classList.remove("print-grades-report");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1500);
});

gradeEls.tbody?.addEventListener("input", (event) => {
  const input = event.target.closest(".grade-input");
  if (!input) return;
  const rowElement = input.closest("tr[data-student-id]");
  const studentId = rowElement?.dataset.studentId;
  const row = (gradesUi.data?.rows || []).find((item) => String(item.studentId) === String(studentId));
  if (!row) return;
  const raw = input.value.trim();
  const score = raw === "" ? null : Number(raw);
  const valid = score == null || (Number.isFinite(score) && score >= 0 && score <= 100);
  input.classList.toggle("is-invalid", !valid);
  if (!valid) {
    gradesUi.invalid.add(String(studentId));
    updateGradeSaveState();
    return;
  }
  gradesUi.invalid.delete(String(studentId));
  const original = row.score == null ? null : Number(row.score);
  if (score === original) gradesUi.dirty.delete(String(studentId));
  else gradesUi.dirty.set(String(studentId), score);
  const resultCell = rowElement.querySelector("[data-grade-result]");
  resultCell.innerHTML = score == null
    ? `<span class="grade-result is-missing">Non saisie</span>`
    : score < 50
      ? `<span class="grade-result is-failed">Échec</span>`
      : `<span class="grade-result is-passed">Réussite</span>`;
  rowElement.classList.toggle("is-failed", score != null && score < 50);
  renderGradeSummary();
  renderGradeReport();
  updateGradeSaveState();
});

gradeEls.tbody?.addEventListener("keydown", (event) => {
  const input = event.target.closest(".grade-input");
  if (!input || !["Enter", "ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const inputs = Array.from(gradeEls.tbody.querySelectorAll(".grade-input"));
  const current = inputs.indexOf(input);
  const delta = event.key === "ArrowUp" ? -1 : 1;
  inputs[current + delta]?.focus();
  inputs[current + delta]?.select();
});

window.loadGradesPage = loadGradesPage;
window.openGradesForStudent = function openGradesForStudent({ studentId, level } = {}) {
  if (!gradeEls.level || !studentId) return;
  if (!mayDiscardGradeChanges()) return;
  const normalizedLevel = String(level || "").toLowerCase();
  if (!["primaire", "secondaire"].includes(normalizedLevel)) return;
  gradeEls.level.value = normalizedLevel;
  fillGradePeriods({ keep: false });
  gradeEls.className.value = "";
  gradeEls.search.value = String(studentId);
  gradesUi.failuresOnly = false;
  gradeEls.failures?.setAttribute("aria-pressed", "false");
  gradeEls.failures?.classList.remove("is-active");
  if (gradeEls.failures) gradeEls.failures.textContent = "Afficher les échecs";
  gradesUi.loaded = false;
  setView("grades");
};
