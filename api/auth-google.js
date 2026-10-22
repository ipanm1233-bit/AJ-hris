const fs = require('fs');
const path = require('path');
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const {
  enforceRateLimit,
  writeAuditLog,
  assertAllowedKeys,
  verifyAppCheck,
  normalizeRole
} = require('../lib/security.js');
const {
  normalizeEmail,
  isValidEmail,
  inferRoleFromEmployee,
  isEmployeeActive,
  safeDocId
} = require('../lib/employee-profile.js');
const {
  findEmployeeByEmail,
  findUserByEmail,
  findUserForEmployee,
  findEmployeeForUser,
  sameNik
} = require('../lib/employee-record.js');

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

function authError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'));
  } catch {
    return {};
  }
}

function getGoogleClientId() {
  const fromEnv = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  if (fromEnv) return fromEnv;
  const config = readConfig();
  return String(config.oAuthClientId || '').trim();
}

function toIsoText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'object' && value._seconds !== undefined) {
    const date = new Date(Number(value._seconds) * 1000);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  const raw = String(value).trim();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

async function verifyGoogleCredential(credential, clientId) {
  if (!credential) throw authError('Kredensial Google tidak ditemukan. Silakan ulangi login.', 400);
  if (!clientId) throw authError('GOOGLE_OAUTH_CLIENT_ID belum dikonfigurasi di server.', 503);

  let response;
  try {
    response = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(credential)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    throw authError('Layanan verifikasi Google tidak dapat dihubungi. Coba lagi beberapa saat lagi.', 503);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw authError('Token Google tidak valid atau sudah kedaluwarsa.', 401);

  const issuer = String(payload.iss || '');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(issuer)) {
    throw authError('Penerbit token Google tidak dikenali.', 401);
  }
  if (String(payload.aud || '') !== String(clientId)) {
    throw authError('Token Google tidak ditujukan untuk aplikasi ini.', 401);
  }
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw authError('Email Google belum terverifikasi.', 403);
  }
  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) throw authError('Email Google tidak valid.', 400);
  if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) {
    throw authError('Token Google sudah kedaluwarsa. Silakan login ulang.', 401);
  }

  return {
    sub: String(payload.sub || ''),
    email,
    name: String(payload.name || '').trim().slice(0, 120),
    picture: String(payload.picture || '').trim().slice(0, 500)
  };
}

function buildBaseProfile(employee, user, googleIdentity) {
  const employeeData = employee?.data || {};
  const userData = user?.data || {};
  const nik = String(employeeData.nik_karyawan || employeeData.nik || userData.nik || employee?.id || '').trim();
  const username = String(userData.username || employeeData.username || nik || employee?.id || '').trim();
  const userId = String(user?.id || safeDocId(nik || employee?.id || `GOOGLE_${googleIdentity.email}`));

  return {
    id: userId,
    username,
    nik,
    nama: String(employeeData.nama_karyawan || userData.nama || googleIdentity.name || googleIdentity.email).trim(),
    email: googleIdentity.email,
    auth_email: String(userData.auth_email || googleIdentity.email).trim(),
    email_google: googleIdentity.email,
    role: normalizeRole(userData.role || employeeData.role || inferRoleFromEmployee(employeeData)),
    posisi: String(employeeData.jabatan || userData.posisi || '-').trim(),
    cabang: String(employeeData.cabang || userData.cabang || '-').trim(),
    divisi: String(employeeData.divisi || userData.divisi || '-').trim(),
    foto_url: googleIdentity.picture || employeeData.foto_url || userData.foto_url || null,
    active: isEmployeeActive(employeeData)
      && userData.active !== false
      && String(userData.status_akun || '').toUpperCase() !== 'NONAKTIF',
    must_change_password: false,
    auth_provider: 'google'
  };
}

