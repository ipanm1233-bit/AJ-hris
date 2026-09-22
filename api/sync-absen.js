const { admin, getFirebaseAdmin } = require('../lib/firebase-admin.js');
const crypto = require('crypto');
const { enforceRateLimit, writeAuditLog, requireFirebaseAuth, isFirestoreQuotaError } = require('../lib/security.js');
const { aggregateFingerprintLogs, computeAttendance } = require('../lib/fingerprint-normalizer.js');
const { handleAttendanceAccess } = require('../lib/attendance-access.js');
const { handleIzinAccess } = require('../lib/izin-access.js');
const { handleTrainingAccess } = require('../lib/training-access.js');
const { handleNotificationAccess } = require('../lib/notification-access.js');
const { handleSalesTrackingAccess } = require('../lib/sales-tracking-access.js');
const { supabaseEnabled } = require('../lib/supabase.js');
const { listAttendance, upsertAttendance, deleteAttendance } = require('../lib/attendance-supabase.js');

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

function provisionalFingerprintNik(branch, deviceUserId) {
  const safeBranch = normalizeBranch(branch).replace(/[^A-Z0-9_-]/g, '_').slice(0, 40);
  const safeId = String(deviceUserId || '').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '_').slice(0, 60);
  return `FINGER-${safeBranch}-${safeId}`;
}

