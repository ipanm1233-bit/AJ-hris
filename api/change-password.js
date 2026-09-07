const fs = require('fs');
const path = require('path');
const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');

function getApiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8')).apiKey || ''; }
  catch { return ''; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  const context = await requireFirebaseAuth(req, res, { allowPasswordChangeRequired: true });
  if (!context) return;
  if (!enforceRateLimit(req, res, { namespace: 'change-password', key: context.user.uid, limit: 5, windowMs: 15 * 60_000 })) return;
  try {
    assertAllowedKeys(req.body || {}, ['currentPassword', 'newPassword']);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 10 || newPassword.length > 128) {
      return res.status(400).json({ success: false, error: 'Password baru harus 10–128 karakter.' });
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({ success: false, error: 'Password harus memuat huruf besar, huruf kecil, angka, dan simbol.' });
    }
    const profileSnap = await context.db.collection('auth_profiles').doc(context.user.uid).get();
    const authEmail = profileSnap.data()?.auth_email || context.user.email;
    const apiKey = getApiKey();
    const verification = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authEmail, password: currentPassword, returnSecureToken: true })
    });
    if (!verification.ok) return res.status(401).json({ success: false, error: 'Password lama salah.' });

    const authUser = await context.admin.auth().updateUser(context.user.uid, { password: newPassword });
    await context.admin.auth().setCustomUserClaims(context.user.uid, {
      ...(authUser.customClaims || {}),
      password_change_required: false
    });
    await context.admin.auth().revokeRefreshTokens(context.user.uid);
    await context.db.collection('auth_profiles').doc(context.user.uid).set({
      must_change_password: false,
      password_changed_at: new Date().toISOString()
    }, { merge: true });
    const legacyUsers = await context.db.collection('users').where('firebase_uid', '==', context.user.uid).limit(5).get();
    const batch = context.db.batch();
    legacyUsers.forEach(snapshot => batch.set(snapshot.ref, {
      must_change_password: false,
      password_changed_at: new Date().toISOString()
    }, { merge: true }));
    if (!legacyUsers.empty) await batch.commit();
    await writeAuditLog(context.db, req, context.user, { action: 'PASSWORD_CHANGED', module: 'AUTH', recordId: context.user.uid });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[change-password]', error);
    return res.status(500).json({ success: false, error: 'Password gagal diubah.' });
  }
};
