module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    service: 'FAST + Talent Congo Agent Intelligence Core',
    version: '2.0',
    deletion_capability: false,
    ai_gateway: Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY)
  });
};
