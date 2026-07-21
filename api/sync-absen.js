const admin = require('firebase-admin');

module.exports = async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');

  try {
    // 1. Inisialisasi Firebase yang aman (Sama seperti fitur Push Notif)
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    const { logs } = req.body; // Menangkap data yang dikirim dari komputer kantor

    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ success: false, error: "Data logs tidak valid" });
    }

    const batch = db.batch();
    let count = 0;

    // 2. Olah data absen yang masuk
    logs.forEach(log => {
      // Membuat ID Unik (Contoh: ABS-101-169876543) agar jika data tertarik 2x, tidak ada duplikat di database
      const docId = `ABS-${log.userId}-${new Date(log.recordTime).getTime()}`;
      const ref = db.collection('data_absensi').doc(docId);

      // Simpan ke Firestore
      batch.set(ref, {
        uid_mesin: log.uid,
        username_karyawan: String(log.userId), // Pastikan ID di mesin finger sama dengan NIK atau Username di HRIS
        waktu: new Date(log.recordTime).toISOString(),
        tipe_absen: "FINGERPRINT",
        diinput_pada: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }); 

      count++;
    });

    // Eksekusi penyimpanan massal
    await batch.commit();
    res.status(200).json({ success: true, message: `${count} data absen berhasil disimpan/diperbarui.` });

  } catch (error) {
    console.error("CRASH SERVER SYNC ABSEN:", error);
    res.status(500).json({ success: false, error: "Server Error: " + error.message });
  }
};
