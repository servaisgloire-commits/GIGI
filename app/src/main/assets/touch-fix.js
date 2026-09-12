(()=>{
'use strict';
const tf$=id=>document.getElementById(id);
const flow={pickup:{timer:null,seq:0},destination:{timer:null,seq:0}};
const validLoc=loc=>!!loc&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lng));

function notify(message){try{if(typeof toast==='function')toast(message)}catch(e){}}
function clientRole(){try{return typeof role!=='undefined'&&role==='client'}catch(e){return false}}
function activeRide(){try{return typeof currentRideId!=='undefined'&&!!currentRideId}catch(e){return false}}
function searching(){const el=tf$('bookingState');return !!el&&!el.classList.contains('hidden')}

function installTouchCss(){
  if(tf$('fast-touch-fix-style'))return;
  const s=document.createElement('style');s.id='fast-touch-fix-style';s.textContent=`
    body.client-mode #sharedMapWrap{z-index:1!important}
    body.client-mode .booking-panel{position:relative!important;z-index:1200!important;isolation:isolate;pointer-events:auto!important;overflow:visible!important}
    body.client-mode .booking-panel *{pointer-events:auto}
    body.client-mode .route-fields,body.client-mode .route-field,body.client-mode .route-text{position:relative;z-index:2;pointer-events:auto!important;overflow:visible!important}
    body.client-mode #pickupInput,body.client-mode #destinationInput{position:relative;z-index:4;pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text;user-select:text}
    body.client-mode .fast-pickup-choice{position:relative;z-index:5;pointer-events:auto!important}
    body.client-mode .fast-pickup-choice button{pointer-events:auto!important;touch-action:manipulation!important}
    body.client-mode .suggestions{position:absolute!important;left:0!important;right:0!important;z-index:190000!important;pointer-events:auto!important;max-height:min(330px,48vh)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;background:#fff!important;box-shadow:0 18px 36px rgba(6,20,33,.18)!important;overscroll-behavior:contain!important;touch-action:pan-y!important}
    body.client-mode .suggestion{pointer-events:auto!important;touch-action:pan-y!important;cursor:pointer!important;position:relative;z-index:190001;user-select:none!important;-webkit-user-select:none!important;padding-right:12px!important}
    body.client-mode.fast-client-destination-ready #passengerArea>.booking-panel{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;transform:translateY(0)!important}
    body.client-mode.fast-client-destination-ready #bookBtn{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:100%!important;min-height:50px!important}
  `;document.head.appendChild(s);
}

function syncBookButton(){
  const b=tf$('bookBtn');if(!b)return;
  let ready=false;try{ready=clientRole()&&validLoc(destination)&&!activeRide()&&!searching()}catch(e){}
  document.body.classList.toggle('fast-client-destination-ready',ready);
  b.classList.toggle('fast-book-ready',ready);
  if(ready){
    b.disabled=false;b.textContent='Commander un FAST';
    b.style.setProperty('display','block','important');
    b.style.setProperty('visibility','visible','important');
    b.style.setProperty('opacity','1','important');
    b.style.setProperty('pointer-events','auto','important');
    b.style.setProperty('width','100%','important');
  }else{
    ['display','visibility','opacity','pointer-events','width'].forEach(p=>b.style.removeProperty(p));
  }
}

function clearFieldState(type,input){
  if(type==='destination'){
    try{destination=null;currentRoute=null}catch(e){}
    document.body.classList.remove('fast-client-route-ready','fast-client-destination-ready');
    const p=tf$('priceText');if(p)p.textContent='—';
    const d=tf$('distanceText');if(d)d.textContent='Choisissez une destination';
  }else if((input.value||'').trim()!=='Ma position'){
    try{pickup=null}catch(e){}
  }
  syncBookButton();
  window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type,location:null}}));
}

async function nominatimFallback(label){
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q='+encodeURIComponent(label);
  const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Adresse introuvable');
  const rows=await r.json(),x=rows?.[0];if(!x)throw new Error('Adresse introuvable');
  return{label:x.display_name||label,lat:Number(x.lat),lng:Number(x.lon),provider:'osm'};
}

async function resolvePlace(item){
  if(validLoc(item))return item;
  if(item?.id){
    try{
      const p=await api('/v1/places/details?place_id='+encodeURIComponent(item.id));
      if(validLoc(p))return p;
    }catch(e){}
  }
  return nominatimFallback(item?.label||'');
}

