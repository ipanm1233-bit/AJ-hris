import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceImportDate, attendanceImportValues, attendanceImportScan } from '../js/attendance-import.mjs';

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
  assert.equal(attendanceImportScan('9:23:16 C 1/2'), '09:23');
  assert.equal(attendanceImportScan('16:29 ON;INE'), '16:29');
  assert.equal(attendanceImportScan('ONLINE 16:14'), '16:14');
  assert.equal(attendanceImportScan('CUTI'), null);
  assert.equal(attendanceImportScan('28:77'), null);
});

test('Malang recap separates work schedule columns from actual scan columns', () => {
  const parsed = attendanceImportValues({
    'NIK Karyawan': '2062209990',
    'Nama Karyawan': 'AGNES MONICA SAMARCA',
    Tanggal: '1-Aug-26',
    'Jam Kerja Masuk': '08:00',
    'Jam Kerja Keluar': '12:00',
    'Jam Masuk': '07:58',
    'Jam Keluar': '12:03'
  });
  assert.equal(parsed.jadwalMasuk, '08:00');
  assert.equal(parsed.jadwalPulang, '12:00');
  assert.equal(attendanceImportScan(parsed.scanMasuk), '07:58');
  assert.equal(attendanceImportScan(parsed.scanPulang), '12:03');
});

test('Malang Excel display dates normalize deterministically', () => {
  assert.equal(attendanceImportDate('1-Aug-26'), '2026-08-01');
  assert.equal(attendanceImportDate('18/09/2026'), '2026-09-18');
  assert.equal(attendanceImportDate('2026-09-18'), '2026-09-18');
  assert.equal(attendanceImportDate('31-Feb-26'), null);
});
