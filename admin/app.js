const SUPABASE_URL='https://hmwxwzfcpdvgzjgxruup.supabase.co';
const SUPABASE_KEY='sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>v?new Date(v).toLocaleString('fr-FR'):'—';
const money=(v,c='XAF')=>{try{return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c,maximumFractionDigits:['XAF','XOF','JPY'].includes(c)?0:2}).format(Number(v||0))}catch(e){return `${Number(v||0).toLocaleString('fr-FR')} ${c}`}};
const toast=m=>{const t=$('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2600)};
const modal=(title,html)=>{$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.remove('hidden')};
const closeModal=()=>$('modal').classList.add('hidden');
let user=null,currentPage='dashboard';
const state={profiles:[],drivers:[],locations:[],vehicles:[],documents:[],payouts:[],rides:[],payments:[],markets:[],pricing:[]};

function fullName(id){const p=state.profiles.find(x=>x.id===id);return p?`${p.first_name||''} ${p.last_name||''}`.trim()||id.slice(0,8):id?String(id).slice(0,8):'—'}
function profile(id){return state.profiles.find(x=>x.id===id)||null}
function countryName(code){return state.markets.find(x=>x.country_code===code)?.country_name||code||'—'}
function pill(text,kind=''){return `<span class="pill ${kind}">${esc(text)}</span>`}
function statusKind(s){return ['paid','approved','completed','available','verified'].includes(s)?'ok':['failed','rejected','cancelled'].includes(s)?'bad':['pending','searching','authorized','driver_arriving','in_progress'].includes(s)?'warn':'blue'}
function pageTitle(p){return({dashboard:'Tableau de bord',drivers:'Chauffeurs',clients:'Clients',documents:'Documents chauffeurs',payments:'Paiements clients',payouts:'Paie chauffeurs',rides:'Courses',markets:'Pays, paiements & tarifs'})[p]||'FAST N°1'}

async function checkAdmin(){
  const {data:{user:u}}=await sb.auth.getUser();
  if(!u)return false;
  const {data,error}=await sb.from('profiles').select('id,role,first_name,last_name').eq('id',u.id).maybeSingle();
  if(error||!data||String(data.role)!=='admin')return false;
  user=u;$('adminIdentity').textContent=`${data.first_name||''} ${data.last_name||''}`.trim()||u.email||'Administrateur FAST';return true;
}
async function openAdmin(){
  if(!await checkAdmin()){
    await sb.auth.signOut();
    $('loginView').classList.remove('hidden');$('adminView').classList.add('hidden');
    $('loginError').textContent='Ce compte n’est pas autorisé comme administrateur FAST.';return;
  }
  $('loginView').classList.add('hidden');$('adminView').classList.remove('hidden');
  await refreshAll();
}
async function login(){
  $('loginError').textContent='';$('loginBtn').disabled=true;$('loginBtn').textContent='Connexion…';
  try{
    const {error}=await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
    if(error)throw error;await openAdmin();
  }catch(e){$('loginError').textContent=e.message||'Connexion impossible'}finally{$('loginBtn').disabled=false;$('loginBtn').textContent='Se connecter'}
}
async function logout(){await sb.auth.signOut();location.reload()}

async function q(table,select='*'){
  const {data,error}=await sb.from(table).select(select).limit(5000);
  if(error)throw new Error(`${table}: ${error.message}`);return data||[];
}
async function refreshAll(){
  $('refreshBtn').disabled=true;$('refreshBtn').textContent='Actualisation…';
  try{
    const [profiles,drivers,locations,vehicles,documents,payouts,rides,payments,markets,pricing]=await Promise.all([
      q('profiles','id,role,first_name,last_name,phone,country_code,created_at'),
      q('drivers','user_id,status,is_verified,rating,total_rides,created_at,updated_at'),
      q('driver_locations','driver_id,country_code,country_name,latitude,longitude,updated_at'),
      q('vehicles','id,driver_id,make,model,color,plate_number,seats,is_active,vehicle_type,created_at'),
      q('driver_documents','id,driver_id,document_type,storage_path,file_name,status,rejection_reason,country_code,mime_type,file_size_bytes,expires_at,created_at,reviewed_at,reviewed_by'),
      q('driver_payout_profiles','driver_id,payout_method,account_holder,phone_number,mobile_operator,bank_name,iban_or_account,bank_bic_swift,country_code,payout_currency,is_complete,payout_status,verified_at,updated_at'),
      q('rides','id,client_id,driver_id,status,pickup_address,destination_address,estimated_price,final_price,currency,payment_method,pickup_country_code,pickup_country_name,requested_at,created_at'),
      q('payments','id,ride_id,user_id,method_type,provider,provider_reference,amount,currency,status,failure_reason,created_at,paid_at'),
      q('market_configs','country_code,country_name,currency,locale,enabled,payment_methods,payout_methods,mobile_money_operators,document_requirements,updated_at'),
      q('market_pricing','id,country_code,service_type,base_fare,per_km,per_minute,minimum_fare,booking_fee,currency,is_active,updated_at')
    ]);
    Object.assign(state,{profiles,drivers,locations,vehicles,documents,payouts,rides,payments,markets,pricing});
    renderAll();toast('Données actualisées');
  }catch(e){toast(e.message)}finally{$('refreshBtn').disabled=false;$('refreshBtn').textContent='Actualiser'}
}

function renderAll(){
  renderDashboard();renderDrivers();renderClients();renderDocuments();renderPayments();renderPayouts();renderRides();renderMarkets();fillCountryFilter();
  $('pendingDocBadge').textContent=state.documents.filter(d=>d.status==='pending').length;
}
function renderDashboard(){
  const clients=state.profiles.filter(p=>String(p.role)==='client').length;
  const drivers=state.drivers.length,verified=state.drivers.filter(d=>d.is_verified).length;
  const active=state.rides.filter(r=>['searching','accepted','driver_arriving','in_progress'].includes(r.status)).length;
  const completed=state.rides.filter(r=>r.status==='completed').length;
  const pendingDocs=state.documents.filter(d=>d.status==='pending').length;
  const pendingPayouts=state.payouts.filter(p=>p.payout_status!=='verified').length;
  $('stats').innerHTML=[['Clients',clients,'Comptes passagers'],['Chauffeurs',drivers,`${verified} vérifiés`],['Courses actives',active,`${completed} terminées`],['Documents à contrôler',pendingDocs,`${pendingPayouts} dossiers de paie à vérifier`]].map(([a,b,c])=>`<div class="stat"><small>${a}</small><b>${b}</b><span>${c}</span></div>`).join('');
  const rr=[...state.rides].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,7);
  $('recentRides').innerHTML='<div class="mini-list">'+rr.map(r=>`<div class="mini-item"><div><b>${esc(r.pickup_address||'Départ')} → ${esc(r.destination_address||'Destination')}</b><small>${esc(fullName(r.client_id))} • ${fmtDate(r.created_at)}</small></div>${pill(r.status,statusKind(r.status))}</div>`).join('')+'</div>';
  const dd=[...state.documents].filter(d=>d.status==='pending').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,7);
  $('recentDocs').innerHTML=dd.length?'<div class="mini-list">'+dd.map(d=>`<div class="mini-item"><div><b>${esc(fullName(d.driver_id))}</b><small>${esc(d.document_type)} • ${fmtDate(d.created_at)}</small></div>${pill('À vérifier','warn')}</div>`).join('')+'</div>':'<span class="muted">Aucun document en attente.</span>';
  const rev={};state.payments.filter(p=>p.status==='paid').forEach(p=>rev[p.currency]=(rev[p.currency]||0)+Number(p.amount||0));
  $('revenueByCurrency').innerHTML=Object.keys(rev).length?Object.entries(rev).map(([c,v])=>`<div class="revenue-card"><small>${esc(c)}</small><b>${money(v,c)}</b></div>`).join(''):'<span class="muted">Aucun paiement encaissé pour le moment.</span>';
}

