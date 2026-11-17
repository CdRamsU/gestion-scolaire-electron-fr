/***************
 * Settings events
 ***************/
setSaveBtn.addEventListener("click", applyRateSetting);
if(setThemeToggle){
  setThemeToggle.addEventListener("change", () => {
    applyThemeMode(setThemeToggle.checked ? "dark" : "light", { persist: true });
  });
}
if(setSchoolYearSaveBtn){
  setSchoolYearSaveBtn.addEventListener("click", () => {
    saveSchoolYearSetting().catch(() => {});
  });
}
if(setLevelFeeSaveBtn){
  setLevelFeeSaveBtn.addEventListener("click", () => {
    saveLevelFeesSetting().catch(() => {});
  });
}
setUsdToCdf.addEventListener("input", () => {
  const digits = onlyDigits(setUsdToCdf.value);
  setUsdToCdf.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
});
if(setSchoolYear){
  setSchoolYear.addEventListener("change", () => {
    const parsed = parseSchoolYearInput(setSchoolYear.value || "");
    if(!parsed) return;
    setSchoolYear.value = schoolYearLabelFromStartYear(parsed);
  });
}
if(setFeeTypePrice){
  setFeeTypePrice.addEventListener("input", () => {
    const digits = onlyDigits(setFeeTypePrice.value);
    setFeeTypePrice.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  });
}
if(setBusPrice){
  setBusPrice.addEventListener("input", () => {
    const digits = onlyDigits(setBusPrice.value);
    setBusPrice.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  });
}
[setLevelFeeMaternelle, setLevelFeePrimaire, setLevelFeeSecondaire, setLevelFeeSecondaire4eH].forEach((el) => {
  if(!el) return;
  el.addEventListener("input", () => {
    const digits = onlyDigits(el.value);
    el.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  });
});
if(setBusPriceSaveBtn){
  setBusPriceSaveBtn.addEventListener("click", () => {
    saveBusPriceSetting().catch(() => {});
  });
}

const setFeeDistUniforme = document.getElementById("setFeeDistUniforme");
const setFeeDistPromo = document.getElementById("setFeeDistPromo");
const setFeeDistJournalEcusson = document.getElementById("setFeeDistJournalEcusson");
const setFeeDistRate = document.getElementById("setFeeDistRate");
const setFeeDistAdmMat = document.getElementById("setFeeDistAdmMat");
const setFeeDistAdmPri = document.getElementById("setFeeDistAdmPri");
const setFeeDistAdmSec = document.getElementById("setFeeDistAdmSec");
const setFeeDistAdm4eLow = document.getElementById("setFeeDistAdm4eLow");
const setFeeDistAdm4eHigh = document.getElementById("setFeeDistAdm4eHigh");
const setFeeDistMinervalMonthly = document.getElementById("setFeeDistMinervalMonthly");
const setFeeDistMinervalMonths = document.getElementById("setFeeDistMinervalMonths");
const setFeeDistMinerval4eHMonths = document.getElementById("setFeeDistMinerval4eHMonths");
const setFeeDistFourthHClasses = document.getElementById("setFeeDistFourthHClasses");
const setFeeDistSaveBtn = document.getElementById("setFeeDistSaveBtn");
const setFeeDistStatus = document.getElementById("setFeeDistStatus");

function feeDistInputs(){
  return [
    setFeeDistUniforme,
    setFeeDistPromo,
    setFeeDistJournalEcusson,
    setFeeDistRate,
    setFeeDistAdmMat,
    setFeeDistAdmPri,
    setFeeDistAdmSec,
    setFeeDistAdm4eLow,
    setFeeDistAdm4eHigh,
    setFeeDistMinervalMonthly,
    setFeeDistMinervalMonths,
    setFeeDistMinerval4eHMonths
  ].filter(Boolean);
}

