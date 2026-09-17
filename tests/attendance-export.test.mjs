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
  assert.equal(rows[0]['Keterangan Izin/Cuti'], 'S - Sakit dengan Surat Dokter');
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Tidak');
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
  assert.match(rows[0]['Keterangan Izin/Cuti'], /CUTI PAGI.*HADIR SIANG/);
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Tidak');
});

test('marks an unexplained no-scan workday for manual review', () => {
  const rows = buildRawAttendanceExport({ employees: [employee], schedules: schedule, start: '2026-09-08', end: '2026-09-08' });
  assert.equal(rows[0]['Keterangan Izin/Cuti'], '');
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Ya');
  assert.equal(rows[0]['Jam Masuk'], '08:00');
  assert.equal(rows[0]['Jam Pulang'], '17:00');
});

test('does not treat pending leave as an approved absence', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], schedules: schedule,
    leaves: [{ nik: '1001', tanggal: '2026-09-08', type_cuti: 'C - Cuti Tahunan', status: 'PENDING' }],
    start: '2026-09-08', end: '2026-09-08'
  });
  assert.equal(rows[0]['Keterangan Izin/Cuti'], '');
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Ya');
});

test('labels an approved izin record from data_pengajuan', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], schedules: schedule, attendanceRows: [],
    leaves: [{ nik_pemohon: '1001', tanggal_izin: '2026-09-08', kategori: 'IZIN', jenis_izin: 'IZIN_KELUAR_KANTOR', status_final: 'APPROVED FINAL' }],
    start: '2026-09-08', end: '2026-09-08'
  });
  assert.equal(rows[0]['Keterangan Izin/Cuti'], 'IZIN_KELUAR_KANTOR');
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Ya');
});

test('approved late-arrival izin uses the permitted time and complete scans need no correction', () => {
  const rows = buildRawAttendanceExport({
    employees: [employee], schedules: schedule,
    attendanceRows: [{ nik: '1001', nama: 'BUDI', tanggal: '2026-09-16', scan_masuk: '09:00', scan_keluar: '17:01', sumber: 'FINGERPRINT' }],
    leaves: [{ nik_pemohon: '1001', tanggal_izin: '2026-09-16', kategori: 'IZIN', jenis_izin: 'IZIN_TERLAMBAT', jam_izin: 'Estimasi Tiba: 09:00 WIB (Jam Masuk: 08:00)', status_final: 'APPROVED FINAL' }],
    start: '2026-09-16', end: '2026-09-16'
  });
  assert.equal(rows[0]['Jam Masuk'], '09:00');
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Tidak');
  assert.equal(rows[0]['Keterangan Izin/Cuti'], 'IZIN_TERLAMBAT');
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
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Tidak');
});

test('travel absence does not invent daily finger scans', () => {
  const rows = buildRawAttendanceExport({
    employees: [{ ...employee, nama_karyawan: 'ANGGA', finger_name: 'ANGGA' }],
    leaves: [{ nik: '1001', jenis_izin: 'DINAS LUAR KOTA', tanggal_berangkat: '2026-09-07', tanggal_kembali: '2026-09-12', status_final: 'APPROVED' }],
    attendanceRows: [
      { nik: '1001', nama: 'ANGGA', fingerprint_name: 'ANGGA', sumber: 'FINGERPRINT', tanggal: '2026-09-07', scan_masuk: '07:53' },
      { nik: '1001', nama: 'ANGGA', fingerprint_name: 'ANGGA', sumber: 'FINGERPRINT', tanggal: '2026-09-12', scan_keluar: '16:05' }
    ], start: '2026-09-07', end: '2026-09-12'
  });
  assert.equal(rows.length, 6);
  assert.equal(rows[0]['Scan Masuk'], '07:53');
  assert.equal(rows[5]['Scan Pulang'], '16:05');
  for (const day of rows.slice(1, -1)) {
    assert.equal(day['Scan Masuk'], '');
    assert.equal(day['Scan Pulang'], '');
    assert.equal(day['Keterangan Izin/Cuti'], 'DINAS LUAR KOTA');
  }
});

test('flags finger name belonging to someone else and never merges competing machine users', () => {
  const rows = buildRawAttendanceExport({
    employees: [{ ...employee, nama_karyawan: 'SAPUTRA HIDAYAT', finger_name: 'SAPUTRA HIDAYAT' }],
    attendanceRows: [
      { nik: '1001', nama: 'SAPUTRA HIDAYAT', fingerprint_name: 'SAPUTRA HIDAYAT', fingerprint_user_id: '30', sumber: 'FINGERPRINT', tanggal: '2026-09-08', scan_masuk: '07:56' },
      { nik: '1001', nama: 'SAPUTRA HIDAYAT', fingerprint_name: 'SOLEHUL HADI', fingerprint_user_id: '45', sumber: 'FINGERPRINT', tanggal: '2026-09-08', scan_keluar: '17:02' }
    ], start: '2026-09-08', end: '2026-09-08'
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row['Perlu Koreksi HRD'] === 'Ya'));
  assert.ok(rows.every(row => !row['Scan Masuk'] || !row['Scan Pulang']));
});

test('suspect legacy import that used scheduled start as a scan', () => {
  const rows = buildRawAttendanceExport({ employees: [employee], schedules: schedule,
    attendanceRows: [{ nik: '1001', nama: 'BUDI', sumber: 'IMPORT_EXCEL', tanggal: '2026-09-08', jadwal_masuk: '08:00', scan_masuk: '08:00' }],
    start: '2026-09-08', end: '2026-09-08' });
  assert.equal(rows[0]['Perlu Koreksi HRD'], 'Ya');
  assert.match(rows[0]['Alasan Koreksi'], /log mesin/);
});
