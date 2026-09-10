(()=>{
'use strict';
const API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-site-admin';
const OFFICIAL='https://fast-n1-officiel.vercel.app/';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function token(){return localStorage.getItem('fast_admin_token')||''}
function notify(msg,ok=true){const n=$('siteEditorStatus');if(n){n.textContent=msg;n.className='site-editor-status '+(ok?'ok':'bad')}else if(typeof toast==='function')toast(msg)}
async function request(path,opts={}){const r=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json','x-fast-admin-token':token(),...(opts.headers||{})},cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);return d}
const field=(id,label,value='',type='text')=>`<label>${esc(label)}<input id="${id}" type="${type}" value="${esc(value)}"></label>`;
const area=(id,label,value='')=>`<label class="full">${esc(label)}<textarea id="${id}">${esc(value)}</textarea></label>`;
function value(id){return ($(id)?.value||'').trim()}
async function refresh(){
  if(!token()||!$('siteEditor')||!$('bankEditor'))return;
  $('siteEditor').innerHTML='<div class="editor-loading">Chargement de la configuration du site…</div>';
  $('bankEditor').innerHTML='<div class="editor-loading">Chargement des informations bancaires…</div>';
  try{
    const [c,b]=await Promise.all([request('/config'),request('/bank')]),x=c.config||{},k=b.bank||{};
    $('siteEditor').innerHTML=`<div class="site-grid">${field('scBrand','Nom de la marque',x.brand_name)}${field('scColor','Couleur principale',x.primary_color||'#0b57d0','color')}${field('scHero','Titre principal',x.hero_title)}${field('scCta1','Bouton principal',x.cta_primary)}${field('scCta2','Bouton secondaire',x.cta_secondary)}${area('scHeroSub','Sous-titre',x.hero_subtitle)}${field('scAboutTitle','Titre présentation',x.about_title)}${area('scAbout','Présentation de l’activité',x.about_text)}${field('scServicesTitle','Titre des services',x.services_title)}${field('scS1Title','Service 1',x.service_1_title)}${area('scS1Text','Description service 1',x.service_1_text)}${field('scS2Title','Service 2',x.service_2_title)}${area('scS2Text','Description service 2',x.service_2_text)}${field('scS3Title','Service 3',x.service_3_title)}${area('scS3Text','Description service 3',x.service_3_text)}${field('scSafetyTitle','Titre sécurité',x.safety_title)}${area('scSafety','Texte sécurité',x.safety_text)}${field('scEmail','E-mail de contact',x.contact_email,'email')}${field('scPhone','Téléphone',x.contact_phone,'tel')}</div><div class="site-toggles"><label><input id="scShowServices" type="checkbox" ${x.show_services!==false?'checked':''}> Afficher les services</label><label><input id="scShowSafety" type="checkbox" ${x.show_safety!==false?'checked':''}> Afficher la sécurité</label><label><input id="scShowCountries" type="checkbox" ${x.show_countries!==false?'checked':''}> Afficher les pays</label></div>`;
    $('bankEditor').innerHTML=`<div class="site-grid">${field('bkHolder','Titulaire',k.account_holder)}${field('bkCurrency','Devise',k.currency||'EUR')}${field('bkIban','IBAN',k.iban)}${field('bkBic','BIC / SWIFT',k.bic_swift)}${field('bkBank','Banque',k.bank_name)}${field('bkCorrespondent','SWIFT correspondant',k.correspondent_swift)}${area('bkAddress','Adresse de la banque',k.bank_address)}</div>`;
    notify('Configuration chargée.');
  }catch(e){
    $('siteEditor').innerHTML='<div class="editor-error">Impossible de charger le site officiel.</div>';
    $('bankEditor').innerHTML='<div class="editor-error">Impossible de charger les informations bancaires.</div>';
    notify(e.message||'Chargement impossible',false);
  }
}
async function saveSite(){
  try{
    const config={brand_name:value('scBrand'),primary_color:value('scColor'),hero_title:value('scHero'),hero_subtitle:value('scHeroSub'),cta_primary:value('scCta1'),cta_secondary:value('scCta2'),about_title:value('scAboutTitle'),about_text:value('scAbout'),services_title:value('scServicesTitle'),service_1_title:value('scS1Title'),service_1_text:value('scS1Text'),service_2_title:value('scS2Title'),service_2_text:value('scS2Text'),service_3_title:value('scS3Title'),service_3_text:value('scS3Text'),safety_title:value('scSafetyTitle'),safety_text:value('scSafety'),contact_email:value('scEmail'),contact_phone:value('scPhone'),show_services:!!$('scShowServices')?.checked,show_safety:!!$('scShowSafety')?.checked,show_countries:!!$('scShowCountries')?.checked};
    const b=$('saveSiteBtn');if(b){b.disabled=true;b.textContent='Enregistrement…'}
    await request('/config',{method:'POST',body:JSON.stringify({config})});notify('Site officiel enregistré. Les modifications sont publiées immédiatement.');
    if(b){b.disabled=false;b.textContent='Enregistrer le site'}
  }catch(e){const b=$('saveSiteBtn');if(b){b.disabled=false;b.textContent='Enregistrer le site'}notify(e.message||'Enregistrement impossible',false)}
}
async function saveBank(){
  try{
    const bank={account_holder:value('bkHolder'),currency:value('bkCurrency').toUpperCase(),iban:value('bkIban'),bic_swift:value('bkBic').toUpperCase(),bank_name:value('bkBank'),correspondent_swift:value('bkCorrespondent').toUpperCase(),bank_address:value('bkAddress'),active:true};
    const b=$('saveBankBtn');if(b){b.disabled=true;b.textContent='Enregistrement…'}
    await request('/bank',{method:'POST',body:JSON.stringify(bank)});notify('Informations bancaires enregistrées dans FAST.');
    if(b){b.disabled=false;b.textContent='Enregistrer les informations bancaires'}
  }catch(e){const b=$('saveBankBtn');if(b){b.disabled=false;b.textContent='Enregistrer les informations bancaires'}notify(e.message||'Enregistrement impossible',false)}
}
function style(){if($('siteEditorDynamicStyle'))return;const s=document.createElement('style');s.id='siteEditorDynamicStyle';s.textContent=`.site-editor-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.site-editor-actions button{min-height:44px}.site-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.site-grid label{display:grid;gap:7px;font-size:12px;font-weight:800;color:#46556b}.site-grid label.full{grid-column:1/-1}.site-grid input,.site-grid textarea{width:100%;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:11px 12px;outline:none;color:#172033}.site-grid textarea{min-height:92px;resize:vertical}.site-toggles{display:flex;gap:18px;flex-wrap:wrap;margin-top:16px}.site-toggles label{font-size:12px;font-weight:750}.site-editor-status{margin-top:12px;padding:10px 12px;border-radius:10px;font-size:12px}.site-editor-status.ok{background:#ecfdf3;color:#027a48}.site-editor-status.bad{background:#fff1f0;color:#b42318}.editor-loading,.editor-error{padding:18px;border-radius:12px;background:#f7f9fc;color:#667085}.editor-error{background:#fff1f0;color:#b42318}@media(max-width:760px){.site-grid{grid-template-columns:1fr}}`;document.head.appendChild(s)}
function bind(){style();const web=document.querySelector('#nav [data-page="website"]');if(web)web.addEventListener('click',()=>setTimeout(refresh,30));$('previewFastSite')?.addEventListener('click',()=>window.open(OFFICIAL,'_blank','noopener'));$('saveSiteBtn')?.addEventListener('click',saveSite);$('saveBankBtn')?.addEventListener('click',saveBank);$('reloadSiteBtn')?.addEventListener('click',refresh);let prev=!!token();setInterval(()=>{const now=!!token();if(now&&!prev)setTimeout(refresh,50);prev=now},500);if(token())setTimeout(refresh,100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,20));else setTimeout(bind,20);
})();
