/* ============================================================
   Gestion Scolaire — Journal d'audit (lecture seule, admin/comptable)
   Source: GET /api/audit?limit=N (déjà alimenté par le serveur).
   ============================================================ */
(function(){
  "use strict";

  const card = document.getElementById("auditLogCard");
  if(!card) return;

  const tbody = document.getElementById("auditTbody");
  const elSearch = document.getElementById("auditSearch");
  const elAction = document.getElementById("auditActionFilter");
  const elLimit = document.getElementById("auditLimit");
  const elCount = document.getElementById("auditCount");
  const btnRefresh = document.getElementById("auditRefreshBtn");
  const detailDialog = document.getElementById("auditDetailDialog");
  const detailTitle = document.getElementById("auditDetailTitle");
  const detailMeta = document.getElementById("auditDetailMeta");
  const detailBody = document.getElementById("auditDetailBody");
  const detailClose = document.getElementById("auditDetailClose");

  const ACTION_LABELS = {
    create:"Création", update:"Modification", upsert:"Mise à jour",
    delete:"Suppression", login:"Connexion", logout:"Déconnexion",
    reprint:"Réimpression", print:"Impression", reset:"Réinitialisation",
    disable:"Désactivation", enable:"Activation"
  };
  const ACTION_TONES = {
    create:"is-create", upsert:"is-update", update:"is-update",
    delete:"is-delete", login:"is-auth", logout:"is-auth",
    reprint:"is-neutral", print:"is-neutral"
  };
  const ENTITY_LABELS = {
    payment:"Paiement", spending:"Dépense", student:"Élève", user:"Utilisateur",
    setting:"Paramètre", fee_type:"Type de frais", auth:"Authentification",
    cash_closure:"Clôture de caisse", class:"Classe", receipt:"Reçu",
    bus_subscription:"Abonnement bus", student_fee_override:"Frais élève"
  };
  const DETAIL_KEYS = {
    amount:"Montant", currency:"Devise", note:"Note", date:"Date",
    category:"Catégorie", receiptNo:"Reçu", studentName:"Élève",
    username:"Utilisateur", role:"Rôle", before:"Avant", after:"Après",
    monthKey:"Mois", feeType:"Frais", reason:"Motif", className:"Classe",
    diffUsd:"Écart USD", diffCdf:"Écart CDF"
  };

  let rows = [];
  let visible = false;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function relTime(iso){
    const d = new Date(iso);
    if(isNaN(d)) return "—";
    const diff = (Date.now() - d.getTime()) / 1000;
    if(diff < 90) return "à l'instant";
    if(diff < 3600) return `il y a ${Math.round(diff/60)} min`;
    if(diff < 86400) return `il y a ${Math.round(diff/3600)} h`;
    return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"2-digit" });
  }
  function fullTime(iso){
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("fr-FR");
  }

  function summarizeDetails(details){
    if(details == null) return "";
    let obj = details;
    if(typeof obj === "string"){
      try{ obj = JSON.parse(obj); }catch{ return esc(obj).slice(0, 160); }
    }
    if(typeof obj !== "object") return esc(String(obj)).slice(0, 160);
    const parts = [];
    for(const [k, v] of Object.entries(obj)){
      if(v == null || v === "") continue;
      const label = DETAIL_KEYS[k] || k;
      let val = typeof v === "object" ? JSON.stringify(v) : String(v);
      if(val.length > 60) val = val.slice(0, 57) + "…";
      parts.push(`<span class="audit-kv"><small>${esc(label)}</small>${esc(val)}</span>`);
      if(parts.length >= 5) break;
    }
    return parts.join(" ");
  }

  function parseDetails(details){
    if(details == null || details === "") return null;
    if(typeof details !== "string") return details;
    try{ return JSON.parse(details); }catch{ return details; }
  }

  function detailsDialogHtml(details){
    const value = parseDetails(details);
    if(value == null) return `<div class="audit-detail-empty">Aucun d&eacute;tail suppl&eacute;mentaire pour cette activit&eacute;.</div>`;
    if(typeof value !== "object" || Array.isArray(value)){
      return `<div class="audit-detail-value">${esc(typeof value === "string" ? value : JSON.stringify(value, null, 2))}</div>`;
    }
    const entries = Object.entries(value).filter(([, item]) => item != null && item !== "");
    if(!entries.length) return `<div class="audit-detail-empty">Aucun d&eacute;tail suppl&eacute;mentaire pour cette activit&eacute;.</div>`;
    return `<dl class="audit-detail-list">${entries.map(([key, item]) => {
      const label = DETAIL_KEYS[key] || key;
      const text = typeof item === "object" ? JSON.stringify(item, null, 2) : String(item);
      return `<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`;
    }).join("")}</dl>`;
  }

  function openDetails(row){
    if(!detailDialog || !row) return;
    const action = String(row.action || "");
    const entity = ENTITY_LABELS[row.entityType] || row.entityType || "Activit&eacute;";
    if(detailTitle) detailTitle.textContent = `${ACTION_LABELS[action] || action || "Activité"}: ${entity}`;
    if(detailMeta) detailMeta.textContent = `${fullTime(row.createdAt) || "Date inconnue"} · ${row.actorUsername || "Utilisateur inconnu"}${row.actorRole ? ` (${row.actorRole})` : ""}${row.entityId ? ` · Référence ${row.entityId}` : ""}`;
    if(detailBody) detailBody.innerHTML = detailsDialogHtml(row.details);
    if(typeof detailDialog.showModal === "function") detailDialog.showModal();
    else detailDialog.setAttribute("open", "");
  }

  async function load(){
    tbody.innerHTML = `<tr><td colspan="5"><div class="skel skel-line" style="margin:4px 0"></div><div class="skel skel-line" style="width:70%"></div></td></tr>`;
    try{
      const res = await fetch(`/api/audit?limit=${Number(elLimit?.value) || 100}`, { credentials:"include" });
      if(!res.ok) throw new Error(`API ${res.status}`);
      rows = await res.json();
      if(!Array.isArray(rows)) rows = [];
      const actions = [...new Set(rows.map(r => String(r.action || "")))].filter(Boolean).sort();
      if(elAction){
        const cur = elAction.value;
        elAction.innerHTML = `<option value="">Toutes</option>` +
          actions.map(a => `<option value="${esc(a)}" ${a===cur?"selected":""}>${esc(ACTION_LABELS[a] || a)}</option>`).join("");
      }
      render();
    }catch(err){
      tbody.innerHTML = `<tr><td colspan="5" class="tiny">Erreur: ${esc(err?.message || err)}</td></tr>`;
    }
  }

  function render(){
    const q = String(elSearch?.value || "").toLowerCase().trim();
    const act = String(elAction?.value || "");
    const filtered = rows.filter(r => {
      if(act && String(r.action) !== act) return false;
      if(!q) return true;
      const hay = [
        r.actorUsername, r.actorRole, r.action, r.entityType, r.entityId,
        typeof r.details === "object" ? JSON.stringify(r.details) : r.details
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
    if(elCount) elCount.textContent =
      `${filtered.length} entrée(s)` + (filtered.length !== rows.length ? ` (sur ${rows.length} chargées)` : "");
    if(!filtered.length){
      tbody.innerHTML = `<tr><td colspan="5" class="tiny">Aucune entrée.</td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.slice(0, 500).map((r, index) => {
      const action = String(r.action || "");
      const tone = ACTION_TONES[action] || "is-neutral";
      const entity = ENTITY_LABELS[r.entityType] || r.entityType || "—";
      return `<tr>
        <td class="audit-when"><strong>${esc(relTime(r.createdAt))}</strong><small>${esc(fullTime(r.createdAt))}</small></td>
        <td class="audit-actor"><strong>${esc(r.actorUsername || "—")}</strong><small>${esc(r.actorRole || "Rôle inconnu")}</small></td>
        <td><span class="audit-chip ${tone}">${esc(ACTION_LABELS[action] || action)}</span></td>
        <td class="audit-entity"><strong>${esc(entity)}</strong>${r.entityId ? `<small>R&eacute;f. ${esc(String(r.entityId).slice(0,18))}</small>` : ""}</td>
        <td class="audit-details-cell"><div class="audit-detail-summary">${summarizeDetails(r.details) || `<span class="tiny">Aucun d&eacute;tail</span>`}</div><button class="btn audit-details-button" type="button" data-audit-row="${index}">Voir les d&eacute;tails</button></td>
      </tr>`;
    }).join("");
  }

  async function maybeShow(){
    try{
      const res = await fetch("/api/auth/me", { credentials:"include" });
      if(!res.ok) return;
      const me = await res.json();
      const role = String(me?.user?.role || "");
      if(role === "admin" || role === "comptable"){
        card.style.display = "block";
      }
    }catch(_){}
  }

  card.addEventListener("toggle", () => { if(card.open && !visible){ visible = true; load(); } });
  btnRefresh?.addEventListener("click", load);
  elLimit?.addEventListener("change", load);
  elSearch?.addEventListener("input", render);
  elAction?.addEventListener("change", render);
  tbody?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-audit-row]");
    if(!button) return;
    const index = Number(button.dataset.auditRow);
    const q = String(elSearch?.value || "").toLowerCase().trim();
    const action = String(elAction?.value || "");
    const filtered = rows.filter(row => {
      if(action && String(row.action) !== action) return false;
      if(!q) return true;
      return [row.actorUsername, row.actorRole, row.action, row.entityType, row.entityId, typeof row.details === "object" ? JSON.stringify(row.details) : row.details].join(" ").toLowerCase().includes(q);
    });
    openDetails(filtered[index]);
  });
  detailClose?.addEventListener("click", () => detailDialog?.close?.());
  detailDialog?.addEventListener("click", (event) => { if(event.target === detailDialog) detailDialog.close?.(); });

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", maybeShow);
  }else{
    maybeShow();
  }
})();
