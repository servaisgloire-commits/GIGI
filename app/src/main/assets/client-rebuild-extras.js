(()=>{
'use strict';
const x=id=>document.getElementById(id);
let flexMode='standard',flexValue='',apiWrapped=false,cardBypass=false,cardMarketAllowed=false,syncTimer=null;
const num=v=>{const n=Number(String(v??'').trim().replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0};
const currency=()=>String(window.fastActiveMarket?.currency||x('crCurrency')?.textContent||'XAF').trim()||'XAF';
const cashMoney=v=>{try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:currency(),maximumFractionDigits:['XAF','XOF','JPY'].includes(currency())?0:2}).format(Number(v||0))}catch(e){return `${Number(v||0).toLocaleString('fr-FR')} ${currency()}`}};
const notify=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};

function ensureFlexUi(){
  if(x('crFlexCard'))return;
  const pay=document.querySelector('#passengerArea.fast-client-rebuild .cr-payment');if(!pay)return;
  const box=document.createElement('div');box.id='crFlexCard';box.className='cr-flex-card';box.innerHTML=`
    <div class="cr-flex-head"><div><small>PRIX DE LA COURSE</small><b id="crFlexStandard">Prix FAST en calcul…</b></div><span>Flexible</span></div>
    <div class="cr-flex-tabs"><button id="crFlexStandardBtn" type="button" class="on">Prix FAST</button><button id="crFlexCustomBtn" type="button">Proposer mon prix</button></div>
    <div id="crFlexCustomBox" class="cr-flex-custom hidden"><label for="crFlexInput">Votre proposition</label><div><input id="crFlexInput" inputmode="decimal" autocomplete="off" placeholder="Montant"><b id="crFlexCurrency">${currency()}</b></div><small id="crFlexHint">Le chauffeur verra votre proposition avant d’accepter.</small></div>`;
  pay.insertAdjacentElement('beforebegin',box);
  x('crFlexStandardBtn').onclick=()=>setFlexMode('standard');
  x('crFlexCustomBtn').onclick=()=>setFlexMode('flexible');
  x('crFlexInput').addEventListener('input',e=>{flexValue=e.target.value;updateFlexUi()});
  updateFlexUi();
}
function setFlexMode(mode){
  flexMode=mode==='flexible'?'flexible':'standard';
  x('crFlexStandardBtn')?.classList.toggle('on',flexMode==='standard');
  x('crFlexCustomBtn')?.classList.toggle('on',flexMode==='flexible');
  x('crFlexCustomBox')?.classList.toggle('hidden',flexMode!=='flexible');
  if(flexMode==='standard'){flexValue='';if(x('crFlexInput'))x('crFlexInput').value=''}
  updateFlexUi();
}
function routeStandardPrice(){try{return Number(currentRoute?.standard_price??currentRoute?.estimated_price??0)||0}catch(e){return 0}}
function updateFlexUi(){
  ensureFlexUi();const standard=routeStandardPrice(),c=currency();
  if(x('crFlexStandard'))x('crFlexStandard').textContent=standard>0?`Prix FAST ${cashMoney(standard)}`:'Prix FAST en calcul…';
  if(x('crFlexCurrency'))x('crFlexCurrency').textContent=c;
  const proposed=num(x('crFlexInput')?.value||flexValue);flexValue=x('crFlexInput')?.value||flexValue;
  if(x('crFlexHint'))x('crFlexHint').textContent=flexMode==='flexible'?(proposed>0?`Votre proposition : ${cashMoney(proposed)} • le chauffeur peut accepter ou refuser.`:'Entrez le montant que vous souhaitez proposer.'):'Le tarif FAST calculé reste sélectionné.';
  const b=x('crBookBtn');if(b&&!b.dataset.cardBusy){
    const validDestination=(()=>{try{return !!destination&&Number.isFinite(Number(destination.lat))&&Number.isFinite(Number(destination.lng))}catch(e){return false}})();
    const hasRide=(()=>{try{return !!currentRideId}catch(e){return false}})();
    if(flexMode==='flexible'&&validDestination&&!hasRide){b.disabled=proposed<=0;b.textContent=proposed>0?`Proposer ${cashMoney(proposed)}`:'Entrez votre prix'}
  }
}

