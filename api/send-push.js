const admin = require('firebase-admin');

module.exports = async function handler(req, res) {
  // Hanya izinkan jalur POST
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');
  
  try {
    // 1. INISIALISASI DI DALAM PENGAMAN
    if (!admin.apps.length) {
      let formattedKey = process.env.FIREBASE_PRIVATE_KEY || "";
      // Membersihkan format kunci dari Vercel
      formattedKey = formattedKey.replace(/\\n/g, '\n'); 
      if (formattedKey.startsWith('"') && formattedKey.endsWith('"')) {
          formattedKey = formattedKey.substring(1, formattedKey.length - 1);
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: formattedKey,
        }),
      });
    }

    // 2. MENGIRIM NOTIFIKASI
    const { tokens, title, body } = req.body;
    
    if (!tokens || tokens.length === 0) {
        return res.status(200).json({ success: false, message: "Tidak ada token target." });
    }

    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      tokens: tokens
    });
    
    res.status(200).json({ success: true, response });

  } catch (error) {
    // JIKA GAGAL, ERROR ASLINYA AKAN DITANGKAP DI SINI SEBAGAI JSON
    console.error("CRASH SERVER:", error);
    res.status(500).json({ 
        success: false, 
        error: "Server Error: " + error.message 
    });
  }
};
