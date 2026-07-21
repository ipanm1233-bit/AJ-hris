const admin = require('firebase-admin');

module.exports = async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');

  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    const { logs } = req.body;

    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ success: false, error: "Data logs tidak valid" });
    }

    let count = 0;
    const chunkSize = 200; // Pecah pengiriman jadi 200 data per antrean agar Firebase tidak jebol

    for (let i = 0; i < logs.length; i += chunkSize) {
      const chunk = logs.slice(i, i + chunkSize);
      const batch = db.batch();

      chunk.forEach(log => {
        // Toleransi perbedaan versi mesin ZKTeco/Solution
        const uidKaryawan = log.deviceUserId || log.userId || log.userSn || "UNKNOWN";
        const waktuRecord = log.recordTime || log.timestamp;

        if (waktuRecord) {
            // Membuat ID unik agar tidak ada absen ganda
            const docId = `ABS-${uidKaryawan}-${new Date(waktuRecord).getTime()}`;
            const ref = db.collection('data_absensi').doc(docId);

            batch.set(ref, {
              uid_mesin: log.uid || "",
              username_karyawan: String(uidKaryawan), // Ini adalah NIK/ID yang diketik di mesin
              waktu: new Date(waktuRecord).toISOString(),
              tipe_absen: "FINGERPRINT",
              diinput_pada: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            count++;
        }
      });

      // Simpan antrean ini ke database
      await batch.commit();
    }

    res.status(200).json({ success: true, message: `${count} data absen berhasil masuk Cloud!` });

  } catch (error) {
    console.error("CRASH SERVER SYNC ABSEN:", error);
    // Mengirimkan pesan error asli ke layar hitam HRD
    res.status(500).json({ success: false, error: "Gagal memproses di Vercel: " + error.message });
  }
};
