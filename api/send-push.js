const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');

async function isRegisteredToken(db, token) {
  for (const collectionName of ['users', 'master_karyawan', 'auth_profiles']) {
    const single = await db.collection(collectionName).where('fcm_token', '==', token).limit(1).get();
    if (!single.empty) return true;
    const multiple = await db.collection(collectionName).where('fcm_tokens', 'array-contains', token).limit(1).get();
    if (!multiple.empty) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  // Hanya izinkan jalur POST
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');
  
  try {
    const context = await requireFirebaseAuth(req, res);
    if (!context) return;
    if (!enforceRateLimit(req, res, { namespace: 'send-push', key: context.user.uid, limit: 60, windowMs: 60 * 60_000 })) return;
    assertAllowedKeys(req.body || {}, ['tokens', 'title', 'body', 'link']);
    const fbAdmin = context.admin;

    // 2. MENGIRIM NOTIFIKASI
    const { tokens, title, body, link } = req.body; 
    
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return res.status(200).json({ success: false, message: "Tidak ada token target." });
    }
    if (tokens.length > 500 || String(title || '').length > 120 || String(body || '').length > 500) {
      return res.status(413).json({ success: false, error: 'Payload notifikasi melebihi batas keamanan.' });
    }
    const privilegedRoles = new Set(['HRD', 'SUPERADMIN', 'GM', 'MANAGER']);
    if (!privilegedRoles.has(context.user.role)) {
      if (tokens.length > 50) return res.status(413).json({ success: false, error: 'Terlalu banyak penerima notifikasi.' });
      for (const token of tokens) {
        if (typeof token !== 'string' || !await isRegisteredToken(context.db, token)) {
          return res.status(403).json({ success: false, error: 'Token penerima tidak terdaftar.' });
        }
      }
    }

    // Sisipkan link ke dalam properti 'data'
    const response = await fbAdmin.messaging().sendEachForMulticast({
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

    await writeAuditLog(context.db, req, context.user, {
      action: 'PUSH_SENT', module: 'NOTIFICATIONS',
      metadata: { success_count: response.successCount, failure_count: response.failureCount }
    });

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
