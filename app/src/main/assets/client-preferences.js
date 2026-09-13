(()=>{
'use strict';
const q=id=>document.getElementById(id);
const VALID_PREFS=new Set(['ask','cash','card']);
let pref='ask';
let apiWrapped=false;
let remoteLoaded=false;
let syncBusy=false;
let lastHadDestination=null;
let syncTimer=null;

const hasRide=()=>{try{return !!currentRideId}catch(e){return false}};
const hasDestination=()=>{try{return !!destination&&Number.isFinite(Number(destination.lat))&&Number.isFinite(Number(destination.lng))}catch(e){return false}};
const clientReady=()=>{try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}};
const userKey=()=>{try{return `fast_payment_preference_${profile?.id||'client'}`}catch(e){return 'fast_payment_preference_client'}};
const cardReady=()=>Boolean(window.FASTPaymentProfile?.isReady?.());
const cardLabel=()=>window.FASTPaymentProfile?.label?.()||'Carte bancaire';
const notify=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};

function injectStyle(){
  if(q('fastClientPreferenceStyle'))return;
  const s=document.createElement('style');
  s.id='fastClientPreferenceStyle';
  s.textContent=`
  #mainApp:not(.hidden){padding-top:68px!important;min-height:100dvh!important}
  #mainApp:not(.hidden)>#mainHeader{position:fixed!important;top:0!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;width:min(520px,100%)!important;height:68px!important;z-index:5000!important;display:grid!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
  #mainApp:not(.hidden)>#mainHeader #menuBtn{visibility:visible!important;display:grid!important;opacity:1!important;pointer-events:auto!important}
  #clientNav{grid-template-columns:repeat(3,1fr)!important}

  body.client-mode #homePage{min-height:0!important;overflow:hidden!important}
  #passengerArea.fast-client-rebuild{height:calc(100dvh - 136px)!important;min-height:0!important;max-height:calc(100dvh - 136px)!important}
  #passengerArea.fast-client-rebuild .cr-heading{display:none!important}
  #passengerArea.fast-client-rebuild .cr-map-status{display:none!important}
  #passengerArea.fast-client-rebuild .cr-addresses{top:8px!important;left:10px!important;right:10px!important}
  #passengerArea.fast-client-rebuild .cr-quote{top:120px!important;left:10px!important;right:10px!important;grid-template-columns:1fr!important}
  #passengerArea.fast-client-rebuild .cr-quote>div:first-child,
  #passengerArea.fast-client-rebuild .cr-quote>div:nth-child(3){display:none!important}
  #passengerArea.fast-client-rebuild .cr-quote>div:nth-child(2){display:block!important}
  #passengerArea.fast-client-rebuild .cr-payment{top:166px!important;left:10px!important;right:10px!important}
  #passengerArea.fast-client-rebuild .cr-locate{top:218px!important;right:10px!important}

  #passengerArea.fast-client-rebuild:not(.cr-route-selected) #crQuote,
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) .cr-payment,
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) #crFlexCard,
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) #crPaymentFixed,
  #passengerArea.fast-client-rebuild:not(.cr-route-selected) #fastClientPriceDock{display:none!important}

  #passengerArea.fast-client-rebuild .cr-payment.cr-fixed-payment{display:none!important}
  #passengerArea.fast-client-rebuild #crPaymentFixed{position:absolute!important;top:166px!important;left:10px!important;right:10px!important;z-index:118!important;margin:0!important;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:13px;background:rgba(255,255,255,.97);box-shadow:0 7px 20px rgba(9,35,65,.08);color:#18314f;pointer-events:auto}
  #passengerArea.fast-client-rebuild #crPaymentFixed.hidden{display:none!important}
  #passengerArea.fast-client-rebuild #crPaymentFixed small{display:block;color:#8292a3;font-size:9px}
  #passengerArea.fast-client-rebuild #crPaymentFixed b{display:block;margin-top:2px;font-size:11px}
  #passengerArea.fast-client-rebuild #crPaymentFixed span{font-size:10px;font-weight:900;color:#0b57d0}

  #passengerArea.fast-client-rebuild.cr-route-selected:not(.cr-has-ride) #crBookBtn{position:absolute!important;left:10px!important;right:10px!important;bottom:70px!important;width:auto!important;z-index:156!important;margin:0!important;pointer-events:auto!important}
  #passengerArea.fast-client-rebuild #fastClientPriceDock{position:absolute!important;left:10px;right:10px;bottom:8px;z-index:155;min-height:54px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px 8px 12px;border:1px solid rgba(215,228,241,.98);border-radius:15px;background:rgba(255,255,255,.98);box-shadow:0 8px 24px rgba(9,35,65,.15);backdrop-filter:blur(16px);pointer-events:auto}
  #passengerArea.fast-client-rebuild #fastClientPriceDock small{display:block;color:#7c8fa4;font-size:8px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
  #passengerArea.fast-client-rebuild #fastClientPriceDock strong{display:block;margin-top:1px;color:#0b57d0;font-size:18px;font-weight:950}
  #passengerArea.fast-client-rebuild #fastClientPriceOptions{min-width:86px;height:38px;border:1px solid #cdddf0;border-radius:11px;background:#f6f9fd;color:#0b57d0;font-size:10px;font-weight:900}
  #passengerArea.fast-client-rebuild.cr-has-ride #fastClientPriceDock{display:none!important}

  #passengerArea.fast-client-rebuild #crFlexCard{position:absolute!important;left:10px!important;right:10px!important;bottom:132px!important;z-index:165!important;margin:0!important;max-height:min(44vh,330px);overflow:auto;display:none!important;background:rgba(255,255,255,.99)!important;box-shadow:0 18px 46px rgba(9,35,65,.22)!important;pointer-events:auto!important}
  #passengerArea.fast-client-rebuild.fast-price-open.cr-route-selected:not(.cr-has-ride) #crFlexCard{display:block!important}
  #passengerArea.fast-client-rebuild #crFlexCard .cr-flex-head b{display:block!important}

  #clientPaymentPreferenceCard{margin:0 0 14px;padding:18px;border:1px solid #d9e5f2;border-radius:20px;background:#fff;box-shadow:0 10px 26px rgba(20,65,120,.06)}
  #clientPaymentPreferenceCard b{display:block;color:#102a4c;font-size:14px}
  #clientPaymentPreferenceCard p{margin:7px 0 12px;color:#60748c;font-size:11px;line-height:1.5}
  #clientPaymentPreferenceSelect{width:100%;height:48px;border:1px solid #cbdcf0;border-radius:13px;background:#f8fbff;padding:0 12px;color:#17314e;font-size:13px;font-weight:850;outline:none}
  #clientPaymentPreferenceStatus{display:block;margin-top:8px;color:#657a92;font-size:10px;line-height:1.4}

  body.driver-mode #passengerArea,body.driver-mode #clientNav{display:none!important}
  body.driver-mode #fastDriverPinBox{display:none!important}
  body.driver-mode .fast-driver-checkpoint #fastDriverCpPinHost #fastDriverPinBox{display:block!important}
  body.driver-mode.fast-driver-trip-active #fastDriverPinBox{display:none!important}

  @media(max-width:480px){
    #passengerArea.fast-client-rebuild{height:calc(100dvh - 132px)!important;max-height:calc(100dvh - 132px)!important;min-height:0!important}
    #passengerArea.fast-client-rebuild .cr-addresses{top:7px!important;left:7px!important;right:7px!important}
    #passengerArea.fast-client-rebuild .cr-quote{top:116px!important;left:7px!important;right:7px!important}
    #passengerArea.fast-client-rebuild .cr-payment,#passengerArea.fast-client-rebuild #crPaymentFixed{top:162px!important;left:7px!important;right:7px!important}
    #passengerArea.fast-client-rebuild .cr-locate{top:214px!important;right:7px!important}
    #passengerArea.fast-client-rebuild.cr-route-selected:not(.cr-has-ride) #crBookBtn{left:7px!important;right:7px!important;bottom:68px!important}
    #passengerArea.fast-client-rebuild #fastClientPriceDock{left:7px!important;right:7px!important;bottom:7px!important}
    #passengerArea.fast-client-rebuild #crFlexCard{left:7px!important;right:7px!important;bottom:130px!important}
  }
  `;
  document.head.appendChild(s);
}

