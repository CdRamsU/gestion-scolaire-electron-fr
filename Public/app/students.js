/*********************
 * Students view (API add/delete + fallback)
 *********************/
let oldStudentsLookupRows = [];
let oldStudentsLookupRequestSeq = 0;
let oldStudentsLookupSchoolYearLabel = "";
let enrollmentMode = "new";
let enrollmentCurrentStep = 1;
let selectedOldStudentForEnrollment = null;

function setEnrollmentStatus(element, message = "", isError = false){
  if(!element) return;
  element.textContent = String(message || "");
  element.classList.toggle("is-error", Boolean(isError));
}

function updateEnrollmentSchoolYearLabel(){
  if(!stEnrollmentYear) return;
  const configured = Number(getActiveSchoolYearStartYear?.());
  const now = new Date();
  const fallback = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const year = Number.isFinite(configured) ? configured : fallback;
  stEnrollmentYear.textContent = `${year}-${year + 1}`;
}

function setEnrollmentStep(step){
  const next = Math.max(1, Math.min(3, Number(step) || 1));
  enrollmentCurrentStep = next;
  if(stEnrollmentStep1) stEnrollmentStep1.hidden = next !== 1;
  if(stEnrollmentStep2) stEnrollmentStep2.hidden = next !== 2;
  if(stEnrollmentStep3) stEnrollmentStep3.hidden = next !== 3;
  document.querySelectorAll("[data-enrollment-step]").forEach((button) => {
    const value = Number(button.dataset.enrollmentStep || 0);
    button.classList.toggle("is-active", value === next);
    button.classList.toggle("is-complete", value < next);
  });
  document.querySelector(".enrollment-shell")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function setEnrollmentMode(mode){
  enrollmentMode = mode === "returning" ? "returning" : "new";
  const returning = enrollmentMode === "returning";
  if(stModeNew){
    stModeNew.classList.toggle("is-active", !returning);
    stModeNew.setAttribute("aria-pressed", String(!returning));
  }
  if(stLookupOldBtn){
    stLookupOldBtn.classList.toggle("is-active", returning);
    stLookupOldBtn.setAttribute("aria-pressed", String(returning));
  }
  if(stNewStudentFields) stNewStudentFields.hidden = returning;
  if(stOldLookupPanel) stOldLookupPanel.hidden = !returning;
  setEnrollmentStatus(stStep1Status, "");
  if(returning){
    renderOldStudentsLookupMeta();
    searchOldStudentsForEnrollment(stOldLookupQuery?.value || "");
    requestAnimationFrame(() => stOldLookupQuery?.focus());
  }
}

function normalizeEnrollmentDate(raw){
  const value = String(raw || "").trim();
  if(!value) return "";
  const fr = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(fr){
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day){
      return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
  }
  return "invalid";
}

function validateEnrollmentIdentity(){
  if(enrollmentMode === "returning"){
    if(!selectedOldStudentForEnrollment){
      setEnrollmentStatus(stStep1Status, "Sélectionnez un ancien élève dans les résultats.", true);
      return false;
    }
    return true;
  }
  if(!String(stName?.value || "").trim()){
    setEnrollmentStatus(stStep1Status, "Le nom complet est obligatoire.", true);
    stName?.focus();
    return false;
  }
  if(!["M","F"].includes(String(stSex?.value || "").toUpperCase())){
    setEnrollmentStatus(stStep1Status, "Choisissez le sexe de l’élève.", true);
    stSex?.focus();
    return false;
  }
  if(normalizeEnrollmentDate(stDateOfBirth?.value) === "invalid"){
    setEnrollmentStatus(stStep1Status, "Date de naissance invalide (JJ/MM/AAAA).", true);
    stDateOfBirth?.focus();
    return false;
  }
  setEnrollmentStatus(stStep1Status, "");
  return true;
}

function enrollmentClassName(){
  const level = String(stLevel?.value || "").trim();
  const base = String(stClass?.value || "").trim();
  const code = String(stCode?.value || "").trim();
  return shouldUseCode(level) ? `${base} ${code}`.trim() : base;
}

function validateEnrollmentPlacement(){
  const level = String(stLevel?.value || "").trim();
  const base = String(stClass?.value || "").trim();
  const code = String(stCode?.value || "").trim();
  const due = Number(stDue?.value);
  if(!level){ setEnrollmentStatus(stStep2Status, "Choisissez le niveau.", true); stLevel?.focus(); return false; }
  if(!base){ setEnrollmentStatus(stStep2Status, "Choisissez la classe.", true); stClass?.focus(); return false; }
  if(shouldUseCode(level) && !code){ setEnrollmentStatus(stStep2Status, "Choisissez la section.", true); stCode?.focus(); return false; }
  if(!String(stStartMonth?.value || "").match(/^\d{4}-\d{2}$/)){ setEnrollmentStatus(stStep2Status, "Choisissez le début de facturation.", true); return false; }
  if(!Number.isFinite(due) || due < 0){ setEnrollmentStatus(stStep2Status, "Le montant mensuel est invalide.", true); return false; }
  setEnrollmentStatus(stStep2Status, "");
  return true;
}

function updateEnrollmentPlacementPreview(){
  const level = String(stLevel?.value || "").trim();
  const base = String(stClass?.value || "").trim();
  const code = String(stCode?.value || "").trim().toUpperCase();
  const className = enrollmentClassName();
  if(stPlacementPreview) stPlacementPreview.textContent = className || "Classe non choisie";
  if(stFeePreview){
    const due = Number(stDue?.value);
    stFeePreview.textContent = Number.isFinite(due) ? `$${due.toFixed(2)} / mois` : "—";
  }
  if(stCapacityPreview){
    if(!level || !base || !code){
      stCapacityPreview.textContent = "Choisissez le niveau, la classe et la section.";
    }else{
      const counts = computeClassCodeCounts(level, base);
      const count = Number(counts.get(code) || 0);
      stCapacityPreview.textContent = `${count}/${CLASS_CODE_CAPACITY} élèves actuellement · ${Math.max(0, CLASS_CODE_CAPACITY - count)} place(s) disponible(s)`;
      stCapacityPreview.classList.toggle("is-warning", count >= CLASS_CODE_CAPACITY - 5);
    }
  }
}

function renderEnrollmentReview(){
  if(!stEnrollmentReview) return;
  const old = selectedOldStudentForEnrollment;
  const name = enrollmentMode === "returning" ? old?.fullName : String(stName?.value || "").trim();
  const sex = enrollmentMode === "returning" ? old?.sex : String(stSex?.value || "").toUpperCase();
  const due = Number(stDue?.value || 0);
  const familyInput = String(stFamilyLink?.value || "").trim();
  const familyLabel = familyInput
    ? String(enrollmentFamilyLinkByLabel.get(familyInput)?.familyLabel || familyInput).trim()
    : "Nouvelle famille";
  const rows = [
    ["Dossier", enrollmentMode === "returning" ? "Réinscription — matricule conservé" : "Nouvel élève — matricule automatique"],
    ["Élève", name || "—"],
    ["Matricule", enrollmentMode === "returning" ? (old?.matricule || old?.id || "—") : "Généré après confirmation"],
    ["Sexe", sex === "F" ? "Féminin" : sex === "M" ? "Masculin" : "—"],
    ["Famille", familyLabel],
    ["Affectation", `${apiLevelToLabel(stLevel?.value)} · ${enrollmentClassName()}`],
    ["Facturation", `$${due.toFixed(2)} / mois, à partir de ${monthLabelFromMonthKeyWithYear(stStartMonth?.value || "")}`]
  ];
  stEnrollmentReview.innerHTML = rows.map(([label,value], index) => `<div class="${index === 1 ? "is-primary" : ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
}

const enrollmentFamilyLinkByLabel = new Map();
function renderEnrollmentFamilyOptions(){
  if(!stFamilyLink || !stFamilyOptions) return;
  const keep = String(stFamilyLink.value || "");
  const currentYear = Number(getActiveSchoolYearStartYear());
  const rows = (Array.isArray(students) ? students : []).filter((student) =>
    isStudentActiveRecord(student) && (!Number.isFinite(currentYear) || Number(student.schoolYearStartYear) === currentYear)
  );
  const grouped = new Map();
  rows.forEach((student) => {
    const familyId = String(student.familyId || "").trim();
    const key = familyId ? `family:${familyId}` : `student:${student.id}`;
    const group = grouped.get(key) || {
      key,
      familyId,
      familyName: String(student.familyName || student.parentName || "").trim(),
      students: []
    };
    group.students.push(student);
    grouped.set(key, group);
  });
  const options = Array.from(grouped.values()).sort((a, b) => {
    const aLabel = a.familyName || a.students[0]?.name || "";
    const bLabel = b.familyName || b.students[0]?.name || "";
    return aLabel.localeCompare(bLabel, "fr", { sensitivity: "base" });
  });
  enrollmentFamilyLinkByLabel.clear();
  stFamilyOptions.innerHTML = options.map((group) => {
    const names = group.students.map((student) => student.name).filter(Boolean);
    const heading = group.familyName ? group.familyName : `Famille de ${names[0] || "l’élève"}`;
    const firstStudent = group.students[0];
    const suffix = group.students.length > 1 ? `${group.students.length} enfants` : `${names[0] || "1 enfant"} · ${firstStudent?.matricule || firstStudent?.id || ""}`;
    const label = `${heading} — ${suffix}`;
    enrollmentFamilyLinkByLabel.set(label, { key: group.key, familyLabel: heading });
    return `<option value="${esc(label)}"></option>`;
  }).join("");
  stFamilyLink.value = keep;
}

stFamilyLink?.addEventListener("change", () => {
  const link = String(enrollmentFamilyLinkByLabel.get(String(stFamilyLink.value || "").trim())?.key || "");
  const token = link.includes(":") ? link.slice(link.indexOf(":") + 1) : "";
  const relative = (Array.isArray(students) ? students : []).find((student) =>
    link.startsWith("family:") ? String(student.familyId || "") === token : String(student.id || "") === token
  );
  if(relative){
    if(stParentName && !String(stParentName.value || "").trim()) stParentName.value = relative.parentName || "";
    if(stParentPhone && !String(stParentPhone.value || "").trim()) stParentPhone.value = relative.parentPhone || "";
  }
});

function selectOldStudentForEnrollment(studentId){
  const row = oldStudentsLookupRows.find((item) => String(item.id) === String(studentId));
  if(!row) return;
  selectedOldStudentForEnrollment = row;
  if(stOldSelected){
    stOldSelected.hidden = false;
    stOldSelected.innerHTML = `<div><span>Élève sélectionné</span><strong>${esc(row.fullName)}</strong><small>${esc(row.matricule)} · ${esc(row.className || "—")} · ${esc(apiLevelToLabel(row.level))}</small></div><button class="btn" type="button" data-clear-old-student="1">Changer</button>`;
  }
  if(stOldLookupResults) stOldLookupResults.hidden = true;
  if(stLevel){
    stLevel.value = row.level || "";
    syncStudentFormFromLevel();
  }
  if(stDue && Number.isFinite(Number(row.monthlyDue))) stDue.value = String(Number(row.monthlyDue));
  setEnrollmentStatus(stStep1Status, "Dossier retrouvé. Le matricule sera conservé.");
}

function resetEnrollmentWorkflow(){
  selectedOldStudentForEnrollment = null;
  if(stOldSelected){ stOldSelected.hidden = true; stOldSelected.innerHTML = ""; }
  if(stOldLookupResults) stOldLookupResults.hidden = false;
  setEnrollmentMode("new");
  setEnrollmentStep(1);
  updateEnrollmentPlacementPreview();
}

async function submitEnrollmentWorkflow(){
  if(enrollmentMode === "returning"){
    if(!selectedOldStudentForEnrollment) return setEnrollmentStatus(stStep3Status, "Ancien élève non sélectionné.", true);
    await enrollOldStudentFromLookup(selectedOldStudentForEnrollment.id);
    return;
  }
  await addStudentApi();
}

async function renderStudentsTable(){
  updateEnrollmentSchoolYearLabel();
  studentsVisibleCount = STUDENTS_LIST_STEP;
  try{
    const apiStudents = await apiFetch("/api/students?includeInactive=1");
    stApiStatus.textContent = `API: OK (${apiStudents.length} élève(s))`;
    studentsTableRows = apiStudents.map(s => ({
      id: s.id,
      matricule: s.matricule || s.id,
      fullName: s.fullName,
      className: s.className || "—",
      levelValue: String(s.level || "").toLowerCase(),
      levelLabel: apiLevelToLabel(s.level),
      monthlyDue: Number(s.monthlyDue || 0),
      isActive: s.isActive !== false && s.isActive !== 0 && s.isActive !== "0",
      inactiveReasonCategory: String(s.inactiveReasonCategory || ""),
      inactiveReasonNote: String(s.inactiveReasonNote || ""),
      inactiveAt: s.inactiveAt || "",
      inactiveByUsername: String(s.inactiveByUsername || "")
    }));
    studentsTableMode = "api";
  }catch(err){
    const msg = String(err?.message || "").toLowerCase();
    if(msg.includes("session") || msg.includes("unauthorized")){
      stApiStatus.textContent = `Session expirée`;
      studentsTableRows = [];
      studentsTableMode = "api";
      renderStudentsTableGrouped();
      return;
    }
    stApiStatus.textContent = `API: indisponible`;
    // Fallback to current in-memory dataset (last known API data), never demo data.
    studentsTableRows = (Array.isArray(students) ? students : []).map(s => ({
      id: s.id,
      matricule: s.matricule || s.id,
      fullName: s.name,
      className: s.className || "—",
      levelValue: String((s.level || "")).toLowerCase(),
      levelLabel: s.level || "—",
      monthlyDue: Number(s.monthlyDueUSD || 0),
      isActive: s.isActive !== false,
      inactiveReasonCategory: String(s.inactiveReasonCategory || ""),
      inactiveReasonNote: String(s.inactiveReasonNote || ""),
      inactiveAt: s.inactiveAt || "",
      inactiveByUsername: String(s.inactiveByUsername || "")
    }));
    studentsTableMode = "api-cache";
  }
  renderStudentsTableGrouped();
}

function syncStudentsListFilterOptions(rows){
  if(!stListLevelFilter || !stListClassFilter) return;
  const sourceRows = Array.isArray(rows) ? rows : [];
  const prevLevel = String(stListLevelFilter.value || "").trim().toLowerCase();
  const savedLevel = String(stListLevelFilter.dataset.savedLevel || "").trim().toLowerCase();
  const prevClass = String(stListClassFilter.value || "").trim();
  const savedClass = String(stListClassFilter.dataset.savedClass || "").trim();

  const levels = [...new Set(
    sourceRows
      .map(r => String(r.levelValue || "").trim().toLowerCase())
      .filter(Boolean)
  )].sort((a,b) => apiLevelToLabel(a).localeCompare(apiLevelToLabel(b), "fr"));

  stListLevelFilter.innerHTML =
    `<option value="">Tous les niveaux</option>` +
    levels.map((lvl) => `<option value="${esc(lvl)}">${esc(apiLevelToLabel(lvl))}</option>`).join("");

  const desiredLevel = savedLevel || prevLevel;
  const activeLevel = levels.includes(desiredLevel) ? desiredLevel : "";
  stListLevelFilter.value = activeLevel;
  stListLevelFilter.dataset.savedLevel = "";

  if(!activeLevel){
    stListClassFilter.disabled = true;
    stListClassFilter.innerHTML = `<option value="">Toutes les classes</option>`;
    stListClassFilter.value = "";
    stListClassFilter.dataset.savedClass = "";
    return;
  }

  const classes = [...new Set(
    sourceRows
      .filter((r) => String(r.levelValue || "").trim().toLowerCase() === activeLevel)
      .map((r) => String(r.className || "").trim())
      .filter(Boolean)
  )].sort((a,b) => a.localeCompare(b, "fr"));

  stListClassFilter.disabled = false;
  stListClassFilter.innerHTML =
    `<option value="">Toutes les classes</option>` +
    classes.map((cls) => `<option value="${esc(cls)}">${esc(cls)}</option>`).join("");

  const desiredClass = savedClass || prevClass;
  stListClassFilter.value = classes.includes(desiredClass) ? desiredClass : "";
  stListClassFilter.dataset.savedClass = "";
}

function renderStudentsTableGrouped(){
  if(stListSearch && stListSearch.dataset.restored !== "1"){
    const ui = getUiState();
    if(typeof ui.studentsListSearch === "string") stListSearch.value = ui.studentsListSearch;
    if(stListClassFilter && typeof ui.studentsListClass === "string"){
      stListClassFilter.dataset.savedClass = String(ui.studentsListClass || "").trim();
    }
    if(stListLevelFilter && typeof ui.studentsListLevel === "string"){
      stListLevelFilter.dataset.savedLevel = String(ui.studentsListLevel || "").trim().toLowerCase();
    }
    stListSearch.dataset.restored = "1";
  }

  syncStudentsListFilterOptions(studentsTableRows);

  const levelFilter = String(stListLevelFilter?.value || "").trim().toLowerCase();
  const classFilter = String(stListClassFilter?.value || "").trim();
  const searchQuery = String(stListSearch?.value || "").trim().toLowerCase();

  if(!studentsTableRows.length){
    stTbody.innerHTML = `<tr><td colspan="6" style="opacity:.7;">Aucun élève.</td></tr>`;
    if(studentsListPrintMeta){
      studentsListPrintMeta.textContent = `Niveau: Tous les niveaux • Classe: Toutes les classes • Total: 0`;
    }
    return;
  }

  const baseRows = studentsTableRows.filter((s) => {
    if(levelFilter && String(s.levelValue || "").toLowerCase() !== levelFilter) return false;
    if(classFilter && String(s.className || "") !== classFilter) return false;
    if(!searchQuery) return true;
    return [
      s.id,
      s.matricule,
      s.fullName,
      s.className,
      s.levelLabel,
      s.levelValue
    ].some((v) => String(v || "").toLowerCase().includes(searchQuery));
  });
  if(!baseRows.length){
    stTbody.innerHTML = `<tr><td colspan="6" style="opacity:.7;">Aucun élève trouvé.</td></tr>`;
    if(studentsListPrintMeta){
      const lvlLabel = levelFilter ? apiLevelToLabel(levelFilter) : "Tous les niveaux";
      const clsLabel = classFilter || "Toutes les classes";
      studentsListPrintMeta.textContent = `Niveau: ${lvlLabel} • Classe: ${clsLabel} • Total: 0`;
    }
    return;
  }

  const ordered = baseRows
    .slice()
    .sort((a,b) => {
      const c = String(a.className || "").localeCompare(String(b.className || ""), "fr");
      if(c !== 0) return c;
      return String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr");
    });
  const limit = studentsPrintRestore?.active ? ordered.length : studentsVisibleCount;
  const visible = ordered.slice(0, limit);

  const grouped = {};
  for(const s of visible){
    const k = `${String(s.levelValue || "").toLowerCase()}||${s.className || "—"}`;
    if(!grouped[k]) grouped[k] = [];
    grouped[k].push(s);
  }

  const classes = Object.keys(grouped).sort((a,b) => a.localeCompare(b, "fr"));
  let html = "";
  for(const classKey of classes){
    const rows = grouped[classKey];
    const first = rows[0] || {};
    const className = String(first.className || "—");
    const levelLabel = String(first.levelLabel || apiLevelToLabel(first.levelValue));
    const groupId = encodeURIComponent(classKey);
    const collapsed = studentsPrintRestore?.active ? false : Boolean(studentsClassCollapsed[groupId]);
    const arrow = collapsed ? "▸" : "▾";

    html += `
      <tr>
        <td colspan="6" class="students-class-head">
          <button class="students-class-toggle" type="button" data-st-toggle-class="${groupId}" aria-expanded="${collapsed ? "false" : "true"}">
            <span>${arrow}</span> Classe: ${esc(className)} • ${esc(levelLabel)} (${rows.length})
          </button>
        </td>
      </tr>
    `;

    html += rows.map(s => {
      const canToggle = canToggleStudentActive();
      const canDelete = canManageStudents();
      const rowStyle = `${s.isActive ? '' : 'opacity:0.5; background:#f5f5f5;'}${collapsed ? 'display:none;' : ''}`;
      const inactiveMeta = !s.isActive
        ? [
            s.inactiveReasonCategory ? `Radié: ${s.inactiveReasonCategory}` : "Radié",
            s.inactiveReasonNote ? s.inactiveReasonNote : "",
            s.inactiveByUsername ? `par ${s.inactiveByUsername}` : ""
          ].filter(Boolean).join(" - ")
        : "";
      return `
        <tr style="${rowStyle}">
          <td>${esc(s.matricule || s.id)}</td>
          <td><strong>${esc(s.fullName)}</strong>${inactiveMeta ? `<div class="tiny">${esc(inactiveMeta)}</div>` : ""}</td>
          <td>${esc(s.className || "—")}</td>
          <td>${esc(s.levelLabel)}</td>
          <td>${formatMonthlyDueUSD(Number(s.monthlyDue || 0))}</td>
          <td>
            ${
              studentsTableMode === "api"
                ? `
            <button class="btn ${s.isActive ? 'warning' : 'success'}" ${canToggle ? "" : "disabled"}
              onclick="toggleStudentActive('${esc(s.id)}', ${s.isActive ? 'false' : 'true'})">
              ${s.isActive ? 'Inactiver' : 'Activer'}
            </button>
            <button class="btn" type="button" data-st-profile-id="${esc(s.id)}">Profil</button>
            <button class="btn danger" ${canDelete ? "" : "disabled"} onclick="deleteStudentApi('${esc(s.id)}')">Supprimer</button>
            `
                : `<span class="tiny">DEMO</span>`
            }
          </td>
        </tr>
      `;
    }).join("");

  }
  if(baseRows.length > studentsVisibleCount && !studentsPrintRestore?.active){
    html += `
      <tr>
        <td colspan="6" style="text-align:center">
          <button class="btn" data-st-see-more-global="1">
            Voir plus (${baseRows.length - studentsVisibleCount})
          </button>
        </td>
      </tr>
    `;
  }
  if(studentsVisibleCount > STUDENTS_LIST_STEP && !studentsPrintRestore?.active){
    html += `
      <tr>
        <td colspan="6" style="text-align:center">
          <button class="btn" data-st-see-less-global="1">Voir moins</button>
        </td>
      </tr>
    `;
  }
  stTbody.innerHTML = html;

  if(studentsListPrintMeta){
    const lvlLabel = levelFilter ? apiLevelToLabel(levelFilter) : "Tous les niveaux";
    const clsLabel = classFilter || "Toutes les classes";
    studentsListPrintMeta.textContent = `Niveau: ${lvlLabel} • Classe: ${clsLabel} • Total: ${baseRows.length} • Généré le ${fmtDateTime(new Date())}`;
  }
}

function getStudentsListPrintSource(){
  const levelFilter = String(stListLevelFilter?.value || "").trim().toLowerCase();
  const classFilter = String(stListClassFilter?.value || "").trim();
  const searchQuery = String(stListSearch?.value || "").trim().toLowerCase();
  const rows = studentsTableRows.filter((s) => {
    if(s.isActive === false) return false; // la liste imprimée n'inclut que les élèves actifs
    if(levelFilter && String(s.levelValue || "").toLowerCase() !== levelFilter) return false;
    if(classFilter && String(s.className || "") !== classFilter) return false;
    if(!searchQuery) return true;
    return [
      s.id,
      s.matricule,
      s.fullName,
      s.className,
      s.levelLabel,
      s.levelValue
    ].some((v) => String(v || "").toLowerCase().includes(searchQuery));
  });
  return {
    rows,
    levelFilter,
    classFilter,
    levelLabel: levelFilter ? apiLevelToLabel(levelFilter) : "Tous les niveaux",
    classLabel: classFilter || "Toutes les classes"
  };
}

function parseStudentsListPrintClassMeta(className){
  const rawClassName = String(className || "-").trim() || "-";
  if(typeof splitReportClassBaseCode === "function"){
    const parsed = splitReportClassBaseCode(rawClassName);
    return {
      className: rawClassName,
      baseClass: String(parsed?.baseClass || rawClassName).trim() || rawClassName,
      classCode: String(parsed?.code || "").trim().toUpperCase()
    };
  }
  const match = rawClassName.match(/^(.*\S)\s+([A-Z])$/i);
  return {
    className: rawClassName,
    baseClass: match ? String(match[1] || "").trim() : rawClassName,
    classCode: match ? String(match[2] || "").trim().toUpperCase() : ""
  };
}

function compareStudentsListPrintGroups(a, b){
  if(typeof classOrderRankForLateReport === "function"){
    const rankA = classOrderRankForLateReport(a?.levelLabel || "", a?.baseClass || "");
    const rankB = classOrderRankForLateReport(b?.levelLabel || "", b?.baseClass || "");
    if(rankA.levelRank !== rankB.levelRank) return rankA.levelRank - rankB.levelRank;
    if(rankA.classRank !== rankB.classRank) return rankA.classRank - rankB.classRank;
  }
  const classCmp = String(a?.className || "").localeCompare(String(b?.className || ""), "fr", { numeric: true, sensitivity: "base" });
  if(classCmp !== 0) return classCmp;
  return String(a?.levelLabel || "").localeCompare(String(b?.levelLabel || ""), "fr", { numeric: true, sensitivity: "base" });
}

function buildStudentsListPrintHeaderHtml({ title = "", subtitle = "", stats = [], meta = [] } = {}){
  if(typeof buildReportDocHeaderHtml === "function"){
    return String(buildReportDocHeaderHtml({
      title,
      subtitle,
      stats,
      meta,
      fraisLabel: "Liste eleves"
    }) || "").replace(/<div class="report-doc-stat-row"><span>Frais<\/span><strong>[^<]*<\/strong><\/div>/i, "");
  }
  return [
    `<div class="report-doc-wrap">`,
    `  <div class="report-doc-title">${esc(title || "Liste des eleves")}</div>`,
    subtitle ? `  <div class="tiny">${esc(subtitle)}</div>` : "",
    `</div>`
  ].filter(Boolean).join("\n");
}

function buildStudentsListPrintReport(){
  const source = getStudentsListPrintSource();
  const generatedAt = fmtDateTime(new Date());
  const schoolYearLabel = (typeof schoolYearLabelFromStartYear === "function" && typeof getActiveSchoolYearStartYear === "function")
    ? (schoolYearLabelFromStartYear(getActiveSchoolYearStartYear()) || "")
    : "";
  const orderedRows = source.rows.slice().sort((a, b) => {
    const classCmp = String(a.className || "").localeCompare(String(b.className || ""), "fr", { numeric: true, sensitivity: "base" });
    if(classCmp !== 0) return classCmp;
    return String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr", { numeric: true, sensitivity: "base" });
  });
  const groupsMap = new Map();
  for(const row of orderedRows){
    const meta = parseStudentsListPrintClassMeta(row.className);
    const groupKey = `${String(row.levelValue || "").toLowerCase()}||${meta.className}`;
    const current = groupsMap.get(groupKey) || {
      className: meta.className,
      baseClass: meta.baseClass,
      levelLabel: row.levelLabel || apiLevelToLabel(row.levelValue),
      rows: []
    };
    current.rows.push({
      id: row.id,
      matricule: row.matricule || row.id,
      fullName: row.fullName,
      classCode: meta.classCode || "-"
    });
    groupsMap.set(groupKey, current);
  }
  const groups = Array.from(groupsMap.values()).sort(compareStudentsListPrintGroups);
  const metaText = `Niveau: ${source.levelLabel} | Classe: ${source.classLabel} | Total: ${source.rows.length} | Genere le ${generatedAt}`;

  if(!groups.length){
    return {
      html: [
        buildStudentsListPrintHeaderHtml({
          title: "Liste des eleves",
          subtitle: "Aucune classe selectionnee",
          stats: [
            { label: "Annee scolaire", value: schoolYearLabel || "-" },
            { label: "Nb total", value: "0" }
          ],
          meta: [
            { label: "Niveau", value: source.levelLabel },
            { label: "Classe", value: source.classLabel }
          ]
        }),
        `<div class="table-wrap"><table style="width:100%"><tbody><tr><td class="tiny">Aucun eleve a imprimer.</td></tr></tbody></table></div>`
      ].join("\n"),
      metaText
    };
  }

  const sectionsHtml = groups.map((group, idx) => {
    const classHeaderHtml = buildStudentsListPrintHeaderHtml({
      title: "Liste des eleves",
      subtitle: `Classe ${group.className}`,
      stats: [
        { label: "Annee scolaire", value: schoolYearLabel || "-" },
        { label: "Classe", value: group.className || "-" },
        { label: "Nb total", value: String(group.rows.length) }
      ],
      meta: [
        { label: "Niveau", value: group.levelLabel || "-" },
        { label: "Genere le", value: generatedAt }
      ]
    });
    const rowsHtml = group.rows
      .slice()
      .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""), "fr", { numeric: true, sensitivity: "base" }))
      .map((row) => `
        <tr>
          <td><strong>${esc(row.fullName || "-")}</strong></td>
          <td>${esc(row.matricule || row.id || "-")}</td>
          <td style="text-align:center">${esc(row.classCode || "-")}</td>
        </tr>
      `).join("");
    return [
      `<section class="report-late-class-section ${idx > 0 ? "report-late-class-section--new-page" : ""}">`,
      classHeaderHtml,
      `  <section class="report-late-group-section report-late-code-section">`,
      `    <div class="table-wrap">`,
      `      <table style="width:100%">`,
      `        <thead>`,
      `          <tr><th>Nom</th><th>Matricule</th><th>Code</th></tr>`,
      `        </thead>`,
      `        <tbody>`,
      rowsHtml || `          <tr><td colspan="3" class="tiny">Aucun eleve dans cette classe.</td></tr>`,
      `        </tbody>`,
      `      </table>`,
      `    </div>`,
      `  </section>`,
      `</section>`
    ].join("\n");
  }).join("");

  return {
    html: `<div class="report-late-groups-wrap" style="margin-top:0">${sectionsHtml}</div>`,
    metaText
  };
}

function clearStudentsListPrintReport(){
  if(studentsListPrintReport) studentsListPrintReport.innerHTML = "";
}

function printStudentsList(){
  if(!stTbody) return;
  if(!studentsTableRows.length){
    showInAppPopup("Aucune donnee a imprimer.");
    return;
  }
  studentsPrintRestore = {
    active: true,
    visibleCount: studentsVisibleCount,
    classCollapsed: { ...(studentsClassCollapsed || {}) },
    detailsOpen: Boolean(studentsListCard?.open)
  };
  studentsVisibleCount = Math.max(studentsVisibleCount, studentsTableRows.length);
  studentsClassCollapsed = Object.create(null);
  if(studentsListCard) studentsListCard.open = true;
  renderStudentsTableGrouped();
  const printReport = buildStudentsListPrintReport();
  if(studentsListPrintMeta) studentsListPrintMeta.textContent = printReport.metaText || "";
  if(studentsListPrintReport) studentsListPrintReport.innerHTML = printReport.html || "";

  if(isElectronRuntime()){
    const metaText = String(printReport.metaText || "").trim();
    const previewHtml = printReport.html || "";
    const opened = openElectronPrintPreviewWindow({
      title: "Apercu avant impression - Liste des eleves",
      subtitle: metaText,
      bodyHtml: previewHtml,
      printBodyClass: "print-students-list"
    });
    if(opened){
      clearStudentsListPrintReport();
      resetPrintUiStateAfterPrint();
      return;
    }
  }

  document.body.classList.add("print-students-list");
  window.print();
}

window.addEventListener("afterprint", clearStudentsListPrintReport);

function printCaisseHistoryOnly(){
  const rows = getCaisseSpendingRows();
  if(!rows.length){
    showInAppPopup("Aucune depense caisse a imprimer.");
    return;
  }
  const historyCard = document.getElementById("caisseHistoryCard");
  if(historyCard) historyCard.open = true;
  // Imprimer TOUT l'historique (filtré si une recherche est active), pas seulement les
  // lignes visibles à l'écran. On lève la limite le temps de l'impression, puis on restaure.
  const savedLimit = (typeof caisseHistoryVisibleLimit !== "undefined") ? caisseHistoryVisibleLimit : null;
  let restored = false;
  const restore = () => {
    if(restored) return;
    restored = true;
    if(savedLimit != null){ caisseHistoryVisibleLimit = savedLimit; renderCaisseHistory(); }
    window.removeEventListener("afterprint", restore);
  };
  if(savedLimit != null){
    caisseHistoryVisibleLimit = Number.MAX_SAFE_INTEGER;
    renderCaisseHistory();
  }
  window.addEventListener("afterprint", restore);
  document.body.classList.add("print-caisse-history");
  window.print();
  setTimeout(restore, 1500); // repli si l'évènement afterprint ne se déclenche pas
}

function getPreviousSchoolYearLabelForLookup(){
  const currentStart = Number(getActiveSchoolYearStartYear?.());
  if(!Number.isFinite(currentStart)) return "";
  // During enrollment preparation, old-student lookup should default to the latest known school year.
  return schoolYearLabelFromStartYear(currentStart);
}

function renderOldStudentsLookupMeta(){
  if(!stOldLookupMeta) return;
  const label = String(oldStudentsLookupSchoolYearLabel || "").trim() || getPreviousSchoolYearLabelForLookup();
  if(label){
    stOldLookupMeta.textContent = `Annee ciblee: ${label}. Selectionne un ancien eleve pour creer son dossier dans l'annee scolaire en cours.`;
    return;
  }
  stOldLookupMeta.textContent = "Selectionne un ancien eleve pour l'ajouter a l'annee scolaire en cours.";
}

function renderOldStudentsLookupEmpty(message){
  if(!stOldLookupResults) return;
  const text = String(message || "").trim();
  if(!text){
    stOldLookupResults.innerHTML = "";
    return;
  }
  stOldLookupResults.innerHTML = `<div class="st-old-lookup-empty">${esc(text)}</div>`;
}

async function searchOldStudentsForEnrollment(rawQuery = ""){
  if(!stOldLookupResults) return;
  const query = String(rawQuery || "").trim();
  const requestId = ++oldStudentsLookupRequestSeq;
  renderOldStudentsLookupEmpty("Recherche en cours...");
  try{
    const params = new URLSearchParams();
    if(query) params.set("q", query);
    params.set("limit", "30");
    const data = await apiFetch(`/api/students/old?${params.toString()}`);
    if(requestId !== oldStudentsLookupRequestSeq) return;

    const rows = Array.isArray(data?.rows) ? data.rows : [];
    oldStudentsLookupSchoolYearLabel = String(data?.schoolYearLabel || "").trim();
    renderOldStudentsLookupMeta();
    oldStudentsLookupRows = rows.map((row) => ({
      id: String(row?.id || "").trim(),
      matricule: String(row?.matricule || row?.id || "").trim(),
      fullName: String(row?.fullName || "").trim(),
      className: String(row?.className || "").trim(),
      level: String(row?.level || "").trim().toLowerCase(),
      sex: String(row?.sex || "").trim().toUpperCase(),
      monthlyDue: Number(row?.monthlyDue || 0),
      classEffectiveMonth: String(row?.classEffectiveMonth || "").trim()
    })).filter((row) => row.id && row.fullName);

    if(!oldStudentsLookupRows.length){
      renderOldStudentsLookupEmpty("Aucun ancien eleve trouve.");
      return;
    }

    const canEnroll = canAddStudents();
    stOldLookupResults.innerHTML = oldStudentsLookupRows.map((row) => {
      const lvlLabel = apiLevelToLabel(row.level);
      const classLabel = row.className || "-";
      const monthHint = row.classEffectiveMonth ? ` - Derniere inscription: ${row.classEffectiveMonth}` : "";
      return `
        <div class="st-old-lookup-item">
          <div class="st-old-lookup-item-meta">
            <strong>${esc(row.fullName)}</strong>
            <small>${esc(row.matricule || row.id)} - ${esc(classLabel)} - ${esc(lvlLabel)}${esc(monthHint)}</small>
          </div>
          <button
            class="btn primary"
            type="button"
            data-st-old-enroll-id="${esc(row.id)}"
            ${canEnroll ? "" : "disabled"}
          >
            Choisir
          </button>
        </div>
      `;
    }).join("");
  }catch(err){
    renderOldStudentsLookupEmpty(`Erreur de recherche: ${String(err?.message || err)}`);
  }
}

function toggleOldStudentsLookupPanel(){
  if(!stOldLookupPanel) return;
  setEnrollmentMode("returning");
  applySuggestedClassCode({ force: true, preferredCode: "A" });
}

function buildEnrollExistingStudentPayloadFromForm(){
  const payload = {};
  const level = String(stLevel?.value || "").trim().toLowerCase();
  const classBase = String(stClass?.value || "").trim();

  if(level || classBase){
    if(!level) throw new Error("Choisir un niveau avant d'inscrire l'ancien eleve.");
    if(!classBase) throw new Error("Choisir une classe avant d'inscrire l'ancien eleve.");
    let classCode = String(stCode?.value || "").trim();
    const needsCode = shouldUseCode(level);
    if(needsCode && !classCode){
      classCode = suggestClassCodeForOldStudent(level, classBase);
      if(stCode) stCode.value = classCode;
    }
    if(needsCode && !classCode){
      throw new Error("Choisir un code de classe.");
    }
    payload.level = level;
    payload.className = needsCode ? `${classBase} ${classCode}`.trim() : classBase;
  }

  let dueRaw = String(stDue?.value ?? "").trim();
  if(!dueRaw && level){
    syncDueFromLevel(level, { force: true });
    dueRaw = String(stDue?.value ?? "").trim();
  }
  if(dueRaw){
    const monthlyDue = Number(dueRaw);
    if(!Number.isFinite(monthlyDue) || monthlyDue < 0){
      throw new Error("Frais mensuels invalide (USD).");
    }
    payload.monthlyDue = monthlyDue;
  }

  const classEffectiveMonth = String(stStartMonth?.value || "").trim();
  if(classEffectiveMonth){
    if(!/^\d{4}-\d{2}$/.test(classEffectiveMonth)){
      throw new Error("Mois de debut facturation invalide (format AAAA-MM).");
    }
    payload.classEffectiveMonth = classEffectiveMonth;
  }

  return payload;
}

async function enrollOldStudentFromLookup(studentId){
  if(!canAddStudents()){
    showInAppPopup("Action reservee a admin/comptable/caissier.");
    return;
  }
  const id = String(studentId || "").trim();
  if(!id) return;

  try{
    const payload = buildEnrollExistingStudentPayloadFromForm();
    const enrolledStudent = await apiFetch(`/api/students/${encodeURIComponent(id)}/enroll`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if(stOldLookupPanel) stOldLookupPanel.hidden = true;
    if(stOldLookupQuery) stOldLookupQuery.value = "";
    oldStudentsLookupRows = [];
    renderOldStudentsLookupEmpty("");

    await loadStudents();
    await renderStudentsTable();

    const enrolledId = String(enrolledStudent?.id || id).trim();
    if(enrolledId && getStudentById(enrolledId)){
      selectStudent(enrolledId);
    }
    if(enrolledId){
      await loadStudentProfile(enrolledId, { open: true });
    }
    resetEnrollmentWorkflow();
    showToast("Ancien eleve inscrit", { variant: "success", duration: 2400 });
  }catch(err){
    if(err?.payload?.code === "CLASS_CODE_CAPACITY_REACHED" && err?.payload?.suggestedCode && stCode){
      stCode.value = String(err.payload.suggestedCode).toUpperCase();
      applySuggestedClassCode({ force: false });
    }
    showInAppPopup("Erreur: " + (err?.message || err));
  }
}

renderOldStudentsLookupMeta();

async function addStudentApi(){
  if(!canAddStudents()){
    showInAppPopup("Action réservée à admin/comptable/caissier.");
    return;
  }
  const fullName = String(stName.value || "").trim();
  const classBase = String(stClass.value || "").trim();
  let classCode = String(stCode.value || "").trim();
  const level = String(stLevel.value || "").trim();
  const sex = String(stSex?.value || "").trim().toUpperCase();
  const dateOfBirth = normalizeEnrollmentDate(stDateOfBirth?.value || "");
  const parentName = String(stParentName?.value || "").trim();
  const parentPhone = String(stParentPhone?.value || "").trim();
  const familyInput = String(stFamilyLink?.value || "").trim();
  const familyLink = String(enrollmentFamilyLinkByLabel.get(familyInput)?.key || "");
  if(familyInput && !familyLink) return showInAppPopup("Choisissez une famille proposée dans la liste, ou laissez le champ vide.");
  if(!String(stDue?.value ?? "").trim() && level){
    syncDueFromLevel(level, { force: true });
  }
  const monthlyDue = Number(stDue.value);
  const classEffectiveMonth = String(stStartMonth?.value || "").trim();
  const needsCode = shouldUseCode(level);
  if(needsCode && !classCode){
    classCode = suggestClassCodeForNewStudent(level, classBase);
    if(stCode) stCode.value = classCode;
  }
  const className = needsCode ? `${classBase} ${classCode}`.trim() : classBase;

  if(!fullName) return showInAppPopup("Nom complet requis.");
  if(!level) return showInAppPopup("Choisir un niveau.");
  if(!["M","F"].includes(sex)) return showInAppPopup("Choisir le sexe (M/F).");
  if(dateOfBirth === "invalid") return showInAppPopup("Date de naissance invalide (JJ/MM/AAAA).");
  if(!classBase) return showInAppPopup("Choisir une classe.");
  if(needsCode && !classCode) return showInAppPopup("Choisir un code de classe.");
  if(!Number.isFinite(monthlyDue) || monthlyDue < 0)
    return showInAppPopup("Frais mensuels invalide (USD).");
  if(classEffectiveMonth && !/^\d{4}-\d{2}$/.test(classEffectiveMonth))
    return showInAppPopup("Mois de début facturation invalide (format AAAA-MM).");

  try{
    const createdStudent = await apiFetch("/api/students", {
      method: "POST",
      body: JSON.stringify({
        fullName,
        className,
        level,
        sex,
        dateOfBirth: dateOfBirth || null,
        parentName: parentName || null,
        parentPhone: parentPhone || null,
        familyId: familyLink.startsWith("family:") ? familyLink.slice(7) : null,
        siblingStudentId: familyLink.startsWith("student:") ? familyLink.slice(8) : null,
        monthlyDue,
        classEffectiveMonth
      })
    });
    const createdStudentId = String(createdStudent?.id || "").trim();

    if(createdStudentId && canOpenStudentProfile()){
      const busDefault = findFeeTypeByCode("BUS");
      studentProfileState = {
        studentId: createdStudentId,
        student: createdStudent,
        payments: [],
        busSubscription: {
          studentId: createdStudentId,
          active: false,
          monthlyAmount: Number(busDefault?.defaultAmount || 0),
          monthlyCurrency: normalizeCurrencyCode(busDefault?.defaultCurrency || "USD")
        },
        feeStatuses: []
      };
      profileFeeStatusVisibleCount = PROFILE_FEE_STATUS_STEP;
      profileHistoryVisibleCount = Math.max(1, Number(pfHistoryLimit?.value || 10));
      renderStudentProfileModal();
      openStudentProfileModal();
    }

    // reset form
    stName.value = "";
    stClass.value = "";
    stCode.value = "";
    stLevel.value = "";
    if(stSex) stSex.value = "";
    if(stDateOfBirth) stDateOfBirth.value = "";
    if(stParentName) stParentName.value = "";
    if(stParentPhone) stParentPhone.value = "";
    if(stFamilyLink) stFamilyLink.value = "";
    stDue.value = "";
    if(stStartMonth){
      const d = new Date();
      stStartMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    stClass.disabled = true;
    stClass.innerHTML = `<option value="">— Choisir le niveau d’abord —</option>`;
    stCode.disabled = true;

    await loadStudents();
    await renderStudentsTable();
    if(createdStudentId && getStudentById(createdStudentId)){
      selectStudent(createdStudentId);
      loadStudentProfile(createdStudentId, { open: false }).catch(() => {});
    }

    resetEnrollmentWorkflow();
    showToast("Élève ajouté ✅", { variant: "success", duration: 2200 });
  }catch(err){
    if(err?.payload?.code === "CLASS_CODE_CAPACITY_REACHED" && err?.payload?.suggestedCode && stCode){
      stCode.value = String(err.payload.suggestedCode).toUpperCase();
      applySuggestedClassCode({ force: false });
    }
    showInAppPopup("Erreur: " + err.message);
  }
}

async function deleteStudentApi(id){
  if(!canManageStudents()){
    showInAppPopup("Suppression réservée à admin/comptable.");
    return;
  }
  const ok = await showAppConfirm({
    title: "Supprimer élève",
    message: "Supprimer cet élève ? (Ses paiements API seront aussi supprimés)",
    okText: "Supprimer",
    cancelText: "Annuler",
    okClass: "danger"
  });
  if(!ok) return;

  try{
    await apiFetch("/api/students/" + encodeURIComponent(id), { method:"DELETE" });
    await loadStudents();
    await renderStudentsTable();
  }catch(err){
    showInAppPopup("Erreur: " + err.message);
  }
}
function requestInactiveStudentReason(student){
  return new Promise((resolve) => {
    const s = student || {};
    let modal = document.getElementById("studentInactiveReasonModal");
    if(!modal){
      modal = document.createElement("div");
      modal.id = "studentInactiveReasonModal";
      modal.className = "modal-backdrop";
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="studentInactiveReasonTitle" style="max-width:560px;width:min(560px,96vw)">
          <div class="modal-head">
            <div>
              <h3 id="studentInactiveReasonTitle">Radier / inactiver l'élève</h3>
              <div id="studentInactiveReasonSubtitle" class="tiny"></div>
            </div>
            <button id="studentInactiveReasonClose" class="btn" type="button">Fermer</button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label for="studentInactiveReasonCategory">Catégorie / raison</label>
              <select id="studentInactiveReasonCategory" class="input">
                <option value="">— Choisir une catégorie —</option>
                <option value="Déménagement">Déménagement</option>
                <option value="Transfert">Transfert</option>
                <option value="Abandon">Abandon</option>
                <option value="Exclusion">Exclusion</option>
                <option value="Fin de cycle">Fin de cycle</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div class="field" style="margin-top:10px">
              <label for="studentInactiveReasonNote">Note / précision</label>
              <textarea id="studentInactiveReasonNote" class="input" rows="4" placeholder="Ex: déménagement, transfert demandé par parent..."></textarea>
              <div class="tiny">La note est obligatoire si vous choisissez « Autre ».</div>
            </div>
            <div id="studentInactiveReasonStatus" class="tiny" style="margin-top:10px;color:#b91c1c"></div>
          </div>
          <div class="modal-actions">
            <button id="studentInactiveReasonCancel" class="btn" type="button">Annuler</button>
            <button id="studentInactiveReasonSave" class="btn danger" type="button">Inactiver</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    const categoryEl = modal.querySelector("#studentInactiveReasonCategory");
    const noteEl = modal.querySelector("#studentInactiveReasonNote");
    const statusEl = modal.querySelector("#studentInactiveReasonStatus");
    const subtitleEl = modal.querySelector("#studentInactiveReasonSubtitle");
    const closeBtn = modal.querySelector("#studentInactiveReasonClose");
    const cancelBtn = modal.querySelector("#studentInactiveReasonCancel");
    const saveBtn = modal.querySelector("#studentInactiveReasonSave");
    const cleanup = (value) => {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      closeBtn?.removeEventListener("click", onCancel);
      cancelBtn?.removeEventListener("click", onCancel);
      saveBtn?.removeEventListener("click", onSave);
      modal.removeEventListener("click", onBackdrop);
      resolve(value);
    };
    const onCancel = () => cleanup(null);
    const onBackdrop = (event) => { if(event.target === modal) onCancel(); };
    const onSave = () => {
      const category = String(categoryEl?.value || "").trim();
      const note = String(noteEl?.value || "").trim();
      if(!category){
        if(statusEl) statusEl.textContent = "Choisissez une catégorie avant d'inactiver l'élève.";
        return;
      }
      if(category === "Autre" && !note){
        if(statusEl) statusEl.textContent = "Expliquez la raison pour la catégorie Autre.";
        return;
      }
      cleanup({ inactiveReasonCategory: category, inactiveReasonNote: note });
    };
    if(subtitleEl){
      subtitleEl.textContent = `${s.fullName || s.name || "Élève"}${s.matricule ? ` - ${s.matricule}` : ""}`;
    }
    if(categoryEl) categoryEl.value = "";
    if(noteEl) noteEl.value = "";
    if(statusEl) statusEl.textContent = "";
    closeBtn?.addEventListener("click", onCancel);
    cancelBtn?.addEventListener("click", onCancel);
    saveBtn?.addEventListener("click", onSave);
    modal.addEventListener("click", onBackdrop);
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => { try{ categoryEl?.focus(); }catch(_){} }, 50);
  });
}

async function toggleStudentActive(id, newState){
  if(!canToggleStudentActive()){
    showInAppPopup("Action réservée à admin/caissier.");
    return;
  }
  try {
    const student = studentsTableRows.find((row) => String(row.id || "") === String(id || ""))
      || (Array.isArray(students) ? students.find((row) => String(row.id || "") === String(id || "")) : null);
    let reasonPayload = {};
    if(newState === false){
      const reason = await requestInactiveStudentReason(student);
      if(!reason) return;
      reasonPayload = reason;
    }
    await apiFetch(`/api/students/${id}/active`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: newState, ...reasonPayload })
    });

    await loadStudents();
    await renderStudentsTable();

  } catch(err){
    showInAppPopup("Erreur: " + err.message);
  }
}
window.deleteStudentApi = deleteStudentApi;

async function changeStudentCodeApi(id, nextClassName){
  if(!canChangeClassCode()){
    showInAppPopup("Changement de code réservé à admin/caissier.");
    return;
  }
  const next = String(nextClassName || "").trim();
  if(!next) return;
  try{
    const existing = await apiFetch("/api/students/" + encodeURIComponent(id));
    await apiFetch("/api/students/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify({
        fullName: existing.fullName,
        level: existing.level,
        className: next,
        monthlyDue: existing.monthlyDue,
        currency: existing.currency
      })
    });
    await loadStudents();
    await renderStudentsTable();
    if(viewPayment.classList.contains("active")) renderStudentList();
    if(viewReports.classList.contains("active")) renderReports();
    renderDashboard();
  }catch(err){
    showInAppPopup("Erreur: " + err.message);
  }
}

updateEnrollmentSchoolYearLabel();
updateEnrollmentPlacementPreview();
