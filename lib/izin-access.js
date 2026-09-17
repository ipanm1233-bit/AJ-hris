const { enforceRateLimit, requireFirebaseAuth, writeAuditLog } = require('./security.js');

const ON_BEHALF_ROLES = new Set(['HRD', 'SUPERADMIN', 'ADMIN', 'ADMINISTRATOR', 'DIREKTUR', 'GM']);
const ALLOWED_TYPES = new Set(['IZIN_TERLAMBAT', 'IZIN_PULANG_CEPAT', 'IZIN_KELUAR_KANTOR']);

function cleanText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function isYmd(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

async function handleIzinAccess(req, res, body = {}) {
  if (!enforceRateLimit(req, res, { namespace: 'izin-access', limit: 20, windowMs: 60_000 })) return;
  const context = await requireFirebaseAuth(req, res);
  if (!context) return;
  if (body.action !== 'izin_create') return res.status(400).json({ success: false, error: 'Tindakan izin tidak dikenali.' });

  try {
    const input = body.payload || {};
    const id = cleanText(input.id, 120).replace(/[^a-zA-Z0-9_-]/g, '');
    const reference = cleanText(input.no_referensi, 180);
    const type = cleanText(input.jenis_izin, 50).toUpperCase();
    const date = cleanText(input.tanggal_izin, 10);
    const targetNik = cleanText(input.nik || input.nik_pemohon, 80);
    const targetName = cleanText(input.nama_pemohon || input.pemohon, 160);
    if (!id || !ALLOWED_TYPES.has(type) || !isYmd(date) || !targetName || !cleanText(input.alasan_izin || input.alasan, 1200)) {
      return res.status(400).json({ success: false, error: 'Data pengajuan izin belum lengkap atau tidak valid.' });
    }

    const self = (targetNik && targetNik === String(context.user.nik || '')) ||
      targetName.toUpperCase() === String(context.user.name || '').trim().toUpperCase();
    if (!self && !ON_BEHALF_ROLES.has(context.user.role)) {
      return res.status(403).json({ success: false, error: 'Anda tidak berhak membuat izin atas nama karyawan lain.' });
    }

    if (!self) {
      const candidates = targetNik
        ? await context.db.collection('master_karyawan').where('nik', '==', targetNik).limit(2).get()
        : await context.db.collection('master_karyawan').where('nama_karyawan', '==', targetName).limit(2).get();
      if (candidates.empty && targetNik) {
        const alt = await context.db.collection('master_karyawan').where('nik_karyawan', '==', targetNik).limit(2).get();
        if (alt.empty) return res.status(400).json({ success: false, error: 'Karyawan pemohon tidak ditemukan.' });
      } else if (candidates.empty) {
        return res.status(400).json({ success: false, error: 'Karyawan pemohon tidak ditemukan.' });
      }
    }

    const now = new Date().toISOString();
    const payload = {
      id,
      no_referensi: reference || id,
      tgl: cleanText(input.tgl, 40) || now,
      form_id: 'F-ISO-IZIN',
      id_form: 'F-ISO-IZIN',
      tipe_form: 'FORM_IZIN',
      kategori: 'IZIN',
      nama_form: 'Formulir Permohonan Izin Karyawan',
      jenis_izin: type,
      tanggal_izin: date,
      tanggal_pengajuan: cleanText(input.tanggal_pengajuan, 40) || now,
      jam_izin: cleanText(input.jam_izin, 300),
      nama_pemohon: targetName,
      pemohon: targetName,
      nik: targetNik,
      nik_pemohon: targetNik,
      jabatan: cleanText(input.jabatan, 160),
      cabang: cleanText(input.cabang, 100),
      atasan_langsung: cleanText(input.atasan_langsung, 160),
      penanggung_jawab: cleanText(input.penanggung_jawab || input.atasan_langsung, 160),
      lampiran_url: cleanText(input.lampiran_url, 1000),
      alasan_izin: cleanText(input.alasan_izin || input.alasan, 1200),
      alasan: cleanText(input.alasan_izin || input.alasan, 1200),
      status: 'MENUNGGU',
      status_final: 'MENUNGGU',
      approval_flow: ['ATASAN', 'HRD'],
      approval_steps: ['PENDING', 'PENDING'],
      catatan_penolakan: [],
      detail: {
        jenis_izin: cleanText(input.detail?.jenis_izin || type, 160),
        tanggal_izin: date,
        jam_izin: cleanText(input.jam_izin || input.detail?.jam_izin, 300),
        alasan: cleanText(input.alasan_izin || input.alasan, 1200),
        atasan_langsung: cleanText(input.atasan_langsung, 160)
      },
      created_by_uid: context.user.uid,
      created_by: context.user.name || context.user.username,
      created_at: input.created_at || now,
      createdAt: input.createdAt || now
    };
    await context.db.collection('data_pengajuan').doc(id).create(payload);
    await writeAuditLog(context.db, req, context.user, {
      action: 'IZIN_CREATED', module: 'izin', recordId: id,
      metadata: { target_nik: targetNik, target_name: targetName, type, on_behalf: !self }
    });
    return res.status(200).json({ success: true, id });
  } catch (error) {
    console.error('[izin-access]', error);
    const conflict = error?.code === 6 || String(error?.message || '').includes('ALREADY_EXISTS');
    return res.status(conflict ? 409 : 400).json({ success: false, error: conflict ? 'Nomor pengajuan sudah digunakan.' : (error.message || 'Pengajuan izin gagal disimpan.') });
  }
}

module.exports = { handleIzinAccess, _test: { isYmd, cleanText } };
