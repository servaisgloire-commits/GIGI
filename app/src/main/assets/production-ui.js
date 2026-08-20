(()=>{
'use strict';
const q=id=>document.getElementById(id);
let lastSearching=null,lastRouteReady=null,lastDriverProfilePrepared=false,resendCooldownTimer=null,uiTimer=null;

function removePrototypeSignals(){
  document.querySelectorAll('.map-status,.safety-row,.fast-trust-strip,.local-fleet-card,.fast-driver-advantages').forEach(el=>el.remove());
  const engine=document.querySelector('.map-engine');if(engine&&engine.style.display!=='none')engine.style.display='none';
  const dispatch=q('dispatchDetails');if(dispatch&&dispatch.style.display!=='none')dispatch.style.display='none';
  const booking=q('bookingMessage');if(booking){
    const t=(booking.textContent||'').trim();
    if(/Aucun chauffeur adapté dans la première vague/i.test(t))booking.textContent='Nous élargissons la recherche autour de vous…';
    else if(/Nouvelle recherche chauffeur/i.test(t))booking.textContent='Recherche en cours…';
  }
}

function ensureClientPrompt(){
  const fields=document.querySelector('#passengerArea .route-fields');if(!fields||q('fastClientPrompt'))return;
  const h=document.createElement('h2');h.id='fastClientPrompt';h.className='fast-client-prompt';h.textContent='Où allez-vous ?';fields.insertAdjacentElement('beforebegin',h);
}

function setPickupMode(mode){
  const input=q('pickupInput'),chooser=q('fastPickupChoice');if(!input||!chooser)return;
  const addressMode=mode==='address';
  document.body.classList.toggle('fast-pickup-address-mode',addressMode);
  chooser.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.pickupMode===mode));
  if(addressMode){if(input.value==='Ma position')input.value='';setTimeout(()=>{try{input.focus({preventScroll:true})}catch(e){input.focus()}},40)}
  else{input.value='Ma position';try{if(typeof getLocation==='function')getLocation()}catch(e){}}
}
window.setPickupMode=setPickupMode;

function ensurePickupChoice(){
  const fields=document.querySelector('#passengerArea .route-fields');if(!fields||q('fastPickupChoice'))return;
  const box=document.createElement('div');box.id='fastPickupChoice';box.className='fast-pickup-choice';
  box.innerHTML='<small>Départ</small><div><button type="button" class="active" data-pickup-mode="current"><span>◎</span>Ma position</button><button type="button" data-pickup-mode="address"><span>⌕</span>Adresse précise</button></div>';
  fields.insertAdjacentElement('beforebegin',box);
  box.querySelectorAll('button').forEach(btn=>btn.onclick=()=>setPickupMode(btn.dataset.pickupMode));
}

function openSavedPlace(kind,label){
  document.querySelector('.fast-saved-place-sheet')?.remove();
  const sheet=document.createElement('div');sheet.className='fast-saved-place-sheet';
  sheet.innerHTML=`<div class="fast-saved-place-card"><h3>Ajouter ${label}</h3><p>Enregistrez cette adresse pour vos prochains trajets.</p><input id="fastSavedPlaceInput" placeholder="Saisissez une adresse"><div class="fast-saved-place-actions"><button id="fastSavedCancel" type="button">Annuler</button><button id="fastSavedSave" type="button" class="save">Enregistrer</button></div></div>`;
  document.body.appendChild(sheet);
  const input=q('fastSavedPlaceInput');setTimeout(()=>input?.focus(),30);
  q('fastSavedCancel').onclick=()=>sheet.remove();
  q('fastSavedSave').onclick=()=>{const value=(input?.value||'').trim();if(!value)return;localStorage.setItem('fast_saved_'+kind,value);sheet.remove();applyQuickDestination(value)};
  sheet.onclick=e=>{if(e.target===sheet)sheet.remove()};
}

function applyQuickDestination(value){
  const input=q('destinationInput');if(!input)return;
  try{input.focus({preventScroll:true})}catch(e){input.focus()}
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
}
window.applyQuickDestination=applyQuickDestination;

