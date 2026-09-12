(()=>{
'use strict';

const MAIN_API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-api';
const MANUAL_API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-manual';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cache=null;

function adminToken(){return localStorage.getItem('fast_admin_token')||''}
function toast(message){const t=$('toast');if(!t)return;t.textContent=String(message||'');t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('on'),3000)}
function openModal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden')}
function refreshAdmin(){cache=null;const b=$('refreshBtn');if(b)b.click()}
function val(id){return ($(id)?.value||'').trim()}
function isChecked(id){return !!$(id)?.checked}
function busy(btn,on,label='Enregistrer'){if(!btn)return;btn.disabled=on;btn.textContent=on?'Enregistrement…':label}
function nameOf(p){return `${p?.first_name||''} ${p?.last_name||''}`.trim()||String(p?.id||'').slice(0,8)}
function csv(v){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}

async function request(base,path,opts={}){
  const headers={'Content-Type':'application/json','x-fast-admin-token':adminToken(),...(opts.headers||{})};
  const r=await fetch(base+path,{...opts,headers,cache:'no-store'});
  let data={};try{data=await r.json()}catch{}
  if(r.status===401)throw new Error('Session administrateur expirée. Reconnectez-vous.');
  if(!r.ok||data.ok===false)throw new Error(data.error||data.detail||`HTTP ${r.status}`);
  return data;
}
async function snapshot(force=false){
  if(cache&&!force)return cache;
  const d=await request(MAIN_API,'/snapshot');cache=d.data||{};return cache;
}

function field(label,id,value='',type='text',attrs=''){
  return `<label>${esc(label)}<input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
}
function selectField(label,id,options,current=''){
  const html=options.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(l)}</option>`).join('');
  return `<label>${esc(label)}<select id="${id}">${html}</select></label>`;
}
function form(html){return `<div class="manual-form">${html}</div>`}

async function createUser(role){
  const isDriver=role==='driver';
  openModal(isDriver?'Ajouter manuellement un chauffeur':'Ajouter manuellement un client',form(`
    <div class="manual-grid">
      ${field('Prénom','muFirst')}
      ${field('Nom','muLast')}
      ${field('E-mail de connexion','muEmail','','email','autocomplete="off"')}
      ${field('Téléphone','muPhone','','tel')}
      ${field('Code pays','muCountry','CG','text','maxlength="2"')}
      ${field('Mot de passe provisoire','muPassword','','password','autocomplete="new-password" minlength="8"')}
    </div>
    ${isDriver?'<label class="manual-check"><input id="muVerified" type="checkbox"> Valider immédiatement le chauffeur</label>':''}
    <p class="manual-help">Le compte sera créé directement dans FAST et utilisera les mécanismes existants Supabase pour le profil, le portefeuille et la fiche chauffeur.</p>
    <div class="manual-actions"><button id="muCreate" class="primary" type="button">Créer ${isDriver?'le chauffeur':'le client'}</button></div>
  `));
  $('muCreate').onclick=async()=>{
    const btn=$('muCreate'),label=`Créer ${isDriver?'le chauffeur':'le client'}`;busy(btn,true,label);
    try{
      await request(MANUAL_API,'/user/create',{method:'POST',body:JSON.stringify({
        role,
        first_name:val('muFirst'),last_name:val('muLast'),email:val('muEmail'),phone:val('muPhone'),
        country_code:val('muCountry').toUpperCase(),password:$('muPassword')?.value||'',is_verified:isDriver&&isChecked('muVerified')
      })});
      closeModal();toast(isDriver?'Chauffeur ajouté.':'Client ajouté.');refreshAdmin();
    }catch(e){toast(e.message)}finally{busy(btn,false,label)}
  };
}

