const {validate,evaluate}=require('../services/custom-report');
module.exports=function(app,deps){
 const {requireRole,all,getSchoolYearStartYearSetting,getStudentFeeMonthStatus,buildStudentFeeExpectationContext}=deps;
 const feesFor=year=>all('SELECT * FROM fee_types WHERE "schoolYearStartYear" = ? AND active = TRUE ORDER BY "labelFr"',[year]);
 app.get('/api/reports/custom/options',requireRole('admin','comptable','caissier'),async(req,res)=>{
  try{const year=await getSchoolYearStartYearSetting(),fees=await feesFor(year),placements=await all('SELECT DISTINCT level, "className" FROM students WHERE "schoolYearStartYear" = ? ORDER BY level, "className"',[year]);
   res.json({year,fees:fees.filter(f=>f.billingCycle!=='item').map(f=>({id:String(f.id),label:f.labelFr,cycle:f.billingCycle,dueMonth:f.dueMonth})),placements});
  }catch(error){res.status(500).json({error:'Impossible de charger les paramètres du rapport.'});}
 });
 app.get('/api/reports/custom',requireRole('admin','comptable','caissier'),async(req,res)=>{
  try{
   if(String(req.query.definition || '').length>5000) return res.status(400).json({error:'Définition trop longue.'});
   let input;try{input=JSON.parse(req.query.definition || '{}');}catch(_){return res.status(400).json({error:'Définition invalide.'});}
   const year=await getSchoolYearStartYearSetting(),definition=validate(input,year,await feesFor(year));
   const where=['"schoolYearStartYear" = ?'],params=[year];
   if(definition.scope!=='all'){where.push('COALESCE("isActive", TRUE) = ?');params.push(definition.scope==='active');}
   if(definition.level){where.push('level = ?');params.push(definition.level);}
   if(definition.className){where.push('"className" = ?');params.push(definition.className);}
   const records=await all(`SELECT * FROM students WHERE ${where.join(' AND ')} ORDER BY "fullName", id`,params);
   const contexts=new Map();
   const rows=await evaluate(records,definition,async(student,rule)=>{
    const key=`${student.id}:${rule.feeId}`;
    if(!contexts.has(key)) contexts.set(key,await buildStudentFeeExpectationContext({student,feeType:rule.fee}));
    return getStudentFeeMonthStatus({student,feeType:rule.fee,monthKey:rule.month,context:contexts.get(key)});
   });
   res.json({year,generatedAt:new Date().toISOString(),examined:records.length,rows});
  }catch(error){res.status(error.status || 500).json({error:error.status ? error.message : 'Impossible de calculer le rapport. Aucun résultat partiel n’a été affiché.'});}
 });
};
