const crypto = require('crypto');
const { getFirebaseAdmin } = require('./firebase-admin.js');

const rateBuckets = new Map();

function getClientIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function enforceRateLimit(req, res, options = {}) {
  const {
    namespace = 'default',
    limit = 30,
    windowMs = 60_000,
    key = getClientIp(req)
  } = options;
  const now = Date.now();
  const bucketKey = `${namespace}:${key}`;
  const previous = rateBuckets.get(bucketKey);
  const bucket = !previous || previous.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : previous;
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ success: false, error: 'Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi.' });
    return false;
  }
  return true;
}

function getBearerToken(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function normalizeRole(value) {
  return String(value || 'STAFF').trim().toUpperCase();
}

function normalizeBranch(value) {
  return String(value || '').trim().toLowerCase();
}

async function loadAuthProfile(db, uid, decoded = {}) {
  const profileSnap = await db.collection('auth_profiles').doc(uid).get();
  const profile = profileSnap.exists ? profileSnap.data() : {};
  return {
    uid,
    email: decoded.email || profile.auth_email || '',
    role: normalizeRole(profile.role || decoded.role),
    branch: String(profile.cabang || decoded.branch || '').trim(),
    division: String(profile.divisi || decoded.division || '').trim(),
    active: decoded.active !== false && profile.active !== false,
    username: profile.username || '',
    nik: profile.nik || '',
    name: profile.nama || decoded.name || ''
  };
}

async function requireFirebaseAuth(req, res, options = {}) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Sesi login diperlukan.' });
    return null;
  }

  try {
    const { admin, db, error } = getFirebaseAdmin();
    if (!admin || !db) throw new Error(error || 'Firebase Admin belum tersedia.');
    const decoded = await admin.auth().verifyIdToken(token, true);
    await verifyAppCheck(req, admin);
    const user = await loadAuthProfile(db, decoded.uid, decoded);
    if (!user.active) {
      res.status(403).json({ success: false, error: 'Akun sudah dinonaktifkan.' });
      return null;
    }
    if (decoded.password_change_required === true && options.allowPasswordChangeRequired !== true) {
      res.status(403).json({ success: false, error: 'Password wajib diperbarui sebelum melanjutkan.' });
      return null;
    }

    const allowedRoles = (options.roles || []).map(normalizeRole);
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      res.status(403).json({ success: false, error: 'Anda tidak memiliki hak untuk menjalankan tindakan ini.' });
      return null;
    }
    return { admin, db, decoded, user };
  } catch (error) {
    console.warn('[security] Firebase token rejected:', error.code || error.message);
    res.status(401).json({ success: false, error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
    return null;
  }
}

async function verifyAppCheck(req, admin) {
  if (process.env.REQUIRE_APP_CHECK !== 'true') return true;
  const appCheckToken = String(req.headers?.['x-firebase-appcheck'] || '');
  if (!appCheckToken) throw new Error('App Check token is required.');
  await admin.appCheck().verifyToken(appCheckToken);
  return true;
}

function requireCronSecret(req, res) {
  const expected = process.env.CRON_SECRET;
  const actual = getBearerToken(req);
  if (!expected) {
    res.status(503).json({ success: false, error: 'CRON_SECRET belum dikonfigurasi.' });
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  const valid = expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  if (!valid) {
    res.status(401).json({ success: false, error: 'Cron authorization tidak valid.' });
    return false;
  }
  return true;
}

async function writeAuditLog(db, req, actor, event) {
  try {
    await db.collection('audit_logs').add({
      actor_uid: actor?.uid || 'SYSTEM',
      actor_name: actor?.name || actor?.username || 'SYSTEM',
      actor_role: actor?.role || 'SYSTEM',
      actor_branch: actor?.branch || '',
      action: String(event.action || 'UNKNOWN').slice(0, 80),
      module: String(event.module || '').slice(0, 80),
      record_id: String(event.recordId || '').slice(0, 180),
      success: event.success !== false,
      metadata: event.metadata || {},
      ip_hash: crypto.createHash('sha256').update(getClientIp(req)).digest('hex'),
      user_agent: String(req.headers?.['user-agent'] || '').slice(0, 300),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[security] Audit log write failed:', error.message);
  }
}

function assertAllowedKeys(body, allowedKeys) {
  const extras = Object.keys(body || {}).filter(key => !allowedKeys.includes(key));
  if (extras.length) throw new Error(`Field tidak diizinkan: ${extras.join(', ')}`);
}

function isSameBranch(user, branch) {
  return Boolean(normalizeBranch(user?.branch)) && normalizeBranch(user.branch) === normalizeBranch(branch);
}

module.exports = {
  enforceRateLimit,
  getBearerToken,
  getClientIp,
  normalizeRole,
  normalizeBranch,
  requireFirebaseAuth,
  verifyAppCheck,
  requireCronSecret,
  writeAuditLog,
  assertAllowedKeys,
  isSameBranch
};
