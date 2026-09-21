const { requireFirebaseAuth, enforceRateLimit, normalizeBranch, writeAuditLog } = require('./security.js');
const { supabaseEnabled } = require('./supabase.js');
const { listAttendance, upsertAttendance, deleteAttendance } = require('./attendance-supabase.js');

const PRIVILEGED_ROLES = new Set(['HRD', 'SUPERADMIN', 'ADMIN']);

function safeTime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`Format jam tidak valid: ${text}`);
  return text;
}

function safeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function safeLimit(value) {
  return Math.min(5000, Math.max(1, Number(value || 2500)));
}

function isPrivileged(context) {
  return PRIVILEGED_ROLES.has(String(context?.user?.role || '').toUpperCase());
}

async function permissionFor(context) {
  const keys = [...new Set([context.user.username, context.user.nik, context.user.uid].filter(Boolean).map(String))];
  const snapshots = await Promise.all(keys.map(key => context.db.collection('user_permissions').doc(key).get()));
  const rows = snapshots.filter(snap => snap.exists).map(snap => ({ id: snap.id, ...snap.data() }));
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return rows.find(row =>
    String(row.username || '') === String(context.user.username || '') &&
    String(row.nik || '') === String(context.user.nik || '') &&
    row.allowed_menus_set === true && Array.isArray(row.allowed_menus) && row.allowed_menus.includes('absensi')
  ) || null;
}

function hasAction(permission, action) {
  return Boolean(permission && Array.isArray(permission.allowed_actions) && permission.allowed_actions.includes(action));
}

async function firestoreAttendance(db, filters = {}) {
  const branch = String(filters.branch || '').trim();
  let snapshot;
  if (branch) {
    const title = branch.toLowerCase().replace(/\b\p{L}/gu, letter => letter.toUpperCase());
    const values = [...new Set([branch, branch.toUpperCase(), branch.toLowerCase(), title])].filter(Boolean);
    const snapshots = await Promise.all(values.map(value => db.collection('data_absensi').where('cabang', '==', value).get()));
    const docs = new Map();
    snapshots.forEach(result => result.docs.forEach(item => docs.set(item.id, item)));
    snapshot = { docs: [...docs.values()] };
  } else if (filters.fromDate) {
    snapshot = await db.collection('data_absensi').where('tanggal', '>=', filters.fromDate).get();
  } else if (filters.nik) {
    snapshot = await db.collection('data_absensi').where('nik', '==', filters.nik).get();
  } else {
    snapshot = await db.collection('data_absensi').limit(safeLimit(filters.limit)).get();
  }
  return snapshot.docs
    .map(item => ({ id: item.id, _docId: item.id, ...item.data() }))
    .filter(row => !filters.fromDate || String(row.tanggal || '') >= filters.fromDate)
    .filter(row => !filters.toDate || String(row.tanggal || '') <= filters.toDate)
    .filter(row => !filters.nik || String(row.nik || row.nik_karyawan || '') === filters.nik)
    .slice(0, safeLimit(filters.limit));
}

async function loadAttendance(context, filters) {
  if (!supabaseEnabled()) return firestoreAttendance(context.db, filters);

  const supabaseRows = await listAttendance(filters);
  if (String(process.env.ATTENDANCE_FIRESTORE_FALLBACK || 'true').toLowerCase() === 'false') {
    return supabaseRows;
  }

  try {
    const legacyRows = await firestoreAttendance(context.db, filters);
    const merged = new Map(legacyRows.map(row => [String(row.id), row]));
    supabaseRows.forEach(row => merged.set(String(row.id), row));

    const migratedIds = new Set(supabaseRows.map(row => String(row.id)));
    const missingRows = legacyRows.filter(row => !migratedIds.has(String(row.id)));
    if (missingRows.length) await upsertAttendance(missingRows);

    return [...merged.values()].slice(0, safeLimit(filters.limit));
  } catch (error) {
    // Firestore is only a temporary migration fallback. Supabase must remain
    // available even when the legacy quota is exhausted or Firestore is down.
    console.warn('[attendance-access] Legacy Firestore fallback unavailable:', error.message);
    return supabaseRows;
  }
}

