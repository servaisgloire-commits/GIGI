import fs from 'node:fs';

const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const core=fs.readFileSync('app/src/main/assets/core.js','utf8');
const app=fs.readFileSync('app/src/main/assets/app.js','utf8');
const simplified=fs.readFileSync('app/src/main/assets/fast-simplified.js','utf8');
const mapCss=fs.readFileSync('app/src/main/assets/google-map.css','utf8');
const native=fs.readFileSync('app/src/main/java/cg/fast/n1/MainActivity.kt','utf8');
const pinMigration=fs.readFileSync('supabase/migrations/20260914_require_verified_pin_before_start.sql','utf8');
const all=core+'\n'+app+'\n'+simplified;

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
requireText(simplified,'https://www.google.com/maps?output=embed','Google Maps presentation');
requireText(simplified,"vehicle_type: 'standard'",'single FAST service payload');
requireText(simplified,"['in_progress','completed','cancelled'].includes(status)",'client cancellation lock only after ride start');
requireText(simplified,'cancelRideUntilStart','client can cancel until driver starts ride');
requireText(simplified,'La course ne peut plus être annulée après son démarrage.','client cancellation message after start');
requireText(simplified,'verifyPinExactMatch','exact PIN verification handler');
requireText(simplified,"r?.verified === true",'PIN RPC must explicitly confirm verified true');
requireText(simplified,'PIN incorrect. Vérifiez le code avec le client.','wrong PIN remains rejected');
requireText(simplified,'syncClientPinState','client security-state polling');
requireText(simplified,'client-route-dismissed','client route hidden after verified PIN');
requireText(simplified,'driverMapTouchSurface','one-finger driver map surface');
requireText(simplified,"surface.addEventListener('pointermove'",'one-finger driver pan handler');
requireText(mapCss,'touch-action:none','single-finger touch ownership');
requireText(mapCss,'.client-route-dismissed #map','client route map dismissal');
requireText(pinMigration,'require_verified_pin_before_start','database PIN start guard');
requireText(pinMigration,'pin_verified_at is not null','verified PIN required before start');
requireText(simplified,'/navigation','driver navigation polling');
requireText(simplified,'Temps restant','driver remaining time display');
requireText(simplified,'Agrandir le GPS','driver navigation expand control');
requireText(native,'google.navigation:q=','native Google Maps driving mode');
requireText(native,'mode=d','driving navigation mode');
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

console.log(`FAST mobile smoke OK: one-finger map + exact PIN + client post-PIN view validated`);
