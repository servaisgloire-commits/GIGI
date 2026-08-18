/* FAST dedicated driver navigation layer.
   Passenger UI stays simple; driver accounts are routed directly to a driving GPS. */
(()=>{const l=document.createElement('link');l.rel='stylesheet';l.href='driver-gps.css';document.head.appendChild(l)})();
let driverNavPoll=null;
let driverLastLocation=null;

function setupSignupRoleSelector(){
  const select=$('signupRole');
  if(!select||$('fastRoleChoice'))return;
  const title=select.previousElementSibling?.tagName==='H3'?select.previousElementSibling:document.querySelector('.auth-card h3:last-of-type');
  if(title)title.textContent='Choisissez votre utilisation FAST';
  select.innerHTML='<option value="client">Passager</option><option value="driver">Chauffeur</option>';
  select.value='client';
  select.classList.add('hidden');
  const choice=document.createElement('div');
  choice.id='fastRoleChoice';
  choice.className='fast-role-choice';
  choice.innerHTML=`
    <button type="button" class="fast-role-card active" data-role="client">
      <span class="fast-role-icon">👤</span><b>Passager</b><small>Commander et suivre mes courses</small>
    </button>
    <button type="button" class="fast-role-card" data-role="driver">
      <span class="fast-role-icon">🚘</span><b>Chauffeur</b><small>Recevoir des courses et naviguer</small>
    </button>`;
  select.parentElement.insertBefore(choice,select);
  const help=document.createElement('p');
  help.id='fastRoleHelp';help.className='fast-role-help';
  help.textContent='Votre choix détermine automatiquement les fonctions affichées après connexion.';
  choice.insertAdjacentElement('afterend',help);
  choice.querySelectorAll('.fast-role-card').forEach(btn=>btn.onclick=()=>{
    choice.querySelectorAll('.fast-role-card').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    select.value=btn.dataset.role;
    help.textContent=btn.dataset.role==='driver'
      ? 'Compte chauffeur : validation FAST requise avant de recevoir des courses. Après connexion, le GPS chauffeur s’ouvre automatiquement.'
      : 'Compte passager : réservation, paiement, ETA et suivi du chauffeur.';
  });
}

const baseShowApp=window.showApp;
const baseRespondOffer=window.respondOffer;
const baseRenderRouteInsights=window.renderRouteInsights;
const baseShowPage=window.showPage;

function setFastRoleUi(){
  const isDriver=role==='driver';
  document.body.classList.toggle('driver-mode',isDriver);
  document.body.classList.toggle('client-mode',!isDriver);
  const passenger=$('passengerArea'),driver=$('driverArea'),nav=$('clientNav'),header=$('mainHeader');
  if(isDriver){
    passenger?.classList.add('hidden');
    driver?.classList.remove('hidden');
    nav?.classList.add('hidden');
    header?.classList.add('driver-header-minimal');
    const wrap=$('sharedMapWrap'),host=$('driverGpsMapHost');
    if(wrap&&host&&wrap.parentElement!==host)host.appendChild(wrap);
    setTimeout(()=>map&&map.resize(),180);
    try{FASTNative.setAccessToken(token);FASTNative.startDriverTracking()}catch(e){}
    startOfferPolling();
    startDriverNavigationPolling();
  }else{
    passenger?.classList.remove('hidden');
    driver?.classList.add('hidden');
    nav?.classList.remove('hidden');
    header?.classList.remove('driver-header-minimal');
    const wrap=$('sharedMapWrap');
    if(wrap&&passenger&&wrap.parentElement!==passenger)passenger.insertBefore(wrap,passenger.firstChild);
    clearInterval(driverNavPoll);
    setTimeout(()=>map&&map.resize(),180);
  }
}

window.showApp=function(){
  $('auth')?.classList.add('hidden');
  $('mainApp')?.classList.remove('hidden');
  ensureAdvancedUi();
  setFastRoleUi();
  if(role==='client')startNearbyPolling();
};

window.renderRouteInsights=function(d){
  ensureAdvancedUi();
  const box=$('routeInsights'); if(!box)return;
  box.classList.remove('hidden');
  if($('routeEta'))$('routeEta').textContent=d.duration_min+' min';
  if($('routeDistance'))$('routeDistance').textContent=d.distance_km+' km';
  if($('routeTraffic'))$('routeTraffic').textContent=d.traffic&&d.traffic.length?'Temps réel':'Routier';
  if($('routeProvider'))$('routeProvider').textContent=d.provider==='mapbox'?'Mapbox':'FAST';
  $('alternativeRoutes')?.classList.add('hidden');
  $('routeSteps')?.classList.add('hidden');
  const mini=box.querySelector('.mini-section'); if(mini)mini.classList.add('hidden');
};

function driverStepIcon(m){
  const x=(m||'').toLowerCase();
  if(x.includes('sharp-left'))return '↶';
  if(x.includes('sharp-right'))return '↷';
  if(x.includes('left'))return '↰';
  if(x.includes('right'))return '↱';
  if(x.includes('roundabout'))return '⟳';
  if(x.includes('uturn'))return '↶';
  if(x.includes('arrive'))return '●';
  return '↑';
}

