import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(`<!doctype html><html><body class="driver-mode"><section id="mainApp"><div id="passengerArea"><div id="sharedMapWrap"><div id="map"><div class="stale-hidden-map"></div></div></div></div><div id="driverArea"><div id="driverGpsMapHost"></div></div></section></body></html>`,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://appassets.androidplatform.net/assets/index.html'});
const {window}=dom;
Object.defineProperty(window.navigator,'onLine',{configurable:true,value:true});
window.role='driver';
let initCalls=0;
let resizeCalls=0;
window.map={gmap:{},resize(){resizeCalls++}};
window.google={maps:{event:{clearInstanceListeners(){},trigger(){}}}};
window.FASTGoogleMaps={status:()=>({ready:true,loading:false,error:'',attempts:1}),load(){},retry(){}};
window.initMap=()=>{initCalls++;window.map={gmap:{getCenter(){return null}},resize(){resizeCalls++}}};

const source=fs.readFileSync(new URL('../app/src/main/assets/driver-map-recovery.js',import.meta.url),'utf8');
window.eval(source);
window.dispatchEvent(new window.Event('load'));
await new Promise(r=>setTimeout(r,300));

const host=window.document.getElementById('driverGpsMapHost');
const wrap=window.document.getElementById('sharedMapWrap');
const mapNode=window.document.getElementById('map');
const audit=window.FASTDriverMapAudit.status();

if(wrap.parentElement!==host)throw new Error('driver map wrapper was not moved into driverGpsMapHost');
if(initCalls<1)throw new Error('driver map was not rebuilt after visible driver mount');
if(mapNode.querySelector('.stale-hidden-map'))throw new Error('stale hidden map DOM was not cleared');
if(!audit.driver||!audit.mapObject||!audit.googleMap)throw new Error('driver map audit reports map unavailable');
if(audit.hostHeight===0&&host.style.height!=='61vh')throw new Error('driver map host has no enforced visible height');

await import('./driver-restart-pin-smoke.mjs');

console.log(JSON.stringify({ok:true,initCalls,resizeCalls,parent:wrap.parentElement.id,audit},null,2));
window.close();
process.exit(0);
