(()=>{
'use strict';
const gm$=id=>document.getElementById(id);
const paymentLabels={wallet:'Portefeuille FAST',card:'Carte bancaire',cash:'Espèces',mtn_momo:'MTN Mobile Money',airtel_money:'Airtel Money',orange_money:'Orange Money'};
let activeMarket=null,lastMarketKey='',lastMarketAt=0;

function formatMoney(value,currency='USD',locale='fr-FR'){
  try{return new Intl.NumberFormat(locale||'fr-FR',{style:'currency',currency,maximumFractionDigits:['XAF','XOF','JPY'].includes(currency)?0:2}).format(Number(value||0))}
  catch(e){return `${Number(value||0).toLocaleString('fr-FR')} ${currency}`}
}
function applyMarket(market,country){
  if(!market)return;
  activeMarket={...market,country};window.fastActiveMarket=activeMarket;
  const select=gm$('paymentMethod'),allowed=market.payment_methods||['card','cash','wallet'];
  if(select){
    const previous=select.value;
    select.innerHTML=allowed.map(v=>`<option value="${String(v).replace(/"/g,'')}">${paymentLabels[v]||v}</option>`).join('');
    if(allowed.includes(previous))select.value=previous;
  }
  const countryName=country?.country_name||market.country_name||'votre zone';
  const service=document.querySelector('.single-service-card .single-car b');if(service)service.textContent=`FAST • ${countryName}`;
  const fleet=document.querySelector('.local-fleet-card');if(fleet){const b=fleet.querySelector('b');if(b)b.textContent=`Chauffeurs disponibles en ${countryName}`;const flag=fleet.querySelector('span');if(flag)flag.textContent='📍'}
  const nearest=gm$('nearestEta');if(nearest&&!/min/.test(nearest.textContent||''))nearest.textContent=`Recherche des chauffeurs en ${countryName}…`;
  const paymentCard=document.querySelector('.payment-card small');if(paymentCard)paymentCard.textContent=`Paiement • ${market.currency||'USD'}`;
}
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
      gm$('distanceText').textContent=d.distance_km+' km • '+d.duration_min+' min';
      gm$('priceText').textContent=formatMoney(d.estimated_price,d.currency,d.market?.locale);
    }catch(e){drawRoute(null);toast(e.message)}
  };
}

if(typeof loadNearbyDrivers==='function'){
  const baseNearby=loadNearbyDrivers;
  loadNearbyDrivers=async function(){await marketForPickup();return baseNearby()};
}

window.addEventListener('load',()=>{setTimeout(()=>marketForPickup(true),900)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')marketForPickup()});
const observer=new MutationObserver(()=>{if(activeMarket)applyMarket(activeMarket,activeMarket.country)});observer.observe(document.documentElement,{childList:true,subtree:true});
})();
