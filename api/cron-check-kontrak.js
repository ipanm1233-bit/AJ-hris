const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
  })});
}
module.exports = async function handler(req, res) {
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
