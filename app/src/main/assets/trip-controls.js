(()=>{
'use strict';
const tc$=id=>document.getElementById(id);
const tcEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tripPayTimer=null,lastTripPayment=null;
async function control(path,opts={}){const r=await fetch(SUPABASE_URL+'/functions/v1/fast-ride-control'+path,{...opts,headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json',...(opts.headers||{})}});let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.detail||d.message||('HTTP '+r.status));return d}
function money(v,c){const n=Number(v||0);try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c||'EUR',maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(n)}catch(e){return `${n.toLocaleString('fr-FR')} ${c||''}`}}
function ensureClientCancel(){const panel=tc$('ridePanel');if(!panel||tc$('cancelActiveRideBtn'))return;const b=document.createElement('button');b.id='cancelActiveRideBtn';b.type='button';b.className='btn outline';b.style.cssText='margin-top:12px;color:#b42318;border-color:#f2b8b5';b.textContent='Annuler la course';b.onclick=()=>openCancelSheet('client');panel.appendChild(b)}
function ensurePaymentBanner(){const panel=tc$('ridePanel');if(!panel||tc$('ridePaymentBanner'))return;const box=document.createElement('div');box.id='ridePaymentBanner';box.style.cssText='margin-top:10px;padding:12px;border-radius:14px;background:#f7f9fc;border:1px solid #e1e7ef;font-size:12px;color:#475467;line-height:1.45';panel.insertBefore(box,tc$('cancelActiveRideBtn')||null)}
function driverReasons(){return ['Problème avec le véhicule','Passager introuvable','Risque de sécurité','Urgence personnelle','Autre motif']}
function clientReasons(){return ['Changement de programme','Attente trop longue','Mauvais point de prise en charge','Problème de sécurité','Autre motif']}
function openCancelSheet(actor){
  if(!currentRideId)return toast('Aucune course active');tc$('fastCancelReasonSheet')?.remove();const reasons=actor==='driver'?driverReasons():clientReasons();const sheet=document.createElement('div');sheet.id='fastCancelReasonSheet';sheet.style.cssText='position:fixed;inset:0;z-index:120000;background:rgba(8,18,35,.58);display:flex;align-items:flex-end;justify-content:center;padding:16px';
  sheet.innerHTML=`<div style="width:min(100%,560px);max-height:88vh;overflow:auto;background:#fff;border-radius:26px;padding:20px"><h3 style="margin:0 0 6px">Pourquoi annulez-vous ?</h3><p style="margin:0 0 14px;color:#667085;font-size:12px">Le motif est obligatoire lorsqu’une course a déjà été acceptée.</p><div id="fastCancelReasons" style="display:grid;gap:8px">${reasons.map(r=>`<label style="display:flex;align-items:center;gap:9px;padding:11px;border:1px solid #e4e7ec;border-radius:13px"><input type="radio" name="fastCancelReason" value="${tcEsc(r)}"><span>${tcEsc(r)}</span></label>`).join('')}</div><textarea id="fastCancelNote" class="input" style="margin-top:10px;min-height:72px" placeholder="Précision facultative"></textarea><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:13px"><button id="fastCancelBack" type="button" class="btn outline">Retour</button><button id="fastCancelConfirm" type="button" class="btn" style="background:#b42318">Confirmer l’annulation</button></div></div>`;
  document.body.appendChild(sheet);tc$('fastCancelBack').onclick=()=>sheet.remove();sheet.onclick=e=>{if(e.target===sheet)sheet.remove()};tc$('fastCancelConfirm').onclick=()=>submitCancel(actor)
}
async function submitCancel(actor){
  const reason=document.querySelector('input[name="fastCancelReason"]:checked')?.value||'';if(!reason)return toast('Choisissez un motif d’annulation');const note=(tc$('fastCancelNote')?.value||'').trim(),id=currentRideId,btn=tc$('fastCancelConfirm');if(btn){btn.disabled=true;btn.textContent='Annulation…'}
  try{const d=await control('/rides/'+id+'/cancel',{method:'POST',body:JSON.stringify({reason,note})});tc$('fastCancelReasonSheet')?.remove();currentRideId=null;clearInterval(ridePoll);ridePoll=null;clearInterval(tripPayTimer);tripPayTimer=null;tc$('ridePanel')?.classList.add('hidden');tc$('bookingState')?.classList.add('hidden');tc$('driverTrip')?.classList.add('hidden');window.dispatchEvent(new CustomEvent('fast:ride-cancelled',{detail:{rideId:id,reason,actor}}));toast(d?.ride?.payment_state==='refund_pending'?'Course annulée • remboursement à traiter':'Course annulée');setTimeout(()=>location.reload(),650)}catch(e){toast(e.message==='cancellation_reason_required'?'Un motif est obligatoire':e.message);if(btn){btn.disabled=false;btn.textContent='Confirmer l’annulation'}}
}
async function getPayment(){if(!currentRideId)return null;try{const d=await control('/rides/'+currentRideId+'/payment');lastTripPayment=d.payment||null;return lastTripPayment}catch(e){return null}}
function bankDetailsHtml(p){
  const b=p.beneficiary;if(!b)return '<p style="margin:8px 0 0">Coordonnées bancaires FAST indisponibles pour cette devise.</p>';
  const rows=[['Titulaire',b.account_holder],['Banque',b.bank_name],['IBAN',b.iban],['BIC / SWIFT',b.bic_swift],['BIC intermédiaire',b.intermediary_bic_swift],['Adresse',b.bank_address]].filter(x=>x[1]);
  return `<div style="margin-top:9px;padding:10px;border:1px solid #d9e2ef;border-radius:12px;background:#fff">${rows.map(([k,v])=>`<div style="display:grid;grid-template-columns:92px 1fr;gap:7px;margin:4px 0"><small style="color:#667085">${tcEsc(k)}</small><b style="overflow-wrap:anywhere">${tcEsc(v)}</b></div>`).join('')}${p.provider_reference?`<div style="display:grid;grid-template-columns:92px 1fr;gap:7px;margin:7px 0 0"><small style="color:#667085">Référence</small><b>${tcEsc(p.provider_reference)}</b></div>`:''}</div>`;
}
function renderPayment(p){
  ensurePaymentBanner();const box=tc$('ridePaymentBanner');if(!box||!p)return;const amount=money(p.amount,p.currency);
  if(p.method==='cash'){
    box.innerHTML=`<b>Paiement en espèces</b><br>${p.state==='cash_received'||p.state==='paid'?'Paiement reçu':'À régler au chauffeur à l’arrivée : '+amount}`;box.style.background=p.state==='cash_received'||p.state==='paid'?'#ecfdf3':'#fff8e8';return;
  }
  if(p.method==='bank_transfer'){
    const paid=['paid','authorized'].includes(p.state),submitted=p.state==='payment_submitted'||p.transfer_submitted;
    if(role==='client'){
      box.style.background=paid?'#ecfdf3':submitted?'#fff8e8':'#eef5ff';
      box.innerHTML=`<b>${paid?'Virement FAST confirmé':submitted?'Virement en cours de validation':'Virement bancaire avant le départ'}</b><br>${amount}${paid?' • le chauffeur peut démarrer la course.':' • effectuez le virement après acceptation du chauffeur.'}${paid?'':bankDetailsHtml(p)}${!paid&&!submitted&&p.beneficiary?`<div style="margin-top:10px"><input id="fastTransferReference" class="input" style="width:100%;margin-bottom:7px" placeholder="Référence de votre virement (facultatif)"><button id="fastTransferSubmitted" type="button" class="btn">J’ai effectué le virement</button></div>`:submitted&&!paid?'<small style="display:block;margin-top:8px">FAST vérifie le paiement. La course ne peut pas démarrer avant validation.</small>':''}`;
      const btn=tc$('fastTransferSubmitted');if(btn)btn.onclick=submitBankTransfer;
    }else{
      box.style.background=paid?'#ecfdf3':'#fff8e8';
      box.innerHTML=`<b>${paid?'Virement client confirmé':'Paiement client en attente'}</b><br>${amount}${paid?' • vous pouvez démarrer après vérification du PIN.':' • le départ reste bloqué tant que FAST n’a pas validé le virement.'}`;
    }
    return;
  }
  const ok=['paid','authorized'].includes(p.state);box.innerHTML=`<b>${ok?'Paiement confirmé':'Paiement requis avant le départ'}</b><br>${amount}${ok?'':' • le chauffeur ne peut pas démarrer la course avant confirmation.'}`;box.style.background=ok?'#ecfdf3':'#fff1f0';
}
async function submitBankTransfer(){
  if(!currentRideId)return;const btn=tc$('fastTransferSubmitted');if(btn){btn.disabled=true;btn.textContent='Envoi…'}
  try{const reference=(tc$('fastTransferReference')?.value||'').trim();await control('/rides/'+currentRideId+'/bank-transfer-submitted',{method:'POST',body:JSON.stringify({reference})});toast('Virement déclaré • validation FAST en attente');await refreshTripPayment()}catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='J’ai effectué le virement'}}
}
async function refreshTripPayment(){if(!token||!currentRideId)return;const p=await getPayment();if(p)renderPayment(p)}
function openCashConfirm(p){
  tc$('fastCashSheet')?.remove();const sheet=document.createElement('div');sheet.id='fastCashSheet';sheet.style.cssText='position:fixed;inset:0;z-index:120000;background:rgba(8,18,35,.58);display:flex;align-items:flex-end;justify-content:center;padding:16px';sheet.innerHTML=`<div style="width:min(100%,560px);background:#fff;border-radius:26px;padding:20px"><h3 style="margin:0 0 8px">Paiement en espèces</h3><p style="color:#667085">Confirmez uniquement après avoir reçu <b>${money(p.amount,p.currency)}</b> du client à l’arrivée.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button id="fastCashBack" class="btn outline">Retour</button><button id="fastCashReceived" class="btn">Espèces reçues</button></div></div>`;document.body.appendChild(sheet);tc$('fastCashBack').onclick=()=>sheet.remove();tc$('fastCashReceived').onclick=confirmCashAndComplete
}
async function confirmCashAndComplete(){const id=currentRideId,btn=tc$('fastCashReceived');if(!id)return;if(btn){btn.disabled=true;btn.textContent='Confirmation…'}try{await control('/rides/'+id+'/cash-received',{method:'POST',body:'{}'});tc$('fastCashSheet')?.remove();lastTripPayment={...(lastTripPayment||{}),state:'cash_received'};await baseSetRideStatusForTrip('completed')}catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='Espèces reçues'}}}
const baseSetRideStatusForTrip=typeof setRideStatus==='function'?setRideStatus:null;
if(baseSetRideStatusForTrip){window.setRideStatus=setRideStatus=async function(status){if(!currentRideId)return baseSetRideStatusForTrip(status);if(status==='in_progress'){const p=await getPayment();if(p&&p.method!=='cash'&&!['paid','authorized'].includes(p.state))return toast(p.method==='bank_transfer'?'Le virement doit être validé par FAST avant le départ.':'Paiement requis avant de démarrer la course.')}if(status==='completed'&&role==='driver'){const p=await getPayment();if(p?.method==='cash'&&!['cash_received','paid'].includes(p.state))return openCashConfirm(p);if(p&&p.method!=='cash'&&!['paid','authorized'].includes(p.state))return toast('Le paiement doit être confirmé avant de terminer.')}return baseSetRideStatusForTrip(status)}}
function patchDriverCancel(){const btn=tc$('cancelDriverRideBtn');if(btn&&!btn.dataset.reasonRequired){btn.dataset.reasonRequired='1';btn.onclick=()=>openCancelSheet('driver')}}
function boot(){ensureClientCancel();ensurePaymentBanner();patchDriverCancel();if(tripPayTimer===null)tripPayTimer=setInterval(()=>{patchDriverCancel();if(currentRideId)refreshTripPayment()},3000);if(currentRideId)refreshTripPayment()}
window.addEventListener('load',()=>{boot();setTimeout(boot,700);setTimeout(boot,1500)});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>{boot();refreshTripPayment()},120)});
})();
