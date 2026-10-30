import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPipRounds, pipRoundLengthDays, roundForDate, pipAverage, nextSpLevel,
  pipProgress, computePipOutcome, extendPipRounds, roundRecommendation, pipStatusLabel, addDays,
  pipEvaluationPeriodKey, pipEvaluationPeriodLabel,
  PIP_DEFAULT_INDICATORS, normalizePipIndicators, pipIndicatorScore, pipIndicatorSummary
} from "../js/pip.mjs";

function programWith(roundStatuses, spCount, extra = {}) {
  return {
    tanggal_mulai: "2026-11-01",
    durasi_bulan: 3,
    rounds: roundStatuses.map((status, index) => ({
      index: index + 1, start: "2026-11-01", end: "2026-11-30", status, sp_level: null
    })),
    sp_records: Array.from({ length: spCount }, (_, index) => ({ level: index + 1 })),
    ...extra
  };
}

test("durasi babak proporsional untuk 3, 4, dan 6 bulan", () => {
  assert.equal(pipRoundLengthDays(3), 30);
  assert.equal(pipRoundLengthDays(6), 61);
  assert.ok(pipRoundLengthDays(4) > pipRoundLengthDays(3));
  assert.equal(buildPipRounds("2026-11-01", 3).length, 3);
});

test("babak perpanjangan dimulai setelah babak terakhir", () => {
  const initial = buildPipRounds("2026-11-01", 3);
  const extra = extendPipRounds({ tanggal_mulai: "2026-11-01", durasi_bulan: 3, rounds: initial }, 2);
  assert.equal(extra.length, 2);
  assert.equal(extra[0].index, 4);
  assert.equal(extra[0].start, addDays(initial[initial.length - 1].end, 1));
});

test("rata-rata nilai per babak dan rekomendasi", () => {
  const assessments = [
    { babak: 1, nilai: 60 }, { babak: 1, nilai: 70 }, { babak: 2, nilai: 90 }
  ];
  assert.equal(pipAverage(assessments, 1), 65);
  assert.equal(pipAverage(assessments, 2), 90);
  assert.equal(roundRecommendation(65, 70), "SP");
  assert.equal(roundRecommendation(70, 70), "LOLOS");
});

test("progres dan level SP berikutnya", () => {
  const program = programWith(["LOLOS", "SP", "PENDING"], 1);
  assert.equal(pipProgress(program), 67);
  assert.equal(nextSpLevel(program), 2);
});

test("0 SP -> lulus, 3 SP -> PHK", () => {
  assert.equal(computePipOutcome(programWith(["LOLOS", "LOLOS", "LOLOS"], 0)).action, "LULUS");
  assert.equal(computePipOutcome(programWith(["SP", "SP", "SP"], 3)).action, "PHK");
});

test("1 SP -> perpanjang 2 babak, 2 SP -> perpanjang 1 babak", () => {
  assert.equal(computePipOutcome(programWith(["SP", "LOLOS", "LOLOS"], 1)).extend, 2);
  assert.equal(computePipOutcome(programWith(["SP", "SP", "LOLOS"], 2)).extend, 1);
});

test("setelah perpanjangan selesai tanpa tambahan SP -> lulus", () => {
  const program = programWith(["SP", "LOLOS", "LOLOS", "LOLOS", "LOLOS"], 1, { extension_given: true });
  assert.equal(computePipOutcome(program).action, "LULUS");
});

test("babak belum selesai -> pending", () => {
  const result = computePipOutcome(programWith(["LOLOS", "PENDING", "PENDING"], 0));
  assert.equal(result.action, "PENDING");
});

test("label status PIP", () => {
  assert.equal(pipStatusLabel("AKTIF"), "PIP Berjalan");
  assert.equal(pipStatusLabel("SELESAI_LULUS"), "Lulus PIP");
});

test("key periode evaluasi harian/mingguan/bulanan", () => {
  assert.equal(pipEvaluationPeriodKey("HARIAN", "2026-11-05"), "2026-11-05");
  assert.equal(pipEvaluationPeriodKey("MINGGUAN", "2026-11-05"), "2026-11-02");
  assert.equal(pipEvaluationPeriodKey("BULANAN", "2026-11-05"), "2026-11");
  assert.match(pipEvaluationPeriodLabel("MINGGUAN", "2026-11-05"), /Mingguan/);
});

test("indikator PIP dinormalisasi ke total bobot 100%", () => {
  const normalized = normalizePipIndicators([
    { nama: "Kinerja", bobot: 2 },
    { nama: "Disiplin", bobot: 1 },
    { nama: "  ", bobot: 5 }
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].bobot, 66.67);
  assert.equal(normalized[1].bobot, 33.33);
  const even = normalizePipIndicators([{ nama: "A" }, { nama: "B" }, { nama: "C" }]);
  assert.equal(even.reduce((sum, item) => sum + item.bobot, 0), 100);
});

test("nilai akhir dihitung terbobot dari indikator", () => {
  assert.equal(PIP_DEFAULT_INDICATORS.reduce((sum, item) => sum + item.bobot, 0), 100);
  const score = pipIndicatorScore([
    { nama: "Kinerja", bobot: 60, nilai: 80 },
    { nama: "Disiplin", bobot: 40, nilai: 60 }
  ]);
  assert.equal(score, 72);
  assert.equal(pipIndicatorScore([], 66), 66);
  assert.equal(pipIndicatorScore([{ nama: "Kinerja", bobot: 50, nilai: "" }], null), null);
});

test("rekap rata-rata per indikator dari para evaluator", () => {
  const summary = pipIndicatorSummary([
    { indikator: [{ nama: "Kinerja", bobot: 60, nilai: 80 }, { nama: "Disiplin", bobot: 40, nilai: 60 }] },
    { indikator: [{ nama: "Kinerja", bobot: 60, nilai: 70 }, { nama: "Disiplin", bobot: 40, nilai: 90 }] }
  ]);
  const kinerja = summary.find(item => item.nama === "Kinerja");
  assert.equal(kinerja.count, 2);
  assert.equal(kinerja.average, 75);
});

test("firestore.rules mengizinkan pengelolaan koleksi pip_programs", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const blocks = rules.split("match /{collectionName}/{id}").slice(1);
  const grants = blocks.filter(block => block.includes("'pip_programs'"));
  assert.equal(grants.length, 1);
  // read, create/update, dan delete masing-masing punya daftar koleksi sendiri.
  assert.match(grants[0], /allow read: if collectionName in \[[\s\S]*'pip_programs'/);
  assert.match(grants[0], /allow create, update: if collectionName in \[[\s\S]*'pip_programs'/);
  assert.match(grants[0], /allow delete: if collectionName in \[[\s\S]*'pip_programs'/);
});

test("gagal simpan PIP memberi pesan actionable saat rules menolak", () => {
  const source = readFileSync(new URL("../js/views/penilaian-kontrak.js", import.meta.url), "utf8");
  assert.match(source, /function pipWriteErrorMessage\(error, aksi\)/);
  assert.match(source, /firebase deploy --only firestore:rules/);
  assert.match(source, /toast\(pipWriteErrorMessage\(error, "Gagal membuat PIP"\), "error"\)/);
  assert.match(source, /toast\(pipWriteErrorMessage\(error, "Gagal menyimpan penilaian"\), "error"\)/);
});
