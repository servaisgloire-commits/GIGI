(()=>{
'use strict';
const SEARCHING='searching';
let lastStatus=null;
let lastRideId=null;
let monitorTimer=null;
let closeSentFor=null;

function isClient(){try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}}
function rideId(){try{return typeof currentRideId!=='undefined'&&currentRideId?currentRideId:null}catch(e){return null}}
function authToken(){try{return (typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||''}catch(e){return ''}}

async function refreshStatus(){
  if(!isClient())return null;
  const id=rideId();if(!id){lastRideId=null;lastStatus=null;return null}
  const t=authToken();if(!t)return null;
  try{
    const r=await fetch(`${API}/v1/rides/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},cache:'no-store'});
    let d={};try{d=await r.json()}catch(e){}
    if(!r.ok)return null;
    lastRideId=id;lastStatus=String(d?.ride?.status||'');
    try{localStorage.setItem('fast_client_active_status',lastStatus)}catch(e){}
    return lastStatus;
  }catch(e){return null}
}

function locallySearching(id){
  if(!id)return false;
  if(lastRideId===id&&lastStatus===SEARCHING)return true;
  try{return localStorage.getItem('fast_client_active_status')===SEARCHING&&localStorage.getItem('fast_client_active_ride')===id}catch(e){return false}
}

function closeNow(){
  if(!isClient())return false;
  const id=rideId()||(()=>{try{return localStorage.getItem('fast_client_active_ride')}catch(e){return null}})();
  if(!id||!locallySearching(id)||closeSentFor===id)return false;
  closeSentFor=id;
  try{
    if(window.FASTNative?.cancelSearchingRideOnClose){
      window.FASTNative.cancelSearchingRideOnClose(id);
      return true;
    }
  }catch(e){}
  try{
    const t=authToken();if(!t)return false;
    fetch(`${API}/v1/rides/${encodeURIComponent(id)}/status`,{
      method:'PATCH',keepalive:true,
      headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},
      body:JSON.stringify({status:'cancelled',cancellation_reason:'client_app_closed',cancellation_note:'Recherche annulée automatiquement à la fermeture de l’application'})
    }).catch(()=>{});
    return true;
  }catch(e){return false}
}

function clearStatus(){lastRideId=null;lastStatus=null;closeSentFor=null;try{localStorage.removeItem('fast_client_active_status')}catch(e){}}
function startMonitor(){clearInterval(monitorTimer);monitorTimer=setInterval(()=>{if(isClient()&&rideId())refreshStatus();else if(!rideId())clearStatus()},1800);setTimeout(refreshStatus,250)}

window.FASTAppCloseGuard={closeNow,refreshStatus,status:()=>({rideId:lastRideId,status:lastStatus,closeSentFor})};
window.addEventListener('fast:ride-restored',()=>{closeSentFor=null;setTimeout(refreshStatus,80)});
window.addEventListener('fast:ride-cancelled',clearStatus);
window.addEventListener('fast:ride-completed',clearStatus);
window.addEventListener('pagehide',closeNow);
window.addEventListener('beforeunload',closeNow);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')closeNow();else{closeSentFor=null;refreshStatus()}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startMonitor,{once:true});else startMonitor();
})();
