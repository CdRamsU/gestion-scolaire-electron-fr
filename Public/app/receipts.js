/***************
 * Receipts view (offline) — unchanged
 ***************/

function dateOnlyISO(iso){
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function passesDateRange(payment, fromVal, toVal){
  if(!fromVal && !toVal) return true;
  const d = dateOnlyISO(payment.createdAt);
  const fromIso = normalizeLooseDateToISO(fromVal);
  const toIso = normalizeLooseDateToISO(toVal);
  if(fromIso && d < fromIso) return false;
  if(toIso && d > toIso) return false;
  return true;
}

function monthLabelFromMonthKey(monthKey){
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if(!m) return String(monthKey || "");
  const idx = Number(m[2]) - 1;
  return MONTH_LABELS_FR[idx] || String(monthKey || "");
}
function monthKeyFromLabelFR(label){
  const idx = monthLabelToIndexFR(label);
  if(idx < 0) return "";
  const year = monthYearForSchoolMonthLabel(label);
  if(!year) return "";
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}
function getSelectedReportDateISO(){
  const confirmed = normalizeLooseDateToISO(reportConfirmedDateIso || "");
  if(confirmed) return confirmed;
  const fromInput = normalizeLooseDateToISO(repDateSel?.value || "");
  if(fromInput) return fromInput;
  return toDateISO(new Date());
}
function confirmReportDateSelection({ render = true } = {}){
  const parsed = normalizeLooseDateToISO(repDateSel?.value || "");
  if(!parsed){
    showInAppPopup("Date invalide. Utilisez le format jj/mm/aaaa.");
    return false;
  }
  reportConfirmedDateIso = parsed;
  if(repDateSel){
    const d = new Date(parsed);
    if(Number.isFinite(d.getTime())) repDateSel.value = fmtDateFrLong(d);
  }
  if(render) renderReports();
  return true;
}
function selectedReportMonthKey(){
  const fromMonthSelector = monthKeyFromLabelFR(repMonthSel?.value || "");
  if(fromMonthSelector) return fromMonthSelector;
  const fromDate = monthKeyFromDateISO(getSelectedReportDateISO());
  if(fromDate && monthLabelForActiveSchoolYear(fromDate)) return fromDate;
  const fromDashboardMonth = monthKeyFromLabelFR(dashMonth?.value || "");
  if(fromDashboardMonth) return fromDashboardMonth;
  return monthKeyFromLabelFR(getDefaultSchoolMonthLabel());
}
function paymentMonthKey(p){
  const mk = String(p?.paidForMonth || p?.monthKey || "").trim();
  if(/^\d{4}-\d{2}$/.test(mk)) return mk;
  return monthKeyFromLabelFR(p?.month || "");
}
function paymentCreatedMonthKey(p){
  const created = p?.createdAt ? new Date(p.createdAt) : null;
  if(!created || !Number.isFinite(created.getTime())) return "";
  return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
}
function getSelectedFeeTypeMeta(){
  if(!elFee) return null;
  const opt = elFee.options?.[elFee.selectedIndex];
  const idRaw = opt?.getAttribute?.("data-fee-type-id") || "";
  const code = String(opt?.getAttribute?.("data-fee-code") || "");
  const billingCycle = normalizeFeeBillingCycle(opt?.getAttribute?.("data-fee-cycle") || "monthly");
  const fixedPriceAttr = String(opt?.getAttribute?.("data-fee-fixed-price") || "1");
  const idNum = Number(idRaw);
  const cached = (Number.isFinite(idNum) ? findFeeTypeById(idNum) : null)
    || findFeeTypeByCode(code)
    || findFeeTypeByLabel(elFee.value || "")
    || {};
  return {
    ...cached,
    id: Number.isFinite(idNum) ? idNum : null,
    code,
    billingCycle,
    hasFixedPrice: fixedPriceAttr !== "0" && cached?.hasFixedPrice !== false,
    labelFr: normalizeFeeName(elFee.value || "")
  };
}
async function loadReportsSummaryApi(monthKey, { force = false } = {}){
  const mk = String(monthKey || "");
  if(!mk) return null;
  if(!force && reportsSummaryApiCache.has(mk)) return reportsSummaryApiCache.get(mk);
  try{
    const data = await apiFetch(`/api/reports/summary?month=${encodeURIComponent(mk)}`);
    reportsSummaryApiCache.set(mk, data || null);
    return data || null;
  }catch(_){
    if(force) return null;
    return reportsSummaryApiCache.get(mk) || null;
  }
}
async function loadLateStudentsReportApi(monthKey, { force = false } = {}){
  const mk = String(monthKey || "");
  if(!mk) return null;
  if(!force && lateStudentsReportApiCache.has(mk)) return lateStudentsReportApiCache.get(mk);
  try{
    const data = await apiFetch(`/api/reports/late-students?month=${encodeURIComponent(mk)}`);
    lateStudentsReportApiCache.set(mk, data || null);
    return data || null;
  }catch(_){
    return lateStudentsReportApiCache.get(mk) || null;
  }
}
async function loadBusReportApi(monthKey, { force = false } = {}){
  const mk = String(monthKey || "");
  if(!mk) return null;
  if(!force && busReportApiCache.has(mk)) return busReportApiCache.get(mk);
  try{
    const data = await apiFetch(`/api/reports/bus-summary?month=${encodeURIComponent(mk)}`);
    busReportApiCache.set(mk, data || null);
    return data || null;
  }catch(_){
    return busReportApiCache.get(mk) || null;
  }
}
async function loadDailyEntriesReportApi(dateIso, { force = false } = {}){
  const key = String(dateIso || "");
  if(!key) return null;
  if(!force && dailyEntriesReportApiCache.has(key)) return dailyEntriesReportApiCache.get(key);
  try{
    const data = await apiFetch(`/api/reports/daily-entries?date=${encodeURIComponent(key)}`);
    dailyEntriesReportApiCache.set(key, data || null);
    return data || null;
  }catch(_){
    return dailyEntriesReportApiCache.get(key) || null;
  }
}
async function loadDailyCaisseEntriesReportApi(dateIso, { force = false } = {}){
  const rawKey = String(dateIso || "");
  if(!rawKey) return null;
  const cacheKey = `caisse:${rawKey}`;
  if(!force && dailyEntriesReportApiCache.has(cacheKey)) return dailyEntriesReportApiCache.get(cacheKey);
  try{
    const data = await apiFetch(`/api/reports/daily-caisse-entries?date=${encodeURIComponent(rawKey)}`);
    dailyEntriesReportApiCache.set(cacheKey, data || null);
    return data || null;
  }catch(_){
    return dailyEntriesReportApiCache.get(cacheKey) || null;
  }
}
function monthLabelFromMonthKeyWithYear(monthKey){
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if(!m) return String(monthKey || "—");
  const label = monthLabelFromMonthKey(monthKey);
  return `${label} ${m[1]}`;
}
function monthLabelShortFrFromMonthKey(monthKey, { withYear = false } = {}){
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if(!m) return String(monthKey || "—");
  const short = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."][Number(m[2]) - 1] || monthKey;
  return withYear ? `${short} ${m[1]}` : short;
}
function sortMonthKeysBySchoolYear(monthKeys){
  const list = Array.isArray(monthKeys) ? monthKeys.slice() : [];
  return list.sort((a,b) => {
    const ma = String(a || "").match(/^(\d{4})-(\d{2})$/);
    const mb = String(b || "").match(/^(\d{4})-(\d{2})$/);
    if(!ma || !mb) return String(a || "").localeCompare(String(b || ""));
    const ya = Number(ma[1]); const moa = Number(ma[2]);
    const yb = Number(mb[1]); const mob = Number(mb[2]);
    const sya = moa >= 9 ? ya : ya - 1; // school year starts in September
    const syb = mob >= 9 ? yb : yb - 1;
    if(sya !== syb) return sya - syb;
    const posa = moa >= 9 ? (moa - 9) : (moa + 3); // Sep=0 ... Aug=11
    const posb = mob >= 9 ? (mob - 9) : (mob + 3);
    if(posa !== posb) return posa - posb;
    return String(a).localeCompare(String(b));
  });
}

function buildProfileMonthChips({ monthsPaid = [], monthsPartial = [] } = {}){
  const paidSorted = sortMonthKeysBySchoolYear(Array.isArray(monthsPaid) ? monthsPaid : []);
  const partialSorted = sortMonthKeysBySchoolYear(Array.isArray(monthsPartial) ? monthsPartial : []);
  const compareSchoolMonthKey = (a, b) => {
    const [first] = sortMonthKeysBySchoolYear([a, b]);
    if(String(a) === String(b)) return 0;
    return first === a ? -1 : 1;
  };
  const all = [
    ...paidSorted.map((mk) => ({ mk, state: "paid" })),
    ...partialSorted.map((mk) => ({ mk, state: "partial" }))
  ].sort((a, b) => compareSchoolMonthKey(a.mk, b.mk));

  // Display is month-name only (without year), so keep one chip per month label.
  // Latest occurrence wins (important when historical imports span multiple years).
  const byLabel = new Map();
  for(const item of all){
    const label = monthLabelShortFrFromMonthKey(item.mk);
    if(!label) continue;
    // Chronological ascending pass: overwrite so the latest occurrence wins.
    byLabel.set(label, item);
  }

  const monthOrderIndex = (mk) => {
    const m = String(mk || "").match(/^\d{4}-(\d{2})$/);
    if(!m) return 999;
    const mo = Number(m[1]);
    return mo >= 9 ? (mo - 9) : (mo + 3); // Sep=0 ... Aug=11
  };
  const rows = Array.from(byLabel.values()).sort((a,b) => monthOrderIndex(a.mk) - monthOrderIndex(b.mk));
  return rows.map((r) => ({
    monthKey: r.mk,
    label: monthLabelShortFrFromMonthKey(r.mk),
    className: r.state === "partial" ? "partial" : "ok"
  }));
}
function fmtApiLevelLabel(v){
  return apiLevelToLabel(v);
}
function fmtReportLevelLabel(v){
  const x = String(v || "");
  if(!x) return "—";
  const api = apiLevelToLabel(x);
  if(api) return api;
  if(/maternelle/i.test(x)) return "Maternelle";
  if(/primaire/i.test(x)) return "Primaire";
  if(/secondaire/i.test(x)) return "Secondaire";
  return x;
}
function canManageBusSubscription(){
  return hasRole("admin","comptable","caissier");
}
function normalizeMonthKeyInput(value){
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : "";
}
function openBusSubscriptionDialog({ studentLabel, current, categories = [] }){
  return new Promise((resolve) => {
    const isActive = Boolean(current?.active);
    const busFeeType = findFeeTypeByCode("BUS");
    const fallbackMonth = normalizeMonthKeyInput(selectedReportMonthKey()) || normalizeMonthKeyInput(getCurrentMonthISO().slice(0, 7));
    const currentStart = normalizeMonthKeyInput(current?.startMonth) || fallbackMonth;
    const currentCategory = current?.category != null ? String(current.category).trim() : "";
    // Liste des catégories proposées + la catégorie actuelle si elle a été retirée de la liste.
    const catList = Array.isArray(categories) ? categories.slice() : [];
    if(currentCategory && !catList.some((c) => String(c).toLowerCase() === currentCategory.toLowerCase())){
      catList.unshift(currentCategory);
    }
    const categoryOptionsHtml = [`<option value="">— Aucune —</option>`]
      .concat(catList.map((c) => `<option value="${esc(c)}"${String(c) === currentCategory ? " selected" : ""}>${esc(c)}</option>`))
      .join("");
    const rawAmount = Number(current?.monthlyAmount ?? current?.busAmount ?? busFeeType?.defaultAmount ?? 0);
    const currentAmount = Number.isFinite(rawAmount) && rawAmount >= 0 ? rawAmount : 0;
    const currentCurrency = normalizeCurrencyCode(current?.monthlyCurrency || current?.currency || busFeeType?.defaultCurrency || "USD");

    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(2,6,23,.52)",
      "z-index:2500",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:18px"
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "width:min(520px, 100%)",
      "background:#fff",
      "border:1px solid rgba(15,23,42,.18)",
      "border-radius:14px",
      "padding:16px",
      "box-shadow:0 24px 60px rgba(15,23,42,.24)"
    ].join(";");

    panel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <h3 style="margin:0;font-size:18px">Abonnement bus</h3>
        <div class="tiny" style="margin-bottom:2px">Élève: <strong>${esc(studentLabel || "—")}</strong></div>
        ${isActive ? `
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:6px">
              <input type="radio" name="busAction" value="update" checked />
              <span>Modifier la période</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px">
              <input type="radio" name="busAction" value="off" />
              <span>Désactiver l'abonnement</span>
            </label>
          </div>
        ` : `<div class="tiny">Saisir le mois de début pour activer l'abonnement.</div>`}
        <label style="display:flex;flex-direction:column;gap:6px">
          <span>Mois début</span>
          <input id="busDialogStartMonth" class="input" type="month" value="${esc(currentStart)}" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px">
          <span>Catégorie (bus)</span>
          <select id="busDialogCategory" class="input">${categoryOptionsHtml}</select>
        </label>
        <label style="display:flex;flex-direction:column;gap:6px">
          <span>Montant mensuel (${esc(currentCurrency)})</span>
          <input id="busDialogAmount" class="input" type="number" min="0" step="0.01" value="${esc(String(currentAmount))}" />
        </label>
        <div class="tiny">Ce montant est utilisé dans le rapport Bus.</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:6px">
          <button type="button" class="btn" data-bus-cancel>Annuler</button>
          <button type="button" class="btn primary" data-bus-save>Valider</button>
        </div>
      </div>
    `;

    const startInput = panel.querySelector("#busDialogStartMonth");
    const categorySelect = panel.querySelector("#busDialogCategory");
    const amountInput = panel.querySelector("#busDialogAmount");
    const cancelBtn = panel.querySelector("[data-bus-cancel]");
    const saveBtn = panel.querySelector("[data-bus-save]");
    const actionInputs = Array.from(panel.querySelectorAll("input[name='busAction']"));

    function updateMonthInputsDisabledState(){
      if(!isActive) return;
      const mode = actionInputs.find((el) => el.checked)?.value || "update";
      const locked = mode === "off";
      if(startInput) startInput.disabled = locked;
      if(categorySelect) categorySelect.disabled = locked;
    }

    const close = (result) => {
      document.removeEventListener("keydown", onKeyDown);
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(result);
    };

    const onKeyDown = (evt) => {
      if(evt.key === "Escape"){
        evt.preventDefault();
        close(null);
      }
    };

    const onSave = () => {
      const amountRaw = String(amountInput?.value || "").trim().replace(",", ".");
      const monthlyAmount = Number(amountRaw);
      if(!Number.isFinite(monthlyAmount) || monthlyAmount < 0){
        showInAppPopup("Montant bus invalide (nombre >= 0).", { variant: "error", duration: 3400 });
        amountInput?.focus();
        return;
      }

      const mode = isActive ? (actionInputs.find((el) => el.checked)?.value || "update") : "update";
      if(mode === "off"){
        close({
          active: false,
          startMonth: currentStart || fallbackMonth,
          category: currentCategory || null,
          monthlyAmount,
          monthlyCurrency: currentCurrency
        });
        return;
      }

      const startMonth = normalizeMonthKeyInput(startInput?.value);
      const category = String(categorySelect?.value || "").trim() || null;
      if(!startMonth){
        showInAppPopup("Mois début requis (YYYY-MM).", { variant: "error", duration: 3400 });
        startInput?.focus();
        return;
      }
      close({
        active: true,
        startMonth,
        category,
        monthlyAmount,
        monthlyCurrency: currentCurrency
      });
    };

    actionInputs.forEach((input) => input.addEventListener("change", updateMonthInputsDisabledState));
    cancelBtn?.addEventListener("click", () => close(null));
    saveBtn?.addEventListener("click", onSave);
    overlay.addEventListener("click", (evt) => {
      if(evt.target === overlay) close(null);
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);
    updateMonthInputsDisabledState();
    if(startInput && !startInput.disabled){
      startInput.focus();
      startInput.select?.();
    }
  });
}
async function manageBusSubscriptionApi(studentId){
  if(!canManageBusSubscription()){
    showInAppPopup("Gestion abonnement bus réservée à admin/comptable/caissier.", { variant: "error", duration: 3600 });
    return;
  }
  const row = studentsTableRows.find(s => String(s.id) === String(studentId));
  const studentLabel = row?.fullName || studentId;
  try{
    const current = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/bus-subscription`);
    let categories = [];
    try{
      const catRes = await apiFetch("/api/bus-categories");
      categories = Array.isArray(catRes?.categories) ? catRes.categories : [];
    }catch(_){ categories = []; }
    const update = await openBusSubscriptionDialog({ studentLabel, current, categories });
    if(!update) return;
    await apiFetch(`/api/students/${encodeURIComponent(studentId)}/bus-subscription`, {
      method: "PUT",
      body: JSON.stringify({
        active: Boolean(update.active),
        startMonth: update.startMonth,
        category: update.category || null,
        monthlyAmount: Number(update.monthlyAmount || 0),
        monthlyCurrency: update.monthlyCurrency || "USD"
      })
    });
    if(viewReports.classList.contains("active")){
      busReportApiCache.clear();
      reportsSummaryApiCache.clear();
      lateStudentsReportApiCache.clear();
      renderReports();
    }
    await loadStudents().catch(() => {});
    if(viewStudents.classList.contains("active")) renderStudentsTableGrouped();
    renderStudentList();
    if(String(selectedStudentId || "") === String(studentId || "")){
      selectedStudentFeeStatus = null;
      selectStudent(studentId);
      await loadSelectedStudentFeeStatus({ applyMonthDefault: true }).catch(() => {});
    }
    if(String(studentProfileState?.studentId || "") === String(studentId || "")){
      await loadStudentProfile(studentId, { open: false }).catch(() => {});
    }
    showInAppPopup("Abonnement bus mis à jour.", { variant: "success", duration: 2600 });
  }catch(err){
    showInAppPopup(`Erreur abonnement bus: ${err.message}`, { variant: "error", duration: 4200 });
  }
}

