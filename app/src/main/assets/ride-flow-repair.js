(()=>{
'use strict';
const rf=id=>document.getElementById(id);
const validLoc=loc=>!!loc&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lng));
let destinationTimer=null,destinationSeq=0,bookingBusy=false,clientLastRideId=null,lastClientStatus='',lifecycleBusy=false,driverArrivalHits=0,lastAutoCompletedRide=null;

function safeToast(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function authToken(){try{return typeof token!=='undefined'&&token?token:(localStorage.getItem('fast_access_token')||'')}catch(e){return ''}}
function isClient(){try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}}
function isDriver(){try{return typeof role!=='undefined'&&role==='driver'}catch(e){return false}}
function rideId(){try{return typeof currentRideId!=='undefined'?currentRideId:null}catch(e){return null}}

function installRepairCss(){
  if(rf('fast-ride-flow-repair-style'))return;
  const s=document.createElement('style');s.id='fast-ride-flow-repair-style';s.textContent=`
  body.client-mode.fast-client-destination-ready #passengerArea>.booking-panel{transform:translateY(0)!important;opacity:1!important;pointer-events:auto!important;display:block!important;visibility:visible!important}
  body.client-mode.fast-client-destination-ready #bookBtn{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:100%!important;min-height:50px!important}
  body.client-mode #bookBtn.fast-book-ready{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
  .fast-pin-sheet,.fast-rating-sheet{position:fixed;inset:0;z-index:180000;background:rgba(8,31,61,.48);display:flex;align-items:center;justify-content:center;padding:18px}
  .fast-pin-card,.fast-rating-card{width:min(92vw,410px);background:#fff;border-radius:24px;padding:18px;box-shadow:0 24px 64px rgba(8,31,61,.28);color:#102c49}
  .fast-pin-head,.fast-rating-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.fast-pin-head button,.fast-rating-head button{width:36px;height:36px;border:0;border-radius:12px;background:#eef6ff;color:#0b57d0;font-size:22px}
  .fast-pin-value{margin:20px 0 8px;padding:18px;border-radius:18px;background:#eef6ff;color:#0b57d0;text-align:center;font-size:38px;line-height:1;font-weight:950;letter-spacing:10px}.fast-pin-card p{color:#657b91;font-size:12px;line-height:1.5;margin:8px 0 0}
  .fast-rating-stars{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:18px 0}.fast-rating-stars button{border:1px solid #d8e6f5;background:#f8fbff;border-radius:13px;min-height:50px;font-size:25px}.fast-rating-stars button.on{background:#fff4cc;border-color:#f0c54e}.fast-rating-card textarea{width:100%;min-height:90px;resize:none;border:1px solid #d7e4f3;border-radius:14px;padding:12px;font:inherit}.fast-rating-submit{width:100%;margin-top:12px;min-height:48px;border:0;border-radius:14px;background:#0b57d0;color:#fff;font-weight:900}
  `;document.head.appendChild(s);
}

async function directApi(path,opts={}){
  if(typeof API==='undefined'||!API)throw new Error('API FAST indisponible');
  const headers={...(opts.headers||{}),'Content-Type':'application/json'};const t=authToken();if(t)headers.Authorization='Bearer '+t;
  const r=await fetch(API+path,{...opts,headers});let d={};try{d=await r.json()}catch(e){}
  if(!r.ok)throw new Error(d.detail||d.message||d.error||('HTTP '+r.status));return d;
}
async function resilientApi(path,opts={}){
  let first=null;try{if(typeof api==='function')return await api(path,opts)}catch(e){first=e}
  try{return await directApi(path,opts)}catch(e){throw first||e}
}
function formatMoney(value,currency){
  const n=Number(value||0),c=String(currency||'XAF');try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c,maximumFractionDigits:['XAF','XOF'].includes(c)?0:2}).format(n)}catch(e){return n.toLocaleString('fr-FR')+' '+c}
}

