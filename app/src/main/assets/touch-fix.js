(()=>{
'use strict';
const tf$=id=>document.getElementById(id);
let tfTimer=null,tfSeq=0;

function installTouchCss(){
  if(tf$('fast-touch-fix-style'))return;
  const s=document.createElement('style');s.id='fast-touch-fix-style';s.textContent=`
    body.client-mode #sharedMapWrap{z-index:1!important}
    body.client-mode .booking-panel{position:relative!important;z-index:1200!important;isolation:isolate;pointer-events:auto!important;overflow:visible!important}
    body.client-mode .booking-panel *{pointer-events:auto}
    body.client-mode .route-fields,body.client-mode .route-field,body.client-mode .route-text{position:relative;z-index:2;pointer-events:auto!important;overflow:visible!important}
    body.client-mode #pickupInput,body.client-mode #destinationInput{position:relative;z-index:4;pointer-events:auto!important;touch-action:manipulation;-webkit-user-select:text;user-select:text}
    body.client-mode .fast-pickup-choice{position:relative;z-index:5;pointer-events:auto!important}
    body.client-mode .fast-pickup-choice button{pointer-events:auto!important;touch-action:manipulation}
    body.client-mode .suggestions{position:absolute!important;left:0!important;right:0!important;z-index:99999!important;pointer-events:auto!important;max-height:min(320px,46vh)!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch;background:#fff!important;box-shadow:0 18px 36px rgba(6,20,33,.18)!important;overscroll-behavior:contain!important;touch-action:pan-y!important}
    body.client-mode .suggestion{pointer-events:auto!important;touch-action:pan-y!important;cursor:pointer;position:relative;z-index:100000;user-select:none;-webkit-user-select:none;transition:background .12s ease,box-shadow .12s ease}
    body.client-mode .suggestion.fast-await-double{background:#eef6ff!important;box-shadow:inset 3px 0 0 #1677ff!important}
    body.client-mode .suggestion.fast-await-double::after{content:'Touchez encore pour sélectionner';display:block;margin-top:4px;color:#0b69ed;font-size:9px;font-weight:800}
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
    row.setAttribute('aria-label',(item.label||'Adresse')+'. Double-cliquez ou touchez deux fois pour sélectionner.');
    let selecting=false,lastTapAt=0,downX=0,downY=0,moved=false,clearHintTimer=null;
    const clearHint=()=>{row.classList.remove('fast-await-double');lastTapAt=0;clearTimeout(clearHintTimer)};
    const select=e=>{
      if(selecting)return;
      selecting=true;clearHint();
      e?.preventDefault?.();e?.stopPropagation?.();
      Promise.resolve(choosePlace(type,input,list,item)).finally(()=>{setTimeout(()=>{selecting=false},250)});
    };
    const firstTap=()=>{
      list.querySelectorAll('.suggestion.fast-await-double').forEach(el=>{if(el!==row)el.classList.remove('fast-await-double')});
      row.classList.add('fast-await-double');
      clearTimeout(clearHintTimer);clearHintTimer=setTimeout(clearHint,850);
    };
    row.addEventListener('pointerdown',e=>{
      downX=Number(e.clientX||0);downY=Number(e.clientY||0);moved=false;
    },{passive:true});
    row.addEventListener('pointermove',e=>{
      if(Math.abs(Number(e.clientX||0)-downX)>10||Math.abs(Number(e.clientY||0)-downY)>10)moved=true;
    },{passive:true});
    row.addEventListener('pointercancel',()=>{moved=true;clearHint()},{passive:true});
    row.addEventListener('pointerup',e=>{
      if(moved)return;
      const now=Date.now();
      if(lastTapAt&&now-lastTapAt<=650){
        e.preventDefault();e.stopPropagation();select(e);return;
      }
      lastTapAt=now;firstTap();
    });
    /* Un clic simple est volontairement neutralisé. Il ne doit jamais valider
       une adresse, notamment après un scroll tactile qui produit un click synthétique. */
    row.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});
    row.addEventListener('dblclick',e=>select(e));
    row.addEventListener('keydown',e=>{if(e.key==='Enter'){select(e)}});
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
}
function bootTouchFix(){installTouchCss();bindRobustAutocomplete('pickupInput','pickupSuggestions','pickup');bindRobustAutocomplete('destinationInput','destinationSuggestions','destination');rebindPickupButtons()}

installTouchCss();
window.addEventListener('load',()=>{setTimeout(bootTouchFix,1150);setTimeout(bootTouchFix,1900)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(bootTouchFix,120)});
})();