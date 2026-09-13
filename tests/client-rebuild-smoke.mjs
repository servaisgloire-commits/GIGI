import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const read=path=>fs.readFileSync(path,'utf8');

async function testPassengerFlow(){
  const dom=new JSDOM(`<!doctype html><html><head></head><body class="client-mode">
    <div id="mainApp"><header id="mainHeader"><button id="menuBtn">☰</button></header>
      <section id="homePage"><div id="passengerArea"></div></section>
      <section id="profilePage"></section>
      <nav id="clientNav"><button data-page="homePage">Accueil</button><button data-page="historyPage">Courses</button><button data-page="profilePage">Profil</button></nav>
    </div><div id="toast"></div>
  </body></html>`,{
    url:'https://appassets.androidplatform.net/assets/index.html',
    runScripts:'outside-only',
    pretendToBeVisual:true
  });
  const {window}=dom;
  const quote={distance_km:3.2,duration_min:9,estimated_price:1500,standard_price:1500,currency:'XAF',market:{currency:'XAF',locale:'fr-CG',payment_methods:['cash']}};
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
      if(path.startsWith('/v1/nearby-drivers?'))return {count:4,items:[{lat:-4.26,lng:15.24,eta_min:3}]};
      if(path==='/v1/rides/history')return {items:[]};
      if(path==='/v1/rides'&&opts.method==='POST')return {ride:{id:'ride-1',status:'searching',driver_id:null},route:quote};
      if(path==='/v1/rides/ride-1/dispatch')return {matched:true};
      if(path==='/v1/rides/ride-1')return {ride:{id:'ride-1',status:'searching',driver_id:null}};
      throw new Error('Unexpected test API call: '+path);
    },
    async fetch(url,opts={}){
      if(String(url).includes('/auth/v1/user'))return {ok:true,status:200,json:async()=>({user_metadata:{}})};
      throw new Error('Unexpected fetch: '+url+' '+(opts.method||'GET'));
    }
  });

  Object.defineProperty(window.navigator,'geolocation',{configurable:true,value:{
    getCurrentPosition(ok){ok({coords:{latitude:-4.2634,longitude:15.2429,accuracy:8}})},
    watchPosition(ok){ok({coords:{latitude:-4.2634,longitude:15.2429,accuracy:8}});return 1},
    clearWatch(){}
  }});
  window.confirm=()=>true;

  window.eval(read('app/src/main/assets/client-rebuild.js'));
  window.eval(read('app/src/main/assets/client-preferences.js'));
  window.dispatchEvent(new window.Event('load'));
  await wait(340);

  const passenger=window.document.getElementById('passengerArea');
  assert.ok(passenger.classList.contains('fast-client-rebuild'),'rebuilt passenger root must be active');
  assert.equal(passenger.querySelector('#destinationInput'),null,'legacy destination input must be removed');
  assert.ok(passenger.querySelector('#crDestinationInput'),'new destination input must exist');
  assert.equal(calls.some(([p])=>p.startsWith('/v1/nearby-drivers?')),false,'driver lookup must not hit the API before Commander un FAST');

  const style=window.document.getElementById('fastClientPreferenceStyle')?.textContent||'';
  assert.match(style,/#mainApp:not\(\.hidden\)>#mainHeader\{position:fixed/,'FAST header must be fixed');
  assert.match(style,/\.cr-addresses\{top:8px/,'address controls must start at the top of the client map');
  assert.match(style,/#crFlexCard\{position:absolute/,'flex-price card must not float in normal document flow');

  const input=window.document.getElementById('crDestinationInput');
  input.value='Poto';
  input.dispatchEvent(new window.Event('input',{bubbles:true}));
  await wait(300);

  const suggestion=window.document.querySelector('#crDestinationSuggestions .cr-suggestion');
  assert.ok(suggestion,'an address suggestion must be rendered');
  suggestion.dispatchEvent(new window.Event('pointerup',{bubbles:true,cancelable:true}));
  await wait(240);

  assert.equal(input.value,'Poto-Poto, Brazzaville','single selection must populate destination');
  assert.equal(window.destination?.label,'Poto-Poto, Brazzaville','selected destination must update global route state');
  assert.ok(Number.isFinite(Number(window.destination?.lat)),'selected destination must have latitude');
  assert.match(window.document.getElementById('crDistance').textContent,/3\.2 km/,'route estimate must be displayed');
  assert.match(window.document.getElementById('crPrice').textContent,/1|500|XAF/i,'price estimate must be calculated');

  await wait(550);
  const book=window.document.getElementById('crBookBtn');
  const dock=window.document.getElementById('fastClientPriceDock');
  assert.equal(book.disabled,false,'Commander un FAST must be enabled after a valid address selection');
  assert.match(book.textContent,/Commander un FAST/);
  assert.ok(dock,'price dock must exist');
  assert.equal(book.nextElementSibling,dock,'price must be placed directly after Commander un FAST in the client DOM');
  assert.match(window.document.getElementById('fastClientPriceBelow').textContent,/1|500|XAF/i,'visible price below the button must match the route quote');

  book.click();
  await wait(220);
  assert.equal(window.currentRideId,'ride-1','booking must create and retain the active ride id');
  assert.equal(window.document.getElementById('crSearchState').classList.contains('hidden'),false,'search state must become visible after booking');
  assert.ok(calls.some(([p,m])=>p==='/v1/rides'&&m==='POST'),'ride creation endpoint must be called');
  assert.ok(calls.some(([p])=>p==='/v1/rides/ride-1/dispatch'),'dispatch endpoint must be called');

  window.close();
}

async function testDriverLifecycle(){
  const dom=new JSDOM(`<!doctype html><html><head></head><body class="driver-mode">
    <div id="mainApp"><header id="mainHeader"><button id="menuBtn">☰</button></header>
      <div id="passengerArea"></div>
      <div id="driverArea"><div id="driverTrip"><div id="fastDriverPinBox"><div id="fastPinVerified">✓ PIN vérifié</div></div><div class="driver-trip-actions"><button id="arrivingBtn">Arrivée</button><button id="startRideBtn">Démarrer</button><button id="completeRideBtn">Terminer</button></div></div></div>
      <div id="driverProfilePage" class="hidden"></div>
      <input id="driverToggleInput" type="checkbox" checked>
    </div><div id="toast"></div>
  </body></html>`,{
    url:'https://appassets.androidplatform.net/assets/index.html',
    runScripts:'outside-only',
    pretendToBeVisual:true
  });
  const {window}=dom;
  let status='accepted';
  let startFailures=0;
  let completeFailures=0;
  const patches=[];
  const toasts=[];
  const jsonResponse=(body,{ok=true,statusCode=200}={})=>({ok,status:statusCode,json:async()=>body});

  Object.assign(window,{
    token:'driver-token',
    role:'driver',
    profile:{id:'driver-1'},
    currentRideId:'ride-d1',
    API:'https://api.fast.test',
    SUPABASE_URL:'https://supabase.test',
    SUPABASE_KEY:'public-test',
    map:{resize(){}},
    toast:m=>toasts.push(String(m)),
    startDriverNavigationPolling(){},
    refreshDriverNavigation(){},
    startOfferPolling(){},
    loadHistory(){},
    updateDriverOnMap(){},
    async fetch(url,opts={}){
      const method=String(opts.method||'GET').toUpperCase();
      const u=String(url);
      if(u==='https://supabase.test/rest/v1/rpc/get_ride_security_state')return jsonResponse({pin_verified:true});
      if(u==='https://api.fast.test/v1/rides/ride-d1'&&method==='GET')return jsonResponse({ride:{id:'ride-d1',status,client_id:'client-1',driver_id:'driver-1'}});
      if(u==='https://api.fast.test/v1/rides/ride-d1/status'&&method==='PATCH'){
        const target=JSON.parse(opts.body||'{}').status;
        patches.push(target);
        if(target==='in_progress'&&startFailures++===0)throw new TypeError('Failed to fetch');
        if(target==='completed'&&completeFailures++===0)return jsonResponse({}, {ok:false,statusCode:503});
        status=target;
        return jsonResponse({ok:true,status:target});
      }
      throw new Error('Unexpected driver fetch: '+method+' '+u);
    }
  });

  window.eval(read('app/src/main/assets/driver-operations.js'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded',{bubbles:true}));
  window.dispatchEvent(new window.Event('load'));
  await wait(360);

  const checkpoint=window.document.getElementById('fastDriverCheckpoint');
  const action=window.document.getElementById('fastDriverCpAction');
  assert.ok(checkpoint?.classList.contains('on'),'driver checkpoint must be visible for an accepted ride');
  assert.match(action.textContent,/Confirmer mon arrivée/);

  action.click();
  await wait(220);
  assert.equal(status,'driver_arriving','pickup confirmation must update the ride status');
  assert.match(action.textContent,/Démarrer la course/,'verified PIN must unlock the start button');

  action.click();
  await wait(1250);
  assert.equal(status,'in_progress','start must survive one transient network failure');
  assert.match(action.textContent,/Confirmer le dépôt et terminer/);

  action.click();
  await wait(1250);
  assert.equal(status,'completed','completion must survive one transient 503 response');
  assert.equal(window.currentRideId,null,'completed ride must be cleared locally');
  assert.ok(patches.filter(x=>x==='in_progress').length>=2,'start transition must retry after a temporary failure');
  assert.ok(patches.filter(x=>x==='completed').length>=2,'completion transition must retry after a temporary failure');
  assert.ok(toasts.some(x=>/Course démarrée/.test(x)),'driver must receive a successful start confirmation');
  assert.ok(toasts.some(x=>/course terminée/i.test(x)),'driver must receive a successful completion confirmation');

  window.close();
}

await testPassengerFlow();
await testDriverLifecycle();
console.log('OK: FAST passenger layout/booking and driver PIN -> start -> completion flows');
