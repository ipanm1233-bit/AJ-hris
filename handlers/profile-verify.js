const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');
const {
  profileFromEmployee,
  buildProfileUpdate,
  normalizeLocation
} = require('../lib/employee-profile.js');
const { findEmployeeForUser } = require('../lib/employee-record.js');

function verificationState(user, employee) {
  const data = employee?.data || {};
  return {
    required: user.profile_verification_required === true && data.profile_verification_completed !== true,
    verified_at: user.profile_verified_at || data.profile_verified_at || null,
    google_email: user.email || data.email_google || data.email || ''
  };
}

async function updateProfileClaims(admin, uid, now) {
  if (!admin?.auth) return;
  try {
    const authUser = await admin.auth().getUser(uid);
    await admin.auth().setCustomUserClaims(uid, {
      ...(authUser.customClaims || {}),
      profile_verification_required: false,
      profile_verified_at: now
    });
  } catch (error) {
    console.warn('[profile-verify] Unable to refresh custom claims:', error.message);
  }
}

async function updateUserVerification(db, user, now, location) {
  const payload = {
    profile_verification_required: false,
    profile_verified_at: now,
    updated_at: now
  };
  if (location) {
    payload.last_location = location;
    payload.last_location_at = location.captured_at;
  }

  const candidates = [user.id, user.username].filter(Boolean).map(String);
  for (const id of [...new Set(candidates)]) {
    const ref = db.collection('users').doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.set(payload, { merge: true });
      return;
    }
  }

  if (user.uid) {
    const snap = await db.collection('users').where('firebase_uid', '==', user.uid).limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.set(payload, { merge: true });
  }
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  }
  if (!enforceRateLimit(req, res, { namespace: 'profile-verify', limit: 30, windowMs: 60_000 })) return;

  const context = await requireFirebaseAuth(req, res, { allowProfileVerificationRequired: true });
  if (!context) return;

  try {
    const employee = await findEmployeeForUser(context.db, context.user);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Data karyawan untuk akun ini belum ditemukan. Hubungi HRD.'
      });
    }

    if (req.method === 'GET') {
      const googleEmail = context.user.email || employee.data?.email_google || employee.data?.email || '';
      return res.status(200).json({
        success: true,
        profile: profileFromEmployee(employee.data, {
          id: employee.id,
          email: googleEmail,
          email_google: googleEmail
        }),
        verification: verificationState(context.user, employee)
      });
    }

    assertAllowedKeys(req.body || {}, ['profile', 'location', 'confirm']);
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        success: false,
        error: 'Centang pernyataan bahwa data sudah diperiksa sebelum menyimpan.'
      });
    }

    const updates = buildProfileUpdate(req.body?.profile || {});
    const location = req.body?.location ? normalizeLocation(req.body.location) : null;
    const now = new Date().toISOString();

    updates.profile_verification_completed = true;
    updates.profile_verification_required = false;
    updates.profile_verified_at = now;
    updates.profile_verification_source = 'google_first_login';
    updates.profile_verified_by = context.user.uid;
    updates.updated_at = now;

    if (location) {
      updates.last_location = location;
      updates.last_location_at = location.captured_at;
      updates.last_location_source = location.source;
    }

    await employee.ref.set(updates, { merge: true });

    const profilePayload = {
      profile_verification_required: false,
      profile_verified_at: now,
      updated_at: now
    };
    if (location) {
      profilePayload.last_location = location;
      profilePayload.last_location_at = location.captured_at;
    }
    await context.db.collection('auth_profiles').doc(context.user.uid).set(profilePayload, { merge: true });
    await updateProfileClaims(context.admin, context.user.uid, now);
    await updateUserVerification(context.db, context.user, now, location);

    await writeAuditLog(context.db, req, { ...context.user, name: context.user.name || context.user.nama }, {
      action: 'EMPLOYEE_PROFILE_VERIFIED',
      module: 'PROFILE',
      recordId: context.user.nik || employee.id,
      metadata: {
        fields_changed: Object.keys(updates).filter(key => ![
          'profile_verification_completed', 'profile_verification_required',
          'profile_verified_at', 'profile_verification_source', 'profile_verified_by',
          'updated_at', 'last_location', 'last_location_at', 'last_location_source'
        ].includes(key)),
        location_captured: Boolean(location)
      }
    });

    return res.status(200).json({
      success: true,
      profile_verified_at: now,
      profile_verification_required: false,
      location: location || employee.data?.last_location || null
    });
  } catch (error) {
    console.warn('[profile-verify] rejected:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message || 'Gagal menyimpan verifikasi data diri.'
    });
  }
};

module.exports._test = { verificationState };
