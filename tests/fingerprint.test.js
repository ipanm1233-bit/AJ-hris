const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getDeviceUserId,
  parseFingerprintTimestamp,
  normalizeFingerprintLog,
  aggregateFingerprintLogs,
  computeAttendance
} = require('../lib/fingerprint-normalizer.js');

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
  assert.deepEqual(attendance, { scan_masuk: '08:00', scan_keluar: null });
});

test('merges later synchronization into the existing morning scan', () => {
  const attendance = computeAttendance([
    { jam: '17:05', minutes: 1025, direction: null }
  ], { scan_masuk: '07:58', scan_keluar: null }, 120);
  assert.deepEqual(attendance, { scan_masuk: '07:58', scan_keluar: '17:05' });
});

test('respects explicit check-in and check-out markers', () => {
  const attendance = computeAttendance([
    { jam: '08:02', minutes: 482, direction: 'IN' },
    { jam: '12:00', minutes: 720, direction: 'OUT' },
    { jam: '13:01', minutes: 781, direction: 'IN' },
    { jam: '17:10', minutes: 1030, direction: 'OUT' }
  ]);
  assert.deepEqual(attendance, { scan_masuk: '08:02', scan_keluar: '17:10' });
});

test('rejects invalid calendar dates and incomplete records', () => {
  assert.equal(parseFingerprintTimestamp('2026-02-31 08:00:00'), null);
  assert.equal(normalizeFingerprintLog({ recordTime: '2026-09-07 08:00:00' }), null);
});
