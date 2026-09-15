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

test('exports an approved morning half-day leave with a noon effective schedule', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], schedules: schedule,
    attendanceRows: [{ nik: '1001', nama: 'BUDI', tanggal: '2026-09-09', scan_masuk: '12:00', scan_keluar: '17:05', sumber: 'FINGERPRINT' }],
    leaves: [{ nik: '1001', tanggal: '2026-09-09', type_cuti: 'C1/2 - Cuti Setengah Hari', status: 'APPROVED', sesi_cuti: 'Cuti Pagi', jam_keluar: '08:00', jam_kembali: '12:00', count: 0.5 }],
    start: '2026-09-09', end: '2026-09-09'
  });
  assert.equal(rows[0]['Jam Masuk'], '12:00');
  assert.equal(rows[0]['Jam Pulang'], '17:00');
  assert.match(rows[0].Keterangan, /CUTI PAGI.*HADIR SIANG/);
  assert.doesNotMatch(rows[0].Keterangan, /PERLU PEMERIKSAAN/);
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

test('labels an approved izin record from data_pengajuan', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], schedules: schedule, attendanceRows: [],
    leaves: [{ nik_pemohon: '1001', tanggal_izin: '2026-09-08', kategori: 'IZIN', jenis_izin: 'IZIN_KELUAR_KANTOR', status_final: 'APPROVED FINAL' }],
    start: '2026-09-08', end: '2026-09-08'
  });
  assert.equal(rows[0].Keterangan, 'IZIN_KELUAR_KANTOR');
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
