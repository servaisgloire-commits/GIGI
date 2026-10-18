/**
 * Static contract checks for the FAST browser app.
 * Run: node web/smoke.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'web/dist');
execFileSync(process.execPath, [join(root, 'web/build.mjs')], { cwd: root, stdio: 'inherit' });

const html = await readFile(join(out, 'index.html'), 'utf8');
const androidHtml = await readFile(join(root, 'app/src/main/assets/index.html'), 'utf8');
const bridge = await readFile(join(out, 'web-bridge.js'), 'utf8');
const manifest = JSON.parse(await readFile(join(out, 'manifest.webmanifest'), 'utf8'));

assert.match(html, /<script src="web-bridge\.js"><\/script>\s*<script src="core\.js"><\/script>/);
assert.ok(html.includes('id="clientHome"') && html.includes('id="driverHome"'));
assert.ok(html.includes('id="onlineToggle"') && html.includes('id="bookBtn"'));
assert.ok(html.includes('id="map"') && html.includes('id="verifyPinBtn"'));
assert.equal((html.match(/<script src="app\.js"><\/script>/g) || []).length, 1);
assert.ok(androidHtml.includes('<script src="core.js"></script>'), 'HTML source must still be Android app');
assert.equal(manifest.display, 'standalone');
assert.match(bridge, /sb_publishable_[a-zA-Z0-9_-]+/);
assert.doesNotMatch(bridge, /service_role|sb_secret_|gsk_|sk-proj-|FAST_KEYSTORE/i);
assert.doesNotMatch(bridge, /persistSession|openDriverMap|openNavigation|clearPersistentSession/);

// Every local HTML asset exists; nothing is pulled from an incompatible branch.
const refs = [...html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map(x => x[1]);
for (const ref of refs) {
  if (/^(https?:|data:|#)/i.test(ref)) continue;
  assert.ok(!ref.includes('..'), 'Asset path must not traverse directories: ' + ref);
  assert.ok((await stat(join(out, ref))).isFile(), 'Missing HTML dependency: ' + ref);
}
for (const name of await readdir(out)) {
  if (name.endsWith('.js')) {
    execFileSync(process.execPath, ['--check', join(out, name)], { stdio: 'pipe' });
  }
}
const sourceNames = (await readdir(join(root, 'app/src/main/assets'))).sort();
for (const name of sourceNames) {
  assert.ok((await stat(join(out, name))).isFile(), 'Android asset missing in HTML build: ' + name);
}
console.log('FAST HTML smoke OK: shared Android assets, config publique, client/chauffeur et syntaxe JS.');
