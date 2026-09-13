import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(`<!doctype html><html><body>
  <input id="fastDriverPin" value="">
  <button id="fastVerifyPin">Vérifier</button>
  <div id="fastPinVerified" class="hidden">PIN vérifié</div>
  <button id="fastDriverCpAction" disabled>PIN requis avant démarrage</button>
</body></html>`,{url:'https://fast.local/',runScripts:'outside-only'});

const {window}=dom;
window.role='driver';
window.currentRideId='ride-restart-1';
window.token='driver-token';
window.SUPABASE_URL='https://supabase.test';
window.SUPABASE_KEY='anon-key';
window.API='https://api.test';
window.localStorage.setItem('fast_access_token','driver-token');

let securityReads=0;
let rideReads=0;
window.fetch=async url=>{
  const u=String(url);
  if(u.includes('/rest/v1/rpc/get_ride_security_state')){
    securityReads++;
    return {ok:true,status:200,json:async()=>({pin_verified:true})};
  }
  if(u.includes('/v1/rides/ride-restart-1')){
    rideReads++;
    return {ok:true,status:200,json:async()=>({ride:{id:'ride-restart-1',status:'driver_arriving'}})};
  }
  throw new Error(`Unexpected request: ${u}`);
};

const script=fs.readFileSync('app/src/main/assets/driver-restart-state.js','utf8');
window.eval(script);

window.dispatchEvent(new window.CustomEvent('fast:ride-restored',{detail:{ride:{id:'ride-restart-1',status:'driver_arriving'}}}));

// Simulate the old restart race: another driver script resets the local PIN UI shortly after restore.
await new Promise(resolve=>setTimeout(resolve,60));
window.document.getElementById('fastDriverPin').disabled=false;
window.document.getElementById('fastVerifyPin').disabled=false;
window.document.getElementById('fastVerifyPin').textContent='Vérifier';
window.document.getElementById('fastPinVerified').classList.add('hidden');
window.document.getElementById('fastDriverCpAction').disabled=true;
window.document.getElementById('fastDriverCpAction').textContent='PIN requis avant démarrage';

await new Promise(resolve=>setTimeout(resolve,220));

const input=window.document.getElementById('fastDriverPin');
const verify=window.document.getElementById('fastVerifyPin');
const badge=window.document.getElementById('fastPinVerified');
const action=window.document.getElementById('fastDriverCpAction');

assert.equal(input.disabled,true,'PIN input must remain locked after restart when server says PIN is verified');
assert.equal(verify.disabled,true,'verify button must stay disabled after verified PIN recovery');
assert.match(verify.textContent,/PIN vérifié/i);
assert.equal(badge.classList.contains('hidden'),false,'verified badge must be restored');
assert.equal(action.disabled,false,'start ride action must be re-enabled after restart');
assert.match(action.textContent,/Démarrer la course/i);
assert.ok(securityReads>=1,'restart recovery must re-read security state from Supabase');
assert.ok(rideReads>=1,'restart recovery must re-read live ride status from API');

const status=window.FASTRestartRecovery.status();
assert.equal(status.rideId,'ride-restart-1');
assert.equal(status.pinVerified,true);

console.log(JSON.stringify({ok:true,securityReads,rideReads,startAction:action.textContent}));
dom.window.close();
