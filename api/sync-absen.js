const { admin, getFirebaseAdmin } = require('../lib/firebase-admin.js');
const crypto = require('crypto');
const { enforceRateLimit, writeAuditLog } = require('../lib/security.js');
const { aggregateFingerprintLogs, computeAttendance } = require('../lib/fingerprint-normalizer.js');

function normalizePersonName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeBranch(value) {
  return String(value || '').trim().toUpperCase();
}

function verifyBridgeSignature(req, rawBody) {
  const secret = String(process.env.FINGERPRINT_BRIDGE_SECRET || '').trim();
  const timestamp = String(req.headers?.['x-bridge-timestamp'] || '');
  const signature = String(req.headers?.['x-bridge-signature'] || '').toLowerCase();
  if (!secret || !timestamp || !signature) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) return false;
  const message = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return { rawBody, body: typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody) };
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error('Request terlalu besar');
    chunks.push(buffer);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  return { rawBody, body: JSON.parse(rawBody) };
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

  try {
    const { rawBody, body } = await readJsonBody(req);
    req.body = body;
    if (!verifyBridgeSignature(req, rawBody)) {
      return res.status(401).json({ success: false, error: 'Signature fingerprint bridge tidak valid.' });
    }

    const { db, error } = getFirebaseAdmin();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: error || "Firebase Admin environment variables are not configured."
      });
    }
    const branch = normalizeBranch(req.body?.branch);
    if (!branch) return res.status(400).json({ success: false, error: 'Cabang mesin fingerprint wajib diisi.' });
    const safeBranch = branch.replace(/[^A-Z0-9_-]/g, '_').slice(0, 50);
    const syncStateRef = db.collection('system_metadata').doc(`fingerprint_sync_${safeBranch}`);
    if (req.body?.action === 'status') {
      const stateSnap = await syncStateRef.get();
      let latestDate = stateSnap.exists ? String(stateSnap.data()?.latestDate || '') : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(latestDate)) {
        const branchSnap = await db.collection('data_absensi').where('cabang', '==', branch).select('tanggal').get();
        latestDate = branchSnap.docs.reduce((latest, doc) => {
          const date = String(doc.data()?.tanggal || '');
          return date > latest ? date : latest;
        }, '');
      }
      return res.status(200).json({ success: true, latestDate });
    }
    const logs = req.body?.logs || req.body?.records || req.body?.attendance || req.body?.data;
    const deviceUsers = Array.isArray(req.body?.users) ? req.body.users : [];

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
    const employeeNameMap = new Map();
    const employees = [];
    const fingerprintFields = ['nik', 'nik_karyawan', 'finger_id', 'finger_name', 'kode_finger', 'no_finger', 'id_finger', 'pin'];
    employeeSnap.forEach(snapshot => {
      const employee = { ...snapshot.data(), _docId: snapshot.id };
      if (normalizeBranch(employee.cabang) !== branch) return;
      employees.push(employee);
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
      const names = [employee.nama_karyawan, employee.nama, employee.finger_name];
      names.forEach(value => {
        const nameKey = normalizePersonName(value);
        if (!nameKey) return;
        if (!employeeNameMap.has(nameKey)) employeeNameMap.set(nameKey, employee);
        else if (employeeNameMap.get(nameKey)?._docId !== employee._docId) employeeNameMap.set(nameKey, null);
      });
    });
    const deviceUserNameMap = new Map();
    deviceUsers.forEach(user => {
      const id = String(user?.deviceUserId || '').trim().toUpperCase();
      const name = normalizePersonName(user?.name);
      if (id && name) deviceUserNameMap.set(id, name);
    });
    const resolveEmployeeByMachineName = machineName => {
      const exact = employeeNameMap.get(machineName);
      if (exact) return exact;
      const candidates = employees.filter(employee => {
        const aliases = [employee.finger_name, employee.nama_karyawan, employee.nama]
          .map(normalizePersonName)
          .filter(alias => alias.length >= 3);
        return aliases.some(alias =>
          machineName.startsWith(`${alias} `) || alias.startsWith(`${machineName} `)
        );
      });
      const uniqueIds = new Set(candidates.map(employee => employee._docId));
      return uniqueIds.size === 1 ? candidates[0] : null;
    };
    const resolveEmployee = deviceUserId => {
      const exactKey = String(deviceUserId).trim().toUpperCase();
      if (employeeMap.has(exactKey)) return employeeMap.get(exactKey);
      if (/^\d+$/.test(exactKey)) {
        const numericMatch = numericEmployeeMap.get(exactKey.replace(/^0+(?=\d)/, ''));
        if (numericMatch) return numericMatch;
      }
      const machineName = deviceUserNameMap.get(exactKey);
      return machineName ? resolveEmployeeByMachineName(machineName) : null;
    };

    // --- 3) Upsert per (NIK, tanggal), MERGE dgn scan lama kalau ada ----
    const chunkSize = 200;
    let count = 0;
    for (let i = 0; i < groupList.length; i += chunkSize) {
      const chunk = groupList.slice(i, i + chunkSize);
      const chunkItems = chunk.map(group => {
        const employee = resolveEmployee(group.deviceUserId);
        const nik = String(employee?.nik_karyawan || employee?.nik || group.deviceUserId).trim();
        const safeNik = nik.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
        const ref = db.collection('data_absensi').doc(`ABS-FP-${safeNik}-${group.tanggal}`);
        const safeDeviceId = String(group.deviceUserId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
        const legacyRef = db.collection('data_absensi').doc(`ABS-FP-${safeDeviceId}-${group.tanggal}`);
        return { group, employee, nik, ref, legacyRef };
      });
      const resolvedChunk = chunkItems.filter(item => item.employee);
      const existingSnapshots = resolvedChunk.length
        ? await db.getAll(...resolvedChunk.map(item => item.ref))
        : [];
      const batch = db.batch();

      // ID yang tidak bisa dipetakan tidak boleh menghasilkan jam/data dummy.
      chunkItems.filter(item => !item.employee).forEach(item => batch.delete(item.legacyRef));

      resolvedChunk.forEach((item, index) => {
        const { group: g, employee, nik, ref, legacyRef } = item;
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
          cabang: employee.cabang || branch,
          divisi: employee?.divisi || employee?.departemen || oldData.divisi || '',
          jabatan: employee?.jabatan || employee?.posisi || oldData.jabatan || '',
          sumber: "FINGERPRINT",
          disinkron_pada: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        if (legacyRef.path !== ref.path) batch.delete(legacyRef);

        count++;
      });
      await batch.commit();
    }

    const unmatchedIds = [...new Set(groupList
      .filter(group => !resolveEmployee(group.deviceUserId))
      .map(group => group.deviceUserId))].slice(0, 25);
    const unmatchedFingerprintUsers = unmatchedIds.map(id => ({
      id,
      fingerName: deviceUserNameMap.get(String(id).trim().toUpperCase()) || ''
    }));

    const newestDate = groupList.reduce((latest, group) => group.tanggal > latest ? group.tanggal : latest, '');
    if (newestDate) {
      await db.runTransaction(async transaction => {
        const stateSnap = await transaction.get(syncStateRef);
        const currentDate = stateSnap.exists ? String(stateSnap.data()?.latestDate || '') : '';
        if (newestDate > currentDate) {
          transaction.set(syncStateRef, {
            latestDate: newestDate,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      });
    }

    await writeAuditLog(db, req, null, {
      action: 'FINGERPRINT_SYNC', module: 'ATTENDANCE',
      metadata: { branch, processed_records: count, raw_scans: logs.length, invalid_logs: invalidLogs, unmatched_count: unmatchedIds.length }
    });
    res.status(200).json({
      success: true,
      message: `${count} data absen (${logs.length} scan mentah) berhasil disinkronkan.`,
      processedRecords: count,
      rawScans: logs.length,
      branch,
      invalidLogs,
      unmatchedFingerprintIds: unmatchedIds,
      unmatchedFingerprintUsers
    });

  } catch (error) {
    console.error("CRASH SYNC ABSEN:", error);
    res.status(500).json({ success: false, error: "Gagal memproses sinkronisasi fingerprint." });
  }
};