function driverFormatDistance(m){
  m=Number(m||0);
  if(m>=1000)return (m/1000).toFixed(m>=10000?0:1)+' km';
  if(m>=100)return Math.round(m/10)*10+' m';
  return Math.max(0,Math.round(m))+' m';
}

function renderDriverSteps(steps=[]){
  const list=$('driverStepsList'); if(!list)return;
  $('driverStepCount').textContent=String(steps.length);
  $('driverStepsPanel').classList.toggle('hidden',steps.length===0);
  list.innerHTML=steps.slice(0,8).map((s,i)=>`<div class="driver-gps-step ${i===0?'next':''}"><div class="driver-gps-step-icon">${driverStepIcon(s.maneuver)}</div><div><b>${escapeHtml(s.instruction||'Continuez')}</b><small>${driverFormatDistance(s.distance_m)}${s.duration_min?' • '+s.duration_min+' min':''}</small></div></div>`).join('');
}

function renderDriverRouteOnMap(nav){
  if(!map||!map.isStyleLoaded()||!nav?.active)return;
  const dl=nav.driver_location||{};
  const coords=nav.polyline?decodePolyline(nav.polyline):[];
  try{
    if(map.getLayer('driver-nav-route'))map.removeLayer('driver-nav-route');
    if(map.getSource('driver-nav-route'))map.removeSource('driver-nav-route');
    if(coords.length>1){
      map.addSource('driver-nav-route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}}});
      map.addLayer({id:'driver-nav-route',type:'line',source:'driver-nav-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#1677ff','line-width':9,'line-opacity':.98}});
    }
  }catch(e){}
  if(Number.isFinite(Number(dl.lng))&&Number.isFinite(Number(dl.lat))){
    if(driverLiveMarker){driverLiveMarker.setLngLat([Number(dl.lng),Number(dl.lat)])}
    else driverLiveMarker=new mapboxgl.Marker({element:makeCarElement({heading:dl.heading},true),anchor:'center'}).setLngLat([Number(dl.lng),Number(dl.lat)]).addTo(map);
    map.easeTo({center:[Number(dl.lng),Number(dl.lat)],zoom:17.2,pitch:58,bearing:Number(dl.heading||0),duration:700});
  }
}

window.updateDriverOnMap=function(nav){
  if(!nav||!nav.active)return;
  renderDriverRouteOnMap(nav);
  const dl=nav.driver_location||{},steps=nav.steps||[],step=steps[0]||{};
  $('driverRoadPhase').textContent=nav.phase==='to_pickup'?'Vers le passager':'Vers la destination';
  $('driverInstruction').textContent=step.instruction||'Continuez sur l’itinéraire';
  $('driverTurnIcon').textContent=driverStepIcon(step.maneuver);
  $('driverStepDistance').textContent=step.distance_m!=null?driverFormatDistance(step.distance_m):driverFormatDistance(Number(nav.distance_km||0)*1000);
  $('driverNavEta').textContent=(nav.eta_min||'—')+' min';
  $('driverNavDistance').textContent=(nav.distance_km||'—')+' km';
  $('driverSpeed').textContent=Math.round(Number(dl.speed_kmh||0))+' km/h';
  const acc=Number(dl.accuracy_m||0); $('driverGpsAccuracy').textContent=acc?('±'+Math.round(acc)+' m'):'—';
  renderDriverSteps(steps);
  driverLastLocation=dl;
};

async function refreshDriverNavigation(){
  if(role!=='driver'||!currentRideId)return;
  try{
    const nav=await api('/v1/rides/'+currentRideId+'/navigation');
    if(nav.active)updateDriverOnMap(nav);
  }catch(e){}
}

function startDriverNavigationPolling(){
  clearInterval(driverNavPoll);
  driverNavPoll=setInterval(refreshDriverNavigation,1800);
  refreshDriverNavigation();
}

window.respondOffer=async function(accept){
  const el=accept?$('acceptOffer'):$('rejectOffer'),id=el?.dataset.id;
  if(!id)return;
  try{
    const d=await api('/v1/driver/offers/'+id+'/respond',{method:'POST',body:JSON.stringify({accept})});
    $('offerCard')?.classList.add('hidden');
    toast(accept?'Course acceptée':'Course refusée');
    if(accept){
      currentRideId=d.ride_id;
      $('driverTrip')?.classList.remove('hidden');
      $('driverRoadPhase').textContent='Vers le passager';
      $('driverInstruction').textContent='Calcul du meilleur itinéraire…';
      startDriverNavigationPolling();
    }
  }catch(e){toast(e.message)}
};

window.showMode=function(){ setFastRoleUi(); };

window.addEventListener('load',()=>{
  setupSignupRoleSelector();
  setTimeout(()=>{
    if(token&&profile)setFastRoleUi();
    const v=$('vehicleModeBtn'); if(v)v.onclick=()=>{};
    const back=$('backPassengerBtn'); if(back)back.onclick=()=>{};
    if(role==='client')document.querySelector('.advanced-ride .live-nav')?.classList.add('hidden');
  },350);
});