function ensureQuickDestinations(){
  const fields=document.querySelector('#passengerArea .route-fields');if(!fields||q('fastQuickDestinations'))return;
  const row=document.createElement('div');row.id='fastQuickDestinations';row.className='fast-quick-destinations';
  row.innerHTML='<button type="button" data-fast-place="home"><span>⌂</span>Maison</button><button type="button" data-fast-place="work"><span>▣</span>Travail</button><button type="button" data-fast-place="airport"><span>✈</span>Aéroport</button>';
  fields.insertAdjacentElement('afterend',row);
  row.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
    const kind=btn.dataset.fastPlace;
    if(kind==='airport')return applyQuickDestination('Aéroport');
    const label=kind==='home'?'Maison':'Travail',saved=localStorage.getItem('fast_saved_'+kind);
    if(saved)applyQuickDestination(saved);else openSavedPlace(kind,label);
  });
}

function routeIsReady(){
  const d=(q('routeDistance')?.textContent||'').trim(),p=(q('priceText')?.textContent||'').trim();
  return (!!d&&!/^—$/.test(d)&&/\d/.test(d))||(/\d/.test(p)&&!/^—$/.test(p));
}
function searchIsActive(){return !!q('bookingState')&&!q('bookingState').classList.contains('hidden')}
function rideIsActive(){return !!q('ridePanel')&&!q('ridePanel').classList.contains('hidden')}

function polishSearchingCard(){
  const box=q('bookingState');if(!box)return;
  const msg=q('bookingMessage');if(msg&&/Recherche|chauffeur|nouvelle/i.test((msg.textContent||'').trim()))msg.textContent='Nous cherchons le meilleur chauffeur pour vous';
  if(!box.querySelector('.fast-search-subtitle')){
    const sub=document.createElement('span');sub.className='fast-search-subtitle';sub.textContent='Merci de patienter…';(msg||box).insertAdjacentElement('afterend',sub);
    const eta=document.createElement('div');eta.className='fast-search-eta';eta.innerHTML='Temps d’attente estimé<strong>2 – 4 min</strong>';box.appendChild(eta);
  }
}

function updateClientState(){
  if(document.body.classList.contains('driver-mode'))return;
  ensureClientPrompt();ensurePickupChoice();ensureQuickDestinations();removePrototypeSignals();
  const ready=routeIsReady(),searching=searchIsActive(),active=rideIsActive();
  if(lastRouteReady!==ready){document.body.classList.toggle('fast-client-route-ready',ready);lastRouteReady=ready}
  if(lastSearching!==searching){document.body.classList.toggle('fast-client-searching',searching);lastSearching=searching}
  document.body.classList.toggle('fast-client-active-ride',active);
  if(searching)polishSearchingCard();
}

function prepareDriverProfile(){
  const page=q('driverProfilePage');if(!page)return;
  if(!q('fastDriverStats')){
    const stats=document.createElement('div');stats.id='fastDriverStats';stats.className='fast-driver-stats';stats.innerHTML='<div><b>—</b><small>Courses</small></div><div><b>—</b><small>Note</small></div><div><b>—</b><small>Acceptation</small></div>';
    page.querySelector('.driver-profile-head')?.insertAdjacentElement('afterend',stats);
  }
  const cards=[...page.querySelectorAll('.driver-profile-card')],docs=cards.find(c=>/Mes documents/i.test(c.textContent||'')),pay=cards.find(c=>/Informations de paiement/i.test(c.textContent||'')),account=cards.find(c=>/Mon compte/i.test(c.textContent||''));
  if(docs&&!docs.id)docs.id='fastDriverDocsCard';if(pay&&!pay.id)pay.id='fastDriverPayoutCard';docs?.classList.add('fast-panel-collapsed');pay?.classList.add('fast-panel-collapsed');
  if(!q('fastDriverMenu')){
    const menu=document.createElement('div');menu.id='fastDriverMenu';menu.className='fast-driver-menu';
    menu.innerHTML='<button type="button" data-open-panel="fastDriverPayoutCard"><span class="ico">▣</span><span><b>Mes revenus</b><small>Informations de paiement</small></span><span class="arrow">›</span></button><button type="button" data-open-panel="fastDriverDocsCard"><span class="ico">▤</span><span><b>Documents</b><small>Suivi de validation</small></span><span class="arrow">›</span></button><button type="button" data-driver-help="1"><span class="ico">?</span><span><b>Aide & support</b><small>Contacter FAST</small></span><span class="arrow">›</span></button>';
    (q('fastDriverStats')||page.querySelector('.driver-profile-head'))?.insertAdjacentElement('afterend',menu);
    menu.querySelectorAll('[data-open-panel]').forEach(b=>b.onclick=()=>{const target=q(b.dataset.openPanel);if(!target)return;const open=target.classList.contains('fast-panel-open');[docs,pay].forEach(c=>c?.classList.remove('fast-panel-open'));if(!open){target.classList.add('fast-panel-open');target.scrollIntoView({behavior:'smooth',block:'start'})}});
    menu.querySelector('[data-driver-help]').onclick=()=>{const email=q('supportEmail')?.textContent?.trim()||'contact@gloire-group.com';try{FASTNative.emailSupport(email)}catch(e){location.href='mailto:'+email}};
  }
  if(account){account.style.marginTop='10px';const logout=account.querySelector('#driverLogoutBtn');if(logout)logout.textContent='Se déconnecter'}
  lastDriverProfilePrepared=true;
}
function updateDriverState(){if(!document.body.classList.contains('driver-mode'))return;removePrototypeSignals();prepareDriverProfile()}

