const admin = require('firebase-admin');

module.exports = async function handler(req, res) {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      return res.status(500).json({
        success: false,
        error: "Firebase environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not configured."
      });
    }

    admin.initializeApp({ credential: admin.credential.cert({
      projectId: projectId,
      clientEmail: clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    })});
  }

  const db = admin.firestore();
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
};
