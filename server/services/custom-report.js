'use strict';
function matches(status, operator){
  const due=Number(status?.dueAmount), paid=Number(status?.paidSoFar), remaining=Number(status?.remaining);
  if(![due,paid,remaining].every(Number.isFinite) || due<=0.0049) return false;
  if(operator==='unpaid') return remaining>0.0049 && paid<=0.0049;
  if(operator==='partial') return remaining>0.0049 && paid>0.0049;
  if(operator==='outstanding') return remaining>0.0049;
  return false;
}
function validate(input, year, fees){
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  if(!input || !['all','any'].includes(input.mode)) fail('Choisissez toutes les conditions ou au moins une.');
  if(!Array.isArray(input.rules) || input.rules.length<1 || input.rules.length>6) fail('Ajoutez entre 1 et 6 conditions.');
  if(!['active','inactive','all'].includes(input.scope)) fail('Périmètre invalide.');
  if(typeof input.level!=='string' || typeof input.className!=='string' || input.level.length>80 || input.className.length>120) fail('Filtres élèves invalides.');
  const rules=input.rules.map(rule=>{
    if(!rule || typeof rule!=='object') fail('Condition invalide.');
    const fee=fees.find(f=>String(f.id)===String(rule.feeId));
    if(!fee || String(fee.billingCycle).toLowerCase()==='item') fail('Frais indisponibles ou article de vente non éligible.');
    if(!['unpaid','partial','outstanding'].includes(rule.operator)) fail('Condition de paiement invalide.');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(rule.month || '') || rule.month<`${year}-09` || rule.month>`${year+1}-08`) fail('Le mois doit appartenir à l’année scolaire active.');
    if(fee.dueMonth && String(fee.billingCycle).toLowerCase()!=='monthly' && rule.month!==fee.dueMonth) fail(`Utilisez le mois d’échéance configuré pour ${fee.labelFr}.`);
    return {feeId:String(fee.id),month:rule.month,operator:rule.operator,fee};
  });
  return {...input,rules};
}
async function evaluate(records, definition, getStatus){
  const output=new Array(records.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,records.length)},async()=>{
    while(cursor<records.length){const index=cursor++,student=records[index],conditions=[];
      for(const rule of definition.rules){const status=await getStatus(student,rule);conditions.push({feeId:rule.feeId,feeLabel:rule.fee.labelFr,month:rule.month,operator:rule.operator,matched:matches(status,rule.operator),due:Number(status.dueAmount),paid:Number(status.paidSoFar),remaining:Number(status.remaining),currency:status.currency});}
      if(definition.mode==='all' ? conditions.every(c=>c.matched) : conditions.some(c=>c.matched)) output[index]={id:student.id,name:student.fullName,matricule:student.matricule,className:student.className,level:student.level,conditions};
    }
  }));
  return output.filter(Boolean);
}
module.exports={matches,validate,evaluate};
