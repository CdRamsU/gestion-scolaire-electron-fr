(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CustomReportPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLUMN_LABELS = Object.freeze({
    matricule: 'Matricule', className: 'Classe', level: 'Niveau',
    due: 'Dû', paid: 'Payé', remaining: 'Reste à payer', matched: 'Conditions remplies'
  });
  const DEFAULT_COLUMNS = Object.freeze(['matricule', 'className', 'remaining', 'matched']);
  const OPERATORS = { outstanding: 'Solde restant', unpaid: 'Aucun paiement', partial: 'Paiement partiel' };
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
  const money = (value, currency) => `${value === null ? 'Indisponible' : Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;

  function normalizePreferences(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    return {
      layout: ['table', 'cards', 'summary'].includes(input.layout) ? input.layout : 'table',
      groupBy: ['none', 'level', 'class'].includes(input.groupBy) ? input.groupBy : 'none',
      sortBy: ['name', 'class'].includes(input.sortBy) ? input.sortBy : 'name',
      search: typeof input.search === 'string' ? input.search.slice(0, 200) : '',
      columns: Array.isArray(input.columns) ? [...new Set(input.columns.filter(key => typeof key === 'string' && Object.hasOwn(COLUMN_LABELS, key)))] : [...DEFAULT_COLUMNS],
      showDetails: typeof input.showDetails === 'boolean' ? input.showDetails : input.layout === 'cards',
      printOrientation: input.printOrientation === 'landscape' ? 'landscape' : 'portrait',
      printBreak: ['none', 'group', 'student'].includes(input.printBreak) ? input.printBreak : 'none',
      printDensity: input.printDensity === 'compact' ? 'compact' : 'comfortable',
      printTotals: input.printTotals !== false,
      printCriteria: input.printCriteria !== false
    };
  }

  function totalConditions(conditions) {
    const totals = new Map(), seen = new Set();
    for (const [index, condition] of conditions.entries()) {
      // Operators may repeat an obligation. Its balance must only be counted once.
      const key = condition.feeId === undefined || condition.feeId === null ? `missing:${index}` : JSON.stringify([String(condition.feeId), condition.month]);
      if (seen.has(key)) continue;
      seen.add(key);
      const currency = String(condition.currency || 'Devise inconnue');
      if (!totals.has(currency)) totals.set(currency, { currency, due: 0, paid: 0, remaining: 0 });
      const bucket = totals.get(currency);
      for (const field of ['due', 'paid', 'remaining']) {
        const value = number(condition[field]);
        bucket[field] = value === null || bucket[field] === null ? null : round(bucket[field] + value);
      }
    }
    return [...totals.values()].sort((a, b) => collator.compare(a.currency, b.currency));
  }

  function sumRows(rows) {
    const totals = new Map();
    for (const row of rows) for (const total of row.totals) {
      if (!totals.has(total.currency)) totals.set(total.currency, { currency: total.currency, due: 0, paid: 0, remaining: 0 });
      const bucket = totals.get(total.currency);
      for (const field of ['due', 'paid', 'remaining']) bucket[field] = total[field] === null || bucket[field] === null ? null : round(bucket[field] + total[field]);
    }
    return [...totals.values()].sort((a, b) => collator.compare(a.currency, b.currency));
  }

  function prepare(input, preferences = {}) {
    const prefs = normalizePreferences(preferences), source = Array.isArray(input) ? input : [];
    const query = fold(prefs.search).split(/\s+/).filter(Boolean);
    const rows = source.filter(row => {
      const haystack = fold([row.name, row.matricule, row.className, row.level].join(' '));
      return query.every(term => haystack.includes(term));
    }).map(row => {
      const conditions = Array.isArray(row.conditions) ? row.conditions.map(condition => ({ ...condition })) : [];
      return { ...row, conditions, totals: totalConditions(conditions), matchedCount: conditions.filter(condition => condition.matched).length };
    }).sort((a, b) => (prefs.sortBy === 'class' ? collator.compare(a.className || '', b.className || '') : 0) || collator.compare(a.name || '', b.name || '') || collator.compare(String(a.id), String(b.id)));
    const groups = new Map();
    for (const row of rows) {
      // A class name can exist in several levels: never merge those classes.
      const key = prefs.groupBy === 'class' ? JSON.stringify([row.level || '', row.className || '']) : prefs.groupBy === 'level' ? String(row.level || '') : 'all';
      const label = prefs.groupBy === 'class' ? [row.className || 'Classe non renseignée', row.level].filter(Boolean).join(' · ') : prefs.groupBy === 'level' ? row.level || 'Niveau non renseigné' : 'Tous les élèves';
      if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
      groups.get(key).rows.push(row);
    }
    const preparedGroups = [...groups.values()].map(group => ({ ...group, count: group.rows.length, totals: sumRows(group.rows) }));
    if (prefs.groupBy !== 'none') preparedGroups.sort((a, b) => collator.compare(a.label, b.label));
    return { rows, groups: preparedGroups, totals: sumRows(rows), totalCount: source.length, filteredCount: rows.length, preferences: prefs };
  }

  const moneyList = (totals, field) => totals.length ? totals.map(total => `<span class="crp-money">${escape(money(total[field], total.currency))}</span>`).join('') : '<span class="crp-muted">—</span>';

  function totalsHtml(totals, title = 'Totaux des frais et périodes sélectionnés') {
    if (!totals.length) return '';
    return `<div class="crp-totals"><h4>${escape(title)}</h4>${totals.map(total => `<div class="crp-total-currency"><strong>${escape(total.currency)}</strong><dl>${['due', 'paid', 'remaining'].map(field => `<div><dt>${COLUMN_LABELS[field]}</dt><dd>${escape(money(total[field], total.currency))}</dd></div>`).join('')}</dl></div>`).join('')}<p class="crp-muted">Chaque frais et période est compté une seule fois par élève. Les devises restent séparées.</p></div>`;
  }

  function conditionsHtml(row) {
    return `<div class="crp-conditions">${row.conditions.map((condition, index) => `<div class="crp-condition"><div><strong>${index + 1}. ${escape(condition.feeLabel || 'Frais')}</strong><span>${escape(condition.month || '—')} · ${escape(OPERATORS[condition.operator] || condition.operator || 'Condition')}</span><span class="crp-match ${condition.matched ? 'is-match' : ''}">${condition.matched ? 'Correspond' : 'Ne correspond pas'}</span></div><dl>${['due', 'paid', 'remaining'].map(field => `<div><dt>${COLUMN_LABELS[field]}</dt><dd>${escape(money(number(condition[field]), condition.currency || 'Devise inconnue'))}</dd></div>`).join('')}</dl></div>`).join('')}</div>`;
  }

  function nameHtml(row, interactive) {
    return interactive ? `<button type="button" class="crp-student-link" data-student="${escape(row.id)}" title="Ouvrir la fiche de ${escape(row.name)}">${escape(row.name || 'Sans nom')} <span aria-hidden="true">↗</span></button>` : `<strong>${escape(row.name || 'Sans nom')}</strong>`;
  }

  function cellHtml(row, key) {
    if (['due', 'paid', 'remaining'].includes(key)) return moneyList(row.totals, key);
    if (key === 'matched') return `<span class="crp-match${row.matchedCount === row.conditions.length ? ' is-match' : ''}">${row.matchedCount} / ${row.conditions.length}</span>`;
    return escape(row[key] || '—');
  }

  function tableHtml(rows, prefs, interactive) {
    return `<div class="crp-table-wrap"><table class="crp-table"><thead><tr><th scope="col">Élève</th>${prefs.columns.map(key => `<th scope="col"${['due', 'paid', 'remaining'].includes(key) ? ' class="crp-numeric"' : ''}>${COLUMN_LABELS[key]}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${nameHtml(row, interactive)}</th>${prefs.columns.map(key => `<td${['due', 'paid', 'remaining'].includes(key) ? ' class="crp-numeric"' : ''}>${cellHtml(row, key)}</td>`).join('')}</tr>${prefs.showDetails && row.conditions.length ? `<tr class="crp-detail-row"><td colspan="${prefs.columns.length + 1}">${interactive ? `<details class="crp-row-details"><summary>Voir les ${row.conditions.length} conditions de ${escape(row.name)}</summary>${conditionsHtml(row)}</details>` : conditionsHtml(row)}</td></tr>` : ''}`).join('')}</tbody></table></div>`;
  }

  function cardsHtml(rows, prefs, interactive) {
    return `<div class="crp-cards">${rows.map(row => `<article class="crp-student-card"><h4>${nameHtml(row, interactive)}</h4><dl class="crp-card-fields">${prefs.columns.map(key => `<div><dt>${COLUMN_LABELS[key]}</dt><dd>${cellHtml(row, key)}</dd></div>`).join('')}</dl>${prefs.showDetails ? (interactive ? `<details class="crp-row-details"><summary>Voir les ${row.conditions.length} conditions</summary>${conditionsHtml(row)}</details>` : conditionsHtml(row)) : ''}</article>`).join('')}</div>`;
  }

  function groupContent(group, prefs, interactive) {
    if (prefs.layout === 'summary') return `<div class="crp-group-summary"><p><strong>${group.count}</strong> élève${group.count === 1 ? '' : 's'}</p>${interactive || prefs.printTotals ? totalsHtml(group.totals) : ''}${interactive ? `<details class="crp-row-details"><summary>Voir les élèves du groupe</summary>${tableHtml(group.rows, prefs, true)}</details>` : ''}</div>`;
    return prefs.layout === 'cards' ? cardsHtml(group.rows, prefs, interactive) : tableHtml(group.rows, prefs, interactive);
  }

  function render(model, preferences, options = {}) {
    const prefs = normalizePreferences(preferences || model.preferences), interactive = options.interactive !== false;
    if (!model.rows.length) return '<div class="cr-empty crp-empty">Aucun élève à afficher. Ajustez la recherche ou les conditions du rapport.</div>';
    return `<div class="crp-presentation crp-layout-${prefs.layout}">${model.groups.map(group => `<section class="crp-group">${prefs.groupBy !== 'none' ? `<header class="crp-group-head"><h4>${escape(group.label)}</h4><span>${group.count} élève${group.count === 1 ? '' : 's'}</span></header>` : ''}${groupContent(group, prefs, interactive)}</section>`).join('')}</div>`;
  }

  function csvRows(model) {
    const output = [['Élève', 'Matricule', 'Classe', 'Niveau', 'Frais', 'Mois', 'Conditions', 'Correspond', 'Dû', 'Payé', 'Reste', 'Devise']];
    for (const row of model.rows) {
      const obligations = new Map();
      row.conditions.forEach((condition, index) => {
        const key = condition.feeId === undefined || condition.feeId === null ? `missing:${index}` : JSON.stringify([String(condition.feeId), condition.month]);
        if (!obligations.has(key)) obligations.set(key, { condition, criteria: [] });
        obligations.get(key).criteria.push({ index: index + 1, condition });
      });
      for (const { condition, criteria } of obligations.values()) {
        output.push([
          row.name, row.matricule, row.className, row.level, condition.feeLabel, condition.month,
          criteria.map(item => `${item.index}. ${OPERATORS[item.condition.operator] || item.condition.operator || 'Condition'}`).join(' | '),
          criteria.map(item => `${item.index}. ${item.condition.matched ? 'Oui' : 'Non'}`).join(' | '),
          number(condition.due), number(condition.paid), number(condition.remaining), condition.currency
        ]);
      }
    }
    return output;
  }

  function printDocument(result, preferences = {}, meta = {}) {
    const prefs = normalizePreferences(preferences), model = prepare(result?.rows || [], prefs);
    const title = String(meta.title || 'Rapport personnalisé');
    const date = new Date(meta.generatedAt || result?.generatedAt || '');
    const generatedAt = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR');
    const criteria = prefs.printCriteria ? (Array.isArray(meta.criteria) ? meta.criteria.join(' · ') : meta.criteria || '') : '';
    const header = (count = model.filteredCount, scope = '') => `<header class="crp-print-header">${meta.schoolName ? `<p class="crp-school">${escape(meta.schoolName)}</p>` : ''}<h1>${escape(title)}</h1>${criteria ? `<p>${escape(criteria)}</p>` : ''}<p class="crp-muted">${count} élève${count === 1 ? '' : 's'}${scope ? ` · ${escape(scope)}` : ''}${generatedAt ? ` · Calculé le ${escape(generatedAt)}` : ''}${prefs.search ? ` · Recherche : ${escape(prefs.search)}` : ''}</p></header>`;
    let sections;
    if (prefs.printBreak === 'student') {
      sections = model.rows.map(row => `<section class="crp-print-section crp-print-student">${header(1, 'Fiche individuelle')}<h2>${escape(row.name || 'Sans nom')}</h2><p>${escape([row.matricule || 'Sans matricule', row.className || 'Sans classe', row.level].filter(Boolean).join(' · '))}</p>${conditionsHtml(row)}${prefs.printTotals ? totalsHtml(row.totals, 'Total de cet élève sur les frais sélectionnés') : ''}</section>`).join('');
    } else if (prefs.printBreak === 'group') {
      sections = model.groups.map(group => `<section class="crp-print-section">${header(group.count, 'Dans ce groupe')}<h2>${escape(group.label)}</h2>${groupContent(group, prefs, false)}${prefs.printTotals && prefs.layout !== 'summary' ? totalsHtml(group.totals, 'Total de ce groupe') : ''}</section>`).join('');
    } else {
      sections = `<section class="crp-print-section">${header()}${render(model, prefs, { interactive: false })}${prefs.printTotals && prefs.layout !== 'summary' ? totalsHtml(model.totals) : ''}</section>`;
    }
    if (!model.rows.length) sections = `<section class="crp-print-section">${header()}<p>Aucun élève à afficher.</p></section>`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>
      @page { size: A4 ${prefs.printOrientation}; margin: 14mm 12mm; }
      * { box-sizing: border-box; } html { color-scheme: light; } body { margin: 0; color: #172b43; background: #fff; font: ${prefs.printDensity === 'compact' ? '10' : '11.5'}pt/1.4 Arial, sans-serif; }
      h1 { font-size: 21pt; margin: 4px 0 8px; } h2 { font-size: 15pt; margin: 18px 0 10px; } h4 { font-size: 12pt; margin: 0 0 8px; } p { margin: 6px 0; } small { font-size: .8em; font-weight: 400; }
      .crp-school { font-weight: 700; color: #315b83; } .crp-print-header { border-bottom: 2px solid #315b83; margin-bottom: 16px; padding-bottom: 12px; } .crp-muted { color: #566779; font-size: .9em; } .crp-print-section + .crp-print-section { break-before: page; page-break-before: always; }
      .crp-group { margin: 0 0 20px; } .crp-group-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 1px solid #c6d3df; padding-bottom: 6px; margin-bottom: 8px; break-after: avoid; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: inherit; } thead { display: table-header-group; } th, td { padding: ${prefs.printDensity === 'compact' ? '5px 6px' : '9px 8px'}; border-bottom: 1px solid #d2dae3; text-align: left; vertical-align: top; overflow-wrap: anywhere; } thead th { background: #edf2f7; color: #284d70; font-size: .88em; } tbody th { font-weight: 400; } tr { break-inside: avoid; page-break-inside: avoid; } .crp-numeric { text-align: right; } .crp-money { display: block; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .crp-cards { display: block; } .crp-student-card { border: 1px solid #ccd7e2; border-radius: 8px; padding: 12px; margin-bottom: 12px; break-inside: avoid; } dl { margin: 0; } dl > div { display: flex; justify-content: space-between; gap: 16px; margin: 3px 0; } dt { color: #566779; } dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; } .crp-card-fields { margin-bottom: 10px; }
      .crp-condition { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; padding: 10px 0; border-bottom: 1px solid #d2dae3; break-inside: avoid; } .crp-condition > div > span { display: block; font-size: .9em; margin-top: 4px; } .crp-match { color: #596776; font-size: .9em; } .crp-match.is-match { color: #24577b; font-weight: 600; } .crp-totals { border: 1px solid #ccd7e2; background: #f5f8fa; padding: 12px; margin-top: 16px; break-inside: avoid; } .crp-total-currency { margin: 8px 0; } .crp-total-currency > strong { color: #315b83; } .crp-totals p { margin-top: 10px; }
      @media screen { body { max-width: ${prefs.printOrientation === 'landscape' ? '1120' : '800'}px; margin: 28px auto; padding: 20px; } .crp-print-section + .crp-print-section { border-top: 2px dashed #b7c7d7; padding-top: 30px; margin-top: 30px; } }
      @media print { .crp-print-section:last-child { break-after: auto; } .crp-print-header, h1, h2, h4 { break-after: avoid; } }
    </style></head><body>${sections}</body></html>`;
  }

  return Object.freeze({ COLUMN_LABELS, DEFAULT_COLUMNS, normalizePreferences, prepare, render, csvRows, printDocument, totalsHtml, escape });
});
