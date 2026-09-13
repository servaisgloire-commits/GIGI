(()=>{
'use strict';
const d=id=>document.getElementById(id);
let lastRideStatus='',statusTimer=null,transitionBusy=false;

function toastSafe(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function currentRide(){try{return typeof currentRideId!=='undefined'?currentRideId:null}catch(e){return null}}
function isDriver(){try{return typeof role!=='undefined'&&role==='driver'}catch(e){return false}}
function authToken(){try{return (typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||''}catch(e){return ''}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function directApi(path,opts={},attempt=0){
  const t=authToken();
  if(!t)throw new Error('Session chauffeur expirée. Reconnectez-vous.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  try{
    const headers={...(opts.headers||{}),'Content-Type':'application/json',Authorization:'Bearer '+t};
    const r=await fetch(API+path,{...opts,headers,signal:opts.signal||controller.signal});
    let body={};try{body=await r.json()}catch(e){}
    if(!r.ok){
      const msg=body.detail||body.message||body.error||`HTTP ${r.status}`;
      const err=new Error(msg);err.status=r.status;throw err;
    }
    return body;
  }catch(e){
    const transient=e?.name==='AbortError'||/Failed to fetch|NetworkError|Load failed|timeout|temporarily unavailable|HTTP 5\d\d/i.test(String(e?.message||e));
    if(transient&&attempt<2){await sleep(450*(attempt+1));return directApi(path,opts,attempt+1)}
    if(e?.name==='AbortError')throw new Error('Connexion FAST temporairement indisponible. Réessayez.');
    throw e;
  }finally{clearTimeout(timer)}
}

async function securityState(rideId){
  const t=authToken();if(!t)return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_ride_security_state`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({p_ride_id:rideId})});
    if(!r.ok)return null;return await r.json();
  }catch(e){return null}
}
function pinVisibleVerified(){const n=d('fastPinVerified');return !!n&&!n.classList.contains('hidden')}

function installCss(){
  if(d('fast-driver-operations-style'))return;
  const s=document.createElement('style');s.id='fast-driver-operations-style';s.textContent=`
    body.driver-mode #mainHeader #menuBtn{visibility:visible!important;display:grid!important;opacity:1!important;pointer-events:auto!important}
    body.driver-mode #passengerArea,body.driver-mode .booking-panel,body.driver-mode #crAddressBox,body.driver-mode #crQuote,body.driver-mode #crBookBtn,body.driver-mode .cr-payment,body.driver-mode #crFlexCard,body.driver-mode #crPaymentFixed{display:none!important}
    body.driver-mode #driverArea{display:block!important}
    body.driver-mode #driverBottomNav{display:grid!important;grid-template-columns:repeat(5,1fr)!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;padding:7px 6px max(7px,env(safe-area-inset-bottom))!important}
    #driverBottomNav button{min-width:0!important;padding:6px 2px!important;font-size:9px!important;line-height:1.1!important}
    #driverBottomNav button span{font-size:18px!important;margin-bottom:3px!important}
    #driverBottomNav button.fast-driver-live{color:#0b57d0;background:#eef5ff}
    #driverBottomNav button:disabled{opacity:.72}
    body.driver-mode #driverTrip>.driver-trip-actions{display:none!important}
    .fast-driver-trip-hud{display:none}
    .fast-driver-checkpoint{display:none;position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:2210;width:min(500px,calc(100% - 20px));background:rgba(255,255,255,.985);border:1px solid #dbe5f1;border-radius:22px;padding:12px;box-shadow:0 16px 38px rgba(15,23,42,.2);backdrop-filter:blur(18px)}
    body.driver-mode .fast-driver-checkpoint.on{display:block}
    .fast-driver-checkpoint .cp-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .fast-driver-checkpoint .cp-top small{display:block;color:#0b57d0;font-size:9px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
    .fast-driver-checkpoint .cp-top b{display:block;margin-top:3px;color:#0f172a;font-size:14px}
    .fast-driver-checkpoint .cp-top span{display:block;margin-top:3px;color:#64748b;font-size:10px}
    .fast-driver-checkpoint .cp-badge{flex:0 0 auto;padding:6px 8px;border-radius:999px;background:#eef5ff;color:#0b57d0;font-size:9px;font-weight:900}
    .fast-driver-checkpoint .cp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}
    .fast-driver-checkpoint .cp-step{padding:7px 5px;border-radius:10px;background:#f3f6fa;color:#728196;text-align:center;font-size:8px;font-weight:850}
    .fast-driver-checkpoint .cp-step.done{background:#eaf8ef;color:#16814b}.fast-driver-checkpoint .cp-step.active{background:#eaf3ff;color:#0b57d0}
    .fast-driver-checkpoint .cp-action{width:100%;min-height:46px;border:0;border-radius:14px;background:#0b57d0;color:#fff;font-weight:950;font-size:12px}
    .fast-driver-checkpoint .cp-action.dark{background:#101828}.fast-driver-checkpoint .cp-action:disabled{background:#cbd5e1;color:#64748b}
    .fast-driver-checkpoint #fastDriverPinBox{margin:8px 0 10px!important;box-shadow:none!important}
    body.driver-mode.fast-driver-trip-active #driverArea{padding-bottom:148px!important;min-height:calc(100dvh - 54px)!important;background:#e9eff6!important}
    body.driver-mode.fast-driver-trip-active .driver-nav-top,body.driver-mode.fast-driver-trip-active .fast-driver-advantages,body.driver-mode.fast-driver-trip-active .driver-nav-stats,body.driver-mode.fast-driver-trip-active .driver-steps-panel,body.driver-mode.fast-driver-trip-active #driverOffersStack,body.driver-mode.fast-driver-trip-active #offerCard,body.driver-mode.fast-driver-trip-active #driverArea>.section{display:none!important}
    body.driver-mode.fast-driver-trip-active .driver-gps-map-host{height:calc(100dvh - 54px - 70px)!important;min-height:0!important;margin:0!important}
    body.driver-mode.fast-driver-trip-active .driver-gps-map-host #map,body.driver-mode.fast-driver-trip-active .driver-gps-map-host .mapwrap{height:100%!important;min-height:0!important}
    body.driver-mode.fast-driver-trip-active .driver-guidance-card{display:none!important}
    body.driver-mode.fast-driver-trip-active .fast-driver-trip-hud{display:none!important}
  `;document.head.appendChild(s);
}

function goDriverHome(){
  d('driverProfilePage')?.classList.add('hidden');d('driverArea')?.classList.remove('hidden');
  const existing=d('driverBottomNav')?.querySelector('[data-driver-page="home"]');if(existing&&!existing.dataset.fastOperationalClick){try{existing.click()}catch(e){}}
  setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},100);
}
function goDriverProfile(){
  const existing=d('driverBottomNav')?.querySelector('[data-driver-page="profile"]');if(existing&&!existing.dataset.fastOperationalClick){try{existing.click();return}catch(e){}}
  d('driverArea')?.classList.add('hidden');d('driverProfilePage')?.classList.remove('hidden');
}
function openDriverRide(){const ride=currentRide();if(!ride)return toastSafe('Aucune course en cours');goDriverHome();try{if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}catch(e){}}
function toggleAvailability(){const ride=currentRide();if(ride)return toastSafe('Terminez la course avant de modifier votre disponibilité');const t=d('driverToggleInput');if(!t)return toastSafe('Disponibilité indisponible');t.click();setTimeout(updateAvailabilityButton,80)}
function openDriverMenu(){try{if(window.FASTTrackingMenu?.menu){window.FASTTrackingMenu.menu();return}}catch(e){}d('menuBtn')?.click()}
function extraButton(key,icon,label){const b=document.createElement('button');b.type='button';b.dataset.fastDriverNav=key;b.innerHTML=`<span>${icon}</span><small>${label}</small>`;return b}
function ensureDriverNav(){
  if(!isDriver())return;installCss();let nav=d('driverBottomNav');if(!nav){nav=document.createElement('nav');nav.id='driverBottomNav';nav.className='driver-bottom-nav';d('mainApp')?.appendChild(nav)}nav.classList.remove('hidden');
  let home=nav.querySelector('[data-driver-page="home"]');if(!home){home=document.createElement('button');home.type='button';home.dataset.driverPage='home';home.innerHTML='<span>⌂</span>Carte';home.dataset.fastOperationalClick='1';home.onclick=goDriverHome}
  let profileBtn=nav.querySelector('[data-driver-page="profile"]');if(!profileBtn){profileBtn=document.createElement('button');profileBtn.type='button';profileBtn.dataset.driverPage='profile';profileBtn.innerHTML='<span>◉</span>Profil';profileBtn.dataset.fastOperationalClick='1';profileBtn.onclick=goDriverProfile}
  let ride=nav.querySelector('[data-fast-driver-nav="ride"]');if(!ride){ride=extraButton('ride','🚕','Course');ride.onclick=openDriverRide}
  let avail=nav.querySelector('[data-fast-driver-nav="availability"]');if(!avail){avail=extraButton('availability','●','En ligne');avail.onclick=toggleAvailability}
  let menu=nav.querySelector('[data-fast-driver-nav="menu"]');if(!menu){menu=extraButton('menu','☰','Menu');menu.onclick=openDriverMenu}
  [home,ride,avail,profileBtn,menu].forEach(x=>nav.appendChild(x));updateAvailabilityButton();
}
function updateAvailabilityButton(){const b=d('driverBottomNav')?.querySelector('[data-fast-driver-nav="availability"]');if(!b)return;const active=!!currentRide(),online=!!d('driverToggleInput')?.checked;b.disabled=active;b.classList.toggle('fast-driver-live',active||online);b.innerHTML=active?'<span>●</span><small>En course</small>':online?'<span>●</span><small>En ligne</small>':'<span>○</span><small>Hors ligne</small>'}

function ensureCheckpoint(){
  let box=d('fastDriverCheckpoint');if(box)return box;
  box=document.createElement('div');box.id='fastDriverCheckpoint';box.className='fast-driver-checkpoint';box.innerHTML=`
    <div class="cp-top"><div><small id="fastDriverCpPhase">Prise en charge</small><b id="fastDriverCpTitle">Rejoignez le passager</b><span id="fastDriverCpSub">Confirmez chaque étape de la course.</span></div><div class="cp-badge" id="fastDriverCpBadge">FAST</div></div>
    <div class="cp-steps"><div class="cp-step" id="fastDriverCpPickup">1 • Prise en charge</div><div class="cp-step" id="fastDriverCpPin">2 • Code PIN</div><div class="cp-step" id="fastDriverCpDropoff">3 • Dépôt</div></div>
    <div id="fastDriverCpPinHost"></div>
    <button type="button" class="cp-action" id="fastDriverCpAction">Je suis arrivé</button>`;
  document.body.appendChild(box);d('fastDriverCpAction').onclick=handleCheckpointAction;return box;
}
function setStep(id,state){const n=d(id);if(!n)return;n.classList.toggle('done',state==='done');n.classList.toggle('active',state==='active')}
function movePinBox(show){
  const pin=d('fastDriverPinBox'),host=d('fastDriverCpPinHost');if(!pin||!host)return;
  if(show){if(pin.parentElement!==host)host.appendChild(pin);pin.classList.remove('hidden')}else pin.classList.add('hidden');
}
async function renderCheckpoint(status){
  const box=ensureCheckpoint(),action=d('fastDriverCpAction');if(!box||!action)return;
  const active=!!currentRide()&&!['completed','cancelled'].includes(status);box.classList.toggle('on',active);if(!active){movePinBox(false);return}
  action.disabled=transitionBusy;
  if(status==='accepted'){
    document.body.classList.remove('fast-driver-trip-active');movePinBox(false);setStep('fastDriverCpPickup','active');setStep('fastDriverCpPin','');setStep('fastDriverCpDropoff','');
    d('fastDriverCpPhase').textContent='Prise en charge';d('fastDriverCpTitle').textContent='Rejoignez le passager';d('fastDriverCpSub').textContent='Quand vous êtes au point de départ, confirmez votre arrivée.';d('fastDriverCpBadge').textContent='Étape 1/3';action.textContent='Confirmer mon arrivée';action.classList.remove('dark');
  }else if(status==='driver_arriving'){
    document.body.classList.remove('fast-driver-trip-active');movePinBox(true);setStep('fastDriverCpPickup','done');setStep('fastDriverCpPin','active');setStep('fastDriverCpDropoff','');
    const sec=await securityState(currentRide()),verified=!!sec?.pin_verified||pinVisibleVerified();d('fastDriverCpPhase').textContent='Code PIN';d('fastDriverCpTitle').textContent=verified?'Passager confirmé':'Validez le code du passager';d('fastDriverCpSub').textContent=verified?'Le code PIN est validé. Vous pouvez démarrer.':'Demandez les 4 chiffres affichés sur le téléphone du client.';d('fastDriverCpBadge').textContent='Étape 2/3';action.textContent=verified?'Démarrer la course':'PIN requis avant démarrage';action.disabled=transitionBusy||!verified;action.classList.remove('dark');
  }else if(status==='in_progress'){
    document.body.classList.add('fast-driver-trip-active');movePinBox(false);setStep('fastDriverCpPickup','done');setStep('fastDriverCpPin','done');setStep('fastDriverCpDropoff','active');
    d('fastDriverCpPhase').textContent='Vers la destination';d('fastDriverCpTitle').textContent='Course en cours';d('fastDriverCpSub').textContent='À l’arrivée, confirmez le dépôt du passager.';d('fastDriverCpBadge').textContent='Étape 3/3';action.textContent='Confirmer le dépôt et terminer';action.classList.add('dark');
  }
}

async function verifyTargetStatus(rideId,target){try{const snap=await directApi('/v1/rides/'+rideId);return snap?.ride?.status===target}catch(e){return false}}
async function transitionRideStatus(target){
  const rideId=currentRide();if(!rideId)return toastSafe('Aucune course active');if(transitionBusy)return;
  transitionBusy=true;const action=d('fastDriverCpAction');if(action)action.disabled=true;
  try{
    let snap=await directApi('/v1/rides/'+rideId),status=snap?.ride?.status||'';
    if(status===target){lastRideStatus=target;await renderCheckpoint(target);return}
    if(target==='in_progress'){
      const sec=await securityState(rideId),verified=!!sec?.pin_verified||pinVisibleVerified();if(!verified)throw new Error('Validez le code PIN avant de démarrer la course.');
      if(status==='accepted'){
        try{await directApi('/v1/rides/'+rideId+'/status',{method:'PATCH',body:JSON.stringify({status:'driver_arriving'})})}catch(e){if(!await verifyTargetStatus(rideId,'driver_arriving'))throw e}
        status='driver_arriving';
      }
    }
    if(target==='completed'&&status!=='in_progress')throw new Error('La course doit être démarrée avant de confirmer le dépôt.');
    try{await directApi('/v1/rides/'+rideId+'/status',{method:'PATCH',body:JSON.stringify({status:target})})}
    catch(e){if(!await verifyTargetStatus(rideId,target))throw e}
    if(!await verifyTargetStatus(rideId,target))throw new Error('FAST n’a pas confirmé le changement de statut. Réessayez.');
    lastRideStatus=target;
    if(target==='driver_arriving')toastSafe('Arrivée au point de prise en charge confirmée');
    if(target==='in_progress'){toastSafe('Course démarrée');try{if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}catch(e){}}
    if(target==='completed'){
      toastSafe('Dépôt confirmé • course terminée');const old=rideId;try{currentRideId=null}catch(e){};try{localStorage.removeItem('fast_pin_'+old)}catch(e){};document.body.classList.remove('fast-driver-trip-active');ensureCheckpoint().classList.remove('on');movePinBox(false);try{if(typeof loadHistory==='function')loadHistory()}catch(e){};if(d('driverToggleInput')?.checked)try{if(typeof startOfferPolling==='function')startOfferPolling()}catch(e){}
    }else await renderCheckpoint(target);
  }catch(e){toastSafe(e?.message||'Impossible de valider cette étape. Réessayez.')}finally{transitionBusy=false;if(action)action.disabled=false;updateAvailabilityButton()}
}
function handleCheckpointAction(){if(lastRideStatus==='accepted')return transitionRideStatus('driver_arriving');if(lastRideStatus==='driver_arriving')return transitionRideStatus('in_progress');if(lastRideStatus==='in_progress')return transitionRideStatus('completed')}

function patchLegacyButtons(){
  const a=d('arrivingBtn'),s=d('startRideBtn'),c=d('completeRideBtn');if(a)a.onclick=()=>transitionRideStatus('driver_arriving');if(s)s.onclick=()=>transitionRideStatus('in_progress');if(c)c.onclick=()=>transitionRideStatus('completed');
  try{setRideStatus=transitionRideStatus}catch(e){window.setRideStatus=transitionRideStatus}
}
function hookNavigation(){
  if(window.__fastDriverNavigationHookedV2)return;const base=window.updateDriverOnMap;if(typeof base!=='function')return;window.__fastDriverNavigationHookedV2=true;
  window.updateDriverOnMap=function(nav){base(nav);if(!nav?.active)return;const active=nav.phase==='to_destination';document.body.classList.toggle('fast-driver-trip-active',active&&isDriver())};
}

async function syncRideStatus(){
  if(!isDriver()){ensureCheckpoint()?.classList.remove('on');document.body.classList.remove('fast-driver-trip-active');return}
  ensureDriverNav();ensureCheckpoint();patchLegacyButtons();hookNavigation();const ride=currentRide();if(!ride){lastRideStatus='';ensureCheckpoint().classList.remove('on');document.body.classList.remove('fast-driver-trip-active');return}
  try{const snap=await directApi('/v1/rides/'+ride),status=snap?.ride?.status||'';lastRideStatus=status;if(status==='in_progress'){try{if(typeof refreshDriverNavigation==='function')refreshDriverNavigation()}catch(e){}}await renderCheckpoint(status)}catch(e){}
}
function boot(){installCss();ensureCheckpoint();ensureDriverNav();patchLegacyButtons();hookNavigation();d('driverToggleInput')?.addEventListener('change',updateAvailabilityButton);clearInterval(statusTimer);statusTimer=setInterval(syncRideStatus,1800);syncRideStatus()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,220));else setTimeout(boot,220);
window.addEventListener('load',()=>setTimeout(boot,900));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncRideStatus()});window.addEventListener('fast:ride-restored',()=>setTimeout(syncRideStatus,120));
})();