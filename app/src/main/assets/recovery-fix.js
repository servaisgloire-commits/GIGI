(()=>{
'use strict';
const q=id=>document.getElementById(id);
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
const PRESTART_STATUSES=new Set(['accepted','driver_arriving']);
const TERMINAL_STATUSES=new Set(['completed','cancelled']);
const STALE_PRESTART_MS=45*60*1000;
const STALE_DRIVER_GPS_MS=15*60*1000;
let lockedUntil=0;
let rideRecoveryBusy=false;
let rideRecoveryTimer=null;

async function recoverPasswordFast(){
  const email=q('loginEmail')?.value.trim()||'';
  const btn=q('forgotBtn');
  if(!emailOk(email))return toast('Entrez votre e-mail de connexion');
  const now=Date.now();
  if(now<lockedUntil){
    const seconds=Math.max(1,Math.ceil((lockedUntil-now)/1000));
    return toast(`Un lien vient déjà d’être demandé. Réessayez dans ${seconds} s.`);
  }
  if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='Envoi…'}
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    let r,d={};
    try{
      r=await fetch(SUPABASE_URL+'/functions/v1/auth-email-memory',{
        method:'POST',
        headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({email,type:'recovery'}),
        signal:controller.signal
      });
      try{d=await r.json()}catch(e){}
    }finally{clearTimeout(timer)}
    if(!r.ok)throw new Error(d.message||d.error||('HTTP '+r.status));
    const retry=Math.max(20,Number(d.retry_after_seconds||120));
    lockedUntil=Date.now()+retry*1000;
    toast(d.message||(d.ok?'E-mail de réinitialisation envoyé. Vérifiez aussi les spams.':'Patientez avant un nouvel essai.'));
  }catch(e){
    lockedUntil=Date.now()+5000;
    const m=String(e?.message||e||'Erreur');
    if(/rate limit|429|security purposes/i.test(m))toast('Un e-mail a déjà été demandé récemment. Patientez quelques minutes.');
    else if(/Failed to fetch|NetworkError|timeout|AbortError|Délai/i.test(m))toast('Connexion internet instable. Réessayez dans quelques secondes.');
    else toast(m);
  }finally{
    if(btn){btn.disabled=false;if(btn.dataset.oldText){btn.textContent=btn.dataset.oldText;delete btn.dataset.oldText}}
  }
}

function parseAgeMs(value){
  const ms=Date.parse(String(value||''));
  return Number.isFinite(ms)?Math.max(0,Date.now()-ms):Infinity;
}

function isStalePreStartRide(snapshot){
  const ride=snapshot?.ride;
  if(!ride||!PRESTART_STATUSES.has(String(ride.status||''))||ride.started_at)return false;
  const rideAge=parseAgeMs(ride.accepted_at||ride.requested_at||ride.created_at);
  if(rideAge<STALE_PRESTART_MS)return false;
  const gpsAge=parseAgeMs(snapshot?.driver_location?.updated_at);
  return gpsAge>STALE_DRIVER_GPS_MS;
}

function localRideId(){
  try{
    if(typeof currentRideId!=='undefined'&&currentRideId)return currentRideId;
    return localStorage.getItem('fast_client_active_ride')||null;
  }catch(e){return null}
}

function clearRideReference(id,reason='stale'){
  if(!id)return;
  try{if(localStorage.getItem('fast_client_active_ride')===id)localStorage.removeItem('fast_client_active_ride')}catch(e){}
  try{localStorage.removeItem('fast_pin_'+id)}catch(e){}
  try{window.dispatchEvent(new CustomEvent('fast:ride-cancelled',{detail:{rideId:id,reason}}))}catch(e){}
  try{if(typeof currentRideId!=='undefined'&&currentRideId===id)currentRideId=null}catch(e){}
  q('bookingState')?.classList.add('hidden');
  q('ridePanel')?.classList.add('hidden');
  q('crSearchState')?.classList.add('hidden');
  q('crRideCard')?.classList.add('hidden');
  q('driverTrip')?.classList.add('hidden');
}

async function rideSnapshot(id){
  if(!id||typeof api!=='function')return null;
  try{return await api('/v1/rides/'+encodeURIComponent(id))}catch(e){return null}
}

async function cancelStaleRide(snapshot){
  const ride=snapshot?.ride,id=ride?.id;
  if(!id||!isStalePreStartRide(snapshot))return false;
  try{
    await api('/v1/rides/'+encodeURIComponent(id)+'/status',{method:'PATCH',body:JSON.stringify({status:'cancelled'})});
    clearRideReference(id,'stale_pre_start');
    try{toast('Ancienne course fermée. Vous pouvez commander un nouveau FAST.')}catch(e){}
    return true;
  }catch(e){
    console.warn('FAST stale ride cleanup failed',e);
    return false;
  }
}

async function recoverStaleRide(){
  if(rideRecoveryBusy||typeof api!=='function')return;
  const hasToken=(()=>{try{return !!(typeof token!=='undefined'&&token)}catch(e){return false}})();
  const currentRole=(()=>{try{return typeof role!=='undefined'?role:null}catch(e){return null}})();
  if(!hasToken||!['client','driver'].includes(currentRole))return;
  rideRecoveryBusy=true;
  try{
    const id=localRideId();
    if(id){
      const snap=await rideSnapshot(id);
      const status=String(snap?.ride?.status||'');
      if(TERMINAL_STATUSES.has(status)){
        clearRideReference(id,'terminal_server_state');
        return;
      }
      if(await cancelStaleRide(snap))return;
    }

    let history=[];
    try{history=(await api('/v1/rides/history'))?.items||[]}catch(e){return}
    for(const ride of history.slice(0,12)){
      if(!PRESTART_STATUSES.has(String(ride?.status||''))||ride?.started_at)continue;
      const snap=await rideSnapshot(ride.id);
      if(await cancelStaleRide(snap))return;
    }
  }finally{rideRecoveryBusy=false}
}

function scheduleRideRecovery(delay=0){
  clearTimeout(rideRecoveryTimer);
  rideRecoveryTimer=setTimeout(()=>recoverStaleRide(),Math.max(0,delay));
}

function bind(){
  window.forgotPassword=recoverPasswordFast;
  window.FASTRecoverStaleRide=recoverStaleRide;
  const btn=q('forgotBtn');
  if(btn)btn.onclick=recoverPasswordFast;
}

bind();
setTimeout(bind,300);
setTimeout(bind,900);
setTimeout(bind,2200);
window.addEventListener('online',()=>scheduleRideRecovery(150));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleRideRecovery(120)});
setInterval(()=>scheduleRideRecovery(0),60000);
if(document.readyState==='loading')window.addEventListener('load',()=>{bind();scheduleRideRecovery(60);setTimeout(()=>scheduleRideRecovery(0),1200)},{once:true});
else scheduleRideRecovery(60);
})();
