/* Read-only payment workspace. Monetary values come from the existing status API. */
const profileFinance = { version: 0, cells: new Map(), selection: null };
function profileFinanceCellState(row){
  if(!row || row.dueAmount == null || row.remaining == null || !Number.isFinite(Number(row.dueAmount)) || !Number.isFinite(Number(row.remaining))) return 'unknown';
  if(Number(row.dueAmount) <= 0) return 'na';
  if(Number(row.remaining) <= .0049) return 'paid';
  return Number(row.paidSoFar) > .0049 ? 'partial' : 'unpaid';
}
function profileFinanceRender(){
  const host = document.getElementById('profileFinanceWorkspace');
  if(!host) return;
  const version = ++profileFinance.version;
  profileFinance.cells.clear(); profileFinance.selection = null;
  const state = studentProfileState;
  const rows = state.feeStatuses || [];
  const year = getActiveSchoolYearStartYear();
  const months = Array.from(elMonth.options).map(o=>({key:monthKeyFromLabelFR(o.value),label:o.textContent})).filter(m=>/^\d{4}-\d{2}$/.test(m.key));
  const totals = {};
  for(const r of rows){
    if(r.unavailable || !Number.isFinite(Number(r.dueAmount)) || !Number.isFinite(Number(r.remaining))) continue;
    const currency = r.currency;
    if(!currency) continue;
    const t = totals[currency] ||= {due:0,paid:0,remaining:0};
    t.due += Number(r.dueAmount); t.paid += Number(r.paidSoFar || 0); t.remaining += Number(r.remaining);
  }
  const totalLabel = key => Object.entries(totals).map(([cur,t])=>esc(formatMoney(t[key],cur))).join('<br>') || '—';
  const last = (state.payments||[]).filter(p=>!p.cancelled).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  host.innerHTML = `<div class="pf-finance-heading"><div><h3>Situation des paiements</h3><p>Année ${esc(schoolYearLabelFromStartYear(year))} · Cliquez sur une période pour vérifier son solde et ses reçus.</p></div><div><button class="btn" data-pfx-statement>Imprimer le relevé</button> <button class="btn" data-pfx-refresh>Actualiser</button></div></div>
  <div class="pf-finance-summary"><article><span>Attendu · échéances affichées</span><strong>${totalLabel('due')}</strong></article><article><span>Versé sur ces échéances</span><strong>${totalLabel('paid')}</strong></article><article><span>Reste sur ces échéances</span><strong>${totalLabel('remaining')}</strong></article><article><span>Dernier paiement non annulé</span><strong>${last ? esc(fmtDateTime(new Date(last.createdAt))) : '—'}</strong></article></div>
  <p class="pf-finance-note">Ces totaux concernent la période renvoyée pour chaque frais, pas le solde annuel. USD et CDF restent séparés. ${state.financeUnavailable || rows.some(r=>r.unavailable) ? '⚠ Certaines données sont indisponibles : les totaux sont incomplets.' : ''} ${state.pendingPaymentCount > 0 ? 'Des paiements locaux attendent la synchronisation.' : ''}</p>
  <div class="pf-finance-grid"><div><div class="table-wrap"><table class="pf-fee-matrix"><caption>Frais mensuels · les périodes non vérifiées sont indiquées « Vérifier »</caption><thead><tr><th>Frais</th>${months.map(m=>`<th>${esc(m.label)}</th>`).join('')}</tr></thead><tbody>${rows.filter(r=>r.feeTypeBillingCycle==='monthly').map(r=>`<tr><th>${esc(r.feeTypeLabel)}</th>${months.map(m=>{
    const known = !r.unavailable && (r.selectedMonth===m.key);
    if(known) profileFinance.cells.set(`${r.feeTypeId}|${m.key}`,r);
    const label = known ? profileFinanceCellLabel(r) : (r.monthsPaid||[]).includes(m.key) ? 'Payé ✓' : (r.monthsPartial||[]).includes(m.key) ? 'Partiel' : 'Vérifier';
    return `<td><button class="pf-month" data-pfx-fee="${esc(String(r.feeTypeId))}" data-pfx-month="${esc(m.key)}" data-state="${known ? profileFinanceCellState(r) : 'unknown'}" aria-label="${esc(r.feeTypeLabel+' · '+m.label+' · '+label)}">${esc(label)}</button></td>`;
  }).join('')}</tr>`).join('') || '<tr><td>Aucun frais mensuel disponible.</td></tr>'}</tbody></table></div>
  <div class="pf-other-fees"><h4>Frais annuels et achats ponctuels</h4>${rows.filter(r=>r.feeTypeBillingCycle!=='monthly').map(r=>`<button class="btn" data-pfx-fee="${esc(String(r.feeTypeId))}" data-pfx-month="${esc(r.annualPaymentLockMonth||r.selectedMonth||r.nextDueMonth||'')}">${esc(r.feeTypeLabel)} · ${r.unavailable ? 'Indisponible' : esc(formatMoney(r.remaining,r.currency))+' restant'}</button>`).join('') || '<p>Aucun autre frais.</p>'}</div></div>
  <aside id="pfFinanceDetail" class="pf-finance-detail" aria-live="polite"><h4>Détail d’une période</h4><p>Sélectionnez une case pour consulter les montants et retrouver les reçus.</p></aside></div>`;
  host.dataset.version = String(version);
  profileFinanceCheckGrid(version, state.studentId);
}
function profileFinanceCellLabel(row){
  const state=profileFinanceCellState(row);
  return {na:'Non applicable',paid:'Payé ✓',unknown:'Indisponible',unpaid:'Impayé',partial:'Partiel'}[state];
}
async function profileFinanceOpen(feeId,month){
  const version = profileFinance.version;
  const studentId = studentProfileState.studentId;
  const fee = (studentProfileState.feeStatuses||[]).find(r=>String(r.feeTypeId)===String(feeId));
  if(!fee) return;
  const detail=document.getElementById('pfFinanceDetail');
  const selection={feeId,month};profileFinance.selection=selection;
  detail.innerHTML='<p>Vérification du solde local…</p>';
  document.querySelectorAll('.pf-month').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pfxFee===feeId && b.dataset.pfxMonth===month)));
  try{
    const qs=new URLSearchParams({feeTypeId:feeId,allowInactive:'1'});if(month) qs.set('month',month);
    const row=await apiFetch(`/api/students/${encodeURIComponent(studentId)}/status?${qs}`);
    if(version!==profileFinance.version || profileFinance.selection!==selection) return;
    profileFinance.cells.set(`${feeId}|${month}`,row);
    document.querySelectorAll('.pf-month').forEach(b=>{if(b.dataset.pfxFee===feeId && b.dataset.pfxMonth===month){b.textContent=profileFinanceCellLabel(row);b.dataset.state=profileFinanceCellState(row);}});
    const records=(studentProfileState.payments||[]).filter(p=>{
      const matches=String(p.feeTypeId||'')===String(feeId) || (!p.feeTypeId && normalizeFeeName(paymentTypeLabelForHistory(p))===normalizeFeeName(fee.feeTypeLabel));
      const mk=String(p.paidForMonth||p.monthKey||'').slice(0,7) || monthKeyFromLabelFR(p.month||'');
      return matches && (!month || mk===month);
    });
    detail.innerHTML=`<h4>${esc(fee.feeTypeLabel)}</h4><p>${esc(monthLabelShortFrFromMonthKey(month||row.selectedMonth,{withYear:true}))}</p><dl><div><dt>Attendu</dt><dd>${esc(formatMoney(row.dueAmount,row.currency))}</dd></div><div><dt>Versé</dt><dd>${esc(formatMoney(row.paidSoFar,row.currency))}</dd></div><div><dt>Reste</dt><dd>${esc(formatMoney(row.remaining,row.currency))}</dd></div></dl><p>${esc(profileFinanceCellLabel(row))} · Solde vérifié à ${esc(new Date().toLocaleTimeString('fr-FR'))}</p><button class="btn primary" data-pfx-pay>Préparer un paiement</button><h4>Reçus de cette période</h4>${records.map(p=>`<div class="pf-linked-receipt"><strong>${esc(p.receiptNo||'Sans numéro')}</strong><span>${esc(receiptDisplayAmountLabel(p))} · ${p.cancelled?'Annulé':esc(fmtDateTime(new Date(p.createdAt)))}</span>${!p.cancelled?`<button class="btn" data-pfx-print="${esc(String(p.id))}">Réimprimer</button>`:''}</div>`).join('') || '<p>Aucun reçu chargé pour cette période. Consultez aussi l’historique ci-dessous.</p>'}`;
  }catch(err){if(version===profileFinance.version && profileFinance.selection===selection) detail.innerHTML=`<p>Solde indisponible. Aucun montant n’a été supposé.</p><button class="btn" data-pfx-fee="${esc(feeId)}" data-pfx-month="${esc(month)}">Réessayer</button>`;}
}
document.getElementById('profileFinanceWorkspace')?.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-pfx-statement')) return profileFinancePrintStatement();
  if(b.hasAttribute('data-pfx-refresh'))return loadStudentProfile(studentProfileState.studentId,{open:false});
  if(b.dataset.pfxFee)return profileFinanceOpen(b.dataset.pfxFee,b.dataset.pfxMonth||'');
  if(b.dataset.pfxPrint){const p=(studentProfileState.payments||[]).find(p=>String(p.id)===b.dataset.pfxPrint);if(p&&!p.cancelled)await printCurrentReceipt(p,{forceCopy:true});return;}
  if(b.hasAttribute('data-pfx-pay')){
    const chosen=profileFinance.selection;const id=studentProfileState.studentId;
    if(!chosen || !getPaymentEligibleStudentById(id))return showInAppPopup('Élève inactif ou indisponible pour un paiement.');
    closeStudentProfileModal();setView('payment');selectStudent(id);
    const option=Array.from(elFee.options).find(o=>String(o.dataset.feeTypeId)===chosen.feeId);
    if(option){
      choosePaymentFee(option.value);
      await loadSelectedStudentFeeStatus({applyMonthDefault:true});
      const requested = Array.from(elMonth.options).find(o=>monthKeyFromLabelFR(o.value)===chosen.month && !o.disabled);
      if(requested){elMonth.value=requested.value;elMonth.dispatchEvent(new Event('change',{bubbles:true}));}
    }
    // Existing fee rules choose the next permitted period. The cashier reviews it before confirming.
    showToast('Frais préparé. Vérifiez la période autorisée et le montant avant confirmation.',{variant:'info'});
  }
});

