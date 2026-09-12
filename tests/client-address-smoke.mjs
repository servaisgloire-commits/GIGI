import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(`<!doctype html><html><head></head><body class="client-mode">
<div id="bookingState" class="hidden"></div>
<input id="pickupInput" value="Ma position"><div id="pickupSuggestions" class="suggestions hidden"></div>
<input id="destinationInput"><div id="destinationSuggestions" class="suggestions hidden"></div>
<div id="priceText">—</div><div id="distanceText">Choisissez une destination</div>
<button id="bookBtn">Commander FAST</button><div id="toast"></div>
</body></html>`,{url:'https://appassets.androidplatform.net/assets/index.html',runScripts:'outside-only'});
const {window}=dom;
window.role='client';
window.currentRideId=null;
window.destination=null;
window.currentRoute=null;
window.pickup={label:'Ma position',lat:-4.2634,lng:15.2429};
window.token='test-token';
window.API='https://fast-n1-python-api.vercel.app';
window.toast=()=>{};
let calls=0,legacyCalls=0,routeCalls=0;
window.api=async path=>{
  calls++;
  if(path.startsWith('/v1/places/autocomplete'))return{items:[{id:'place-1',label:'POTO-POTO, Brazzaville',provider:'google'}]};
  if(path.startsWith('/v1/places/details'))return{id:'place-1',label:'POTO-POTO, Brazzaville',lat:-4.2740288,lng:15.2677562};
  throw new Error('unexpected '+path);
};
window.refreshRoute=async()=>{routeCalls++;};
window.fetch=async()=>{throw new Error('fallback should not be needed')};

const script=fs.readFileSync('app/src/main/assets/touch-fix.js','utf8');
window.eval(script);

// Simulate the legacy app.js handler being attached before the final load repair.
window.document.getElementById('destinationInput').addEventListener('input',()=>legacyCalls++);
window.dispatchEvent(new window.Event('load'));
await new Promise(r=>setTimeout(r,30));

const input=window.document.getElementById('destinationInput');
assert.equal(input.dataset.fastAddressOwner,'touch-v3','final controller must own destination input');
input.value='Poto-Poto';
input.dispatchEvent(new window.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,280));
assert.equal(legacyCalls,0,'legacy address listener must have been removed');
assert.equal(calls,1,'only one autocomplete request must run');

const list=window.document.getElementById('destinationSuggestions');
assert.equal(list.children.length,1,'one address suggestion expected');
const row=list.children[0];
row.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));
await new Promise(r=>setTimeout(r,40));

assert.equal(calls,2,'one place-details request expected');
assert.equal(window.destination.label,'POTO-POTO, Brazzaville');
assert.equal(window.destination.lat,-4.2740288);
assert.equal(window.destination.lng,15.2677562);
assert.equal(input.value,'POTO-POTO, Brazzaville');
assert.equal(routeCalls,1,'route refresh should run once');
const book=window.document.getElementById('bookBtn');
assert.equal(book.disabled,false);
assert.equal(book.textContent,'Commander un FAST');
assert.equal(book.style.display,'block');
assert.equal(window.document.body.classList.contains('fast-client-destination-ready'),true);

dom.window.close();
console.log('FAST client address smoke test: OK');
