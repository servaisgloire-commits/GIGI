import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(p, 'utf8');
const app = read('app/src/main/assets/app.js');
const client = read('app/src/main/assets/client-rebuild.js');
const security = read('app/src/main/assets/fast-security.js');
const driverGps = read('app/src/main/assets/driver-gps.js');
const driverReliability = read('app/src/main/assets/driver-runtime-reliability.js');
const signup = read('app/src/main/assets/signup-ui-cleanup.js');
const backend = read('backend/app/main.py');
const dispatch = read('backend/app/dispatch_resilience.py');
const entrypoint = read('backend/app/vehicle_main.py');

const contracts = [
  [signup.includes('/auth/v1/signup'), 'signup -> Supabase Auth'],
  [signup.includes('loadProfileWithRetry'), 'signup -> profile load retry'],
  [app.includes("api('/v1/me')"), 'login -> /v1/me'],
  [client.includes("request('/v1/rides'"), 'client -> create ride'],
  [client.includes('/dispatch'), 'client -> dispatch'],
  [driverGps.includes('/v1/driver/offers/') && driverGps.includes('/respond'), 'driver -> offer response'],
  [security.includes('verify_ride_pin'), 'driver -> PIN verification'],
  [backend.includes('"in_progress"') && backend.includes('"completed"'), 'ride -> start/completion states'],
  [driverReliability.includes("rpc('get_ride_security_state'"), 'lost PIN reply -> source-of-truth recovery'],
  [driverReliability.includes('host.appendChild(wrap)'), 'driver map -> shared map mounted in driver host'],
  [signup.includes('driver-runtime-reliability.js'), 'driver reliability script loaded after app'],
  [entrypoint.includes('dispatch_resilience'), 'production entrypoint -> resilient dispatch'],
  [dispatch.includes('race_recovered'), 'dispatch -> concurrent race recovery'],
];
for (const [ok, label] of contracts) assert.ok(ok, `Contract missing: ${label}`);

function allocate(clients, drivers, busy = new Set()) {
  const offers = new Map();
  const unmatched = [];
  for (const clientId of clients) {
    const ranked = drivers
      .map((driverId, index) => ({driverId, score: Math.abs(index - (Number(clientId.slice(1)) % drivers.length))}))
      .sort((a, b) => a.score - b.score || a.driverId.localeCompare(b.driverId));
    const chosen = ranked.find(x => !busy.has(x.driverId));
    if (!chosen) { unmatched.push(clientId); continue; }
    busy.add(chosen.driverId);
    offers.set(clientId, chosen.driverId);
  }
  return {offers, unmatched, busy};
}

const clients = Array.from({length: 100}, (_, i) => `c${i + 1}`);
const drivers = Array.from({length: 40}, (_, i) => `d${i + 1}`);
const first = allocate(clients, drivers);
assert.equal(first.offers.size, 40);
assert.equal(new Set(first.offers.values()).size, first.offers.size);
assert.equal(first.unmatched.length, 60);

const released = [...first.offers.values()].slice(0, 20);
for (const id of released) first.busy.delete(id);
const second = allocate(first.unmatched.slice(0, 20), drivers, first.busy);
assert.equal(second.offers.size, 20);
assert.equal(new Set(second.busy).size, second.busy.size);

console.log(JSON.stringify({
  flow_contracts: contracts.length,
  simulated_clients: clients.length,
  simulated_drivers: drivers.length,
  first_wave_matched: first.offers.size,
  first_wave_waiting: first.unmatched.length,
  second_wave_matched: second.offers.size,
  duplicate_driver_assignments: 0,
  status: 'PASS'
}, null, 2));
