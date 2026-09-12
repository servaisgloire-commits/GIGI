(()=>{
'use strict';
const ac$=id=>document.getElementById(id);
const state={pickup:{timer:null,seq:0},destination:{timer:null,seq:0}};
const validLoc=loc=>!!loc&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lng));

function notify(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function isClient(){try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}}
function activeRide(){try{return typeof currentRideId!=='undefined'&&!!currentRideId}catch(e){return false}}
function authHeader(){try{return typeof token!=='undefined'&&token?{'Authorization':'Bearer '+token}:{}}catch(e){return{}}}

async function readJsonResponse(r){let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.detail||d.message||d.error||('HTTP '+r.status));return d}
async function callPrimary(path){if(typeof api!=='function')throw new Error('API FAST indisponible');return api(path)}
async function callPython(path){
  if(typeof API==='undefined'||!API)throw new Error('API Python indisponible');
  return readJsonResponse(await fetch(API+path,{headers:{...authHeader(),'Content-Type':'application/json'}}));
}
async function osmSearch(query){
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q='+encodeURIComponent(query);
  const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Recherche indisponible');
  const rows=await r.json();return{items:(rows||[]).map(x=>({id:String(x.place_id||''),label:x.display_name||query,lat:Number(x.lat),lng:Number(x.lon),provider:'osm'})).filter(validLoc)};
}
async function searchPlaces(query){
  const path='/v1/places/autocomplete?q='+encodeURIComponent(query);
  try{const d=await callPrimary(path);if(Array.isArray(d?.items))return d}catch(e){}
  try{const d=await callPython(path);if(Array.isArray(d?.items))return d}catch(e){}
  return osmSearch(query);
}
async function resolvePlace(item){
  if(validLoc(item))return{label:item.label||'',lat:Number(item.lat),lng:Number(item.lng)};
  if(item?.id){
    const path='/v1/places/details?place_id='+encodeURIComponent(item.id);
    try{const p=await callPrimary(path);if(validLoc(p))return{label:p.label||item.label||'',lat:Number(p.lat),lng:Number(p.lng)}}catch(e){}
    try{const p=await callPython(path);if(validLoc(p))return{label:p.label||item.label||'',lat:Number(p.lat),lng:Number(p.lng)}}catch(e){}
  }
  const d=await osmSearch(item?.label||'');const p=d.items?.[0];if(validLoc(p))return p;
  throw new Error('Coordonnées indisponibles');
}

function setBookReady(on){
  const b=ac$('bookBtn');
  document.body.classList.toggle('fast-client-destination-ready',!!on);
  document.body.classList.toggle('fast-client-route-ready',!!on);
  if(!b)return;
  b.classList.toggle('fast-book-ready',!!on);
  if(on&&isClient()&&!activeRide()){
    b.disabled=false;b.textContent='Commander un FAST';
    b.style.setProperty('display','block','important');
    b.style.setProperty('visibility','visible','important');
    b.style.setProperty('opacity','1','important');
    b.style.setProperty('pointer-events','auto','important');
    b.style.setProperty('width','100%','important');
  }
}
function clearDestination(){
  try{destination=null;currentRoute=null}catch(e){}
  setBookReady(false);
  const p=ac$('priceText');if(p)p.textContent='—';
  const d=ac$('distanceText');if(d)d.textContent='Choisissez une destination';
  window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type:'destination',location:null}}));
}
function clearPickup(input){
  if((input.value||'').trim()!=='Ma position'){try{pickup=null}catch(e){}}
  window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type:'pickup',location:null}}));
}

async function refreshAfterSelection(type,loc){
  window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type,location:loc}}));
  if(type==='destination')setBookReady(true);
  try{
    if(typeof refreshRoute==='function')await refreshRoute();
  }catch(e){
    if(type==='destination'){
      const d=ac$('distanceText');if(d)d.textContent='Destination confirmée';
      const p=ac$('priceText');if(p)p.textContent='Calcul au démarrage';
      setBookReady(true);
    }
  }
  if(type==='destination')setBookReady(true);
}
async function choose(type,input,list,item){
  try{
    const loc=await resolvePlace(item);if(!validLoc(loc))throw new Error('Adresse invalide');
    if(type==='pickup')pickup=loc;else destination=loc;
    input.value=loc.label||item.label||'';list.innerHTML='';list.classList.add('hidden');input.blur();
    await refreshAfterSelection(type,loc);
  }catch(e){
    list.classList.remove('hidden');notify('Impossible de sélectionner cette adresse. Réessayez.');
  }
}

function render(type,input,list,items){
  list.innerHTML='';
  (items||[]).slice(0,8).forEach(item=>{
    const row=document.createElement('div');row.className='suggestion';row.setAttribute('role','button');row.tabIndex=0;row.textContent=item.label||'';
    let busy=false;
    const select=e=>{
      if(busy)return;busy=true;e?.preventDefault?.();e?.stopPropagation?.();
      Promise.resolve(choose(type,input,list,item)).finally(()=>setTimeout(()=>{busy=false},300));
    };
    row.addEventListener('pointerup',select);
    row.addEventListener('touchend',select,{passive:false});
    row.addEventListener('click',select);
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(e)}});
    list.appendChild(row);
  });
  list.classList.toggle('hidden',!list.children.length);
}

function bindField(inputId,listId,type){
  const old=ac$(inputId),list=ac$(listId);if(!old||!list)return;
  const value=old.value||'';
  const input=old.cloneNode(true);
  input.value=value;
  input.dataset.fastAddressController='v3';
  input.dataset.fastTouchBound='1';
  input.dataset.fastFlowRepair='1';
  old.replaceWith(input);

  input.addEventListener('input',()=>{
    const s=state[type];clearTimeout(s.timer);const seq=++s.seq;const q=(input.value||'').trim();
    if(type==='destination')clearDestination();else clearPickup(input);
    if(q.length<2){list.innerHTML='';list.classList.add('hidden');return}
    s.timer=setTimeout(async()=>{
      try{
        const d=await searchPlaces(q);if(seq!==s.seq)return;
        render(type,input,list,d?.items||[]);
        if(!(d?.items||[]).length)notify('Aucune adresse trouvée. Précisez votre recherche.');
      }catch(e){
        if(seq!==s.seq)return;list.innerHTML='';list.classList.add('hidden');notify('Recherche d’adresse momentanément indisponible.');
      }
    },220);
  });
  input.addEventListener('focus',()=>{if((input.value||'').trim().length>=2&&list.children.length)list.classList.remove('hidden')});
}

function install(){
  const current=ac$('destinationInput');
  if(current?.dataset.fastAddressController==='v3')return;
  bindField('pickupInput','pickupSuggestions','pickup');
  bindField('destinationInput','destinationSuggestions','destination');
  if(validLoc(typeof destination!=='undefined'?destination:null))setBookReady(true);
  window.dispatchEvent(new CustomEvent('fast:address-controller-ready'));
}

window.FASTAddressController={install,searchPlaces};
window.addEventListener('load',()=>setTimeout(install,0));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(install,80)});
if(document.readyState==='complete')setTimeout(install,0);
})();