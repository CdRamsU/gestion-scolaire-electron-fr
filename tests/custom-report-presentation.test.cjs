const { test } = require('node:test');
const assert = require('node:assert/strict');
const presentation = require('../Public/app/custom-report-presentation.js');
const condition = (changes = {}) => ({ feeId: 'minerval', feeLabel: 'Minerval', month: '2026-02', operator: 'outstanding', matched: true, due: 40, paid: 10, remaining: 30, currency: 'USD', ...changes });
const rows = [
  { id: '2', name: 'Zoé Mbala', matricule: 'E02', className: '2B', level: 'Primaire', conditions: [condition(), condition({ operator: 'partial' }), condition({ feeId: 'bus', currency: 'CDF', due: 25000, paid: 5000, remaining: 20000 })] },
  { id: '1', name: 'André Kalu', matricule: 'E01', className: '1A', level: 'Secondaire', conditions: [condition({ month: '2025-12' }), condition()] },
  { id: '3', name: 'Anna Nsimba', matricule: 'E03', className: '1A', level: 'Primaire', conditions: [condition({ due: 20, paid: 20, remaining: 0, matched: false })] }
];

test('financial totals keep currencies separate and count an obligation only once per student', () => {
  const model = presentation.prepare(rows);
  assert.deepEqual(model.totals, [
    { currency: 'CDF', due: 25000, paid: 5000, remaining: 20000 },
    { currency: 'USD', due: 140, paid: 50, remaining: 90 }
  ]);
  assert.equal(model.rows.find(row => row.id === '2').matchedCount, 3);
  assert.equal(rows[0].totals, undefined, 'source data is not mutated');
});

test('search is accent insensitive, combines terms, and totals only the displayed rows', () => {
  const model = presentation.prepare(rows, { search: 'zoe primaire' });
  assert.equal(model.filteredCount, 1);
  assert.equal(model.totalCount, 3);
  assert.equal(model.rows[0].id, '2');
  assert.equal(model.totals.find(total => total.currency === 'USD').remaining, 30);
  assert.equal(presentation.prepare(rows, { search: 'e01' }).rows[0].name, 'André Kalu');
});

test('grouping never mixes identically named classes from different levels', () => {
  const model = presentation.prepare(rows, { groupBy: 'class' });
  assert.equal(model.groups.length, 3);
  assert.equal(model.groups.filter(group => group.label.startsWith('1A')).length, 2);
  const levels = presentation.prepare(rows, { groupBy: 'level', sortBy: 'class' });
  assert.equal(levels.groups.find(group => group.label === 'Primaire').count, 2);
  assert.deepEqual(presentation.prepare(rows).rows.map(row => row.id), ['1', '3', '2']);
});

test('all display modes escape student data and ignore unsupported preference values', () => {
  const unsafe = [{ id: '" onclick="alert(1)', name: '<img src=x onerror=alert(1)>', className: '<script>bad</script>', conditions: [condition({ feeLabel: '<iframe>', currency: '<USD>' })] }];
  for (const layout of ['table', 'cards', 'summary']) {
    const prefs = { layout, columns: ['className', 'remaining', '__proto__', 'remaining'] };
    const html = presentation.render(presentation.prepare(unsafe, prefs), prefs);
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<iframe>'));
    assert.ok(html.includes('&lt;USD&gt;'));
    assert.ok(html.includes('data-student="&quot; onclick=&quot;alert(1)"'));
  }
  assert.deepEqual(presentation.normalizePreferences({ columns: ['__proto__', 'remaining', 'remaining'] }).columns, ['remaining']);
  assert.equal(presentation.normalizePreferences({ printOrientation: 'landscape; color:red' }).printOrientation, 'portrait');
});

