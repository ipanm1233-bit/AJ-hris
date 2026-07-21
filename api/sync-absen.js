const admin = require('firebase-admin');

/**
 * api/sync-absen.js
 * =====================================================================
 * Endpoint penerima data dari BRIDGE mesin fingerprint (lihat folder
 * fingerprint-bridge/ di root repo -- skrip Node.js yang jalan DI
 * KOMPUTER SERVER yang terhubung langsung ke mesin absen, lalu
 * mem-POST log mentahnya ke endpoint ini).
 *
 * PERBAIKAN PENTING: versi sebelumnya menyimpan SETIAP SCAN MENTAH
 * sebagai 1 dokumen terpisah (field: uid_mesin, username_karyawan,
 * waktu, tipe_absen) -- skema ini TIDAK COCOK SAMA SEKALI dengan yang
 * dibaca modul "Manajemen Absensi" (js/views/absensi.js), yang
 * mengharapkan SATU dokumen PER KARYAWAN PER HARI berisi field:
 * { nik, nama, tanggal (YYYY-MM-DD), scan_masuk ("HH:MM"),
 *   scan_keluar ("HH:MM") }. Akibatnya data dari mesin fingerprint
 * TIDAK PERNAH muncul di modul Absensi walau sinkronisasi "berhasil".
 *
 * Sekarang endpoint ini:
 * 1) Menerima log mentah per-scan (banyak scan per hari per karyawan).
 * 2) Mengelompokkan per (NIK, tanggal): waktu PALING AWAL -> scan_masuk,
 *    waktu PALING AKHIR -> scan_keluar.
 * 3) Mencari NAMA karyawan dari Master Karyawan berdasarkan NIK (mesin
 *    fingerprint cuma tahu ID/NIK yang diketik di mesin, bukan nama).
 * 4) Upsert (merge) ke collection `data_absensi` dengan doc ID stabil
 *    per (NIK, tanggal) -- supaya sinkronisasi berkala (tiap beberapa
 *    menit/jam) TIDAK membuat data dobel, dan scan_masuk/scan_keluar
 *    ikut ter-update (bukan tertimpa/hilang) kalau ada scan baru di
 *    hari yang sama.
 * =====================================================================
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan' });

  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const db = admin.firestore();
    const { logs } = req.body;

    if (!logs || !Array.isArray(logs) || !logs.length) {
      return res.status(400).json({ success: false, error: "Data logs tidak valid atau kosong" });
    }

    // --- 1) Kelompokkan log mentah per (NIK, tanggal WIB) ---------------
    const groups = {}; // key: "NIK|YYYY-MM-DD" -> { nik, tanggal, times: [] }
    for (const log of logs) {
      const nik = String(log.deviceUserId || log.userId || log.userSn || "").trim();
      const waktuRaw = log.recordTime || log.timestamp;
      if (!nik || !waktuRaw) continue;

      const d = new Date(waktuRaw);
      if (isNaN(d)) continue;

      // Tanggal & jam WIB eksplisit (BUKAN zona waktu server Vercel yang
      // biasanya UTC) -- pola sama seperti localDateStr() di js/utils.js,
      // supaya jam masuk/keluar yang tersimpan tidak meleset.
      const tanggal = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      const jam = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

      const key = `${nik}|${tanggal}`;
      if (!groups[key]) groups[key] = { nik, tanggal, times: [] };
      groups[key].times.push(jam);
    }

    const groupList = Object.values(groups);
    if (!groupList.length) {
      return res.status(200).json({ success: true, message: "Tidak ada log valid untuk diproses (cek format deviceUserId/recordTime)." });
    }

    // --- 2) Resolve NIK -> nama_karyawan dari Master Karyawan -----------
    const nikSet = [...new Set(groupList.map(g => g.nik))];
    const nikToNama = {};
    for (let i = 0; i < nikSet.length; i += 30) { // batas "in" query Firestore = 30
      const batchNik = nikSet.slice(i, i + 30);
      const snap = await db.collection('master_karyawan').where('nik', 'in', batchNik).get();
      snap.forEach(doc => { nikToNama[String(doc.data().nik)] = doc.data().nama_karyawan; });
    }

    // --- 3) Upsert per (NIK, tanggal), MERGE dgn scan lama kalau ada ----
    const chunkSize = 200;
    let count = 0;
    for (let i = 0; i < groupList.length; i += chunkSize) {
      const chunk = groupList.slice(i, i + chunkSize);
      const batch = db.batch();

      for (const g of chunk) {
        const docId = `ABS-FP-${g.nik}-${g.tanggal}`;
        const ref = db.collection('data_absensi').doc(docId);
        const existing = await ref.get();

        let allTimes = [...g.times];
        if (existing.exists) {
          const ex = existing.data();
          if (ex.scan_masuk) allTimes.push(ex.scan_masuk);
          if (ex.scan_keluar) allTimes.push(ex.scan_keluar);
        }
        allTimes.sort();

        batch.set(ref, {
          nik: g.nik,
          nama: nikToNama[g.nik] || (existing.exists ? existing.data().nama : `NIK ${g.nik} (tidak ditemukan di Master Karyawan)`),
          tanggal: g.tanggal,
          scan_masuk: allTimes[0],
          scan_keluar: allTimes.length > 1 ? allTimes[allTimes.length - 1] : (existing.exists ? existing.data().scan_keluar || null : null),
          sumber: "FINGERPRINT",
          disinkron_pada: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        count++;
      }
      await batch.commit();
    }

    res.status(200).json({ success: true, message: `${count} data absen (${logs.length} scan mentah) berhasil disinkronkan.` });

  } catch (error) {
    console.error("CRASH SYNC ABSEN:", error);
    res.status(500).json({ success: false, error: "Gagal memproses sinkronisasi: " + error.message });
  }
};