/* ===== Prise en charge des frais de scolarité (enfant du personnel) ===== */
function canManageTuitionBenefit(){ return hasRole("admin", "caissier"); }

function formatTuitionBenefitLabel(b){
  if(!b || !b.active) return "Non";
  const start = b.startMonth ? monthLabelFromMonthKeyWithYear(b.startMonth) : "—";
  const end = b.endMonth ? monthLabelFromMonthKeyWithYear(b.endMonth) : null;
  const who = b.employeeName ? ` • ${b.employeeName}` : "";
  return end ? `Oui (${start} → ${end})${who}` : `Oui (depuis ${start})${who}`;
}

function openTuitionBenefitDialog({ studentLabel, current }){
  return new Promise((resolve) => {
    const isActive = Boolean(current?.active);
    const fallbackMonth = normalizeMonthKeyInput(selectedReportMonthKey()) || normalizeMonthKeyInput(getCurrentMonthISO().slice(0, 7));
    const currentStart = normalizeMonthKeyInput(current?.startMonth) || fallbackMonth;
    const currentEnd = normalizeMonthKeyInput(current?.endMonth);
    const currentEmployee = current?.employeeName ? String(current.employeeName) : "";

    const overlay = document.createElement("div");
    overlay.style.cssText = ["position:fixed","inset:0","background:rgba(2,6,23,.52)","z-index:2500","display:flex","align-items:center","justify-content:center","padding:18px"].join(";");
    const panel = document.createElement("div");
    panel.style.cssText = ["width:min(520px, 100%)","background:#fff","border:1px solid rgba(15,23,42,.18)","border-radius:14px","padding:16px","box-shadow:0 24px 60px rgba(15,23,42,.24)"].join(";");
    panel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <h3 style="margin:0;font-size:18px">Prise en charge (personnel)</h3>
        <div class="tiny" style="margin-bottom:2px">Élève: <strong>${esc(studentLabel || "—")}</strong></div>
        <div class="tiny">Le minerval des mois couverts est réglé hors caisse (avantage en nature). En cas de départ, renseignez le mois de fin&nbsp;: les mois suivants redeviennent payables, les mois déjà couverts restent acquis.</div>
        ${isActive ? `
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:6px"><input type="radio" name="benAction" value="update" checked /><span>Modifier la période</span></label>
            <label style="display:flex;align-items:center;gap:6px"><input type="radio" name="benAction" value="off" /><span>Désactiver la prise en charge</span></label>
          </div>` : `<div class="tiny">Saisir le mois de début pour activer la prise en charge.</div>`}
        <label style="display:flex;flex-direction:column;gap:6px">
          <span>Employé (parent du personnel)</span>
          <input id="benDialogEmployee" class="input" type="text" maxlength="140" placeholder="Nom de l'employé (optionnel)" value="${esc(currentEmployee)}" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px">
          <span>Mois début</span>
          <input id="benDialogStartMonth" class="input" type="month" value="${esc(currentStart)}" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px">
          <span>Mois fin (départ de l'employé — optionnel)</span>
          <input id="benDialogEndMonth" class="input" type="month" value="${esc(currentEnd)}" />
        </label>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:6px">
          <button type="button" class="btn" data-ben-cancel>Annuler</button>
          <button type="button" class="btn primary" data-ben-save>Valider</button>
        </div>
      </div>`;
    const employeeInput = panel.querySelector("#benDialogEmployee");
    const startInput = panel.querySelector("#benDialogStartMonth");
    const endInput = panel.querySelector("#benDialogEndMonth");
    const cancelBtn = panel.querySelector("[data-ben-cancel]");
    const saveBtn = panel.querySelector("[data-ben-save]");
    const actionInputs = Array.from(panel.querySelectorAll("input[name='benAction']"));
    function updateDisabled(){
      if(!isActive) return;
      const locked = (actionInputs.find((el) => el.checked)?.value || "update") === "off";
      if(startInput) startInput.disabled = locked;
      if(endInput) endInput.disabled = locked;
      if(employeeInput) employeeInput.disabled = locked;
    }
    const close = (result) => { document.removeEventListener("keydown", onKeyDown); if(overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(result); };
    const onKeyDown = (evt) => { if(evt.key === "Escape"){ evt.preventDefault(); close(null); } };
    const onSave = () => {
      const employeeName = String(employeeInput?.value || "").trim() || null;
      const mode = isActive ? (actionInputs.find((el) => el.checked)?.value || "update") : "update";
      if(mode === "off"){ close({ active: false, startMonth: currentStart || fallbackMonth, endMonth: currentEnd || null, employeeName }); return; }
      const startMonth = normalizeMonthKeyInput(startInput?.value);
      const endRaw = String(endInput?.value || "").trim();
      const endMonth = endRaw ? normalizeMonthKeyInput(endRaw) : "";
      if(!startMonth){ showInAppPopup("Mois début requis (YYYY-MM).", { variant: "error", duration: 3400 }); startInput?.focus(); return; }
      if(endRaw && !endMonth){ showInAppPopup("Mois fin invalide (YYYY-MM).", { variant: "error", duration: 3400 }); endInput?.focus(); return; }
      if(endMonth && endMonth < startMonth){ showInAppPopup("Le mois fin doit être ≥ au mois début.", { variant: "error", duration: 3600 }); endInput?.focus(); return; }
      close({ active: true, startMonth, endMonth: endMonth || null, employeeName });
    };
    actionInputs.forEach((input) => input.addEventListener("change", updateDisabled));
    cancelBtn?.addEventListener("click", () => close(null));
    saveBtn?.addEventListener("click", onSave);
    overlay.addEventListener("click", (evt) => { if(evt.target === overlay) close(null); });
    overlay.appendChild(panel); document.body.appendChild(overlay); document.addEventListener("keydown", onKeyDown);
    updateDisabled();
    if(startInput && !startInput.disabled){ startInput.focus(); }
  });
}

async function manageTuitionBenefitApi(studentId){
  if(!canManageTuitionBenefit()){
    showInAppPopup("Prise en charge réservée à admin / caissier.", { variant: "error", duration: 3600 });
    return;
  }
  const row = studentsTableRows.find(s => String(s.id) === String(studentId));
  const studentLabel = row?.fullName || studentId;
  try{
    const current = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/tuition-benefit`);
    const update = await openTuitionBenefitDialog({ studentLabel, current });
    if(!update) return;
    await apiFetch(`/api/students/${encodeURIComponent(studentId)}/tuition-benefit`, {
      method: "PUT",
      body: JSON.stringify({
        active: Boolean(update.active),
        startMonth: update.startMonth,
        endMonth: update.endMonth || null,
        employeeName: update.employeeName || null
      })
    });
    // La prise en charge crée/supprime des paiements non-cash : rafraîchir données + rapports.
    await loadPaymentsFromApi().catch(() => {});
    if(viewReports.classList.contains("active")){
      reportsSummaryApiCache.clear();
      lateStudentsReportApiCache.clear();
      renderReports();
    }
    await loadStudents().catch(() => {});
    refreshStudentsFinancialState();
    if(String(selectedStudentId || "") === String(studentId || "")){
      selectedStudentFeeStatus = null;
      selectStudent(studentId);
      await loadSelectedStudentFeeStatus({ applyMonthDefault: true }).catch(() => {});
    }
    if(String(studentProfileState?.studentId || "") === String(studentId || "")){
      await loadStudentProfile(studentId, { open: false }).catch(() => {});
    }
    showInAppPopup("Prise en charge mise à jour.", { variant: "success", duration: 2600 });
  }catch(err){
    showInAppPopup(`Erreur prise en charge: ${err.message}`, { variant: "error", duration: 4200 });
  }
}
function canOpenStudentProfile(){
  return hasRole("admin","caissier","comptable");
}
function canEditStudentProfileInfo(){
  return hasRole("admin","caissier","comptable");
}
function canChangeStudentClassProfile(){
  return hasRole("admin","caissier");
}
let profileActiveTab = "finance";
let profileLoadVersion = 0;

function setStudentProfileTab(tabName){
  const tab = ["overview", "finance", "info"].includes(String(tabName || "")) ? String(tabName) : "overview";
  profileActiveTab = tab;
  const profileGrid = studentProfileModal?.querySelector?.(".profile-grid");
  const tabButtons = Array.from(studentProfileModal?.querySelectorAll?.("[data-profile-tab]") || []);
  for(const button of tabButtons){
    const active = button.dataset.profileTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  const financeWorkspace = document.getElementById("profileFinanceWorkspace");
  if(financeWorkspace) financeWorkspace.hidden = tab !== "finance";
  if(profileAcademicCard) profileAcademicCard.style.display = tab === "overview" ? "" : "none";
  if(profileIdentityCard) profileIdentityCard.style.display = tab === "finance" ? "none" : "";
  if(profileClassChangeCard) profileClassChangeCard.style.display = tab === "info" && canChangeStudentClassProfile() ? "" : "none";
  if(profileInfoCard) profileInfoCard.style.display = tab === "info" && canEditStudentProfileInfo() ? "" : "none";
  if(profileFeeStatusCard) profileFeeStatusCard.style.display = tab === "finance" ? "" : "none";
  if(profilePaymentsCard) profilePaymentsCard.style.display = tab === "finance" ? "" : "none";
  if(profileGrid){
    profileGrid.style.display = tab === "finance" ? "none" : "grid";
    profileGrid.classList.toggle("is-overview", tab === "overview");
  }
  if(studentProfileModal) studentProfileModal.dataset.profileTab = tab;
}

function profileInitials(name){
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word.charAt(0)).join("") || "ÉL").toUpperCase();
}

