import test from "node:test";
import assert from "node:assert/strict";
import { buildAttendanceAnalytics } from "../js/attendance-analytics.mjs";

const rows = [
  { nik: "1", nama: "ANI", tanggal: "2026-09-01", cabang: "CIREBON", divisi: "SALES", scan_masuk: "08:00", scan_keluar: "17:00", late_minutes: 0, late_penalty: 0 },
  { nik: "1", nama: "ANI", tanggal: "2026-09-02", cabang: "CIREBON", divisi: "SALES", scan_masuk: "08:07", scan_keluar: "17:00", late_minutes: 7, late_penalty: 7000 },
  { nik: "2", nama: "BUDI", tanggal: "2026-09-02", cabang: "MALANG", divisi: "WAREHOUSE", ketidakhadiran: "S - Sakit", _archive_source: true },
  { nik: "2", nama: "BUDI", tanggal: "2026-09-03", cabang: "MALANG", divisi: "WAREHOUSE", scan_masuk: "08:40", scan_keluar: "17:00", late_minutes: 40, late_penalty: 0, late_penalty_waived: true, _archive_source: true },
  { nik: "1", nama: "ANI", tanggal: "2026-08-31", cabang: "CIREBON", divisi: "SALES", scan_masuk: "08:10", scan_keluar: "17:00", late_minutes: 10, late_penalty: 10000 }
];

test("summarizes one selected month and combines live with spreadsheet records", () => {
  const result = buildAttendanceAnalytics(rows, { month: "2026-09" });
  assert.equal(result.totals.employees, 2);
  assert.equal(result.totals.employee_days, 4);
  assert.equal(result.totals.complete_days, 3);
  assert.equal(result.totals.late_days, 2);
  assert.equal(result.totals.total_penalty, 7000);
  assert.equal(result.totals.waived_days, 1);
  assert.equal(result.totals.spreadsheet_rows, 2);
  assert.equal(result.daily.length, 3);
  assert.equal(result.top_late[0].name, "BUDI");
});

test("filters analytics by branch and division without double-counting duplicate employee days", () => {
  const duplicate = { ...rows[1], id: "duplicate", scan_keluar: "" };
  const result = buildAttendanceAnalytics([...rows, duplicate], { month: "2026-09", branch: "CIREBON", division: "SALES" });
  assert.equal(result.totals.employees, 1);
  assert.equal(result.totals.employee_days, 2);
  assert.equal(result.totals.complete_days, 2);
  assert.equal(result.divisions.length, 1);
  assert.equal(result.divisions[0].division, "SALES");
});
