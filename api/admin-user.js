const crypto = require('crypto');
const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys, normalizeRole } = require('../lib/security.js');

const ALLOWED_ROLES = new Set(['HRD', 'GM', 'FINANCE', 'SPV', 'ATASAN', 'MANAGER', 'BRANCH MANAGER', 'SALES', 'STAFF', 'DRIVER', 'HELPER', 'WAREHOUSE', 'GA', 'BACK OFFICE', 'BACKOFFICE']);

function internalEmail(username) {
  const hash = crypto.createHash('sha256').update(username).digest('hex').slice(0, 32);
  return `user_${hash}@auth.andelajaya.internal`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function strongPassword(value) {
  const password = String(value || '');
  return password.length >= 10 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

module.exports = async function handler(req, res) {
  if (!['POST', 'PATCH'].includes(req.method)) return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  const context = await requireFirebaseAuth(req, res, { roles: ['HRD', 'SUPERADMIN'] });
  if (!context) return;
  if (!enforceRateLimit(req, res, { namespace: 'admin-user', key: context.user.uid, limit: 40, windowMs: 60 * 60_000 })) return;

  try {
    assertAllowedKeys(req.body || {}, ['username', 'password', 'nama', 'role', 'posisi', 'email', 'nik', 'cabang', 'divisi', 'no_hp', 'active']);
    const username = String(req.body?.username || '').trim().toUpperCase();
    const password = String(req.body?.password || '');
    const role = normalizeRole(req.body?.role);
    if (!/^[A-Z0-9._-]{2,80}$/.test(username)) return res.status(400).json({ success: false, error: 'Format username tidak valid.' });
    if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ success: false, error: 'Role tidak diizinkan.' });
    if (password && !strongPassword(password)) return res.status(400).json({ success: false, error: 'Password minimal 10 karakter dan wajib memuat huruf besar, huruf kecil, angka, serta simbol.' });

    const existingSnap = await context.db.collection('users').doc(username).get();
    const existing = existingSnap.exists ? existingSnap.data() : {};
    let employee = {};
    const nik = String(req.body?.nik || existing.nik || '').trim();
    if (nik && nik !== '-') {
      const employeeSnap = await context.db.collection('master_karyawan').doc(nik).get();
      if (employeeSnap.exists) employee = employeeSnap.data();
    }

    let firebaseUser = null;
    if (existing.firebase_uid) firebaseUser = await context.admin.auth().getUser(existing.firebase_uid);
    const contactEmail = String(req.body?.email || existing.email || employee.email || '').trim().toLowerCase();
    const authEmail = firebaseUser?.email || existing.auth_email || (validEmail(contactEmail) ? contactEmail : internalEmail(username));
    const active = req.body?.active === undefined ? existing.active !== false : ![false, 'false', 'NONAKTIF'].includes(req.body.active);
    const authUpdate = {
      email: authEmail,
      displayName: String(req.body?.nama || existing.nama || employee.nama_karyawan || username).slice(0, 100),
      disabled: !active
    };
    if (password) authUpdate.password = password;

    if (firebaseUser) {
      firebaseUser = await context.admin.auth().updateUser(firebaseUser.uid, authUpdate);
    } else {
      if (!password) return res.status(400).json({ success: false, error: 'Password awal wajib untuk akun baru.' });
      firebaseUser = await context.admin.auth().createUser(authUpdate);
    }

    const profile = {
      uid: firebaseUser.uid,
      id: existing.id || username,
      username,
      nik: nik || '-',
      nama: authUpdate.displayName,
      email: contactEmail,
      auth_email: authEmail,
      role,
      posisi: String(req.body?.posisi || existing.posisi || employee.jabatan || '-'),
      cabang: String(req.body?.cabang || existing.cabang || employee.cabang || '-'),
      divisi: String(req.body?.divisi || existing.divisi || employee.divisi || '-'),
      no_hp: String(req.body?.no_hp || existing.no_hp || ''),
      active,
      updated_at: new Date().toISOString()
    };
    await context.admin.auth().setCustomUserClaims(firebaseUser.uid, {
      role, branch: profile.cabang.slice(0, 80), division: profile.divisi.slice(0, 80),
      username: profile.username.slice(0, 80), nik: profile.nik.slice(0, 80),
      password_change_required: false, active
    });
    await context.db.collection('auth_profiles').doc(firebaseUser.uid).set(profile, { merge: true });
    await context.db.collection('users').doc(username).set({
      ...profile,
      firebase_uid: firebaseUser.uid,
      password: context.admin.firestore.FieldValue.delete(),
      password_hash: context.admin.firestore.FieldValue.delete()
    }, { merge: true });

    const securityAttributesChanged = !existingSnap.exists || normalizeRole(existing.role) !== role ||
      String(existing.cabang || '') !== profile.cabang || String(existing.divisi || '') !== profile.divisi ||
      existing.active !== active;
    if (!active || securityAttributesChanged) await context.admin.auth().revokeRefreshTokens(firebaseUser.uid);
    await writeAuditLog(context.db, req, context.user, {
      action: existingSnap.exists ? 'USER_UPDATED' : 'USER_CREATED', module: 'USER_MANAGEMENT', recordId: firebaseUser.uid,
      metadata: { username, role, active }
    });
    return res.status(200).json({ success: true, profile });
  } catch (error) {
    console.error('[admin-user]', error);
    return res.status(500).json({ success: false, error: 'Gagal menyimpan akun pengguna.' });
  }
};
