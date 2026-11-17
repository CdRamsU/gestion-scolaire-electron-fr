const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture(){
  const fees = [{id:'1',label:'Minerval'},{id:'2',label:'Bus'}];
  const ctx = vm.createContext({
    document:{getElementById:()=>null},Event:class{},selectedStudentId:'a',
    elFee:{value:'Minerval',options:fees.map(f=>({value:f.label,dataset:{feeTypeId:f.id}})),dispatchEvent(){}},
    elAmount:{value:'500'},elMixedCdfAmount:{value:'1000'},
    getPaymentEligibleStudentById:id=>id?{id}:null,
    findFeeTypeById:id=>fees.find(f=>f.id===id),
    isFeeTypeApplicableForStudent:()=>true
  });
  ctx.getSelectedFeeTypeMeta=()=>fees.find(f=>f.label===ctx.elFee.value);
  vm.runInContext(fs.readFileSync('Public/app/payment-fee-picker.js','utf8'),ctx);
  return ctx;
}
test('A restored/default fee does not count as a deliberate choice',()=>{
  const c=fixture();assert.equal(c.isPaymentFeeChoiceConfirmed(),false);
  c.choosePaymentFee('Bus');assert.equal(c.isPaymentFeeChoiceConfirmed(),true);
  assert.equal(c.elAmount.value,'');assert.equal(c.elMixedCdfAmount.value,'');
});
test('Changing student or fee invalidates the choice; reset requires a new choice',()=>{
  const c=fixture();c.choosePaymentFee('Bus');c.selectedStudentId='b';assert.equal(c.isPaymentFeeChoiceConfirmed(),false);
  c.choosePaymentFee('Bus');c.elFee.value='Minerval';assert.equal(c.isPaymentFeeChoiceConfirmed(),false);
  c.choosePaymentFee('Minerval');c.resetPaymentFeeChoice();assert.equal(c.isPaymentFeeChoiceConfirmed(),false);
});
test('Unknown and inapplicable fees cannot be chosen',()=>{
  const c=fixture();c.choosePaymentFee('Unknown');assert.equal(c.isPaymentFeeChoiceConfirmed(),false);
  c.isFeeTypeApplicableForStudent=()=>false;c.choosePaymentFee('Bus');assert.equal(c.isPaymentFeeChoiceConfirmed(),false);
});

test('Re-selecting the same fee preserves the entered amount',()=>{
 const c=fixture();c.choosePaymentFee('Bus');c.elAmount.value='50';c.choosePaymentFee('Bus');assert.equal(c.elAmount.value,'50');
});