async function getOrCreateAuthUser(admin, googleIdentity, existingUser, baseProfile) {
  let authUser = null;
  const linkedUid = String(existingUser?.data?.firebase_uid || '').trim();

  if (linkedUid) {
    try {
      authUser = await admin.auth().getUser(linkedUid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
  }

  if (!authUser) {
    try {
      authUser = await admin.auth().getUserByEmail(googleIdentity.email);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
  }

  if (!authUser) {
    try {
      authUser = await admin.auth().createUser({
        email: googleIdentity.email,
        emailVerified: true,
        displayName: baseProfile.nama,
        photoURL: baseProfile.foto_url || undefined,
        disabled: false
      });
    } catch (error) {
      if (error.code !== 'auth/email-already-exists') throw error;
      authUser = await admin.auth().getUserByEmail(googleIdentity.email);
    }
  }

  if (authUser.disabled) throw authError('Akun Google ini sudah dinonaktifkan.', 403);

  const updates = { displayName: baseProfile.nama };
  if (baseProfile.foto_url) updates.photoURL = baseProfile.foto_url;
  try {
    await admin.auth().updateUser(authUser.uid, updates);
  } catch (error) {
    console.warn('[auth-google] Unable to refresh Firebase display profile:', error.message);
  }

  return authUser;
}

async function linkContext(db, googleIdentity) {
  let employee = await findEmployeeByEmail(db, googleIdentity.email);
  let user = employee ? await findUserForEmployee(db, employee, googleIdentity.email) : null;

  if (!user) user = await findUserByEmail(db, googleIdentity.email);

  if (!employee && user) {
    employee = await findEmployeeForUser(db, {
      id: user.id,
      nik: user.data?.nik,
      username: user.data?.username,
      email: googleIdentity.email,
      uid: user.data?.firebase_uid
    });
  }

  if (employee && !user) {
    user = await findUserForEmployee(db, employee, googleIdentity.email);
  }

  return { employee, user };
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  }

  if (req.method === 'GET') {
    if (!enforceRateLimit(req, res, { namespace: 'auth-google-config', limit: 60, windowMs: 60_000 })) return;
    const clientId = getGoogleClientId();
    if (!clientId) {
      return res.status(503).json({ success: false, error: 'GOOGLE_OAUTH_CLIENT_ID belum dikonfigurasi di server.' });
    }
    return res.status(200).json({ success: true, clientId });
  }

  if (!enforceRateLimit(req, res, { namespace: 'auth-google', limit: 20, windowMs: 15 * 60_000 })) return;

  try {
    try {
      assertAllowedKeys(req.body || {}, ['credential']);
    } catch (error) {
      throw authError(error.message, 400);
    }
    const credential = String(req.body?.credential || '');
    const clientId = getGoogleClientId();
    const googleIdentity = await verifyGoogleCredential(credential, clientId);

    const { admin, db, error } = getFirebaseAdmin();
    if (!admin || !db) throw authError(error || 'Firebase Admin belum dikonfigurasi.', 503);
    await verifyAppCheck(req, admin);

    const { employee, user } = await linkContext(db, googleIdentity);
    if (!employee) {
      throw authError(
        `Email Google ${googleIdentity.email} belum terdaftar pada data karyawan. Hubungi HRD untuk mendaftarkan email tersebut.`,
        403
      );
    }

    const baseProfile = buildBaseProfile(employee, user, googleIdentity);
    if (!baseProfile.active) throw authError('Akun karyawan ini sudah tidak aktif.', 403);

    const authUser = await getOrCreateAuthUser(admin, googleIdentity, user, baseProfile);
    const now = new Date().toISOString();
    const userRef = user?.ref || db.collection('users').doc(baseProfile.id);

    // Jangan biarkan satu akun Firebase dipakai oleh dua dokumen karyawan
    // berbeda. Duplikat dokumen untuk NIK yang sama tetap ditoleransi.
    const linkedSnap = await db.collection('users').where('firebase_uid', '==', authUser.uid).limit(5).get();
    for (const linkedDoc of linkedSnap.docs) {
      if (linkedDoc.id === userRef.id) continue;
      const linked = { id: linkedDoc.id, data: linkedDoc.data() || {} };
      if (sameNik(linked, { data: { nik: baseProfile.nik } })) continue;
      throw authError('Akun Google ini sudah tertaut ke akun karyawan lain. Hubungi HRD.', 403);
    }

    const existingProfileSnap = await db.collection('auth_profiles').doc(authUser.uid).get();
    const existingProfile = existingProfileSnap.exists ? existingProfileSnap.data() : {};
    const masterVerifiedAt = toIsoText(employee.data?.profile_verified_at)
      || (employee.data?.profile_verification_completed === true
        ? (toIsoText(employee.data?.updated_at) || now)
        : '');
    const existingVerifiedAt = toIsoText(existingProfile.profile_verified_at);
    const profileVerifiedAt = masterVerifiedAt || existingVerifiedAt || null;

    let profileVerificationRequired = true;
    if (profileVerifiedAt) {
      profileVerificationRequired = false;
    } else if (typeof existingProfile.profile_verification_required === 'boolean') {
      profileVerificationRequired = existingProfile.profile_verification_required;
    }

    const profile = {
      ...baseProfile,
      uid: authUser.uid,
      auth_email: authUser.email || googleIdentity.email,
      email_google: googleIdentity.email,
      google_sub: googleIdentity.sub,
      google_linked_at: existingProfile.google_linked_at || now,
      profile_verification_required: profileVerificationRequired,
      profile_verified_at: profileVerifiedAt,
      last_location: existingProfile.last_location || employee.data?.last_location || null,
      updated_at: now
    };
    if (!existingProfile.created_at) profile.created_at = now;

    const claims = {
      role: profile.role,
      branch: String(profile.cabang || '').slice(0, 80),
      division: String(profile.divisi || '').slice(0, 80),
      username: String(profile.username || '').slice(0, 80),
      nik: String(profile.nik || '').slice(0, 80),
      password_change_required: false,
      active: true,
      auth_provider: 'google',
      profile_verification_required: profileVerificationRequired
    };
    if (profileVerifiedAt) claims.profile_verified_at = String(profileVerifiedAt).slice(0, 40);
    await admin.auth().setCustomUserClaims(authUser.uid, claims);

    await db.collection('auth_profiles').doc(authUser.uid).set(profile, { merge: true });

    const previousEmail = normalizeEmail(employee.data?.email || '');
    await employee.ref.set({
      email: googleIdentity.email,
      email_google: googleIdentity.email,
      firebase_uid: authUser.uid,
      auth_provider: 'google',
      email_synced_at: now,
      profile_verification_required: profileVerificationRequired,
      updated_at: now
    }, { merge: true });

    const userPayload = {
      username: profile.username,
      nama: profile.nama,
      nik: profile.nik,
      email: googleIdentity.email,
      email_google: googleIdentity.email,
      auth_email: profile.auth_email,
      firebase_uid: authUser.uid,
      auth_provider: 'google',
      role: profile.role,
      posisi: profile.posisi,
      cabang: profile.cabang,
      divisi: profile.divisi,
      foto_url: profile.foto_url,
      active: profile.active,
      status_akun: 'AKTIF',
      last_login_at: now,
      google_linked_at: profile.google_linked_at,
      profile_verification_required: profileVerificationRequired,
      updated_at: now
    };
    if (!user?.data?.created_at) userPayload.created_at = now;
    await userRef.set(userPayload, { merge: true });

    const customToken = await admin.auth().createCustomToken(authUser.uid);

    await writeAuditLog(db, req, { ...profile, name: profile.nama, branch: profile.cabang }, {
      action: 'GOOGLE_LOGIN_SUCCESS',
      module: 'AUTH',
      recordId: profile.nik || authUser.uid,
      metadata: {
        employee_nik: profile.nik,
        google_email: googleIdentity.email,
        previous_email: previousEmail || null,
        email_changed: Boolean(previousEmail && previousEmail !== googleIdentity.email),
        new_user_document: !user,
        profile_verification_required: profileVerificationRequired
      }
    });

    return res.status(200).json({
      success: true,
      customToken,
      profile,
      needs_profile_verification: profileVerificationRequired,
      profile_verification_required: profileVerificationRequired
    });
  } catch (error) {
    const status = Number(error.status) || 401;
    console.warn('[auth-google] rejected:', error.code || error.message);
    return res.status(status).json({
      success: false,
      error: error.message || 'Login Google gagal. Silakan coba lagi.'
    });
  }
};

module.exports._test = {
  verifyGoogleCredential,
  buildBaseProfile,
  getGoogleClientId,
  toIsoText
};
