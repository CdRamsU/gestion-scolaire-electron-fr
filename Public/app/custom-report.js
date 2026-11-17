/* Custom report workshop. Existing local report APIs remain the financial source of truth. */
(() => {
  'use strict';
  const operators = { outstanding: 'Solde restant à payer', unpaid: 'Aucun paiement reçu', partial: 'Paiement partiel' };
  const columns = { matricule: 'Matricule', className: 'Classe', level: 'Niveau', due: 'Dû', paid: 'Payé', remaining: 'Reste à payer', matched: 'Conditions remplies' };
  const byId = id => document.getElementById(id);
  const escape = value => esc(String(value ?? ''));
  const presentation = () => window.CustomReportPresentation;
  const storageKey = () => `ecolepos_custom_reports_v1_${typeof currentUser !== 'undefined' ? currentUser?.username || 'user' : 'user'}`;
  let session = 0;

  function readSaved() {
    try {
      const items = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      return Array.isArray(items) ? items.filter(item => item && typeof item.name === 'string') : [];
    } catch (_) { return []; }
  }

  window.renderCustomReport = async () => {
    if (byId('customReportBuilder')) return;
    const host = byId('repSingleBody');
    if (!host) return;
    const token = ++session;
    host.innerHTML = '<div id="customReportBuilder"><p role="status">Chargement des frais et de l’année scolaire…</p></div>';
    const root = byId('customReportBuilder');
    const alive = () => token === session && root.isConnected;
    let options;
    try {
      options = await apiFetch('/api/reports/custom/options');
      if (!presentation()) throw new Error('Présentation indisponible.');
    } catch (_) {
      if (!alive()) return;
      root.innerHTML = '<div class="cr-empty"><h3>Le constructeur est indisponible</h3><p>Vérifiez la connexion au serveur local, puis réessayez.</p><button type="button" id="crRetry">Réessayer</button></div>';
      byId('crRetry').onclick = () => { host.replaceChildren(); window.renderCustomReport(); };
      return;
    }
    if (!alive()) return;
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(options.year, 8 + i, 1);
      return { value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
    });
    const defaultRule = () => ({ feeId: options.fees[0]?.id || '', month: options.fees[0]?.dueMonth || months[0].value, operator: 'outstanding' });
    let rules = [defaultRule()], result = null, revision = 0, busy = false, step = 'criteria';
    let prefs = presentation().normalizePreferences(), model = null, calculatedCriteria = '';
    const definition = () => ({ mode: byId('crMode').value, scope: byId('crScope').value, level: byId('crLevel').value, className: byId('crClass').value, rules: rules.map(rule => ({ ...rule })) });
    const message = text => { byId('crMessage').textContent = text; };
    const field = (label, id, values, extra = '') => `<div class="cr-field"><label for="${id}">${label}</label><select class="input" id="${id}" ${extra}>${values.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></div>`;

    root.innerHTML = `
      <header class="cr-welcome"><div><span class="cr-eyebrow">ATELIER DE RAPPORTS</span><h2>De la question au document.</h2><p>Choisissez les élèves à retrouver, organisez leurs données, puis préparez votre impression.</p></div><span class="cr-year">${options.year}–${options.year + 1}</span></header>
      <div class="cr-model-bar"><div><label for="crSaved">Mes modèles · ce navigateur</label><div class="cr-inline"><select id="crSaved" class="input"></select><button id="crLoad" type="button" disabled>Charger</button></div></div><div><label for="crName">Enregistrer les critères et la présentation</label><div class="cr-inline"><input id="crName" class="input" maxlength="80" placeholder="Ex. Minerval · décembre et février"><button id="crSave" type="button">Enregistrer</button></div></div></div>
      <nav class="cr-steps" aria-label="Étapes du rapport">
        <button type="button" data-step="criteria" aria-current="step"><b>01</b><span>Critères<small>Qui rechercher ?</small></span></button>
        <button type="button" data-step="display"><b>02</b><span>Présentation<small>Comment lire les résultats ?</small></span></button>
        <button type="button" data-step="print"><b>03</b><span>Impression<small>Comment diviser le document ?</small></span></button>
      </nav>
      <div id="crMessage" role="status" aria-live="polite"></div>
      <section id="crPanel-criteria" class="cr-panel" aria-label="Critères de recherche">
        <div class="cr-section-head"><div><h3>Choisir les élèves</h3><p>Le rapport porte sur l’année scolaire active.</p></div><span class="cr-label">1 à 6 conditions</span></div>
        <div class="cr-student-filters">${field('Dossiers', 'crScope', [['active','Actifs'],['inactive','Inactifs'],['all','Actifs et inactifs']])}<div class="cr-field"><label for="crLevel">Niveau</label><select id="crLevel" class="input"><option value="">Tous les niveaux</option>${[...new Set(options.placements.map(p => p.level).filter(Boolean))].map(level => `<option value="${escape(level)}">${escape(level)}</option>`).join('')}</select></div><div class="cr-field"><label for="crClass">Classe</label><select id="crClass" class="input"></select></div></div>
        <div class="cr-section-head cr-condition-head"><div><h3>Composer les conditions</h3><p>Un frais, un mois, une situation. Ajoutez une ligne pour croiser les critères.</p></div>${field('L’élève doit remplir', 'crMode', [['all','Toutes les conditions (ET)'],['any','Au moins une condition (OU)']])}</div>
        <div id="crRules"></div><button type="button" id="crAdd">＋ Ajouter une condition</button>
        <p class="cr-help">Pour décembre et février, utilisez deux conditions et choisissez « Toutes ». Seuls les frais réellement dus sont pris en compte. Un mois à venir ne signifie pas un retard.</p>
        <div class="cr-query"><span class="cr-eyebrow">VOTRE RECHERCHE</span><p id="crPreview"></p></div>
        <div class="cr-run"><span id="crRunHint">Les soldes sont calculés depuis les données locales.</span><button type="button" id="crRun" class="cr-primary" ${options.fees.length ? '' : 'disabled'}>Afficher les élèves →</button></div>
      </section>
      <section id="crPanel-display" class="cr-panel" aria-label="Présentation des résultats" hidden>
        <div class="cr-section-head"><div><h3>Votre rapport, à votre façon</h3><p>La présentation change instantanément, sans recalculer les soldes.</p></div><button type="button" data-step="criteria">Modifier les critères</button></div>
        <div class="cr-layouts" role="group" aria-label="Disposition des résultats">
          <button type="button" data-layout="table"><span class="cr-layout-icon" aria-hidden="true">▤</span><strong>Tableau</strong><small>Comparer les élèves</small></button>
          <button type="button" data-layout="cards"><span class="cr-layout-icon" aria-hidden="true">▦</span><strong>Fiches</strong><small>Lire un dossier à la fois</small></button>
          <button type="button" data-layout="summary"><span class="cr-layout-icon" aria-hidden="true">≡</span><strong>Synthèse</strong><small>Voir les totaux par groupe</small></button>
        </div>
        <div class="cr-display-controls"><div class="cr-field cr-search"><label for="crSearch">Rechercher dans les résultats</label><input type="search" class="input" id="crSearch" placeholder="Nom, matricule, classe…"></div>${field('Regrouper par', 'crGroup', [['none','Aucun regroupement'],['class','Classe'],['level','Niveau']])}${field('Trier les élèves', 'crSort', [['name','Nom de l’élève'],['class','Classe, puis nom']])}</div>
        <details class="cr-column-settings"><summary>Colonnes et détails <span id="crColumnCount"></span></summary><div class="cr-columns">${Object.entries(columns).map(([key, label]) => `<label><input type="checkbox" data-column="${key}"> ${label}</label>`).join('')}</div><label class="cr-check"><input type="checkbox" id="crDetails"> Afficher le détail de chaque condition (frais, mois, dû, payé, reste)</label><p class="cr-help">Le nom de l’élève reste visible. La synthèse affiche les totaux par devise ; ses colonnes sont fixes.</p></details>
        <div class="cr-results-head"><div><h3>Résultats <span id="crCount" class="cr-label">À calculer</span></h3><p id="crResultMeta"></p></div><div class="cr-inline"><button type="button" id="crExport" disabled>Exporter CSV</button><button type="button" id="crToPrint" class="cr-primary" data-step="print">Préparer l’impression →</button></div></div>
        <div id="crResultTotals"></div><p id="crFinancialNote" class="cr-help" hidden>Montants des frais et mois sélectionnés, toutes conditions incluses. Une même échéance n’est comptée qu’une fois. Les devises restent séparées.</p><div id="crResults"></div>
      </section>
      <section id="crPanel-print" class="cr-panel" aria-label="Préparation de l’impression" hidden>
        <div class="cr-section-head"><div><h3>Un document prêt à distribuer</h3><p>La disposition, les colonnes et la recherche de l’étape 02 sont conservées.</p></div><button type="button" data-step="display">Ajuster la présentation</button></div>
        <div class="cr-print-grid"><div class="cr-print-settings">
          <div class="cr-field"><label for="crTitle">Titre du document</label><input id="crTitle" class="input" maxlength="120" placeholder="Rapport personnalisé"></div>
          ${field('Orientation A4', 'crOrientation', [['portrait','Portrait'],['landscape','Paysage']])}
          ${field('Diviser l’impression', 'crBreak', [['none','Document continu'],['group','Nouvelle page par groupe'],['student','Nouvelle page par élève']])}
          <p id="crBreakHelp" class="cr-help"></p>
          ${field('Densité du document', 'crDensity', [['comfortable','Confortable'],['compact','Compacte']])}
          <label class="cr-check"><input type="checkbox" id="crPrintCriteria"> Inclure les critères de recherche</label>
          <label class="cr-check"><input type="checkbox" id="crPrintTotals"> Inclure les totaux du rapport</label>
          <div class="cr-print-recap" id="crPrintRecap"></div>
          <button type="button" id="crPrint" class="cr-primary" disabled>Imprimer / PDF</button>
          <p class="cr-help">L’aperçu montre les sections. La pagination finale dépend des marges de l’imprimante. Choisissez « Enregistrer en PDF » dans la fenêtre d’impression.</p>
        </div><div class="cr-preview-wrap"><div class="cr-preview-head"><strong>Aperçu du document</strong><span id="crPaperLabel">A4 · Portrait</span></div><div id="crPrintEmpty" class="cr-empty"></div><iframe id="crPrintFrame" title="Aperçu du rapport à imprimer" hidden></iframe></div></div>
      </section>`;

    function selectStep(next, focus = false) {
      step = next;
      root.querySelectorAll('[id^="crPanel-"]').forEach(panel => { panel.hidden = panel.id !== `crPanel-${step}`; });
      root.querySelectorAll('.cr-steps [data-step]').forEach(button => {
        if (button.dataset.step === step) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      if (step === 'print') renderPrint();
      if (focus) root.querySelector(`.cr-steps [data-step="${step}"]`).focus();
    }
    function renderClasses() {
      const level = byId('crLevel').value;
      byId('crClass').innerHTML = '<option value="">Toutes les classes</option>' + [...new Set(options.placements.filter(p => !level || p.level === level).map(p => p.className).filter(Boolean))].map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
    }
    function savedOptions(selected = '') {
      byId('crSaved').innerHTML = '<option value="">Choisir un modèle…</option>' + readSaved().map((item, i) => `<option value="${i}">${escape(item.name)}</option>`).join('');
      byId('crSaved').value = selected;
      byId('crLoad').disabled = selected === '';
    }
    function previewCriteria() {
      byId('crPreview').textContent = `Élèves ${byId('crScope').selectedOptions[0].textContent.toLowerCase()}${byId('crLevel').value ? ' · ' + byId('crLevel').value : ''}${byId('crClass').value ? ' · ' + byId('crClass').value : ''} : ` + rules.map(r => `${options.fees.find(f => f.id === r.feeId)?.label || 'Frais indisponible'} / ${months.find(m => m.value === r.month)?.label || r.month} / ${operators[r.operator]}`).join(byId('crMode').value === 'all' ? ' ET ' : ' OU ');
    }
    function invalidate() {
      revision++;
      result = null;
      model = null;
      previewCriteria();
      renderResult();
      // Remove an old document as soon as criteria change; it must never remain printable.
      byId('crPrintFrame').removeAttribute('srcdoc');
      byId('crPrint').disabled = true;
      if (step === 'print') renderPrint();
      message(options.fees.length ? 'Critères prêts. Affichez les élèves pour calculer le rapport.' : 'Aucun frais disponible pour cette année scolaire. Configurez les frais avant de créer un rapport.');
    }
    function renderRules() {
      byId('crRules').innerHTML = rules.map((rule, i) => {
        const fee = options.fees.find(f => f.id === rule.feeId);
        const fixed = fee?.cycle !== 'monthly' && fee?.dueMonth;
        return `<div class="cr-rule" data-rule="${i}"><span class="cr-rule-number">${i + 1}</span><div><label for="crFee${i}">Frais</label><select id="crFee${i}" data-rule-field="feeId" class="input">${options.fees.map(f => `<option value="${escape(f.id)}" ${f.id === rule.feeId ? 'selected' : ''}>${escape(f.label)}</option>`).join('')}</select></div><div><label for="crMonth${i}">${fixed ? 'Échéance configurée' : 'Mois concerné'}</label><select id="crMonth${i}" data-rule-field="month" class="input" ${fixed ? 'disabled' : ''}>${months.map(m => `<option value="${m.value}" ${m.value === rule.month ? 'selected' : ''}>${escape(m.label)}</option>`).join('')}</select></div><div><label for="crOp${i}">Situation</label><select id="crOp${i}" data-rule-field="operator" class="input">${Object.entries(operators).map(([value, label]) => `<option value="${value}" ${value === rule.operator ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="cr-rule-actions"><button type="button" data-duplicate="${i}" title="Dupliquer cette condition" aria-label="Dupliquer la condition ${i + 1}" ${rules.length >= 6 ? 'disabled' : ''}>＋</button><button type="button" data-remove="${i}" title="Retirer cette condition" aria-label="Retirer la condition ${i + 1}" ${rules.length === 1 ? 'disabled' : ''}>×</button></div></div>`;
      }).join('');
      byId('crAdd').disabled = rules.length >= 6 || !options.fees.length;
    }
    function syncPreferences() {
      root.querySelectorAll('[data-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layout === prefs.layout)));
      byId('crGroup').value = prefs.groupBy;
      byId('crSort').value = prefs.sortBy;
      byId('crSearch').value = prefs.search;
      root.querySelectorAll('[data-column]').forEach(input => { input.checked = prefs.columns.includes(input.dataset.column); });
      byId('crColumnCount').textContent = `${prefs.columns.length + 1} colonnes`;
      byId('crDetails').checked = prefs.showDetails;
      byId('crOrientation').value = prefs.printOrientation;
      byId('crBreak').value = prefs.printBreak;
      byId('crDensity').value = prefs.printDensity;
      byId('crPrintCriteria').checked = prefs.printCriteria;
      byId('crPrintTotals').checked = prefs.printTotals;
    }
    function updatePreferences(changes) {
      prefs = presentation().normalizePreferences({ ...prefs, ...changes });
      syncPreferences();
      renderResult();
      if (step === 'print') renderPrint();
    }
    function renderResult() {
      const empty = '<div class="cr-empty"><span class="cr-empty-icon" aria-hidden="true">▤</span><h3>Votre rapport prend forme</h3><p>Choisissez vos critères à l’étape 01, puis cliquez sur « Afficher les élèves ».<br>Vous pouvez déjà préparer la présentation et l’impression.</p><button type="button" data-step="criteria">Choisir les critères →</button></div>';
      if (!result) {
        byId('crResults').innerHTML = empty;
        byId('crResultTotals').replaceChildren();
        byId('crCount').textContent = 'À calculer';
        byId('crResultMeta').textContent = '';
        byId('crFinancialNote').hidden = true;
        byId('crExport').disabled = true;
        return;
      }
      model = presentation().prepare(result.rows, prefs);
      byId('crCount').textContent = `${model.filteredCount} / ${model.totalCount} élèves`;
      byId('crResultMeta').textContent = `${result.examined} dossiers examinés · Calculé le ${new Date(result.generatedAt).toLocaleString('fr-FR')}${prefs.search ? ' · Recherche appliquée aussi au CSV et à l’impression' : ''}`;
      byId('crResultTotals').innerHTML = model.totals.map(total => `<div class="cr-total"><span>Reste à payer · ${escape(total.currency)}</span><strong>${total.remaining === null ? 'Indisponible' : Number(total.remaining).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} <small>${escape(total.currency)}</small></strong></div>`).join('');
      byId('crFinancialNote').hidden = !model.filteredCount;
      byId('crResults').innerHTML = model.filteredCount ? presentation().render(model, prefs, { interactive: true }) : `<div class="cr-empty"><h3>${result.rows.length ? 'Aucun résultat pour cette recherche' : 'Aucun élève ne correspond'}</h3><p>${result.rows.length ? 'Effacez le texte de recherche pour retrouver tous les élèves du rapport.' : 'Modifiez les conditions ou essayez « Au moins une condition ».'}</p><button type="button" ${result.rows.length ? 'id="crClearSearch"' : 'data-step="criteria"'}>${result.rows.length ? 'Effacer la recherche' : 'Modifier les critères'}</button></div>`;
      if (byId('crClearSearch')) byId('crClearSearch').onclick = () => updatePreferences({ search: '' });
      byId('crExport').disabled = !model.filteredCount;
    }
    function printMeta() {
      return { title: byId('crTitle').value.trim() || 'Rapport personnalisé', schoolName: window.ecoleConfiguration?.['school.name'] || '', criteria: calculatedCriteria, generatedAt: result?.generatedAt };
    }
    function renderPrint() {
      const frame = byId('crPrintFrame');
      byId('crPaperLabel').textContent = `A4 · ${prefs.printOrientation === 'portrait' ? 'Portrait' : 'Paysage'}`;
      byId('crBreakHelp').textContent = prefs.printBreak === 'group'
        ? prefs.groupBy === 'none' ? 'Choisissez un regroupement par classe ou niveau à l’étape 02 pour séparer les groupes.' : 'Chaque groupe commence sur une nouvelle page, puis continue si nécessaire.'
        : prefs.printBreak === 'student' ? 'Chaque élève commence sur une nouvelle page : identité et détail de toutes les conditions. Cette fiche individuelle remplace la disposition et les colonnes choisies.' : 'Les sections se suivent, sans saut de page imposé entre elles.';
      const invalidGroup = prefs.printBreak === 'group' && prefs.groupBy === 'none';
      const ready = Boolean(result && model?.filteredCount && !invalidGroup);
      byId('crPrint').disabled = true;
      frame.hidden = !ready;
      byId('crPrintEmpty').hidden = ready;
      byId('crPrintEmpty').textContent = invalidGroup ? 'Choisissez un regroupement à l’étape Présentation ou utilisez le document continu.' : result ? 'Aucun élève à imprimer dans la sélection actuelle.' : 'Calculez d’abord le rapport à l’étape Critères pour afficher le document.';
      byId('crPrintRecap').textContent = ready ? `${model.filteredCount} élève${model.filteredCount > 1 ? 's' : ''} · ${prefs.groupBy === 'none' ? 'Sans regroupement' : `${model.groups.length} groupe(s)`}${prefs.search ? ` · Recherche : « ${prefs.search} »` : ''}` : 'Document en attente';
      if (!ready) { frame.removeAttribute('srcdoc'); return; }
      frame.onload = () => { if (alive() && result && !frame.hidden) byId('crPrint').disabled = false; };
      frame.srcdoc = presentation().printDocument(result, prefs, printMeta());
    }

    root.addEventListener('click', event => {
      const next = event.target.closest('[data-step]');
      if (next) selectStep(next.dataset.step, !next.closest('.cr-steps'));
      const layout = event.target.closest('[data-layout]');
      if (layout) updatePreferences({ layout: layout.dataset.layout });
      const student = event.target.closest('[data-student]');
      if (student && typeof loadStudentProfile === 'function') loadStudentProfile(student.dataset.student);
    });
    root.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !busy) {
        event.preventDefault(); byId('crRun').click();
      }
    });
    byId('crRules').addEventListener('change', event => {
      const fieldName = event.target.dataset.ruleField;
      if (!fieldName) return;
      const rule = rules[Number(event.target.closest('[data-rule]').dataset.rule)];
      rule[fieldName] = event.target.value;
      if (fieldName === 'feeId') {
        const fee = options.fees.find(f => f.id === rule.feeId);
        if (fee?.dueMonth && fee.cycle !== 'monthly') rule.month = fee.dueMonth;
        renderRules();
      }
      invalidate();
    });
    byId('crRules').addEventListener('click', event => {
      const remove = event.target.closest('[data-remove]'), duplicate = event.target.closest('[data-duplicate]');
      if (remove && rules.length > 1) rules.splice(Number(remove.dataset.remove), 1);
      else if (duplicate && rules.length < 6) rules.splice(Number(duplicate.dataset.duplicate) + 1, 0, { ...rules[Number(duplicate.dataset.duplicate)] });
      else return;
      renderRules(); invalidate();
    });
    byId('crAdd').onclick = () => { if (rules.length < 6 && options.fees.length) { rules.push(defaultRule()); renderRules(); invalidate(); byId(`crFee${rules.length - 1}`).focus(); } };
    ['crScope', 'crLevel', 'crClass', 'crMode'].forEach(id => { byId(id).onchange = () => { if (id === 'crLevel') renderClasses(); invalidate(); }; });
    byId('crSaved').onchange = () => { byId('crLoad').disabled = byId('crSaved').value === ''; };
    byId('crSave').onclick = () => {
      const name = byId('crName').value.trim();
      if (!name) { message('Donnez un nom à votre modèle avant de l’enregistrer.'); byId('crName').focus(); return; }
      try {
        // Saving an existing name updates that template. Prior v1 definitions remain readable.
        const items = readSaved(), index = items.findIndex(item => item.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
        const item = { name, definition: definition(), presentation: { ...prefs, search: '' }, title: byId('crTitle').value.trim() };
        if (index >= 0) items[index] = item; else items.push(item);
        const kept = items.slice(-30);
        localStorage.setItem(storageKey(), JSON.stringify(kept));
        savedOptions(String(kept.indexOf(item)));
        message(`Modèle ${index >= 0 ? 'mis à jour' : 'enregistré'} : critères, disposition, colonnes et impression. Les résultats sont recalculés à chaque utilisation.`);
      } catch (_) { message('Ce navigateur ne permet pas l’enregistrement local.'); }
    };
    byId('crLoad').onclick = () => {
      const item = readSaved()[Number(byId('crSaved').value)];
      if (byId('crSaved').value === '' || !item) return;
      const d = item.definition;
      const valid = d && ['active','inactive','all'].includes(d.scope) && ['all','any'].includes(d.mode) && Array.isArray(d.rules) && d.rules.length >= 1 && d.rules.length <= 6 && d.rules.every(rule => {
        if (!rule || typeof rule !== 'object') return false;
        const fee = options.fees.find(f => f.id === rule.feeId);
        return fee && months.some(m => m.value === rule.month) && Object.hasOwn(operators, rule.operator) && !(fee.cycle !== 'monthly' && fee.dueMonth && fee.dueMonth !== rule.month);
      }) && (!d.level || options.placements.some(p => p.level === d.level)) && (!d.className || options.placements.some(p => p.className === d.className && (!d.level || p.level === d.level)));
      if (!valid) { message('Ce modèle contient des frais, des classes ou des mois indisponibles dans l’année active. Recréez ses conditions.'); return; }
      byId('crScope').value = d.scope; byId('crLevel').value = d.level || ''; renderClasses(); byId('crClass').value = d.className || ''; byId('crMode').value = d.mode;
      rules = d.rules.map(rule => ({ feeId: rule.feeId, month: rule.month, operator: rule.operator }));
      prefs = presentation().normalizePreferences(item.presentation);
      byId('crName').value = item.name; byId('crTitle').value = typeof item.title === 'string' ? item.title.slice(0, 120) : '';
      renderRules(); syncPreferences(); invalidate(); selectStep('criteria');
      message('Modèle chargé. Vérifiez les conditions puis affichez les élèves.');
    };
    byId('crRun').onclick = async () => {
      if (busy || !options.fees.length) return;
      busy = true;
      const version = revision, request = definition(), criteria = byId('crPreview').textContent;
      const button = byId('crRun');
      button.disabled = true; button.textContent = 'Analyse en cours…';
      root.setAttribute('aria-busy', 'true'); message('Analyse des dossiers locaux en cours…');
      try {
        const data = await apiFetch('/api/reports/custom?definition=' + encodeURIComponent(JSON.stringify(request)));
        if (!alive() || version !== revision) return;
        result = data; calculatedCriteria = criteria;
        renderResult(); selectStep('display', true);
        message('Rapport calculé. Changez de vue ou préparez le document. Aucun dossier n’a été modifié.');
      } catch (error) {
        if (alive() && version === revision) { result = null; model = null; renderResult(); renderPrint(); message(error.message || 'Calcul impossible. Réessayez.'); }
      } finally {
        busy = false;
        if (alive()) { button.disabled = !options.fees.length; button.textContent = 'Afficher les élèves →'; root.removeAttribute('aria-busy'); }
      }
    };
    byId('crSearch').oninput = () => updatePreferences({ search: byId('crSearch').value });
    byId('crGroup').onchange = () => updatePreferences({ groupBy: byId('crGroup').value });
    byId('crSort').onchange = () => updatePreferences({ sortBy: byId('crSort').value });
    root.querySelectorAll('[data-column]').forEach(input => { input.onchange = () => updatePreferences({ columns: Array.from(root.querySelectorAll('[data-column]:checked')).map(el => el.dataset.column) }); });
    byId('crDetails').onchange = () => updatePreferences({ showDetails: byId('crDetails').checked });
    for (const [id, key] of Object.entries({ crOrientation: 'printOrientation', crBreak: 'printBreak', crDensity: 'printDensity', crPrintCriteria: 'printCriteria', crPrintTotals: 'printTotals' })) {
      byId(id).onchange = () => updatePreferences({ [key]: byId(id).type === 'checkbox' ? byId(id).checked : byId(id).value });
    }
    byId('crTitle').oninput = renderPrint;
    byId('crPrint').onclick = () => {
      if (!result || !model?.filteredCount || byId('crPrintFrame').hidden) return;
      const target = byId('crPrintFrame').contentWindow;
      try { target.focus(); target.print(); } catch (_) { message('La fenêtre d’impression n’a pas pu s’ouvrir. Réessayez depuis l’aperçu.'); }
    };
    byId('crExport').onclick = () => {
      if (!result || !model?.filteredCount) return;
      // CSV exports each obligation once, while preserving all matching criteria in text columns.
      const rows = presentation().csvRows(model);
      const quote = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      const blob = new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'rapport-personnalise.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message(`CSV exporté : ${model.filteredCount} élèves, une ligne par élève, frais et mois. Les conditions identiques sont regroupées. Les colonnes du document n’affectent pas cet export détaillé.`);
    };
    renderClasses(); renderRules(); savedOptions(); syncPreferences(); invalidate();
  };
  if (typeof repType !== 'undefined' && repType.value === 'custom') window.renderCustomReport();
})();
