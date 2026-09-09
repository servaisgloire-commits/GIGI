(()=>{
'use strict';
const $=id=>document.getElementById(id);
const STORE='fast_business_workspace_v1';
const AUDIT='fast_admin_audit_v1';
const VIEWS='fast_admin_saved_views_v1';
const UI='fast_admin_ui_v2';
const defaults={
  companyName:'FAST N°1',legalName:'',country:'CG',currency:'XAF',timezone:'Africa/Brazzaville',supportEmail:'',supportPhone:'',
  platformCommission:20,driverCommission:80,cancellationFee:1000,minimumFare:1500,waitingMinute:100,dynamicMultiplier:1.25,
  autoDispatch:true,cashEnabled:true,cardEnabled:true,mobileMoneyEnabled:true,driverSignup:true,scheduledRides:true,dynamicPricing:false,
  requireDriverDocs:true,require2FA:false,sessionTimeout:60,exportWatermark:true,
  notifyNewDriver:true,notifyPendingDocument:true,notifyFailedPayment:true,notifyLargeRide:false
};
const titles={
  dashboard:'Tableau de bord',finance:'Finance & performance',drivers:'Chauffeurs',clients:'Clients',rides:'Courses',documents:'Documents chauffeurs',support:'Support & incidents',
  payments:'Paiements clients',payouts:'Paie chauffeurs',commissions:'Commissions & frais',markets:'Pays & tarifs',data:'Centre de données',analytics:'Power BI & analytique',
  sql:'SQL & requêtes',sharing:'Partage & exports',operations:'Paramètres métier',integrations:'Intégrations',notifications:'Notifications',admins:'Administrateurs',
  security:'Sécurité & accès',audit:'Journal d’audit',settings:'Paramètres généraux'
};
const pageKeywords={
  dashboard:'accueil kpi activité direction pilotage',finance:'finance chiffre affaires ca performance marge rapprochement',drivers:'chauffeur conducteur véhicule validation kyc',clients:'client passager utilisateur',rides:'course trajet réservation mobilité',documents:'document permis identité conformité kyc',support:'support incident litige réclamation',payments:'paiement encaissement transaction remboursement',payouts:'paie chauffeur versement rémunération',commissions:'commission frais tarification marge',markets:'pays tarif devise marché',data:'donnée import fichier excel csv base',analytics:'power bi analytique dashboard reporting bi',sql:'sql requête postgresql base donnée',sharing:'partage export csv excel donnée',operations:'paramètres métier exploitation dispatch',integrations:'api intégration maps paiement mobile money',notifications:'alerte notification',admins:'administrateur compte identifiant',security:'sécurité rôle permission 2fa session',audit:'audit journal historique trace',settings:'paramètres général entreprise devise pays'
};
let cfg={...defaults,...readJson(STORE,{})};
let ui={compact:false,...readJson(UI,{})};
function readJson(k,f){try{return JSON.parse(localStorage.getItem(k)||'')||f}catch{return f}}
function saveJson(k,v){localStorage.setItem(k,JSON.stringify(v))}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function notify(text){const t=$('toast');if(t){t.textContent=text;t.classList.add('on');clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.classList.remove('on'),2600)}}
function actor(){return ($('adminIdentity')?.textContent||'Administrateur FAST').trim()}
function log(action,scope='Configuration'){const rows=readJson(AUDIT,[]);rows.unshift({at:new Date().toISOString(),action,scope,actor:actor()});saveJson(AUDIT,rows.slice(0,200));renderAudit()}
function setValue(id,v){const e=$(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=v??''}
function getValue(id,fallback=''){const e=$(id);if(!e)return fallback;if(e.type==='checkbox')return !!e.checked;return e.value}
function num(id,fallback=0){const v=Number(getValue(id,fallback));return Number.isFinite(v)?v:fallback}
function persist(message='Paramètres enregistrés'){saveJson(STORE,cfg);renderSummary();log(message);notify(message)}
function hydrate(){Object.keys(cfg).forEach(k=>setValue(`cfg-${k}`,cfg[k]));renderSummary();renderAudit();applyUiState()}
function renderSummary(){
  if($('financeCommissionKpi'))$('financeCommissionKpi').textContent=`${Number(cfg.platformCommission||0).toLocaleString('fr-FR')} %`;
  if($('financeCurrencyKpi'))$('financeCurrencyKpi').textContent=cfg.currency||'XAF';
  if($('opsCountryKpi'))$('opsCountryKpi').textContent=cfg.country||'CG';
  if($('opsMinFareKpi'))$('opsMinFareKpi').textContent=`${Number(cfg.minimumFare||0).toLocaleString('fr-FR')} ${cfg.currency||''}`;
  if($('security2faKpi'))$('security2faKpi').textContent=cfg.require2FA?'Activée':'Désactivée';
  if($('securitySessionKpi'))$('securitySessionKpi').textContent=`${cfg.sessionTimeout||60} min`;
}
function bindSave(id,handler,message){const b=$(id);if(!b)return;b.addEventListener('click',()=>{handler();persist(message)})}
function tableToCsv(tableId,name){
  const tbody=$(tableId);if(!tbody){notify('Données non disponibles');return}
  const table=tbody.closest('table');if(!table){notify('Table introuvable');return}
  const visible=[...table.querySelectorAll('tr')].filter(tr=>tr.style.display!=='none');
  const rows=visible.map(tr=>[...tr.querySelectorAll('th,td')].filter(c=>getComputedStyle(c).display!=='none').map(td=>`"${(td.innerText||'').trim().replace(/"/g,'""')}"`).join(';'));
  const csv='\ufeff'+rows.join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`FAST_${name}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000);log(`Export CSV : ${name}`,'Partage de données');notify(`Export ${name} généré`);
}
async function copyText(text,label='Copié'){try{await navigator.clipboard.writeText(text);notify(label)}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();notify(label)}}
function renderAudit(){
  const box=$('auditLog');if(!box)return;let rows=readJson(AUDIT,[]);const q=($('enterpriseAuditSearch')?.value||'').trim().toLowerCase();
  if(q)rows=rows.filter(r=>`${r.action||''} ${r.scope||''} ${r.actor||''}`.toLowerCase().includes(q));
  if(!rows.length){box.innerHTML='<div class="table-empty">Aucune action correspondant aux filtres.</div>';return}
  box.innerHTML=rows.slice(0,60).map(r=>`<div class="audit-line"><small>${new Date(r.at).toLocaleString('fr-FR')}</small><div><b>${esc(r.action)}</b><small>${esc(r.scope)} • ${esc(r.actor||'Administrateur')}</small></div><span class="status-dot ok">Enregistré</span></div>`).join('')
}
function currentPage(){return document.querySelector('#nav [data-page].active')?.dataset.page||document.querySelector('.page.active')?.id?.replace('page-','')||'dashboard'}
function navigate(page){const b=document.querySelector(`#nav [data-page="${CSS.escape(page)}"]`);if(b)b.click()}
function setupNavigation(){
  document.querySelectorAll('#nav [data-page]').forEach(btn=>btn.addEventListener('click',()=>{const p=btn.dataset.page;setTimeout(()=>{if(titles[p]&&$('pageTitle'))$('pageTitle').textContent=titles[p];updateContextBar(p);closePalette()},0)}));
}
function setupForms(){
  bindSave('saveGeneralSettings',()=>{['companyName','legalName','country','currency','timezone','supportEmail','supportPhone'].forEach(k=>cfg[k]=getValue(`cfg-${k}`,cfg[k]))},'Paramètres généraux mis à jour');
  bindSave('saveCommissionSettings',()=>{['platformCommission','driverCommission','cancellationFee','minimumFare','waitingMinute','dynamicMultiplier'].forEach(k=>cfg[k]=num(`cfg-${k}`,cfg[k]))},'Commissions et tarifs métier mis à jour');
  bindSave('saveOperationSettings',()=>{['autoDispatch','cashEnabled','cardEnabled','mobileMoneyEnabled','driverSignup','scheduledRides','dynamicPricing','requireDriverDocs'].forEach(k=>cfg[k]=getValue(`cfg-${k}`,cfg[k]))},'Paramètres d’exploitation mis à jour');
  bindSave('saveSecuritySettings',()=>{cfg.require2FA=getValue('cfg-require2FA',cfg.require2FA);cfg.sessionTimeout=num('cfg-sessionTimeout',cfg.sessionTimeout);cfg.exportWatermark=getValue('cfg-exportWatermark',cfg.exportWatermark)},'Paramètres de sécurité mis à jour');
  bindSave('saveNotificationSettings',()=>{['notifyNewDriver','notifyPendingDocument','notifyFailedPayment','notifyLargeRide'].forEach(k=>cfg[k]=getValue(`cfg-${k}`,cfg[k]))},'Préférences de notification mises à jour');
  $('resetBusinessSettings')?.addEventListener('click',()=>{cfg={...defaults};saveJson(STORE,cfg);hydrate();log('Réinitialisation des paramètres métier');notify('Paramètres réinitialisés')});
}
function setupSharing(){
  const map={shareDrivers:['driversBody','Chauffeurs'],shareClients:['clientsBody','Clients'],shareRides:['ridesBody','Courses'],sharePayments:['paymentsBody','Paiements'],sharePayouts:['payoutsBody','Paie_chauffeurs']};
  Object.entries(map).forEach(([id,[table,name]])=>$(id)?.addEventListener('click',()=>tableToCsv(table,name)));
  $('copySqlReadOnly')?.addEventListener('click',()=>copyText("-- Exemple de vue Power BI / reporting\nSELECT created_at, country_code, status, estimated_price, final_price\nFROM public.rides\nWHERE created_at >= CURRENT_DATE - INTERVAL '90 days'\nORDER BY created_at DESC;",'Requête SQL copiée'));
  $('copySqlFinance')?.addEventListener('click',()=>copyText("-- Chiffre d'affaires par devise\nSELECT currency, COUNT(*) AS transactions, SUM(amount) AS chiffre_affaires\nFROM public.payments\nWHERE status = 'paid'\nGROUP BY currency\nORDER BY chiffre_affaires DESC;",'Requête finance copiée'));
  $('copySqlDrivers')?.addEventListener('click',()=>copyText("-- Suivi opérationnel chauffeurs\nSELECT status, is_verified, COUNT(*) AS chauffeurs\nFROM public.driver_profiles\nGROUP BY status, is_verified\nORDER BY chauffeurs DESC;",'Requête chauffeurs copiée'));
  $('copyPowerBiSteps')?.addEventListener('click',()=>copyText("Power BI Desktop > Obtenir des données > PostgreSQL > renseigner le serveur PostgreSQL > sélectionner la base > mode Import ou DirectQuery > choisir les vues de reporting autorisées > publier dans l'espace de travail Power BI.",'Étapes Power BI copiées'));
}
function setupAudit(){
  $('clearAuditBtn')?.addEventListener('click',()=>{if(confirm('Effacer le journal local affiché sur ce navigateur ?')){saveJson(AUDIT,[]);renderAudit();notify('Journal local effacé')}});
}
function setupIntegrationButtons(){document.querySelectorAll('[data-integration-action]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.integrationAction;log(`Ouverture de la configuration : ${name}`,'Intégrations');notify(`${name} : configuration prête à être renseignée`)}))}
function setupFinanceLinks(){$('openPaymentsFromFinance')?.addEventListener('click',()=>navigate('payments'));$('openPayoutsFromFinance')?.addEventListener('click',()=>navigate('payouts'))}

/* Enterprise shell inspired by mature internal admin tools */
function injectEnterpriseShell(){
  if($('enterpriseControlBar'))return;
  const top=document.querySelector('.topbar');if(!top)return;
  const bar=document.createElement('section');bar.id='enterpriseControlBar';bar.className='enterprise-control';bar.innerHTML=`
    <div class="enterprise-context"><span id="enterpriseBreadcrumb">FAST / Tableau de bord</span><button id="pinCurrentView" class="icon-action" type="button" title="Épingler cette vue">☆</button></div>
    <div class="enterprise-tools">
      <button id="globalSearchBtn" class="search-command" type="button"><span>⌕</span><span>Rechercher dans FAST</span><kbd>Ctrl K</kbd></button>
      <select id="globalPeriod" aria-label="Période"><option value="all">Toutes périodes</option><option value="today">Aujourd’hui</option><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option></select>
      <input id="globalTextFilter" type="search" placeholder="Filtrer la vue…" aria-label="Filtrer la vue">
      <button id="columnManagerBtn" class="icon-action" type="button" title="Choisir les colonnes">Colonnes</button>
      <button id="compactModeBtn" class="icon-action" type="button" title="Mode compact">Densité</button>
      <button id="savedViewsBtn" class="icon-action" type="button">Vues</button>
    </div>`;
  top.insertAdjacentElement('afterend',bar);
  injectPalette();injectDrawer();injectSavedViews();injectColumnPanel();injectAuditFilter();
}
function updateContextBar(page=currentPage()){
  const bc=$('enterpriseBreadcrumb');if(bc)bc.textContent=`FAST / ${titles[page]||'Administration'}`;
  const pin=$('pinCurrentView');if(pin){const saved=readJson(VIEWS,[]).some(v=>v.page===page&&v.favorite);pin.textContent=saved?'★':'☆';pin.classList.toggle('is-pinned',saved)}
  setTimeout(()=>applyGlobalRowFilter(),60);
}
function injectPalette(){
  const d=document.createElement('div');d.id='commandPalette';d.className='command-palette hidden';d.innerHTML=`<div class="command-dialog"><div class="command-head"><span>⌕</span><input id="commandSearch" placeholder="Rechercher une page, une action, une donnée…" autocomplete="off"><kbd>Esc</kbd></div><div id="commandResults" class="command-results"></div><div class="command-foot">↑↓ naviguer • Entrée ouvrir • Ctrl+K rechercher</div></div>`;document.body.appendChild(d);
  d.addEventListener('click',e=>{if(e.target===d)closePalette()});
}
function commandItems(q=''){
  const term=q.trim().toLowerCase();return Object.keys(titles).map(page=>({page,title:titles[page],keywords:pageKeywords[page]||''})).filter(x=>!term||`${x.title} ${x.keywords}`.toLowerCase().includes(term));
}
function renderCommands(){const box=$('commandResults'),q=$('commandSearch')?.value||'';if(!box)return;const items=commandItems(q);box.innerHTML=items.length?items.map((x,i)=>`<button class="command-item ${i===0?'selected':''}" data-command-page="${esc(x.page)}" type="button"><span class="command-icon">${i<9?String(i+1):'•'}</span><span><b>${esc(x.title)}</b><small>${esc((x.keywords||'').split(' ').slice(0,5).join(' '))}</small></span><span class="command-arrow">→</span></button>`).join(''):'<div class="command-empty">Aucun résultat</div>';box.querySelectorAll('[data-command-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.commandPage)))}
function openPalette(){const d=$('commandPalette');if(!d)return;d.classList.remove('hidden');renderCommands();setTimeout(()=>$('commandSearch')?.focus(),10)}
function closePalette(){$('commandPalette')?.classList.add('hidden')}
function moveCommand(dir){const items=[...document.querySelectorAll('.command-item')];if(!items.length)return;let i=items.findIndex(x=>x.classList.contains('selected'));items.forEach(x=>x.classList.remove('selected'));i=(i+dir+items.length)%items.length;items[i].classList.add('selected');items[i].scrollIntoView({block:'nearest'})}
function setupCommandPalette(){
  $('globalSearchBtn')?.addEventListener('click',openPalette);$('commandSearch')?.addEventListener('input',renderCommands);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return}if(!$('commandPalette')?.classList.contains('hidden')){if(e.key==='Escape'){e.preventDefault();closePalette()}else if(e.key==='ArrowDown'){e.preventDefault();moveCommand(1)}else if(e.key==='ArrowUp'){e.preventDefault();moveCommand(-1)}else if(e.key==='Enter'){const s=document.querySelector('.command-item.selected');if(s){e.preventDefault();navigate(s.dataset.commandPage)}}}})
}
function applyGlobalRowFilter(){
  const page=document.querySelector('.page.active');if(!page)return;const q=($('globalTextFilter')?.value||'').trim().toLowerCase();const period=$('globalPeriod')?.value||'all';
  page.querySelectorAll('tbody tr').forEach(tr=>{
    let visible=!q||(tr.innerText||'').toLowerCase().includes(q);
    if(visible&&period!=='all'&&period!=='today'){
      const text=tr.innerText||'';const m=text.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/);if(m){const p=m[1].split(/[\/.-]/).map(Number);let dt=p[2]>1900?new Date(p[2],p[1]-1,p[0]):new Date(p[0]>1900?p[0]:p[2]+2000,p[1]-1,p[0]);if(!isNaN(dt)){const cut=new Date();cut.setDate(cut.getDate()-Number(period));visible=dt>=cut}}
    }
    tr.style.display=visible?'':'none';
  });
}
function setupGlobalFilters(){
  $('globalTextFilter')?.addEventListener('input',applyGlobalRowFilter);$('globalPeriod')?.addEventListener('change',()=>{applyGlobalRowFilter();log(`Filtre période : ${$('globalPeriod').value}`,'Vue')});
  $('compactModeBtn')?.addEventListener('click',()=>{ui.compact=!ui.compact;saveJson(UI,ui);applyUiState();notify(ui.compact?'Mode compact activé':'Mode confortable activé')});
}
function applyUiState(){document.body.classList.toggle('enterprise-compact',!!ui.compact);const b=$('compactModeBtn');if(b)b.classList.toggle('active',!!ui.compact)}
function injectDrawer(){const d=document.createElement('aside');d.id='recordDrawer';d.className='record-drawer hidden';d.innerHTML=`<div class="drawer-head"><div><small>Détail de l’enregistrement</small><h2 id="drawerTitle">FAST</h2></div><button id="closeDrawer" type="button">×</button></div><div id="drawerBody" class="drawer-body"></div>`;document.body.appendChild(d);$('closeDrawer')?.addEventListener('click',()=>d.classList.add('hidden'))}
function openRowDrawer(tr){
  const table=tr.closest('table');if(!table)return;const headers=[...table.querySelectorAll('thead th')].map(x=>(x.innerText||'').trim());const cells=[...tr.children];if(!cells.length)return;
  const pairs=cells.map((c,i)=>({k:headers[i]||`Champ ${i+1}`,v:(c.innerText||'').trim()})).filter(x=>x.v);$('drawerTitle').textContent=pairs[0]?.v||titles[currentPage()]||'Détail';$('drawerBody').innerHTML=pairs.map(x=>`<div class="drawer-field"><span>${esc(x.k)}</span><b>${esc(x.v)}</b></div>`).join('');$('recordDrawer').classList.remove('hidden');log(`Consultation détail : ${pairs[0]?.v||'enregistrement'}`,titles[currentPage()]||'Données')
}
function setupDrillThrough(){document.addEventListener('click',e=>{const tr=e.target.closest('tbody tr');if(!tr||e.target.closest('button,a,input,select,label'))return;const page=tr.closest('.page');if(!page?.classList.contains('active'))return;openRowDrawer(tr)})}
function injectSavedViews(){const p=document.createElement('div');p.id='savedViewsPanel';p.className='floating-panel hidden';p.innerHTML=`<div class="floating-head"><b>Vues sauvegardées</b><button data-close-floating="savedViewsPanel">×</button></div><div id="savedViewsList"></div><div class="floating-actions"><button id="saveCurrentView" class="primary" type="button">Enregistrer la vue actuelle</button></div>`;document.body.appendChild(p)}
function renderSavedViews(){const box=$('savedViewsList');if(!box)return;const views=readJson(VIEWS,[]);box.innerHTML=views.length?views.map((v,i)=>`<div class="saved-view"><button data-open-view="${i}" type="button"><b>${esc(v.name)}</b><small>${esc(titles[v.page]||v.page)} • ${esc(v.period||'all')}</small></button><button data-favorite-view="${i}" class="star" title="Favori">${v.favorite?'★':'☆'}</button><button data-delete-view="${i}" class="trash" title="Supprimer">×</button></div>`).join(''):'<div class="table-empty">Aucune vue enregistrée.</div>';box.querySelectorAll('[data-open-view]').forEach(b=>b.addEventListener('click',()=>openSavedView(Number(b.dataset.openView))));box.querySelectorAll('[data-favorite-view]').forEach(b=>b.addEventListener('click',()=>toggleFavorite(Number(b.dataset.favoriteView))));box.querySelectorAll('[data-delete-view]').forEach(b=>b.addEventListener('click',()=>deleteSavedView(Number(b.dataset.deleteView))))}
function saveCurrentView(favorite=false){const page=currentPage(),period=$('globalPeriod')?.value||'all',filter=$('globalTextFilter')?.value||'';const name=prompt('Nom de cette vue :',`${titles[page]||page} — ${new Date().toLocaleDateString('fr-FR')}`);if(!name)return;const views=readJson(VIEWS,[]);views.unshift({name,page,period,filter,favorite,createdAt:new Date().toISOString()});saveJson(VIEWS,views.slice(0,30));renderSavedViews();updateContextBar(page);log(`Vue sauvegardée : ${name}`,'Navigation');notify('Vue enregistrée')}
function openSavedView(i){const v=readJson(VIEWS,[])[i];if(!v)return;navigate(v.page);if($('globalPeriod'))$('globalPeriod').value=v.period||'all';if($('globalTextFilter'))$('globalTextFilter').value=v.filter||'';setTimeout(applyGlobalRowFilter,100);$('savedViewsPanel')?.classList.add('hidden')}
function toggleFavorite(i){const views=readJson(VIEWS,[]);if(!views[i])return;views[i].favorite=!views[i].favorite;saveJson(VIEWS,views);renderSavedViews();updateContextBar()}
function deleteSavedView(i){const views=readJson(VIEWS,[]);views.splice(i,1);saveJson(VIEWS,views);renderSavedViews();updateContextBar();notify('Vue supprimée')}
function setupSavedViews(){
  $('savedViewsBtn')?.addEventListener('click',()=>{renderSavedViews();$('savedViewsPanel')?.classList.toggle('hidden')});$('saveCurrentView')?.addEventListener('click',()=>saveCurrentView(false));$('pinCurrentView')?.addEventListener('click',()=>saveCurrentView(true));
  document.querySelectorAll('[data-close-floating]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.closeFloating)?.classList.add('hidden')))
}
function injectColumnPanel(){const p=document.createElement('div');p.id='columnPanel';p.className='floating-panel hidden';p.innerHTML=`<div class="floating-head"><b>Colonnes affichées</b><button data-close-columns>×</button></div><div id="columnOptions"></div></div>`;document.body.appendChild(p);p.querySelector('[data-close-columns]')?.addEventListener('click',()=>p.classList.add('hidden'))}
function renderColumnOptions(){const box=$('columnOptions'),table=document.querySelector('.page.active table');if(!box)return;if(!table){box.innerHTML='<div class="table-empty">Aucun tableau sur cette page.</div>';return}const th=[...table.querySelectorAll('thead th')];box.innerHTML=th.map((h,i)=>`<label class="column-option"><input type="checkbox" data-column-index="${i}" ${getComputedStyle(h).display==='none'?'':'checked'}><span>${esc((h.innerText||`Colonne ${i+1}`).trim())}</span></label>`).join('');box.querySelectorAll('[data-column-index]').forEach(c=>c.addEventListener('change',()=>toggleColumn(table,Number(c.dataset.columnIndex),c.checked)))}
function toggleColumn(table,i,show){table.querySelectorAll('tr').forEach(tr=>{const c=tr.children[i];if(c)c.style.display=show?'':'none'})}
function setupColumns(){$('columnManagerBtn')?.addEventListener('click',()=>{renderColumnOptions();$('columnPanel')?.classList.toggle('hidden')})}
function injectAuditFilter(){const page=$('page-audit');if(!page||$('enterpriseAuditSearch'))return;const panel=page.querySelector('.panel:nth-of-type(2)')||page.querySelector('.panel');if(!panel)return;const s=document.createElement('div');s.className='audit-filterbar';s.innerHTML='<input id="enterpriseAuditSearch" type="search" placeholder="Filtrer par action, rubrique ou administrateur…"><button id="exportAuditCsv" type="button">Exporter CSV</button>';panel.insertBefore(s,panel.children[1]||null);$('enterpriseAuditSearch')?.addEventListener('input',renderAudit);$('exportAuditCsv')?.addEventListener('click',exportAudit)}
function exportAudit(){const rows=readJson(AUDIT,[]);const csv='\ufeffDate;Administrateur;Rubrique;Action\r\n'+rows.map(r=>[new Date(r.at).toLocaleString('fr-FR'),r.actor||'',r.scope||'',r.action||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`FAST_Audit_${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);log('Export du journal d’audit','Sécurité');notify('Journal d’audit exporté')}
function setupEnterpriseShell(){injectEnterpriseShell();setupCommandPalette();setupGlobalFilters();setupSavedViews();setupColumns();setupDrillThrough();updateContextBar();}

function init(){setupNavigation();setupForms();setupSharing();setupAudit();setupIntegrationButtons();setupFinanceLinks();hydrate();setupEnterpriseShell();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
