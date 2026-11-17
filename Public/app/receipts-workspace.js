/* Presentation only. Receipt actions and permission checks remain in receipts.js. */
(() => {
  'use strict';
  const root = document.getElementById('viewReceipts');
  if(!root) return;
  const byId = id => document.getElementById(id);
  root.querySelectorAll('[data-rx-status]').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('[data-rx-status]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    receiptsVisibleCount = RECEIPTS_LIST_STEP;
    renderReceiptsTable();
  }));
  byId('rxReset').addEventListener('click', () => {
    ['rSearch','rCurrency','rFrom','rTo'].forEach(id => { byId(id).value = ''; });
    root.querySelectorAll('[data-rx-status]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.rxStatus === 'all')));
    receiptsVisibleCount = RECEIPTS_LIST_STEP;
    renderReceiptsTable();
    byId('rSearch').focus();
  });
  const closeDetail = () => {
    root.classList.remove('rx-detail-open');
    root.querySelector('tr.selected')?.focus({preventScroll:true});
  };
  byId('rxCloseDetail').addEventListener('click', closeDetail);
  root.addEventListener('keydown', event => {
    if(event.key === 'Escape' && root.classList.contains('rx-detail-open')) closeDetail();
  });
  window.renderReceiptsWorkspace = filtered => {
    root.querySelectorAll('#receiptsTbody td').forEach(cell => { cell.title = cell.textContent.trim(); });
    byId('rxTotal').textContent = filtered.length.toLocaleString('fr');
    byId('rxValid').textContent = filtered.filter(p => !p.cancelled).length.toLocaleString('fr');
    byId('rxCorrected').textContent = filtered.filter(p => p.corrected).length.toLocaleString('fr');
    byId('rxCancelled').textContent = filtered.filter(p => p.cancelled).length.toLocaleString('fr');
    const p = filtered.find(item => String(item.id) === String(selectedPaymentId));
    root.classList.toggle('rx-detail-open', Boolean(p));
    if(!p){
      byId('rxDetail').innerHTML = '<div class="rx-empty"><span>▤</span><strong>Votre reçu, en détail.</strong><p>Sélectionnez un paiement dans le registre pour afficher ses informations.</p></div>';
      return;
    }
    const fields = [['Élève',p.studentName],['Matricule',p.matricule],['Classe',formatClassLevel(p.className,p.level)],['Frais',getLiveFeeLabel(p)],['Période',p.month],['Date',p.createdAt ? fmtDateTime(new Date(p.createdAt)) : '—'],['Caissier',p.cashier],['Mode de paiement',p.mode]];
    byId('rxDetail').innerHTML = `<div class="rx-document"><span class="rx-state ${p.cancelled ? 'is-cancelled' : ''}">${p.cancelled ? 'Annulé' : p.corrected ? 'Corrigé' : 'Valide'}</span><h4>${esc(p.receiptNo || 'Sans numéro')}</h4><strong class="rx-amount">${esc(receiptDisplayAmountLabel(p))}</strong><span class="rx-amount-label">Montant du reçu · ${esc(receiptDisplayCurrencyLabel(p))}</span></div><dl class="rx-facts">${fields.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`).join('')}</dl>${p.cancelled ? `<div class="rx-notice">Motif d’annulation : ${esc(p.cancellationReason || 'Non renseigné')}</div>` : ''}${p.corrected ? `<div class="rx-notice">Correction : ${esc(p.latestCorrection?.reason || 'Consultez le journal pour le détail.')}</div>` : ''}${p.pendingSync || p.syncError ? `<div class="rx-notice">${p.pendingSync ? 'Synchronisation en attente.' : 'Échec de synchronisation.'}</div>` : ''}`;
  };
  renderReceiptsTable();
})();
