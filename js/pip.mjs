/**
 * =====================================================================
 * PIP.MJS — Logika Program PIP (Performance Improvement Program)
 * =====================================================================
 * Aturan:
 * - 3 babak dalam periode awal (3/4/6 bulan, durasi babak proporsional).
 * - Setiap babak tanpa perbaikan -> SP berjenjang (SP1, SP2, SP3).
 * - Selesai periode awal:
 *   0 SP  -> LULUS
 *   1 SP  -> diperpanjang 2 babak
 *   2 SP  -> diperpanjang 1 babak
 *   3 SP  -> PHK
 * - Setelah babak perpanjangan selesai tanpa SP baru -> LULUS.
 */

export const PIP_DURATIONS = Object.freeze([3, 4, 6]);

export const PIP_ASSESSMENT_PERIODS = Object.freeze([
  { value: "HARIAN", label: "Harian" },
  { value: "MINGGUAN", label: "Mingguan" },
  { value: "BULANAN", label: "Bulanan" }
]);

export const PIP_STATUS_LABELS = Object.freeze({
  AKTIF: "PIP Berjalan",
  SELESAI_LULUS: "Lulus PIP",
  SELESAI_PHK: "Gagal PIP / PHK",
  DIBATALKAN: "Dibatalkan"
});

export const PIP_DEFAULT_STANDARD = 70;
export const PIP_ROUNDS = 3;

function parseIsoDate(value) {
  const text = String(value || "").slice(0, 10);
  const parts = text.split("-").map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part) || part <= 0)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function toIsoDate(value) {
  const date = value instanceof Date ? value : parseIsoDate(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(value, days) {
  const date = parseIsoDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return toIsoDate(date);
}

/** Panjang satu babak (hari) dari durasi bulan, dibagi 3 babak proporsional. */
export function pipRoundLengthDays(durationMonths) {
  const months = PIP_DURATIONS.includes(Number(durationMonths)) ? Number(durationMonths) : 3;
  return Math.max(7, Math.round((months * 30.4375) / PIP_ROUNDS));
}

/**
 * Buat daftar babak. `startAfter` dipakai untuk babak perpanjangan
 * (mulai sehari setelah babak terakhir).
 */
export function buildPipRounds(startDate, durationMonths, count = PIP_ROUNDS, startAfter = "") {
  const roundDays = pipRoundLengthDays(durationMonths);
  let cursor = startAfter ? addDays(startAfter, 1) : toIsoDate(startDate);
  if (!cursor) return [];
  const total = Math.max(1, Number(count) || PIP_ROUNDS);
  return Array.from({ length: total }, (_, index) => {
    const start = cursor;
    const end = addDays(start, roundDays - 1);
    cursor = addDays(end, 1);
    return {
      index: index + 1,
      start,
      end,
      status: "PENDING",
      sp_level: null,
      evaluated_at: ""
    };
  });
}

export function roundForDate(rounds = [], date) {
  const target = String(date || "").slice(0, 10);
  const list = Array.isArray(rounds) ? rounds : [];
  return list.find(round => target >= round.start && target <= round.end)
    || list.find(round => round.status === "PENDING")
    || list[list.length - 1]
    || null;
}

export function pipAverage(assessments = [], roundIndex = null) {
  const rows = (Array.isArray(assessments) ? assessments : []).filter(row => {
    if (roundIndex === null || roundIndex === undefined) return true;
    return Number(row.babak) === Number(roundIndex);
  });
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + (Number(row.nilai) || 0), 0);
  return Math.round((total / rows.length) * 100) / 100;
}

export function nextSpLevel(program = {}) {
  const count = Array.isArray(program.sp_records) ? program.sp_records.length : 0;
  return Math.min(3, count + 1);
}

export function pipProgress(program = {}) {
  const rounds = Array.isArray(program.rounds) ? program.rounds : [];
  if (!rounds.length) return 0;
  const done = rounds.filter(round => round.status && round.status !== "PENDING").length;
  return Math.round((done / rounds.length) * 100);
}

/**
 * Hitung hasil PIP setelah SEMUA babak dievaluasi.
 * Return: { action: "PENDING"|"LULUS"|"PHK"|"EXTEND", extend?, status? }
 */
export function computePipOutcome(program = {}) {
  const rounds = Array.isArray(program.rounds) ? program.rounds : [];
  if (!rounds.length) return { action: "PENDING", reason: "Belum ada babak PIP." };
  const pending = rounds.filter(round => !round.status || round.status === "PENDING");
  if (pending.length) {
    return { action: "PENDING", reason: `${pending.length} babak belum dievaluasi.` };
  }
  const spCount = Array.isArray(program.sp_records) ? program.sp_records.length : 0;
  if (spCount >= 3) return { action: "PHK", status: "SELESAI_PHK", spCount };
  if (spCount === 0) return { action: "LULUS", status: "SELESAI_LULUS", spCount };
  if (program.extension_given === true) {
    return { action: "LULUS", status: "SELESAI_LULUS", spCount };
  }
  return { action: "EXTEND", extend: Math.max(1, 3 - spCount), status: "AKTIF", spCount };
}

/** Perpanjang babak sesuai hasil (1 SP -> 2 babak, 2 SP -> 1 babak). */
export function extendPipRounds(program = {}, count = 1) {
  const rounds = Array.isArray(program.rounds) ? program.rounds : [];
  const last = rounds[rounds.length - 1];
  const startAfter = last?.end || program.tanggal_mulai || "";
  const nextStartIndex = rounds.length + 1;
  return buildPipRounds(program.tanggal_mulai, program.durasi_bulan, count, startAfter)
    .map((round, index) => ({ ...round, index: nextStartIndex + index }));
}

/** Status rekomendasi pada akhir babak berdasarkan rata-rata nilai. */
export function roundRecommendation(average, standard = PIP_DEFAULT_STANDARD) {
  if (average === null || average === undefined) return "PENDING";
  return Number(average) >= Number(standard) ? "LOLOS" : "SP";
}

export function pipStatusLabel(status) {
  return PIP_STATUS_LABELS[String(status || "").toUpperCase()] || status || "-";
}
