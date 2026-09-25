import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const fields={loginEmail:'virtual@example.invalid',loginPassword:'Virtual42!Password',signupEmail:'virtual@example.invalid',signupPassword:'Virtual42!Password',firstName:'Virtual',lastName:'User',phone:'000000000',role:'client'};
let commits=0, entered=0, saved=null, fail=false;
const context={
  login:null,signup:null,recover:null,loadVehicle:null,saveVehicle:null,pollOffer:null,
  $:id=>({value:fields[id]}),
  api:async()=>{if(fail)throw Object.assign(new Error('Invalid credentials'),{status:401});return {access_token:'virtual-token',refresh_token:'virtual-refresh'};},
  saveSession:value=>saved=value,enter:async()=>{entered++;},toast(){},
  FastNative:{commitAutofill(){commits++;}},
};
context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('app/src/main/assets/compat.js','utf8'),context);
await context.login({preventDefault(){}});
assert.equal(commits,1);assert.equal(entered,1);assert.equal(saved.access_token,'virtual-token');assert.equal(saved.password,undefined);
fail=true;await context.login({preventDefault(){}});assert.equal(commits,1,'Rejected credentials must never be committed to autofill');
fail=false;await context.signup({preventDefault(){}});assert.equal(commits,2);
delete context.FastNative;await context.login({preventDefault(){}});assert.equal(entered,3,'Login must remain functional on Android without autofill bridge');
console.log('Autofill regression: successful login/signup commit, rejected login does not commit, no password storage, optional bridge passed.');
