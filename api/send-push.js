const admin = require('firebase-admin');

// Inisialisasi akses aman (Server-side)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Mengubah string baris baru (\n) agar bisa dibaca Vercel
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
    }),
  });
}

module.exports = async function handler(req, res) {
  // Hanya izinkan jalur POST (Pengiriman Data)
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');
  
  const { tokens, title, body } = req.body;
  if (!tokens || tokens.length === 0) return res.status(200).json({ success: true, message: "Tidak ada token HP target." });

  try {
    // Menembak notifikasi massal (Multicast) ke semua token HP karyawan target
    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      tokens: tokens
    });
    res.status(200).json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
