import test from "node:test";
import assert from "node:assert/strict";
import { buildAttendanceStatusRows } from "../js/attendance-status.mjs";

const employee = { id: "EMP-1", nik: "1022612010", nama_karyawan: "MALA", jabatan: "STAFF" };
const schedules = [{ jabatan: "STAFF", hari: "Senin - Jumat", masuk: "08:00", pulang: "17:00" }];

test("shows a lone 17:03 legacy scan as suspected checkout, not late check-in", () => {
  const [row] = buildAttendanceStatusRows({
    employees: [employee], schedules,
    attendanceRows: [{ id: "a", nik: employee.nik, tanggal: "2026-09-07", scan_masuk: "17:03", jadwal_masuk: "08:00", jadwal_keluar: "17:00" }]
  });
  assert.equal(row.scan_masuk, "");
  assert.equal(row.scan_keluar, "17:03");
  assert.equal(row.status_kind, "review");
  assert.match(row.attendance_status, /diperkirakan scan pulang/i);
});

test("adds an approved leave day even when there is no fingerprint row", () => {
  const rows = buildAttendanceStatusRows({
    employees: [employee], schedules, attendanceRows: [],
    absenceRecords: [{ nik: employee.nik, tanggal: "2026-09-08", type_cuti: "S - Sakit", status: "APPROVED" }]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attendance_status, "S - Sakit");
  assert.equal(rows[0].is_status_only, true);
});

test("highlights an approved absence that also contains a fingerprint scan", () => {
  const [row] = buildAttendanceStatusRows({
    employees: [employee], schedules,
    attendanceRows: [{ id: "a", nik: employee.nik, tanggal: "2026-09-08", scan_masuk: "08:00", scan_keluar: "17:00" }],
    absenceRecords: [{ nik: employee.nik, tanggal: "2026-09-08", jenis_cuti: "CUTI TAHUNAN", status_final: "APPROVED FINAL" }]
  });
  assert.equal(row.status_kind, "review");
  assert.match(row.attendance_status, /ADA SCAN/);
});

test("does not create rows from pending absence requests", () => {
  const rows = buildAttendanceStatusRows({
    employees: [employee], schedules, attendanceRows: [],
    absenceRecords: [{ nik: employee.nik, tanggal_izin: "2026-09-08", kategori: "IZIN", status_final: "MENUNGGU" }]
  });
  assert.equal(rows.length, 0);
});
