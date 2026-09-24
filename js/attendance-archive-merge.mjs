const key = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const owner = row => key(row.fingerprint_name || row.nama_finger || row.nama)
  .replace(/\s*\(BELUM DIPETAKAN\)$/, '');
const pending = row => key(row.nik).startsWith('FINGER-') || key(row.klasifikasi_scan) === 'IDENTITY_PENDING';

export function mergeAttendanceArchive(live, archive) {
  const result = [...live];
  for (const row of archive) {
    if (result.some(item => row.id && item.id && String(row.id) === String(item.id))) continue;
    const account = item => item.tanggal === row.tanggal && key(item.cabang) === key(row.cabang) &&
      ((key(row.fingerprint_user_id || row.emp_no) && key(row.fingerprint_user_id || row.emp_no) === key(item.fingerprint_user_id || item.emp_no)) ||
       (key(row.fingerprint_no_id || row.no_id) && key(row.fingerprint_no_id || row.no_id) === key(item.fingerprint_no_id || item.no_id)));
    const matching = result.filter(item => !pending(item) && account(item) && owner(row) && owner(row) === owner(item));
    if (pending(row) && matching.length && new Set(matching.map(item => key(item.nik))).size === 1) continue;
    if (result.some(item => !pending(row) && !pending(item) && key(item.nik) === key(row.nik) && item.tanggal === row.tanggal)) continue;
    result.push(row);
  }
  return result;
}
