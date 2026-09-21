'use strict';

const { supabaseRequest } = require('./supabase.js');

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanTime(value) {
  const text = String(value || '').trim().slice(0, 5);
  return TIME_RE.test(text) ? text : null;
}

function attendanceToSupabase(row = {}) {
  const nik = String(row.nik || row.nik_karyawan || '').trim();
  const tanggal = String(row.tanggal || '').trim();
  if (!nik || !DATE_RE.test(tanggal)) throw new Error('Absensi memerlukan NIK dan tanggal valid.');
  const id = String(row.id || `ABS-${nik}-${tanggal}`).trim().slice(0, 180);
  return {
    id,
    nik,
    nama: String(row.nama || row.nama_karyawan || '').trim(),
    tanggal,
    scan_masuk: cleanTime(row.scan_masuk),
    scan_keluar: cleanTime(row.scan_keluar || row.scan_pulang),
    cabang: String(row.cabang || '').trim().toUpperCase(),
    divisi: String(row.divisi || row.departemen || '').trim(),
    jabatan: String(row.jabatan || row.posisi || '').trim(),
    sumber: String(row.sumber || '').trim().toUpperCase(),
    fingerprint_user_id: String(row.fingerprint_user_id || '').trim() || null,
    fingerprint_emp_no: String(row.fingerprint_emp_no || row.emp_no || '').trim() || null,
    fingerprint_no_id: String(row.fingerprint_no_id || row.no_id || '').trim() || null,
    fingerprint_name: String(row.fingerprint_name || row.nama_finger || '').trim() || null,
    auto_assign: row.auto_assign === true,
    perlu_koreksi: row.perlu_koreksi === true,
    alasan_koreksi: String(row.alasan_koreksi || '').trim(),
    klasifikasi_scan: String(row.klasifikasi_scan || '').trim(),
    late_penalty_waived: row.late_penalty_waived === true,
    late_penalty_note: String(row.late_penalty_note || '').trim(),
    payload: row
  };
}

function attendanceFromSupabase(row = {}) {
  return {
    ...(row.payload && typeof row.payload === 'object' ? row.payload : {}),
    id: row.id,
    _docId: row.id,
    nik: row.nik,
    nama: row.nama,
    tanggal: row.tanggal,
    scan_masuk: row.scan_masuk ? String(row.scan_masuk).slice(0, 5) : null,
    scan_keluar: row.scan_keluar ? String(row.scan_keluar).slice(0, 5) : null,
    cabang: row.cabang,
    divisi: row.divisi,
    jabatan: row.jabatan,
    sumber: row.sumber,
    fingerprint_user_id: row.fingerprint_user_id,
    fingerprint_emp_no: row.fingerprint_emp_no,
    fingerprint_no_id: row.fingerprint_no_id,
    fingerprint_name: row.fingerprint_name,
    auto_assign: row.auto_assign,
    perlu_koreksi: row.perlu_koreksi,
    alasan_koreksi: row.alasan_koreksi,
    klasifikasi_scan: row.klasifikasi_scan,
    late_penalty_waived: row.late_penalty_waived,
    late_penalty_note: row.late_penalty_note
  };
}

async function listAttendance(filters = {}, options = {}) {
  const query = { select: '*' };
  if (filters.fromDate && filters.toDate) {
    query.and = `(tanggal.gte.${filters.fromDate},tanggal.lte.${filters.toDate})`;
  } else if (filters.fromDate) {
    query.tanggal = `gte.${filters.fromDate}`;
  } else if (filters.toDate) {
    query.tanggal = `lte.${filters.toDate}`;
  }
  if (filters.nik) query.nik = `eq.${filters.nik}`;
  if (filters.branch) query.cabang = `eq.${String(filters.branch).trim().toUpperCase()}`;
  query.order = 'tanggal.desc,nik.asc';
  query.limit = Math.min(5000, Math.max(1, Number(filters.limit || 2500)));
  const rows = await supabaseRequest('attendance', { query, ...options });
  return (rows || []).map(attendanceFromSupabase);
}

async function upsertAttendance(rows, options = {}) {
  const payload = (Array.isArray(rows) ? rows : [rows]).map(attendanceToSupabase);
  if (!payload.length) return [];
  return supabaseRequest('attendance', {
    method: 'POST',
    query: { on_conflict: 'nik,tanggal' },
    prefer: 'resolution=merge-duplicates,return=representation',
    body: payload,
    ...options
  });
}

async function patchAttendance(id, changes = {}, options = {}) {
  const payload = {};
  if (Object.hasOwn(changes, 'scan_masuk')) payload.scan_masuk = cleanTime(changes.scan_masuk);
  if (Object.hasOwn(changes, 'scan_keluar')) payload.scan_keluar = cleanTime(changes.scan_keluar);
  if (Object.hasOwn(changes, 'late_penalty_waived')) payload.late_penalty_waived = changes.late_penalty_waived === true;
  if (Object.hasOwn(changes, 'late_penalty_note')) payload.late_penalty_note = String(changes.late_penalty_note || '').trim();
  return supabaseRequest('attendance', {
    method: 'PATCH', query: { id: `eq.${id}`, select: '*' },
    prefer: 'return=representation', body: payload, ...options
  });
}

async function deleteAttendance(ids, options = {}) {
  const values = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!values.length) return [];
  return supabaseRequest('attendance', {
    method: 'DELETE', query: { id: `in.(${values.map(value => `"${value.replace(/["\\]/g, '')}"`).join(',')})`, select: 'id' },
    prefer: 'return=representation', ...options
  });
}

module.exports = {
  cleanTime, attendanceToSupabase, attendanceFromSupabase,
  listAttendance, upsertAttendance, patchAttendance, deleteAttendance
};