async function choosePlace(type,input,list,item){
  if(!item)return;
  try{
    const p=await resolvePlace(item),loc={label:p.label||item.label,lat:Number(p.lat),lng:Number(p.lng)};
    if(!validLoc(loc))throw new Error('Coordonnées indisponibles');
    if(type==='pickup')pickup=loc;else destination=loc;
    input.value=loc.label;list.classList.add('hidden');input.blur();
    window.dispatchEvent(new CustomEvent('fast:address-confirmed',{detail:{type,location:loc}}));
    syncBookButton();
    try{if(typeof refreshRoute==='function')await refreshRoute()}catch(e){
      if(type==='destination'){
        const d=tf$('distanceText');if(d)d.textContent='Destination confirmée';
        const ptxt=tf$('priceText');if(ptxt)ptxt.textContent='Calcul au démarrage';
      }
    }
    syncBookButton();
  }catch(e){
    list.classList.remove('hidden');
    notify('Impossible de sélectionner cette adresse. Essayez une autre proposition.');
  }
}

function renderSuggestions(type,input,list,items){
  list.innerHTML='';
  (items||[]).slice(0,8).forEach(item=>{
    const row=document.createElement('div');row.className='suggestion';row.setAttribute('role','button');row.tabIndex=0;row.textContent=item.label||'';
    row.setAttribute('aria-label',(item.label||'Adresse')+'. Appuyez une fois pour sélectionner.');
    let selecting=false,startX=0,startY=0,moved=false;
    const select=e=>{
      if(selecting)return;selecting=true;e?.preventDefault?.();e?.stopPropagation?.();
      Promise.resolve(choosePlace(type,input,list,item)).finally(()=>setTimeout(()=>{selecting=false},350));
    };
    row.addEventListener('pointerdown',e=>{startX=Number(e.clientX||0);startY=Number(e.clientY||0);moved=false},{passive:true});
    row.addEventListener('pointermove',e=>{if(Math.abs(Number(e.clientX||0)-startX)>8||Math.abs(Number(e.clientY||0)-startY)>8)moved=true},{passive:true});
    row.addEventListener('pointercancel',()=>{moved=true},{passive:true});
    row.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'||moved)return;select(e)});
    row.addEventListener('click',e=>{if(selecting)return;select(e)});
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(e)}});
    list.appendChild(row);
  });
  list.classList.toggle('hidden',!list.children.length);
}

function bindRobustAutocomplete(inputId,listId,type){
  const old=tf$(inputId),list=tf$(listId);if(!old||!list||old.dataset.fastTouchBound==='1')return;
  const value=old.value;
  const input=old.cloneNode(true);
  input.value=value;
  input.dataset.fastTouchBound='1';
  input.dataset.fastFlowRepair='1';
  old.replaceWith(input);

  input.addEventListener('input',()=>{
    const s=flow[type];clearTimeout(s.timer);const seq=++s.seq,q=(input.value||'').trim();
    clearFieldState(type,input);
    if(q.length<2){list.innerHTML='';list.classList.add('hidden');return}
    s.timer=setTimeout(async()=>{
      try{
        const d=await api('/v1/places/autocomplete?q='+encodeURIComponent(q));if(seq!==s.seq)return;
        const items=d?.items||[];renderSuggestions(type,input,list,items);
        if(!items.length)notify('Aucune adresse trouvée. Précisez votre recherche.');
      }catch(e){
        if(seq!==s.seq)return;
        list.innerHTML='';list.classList.add('hidden');
        notify('Recherche d’adresse momentanément indisponible. Réessayez.');
      }
    },220);
  });
  input.addEventListener('focus',()=>{if((input.value||'').trim().length>=2&&list.children.length)list.classList.remove('hidden')});
}

function rebindPickupButtons(){
  const current=document.querySelector('[data-pickup-mode="current"]'),address=document.querySelector('[data-pickup-mode="address"]');
  if(current&&current.dataset.fastTouchFix!=='1'){
    current.dataset.fastTouchFix='1';current.addEventListener('click',()=>{try{setPickupMode('current')}catch(e){}},{passive:true});
  }
  if(address&&address.dataset.fastTouchFix!=='1'){
    address.dataset.fastTouchFix='1';address.addEventListener('click',()=>{try{setPickupMode('address')}catch(e){}},{passive:true});
  }
}

function bootTouchFix(){
  installTouchCss();
  bindRobustAutocomplete('pickupInput','pickupSuggestions','pickup');
  bindRobustAutocomplete('destinationInput','destinationSuggestions','destination');
  rebindPickupButtons();syncBookButton();
}

bootTouchFix();
window.addEventListener('load',()=>{bootTouchFix();setTimeout(bootTouchFix,300)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(bootTouchFix,80)});
window.addEventListener('fast:ride-cancelled',()=>setTimeout(syncBookButton,120));
window.addEventListener('fast:ride-completed',()=>setTimeout(syncBookButton,120));
setInterval(syncBookButton,700);
})();
