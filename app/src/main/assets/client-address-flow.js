(()=>{
'use strict';
const af=id=>document.getElementById(id);
const validLoc=loc=>!!loc&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lng));
const state={pickup:{timer:null,seq:0},destination:{timer:null,seq:0}};

function notify(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function clientRole(){try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}}
function hasRide(){try{return typeof currentRideId!=='undefined'&&!!currentRideId}catch(e){return false}}
function searching(){const el=af('bookingState');return !!el&&!el.classList.contains('hidden')}

function forceBookButton(){
  const button=af('bookBtn');if(!button)return;
  let ready=false;try{ready=clientRole()&&validLoc(destination)&&!hasRide()&&!searching()}catch(e){}
  document.body.classList.toggle('fast-client-destination-ready',ready);
  button.classList.toggle('fast-book-ready',ready);
  if(ready){
    button.disabled=false;
    button.textContent='Commander un FAST';
    button.style.setProperty('display','block','important');
    button.style.setProperty('visibility','visible','important');
    button.style.setProperty('opacity','1','important');
    button.style.setProperty('pointer-events','auto','important');
    button.style.setProperty('width','100%','important');
  }else{
    ['display','visibility','opacity','pointer-events','width'].forEach(p=>button.style.removeProperty(p));
  }
}

function clearRoutePresentation(type){
  try{if(type==='destination')destination=null;else if(type==='pickup')pickup=null}catch(e){}
  if(type==='destination'){
    try{currentRoute=null}catch(e){}
    document.body.classList.remove('fast-client-route-ready','fast-client-destination-ready');
    const price=af('priceText');if(price)price.textContent='—';
    const distance=af('distanceText');if(distance)distance.textContent='Choisissez une destination';
  }
  forceBookButton();
}

async function apiCall(path,opts={}){
  if(typeof api!=='function')throw new Error('Service FAST indisponible');
  return api(path,opts);
}

async function nominatim(label){
  const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q='+encodeURIComponent(label),{headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('Adresse introuvable');
  const rows=await r.json(),x=rows?.[0];
  if(!x)throw new Error('Adresse introuvable');
  return{label:x.display_name||label,lat:Number(x.lat),lng:Number(x.lon),provider:'osm'};
}

async function resolvePlace(item){
  if(validLoc(item))return item;
  if(item?.id){
    try{
      const p=await apiCall('/v1/places/details?place_id='+encodeURIComponent(item.id));
      if(validLoc(p))return p;
    }catch(e){}
  }
  return nominatim(item?.label||'');
}

async function refreshAfterSelection(type,loc){
  window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type,location:loc}}));
  forceBookButton();
  try{
    if(typeof refreshRoute==='function')await refreshRoute();
  }catch(e){
    if(type==='destination'){
      const distance=af('distanceText');if(distance)distance.textContent='Destination confirmée';
      const price=af('priceText');if(price)price.textContent='Calcul au démarrage';
      forceBookButton();
    }
  }
  forceBookButton();
}

function renderSuggestions(type,input,list,items){
  list.innerHTML='';
  (items||[]).slice(0,8).forEach(item=>{
    const row=document.createElement('div');
    row.className='suggestion';row.tabIndex=0;row.setAttribute('role','button');row.textContent=item.label||'';
    let selecting=false,startX=0,startY=0,moved=false;
    const choose=async e=>{
      if(selecting)return;selecting=true;
      e?.preventDefault?.();e?.stopPropagation?.();
      try{
        const p=await resolvePlace(item),loc={label:p.label||item.label,lat:Number(p.lat),lng:Number(p.lng)};
        if(!validLoc(loc))throw new Error('Coordonnées indisponibles');
        if(type==='pickup')pickup=loc;else destination=loc;
        input.value=loc.label;list.classList.add('hidden');input.blur();
        await refreshAfterSelection(type,loc);
      }catch(err){
        list.classList.remove('hidden');
        notify('Impossible de sélectionner cette adresse. Essayez une autre proposition.');
      }finally{setTimeout(()=>{selecting=false},350)}
    };
    row.addEventListener('pointerdown',e=>{startX=Number(e.clientX||0);startY=Number(e.clientY||0);moved=false},{passive:true});
    row.addEventListener('pointermove',e=>{if(Math.abs(Number(e.clientX||0)-startX)>8||Math.abs(Number(e.clientY||0)-startY)>8)moved=true},{passive:true});
    row.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'||moved)return;choose(e)});
    row.addEventListener('click',e=>{if(selecting)return;choose(e)});
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(e)}});
    list.appendChild(row);
  });
  list.classList.toggle('hidden',!list.children.length);
}

function bindField(inputId,listId,type){
  const current=af(inputId),list=af(listId);if(!current||!list)return;
  if(current.dataset.fastFinalAddressFlow==='1')return;
  const value=current.value;
  const input=current.cloneNode(true);
  input.value=value;
  input.dataset.fastFinalAddressFlow='1';
  input.dataset.fastTouchBound='1';
  input.dataset.fastFlowRepair='1';
  current.replaceWith(input);

  input.addEventListener('input',()=>{
    const s=state[type];clearTimeout(s.timer);const seq=++s.seq,q=(input.value||'').trim();
    clearRoutePresentation(type);
    window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type,location:null}}));
    if(q.length<2){list.innerHTML='';list.classList.add('hidden');return}
    s.timer=setTimeout(async()=>{
      try{
        const d=await apiCall('/v1/places/autocomplete?q='+encodeURIComponent(q));
        if(seq!==s.seq)return;
        renderSuggestions(type,input,list,d?.items||[]);
        if(!(d?.items||[]).length)notify('Aucune adresse trouvée. Précisez votre recherche.');
      }catch(e){
        if(seq!==s.seq)return;
        list.innerHTML='';list.classList.add('hidden');
        notify('Recherche d’adresse momentanément indisponible. Réessayez.');
      }
    },220);
  });

  input.addEventListener('focus',()=>{if((input.value||'').trim().length>=2&&list.children.length)list.classList.remove('hidden')});
}

function installCss(){
  if(af('fast-client-address-flow-style'))return;
  const style=document.createElement('style');style.id='fast-client-address-flow-style';style.textContent=`
    body.client-mode #pickupInput,body.client-mode #destinationInput{pointer-events:auto!important;touch-action:manipulation!important}
    body.client-mode .suggestions{z-index:190000!important;pointer-events:auto!important;max-height:min(330px,48vh)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important}
    body.client-mode .suggestion{pointer-events:auto!important;touch-action:pan-y!important;cursor:pointer!important;user-select:none!important;-webkit-user-select:none!important}
    body.client-mode.fast-client-destination-ready #passengerArea>.booking-panel{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;transform:translateY(0)!important}
    body.client-mode.fast-client-destination-ready #bookBtn{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:100%!important;min-height:50px!important}
  `;document.head.appendChild(style);
}

function boot(){
  installCss();
  bindField('pickupInput','pickupSuggestions','pickup');
  bindField('destinationInput','destinationSuggestions','destination');
  forceBookButton();
}

boot();
window.addEventListener('load',()=>{boot();setTimeout(boot,300)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(boot,80)});
window.addEventListener('fast:ride-cancelled',()=>setTimeout(()=>{boot();forceBookButton()},120));
window.addEventListener('fast:ride-completed',()=>setTimeout(()=>{boot();forceBookButton()},120));
setInterval(forceBookButton,700);
})();
