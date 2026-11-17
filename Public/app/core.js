/*********************
   * FX / Currency
   *********************/
  const KEY_USD_TO_CDF = "ecolepos_usd_to_cdf_v1";
  const KEY_MONTH_RATE_HISTORY = "ecolepos_month_rate_history_v1";
  const KEY_SCHOOL_YEAR_START = "ecolepos_school_year_start_v1";
  const KEY_LEVEL_FEES_USD = "ecolepos_level_fees_usd_v1";
  let USD_TO_CDF = 2400; // default

/*********************
 * TARIFS (EDIT HERE)
 * Monthly expected tuition per level (USD)
 *********************/
const DEFAULT_LEVEL_FEE_USD = Object.freeze({
  "Maternelle": 30,
  "Primaire": 35,
  "Secondaire": 50,
  "Secondaire4eH": 70
});
let LEVEL_FEE_USD = { ...DEFAULT_LEVEL_FEE_USD };

  /***************
   * Demo Data (students) - fallback if API not available
   ***************/
  const DEMO_STUDENTS = [
    { id:"S1", name:"Amadou Diallo", className:"6e A", level:"Secondaire", status:"A jour", balance:0, matricule:"ECO-2024-0156", color:"#2f6fed" },
    { id:"S2", name:"Fatou Konaté", className:"5e B", level:"Secondaire", status:"En retard", balance:5000, matricule:"ECO-2024-0221", color:"#7c3aed" },
    { id:"S3", name:"Moussa Bamba", className:"4e A", level:"Secondaire", status:"A jour", balance:0, matricule:"ECO-2024-0109", color:"#059669" },
    { id:"S4", name:"Aïssatou Sow", className:"3e C", level:"Secondaire", status:"En retard", balance:10000, matricule:"ECO-2024-0314", color:"#ef4444" },
    { id:"S5", name:"Oumar Traoré", className:"6e B", level:"Secondaire", status:"A jour", balance:0, matricule:"ECO-2024-0190", color:"#f59e0b" },
    { id:"S6", name:"Mariam Coulibaly", className:"5e A", level:"Secondaire", status:"A jour", balance:0, matricule:"ECO-2024-0287", color:"#06b6d4" }
  ];

  // Students state (API-backed if server running)
  let students = [];

  /***************
   * Storage Keys
   ***************/
  const KEY_PAYMENTS = "ecolepos_payments_v2_fx";
  const KEY_SPENDINGS = "ecolepos_spending_cache_v2";
  const KEY_SPENDINGS_LEGACY = "ecolepos_spendings_v1";
  const KEY_CAISSE_TRANSFERS = "ecolepos_caisse_transfers_v1";
  const KEY_OUTBOX_EVENTS = "ecolepos_outbox_events_v1";
  const KEY_RECEIPT_SEQ = "ecolepos_receipt_seq_v1";
  const KEY_RECEIPT_DEVICE = "ecolepos_receipt_device_key_v1";
  const KEY_RECEIPT_DEVICE_CODE = "ecolepos_receipt_device_code_v1";
  const KEY_LOCAL_PRINTER = "ecolepos_local_printer_v1";
  const KEY_FEE_CONFIG = "ecolepos_fee_config_v1";
  const KEY_CLASS_CONFIG = "ecolepos_class_config_v1";
  const KEY_AUTH_USER = "ecolepos_auth_user_v1";
  const KEY_ACCORDION_STATE = "ecolepos_accordion_state_v1";
  const KEY_ACTIVE_VIEW = "ecolepos_active_view_v1";
  const KEY_UI_STATE = "ecolepos_ui_state_v1";
  const KEY_THEME_MODE = "ecolepos_theme_mode_v1";
  const DEFAULT_PAYMENT_MODE = "Espèces";

  /***************
   * Elements — Nav/views
   ***************/
  const navLinks = Array.from(document.querySelectorAll(".nav a[data-view]"));
  const viewDashboard = document.getElementById("viewDashboard");
  const viewPayment = document.getElementById("viewPayment");
  const viewStudents = document.getElementById("viewStudents");
  const viewGrades = document.getElementById("viewGrades");
  const viewReceipts = document.getElementById("viewReceipts");
  const viewSpending = document.getElementById("viewSpending");
  const viewCaisse = document.getElementById("viewCaisse");
  const viewReports = document.getElementById("viewReports");
  const viewSettings = document.getElementById("viewSettings");

  /***************
   * Elements — POS
   ***************/
  const elStudentList = document.getElementById("studentList");
  const elSearch = document.getElementById("studentSearch");
  const elClassFilter = document.getElementById("classFilter");
  const elStatusFilter = document.getElementById("statusFilter");
  const studentsSourceHint = document.getElementById("studentsSourceHint");
  const elStudentLookup = document.getElementById("studentLookup");
  const elStudentDropdown = document.getElementById("studentDropdown");
  const elStudentLookupLevelFilter = document.getElementById("studentLookupLevelFilter");

  const elSelName = document.getElementById("selName");
  const elSelMat  = document.getElementById("selMat");
  const elSelClass= document.getElementById("selClass");
  const elSelBal  = document.getElementById("selBalance");
  const openStudentProfileFromPayment = document.getElementById("openStudentProfileFromPayment");

  const elFee = document.getElementById("feeType");
  const elMonth = document.getElementById("monthSel");
  const elAmount = document.getElementById("amount");
  const elAmountLabel = document.getElementById("amountLabel");
  const elCurrency = document.getElementById("currency");
  const elMixedCdfAmountField = document.getElementById("mixedCdfAmountField");
  const elMixedCdfAmount = document.getElementById("mixedCdfAmount");
  const elNote = document.getElementById("note");
  const elConfirm = document.getElementById("confirmBtn");
  const elFxHint = document.getElementById("fxHint");
  const elPayStatusHint = document.getElementById("payStatusHint");
  const elPaidMonthsList = document.getElementById("paidMonthsList");

  const elCashier = document.getElementById("cashierName");
  const brandUserName = document.getElementById("brandUserName");
  const elToday = document.getElementById("todayDate");
  const elTopPeriod = document.getElementById("topPeriod");
  const elReceiptTop = document.getElementById("receiptNoTop");
  const elRateLabel = document.getElementById("rateLabel");
  const elTopDailyBalance = document.getElementById("topDailyBalance");
  const elTopDailyBalanceCDF = document.getElementById("topDailyBalanceCDF");
  const authBadge = document.getElementById("authBadge");
  const syncBadge = document.getElementById("syncBadge");
  const serverAddressBadge = document.getElementById("serverAddressBadge");
  const apiHostWarning = document.getElementById("apiHostWarning");
  const logoutBtn = document.getElementById("logoutBtn");

  const elPrint = document.getElementById("printBtn");
  const elPrintStatus = document.getElementById("printStatus");

  /***************
   * Elements — Students view
   ***************/
  const stName = document.getElementById("stName");
const stClass = document.getElementById("stClass");
const stCode = document.getElementById("stCode");
const stLevel = document.getElementById("stLevel");
  const stSex = document.getElementById("stSex");
