'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { catalog, validateValue } = require('../config/catalog');
const { createConfiguration } = require('../config/service');
const def = key => catalog.find(d => d.key === key);
test('configuration catalog has unique keys and valid compatibility defaults', () => {
  assert.equal(new Set(catalog.map(d => d.key)).size, catalog.length);
  for(const d of catalog) assert.deepEqual(validateValue(d, d.default), d.default);
});
test('rejects unsafe images, untyped switches, malformed prefixes and unsupported locale', () => {
  for(const logo of ['https://remote/logo.png','//remote/logo.png','/../secret','data:image/svg+xml;base64,AAAA','javascript:alert(1)']) assert.throws(() => validateValue(def('school.logo'),logo));
  assert.throws(() => validateValue(def('features.payments'),'false'));
  assert.throws(() => validateValue(def('receipts.prefix'),'../x'));
  assert.throws(() => validateValue(def('school.language'),'en'));
  assert.throws(() => validateValue(def('school.timezone'),'Invalid/Timezone'));
  assert.equal(validateValue(def('school.logo'),'data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
});
test('risky changes require confirmation before opening a transaction', async () => {
  const configuration = createConfiguration({ connect: () => assert.fail('must not connect') });
  await assert.rejects(configuration.update({key:'receipts.prefix',value:'NEW',previousValue:'ECO'},{}), {status:409});
});
test('audit failure rolls back configuration and releases the connection', async () => {
  const calls = [];
  const client = { query: async (sql) => {
    calls.push(sql);
    if(sql.startsWith('SELECT key')) return {rows:[]};
    if(sql.startsWith('INSERT INTO audit_logs')) throw new Error('audit unavailable');
    return {rows:[]};
  }, release: () => calls.push('release') };
  await assert.rejects(createConfiguration({connect:async () => client}).update({key:'school.phone',value:'123',previousValue:''},{sub:1,username:'admin',role:'admin'}), /audit unavailable/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
  assert.equal(calls.at(-1),'release');
});
test('stale values cannot overwrite another administrator', async () => {
  const calls=[];
  const client={query:async sql => {calls.push(sql);return {rows:sql.startsWith('SELECT key') ? [{key:'school.phone',value:'updated'}]:[]};},release(){}};
  await assert.rejects(createConfiguration({connect:async()=>client}).update({key:'school.phone',value:'123',previousValue:''},{}),{status:409});
  assert.ok(!calls.some(sql=>sql.startsWith('INSERT')));
});
const { mutationKeys, isManualHistory } = require('../config/capabilities');
test('feature gates preserve historical reads and payment corrections', () => {
  assert.deepEqual(mutationKeys('GET','/students/a'),[]);
  assert.deepEqual(mutationKeys('POST','/payments'),['features.payments']);
  assert.deepEqual(mutationKeys('POST','/students/a/fees'),['features.students','features.studentFeeOverrides']);
  assert.deepEqual(mutationKeys('PUT','/students/a/bus-subscription'),['features.students','features.busPayments']);
  assert.deepEqual(mutationKeys('POST','/spending'),['features.spending']);
  assert.deepEqual(mutationKeys('POST','/payments/1/cancel'),[]);
});
test('manual history recognizes all date aliases and accounting timezone', () => {
  const now = new Date('2026-09-06T22:30:00Z');
  for(const field of ['created_at','createdAtOverride','createdAt']) {
    assert.equal(isManualHistory({[field]:'2026-09-06T20:00:00Z'},'Africa/Lubumbashi',now),true);
    assert.equal(isManualHistory({[field]:'2026-09-07T02:00:00Z'},'Africa/Lubumbashi',now),false);
  }
  assert.equal(isManualHistory({forceRequestedMonth:true},'UTC',now),true);
});
