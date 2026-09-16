const { requireFirebaseAuth, enforceRateLimit, normalizeBranch, writeAuditLog } = require('../lib/security.js');

function safeTime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`Format jam tidak valid: ${text}`);
  return text;
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

async function branchAttendance(db, branch) {
  const raw = String(branch || '').trim();
  const title = raw.toLowerCase().replace(/\b\p{L}/gu, letter => letter.toUpperCase());
  const values = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase(), title])].filter(Boolean);
  const snapshots = await Promise.all(values.map(value => db.collection('data_absensi').where('cabang', '==', value).get()));
  const rows = new Map();
  snapshots.forEach(snapshot => snapshot.docs.forEach(item => rows.set(item.id, { id: item.id, ...item.data() })));
  return [...rows.values()];
}

module.exports = async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'attendance-access', limit: 40, windowMs: 60_000 })) return;
  const context = await requireFirebaseAuth(req, res);
  if (!context) return;

  try {
    const permission = await permissionFor(context);
    const branch = String(context.user.branch || '').trim();
    if (!branch || branch === '-') return res.status(403).json({ success: false, error: 'Cabang akun PIC belum dikonfigurasi.' });

    if (req.method === 'GET') {
      if (!hasAction(permission, 'absensi.data.view_all')) return res.status(403).json({ success: false, error: 'Izin melihat data absensi cabang belum diberikan.' });
      const rows = await branchAttendance(context.db, branch);
      return res.status(200).json({ success: true, branch, rows });
    }

    if (!hasAction(permission, 'absensi.data.edit') || permission.read_only === true) {
      return res.status(403).json({ success: false, error: 'Izin koreksi absensi belum diberikan atau akun hanya-baca.' });
    }
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (!changes.length || changes.length > 400) return res.status(400).json({ success: false, error: 'Jumlah koreksi harus 1–400 baris.' });

    const refs = changes.map(item => context.db.collection('data_absensi').doc(String(item.id || '')));
    if (refs.some(ref => !ref.id)) return res.status(400).json({ success: false, error: 'ID absensi tidak valid.' });
    const existing = await context.db.getAll(...refs);
    const batch = context.db.batch();

    changes.forEach((item, index) => {
      const ref = refs[index];
      const snap = existing[index];
      const scanUpdate = { scan_masuk: safeTime(item.scan_masuk), scan_keluar: safeTime(item.scan_keluar) };
      if (snap.exists) {
        if (normalizeBranch(snap.data().cabang) !== normalizeBranch(branch)) throw new Error('Ada data di luar cabang PIC.');
        batch.set(ref, scanUpdate, { merge: true });
        return;
      }
      if (!ref.id.startsWith('ABS-MANUAL-') || normalizeBranch(item.cabang) !== normalizeBranch(branch)) {
        throw new Error('Baris manual tidak valid atau berada di luar cabang PIC.');
      }
      batch.set(ref, {
        nik: String(item.nik || ''), nama: String(item.nama || ''), tanggal: String(item.tanggal || ''),
        cabang: branch, divisi: String(item.divisi || ''), jabatan: String(item.jabatan || ''),
        sumber: 'KOREKSI PIC', ...scanUpdate
      });
    });
    await batch.commit();
    await writeAuditLog(context.db, req, context.user, { action: 'BULK_ATTENDANCE_CORRECTION', module: 'absensi', recordId: `${changes.length}_rows`, metadata: { branch } });
    return res.status(200).json({ success: true, count: changes.length });
  } catch (error) {
    console.error('[attendance-access]', error);
    return res.status(400).json({ success: false, error: error.message || 'Permintaan absensi gagal.' });
  }
};
