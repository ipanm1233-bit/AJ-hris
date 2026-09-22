const { requireFirebaseAuth, enforceRateLimit } = require('../lib/security.js');

function sessionProfile(user = {}) {
  return {
    uid: user.uid,
    id: user.id || user.username || user.uid,
    username: user.username || '',
    nik: user.nik || '',
    nama: user.name || user.username || '',
    email: user.email || '',
    role: user.role || 'STAFF',
    posisi: user.position || '-',
    cabang: user.branch || '-',
    divisi: user.division || '-',
    foto_url: user.photo_url || null,
    active: user.active !== false,
    must_change_password: user.must_change_password === true
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'auth-session', limit: 60, windowMs: 60_000 })) return;
  const context = await requireFirebaseAuth(req, res, { allowPasswordChangeRequired: true });
  if (!context) return;

  // requireFirebaseAuth already resolves the Firestore profile and safely
  // falls back to verified Firebase custom claims when Firestore quota is
  // exhausted. Do not perform a second Firestore read here.
  return res.status(200).json({ success: true, profile: sessionProfile(context.user) });
};

module.exports._test = { sessionProfile };
