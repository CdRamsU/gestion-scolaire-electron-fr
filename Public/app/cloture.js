/* ============================================================
   Gestion Scolaire — Clôture de caisse journalière (module autonome)
   Attendu = encaissements du jour − sorties du jour (par devise).
   Billetage physique → écart → rapport imprimable → archivage.
   Persistance: POST /api/closures (repli localStorage si absent).
   ============================================================ */
(function(){
  "use strict";

  const card = document.getElementById("clotureCard");
  if(!card) return;

  const elExpected = document.getElementById("clotureExpected");
  const elDenomsUsd = document.getElementById("clotureDenomsUsd");
  const elDenomsCdf = document.getElementById("clotureDenomsCdf");
  const elResult = document.getElementById("clotureResult");
  const elNote = document.getElementById("clotureNote");
  const elBanner = document.getElementById("clotureStatusBanner");
  const elSaveStatus = document.getElementById("clotureSaveStatus");
  const btnRefresh = document.getElementById("clotureRefreshBtn");
  const btnPrint = document.getElementById("cloturePrintBtn");
  const btnSave = document.getElementById("clotureSaveBtn");
  const historyTbody = document.getElementById("clotureHistoryTbody");
  const historyCard = document.getElementById("clotureHistoryCard");
  const historySearch = document.getElementById("clotureHistorySearch");
  const historyCountEl = document.getElementById("clotureHistoryCount");
  const historyMoreBtn = document.getElementById("clotureHistoryMoreBtn");

  const DENOMS_USD = [100, 50, 20, 10, 5];
  const DENOMS_CDF = [20000, 10000, 5000, 1000, 500];
  const LS_KEY = "ecolepos_closures_v1";

  let expected = { inUsd:0, inCdf:0, outUsd:0, outCdf:0, usd:0, cdf:0 };
  let cashier = "—";
  let loaded = false;
  const CLOTURE_HISTORY_PAGE = 8;
  let clotureHistoryRows = [];
  let clotureHistoryVisibleLimit = CLOTURE_HISTORY_PAGE;
  let clotureHistorySearchQuery = "";
  let clotureHistoryRowByKey = new Map();
  let lastBilletagePrint = null;
  let businessDateKey = "";
  let businessTimezone = "Africa/Lubumbashi";

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const fmtUsd = (n) => "$ " + Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2});
  const fmtCdf = (n) => Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0}) + " CDF";
  const normalizeTextAscii = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const isStatePaidSpending = (row) => normalizeTextAscii(row?.category || "").startsWith(normalizeTextAscii("Paid - "));
  const localTodayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const todayKey = () => businessDateKey || localTodayKey();
  const dateKeyInBusinessTimezone = (value) => {
    if(!value) return "";
    const raw = String(value || "").trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if(isNaN(d)) return "";
    try{
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: businessTimezone || "Africa/Lubumbashi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(d);
      const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      if(byType.year && byType.month && byType.day) return `${byType.year}-${byType.month}-${byType.day}`;
    }catch(_){}
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  async function loadBusinessDate(){
    try{
      const info = await apiGet("/api/server-info");
      const nextDate = String(info?.businessDate || "").slice(0, 10);
      const nextTimezone = String(info?.businessTimezone || "").trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) businessDateKey = nextDate;
      if(nextTimezone) businessTimezone = nextTimezone;
    }catch(_){
      if(!businessDateKey) businessDateKey = localTodayKey();
    }
    return businessDateKey || localTodayKey();
  }
  const formatClosureHistoryDate = (value) => {
    const raw = String(value || "").slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return `${m[3]}-${m[2]}-${m[1]}`;
    const dmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if(dmy) return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;
    return raw || "-";
  };
  const sameLocalDay = (iso) => dateKeyInBusinessTimezone(iso) === todayKey();
  const historyRowKey = (row, index = 0) => {
    const id = String(row?.id || "").trim();
    if(id) return `id:${id}`;
    return `local:${String(row?.closureDate || "")}:${String(row?.createdAt || "")}:${String(row?.cashierUsername || "")}:${index}`;
  };
  const normalizeDenominations = (value) => {
    let raw = value || {};
    if(typeof raw === "string"){
      try{ raw = JSON.parse(raw); }catch(_){ raw = {}; }
    }
    if(!raw || typeof raw !== "object") raw = {};
    const normalizeSide = (side) => {
      const out = {};
      const source = side && typeof side === "object" ? side : {};
      Object.entries(source).forEach(([denom, count]) => {
        const d = Number(denom);
        const c = Number(count);
        if(Number.isFinite(d) && d > 0 && Number.isFinite(c) && c > 0) out[String(d)] = c;
      });
      return out;
    };
    return {
      usd: normalizeSide(raw.usd || raw.USD || {}),
      cdf: normalizeSide(raw.cdf || raw.CDF || {})
    };
  };
  const denominationRowsHtml = (cur, denoms, fmt) => Object.entries(denoms || {})
    .sort((a,b) => Number(b[0]) - Number(a[0]))
    .map(([v,n]) => {
      const label = cur === "usd" ? `$${Number(v).toLocaleString("en-US")}` : `${Number(v).toLocaleString("en-US")} CDF`;
      return `<tr><td>${label}</td><td>${Number(n)}</td><td>${fmt(Number(v) * Number(n))}</td></tr>`;
    })
    .join("") || `<tr><td colspan="3">—</td></tr>`;
  const diffText = (diff, fmt) => {
    const d = Number(diff || 0);
    if(Math.abs(d) < 0.005) return "Exact";
    return `${d > 0 ? "Excédent +" : "Manquant −"}${fmt(Math.abs(d))}`;
  };
  const closureDateLongFr = (value) => {
    const raw = String(value || "").slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return formatClosureHistoryDate(value);
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  };

  async function apiGet(path){
    const res = await fetch(path, { credentials:"include" });
    if(!res.ok) throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
    return res.json();
  }

  /* ---------- Attendu ---------- */
  async function computeExpected(){
    elExpected.innerHTML = `<div class="tiny">Calcul en cours…</div>`;
    const [payments, spendings, me] = await Promise.all([
      apiGet("/api/payments").catch(() => []),
      apiGet("/api/spending").catch(() => []),
      apiGet("/api/auth/me").catch(() => null)
    ]);
    cashier = String(me?.user?.username || document.getElementById("cashierName")?.textContent || "—");

    expected = { inUsd:0, inCdf:0, outUsd:0, outCdf:0, usd:0, cdf:0 };
    for(const p of (Array.isArray(payments) ? payments : [])){
      if(!sameLocalDay(p.paidAt || p.createdAt)) continue;
      if(String(p.paymentMethod || "") === "staff_benefit") continue; // prise en charge: hors caisse
      const tender = typeof paymentAmountSplit === "function"
        ? paymentAmountSplit(p)
        : (String(p.currency).toUpperCase() === "CDF"
            ? { usd: 0, cdf: Number(p.amount || 0) }
            : { usd: Number(p.amount || 0), cdf: 0 });
      expected.inUsd += Number(tender.usd || 0);
      expected.inCdf += Number(tender.cdf || 0);
    }
    for(const s of (Array.isArray(spendings) ? spendings : [])){
      if(isStatePaidSpending(s)) continue;
      if(!sameLocalDay(s.date || s.createdAt || s.spentAt)) continue;
      const amt = Number(s.amount || 0);
      const cur = String(s.currency || "").toUpperCase();
      if(cur === "CDF") expected.outCdf += amt;
      else if(cur === "USD") expected.outUsd += amt;
      else { expected.outUsd += Number(s.amountUsd || 0); expected.outCdf += Number(s.amountCdf || 0); }
    }
    expected.usd = expected.inUsd - expected.outUsd;
    expected.cdf = expected.inCdf - expected.outCdf;

    elExpected.innerHTML = `
      <div class="cloture-kv-item"><small>Encaissements USD</small><strong>${fmtUsd(expected.inUsd)}</strong></div>
      <div class="cloture-kv-item"><small>Encaissements CDF</small><strong>${fmtCdf(expected.inCdf)}</strong></div>
      <div class="cloture-kv-item is-out"><small>Sorties USD</small><strong>&minus; ${fmtUsd(expected.outUsd)}</strong></div>
      <div class="cloture-kv-item is-out"><small>Sorties CDF</small><strong>&minus; ${fmtCdf(expected.outCdf)}</strong></div>
      <div class="cloture-kv-item is-total"><small>Attendu USD</small><strong>${fmtUsd(expected.usd)}</strong></div>
      <div class="cloture-kv-item is-total"><small>Attendu CDF</small><strong>${fmtCdf(expected.cdf)}</strong></div>`;
    renderResult();
  }

  /* ---------- Billetage ---------- */
  function denomRow(value, currency){
    const label = currency === "USD" ? `$${value}` : `${value.toLocaleString("en-US")}`;
    return `<label class="cloture-denom">
      <span class="cloture-denom-label">${label}</span>
      <input type="number" min="0" step="1" inputmode="numeric" placeholder="0"
        class="input cloture-denom-input" data-cur="${currency}" data-val="${value}" />
      <span class="cloture-denom-sum" data-sum-for="${currency}-${value}">—</span>
    </label>`;
  }
  function buildDenoms(){
    elDenomsUsd.innerHTML = DENOMS_USD.map(v => denomRow(v, "USD")).join("");
    elDenomsCdf.innerHTML = DENOMS_CDF.map(v => denomRow(v, "CDF")).join("");
    card.querySelectorAll(".cloture-denom-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const v = Number(inp.dataset.val), c = Math.max(0, Number(inp.value) || 0);
        const sum = card.querySelector(`[data-sum-for="${inp.dataset.cur}-${v}"]`);
        if(sum) sum.textContent = c > 0
          ? (inp.dataset.cur === "USD" ? fmtUsd(v*c) : fmtCdf(v*c))
          : "—";
        renderResult();
      });
    });
  }
  function countedTotals(){
    let usd = 0, cdf = 0;
    const denoms = { usd:{}, cdf:{} };
    card.querySelectorAll(".cloture-denom-input").forEach(inp => {
      const v = Number(inp.dataset.val), c = Math.max(0, Number(inp.value) || 0);
      if(c <= 0) return;
      if(inp.dataset.cur === "USD"){ usd += v*c; denoms.usd[v] = c; }
      else { cdf += v*c; denoms.cdf[v] = c; }
    });
    return { usd, cdf, denoms };
  }

  /* ---------- Écart ---------- */
  function diffChip(diff, fmt){
    const cls = Math.abs(diff) < 0.005 ? "is-ok" : (diff > 0 ? "is-over" : "is-short");
    const label = Math.abs(diff) < 0.005 ? "Exact" : (diff > 0 ? "Excédent" : "Manquant");
    const sign = diff > 0 ? "+" : (diff < 0 ? "−" : "");
    return `<span class="cloture-chip ${cls}">${label} ${sign}${fmt(Math.abs(diff))}</span>`;
  }
  function renderResult(){
    const c = countedTotals();
    elResult.innerHTML = `
      <div class="cloture-result-row">
        <div class="cloture-result-cell"><small>Compté USD</small><strong>${fmtUsd(c.usd)}</strong>${diffChip(c.usd - expected.usd, fmtUsd)}</div>
        <div class="cloture-result-cell"><small>Compté CDF</small><strong>${fmtCdf(c.cdf)}</strong>${diffChip(c.cdf - expected.cdf, fmtCdf)}</div>
      </div>`;
  }

  /* ---------- Persistance ---------- */
  function lsList(){
    try{ const a = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch{ return []; }
  }
  async function saveClosure(payload){
    try{
      const res = await fetch("/api/closures", {
        method:"POST", credentials:"include",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      if(res.status === 404) throw Object.assign(new Error("endpoint absent"), { fallback:true });
      const data = await res.json().catch(() => ({}));
      if(!res.ok) throw new Error(data.error || `API ${res.status}`);
      return { mode:"serveur" };
    }catch(err){
      if(err && (err.fallback || String(err.message||"").includes("Failed to fetch"))){
        const list = lsList();
        list.unshift({ ...payload, cashierUsername:cashier, createdAt:new Date().toISOString(), local:true });
        localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0,200)));
        return { mode:"local (sera visible uniquement sur ce poste)" };
      }
      throw err;
    }
  }
  async function loadHistory(){
    let rows = [];
    try{ rows = await apiGet("/api/closures?limit=60"); }
    catch{ rows = []; }
    rows = rows.concat(lsList());
    rows.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    clotureHistoryRows = rows;
    renderClotureHistory();
    return rows;
  }

  function buildBilletageReportHtml(row){
    const denoms = normalizeDenominations(row?.denominations);
    const dUsd = Number(row?.countedUsd || 0) - Number(row?.expectedUsd || 0);
    const dCdf = Number(row?.countedCdf || 0) - Number(row?.expectedCdf || 0);
    const closureDate = formatClosureHistoryDate(row?.closureDate);
    const createdAt = row?.createdAt ? new Date(row.createdAt) : null;
    const timeLabel = createdAt && !isNaN(createdAt)
      ? createdAt.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" })
      : "";
    const logoUrl = new URL(window.ecoleConfiguration?.["school.logo"] || "data:,", window.location.href).href;
    return `
      <div class="cloture-billetage-report">
        <div class="head">
          <div class="school-id">
            <img src="${logoUrl}" alt="Logo" class="school-logo" />
            <div>
              <div class="school">${esc(window.ecoleConfiguration?.["school.name"] || "Etablissement scolaire")}</div>
              <div class="sub">N°: AV: Rte CONTOURNEMENT,<br>Réf OVD Q/ PLATEAU KARAVIA C/ ANNEXE</div>
              <div class="city">LUBUMBASHI</div>
            </div>
          </div>
          <div class="title">CLÔTURE DE CAISSE<br><span>${esc(closureDateLongFr(row?.closureDate))}</span>${timeLabel ? `<small>${esc(timeLabel)}</small>` : ""}</div>
        </div>
        <table class="totals">
          <tr><th></th><th>USD</th><th>CDF</th></tr>
          <tr><td>Encaissements du jour</td><td>${fmtUsd(row?.inUsd)}</td><td>${fmtCdf(row?.inCdf)}</td></tr>
          <tr><td>Sorties du jour</td><td>− ${fmtUsd(row?.outUsd)}</td><td>− ${fmtCdf(row?.outCdf)}</td></tr>
          <tr class="strong"><td>Attendu en caisse</td><td>${fmtUsd(row?.expectedUsd)}</td><td>${fmtCdf(row?.expectedCdf)}</td></tr>
          <tr class="strong"><td>Compté physique</td><td>${fmtUsd(row?.countedUsd)}</td><td>${fmtCdf(row?.countedCdf)}</td></tr>
          <tr class="strong"><td>Écart</td><td>${diffText(dUsd, fmtUsd)}</td><td>${diffText(dCdf, fmtCdf)}</td></tr>
        </table>
        <div class="denoms">
          <div>
            <h4>Billetage USD</h4>
            <table><tr><th>Coupure</th><th>Nb</th><th>Total</th></tr>${denominationRowsHtml("usd", denoms.usd, fmtUsd)}</table>
          </div>
          <div>
            <h4>Billetage CDF</h4>
            <table><tr><th>Coupure</th><th>Nb</th><th>Total</th></tr>${denominationRowsHtml("cdf", denoms.cdf, fmtCdf)}</table>
          </div>
        </div>
        ${row?.note ? `<div class="note"><strong>Note:</strong> ${esc(row.note)}</div>` : ""}
        <div class="signs">
          <div><span></span>Caissier : ${esc(row?.cashierUsername || "—")}</div>
          <div><span></span>Directeur / Comptable</div>
        </div>
      </div>`;
  }

  function billetageReportCss(){
    return `
      .cloture-billetage-report{font-family:"Segoe UI",Arial,sans-serif;font-size:13px;color:#111}
      .cloture-billetage-report .head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
      .cloture-billetage-report .school-id{display:flex;align-items:center;gap:12px}
      .cloture-billetage-report .school-logo{height:72px;width:72px;object-fit:contain;flex-shrink:0}
      .cloture-billetage-report .school{font-size:20px;font-weight:900}
      .cloture-billetage-report .sub{font-size:12px;color:#333;line-height:1.35;margin-top:2px}
      .cloture-billetage-report .city{font-weight:800;font-size:12px;margin-top:2px}
      .cloture-billetage-report .title{text-align:right;font-weight:900;font-size:16px}
      .cloture-billetage-report .title span{font-weight:700;font-size:12px}
      .cloture-billetage-report .title small{display:block;font-weight:700;font-size:12px;margin-top:2px}
      .cloture-billetage-report table{border-collapse:collapse;width:100%}
      .cloture-billetage-report td,.cloture-billetage-report th{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}
      .cloture-billetage-report .totals{margin-bottom:14px}
      .cloture-billetage-report .strong td{font-weight:900}
      .cloture-billetage-report .denoms{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}
      .cloture-billetage-report h4{margin:0 0 6px 0}
      .cloture-billetage-report .note{margin-top:12px;font-size:14px}
      .cloture-billetage-report .signs{display:flex;gap:40px;margin-top:90px}
      .cloture-billetage-report .signs > div{flex:1;text-align:center;font-weight:800}
      .cloture-billetage-report .signs span{display:block;border-bottom:1.5px solid #111;height:36px;margin-bottom:6px}
      @media(max-width:780px){.cloture-billetage-report .denoms{grid-template-columns:1fr}.cloture-billetage-report .head{display:block}.cloture-billetage-report .title{text-align:left;margin-top:8px}}
      @page{size:A4 portrait;margin:14mm}`;
  }

  function printHtmlDocument(title, bodyHtml, css){
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
    doc.close();
    setTimeout(() => {
      try{ frame.contentWindow.focus(); frame.contentWindow.print(); }catch(_){}
      setTimeout(() => frame.remove(), 4000);
    }, 120);
  }

  function ensureBilletageModal(){
    let modal = document.getElementById("clotureBilletageModal");
    if(modal) return modal;
    modal = document.createElement("div");
    modal.id = "clotureBilletageModal";
    modal.className = "modal-backdrop";
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="clotureBilletageTitle" style="max-width:980px;width:min(980px,96vw)">
        <div class="modal-head">
          <div>
            <h3 id="clotureBilletageTitle">Rapport billetage</h3>
            <div id="clotureBilletageSubtitle" class="tiny"></div>
          </div>
          <div class="modal-head-actions">
            <button id="clotureBilletagePrintBtn" class="btn" type="button">Imprimer</button>
            <button id="clotureBilletageCloseBtn" class="btn" type="button">Fermer</button>
          </div>
        </div>
        <div class="modal-body" style="max-height:calc(100vh - 150px);overflow:auto">
          <style>${billetageReportCss()}</style>
          <div id="clotureBilletageBody"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    };
    modal.querySelector("#clotureBilletageCloseBtn")?.addEventListener("click", close);
    modal.addEventListener("click", (event) => { if(event.target === modal) close(); });
    modal.querySelector("#clotureBilletagePrintBtn")?.addEventListener("click", () => {
      if(!lastBilletagePrint) return;
      printHtmlDocument(lastBilletagePrint.title, lastBilletagePrint.html, billetageReportCss());
    });
    return modal;
  }

  function showBilletageReport(row){
    if(!row) return;
    const modal = ensureBilletageModal();
    const html = buildBilletageReportHtml(row);
    const date = formatClosureHistoryDate(row?.closureDate);
    const subtitle = `${date} • ${row?.cashierUsername || "—"}`;
    modal.querySelector("#clotureBilletageSubtitle").textContent = subtitle;
    modal.querySelector("#clotureBilletageBody").innerHTML = html;
    lastBilletagePrint = { title: `Billetage ${date}`, html };
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
  }

  function renderClotureHistory(){
    if(!historyTbody) return;
    const allRows = clotureHistoryRows || [];
    clotureHistoryRowByKey = new Map();
    const prepared = allRows.map((r, index) => {
      const key = historyRowKey(r, index);
      clotureHistoryRowByKey.set(key, r);
      const dUsd = Number(r.countedUsd) - Number(r.expectedUsd);
      const dCdf = Number(r.countedCdf) - Number(r.expectedCdf);
      const date = formatClosureHistoryDate(r.closureDate);
      const haystack = normalizeTextAscii([
        date, r.cashierUsername, r.note,
        fmtUsd(r.expectedUsd), fmtUsd(r.countedUsd),
        fmtCdf(r.expectedCdf), fmtCdf(r.countedCdf)
      ].join(" "));
      return { r, dUsd, dCdf, date, haystack, key };
    });
    const q = normalizeTextAscii(String(clotureHistorySearchQuery || ""));
    const filtered = q ? prepared.filter((p) => p.haystack.includes(q)) : prepared;
    if(!(clotureHistoryVisibleLimit >= CLOTURE_HISTORY_PAGE)) clotureHistoryVisibleLimit = CLOTURE_HISTORY_PAGE;
    const visible = filtered.slice(0, clotureHistoryVisibleLimit);
    if(historyCountEl){
      historyCountEl.textContent = q
        ? `${filtered.length} / ${allRows.length} clôture(s)`
        : `${allRows.length} clôture(s)`;
    }
    if(!filtered.length){
      historyTbody.innerHTML = `<tr><td colspan="10" class="tiny">${q ? "Aucune clôture ne correspond à la recherche." : "Aucune clôture."}</td></tr>`;
      if(historyMoreBtn) historyMoreBtn.style.display = "none";
      return;
    }
    historyTbody.innerHTML = visible.map(({ r, dUsd, dCdf, date, key }) => `<tr>
        <td>${esc(date)}${r.local ? ' <span class="tiny">(local)</span>' : ""}</td>
        <td>${esc(r.cashierUsername)}</td>
        <td>${fmtUsd(r.expectedUsd)}</td>
        <td>${fmtUsd(r.countedUsd)}</td>
        <td>${diffChip(dUsd, fmtUsd)}</td>
        <td>${fmtCdf(r.expectedCdf)}</td>
        <td>${fmtCdf(r.countedCdf)}</td>
        <td>${diffChip(dCdf, fmtCdf)}</td>
        <td>${esc(r.note || "")}</td>
        <td><button class="btn" type="button" data-cloture-history-view="${esc(key)}">Voir</button></td>
      </tr>`).join("");
    if(historyMoreBtn){
      const remaining = filtered.length - visible.length;
      if(remaining > 0){ historyMoreBtn.style.display = ""; historyMoreBtn.textContent = `Voir plus (${remaining} de plus)`; }
      else historyMoreBtn.style.display = "none";
    }
  }
  function refreshBanner(rows){
    const today = todayKey();
    const done = rows.find(r => String(r.closureDate||"").slice(0,10) === today);
    if(done){
      elBanner.style.display = "";
      elBanner.textContent = `Journée déjà clôturée par ${done.cashierUsername}. Une nouvelle clôture créera une version supplémentaire.`;
    }else{
      elBanner.style.display = "none";
    }
  }

  /* ---------- Impression ---------- */
  function printReport(){
    const c = countedTotals();
    const dUsd = c.usd - expected.usd;
    const dCdf = c.cdf - expected.cdf;
    const printedAt = new Date();
    const printedDateLabel = printedAt.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    const printedTimeLabel = printedAt.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
    const rows = (cur, denoms, fmt) => Object.entries(denoms)
      .sort((a,b) => Number(b[0]) - Number(a[0]))
      .map(([v,n]) => `<tr><td>${cur === "usd" ? "$"+Number(v).toLocaleString("en-US") : Number(v).toLocaleString("en-US")+" CDF"}</td><td>${n}</td><td>${fmt(Number(v)*Number(n))}</td></tr>`)
      .join("") || `<tr><td colspan="3">—</td></tr>`;
    const diffTxt = (d, fmt) => (Math.abs(d) < 0.005 ? "Exact" : (d > 0 ? "Excédent +" : "Manquant −") + fmt(Math.abs(d)));
    const logoUrl = new URL(window.ecoleConfiguration?.["school.logo"] || "data:,", window.location.href).href;
    const html = `
      <div class="head">
        <div class="school-id">
          <img src="${logoUrl}" alt="Logo" class="school-logo" />
          <div>
            <div class="school">${esc(window.ecoleConfiguration?.["school.name"] || "Etablissement scolaire")}</div>
            <div class="sub">N°: AV: Rte CONTOURNEMENT,<br>Réf OVD Q/ PLATEAU KARAVIA C/ ANNEXE</div>
            <div class="city">LUBUMBASHI</div>
          </div>
        </div>
        <div class="title">CLÔTURE DE CAISSE<br><span>${printedDateLabel}</span><small>${printedTimeLabel}</small></div>
      </div>
      <table class="totals">
        <tr><th></th><th>USD</th><th>CDF</th></tr>
        <tr><td>Encaissements du jour</td><td>${fmtUsd(expected.inUsd)}</td><td>${fmtCdf(expected.inCdf)}</td></tr>
        <tr><td>Sorties du jour</td><td>− ${fmtUsd(expected.outUsd)}</td><td>− ${fmtCdf(expected.outCdf)}</td></tr>
        <tr class="strong"><td>Attendu en caisse</td><td>${fmtUsd(expected.usd)}</td><td>${fmtCdf(expected.cdf)}</td></tr>
        <tr class="strong"><td>Compté (physique)</td><td>${fmtUsd(c.usd)}</td><td>${fmtCdf(c.cdf)}</td></tr>
        <tr class="strong"><td>Écart</td><td>${diffTxt(dUsd, fmtUsd)}</td><td>${diffTxt(dCdf, fmtCdf)}</td></tr>
      </table>
      <div class="denoms">
        <div><h4>Billetage USD</h4><table><tr><th>Coupure</th><th>Nb</th><th>Total</th></tr>${rows("usd", c.denoms.usd, fmtUsd)}</table></div>
        <div><h4>Billetage CDF</h4><table><tr><th>Coupure</th><th>Nb</th><th>Total</th></tr>${rows("cdf", c.denoms.cdf, fmtCdf)}</table></div>
      </div>
      ${elNote.value ? `<div class="note"><strong>Note:</strong> ${esc(elNote.value)}</div>` : ""}
      <div class="signs">
        <div><span></span>Caissier : ${esc(cashier)}</div>
        <div><span></span>Directeur / Comptable</div>
      </div>`;
    const css = `
      body{font-family:"Segoe UI",Arial,sans-serif;font-size:13px;color:#000;margin:24px}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px}
      .school-id{display:flex;align-items:center;gap:12px}
      .school-logo{height:72px;width:72px;object-fit:contain;flex-shrink:0}
      .school{font-size:20px;font-weight:800}
      .sub{color:#333;font-size:11px;line-height:1.35}
      .city{font-weight:700;font-size:12px;margin-top:2px}
      .title{text-align:right;font-weight:800;font-size:16px}
      .title span{font-weight:600;font-size:12px}
      .title small{display:block;font-weight:600;font-size:12px;margin-top:2px}
      table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #999;padding:6px 8px;text-align:left}
      .totals{margin-bottom:14px}
      .totals .strong td{font-weight:800}
      .denoms{display:flex;gap:16px}
      .denoms > div{flex:1}
      h4{margin:0 0 6px 0}
      .note{margin-top:12px}
      .signs{display:flex;gap:40px;margin-top:48px}
      .signs > div{flex:1;text-align:center;font-weight:700}
      .signs span{display:block;border-bottom:1.5px solid #000;height:36px;margin-bottom:6px}
      @page{size:A4 portrait;margin:14mm}`;
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Clôture de caisse ${todayKey()}</title><style>${css}</style></head><body>${html}</body></html>`);
    doc.close();
    let printed = false;
    const go = () => {
      if(printed) return;
      printed = true;
      try{ frame.contentWindow.focus(); frame.contentWindow.print(); }catch(_){}
      setTimeout(() => frame.remove(), 4000);
    };
    // Wait for the school logo before printing so it appears on first print.
    const logoImg = doc.querySelector(".school-logo");
    if(logoImg && !logoImg.complete){
      logoImg.addEventListener("load", () => setTimeout(go, 60));
      logoImg.addEventListener("error", go);
      setTimeout(go, 1500);
    } else {
      setTimeout(go, 120);
    }
  }

  /* ---------- Actions ---------- */
  async function refresh(){
    await loadBusinessDate();
    if(loaded) return computeExpected().then(() => loadHistory()).then(refreshBanner);
    loaded = true;
    buildDenoms();
    await computeExpected();
    refreshBanner(await loadHistory());
  }

  btnRefresh?.addEventListener("click", () => { loadBusinessDate().then(() => computeExpected()); });
  btnPrint?.addEventListener("click", printReport);
  historySearch?.addEventListener("input", () => {
    clotureHistorySearchQuery = historySearch.value || "";
    clotureHistoryVisibleLimit = CLOTURE_HISTORY_PAGE;
    renderClotureHistory();
  });
  historyMoreBtn?.addEventListener("click", () => {
    clotureHistoryVisibleLimit += CLOTURE_HISTORY_PAGE;
    renderClotureHistory();
  });
  historyTbody?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-cloture-history-view]");
    if(!btn) return;
    const key = btn.getAttribute("data-cloture-history-view") || "";
    showBilletageReport(clotureHistoryRowByKey.get(key));
  });
  btnSave?.addEventListener("click", async () => {
    const c = countedTotals();
    if(c.usd === 0 && c.cdf === 0){
      elSaveStatus.textContent = "Saisissez d'abord le billetage (comptage physique).";
      return;
    }
    btnSave.disabled = true;
    btnSave.classList.add("is-loading");
    elSaveStatus.textContent = "";
    try{
      await loadBusinessDate();
      const out = await saveClosure({
        closureDate: todayKey(),
        inUsd: expected.inUsd, inCdf: expected.inCdf,
        outUsd: expected.outUsd, outCdf: expected.outCdf,
        expectedUsd: expected.usd, expectedCdf: expected.cdf,
        countedUsd: c.usd, countedCdf: c.cdf,
        denominations: c.denoms,
        note: elNote.value || ""
      });
      elSaveStatus.textContent = `Clôture enregistrée (${out.mode}).`;
      refreshBanner(await loadHistory());
      if(historyCard) historyCard.open = true;
    }catch(err){
      elSaveStatus.textContent = "Erreur: " + String(err?.message || err);
    }finally{
      btnSave.disabled = false;
      btnSave.classList.remove("is-loading");
    }
  });

  card.addEventListener("toggle", () => { if(card.open) refresh(); });
  document.querySelector('.nav a[data-view="caisse"]')?.addEventListener("click", () => {
    if(card.open) refresh();
  });

  /* ---------- Avertissement "journée clôturée" sur Nouveau paiement ---------- */
  async function checkPaymentLockBanner(){
    const viewPayment = document.getElementById("viewPayment");
    if(!viewPayment) return;
    await loadBusinessDate();
    let closures = [];
    try{
      const res = await fetch("/api/closures?limit=10", { credentials:"include" });
      if(res.ok) closures = await res.json();
    }catch(_){}
    closures = (Array.isArray(closures) ? closures : []).concat(lsList());
    const today = todayKey();
    const done = closures.find(r => String(r.closureDate||"").slice(0,10) === today);
    let banner = document.getElementById("paymentClosedBanner");
    if(!done){ banner?.remove(); return; }
    if(!banner){
      banner = document.createElement("div");
      banner.id = "paymentClosedBanner";
      banner.className = "cloture-banner";
      banner.style.marginBottom = "12px";
      viewPayment.prepend(banner);
    }
    const at = done.createdAt ? new Date(done.createdAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : "";
    banner.textContent =
      `⚠ La caisse du jour a déjà été clôturée par ${done.cashierUsername}${at ? ` à ${at}` : ""}. ` +
      `Les paiements enregistrés maintenant ne figureront pas dans le rapport de clôture imprimé.`;
  }
  document.querySelector('.nav a[data-view="payment"]')?.addEventListener("click", () => {
    setTimeout(checkPaymentLockBanner, 150);
  });
  setTimeout(checkPaymentLockBanner, 2500);
})();
