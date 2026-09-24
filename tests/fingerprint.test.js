const test = require('node:test');
const assert = require('node:assert/strict');
const { machineNameAgrees, addUniqueIdentifier, historicalFingerprintOwnerConflict, eligibleHistoryForFingerprintFallback, resolveFingerprintEmployee, resolveFingerprintDeviceEmployee } = require('../lib/fingerprint-identity');
const {
  getDeviceUserId,
  parseFingerprintTimestamp,
  normalizeFingerprintLog,
  aggregateFingerprintLogs,
  computeAttendance
} = require('../lib/fingerprint-normalizer.js');
const fingerprintApiHelpers = require('../api/sync-absen.js')._test;

test('accepts only private IPv4 addresses for LAN fingerprint configuration', () => {
  assert.equal(fingerprintApiHelpers.validPrivateIpv4('192.168.1.201'), true);
  assert.equal(fingerprintApiHelpers.validPrivateIpv4('10.10.0.5'), true);
  assert.equal(fingerprintApiHelpers.validPrivateIpv4('172.20.1.8'), true);
  assert.equal(fingerprintApiHelpers.validPrivateIpv4('8.8.8.8'), false);
  assert.equal(fingerprintApiHelpers.validPrivateIpv4('192.168.1.999'), false);
});

test('creates strong human-readable one-time pairing codes', () => {
  const code = fingerprintApiHelpers.pairingCode();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.notEqual(fingerprintApiHelpers.secretHash(code), code);
});

test('validates bounded manual fingerprint resync ranges', () => {
  assert.equal(fingerprintApiHelpers.validIsoDate('2026-09-17'), true);
  assert.equal(fingerprintApiHelpers.validIsoDate('2026-02-30'), false);
  assert.equal(fingerprintApiHelpers.dateDistanceDays('2026-09-17', '2026-09-18'), 1);
});

test('blocks finger 95 when stale machine name MALATRI disagrees with IRINE history', () => {
  const history = [
    { nik: '1082204940', nama: 'IRINE APRILIA DEWI', fingerprint_name: 'IRINE', fingerprint_user_id: '95' },
    { nik: 'FINGER-CIREBON-95', nama: 'MALATRI (BELUM DIPETAKAN)', fingerprint_name: 'MALATRI', fingerprint_user_id: '95' }
  ];
  assert.equal(historicalFingerprintOwnerConflict(history, '95', 'MALATRI'), true);
  assert.equal(historicalFingerprintOwnerConflict(history.slice(1), '95', 'MALATRI'), false);
  assert.equal(historicalFingerprintOwnerConflict(history, '66', 'ARIP'), false);
});

test('Emp No. 80 is not mistaken for another employee\'s No. ID 80', () => {
  const history = [
    { nik: '1052204600', fingerprint_user_id: '80', fingerprint_no_id: '211', fingerprint_name: 'PHILIP TAMZIR' },
    { nik: '1234567890', fingerprint_user_id: '90', fingerprint_no_id: '80', fingerprint_name: 'KARYAWAN LAIN' }
  ];
  assert.equal(historicalFingerprintOwnerConflict(history, '80', 'PHILIP TAMZIR'), false);
  assert.equal(historicalFingerprintOwnerConflict(history, '80', 'PHILIP TAMZIR', 'fingerprint_no_id'), true);
});

test('machine identity falls back to a unique current finger name when a short generic ID belongs to someone else', () => {
  const angga = { _docId: 'a', nik: '1062489830', nama_karyawan: 'ANGGA ARDIANSAH', finger_name: 'ANGGA' };
  const another = { _docId: 'b', nik: '123', nama_karyawan: 'BUDI' };
  const resolve = overrides => resolveFingerprintEmployee({ id: '81', machineName: 'ANGGA', fingerMap: new Map(), numericFingerMap: new Map(), employeeMap: new Map([['81', another]]), numericEmployeeMap: new Map(), byName: () => angga, ...overrides });
  assert.equal(resolve({}), angga);
  assert.equal(resolve({ fingerMap: new Map([['81', another]]) }), null);
  assert.equal(resolve({ conflictingIds: new Set(['81']) }), null);
});

test('resolves PHILIP using machine No. ID when Emp No. points to a stale employee record', () => {
  const philip = { _docId: 'p', nik: '1052204600', nama_karyawan: 'PHILIP TAMZIR' };
  const stale = { _docId: 's', nik: '1234567890', nama_karyawan: 'KARYAWAN LAIN' };
  const base = { id: '80', noId: '211', machineName: 'PHILIP TAMZIR', fingerMap: new Map([['80', stale], ['211', philip]]), numericFingerMap: new Map(), employeeMap: new Map(), numericEmployeeMap: new Map(), byName: () => philip };
  assert.equal(resolveFingerprintDeviceEmployee(base), philip);
  assert.equal(resolveFingerprintDeviceEmployee({ ...base, conflictingIds: new Set(['80']) }), null);
});

