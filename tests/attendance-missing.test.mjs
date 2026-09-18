import test from "node:test";
import assert from "node:assert/strict";
import { buildMissingAttendanceToday } from "../js/attendance-missing.mjs";

const employees = [
  { nik: "1", nama_karyawan: "ANI", cabang: "CIREBON", divisi: "SALES", jabatan: "SALES", status_karyawan: "PKWT" },
  { nik: "2", nama_karyawan: "BUDI", cabang: "CIREBON", divisi: "ADMIN", jabatan: "ADMIN", status_karyawan: "PKWTT" },
  { nik: "3", nama_karyawan: "CICI", cabang: "MALANG", divisi: "WAREHOUSE", jabatan: "WAREHOUSE", status_karyawan: "PKWT" },
  { nik: "4", nama_karyawan: "DODI", cabang: "CIREBON", divisi: "SALES", jabatan: "SALES", aktif_tdk_aktif: "RESIGN" },
  { nik: "5", nama_karyawan: "ERNA", cabang: "CIREBON", divisi: "SALES", jabatan: "SHIFT SIANG", status_karyawan: "PKWT" }
];

const schedules = [
  { jabatan: "SALES", hari: "Senin - Jumat", masuk: "08:00", pulang: "17:00" },
  { jabatan: "ADMIN", hari: "Senin - Jumat", masuk: "08:00", pulang: "17:00" },
  { jabatan: "WAREHOUSE", hari: "Senin - Jumat", masuk: "08:00", pulang: "17:00" },
  { jabatan: "SHIFT SIANG", hari: "Senin - Jumat", masuk: "13:00", pulang: "21:00" }
];

test("lists active scheduled employees without a scan and filters by branch", () => {
  const rows = [
    { nik: "2", nama: "BUDI", tanggal: "2026-09-18", scan_masuk: "08:01", scan_keluar: "" },
    { nik: "3", nama: "CICI", tanggal: "2026-09-18", scan_masuk: "", scan_keluar: "" }
  ];
  const result = buildMissingAttendanceToday({ employees, attendanceRows: rows, schedules, date: "2026-09-18", currentTime: "09:00", branch: "CIREBON" });
  assert.deepEqual(result.map(row => row.name), ["ANI"]);
});

test("excludes approved full-day absence, future shifts, and inactive employees", () => {
  const rows = [
    { nik: "1", nama: "ANI", tanggal: "2026-09-18", ketidakhadiran: "CUTI TAHUNAN", status_kind: "absence" }
  ];
  const result = buildMissingAttendanceToday({ employees, attendanceRows: rows, schedules, date: "2026-09-18", currentTime: "09:00", branch: "CIREBON" });
  assert.deepEqual(result.map(row => row.name), ["BUDI"]);
  assert.ok(!result.some(row => ["ANI", "DODI", "ERNA"].includes(row.name)));
});

test("keeps approved partial-day cases with no scan visible for HRD review", () => {
  const rows = [
    { nik: "1", nama: "ANI", tanggal: "2026-09-18", ketidakhadiran: "IZIN DATANG TERLAMBAT", status_kind: "review", perlu_koreksi: true, attendance_status: "IZIN TERLAMBAT — TIDAK ADA SCAN" }
  ];
  const result = buildMissingAttendanceToday({ employees, attendanceRows: rows, schedules, date: "2026-09-18", currentTime: "09:00", branch: "CIREBON", division: "SALES" });
  assert.equal(result.length, 1);
  assert.equal(result[0].needs_review, true);
  assert.match(result[0].status, /TIDAK ADA SCAN/);
});
