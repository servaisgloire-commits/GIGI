(()=>{
'use strict';
const SEARCHING='searching';
const PENDING_KEY='fast_search_close_pending';
let lastStatus=null;
let lastRideId=null;
let monitorTimer=null;
let closeSentFor=null;
let flushBusy=false;

function isClient(){try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}}
function rideId(){try{return typeof currentRideId!=='undefined'&&currentRideId?currentRideId:null}catch(e){return null}}
function authToken(){try{return (typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||''}catch(e){return ''}}
function setPending(id){try{if(id)localStorage.setItem(PENDING_KEY,id)}catch(e){}}
function pendingRide(){try{return localStorage.getItem(PENDING_KEY)||null}catch(e){return null}}
function clearPending(id=null){try{if(!id||localStorage.getItem(PENDING_KEY)===id)localStorage.removeItem(PENDING_KEY)}catch(e){}}

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

async function fallbackServerCheckedCancel(id){
  const t=authToken();if(!t)return 'retry';
  try{
    const r=await fetch(`${API}/v1/rides/${encodeURIComponent(id)}/status`,{
      method:'PATCH',keepalive:true,
      headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},
      body:JSON.stringify({status:'cancelled',expected_current_status:SEARCHING,cancellation_reason:'client_app_closed',cancellation_note:'Recherche annulée automatiquement à la fermeture de l’application'})
    });
    if(r.status===409||r.status===404)return 'stale';
    return r.ok?'cancelled':'retry';
  }catch(e){return 'retry'}
}

async function flushPendingClose(){
  if(flushBusy||!isClient())return false;
  const id=pendingRide();if(!id)return false;
  flushBusy=true;
  try{
    const result=await fallbackServerCheckedCancel(id);
    if(result==='cancelled'||result==='stale'){
      clearPending(id);
      if(result==='cancelled'){
        try{if(localStorage.getItem('fast_client_active_ride')===id)localStorage.removeItem('fast_client_active_ride')}catch(e){}
        try{if(typeof currentRideId!=='undefined'&&currentRideId===id)currentRideId=null}catch(e){}
        try{window.dispatchEvent(new CustomEvent('fast:ride-cancelled',{detail:{rideId:id,reason:'client_app_closed_recovered'}}))}catch(e){}
      }
      return true;
    }
    return false;
  }finally{flushBusy=false}
}

function closeNow(){
  if(!isClient())return false;
  const id=rideId()||(()=>{try{return localStorage.getItem('fast_client_active_ride')}catch(e){return null}})();
  if(!id||closeSentFor===id)return false;
  closeSentFor=id;
  setPending(id);
  try{
    if(window.FASTNative?.cancelSearchingRideOnClose){
      window.FASTNative.cancelSearchingRideOnClose(id);
      return true;
    }
  }catch(e){}
  fallbackServerCheckedCancel(id).then(result=>{if(result==='cancelled'||result==='stale')clearPending(id)}).catch(()=>{});
  return true;
}

function clearStatus(){lastRideId=null;lastStatus=null;closeSentFor=null;try{localStorage.removeItem('fast_client_active_status')}catch(e){}}
function startMonitor(){
  clearInterval(monitorTimer);
  monitorTimer=setInterval(()=>{if(isClient()&&rideId())refreshStatus();else if(!rideId())clearStatus()},1800);
  setTimeout(()=>{flushPendingClose();refreshStatus()},250);
}

window.FASTAppCloseGuard={closeNow,refreshStatus,flushPendingClose,status:()=>({rideId:lastRideId,status:lastStatus,closeSentFor,pending:pendingRide(),flushBusy})};
window.addEventListener('fast:ride-restored',()=>{closeSentFor=null;setTimeout(()=>{flushPendingClose();refreshStatus()},80)});
window.addEventListener('fast:ride-cancelled',e=>{clearPending(e?.detail?.rideId||null);clearStatus()});
window.addEventListener('fast:ride-completed',e=>{clearPending(e?.detail?.rideId||null);clearStatus()});
window.addEventListener('online',()=>{closeSentFor=null;flushPendingClose()});
window.addEventListener('pagehide',closeNow);
window.addEventListener('beforeunload',closeNow);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')closeNow();else{closeSentFor=null;flushPendingClose();refreshStatus()}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startMonitor,{once:true});else startMonitor();
})();
