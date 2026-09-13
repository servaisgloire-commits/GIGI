(()=>{
'use strict';
const fx=id=>document.getElementById(id);
let seenRideId=null;
let transitionBusy=false;
let cancelBusy=false;
let offerBusy=false;
let mapRepairTimer=null;
let repairQueued=false;

function isDriver(){try{return typeof role!=='undefined'&&role==='driver'}catch(e){return false}}
function rideId(){try{return typeof currentRideId!=='undefined'?currentRideId:null}catch(e){return null}}
function authToken(){try{return (typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||''}catch(e){return ''}}
function notify(message){try{if(typeof toast==='function')toast(message)}catch(e){}}

function installCss(){
  if(fx('fast-driver-critical-style'))return;
  const s=document.createElement('style');
  s.id='fast-driver-critical-style';
  s.textContent=`
    body.driver-mode #driverGpsMapHost{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;min-height:420px!important;background:#e9eff6!important;overflow:hidden!important}
    body.driver-mode #driverGpsMapHost #sharedMapWrap{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;inset:auto!important;width:100%!important;height:100%!important;min-height:420px!important;margin:0!important;z-index:1!important}
    body.driver-mode #driverGpsMapHost #map{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:100%!important;min-height:420px!important}
    body.driver-mode.fast-driver-trip-active #driverGpsMapHost,body.driver-mode.fast-driver-trip-active #driverGpsMapHost #sharedMapWrap,body.driver-mode.fast-driver-trip-active #driverGpsMapHost #map{min-height:0!important}
  `;
  document.head.appendChild(s);
}

function ensureDriverMap(){
  if(!isDriver())return;
  installCss();
  document.body.classList.add('driver-mode');
  document.body.classList.remove('client-mode','fast-passenger-waiting-driver','fast-client-searching','fast-client-active-ride');
  const host=fx('driverGpsMapHost'),wrap=fx('sharedMapWrap');
  if(!host||!wrap)return;
  if(wrap.parentElement!==host)host.appendChild(wrap);
  host.classList.remove('hidden');wrap.classList.remove('hidden');fx('map')?.classList.remove('hidden');
  try{if((typeof map==='undefined'||!map)&&typeof initMap==='function')initMap()}catch(e){console.warn('FAST driver map init',e)}
  try{const st=window.FASTGoogleMaps?.status?.();if(st&&!st.ready&&!st.loading&&navigator.onLine)window.FASTGoogleMaps?.retry?.()}catch(e){}
  [50,220,650].forEach(ms=>setTimeout(()=>{try{if(typeof map!=='undefined'&&map)map.resize()}catch(e){}},ms));
}

async function fetchJson(path,opts={},timeout=7000){
  const t=authToken();if(!t)throw new Error('Session chauffeur expirée. Reconnectez-vous.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const headers={...(opts.headers||{}),'Content-Type':'application/json',Authorization:'Bearer '+t};
    const r=await fetch(API+path,{...opts,headers,signal:opts.signal||controller.signal});
    let data={};try{data=await r.json()}catch(e){}
    if(!r.ok){const err=new Error(data.detail||data.message||data.error||`HTTP ${r.status}`);err.status=r.status;throw err}
    return data;
  }catch(e){if(e?.name==='AbortError')throw new Error('FAST met trop de temps à répondre. Réessayez.');throw e}
  finally{clearTimeout(timer)}
}

async function rpc(name,body,timeout=6500){
  const t=authToken();if(!t)throw new Error('Session chauffeur expirée. Reconnectez-vous.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify(body||{}),signal:controller.signal});
    let data={};try{data=await r.json()}catch(e){}
    if(!r.ok)throw new Error(data.message||data.error||data.hint||`HTTP ${r.status}`);
    return Array.isArray(data)?data[0]:data;
  }catch(e){if(e?.name==='AbortError')throw new Error('Vérification trop lente. Réessayez.');throw e}
  finally{clearTimeout(timer)}
}

function resetPinUi(force=false){
  const id=rideId();if(!force&&id===seenRideId)return;seenRideId=id;
  const input=fx('fastDriverPin'),btn=fx('fastVerifyPin'),ok=fx('fastPinVerified');
  if(input){input.value='';input.disabled=false}
  if(btn){btn.disabled=false;btn.textContent='Vérifier'}
  ok?.classList.add('hidden');
}

async function verifyPinFast(){
  const id=rideId();if(!id)return notify('Aucune course active');
  const input=fx('fastDriverPin'),btn=fx('fastVerifyPin');
  const pin=String(input?.value||'').replace(/\D/g,'').slice(0,4);
  if(pin.length!==4)return notify('Entrez les 4 chiffres du PIN');
  if(btn){btn.disabled=true;btn.textContent='Vérification…'}
  try{
    const result=await rpc('verify_ride_pin',{p_ride_id:id,p_pin:pin});
    if(!result?.verified){const left=Number(result?.remaining_attempts);notify(Number.isFinite(left)?`Code PIN incorrect • ${left} essai(s) restant(s)`:'Code PIN incorrect');if(btn){btn.disabled=false;btn.textContent='Vérifier'}return}
    fx('fastPinVerified')?.classList.remove('hidden');if(input)input.disabled=true;if(btn){btn.disabled=true;btn.textContent='PIN vérifié ✓'}
    const action=fx('fastDriverCpAction');if(action&&/PIN requis|Démarrer/i.test(action.textContent||'')){action.disabled=false;action.textContent='Démarrer la course'}
    notify('PIN vérifié ✓');
  }catch(e){
    const m=String(e?.message||'');
    if(/pin_temporarily_locked/i.test(m))notify('Trop d’essais PIN. Réessayez plus tard.');
    else if(/pin_not_issued/i.test(m))notify('Le code PIN du client n’est pas encore prêt.');
    else notify(/Failed to fetch|NetworkError|Load failed/i.test(m)?'FAST n’a pas reçu la vérification. Réessayez.':m);
    if(btn){btn.disabled=false;btn.textContent='Vérifier'}
  }
}

function bindPinButton(){resetPinUi();const btn=fx('fastVerifyPin');if(btn&&!btn.dataset.fastCriticalPin){btn.dataset.fastCriticalPin='1';btn.onclick=verifyPinFast}}
async function statusIs(id,target){try{return (await fetchJson('/v1/rides/'+id,{},4500))?.ride?.status===target}catch(e){return false}}

async function recoverAcceptedRide(){
  try{
    const h=await fetchJson('/v1/rides/history',{},4500),items=h?.items||[];
    return items.find(r=>['accepted','driver_arriving','in_progress'].includes(String(r?.status||'')))||null;
  }catch(e){return null}
}

async function respondOfferFast(accept,button){
  if(offerBusy)return;
  const id=button?.dataset?.id;if(!id)return;
  offerBusy=true;const old=button.textContent||'';button.disabled=true;button.textContent=accept?'Acceptation…':'Refus…';
  try{
    let data=null;
    try{data=await fetchJson('/v1/driver/offers/'+id+'/respond',{method:'POST',body:JSON.stringify({accept})},7000)}
    catch(e){
      if(!accept)throw e;
      const active=await recoverAcceptedRide();
      if(!active)throw e;
      data={ride_id:active.id,recovered:true};
    }
    fx('offerCard')?.classList.add('hidden');
    if(accept){
      const acceptedId=data?.ride_id;if(!acceptedId)throw new Error('FAST n’a pas retourné la course acceptée.');
      try{currentRideId=acceptedId}catch(e){}
      seenRideId=null;resetPinUi(true);
      fx('driverTrip')?.classList.remove('hidden');
      if(fx('driverRoadPhase'))fx('driverRoadPhase').textContent='Vers le passager';
      if(fx('driverInstruction'))fx('driverInstruction').textContent='Calcul du meilleur itinéraire…';
      try{if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}catch(e){}
      ensureDriverMap();notify('Course acceptée');
    }else notify('Course refusée');
  }catch(e){
    const m=String(e?.message||'');notify(/Failed to fetch|NetworkError|Load failed|trop de temps/i.test(m)?'FAST n’a pas confirmé cette réponse. Réessayez.':m);
    button.disabled=false;button.textContent=old;
  }finally{offerBusy=false}
}

function cleanupEndedRide(id,message,kind='cancelled'){
  try{if(typeof currentRideId!=='undefined'&&currentRideId===id)currentRideId=null}catch(e){}
  try{localStorage.removeItem('fast_pin_'+id)}catch(e){}
  seenRideId=null;resetPinUi(true);document.body.classList.remove('fast-driver-trip-active');fx('driverTrip')?.classList.add('hidden');fx('fastDriverCheckpoint')?.classList.remove('on');fx('driverCancelSheet')?.remove();
  try{if(typeof stopDriverNavigationPolling==='function')stopDriverNavigationPolling()}catch(e){}
  try{window.dispatchEvent(new CustomEvent(kind==='completed'?'fast:ride-completed':'fast:ride-cancelled',{detail:{rideId:id,source:'driver'}}))}catch(e){}
  setTimeout(()=>{try{if(fx('driverToggleInput')?.checked&&typeof startOfferPolling==='function')startOfferPolling()}catch(e){}},120);if(message)notify(message);
}

async function cancelRideFast(){
  const id=rideId();if(!id||cancelBusy)return;cancelBusy=true;const btn=fx('driverCancelConfirm');if(btn){btn.disabled=true;btn.textContent='Annulation…'}let ok=false;
  try{await fetchJson('/v1/rides/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:'cancelled'})},7000);ok=true}
  catch(e){ok=await statusIs(id,'cancelled');if(!ok){const m=String(e?.message||'');notify(/Failed to fetch|NetworkError|Load failed|trop de temps/i.test(m)?'FAST n’a pas confirmé l’annulation. Réessayez.':m)}}
  if(ok)cleanupEndedRide(id,'Course annulée','cancelled');else if(btn){btn.disabled=false;btn.textContent='Annuler la course'}cancelBusy=false;
}

function targetFromAction(button){const text=String(button?.textContent||'').toLowerCase();if(text.includes('arriv'))return 'driver_arriving';if(text.includes('démarrer')||text.includes('demarrer'))return 'in_progress';if(text.includes('dépôt')||text.includes('depot')||text.includes('termin'))return 'completed';return null}

async function fastTransition(target,button){
  const id=rideId();if(!id||transitionBusy||!target)return;transitionBusy=true;const old=button?.textContent||'';if(button){button.disabled=true;button.textContent='Confirmation…'}
  try{
    if(target==='in_progress'){
      let verified=!fx('fastPinVerified')?.classList.contains('hidden');
      if(!verified){try{verified=!!(await rpc('get_ride_security_state',{p_ride_id:id},4500))?.pin_verified}catch(e){}}
      if(!verified)throw new Error('Vérifiez le code PIN avant de démarrer.');
    }
    try{await fetchJson('/v1/rides/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:target})},7000)}catch(e){if(!await statusIs(id,target))throw e}
    if(target==='driver_arriving'){if(button){button.textContent='PIN requis avant démarrage';button.disabled=true}notify('Arrivée confirmée')}
    else if(target==='in_progress'){if(button){button.textContent='Course démarrée';button.disabled=true}document.body.classList.add('fast-driver-trip-active');ensureDriverMap();notify('Course démarrée')}
    else if(target==='completed')cleanupEndedRide(id,'Course terminée','completed');
  }catch(e){const m=String(e?.message||'');notify(/Failed to fetch|NetworkError|Load failed/i.test(m)?'FAST n’a pas reçu la confirmation. Réessayez.':m);if(button){button.disabled=false;button.textContent=old}}
  finally{transitionBusy=false}
}

function captureCriticalActions(e){
  const offer=e.target.closest?.('#acceptOffer,#rejectOffer');
  if(offer&&isDriver()){e.preventDefault();e.stopImmediatePropagation();respondOfferFast(offer.id==='acceptOffer',offer);return}
  const cancel=e.target.closest?.('#driverCancelConfirm');
  if(cancel){e.preventDefault();e.stopImmediatePropagation();cancelRideFast();return}
  const action=e.target.closest?.('#fastDriverCpAction');
  if(action&&isDriver()){const target=targetFromAction(action);if(!target)return;e.preventDefault();e.stopImmediatePropagation();fastTransition(target,action)}
}

function repair(){if(!isDriver())return;ensureDriverMap();bindPinButton()}
function scheduleRepair(delay=100){if(repairQueued)return;repairQueued=true;setTimeout(()=>{repairQueued=false;repair()},delay)}
function boot(){installCss();document.addEventListener('click',captureCriticalActions,true);const observer=new MutationObserver(()=>{if(isDriver())scheduleRepair(120)});observer.observe(document.documentElement,{subtree:true,childList:true});clearInterval(mapRepairTimer);mapRepairTimer=setInterval(repair,3500);repair()}

window.addEventListener('fast:ride-restored',()=>{seenRideId=null;scheduleRepair(60)});
window.addEventListener('online',()=>scheduleRepair(60));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleRepair(60)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,350),{once:true});else setTimeout(boot,350);
})();
