(()=>{
'use strict';
let fastDriverUiReady=false,offersTimer=null;
const d$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function restHeaders(extra={}){return {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json',...extra}}
async function rest(path,opts={}){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{...restHeaders(),...(opts.headers||{})}});let d=null;try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d?.message||d?.hint||('HTTP '+r.status));return d}
function statusLabel(s){return s==='approved'?'Validé':s==='rejected'?'Refusé':'En vérification'}
function statusClass(s){return s==='approved'?'ok':s==='rejected'?'bad':'wait'}
function ensureDriverUi(){
  if(fastDriverUiReady||!d$('mainApp'))return;fastDriverUiReady=true;
  const page=document.createElement('section');page.id='driverProfilePage';page.className='driver-profile-page hidden';page.innerHTML=`
    <div class="driver-profile-head"><div class="driver-avatar">🚘</div><div><small>ESPACE CHAUFFEUR</small><h2 id="driverProfileName">Mon profil FAST</h2><span id="driverVerificationBadge" class="verify-pill wait">Dossier à compléter</span></div></div>
    <div class="driver-profile-card"><div class="section-title"><b>Mes documents</b><small>Validation du dossier chauffeur</small></div><p class="driver-profile-help">Ajoutez des photos ou PDF lisibles. Vos documents restent privés et servent à la validation de votre compte.</p><div id="driverDocumentList" class="driver-doc-list"></div></div>
    <div class="driver-profile-card"><div class="section-title"><b>Informations de paiement</b><small>Pour recevoir vos gains</small></div>
      <label>Mode de paiement<select id="payoutMethod"><option value="mobile_money">Mobile Money</option><option value="bank">Compte bancaire</option></select></label>
      <label>Nom du titulaire<input id="payoutHolder" placeholder="Nom complet"></label>
      <div id="mobileMoneyFields"><label>Opérateur<select id="payoutOperator"><option value="MTN">MTN Mobile Money</option><option value="Airtel">Airtel Money</option><option value="Orange">Orange Money</option></select></label><label>Numéro de paiement<input id="payoutPhone" inputmode="tel" placeholder="06 / 05 / 04..."></label></div>
      <div id="bankFields" class="hidden"><label>Banque<input id="payoutBank" placeholder="Nom de la banque"></label><label>RIB / Numéro de compte<input id="payoutAccount" placeholder="Numéro de compte"></label></div>
      <button id="savePayoutBtn" class="btn">Enregistrer mes informations de paiement</button><p id="payoutStatus" class="driver-profile-help"></p>
    </div>
    <div class="driver-profile-card"><div class="section-title"><b>Mon compte</b><small>Sécurité et assistance</small></div><button id="driverLogoutBtn" class="profile-secondary">Se déconnecter</button></div>`;
  d$('mainApp').appendChild(page);
  const nav=document.createElement('nav');nav.id='driverBottomNav';nav.className='driver-bottom-nav hidden';nav.innerHTML='<button class="on" data-driver-page="home"><span>⌂</span>Accueil</button><button data-driver-page="profile"><span>◉</span>Profil</button>';
  d$('mainApp').appendChild(nav);
  nav.querySelectorAll('button').forEach(b=>b.onclick=()=>showDriverPage(b.dataset.driverPage));
  d$('payoutMethod').onchange=togglePayoutFields;d$('savePayoutBtn').onclick=savePayout;d$('driverLogoutBtn').onclick=()=>logout();
  injectOfferStack();renderDocumentSlots();
}
function showDriverPage(name){
  if(role!=='driver')return;
  const home=d$('driverArea'),profilePage=d$('driverProfilePage');
  if(name==='profile'){home?.classList.add('hidden');profilePage?.classList.remove('hidden');loadDriverProfile()}else{profilePage?.classList.add('hidden');home?.classList.remove('hidden');setTimeout(()=>map&&map.resize(),120);loadOfferStack()}
  d$('driverBottomNav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.driverPage===name));
}
function activateDriverHome(){ensureDriverUi();if(role!=='driver')return;d$('driverBottomNav')?.classList.remove('hidden');d$('clientNav')?.classList.add('hidden');showDriverPage('home');clearInterval(offersTimer);offersTimer=setInterval(loadOfferStack,3000);loadOfferStack()}
function deactivateDriverUi(){d$('driverBottomNav')?.classList.add('hidden');d$('driverProfilePage')?.classList.add('hidden');clearInterval(offersTimer)}
function injectOfferStack(){const old=d$('offerCard');if(!old||d$('driverOffersStack'))return;const wrap=document.createElement('div');wrap.id='driverOffersStack';wrap.className='driver-offers-stack';wrap.innerHTML='<div class="driver-wait-card"><div class="pulse-dot"></div><div><b>Vous êtes prêt</b><small>Les propositions de course apparaîtront ici. Choisissez celle qui vous convient.</small></div></div><div id="driverOffersList"></div>';old.insertAdjacentElement('beforebegin',wrap);old.classList.add('hidden')}
async function loadOfferStack(){
  if(role!=='driver'||!token||!profile?.id)return;
  const list=d$('driverOffersList');if(!list)return;
  try{
    const rows=await rest(`dispatch_offers?select=id,ride_id,distance_km,eta_min,status,expires_at,offered_at&driver_id=eq.${encodeURIComponent(profile.id)}&or=(status.eq.pending,status.eq.offered)&order=offered_at.desc&limit=8`);
    const live=(rows||[]).filter(o=>!o.expires_at||new Date(o.expires_at)>new Date());
    if(!live.length){list.innerHTML='<div class="no-offer"><b>En attente d’une course</b><small>Restez en ligne, vous recevrez les nouvelles propositions ici.</small></div>';return}
    list.innerHTML=live.map(o=>`<article class="driver-offer-choice"><div class="offer-choice-main"><div><small>NOUVELLE COURSE</small><b>${Number(o.distance_km||0).toFixed(1)} km du passager</b><span>Arrivée estimée en ${Number(o.eta_min||0)} min</span></div><div class="offer-choice-eta">${Number(o.eta_min||0)}<small>min</small></div></div><div class="offer-choice-actions"><button data-refuse="${esc(o.id)}">Ignorer</button><button class="accept" data-accept="${esc(o.id)}">Choisir cette course</button></div></article>`).join('');
    list.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>respondStackOffer(b.dataset.accept,true));list.querySelectorAll('[data-refuse]').forEach(b=>b.onclick=()=>respondStackOffer(b.dataset.refuse,false));
  }catch(e){try{if(typeof loadOffer==='function')loadOffer()}catch(_){} list.innerHTML='<div class="no-offer"><b>En attente d’une course</b><small>Connexion au dispatch FAST…</small></div>'}
}
async function respondStackOffer(id,accept){try{const d=await api('/v1/driver/offers/'+id+'/respond',{method:'POST',body:JSON.stringify({accept})});toast(accept?'Course sélectionnée':'Proposition ignorée');if(accept){currentRideId=d.ride_id;d$('driverTrip')?.classList.remove('hidden');clearInterval(offersTimer);if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}loadOfferStack()}catch(e){toast(e.message)}}
const docTypes=[['identity','Pièce d’identité'],['license','Permis de conduire'],['vehicle_registration','Carte grise'],['insurance','Assurance véhicule'],['driver_photo','Photo chauffeur'],['address_proof','Justificatif de domicile']];
function renderDocumentSlots(){const box=d$('driverDocumentList');if(!box)return;box.innerHTML=docTypes.map(([k,l])=>`<div class="driver-doc-row" data-doc="${k}"><div><b>${l}</b><small id="docStatus_${k}">À ajouter</small></div><label class="doc-upload-btn">Ajouter<input type="file" accept="image/*,.pdf" data-doc-input="${k}" hidden></label></div>`).join('');box.querySelectorAll('[data-doc-input]').forEach(i=>i.onchange=()=>uploadDriverDocument(i.dataset.docInput,i.files?.[0]))}
async function uploadDriverDocument(type,file){if(!file||!profile?.id)return;const status=d$('docStatus_'+type);status.textContent='Envoi…';try{const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');const path=profile.id+'/'+type+'_'+Date.now()+'_'+safe;const r=await fetch(SUPABASE_URL+'/storage/v1/object/driver-documents/'+path,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},body:file});if(!r.ok)throw new Error('Envoi du document impossible');await rest('driver_documents',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({driver_id:profile.id,document_type:type,storage_path:path,file_name:file.name,status:'pending'})});status.textContent='En vérification';status.className='doc-wait';toast('Document envoyé pour validation');await loadDocuments()}catch(e){status.textContent='Échec de l’envoi';toast(e.message)}}
async function loadDocuments(){try{const docs=await rest(`driver_documents?select=id,document_type,file_name,status,rejection_reason,created_at&driver_id=eq.${encodeURIComponent(profile.id)}&order=created_at.desc`);docTypes.forEach(([k])=>{const d=(docs||[]).find(x=>x.document_type===k),el=d$('docStatus_'+k);if(!el)return;if(!d){el.textContent='À ajouter';el.className='';return}el.textContent=statusLabel(d.status)+(d.status==='rejected'&&d.rejection_reason?' • '+d.rejection_reason:'');el.className='doc-'+statusClass(d.status)});const approved=(docs||[]).filter(x=>x.status==='approved').length,badge=d$('driverVerificationBadge');if(badge){badge.textContent=approved>=4?'Dossier presque complet':(docs||[]).length?'Dossier en vérification':'Dossier à compléter';badge.className='verify-pill '+(approved>=4?'ok':'wait')}}catch(e){}}
function togglePayoutFields(){const bank=d$('payoutMethod')?.value==='bank';d$('bankFields')?.classList.toggle('hidden',!bank);d$('mobileMoneyFields')?.classList.toggle('hidden',bank)}
async function loadPayout(){try{const rows=await rest(`driver_payout_profiles?select=*&driver_id=eq.${encodeURIComponent(profile.id)}&limit=1`),p=rows?.[0];if(!p)return;d$('payoutMethod').value=p.payout_method||'mobile_money';d$('payoutHolder').value=p.account_holder||'';d$('payoutPhone').value=p.phone_number||'';d$('payoutOperator').value=p.mobile_operator||'MTN';d$('payoutBank').value=p.bank_name||'';d$('payoutAccount').value=p.iban_or_account||'';togglePayoutFields();d$('payoutStatus').textContent=p.is_complete?'Informations de paiement enregistrées.':'Informations à compléter.'}catch(e){}}
async function savePayout(){const method=d$('payoutMethod').value,holder=d$('payoutHolder').value.trim(),phone=d$('payoutPhone').value.trim(),operator=d$('payoutOperator').value,bank=d$('payoutBank').value.trim(),account=d$('payoutAccount').value.trim(),complete=!!holder&&(method==='mobile_money'?!!phone:!!(bank&&account));if(!complete)return toast('Complétez les informations de paiement');const btn=d$('savePayoutBtn');btn.disabled=true;btn.textContent='Enregistrement…';try{await rest('driver_payout_profiles?on_conflict=driver_id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify({driver_id:profile.id,payout_method:method,account_holder:holder,phone_number:phone||null,mobile_operator:method==='mobile_money'?operator:null,bank_name:method==='bank'?bank:null,iban_or_account:method==='bank'?account:null,is_complete:true,updated_at:new Date().toISOString()})});d$('payoutStatus').textContent='Informations de paiement enregistrées.';toast('Paiement configuré')}catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='Enregistrer mes informations de paiement'}}
async function loadDriverProfile(){if(!profile?.id)return;d$('driverProfileName').textContent=((profile.first_name||'')+' '+(profile.last_name||'')).trim()||'Mon profil FAST';await Promise.allSettled([loadDocuments(),loadPayout()])}
window.addEventListener('load',()=>{ensureDriverUi();setTimeout(()=>{if(role==='driver')activateDriverHome()},800)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&role==='driver')activateDriverHome()});
const watch=setInterval(()=>{if(!d$('mainApp'))return;if(role==='driver'){ensureDriverUi();activateDriverHome()}else deactivateDriverUi()},2500);
})();