function renderProfileAcademicSummary(){
  const academic = studentProfileState.academic;
  const s = studentProfileState.student;
  const isTracked = academic && Number(academic.maxPeriods || 0) > 0;
  if(!isTracked){
    if(pfAcademicHeadline) pfAcademicHeadline.textContent = "Suivi non configuré pour ce niveau";
    if(pfAcademicMeta) pfAcademicMeta.textContent = "Les notes par période concernent actuellement le primaire et le secondaire.";
    if(pfAcademicAverage) pfAcademicAverage.innerHTML = `<strong>—</strong><span>Moyenne</span>`;
    if(pfAcademicPeriods) pfAcademicPeriods.innerHTML = `<div class="profile-period-empty">Aucune période académique disponible.</div>`;
    if(pfAcademicRank) pfAcademicRank.textContent = "—";
    if(pfAcademicFailures) pfAcademicFailures.textContent = "0";
    if(pfAcademicTrend) pfAcademicTrend.textContent = "—";
    if(pfProfileAcademicChip) pfProfileAcademicChip.textContent = "Notes non suivies";
    if(pfOpenGradesBtn) pfOpenGradesBtn.style.display = "none";
    return;
  }
  const summary = academic.summary || {};
  const average = summary.average == null ? null : Number(summary.average);
  const latestScore = summary.latestScore == null ? null : Number(summary.latestScore);
  const latestFailed = latestScore != null && latestScore < 50;
  const repeatedFailure = Number(summary.failed || 0) >= 2;
  if(pfAcademicHeadline){
    pfAcademicHeadline.textContent = !Number(summary.entered || 0)
      ? "Aucune note saisie"
      : repeatedFailure
        ? "Suivi prioritaire recommandé"
        : latestFailed
          ? `Échec en période ${summary.latestPeriod}`
          : "Parcours académique satisfaisant";
  }
  if(pfAcademicMeta){
    pfAcademicMeta.textContent = `${summary.entered || 0}/${academic.maxPeriods} périodes saisies · Année ${academic.schoolYearLabel}`;
  }
  if(pfAcademicAverage){
    pfAcademicAverage.innerHTML = `<strong>${average == null ? "—" : `${average.toFixed(1)}%`}</strong><span>Moyenne</span>`;
    pfAcademicAverage.classList.toggle("is-failed", average != null && average < 50);
    pfAcademicAverage.classList.toggle("is-passed", average != null && average >= 50);
  }
  if(pfAcademicPeriods){
    pfAcademicPeriods.innerHTML = (academic.periodScores || []).map((item) => {
      const score = item.score == null ? null : Number(item.score);
      const tone = score == null ? "is-missing" : score < 50 ? "is-failed" : "is-passed";
      return `<div class="profile-period ${tone}"><span>P${item.period}</span><strong>${score == null ? "—" : `${score.toFixed(1)}%`}</strong><small>${score == null ? "Non saisie" : score < 50 ? "Échec" : "Réussite"}</small></div>`;
    }).join("");
  }
  if(pfAcademicRank){
    pfAcademicRank.textContent = academic.classRank
      ? `${academic.classRank}${Number(academic.classRank) === 1 ? "er" : "e"} / ${academic.rankedStudents}`
      : "Non classé";
  }
  if(pfAcademicFailures) pfAcademicFailures.textContent = `${summary.failed || 0} / ${summary.entered || 0}`;
  if(pfAcademicTrend){
    const delta = academic.trend?.delta;
    pfAcademicTrend.textContent = academic.trend?.direction === "improving"
      ? `↗ +${Number(delta).toFixed(1)} pts`
      : academic.trend?.direction === "declining"
        ? `↘ ${Number(delta).toFixed(1)} pts`
        : delta == null ? "À établir" : `→ ${Number(delta).toFixed(1)} pts`;
    pfAcademicTrend.className = academic.trend?.direction === "improving" ? "is-improving" : academic.trend?.direction === "declining" ? "is-declining" : "";
  }
  if(pfProfileAcademicChip){
    pfProfileAcademicChip.textContent = average == null ? "Notes à saisir" : `${average.toFixed(1)}% de moyenne`;
    pfProfileAcademicChip.classList.toggle("is-alert", repeatedFailure || latestFailed);
  }
  if(pfOpenGradesBtn){
    pfOpenGradesBtn.style.display = "";
    pfOpenGradesBtn.disabled = !isStudentActiveRecord(s);
  }
}
function normalizeApiLevelValue(level){
  const v = String(level || "").toLowerCase();
  if(v === "maternelle" || v === "primaire" || v === "secondaire") return v;
  return "";
}
function profileSyncClassControlsFromLevel({ preserve = false } = {}){
  if(!pfChangeLevel || !pfChangeClass || !pfChangeCode) return;
  const lvl = normalizeApiLevelValue(pfChangeLevel.value);
  const prevClass = preserve ? String(pfChangeClass.value || "") : "";
  const prevCode = preserve ? String(pfChangeCode.value || "").trim().toUpperCase() : "";
  pfChangeClass.innerHTML = `<option value="">— Choisir —</option>`;
  const options = CLASS_BY_LEVEL[lvl] || [];
  for(const name of options){
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    pfChangeClass.appendChild(opt);
  }
  pfChangeClass.disabled = !lvl;
  if(prevClass && options.includes(prevClass)) pfChangeClass.value = prevClass;

  const needsCode = shouldUseCode(lvl);
  pfChangeCode.innerHTML = `<option value="">&mdash; Choisir &mdash;</option>`;
  if(needsCode){
    for(const code of Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ")){
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      pfChangeCode.appendChild(opt);
    }
    if(/^[A-Z]$/.test(prevCode)) pfChangeCode.value = prevCode;
  }
  pfChangeCode.disabled = !needsCode;
  if(!needsCode) pfChangeCode.value = "";
}
function splitClassBaseAndCode(levelValue, className){
  const lvl = normalizeApiLevelValue(levelValue);
  const cls = String(className || "").trim();
  if(shouldUseCode(lvl)){
    const m = cls.match(/^(.*)\s+([A-Z])$/i);
    if(m) return { base: m[1].trim(), code: m[2].toUpperCase() };
  }
  return { base: cls, code: "" };
}
function buildProfileClassNameFromInputs(){
  const lvl = normalizeApiLevelValue(pfChangeLevel?.value || "");
  const base = String(pfChangeClass?.value || "").trim();
  const code = String(pfChangeCode?.value || "").trim().toUpperCase();
  if(!base) return "";
  if(shouldUseCode(lvl)){
    return code ? `${base} ${code}` : "";
  }
  return base;
}
function formatBusSubscriptionLabel(sub){
  const amount = Number(sub?.monthlyAmount ?? sub?.busAmount);
  const cur = normalizeCurrencyCode(sub?.monthlyCurrency || sub?.currency || "USD");
  const amountLabel = Number.isFinite(amount) && amount > 0 ? `${formatMoney(amount, cur)} / mois` : "";
  if(!sub || !sub.active){
    return amountLabel ? `Non abonné • Tarif: ${amountLabel}` : "Non abonné";
  }
  const start = sub.startMonth ? monthLabelFromMonthKeyWithYear(sub.startMonth) : "—";
  const catLabel = sub.category ? ` • ${sub.category}` : "";
  const base = `Abonné (depuis ${start})${catLabel}`;
  return amountLabel ? `${base} • ${amountLabel}` : base;
}
function paymentTypeLabelForHistory(p){
  return getLiveFeeLabel(p);
}
function renderProfileHistoryFilterOptions(){
  if(!pfHistoryFeeFilter) return;
  const current = String(pfHistoryFeeFilter.value || "");
  const labels = Array.from(new Set((studentProfileState.payments || []).map(paymentTypeLabelForHistory))).filter(Boolean);
  pfHistoryFeeFilter.innerHTML = `<option value="">Tous</option>` +
    labels.map((label) => `<option value="${esc(label)}">${esc(label)}</option>`).join("");
  if(labels.includes(current)) pfHistoryFeeFilter.value = current;
}
function paymentIdentityTokens(payment){
  const tokens = [];
  const localId = String(payment?.id || "").trim();
  const reservedId = String(payment?.reservedPaymentId || "").trim();
  const clientRequestId = String(payment?.clientRequestId || payment?.client_request_id || "").trim();
  const receiptNo = String(payment?.receiptNo || payment?.receipt_no || "").trim();
  if(localId) tokens.push(`id:${localId}`);
  if(reservedId) tokens.push(`id:${reservedId}`);
  if(clientRequestId) tokens.push(`req:${clientRequestId}`);
  if(receiptNo) tokens.push(`receipt:${receiptNo}`);
  return tokens;
}
function mergeStudentPendingPaymentsWithServer(studentId, serverRows){
  const normalizedServerRows = Array.isArray(serverRows)
    ? serverRows.map(normalizeReceiptApiRow)
    : [];
  const serverIdentity = new Set();
  for(const row of normalizedServerRows){
    for(const token of paymentIdentityTokens(row)){
      serverIdentity.add(token);
    }
  }
  const targetStudentId = String(studentId || "").trim();
  const pendingLocalPayments = [];
  for(const local of getPayments()){
    if(!local?.pendingSync) continue;
    if(targetStudentId && String(local?.studentId || "").trim() !== targetStudentId) continue;
    const localTokens = paymentIdentityTokens(local);
    if(localTokens.some((token) => serverIdentity.has(token))) continue;
    for(const token of localTokens){
      serverIdentity.add(token);
    }
    pendingLocalPayments.push(local);
  }
  return {
    mergedPayments: [...pendingLocalPayments, ...normalizedServerRows],
    pendingLocalPayments
  };
}
function paymentAmountInStatusCurrency(payment, statusCurrency){
  const targetCurrency = normalizeCurrencyCode(statusCurrency || "USD");
  if(targetCurrency === "CDF"){
    const direct = Number(payment?.amountCDF);
    if(Number.isFinite(direct)) return direct;
    const entered = Number(payment?.amountEntered ?? payment?.amount ?? 0);
    const sourceCurrency = normalizeCurrencyCode(payment?.currency || "USD");
    if(sourceCurrency === "CDF") return entered;
    const rateRaw = Number(payment?.rateUsed || payment?.fxRate || USD_TO_CDF);
    const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : Number(USD_TO_CDF || 1);
    return Math.round((Number.isFinite(entered) ? entered : 0) * (rate || 1));
  }
  const direct = Number(payment?.amountUSD);
  if(Number.isFinite(direct)) return direct;
  const entered = Number(payment?.amountEntered ?? payment?.amount ?? 0);
  const sourceCurrency = normalizeCurrencyCode(payment?.currency || "USD");
  if(sourceCurrency === "USD") return Number.isFinite(entered) ? entered : 0;
  const rateRaw = Number(payment?.rateUsed || payment?.fxRate || USD_TO_CDF);
  const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : Number(USD_TO_CDF || 1);
  return +((Number.isFinite(entered) ? entered : 0) / (rate || 1)).toFixed(2);
}
function paymentMatchesFeeStatus(payment, feeStatus){
  if(!payment || !feeStatus) return false;
  const statusFeeId = String(feeStatus?.feeTypeId || "").trim();
  const paymentFeeId = String(payment?.feeTypeId ?? payment?.fee_type_id ?? "").trim();
  if(statusFeeId && paymentFeeId && statusFeeId === paymentFeeId) return true;
  const statusFeeCode = String(
    feeStatus?.feeTypeCode || findFeeTypeById(feeStatus?.feeTypeId)?.code || ""
  ).trim().toUpperCase();
  const paymentFeeCode = String(
    payment?.feeTypeCode ||
    payment?.fee_type_code ||
    findFeeTypeById(payment?.feeTypeId ?? payment?.fee_type_id)?.code ||
    findFeeTypeByLabel(payment?.feeType || payment?.feeTypeLabel || getLiveFeeLabel(payment))?.code ||
    ""
  ).trim().toUpperCase();
  if(statusFeeCode && paymentFeeCode && statusFeeCode === paymentFeeCode) return true;
  const statusLabel = normalizeFeeName(feeStatus?.feeTypeLabel || "");
  const paymentLabel = normalizeFeeName(getLiveFeeLabel(payment) || payment?.feeType || payment?.feeTypeLabel || "");
  return Boolean(statusLabel && paymentLabel && statusLabel === paymentLabel);
}
function applyPendingPaymentsToFeeStatus(feeStatus, pendingLocalPayments){
  if(!feeStatus) return feeStatus;
  const pending = Array.isArray(pendingLocalPayments) ? pendingLocalPayments : [];
  if(!pending.length) return feeStatus;

  const statusMonthKey = normalizeMonthKeyInput(
    feeStatus?.selectedMonth || feeStatus?.nextDueMonth || feeStatus?.annualPaymentLockMonth || ""
  );
  if(!statusMonthKey) return feeStatus;
  const statusCurrency = normalizeCurrencyCode(
    feeStatus?.currency || feeStatus?.timelineCurrency || feeStatus?.annualPaymentLockCurrency || "USD"
  );
  let paidDelta = 0;
  for(const payment of pending){
    if(!paymentMatchesFeeStatus(payment, feeStatus)) continue;
    const paymentMonthKeyValue = normalizeMonthKeyInput(paymentMonthKey(payment));
    if(statusMonthKey && paymentMonthKeyValue && paymentMonthKeyValue !== statusMonthKey) continue;
    const amount = Number(paymentAmountInStatusCurrency(payment, statusCurrency));
    if(Number.isFinite(amount) && amount > 0){
      paidDelta += amount;
    }
  }
  if(!(paidDelta > 0.000001)) return feeStatus;

  const next = { ...feeStatus };
  next.paidSoFar = Math.max(0, Number(next.paidSoFar || 0) + paidDelta);
  next.remaining = Math.max(0, Number(next.remaining || 0) - paidDelta);

  if(next.remaining <= 0.000001){
    next.status = "A jour";
  } else if(next.paidSoFar > 0.000001){
    next.status = "Partiel";
  }

  const timelineMonthKey = normalizeMonthKeyInput(next.nextDueMonth || "");
  if(statusMonthKey && timelineMonthKey && statusMonthKey === timelineMonthKey){
    const timelineRemainingRaw = Number(next.timelineRemaining);
    if(Number.isFinite(timelineRemainingRaw)){
      next.timelineRemaining = Math.max(0, timelineRemainingRaw - paidDelta);
      if(next.timelineRemaining <= 0.000001){
        next.timelineStatus = "A jour";
      } else {
        const timelineDue = Number(next.timelineDueAmount || 0);
        const timelinePaid = Number.isFinite(timelineDue)
          ? Math.max(0, timelineDue - next.timelineRemaining)
          : Number(next.paidSoFar || 0);
        if(timelinePaid > 0.000001){
          next.timelineStatus = "Partiel";
        }
      }
    }
  }

  const annualLockMonthKey = normalizeMonthKeyInput(next.annualPaymentLockMonth || "");
  if(annualLockMonthKey && (!statusMonthKey || annualLockMonthKey === statusMonthKey)){
    const annualRemainingRaw = Number(next.annualPaymentLockRemaining);
    if(Number.isFinite(annualRemainingRaw)){
      next.annualPaymentLockRemaining = Math.max(0, annualRemainingRaw - paidDelta);
      next.annualPaymentLocked = next.annualPaymentLockRemaining <= 0.000001;
    }
  }

  if(statusMonthKey){
    const paidMonths = new Set(
      (Array.isArray(next.monthsPaid) ? next.monthsPaid : []).map((mk) => String(mk || ""))
    );
    const partialMonths = new Set(
      (Array.isArray(next.monthsPartial) ? next.monthsPartial : []).map((mk) => String(mk || ""))
    );
    if(next.remaining <= 0.000001){
      paidMonths.add(statusMonthKey);
      partialMonths.delete(statusMonthKey);
    } else if(next.paidSoFar > 0.000001){
      if(!paidMonths.has(statusMonthKey)) partialMonths.add(statusMonthKey);
    } else {
      paidMonths.delete(statusMonthKey);
      partialMonths.delete(statusMonthKey);
    }
    next.monthsPaid = sortMonthKeysBySchoolYear(Array.from(paidMonths));
    next.monthsPartial = sortMonthKeysBySchoolYear(Array.from(partialMonths));
  }

  return next;
}
function renderProfilePaymentsTable(){
  if(!pfPaymentsTbody) return;
  const all = Array.isArray(studentProfileState.payments) ? studentProfileState.payments.slice() : [];
  const feeFilter = normalizeFeeName(pfHistoryFeeFilter?.value || "");
  const baseLimit = Math.max(1, Number(pfHistoryLimit?.value || 10));
  if(!Number.isFinite(profileHistoryVisibleCount) || profileHistoryVisibleCount < baseLimit){
    profileHistoryVisibleCount = baseLimit;
  }
  const canDeleteInProfile = hasRole("admin");
  const canCancelInProfile = canCancelReceipt();
  const canEditDateInProfile = hasRole("admin");
  const filtered = all.filter((p) => !feeFilter || normalizeFeeName(paymentTypeLabelForHistory(p)) === feeFilter);
  const sorted = filtered
    .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  if(profileHistoryEditingPaymentId && !sorted.some((p) => String(p.id || "") === String(profileHistoryEditingPaymentId))){
    profileHistoryEditingPaymentId = "";
  }
  const rows = sorted.slice(0, profileHistoryVisibleCount);
  if(!rows.length){
    pfPaymentsTbody.innerHTML = `<tr><td colspan="7" class="tiny">Aucun paiement.</td></tr>`;
    if(pfHistoryControls) pfHistoryControls.innerHTML = "";
    profileHistoryEditingPaymentId = "";
    return;
  }
  pfPaymentsTbody.innerHTML = rows.map((p) => `
    <tr>
      <td>${
        canEditDateInProfile && !p.cancelled && String(profileHistoryEditingPaymentId || "") === String(p.id || "") && p.id
          ? `<input class="input" data-pf-pay-date-input="${esc(String(p.id || ""))}" inputmode="numeric" placeholder="jj/mm/aaaa" value="${esc(formatIsoDateToFr(p.createdAt || ""))}" />`
          : esc(fmtDateTime(new Date(p.createdAt || Date.now())))
      }</td>
      <td><strong>${esc(p.receiptNo || "—")}</strong>${p.cancelled ? ` <span class="badge late">ANNULÉ</span>` : ""}${p.corrected ? ` <span class="badge">CORRIGÉ</span>` : ""}</td>
      <td>${esc(paymentTypeLabelForHistory(p))}${p.corrected ? `<div class="tiny">Corrigé: ${esc(p.latestCorrection?.oldFeeType || "—")} → ${esc(p.latestCorrection?.newFeeType || paymentTypeLabelForHistory(p))}<br>${esc(p.latestCorrection?.reason || "")}</div>` : ""}</td>
      <td>${esc(p.month || monthLabelFromMonthKey(p.paidForMonth || p.monthKey || ""))}</td>
      <td><strong>${esc(receiptDisplayAmountLabel(p))}</strong>${p.cancelled ? `<div class="tiny">Motif: ${esc(p.cancellationReason || "—")}</div>` : ""}</td>
      <td>${esc(p.cashier || "—")}</td>
      <td>
        ${!p.cancelled ? `<button class="btn" type="button" data-pfx-history-print="${esc(String(p.id))}">Réimprimer</button>` : ""}
        ${
          canDeleteInProfile
            ? (String(profileHistoryEditingPaymentId || "") === String(p.id || "") && p.id)
              ? `<div class="row" style="gap:6px;justify-content:flex-end;flex-wrap:wrap">
                  <button class="btn primary" type="button" data-pf-pay-edit-save="${esc(String(p.id || ""))}">Enregistrer date</button>
                  <button class="btn" type="button" data-pf-pay-edit-cancel="1">Annuler</button>
                  ${canCancelInProfile && !p.cancelled ? `<button class="btn" type="button" data-pf-pay-cancel="${esc(String(p.id || ""))}">Annuler le reçu</button>` : ""}
                  <button class="btn danger" type="button" data-pf-pay-delete="${esc(String(p.id || ""))}" ${p.id ? "" : "disabled"}>Supprimer</button>
                </div>`
              : `<div class="row" style="gap:6px;justify-content:flex-end;flex-wrap:wrap">
                  ${!p.cancelled ? `<button class="btn" type="button" data-pf-pay-edit="${esc(String(p.id || ""))}" ${p.id ? "" : "disabled"}>Modifier date</button>` : ""}
                  ${canCancelInProfile && !p.cancelled ? `<button class="btn" type="button" data-pf-pay-cancel="${esc(String(p.id || ""))}">Annuler le reçu</button>` : ""}
                  <button class="btn danger" type="button" data-pf-pay-delete="${esc(String(p.id || ""))}" ${p.id ? "" : "disabled"}>Supprimer</button>
                </div>`
            : (canCancelInProfile && !p.cancelled
                ? `<button class="btn" type="button" data-pf-pay-cancel="${esc(String(p.id || ""))}">Annuler le reçu</button>`
                : `<span class="tiny">—</span>`)
        }
      </td>
    </tr>
  `).join("");

  if(pfHistoryControls){
    const remaining = Math.max(0, sorted.length - rows.length);
    const canLess = profileHistoryVisibleCount > baseLimit;
    const parts = [];
    if(remaining > 0){
      parts.push(`<button class="btn" type="button" data-pf-history-more="1">Voir plus (${remaining})</button>`);
    }
    if(canLess){
      parts.push(`<button class="btn" type="button" data-pf-history-less="1">Voir moins</button>`);
    }
    pfHistoryControls.innerHTML = parts.join("");
  }
}
async function updatePaymentDateFromProfile(paymentId){
  if(!hasRole("admin")){
    showInAppPopup("Modification de date réservée à admin.");
    return;
  }
  const pid = String(paymentId || "").trim();
  if(!pid) return;
  const safeId = (typeof CSS !== "undefined" && CSS.escape) ? CSS.escape(pid) : pid.replace(/"/g, '\\"');
  const dateInput = pfPaymentsTbody?.querySelector(`input[data-pf-pay-date-input="${safeId}"]`);
  const rawDate = String(dateInput?.value || "").trim();
  const dateIso = normalizeProfileDateInput(rawDate);
  if(!dateIso){
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = "Date invalide. Format attendu: JJ/MM/AAAA.";
    showInAppPopup("Date invalide. Format attendu: JJ/MM/AAAA.");
    return;
  }
  try{
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = "Mise à jour de la date...";
    await apiFetch(`/api/payments/${encodeURIComponent(pid)}`, {
      method: "PATCH",
      body: JSON.stringify({
        createdAt: dateIso
      })
    });
    profileHistoryEditingPaymentId = "";
    reportsSummaryApiCache.clear();
    busReportApiCache.clear();
    dailyEntriesReportApiCache.clear();
    lateStudentsReportApiCache.clear();

    if(studentProfileState.studentId){
      await loadStudentProfile(studentProfileState.studentId, { open:false });
    }else{
      renderProfilePaymentsTable();
    }
    await loadReceiptsFromApi().catch(() => {});
    refreshStudentsFinancialState();
    renderStudentList();
    if(selectedStudentId) selectStudent(selectedStudentId);
    renderDashboard();
    if(viewReports.classList.contains("active")) renderReports();
    if(viewReceipts.classList.contains("active")) renderReceiptsTable();
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = "Date de paiement mise à jour.";
  }catch(err){
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = `Erreur mise à jour date: ${err.message}`;
    showInAppPopup(`Erreur modification date paiement: ${err.message}`);
  }
}

function openReceiptCancellationDialog(payment){
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = ["position:fixed","inset:0","background:rgba(2,6,23,.52)","z-index:2600","display:flex","align-items:center","justify-content:center","padding:18px"].join(";");
    const panel = document.createElement("div");
    panel.style.cssText = ["width:min(520px,100%)","background:#fff","border:1px solid rgba(15,23,42,.18)","border-radius:12px","padding:16px","box-shadow:0 24px 60px rgba(15,23,42,.24)"].join(";");
    panel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <h3 style="margin:0;font-size:18px">Annuler le reçu</h3>
          <div class="tiny" style="margin-top:5px">${esc(payment?.receiptNo || "Reçu")} • ${esc(receiptDisplayAmountLabel(payment))}</div>
        </div>
        <div style="padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;border-radius:9px;color:#78350f">
          <strong>Un mauvais type de frais ne doit pas être annulé.</strong>
          <div class="tiny" style="margin-top:4px;color:#78350f">Utilisez « Corriger le reçu » : la dette et les rapports seront corrigés sans retirer l'argent de la caisse.</div>
        </div>
        <div class="field">
          <label for="receiptCancelReason">Motif obligatoire</label>
          <textarea id="receiptCancelReason" class="input" rows="3" maxlength="300" placeholder="Ex: paiement remboursé au parent, paiement enregistré deux fois..."></textarea>
        </div>
        <label style="display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid rgba(15,23,42,.16);border-radius:9px">
          <input type="checkbox" data-cancel-cash-returned style="margin-top:2px">
          <span>Je confirme que l'argent a été rendu et retiré de la caisse.</span>
        </label>
        <div class="tiny" data-cancel-error style="color:#b91c1c;min-height:16px"></div>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button type="button" class="btn" data-cancel-close>Retour</button>
          ${hasRole("admin") ? `<button type="button" class="btn" data-cancel-correct>Corriger le type</button>` : ""}
          <button type="button" class="btn danger" data-cancel-confirm>Annuler et rembourser</button>
        </div>
      </div>`;
    const reasonInput = panel.querySelector("#receiptCancelReason");
    const cashReturnedInput = panel.querySelector("[data-cancel-cash-returned]");
    const errorEl = panel.querySelector("[data-cancel-error]");
    const close = (value) => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve(value);
    };
    const onKeyDown = (event) => {
      if(event.key === "Escape"){
        event.preventDefault();
        close(null);
      }
    };
    panel.querySelector("[data-cancel-close]")?.addEventListener("click", () => close(null));
    panel.querySelector("[data-cancel-correct]")?.addEventListener("click", () => close({ action: "correct" }));
    panel.querySelector("[data-cancel-confirm]")?.addEventListener("click", () => {
      const reason = String(reasonInput?.value || "").trim().replace(/\s+/g, " ");
      if(reason.length < 3){
        if(errorEl) errorEl.textContent = "Indiquez un motif d'au moins 3 caractères.";
        reasonInput?.focus();
        return;
      }
      if(!cashReturnedInput?.checked){
        if(errorEl) errorEl.textContent = "Confirmez que l'argent a réellement été rendu. Sinon, corrigez le type du reçu.";
        cashReturnedInput?.focus();
        return;
      }
      close({ action: "cancel", reason, cashReturned: true });
    });
    overlay.addEventListener("click", (event) => {
      if(event.target === overlay) close(null);
    });
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => reasonInput?.focus());
  });
}

async function cancelReceiptPayment(paymentId){
  if(!canCancelReceipt()){
    showInAppPopup("Annulation de reçu réservée à admin / caissier / comptable.", { variant: "error", duration: 3600 });
    return;
  }
  const pid = String(paymentId || "").trim();
  if(!pid) return;
  const payment = receiptsApiCache.find((row) => String(row.id || "") === pid)
    || (studentProfileState.payments || []).find((row) => String(row.id || "") === pid)
    || getPayments().find((row) => String(row.id || "") === pid);
  if(!payment) return showInAppPopup("Reçu introuvable.", { variant: "error" });
  if(payment.pendingSync){
    return showInAppPopup("Synchronisez d'abord ce reçu avant de l'annuler.", { variant: "error", duration: 3800 });
  }
  if(payment.cancelled){
    return showInAppPopup("Ce reçu est déjà annulé.", { variant: "error" });
  }
  const decision = await openReceiptCancellationDialog(payment);
  if(!decision) return;
  if(decision.action === "correct"){
    await reclassifyReceiptPayment(pid);
    return;
  }

  try{
    await apiFetch(`/api/payments/${encodeURIComponent(pid)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: decision.reason, cashReturned: decision.cashReturned === true })
    });
    selectedPaymentId = null;
    if(btnReprint) btnReprint.disabled = true;
    if(btnCorrectReceipt) btnCorrectReceipt.disabled = true;
    if(btnCancelReceipt) btnCancelReceipt.disabled = true;
    if(btnDelete) btnDelete.disabled = true;
    setTopReceiptPreview();
    reportsSummaryApiCache.clear();
    busReportApiCache.clear();
    dailyEntriesReportApiCache.clear();
    lateStudentsReportApiCache.clear();
    await Promise.all([
      loadPaymentsFromApi().catch(() => false),
      loadReceiptsFromApi().catch(() => false)
    ]);
    if(studentProfileState.studentId){
      await loadStudentProfile(studentProfileState.studentId, { open:false }).catch(() => {});
    }
    refreshStudentsFinancialState();
    renderStudentList();
    if(selectedStudentId){
      selectedStudentFeeStatus = null;
      selectStudent(selectedStudentId);
      await loadSelectedStudentFeeStatus({ applyMonthDefault: true }).catch(() => {});
    }
    renderReceiptsTable();
    renderDashboard();
    if(viewReports.classList.contains("active")) renderReports();
    showInAppPopup("Reçu annulé et remboursement confirmé. La caisse, les soldes et les rapports ont été recalculés.", { variant: "success", duration: 4200 });
  }catch(err){
    showInAppPopup(`Erreur annulation reçu: ${err.message}`, { variant: "error", duration: 4400 });
  }
}