async function editUser(role){
  try{
    const s=await snapshot(true);
    const profiles=(s.profiles||[]).filter(p=>String(p.role)===role);
    const drivers=s.drivers||[];
    if(!profiles.length)return toast(role==='driver'?'Aucun chauffeur à modifier.':'Aucun client à modifier.');
    const options=profiles.map(p=>[p.id,`${nameOf(p)} • ${p.phone||'sans téléphone'} • ${p.country_code||'—'}`]);
    openModal(role==='driver'?'Modifier manuellement un chauffeur':'Modifier manuellement un client',form(`
      ${selectField(role==='driver'?'Chauffeur':'Client','muUser',options,profiles[0].id)}
      <div id="muUserFields"></div>
      <div class="manual-actions"><button id="muUpdate" class="primary" type="button">Enregistrer les modifications</button></div>
    `));
    const fill=()=>{
      const p=profiles.find(x=>x.id===$('muUser').value)||profiles[0];
      const d=drivers.find(x=>x.user_id===p.id);
      let html='<div class="manual-grid">';
      html+=field('Prénom','muEditFirst',p.first_name||'');
      html+=field('Nom','muEditLast',p.last_name||'');
      html+=field('Nouvel e-mail (facultatif)','muEditEmail','','email','placeholder="Laisser vide pour conserver"');
      html+=field('Téléphone','muEditPhone',p.phone||'','tel');
      html+=field('Code pays','muEditCountry',p.country_code||'CG','text','maxlength="2"');
      if(role==='driver')html+=selectField('Statut','muEditStatus',[['offline','Hors ligne'],['available','Disponible'],['busy','Occupé']],d?.status||'offline');
      html+='</div>';
      if(role==='driver')html+=`<label class="manual-check"><input id="muEditVerified" type="checkbox" ${d?.is_verified?'checked':''}> Chauffeur vérifié</label>`;
      $('muUserFields').innerHTML=html;
    };
    fill();$('muUser').onchange=fill;
    $('muUpdate').onclick=async()=>{
      const btn=$('muUpdate');busy(btn,true);
      try{
        const payload={id:$('muUser').value,first_name:val('muEditFirst'),last_name:val('muEditLast'),email:val('muEditEmail'),phone:val('muEditPhone'),country_code:val('muEditCountry').toUpperCase()};
        if(role==='driver'){payload.status=$('muEditStatus').value;payload.is_verified=isChecked('muEditVerified')}
        await request(MANUAL_API,'/user/update',{method:'POST',body:JSON.stringify(payload)});
        closeModal();toast('Modifications enregistrées.');refreshAdmin();
      }catch(e){toast(e.message)}finally{busy(btn,false)}
    };
  }catch(e){toast(e.message)}
}

async function readFile(id){
  const f=$(id)?.files?.[0];if(!f)return{};
  if(f.size>8*1024*1024)throw new Error('Fichier trop volumineux : 8 Mo maximum.');
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('Lecture du fichier impossible.'));r.readAsDataURL(f)});
  return {file_b64:dataUrl.split(',')[1]||'',file_name:f.name,mime_type:f.type||'application/octet-stream'};
}
function documentFields(doc=null,includeDriver=false,drivers=[],profiles=[]){
  let html='';
  if(includeDriver){const options=drivers.map(d=>{const p=profiles.find(x=>x.id===d.user_id);return[d.user_id,`${nameOf(p)} • ${p?.phone||'sans téléphone'}`]});html+=selectField('Chauffeur','mdDriver',options,options[0]?.[0]||'')}
  html+='<div class="manual-grid">';
  html+=field('Type de document','mdType',doc?.document_type||'identity');
  html+=field('Code pays','mdCountry',doc?.country_code||'CG','text','maxlength="2"');
  html+=selectField('Statut','mdStatus',[['pending','En attente'],['approved','Validé'],['rejected','Refusé']],doc?.status||'pending');
  html+=field('Expiration','mdExpiry',doc?.expires_at||'','date');
  html+='</div>';
  html+=`<label>Motif du refus<textarea id="mdReason" rows="3" placeholder="Obligatoire uniquement si le statut est Refusé">${esc(doc?.rejection_reason||'')}</textarea></label>`;
  html+=`<label>${includeDriver?'Fichier':'Remplacer le fichier (facultatif)'}<input id="mdFile" type="file" accept="image/*,.pdf,.doc,.docx"></label>`;
  html+=`<p class="manual-help">Taille maximale : 8 Mo. ${includeDriver?'Le fichier est obligatoire pour un nouveau document.':'Laissez le fichier vide pour conserver le fichier actuel.'}</p>`;
  return html;
}
async function createDocument(){
  try{
    const s=await snapshot(true),drivers=s.drivers||[],profiles=s.profiles||[];
    if(!drivers.length)return toast('Ajoutez d’abord un chauffeur.');
    openModal('Ajouter manuellement un document',form(`${documentFields(null,true,drivers,profiles)}<div class="manual-actions"><button id="mdCreate" class="primary" type="button">Ajouter le document</button></div>`));
    $('mdCreate').onclick=async()=>{
      const btn=$('mdCreate');busy(btn,true,'Ajouter le document');
      try{
        const file=await readFile('mdFile');
        await request(MANUAL_API,'/document/create',{method:'POST',body:JSON.stringify({driver_id:$('mdDriver').value,document_type:val('mdType'),country_code:val('mdCountry').toUpperCase(),status:$('mdStatus').value,expires_at:val('mdExpiry'),rejection_reason:val('mdReason'),...file})});
        closeModal();toast('Document ajouté.');refreshAdmin();
      }catch(e){toast(e.message)}finally{busy(btn,false,'Ajouter le document')}
    };
  }catch(e){toast(e.message)}
}
async function editDocument(){
  try{
    const s=await snapshot(true),docs=s.driver_documents||[],profiles=s.profiles||[];
    if(!docs.length)return toast('Aucun document à modifier.');
    const options=[...docs].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(d=>{const p=profiles.find(x=>x.id===d.driver_id);return[d.id,`${nameOf(p)} • ${d.document_type} • ${d.status}`]});
    openModal('Modifier manuellement un document',form(`${selectField('Document','mdSelect',options,options[0][0])}<div id="mdFields"></div><div class="manual-actions"><button id="mdUpdate" class="primary" type="button">Enregistrer le document</button></div>`));
    const fill=()=>{const d=docs.find(x=>x.id===$('mdSelect').value)||docs[0];$('mdFields').innerHTML=documentFields(d,false)};
    fill();$('mdSelect').onchange=fill;
    $('mdUpdate').onclick=async()=>{
      const btn=$('mdUpdate');busy(btn,true);
      try{
        const file=await readFile('mdFile');
        await request(MANUAL_API,'/document/update',{method:'POST',body:JSON.stringify({id:$('mdSelect').value,document_type:val('mdType'),country_code:val('mdCountry').toUpperCase(),status:$('mdStatus').value,expires_at:val('mdExpiry'),rejection_reason:val('mdReason'),...file})});
        closeModal();toast('Document modifié.');refreshAdmin();
      }catch(e){toast(e.message)}finally{busy(btn,false)}
    };
  }catch(e){toast(e.message)}
}

