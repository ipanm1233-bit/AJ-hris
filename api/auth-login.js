const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const { enforceRateLimit, writeAuditLog, assertAllowedKeys, verifyAppCheck } = require('../lib/security.js');

function cleanIdentifier(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  return String(value || 'STAFF').trim().toUpperCase();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function strongPassword(value) {
  const password = String(value || '');
  return password.length >= 10 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function internalAuthEmail(documentId) {
  const digest = sha256(documentId).slice(0, 32);
  return `user_${digest}@auth.andelajaya.internal`;
}

function getFirebaseWebApiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
    return config.apiKey || '';
  } catch {
    return '';
  }
}

async function findLegacyUser(db, identifier) {
  const raw = cleanIdentifier(identifier);
  const candidates = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()])];
  for (const id of candidates) {
    const snap = await db.collection('users').doc(id).get();
    if (snap.exists) return { ref: snap.ref, id: snap.id, data: snap.data() };
  }

  const fields = ['username', 'nik', 'email'];
  for (const field of fields) {
    for (const candidate of candidates) {
      const snap = await db.collection('users').where(field, '==', candidate).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        return { ref: doc.ref, id: doc.id, data: doc.data() };
      }
    }
  }
  return null;
}

async function getEmployee(db, user, identifier) {
  const nik = String(user.nik || (/^\d+$/.test(identifier) ? identifier : '')).trim();
  if (nik) {
    const direct = await db.collection('master_karyawan').doc(nik).get();
    if (direct.exists) return direct.data();
    const byNik = await db.collection('master_karyawan').where('nik', '==', nik).limit(1).get();
    if (!byNik.empty) return byNik.docs[0].data();
    const byNikKaryawan = await db.collection('master_karyawan').where('nik_karyawan', '==', nik).limit(1).get();
    if (!byNikKaryawan.empty) return byNikKaryawan.docs[0].data();
  }
  if (user.nama) {
    const byName = await db.collection('master_karyawan').where('nama_karyawan', '==', user.nama).limit(1).get();
    if (!byName.empty) return byName.docs[0].data();
  }
  return {};
}

function buildProfile(uid, documentId, user, employee, authEmail) {
  return {
    uid,
    id: user.id || documentId,
    username: user.username || documentId,
    nik: String(user.nik || employee.nik_karyawan || employee.nik || ''),
    nama: user.nama || employee.nama_karyawan || user.username || documentId,
    email: user.email || employee.email || '',
    auth_email: authEmail,
    role: normalizeRole(user.role || employee.role),
    posisi: user.posisi || employee.jabatan || '-',
    cabang: employee.cabang || user.cabang || '-',
    divisi: employee.divisi || user.divisi || '-',
    foto_url: employee.foto_url || user.foto_url || null,
    active: user.active !== false && user.status_akun !== 'NONAKTIF'
  };
}

async function verifyFirebasePassword(email, password) {
  const apiKey = getFirebaseWebApiKey();
  if (!apiKey) throw new Error('FIREBASE_API_KEY belum dikonfigurasi.');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Username/NIK atau password salah.');
    error.code = payload?.error?.message || 'INVALID_CREDENTIALS';
    throw error;
  }
  return payload;
}

async function migrateOrVerifyUser(admin, db, legacy, identifier, password) {
  const user = legacy.data;
  const employee = await getEmployee(db, user, identifier);
  let uid = user.firebase_uid || '';
  let authEmail = user.auth_email || '';
  let authUser = null;
  let migratedNow = false;

  if (uid) {
    authUser = await admin.auth().getUser(uid);
    authEmail = authUser.email || authEmail;
    await verifyFirebasePassword(authEmail, password);
    const existingProfile = await db.collection('auth_profiles').doc(uid).get();
    if (existingProfile.exists) user.must_change_password = existingProfile.data().must_change_password === true;
  } else {
    const storedHash = String(user.password_hash || '');
    const storedPlain = String(user.password || '');
    const validLegacy = (storedHash && storedHash === sha256(password)) || (storedPlain && storedPlain === password);
    if (!validLegacy) throw new Error('Username/NIK atau password salah.');

    const preferredEmail = String(user.email || employee.email || '').trim().toLowerCase();
    authEmail = isValidEmail(preferredEmail) ? preferredEmail : internalAuthEmail(legacy.id);
    try {
      authUser = await admin.auth().getUserByEmail(authEmail);
      await admin.auth().updateUser(authUser.uid, { password, disabled: false });
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      authUser = await admin.auth().createUser({
        email: authEmail,
        password,
        displayName: user.nama || employee.nama_karyawan || user.username || legacy.id,
        disabled: false
      });
    }
    uid = authUser.uid;
    migratedNow = true;
  }

  const profile = buildProfile(uid, legacy.id, user, employee, authEmail);
  profile.must_change_password = migratedNow ? !strongPassword(password) : user.must_change_password === true;
  if (!profile.active) throw new Error('Akun sudah dinonaktifkan.');

  const claims = {
    role: profile.role,
    branch: String(profile.cabang || '').slice(0, 80),
    division: String(profile.divisi || '').slice(0, 80),
    username: String(profile.username || '').slice(0, 80),
    nik: String(profile.nik || '').slice(0, 80),
    password_change_required: profile.must_change_password === true,
    active: true
  };
  await admin.auth().setCustomUserClaims(uid, claims);
  await db.collection('auth_profiles').doc(uid).set({ ...profile, updated_at: new Date().toISOString() }, { merge: true });

  await legacy.ref.set({
    firebase_uid: uid,
    auth_email: authEmail,
    auth_migrated_at: user.auth_migrated_at || new Date().toISOString(),
    must_change_password: profile.must_change_password,
    password: admin.firestore.FieldValue.delete(),
    password_hash: admin.firestore.FieldValue.delete()
  }, { merge: true });

  return profile;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'auth-login', limit: 7, windowMs: 15 * 60_000 })) return;

  try {
    assertAllowedKeys(req.body || {}, ['identifier', 'password', 'verifyOnly']);
    const identifier = cleanIdentifier(req.body?.identifier);
    const password = String(req.body?.password || '');
    const verifyOnly = req.body?.verifyOnly === true;
    if (!identifier || !password || password.length > 128) {
      return res.status(400).json({ success: false, error: 'Username/NIK dan password wajib diisi.' });
    }

    const { admin, db, error } = getFirebaseAdmin();
    if (!admin || !db) throw new Error(error || 'Firebase Admin belum dikonfigurasi.');
    await verifyAppCheck(req, admin);
    const legacy = await findLegacyUser(db, identifier);
    if (!legacy) return res.status(401).json({ success: false, error: 'Username/NIK atau password salah.' });

    const profile = await migrateOrVerifyUser(admin, db, legacy, identifier, password);
    const customToken = verifyOnly ? null : await admin.auth().createCustomToken(profile.uid);
    await writeAuditLog(db, req, profile, {
      action: verifyOnly ? 'PASSWORD_REAUTH_SUCCESS' : 'LOGIN_SUCCESS',
      module: 'AUTH',
      recordId: profile.uid
    });

    return res.status(200).json({ success: true, customToken, profile });
  } catch (error) {
    console.warn('[auth-login] rejected:', error.code || error.message);
    return res.status(401).json({ success: false, error: 'Username/NIK atau password salah.' });
  }
};