function fillCountryFilter(){const s=$('driverCountryFilter'),cur=s.value;const codes=[...new Set(state.locations.map(x=>x.country_code).filter(Boolean))].sort();s.innerHTML='<option value="">Tous les pays</option>'+codes.map(c=>`<option value="${esc(c)}">${esc(countryName(c))} (${esc(c)})</option>`).join('');s.value=cur}
function renderDrivers(){
  const term=($('driverSearch')?.value||'').toLowerCase(),cc=$('driverCountryFilter')?.value||'';
  const rows=state.drivers.filter(d=>{const p=profile(d.user_id),loc=state.locations.find(x=>x.driver_id===d.user_id);const hay=`${p?.first_name||''} ${p?.last_name||''} ${p?.phone||''}`.toLowerCase();return(!term||hay.includes(term))&&(!cc||loc?.country_code===cc)});
  $('driversBody').innerHTML=rows.map(d=>{const p=profile(d.user_id),loc=state.locations.find(x=>x.driver_id===d.user_id),pay=state.payouts.find(x=>x.driver_id===d.user_id);return `<tr><td><span class="name">${esc(fullName(d.user_id))}</span><span class="sub">${esc(p?.phone||d.user_id)}</span></td><td>${esc(loc?.country_name||countryName(loc?.country_code||p?.country_code))}</td><td>${pill(d.status,statusKind(d.status))}</td><td>${d.is_verified?pill('Validé','ok'):pill('À valider','warn')}</td><td>⭐ ${Number(d.rating||0).toFixed(1)}</td><td>${Number(d.total_rides||0)}</td><td>${pay?.is_complete?pill(pay.payout_status||'configuré',pay.payout_status==='verified'?'ok':'warn'):pill('À compléter','bad')}</td><td><div class="row-actions"><button data-driver-verify="${d.user_id}" data-value="${!d.is_verified}">${d.is_verified?'Suspendre validation':'Valider chauffeur'}</button></div></td></tr>`}).join('');
  document.querySelectorAll('[data-driver-verify]').forEach(b=>b.onclick=()=>setDriverVerified(b.dataset.driverVerify,b.dataset.value==='true'));
}
async function setDriverVerified(id,value){const {error}=await sb.from('drivers').update({is_verified:value,updated_at:new Date().toISOString()}).eq('user_id',id);if(error)return toast(error.message);toast(value?'Chauffeur validé':'Validation retirée');await refreshAll()}

