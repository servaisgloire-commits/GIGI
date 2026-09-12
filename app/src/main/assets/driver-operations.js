(()=>{
'use strict';
const d=id=>document.getElementById(id);
let lastRideStatus='',lastAutoStartedRide=null,statusTimer=null;

function toastSafe(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function currentRide(){try{return typeof currentRideId!=='undefined'?currentRideId:null}catch(e){return null}}
function isDriver(){try{return typeof role!=='undefined'&&role==='driver'}catch(e){return false}}

function installCss(){
  if(d('fast-driver-operations-style'))return;
  const s=document.createElement('style');s.id='fast-driver-operations-style';s.textContent=`
    body.driver-mode #mainHeader #menuBtn{visibility:visible!important;display:grid!important;opacity:1!important;pointer-events:auto!important}
    body.driver-mode #driverBottomNav{display:grid!important;grid-template-columns:repeat(5,1fr)!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;padding:7px 6px max(7px,env(safe-area-inset-bottom))!important}
    #driverBottomNav button{min-width:0!important;padding:6px 2px!important;font-size:9px!important;line-height:1.1!important}
    #driverBottomNav button span{font-size:18px!important;margin-bottom:3px!important}
    #driverBottomNav button.fast-driver-live{color:#0b57d0;background:#eef5ff}
    #driverBottomNav button:disabled{opacity:.72}
    .fast-driver-trip-hud{display:none}
    body.driver-mode.fast-driver-trip-active #driverArea{padding-bottom:78px!important;min-height:calc(100dvh - 54px)!important;background:#e9eff6!important}
    body.driver-mode.fast-driver-trip-active .driver-nav-top,
    body.driver-mode.fast-driver-trip-active .fast-driver-advantages,
    body.driver-mode.fast-driver-trip-active .driver-nav-stats,
    body.driver-mode.fast-driver-trip-active .driver-steps-panel,
    body.driver-mode.fast-driver-trip-active #driverOffersStack,
    body.driver-mode.fast-driver-trip-active #offerCard,
    body.driver-mode.fast-driver-trip-active #driverArea>.section,
    body.driver-mode.fast-driver-trip-active #driverTrip{display:none!important}
    body.driver-mode.fast-driver-trip-active .driver-gps-map-host{height:calc(100dvh - 54px - 70px)!important;min-height:0!important;margin:0!important}
    body.driver-mode.fast-driver-trip-active .driver-gps-map-host #map,
    body.driver-mode.fast-driver-trip-active .driver-gps-map-host .mapwrap{height:100%!important;min-height:0!important}
    body.driver-mode.fast-driver-trip-active .driver-guidance-card{display:none!important}
    body.driver-mode.fast-driver-trip-active .fast-driver-trip-hud{display:grid;position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:2190;width:min(500px,calc(100% - 20px));grid-template-columns:1fr auto;gap:10px;align-items:center;background:rgba(255,255,255,.97);border:1px solid #dbe5f1;border-radius:22px;padding:12px 12px 12px 14px;box-shadow:0 16px 38px rgba(15,23,42,.2);backdrop-filter:blur(18px)}
    .fast-driver-trip-hud .trip-copy{min-width:0}
    .fast-driver-trip-hud .trip-phase{display:block;color:#0b57d0;font-size:9px;font-weight:950;letter-spacing:.7px;text-transform:uppercase}
    .fast-driver-trip-hud .trip-instruction{display:block;color:#0f172a;font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0 6px}
    .fast-driver-trip-hud .trip-metrics{display:flex;gap:12px;align-items:baseline;color:#64748b;font-size:10px;font-weight:800}
    .fast-driver-trip-hud .trip-metrics b{font-size:18px;color:#0b57d0;margin-right:3px}
    .fast-driver-trip-hud .trip-finish{border:0;background:#0f172a;color:#fff;border-radius:15px;min-height:50px;padding:0 14px;font-weight:900;font-size:11px}
    @media(max-width:380px){.fast-driver-trip-hud{grid-template-columns:1fr}.fast-driver-trip-hud .trip-finish{min-height:42px}}
  `;document.head.appendChild(s);
}

function goDriverHome(){
  d('driverProfilePage')?.classList.add('hidden');
  d('driverArea')?.classList.remove('hidden');
  const existing=d('driverBottomNav')?.querySelector('[data-driver-page="home"]');
  if(existing&&!existing.dataset.fastOperationalClick){try{existing.click()}catch(e){}}
  setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},100);
}
function goDriverProfile(){
  const existing=d('driverBottomNav')?.querySelector('[data-driver-page="profile"]');
  if(existing&&!existing.dataset.fastOperationalClick){try{existing.click();return}catch(e){}}
  d('driverArea')?.classList.add('hidden');d('driverProfilePage')?.classList.remove('hidden');
}
function openDriverRide(){
  const ride=currentRide();if(!ride)return toastSafe('Aucune course en cours');
  goDriverHome();
  try{if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}catch(e){}
}
function toggleAvailability(){
  const ride=currentRide();if(ride)return toastSafe('Terminez la course avant de modifier votre disponibilité');
  const t=d('driverToggleInput');if(!t)return toastSafe('Disponibilité indisponible');
  t.click();setTimeout(updateAvailabilityButton,80);
}
function openDriverMenu(){
  try{if(window.FASTTrackingMenu?.menu){window.FASTTrackingMenu.menu();return}}catch(e){}
  d('menuBtn')?.click();
}

function extraButton(key,icon,label){
  const b=document.createElement('button');b.type='button';b.dataset.fastDriverNav=key;b.innerHTML=`<span>${icon}</span><small>${label}</small>`;return b;
}
function ensureDriverNav(){
  if(!isDriver())return;
  installCss();
  let nav=d('driverBottomNav');
  if(!nav){nav=document.createElement('nav');nav.id='driverBottomNav';nav.className='driver-bottom-nav';d('mainApp')?.appendChild(nav)}
  nav.classList.remove('hidden');
  let home=nav.querySelector('[data-driver-page="home"]');
  if(!home){home=document.createElement('button');home.type='button';home.dataset.driverPage='home';home.innerHTML='<span>⌂</span>Carte';home.dataset.fastOperationalClick='1';home.onclick=goDriverHome}
  let profileBtn=nav.querySelector('[data-driver-page="profile"]');
  if(!profileBtn){profileBtn=document.createElement('button');profileBtn.type='button';profileBtn.dataset.driverPage='profile';profileBtn.innerHTML='<span>◉</span>Profil';profileBtn.dataset.fastOperationalClick='1';profileBtn.onclick=goDriverProfile}
  let ride=nav.querySelector('[data-fast-driver-nav="ride"]');if(!ride){ride=extraButton('ride','🚕','Course');ride.onclick=openDriverRide}
  let avail=nav.querySelector('[data-fast-driver-nav="availability"]');if(!avail){avail=extraButton('availability','●','En ligne');avail.onclick=toggleAvailability}
  let menu=nav.querySelector('[data-fast-driver-nav="menu"]');if(!menu){menu=extraButton('menu','☰','Menu');menu.onclick=openDriverMenu}
  [home,ride,avail,profileBtn,menu].forEach(x=>nav.appendChild(x));
  if(home.querySelector('small'))home.querySelector('small').textContent='Carte';else home.innerHTML='<span>⌂</span>Carte';
  if(profileBtn.querySelector('small'))profileBtn.querySelector('small').textContent='Profil';
  updateAvailabilityButton();
}
function updateAvailabilityButton(){
  const b=d('driverBottomNav')?.querySelector('[data-fast-driver-nav="availability"]');if(!b)return;
  const active=!!currentRide(),online=!!d('driverToggleInput')?.checked;
  b.disabled=active;
  b.classList.toggle('fast-driver-live',active||online);
  b.innerHTML=active?'<span>●</span><small>En course</small>':online?'<span>●</span><small>En ligne</small>':'<span>○</span><small>Hors ligne</small>';
}

function ensureTripHud(){
  let hud=d('fastDriverTripHud');if(hud)return hud;
  hud=document.createElement('div');hud.id='fastDriverTripHud';hud.className='fast-driver-trip-hud';hud.innerHTML=`<div class="trip-copy"><span class="trip-phase" id="fastDriverTripPhase">Vers la destination</span><b class="trip-instruction" id="fastDriverTripInstruction">Calcul de l’itinéraire…</b><div class="trip-metrics"><span><b id="fastDriverTripEta">—</b> min restantes</span><span><b id="fastDriverTripDistance">—</b> km</span></div></div><button type="button" class="trip-finish" id="fastDriverFinishRide">Terminer</button>`;
  document.body.appendChild(hud);
  d('fastDriverFinishRide').onclick=()=>{const b=d('completeRideBtn');if(b)b.click();else if(typeof setRideStatus==='function')setRideStatus('completed')};
  return hud;
}
function setTripMode(active){
  document.body.classList.toggle('fast-driver-trip-active',!!active&&isDriver());
  ensureTripHud();updateAvailabilityButton();
  if(active){goDriverHome();setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},120)}
}
function renderTripHud(nav){
  if(!nav?.active)return;
  const active=nav.phase==='to_destination';setTripMode(active);
  if(!active)return;
  const step=Array.isArray(nav.steps)&&nav.steps.length?nav.steps[0]:null;
  const eta=Math.max(0,Math.ceil(Number(nav.eta_min||0)));
  const km=Math.max(0,Number(nav.distance_km||0));
  if(d('fastDriverTripEta'))d('fastDriverTripEta').textContent=Number.isFinite(eta)?String(eta):'—';
  if(d('fastDriverTripDistance'))d('fastDriverTripDistance').textContent=Number.isFinite(km)?km.toFixed(km<10?1:0):'—';
  if(d('fastDriverTripInstruction'))d('fastDriverTripInstruction').textContent=step?.instruction||'Continuez vers la destination';
  if(d('fastDriverTripPhase'))d('fastDriverTripPhase').textContent='Course en cours • vers la destination';
}

