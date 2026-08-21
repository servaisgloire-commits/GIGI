(()=>{
'use strict';
const cp$=id=>document.getElementById(id);
let paymentConfig=null,paymentUiReady=false,paymentSelectObserver=null;
function restHeaders(extra={}){return {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json',...extra}}
async function rest(path,opts={}){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{...restHeaders(),...(opts.headers||{})}});let d=null;try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d?.message||d?.hint||('HTTP '+r.status));return d}
async function control(path,opts={}){const r=await fetch(SUPABASE_URL+'/functions/v1/fast-ride-control'+path,{...opts,headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json',...(opts.headers||{})}});let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.detail||d.message||('HTTP '+r.status));return d}
function ensureCard(){
  if(paymentUiReady||!cp$('profilePage'))return;paymentUiReady=true;
  const card=document.createElement('div');card.id='clientBillingCard';card.className='card-lite';
  card.innerHTML=`<b>Paiement FAST</b><p>Enregistrez les informations non sensibles de votre moyen de paiement. FAST ne stocke jamais votre numéro complet de carte, votre CVV ou vos identifiants bancaires complets.</p>
  <label style="display:block;margin-top:10px">Nom du titulaire<input id="clientBillingHolder" class="input" placeholder="Nom complet"></label>
  <label style="display:block;margin-top:8px">Banque<input id="clientBillingBank" class="input" placeholder="Nom de la banque"></label>
  <label style="display:block;margin-top:8px">4 derniers chiffres<input id="clientBillingLast4" class="input" inputmode="numeric" maxlength="4" placeholder="1234"></label>
  <label style="display:block;margin-top:8px">Mode préféré<select id="clientBillingPreferred" class="input"><option value="cash">Espèces</option><option value="card">Carte bancaire</option><option value="wallet">Portefeuille FAST</option></select></label>
  <button id="saveClientBilling" type="button" class="btn outline" style="margin-top:10px">Enregistrer dans mon profil</button>
  <p id="clientBillingStatus" class="help">Les données bancaires complètes devront être tokenisées par un prestataire de paiement sécurisé avant activation du débit en ligne.</p>`;
  const support=cp$('profilePage').querySelector('.card-lite');if(support)cp$('profilePage').insertBefore(card,support);else cp$('profilePage').prepend(card);
  cp$('saveClientBilling').onclick=saveBilling;
}
async function loadBilling(){
  if(!token||role!=='client'||!profile?.id)return;
  ensureCard();
  try{const rows=await rest(`client_billing_profiles?user_id=eq.${encodeURIComponent(profile.id)}&select=*&limit=1`),p=rows?.[0];if(!p)return;if(cp$('clientBillingHolder'))cp$('clientBillingHolder').value=p.account_holder_name||'';if(cp$('clientBillingBank'))cp$('clientBillingBank').value=p.bank_name||'';if(cp$('clientBillingLast4'))cp$('clientBillingLast4').value=p.account_last4||'';if(cp$('clientBillingPreferred'))cp$('clientBillingPreferred').value=p.preferred_method||'cash'}catch(e){}
}
async function saveBilling(){
  if(!profile?.id)return toast('Connectez-vous d’abord');
  const last4=(cp$('clientBillingLast4')?.value||'').replace(/\D/g,'');if(last4&&last4.length!==4)return toast('Entrez uniquement les 4 derniers chiffres');
  const payload={user_id:profile.id,account_holder_name:(cp$('clientBillingHolder')?.value||'').trim()||null,bank_name:(cp$('clientBillingBank')?.value||'').trim()||null,account_last4:last4||null,country_code:window.fastActiveMarket?.country_code||profile.country_code||null,preferred_method:cp$('clientBillingPreferred')?.value||'cash',updated_at:new Date().toISOString()};
  const btn=cp$('saveClientBilling');if(btn){btn.disabled=true;btn.textContent='Enregistrement…'}
  try{await rest('client_billing_profiles?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});toast('Informations de paiement enregistrées dans votre profil');const sel=cp$('paymentMethod');if(sel&&[...sel.options].some(o=>o.value===payload.preferred_method&&!o.disabled))sel.value=payload.preferred_method}catch(e){toast(e.message)}finally{if(btn){btn.disabled=false;btn.textContent='Enregistrer dans mon profil'}}
}
function enforcePaymentOptions(){
  const sel=cp$('paymentMethod');if(!sel||!paymentConfig)return;
  [...sel.options].forEach(o=>{const base=(o.textContent||o.value).replace(/\s*•\s*bientôt$/i,'');if(o.value==='cash'){o.disabled=false;o.textContent=base;return}o.disabled=!paymentConfig.online_payment_configured;o.textContent=o.disabled?base+' • bientôt':base});
  if(sel.selectedOptions[0]?.disabled){const cash=[...sel.options].find(o=>o.value==='cash'&&!o.disabled);if(cash)sel.value='cash'}
  if(!paymentSelectObserver){paymentSelectObserver=new MutationObserver(()=>setTimeout(enforcePaymentOptions,0));paymentSelectObserver.observe(sel,{childList:true,subtree:true})}
}
async function applyPaymentAvailability(){
  if(!token||role!=='client')return;
  try{paymentConfig=await control('/payment-config');enforcePaymentOptions();const st=cp$('clientBillingStatus');if(st&&!paymentConfig.online_payment_configured)st.textContent='Paiement en ligne préparé mais désactivé tant qu’un prestataire sécurisé n’est pas connecté. Les espèces restent payables à l’arrivée.'}catch(e){}
}
function boot(){ensureCard();if(role==='client'){loadBilling();applyPaymentAvailability()}}
window.addEventListener('load',()=>{setTimeout(boot,500);setTimeout(boot,1300)});
document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-page="profilePage"]');if(b)setTimeout(()=>{loadBilling();applyPaymentAvailability()},120)},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(applyPaymentAvailability,120)});
})();
