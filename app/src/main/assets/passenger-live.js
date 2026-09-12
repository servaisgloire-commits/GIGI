(()=>{
'use strict';
const pl$=id=>document.getElementById(id);
let plTimer=null,plBusy=false,plMarker=null,plLastRideId=null,plFirstFit=true;

function installPassengerLiveCss(){
  if(pl$('fast-passenger-live-style'))return;
  const s=document.createElement('style');s.id='fast-passenger-live-style';s.textContent=`
    .fast-passenger-live-card{position:absolute;left:14px;right:14px;bottom:22px;z-index:8200;background:rgba(255,255,255,.96);border:1px solid #d9e8f8;border-radius:20px;padding:13px 14px;box-shadow:0 16px 38px rgba(8,48,92,.18);backdrop-filter:blur(14px);display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;color:#12304e}
    .fast-passenger-live-card.hidden{display:none!important}.fast-passenger-live-card small{display:block;color:#70849a;font-size:10px;font-weight:750}.fast-passenger-live-card b{display:block;font-size:15px;margin-top:2px}.fast-passenger-live-card .fast-live-eta{text-align:right;color:#0b69ed;font-weight:950;font-size:20px}.fast-passenger-live-card .fast-live-distance{grid-column:1/-1;color:#60748a;font-size:11px;font-weight:760}
    .fast-passenger-driver-marker{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#0b69ed;border:4px solid #fff;box-shadow:0 8px 20px rgba(11,105,237,.32);font-size:21px;transform-origin:center}
    body.fast-passenger-waiting-driver #clientNav{display:none!important}
    body.fast-passenger-waiting-driver #homePage{display:block!important;position:relative;height:calc(100dvh - 58px)!important;overflow:hidden!important}
    body.fast-passenger-waiting-driver #historyPage,body.fast-passenger-waiting-driver #profilePage{display:none!important}
    body.fast-passenger-waiting-driver #passengerArea{height:100%!important;position:relative!important;overflow:hidden!important}
    body.fast-passenger-waiting-driver #sharedMapWrap{height:100%!important;min-height:100%!important;margin:0!important;border-radius:0!important;position:absolute!important;inset:0!important}
    body.fast-passenger-waiting-driver #map{height:100%!important;min-height:100%!important}
    body.fast-passenger-waiting-driver .booking-panel{display:none!important}
    body.fast-passenger-waiting-driver #mainHeader{position:relative!important;z-index:9000!important}
    body.fast-passenger-waiting-driver #menuBtn{visibility:visible!important;display:grid!important;pointer-events:auto!important}
    body.fast-passenger-waiting-driver .floating-locate{top:18px!important;right:16px!important}
    @media(max-width:480px){.fast-passenger-live-card{left:10px;right:10px;bottom:14px;border-radius:18px;padding:11px 12px}.fast-passenger-live-card .fast-live-eta{font-size:18px}}
  `;document.head.appendChild(s);
}

function ensureLiveCard(){
  const wrap=pl$('sharedMapWrap');if(!wrap)return null;
  let card=pl$('fastPassengerLiveCard');
  if(!card){
    card=document.createElement('div');card.id='fastPassengerLiveCard';card.className='fast-passenger-live-card hidden';
    card.innerHTML='<div><small id="fastLiveLabel">Chauffeur FAST</small><b id="fastLiveStatus">Position du chauffeur</b></div><div class="fast-live-eta" id="fastLiveEta">—</div><div class="fast-live-distance" id="fastLiveDistance">Mise à jour GPS en cours…</div>';
    wrap.appendChild(card);
  }
  return card;
}

function setWaitingMode(on){
  document.body.classList.toggle('fast-passenger-waiting-driver',!!on);
  if(on){
    try{if(typeof showPage==='function')showPage('homePage')}catch(e){}
    pl$('historyPage')?.classList.add('hidden');pl$('profilePage')?.classList.add('hidden');pl$('homePage')?.classList.remove('hidden');
  }
  setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},80);
}

function removeDriverLiveRoute(){
  try{
    if(typeof map==='undefined'||!map||!map.isStyleLoaded())return;
    if(map.getLayer('fast-passenger-driver-route'))map.removeLayer('fast-passenger-driver-route');
    if(map.getSource('fast-passenger-driver-route'))map.removeSource('fast-passenger-driver-route');
  }catch(e){}
}

function drawDriverLiveRoute(nav){
  try{
    if(typeof map==='undefined'||!map||!map.isStyleLoaded()||!nav?.polyline)return;
    const coords=typeof decodePolyline==='function'?decodePolyline(nav.polyline):[];if(coords.length<2)return;
    const data={type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}};
    if(map.getSource('fast-passenger-driver-route'))map.getSource('fast-passenger-driver-route').setData(data);
    else{
      map.addSource('fast-passenger-driver-route',{type:'geojson',data});
      map.addLayer({id:'fast-passenger-driver-route',type:'line',source:'fast-passenger-driver-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#1677ff','line-width':6,'line-opacity':.82,'line-dasharray':[1.5,1.1]}});
    }
  }catch(e){}
}

