const { getFirebaseAdmin } = require('./firebase-admin.js');

module.exports = async function handler(req, res) {
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
    res.status(200).json({ checked: kontrakSnap.size });
  } catch (err) {
    console.error("Error in cron-check-kontrak:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
