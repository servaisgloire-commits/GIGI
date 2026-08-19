(()=>{
'use strict';
const dc$=id=>document.getElementById(id);

function installDriverCancel(){
  const trip=dc$('driverTrip');
  const actions=trip?.querySelector('.driver-trip-actions');
  if(!actions||dc$('cancelDriverRideBtn'))return;
  const btn=document.createElement('button');
  btn.id='cancelDriverRideBtn';
  btn.type='button';
  btn.className='btn ghost';
  btn.textContent='Annuler la course';
  btn.onclick=openDriverCancelConfirm;
  actions.appendChild(btn);
}

function openDriverCancelConfirm(){
  if(!currentRideId)return toast('Aucune course active');
  dc$('driverCancelSheet')?.remove();
  const sheet=document.createElement('div');
  sheet.id='driverCancelSheet';
  sheet.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(8,18,35,.52);display:flex;align-items:flex-end;justify-content:center;padding:18px';
  sheet.innerHTML=`<div style="width:min(100%,560px);background:#fff;border-radius:28px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.28)"><h3 style="margin:0 0 10px;color:#101828;font-size:22px">Annuler cette course ?</h3><p style="margin:0 0 20px;color:#667085;line-height:1.45">Le client sera immédiatement informé et vous pourrez recevoir une nouvelle demande.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><button id="driverCancelBack" type="button" class="btn outline">Retour</button><button id="driverCancelConfirm" type="button" class="btn" style="background:#c62828">Annuler la course</button></div></div>`;
  document.body.appendChild(sheet);
  dc$('driverCancelBack').onclick=()=>sheet.remove();
  sheet.onclick=e=>{if(e.target===sheet)sheet.remove()};
  dc$('driverCancelConfirm').onclick=cancelDriverRide;
}

async function cancelDriverRide(){
  if(!currentRideId)return;
  const rideId=currentRideId;
  const confirmBtn=dc$('driverCancelConfirm');
  if(confirmBtn){confirmBtn.disabled=true;confirmBtn.textContent='Annulation…'}
  try{
    await api('/v1/rides/'+rideId+'/status',{method:'PATCH',body:JSON.stringify({status:'cancelled'})});
    currentRideId=null;
    dc$('driverCancelSheet')?.remove();
    dc$('driverTrip')?.classList.add('hidden');
    try{localStorage.removeItem('fast_pin_'+rideId)}catch(e){}
    try{if(typeof stopDriverNavigationPolling==='function')stopDriverNavigationPolling()}catch(e){}
    if(dc$('driverRoadPhase'))dc$('driverRoadPhase').textContent='En attente d’une course';
    if(dc$('driverInstruction'))dc$('driverInstruction').textContent='Restez en ligne pour recevoir une nouvelle demande';
    if(dc$('driverStepDistance'))dc$('driverStepDistance').textContent='—';
    if(dc$('driverNavEta'))dc$('driverNavEta').textContent='—';
    if(dc$('driverNavDistance'))dc$('driverNavDistance').textContent='—';
    try{if(dc$('driverToggleInput')?.checked){if(typeof startOfferPolling==='function')startOfferPolling();if(typeof loadOfferStack==='function')loadOfferStack()}}catch(e){}
    toast('Course annulée');
  }catch(e){
    toast(e.message||'Annulation impossible');
    if(confirmBtn){confirmBtn.disabled=false;confirmBtn.textContent='Annuler la course'}
  }
}

window.addEventListener('load',()=>{installDriverCancel();setTimeout(installDriverCancel,700)});
const driverCancelObserver=new MutationObserver(installDriverCancel);
driverCancelObserver.observe(document.documentElement,{subtree:true,childList:true});
})();
