(()=>{
'use strict';
const gm$=id=>document.getElementById(id);
const paymentLabels={wallet:'Portefeuille FAST',card:'Carte bancaire',cash:'Espèces',mtn_momo:'MTN Mobile Money',airtel_money:'Airtel Money',orange_money:'Orange Money'};
let activeMarket=null,lastMarketKey='',lastMarketAt=0,applyingMarket=false,observerTimer=null;

function formatMoney(value,currency='USD',locale='fr-FR'){
  try{return new Intl.NumberFormat(locale||'fr-FR',{style:'currency',currency,maximumFractionDigits:['XAF','XOF','JPY'].includes(currency)?0:2}).format(Number(value||0))}
  catch(e){return `${Number(value||0).toLocaleString('fr-FR')} ${currency}`}
}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function currentPaymentValues(select){return [...select.options].map(o=>o.value).join('|')}
function applyMarket(market,country){
  if(!market||applyingMarket)return;
  applyingMarket=true;
  try{
    activeMarket={...market,country};window.fastActiveMarket=activeMarket;
    const select=gm$('paymentMethod'),allowed=(market.payment_methods||['card','cash','wallet']).map(String);
    if(select){
      const previous=select.value;
      if(currentPaymentValues(select)!==allowed.join('|')){
        select.innerHTML=allowed.map(v=>`<option value="${v.replace(/"/g,'')}">${paymentLabels[v]||v}</option>`).join('');
      }
      if(allowed.includes(previous)&&select.value!==previous)select.value=previous;
    }
    const countryName=country?.country_name||market.country_name||'votre zone';
    setText(document.querySelector('.single-service-card .single-car b'),`FAST • ${countryName}`);
    const fleet=document.querySelector('.local-fleet-card');
    if(fleet){setText(fleet.querySelector('b'),`Chauffeurs disponibles en ${countryName}`);setText(fleet.querySelector('span'),'📍')}
    const nearest=gm$('nearestEta');if(nearest&&!/min/.test(nearest.textContent||''))setText(nearest,`Recherche des chauffeurs en ${countryName}…`);
    setText(document.querySelector('.payment-card small'),`Paiement • ${market.currency||'USD'}`);
  }finally{applyingMarket=false}
}

const legacyApi=typeof api==='function'?api:null;
function globalEdgePath(path){
  if(path.startsWith('/v1/market'))return path.replace('/v1/market','/market');
  if(path.startsWith('/v1/places/autocomplete'))return path.replace('/v1/places/autocomplete','/places/autocomplete');
  if(path.startsWith('/v1/places/details'))return path.replace('/v1/places/details','/places/details');
  if(path.startsWith('/v1/routes/estimate'))return path.replace('/v1/routes/estimate','/routes/estimate');
  if(path.startsWith('/v1/nearby-drivers'))return path.replace('/v1/nearby-drivers','/nearby-drivers');
  if(path==='/v1/rides')return '/rides';
  if(/^\/v1\/rides\/[0-9a-f-]+\/dispatch(?:\?|$)/i.test(path))return path.replace('/v1','');
  if(path.startsWith('/v1/driver/location'))return path.replace('/v1/driver/location','/driver/location');
  return null;
}
function edgeFunctionFor(edge){
  return edge==='/routes/estimate'||edge==='/rides'||/^\/rides\/[0-9a-f-]+\/dispatch(?:\?|$)/i.test(edge)?'fast-flex':'fast-global';
}
async function edgeApi(path,opts={}){
  let edge=globalEdgePath(path);if(!edge)return legacyApi(path,opts);
  if(edge.startsWith('/places/autocomplete')&&typeof pickup!=='undefined'&&pickup){
    const sep=edge.includes('?')?'&':'?';
    if(!/[?&]lat=/.test(edge))edge+=`${sep}lat=${encodeURIComponent(pickup.lat)}&lng=${encodeURIComponent(pickup.lng)}`;
  }
  const headers={...(opts.headers||{}),'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
    const fn=edgeFunctionFor(edge);
    const r=await fetch(SUPABASE_URL+'/functions/v1/'+fn+edge,{...opts,headers,signal:opts.signal||controller.signal});
    let d={};try{d=await r.json()}catch(e){}
    if(!r.ok)throw new Error(d.detail||d.message||d.error||('HTTP '+r.status));
    return d;
  }finally{clearTimeout(timer)}
}
if(legacyApi)window.api=api=edgeApi;

async function marketForPickup(force=false){
  if(typeof pickup==='undefined'||!pickup)return null;
  const key=`${Number(pickup.lat).toFixed(2)}:${Number(pickup.lng).toFixed(2)}`;
  if(!force&&key===lastMarketKey&&Date.now()-lastMarketAt<300000)return activeMarket;
  try{
    const d=await api(`/v1/market?lat=${encodeURIComponent(pickup.lat)}&lng=${encodeURIComponent(pickup.lng)}`);
    lastMarketKey=key;lastMarketAt=Date.now();applyMarket(d.market,d.country);return d.market;
  }catch(e){return activeMarket}
}

if(typeof refreshRoute==='function'){
  refreshRoute=async function(){
    if(!pickup||!destination){currentRoute=null;drawRoute(null);if(gm$('routeInsights'))gm$('routeInsights').classList.add('hidden');await marketForPickup();return}
    try{
      const d=await api('/v1/routes/estimate',{method:'POST',body:JSON.stringify(routeBody())});
      currentRoute=d;drawRoute(d);renderRouteInsights(d);applyMarket(d.market,d.country);
      setText(gm$('distanceText'),d.distance_km+' km • '+d.duration_min+' min');
      setText(gm$('priceText'),formatMoney(d.estimated_price,d.currency,d.market?.locale));
    }catch(e){drawRoute(null);toast(e.message)}
  };
}

if(typeof loadNearbyDrivers==='function'){
  const baseNearby=loadNearbyDrivers;
  loadNearbyDrivers=async function(){await marketForPickup();return baseNearby()};
}

window.addEventListener('load',()=>{setTimeout(()=>marketForPickup(true),900)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')marketForPickup()});
const observer=new MutationObserver(()=>{
  if(!activeMarket||applyingMarket)return;
  clearTimeout(observerTimer);
  observerTimer=setTimeout(()=>applyMarket(activeMarket,activeMarket.country),80);
});
observer.observe(document.documentElement,{childList:true,subtree:true});
})();