async function editSettings(){
  try{
    const s=await snapshot(true),markets=s.market_configs||[],pricing=s.market_pricing||[];
    if(!markets.length)return toast('Aucun pays configuré.');
    const options=markets.map(m=>[m.country_code,`${m.country_name} (${m.country_code})`]);
    openModal('Paramétrage manuel FAST',form(`${selectField('Pays','msMarket',options,options[0][0])}<div id="msFields"></div><div class="manual-actions"><button id="msSave" class="primary" type="button">Enregistrer les paramètres</button></div>`));
    const fill=()=>{
      const m=markets.find(x=>x.country_code===$('msMarket').value)||markets[0];
      const p=pricing.find(x=>x.country_code===m.country_code&&x.service_type==='standard')||pricing.find(x=>x.country_code===m.country_code);
      let html='<div class="manual-grid">';
      html+=field('Nom du pays','msName',m.country_name||'');
      html+=field('Devise','msCurrency',m.currency||'XAF','text','maxlength="3"');
      html+=field('Locale','msLocale',m.locale||'fr-FR');
      html+=`<label class="manual-check manual-check-box"><input id="msEnabled" type="checkbox" ${m.enabled?'checked':''}> Pays activé</label>`;
      html+='</div><div class="manual-grid">';
      html+=field('Méthodes de paiement','msPayments',(m.payment_methods||[]).join(', '));
      html+=field('Méthodes de paie chauffeur','msPayouts',(m.payout_methods||[]).join(', '));
      html+=field('Opérateurs Mobile Money','msOperators',(m.mobile_money_operators||[]).join(', '));
      html+=field('Documents requis','msRequirements',(m.document_requirements||[]).join(', '));
      html+='</div>';
      if(p){
        html+=`<input id="msPricingId" type="hidden" value="${esc(p.id)}"><hr class="manual-sep"><h3>Tarif standard</h3><div class="manual-grid manual-grid-3">`;
        html+=field('Prise en charge','msBase',p.base_fare??0,'number','min="0" step="0.01"');
        html+=field('Prix / km','msKm',p.per_km??0,'number','min="0" step="0.01"');
        html+=field('Prix / min','msMin',p.per_minute??0,'number','min="0" step="0.01"');
        html+=field('Minimum','msMinimum',p.minimum_fare??0,'number','min="0" step="0.01"');
        html+=field('Frais réservation','msBooking',p.booking_fee??0,'number','min="0" step="0.01"');
        html+='</div>';
      }
      $('msFields').innerHTML=html;
    };
    fill();$('msMarket').onchange=fill;
    $('msSave').onclick=async()=>{
      const btn=$('msSave');busy(btn,true);
      try{
        const code=$('msMarket').value,currency=val('msCurrency').toUpperCase();
        await request(MAIN_API,'/market/save',{method:'POST',body:JSON.stringify({country_code:code,country_name:val('msName'),currency,locale:val('msLocale')||'fr-FR',enabled:isChecked('msEnabled'),payment_methods:csv(val('msPayments')),payout_methods:csv(val('msPayouts')),mobile_money_operators:csv(val('msOperators')),document_requirements:csv(val('msRequirements'))})});
        if($('msPricingId'))await request(MAIN_API,'/pricing/update',{method:'POST',body:JSON.stringify({id:$('msPricingId').value,base_fare:Number(val('msBase')),per_km:Number(val('msKm')),per_minute:Number(val('msMin')),minimum_fare:Number(val('msMinimum')),booking_fee:Number(val('msBooking')),currency})});
        closeModal();toast('Paramètres enregistrés.');refreshAdmin();
      }catch(e){toast(e.message)}finally{busy(btn,false)}
    };
  }catch(e){toast(e.message)}
}