function syncProfileHistoryAddFeeCurrency(){
  if(!pfHistoryAddFee || !pfHistoryAddCurrency) return;
  const opt = pfHistoryAddFee.options?.[pfHistoryAddFee.selectedIndex];
  const cur = String(opt?.getAttribute?.("data-currency") || "").toUpperCase();
  if(cur && ["USD","CDF"].includes(cur)) pfHistoryAddCurrency.value = cur;
}
async function deletePaymentFromProfile(paymentId){
  if(!hasRole("admin")){
    showInAppPopup("Suppression de paiement (profil) réservée à admin.");
    return;
  }
  const pid = String(paymentId || "").trim();
  if(!pid) return;

  const row = (studentProfileState.payments || []).find((p) => String(p.id || "") === pid)
    || receiptsApiCache.find((p) => String(p.id || "") === pid)
    || getPayments().find((p) => String(p.id || "") === pid);
  const ref = row?.receiptNo ? ` (${row.receiptNo})` : "";
  const ok = await showAppConfirm({
    title: "Supprimer paiement",
    message: `Supprimer ce paiement${ref} ? (Action irréversible)`,
    okText: "Supprimer",
    cancelText: "Annuler",
    okClass: "danger"
  });
  if(!ok) return;

  try{
    await apiFetch(`/api/payments/${encodeURIComponent(pid)}`, { method:"DELETE" });

    setReceiptsApiCache(receiptsApiCache.filter((p) => String(p.id || "") !== pid));
    studentProfileState.payments = (studentProfileState.payments || []).filter((p) => String(p.id || "") !== pid);
    savePayments(getPayments().filter((p) => String(p.id || "") !== pid));
    if(String(profileHistoryEditingPaymentId || "") === pid){
      profileHistoryEditingPaymentId = "";
    }

    if(String(selectedPaymentId || "") === pid){
      selectedPaymentId = null;
      if(btnReprint) btnReprint.disabled = true;
      if(btnCorrectReceipt) btnCorrectReceipt.disabled = true;
      if(btnCancelReceipt) btnCancelReceipt.disabled = true;
      if(btnDelete) btnDelete.disabled = true;
      setTopReceiptPreview();
    }

    reportsSummaryApiCache.clear();
    busReportApiCache.clear();
    dailyEntriesReportApiCache.clear();
    lateStudentsReportApiCache.clear();

    if(studentProfileState.studentId){
      await loadStudentProfile(studentProfileState.studentId, { open:false });
    }else{
      renderProfilePaymentsTable();
    }

    await loadReceiptsFromApi().catch(() => {});
    refreshStudentsFinancialState();
    renderStudentList();
    if(selectedStudentId) selectStudent(selectedStudentId);
    renderDashboard();
    if(viewReports.classList.contains("active")) renderReports();
    if(viewReceipts.classList.contains("active")) renderReceiptsTable();

    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = "Paiement supprimé.";
  }catch(err){
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = `Erreur suppression: ${err.message}`;
    showInAppPopup(`Erreur suppression paiement: ${err.message}`);
  }
}
async function addHistoricalPaymentFromProfile(){
  if(!hasRole("admin", "caissier")){
    showInAppPopup("Ajout d'historique réservé à admin / caissier.");
    return;
  }
  const student = studentProfileState.student;
  if(!student?.id) return showInAppPopup("Aucun élève sélectionné.");

  const dateIso = normalizeLooseDateToISO(pfHistoryAddDate?.value || "");
  const monthIso = String(pfHistoryAddMonth?.value || "").trim();
  const feeTypeId = String(pfHistoryAddFee?.value || "").trim();
  const amount = Number(onlyDigits(String(pfHistoryAddAmount?.value || "")));
  const currency = String(pfHistoryAddCurrency?.value || "USD").toUpperCase();
  const note = String(pfHistoryAddNote?.value || "").trim();
  if(!dateIso) return showInAppPopup("Date paiement requise.");
  if(!/^\d{4}-\d{2}$/.test(monthIso)) return showInAppPopup("Mois payé requis (YYYY-MM).");
  if(!feeTypeId) return showInAppPopup("Type de frais requis.");
  if(!Number.isFinite(amount) || amount <= 0) return showInAppPopup("Montant invalide.");

  const feeOpt = pfHistoryAddFee.options?.[pfHistoryAddFee.selectedIndex];
  const feeLabel = String(feeOpt?.getAttribute?.("data-label") || feeOpt?.textContent || "").trim();
  try{
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = "Ajout en cours...";
    const created = await apiFetch("/api/payments", {
      method: "POST",
      body: JSON.stringify({
        studentId: student.id,
        feeTypeId: Number(feeTypeId),
        feeType: feeLabel,
        paid_for_month: monthIso,
        monthKey: monthIso,
        amount,
        currency,
        note: note || "Paiement historique importé",
        fx_rate: USD_TO_CDF,
        created_at: `${dateIso}T12:00:00.000Z`,
        forceRequestedMonth: true
      })
    });
    if(created){
      const normalized = normalizeReceiptApiRow(created);
      setReceiptsApiCache([normalized, ...receiptsApiCache.filter(p => String(p.id) !== String(normalized.id))]);
      const localPays = getPayments();
      localPays.unshift(normalized);
      savePayments(localPays);
    }
    reportsSummaryApiCache.clear();
    busReportApiCache.clear();
    dailyEntriesReportApiCache.clear();
    lateStudentsReportApiCache.clear();
    if(pfHistoryAddAmount) pfHistoryAddAmount.value = "";
    if(pfHistoryAddNote) pfHistoryAddNote.value = "";
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = "Paiement historique ajouté.";
    await loadStudentProfile(student.id, { open: false });
    await loadReceiptsFromApi().catch(() => {});
    refreshStudentsFinancialState();
    renderStudentList();
    if(selectedStudentId) selectStudent(selectedStudentId);
    renderDashboard();
    if(viewReports.classList.contains("active")) renderReports();
  }catch(err){
    if(pfHistoryAddStatus) pfHistoryAddStatus.textContent = `Erreur: ${err.message}`;
    showInAppPopup(`Erreur ajout historique: ${err.message}`);
  }
}
function renderProfileFeeStatusTable(){
  if(!pfFeeStatusTbody) return;
  const allRows = Array.isArray(studentProfileState.feeStatuses) ? studentProfileState.feeStatuses : [];
  if(!allRows.length){
    pfFeeStatusTbody.innerHTML = `<tr><td colspan="6" class="tiny">Aucun statut disponible.</td></tr>`;
    if(pfFeeStatusControls) pfFeeStatusControls.innerHTML = "";
    return;
  }
  if(!Number.isFinite(profileFeeStatusVisibleCount) || profileFeeStatusVisibleCount < PROFILE_FEE_STATUS_STEP){
    profileFeeStatusVisibleCount = PROFILE_FEE_STATUS_STEP;
  }
  const rows = allRows.slice(0, profileFeeStatusVisibleCount);
  pfFeeStatusTbody.innerHTML = rows.map((r) => {
    const cycle = normalizeFeeBillingCycle(r.feeTypeBillingCycle || "monthly");
    let status = String(r.status || "?").trim() || "?";
    let paid = Number(r.paidSoFar || 0);
    let remaining = Number(r.remaining || 0);
    let displayMonthKey = String(r.nextDueMonth || r.selectedMonth || "");
    const cur = String(r.currency || "USD");

    // Annual fees should reflect the current school-year balance.
    if(cycle === "annual"){
      const annualDue = Number(r.annualPaymentLockDueAmount || r.dueAmount || 0);
      const annualRemainingRaw = Number(r.annualPaymentLockRemaining);
      const annualRemaining = Number.isFinite(annualRemainingRaw)
        ? Math.max(0, annualRemainingRaw)
        : Math.max(0, Number(remaining || 0));
      remaining = annualRemaining;
      paid = Math.max(0, annualDue - annualRemaining);
      displayMonthKey = String(r.annualPaymentLockMonth || displayMonthKey || "");

      if(annualRemaining <= 0.000001){
        status = "À jour";
      } else if(paid > 0.000001){
        status = "Partiel";
      } else {
        const statusNormAnnual = normalizeTextAscii(status);
        if(!statusNormAnnual || statusNormAnnual === "a jour") status = "Impay?";
      }
    }

    const remainingForStatus = Number.isFinite(remaining) ? Math.max(0, Number(remaining)) : 0;
    const isZeroRemaining = Math.round(remainingForStatus) <= 0;
    if(isZeroRemaining){
      status = "À jour";
    }
    const statusNorm = normalizeTextAscii(status);
    if(statusNorm === "a jour"){
      status = "À jour";
    }
    const chipClass = isZeroRemaining
      ? "ok"
      : (statusNorm === "a jour" ? "ok" : (statusNorm.startsWith("partiel") ? "partial" : "late"));
    if(!Number.isFinite(paid)) paid = 0;
    if(!Number.isFinite(remaining)) remaining = 0;

    const monthChips = buildProfileMonthChips({
      monthsPaid: Array.isArray(r.monthsPaid) ? r.monthsPaid : [],
      monthsPartial: Array.isArray(r.monthsPartial) ? r.monthsPartial : []
    });
    const monthsPaidHtml = monthChips.length
      ? monthChips.map((chip) => `<span class="badge ${chip.className}">${esc(chip.label)}</span>`).join("")
      : `<span class="tiny">Aucun</span>`;
    return `
      <tr>
        <td><strong>${esc(r.feeTypeLabel || "?")}</strong></td>
        <td><span class="badge ${chipClass}">${esc(status)}</span></td>
        <td>${esc(monthLabelShortFrFromMonthKey(displayMonthKey, { withYear: true }))}</td>
        <td>${monthsPaidHtml}</td>
        <td>${esc(formatMoney(paid, cur))}</td>
        <td><strong>${esc(formatMoney(remaining, cur))}</strong></td>
      </tr>
    `;
  }).join("");

  if(pfFeeStatusControls){
    const remaining = Math.max(0, allRows.length - rows.length);
    const canLess = profileFeeStatusVisibleCount > PROFILE_FEE_STATUS_STEP;
    const parts = [];
    if(remaining > 0){
      parts.push(`<button class="btn" type="button" data-pf-fee-more="1">Voir plus (${remaining})</button>`);
    }
    if(canLess){
      parts.push(`<button class="btn" type="button" data-pf-fee-less="1">Voir moins</button>`);
    }
    pfFeeStatusControls.innerHTML = parts.join("");
  }
}
function syncProfileInfoFormFromStudent(student){
  const s = student || {};
  if(pfFullName) pfFullName.value = String(s.fullName || s.name || "");
  if(pfMonthlyDueEdit){
    const due = Number(s.monthlyDue || 0);
    pfMonthlyDueEdit.value = Number.isFinite(due) ? String(due) : "";
  }
  if(pfEnrolledAt) pfEnrolledAt.value = formatIsoDateToFr(s.createdAt || s.created_at || "");
  if(pfParentName) pfParentName.value = String(s.parentName || "");
  if(pfParentPhone) pfParentPhone.value = String(s.parentPhone || "");
  if(pfDateOfBirth) pfDateOfBirth.value = formatIsoDateToFr(s.dateOfBirth || s.date_of_birth || "");
  if(pfParentPhoneAlt) pfParentPhoneAlt.value = String(s.parentPhoneAlt || "");
  if(pfAddress) pfAddress.value = String(s.address || "");
  if(pfEmergencyContact) pfEmergencyContact.value = String(s.emergencyContact || "");
  if(pfStudentNote) pfStudentNote.value = String(s.studentNote || "");
  if(pfFamilyLink) pfFamilyLink.value = "";
  if(pfFamilyLinkStatus) pfFamilyLinkStatus.textContent = "Recherchez un autre élève pour compléter ou corriger cette fratrie.";
  syncProfileSexToggleButtonFromStudent(s);
}
function syncProfileSexToggleButtonFromStudent(student){
  if(!pfSexToggleBtn) return;
  const sex = normalizeSex(student?.sex);
  if(sex === "M"){
    pfSexToggleBtn.textContent = "M -> F";
    pfSexToggleBtn.title = "Corriger le sexe vers F";
    pfSexToggleBtn.disabled = false;
  }else if(sex === "F"){
    pfSexToggleBtn.textContent = "F -> M";
    pfSexToggleBtn.title = "Corriger le sexe vers M";
    pfSexToggleBtn.disabled = false;
  }else{
    pfSexToggleBtn.textContent = "Corriger";
    pfSexToggleBtn.title = "Sexe non renseigné";
    pfSexToggleBtn.disabled = true;
  }
}
async function refreshStudentProfileAfterMutation(previousStudentId, updatedStudent, { wasSelected = false } = {}){
  const nextStudentId = String(updatedStudent?.id || previousStudentId || "").trim();
  if(nextStudentId && nextStudentId !== previousStudentId){
    remapStudentIdentityAcrossLocalPayments(previousStudentId, updatedStudent);
  }
  await Promise.all([
    loadPaymentsFromApi().catch(() => false),
    loadReceiptsFromApi().catch(() => false)
  ]);
  await loadStudents();
  await renderStudentsTable();
  renderStudentList();
  await loadStudentProfile(nextStudentId || previousStudentId, { open: false });
  if(wasSelected && nextStudentId){
    selectedStudentFeeStatus = null;
    selectStudent(nextStudentId);
    await loadSelectedStudentFeeStatus({ applyMonthDefault: true }).catch(() => {});
  }
  reportsSummaryApiCache.clear();
  busReportApiCache.clear();
  lateStudentsReportApiCache.clear();
  renderDashboard();
  if(viewReceipts.classList.contains("active")) renderReceiptsTable();
  if(viewReports.classList.contains("active")) renderReports();
  return nextStudentId;
}
async function submitStudentProfileInfoUpdate(){
  if(!canEditStudentProfileInfo()){
    showInAppPopup("Action réservée aux utilisateurs autorisés.");
    return;
  }
  const student = studentProfileState.student;
  if(!student?.id){
    showInAppPopup("Aucun profil chargé.");
    return;
  }
  const previousStudentId = String(student.id || "").trim();
  const fullName = String(pfFullName?.value || "").trim().replace(/\s+/g, " ").slice(0, 140);
  if(!fullName){
    if(pfInfoStatus) pfInfoStatus.textContent = "Nom complet requis.";
    return showInAppPopup("Nom complet requis.");
  }
  const wasSelected = String(selectedStudentId || "").trim() === previousStudentId;
  const rawDateOfBirth = String(pfDateOfBirth?.value || "").trim();
  const dateOfBirth = normalizeProfileDateInput(rawDateOfBirth);
  if(rawDateOfBirth && !dateOfBirth){
    if(pfInfoStatus) pfInfoStatus.textContent = "Date de naissance invalide. Format: JJ/MM/AAAA.";
    return showInAppPopup("Date de naissance invalide. Format attendu: JJ/MM/AAAA.");
  }
  const rawEnrolledAt = String(pfEnrolledAt?.value || "").trim();
  const enrolledAt = normalizeProfileDateInput(rawEnrolledAt);
  if(!enrolledAt){
    if(pfInfoStatus) pfInfoStatus.textContent = "Date d'inscription invalide. Format: JJ/MM/AAAA.";
    return showInAppPopup("Date d'inscription invalide. Format attendu: JJ/MM/AAAA.");
  }
  const canEditMonthlyDue = hasRole("admin", "caissier");
  let monthlyDue = null;
  if(canEditMonthlyDue){
    const rawMonthlyDue = String(pfMonthlyDueEdit?.value || "").trim().replace(",", ".");
    const parsedMonthlyDue = Number(rawMonthlyDue);
    if(rawMonthlyDue === "" || !Number.isFinite(parsedMonthlyDue) || parsedMonthlyDue < 0){
      if(pfInfoStatus) pfInfoStatus.textContent = "Frais mensuel invalide (USD).";
      return showInAppPopup("Frais mensuel invalide (USD).");
    }
    monthlyDue = parsedMonthlyDue;
  }
  const payload = {
    fullName,
    createdAt: enrolledAt,
    parentName: normalizeProfileTextInput(pfParentName?.value, 140),
    parentPhone: normalizeProfileTextInput(pfParentPhone?.value, 40),
    dateOfBirth,
    parentPhoneAlt: normalizeProfileTextInput(pfParentPhoneAlt?.value, 40),
    address: normalizeProfileTextInput(pfAddress?.value, 220),
    emergencyContact: normalizeProfileTextInput(pfEmergencyContact?.value, 140),
    studentNote: normalizeProfileTextInput(pfStudentNote?.value, 500)
  };
  if(canEditMonthlyDue) payload.monthlyDue = monthlyDue;
  try{
    if(pfInfoStatus) pfInfoStatus.textContent = "Enregistrement des informations...";
    const updatedStudent = await apiFetch(`/api/students/${encodeURIComponent(student.id)}/profile`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    const nextStudentId = await refreshStudentProfileAfterMutation(previousStudentId, updatedStudent, { wasSelected });
    if(pfInfoStatus){
      pfInfoStatus.textContent = nextStudentId && nextStudentId !== previousStudentId
        ? `Informations élève enregistrées. Nouveau matricule: ${nextStudentId}.`
        : "Informations élève enregistrées.";
    }
  }catch(err){
    if(pfInfoStatus) pfInfoStatus.textContent = `Erreur: ${err.message}`;
    showInAppPopup(`Erreur enregistrement infos élève: ${err.message}`);
  }
}
async function submitStudentProfileFamilyLink(){
  const student = studentProfileState?.student;
  if(!student?.id) return showInAppPopup("Aucun profil chargé.");
  const familyInput = String(pfFamilyLink?.value || "").trim();
  const selected = enrollmentFamilyLinkByLabel.get(familyInput);
  if(!selected){
    if(pfFamilyLinkStatus) pfFamilyLinkStatus.textContent = "Choisissez une proposition de la liste.";
    return showInAppPopup("Choisissez un frère, une sœur ou une famille proposée dans la liste.");
  }
  const link = String(selected.key || "");
  const siblingStudentId = link.startsWith("student:") ? link.slice(8) : null;
  const familyId = link.startsWith("family:") ? link.slice(7) : null;
  if(siblingStudentId && siblingStudentId === String(student.id)){
    if(pfFamilyLinkStatus) pfFamilyLinkStatus.textContent = "Choisissez un autre élève.";
    return;
  }
  try{
    if(pfFamilyLinkBtn) pfFamilyLinkBtn.disabled = true;
    if(pfFamilyLinkStatus) pfFamilyLinkStatus.textContent = "Rattachement en cours…";
    const result = await apiFetch(`/api/students/${encodeURIComponent(student.id)}/family`, {
      method: "POST",
      body: JSON.stringify({ siblingStudentId, familyId })
    });
    if(result?.student) studentProfileState.student = result.student;
    await loadStudents();
    renderStudentProfileModal();
    if(pfFamilyLinkStatus) pfFamilyLinkStatus.textContent = `Famille enregistrée · ${Math.max(0, Number(result?.siblings?.length || 1) - 1)} frère(s) / sœur(s).`;
    showToast("Lien familial enregistré", { variant: "success", duration: 2200 });
  }catch(err){
    if(pfFamilyLinkStatus) pfFamilyLinkStatus.textContent = `Erreur: ${err.message}`;
    showInAppPopup(`Impossible de rattacher la famille: ${err.message}`);
  }finally{
    if(pfFamilyLinkBtn) pfFamilyLinkBtn.disabled = false;
  }
}
async function toggleStudentSexFromProfile(){
  if(!canEditStudentProfileInfo()){
    showInAppPopup("Action réservée aux utilisateurs autorisés.");
    return;
  }
  const student = studentProfileState.student;
  if(!student?.id){
    showInAppPopup("Aucun profil chargé.");
    return;
  }
  const currentSex = normalizeSex(student.sex);
  const nextSex = currentSex === "M" ? "F" : currentSex === "F" ? "M" : "";
  if(!nextSex){
    if(pfInfoStatus) pfInfoStatus.textContent = "Sexe non renseigné.";
    showInAppPopup("Sexe non renseigné.");
    return;
  }
  const previousStudentId = String(student.id || "").trim();
  const wasSelected = String(selectedStudentId || "").trim() === previousStudentId;
  try{
    if(pfInfoStatus) pfInfoStatus.textContent = "Correction du sexe en cours...";
    const updatedStudent = await apiFetch(`/api/students/${encodeURIComponent(student.id)}/profile`, {
      method: "PATCH",
      body: JSON.stringify({ sex: nextSex })
    });
    const nextStudentId = await refreshStudentProfileAfterMutation(previousStudentId, updatedStudent, { wasSelected });
    if(pfInfoStatus){
      pfInfoStatus.textContent = nextStudentId && nextStudentId !== previousStudentId
        ? `Sexe corrigé. Nouveau matricule: ${nextStudentId}.`
        : "Sexe corrigé.";
    }
  }catch(err){
    if(pfInfoStatus) pfInfoStatus.textContent = `Erreur: ${err.message}`;
    showInAppPopup(`Erreur correction sexe: ${err.message}`);
  }
}
function renderStudentProfileModal(){
  const s = studentProfileState.student;
  if(!s) return;
  const canStartPayment = isStudentActiveRecord(s);
  const canEditInfo = canEditStudentProfileInfo();
  const profileInfoFields = [pfFullName, pfEnrolledAt, pfParentName, pfParentPhone, pfDateOfBirth, pfParentPhoneAlt, pfAddress, pfEmergencyContact, pfStudentNote];
  for(const field of profileInfoFields){
    if(field) field.disabled = !canEditInfo;
  }
  if(studentProfileTitle) studentProfileTitle.textContent = `Profil élève — ${s.fullName || s.name || "—"}`;
  if(studentProfileSubtitle) studentProfileSubtitle.textContent = `Matricule: ${s.matricule || s.id || "—"}`;
  if(pfAvatar) pfAvatar.textContent = profileInitials(s.fullName || s.name || "");
  if(pfProfileClassChip) pfProfileClassChip.textContent = `${s.className || "—"} · ${apiLevelToLabel(s.level || s.levelValue || "")}`;
  if(pfProfileStatusChip){
    const active = isStudentActiveRecord(s);
    pfProfileStatusChip.textContent = active ? "Actif" : "Inactif";
    pfProfileStatusChip.classList.toggle("is-active", active);
    pfProfileStatusChip.classList.toggle("is-alert", !active);
  }
  if(pfId) pfId.textContent = s.matricule || s.id || "—";
  if(pfName) pfName.textContent = s.fullName || s.name || "—";
  if(pfClass) pfClass.textContent = s.className || "—";
  if(pfLevel) pfLevel.textContent = apiLevelToLabel(s.level || s.levelValue || "");
  if(pfSex) pfSex.textContent = (String(s.sex || "").toUpperCase() === "F" ? "F" : (String(s.sex || "").toUpperCase() === "M" ? "M" : "—"));
  if(pfEnrolledAt) pfEnrolledAt.value = formatIsoDateToFr(s.createdAt || s.created_at || "");
  if(pfMonthlyDue) pfMonthlyDue.textContent = formatMonthlyDueUSD(Number(s.monthlyDue || 0));
  const profileFamilyId = String(s.familyId || "").trim();
  const profileSiblings = profileFamilyId
    ? (Array.isArray(students) ? students : []).filter((student) =>
        String(student.familyId || "") === profileFamilyId && String(student.id || "") !== String(s.id || "") && isStudentActiveRecord(student)
      )
    : [];
  if(pfFamilyName) pfFamilyName.textContent = s.familyName || s.parentName || (profileFamilyId ? "Famille" : "Lien à confirmer");
  if(pfSiblings) pfSiblings.textContent = profileSiblings.length
    ? profileSiblings.map((student) => `${student.name || student.fullName} (${student.className || "—"})`).join(", ")
    : (profileFamilyId ? "Aucun autre enfant inscrit" : "Aucun lien confirmé");
  syncProfileSexToggleButtonFromStudent(s);
  if(pfSexToggleBtn){
    pfSexToggleBtn.style.display = canEditInfo ? "" : "none";
    pfSexToggleBtn.disabled = !canEditInfo || !["M", "F"].includes(normalizeSex(s.sex));
  }
  if(pfBusSub) pfBusSub.textContent = formatBusSubscriptionLabel(studentProfileState.busSubscription);
  if(pfBusManageBtn){
    const canBus = canManageBusSubscription();
    pfBusManageBtn.style.display = canBus ? "" : "none";
    pfBusManageBtn.disabled = !canBus;
  }
  if(pfTuitionBenefit) pfTuitionBenefit.textContent = formatTuitionBenefitLabel(studentProfileState.tuitionBenefit);
  if(pfTuitionBenefitBtn){
    const canBenefit = canManageTuitionBenefit();
    pfTuitionBenefitBtn.style.display = canBenefit ? "" : "none";
    pfTuitionBenefitBtn.disabled = !canBenefit;
  }
  if(studentProfileNewPaymentBtn){
    studentProfileNewPaymentBtn.disabled = !canStartPayment;
    studentProfileNewPaymentBtn.title = canStartPayment
      ? ""
      : "Eleve inactif. Reactivez-le avant un nouveau paiement.";
  }
  syncProfileInfoFormFromStudent(s);
  if(pfMonthlyDueEditField){
    pfMonthlyDueEditField.style.display = hasRole("admin", "caissier") ? "" : "none";
  }
  if(pfMonthlyDueEdit){
    pfMonthlyDueEdit.disabled = !hasRole("admin", "caissier");
  }
  if(pfInfoSaveBtn){
    pfInfoSaveBtn.disabled = !canEditInfo;
  }
  if(pfInfoStatus){
    pfInfoStatus.textContent = canEditInfo
      ? "Informations élève (partagées sur tous les postes). Le petit bouton corrige aussi le sexe et le matricule."
      : "Consultation seulement.";
  }
  syncSelectEmptyStyle(studentProfileModal || document);

  if(pfChangeLevel && canChangeStudentClassProfile()){
    const lvl = normalizeApiLevelValue(s.level);
    pfChangeLevel.value = lvl;
    const split = splitClassBaseAndCode(lvl, s.className);
    profileSyncClassControlsFromLevel({ preserve: false });
    if(pfChangeClass){
      const options = Array.from(pfChangeClass.options || []).map(o => o.value);
      if(options.includes(split.base)) pfChangeClass.value = split.base;
      else if(split.base){
        const opt = document.createElement("option");
        opt.value = split.base;
        opt.textContent = split.base;
        pfChangeClass.appendChild(opt);
        pfChangeClass.value = split.base;
      }
    }
    if(pfChangeCode && split.code) pfChangeCode.value = split.code;
    if(pfChangeStatus) pfChangeStatus.textContent = "Réservé à admin / caissier.";
  }

  renderProfileFeeStatusTable();
  if(typeof profileFinanceRender === "function") profileFinanceRender();
  renderProfileHistoryFilterOptions();
  if(pfHistoryAddWrap){
    const canAddHistoricalPayment = hasRole("admin", "caissier");
    pfHistoryAddWrap.style.display = canAddHistoricalPayment ? "" : "none";
    if(canAddHistoricalPayment){
      if(pfHistoryAddDate && !pfHistoryAddDate.value) pfHistoryAddDate.value = fmtDateFrLong(new Date());
      if(pfHistoryAddMonth && !pfHistoryAddMonth.value){
        const now = new Date();
        pfHistoryAddMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}`;
      }
      if(pfHistoryAddFee){
        const keep = String(pfHistoryAddFee.value || "");
        const feeRows = getFeeTypeObjects().filter((ft) => isFeeTypeApplicableForStudent(ft, studentProfileState?.student));
        pfHistoryAddFee.innerHTML = `<option value="">— Choisir —</option>` +
          feeRows.map((ft) => {
            const label = normalizeFeeName(ft.labelFr);
            return `<option value="${esc(String(ft.id))}" data-label="${esc(label)}" data-currency="${esc(String(ft.defaultCurrency || "USD").toUpperCase())}">${esc(label)}</option>`;
          }).join("");
        if(keep && Array.from(pfHistoryAddFee.options).some(o => o.value === keep)) pfHistoryAddFee.value = keep;
      }
    }
  }
  renderProfilePaymentsTable();
  renderProfileAcademicSummary();
  setStudentProfileTab(profileActiveTab);
  window.refreshDuplicateMergeButton?.();
}
function openStudentProfileModal(){
  if(!studentProfileModal) return;
  studentProfileModal.style.display = "flex";
  studentProfileModal.setAttribute("aria-hidden", "false");
  saveUiStatePatch({ profileOpen: true, profileStudentId: String(studentProfileState?.studentId || "") });
}
function closeStudentProfileModal(){
  if(!studentProfileModal) return;
  profileHistoryEditingPaymentId = "";
  if(typeof profileFinance !== "undefined") profileFinance.version++;
  studentProfileModal.style.display = "none";
  studentProfileModal.setAttribute("aria-hidden", "true");
  saveUiStatePatch({ profileOpen: false });
}
async function loadStudentProfile(studentId, { open = true } = {}){
  if(!canOpenStudentProfile()){
    showInAppPopup("Profil réservé aux utilisateurs connectés.");
    return;
  }
  try{
    const loadVersion = ++profileLoadVersion;
    let financeUnavailable = false;
    const wasSameStudent = String(studentProfileState?.studentId || "") === String(studentId || "");
    const [student, payments, feeTypes, busSub, tuitionBenefit, academic] = await Promise.all([
      apiFetch(`/api/students/${encodeURIComponent(studentId)}`),
      apiFetch(`/api/payments?studentId=${encodeURIComponent(studentId)}`).catch(() => { financeUnavailable = true; return []; }),
      apiFetch(`/api/fee-types`).catch(() => { financeUnavailable = true; return []; }),
      apiFetch(`/api/students/${encodeURIComponent(studentId)}/bus-subscription`).catch(() => {
        const busDefault = findFeeTypeByCode("BUS");
        return {
          studentId,
          active: false,
          monthlyAmount: Number(busDefault?.defaultAmount || 0),
          monthlyCurrency: normalizeCurrencyCode(busDefault?.defaultCurrency || "USD")
        };
      }),
      apiFetch(`/api/students/${encodeURIComponent(studentId)}/tuition-benefit`).catch(() => ({ studentId, active: false })),
      apiFetch(`/api/students/${encodeURIComponent(studentId)}/grades`).catch(() => null)
    ]);
    const { mergedPayments, pendingLocalPayments } = mergeStudentPendingPaymentsWithServer(studentId, payments);
    const feeTypeRows = Array.isArray(feeTypes)
      ? feeTypes.filter((ft) => ft?.active !== false && isFeeTypeApplicableForStudent(ft, student))
      : [];
    const feeStatuses = [];
    for(const ft of feeTypeRows){
      try{
        // Profile status must reflect the real next due month status, not the report month.
        const st = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/status?feeTypeId=${encodeURIComponent(ft.id)}&allowInactive=1`);
        feeStatuses.push({
          ...st,
          feeTypeLabel: ft.labelFr || st.feeTypeLabel || "—"
        });
      }catch(_){
        feeStatuses.push({feeTypeId: ft.id, feeTypeLabel: ft.labelFr, feeTypeBillingCycle: ft.billingCycle, unavailable: true});
        financeUnavailable = true;
      }
    }
    if(loadVersion !== profileLoadVersion) return;
    studentProfileState = {
      financeUnavailable,
      pendingPaymentCount: pendingLocalPayments.length,
      studentId: String(studentId),
      student,
      payments: mergedPayments,
      busSubscription: busSub || null,
      tuitionBenefit: tuitionBenefit || null,
      feeStatuses: feeStatuses.map((row) => row.unavailable ? row : applyPendingPaymentsToFeeStatus(row, pendingLocalPayments)),
      academic: academic || null
    };
    if(!wasSameStudent){
      profileActiveTab = "finance";
      profileFeeStatusVisibleCount = PROFILE_FEE_STATUS_STEP;
      profileHistoryVisibleCount = Math.max(1, Number(pfHistoryLimit?.value || 10));
    }else if(profileHistoryVisibleCount < Math.max(1, Number(pfHistoryLimit?.value || 10))){
      profileHistoryVisibleCount = Math.max(1, Number(pfHistoryLimit?.value || 10));
    }
    renderStudentProfileModal();
  if(open) openStudentProfileModal();
    saveUiStatePatch({ profileStudentId: String(studentId || "") });
  }catch(err){
    showInAppPopup(`Erreur chargement profil: ${err.message}`);
  }
}
async function submitStudentProfileClassChange(){
  if(!canChangeStudentClassProfile()){
    showInAppPopup("Action réservée à admin / caissier.");
    return;
  }
  const stateStudent = studentProfileState.student;
  if(!stateStudent?.id){
    showInAppPopup("Aucun profil chargé.");
    return;
  }
  const level = normalizeApiLevelValue(pfChangeLevel?.value || "");
  const className = buildProfileClassNameFromInputs();
  const effectiveMonth = String(pfEffectiveMonth?.value || "").trim();
  const reason = String(pfChangeReason?.value || "").trim();
  if(!level) return showInAppPopup("Choisir un niveau.");
  if(!className) return showInAppPopup("Choisir une classe valide.");
  try{
    if(pfChangeStatus) pfChangeStatus.textContent = "Enregistrement...";
    await apiFetch(`/api/students/${encodeURIComponent(stateStudent.id)}/class`, {
      method: "PUT",
      body: JSON.stringify({
        level,
        className,
        effectiveMonth: effectiveMonth || null,
        reason: reason || null
      })
    });
    if(pfChangeStatus) pfChangeStatus.textContent = "Changement enregistré.";
    await loadStudents();
    await renderStudentsTable();
    await loadStudentProfile(stateStudent.id, { open: false });
    renderStudentList();
    if(String(selectedStudentId || "") === String(stateStudent.id || "")){
      selectedStudentFeeStatus = null;
      selectStudent(stateStudent.id);
      await loadSelectedStudentFeeStatus({ applyMonthDefault: true }).catch(() => {});
    }
    renderDashboard();
    if(viewReports.classList.contains("active")) renderReports();
  }catch(err){
    if(pfChangeStatus) pfChangeStatus.textContent = `Erreur: ${err.message}`;
    showInAppPopup(`Erreur changement classe/niveau: ${err.message}`);
  }
}
function renderPaidMonthsBadges(statusObj){
  if(!elPaidMonthsList) return;
  // Moved to profile modal per UX request; keep hidden on payment screen.
  elPaidMonthsList.style.display = "none";
  const items = Array.isArray(statusObj?.monthsPaid) ? statusObj.monthsPaid : [];
  elPaidMonthsList.innerHTML = items.length ? items.map((mk) => `<span class="badge ok">${esc(monthLabelFromMonthKey(mk))}</span>`).join("") : "";
}
function updatePaymentStatusHint(statusObj){
  if(!elPayStatusHint) return;
  elPayStatusHint.style.display = "none";
  if(!statusObj){ elPayStatusHint.textContent = "Statut paiement: —"; return; }
  const status = String(statusObj.status || "—");
  const nextMonth = monthLabelFromMonthKey(statusObj.nextDueMonth || statusObj.selectedMonth || "");
  const remaining = Number(statusObj.remaining || 0);
  const currency = String(statusObj.currency || "USD");
  const remTxt = currency === "USD" ? formatUSD(remaining) : formatMoney(remaining, currency);
  let hint = `Statut: ${status} • Prochain mois: ${nextMonth || "—"} • Reste: ${remTxt}`;
  if(Boolean(statusObj?.tranchePrerequisiteBlocked)){
    hint += ` • ${tranchePrerequisiteLockMessage(statusObj)}`;
  }
  elPayStatusHint.textContent = hint;
}
async function loadSelectedStudentFeeStatus({ applyMonthDefault = true } = {}){
  const s = getPaymentEligibleStudentById(selectedStudentId);
  const feeMeta = getSelectedFeeTypeMeta();
  if(!s || !feeMeta?.id){
    selectedStudentFeeStatus = null;
    renderPaidMonthsBadges(null);
    updatePaymentStatusHint(null);
    if(elMonth){
      for(const opt of Array.from(elMonth.options || [])){
        opt.disabled = false;
      }
    }
    return null;
  }
  try{
    const requestedMonth = monthKeyFromLabelFR(elMonth?.value || "");
    const fetchStatus = async (monthKey) => {
      const qs = new URLSearchParams();
      qs.set("feeTypeId", String(feeMeta.id));
      if(monthKey) qs.set("month", monthKey);
      return apiFetch(`/api/students/${encodeURIComponent(s.id)}/status?${qs.toString()}`);
    };

    let status = await fetchStatus(requestedMonth);
    const nextDueMonthKey = String(status?.nextDueMonth || "").trim();
    const nextDueMonthLabel = monthLabelForActiveSchoolYear(nextDueMonthKey);
    const fallbackMonthLabel = isSchoolMonthLabel(elMonth?.value || "") ? String(elMonth.value || "") : getCurrentMonthLabel();
    const feeCycle = normalizeFeeBillingCycle(status?.feeTypeBillingCycle || feeMeta?.billingCycle || "monthly");
    const shouldForceCanonicalMonth = Boolean(nextDueMonthLabel) && (feeCycle === "annual" || applyMonthDefault);

    // Keep annual fees pinned to their canonical due month.
    // For other fees, preserve existing auto-default behavior when requested.
    if(shouldForceCanonicalMonth){
      setSchoolMonthSelectValue(elMonth, nextDueMonthLabel, fallbackMonthLabel);
      if(nextDueMonthKey && nextDueMonthKey !== requestedMonth){
        try{
          status = await fetchStatus(nextDueMonthKey);
        }catch(_){
          // Keep first status if canonical refresh fails.
        }
      }
    } else {
      setSchoolMonthSelectValue(elMonth, fallbackMonthLabel);
    }
    const { pendingLocalPayments } = mergeStudentPendingPaymentsWithServer(s.id, []);
    status = applyPendingPaymentsToFeeStatus(status, pendingLocalPayments);

    selectedStudentFeeStatus = status || null;
    renderPaidMonthsBadges(status);
    updatePaymentStatusHint(status);
    syncMonthSelectAvailability(s);
    if(s && elSelBal){
      const rem = Number(status?.remaining || 0);
      const cur = String(status?.currency || "USD");
      elSelBal.textContent = cur === "USD" ? formatUSD(rem) : formatMoney(rem, cur);
    }
    enforceAmountLimitForSelectedMonth();
    if(s){
      const statusFeeCode = String(status?.feeTypeCode || feeMeta?.code || "").toUpperCase();
      const statusFeeName = normalizeFeeName(status?.feeTypeLabel || feeMeta?.labelFr || elFee?.value || "");
      let apiStatus = String(status?.timelineStatus || status?.status || "").trim();
      // Student list badges represent tuition status only.
      // Do not overwrite them when the selected fee is Bus/autre fee type.
      const isTuitionStatus = statusFeeCode === "TUITION"
        || statusFeeName === "Minerval"
        || statusFeeName === "Frais de scolarité"
        || statusFeeName === "Frais de scolaire";
      if(isTuitionStatus){
        // Normalize backend labels (accented) to the labels used in the student list badges.
        if(apiStatus === "À jour" || apiStatus === "A jour"){
          s.status = "A jour";
        } else if(apiStatus === "Partiel"){
          s.status = "Partiel";
        } else if(
          apiStatus === "En retard"
          || /^impay/i.test(apiStatus)
          || /^non\s*pay/i.test(apiStatus)
        ){
          s.status = "En retard";
        }
      }
      // Payment page "Solde" should reflect the currently selected fee type's remaining.
      s.balance = Number(status?.remaining || 0);
      renderStudentList();
      if(viewStudents?.classList?.contains("active")){
        renderStudentsTableGrouped();
      }
    }
    validateForm();
    refreshReceiptPreviewFromForm();
    return status;
  }catch(_){
    selectedStudentFeeStatus = null;
    renderPaidMonthsBadges(null);
    updatePaymentStatusHint(null);
    if(elMonth){
      for(const opt of Array.from(elMonth.options || [])){
        opt.disabled = false;
      }
    }
    validateForm();
    return null;
  }
}