function renderClients(){
  const term=($('clientSearch')?.value||'').toLowerCase();
  const clients=state.profiles.filter(p=>String(p.role)==='client').filter(p=>!term||`${p.first_name||''} ${p.last_name||''} ${p.phone||''}`.toLowerCase().includes(term));
  $('clientsBody').innerHTML=clients.map(p=>{const rides=state.rides.filter(r=>r.client_id===p.id),paid=state.payments.filter(x=>x.user_id===p.id&&x.status==='paid');const by={};paid.forEach(x=>by[x.currency]=(by[x.currency]||0)+Number(x.amount||0));const spend=Object.entries(by).map(([c,v])=>money(v,c)).join(' • ')||'—';return `<tr><td><span class="name">${esc(fullName(p.id))}</span><span class="sub">${esc(p.id)}</span></td><td>${esc(p.phone||'—')}</td><td>${esc(countryName(p.country_code))}</td><td>${fmtDate(p.created_at)}</td><td>${rides.length}</td><td>${esc(spend)}</td></tr>`}).join('')
}

function renderDocuments(){
  const f=$('docStatusFilter')?.value??'pending';let docs=[...state.documents].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));if(f)docs=docs.filter(d=>d.status===f);
  $('documentsBody').innerHTML=docs.map(d=>`<tr><td><span class="name">${esc(fullName(d.driver_id))}</span></td><td>${esc(d.document_type)}</td><td>${esc(d.file_name)}${d.file_size_bytes?`<span class="sub">${Math.round(Number(d.file_size_bytes)/1024)} Ko</span>`:''}</td><td>${esc(countryName(d.country_code)||'—')}</td><td>${pill(d.status,statusKind(d.status))}${d.rejection_reason?`<span class="sub">${esc(d.rejection_reason)}</span>`:''}</td><td>${fmtDate(d.created_at)}</td><td><div class="row-actions"><button data-doc-open="${d.id}">Ouvrir</button>${d.status!=='approved'?`<button class="approve" data-doc-approve="${d.id}">Valider</button>`:''}${d.status!=='rejected'?`<button class="reject" data-doc-reject="${d.id}">Refuser</button>`:''}</div></td></tr>`).join('');
  document.querySelectorAll('[data-doc-open]').forEach(b=>b.onclick=()=>openDocument(b.dataset.docOpen));document.querySelectorAll('[data-doc-approve]').forEach(b=>b.onclick=()=>reviewDocument(b.dataset.docApprove,'approved'));document.querySelectorAll('[data-doc-reject]').forEach(b=>b.onclick=()=>reviewDocument(b.dataset.docReject,'rejected'));
}
async function openDocument(id){const d=state.documents.find(x=>x.id===id);if(!d)return;const {data,error}=await sb.storage.from('driver-documents').createSignedUrl(d.storage_path,300);if(error)return toast(error.message);const url=data.signedUrl;const img=/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(d.file_name||'');modal(`${fullName(d.driver_id)} • ${d.document_type}`,img?`<img src="${esc(url)}" style="max-width:100%;border-radius:12px">`:`<iframe class="doc-preview" src="${esc(url)}"></iframe><p><a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir dans un nouvel onglet</a></p>`)}
async function reviewDocument(id,status){let reason=null;if(status==='rejected'){reason=prompt('Motif du refus :');if(reason===null)return;if(!reason.trim())return toast('Indiquez le motif du refus')}const patch={status,rejection_reason:status==='rejected'?reason.trim():null,reviewed_at:new Date().toISOString(),reviewed_by:user.id};const {error}=await sb.from('driver_documents').update(patch).eq('id',id);if(error)return toast(error.message);toast(status==='approved'?'Document validé':'Document refusé');await refreshAll()}

