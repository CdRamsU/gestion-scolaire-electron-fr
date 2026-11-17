/* Read-only checks. Matching names are review candidates, never proof of duplication. */
(function(root){
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function inspect(records, validClass){
    const findings = [], names = new Map(), ids = new Map();
    const add = (student,kind,label,detail) => findings.push({student,kind,label,detail});
    for(const student of records){
      const name = normalize(student.name), matricule = normalize(student.matricule);
      if(name){if(!names.has(name)) names.set(name,[]);names.get(name).push(student);}
      else add(student,'identity','Nom manquant','Renseignez le nom dans la fiche élève.');
      if(matricule){if(!ids.has(matricule)) ids.set(matricule,[]);ids.get(matricule).push(student);}
      else add(student,'identity','Matricule manquant','Vérifiez l’identifiant officiel de cet élève.');
      if(!String(student.parentPhone || '').trim()) add(student,'contact','Téléphone parent manquant','Les relances téléphoniques ne disposent pas de numéro.');
      if(!String(student.parentName || '').trim()) add(student,'contact','Responsable non renseigné','Vérifiez le nom du parent ou responsable.');
      if(!validClass(student.level,student.className)) add(student,'enrollment','Affectation à vérifier','Le niveau ou la classe ne passe pas la validation actuelle d’Gestion Scolaire.');
    }
    for(const group of names.values()) if(group.length > 1) for(const student of group) add(student,'duplicate','Noms identiques à vérifier',`${group.length} fiches portent ce nom normalisé. Des homonymes sont possibles : comparez les fiches avant toute correction.`);
    for(const group of ids.values()) if(group.length > 1) for(const student of group) add(student,'identity','Matricule partagé',`${group.length} fiches utilisent ce matricule. Vérifiez les identités concernées.`);
    return findings;
  }
  if(typeof module !== 'undefined' && module.exports) module.exports = {inspect};
  else root.ecoleDataQuality = {inspect};
})(typeof window !== 'undefined' ? window : globalThis);