function normalizeReceiptApiRow(row){
  const amount = Number(row?.amount || 0);
  const originalAmountRaw = Number(row?.originalAmount ?? row?.cancelledAmount ?? row?.cancelled_amount);
  const currency = row?.currency || "USD";
  const printCount = normalizePrintCount(row?.printCount ?? row?.print_count ?? 0);
  const feeTypeIdRaw = row?.feeTypeId || row?.fee_type_id || null;
  const feeObjById = findFeeTypeById(feeTypeIdRaw);
  const feeObjByLabel = findFeeTypeByLabel(row?.feeType || row?.fee_type || row?.feeTypeLabel || "");
  const normalizedFeeCode = String(
    row?.feeTypeCode || row?.fee_type_code || feeObjById?.code || feeObjByLabel?.code || ""
  ).toUpperCase();
  const rowRate = Number(row?.fxRate || row?.fx_rate || USD_TO_CDF);
  const amountUSDReceivedRaw = row?.amountUSDReceived ?? row?.amount_usd_received;
  const amountCDFReceivedRaw = row?.amountCDFReceived ?? row?.amount_cdf_received;
  const fx = currency === "USD"
    ? { usd: amount, cdf: Math.round(amount * rowRate) }
    : { usd: +(amount / (rowRate || USD_TO_CDF)).toFixed(2), cdf: amount };
  const paidForMonthKey = row.paidForMonth || row.paid_for_month || row.monthKey || row.month;
  return {
    id: String(row.id),
    clientRequestId: row.clientRequestId || row.client_request_id || null,
    receiptNo: row.receiptNo || buildReceiptNo(Number(row.id || 0)),
    receiptDeviceId: row.receiptDeviceId || row.receipt_device_id || null,
    receiptDeviceCode: row.receiptDeviceCode || row.receipt_device_code || null,
    createdAt: row.createdAt || new Date().toISOString(),
    paidAt: row.paidAt || row.paid_at || row.createdAt || new Date().toISOString(),
    cashier: decodeLikelyUtf8Mojibake(row.createdByUsername || row.cashier || "—"),
    studentId: row.studentId,
    studentName: decodeLikelyUtf8Mojibake(row.studentName || "—"),
    matricule: row.matricule || row.studentMatriculeSnapshot || row.studentId || "—",
    className: decodeLikelyUtf8Mojibake(row.className || "—"),
    level: row.level || "—",
    feeType: getLiveFeeLabel(row) || "Minerval",
    feeTypeCode: normalizedFeeCode,
    month: monthLabelFromMonthKey(paidForMonthKey),
    monthKey: paidForMonthKey || row.monthKey || monthLabelToYYYYMM(row.month || getCurrentMonthLabel()),
    paidForMonth: paidForMonthKey || null,
    feeTypeId: feeTypeIdRaw || feeObjByLabel?.id || null,
    paymentMethod: row?.paymentMethod || row?.payment_method || null,
    schoolYearStartYear: Number.isFinite(Number(row.schoolYearStartYear)) ? Number(row.schoolYearStartYear) : null,
    currency,
    amountEntered: amount,
    originalAmount: Number.isFinite(originalAmountRaw) ? originalAmountRaw : null,
    amountUSD: Number(row.currency === "USD" ? amount : fx.usd),
    amountCDF: Number(row.currency === "CDF" ? amount : fx.cdf),
    amountUSDReceived: amountUSDReceivedRaw == null ? null : Number(amountUSDReceivedRaw || 0),
    amountCDFReceived: amountCDFReceivedRaw == null ? null : Number(amountCDFReceivedRaw || 0),
    printCount,
    isCopy: printCount >= 1,
    pendingSync: false,
    syncError: "",
    syncAttempts: 0,
    syncLastErrorAt: null,
    mode: DEFAULT_PAYMENT_MODE,
    note: decodeLikelyUtf8Mojibake(row.note || ""),
    cancelled: Boolean(row?.cancelled || row?.cancelledAt || row?.cancelled_at),
    cancelledAt: row?.cancelledAt || row?.cancelled_at || null,
    cancelledByUsername: decodeLikelyUtf8Mojibake(row?.cancelledByUsername || row?.cancelled_by_username || ""),
    cancellationReason: decodeLikelyUtf8Mojibake(row?.cancellationReason || row?.cancellation_reason || ""),
    correctionCount: Number(row?.correctionCount ?? row?.correction_count ?? 0),
    corrected: Boolean(row?.corrected || Number(row?.correctionCount ?? row?.correction_count ?? 0) > 0 || row?.receiptDoc?.correction),
    latestCorrection: row?.latestCorrection || row?.latest_correction || row?.receiptDoc?.correction || null,
    receiptDoc: row?.receiptDoc || row?.receipt_doc || null,
    rateUsed: row.fxRate || row.fx_rate || USD_TO_CDF,
  };
}

