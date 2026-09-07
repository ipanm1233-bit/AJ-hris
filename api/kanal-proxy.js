const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const context = await requireFirebaseAuth(req, res, { roles: ['HRD', 'SUPERADMIN', 'SPV', 'MANAGER', 'BRANCH MANAGER', 'GM'] });
    if (!context) return;
    if (!enforceRateLimit(req, res, { namespace: 'kanal-proxy', key: context.user.uid, limit: 30, windowMs: 60 * 60_000 })) return;
    assertAllowedKeys(req.body || {}, ['url', 'company', 'dataType']);
    const { url, company, dataType } = req.body;
    const apiKey = process.env.KANAL_API_KEY || '';
    const secretKey = process.env.KANAL_SECRET_KEY || '';
    const accessToken = process.env.KANAL_ACCESS_TOKEN || '';

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL API Kanal belum diisi.' });
    }
    if (!apiKey || !secretKey || !accessToken) {
      return res.status(503).json({ success: false, error: 'Credential Kanal belum dikonfigurasi di server.' });
    }
    const parsedTarget = new URL(url);
    if (parsedTarget.protocol !== 'https:' || parsedTarget.hostname !== 'api.kanal.work' || !parsedTarget.pathname.startsWith('/v1/')) {
      return res.status(400).json({ success: false, error: 'Tujuan API Kanal tidak diizinkan.' });
    }

    console.log(`[Kanal Proxy] Fetching ${parsedTarget.pathname} for ${String(company || '').slice(0, 100)}`);

    // Native Node 18+ fetch or dynamic import
    const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const tokenToUse = accessToken || apiKey || '';

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        'X-Kanal-Api-Key': apiKey || '',
        'X-Kanal-Secret-Key': secretKey || '',
        'Authorization': `Bearer ${tokenToUse}`,
        'Accept': 'application/json',
        'User-Agent': 'Andela-HRIS-Integration/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const statusCode = response.status;
    const responseText = await response.text();
    if (Buffer.byteLength(responseText) > 10 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Respons Kanal melebihi batas 10 MB.' });
    }

    let jsonBody = null;
    try {
      jsonBody = JSON.parse(responseText);
    } catch (e) {
      // Not JSON
    }

    if (!response.ok) {
      return res.status(statusCode).json({
        success: false,
        statusCode,
        error: `Server Kanal merespons dengan HTTP ${statusCode}`
      });
    }

    await writeAuditLog(context.db, req, context.user, {
      action: 'KANAL_SYNC', module: 'KANAL',
      metadata: { company: String(company || '').slice(0, 100), data_type: String(dataType || '').slice(0, 80), status_code: statusCode }
    });

    return res.status(200).json({
      success: true,
      statusCode,
      company,
      data: jsonBody || responseText,
      rawResponse: jsonBody ? null : responseText.slice(0, 100_000)
    });

  } catch (error) {
    console.error('[Kanal Proxy Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Gagal terhubung ke Server Kanal API.'
    });
  }
};