function parseFeeDistNumber(value, fallback = 0){
  let raw = String(value == null ? "" : value)
    .trim()
    .replace(/[\s\u00a0\u202f]+/g, "");
  if(!raw) return fallback;
  // The app previously formatted thousands as "2,400"; keep that as 2400.
  // A simple decimal like "10,5" is still accepted as 10.5.
  if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)){
    raw = raw.replace(/,/g, "");
  } else if(raw.includes(",") && !raw.includes(".")){
    const parts = raw.split(",");
    raw = parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3
      ? parts.join("")
      : raw.replace(",", ".");
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function formatFeeDistNumber(value){
  const n = Number(value || 0);
  if(!Number.isFinite(n)) return "";
  if(Math.abs(n - Math.round(n)) < 0.0001) return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
}

function setFeeDistStatusText(message, { error = false } = {}){
  if(!setFeeDistStatus) return;
  setFeeDistStatus.textContent = String(message || "");
  setFeeDistStatus.style.color = error ? "#b91c1c" : "";
}

function selectedFeeDistUniformLevels(){
  return Array.from(document.querySelectorAll("input[data-fee-dist-uniform-level]:checked"))
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
}

function applyFeeDistributionConfig(config = {}, meta = {}){
  const deductions = config.admissionDeductionsUSD || {};
  const prices = config.admissionPricesUSD || {};
  const minerval = config.minerval || {};
  if(setFeeDistUniforme) setFeeDistUniforme.value = formatFeeDistNumber(deductions.uniforme ?? 20);
  if(setFeeDistPromo) setFeeDistPromo.value = formatFeeDistNumber(deductions.promo ?? 10);
  if(setFeeDistJournalEcusson) setFeeDistJournalEcusson.value = formatFeeDistNumber(deductions.journalEcusson ?? 6);
  if(setFeeDistRate) setFeeDistRate.value = formatFeeDistNumber(config.exchangeRateCDFPerUSD ?? 2400);
  if(setFeeDistAdmMat) setFeeDistAdmMat.value = formatFeeDistNumber(prices.maternelle ?? 40);
  if(setFeeDistAdmPri) setFeeDistAdmPri.value = formatFeeDistNumber(prices.primaire ?? 20);
  if(setFeeDistAdmSec) setFeeDistAdmSec.value = formatFeeDistNumber(prices.secondaire ?? 35);
  if(setFeeDistAdm4eLow) setFeeDistAdm4eLow.value = formatFeeDistNumber(prices.secondaire4eHLow ?? 20);
  if(setFeeDistAdm4eHigh) setFeeDistAdm4eHigh.value = formatFeeDistNumber(prices.secondaire4eHHigh ?? 35);
  if(setFeeDistMinervalMonthly) setFeeDistMinervalMonthly.value = formatFeeDistNumber(minerval.monthlyPriceUSD ?? 10);
  if(setFeeDistMinervalMonths) setFeeDistMinervalMonths.value = formatFeeDistNumber(minerval.months ?? 10);
  if(setFeeDistMinerval4eHMonths) setFeeDistMinerval4eHMonths.value = formatFeeDistNumber(minerval.fourthHMonths ?? 9);
  if(setFeeDistFourthHClasses) setFeeDistFourthHClasses.value = Array.isArray(config.fourthHClasses) ? config.fourthHClasses.join("\n") : "";
  const uniformLevels = new Set(Array.isArray(config.uniformeLevels) ? config.uniformeLevels : ["maternelle"]);
  document.querySelectorAll("input[data-fee-dist-uniform-level]").forEach((input) => {
    input.checked = uniformLevels.has(String(input.value || "").trim());
  });
  const label = meta.schoolYearLabel || currentSchoolYearLabel();
  setFeeDistStatusText(`Paramètres chargés pour ${label}. Ces montants alimentent le rapport annuel.`);
}

async function loadFeeDistributionSettings(){
  if(!setFeeDistSaveBtn && !setFeeDistStatus) return;
  if(!hasRole("admin")) return;
  try{
    const data = await apiFetch("/api/settings/fee-distribution");
    applyFeeDistributionConfig(data?.config || {}, { schoolYearLabel: data?.schoolYearLabel });
  }catch(err){
    setFeeDistStatusText(`Impossible de charger la répartition: ${String(err?.message || err)}`, { error: true });
  }
}

async function saveFeeDistributionSettings(){
  if(!hasRole("admin")){
    showInAppPopup("Accès réservé: admin.", { variant: "error" });
    return;
  }
  if(!setFeeDistSaveBtn) return;
  const config = {
    admissionDeductionsUSD: {
      uniforme: parseFeeDistNumber(setFeeDistUniforme?.value, 20),
      promo: parseFeeDistNumber(setFeeDistPromo?.value, 10),
      journalEcusson: parseFeeDistNumber(setFeeDistJournalEcusson?.value, 6)
    },
    uniformeLevels: selectedFeeDistUniformLevels(),
    admissionPricesUSD: {
      maternelle: parseFeeDistNumber(setFeeDistAdmMat?.value, 40),
      primaire: parseFeeDistNumber(setFeeDistAdmPri?.value, 20),
      secondaire: parseFeeDistNumber(setFeeDistAdmSec?.value, 35),
      secondaire4eHLow: parseFeeDistNumber(setFeeDistAdm4eLow?.value, 20),
      secondaire4eHHigh: parseFeeDistNumber(setFeeDistAdm4eHigh?.value, 35)
    },
    minerval: {
      monthlyPriceUSD: parseFeeDistNumber(setFeeDistMinervalMonthly?.value, 10),
      months: Math.max(1, Math.min(12, Math.floor(parseFeeDistNumber(setFeeDistMinervalMonths?.value, 10)))),
      fourthHMonths: Math.max(1, Math.min(12, Math.floor(parseFeeDistNumber(setFeeDistMinerval4eHMonths?.value, 9))))
    },
    exchangeRateCDFPerUSD: Math.max(1, parseFeeDistNumber(setFeeDistRate?.value, 2400)),
    fourthHClasses: String(setFeeDistFourthHClasses?.value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  };
  setFeeDistSaveBtn.disabled = true;
  setFeeDistStatusText("Enregistrement...");
  try{
    const data = await apiFetch("/api/settings/fee-distribution", {
      method: "PATCH",
      body: JSON.stringify({ config })
    });
    applyFeeDistributionConfig(data?.config || config, { schoolYearLabel: data?.schoolYearLabel });
    setFeeDistStatusText(`Enregistré ✓ pour ${data?.schoolYearLabel || currentSchoolYearLabel()}. Le rapport est mis à jour.`);
    renderReports();
  }catch(err){
    setFeeDistStatusText(`Erreur: ${String(err?.message || err)}`, { error: true });
  }finally{
    setFeeDistSaveBtn.disabled = false;
  }
}

feeDistInputs().forEach((el) => {
  el.addEventListener("input", () => {
    const raw = String(el.value || "").replace(/[^\d,\.\s]/g, "");
    el.value = raw;
  });
  el.addEventListener("blur", () => {
    el.value = formatFeeDistNumber(parseFeeDistNumber(el.value, 0));
  });
});
if(setFeeDistSaveBtn){
  setFeeDistSaveBtn.addEventListener("click", () => {
    saveFeeDistributionSettings().catch(() => {});
  });
}
if(currentUser && hasRole("admin")){
  loadFeeDistributionSettings().catch(() => {});
}

const setFeeTypeOpenBtn = document.getElementById("setFeeTypeOpenBtn");
const feeTypeCreateModal = document.getElementById("feeTypeCreateModal");
const feeTypeCreateTitle = document.getElementById("feeTypeCreateTitle");
const feeTypeCreateClose = document.getElementById("feeTypeCreateClose");
const feeTypeCreateCancel = document.getElementById("feeTypeCreateCancel");
const setFeeTypeDueMonthField = document.getElementById("setFeeTypeDueMonthField");
const feeTypeScopeMode = document.getElementById("feeTypeScopeMode");
const feeTypeScopeLevelField = document.getElementById("feeTypeScopeLevelField");
const feeTypeScopeClassesField = document.getElementById("feeTypeScopeClassesField");
const feeTypeScopeClassList = document.getElementById("feeTypeScopeClassList");
const feeTypeScopeEmpty = document.getElementById("feeTypeScopeEmpty");
const feeTypeScopeSummary = document.getElementById("feeTypeScopeSummary");
const feeTypeScopeSelectAll = document.getElementById("feeTypeScopeSelectAll");
const feeTypeScopeClear = document.getElementById("feeTypeScopeClear");
const feeTypePricingRulesEnabled = document.getElementById("feeTypePricingRulesEnabled");
const feeTypePricingRulesField = document.getElementById("feeTypePricingRulesField");
const feeTypePricingRulesList = document.getElementById("feeTypePricingRulesList");
const feeTypePricingRulesEmpty = document.getElementById("feeTypePricingRulesEmpty");
const feeTypeAddLevelRuleBtn = document.getElementById("feeTypeAddLevelRuleBtn");
const feeTypeAddClassRuleBtn = document.getElementById("feeTypeAddClassRuleBtn");
const setFeeTypeSkipAutoPrint = document.getElementById("setFeeTypeSkipAutoPrint");
const feeTypeSaveStatus = document.getElementById("feeTypeSaveStatus");
let feeTypeCreateLastFocus = null;
let feeTypeCreateMode = "create";
let feeTypeEditingId = "";
let feeTypePricingRuleSeq = 0;
let feeTypePricingRulesState = [];

function feeTypeLevelLabelFr(level){
  if(level === "maternelle") return "Maternelle";
  if(level === "primaire") return "Primaire";
  if(level === "secondaire") return "Secondaire";
  return "";
}

function formatFeeTypeAmountInputValue(amount){
  const numeric = Number(amount || 0);
  if(!Number.isFinite(numeric)) return "";
  return String(Math.round(numeric)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function setFeeTypeSaveMessage(message, { error = false } = {}){
  const text = String(message || "").trim();
  if(feeTypeSaveStatus){
    feeTypeSaveStatus.textContent = text;
    feeTypeSaveStatus.style.display = text ? "block" : "none";
    feeTypeSaveStatus.style.color = error ? "#b91c1c" : "";
  }
  if(setFeeStatus && text){
    setFeeStatus.textContent = text;
  }
}

function feeTypeSaveErrorMessage(err){
  const raw = String(err?.message || err || "").trim() || "Erreur inconnue.";
  const scopeLimitMatch = raw.match(/scopeClasses:\s*maximum\s*(\d+)\s*classes/i);
  if(scopeLimitMatch){
    const max = Number(scopeLimitMatch[1] || FEE_TYPE_MAX_SCOPE_CLASSES || 0);
    return `Le frais n'a pas ete enregistre: trop de classes selectionnees. Maximum ${max} classes. Choisissez "Par niveau > Secondaire" pour tout le secondaire, ou gardez seulement les classes necessaires.`;
  }
  return `Le frais n'a pas ete enregistre: ${raw}`;
}

function getFeeTypeScopeModeValue(){
  return String(feeTypeScopeMode?.value || "all");
}

function getFeeTypeScopeLevelsValue(){
  if(!feeTypeScopeLevelList) return [];
  return normalizeFeeScopeLevels(Array.from(feeTypeScopeLevelList.querySelectorAll("input[data-fee-scope-level]:checked"))
    .map((input) => input.value));
}

function getFeeTypeScopeLevelValue(){
  return getFeeTypeScopeLevelsValue()[0] || "";
}

function getFeeTypeScopeSelectedClasses(){
  if(!feeTypeScopeClassList) return normalizeFeeScopeClassList(setFeeTypeScopeClasses?.value || "");
  const selected = Array.from(feeTypeScopeClassList.querySelectorAll("input[data-fee-scope-class]:checked"))
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
  if(setFeeTypeScopeClasses) setFeeTypeScopeClasses.value = selected.join(", ");
  return selected;
}

function getFeeTypeRuleLevelOptionsHtml(selectedLevel){
  const selected = normalizeFeeScopeLevelValue(selectedLevel || "") || "";
  return [
    { value: "maternelle", label: "Maternelle" },
    { value: "primaire", label: "Primaire" },
    { value: "secondaire", label: "Secondaire" }
  ].map((item) => `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${item.label}</option>`).join("");
}

function getFeeTypeRuleClassOptionsHtml(level, selectedClass){
  const list = (CLASS_BY_LEVEL[level] || []).slice().sort((a, b) => a.localeCompare(b, "fr"));
  const normalizedSelected = normalizeTextAscii(selectedClass || "");
  if(!list.length){
    return `<option value="">Aucune classe disponible</option>`;
  }
  return [
    `<option value="">Choisir une classe</option>`,
    ...list.map((className) => {
      const selected = normalizeTextAscii(className) === normalizedSelected ? "selected" : "";
      return `<option value="${esc(className)}" ${selected}>${esc(className)}</option>`;
    })
  ].join("");
}

function makeFeeTypePricingRuleState(rule = {}){
  feeTypePricingRuleSeq += 1;
  const fallbackLevel = getFeeTypeScopeLevelValue() || "maternelle";
  const targetType = String(rule.targetType || "level").trim().toLowerCase() === "class" ? "class" : "level";
  const level = normalizeFeeScopeLevelValue(rule.level || fallbackLevel) || "maternelle";
  const classes = (CLASS_BY_LEVEL[level] || []).slice().sort((a, b) => a.localeCompare(b, "fr"));
  const className = targetType === "class"
    ? normalizeFeeName(rule.className || classes[0] || "")
    : "";
  const amount = Number(rule.amount || 0);
  return {
    uiId: `fee-rule-${feeTypePricingRuleSeq}`,
    targetType,
    level,
    className,
    amount: Number.isFinite(amount) ? amount : 0
  };
}

function setFeeTypeCreateMode(mode, current = null){
  feeTypeCreateMode = mode === "edit" && current ? "edit" : "create";
  feeTypeEditingId = feeTypeCreateMode === "edit" ? String(current?.id || "") : "";
  if(feeTypeCreateTitle){
    feeTypeCreateTitle.textContent = feeTypeCreateMode === "edit" ? "Modifier le frais" : "Ajouter un nouveau frais";
  }
  if(setFeeTypeAdd){
    setFeeTypeAdd.textContent = feeTypeCreateMode === "edit" ? "Enregistrer les modifications" : "Enregistrer le frais";
  }
}

function renderFeeTypeScopeClassList(){
  if(!feeTypeScopeClassList) return;
  const levels = getFeeTypeScopeLevelsValue();
  const selected = new Set(normalizeFeeScopeClassList(setFeeTypeScopeClasses?.value || "")
    .map((className) => normalizeTextAscii(className).replace(/\s+/g, " ")));
  const items = levels.flatMap((level) => (CLASS_BY_LEVEL[level] || [])
    .slice()
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((className) => ({ level, className })));
  if(!levels.length){
    feeTypeScopeClassList.innerHTML = "";
    if(feeTypeScopeEmpty){
      feeTypeScopeEmpty.textContent = "Choisissez d'abord un ou plusieurs niveaux pour afficher les classes.";
      feeTypeScopeEmpty.style.display = "block";
    }
    return;
  }
  if(!items.length){
    feeTypeScopeClassList.innerHTML = "";
    if(feeTypeScopeEmpty){
      feeTypeScopeEmpty.textContent = "Aucune classe disponible pour ces niveaux.";
      feeTypeScopeEmpty.style.display = "block";
    }
    return;
  }
  feeTypeScopeClassList.innerHTML = items.map(({ level, className }, index) => {
    const safeClass = esc(className);
    const checked = selected.has(normalizeTextAscii(className).replace(/\s+/g, " ")) ? " checked" : "";
    const hint = `${feeTypeLevelLabelFr(level)} • classe ${index + 1} sur ${items.length}`;
    return `
      <label class="fee-class-option">
        <input type="checkbox" data-fee-scope-class value="${safeClass}"${checked} />
        <div>
          <span>${safeClass}</span>
          <small>${esc(hint)}</small>
        </div>
      </label>
    `;
  }).join("");
  if(feeTypeScopeEmpty) feeTypeScopeEmpty.style.display = "none";
}

function renderFeeTypePricingRules(){
  if(!feeTypePricingRulesList) return;
  const enabled = Boolean(feeTypePricingRulesEnabled?.checked);
  if(!enabled){
    feeTypePricingRulesList.innerHTML = "";
    if(feeTypePricingRulesEmpty) feeTypePricingRulesEmpty.style.display = "none";
    return;
  }
  if(!feeTypePricingRulesState.length){
    feeTypePricingRulesList.innerHTML = "";
    if(feeTypePricingRulesEmpty) feeTypePricingRulesEmpty.style.display = "block";
    return;
  }
  feeTypePricingRulesList.innerHTML = feeTypePricingRulesState.map((rule) => {
    const classWrapStyle = rule.targetType === "class" ? "" : "display:none";
    const hint = rule.targetType === "class"
      ? "Priorite sur la regle du niveau."
      : "S'applique a tout le niveau concerne.";
    return `
      <div class="fee-pricing-rule-card" data-fee-rule-id="${esc(rule.uiId)}">
        <div class="fee-pricing-rule-grid">
          <div class="field">
            <label>Type</label>
            <select class="input" data-fee-rule-target="${esc(rule.uiId)}">
              <option value="level" ${rule.targetType === "level" ? "selected" : ""}>Niveau</option>
              <option value="class" ${rule.targetType === "class" ? "selected" : ""}>Classe</option>
            </select>
          </div>
          <div class="field">
            <label>Niveau</label>
            <select class="input" data-fee-rule-level="${esc(rule.uiId)}">
              ${getFeeTypeRuleLevelOptionsHtml(rule.level)}
            </select>
          </div>
          <div class="field" data-fee-rule-class-wrap="${esc(rule.uiId)}" style="${classWrapStyle}">
            <label>Classe</label>
            <select class="input" data-fee-rule-class="${esc(rule.uiId)}">
              ${getFeeTypeRuleClassOptionsHtml(rule.level, rule.className)}
            </select>
          </div>
          <div class="field">
            <label>Montant</label>
            <input class="input" data-fee-rule-amount="${esc(rule.uiId)}" inputmode="numeric" placeholder="Ex: 25" value="${esc(formatFeeTypeAmountInputValue(rule.amount))}" />
          </div>
          <div class="field fee-pricing-rule-actions">
            <button class="btn danger" type="button" data-fee-rule-remove="${esc(rule.uiId)}">Supprimer</button>
          </div>
        </div>
        <div class="tiny fee-pricing-rule-summary">${esc(hint)}</div>
      </div>
    `;
  }).join("");
  if(feeTypePricingRulesEmpty) feeTypePricingRulesEmpty.style.display = "none";
}

function updateFeeTypeScopeSummary(){
  if(!feeTypeScopeSummary) return;
  const mode = getFeeTypeScopeModeValue();
  const levels = getFeeTypeScopeLevelsValue();
  const selectedClasses = getFeeTypeScopeSelectedClasses();
  const pricingRules = feeTypePricingRulesEnabled?.checked ? normalizeFeePricingRules(feeTypePricingRulesState) : [];
  let label = "Tous les eleves";
  if(mode === "level"){
    label = levels.length ? feeScopeLabelFr({ scopeLevels: levels, scopeClasses: [] }) : "Choisissez au moins un niveau";
  }else if(mode === "classes"){
    label = levels.length
      ? feeScopeLabelFr({ scopeLevels: levels, scopeClasses: selectedClasses })
      : "Choisissez au moins un niveau";
    if(levels.length && !selectedClasses.length) label = `${feeScopeLabelFr({ scopeLevels: levels })} - aucune classe selectionnee`;
  }
  const pricingLabel = pricingRules.length ? ` | Prix variables: ${pricingRules.length}` : "";
  feeTypeScopeSummary.textContent = `Affectation actuelle: ${label}${pricingLabel}`;
}

function syncFeeTypeCreateModalUi(){
  const mode = getFeeTypeScopeModeValue();
  const showLevel = mode === "level" || mode === "classes";
  const showClasses = mode === "classes";
  const showPricingRules = Boolean(feeTypePricingRulesEnabled?.checked);
  if(feeTypeScopeLevelField) feeTypeScopeLevelField.style.display = showLevel ? "" : "none";
  if(feeTypeScopeClassesField) feeTypeScopeClassesField.style.display = showClasses ? "" : "none";
  if(feeTypePricingRulesField) feeTypePricingRulesField.style.display = showPricingRules ? "" : "none";
  if(showClasses){
    renderFeeTypeScopeClassList();
  }else{
    if(feeTypeScopeClassList) feeTypeScopeClassList.innerHTML = "";
    if(feeTypeScopeEmpty) feeTypeScopeEmpty.style.display = "none";
  }
  renderFeeTypePricingRules();
  updateFeeTypeScopeSummary();
}

function syncFeeTypeItemUi(){
  const isItem = Boolean(setFeeTypeIsItem && setFeeTypeIsItem.checked);
  const hasFixedPrice = !Boolean(setFeeTypeNoFixedPrice?.checked);
  const cycleField = setFeeTypeCycle ? setFeeTypeCycle.closest(".field") : null;
  if(cycleField) cycleField.style.display = isItem ? "none" : "";
  if(setFeeTypePrice){
    setFeeTypePrice.disabled = !hasFixedPrice;
    setFeeTypePrice.placeholder = hasFixedPrice ? "Ex: 25" : "Montant saisi au paiement";
    if(!hasFixedPrice) setFeeTypePrice.value = "";
  }
  if(feeTypePricingRulesEnabled){
    feeTypePricingRulesEnabled.disabled = !hasFixedPrice;
    if(!hasFixedPrice) feeTypePricingRulesEnabled.checked = false;
  }
  const isAnnual = !isItem && normalizeFeeBillingCycle(setFeeTypeCycle?.value || "monthly") === "annual";
  const editingTuition = feeTypeCreateMode === "edit"
    && String(feeTypesApiCache.find((ft) => String(ft.id) === String(feeTypeEditingId))?.code || "").toUpperCase() === "TUITION";
  if(setFeeTypeDueMonthField) setFeeTypeDueMonthField.style.display = isAnnual && !editingTuition ? "" : "none";
  if(setFeeTypeDueMonth){
    const bounds = buildSchoolYearMonthBounds(getActiveSchoolYearStartYear());
    setFeeTypeDueMonth.min = bounds?.startMonth || "";
    setFeeTypeDueMonth.max = bounds?.endMonth || "";
    if(!isAnnual || editingTuition) setFeeTypeDueMonth.value = "";
  }
}

function resetFeeTypeCreateModal(){
  setFeeTypeCreateMode("create");
  if(setFeeTypeName) setFeeTypeName.value = "";
  if(setFeeTypePrice) setFeeTypePrice.value = "";
  if(setFeeTypeCurrency) setFeeTypeCurrency.value = "USD";
  if(setFeeTypeCycle) setFeeTypeCycle.value = "monthly";
  if(setFeeTypeDueMonth) setFeeTypeDueMonth.value = "";
  if(setFeeTypeIsItem) setFeeTypeIsItem.checked = false;
  if(setFeeTypeNoFixedPrice) setFeeTypeNoFixedPrice.checked = false;
  if(setFeeTypeSkipAutoPrint) setFeeTypeSkipAutoPrint.checked = false;
  if(feeTypeScopeMode) feeTypeScopeMode.value = "all";
  feeTypeScopeLevelList?.querySelectorAll("input[data-fee-scope-level]").forEach((input) => { input.checked = false; });
  if(setFeeTypeScopeClasses) setFeeTypeScopeClasses.value = "";
  if(feeTypePricingRulesEnabled) feeTypePricingRulesEnabled.checked = false;
  feeTypePricingRulesState = [];
  syncFeeTypeItemUi();
  syncFeeTypeCreateModalUi();
}

function openFeeTypeCreateModal(){
  if(!feeTypeCreateModal) return;
  feeTypeCreateLastFocus = document.activeElement;
  setFeeTypeSaveMessage("");
  syncFeeTypeCreateModalUi();
  feeTypeCreateModal.style.display = "flex";
  feeTypeCreateModal.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    if(setFeeTypeName) setFeeTypeName.focus();
  }, 0);
}

function openFeeTypeCreateModalForCreate(){
  resetFeeTypeCreateModal();
  openFeeTypeCreateModal();
}

function openFeeTypeCreateModalForEdit(current){
  if(!current) return;
  setFeeTypeCreateMode("edit", current);
  if(setFeeTypeName) setFeeTypeName.value = normalizeFeeName(current.labelFr || "");
  if(setFeeTypePrice) setFeeTypePrice.value = formatFeeTypeAmountInputValue(current.defaultAmount || 0);
  if(setFeeTypeCurrency) setFeeTypeCurrency.value = String(current.defaultCurrency || "USD").toUpperCase();
  const editCycle = normalizeFeeBillingCycle(current.billingCycle || "monthly");
  if(setFeeTypeIsItem) setFeeTypeIsItem.checked = editCycle === "item";
  if(setFeeTypeNoFixedPrice) setFeeTypeNoFixedPrice.checked = current.hasFixedPrice === false;
  if(setFeeTypeSkipAutoPrint) setFeeTypeSkipAutoPrint.checked = Boolean(current.skipAutoPrint || current.skip_auto_print);
  if(setFeeTypeCycle) setFeeTypeCycle.value = editCycle === "item" ? "monthly" : editCycle;
  if(setFeeTypeDueMonth) setFeeTypeDueMonth.value = normalizeFeeDueMonthValue(current.dueMonth || "");
  syncFeeTypeItemUi();
  const currentScopeLevels = normalizeFeeScopeLevels(current.scopeLevels || [], current.scopeLevel || "");
  const currentScopeClasses = normalizeFeeScopeClassList(current.scopeClasses || []);
  if(feeTypeScopeMode){
    feeTypeScopeMode.value = currentScopeClasses.length ? "classes" : (currentScopeLevels.length ? "level" : "all");
  }
  feeTypeScopeLevelList?.querySelectorAll("input[data-fee-scope-level]").forEach((input) => {
    input.checked = currentScopeLevels.includes(normalizeFeeScopeLevelValue(input.value));
  });
  if(setFeeTypeScopeClasses) setFeeTypeScopeClasses.value = currentScopeClasses.join(", ");
  const pricingRules = normalizeFeePricingRules(current.pricingRules || []);
  if(feeTypePricingRulesEnabled) feeTypePricingRulesEnabled.checked = pricingRules.length > 0;
  feeTypePricingRulesState = pricingRules.map((rule) => makeFeeTypePricingRuleState(rule));
  openFeeTypeCreateModal();
}

function closeFeeTypeCreateModal(){
  if(!feeTypeCreateModal) return;
  feeTypeCreateModal.style.display = "none";
  feeTypeCreateModal.setAttribute("aria-hidden", "true");
  if(feeTypeCreateLastFocus && typeof feeTypeCreateLastFocus.focus === "function"){
    feeTypeCreateLastFocus.focus();
  }
}

function getFeeTypePricingRulesPayload(){
  return normalizeFeePricingRules(feeTypePricingRulesState.map((rule) => ({
    targetType: rule.targetType,
    level: rule.level,
    className: rule.className,
    amount: Number(rule.amount || 0)
  })));
}

function addFeeTypePricingRule(targetType){
  const normalizedTarget = targetType === "class" ? "class" : "level";
  const rule = makeFeeTypePricingRuleState({ targetType: normalizedTarget, level: getFeeTypeScopeLevelValue() || "maternelle" });
  if(normalizedTarget === "class" && !rule.className){
    showInAppPopup("Aucune classe disponible pour ce niveau.");
    return;
  }
  feeTypePricingRulesState = [...feeTypePricingRulesState, rule];
  syncFeeTypeCreateModalUi();
}

if(setFeeTypeOpenBtn){
  setFeeTypeOpenBtn.addEventListener("click", () => {
    openFeeTypeCreateModalForCreate();
  });
}
if(feeTypeCreateClose){
  feeTypeCreateClose.addEventListener("click", () => {
    closeFeeTypeCreateModal();
  });
}
if(feeTypeCreateCancel){
  feeTypeCreateCancel.addEventListener("click", () => {
    closeFeeTypeCreateModal();
  });
}
if(feeTypeCreateModal){
  feeTypeCreateModal.addEventListener("click", (e) => {
    if(e.target !== feeTypeCreateModal) return;
    closeFeeTypeCreateModal();
  });
}
document.addEventListener("keydown", (e) => {
  if(e.key !== "Escape") return;
  if(!feeTypeCreateModal || feeTypeCreateModal.getAttribute("aria-hidden") !== "false") return;
  closeFeeTypeCreateModal();
});
if(feeTypeScopeMode){
  feeTypeScopeMode.addEventListener("change", () => {
    syncFeeTypeCreateModalUi();
  });
}
if(feeTypeScopeLevelList){
  feeTypeScopeLevelList.addEventListener("change", (e) => {
    if(!e.target.closest("input[data-fee-scope-level]")) return;
    const availableClasses = new Map(getFeeTypeScopeLevelsValue()
      .flatMap((level) => CLASS_BY_LEVEL[level] || [])
      .map((className) => [normalizeTextAscii(className).replace(/\s+/g, " "), className]));
    const keptClasses = normalizeFeeScopeClassList(setFeeTypeScopeClasses?.value || "")
      .map((className) => availableClasses.get(normalizeTextAscii(className).replace(/\s+/g, " ")))
      .filter(Boolean);
    if(setFeeTypeScopeClasses) setFeeTypeScopeClasses.value = keptClasses.join(", ");
    syncFeeTypeCreateModalUi();
  });
}
if(feeTypeScopeClassList){
  feeTypeScopeClassList.addEventListener("change", (e) => {
    if(!e.target.closest("input[data-fee-scope-class]")) return;
    updateFeeTypeScopeSummary();
  });
}
if(feeTypeScopeSelectAll){
  feeTypeScopeSelectAll.addEventListener("click", () => {
    if(!feeTypeScopeClassList) return;
    feeTypeScopeClassList.querySelectorAll("input[data-fee-scope-class]").forEach((input) => {
      input.checked = true;
    });
    updateFeeTypeScopeSummary();
  });
}
if(feeTypeScopeClear){
  feeTypeScopeClear.addEventListener("click", () => {
    if(!feeTypeScopeClassList) return;
    feeTypeScopeClassList.querySelectorAll("input[data-fee-scope-class]").forEach((input) => {
      input.checked = false;
    });
    updateFeeTypeScopeSummary();
  });
}
if(feeTypePricingRulesEnabled){
  feeTypePricingRulesEnabled.addEventListener("change", () => {
    syncFeeTypeCreateModalUi();
  });
}
if(feeTypeAddLevelRuleBtn){
  feeTypeAddLevelRuleBtn.addEventListener("click", () => {
    addFeeTypePricingRule("level");
  });
}
if(feeTypeAddClassRuleBtn){
  feeTypeAddClassRuleBtn.addEventListener("click", () => {
    addFeeTypePricingRule("class");
  });
}
if(feeTypePricingRulesList){
  feeTypePricingRulesList.addEventListener("input", (e) => {
    const amountInput = e.target.closest("input[data-fee-rule-amount]");
    if(!amountInput) return;
    const ruleId = amountInput.getAttribute("data-fee-rule-amount") || "";
    const digits = onlyDigits(amountInput.value || "0");
    amountInput.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    feeTypePricingRulesState = feeTypePricingRulesState.map((rule) =>
      rule.uiId === ruleId
        ? { ...rule, amount: Number(onlyDigits(amountInput.value || "0")) }
        : rule
    );
    updateFeeTypeScopeSummary();
  });
  feeTypePricingRulesList.addEventListener("change", (e) => {
    const targetSelect = e.target.closest("select[data-fee-rule-target]");
    if(targetSelect){
      const ruleId = targetSelect.getAttribute("data-fee-rule-target") || "";
      feeTypePricingRulesState = feeTypePricingRulesState.map((rule) => {
        if(rule.uiId !== ruleId) return rule;
        const nextTarget = String(targetSelect.value || "level") === "class" ? "class" : "level";
        const nextLevel = normalizeFeeScopeLevelValue(rule.level || "") || "maternelle";
        const nextClasses = (CLASS_BY_LEVEL[nextLevel] || []).slice().sort((a, b) => a.localeCompare(b, "fr"));
        return {
          ...rule,
          targetType: nextTarget,
          className: nextTarget === "class" ? normalizeFeeName(rule.className || nextClasses[0] || "") : ""
        };
      });
      syncFeeTypeCreateModalUi();
      return;
    }
    const levelSelect = e.target.closest("select[data-fee-rule-level]");
    if(levelSelect){
      const ruleId = levelSelect.getAttribute("data-fee-rule-level") || "";
      const nextLevel = normalizeFeeScopeLevelValue(levelSelect.value || "") || "maternelle";
      feeTypePricingRulesState = feeTypePricingRulesState.map((rule) => {
        if(rule.uiId !== ruleId) return rule;
        const nextClasses = (CLASS_BY_LEVEL[nextLevel] || []).slice().sort((a, b) => a.localeCompare(b, "fr"));
        const keepClass = rule.targetType === "class"
          && nextClasses.some((className) => normalizeTextAscii(className) === normalizeTextAscii(rule.className || ""));
        return {
          ...rule,
          level: nextLevel,
          className: rule.targetType === "class" ? (keepClass ? rule.className : normalizeFeeName(nextClasses[0] || "")) : ""
        };
      });
      syncFeeTypeCreateModalUi();
      return;
    }
    const classSelect = e.target.closest("select[data-fee-rule-class]");
    if(classSelect){
      const ruleId = classSelect.getAttribute("data-fee-rule-class") || "";
      feeTypePricingRulesState = feeTypePricingRulesState.map((rule) =>
        rule.uiId === ruleId
          ? { ...rule, className: normalizeFeeName(classSelect.value || "") }
          : rule
      );
      updateFeeTypeScopeSummary();
    }
  });
  feeTypePricingRulesList.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("button[data-fee-rule-remove]");
    if(!removeBtn) return;
    const ruleId = removeBtn.getAttribute("data-fee-rule-remove") || "";
    feeTypePricingRulesState = feeTypePricingRulesState.filter((rule) => rule.uiId !== ruleId);
    syncFeeTypeCreateModalUi();
  });
}
if(setFeeTypeIsItem){
  setFeeTypeIsItem.addEventListener("change", syncFeeTypeItemUi);
}
if(setFeeTypeNoFixedPrice){
  setFeeTypeNoFixedPrice.addEventListener("change", () => {
    syncFeeTypeItemUi();
    syncFeeTypeCreateModalUi();
  });
}
if(setFeeTypeCycle){
  setFeeTypeCycle.addEventListener("change", syncFeeTypeItemUi);
}
if(setFeeTypeAdd){
  setFeeTypeAdd.addEventListener("click", async () => {
    const labelFr = normalizeFeeName(setFeeTypeName?.value || "");
    const hasFixedPrice = !Boolean(setFeeTypeNoFixedPrice?.checked);
    const defaultAmount = hasFixedPrice ? Number(onlyDigits(setFeeTypePrice?.value || "0")) : 0;
    const defaultCurrency = String(setFeeTypeCurrency?.value || "USD");
    const billingCycle = setFeeTypeIsItem?.checked ? "item" : normalizeFeeBillingCycle(setFeeTypeCycle?.value || "monthly");
    const skipAutoPrint = Boolean(setFeeTypeSkipAutoPrint?.checked);
    const dueMonth = billingCycle === "annual" ? normalizeFeeDueMonthValue(setFeeTypeDueMonth?.value || "") : null;
    const scopeMode = getFeeTypeScopeModeValue();
    const selectedLevels = getFeeTypeScopeLevelsValue();
    const selectedClasses = getFeeTypeScopeSelectedClasses();
    const scopeLevels = scopeMode === "all" ? [] : selectedLevels;
    const scopeLevel = scopeLevels[0] || null;
    const scopeClasses = scopeMode === "classes" ? selectedClasses : [];
    const scopeLabel = feeScopeLabelFr({ scopeLevels, scopeClasses });
    const pricingRules = hasFixedPrice && feeTypePricingRulesEnabled?.checked ? getFeeTypePricingRulesPayload() : [];
    if(!labelFr){
      if(setFeeStatus) setFeeStatus.textContent = "Nom du type de frais requis.";
      return;
    }
    if(!Number.isFinite(defaultAmount) || defaultAmount < 0){
      if(setFeeStatus) setFeeStatus.textContent = "Montant invalide.";
      return;
    }
    if(!["USD", "CDF"].includes(defaultCurrency)){
      if(setFeeStatus) setFeeStatus.textContent = "Devise invalide.";
      return;
    }
    if(billingCycle === "annual" && !dueMonth){
      if(setFeeStatus) setFeeStatus.textContent = "Choisissez le mois dû pour ce frais annuel.";
      setFeeTypeDueMonth?.focus();
      return;
    }
    if((scopeMode === "level" || scopeMode === "classes") && !selectedLevels.length){
      if(setFeeStatus) setFeeStatus.textContent = "Choisissez au moins un niveau pour ce frais.";
      return;
    }
    if(scopeMode === "classes" && !scopeClasses.length){
      setFeeTypeSaveMessage("Le frais n'a pas ete enregistre: choisissez au moins une classe.", { error: true });
      return;
    }
    if(scopeMode === "classes" && scopeClasses.length > FEE_TYPE_MAX_SCOPE_CLASSES){
      setFeeTypeSaveMessage(`Le frais n'a pas ete enregistre: ${scopeClasses.length} classes selectionnees, maximum ${FEE_TYPE_MAX_SCOPE_CLASSES}. Pour tout le secondaire, utilisez "Par niveau" avec Secondaire.`, { error: true });
      return;
    }
    if(feeTypePricingRulesEnabled?.checked && !pricingRules.length){
      setFeeTypeSaveMessage("Le frais n'a pas ete enregistre: ajoutez au moins une regle de prix variable.", { error: true });
      return;
    }
    const isEditMode = feeTypeCreateMode === "edit" && feeTypeEditingId;
    try{
      if(isEditMode){
        const current = feeTypesApiCache.find((ft) => String(ft.id) === String(feeTypeEditingId));
        if(!current) throw new Error("Type de frais introuvable.");
        await apiFetch(`/api/fee-types/${encodeURIComponent(String(feeTypeEditingId))}`, {
          method: "PUT",
          body: JSON.stringify({
            code: current.code,
            labelFr,
            defaultCurrency,
            defaultAmount,
            billingCycle,
            dueMonth,
            hasFixedPrice,
            scopeLevel,
            scopeLevels,
            scopeClasses,
            pricingRules,
            skipAutoPrint,
            active: current.active !== false
          })
        });
        await loadFeeTypesFromApi(true);
      }else{
        await addFeeTypeApi(labelFr, defaultAmount, defaultCurrency, billingCycle, { dueMonth, hasFixedPrice, scopeLevel, scopeLevels, scopeClasses, pricingRules, skipAutoPrint });
      }
      resetFeeTypeCreateModal();
      closeFeeTypeCreateModal();
      if(setFeeStatus){
        const actionLabel = isEditMode ? "Type modifie" : "Type ajoute";
        const pricingLabel = pricingRules.length ? ` | ${pricingRules.length} prix variable(s)` : "";
        setFeeTypeSaveMessage(`${actionLabel}: ${labelFr} (${feeCycleLabelFr(billingCycle)} | ${scopeLabel}${pricingLabel})`);
      }
      reportsSummaryApiCache.clear();
      busReportApiCache.clear();
      lateStudentsReportApiCache.clear();
      refreshStudentsFinancialState();
      if(selectedStudentId) selectStudent(selectedStudentId);
      renderDashboard();
      renderReports();
    }catch(err){
      setFeeTypeSaveMessage(feeTypeSaveErrorMessage(err), { error: true });
    }
  });
}
syncFeeTypeCreateModalUi();
if(setFeePriceTbody){
  setFeePriceTbody.addEventListener("click", async (e) => {
    const saveBtn = e.target.closest("button[data-fee-price-save]");
    if(saveBtn){
      const name = saveBtn.getAttribute("data-fee-price-save") || "";
      const feeTypeId = saveBtn.getAttribute("data-fee-type-id") || "";
      const safeId = (typeof CSS !== "undefined" && CSS.escape) ? CSS.escape(String(feeTypeId)) : String(feeTypeId).replace(/"/g, '\\"');
      const input = setFeePriceTbody.querySelector(`input[data-fee-price-input="${safeId}"]`);
      const cycleInput = setFeePriceTbody.querySelector(`select[data-fee-cycle-input="${safeId}"]`);
      const price = Number(onlyDigits(String(input?.value || "")));
      const billingCycle = normalizeFeeBillingCycle(cycleInput?.value || "monthly");
      if(!Number.isFinite(price) || price < 0){
        showInAppPopup("Prix invalide.");
        return;
      }
      (async () => {
        try{
          const current = feeTypesApiCache.find(ft => String(ft.id) === String(feeTypeId) || normalizeFeeName(ft.labelFr) === normalizeFeeName(name));
          if(current && current.id != null){
            if(billingCycle === "annual" && String(current.code || "").toUpperCase() !== "TUITION" && !normalizeFeeDueMonthValue(current.dueMonth || "")){
              showInAppPopup("Utilisez Editer pour choisir le mois dû de ce frais annuel.");
              openFeeTypeCreateModalForEdit({ ...current, defaultAmount: price, billingCycle });
              return;
            }
            await apiFetch(`/api/fee-types/${encodeURIComponent(current.id)}`, {
              method: "PUT",
              body: JSON.stringify({
                code: current.code,
                labelFr: current.labelFr,
                defaultCurrency: current.defaultCurrency,
                defaultAmount: price,
                billingCycle,
                dueMonth: billingCycle === "annual" ? (normalizeFeeDueMonthValue(current.dueMonth || "") || null) : null,
                hasFixedPrice: current.hasFixedPrice !== false,
                scopeLevel: normalizeFeeScopeLevelValue(current.scopeLevel || "") || null,
                scopeLevels: normalizeFeeScopeLevels(current.scopeLevels || [], current.scopeLevel || ""),
                scopeClasses: normalizeFeeScopeClassList(current.scopeClasses || []),
                pricingRules: normalizeFeePricingRules(current.pricingRules || []),
                skipAutoPrint: Boolean(current.skipAutoPrint || current.skip_auto_print),
                active: current.active !== false
              })
            });
            await loadFeeTypesFromApi(true);
          }else{
            const cfg = getFeeConfig();
            cfg[name] = price;
            saveFeeConfig(cfg);
            renderFeeSettingsTable();
            renderFeeTypeOptions(elFee, getStudentById(selectedStudentId));
          }
          if(setFeeStatus) setFeeStatus.textContent = `Type mis a jour: ${name} (${feeCycleLabelFr(billingCycle)})`;
          reportsSummaryApiCache.clear();
          busReportApiCache.clear();
          lateStudentsReportApiCache.clear();
          refreshStudentsFinancialState();
          if(selectedStudentId) selectStudent(selectedStudentId);
          renderDashboard();
          renderReports();
        }catch(err){
          if(setFeeStatus) setFeeStatus.textContent = `Erreur mise a jour prix: ${err.message}`;
        }
      })();
      return;
    }
    const delBtn = e.target.closest("button[data-fee-type-delete]");
    if(delBtn){
      const feeTypeId = delBtn.getAttribute("data-fee-type-delete-id") || "";
      const feeName = delBtn.getAttribute("data-fee-type-delete") || "";
      const feeCode = delBtn.getAttribute("data-fee-type-code") || "";
      const check = canDeleteFeeType({ id: feeTypeId, code: feeCode, labelFr: feeName });
      if(!check.ok){
        showInAppPopup(check.reason || "Suppression non autorisee.");
        return;
      }
      const usedNote = check.used
        ? ` Ce frais a déjà un historique : les paiements passés sont conservés, mais il n'apparaîtra plus dans les nouveaux paiements.`
        : "";
      const confirmed = await showAppConfirm({
        title: "Supprimer le type de frais",
        message: `Supprimer le type de frais « ${feeName} » ?${usedNote}`,
        okText: "Supprimer",
        cancelText: "Annuler",
        okClass: "danger"
      });
      if(!confirmed) return;
      try{
        await apiFetch(`/api/fee-types/${encodeURIComponent(String(feeTypeId))}`, { method: "DELETE" });
        await loadFeeTypesFromApi(true);
        reportsSummaryApiCache.clear();
        busReportApiCache.clear();
        lateStudentsReportApiCache.clear();
        refreshStudentsFinancialState();
        if(selectedStudentId) selectStudent(selectedStudentId);
        renderDashboard();
        renderReports();
        if(setFeeStatus) setFeeStatus.textContent = `Type supprimé: ${feeName}`;
      }catch(err){
        showInAppPopup(`Erreur suppression frais: ${err.message}`);
      }
      return;
    }
    const editBtn = e.target.closest("button[data-fee-type-edit]");
    if(!editBtn) return;
    if(!canManageFeeTypes()){
      showInAppPopup("Modification des frais reservee a admin/caissier/comptable.");
      return;
    }
    const feeTypeId = editBtn.getAttribute("data-fee-type-edit") || "";
    const current = feeTypesApiCache.find(ft => String(ft.id) === String(feeTypeId));
    if(!current){
      showInAppPopup("Type de frais introuvable.");
      return;
    }
    openFeeTypeCreateModalForEdit(current);
  });
}
syncFeeTypeCreateModalUi();
if(setClassAddBtn){
  setClassAddBtn.addEventListener("click", () => {
    const level = String(setClassLevel?.value || "").toLowerCase();
    const name = String(setClassName?.value || "").trim();
    const ok = addClassSetting(level, name);
    if(!ok) return;
    if(setClassName) setClassName.value = "";
    fillClassDropdownFromLevel(stLevel.value);
    syncFeeTypeCreateModalUi();
    if(setClassStatus) setClassStatus.textContent = `Classe ajoutÃ©e: ${name}`;
  });
}
if(setClassTbody){
  setClassTbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-class-remove-level]");
    if(!btn) return;
    const level = btn.getAttribute("data-class-remove-level") || "";
    const name = btn.getAttribute("data-class-remove-name") || "";
    const confirmed = await showAppConfirm({
      title: "Supprimer classe",
      message: `Supprimer la classe "${name}" ?`,
      okText: "Supprimer",
      cancelText: "Annuler",
      okClass: "danger"
    });
    if(!confirmed) return;
    removeClassSetting(level, name);
    fillClassDropdownFromLevel(stLevel.value);
    syncFeeTypeCreateModalUi();
  });
}
if(usrCreateBtn){
  usrCreateBtn.addEventListener("click", async () => {
    if(!hasRole("admin")){
      showInAppPopup("Action rÃ©servÃ©e Ã  admin.");
      return;
    }
    const username = String(usrName?.value || "").trim();
    const password = String(usrPass?.value || "");
    const role = String(usrRole?.value || "").trim();
    if(!username || !password || !role){
      if(usrStatus) usrStatus.textContent = "Utilisateur, mot de passe et rÃ´le requis.";
      return;
    }
    try{
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ username, password, role })
      });
      if(usrName) usrName.value = "";
      if(usrPass) usrPass.value = "";
      if(usrStatus) usrStatus.textContent = `Utilisateur crÃ©Ã©: ${username}`;
      await renderUsersAdmin();
    }catch(err){
      if(usrStatus) usrStatus.textContent = `Erreur crÃ©ation: ${err.message}`;
    }
  });
}
if(usrTbody){
  usrTbody.addEventListener("click", async (e) => {
    const saveBtn = e.target.closest("button[data-usr-save]");
    if(saveBtn){
      const id = saveBtn.getAttribute("data-usr-save");
      const roleEl = usrTbody.querySelector(`select[data-usr-role="${id}"]`);
      const activeEl = usrTbody.querySelector(`select[data-usr-active="${id}"]`);
      try{
        await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            role: roleEl?.value || "caissier",
            isActive: String(activeEl?.value || "1") === "1"
          })
        });
        if(usrStatus) usrStatus.textContent = "Utilisateur mis Ã  jour.";
        await renderUsersAdmin();
      }catch(err){
        if(usrStatus) usrStatus.textContent = `Erreur mise Ã  jour: ${err.message}`;
      }
      return;
    }

    const resetBtn = e.target.closest("button[data-usr-reset]");
    if(resetBtn){
      const id = resetBtn.getAttribute("data-usr-reset");
      const passEl = usrTbody.querySelector(`input[data-usr-pass="${id}"]`);
      const password = String(passEl?.value || "");
      if(password.length < 6){
        if(usrStatus) usrStatus.textContent = "Mot de passe min 6 caractÃ¨res.";
        return;
      }
      try{
        await apiFetch(`/api/users/${encodeURIComponent(id)}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ password })
        });
        if(passEl) passEl.value = "";
        if(usrStatus) usrStatus.textContent = "Mot de passe rÃ©initialisÃ©.";
      }catch(err){
        if(usrStatus) usrStatus.textContent = `Erreur reset mot de passe: ${err.message}`;
      }
      return;
    }

    const deleteBtn = e.target.closest("button[data-usr-delete]");
    if(deleteBtn){
      const id = deleteBtn.getAttribute("data-usr-delete");
      const username = deleteBtn.getAttribute("data-usr-name") || "cet utilisateur";
      const ok = await showAppConfirm({
        title: "Supprimer utilisateur",
        message: `Supprimer l'utilisateur "${username}" ?`,
        okText: "Supprimer",
        cancelText: "Annuler",
        okClass: "danger"
      });
      if(!ok) return;
      try{
        await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });
        if(usrStatus) usrStatus.textContent = `Utilisateur supprimÃ©: ${username}`;
        await renderUsersAdmin();
      }catch(err){
        if(usrStatus) usrStatus.textContent = `Erreur suppression: ${err.message}`;
      }
    }
  });
}
if(loginBtn){
  loginBtn.addEventListener("click", async () => {
    const ok = await loginWithCredentials();
    if(ok){
      await init();
    }
  });
}
if(loginPassword){
  loginPassword.addEventListener("keydown", async (e) => {
    if(e.key !== "Enter") return;
    e.preventDefault();
    const ok = await loginWithCredentials();
    if(ok){
      await init();
    }
  });
}
if(logoutBtn){
  logoutBtn.addEventListener("click", async () => {
    try{ await apiFetch("/api/auth/logout", { method:"POST" }); }catch(_){}
    clearAuthState();
    if(loginUsername) loginUsername.value = "";
    if(loginPassword) loginPassword.value = "";
    showLogin("DÃ©connectÃ©.");
  });
}



