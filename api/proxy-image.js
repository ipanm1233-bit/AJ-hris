const https = require('https');
const { URL } = require('url');
const { enforceRateLimit } = require('../lib/security.js');

function isAllowedExternalUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'drive.google.com' || host === 'drive.usercontent.google.com' ||
      host === 'firebasestorage.googleapis.com' || host.endsWith('.googleusercontent.com');
  } catch {
    return false;
  }
}

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
    if (!isAllowedExternalUrl(targetUrl)) return reject(new Error('External image host is not allowed'));

    try {
      const parsedUrl = new URL(targetUrl);
      const req = https.get(targetUrl, {
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

        const declaredSize = Number(res.headers['content-length'] || 0);
        if (declaredSize > 8 * 1024 * 1024) {
          res.resume();
          return reject(new Error('Image exceeds 8 MB limit'));
        }

        const chunks = [];
        let received = 0;
        res.on('data', chunk => {
          received += chunk.length;
          if (received > 8 * 1024 * 1024) {
            req.destroy(new Error('Image exceeds 8 MB limit'));
            return;
          }
          chunks.push(chunk);
        });
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

function detectSafeImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const signature = buffer.subarray(0, 6).toString('ascii');
  if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'OPTIONS'].includes(req.method)) return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'proxy-image', limit: 120, windowMs: 60_000 })) return;
  // Enable CORS
  const allowedOrigin = process.env.APP_ORIGIN || '';
  const requestOrigin = String(req.headers?.origin || '');
  if (allowedOrigin && requestOrigin === allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
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
  if (!extractGoogleDriveId(rawUrl) && !isAllowedExternalUrl(rawUrl)) {
    return res.status(400).json({ success: false, error: 'Domain gambar tidak diizinkan.' });
  }

  const driveId = extractGoogleDriveId(rawUrl);

  const candidateUrls = [];
  if (driveId) {
    candidateUrls.push(`https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`);
    candidateUrls.push(`https://lh3.googleusercontent.com/d/${driveId}`);
    candidateUrls.push(`https://drive.google.com/uc?export=download&id=${driveId}`);
  }
  if (isAllowedExternalUrl(rawUrl)) {
    candidateUrls.push(rawUrl);
  }

  let result = null;

  for (const u of candidateUrls) {
    try {
      result = await fetchBinary(u);
      if (result && result.buffer && result.buffer.length > 100) {
        const safeMime = detectSafeImageMime(result.buffer);
        if (!safeMime) continue;
        result.contentType = safeMime;
        break;
      }
    } catch (e) {
      console.warn('[proxy-image] candidate rejected:', e.message);
    }
  }

  if (!result || !result.buffer || result.buffer.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Gagal memuat gambar atau format gambar tidak didukung.'
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