async function profileFinanceCheckGrid(version,studentId){
  const queue=Array.from(document.querySelectorAll('.pf-month')).filter(b=>!profileFinance.cells.has(`${b.dataset.pfxFee}|${b.dataset.pfxMonth}`));
  async function worker(){
    while(queue.length && version===profileFinance.version){
      const b=queue.shift();
      try{
        const query=new URLSearchParams({feeTypeId:b.dataset.pfxFee,month:b.dataset.pfxMonth,allowInactive:'1'});
        const row=await apiFetch(`/api/students/${encodeURIComponent(studentId)}/status?${query}`);
        if(version!==profileFinance.version)return;
        profileFinance.cells.set(`${b.dataset.pfxFee}|${b.dataset.pfxMonth}`,row);
        b.textContent=profileFinanceCellLabel(row);b.dataset.state=profileFinanceCellState(row);
        b.setAttribute('aria-label',`${row.feeTypeLabel||'Frais'} · ${monthLabelShortFrFromMonthKey(b.dataset.pfxMonth,{withYear:true})} · ${b.textContent}`);
      }catch(_){if(version===profileFinance.version){b.textContent='Réessayer';b.dataset.state='unknown';}}
    }
  }
  await Promise.all([worker(),worker(),worker()]);
}
function profileFinancePrintStatement(){
  const popup=window.open('','_blank','width=1000,height=760');
  if(!popup)return showInAppPopup('Autorisez la fenêtre du relevé pour imprimer.');
  const s=studentProfileState.student;
  const history=(studentProfileState.payments||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Relevé élève</title><style>body{font:14px system-ui;color:#172638;padding:30px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ccc;text-align:left}h1{font-size:24px}@media print{button{display:none}}</style></head><body><h1>Relevé des paiements</h1><p>${esc(s.name||s.fullName||'')} · ${esc(s.matricule||s.id)} · ${esc(s.className||'')}</p><p>Édité le ${esc(new Date().toLocaleString('fr-FR'))}. Montants dans la devise du reçu. ${studentProfileState.financeUnavailable?'Attention : historique incomplet, certaines données sont indisponibles.':''}</p><table><thead><tr><th>Date</th><th>Reçu</th><th>Frais / période</th><th>Montant</th><th>État</th></tr></thead><tbody>${history.map(p=>`<tr><td>${esc(fmtDateTime(new Date(p.createdAt)))}</td><td>${esc(p.receiptNo||'—')}</td><td>${esc(paymentTypeLabelForHistory(p))} · ${esc(p.month||p.paidForMonth||'—')}</td><td>${esc(receiptDisplayAmountLabel(p))}</td><td>${p.cancelled?'Annulé':'Enregistré'}</td></tr>`).join('')}</tbody></table><button onclick="window.print()">Imprimer</button></body></html>`);
  popup.document.close();
}

document.getElementById('pfPaymentsTbody')?.addEventListener('click',event=>{
 const button=event.target.closest('[data-pfx-history-print]');if(!button)return;
 const row=(studentProfileState.payments||[]).find(p=>String(p.id)===button.dataset.pfxHistoryPrint);
 if(row&&!row.cancelled) printCurrentReceipt(row,{forceCopy:true}).catch(err=>showInAppPopup(err.message));
});
