export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const manifestResponse = await fetch('https://raw.githubusercontent.com/servaisgloire-commits/GIGI/main/updates/latest.json', {
      cache: 'no-store',
      headers: { 'User-Agent': 'FAST-N1-Official-Downloader/1.0' }
    });
    if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`);

    const manifest = await manifestResponse.json();
    const apkUrl = manifest.sourceApkUrl;
    if (!apkUrl || !apkUrl.startsWith('https://github.com/servaisgloire-commits/GIGI/releases/download/')) {
      throw new Error('Invalid APK source');
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.redirect(302, apkUrl);
  } catch (error) {
    console.error('FAST APK redirect failed', error);
    return res.status(500).json({ ok: false, error: 'APK download unavailable' });
  }
}
