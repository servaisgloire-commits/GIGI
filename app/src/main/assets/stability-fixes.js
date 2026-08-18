(()=>{
'use strict';
let bookingLocked=false,restoring=false,lastRestoredRide=null;
const retryCounts=new Map();
const q=id=>document.getElementById(id);
const validLoc=loc=>!!loc&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lng));
const baseApi=api,baseSupa=supa,baseBookRide=bookRide,baseLogin=login,baseSignup=signup,baseForgot=forgotPassword,baseLogout=logout,baseShowApp=showApp,baseSetRideStatus=setRideStatus;

function setBusy(btn,busy,label){if(!btn)return;if(busy){btn.dataset.oldText=btn.textContent;btn.disabled=true;if(label)btn.textContent=label}else{btn.disabled=false;if(btn.dataset.oldText){btn.textContent=btn.dataset.oldText;delete btn.dataset.oldText}}}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}
function friendlyError(e){const m=String(e?.message||e||'Erreur');if(/Failed to fetch|NetworkError|Load failed|timeout|AbortError/i.test(m))return 'Connexion internet instable. Réessayez dans quelques secondes.';if(/Invalid login credentials/i.test(m))return 'E-mail ou mot de passe incorrect.';if(/Email not confirmed/i.test(m))return 'Confirmez votre adresse e-mail avant de vous connecter.';if(/addresses_not_confirmed/i.test(m))return 'Confirmez le départ et la destination avant de démarrer.';if(/ride_pin_not_verified/i.test(m))return 'Le code PIN doit être vérifié avant le démarrage.';if(/invalid_ride_transition/i.test(m))return 'Cette action n’est plus disponible pour cette course.';return m}

api=async function(path,opts={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    opts={...opts,signal:opts.signal||controller.signal};
    const headers={...(opts.headers||{}),...(token?{'Authorization':'Bearer '+token,'Content-Type':'application/json'}:{'Content-Type':'application/json'})};
    const r=await fetch(API+path,{...opts,headers});let d={};try{d=await r.json()}catch(e){}
    if(!r.ok){const msg=d.detail||d.message||d.error||('HTTP '+r.status);throw new Error(msg)}return d;
  }catch(e){if(e?.name==='AbortError')throw new Error('Délai réseau dépassé');throw e}finally{clearTimeout(timer)}
};

supa=async function(path,opts={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const headers={...(opts.headers||{}),'apikey':SUPABASE_KEY,'Content-Type':'application/json'};
    const r=await fetch(SUPABASE_URL+path,{...opts,headers,signal:opts.signal||controller.signal});let d={};try{d=await r.json()}catch(e){}
    if(!r.ok)throw new Error(d.msg||d.message||d.error_description||d.error||'Erreur Supabase');return d;
  }catch(e){if(e?.name==='AbortError')throw new Error('Délai réseau dépassé');throw e}finally{clearTimeout(timer)}
};

login=async function(){
  const email=q('loginEmail')?.value.trim(),password=q('loginPassword')?.value||'',btn=q('loginBtn');
  if(!emailOk(email))return toast('Entrez une adresse e-mail valide');if(!password)return toast('Entrez votre mot de passe');
  setBusy(btn,true,'Connexion…');try{await baseLogin();setTimeout(()=>restoreActiveRide(true),450)}catch(e){toast(friendlyError(e))}finally{setBusy(btn,false)}
};

signup=async function(){
  const email=q('signupEmail')?.value.trim(),password=q('signupPassword')?.value||'',first=q('firstName')?.value.trim(),last=q('lastName')?.value.trim(),btn=q('signupBtn');
  if(!first||!last)return toast('Entrez votre prénom et votre nom');if(!emailOk(email))return toast('Entrez une adresse e-mail valide');if(password.length<8)return toast('Choisissez un mot de passe d’au moins 8 caractères');
  setBusy(btn,true,'Création…');try{await baseSignup()}catch(e){toast(friendlyError(e))}finally{setBusy(btn,false)}
};

forgotPassword=async function(){
  const email=q('loginEmail')?.value.trim(),btn=q('forgotBtn');if(!emailOk(email))return toast('Entrez votre e-mail de connexion');
  setBusy(btn,true,'Envoi…');try{await baseForgot();toast('E-mail de réinitialisation envoyé. Vérifiez aussi les spams.')}catch(e){toast(friendlyError(e))}finally{setBusy(btn,false)}
};

logout=function(){
  try{Object.keys(localStorage).filter(k=>k.startsWith('fast_pin_')).forEach(k=>localStorage.removeItem(k))}catch(e){}
  bookingLocked=false;restoring=false;lastRestoredRide=null;retryCounts.clear();baseLogout();
};

bookRide=async function(){
  if(bookingLocked)return toast('Votre demande est déjà en cours');
  if(role!=='client')return toast('Compte passager requis');
  if(!validLoc(pickup))return toast('Localisation de départ indisponible');
  if(!validLoc(destination))return toast('Choisissez une destination confirmée');
  if(currentRideId)return toast('Vous avez déjà une course en cours');
  const btn=q('bookBtn');bookingLocked=true;setBusy(btn,true,'Recherche d’un chauffeur…');
  try{await baseBookRide();if(!currentRideId)bookingLocked=false}catch(e){bookingLocked=false;toast(friendlyError(e))}finally{if(!currentRideId)setBusy(btn,false)}
};

