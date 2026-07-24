module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { url, apiKey, secretKey, accessToken, company, dataType } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL API Kanal belum diisi.' });
    }

    console.log(`[Kanal Proxy] Fetching live data from ${url} for ${company}`);

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
        error: `Server Kanal merespons dengan HTTP ${statusCode}`,
        rawResponse: responseText,
        data: jsonBody
      });
    }

    return res.status(200).json({
      success: true,
      statusCode,
      company,
      data: jsonBody || responseText,
      rawResponse: jsonBody ? null : responseText
    });

  } catch (error) {
    console.error('[Kanal Proxy Error]:', error);
    return res.status(500).json({
      success: false,
      error: `Gagal terhubung ke Server Kanal API: ${error.message}`
    });
  }
};
