(()=>{
'use strict';
window.FAST_CLIENT_REBUILD_ACTIVE=true;
const cr=id=>document.getElementById(id);
const ACTIVE_STATUSES=new Set(['searching','accepted','driver_arriving','in_progress']);
const paymentLabels={cash:'Espèces',card:'Carte bancaire',wallet:'Portefeuille FAST',bank_transfer:'Virement bancaire',mtn_momo:'MTN Mobile Money',airtel_money:'Airtel Money',orange_money:'Orange Money'};
const state={ready:false,pendingNearby:false,pickupMode:'current',gpsWatch:null,nearbyTimer:null,rideTimer:null,dispatchTimer:null,nearbyBusy:false,rideBusy:false,bookingBusy:false,addressSeq:{pickup:0,destination:0},addressTimer:{pickup:null,destination:null},route:null,market:null,driverPin:'',lastRide:null,lastNavFit:false};

const validLoc=loc=>!!loc&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lng));
const authToken=()=>{try{return typeof token!=='undefined'&&token?token:(localStorage.getItem('fast_access_token')||'')}catch(e){return localStorage.getItem('fast_access_token')||''}};
const isClient=()=>{try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}};
const message=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
function money(v,c='XAF',locale='fr-FR'){try{return new Intl.NumberFormat(locale||'fr-FR',{style:'currency',currency:c||'XAF',maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(Number(v||0))}catch(e){return `${Number(v||0).toLocaleString('fr-FR')} ${c||'XAF'}`}}
function escapeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function request(path,opts={}){
  let first=null;
  try{if(typeof api==='function')return await api(path,opts)}catch(e){first=e}
  try{
    if(typeof API==='undefined'||!API)throw first||new Error('Service FAST indisponible');
    const headers={...(opts.headers||{}),'Content-Type':'application/json'};const t=authToken();if(t)headers.Authorization='Bearer '+t;
    const r=await fetch(API+path,{...opts,headers});let d={};try{d=await r.json()}catch(e){}
    if(!r.ok)throw new Error(d.detail||d.message||d.error||`HTTP ${r.status}`);return d;
  }catch(e){throw first||e}
}

function routePayload(){
  return {
    pickup_address:pickup?.label||'Ma position',
    pickup:{lat:Number(pickup?.lat),lng:Number(pickup?.lng)},
    destination_address:destination?.label||'',
    destination:{lat:Number(destination?.lat),lng:Number(destination?.lng)},
    vehicle_type:'standard',
    payment_method:cr('crPaymentMethod')?.value||'cash'
  };
}

function stopLegacyClientLoops(){
  try{clearInterval(nearbyPoll);nearbyPoll=null}catch(e){}
  try{if(clientWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(clientWatchId);clientWatchId=null}catch(e){}
  document.body.classList.remove('fast-client-route-ready','fast-client-destination-ready','fast-client-searching','fast-client-active-ride','fast-passenger-waiting-driver');
}
function stopClientLoops(){
  clearInterval(state.nearbyTimer);state.nearbyTimer=null;
  clearInterval(state.rideTimer);state.rideTimer=null;
  clearTimeout(state.dispatchTimer);state.dispatchTimer=null;
  if(state.gpsWatch!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(state.gpsWatch)}catch(e){}state.gpsWatch=null}
}

function rebuildPassengerDom(){
  const host=cr('passengerArea');if(!host)return;
  stopLegacyClientLoops();
  try{if(typeof map!=='undefined'&&map&&typeof map.remove==='function')map.remove();map=null}catch(e){}
  try{if(typeof clearDriverMarkers==='function')clearDriverMarkers()}catch(e){}
  try{if(typeof driverLiveMarker!=='undefined'&&driverLiveMarker){driverLiveMarker.remove();driverLiveMarker=null}}catch(e){}
  host.className='fast-client-rebuild';
  host.innerHTML=`
    <div class="cr-stage">
      <div class="cr-map-wrap" id="crMapWrap">
        <div id="map"></div>
        <div class="cr-map-status"><span class="cr-live-dot"></span><div><b id="crMapStatus">Position FAST</b><small id="crNearbyText">Recherche des chauffeurs…</small></div></div>
        <button id="crLocateBtn" class="cr-locate" type="button" aria-label="Utiliser ma position">◎</button>
      </div>
      <section class="cr-sheet" id="crSheet" aria-label="Commander un FAST">
        <div class="cr-handle"></div>
        <div class="cr-heading"><div><small>FAST N°1</small><h2 id="crTitle">Où allez-vous ?</h2></div><span class="cr-service">FAST</span></div>
        <div class="cr-addresses" id="crAddressBox">
          <div class="cr-address-row">
            <span class="cr-dot pickup"></span>
            <div class="cr-address-input"><small>Départ</small><input id="crPickupInput" autocomplete="off" value="Ma position" placeholder="Votre point de départ"></div>
            <button id="crPickupGps" type="button" class="cr-mini-btn" aria-label="Revenir à ma position">◎</button>
            <div id="crPickupSuggestions" class="cr-suggestions hidden"></div>
          </div>
          <div class="cr-address-line"></div>
          <div class="cr-address-row">
            <span class="cr-dot destination"></span>
            <div class="cr-address-input"><small>Destination</small><input id="crDestinationInput" autocomplete="off" placeholder="Saisissez une adresse"></div>
            <button id="crClearDestination" type="button" class="cr-mini-btn hidden" aria-label="Effacer la destination">×</button>
            <div id="crDestinationSuggestions" class="cr-suggestions hidden"></div>
          </div>
        </div>
        <div id="crQuote" class="cr-quote">
          <div><small>Chauffeur le plus proche</small><b id="crNearestEta">Recherche…</b></div>
          <div><small>Trajet</small><b id="crDistance">Choisissez une destination</b></div>
          <div><small>Estimation</small><b id="crPrice">—</b></div>
        </div>
        <div class="cr-payment"><div><small>Paiement</small><b id="crCurrency">XAF</b></div><select id="crPaymentMethod"><option value="cash">Espèces</option></select></div>
        <button id="crBookBtn" class="cr-book" type="button" disabled>Choisissez une destination</button>
        <div id="crSearchState" class="cr-state hidden"><span class="cr-spinner"></span><div><b id="crSearchTitle">Recherche d’un chauffeur…</b><small id="crSearchSub">FAST contacte les chauffeurs proches</small></div><button id="crCancelSearch" type="button">Annuler</button></div>
        <div id="crRideCard" class="cr-ride hidden">
          <div class="cr-ride-head"><div class="cr-avatar">🚕</div><div><small id="crRideLabel">Votre chauffeur FAST</small><b id="crDriverName">Chauffeur confirmé</b><span id="crVehicle">Véhicule FAST</span></div><strong id="crRideEta">—</strong></div>
          <div class="cr-ride-status"><span class="cr-live-dot"></span><b id="crRideStatus">Chauffeur en route</b><small id="crLiveDistance">Suivi GPS actif</small></div>
          <div class="cr-ride-actions"><button id="crPinBtn" type="button" class="hidden">🔐 Code PIN</button><button id="crCancelRide" type="button">Annuler la course</button></div>
        </div>
      </section>
    </div>`;

  bindClientEvents();
  state.ready=true;
  try{if(typeof initMap==='function')initMap()}catch(e){console.warn('FAST client map init',e)}
  setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},250);
  locate(true);
  if(authToken()&&isClient())activateClient();
}