async function writeAttendance(context, rows) {
  if (supabaseEnabled()) return upsertAttendance(rows);
  for (let index = 0; index < rows.length; index += 400) {
    const batch = context.db.batch();
    rows.slice(index, index + 400).forEach(row => {
      const id = String(row.id || '').trim();
      const payload = { ...row };
      delete payload.id;
      delete payload._docId;
      batch.set(context.db.collection('data_absensi').doc(id), payload, { merge: true });
    });
    await batch.commit();
  }
}

async function removeAttendance(context, ids) {
  if (supabaseEnabled()) return deleteAttendance(ids);
  for (let index = 0; index < ids.length; index += 400) {
    const batch = context.db.batch();
    ids.slice(index, index + 400).forEach(id => batch.delete(context.db.collection('data_absensi').doc(id)));
    await batch.commit();
  }
  return ids;
}

async function handleAttendanceAccess(req, res, body = {}) {
  if (!enforceRateLimit(req, res, { namespace: 'attendance-access', limit: 80, windowMs: 60_000 })) return;
  const context = await requireFirebaseAuth(req, res);
  if (!context) return;

  try {
    const privileged = isPrivileged(context);
    const permission = privileged ? null : await permissionFor(context);
    const userBranch = String(context.user.branch || '').trim();
    const canViewBranch = hasAction(permission, 'absensi.data.view_all');

    if (body.action === 'attendance_list') {
      const fromDate = safeDate(body.fromDate);
      const toDate = safeDate(body.toDate);
      let branch = privileged ? String(body.branch || '').trim() : '';
      let nik = privileged ? String(body.nik || '').trim() : '';
      if (!privileged && canViewBranch) {
        if (!userBranch || userBranch === '-') return res.status(403).json({ success: false, error: 'Cabang akun PIC belum dikonfigurasi.' });
        branch = userBranch;
      } else if (!privileged) {
        nik = String(context.user.nik || '').trim();
        if (!nik) return res.status(200).json({ success: true, branch: userBranch, rows: [] });
      }
      const rows = await loadAttendance(context, { fromDate, toDate, branch, nik, limit: safeLimit(body.limit) });
      return res.status(200).json({ success: true, provider: supabaseEnabled() ? 'supabase' : 'firestore', branch, rows });
    }

    const canEdit = privileged || (hasAction(permission, 'absensi.data.edit') && permission.read_only !== true);
    if (body.action === 'attendance_upsert') {
      if (!canEdit) return res.status(403).json({ success: false, error: 'Izin menyimpan absensi belum diberikan.' });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length || rows.length > 2000) return res.status(400).json({ success: false, error: 'Jumlah data harus 1–2.000 baris.' });
      rows.forEach(row => {
        if (!row.id || !row.nik || !safeDate(row.tanggal)) throw new Error('ID, NIK, dan tanggal absensi wajib valid.');
        if (!privileged && normalizeBranch(row.cabang) !== normalizeBranch(userBranch)) throw new Error('Ada data di luar cabang PIC.');
        row.scan_masuk = safeTime(row.scan_masuk);
        row.scan_keluar = safeTime(row.scan_keluar || row.scan_pulang);
      });
      await writeAttendance(context, rows);
      await writeAuditLog(context.db, req, context.user, { action: 'ATTENDANCE_UPSERT', module: 'absensi', recordId: `${rows.length}_rows`, metadata: { provider: supabaseEnabled() ? 'supabase' : 'firestore' } });
      return res.status(200).json({ success: true, count: rows.length });
    }

    if (body.action === 'attendance_delete') {
      const canDelete = privileged || (hasAction(permission, 'absensi.data.delete') && permission.read_only !== true);
      if (!canDelete) return res.status(403).json({ success: false, error: 'Izin menghapus absensi belum diberikan.' });
      const ids = [...new Set((body.ids || []).map(value => String(value || '').trim()).filter(Boolean))];
      if (!ids.length || ids.length > 2000) return res.status(400).json({ success: false, error: 'Jumlah ID harus 1–2.000 baris.' });
      if (!privileged) {
        const rows = await loadAttendance(context, { branch: userBranch, limit: 5000 });
        const allowedIds = new Set(rows.map(row => row.id));
        if (ids.some(id => !allowedIds.has(id))) throw new Error('Ada data di luar cabang PIC.');
      }
      await removeAttendance(context, ids);
      await writeAuditLog(context.db, req, context.user, { action: 'BULK_ATTENDANCE_DELETE', module: 'absensi', recordId: `${ids.length}_rows`, metadata: { provider: supabaseEnabled() ? 'supabase' : 'firestore' } });
      return res.status(200).json({ success: true, count: ids.length });
    }

    if (body.action !== 'attendance_patch') return res.status(400).json({ success: false, error: 'Tindakan absensi tidak dikenali.' });
    if (!canEdit) return res.status(403).json({ success: false, error: 'Izin koreksi absensi belum diberikan atau akun hanya-baca.' });
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (!changes.length || changes.length > 400) return res.status(400).json({ success: false, error: 'Jumlah koreksi harus 1–400 baris.' });

    const ids = changes.map(item => String(item.id || '').trim());
    if (ids.some(id => !id)) return res.status(400).json({ success: false, error: 'ID absensi tidak valid.' });
    const existingRows = await loadAttendance(context, { branch: privileged ? '' : userBranch, limit: 5000 });
    const existingById = new Map(existingRows.map(row => [String(row.id), row]));
    const rows = changes.map(item => {
      const existing = existingById.get(String(item.id));
      if (!existing && !String(item.id).startsWith('ABS-MANUAL-')) throw new Error('Data absensi tidak ditemukan.');
      const cabang = String(existing?.cabang || item.cabang || userBranch).trim();
      if (!privileged && normalizeBranch(cabang) !== normalizeBranch(userBranch)) throw new Error('Ada data di luar cabang PIC.');
      return {
        ...(existing || {}), id: String(item.id),
        nik: String(existing?.nik || item.nik || '').trim(),
        nama: String(existing?.nama || item.nama || '').trim(),
        tanggal: String(existing?.tanggal || item.tanggal || '').trim(),
        cabang, divisi: String(existing?.divisi || item.divisi || '').trim(),
        jabatan: String(existing?.jabatan || item.jabatan || '').trim(),
        sumber: String(existing?.sumber || (privileged ? 'KOREKSI HRD' : 'KOREKSI PIC')),
        scan_masuk: safeTime(item.scan_masuk), scan_keluar: safeTime(item.scan_keluar),
        ...(privileged ? {
          late_penalty_waived: item.late_penalty_waived === true,
          late_penalty_note: item.late_penalty_waived === true ? String(item.late_penalty_note || '').trim() : '',
          late_penalty_updated_by: context.user.name || context.user.username || 'HRD',
          late_penalty_updated_at: new Date().toISOString()
        } : {})
      };
    });
    await writeAttendance(context, rows);
    await writeAuditLog(context.db, req, context.user, { action: 'BULK_ATTENDANCE_CORRECTION', module: 'absensi', recordId: `${changes.length}_rows`, metadata: { branch: privileged ? '' : userBranch, provider: supabaseEnabled() ? 'supabase' : 'firestore' } });
    return res.status(200).json({ success: true, count: changes.length });
  } catch (error) {
    console.error('[attendance-access]', error);
    return res.status(400).json({ success: false, error: error.message || 'Permintaan absensi gagal.' });
  }
}

module.exports = { handleAttendanceAccess, firestoreAttendance, loadAttendance, writeAttendance, removeAttendance };