const stDateOfBirth = document.getElementById("stDateOfBirth");
const stParentName = document.getElementById("stParentName");
const stParentPhone = document.getElementById("stParentPhone");
const stFamilyLink = document.getElementById("stFamilyLink");
const stFamilyOptions = document.getElementById("stFamilyOptions");
const stDue = document.getElementById("stDue");
const stStartMonth = document.getElementById("stStartMonth");
const stLookupOldBtn = document.getElementById("stLookupOldBtn");
const stOldLookupPanel = document.getElementById("stOldLookupPanel");
const stOldLookupQuery = document.getElementById("stOldLookupQuery");
const stOldLookupResults = document.getElementById("stOldLookupResults");
const stOldLookupMeta = document.getElementById("stOldLookupMeta");
const stOldSelected = document.getElementById("stOldSelected");
const stModeNew = document.getElementById("stModeNew");
const stNewStudentFields = document.getElementById("stNewStudentFields");
const stEnrollmentStep1 = document.getElementById("stEnrollmentStep1");
const stEnrollmentStep2 = document.getElementById("stEnrollmentStep2");
const stEnrollmentStep3 = document.getElementById("stEnrollmentStep3");
const stNextPlacement = document.getElementById("stNextPlacement");
const stBackIdentity = document.getElementById("stBackIdentity");
const stNextReview = document.getElementById("stNextReview");
const stBackPlacement = document.getElementById("stBackPlacement");
const stStep1Status = document.getElementById("stStep1Status");
const stStep2Status = document.getElementById("stStep2Status");
const stStep3Status = document.getElementById("stStep3Status");
const stEnrollmentReview = document.getElementById("stEnrollmentReview");
const stEnrollmentYear = document.getElementById("stEnrollmentYear");
const stPlacementPreview = document.getElementById("stPlacementPreview");
const stCapacityPreview = document.getElementById("stCapacityPreview");
const stFeePreview = document.getElementById("stFeePreview");
const stAddBtn = document.getElementById("stAddBtn");
  const stRefreshBtn = document.getElementById("stRefreshBtn");
  const stApiStatus = document.getElementById("stApiStatus");
  const stTbody = document.getElementById("stTbody");
  const stListSearch = document.getElementById("stListSearch");
  const stListLevelFilter = document.getElementById("stListLevelFilter");
  const stListClassFilter = document.getElementById("stListClassFilter");
  const stListPrintBtn = document.getElementById("stListPrintBtn");
  const studentsListPrintMeta = document.getElementById("studentsListPrintMeta");
  const studentsListPrintReport = document.getElementById("studentsListPrintReport");
  const studentsListCard = document.getElementById("studentsListCard");
  if(stStartMonth && !stStartMonth.value){
    const d = new Date();
    stStartMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  // ===== Classe dropdown depends on level =====
const DEFAULT_CLASS_BY_LEVEL = {
  maternelle: ["1e", "2e", "3e"],
  primaire: ["1e", "2e", "3e", "4e", "5e", "6e"],
  secondaire: [
    "7e EB - Général",
    "8e EB - Général",
    "1re H - Scientifique",
    "1re H - Pédagogie",
    "1re H - Littéraire",
    "1re H - Électronique",
    "1re H - Méc. Gén.",
    "1re H - Méc. Auto",
    "1re H - Électricité",
    "1re H - Coupe & C.",
    "1re H - Comm. & G.",
    "1re H - Construction",
    "1re H - Hôtellerie",
    "1re H - Hôtesse d'accueil",
    "2e H - Scientifique",
    "2e H - Pédagogie",
    "2e H - Littéraire",
    "2e H - Méc. Gén.",
    "2e H - Méc. Auto",
    "2e H - Électricité",
    "2e H - Coupe & C.",
    "2e H - Comm. & G.",
    "2e H - Construction",
    "2e H - Hôtellerie",
    "2e H - Hôtesse d'accueil",
    "3e H - Scientifique",
    "3e H - Pédagogie",
    "3e H - Littéraire",
    "3e H - Électronique",
    "3e H - Méc. Gén.",
    "3e H - Méc. Auto",
    "3e H - Électricité",
    "3e H - Coupe & C.",
    "3e H - Comm. & G.",
    "4e H - Scientifique",
    "4e H - Pédagogie",
    "4e H - Littéraire",
    "4e H - Électronique",
    "4e H - Méc. Gén.",
    "4e H - Méc. Auto",
    "4e H - Électricité",
    "4e H - Coupe & C.",
    "4e H - Comm. & G."
  ]
};
let CLASS_BY_LEVEL = JSON.parse(JSON.stringify(DEFAULT_CLASS_BY_LEVEL));
const CLASS_CODE_CAPACITY = 50;
const CLASS_CODE_LETTERS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");

function mergeConfiguredClassesWithDefaults(configured, defaults){
  const configuredList = Array.isArray(configured) ? configured : defaults;
  const defaultLabelByKey = new Map((Array.isArray(defaults) ? defaults : [])
    .map((defaultClass) => {
      const safeDefault = String(defaultClass || "").trim();
      return [normalizeTextAscii(safeDefault).toLowerCase(), safeDefault];
    })
    .filter(([key, safeDefault]) => key && safeDefault));
  const cleaned = configuredList
    .map(v => String(v || "").trim())
    .filter(Boolean)
    .map((className) => defaultLabelByKey.get(normalizeTextAscii(className).toLowerCase()) || className);
  const seen = new Set(cleaned.map((v) => normalizeTextAscii(v).toLowerCase()));
  for(const defaultClass of (Array.isArray(defaults) ? defaults : [])){
    const safeDefault = String(defaultClass || "").trim();
    const key = normalizeTextAscii(safeDefault).toLowerCase();
    if(safeDefault && !seen.has(key)){
      cleaned.push(safeDefault);
      seen.add(key);
    }
  }
  return cleaned;
}

function getClassConfig(){
  try{
    const raw = localStorage.getItem(KEY_CLASS_CONFIG);
    if(!raw) return JSON.parse(JSON.stringify(DEFAULT_CLASS_BY_LEVEL));
    const parsed = JSON.parse(raw);
    const out = {
      maternelle: mergeConfiguredClassesWithDefaults(parsed?.maternelle, DEFAULT_CLASS_BY_LEVEL.maternelle),
      primaire: mergeConfiguredClassesWithDefaults(parsed?.primaire, DEFAULT_CLASS_BY_LEVEL.primaire),
      secondaire: mergeConfiguredClassesWithDefaults(parsed?.secondaire, DEFAULT_CLASS_BY_LEVEL.secondaire)
    };
    return out;
  }catch{
    return JSON.parse(JSON.stringify(DEFAULT_CLASS_BY_LEVEL));
  }
}

function saveClassConfig(config){
  localStorage.setItem(KEY_CLASS_CONFIG, JSON.stringify(config));
}

function loadClassConfig(){
  CLASS_BY_LEVEL = getClassConfig();
  saveClassConfig(CLASS_BY_LEVEL);
}

function fillClassDropdownFromLevel(levelValue) {
  const lvl = String(levelValue || "").toLowerCase();
  const options = CLASS_BY_LEVEL[lvl] || [];

  stClass.innerHTML = "";

  if (!options.length) {
    stClass.disabled = true;
    stClass.innerHTML = `<option value="">— Choisir le niveau d’abord —</option>`;
    return;
  }

  stClass.disabled = false;
  stClass.innerHTML =
    `<option value="">— Choisir —</option>` +
    options.map(c => `<option value="${c}">${c}</option>`).join("");
}

function levelDefaultDueUSD(levelValue, classValue){
  return defaultDueForLevelClass(levelValue, classValue);
}

function normalizeLevelForClassCode(levelValue){
  const raw = String(levelValue || "").trim().toLowerCase();
  if(raw === "maternelle" || raw === "primaire" || raw === "secondaire") return raw;
  if(raw === "maternel") return "maternelle";
  if(raw === "primary") return "primaire";
  if(raw === "secondary") return "secondaire";
  if(raw.startsWith("maternelle")) return "maternelle";
  if(raw.startsWith("primaire")) return "primaire";
  if(raw.startsWith("secondaire")) return "secondaire";
  return raw;
}

function shouldUseCode(levelValue){
  const lvl = normalizeLevelForClassCode(levelValue);
  return lvl === "maternelle" || lvl === "primaire" || lvl === "secondaire";
}

function isOldStudentEnrollmentActive(){
  return Boolean(stOldLookupPanel && !stOldLookupPanel.hidden);
}

function splitClassBaseAndCodeForStudents(levelValue, className){
  const lvl = normalizeLevelForClassCode(levelValue);
  const cls = String(className || "").trim().replace(/\s+/g, " ");
  if(!cls) return { base: "", code: "" };
  if(!shouldUseCode(lvl)) return { base: cls, code: "" };
  const m = cls.match(/^(.*\S)\s+([A-Z])$/i);
  if(!m) return { base: cls, code: "" };
  return {
    base: String(m[1] || "").trim(),
    code: String(m[2] || "").trim().toUpperCase()
  };
}

function computeClassCodeCounts(levelValue, classBase){
  const lvl = normalizeLevelForClassCode(levelValue);
  const base = String(classBase || "").trim();
  const counts = new Map();
  for(const letter of CLASS_CODE_LETTERS) counts.set(letter, 0);
  if(!shouldUseCode(lvl) || !base) return counts;
  for(const s of (Array.isArray(students) ? students : [])){
    if(s?.isActive === false) continue;
    if(normalizeLevelForClassCode(s?.level) !== lvl) continue;
    const parts = splitClassBaseAndCodeForStudents(lvl, s?.className || "");
    if(parts.base !== base) continue;
    if(!/^[A-Z]$/.test(parts.code)) continue;
    if(!counts.has(parts.code)) counts.set(parts.code, 0);
    counts.set(parts.code, Number(counts.get(parts.code) || 0) + 1);
  }
  return counts;
}

function firstAvailableClassCodeFromCounts(counts){
  for(const code of CLASS_CODE_LETTERS){
    if(Number(counts.get(code) || 0) < CLASS_CODE_CAPACITY) return code;
  }
  return "";
}

function buildClassCodeOptions(levelValue, classBase, currentCode = ""){
  const counts = computeClassCodeCounts(levelValue, classBase);
  const suggestedCode = firstAvailableClassCodeFromCounts(counts);
  const usedIndexes = CLASS_CODE_LETTERS
    .map((letter, idx) => (Number(counts.get(letter) || 0) > 0 ? idx : -1))
    .filter((idx) => idx >= 0);
  const highestUsedIndex = usedIndexes.length ? Math.max(...usedIndexes) : -1;
  const suggestedIndex = suggestedCode ? CLASS_CODE_LETTERS.indexOf(suggestedCode) : -1;
  const currentIndex = CLASS_CODE_LETTERS.indexOf(String(currentCode || "").toUpperCase());
  const lastVisibleIndex = Math.max(1, highestUsedIndex, suggestedIndex, currentIndex);
  const codes = CLASS_CODE_LETTERS.slice(0, lastVisibleIndex + 1);
  const options = codes.map((code) => {
    const count = Number(counts.get(code) || 0);
    const full = count >= CLASS_CODE_CAPACITY;
    return {
      code,
      count,
      full,
      label: `${code} (${count}/${CLASS_CODE_CAPACITY})`
    };
  });
  return { options, suggestedCode };
}

function refreshClassCodeDropdown({ levelValue, classBase, keepSelected = true, forceSuggest = false, preferredCode = "" } = {}){
  if(!stCode) return "";
  const lvl = normalizeLevelForClassCode(levelValue);
  const base = String(classBase || "").trim();
  if(!shouldUseCode(lvl)){
    stCode.innerHTML = `<option value="">&mdash; Choisir &mdash;</option>`;
    stCode.value = "";
    stCode.disabled = true;
    return "";
  }

  const current = String(stCode.value || "").trim().toUpperCase();
  const { options, suggestedCode } = buildClassCodeOptions(lvl, base, current);
  const preferred = String(preferredCode || "").trim().toUpperCase();
  stCode.innerHTML = `<option value="">&mdash; Choisir &mdash;</option>` +
    options.map((opt) => {
      return `<option value="${opt.code}">${opt.label}</option>`;
    }).join("");

  let nextValue = "";
  if(keepSelected && current){
    const existing = options.find((opt) => opt.code === current);
    if(existing) nextValue = current;
  }
  if(!nextValue && (forceSuggest || !current)){
    if(preferred){
      const preferredOption = options.find((opt) => opt.code === preferred);
      if(preferredOption) nextValue = preferred;
    }
    if(!nextValue) nextValue = suggestedCode || preferred || "";
  }
  if(!nextValue && keepSelected && current){
    const exists = options.some((opt) => opt.code === current);
    if(exists) nextValue = current;
  }
  stCode.value = nextValue;
  stCode.disabled = false;
  return suggestedCode;
}

function syncCodeDropdown(levelValue){
  refreshClassCodeDropdown({
    levelValue,
    classBase: stClass?.value || "",
    keepSelected: true,
    forceSuggest: !String(stCode?.value || "").trim(),
    preferredCode: isOldStudentEnrollmentActive() ? "A" : ""
  });
}

function suggestClassCodeForNewStudent(levelValue, classBase){
  const lvl = normalizeLevelForClassCode(levelValue);
  const base = String(classBase || "").trim();
  if(!shouldUseCode(lvl)) return "";
  const { suggestedCode } = buildClassCodeOptions(lvl, base, String(stCode?.value || ""));
  return suggestedCode || "A";
}

function suggestClassCodeForOldStudent(levelValue, classBase){
  const lvl = normalizeLevelForClassCode(levelValue);
  const base = String(classBase || "").trim();
  if(!shouldUseCode(lvl)) return "";
  const { options, suggestedCode } = buildClassCodeOptions(lvl, base, String(stCode?.value || ""));
  const optionA = options.find((opt) => opt.code === "A");
  if(optionA) return "A";
  return suggestedCode || "A";
}

function applySuggestedClassCode({ force = false, preferredCode = "" } = {}){
  const lvl = normalizeLevelForClassCode(stLevel?.value || "");
  if(!shouldUseCode(lvl) || !stCode) return;
  const hasCurrent = Boolean(String(stCode.value || "").trim());
  const nextPreferredCode = String(preferredCode || (isOldStudentEnrollmentActive() ? "A" : "")).trim().toUpperCase();
  refreshClassCodeDropdown({
    levelValue: lvl,
    classBase: stClass?.value || "",
    keepSelected: !force && hasCurrent,
    forceSuggest: force || !hasCurrent,
    preferredCode: nextPreferredCode
  });
}

function syncDueFromLevel(levelValue, { force = false } = {}){
  if(!stDue) return 0;
  const level = String(levelValue || "").trim();
  if(!level){
    if(force) stDue.value = "";
    return 0;
  }
  const next = Number(levelDefaultDueUSD(levelValue, stClass?.value || "") || 0);
  const currentRaw = String(stDue.value ?? "").trim();
  const currentValue = Number(currentRaw);
  if(force || !currentRaw || !Number.isFinite(currentValue) || currentValue < 0){
    stDue.value = String(next);
  }
  return next;
}

function syncStudentFormFromLevel(){
  fillClassDropdownFromLevel(stLevel.value);
  stClass.value = "";
  syncCodeDropdown(stLevel.value);
  applySuggestedClassCode({ force: true });
  syncDueFromLevel(stLevel.value, { force: true });
}

// when level changes -> update class/code/default due
stLevel.addEventListener("change", syncStudentFormFromLevel);
stClass.addEventListener("change", () => {
  applySuggestedClassCode({ force: true });
  syncDueFromLevel(stLevel.value, { force: true });
});
stCode?.addEventListener("focus", () => {
  applySuggestedClassCode({ force: false });
});

// initial state
loadClassConfig();
syncStudentFormFromLevel();
  /***************
   * Elements — Receipt preview fields
   ***************/
  const rDate = document.getElementById("rDate");
  const rNo = document.getElementById("rNo");
  const rStudent = document.getElementById("rStudent");
  const rClass = document.getElementById("rClass");
  const rSchoolYear = document.getElementById("rSchoolYear");
  const rMonth = document.getElementById("rMonth");
  const rMonthRow = document.getElementById("rMonthRow");
  const rFee = document.getElementById("rFee");
  const rAmt = document.getElementById("rAmt");
  const rFx = document.getElementById("rFx");
  const rMode = document.getElementById("rMode");
  const rCashier = document.getElementById("rCashier");

  /***************
   * Elements — Receipts view
   ***************/
  const rSearchInput = document.getElementById("rSearch");
  const rCurrencyFilter = document.getElementById("rCurrency");
  const rFrom = document.getElementById("rFrom");
  const rTo = document.getElementById("rTo");
  const rCount = document.getElementById("rCount");
  const receiptsTbody = document.getElementById("receiptsTbody");
  const btnReprint = document.getElementById("rReprint");
  const btnCorrectReceipt = document.getElementById("rCorrect");
  const btnCancelReceipt = document.getElementById("rCancel");
  const btnDelete = document.getElementById("rDelete");

/***************
 * Elements — Spending
 ***************/
const spDate = document.getElementById("spDate");
const spMonth = document.getElementById("spMonth");
const spCategory = document.getElementById("spCategory");
const spAmount = document.getElementById("spAmount");
const spCurrency = document.getElementById("spCurrency");
const spDesc = document.getElementById("spDesc");
const spAddBtn = document.getElementById("spAddBtn");
const spCollectionBtn = document.getElementById("spCollectionBtn");
const spSearch = document.getElementById("spSearch");
const spFilterCategory = document.getElementById("spFilterCategory");
const spFrom = document.getElementById("spFrom");
const spTo = document.getElementById("spTo");
const spTbody = document.getElementById("spTbody");
const spTotalMonthUsd = document.getElementById("spTotalMonthUsd");
const spTotalMonthCdf = document.getElementById("spTotalMonthCdf");
const spTotalAllUsd = document.getElementById("spTotalAllUsd");
const spTotalAllCdf = document.getElementById("spTotalAllCdf");
const spMonthLabel = document.getElementById("spMonthLabel");
const caisseGrid = document.getElementById("caisseGrid");
const caisseUpdatedAt = document.getElementById("caisseUpdatedAt");
const caisseTotalUsd = document.getElementById("caisseTotalUsd");
const caisseTotalCdf = document.getElementById("caisseTotalCdf");
const caisseActiveCount = document.getElementById("caisseActiveCount");
const caisseActiveMeta = document.getElementById("caisseActiveMeta");
const caisseEmptyToggle = document.getElementById("caisseEmptyToggle");
const caisseSpendModal = document.getElementById("caisseSpendModal");
const caisseSpendTitle = document.getElementById("caisseSpendTitle");
const caisseSpendAvail = document.getElementById("caisseSpendAvail");
const caisseSpendDate = document.getElementById("caisseSpendDate");
const caisseSpendMonth = document.getElementById("caisseSpendMonth");
const caisseSpendCurrency = document.getElementById("caisseSpendCurrency");
const caisseSpendKind = document.getElementById("caisseSpendKind");
const caisseSpendAmount = document.getElementById("caisseSpendAmount");
const caisseSpendDescription = document.getElementById("caisseSpendDescription");
const caisseSpendStatus = document.getElementById("caisseSpendStatus");
const caisseSpendSubmit = document.getElementById("caisseSpendSubmit");
const caisseSpendClose = document.getElementById("caisseSpendClose");
const caisseHistoryTbody = document.getElementById("caisseHistoryTbody");
const caisseHistoryCount = document.getElementById("caisseHistoryCount");
const caisseHistoryPrintBtn = document.getElementById("caisseHistoryPrintBtn");
const caisseHistorySearch = document.getElementById("caisseHistorySearch");
const caisseHistoryMoreBtn = document.getElementById("caisseHistoryMoreBtn");
const CAISSE_HISTORY_PAGE = 8;            // minimum affiché + pas du « Voir plus »
let caisseHistoryVisibleLimit = CAISSE_HISTORY_PAGE;
let caisseHistorySearchQuery = "";
if(caisseHistorySearch){
  caisseHistorySearch.addEventListener("input", () => {
    caisseHistorySearchQuery = caisseHistorySearch.value || "";
    caisseHistoryVisibleLimit = CAISSE_HISTORY_PAGE;   // toute recherche recommence à 8
    renderCaisseHistory();
  });
}
if(caisseHistoryMoreBtn){
  caisseHistoryMoreBtn.addEventListener("click", () => {
    caisseHistoryVisibleLimit += CAISSE_HISTORY_PAGE;
    renderCaisseHistory();
  });
}
const caisseTransferDate = document.getElementById("caisseTransferDate");
const caisseTransferMonth = document.getElementById("caisseTransferMonth");
const caisseTransferMode = document.getElementById("caisseTransferMode");
const caisseTransferSourceBox = document.getElementById("caisseTransferSourceBox");
const caisseTransferCounterpartyBox = document.getElementById("caisseTransferCounterpartyBox");
const caisseTransferSourceCurrency = document.getElementById("caisseTransferSourceCurrency");
const caisseTransferAmount = document.getElementById("caisseTransferAmount");
const caisseTransferCounterCurrencyField = document.getElementById("caisseTransferCounterCurrencyField");
const caisseTransferCounterCurrency = document.getElementById("caisseTransferCounterCurrency");
const caisseTransferRateField = document.getElementById("caisseTransferRateField");
const caisseTransferRate = document.getElementById("caisseTransferRate");
const caisseTransferNote = document.getElementById("caisseTransferNote");
const caisseTransferPreview = document.getElementById("caisseTransferPreview");
const caisseTransferSubmit = document.getElementById("caisseTransferSubmit");
const caisseTransferTbody = document.getElementById("caisseTransferTbody");
const caisseTransferCount = document.getElementById("caisseTransferCount");
const caisseTransferSearch = document.getElementById("caisseTransferSearch");
const caisseTransferMoreBtn = document.getElementById("caisseTransferMoreBtn");
let caisseTransferVisibleLimit = CAISSE_HISTORY_PAGE;
let caisseTransferSearchQuery = "";
if(caisseTransferSearch){
  caisseTransferSearch.addEventListener("input", () => {
    caisseTransferSearchQuery = caisseTransferSearch.value || "";
    caisseTransferVisibleLimit = CAISSE_HISTORY_PAGE;
    renderCaisseTransferHistory();
  });
}
if(caisseTransferMoreBtn){
  caisseTransferMoreBtn.addEventListener("click", () => {
    caisseTransferVisibleLimit += CAISSE_HISTORY_PAGE;
    renderCaisseTransferHistory();
  });
}

/***************
 * Elements — Reports
 ***************/
const repType = document.getElementById("repType");
const repMonthSel = document.getElementById("repMonthSel");
const repDateSel = document.getElementById("repDateSel");
const repDateConfirm = document.getElementById("repDateConfirm");
const repHint = document.getElementById("repHint");
const repPrintOne = document.getElementById("repPrintOne");
const repSingleBody = document.getElementById("repSingleBody");
const REPORT_TYPE_FEE_PREFIX = "feeReport:";
const REPORT_GROUP_TRANCHE_PREFIX = "group:etat-tranche-";
const REPORT_GROUP_LABELS = Object.freeze({
  [`${REPORT_GROUP_TRANCHE_PREFIX}1`]: "Frais de l'État — 1re tranche",
  [`${REPORT_GROUP_TRANCHE_PREFIX}2`]: "Frais de l'État — 2e tranche",
  [`${REPORT_GROUP_TRANCHE_PREFIX}3`]: "Frais de l'État — 3e tranche"
});
const BASE_REPORT_TYPE_OPTIONS = Object.freeze([
  { value: "custom", label: "Rapport personnalisé" },
  { value: "summary", label: "1. Résumé du mois (général)" },
  { value: "level", label: "2. Résumé du mois par niveau" },
  { value: "late", label: "3. Minerval — élèves en retard" },
  { value: "enrolledImpayes", label: "4. Élèves — mois impayés" },
  { value: "casSocial", label: "5. Élèves CAS SOCIAL" },
  { value: "enrolledStudents", label: "6. Liste des élèves inscrits" },
  { value: "inactiveStudents", label: "7. Élèves inactifs (radiés)" },
  { value: "daily", label: "8. Journée — entrées, sorties, solde" },
  { value: "dailyEntriesLevel", label: "9. Entrées du jour par niveau" },
  { value: "dailyEntriesCaisse", label: "10. Entrées du jour par caisse" },
  { value: "bus", label: "11. Bus — paiements du mois" },
  { value: "busSubscribers", label: "12. Bus — abonnés (liste par catégorie)" },
  { value: "tuitionBenefits", label: "13. Prise en charge (personnel)" },
  { value: "spending", label: "14. Dépenses du jour" },
  { value: "dailyCaisseArticlesSummary", label: "20. Caisses du jour (Admin)" },
  { value: "collectionDG", label: "15. Collection DG — historique mensuel" },
  { value: "feeDistribution", label: "16. Répartition des frais" },
  { value: "duplicateStudents", label: "17. Doublons de noms d’élèves" },
  { value: "studentContinuity", label: "18. Nouveaux / anciens élèves (comparatif)" },
  { value: "families", label: "19. Familles et fratries" }
]);

// Dashboard elements
const dashMonth = document.getElementById("dashMonth");
const dashTotalStudents = document.getElementById("dashTotalStudents");
const dashPaidStudents = document.getElementById("dashPaidStudents");
const dashExpectedUSD = document.getElementById("dashExpectedUSD");
const dashExpectedCDF = document.getElementById("dashExpectedCDF");
const dashRemainUSD = document.getElementById("dashRemainUSD");
const dashRemainCDF = document.getElementById("dashRemainCDF");
const dashBars = document.getElementById("dashBars");
const dashLevelTbody = document.getElementById("dashLevelTbody");
const dashRevenuePanel = document.getElementById("dashRevenuePanel");
const dashRevenueToggle = document.getElementById("dashRevenueToggle");
const dashRevenueChart = document.getElementById("dashRevenueChart");

// Settings elements
const setUsdToCdf = document.getElementById("setUsdToCdf");
const setSaveBtn = document.getElementById("setSaveBtn");
const setSchoolYear = document.getElementById("setSchoolYear");
const setSchoolYearSaveBtn = document.getElementById("setSchoolYearSaveBtn");
const setLevelFeeMaternelle = document.getElementById("setLevelFeeMaternelle");
const setLevelFeePrimaire = document.getElementById("setLevelFeePrimaire");
const setLevelFeeSecondaire = document.getElementById("setLevelFeeSecondaire");
const setLevelFeeSecondaire4eH = document.getElementById("setLevelFeeSecondaire4eH");
const setLevelFeeSaveBtn = document.getElementById("setLevelFeeSaveBtn");
const setMonthlyFeesOpenBtn = document.getElementById("setMonthlyFeesOpenBtn");
const monthlyFeesModal = document.getElementById("monthlyFeesModal");
const monthlyFeesTbody = document.getElementById("monthlyFeesTbody");
const monthlyFeesCloseBtn = document.getElementById("monthlyFeesCloseBtn");
const monthlyFeesResetBtn = document.getElementById("monthlyFeesResetBtn");
const monthlyFeesSaveBtn = document.getElementById("monthlyFeesSaveBtn");
const monthlyFeesStatus = document.getElementById("monthlyFeesStatus");
const setStatus = document.getElementById("setStatus");
const setFeeTypeName = document.getElementById("setFeeTypeName");
const setFeeTypePrice = document.getElementById("setFeeTypePrice");
const setFeeTypeCurrency = document.getElementById("setFeeTypeCurrency");
const setFeeTypeCycle = document.getElementById("setFeeTypeCycle");
const setFeeTypeDueMonth = document.getElementById("setFeeTypeDueMonth");
const setFeeTypeIsItem = document.getElementById("setFeeTypeIsItem");
const setFeeTypeNoFixedPrice = document.getElementById("setFeeTypeNoFixedPrice");
const feeTypeScopeLevelList = document.getElementById("feeTypeScopeLevelList");
const setFeeTypeScopeClasses = document.getElementById("setFeeTypeScopeClasses");
const setFeeTypeAdd = document.getElementById("setFeeTypeAdd");
const setFeePriceTbody = document.getElementById("setFeePriceTbody");
const setFeeStatus = document.getElementById("setFeeStatus");
const setBusPrice = document.getElementById("setBusPrice");
const setBusPriceSaveBtn = document.getElementById("setBusPriceSaveBtn");
const setBusPriceStatus = document.getElementById("setBusPriceStatus");
const setClassLevel = document.getElementById("setClassLevel");
const setClassName = document.getElementById("setClassName");
const setClassAddBtn = document.getElementById("setClassAddBtn");
const setClassTbody = document.getElementById("setClassTbody");
const setClassStatus = document.getElementById("setClassStatus");
const setThemeToggle = document.getElementById("setThemeToggle");
const setThemeStatus = document.getElementById("setThemeStatus");
const adminUsersSection = document.getElementById("adminUsersSection");
const usrName = document.getElementById("usrName");
const usrPass = document.getElementById("usrPass");
const usrRole = document.getElementById("usrRole");
const usrCreateBtn = document.getElementById("usrCreateBtn");
const usrTbody = document.getElementById("usrTbody");
const usrStatus = document.getElementById("usrStatus");
const loginOverlay = document.getElementById("loginOverlay");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const studentProfileModal = document.getElementById("studentProfileModal");
const studentProfileClose = document.getElementById("studentProfileClose");
const studentProfileNewPaymentBtn = document.getElementById("studentProfileNewPaymentBtn");
const appConfirmModal = document.getElementById("appConfirmModal");
const appConfirmTitle = document.getElementById("appConfirmTitle");
const appConfirmMessage = document.getElementById("appConfirmMessage");
const appConfirmCancelTop = document.getElementById("appConfirmCancelTop");
const appConfirmCancel = document.getElementById("appConfirmCancel");
const appConfirmOk = document.getElementById("appConfirmOk");
const studentProfileTitle = document.getElementById("studentProfileTitle");
const studentProfileSubtitle = document.getElementById("studentProfileSubtitle");
const pfAvatar = document.getElementById("pfAvatar");
const pfProfileClassChip = document.getElementById("pfProfileClassChip");
const pfProfileStatusChip = document.getElementById("pfProfileStatusChip");
const pfProfileAcademicChip = document.getElementById("pfProfileAcademicChip");
const profileAcademicCard = document.getElementById("profileAcademicCard");
const profileIdentityCard = document.getElementById("profileIdentityCard");
const pfAcademicHeadline = document.getElementById("pfAcademicHeadline");
const pfAcademicMeta = document.getElementById("pfAcademicMeta");
const pfAcademicAverage = document.getElementById("pfAcademicAverage");
const pfAcademicPeriods = document.getElementById("pfAcademicPeriods");
const pfAcademicRank = document.getElementById("pfAcademicRank");
const pfAcademicFailures = document.getElementById("pfAcademicFailures");
const pfAcademicTrend = document.getElementById("pfAcademicTrend");
const pfOpenGradesBtn = document.getElementById("pfOpenGradesBtn");
const pfId = document.getElementById("pfId");
const pfName = document.getElementById("pfName");
const pfClass = document.getElementById("pfClass");
const pfLevel = document.getElementById("pfLevel");
const pfSex = document.getElementById("pfSex");
const pfEnrolledAt = document.getElementById("pfEnrolledAt");
const pfMonthlyDue = document.getElementById("pfMonthlyDue");
const pfFamilyName = document.getElementById("pfFamilyName");
const pfSiblings = document.getElementById("pfSiblings");
const pfFamilyLink = document.getElementById("pfFamilyLink");
const pfFamilyLinkBtn = document.getElementById("pfFamilyLinkBtn");
const pfFamilyLinkStatus = document.getElementById("pfFamilyLinkStatus");
const pfBusSub = document.getElementById("pfBusSub");
const pfBusManageBtn = document.getElementById("pfBusManageBtn");
const pfTuitionBenefit = document.getElementById("pfTuitionBenefit");
const pfTuitionBenefitBtn = document.getElementById("pfTuitionBenefitBtn");
const profileInfoCard = document.getElementById("profileInfoCard");
const pfFullName = document.getElementById("pfFullName");
const pfSexToggleBtn = document.getElementById("pfSexToggleBtn");
const pfMonthlyDueEditField = document.getElementById("pfMonthlyDueEditField");
const pfMonthlyDueEdit = document.getElementById("pfMonthlyDueEdit");
const pfParentName = document.getElementById("pfParentName");
const pfParentPhone = document.getElementById("pfParentPhone");
const pfDateOfBirth = document.getElementById("pfDateOfBirth");
const pfParentPhoneAlt = document.getElementById("pfParentPhoneAlt");
const pfAddress = document.getElementById("pfAddress");
const pfEmergencyContact = document.getElementById("pfEmergencyContact");
const pfStudentNote = document.getElementById("pfStudentNote");
const pfInfoSaveBtn = document.getElementById("pfInfoSaveBtn");
const pfInfoStatus = document.getElementById("pfInfoStatus");
const profileClassChangeCard = document.getElementById("profileClassChangeCard");
const pfChangeLevel = document.getElementById("pfChangeLevel");
const pfChangeClass = document.getElementById("pfChangeClass");
const pfChangeCode = document.getElementById("pfChangeCode");
const pfEffectiveMonth = document.getElementById("pfEffectiveMonth");
const pfChangeReason = document.getElementById("pfChangeReason");
const pfChangeClassBtn = document.getElementById("pfChangeClassBtn");
const pfChangeStatus = document.getElementById("pfChangeStatus");
const profileFeeStatusCard = document.getElementById("profileFeeStatusCard");
const profilePaymentsCard = document.getElementById("profilePaymentsCard");
const pfFeeStatusTbody = document.getElementById("pfFeeStatusTbody");
const pfFeeStatusControls = document.getElementById("pfFeeStatusControls");
const pfHistoryFeeFilter = document.getElementById("pfHistoryFeeFilter");
const pfHistoryLimit = document.getElementById("pfHistoryLimit");
const pfHistoryRefresh = document.getElementById("pfHistoryRefresh");
const pfPaymentsTbody = document.getElementById("pfPaymentsTbody");
const pfHistoryControls = document.getElementById("pfHistoryControls");
const pfHistoryAddWrap = document.getElementById("pfHistoryAddWrap");
const pfHistoryAddDate = document.getElementById("pfHistoryAddDate");
const pfHistoryAddMonth = document.getElementById("pfHistoryAddMonth");
const pfHistoryAddFee = document.getElementById("pfHistoryAddFee");
const pfHistoryAddCurrency = document.getElementById("pfHistoryAddCurrency");
const pfHistoryAddAmount = document.getElementById("pfHistoryAddAmount");
const pfHistoryAddNote = document.getElementById("pfHistoryAddNote");
const pfHistoryAddBtn = document.getElementById("pfHistoryAddBtn");
const pfHistoryAddStatus = document.getElementById("pfHistoryAddStatus");

/***************
 * State
 ***************/
let selectedStudentId = null;
let currentThemeMode = normalizeThemeMode(document.documentElement?.getAttribute("data-theme") || "light");
let selectedPaymentId = null;
let lastReceiptForPrint = null;
let printInProgress = false;
let printStatusClearTimer = null;
const PRINT_BUTTON_LABEL_DEFAULT = String(elPrint?.textContent || "Imprimer").trim() || "Imprimer";
let dashRevenueCollapsed = false;
let currentUser = null;
let receiptsApiCache = [];
let paymentsCache = [];
let paymentsLoadPromise = null;
let paymentsLastLoadedAt = 0;
let apiReachable = true;
let lastApiError = "";
let syncTimer = null;
let liveRefreshTimer = null;
let liveRefreshInFlight = false;
let liveRefreshQueued = false;
let liveRefreshQueuedForce = false;
let liveRefreshDebounceTimer = null;
let liveRefreshDebounceForce = false;
let liveRefreshLastRunAt = 0;
const LIVE_REFRESH_DEBOUNCE_MS = 320;
const LIVE_REFRESH_MIN_GAP_MS = 2500;
const LIVE_REFRESH_INTERVAL_MS = 30000;
const BACKGROUND_PAYMENTS_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const PAYMENT_UI_REFRESH_PAUSE_MS = 3500;
let paymentUiLastInputAt = 0;
let reportsRenderDebounceTimer = null;
let reportsRenderInFlight = false;
let reportsRenderQueued = false;
let reportConfirmedDateIso = "";
const RECEIPTS_LIST_STEP = 15;
let receiptsVisibleCount = RECEIPTS_LIST_STEP;
const SPENDING_LIST_STEP = 15;
let spendingVisibleCount = SPENDING_LIST_STEP;
const PAYMENT_LIST_STEP = 8;
const STUDENTS_LIST_STEP = 8;
let paymentVisibleCount = PAYMENT_LIST_STEP;
let studentsVisibleCount = STUDENTS_LIST_STEP;
let studentsTableRows = [];
let studentsTableMode = "api";
let studentsClassCollapsed = Object.create(null);
let studentsPrintRestore = null;
const PROFILE_FEE_STATUS_STEP = 5;
let profileFeeStatusVisibleCount = PROFILE_FEE_STATUS_STEP;
let profileHistoryVisibleCount = 10;
let profileHistoryEditingPaymentId = "";
let studentProfileState = {
  studentId: null,
  student: null,
  payments: [],
  busSubscription: null,
  feeStatuses: [],
  academic: null
};

// cached report rows so filters are instant
let currentOweRows = [];
let selectedStudentFeeStatus = null;
let feeTypesApiCache = [];
let activeSchoolYearStartYear = null;
let paymentStudentsOrderSignature = "";
let paymentStudentsOrderedCache = [];
const reportsSummaryApiCache = new Map();
const busReportApiCache = new Map();
const dailyEntriesReportApiCache = new Map();
const lateStudentsReportApiCache = new Map();
let paymentsDataSignature = "";
let spendingsDataSignature = "";
let caisseTransfersDataSignature = "";
let receiptsDataSignature = "";
let caisseModalCurrentKey = "";
let caisseBoxSnapshotByKey = new Map();
let caisseShowEmptyBoxes = false;

if(caisseEmptyToggle){
  caisseEmptyToggle.addEventListener("click", () => {
    caisseShowEmptyBoxes = !caisseShowEmptyBoxes;
    renderCaisse();
  });
}
document.querySelectorAll("[data-open-caisse-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    const panel = document.getElementById(String(button.dataset.openCaissePanel || ""));
    if(!panel) return;
    if("open" in panel) panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
let prefetchedReceiptReservation = null;
let prefetchedReceiptReservationsByYear = Object.create(null);
let prefetchReceiptPromise = null;
let prefetchReceiptPromiseYearKey = "";

/***************
 * Helpers
 ***************/
function onlyDigits(str){ return (str || "").replace(/[^\d]/g, ""); }
function debounce(fn, waitMs = 120){
  let timer = null;
  return (...args) => {
    if(timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, Math.max(0, Number(waitMs || 0)));
  };
}
function hashRowsSignature(rows, rowToToken){
  const list = Array.isArray(rows) ? rows : [];
  let hash = 2166136261 >>> 0;
  const apply = (text) => {
    const src = String(text == null ? "" : text);
    for(let i = 0; i < src.length; i += 1){
      hash ^= src.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  for(let i = 0; i < list.length; i += 1){
    apply("|");
    apply(i);
    apply("|");
    apply(rowToToken ? rowToToken(list[i], i) : "");
  }
  return `${list.length}:${hash.toString(16)}`;
}
function normalizePrintCount(value){
  const n = Number(value);
  if(!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}
function paymentSignatureToken(r){
  return [
    r?.id, r?.createdAt, r?.studentId, r?.amountEntered, r?.amountUSDReceived, r?.amountCDFReceived,
    r?.currency, r?.feeTypeId, r?.paymentMethod || "", r?.paidForMonth || r?.monthKey || r?.month,
    r?.pendingSync ? 1 : 0, r?.clientRequestId || "", r?.syncError || "",
    normalizePrintCount(r?.printCount), r?.cancelled ? 1 : 0, r?.originalAmount, r?.cancellationReason || ""
  ].join("|");
}
function spendingSignatureToken(r){
  return [
    r?.id, r?.date, r?.amount, r?.currency, r?.category,
    r?.description, r?.caisseBoxKey || r?.caisse_box_key || "", r?.appliesToMonth || r?.applies_to_month || r?.monthKey || "",
    r?.schoolYearStartYear, r?.pendingSync ? 1 : 0
  ].join("|");
}
function caisseTransferSignatureToken(r){
  return [
    r?.id, r?.date, r?.mode, r?.sourceBoxKey, r?.counterpartyBoxKey,
    r?.sourceCurrency, r?.sourceAmount, r?.counterCurrency, r?.counterAmount,
    r?.fxRate, r?.appliesToMonth || "", r?.schoolYearStartYear
  ].join("|");
}
function receiptSignatureToken(r){
  return [
    r?.id, r?.createdAt, r?.receiptNo, r?.studentId,
    r?.amountEntered, r?.amountUSDReceived, r?.amountCDFReceived, r?.currency, r?.feeTypeId, r?.paidForMonth || r?.monthKey || r?.month,
    r?.pendingSync ? 1 : 0, r?.syncError || "", r?.clientRequestId || "",
    normalizePrintCount(r?.printCount), r?.cancelled ? 1 : 0, r?.originalAmount, r?.cancellationReason || ""
  ].join("|");
}
function normalizeProfileTextInput(value, maxLen = 240){
  const v = String(value == null ? "" : value).trim();
  if(!v) return null;
  return v.slice(0, Math.max(1, Number(maxLen || 240)));
}
function formatIsoDateToFr(value){
  const iso = normalizeLooseDateToISO(value);
  if(!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function parseFrDateToISO(value){
  const raw = String(value == null ? "" : value).trim();
  if(!raw) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m) return "";
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if(!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yyyy)) return "";
  if(yyyy < 1900 || yyyy > 2100) return "";
  if(mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  if(!Number.isFinite(date.getTime())) return "";
  if(date.getUTCFullYear() !== yyyy || (date.getUTCMonth() + 1) !== mm || date.getUTCDate() !== dd) return "";
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
function normalizeProfileDateInput(value){
  const iso = parseFrDateToISO(value);
  return iso || null;
}
function pad4(n){ return String(n).padStart(4, "0"); }
function getYear(){ return new Date().getFullYear(); }
function getDefaultSchoolYearStartYear(now = new Date()){
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 9 ? year : (year - 1);
}
function normalizeSchoolYearStartYear(v){
  const n = Number(v);
  if(!Number.isFinite(n)) return null;
  const y = Math.floor(n);
  if(y < 2000 || y > 2100) return null;
  return y;
}
function parseSchoolYearInput(raw){
  const txt = String(raw || "").trim();
  if(!txt) return null;
  const direct = normalizeSchoolYearStartYear(txt);
  if(direct) return direct;
  const m = txt.match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if(!m) return null;
  const start = normalizeSchoolYearStartYear(m[1]);
  const end = normalizeSchoolYearStartYear(m[2]);
  if(!start || !end || end !== start + 1) return null;
  return start;
}
function getActiveSchoolYearStartYear(){
  return normalizeSchoolYearStartYear(activeSchoolYearStartYear) || getDefaultSchoolYearStartYear();
}
function schoolYearLabelFromStartYear(startYear){
  const y = normalizeSchoolYearStartYear(startYear);
  if(!y) return "";
  return `${y}-${y + 1}`;
}
function buildSchoolYearMonthBounds(startYear){
  const safeStartYear = normalizeSchoolYearStartYear(startYear);
  if(!safeStartYear) return null;
  return {
    startYear: safeStartYear,
    startMonth: `${safeStartYear}-09`,
    endMonth: `${safeStartYear + 1}-08`
  };
}
function schoolYearStartYearFromMonthKey(monthKey){
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if(!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if(!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return month >= 9 ? year : (year - 1);
}
function monthKeyBelongsToSchoolYear(monthKey, schoolYearStartYear){
  const safeMonthKey = String(monthKey || "").trim();
  const bounds = buildSchoolYearMonthBounds(schoolYearStartYear);
  if(!/^\d{4}-\d{2}$/.test(safeMonthKey) || !bounds) return false;
  return safeMonthKey >= bounds.startMonth && safeMonthKey <= bounds.endMonth;
}
function buildSchoolYearDropdownStartYears(targetStartYear = null){
  const years = new Set();
  const pushAround = (anchor) => {
    const start = normalizeSchoolYearStartYear(anchor);
    if(!start) return;
    for(let offset = -4; offset <= 4; offset += 1){
      const y = start + offset;
      if(y >= 2000 && y <= 2100) years.add(y);
    }
  };
  pushAround(getDefaultSchoolYearStartYear());
  pushAround(readSchoolYearLocal());
  pushAround(getActiveSchoolYearStartYear());
  pushAround(targetStartYear);
  if(!years.size){
    const fallback = getDefaultSchoolYearStartYear();
    if(fallback >= 2000 && fallback <= 2100) years.add(fallback);
  }
  return Array.from(years).sort((a, b) => b - a);
}
function ensureSchoolYearDropdownOptions(targetStartYear = null){
  if(!setSchoolYear) return;
  if(String(setSchoolYear.tagName || "").toUpperCase() !== "SELECT") return;
  const selectedStart = normalizeSchoolYearStartYear(targetStartYear)
    || parseSchoolYearInput(setSchoolYear.value || "")
    || getActiveSchoolYearStartYear();
  const years = buildSchoolYearDropdownStartYears(selectedStart);
  setSchoolYear.innerHTML = years
    .map((startYear) => {
      const label = schoolYearLabelFromStartYear(startYear);
      return `<option value="${label}">${label}</option>`;
    })
    .join("");
  const selectedLabel = schoolYearLabelFromStartYear(selectedStart);
  if(selectedLabel) setSchoolYear.value = selectedLabel;
  if(!setSchoolYear.value && years.length){
    setSchoolYear.value = schoolYearLabelFromStartYear(years[0]);
  }
}
function currentSchoolYearLabel(){
  return schoolYearLabelFromStartYear(getActiveSchoolYearStartYear());
}
function getActiveReceiptYear(){
  const startYear = normalizeSchoolYearStartYear(getActiveSchoolYearStartYear());
  return startYear ? (startYear + 1) : getYear();
}
function getActiveReceiptSeqStorageKey(){
  return String(getActiveReceiptYear() || getYear());
}
function sanitizeReceiptSeqValue(value){
  const n = Number(value);
  if(!Number.isFinite(n)) return null;
  const seq = Math.floor(n);
  return seq >= 1 ? seq : null;
}
function getReceiptSeqStore(){
  const raw = String(localStorage.getItem(KEY_RECEIPT_SEQ) || "").trim();
  if(!raw) return {};
  try{
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed === "object" && !Array.isArray(parsed)){
      const next = {};
      for(const [key, value] of Object.entries(parsed)){
        const year = Number(key);
        const seq = sanitizeReceiptSeqValue(value);
        if(Number.isFinite(year) && year >= 2000 && year <= 2100 && seq){
          next[String(Math.floor(year))] = seq;
        }
      }
      return next;
    }
  }catch(_){}
  return {};
}
function setReceiptSeqStore(store){
  const next = {};
  for(const [key, value] of Object.entries(store || {})){
    const year = Number(key);
    const seq = sanitizeReceiptSeqValue(value);
    if(Number.isFinite(year) && year >= 2000 && year <= 2100 && seq){
      next[String(Math.floor(year))] = seq;
    }
  }
  localStorage.setItem(KEY_RECEIPT_SEQ, JSON.stringify(next));
}
function extractReceiptNoParts(receiptNo){
  const match = String(receiptNo || "").trim().match(/^[A-Z0-9]+-(?:(C\d+)-)?(\d{4})-(\d+)$/i);
  if(!match) return null;
  const deviceCode = String(match[1] || "").toUpperCase() || null;
  const year = Number(match[2]);
  const seq = sanitizeReceiptSeqValue(match[3]);
  if(!Number.isFinite(year) || !seq) return null;
  return { deviceCode, year, seq };
}
function getReceiptFloorSeqForYear(yearKey = getActiveReceiptSeqStorageKey()){
  const store = getReceiptSeqStore();
  return sanitizeReceiptSeqValue(store[yearKey]) || 1;
}
function normalizeReceiptReservationForYear(yearKey, reservation){
  const receiptNo = String(reservation?.receiptNo || "").trim();
  const parts = extractReceiptNoParts(receiptNo);
  const expectedYear = Number(yearKey);
  if(!parts || !Number.isFinite(expectedYear) || parts.year !== expectedYear) return null;
  return { receiptNo, deviceCode: parts.deviceCode || reservation?.deviceCode || null, preview: true };
}
function monthYearForSchoolMonthLabel(label){
  const idx = monthLabelToIndexFR(label);
  if(idx < 0) return null;
  const start = getActiveSchoolYearStartYear();
  return idx >= 8 ? start : (start + 1); // Sep-Dec in start year; Jan-Jun in next year
}
function isSchoolMonthLabel(label){
  return SCHOOL_MONTH_LABELS_FR.includes(String(label || ""));
}
function currentCalendarMonthKey(){
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getCurrentMonthLabel(){
  const label = MONTH_LABELS_FR[new Date().getMonth()];
  if(isSchoolMonthLabel(label)) return label;
  return "Septembre";
}
const MONTH_LABELS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const SCHOOL_MONTH_LABELS_FR = ["Septembre","Octobre","Novembre","Décembre","Janvier","Février","Mars","Avril","Mai","Juin"];
function monthLabelForActiveSchoolYear(monthKey){
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if(!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  if(!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return "";
  if(!(month >= 9 || month <= 6)) return "";
  const activeStart = getActiveSchoolYearStartYear();
  const expectedYear = month >= 9 ? activeStart : (activeStart + 1);
  if(year !== expectedYear) return "";
  return MONTH_LABELS_FR[month - 1] || "";
}
function getDefaultSchoolMonthLabel(){
  const currentLabel = monthLabelForActiveSchoolYear(currentCalendarMonthKey());
  if(currentLabel) return currentLabel;
  return SCHOOL_MONTH_LABELS_FR[0] || "Septembre";
}
function getAutoAppliedSchoolMonthMeta(dateValue = new Date()){
  const dateIso = toDateISO(dateValue);
  const activeStartYear = normalizeSchoolYearStartYear(getActiveSchoolYearStartYear());
  const currentMonthKey = monthKeyFromDateISO(dateIso);
  const fallbackMonthKey = buildSchoolYearMonthBounds(activeStartYear)?.startMonth || "";
  const monthKey = monthKeyBelongsToSchoolYear(currentMonthKey, activeStartYear)
    ? currentMonthKey
    : fallbackMonthKey;
  return {
    dateIso,
    monthKey,
    monthLabel: monthLabelForActiveSchoolYear(monthKey) || getDefaultSchoolMonthLabel()
  };
}
function getAutoAppliedSchoolMonthLabel(dateValue = new Date()){
  return getAutoAppliedSchoolMonthMeta(dateValue).monthLabel;
}
function setSchoolMonthSelectValue(selectEl, preferredValue, fallbackValue = ""){
  if(!selectEl) return "";
  const options = Array.from(selectEl.options || []).map((opt) => String(opt.value || ""));
  const tryAssign = (value) => {
    const label = String(value || "").trim();
    if(!label || !options.includes(label)) return "";
    selectEl.value = label;
    return selectEl.value === label ? label : "";
  };
  return (
    tryAssign(preferredValue)
    || tryAssign(fallbackValue)
    || tryAssign(getDefaultSchoolMonthLabel())
    || tryAssign(options[0] || "")
    || ""
  );
}
const DEFAULT_FEE_CONFIG = {
  "Minerval": 0,
  "Bus": 10
};
const FEE_TYPE_MAX_SCOPE_CLASSES = 80;
const DEFAULT_FEE_TYPES_API_FALLBACK = [
  { id: "TUITION", code: "TUITION", labelFr: "Minerval", defaultCurrency: "USD", defaultAmount: 0, billingCycle: "monthly", skipAutoPrint: false, active: true },
  { id: "BUS", code: "BUS", labelFr: "Bus", defaultCurrency: "USD", defaultAmount: 10, billingCycle: "monthly", skipAutoPrint: false, active: true },
  { id: "ETAT_T1_PM", code: "ETAT_T1_PM", labelFr: "Frais de l'État — 1re tranche (Maternelle/Primaire)", defaultCurrency: "CDF", defaultAmount: 9000, billingCycle: "annual", active: true },
  { id: "ETAT_T2_PM", code: "ETAT_T2_PM", labelFr: "Frais de l'État — 2e tranche (Maternelle/Primaire)", defaultCurrency: "CDF", defaultAmount: 9000, billingCycle: "annual", active: true },
  { id: "ETAT_T3_PM", code: "ETAT_T3_PM", labelFr: "Frais de l'État — 3e tranche (Maternelle/Primaire)", defaultCurrency: "CDF", defaultAmount: 9000, billingCycle: "annual", active: true },
  { id: "ETAT_T1_78", code: "ETAT_T1_78", labelFr: "Frais de l'État — 1re tranche (7e/8e)", defaultCurrency: "CDF", defaultAmount: 16500, billingCycle: "annual", active: true },
  { id: "ETAT_T2_78", code: "ETAT_T2_78", labelFr: "Frais de l'État — 2e tranche (7e/8e)", defaultCurrency: "CDF", defaultAmount: 16500, billingCycle: "annual", active: true },
  { id: "ETAT_T3_78", code: "ETAT_T3_78", labelFr: "Frais de l'État — 3e tranche (7e/8e)", defaultCurrency: "CDF", defaultAmount: 16500, billingCycle: "annual", active: true },
  { id: "ETAT_T1_SEC_GENERAL", code: "ETAT_T1_SEC_GENERAL", labelFr: "Frais de l'État — 1re tranche (Secondaire général)", defaultCurrency: "CDF", defaultAmount: 21500, billingCycle: "annual", active: true },
  { id: "ETAT_T2_SEC_GENERAL", code: "ETAT_T2_SEC_GENERAL", labelFr: "Frais de l'État — 2e tranche (Secondaire général)", defaultCurrency: "CDF", defaultAmount: 21500, billingCycle: "annual", active: true },
  { id: "ETAT_T3_SEC_GENERAL", code: "ETAT_T3_SEC_GENERAL", labelFr: "Frais de l'État — 3e tranche (Secondaire général)", defaultCurrency: "CDF", defaultAmount: 21500, billingCycle: "annual", active: true },
  { id: "ETAT_T1_SEC_TECH", code: "ETAT_T1_SEC_TECH", labelFr: "Frais de l'État — 1re tranche (Secondaire technique)", defaultCurrency: "CDF", defaultAmount: 22500, billingCycle: "annual", active: true },
  { id: "ETAT_T2_SEC_TECH", code: "ETAT_T2_SEC_TECH", labelFr: "Frais de l'État — 2e tranche (Secondaire technique)", defaultCurrency: "CDF", defaultAmount: 22500, billingCycle: "annual", active: true },
  { id: "ETAT_T3_SEC_TECH", code: "ETAT_T3_SEC_TECH", labelFr: "Frais de l'État — 3e tranche (Secondaire technique)", defaultCurrency: "CDF", defaultAmount: 22500, billingCycle: "annual", active: true },
  { id: "ETAT_MINERVAL", code: "ETAT_MINERVAL", labelFr: "Minerval de l'État", defaultCurrency: "CDF", defaultAmount: 2500, billingCycle: "annual", active: true },
  { id: "ETAT_FRAIS_TECHNIQUE", code: "ETAT_FRAIS_TECHNIQUE", labelFr: "Frais technique", defaultCurrency: "CDF", defaultAmount: 17500, billingCycle: "annual", active: true },
  { id: "EXAMEN_ETAT_4E", code: "EXAMEN_ETAT_4E", labelFr: "Examen d'État (4e)", defaultCurrency: "CDF", defaultAmount: 160000, billingCycle: "annual", active: true },
  { id: "TENASOSP_8E", code: "TENASOSP_8E", labelFr: "Frais TENASOSP (8e)", defaultCurrency: "CDF", defaultAmount: 40000, billingCycle: "annual", active: true },
  { id: "ENROLEMENT_8E", code: "ENROLEMENT_8E", labelFr: "Frais d’enrôlement (8e)", defaultCurrency: "CDF", defaultAmount: 20000, billingCycle: "annual", active: true },
  { id: "ENROLEMENT_4E", code: "ENROLEMENT_4E", labelFr: "Frais d’enrôlement (4e)", defaultCurrency: "CDF", defaultAmount: 55000, billingCycle: "annual", active: true }
];

const BASE_CAISSE_BOX_DEFINITIONS = Object.freeze([
  { key: "minerval", label: "Minerval", codes: ["TUITION"] },
  { key: "bus", label: "Bus", codes: ["BUS"] },
  { key: "examen_etat_4e", label: "Examen d'Etat (4e)", codes: ["EXAMEN_ETAT_4E"] },
  { key: "enrolement_4e", label: "Frais d'enrolement (4e)", codes: ["ENROLEMENT_4E"] },
  { key: "enrolement_8e", label: "Frais d'enrolement (8e)", codes: ["ENROLEMENT_8E"] },
  { key: "frais_etat_tranches", label: "Frais de l'Etat + frais technique", codes: ["ETAT_FRAIS_TECHNIQUE"], codePrefixes: ["ETAT_T1_", "ETAT_T2_", "ETAT_T3_"] },
  { key: "tenasosp", label: "Frais TENASOSP", codes: ["TENASOSP_8E"] },
  { key: "fee_etat_minerval", label: "Minerval de l'Etat", codes: ["ETAT_MINERVAL"] }
]);
const HIDDEN_RETIRED_CAISSE_BOX_KEYS = new Set(["bulletin", "formation_ipp"]);
const STATE_PAID_SPENDING_PREFIX = "Paid - ";

function monthLabelToIndexFR(label){
  return MONTH_LABELS_FR.findIndex(m => m.toLowerCase() === String(label || "").toLowerCase());
}

function countMojibakeMarkers(text){
  return (String(text || "").match(/Ã|Â|â€|â€™|â€œ|â€|â€“|â€”/g) || []).length;
}
function decodeLikelyUtf8Mojibake(text){
  const input = String(text || "");
  if(!input || !/[ÃÂâ]/.test(input)) return input;
  try{
    const bytes = Uint8Array.from(Array.from(input, (ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if(!decoded || decoded.includes("�")) return input;
    if(countMojibakeMarkers(decoded) < countMojibakeMarkers(input)) return decoded;
  }catch(_){}
  return input;
}
function normalizeFeeName(v){
  const compact = String(v || "").trim().replace(/\s+/g, " ");
  return decodeLikelyUtf8Mojibake(compact);
}
function normalizeFeeBillingCycle(v){
  const raw = String(v || "").trim().toLowerCase();
  if(raw === "annual" || raw === "annuel" || raw === "yearly") return "annual";
  if(raw === "item" || raw === "article" || raw === "one_off" || raw === "oneoff") return "item";
  return "monthly";
}
function feeCycleLabelFr(v){
  return normalizeFeeBillingCycle(v) === "annual" ? "Annuel" : "Mensuel";
}

function normalizeFeeDueMonthValue(v){
  const raw = String(v || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : "";
}

function feeDueMonthLabelFr(v){
  const dueMonth = normalizeFeeDueMonthValue(v);
  if(!dueMonth) return "—";
  const monthNames = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const [year, month] = dueMonth.split("-");
  return `${monthNames[Number(month) - 1] || month} ${year}`;
}

function normalizeFeeScopeLevelValue(v){
  const raw = String(v || "").trim().toLowerCase();
  if(raw === "maternelle" || raw === "primaire" || raw === "secondaire") return raw;
  return "";
}

function normalizeFeeScopeLevels(raw, legacyLevel = ""){
  const values = Array.isArray(raw)
    ? raw
    : (typeof raw === "string" ? raw.split(/[,\n;|]+/g) : []);
  const out = [];
  for(const value of values){
    const level = normalizeFeeScopeLevelValue(value);
    if(level && !out.includes(level)) out.push(level);
  }
  const legacy = normalizeFeeScopeLevelValue(legacyLevel);
  if(!out.length && legacy) out.push(legacy);
  return out;
}

function normalizeFeeScopeClassList(raw){
  const values = Array.isArray(raw)
    ? raw
    : (typeof raw === "string" ? raw.split(/[,\n;|]+/g) : []);
  const out = [];
  const seen = new Set();
  for(const entry of values){
    const value = String(entry || "").trim().replace(/\s+/g, " ");
    if(!value) continue;
    const key = normalizeTextAscii(value).replace(/\s+/g, " ");
    if(!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeFeePricingRules(raw){
  let values = raw;
  if(typeof raw === "string"){
    try{
      const parsed = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [];
    }catch(_){
      values = [];
    }
  }
  if(!Array.isArray(values)) return [];
  const out = [];
  const seen = new Set();
  for(const item of values){
    if(!item || typeof item !== "object") continue;
    const targetType = String(item.targetType || item.target_type || "").trim().toLowerCase();
    const level = normalizeFeeScopeLevelValue(item.level || item.scopeLevel || item.scope_level || "");
    const className = targetType === "class"
      ? normalizeFeeName(item.className || item.class_label || item.class || "")
      : "";
    const amount = Number(item.amount ?? item.defaultAmount ?? item.value ?? NaN);
    if((targetType !== "level" && targetType !== "class") || !level) continue;
    if(targetType === "class" && !className) continue;
    if(!Number.isFinite(amount) || amount < 0) continue;
    const key = `${targetType}|${level}|${normalizeTextAscii(className)}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push({
      targetType,
      level,
      className: className || null,
      amount
    });
  }
  return out;
}

function feePricingRuleLabelFr(ruleLike){
  const targetType = String(ruleLike?.targetType || "").trim().toLowerCase();
  const level = normalizeFeeScopeLevelValue(ruleLike?.level || "");
  const levelLabel = feeScopeLabelFr({ scopeLevel: level, scopeClasses: [] }) || "Niveau";
  if(targetType === "class"){
    const className = normalizeFeeName(ruleLike?.className || "");
    return className ? `${levelLabel} - ${className}` : levelLabel;
  }
  return levelLabel;
}

function formatFeeAmountForSettings(amount, currency){
  const numeric = Number(amount || 0);
  if(String(currency || "USD").toUpperCase() === "CDF"){
    return `${formatIntSpaced(Math.round(numeric))} CDF`;
  }
  return formatUSD(numeric);
}

function feeTypeHasVariablePricing(feeTypeLike){
  return normalizeFeePricingRules(feeTypeLike?.pricingRules || feeTypeLike?.pricing_rules || []).length > 0;
}

function getApplicableFeePricingRule(feeTypeLike, student){
  if(!student) return null;
  const rules = normalizeFeePricingRules(feeTypeLike?.pricingRules || feeTypeLike?.pricing_rules || []);
  if(!rules.length) return null;
  const levelRaw = normalizeApiLevelValue(student?.level || "");
  const level = String(levelRaw || student?.level || "").toLowerCase();
  const className = String(student?.className || "");
  const classRule = rules.find((rule) =>
    rule.targetType === "class"
    && rule.level === level
    && classMatchesFeeScopeClass(className, rule.className || "")
  );
  if(classRule) return classRule;
  return rules.find((rule) => rule.targetType === "level" && rule.level === level) || null;
}

function getFeeBaseAmountForStudent(feeTypeLike, student, fallbackAmount = 0){
  const rule = getApplicableFeePricingRule(feeTypeLike, student);
  const raw = rule ? rule.amount : Number(feeTypeLike?.defaultAmount ?? fallbackAmount ?? 0);
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

function feePricingRulesSummaryFr(feeTypeLike, { maxItems = 2 } = {}){
  const rules = normalizeFeePricingRules(feeTypeLike?.pricingRules || feeTypeLike?.pricing_rules || []);
  if(!rules.length) return "";
  const currency = String(feeTypeLike?.defaultCurrency || feeTypeLike?.default_currency || "USD").toUpperCase();
  const items = rules.slice(0, Math.max(1, Number(maxItems || 0))).map((rule) =>
    `${feePricingRuleLabelFr(rule)}: ${formatFeeAmountForSettings(rule.amount, currency)}`
  );
  if(rules.length > items.length){
    items.push(`+${rules.length - items.length} autre(s)`);
  }
  return items.join(" | " );
}
function classMatchesFeeScopeClass(studentClassName, scopeClassName){
  const studentKey = normalizeTextAscii(studentClassName).replace(/\s+/g, " ");
  const scopeKey = normalizeTextAscii(scopeClassName).replace(/\s+/g, " ");
  if(!studentKey || !scopeKey) return false;
  if(studentKey === scopeKey) return true;
  return studentKey.startsWith(`${scopeKey} `);
}

function feeScopeLabelFr(feeTypeLike){
  const levels = normalizeFeeScopeLevels(
    feeTypeLike?.scopeLevels || feeTypeLike?.scope_levels || [],
    feeTypeLike?.scopeLevel || feeTypeLike?.scope_level || ""
  );
  const classes = normalizeFeeScopeClassList(feeTypeLike?.scopeClasses || feeTypeLike?.scope_classes || []);
  const levelLabels = levels.map((level) => level === "maternelle"
    ? "Maternelle"
    : (level === "primaire" ? "Primaire" : "Secondaire"));
  if(!levelLabels.length && !classes.length) return "Tous";
  if(levelLabels.length && classes.length) return `${levelLabels.join(", ")} \u2022 ${classes.join(", ")}`;
  if(levelLabels.length) return levelLabels.join(", ");
  return classes.join(", ");
}

function isTuitionFeeValue(v){
  const raw = String(v || "").trim();
  const name = normalizeFeeName(raw);
  const asciiName = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return raw.toUpperCase() === "TUITION"
    || name === "Minerval"
    || name === "Frais de scolarité"
    || name === "Frais de scolaire"
    || name === "Frais scolaire"
    || asciiName === "minerval"
    || /frais\s*(de\s*)?scola/.test(asciiName);
}

function isTuitionPaymentRecord(p){
  const code = String(p?.feeTypeCode || p?.fee_type_code || "").trim().toUpperCase();
  if(code === "TUITION") return true;
  const byId = findFeeTypeById(p?.feeTypeId ?? p?.fee_type_id ?? null);
  if(String(byId?.code || "").toUpperCase() === "TUITION") return true;
  return isTuitionFeeValue(p?.feeType || p?.feeTypeLabel || "");
}

function isSelectedTuitionFee(){
  const meta = getSelectedFeeTypeMeta?.();
  return String(meta?.code || "").toUpperCase() === "TUITION" || isTuitionFeeValue(elFee?.value);
}

function normalizeTextAscii(value){
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function stripStatePaidSpendingPrefix(value){
  const raw = String(value || "").trim();
  return normalizeTextAscii(raw).startsWith(normalizeTextAscii(STATE_PAID_SPENDING_PREFIX))
    ? raw.slice(STATE_PAID_SPENDING_PREFIX.length).trim()
    : raw;
}
function isStatePaidSpending(spendingLike){
  return normalizeTextAscii(spendingLike?.category || "").startsWith(normalizeTextAscii(STATE_PAID_SPENDING_PREFIX));
}
function statePaidCaisseSpendingCategoryLabel(boxLike){
  return `${STATE_PAID_SPENDING_PREFIX}${caisseSpendingCategoryLabel(boxLike)}`;
}

function getSecondaryFeeFlags(student){
  const levelRaw = normalizeApiLevelValue(student?.level || "");
  const level = String(levelRaw || student?.level || "").toLowerCase();
  const cls = normalizeTextAscii(student?.className);
  const isSecondary = level === "secondaire";
  const is7e = /^7e\b/.test(cls);
  const is8e = /^8e\b/.test(cls);
  const is4e = /^4e\b/.test(cls);
  const is7e8e = isSecondary && (is7e || is8e);
  const is4eAll = isSecondary && is4e;
  const isH1to4 = isSecondary && /^([1-4](?:e|re|er|ere))\s*h\b/.test(cls);
  const isGeneral = isH1to4 && /pedagogie|scientifique|litteraire|general/.test(cls);
  const isTechnique = isH1to4 && /comm|electronique|mec|electricite|coupe|technique/.test(cls);
  return { isSecondary, is8e, is7e8e, is4eAll, isGeneral, isTechnique };
}

function isFeeTypeApplicableForStudent(feeTypeLike, student){
  if(!student) return true;
  const code = String(feeTypeLike?.code || feeTypeLike?.feeTypeCode || "").toUpperCase();
  if(!code) return true;
  const levelRaw = normalizeApiLevelValue(student?.level || "");
  const level = String(levelRaw || student?.level || "").toLowerCase();
  const scopeLevels = normalizeFeeScopeLevels(
    feeTypeLike?.scopeLevels || feeTypeLike?.scope_levels || [],
    feeTypeLike?.scopeLevel || feeTypeLike?.scope_level || ""
  );
  if(scopeLevels.length && !scopeLevels.includes(level)) return false;
  const scopeClasses = normalizeFeeScopeClassList(feeTypeLike?.scopeClasses || feeTypeLike?.scope_classes || []);
  if(scopeClasses.length){
    const className = String(student?.className || "");
    const matchesScopeClass = scopeClasses.some((scopeClass) => classMatchesFeeScopeClass(className, scopeClass));
    if(!matchesScopeClass) return false;
  }
  const isPm = level === "maternelle" || level === "primaire";
  const sec = getSecondaryFeeFlags(student);
  if(code === "TUITION" || code === "BUS" || code === "ETAT_MINERVAL") return true;
  if(["ETAT_T1_PM", "ETAT_T2_PM", "ETAT_T3_PM"].includes(code)) return isPm;
  if(["ETAT_T1_78", "ETAT_T2_78", "ETAT_T3_78"].includes(code)) return sec.is7e8e;
  if(["TENASOSP_8E", "ENROLEMENT_8E"].includes(code)) return sec.is8e;
  if(["ETAT_T1_SEC_GENERAL", "ETAT_T2_SEC_GENERAL", "ETAT_T3_SEC_GENERAL"].includes(code)) return sec.isGeneral;
  if(["ETAT_T1_SEC_TECH", "ETAT_T2_SEC_TECH", "ETAT_T3_SEC_TECH", "ETAT_FRAIS_TECHNIQUE"].includes(code)) return sec.isTechnique;
  if(["EXAMEN_ETAT_4E", "ENROLEMENT_4E"].includes(code)) return sec.is4eAll;
  return true;
}

function getFeeConfig(){
  if(Array.isArray(feeTypesApiCache) && feeTypesApiCache.length){
    const cfg = {};
    for(const ft of feeTypesApiCache){
      cfg[normalizeFeeName(ft.labelFr)] = Number(ft.defaultAmount || 0);
    }
    return cfg;
  }
  const raw = localStorage.getItem(KEY_FEE_CONFIG);
  try{
    const parsed = raw ? JSON.parse(raw) : null;
    if(parsed && typeof parsed === "object"){
      return { ...DEFAULT_FEE_CONFIG, ...parsed };
    }
  }catch(_){}
  return { ...DEFAULT_FEE_CONFIG };
}

function saveFeeConfig(config){
  localStorage.setItem(KEY_FEE_CONFIG, JSON.stringify(config || {}));
}

function getFeeTypeObjects(){
  if(Array.isArray(feeTypesApiCache) && feeTypesApiCache.length){
    return feeTypesApiCache
      .filter(ft => ft && ft.active !== false)
      .slice()
      .sort((a,b) => String(a.labelFr || "").localeCompare(String(b.labelFr || ""), "fr"));
  }
  return DEFAULT_FEE_TYPES_API_FALLBACK.slice();
}

function findFeeTypeById(feeTypeId){
  const idStr = String(feeTypeId ?? "").trim();
  if(!idStr) return null;
  return getFeeTypeObjects().find(ft => String(ft?.id ?? "") === idStr) || null;
}

function findFeeTypeByCode(feeTypeCode){
  const code = String(feeTypeCode || "").trim().toUpperCase();
  if(!code) return null;
  return getFeeTypeObjects().find(ft => String(ft?.code || "").toUpperCase() === code) || null;
}

function findFeeTypeByLabel(label){
  const name = normalizeFeeName(label);
  return getFeeTypeObjects().find(ft => normalizeFeeName(ft.labelFr) === name) || null;
}

function getLiveFeeLabel(recordLike){
  const feeTypeId = recordLike?.feeTypeId ?? recordLike?.fee_type_id ?? null;
  const feeTypeCode = recordLike?.feeTypeCode ?? recordLike?.fee_type_code ?? "";
  const byId = findFeeTypeById(feeTypeId);
  if(byId?.labelFr) return normalizeFeeName(byId.labelFr);
  const byCode = findFeeTypeByCode(feeTypeCode);
  if(byCode?.labelFr) return normalizeFeeName(byCode.labelFr);
  return normalizeFeeName(recordLike?.feeType || recordLike?.feeTypeLabel || "—");
}

function refreshCachedFeeTypeLabels(){
  if(Array.isArray(receiptsApiCache)){
    setReceiptsApiCache(receiptsApiCache.map((p) => ({ ...p, feeType: getLiveFeeLabel(p) })));
  }
  if(studentProfileState && Array.isArray(studentProfileState.payments)){
    studentProfileState.payments = studentProfileState.payments.map((p) => ({ ...p, feeType: getLiveFeeLabel(p) }));
  }
  try{
    const local = getPayments();
    if(Array.isArray(local) && local.length){
      const next = local.map((p) => ({ ...p, feeType: getLiveFeeLabel(p) }));
      savePayments(next);
    }
  }catch(_){}
}

function getFeeTypes(){
  return getFeeTypeObjects().map(ft => normalizeFeeName(ft.labelFr));
}

function getTuitionFeeDisplayLabel(){
  const tuition = findFeeTypeByCode("TUITION");
  return normalizeFeeName(tuition?.labelFr || "Minerval");
}

function getFeePriceUSD(feeType, student){
  const type = normalizeFeeName(feeType);
  if(isTuitionFeeValue(type)){
    return Number(expectedForStudent(student || {}, "level-fee") || 0);
  }
  const ft = (feeType && typeof feeType === "object")
    ? (findFeeTypeById(feeType.id) || findFeeTypeByCode(feeType.code) || findFeeTypeByLabel(feeType.labelFr || feeType.name || "") || feeType)
    : (findFeeTypeByLabel(type) || findFeeTypeByCode(type));
  const p = getFeeBaseAmountForStudent(ft || {}, student, getFeeConfig()[type] ?? 0);
  return Number.isFinite(p) ? p : 0;
}

function getFeeDefaultCurrency(feeType){
  const ft = findFeeTypeByLabel(feeType);
  return String(ft?.defaultCurrency || "USD").toUpperCase();
}

function renderFeeTypeOptions(selectFee, student = null){
  if(!selectFee) return;
  const keep = normalizeFeeName(selectFee.value);
  const allTypes = getFeeTypeObjects();
  const filtered = student
    ? allTypes.filter((t) => isFeeTypeApplicableForStudent(t, student))
    : allTypes;
  const types = filtered.length ? filtered : allTypes;
  selectFee.innerHTML = types.map((t) => {
    const label = normalizeFeeName(t.labelFr);
    return `<option value="${esc(label)}" data-fee-type-id="${esc(String(t.id))}" data-fee-code="${esc(t.code)}" data-fee-currency="${esc(t.defaultCurrency)}" data-fee-cycle="${esc(normalizeFeeBillingCycle(t.billingCycle))}" data-fee-fixed-price="${t.hasFixedPrice === false ? "0" : "1"}" data-fee-amount="${esc(String(Number(t.defaultAmount || 0)))}">${esc(label)}</option>`;
  }).join("");
  const labels = types.map(t => normalizeFeeName(t.labelFr));
  if(keep && labels.includes(keep)) {
    selectFee.value = keep;
  } else {
    const tuitionOpt = types.find(t => String(t.code || "").toUpperCase() === "TUITION")
      || types.find(t => isTuitionFeeValue(t.labelFr));
    if(tuitionOpt) selectFee.value = normalizeFeeName(tuitionOpt.labelFr);
  }
}

function renderFeeSettingsTable(){
  if(!setFeePriceTbody) return;
  const rows = getFeeTypeObjects();
  if(!rows.length){
    setFeePriceTbody.innerHTML = `<tr><td colspan="9" class="tiny">Aucun type de frais.</td></tr>`;
    syncBusPriceSettingsUi();
    return;
  }
  setFeePriceTbody.innerHTML = rows.map((ft) => {
    const name = normalizeFeeName(ft.labelFr);
    const price = Number(ft.defaultAmount || 0);
    const currency = String(ft.defaultCurrency || "USD");
    const cycle = normalizeFeeBillingCycle(ft.billingCycle);
    const scopeLabel = feeScopeLabelFr(ft);
    const pricingRules = normalizeFeePricingRules(ft.pricingRules || []);
    const hasVariablePricing = pricingRules.length > 0;
    const hasFixedPrice = ft.hasFixedPrice !== false;
    const pricingSummary = feePricingRulesSummaryFr(ft, { maxItems: 2 });
    const deleteCheck = canDeleteFeeType(ft);
    const deleteDisabled = deleteCheck.ok ? "" : "disabled";
    const deleteTitle = deleteCheck.ok
      ? "Supprimer ce type de frais"
      : (deleteCheck.reason || "Suppression non autorisee");
    const quickEditTitle = hasVariablePricing || !hasFixedPrice
      ? (hasVariablePricing ? "Utilisez Editer pour gerer les prix par niveau ou classe." : "Prix saisi librement au paiement.")
      : "Enregistrer ce prix par defaut";
    return `
    <tr>
      <td>
        <strong>${esc(name)}</strong>
        ${ft.skipAutoPrint ? `<div class="tiny" style="margin-top:4px">Impression auto: ignorée</div>` : ""}
        ${hasVariablePricing ? `<div class="tiny" style="margin-top:4px">${esc(pricingSummary || `${pricingRules.length} regle(s) variable(s)`)}</div>` : ""}
      </td>
      <td><code>${esc(ft.code || "")}</code></td>
      <td>${esc(currency)}</td>
      <td>
        <select class="input" data-fee-cycle-input="${esc(String(ft.id))}">
          <option value="monthly" ${cycle === "monthly" ? "selected" : ""}>Mensuel</option>
          <option value="annual" ${cycle === "annual" ? "selected" : ""}>Annuel</option>
          <option value="item" ${cycle === "item" ? "selected" : ""}>Article vendu</option>
        </select>
      </td>
      <td>${cycle === "annual" ? esc(feeDueMonthLabelFr(ft.dueMonth)) : "—"}</td>
      <td>${esc(scopeLabel)}</td>
      <td>
        ${!hasFixedPrice
          ? `<div><strong>Prix libre</strong></div><div class="tiny" style="margin-top:4px">Saisi au paiement</div>`
          : hasVariablePricing
          ? `<div><strong>Variable</strong></div><div class="tiny" style="margin-top:4px">${esc(formatFeeAmountForSettings(price, currency))} par defaut</div>`
          : formatFeeAmountForSettings(price, currency)}
      </td>
      <td><input class="input" data-fee-price-input="${esc(String(ft.id))}" inputmode="numeric" placeholder="${hasVariablePricing || !hasFixedPrice ? "Utiliser Editer" : "Ex: 25"}" ${hasVariablePricing || !hasFixedPrice ? "disabled" : ""} /></td>
      <td class="row-actions">
        <button class="btn primary" type="button" data-fee-price-save="${esc(name)}" data-fee-type-id="${esc(String(ft.id))}" ${hasVariablePricing || !hasFixedPrice ? "disabled" : ""} title="${esc(quickEditTitle)}">Enregistrer</button>
        <button class="btn" type="button" data-fee-type-edit="${esc(String(ft.id))}" ${canManageFeeTypes() ? "" : "disabled"}>Editer</button>
        <button class="btn danger" type="button" data-fee-type-delete-id="${esc(String(ft.id))}" data-fee-type-delete="${esc(name)}" data-fee-type-code="${esc(String(ft.code || ""))}" ${deleteDisabled} title="${esc(deleteTitle)}">Supprimer</button>
      </td>
    </tr>
  `;
  }).join("");
  syncBusPriceSettingsUi();
}

function getBusFeeTypeMeta(){
  if(Array.isArray(feeTypesApiCache) && feeTypesApiCache.length){
    const row = feeTypesApiCache.find((ft) => String(ft?.code || "").toUpperCase() === "BUS");
    if(row) return row;
  }
  return findFeeTypeByCode("BUS");
}

function syncBusPriceSettingsUi(statusMessage = ""){
  if(!setBusPrice) return;
  const busFee = getBusFeeTypeMeta();
  const canManage = canManageFeeTypes();
  const amount = Number(busFee?.defaultAmount ?? 0);
  setBusPrice.value = Number.isFinite(amount) ? String(Math.round(amount)) : "";
  setBusPrice.disabled = !canManage;
  if(setBusPriceSaveBtn) setBusPriceSaveBtn.disabled = !canManage;
  if(setBusPriceStatus){
    if(statusMessage){
      setBusPriceStatus.textContent = statusMessage;
    }else if(!canManage){
      setBusPriceStatus.textContent = "Modification réservée à admin / caissier / comptable.";
    }else if(busFee){
      setBusPriceStatus.textContent = `Tarif Bus actuel: ${formatUSD(Number(busFee.defaultAmount || 0))} / mois.`;
    }else{
      setBusPriceStatus.textContent = "Le type de frais BUS n'existe pas encore. Enregistrez pour le créer.";
    }
  }
}

async function saveBusPriceSetting(){
  if(!canManageFeeTypes()){
    syncBusPriceSettingsUi("Modification réservée à admin / caissier / comptable.");
    return;
  }
  const price = Number(onlyDigits(String(setBusPrice?.value || "")));
  if(!Number.isFinite(price) || price < 0){
    syncBusPriceSettingsUi("Prix Bus invalide (nombre >= 0).");
    return;
  }
  try{
    syncBusPriceSettingsUi("Enregistrement du tarif Bus...");
    const current = getBusFeeTypeMeta();
    if(current && current.id != null){
      await apiFetch(`/api/fee-types/${encodeURIComponent(String(current.id))}`, {
        method: "PUT",
        body: JSON.stringify({
          code: "BUS",
          labelFr: normalizeFeeName(current.labelFr || "Bus"),
          defaultCurrency: "USD",
          defaultAmount: price,
          billingCycle: "monthly",
          active: true
        })
      });
    }else{
      await addFeeTypeApi("Bus", price, "USD", "monthly");
    }
    await loadFeeTypesFromApi(true);
    reportsSummaryApiCache.clear();
    busReportApiCache.clear();
    lateStudentsReportApiCache.clear();
    refreshStudentsFinancialState();
    if(selectedStudentId) selectStudent(selectedStudentId);
    renderDashboard();
    renderTopDailyBalance();
    if(viewCaisse.classList.contains("active")) renderCaisse();
    renderReports();
    if(setFeeStatus) setFeeStatus.textContent = `Tarif Bus mis à jour: ${formatUSD(price)} / mois`;
    syncBusPriceSettingsUi(`Tarif Bus enregistré: ${formatUSD(price)} / mois`);
  }catch(err){
    syncBusPriceSettingsUi(`Erreur tarif Bus: ${err.message}`);
  }
}

function validateClassByLevel(level, className){
  const lvl = String(level || "").toLowerCase();
  const cls = String(className || "").trim();
  if(!cls) return "Classe requise.";
  if(lvl === "secondaire"){
    if(!/^\d+(e|re)\s+H\s*-\s*.+$/i.test(cls) && !/^\d+e\s+EB\s*-\s*.+$/i.test(cls)){
      return "Format secondaire invalide. Exemple: 3e H - Électronique";
    }
    return "";
  }
  if(!/^\d+e$/i.test(cls)){
    return "Pour maternelle/primaire, utiliser un format comme: 1e, 2e, 3e...";
  }
  return "";
}

// Reports should ignore malformed classes (e.g. "1", "3") so totals/grouping stay clean.
// This is a display/report filter only; it does not delete students from the database.
function isValidClassForReports(levelValue, className){
  const lvl = fmtReportLevelLabel(levelValue || "");
  const raw = String(className || "").trim();
  if(!raw || raw === "—") return false;
  if(lvl === "Maternelle" || lvl === "Primaire"){
    const m = raw.match(/^(.*)\s([A-Z])$/i);
    const baseClass = (m ? m[1] : raw).trim();
    return !validateClassByLevel(lvl, baseClass);
  }
  if(lvl === "Secondaire"){
    const { base } = splitClassBaseAndCodeForStudents("secondaire", raw);
    return !validateClassByLevel("Secondaire", base || raw);
  }
  return false;
}

function renderClassSettingsTable(){
  if(!setClassTbody) return;
  const levels = [
    { key: "maternelle", label: "Maternelle" },
    { key: "primaire", label: "Primaire" },
    { key: "secondaire", label: "Secondaire" }
  ];
  let html = "";
  for(const lvl of levels){
    const items = (CLASS_BY_LEVEL[lvl.key] || []).slice().sort((a,b)=>a.localeCompare(b, "fr"));
    if(!items.length){
      html += `<tr><td>${lvl.label}</td><td class="tiny">Aucune classe</td><td>—</td></tr>`;
      continue;
    }
    html += items.map((cls) => `
      <tr>
        <td>${lvl.label}</td>
        <td>${esc(cls)}</td>
        <td><button class="btn danger" type="button" data-class-remove-level="${lvl.key}" data-class-remove-name="${esc(cls)}">Supprimer</button></td>
      </tr>
    `).join("");
  }
  setClassTbody.innerHTML = html;
}

function addClassSetting(levelRaw, classNameRaw){
  const level = String(levelRaw || "").toLowerCase();
  const rawClassName = String(classNameRaw || "").trim();
  const normalizedParts = splitClassBaseAndCodeForStudents(level, rawClassName);
  const className = String(normalizedParts.base || rawClassName).trim();
  if(!["maternelle","primaire","secondaire"].includes(level)){
    if(setClassStatus) setClassStatus.textContent = "Niveau invalide.";
    return false;
  }
  const err = validateClassByLevel(level, className);
  if(err){
    if(setClassStatus) setClassStatus.textContent = err;
    return false;
  }
  const list = CLASS_BY_LEVEL[level] || [];
  if(list.includes(className)){
    if(setClassStatus) setClassStatus.textContent = "Cette classe existe déjà.";
    return false;
  }
  CLASS_BY_LEVEL[level] = [...list, className];
  saveClassConfig(CLASS_BY_LEVEL);
  renderClassSettingsTable();
  if(setClassStatus) setClassStatus.textContent = `Classe ajoutée: ${className}`;
  return true;
}

function removeClassSetting(levelRaw, classNameRaw){
  const level = String(levelRaw || "").toLowerCase();
  const className = String(classNameRaw || "").trim();
  const list = CLASS_BY_LEVEL[level] || [];
  CLASS_BY_LEVEL[level] = list.filter(v => v !== className);
  saveClassConfig(CLASS_BY_LEVEL);
  renderClassSettingsTable();
  if(setClassStatus) setClassStatus.textContent = `Classe supprimée: ${className}`;
}

function addFeeType(nameRaw, priceRaw){
  const name = normalizeFeeName(nameRaw);
  const price = Number(String(priceRaw || "").replace(",", "."));
  if(!name){
    showInAppPopup("Nom du type de frais requis.");
    return false;
  }
  if(!Number.isFinite(price) || price < 0){
    showInAppPopup("Prix invalide.");
    return false;
  }
  const cfg = getFeeConfig();
  cfg[name] = price;
  saveFeeConfig(cfg);
  renderFeeTypeOptions(elFee, getStudentById(selectedStudentId));
  renderFeeSettingsTable();
  if(setFeeStatus) setFeeStatus.textContent = `Type ajouté/mis à jour: ${name} (${formatUSD(price)})`;
  return true;
}

async function addFeeTypeApi(labelFr, defaultAmount, defaultCurrency, billingCycle, options = {}){
  if(!canManageFeeTypes()){
    throw new Error("Seuls admin, caissier ou comptable peuvent gerer les types de frais.");
  }
  const code = String(labelFr || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    || "FEE";
  const scopeLevels = normalizeFeeScopeLevels(options?.scopeLevels || [], options?.scopeLevel || "");
  const scopeLevel = scopeLevels[0] || null;
  const scopeClasses = normalizeFeeScopeClassList(options?.scopeClasses || []);
  const pricingRules = normalizeFeePricingRules(options?.pricingRules || []);
  const dueMonth = normalizeFeeDueMonthValue(options?.dueMonth || "") || null;
  const hasFixedPrice = options?.hasFixedPrice !== false;
  const skipAutoPrint = Boolean(options?.skipAutoPrint || options?.skip_auto_print);
  const row = await apiFetch("/api/fee-types", {
    method: "POST",
    body: JSON.stringify({
      code,
      labelFr,
      defaultAmount,
      defaultCurrency,
      billingCycle: normalizeFeeBillingCycle(billingCycle),
      dueMonth,
      hasFixedPrice,
      scopeLevel,
      scopeLevels,
      scopeClasses,
      pricingRules,
      skipAutoPrint
    })
  });
  await loadFeeTypesFromApi(true);
  return row;
}

function getFirstPendingSchoolMonth(student){
  for(const month of SCHOOL_MONTH_LABELS_FR){
    const remaining = getStudentRemainingForMonthUSD(student, month);
    if(remaining > 0) return month;
  }
  return "";
}

function canManageFeeTypes(){
  return hasRole("admin","caissier","comptable");
}

function getProtectedFeeTypeCodes(){
  return new Set(
    DEFAULT_FEE_TYPES_API_FALLBACK
      .map((ft) => String(ft?.code || "").trim().toUpperCase())
      .filter(Boolean)
  );
}

function resolveFeeTypeForDelete(feeLike){
  if(feeLike && typeof feeLike === "object"){
    if(feeLike.id != null){
      const byId = findFeeTypeById(feeLike.id);
      if(byId) return byId;
    }
    if(String(feeLike.code || "").trim()){
      const byCode = findFeeTypeByCode(feeLike.code);
      if(byCode) return byCode;
    }
    const byLabel = findFeeTypeByLabel(feeLike.labelFr || feeLike.name || "");
    if(byLabel) return byLabel;
    return feeLike;
  }
  return findFeeTypeByLabel(feeLike || "");
}

function canDeleteFeeType(feeLike){
  if(!hasRole("admin")) return { ok: false, reason: "Suppression reservee a admin." };
  const feeObj = resolveFeeTypeForDelete(feeLike);
  const feeName = normalizeFeeName(feeObj?.labelFr || feeObj?.name || feeLike || "");
  if(!feeObj || !feeName) return { ok: false, reason: "Type de frais invalide." };
  const code = String(feeObj?.code || "").trim().toUpperCase();
  if(getProtectedFeeTypeCodes().has(code) || isTuitionFeeValue(feeName)){
    return { ok: false, reason: "Type syst\u00e8me prot\u00e9g\u00e9. Suppression non autoris\u00e9e." };
  }
  // Un frais d\u00e9j\u00e0 utilis\u00e9 sera archiv\u00e9 (d\u00e9sactiv\u00e9) plut\u00f4t que supprim\u00e9 d\u00e9finitivement \u2014 voir feeTypeIsUsed().
  const idStr = String(feeObj?.id ?? "").trim();
  const used = getPayments().some((p) => {
    const pid = String(p?.feeTypeId ?? p?.fee_type_id ?? "").trim();
    if(idStr && pid && pid === idStr) return true;
    if(code && paymentFeeCode(p) === code) return true;
    return normalizeFeeName(getLiveFeeLabel(p)) === feeName;
  });
  return { ok: true, fee: feeObj, used };
}

function deleteFeeType(feeLike){
  const feeObj = resolveFeeTypeForDelete(feeLike);
  const feeName = normalizeFeeName(feeObj?.labelFr || feeObj?.name || feeLike || "");
  const check = canDeleteFeeType(feeObj || feeName);
  if(!check.ok){
    showInAppPopup(check.reason || "Suppression non autoris\u00e9e.");
    return false;
  }
  const cfg = getFeeConfig();
  if(!(feeName in cfg)){
    showInAppPopup("Type de frais introuvable.");
    return false;
  }
  delete cfg[feeName];
  saveFeeConfig(cfg);
  renderFeeSettingsTable();
  renderFeeTypeOptions(elFee, getStudentById(selectedStudentId));
  if(normalizeFeeName(elFee?.value) === feeName && elFee){
    renderFeeTypeOptions(elFee, getStudentById(selectedStudentId));
    applyFeeTypeSelectionBehavior();
  }
  if(setFeeStatus) setFeeStatus.textContent = `Type supprim\u00e9: ${feeName}`;
  auditEvent("delete", "fee_type", feeName, { feeType: feeName });
  return true;
}

function renameFeeType(oldNameRaw, newNameRaw){
  const oldName = normalizeFeeName(oldNameRaw);
  const newName = normalizeFeeName(newNameRaw);
  if(!canManageFeeTypes()){
    showInAppPopup("Seul un admin peut renommer un type de frais.");
    return false;
  }
  if(!oldName || !newName){
    showInAppPopup("Nom de type de frais invalide.");
    return false;
  }
  const oldObj = findFeeTypeByLabel(oldName);
  if(String(oldObj?.code || "").toUpperCase() === "TUITION" || isTuitionFeeValue(oldName)){
    showInAppPopup("Minerval est protégé.");
    return false;
  }
  if(isTuitionFeeValue(newName)){
    showInAppPopup("Le nom Minerval est réservé.");
    return false;
  }
  if(oldName === newName){
    if(setFeeStatus) setFeeStatus.textContent = "Aucun changement.";
    return false;
  }

  const cfg = getFeeConfig();
  if(!(oldName in cfg)){
    showInAppPopup("Type de frais introuvable.");
    return false;
  }
  if(newName in cfg){
    showInAppPopup("Un type de frais avec ce nom existe déjà.");
    return false;
  }

  const price = Number(cfg[oldName] || 0);
  delete cfg[oldName];
  cfg[newName] = price;
  saveFeeConfig(cfg);

  // Keep local receipt/payment history labels aligned with the renamed fee type.
  const payments = getPayments();
  let updatedCount = 0;
  const nextPayments = payments.map((p) => {
    if(normalizeFeeName(p?.feeType) !== oldName) return p;
    updatedCount += 1;
    return { ...p, feeType: newName };
  });
  if(updatedCount > 0) savePayments(nextPayments);

  renderFeeSettingsTable();
  renderFeeTypeOptions(elFee, getStudentById(selectedStudentId));
  if(normalizeFeeName(elFee?.value) === oldName && elFee){
    elFee.value = newName;
    applyFeeTypeSelectionBehavior();
  }
  if(setFeeStatus){
    setFeeStatus.textContent = updatedCount > 0
      ? `Type renommé: ${oldName} -> ${newName} (${updatedCount} paiement(s) local(aux) mis à jour)`
      : `Type renommé: ${oldName} -> ${newName}`;
  }
  auditEvent("rename", "fee_type", oldName, { from: oldName, to: newName, localPaymentsUpdated: updatedCount });
  return true;
}

function enforceMonthPriorityForStudent(student, notify = false){
  if(!student || !elMonth) return;
  const sameStudent = String(selectedStudentFeeStatus?.studentId || "") === String(student.id || "");
  const requiredMonth = sameStudent ? monthLabelForActiveSchoolYear(selectedStudentFeeStatus?.nextDueMonth || "") : "";
  const feeMeta = getSelectedFeeTypeMeta();
  const cycle = normalizeFeeBillingCycle(selectedStudentFeeStatus?.feeTypeBillingCycle || feeMeta?.billingCycle || "monthly");
  const annualLocked = cycle === "annual" && Boolean(selectedStudentFeeStatus?.annualPaymentLocked);
  if(annualLocked){
    const lockMonth = monthLabelForActiveSchoolYear(selectedStudentFeeStatus?.annualPaymentLockMonth || "");
    if(lockMonth){
      setSchoolMonthSelectValue(elMonth, lockMonth);
    }
    if(notify){
      const msg = lockMonth
        ? `Ce frais annuel est deja paye pour cette annee scolaire (${lockMonth}).`
        : "Ce frais annuel est deja paye pour cette annee scolaire.";
      showInAppPopup(msg);
    }
    return;
  }
  const shouldLock = Boolean(requiredMonth) && (cycle === "annual" || Number(selectedStudentFeeStatus?.remaining || 0) > 0);
  if(!shouldLock) return;
  if(!requiredMonth) return;
  if(elMonth.value !== requiredMonth){
    setSchoolMonthSelectValue(elMonth, requiredMonth);
    if(notify){
      if(cycle === "annual"){
        showInAppPopup(`Ce type de frais est annuel. Le mois est verrouillé sur: ${requiredMonth}.`);
      } else {
        showInAppPopup(`Ce paiement doit d'abord couvrir le prochain mois disponible: ${requiredMonth}.`);
      }
    }
  }
}

function getStudentEnrollmentMonthKey(student){
  if(!student) return "";
  const effective = String(student.classEffectiveMonth || "").trim();
  if(/^\d{4}-\d{2}$/.test(effective)) return effective;
  const createdIso = toDateISO(student.createdAt || student.created_at || "");
  const createdMonth = monthKeyFromDateISO(createdIso);
  return /^\d{4}-\d{2}$/.test(createdMonth) ? createdMonth : "";
}
function syncMonthSelectAvailability(student){
  if(!elMonth) return;
  const enrollmentMonthKey = getStudentEnrollmentMonthKey(student);
  const sameStudent = String(selectedStudentFeeStatus?.studentId || "") === String(student?.id || "");
  const feeMeta = getSelectedFeeTypeMeta();
  const cycle = normalizeFeeBillingCycle(selectedStudentFeeStatus?.feeTypeBillingCycle || feeMeta?.billingCycle || "monthly");
  const annualLocked = cycle === "annual" && Boolean(selectedStudentFeeStatus?.annualPaymentLocked);
  if(annualLocked){
    const lockMonth = monthLabelForActiveSchoolYear(selectedStudentFeeStatus?.annualPaymentLockMonth || "");
    for(const opt of Array.from(elMonth.options || [])){
      const optionMonthKey = monthKeyFromLabelFR(opt.value || "");
      const beforeEnrollment = Boolean(enrollmentMonthKey && optionMonthKey && optionMonthKey < enrollmentMonthKey);
      opt.disabled = beforeEnrollment || (lockMonth ? opt.value !== lockMonth : true);
    }
    if(lockMonth){
      setSchoolMonthSelectValue(elMonth, lockMonth);
    }
    return;
  }
  const requiredMonth = (student && sameStudent)
    ? monthLabelForActiveSchoolYear(selectedStudentFeeStatus?.nextDueMonth || "")
    : "";
  const lockToRequired = Boolean(requiredMonth) && (cycle === "annual" || Number(selectedStudentFeeStatus?.remaining || 0) > 0);

  for(const opt of Array.from(elMonth.options || [])){
    const optionMonthKey = monthKeyFromLabelFR(opt.value || "");
    const beforeEnrollment = Boolean(enrollmentMonthKey && optionMonthKey && optionMonthKey < enrollmentMonthKey);
    opt.disabled = beforeEnrollment || Boolean(lockToRequired && opt.value !== requiredMonth);
  }
  if(lockToRequired && requiredMonth && elMonth.value !== requiredMonth){
    setSchoolMonthSelectValue(elMonth, requiredMonth);
  } else {
    const selectedOption = Array.from(elMonth.options || []).find((opt) => opt.value === elMonth.value);
    if(!selectedOption || selectedOption.disabled){
      const firstEnabled = Array.from(elMonth.options || []).find((opt) => !opt.disabled);
      if(firstEnabled){
        setSchoolMonthSelectValue(elMonth, firstEnabled.value);
      } else if(elMonth.options?.length){
        setSchoolMonthSelectValue(elMonth, elMonth.options[0].value);
      }
    }
  }
}

function applyFeeTypeSelectionBehavior(){
  const s = getStudentById(selectedStudentId);
  if(!s) return;
  const type = normalizeFeeName(elFee.value);
  const defaultCur = getFeeDefaultCurrency(type);
  if(elCurrency && defaultCur && ["USD","CDF"].includes(defaultCur)){
    elCurrency.value = defaultCur;
  }
  syncMonthSelectAvailability(s);

  const selMeta = (typeof getSelectedFeeTypeMeta === "function" ? getSelectedFeeTypeMeta() : null) || findFeeTypeByLabel(type);
  const isItemFee = normalizeFeeBillingCycle(selMeta?.billingCycle) === "item";
  const hasFixedPrice = selMeta?.hasFixedPrice !== false;
  if(isSelectedTuitionFee()){
    enforceMonthPriorityForStudent(s);
    // Always keep amount empty for tuition to allow manual partial payment entry.
    elAmount.value = "";
  } else if(!hasFixedPrice){
    // Prix libre : le caissier saisit le montant pour chaque paiement.
    elAmount.value = "";
  } else if(isItemFee){
    // Article vendu : prix fixe pré-rempli automatiquement (dans sa devise), modifiable.
    if(elCurrency && selMeta?.defaultCurrency && ["USD","CDF"].includes(String(selMeta.defaultCurrency).toUpperCase())){
      elCurrency.value = String(selMeta.defaultCurrency).toUpperCase();
    }
    const opt = elFee?.options?.[elFee.selectedIndex] || null;
    const optionAmount = Number(opt?.getAttribute?.("data-fee-amount") || 0);
    const metaAmount = Number(selMeta?.defaultAmount || 0);
    const fixed = Math.max(
      Number(getFeePriceUSD(selMeta || type, s) || 0),
      Number.isFinite(optionAmount) ? optionAmount : 0,
      Number.isFinite(metaAmount) ? metaAmount : 0
    );
    elAmount.value = fixed > 0 ? formatIntSpaced(Math.round(fixed)) : "";
  } else {
    const fixed = getFeePriceUSD(type, s);
    if(!onlyDigits(elAmount.value) || Number(onlyDigits(elAmount.value)) <= 0){
      elAmount.value = fixed > 0 ? formatIntSpaced(Math.round(fixed)) : "";
    }
  }
  validateForm();
}

function formatClassLevel(className, level){
  const cls = String(className || "—");
  const lvl = String(level || "").trim();
  if(!lvl || lvl === "Secondaire") return cls;
  return `${cls} • ${lvl}`;
}

function defaultDueForLevelClass(levelValue, className){
  const lvl = String(levelValue || "").toLowerCase();
  const cls = String(className || "").trim();
  if(lvl === "maternelle") return LEVEL_FEE_USD["Maternelle"] || 0;
  if(lvl === "primaire") return LEVEL_FEE_USD["Primaire"] || 0;
  if(lvl === "secondaire"){
    if(/^4e H\b/i.test(cls)) return LEVEL_FEE_USD["Secondaire4eH"] || 0;
    return LEVEL_FEE_USD["Secondaire"] || 0;
  }
  return 0;
}

function toggleClassCodeName(className){
  const c = String(className || "").trim();
  if(/ A$/i.test(c)) return c.replace(/ A$/i, " B");
  if(/ B$/i.test(c)) return c.replace(/ B$/i, " A");
  return "";
}

function canToggleClassCode(levelValue, className){
  const lvl = String(levelValue || "").toLowerCase();
  if(!(lvl === "maternelle" || lvl === "primaire")) return false;
  return / [AB]$/i.test(String(className || "").trim());
}

function formatIntSpaced(n){
  const num = Math.round(Number(n || 0));
  return num.toLocaleString("en-US");
}

function formatMoney(amount, cur){
  const val = Number(amount || 0);
  if(cur === "USD") return `$${formatIntSpaced(val)}`;
  return `${formatIntSpaced(val)} CDF`;
}

function formatUSD(amount){
  const val = Number(amount || 0);
  if(!Number.isFinite(val)) return "$0";
  const rounded = Math.round(val);
  if(Math.abs(val - rounded) < 0.005){
    return `$${formatIntSpaced(rounded)}`;
  }
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatUsdCdfCombined(usdAmount, cdfAmount){
  const usd = Number(usdAmount || 0);
  const cdf = Number(cdfAmount || 0);
  return `${formatUSD(usd)} + ${formatIntSpaced(Math.round(cdf))} CDF`;
}
function normalizeCurrencyCode(currency){
  const cur = String(currency || "USD").toUpperCase().trim();
  if(cur.includes("CDF") || cur.includes("FC")) return "CDF";
  return "USD";
}
function splitAmountByCurrency(amount, currency){
  const value = Number(amount || 0);
  const cur = normalizeCurrencyCode(currency);
  return cur === "CDF" ? { usd: 0, cdf: value } : { usd: value, cdf: 0 };
}
function paymentAmountSplit(p){
  if(p == null) return { usd: 0, cdf: 0 };
  if(p.amountUSDReceived != null || p.amountCDFReceived != null){
    return {
      usd: Math.max(0, Number(p.amountUSDReceived || 0)),
      cdf: Math.max(0, Number(p.amountCDFReceived || 0))
    };
  }
  return splitAmountByCurrency(p.amountEntered ?? p.amount ?? 0, p.currency || "USD");
}
function isCashPaymentRecord(payment){
  return String(payment?.paymentMethod || "").trim().toLowerCase() !== "staff_benefit";
}
function spendingAmountSplit(s){
  if(s == null) return { usd: 0, cdf: 0 };
  return splitAmountByCurrency(s.amount || 0, s.currency || "USD");
}
function formatMonthlyDueUSD(amount){
  const value = Number(amount || 0);
  if(value <= 0) return "CAS SOCIAL";
  return formatUSD(value);
}

function computeFx(amount, cur){
  const a = Number(amount || 0);
  if(cur === "USD"){
    return { usd: a, cdf: Math.round(a * USD_TO_CDF) };
  }
  return { usd: +(a / USD_TO_CDF).toFixed(2), cdf: a };
}
function toUSDAtRate(amount, currency, rate){
  const a = Number(amount || 0);
  const cur = String(currency || "USD").toUpperCase();
  const fx = Number(rate || USD_TO_CDF);
  const safeFx = Number.isFinite(fx) && fx > 0 ? fx : USD_TO_CDF;
  if(cur === "USD") return a;
  return +(a / safeFx).toFixed(2);
}
function paymentUsdStored(p){
  if(p == null) return 0;
  if(p.amountUSD != null && Number.isFinite(Number(p.amountUSD))) return Number(p.amountUSD);
  return Number(toUSDAtRate(p.amountEntered ?? p.amount ?? 0, p.currency || "USD", p.rateUsed || p.fxRate || USD_TO_CDF) || 0);
}
function spendingUsdStored(s){
  if(s == null) return 0;
  return Number(toUSDAtRate(s.amount || 0, s.currency || "USD", s.fxRate || USD_TO_CDF) || 0);
}
function monthRatesUsed(monthLabel){
  const targetMonthKey = monthKeyFromLabelFR(monthLabel || "");
  const rates = new Set();
  for(const p of getPayments()){
    if(String(paymentMonthKey(p) || "") !== String(targetMonthKey || "")) continue;
    const r = Number(p.rateUsed || p.fxRate || 0);
    if(Number.isFinite(r) && r > 0) rates.add(Math.round(r));
  }
  for(const s of getSchoolYearScopedSpendings()){
    if(!targetMonthKey || spendingTargetMonthKey(s) !== targetMonthKey) continue;
    const r = Number(s.fxRate || 0);
    if(Number.isFinite(r) && r > 0) rates.add(Math.round(r));
  }
  return Array.from(rates).sort((a,b)=>a-b);
}
function getMonthRateHistory(){
  try{
    const raw = localStorage.getItem(KEY_MONTH_RATE_HISTORY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  }catch{
    return {};
  }
}
function saveMonthRateHistory(map){
  localStorage.setItem(KEY_MONTH_RATE_HISTORY, JSON.stringify(map || {}));
}
function monthKeyForRateHistory(monthLabel){
  return monthKeyFromLabelFR(monthLabel);
}
function setMonthRateSnapshot(monthLabel, rate){
  const key = monthKeyForRateHistory(monthLabel);
  const r = Number(rate || 0);
  if(!key || !Number.isFinite(r) || r <= 0) return;
  const map = getMonthRateHistory();
  map[key] = Math.round(r);
  saveMonthRateHistory(map);
}
function getMonthRateSnapshot(monthLabel){
  const key = monthKeyForRateHistory(monthLabel);
  if(!key) return null;
  const map = getMonthRateHistory();
  const r = Number(map[key] || 0);
  return Number.isFinite(r) && r > 0 ? r : null;
}
function monthRateLabel(monthLabel){
  const snap = getMonthRateSnapshot(monthLabel);
  if(snap){
    return `1 USD = ${formatIntSpaced(snap)} CDF`;
  }
  const rates = monthRatesUsed(monthLabel);
  if(!rates.length) return `1 USD = ${formatIntSpaced(USD_TO_CDF)} CDF`;
  if(rates.length === 1) return `1 USD = ${formatIntSpaced(rates[0])} CDF`;
  return `Variable (${formatIntSpaced(rates[0])} - ${formatIntSpaced(rates[rates.length - 1])} CDF)`;
}

function refreshStudentsFinancialState(){
  const now = new Date();
  const day = now.getDate();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}`;
  const overdueMonthKeys = [];
  for(const label of SCHOOL_MONTH_LABELS_FR){
    const mk = monthKeyFromLabelFR(label);
    if(!mk) continue;
    // month M becomes late on the 5th of month M+1
    const [y,m] = mk.split("-").map(Number);
    if(!Number.isFinite(y) || !Number.isFinite(m)) continue;
    const nextY = m === 12 ? (y + 1) : y;
    const nextM = m === 12 ? 1 : (m + 1);
    const cutoff = `${nextY}-${String(nextM).padStart(2,"0")}`;
    if(cutoff < currentMonthKey) overdueMonthKeys.push(mk);
    else if(cutoff === currentMonthKey && day > 5) overdueMonthKeys.push(mk);
  }

  const overdueSet = new Set(overdueMonthKeys);
  const paidByStudentMonth = new Map();
  for(const payment of getPayments()){
    if(!isTuitionPaymentRecord(payment)) continue;
    const monthKey = String(paymentMonthKey(payment) || "");
    if(!overdueSet.has(monthKey)) continue;
    const studentKey = String(payment?.studentId || "");
    if(!studentKey) continue;
    const amountUSD = Number(payment.amountUSD ?? toUSD(payment.amountEntered, payment.currency) ?? 0);
    if(!(Number.isFinite(amountUSD) && amountUSD > 0)) continue;
    const aggregateKey = `${studentKey}|${monthKey}`;
    paidByStudentMonth.set(aggregateKey, Number(paidByStudentMonth.get(aggregateKey) || 0) + amountUSD);
  }

  for(const s of students){
    const studentKey = String(s?.id || "");
    const duePerMonthUSD = expectedForStudent(s, "level-fee");
    let totalRemainingUSD = 0;
    let totalPaidOnOverdueUSD = 0;

    for(const monthKey of overdueMonthKeys){
      const paidUSD = Number(paidByStudentMonth.get(`${studentKey}|${monthKey}`) || 0);

      const remaining = Math.max(0, duePerMonthUSD - paidUSD);
      totalRemainingUSD += remaining;
      totalPaidOnOverdueUSD += Math.min(duePerMonthUSD, Math.max(0, paidUSD));
    }

    s.balance = Number(totalRemainingUSD.toFixed(2));
    if(totalRemainingUSD <= 0){
      s.status = "A jour";
    } else if(totalPaidOnOverdueUSD > 0){
      s.status = "Partiel";
    } else {
      s.status = "En retard";
    }
  }
}

function getStudentRemainingForMonthUSD(student, monthLabel){
  const targetMonthKey = monthKeyFromLabelFR(monthLabel || "");
  const dueUSD = expectedForStudent(student, "level-fee");
  const paidUSD = getPayments()
    .filter(p =>
      p.studentId === student.id &&
      String(paymentMonthKey(p) || "") === String(targetMonthKey || "") &&
      isTuitionPaymentRecord(p)
    )
    .reduce((sum, p) => sum + Number(p.amountUSD ?? toUSD(p.amountEntered, p.currency) ?? 0), 0);
  return Math.max(0, dueUSD - paidUSD);
}

function fmtDateShort(d){
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function fmtDateTime(d){
  const ddmmyy = fmtDateShort(d);
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${ddmmyy} ${hh}:${mi}`;
}
function fmtDateFrLong(d){
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}
function formatEnrollmentDate(value){
  const raw = String(value || "").trim();
  if(!raw) return "—";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso){
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(slash){
    return `${slash[1]}/${slash[2]}/${slash[3]}`;
  }
  const d = new Date(raw);
  if(Number.isFinite(d.getTime())){
    return fmtDateFrLong(d);
  }
  return raw;
}

function setTopDate(){
  const d = new Date();
  elToday.textContent = fmtDateShort(d);
}

function setRateLabel(){
  elRateLabel.textContent = `Taux: 1$ = ${formatIntSpaced(USD_TO_CDF)} CDF`;
}

function getLocalCashBalanceUpToDate(dateIso){
  const safeDate = String(dateIso || "").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)){
    return {
      entry: { usd: 0, cdf: 0 },
      exit: { usd: 0, cdf: 0 },
      netUSD: 0,
      netCDF: 0
    };
  }

  const entryPayments = getPayments().filter((p) => {
    if(!isCashPaymentRecord(p)) return false;
    const paymentDateIso = toDateISO(p.createdAt || new Date());
    return /^\d{4}-\d{2}-\d{2}$/.test(paymentDateIso) && paymentDateIso <= safeDate;
  });
  const entry = entryPayments.reduce((acc, p) => {
    const part = paymentAmountSplit(p);
    acc.usd += Number(part.usd || 0);
    acc.cdf += Number(part.cdf || 0);
    return acc;
  }, { usd: 0, cdf: 0 });

  const exitSpendings = getSchoolYearScopedSpendings().filter((s) => {
    if(isStatePaidSpending(s)) return false;
    const spendingDateIso = spendingEffectiveDateISO(s);
    return /^\d{4}-\d{2}-\d{2}$/.test(spendingDateIso) && spendingDateIso <= safeDate;
  });
  const exit = exitSpendings.reduce((acc, s) => {
    const part = spendingAmountSplit(s);
    acc.usd += Number(part.usd || 0);
    acc.cdf += Number(part.cdf || 0);
    return acc;
  }, { usd: 0, cdf: 0 });

  return {
    entry,
    exit,
    netUSD: Number((entry.usd - exit.usd).toFixed(2)),
    netCDF: Math.round(entry.cdf - exit.cdf)
  };
}

function getLocalTuitionBalanceUpToDate(dateIso){
  const safeDate = String(dateIso || "").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)){
    return {
      entry: { usd: 0, cdf: 0 },
      exit: { usd: 0, cdf: 0 },
      netUSD: 0,
      netCDF: 0
    };
  }
  const minervalSnapshot = getCaisseBoxSnapshots(safeDate).find((row) => row.key === "minerval");
  const entry = {
    usd: Number(minervalSnapshot?.entry?.usd || 0),
    cdf: Number(minervalSnapshot?.entry?.cdf || 0)
  };
  const exit = {
    usd: Number(minervalSnapshot?.exit?.usd || 0),
    cdf: Number(minervalSnapshot?.exit?.cdf || 0)
  };

  return {
    entry,
    exit,
    netUSD: Number((entry.usd - exit.usd).toFixed(2)),
    netCDF: Math.round(entry.cdf - exit.cdf)
  };
}

function renderTopDailyBalance(){
  if(!elTopDailyBalance && !elTopDailyBalanceCDF) return;
  const todayIso = toDateISO(new Date());
  const balance = getLocalTuitionBalanceUpToDate(todayIso);
  const netUSD = Math.max(0, Number(balance.netUSD || 0));
  const netCDF = Math.max(0, Number(balance.netCDF || 0));
  if(elTopDailyBalance){
    elTopDailyBalance.textContent = formatUSD(netUSD);
  }
  if(elTopDailyBalanceCDF){
    elTopDailyBalanceCDF.textContent = `${formatIntSpaced(netCDF)} CDF`;
  }
}

function syncReportDateToMonth(){
  if(!repDateSel || !repMonthSel) return;
  const monthIdx = monthLabelToIndexFR(repMonthSel.value);
  const monthYear = monthYearForSchoolMonthLabel(repMonthSel.value);
  if(monthIdx < 0) return;
  const currentIso = normalizeLooseDateToISO(repDateSel.value || "");
  const target = currentIso ? new Date(currentIso) : new Date();
  // Clamp to first day before applying month/year to avoid JS date overflow
  // (e.g. 31 -> next month when target month has 30 days).
  target.setDate(1);
  if(Number.isFinite(monthYear)) target.setFullYear(monthYear);
  target.setMonth(monthIdx, 1);
  repDateSel.value = fmtDateFrLong(target);
}

function makeFeeReportTypeValue(reportKey){
  const key = String(reportKey || "").trim();
  if(!key) return "";
  return `${REPORT_TYPE_FEE_PREFIX}${key}`;
}
function parseFeeReportTypeFeeId(value){
  const raw = String(value || "").trim();
  if(!raw.startsWith(REPORT_TYPE_FEE_PREFIX)) return "";
  return raw.slice(REPORT_TYPE_FEE_PREFIX.length).trim();
}
function feeReportGroupKeyForFeeType(ft){
  const code = String(ft?.code || "").trim().toUpperCase();
  const codeMatch = code.match(/^ETAT_T([123])_/);
  if(codeMatch) return `${REPORT_GROUP_TRANCHE_PREFIX}${codeMatch[1]}`;
  const labelAscii = normalizeTextAscii(ft?.labelFr || "");
  if(/frais de l etat/.test(labelAscii)){
    if(/\b1(?:re|er|e)? tranche\b/.test(labelAscii)) return `${REPORT_GROUP_TRANCHE_PREFIX}1`;
    if(/\b2(?:e)? tranche\b/.test(labelAscii)) return `${REPORT_GROUP_TRANCHE_PREFIX}2`;
    if(/\b3(?:e)? tranche\b/.test(labelAscii)) return `${REPORT_GROUP_TRANCHE_PREFIX}3`;
  }
  const id = String(ft?.id ?? "").trim();
  return id || `label:${normalizeFeeName(ft?.labelFr || "frais")}`;
}
function getFeeReportDefinitions(){
  const active = getFeeTypeObjects().filter((ft) => ft && ft.active !== false);
  const byKey = new Map();
  for(const ft of active){
    const id = String(ft?.id ?? "").trim();
    if(!id) continue;
    const key = feeReportGroupKeyForFeeType(ft);
    if(!key) continue;
    const existing = byKey.get(key);
    if(existing){
      if(!existing.feeTypeIds.includes(id)) existing.feeTypeIds.push(id);
      existing.feeTypes.push(ft);
      continue;
    }
    byKey.set(key, {
      key,
      label: REPORT_GROUP_LABELS[key] || normalizeFeeName(ft?.labelFr || "Frais"),
      feeTypeIds: [id],
      feeTypes: [ft]
    });
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const aGroup = String(a?.key || "").startsWith(REPORT_GROUP_TRANCHE_PREFIX);
    const bGroup = String(b?.key || "").startsWith(REPORT_GROUP_TRANCHE_PREFIX);
    if(aGroup !== bGroup) return aGroup ? -1 : 1;
    return String(a?.label || "").localeCompare(String(b?.label || ""), "fr");
  });
}
function getFeeReportDefinitionByKey(reportKey){
  const key = String(reportKey || "").trim();
  if(!key) return null;
  return getFeeReportDefinitions().find((d) => String(d?.key || "").trim() === key) || null;
}
function canAccessReportTypeValue(reportTypeValue){
  if(String(reportTypeValue || "").trim() === "dailyCaisseArticlesSummary") return hasRole("admin");
  if(String(reportTypeValue || "").trim() === "feeDistribution") return hasRole("admin");
  // Tous les rôles (y compris caissier) peuvent voir et imprimer chaque rapport.
  return true;
}
function syncReportTypeOptions({ keepCurrent = true } = {}){
  if(!repType) return;
  const previousValue = keepCurrent ? String(repType.value || "").trim() : "";
  const currentValues = new Set(Array.from(repType.options || []).map((opt) => String(opt.value || "").trim()));
  const feeOptions = getFeeReportDefinitions().map((def) => ({
    value: makeFeeReportTypeValue(def.key),
    label: String(def.label || "")
  }));
  const baseOptions = BASE_REPORT_TYPE_OPTIONS.filter((opt) => canAccessReportTypeValue(opt?.value));
  const nextDefs = [...baseOptions, ...feeOptions];
  repType.innerHTML = nextDefs.map((opt) => `<option value="${esc(opt.value)}">${esc(opt.label)}</option>`).join("");
  const nextValues = new Set(nextDefs.map((opt) => String(opt.value || "").trim()));
  if(previousValue && nextValues.has(previousValue)){
    repType.value = previousValue;
    return;
  }
  // Legacy migration: old combined fees report option.
  if(previousValue === "feesByType" && feeOptions.length){
    repType.value = feeOptions[0].value;
    return;
  }
  if(previousValue && currentValues.has(previousValue) && nextValues.has(previousValue)){
    repType.value = previousValue;
    return;
  }
  repType.value = "summary";
}
function sanitizeReportTypeOptions(){
  syncReportTypeOptions({ keepCurrent: true });
}

function applySchoolMonthOptions(selectEl, keepValue){
  if(!selectEl) return;
  const desired = isSchoolMonthLabel(keepValue) ? keepValue : getDefaultSchoolMonthLabel();
  const optionsHtml = SCHOOL_MONTH_LABELS_FR.map((m) => `<option>${m}</option>`).join("");
  selectEl.innerHTML = optionsHtml;
  setSchoolMonthSelectValue(selectEl, desired);
}

function refreshPeriodLabels(){
  if(elTopPeriod){
    const activeMonthLabel = dashMonth?.value || getDefaultSchoolMonthLabel();
    const activeMonthKey = monthKeyFromLabelFR(activeMonthLabel || "");
    elTopPeriod.textContent = monthLabelFromMonthKeyWithYear(activeMonthKey || currentCalendarMonthKey());
  }
}

function applySchoolYearToMonthSelectors({ preserve = true } = {}){
  const keepDash = preserve ? dashMonth?.value : "";
  const keepRep = preserve ? repMonthSel?.value : "";
  const keepPay = preserve ? elMonth?.value : "";
  const keepSpend = preserve ? spMonth?.value : "";
  const autoCaisseMonth = getAutoAppliedSchoolMonthLabel();
  applySchoolMonthOptions(dashMonth, keepDash);
  applySchoolMonthOptions(repMonthSel, keepRep);
  applySchoolMonthOptions(elMonth, keepPay);
  applySchoolMonthOptions(spMonth, keepSpend || keepDash || keepRep);
  applySchoolMonthOptions(caisseSpendMonth, autoCaisseMonth);
  applySchoolMonthOptions(caisseTransferMonth, autoCaisseMonth);
  syncReportDateToMonth();
  refreshPeriodLabels();
}

function normalizeLevelFeesConfig(raw){
  const obj = (raw && typeof raw === "object") ? raw : {};
  const parseFee = (val, fallback) => {
    const n = Number(String(val ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const base = {
    Maternelle: parseFee(obj.Maternelle ?? obj.maternelle, DEFAULT_LEVEL_FEE_USD.Maternelle),
    Primaire: parseFee(obj.Primaire ?? obj.primaire, DEFAULT_LEVEL_FEE_USD.Primaire),
    Secondaire: parseFee(obj.Secondaire ?? obj.secondaire, DEFAULT_LEVEL_FEE_USD.Secondaire),
    Secondaire4eH: parseFee(
      obj.Secondaire4eH ?? obj.secondaire4eH ?? obj.secondaire_4eh,
      DEFAULT_LEVEL_FEE_USD.Secondaire4eH
    )
  };
  const monthlyOverrides = {};
  const rawOverrides = obj.monthlyOverrides && typeof obj.monthlyOverrides === "object" ? obj.monthlyOverrides : {};
  for(const [monthKey, values] of Object.entries(rawOverrides)){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || "")) || !values || typeof values !== "object") continue;
    monthlyOverrides[monthKey] = {
      Maternelle: parseFee(values.Maternelle ?? values.maternelle, base.Maternelle),
      Primaire: parseFee(values.Primaire ?? values.primaire, base.Primaire),
      Secondaire: parseFee(values.Secondaire ?? values.secondaire, base.Secondaire),
      Secondaire4eH: parseFee(values.Secondaire4eH ?? values.secondaire4eH, base.Secondaire4eH)
    };
  }
  return { ...base, monthlyOverrides };
}

function persistLevelFeesLocal(cfg){
  try{
    localStorage.setItem(KEY_LEVEL_FEES_USD, JSON.stringify(normalizeLevelFeesConfig(cfg)));
  }catch(_){}
}

function readLevelFeesLocal(){
  try{
    const raw = localStorage.getItem(KEY_LEVEL_FEES_USD);
    if(!raw) return null;
    return normalizeLevelFeesConfig(JSON.parse(raw));
  }catch{
    return null;
  }
}

function applyLevelFeesConfig(cfg){
  LEVEL_FEE_USD = normalizeLevelFeesConfig(cfg);
  persistLevelFeesLocal(LEVEL_FEE_USD);
}

function persistSchoolYearLocal(startYear){
  const y = normalizeSchoolYearStartYear(startYear);
  if(!y) return;
  localStorage.setItem(KEY_SCHOOL_YEAR_START, String(y));
}

function readSchoolYearLocal(){
  return normalizeSchoolYearStartYear(localStorage.getItem(KEY_SCHOOL_YEAR_START));
}

function syncSchoolYearView(){
  if(setSchoolYear){
    const activeStart = getActiveSchoolYearStartYear();
    ensureSchoolYearDropdownOptions(activeStart);
    setSchoolYear.value = schoolYearLabelFromStartYear(activeStart);
  }
}

async function loadSchoolYearSetting(){
  let startYear = null;
  let levelFeesCfg = null;
  try{
    if(window.loadEcoleConfiguration) await window.loadEcoleConfiguration();
    const data = await apiFetch("/api/settings");
    startYear = normalizeSchoolYearStartYear(data?.schoolYearStartYear);
    levelFeesCfg = normalizeLevelFeesConfig(data?.levelMonthlyDueUSD || {});
  }catch(_){
    // fall back to local value if API unavailable
  }
  if(!startYear) startYear = readSchoolYearLocal() || getDefaultSchoolYearStartYear();
  if(!levelFeesCfg) levelFeesCfg = readLevelFeesLocal() || normalizeLevelFeesConfig({});
  applyLevelFeesConfig(levelFeesCfg);
  activeSchoolYearStartYear = startYear;
  persistSchoolYearLocal(startYear);
  syncSchoolYearView();
  applySchoolYearToMonthSelectors({ preserve: false });
}

async function saveSchoolYearSetting(){
  if(!hasRole("admin")){
    showInAppPopup("Modification de l'année scolaire réservée à l'administrateur.", { variant: "error", duration: 3600 });
    return;
  }
  const parsed = parseSchoolYearInput(setSchoolYear?.value || "");
  if(!parsed){
    showInAppPopup("Année scolaire invalide. Format attendu: 2025-2026");
    return;
  }
  try{
    const data = await apiFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ schoolYearStartYear: parsed })
    });
    const saved = normalizeSchoolYearStartYear(data?.schoolYearStartYear) || parsed;
    const levelFeesCfg = normalizeLevelFeesConfig(data?.levelMonthlyDueUSD || {});
    applyLevelFeesConfig(levelFeesCfg);
    activeSchoolYearStartYear = saved;
    persistSchoolYearLocal(saved);
    syncSchoolYearView();
    applySchoolYearToMonthSelectors({ preserve: false });
    prefetchedReceiptReservation = getPrefetchedReceiptReservationForYear();
    prefetchReceiptPromise = null;
    prefetchReceiptPromiseYearKey = "";
    setTopReceiptPreview();
    refreshReceiptPreviewFromForm();
    prefetchNextReceiptNo().catch(() => {});
    // month-based caches become stale when school year changes
    reportsSummaryApiCache.clear();
    busReportApiCache.clear();
    dailyEntriesReportApiCache.clear();
    lateStudentsReportApiCache.clear();
    await Promise.allSettled([
      loadFeeTypesFromApi(true),
      loadStudents(),
      loadPaymentsFromApi(),
      loadReceiptsFromApi(),
      loadSpendingsFromApi(),
      loadCaisseTransfersFromApi()
    ]);
    if(setStatus) setStatus.textContent = `Année scolaire enregistrée: ${schoolYearLabelFromStartYear(saved)} (Septembre à Juin).`;
    renderDashboard();
    renderReports();
    if(viewSpending.classList.contains("active")) renderSpendingTable();
  }catch(err){
    showInAppPopup(`Erreur enregistrement année scolaire: ${err.message}`);
  }
}

async function saveLevelFeesSetting(){
  if(!hasRole("admin")){
    showInAppPopup("Seul un admin peut modifier les frais mensuels par niveau.");
    return;
  }
  const parseFeeInput = (el, label) => {
    const raw = String(el?.value || "").trim().replace(",", ".");
    const n = Number(raw);
    if(!Number.isFinite(n) || n < 0){
      throw new Error(`Montant invalide pour ${label}.`);
    }
    return n;
  };
  try{
    const payload = {
      maternelle: parseFeeInput(setLevelFeeMaternelle, "Maternelle"),
      primaire: parseFeeInput(setLevelFeePrimaire, "Primaire"),
      secondaire: parseFeeInput(setLevelFeeSecondaire, "Secondaire"),
      secondaire4eH: parseFeeInput(setLevelFeeSecondaire4eH, "Secondaire 4e H")
    };
    const data = await apiFetch("/api/settings/level-fees", {
      method: "PATCH",
      body: JSON.stringify({ ...payload, recalculateExisting: true })
    });
    applyLevelFeesConfig(data?.levelMonthlyDueUSD || payload);
    if(setStatus){
      const studentsAdjusted = Number(data?.recalculation?.studentsUpdated || 0);
      setStatus.textContent = `Mensuels enregistrés: Maternelle ${formatUSD(LEVEL_FEE_USD.Maternelle)} / Primaire ${formatUSD(LEVEL_FEE_USD.Primaire)} / Secondaire ${formatUSD(LEVEL_FEE_USD.Secondaire)} / 4e H ${formatUSD(LEVEL_FEE_USD.Secondaire4eH)} • Élèves ajustés: ${studentsAdjusted}`;
    }
    await Promise.allSettled([loadStudents(), loadPaymentsFromApi(), loadReceiptsFromApi()]);
    syncSettingsView();
    syncDueFromLevel(stLevel?.value || "");
    refreshStudentsFinancialState();
    renderStudentList();
    renderStudentsTableGrouped();
    if(selectedStudentId) selectStudent(selectedStudentId);
    renderDashboard();
    renderReports();
  }catch(err){
    showInAppPopup(`Erreur frais mensuels: ${err.message || err}`);
  }
}

function activeSchoolYearTuitionMonthKeys(){
  const startYear = Number(getActiveSchoolYearStartYear());
  if(!Number.isFinite(startYear)) return [];
  return [9,10,11,12].map((month) => `${startYear}-${String(month).padStart(2,"0")}`)
    .concat([1,2,3,4,5,6].map((month) => `${startYear + 1}-${String(month).padStart(2,"0")}`));
}

function renderMonthlyFeesEditor(){
  if(!monthlyFeesTbody) return;
  const cfg = normalizeLevelFeesConfig(LEVEL_FEE_USD);
  const levels = ["Maternelle", "Primaire", "Secondaire", "Secondaire4eH"];
  monthlyFeesTbody.innerHTML = activeSchoolYearTuitionMonthKeys().map((monthKey) => {
    const custom = cfg.monthlyOverrides?.[monthKey] || null;
    const values = custom || cfg;
    return `<tr data-month-fee-row="${esc(monthKey)}">
      <td><strong>${esc(monthLabelFromMonthKeyWithYear(monthKey) || monthKey)}</strong></td>
      <td style="text-align:center"><input type="checkbox" data-month-fee-enabled="${esc(monthKey)}" ${custom ? "checked" : ""}></td>
      ${levels.map((level) => `<td><input class="input" inputmode="decimal" data-month-fee-input="${esc(monthKey)}" data-month-fee-level="${level}" value="${esc(String(Number(values[level] || 0)))}" ${custom ? "" : "disabled"}></td>`).join("")}
    </tr>`;
  }).join("");
  monthlyFeesTbody.querySelectorAll("[data-month-fee-enabled]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const monthKey = String(checkbox.getAttribute("data-month-fee-enabled") || "");
      monthlyFeesTbody.querySelectorAll(`[data-month-fee-input="${monthKey}"]`).forEach((input) => {
        input.disabled = !checkbox.checked;
      });
    });
  });
  if(monthlyFeesStatus) monthlyFeesStatus.textContent = `Année scolaire ${currentSchoolYearLabel()} • Les élèves ayant déjà payé conservent leur tarif verrouillé.`;
}

function openMonthlyFeesModal(){
  if(!hasRole("admin")){
    showInAppPopup("Seul un admin peut personnaliser le minerval mensuel.", { variant: "error" });
    return;
  }
  renderMonthlyFeesEditor();
  if(monthlyFeesModal){
    monthlyFeesModal.style.display = "flex";
    monthlyFeesModal.setAttribute("aria-hidden", "false");
  }
}

function closeMonthlyFeesModal(){
  if(!monthlyFeesModal) return;
  monthlyFeesModal.style.display = "none";
  monthlyFeesModal.setAttribute("aria-hidden", "true");
}

async function saveMonthlyFeesSetting(){
  if(!monthlyFeesTbody || !monthlyFeesSaveBtn) return;
  const cfg = normalizeLevelFeesConfig(LEVEL_FEE_USD);
  const monthlyOverrides = {};
  for(const checkbox of monthlyFeesTbody.querySelectorAll("[data-month-fee-enabled]")){
    if(!checkbox.checked) continue;
    const monthKey = String(checkbox.getAttribute("data-month-fee-enabled") || "");
    const row = checkbox.closest("tr");
    const read = (level) => {
      const input = row?.querySelector(`[data-month-fee-level="${level}"]`);
      const value = Number(String(input?.value || "").trim().replace(",", "."));
      if(!Number.isFinite(value) || value < 0) throw new Error(`Montant invalide pour ${monthLabelFromMonthKeyWithYear(monthKey)} — ${level}.`);
      return value;
    };
    monthlyOverrides[monthKey] = {
      maternelle: read("Maternelle"),
      primaire: read("Primaire"),
      secondaire: read("Secondaire"),
      secondaire4eH: read("Secondaire4eH")
    };
  }
  monthlyFeesSaveBtn.disabled = true;
  if(monthlyFeesStatus) monthlyFeesStatus.textContent = "Enregistrement et verrouillage des mois déjà payés...";
  try{
    const data = await apiFetch("/api/settings/level-fees", {
      method: "PATCH",
      body: JSON.stringify({
        maternelle: cfg.Maternelle,
        primaire: cfg.Primaire,
        secondaire: cfg.Secondaire,
        secondaire4eH: cfg.Secondaire4eH,
        monthlyOverrides,
        recalculateExisting: false
      })
    });
    applyLevelFeesConfig(data?.levelMonthlyDueUSD || { ...cfg, monthlyOverrides });
    reportsSummaryApiCache.clear();
    lateStudentsReportApiCache.clear();
    await Promise.allSettled([loadStudents(), loadPaymentsFromApi(), loadReceiptsFromApi()]);
    refreshStudentsFinancialState();
    renderDashboard();
    renderReports();
    renderMonthlyFeesEditor();
    if(monthlyFeesStatus) monthlyFeesStatus.textContent = "Tarifs mensuels enregistrés ✓. Les montants déjà payés restent inchangés.";
  }catch(err){
    if(monthlyFeesStatus) monthlyFeesStatus.textContent = `Erreur: ${String(err?.message || err)}`;
  }finally{
    monthlyFeesSaveBtn.disabled = false;
  }
}

if(setMonthlyFeesOpenBtn) setMonthlyFeesOpenBtn.addEventListener("click", openMonthlyFeesModal);
if(monthlyFeesCloseBtn) monthlyFeesCloseBtn.addEventListener("click", closeMonthlyFeesModal);
if(monthlyFeesSaveBtn) monthlyFeesSaveBtn.addEventListener("click", () => saveMonthlyFeesSetting().catch(() => {}));
if(monthlyFeesResetBtn) monthlyFeesResetBtn.addEventListener("click", () => {
  monthlyFeesTbody?.querySelectorAll("[data-month-fee-enabled]").forEach((checkbox) => {
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
  });
  if(monthlyFeesStatus) monthlyFeesStatus.textContent = "Tous les mois utiliseront les tarifs par niveau par défaut après enregistrement.";
});
if(monthlyFeesModal) monthlyFeesModal.addEventListener("click", (event) => {
  if(event.target === monthlyFeesModal) closeMonthlyFeesModal();
});

function loadRateSetting(){
  const raw = localStorage.getItem(KEY_USD_TO_CDF);
  const val = parseInt(String(raw || ""), 10);
  if(Number.isFinite(val) && val > 0){
    USD_TO_CDF = val;
  }
  // Seed current selected month snapshot only if missing (preserves historical months).
  const currentMonth = (dashMonth?.value || repMonthSel?.value || getCurrentMonthLabel());
  if(!getMonthRateSnapshot(currentMonth)){
    setMonthRateSnapshot(currentMonth, USD_TO_CDF);
  }
}

function normalizeThemeMode(mode){
  return String(mode || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function themeModeLabelFr(mode){
  return normalizeThemeMode(mode) === "dark" ? "sombre" : "clair";
}

function syncThemeSettingsView(){
  if(setThemeToggle) setThemeToggle.checked = currentThemeMode === "dark";
  if(setThemeStatus){
    setThemeStatus.textContent = `Th\u00e8me actuel: ${themeModeLabelFr(currentThemeMode)}. Pr\u00e9f\u00e9rence enregistr\u00e9e sur cet appareil.`;
  }
}

function applyThemeMode(mode, { persist = false } = {}){
  currentThemeMode = normalizeThemeMode(mode);
  if(document.documentElement){
    document.documentElement.setAttribute("data-theme", currentThemeMode);
  }
  if(persist){
    try{
      localStorage.setItem(KEY_THEME_MODE, currentThemeMode);
    }catch(_){}
  }
  syncThemeSettingsView();
  return currentThemeMode;
}

function loadThemeSetting(){
  let stored = document.documentElement?.getAttribute("data-theme") || "light";
  try{
    stored = localStorage.getItem(KEY_THEME_MODE) || stored;
  }catch(_){}
  applyThemeMode(stored);
}

function syncSettingsView(){
  if(setUsdToCdf) setUsdToCdf.value = String(USD_TO_CDF);
  syncThemeSettingsView();
  syncSchoolYearView();
  if(setLevelFeeMaternelle) setLevelFeeMaternelle.value = String(Number(LEVEL_FEE_USD.Maternelle || 0));
  if(setLevelFeePrimaire) setLevelFeePrimaire.value = String(Number(LEVEL_FEE_USD.Primaire || 0));
  if(setLevelFeeSecondaire) setLevelFeeSecondaire.value = String(Number(LEVEL_FEE_USD.Secondaire || 0));
  if(setLevelFeeSecondaire4eH) setLevelFeeSecondaire4eH.value = String(Number(LEVEL_FEE_USD.Secondaire4eH || 0));
  if(setLevelFeeSaveBtn) setLevelFeeSaveBtn.disabled = !hasRole("admin");
  if(setStatus){
    setStatus.textContent = `Taux actuel: 1 USD = ${formatIntSpaced(USD_TO_CDF)} CDF • Année scolaire: ${currentSchoolYearLabel()} • Mensuels: Maternelle ${formatUSD(LEVEL_FEE_USD.Maternelle)} / Primaire ${formatUSD(LEVEL_FEE_USD.Primaire)} / Secondaire ${formatUSD(LEVEL_FEE_USD.Secondaire)} / 4e H ${formatUSD(LEVEL_FEE_USD.Secondaire4eH)}`;
  }
  renderFeeSettingsTable();
  renderClassSettingsTable();
}

function getAccordionStateMap(){
  try{
    const raw = localStorage.getItem(KEY_ACCORDION_STATE);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === "object") ? parsed : {};
  }catch{
    return {};
  }
}

function saveAccordionStateMap(map){
  localStorage.setItem(KEY_ACCORDION_STATE, JSON.stringify(map || {}));
}

function accordionStateKey(detailsEl, index){
  const summary = detailsEl?.querySelector(":scope > summary");
  const title = String(summary?.textContent || "").trim().replace(/\s+/g, " ");
  const view = detailsEl?.closest(".view")?.id || "global";
  return `${view}::${title || `section-${index}`}`;
}

function initAccordionPersistence(){
  const items = Array.from(document.querySelectorAll("details.settings-accordion"));
  if(!items.length) return;
  const state = getAccordionStateMap();
  items.forEach((el, idx) => {
    const key = accordionStateKey(el, idx);
    if(Object.prototype.hasOwnProperty.call(state, key)){
      el.open = Boolean(state[key]);
    }
    el.addEventListener("toggle", () => {
      const next = getAccordionStateMap();
      next[key] = el.open;
      saveAccordionStateMap(next);
    });
  });
}

function levelPctColorMeta(pctRaw){
  const pct = Number(pctRaw || 0);
  if(pct >= 80) return { color:"#15803d", bg:"rgba(22,163,74,.12)" };   // green
  if(pct >= 60) return { color:"#b45309", bg:"rgba(245,158,11,.15)" };   // amber
  if(pct >= 40) return { color:"#c2410c", bg:"rgba(249,115,22,.15)" };   // orange
  return { color:"#b91c1c", bg:"rgba(239,68,68,.12)" };                  // red
}

function formatPctBadge(pct){
  const c = levelPctColorMeta(pct);
  return `<span style="display:inline-block;min-width:44px;padding:3px 8px;border-radius:999px;font-weight:900;color:${c.color};background:${c.bg};text-align:center;">${pct}%</span>`;
}

function applyRateSetting(){
  const next = parseInt(onlyDigits(setUsdToCdf.value || ""), 10);
  if(!Number.isFinite(next) || next <= 0){
    showInAppPopup("Veuillez saisir un taux valide (ex: 2400).");
    return;
  }
  USD_TO_CDF = next;
  localStorage.setItem(KEY_USD_TO_CDF, String(next));
  // Snapshot the rate for the currently selected operational month(s), so later changes do not alter past reports.
  setMonthRateSnapshot(dashMonth?.value || getCurrentMonthLabel(), next);
  if(repMonthSel?.value) setMonthRateSnapshot(repMonthSel.value, next);
  setRateLabel();
  syncSettingsView();

  for(const s of students){
    if(typeof s.monthlyDueUSD === "number"){
      s.monthlyDueCDF = Math.round(s.monthlyDueUSD * USD_TO_CDF);
    }
  }
  refreshStudentsFinancialState();
  renderStudentList();
  if(selectedStudentId) selectStudent(selectedStudentId);
  renderDashboard();
  renderReports();
}

function getReceiptSeq(){
  const store = getReceiptSeqStore();
  return sanitizeReceiptSeqValue(store[getActiveReceiptSeqStorageKey()]) || 1;
}

function setReceiptSeq(next){
  const store = getReceiptSeqStore();
  store[getActiveReceiptSeqStorageKey()] = sanitizeReceiptSeqValue(next) || 1;
  setReceiptSeqStore(store);
}

function buildReceiptNo(seq){
  return `${window.ecoleConfiguration?.["receipts.prefix"] || "ECO"}-${getActiveReceiptYear()}-${pad4(seq)}`;
}

function getCurrentReceiptReservationYearKey(){
  return getActiveReceiptSeqStorageKey();
}

function getPrefetchedReceiptReservationForYear(yearKey = getCurrentReceiptReservationYearKey()){
  const cached = yearKey ? prefetchedReceiptReservationsByYear[yearKey] : null;
  const normalized = normalizeReceiptReservationForYear(yearKey, cached);
  if(normalized) return normalized;
  if(yearKey) delete prefetchedReceiptReservationsByYear[yearKey];
  return null;
}

function setPrefetchedReceiptReservationForYear(yearKey, reservation){
  const normalized = normalizeReceiptReservationForYear(yearKey, reservation);
  if(yearKey && normalized){
    prefetchedReceiptReservationsByYear[yearKey] = normalized;
  }else if(yearKey){
    delete prefetchedReceiptReservationsByYear[yearKey];
  }
  prefetchedReceiptReservation = getPrefetchedReceiptReservationForYear();
  return getPrefetchedReceiptReservationForYear(yearKey);
}

function getNextReceiptNoForUi(){
  const yearKey = getCurrentReceiptReservationYearKey();
  prefetchedReceiptReservation = getPrefetchedReceiptReservationForYear(yearKey);
  if(prefetchedReceiptReservation?.receiptNo) return String(prefetchedReceiptReservation.receiptNo).trim();
  return "Attribué par le serveur";
}

function setTopReceiptPreview(){
  elReceiptTop.textContent = getNextReceiptNoForUi();
}

function consumePrefetchedReceiptReservation(){
  const yearKey = getCurrentReceiptReservationYearKey();
  const cached = getPrefetchedReceiptReservationForYear(yearKey);
  setPrefetchedReceiptReservationForYear(yearKey, null);
  setTopReceiptPreview();
  return cached;
}

let receiptDeviceRegistrationPromise = null;
function getOrCreateReceiptDeviceKey(){
  let key = String(localStorage.getItem(KEY_RECEIPT_DEVICE) || "").trim();
  if(!/^[A-Za-z0-9._:-]{12,160}$/.test(key)){
    key = crypto?.randomUUID
      ? `device:${crypto.randomUUID()}`
      : `device:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY_RECEIPT_DEVICE, key);
  }
  return key;
}
function getReceiptDeviceLabel(){
  const platform = String(navigator?.platform || "").trim();
  return platform ? `Gestion Scolaire ${platform}`.slice(0, 120) : "Gestion Scolaire client";
}
async function ensureReceiptDeviceRegistration(){
  if(receiptDeviceRegistrationPromise) return receiptDeviceRegistrationPromise;
  receiptDeviceRegistrationPromise = (async () => {
    const deviceKey = getOrCreateReceiptDeviceKey();
    const row = await apiFetch("/api/receipt-devices/register", {
      method: "POST",
      body: JSON.stringify({ deviceKey, label: getReceiptDeviceLabel() })
    });
    const code = String(row?.code || "").trim().toUpperCase();
    if(code) localStorage.setItem(KEY_RECEIPT_DEVICE_CODE, code);
    return { deviceKey, deviceCode: code || null };
  })().finally(() => {
    receiptDeviceRegistrationPromise = null;
  });
  return receiptDeviceRegistrationPromise;
}

async function prefetchNextReceiptNo({ force = false } = {}){
  const yearKey = getCurrentReceiptReservationYearKey();
  const cached = getPrefetchedReceiptReservationForYear(yearKey);
  if(!force && cached){
    prefetchedReceiptReservation = cached;
    return cached;
  }
  if(prefetchReceiptPromise && prefetchReceiptPromiseYearKey === yearKey) return prefetchReceiptPromise;

  prefetchReceiptPromiseYearKey = yearKey;
  prefetchReceiptPromise = (async () => {
    try{
      const device = await ensureReceiptDeviceRegistration();
      const data = await apiFetch(`/api/payments/next-receipt-no?receiptDeviceKey=${encodeURIComponent(device.deviceKey)}&deviceLabel=${encodeURIComponent(getReceiptDeviceLabel())}`);
      const receiptNo = String(data?.receiptNo || "").trim();
      if(!receiptNo) return null;
      const reservation = setPrefetchedReceiptReservationForYear(yearKey, { receiptNo, deviceCode: data?.deviceCode || device.deviceCode, preview: true });
      if(getCurrentReceiptReservationYearKey() === yearKey){
        setTopReceiptPreview();
        refreshReceiptPreviewFromForm();
      }
      return reservation;
    }catch(_){
      return null;
    }finally{
      if(prefetchReceiptPromiseYearKey === yearKey){
        prefetchReceiptPromise = null;
        prefetchReceiptPromiseYearKey = "";
      }
    }
  })();

  return prefetchReceiptPromise;
}

function getPayments(){
  if(Array.isArray(paymentsCache) && paymentsCache.length) return paymentsCache.slice();
  const raw = localStorage.getItem(KEY_PAYMENTS);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePayments(list){
  paymentsCache = Array.isArray(list) ? list.slice() : [];
  localStorage.setItem(KEY_PAYMENTS, JSON.stringify(paymentsCache));
  paymentsDataSignature = hashRowsSignature(paymentsCache, paymentSignatureToken);
}

function paymentMatchPredicateFactory(ref){
  const localId = String(ref?.id || "").trim();
  const serverId = String(ref?.serverId || "").trim();
  const reservedId = String(ref?.reservedPaymentId || "").trim();
  const clientRequestId = String(ref?.clientRequestId || "").trim();
  const receiptNo = String(ref?.receiptNo || "").trim();
  return (row) => {
    const rowId = String(row?.id || "").trim();
    if(localId && rowId === localId) return true;
    if(serverId && rowId === serverId) return true;
    if(reservedId && rowId === reservedId) return true;
    if(clientRequestId && String(row?.clientRequestId || "").trim() === clientRequestId) return true;
    if(receiptNo && String(row?.receiptNo || "").trim() === receiptNo) return true;
    return false;
  };
}

function upsertPaymentCache(item){
  const list = getPayments();
  const match = paymentMatchPredicateFactory(item || {});
  const next = list.filter((row) => !match(row));
  next.unshift(item);
  next.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  savePayments(next);
}

function patchPaymentSyncState(ref, patch){
  const list = getPayments();
  const match = paymentMatchPredicateFactory(ref || {});
  let changed = false;
  const next = list.map((row) => {
    if(!match(row)) return row;
    changed = true;
    return { ...row, ...(patch || {}) };
  });
  if(changed){
    savePayments(next);
  }
  return changed;
}

function mergeLocalPrintMetadata(rows, localRows){
  const base = Array.isArray(rows) ? rows : [];
  const local = Array.isArray(localRows) ? localRows : [];
  if(!base.length || !local.length) return base.slice();

  const byId = new Map();
  const byClientReq = new Map();
  const byReceiptNo = new Map();
  const storeMax = (map, key, count) => {
    const k = String(key || "").trim();
    if(!k) return;
    const prev = normalizePrintCount(map.get(k));
    const next = normalizePrintCount(count);
    if(next > prev) map.set(k, next);
  };

  for(const row of local){
    const count = normalizePrintCount(row?.printCount);
    if(count <= 0) continue;
    storeMax(byId, row?.id, count);
    storeMax(byClientReq, row?.clientRequestId, count);
    storeMax(byReceiptNo, row?.receiptNo, count);
  }

  return base.map((row) => {
    const serverCount = normalizePrintCount(row?.printCount);
    const localCount = Math.max(
      normalizePrintCount(byId.get(String(row?.id || "").trim())),
      normalizePrintCount(byClientReq.get(String(row?.clientRequestId || "").trim())),
      normalizePrintCount(byReceiptNo.get(String(row?.receiptNo || "").trim()))
    );
    const mergedCount = Math.max(serverCount, localCount);
    if(mergedCount === serverCount && Boolean(row?.isCopy) === (serverCount >= 1)){
      return row;
    }
    return {
      ...row,
      printCount: mergedCount,
      isCopy: mergedCount >= 1
    };
  });
}

function removePaymentCreateOutboxByRef(ref){
  const queue = getOutboxEvents();
  const localId = String(ref?.id || "").trim();
  const reservedId = String(ref?.reservedPaymentId || "").trim();
  const clientRequestId = String(ref?.clientRequestId || "").trim();
  const receiptNo = String(ref?.receiptNo || "").trim();
  const next = queue.filter((evt) => {
    if(evt.type !== "PAYMENT_CREATE") return true;
    const payload = evt.payload || {};
    const evtLocalId = String(payload?.id || "").trim();
    const evtReserved = String(payload?.reservedPaymentId || "").trim();
    const evtClientReq = String(payload?.clientRequestId || "").trim();
    const evtReceiptNo = String(payload?.receiptNo || "").trim();
    if(localId && evtLocalId === localId) return false;
    if(reservedId && evtReserved === reservedId) return false;
    if(clientRequestId && evtClientReq === clientRequestId) return false;
    if(receiptNo && evtReceiptNo === receiptNo) return false;
    return true;
  });
  if(next.length !== queue.length){
    saveOutboxEvents(next);
  }
}

function upsertPaymentCreateOutboxEvent(payment){
  const queue = getOutboxEvents();
  const clientRequestId = String(payment?.clientRequestId || "").trim();
  const localId = String(payment?.id || "").trim();
  const existingIdx = queue.findIndex((evt) => {
    if(evt.type !== "PAYMENT_CREATE") return false;
    const payload = evt.payload || {};
    const evtClientReq = String(payload?.clientRequestId || "").trim();
    const evtLocalId = String(payload?.id || "").trim();
    if(clientRequestId && evtClientReq && evtClientReq === clientRequestId) return true;
    if(localId && evtLocalId && evtLocalId === localId) return true;
    return false;
  });
  const prev = existingIdx >= 0 ? queue[existingIdx] : null;
  const nextEvent = {
    id: prev?.id || (crypto?.randomUUID ? crypto.randomUUID() : `OUT-${Date.now()}-${Math.random()}`),
    type: "PAYMENT_CREATE",
    payload: { ...(prev?.payload || {}), ...(payment || {}) },
    createdAt: prev?.createdAt || new Date().toISOString(),
    status: "pending",
    syncAttempts: Number(prev?.syncAttempts || 0),
    nextRetryAt: null,
    lastError: ""
  };
  if(existingIdx >= 0) queue[existingIdx] = nextEvent;
  else queue.push(nextEvent);
  saveOutboxEvents(queue);
  return nextEvent;
}

function ensurePendingPaymentsInOutbox(){
  const currentPayments = getPayments();
  if(!currentPayments.length) return;
  let paymentsChanged = false;
  const normalizedPayments = currentPayments.map((row) => {
    if(!row?.pendingSync) return row;
    if(row?.clientRequestId) return row;
    paymentsChanged = true;
    return {
      ...row,
      clientRequestId: crypto?.randomUUID ? crypto.randomUUID() : `PAYREQ-${Date.now()}-${Math.random()}`
    };
  });
  if(paymentsChanged){
    savePayments(normalizedPayments);
  }
  const pendingPayments = (paymentsChanged ? normalizedPayments : currentPayments).filter((row) => Boolean(row?.pendingSync));
  if(!pendingPayments.length) return;
  const queue = getOutboxEvents();
  let queueChanged = false;
  for(const pending of pendingPayments){
    const pid = String(pending?.id || "").trim();
    const reservedId = String(pending?.reservedPaymentId || "").trim();
    const clientRequestId = String(pending?.clientRequestId || "").trim();
    const receiptNo = String(pending?.receiptNo || "").trim();
    const exists = queue.some((evt) => {
      if(evt.type !== "PAYMENT_CREATE") return false;
      const payload = evt.payload || {};
      const evtPid = String(payload?.id || "").trim();
      const evtReserved = String(payload?.reservedPaymentId || "").trim();
      const evtClientReq = String(payload?.clientRequestId || "").trim();
      const evtReceipt = String(payload?.receiptNo || "").trim();
      if(pid && evtPid === pid) return true;
      if(reservedId && evtReserved === reservedId) return true;
      if(clientRequestId && evtClientReq === clientRequestId) return true;
      if(receiptNo && evtReceipt === receiptNo) return true;
      return false;
    });
    if(exists) continue;
    queue.push({
      id: crypto?.randomUUID ? crypto.randomUUID() : `OUT-${Date.now()}-${Math.random()}`,
      type: "PAYMENT_CREATE",
      payload: { ...pending },
      createdAt: new Date().toISOString(),
      status: "pending",
      syncAttempts: Number(pending?.syncAttempts || 0),
      nextRetryAt: null,
      lastError: ""
    });
    queueChanged = true;
  }
  if(queueChanged){
    saveOutboxEvents(queue);
  }
}

function normalizeSex(sex){
  const v = String(sex || "").trim().toUpperCase();
  return v === "M" || v === "F" ? v : "";
}

// When the server changes a student's identity (id/matricule), keep the local
// payment cache pointing at the new identity so receipts and reports stay linked.
function remapStudentIdentityAcrossLocalPayments(previousStudentId, updatedStudent){
  const prevId = String(previousStudentId || "").trim();
  const nextId = String(updatedStudent?.id || "").trim();
  if(!prevId || !nextId || prevId === nextId) return;
  const current = getPayments();
  let changed = false;
  const next = current.map((row) => {
    if(String(row?.studentId || "") !== prevId) return row;
    changed = true;
    return {
      ...row,
      studentId: nextId,
      matricule: updatedStudent?.matricule || nextId,
      studentName: updatedStudent?.fullName || updatedStudent?.name || row.studentName
    };
  });
  if(changed) savePayments(next);
}

function applySyncedPaymentRecord(localPayment, serverPaymentRow){
  const normalized = normalizeReceiptApiRow(serverPaymentRow);
  const clientRequestId = String(localPayment?.clientRequestId || normalized?.clientRequestId || "").trim() || null;
  const mergedPrintCount = Math.max(
    normalizePrintCount(localPayment?.printCount),
    normalizePrintCount(normalized?.printCount)
  );
  const merged = {
    ...normalized,
    printCount: mergedPrintCount,
    isCopy: mergedPrintCount >= 1,
    pendingSync: false,
    clientRequestId,
    syncError: "",
    syncAttempts: 0,
    syncLastErrorAt: null
  };
  const removeRef = {
    id: localPayment?.id || null,
    serverId: merged.id,
    reservedPaymentId: localPayment?.reservedPaymentId || null,
    clientRequestId: clientRequestId || null,
    receiptNo: merged.receiptNo || localPayment?.receiptNo || null
  };
  const current = getPayments();
  const match = paymentMatchPredicateFactory(removeRef);
  const next = current.filter((row) => !match(row));
  next.unshift(merged);
  next.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  savePayments(next);
  setReceiptsApiCache([merged, ...receiptsApiCache.filter((row) => !match(row))]);
  removePaymentCreateOutboxByRef(removeRef);
  syncReceiptSeqFromPaymentsCache();
  setTopReceiptPreview();
  reportsSummaryApiCache.clear();
  busReportApiCache.clear();
  dailyEntriesReportApiCache.clear();
  lateStudentsReportApiCache.clear();
  lastReceiptForPrint = merged;
  return merged;
}

function pruneSyncedPaymentOutboxEvents(serverRows){
  const rows = Array.isArray(serverRows) ? serverRows : [];
  if(!rows.length) return;
  const serverIds = new Set(rows.map((r) => String(r?.id || "").trim()).filter(Boolean));
  const serverClientReqIds = new Set(rows.map((r) => String(r?.clientRequestId || "").trim()).filter(Boolean));
  const serverReceiptNos = new Set(rows.map((r) => String(r?.receiptNo || "").trim()).filter(Boolean));
  const queue = getOutboxEvents();
  const next = queue.filter((evt) => {
    if(evt.type !== "PAYMENT_CREATE") return true;
    const payload = evt.payload || {};
    const evtReserved = String(payload?.reservedPaymentId || "").trim();
    const evtClientReq = String(payload?.clientRequestId || "").trim();
    const evtReceiptNo = String(payload?.receiptNo || "").trim();
    if(evtReserved && serverIds.has(evtReserved)) return false;
    if(evtClientReq && serverClientReqIds.has(evtClientReq)) return false;
    if(evtReceiptNo && serverReceiptNos.has(evtReceiptNo)) return false;
    return true;
  });
  if(next.length !== queue.length){
    saveOutboxEvents(next);
  }
}

function setReceiptsApiCache(list){
  receiptsApiCache = Array.isArray(list) ? list.slice() : [];
  receiptsDataSignature = hashRowsSignature(receiptsApiCache, receiptSignatureToken);
}

function syncReceiptSeqFromPaymentsCache(){
  const payments = getPayments();
  const activeReceiptYear = Number(getActiveReceiptYear());
  let maxSeq = 0;
  for(const p of payments){
    const parts = extractReceiptNoParts(p?.receiptNo);
    if(!parts || parts.year !== activeReceiptYear) continue;
    if(parts.seq > maxSeq) maxSeq = parts.seq;
  }
  setReceiptSeq(maxSeq > 0 ? (maxSeq + 1) : 1);
  setTopReceiptPreview();
}

async function loadPaymentsFromApi(){
  // Several views depend on the same complete payment history. Reuse an active
  // request so navigation, timers and post-write refreshes cannot download and
  // parse the large payload concurrently.
  if(paymentsLoadPromise) return paymentsLoadPromise;
  paymentsLoadPromise = (async () => {
    try{
      const rows = await apiFetch("/api/payments");
      if(Array.isArray(rows)){
        const localSnapshot = getPayments();
        const normalized = mergeLocalPrintMetadata(
          rows.map((r) => normalizeReceiptApiRow(r)),
          localSnapshot
        );
      pruneSyncedPaymentOutboxEvents(normalized);
      const pendingLocal = localSnapshot.filter((p) => Boolean(p?.pendingSync));
      const merged = normalized.slice();
      const serverIds = new Set(merged.map((p) => String(p?.id || "").trim()).filter(Boolean));
      const serverClientReqIds = new Set(merged.map((p) => String(p?.clientRequestId || "").trim()).filter(Boolean));
      const serverReceiptNos = new Set(merged.map((p) => String(p?.receiptNo || "").trim()).filter(Boolean));
      for(const localPay of pendingLocal){
        const localId = String(localPay?.id || "").trim();
        const localReserved = String(localPay?.reservedPaymentId || "").trim();
        const localClientReq = String(localPay?.clientRequestId || "").trim();
        const localReceiptNo = String(localPay?.receiptNo || "").trim();
        const alreadySynced =
          (localId && serverIds.has(localId)) ||
          (localReserved && serverIds.has(localReserved)) ||
          (localClientReq && serverClientReqIds.has(localClientReq)) ||
          (localReceiptNo && serverReceiptNos.has(localReceiptNo));
        if(!alreadySynced){
          merged.unshift(localPay);
        }
      }

      const nextSig = hashRowsSignature(merged, paymentSignatureToken);
      const changed = nextSig !== paymentsDataSignature;
      if(changed){
        savePayments(merged);
        syncReceiptSeqFromPaymentsCache();
      }
        apiReachable = true;
        paymentsLastLoadedAt = Date.now();
        updateSyncBadge();
        return changed;
      }
      apiReachable = true;
      updateSyncBadge();
      return false;
    }catch(err){
      if(String(err?.message || "").toLowerCase().includes("session")) throw err;
      return false;
    }
  })().finally(() => {
    paymentsLoadPromise = null;
  });
  return paymentsLoadPromise;
}

function getSpendings(){
  const raw = localStorage.getItem(KEY_SPENDINGS);
  if(raw){
    try { return JSON.parse(raw) || []; } catch {}
  }
  const legacy = localStorage.getItem(KEY_SPENDINGS_LEGACY);
  try {
    const migrated = legacy ? JSON.parse(legacy) : [];
    if(Array.isArray(migrated)){
      localStorage.setItem(KEY_SPENDINGS, JSON.stringify(migrated));
      return migrated;
    }
  } catch {}
  return [];
}

function spendingExplicitMonthKey(spendingLike){
  const mk = String(
    spendingLike?.appliesToMonth
    || spendingLike?.applies_to_month
    || spendingLike?.monthKey
    || ""
  ).trim();
  return /^\d{4}-\d{2}$/.test(mk) ? mk : "";
}

function spendingTargetMonthKey(spendingLike){
  const directSchoolYear = normalizeSchoolYearStartYear(spendingLike?.schoolYearStartYear);
  const explicitMonthKey = spendingExplicitMonthKey(spendingLike);
  if(explicitMonthKey && (!directSchoolYear || monthKeyBelongsToSchoolYear(explicitMonthKey, directSchoolYear))){
    return explicitMonthKey;
  }
  const dateMonthKey = monthKeyFromDateISO(spendingEffectiveDateISO(spendingLike));
  if(dateMonthKey && (!directSchoolYear || monthKeyBelongsToSchoolYear(dateMonthKey, directSchoolYear))){
    return dateMonthKey;
  }
  const bounds = buildSchoolYearMonthBounds(directSchoolYear);
  return bounds?.startMonth || explicitMonthKey || dateMonthKey || "";
}

function spendingSchoolYearStartYear(spendingLike){
  const direct = normalizeSchoolYearStartYear(spendingLike?.schoolYearStartYear);
  if(direct) return direct;
  const targetMonthKey = spendingExplicitMonthKey(spendingLike);
  if(targetMonthKey){
    const derived = schoolYearStartYearFromMonthKey(targetMonthKey);
    if(derived) return derived;
  }
  const dateIso = spendingEffectiveDateISO(spendingLike);
  const m = String(dateIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
  if(!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if(!(Number.isFinite(year) && Number.isFinite(month))) return null;
  return month >= 9 ? year : (year - 1);
}

function getSchoolYearScopedSpendings(list = null, schoolYearStartYear = null){
  const rows = Array.isArray(list) ? list.slice() : getSpendings().slice();
  const targetYear = normalizeSchoolYearStartYear(schoolYearStartYear)
    || normalizeSchoolYearStartYear(getActiveSchoolYearStartYear());
  if(!targetYear) return rows;
  return rows.filter((spending) => spendingSchoolYearStartYear(spending) === targetYear);
}

function saveSpendings(list){
  const safeList = Array.isArray(list) ? list.slice() : [];
  localStorage.setItem(KEY_SPENDINGS, JSON.stringify(safeList));
  spendingsDataSignature = hashRowsSignature(safeList, spendingSignatureToken);
  if(typeof syncReportTypeOptions === "function"){
    syncReportTypeOptions({ keepCurrent: true });
  }
  updateSyncBadge();
}

function pruneOrphanPendingSpendings(){
  const pendingCreateIds = new Set(
    getOutboxEvents()
      .filter((evt) => evt?.type === "SPENDING_CREATE" && evt?.status !== "sent")
      .map((evt) => String(evt?.payload?.clientTempId || evt?.payload?.id || "").trim())
      .filter(Boolean)
  );
  const current = getSpendings();
  const next = current.filter((s) => {
    if(!s?.pendingSync) return true;
    const sid = String(s?.id || "").trim();
    return sid && pendingCreateIds.has(sid);
  });
  if(next.length === current.length) return false;
  saveSpendings(next);
  return true;
}

function upsertSpendingCache(item){
  const list = getSpendings();
  const idx = list.findIndex(s => String(s.id) === String(item.id));
  if(idx >= 0) list[idx] = item;
  else list.unshift(item);
  list.sort((a,b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
  saveSpendings(list);
}

function removeSpendingFromCache(id){
  saveSpendings(getSpendings().filter(s => String(s.id) !== String(id)));
}

function getCaisseTransfers(){
  const raw = localStorage.getItem(KEY_CAISSE_TRANSFERS);
  if(!raw) return [];
  try{
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(_){
    return [];
  }
}

function caisseTransferDateISO(transferLike){
  return spendingDateISO({ date: transferLike?.date || transferLike?.createdAt || "" });
}

function caisseTransferTargetMonthKey(transferLike){
  const directMonth = String(transferLike?.appliesToMonth || transferLike?.applies_to_month || "").trim();
  if(/^\d{4}-\d{2}$/.test(directMonth)) return directMonth;
  const schoolYearStart = normalizeSchoolYearStartYear(transferLike?.schoolYearStartYear);
  const dateMonthKey = monthKeyFromDateISO(caisseTransferDateISO(transferLike));
  if(dateMonthKey && (!schoolYearStart || monthKeyBelongsToSchoolYear(dateMonthKey, schoolYearStart))){
    return dateMonthKey;
  }
  const bounds = buildSchoolYearMonthBounds(schoolYearStart);
  return bounds?.startMonth || directMonth || "";
}

function caisseTransferSchoolYearStartYear(transferLike){
  const direct = normalizeSchoolYearStartYear(transferLike?.schoolYearStartYear);
  if(direct) return direct;
  const targetMonthKey = caisseTransferTargetMonthKey(transferLike);
  if(targetMonthKey){
    const derived = schoolYearStartYearFromMonthKey(targetMonthKey);
    if(derived) return derived;
  }
  const dateIso = caisseTransferDateISO(transferLike);
  const m = String(dateIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
  if(!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if(!(Number.isFinite(year) && Number.isFinite(month))) return null;
  return month >= 9 ? year : (year - 1);
}

function normalizeCaisseTransferApiRow(item){
  return {
    ...item,
    date: caisseTransferDateISO(item),
    mode: String(item?.mode || "").trim().toLowerCase() === "exchange" ? "exchange" : "transfer",
    sourceBoxKey: String(item?.sourceBoxKey || "").trim(),
    counterpartyBoxKey: String(item?.counterpartyBoxKey || "").trim(),
    sourceCurrency: normalizeCurrencyCode(item?.sourceCurrency || "USD"),
    sourceAmount: Number(item?.sourceAmount || 0),
    counterCurrency: item?.counterCurrency == null ? null : normalizeCurrencyCode(item?.counterCurrency || "USD"),
    counterAmount: Number(item?.counterAmount || 0),
    fxRate: item?.fxRate == null ? null : Number(item.fxRate),
    note: String(item?.note || "").trim(),
    appliesToMonth: caisseTransferTargetMonthKey(item) || null,
    schoolYearStartYear: caisseTransferSchoolYearStartYear(item),
    createdByUsername: item?.createdByUsername || item?.cashier || "-",
    createdAt: item?.createdAt || new Date().toISOString()
  };
}

function getSchoolYearScopedCaisseTransfers(list = null, schoolYearStartYear = null){
  const rows = Array.isArray(list) ? list.slice() : getCaisseTransfers().slice();
  const targetYear = normalizeSchoolYearStartYear(schoolYearStartYear)
    || normalizeSchoolYearStartYear(getActiveSchoolYearStartYear());
  if(!targetYear) return rows;
  return rows.filter((row) => caisseTransferSchoolYearStartYear(row) === targetYear);
}

function saveCaisseTransfers(list){
  const safeList = Array.isArray(list) ? list.slice() : [];
  localStorage.setItem(KEY_CAISSE_TRANSFERS, JSON.stringify(safeList));
  caisseTransfersDataSignature = hashRowsSignature(safeList, caisseTransferSignatureToken);
}

function upsertCaisseTransferCache(item){
  const normalized = normalizeCaisseTransferApiRow(item);
  const list = getCaisseTransfers();
  const idx = list.findIndex((row) => String(row.id) === String(normalized.id));
  if(idx >= 0) list[idx] = normalized;
  else list.unshift(normalized);
  list.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
  saveCaisseTransfers(list);
}

function removeCaisseTransferFromCache(id){
  saveCaisseTransfers(getCaisseTransfers().filter((row) => String(row.id) !== String(id)));
}

function paymentFeeCode(paymentLike){
  const directCode = String(paymentLike?.feeTypeCode || paymentLike?.fee_type_code || "").trim().toUpperCase();
  if(directCode) return directCode;
  const byId = findFeeTypeById(paymentLike?.feeTypeId ?? paymentLike?.fee_type_id ?? null);
  if(String(byId?.code || "").trim()) return String(byId.code).trim().toUpperCase();
  const byLabel = findFeeTypeByLabel(paymentLike?.feeType || paymentLike?.feeTypeLabel || getLiveFeeLabel(paymentLike));
  return String(byLabel?.code || "").trim().toUpperCase();
}

function paymentCashFeeCode(paymentLike){
  const receiptCode = String(paymentLike?.receiptDoc?.cashAllocation?.code || "").trim().toUpperCase();
  if(receiptCode) return receiptCode;
  const directCode = String(paymentLike?.cashFeeTypeCode || paymentLike?.cash_fee_type_code || "").trim().toUpperCase();
  if(directCode) return directCode;
  const byId = findFeeTypeById(paymentLike?.cashFeeTypeId ?? paymentLike?.cash_fee_type_id ?? null);
  if(String(byId?.code || "").trim()) return String(byId.code).trim().toUpperCase();
  const byLabel = findFeeTypeByLabel(paymentLike?.cashFeeType || paymentLike?.cash_fee_type || "");
  if(String(byLabel?.code || "").trim()) return String(byLabel.code).trim().toUpperCase();
  return paymentFeeCode(paymentLike);
}

function caisseBoxMatchesFeeCode(box, feeCode){
  const code = String(feeCode || "").trim().toUpperCase();
  if(!code || !box) return false;
  const directCodes = Array.isArray(box.codes) ? box.codes.map((c) => String(c || "").toUpperCase()) : [];
  if(directCodes.includes(code)) return true;
  const prefixes = Array.isArray(box.codePrefixes) ? box.codePrefixes.map((c) => String(c || "").toUpperCase()) : [];
  return prefixes.some((prefix) => prefix && code.startsWith(prefix));
}

function dynamicCaisseBoxKeyFromFeeCode(feeCode){
  const code = String(feeCode || "").trim().toUpperCase();
  if(!code) return "";
  return `fee_${code.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function getDynamicCaisseBoxDefinitions(){
  const rows = getFeeTypeObjects();
  const out = [];
  for(const ft of rows){
    const code = String(ft?.code || "").trim().toUpperCase();
    if(!code || code === "TUITION") continue;
    const coveredByBase = BASE_CAISSE_BOX_DEFINITIONS.some((box) => caisseBoxMatchesFeeCode(box, code));
    if(coveredByBase) continue;
    const key = dynamicCaisseBoxKeyFromFeeCode(code);
    if(!key) continue;
    out.push({
      key,
      label: normalizeFeeName(ft?.labelFr || code),
      codeTag: code,
      codes: [code],
      dynamic: true
    });
  }
  return out;
}

function getCaisseBoxDefinitions(){
  return [...BASE_CAISSE_BOX_DEFINITIONS, ...getDynamicCaisseBoxDefinitions()];
}

function isVisibleCaisseBoxKey(boxKey){
  const safeKey = String(boxKey || "").trim();
  return !!safeKey && !HIDDEN_RETIRED_CAISSE_BOX_KEYS.has(safeKey);
}

function findCaisseBoxDefinitionByKey(key){
  const safeKey = String(key || "").trim();
  if(!safeKey) return null;
  return getCaisseBoxDefinitions().find((row) => row.key === safeKey) || null;
}

function caisseSpendingCategoryLabel(boxLike){
  const label = String(boxLike?.label || "").trim() || "Caisse";
  const codeTag = String(boxLike?.codeTag || "").trim().toUpperCase();
  if(codeTag){
    return `Caisse [${codeTag}] - ${label}`;
  }
  return `Caisse - ${label}`;
}

function explicitCaisseBoxKeyFromSpending(spending){
  const explicitKey = String(spending?.caisseBoxKey || spending?.caisse_box_key || "").trim();
  if(explicitKey && findCaisseBoxDefinitionByKey(explicitKey)){
    return explicitKey;
  }
  const categoryRaw = stripStatePaidSpendingPrefix(spending?.category || "");
  const codeTagged = categoryRaw.match(/^Caisse\s*\[([A-Za-z0-9_]+)\]\s*-/i);
  if(codeTagged){
    const taggedCode = String(codeTagged[1] || "").trim().toUpperCase();
    const taggedBox = getCaisseBoxDefinitions().find((box) => {
      const boxTag = String(box?.codeTag || "").trim().toUpperCase();
      return boxTag === taggedCode || caisseBoxMatchesFeeCode(box, taggedCode);
    });
    if(taggedBox) return taggedBox.key;
  }
  const categoryNorm = normalizeTextAscii(categoryRaw);
  if(!categoryNorm) return "";
  // Backward-compatibility for already saved categories before the merge.
  if(
    categoryNorm === normalizeTextAscii("Caisse - Frais technique")
    || categoryNorm === normalizeTextAscii("Caisse - Frais de l'Etat (toutes tranches)")
  ){
    return "frais_etat_tranches";
  }
  for(const box of getCaisseBoxDefinitions()){
    if(categoryNorm === normalizeTextAscii(caisseSpendingCategoryLabel(box))){
      return box.key;
    }
  }
  return "";
}

function caisseBoxKeyFromSpending(spending, { includeImplicitMinerval = false } = {}){
  const explicitKey = explicitCaisseBoxKeyFromSpending(spending);
  if(explicitKey) return explicitKey;
  return includeImplicitMinerval ? "minerval" : "";
}

function isCaisseSpendingRecord(spending){
  return Boolean(explicitCaisseBoxKeyFromSpending(spending));
}

function getCaisseSpendingRows(){
  return getSchoolYearScopedSpendings()
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
}

function buildEmptyCaisseSnapshot(box){
  return {
    ...box,
    entry: { usd: 0, cdf: 0 },
    exit: { usd: 0, cdf: 0 },
    net: { usd: 0, cdf: 0 }
  };
}

function getCaisseBoxSnapshots(dateIso = toDateISO(new Date())){
  const safeDate = String(dateIso || "").trim();
  const defs = getCaisseBoxDefinitions();
  const byKey = new Map(defs.map((box) => [box.key, buildEmptyCaisseSnapshot(box)]));
  const ensureSnapshot = (boxKey) => {
    const safeKey = String(boxKey || "").trim();
    if(!safeKey) return null;
    const existing = byKey.get(safeKey);
    if(existing) return existing;
    const def = findCaisseBoxDefinitionByKey(safeKey) || { key: safeKey, label: safeKey, codes: [] };
    const created = buildEmptyCaisseSnapshot(def);
    byKey.set(safeKey, created);
    return created;
  };

  for(const payment of getPayments()){
    if(!isCashPaymentRecord(payment)) continue;
    // Cancelled mixed-tender receipts retain their USD/CDF tender breakdown for
    // audit and receipt history. Never treat that retained breakdown as cash
    // still present in the caisse.
    if(payment?.cancelled || payment?.cancelledAt || payment?.cancelled_at) continue;
    const paymentDateIso = toDateISO(payment?.createdAt || new Date());
    if(/^\d{4}-\d{2}-\d{2}$/.test(safeDate) && (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDateIso) || paymentDateIso > safeDate)){
      continue;
    }
    const code = paymentCashFeeCode(payment);
    if(!code) continue;
    for(const box of defs){
      if(!caisseBoxMatchesFeeCode(box, code)) continue;
      const target = ensureSnapshot(box.key);
      if(!target) continue;
      const part = paymentAmountSplit(payment);
      target.entry.usd += Number(part.usd || 0);
      target.entry.cdf += Number(part.cdf || 0);
      break;
    }
  }

  for(const spending of getSchoolYearScopedSpendings()){
    const spendingDateIso = spendingEffectiveDateISO(spending);
    if(/^\d{4}-\d{2}-\d{2}$/.test(safeDate) && (!/^\d{4}-\d{2}-\d{2}$/.test(spendingDateIso) || spendingDateIso > safeDate)){
      continue;
    }
    const boxKey = caisseBoxKeyFromSpending(spending, { includeImplicitMinerval: true });
    if(!boxKey) continue;
    const target = ensureSnapshot(boxKey);
    if(!target) continue;
    const part = spendingAmountSplit(spending);
    target.exit.usd += Number(part.usd || 0);
    target.exit.cdf += Number(part.cdf || 0);
  }

  for(const transfer of getSchoolYearScopedCaisseTransfers()){
    const transferDateIso = caisseTransferDateISO(transfer);
    if(/^\d{4}-\d{2}-\d{2}$/.test(safeDate) && (!/^\d{4}-\d{2}-\d{2}$/.test(transferDateIso) || transferDateIso > safeDate)){
      continue;
    }
    const sourceKey = String(transfer?.sourceBoxKey || "").trim();
    const counterpartyKey = String(transfer?.counterpartyBoxKey || "").trim();
    const sourceCurrency = normalizeCurrencyCode(transfer?.sourceCurrency || "USD");
    const counterCurrency = transfer?.counterCurrency == null ? null : normalizeCurrencyCode(transfer?.counterCurrency || "USD");
    const sourceAmount = Number(transfer?.sourceAmount || 0);
    const counterAmount = Number(transfer?.counterAmount || 0);
    const sourceSnapshot = ensureSnapshot(sourceKey);
    const counterpartySnapshot = ensureSnapshot(counterpartyKey);
    if(sourceSnapshot){
      if(sourceCurrency === "CDF") sourceSnapshot.exit.cdf += Math.round(sourceAmount || 0);
      else sourceSnapshot.exit.usd += Number(sourceAmount || 0);
    }
    if(counterpartySnapshot){
      if(sourceCurrency === "CDF") counterpartySnapshot.entry.cdf += Math.round(sourceAmount || 0);
      else counterpartySnapshot.entry.usd += Number(sourceAmount || 0);
    }
    if(String(transfer?.mode || "").trim().toLowerCase() === "exchange" && counterCurrency && counterAmount > 0){
      if(counterpartySnapshot){
        if(counterCurrency === "CDF") counterpartySnapshot.exit.cdf += Math.round(counterAmount || 0);
        else counterpartySnapshot.exit.usd += Number(counterAmount || 0);
      }
      if(sourceSnapshot){
        if(counterCurrency === "CDF") sourceSnapshot.entry.cdf += Math.round(counterAmount || 0);
        else sourceSnapshot.entry.usd += Number(counterAmount || 0);
      }
    }
  }

  const rows = [];
  for(const box of defs){
    const target = byKey.get(box.key);
    if(!target) continue;
    target.net.usd = Number((Number(target.entry.usd || 0) - Number(target.exit.usd || 0)).toFixed(2));
    target.net.cdf = Math.round(Number(target.entry.cdf || 0) - Number(target.exit.cdf || 0));
    rows.push(target);
  }
  return rows;
}

function renderCaisseHistory(){
  if(!caisseHistoryTbody) return;
  const allRows = getCaisseSpendingRows();
  const showActionColumn = canDeleteSpending();
  const actionColspan = showActionColumn ? 9 : 8;
  const caisseHistoryActionHeader = document.getElementById("caisseHistoryActionHeader");
  if(caisseHistoryActionHeader){
    caisseHistoryActionHeader.style.display = showActionColumn ? "" : "none";
  }
  // Pré-calcule l'affichage + un texte de recherche par ligne.
  const prepared = allRows.map((s) => {
    const key = caisseBoxKeyFromSpending(s, { includeImplicitMinerval: true });
    const box = findCaisseBoxDefinitionByKey(key);
    const baseLabel = String(box?.label || stripStatePaidSpendingPrefix(s?.category || "") || "Caisse");
    const label = isStatePaidSpending(s) ? `${STATE_PAID_SPENDING_PREFIX}${baseLabel}` : baseLabel;
    const currency = normalizeCurrencyCode(s.currency || "USD");
    const amount = Number(s.amount || 0);
    const amountUSD = currency === "USD" ? formatUSD(amount) : "-";
    const amountCDF = currency === "CDF" ? `${formatIntSpaced(Math.round(amount))} CDF` : "-";
    const dateIso = spendingEffectiveDateISO(s);
    const dateLabel = dateIso ? formatEnrollmentDate(dateIso) : "-";
    const monthLabel = monthLabelFromMonthKeyWithYear(spendingTargetMonthKey(s) || "") || "-";
    const cashier = String(s.createdByUsername || s.cashier || "-");
    const haystack = normalizeTextAscii(
      [dateLabel, label, monthLabel, s.description || "", currency, String(amount), amountUSD, amountCDF, cashier].join(" ")
    ).toLowerCase();
    return { s, label, currency, amountUSD, amountCDF, dateLabel, monthLabel, cashier, haystack };
  });
  const q = normalizeTextAscii(String(caisseHistorySearchQuery || "")).toLowerCase().trim();
  const filtered = q ? prepared.filter((r) => r.haystack.includes(q)) : prepared;

  if(!(caisseHistoryVisibleLimit >= CAISSE_HISTORY_PAGE)) caisseHistoryVisibleLimit = CAISSE_HISTORY_PAGE;
  const visible = filtered.slice(0, caisseHistoryVisibleLimit);

  if(caisseHistoryCount){
    caisseHistoryCount.textContent = q
      ? `${filtered.length} / ${allRows.length} depense(s)`
      : `${allRows.length} depense(s)`;
  }
  if(!filtered.length){
    caisseHistoryTbody.innerHTML = `<tr><td colspan="${actionColspan}" class="tiny">${q ? "Aucune depense ne correspond a la recherche." : "Aucune depense caisse."}</td></tr>`;
    if(caisseHistoryMoreBtn) caisseHistoryMoreBtn.style.display = "none";
    return;
  }
  caisseHistoryTbody.innerHTML = visible.map(({ s, label, currency, amountUSD, amountCDF, dateLabel, monthLabel, cashier }) => `
      <tr>
        <td>${esc(dateLabel)}</td>
        <td>${esc(label)}</td>
        <td>${esc(monthLabel)}</td>
        <td>${esc(s.description || "-")} ${s.pendingSync ? '<span class="tiny" style="color:#a16207">• Sync en attente</span>' : ''}</td>
        <td>${esc(currency)}</td>
        <td>${amountUSD}</td>
        <td>${amountCDF}</td>
        <td>${esc(cashier)}</td>
        ${showActionColumn ? `<td data-caisse-history-action-cell="1"><button class="btn danger" data-caisse-sp-delete="${esc(s.id)}">Supprimer</button></td>` : ""}
      </tr>
    `).join("");
  if(caisseHistoryMoreBtn){
    const remaining = filtered.length - visible.length;
    if(remaining > 0){
      caisseHistoryMoreBtn.style.display = "";
      caisseHistoryMoreBtn.textContent = `Voir plus (${remaining} de plus)`;
    } else {
      caisseHistoryMoreBtn.style.display = "none";
    }
  }
}

const PARENT_CHANGE_TRANSFER_MODE = "parent_change";
const PARENT_CHANGE_TRANSFER_NOTE_PREFIX = "Change parent";
const PARENT_CHANGE_COUNTERPARTY_BOX_KEY = "external_parent_change";

function normalizeCaisseTransferMode(mode){
  const raw = String(mode || "").trim().toLowerCase();
  if(raw === PARENT_CHANGE_TRANSFER_MODE || raw === "parent-change" || raw === "change_parent") return PARENT_CHANGE_TRANSFER_MODE;
  if(raw === "exchange") return "exchange";
  return "transfer";
}

function isCaisseExchangeMode(mode){
  const normalized = normalizeCaisseTransferMode(mode);
  return normalized === "exchange" || normalized === PARENT_CHANGE_TRANSFER_MODE;
}

function isParentChangeTransferNote(note){
  return normalizeTextAscii(String(note || "")).toLowerCase().startsWith("change parent");
}

function transferModeLabelFr(mode, note = ""){
  const normalized = normalizeCaisseTransferMode(mode);
  if(normalized === PARENT_CHANGE_TRANSFER_MODE) return "Change parent";
  if(normalized === "exchange" && isParentChangeTransferNote(note)) return "Change parent";
  return normalized === "exchange" ? "Change" : "Transfert";
}

function computeTransferCounterAmount(sourceAmount, sourceCurrency, counterCurrency, rate){
  const amount = Number(sourceAmount || 0);
  const fxRate = Number(rate || 0);
  const from = normalizeCurrencyCode(sourceCurrency || "USD");
  const to = normalizeCurrencyCode(counterCurrency || from);
  if(!(amount > 0)) return 0;
  if(from === to) return from === "CDF" ? Math.round(amount) : Number(amount.toFixed(2));
  if(!(fxRate > 0)) return 0;
  if(from === "USD" && to === "CDF") return Math.round(amount * fxRate);
  if(from === "CDF" && to === "USD") return Number((amount / fxRate).toFixed(2));
  return 0;
}

function renderCaisseTransferHistory(){
  if(!caisseTransferTbody) return;
  const allRows = getSchoolYearScopedCaisseTransfers()
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
  const showActionColumn = hasRole("admin");
  const actionColspan = showActionColumn ? 8 : 7;
  const caisseTransferActionHeader = document.getElementById("caisseTransferActionHeader");
  if(caisseTransferActionHeader){
    caisseTransferActionHeader.style.display = showActionColumn ? "" : "none";
  }
  const prepared = allRows.map((row) => {
    const sourceBox = findCaisseBoxDefinitionByKey(row?.sourceBoxKey);
    const counterpartyBox = findCaisseBoxDefinitionByKey(row?.counterpartyBoxKey);
    const appliedMonthKey = caisseTransferTargetMonthKey(row);
    const sourceLabel = sourceBox?.label || row?.sourceBoxKey || "-";
    const counterpartyLabel = String(row?.counterpartyBoxKey || "").trim() === PARENT_CHANGE_COUNTERPARTY_BOX_KEY
      ? "Parent"
      : counterpartyBox?.label || row?.counterpartyBoxKey || "-";
    const sent = formatMoney(Number(row?.sourceAmount || 0), row?.sourceCurrency || "USD");
    const receivedCurrency = row?.counterCurrency || row?.sourceCurrency || "USD";
    const receivedAmount = isCaisseExchangeMode(row?.mode)
      ? Number(row?.counterAmount || 0)
      : Number(row?.sourceAmount || 0);
    const received = formatMoney(receivedAmount, receivedCurrency);
    const rateText = row?.fxRate ? `Taux 1 USD = ${formatIntSpaced(Math.round(Number(row.fxRate || 0)))} CDF` : "";
    const detailParts = isCaisseExchangeMode(row?.mode)
      ? [`Envoie ${sent}`, `Recoit ${received}`, rateText, String(row?.note || "").trim()]
      : [`Transfere ${sent}`, String(row?.note || "").trim()];
    const details = detailParts.filter(Boolean).join(" • ");
    const cashier = String(row?.createdByUsername || row?.cashier || "-");
    const modeLabel = transferModeLabelFr(row?.mode, row?.note);
    const dateLabel = caisseTransferDateISO(row) ? formatEnrollmentDate(caisseTransferDateISO(row)) : "-";
    const monthLabel = monthLabelFromMonthKeyWithYear(appliedMonthKey || "") || "-";
    const haystack = normalizeTextAscii(
      [dateLabel, modeLabel, sourceLabel, counterpartyLabel, monthLabel, details, cashier].join(" ")
    ).toLowerCase();
    return { row, modeLabel, sourceLabel, counterpartyLabel, monthLabel, details, cashier, dateLabel, haystack };
  });
  const q = normalizeTextAscii(String(caisseTransferSearchQuery || "")).toLowerCase().trim();
  const filtered = q ? prepared.filter((r) => r.haystack.includes(q)) : prepared;
  if(!(caisseTransferVisibleLimit >= CAISSE_HISTORY_PAGE)) caisseTransferVisibleLimit = CAISSE_HISTORY_PAGE;
  const visible = filtered.slice(0, caisseTransferVisibleLimit);
  if(caisseTransferCount){
    caisseTransferCount.textContent = q
      ? `${filtered.length} / ${allRows.length} mouvement(s)`
      : `${allRows.length} mouvement(s)`;
  }
  if(!filtered.length){
    caisseTransferTbody.innerHTML = `<tr><td colspan="${actionColspan}" class="tiny">${q ? "Aucun mouvement ne correspond a la recherche." : "Aucun transfert ou change caisse."}</td></tr>`;
    if(caisseTransferMoreBtn) caisseTransferMoreBtn.style.display = "none";
    return;
  }
  caisseTransferTbody.innerHTML = visible.map(({ row, modeLabel, sourceLabel, counterpartyLabel, monthLabel, details, cashier, dateLabel }) => `
      <tr>
        <td>${esc(dateLabel)}</td>
        <td>${esc(modeLabel)}</td>
        <td>${esc(sourceLabel)}</td>
        <td>${esc(counterpartyLabel)}</td>
        <td>${esc(monthLabel)}</td>
        <td>${esc(details)}</td>
        <td>${esc(cashier)}</td>
        ${showActionColumn ? `<td><button class="btn danger" data-caisse-transfer-delete="${esc(row.id)}">Supprimer</button></td>` : ""}
      </tr>
    `).join("");
  if(caisseTransferMoreBtn){
    const remaining = filtered.length - visible.length;
    if(remaining > 0){ caisseTransferMoreBtn.style.display = ""; caisseTransferMoreBtn.textContent = `Voir plus (${remaining} de plus)`; }
    else caisseTransferMoreBtn.style.display = "none";
  }
}

function getCaisseTransferSelectCandidates(){
  return getCaisseBoxSnapshots().filter((row) => isVisibleCaisseBoxKey(row?.key)).map((row) => ({
    key: row.key,
    label: row.label || row.key,
    net: {
      usd: Math.max(0, Number(row.net?.usd || 0)),
      cdf: Math.max(0, Number(row.net?.cdf || 0))
    }
  }));
}

function syncCaisseTransferModeUi(){
  const mode = normalizeCaisseTransferMode(caisseTransferMode?.value || "exchange");
  const isExchange = isCaisseExchangeMode(mode);
  const isParentChange = mode === PARENT_CHANGE_TRANSFER_MODE;
  if(isParentChange){
    if(caisseTransferSourceCurrency) caisseTransferSourceCurrency.value = "CDF";
    if(caisseTransferCounterCurrency) caisseTransferCounterCurrency.value = "USD";
    if(caisseTransferAmount) caisseTransferAmount.placeholder = "Ex: 24 000";
  }else if(caisseTransferAmount){
    caisseTransferAmount.placeholder = "Ex: 10";
  }
  const counterpartyField = caisseTransferCounterpartyBox?.closest ? caisseTransferCounterpartyBox.closest(".field") : null;
  if(counterpartyField){
    counterpartyField.style.display = isParentChange ? "none" : "";
  }
  if(caisseTransferCounterCurrencyField){
    caisseTransferCounterCurrencyField.style.display = isExchange ? "" : "none";
  }
  if(caisseTransferRateField){
    caisseTransferRateField.style.display = isExchange ? "" : "none";
  }
  if(caisseTransferCounterCurrency){
    const sourceCurrency = normalizeCurrencyCode(caisseTransferSourceCurrency?.value || "USD");
    if(isParentChange){
      caisseTransferCounterCurrency.value = "USD";
      caisseTransferCounterCurrency.disabled = true;
    }else if(isExchange){
      const preferred = sourceCurrency === "USD" ? "CDF" : "USD";
      if(!["USD","CDF"].includes(String(caisseTransferCounterCurrency.value || "").toUpperCase()) || caisseTransferCounterCurrency.value === sourceCurrency){
        caisseTransferCounterCurrency.value = preferred;
      }
      caisseTransferCounterCurrency.disabled = false;
    }else{
      caisseTransferCounterCurrency.value = sourceCurrency;
      caisseTransferCounterCurrency.disabled = true;
    }
  }
  if(caisseTransferSourceCurrency){
    caisseTransferSourceCurrency.disabled = isParentChange;
  }
  if(caisseTransferRate && (!String(caisseTransferRate.value || "").trim() || Number(onlyDigits(caisseTransferRate.value || "")) <= 0)){
    caisseTransferRate.value = String(Math.round(Number(USD_TO_CDF || 0) || 2400));
  }
}

function populateCaisseTransferFormOptions(){
  const candidates = getCaisseTransferSelectCandidates();
  const makeOptionLabel = (row) => `${row.label} • ${formatIntSpaced(Math.round(row.net.cdf))} CDF / ${formatUSD(row.net.usd)}`;
  const optionHtml = candidates.map((row) => `<option value="${esc(row.key)}">${esc(makeOptionLabel(row))}</option>`).join("");
  const previousSource = String(caisseTransferSourceBox?.value || "").trim();
  const previousCounterparty = String(caisseTransferCounterpartyBox?.value || "").trim();
  if(caisseTransferSourceBox){
    caisseTransferSourceBox.innerHTML = `<option value="">— Choisir —</option>${optionHtml}`;
  }
  if(caisseTransferCounterpartyBox){
    caisseTransferCounterpartyBox.innerHTML = `<option value="">— Choisir —</option>${optionHtml}`;
  }
  const defaultSource = candidates.find((row) => row.key === "minerval")?.key || candidates[0]?.key || "";
  if(caisseTransferSourceBox){
    caisseTransferSourceBox.value = candidates.some((row) => row.key === previousSource) ? previousSource : defaultSource;
  }
  const currentSource = String(caisseTransferSourceBox?.value || "").trim();
  const sourceCurrency = normalizeCurrencyCode(caisseTransferSourceCurrency?.value || "USD");
  const exchangeNeededCurrency = sourceCurrency === "USD" ? "cdf" : "usd";
  const bestCounterparty = candidates
    .filter((row) => row.key !== currentSource)
    .sort((a, b) => Number(b.net?.[exchangeNeededCurrency] || 0) - Number(a.net?.[exchangeNeededCurrency] || 0))[0]?.key
    || candidates.find((row) => row.key !== currentSource)?.key
    || "";
  if(caisseTransferCounterpartyBox){
    const keepCounterparty = previousCounterparty && previousCounterparty !== currentSource && candidates.some((row) => row.key === previousCounterparty)
      ? previousCounterparty
      : bestCounterparty;
    caisseTransferCounterpartyBox.value = keepCounterparty || "";
  }
}

function buildCaisseTransferDraft(){
  const uiMode = normalizeCaisseTransferMode(caisseTransferMode?.value || "exchange");
  const isExchange = isCaisseExchangeMode(uiMode);
  const isParentChange = uiMode === PARENT_CHANGE_TRANSFER_MODE;
  const mode = isParentChange ? "exchange" : uiMode;
  const sourceBoxKey = String(caisseTransferSourceBox?.value || "").trim();
  const rawCounterpartyBoxKey = String(caisseTransferCounterpartyBox?.value || "").trim();
  const counterpartyBoxKey = isParentChange ? PARENT_CHANGE_COUNTERPARTY_BOX_KEY : rawCounterpartyBoxKey;
  const sourceCurrency = isParentChange ? "CDF" : normalizeCurrencyCode(caisseTransferSourceCurrency?.value || "USD");
  const sourceAmount = Number(onlyDigits(String(caisseTransferAmount?.value || "")) || "0");
  const counterCurrency = isParentChange
    ? "USD"
    : isExchange
      ? normalizeCurrencyCode(caisseTransferCounterCurrency?.value || (sourceCurrency === "USD" ? "CDF" : "USD"))
    : sourceCurrency;
  const fxRate = isExchange
    ? Number(onlyDigits(String(caisseTransferRate?.value || "")) || "0")
    : null;
  const sourceSnapshot = caisseBoxSnapshotByKey.get(sourceBoxKey) || getCaisseBoxSnapshots().find((row) => row.key === sourceBoxKey) || null;
  const counterpartySnapshot = isParentChange
    ? null
    : caisseBoxSnapshotByKey.get(counterpartyBoxKey) || getCaisseBoxSnapshots().find((row) => row.key === counterpartyBoxKey) || null;
  const sourceAvailable = sourceCurrency === "CDF"
    ? Math.max(0, Number(sourceSnapshot?.net?.cdf || 0))
    : Math.max(0, Number(sourceSnapshot?.net?.usd || 0));
  const counterAmount = computeTransferCounterAmount(sourceAmount, sourceCurrency, counterCurrency, fxRate || USD_TO_CDF);
  const counterAvailable = isParentChange
    ? Number.POSITIVE_INFINITY
    : counterCurrency === "CDF"
    ? Math.max(0, Number(counterpartySnapshot?.net?.cdf || 0))
    : Math.max(0, Number(counterpartySnapshot?.net?.usd || 0));
  const sourceBox = findCaisseBoxDefinitionByKey(sourceBoxKey);
  const counterpartyBox = findCaisseBoxDefinitionByKey(counterpartyBoxKey);
  if(!sourceBoxKey || (!isParentChange && !counterpartyBoxKey)){
    return { valid:false, message:isParentChange ? "Choisissez la caisse concernee." : "Choisissez la caisse source et la caisse contrepartie.", isError:false };
  }
  if(!isParentChange && sourceBoxKey === counterpartyBoxKey){
    return { valid:false, message:"Choisissez deux caisses differentes.", isError:true };
  }
  if(!Number.isFinite(sourceAmount) || sourceAmount <= 0){
    return { valid:false, message:"Montant envoye invalide.", isError:true };
  }
  if(isExchange && sourceCurrency === counterCurrency){
    return { valid:false, message:"Le change doit utiliser deux devises differentes.", isError:true };
  }
  if(isExchange && (!(Number(fxRate || 0) > 0) || !(counterAmount > 0))){
    return { valid:false, message:"Taux invalide pour le change.", isError:true };
  }
  if(isParentChange){
    const usdAmount = Number(counterAmount || 0);
    const nearestFive = Math.round(usdAmount / 5) * 5;
    const isMultipleOfFive = Math.abs(usdAmount - nearestFive) < 0.000001;
    if(usdAmount < 5 || !isMultipleOfFive){
      return {
        valid:false,
        message:"Change parent: le montant USD recu doit etre minimum 5 USD et par multiples de 5 USD.",
        isError:true
      };
    }
  }
  if(sourceAmount > (sourceAvailable + 1e-9)){
    return {
      valid:false,
      message:`La caisse source n'a que ${formatMoney(sourceAvailable, sourceCurrency)} disponible.`,
      isError:true
    };
  }
  if(isExchange && counterAmount > (counterAvailable + 1e-9)){
    return {
      valid:false,
      message:`La caisse contrepartie n'a que ${formatMoney(counterAvailable, counterCurrency)} a remettre.`,
      isError:true
    };
  }
  const note = String(caisseTransferNote?.value || "").trim();
  const submitNote = isParentChange
    ? (note ? `${PARENT_CHANGE_TRANSFER_NOTE_PREFIX} - ${note}` : PARENT_CHANGE_TRANSFER_NOTE_PREFIX)
    : note;
  const previewParts = isExchange
    ? [
        `${isParentChange ? "Change parent: " : ""}${sourceBox?.label || sourceBoxKey} envoie ${formatMoney(sourceAmount, sourceCurrency)}`,
        `${isParentChange ? "Parent" : counterpartyBox?.label || counterpartyBoxKey} rend ${formatMoney(counterAmount, counterCurrency)}`,
        `Taux 1 USD = ${formatIntSpaced(Math.round(Number(fxRate || USD_TO_CDF || 0)))} CDF`
      ]
    : [
        `${sourceBox?.label || sourceBoxKey} transfere ${formatMoney(sourceAmount, sourceCurrency)}`,
        `${counterpartyBox?.label || counterpartyBoxKey} recoit la meme somme`
      ];
  if(note) previewParts.push(note);
  return {
    valid:true,
    mode,
    uiMode,
    sourceBoxKey,
    counterpartyBoxKey,
    sourceCurrency,
    sourceAmount,
    counterCurrency,
    counterAmount,
    fxRate: isExchange ? Number(fxRate || USD_TO_CDF || 0) : null,
    note,
    submitNote,
    message: previewParts.join(" • "),
    isError:false
  };
}

function refreshCaisseTransferPreview(){
  if(!caisseTransferPreview) return;
  syncCaisseTransferModeUi();
  populateCaisseTransferFormOptions();
  const draft = buildCaisseTransferDraft();
  caisseTransferPreview.textContent = draft.message || "";
  caisseTransferPreview.style.color = draft.isError ? "#b91c1c" : "";
}

function syncAutoCaisseTransferPeriodFields(dateValue = new Date()){
  const safeDate = new Date(dateValue);
  const { dateIso, monthKey, monthLabel } = getAutoAppliedSchoolMonthMeta(safeDate);
  if(caisseTransferDate){
    caisseTransferDate.value = dateIso ? fmtDateFrLong(safeDate) : "";
    caisseTransferDate.readOnly = true;
  }
  if(caisseTransferMonth){
    applySchoolMonthOptions(caisseTransferMonth, monthLabel);
    caisseTransferMonth.disabled = true;
  }
  return { dateIso, monthKey, monthLabel };
}

function syncAutoCaisseSpendPeriodFields(dateValue = new Date()){
  const safeDate = new Date(dateValue);
  const { dateIso, monthKey, monthLabel } = getAutoAppliedSchoolMonthMeta(safeDate);
  if(caisseSpendDate){
    caisseSpendDate.value = dateIso ? fmtDateFrLong(safeDate) : "";
    caisseSpendDate.readOnly = true;
    caisseSpendDate.disabled = false;
  }
  if(caisseSpendMonth){
    applySchoolMonthOptions(caisseSpendMonth, monthLabel);
    caisseSpendMonth.disabled = true;
  }
  return { dateIso, monthKey, monthLabel };
}

function renderCaisse(){
  if(!caisseGrid) return;
  const allRows = getCaisseBoxSnapshots().filter((row) => isVisibleCaisseBoxKey(row?.key));
  const activeRows = allRows.filter((row) => Number(row.net?.usd || 0) > 0.000001 || Number(row.net?.cdf || 0) > 0.5);
  const rows = caisseShowEmptyBoxes ? allRows : activeRows;
  const totalUsd = allRows.reduce((sum, row) => sum + Math.max(0, Number(row.net?.usd || 0)), 0);
  const totalCdf = allRows.reduce((sum, row) => sum + Math.max(0, Number(row.net?.cdf || 0)), 0);
  caisseBoxSnapshotByKey = new Map(allRows.map((row) => [String(row.key), row]));
  if(caisseTotalUsd) caisseTotalUsd.textContent = formatUSD(totalUsd);
  if(caisseTotalCdf) caisseTotalCdf.textContent = formatMoney(totalCdf, "CDF");
  if(caisseActiveCount) caisseActiveCount.textContent = String(activeRows.length);
  if(caisseActiveMeta) caisseActiveMeta.textContent = `sur ${allRows.length} caisses`;
  if(caisseEmptyToggle){
    const emptyCount = Math.max(0, allRows.length - activeRows.length);
    caisseEmptyToggle.style.display = emptyCount > 0 ? "" : "none";
    caisseEmptyToggle.textContent = caisseShowEmptyBoxes ? "Masquer les caisses vides" : `Afficher les caisses vides (${emptyCount})`;
    caisseEmptyToggle.setAttribute("aria-pressed", caisseShowEmptyBoxes ? "true" : "false");
  }
  caisseGrid.innerHTML = rows.length ? rows.map((row) => {
    const usd = Math.max(0, Number(row.net?.usd || 0));
    const cdf = Math.max(0, Number(row.net?.cdf || 0));
    return `
      <button type="button" class="caisse-box" data-caisse-box="${esc(row.key)}" title="Cliquez pour sortir une depense">
        <div class="caisse-box-name">${esc(row.label || "Caisse")}</div>
        <div class="caisse-box-cdf">${formatIntSpaced(Math.round(cdf))} CDF</div>
        <div class="caisse-box-usd">${formatUSD(usd)}</div>
      </button>
    `;
  }).join("") : `<div class="caisse-grid-empty">Aucune caisse alimentée pour le moment.</div>`;
  if(caisseUpdatedAt){
    caisseUpdatedAt.textContent = `Mise a jour: ${fmtDateTime(new Date())}`;
  }
  syncAutoCaisseTransferPeriodFields();
  if(caisseTransferSourceCurrency && !["USD","CDF"].includes(String(caisseTransferSourceCurrency.value || "").toUpperCase())){
    caisseTransferSourceCurrency.value = "USD";
  }
  if(caisseTransferRate && !String(caisseTransferRate.value || "").trim()){
    caisseTransferRate.value = String(Math.round(Number(USD_TO_CDF || 0) || 2400));
  }
  populateCaisseTransferFormOptions();
  syncCaisseTransferModeUi();
  refreshCaisseTransferPreview();
  if(caisseTransferSubmit){
    caisseTransferSubmit.disabled = !hasRole("admin", "caissier", "comptable");
  }
  renderCaisseHistory();
  renderCaisseTransferHistory();
}

function openCaisseSpendModal(boxKey){
  if(!caisseSpendModal) return;
  if(!hasRole("admin", "caissier", "comptable")){
    showInAppPopup("Action non autorisee pour votre role.");
    return;
  }
  const safeKey = String(boxKey || "").trim();
  const snapshot = caisseBoxSnapshotByKey.get(safeKey) || getCaisseBoxSnapshots().find((row) => row.key === safeKey);
  if(!snapshot) return;
  caisseModalCurrentKey = safeKey;
  if(caisseSpendTitle) caisseSpendTitle.textContent = `Depense caisse - ${snapshot.label}`;
  if(caisseSpendAvail){
    const availUsd = Math.max(0, Number(snapshot.net?.usd || 0));
    const availCdf = Math.max(0, Number(snapshot.net?.cdf || 0));
    caisseSpendAvail.textContent = `Disponible: ${formatIntSpaced(Math.round(availCdf))} CDF / ${formatUSD(availUsd)}`;
  }
  syncAutoCaisseSpendPeriodFields();
  if(caisseSpendCurrency){
    caisseSpendCurrency.value = Number(snapshot.net?.cdf || 0) > 0 ? "CDF" : "USD";
    caisseSpendCurrency.disabled = false;
  }
  if(caisseSpendKind){
    caisseSpendKind.value = "spending";
    caisseSpendKind.disabled = false;
  }
  if(caisseSpendAmount){
    caisseSpendAmount.value = "";
    caisseSpendAmount.disabled = false;
  }
  if(caisseSpendDescription){
    caisseSpendDescription.value = "";
    caisseSpendDescription.disabled = false;
  }
  restoreCaisseSpendStatusHint(snapshot);
  caisseSpendModal.style.display = "flex";
  caisseSpendModal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    if(caisseSpendAmount){
      caisseSpendAmount.disabled = false;
      caisseSpendAmount.focus();
    }
  });
}

function closeCaisseSpendModal(){
  if(!caisseSpendModal) return;
  caisseSpendModal.style.display = "none";
  caisseSpendModal.setAttribute("aria-hidden", "true");
  caisseModalCurrentKey = "";
}

function setCaisseSpendStatusMessage(message, isError = false){
  if(!caisseSpendStatus) return;
  caisseSpendStatus.textContent = String(message || "");
  caisseSpendStatus.style.color = isError ? "#b91c1c" : "";
}

function restoreCaisseSpendStatusHint(snapshot = null){
  const safeSnapshot = snapshot || (() => {
    const box = findCaisseBoxDefinitionByKey(caisseModalCurrentKey);
    if(!box) return null;
    return caisseBoxSnapshotByKey.get(box.key) || getCaisseBoxSnapshots().find((row) => row.key === box.key) || null;
  })();
  if(!safeSnapshot){
    setCaisseSpendStatusMessage("");
    return;
  }
  const isPaid = String(caisseSpendKind?.value || "spending").trim().toLowerCase() === "paid";
  const categoryLabel = isPaid ? statePaidCaisseSpendingCategoryLabel(safeSnapshot) : caisseSpendingCategoryLabel(safeSnapshot);
  setCaisseSpendStatusMessage(`Categorie depense: ${categoryLabel}`);
}

async function submitCaisseSpendFromModal(){
  const box = findCaisseBoxDefinitionByKey(caisseModalCurrentKey);
  if(!box) return;
  const snapshot = caisseBoxSnapshotByKey.get(box.key) || getCaisseBoxSnapshots().find((row) => row.key === box.key);
  if(!snapshot) return;
  const currency = normalizeCurrencyCode(caisseSpendCurrency?.value || "USD");
  const amountDigits = onlyDigits(String(caisseSpendAmount?.value || ""));
  const amount = Number(amountDigits || "0");
  const description = String(caisseSpendDescription?.value || "").trim();
  if(!description){
    setCaisseSpendStatusMessage("Description requise.", true);
    requestAnimationFrame(() => {
      if(caisseSpendDescription){
        caisseSpendDescription.disabled = false;
        caisseSpendDescription.focus();
      }
    });
    return;
  }
  if(!Number.isFinite(amount) || amount <= 0){
    setCaisseSpendStatusMessage("Montant invalide.", true);
    requestAnimationFrame(() => {
      if(caisseSpendAmount){
        caisseSpendAmount.disabled = false;
        caisseSpendAmount.focus();
      }
    });
    return;
  }
  restoreCaisseSpendStatusHint(snapshot);
  const availableByCurrency = {
    usd: Math.max(0, Number(snapshot.net?.usd || 0)),
    cdf: Math.max(0, Number(snapshot.net?.cdf || 0))
  };
  const autoPeriod = syncAutoCaisseSpendPeriodFields();
  const isPaid = String(caisseSpendKind?.value || "spending").trim().toLowerCase() === "paid";
  const done = await createSpendingEntry({
    dateIso: autoPeriod.dateIso || toDateISO(new Date()),
    category: isPaid ? statePaidCaisseSpendingCategoryLabel(snapshot) : caisseSpendingCategoryLabel(snapshot),
    description,
    amount,
    currency,
    appliesToMonth: String(autoPeriod.monthKey || monthKeyFromDateISO(autoPeriod.dateIso || toDateISO(new Date())) || ""),
    caisseBoxKey: box.key,
    availableByCurrency
  });
  if(done){
    closeCaisseSpendModal();
    renderCaisse();
    renderTopDailyBalance();
    return;
  }
  requestAnimationFrame(() => {
    if(caisseSpendAmount) caisseSpendAmount.disabled = false;
    if(caisseSpendDescription) caisseSpendDescription.disabled = false;
    const focusTarget = !String(caisseSpendDescription?.value || "").trim() ? caisseSpendDescription : caisseSpendAmount;
    if(focusTarget) focusTarget.focus();
  });
}

async function submitCaisseTransferEntry(){
  if(!hasRole("admin", "caissier", "comptable")){
    showInAppPopup("Action non autorisee pour votre role.");
    return false;
  }
  if(!apiReachable || !navigator.onLine){
    showInAppPopup("Transfert / change caisse necessite une connexion API.");
    return false;
  }
  const draft = buildCaisseTransferDraft();
  if(!draft.valid){
    if(caisseTransferPreview){
      caisseTransferPreview.textContent = draft.message || "";
      caisseTransferPreview.style.color = draft.isError ? "#b91c1c" : "";
    }
    return false;
  }
  const autoPeriod = syncAutoCaisseTransferPeriodFields();
  try{
    const serverItem = await apiFetch("/api/caisse-transfers", {
      method: "POST",
      body: JSON.stringify({
        date: autoPeriod.dateIso || toDateISO(new Date()),
        appliesToMonth: String(autoPeriod.monthKey || monthKeyFromDateISO(autoPeriod.dateIso || toDateISO(new Date())) || ""),
        mode: draft.mode,
        sourceBoxKey: draft.sourceBoxKey,
        counterpartyBoxKey: draft.counterpartyBoxKey,
        sourceCurrency: draft.sourceCurrency,
        sourceAmount: draft.sourceAmount,
        counterCurrency: draft.counterCurrency,
        fxRate: draft.fxRate,
        note: draft.submitNote || draft.note,
        schoolYearStartYear: normalizeSchoolYearStartYear(getActiveSchoolYearStartYear())
      })
    });
    upsertCaisseTransferCache(serverItem);
    if(caisseTransferAmount) caisseTransferAmount.value = "";
    if(caisseTransferNote) caisseTransferNote.value = "";
    renderCaisse();
    renderTopDailyBalance();
    if(caisseTransferPreview){
      caisseTransferPreview.textContent = "Transfert / change enregistre.";
      caisseTransferPreview.style.color = "";
    }
    return true;
  }catch(err){
    const message = String(err?.message || err?.payload?.error || "Transfert / change refuse.");
    if(caisseTransferPreview){
      caisseTransferPreview.textContent = message;
      caisseTransferPreview.style.color = "#b91c1c";
    }
    return false;
  }
}

async function deleteCaisseTransferById(id){
  if(!hasRole("admin")){
    showInAppPopup("Suppression reservee a admin.");
    return false;
  }
  const current = getCaisseTransfers().find((row) => String(row.id) === String(id));
  if(!current) return false;
  const confirmed = await showAppConfirm({
    title: "Supprimer transfert caisse",
    message: "Supprimer ce transfert / change ?",
    okText: "Supprimer",
    cancelText: "Annuler",
    okClass: "danger"
  });
  if(!confirmed) return false;
  const transferYear = normalizeSchoolYearStartYear(current?.schoolYearStartYear);
  const deletePath = transferYear
    ? `/api/caisse-transfers/${encodeURIComponent(String(id))}?schoolYearStartYear=${encodeURIComponent(String(transferYear))}`
    : `/api/caisse-transfers/${encodeURIComponent(String(id))}`;
  try{
    await apiFetch(deletePath, { method:"DELETE" });
    removeCaisseTransferFromCache(id);
    renderCaisse();
    renderTopDailyBalance();
    return true;
  }catch(err){
    showInAppPopup(String(err?.message || "Suppression du transfert impossible."));
    return false;
  }
}

async function loadSpendingsFromApi(){
  try{
    const prunedPending = pruneOrphanPendingSpendings();
    const rows = await apiFetch("/api/spending");
    if(Array.isArray(rows)){
      const pendingLocal = getSpendings().filter((s) => {
        return s.pendingSync && spendingSchoolYearStartYear(s) === normalizeSchoolYearStartYear(getActiveSchoolYearStartYear());
      });
      const merged = [...rows.map((r) => ({
        ...r,
        description: r.description || r.note || "",
        appliesToMonth: r.appliesToMonth || r.applies_to_month || spendingTargetMonthKey(r) || null,
        cashier: r.createdByUsername || r.cashier || "—",
        month: monthLabelFromDateISO(r.date),
        pendingSync: false
      }))];
      for(const p of pendingLocal){
        if(!merged.some(x => String(x.id) === String(p.id))) merged.unshift(p);
      }
      const nextSig = hashRowsSignature(merged, spendingSignatureToken);
      const changed = prunedPending || nextSig !== spendingsDataSignature;
      if(changed){
        saveSpendings(merged);
      }
      apiReachable = true;
      updateSyncBadge();
      return changed;
    }
    apiReachable = true;
    updateSyncBadge();
    return false;
  }catch(err){
    if(String(err?.message || "").toLowerCase().includes("session")) throw err;
    return false;
  }
}

async function loadCaisseTransfersFromApi(){
  try{
    const rows = await apiFetch("/api/caisse-transfers");
    if(Array.isArray(rows)){
      const normalized = rows.map((row) => normalizeCaisseTransferApiRow(row));
      const nextSig = hashRowsSignature(normalized, caisseTransferSignatureToken);
      const changed = nextSig !== caisseTransfersDataSignature;
      if(changed){
        saveCaisseTransfers(normalized);
      }
      apiReachable = true;
      updateSyncBadge();
      return changed;
    }
    apiReachable = true;
    updateSyncBadge();
    return false;
  }catch(err){
    if(String(err?.message || "").toLowerCase().includes("session")) throw err;
    return false;
  }
}

let outboxFlushInFlight = false;
async function flushOutboxEvents(opts = {}){
  if(outboxFlushInFlight) return;
  outboxFlushInFlight = true;
  try{
    return await flushOutboxEventsInner(opts);
  }finally{
    outboxFlushInFlight = false;
  }
}

async function flushOutboxEventsInner({ maxPerRun = 6, ignoreSchedule = false } = {}){
  // Network sync must not wait for the cashier to leave the payment form —
  // that left payments "Sync en attente" for the whole busy period. Only the
  // post-sync re-render (which can steal focus) is deferred while typing.
  const queue = getOutboxEvents();
  if(!queue.length) return;
  const nowTs = Date.now();
  let processed = 0;
  let changed = false;
  let spendingChanged = false;
  let paymentsChanged = false;
  for(let i = 0; i < queue.length; i += 1){
    if(processed >= maxPerRun) break;
    const evt = queue[i];
    if(evt.status === "sent") continue;
    const retryAt = evt?.nextRetryAt ? Date.parse(evt.nextRetryAt) : NaN;
    if(!ignoreSchedule && Number.isFinite(retryAt) && retryAt > nowTs) continue;
    let nextPayload = evt.payload;
    processed += 1;
    try{
      if(evt.type === "SPENDING_CREATE"){
        const server = await apiFetch("/api/spending", {
          method: "POST",
          body: JSON.stringify(evt.payload)
        });
        const tempId = evt.payload?.clientTempId || evt.payload?.id;
        if(tempId){
          removeSpendingFromCache(tempId);
        }
        upsertSpendingCache({
          ...server,
          description: server.description || server.note || "",
          appliesToMonth: server.appliesToMonth || server.applies_to_month || spendingTargetMonthKey(server) || null,
          cashier: server.createdByUsername || server.cashier || "—",
          month: monthLabelFromDateISO(server.date),
          pendingSync: false
        });
        spendingChanged = true;
      } else if(evt.type === "SPENDING_DELETE"){
        const deleteYear = normalizeSchoolYearStartYear(evt?.payload?.schoolYearStartYear);
        const deletePath = deleteYear
          ? `/api/spending/${encodeURIComponent(evt.payload.id)}?schoolYearStartYear=${encodeURIComponent(String(deleteYear))}`
          : `/api/spending/${encodeURIComponent(evt.payload.id)}`;
        await apiFetch(deletePath, { method:"DELETE" });
        spendingChanged = true;
      } else if(evt.type === "PAYMENT_CREATE"){
        const payload = { ...(evt.payload || {}) };
        nextPayload = payload;
        const synced = await syncSinglePaymentCreate(payload);
        paymentsChanged = true;
        if(viewReceipts?.classList?.contains("active") && synced){
          renderReceiptsTable();
        }
      } else {
        queue[i] = { ...evt, status: "failed", lastError: "Type d'événement outbox inconnu" };
        changed = true;
        continue;
      }
      queue[i] = {
        ...evt,
        payload: nextPayload,
        status: "sent",
        syncAttempts: Number(evt?.syncAttempts || 0),
        nextRetryAt: null,
        lastError: ""
      };
      changed = true;
    }catch(err){
      const msg = String(err?.message || err || "Erreur de synchronisation");
      if(msg.toLowerCase().includes("session")){
        throw err;
      }
      const status = Number(err?.status || 0);
      const attempts = Number(evt?.syncAttempts || 0) + 1;
      const isPermanent = status === 400 || status === 403 || status === 404 || status === 409 || status === 422;
      if(evt.type === "SPENDING_CREATE" && isPermanent){
        const tempId = evt.payload?.clientTempId || evt.payload?.id;
        if(tempId){
          removeSpendingFromCache(tempId);
        }
        spendingChanged = true;
        queue[i] = {
          ...evt,
          payload: nextPayload,
          status: "sent",
          syncAttempts: attempts,
          nextRetryAt: null,
          lastError: msg,
          lastErrorAt: new Date().toISOString()
        };
        changed = true;
        continue;
      }
      const nextRetryAt = isPermanent ? null : new Date(Date.now() + outboxBackoffDelayMs(attempts)).toISOString();
      queue[i] = {
        ...evt,
        payload: nextPayload,
        status: isPermanent ? "failed" : "pending",
        syncAttempts: attempts,
        nextRetryAt,
        lastError: msg,
        lastErrorAt: new Date().toISOString()
      };
      changed = true;

      if(evt.type === "PAYMENT_CREATE"){
        patchPaymentSyncState(evt.payload || {}, {
          pendingSync: true,
          syncAttempts: attempts,
          syncError: msg,
          syncLastErrorAt: new Date().toISOString()
        });
      }

      if(!isPermanent){
        apiReachable = false;
        lastApiError = msg;
        updateSyncBadge();
        break;
      }
    }
  }
  if(changed){
    const unsent = queue.filter((e) => e.status !== "sent");
    saveOutboxEvents(unsent);
    schedulePostFlushRender({ spending: spendingChanged, payments: paymentsChanged });
    if(unsent.some((e) => e.status === "pending") && apiReachable){
      setTimeout(() => {
        flushOutboxEvents({ maxPerRun }).catch(() => {});
      }, 250);
    }
  }
}

let postFlushRenderTimer = null;
let postFlushRenderFlags = { spending: false, payments: false };

// Re-renders after a sync can steal focus from the payment form, so they wait
// for a typing pause; the network sync itself never waits.
function schedulePostFlushRender(flags = {}){
  postFlushRenderFlags.spending = postFlushRenderFlags.spending || Boolean(flags.spending);
  postFlushRenderFlags.payments = postFlushRenderFlags.payments || Boolean(flags.payments);
  if(!postFlushRenderFlags.spending && !postFlushRenderFlags.payments) return;
  if(postFlushRenderTimer) clearTimeout(postFlushRenderTimer);
  if(!isPaymentUiInteractionActive()){
    postFlushRenderTimer = null;
    runPostFlushRender();
    return;
  }
  postFlushRenderTimer = setTimeout(() => {
    postFlushRenderTimer = null;
    schedulePostFlushRender();
  }, 1500);
}

function runPostFlushRender(){
  const { spending: spendingChanged, payments: paymentsChanged } = postFlushRenderFlags;
  postFlushRenderFlags = { spending: false, payments: false };
  if(spendingChanged){
    if(viewSpending?.classList?.contains("active")) renderSpendingTable();
    renderTopDailyBalance();
    renderDashboard();
    if(viewCaisse?.classList?.contains("active")) renderCaisse();
    scheduleReportsRender();
  }
  if(paymentsChanged){
    if(viewReceipts?.classList?.contains("active")) renderReceiptsTable();
    refreshStudentsFinancialState();
    renderStudentList();
    if(selectedStudentId) selectStudent(selectedStudentId);
    renderTopDailyBalance();
    if(viewDashboard?.classList?.contains("active")) renderDashboard();
    if(viewCaisse?.classList?.contains("active")) renderCaisse();
    scheduleReportsRender();
  }
}

function startSyncLoop(){
  if(syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if(!navigator.onLine) return;
    const hasPendingOutbox = getOutboxEvents().some((evt) => evt.status === "pending");
    if(!hasPendingOutbox) return;
    flushOutboxEvents().catch(() => {});
  }, 10000);
}

function scheduleReportsRender(delayMs = 120){
  if(!viewReports?.classList?.contains("active")) return;
  if(reportsRenderDebounceTimer) clearTimeout(reportsRenderDebounceTimer);
  reportsRenderDebounceTimer = setTimeout(() => {
    reportsRenderDebounceTimer = null;
    renderReports().catch(() => {});
  }, Math.max(0, Number(delayMs || 0)));
}

function scheduleLiveRefresh({ force = false, debounceMs = LIVE_REFRESH_DEBOUNCE_MS } = {}){
  if(force) liveRefreshDebounceForce = true;
  if(liveRefreshDebounceTimer) clearTimeout(liveRefreshDebounceTimer);
  liveRefreshDebounceTimer = setTimeout(() => {
    liveRefreshDebounceTimer = null;
    const nextForce = Boolean(liveRefreshDebounceForce);
    liveRefreshDebounceForce = false;
    refreshLiveNumbers({ force: nextForce }).catch(() => {});
  }, Math.max(0, Number(debounceMs || 0)));
}

function markPaymentUiInteraction(){
  paymentUiLastInputAt = Date.now();
}

function isPaymentUiInteractionActive(){
  if(!viewPayment?.classList?.contains("active")) return false;
  const elapsed = Date.now() - Number(paymentUiLastInputAt || 0);
  if(elapsed >= 0 && elapsed < PAYMENT_UI_REFRESH_PAUSE_MS) return true;
  const active = document.activeElement;
  if(!active) return false;
  return active === elSearch
    || active === elStudentLookup
    || active === elStudentLookupLevelFilter
    || active === elAmount
    || active === elFee
    || active === elMonth
    || active === elCurrency
    || active === elNote;
}

function getActiveViewName(){
  if(viewPayment?.classList?.contains("active")) return "payment";
  if(viewStudents?.classList?.contains("active")) return "students";
  if(viewGrades?.classList?.contains("active")) return "grades";
  if(viewReceipts?.classList?.contains("active")) return "receipts";
  if(viewSpending?.classList?.contains("active")) return "spending";
  if(viewCaisse?.classList?.contains("active")) return "caisse";
  if(viewReports?.classList?.contains("active")) return "reports";
  if(document.getElementById("viewDataQuality")?.classList.contains("active")) return "data-quality";
  if(viewSettings?.classList?.contains("active")) return "settings";
  return "dashboard";
}

async function refreshLiveNumbers({ force = false } = {}){
  if(liveRefreshInFlight){
    liveRefreshQueued = true;
    liveRefreshQueuedForce = liveRefreshQueuedForce || Boolean(force);
    return;
  }
  if(!currentUser) return;
  if(!navigator.onLine) return;
  if(loginOverlay && loginOverlay.style.display === "flex") return;
  // Keep typing/search responsive in payment mode by pausing during active input.
  if(!force && isPaymentUiInteractionActive()) return;
  if(!force && document.hidden) return;
  const nowMs = Date.now();
  if(!force && (nowMs - liveRefreshLastRunAt) < LIVE_REFRESH_MIN_GAP_MS){
    return;
  }
  liveRefreshLastRunAt = nowMs;

  liveRefreshInFlight = true;
  try{
    const activeView = getActiveViewName();
    const paymentsBackgroundRefreshDue = (nowMs - Number(paymentsLastLoadedAt || 0)) >= BACKGROUND_PAYMENTS_REFRESH_INTERVAL_MS;
    const shouldRefreshPayments = force || (paymentsBackgroundRefreshDue && (
      activeView === "dashboard"
      || activeView === "payment"
      || activeView === "students"
      || activeView === "receipts"
      || activeView === "caisse"
      || activeView === "reports"
    ));
    const shouldRefreshSpendings = force || (
      activeView === "dashboard"
      || activeView === "spending"
      || activeView === "caisse"
      || activeView === "reports"
    );
    const shouldRefreshReceipts = activeView === "receipts";
    // Full-history collection responses are large. Read them sequentially so
    // PostgreSQL never has several ClientWrite result streams competing for
    // the same Node process during a background refresh.
    const paymentsChanged = shouldRefreshPayments
      ? await loadPaymentsFromApi().catch(() => false)
      : false;
    const spendingsChanged = shouldRefreshSpendings
      ? await loadSpendingsFromApi().catch(() => false)
      : false;
    const transfersChanged = await loadCaisseTransfersFromApi().catch(() => false);
    const receiptsChanged = shouldRefreshReceipts
      ? await loadReceiptsFromApi().catch(() => false)
      : false;
    const financialChanged = Boolean(paymentsChanged || spendingsChanged);
    const caisseChanged = Boolean(paymentsChanged || spendingsChanged || transfersChanged);
    const shouldRefreshVisiblePaymentUi = Boolean(
      viewPayment?.classList?.contains("active")
      || viewStudents?.classList?.contains("active")
    );

    if(financialChanged){
      refreshStudentsFinancialState();
    }
    if(caisseChanged){
      renderTopDailyBalance();
    }
    if(financialChanged && shouldRefreshVisiblePaymentUi){
      renderStudentList();
      if(viewStudents?.classList?.contains("active")) renderStudentsTableGrouped();
    }

    if(paymentsChanged && selectedStudentId && viewPayment?.classList?.contains("active")){
      await loadSelectedStudentFeeStatus({ applyMonthDefault: false }).catch(() => null);
    }
    if((paymentsChanged || spendingsChanged) && studentProfileState.studentId && studentProfileModal && studentProfileModal.style.display !== "none"){
      await loadStudentProfile(studentProfileState.studentId, { open: false }).catch(() => {});
    }

    if(receiptsChanged && viewReceipts?.classList?.contains("active")){
      renderReceiptsTable();
    }
    if(spendingsChanged && viewSpending?.classList?.contains("active")) renderSpendingTable();
    if(financialChanged && viewDashboard?.classList?.contains("active")) renderDashboard();
    if(caisseChanged && viewCaisse?.classList?.contains("active")) renderCaisse();
    if(financialChanged){
      scheduleReportsRender();
    }
  } finally {
    liveRefreshInFlight = false;
    if(liveRefreshQueued){
      liveRefreshQueued = false;
      const queuedForce = Boolean(liveRefreshQueuedForce);
      liveRefreshQueuedForce = false;
      scheduleLiveRefresh({ force: queuedForce, debounceMs: LIVE_REFRESH_DEBOUNCE_MS });
    }
  }
}

function startLiveRefreshLoop(){
  if(liveRefreshTimer) clearInterval(liveRefreshTimer);
  liveRefreshTimer = setInterval(() => {
    refreshLiveNumbers().catch(() => {});
  }, LIVE_REFRESH_INTERVAL_MS);
}

function toDateISO(value){
  const d = new Date(value);
  if(!Number.isFinite(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function spendingDateISO(s){
  const raw = s?.date;
  if(!raw) return "";
  const txt = String(raw);
  if(/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;
  const slash4 = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(slash4){
    const a = Number(slash4[1]); // day (preferred)
    const b = Number(slash4[2]); // month (preferred)
    const yyyy = slash4[3];
    // Primary format: DD/MM/YYYY
    if(a >= 1 && a <= 31 && b >= 1 && b <= 12) return `${yyyy}-${String(b).padStart(2,"0")}-${String(a).padStart(2,"0")}`;
    // Legacy fallback MM/DD/YYYY only when DD/MM invalid.
    if(a >= 1 && a <= 12 && b >= 1 && b <= 31) return `${yyyy}-${String(a).padStart(2,"0")}-${String(b).padStart(2,"0")}`;
  }
  const slash2 = txt.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if(slash2){
    const a = Number(slash2[1]); // day (preferred)
    const b = Number(slash2[2]); // month (preferred)
    const yyyy = `20${slash2[3]}`;
    if(a >= 1 && a <= 31 && b >= 1 && b <= 12) return `${yyyy}-${String(b).padStart(2,"0")}-${String(a).padStart(2,"0")}`;
    if(a >= 1 && a <= 12 && b >= 1 && b <= 31) return `${yyyy}-${String(a).padStart(2,"0")}-${String(b).padStart(2,"0")}`;
  }
  // Normalize timestamp-like values to local calendar date so dashboard, reports,
  // and table all agree after API sync.
  try {
    const iso = toDateISO(raw);
    return iso || "";
  } catch {
    return "";
  }
}

function spendingEffectiveDateISO(s){
  const d = spendingDateISO(s);
  if(d) return d;
  if(s?.createdAt){
    try { return toDateISO(s.createdAt); } catch {}
  }
  return "";
}

function normalizeLooseDateToISO(value){
  if(!value) return "";
  const s = String(value).trim();
  if(!s) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return spendingDateISO({ date: s }) || "";
}
function normalizeDateInputDisplay(inputEl){
  if(!inputEl) return;
  const iso = normalizeLooseDateToISO(inputEl.value || "");
  if(!iso) return;
  const d = new Date(iso);
  if(!Number.isFinite(d.getTime())) return;
  inputEl.value = fmtDateFrLong(d);
}

function monthLabelFromDateISO(iso){
  if(!iso) return getCurrentMonthLabel();
  const d = new Date(iso);
  return MONTH_LABELS_FR[d.getMonth()] || getCurrentMonthLabel();
}
function monthKeyFromDateISO(iso){
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return "";
  return `${m[1]}-${m[2]}`;
}

function renderSpendingTotals(filtered){
  const month = repMonthSel?.value || dashMonth?.value || getCurrentMonthLabel();
  const monthKey = monthKeyFromLabelFR(month || "");
  const pageRows = getSchoolYearScopedSpendings();
  const expenseRows = pageRows.filter((s) => !isStatePaidSpending(s));
  const monthRows = expenseRows.filter((s) => spendingTargetMonthKey(s) === monthKey);
  const monthTotals = monthRows.reduce((acc, s) => {
    const part = spendingAmountSplit(s);
    acc.usd += Number(part.usd || 0);
    acc.cdf += Number(part.cdf || 0);
    return acc;
  }, { usd: 0, cdf: 0 });
  const allTotals = expenseRows.reduce((acc, s) => {
    const part = spendingAmountSplit(s);
    acc.usd += Number(part.usd || 0);
    acc.cdf += Number(part.cdf || 0);
    return acc;
  }, { usd: 0, cdf: 0 });

  spTotalMonthUsd.textContent = formatUSD(monthTotals.usd);
  spTotalMonthCdf.textContent = `${formatIntSpaced(Math.round(monthTotals.cdf))} CDF`;
  spTotalAllUsd.textContent = formatUSD(allTotals.usd);
  spTotalAllCdf.textContent = `${formatIntSpaced(Math.round(allTotals.cdf))} CDF`;
  spMonthLabel.textContent = monthKey ? monthLabelFromMonthKeyWithYear(monthKey) : month;

  return filtered;
}

function renderSpendingTable(){
  const q = (spSearch.value || "").toLowerCase().trim();
  const category = String(spFilterCategory?.value || "").trim();
  const from = normalizeLooseDateToISO(spFrom.value);
  const to = normalizeLooseDateToISO(spTo.value);

  const all = getSchoolYearScopedSpendings()
    .slice()
    .sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
  let filtered = all.filter((s) => {
    const cashierName = String(s.createdByUsername || s.cashier || "").toLowerCase();
    const matchesQ = !q
      || String(s.description || "").toLowerCase().includes(q)
      || cashierName.includes(q);
    const matchesCat = !category || String(s.category || "") === category;
    const d = spendingEffectiveDateISO(s);
    const matchesFrom = !from || d >= from;
    const matchesTo = !to || d <= to;
    return matchesQ && matchesCat && matchesFrom && matchesTo;
  });

  renderSpendingTotals(filtered);
  const visible = filtered.slice(0, spendingVisibleCount);
  spTbody.innerHTML = "";
  const showActionColumn = canDeleteSpending();
  const spActionHeader = document.getElementById("spActionHeader");
  if(spActionHeader){
    spActionHeader.style.display = showActionColumn ? "" : "none";
  }
  const actionColspan = showActionColumn ? 7 : 6;

  for(const s of visible){
    const currency = normalizeCurrencyCode(s.currency || "USD");
    const amount = Number(s.amount || 0);
    const amountUSD = currency === "USD" ? formatUSD(amount) : "-";
    const amountCDF = currency === "CDF" ? `${formatIntSpaced(Math.round(amount))} CDF` : "-";
    const dateIso = spendingEffectiveDateISO(s);
    const cashier = String(s.createdByUsername || s.cashier || "—");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dateIso ? formatEnrollmentDate(dateIso) : "—"}</td>
      <td>${esc(s.description || "—")} ${s.pendingSync ? '<span class="tiny" style="color:#a16207">• Sync en attente</span>' : ''}</td>
      <td>${esc(currency)}</td>
      <td>${amountUSD}</td>
      <td>${amountCDF}</td>
      <td>${esc(cashier)}</td>
      ${showActionColumn ? `<td><button class="btn danger" data-sp-delete="${esc(s.id)}">Supprimer</button></td>` : ""}
    `;
    spTbody.appendChild(tr);
  }

  if(filtered.length > spendingVisibleCount){
    const trMore = document.createElement("tr");
    trMore.innerHTML = `<td colspan="${actionColspan}" style="text-align:center"><button class="btn" data-sp-more="1">Voir plus (${filtered.length - spendingVisibleCount})</button></td>`;
    spTbody.appendChild(trMore);
  }
  if(spendingVisibleCount > SPENDING_LIST_STEP){
    const trLess = document.createElement("tr");
    trLess.innerHTML = `<td colspan="${actionColspan}" style="text-align:center"><button class="btn" data-sp-less="1">Voir moins</button></td>`;
    spTbody.appendChild(trLess);
  }

  if(!filtered.length){
    spTbody.innerHTML = `<tr><td colspan="${actionColspan}" class="tiny">Aucune dépense.</td></tr>`;
  }
  renderTopDailyBalance();
}

function initials(name){
  const parts = String(name||"").trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || parts[0]?.[1] || "";
  return (a+b).toUpperCase();
}

function getStudentById(id){
  return students.find(s => s.id === id) || null;
}

function isStudentActiveRecord(student){
  if(!student) return false;
  const raw = student.isActive;
  return raw !== false && raw !== 0 && raw !== "0";
}

function getPaymentEligibleStudentById(id){
  const student = getStudentById(id);
  return isStudentActiveRecord(student) ? student : null;
}

function getPaymentEligibleStudents(){
  return (Array.isArray(students) ? students : []).filter((s) => isStudentActiveRecord(s));
}

function getFirstPaymentEligibleStudent(){
  return getPaymentEligibleStudents()[0] || null;
}

function esc(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

let toastHost = null;
let toastSeq = 0;
function ensureToastHost(){
  if(toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = document.getElementById("appToastHost");
  if(!toastHost){
    toastHost = document.createElement("div");
    toastHost.id = "appToastHost";
    toastHost.className = "toast-host";
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

function showToast(message, { variant = "info", duration = 2200 } = {}){
  const text = String(message || "").trim();
  if(!text) return;
  const host = ensureToastHost();
  const toast = document.createElement("div");
  const variantRaw = String(variant || "info").toLowerCase();
  const type = variantRaw === "success" ? "success" : (variantRaw === "error" ? "error" : "info");
  toast.dataset.toastId = String(++toastSeq);
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = text;
  host.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
  const visibleMs = Math.max(1200, Number(duration) || 0);
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => {
      if(toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }, visibleMs);
}

function showInAppPopup(message, { variant = "", duration = 3200 } = {}){
  const text = String(message || "").trim();
  if(!text) return;
  let normalized = String(variant || "").trim().toLowerCase();
  if(!normalized){
    const x = normalizeTextAscii(text);
    if(/erreur|echec|echou|invalide|introuvable|impossible|interdit|non autoris|insuffisant|refuse|reserve/.test(x)){
      normalized = "error";
    } else if(/mis a jour|mise a jour|ajoute|supprime|confirme|succes|reussi|envoye/.test(x)){
      normalized = "success";
    } else {
      normalized = "info";
    }
  }
  showToast(text, { variant: normalized, duration });
}

let appConfirmResolver = null;
let appConfirmActiveElement = null;

function closeAppConfirm(result = false){
  if(!appConfirmModal) return;
  if(appConfirmModal.style.display !== "none"){
    appConfirmModal.style.display = "none";
    appConfirmModal.setAttribute("aria-hidden", "true");
  }
  const resolver = appConfirmResolver;
  appConfirmResolver = null;
  if(resolver) resolver(Boolean(result));
  const target = appConfirmActiveElement;
  appConfirmActiveElement = null;
  if(target && typeof target.focus === "function" && document.contains(target)){
    requestAnimationFrame(() => {
      try{ target.focus(); }catch(_){}
    });
  }
}

function showAppConfirm({
  title = "Confirmation",
  message = "Confirmer cette action ?",
  okText = "Confirmer",
  cancelText = "Annuler",
  okClass = "danger"
} = {}){
  if(!appConfirmModal || !appConfirmTitle || !appConfirmMessage || !appConfirmOk || !appConfirmCancel){
    showToast("Confirmation indisponible.", { duration: 2200 });
    return Promise.resolve(false);
  }
  if(appConfirmResolver){
    closeAppConfirm(false);
  }
  appConfirmActiveElement = document.activeElement;
  appConfirmTitle.textContent = String(title || "Confirmation");
  appConfirmMessage.textContent = String(message || "Confirmer cette action ?");
  appConfirmCancel.textContent = String(cancelText || "Annuler");
  if(appConfirmCancelTop) appConfirmCancelTop.textContent = String(cancelText || "Annuler");
  appConfirmOk.textContent = String(okText || "Confirmer");
  appConfirmOk.classList.remove("danger", "primary");
  appConfirmOk.classList.add(okClass === "primary" ? "primary" : "danger");
  appConfirmModal.style.display = "flex";
  appConfirmModal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    try{ appConfirmOk.focus(); }catch(_){}
  });
  return new Promise((resolve) => {
    appConfirmResolver = resolve;
  });
}

function getStoredAuthUser(){
  try {
    const raw = localStorage.getItem(KEY_AUTH_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function setAuthState(user){
  currentUser = user || null;
  if(currentUser) localStorage.setItem(KEY_AUTH_USER, JSON.stringify(currentUser));
  else localStorage.removeItem(KEY_AUTH_USER);
  updateAuthUI();
}
function clearAuthState(){
  setAuthState(null);
}
function hasRole(...roles){
  const role = String(currentUser?.role || "").toLowerCase();
  return roles.map(r => String(r).toLowerCase()).includes(role);
}
function canDeleteReceipt(){
  return hasRole("admin", "comptable");
}
function isMixedPaymentInput(){
  return String(elCurrency?.value || "").toUpperCase() === "MIXED";
}
function getPaymentTenderInputSplit(){
  const primary = Number(onlyDigits(elAmount?.value || "") || 0);
  if(isMixedPaymentInput()){
    return {
      usd: Math.max(0, primary),
      cdf: Math.max(0, Number(onlyDigits(elMixedCdfAmount?.value || "") || 0))
    };
  }
  return splitAmountByCurrency(primary, elCurrency?.value || "USD");
}
function paymentTenderEquivalent(tender, targetCurrency, rate = USD_TO_CDF){
  const usd = Math.max(0, Number(tender?.usd || 0));
  const cdf = Math.max(0, Number(tender?.cdf || 0));
  const safeRate = Number(rate || 0);
  if(!(Number.isFinite(safeRate) && safeRate > 0)) return 0;
  return normalizeCurrencyCode(targetCurrency) === "CDF"
    ? Math.round(cdf + (usd * safeRate))
    : Number((usd + (cdf / safeRate)).toFixed(2));
}
function projectedPaymentRemaining(status, tender, rate = USD_TO_CDF){
  const remaining = Number(status?.remaining);
  const safeRate = Number(rate || 0);
  if(!Number.isFinite(remaining) || !(Number.isFinite(safeRate) && safeRate > 0)) return null;
  const statusCurrency = normalizeCurrencyCode(status?.currency || "USD");
  const paid = paymentTenderEquivalent(tender, statusCurrency, safeRate);
  const primary = Math.max(0, remaining - paid);
  return statusCurrency === "CDF"
    ? { usd: Number((primary / safeRate).toFixed(2)), cdf: Math.round(primary) }
    : { usd: Number(primary.toFixed(2)), cdf: Math.round(primary * safeRate) };
}
function syncMixedPaymentUi(){
  const mixed = isMixedPaymentInput();
  if(elMixedCdfAmountField) elMixedCdfAmountField.style.display = mixed ? "" : "none";
  if(elAmountLabel) elAmountLabel.textContent = mixed ? "Montant USD reçu" : "Montant";
  if(elAmount) elAmount.placeholder = mixed ? "Ex: 20" : "Ex: 25 000";
  if(!mixed && elMixedCdfAmount) elMixedCdfAmount.value = "";
}
function canCancelReceipt(){
  return hasRole("admin", "caissier", "comptable");
}
function canDeleteSpending(){
  return hasRole("admin");
}
function canManageStudents(){
  return hasRole("admin", "comptable");
}
function canToggleStudentActive(){
  return hasRole("admin", "caissier");
}
function canAddStudents(){
  return hasRole("admin", "comptable", "caissier");
}
function canChangeClassCode(){
  return hasRole("admin", "caissier");
}
async function auditEvent(action, entityType, entityId, details){
  try{
    await apiFetch("/api/audit/manual", {
      method: "POST",
      body: JSON.stringify({ action, entityType, entityId, details })
    });
  }catch(_){}
}
function showLogin(msg){
  const message = String(msg || "Veuillez vous connecter.").trim();
  const nextPath = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  const params = new URLSearchParams();
  if (message) params.set("msg", message);
  if (nextPath && nextPath !== "/login") params.set("next", nextPath);
  const target = `/login${params.toString() ? `?${params.toString()}` : ""}`;
  if (window.location.pathname === "/login" && window.location.search === `?${params.toString()}`) return;
  window.location.assign(target);
}
function hideLogin(){
  // Auth now uses a dedicated /login page.
}
function updateAuthUI(){
  if(authBadge){
    if(currentUser){
      authBadge.textContent = `${currentUser.username} (${currentUser.role})`;
    } else {
      authBadge.textContent = "Non connecté";
    }
  }
  if(logoutBtn){
    logoutBtn.style.display = currentUser ? "inline-flex" : "none";
  }
  if(brandUserName){
    brandUserName.textContent = window.ecoleConfiguration?.["school.shortName"] || "ETABLISSEMENT";
  }
  if(elCashier){
    elCashier.textContent = currentUser?.username || "—";
  }
  if(stAddBtn){
    stAddBtn.disabled = !canAddStudents();
  }
  if(stLookupOldBtn){
    stLookupOldBtn.disabled = !canAddStudents();
  }
  if(adminUsersSection){
    adminUsersSection.style.display = hasRole("admin") ? "block" : "none";
  }
  const whatsappConfigCard = document.getElementById("whatsappConfigCard");
  if(whatsappConfigCard){
    whatsappConfigCard.style.display = hasRole("admin") ? "block" : "none";
  }
  const busCategoriesCard = document.getElementById("busCategoriesCard");
  if(busCategoriesCard){
    busCategoriesCard.style.display = hasRole("admin", "caissier") ? "block" : "none";
  }
  const feeDistributionSettingsCard = document.getElementById("feeDistributionSettingsCard");
  if(feeDistributionSettingsCard){
    feeDistributionSettingsCard.style.display = hasRole("admin") ? "block" : "none";
  }
  if(setLevelFeeSaveBtn){
    setLevelFeeSaveBtn.disabled = !hasRole("admin");
  }
  if(setSchoolYear){
    setSchoolYear.disabled = !hasRole("admin");
    setSchoolYear.title = hasRole("admin") ? "" : "Modification réservée à l'administrateur";
  }
  if(setSchoolYearSaveBtn){
    setSchoolYearSaveBtn.disabled = !hasRole("admin");
    setSchoolYearSaveBtn.title = hasRole("admin") ? "" : "Modification réservée à l'administrateur";
  }
  updateSyncBadge();
}

function syncSelectEmptyStyle(root = document){
  const node = root && root.querySelectorAll ? root : document;
  const selects = Array.from(node.querySelectorAll("select.input"));
  selects.forEach((sel) => {
    sel.classList.toggle("is-empty", String(sel.value || "").trim() === "");
  });
}

async function renderUsersAdmin(){
  if(!usrTbody || !adminUsersSection) return;
  if(!hasRole("admin")){
    adminUsersSection.style.display = "none";
    return;
  }
  adminUsersSection.style.display = "block";
  try{
    const rows = await apiFetch("/api/users");
    if(!Array.isArray(rows) || !rows.length){
      usrTbody.innerHTML = `<tr><td colspan="5" class="tiny">Aucun utilisateur.</td></tr>`;
      return;
    }
    usrTbody.innerHTML = rows.map((u) => `
      <tr>
        <td><strong>${esc(u.username)}</strong></td>
        <td>
          <select class="input" data-usr-role="${esc(String(u.id))}">
            <option value="caissier" ${u.role === "caissier" ? "selected" : ""}>caissier</option>
            <option value="comptable" ${u.role === "comptable" ? "selected" : ""}>comptable</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
          </select>
        </td>
        <td>
          <select class="input" data-usr-active="${esc(String(u.id))}">
            <option value="1" ${u.isActive ? "selected" : ""}>Actif</option>
            <option value="0" ${!u.isActive ? "selected" : ""}>Inactif</option>
          </select>
        </td>
        <td>
          <input class="input" type="password" data-usr-pass="${esc(String(u.id))}" placeholder="Nouveau mot de passe" />
        </td>
        <td class="row" style="gap:8px">
          <button class="btn" type="button" data-usr-save="${esc(String(u.id))}">Enregistrer</button>
          <button class="btn danger" type="button" data-usr-reset="${esc(String(u.id))}">Réinitialiser mdp</button>
          <button class="btn danger" type="button" data-usr-delete="${esc(String(u.id))}" data-usr-name="${esc(u.username)}">Supprimer</button>
        </td>
      </tr>
    `).join("");
  }catch(err){
    usrTbody.innerHTML = `<tr><td colspan="5" class="tiny">Erreur chargement utilisateurs: ${esc(err.message || err)}</td></tr>`;
  }
}

function apiAvailableHint(ok){
  if(!studentsSourceHint) return;
  studentsSourceHint.textContent = ok ? "Source élèves: API ✅" : "Source élèves: API indisponible";
}

function setApiHostWarning(message){
  if(!apiHostWarning) return;
  if(message){
    apiHostWarning.textContent = message;
    apiHostWarning.style.display = "block";
  }else{
    apiHostWarning.textContent = "";
    apiHostWarning.style.display = "none";
  }
}

function checkApiRequestHostSafety(path){
  const raw = String(path || "");
  if(!/^https?:\/\//i.test(raw)){
    return true; // relative path => same host by default
  }
  try{
    const target = new URL(raw, window.location.origin);
    const pageHost = String(window.location.hostname || "").toLowerCase();
    const apiHost = String(target.hostname || "").toLowerCase();
    const apiIsLocalhost = apiHost === "localhost" || apiHost === "127.0.0.1";
    const pageIsLocalhost = pageHost === "localhost" || pageHost === "127.0.0.1";
    if(apiIsLocalhost && !pageIsLocalhost){
      setApiHostWarning("Erreur: configuration API — l’application pointe vers localhost");
      return false;
    }
    setApiHostWarning("");
    return true;
  }catch{
    return true;
  }
}

function validateApiConfigAtRuntime(){
  const cfg = window.__APP_CONFIG__ || {};
  const possibleBase = String(cfg.apiBase || cfg.API_BASE || cfg.baseUrl || "");
  if(possibleBase) checkApiRequestHostSafety(possibleBase);
}

async function loadServerAddressInfo(){
  if(!serverAddressBadge) return;
  try{
    const info = await apiFetch("/api/server-info");
    const urls = Array.isArray(info?.urls) ? info.urls.map((url) => String(url || "").trim()).filter(Boolean) : [];
    const addresses = Array.isArray(info?.addresses) ? info.addresses.map((ip) => String(ip || "").trim()).filter(Boolean) : [];
    const port = Number(info?.port || 0);
    const primaryUrl = urls[0] || "";
    const primaryAddress = addresses[0] || "";
    if(primaryAddress){
      serverAddressBadge.textContent = `Serveur: ${primaryAddress}${port ? `:${port}` : ""}`;
      serverAddressBadge.title = primaryUrl || `Adresse du serveur: ${primaryAddress}`;
    }else{
      serverAddressBadge.textContent = "Serveur: local";
      serverAddressBadge.title = "Aucune adresse reseau locale detectee";
    }
  }catch(_){
    serverAddressBadge.textContent = "Serveur: indisponible";
    serverAddressBadge.title = "Impossible de lire l'adresse du serveur";
  }
}

function getOutboxEvents(){
  try{
    const raw = localStorage.getItem(KEY_OUTBOX_EVENTS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}
function saveOutboxEvents(list){
  localStorage.setItem(KEY_OUTBOX_EVENTS, JSON.stringify(Array.isArray(list) ? list : []));
  updateSyncBadge();
}
function queueOutboxEvent(type, payload){
  const events = getOutboxEvents();
  events.push({
    id: crypto?.randomUUID ? crypto.randomUUID() : `OUT-${Date.now()}-${Math.random()}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: "pending",
    syncAttempts: 0,
    nextRetryAt: null,
    lastError: ""
  });
  saveOutboxEvents(events);
}

function outboxBackoffDelayMs(attempt){
  const n = Math.max(1, Number(attempt || 1));
  // Cap at 60s: a payment stuck behind a 15-minute backoff reads as
  // "Sync en attente" forever to the cashier once the API is back.
  const seconds = Math.min(60, Math.pow(2, Math.min(n, 10)));
  return seconds * 1000;
}
function updateSyncBadge(){
  if(!syncBadge) return;
  const queue = getOutboxEvents();
  const pending = queue.filter((e) => e.status === "pending").length;
  const failed = queue.filter((e) => e.status === "failed").length;
  syncBadge.classList.remove("offline","pending","error");
  if(!navigator.onLine){
    syncBadge.classList.add("offline");
    syncBadge.textContent = "Hors ligne";
    return;
  }
  if(!apiReachable){
    syncBadge.classList.add("error");
    syncBadge.textContent = "API indisponible";
    return;
  }
  if(failed > 0){
    syncBadge.classList.add("error");
    syncBadge.textContent = `Sync en erreur (${failed})`;
    return;
  }
  if(pending > 0){
    syncBadge.classList.add("pending");
    syncBadge.textContent = `Sync en attente (${pending})`;
    return;
  }
  syncBadge.textContent = "En ligne";
}

async function apiFetch(path, options = {}){
  const url = String(path || "");
  if(/^https?:\/\//i.test(url)){
    checkApiRequestHostSafety(url);
  }
  if(/^https?:\/\//i.test(url)){
    // We intentionally avoid absolute hosts for same-origin correctness.
    throw new Error("Configuration API invalide: utilisez des URLs relatives (/api/...)");
  }
  const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
  try{
    const res = await fetch(url, {
      credentials:"include",
      headers,
      ...options
    });
    const data = await res.json().catch(() => ({}));
    const wasUnreachable = !apiReachable;
    apiReachable = true;
    lastApiError = "";
    updateSyncBadge();
    if(wasUnreachable){
      // API just came back: push queued payments/spendings now instead of
      // waiting for the next sync-loop tick + backoff window.
      setTimeout(() => { flushOutboxEvents({ ignoreSchedule: true }).catch(() => {}); }, 400);
    }
    if(res.status === 401){
      clearAuthState();
      showLogin("Session expirée. Reconnectez-vous.");
      const authErr = new Error(data.error || "Session expirée");
      authErr.status = 401;
      authErr.payload = data;
      throw authErr;
    }
    if(!res.ok){
      const apiErr = new Error(data.error || "Erreur API");
      apiErr.status = Number(res.status || 0);
      apiErr.payload = data;
      throw apiErr;
    }
    return data;
  }catch(err){
    // Network failure / gateway issue
    if(String(err?.message || "").toLowerCase().includes("failed to fetch") || !navigator.onLine){
      apiReachable = false;
      lastApiError = String(err?.message || err || "");
      updateSyncBadge();
    }
    throw err;
  }
}

async function loadFeeTypesFromApi(includeInactive = false){
  try{
    const rows = await apiFetch(`/api/fee-types${includeInactive ? "?includeInactive=1" : ""}`);
    if(Array.isArray(rows) && rows.length){
      const mapped = rows.map((r) => ({
        id: r.id,
        code: String(r.code || "").toUpperCase(),
        labelFr: normalizeFeeName(r.labelFr || r.label_fr || ""),
        defaultCurrency: String(r.defaultCurrency || r.default_currency || "USD").toUpperCase(),
        defaultAmount: Number(r.defaultAmount ?? r.default_amount ?? 0),
        billingCycle: normalizeFeeBillingCycle(r.billingCycle || r.billing_cycle || "monthly"),
        dueMonth: normalizeFeeDueMonthValue(r.dueMonth || r.due_month || "") || null,
        hasFixedPrice: r.hasFixedPrice !== false && r.has_fixed_price !== false,
        scopeLevel: normalizeFeeScopeLevelValue(r.scopeLevel || r.scope_level || "") || null,
        scopeLevels: normalizeFeeScopeLevels(r.scopeLevels || r.scope_levels || [], r.scopeLevel || r.scope_level || ""),
        scopeClasses: normalizeFeeScopeClassList(r.scopeClasses || r.scope_classes || []),
        pricingRules: normalizeFeePricingRules(r.pricingRules || r.pricing_rules || []),
        skipAutoPrint: Boolean(r.skipAutoPrint || r.skip_auto_print),
        active: r.active !== false
      }));
      const hiddenLegacyCodes = new Set(["CD", "BULLETIN", "MINERVAL_ET_L_ETAT", "MINERVAL_ETAT", "MINERVAL_DE_L_ETAT"]);
      const canonicalCodeByLabelKey = {
        "bulletin": "ETAT_BULLETIN",
        "minerval de l etat": "ETAT_MINERVAL"
      };
      const labelKey = (v) => String(v || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’'`]/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const scoreFor = (ft, preferredCode = "") => {
        const code = String(ft?.code || "").toUpperCase();
        let score = 0;
        if(ft?.active !== false) score += 100;
        if(preferredCode && code === preferredCode) score += 20;
        if(Number.isFinite(Number(ft?.id))) score += 1;
        return score;
      };
      const byLabelKey = new Map();
      for(const ft of mapped){
        const code = String(ft.code || "").toUpperCase();
        if(hiddenLegacyCodes.has(code)) continue;
        const key = labelKey(ft.labelFr);
        const mapKey = key || `__${code}:${ft.id}`;
        const preferredCode = canonicalCodeByLabelKey[key] || "";
        const current = byLabelKey.get(mapKey);
        if(!current || scoreFor(ft, preferredCode) > scoreFor(current, preferredCode)){
          byLabelKey.set(mapKey, ft);
        }
      }
      feeTypesApiCache = Array.from(byLabelKey.values());
    } else if(Array.isArray(rows)) {
      feeTypesApiCache = [];
    }
  }catch(_){
    // Keep local/default fallback when API unavailable.
  }
  refreshCachedFeeTypeLabels();
  renderFeeTypeOptions(elFee, getStudentById(selectedStudentId));
  renderFeeSettingsTable();
  syncReportTypeOptions({ keepCurrent: true });
}

function apiLevelToLabel(lvl){
  const v = String(lvl||"").toLowerCase();
  if(v === "maternelle") return "Maternelle";
  if(v === "primaire") return "Primaire";
  if(v === "secondaire") return "Secondaire";
  return "Secondaire";
}

function pickColorFromId(id){
  const colors = ["#2f6fed","#7c3aed","#059669","#ef4444","#f59e0b","#06b6d4","#111827","#10b981"];
  let n = 0;
  for(const ch of String(id||"")) n = (n + ch.charCodeAt(0)) % 997;
  return colors[n % colors.length];
}

async function loadStudents(){
  try{
    const previousById = new Map((Array.isArray(students) ? students : []).map((s) => [String(s?.id || ""), s]));
    const apiStudents = await apiFetch("/api/students?includeInactive=1");
    students = apiStudents.map(s => ({
      ...(previousById.get(String(s.id || "")) || {}),
      id: s.id,
      name: s.fullName,
      searchName: String(s.fullName || "").toLowerCase(),
      className: s.className || "—",
      level: apiLevelToLabel(s.level),
      isActive: Number(s.isActive) !== 0,
      createdAt: s.createdAt || s.created_at || "",
      created_at: s.createdAt || s.created_at || "",
      classEffectiveMonth: String(s.classEffectiveMonth || ""),
      schoolYearStartYear: Number.isFinite(Number(s.schoolYearStartYear)) ? Number(s.schoolYearStartYear) : null,
      studentNote: String(s.studentNote || ""),
      parentName: String(s.parentName || ""),
      parentPhone: String(s.parentPhone || ""),
      familyId: String(s.familyId || ""),
      familyName: String(s.familyName || ""),
      inactiveReasonCategory: String(s.inactiveReasonCategory || ""),
      inactiveReasonNote: String(s.inactiveReasonNote || ""),
      inactiveAt: s.inactiveAt || "",
      inactiveByUsername: String(s.inactiveByUsername || ""),
      isReturningStudent: s.isReturningStudent === true || String(s.isReturningStudent).toLowerCase() === "true",
      monthlyDueUSD: Number(s.monthlyDue || 0),
      monthlyDueCDF: Math.round(Number(s.monthlyDue || 0) * USD_TO_CDF),
      status: String(previousById.get(String(s.id || ""))?.status || "A jour"),
      balance: Number(previousById.get(String(s.id || ""))?.balance || 0),
      matricule: s.matricule || s.id,
      searchMatricule: String(s.matricule || s.id || "").toLowerCase(),
      color: pickColorFromId(s.matricule || s.id)
    }));
    if(typeof renderEnrollmentFamilyOptions === "function") renderEnrollmentFamilyOptions();
    apiAvailableHint(true);
    stApiStatus.textContent = `API: OK (${students.length} élève(s))`;
  }catch(err){
    const msg = String(err?.message || "").toLowerCase();
    // Session errors are handled by apiFetch (login overlay); do not replace with demo data.
    if(msg.includes("session") || msg.includes("unauthorized")){
      return;
    }
    // Keep previous in-memory students when API is temporarily unavailable.
    if(!Array.isArray(students)) students = [];
    apiAvailableHint(false);
    stApiStatus.textContent = `API: indisponible`;
  }

rebuildClassFilter();
refreshStudentsFinancialState();
renderStudentList();
applySuggestedClassCode({ force: false });

// ✅ refresh the currently selected student so dashboard + receipt update
const selectedPaymentStudent = getPaymentEligibleStudentById(selectedStudentId);
const firstPaymentStudent = getFirstPaymentEligibleStudent();
if (selectedPaymentStudent) {
  selectStudent(selectedPaymentStudent.id);
} else if (firstPaymentStudent) {
  selectStudent(firstPaymentStudent.id);
} else {
  clearPaymentStudentSelection({ clearLookup: true });
}
renderDashboard();
} // ✅ CLOSE loadStudents()

/***************
 * Views
 ***************/
function setView(name){
  const allowedViews = new Set(["dashboard","payment","students","grades","receipts","spending","caisse","reports","data-quality","settings"]);
  const requestedView = allowedViews.has(String(name || "")) ? String(name) : "dashboard";
  const nextView = requestedView;
  viewDashboard.classList.toggle("active", nextView === "dashboard");
  viewPayment.classList.toggle("active", nextView === "payment");
  viewStudents.classList.toggle("active", nextView === "students");
  viewGrades?.classList?.toggle("active", nextView === "grades");
  viewReceipts.classList.toggle("active", nextView === "receipts");
  viewSpending.classList.toggle("active", nextView === "spending");
  viewCaisse.classList.toggle("active", nextView === "caisse");
  viewReports.classList.toggle("active", nextView === "reports");
  viewSettings.classList.toggle("active", nextView === "settings");
  document.getElementById("viewDataQuality")?.classList.toggle("active", nextView === "data-quality");
  if(nextView === "data-quality") window.renderDataQuality?.();

  navLinks.forEach(a => a.classList.toggle("active", a.dataset.view === nextView));
  try { localStorage.setItem(KEY_ACTIVE_VIEW, nextView); } catch(_){}

  if(nextView === "dashboard"){
    // Render immediately from local cache, then refresh after API pulls.
    renderDashboard();
    Promise.allSettled([loadPaymentsFromApi(), loadSpendingsFromApi(), loadCaisseTransfersFromApi()]).finally(() => {
      renderDashboard();
      renderTopDailyBalance();
    });
  }
  if(nextView === "payment"){
    clearPaymentStudentSelection({ clearLookup: true });
    if(typeof setPaymentWorkflowStep === "function") setPaymentWorkflowStep(1, { focus: false });
    Promise.allSettled([loadPaymentsFromApi()]).finally(() => {
      refreshStudentsFinancialState();
      renderStudentList();
      renderTopDailyBalance();
    });
  }
  if(nextView === "students"){
    Promise.allSettled([loadPaymentsFromApi()]).finally(() => {
      refreshStudentsFinancialState();
      renderStudentsTable();
      renderTopDailyBalance();
    });
  }
  if(nextView === "grades" && typeof loadGradesPage === "function"){
    loadGradesPage().catch(() => {});
  }
  if(nextView === "receipts"){
    Promise.allSettled([loadPaymentsFromApi(), loadReceiptsFromApi()]).finally(() => renderReceiptsTable());
  }
  if(nextView === "spending") renderSpendingTable();
  if(nextView === "caisse"){
    renderCaisse();
    Promise.allSettled([loadPaymentsFromApi(), loadSpendingsFromApi(), loadCaisseTransfersFromApi()]).finally(() => renderCaisse());
  }
  if(nextView === "reports"){
    Promise.allSettled([loadPaymentsFromApi(), loadSpendingsFromApi()]).finally(() => renderReports());
  }
  if(nextView === "settings"){
    window.openControlCenter?.();
    loadFeeTypesFromApi(true).catch(() => {});
    if(hasRole("admin") && typeof loadFeeDistributionSettings === "function") loadFeeDistributionSettings().catch(() => {});
    syncSettingsView();
    renderUsersAdmin();
  }
}

function getSavedActiveView(){
  try{
    const v = String(localStorage.getItem(KEY_ACTIVE_VIEW) || "").trim();
    return ["dashboard","payment","students","grades","receipts","spending","caisse","reports","data-quality","settings"].includes(v) ? v : "dashboard";
  }catch(_){
    return "dashboard";
  }
}

function getUiState(){
  try{
    const raw = localStorage.getItem(KEY_UI_STATE);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  }catch(_){
    return {};
  }
}

function saveUiStatePatch(patch){
  try{
    const current = getUiState();
    localStorage.setItem(KEY_UI_STATE, JSON.stringify({ ...current, ...(patch || {}) }));
  }catch(_){}
}

function restorePaymentSelectionUiState(){
  const ui = getUiState();
  if(elCurrency && ui.paymentCurrency && ["USD","CDF"].includes(String(ui.paymentCurrency).toUpperCase())){
    elCurrency.value = String(ui.paymentCurrency).toUpperCase();
  }
  if(elMonth && ui.paymentMonth){
    const keep = String(ui.paymentMonth);
    if(Array.from(elMonth.options || []).some(opt => String(opt.value) === keep)){
      elMonth.value = keep;
    }
  }
  if(elFee){
    const wantedId = String(ui.paymentFeeTypeId || "").trim();
    const wantedCode = String(ui.paymentFeeTypeCode || "").trim().toUpperCase();
    const wantedLabel = normalizeFeeName(ui.paymentFeeLabel || "");
    let matched = false;
    if(wantedId){
      for(const opt of Array.from(elFee.options || [])){
        if(String(opt.getAttribute("data-fee-type-id") || "") === wantedId){
          elFee.value = String(opt.value || "");
          matched = true;
          break;
        }
      }
    }
    if(!matched && wantedCode){
      for(const opt of Array.from(elFee.options || [])){
        if(String(opt.getAttribute("data-fee-code") || "").toUpperCase() === wantedCode){
          elFee.value = String(opt.value || "");
          matched = true;
          break;
        }
      }
    }
    if(!matched && wantedLabel){
      const labels = Array.from(elFee.options || []).map(o => normalizeFeeName(o.value));
      if(labels.includes(wantedLabel)) elFee.value = wantedLabel;
    }
  }
  if(elStudentLookupLevelFilter){
    const keepLevel = normalizeApiLevelValue(ui.paymentLookupLevel || "");
    elStudentLookupLevelFilter.value = keepLevel || "";
  }
  const savedStudentId = String(ui.selectedStudentId || "").trim();
  if(savedStudentId){
    selectedStudentId = savedStudentId;
  }
}

navLinks.forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    setView(a.dataset.view);
  });
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if(t && t.matches && t.matches("select.input")){
    syncSelectEmptyStyle();
  }
});

/***************
 * Student list
 ***************/
function rebuildClassFilter(){
  if(!elClassFilter) return;
  const keep = elClassFilter.value || "";
  elClassFilter.innerHTML = `<option value="">Classe (Toutes)</option>`;
  const classes = [...new Set(getPaymentEligibleStudents().map((s) => s.className))].sort();
  for(const c of classes){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    elClassFilter.appendChild(opt);
  }
  elClassFilter.value = classes.includes(keep) ? keep : "";
  paymentVisibleCount = PAYMENT_LIST_STEP;
}

function getPaymentStudentsOrderedByClass(){
  const nextSig = hashRowsSignature(students, (s) => `${s?.id}|${s?.className}|${s?.name}|${isStudentActiveRecord(s) ? 1 : 0}`);
  if(nextSig !== paymentStudentsOrderSignature){
    paymentStudentsOrderSignature = nextSig;
    paymentStudentsOrderedCache = getPaymentEligibleStudents()
      .slice()
      .sort((a,b) => {
        const c = String(a.className || "").localeCompare(String(b.className || ""), "fr");
        if(c !== 0) return c;
        return String(a.name || "").localeCompare(String(b.name || ""), "fr");
      });
  }
  return paymentStudentsOrderedCache;
}

function renderStudentList(){
  if(!elStudentList || !elSearch || !elClassFilter || !elStatusFilter) return;
  if(elStudentList.offsetParent === null) return;
  const q = (elSearch.value || "").toLowerCase().trim();
  const classF = elClassFilter.value;
  const statusF = elStatusFilter.value;

  const filtered = getPaymentStudentsOrderedByClass().filter((s) => {
    const matchesQ = !q || (s.name||"").toLowerCase().includes(q) || String(s.matricule||"").toLowerCase().includes(q);
    const matchesClass = !classF || s.className === classF;
    const matchesStatus = !statusF || s.status === statusF;
    return matchesQ && matchesClass && matchesStatus;
  });
  const visible = filtered.slice(0, paymentVisibleCount);

  const grouped = {};
  for(const s of visible){
    const k = s.className || "—";
    if(!grouped[k]) grouped[k] = [];
    grouped[k].push(s);
  }

  elStudentList.innerHTML = "";
  const classNames = Object.keys(grouped).sort((a,b) => a.localeCompare(b, "fr"));
  for(const cls of classNames){
    const rows = grouped[cls];

    const title = document.createElement("div");
    title.className = "tiny";
    title.style.marginTop = "6px";
    title.style.marginBottom = "4px";
    title.textContent = `${cls} (${rows.length})`;
    elStudentList.appendChild(title);

    for(const s of rows){
      const item = document.createElement("div");
      item.className = "student" + (s.id === selectedStudentId ? " active" : "");
      item.dataset.id = s.id;

      const left = document.createElement("div");
      left.className = "left";

      const av = document.createElement("div");
      av.className = "avatar";
      av.style.background = s.color || "#2f6fed";
      av.textContent = initials(s.name);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<strong>${esc(s.name)}</strong><small>${esc(formatClassLevel(s.className, s.level))}</small>`;

      left.appendChild(av);
      left.appendChild(meta);

      const badge = document.createElement("span");
      const badgeClass = s.status === "A jour" ? "ok" : (s.status === "Partiel" ? "partial" : "late");
      const badgeLabel = s.status === "A jour" ? "À jour" : (s.status === "Partiel" ? "Partiel" : "En retard");
      badge.className = "badge " + badgeClass;
      badge.textContent = badgeLabel;

      item.appendChild(left);
      item.appendChild(badge);
      item.addEventListener("click", () => selectStudent(s.id));
      elStudentList.appendChild(item);
    }

  }

  if(filtered.length > paymentVisibleCount){
    const more = document.createElement("button");
    more.className = "btn";
    more.style.width = "100%";
    more.style.marginTop = "8px";
    more.textContent = `Voir plus (${filtered.length - paymentVisibleCount})`;
    more.addEventListener("click", () => {
      paymentVisibleCount += PAYMENT_LIST_STEP;
      renderStudentList();
    });
    elStudentList.appendChild(more);
  }
  if(paymentVisibleCount > PAYMENT_LIST_STEP){
    const less = document.createElement("button");
    less.className = "btn";
    less.style.width = "100%";
    less.style.marginTop = "8px";
    less.textContent = "Voir moins";
    less.addEventListener("click", () => {
      paymentVisibleCount = PAYMENT_LIST_STEP;
      renderStudentList();
    });
    elStudentList.appendChild(less);
  }

  if(!filtered.length){
    elStudentList.innerHTML = `<div class="tiny" style="opacity:.7;">Aucun élève.</div>`;
  }
}

/***************
 * Receipt preview
 ***************/
function shouldShowReceiptMonthField({ feeTypeId = null, feeTypeCode = "", feeLabel = "", billingCycle = "" } = {}){
  // Cycle explicite prioritaire : un frais annuel (paiement unique) ou un article
  // vendu n'a pas de "mois payé".
  if(billingCycle){
    return normalizeFeeBillingCycle(billingCycle) === "monthly";
  }
  const feeMeta =
    findFeeTypeById(feeTypeId) ||
    findFeeTypeByCode(feeTypeCode) ||
    findFeeTypeByLabel(feeLabel);
  if(feeMeta){
    return normalizeFeeBillingCycle(feeMeta.billingCycle) === "monthly";
  }
  return true;
}

function updateReceiptPreview({receiptNo, dateTime, student, fee, feeTypeId = null, feeTypeCode = "", billingCycle = "", month, amount, currency, amountUSDReceived = null, amountCDFReceived = null, remainingUSD = null, remainingCDF = null, mode, cashier}){
  const isMixed = String(currency || "").toUpperCase() === "MIXED" || (Number(amountUSDReceived || 0) > 0 && Number(amountCDFReceived || 0) > 0);
  const tender = isMixed
    ? { usd: Number(amountUSDReceived || 0), cdf: Number(amountCDFReceived || 0) }
    : splitAmountByCurrency(amount, currency);
  const fx = isMixed
    ? { usd: paymentTenderEquivalent(tender, "USD"), cdf: paymentTenderEquivalent(tender, "CDF") }
    : computeFx(amount, currency);
  const hasRemainingPair = remainingUSD != null && remainingCDF != null
    && Number.isFinite(Number(remainingUSD)) && Number.isFinite(Number(remainingCDF));
  const remainingLabel = hasRemainingPair
    ? `${formatUSD(remainingUSD)} / ${formatMoney(remainingCDF, "CDF")}`
    : "";
  const showMonth = shouldShowReceiptMonthField({ feeTypeId, feeTypeCode, feeLabel: fee, billingCycle });

  rDate.textContent = fmtDateTime(dateTime);
  rNo.textContent = receiptNo || "—";
  if(rSchoolYear) rSchoolYear.textContent = currentSchoolYearLabel() || "—";
  rStudent.textContent = student ? student.name : "—";
  rClass.textContent = student ? student.className : "—";
  if(rMonthRow){
    rMonthRow.hidden = !showMonth;
  }
  rMonth.textContent = showMonth ? (month || "—") : "";
  rFee.textContent = fee || "—";

  rAmt.textContent = isMixed
    ? `${formatUSD(tender.usd)} + ${formatMoney(tender.cdf, "CDF")}`
    : (amount ? formatMoney(amount, currency) : "—");
  rFx.textContent = (amount || isMixed)
    ? (isMixed
        ? `Total: ${formatUSD(fx.usd)} / ${formatMoney(fx.cdf, "CDF")}${remainingLabel ? ` • Reste: ${remainingLabel}` : ""}`
        : (currency === "USD" ? `≈ ${formatMoney(fx.cdf, "CDF")}` : `≈ ${formatMoney(fx.usd, "USD")}`))
    : "—";

  rMode.textContent = mode || "—";
  rCashier.textContent = cashier || "—";

  if(elFxHint){
    elFxHint.textContent = (amount || isMixed)
      ? (isMixed
          ? `Paiement mixte: ${formatUSD(tender.usd)} + ${formatMoney(tender.cdf, "CDF")} = ${formatUSD(fx.usd)} • Reste: ${remainingLabel || "—"} (Taux: 1 USD = ${formatIntSpaced(USD_TO_CDF)} CDF)`
          : currency === "USD"
          ? `Conversion: ≈ ${formatMoney(fx.cdf, "CDF")} (Taux: 1 USD = ${formatIntSpaced(USD_TO_CDF)} CDF)`
          : `Conversion: ≈ ${formatMoney(fx.usd, "USD")} (Taux: 1 USD = ${formatIntSpaced(USD_TO_CDF)} CDF)`)
      : "Conversion: —";
  }
}

function refreshReceiptPreviewFromForm(){
  const s = getPaymentEligibleStudentById(selectedStudentId);
  const selectedFeeMeta = getSelectedFeeTypeMeta();
  const tender = getPaymentTenderInputSplit();
  const mixed = isMixedPaymentInput();
  const projectedRemaining = mixed ? projectedPaymentRemaining(selectedStudentFeeStatus, tender) : null;
  if(elSelBal && selectedStudentFeeStatus){
    if(projectedRemaining){
      elSelBal.textContent = `${formatUSD(projectedRemaining.usd)} / ${formatMoney(projectedRemaining.cdf, "CDF")}`;
    } else {
      const currentRemaining = Number(selectedStudentFeeStatus.remaining || 0);
      const currentCurrency = normalizeCurrencyCode(selectedStudentFeeStatus.currency || "USD");
      elSelBal.textContent = currentCurrency === "CDF"
        ? formatMoney(currentRemaining, "CDF")
        : formatUSD(currentRemaining);
    }
  }
  updateReceiptPreview({
    receiptNo: getNextReceiptNoForUi(),
    dateTime: new Date(),
    student: s || null,
    fee: elFee?.value || "",
    feeTypeId: selectedFeeMeta?.id ?? null,
    feeTypeCode: selectedFeeMeta?.code || "",
    month: elMonth?.value || "",
    amount: mixed ? paymentTenderEquivalent(tender, selectedStudentFeeStatus?.currency || selectedFeeMeta?.defaultCurrency || "USD") : parseInt(onlyDigits(elAmount?.value || "") || "0", 10),
    currency: mixed ? "MIXED" : (elCurrency?.value || "USD"),
    amountUSDReceived: mixed ? tender.usd : null,
    amountCDFReceived: mixed ? tender.cdf : null,
    remainingUSD: projectedRemaining?.usd ?? null,
    remainingCDF: projectedRemaining?.cdf ?? null,
    mode: DEFAULT_PAYMENT_MODE,
    cashier: elCashier?.textContent || ""
  });
}

function clearPaymentStudentSelection({ clearLookup = false } = {}){
  if(typeof resetPaymentFeeChoice === "function") resetPaymentFeeChoice();
  selectedStudentId = null;
  selectedStudentFeeStatus = null;
  saveUiStatePatch({ selectedStudentId: "" });
  if(elSelName) elSelName.textContent = document.getElementById("paymentSelectedStudent") ? "Aucun élève" : "—";
  if(elSelMat) elSelMat.textContent = "—";
  if(elSelClass) elSelClass.textContent = "—";
  if(elSelBal) elSelBal.textContent = "—";
  if(openStudentProfileFromPayment) openStudentProfileFromPayment.disabled = true;
  if(elStudentDropdown){
    elStudentDropdown.innerHTML = "";
    elStudentDropdown.style.display = "none";
  }
  if(clearLookup && elStudentLookup){
    elStudentLookup.value = "";
  }
  renderPaidMonthsBadges(null);
  updatePaymentStatusHint(null);
  if(elMonth){
    for(const opt of Array.from(elMonth.options || [])){
      opt.disabled = false;
    }
  }
  validateForm();
  refreshReceiptPreviewFromForm();
  renderStudentList();
}

/***************
 * Select student
 ***************/
function selectStudent(id){
  const s = getStudentById(id);
  if(!s) return;
  if(!isStudentActiveRecord(s)){
    if(String(selectedStudentId || "") === String(id || "")){
      clearPaymentStudentSelection({ clearLookup: true });
    } else {
      renderStudentList();
    }
    showInAppPopup("Eleve inactif. Reactivez-le avant d'enregistrer un paiement.");
    return;
  }
  if(typeof resetPaymentFeeChoice === "function") resetPaymentFeeChoice();
  selectedStudentId = id;
  saveUiStatePatch({ selectedStudentId: String(id || "") });
  if(openStudentProfileFromPayment) openStudentProfileFromPayment.disabled = false;
  renderFeeTypeOptions(elFee, s);
  applyFeeTypeSelectionBehavior();

  elSelName.textContent = s.name;
  elSelMat.textContent = s.matricule || s.id;
  elSelClass.textContent = formatClassLevel(s.className, s.level);
  const monthRemainingUSD = getStudentRemainingForMonthUSD(s, elMonth.value);
  elSelBal.textContent = formatUSD(monthRemainingUSD);

  validateForm();

  const selectedFeeMeta = getSelectedFeeTypeMeta();
  updateReceiptPreview({
    receiptNo: getNextReceiptNoForUi(),
    dateTime: new Date(),
    student: s,
    fee: elFee.value,
    feeTypeId: selectedFeeMeta?.id ?? null,
    feeTypeCode: selectedFeeMeta?.code || "",
    month: elMonth.value,
    amount: parseInt(onlyDigits(elAmount.value)||"0",10),
    currency: elCurrency.value,
    mode: DEFAULT_PAYMENT_MODE,
    cashier: elCashier.textContent
  });

  loadSelectedStudentFeeStatus({ applyMonthDefault: true }).catch(() => {});
  prefetchNextReceiptNo().catch(() => {});
  syncStudentLookupFromSelection();
  renderStudentList();
}

function syncStudentLookupFromSelection(){
  if(!elStudentLookup) return;
  const s = getPaymentEligibleStudentById(selectedStudentId);
  if(!s){
    elStudentLookup.value = "";
    return;
  }
  elStudentLookup.value = s.name || "";
}

function setupStudentLookup(){
  if(!elStudentLookup || !elStudentDropdown) return;
  if(elStudentLookup.dataset.bound === "1") return;
  elStudentLookup.dataset.bound = "1";

  let focusedIndex = -1;

  const getItems = () => Array.from(elStudentDropdown.querySelectorAll(".dropdown-item"));

  elStudentDropdown.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".dropdown-item");
    if(!item) return;
    e.preventDefault();
    const studentId = String(item.dataset.id || "").trim();
    if(!studentId) return;
    const s = getStudentById(studentId);
    if(!s) return;
    selectStudent(s.id);
    elStudentLookup.value = s.name || "";
    elStudentDropdown.style.display = "none";
  });

  const renderDropdown = (rawQuery) => {
    const query = String(rawQuery || "").toLowerCase().trim();
    const levelFilter = normalizeApiLevelValue(elStudentLookupLevelFilter?.value || "");
    elStudentDropdown.innerHTML = "";
    focusedIndex = -1;

    if(!query && !levelFilter){
      elStudentDropdown.style.display = "none";
      return;
    }

    const matched = getPaymentStudentsOrderedByClass()
      .filter((s) => {
        if(levelFilter && normalizeApiLevelValue(s.level) !== levelFilter) return false;
        if(!query) return true;
        const name = s.searchName || (s.searchName = String(s.name || "").toLowerCase());
        const mat = s.searchMatricule || (s.searchMatricule = String(s.matricule || s.id || "").toLowerCase());
        return name.includes(query) || mat.includes(query);
      })
      .slice(0, 30);

    if(!matched.length){
      elStudentDropdown.innerHTML = `<div class="dropdown-empty">Aucun élève trouvé</div>`;
      elStudentDropdown.style.display = "block";
      return;
    }

    const frag = document.createDocumentFragment();
    matched.forEach((s) => {
      const badgeClass = s.status === "A jour" ? "ok" : (s.status === "Partiel" ? "partial" : "late");
      const badgeLabel = s.status === "A jour" ? "À jour" : (s.status === "Partiel" ? "Partiel" : "En retard");
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.dataset.id = String(s.id || "");
      item.innerHTML = `
        <div class="avatar" style="background:${esc(s.color || "#2f6fed")}">${esc(initials(s.name))}</div>
        <div class="d-meta">
          <strong>${esc(s.name)}</strong>
          <small>${esc(formatClassLevel(s.className, s.level))} — ${esc(s.matricule || s.id)}</small>
        </div>
        <span class="badge ${badgeClass}">${esc(badgeLabel)}</span>
      `;
      frag.appendChild(item);
    });
    elStudentDropdown.appendChild(frag);

    elStudentDropdown.style.display = "block";
  };
  const renderDropdownDebounced = debounce((rawQuery) => {
    renderDropdown(rawQuery);
  }, 90);

  elStudentLookup.addEventListener("input", () => {
    markPaymentUiInteraction();
    renderDropdownDebounced(elStudentLookup.value);
  });
  elStudentLookup.addEventListener("focus", () => {
    markPaymentUiInteraction();
    const levelFilter = normalizeApiLevelValue(elStudentLookupLevelFilter?.value || "");
    if(elStudentLookup.value || levelFilter) renderDropdown(elStudentLookup.value);
  });
  elStudentLookup.addEventListener("blur", () => {
    setTimeout(() => { elStudentDropdown.style.display = "none"; }, 150);
  });

  elStudentLookup.addEventListener("keydown", (e) => {
    const items = getItems();
    if(!items.length) return;

    if(e.key === "ArrowDown"){
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle("focused", i === focusedIndex));
    } else if(e.key === "ArrowUp"){
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle("focused", i === focusedIndex));
    } else if(e.key === "Enter" && focusedIndex >= 0){
      e.preventDefault();
      items[focusedIndex].dispatchEvent(new MouseEvent("mousedown"));
    } else if(e.key === "Escape"){
      elStudentDropdown.style.display = "none";
    }
  });
  if(elStudentLookupLevelFilter && elStudentLookupLevelFilter.dataset.bound !== "1"){
    elStudentLookupLevelFilter.dataset.bound = "1";
    elStudentLookupLevelFilter.addEventListener("change", () => {
      markPaymentUiInteraction();
      const levelFilter = normalizeApiLevelValue(elStudentLookupLevelFilter.value || "");
      saveUiStatePatch({ paymentLookupLevel: levelFilter });
      renderDropdown(elStudentLookup.value);
      if(document.activeElement !== elStudentLookup){
        elStudentLookup.focus();
      }
    });
  }
}

function tranchePrerequisiteLockMessage(statusObj = null){
  const status = statusObj || selectedStudentFeeStatus || {};
  const prerequisiteFeeLabel = String(status?.tranchePrerequisiteFeeLabel || "").trim();
  const prerequisiteMonth = monthLabelFromMonthKey(status?.tranchePrerequisiteDueMonth || "");
  const baseLabel = prerequisiteFeeLabel || "la tranche precedente";
  if(prerequisiteMonth){
    return `Vous devez d'abord solder ${baseLabel} (${prerequisiteMonth}).`;
  }
  return `Vous devez d'abord solder ${baseLabel}.`;
}

function validateForm(){
  const amt = parseInt(onlyDigits(elAmount.value)||"0",10);
  const tender = getPaymentTenderInputSplit();
  const tenderHasValue = Number(tender.usd || 0) > 0 || Number(tender.cdf || 0) > 0;
  const selectedStudent = getStudentById(selectedStudentId);
  const inactiveSelected = Boolean(selectedStudent) && !isStudentActiveRecord(selectedStudent);
  const s = inactiveSelected ? null : selectedStudent;
  const hasBaseInputs = Boolean(s?.id) && (isMixedPaymentInput() ? tenderHasValue : amt > 0);
  let blockedByAnnualLock = false;
  let blockedByTranchePrerequisite = false;
  let blockedByMonthOrder = false;
  let blockedByOverpay = false;
  let reason = "";
  const serverRequiredMonth = monthLabelForActiveSchoolYear(selectedStudentFeeStatus?.nextDueMonth || "");
  const feeMeta = getSelectedFeeTypeMeta();
  const feeCycle = normalizeFeeBillingCycle(selectedStudentFeeStatus?.feeTypeBillingCycle || feeMeta?.billingCycle || "monthly");
  if(s && feeCycle === "annual" && Boolean(selectedStudentFeeStatus?.annualPaymentLocked)){
    blockedByAnnualLock = true;
  }
  if(s && Boolean(selectedStudentFeeStatus?.tranchePrerequisiteBlocked)){
    blockedByTranchePrerequisite = true;
  }
  const shouldLockMonth = Boolean(serverRequiredMonth) && (feeCycle === "annual" || Number(selectedStudentFeeStatus?.remaining || 0) > 0);
  if(!blockedByAnnualLock && !blockedByTranchePrerequisite && s && shouldLockMonth){
    if(elMonth.value !== serverRequiredMonth){
      blockedByMonthOrder = true;
    }
  }
  const limit = getSelectedFeeAmountLimitForInputCurrency();
  const amountForLimit = limit?.inputCurrency === "MIXED"
    ? paymentTenderEquivalent(tender, limit.statusCurrency)
    : amt;
  if(limit && amountForLimit > 0 && Number.isFinite(limit.maxInputAmount) && limit.maxInputAmount >= 0){
    blockedByOverpay = amountForLimit > (limit.maxInputAmount + 0.000001);
  }
  if(inactiveSelected){
    reason = "Eleve inactif. Reactivez-le avant d'enregistrer un paiement.";
  } else if(blockedByAnnualLock){
    const lockMonth = monthLabelForActiveSchoolYear(selectedStudentFeeStatus?.annualPaymentLockMonth || "");
    reason = lockMonth
      ? `Ce frais annuel est deja paye pour cette annee scolaire (${lockMonth}).`
      : "Ce frais annuel est deja paye pour cette annee scolaire.";
  } else if(blockedByTranchePrerequisite){
    reason = tranchePrerequisiteLockMessage(selectedStudentFeeStatus);
  } else if(blockedByMonthOrder){
    if(feeCycle === "annual"){
      reason = `Ce type de frais est annuel. Mois autorise: ${serverRequiredMonth || "mois du"}.`;
    } else {
      reason = `Ce paiement doit d'abord couvrir: ${serverRequiredMonth || "le prochain mois du"}.`;
    }
  } else if(blockedByOverpay){
    reason = "Montant superieur au solde autorise pour ce mois.";
  }
  const feeNotChosen = typeof isPaymentFeeChoiceConfirmed === "function" && !isPaymentFeeChoiceConfirmed();
  if(feeNotChosen && s) reason = "Choisissez le frais demandé par la famille.";
  const confirmationInFlight = typeof paymentConfirmationInFlight !== "undefined" && paymentConfirmationInFlight;
  elConfirm.disabled = confirmationInFlight || feeNotChosen || !hasBaseInputs || inactiveSelected || blockedByAnnualLock || blockedByTranchePrerequisite || blockedByMonthOrder || blockedByOverpay;
  if(elConfirm){
    elConfirm.title = reason;
  }
  if(typeof syncPaymentWorkflowUi === "function") syncPaymentWorkflowUi();
}

function getSelectedFeeAmountLimitForInputCurrency(){
  const feeMeta = (typeof getSelectedFeeTypeMeta === "function" ? getSelectedFeeTypeMeta() : null) || findFeeTypeByLabel(elFee?.value || "");
  const feeCycle = normalizeFeeBillingCycle(feeMeta?.billingCycle || selectedStudentFeeStatus?.feeTypeBillingCycle || "monthly");
  if(feeCycle === "item" || feeMeta?.hasFixedPrice === false) return null;
  const st = selectedStudentFeeStatus || null;
  if(!st) return null;
  const remaining = Number(st.remaining || 0);
  const dueAmount = Number(st.dueAmount || 0);
  const statusCurrency = String(st.currency || "USD").toUpperCase();
  const inputCurrency = String(elCurrency?.value || statusCurrency).toUpperCase();
  if(!(Number.isFinite(remaining) && remaining >= 0)) return null;
  if(!(Number.isFinite(dueAmount) && dueAmount >= 0)) return null;

  if(inputCurrency === "MIXED"){
    return {
      remaining,
      dueAmount,
      statusCurrency,
      inputCurrency,
      maxInputAmount: Math.max(0, remaining)
    };
  }

  let maxInputAmount = remaining;
  if(inputCurrency !== statusCurrency){
    const rate = Number(USD_TO_CDF || 0);
    if(!(Number.isFinite(rate) && rate > 0)) return null;
    if(statusCurrency === "USD" && inputCurrency === "CDF"){
      maxInputAmount = Math.floor(remaining * rate);
    } else if(statusCurrency === "CDF" && inputCurrency === "USD"){
      maxInputAmount = Math.floor(remaining / rate);
    } else {
      return null;
    }
  }
  return {
    remaining,
    dueAmount,
    statusCurrency,
    inputCurrency,
    maxInputAmount: Math.max(0, Number(maxInputAmount || 0))
  };
}

function enforceAmountLimitForSelectedMonth({ notify = false } = {}){
  if(!elAmount) return false;
  const limit = getSelectedFeeAmountLimitForInputCurrency();
  if(!limit) return false;
  const rawAmt = limit.inputCurrency === "MIXED"
    ? paymentTenderEquivalent(getPaymentTenderInputSplit(), limit.statusCurrency)
    : parseInt(onlyDigits(elAmount.value)||"0",10);
  if(!(rawAmt > 0)) return false;
  const max = Number(limit.maxInputAmount || 0);
  if(!Number.isFinite(max)) return false;
  if(rawAmt <= max) return false;
  if(limit.inputCurrency === "MIXED"){
    if(notify){
      const maxLabel = limit.statusCurrency === "USD" ? formatUSD(max) : formatMoney(max, "CDF");
      showInAppPopup(`Le paiement mixte dépasse le solde de ce mois. Maximum autorisé: ${maxLabel}.`);
    }
    return true;
  }
  elAmount.value = max > 0 ? formatIntSpaced(Math.max(0, Math.floor(max))) : "";
  if(notify){
    const maxLabel = limit.inputCurrency === "USD"
      ? formatUSD(max)
      : formatMoney(max, limit.inputCurrency);
    showInAppPopup(`Le montant dépasse le solde de ce mois. Maximum autorisé: ${maxLabel}.`);
  }
  return true;
}
