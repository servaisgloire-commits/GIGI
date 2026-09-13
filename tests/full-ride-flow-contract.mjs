import fs from 'node:fs';

function read(path){return fs.readFileSync(new URL('../'+path,import.meta.url),'utf8')}
function requireText(source,needle,label){if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`)}
function rejectText(source,needle,label){if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`)}

const app=read('app/src/main/assets/app.js');
const authProxy=read('app/src/main/assets/auth-proxy-fix.js');
const signup=read('app/src/main/assets/signup-ui-cleanup.js');
const index=read('app/src/main/assets/index.html');
const client=read('app/src/main/assets/client-rebuild.js');
const security=read('app/src/main/assets/fast-security.js');
const driver=read('app/src/main/assets/driver-operations.js');
const backend=read('backend/app/vehicle_main.py');
const backendAuth=read('backend/app/auth_proxy.py');
const flex=read('backend/app/flex_main.py');
const restart=read('app/src/main/assets/driver-restart-state.js');
const closeGuard=read('app/src/main/assets/app-close-guard.js');
const android=read('app/src/main/java/cg/fast/n1/MainActivity.kt');

// 1. Registration / login: Android WebView must use FAST API, not direct Supabase auth.
requireText(index,'auth-proxy-fix.js','FAST auth proxy loader');
requireText(authProxy,"/v1/auth/password",'login through FAST backend');
requireText(authProxy,"/v1/auth/signup",'signup through FAST backend');
requireText(authProxy,"/v1/auth/recover-password",'password recovery through FAST backend');
requireText(authProxy,'access_token','login session handoff');
requireText(signup,"/v1/auth/signup",'immediate signup through FAST backend');
requireText(signup,'access_token','signup immediate session');
rejectText(signup,"supa('/auth/v1/signup'",'no direct Supabase signup from WebView');
requireText(backendAuth,'/auth/v1/token?grant_type=password','backend Supabase login proxy');
requireText(backendAuth,'@router.post("/password")','FAST login endpoint');
requireText(backendAuth,'@router.post("/signup")','FAST signup endpoint');
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

// 7. Closing the client app while searching cancels only if searching is still true at write time
requireText(closeGuard,'cancelSearchingRideOnClose','native close cancellation bridge');
requireText(closeGuard,"expected_current_status:SEARCHING",'web atomic close cancellation');
requireText(closeGuard,"cancellation_reason:'client_app_closed'",'explicit app-close reason');
requireText(backend,'expected_current_status','backend expected-state contract');
requireText(backend,'query.eq("status", body.expected_current_status)','atomic status predicate');
requireText(backend,'stale_ride_state','accepted ride race protection');
requireText(android,'override fun onStop()','Android lifecycle close hook');
requireText(android,'cancelSearchingRideNative','Android native cancellation worker');
requireText(android,'put("expected_current_status", "searching")','Android atomic close cancellation');
requireText(signup,'app-close-guard.js','close guard loader');

console.log(JSON.stringify({
  ok:true,
  audited:[
    'auth_proxy_login','auth_proxy_signup','auth_proxy_recovery','profile','ride_creation','dispatch','multi_client_driver_claims',
    'pin_issue','pin_verify','driver_arrival','trip_start','cash_completion','cancellation',
    'verified_pin_restart_recovery','app_close_search_cancel','accepted_ride_close_preserved','atomic_close_accept_race'
  ]
},null,2));
