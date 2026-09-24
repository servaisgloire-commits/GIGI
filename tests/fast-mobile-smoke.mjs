import fs from 'node:fs';

const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const core=fs.readFileSync('app/src/main/assets/core.js','utf8');
const app=fs.readFileSync('app/src/main/assets/app.js','utf8');
const simplified=fs.readFileSync('app/src/main/assets/fast-simplified.js','utf8');
const mapCss=fs.readFileSync('app/src/main/assets/google-map.css','utf8');
const nativeMain=fs.readFileSync('app/src/main/assets/native-main-map.js','utf8');
const driverNative=fs.readFileSync('app/src/main/assets/driver-native-map.js','utf8');
const driverNativeCss=fs.readFileSync('app/src/main/assets/driver-native-map.css','utf8');
const driverIdentity=fs.readFileSync('app/src/main/assets/driver-identity.js','utf8');
const driverIdentityCss=fs.readFileSync('app/src/main/assets/driver-identity.css','utf8');
const native=fs.readFileSync('app/src/main/java/cg/fast/n1/MainActivity.kt','utf8');
const driverMapActivity=fs.readFileSync('app/src/main/java/cg/fast/n1/DriverMapActivity.kt','utf8');
const backendVehicle=fs.readFileSync('backend/app/vehicle_main.py','utf8');
const gradle=fs.readFileSync('app/build.gradle.kts','utf8');
const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');
const workflow=fs.readFileSync('.github/workflows/android.yml','utf8');
const pinMigration=fs.readFileSync('supabase/migrations/20260914_require_verified_pin_before_start.sql','utf8');
const mapsMigration=fs.readFileSync('supabase/migrations/20260914_add_android_maps_key_reader.sql','utf8');
const driverPhotoMigration=fs.readFileSync('supabase/migrations/20260914_driver_profile_photos.sql','utf8');
const securityHardening=fs.readFileSync('supabase/migrations/20260924_security_g_hardening.sql','utf8');
const securityAgent=fs.readFileSync('supabase/functions/security-g/index.ts','utf8');
const all=core+'\n'+app+'\n'+simplified+'\n'+driverNative+'\n'+driverIdentity;

