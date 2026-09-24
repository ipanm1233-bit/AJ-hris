'use strict';

const { supabaseRequest } = require('./supabase.js');
const { attendanceFromSupabase } = require('./attendance-supabase.js');

const norm = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const validDate = value => {
  const date = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
};
const validId = value => /^[A-Za-z0-9._-]{1,60}$/.test(String(value || ''));

function mappingTableError(error) {
  if (/fingerprint_mappings|schema cache|does not exist/i.test(String(error?.message || ''))) {
    throw new Error('Tabel pemetaan finger belum terpasang di Supabase. Jalankan migrasi 004_fingerprint_mappings.sql melalui SQL Editor.');
  }
  throw error;
}

async function listFingerprintMappings(branch = '', options = {}) {
  try {
    const rows = await supabaseRequest('fingerprint_mappings', {
      query: { select: '*', ...(branch ? { cabang: `eq.${norm(branch)}` } : {}), order: 'created_at.desc', limit: 1000 },
      ...options
    });
    return Array.isArray(rows) ? rows : [];
  } catch (error) { mappingTableError(error); }
}

async function fingerprintAttendanceById(id, options = {}) {
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(String(id || ''))) throw new Error('ID absensi tidak valid.');
  const rows = await supabaseRequest('attendance', { query: { id: `eq.${id}`, select: '*', limit: 1 }, ...options });
  return rows?.[0] ? attendanceFromSupabase(rows[0]) : null;
}

function mappingForScan(mappings, { branch, empNo, noId, fingerName, date }) {
  const matches = (mappings || []).filter(item => item.active === true &&
    norm(item.cabang) === norm(branch) && norm(item.emp_no) === norm(empNo) &&
    norm(item.no_id) === norm(noId) && norm(item.finger_name) === norm(fingerName) &&
    validDate(date) && item.effective_from <= date && (!item.effective_to || item.effective_to >= date));
  return matches.length === 1 ? matches[0] : null;
}

function planManualFingerprintRows(rows, mapping) {
  const updates = new Map();
  const deleteIds = [];
  let skipped = 0;
  const match = row => mappingForScan([mapping], {
    branch: row.cabang, empNo: row.fingerprint_user_id || row.fingerprint_emp_no || row.emp_no,
    noId: row.fingerprint_no_id || row.no_id,
    fingerName: row.fingerprint_name || row.nama_finger, date: row.tanggal
  });
  for (const row of rows) {
    if (!String(row.nik || '').toUpperCase().startsWith('FINGER-') || !match(row)) continue;
    const peers = rows.filter(item => item.tanggal === row.tanggal && norm(item.cabang) === norm(mapping.cabang) &&
      norm(item.fingerprint_no_id || item.no_id) === norm(mapping.no_id) &&
      !String(item.nik || '').toUpperCase().startsWith('FINGER-'));
    if (peers.some(item => String(item.nik || '') !== mapping.nik)) { skipped++; continue; }
    const key = `${mapping.nik}|${row.tanggal}`;
    const existing = updates.get(key) || rows.find(item => String(item.nik || '') === mapping.nik &&
      item.tanggal === row.tanggal && norm(item.cabang) === norm(mapping.cabang));
    const scans = [existing?.scan_masuk, existing?.scan_keluar, row.scan_masuk, row.scan_keluar]
      .map(value => String(value || '').slice(0, 5)).filter(value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)).sort();
    const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const complete = scans.length > 1 && minutes(scans.at(-1)) - minutes(scans[0]) >= 120;
    updates.set(key, {
      ...(existing || row), id: existing?.id || `ABS-FP-${mapping.nik.replace(/[^A-Za-z0-9._-]/g, '_')}-${row.tanggal}`,
      nik: mapping.nik, nama: mapping.nama_karyawan, cabang: mapping.cabang,
      fingerprint_user_id: mapping.emp_no, fingerprint_no_id: mapping.no_id,
      fingerprint_name: row.fingerprint_name || mapping.finger_name,
      auto_assign: true, klasifikasi_scan: complete ? 'MANUAL_MAPPING_COMPLETE' : 'MANUAL_MAPPING',
      scan_masuk: scans[0] || null,
      scan_keluar: complete ? scans.at(-1) : (existing?.scan_keluar || row.scan_keluar || null),
      perlu_koreksi: !complete && Boolean(existing?.perlu_koreksi || row.perlu_koreksi),
      alasan_koreksi: complete ? '' : (existing?.alasan_koreksi || 'Periksa scan masuk/pulang yang belum lengkap.')
    });
    if (row.id && row.id !== updates.get(key).id) deleteIds.push(row.id);
  }
  return { updates: [...updates.values()], deleteIds: [...new Set(deleteIds)], skipped };
}

