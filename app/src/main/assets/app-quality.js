(()=>{
'use strict';
const q=id=>document.getElementById(id);
const FALLBACK_SUPABASE_URL='https://hmwxwzfcpdvgzjgxruup.supabase.co';
const FALLBACK_SUPABASE_KEY='sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38';
const FALLBACK_API='https://fast-n1-python-api.vercel.app';
const FAST_AUTH_REDIRECT='fastn1://auth';
let networkTimer=null,mapTimer=null,lastConnectivityState='unknown',probeTimer=null;
let savedPlaces={home:null,work:null,airport:null},savedPlacesLoadedFor=null;

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
function injectFast85Style(){
  if(q('fast85Style'))return;
  const style=document.createElement('style');style.id='fast85Style';style.textContent=`
  .fast-mark{position:relative!important;display:block!important;flex:0 0 auto!important;width:46px!important;height:46px!important;border-radius:15px!important;overflow:hidden!important;background:linear-gradient(145deg,#071b3f 0%,#0b57d0 62%,#15bfff 100%)!important;box-shadow:0 10px 24px rgba(11,87,208,.23)!important}
  .fast-mark.small{width:34px!important;height:34px!important;border-radius:11px!important;box-shadow:0 7px 17px rgba(11,87,208,.19)!important}
  .fast-mark span{display:none!important}.fast-mark:before{content:'F';position:absolute;z-index:2;left:14px;top:4px;color:#fff;font:900 italic 32px/1.15 Arial,sans-serif;letter-spacing:-4px;transform:skewX(-8deg);text-shadow:0 1px 0 rgba(255,255,255,.2)}
  .fast-mark.small:before{left:10px;top:3px;font-size:24px}.fast-mark:after{content:'';position:absolute;left:4px;top:22px;width:18px;height:3px;border-radius:9px;background:#57e2ff;box-shadow:0 7px 0 #21baff,0 14px 0 #92efff;opacity:.95}.fast-mark.small:after{left:3px;top:16px;width:13px;height:2px;box-shadow:0 5px 0 #21baff,0 10px 0 #92efff}
  .fast-word{letter-spacing:-1.1px!important}.fast-saved-wrap{margin:12px 0 14px;padding:14px;border:1px solid #e5ecf5;border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.04)}
  .fast-saved-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.fast-saved-head b{font-size:13px;color:#071b3f}.fast-saved-head small{font-size:10px;color:#7b8798}
  .fast-saved-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.fast-saved-card{min-width:0;border:1px solid #e4eaf2;border-radius:14px;background:#f9fbff;overflow:hidden}.fast-saved-use{width:100%;min-height:63px;border:0;background:transparent;text-align:left;padding:10px;display:flex;gap:7px;align-items:flex-start;color:#101828}.fast-saved-use .ico{width:27px;height:27px;display:grid;place-items:center;border-radius:9px;background:#eaf3ff;color:#0b57d0;font-weight:900}.fast-saved-use b{display:block;font-size:11px}.fast-saved-use small{display:block;margin-top:3px;color:#667085;font-size:9px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}.fast-saved-edit{width:100%;border:0;border-top:1px solid #e7edf5;background:#fff;color:#0b57d0;font-size:9px;font-weight:850;padding:7px;cursor:pointer}.fast-saved-card.ready{border-color:#cbdffd;background:#f2f7ff}.fast-saved-card.ready .fast-saved-use{cursor:pointer}
  .booking-panel{padding-bottom:max(92px,env(safe-area-inset-bottom))!important}.single-service-card,.payment-card,.route-fields{box-shadow:0 8px 24px rgba(15,23,42,.045)!important}.safety-row{gap:6px!important;flex-wrap:wrap}.safety-row span{font-size:9px!important}.route-insights .alternative-routes{display:none!important}.route-insights .route-steps{max-height:145px!important;overflow:auto!important}.advanced-ride{margin-bottom:10px!important}
  .share-ride,.ride-share,[data-action*='share'],[data-fast-share]{display:none!important}
  @media(max-width:520px){.fast-saved-grid{grid-template-columns:1fr}.fast-saved-card{display:grid;grid-template-columns:1fr 76px;align-items:stretch}.fast-saved-edit{border-top:0;border-left:1px solid #e7edf5}.fast-saved-use small{max-width:210px}}
  `;document.head.appendChild(style)
}
function mapFailure(message){
  const host=q('sharedMapWrap');if(!host)return;
  let x=host.querySelector('.fast-map-failure');
  if(!x){x=document.createElement('div');x.className='fast-map-failure';x.innerHTML='<div><b>Carte momentanément indisponible</b><small></small><br><button type="button">Réessayer</button></div>';host.appendChild(x)}
  const small=x.querySelector('small');if(small)small.textContent=String(message||'Vérifiez votre connexion puis réessayez.');
  x.classList.remove('hidden');
  x.querySelector('button').onclick=()=>{x.classList.add('hidden');if(window.FASTGoogleMaps&&typeof FASTGoogleMaps.retry==='function')FASTGoogleMaps.retry();else location.reload()}
}
function clearMapFailure(){const x=q('sharedMapWrap')?.querySelector('.fast-map-failure');if(x)x.classList.add('hidden')}
function a11y(){
  document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button');if(!b.getAttribute('aria-label')){const t=(b.textContent||'').replace(/\s+/g,' ').trim();if(t)b.setAttribute('aria-label',t)}});
  document.querySelectorAll('input').forEach(i=>{if(!i.getAttribute('aria-label'))i.setAttribute('aria-label',i.placeholder||i.id||'Champ')})
}
function removeRideSharing(){
  document.querySelectorAll('button,a,[role="button"],[id*="share" i],[class*="share" i]').forEach(el=>{
    const text=((el.textContent||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.id||'')+' '+(el.className||'')).toLowerCase();
    if(/partag(e|er|e de trajet|er le trajet)|share.{0,12}(ride|trip)|ride.{0,12}share/.test(text))el.remove();
  })
}
function preventRapidTap(){document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled||b.dataset.fastTapGuard==='off')return;const now=Date.now(),last=Number(b.dataset.fastLastTap||0);if(now-last<420){e.preventDefault();e.stopImmediatePropagation();return}b.dataset.fastLastTap=String(now)},true)}
function fetchWithTimeout(url,opts={},timeout=6500){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);return fetch(url,{...opts,signal:c.signal,cache:'no-store'}).finally(()=>clearTimeout(t))}
async function checkBackend(){const base=(typeof API!=='undefined'&&API)||FALLBACK_API;const r=await fetchWithTimeout(base.replace(/\/$/,'')+'/health',{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();return !!d.ok}
async function checkSupabase(){const base=(typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL)||FALLBACK_SUPABASE_URL;const key=(typeof SUPABASE_KEY!=='undefined'&&SUPABASE_KEY)||FALLBACK_SUPABASE_KEY;const r=await fetchWithTimeout(base.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:key,Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return true}
function checkGoogle(){return !!((window.FASTGoogleMaps&&FASTGoogleMaps.isReady&&FASTGoogleMaps.isReady())||(window.google&&google.maps))}
async function probeServices(showSuccess=false){
  hydrateRuntimeConfig();const result={online:navigator.onLine,backend:false,supabase:false,google:checkGoogle(),checkedAt:new Date().toISOString()};
  if(!result.online){window.FASTConnectivity={...result,check:probeServices};lastConnectivityState='offline';pill('Mode hors connexion');return result}
  const [backend,supabase]=await Promise.allSettled([checkBackend(),checkSupabase()]);result.backend=backend.status==='fulfilled'&&backend.value===true;result.supabase=supabase.status==='fulfilled'&&supabase.value===true;result.google=checkGoogle();window.FASTConnectivity={...result,check:probeServices};
  const degraded=!result.backend||!result.supabase;if(degraded){lastConnectivityState='degraded';const missing=[];if(!result.backend)missing.push('API FAST');if(!result.supabase)missing.push('Supabase');pill('Connexion dégradée : '+missing.join(' + '),false,true)}else if(showSuccess||lastConnectivityState==='degraded'||lastConnectivityState==='offline'){lastConnectivityState='ok';pill('FAST reconnecté : API + Supabase',true)}else lastConnectivityState='ok';return result
}
function watchMap(){clearTimeout(mapTimer);mapTimer=setTimeout(()=>{if(checkGoogle()){clearMapFailure();return}mapFailure('Google Maps n’a pas pu démarrer. Vérifiez la connexion et l’autorisation de la clé FAST.')},15000)}
function scheduleProbe(delay=0,showSuccess=false){clearTimeout(probeTimer);probeTimer=setTimeout(()=>probeServices(showSuccess).catch(e=>{console.warn('FAST connectivity probe failed',e);pill('Connexion FAST à vérifier',false,true)}),delay)}
function resizeMap(){try{if(typeof map!=='undefined'&&map&&typeof map.resize==='function')map.resize()}catch(e){}}
function userRestHeaders(extra={}){hydrateRuntimeConfig();const key=(typeof SUPABASE_KEY!=='undefined'&&SUPABASE_KEY)||FALLBACK_SUPABASE_KEY;const access=(typeof token!=='undefined'&&token)||'';return {'apikey':key,'Authorization':'Bearer '+access,'Content-Type':'application/json',...extra}}
async function userRest(path,opts={}){const base=(typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL)||FALLBACK_SUPABASE_URL;const r=await fetchWithTimeout(base.replace(/\/$/,'')+'/rest/v1/'+path,{...opts,headers:{...userRestHeaders(),...(opts.headers||{})}},8000);let d=null;try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d?.message||d?.hint||('HTTP '+r.status));return d}
const placeDefs={home:{label:'Maison',icon:'⌂'},work:{label:'Travail',icon:'▣'},airport:{label:'Aéroport',icon:'✈'}};
function ensureSavedPlacesUi(){
  if(q('fastSavedPlaces')||!q('passengerArea'))return;
  const anchor=q('passengerArea').querySelector('.single-service-card')||q('passengerArea').querySelector('.payment-card');if(!anchor)return;
  const wrap=document.createElement('div');wrap.id='fastSavedPlaces';wrap.className='fast-saved-wrap';wrap.innerHTML='<div class="fast-saved-head"><b>Adresses favorites</b><small>Maison • Travail • Aéroport</small></div><div class="fast-saved-grid">'+Object.entries(placeDefs).map(([type,d])=>`<div class="fast-saved-card" data-place-card="${type}"><button class="fast-saved-use" data-place-use="${type}"><span class="ico">${d.icon}</span><span><b>${d.label}</b><small data-place-text="${type}">Non définie</small></span></button><button class="fast-saved-edit" data-place-save="${type}">Définir</button></div>`).join('')+'</div>';
  anchor.insertAdjacentElement('beforebegin',wrap);
  wrap.querySelectorAll('[data-place-use]').forEach(b=>b.onclick=()=>useSavedPlace(b.dataset.placeUse));wrap.querySelectorAll('[data-place-save]').forEach(b=>b.onclick=()=>saveCurrentDestinationAs(b.dataset.placeSave));renderSavedPlaces()
}
function renderSavedPlaces(){Object.keys(placeDefs).forEach(type=>{const row=savedPlaces[type],card=document.querySelector(`[data-place-card="${type}"]`),text=document.querySelector(`[data-place-text="${type}"]`),edit=document.querySelector(`[data-place-save="${type}"]`);if(!card||!text||!edit)return;card.classList.toggle('ready',!!row);text.textContent=row?(row.address||row.label||placeDefs[type].label):'Non définie';edit.textContent=row?'Modifier':'Définir'})}
async function loadSavedPlaces(force=false){
  ensureSavedPlacesUi();if(typeof token==='undefined'||!token||typeof profile==='undefined'||!profile?.id)return;
  if(!force&&savedPlacesLoadedFor===profile.id)return;
  try{const rows=await userRest(`saved_places?select=id,place_type,label,address,latitude,longitude,updated_at&user_id=eq.${encodeURIComponent(profile.id)}&place_type=in.(home,work,airport)&order=updated_at.desc`);savedPlaces={home:null,work:null,airport:null};(rows||[]).forEach(r=>{if(r.place_type&&Object.hasOwn(savedPlaces,r.place_type)&&!savedPlaces[r.place_type])savedPlaces[r.place_type]=r});savedPlacesLoadedFor=profile.id;renderSavedPlaces()}catch(e){console.warn('FAST saved places',e)}
}
async function saveCurrentDestinationAs(type){
  if(!placeDefs[type])return;if(typeof token==='undefined'||!token||typeof profile==='undefined'||!profile?.id)return typeof toast==='function'&&toast('Connectez-vous pour enregistrer une adresse');
  if(typeof destination==='undefined'||!destination||!Number.isFinite(Number(destination.lat))||!Number.isFinite(Number(destination.lng)))return typeof toast==='function'&&toast('Choisissez d’abord une destination sur la carte');
  const payload={user_id:profile.id,place_type:type,label:placeDefs[type].label,address:destination.label||placeDefs[type].label,latitude:Number(destination.lat),longitude:Number(destination.lng),updated_at:new Date().toISOString()};
  try{const existing=savedPlaces[type];if(existing?.id){await userRest(`saved_places?id=eq.${encodeURIComponent(existing.id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)})}else{await userRest('saved_places',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)})}savedPlacesLoadedFor=null;await loadSavedPlaces(true);if(typeof toast==='function')toast(placeDefs[type].label+' enregistrée')}catch(e){if(typeof toast==='function')toast('Adresse non enregistrée : '+e.message)}
}
async function useSavedPlace(type){
  const row=savedPlaces[type];if(!row)return typeof toast==='function'&&toast('Définissez d’abord '+placeDefs[type].label.toLowerCase());
  try{destination={label:row.address||row.label,lat:Number(row.latitude),lng:Number(row.longitude)};const input=q('destinationInput');if(input)input.value=destination.label;if(typeof refreshRoute==='function')await refreshRoute();if(typeof toast==='function')toast(placeDefs[type].label+' sélectionnée')}catch(e){if(typeof toast==='function')toast('Impossible de charger cette adresse')}
}
async function signupWithVerifiedMail(){
  const email=q('signupEmail')?.value.trim()||'',password=q('signupPassword')?.value||'';if(!email)return typeof toast==='function'&&toast('Entrez votre adresse e-mail');if(password.length<8)return typeof toast==='function'&&toast('Mot de passe : 8 caractères minimum');
  hydrateRuntimeConfig();const base=(typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL)||FALLBACK_SUPABASE_URL,key=(typeof SUPABASE_KEY!=='undefined'&&SUPABASE_KEY)||FALLBACK_SUPABASE_KEY;
  const body={email,password,data:{role:q('signupRole')?.value||'client',first_name:q('firstName')?.value.trim()||'',last_name:q('lastName')?.value.trim()||'',phone:q('phone')?.value.trim()||''}};
  try{const url=base.replace(/\/$/,'')+'/auth/v1/signup?redirect_to='+encodeURIComponent(FAST_AUTH_REDIRECT);const r=await fetchWithTimeout(url,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body)},10000);let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.msg||d.message||d.error_description||'Création du compte impossible');if(typeof toast==='function')toast('Compte créé. Vérifiez l’e-mail envoyé par FAST N°1.');q('signupBtn')&&(q('signupBtn').disabled=true);setTimeout(()=>{if(q('signupBtn'))q('signupBtn').disabled=false},4000)}catch(e){if(typeof toast==='function')toast(e.message)}
}

window.addEventListener('fast:google-map-status',e=>{if(e.detail?.ready){clearMapFailure();resizeMap()}else if(e.detail?.error)mapFailure(e.detail.error)});
window.addEventListener('online',()=>{pill('Connexion internet rétablie',true);if(window.FASTGoogleMaps?.retry)FASTGoogleMaps.retry();scheduleProbe(600,true)});
window.addEventListener('offline',()=>{lastConnectivityState='offline';pill('Mode hors connexion')});
window.addEventListener('resize',()=>{clearTimeout(window.__fastResizeTimer);window.__fastResizeTimer=setTimeout(resizeMap,180)},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){resizeMap();scheduleProbe(300,false);loadSavedPlaces(true)}});
window.addEventListener('error',e=>{const m=String(e?.message||'');if(/google|maps/i.test(m)){console.warn('FAST map error',e.error||m);mapFailure('Erreur de chargement Google Maps.')}});
window.addEventListener('unhandledrejection',e=>{const m=String(e?.reason?.message||e?.reason||'');if(/google|maps/i.test(m))console.warn('FAST map promise',m)});
window.addEventListener('load',()=>{
  hydrateRuntimeConfig();injectFast85Style();a11y();preventRapidTap();removeRideSharing();ensureSavedPlacesUi();watchMap();scheduleProbe(900,false);if(q('signupBtn'))q('signupBtn').onclick=signupWithVerifiedMail;
  const main=q('mainApp');if(main){new MutationObserver(()=>{if(!main.classList.contains('hidden')){ensureSavedPlacesUi();setTimeout(()=>loadSavedPlaces(false),250)}}).observe(main,{attributes:true,attributeFilter:['class']})}
  const observer=new MutationObserver(()=>{a11y();removeRideSharing();ensureSavedPlacesUi()});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),60000);
  setTimeout(()=>loadSavedPlaces(false),700);setTimeout(()=>loadSavedPlaces(false),1800);if(!navigator.onLine)pill('Mode hors connexion')
});
window.FASTConnectivity={online:navigator.onLine,backend:false,supabase:false,google:false,checkedAt:null,check:probeServices};
window.FASTSavedPlaces={reload:()=>loadSavedPlaces(true),save:saveCurrentDestinationAs,use:useSavedPlace};
})();