function wrapApiForFlexiblePrice(){
  if(apiWrapped||typeof api!=='function')return;apiWrapped=true;const base=api;
  window.api=api=async function(path,opts={}){
    if(path==='/v1/rides'&&String(opts.method||'GET').toUpperCase()==='POST'&&flexMode==='flexible'){
      const proposed=num(x('crFlexInput')?.value||flexValue);if(proposed<=0)throw new Error('Entrez le prix que vous souhaitez proposer au chauffeur.');
      let body={};try{body=JSON.parse(opts.body||'{}')}catch(e){}body.proposed_price=proposed;opts={...opts,body:JSON.stringify(body)};
    }
    return base(path,opts);
  };
}

async function syncCardProfile(){
  clearTimeout(syncTimer);const p=window.FASTPaymentProfile;if(!p)return sanitizeCardOption();
  try{await p.refresh?.()}catch(e){}sanitizeCardOption();
}
function sanitizeCardOption(){
  const sel=x('crPaymentMethod');if(!sel)return;const card=[...sel.options].find(o=>o.value==='card');if(card)cardMarketAllowed=true;
  const ready=Boolean(window.FASTPaymentProfile?.isReady?.());
  if(card&&!ready){if(sel.value==='card')sel.value='cash';card.remove()}
  if(ready&&cardMarketAllowed){let opt=[...sel.options].find(o=>o.value==='card');if(!opt){opt=document.createElement('option');opt.value='card';sel.appendChild(opt)}opt.textContent=window.FASTPaymentProfile?.label?.()||'Carte bancaire'}
}
async function captureCardBooking(e){
  const b=e.currentTarget,sel=x('crPaymentMethod');if(!sel||sel.value!=='card')return;
  if(cardBypass){cardBypass=false;return}
  e.preventDefault();e.stopImmediatePropagation();
  const p=window.FASTPaymentProfile;if(!p?.isReady?.()){notify('Enregistrez d’abord votre carte dans Profil');syncCardProfile();return}
  try{if(!currentRoute){notify('Attendez le calcul du prix avant le paiement carte');return}}catch(err){notify('Attendez le calcul du prix avant le paiement carte');return}
  b.dataset.cardBusy='1';b.disabled=true;const old=b.textContent;b.textContent='Paiement sécurisé…';
  try{const ok=await p.prepareRidePayment?.(b);if(!ok)return;cardBypass=true;b.disabled=false;b.textContent=old;b.click()}catch(err){notify(err?.message||'Paiement non confirmé')}finally{delete b.dataset.cardBusy;if(!cardBypass){b.disabled=false;updateFlexUi()}}
}

function bindExtras(){
  if(!window.FAST_CLIENT_REBUILD_ACTIVE)return;
  ensureFlexUi();wrapApiForFlexiblePrice();
  const b=x('crBookBtn');if(b&&!b.dataset.extrasBound){b.dataset.extrasBound='1';b.addEventListener('click',captureCardBooking,true)}
  const sel=x('crPaymentMethod');if(sel&&!sel.dataset.extrasBound){sel.dataset.extrasBound='1';sel.addEventListener('change',updateFlexUi)}
  syncCardProfile();
  const observer=new MutationObserver(()=>{sanitizeCardOption();updateFlexUi()});
  if(sel)observer.observe(sel,{childList:true});
  setInterval(()=>{sanitizeCardOption();updateFlexUi()},1200);
}
window.addEventListener('load',()=>{setTimeout(bindExtras,160);setTimeout(syncCardProfile,900)});
document.addEventListener('click',e=>{if(e.target?.closest?.('[data-page="homePage"]'))setTimeout(syncCardProfile,160)},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(syncCardProfile,200)});
window.addEventListener('fast:ride-cancelled',()=>setFlexMode('standard'));
window.addEventListener('fast:ride-completed',()=>setFlexMode('standard'));
window.FASTClientPricing={mode:()=>flexMode,proposed:()=>num(x('crFlexInput')?.value||flexValue),syncPayments:syncCardProfile};
})();
