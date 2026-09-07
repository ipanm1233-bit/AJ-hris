const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const { requireCronSecret, enforceRateLimit, writeAuditLog } = require('../lib/security.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'cron-contract', limit: 5, windowMs: 60_000 })) return;
  if (!requireCronSecret(req, res)) return;
  const { admin, db, error } = getFirebaseAdmin();
  if (!admin || !db) {
    return res.status(500).json({
      success: false,
      error: error || "Firebase Admin environment variables are not configured."
    });
  }

  try {
    const kontrakSnap = await db.collection('master_kontrak').where('status_kolom_kontrak', '==', 'SEGERA HABIS').get();
    const usersSnap = await db.collection('users').get();
    const tokenMap = {};
    usersSnap.forEach(d => { if (d.data().role === 'HRD' || d.data().role === 'SUPERADMIN') { if (d.data().fcm_token) tokenMap[d.id] = d.data().fcm_token; } });
    const tokens = Object.values(tokenMap);
    if (tokens.length && !kontrakSnap.empty) {
      await admin.messaging().sendEachForMulticast({
        notification: { title: "📄 Kontrak Segera Habis", body: `${kontrakSnap.size} kontrak karyawan perlu ditinjau.` },
        tokens
      });
    }
    await writeAuditLog(db, req, null, {
      action: 'CRON_CONTRACT_CHECK', module: 'CONTRACT', metadata: { checked: kontrakSnap.size }
    });
    res.status(200).json({ checked: kontrakSnap.size });
  } catch (err) {
    console.error("Error in cron-check-kontrak:", err);
    res.status(500).json({ success: false, error: 'Pemeriksaan kontrak gagal dijalankan.' });
  }
};