test('print sections follow the requested division and print every filtered student', () => {
  const byStudent = presentation.printDocument({ rows, generatedAt: '2026-10-02T10:00:00Z' }, { printBreak: 'student', printOrientation: 'landscape' }, { title: '<Report>', criteria: '<script>bad</script>', schoolName: 'École & compagnie' });
  assert.equal((byStudent.match(/<section class="crp-print-section crp-print-student">/g) || []).length, 3);
  assert.ok(byStudent.includes('size: A4 landscape'));
  assert.ok(byStudent.includes('&lt;Report&gt;'));
  assert.ok(byStudent.includes('École &amp; compagnie'));
  assert.ok(!byStudent.includes('<script>'));
  assert.ok(!byStudent.includes('data-student='));
  const byGroup = presentation.printDocument({ rows }, { groupBy: 'level', printBreak: 'group' });
  assert.equal((byGroup.match(/<section class="crp-print-section">/g) || []).length, 2);
  const filtered = presentation.printDocument({ rows }, { search: 'zoe', printBreak: 'student', printTotals: false });
  assert.ok(filtered.includes('Zoé Mbala'));
  assert.ok(!filtered.includes('André Kalu'));
  assert.ok(!filtered.includes('<div class="crp-totals">'));
});

test('missing balances are unavailable instead of being reported as zero', () => {
  const model = presentation.prepare([{ id: 'unknown', name: 'Missing', conditions: [condition({ due: null, remaining: undefined })] }]);
  assert.equal(model.totals[0].due, null);
  assert.equal(model.totals[0].remaining, null);
  assert.ok(presentation.render(model).includes('Indisponible USD'));
});

test('detail visibility and print metadata preferences are honored without hiding student identity', () => {
  const model = presentation.prepare(rows);
  assert.ok(!presentation.render(model, { showDetails: false }).includes('crp-conditions'));
  assert.ok(presentation.render(model, { showDetails: true }).includes('crp-conditions'));
  const print = presentation.printDocument({ rows }, { showDetails: true, printCriteria: false, printTotals: false }, { criteria: 'DO NOT INCLUDE THIS CRITERIA' });
  assert.ok(print.includes('crp-conditions'));
  assert.ok(print.includes('Zoé Mbala'));
  assert.ok(!print.includes('DO NOT INCLUDE THIS CRITERIA'));
  assert.ok(!print.includes('<div class="crp-totals">'));
  const summary = presentation.printDocument({ rows }, { layout: 'summary', printTotals: false });
  assert.ok(!summary.includes('<div class="crp-totals">'));
});

test('malformed saved presentation preferences safely fall back to defaults', () => {
  for (const input of [null, false, 0, '', 'table', []]) assert.deepEqual(presentation.normalizePreferences(input), presentation.normalizePreferences());
  assert.deepEqual(presentation.normalizePreferences({ columns: [null, {}, { toString: {} }, 1, 'remaining'] }).columns, ['remaining']);
  assert.equal(presentation.normalizePreferences({ search: { toString: {} } }).search, '');
});

test('distributed print sheets show their own student count', () => {
  const studentSheets = presentation.printDocument({ rows }, { printBreak: 'student' });
  assert.equal((studentSheets.match(/<p class="crp-muted">1 élève · Fiche individuelle/g) || []).length, 3);
  assert.ok(!studentSheets.includes('<p class="crp-muted">3 élèves'));
  const groupSheets = presentation.printDocument({ rows }, { groupBy: 'level', printBreak: 'group' });
  assert.equal((groupSheets.match(/<p class="crp-muted">2 élèves · Dans ce groupe/g) || []).length, 1);
  assert.equal((groupSheets.match(/<p class="crp-muted">1 élève · Dans ce groupe/g) || []).length, 1);
});

test('CSV has one monetary row per obligation and retains all matching-condition evidence', () => {
  const model = presentation.prepare(rows), csv = presentation.csvRows(model), header = csv.shift();
  assert.equal(csv.length, 5, 'six conditions include one duplicate obligation');
  assert.equal(header[8], 'Dû');
  const repeated = csv.find(row => row[1] === 'E02' && row[4] === 'Minerval');
  assert.equal(repeated[6], '1. Solde restant | 2. Paiement partiel');
  assert.equal(repeated[7], '1. Oui | 2. Oui');
  for (const total of model.totals) {
    const amounts = csv.filter(row => row[11] === total.currency);
    assert.equal(amounts.reduce((sum, row) => sum + row[8], 0), total.due);
    assert.equal(amounts.reduce((sum, row) => sum + row[9], 0), total.paid);
    assert.equal(amounts.reduce((sum, row) => sum + row[10], 0), total.remaining);
  }
  const filtered = presentation.csvRows(presentation.prepare(rows, { search: 'zoe' }));
  assert.equal(filtered.length, 3);
});
