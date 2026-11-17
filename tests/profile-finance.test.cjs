const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const context=vm.createContext({document:{getElementById:()=>null}});
vm.runInContext(fs.readFileSync('Public/app/profile-finance.js','utf8'),context);
const classify=context.profileFinanceCellState;
test('Missing balances are unavailable, never paid',()=>{for(const row of [null,{}, {dueAmount:null,remaining:null},{dueAmount:20,remaining:'bad'}])assert.equal(classify(row),'unknown');});
test('Zero assessment is not applicable, not an unpaid month',()=>assert.equal(classify({dueAmount:0,remaining:0}),'na'));
test('Paid, partial, and unpaid balances use cent precision',()=>{assert.equal(classify({dueAmount:20,paidSoFar:20,remaining:0}),'paid');assert.equal(classify({dueAmount:20,paidSoFar:19.99,remaining:.01}),'partial');assert.equal(classify({dueAmount:20,paidSoFar:0,remaining:20}),'unpaid');});
