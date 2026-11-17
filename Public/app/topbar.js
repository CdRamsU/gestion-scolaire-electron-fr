/* Header presentation only: existing auth, finance, theme and routing remain authoritative. */
(() => {
  'use strict';
  const header = document.querySelector('.tb-shell');
  if (!header) return;
  const byId = id => document.getElementById(id);
  const triggers = [...header.querySelectorAll('[data-tb-toggle]')];
  const roles = { admin:'Administrateur', comptable:'Comptable', caissier:'Caissier' };
  let activeTrigger = null, toastTimer, privateBalances = false;
  try { privateBalances = sessionStorage.getItem('ecolepos_header_private') === '1'; } catch (_) {}
  function toast(message) {
    clearTimeout(toastTimer);
    byId('tbToast').textContent = message;
    byId('tbToast').hidden = false;
    toastTimer = setTimeout(() => { byId('tbToast').hidden = true; }, 3000);
  }
  function closePanels(restoreFocus = false) {
    const previous = activeTrigger;
    triggers.forEach(trigger => {
      trigger.setAttribute('aria-expanded', 'false');
      byId(trigger.dataset.tbToggle).hidden = true;
    });
    activeTrigger = null;
    if (restoreFocus) previous?.focus();
  }
  function updatePrivacy() {
    header.classList.toggle('tb-private', privateBalances);
    const button = byId('tbPrivacy');
    button.setAttribute('aria-pressed', String(privateBalances));
    button.setAttribute('aria-label', privateBalances ? 'Afficher les soldes' : 'Masquer les soldes');
    button.title = button.getAttribute('aria-label');
    header.querySelectorAll('.tb-money,.tb-breakdown-row strong').forEach(el => {
      if(privateBalances) el.setAttribute('aria-hidden','true'); else el.removeAttribute('aria-hidden');
    });
  }
  function renderBreakdown() {
    const balance = getLocalTuitionBalanceUpToDate(toDateISO(new Date()));
    const rows = [
      ['Entrées', balance.entry.usd, balance.entry.cdf],
      ['Sorties', balance.exit.usd, balance.exit.cdf],
      ['Solde net', balance.netUSD, balance.netCDF]
    ];
    byId('tbBalanceBreakdown').replaceChildren(...rows.map(([label,usd,cdf]) => {
      const row = document.createElement('div'); row.className = 'tb-breakdown-row';
      const name = document.createElement('span'); name.textContent = label;
      const amount = document.createElement('strong'); amount.textContent = `${formatUSD(usd)} · ${formatIntSpaced(cdf)} CDF`;
      row.append(name,amount); return row;
    }));
    updatePrivacy();
  }
  function syncIdentity() {
    const user = typeof currentUser !== 'undefined' ? currentUser : null;
    const name = user?.username || byId('cashierName').textContent || '—';
    byId('tbInitials').textContent = name.split(/[\s._-]+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toLocaleUpperCase('fr') || '—';
    byId('tbRole').textContent = roles[user?.role] || user?.role || 'Session';
    byId('tbProfileName').textContent = name;
    byId('tbProfileSchool').textContent = window.ecoleConfiguration?.['school.name'] || byId('brandUserName')?.textContent || 'Gestion Scolaire';
    byId('tbNewPayment').hidden = !user || window.ecoleConfiguration?.['features.payments'] === false;
  }
  function syncView() {
    const link = document.querySelector('.nav a[data-view].active');
    byId('tbPageTitle').textContent = link?.querySelector('span')?.textContent.trim() || 'Espace de travail';
  }
  function syncTheme() { byId('tbTheme').setAttribute('aria-pressed',String(document.documentElement.dataset.theme === 'dark')); }
  triggers.forEach(trigger => trigger.addEventListener('click', () => {
    const opening = activeTrigger !== trigger;
    closePanels();
    if (!opening) return;
    if (trigger.dataset.tbToggle === 'tbBalancePanel') { renderTopDailyBalance(); renderBreakdown(); }
    if (trigger.dataset.tbToggle === 'tbProfilePanel') { syncIdentity(); syncTheme(); }
    if (trigger.dataset.tbToggle === 'tbConnectionPanel') byId('tbConnectionDescription').textContent = byId('syncBadge').textContent;
    activeTrigger = trigger;
    trigger.setAttribute('aria-expanded','true');
    byId(trigger.dataset.tbToggle).hidden = false;
  }));
  header.querySelectorAll('[data-tb-view]').forEach(button => button.addEventListener('click', () => {
    closePanels(); setView(button.dataset.tbView);
    document.querySelector('.view.active h2,.view.active h3')?.scrollIntoView({block:'nearest'});
  }));
  byId('tbPrivacy').addEventListener('click', () => {
    privateBalances = !privateBalances;
    try { sessionStorage.setItem('ecolepos_header_private', privateBalances ? '1' : '0'); } catch (_) {}
    updatePrivacy(); toast(privateBalances ? 'Soldes de l’en-tête masqués' : 'Soldes visibles');
  });
  byId('tbTheme').addEventListener('click', () => {
    applyThemeMode(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', {persist:true});
    syncTheme();
  });
  byId('tbCopyReceipt').addEventListener('click', async () => {
    const number = byId('receiptNoTop').textContent.trim();
    if(!number || number === '—') return toast('Aucun numéro de reçu disponible');
    try { await navigator.clipboard.writeText(number); toast(`Numéro copié : ${number}`); }
    catch (_) { toast('Copie indisponible. Sélectionnez le numéro affiché.'); }
  });
  byId('tbRefresh').addEventListener('click', async () => {
    const button = byId('tbRefresh'), status = byId('tbRefreshStatus');
    button.disabled = true; button.classList.add('tb-refreshing'); status.textContent = 'Actualisation en cours…';
    try {
      await apiFetch('/api/health');
      const results = await Promise.allSettled([loadPaymentsFromApi(),loadSpendingsFromApi(),loadCaisseTransfersFromApi(),loadServerAddressInfo()]);
      renderTopDailyBalance(); updateSyncBadge();
      const failed = results.some(result => result.status === 'rejected') || !apiReachable;
      status.textContent = failed ? 'Actualisation incomplète. Vérifiez le serveur local.' : 'Actualisation terminée.';
      byId('tbConnectionDescription').textContent = byId('syncBadge').textContent;
    } catch (_) { status.textContent = 'Serveur inaccessible. Les dernières données affichées sont conservées.'; }
    finally { button.disabled = false; button.classList.remove('tb-refreshing'); }
  });
  document.addEventListener('click', event => { if(activeTrigger && !activeTrigger.parentElement.contains(event.target)) closePanels(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeTrigger) { event.preventDefault(); event.stopImmediatePropagation(); closePanels(true); }
  }, true);
  document.addEventListener('focusin', event => { if(activeTrigger && !activeTrigger.parentElement.contains(event.target)) closePanels(); });
  // Observe existing render targets instead of maintaining a second auth/financial state.
  new MutationObserver(syncIdentity).observe(byId('cashierName'), {childList:true,subtree:true,characterData:true});
  new MutationObserver(syncIdentity).observe(byId('brandUserName'), {childList:true,subtree:true,characterData:true});
  new MutationObserver(syncView).observe(document.querySelector('.nav'), {attributes:true,subtree:true,attributeFilter:['class']});
  new MutationObserver(() => { byId('tbConnectionDescription').textContent = byId('syncBadge').textContent; }).observe(byId('syncBadge'), {childList:true,subtree:true,characterData:true});
  new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  ['topDailyBalance','topDailyBalanceCDF'].forEach(id => {
    const element = byId(id); let previous = element.textContent;
    new MutationObserver(() => {
      if(previous === element.textContent) return;
      previous = element.textContent;
      element.classList.remove('tb-number-updated');
      requestAnimationFrame(() => element.classList.add('tb-number-updated'));
      if(activeTrigger?.dataset.tbToggle === 'tbBalancePanel') renderBreakdown();
    }).observe(element,{childList:true,subtree:true,characterData:true});
    element.addEventListener('animationend', () => element.classList.remove('tb-number-updated'));
  });
  byId('tbSearchKey').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  syncIdentity(); syncView(); syncTheme(); updatePrivacy();
})();
