(()=>{
'use strict';
const q=id=>document.getElementById(id);
const VALID_PREFS=new Set(['ask','cash','card']);
let pref='ask',apiWrapped=false,remoteLoaded=false,syncBusy=false,lastHadDestination=null;

const hasRide=()=>{try{return !!currentRideId}catch(e){return false}};
const hasDestination=()=>{try{return !!destination&&Number.isFinite(Number(destination.lat))&&Number.isFinite(Number(destination.lng))}catch(e){return false}};
const clientReady=()=>{try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}};
const userKey=()=>{try{return `fast_payment_preference_${profile?.id||'client'}`}catch(e){return 'fast_payment_preference_client'}};
const cardReady=()=>Boolean(window.FASTPaymentProfile?.isReady?.());
const cardLabel=()=>window.FASTPaymentProfile?.label?.()||'Carte bancaire';
const notify=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};

function injectStyle(){
  if(q('fastClientPreferenceStyle'))return;
  const s=document.createElement('style');s.id='fastClientPreferenceStyle';s.textContent=`
  #passengerArea.fast-client-rebuild .cr-map-status{display:none!important}
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) #crQuote,
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) .cr-payment,
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) #crFlexCard,
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) #crPaymentFixed{display:none!important}
  #passengerArea.fast-client-rebuild .cr-payment.cr-fixed-payment select{display:none!important}
  #passengerArea.fast-client-rebuild #crPaymentFixed{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px;padding:9px 10px;border-radius:13px;background:#f4f8fc;color:#18314f}
  #passengerArea.fast-client-rebuild #crPaymentFixed small{display:block;color:#8292a3;font-size:9px}
  #passengerArea.fast-client-rebuild #crPaymentFixed b{display:block;margin-top:2px;font-size:11px}
  #passengerArea.fast-client-rebuild #crPaymentFixed span{font-size:10px;font-weight:900;color:#0b57d0}
  #clientPaymentPreferenceCard{margin:0 0 14px;padding:18px;border:1px solid #d9e5f2;border-radius:20px;background:#fff;box-shadow:0 10px 26px rgba(20,65,120,.06)}
  #clientPaymentPreferenceCard b{display:block;color:#102a4c;font-size:14px}
  #clientPaymentPreferenceCard p{margin:7px 0 12px;color:#60748c;font-size:11px;line-height:1.5}
  #clientPaymentPreferenceSelect{width:100%;height:48px;border:1px solid #cbdcf0;border-radius:13px;background:#f8fbff;padding:0 12px;color:#17314e;font-size:13px;font-weight:850;outline:none}
  #clientPaymentPreferenceStatus{display:block;margin-top:8px;color:#657a92;font-size:10px;line-height:1.4}
  `;document.head.appendChild(s);
}

function readLocalPreference(){
  try{const v=localStorage.getItem(userKey());if(VALID_PREFS.has(v))pref=v}catch(e){}
  return pref;
}
async function loadRemotePreference(){
  if(remoteLoaded||!clientReady())return pref;remoteLoaded=true;
  try{
    if(typeof SUPABASE_URL==='undefined'||typeof SUPABASE_KEY==='undefined'||typeof token==='undefined'||!token)return readLocalPreference();
    const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});
    if(r.ok){const u=await r.json();const v=u?.user_metadata?.fast_payment_preference;if(VALID_PREFS.has(v)){pref=v;localStorage.setItem(userKey(),v)}}
  }catch(e){}
  return pref;
}
async function savePreference(v){
  pref=VALID_PREFS.has(v)?v:'ask';
  try{localStorage.setItem(userKey(),pref)}catch(e){}
  renderPreferenceUi();applyPreferenceToBooking();
  try{
    if(typeof SUPABASE_URL!=='undefined'&&typeof SUPABASE_KEY!=='undefined'&&typeof token!=='undefined'&&token){
      await fetch(SUPABASE_URL+'/auth/v1/user',{method:'PUT',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({data:{fast_payment_preference:pref}})});
    }
  }catch(e){}
}