function receiptDisplayAmount(payment){
  const original = Number(payment?.originalAmount);
  if(payment?.cancelled && Number.isFinite(original)) return original;
  return Number(payment?.amountEntered ?? payment?.amount ?? 0);
}

function receiptDisplayAmountLabel(payment){
  const tender = paymentAmountSplit(payment);
  if(Number(tender.usd || 0) > 0 && Number(tender.cdf || 0) > 0){
    return `${formatUSD(tender.usd)} + ${formatMoney(tender.cdf, "CDF")}`;
  }
  return formatMoney(receiptDisplayAmount(payment), payment?.currency || "USD");
}

function receiptDisplayCurrencyLabel(payment){
  const tender = paymentAmountSplit(payment);
  return Number(tender.usd || 0) > 0 && Number(tender.cdf || 0) > 0
    ? "USD + CDF"
    : String(payment?.currency || "USD");
}

async function loadReceiptsFromApi(){
  try{
    const params = new URLSearchParams();
    const fromIso = normalizeLooseDateToISO(rFrom?.value || "");
    const toIso = normalizeLooseDateToISO(rTo?.value || "");
    if(fromIso) params.set("from", fromIso);
    if(toIso) params.set("to", toIso);
    const path = `/api/receipts${params.toString() ? `?${params.toString()}` : ""}`;
    const rows = await apiFetch(path);
    const localSnapshot = getPayments();
    const normalized = Array.isArray(rows)
      ? mergeLocalPrintMetadata(rows.map(normalizeReceiptApiRow), localSnapshot)
      : [];
    const pendingLocal = localSnapshot.filter((p) => Boolean(p?.pendingSync));
    const merged = normalized.slice();
    const serverIds = new Set(merged.map((p) => String(p?.id || "").trim()).filter(Boolean));
    const serverClientReqIds = new Set(merged.map((p) => String(p?.clientRequestId || "").trim()).filter(Boolean));
    const serverReceiptNos = new Set(merged.map((p) => String(p?.receiptNo || "").trim()).filter(Boolean));
    for(const local of pendingLocal){
      const localId = String(local?.id || "").trim();
      const localReserved = String(local?.reservedPaymentId || "").trim();
      const localClientReq = String(local?.clientRequestId || "").trim();
      const localReceiptNo = String(local?.receiptNo || "").trim();
      const alreadySynced =
        (localId && serverIds.has(localId)) ||
        (localReserved && serverIds.has(localReserved)) ||
        (localClientReq && serverClientReqIds.has(localClientReq)) ||
        (localReceiptNo && serverReceiptNos.has(localReceiptNo));
      if(!alreadySynced){
        merged.unshift(local);
      }
    }
    const nextSig = hashRowsSignature(merged, receiptSignatureToken);
    const changed = nextSig !== receiptsDataSignature;
    if(changed){
      setReceiptsApiCache(merged);
    }
    apiReachable = true;
    updateSyncBadge();
    return changed;
  }catch(err){
    if(String(err?.message || "").toLowerCase().includes("session")) throw err;
    return false;
  }
}

