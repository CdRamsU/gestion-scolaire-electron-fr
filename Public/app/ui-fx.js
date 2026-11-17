/* ============================================================
   Gestion Scolaire — UI FX (calque d'animation non intrusif)
   - Compteurs animés sur les KPI (topbar + dashboard + stats)
   - Animation de tracé du graphique de revenus
   - Aucune logique métier; observe le DOM rendu par core.js
   ============================================================ */
(function(){
  "use strict";

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduceMotion) return;

  /* ---------- Compteur animé ---------- */
  // Décompose "1 234,56 CDF" / "$ 1,234.56" / "12" en préfixe + nombre + suffixe.
  function parseNumericText(text){
    const m = String(text || "").match(/^([^\d\-]*)(-?[\d][\d.,\s ]*)(.*)$/);
    if(!m) return null;
    let raw = m[2].replace(/[\s ]/g, "");
    let decimals = 0;
    if(/,\d{1,2}$/.test(raw) && !raw.includes(".")){
      decimals = raw.length - raw.indexOf(",") - 1;
      raw = raw.replace(/\./g,"").replace(",", ".");
    }else{
      const dot = raw.lastIndexOf(".");
      if(dot >= 0 && raw.length - dot - 1 <= 2){ decimals = raw.length - dot - 1; }
      raw = raw.replace(/,/g,"");
    }
    const num = Number(raw);
    if(!Number.isFinite(num)) return null;
    return { prefix:m[1], num, suffix:m[3], decimals, grouped:/[,\s ]/.test(m[2]) };
  }

  function formatLike(parsed, value){
    const opts = { minimumFractionDigits:parsed.decimals, maximumFractionDigits:parsed.decimals };
    if(!parsed.grouped) opts.useGrouping = false;
    return parsed.prefix + value.toLocaleString("en-US", opts) + parsed.suffix;
  }

  function countUp(el, fromValue){
    const target = el.textContent;
    const parsed = parseNumericText(target);
    if(!parsed){ el.__fxPrev = target; return; }
    const fromParsed = parseNumericText(fromValue != null ? fromValue : (el.__fxPrev || ""));
    const from = fromParsed ? fromParsed.num : 0;
    if(from === parsed.num){ el.__fxPrev = target; return; }

    el.__fxLock = true;
    el.classList.remove("fx-pop");
    void el.offsetWidth;
    el.classList.add("fx-pop");

    const t0 = performance.now();
    const dur = 680;
    function frame(t){
      const k = Math.min(1, (t - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? formatLike(parsed, from + (parsed.num - from) * ease) : target;
      if(k < 1){ requestAnimationFrame(frame); }
      else { el.__fxPrev = target; el.__fxLock = false; }
    }
    requestAnimationFrame(frame);
  }

  // Exposé pour stats.js (anime un élément fraichement rendu, départ 0)
  window.__ecoCountUp = function(el){ countUp(el, "0"); };

  const WATCHED_IDS = [
    // Header balances use a color pulse; never animate intermediate financial values.
    // Dashboard figures stay exact while data refreshes.
    "spTotalMonthUsd","spTotalAllUsd"
  ];

  function watchValue(el){
    if(!el || el.__fxWatched) return;
    el.__fxWatched = true;
    el.__fxPrev = el.textContent;
    new MutationObserver(() => {
      if(el.__fxLock) return;
      if(el.textContent === el.__fxPrev) return;
      countUp(el);
    }).observe(el, { childList:true, characterData:true, subtree:true });
  }

  /* ---------- Tracé animé du graphique de revenus (dashboard) ---------- */
  function animateRevenueChart(container){
    const svg = container.querySelector("svg");
    if(!svg || svg.__fxDrawn) return;
    svg.__fxDrawn = true;
    const line = svg.querySelector(".dash-revenue-line");
    if(line && line.getTotalLength){
      try{
        const len = line.getTotalLength();
        line.style.strokeDasharray = String(len);
        line.style.strokeDashoffset = String(len);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          line.style.transition = "stroke-dashoffset 1s cubic-bezier(.25,.6,.3,1)";
          line.style.strokeDashoffset = "0";
        }));
      }catch(_){}
    }
    const area = svg.querySelector(".dash-revenue-area");
    if(area){
      area.style.opacity = "0";
      area.style.transition = "opacity .9s ease .25s";
      requestAnimationFrame(() => { area.style.opacity = "1"; });
    }
    svg.querySelectorAll(".dash-revenue-point").forEach((pt, i) => {
      pt.style.opacity = "0";
      pt.style.transition = `opacity .3s ease ${200 + i*60}ms`;
      requestAnimationFrame(() => { pt.style.opacity = "1"; });
    });
  }

  function watchRevenueChart(){
    const host = document.getElementById("dashRevenueChart");
    if(!host) return;
    new MutationObserver(() => animateRevenueChart(host)).observe(host, { childList:true });
    if(host.querySelector("svg")) animateRevenueChart(host);
  }

  /* ---------- Ondulation (ripple) au clic ---------- */
  const RIPPLE_SELECTOR = ".btn, .confirm, .caisse-box, .nav a, .dash-collapse-btn";
  function attachRipple(){
    document.addEventListener("pointerdown", (e) => {
      const host = e.target && e.target.closest ? e.target.closest(RIPPLE_SELECTOR) : null;
      if(!host || host.disabled) return;
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const span = document.createElement("span");
      span.className = "fx-ripple";
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${e.clientX - rect.left - size/2}px`;
      span.style.top = `${e.clientY - rect.top - size/2}px`;
      host.appendChild(span);
      span.addEventListener("animationend", () => span.remove(), { once:true });
      setTimeout(() => span.remove(), 800);
    }, { passive:true });
  }

  function init(){
    WATCHED_IDS.forEach(id => watchValue(document.getElementById(id)));
    watchRevenueChart();
    attachRipple();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }
})();
