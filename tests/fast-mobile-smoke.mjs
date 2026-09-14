import fs from 'node:fs';

const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const core=fs.readFileSync('app/src/main/assets/core.js','utf8');
const app=fs.readFileSync('app/src/main/assets/app.js','utf8');
const all=core+'\n'+app;

function requireText(text,needle,label){
  if(!text.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

const ids=[...all.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
for(const id of new Set(ids)){
  if(!html.includes(`id="${id}"`)) throw new Error(`DOM id referenced by JavaScript is missing: ${id}`);
}

requireText(html,'id="map"','map container');
requireText(html,'bottom-sheet','map-first bottom sheet');
requireText(html,'id="flexPrice"','flexible price control');
requireText(html,'id="offerPrice"','driver offer price');
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

if(all.includes("setRideStatus('arrived')")) throw new Error('Legacy arrived status still used');
if(all.includes("setRideStatus('started')")) throw new Error('Legacy started status still used');
if(all.includes('/v1/places/autocomplete?input=')) throw new Error('Legacy autocomplete input= contract still used');

console.log(`FAST mobile smoke OK: ${new Set(ids).size} DOM bindings validated`);
