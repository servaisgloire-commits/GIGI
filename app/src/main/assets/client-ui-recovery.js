/* FAST N°1 — restore the client home after a completed/cancelled ride.
   Does not change cancellation eligibility or backend ride status rules. */
(() => {
  function restoreClientHome() {
    try { window.FAST_RESET_CLIENT_SHEET?.(); } catch {}
    document.dispatchEvent(new Event('fast:client-sheet-reset'));
    const home=document.getElementById('clientHome');
    const ride=document.getElementById('clientRide');
    const nav=document.getElementById('bottomNav');
    const app=document.getElementById('app');
    ride?.classList.add('hidden');
    home?.classList.remove('hidden');
    app?.classList.remove('client-route-dismissed');
    if(nav) nav.style.display='flex';
    const book=document.getElementById('bookBtn');
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
      restoreClientHome();
      return result;
    };
  }

  const previousCancel=window.cancelRide;
  if(typeof previousCancel==='function'){
    window.cancelRide=async function cancelRideRecovered(...args){
      const rideId=state?.ride?.id;
      if(!rideId) return restoreClientHome();
      const result=await previousCancel.apply(this,args);
      if(!state?.ride) restoreClientHome();
      return result;
    };
  }

  window.FAST_RESTORE_CLIENT_HOME=restoreClientHome;
})();
