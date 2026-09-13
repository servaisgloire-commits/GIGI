(()=>{
'use strict';
const q=id=>document.getElementById(id);
let syncBusy=false;
let lastRideId=null;
let lastVerified=null;
let syncTimer=null;

function isDriver(){try{return typeof role!=='undefined'&&role==='driver'}catch(e){return false}}
function activeRideId(){try{return typeof currentRideId!=='undefined'&&currentRideId?currentRideId:null}catch(e){return null}}
function authToken(){try{return (typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||''}catch(e){return ''}}

async function rpcSecurity(id,timeout=5000){
  const t=authToken();if(!t)throw new Error('missing_session');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_ride_security_state`,{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${t}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_ride_id:id}),
      signal:controller.signal
    });
    let data={};try{data=await r.json()}catch(e){}
    if(!r.ok)throw new Error(data.message||data.error||data.hint||`HTTP ${r.status}`);
    return Array.isArray(data)?(data[0]||{}):(data||{});
  }finally{clearTimeout(timer)}
}

async function rideSnapshot(id,timeout=5000){
  const t=authToken();if(!t)throw new Error('missing_session');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(`${API}/v1/rides/${encodeURIComponent(id)}`,{
      headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},
      signal:controller.signal
    });
    let data={};try{data=await r.json()}catch(e){}
    if(!r.ok)throw new Error(data.detail||data.message||data.error||`HTTP ${r.status}`);
    return data;
  }finally{clearTimeout(timer)}
}

function applyPinState(verified,status){
  const input=q('fastDriverPin'),verifyBtn=q('fastVerifyPin'),ok=q('fastPinVerified'),action=q('fastDriverCpAction');
  if(verified){
    if(input){input.value='';input.disabled=true}
    if(verifyBtn){verifyBtn.disabled=true;verifyBtn.textContent='PIN vérifié ✓'}
    ok?.classList.remove('hidden');
    if(status==='driver_arriving'&&action){action.disabled=false;action.textContent='Démarrer la course'}
    if(status==='in_progress')document.body.classList.add('fast-driver-trip-active');
  }else{
    if(input)input.disabled=false;
    if(verifyBtn){verifyBtn.disabled=false;if(/PIN vérifié/i.test(verifyBtn.textContent||''))verifyBtn.textContent='Vérifier'}
    ok?.classList.add('hidden');
    if(status==='driver_arriving'&&action){action.disabled=true;action.textContent='PIN requis avant démarrage'}
  }
}

async function syncRestartState(force=false,statusHint=null){
  if(!isDriver()||syncBusy)return false;
  const id=activeRideId();if(!id)return false;
  if(!force&&lastRideId===id&&lastVerified===true)return true;
  syncBusy=true;
  try{
    const [security,snapshot]=await Promise.all([
      rpcSecurity(id),
      rideSnapshot(id).catch(()=>null)
    ]);
    const status=String(snapshot?.ride?.status||statusHint||'');
    const verified=!!security?.pin_verified;
    if(id!==activeRideId())return false;
    lastRideId=id;lastVerified=verified;
    applyPinState(verified,status);
    window.dispatchEvent(new CustomEvent('fast:restart-state-synced',{detail:{rideId:id,status,pinVerified:verified}}));
    return verified;
  }catch(e){
    console.warn('FAST restart state sync',e);
    return false;
  }finally{syncBusy=false}
}

function scheduleSync(delay=90,force=true,statusHint=null){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>syncRestartState(force,statusHint),Math.max(0,delay));
}

window.FASTRestartRecovery={sync:()=>syncRestartState(true),status:()=>({rideId:lastRideId,pinVerified:lastVerified,busy:syncBusy})};
window.addEventListener('fast:ride-restored',e=>{
  lastRideId=null;lastVerified=null;
  const status=e?.detail?.ride?.status||null;
  scheduleSync(110,true,status);
  setTimeout(()=>syncRestartState(true,status),480);
  setTimeout(()=>syncRestartState(true,status),1200);
});
window.addEventListener('online',()=>scheduleSync(120,true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleSync(120,true)});
window.addEventListener('fast:ride-completed',()=>{lastRideId=null;lastVerified=null});
window.addEventListener('fast:ride-cancelled',()=>{lastRideId=null;lastVerified=null});

function boot(){if(isDriver()&&activeRideId())scheduleSync(120,true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
setInterval(()=>{if(isDriver()&&activeRideId())syncRestartState(false)},15000);
})();