function validateManualMapping(input, employees, existing = []) {
  const branch = norm(input.cabang);
  const empNo = String(input.empNo || '').trim();
  const noId = String(input.noId || '').trim();
  const fingerName = norm(input.fingerName);
  const nik = String(input.nik || '').trim();
  const from = String(input.effectiveFrom || '').trim();
  const to = String(input.effectiveTo || '').trim();
  const reason = String(input.reason || '').trim();
  if (!branch || !validId(empNo) || !validId(noId) || !fingerName || fingerName.length > 100 ||
      !validDate(from) || (to && (!validDate(to) || to < from)) || reason.length < 10 || reason.length > 1000) {
    throw new Error('Isi cabang, kedua ID mesin, nama finger, periode, dan alasan minimal 10 karakter.');
  }
  const candidates = employees.filter(item => norm(item.cabang) === branch && String(item.nik || item.nik_karyawan || '').trim() === nik);
  if (candidates.length !== 1) throw new Error('NIK karyawan harus terdaftar tepat satu kali di cabang tersebut.');
  const employee = candidates[0];
  const name = String(employee.nama_karyawan || employee.nama || '').trim();
  if (!name) throw new Error('Nama karyawan pada master belum lengkap.');
  const overlap = existing.some(item => item.active === true && norm(item.cabang) === branch &&
    ((norm(item.emp_no) === norm(empNo)) || (norm(item.no_id) === norm(noId))) &&
    item.effective_from <= (to || '9999-12-31') && (item.effective_to || '9999-12-31') >= from &&
    norm(item.finger_name) !== fingerName);
  if (overlap) throw new Error('ID mesin sudah memiliki pemetaan aktif dengan nama lain pada periode tersebut. Atur batas tanggal atau nonaktifkan pemetaan lama.');
  const duplicate = existing.some(item => item.active === true && norm(item.cabang) === branch &&
    norm(item.emp_no) === norm(empNo) && norm(item.no_id) === norm(noId) &&
    norm(item.finger_name) === fingerName && item.effective_from <= (to || '9999-12-31') &&
    (item.effective_to || '9999-12-31') >= from);
  if (duplicate) throw new Error('Sudah ada pemetaan aktif untuk identitas dan periode mesin yang sama.');
  return { cabang: branch, emp_no: empNo, no_id: noId, finger_name: fingerName, nik,
    nama_karyawan: name, effective_from: from, effective_to: to || null, reason };
}

async function saveFingerprintMapping(mapping, options = {}) {
  try {
    const rows = await supabaseRequest('fingerprint_mappings', {
      method: 'POST', prefer: 'return=representation', body: mapping, ...options
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Supabase belum mengonfirmasi pemetaan finger.');
    return rows[0];
  } catch (error) { mappingTableError(error); }
}

async function revokeFingerprintMapping(id, actor, options = {}) {
  try {
    const rows = await supabaseRequest('fingerprint_mappings', {
      method: 'PATCH', query: { id: `eq.${id}`, active: 'eq.true', select: 'id' },
      prefer: 'return=representation', body: { active: false, revoked_by: actor, revoked_at: new Date().toISOString() }, ...options
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Pemetaan finger aktif tidak ditemukan.');
    return rows[0];
  } catch (error) { mappingTableError(error); }
}

module.exports = { listFingerprintMappings, fingerprintAttendanceById, mappingForScan, planManualFingerprintRows, validateManualMapping, saveFingerprintMapping, revokeFingerprintMapping };