function bindClientEvents(){
  cr('crLocateBtn')?.addEventListener('click',()=>locate(false));
  cr('crPickupGps')?.addEventListener('click',()=>locate(false));
  cr('crClearDestination')?.addEventListener('click',()=>clearDestination());
  cr('crBookBtn')?.addEventListener('click',bookRideV4);
  cr('crCancelSearch')?.addEventListener('click',cancelRide);
  cr('crCancelRide')?.addEventListener('click',cancelRide);
  cr('crPinBtn')?.addEventListener('click',showPin);
  bindAddress('pickup');bindAddress('destination');
  document.addEventListener('pointerdown',closeSuggestionsOutside,{capture:true});
}
function closeSuggestionsOutside(e){
  if(!state.ready)return;
  if(!e.target?.closest?.('.cr-address-row')){cr('crPickupSuggestions')?.classList.add('hidden');cr('crDestinationSuggestions')?.classList.add('hidden')}
}

function locate(silent=false){
  state.pickupMode='current';const input=cr('crPickupInput');if(input)input.value='Ma position';
  if(!navigator.geolocation){if(!silent)message('GPS indisponible sur cet appareil');return}
  navigator.geolocation.getCurrentPosition(pos=>{
    pickup={label:'Ma position',lat:Number(pos.coords.latitude),lng:Number(pos.coords.longitude)};
    try{lastGps={accuracy:pos.coords.accuracy,updated:Date.now()}}catch(e){}
    const a=Math.round(Number(pos.coords.accuracy)||0);if(cr('crMapStatus'))cr('crMapStatus').textContent=a?`GPS ±${a} m`:'Position trouvée';
    try{if(typeof drawRoute==='function')drawRoute(state.route||currentRoute||null)}catch(e){}
    estimateRoute();startNearby();
  },()=>{if(!silent)message('Autorisez la localisation pour utiliser FAST')},{enableHighAccuracy:true,timeout:12000,maximumAge:500});
  startGpsWatch();
}
function startGpsWatch(){
  if(!navigator.geolocation||state.gpsWatch!==null)return;
  state.gpsWatch=navigator.geolocation.watchPosition(pos=>{
    if(state.pickupMode!=='current')return;
    const next={label:'Ma position',lat:Number(pos.coords.latitude),lng:Number(pos.coords.longitude)};
    if(!validLoc(next))return;pickup=next;try{lastGps={accuracy:pos.coords.accuracy,updated:Date.now()}}catch(e){}
    const a=Math.round(Number(pos.coords.accuracy)||0);if(cr('crMapStatus'))cr('crMapStatus').textContent=a?`GPS ±${a} m`:'GPS actif';
    if(!currentRideId){try{if(typeof drawRoute==='function')drawRoute(state.route||currentRoute||null)}catch(e){}}
  },()=>{},{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
}

function bindAddress(type){
  const input=cr(type==='pickup'?'crPickupInput':'crDestinationInput');const list=cr(type==='pickup'?'crPickupSuggestions':'crDestinationSuggestions');if(!input||!list)return;
  input.addEventListener('focus',()=>{if(input.value.trim().length>=2&&list.children.length)list.classList.remove('hidden')});
  input.addEventListener('input',()=>{
    if(type==='pickup')state.pickupMode='address';
    const seq=++state.addressSeq[type];clearTimeout(state.addressTimer[type]);const q=input.value.trim();
    if(type==='destination'){destination=null;state.route=null;try{currentRoute=null}catch(e){}updateBookState();cr('crClearDestination')?.classList.toggle('hidden',!q)}
    if(q.length<2){list.innerHTML='';list.classList.add('hidden');if(type==='pickup')pickup=null;return}
    state.addressTimer[type]=setTimeout(async()=>{
      try{const d=await request('/v1/places/autocomplete?q='+encodeURIComponent(q));if(seq!==state.addressSeq[type])return;renderSuggestions(type,d?.items||[])}catch(e){if(seq===state.addressSeq[type]){list.innerHTML='';list.classList.add('hidden');message('Recherche d’adresse indisponible. Réessayez.')}}
    },180);
  });
}
function renderSuggestions(type,items){
  const list=cr(type==='pickup'?'crPickupSuggestions':'crDestinationSuggestions');if(!list)return;list.innerHTML='';
  (items||[]).slice(0,7).forEach(item=>{
    const row=document.createElement('button');row.type='button';row.className='cr-suggestion';row.innerHTML=`<span>📍</span><div><b>${escapeText(item.label||'Adresse')}</b><small>${type==='pickup'?'Point de départ':'Destination'}</small></div>`;
    let selecting=false;
    const choose=async e=>{if(selecting)return;selecting=true;e?.preventDefault?.();e?.stopPropagation?.();try{await selectPlace(type,item)}finally{setTimeout(()=>{selecting=false},400)}};
    row.addEventListener('pointerdown',e=>e.preventDefault());row.addEventListener('pointerup',choose);row.addEventListener('click',choose);list.appendChild(row);
  });
  list.classList.toggle('hidden',!list.children.length);
}
async function resolvePlace(item){
  if(validLoc(item))return item;
  if(item?.id){const p=await request('/v1/places/details?place_id='+encodeURIComponent(item.id));if(validLoc(p))return p}
  throw new Error('Coordonnées indisponibles');
}
async function selectPlace(type,item){
  try{
    const p=await resolvePlace(item);const loc={label:p.label||item.label,lat:Number(p.lat),lng:Number(p.lng)};if(!validLoc(loc))throw new Error('Adresse invalide');
    if(type==='pickup'){pickup=loc;state.pickupMode='address';cr('crPickupInput').value=loc.label}else{destination=loc;cr('crDestinationInput').value=loc.label;cr('crClearDestination')?.classList.remove('hidden')}
    cr(type==='pickup'?'crPickupSuggestions':'crDestinationSuggestions')?.classList.add('hidden');
    try{if(typeof drawRoute==='function')drawRoute(state.route||currentRoute||null)}catch(e){}
    await estimateRoute();if(type==='pickup')startNearby();
  }catch(e){message('Impossible de sélectionner cette adresse')}
}
function clearDestination(){
  destination=null;state.route=null;try{currentRoute=null}catch(e){};const i=cr('crDestinationInput');if(i)i.value='';cr('crClearDestination')?.classList.add('hidden');cr('crDestinationSuggestions')?.classList.add('hidden');
  cr('crDistance').textContent='Choisissez une destination';cr('crPrice').textContent='—';updateBookState();try{if(typeof drawRoute==='function')drawRoute(null)}catch(e){}
}

async function loadMarket(){
  if(!validLoc(pickup))return null;
  try{const d=await request(`/v1/market?lat=${encodeURIComponent(pickup.lat)}&lng=${encodeURIComponent(pickup.lng)}`);state.market=d?.market||state.market;applyMarket(state.market);return state.market}catch(e){return state.market}
}
function applyMarket(market){
  if(!market)return;const methods=(market.payment_methods||['cash']).map(String);const select=cr('crPaymentMethod');if(select){const before=select.value;select.innerHTML=methods.map(v=>`<option value="${escapeText(v)}">${escapeText(paymentLabels[v]||v)}</option>`).join('');if(methods.includes(before))select.value=before}if(cr('crCurrency'))cr('crCurrency').textContent=market.currency||'XAF';
}
async function estimateRoute(){
  updateBookState();if(!validLoc(pickup)||!validLoc(destination)){state.route=null;return null}
  if(cr('crDistance'))cr('crDistance').textContent='Calcul du trajet…';if(cr('crPrice'))cr('crPrice').textContent='Calcul…';
  try{
    const d=await request('/v1/routes/estimate',{method:'POST',body:JSON.stringify(routePayload())});state.route=d;try{currentRoute=d}catch(e){};if(d.market){state.market=d.market;applyMarket(d.market)}else await loadMarket();
    if(cr('crDistance'))cr('crDistance').textContent=`${d.distance_km} km • ${d.duration_min} min`;if(cr('crPrice'))cr('crPrice').textContent=money(d.estimated_price,d.currency||state.market?.currency||'XAF',d.market?.locale);
    try{if(typeof drawRoute==='function')drawRoute(d)}catch(e){};updateBookState();return d;
  }catch(e){
    if(cr('crDistance'))cr('crDistance').textContent='Destination confirmée';if(cr('crPrice'))cr('crPrice').textContent='Estimation au démarrage';try{if(typeof drawRoute==='function')drawRoute(null)}catch(x){};updateBookState();return null;
  }
}
function updateBookState(){
  const b=cr('crBookBtn');if(!b)return;const ready=isClient()&&validLoc(pickup)&&validLoc(destination)&&!currentRideId&&!state.bookingBusy;b.disabled=!ready;b.textContent=ready?'Commander un FAST':currentRideId?'Course en cours':'Choisissez une destination';
}

async function loadNearbyV4(){
  if(state.nearbyBusy||!state.ready||!authToken()||!isClient()||currentRideId||!validLoc(pickup)||typeof map==='undefined'||!map)return;state.nearbyBusy=true;
  try{
    await loadMarket();const d=await request(`/v1/nearby-drivers?lat=${encodeURIComponent(pickup.lat)}&lng=${encodeURIComponent(pickup.lng)}&vehicle_type=standard&radius_km=12`);
    try{if(typeof clearDriverMarkers==='function')clearDriverMarkers()}catch(e){}
    const items=d?.items||[];items.forEach(dr=>{try{const el=document.createElement('div');el.className='cr-driver-marker';el.textContent='🚕';const m=new mapboxgl.Marker({element:el,anchor:'center'}).setLngLat([Number(dr.lng),Number(dr.lat)]).addTo(map);driverMarkers.push(m)}catch(e){}});
    if(cr('crNearbyText'))cr('crNearbyText').textContent=d.count?`${d.count} chauffeur${d.count>1?'s':''} à proximité`:'Aucun chauffeur proche pour le moment';if(cr('crNearestEta'))cr('crNearestEta').textContent=items[0]?`${Math.max(1,Math.round(Number(items[0].eta_min)||1))} min`:'Recherche…';
  }catch(e){if(cr('crNearbyText'))cr('crNearbyText').textContent='Disponibilité en cours de mise à jour'}finally{state.nearbyBusy=false}
}
function startNearby(){
  state.pendingNearby=false;clearInterval(state.nearbyTimer);if(!state.ready||!authToken()||!isClient()||currentRideId)return;loadNearbyV4();state.nearbyTimer=setInterval(loadNearbyV4,7000);
}

async function bookRideV4(){
  if(state.bookingBusy)return;if(!isClient())return message('Compte passager requis');if(!validLoc(pickup))return message('Choisissez votre point de départ');if(!validLoc(destination))return message('Choisissez une destination dans la liste');if(currentRideId)return showRideState();
  state.bookingBusy=true;updateBookState();showSearching('Création de la course…','FAST prépare votre trajet');clearInterval(state.nearbyTimer);try{if(typeof clearDriverMarkers==='function')clearDriverMarkers()}catch(e){}
  try{
    const created=await request('/v1/rides',{method:'POST',body:JSON.stringify(routePayload())});if(!created?.ride?.id)throw new Error('Course non créée');currentRideId=created.ride.id;state.lastRide=created.ride;try{localStorage.setItem('fast_client_active_ride',currentRideId)}catch(e){}
    if(created.route){state.route=created.route;try{currentRoute=created.route;if(typeof drawRoute==='function')drawRoute(created.route)}catch(e){}}
    startRidePolling();showSearching('Recherche d’un chauffeur…','FAST contacte les chauffeurs les plus proches');await dispatchRide();
  }catch(e){currentRideId=null;state.lastRide=null;state.bookingBusy=false;hideRideStates();updateBookState();startNearby();message(e?.message||'Impossible de commander pour le moment')}
}
async function dispatchRide(){
  const id=currentRideId;if(!id)return;clearTimeout(state.dispatchTimer);
  try{const d=await request('/v1/rides/'+id+'/dispatch',{method:'POST'});if(d?.matched){showSearching('Chauffeur trouvé','En attente de sa confirmation');return}state.dispatchTimer=setTimeout(dispatchRide,6000)}catch(e){state.dispatchTimer=setTimeout(dispatchRide,8000)}
}
function startRidePolling(){clearInterval(state.rideTimer);refreshRide();state.rideTimer=setInterval(refreshRide,2500)}
async function refreshRide(){
  const id=currentRideId;if(!id||state.rideBusy)return;state.rideBusy=true;
  try{
    const snap=await request('/v1/rides/'+id),ride=snap?.ride;if(!ride||id!==currentRideId)return;state.lastRide=ride;
    if(ride.status==='searching'){showSearching('Recherche d’un chauffeur…','FAST élargit la recherche automatiquement')}
    if(['accepted','driver_arriving','in_progress'].includes(ride.status)){state.bookingBusy=false;clearTimeout(state.dispatchTimer);showActiveRide(snap);if(['accepted','driver_arriving'].includes(ride.status))ensurePin(id);refreshNavigation(id,ride)}
    if(ride.status==='completed'){await completeClientRide(ride)}
    if(ride.status==='cancelled'){finishRide('Course annulée')}
  }catch(e){}finally{state.rideBusy=false}
}
function showSearching(title,sub){
  cr('crRideCard')?.classList.add('hidden');cr('crSearchState')?.classList.remove('hidden');if(cr('crSearchTitle'))cr('crSearchTitle').textContent=title;if(cr('crSearchSub'))cr('crSearchSub').textContent=sub;if(cr('crTitle'))cr('crTitle').textContent='Recherche en cours';
}
function showActiveRide(snap){
  const r=snap.ride||{},d=snap.driver||{},v=snap.vehicle||{};cr('crSearchState')?.classList.add('hidden');cr('crRideCard')?.classList.remove('hidden');if(cr('crTitle'))cr('crTitle').textContent=r.status==='in_progress'?'Course en cours':'Votre chauffeur arrive';
  const name=((d.first_name||'Chauffeur')+' '+(d.last_name||'')).trim();if(cr('crDriverName'))cr('crDriverName').textContent=name;if(cr('crVehicle'))cr('crVehicle').textContent=`${v.make||'Véhicule'} ${v.model||''}${v.plate_number?' • '+v.plate_number:''}`.trim();if(cr('crRideEta'))cr('crRideEta').textContent=(r.driver_eta_min?Math.max(1,Math.round(Number(r.driver_eta_min)))+' min':'—');
  if(cr('crRideStatus'))cr('crRideStatus').textContent=r.status==='accepted'?'Chauffeur confirmé':r.status==='driver_arriving'?'Chauffeur en approche':'Course en cours';cr('crPinBtn')?.classList.toggle('hidden',!['accepted','driver_arriving'].includes(r.status));cr('crCancelRide')?.classList.toggle('hidden',r.status==='in_progress');
}
async function refreshNavigation(id,ride){
  try{const nav=await request('/v1/rides/'+id+'/navigation');if(!nav?.active)return;try{if(typeof updateDriverOnMap==='function')updateDriverOnMap(nav)}catch(e){};const eta=Math.max(1,Math.round(Number(nav.eta_min)||Number(ride.driver_eta_min)||1));if(cr('crRideEta'))cr('crRideEta').textContent=eta+' min';if(cr('crLiveDistance')){const km=Number(nav.distance_km);cr('crLiveDistance').textContent=(Number.isFinite(km)?`${km.toFixed(km<10?1:0)} km • `:'')+'GPS en direct'}}catch(e){}
}
async function cancelRide(){
  const id=currentRideId;if(!id)return;const ok=confirm('Annuler cette course FAST ?');if(!ok)return;try{await request('/v1/rides/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:'cancelled'})});finishRide('Course annulée')}catch(e){message(e?.message||'Impossible d’annuler la course')}
}
function hideRideStates(){cr('crSearchState')?.classList.add('hidden');cr('crRideCard')?.classList.add('hidden');if(cr('crTitle'))cr('crTitle').textContent='Où allez-vous ?'}
function finishRide(text){
  const old=currentRideId;clearInterval(state.rideTimer);state.rideTimer=null;clearTimeout(state.dispatchTimer);state.dispatchTimer=null;state.bookingBusy=false;currentRideId=null;state.lastRide=null;state.driverPin='';try{localStorage.removeItem('fast_client_active_ride');if(old)localStorage.removeItem('fast_pin_'+old)}catch(e){};try{if(typeof driverLiveMarker!=='undefined'&&driverLiveMarker){driverLiveMarker.remove();driverLiveMarker=null};if(typeof removeLayerAndSource==='function')removeLayerAndSource('fast-live-route')}catch(e){};hideRideStates();updateBookState();startNearby();if(text)message(text)
}

async function ensurePin(id){
  if(state.driverPin||!id)return state.driverPin;try{state.driverPin=localStorage.getItem('fast_pin_'+id)||''}catch(e){};if(/^\d{4}$/.test(state.driverPin))return state.driverPin;
  try{const t=authToken();const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/issue_ride_pin`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({p_ride_id:id})});let d={};try{d=await r.json()}catch(e){};if(r.ok){const x=Array.isArray(d)?d[0]:d;state.driverPin=String(x?.pin||'');if(/^\d{4}$/.test(state.driverPin))localStorage.setItem('fast_pin_'+id,state.driverPin)}}catch(e){}return state.driverPin;
}
async function showPin(){const id=currentRideId;if(!id)return message('Aucune course active');const pin=await ensurePin(id);if(!pin)return message('Le code PIN est en cours de préparation');document.querySelector('.cr-modal')?.remove();const m=document.createElement('div');m.className='cr-modal';m.innerHTML=`<div class="cr-modal-card"><button class="cr-close" type="button">×</button><small>CODE PIN FAST</small><h3>${pin.split('').join(' ')}</h3><p>Donnez ce code uniquement au chauffeur FAST arrivé devant vous.</p></div>`;document.body.appendChild(m);m.querySelector('.cr-close').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()}}

async function completeClientRide(ride){
  const copy={...ride};finishRide('Course terminée');showRating(copy);try{if(typeof loadHistory==='function')loadHistory()}catch(e){}
}
function showRating(ride){
  if(!ride?.id||!ride?.driver_id)return;try{if(localStorage.getItem('fast_rated_'+ride.id)==='1')return}catch(e){};document.querySelector('.cr-rating')?.remove();let score=5;const m=document.createElement('div');m.className='cr-rating';m.innerHTML=`<div class="cr-rating-card"><button class="cr-close" type="button">×</button><small>COURSE TERMINÉE</small><h3>Comment s’est passée votre course ?</h3><div class="cr-stars">${[1,2,3,4,5].map(n=>`<button type="button" data-score="${n}" class="on">★</button>`).join('')}</div><textarea maxlength="500" placeholder="Commentaire facultatif"></textarea><button class="cr-rating-send" type="button">Envoyer mon avis</button></div>`;document.body.appendChild(m);
  const render=()=>m.querySelectorAll('[data-score]').forEach(b=>b.classList.toggle('on',Number(b.dataset.score)<=score));m.querySelectorAll('[data-score]').forEach(b=>b.onclick=()=>{score=Number(b.dataset.score);render()});m.querySelector('.cr-close').onclick=()=>m.remove();m.querySelector('.cr-rating-send').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Envoi…';try{const t=authToken(),r=await fetch(SUPABASE_URL+'/rest/v1/ratings',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({ride_id:ride.id,from_user_id:profile?.id,to_user_id:ride.driver_id,score,comment:m.querySelector('textarea').value.trim()||null})});if(!r.ok&&r.status!==409)throw new Error('Avis non enregistré');localStorage.setItem('fast_rated_'+ride.id,'1');m.remove();message('Merci pour votre avis')}catch(err){b.disabled=false;b.textContent='Envoyer mon avis';message(err.message||'Impossible d’enregistrer l’avis')}};
}

async function restoreRide(){
  if(!authToken()||!isClient())return;let id=currentRideId;try{if(!id)id=localStorage.getItem('fast_client_active_ride')||null}catch(e){};
  if(!id){try{const h=await request('/v1/rides/history');const active=(h?.items||[]).find(r=>ACTIVE_STATUSES.has(String(r.status)));id=active?.id||null}catch(e){}}
  if(id){currentRideId=id;clearInterval(state.nearbyTimer);startRidePolling()}else startNearby();
}
function activateClient(){if(!state.ready||!isClient())return;startGpsWatch();restoreRide();loadMarket();updateBookState()}

const legacyShowApp=typeof showApp==='function'?showApp:null;if(legacyShowApp){showApp=function(){const r=legacyShowApp();setTimeout(()=>{if(isClient())activateClient()},100);return r}}
const legacyLogout=typeof logout==='function'?logout:null;if(legacyLogout){logout=function(){stopClientLoops();try{currentRideId=null}catch(e){};return legacyLogout()}}
try{routeBody=routePayload}catch(e){}
try{refreshRoute=estimateRoute}catch(e){}
try{loadNearbyDrivers=loadNearbyV4}catch(e){}
try{startNearbyPolling=function(){state.pendingNearby=true;if(state.ready)startNearby()}}catch(e){}
try{pollRide=startRidePolling}catch(e){}

window.addEventListener('load',()=>setTimeout(rebuildPassengerDom,40));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.ready&&authToken()&&isClient()){if(currentRideId)refreshRide();else startNearby()}});
})();
