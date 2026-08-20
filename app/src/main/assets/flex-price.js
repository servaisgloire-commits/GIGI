(()=>{
'use strict';
const fp$=id=>document.getElementById(id);
let flexMode='standard',flexValue='',flexTouched=false,lastRedispatchAt=0;

function currency(){
  try{return String(currentRoute?.currency||window.fastActiveMarket?.currency||'USD').toUpperCase()}catch(e){return String(window.fastActiveMarket?.currency||'USD').toUpperCase()}
}
function standardPrice(){
  try{return Number(currentRoute?.standard_price??currentRoute?.estimated_price??0)||0}catch(e){return 0}
}
function money(v,c=currency()){
  const n=Number(v||0);try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c,maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(n)}catch(e){return `${n.toLocaleString('fr-FR')} ${c}`}
}
function parseFlexibleValue(raw){
  const cleaned=String(raw??'').trim().replace(/\s/g,'').replace(',','.');
  if(!cleaned)return 0;
  const n=Number(cleaned);return Number.isFinite(n)?n:0;
}
function customPrice(){
  const input=fp$('flexPriceInput');
  const raw=input?input.value:flexValue;
  const v=parseFlexibleValue(raw);
  if(input)flexValue=input.value;else flexValue=String(raw||'');
  return v;
}
function updateProposalPreview(){
  const preview=fp$('flexProposalPreview'),button=fp$('bookBtn');
  if(flexMode!=='flexible'){
    if(preview)preview.textContent='';
    if(button&&button.dataset.flexOriginalLabel){button.textContent=button.dataset.flexOriginalLabel;delete button.dataset.flexOriginalLabel}
    return;
  }
  const v=customPrice(),c=currency();
  if(preview)preview.textContent=v>0?`Votre proposition : ${money(v,c)}`:'Saisissez librement le montant que vous proposez.';
  if(button){
    if(!button.dataset.flexOriginalLabel)button.dataset.flexOriginalLabel=button.textContent||'Commander FAST';
    button.textContent=v>0?`Proposer ${money(v,c)}`:'Proposer mon prix';
  }
}
function ensureCard(){
  if(fp$('flexPriceCard'))return fp$('flexPriceCard');
  const payment=document.querySelector('#passengerArea .payment-card');if(!payment)return null;
  const card=document.createElement('div');card.id='flexPriceCard';card.className='flex-price-card';
  card.innerHTML=`
    <div class="flex-price-head"><div><small>PRIX DE LA COURSE</small><b id="flexStandardText">Prix FAST —</b></div><span>Flexible</span></div>
    <div class="flex-price-tabs">
      <button type="button" id="flexStandardBtn" class="active">Prix standard</button>
      <button type="button" id="flexCustomBtn">Proposer mon prix</button>
    </div>
    <div id="flexCustomBox" class="flex-custom-box hidden">
      <label for="flexPriceInput">Votre proposition</label>
      <div class="flex-input-row"><input id="flexPriceInput" inputmode="decimal" type="text" autocomplete="off" placeholder="Montant"><b id="flexCurrency">USD</b></div>
      <small id="flexProposalPreview">Saisissez librement le montant que vous proposez.</small>
      <small>Le chauffeur voit votre prix avant d’accepter. Il peut accepter ou refuser la proposition.</small>
    </div>`;
  payment.insertAdjacentElement('beforebegin',card);
  fp$('flexStandardBtn').onclick=()=>setMode('standard');
  fp$('flexCustomBtn').onclick=()=>setMode('flexible');
  const input=fp$('flexPriceInput');
  input.addEventListener('focus',()=>{flexTouched=true});
  input.addEventListener('input',e=>{flexTouched=true;flexValue=e.target.value;updateProposalPreview()});
  input.addEventListener('change',e=>{flexTouched=true;flexValue=e.target.value;updateProposalPreview()});
  return card;
}
function setMode(mode){
  flexMode=mode==='flexible'?'flexible':'standard';
  ensureCard();
  fp$('flexStandardBtn')?.classList.toggle('active',flexMode==='standard');
  fp$('flexCustomBtn')?.classList.toggle('active',flexMode==='flexible');
  fp$('flexCustomBox')?.classList.toggle('hidden',flexMode!=='flexible');
  if(flexMode==='standard'){
    flexValue='';flexTouched=false;
    if(fp$('flexPriceInput'))fp$('flexPriceInput').value='';
  }else{
    const input=fp$('flexPriceInput');
    if(input&&!flexTouched&&!flexValue)input.value='';
    setTimeout(()=>{try{input?.focus()}catch(e){}},80);
  }
  updateProposalPreview();
}
function refreshCard(){
  const card=ensureCard();if(!card)return;
  const s=standardPrice(),c=currency();
  if(fp$('flexStandardText'))fp$('flexStandardText').textContent=s>0?`Prix FAST ${money(s,c)}`:'Prix FAST en calcul…';
  if(fp$('flexCurrency'))fp$('flexCurrency').textContent=c;
  const input=fp$('flexPriceInput');
  if(input&&s>0&&!input.value&&!flexTouched)input.placeholder=`Ex. ${String(s).replace('.',',')}`;
  card.classList.toggle('hidden',!(s>0));
  updateProposalPreview();
}

if(typeof routeBody==='function'){
  const baseRouteBody=routeBody;
  routeBody=function(){
    const body=baseRouteBody();
    if(flexMode==='flexible'){
      const v=customPrice();
      if(v>0)body.proposed_price=v;
    }
    return body;
  };
}

if(typeof bookRide==='function'){
  const baseBookRideFlex=bookRide;
  bookRide=async function(){
    if(flexMode==='flexible'){
      const v=customPrice();
      if(v<=0)return toast('Entrez le prix que vous souhaitez proposer au chauffeur.');
    }
    lastRedispatchAt=Date.now();
    return baseBookRideFlex();
  };
}

function ensureDriverPrice(){
  const offer=fp$('offerCard');if(!offer)return null;
  let box=fp$('flexDriverPrice');if(box)return box;
  box=document.createElement('div');box.id='flexDriverPrice';box.className='flex-driver-price';
  const actions=offer.querySelector('.offer-actions');(actions||offer).insertAdjacentElement(actions?'beforebegin':'beforeend',box);
  return box;
}
if(typeof loadOffer==='function'){
  loadOffer=async function(){
    try{
      const d=await api('/v1/driver/offers/current');
      if(!d.offer){fp$('offerCard')?.classList.add('hidden');return}
      const o=d.offer,card=fp$('offerCard');card?.classList.remove('hidden');
      if(fp$('offerEta'))fp$('offerEta').textContent=o.eta_min+' min';
      if(fp$('offerDistance'))fp$('offerDistance').textContent=Number(o.distance_km).toFixed(1)+' km du passager';
      if(fp$('acceptOffer'))fp$('acceptOffer').dataset.id=o.id;
      if(fp$('rejectOffer'))fp$('rejectOffer').dataset.id=o.id;
      const box=ensureDriverPrice(),c=o.currency||'USD',price=Number(o.offered_price||o.standard_price||0),standard=Number(o.standard_price||0),flex=o.pricing_mode==='flexible';
      if(box){
        box.innerHTML=`<small>${flex?'PRIX PROPOSÉ PAR LE CLIENT':'PRIX FAST'}</small><strong>${money(price,c)}</strong>${flex&&standard>0?`<span>Prix standard FAST : ${money(standard,c)}</span>`:''}<em>${flex?'Vous choisissez librement d’accepter ou de refuser.':'Tarif standard de la course.'}</em>`;
        box.classList.toggle('flexible',flex);
      }
      if(typeof lastNotifiedOffer!=='undefined'&&lastNotifiedOffer!==o.id){
        lastNotifiedOffer=o.id;
        try{FASTNative.notifyDriverOffer('Nouvelle course FAST',`${flex?'Prix proposé':'Prix FAST'} ${money(price,c)} • ${Number(o.distance_km).toFixed(1)} km • ETA ${o.eta_min} min`)}catch(e){}
      }
    }catch(e){}
  };
}

async function watchSearchingRide(){
  try{
    if(!token||role!=='client'||!currentRideId)return;
    const id=currentRideId,d=await api('/v1/rides/'+id),r=d?.ride;
    if(!r||r.status!=='searching')return;
    const now=Date.now(),driverCleared=!r.driver_id,offerLikelyExpired=now-lastRedispatchAt>=30000;
    if(!driverCleared&&!offerLikelyExpired)return;
    if(now-lastRedispatchAt<5000)return;
    lastRedispatchAt=now;
    const result=await api('/v1/rides/'+id+'/dispatch',{method:'POST'});
    if(result?.matched){
      if(fp$('bookingMessage'))fp$('bookingMessage').textContent='Proposition envoyée à un chauffeur…';
      if(typeof pollRide==='function')pollRide();
    }else if(result?.reason==='no_more_drivers_after_rejections'){
      if(fp$('bookingMessage'))fp$('bookingMessage').textContent='Recherche d’un autre chauffeur…';
    }
  }catch(e){}
}

function style(){
  if(fp$('flexPriceStyle'))return;const s=document.createElement('style');s.id='flexPriceStyle';s.textContent=`
  .flex-price-card{margin:11px 0;padding:13px;border:1px solid #e1e8f1;border-radius:17px;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.05)}
  .flex-price-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.flex-price-head small{display:block;font-size:8px;font-weight:900;color:#7b8491;letter-spacing:.55px}.flex-price-head b{display:block;font-size:13px;color:#111827;margin-top:2px}.flex-price-head>span{font-size:9px;font-weight:850;color:#0b57d0;background:#eef5ff;border-radius:999px;padding:6px 8px}
  .flex-price-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:11px}.flex-price-tabs button{min-height:42px;border:1px solid #dfe6ef;border-radius:12px;background:#fff;color:#4b5563;font-size:10px;font-weight:850}.flex-price-tabs button.active{background:#0b57d0;color:#fff;border-color:#0b57d0}
  .flex-custom-box{margin-top:10px;padding:11px;border-radius:13px;background:#f7faff}.flex-custom-box label{display:block;font-size:9px;font-weight:850;color:#526174;margin-bottom:6px}.flex-input-row{display:grid;grid-template-columns:1fr auto;align-items:center;border:1px solid #cfdaea;border-radius:12px;background:#fff;overflow:hidden}.flex-input-row input{min-width:0;border:0;outline:0;padding:12px;font-size:17px;font-weight:900;color:#111827;background:#fff}.flex-input-row b{padding:0 12px;color:#0b57d0;font-size:11px}.flex-custom-box>small{display:block;margin-top:7px;color:#7b8491;font-size:9px;line-height:1.35}
  .flex-driver-price{margin:12px 0;padding:13px;border-radius:15px;background:#eef5ff;border:1px solid #d5e6ff;text-align:center}.flex-driver-price.flexible{background:#fff8e8;border-color:#f3d79b}.flex-driver-price small{display:block;font-size:8px;font-weight:950;letter-spacing:.55px;color:#617087}.flex-driver-price strong{display:block;font-size:25px;color:#0b57d0;margin:4px 0}.flex-driver-price.flexible strong{color:#9a5a00}.flex-driver-price span,.flex-driver-price em{display:block;font-size:9px;color:#6b7280}.flex-driver-price em{font-style:normal;margin-top:4px}
  `;document.head.appendChild(s);
}

style();refreshCard();setInterval(refreshCard,1000);setInterval(watchSearchingRide,5000);
window.addEventListener('fast:ride-cancelled',()=>{setMode('standard');lastRedispatchAt=0});
})();
