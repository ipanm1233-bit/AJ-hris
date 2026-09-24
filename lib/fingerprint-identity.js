'use strict';

function normalized(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function machineNameAgrees(employee, machineName) {
  const machine = normalized(machineName);
  if (!machine) return true; // mesin lama boleh tidak mengirim nama
  const aliases = [employee?.finger_name, employee?.nama_karyawan, employee?.nama]
    .map(normalized).filter(Boolean);
  return aliases.some(alias => machine === alias || (machine.length >= 3 && (
    alias.startsWith(`${machine} `) || machine.startsWith(`${alias} `)
  )));
}

function addUniqueIdentifier(map, identifier, employee) {
  const key = normalized(identifier);
  if (!key) return;
  if (!map.has(key)) map.set(key, employee);
  else if (map.get(key)?._docId !== employee._docId) map.set(key, null);
}

function historicalFingerprintOwnerConflict(rows, deviceUserId, machineName) {
  const fingerId = normalized(deviceUserId);
  if (!fingerId || !normalized(machineName)) return false;
  return (rows || []).some(row => {
    if (![row.fingerprint_user_id, row.fingerprint_no_id].some(value => normalized(value) === fingerId)) return false;
    const nik = normalized(row.nik || row.nik_karyawan);
    if (!nik || nik.startsWith('FINGER-') || row.klasifikasi_scan === 'IDENTITY_PENDING') return false;
    const previousOwner = normalized(row.fingerprint_name || row.nama_finger || row.nama);
    return previousOwner && !machineNameAgrees({ finger_name: previousOwner }, machineName);
  });
}

function eligibleHistoryForFingerprintFallback(row, machineName) {
  const nik = normalized(row?.nik || row?.nik_karyawan);
  if (!nik || nik.startsWith('FINGER-') || row?.klasifikasi_scan === 'IDENTITY_PENDING') return false;
  const ownerName = normalized(row?.nama || row?.nama_karyawan);
  if (!ownerName) return false;
  if (!normalized(machineName)) return row?.auto_assign === true;
  // Baris impor lama boleh menjadi petunjuk hanya jika nama karyawan yang
  // tercatat juga cocok; nama finger di baris itu sendiri bisa sudah usang.
  return machineNameAgrees({ nama: ownerName }, machineName);
}

function resolveFingerprintEmployee({ id, machineName, fingerMap, numericFingerMap, employeeMap, numericEmployeeMap, byName, conflictingIds = new Set() }) {
  const key = normalized(id);
  if (conflictingIds.has(key)) return null;
  const numeric = /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, '') : '';
  const explicit = fingerMap.get(key) || (numeric && numericFingerMap.get(numeric));
  if (explicit) return machineNameAgrees(explicit, machineName) ? explicit : null;
  const generic = employeeMap.get(key) || (numeric && numericEmployeeMap.get(numeric));
  if (generic && machineNameAgrees(generic, machineName)) return generic;
  return machineName ? byName(machineName) : null;
}

module.exports = { machineNameAgrees, addUniqueIdentifier, historicalFingerprintOwnerConflict, eligibleHistoryForFingerprintFallback, resolveFingerprintEmployee };
