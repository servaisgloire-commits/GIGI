/* FAST N°1 — restore a clean client home after a completed/cancelled ride.
   Does not change cancellation eligibility or backend ride status rules. */
(() => {
  const byId=id=>document.getElementById(id);

  function clearRidePresentation() {
    try {
      if (typeof state !== 'undefined') {
        state.pickup = null;
        state.destination = null;
        state.quote = null;
        state.offer = null;
        state.lastDispatchAt = 0;
        if (state.driverLiveMarker && state.map?.removeLayer) {
          try { state.map.removeLayer(state.driverLiveMarker); } catch {}
        }
        state.driverLiveMarker = null;
        state.driverMarkers = [];
      }
    } catch {}

    for (const id of ['pickup','destination','pinInput']) {
      const el=byId(id);
      if(el) el.value='';
    }
    const flex=byId('flexPrice');
    if(flex){
      flex.value='';
      try { delete flex.dataset.base; } catch {}
    }
    const route=byId('routeSummary');
    if(route) route.innerHTML='';
    byId('tripOptions')?.classList.add('hidden');
    byId('driverCard')?.classList.add('hidden');
    byId('clientPin')?.classList.add('hidden');
    const pin=byId('clientPin');
    if(pin) pin.innerHTML='<small>Code à donner au chauffeur</small><strong>PIN —</strong>';
    const suggested=byId('suggestedPrice');
    if(suggested) suggested.textContent='—';
    const info=byId('clientRideInfo');
    if(info) info.textContent='';
    const title=byId('clientRideTitle');
    if(title) title.textContent='Recherche de chauffeur';
    const progress=byId('clientRideProgress');
    if(progress) [...progress.children].forEach((x,i)=>x.classList.toggle('active',i===0));

    try { window.clearDriverMarkers?.(); } catch {}
    try { window.FAST_RESET_RIDE_MAP_STATE?.(); } catch {}
  }

  function restoreClientHome({clearTrip=true} = {}) {
    if(clearTrip) clearRidePresentation();
    try { window.FAST_RESET_CLIENT_SHEET?.(); } catch {}
    document.dispatchEvent(new Event('fast:client-sheet-reset'));
    const home=byId('clientHome');
    const ride=byId('clientRide');
    const nav=byId('bottomNav');
    const app=byId('app');
    ride?.classList.add('hidden');
    home?.classList.remove('hidden');
    app?.classList.remove('client-route-dismissed');
    if(nav) nav.style.display='flex';
    const book=byId('bookBtn');
    if(book) book.disabled=false;
    requestAnimationFrame(()=>{
      try { state?.map?.resize?.(); } catch {}
      try { window.initMap?.(); } catch {}
    });
  }

  const previousHide=window.hideClientRide;
  if(typeof previousHide==='function'){
    window.hideClientRide=function hideClientRideRecovered(...args){
      const result=previousHide.apply(this,args);
      restoreClientHome({clearTrip:true});
      return result;
    };
  }

  const previousCancel=window.cancelRide;
  if(typeof previousCancel==='function'){
    window.cancelRide=async function cancelRideRecovered(...args){
      const rideId=state?.ride?.id;
      if(!rideId) return restoreClientHome({clearTrip:true});
      const result=await previousCancel.apply(this,args);
      if(!state?.ride) restoreClientHome({clearTrip:true});
      return result;
    };
  }

  window.FAST_CLEAR_CLIENT_RIDE=clearRidePresentation;
  window.FAST_RESTORE_CLIENT_HOME=restoreClientHome;
})();
