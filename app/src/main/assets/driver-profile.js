(()=>{
'use strict';
let fastDriverUiReady=false,offersTimer=null,currentDriverPage='home',driverMarket=null,driverCountryCode=null;
const d$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function restHeaders(extra={}){return {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json',...extra}}
async function rest(path,opts={}){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{...restHeaders(),...(opts.headers||{})}});let d=null;try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d?.message||d?.hint||('HTTP '+r.status));return d}
function statusLabel(s){return s==='approved'?'Validé':s==='rejected'?'Refusé':'En vérification'}
function statusClass(s){return s==='approved'?'ok':s==='rejected'?'bad':'wait'}
const docLabels={identity:'Pièce d’identité',license:'Permis de conduire',vehicle_registration:'Carte grise / certificat d’immatriculation',insurance:'Assurance véhicule',driver_photo:'Photo chauffeur',address_proof:'Justificatif de domicile',taxi_license:'Licence / autorisation VTC',criminal_record:'Extrait de casier judiciaire',medical_certificate:'Certificat médical'};
const defaultDocKeys=['identity','license','vehicle_registration','insurance','driver_photo','address_proof'];

function ensureDriverUi(){
  if(fastDriverUiReady||!d$('mainApp'))return;fastDriverUiReady=true;
  const page=document.createElement('section');page.id='driverProfilePage';page.className='driver-profile-page hidden';page.innerHTML=`
    <div class="driver-profile-head"><div class="driver-avatar">🚘</div><div><small>ESPACE CHAUFFEUR</small><h2 id="driverProfileName">Mon profil FAST</h2><span id="driverVerificationBadge" class="verify-pill wait">Dossier à compléter</span></div></div>
    <div class="driver-profile-card"><div class="section-title"><b>Mes documents</b><small id="driverDocCountry">Validation du dossier chauffeur</small></div><p class="driver-profile-help">Ajoutez des photos ou PDF lisibles. Chaque fichier est enregistré dans l’espace privé FAST et accessible uniquement à vous et à l’administration autorisée.</p><div id="driverDocumentList" class="driver-doc-list"></div></div>
    <div class="driver-profile-card"><div class="section-title"><b>Informations de paiement</b><small id="driverPayoutCountry">Pour recevoir vos gains</small></div>
      <label>Mode de paiement<select id="payoutMethod"></select></label>
      <label>Nom du titulaire<input id="payoutHolder" placeholder="Nom complet"></label>
      <div id="mobileMoneyFields"><label>Opérateur<select id="payoutOperator"></select></label><label>Numéro de paiement<input id="payoutPhone" inputmode="tel" placeholder="Numéro avec indicatif pays"></label></div>
      <div id="bankFields" class="hidden"><label>Banque<input id="payoutBank" placeholder="Nom de la banque"></label><label>IBAN / Numéro de compte<input id="payoutAccount" placeholder="IBAN ou numéro de compte"></label><label>BIC / SWIFT<input id="payoutSwift" placeholder="BIC / SWIFT"></label></div>
      <div class="two"><label>Pays<input id="payoutCountry" maxlength="2" placeholder="FR"></label><label>Devise<input id="payoutCurrency" maxlength="3" placeholder="EUR"></label></div>
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
  currentDriverPage=name==='profile'?'profile':'home';
  const home=d$('driverArea'),profilePage=d$('driverProfilePage');
  if(currentDriverPage==='profile'){
    home?.classList.add('hidden');profilePage?.classList.remove('hidden');loadDriverProfile();
  }else{
    profilePage?.classList.add('hidden');home?.classList.remove('hidden');setTimeout(()=>map&&map.resize(),120);loadOfferStack();
  }
  d$('driverBottomNav')?.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.driverPage===currentDriverPage));
}
function activateDriverHome(forceHome=false){
  ensureDriverUi();if(role!=='driver')return;
  d$('driverBottomNav')?.classList.remove('hidden');d$('clientNav')?.classList.add('hidden');
  const profileVisible=d$('driverProfilePage')&&!d$('driverProfilePage').classList.contains('hidden');
  if(forceHome||(!profileVisible&&currentDriverPage!=='profile'))showDriverPage('home');
  else if(currentDriverPage==='profile')showDriverPage('profile');
  clearInterval(offersTimer);offersTimer=setInterval(()=>{if(currentDriverPage==='home')loadOfferStack()},3000);
  if(currentDriverPage==='home')loadOfferStack();
}
function deactivateDriverUi(){d$('driverBottomNav')?.classList.add('hidden');d$('driverProfilePage')?.classList.add('hidden');clearInterval(offersTimer);currentDriverPage='home'}
function injectOfferStack(){const old=d$('offerCard');if(!old||d$('driverOffersStack'))return;const wrap=document.createElement('div');wrap.id='driverOffersStack';wrap.className='driver-offers-stack';wrap.innerHTML='<div class="driver-wait-card"><div class="pulse-dot"></div><div><b>Vous êtes prêt</b><small>Les propositions de course apparaîtront ici. Choisissez celle qui vous convient.</small></div></div><div id="driverOffersList"></div>';old.insertAdjacentElement('beforebegin',wrap);old.classList.add('hidden')}
async function loadOfferStack(){
  if(role!=='driver'||currentDriverPage!=='home'||!token||!profile?.id)return;
  const list=d$('driverOffersList');if(!list)return;
  try{
    const rows=await rest(`dispatch_offers?select=id,ride_id,distance_km,eta_min,status,expires_at,offered_at&driver_id=eq.${encodeURIComponent(profile.id)}&or=(status.eq.pending,status.eq.offered)&order=offered_at.desc&limit=8`);
    const live=(rows||[]).filter(o=>!o.expires_at||new Date(o.expires_at)>new Date());
    if(!live.length){list.innerHTML='<div class="no-offer"><b>En attente d’une course</b><small>Restez en ligne, vous recevrez les nouvelles propositions ici.</small></div>';return}
    list.innerHTML=live.map(o=>`<article class="driver-offer-choice"><div class="offer-choice-main"><div><small>NOUVELLE COURSE</small><b>${Number(o.distance_km||0).toFixed(1)} km du passager</b><span>Arrivée estimée en ${Number(o.eta_min||0)} min</span></div><div class="offer-choice-eta">${Number(o.eta_min||0)}<small>min</small></div></div><div class="offer-choice-actions"><button data-refuse="${esc(o.id)}">Ignorer</button><button class="accept" data-accept="${esc(o.id)}">Choisir cette course</button></div></article>`).join('');
    list.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>respondStackOffer(b.dataset.accept,true));list.querySelectorAll('[data-refuse]').forEach(b=>b.onclick=()=>respondStackOffer(b.dataset.refuse,false));
  }catch(e){try{if(typeof loadOffer==='function')loadOffer()}catch(_){} list.innerHTML='<div class="no-offer"><b>En attente d’une course</b><small>Connexion à FAST…</small></div>'}
}
async function respondStackOffer(id,accept){try{const d=await api('/v1/driver/offers/'+id+'/respond',{method:'POST',body:JSON.stringify({accept})});toast(accept?'Course sélectionnée':'Proposition ignorée');if(accept){currentRideId=d.ride_id;d$('driverTrip')?.classList.remove('hidden');clearInterval(offersTimer);if(typeof startDriverNavigationPolling==='function')startDriverNavigationPolling()}loadOfferStack()}catch(e){toast(e.message)}}

async function loadDriverMarket(){
  if(!profile?.id)return null;
  try{
    const locs=await rest(`driver_locations?select=country_code,country_name,latitude,longitude&driver_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
    const loc=locs?.[0];driverCountryCode=(loc?.country_code||profile.country_code||'').toUpperCase()||null;
    let market=null;
    if(driverCountryCode){const rows=await rest(`market_configs?select=*&country_code=eq.${encodeURIComponent(driverCountryCode)}&enabled=eq.true&limit=1`);market=rows?.[0]||null}
    if(!market&&loc?.latitude!=null&&loc?.longitude!=null){try{const m=await api(`/v1/market?lat=${encodeURIComponent(loc.latitude)}&lng=${encodeURIComponent(loc.longitude)}`);market=m.market;driverCountryCode=m.country?.country_code||driverCountryCode}catch(e){}}
    driverMarket=market||{country_code:driverCountryCode||'ZZ',country_name:loc?.country_name||'International',currency:'USD',payout_methods:['bank'],mobile_money_operators:[],document_requirements:defaultDocKeys};
    driverCountryCode=driverMarket.country_code||driverCountryCode||'ZZ';
    if(d$('driverDocCountry'))d$('driverDocCountry').textContent=`Documents requis • ${driverMarket.country_name||driverCountryCode}`;
    if(d$('driverPayoutCountry'))d$('driverPayoutCountry').textContent=`Versements • ${driverMarket.country_name||driverCountryCode} • ${driverMarket.currency||'USD'}`;
    configurePayoutUi();renderDocumentSlots();
    return driverMarket;
  }catch(e){driverMarket=driverMarket||{country_code:driverCountryCode||'ZZ',country_name:'International',currency:'USD',payout_methods:['bank'],mobile_money_operators:[],document_requirements:defaultDocKeys};configurePayoutUi();renderDocumentSlots();return driverMarket}
}
function configurePayoutUi(){
  const m=driverMarket||{},methods=(m.payout_methods&&m.payout_methods.length?m.payout_methods:['bank']);
  const method=d$('payoutMethod');if(method){const prev=method.value;method.innerHTML=methods.map(x=>`<option value="${esc(x)}">${x==='mobile_money'?'Mobile Money':x==='bank'?'Compte bancaire':esc(x)}</option>`).join('');if(methods.includes(prev))method.value=prev}
  const ops=m.mobile_money_operators||[];const op=d$('payoutOperator');if(op){op.innerHTML=ops.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')||'<option value="">Opérateur non configuré</option>'}
  if(d$('payoutCountry'))d$('payoutCountry').value=driverCountryCode||m.country_code||'';
  if(d$('payoutCurrency'))d$('payoutCurrency').value=m.currency||'USD';
  togglePayoutFields();
}
function documentKeys(){const req=driverMarket?.document_requirements;return Array.isArray(req)&&req.length?req:defaultDocKeys}
function renderDocumentSlots(){const box=d$('driverDocumentList');if(!box)return;box.innerHTML=documentKeys().map(k=>`<div class="driver-doc-row" data-doc="${esc(k)}"><div><b>${esc(docLabels[k]||k)}</b><small id="docStatus_${esc(k)}">À ajouter</small><label style="display:block;margin-top:7px;font-size:11px;color:#667085">Expiration (si applicable)<input id="docExpiry_${esc(k)}" type="date" style="margin-top:4px"></label></div><label class="doc-upload-btn">Ajouter<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" data-doc-input="${esc(k)}" hidden></label></div>`).join('');box.querySelectorAll('[data-doc-input]').forEach(i=>i.onchange=()=>uploadDriverDocument(i.dataset.docInput,i.files?.[0]))}
async function uploadDriverDocument(type,file){
  if(!file||!profile?.id)return;const status=d$('docStatus_'+type);status.textContent='Envoi…';
  if(file.size>12*1024*1024){status.textContent='Fichier trop volumineux';return toast('Maximum 12 Mo par document')}
  const allowed=['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'];if(file.type&&!allowed.includes(file.type)){status.textContent='Format non accepté';return toast('Format non accepté')}
  try{
    if(!driverMarket)await loadDriverMarket();
    const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_'),path=profile.id+'/'+type+'_'+Date.now()+'_'+safe;
    const r=await fetch(SUPABASE_URL+'/storage/v1/object/driver-documents/'+path,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':file.type||'application/octet-stream','x-upsert':'true'},body:file});if(!r.ok)throw new Error('Envoi du document impossible');
    const expiry=d$('docExpiry_'+type)?.value||null;
    await rest('driver_documents',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({driver_id:profile.id,document_type:type,storage_path:path,file_name:file.name,status:'pending',country_code:driverCountryCode||driverMarket?.country_code||null,mime_type:file.type||null,file_size_bytes:file.size||null,expires_at:expiry})});
    status.textContent='En vérification';status.className='doc-wait';toast('Document enregistré et envoyé pour validation');await loadDocuments();
  }catch(e){status.textContent='Échec de l’envoi';toast(e.message)}
}
async function loadDocuments(){try{const docs=await rest(`driver_documents?select=id,document_type,file_name,status,rejection_reason,created_at,expires_at,country_code&driver_id=eq.${encodeURIComponent(profile.id)}&order=created_at.desc`);documentKeys().forEach(k=>{const doc=(docs||[]).find(x=>x.document_type===k),el=d$('docStatus_'+k);if(!el)return;if(!doc){el.textContent='À ajouter';el.className='';return}const exp=doc.expires_at?` • expire le ${new Date(doc.expires_at+'T00:00:00').toLocaleDateString('fr-FR')}`:'';el.textContent=statusLabel(doc.status)+(doc.status==='rejected'&&doc.rejection_reason?' • '+doc.rejection_reason:'')+exp;el.className='doc-'+statusClass(doc.status);const expiry=d$('docExpiry_'+k);if(expiry&&doc.expires_at)expiry.value=doc.expires_at});const required=documentKeys().length,approvedKeys=new Set((docs||[]).filter(x=>x.status==='approved'&&documentKeys().includes(x.document_type)).map(x=>x.document_type)),badge=d$('driverVerificationBadge');if(badge){badge.textContent=approvedKeys.size>=required&&required>0?'Dossier complet':(docs||[]).length?`${approvedKeys.size}/${required} document(s) validé(s)`:'Dossier à compléter';badge.className='verify-pill '+(approvedKeys.size>=required&&required>0?'ok':'wait')}}catch(e){}}
function togglePayoutFields(){const bank=d$('payoutMethod')?.value==='bank';d$('bankFields')?.classList.toggle('hidden',!bank);d$('mobileMoneyFields')?.classList.toggle('hidden',bank)}
async function loadPayout(){try{const rows=await rest(`driver_payout_profiles?select=*&driver_id=eq.${encodeURIComponent(profile.id)}&limit=1`),p=rows?.[0];if(!p){configurePayoutUi();return}const method=d$('payoutMethod');if(method&&[...method.options].some(o=>o.value===p.payout_method))method.value=p.payout_method||'bank';d$('payoutHolder').value=p.account_holder||'';d$('payoutPhone').value=p.phone_number||'';if(p.mobile_operator&&d$('payoutOperator')&&[...d$('payoutOperator').options].some(o=>o.value===p.mobile_operator))d$('payoutOperator').value=p.mobile_operator;d$('payoutBank').value=p.bank_name||'';d$('payoutAccount').value=p.iban_or_account||'';d$('payoutSwift').value=p.bank_bic_swift||'';d$('payoutCountry').value=p.country_code||driverCountryCode||'';d$('payoutCurrency').value=p.payout_currency||driverMarket?.currency||'';togglePayoutFields();d$('payoutStatus').textContent=p.payout_status==='verified'?'Informations de paiement vérifiées par FAST.':p.is_complete?'Informations enregistrées • vérification en attente.':'Informations à compléter.'}catch(e){}}
async function savePayout(){
  const method=d$('payoutMethod').value,holder=d$('payoutHolder').value.trim(),phone=d$('payoutPhone').value.trim(),operator=d$('payoutOperator').value,bank=d$('payoutBank').value.trim(),account=d$('payoutAccount').value.trim(),swift=d$('payoutSwift').value.trim(),country=(d$('payoutCountry').value.trim()||driverCountryCode||'').toUpperCase(),currency=(d$('payoutCurrency').value.trim()||driverMarket?.currency||'USD').toUpperCase();
  const complete=!!holder&&(method==='mobile_money'?!!(phone&&operator):!!(bank&&account));if(!complete)return toast('Complétez les informations de paiement');if(country.length!==2)return toast('Code pays invalide');if(currency.length!==3)return toast('Devise invalide');
  const btn=d$('savePayoutBtn');btn.disabled=true;btn.textContent='Enregistrement…';
  try{await rest('driver_payout_profiles?on_conflict=driver_id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify({driver_id:profile.id,payout_method:method,account_holder:holder,phone_number:method==='mobile_money'?phone:null,mobile_operator:method==='mobile_money'?operator:null,bank_name:method==='bank'?bank:null,iban_or_account:method==='bank'?account:null,bank_bic_swift:method==='bank'?(swift||null):null,country_code:country,payout_currency:currency,is_complete:true,payout_status:'pending',verified_at:null,reviewed_by:null,updated_at:new Date().toISOString()})});d$('payoutStatus').textContent='Informations enregistrées • vérification FAST en attente.';toast('Paiement configuré')}catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='Enregistrer mes informations de paiement'}
}
async function loadDriverProfile(){if(!profile?.id)return;d$('driverProfileName').textContent=((profile.first_name||'')+' '+(profile.last_name||'')).trim()||'Mon profil FAST';await loadDriverMarket();await Promise.allSettled([loadDocuments(),loadPayout()])}
window.addEventListener('load',()=>{ensureDriverUi();setTimeout(()=>{if(role==='driver')activateDriverHome(true)},800)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&role==='driver')activateDriverHome(false)});
const watch=setInterval(()=>{if(!d$('mainApp'))return;if(role==='driver'){ensureDriverUi();activateDriverHome(false)}else deactivateDriverUi()},2500);
})();
