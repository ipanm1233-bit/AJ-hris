import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPipRounds, pipRoundLengthDays, roundForDate, pipAverage, nextSpLevel,
  pipProgress, computePipOutcome, extendPipRounds, roundRecommendation, pipStatusLabel, addDays
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
