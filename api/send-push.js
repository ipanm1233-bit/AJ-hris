const admin = require('firebase-admin');

module.exports = async function handler(req, res) {
  // Hanya izinkan jalur POST
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');
  
  try {
    // 1. INISIALISASI SUPER AMAN (Membaca utuh dari JSON)
    if (!admin.apps.length) {
      // JSON.parse akan secara otomatis membereskan masalah format baris (PEM)
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    // 2. MENGIRIM NOTIFIKASI
    const { tokens, title, body, link } = req.body; 
    
    if (!tokens || tokens.length === 0) {
        return res.status(200).json({ success: false, message: "Tidak ada token target." });
    }

    // Sisipkan link ke dalam properti 'data'
    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      data: { link: link || "" }, 
      tokens: tokens
    });
    
    res.status(200).json({ success: true, response });

  } catch (error) {
    console.error("CRASH SERVER:", error);
    res.status(500).json({ 
        success: false, 
        error: "Server Error: " + error.message 
    });
  }
};