function renderReceiptsTable(){
  const q = (rSearchInput.value || "").toLowerCase().trim();
  const cur = rCurrencyFilter.value;
  const fromVal = rFrom.value;
  const toVal = rTo.value;

  const payments = (apiReachable || receiptsApiCache.length) ? receiptsApiCache.slice() : getPayments();

  const filtered = payments.filter(p => {
    const matchesQ = !q ||
      (p.receiptNo || "").toLowerCase().includes(q) ||
      (p.studentName || "").toLowerCase().includes(q) ||
      (p.matricule || "").toLowerCase().includes(q);

    const matchesCur = !cur || (cur === "MIXED"
      ? receiptDisplayCurrencyLabel(p) === "USD + CDF"
      : p.currency === cur);
    const matchesDate = passesDateRange(p, fromVal, toVal);

    const status = document.querySelector('[data-rx-status][aria-pressed="true"]')?.dataset.rxStatus || "all";
    const matchesStatus = status === "all" || (status === "valid" && !p.cancelled) || (status === "corrected" && p.corrected) || (status === "cancelled" && p.cancelled);
    return matchesQ && matchesCur && matchesDate && matchesStatus;
  });

  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  rCount.textContent = `${filtered.length} reçu(s)`;
  receiptsTbody.innerHTML = "";
  const visible = filtered.slice(0, receiptsVisibleCount);

  visible.forEach(p => {
    const tr = document.createElement("tr");
    tr.className = "clickable" + (p.id === selectedPaymentId ? " selected" : "");
    if(p.cancelled) tr.style.opacity = "0.68";
    tr.dataset.id = p.id;
    tr.tabIndex = 0;
    tr.setAttribute("aria-selected", String(String(p.id) === String(selectedPaymentId)));
    tr.addEventListener("keydown", event => {
      if(event.key === "Enter" || event.key === " ") {
        event.preventDefault(); tr.click();
        Array.from(receiptsTbody.querySelectorAll("tr[data-id]")).find(row => row.dataset.id === String(p.id))?.focus({preventScroll:true});
      }
    });

    const d = new Date(p.createdAt);

    const feeLabel = getLiveFeeLabel(p);
    const syncFlag = p.pendingSync
      ? `<span class="tiny" style="color:#a16207">• Sync en attente</span>`
      : (p.syncError ? `<span class="tiny" style="color:#b91c1c">• Sync échouée</span>` : "");
    tr.innerHTML = `
      <td>${fmtDateTime(d)}</td>
      <td><strong>${esc(p.receiptNo)}</strong> ${p.cancelled ? `<span class="badge late">ANNULÉ</span>` : ""} ${p.corrected ? `<span class="badge">CORRIGÉ</span>` : ""} ${syncFlag}</td>
      <td>${esc(p.studentName)}</td>
      <td>${esc(p.matricule)}</td>
      <td>${esc(p.className)}</td>
      <td>${esc(p.level || "—")}</td>
      <td>${esc(p.month)}</td>
      <td>${esc(feeLabel)}${p.corrected ? `<div class="tiny">Corrigé: ${esc(p.latestCorrection?.oldFeeType || "—")} → ${esc(p.latestCorrection?.newFeeType || feeLabel)}<br>${esc(p.latestCorrection?.reason || "")}</div>` : ""}</td>
      <td>${esc(receiptDisplayCurrencyLabel(p))}</td>
      <td>${esc(receiptDisplayAmountLabel(p))}${p.cancelled ? `<div class="tiny">Motif: ${esc(p.cancellationReason || "—")}</div>` : ""}</td>
      <td>${esc(p.cashier)}</td>
    `;

    tr.addEventListener("click", () => {
      selectedPaymentId = p.id;
      lastReceiptForPrint = p;
      btnReprint.disabled = Boolean(p.cancelled);
      btnCorrectReceipt.disabled = !hasRole("admin") || Boolean(p.cancelled) || Boolean(p.pendingSync);
      btnCancelReceipt.disabled = !canCancelReceipt() || Boolean(p.cancelled) || Boolean(p.pendingSync);
      btnDelete.disabled = !canDeleteReceipt();

      elReceiptTop.textContent = p.receiptNo;

      updateReceiptPreview({
        receiptNo: p.receiptNo,
        dateTime: new Date(p.createdAt),
        student: { name: p.studentName, className: formatClassLevel(p.className, p.level) },
        fee: p.cancelled ? `${feeLabel} (ANNULÉ)` : feeLabel,
        feeTypeId: p.feeTypeId ?? null,
        feeTypeCode: p.feeTypeCode || "",
        billingCycle: p.receiptDoc?.fee?.cycle || "",
        month: p.month,
        amount: receiptDisplayAmount(p),
        currency: p.currency,
        amountUSDReceived: p.amountUSDReceived,
        amountCDFReceived: p.amountCDFReceived,
        mode: p.mode,
        cashier: p.cashier
      });

      renderReceiptsTable();
    });

    receiptsTbody.appendChild(tr);
  });

  if(!filtered.length){
    receiptsTbody.innerHTML = '<tr><td colspan="11"><div class="rx-empty"><strong>Aucun reçu trouvé</strong><p>Essayez un autre nom, une autre période ou réinitialisez les filtres.</p></div></td></tr>';
  }
  if(typeof window.renderReceiptsWorkspace === "function") window.renderReceiptsWorkspace(filtered);
  if(filtered.length > receiptsVisibleCount){
    const trMore = document.createElement("tr");
    trMore.innerHTML = `
      <td colspan="11" style="text-align:center">
        <button class="btn" data-r-see-more="1">Voir plus (${filtered.length - receiptsVisibleCount})</button>
      </td>
    `;
    receiptsTbody.appendChild(trMore);
  }
  if(receiptsVisibleCount > RECEIPTS_LIST_STEP){
    const trLess = document.createElement("tr");
    trLess.innerHTML = `
      <td colspan="11" style="text-align:center">
        <button class="btn" data-r-see-less="1">Voir moins</button>
      </td>
    `;
    receiptsTbody.appendChild(trLess);
  }

  if(!filtered.some(p => String(p.id) === String(selectedPaymentId))){
    selectedPaymentId = null;
    btnReprint.disabled = true;
    btnCorrectReceipt.disabled = true;
    btnCancelReceipt.disabled = true;
    btnDelete.disabled = true;
  }
  if(!canCancelReceipt()){
    btnCancelReceipt.disabled = true;
  }
  if(!hasRole("admin")) btnCorrectReceipt.disabled = true;
  if(!canDeleteReceipt()){
    btnDelete.disabled = true;
  }
  renderTopDailyBalance();
}

