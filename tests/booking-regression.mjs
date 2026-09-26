import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const button = {disabled:false};
const state = {pickup:{lat:48.86,lng:2.35,label:'Départ'},destination:{lat:48.87,lng:2.36,label:'Arrivée'}};
let requests = 0, rejectNext = false, shown = 0;
const context = vm.createContext({
  state, document:{addEventListener(){}},
  $:id=>id==='bookBtn'?button:null,
  ensurePlace:async()=>{}, proposedPrice:()=>null,
  api:async()=>{
    requests++;
    await Promise.resolve();
    if(rejectNext){rejectNext=false;throw new Error('Temporary service failure');}
    return {ride:{id:`ride-${requests}`,status:'searching'}};
  },
  ensurePin:async()=>{}, dispatchRide:async()=>{}, startClientPolling(){}, toast(){},
});
context.window=context;
vm.runInContext(fs.readFileSync(new URL('../app/src/main/assets/fast-simplified.js',import.meta.url),'utf8'),context);
context.showClientRide=()=>shown++;
await Promise.all([context.book(),context.book()]);
assert.equal(requests,1,'Concurrent taps must issue one creation request');
await context.book();
assert.equal(requests,1,'An active ride must be reopened, not duplicated');
assert.equal(shown,2);
state.ride=null;
rejectNext=true;
await context.book();
assert.equal(button.disabled,false,'Failure must allow retry');
await context.book();
assert.equal(requests,3,'Retry must succeed after a failed creation');
state.ride.status='completed';
await context.book();
assert.equal(requests,4,'Completed rides must not block the next request');
console.log('Booking regression passed: concurrent taps, active ride, failure retry, next ride.');
