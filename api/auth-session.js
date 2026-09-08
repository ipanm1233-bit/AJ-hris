const { requireFirebaseAuth, enforceRateLimit } = require('../lib/security.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'auth-session', limit: 60, windowMs: 60_000 })) return;
  const context = await requireFirebaseAuth(req, res, { allowPasswordChangeRequired: true });
  if (!context) return;

  const profileSnap = await context.db.collection('auth_profiles').doc(context.user.uid).get();
  if (!profileSnap.exists) return res.status(403).json({ success: false, error: 'Profil keamanan belum tersedia.' });
  return res.status(200).json({ success: true, profile: profileSnap.data() });
};
