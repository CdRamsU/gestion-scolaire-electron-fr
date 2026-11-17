/* Admin-only duplicate student merge. The server performs the transaction. */
(() => {
  const button = document.getElementById("studentProfileMergeDuplicateBtn");
  if(!button) return;
  const canMerge = () => hasRole("admin") && Boolean(studentProfileState?.student?.id) && isStudentActiveRecord(studentProfileState.student);
  function optionLabel(student){ return `${student.name || student.fullName || "Sans nom"} · ${student.matricule || student.id} · ${student.className || "—"}`; }
  function close(overlay){ overlay.remove(); }
  function refreshButton(){ button.style.display = canMerge() ? "" : "none"; button.disabled = !canMerge(); }
  button.addEventListener("click", () => {
    if(!canMerge()) return showInAppPopup("Fusion réservée à l’administrateur.", { variant:"error" });
    const duplicate = studentProfileState.student;
    const choices = (Array.isArray(students) ? students : []).filter((student) => String(student.id) !== String(duplicate.id) && isStudentActiveRecord(student) && Number(student.schoolYearStartYear) === Number(duplicate.schoolYearStartYear));
    if(!choices.length) return showInAppPopup("Aucun dossier actif de la même année scolaire n’est disponible.", { variant:"error" });
    const overlay = document.createElement("div");
    overlay.className = "duplicate-merge-overlay";
    overlay.innerHTML = `<section class="duplicate-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicateMergeTitle"><header><div><p>ADMINISTRATION · ACTION IRRÉVERSIBLE</p><h3 id="duplicateMergeTitle">Fusionner un dossier doublon</h3></div><button class="btn" type="button" data-close>Fermer</button></header><div class="duplicate-merge-copy"><strong>Dossier à fermer</strong><span>${esc(optionLabel(duplicate))}</span><p>Les paiements seront déplacés vers le dossier choisi. Chaque reçu conservera son numéro, sa date et son montant. Le doublon sera rendu inactif.</p></div><label>Conserver ce dossier<select id="duplicateMergeTarget" class="input"><option value="">— Choisir le dossier correct —</option>${choices.map((student) => `<option value="${esc(String(student.id))}">${esc(optionLabel(student))}</option>`).join("")}</select></label><div id="duplicateMergePreview" class="duplicate-merge-preview">Choisissez le dossier correct pour vérifier les paiements à transférer.</div><label>Pour confirmer, saisissez le matricule du dossier à conserver<input id="duplicateMergeConfirm" class="input" autocomplete="off" placeholder="Matricule exact" disabled /></label><div class="duplicate-merge-actions"><button class="btn" type="button" data-close>Annuler</button><button class="btn danger" type="button" id="duplicateMergeSubmit" disabled>Fusionner définitivement</button></div></section>`;
    document.body.appendChild(overlay);
    const target = overlay.querySelector("#duplicateMergeTarget");
    const preview = overlay.querySelector("#duplicateMergePreview");
    const confirmation = overlay.querySelector("#duplicateMergeConfirm");
    const submit = overlay.querySelector("#duplicateMergeSubmit");
    let previewData = null;
    const updateSubmit = () => { submit.disabled = !previewData || String(confirmation.value || "").trim() !== String(previewData.target.matricule || ""); };
    overlay.querySelectorAll("[data-close]").forEach((node) => node.addEventListener("click", () => close(overlay)));
    overlay.addEventListener("click", (event) => { if(event.target === overlay) close(overlay); });
    target.addEventListener("change", async () => {
      previewData = null; confirmation.value = ""; confirmation.disabled = true; updateSubmit();
      if(!target.value){ preview.textContent = "Choisissez le dossier correct pour vérifier les paiements à transférer."; return; }
      preview.textContent = "Vérification des dossiers et des paiements…";
      try{
        const data = await apiFetch(`/api/students/${encodeURIComponent(duplicate.id)}/merge-preview?targetId=${encodeURIComponent(target.value)}`);
        previewData = data; confirmation.disabled = false;
        preview.innerHTML = `<strong>Vérification prête</strong><span>${data.paymentCount} paiement(s), dont ${data.activePaymentCount} actif(s) et ${data.cancelledPaymentCount} annulé(s), seront rattachés à <b>${esc(data.target.fullName)}</b>.</span><small>Confirmez avec le matricule : ${esc(data.target.matricule)}</small>`;
      }catch(error){ preview.textContent = `Impossible de préparer la fusion : ${error.message}`; }
    });
    confirmation.addEventListener("input", updateSubmit);
    submit.addEventListener("click", async () => {
      if(!previewData) return;
      submit.disabled = true;
      try{
        const result = await apiFetch(`/api/students/${encodeURIComponent(duplicate.id)}/merge-into`, { method:"POST", body:JSON.stringify({ targetStudentId: previewData.target.id, confirmationMatricule: confirmation.value.trim() }) });
        close(overlay); await loadStudents(); await renderStudentsTable(); renderStudentList(); await loadPaymentsFromApi().catch(() => {}); await loadStudentProfile(result.targetStudentId, { open:true });
        showInAppPopup(`Fusion terminée : ${result.transferredPaymentCount} paiement(s) transféré(s).`, { variant:"success", duration:4600 });
      }catch(error){ submit.disabled = false; showInAppPopup(`Fusion impossible : ${error.message}`, { variant:"error", duration:4600 }); }
    });
    target.focus();
  });
  window.refreshDuplicateMergeButton = refreshButton;
  refreshButton();
})();