function readLocalPreference(){
  try{const v=localStorage.getItem(userKey());if(VALID_PREFS.has(v))pref=v}catch(e){}
  return pref;
}

async function loadRemotePreference(){
  if(remoteLoaded||!clientReady())return pref;
  remoteLoaded=true;
  try{
    if(typeof SUPABASE_URL==='undefined'||typeof SUPABASE_KEY==='undefined')return readLocalPreference();
    const t=(typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||'';
    if(!t)return readLocalPreference();
    const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t}});
    if(r.ok){
      const u=await r.json();
      const v=u?.user_metadata?.fast_payment_preference;
      if(VALID_PREFS.has(v)){pref=v;localStorage.setItem(userKey(),v)}
    }
  }catch(e){}
  return pref;
}

async function savePreference(v){
  pref=VALID_PREFS.has(v)?v:'ask';
  try{localStorage.setItem(userKey(),pref)}catch(e){}
  renderPreferenceUi();
  applyPreferenceToBooking();
  try{
    const t=(typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||'';
    if(typeof SUPABASE_URL!=='undefined'&&typeof SUPABASE_KEY!=='undefined'&&t){
      await fetch(SUPABASE_URL+'/auth/v1/user',{
        method:'PUT',
        headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t,'Content-Type':'application/json'},
        body:JSON.stringify({data:{fast_payment_preference:pref}})
      });
    }
  }catch(e){}
}

