'use strict';

const { machineNameAgrees, historicalFingerprintOwnerConflict } = require('./fingerprint-identity.js');

const key = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const provisional = row => key(row.nik).startsWith('FINGER-') || key(row.klasifikasi_scan) === 'IDENTITY_PENDING';

function planFingerprintReconciliation(rows, employees) {
  const updates = new Map();
  const deleteIds = [];
  let unresolved = 0;
  for (const row of rows.filter(provisional)) {
    const branch = key(row.cabang);
    const fingerId = key(row.fingerprint_user_id || row.fingerprint_emp_no || row.emp_no || row.fingerprint_no_id);
    const noId = key(row.fingerprint_no_id || row.no_id);
    const machineName = key(row.fingerprint_name || row.nama_finger || row.nama).replace(/\s*\(BELUM DIPETAKAN\)$/, '');
    const sameBranch = employees.filter(emp => key(emp.cabang) === branch);
    const explicit = (fingerId || noId) ? sameBranch.filter(emp =>
      [emp.finger_id, emp.kode_finger, emp.no_finger, emp.id_finger, emp.pin, emp.fingerprint_user_id, emp.fingerprint_no_id]
        .some(value => key(value) && [fingerId, noId].includes(key(value)))) : [];
    const named = machineName ? sameBranch.filter(emp => machineNameAgrees(emp, machineName)) : [];
    // A confirmed scan from the same day can supply the NIK when the employee
    // record has no machine ID, as long as the machine name and ID both agree.
    const confirmed = rows.filter(item => !provisional(item) && item.tanggal === row.tanggal &&
      key(item.cabang) === branch && machineNameAgrees({ finger_name: item.fingerprint_name || item.nama_finger || item.nama }, machineName) &&
      ((fingerId && fingerId === key(item.fingerprint_user_id || item.fingerprint_emp_no || item.emp_no)) ||
       (noId && noId === key(item.fingerprint_no_id || item.no_id))));
    const confirmedNiks = new Set(confirmed.map(item => key(item.nik || item.nik_karyawan)).filter(Boolean));
    const known = confirmedNiks.size === 1 ? sameBranch.filter(emp => key(emp.nik || emp.nik_karyawan) === [...confirmedNiks][0]) : [];
    const candidate = explicit.length === 1 ? explicit[0] : explicit.length ? null :
      named.length === 1 ? named[0] : known.length === 1 ? known[0] : null;
    const nik = String(candidate?.nik || candidate?.nik_karyawan || '').trim();
    if (!nik || !machineName || !machineNameAgrees(candidate, machineName) ||
        (confirmedNiks.size && (confirmedNiks.size !== 1 || !confirmedNiks.has(key(nik)))) ||
        [fingerId, noId].filter(Boolean).some(id => historicalFingerprintOwnerConflict(
          rows.filter(item => key(item.cabang) === branch), id, machineName
        ))) {
      unresolved++;
      continue;
    }
    const targetKey = `${key(nik)}|${row.tanggal}`;
    const existing = updates.get(targetKey) || rows.find(item => !provisional(item) && key(item.nik) === key(nik) && item.tanggal === row.tanggal);
    if (existing?.fingerprint_name && !machineNameAgrees({ finger_name: existing.fingerprint_name }, machineName)) {
      unresolved++;
      continue;
    }
    const times = [existing?.scan_masuk, existing?.scan_keluar, row.scan_masuk, row.scan_keluar]
      .filter(value => /^(?:[01]\d|2[0-3]):[0-5]\d/.test(String(value || '')))
      .map(value => String(value).slice(0, 5)).sort();
    const first = times[0] || null;
    const last = times.at(-1) || null;
    const gap = first && last && (Number(last.slice(0, 2)) * 60 + Number(last.slice(3))) -
      (Number(first.slice(0, 2)) * 60 + Number(first.slice(3))) >= 120;
    updates.set(targetKey, {
      ...(existing || row), id: existing?.id || `ABS-FP-${nik.replace(/[^a-zA-Z0-9._-]/g, '_')}-${row.tanggal}`,
      nik, nama: candidate.nama_karyawan || candidate.nama || row.nama,
      cabang: candidate.cabang, divisi: candidate.divisi || candidate.departemen || row.divisi || '',
      jabatan: candidate.jabatan || row.jabatan || '',
      fingerprint_user_id: fingerId, fingerprint_name: row.fingerprint_name || machineName,
      auto_assign: true, perlu_koreksi: !gap && Boolean(existing?.perlu_koreksi || row.perlu_koreksi),
      alasan_koreksi: gap ? '' : (existing?.alasan_koreksi || 'Scan belum lengkap; tinjau jam masuk/pulang.'),
      klasifikasi_scan: gap ? 'RECONCILED_COMPLETE' : 'RECONCILED',
      scan_masuk: first, scan_keluar: gap ? last : (existing?.scan_keluar || row.scan_keluar || null)
    });
    if (row.id && row.id !== updates.get(targetKey).id) deleteIds.push(row.id);
  }
  return { updates: [...updates.values()], deleteIds: [...new Set(deleteIds)], unresolved };
}

module.exports = { planFingerprintReconciliation };