function renderPayments(){let rows=[...state.payments].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));const f=$('paymentStatusFilter')?.value||'';if(f)rows=rows.filter(x=>x.status===f);$('paymentsBody').innerHTML=rows.map(p=>`<tr><td>${fmtDate(p.created_at)}</td><td>${esc(fullName(p.user_id))}</td><td>${esc(p.ride_id?.slice(0,8)||'—')}</td><td>${esc(p.provider||p.method_type||'—')}</td><td class="name">${money(p.amount,p.currency)}</td><td>${esc(p.currency)}</td><td>${pill(p.status,statusKind(p.status))}</td><td>${esc(p.provider_reference||'—')}</td></tr>`).join('')}

function renderPayouts(){$('payoutsBody').innerHTML=state.payouts.map(p=>{const details=p.payout_method==='mobile_money'?`${p.mobile_operator||''} ${p.phone_number||''}`:`${p.bank_name||''} ${p.iban_or_account||''} ${p.bank_bic_swift||''}`;return `<tr><td>${esc(fullName(p.driver_id))}</td><td>${esc(countryName(p.country_code))}</td><td>${esc(p.payout_method||'—')}</td><td>${esc(p.account_holder||'—')}</td><td>${esc(details.trim()||'—')}</td><td>${esc(p.payout_currency||'—')}</td><td>${pill(p.payout_status||'pending',p.payout_status==='verified'?'ok':'warn')}</td><td><div class="row-actions">${p.payout_status!=='verified'?`<button class="approve" data-pay-verify="${p.driver_id}">Valider</button>`:`<button data-pay-unverify="${p.driver_id}">Retirer validation</button>`}</div></td></tr>`}).join('');document.querySelectorAll('[data-pay-verify]').forEach(b=>b.onclick=()=>verifyPayout(b.dataset.payVerify,true));document.querySelectorAll('[data-pay-unverify]').forEach(b=>b.onclick=()=>verifyPayout(b.dataset.payUnverify,false))}
async function verifyPayout(id,on){const patch={payout_status:on?'verified':'pending',verified_at:on?new Date().toISOString():null,reviewed_by:on?user.id:null};const {error}=await sb.from('driver_payout_profiles').update(patch).eq('driver_id',id);if(error)return toast(error.message);toast(on?'Coordonnées de paie validées':'Validation retirée');await refreshAll()}