function ensureProfilePreference(){
  const page=q('profilePage');
  if(!page||q('clientPaymentPreferenceCard'))return;
  const card=document.createElement('div');
  card.id='clientPaymentPreferenceCard';
  card.className='card-lite';
  card.innerHTML=`
    <b>Mode de paiement</b>
    <p>Choisissez le mode utilisé par défaut pour vos courses FAST.</p>
    <select id="clientPaymentPreferenceSelect">
      <option value="ask">Me demander à chaque course</option>
      <option value="cash">Espèces</option>
      <option value="card">Carte bancaire</option>
    </select>
    <small id="clientPaymentPreferenceStatus"></small>`;
  const billing=q('clientBillingCard');
  const first=page.querySelector('.card-lite');
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
  ensureProfilePreference();
  const sel=q('clientPaymentPreferenceSelect');
  const status=q('clientPaymentPreferenceStatus');
  if(sel)sel.value=pref;
  if(!status)return;
  if(pref==='cash')status.textContent='Vos nouvelles courses utiliseront Espèces.';
  else if(pref==='card')status.textContent=cardReady()?`Carte utilisée par défaut : ${cardLabel()}.`:'Carte choisie par défaut. Enregistrez une carte pour l’activer.';
  else status.textContent='FAST vous demandera le mode de paiement après le choix de la destination.';
}

function ensureFixedPaymentRow(){
  const pay=document.querySelector('#passengerArea.fast-client-rebuild .cr-payment');
  if(!pay)return null;
  let row=q('crPaymentFixed');
  if(!row){
    row=document.createElement('div');
    row.id='crPaymentFixed';
    row.innerHTML='<div><small>Paiement</small><b id="crPaymentFixedLabel">—</b></div><span>Profil</span>';
    pay.insertAdjacentElement('afterend',row);
  }
  return row;
}

function applyPreferenceToBooking(){
  const host=q('passengerArea');
  if(!host?.classList.contains('fast-client-rebuild'))return;
  const sel=q('crPaymentMethod');
  const pay=document.querySelector('#passengerArea.fast-client-rebuild .cr-payment');
  const fixed=ensureFixedPaymentRow();
  if(!sel||!pay||!fixed)return;
  pay.classList.toggle('cr-fixed-payment',pref!=='ask');
  fixed.classList.toggle('hidden',pref==='ask');
  if(pref==='cash'){
    if([...sel.options].some(o=>o.value==='cash'))sel.value='cash';
    if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent='Espèces';
  }else if(pref==='card'){
    const card=[...sel.options].find(o=>o.value==='card');
    if(card&&cardReady()){
      sel.value='card';
      if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent=cardLabel();
    }else{
      if([...sel.options].some(o=>o.value==='cash'))sel.value='cash';
      if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent='Carte à enregistrer';
    }
  }else if(q('crPaymentFixedLabel'))q('crPaymentFixedLabel').textContent='Choix à la course';
}

function ensurePriceDock(){
  const host=q('passengerArea');
  const book=q('crBookBtn');
  if(!host?.classList.contains('fast-client-rebuild')||!book)return null;
  let dock=q('fastClientPriceDock');
  if(!dock){
    dock=document.createElement('div');
    dock.id='fastClientPriceDock';
    dock.innerHTML=`
      <div><small>Prix de la course</small><strong id="fastClientPriceBelow">—</strong></div>
      <button type="button" id="fastClientPriceOptions">Modifier le prix</button>`;
    book.insertAdjacentElement('afterend',dock);
    q('fastClientPriceOptions').onclick=()=>{
      if(!hasDestination()||hasRide())return;
      host.classList.toggle('fast-price-open');
    };
  }
  return dock;
}

