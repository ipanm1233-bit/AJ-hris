const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');
  
  try {
    // 1. INISIALISASI SUPER AMAN
    if (!admin.apps.length) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
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
        // Fallback: baca projectId dari firebase-applet-config.json jika ada
        let projId = process.env.FIREBASE_PROJECT_ID;
        if (!projId) {
          try {
            const cfgPath = path.join(__dirname, '..', 'firebase-applet-config.json');
            if (fs.existsSync(cfgPath)) {
              const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
              if (cfg && cfg.projectId) projId = cfg.projectId;
            }
          } catch (e) {
            console.warn("Gagal membaca firebase-applet-config.json:", e);
          }
        }
        admin.initializeApp({
          projectId: projId || "gen-lang-client-0670613891"
        });
      }
    }

    // 2. MENGIRIM NOTIFIKASI
    const { tokens, title, body, link } = req.body; 
    
    // Deduplikasi dan bersihkan token
    const tokenList = Array.from(new Set(Array.isArray(tokens) ? tokens : [tokens])).filter(t => typeof t === 'string' && t.trim().length > 0);

    if (!tokenList || tokenList.length === 0) {
      return res.status(200).json({ success: false, message: "Tidak ada token target yang valid." });
    }

    const notifTitle = title || "HRIS Andela Jaya";
    const notifBody = body || "Ada pemberitahuan baru.";
    const targetLink = link || "/";

    // Structuring multicast message with webpush payload for maximum compatibility
    const response = await admin.messaging().sendEachForMulticast({
      notification: { 
        title: notifTitle, 
        body: notifBody 
      },
      data: { 
        title: notifTitle,
        body: notifBody,
        link: targetLink 
      },
      webpush: {
        headers: {
          Urgency: "high"
        },
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/assets/icon-192x192.png",
          badge: "/assets/icon-192x192.png"
        },
        fcmOptions: {
          link: targetLink
        }
      },
      tokens: tokenList
    });
    
    console.log(`FCM Push result: Success ${response.successCount}, Failure ${response.failureCount}`);
    if (response.failureCount > 0) {
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          console.error(`FCM Token [${idx}] Error:`, tokenList[idx], r.error ? r.error.message : r);
        }
      });
    }

    res.status(200).json({ 
      success: true, 
      successCount: response.successCount, 
      failureCount: response.failureCount,
      response 
    });

  } catch (error) {
    console.error("CRASH SERVER SEND PUSH:", error);
    res.status(500).json({ 
      success: false, 
      error: "Server Error: " + error.message 
    });
  }
};
