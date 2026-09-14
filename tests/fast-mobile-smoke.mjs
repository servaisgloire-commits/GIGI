import fs from 'node:fs';

const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const core=fs.readFileSync('app/src/main/assets/core.js','utf8');
const app=fs.readFileSync('app/src/main/assets/app.js','utf8');
const simplified=fs.readFileSync('app/src/main/assets/fast-simplified.js','utf8');
const mapCss=fs.readFileSync('app/src/main/assets/google-map.css','utf8');
const driverNative=fs.readFileSync('app/src/main/assets/driver-native-map.js','utf8');
const driverNativeCss=fs.readFileSync('app/src/main/assets/driver-native-map.css','utf8');
const native=fs.readFileSync('app/src/main/java/cg/fast/n1/MainActivity.kt','utf8');
const driverMapActivity=fs.readFileSync('app/src/main/java/cg/fast/n1/DriverMapActivity.kt','utf8');
const gradle=fs.readFileSync('app/build.gradle.kts','utf8');
const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');
const pinMigration=fs.readFileSync('supabase/migrations/20260914_require_verified_pin_before_start.sql','utf8');
const all=core+'\n'+app+'\n'+simplified+'\n'+driverNative;

function requireText(text,needle,label){
  if(!text.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

// These three DOM bindings belong only to the retired multi-category quote UI.
// fast-simplified.js replaces quoteAll/updateQuoteUI before user interaction.
const retiredCategoryIds=new Set(['priceStandard','priceComfort','priceXl']);
const dynamicIds=new Set(['driverNavigationPanel','driverNavigationEta','driverNavigationDistance','expandDriverGps']);
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
requireText(driverNativeCss,'.driver-native-map-active #map .driver-map-touch-surface','legacy two-finger surface disabled');
requireText(driverNativeCss,'.driver-native-map-active #map .google-map-frame','driver iframe disabled');
requireText(native,'fun openDriverMap(','native driver map bridge');
requireText(native,'DriverMapActivity::class.java','native driver map activity launch');
requireText(driverMapActivity,'MapView(this)','Google Maps native MapView');
requireText(driverMapActivity,'isScrollGesturesEnabled = true','one-finger native pan');
requireText(driverMapActivity,'isZoomGesturesEnabled = true','native zoom gesture');
requireText(driverMapActivity,'isRotateGesturesEnabled = true','native rotation gesture');
requireText(driverMapActivity,'isTiltGesturesEnabled = true','native tilt gesture');
requireText(driverMapActivity,'map.isTrafficEnabled = true','native traffic layer');
requireText(driverMapActivity,'map_loaded','native map load verification hook');
requireText(gradle,'com.google.android.gms:play-services-maps:20.0.0','Maps SDK dependency');
requireText(gradle,'MAPS_NATIVE_CONFIGURED','native Maps build guard');
requireText(manifest,'com.google.android.geo.API_KEY','Google Maps Android API key metadata');
requireText(manifest,'.DriverMapActivity','native map activity registration');
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

if(html.includes('data-type="comfort"') || html.includes('data-type="xl"')) throw new Error('Retired ride categories are visible');
if(html.toLowerCase().includes('leaflet')) throw new Error('Leaflet is still loaded in the active UI');
if(all.includes("setRideStatus('arrived')")) throw new Error('Legacy arrived status still used');
if(all.includes("setRideStatus('started')")) throw new Error('Legacy started status still used');
if(all.includes('/v1/places/autocomplete?input=')) throw new Error('Legacy autocomplete input= contract still used');

console.log(`FAST mobile smoke OK: native driver map + exact PIN + client post-PIN view validated`);