function updateDriverMarker(nav){
  const d=nav?.driver_location||{},lat=Number(d.lat),lng=Number(d.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  try{
    if(typeof mapboxgl==='undefined'||typeof map==='undefined'||!map)return;
    if(!plMarker){
      const el=document.createElement('div');el.className='fast-passenger-driver-marker';el.textContent='🚕';
      plMarker=new mapboxgl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
    }else plMarker.setLngLat([lng,lat]);
    const markerEl=plMarker.getElement?.();if(markerEl&&Number.isFinite(Number(d.heading)))markerEl.style.transform=`rotate(${Number(d.heading)}deg)`;
    if(plFirstFit){
      plFirstFit=false;
      try{
        const bounds=new mapboxgl.LngLatBounds();bounds.extend([lng,lat]);
        if(typeof pickup!=='undefined'&&pickup&&Number.isFinite(Number(pickup.lng))&&Number.isFinite(Number(pickup.lat)))bounds.extend([Number(pickup.lng),Number(pickup.lat)]);
        map.fitBounds(bounds,{padding:{top:90,bottom:150,left:55,right:55},duration:500,maxZoom:16.8});
      }catch(e){}
    }
  }catch(e){}
}

function clearPassengerTracking(){
  setWaitingMode(false);pl$('fastPassengerLiveCard')?.classList.add('hidden');removeDriverLiveRoute();
  try{plMarker?.remove()}catch(e){}plMarker=null;plFirstFit=true;plLastRideId=null;
}

function statusText(status){
  if(status==='accepted')return 'Votre chauffeur arrive';
  if(status==='driver_arriving')return 'Votre chauffeur est en approche';
  if(status==='in_progress')return 'Course en cours';
  return 'Chauffeur FAST';
}

async function refreshPassengerTracking(){
  if(plBusy||typeof role==='undefined'||role!=='client'||typeof currentRideId==='undefined'||!currentRideId){if(!currentRideId)clearPassengerTracking();return}
  plBusy=true;
  try{
    const id=currentRideId;
    const snap=await api('/v1/rides/'+id),ride=snap?.ride;
    if(!ride||id!==currentRideId)return;
    const waiting=ride.status==='accepted'||ride.status==='driver_arriving';
    if(!waiting){
      if(ride.status==='cancelled'||ride.status==='completed')clearPassengerTracking();
      else setWaitingMode(false);
      return;
    }
    if(plLastRideId!==id){plLastRideId=id;plFirstFit=true}
    setWaitingMode(true);
    const card=ensureLiveCard();card?.classList.remove('hidden');
    if(pl$('fastLiveStatus'))pl$('fastLiveStatus').textContent=statusText(ride.status);
    let nav=null;try{nav=await api('/v1/rides/'+id+'/navigation')}catch(e){}
    if(nav?.active){
      updateDriverMarker(nav);drawDriverLiveRoute(nav);
      const eta=Math.max(1,Math.round(Number(nav.eta_min)||Number(ride.driver_eta_min)||1));
      const distance=Number(nav.distance_km);
      if(pl$('fastLiveEta'))pl$('fastLiveEta').textContent=eta+' min';
      if(pl$('fastLiveDistance'))pl$('fastLiveDistance').textContent=(Number.isFinite(distance)?distance.toFixed(distance<10?1:0)+' km • ':'')+'Suivi GPS actualisé';
      if(pl$('rideEta'))pl$('rideEta').textContent=eta+' min';
    }else{
      const eta=Math.max(1,Math.round(Number(ride.driver_eta_min)||1));
      if(pl$('fastLiveEta'))pl$('fastLiveEta').textContent=eta+' min';
      if(pl$('fastLiveDistance'))pl$('fastLiveDistance').textContent='Connexion à la position du chauffeur…';
    }
  }catch(e){}finally{plBusy=false}
}

function startPassengerTracking(){
  installPassengerLiveCss();ensureLiveCard();clearInterval(plTimer);plTimer=setInterval(refreshPassengerTracking,5000);refreshPassengerTracking();
}
window.addEventListener('load',()=>setTimeout(startPassengerTracking,1300));
window.addEventListener('fast:ride-restored',()=>setTimeout(refreshPassengerTracking,120));
window.addEventListener('fast:ride-cancelled',()=>setTimeout(clearPassengerTracking,80));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(refreshPassengerTracking,120)});
window.FASTPassengerTracking={refresh:refreshPassengerTracking,clear:clearPassengerTracking};
})();