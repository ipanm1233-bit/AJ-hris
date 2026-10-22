// Vercel Hobby hanya mengizinkan 12 Vercel Functions per deployment.
// Endpoint akun/profil digabung menjadi satu function agar tetap di bawah batas.
// Di Vercel, path lama diarahkan lewat rewrite ke /api/account?action=...
// Di Express lokal, action ditentukan dari path asli request.
const ACTIONS = {
  'auth-google': require('../handlers/auth-google.js'),
  'auth-session': require('../handlers/auth-session.js'),
  'profile-verify': require('../handlers/profile-verify.js'),
  'profile-update': require('../handlers/profile-update.js'),
  'profile-location': require('../handlers/profile-location.js'),
  'change-password': require('../handlers/change-password.js')
};

const PATHS = {
  '/api/auth-google': 'auth-google',
  '/api/auth-session': 'auth-session',
  '/api/profile-verify': 'profile-verify',
  '/api/profile-update': 'profile-update',
  '/api/profile-location': 'profile-location',
  '/api/change-password': 'change-password'
};

function requestUrl(req) {
  const raw = String(req?.url || '');
  try {
    return new URL(raw, 'http://localhost');
  } catch {
    return new URL('http://localhost/');
  }
}

function resolveAction(req) {
  const query = req?.query;
  let requested = '';
  if (query && typeof query.action === 'string') requested = query.action;
  if (!requested) requested = requestUrl(req).searchParams.get('action') || '';
  requested = requested.trim().toLowerCase();
  if (requested && ACTIONS[requested]) return requested;

  const expressPath = typeof req?.path === 'string' ? req.path : '';
  const urlPath = requestUrl(req).pathname;
  const pathname = String(expressPath || urlPath || '').replace(/\/+$/, '') || '/';
  return PATHS[pathname] || '';
}

module.exports = async function handler(req, res, next) {
  const action = resolveAction(req);
  if (!action) {
    return res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan.' });
  }

  try {
    return await ACTIONS[action](req, res, next);
  } catch (error) {
    console.error(`[account:${action}]`, error);
    if (typeof next === 'function') return next(error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
    }
  }
};

module.exports._test = { resolveAction, ACTIONS, PATHS };
