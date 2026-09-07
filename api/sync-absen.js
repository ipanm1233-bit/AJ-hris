const { admin, getFirebaseAdmin } = require('../lib/firebase-admin.js');
const crypto = require('crypto');
const { enforceRateLimit, writeAuditLog } = require('../lib/security.js');
const { aggregateFingerprintLogs, computeAttendance } = require('../lib/fingerprint-normalizer.js');

function verifyBridgeSignature(req) {
  const secret = process.env.FINGERPRINT_BRIDGE_SECRET || '';
  const timestamp = String(req.headers?.['x-bridge-timestamp'] || '');
  const signature = String(req.headers?.['x-bridge-signature'] || '').toLowerCase();
  if (!secret || !timestamp || !signature) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) return false;
  const message = `${timestamp}.${JSON.stringify(req.body || {})}`;
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
  if (!enforceRateLimit(req, res, { namespace: 'sync-absen', limit: 30, windowMs: 60_000 })) return;
  if (!verifyBridgeSignature(req)) return res.status(401).json({ success: false, error: 'Signature fingerprint bridge tidak valid.' });

  try {
    const { db, error } = getFirebaseAdmin();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: error || "Firebase Admin environment variables are not configured."
      });
    }
    const logs = req.body?.logs || req.body?.records || req.body?.attendance || req.body?.data;

    if (!logs || !Array.isArray(logs) || !logs.length || logs.length > 5000) {
      return res.status(400).json({ success: false, error: "Data logs tidak valid atau kosong" });
    }

    // String waktu tanpa offset dianggap sudah merupakan waktu lokal mesin.
    const timeZone = process.env.FINGERPRINT_TIMEZONE || 'Asia/Jakarta';
    const minWorkGapMinutes = Math.max(30, Number(process.env.FINGERPRINT_MIN_WORK_GAP_MINUTES || 120));
    const { groups: groupList, invalid: invalidLogs } = aggregateFingerprintLogs(logs, { timeZone });
    if (!groupList.length) {
      return res.status(200).json({ success: true, message: "Tidak ada log valid untuk diproses (cek format deviceUserId/recordTime)." });
    }

    // --- 2) Resolve ID mesin -> master karyawan. Mendukung NIK, doc ID,
    // nik_karyawan, dan beberapa nama field fingerprint yang umum.
    const employeeSnap = await db.collection('master_karyawan').get();
    const employeeMap = new Map();
    const numericEmployeeMap = new Map();
    const fingerprintFields = ['nik', 'nik_karyawan', 'finger_id', 'finger_name', 'kode_finger', 'no_finger', 'id_finger', 'pin'];
    employeeSnap.forEach(snapshot => {
      const employee = { ...snapshot.data(), _docId: snapshot.id };
      const identifiers = [snapshot.id, ...fingerprintFields.map(field => employee[field])];
      identifiers.forEach(value => {
        const key = String(value || '').trim().toUpperCase();
        if (!key) return;
        if (!employeeMap.has(key)) employeeMap.set(key, employee);
        if (/^\d+$/.test(key)) {
          const numericKey = key.replace(/^0+(?=\d)/, '');
          if (!numericEmployeeMap.has(numericKey)) numericEmployeeMap.set(numericKey, employee);
          else if (numericEmployeeMap.get(numericKey)?._docId !== employee._docId) numericEmployeeMap.set(numericKey, null);
        }
      });
    });
    const resolveEmployee = deviceUserId => {
      const exactKey = String(deviceUserId).trim().toUpperCase();
      if (employeeMap.has(exactKey)) return employeeMap.get(exactKey);
      return /^\d+$/.test(exactKey) ? numericEmployeeMap.get(exactKey.replace(/^0+(?=\d)/, '')) || null : null;
    };

    // --- 3) Upsert per (NIK, tanggal), MERGE dgn scan lama kalau ada ----
    const chunkSize = 200;
    let count = 0;
    for (let i = 0; i < groupList.length; i += chunkSize) {
      const chunk = groupList.slice(i, i + chunkSize);
      const resolvedChunk = chunk.map(group => {
        const employee = resolveEmployee(group.deviceUserId);
        const nik = String(employee?.nik_karyawan || employee?.nik || group.deviceUserId).trim();
        const safeNik = nik.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
        const ref = db.collection('data_absensi').doc(`ABS-FP-${safeNik}-${group.tanggal}`);
        return { group, employee, nik, ref };
      });
      const existingSnapshots = await db.getAll(...resolvedChunk.map(item => item.ref));
      const batch = db.batch();

      resolvedChunk.forEach((item, index) => {
        const { group: g, employee, nik, ref } = item;
        const existing = existingSnapshots[index];
        const oldData = existing.exists ? existing.data() : {};
        const attendance = computeAttendance(g.events, oldData, minWorkGapMinutes);

        batch.set(ref, {
          nik,
          fingerprint_user_id: g.deviceUserId,
          nama: employee?.nama_karyawan || employee?.nama || oldData.nama || `ID Finger ${g.deviceUserId} (belum dipetakan)`,
          tanggal: g.tanggal,
          scan_masuk: attendance.scan_masuk,
          scan_keluar: attendance.scan_keluar,
          cabang: employee?.cabang || oldData.cabang || '',
          divisi: employee?.divisi || employee?.departemen || oldData.divisi || '',
          jabatan: employee?.jabatan || employee?.posisi || oldData.jabatan || '',
          sumber: "FINGERPRINT",
          disinkron_pada: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        count++;
      });
      await batch.commit();
    }

    const unmatchedIds = [...new Set(groupList
      .filter(group => !resolveEmployee(group.deviceUserId))
      .map(group => group.deviceUserId))].slice(0, 25);

    await writeAuditLog(db, req, null, {
      action: 'FINGERPRINT_SYNC', module: 'ATTENDANCE',
      metadata: { processed_records: count, raw_scans: logs.length, invalid_logs: invalidLogs, unmatched_count: unmatchedIds.length }
    });
    res.status(200).json({
      success: true,
      message: `${count} data absen (${logs.length} scan mentah) berhasil disinkronkan.`,
      processedRecords: count,
      rawScans: logs.length,
      invalidLogs,
      unmatchedFingerprintIds: unmatchedIds
    });

  } catch (error) {
    console.error("CRASH SYNC ABSEN:", error);
    res.status(500).json({ success: false, error: "Gagal memproses sinkronisasi fingerprint." });
  }
};
