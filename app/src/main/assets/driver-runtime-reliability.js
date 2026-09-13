(()=>{
'use strict';
const byId=id=>document.getElementById(id);
let pinBusy=false;
let repairTimer=null;
let observer=null;

function isDriver(){
  try{return typeof role!=='undefined'&&role==='driver'}catch(e){return false}
}
function activeRideId(){
  try{return typeof currentRideId!=='undefined'?currentRideId:null}catch(e){return null}
}
function authToken(){
  try{return (typeof token!=='undefined'&&token)||localStorage.getItem('fast_access_token')||''}catch(e){return ''}
}
function notify(message){
  try{if(typeof toast==='function')toast(message)}catch(e){}
}
function installDriverMapCss(){
  if(byId('fast-driver-runtime-reliability-style'))return;
  const style=document.createElement('style');
  style.id='fast-driver-runtime-reliability-style';
  style.textContent=`
    #driverArea:not(.hidden) #driverGpsMapHost{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;width:100%!important;height:56vh!important;min-height:420px!important;background:#e9eff6!important;overflow:hidden!important}
    #driverArea:not(.hidden) #driverGpsMapHost #sharedMapWrap{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;inset:auto!important;width:100%!important;height:100%!important;min-height:420px!important;margin:0!important;z-index:1!important}
    #driverArea:not(.hidden) #driverGpsMapHost #map{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:100%!important;min-height:420px!important}
    #driverArea:not(.hidden) #driverGpsMapHost .map-engine{display:block!important;z-index:5!important}
    #driverArea:not(.hidden) #driverGpsMapHost .floating-locate{display:flex!important;z-index:6!important}
  `;
  document.head.appendChild(style);
}
function ensureDriverMap(){
  if(!isDriver())return false;
  installDriverMapCss();
  document.body.classList.add('driver-mode');
  document.body.classList.remove('client-mode');
  const driverArea=byId('driverArea');
  const passengerArea=byId('passengerArea');
  const host=byId('driverGpsMapHost');
  const wrap=byId('sharedMapWrap');
  const mapNode=byId('map');
  if(driverArea)driverArea.classList.remove('hidden');
  if(passengerArea)passengerArea.classList.add('hidden');
  if(!host||!wrap||!mapNode)return false;
  host.classList.remove('hidden');
  wrap.classList.remove('hidden');
  mapNode.classList.remove('hidden');
  if(wrap.parentElement!==host)host.appendChild(wrap);
  try{
    if((typeof map==='undefined'||!map)&&typeof initMap==='function')initMap();
  }catch(e){console.warn('FAST driver map init failed',e)}
  [0,80,250,700].forEach(delay=>setTimeout(()=>{
    try{if(typeof map!=='undefined'&&map&&typeof map.resize==='function')map.resize()}catch(e){}
  },delay));
  try{
    const status=window.FASTGoogleMaps?.status?.();
    if(status&&!status.ready&&!status.loading&&navigator.onLine)window.FASTGoogleMaps?.retry?.();
  }catch(e){}
  return true;
}
async function rpc(name,body,timeout=6000){
  const t=authToken();
  if(!t)throw new Error('Session chauffeur expirée. Reconnectez-vous.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${t}`,'Content-Type':'application/json'},
      body:JSON.stringify(body||{}),
      signal:controller.signal
    });
    let data={};
    try{data=await response.json()}catch(e){}
    if(!response.ok)throw new Error(data.message||data.error||data.hint||`HTTP ${response.status}`);
    return Array.isArray(data)?data[0]:data;
  }finally{clearTimeout(timer)}
}
async function readPinState(id){
  try{return await rpc('get_ride_security_state',{p_ride_id:id},4200)}catch(e){return null}
}
function markPinVerified(){
  const input=byId('fastDriverPin');
  const button=byId('fastVerifyPin');
  const ok=byId('fastPinVerified');
  if(input)input.disabled=true;
  if(button){button.disabled=true;button.textContent='PIN vérifié ✓'}
  ok?.classList.remove('hidden');
  const cp=byId('fastDriverCpAction');
  if(cp){cp.disabled=false;if(/PIN requis|Démarrer|Demarrer/i.test(cp.textContent||''))cp.textContent='Démarrer la course'}
  const start=byId('startRideBtn');
  if(start)start.disabled=false;
  notify('PIN vérifié ✓');
}
async function verifyPinReliable(){
  if(pinBusy)return;
  const id=activeRideId();
  if(!id)return notify('Aucune course active');
  const input=byId('fastDriverPin');
  const button=byId('fastVerifyPin');
  const pin=String(input?.value||'').replace(/\D/g,'').slice(0,4);
  if(pin.length!==4)return notify('Entrez les 4 chiffres du PIN');
  pinBusy=true;
  if(button){button.disabled=true;button.textContent='Vérification…'}
  try{
    const result=await rpc('verify_ride_pin',{p_ride_id:id,p_pin:pin},6000);
    if(result?.verified){markPinVerified();return}
    const left=Number(result?.remaining_attempts);
    notify(Number.isFinite(left)?`Code PIN incorrect • ${left} essai(s) restant(s)`:'Code PIN incorrect');
    if(button){button.disabled=false;button.textContent='Vérifier'}
  }catch(error){
    // The write can succeed in Supabase even if the mobile connection loses the HTTP reply.
    // Never show a false failure until the source of truth has been checked.
    let state=await readPinState(id);
    if(!state?.pin_verified){
      await new Promise(resolve=>setTimeout(resolve,450));
      state=await readPinState(id);
    }
    if(state?.pin_verified){markPinVerified();return}
    const message=String(error?.message||'');
    if(/pin_temporarily_locked/i.test(message))notify('Trop d’essais PIN. Réessayez plus tard.');
    else if(/pin_not_issued/i.test(message))notify('Le code PIN du client n’est pas encore prêt.');
    else notify(/Failed to fetch|NetworkError|Load failed|abort|timeout/i.test(message)?'Connexion instable : la validation PIN n’a pas été confirmée. Réessayez.':message);
    if(button){button.disabled=false;button.textContent='Vérifier'}
  }finally{pinBusy=false}
}
function interceptPin(event){
  const button=event.target.closest?.('#fastVerifyPin');
  if(!button||!isDriver())return;
  event.preventDefault();
  event.stopImmediatePropagation();
  verifyPinReliable();
}
function repair(){
  if(!isDriver())return;
  ensureDriverMap();
  const state=byId('fastPinVerified');
  if(state&&!state.classList.contains('hidden')){
    const input=byId('fastDriverPin');
    const button=byId('fastVerifyPin');
    if(input)input.disabled=true;
    if(button){button.disabled=true;button.textContent='PIN vérifié ✓'}
  }
}
function boot(){
  installDriverMapCss();
  document.addEventListener('click',interceptPin,true);
  observer=new MutationObserver(()=>{if(isDriver())setTimeout(repair,30)});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  clearInterval(repairTimer);
  repairTimer=setInterval(repair,900);
  repair();
}
window.FASTDriverReliability={ensureDriverMap,verifyPinReliable,readPinState};
window.addEventListener('online',()=>setTimeout(repair,30));
window.addEventListener('fast:ride-restored',()=>setTimeout(repair,30));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(repair,30)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