test('recovers uniquely named historical employees when Firestore master is unavailable', () => {
  assert.equal(eligibleHistoryForFingerprintFallback({ nik: '1082204940', nama: 'IRINE APRILIA DEWI', fingerprint_name: 'IRINE', fingerprint_user_id: '95', auto_assign: false }, 'IRINE'), true);
  assert.equal(eligibleHistoryForFingerprintFallback({ nik: '1082204940', nama: 'IRINE APRILIA DEWI', fingerprint_name: 'MALATRI', fingerprint_user_id: '95', auto_assign: false }, 'MALATRI'), false);
  assert.equal(eligibleHistoryForFingerprintFallback({ nik: 'FINGER-CIREBON-95', nama: 'MALATRI', fingerprint_user_id: '95', auto_assign: false }, 'MALATRI'), false);
  assert.equal(eligibleHistoryForFingerprintFallback({ nik: '1082204940', nama: 'IRINE APRILIA DEWI', fingerprint_user_id: '95', auto_assign: false }, ''), false);
});

test('creates stable provisional identities without treating them as employee master', () => {
  assert.equal(fingerprintApiHelpers.provisionalFingerprintNik('Cirebon', ' 11 '), 'FINGER-CIREBON-11');
  assert.equal(fingerprintApiHelpers.isProvisionalFingerprintNik('FINGER-CIREBON-11'), true);
  assert.equal(fingerprintApiHelpers.isProvisionalFingerprintNik('1112307980'), false);
});

test('coalesces multiple machine IDs mapped to one employee-day before Supabase upsert', () => {
  const rows = fingerprintApiHelpers.mergeSyncAttendanceRows([
    { id: 'A', nik: '1112307980', tanggal: '2026-09-21', scan_masuk: '07:45', fingerprint_user_id: '110' },
    { id: 'B', nik: '1112307980', tanggal: '2026-09-21', scan_keluar: '16:03', fingerprint_user_id: '79' }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'A');
  assert.equal(rows[0].scan_masuk, '07:45');
  assert.equal(rows[0].scan_keluar, '16:03');
});

test('keeps device-local timestamps unchanged instead of shifting them by seven hours', () => {
  assert.deepEqual(parseFingerprintTimestamp('2026-09-07 07:55:12'), {
    tanggal: '2026-09-07', jam: '07:55', detik: 12, minutes: 475
  });
  assert.deepEqual(parseFingerprintTimestamp('07/09/2026 17:04:00'), {
    tanggal: '2026-09-07', jam: '17:04', detik: 0, minutes: 1024
  });
});

test('converts timestamps with an explicit UTC offset to office timezone', () => {
  const result = parseFingerprintTimestamp('2026-09-07T00:55:00Z', 'Asia/Jakarta');
  assert.equal(result.tanggal, '2026-09-07');
  assert.equal(result.jam, '07:55');
});

test('accepts common fingerprint field aliases', () => {
  assert.equal(getDeviceUserId({ enrollNumber: '0012' }), '0012');
  assert.deepEqual(normalizeFingerprintLog({
    pin: '0012', checkTime: '2026/09/07 08:01:00', checkType: 'check-in'
  }), {
    deviceUserId: '0012', tanggal: '2026-09-07', jam: '08:01', minutes: 481, direction: 'IN'
  });
});

test('deduplicates identical scans from repeated bridge synchronization', () => {
  const raw = { deviceUserId: '10', recordTime: '2026-09-07 08:00:00' };
  const result = aggregateFingerprintLogs([raw, raw]);
  assert.equal(result.invalid, 0);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].events.length, 1);
});

test('does not interpret two nearby scans as a full workday', () => {
  const attendance = computeAttendance([
    { jam: '08:00', minutes: 480, direction: null },
    { jam: '08:03', minutes: 483, direction: null }
  ], {}, 120);
  assert.equal(attendance.scan_masuk, '08:00');
  assert.equal(attendance.scan_keluar, null);
  assert.equal(attendance.needs_review, true);
});

test('merges later synchronization into the existing morning scan', () => {
  const attendance = computeAttendance([
    { jam: '17:05', minutes: 1025, direction: null }
  ], { scan_masuk: '07:58', scan_keluar: null }, 120);
  assert.equal(attendance.scan_masuk, '07:58');
  assert.equal(attendance.scan_keluar, '17:05');
  assert.equal(attendance.needs_review, false);
});

