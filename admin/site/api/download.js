export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method Not Allowed');
  }

  const apkUrl = 'https://github.com/servaisgloire-commits/GIGI/releases/download/fast-n1-11-09-2026/FAST-N1-11-09-2026-ANDROID.apk';

  try {
    const upstream = await fetch(apkUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'FAST-N1-Official-Downloader/1.0' }
    });

    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: `APK upstream HTTP ${upstream.status}` });
    }

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="FAST-N1-11-09-2026-ANDROID.apk"');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'HEAD') return res.status(200).end();

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length < 1000000) {
      return res.status(502).json({ ok: false, error: 'APK file is unexpectedly small' });
    }
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('FAST APK proxy failed', error);
    return res.status(500).json({ ok: false, error: 'APK download unavailable' });
  }
}