function formatProposed(v){
  const n=Number(v||0);
  const c=String(q('crCurrency')?.textContent||'XAF').trim()||'XAF';
  if(!Number.isFinite(n)||n<=0)return '';
  try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c,maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(n)}
  catch(e){return `${n.toLocaleString('fr-FR')} ${c}`}
}

function syncPriceDock(){
  const host=q('passengerArea');
  const dock=ensurePriceDock();
  if(!dock||!host)return;
  const selected=hasDestination();
  const ride=hasRide();
  host.classList.toggle('cr-has-ride',ride);
  if(!selected||ride)host.classList.remove('fast-price-open');
  dock.classList.toggle('hidden',!selected||ride);
  if(!selected||ride)return;
  let price=q('crPrice')?.textContent?.trim()||'—';
  try{
    if(window.FASTClientPricing?.mode?.()==='flexible'){
      const f=formatProposed(window.FASTClientPricing?.proposed?.());
      if(f)price=f;
    }
  }catch(e){}
  if(q('fastClientPriceBelow'))q('fastClientPriceBelow').textContent=price;
  const options=q('fastClientPriceOptions');
  if(options)options.textContent=host.classList.contains('fast-price-open')?'Fermer':'Modifier le prix';
}

function wrapApi(){
  if(apiWrapped||typeof api!=='function')return;
  apiWrapped=true;
  const base=api;
  window.api=api=async function(path,opts={}){
    if(path.startsWith('/v1/nearby-drivers')&&!hasRide())return {items:[],count:0,prebooking:true};
    return base(path,opts);
  };
}

function syncBookingUi(){
  if(syncBusy)return;
  syncBusy=true;
  try{
    const host=q('passengerArea');
    if(!host?.classList.contains('fast-client-rebuild'))return;
    const selected=hasDestination();
    host.classList.toggle('cr-route-selected',selected);
    host.classList.toggle('cr-has-ride',hasRide());
    if(selected!==lastHadDestination){lastHadDestination=selected;applyPreferenceToBooking()}
    const b=q('crBookBtn');
    if(b&&!hasRide()&&!b.dataset.cardBusy&&!/Paiement sécurisé|Création de la course/i.test(b.textContent||''))b.textContent='Commander un FAST';
    const eta=q('crNearestEta');
    if(eta&&!hasRide())eta.textContent=selected?'Prêt à commander':'—';
    const nearby=q('crNearbyText');
    if(nearby&&!hasRide())nearby.textContent='';
    const status=q('crMapStatus');
    if(status)status.textContent='';
    applyPreferenceToBooking();
    renderPreferenceUi();
    syncPriceDock();
  }finally{syncBusy=false}
}

async function boot(){
  injectStyle();
  if(!window.FAST_CLIENT_REBUILD_ACTIVE)return;
  wrapApi();
  readLocalPreference();
  await loadRemotePreference();
  ensureProfilePreference();
  applyPreferenceToBooking();
  ensurePriceDock();
  syncBookingUi();
  clearInterval(syncTimer);
  syncTimer=setInterval(syncBookingUi,500);
}

injectStyle();
wrapApi();
window.addEventListener('load',()=>setTimeout(boot,220));
document.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-page="profilePage"]'))setTimeout(()=>{ensureProfilePreference();renderPreferenceUi()},120);
  if(e.target?.closest?.('[data-page="homePage"]'))setTimeout(syncBookingUi,120);
  const host=q('passengerArea');
  if(host?.classList.contains('fast-price-open')&&!e.target?.closest?.('#crFlexCard,#fastClientPriceDock'))host.classList.remove('fast-price-open');
},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(syncBookingUi,120)});
window.addEventListener('fast:ride-cancelled',()=>setTimeout(syncBookingUi,100));
window.addEventListener('fast:ride-completed',()=>setTimeout(syncBookingUi,100));
window.FASTClientPreference={get:()=>pref,set:savePreference,refresh:async()=>{remoteLoaded=false;await loadRemotePreference();syncBookingUi();return pref}};
})();