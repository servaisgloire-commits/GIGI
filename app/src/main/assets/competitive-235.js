(()=>{
'use strict';
const byId=id=>document.getElementById(id);
function ensureRouteInsights(){
  if(byId('routeInsights'))return;
  const anchor=document.querySelector('.route-fields');if(!anchor)return;
  const box=document.createElement('div');box.id='routeInsights';box.className='route-insights hidden';
  box.innerHTML='<div class="route-kpis"><div><small>Arrivée</small><b id="routeEta">—</b></div><div><small>Distance</small><b id="routeDistance">—</b></div><div><small>Trafic</small><b id="routeTraffic">—</b></div><div><small>Moteur</small><b id="routeProvider">Google</b></div></div><div id="alternativeRoutes" class="alternative-routes"></div><div class="section mini-section"><h3>Détails du trajet</h3><span id="stepCount">0 étape</span></div><div id="routeSteps" class="route-steps"></div>';
  anchor.insertAdjacentElement('afterend',box);
}
function ensureTrust(){
  const panel=document.querySelector('.booking-panel');if(!panel||document.querySelector('.fast-trust-strip'))return;
  const book=byId('bookBtn');if(!book)return;
  const strip=document.createElement('div');strip.className='fast-trust-strip';strip.innerHTML='<div class="fast-trust-pill"><b>Prix affiché</b><small>avant départ</small></div><div class="fast-trust-pill"><b>Code PIN</b><small>course sécurisée</small></div><div class="fast-trust-pill"><b>Suivi GPS</b><small>temps réel</small></div>';
  book.insertAdjacentElement('beforebegin',strip);
  const actions=document.createElement('div');actions.className='fast-client-actions';actions.innerHTML='<button type="button" class="fast-action-btn" id="fastShareRide"><span>↗</span>Partager le trajet</button><button type="button" class="fast-action-btn" id="fastSafetyCenter"><span>🛡️</span>Centre de sécurité</button>';
  book.insertAdjacentElement('afterend',actions);
  byId('fastShareRide').onclick=shareTrip;byId('fastSafetyCenter').onclick=openSafety;
}
async function shareTrip(){
  const from=(window.pickup&&pickup.label)||byId('pickupInput')?.value||'Ma position';
  const to=(window.destination&&destination.label)||byId('destinationInput')?.value||'Destination';
  const ride=window.currentRideId?`\nCourse FAST : ${currentRideId}`:'';
  const text=`Je voyage avec FAST.\nDépart : ${from}\nDestination : ${to}${ride}`;
  try{if(navigator.share)await navigator.share({title:'Mon trajet FAST',text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);toast('Trajet copié') }else toast('Partage indisponible')}catch(e){}
}
function openSafety(){
  document.querySelector('.fast-safety-sheet')?.remove();
  let pin='— — — —';try{if(window.currentRideId){const p=localStorage.getItem('fast_pin_'+currentRideId);if(p)pin=String(p).split('').join(' ')}}catch(e){}
  const sheet=document.createElement('div');sheet.className='fast-safety-sheet';
  sheet.innerHTML=`<div class="fast-safety-card"><div class="fast-safety-head"><h3>Centre de sécurité FAST</h3><button class="fast-close" aria-label="Fermer">×</button></div><div class="fast-safety-items"><div class="fast-safety-item"><div class="ico">📍</div><div><b>Trajet suivi par GPS</b><small>La position de la course est actualisée pendant le déplacement.</small></div></div><div class="fast-safety-item"><div class="ico">🔐</div><div><b>Validation par code PIN</b><small>Le chauffeur ne démarre la course qu'après vérification.</small></div></div><div class="fast-safety-item"><div class="ico">↗</div><div><b>Partage du trajet</b><small>Envoyez les informations de votre course à un proche.</small></div></div></div><div class="fast-pin-box"><small>PIN DE LA COURSE ACTIVE</small><strong>${pin}</strong></div><button id="fastSafetyShare" class="btn outline">Partager mon trajet</button></div>`;
  document.body.appendChild(sheet);sheet.querySelector('.fast-close').onclick=()=>sheet.remove();sheet.onclick=e=>{if(e.target===sheet)sheet.remove()};byId('fastSafetyShare').onclick=shareTrip;
}
function ensureDriverAdvantages(){
  const area=byId('driverArea');if(!area||document.querySelector('.fast-driver-advantages'))return;
  const top=area.querySelector('.driver-nav-top');if(!top)return;
  const box=document.createElement('div');box.className='fast-driver-advantages';box.innerHTML='<div><b>Prix visible</b><small>avant acceptation</small></div><div><b>ETA + distance</b><small>décision rapide</small></div><div><b>Navigation</b><small>Google intégrée</small></div>';top.insertAdjacentElement('afterend',box);
}
function ensureDriverCancel(){
  const trip=byId('driverTrip');if(!trip||byId('cancelDriverRideBtn'))return;
  const actions=trip.querySelector('.driver-trip-actions')||trip;
  const b=document.createElement('button');b.type='button';b.id='cancelDriverRideBtn';b.className='btn outline fast-driver-cancel';b.textContent='Annuler la course';
  b.style.borderColor='#ef4444';b.style.color='#b42318';b.style.background='#fff';
  b.onclick=cancelDriverRide;actions.appendChild(b);
}
async function cancelDriverRide(){
  if(typeof role!=='undefined'&&role!=='driver')return;
  if(typeof currentRideId==='undefined'||!currentRideId){if(typeof toast==='function')toast('Aucune course active');return}
  if(!confirm('Annuler cette course ? Le client sera immédiatement informé.'))return;
  const b=byId('cancelDriverRideBtn');if(b){b.disabled=true;b.textContent='Annulation…'}
  try{
    const rideId=currentRideId;
    await api('/v1/rides/'+rideId+'/status',{method:'PATCH',body:JSON.stringify({status:'cancelled'})});
    currentRideId=null;
    try{clearInterval(ridePoll)}catch(e){}
    byId('driverTrip')?.classList.add('hidden');
    byId('fastDriverPinBox')?.classList.add('hidden');
    const pin=byId('fastDriverPin');if(pin){pin.value='';pin.disabled=false}
    if(typeof startOfferPolling==='function'&&byId('driverToggleInput')?.checked)startOfferPolling();
    if(typeof toast==='function')toast('Course annulée');
  }catch(e){if(typeof toast==='function')toast(e?.message||'Annulation impossible')}
  finally{if(b){b.disabled=false;b.textContent='Annuler la course'}}
}
function polishLabels(){
  const e=byId('mapEngineText');if(e&&/Mapbox|FAST Map/i.test(e.textContent))e.textContent='Google Maps';
  const support=byId('supportEmail');if(support)support.textContent='contact@gloire-group.com';const auth=byId('authSupportEmail');if(auth)auth.textContent='contact@gloire-group.com';
}
function boot(){ensureRouteInsights();ensureTrust();ensureDriverAdvantages();ensureDriverCancel();polishLabels()}
window.addEventListener('load',()=>{boot();setTimeout(boot,500);setTimeout(boot,1500)});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')boot()});
})();