function ensureProfilePreference(){
  const page=q('profilePage');if(!page||q('clientPaymentPreferenceCard'))return;
  const card=document.createElement('div');card.id='clientPaymentPreferenceCard';card.className='card-lite';card.innerHTML=`
    <b>Mode de paiement</b>
    <p>Choisissez le mode utilisé par défaut pour vos courses FAST.</p>
    <select id="clientPaymentPreferenceSelect">
      <option value="ask">Me demander à chaque course</option>
      <option value="cash">Espèces</option>
      <option value="card">Carte bancaire</option>
    </select>
    <small id="clientPaymentPreferenceStatus"></small>`;
  const billing=q('clientBillingCard'),first=page.querySelector('.card-lite');
  if(billing)page.insertBefore(card,billing);else if(first)page.insertBefore(card,first);else page.prepend(card);
  q('clientPaymentPreferenceSelect').addEventListener('change',async e=>{
    const v=e.target.value;
    await savePreference(v);
    if(v==='card'&&!cardReady()){
      notify('Enregistrez votre carte dans Profil pour utiliser ce mode de paiement.');
      try{window.FASTPaymentProfile?.addCard?.()}catch(err){}
    }
  });
  renderPreferenceUi();
}
function renderPreferenceUi(){
  ensureProfilePreference();const sel=q('clientPaymentPreferenceSelect'),status=q('clientPaymentPreferenceStatus');if(sel)sel.value=pref;
  if(!status)return;
  if(pref==='cash')status.textContent='Vos nouvelles courses utiliseront Espèces.';
  else if(pref==='card')status.textContent=cardReady()?`Carte utilisée par défaut : ${cardLabel()}.`:'Carte choisie par défaut. Enregistrez une carte pour l’activer.';
  else status.textContent='FAST vous demandera le mode de paiement après le choix de la destination.';
}

function ensureFixedPaymentRow(){
  const pay=document.querySelector('#passengerArea.fast-client-rebuild .cr-payment');if(!pay)return null;
  let row=q('crPaymentFixed');if(!row){row=document.createElement('div');row.id='crPaymentFixed';row.innerHTML='<div><small>Paiement</small><b id="crPaymentFixedLabel">—</b></div><span>Profil</span>';pay.insertAdjacentElement('afterend',row)}
  return row;
}
function applyPreferenceToBooking(){
  const host=q('passengerArea');if(!host?.classList.contains('fast-client-rebuild'))return;
  const sel=q('crPaymentMethod'),pay=document.querySelector('#passengerArea.fast-client-rebuild .cr-payment'),fixed=ensureFixedPaymentRow();
  if(!sel||!pay||!fixed)return;
  pay.classList.toggle('cr-fixed-payment',pref!=='ask');
  fixed.classList.toggle('hidden',pref==='ask');
  if(pref==='cash'){
    if([...sel.options].some(o=>o.value==='cash'))sel.value='cash';
    if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent='Espèces';
  }else if(pref==='card'){
    const card=[...sel.options].find(o=>o.value==='card');
    if(card&&cardReady()){sel.value='card';if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent=cardLabel()}
    else {if([...sel.options].some(o=>o.value==='cash'))sel.value='cash';if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent='Carte à enregistrer'}
  }else if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent='Choix à la course';
}

function wrapApi(){
  if(apiWrapped||typeof api!=='function')return;apiWrapped=true;const base=api;
  window.api=api=async function(path,opts={}){
    if(path.startsWith('/v1/nearby-drivers')&&!hasRide())return {items:[],count:0,prebooking:true};
    return base(path,opts);
  };
}

function syncBookingUi(){
  if(syncBusy)return;syncBusy=true;
  try{
    const host=q('passengerArea');if(!host?.classList.contains('fast-client-rebuild'))return;
    const selected=hasDestination();host.classList.toggle('cr-route-selected',selected);
    if(selected!==lastHadDestination){lastHadDestination=selected;applyPreferenceToBooking()}
    const b=q('crBookBtn');if(b&&!hasRide()&&!b.dataset.cardBusy&&!/Paiement sécurisé|Création de la course/i.test(b.textContent||''))b.textContent='Commander un FAST';
    const eta=q('crNearestEta');if(eta&&!hasRide())eta.textContent=selected?'Prêt':'—';
    const nearby=q('crNearbyText');if(nearby&&!hasRide())nearby.textContent='';
    const status=q('crMapStatus');if(status)status.textContent='';
    applyPreferenceToBooking();renderPreferenceUi();
  }finally{syncBusy=false}
}

async function boot(){
  if(!window.FAST_CLIENT_REBUILD_ACTIVE)return;
  injectStyle();wrapApi();readLocalPreference();await loadRemotePreference();ensureProfilePreference();applyPreferenceToBooking();syncBookingUi();
  setInterval(syncBookingUi,700);
}
window.addEventListener('load',()=>setTimeout(boot,250));
document.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-page="profilePage"]'))setTimeout(()=>{ensureProfilePreference();renderPreferenceUi()},120);
  if(e.target?.closest?.('[data-page="homePage"]'))setTimeout(syncBookingUi,120);
},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(syncBookingUi,120)});
window.addEventListener('fast:ride-cancelled',()=>setTimeout(syncBookingUi,100));
window.addEventListener('fast:ride-completed',()=>setTimeout(syncBookingUi,100));
window.FASTClientPreference={get:()=>pref,set:savePreference,refresh:async()=>{remoteLoaded=false;await loadRemotePreference();syncBookingUi();return pref}};
})();