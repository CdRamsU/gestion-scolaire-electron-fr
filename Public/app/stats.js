/* ============================================================
   Gestion Scolaire — Statistiques (module autonome)
   Page d'analyse: KPIs animés, graphiques SVG/CSS, faits.
   Ne touche pas à core.js — navigation et données gérées ici.
   ============================================================ */
(function(){
  "use strict";

  const navStats = document.getElementById("navStats");
  const viewStats = document.getElementById("viewStats");
  if(!navStats || !viewStats) return;

  const elMeta = document.getElementById("statsMeta");
  const elYearSel = document.getElementById("statsYearSel");
  const elRefresh = document.getElementById("statsRefreshBtn");
  const elHero = document.getElementById("statsHero");
  const elMonthly = document.getElementById("statsMonthlyChart");
  const elDonut = document.getElementById("statsLevelDonut");
  const elCumul = document.getElementById("statsCumulative");
  const elFeeTypes = document.getElementById("statsFeeTypes");
  const elWeekday = document.getElementById("statsWeekday");
  const elStudents = document.getElementById("statsStudents");
  const elTopClasses = document.getElementById("statsTopClasses");
  const elFacts = document.getElementById("statsFacts");

  const MONTH_LABELS = ["Sept","Oct","Nov","Déc","Janv","Févr","Mars","Avr","Mai","Juin"];
  const WEEKDAYS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const LEVEL_LABELS = { maternelle:"Maternelle", primaire:"Primaire", secondaire:"Secondaire" };
  const LEVEL_COLORS = { maternelle:"#f59e0b", primaire:"#2563eb", secondaire:"#059669", autre:"#94a3b8" };
  const FEE_COLORS = ["#2563eb","#059669","#f59e0b","#8b5cf6","#ec4899","#0ea5e9","#f97316","#64748b"];
  const FX_FALLBACK = 2400;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let cache = { payments:null, students:null, enrollmentStats:null, fetchedAt:0 };
  let currentYear = null;   // school year start (e.g. 2026 => Sept 2026 - Juin 2027)
  let loading = false;
  viewStats.querySelectorAll('[data-sx-view]').forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.sxView;
    viewStats.dataset.focus = mode;
    viewStats.querySelectorAll('[data-sx-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));

  /* ---------- Helpers ---------- */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function toUSD(p){
    const amt = Number(p?.amount || 0);
    if(!Number.isFinite(amt) || amt <= 0) return 0;
    if(String(p?.currency || "USD").toUpperCase() === "USD") return amt;
    const fx = Number(p?.fxRate) > 0 ? Number(p.fxRate) : FX_FALLBACK;
    return amt / fx;
  }
  const fmtUSD = (n, d=0) => "$ " + Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d, maximumFractionDigits:d});
  const fmtUSDk = (n) => {
    const v = Number(n||0);
    if(v >= 1000) return "$" + (v/1000).toLocaleString("en-US",{maximumFractionDigits:1}) + "k";
    return "$" + Math.round(v).toLocaleString("en-US");
  };
  const fmtInt = (n) => Number(n||0).toLocaleString("en-US");
  const pct = (a,b) => b > 0 ? Math.round((a/b)*100) : 0;

  function monthKeyYearStart(mk){
    // "2026-09" -> school year start 2026 ; months Jan-Aug belong to previous start
    const m = String(mk||"").match(/^(\d{4})-(\d{2})$/);
    if(!m) return null;
    const y = Number(m[1]), mo = Number(m[2]);
    return mo >= 9 ? y : y - 1;
  }
  function monthKeyIndex(mk){
    // index 0..9 within school year (Sept=0 .. Juin=9); Juil/Août -> null
    const m = String(mk||"").match(/^\d{4}-(\d{2})$/);
    if(!m) return null;
    const mo = Number(m[1]);
    if(mo >= 9) return mo - 9;
    if(mo <= 6) return mo + 3;
    return null;
  }
  function paymentSchoolYear(p){
    return monthKeyYearStart(p?.monthKey || p?.paidForMonth) ??
      (() => {
        const d = new Date(p?.paidAt || p?.createdAt || Date.now());
        return d.getMonth()+1 >= 9 ? d.getFullYear() : d.getFullYear()-1;
      })();
  }

  function enrollmentClassGroup(student){
    const levelKey = String(student?.level || "").trim().toLowerCase();
    const levelLabel = LEVEL_LABELS[levelKey] || "Autre";
    const raw = String(student?.className || "—").trim() || "—";
    if(levelKey === "secondaire"){
      const secondaryGroups = [
        { pattern: /^7e\s*EB\b/i, label: "7e EB" },
        { pattern: /^8e\s*EB\b/i, label: "8e EB" },
        { pattern: /^1(?:re|er)\s*H\b/i, label: "1re H" },
        { pattern: /^2e\s*H\b/i, label: "2e H" },
        { pattern: /^3e\s*H\b/i, label: "3e H" },
        { pattern: /^4e\s*H\b/i, label: "4e H" }
      ];
      const group = secondaryGroups.find((item) => item.pattern.test(raw));
      if(group) return group.label;
    }
    const sectionMatch = raw.match(/^(.*?)\s+([A-Z])$/);
    const base = String(sectionMatch?.[1] || raw).trim() || "—";
    return base.toLowerCase().includes(levelKey) ? base : `${base} ${levelLabel}`;
  }

  async function apiGet(path){
    const res = await fetch(path, { credentials:"include", headers:{ "Content-Type":"application/json" } });
    if(!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return res.json();
  }

  /* ---------- Navigation (autonome, sans data-view) ---------- */
  function openStats(){
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll(".nav a").forEach(a => a.classList.remove("active"));
    viewStats.classList.add("active");
    navStats.classList.add("active");
    loadAndRender(false);
  }
  navStats.addEventListener("click", (e) => { e.preventDefault(); openStats(); });
  // Quand un autre onglet est cliqué, core.js gère ses vues mais pas la nôtre.
  const navRoot = document.querySelector(".nav");
  if(navRoot){
    navRoot.addEventListener("click", (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a") : null;
      if(!a || a === navStats) return;
      viewStats.classList.remove("active");
      navStats.classList.remove("active");
    });
  }
  elRefresh?.addEventListener("click", () => loadAndRender(true));
  elYearSel?.addEventListener("change", () => {
    const v = Number(elYearSel.value);
    if(Number.isFinite(v) && v > 2000){
      currentYear = v;
      loadEnrollmentStats(currentYear).then(renderAll).catch(() => renderAll());
    }
  });

  function showSkeletons(){
    if(elHero && !elHero.querySelector(".stats-tile")){
      elHero.innerHTML = Array(7).fill('<div class="skel skel-tile"></div>').join("");
    }
    const blocks = [elMonthly, elDonut, elCumul, elFeeTypes, elWeekday, elStudents, elTopClasses];
    for(const el of blocks){
      if(el && !el.firstElementChild) el.innerHTML = '<div class="skel skel-block"></div>';
    }
    if(elFacts && !elFacts.firstElementChild){
      elFacts.innerHTML = Array(3).fill('<div class="skel" style="height:110px"></div>').join("");
    }
  }

  /* ---------- Data ---------- */
  async function loadAndRender(force){
    if(loading) return;
    loading = true;
    if(elRefresh) elRefresh.disabled = true;
    viewStats.setAttribute("aria-busy", "true");
    if(elMeta) elMeta.textContent = "Chargement des données…";
    if(!cache.payments) showSkeletons();
    try{
      const fresh = force || !cache.payments || (Date.now() - cache.fetchedAt) > 60_000;
      if(fresh){
        const [payments, students] = await Promise.all([
          apiGet("/api/payments"),
          apiGet("/api/students")
        ]);
        cache = {
          payments: Array.isArray(payments) ? payments : (payments?.items || []),
          students: Array.isArray(students) ? students : (students?.items || []),
          fetchedAt: Date.now()
        };
      }
      const years = [...new Set(cache.payments.map(paymentSchoolYear).filter(Boolean))].sort((a,b)=>b-a);
      if(!years.length) years.push(new Date().getFullYear());
      if(!currentYear || !years.includes(currentYear)) currentYear = years[0];
      if(elYearSel){
        elYearSel.innerHTML = years.map(y =>
          `<option value="${y}" ${y===currentYear?"selected":""}>${y}-${y+1}</option>`).join("");
      }
      await loadEnrollmentStats(currentYear, force);
      renderAll();
    }catch(err){
      if(elMeta) elMeta.textContent = "Erreur de chargement: " + String(err?.message || err);
    }finally{
      loading = false;
      if(elRefresh) elRefresh.disabled = false;
      viewStats.setAttribute("aria-busy", "false");
    }
  }

  async function loadEnrollmentStats(schoolYearStartYear, force = false){
    const year = Number(schoolYearStartYear);
    if(!Number.isFinite(year)) return null;
    if(!force && Number(cache.enrollmentStats?.schoolYearStartYear) === year) return cache.enrollmentStats;
    cache.enrollmentStats = await apiGet(`/api/reports/enrollment-stats?schoolYearStartYear=${encodeURIComponent(year)}`);
    return cache.enrollmentStats;
  }

  /* ---------- Rendu ---------- */
  function renderAll(){
    const pays = cache.payments.filter(p => paymentSchoolYear(p) === currentYear && String(p.paymentMethod || "") !== "staff_benefit");
    const students = cache.students || [];
    const actives = students.filter(s => s.isActive !== false);

    const totalUSD = pays.reduce((s,p) => s + toUSD(p), 0);
    const byMonth = Array(10).fill(0);
    const byMonthCount = Array(10).fill(0);
    const byLevel = {};
    const byFee = {};
    const enrollmentByClass = {};
    const byWeekday = Array(7).fill(0);
    const byCashier = {};
    const byDay = {};
    let maxPay = null;

    for(const p of pays){
      const usd = toUSD(p);
      const mi = monthKeyIndex(p.monthKey || p.paidForMonth);
      if(mi != null){ byMonth[mi] += usd; byMonthCount[mi] += 1; }
      const lvl = LEVEL_LABELS[p.level] ? p.level : "autre";
      byLevel[lvl] = (byLevel[lvl] || 0) + usd;
      const fee = String(p.feeType || "Autre");
      byFee[fee] = (byFee[fee] || 0) + usd;
      const cashier = String(p.createdByUsername || "—");
      byCashier[cashier] = (byCashier[cashier] || 0) + 1;
      const d = new Date(p.paidAt || p.createdAt);
      if(!isNaN(d)){
        byWeekday[(d.getDay()+6)%7] += 1;
        const dayKey = d.toISOString().slice(0,10);
        byDay[dayKey] = (byDay[dayKey] || 0) + usd;
      }
      if(!maxPay || usd > toUSD(maxPay)) maxPay = p;
    }
    for(const student of actives){
      const classGroup = enrollmentClassGroup(student);
      enrollmentByClass[classGroup] = Number(enrollmentByClass[classGroup] || 0) + 1;
    }

    if(elMeta){
      elMeta.textContent =
        `Année ${currentYear}-${currentYear+1} · ${fmtInt(pays.length)} paiements · ` +
        `${fmtInt(actives.length)} élèves actifs · mis à jour ${new Date(cache.fetchedAt).toLocaleTimeString("fr-FR")}`;
    }

    renderHero(pays, actives, totalUSD, byMonth, cache.enrollmentStats);
    renderMonthly(byMonth, byMonthCount);
    renderDonut(byLevel, totalUSD);
    renderCumulative(byMonth);
    renderFeeTypes(byFee, totalUSD);
    renderWeekday(byWeekday);
    renderStudents(actives);
    renderTopClasses(enrollmentByClass, actives.length);
    renderFacts(pays, byDay, byCashier, enrollmentByClass, maxPay, totalUSD);
  }

  function heroTile(icon, label, value, sub, tone){
    return `<div class="stats-tile stats-tile-${tone||"blue"}">
      <div class="stats-tile-icon">${icon}</div>
      <div class="stats-tile-body">
        <div class="stats-tile-label">${esc(label)}</div>
        <div class="stats-tile-value" data-countup>${esc(value)}</div>
        <div class="stats-tile-sub">${esc(sub||"")}</div>
      </div>
    </div>`;
  }

  const ICONS = {
    money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
    receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 9h8M8 13h6"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    avg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 13l4-4 4 4 5-6"/></svg>',
    star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9a6 6 0 0 0 12 0V3H6Z"/><path d="M6 5H3v2a4 4 0 0 0 4 4"/><path d="M18 5h3v2a4 4 0 0 1-4 4"/><path d="M12 15v4M8 21h8"/></svg>'
  };

  function renderHero(pays, actives, totalUSD, byMonth, enrollmentStats){
    if(!elHero) return;
    const avg = pays.length ? totalUSD / pays.length : 0;
    const bestMonthIdx = byMonth.indexOf(Math.max(...byMonth));
    const bestMonth = byMonth[bestMonthIdx] > 0 ? MONTH_LABELS[bestMonthIdx] : "—";
    const newStudents = Number(enrollmentStats?.newStudents || 0);
    const returningStudents = Number(enrollmentStats?.returningStudents || 0);
    const peakCount = Number(enrollmentStats?.highestEnrollmentCount || 0);
    const peakDate = enrollmentStats?.highestEnrollmentDate
      ? new Date(`${enrollmentStats.highestEnrollmentDate}T12:00:00`).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })
      : "Aucune inscription";
    elHero.innerHTML =
      heroTile(ICONS.money, "Encaissements · éq. USD", fmtUSD(totalUSD), `Année ${currentYear}-${currentYear+1}`, "green") +
      heroTile(ICONS.receipt, "Reçus émis", fmtInt(pays.length), "paiements enregistrés", "blue") +
      heroTile(ICONS.users, "Élèves actifs", fmtInt(actives.length), "inscrits cette année", "violet") +
      heroTile(ICONS.users, "Nouveaux élèves", fmtInt(newStudents), `année ${currentYear}-${currentYear+1}`, "green") +
      heroTile(ICONS.users, "Anciens élèves", fmtInt(returningStudents), "réinscrits de l’année précédente", "blue") +
      heroTile(ICONS.cal, "Pic d’inscriptions", fmtInt(peakCount), peakDate, "violet") +
      heroTile(ICONS.avg, "Paiement moyen · éq. USD", fmtUSD(avg, 2), `meilleur mois: ${bestMonth}`, "amber");
    elHero.querySelectorAll('.stats-tile').forEach((tile,index) => { tile.dataset.sxSection = [2,3,4,5].includes(index) ? 'students' : 'finance'; });
    animateTiles(elHero);
  }

  function renderMonthly(byMonth, byMonthCount){
    if(!elMonthly) return;
    const max = Math.max(...byMonth, 1);
    elMonthly.innerHTML = `<div class="stats-colchart">` + byMonth.map((v,i) => `
      <div class="stats-col" tabindex="0" aria-label="${MONTH_LABELS[i]} : ${fmtUSD(v)} équivalent USD, ${fmtInt(byMonthCount[i])} reçus" title="${MONTH_LABELS[i]} : ${fmtUSD(v)} (${fmtInt(byMonthCount[i])} reçus)">
        <div class="stats-col-val">${v>0?fmtUSD(v):""}</div>
        <div class="stats-col-track">
          <div class="stats-col-bar" style="--h:${Math.max(2,(v/max)*100)}%; --delay:${i*55}ms"></div>
        </div>
        <div class="stats-col-label">${MONTH_LABELS[i]}</div>
      </div>`).join("") + `</div>`;
    elMonthly.innerHTML += `<details class="sx-values"><summary>Consulter les valeurs mensuelles</summary><div class="table-wrap"><table><thead><tr><th>Mois</th><th>Équivalent USD</th><th>Reçus</th></tr></thead><tbody>${byMonth.map((value,index) => `<tr><td>${MONTH_LABELS[index]}</td><td>${fmtUSD(value,2)}</td><td>${fmtInt(byMonthCount[index])}</td></tr>`).join('')}</tbody></table></div></details>`;
    requestAnimationFrame(() => elMonthly.querySelectorAll(".stats-col-bar")
      .forEach(b => b.classList.add("is-grown")));
  }

  function renderDonut(byLevel, totalUSD){
    if(!elDonut) return;
    const entries = Object.entries(byLevel).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1]);
    if(!entries.length){ elDonut.innerHTML = `<div class="tiny">Aucune donnée.</div>`; return; }
    const R = 15.915; // r pour circonférence 100
    let offset = 25;  // démarre en haut
    const circles = entries.map(([lvl, v], i) => {
      const share = totalUSD > 0 ? (v/totalUSD)*100 : 0;
      const c = `<circle class="stats-donut-seg" r="${R}" cx="21" cy="21" fill="transparent"
        stroke="${LEVEL_COLORS[lvl] || LEVEL_COLORS.autre}" stroke-width="5.2"
        stroke-dasharray="0 100" data-dash="${share.toFixed(2)} ${(100-share).toFixed(2)}"
        stroke-dashoffset="${offset}" style="--delay:${i*180}ms"></circle>`;
      offset -= share;
      return c;
    }).join("");
    const legend = entries.map(([lvl, v]) => `
      <div class="stats-legend-row">
        <span class="stats-legend-dot" style="background:${LEVEL_COLORS[lvl] || LEVEL_COLORS.autre}"></span>
        <span class="stats-legend-name">${esc(LEVEL_LABELS[lvl] || "Autre")}</span>
        <span class="stats-legend-val">${fmtUSD(v)} · ${pct(v,totalUSD)}%</span>
      </div>`).join("");
    elDonut.innerHTML = `
      <div class="stats-donut-wrap">
        <svg viewBox="0 0 42 42" class="stats-donut">
          <circle r="${R}" cx="21" cy="21" fill="transparent" stroke="var(--panel2)" stroke-width="5.2"></circle>
          ${circles}
          <text x="21" y="20" class="stats-donut-big">${fmtUSD(totalUSD)}</text>
          <text x="21" y="25" class="stats-donut-small">encaissé</text>
        </svg>
        <div class="stats-legend">${legend}</div>
      </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      elDonut.querySelectorAll(".stats-donut-seg").forEach(c => {
        c.setAttribute("stroke-dasharray", c.dataset.dash);
      });
    }));
  }

  function renderCumulative(byMonth){
    if(!elCumul) return;
    const cum = [];
    byMonth.reduce((acc,v,i) => (cum[i] = acc + v, cum[i]), 0);
    const total = cum[cum.length-1] || 0;
    if(total <= 0){ elCumul.innerHTML = `<div class="tiny">Aucune donnée.</div>`; return; }
    const W = 720, H = 200, PAD = 56, PB = 26;
    const max = Math.max(...cum, 1);
    const x = (i) => PAD + (i/(cum.length-1)) * (W - PAD - 12);
    const y = (v) => (H - PB) - (v/max) * (H - PB - 16);
    const pts = cum.map((v,i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${PAD},${H-PB} ${pts} ${x(cum.length-1).toFixed(1)},${H-PB}`;
    const gridY = [0.25,0.5,0.75,1].map(f => {
      const vy = y(max*f);
      return `<line x1="${PAD}" y1="${vy}" x2="${W-12}" y2="${vy}" class="dash-revenue-grid"/>
        <text x="${PAD-8}" y="${vy+3}" text-anchor="end" class="dash-revenue-label">${fmtUSDk(max*f)}</text>`;
    }).join("");
    const xLabels = MONTH_LABELS.map((m,i) =>
      `<text x="${x(i)}" y="${H-8}" text-anchor="middle" class="dash-revenue-label x">${m}</text>`).join("");
    const dots = cum.map((v,i) =>
      `<circle cx="${x(i)}" cy="${y(v)}" r="3.4" class="dash-revenue-point stats-cumul-dot" style="--delay:${i*70}ms"><title>${MONTH_LABELS[i]} : ${fmtUSD(v)}</title></circle>`).join("");
    elCumul.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="dash-revenue-svg stats-cumul-svg">
        ${gridY}
        <polygon points="${area}" class="dash-revenue-area stats-cumul-area"/>
        <polyline points="${pts}" class="dash-revenue-line stats-cumul-line"/>
        ${dots}
        ${xLabels}
      </svg>`;
    const line = elCumul.querySelector(".stats-cumul-line");
    if(line && !reduceMotion){
      const len = line.getTotalLength ? line.getTotalLength() : 1200;
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        line.style.transition = "stroke-dashoffset 1.1s cubic-bezier(.25,.6,.3,1)";
        line.style.strokeDashoffset = "0";
      }));
    }
    requestAnimationFrame(() => elCumul.querySelector(".stats-cumul-svg")?.classList.add("is-drawn"));
  }

  function renderFeeTypes(byFee, totalUSD){
    if(!elFeeTypes) return;
    const entries = Object.entries(byFee).sort((a,b)=>b[1]-a[1]).slice(0,7);
    if(!entries.length){ elFeeTypes.innerHTML = `<div class="tiny">Aucune donnée.</div>`; return; }
    const max = entries[0][1] || 1;
    elFeeTypes.innerHTML = entries.map(([fee, v], i) => `
      <div class="stats-hbar-row">
        <div class="stats-hbar-name" title="${esc(fee)}">${esc(fee)}</div>
        <div class="stats-hbar-track">
          <div class="stats-hbar-fill" style="--w:${Math.max(2,(v/max)*100)}%; --delay:${i*80}ms; background:${FEE_COLORS[i % FEE_COLORS.length]}"></div>
        </div>
        <div class="stats-hbar-val">${fmtUSD(v)} <span class="stats-hbar-pct">${pct(v,totalUSD)}%</span></div>
      </div>`).join("");
    requestAnimationFrame(() => elFeeTypes.querySelectorAll(".stats-hbar-fill")
      .forEach(b => b.classList.add("is-grown")));
  }

  function renderWeekday(byWeekday){
    if(!elWeekday) return;
    const max = Math.max(...byWeekday, 1);
    const busiest = WEEKDAYS[byWeekday.indexOf(Math.max(...byWeekday))];
    elWeekday.innerHTML = `<div class="stats-colchart stats-colchart-mini">` +
      byWeekday.map((v,i) => `
        <div class="stats-col" title="${WEEKDAYS[i]} : ${fmtInt(v)} reçus">
          <div class="stats-col-val">${v>0?fmtInt(v):""}</div>
          <div class="stats-col-track">
            <div class="stats-col-bar stats-col-bar-alt ${WEEKDAYS[i]===busiest?"is-best":""}" style="--h:${Math.max(2,(v/max)*100)}%; --delay:${i*60}ms"></div>
          </div>
          <div class="stats-col-label">${WEEKDAYS[i]}</div>
        </div>`).join("") +
      `</div><div class="tiny" style="margin-top:10px">Jour le plus actif : <strong>${busiest}</strong></div>`;
    requestAnimationFrame(() => elWeekday.querySelectorAll(".stats-col-bar")
      .forEach(b => b.classList.add("is-grown")));
  }

  function renderStudents(actives){
    if(!elStudents) return;
    const m = actives.filter(s => String(s.sex||"").toUpperCase()==="M").length;
    const f = actives.filter(s => String(s.sex||"").toUpperCase()==="F").length;
    const known = m + f;
    const byLvl = {};
    actives.forEach(s => { const l = s.level || "autre"; byLvl[l] = (byLvl[l]||0)+1; });
    const lvlRows = Object.entries(byLvl).sort((a,b)=>b[1]-a[1]).map(([lvl,c]) => `
      <div class="stats-legend-row">
        <span class="stats-legend-dot" style="background:${LEVEL_COLORS[lvl] || LEVEL_COLORS.autre}"></span>
        <span class="stats-legend-name">${esc(LEVEL_LABELS[lvl] || "Autre")}</span>
        <span class="stats-legend-val">${fmtInt(c)} · ${pct(c,actives.length)}%</span>
      </div>`).join("");
    elStudents.innerHTML = `
      <div class="stats-gender">
        <div class="stats-gender-bar">
          <div class="stats-gender-m" style="--w:${known?Math.round((m/known)*100):50}%"><span>♂ ${fmtInt(m)}</span></div>
          <div class="stats-gender-f"><span>♀ ${fmtInt(f)}</span></div>
        </div>
        <div class="tiny" style="margin-top:6px">Garçons ${pct(m,known)}% · Filles ${pct(f,known)}%</div>
      </div>
      <div class="stats-legend" style="margin-top:14px">${lvlRows}</div>`;
    requestAnimationFrame(() => elStudents.querySelector(".stats-gender-bar")?.classList.add("is-grown"));
  }

  function renderTopClasses(enrollmentByClass, totalStudents){
    if(!elTopClasses) return;
    const entries = Object.entries(enrollmentByClass).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if(!entries.length){ elTopClasses.innerHTML = `<div class="tiny">Aucune donnée.</div>`; return; }
    const max = entries[0][1] || 1;
    elTopClasses.innerHTML = entries.map(([cls, v], i) => `
      <div class="stats-hbar-row">
        <div class="stats-hbar-rank ${i===0?"is-gold":""}">${i+1}</div>
        <div class="stats-hbar-name" title="${esc(cls)}">${esc(cls)}</div>
        <div class="stats-hbar-track">
          <div class="stats-hbar-fill" style="--w:${Math.max(3,(v/max)*100)}%; --delay:${i*90}ms; background:linear-gradient(90deg,#3b82f6,#2563eb)"></div>
        </div>
        <div class="stats-hbar-val">${fmtInt(v)} él. <span class="stats-hbar-pct">${pct(v,totalStudents)}%</span></div>
      </div>`).join("");
    requestAnimationFrame(() => elTopClasses.querySelectorAll(".stats-hbar-fill")
      .forEach(b => b.classList.add("is-grown")));
  }

  function factCard(icon, title, value, sub, i){
    return `<div class="stats-fact" style="--delay:${i*90}ms">
      <div class="stats-fact-icon">${icon}</div>
      <div class="stats-fact-title">${esc(title)}</div>
      <div class="stats-fact-value">${esc(value)}</div>
      <div class="stats-fact-sub">${esc(sub||"")}</div>
    </div>`;
  }

  function renderFacts(pays, byDay, byCashier, enrollmentByClass, maxPay, totalUSD){
    if(!elFacts) return;
    if(!pays.length){ elFacts.innerHTML = `<div class="tiny">Aucune donnée pour cette année.</div>`; return; }

    const bestDayEntry = Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
    const bestDay = bestDayEntry
      ? new Date(bestDayEntry[0]+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long", day:"numeric", month:"long"})
      : "—";
    const topCashier = Object.entries(byCashier).sort((a,b)=>b[1]-a[1])[0];
    const topClass = Object.entries(enrollmentByClass).sort((a,b)=>b[1]-a[1])[0];
    const cdfTotal = pays.filter(p => String(p.currency).toUpperCase()==="CDF").length;
    const usdTotal = pays.length - cdfTotal;

    const facts = [
      factCard(ICONS.trophy, "Jour record", bestDayEntry ? fmtUSD(bestDayEntry[1]) : "—", bestDay, 0),
      factCard(ICONS.star, "Plus gros paiement", maxPay ? fmtUSD(toUSD(maxPay), 2) : "—",
        maxPay ? `${maxPay.studentName || "—"} · ${maxPay.feeType || ""}` : "", 1),
      factCard(ICONS.bolt, "Caissier le plus actif", topCashier ? topCashier[0] : "—",
        topCashier ? `${fmtInt(topCashier[1])} reçus émis` : "", 2),
      factCard(ICONS.trophy, "Classe la plus nombreuse", topClass ? topClass[0] : "—",
        topClass ? `${fmtInt(topClass[1])} élèves actifs` : "", 3),
      factCard(ICONS.money, "Devises utilisées", `${pct(usdTotal,pays.length)}% USD`,
        `${pct(cdfTotal,pays.length)}% des reçus en CDF`, 4),
      factCard(ICONS.cal, "Rythme moyen",
        `${fmtInt(Math.round(pays.length / Math.max(1, Object.keys(byDay).length)))} reçus/jour`,
        `${fmtInt(Object.keys(byDay).length)} jours d'activité`, 5)
    ];
    elFacts.innerHTML = facts.join("");
    requestAnimationFrame(() => elFacts.querySelectorAll(".stats-fact")
      .forEach(f => f.classList.add("is-in")));
  }

  function animateTiles(root){
    requestAnimationFrame(() => root.querySelectorAll(".stats-tile")
      .forEach((t,i) => setTimeout(() => t.classList.add("is-in"), i*70)));
    // Keep exact financial values visible throughout refreshes.
  }
})();