/* ===== Relances WhatsApp — configuration (Admin) ===== */
(function(){
  const waToken = document.getElementById("waToken");
  const waPhoneId = document.getElementById("waPhoneId");
  const waTemplate = document.getElementById("waTemplate");
  const waLang = document.getElementById("waLang");
  const waSaveBtn = document.getElementById("waSaveBtn");
  const waStatus = document.getElementById("waConfigStatus");
  const waCard = document.getElementById("whatsappConfigCard");
  if(!waSaveBtn || !waCard) return;

  let loaded = false;
  async function loadConfig(){
    try{
      const cfg = await apiFetch("/api/relances/whatsapp-config");
      if(waPhoneId) waPhoneId.value = cfg.phoneId || "";
      if(waTemplate) waTemplate.value = cfg.template || "";
      if(waLang) waLang.value = cfg.lang || "fr";
      if(waToken) waToken.placeholder = cfg.hasToken ? "•••••• (jeton enregistré — laisser vide pour conserver)" : "Coller le jeton d'accès Meta";
      if(waStatus) waStatus.textContent = cfg.configured ? "Configuré ✓" : "Non configuré — renseignez les champs ci-dessus.";
      loaded = true;
    }catch(err){
      if(waStatus) waStatus.textContent = `Erreur de chargement: ${err.message}`;
    }
  }
  // Charge la config quand la carte est ouverte la première fois.
  waCard.addEventListener("toggle", () => { if(waCard.open && !loaded) loadConfig(); });

  waSaveBtn.addEventListener("click", async () => {
    waSaveBtn.disabled = true;
    if(waStatus) waStatus.textContent = "Enregistrement…";
    try{
      const body = { phoneId: waPhoneId?.value || "", template: waTemplate?.value || "", lang: waLang?.value || "fr" };
      if(waToken && waToken.value.trim() !== "") body.token = waToken.value.trim();
      const cfg = await apiFetch("/api/relances/whatsapp-config", { method: "PATCH", body: JSON.stringify(body) });
      if(waToken) waToken.value = "";
      if(waStatus) waStatus.textContent = cfg.configured ? "Enregistré ✓ — WhatsApp configuré." : "Enregistré — il manque encore des champs pour activer l'envoi.";
    }catch(err){
      if(waStatus) waStatus.textContent = `Erreur: ${err.message}`;
    }finally{
      waSaveBtn.disabled = false;
    }
  });
})();

