const {test} = require('node:test');
const assert = require('node:assert/strict');
const {inspect} = require('../Public/app/data-quality-rules.js');
const record = {id:'1',name:'Émilie  Kabeya',matricule:'A1',parentName:'Parent',parentPhone:'123',level:'Primaire',className:'1e A'};
test('complete valid record produces no findings and remains unchanged',()=>{
 const input = Object.freeze({...record});
 assert.deepEqual(inspect([input],()=>true),[]);
});
test('normalized names identify candidates without treating them as confirmed duplicates',()=>{
 const rows = inspect([record,{...record,id:'2',name:'emilie kabeya',matricule:'A2'}],()=>true);
 assert.equal(rows.filter(r=>r.kind==='duplicate').length,2);
 assert.ok(rows.every(r=>r.detail.includes('homonymes')));
});
test('missing identifiers are not grouped as duplicate identifiers',()=>{
 const rows = inspect([{...record,matricule:''},{...record,id:'2',name:'Other',matricule:''}],()=>true);
 assert.equal(rows.filter(r=>r.label==='Matricule manquant').length,2);
 assert.equal(rows.filter(r=>r.label==='Matricule partagé').length,0);
});
test('shared matricules, missing contacts and invalid classes are independent checks',()=>{
 const rows=inspect([record,{...record,id:'2',name:'Other',parentPhone:'',parentName:''}],()=>false);
 assert.equal(rows.filter(r=>r.label==='Matricule partagé').length,2);
 assert.equal(rows.filter(r=>r.kind==='contact').length,2);
 assert.equal(rows.filter(r=>r.kind==='enrollment').length,2);
});