function setDestinationReady(on){
  document.body.classList.toggle('fast-client-destination-ready',!!on);
  const b=rf('bookBtn');if(b){b.classList.toggle('fast-book-ready',!!on);if(on&&!bookingBusy){b.disabled=false;if(!/Recherche|Création/i.test(b.textContent||''))b.textContent='Commander un FAST'}}
}
function resetComposerVisuals(){
  setDestinationReady(false);document.body.classList.remove('fast-client-route-ready','fast-client-searching','fast-client-active-ride','fast-passenger-waiting-driver');
  rf('bookingState')?.classList.add('hidden');rf('ridePanel')?.classList.add('hidden');rf('fastPassengerLiveCard')?.classList.add('hidden');
  const b=rf('bookBtn');if(b){b.disabled=false;b.textContent='Commander un FAST'}
  const p=rf('priceText');if(p)p.textContent='—';const d=rf('distanceText');if(d)d.textContent='Choisissez une destination';
  try{window.FASTPassengerTracking?.clear?.()}catch(e){}
}

async function resolvePlace(item){
  if(validLoc(item))return item;
  if(item?.id){
    const path='/v1/places/details?place_id='+encodeURIComponent(item.id);
    try{const p=await resilientApi(path);if(validLoc(p))return p}catch(e){}
  }
  throw new Error('Coordonnées de destination indisponibles');
}
async function fetchSuggestions(query){
  return resilientApi('/v1/places/autocomplete?q='+encodeURIComponent(query));
}
async function refreshRouteReliable(){
  if(typeof pickup==='undefined'||typeof destination==='undefined'||!validLoc(pickup)||!validLoc(destination)){setDestinationReady(false);return null}
  setDestinationReady(true);
  const dist=rf('distanceText'),price=rf('priceText');if(dist)dist.textContent='Calcul de l’itinéraire…';if(price)price.textContent='Calcul…';
  try{
    const body=typeof routeBody==='function'?routeBody():{pickup_address:pickup.label,pickup:{lat:pickup.lat,lng:pickup.lng},destination_address:destination.label,destination:{lat:destination.lat,lng:destination.lng},vehicle_type:'standard',payment_method:rf('paymentMethod')?.value||'cash'};
    const data=await resilientApi('/v1/routes/estimate',{method:'POST',body:JSON.stringify(body)});
    try{currentRoute=data}catch(e){}
    try{if(typeof drawRoute==='function')drawRoute(data)}catch(e){}
    try{if(typeof renderRouteInsights==='function')renderRouteInsights(data)}catch(e){}
    if(dist)dist.textContent=`${data.distance_km} km • ${data.duration_min} min`;
    if(price)price.textContent=formatMoney(data.estimated_price,data.currency||'XAF');
    document.body.classList.add('fast-client-route-ready');setDestinationReady(true);return data;
  }catch(e){
    try{if(typeof drawRoute==='function')drawRoute(null)}catch(x){}
    if(dist)dist.textContent='Destination confirmée';if(price)price.textContent='Calcul au démarrage';
    setDestinationReady(true);return null;
  }
}

function renderDestinationSuggestions(input,list,items){
  list.innerHTML='';
  (items||[]).slice(0,8).forEach(item=>{
    const row=document.createElement('div');row.className='suggestion';row.setAttribute('role','button');row.tabIndex=0;row.textContent=item.label||'';
    let selecting=false;
    const choose=async e=>{
      if(selecting)return;selecting=true;e?.preventDefault?.();e?.stopPropagation?.();
      try{
        const p=await resolvePlace(item),loc={label:p.label||item.label,lat:Number(p.lat),lng:Number(p.lng)};
        if(!validLoc(loc))throw new Error('Adresse invalide');
        destination=loc;input.value=loc.label;list.classList.add('hidden');input.blur();setDestinationReady(true);
        window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type:'destination',location:loc}}));
        await refreshRouteReliable();
      }catch(err){list.classList.remove('hidden');safeToast('Impossible de sélectionner cette adresse. Réessayez.')}
      finally{setTimeout(()=>{selecting=false},250)}
    };
    row.addEventListener('pointerup',choose);row.addEventListener('click',choose);row.addEventListener('keydown',e=>{if(e.key==='Enter')choose(e)});list.appendChild(row);
  });
  list.classList.toggle('hidden',!list.children.length);
}
function bindDestinationOnce(){
  const old=rf('destinationInput'),list=rf('destinationSuggestions');if(!old||!list||old.dataset.fastFlowRepair==='1')return;
  const input=old.cloneNode(true);input.dataset.fastFlowRepair='1';input.dataset.fastTouchBound='1';old.replaceWith(input);
  input.addEventListener('input',()=>{
    clearTimeout(destinationTimer);destinationSeq++;try{destination=null}catch(e){}setDestinationReady(false);document.body.classList.remove('fast-client-route-ready');
    window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type:'destination',location:null}}));
    const q=(input.value||'').trim(),seq=destinationSeq;if(q.length<2){list.innerHTML='';list.classList.add('hidden');return}
    destinationTimer=setTimeout(async()=>{try{const d=await fetchSuggestions(q);if(seq!==destinationSeq)return;renderDestinationSuggestions(input,list,d?.items||[])}catch(e){if(seq===destinationSeq){list.innerHTML='';list.classList.add('hidden');safeToast('Recherche d’adresse momentanément indisponible')}}},180);
  });
}

