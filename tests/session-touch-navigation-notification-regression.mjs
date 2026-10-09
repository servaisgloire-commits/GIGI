import fs from 'node:fs';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app/src/main/assets/core.js','utf8');
const app=fs.readFileSync('app/src/main/assets/app.js','utf8');
const address=fs.readFileSync('app/src/main/assets/address-search.js','utf8');
const nativeMain=fs.readFileSync('app/src/main/assets/native-main-map.js','utf8');
const simplified=fs.readFileSync('app/src/main/assets/fast-simplified.js','utf8');
const css=fs.readFileSync('app/src/main/assets/styles.css','utf8');
const native=fs.readFileSync('app/src/main/java/cg/fast/n1/MainActivity.kt','utf8');
const service=fs.readFileSync('app/src/main/java/cg/fast/n1/DriverOfferService.kt','utf8');
const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');

assert.ok(core.includes('persistSession?.(raw)'), 'Session must be mirrored to native Android storage');
assert.ok(core.includes('loadPersistentSession?.()'), 'Session must restore from native Android storage');
assert.ok(core.includes('clearPersistentSession?.()'), 'Manual logout must be able to clear native session');

assert.ok(app.includes('restoreCachedIdentity'), 'Signed-in identity must have an offline fallback');
assert.ok(app.includes("FAST reste connecté. Synchronisation réseau en attente."), 'Temporary network errors must not log the user out');
assert.ok(!app.includes("catch(e){saveSession(null);showAuth();toast('Session expirée."), 'Network/session bootstrap failure must not auto-clear login');
assert.ok(app.includes('syncBackgroundOfferWatch(true)'), 'Driver online mode must start background offer monitoring');
assert.ok(app.includes('syncBackgroundOfferWatch(false)'), 'Driver offline/logout must stop background offer monitoring');

assert.ok(address.includes('setMainMapInteractionBlocked?.(!!blocked || addressUiActive())'), 'Address controls must block native map gesture interception');
assert.ok(address.includes("input.addEventListener?.('focus',()=>blockNativeMap(true))"), 'Focused address fields must block native map gestures');
assert.ok(address.includes("target.addEventListener?.('pointerdown',event=>{"), 'Address suggestion touch starts must stay in the WebView');
assert.ok(address.includes("button.addEventListener('pointerup', choose)"), 'Address suggestions must support touch pointer selection');
assert.ok(address.includes('if(chosen)return'), 'Address touch selection must be single-fire');
assert.ok(nativeMain.includes('addressMenuOpen'), 'Native map must remain blocked while address dropdown is open');
assert.ok(nativeMain.includes('addressInputFocused'), 'Native map must stay blocked while an address field has focus');
assert.ok(css.includes('.suggestions{position:relative;z-index:950;pointer-events:auto;touch-action:manipulation}'), 'Address dropdown must remain above map and touchable');

assert.ok(simplified.includes('id="openGoogleMapsNav"'), 'Driver must receive an explicit Google Maps option');
assert.ok(simplified.includes('>Google Maps</button>'), 'Google Maps option must be visible after ride start');
assert.ok(native.includes('google.navigation:q='), 'Native bridge must open Google Maps turn-by-turn navigation');

assert.ok(native.includes('fun persistSession(payload: String)'), 'Native persistent session bridge missing');
assert.ok(native.includes('fun startDriverOfferWatch(sessionJson: String)'), 'Native background offer bridge missing');
assert.ok(native.includes('DriverOfferService.start'), 'Native bridge must start offer service');
assert.ok(service.includes('startForeground(MONITOR_NOTIFICATION_ID'), 'Background offer watch must run as a foreground Android service');
assert.ok(service.includes('/v1/driver/offers/current'), 'Background service must query current driver offer');
assert.ok(service.includes('grant_type=refresh_token'), 'Background service must refresh expired access tokens');
assert.ok(service.includes('Nouvelle course FAST'), 'Background service must post ride offer alerts');
assert.ok(manifest.includes('android.permission.FOREGROUND_SERVICE'), 'Foreground service permission missing');
assert.ok(manifest.includes('android.permission.FOREGROUND_SERVICE_DATA_SYNC'), 'Data sync foreground service permission missing');
assert.ok(manifest.includes('android:name=".DriverOfferService"'), 'Driver offer service missing from manifest');

console.log('FAST session persistence + address touch + Google Maps option + background ride notifications OK');
