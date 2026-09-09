(()=>{
'use strict';
const $=id=>document.getElementById(id);
const STORE='fast_business_workspace_v1';
const AUDIT='fast_admin_audit_v1';
const defaults={
  companyName:'FAST N°1',legalName:'',country:'CG',currency:'XAF',timezone:'Africa/Brazzaville',supportEmail:'',supportPhone:'',
  platformCommission:20,driverCommission:80,cancellationFee:1000,minimumFare:1500,waitingMinute:100,dynamicMultiplier:1.25,
  autoDispatch:true,cashEnabled:true,cardEnabled:true,mobileMoneyEnabled:true,driverSignup:true,scheduledRides:true,dynamicPricing:false,
  requireDriverDocs:true,require2FA:false,sessionTimeout:60,exportWatermark:true,
  notifyNewDriver:true,notifyPendingDocument:true,notifyFailedPayment:true,notifyLargeRide:false
};
const titles={
  finance:'Finance & performance',commissions:'Commissions & frais',analytics:'Power BI & analytique',sql:'SQL & requêtes',sharing:'Partage & exports',
  operations:'Paramètres métier',integrations:'Intégrations',support:'Support & incidents',notifications:'Notifications',security:'Sécurité & accès',audit:'Journal d’audit',settings:'Paramètres généraux'
};
let cfg={...defaults,...readJson(STORE,{})};
function readJson(k,f){try{return JSON.parse(localStorage.getItem(k)||'')||f}catch{return f}}
function saveJson(k,v){localStorage.setItem(k,JSON.stringify(v))}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function notify(text){const t=$('toast');if(t){t.textContent=text;t.classList.add('on');clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.classList.remove('on'),2600)}}
function log(action,scope='Configuration'){const rows=readJson(AUDIT,[]);rows.unshift({at:new Date().toISOString(),action,scope});saveJson(AUDIT,rows.slice(0,80));renderAudit()}
function setValue(id,v){const e=$(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=v??''}
function getValue(id,fallback=''){const e=$(id);if(!e)return fallback;if(e.type==='checkbox')return !!e.checked;return e.value}
function num(id,fallback=0){const v=Number(getValue(id,fallback));return Number.isFinite(v)?v:fallback}
function persist(message='Paramètres enregistrés'){
  saveJson(STORE,cfg);renderSummary();log(message);notify(message);
}
function hydrate(){
  Object.keys(cfg).forEach(k=>setValue(`cfg-${k}`,cfg[k]));renderSummary();renderAudit();
}
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
  const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>`"${(td.innerText||'').trim().replace(/"/g,'""')}"`).join(';'));
  const csv='\ufeff'+rows.join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`FAST_${name}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000);log(`Export CSV : ${name}`,'Partage de données');notify(`Export ${name} généré`);
}
async function copyText(text,label='Copié'){try{await navigator.clipboard.writeText(text);notify(label)}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();notify(label)}}
function renderAudit(){const box=$('auditLog');if(!box)return;const rows=readJson(AUDIT,[]);if(!rows.length){box.innerHTML='<div class="table-empty">Aucune action enregistrée sur ce navigateur.</div>';return}box.innerHTML=rows.slice(0,30).map(r=>`<div class="audit-line"><small>${new Date(r.at).toLocaleString('fr-FR')}</small><div><b>${esc(r.action)}</b><small>${esc(r.scope)}</small></div><span class="status-dot ok">Enregistré</span></div>`).join('')}
function setupNavigation(){document.querySelectorAll('#nav [data-page]').forEach(btn=>btn.addEventListener('click',()=>{const p=btn.dataset.page;setTimeout(()=>{if(titles[p]&&$('pageTitle'))$('pageTitle').textContent=titles[p]},0)}))}
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
function setupIntegrationButtons(){
  document.querySelectorAll('[data-integration-action]').forEach(b=>b.addEventListener('click',()=>{const name=b.dataset.integrationAction;log(`Ouverture de la configuration : ${name}`,'Intégrations');notify(`${name} : configuration prête à être renseignée`) }));
}
function setupFinanceLinks(){
  $('openPaymentsFromFinance')?.addEventListener('click',()=>document.querySelector('#nav [data-page="payments"]')?.click());
  $('openPayoutsFromFinance')?.addEventListener('click',()=>document.querySelector('#nav [data-page="payouts"]')?.click());
}
function init(){setupNavigation();setupForms();setupSharing();setupAudit();setupIntegrationButtons();setupFinanceLinks();hydrate();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