async function safeRideSnapshot(id){try{return await api('/v1/rides/'+id)}catch(e){return null}}
async function safeRetryDispatch(id){
  if(!id||id!==currentRideId||role!=='client')return;
  const count=retryCounts.get(id)||0;if(count>=5){q('bookingMessage').textContent='Aucun chauffeur disponible pour le moment';q('dispatchDetails')&&(q('dispatchDetails').textContent='Réessayez un peu plus tard');bookingLocked=false;setBusy(q('bookBtn'),false);return}
  const snap=await safeRideSnapshot(id);if(!snap)return setTimeout(()=>safeRetryDispatch(id),9000);
  const s=snap.ride?.status;if(s!=='searching'){pollRide();return}
  retryCounts.set(id,count+1);
  try{const d=await api('/v1/rides/'+id+'/dispatch',{method:'POST'});if(d.matched){pollRide();return}}catch(e){}
  setTimeout(()=>safeRetryDispatch(id),12000);
}

retryDispatch=async function(){if(currentRideId)safeRetryDispatch(currentRideId)};

setRideStatus=async function(status){
  if(!currentRideId)return toast('Aucune course active');
  const mapBtn={driver_arriving:'arrivingBtn',in_progress:'startRideBtn',completed:'completeRideBtn'},btn=q(mapBtn[status]);setBusy(btn,true,status==='completed'?'Finalisation…':'Mise à jour…');
  try{
    await api('/v1/rides/'+currentRideId+'/status',{method:'PATCH',body:JSON.stringify({status})});toast(status==='completed'?'Course terminée':'Statut mis à jour');
    if(status==='completed'){
      const old=currentRideId;currentRideId=null;lastRestoredRide=null;q('driverTrip')?.classList.add('hidden');q('offerCard')?.classList.add('hidden');localStorage.removeItem('fast_pin_'+old);loadHistory();if(role==='driver'&&q('driverToggleInput')?.checked)startOfferPolling();
    }else if(typeof refreshDriverNavigation==='function')refreshDriverNavigation();
  }catch(e){toast(friendlyError(e))}finally{setBusy(btn,false)}
};

async function restoreActiveRide(force=false){
  if(!token||!profile||restoring)return;if(!force&&lastRestoredRide===currentRideId&&currentRideId)return;restoring=true;
  try{
    const h=await api('/v1/rides/history'),items=h.items||[];
    const active=role==='driver'?['accepted','driver_arriving','in_progress']:['searching','accepted','driver_arriving','in_progress'];
    const ride=items.find(r=>active.includes(r.status));
    if(!ride)return;
    currentRideId=ride.id;lastRestoredRide=ride.id;
    if(role==='client'){
      bookingLocked=true;clearInterval(nearbyPoll);clearDriverMarkers();q('bookingState')?.classList.remove('hidden');q('bookingMessage').textContent=ride.status==='searching'?'Recherche de votre chauffeur…':'Course restaurée';pollRide();
      if(ride.status==='searching')setTimeout(()=>safeRetryDispatch(ride.id),28000);
    }else{
      q('driverTrip')?.classList.remove('hidden');q('driverRoadPhase').textContent=ride.status==='in_progress'?'Vers la destination':'Vers le passager';q('driverInstruction').textContent='Reprise de la navigation…';if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling();
    }
    window.dispatchEvent(new CustomEvent('fast:ride-restored',{detail:{ride}}));toast('Course en cours restaurée');
  }catch(e){console.warn('FAST restore ride',e)}finally{restoring=false}
}

showApp=function(){baseShowApp();setTimeout(()=>restoreActiveRide(),450)};

function patchHandlers(){
  q('loginBtn')&&(q('loginBtn').onclick=login);q('signupBtn')&&(q('signupBtn').onclick=signup);q('forgotBtn')&&(q('forgotBtn').onclick=forgotPassword);q('logoutBtn')&&(q('logoutBtn').onclick=logout);q('bookBtn')&&(q('bookBtn').onclick=bookRide);
  q('arrivingBtn')&&(q('arrivingBtn').onclick=()=>setRideStatus('driver_arriving'));q('startRideBtn')&&(q('startRideBtn').onclick=()=>setRideStatus('in_progress'));q('completeRideBtn')&&(q('completeRideBtn').onclick=()=>setRideStatus('completed'));
}

window.addEventListener('online',()=>{if(token){toast('Connexion rétablie');restoreActiveRide(true)}});
window.addEventListener('offline',()=>toast('Vous êtes hors connexion'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&token)restoreActiveRide(true)});
window.addEventListener('load',()=>{patchHandlers();setTimeout(()=>{patchHandlers();if(token&&profile)restoreActiveRide(true)},700)});
})();
