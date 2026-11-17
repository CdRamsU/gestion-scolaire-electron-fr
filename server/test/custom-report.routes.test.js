const {test}=require('node:test');const assert=require('node:assert/strict');
const register=require('../routes/custom-reports.routes');
test('route uses active year, parameterized student filters and original status calculation',async()=>{
 const routes={},calls=[];let evaluated=0;
 register({get:(path,...handlers)=>routes[path]=handlers.at(-1)},{requireRole:()=>()=>{},getSchoolYearStartYearSetting:async()=>2025,all:async(sql,args)=>{calls.push({sql,args});return sql.includes('FROM fee_types')?[{id:1,labelFr:'Bus',billingCycle:'monthly'}]:[{id:7,fullName:'Fixture',matricule:'TEST',className:'1 A'}];},buildStudentFeeExpectationContext:async()=>({fixture:true}),getStudentFeeMonthStatus:async({context})=>{assert.equal(context.fixture,true);evaluated++;return {dueAmount:10,paidSoFar:0,remaining:10,currency:'USD'};}});
 let payload;const res={status(code){this.code=code;return this;},json(data){payload=data;}};
 await routes['/api/reports/custom']({query:{definition:JSON.stringify({mode:'all',scope:'active',level:'primaire',className:'1 A',rules:[{feeId:1,month:'2025-12',operator:'unpaid'}]})}},res);
 assert.equal(payload.rows.length,1);assert.equal(evaluated,1);
 assert.deepEqual(calls[1].args,[2025,true,'primaire','1 A']);
});
