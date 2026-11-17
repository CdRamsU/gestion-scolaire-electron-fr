/* Dashboard presentation. Monthly finance aggregates remain owned by reports.js. */
(() => {
  'use strict';
  const root = document.getElementById('viewDashboard');
  if (!root) return;
  const el = id => document.getElementById(id);
  const monthSelect = el('dashMonth');
  function syncActions() {
    root.querySelectorAll('[data-db-view]').forEach(button => {
      const link = document.querySelector(`.nav [data-view="${button.dataset.dbView}"]`);
      button.hidden = !link || link.hidden || getComputedStyle(link).display === 'none';
    });
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-db-view]');
    if (!button || button.hidden) return;
    const link = document.querySelector(`.nav [data-view="${button.dataset.dbView}"]`);
    if (link && !link.hidden && getComputedStyle(link).display !== 'none') link.click();
  });
  function changeMonth(offset) {
    const index = monthSelect.selectedIndex + offset;
    if(index < 0 || index >= monthSelect.options.length) return;
    monthSelect.selectedIndex = index;
    monthSelect.dispatchEvent(new Event('change', {bubbles:true}));
  }
  el('dbPrev').addEventListener('click', () => changeMonth(-1));
  el('dbNext').addEventListener('click', () => changeMonth(1));
  window.renderDashboardOverview = ({activeStudents, paidCount, totalDueUSD, totalRemainUSD, month}) => {
    const covered = Math.max(0, totalDueUSD - totalRemainUSD);
    const pct = totalDueUSD > 0 ? Math.min(100, Math.max(0, covered / totalDueUSD * 100)) : null;
    el('dbCollectionRate').textContent = pct === null ? '—' : `${Math.round(pct)} %`;
    el('dbRing').style.setProperty('--progress', `${pct || 0}%`);
    el('dbCovered').textContent = `${formatUSD(covered)} couverts sur ${formatUSD(totalDueUSD)}`;
    const pending = Math.max(0, activeStudents.length - paidCount);
    el('dbAttention').textContent = !activeStudents.length ? 'Aucun élève actif dans les données disponibles.' : !totalDueUSD ? 'Aucun montant attendu pour cette période.' : pending ? `${pending} élève${pending > 1 ? 's ont' : ' a'} un solde à régler sur cette période.` : 'Tous les élèves actifs sont à jour pour cette période.';
    el('dbYear').textContent = `Année scolaire ${schoolYearLabelFromStartYear(getActiveSchoolYearStartYear())}`;
    el('dbPrev').disabled = monthSelect.selectedIndex <= 0;
    el('dbNext').disabled = monthSelect.selectedIndex >= monthSelect.options.length - 1;
    const monthKey = monthKeyFromLabelFR(month);
    const recent = getPayments().filter(p => paymentMonthKey(p) === monthKey && !p.cancelled)
      .sort((a,b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0,5);
    el('dbRecent').innerHTML = recent.length ? recent.map(p => {
      const name = p.studentName || activeStudents.find(s => s.id === p.studentId)?.name || 'Élève';
      const date = p.createdAt && !Number.isNaN(Date.parse(p.createdAt)) ? new Date(p.createdAt).toLocaleDateString('fr', {day:'2-digit',month:'short'}) : 'Date indisponible';
      return `<div class="db-payment-row"><span class="db-payment-avatar" aria-hidden="true">${esc(name.trim().slice(0,1).toLocaleUpperCase('fr'))}</span><div class="db-payment-person"><strong>${esc(name)}</strong><span>${esc(p.receiptNo || 'Sans numéro')} · ${esc(date)}</span></div><div class="db-payment-money"><strong>${esc(receiptDisplayAmountLabel(p))}</strong><span>${esc(p.feeType || 'Paiement')}</span></div></div>`;
    }).join('') : '<div class="db-empty"><span>↳</span><strong>Aucun paiement pour cette période</strong><p>Les paiements enregistrés apparaîtront ici.</p></div>';
    el('dbRevenueValues').innerHTML = buildDashboardRevenueSeries().map(row => `<div><span>${esc(monthLabelFromMonthKeyWithYear(row.monthKey))}</span><strong>${esc(formatUSD(row.totalUSD))}</strong></div>`).join('');
    syncActions();
  };
  const nav = document.querySelector('.nav');
  if(nav) new MutationObserver(syncActions).observe(nav, {subtree:true,attributes:true,attributeFilter:['hidden','style']});
  if(typeof renderDashboard === 'function') renderDashboard();
})();