function hookNavigation(){
  if(window.__fastDriverNavigationHooked)return;
  const base=window.updateDriverOnMap;if(typeof base!=='function')return;
  window.__fastDriverNavigationHooked=true;
  window.updateDriverOnMap=function(nav){base(nav);try{renderTripHud(nav)}catch(e){}};
}

async function autoStartAfterPin(){
  if(!isDriver())return;
  const ride=currentRide();if(!ride||lastAutoStartedRide===ride)return;
  const ok=d('fastPinVerified')&&!d('fastPinVerified').classList.contains('hidden');if(!ok)return;
  lastAutoStartedRide=ride;
  try{
    let status='';try{const snap=await api('/v1/rides/'+ride);status=snap?.ride?.status||''}catch(e){}
    if(['accepted','driver_arriving'].includes(status)||!status){
      if(typeof setRideStatus==='function')await setRideStatus('in_progress');
      else await api('/v1/rides/'+ride+'/status',{method:'PATCH',body:JSON.stringify({status:'in_progress'})});
    }
    setTripMode(true);
    d('fastDriverPinBox')?.classList.add('hidden');
    try{if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}catch(e){}
    toastSafe('PIN validé • navigation vers la destination');
  }catch(e){lastAutoStartedRide=null;toastSafe(e?.message||'Impossible de démarrer la course')}
}

async function syncRideStatus(){
  if(!isDriver()){setTripMode(false);return}
  ensureDriverNav();hookNavigation();autoStartAfterPin();
  const ride=currentRide();if(!ride){lastRideStatus='';lastAutoStartedRide=null;setTripMode(false);return}
  try{
    const snap=await api('/v1/rides/'+ride),status=snap?.ride?.status||'';lastRideStatus=status;
    if(status==='in_progress'){
      setTripMode(true);try{if(typeof refreshDriverNavigation==='function')refreshDriverNavigation()}catch(e){}
    }else if(['completed','cancelled'].includes(status)){
      setTripMode(false);lastAutoStartedRide=null;
    }else setTripMode(false);
  }catch(e){}
}

function boot(){
  installCss();ensureTripHud();ensureDriverNav();hookNavigation();
  d('driverToggleInput')?.addEventListener('change',updateAvailabilityButton);
  const mo=new MutationObserver(()=>{ensureDriverNav();autoStartAfterPin()});mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  clearInterval(statusTimer);statusTimer=setInterval(syncRideStatus,2200);syncRideStatus();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,200));else setTimeout(boot,200);
window.addEventListener('load',()=>setTimeout(boot,900));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncRideStatus()});
})();
