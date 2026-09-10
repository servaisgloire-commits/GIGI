(()=>{
'use strict';
const q=id=>document.getElementById(id);
const FALLBACK_SUPABASE_URL='https://hmwxwzfcpdvgzjgxruup.supabase.co';
const FALLBACK_SUPABASE_KEY='sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38';
const FALLBACK_API='https://fast-n1-python-api.vercel.app';
let networkTimer=null,mapTimer=null,lastConnectivityState='unknown',probeTimer=null;

function pill(text,ok=false,warn=false){
  let p=q('fastNetworkPill');
  if(!p){p=document.createElement('div');p.id='fastNetworkPill';p.className='fast-network-pill';document.body.appendChild(p)}
  p.textContent=text;p.classList.toggle('ok',ok);p.classList.toggle('warn',warn);p.classList.add('show');
  clearTimeout(networkTimer);networkTimer=setTimeout(()=>p.classList.remove('show'),ok?1800:warn?3000:3800)
}
function hydrateRuntimeConfig(){
  try{
    if(typeof SUPABASE_URL!=='undefined'&&!SUPABASE_URL)SUPABASE_URL=FALLBACK_SUPABASE_URL;
    if(typeof SUPABASE_KEY!=='undefined'&&!SUPABASE_KEY)SUPABASE_KEY=FALLBACK_SUPABASE_KEY;
    if(typeof API!=='undefined'&&!API)API=FALLBACK_API;
  }catch(e){console.warn('FAST runtime config fallback unavailable',e)}
}
function mapFailure(message){
  const host=q('sharedMapWrap');if(!host)return;
  let x=host.querySelector('.fast-map-failure');
  if(!x){x=document.createElement('div');x.className='fast-map-failure';x.innerHTML='<div><b>Carte momentanément indisponible</b><small></small><br><button type="button">Réessayer</button></div>';host.appendChild(x)}
  const small=x.querySelector('small');if(small)small.textContent=String(message||'Vérifiez votre connexion puis réessayez.');
  x.classList.remove('hidden');
  x.querySelector('button').onclick=()=>{
    x.classList.add('hidden');
    if(window.FASTGoogleMaps&&typeof FASTGoogleMaps.retry==='function')FASTGoogleMaps.retry();
    else location.reload();
  }
}
function clearMapFailure(){const x=q('sharedMapWrap')?.querySelector('.fast-map-failure');if(x)x.classList.add('hidden')}
function a11y(){
  document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button');if(!b.getAttribute('aria-label')){const t=(b.textContent||'').replace(/\s+/g,' ').trim();if(t)b.setAttribute('aria-label',t)}});
  document.querySelectorAll('input').forEach(i=>{if(!i.getAttribute('aria-label'))i.setAttribute('aria-label',i.placeholder||i.id||'Champ')})
}
function preventRapidTap(){document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled||b.dataset.fastTapGuard==='off')return;const now=Date.now(),last=Number(b.dataset.fastLastTap||0);if(now-last<420){e.preventDefault();e.stopImmediatePropagation();return}b.dataset.fastLastTap=String(now)},true)}
function fetchWithTimeout(url,opts={},timeout=6500){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);return fetch(url,{...opts,signal:c.signal,cache:'no-store'}).finally(()=>clearTimeout(t))}
async function checkBackend(){
  const base=(typeof API!=='undefined'&&API)||FALLBACK_API;
  const r=await fetchWithTimeout(base.replace(/\/$/,'')+'/health',{headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();return !!d.ok
}
async function checkSupabase(){
  const base=(typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL)||FALLBACK_SUPABASE_URL;
  const key=(typeof SUPABASE_KEY!=='undefined'&&SUPABASE_KEY)||FALLBACK_SUPABASE_KEY;
  const r=await fetchWithTimeout(base.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:key,Accept:'application/json'}});
  if(!r.ok)throw new Error('HTTP '+r.status);return true
}
function checkGoogle(){return !!((window.FASTGoogleMaps&&FASTGoogleMaps.isReady&&FASTGoogleMaps.isReady())||(window.google&&google.maps))}
async function probeServices(showSuccess=false){
  hydrateRuntimeConfig();
  const result={online:navigator.onLine,backend:false,supabase:false,google:checkGoogle(),checkedAt:new Date().toISOString()};
  if(!result.online){window.FASTConnectivity={...result,check:probeServices};lastConnectivityState='offline';pill('Mode hors connexion');return result}
  const [backend,supabase]=await Promise.allSettled([checkBackend(),checkSupabase()]);
  result.backend=backend.status==='fulfilled'&&backend.value===true;
  result.supabase=supabase.status==='fulfilled'&&supabase.value===true;
  result.google=checkGoogle();
  window.FASTConnectivity={...result,check:probeServices};
  const degraded=!result.backend||!result.supabase;
  if(degraded){
    lastConnectivityState='degraded';
    const missing=[];if(!result.backend)missing.push('API FAST');if(!result.supabase)missing.push('Supabase');
    pill('Connexion dégradée : '+missing.join(' + '),false,true);
  }else if(showSuccess||lastConnectivityState==='degraded'||lastConnectivityState==='offline'){
    lastConnectivityState='ok';pill('FAST reconnecté : API + Supabase',true)
  }else lastConnectivityState='ok';
  return result
}
function watchMap(){clearTimeout(mapTimer);mapTimer=setTimeout(()=>{if(checkGoogle()){clearMapFailure();return}mapFailure('Google Maps n’a pas pu démarrer. Vérifiez la connexion et l’autorisation de la clé FAST.')},15000)}
function scheduleProbe(delay=0,showSuccess=false){clearTimeout(probeTimer);probeTimer=setTimeout(()=>probeServices(showSuccess).catch(e=>{console.warn('FAST connectivity probe failed',e);pill('Connexion FAST à vérifier',false,true)}),delay)}
function resizeMap(){try{if(typeof map!=='undefined'&&map&&typeof map.resize==='function')map.resize()}catch(e){}}

window.addEventListener('fast:google-map-status',e=>{if(e.detail?.ready){clearMapFailure();resizeMap()}else if(e.detail?.error)mapFailure(e.detail.error)});
window.addEventListener('online',()=>{pill('Connexion internet rétablie',true);if(window.FASTGoogleMaps?.retry)FASTGoogleMaps.retry();scheduleProbe(600,true)});
window.addEventListener('offline',()=>{lastConnectivityState='offline';pill('Mode hors connexion')});
window.addEventListener('resize',()=>{clearTimeout(window.__fastResizeTimer);window.__fastResizeTimer=setTimeout(resizeMap,180)},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){resizeMap();scheduleProbe(300,false)}});
window.addEventListener('error',e=>{const m=String(e?.message||'');if(/google|maps/i.test(m)){console.warn('FAST map error',e.error||m);mapFailure('Erreur de chargement Google Maps.')}});
window.addEventListener('unhandledrejection',e=>{const m=String(e?.reason?.message||e?.reason||'');if(/google|maps/i.test(m))console.warn('FAST map promise',m)});
window.addEventListener('load',()=>{hydrateRuntimeConfig();a11y();preventRapidTap();watchMap();scheduleProbe(900,false);const observer=new MutationObserver(()=>a11y());observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),15000);if(!navigator.onLine)pill('Mode hors connexion')});
window.FASTConnectivity={online:navigator.onLine,backend:false,supabase:false,google:false,checkedAt:null,check:probeServices};
})();
