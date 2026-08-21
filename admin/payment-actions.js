(()=>{
'use strict';
const API='https://hmwxwzfcpdvgzjgxruup.supabase.co/functions/v1/fast-admin-api';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='EUR')=>{try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c,maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(Number(v||0))}catch{return `${Number(v||0).toLocaleString('fr-FR')} ${c}`}};
let timer=null,busy=false,lastSignature='';
function token(){return localStorage.getItem('fast_admin_token')||''}
async function req(path,opts={}){const r=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json','x-fast-admin-token':token(),...(opts.headers||{})},cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok||d.ok===false)throw new Error(d.error||d.detail||`HTTP ${r.status}`);return d}
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
function boot(){ensurePanel();clearInterval(timer);timer=setInterval(refresh,5000);setTimeout(refresh,500)}
window.addEventListener('load',boot);document.addEventListener('click',e=>{if(e.target?.closest?.('[data-page="payments"],#refreshBtn'))setTimeout(refresh,180)},true);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(refresh,150)});
})();
