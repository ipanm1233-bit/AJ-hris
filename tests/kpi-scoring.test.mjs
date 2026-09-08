import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateKpiByPeriod,
  evaluateKpiGrade,
  getLatestKpiSummary,
  matchesKpiEmployee,
  validateGradeRulesMap
} from "../js/kpi-scoring.mjs";

test("matches KPI records written with nama_dinilai and NIK aliases", () => {
  assert.equal(matchesKpiEmployee({ nama_dinilai: "Ipan Maulana" }, { name: "ipan maulana" }), true);
  assert.equal(matchesKpiEmployee({ nik_dinilai: "123" }, { nik: "123" }), true);
});

test("aggregates multi-rater KPI per relation and period", () => {
  const rows = [
    { nama_dinilai: "A", periode: "Q2", total_skor: 90, nama_penilai: "Boss", tipe_relasi: "Atasan Langsung", tanggal: "2026-07-01" },
    { nama_dinilai: "A", periode: "Q2", total_skor: 80, nama_penilai: "Peer 1", tipe_relasi: "Rekan Sejawat (Peer)", tanggal: "2026-07-02" },
    { nama_dinilai: "A", periode: "Q2", total_skor: 100, nama_penilai: "Peer 2", tipe_relasi: "Rekan Sejawat (Peer)", tanggal: "2026-07-03" },
    { nama_dinilai: "A", periode: "Q1", total_skor: 70, nama_penilai: "Boss", tipe_relasi: "Atasan Langsung", tanggal: "2026-04-01" }
  ];
  const groups = aggregateKpiByPeriod(rows, { name: "A" });
  assert.equal(groups.length, 2);
  assert.equal(groups[0].period, "Q2");
  assert.equal(groups[0].score, 90);
  assert.equal(groups[0].raterCount, 3);
  assert.equal(getLatestKpiSummary(rows, { name: "A" }).score, 90);
});

test("deduplicates repeated evaluator submissions in one period", () => {
  const rows = [
    { nama_dinilai: "A", periode: "Q2", total_skor: 60, nama_penilai: "Boss", tanggal: "2026-07-01" },
    { nama_dinilai: "A", periode: "Q2", total_skor: 90, nama_penilai: "Boss", tanggal: "2026-07-02" }
  ];
  const result = getLatestKpiSummary(rows, { name: "A" });
  assert.equal(result.score, 90);
  assert.equal(result.raterCount, 1);
});

test("decimal score uses the nearest lower grade instead of first recommendation", () => {
  const rules = { KONTRAK: [
    { min: 91, max: 100, predikat: "A", rekomendasi: "Tetap" },
    { min: 81, max: 90, predikat: "B", rekomendasi: "12 Bulan" },
    { min: 70, max: 80, predikat: "C", rekomendasi: "6 Bulan" },
    { min: 0, max: 69, predikat: "D", rekomendasi: "Putus" }
  ] };
  assert.equal(evaluateKpiGrade("KONTRAK", 80.5, rules).rekomendasi, "6 Bulan");
  assert.equal(evaluateKpiGrade("KONTRAK", 90.5, rules).rekomendasi, "12 Bulan");
});

test("rejects overlapping grade rules", () => {
  const error = validateGradeRulesMap({ KPI_360: [
    { min: 0, max: 80, predikat: "C", rekomendasi: "C" },
    { min: 80, max: 100, predikat: "B", rekomendasi: "B" }
  ] });
  assert.match(error, /tumpang tindih/);
});
