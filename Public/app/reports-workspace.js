/* Report discovery and presentation; existing report rendering owns data and permissions. */
(() => {
  'use strict';
  const root = document.getElementById('viewReports');
  if(!root) return;
  const el = id => document.getElementById(id);
  const select = el('repType'), search = el('rpSearch'), catalog = el('rpCatalog');
  if(!select || !search || !catalog) return;
  const daily = new Set(['daily','dailyEntriesLevel','dailyEntriesCaisse','spending','dailyCaisseArticlesSummary']);
  const lists = new Set(['enrolledStudents','inactiveStudents','duplicateStudents','studentContinuity','families','enrolledImpayes','busSubscribers','tuitionBenefits','casSocial']);
  const clean = text => String(text).replace(/^\d+\.\s*/, '');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  const groups = [
    { id: 'custom', label: 'Sur mesure', matches: value => value === 'custom' },
    { id: 'daily', label: 'Encaissements du jour', matches: value => daily.has(value) },
    { id: 'students', label: 'Élèves & suivi', matches: value => lists.has(value) || value === 'late' },
    { id: 'finance', label: 'Finances & frais', matches: () => true }
  ];
  const groupFor = value => groups.find(group => group.matches(value));
  const heading = root.querySelector('.rp-heading h2');
  if(heading) heading.textContent = 'Rapports';
  search.placeholder = 'Élèves, frais, personnalisé…';
  function reportButton(option) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.report = option.value;
    button.setAttribute('aria-current', String(option.value === select.value));
    const copy = document.createElement('span'); copy.className = 'rp-report-copy';
    const label = document.createElement('span'); label.textContent = clean(option.textContent);
    copy.append(label);
    if(option.value === 'custom'){
      button.className = 'rp-custom-entry';
      const description = document.createElement('small');
      description.textContent = 'Vos critères, votre présentation, votre impression.';
      copy.append(description);
    }
    const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
    button.append(copy,arrow);
    return button;
  }
  function renderLibrary() {
    const query = normalize(search.value.trim());
    const options = Array.from(select.options).filter(option => !option.disabled && !option.hidden);
    const matches = options.filter(option => {
      const keywords = option.value === 'custom' ? ' créer constructeur critères colonnes impression élèves impayés' : '';
      return normalize(`${option.textContent} ${groupFor(option.value).label}${keywords}`).includes(query);
    });
    const sections = groups.flatMap(group => {
      const entries = matches.filter(option => groupFor(option.value).id === group.id);
      if(!entries.length) return [];
      const section = document.createElement('section'); section.className = 'rp-library-group';
      const title = document.createElement('h3');
      title.id = `rpLibraryGroup-${group.id}`;
      title.textContent = group.label;
      section.setAttribute('aria-labelledby', title.id);
      if(group.id !== 'custom'){
        const count = document.createElement('span'); count.textContent = entries.length;
        count.setAttribute('aria-hidden','true'); title.append(count);
      }
      section.append(title,...entries.map(reportButton));
      return [section];
    });
    catalog.replaceChildren(...sections);
    if(!matches.length){ const empty = document.createElement('p'); empty.className = 'rp-empty'; empty.textContent = 'Aucun rapport ne correspond. Essayez un autre mot-clé.'; catalog.append(empty); }
    const readyCount = matches.filter(option => option.value !== 'custom').length;
    el('rpLibraryCount').textContent = `${readyCount} rapport${readyCount === 1 ? '' : 's'} prêt${readyCount === 1 ? '' : 's'} à l’emploi${matches.some(option => option.value === 'custom') ? ' + atelier personnalisé' : ''}`;
    syncSelection();
  }
  function syncSelection() {
    catalog.querySelectorAll('button').forEach(button => button.setAttribute('aria-current', String(button.dataset.report === select.value)));
    el('rpOutputTitle').textContent = clean(select.selectedOptions[0]?.textContent || 'Rapport');
    const intro = root.querySelector('.rp-heading p');
    if(intro) intro.textContent = select.value === 'custom'
      ? 'Définissez vos critères, choisissez la présentation, puis préparez votre impression.'
      : 'Consultez un rapport prêt à l’emploi ou composez votre propre analyse dans l’atelier personnalisé.';
    const outputEyebrow = root.querySelector('.rp-output-head .rp-eyebrow');
    if(outputEyebrow) outputEyebrow.textContent = select.value === 'custom' ? 'ATELIER PERSONNALISÉ' : 'RÉSULTATS';
    const isDaily = daily.has(select.value), isList = lists.has(select.value);
    if(select.value === 'collectionDG'){
      el('rpDateLabel').textContent = 'Date de référence';
      el('rpDateHelp').textContent = 'Historique de l’année scolaire complète, regroupé par mois de mouvement. La date de référence ne limite pas cette liste.';
      return;
    }
    el('rpDateLabel').textContent = isDaily ? 'Journée à consulter' : 'Date de référence';
    el('rpDateHelp').textContent = isDaily ? 'Appliquez la date pour consulter les mouvements de cette journée.' : isList ? 'Ce rapport utilise son périmètre propre. La période effective est précisée ci-dessous.' : 'Les rapports mensuels utilisent le mois de la date appliquée. Le périmètre effectif est précisé ci-dessous.';
  }
  catalog.addEventListener('click', event => {
    const button = event.target.closest('[data-report]');
    if(!button) return;
    if(!Array.from(select.options).some(option => option.value === button.dataset.report && !option.disabled && !option.hidden)) return;
    if(select.value === button.dataset.report) return;
    select.value = button.dataset.report;
    select.dispatchEvent(new Event('change', {bubbles:true}));
    syncSelection();
  });
  search.addEventListener('input',renderLibrary);
  search.addEventListener('keydown',event => {
    if(event.key === 'Escape'){search.value='';renderLibrary();}
    if(event.key === 'ArrowDown' || event.key === 'Enter'){
      const first = catalog.querySelector('[data-report]');
      if(first){ event.preventDefault(); first.focus(); if(event.key === 'Enter') first.click(); }
    }
  });
  catalog.addEventListener('keydown',event => {
    const buttons = Array.from(catalog.querySelectorAll('[data-report]'));
    const index = buttons.indexOf(event.target.closest('[data-report]'));
    if(index < 0) return;
    if(event.key === 'ArrowDown'){ event.preventDefault(); buttons[Math.min(index + 1, buttons.length - 1)].focus(); }
    if(event.key === 'ArrowUp'){ event.preventDefault(); if(index === 0) search.focus(); else buttons[index - 1].focus(); }
    if(event.key === 'Escape'){ event.preventDefault(); search.focus(); }
  });
  select.addEventListener('change',syncSelection);
  el('repDateSel').addEventListener('input', () => {
    root.classList.add('rp-date-pending');
    el('rpDateHelp').textContent = 'Date modifiée : appliquez-la pour mettre à jour les résultats. Le rapport affiché conserve la période confirmée.';
  });
  function clearDateDraft(){
    const parsed = normalizeLooseDateToISO(el('repDateSel').value || '');
    if(parsed && parsed === normalizeLooseDateToISO(reportConfirmedDateIso || '')){
      root.classList.remove('rp-date-pending'); syncSelection();
    }
  }
  el('repDateConfirm').addEventListener('click',clearDateDraft);
  el('repDateSel').addEventListener('keydown',event => { if(event.key === 'Enter') clearDateDraft(); });
  new MutationObserver(renderLibrary).observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden']});
  el('rpFocus').addEventListener('click', () => {
    const focused = root.classList.toggle('rp-focus');
    el('rpFocus').setAttribute('aria-pressed',String(focused));
    el('rpFocus').textContent = focused ? 'Afficher la bibliothèque ↙' : 'Agrandir le rapport ↗';
  });
  renderLibrary();
})();
