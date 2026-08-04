const admin = require('firebase-admin');

module.exports = async function handler(req, res) {
  // Hanya izinkan jalur POST
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');
  
  try {
    // 1. INISIALISASI SUPER AMAN (Membaca utuh dari JSON)
    if (!admin.apps.length) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        // Opsi paling aman: seluruh file service account di-encode base64 jadi satu
        // string tanpa newline, jadi tidak bisa rusak saat di-paste ke Vercel.
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
        const serviceAccount = JSON.parse(decoded);
        if (!serviceAccount.private_key) {
          throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 ter-decode tapi field private_key kosong/hilang. Cek ulang proses base64 encode-nya.');
        }
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          })
        });
      } else {
        try {
          admin.initializeApp();
        } catch (e) {
          console.warn("Firebase Admin default init failed:", e.message);
        }
      }
    }

    if (!admin.apps.length) {
      return res.status(500).json({
        success: false,
        error: "Firebase Admin environment variables are not configured."
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

    // PENTING: sendEachForMulticast bisa balas 200 OK di level API walau ada
    // token INDIVIDUAL yang gagal (mis. token expired/tidak valid untuk
    // platform tertentu). Rincian ini HARUS diperiksa satu-satu, jangan
    // cuma andalkan successCount/failureCount agregat.
    const detail = response.responses.map((r, i) => ({
      token: tokens[i].slice(0, 20) + "...",
      success: r.success,
      error: r.success ? null : (r.error ? r.error.code + " - " + r.error.message : "Unknown error")
    }));

    console.log("FCM detail per-token:", JSON.stringify(detail, null, 2));

    res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      detail
    });

  } catch (error) {
    console.error("CRASH SERVER:", error);
    res.status(500).json({ 
        success: false, 
        error: "Server Error: " + error.message 
    });
  }
};
