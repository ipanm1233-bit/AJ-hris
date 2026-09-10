const test = require('node:test');
const assert = require('node:assert/strict');
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
