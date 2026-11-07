/**
 * Build the FAST HTML/PWA version from the exact interface packaged in Android.
 * No backend data, session, keystore or secret is copied.
 *
 * Run at the repository root: node web/build.mjs
 */
import { mkdir, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'app/src/main/assets');
const output = join(root, 'web/dist');

function validHttps(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + ' doit être une URL HTTPS valide'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(label + ' doit être une URL HTTPS sans identifiants');
  }
  return url.href.replace(/\/$/, '');
}

const gradle = await readFile(join(root, 'app/build.gradle.kts'), 'utf8');
const publishedKey = gradle.match(/\bsb_publishable_[a-zA-Z0-9_-]+\b/)?.[0];
const publishableKey = (process.env.FAST_SUPABASE_PUBLISHABLE_KEY || publishedKey || '').trim();
if (!/^sb_publishable_[a-zA-Z0-9_-]{12,}$/.test(publishableKey)) {
  throw new Error('Clé publique Supabase sb_publishable_ manquante ou invalide (jamais de service_role).');
}

const supabaseUrl = validHttps(
  process.env.FAST_SUPABASE_URL ||
    gradle.match(/https:\/\/[a-z0-9-]+\.supabase\.co\b/)?.[0] ||
    '',
  'FAST_SUPABASE_URL'
);
const apiUrl = validHttps(
  process.env.FAST_API_URL ||
    'https://fast-n1-python-api.vercel.app',
  'FAST_API_URL'
);

await mkdir(output, { recursive: true });
const entries = await readdir(source, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile()) await copyFile(join(source, entry.name), join(output, entry.name));
}

// Browser-only, deliberately minimal bridge. All privileged Android methods are absent.
const config = { apiUrl, supabaseUrl, supabaseKey: publishableKey };
const bridge = [
  "'use strict';",
  '(function () {',
  '  if (window.FastNative) return;',
  '  const config = Object.freeze(' + JSON.stringify(config) + ');',
  '  Object.defineProperty(window, "FastNative", {',
  '    value: Object.freeze({ config: () => JSON.stringify(config) }),',
  '    writable: false, configurable: false',
  '  });',
  '})();',
  ''
].join('\n');
await writeFile(join(output, 'web-bridge.js'), bridge);

let html = await readFile(join(source, 'index.html'), 'utf8');
const marker = '<script src="core.js"></script>';
if (!html.includes(marker) || !html.includes('</head>')) {
  throw new Error('Structure HTML FAST modifiée : injection du bridge impossible.');
}
html = html.replace('</head>', [
  '  <meta name="description" content="FAST N°1 : courses et suivi en temps réel, côté passager et chauffeur.">',
  '  <link rel="manifest" href="manifest.webmanifest">',
  '  <link rel="icon" href="fast-logo.svg" type="image/svg+xml">',
  '</head>'
].join('\n'));
html = html.replace(marker, '<script src="web-bridge.js"></script>\n' + marker);
await writeFile(join(output, 'index.html'), html);

const manifest = {
  name: 'FAST N°1 — Client et chauffeur',
  short_name: 'FAST',
  description: 'Service de mobilité FAST pour passagers et chauffeurs',
  lang: 'fr',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#0b57d0',
  icons: [{
    src: './fast-logo.svg',
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any'
  }]
};
await writeFile(join(output, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
console.log('FAST HTML construit à partir des assets Android : web/dist');
