import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body><div id="passengerArea"></div><div id="toast"></div></body></html>',{
  url:'https://appassets.androidplatform.net/assets/index.html',
  runScripts:'outside-only',
  pretendToBeVisual:true
});
const {window}=dom;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const quote={distance_km:3.2,duration_min:9,estimated_price:1500,currency:'XAF',market:{currency:'XAF',locale:'fr-CG',payment_methods:['cash']}};
const calls=[];

Object.assign(window,{
  token:'test-token',
  profile:{id:'client-1'},
  role:'client',
  pickup:null,
  destination:null,
  currentRoute:null,
  currentRideId:null,
  map:null,
  driverMarkers:[],
  driverLiveMarker:null,
  nearbyPoll:null,
  ridePoll:null,
  clientWatchId:null,
  API:'https://example.invalid',
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_KEY:'publishable-test',
  toast:()=>{},
  clearDriverMarkers(){window.driverMarkers=[]},
  drawRoute(){},
  initMap(){window.map={resize(){}}},
  showApp(){},
  logout(){},
  loadHistory(){},
  mapboxgl:{Marker:class{setLngLat(){return this}addTo(){return this}remove(){}}},
  async api(path,opts={}){
    calls.push([path,opts.method||'GET']);
    if(path.startsWith('/v1/places/autocomplete'))return {items:[{id:'poto-1',label:'Poto-Poto, Brazzaville'}]};
    if(path.startsWith('/v1/places/details'))return {id:'poto-1',label:'Poto-Poto, Brazzaville',lat:-4.267,lng:15.283};
    if(path==='/v1/routes/estimate')return quote;
    if(path.startsWith('/v1/market?'))return {market:quote.market};
    if(path.startsWith('/v1/nearby-drivers?'))return {count:0,items:[]};
    if(path==='/v1/rides/history')return {items:[]};
    if(path==='/v1/rides'&&opts.method==='POST')return {ride:{id:'ride-1',status:'searching',driver_id:null},route:quote};
    if(path==='/v1/rides/ride-1/dispatch')return {matched:true};
    if(path==='/v1/rides/ride-1')return {ride:{id:'ride-1',status:'searching',driver_id:null}};
    throw new Error('Unexpected test API call: '+path);
  }
});

Object.defineProperty(window.navigator,'geolocation',{configurable:true,value:{
  getCurrentPosition(ok){ok({coords:{latitude:-4.2634,longitude:15.2429,accuracy:8}})},
  watchPosition(ok){ok({coords:{latitude:-4.2634,longitude:15.2429,accuracy:8}});return 1},
  clearWatch(){}
}});
window.confirm=()=>true;

const code=fs.readFileSync('app/src/main/assets/client-rebuild.js','utf8');
window.eval(code);
window.dispatchEvent(new window.Event('load'));
await wait(120);

const passenger=window.document.getElementById('passengerArea');
assert.ok(passenger.classList.contains('fast-client-rebuild'),'rebuilt passenger root must be active');
assert.equal(passenger.querySelector('#destinationInput'),null,'legacy destination input must be removed');
assert.ok(passenger.querySelector('#crDestinationInput'),'new destination input must exist');

const input=window.document.getElementById('crDestinationInput');
input.value='Poto';
input.dispatchEvent(new window.Event('input',{bubbles:true}));
await wait(300);

const suggestion=window.document.querySelector('#crDestinationSuggestions .cr-suggestion');
assert.ok(suggestion,'an address suggestion must be rendered');
suggestion.dispatchEvent(new window.Event('pointerup',{bubbles:true,cancelable:true}));
await wait(180);

assert.equal(input.value,'Poto-Poto, Brazzaville','single selection must populate destination');
assert.equal(window.destination?.label,'Poto-Poto, Brazzaville','selected destination must update global route state');
assert.ok(Number.isFinite(Number(window.destination?.lat)),'selected destination must have latitude');
assert.match(window.document.getElementById('crDistance').textContent,/3\.2 km/,'route estimate must be displayed');
assert.match(window.document.getElementById('crPrice').textContent,/1|500|XAF/i,'price estimate must be displayed');

const book=window.document.getElementById('crBookBtn');
assert.equal(book.disabled,false,'Commander un FAST must be enabled after a valid address selection');
assert.match(book.textContent,/Commander un FAST/);
book.click();
await wait(180);

assert.equal(window.currentRideId,'ride-1','booking must create and retain the active ride id');
assert.equal(window.document.getElementById('crSearchState').classList.contains('hidden'),false,'search state must become visible after booking');
assert.ok(calls.some(([p,m])=>p==='/v1/rides'&&m==='POST'),'ride creation endpoint must be called');
assert.ok(calls.some(([p])=>p==='/v1/rides/ride-1/dispatch'),'dispatch endpoint must be called');

window.close();
console.log('OK: rebuilt FAST passenger address -> route -> booking flow');
