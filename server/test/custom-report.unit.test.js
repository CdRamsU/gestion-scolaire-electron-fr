const {test}=require('node:test');
const assert=require('node:assert/strict');
const {matches,validate,evaluate}=require('../services/custom-report');
const fees=[{id:1,labelFr:'Minerval',billingCycle:'monthly'},{id:2,labelFr:'Inscription',billingCycle:'annual',dueMonth:'2025-09'},{id:3,billingCycle:'item'}];
const base={mode:'all',scope:'active',level:'',className:'',rules:[{feeId:'1',month:'2025-12',operator:'outstanding'},{feeId:'1',month:'2026-02',operator:'unpaid'}]};
test('exempt and non-applicable fees never match unpaid conditions',()=>{
 for(const operator of ['unpaid','partial','outstanding'])assert.equal(matches({dueAmount:0,paidSoFar:0,remaining:0},operator),false);
 assert.equal(matches({dueAmount:100,paidSoFar:40,remaining:60},'partial'),true);
 assert.equal(matches({dueAmount:100,paidSoFar:40,remaining:60},'unpaid'),false);
 assert.equal(matches({dueAmount:100,paidSoFar:100,remaining:0},'outstanding'),false);
});
test('validates year, fee availability, count, operators and annual due month',()=>{
 assert.equal(validate(base,2025,fees).rules.length,2);
 for(const rule of [null,{feeId:99,month:'2025-12',operator:'unpaid'},{feeId:1,month:'2024-12',operator:'unpaid'},{feeId:3,month:'2025-12',operator:'unpaid'},{feeId:2,month:'2026-02',operator:'unpaid'},{feeId:1,month:'2025-12',operator:'random'}])assert.throws(()=>validate({...base,rules:[rule]},2025,fees),{status:400});
 assert.throws(()=>validate({...base,rules:[]},2025,fees),{status:400});
});
test('AND and OR correctly combine December and February without currency aggregation',async()=>{
 const records=[{id:'both'},{id:'december'},{id:'exempt'}];
 const status=async(s,r)=>{const due=s.id==='exempt'?0:100,paid=s.id==='december'&&r.month==='2026-02'?100:0;return {dueAmount:due,paidSoFar:paid,remaining:Math.max(0,due-paid),currency:r.month==='2025-12'?'CDF':'USD'};};
 const all=await evaluate(records,validate(base,2025,fees),status);
 assert.deepEqual(all.map(r=>r.id),['both']);
 const any=await evaluate(records,validate({...base,mode:'any'},2025,fees),status);
 assert.deepEqual(any.map(r=>r.id),['both','december']);
 assert.deepEqual(any[0].conditions.map(c=>c.currency),['CDF','USD']);
});
test('does not return misleading partial results after a fee calculation failure',async()=>{
 await assert.rejects(evaluate([{id:1}],validate(base,2025,fees),async()=>{throw Error('database unavailable');}),/database unavailable/);
});