test('treats a later X150 check-in marker as checkout when the machine keeps sending state zero', () => {
  const attendance = computeAttendance([
    { jam: '17:05', minutes: 1025, direction: 'IN' }
  ], { scan_masuk: '07:58', scan_keluar: null }, 120, { masuk: '08:00', pulang: '17:00' });
  assert.equal(attendance.scan_masuk, '07:58');
  assert.equal(attendance.scan_keluar, '17:05');
  assert.equal(attendance.needs_review, false);
});

test('uses first and last scan when every X150 event has the same check-in marker', () => {
  const attendance = computeAttendance([
    { jam: '07:58', minutes: 478, direction: 'IN' },
    { jam: '12:01', minutes: 721, direction: 'IN' },
    { jam: '17:05', minutes: 1025, direction: 'IN' }
  ], {}, 120, { masuk: '08:00', pulang: '17:00' });
  assert.equal(attendance.scan_masuk, '07:58');
  assert.equal(attendance.scan_keluar, '17:05');
  assert.equal(attendance.needs_review, false);
  assert.equal(attendance.classification, 'SAME_DIRECTION_IN_OUT');
});

test('does not turn nearby repeated check-in scans into a checkout', () => {
  const attendance = computeAttendance([
    { jam: '07:58', minutes: 478, direction: 'IN' },
    { jam: '08:03', minutes: 483, direction: 'IN' }
  ], {}, 120, { masuk: '08:00', pulang: '17:00' });
  assert.equal(attendance.scan_masuk, '07:58');
  assert.equal(attendance.scan_keluar, null);
  assert.equal(attendance.needs_review, true);
});

test('classifies a lone afternoon scan as checkout even if X150 marks it check-in', () => {
  const attendance = computeAttendance([
    { jam: '17:03', minutes: 1023, direction: 'IN' }
  ], {}, 120, { masuk: '08:00', pulang: '17:00' });
  assert.equal(attendance.scan_masuk, null);
  assert.equal(attendance.scan_keluar, '17:03');
  assert.equal(attendance.classification, 'SINGLE_SCAN_OUT');
  assert.equal(attendance.needs_review, true);
});

test('respects explicit check-in and check-out markers', () => {
  const attendance = computeAttendance([
    { jam: '08:02', minutes: 482, direction: 'IN' },
    { jam: '12:00', minutes: 720, direction: 'OUT' },
    { jam: '13:01', minutes: 781, direction: 'IN' },
    { jam: '17:10', minutes: 1030, direction: 'OUT' }
  ]);
  assert.equal(attendance.scan_masuk, '08:02');
  assert.equal(attendance.scan_keluar, '17:10');
  assert.equal(attendance.needs_review, false);
});

test('classifies a lone scan near scheduled checkout as scan pulang', () => {
  const attendance = computeAttendance([
    { jam: '17:03', minutes: 1023, direction: null }
  ], {}, 120, { masuk: '08:00', pulang: '17:00' });
  assert.equal(attendance.scan_masuk, null);
  assert.equal(attendance.scan_keluar, '17:03');
  assert.equal(attendance.classification, 'SINGLE_SCAN_OUT');
  assert.match(attendance.review_reason, /Scan masuk/i);
});

test('repairs an old record that stored the same lone afternoon scan as scan masuk', () => {
  const attendance = computeAttendance([
    { jam: '17:03', minutes: 1023, direction: null }
  ], { scan_masuk: '17:03', scan_keluar: null }, 120, { masuk: '08:00', pulang: '17:00' });
  assert.equal(attendance.scan_masuk, null);
  assert.equal(attendance.scan_keluar, '17:03');
  assert.equal(attendance.needs_review, true);
});

test('rejects invalid calendar dates and incomplete records', () => {
  assert.equal(parseFingerprintTimestamp('2026-02-31 08:00:00'), null);
  assert.equal(normalizeFingerprintLog({ recordTime: '2026-09-07 08:00:00' }), null);
});
test('finger ID for Saputra is not accepted when the machine reports Solehul Hadi', () => {
  const saputra = { _docId: 'SAP', nama_karyawan: 'SAPUTRA HIDAYAT', finger_name: 'SAPUTRA' };
  const solehul = { _docId: 'SOL', nama_karyawan: 'SOLEHUL HADI', finger_name: 'SOLEHUL' };
  assert.equal(machineNameAgrees(saputra, 'SOLEHUL HADI'), false);
  assert.equal(machineNameAgrees(saputra, 'SAPUTRA HIDAYAT'), true);
  const machineIds = new Map();
  addUniqueIdentifier(machineIds, '30', saputra);
  addUniqueIdentifier(machineIds, '30', solehul);
  assert.equal(machineIds.get('30'), null);
});
