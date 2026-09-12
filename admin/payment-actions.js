(()=>{
'use strict';
const API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-api';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const money=(v,c='EUR')=>{try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c,maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(Number(v||0))}catch{return `${Number(v||0).toLocaleString('fr-FR')} ${c}`}};
let timer=null,busy=false,lastSignature='';
function token(){return localStorage.getItem('fast_admin_token')||''}
async function req(path,opts={}){const r=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json','x-fast-admin-token':token(),...(opts.headers||{})},cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok||d.ok===false)throw new Error(d.error||d.detail||`HTTP ${r.status}`);return d}
function loadAdminUsers(){if(document.getElementById('fastAdminUsersScript'))return;const s=document.createElement('script');s.id='fastAdminUsersScript';s.src='admin-users.js?v=20260909-1';s.async=false;document.body.appendChild(s)}
function ensurePanel(){
  const page=$('page-payments');if(!page)return null;let panel=$('bankTransferReviewPanel');if(panel)return panel;
  panel=document.createElement('div');panel.id='bankTransferReviewPanel';panel.className='panel';panel.style.marginBottom='16px';panel.innerHTML='<div class="panel-head"><h2>Virements bancaires à valider</h2><span>Avant départ</span></div><div id="bankTransferReviewBody" class="muted">Chargement…</div>';
  page.insertBefore(panel,page.firstChild);return panel;
}
function fullName(profiles,id){const p=profiles.find(x=>x.id===id);return p?`${p.first_name||''} ${p.last_name||''}`.trim()||String(id||'').slice(0,8):String(id||'').slice(0,8)}
function render(data){
  ensurePanel();const payments=data.payments||[],rides=data.rides||[],profiles=data.profiles||[];
  const rows=payments.filter(p=>p.method_type==='bank_transfer'&&['pending','failed'].includes(String(p.status))).filter(p=>{
    const m=p.metadata||{};return m.client_declared_transfer||m.transfer_submitted_at||p.status==='failed';
  }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const sig=JSON.stringify(rows.map(x=>[x.id,x.status,x.updated_at,x.metadata?.transfer_submitted_at]));if(sig===lastSignature&&$('bankTransferReviewBody')?.dataset.rendered==='1')return;lastSignature=sig;
  const body=$('bankTransferReviewBody');if(!body)return;body.dataset.rendered='1';
  if(!rows.length){body.innerHTML='<span class="muted">Aucun virement client en attente de contrôle.</span>';return}
  body.innerHTML='<div class="table-wrap"><table><thead><tr><th>Client</th><th>Course</th><th>Montant</th><th>Référence client</th><th>Statut</th><th>Action</th></tr></thead><tbody>'+rows.map(p=>{const ride=rides.find(r=>r.id===p.ride_id),ref=p.metadata?.client_reference||p.provider_reference||'—';return `<tr><td>${esc(fullName(profiles,p.user_id))}</td><td>${esc(String(p.ride_id||'').slice(0,8))}<span class="sub">${esc(ride?.pickup_address||'')} → ${esc(ride?.destination_address||'')}</span></td><td class="name">${money(p.amount,p.currency)}</td><td>${esc(ref)}</td><td>${p.status==='failed'?'<span class="pill bad">Refusé</span>':'<span class="pill warn">À vérifier</span>'}</td><td><div class="row-actions"><button class="approve" data-bank-approve="${esc(p.id)}">Valider reçu</button><button class="reject" data-bank-reject="${esc(p.id)}">Refuser</button></div></td></tr>`}).join('')+'</tbody></table></div>';
  body.querySelectorAll('[data-bank-approve]').forEach(b=>b.onclick=()=>verify(b.dataset.bankApprove));
  body.querySelectorAll('[data-bank-reject]').forEach(b=>b.onclick=()=>reject(b.dataset.bankReject));
}
async function verify(id){if(!id)return;try{await req('/payment/verify',{method:'POST',body:JSON.stringify({id})});if(typeof window.refreshAll==='function')window.refreshAll();await refresh()}catch(e){alert(e.message)}}
async function reject(id){if(!id)return;const reason=prompt('Motif du refus du paiement :','Virement non reçu')||'';if(!reason.trim())return;try{await req('/payment/reject',{method:'POST',body:JSON.stringify({id,reason})});if(typeof window.refreshAll==='function')window.refreshAll();await refresh()}catch(e){alert(e.message)}}
async function refresh(){if(busy||!token())return;const view=$('adminView');if(!view||view.classList.contains('hidden'))return;busy=true;try{const d=await req('/snapshot');render(d.data||{})}catch(e){}finally{busy=false}}
function boot(){loadAdminUsers();ensurePanel();clearInterval(timer);timer=setInterval(refresh,5000);setTimeout(refresh,500)}
window.addEventListener('load',boot);document.addEventListener('click',e=>{if(e.target?.closest?.('[data-page="payments"],#refreshBtn'))setTimeout(refresh,180)},true);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(refresh,150)});
})();

