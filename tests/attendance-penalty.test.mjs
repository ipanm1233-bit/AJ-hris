import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceDeductionSource,
  calculateAttendancePenalty
} from "../js/attendance-penalty.mjs";

test("charges Rp5.000 for lateness from minute one through five", () => {
  assert.equal(calculateAttendancePenalty({ jadwal_masuk: "08:00", scan_masuk: "08:01" }).late_penalty, 5000);
  assert.equal(calculateAttendancePenalty({ jadwal_masuk: "08:00", scan_masuk: "08:05" }).late_penalty, 5000);
});

test("adds Rp1.000 per minute from minute six through twenty five", () => {
  assert.equal(calculateAttendancePenalty({ jadwal_masuk: "08:00", scan_masuk: "08:06" }).late_penalty, 6000);
  assert.equal(calculateAttendancePenalty({ jadwal_masuk: "08:00", scan_masuk: "08:25" }).late_penalty, 25000);
});

test("converts lateness above twenty five minutes into half-day leave", () => {
  const result = calculateAttendancePenalty({ jadwal_masuk: "08:00", scan_masuk: "08:26" });
  assert.equal(result.late_minutes, 26);
  assert.equal(result.late_penalty, 0);
  assert.equal(result.half_day_leave, true);
  assert.equal(result.deduction_source, "Jatah cuti tahunan 0,5 hari");
});

test("HRD can waive both a monetary penalty and a half-day consequence", () => {
  const monetary = calculateAttendancePenalty({
    jadwal_masuk: "08:00", scan_masuk: "08:10",
    late_penalty_waived: true, late_penalty_note: "Gangguan mesin"
  });
  assert.equal(monetary.late_minutes, 10);
  assert.equal(monetary.late_penalty, 0);
  assert.equal(monetary.late_consequence, "Dibebaskan HRD");
  assert.equal(monetary.late_penalty_note, "Gangguan mesin");

  const halfDay = calculateAttendancePenalty({
    jadwal_masuk: "08:00", scan_masuk: "08:45", late_penalty_waived: true
  });
  assert.equal(halfDay.half_day_leave, false);
  assert.equal(halfDay.late_penalty, 0);
});

test("maps deduction sources by branch and employee group", () => {
  assert.equal(attendanceDeductionSource({ cabang: "Cirebon", divisi: "Sales" }), "BBM mingguan");
  assert.equal(attendanceDeductionSource({ cabang: "Malang", jabatan: "Sales Representative" }), "Insentif bulanan");
  assert.equal(attendanceDeductionSource({ cabang: "Malang", divisi: "Warehouse" }), "Uang bongkaran (3 bulanan)");
  assert.equal(attendanceDeductionSource({ cabang: "Malang", jabatan: "Staff Admin" }), "Lembur; jika tidak ada lembur, bayar cash ke kasir");
  assert.equal(attendanceDeductionSource({ cabang: "Cirebon", divisi: "Logistik & Gudang" }), "Lembur; jika tidak ada lembur, bayar cash ke kasir");
});
