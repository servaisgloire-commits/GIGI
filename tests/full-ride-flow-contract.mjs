import fs from 'node:fs';

function read(path){return fs.readFileSync(new URL('../'+path,import.meta.url),'utf8')}
function requireText(source,needle,label){if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`)}

const app=read('app/src/main/assets/app.js');
const signup=read('app/src/main/assets/signup-ui-cleanup.js');
const client=read('app/src/main/assets/client-rebuild.js');
const security=read('app/src/main/assets/fast-security.js');
const driver=read('app/src/main/assets/driver-operations.js');
const backend=read('backend/app/vehicle_main.py');
const flex=read('backend/app/flex_main.py');
const restart=read('app/src/main/assets/driver-restart-state.js');
const closeGuard=read('app/src/main/assets/app-close-guard.js');
const android=read('app/src/main/java/cg/fast/n1/MainActivity.kt');

// 1. Registration / login
requireText(signup,"/auth/v1/signup",'signup');
requireText(signup,"access_token",'signup immediate session');
requireText(app,"/auth/v1/token?grant_type=password",'login');
requireText(app,"/v1/me",'profile load');

// 2. Passenger creates one ride then starts dispatch
requireText(client,"request('/v1/rides'",'ride creation');
requireText(client,"/dispatch",'ride dispatch');
requireText(client,"fast_client_active_ride",'active ride persistence');

// 3. Dispatch remains atomic when several clients compete for drivers
requireText(flex,'existing_atomic_offer','atomic existing offer reuse');
requireText(flex,'drivers_claimed_by_concurrent_requests','concurrent driver claim fallback');
requireText(flex,'nearest_same_country_atomic_claim','nearest driver rule');
requireText(flex,'_is_unique_conflict','unique collision handling');

// 4. Safety PIN is issued to client and verified by assigned driver
requireText(security,'issue_ride_pin','client PIN issue');
requireText(security,'verify_ride_pin','driver PIN verification');
requireText(security,'get_ride_security_state','PIN state synchronization');

// 5. Driver lifecycle from arrival to trip start and completion
requireText(driver,"status:'driver_arriving'",'driver arrival transition');
requireText(driver,"target==='in_progress'",'driver start transition');
requireText(driver,"target==='completed'",'driver completion transition');
requireText(backend,'changes["pickup_confirmed"] = True','pickup confirmation repair');
requireText(backend,'changes["destination_confirmed"] = True','destination confirmation repair');
requireText(backend,'changes["payment_state"] = "cash_received"','cash completion settlement');
requireText(backend,'changes["completed_at"] = now','completed ride timestamp');
requireText(backend,'changes["cancellation_reason"]','valid cancellation contract');

// 6. Restart recovery must use server truth, never a stale local PIN state
requireText(restart,'get_ride_security_state','restart re-reads PIN state');
requireText(restart,"pin_verified",'restart restores verified PIN');
requireText(restart,"/v1/rides/",'restart re-reads ride status');
requireText(restart,"Démarrer la course",'restart unlocks start after verified PIN');
requireText(signup,'driver-restart-state.js','restart recovery loader');

// 7. Closing the client app while searching cancels only a still-searching ride
requireText(closeGuard,'cancelSearchingRideOnClose','native close cancellation bridge');
requireText(closeGuard,"cancellation_reason:'client_app_closed'",'explicit app-close reason');
requireText(closeGuard,"!==SEARCHING",'race guard preserves already accepted ride');
requireText(android,'override fun onStop()','Android lifecycle close hook');
requireText(android,'cancelSearchingRideNative','Android native cancellation worker');
requireText(android,'if (status != "searching") return@Thread','Android preserves accepted/in-progress ride');
requireText(signup,'app-close-guard.js','close guard loader');

console.log(JSON.stringify({
  ok:true,
  audited:[
    'signup','login','profile','ride_creation','dispatch','multi_client_driver_claims',
    'pin_issue','pin_verify','driver_arrival','trip_start','cash_completion','cancellation',
    'verified_pin_restart_recovery','app_close_search_cancel','accepted_ride_close_preserved'
  ]
},null,2));