// Carte Paramètres : gestion des catégories de bus (abonnement).
(function setupBusCategoriesCard(){
  const card = document.getElementById("busCategoriesCard");
  const textArea = document.getElementById("busCategoriesText");
  const saveBtn = document.getElementById("busCategoriesSaveBtn");
  const status = document.getElementById("busCategoriesStatus");
  if(!card || !saveBtn || !textArea) return;

  let loaded = false;
  async function loadCategories(){
    try{
      const res = await apiFetch("/api/bus-categories");
      const cats = Array.isArray(res?.categories) ? res.categories : [];
      textArea.value = cats.join("\n");
      if(status) status.textContent = cats.length ? `${cats.length} catégorie(s) enregistrée(s).` : "Aucune catégorie — ajoutez-en une par ligne.";
      loaded = true;
    }catch(err){
      if(status) status.textContent = `Erreur de chargement: ${err.message}`;
    }
  }
  card.addEventListener("toggle", () => { if(card.open && !loaded) loadCategories(); });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    if(status) status.textContent = "Enregistrement…";
    try{
      const categories = String(textArea.value || "")
        .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const res = await apiFetch("/api/bus-categories", { method: "PUT", body: JSON.stringify({ categories }) });
      const saved = Array.isArray(res?.categories) ? res.categories : [];
      textArea.value = saved.join("\n");
      if(status) status.textContent = `Enregistré ✓ — ${saved.length} catégorie(s).`;
    }catch(err){
      if(status) status.textContent = `Erreur: ${err.message}`;
    }finally{
      saveBtn.disabled = false;
    }
  });
})();
