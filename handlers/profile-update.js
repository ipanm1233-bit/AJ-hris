const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');
const { profileFromEmployee, buildProfileUpdate } = require('../lib/employee-profile.js');
const { findEmployeeForUser } = require('../lib/employee-record.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  }
  if (!enforceRateLimit(req, res, { namespace: 'profile-update', limit: 30, windowMs: 60_000 })) return;

  const context = await requireFirebaseAuth(req, res);
  if (!context) return;

  try {
    const employee = await findEmployeeForUser(context.db, context.user);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Data karyawan untuk akun ini belum ditemukan. Hubungi HRD.'
      });
    }

    assertAllowedKeys(req.body || {}, ['profile']);
    const updates = buildProfileUpdate(req.body?.profile || {});
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, error: 'Tidak ada perubahan data yang dikirim.' });
    }

    const now = new Date().toISOString();
    updates.updated_at = now;
    updates.profile_updated_at = now;
    updates.profile_updated_by = context.user.uid;
    await employee.ref.set(updates, { merge: true });

    await writeAuditLog(context.db, req, {
      ...context.user,
      name: context.user.name || context.user.nama
    }, {
      action: 'EMPLOYEE_PROFILE_UPDATED',
      module: 'PROFILE',
      recordId: context.user.nik || employee.id,
      metadata: {
        fields_changed: Object.keys(updates).filter(key => ![
          'updated_at', 'profile_updated_at', 'profile_updated_by'
        ].includes(key))
      }
    });

    const googleEmail = context.user.email || employee.data?.email_google || employee.data?.email || '';
    return res.status(200).json({
      success: true,
      updated_at: now,
      profile: profileFromEmployee(
        { ...(employee.data || {}), ...updates },
        { id: employee.id, email: googleEmail, email_google: googleEmail }
      )
    });
  } catch (error) {
    console.warn('[profile-update] rejected:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message || 'Gagal memperbarui data profil.'
    });
  }
};

module.exports._test = { buildProfileUpdate };
