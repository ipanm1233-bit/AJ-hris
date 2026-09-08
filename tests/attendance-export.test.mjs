import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRawAttendanceExport } from '../js/attendance-export.mjs';

const employee = { nik: '1001', nama_karyawan: 'BUDI', cabang: 'CIREBON', divisi: 'SALES', jabatan: 'SALES', finger_name: 'BUDI F' };
const schedule = [{ jabatan: 'SALES', hari: 'Senin - Jumat', masuk: '08:00', pulang: '17:00' }];

test('keeps a no-scan employee row and labels approved sick leave', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], attendanceRows: [], schedules: schedule,
    leaves: [{ nik: '1001', tanggal: '2026-09-08', type_cuti: 'S - Sakit dengan Surat Dokter', status: 'APPROVED' }],
    start: '2026-09-08', end: '2026-09-08', branch: 'CIREBON', division: 'SALES'
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Nama Karyawan'], 'BUDI');
  assert.equal(rows[0]['Scan Masuk'], '');
  assert.equal(rows[0].Keterangan, 'S - Sakit dengan Surat Dokter');
});

test('marks an unexplained no-scan workday for manual review', () => {
  const rows = buildRawAttendanceExport({ employees: [employee], schedules: schedule, start: '2026-09-08', end: '2026-09-08' });
  assert.equal(rows[0].Keterangan, 'TIDAK ADA SCAN - PERLU PEMERIKSAAN MANUAL');
  assert.equal(rows[0]['Jam Masuk'], '08:00');
  assert.equal(rows[0]['Jam Pulang'], '17:00');
});

test('does not treat pending leave as an approved absence', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], schedules: schedule,
    leaves: [{ nik: '1001', tanggal: '2026-09-08', type_cuti: 'C - Cuti Tahunan', status: 'PENDING' }],
    start: '2026-09-08', end: '2026-09-08'
  });
  assert.match(rows[0].Keterangan, /PERLU PEMERIKSAAN MANUAL/);
});

test('merges duplicate source rows into one employee-day', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], schedules: schedule,
    attendanceRows: [
      { id: 'a', nik: '1001', nama: 'BUDI', tanggal: '2026-09-08', scan_masuk: '08:02', sumber: 'FINGERPRINT' },
      { id: 'b', nik: '1001', nama: 'BUDI', tanggal: '2026-09-08', scan_masuk: '07:58', scan_keluar: '17:01', sumber: 'FINGERPRINT' }
    ],
    start: '2026-09-08', end: '2026-09-08'
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Scan Masuk'], '07:58');
  assert.equal(rows[0]['Scan Pulang'], '17:01');
  assert.equal(rows[0].Keterangan, 'HADIR');
});
