/* ============================================================
   Gestion Scolaire — Relances parents (module autonome)
   Élèves en retard (GET /api/reports/late-students?month=YYYY-MM)
   joints aux contacts parents (GET /api/students).
   Actions: WhatsApp pré-rédigé, copie SMS, convocations imprimables.
   ============================================================ */
(function(){
  "use strict";

  const navRelances = document.getElementById("navRelances");
  const view = document.getElementById("viewRelances");
  if(!navRelances || !view) return;

  const elMonth = document.getElementById("relMonth");
  const elFee = document.getElementById("relFee");
  const elRefresh = document.getElementById("relRefreshBtn");
  const elMeta = document.getElementById("relMeta");
  const elSummary = document.getElementById("relSummary");
  const elSearch = document.getElementById("relSearch");
  const elLevel = document.getElementById("relLevelFilter");
  const elClass = document.getElementById("relClassFilter");
  const elPhone = document.getElementById("relPhoneFilter");
  const elPrint = document.getElementById("relPrintBtn");
  const elWhatsapp = document.getElementById("relWhatsappBtn");
  const elWhatsappStatus = document.getElementById("relWhatsappStatus");
  const elCount = document.getElementById("relCount");
  const elCheckAll = document.getElementById("relCheckAll");
  const tbody = document.getElementById("relTbody");

  const MONTH_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

  let rows = [];          // jointure retards + contacts
  let totalRemaining = 0;
  let loading = false;
  let feeLabel = "Minerval";   // libellé du frais sélectionné (pour les messages)
  let feesLoaded = false;
  let feesByCode = new Map();

  function selectedFeeCode(){ return String(elFee?.value || "TUITION").trim().toUpperCase() || "TUITION"; }

  function syncSelectedFeeMonth(){
    if(!elMonth) return;
    const fee = feesByCode.get(selectedFeeCode());
    const dueMonth = String(fee?.dueMonth || "").trim();
    const hasDueMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(dueMonth);
    if(hasDueMonth) elMonth.value = dueMonth;
    elMonth.disabled = hasDueMonth;
    elMonth.title = hasDueMonth ? `Mois dû configuré: ${monthLabel(dueMonth)}` : "Choisir le mois à relancer";
  }

  // Remplit la liste des frais (hors articles) une seule fois.
  async function loadFeeOptions(){
    if(feesLoaded || !elFee) return;
    try{
      const list = await apiGet("/api/fee-types");
      const fees = (Array.isArray(list) ? list : []).filter((f) => {
        const cycle = String(f.billingCycle || "").toLowerCase();
        return f.active !== false && cycle !== "item" && cycle !== "article";
      });
      if(fees.length){
        feesByCode = new Map(fees.map((f) => [String(f.code || "").toUpperCase(), f]));
        const prev = selectedFeeCode();
        elFee.innerHTML = fees.map((f) =>
          `<option value="${esc(f.code)}">${esc(f.labelFr || f.code)}</option>`).join("");
        if([...elFee.options].some((o) => o.value === prev)) elFee.value = prev;
        syncSelectedFeeMonth();
      }
      feesLoaded = true;
    }catch(_){ /* garde l'option Minerval par défaut */ }
  }

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const fmtUSD = (n) => "$ " + Number(n||0).toLocaleString("en-US",{maximumFractionDigits:2});
  const fmtWhatsappUSD = (n) => `${Number(n||0).toLocaleString("en-US",{maximumFractionDigits:2})} USD`;
  // Formatage selon la devise du frais (USD ou CDF).
  function fmtCur(n, cur){
    const v = Number(n || 0);
    if(String(cur || "").toUpperCase() === "CDF"){
      return `${Math.round(v).toLocaleString("en-US")} CDF`;
    }
    return `${v.toLocaleString("en-US",{maximumFractionDigits:2})} USD`;
  }
  const rowCur = (r) => String(r?.currency || feeCurrency || "USD").toUpperCase();
  let feeCurrency = "USD";

  function currentMonthKey(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }
  function monthLabel(mk){
    const m = String(mk||"").match(/^(\d{4})-(\d{2})$/);
    if(!m) return mk || "—";
    return `${MONTH_FR[Number(m[2])-1]} ${m[1]}`;
  }
  function normalizePhone(raw){
    let p = String(raw || "").replace(/[^\d+]/g, "");
    if(!p) return "";
    if(p.startsWith("+")) return p;
    if(p.startsWith("00")) return "+" + p.slice(2);
    if(p.startsWith("243")) return "+" + p;
    if(p.startsWith("0") && p.length === 10) return "+243" + p.slice(1);
    if(p.length === 9) return "+243" + p;
    return "+" + p;
  }
  function waMessage(r, mk){
    return `Bonjour${r.parentName ? " " + r.parentName : ""}, ` +
      `l'école ${window.ecoleConfiguration?.['school.shortName'] || 'ETABLISSEMENT'} vous rappelle que la scolarité de ${r.fullName} (${r.className}) ` +
      `pour le mois de ${monthLabel(mk)} reste impayée : ${fmtUSD(r.remaining)}. ` +
      `Merci de bien vouloir régulariser. Pour toute question, contactez la caisse.`;
  }

waMessage = function(r, mk){
  return `Bonjour Cher Parent, ${feeLabel} de ${r.fullName} (${r.className}) ` +
    `pour ${monthLabel(mk)} reste à payer (${fmtCur(r.remaining, rowCur(r))}). ` +
    `Merci de proceder au reglement.\n---- ${window.ecoleConfiguration?.['school.name'] || 'Etablissement scolaire'}`;
};

  async function apiGet(path){
    const res = await fetch(path, { credentials:"include" });
    if(!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  /* ---------- Navigation (autonome) ---------- */
  function openView(){
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll(".nav a").forEach(a => a.classList.remove("active"));
    view.classList.add("active");
    navRelances.classList.add("active");
    loadFeeOptions().finally(() => { if(!rows.length && !loading) load(); });
  }
  navRelances.addEventListener("click", (e) => { e.preventDefault(); openView(); });
  const navRoot = document.querySelector(".nav");
  if(navRoot){
    navRoot.addEventListener("click", (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a") : null;
      if(!a || a === navRelances) return;
      view.classList.remove("active");
      navRelances.classList.remove("active");
    });
  }

  /* ---------- Données ---------- */
  async function load(){
    if(loading) return;
    loading = true;
    const mk = elMonth.value || currentMonthKey();
    elMonth.value = mk;
    tbody.innerHTML = `<tr><td colspan="8"><div class="skel skel-line"></div><div class="skel skel-line" style="width:70%"></div></td></tr>`;
    if(elSummary && !elSummary.firstElementChild){
      elSummary.innerHTML = '<div class="skel skel-tile"></div><div class="skel skel-tile"></div><div class="skel skel-tile"></div>';
    }
    const feeCode = selectedFeeCode();
    try{
      const [late, students] = await Promise.all([
        apiGet(`/api/reports/late-students?month=${encodeURIComponent(mk)}&feeCode=${encodeURIComponent(feeCode)}`),
        apiGet("/api/students")
      ]);
      feeLabel = String(late?.feeTypeLabel || elFee?.selectedOptions?.[0]?.textContent || "Minerval").trim();
      const lateRowsForCur = Array.isArray(late?.rows) ? late.rows : [];
      feeCurrency = String(lateRowsForCur[0]?.currency || "USD").toUpperCase();
      const contacts = new Map((Array.isArray(students) ? students : [])
        .map(s => [String(s.id), s]));
      const lateRows = Array.isArray(late?.rows) ? late.rows : [];
      totalRemaining = Number(late?.totalRemaining || 0) ||
        lateRows.reduce((a,r) => a + Number(r.remaining || 0), 0);
      rows = lateRows.map(r => {
        const s = contacts.get(String(r.id)) || {};
        return {
          ...r,
          parentName: s.parentName || "",
          phone: normalizePhone(s.parentPhone || s.parentPhoneAlt || ""),
          monthKey: mk
        };
      });
      if(elMeta){
        elMeta.textContent =
          `${feeLabel} · ${monthLabel(mk)} · ${rows.length} élève(s) en retard sur ${Number(late?.totalStudents || 0)} · données en direct`;
      }
      renderSummary(mk);
      render();
    }catch(err){
      tbody.innerHTML = `<tr><td colspan="8" class="tiny">Erreur: ${esc(err?.message || err)}</td></tr>`;
    }finally{
      loading = false;
    }
  }

  function renderSummary(mk){
    if(!elSummary) return;
    const withPhone = rows.filter(r => r.phone).length;
    elSummary.innerHTML = `
      <div class="stats-tile stats-tile-amber is-in">
        <div class="stats-tile-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></div>
        <div class="stats-tile-body">
          <div class="stats-tile-label">En retard</div>
          <div class="stats-tile-value">${rows.length.toLocaleString("en-US")}</div>
          <div class="stats-tile-sub">${monthLabel(mk)}</div>
        </div>
      </div>
      <div class="stats-tile stats-tile-green is-in">
        <div class="stats-tile-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg></div>
        <div class="stats-tile-body">
          <div class="stats-tile-label">À recouvrer</div>
          <div class="stats-tile-value">${fmtCur(totalRemaining, feeCurrency)}</div>
          <div class="stats-tile-sub">pour ce mois</div>
        </div>
      </div>
      <div class="stats-tile stats-tile-blue is-in">
        <div class="stats-tile-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
        <div class="stats-tile-body">
          <div class="stats-tile-label">Contacts joignables</div>
          <div class="stats-tile-value">${withPhone.toLocaleString("en-US")}</div>
          <div class="stats-tile-sub">avec téléphone parent</div>
        </div>
      </div>`;
  }

  function filtered(){
    const q = String(elSearch?.value || "").toLowerCase().trim();
    const lvl = String(elLevel?.value || "");
    const cls = String(elClass?.value || "");
    const ph = String(elPhone?.value || "");
    return rows.filter(r => {
      if(lvl && r.level !== lvl) return false;
      if(cls && String(r.className || "") !== cls) return false;
      if(ph === "with" && !r.phone) return false;
      if(ph === "without" && r.phone) return false;
      if(!q) return true;
      return `${r.fullName} ${r.id} ${r.className} ${r.parentName}`.toLowerCase().includes(q);
    });
  }

  // Met à jour la liste déroulante des classes à partir des élèves en retard chargés.
  function syncClassFilterOptions(){
    if(!elClass) return;
    const prev = String(elClass.value || "");
    const classes = [...new Set(rows.map(r => String(r.className || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" }));
    elClass.innerHTML = `<option value="">Toutes</option>` +
      classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if(classes.includes(prev)) elClass.value = prev; else elClass.value = "";
  }

  function render(){
    syncClassFilterOptions();
    const list = filtered();
    if(elCount) elCount.textContent = `${list.length} élève(s) affiché(s)` +
      (list.length !== rows.length ? ` (sur ${rows.length})` : "");
    if(elCheckAll) elCheckAll.checked = false;
    if(!list.length){
      tbody.innerHTML = `<tr><td colspan="8" class="tiny">Aucun élève en retard pour ces filtres. 🎉</td></tr>`;
      return;
    }
    tbody.innerHTML = list.slice(0, 600).map(r => {
      const last = r.lastPaidAt
        ? new Date(r.lastPaidAt).toLocaleDateString("fr-FR")
        : '<span class="tiny">jamais</span>';
      const wa = r.phone
        ? `<a class="btn rel-wa-btn" target="_blank" rel="noopener"
             href="https://wa.me/${esc(r.phone.replace(/\D/g,""))}?text=${encodeURIComponent(waMessage(r, r.monthKey))}">WhatsApp</a>`
        : "";
      return `<tr data-student-id="${esc(r.id)}">
        <td><input type="checkbox" class="rel-check" data-id="${esc(r.id)}" /></td>
        <td><strong>${esc(r.fullName)}</strong> <span class="tiny">${esc(r.id)}</span></td>
        <td>${esc(r.className)} <span class="tiny">${esc(r.level)}</span></td>
        <td><strong class="rel-remaining">${fmtCur(r.remaining, rowCur(r))}</strong> <span class="tiny">payé ${fmtCur(r.paid, rowCur(r))} / ${fmtCur(r.due, rowCur(r))}</span></td>
        <td>${last}</td>
        <td>${esc(r.parentName || "—")}</td>
        <td>${r.phone ? esc(r.phone) : '<span class="rel-nophone">aucun</span>'}</td>
        <td><div class="row" style="gap:6px;flex-wrap:wrap">
          ${wa}
          <button class="btn rel-copy-btn" type="button" data-id="${esc(r.id)}">Copier</button>
          <button class="btn rel-profile-btn" type="button" data-id="${esc(r.id)}">Profil</button>
        </div></td>
      </tr>`;
    }).join("");
  }

  /* ---------- Actions table ---------- */
  tbody.addEventListener("click", async (e) => {
    const t = e.target;
    if(!t || !t.dataset) return;
    if(t.classList.contains("rel-profile-btn")){
      if(typeof window.loadStudentProfile === "function"){
        window.loadStudentProfile(t.dataset.id).catch?.(() => {});
      }
    }
    if(t.classList.contains("rel-copy-btn")){
      const r = rows.find(x => String(x.id) === t.dataset.id);
      if(!r) return;
      try{
        await navigator.clipboard.writeText(waMessage(r, r.monthKey));
        t.textContent = "Copié ✓";
        setTimeout(() => { t.textContent = "Copier"; }, 1600);
      }catch(_){
        t.textContent = "Erreur";
        setTimeout(() => { t.textContent = "Copier"; }, 1600);
      }
    }
  });
  elCheckAll?.addEventListener("change", () => {
    tbody.querySelectorAll(".rel-check").forEach(c => { c.checked = elCheckAll.checked; });
  });

  /* ---------- Convocations imprimables ---------- */
  const MONTH_ABBR = ["","JAN","FEV","MARS","AVR","MAI","JUIN","JUIL","AOUT","SEPT","OCT","NOV","DEC"];
  const monthAbbr = (mk) => MONTH_ABBR[Number(String(mk||"").split("-")[1]||0)] || String(mk||"");
  function unpaidAmountTxt(rem, cur){
    const n = Number(rem || 0);
    if(String(cur||"USD").toUpperCase() === "CDF") return `${Math.round(n).toLocaleString("fr-FR")} FC`;
    const r = Math.round(n * 100) / 100;
    return `${Number.isInteger(r) ? r : r.toFixed(2)}$`;
  }
  async function printConvocations(){
    const checkedIds = [...tbody.querySelectorAll(".rel-check:checked")].map(c => c.dataset.id);
    const pool = filtered();
    const targets = checkedIds.length
      ? pool.filter(r => checkedIds.includes(String(r.id)))
      : [];
    if(!targets.length){
      elCount.textContent = "Cochez d'abord les élèves à convoquer (case à gauche).";
      return;
    }
    const list = targets.slice(0, 120);
    // Tous les mois impayés (Minerval) par élève — comme le rapport "Mois impayés".
    let statusesById = new Map();
    try{
      const api = await apiGet("/api/students/statuses?feeCode=TUITION");
      for(const row of (Array.isArray(api?.rows) ? api.rows : [])){
        statusesById.set(String(row?.studentId || ""), row);
      }
    }catch(_){
      statusesById = new Map(); // repli: infos du mois sélectionné uniquement
    }
    const dateStr = new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
    const logoUrl = new URL(window.ecoleConfiguration?.["school.logo"] || "data:,", window.location.href).href;
    const schoolHeadHtml = `
          <div class="school-id">
            <img src="${logoUrl}" alt="Logo" class="school-logo" />
            <div>
              <div class="school">${esc(window.ecoleConfiguration?.["school.name"] || "Etablissement scolaire")}</div>
              <div class="sub">N°: AV: Rte CONTOURNEMENT,<br>Réf OVD Q/ PLATEAU KARAVIA C/ ANNEXE</div>
              <div class="city">LUBUMBASHI</div>
            </div>
          </div>`;
    const pages = list.map(r => {
      const st = statusesById.get(String(r.id)) || null;
      const unpaid = Array.isArray(st?.monthsUnpaid) ? st.monthsUnpaid : null;
      let moisRowHtml, montantRowHtml;
      if(unpaid && unpaid.length){
        const cur = String(st?.currency || "USD").toUpperCase();
        const parts = unpaid.map(e => Number(e?.paid || 0) > 0
          ? `${monthAbbr(e?.monthKey)} ${unpaidAmountTxt(e?.remaining, cur)}`
          : monthAbbr(e?.monthKey));
        const total = unpaid.reduce((s, e) => s + Number(e?.remaining || 0), 0);
        moisRowHtml = `<tr><td>Mois impayés</td><td><strong style="color:#b91c1c">${esc(parts.join(", "))}</strong> (${unpaid.length} mois)</td></tr>`;
        montantRowHtml = `<tr><td>Montant total restant dû</td><td><strong>${cur === "CDF" ? esc(unpaidAmountTxt(total, cur)) : fmtUSD(total)}</strong></td></tr>`;
      } else {
        moisRowHtml = `<tr><td>Mois concerné</td><td><strong>${esc(monthLabel(r.monthKey))}</strong></td></tr>`;
        montantRowHtml = `<tr><td>Montant restant dû</td><td><strong>${fmtCur(r.remaining, rowCur(r))}</strong> (payé ${fmtCur(r.paid, rowCur(r))} sur ${fmtCur(r.due, rowCur(r))})</td></tr>`;
      }
      return `
      <section class="letter">
        <div class="head">
          ${schoolHeadHtml}
          <div class="date">${esc(window.ecoleConfiguration?.["school.city"] || "")}, le ${dateStr}</div>
        </div>
        <h2>AVIS DE RETARD DE PAIEMENT</h2>
        <p>À l'attention de ${r.parentName ? `<strong>${esc(r.parentName)}</strong>` : "Monsieur/Madame le parent ou tuteur"} de :</p>
        <table class="info">
          <tr><td>Élève</td><td><strong>${esc(r.fullName)}</strong></td></tr>
          <tr><td>Matricule</td><td>${esc(r.id)}</td></tr>
          <tr><td>Classe</td><td>${esc(r.className)} (${esc(r.level)})</td></tr>
          ${moisRowHtml}
          ${montantRowHtml}
        </table>
        <p>Nous vous prions de bien vouloir régulariser cette situation auprès de la caisse de l'école
        dans les meilleurs délais. Si le paiement a déjà été effectué, merci de présenter le reçu
        correspondant.</p>
        <p>Nous restons à votre disposition pour tout arrangement et vous remercions de votre confiance.</p>
        <div class="signs">
          <div><span></span>La Direction</div>
          <div><span></span>Le Caissier</div>
        </div>
      </section>`;
    }).join("");
    const css = `
      body{font-family:"Segoe UI",Arial,sans-serif;font-size:13.5px;color:#000;margin:0}
      .letter{padding:26mm 18mm;page-break-after:always;box-sizing:border-box}
      .letter:last-child{page-break-after:auto}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:10px}
      .school-id{display:flex;align-items:center;gap:12px}
      .school-logo{height:72px;width:72px;object-fit:contain;flex-shrink:0}
      .school{font-size:20px;font-weight:800}
      .sub{color:#333;font-size:11px;line-height:1.35}
      .city{font-weight:700;font-size:12px;margin-top:2px}
      .date{font-weight:600}
      h2{text-align:center;font-size:16px;letter-spacing:1px;margin:26px 0 18px;text-decoration:underline}
      .info{border-collapse:collapse;width:100%;margin:14px 0}
      .info td{border:1px solid #999;padding:7px 10px}
      .info td:first-child{width:190px;font-weight:600;background:#f3f3f3}
      p{line-height:1.55;text-align:justify}
      .signs{display:flex;gap:60px;margin-top:54px}
      .signs > div{flex:1;text-align:center;font-weight:700}
      .signs span{display:block;border-bottom:1.5px solid #000;height:40px;margin-bottom:6px}
      @page{size:A4 portrait;margin:0}`;
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Convocations — ${list.length} élève(s)</title><style>${css}</style></head><body>${pages}</body></html>`);
    doc.close();
    let printed = false;
    const go = () => {
      if(printed) return;
      printed = true;
      try{ frame.contentWindow.focus(); frame.contentWindow.print(); }catch(_){}
      setTimeout(() => frame.remove(), 5000);
    };
    // Wait for the school logo before printing so it appears on first print.
    const logoImg = doc.querySelector(".school-logo");
    if(logoImg && !logoImg.complete){
      logoImg.addEventListener("load", () => setTimeout(go, 60));
      logoImg.addEventListener("error", go);
      setTimeout(go, 1500);
    } else {
      setTimeout(go, 150);
    }
  }

  elRefresh?.addEventListener("click", load);
  elMonth?.addEventListener("change", load);
  elFee?.addEventListener("change", () => {
    syncSelectedFeeMonth();
    load();
  });
  elSearch?.addEventListener("input", render);
  elLevel?.addEventListener("change", render);
  elClass?.addEventListener("change", render);
  elPhone?.addEventListener("change", render);
  elPrint?.addEventListener("click", printConvocations);

  async function sendWhatsappRelances(){
    const mk = elMonth.value || currentMonthKey();
    const feeCode = selectedFeeCode();
    const count = rows.length;
    if(!count){
      if(elWhatsappStatus){ elWhatsappStatus.style.display = "block"; elWhatsappStatus.textContent = "Aucun élève en retard à relancer."; }
      return;
    }
    const confirmed = await showAppConfirm({
      title: "Envoyer les rappels WhatsApp",
      message: `Envoyer un rappel WhatsApp à ${count} parent(s) en retard pour « ${feeLabel} » (${monthLabel(mk)}) ?`,
      okText: "Envoyer",
      cancelText: "Annuler",
      okClass: "primary"
    });
    if(!confirmed) return;
    if(elWhatsapp){ elWhatsapp.disabled = true; }
    if(elWhatsappStatus){ elWhatsappStatus.style.display = "block"; elWhatsappStatus.textContent = "Envoi en cours…"; }
    try{
      const res = await fetch("/api/relances/send-whatsapp", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: mk, feeCode })
      });
      const out = await res.json().catch(() => ({}));
      if(out && out.configured === false){
        elWhatsappStatus.textContent = "WhatsApp non configuré. Un administrateur doit renseigner le token, l'ID de numéro et le modèle dans Paramètres.";
      }else if(out && out.ok){
        elWhatsappStatus.textContent = `Envoyé: ${out.sent} · Échecs: ${out.failed} · Sans téléphone: ${out.skipped}.` +
          (out.errors && out.errors.length ? ` Détails: ${out.errors.join(" | ")}` : "");
      }else{
        elWhatsappStatus.textContent = `Erreur: ${esc(out?.error || "envoi impossible")}`;
      }
    }catch(err){
      elWhatsappStatus.textContent = `Erreur réseau: ${esc(err?.message || err)}`;
    }finally{
      if(elWhatsapp){ elWhatsapp.disabled = false; }
    }
  }
  elWhatsapp?.addEventListener("click", sendWhatsappRelances);

  elMonth.value = currentMonthKey();
})();