function injectStyles(){
  if($('fastManualAdminStyles'))return;
  const style=document.createElement('style');style.id='fastManualAdminStyles';style.textContent=`
    .manual-action-group{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto}
    .manual-action-btn{border:1px solid #c9d7e8;background:#fff;color:#17345f;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .manual-action-btn.primary-manual{background:#0b57d0;color:#fff;border-color:#0b57d0}
    .manual-form{display:grid;gap:16px}.manual-form label{display:grid;gap:7px;font-size:13px;font-weight:750;color:#344054}
    .manual-form input,.manual-form select,.manual-form textarea{width:100%;border:1px solid #d0d9e6;border-radius:10px;padding:11px 12px;background:#fff;color:#172033;outline:none}
    .manual-form textarea{resize:vertical}.manual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.manual-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
    .manual-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:9px!important}.manual-check input{width:auto!important}.manual-check-box{padding-top:26px}
    .manual-help{margin:0;color:#667085;font-size:12px;line-height:1.5}.manual-actions{display:flex;justify-content:flex-end;padding-top:4px}.manual-actions .primary{min-width:190px}
    .manual-sep{width:100%;border:0;border-top:1px solid #e5eaf1;margin:2px 0}.manual-form h3{margin:0}
    @media(max-width:720px){.manual-grid,.manual-grid-3{grid-template-columns:1fr}.manual-check-box{padding-top:0}.manual-action-group{width:100%;margin-left:0}.manual-action-btn{flex:1}.manual-actions .primary{width:100%}}
  `;document.head.appendChild(style);
}
function makeButton(label,handler,primary=false){const b=document.createElement('button');b.type='button';b.className='manual-action-btn'+(primary?' primary-manual':'');b.textContent=label;b.addEventListener('click',handler);return b}
function addToolbar(pageId,items){const bar=document.querySelector(`#${pageId} .toolbar`);if(!bar||bar.querySelector('.manual-action-group'))return;const g=document.createElement('div');g.className='manual-action-group';for(const item of items)g.appendChild(makeButton(item[0],item[1],item[2]));bar.appendChild(g)}
function bind(){
  injectStyles();
  addToolbar('page-drivers',[["Ajouter un chauffeur",()=>createUser('driver'),true],["Modifier un chauffeur",()=>editUser('driver'),false]]);
  addToolbar('page-clients',[["Ajouter un client",()=>createUser('client'),true],["Modifier un client",()=>editUser('client'),false]]);
  addToolbar('page-documents',[["Ajouter un document",createDocument,true],["Modifier un document",editDocument,false]]);
  const marketHead=document.querySelector('#page-markets .panel .panel-head');
  if(marketHead&&!marketHead.querySelector('[data-manual-settings]')){const b=makeButton('Paramétrage manuel',editSettings,false);b.dataset.manualSettings='1';marketHead.appendChild(b)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
