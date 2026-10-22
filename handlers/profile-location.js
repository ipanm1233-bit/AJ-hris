const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');
const { normalizeLocation } = require('../lib/employee-profile.js');
const { findEmployeeForUser } = require('../lib/employee-record.js');

async function updateUserLocation(db, user, location) {
  const payload = {
    last_location: location,
    last_location_at: location.captured_at,
    updated_at: location.received_at
  };
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
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  }
  if (!enforceRateLimit(req, res, { namespace: 'profile-location', limit: 30, windowMs: 60_000 })) return;

  const context = await requireFirebaseAuth(req, res, { allowProfileVerificationRequired: true });
  if (!context) return;

  try {
    assertAllowedKeys(req.body || {}, ['location']);
    const location = normalizeLocation(req.body?.location);
    const employee = await findEmployeeForUser(context.db, context.user);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Data karyawan untuk akun ini belum ditemukan. Hubungi HRD.'
      });
    }

    await employee.ref.set({
      last_location: location,
      last_location_at: location.captured_at,
      last_location_source: location.source,
      updated_at: location.received_at
    }, { merge: true });

    await context.db.collection('auth_profiles').doc(context.user.uid).set({
      last_location: location,
      last_location_at: location.captured_at,
      updated_at: location.received_at
    }, { merge: true });

    await updateUserLocation(context.db, context.user, location);

    await writeAuditLog(context.db, req, context.user, {
      action: 'EMPLOYEE_LOCATION_CAPTURED',
      module: 'PROFILE',
      recordId: context.user.nik || employee.id,
      metadata: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        source: location.source
      }
    });

    return res.status(200).json({ success: true, location });
  } catch (error) {
    console.warn('[profile-location] rejected:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message || 'Gagal menyimpan titik lokasi perangkat.'
    });
  }
};