async function repairedBookRide(){
  if(bookingBusy)return safeToast('Votre demande est déjà en cours');
  if(!isClient())return safeToast('Compte passager requis');
  if(typeof pickup==='undefined'||!validLoc(pickup))return safeToast('Localisation de départ indisponible');
  if(typeof destination==='undefined'||!validLoc(destination))return safeToast('Choisissez une destination dans la liste');
  if(rideId())return safeToast('Vous avez déjà une course en cours');
  const b=rf('bookBtn');bookingBusy=true;if(b){b.disabled=true;b.textContent='Recherche d’un chauffeur…'}
  try{
    rf('bookingState')?.classList.remove('hidden');if(rf('bookingMessage'))rf('bookingMessage').textContent='Création de la course…';document.body.classList.add('fast-client-searching');
    const body=typeof routeBody==='function'?routeBody():{pickup_address:pickup.label,pickup:{lat:pickup.lat,lng:pickup.lng},destination_address:destination.label,destination:{lat:destination.lat,lng:destination.lng},vehicle_type:'standard',payment_method:rf('paymentMethod')?.value||'cash'};
    const created=await resilientApi('/v1/rides',{method:'POST',body:JSON.stringify(body)});if(!created?.ride?.id)throw new Error('Course non créée');
    currentRideId=created.ride.id;clientLastRideId=currentRideId;lastClientStatus=created.ride.status||'searching';
    try{clearInterval(nearbyPoll)}catch(e){}try{if(typeof clearDriverMarkers==='function')clearDriverMarkers()}catch(e){}
    if(created.route){try{currentRoute=created.route;if(typeof drawRoute==='function')drawRoute(created.route);if(typeof renderRouteInsights==='function')renderRouteInsights(created.route)}catch(e){}}
    if(rf('bookingMessage'))rf('bookingMessage').textContent='Recherche du meilleur chauffeur…';
    const dispatch=await resilientApi('/v1/rides/'+currentRideId+'/dispatch',{method:'POST'});
    if(dispatch?.matched){if(rf('bookingMessage'))rf('bookingMessage').textContent='Chauffeur trouvé';try{if(typeof pollRide==='function')pollRide()}catch(e){}}
    else{if(rf('bookingMessage'))rf('bookingMessage').textContent='Recherche élargie en cours…';setTimeout(()=>{try{if(typeof retryDispatch==='function')retryDispatch()}catch(e){}},5000)}
  }catch(e){
    try{currentRideId=null}catch(x){}clientLastRideId=null;lastClientStatus='';rf('bookingState')?.classList.add('hidden');document.body.classList.remove('fast-client-searching');bookingBusy=false;if(b){b.disabled=false;b.textContent='Commander un FAST'};setDestinationReady(validLoc(destination));try{if(typeof startNearbyPolling==='function')startNearbyPolling()}catch(x){}safeToast(e?.message||'Impossible de commander pour le moment');return;
  }
}
function wireBookButton(){const b=rf('bookBtn');if(!b)return;b.onclick=()=>repairedBookRide();if(validLoc(typeof destination!=='undefined'?destination:null))setDestinationReady(true)}

