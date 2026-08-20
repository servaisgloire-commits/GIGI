(()=>{
'use strict';
const gp$=id=>document.getElementById(id);
const gpsFresh=()=>{
  try{return !!lastGps?.updated&&Date.now()-Number(lastGps.updated)<120000&&Number.isFinite(Number(pickup?.lat))&&Number.isFinite(Number(pickup?.lng))}catch(e){return false}
};
const pickupReady=()=>{
  try{return pickup?.label!=='Ma position'||gpsFresh()}catch(e){return false}
};
const marketCurrency=()=>window.fastActiveMarket?.currency||'USD';
const marketLocale=()=>window.fastActiveMarket?.locale||'fr-FR';
function gpMoney(value,currency=marketCurrency(),locale=marketLocale()){
  const c=String(currency||'USD').toUpperCase();
  try{return new Intl.NumberFormat(locale||'fr-FR',{style:'currency',currency:c,maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(Number(value||0))}
  catch(e){return `${Number(value||0).toLocaleString('fr-FR')} ${c}`}
}
function requestGps(){
  if(role!=='client'||pickupReady())return;
  if(gp$('nearbyCount'))gp$('nearbyCount').textContent='Localisation en cours…';
  if(gp$('nearestEta'))gp$('nearestEta').textContent='Recherche de votre position…';
  try{getLocation()}catch(e){}
}

// Empêche toute recherche utilisant l'ancien point de démonstration avant que le GPS
// du téléphone ou une adresse réellement sélectionnée ne soit disponible.
if(typeof marketForPickup==='function'){
  const baseMarketForPickup=marketForPickup;
  marketForPickup=async function(force=false){if(!pickupReady()){requestGps();return null}return baseMarketForPickup(force)};
}
if(typeof loadNearbyDrivers==='function'){
  const baseNearby=loadNearbyDrivers;
  loadNearbyDrivers=async function(){if(role==='client'&&!pickupReady()){requestGps();return null}return baseNearby()};
}
if(typeof bookRide==='function'){
  const baseBookRide=bookRide;
  bookRide=async function(){
    if(role==='client'&&!pickupReady()){
      requestGps();
      return toast('Localisation du départ en cours. Attendez le GPS ou choisissez une adresse.');
    }
    return baseBookRide();
  };
}
if(typeof showApp==='function'){
  const baseShowApp=showApp;
  showApp=function(){const out=baseShowApp();if(role==='client'&&!pickupReady())setTimeout(requestGps,200);return out};
}
if(typeof logout==='function'){
  const baseLogout=logout;
  logout=function(){
    try{FASTNative.setAccessToken('')}catch(e){}
    try{FASTNative.stopDriverTracking()}catch(e){}
    return baseLogout();
  };
}

// Intercepte uniquement l'affichage après les réponses API. La donnée reste celle du serveur,
// mais la devise affichée suit désormais chaque course / portefeuille.
if(typeof api==='function'){
  const baseApi=api;
  api=async function(path,opts={}){
    const d=await baseApi(path,opts);
    try{
      if(path==='/v1/me'&&d?.wallet){
        setTimeout(()=>{const el=gp$('walletBalance');if(el)el.textContent=gpMoney(d.wallet.balance,d.wallet.currency||marketCurrency())},0);
      }else if(/^\/v1\/rides\/[0-9a-f-]+$/i.test(path)&&d?.ride){
        const r=d.ride;
        setTimeout(()=>{const el=gp$('ridePrice');if(el)el.textContent=gpMoney(r.final_price??r.estimated_price,r.currency||marketCurrency())},0);
      }else if(path==='/v1/rides/history'&&Array.isArray(d?.items)){
        setTimeout(()=>{
          const nodes=[...document.querySelectorAll('#historyList .card-lite strong')];
          d.items.forEach((r,i)=>{if(nodes[i])nodes[i].textContent=gpMoney(r.final_price??r.estimated_price,r.currency||marketCurrency())});
        },0);
      }
    }catch(e){}
    return d;
  };
}

function polishLabels(){
  const svc=document.querySelector('.single-service-card .single-car b');
  if(svc&&/Brazzaville|Toyota/i.test(svc.textContent||''))svc.textContent='FAST • votre zone';
  const fleet=document.querySelector('.local-fleet-card b');
  if(fleet&&/Brazzaville|Vert|Toyota/i.test(fleet.textContent||''))fleet.textContent='Chauffeurs FAST à proximité';
  const safety=[...document.querySelectorAll('.safety-row span')];
  const dispatch=safety.find(x=>/Dispatch Python/i.test(x.textContent||''));if(dispatch)dispatch.textContent='⚡ Attribution intelligente';
  const details=gp$('dispatchDetails');if(details&&/Python/i.test(details.textContent||''))details.textContent='FAST analyse ETA • distance • disponibilité';
}
function rebind(){
  if(gp$('bookBtn'))gp$('bookBtn').onclick=bookRide;
  if(gp$('logoutBtn'))gp$('logoutBtn').onclick=logout;
  if(gp$('driverLogoutBtn'))gp$('driverLogoutBtn').onclick=logout;
  polishLabels();
}

rebind();
setTimeout(rebind,350);setTimeout(rebind,1000);
setTimeout(()=>{
  if(token&&role==='client'){
    clearInterval(nearbyPoll);
    try{startNearbyPolling()}catch(e){}
  }
},500);
window.addEventListener('online',()=>{if(token&&role==='client'&&!pickupReady())requestGps()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&token&&role==='client'&&!pickupReady())requestGps()});
})();
