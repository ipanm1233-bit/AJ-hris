const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const { enforceDistributedRateLimit, writeAuditLog, assertAllowedKeys, verifyAppCheck, isFirestoreQuotaError } = require('../lib/security.js');
const { strongPassword } = require('../lib/password-policy.js');
const { isMailConfigured, sendMail } = require('../lib/mailer.js');

function cleanIdentifier(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  return String(value || 'STAFF').trim().toUpperCase();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function maskEmail(value) {
  const email = String(value || '').trim();
  const at = email.indexOf('@');
  if (at <= 0) return '';
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

function clientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || req?.ip || '-').trim() || '-';
}

function formatLoginTime(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: 'Asia/Jakarta'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function buildLoginConfirmationEmail(profile = {}, meta = {}) {
  const nama = escapeHtml(profile.nama || profile.username || 'Karyawan');
  const waktu = escapeHtml(meta.time || formatLoginTime(meta.at || new Date()));
  const perangkat = escapeHtml(String(meta.userAgent || 'Tidak diketahui').slice(0, 300));
  const ip = escapeHtml(meta.ip || '-');
  const akun = escapeHtml(profile.username || profile.nik || profile.uid || '-');
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
<div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
  <div style="height:7px;background:#7a1f2b"></div>
  <div style="padding:28px">
    <span style="font-size:11px;font-weight:800;color:#7a1f2b;letter-spacing:.12em">KONFIRMASI LOGIN</span>
    <h1 style="font-size:23px;line-height:1.3;margin:10px 0 8px">Login berhasil ke HRIS Andela Jaya</h1>
    <p style="font-size:14px;line-height:1.7;margin:0 0 18px">Halo <strong>${nama}</strong>, akun HRIS Anda baru saja digunakan untuk masuk menggunakan username/NIK dan kata sandi.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <tr><td style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:700;width:38%">Waktu login</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${waktu}</td></tr>
      <tr><td style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:700">Akun</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${akun}</td></tr>
      <tr><td style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:700">Alamat IP</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${ip}</td></tr>
      <tr><td style="padding:10px 12px;background:#f8fafc;font-weight:700;vertical-align:top">Perangkat</td><td style="padding:10px 12px;word-break:break-word">${perangkat}</td></tr>
    </table>
    <div style="margin-top:18px;padding:13px 15px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;font-size:12.5px;line-height:1.65;color:#9a3412">
      <strong>Catatan keamanan:</strong> jika Anda tidak merasa melakukan login ini, segera ubah kata sandi Anda dan hubungi HRD.
    </div>
    <p style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:18px;margin-top:24px">Email ini dikirim otomatis oleh HRIS Andela Jaya. Jangan membalas email ini.</p>
  </div>
</div>
</body></html>`;
}

/**
 * Kirim email konfirmasi login ke email yang terdaftar pada profil/master karyawan.
 * Kegagalan pengiriman tidak boleh mengunci pengguna dari sistem; statusnya
 * dikembalikan agar bisa ditampilkan dan dicatat pada audit log.
 */
async function sendLoginConfirmation(profile, req) {
  const registered = String(profile?.email || '').trim();
  const authEmail = String(profile?.auth_email || '').trim();
  const fallbackEmail = isValidEmail(authEmail) && !authEmail.toLowerCase().endsWith('@auth.andelajaya.internal') ? authEmail : '';
  const to = isValidEmail(registered) ? registered : fallbackEmail;
  if (!to) {
    return { sent: false, reason: 'no_registered_email' };
  }
  if (!isMailConfigured()) {
    console.warn('[auth-login] email konfirmasi tidak dikirim: GMAIL_USER/GMAIL_APP_PASSWORD belum diset.');
    return { sent: false, reason: 'mail_not_configured' };
  }
  try {
    const info = await sendMail({
      from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Konfirmasi Login HRIS Andela Jaya',
      html: buildLoginConfirmationEmail(profile, {
        at: new Date(),
        ip: clientIp(req),
        userAgent: req?.headers?.['user-agent'] || 'Tidak diketahui'
      }),
      disableFileAccess: true,
      disableUrlAccess: true
    });
    return { sent: true, messageId: info.messageId, recipient: maskEmail(to) };
  } catch (error) {
    console.warn('[auth-login] email konfirmasi gagal dikirim:', error.message);
    return { sent: false, reason: 'send_failed' };
  }
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
  const matches = new Map();
  const remember = (snap) => {
    if (snap?.exists) matches.set(snap.id, { ref: snap.ref, id: snap.id, data: snap.data() });
  };

  for (const id of candidates) {
    const snap = await db.collection('users').doc(id).get();
    remember(snap);
  }

  const fields = ['username', 'nik', 'email'];
  for (const field of fields) {
    const fieldCandidates = field === 'nik' && /^\d+$/.test(raw)
      ? [...candidates, Number(raw)]
      : candidates;
    for (const candidate of [...new Set(fieldCandidates)]) {
      const snap = await db.collection('users').where(field, '==', candidate).limit(1).get();
      if (!snap.empty) {
        remember(snap.docs[0]);
      }
    }
  }

  // Data lama dapat mempunyai dua dokumen untuk orang yang sama: document ID
  // berupa NIK dan akun utama berupa username. Jangan langsung memilih dokumen
  // NIK yang kosong; prioritaskan akun yang sudah dimigrasi atau masih memiliki
  // kredensial legacy agar login pertama tetap dapat berlangsung.
  const normalized = raw.toLowerCase();
  return [...matches.values()].sort((a, b) => {
    const score = (entry) => {
      const user = entry.data || {};
      let value = 0;
      if (user.firebase_uid) value += 100;
      if (user.password_hash || user.password) value += 50;
      if (String(user.username || '').trim().toLowerCase() === normalized) value += 20;
      if (String(entry.id || '').trim().toLowerCase() === normalized) value += 10;
      return value;
    };
    return score(b) - score(a);
  })[0] || null;
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

function registeredEmail(user = {}, employee = {}) {
  const candidates = [
    user.email, user.email_karyawan, user.email_perusahaan,
    employee.email, employee.email_karyawan, employee.email_perusahaan,
    employee.email_pribadi, employee.email_personal, employee.email_aktif
  ];
  return candidates.map(value => String(value || '').trim()).find(value => isValidEmail(value)) || '';
}

function buildProfile(uid, documentId, user, employee, authEmail) {
  return {
    uid,
    id: user.id || documentId,
    username: user.username || documentId,
    nik: String(user.nik || employee.nik_karyawan || employee.nik || ''),
    nama: user.nama || employee.nama_karyawan || user.username || documentId,
    email: registeredEmail(user, employee),
    auth_email: authEmail,
    role: normalizeRole(user.role || employee.role),
    posisi: user.posisi || employee.jabatan || '-',
    cabang: employee.cabang || user.cabang || '-',
    divisi: employee.divisi || user.divisi || '-',
    foto_url: employee.foto_url || user.foto_url || null,
    active: user.active !== false && user.status_akun !== 'NONAKTIF',
    auth_provider: 'password',
    profile_verification_required: false,
    profile_verified_at: null
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

function profileFromFirebaseUser(authUser) {
  const claims = authUser.customClaims || {};
  const authEmail = String(authUser.email || '');
  const publicEmail = authEmail.endsWith('@auth.andelajaya.internal') ? '' : authEmail;
  return {
    uid: authUser.uid,
    id: claims.username || authUser.uid,
    username: String(claims.username || '').trim(),
    nik: String(claims.nik || '').trim(),
    nama: authUser.displayName || claims.username || claims.nik || 'Karyawan',
    email: publicEmail,
    auth_email: authEmail,
    role: normalizeRole(claims.role),
    posisi: '-',
    cabang: String(claims.branch || '').trim(),
    divisi: String(claims.division || '').trim(),
    foto_url: authUser.photoURL || null,
    active: authUser.disabled !== true && claims.active !== false,
    must_change_password: claims.password_change_required === true,
    auth_provider: claims.auth_provider || 'password',
    profile_verification_required: claims.profile_verification_required === true,
    profile_verified_at: claims.profile_verified_at || null
  };
}

async function findFirebaseAuthUser(admin, identifier) {
  const wanted = cleanIdentifier(identifier).toLowerCase();
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    const match = page.users.find(authUser => {
      const claims = authUser.customClaims || {};
      return [authUser.uid, authUser.email, claims.username, claims.nik]
        .filter(Boolean)
        .some(value => String(value).trim().toLowerCase() === wanted);
    });
    if (match) return match;
    pageToken = page.pageToken;
  } while (pageToken);
  return null;
}

async function verifyWithoutFirestore(admin, identifier, password) {
  const authUser = await findFirebaseAuthUser(admin, identifier);
  if (!authUser?.email) throw new Error('Username/NIK atau password salah.');
  const profile = profileFromFirebaseUser(authUser);
  if (!profile.active) throw new Error('Akun sudah dinonaktifkan.');
  await verifyFirebasePassword(authUser.email, password);
  return profile;
}

async function migrateOrVerifyUser(admin, db, legacy, identifier, password) {
  const user = legacy.data;
  const employee = await getEmployee(db, user, identifier);
  let uid = user.firebase_uid || '';
  let authEmail = user.auth_email || '';
  let authUser = null;
  let migratedNow = false;
  let authProfileData = {};

  if (uid) {
    authUser = await admin.auth().getUser(uid);
    authEmail = authUser.email || authEmail;
    await verifyFirebasePassword(authEmail, password);
    const existingProfile = await db.collection('auth_profiles').doc(uid).get();
    if (existingProfile.exists) {
      authProfileData = existingProfile.data() || {};
      user.must_change_password = authProfileData.must_change_password === true;
    }
  } else {
    const storedHash = String(user.password_hash || '');
    const storedPlain = String(user.password || '');
    const validLegacy = (storedHash && storedHash === sha256(password)) || (storedPlain && storedPlain === password);
    if (!validLegacy) throw new Error('Username/NIK atau password salah.');

    const preferredEmail = registeredEmail(user, employee).toLowerCase();
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

  if (!Object.keys(authProfileData).length && uid) {
    const existingProfile = await db.collection('auth_profiles').doc(uid).get();
    if (existingProfile.exists) authProfileData = existingProfile.data() || {};
  }

  const profile = buildProfile(uid, legacy.id, user, employee, authEmail);
  profile.must_change_password = migratedNow ? !strongPassword(password) : user.must_change_password === true;
  if (authProfileData.email) profile.email = authProfileData.email;
  profile.auth_provider = authProfileData.auth_provider || 'password';
  profile.profile_verification_required = authProfileData.profile_verification_required === true;
  profile.profile_verified_at = authProfileData.profile_verified_at || null;
  if (!profile.active) throw new Error('Akun sudah dinonaktifkan.');

  const claims = {
    role: profile.role,
    branch: String(profile.cabang || '').slice(0, 80),
    division: String(profile.divisi || '').slice(0, 80),
    username: String(profile.username || '').slice(0, 80),
    nik: String(profile.nik || '').slice(0, 80),
    password_change_required: profile.must_change_password === true,
    active: true,
    auth_provider: profile.auth_provider,
    profile_verification_required: profile.profile_verification_required === true
  };
  if (profile.profile_verified_at) claims.profile_verified_at = String(profile.profile_verified_at).slice(0, 40);
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
  if (!await enforceDistributedRateLimit(req, res, { namespace: 'auth-login', limit: 7, windowMs: 15 * 60_000 })) return;

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
    let profile;
    try {
      const legacy = await findLegacyUser(db, identifier);
      if (!legacy) return res.status(401).json({ success: false, error: 'Username/NIK atau password salah.' });
      profile = await migrateOrVerifyUser(admin, db, legacy, identifier, password);
    } catch (error) {
      if (!isFirestoreQuotaError(error)) throw error;
      console.warn('[auth-login] Firestore quota exhausted; verifying against Firebase Authentication only.');
      profile = await verifyWithoutFirestore(admin, identifier, password);
    }
    const customToken = verifyOnly ? null : await admin.auth().createCustomToken(profile.uid);
    await writeAuditLog(db, req, profile, {
      action: verifyOnly ? 'PASSWORD_REAUTH_SUCCESS' : 'LOGIN_SUCCESS',
      module: 'AUTH',
      recordId: profile.uid
    });

    // Login dengan username/NIK + password mengirim email konfirmasi ke email
    // yang terdaftar. Re-autentikasi untuk pengeditan (verifyOnly) tidak dikirim.
    let loginConfirmationEmail = { sent: false, reason: verifyOnly ? 'verification_only' : 'not_attempted' };
    if (!verifyOnly) {
      loginConfirmationEmail = await sendLoginConfirmation(profile, req);
      try {
        await writeAuditLog(db, req, profile, {
          action: loginConfirmationEmail.sent ? 'LOGIN_CONFIRMATION_EMAIL_SENT' : 'LOGIN_CONFIRMATION_EMAIL_SKIPPED',
          module: 'AUTH',
          recordId: profile.uid,
          metadata: {
            reason: loginConfirmationEmail.reason || '',
            recipient: loginConfirmationEmail.recipient || ''
          }
        });
      } catch (auditError) {
        console.warn('[auth-login] gagal mencatat audit email konfirmasi:', auditError.message);
      }
    }

    return res.status(200).json({ success: true, customToken, profile, login_confirmation_email: loginConfirmationEmail });
  } catch (error) {
    console.warn('[auth-login] rejected:', error.code || error.message);
    return res.status(401).json({ success: false, error: 'Username/NIK atau password salah.' });
  }
};

module.exports._test = { profileFromFirebaseUser, findFirebaseAuthUser, verifyWithoutFirestore, buildLoginConfirmationEmail, maskEmail, isValidEmail };
