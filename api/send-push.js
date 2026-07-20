const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Pembersihan format Private Key dari Vercel
  let formattedKey = process.env.FIREBASE_PRIVATE_KEY || "";
  formattedKey = formattedKey.replace(/\\n/g, '\n'); // Ubah teks \n menjadi enter sungguhan
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');
  
  const { tokens, title, body } = req.body;
  
  if (!tokens || tokens.length === 0) {
      console.log("Dibatalkan: Tidak ada token HP target.");
      return res.status(200).json({ success: false, message: "Tidak ada token target." });
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      tokens: tokens
    });
    console.log("Firebase Response:", response);
    res.status(200).json({ success: true, response });
  } catch (error) {
    console.error("FCM Send Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
