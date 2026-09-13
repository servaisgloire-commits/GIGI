(()=>{
'use strict';
const byId=id=>document.getElementById(id);
let driverMapRebuilt=false;
let rebuildBusy=false;
let lastRole='';
let healthTimer=null;

function isDriver(){try{return typeof role!=='undefined'&&role==='driver'}catch(e){return false}}
function mainVisible(){const main=byId('mainApp');return !!main&&!main.classList.contains('hidden')}
function mapObject(){try{return typeof map!=='undefined'?map:null}catch(e){return null}}

function forceLayout(){
  const host=byId('driverGpsMapHost'),wrap=byId('sharedMapWrap'),node=byId('map');
  if(!host||!wrap||!node)return false;
  document.body.classList.add('driver-mode');
  host.classList.remove('hidden');wrap.classList.remove('hidden');node.classList.remove('hidden');
  host.style.setProperty('display','block','important');
  host.style.setProperty('visibility','visible','important');
  host.style.setProperty('opacity','1','important');
  host.style.setProperty('height','61vh','important');
  host.style.setProperty('min-height','470px','important');
  wrap.style.setProperty('display','block','important');
  wrap.style.setProperty('height','100%','important');
  wrap.style.setProperty('min-height','470px','important');
  node.style.setProperty('display','block','important');
  node.style.setProperty('height','100%','important');
  node.style.setProperty('min-height','470px','important');
  if(wrap.parentElement!==host)host.appendChild(wrap);
  return true;
}

function resizeMap(){
  try{const m=mapObject();if(m&&typeof m.resize==='function')m.resize()}catch(e){}
  try{
    const m=mapObject();
    if(m?.gmap&&window.google?.maps){
      google.maps.event.trigger(m.gmap,'resize');
      const center=m.gmap.getCenter?.();if(center)m.gmap.setCenter(center);
    }
  }catch(e){}
}

function rebuildVisibleDriverMap(){
  if(rebuildBusy||driverMapRebuilt||!isDriver()||!mainVisible())return;
  if(!forceLayout())return;
  rebuildBusy=true;
  try{
    const node=byId('map'),old=mapObject();
    try{if(old?.gmap&&window.google?.maps)google.maps.event.clearInstanceListeners(old.gmap)}catch(e){}
    try{if(typeof map!=='undefined')map=null}catch(e){}
    if(node)node.replaceChildren();
    driverMapRebuilt=true;
    if(typeof initMap==='function')initMap();
    try{window.FASTGoogleMaps?.load?.()}catch(e){}
    [120,450,1100,2200].forEach(ms=>setTimeout(resizeMap,ms));
  }catch(e){
    console.error('FAST driver map rebuild',e);
    driverMapRebuilt=false;
  }finally{rebuildBusy=false}
}

function ensure(){
  if(!isDriver()||!mainVisible())return;
  forceLayout();
  if(!driverMapRebuilt)rebuildVisibleDriverMap();
  else resizeMap();
  const status=window.FASTGoogleMaps?.status?.();
  if(status&&!status.ready&&!status.loading&&navigator.onLine){
    try{window.FASTGoogleMaps.retry()}catch(e){}
  }
}

function roleChanged(){
  const next=isDriver()?'driver':'other';
  if(next!==lastRole){
    lastRole=next;
    if(next==='driver')driverMapRebuilt=false;
  }
  if(next==='driver')setTimeout(ensure,80);
}

window.addEventListener('fast:google-map-status',()=>{if(isDriver())setTimeout(ensure,100)});
window.addEventListener('fast:ride-restored',()=>{if(isDriver())setTimeout(ensure,80)});
window.addEventListener('online',()=>{if(isDriver())setTimeout(ensure,80)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&isDriver())setTimeout(ensure,80)});

const observer=new MutationObserver(()=>roleChanged());
if(document.documentElement)observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
window.addEventListener('load',()=>{roleChanged();clearInterval(healthTimer);healthTimer=setInterval(()=>{roleChanged();ensure()},3000)});

window.FASTDriverMapAudit={
  status(){
    const host=byId('driverGpsMapHost'),node=byId('map'),m=mapObject(),sdk=window.FASTGoogleMaps?.status?.()||{};
    return {driver:isDriver(),mainVisible:mainVisible(),hostVisible:!!host&&getComputedStyle(host).display!=='none',hostHeight:host?.getBoundingClientRect?.().height||0,mapHeight:node?.getBoundingClientRect?.().height||0,mapObject:!!m,googleMap:!!m?.gmap,rebuildDone:driverMapRebuilt,sdk};
  },
  repair(){driverMapRebuilt=false;ensure();return this.status()}
};
})();