btnReprint.addEventListener("click", async () => {
  if(!selectedPaymentId) return;
  const selectedPayment = receiptsApiCache.find((p) => String(p.id) === String(selectedPaymentId))
    || getPayments().find((p) => String(p.id) === String(selectedPaymentId));
  if(!selectedPayment) return;
  if(selectedPayment.cancelled) return showInAppPopup("Un reçu annulé ne peut pas être réimprimé.", { variant: "error" });
  lastReceiptForPrint = selectedPayment;
  await printCurrentReceipt(selectedPayment, { forceCopy: true });
});

function openReceiptReclassificationDialog(payment, feeTypeOptions = []){
  return new Promise((resolve) => {
    const choices = (Array.isArray(feeTypeOptions) ? feeTypeOptions : [])
      .filter((fee) => fee?.active !== false && String(fee?.id || "") !== String(payment?.feeTypeId || ""))
      .map((fee) => `<option value="${esc(String(fee.id || ""))}">${esc(fee.labelFr || fee.code || "Frais")}</option>`)
      .join("");
    const overlay = document.createElement("div");
    overlay.style.cssText = ["position:fixed","inset:0","background:rgba(2,6,23,.52)","z-index:2600","display:flex","align-items:center","justify-content:center","padding:18px"].join(";");
    const panel = document.createElement("div");
    panel.style.cssText = ["width:min(560px,100%)","background:#fff","border:1px solid rgba(15,23,42,.18)","border-radius:12px","padding:16px","box-shadow:0 24px 60px rgba(15,23,42,.24)"].join(";");
    panel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><h3 style="margin:0;font-size:18px">Corriger le reçu</h3>
          <div class="tiny" style="margin-top:5px">${esc(payment?.receiptNo || "Reçu")} • ${esc(receiptDisplayAmountLabel(payment))}</div></div>
        <div class="field"><label>Ancien type</label><input class="input" value="${esc(getLiveFeeLabel(payment))}" readonly></div>
        <div class="field"><label for="receiptCorrectionFee">Nouveau type</label><select id="receiptCorrectionFee" class="input">${choices}</select></div>
        <div class="field"><label for="receiptCorrectionReason">Motif obligatoire</label>
          <textarea id="receiptCorrectionReason" class="input" rows="3" maxlength="300" placeholder="Ex: erreur de saisie du caissier"></textarea></div>
        <div class="tiny">Le montant, la devise, la date, l'élève, le numéro du reçu et le taux de change resteront inchangés.</div>
        <div class="tiny" data-correction-error style="color:#b91c1c;min-height:16px"></div>
        <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" data-correction-close>Retour</button>
          <button type="button" class="btn primary" data-correction-confirm>Corriger</button></div>
      </div>`;
    const feeInput = panel.querySelector("#receiptCorrectionFee");
    const reasonInput = panel.querySelector("#receiptCorrectionReason");
    const errorEl = panel.querySelector("[data-correction-error]");
    const close = (value) => { document.removeEventListener("keydown", onKeyDown); overlay.remove(); resolve(value); };
    const onKeyDown = (event) => { if(event.key === "Escape") close(null); };
    panel.querySelector("[data-correction-close]")?.addEventListener("click", () => close(null));
    panel.querySelector("[data-correction-confirm]")?.addEventListener("click", () => {
      const feeTypeId = String(feeInput?.value || "").trim();
      const reason = String(reasonInput?.value || "").trim().replace(/\s+/g, " ");
      if(!feeTypeId){ if(errorEl) errorEl.textContent = "Sélectionnez un nouveau type de frais."; return; }
      if(reason.length < 3){ if(errorEl) errorEl.textContent = "Indiquez un motif d'au moins 3 caractères."; reasonInput?.focus(); return; }
      close({ feeTypeId, reason });
    });
    overlay.addEventListener("click", (event) => { if(event.target === overlay) close(null); });
    overlay.appendChild(panel); document.body.appendChild(overlay); document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => feeInput?.focus());
  });
}

async function reclassifyReceiptPayment(paymentId){
  if(!hasRole("admin")) return showInAppPopup("Correction de reçu réservée à admin.", { variant:"error" });
  const payment = receiptsApiCache.find((p) => String(p.id) === String(paymentId));
  if(!payment || payment.cancelled || payment.pendingSync) return;
  let feeTypeOptions = [];
  try{
    const optionsPayload = await apiFetch(`/api/payments/${encodeURIComponent(paymentId)}/reclassification-options`);
    feeTypeOptions = Array.isArray(optionsPayload?.feeTypes) ? optionsPayload.feeTypes : [];
  }catch(err){
    return showInAppPopup(`Impossible de charger les types de frais: ${err.message}`, { variant:"error" });
  }
  if(!feeTypeOptions.length){
    return showInAppPopup("Aucun autre type de frais actif n'est disponible pour l'année de ce reçu.", { variant:"error" });
  }
  const correction = await openReceiptReclassificationDialog(payment, feeTypeOptions);
  if(!correction) return;
  try{
    await apiFetch(`/api/payments/${encodeURIComponent(paymentId)}/reclassify`, {
      method:"POST", body:JSON.stringify(correction)
    });
    selectedPaymentId = null;
    btnReprint.disabled = btnCorrectReceipt.disabled = btnCancelReceipt.disabled = btnDelete.disabled = true;
    reportsSummaryApiCache.clear(); busReportApiCache.clear(); dailyEntriesReportApiCache.clear(); lateStudentsReportApiCache.clear();
    await Promise.all([loadPaymentsFromApi().catch(() => false), loadReceiptsFromApi().catch(() => false)]);
    if(studentProfileState.studentId) await loadStudentProfile(studentProfileState.studentId, { open:false }).catch(() => {});
    refreshStudentsFinancialState(); renderStudentList();
    if(selectedStudentId){ selectedStudentFeeStatus = null; selectStudent(selectedStudentId); await loadSelectedStudentFeeStatus({ applyMonthDefault:true }).catch(() => {}); }
    renderReceiptsTable(); renderDashboard(); if(viewReports.classList.contains("active")) renderReports();
    showInAppPopup("Reçu corrigé. La caisse est inchangée; les soldes et rapports ont été recalculés.", { variant:"success", duration:4200 });
  }catch(err){ showInAppPopup(`Erreur correction reçu: ${err.message}`, { variant:"error", duration:4400 }); }
}

btnCorrectReceipt.addEventListener("click", async () => {
  if(selectedPaymentId) await reclassifyReceiptPayment(selectedPaymentId);
});

btnCancelReceipt.addEventListener("click", async () => {
  if(!selectedPaymentId) return;
  await cancelReceiptPayment(selectedPaymentId);
});

btnDelete.addEventListener("click", async () => {
  if(!canDeleteReceipt()){
    showInAppPopup("Suppression de reçu réservée à admin/comptable.");
    return;
  }
  if(!selectedPaymentId) return;
  const ok = await showAppConfirm({
    title: "Supprimer reçu",
    message: "Supprimer ce reçu ? (Action irréversible)",
    okText: "Supprimer",
    cancelText: "Annuler",
    okClass: "danger"
  });
  if(!ok) return;

  try{
    const local = getPayments().find((p) => String(p.id) === String(selectedPaymentId));
    const isPendingLocalOnly = Boolean(local?.pendingSync);
    if(!isPendingLocalOnly){
      await apiFetch(`/api/payments/${encodeURIComponent(selectedPaymentId)}`, { method:"DELETE" });
    } else {
      removePaymentCreateOutboxByRef(local || { id: selectedPaymentId });
    }
    savePayments(getPayments().filter(p => String(p.id) !== String(selectedPaymentId)));
    setReceiptsApiCache(receiptsApiCache.filter(p => String(p.id) !== String(selectedPaymentId)));
    selectedPaymentId = null;
    btnReprint.disabled = true;
    btnCorrectReceipt.disabled = true;
    btnCancelReceipt.disabled = true;
    btnDelete.disabled = true;
    setTopReceiptPreview();
    dailyEntriesReportApiCache.clear();
    refreshStudentsFinancialState();
    renderStudentList();
    if(selectedStudentId) selectStudent(selectedStudentId);
    loadReceiptsFromApi().finally(() => renderReceiptsTable());
    renderReports();
    renderDashboard();
    showInAppPopup(isPendingLocalOnly ? "Reçu local supprimé." : "Reçu supprimé.");
  }catch(err){
    showInAppPopup(`Erreur suppression reçu: ${err.message}`);
  }
});

rSearchInput.addEventListener("input", debounce(() => {
  receiptsVisibleCount = RECEIPTS_LIST_STEP;
  renderReceiptsTable();
}, 120));
rCurrencyFilter.addEventListener("change", () => {
  receiptsVisibleCount = RECEIPTS_LIST_STEP;
  renderReceiptsTable();
});
rFrom.addEventListener("change", () => {
  receiptsVisibleCount = RECEIPTS_LIST_STEP;
  loadReceiptsFromApi().finally(() => renderReceiptsTable());
});
rTo.addEventListener("change", () => {
  receiptsVisibleCount = RECEIPTS_LIST_STEP;
  loadReceiptsFromApi().finally(() => renderReceiptsTable());
});
receiptsTbody.addEventListener("click", (e) => {
  const more = e.target.closest("button[data-r-see-more]");
  if(more){
    receiptsVisibleCount += RECEIPTS_LIST_STEP;
    renderReceiptsTable();
    return;
  }
  const less = e.target.closest("button[data-r-see-less]");
  if(less){
    receiptsVisibleCount = RECEIPTS_LIST_STEP;
    renderReceiptsTable();
  }
});
