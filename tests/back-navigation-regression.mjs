import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements={};
for(const id of ['app','auth','signupForm','loginForm','activityView','vehicleView','profileView','tripOptions','pickupSuggestions','destinationSuggestions']){
  const classes=new Set(id==='app'?['active']:id==='auth'?[]:['hidden']);
  elements[id]={textContent:'',innerHTML:'',classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)}};
}
const listeners={};let resetCount=0,dismissed=false;
const context={state:{ride:null},$:id=>elements[id],FastNative:{resetBackExit(){resetCount++;}},Event:class{constructor(type){this.type=type;}},document:{activeElement:{blur(){}},addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:()=>{dismissed=true;}},switchView(name){for(const view of ['activity','vehicle','profile']){elements[`${view}View`].classList.add('hidden');}elements[`${name}View`]?.classList.remove('hidden');},showAuth(){elements.app.classList.remove('active');elements.auth.classList.add('active');},authMode(mode){elements.signupForm.classList[mode==='signup'?'remove':'add']('hidden');}};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('app/src/main/assets/back-navigation.js','utf8'),context);
context.switchView('profile');context.switchView('activity');
assert.equal(context.FAST_HANDLE_BACK(),true);assert.equal(elements.profileView.classList.contains('hidden'),false);
assert.equal(context.FAST_HANDLE_BACK(),true);assert.equal(elements.profileView.classList.contains('hidden'),true);
assert.equal(context.FAST_HANDLE_BACK(),false,'Only home permits Android exit handling');
context.switchView('vehicle');context.switchView('home');assert.equal(context.FAST_HANDLE_BACK(),false,'Explicit home navigation clears old view history');
elements.destinationSuggestions.textContent='Pending suggestions';assert.equal(context.FAST_HANDLE_BACK(),true);assert.ok(dismissed);elements.destinationSuggestions.textContent='';
elements.tripOptions.classList.remove('hidden');assert.equal(context.FAST_HANDLE_BACK(),true);assert.equal(context.FAST_HANDLE_BACK(),false);
context.state.ride={id:'virtual-ride',status:'in_progress'};assert.equal(context.FAST_HANDLE_BACK(),false);assert.equal(context.state.ride.status,'in_progress','Back never cancels an active ride');
context.showAuth();context.authMode('signup');assert.equal(context.FAST_HANDLE_BACK(),true);assert.equal(context.FAST_HANDLE_BACK(),false);
const before=resetCount;listeners.pointerdown();assert.equal(resetCount,before+1,'New interaction resets the native double-back timer');
console.log('Back navigation: history, home, signup, suggestions, quote, active ride preservation and exit reset passed.');
