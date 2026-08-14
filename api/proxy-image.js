const https = require('https');
const http = require('http');
const { URL } = require('url');

// Extract Google Drive File ID if present
function extractGoogleDriveId(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  let s = urlStr.trim();
  const hyperlinkMatch = s.match(/HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  if (hyperlinkMatch && hyperlinkMatch[1]) s = hyperlinkMatch[1].trim();
  s = s.replace(/^["'(\[]+|["')\]]+$/g, "").trim();

  // Pick first if multiple
  if (s.includes(",") || s.includes(";") || s.includes("\n")) {
    const parts = s.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) s = parts[0];
  }
  
  const m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/i) || 
            s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i) ||
            s.match(/\/d\/([a-zA-Z0-9_-]{20,})/i) ||
            s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/i) ||
            s.match(/drive\.usercontent\.google\.com\/download\?id=([a-zA-Z0-9_-]{20,})/i) ||
            s.match(/drive\.google\.com\/uc\?.*?id=([a-zA-Z0-9_-]{20,})/i);
            
  if (m && m[1]) return m[1];
  if (/^[a-zA-Z0-9_-]{25,100}$/.test(s)) return s;
  return null;
}

// Fetch URL with redirects and return Buffer + mime
async function fetchBinary(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    try {
      const parsedUrl = new URL(targetUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        timeout: 10000
      }, (res) => {
        // Handle Redirects (301, 302, 303, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, targetUrl).href;
          res.resume();
          return resolve(fetchBinary(redirectUrl, maxRedirects - 1));
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP status ${res.statusCode}`));
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || 'image/jpeg';
          resolve({ buffer, contentType });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = req.query?.url || req.body?.url;
  const isBase64Req = req.query?.format === 'base64' || req.body?.format === 'base64';

  if (!rawUrl) {
    return res.status(400).json({ success: false, error: 'Parameter url is required' });
  }

  const driveId = extractGoogleDriveId(rawUrl);

  const candidateUrls = [];
  if (driveId) {
    candidateUrls.push(`https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`);
    candidateUrls.push(`https://lh3.googleusercontent.com/d/${driveId}`);
    candidateUrls.push(`https://drive.google.com/uc?export=download&id=${driveId}`);
  }
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    candidateUrls.push(rawUrl);
  }

  let result = null;
  let lastError = null;

  for (const u of candidateUrls) {
    try {
      result = await fetchBinary(u);
      if (result && result.buffer && result.buffer.length > 100) {
        // If content-type is text/html (like Google drive error or confirmation page), skip
        if (result.contentType && result.contentType.includes('text/html')) {
          continue;
        }
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!result || !result.buffer || result.buffer.length === 0) {
    return res.status(404).json({
      success: false,
      error: `Gagal memuat gambar: ${lastError ? lastError.message : 'Not found'}`
    });
  }

  if (isBase64Req) {
    const b64 = result.buffer.toString('base64');
    const mime = result.contentType || 'image/jpeg';
    return res.json({
      success: true,
      dataUrl: `data:${mime};base64,${b64}`,
      size: result.buffer.length
    });
  }

  res.setHeader('Content-Type', result.contentType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(result.buffer);
};