function renderRides(){let rows=[...state.rides].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));const f=$('rideStatusFilter')?.value||'';if(f)rows=rows.filter(r=>r.status===f);$('ridesBody').innerHTML=rows.map(r=>`<tr><td>${fmtDate(r.created_at)}</td><td>${esc(r.pickup_country_name||countryName(r.pickup_country_code))}</td><td>${esc(fullName(r.client_id))}</td><td>${esc(fullName(r.driver_id))}</td><td>${esc(r.pickup_address||'—')}</td><td>${esc(r.destination_address||'—')}</td><td>${money(r.final_price??r.estimated_price,r.currency)}</td><td>${esc(r.payment_method||'—')}</td><td>${pill(r.status,statusKind(r.status))}</td></tr>`).join('')}

function renderMarkets(){
  $('marketsGrid').innerHTML=state.markets.map(m=>`<div class="market-card"><div style="display:flex;justify-content:space-between;gap:10px"><div><h3>${esc(m.country_name)} <small>${esc(m.country_code)}</small></h3><p>${esc(m.currency)} • ${esc(m.locale)}</p></div>${pill(m.enabled?'Actif':'Inactif',m.enabled?'ok':'bad')}</div><div class="methods">${(m.payment_methods||[]).map(x=>pill(x,'blue')).join('')}</div><p>Paie : ${(m.payout_methods||[]).map(esc).join(', ')||'—'}</p><p>Documents : ${(m.document_requirements||[]).length} requis</p><button data-market-edit="${esc(m.country_code)}">Modifier</button></div>`).join('');
  document.querySelectorAll('[data-market-edit]').forEach(b=>b.onclick=()=>editMarket(b.dataset.marketEdit));
  $('pricingBody').innerHTML=state.pricing.map(p=>`<tr><td>${esc(countryName(p.country_code))}</td><td>${esc(p.service_type)}</td><td>${esc(p.base_fare)}</td><td>${esc(p.per_km)}</td><td>${esc(p.per_minute)}</td><td>${esc(p.minimum_fare)}</td><td>${esc(p.booking_fee)}</td><td>${esc(p.currency)}</td><td><div class="row-actions"><button data-price-edit="${p.id}">Modifier</button></div></td></tr>`).join('');
  document.querySelectorAll('[data-price-edit]').forEach(b=>b.onclick=()=>editPricing(b.dataset.priceEdit));
}
function marketForm(m={}){return `<div class="form-grid"><label>Code pays ISO (2 lettres)<input id="mCode" maxlength="2" value="${esc(m.country_code||'')}"></label><label>Nom du pays<input id="mName" value="${esc(m.country_name||'')}"></label><label>Devise<input id="mCurrency" maxlength="3" value="${esc(m.currency||'USD')}"></label><label>Locale<input id="mLocale" value="${esc(m.locale||'fr-FR')}"></label><label class="full">Paiements (séparés par virgule)<input id="mPayments" value="${esc((m.payment_methods||['card','cash','wallet']).join(','))}"></label><label class="full">Modes de paie chauffeur<input id="mPayouts" value="${esc((m.payout_methods||['bank']).join(','))}"></label><label class="full">Opérateurs Mobile Money<input id="mOperators" value="${esc((m.mobile_money_operators||[]).join(','))}"></label><label class="full">Documents requis<input id="mDocs" value="${esc((m.document_requirements||['identity','license','vehicle_registration','insurance','driver_photo','address_proof']).join(','))}"></label><label>Actif<select id="mEnabled"><option value="true" ${m.enabled!==false?'selected':''}>Oui</option><option value="false" ${m.enabled===false?'selected':''}>Non</option></select></label></div><div class="actions"><button onclick="closeModal()">Annuler</button><button id="saveMarketBtn" class="primary">Enregistrer</button></div>`}
function editMarket(code){const m=state.markets.find(x=>x.country_code===code);modal(m?'Modifier le pays':'Ajouter un pays',marketForm(m||{}));$('mCode').disabled=!!m;$('saveMarketBtn').onclick=()=>saveMarket(!!m)}
async function saveMarket(existing){const val=id=>$(id).value.trim(),arr=id=>val(id).split(',').map(x=>x.trim()).filter(Boolean);const row={country_code:val('mCode').toUpperCase(),country_name:val('mName'),currency:val('mCurrency').toUpperCase(),locale:val('mLocale'),enabled:$('mEnabled').value==='true',payment_methods:arr('mPayments'),payout_methods:arr('mPayouts'),mobile_money_operators:arr('mOperators'),document_requirements:arr('mDocs'),updated_at:new Date().toISOString()};if(row.country_code.length!==2||!row.country_name||row.currency.length!==3)return toast('Pays ou devise invalide');const {error}=await sb.from('market_configs').upsert(row,{onConflict:'country_code'});if(error)return toast(error.message);if(!existing){await sb.from('market_pricing').insert({country_code:row.country_code,service_type:'standard',base_fare:0,per_km:0,per_minute:0,minimum_fare:0,booking_fee:0,currency:row.currency,is_active:true})}closeModal();toast('Pays enregistré');await refreshAll()}
function editPricing(id){const p=state.pricing.find(x=>x.id===id);if(!p)return;modal(`Tarif • ${countryName(p.country_code)} • ${p.service_type}`,`<div class="form-grid"><label>Base<input id="prBase" type="number" step="0.01" value="${esc(p.base_fare)}"></label><label>Par km<input id="prKm" type="number" step="0.01" value="${esc(p.per_km)}"></label><label>Par minute<input id="prMin" type="number" step="0.01" value="${esc(p.per_minute)}"></label><label>Minimum<input id="prMinimum" type="number" step="0.01" value="${esc(p.minimum_fare)}"></label><label>Frais réservation<input id="prBooking" type="number" step="0.01" value="${esc(p.booking_fee)}"></label><label>Devise<input id="prCurrency" value="${esc(p.currency)}"></label></div><div class="actions"><button onclick="closeModal()">Annuler</button><button id="savePricingBtn" class="primary">Enregistrer</button></div>`);$('savePricingBtn').onclick=async()=>{const patch={base_fare:Number($('prBase').value),per_km:Number($('prKm').value),per_minute:Number($('prMin').value),minimum_fare:Number($('prMinimum').value),booking_fee:Number($('prBooking').value),currency:$('prCurrency').value.trim().toUpperCase(),updated_at:new Date().toISOString()};const {error}=await sb.from('market_pricing').update(patch).eq('id',id);if(error)return toast(error.message);closeModal();toast('Tarif mis à jour');await refreshAll()}}