async function rpc(name,body){
  const t=authToken();if(!t)throw new Error('Connexion requise');const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body||{})});let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.message||d.error||'PIN indisponible');return Array.isArray(d)?d[0]:d;
}
async function getPin(id){
  let p='';try{p=localStorage.getItem('fast_pin_'+id)||''}catch(e){}if(/^\d{4}$/.test(p))return p;
  try{const d=await rpc('issue_ride_pin',{p_ride_id:id});p=String(d?.pin||'');if(/^\d{4}$/.test(p)){localStorage.setItem('fast_pin_'+id,p);return p}}catch(e){}
  return '';
}
async function openPinSheet(){
  document.querySelector('.fast-pin-sheet')?.remove();const id=rideId()||clientLastRideId;if(!id)return safeToast('Aucune course active');
  const sheet=document.createElement('div');sheet.className='fast-pin-sheet';sheet.innerHTML='<div class="fast-pin-card"><div class="fast-pin-head"><b>Code PIN FAST</b><button type="button" aria-label="Fermer">×</button></div><div class="fast-pin-value" id="fastMenuPin">••••</div><p>Montrez ce code au chauffeur uniquement lorsqu’il est devant vous. Il reste disponible jusqu’au démarrage de la course.</p></div>';document.body.appendChild(sheet);sheet.querySelector('button').onclick=()=>sheet.remove();sheet.onclick=e=>{if(e.target===sheet)sheet.remove()};
  const p=await getPin(id);const el=rf('fastMenuPin');if(el)el.textContent=p?p.split('').join(' '):'••••';if(!p)safeToast('Le code PIN est en cours de préparation');
}
function injectPinShortcut(){
  if(!isClient())return;const list=document.querySelector('.fast-shortcut-sheet .fast-shortcut-list');if(!list)return;
  const id=rideId()||clientLastRideId,pin=(()=>{try{return id?localStorage.getItem('fast_pin_'+id):''}catch(e){return ''}})();
  const should=!!id&&['accepted','driver_arriving','searching',''].includes(lastClientStatus)&&!!pin;
  let b=list.querySelector('[data-fast-role-shortcut="pin"]');if(!should){b?.remove();return}if(b)return;
  b=document.createElement('button');b.type='button';b.className='fast-shortcut-item primary';b.dataset.fastRoleShortcut='pin';b.innerHTML='<span>🔐</span><span><b>Code PIN</b><small>Afficher le code à donner au chauffeur</small></span><span class="arrow">›</span>';b.onclick=()=>{document.querySelector('.fast-shortcut-sheet')?.remove();openPinSheet()};
  const tracking=list.querySelector('[data-fast-role-shortcut="tracking"]');tracking?.insertAdjacentElement('afterend',b)||list.prepend(b);
}

function clearClientAfterEnd(kind,id){
  bookingBusy=false;try{clearInterval(ridePoll)}catch(e){}try{currentRideId=null}catch(e){}clientLastRideId=null;lastClientStatus='';
  resetComposerVisuals();try{destination=null;currentRoute=null}catch(e){}const input=rf('destinationInput');if(input)input.value='';
  rf('clientNav')?.classList.remove('hidden');rf('homePage')?.classList.remove('hidden');rf('historyPage')?.classList.add('hidden');rf('profilePage')?.classList.add('hidden');
  try{if(typeof showPage==='function')showPage('homePage')}catch(e){}try{if(typeof drawRoute==='function')drawRoute(null)}catch(e){}try{if(typeof startNearbyPolling==='function')startNearbyPolling()}catch(e){}
  window.dispatchEvent(new CustomEvent(kind==='cancelled'?'fast:ride-cancelled':'fast:ride-completed',{detail:{rideId:id}}));
  if(kind==='cancelled')safeToast('Course annulée • vous pouvez commander à nouveau');
}

