/* Installation configuration UI. Uses the existing authenticated local API. */
(() => {
  'use strict';
  const root = document.getElementById('controlCenter');
  const legacy = document.getElementById('legacySettings');
  const categories = [
    ['overview','Vue d’ensemble'], ['profile','Profil de l’école'], ['features','Fonctionnalités'],
    ['academic','Structure académique'], ['students','Élèves'], ['finance','Frais & paiements'],
    ['receipts','Reçus'], ['users','Utilisateurs & permissions'], ['printing','Impression'],
    ['year','Année scolaire'], ['currency','Devises & taux'], ['backup','Sauvegarde & restauration'],
    ['network','Réseau local'], ['advanced','Avancé']
  ];
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data, page = 'overview', query = '', loading = false;
  const legacyCards = [...legacy.children];
  const legacyGroups = {
    currency: [legacyCards[0]], year: [legacyCards[0]],
    finance: legacyCards.filter(c => /Répartition|Prix des frais|bus/i.test(c.querySelector('summary')?.textContent || '')),
    academic: legacyCards.filter(c => /Classes/i.test(c.querySelector('summary')?.textContent || '')),
    users: [document.getElementById('adminUsersSection')],
    advanced: legacyCards.filter(c => /Apparence|WhatsApp|journal|audit/i.test(c.querySelector('summary')?.textContent || ''))
  };
  const riskLabel = { safe:'SÛR', important:'IMPORTANT', critical:'CRITIQUE' };
  const settingValue = d => d.type === 'boolean' ? (d.value ? 'Activé' : 'Désactivé') : d.type === 'logo' ? (d.value ? 'Logo local' : 'Aucun logo') : (d.value || 'Non renseigné');
  const value = key => data?.settings.find(d => d.key === key)?.value;
  const date = v => v ? new Intl.DateTimeFormat('fr', { dateStyle:'short', timeStyle:'short', timeZone: value('school.timezone') || 'Africa/Lubumbashi' }).format(new Date(v)) : 'Valeur initiale';
  function applyRuntime(values) {
    window.ecoleConfiguration = values;
    document.title = `${values['school.shortName']} · Gestion Scolaire`;
    document.documentElement.lang = values['school.language'];
    ['brandUserName','schoolName'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = values[id === 'schoolName' ? 'school.name' : 'school.shortName']; });
    document.querySelectorAll('.brand img, [data-school-logo]').forEach(img => { img.src = values['school.logo'] || ''; img.hidden = !values['school.logo']; });
    const map = { students:'students', payment:'payments', spending:'spending' };
    for(const [view,key] of Object.entries(map)) document.querySelectorAll(`.nav [data-view="${view}"]`).forEach(el => { el.hidden = values[`features.${key}`] === false; });
    const controls = { pfHistoryAddBtn:'manualHistory', pfHistoryAddWrap:'manualHistory', stAddBtn:'students', stLookupOldBtn:'students' };
    for(const [id,key] of Object.entries(controls)) { const el = document.getElementById(id); if(el) { el.dataset.featureDisabled = String(values[`features.${key}`] === false); el.classList.toggle('cc-feature-disabled', values[`features.${key}`] === false); } }
  }
  window.loadEcoleConfiguration = async () => { const result = await apiFetch('/api/configuration/runtime'); applyRuntime(result.values); };
  function row(d) {
    return `<div class="cc-setting"><div><strong>${escape(d.label)}</strong><small>${escape(d.key)} · ${escape(d.area)}</small></div><div class="cc-value">${escape(settingValue(d))}<small>${escape(date(d.updatedAt))}</small></div><span class="cc-risk ${d.risk}">${riskLabel[d.risk]}</span><button type="button" data-edit="${escape(d.key)}" aria-label="Modifier ${escape(d.label)}">Modifier</button></div>`;
  }
  const panel = (title, body) => `<section class="cc-panel"><h3>${escape(title)}</h3>${body}</section>`;
  function history() {
    if(!data.history.length) return '<p>Aucune modification enregistrée.</p>';
    return data.history.map(h => `<div class="cc-history"><time>${escape(date(h.createdAt))}</time><strong>${escape(h.entityId)}</strong><span>${escape(h.actorUsername || 'Système')}</span><small>${escape(h.entityId === 'school.logo' ? 'Logo modifié' : JSON.stringify(h.details?.before) + ' → ' + JSON.stringify(h.details?.after))}</small></div>`).join('');
  }
  function render() {
    legacyCards.forEach(card => legacy.append(card));
    legacy.hidden = true;
    const content = root.querySelector('.cc-content');
    if(!content) return;
    root.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-current', b.dataset.page === page && !query ? 'page' : 'false'));
    const title = categories.find(c => c[0] === page)?.[1];
    let body = '';
    if(query) {
      const q = query.toLocaleLowerCase('fr');
      const matches = data.settings.filter(d => `${d.label} ${d.key} ${d.area}`.toLocaleLowerCase('fr').includes(q));
      const links = categories.filter(c => c.join(' ').toLocaleLowerCase('fr').includes(q));
      body = panel(`${matches.length} paramètres · recherche`, matches.map(row).join('') || '<p>Aucun paramètre correspondant.</p>') + panel('Rubriques', links.map(c => `<button data-go="${c[0]}">${escape(c[1])}</button>`).join(' ') || '<p>Essayez « receipt », « currency », « élèves » ou « logo ».</p>');
    } else if(page === 'overview') {
      const configured = data.settings.filter(d => d.source === 'database').length;
      const metrics = [['École',value('school.name')],['Année scolaire',data.schoolYear],['PostgreSQL local','Connecté'],['Version API',data.version],['Sauvegarde','Non vérifiée'],['Réseau local',data.addresses.length ? `${data.addresses.length} adresse(s) détectée(s)` : 'Aucune adresse LAN'],['Configuration',`${configured} / ${data.settings.length} valeurs enregistrées`],['Vérifié à',date(data.checkedAt)]];
      body = `<div class="cc-metrics">${metrics.map(([k,v]) => `<div><small>${escape(k)}</small><strong>${escape(v)}</strong></div>`).join('')}</div>`;
      body += panel('Attention requise', '<div class="cc-warning">Sauvegarde : aucun registre local de sauvegardes vérifiées n’est disponible. Vérifiez votre procédure de restauration.</div><div class="cc-warning">Le taux de change reste propre à ce poste. Sa date de mise à jour n’est pas enregistrée ; sa fraîcheur ne peut pas être vérifiée.</div>' + (!configured ? '<div class="cc-warning">Profil initial : valeurs de compatibilité à vérifier pour cette installation.</div>' : ''));
      body += panel('Actions rapides', '<button data-go="profile">Configurer l’école</button> <button data-go="features">Gérer les capacités</button> <button data-go="currency">Vérifier le taux</button>');
      body += panel('Dernières modifications', history());
    } else if(page === 'profile') {
      body = panel('Identité & documents', data.settings.filter(d => !d.key.startsWith('features.')).map(row).join(''));
      body += panel('Année scolaire', `<div class="cc-setting"><div><strong>${escape(data.schoolYear)}</strong><small>Source : schoolYearStartYear · tarifs et inscriptions par année</small></div><button data-go="year">Ouvrir les paramètres existants</button></div>`);
    } else if(page === 'features') {
      body = '<p class="cc-note">Les permissions des utilisateurs restent applicables. Désactiver une capacité bloque les opérations concernées ; les données existantes sont conservées.</p>' + panel('Capacités de cette installation', data.settings.filter(d => d.key.startsWith('features.')).map(row).join(''));
    } else if(page === 'network') {
      body = panel('Interfaces du serveur local', `<p>${data.addresses.map(escape).join(' · ') || 'Aucune adresse LAN détectée.'}</p><p>API accessible depuis ce poste. La présence d’une adresse ne garantit pas l’accès depuis les autres postes.</p>`);
    } else if(page === 'receipts') {
      body = panel('Numérotation', row(data.settings.find(d => d.key === 'receipts.prefix'))) + panel('Autres réglages', '<p>L’imprimante reste une préférence du poste. Les permissions de réimpression restent gérées par les rôles existants.</p>');
    } else if(page === 'printing') {
      body = panel('Impression locale', `<p>Imprimante de ce poste : <strong>${escape(localStorage.getItem('ecolepos_local_printer_v1') || 'Imprimante système par défaut')}</strong></p><p>La sélection et l’impression restent accessibles dans le flux de paiement. Aucun réglage matériel partagé n’est créé.</p>`);
    } else if(legacyGroups[page]) {
      body = panel(title, `<p>Paramètres existants conservés. ${page === 'year' ? 'Changer d’année prépare les tarifs de cette année et change le contexte de travail.' : ''}</p><div id="ccLegacySlot"></div>`);
    } else {
      body = panel(title, '<p>Cette rubrique sera intégrée progressivement. Aucun nouveau réglage n’est appliqué dans cette version.</p>');
    }
    content.innerHTML = `<div class="cc-heading"><div><small>GESTION SCOLAIRE / CONFIGURATION LOCALE</small><h2>${escape(query ? 'Recherche' : title)}</h2></div><span class="cc-live">● POSTGRESQL</span></div>${body}`;
    if(!query && legacyGroups[page]) legacyGroups[page].forEach(card => { if(card) { content.querySelector('#ccLegacySlot').append(card); card.open = true; } });
  }
  async function refresh() {
    if(loading) return;
    loading = true;
    const status = root.querySelector('.cc-status');
    if(status) status.textContent = 'Lecture de la configuration locale…';
    try {
      data = await apiFetch('/api/configuration');
      applyRuntime(Object.fromEntries(data.settings.map(d => [d.key,d.value])));
      render();
      status.textContent = 'Configuration locale à jour · Ctrl/Cmd + K rechercher · Échap effacer';
    } catch(e) {
      status.textContent = `Lecture impossible : ${e.message}. Réessayez avec Actualiser.`;
      if(!data) root.querySelector('.cc-content').textContent = 'Configuration indisponible. Vérifiez le serveur PostgreSQL local.';
    } finally { loading = false; }
  }
  function edit(key) {
    const def = data.settings.find(d => d.key === key);
    if(!def) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'cc-dialog';
    dialog.setAttribute('aria-label', def.label);
    let input = def.type === 'boolean' ? `<select name="value"><option value="true" ${def.value ? 'selected' : ''}>Activé</option><option value="false" ${!def.value ? 'selected' : ''}>Désactivé</option></select>` : def.type === 'select' ? `<select name="value">${def.options.map(o => `<option ${o === def.value ? 'selected' : ''}>${escape(o)}</option>`).join('')}</select>` : def.type === 'logo' ? '<input name="logo" type="file" accept="image/png,image/jpeg,image/webp"><small>Image locale · 55 Ko maximum. Vide : conserver le logo.</small><label><input type="checkbox" name="removeLogo"> Retirer le logo</label>' : `<input name="value" value="${escape(def.value)}" ${def.required ? 'required' : ''} maxlength="${def.max || 240}" type="${def.type === 'email' ? 'email' : 'text'}">`;
    dialog.innerHTML = `<form><small>${escape(def.key)} · ${riskLabel[def.risk]}</small><h2>${escape(def.label)}</h2><p>Zones affectées : ${escape(def.area)}</p><label>Nouvelle valeur${input}</label>${def.risk !== 'safe' ? '<label class="cc-confirm"><input type="checkbox" name="confirmed" required> Je confirme l’effet de cette modification.</label>' : ''}<p role="alert" class="cc-error"></p><div class="cc-dialog-actions"><button type="button" data-cancel>Annuler</button><button type="submit">Appliquer</button></div></form>`;
    document.body.append(dialog); dialog.showModal();
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { dialog.remove(); root.querySelector(`[data-edit="${def.key}"]`)?.focus(); });
    dialog.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const form = e.currentTarget, submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      try {
        let next = def.type === 'boolean' ? form.elements.value.value === 'true' : form.elements.value?.value;
        if(def.type === 'logo') {
          next = def.value;
          const file = form.elements.logo.files[0];
          if(file) {
            if(file.size > 55000 || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Choisissez un PNG, JPEG ou WebP de moins de 55 Ko.');
            next = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
          }
          if(form.elements.removeLogo.checked) next = '';
        }
        await apiFetch('/api/configuration', { method:'PATCH', body:JSON.stringify({ key, value:next, previousValue:def.value, confirmed:form.elements.confirmed?.checked === true }) });
        dialog.close(); await refresh();
      } catch(err) { form.querySelector('.cc-error').textContent = err.message; }
      finally { submit.disabled = false; }
    };
  }
  window.openControlCenter = () => {
    if(!hasRole('admin')) { root.hidden = true; legacy.hidden = false; legacyCards.forEach(c => legacy.append(c)); return; }
    root.hidden = false;
    legacy.hidden = true;
    if(!root.children.length) {
      root.innerHTML = `<header class="cc-toolbar"><strong>GESTION SCOLAIRE <span>CENTRE DE CONFIGURATION</span></strong><label class="cc-search-label"><span class="sr-only">Rechercher une configuration</span><input type="search" placeholder="Rechercher un paramètre…  ⌘ / Ctrl K" aria-label="Rechercher une configuration"></label><button data-refresh>Actualiser</button></header><div class="cc-layout"><nav aria-label="Rubriques de configuration">${categories.map((c,i) => `<button data-page="${c[0]}"><span>${String(i+1).padStart(2,'0')}</span>${escape(c[1])}</button>`).join('')}</nav><div class="cc-content"></div></div><footer class="cc-status" role="status" aria-live="polite"></footer>`;
      root.querySelector('[type=search]').oninput = e => { query = e.target.value.trim(); if(data) render(); };
      root.onclick = e => {
        const b = e.target.closest('button'); if(!b) return;
        if(b.hasAttribute('data-refresh')) return refresh();
        if(b.dataset.edit) return edit(b.dataset.edit);
        const next = b.dataset.page || b.dataset.go;
        if(next) { page = next; query = ''; root.querySelector('[type=search]').value = ''; if(data) render(); }
      };
    }
    refresh();
  };
  document.addEventListener('keydown', e => {
    if(!viewSettings.classList.contains('active') || root.hidden || document.querySelector('dialog[open]')) return;
    if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); root.querySelector('[type=search]')?.focus(); }
    if(e.key === 'Escape' && query) { query = ''; root.querySelector('[type=search]').value = ''; render(); }
  }, true);
  // Confirm the existing school-year workflow without duplicating its storage or fee preparation.
  document.getElementById('setSchoolYearSaveBtn')?.addEventListener('click', e => {
    if(!confirm('Changer l’année scolaire active ? Les tarifs de cette année seront préparés et le contexte des inscriptions, paiements et rapports changera. Les écritures existantes sont conservées.')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  if(viewSettings.classList.contains('active')) window.openControlCenter();
})();
