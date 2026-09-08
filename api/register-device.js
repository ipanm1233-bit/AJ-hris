const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  const context = await requireFirebaseAuth(req, res);
  if (!context) return;
  if (!enforceRateLimit(req, res, { namespace: 'register-device', key: context.user.uid, limit: 10, windowMs: 60 * 60_000 })) return;
  try {
    assertAllowedKeys(req.body || {}, ['token']);
    const token = String(req.body?.token || '').trim();
    if (token.length < 20 || token.length > 4096) return res.status(400).json({ success: false, error: 'Token perangkat tidak valid.' });
    const value = context.admin.firestore.FieldValue.arrayUnion(token);
    const batch = context.db.batch();
    batch.set(context.db.collection('auth_profiles').doc(context.user.uid), { fcm_tokens: value, updated_at: new Date().toISOString() }, { merge: true });
    if (context.user.username) batch.set(context.db.collection('users').doc(context.user.username), { fcm_tokens: value }, { merge: true });
    if (context.user.nik) batch.set(context.db.collection('master_karyawan').doc(String(context.user.nik)), { fcm_tokens: value }, { merge: true });
    await batch.commit();
    await writeAuditLog(context.db, req, context.user, { action: 'DEVICE_REGISTERED', module: 'NOTIFICATIONS' });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[register-device]', error);
    return res.status(500).json({ success: false, error: 'Token perangkat gagal disimpan.' });
  }
};
