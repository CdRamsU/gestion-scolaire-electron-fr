(() => {
  'use strict';
  const el = id => document.getElementById(id);
  let findings = [], limit = 50;
  function display(){
    const q = el('dqSearch').value.toLocaleLowerCase('fr').trim(), kind = el('dqKind').value;
    const filtered = findings.filter(f => (!kind || f.kind === kind) && (!q || `${f.student.name} ${f.student.matricule || ''}`.toLocaleLowerCase('fr').includes(q)));
    el('dqStatus').textContent = `${filtered.length} point(s) · ${Math.min(limit,filtered.length)} affiché(s). Résultats des données locales au moment de l’analyse.`;
    el('dqRows').innerHTML = filtered.slice(0,limit).map(f => `<tr><td><strong>${esc(f.student.name || 'Nom manquant')}</strong><small>${esc(f.student.matricule || 'Sans matricule')} · ${esc(f.student.className || 'Sans classe')}</small></td><td><span class="dq-label">${esc(f.label)}</span></td><td>${esc(f.detail)}</td><td><button class="btn" type="button" data-dq-student="${esc(String(f.student.id))}">Ouvrir la fiche ↗</button></td></tr>`).join('') || '<tr><td colspan="4" class="dq-empty">Aucun point ne correspond à ces filtres. Ces contrôles ne garantissent pas l’exactitude de toutes les données.</td></tr>';
    el('dqMore').hidden = filtered.length <= limit;
  }
  window.renderDataQuality = () => {
    const records = (Array.isArray(students) ? students : []).filter(s => el('dqScope').value === 'all' || isStudentActiveRecord(s));
    findings = window.ecoleDataQuality.inspect(records,isValidClassForReports);
    el('dqScanned').textContent = records.length.toLocaleString('fr');
    el('dqAffected').textContent = new Set(findings.map(f => String(f.student.id))).size.toLocaleString('fr');
    el('dqIssues').textContent = findings.length.toLocaleString('fr');
    limit = 50; display();
  };
  el('dqScan').addEventListener('click',window.renderDataQuality);
  el('dqScope').addEventListener('change',window.renderDataQuality);
  for(const id of ['dqSearch','dqKind']) el(id).addEventListener(id === 'dqSearch' ? 'input':'change',()=>{limit=50;display();});
  el('dqMore').addEventListener('click',()=>{limit+=50;display();});
  el('dqRows').addEventListener('click',event=>{const button=event.target.closest('[data-dq-student]');if(button) loadStudentProfile(button.dataset.dqStudent);});
  if(el('viewDataQuality').classList.contains('active')) window.renderDataQuality();
})();
