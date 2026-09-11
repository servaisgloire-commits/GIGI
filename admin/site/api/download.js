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
    const fileName = manifest.fileName || 'FAST-N1-ANDROID.apk';
    if (!apkUrl || !apkUrl.startsWith('https://github.com/servaisgloire-commits/GIGI/releases/download/')) {
      throw new Error('Invalid APK source');
    }

    const upstream = await fetch(apkUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'FAST-N1-Official-Downloader/1.0' }
    });
    if (!upstream.ok) throw new Error(`APK upstream HTTP ${upstream.status}`);

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'HEAD') return res.status(200).end();

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length < 1000000) throw new Error('APK file is unexpectedly small');
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('FAST APK proxy failed', error);
    return res.status(500).json({ ok: false, error: 'APK download unavailable' });
  }
}