function requireText(text,needle,label){
  if(!text.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

// These three DOM bindings belong only to the retired multi-category quote UI.
// fast-simplified.js replaces quoteAll/updateQuoteUI before user interaction.
const retiredCategoryIds=new Set(['priceStandard','priceComfort','priceXl']);
const dynamicIds=new Set([
  'driverNavigationPanel','driverNavigationEta','driverNavigationDistance','expandDriverGps',
  'driverPhotoField','driverPhoto','driverPhotoPreview','driverIdentityPhotos','driverVehiclePhoto'
]);
const ids=[...all.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
for(const id of new Set(ids)){
  if(retiredCategoryIds.has(id) || dynamicIds.has(id)) continue;
  if(!html.includes(`id="${id}"`)) throw new Error(`DOM id referenced by JavaScript is missing: ${id}`);
}

requireText(html,'id="map"','map container');
requireText(html,'bottom-sheet','map-first bottom sheet');
requireText(html,'id="flexPrice"','flexible price control');
requireText(html,'id="offerPrice"','driver offer price');
requireText(html,'fast-simplified.js','single FAST runtime layer');
requireText(html,'driver-native-map.css','native driver map stylesheet');
requireText(html,'driver-native-map.js','native driver map runtime');
requireText(simplified,'https://www.google.com/maps?output=embed','client Google Maps presentation');
requireText(simplified,"vehicle_type: 'standard'",'single FAST service payload');
requireText(simplified,"['in_progress','completed','cancelled'].includes(status)",'client cancellation lock only after ride start');
requireText(simplified,'cancelRideUntilStart','client can cancel until driver starts ride');
requireText(simplified,'La course ne peut plus être annulée après son démarrage.','client cancellation message after start');
requireText(simplified,'verifyPinExactMatch','exact PIN verification handler');
requireText(simplified,"r?.verified === true",'PIN RPC must explicitly confirm verified true');
requireText(simplified,'PIN incorrect. Vérifiez le code avec le client.','wrong PIN remains rejected');
requireText(simplified,'syncClientPinState','client security-state polling');
requireText(simplified,'client-route-dismissed','client route hidden after verified PIN');
requireText(mapCss,'.client-route-dismissed #map','client route map dismissal');
requireText(pinMigration,'require_verified_pin_before_start','database PIN start guard');
requireText(pinMigration,'pin_verified_at is not null','verified PIN required before start');
requireText(simplified,'/navigation','driver navigation polling');
requireText(simplified,'Temps restant','driver remaining time display');
requireText(simplified,'Agrandir le GPS','driver navigation expand control');
requireText(driverNative,"new Set(['accepted', 'driver_arriving', 'in_progress'])",'native map on all active driver phases');
requireText(driverNative,'window.FastNative?.openDriverMap','native map bridge call');
requireText(driverNative,"phase === 'to_pickup'",'native pickup navigation phase');
requireText(driverNative,'driver-native-map-active','native driver map mode');
requireText(driverNative,'driver-identity.js','isolated driver identity runtime loader');
requireText(driverNative,'driver-identity.css','isolated driver identity stylesheet loader');
requireText(driverNativeCss,'.driver-native-map-active #map .driver-map-touch-surface','legacy two-finger surface disabled');
requireText(driverNativeCss,'.driver-native-map-active #map .google-map-frame','driver iframe disabled');
requireText(native,'fun openDriverMap(','native driver map bridge');
requireText(native,'ValueAnimator.ofFloat(0f, 1f)','smooth live driver marker interpolation');
requireText(native,'FAST_LOCATION_PERMISSION_CHANGED','Android location permission callback');
requireText(nativeMain,"state?.ride?.optimized_route_polyline",'active route restoration after app resume');
requireText(nativeMain,"ridePoint('pickup')",'pickup marker restoration from active ride');
requireText(nativeMain,"ridePoint('destination')",'destination marker restoration from active ride');
requireText(nativeMain,"Connexion interrompue",'map network interruption state');
requireText(nativeMain,"['accepted','driver_arriving'].includes(status)",'approach map includes live driver and pickup');
requireText(native,'DriverMapActivity::class.java','native driver map activity launch');
requireText(driverMapActivity,'MapView(this)','Google Maps native MapView');
requireText(driverMapActivity,'isScrollGesturesEnabled = true','one-finger native pan');
requireText(driverMapActivity,'isZoomGesturesEnabled = true','native zoom gesture');
requireText(driverMapActivity,'isRotateGesturesEnabled = true','native rotation gesture');
requireText(driverMapActivity,'isTiltGesturesEnabled = true','native tilt gesture');
requireText(driverMapActivity,'map.isTrafficEnabled = true','native traffic layer');
requireText(driverMapActivity,'map_loaded','native map load verification hook');
requireText(gradle,'com.google.android.gms:play-services-maps:20.0.0','Maps SDK dependency');
if ((gradle.match(/isMinifyEnabled = true/g) || []).length < 2) throw new Error('Production and direct-install APKs must both enable R8 minification');
requireText(securityHardening,'grant update (first_name, last_name, phone, avatar_url) on table public.profiles to authenticated','profile role cannot be self-escalated');
requireText(securityHardening,'extensions.hmac(','ride PIN keyed HMAC protection');
requireText(securityHardening,'extensions.gen_random_bytes(2)','cryptographic PIN generation');
requireText(securityHardening,"raise exception 'pin_key_unavailable'","PIN Vault key is mandatory");
if (securityHardening.includes('FAST-N1-PIN-FALLBACK')) throw new Error('Static PIN fallback key must not exist');
requireText(securityAgent,'safeEqual(','constant-time SECURITY G token comparison');
requireText(securityAgent,'rides_with_repeated_pin_failures','SECURITY G PIN abuse monitoring');
requireText(gradle,'FAST_GOOGLE_MAPS_API_KEY','dedicated Android Maps build key');
requireText(gradle,'MAPS_NATIVE_CONFIGURED','native Maps build guard');
requireText(manifest,'com.google.android.geo.API_KEY','Google Maps Android API key metadata');
requireText(manifest,'.DriverMapActivity','native map activity registration');
requireText(workflow,'Acquire dedicated Android Maps key','secure Android Maps key acquisition');
requireText(workflow,'get_maps_android_key','OIDC broker Android Maps action');
requireText(workflow,'::add-mask::$MAPS_KEY','Android Maps key masked in CI');
requireText(workflow,'FAST_GOOGLE_MAPS_API_KEY=$MAPS_KEY','Android Maps key injected at build only');
requireText(mapsMigration,'get_fast_google_maps_android_key','dedicated Android Maps vault reader');
requireText(mapsMigration,"fast_google_maps_android_api_key",'dedicated Android Maps vault secret name');
requireText(mapsMigration,'grant execute on function public.get_fast_google_maps_android_key() to service_role','Maps key reader limited to backend service role');
requireText(native,'google.navigation:q=','Google Maps fallback navigation');
requireText(native,'mode=d','driving navigation fallback');
requireText(all,'/v1/auth/password','password auth route');
requireText(all,'/v1/auth/signup','signup route');
requireText(all,'/v1/auth/recover','recovery route');
requireText(all,'/v1/places/autocomplete?q=','autocomplete q contract');
requireText(all,'pickup_address:','pickup payload');
requireText(all,'destination_address:','destination payload');
requireText(all,'vehicle_type:','vehicle type payload');
requireText(all,"setRideStatus('driver_arriving')",'driver arriving state');
requireText(all,"setRideStatus('in_progress')",'in progress state');
requireText(all,'/v1/driver/vehicle','driver vehicle route');
requireText(all,'/v1/driver/offers/current','driver offer route');
requireText(all,'issue_ride_pin','ride PIN issuance');
requireText(all,'verify_ride_pin','ride PIN verification');

// Additive driver identity + ride offer notification feature.
requireText(driverIdentity,"upload('driver-photos'",'driver photo upload');
requireText(driverIdentity,'avatar_url: photoPath','driver photo path saved on profile');
requireText(driverIdentity,'vehicle.photo_url','vehicle photo rendered for client');
requireText(driverIdentity,'driver.photo_url','driver photo rendered for client');
requireText(driverIdentity,'window.FastNative?.notifyRideOffer','native ride offer notification bridge call');
requireText(driverIdentity,'lastNotifiedOfferId','duplicate ride offer notifications suppressed');
requireText(driverIdentityCss,'.driver-vehicle-photo','vehicle identity photo styling');
requireText(driverIdentityCss,'.driver-avatar img','driver identity photo styling');
requireText(native,'fun notifyRideOffer(','Android notification bridge');
requireText(native,'RIDE_OFFER_CHANNEL_ID','ride offer notification channel');
requireText(native,'NotificationManagerCompat.from(this).notify','native notification delivery');
requireText(manifest,'android.permission.POST_NOTIFICATIONS','Android notification permission');
requireText(driverPhotoMigration,"'driver-photos'",'private driver photo bucket');
requireText(driverPhotoMigration,'driver_photos_storage_insert_own','driver photo own-folder insert policy');
requireText(backendVehicle,'def _signed_driver_photo','signed driver photo helper');
requireText(backendVehicle,'prof["photo_url"] = _signed_driver_photo','driver signed photo returned to client');
requireText(backendVehicle,'result["photo_url"] = _signed_vehicle_photo','vehicle signed photo preserved');

// After ride start, navigation changes only to the requested large-car mode.
requireText(driverMapActivity,'val tripNavigation = phase == "to_destination"','post-start car navigation phase');
requireText(driverMapActivity,'carMarkerIcon()','large car marker');
requireText(driverMapActivity,'.zoom(17.6f)','post-start navigation zoom');
requireText(driverMapActivity,'.tilt(48f)','post-start navigation tilt');
requireText(driverMapActivity,'🚘  EN COURSE','post-start large car screen badge');
requireText(driverMapActivity,'if (tripNavigation) carMarkerIcon() else BitmapDescriptorFactory.defaultMarker','pre-start marker preserved');

if(html.includes('data-type="comfort"') || html.includes('data-type="xl"')) throw new Error('Retired ride categories are visible');
if(html.toLowerCase().includes('leaflet')) throw new Error('Leaflet is still loaded in the active UI');
if(all.includes("setRideStatus('arrived')")) throw new Error('Legacy arrived status still used');
if(all.includes("setRideStatus('started')")) throw new Error('Legacy started status still used');
if(all.includes('/v1/places/autocomplete?input=')) throw new Error('Legacy autocomplete input= contract still used');
if(workflow.includes('fast_google_maps_api_key')) throw new Error('Server Maps key must not be used by Android build');

console.log(`FAST mobile smoke OK: existing ride flow preserved + native notifications + driver/vehicle identity photos + post-start car navigation validated`);