function showRatingSheet(ride){
  if(!ride?.id||!ride?.driver_id||!profile?.id)return;try{if(localStorage.getItem('fast_rated_'+ride.id)==='1')return}catch(e){}
  document.querySelector('.fast-rating-sheet')?.remove();let score=5;
  const sheet=document.createElement('div');sheet.className='fast-rating-sheet';sheet.innerHTML=`<div class="fast-rating-card"><div class="fast-rating-head"><div><b>Comment s’est passée votre course ?</b><div style="font-size:11px;color:#6b7f93;margin-top:3px">Donnez votre avis sur le chauffeur</div></div><button type="button" aria-label="Fermer">×</button></div><div class="fast-rating-stars">${[1,2,3,4,5].map(n=>`<button type="button" data-score="${n}" class="${n<=5?'on':''}">★</button>`).join('')}</div><textarea id="fastRatingComment" maxlength="500" placeholder="Commentaire facultatif"></textarea><button type="button" class="fast-rating-submit">Envoyer mon avis</button></div>`;document.body.appendChild(sheet);
  const render=()=>sheet.querySelectorAll('[data-score]').forEach(b=>b.classList.toggle('on',Number(b.dataset.score)<=score));render();sheet.querySelectorAll('[data-score]').forEach(b=>b.onclick=()=>{score=Number(b.dataset.score);render()});
  sheet.querySelector('.fast-rating-head button').onclick=()=>sheet.remove();
  sheet.querySelector('.fast-rating-submit').onclick=async e=>{const btn=e.currentTarget;btn.disabled=true;btn.textContent='Envoi…';try{const t=authToken(),r=await fetch(SUPABASE_URL+'/rest/v1/ratings',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({ride_id:ride.id,from_user_id:profile.id,to_user_id:ride.driver_id,score,comment:(rf('fastRatingComment')?.value||'').trim()||null})});if(!r.ok&&r.status!==409){let d={};try{d=await r.json()}catch(x){}throw new Error(d.message||'Avis non enregistré')}localStorage.setItem('fast_rated_'+ride.id,'1');sheet.remove();safeToast('Merci pour votre avis')}catch(err){btn.disabled=false;btn.textContent='Envoyer mon avis';safeToast(err?.message||'Impossible d’enregistrer l’avis')}};
}

async function syncClientLifecycle(){
  if(lifecycleBusy||!isClient()||!authToken())return;lifecycleBusy=true;
  try{
    const id=rideId()||clientLastRideId;if(!id)return;if(rideId())clientLastRideId=rideId();
    const snap=await resilientApi('/v1/rides/'+id),ride=snap?.ride;if(!ride)return;lastClientStatus=ride.status||'';
    if(['accepted','driver_arriving'].includes(ride.status)){clientLastRideId=id;setTimeout(injectPinShortcut,50);await getPin(id)}
    if(ride.status==='cancelled'){clearClientAfterEnd('cancelled',id);return}
    if(ride.status==='completed'){clearClientAfterEnd('completed',id);setTimeout(()=>showRatingSheet(ride),250);return}
  }catch(e){}finally{lifecycleBusy=false}
}

async function syncDriverArrival(){
  if(!isDriver()||!authToken())return;const id=rideId();if(!id){driverArrivalHits=0;return}if(lastAutoCompletedRide===id)return;
  try{const snap=await resilientApi('/v1/rides/'+id),status=snap?.ride?.status;if(status!=='in_progress'){driverArrivalHits=0;return}const nav=await resilientApi('/v1/rides/'+id+'/navigation'),km=Number(nav?.distance_km);if(nav?.active&&Number.isFinite(km)&&km<=0.06){driverArrivalHits++}else driverArrivalHits=0;if(driverArrivalHits<3)return;lastAutoCompletedRide=id;driverArrivalHits=0;if(typeof setRideStatus==='function')await setRideStatus('completed');else await resilientApi('/v1/rides/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:'completed'})});safeToast('Destination atteinte • course terminée automatiquement')}catch(e){if(lastAutoCompletedRide===id)lastAutoCompletedRide=null}
}

function boot(){
  installRepairCss();bindDestinationOnce();wireBookButton();if(validLoc(typeof destination!=='undefined'?destination:null))setDestinationReady(true);injectPinShortcut();
}
const menuObserver=new MutationObserver(()=>injectPinShortcut());menuObserver.observe(document.documentElement,{childList:true,subtree:true});
if(typeof refreshRoute==='function')refreshRoute=refreshRouteReliable;
window.addEventListener('load',()=>{setTimeout(boot,2200);setTimeout(boot,3200)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(boot,120)});
window.addEventListener('fast:ride-cancelled',()=>setTimeout(()=>clearClientAfterEnd('cancelled',clientLastRideId||rideId()),60));
setInterval(()=>{boot();syncClientLifecycle();syncDriverArrival()},2200);
})();
