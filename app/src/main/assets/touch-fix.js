(()=>{
'use strict';
const tf$=id=>document.getElementById(id);
let tfTimer=null,tfSeq=0;

function installTouchCss(){
  if(tf$('fast-touch-fix-style'))return;
  const s=document.createElement('style');s.id='fast-touch-fix-style';s.textContent=`
    body.client-mode #sharedMapWrap{z-index:1!important}
    body.client-mode .booking-panel{position:relative!important;z-index:1200!important;isolation:isolate;pointer-events:auto!important}
    body.client-mode .booking-panel *{pointer-events:auto}
    body.client-mode .route-fields,body.client-mode .route-field,body.client-mode .route-text{position:relative;z-index:2;pointer-events:auto!important}
    body.client-mode #pickupInput,body.client-mode #destinationInput{position:relative;z-index:4;pointer-events:auto!important;touch-action:manipulation;-webkit-user-select:text;user-select:text}
    body.client-mode .fast-pickup-choice,body.client-mode .fast-quick-destinations{position:relative;z-index:5;pointer-events:auto!important}
    body.client-mode .fast-pickup-choice button,body.client-mode .fast-quick-destinations button{pointer-events:auto!important;touch-action:manipulation}
    body.client-mode .suggestions{z-index:9999!important;pointer-events:auto!important;max-height:min(300px,42vh)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch}
    body.client-mode .suggestion{pointer-events:auto!important;touch-action:manipulation;cursor:pointer;position:relative;z-index:10000}
  `;document.head.appendChild(s);
}

async function nominatimFallback(label){
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q='+encodeURIComponent(label);
  const r=await fetch(url,{headers:{'Accept':'application/json'}});if(!r.ok)throw new Error('Adresse introuvable');
  const rows=await r.json(),x=rows?.[0];if(!x)throw new Error('Adresse introuvable');
  return{label:x.display_name||label,lat:Number(x.lat),lng:Number(x.lon),provider:'osm'};
}
async function resolvePlace(item){
  if(Number.isFinite(Number(item?.lat))&&Number.isFinite(Number(item?.lng)))return item;
  if(item?.provider==='google'&&item?.id){
    try{
      const p=await api('/v1/places/details?place_id='+encodeURIComponent(item.id));
      if(Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lng)))return p;
    }catch(e){}
  }
  return nominatimFallback(item?.label||'');
}
async function choosePlace(type,input,list,item){
  if(!item)return;
  list.classList.add('hidden');
  try{
    const p=await resolvePlace(item),loc={label:p.label||item.label,lat:Number(p.lat),lng:Number(p.lng)};
    if(!Number.isFinite(loc.lat)||!Number.isFinite(loc.lng))throw new Error('Coordonnées indisponibles');
    if(type==='pickup')pickup=loc;else destination=loc;
    input.value=loc.label;
    input.blur();
    if(typeof refreshRoute==='function')await refreshRoute();
  }catch(e){
    list.classList.remove('hidden');
    if(typeof toast==='function')toast('Impossible de sélectionner cette adresse. Essayez une autre proposition.');
  }
}
function renderSuggestions(type,input,list,items){
  list.innerHTML='';
  (items||[]).slice(0,7).forEach(item=>{
    const row=document.createElement('div');row.className='suggestion';row.setAttribute('role','button');row.tabIndex=0;row.textContent=item.label||'';
    let fired=false;const select=e=>{if(fired)return;fired=true;e?.preventDefault?.();e?.stopPropagation?.();choosePlace(type,input,list,item)};
    row.addEventListener('pointerdown',select,{passive:false});
    row.addEventListener('touchstart',select,{passive:false});
    row.addEventListener('click',select);
    row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){fired=false;select(e)}});
    list.appendChild(row);
  });
  list.classList.toggle('hidden',!list.children.length);
}
function bindRobustAutocomplete(inputId,listId,type){
  const old=tf$(inputId),list=tf$(listId);if(!old||!list||old.dataset.fastTouchBound==='1')return;
  const input=old.cloneNode(true);input.dataset.fastTouchBound='1';old.replaceWith(input);
  const refocus=()=>{if(document.activeElement!==input)setTimeout(()=>{try{input.focus({preventScroll:true})}catch(e){input.focus()}},0)};
  input.addEventListener('pointerdown',refocus,{passive:true});
  input.addEventListener('touchend',refocus,{passive:true});
  input.addEventListener('input',()=>{
    clearTimeout(tfTimer);const q=(input.value||'').trim(),seq=++tfSeq;
    if(type==='destination')destination=null;
    if(type==='pickup'&&q!=='Ma position')pickup=null;
    if(q.length<2){list.innerHTML='';list.classList.add('hidden');return}
    tfTimer=setTimeout(async()=>{
      try{
        const d=await api('/v1/places/autocomplete?q='+encodeURIComponent(q));if(seq!==tfSeq)return;
        renderSuggestions(type,input,list,d?.items||[]);
      }catch(e){if(seq===tfSeq){list.innerHTML='';list.classList.add('hidden')}}
    },180);
  });
}
function rebindPickupButtons(){
  const current=document.querySelector('[data-pickup-mode="current"]'),address=document.querySelector('[data-pickup-mode="address"]');
  if(current&&current.dataset.fastTouchFix!=='1'){
    current.dataset.fastTouchFix='1';current.addEventListener('touchend',()=>setTimeout(()=>{try{setPickupMode('current')}catch(e){}},0),{passive:true});
  }
  if(address&&address.dataset.fastTouchFix!=='1'){
    address.dataset.fastTouchFix='1';address.addEventListener('touchend',()=>setTimeout(()=>{try{setPickupMode('address')}catch(e){}},0),{passive:true});
  }
  const airport=document.querySelector('[data-fast-place="airport"]');
  if(airport&&airport.dataset.fastGlobalAirport!=='1'){
    airport.dataset.fastGlobalAirport='1';
    airport.onclick=()=>{const input=tf$('destinationInput');if(!input)return;input.focus();input.value='Aéroport';input.dispatchEvent(new Event('input',{bubbles:true}))};
  }
}
function bootTouchFix(){installTouchCss();bindRobustAutocomplete('pickupInput','pickupSuggestions','pickup');bindRobustAutocomplete('destinationInput','destinationSuggestions','destination');rebindPickupButtons()}

bootTouchFix();setTimeout(bootTouchFix,250);setTimeout(bootTouchFix,900);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(bootTouchFix,80)});
})();