function startResendCooldown(button,seconds){clearInterval(resendCooldownTimer);let remaining=Math.max(1,Math.ceil(Number(seconds)||120));button.disabled=true;const render=()=>{button.textContent=`Nouvel envoi dans ${remaining} s`;remaining-=1;if(remaining<0){clearInterval(resendCooldownTimer);button.disabled=false;button.textContent='Renvoyer l’e-mail de confirmation'}};render();resendCooldownTimer=setInterval(render,1000)}
async function readJson(response){let data={};try{data=await response.json()}catch(e){}return data}
async function requestResendWithMemory(email){
  try{const response=await fetch(API+'/v1/auth/resend-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}),data=await readJson(response);if(response.ok)return data;if(response.status!==404&&response.status<500)throw new Error(data.detail||data.message||'Demande refusée')}catch(e){}
  const response=await fetch(SUPABASE_URL+'/functions/v1/auth-email-memory',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({email})}),data=await readJson(response);if(!response.ok)throw new Error(data.message||data.detail||'L’envoi est momentanément indisponible.');return data;
}
function patchAuthResend(){
  const info=q('fastAuthInfo');if(info)info.innerHTML='<b>E-mails de sécurité FAST</b><br>FAST protège les demandes de confirmation et évite les envois répétés. Vérifiez aussi le dossier spam.';
  const button=q('resendConfirmation');if(!button||button.dataset.fastPythonMemory==='1')return;button.dataset.fastPythonMemory='1';
  button.onclick=async()=>{const email=(q('signupEmail')?.value||q('loginEmail')?.value||'').trim();if(!email)return toast('Entrez votre adresse e-mail');button.disabled=true;button.textContent='Envoi en cours…';try{const data=await requestResendWithMemory(email);toast(data.message||'Demande prise en compte');startResendCooldown(button,data.retry_after_seconds||120)}catch(e){toast(String(e?.message||'L’envoi est momentanément indisponible.'));button.disabled=false;button.textContent='Renvoyer l’e-mail de confirmation'}};
}

function boot(){removePrototypeSignals();updateClientState();updateDriverState();patchAuthResend()}
function scheduleUi(){clearTimeout(uiTimer);uiTimer=setTimeout(boot,90)}
window.addEventListener('load',()=>{boot();setTimeout(boot,350);setTimeout(boot,1000)});
document.addEventListener('click',scheduleUi,true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleUi()});
window.addEventListener('fast:ride-restored',scheduleUi);window.addEventListener('fast:ride-cancelled',scheduleUi);
window.addEventListener('online',scheduleUi);
setInterval(()=>{updateClientState();if(!lastDriverProfilePrepared||document.body.classList.contains('driver-mode'))updateDriverState();patchAuthResend()},3500);
})();