(()=>{
'use strict';
const API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-api';
const $=id=>document.getElementById(id);
let autoTimer=null,opsBusy=false;
function token(){return localStorage.getItem('fast_admin_token')||''}
function toast(message){const t=$('toast');if(!t)return;t.textContent=String(message||'');t.classList.add('on');clearTimeout(toast._ux);toast._ux=setTimeout(()=>t.classList.remove('on'),2600)}
function injectUxStyles(){
  if($('fastAdminUxStyles'))return;
  const s=document.createElement('style');s.id='fastAdminUxStyles';s.textContent=`
    body,body *{cursor:default}
    button,button *,a,a *,select,summary,[role="button"],label[for],input[type="checkbox"],input[type="radio"],input[type="file"]{cursor:pointer!important}
    input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),textarea,[contenteditable="true"],[contenteditable="plaintext-only"]{cursor:text!important}
    .fast-ops-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:12px}
    .fast-ops-card{border:1px solid #e0e7f0;background:#fff;border-radius:14px;padding:14px;text-align:left;min-height:82px;display:grid;gap:4px;transition:.15s ease}
    .fast-ops-card:hover{border-color:#b9cee8;background:#f8fbff;transform:translateY(-1px)}
    .fast-ops-card strong{font-size:24px;color:#071b3f}.fast-ops-card span{font-size:11px;color:#667085;font-weight:800}
    .fast-quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .fast-quick-actions button,.fast-top-tool{border:1px solid #d4deea;background:#fff;color:#344054;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:800}
    .fast-quick-actions button.primary-quick{background:#0b57d0;color:#fff;border-color:#0b57d0}
    .fast-top-tool.on{background:#eaf4ff;color:#0b57d0;border-color:#c9e0ff}
    @media(max-width:980px){.fast-ops-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){.fast-ops-grid{grid-template-columns:1fr}.fast-quick-actions button{flex:1 1 140px}}
  `;document.head.appendChild(s);
}
function go(page){document.querySelector(`#nav [data-page="${page}"]`)?.click()}
function clickManual(page,label){go(page);setTimeout(()=>{const b=[...document.querySelectorAll(`#page-${page} .manual-action-btn`)].find(x=>x.textContent.trim()===label);if(b)b.click();else toast('Action indisponible pour le moment.')},140)}
function applyFilter(id,value,event='change'){const el=$(id);if(!el)return;el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}))}
function clearFilters(){
  const defs=[['driverSearch','','input'],['driverCountryFilter','','change'],['clientSearch','','input'],['rideStatusFilter','','change'],['docStatusFilter','pending','change'],['paymentStatusFilter','','change']];
  defs.forEach(([id,v,ev])=>applyFilter(id,v,ev));toast('Filtres réinitialisés.');
}
function ensureTopTools(){
  const bar=document.querySelector('.top-actions');if(!bar)return;
  if(!$('fastAutoRefreshBtn')){const b=document.createElement('button');b.id='fastAutoRefreshBtn';b.className='fast-top-tool';b.type='button';b.onclick=()=>setAuto(!(localStorage.getItem('fast_admin_auto_refresh')==='1'));bar.insertBefore(b,$('refreshBtn')||bar.firstChild)}
  if(!$('fastClearFiltersBtn')){const b=document.createElement('button');b.id='fastClearFiltersBtn';b.className='fast-top-tool';b.type='button';b.textContent='Réinitialiser filtres';b.onclick=clearFilters;bar.insertBefore(b,$('exportBtn')||null)}
  syncAutoLabel();
}
function syncAutoLabel(){const b=$('fastAutoRefreshBtn');if(!b)return;const on=localStorage.getItem('fast_admin_auto_refresh')==='1';b.textContent=on?'Auto 30 s : ON':'Auto 30 s : OFF';b.classList.toggle('on',on)}
function setAuto(on){localStorage.setItem('fast_admin_auto_refresh',on?'1':'0');clearInterval(autoTimer);autoTimer=null;if(on)autoTimer=setInterval(()=>{const view=$('adminView');if(view&&!view.classList.contains('hidden'))$('refreshBtn')?.click()},30000);syncAutoLabel();toast(on?'Actualisation automatique activée.':'Actualisation automatique désactivée.')}
function ensureOpsPanel(){
  const page=$('page-dashboard');if(!page||$('fastOpsPanel'))return;
  const panel=document.createElement('section');panel.id='fastOpsPanel';panel.className='panel';panel.innerHTML=`
    <div class="panel-head"><div><h2>Actions rapides</h2><span>Priorités opérationnelles et accès directs</span></div><button id="fastOpsReload" type="button" class="small">Actualiser</button></div>
    <div class="fast-ops-grid">
      <button class="fast-ops-card" data-fast-ops="drivers"><strong id="fastOpsDrivers">—</strong><span>Chauffeurs à valider</span></button>
      <button class="fast-ops-card" data-fast-ops="documents"><strong id="fastOpsDocs">—</strong><span>Documents en attente</span></button>
      <button class="fast-ops-card" data-fast-ops="rides"><strong id="fastOpsRides">—</strong><span>Courses actives</span></button>
      <button class="fast-ops-card" data-fast-ops="payments"><strong id="fastOpsPayments">—</strong><span>Paiements à vérifier</span></button>
    </div>
    <div class="fast-quick-actions">
      <button type="button" class="primary-quick" data-fast-quick="add-driver">Ajouter un chauffeur</button>
      <button type="button" data-fast-quick="add-client">Ajouter un client</button>
      <button type="button" data-fast-quick="add-document">Ajouter un document</button>
      <button type="button" data-fast-quick="settings">Paramétrage</button>
      <button type="button" data-fast-quick="exports">Exports Excel</button>
    </div>`;
  const hero=page.querySelector('.workspace-hero');if(hero)hero.insertAdjacentElement('afterend',panel);else page.prepend(panel);
  $('fastOpsReload').onclick=updateOps;
  panel.querySelectorAll('[data-fast-ops]').forEach(b=>b.onclick=()=>{
    const p=b.dataset.fastOps;go(p);
    setTimeout(()=>{if(p==='documents')applyFilter('docStatusFilter','pending');if(p==='payments')applyFilter('paymentStatusFilter','pending')},80);
  });
  panel.querySelector('[data-fast-quick="add-driver"]').onclick=()=>clickManual('drivers','Ajouter un chauffeur');
  panel.querySelector('[data-fast-quick="add-client"]').onclick=()=>clickManual('clients','Ajouter un client');
  panel.querySelector('[data-fast-quick="add-document"]').onclick=()=>clickManual('documents','Ajouter un document');
  panel.querySelector('[data-fast-quick="settings"]').onclick=()=>{go('markets');setTimeout(()=>{[...document.querySelectorAll('#page-markets button')].find(x=>x.textContent.trim()==='Paramétrage manuel')?.click()},140)};
  panel.querySelector('[data-fast-quick="exports"]').onclick=()=>go('exports');
}
async function updateOps(){
  if(opsBusy||!token())return;const view=$('adminView');if(!view||view.classList.contains('hidden'))return;opsBusy=true;
  try{const r=await fetch(API+'/snapshot',{headers:{'Content-Type':'application/json','x-fast-admin-token':token()},cache:'no-store'});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP ${r.status}`);const x=d.data||{};
    const drivers=(x.drivers||[]).filter(v=>!v.is_verified).length;
    const docs=(x.driver_documents||[]).filter(v=>v.status==='pending').length;
    const rides=(x.rides||[]).filter(v=>['searching','accepted','driver_arriving','in_progress'].includes(String(v.status))).length;
    const payments=(x.payments||[]).filter(v=>['pending','failed'].includes(String(v.status))).length;
    if($('fastOpsDrivers'))$('fastOpsDrivers').textContent=drivers;if($('fastOpsDocs'))$('fastOpsDocs').textContent=docs;if($('fastOpsRides'))$('fastOpsRides').textContent=rides;if($('fastOpsPayments'))$('fastOpsPayments').textContent=payments;
  }catch(e){console.warn('FAST admin quick ops:',e)}finally{opsBusy=false}
}
function bootUx(){injectUxStyles();ensureTopTools();ensureOpsPanel();setAuto(localStorage.getItem('fast_admin_auto_refresh')==='1');setTimeout(updateOps,350)}
window.addEventListener('load',()=>setTimeout(bootUx,80));
document.addEventListener('click',e=>{if(e.target?.closest?.('#refreshBtn,#loginBtn,[data-page="dashboard"]'))setTimeout(()=>{ensureOpsPanel();updateOps()},350)},true);
})();
