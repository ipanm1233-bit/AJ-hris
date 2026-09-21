import test from "node:test";
import assert from "node:assert/strict";
import { buildPerformanceMonitorRows, disciplineScore, isAlphaRecord, normalizeEmploymentStatus } from "../js/performance-monitor.mjs";

test("normalizes all employment groups used by performance monitoring", () => {
  assert.equal(normalizeEmploymentStatus("PKWTT"), "TETAP");
  assert.equal(normalizeEmploymentStatus("PKWT"), "KONTRAK");
  assert.equal(normalizeEmploymentStatus("Masa Percobaan"), "PROBATION");
  assert.equal(normalizeEmploymentStatus("Internship"), "MAGANG");
  assert.equal(normalizeEmploymentStatus("Freelance"), "LAINNYA");
});

test("alpha affects discipline without consuming leave quota", () => {
  assert.equal(isAlphaRecord({ type_cuti: "A - Alfa" }), true);
  assert.equal(disciplineScore({ alphaDays: 1, lateIncidents: 2 }), 86);
  const [row] = buildPerformanceMonitorRows({
    period: "2026-09",
    employees: [{ nik_karyawan: "01", nama_karyawan: "Ani", status_karyawan: "PKWT" }],
    leaveRecords: [{ nik: "01", tanggal: "2026-09-10", type_cuti: "A - Alfa", count: 0, alpha_days: 1, status: "APPROVED" }],
    kpiLogs: [{ nik_dinilai: "01", tanggal: "2026-09-15", total_skor: 80 }],
    dailyLogs: [{ nik_karyawan: "01", tanggal: "2026-09-12", total_skor: 90, indikator_skor: { sop_tugas: 85, respon_divisi: 90, inisiatif_team: 80 } }],
    attendanceRecords: [{ nik: "01", tanggal: "2026-09-12", terlambat_menit: 7 }]
  });
  assert.equal(row.alphaDays, 1);
  assert.equal(row.disciplineScore, 88);
  assert.equal(row.lateIncidents, 1);
  assert.equal(row.status, "KONTRAK");
  assert.equal(row.performanceScore, 80);
  assert.ok(row.overallScore > 0);
});
