import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateKpiByPeriod,
  assessKpiDecisionReadiness,
  evaluateKpiGrade,
  getLatestKpiSummary,
  kpiDetailRows,
  KPI_RELATION_LABELS,
  matchesKpiEmployee,
  validateGradeRulesMap
} from "../js/kpi-scoring.mjs";

test("matches KPI records written with nama_dinilai and NIK aliases", () => {
  assert.equal(matchesKpiEmployee({ nama_dinilai: "Ipan Maulana" }, { name: "ipan maulana" }), true);
  assert.equal(matchesKpiEmployee({ nik_dinilai: "123" }, { nik: "123" }), true);
});

test("does not match employees with the same name when both NIK values exist", () => {
  assert.equal(matchesKpiEmployee(
    { nama_dinilai: "Angga", nik_dinilai: "M001" },
    { name: "Angga", nik: "C001" }
  ), false);
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

test("normalizes period labels and aggregates indicator scores across evaluators", () => {
  const rows = [
    { nik_dinilai: "1", periode: "q2   2026", total_skor: 80, nik_penilai: "A", tipe_relasi: "atasan", detail_json: [{ aspek: "Target", indikator: "Omzet", bobot: 100, nilai_diberikan: 80 }] },
    { nik_dinilai: "1", periode: "Q2 2026", total_skor: 100, nik_penilai: "P", tipe_relasi: "peer", detail_json: [{ aspek: "Target", indikator: "Omzet", bobot: 100, nilai_diberikan: 100 }] }
  ];
  const result = aggregateKpiByPeriod(rows, { nik: "1" });
  assert.equal(result.length, 1);
  assert.equal(result[0].period, "Q2 2026");
  assert.equal(result[0].indicatorScores[0].nilai_diberikan, 86.67);
});

test("shows per-indicator scores for every rater and relation group", () => {
  const rows = [
    {
      nik_dinilai: "1", periode: "Q2 2026", total_skor: 90, nama_penilai: "Boss", tipe_relasi: "Atasan Langsung",
      detail_json: [
        { aspek: "Target", indikator: "Omzet", bobot: 60, nilai_diberikan: 95 },
        { aspek: "Perilaku", indikator: "Disiplin", bobot: 40, nilai_diberikan: 82.5 }
      ]
    },
    {
      nik_dinilai: "1", periode: "Q2 2026", total_skor: 70, nama_penilai: "Rekan A", tipe_relasi: "Rekan Sejawat (Peer)",
      detail_json: [
        { aspek: "Target", indikator: "Omzet", bobot: 60, nilai_diberikan: 60 },
        { aspek: "Perilaku", indikator: "Disiplin", bobot: 40, nilai_diberikan: 85 }
      ]
    }
  ];
  const summary = getLatestKpiSummary(rows, { nik: "1" });
  assert.equal(summary.raterDetails.length, 2);
  assert.equal(summary.raterDetails[0].relation, "ATASAN");
  assert.equal(summary.raterDetails[0].relationLabel, KPI_RELATION_LABELS.ATASAN);
  assert.equal(summary.raterDetails[0].indicators.length, 2);
  assert.equal(summary.raterDetails[0].indicators[0].nilai_diberikan, 95);
  assert.equal(summary.raterDetails[1].relation, "PEER");
  assert.equal(summary.relationIndicatorScores.ATASAN.find(row => row.indikator === "Omzet").nilai_diberikan, 95);
  assert.equal(summary.relationIndicatorScores.PEER.find(row => row.indikator === "Disiplin").nilai_diberikan, 85);
  // (95 * 50 + 60 * 25) / 75 = 83.33
  assert.equal(summary.indicatorScores.find(row => row.indikator === "Omzet").nilai_diberikan, 83.33);
});

test("kpiDetailRows accepts legacy soal_json and ignores empty scores", () => {
  const rows = kpiDetailRows({
    soal_json: [
      { aspek: "Kompetensi", indikator: "Komunikasi", bobot: 50, nilai_diberikan: 77 },
      { aspek: "Kompetensi", indikator: "Kerja sama", bobot: 50 }
    ]
  });
  assert.equal(rows[0].nilai_diberikan, 77);
  assert.equal(rows[1].nilai_diberikan, null);
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

test("contract decision labels single-rater KPI with no indicator evidence as provisional", () => {
  const summary = getLatestKpiSummary([{
    nik_dinilai: '123', periode: 'Q3 2026', total_skor: 97,
    nama_penilai: 'Boss', tipe_relasi: 'Atasan'
  }], { nik: '123' });
  const readiness = assessKpiDecisionReadiness(summary, 0);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.gaps.some(gap => /penilai/.test(gap)));
  assert.ok(readiness.gaps.some(gap => /indikator/.test(gap)));
  assert.equal(assessKpiDecisionReadiness(null, 3).ready, false);
});
