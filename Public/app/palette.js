/* ============================================================
   Gestion Scolaire — Recherche rapide (Cmd/Ctrl+K)
   Palette glass: recherche élève → ouvre le profil.
   ============================================================ */
(function(){
  "use strict";

  const backdrop = document.getElementById("paletteBackdrop");
  const input = document.getElementById("paletteInput");
  const results = document.getElementById("paletteResults");
  const openBtn = document.getElementById("paletteOpenBtn");
  if(!backdrop || !input || !results) return;

  let students = [];
  let fetchedAt = 0;
  let items = [];
  let focusIdx = 0;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  async function ensureData(){
    if(students.length && Date.now() - fetchedAt < 5*60_000) return;
    try{
      const res = await fetch("/api/students", { credentials:"include" });
      if(!res.ok) return;
      const data = await res.json();
      students = (Array.isArray(data) ? data : []).filter(s => s.isActive !== false);
      fetchedAt = Date.now();
    }catch(_){}
  }

  function open(){
    backdrop.style.display = "flex";
    backdrop.setAttribute("aria-hidden", "false");
    input.value = "";
    renderList("");
    setTimeout(() => input.focus(), 30);
    ensureData().then(() => renderList(input.value));
  }
  function close(){
    backdrop.style.display = "none";
    backdrop.setAttribute("aria-hidden", "true");
  }
  function isOpen(){ return backdrop.style.display !== "none"; }

  function score(s, tokens){
    const name = String(s.fullName || "").toLowerCase();
    const mat = String(s.id || "").toLowerCase();
    const cls = String(s.className || "").toLowerCase();
    let sc = 0;
    for(const t of tokens){
      if(name.startsWith(t)) sc += 30;
      else if(name.split(/\s+/).some(w => w.startsWith(t))) sc += 22;
      else if(name.includes(t)) sc += 10;
      else if(mat.startsWith(t)) sc += 26;
      else if(mat.includes(t)) sc += 12;
      else if(cls.includes(t)) sc += 6;
      else return -1;
    }
    return sc;
  }

  function renderList(q){
    const tokens = String(q || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if(!tokens.length){
      items = students.slice(0, 8);
    }else{
      items = students
        .map(s => [score(s, tokens), s])
        .filter(([sc]) => sc >= 0)
        .sort((a,b) => b[0] - a[0])
        .slice(0, 12)
        .map(([,s]) => s);
    }
    focusIdx = 0;
    if(!items.length){
      results.innerHTML = `<div class="palette-empty">${students.length ? "Aucun élève trouvé." : "Chargement des élèves…"}</div>`;
      return;
    }
    results.innerHTML = items.map((s, i) => `
      <div class="palette-item ${i===0?"is-focus":""}" data-idx="${i}">
        <span class="palette-avatar">${esc(String(s.fullName||"?").trim().slice(0,1).toUpperCase())}</span>
        <span class="palette-item-main">
          <strong>${esc(s.fullName)}</strong>
          <small>${esc(s.className || "—")} · ${esc(s.level || "")}</small>
        </span>
        <span class="palette-item-mat">${esc(s.id)}</span>
      </div>`).join("");
  }

  function setFocus(idx){
    focusIdx = Math.max(0, Math.min(items.length - 1, idx));
    results.querySelectorAll(".palette-item").forEach((el, i) => {
      el.classList.toggle("is-focus", i === focusIdx);
      if(i === focusIdx) el.scrollIntoView({ block:"nearest" });
    });
  }
  function choose(idx){
    const s = items[idx];
    if(!s) return;
    close();
    if(typeof window.loadStudentProfile === "function"){
      window.loadStudentProfile(s.id).catch?.(() => {});
    }
  }

  document.addEventListener("keydown", (e) => {
    if((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "k"){
      e.preventDefault();
      isOpen() ? close() : open();
      return;
    }
    if(!isOpen()) return;
    if(e.key === "Escape"){ e.preventDefault(); close(); }
    else if(e.key === "ArrowDown"){ e.preventDefault(); setFocus(focusIdx + 1); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); setFocus(focusIdx - 1); }
    else if(e.key === "Enter"){ e.preventDefault(); choose(focusIdx); }
  });

  input.addEventListener("input", () => renderList(input.value));
  results.addEventListener("click", (e) => {
    const item = e.target && e.target.closest ? e.target.closest(".palette-item") : null;
    if(item) choose(Number(item.dataset.idx));
  });
  results.addEventListener("mousemove", (e) => {
    const item = e.target && e.target.closest ? e.target.closest(".palette-item") : null;
    if(item) setFocus(Number(item.dataset.idx));
  });
  backdrop.addEventListener("mousedown", (e) => { if(e.target === backdrop) close(); });
  openBtn?.addEventListener("click", open);
})();