function exportRows(){
  switch(currentPage){
    case'drivers':return state.drivers.map(d=>{const p=profile(d.user_id),l=state.locations.find(x=>x.driver_id===d.user_id),pay=state.payouts.find(x=>x.driver_id===d.user_id);return{Nom:fullName(d.user_id),Telephone:p?.phone||'',Pays:l?.country_name||countryName(p?.country_code),Statut:d.status,Verifie:d.is_verified?'Oui':'Non',Note:d.rating,Courses:d.total_rides,Paie:pay?.payout_status||'non configuree'}});
    case'clients':return state.profiles.filter(p=>String(p.role)==='client').map(p=>({Nom:fullName(p.id),Telephone:p.phone||'',Pays:countryName(p.country_code),Inscription:p.created_at,Courses:state.rides.filter(r=>r.client_id===p.id).length}));
    case'documents':return state.documents.map(d=>({Chauffeur:fullName(d.driver_id),Type:d.document_type,Fichier:d.file_name,Pays:countryName(d.country_code),Statut:d.status,Motif:d.rejection_reason||'',Date:d.created_at}));
    case'payments':return state.payments.map(p=>({Date:p.created_at,Client:fullName(p.user_id),Course:p.ride_id,Methode:p.provider||p.method_type,Montant:p.amount,Devise:p.currency,Statut:p.status,Reference:p.provider_reference||''}));
    case'payouts':return state.payouts.map(p=>({Chauffeur:fullName(p.driver_id),Pays:countryName(p.country_code),Mode:p.payout_method,Titulaire:p.account_holder,Operateur:p.mobile_operator,Telephone:p.phone_number,Banque:p.bank_name,Compte:p.iban_or_account,SWIFT:p.bank_bic_swift,Devise:p.payout_currency,Statut:p.payout_status}));
    case'rides':return state.rides.map(r=>({Date:r.created_at,Pays:r.pickup_country_name||countryName(r.pickup_country_code),Client:fullName(r.client_id),Chauffeur:fullName(r.driver_id),Depart:r.pickup_address,Destination:r.destination_address,Prix:r.final_price??r.estimated_price,Devise:r.currency,Paiement:r.payment_method,Statut:r.status}));
    case'markets':return state.pricing.map(p=>({Pays:countryName(p.country_code),Code:p.country_code,Service:p.service_type,Base:p.base_fare,ParKm:p.per_km,ParMinute:p.per_minute,Minimum:p.minimum_fare,Reservation:p.booking_fee,Devise:p.currency}));
    default:return [{Indicateur:'Clients',Valeur:state.profiles.filter(p=>String(p.role)==='client').length},{Indicateur:'Chauffeurs',Valeur:state.drivers.length},{Indicateur:'Courses',Valeur:state.rides.length},{Indicateur:'Paiements',Valeur:state.payments.length},{Indicateur:'Documents en attente',Valeur:state.documents.filter(d=>d.status==='pending').length}];
  }
}
function exportExcel(){if(!window.XLSX)return toast('Module Excel indisponible');const rows=exportRows();const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,pageTitle(currentPage).slice(0,31));XLSX.writeFile(wb,`FAST_${currentPage}_${new Date().toISOString().slice(0,10)}.xlsx`)}

function switchPage(page){currentPage=page;document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent=pageTitle(page)}
function wire(){
  $('loginBtn').onclick=login;$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('logoutBtn').onclick=logout;$('refreshBtn').onclick=refreshAll;$('exportBtn').onclick=exportExcel;$('modalClose').onclick=closeModal;$('modal').onclick=e=>{if(e.target===$('modal'))closeModal()};
  document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
  $('driverSearch').oninput=renderDrivers;$('driverCountryFilter').onchange=renderDrivers;$('clientSearch').oninput=renderClients;$('docStatusFilter').onchange=renderDocuments;$('paymentStatusFilter').onchange=renderPayments;$('rideStatusFilter').onchange=renderRides;$('newMarketBtn').onclick=()=>editMarket('');
}
wire();
(async()=>{const {data:{session}}=await sb.auth.getSession();if(session)await openAdmin()})();
window.closeModal=closeModal;