function isProvisionalFingerprintNik(value) {
  return String(value || '').toUpperCase().startsWith('FINGER-');
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

function secretHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanDeviceId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function validIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function dateDistanceDays(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

function validPrivateIpv4(value) {
  const parts = String(value || '').trim().split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function pairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  const value = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

function publicDeviceConfig(snapshot) {
  const data = snapshot.data() || {};
  const lastSeenAt = data.lastSeenAt?.toDate?.()?.toISOString?.() || data.lastSeenAt || null;
  const pairedAt = data.pairedAt?.toDate?.()?.toISOString?.() || data.pairedAt || null;
  const online = Boolean(lastSeenAt) && Date.now() - new Date(lastSeenAt).getTime() <= 15 * 60_000;
  return {
    id: snapshot.id,
    name: String(data.name || ''),
    branch: normalizeBranch(data.branch),
    ip: String(data.ip || ''),
    port: Number(data.port || 4370),
    intervalMinutes: Number(data.intervalMinutes || 5),
    enabled: data.enabled !== false,
    paired: Boolean(data.tokenHash),
    pairedAt,
    lastSeenAt,
    online,
    lastSyncAt: data.lastSyncAt?.toDate?.()?.toISOString?.() || data.lastSyncAt || null,
    lastError: String(data.lastError || '').slice(0, 300),
    resyncRequest: data.resyncRequest && validIsoDate(data.resyncRequest.fromDate) ? {
      id: String(data.resyncRequest.id || ''),
      fromDate: String(data.resyncRequest.fromDate),
      toDate: String(data.resyncRequest.toDate || data.resyncRequest.fromDate)
    } : null
  };
}

function validateDeviceInput(body) {
  const branch = normalizeBranch(body?.branch);
  const name = String(body?.name || '').trim().slice(0, 80);
  const ip = String(body?.ip || '').trim();
  const port = Number(body?.port || 4370);
  const intervalMinutes = Number(body?.intervalMinutes || 5);
  if (!branch || !/^[A-Z0-9 _-]{2,50}$/.test(branch)) throw new Error('Nama cabang tidak valid.');
  if (!name) throw new Error('Nama mesin wajib diisi.');
  if (!validPrivateIpv4(ip)) throw new Error('Alamat IP wajib berupa IP lokal, misalnya 192.168.1.201.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port mesin tidak valid.');
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) throw new Error('Interval sinkronisasi tidak valid.');
  return { branch, name, ip, port, intervalMinutes };
}

async function handleAdminDeviceAction(req, res, body) {
  const context = await requireFirebaseAuth(req, res, { roles: ['HRD', 'SUPERADMIN'] });
  if (!context) return true;
  if (!enforceRateLimit(req, res, { namespace: 'fingerprint-admin', key: context.user.uid, limit: 60, windowMs: 60 * 60_000 })) return true;
  const devices = context.db.collection('fingerprint_devices');

  if (body.action === 'admin_list_devices') {
    const snapshot = await devices.get();
    const rows = snapshot.docs.map(publicDeviceConfig).sort((a, b) => a.branch.localeCompare(b.branch) || a.name.localeCompare(b.name));
    res.status(200).json({ success: true, devices: rows });
    return true;
  }

  if (body.action === 'admin_create_device') {
    let input;
    try { input = validateDeviceInput(body); }
    catch (error) {
      res.status(400).json({ success: false, error: error.message });
      return true;
    }
    const ref = devices.doc();
    const code = pairingCode();
    await ref.set({
      ...input,
      enabled: true,
      tokenHash: '',
      pairingCodeHash: secretHash(code.replace(/-/g, '')),
      pairingExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await writeAuditLog(context.db, req, context.user, {
      action: 'FINGERPRINT_DEVICE_CREATED', module: 'ATTENDANCE', recordId: ref.id,
      metadata: { branch: input.branch, name: input.name }
    });
    res.status(200).json({ success: true, device: { id: ref.id, ...input, enabled: true, paired: false }, pairingCode: code, expiresInMinutes: 30 });
    return true;
  }

  const id = cleanDeviceId(body.deviceId);
  if (!id) {
    res.status(400).json({ success: false, error: 'ID mesin tidak valid.' });
    return true;
  }
  const ref = devices.doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    res.status(404).json({ success: false, error: 'Konfigurasi mesin tidak ditemukan.' });
    return true;
  }

  if (body.action === 'admin_update_device') {
    let input;
    try { input = validateDeviceInput(body); }
    catch (error) {
      res.status(400).json({ success: false, error: error.message });
      return true;
    }
    await ref.set({ ...input, enabled: body.enabled !== false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await writeAuditLog(context.db, req, context.user, {
      action: 'FINGERPRINT_DEVICE_UPDATED', module: 'ATTENDANCE', recordId: id,
      metadata: { branch: input.branch, name: input.name, enabled: body.enabled !== false }
    });
    const updated = await ref.get();
    res.status(200).json({ success: true, device: publicDeviceConfig(updated) });
    return true;
  }

  if (body.action === 'admin_pairing_code') {
    const code = pairingCode();
    await ref.set({
      pairingCodeHash: secretHash(code.replace(/-/g, '')),
      pairingExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      tokenHash: '',
      pairedAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    res.status(200).json({ success: true, pairingCode: code, expiresInMinutes: 30 });
    return true;
  }

  if (body.action === 'admin_request_sync') {
    const fromDate = String(body.fromDate || '').trim();
    const toDate = String(body.toDate || fromDate).trim();
    const span = validIsoDate(fromDate) && validIsoDate(toDate) ? dateDistanceDays(fromDate, toDate) : -1;
    if (span < 0 || span > 31) {
      res.status(400).json({ success: false, error: 'Periode tarik ulang tidak valid atau lebih dari 31 hari.' });
      return true;
    }
    const requestId = crypto.randomBytes(12).toString('hex');
    await ref.set({
      resyncRequest: {
        id: requestId,
        fromDate,
        toDate,
        requestedAt: new Date().toISOString(),
        requestedBy: context.user.uid
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await writeAuditLog(context.db, req, context.user, {
      action: 'FINGERPRINT_RESYNC_REQUESTED', module: 'ATTENDANCE', recordId: id,
      metadata: { from_date: fromDate, to_date: toDate }
    });
    res.status(200).json({ success: true, requestId, fromDate, toDate });
    return true;
  }

  res.status(400).json({ success: false, error: 'Tindakan konfigurasi mesin tidak dikenali.' });
  return true;
}

async function pairDevice(req, res, db, body) {
  const code = String(body?.pairingCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) return res.status(400).json({ success: false, error: 'Format kode pairing tidak valid.' });
  if (!enforceRateLimit(req, res, { namespace: 'fingerprint-pair', limit: 8, windowMs: 15 * 60_000 })) return;
  const snapshot = await db.collection('fingerprint_devices').where('pairingCodeHash', '==', secretHash(code)).limit(2).get();
  if (snapshot.empty || snapshot.size !== 1) return res.status(401).json({ success: false, error: 'Kode pairing salah atau sudah tidak berlaku.' });
  const deviceSnapshot = snapshot.docs[0];
  const data = deviceSnapshot.data();
  if (data.enabled === false || !data.pairingExpiresAt || new Date(data.pairingExpiresAt).getTime() < Date.now()) {
    return res.status(401).json({ success: false, error: 'Kode pairing sudah kedaluwarsa. Buat kode baru dari HRIS.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  await deviceSnapshot.ref.set({
    tokenHash: secretHash(token),
    pairingCodeHash: admin.firestore.FieldValue.delete(),
    pairingExpiresAt: admin.firestore.FieldValue.delete(),
    pairedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    lastError: '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return res.status(200).json({
    success: true,
    deviceId: deviceSnapshot.id,
    deviceToken: token,
    config: publicDeviceConfig({ id: deviceSnapshot.id, data: () => ({ ...data, tokenHash: secretHash(token) }) })
  });
}

async function authenticatePairedDevice(req, db) {
  const id = cleanDeviceId(req.headers?.['x-fingerprint-device-id']);
  const token = String(req.headers?.['x-fingerprint-device-token'] || '').trim();
  const timestamp = Number(req.headers?.['x-bridge-timestamp']);
  if (!id || token.length < 32 || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000) return null;
  const snapshot = await db.collection('fingerprint_devices').doc(id).get();
  if (!snapshot.exists || snapshot.data()?.enabled === false || !timingSafeTextEqual(secretHash(token), snapshot.data()?.tokenHash)) return null;
  await snapshot.ref.set({ lastSeenAt: admin.firestore.FieldValue.serverTimestamp(), lastError: '' }, { merge: true });
  return { id, branch: normalizeBranch(snapshot.data()?.branch), snapshot };
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

  try {
    const { rawBody, body } = await readJsonBody(req);
    req.body = body;

    if (String(body?.action || '').startsWith('izin_')) {
      await handleIzinAccess(req, res, body);
      return;
    }

    if (String(body?.action || '').startsWith('attendance_')) {
      await handleAttendanceAccess(req, res, body);
      return;
    }

    if (String(body?.action || '').startsWith('training_')) {
      await handleTrainingAccess(req, res, body);
      return;
    }

    if (String(body?.action || '').startsWith('notification_')) {
      await handleNotificationAccess(req, res, body);
      return;
    }

    if (String(body?.action || '').startsWith('sales_track_')) {
      await handleSalesTrackingAccess(req, res, body);
      return;
    }

    if (String(body?.action || '').startsWith('admin_')) {
      await handleAdminDeviceAction(req, res, body);
      return;
    }

    const { db, error } = getFirebaseAdmin();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: error || "Firebase Admin environment variables are not configured."
      });
    }

    if (body?.action === 'pair') {
      await pairDevice(req, res, db, body);
      return;
    }

    const pairedDevice = await authenticatePairedDevice(req, db);
    const legacyAuthenticated = !pairedDevice && verifyBridgeSignature(req, rawBody);
    if (!pairedDevice && !legacyAuthenticated) {
      return res.status(401).json({ success: false, error: 'Autentikasi fingerprint bridge tidak valid.' });
    }
    const rateKey = pairedDevice?.id || 'legacy';
    if (!enforceRateLimit(req, res, { namespace: 'sync-absen', key: rateKey, limit: 30, windowMs: 60_000 })) return;

    const branch = pairedDevice?.branch || normalizeBranch(req.body?.branch);
    if (!branch) return res.status(400).json({ success: false, error: 'Cabang mesin fingerprint wajib diisi.' });
    const safeBranch = branch.replace(/[^A-Z0-9_-]/g, '_').slice(0, 50);
    const syncStateRef = db.collection('system_metadata').doc(`fingerprint_sync_${safeBranch}`);

    if (req.body?.action === 'heartbeat') {
      if (!pairedDevice) return res.status(400).json({ success: false, error: 'Heartbeat hanya tersedia untuk mesin yang sudah dipasangkan.' });
      const lastError = String(req.body?.error || '').trim().slice(0, 300);
      await pairedDevice.snapshot.ref.set({
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError
      }, { merge: true });
      return res.status(200).json({ success: true });
    }

    if (req.body?.action === 'config') {
      if (!pairedDevice) return res.status(400).json({ success: false, error: 'Konfigurasi pusat hanya tersedia untuk mesin yang sudah dipasangkan.' });
      return res.status(200).json({ success: true, config: publicDeviceConfig(pairedDevice.snapshot) });
    }

    if (req.body?.action === 'sync_complete') {
      if (!pairedDevice) return res.status(400).json({ success: false, error: 'Konfirmasi sinkronisasi memerlukan mesin yang dipasangkan.' });
      const requestId = String(req.body?.requestId || '').trim();
      const pendingId = String(pairedDevice.snapshot.data()?.resyncRequest?.id || '');
      if (requestId && pendingId && timingSafeTextEqual(requestId, pendingId)) {
        const syncError = String(req.body?.error || '').trim().slice(0, 300);
        await pairedDevice.snapshot.ref.set({
          resyncRequest: admin.firestore.FieldValue.delete(),
          lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: syncError
        }, { merge: true });
      }
      return res.status(200).json({ success: true });
    }

    if (req.body?.action === 'status') {
      let latestDate = '';
      if (supabaseEnabled()) {
        // Status bridge tidak boleh bergantung pada Firestore setelah provider
        // absensi dipindahkan. Ini juga membuat npm start tetap berjalan saat
        // kuota database lama sudah habis.
        const rows = await listAttendance({ branch, limit: 1 });
        latestDate = String(rows[0]?.tanggal || '');
      } else {
        const stateSnap = await syncStateRef.get();
        latestDate = stateSnap.exists ? String(stateSnap.data()?.latestDate || '') : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(latestDate)) {
          const branchSnap = await db.collection('data_absensi').where('cabang', '==', branch).select('tanggal').get();
          latestDate = branchSnap.docs.reduce((latest, doc) => {
            const date = String(doc.data()?.tanggal || '');
            return date > latest ? date : latest;
          }, '');
        }
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
    let employeeDocs = [];
    let scheduleRows = [];
    try {
      const [employeeSnap, settingsSnap] = await Promise.all([
        db.collection('master_karyawan').get(),
        db.collection('app_settings').doc('main').get()
      ]);
      employeeDocs = employeeSnap.docs;
      scheduleRows = settingsSnap.exists && Array.isArray(settingsSnap.data()?.jadwal)
        ? settingsSnap.data().jadwal
        : [];
    } catch (error) {
      if (!supabaseEnabled() || !isFirestoreQuotaError(error)) throw error;
      console.warn('[sync-absen] Firestore master unavailable; resolving fingerprint identity from Supabase history.');
    }
    let identityHistoryRows = [];
    if (supabaseEnabled()) {
      identityHistoryRows = await listAttendance({ branch, limit: 5000 });
    }
    const { resolveWorkSchedule } = await import('../js/work-schedule.mjs');
    const employeeMap = new Map();
    const numericEmployeeMap = new Map();
    const employeeNameMap = new Map();
    const employees = [];
    const { machineNameAgrees, addUniqueIdentifier } = require('../lib/fingerprint-identity');
    const fingerprintFields = [
      'nik', 'nik_karyawan', 'finger_id', 'kode_finger', 'no_finger', 'id_finger', 'pin',
      'fingerprint_user_id', 'fingerprint_emp_no', 'fingerprint_no_id'
    ];
    const registerEmployee = employee => {
      if (normalizeBranch(employee.cabang) !== branch) return;
      employees.push(employee);
      const identifiers = [employee._docId, ...fingerprintFields.map(field => employee[field])];
      identifiers.forEach(value => {
        const key = String(value || '').trim().toUpperCase();
        if (!key) return;
        addUniqueIdentifier(employeeMap, key, employee);
        if (/^\d+$/.test(key)) {
          const numericKey = key.replace(/^0+(?=\d)/, '');
          if (!numericEmployeeMap.has(numericKey)) numericEmployeeMap.set(numericKey, employee);
          else if (numericEmployeeMap.get(numericKey)?._docId !== employee._docId) numericEmployeeMap.set(numericKey, null);
        }
      });
      const names = [employee.nama_karyawan, employee.nama, employee.finger_name, employee.fingerprint_name];
      names.forEach(value => {
        const nameKey = normalizePersonName(value);
        if (!nameKey) return;
        if (!employeeNameMap.has(nameKey)) employeeNameMap.set(nameKey, employee);
        else if (employeeNameMap.get(nameKey)?._docId !== employee._docId) employeeNameMap.set(nameKey, null);
      });
    };
    employeeDocs.forEach(snapshot => registerEmployee({ ...snapshot.data(), _docId: snapshot.id }));
    if (!employeeDocs.length) {
      const historyByNik = new Map();
      identityHistoryRows.forEach(row => {
        const nik = String(row.nik || '').trim();
        // Baris sementara menjaga scan tidak hilang, tetapi tidak boleh dipakai
        // sebagai master identitas pada sinkronisasi berikutnya.
        if (!nik || row.auto_assign === false || isProvisionalFingerprintNik(nik)) return;
        const current = historyByNik.get(nik) || {};
        historyByNik.set(nik, {
          ...current,
          _docId: `SUPABASE-${nik}`,
          nik,
          nik_karyawan: nik,
          nama: row.nama || current.nama || '',
          nama_karyawan: row.nama || current.nama_karyawan || '',
          cabang: row.cabang || current.cabang || branch,
          divisi: row.divisi || current.divisi || '',
          jabatan: row.jabatan || current.jabatan || '',
          finger_name: row.fingerprint_name || current.finger_name || '',
          fingerprint_name: row.fingerprint_name || current.fingerprint_name || '',
          fingerprint_user_id: row.fingerprint_user_id || current.fingerprint_user_id || '',
          fingerprint_emp_no: row.fingerprint_emp_no || current.fingerprint_emp_no || '',
          fingerprint_no_id: row.fingerprint_no_id || current.fingerprint_no_id || ''
        });
      });
      historyByNik.forEach(registerEmployee);
    }
    const deviceUserNameMap = new Map();
    const deviceUserMetadataMap = new Map();
    deviceUsers.forEach(user => {
      const empNo = String(user?.empNo ?? user?.uid ?? user?.userSn ?? '').trim();
      const noId = String(user?.noId ?? user?.userId ?? user?.deviceUserId ?? '').trim();
      const id = String(user?.deviceUserId || noId || empNo).trim().toUpperCase();
      const name = normalizePersonName(user?.name);
      const metadata = { empNo, noId: noId || id, name: String(user?.name || '').trim() };
      [id, empNo, noId].map(value => String(value || '').trim().toUpperCase()).filter(Boolean).forEach(alias => {
        deviceUserMetadataMap.set(alias, metadata);
        if (name) deviceUserNameMap.set(alias, name);
      });
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
      const machineName = deviceUserNameMap.get(exactKey);
      if (employeeMap.has(exactKey)) {
        const matched = employeeMap.get(exactKey);
        return matched && machineNameAgrees(matched, machineName) ? matched : null;
      }
      if (/^\d+$/.test(exactKey)) {
        const numericMatch = numericEmployeeMap.get(exactKey.replace(/^0+(?=\d)/, ''));
        if (numericMatch) return machineNameAgrees(numericMatch, machineName) ? numericMatch : null;
      }
      return machineName ? resolveEmployeeByMachineName(machineName) : null;
    };

    // --- 3) Upsert per (NIK, tanggal), MERGE dgn scan lama kalau ada ----
    // Ukuran kecil menyisakan ruang pada batas 500 operasi per batch untuk
    // menghapus dokumen impor/legacy yang memiliki NIK+tanggal yang sama.
    const chunkSize = 50;
    let count = 0;
    let duplicatesRemoved = 0;
    let useSupabaseAttendance = supabaseEnabled();
    const groupDates = groupList.map(group => group.tanggal).sort();
    let existingSupabaseRows = [];
    if (useSupabaseAttendance) {
      try {
        existingSupabaseRows = identityHistoryRows.filter(row =>
          String(row.tanggal || '') >= groupDates[0] && String(row.tanggal || '') <= groupDates[groupDates.length - 1]
        );
      } catch (error) {
        const fallbackEnabled = String(process.env.ATTENDANCE_FIRESTORE_FALLBACK || 'true').toLowerCase() !== 'false';
        if (!fallbackEnabled) throw error;
        console.warn('[sync-absen] Supabase unavailable, continuing fingerprint sync in Firestore:', error.message);
        useSupabaseAttendance = false;
      }
    }
    const supabaseByEmployeeDate = new Map(existingSupabaseRows.map(row => [
      `${String(row.nik || '').trim().toUpperCase()}|${String(row.tanggal || '').trim()}`,
      row
    ]));
    const pendingByFingerprintDate = new Map(existingSupabaseRows
      .filter(row => row.auto_assign === false || isProvisionalFingerprintNik(row.nik))
      .map(row => [`${String(row.fingerprint_user_id || '').trim().toUpperCase()}|${String(row.tanggal || '').trim()}`, row]));
    for (let i = 0; i < groupList.length; i += chunkSize) {
      const chunk = groupList.slice(i, i + chunkSize);
      const chunkItems = chunk.map(group => {
        const matchedEmployee = resolveEmployee(group.deviceUserId);
        const machineUser = deviceUserMetadataMap.get(String(group.deviceUserId).trim().toUpperCase()) || null;
        const employee = matchedEmployee || (useSupabaseAttendance ? {
          _docId: `PENDING-${group.deviceUserId}`,
          _fingerprintPending: true,
          nik_karyawan: provisionalFingerprintNik(branch, group.deviceUserId),
          nama_karyawan: machineUser?.name || `ID Finger ${group.deviceUserId}`,
          finger_name: machineUser?.name || '',
          cabang: branch,
          divisi: '',
          jabatan: ''
        } : null);
        const nik = String(employee?.nik_karyawan || employee?.nik || group.deviceUserId).trim();
        const safeNik = nik.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
        const ref = db.collection('data_absensi').doc(`ABS-FP-${safeNik}-${group.tanggal}`);
        const safeDeviceId = String(group.deviceUserId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
        const legacyRef = db.collection('data_absensi').doc(`ABS-FP-${safeDeviceId}-${group.tanggal}`);
        return { group, employee, matchedEmployee, machineUser, nik, ref, legacyRef };
      });
      const resolvedChunk = chunkItems.filter(item => item.employee);
      if (useSupabaseAttendance) {
        const rows = resolvedChunk.map(item => {
          const { group: g, employee, matchedEmployee, machineUser, nik, ref } = item;
          const key = `${String(nik).trim().toUpperCase()}|${g.tanggal}`;
          const oldData = supabaseByEmployeeDate.get(key) || {};
          const schedule = resolveWorkSchedule(employee, scheduleRows, g.tanggal);
          const attendance = computeAttendance(g.events, oldData, minWorkGapMinutes, schedule);
          const row = {
            ...oldData,
            id: ref.id,
            nik,
            fingerprint_user_id: g.deviceUserId,
            fingerprint_emp_no: machineUser?.empNo || g.deviceUserId,
            fingerprint_no_id: machineUser?.noId || g.deviceUserId,
            fingerprint_name: machineUser?.name || employee?.finger_name || '',
            auto_assign: Boolean(matchedEmployee),
            nama: employee?._fingerprintPending
              ? `${employee.nama_karyawan} (BELUM DIPETAKAN)`
              : employee?.nama_karyawan || employee?.nama || oldData.nama || `ID Finger ${g.deviceUserId}`,
            tanggal: g.tanggal,
            scan_masuk: attendance.scan_masuk,
            scan_keluar: attendance.scan_keluar,
            perlu_koreksi: employee?._fingerprintPending || attendance.needs_review,
            alasan_koreksi: employee?._fingerprintPending
              ? 'Identitas finger belum dipetakan ke master karyawan. Scan tetap disimpan dan wajib direkonsiliasi HRD.'
              : attendance.review_reason,
            klasifikasi_scan: employee?._fingerprintPending ? 'IDENTITY_PENDING' : attendance.classification,
            cabang: employee.cabang || branch,
            divisi: employee?.divisi || employee?.departemen || oldData.divisi || '',
            jabatan: employee?.jabatan || employee?.posisi || oldData.jabatan || '',
            sumber: 'FINGERPRINT',
            disinkron_pada: new Date().toISOString()
          };
          supabaseByEmployeeDate.set(key, row);
          return row;
        });
        if (rows.length) await upsertAttendance(rows);
        const resolvedPendingIds = resolvedChunk
          .filter(item => item.matchedEmployee)
          .map(item => pendingByFingerprintDate.get(`${String(item.group.deviceUserId).trim().toUpperCase()}|${item.group.tanggal}`)?.id)
          .filter(Boolean);
        if (resolvedPendingIds.length) await deleteAttendance(resolvedPendingIds);
        count += rows.length;
        continue;
      }
      const existingSnapshots = resolvedChunk.length
        ? await db.getAll(...resolvedChunk.map(item => item.ref))
        : [];
      const dates = [...new Set(resolvedChunk.map(item => item.group.tanggal))];
      const dateSnapshots = await Promise.all(dates.map(date =>
        db.collection('data_absensi').where('tanggal', '==', date).get()
      ));
      const documentsByEmployeeDate = new Map();
      dateSnapshots.forEach(snapshot => snapshot.docs.forEach(attendanceDoc => {
        const data = attendanceDoc.data() || {};
        const nikKey = String(data.nik || data.nik_karyawan || '').trim().toUpperCase();
        const dateKey = String(data.tanggal || '').trim();
        if (!nikKey || !dateKey) return;
        const key = `${nikKey}|${dateKey}`;
        if (!documentsByEmployeeDate.has(key)) documentsByEmployeeDate.set(key, []);
        documentsByEmployeeDate.get(key).push(attendanceDoc.ref);
      }));
      const batch = db.batch();

      // Scan dengan identitas tidak cocok tidak ditulis maupun dihapus otomatis;
      // catat sebagai unmatched agar HRD bisa memperbaiki pendaftaran pada mesin.

      resolvedChunk.forEach((item, index) => {
        const { group: g, employee, machineUser, nik, ref, legacyRef } = item;
        const existing = existingSnapshots[index];
        const oldData = existing.exists ? existing.data() : {};
        const schedule = resolveWorkSchedule(employee, scheduleRows, g.tanggal);
        const attendance = computeAttendance(g.events, oldData, minWorkGapMinutes, schedule);

        batch.set(ref, {
          nik,
          fingerprint_user_id: g.deviceUserId,
          fingerprint_emp_no: machineUser?.empNo || g.deviceUserId,
          fingerprint_no_id: machineUser?.noId || g.deviceUserId,
          fingerprint_name: machineUser?.name || employee?.finger_name || '',
          auto_assign: true,
          nama: employee?.nama_karyawan || employee?.nama || oldData.nama || `ID Finger ${g.deviceUserId} (belum dipetakan)`,
          tanggal: g.tanggal,
          scan_masuk: attendance.scan_masuk,
          scan_keluar: attendance.scan_keluar,
          perlu_koreksi: attendance.needs_review,
          alasan_koreksi: attendance.review_reason,
          klasifikasi_scan: attendance.classification,
          cabang: employee.cabang || branch,
          divisi: employee?.divisi || employee?.departemen || oldData.divisi || '',
          jabatan: employee?.jabatan || employee?.posisi || oldData.jabatan || '',
          sumber: "FINGERPRINT",
          disinkron_pada: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        if (legacyRef.path !== ref.path) batch.delete(legacyRef);

        // Fingerprint asli menjadi sumber utama. Hapus baris impor lama atau
        // ID acak lain untuk karyawan dan tanggal yang sama agar tabel tidak
        // menampilkan jam dummy/duplikat di samping hasil mesin.
        const duplicateKey = `${String(nik).trim().toUpperCase()}|${g.tanggal}`;
        const duplicateRefs = (documentsByEmployeeDate.get(duplicateKey) || [])
          .filter(candidate => candidate.path !== ref.path && candidate.path !== legacyRef.path)
          .slice(0, 5);
        duplicateRefs.forEach(candidate => {
          batch.delete(candidate);
          duplicatesRemoved += 1;
        });

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
    if (newestDate && !supabaseEnabled()) {
      await db.runTransaction(async transaction => {
        const stateSnap = await transaction.get(syncStateRef);
        const currentDate = stateSnap.exists ? String(stateSnap.data()?.latestDate || '') : '';
        if (newestDate > currentDate) transaction.set(syncStateRef, {
          latestDate: newestDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    }

    try {
      await writeAuditLog(db, req, null, {
        action: 'FINGERPRINT_SYNC', module: 'ATTENDANCE',
        metadata: { branch, processed_records: count, raw_scans: logs.length, invalid_logs: invalidLogs, unmatched_count: unmatchedIds.length, duplicates_removed: duplicatesRemoved }
      });
    } catch (error) {
      if (!supabaseEnabled() || !isFirestoreQuotaError(error)) throw error;
      console.warn('[sync-absen] Firestore audit deferred; attendance data already stored in Supabase.');
    }
    if (pairedDevice) {
      try {
        await pairedDevice.snapshot.ref.set({
          lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: ''
        }, { merge: true });
      } catch (error) {
        if (!supabaseEnabled() || !isFirestoreQuotaError(error)) throw error;
      }
    }
    res.status(200).json({
      success: true,
      message: `${count} data absen (${logs.length} scan mentah) berhasil disinkronkan.`,
      processedRecords: count,
      rawScans: logs.length,
      branch,
      invalidLogs,
      duplicatesRemoved,
      unmatchedFingerprintIds: unmatchedIds,
      unmatchedFingerprintUsers
    });

  } catch (error) {
    console.error("CRASH SYNC ABSEN:", error);
    res.status(500).json({ success: false, error: "Gagal memproses sinkronisasi fingerprint." });
  }
};

module.exports._test = {
  validPrivateIpv4, validIsoDate, dateDistanceDays, cleanDeviceId, pairingCode, secretHash,
  normalizeBranch, provisionalFingerprintNik, isProvisionalFingerprintNik
};
