const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function historyFunction() {
  const source = fs.readFileSync(path.join(root, 'Public/app/reports.js'), 'utf8');
  const context = {
    normalizeTextAscii: s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    stripStatePaidSpendingPrefix: s => s.replace(/^Paid - /i, ''),
    spendingEffectiveDateISO: row => row.date || '',
    spendingAmountSplit: row => ({usd: row.currency === 'USD' ? row.amount : 0, cdf: row.currency === 'CDF' ? row.amount : 0})
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function groupDGCollectionHistory('), source.indexOf('async function renderReports(){')), context);
  return rows => JSON.parse(JSON.stringify(context.groupDGCollectionHistory(rows)));
}

test('DG history uses movement months, newest first, with independent currency subtotals', () => {
  const rows = [
    {id:1, category:'Paid - Collection DG', date:'2026-08-31', createdAt:'2026-09-20T10:00:00Z', appliesToMonth:'2026-09', amount:10, currency:'USD'},
    {id:2, category:'Collection DG', date:'2026-09-02', createdAt:'2026-09-02T09:00:00Z', amount:2000, currency:'CDF'},
    {id:3, category:'Paid - Collection DG', date:'2026-09-02', createdAt:'2026-09-02T11:00:00Z', amount:20, currency:'USD'},
    {id:4, category:'Dépense', date:'2026-09-22', amount:999, currency:'USD'},
    {id:5, category:'Collection DG', date:'', amount:3, currency:'USD'}
  ];
  const before = JSON.stringify(rows);
  const result = historyFunction()(rows);
  assert.deepEqual(result.months.map(g=>g.monthKey), ['2026-09','2026-08','']);
  assert.deepEqual(result.months[0].rows.map(r=>r.id), [3,2]);
  assert.equal(result.months[0].usd,20); assert.equal(result.months[0].cdf,2000);
  assert.equal(result.count,4); assert.deepEqual(result.totals,{usd:33,cdf:2000});
  assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(historyFunction()([]),{months:[],totals:{usd:0,cdf:0},count:0});
});

test('admin article summary preserves report-10 totals, inactive items and movement accounting', async () => {
  const routes = new Map();
  const fees = [
    {code:'TUITION', labelFr:'Minerval', billingCycle:'monthly'},
    {code:'UNIFORM', labelFr:'Uniforme', billingCycle:'item'},
    {code:'BOOK', labelFr:'Cahier', billingCycle:'item'},
    {code:'OLD', labelFr:'Ancien article', billingCycle:'item', active:false}
  ];
  let empty = false;
  const deps = {
    requireRole: (...roles) => Object.assign(() => {}, {roles}),
    get: async () => ({count:7}),
    getSchoolYearStartYearSetting: async () => 2026,
    normalizeMonthKey: x => x || null, normalizeCurrency: x => x,
    normalizeBillingCycle: x => x, BUSINESS_TIMEZONE:'Africa/Lubumbashi',
    all: async sql => {
      if(sql.includes('FROM fee_types')) return sql.includes('active = TRUE') ? fees.filter(f=>f.active!==false) : fees;
      if(empty) return [];
      if(sql.includes('FROM payments')) return [
        {id:1, feeCode:'TUITION', feeType:'Minerval', amount:40, currency:'USD'},
        {id:2, feeCode:'UNIFORM', feeType:'Uniforme', amount:20, currency:'USD',amountUSDReceived:10,amountCDFReceived:24000},
        {id:3, feeCode:'BOOK', feeType:'Cahier', amount:5000, currency:'CDF'}
      ];
      if(sql.includes('FROM spending')) return [{caisseBoxKey:'fee_uniform',amount:2,currency:'USD'},{caisseBoxKey:'fee_old',amount:1,currency:'USD'}];
      if(sql.includes('FROM caisse_transfers')) return [{sourceBoxKey:'fee_uniform',counterpartyBoxKey:'fee_book',sourceAmount:3,sourceCurrency:'USD'}];
      throw Error('Unexpected query');
    }
  };
  require('../routes/reports.routes')({get:(p,...h)=>routes.set(p,h),post(){},patch(){}},deps);
  const summary = routes.get('/api/reports/daily-caisse-articles-summary');
  assert.deepEqual(summary[0].roles,['admin']);
  assert.deepEqual(routes.get('/api/reports/daily-caisse-entries')[0].roles,['admin','comptable','caissier']);
  async function call(p,date='2026-09-22') {
    const res={code:200,status(n){this.code=n;return this},json(data){this.data=data;return this}};
    await routes.get(p).at(-1)({query:{date}},res); assert.equal(res.code,200,JSON.stringify(res.data)); return res.data;
  }
  const old = await call('/api/reports/daily-caisse-entries');
  const result = await call('/api/reports/daily-caisse-articles-summary');
  assert.equal(result.aggregates.length,2); assert.equal(old.aggregates.length,4);
  const item = result.aggregates.find(r=>r.boxKey==='articles_vendus_groupes');
  assert.equal(item.count,2); assert.equal(item.entreesUSD,10); assert.equal(item.entreesCDF,29000);
  assert.equal(item.depensesUSD,3); assert.equal(item.transfertInUSD,3); assert.equal(item.transfertOutUSD,3);
  assert.equal(item.totalUSD,7); assert.equal(item.totalCDF,29000);
  for(const field of ['totalUSD','totalCDF','totalEntryUSD','totalEntryCDF','totalExitUSD','totalExitCDF','totalEntries']) assert.equal(result[field],old[field],field);
  assert.equal(result.details,undefined); assert.equal(old.details.length,3);
  empty=true; assert.deepEqual((await call('/api/reports/daily-caisse-articles-summary')).aggregates,[]);
});
