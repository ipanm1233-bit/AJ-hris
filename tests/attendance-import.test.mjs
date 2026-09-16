import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceImportValues, attendanceImportScan } from '../js/attendance-import.mjs';

test('raw export scheduled hours and device ID cannot masquerade as real scan, NIK or name', () => {
  const parsed = attendanceImportValues({
    'Emp No.': '4', 'No. ID': '12', NIK: '1062489830', 'Nama Finger': 'ANGGA',
    'Nama Karyawan': 'ANGGA ARDIANSAH', Tanggal: '2026-09-09',
    'Jam Masuk': '08:00', 'Jam Pulang': '17:00', 'Scan Masuk': '', 'Scan Pulang': ''
  });
  assert.equal(parsed.nik, '1062489830');
  assert.equal(parsed.nama, 'ANGGA ARDIANSAH');
  assert.equal(parsed.fingerName, 'ANGGA');
  assert.equal(parsed.jadwalMasuk, '08:00');
  assert.equal(parsed.scanMasuk, null);
  assert.equal(parsed.scanPulang, null);
});

test('missing or malformed imported scan is not stored as a fingerprint event', () => {
  assert.equal(attendanceImportScan('-'), null);
  assert.equal(attendanceImportScan('08:00'), '08:00');
  assert.equal(attendanceImportScan('17.05'), '17:05');
  assert.equal(attendanceImportScan('28:77'), null);
});
