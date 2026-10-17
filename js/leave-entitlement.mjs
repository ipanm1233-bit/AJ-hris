/**
 * =====================================================================
 * LEAVE-ENTITLEMENT.MJS — Aturan jatah cuti tahunan berdasarkan masa kerja
 * =====================================================================
 * Aturan Andela (pengganti tier lama "3-11 bulan: 1 hari/bulan"):
 * 1. Bulan kerja 1-3 (masa probation / kontrak pertama 3 bulan):
 *    karyawan BELUM berhak dan belum boleh mengambil cuti tahunan (0 hari).
 * 2. Bulan ke-4: karyawan langsung mendapat jatah cuti tahunan 3 hari.
 * 3. Bulan ke-4 s/d ke-11: jatah terus bertambah +1 hari setiap bulan
 *    (bulan 5 = 4 hari, bulan 6 = 5 hari, ... bulan 11 = 10 hari).
 * 4. Masa kerja >= 1 tahun ATAU karyawan tetap (PKWTT / KARTAP / TETAP):
 *    jatah penuh 12 hari.
 * 5. Cuti penghargaan masa kerja (tetap berlaku untuk masa kerja >= 6 tahun):
 *    6 tahun = 13, 8 tahun = 14, 10 tahun = 15, 11 tahun = 16.
 *
 * Modul ini murni (tanpa dependensi browser) agar bisa dites otomatis dan
 * dipakai bersama oleh js/utils.js (getCalculatedJatahCuti) maupun UI.
 * =====================================================================
 */

const PERMANENT_PATTERN = /PKWTT|TETAP|KARTAP/;

export function isPermanentEmployee(emp = {}) {
  const status = String(emp.status_karyawan || emp.status_kepegawaian || emp.status || "").toUpperCase();
  return PERMANENT_PATTERN.test(status);
}

function parseJoinDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    try { return value.toDate(); } catch { return null; }
  }
  const str = String(value).trim();
  if (!str) return null;
  const iso = Date.parse(str);
  if (!Number.isNaN(iso)) return new Date(iso);
  const dmy = str.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dmy) {
    const parsed = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Selisih bulan penuh antara tanggal join dan tanggal referensi. */
export function monthsSinceJoin(emp = {}, refDate = new Date()) {
  const join = parseJoinDate(emp.tanggal_join);
  if (!join) return null;
  const ref = refDate instanceof Date ? refDate : new Date(refDate);
  return (ref.getFullYear() - join.getFullYear()) * 12 + (ref.getMonth() - join.getMonth());
}

/**
 * Jatah cuti tahunan otomatis berdasarkan masa kerja & status kepegawaian.
 * Mengembalikan 0 ketika karyawan belum berhak (bulan 1-3), angka proporsional
 * pada masa bertumbuh (bulan 4-11), dan jatah penuh (>= 12 hari) setelah itu.
 */
export function getAutoJatahTahunan(emp = {}, refDate = new Date()) {
  const months = monthsSinceJoin(emp, refDate);
  if (months === null) return 12; // tanggal_join tidak tercatat: pakai jatah standar penuh
  if (months <= 3) return 0;

  const permanent = isPermanentEmployee(emp);
  if (permanent || months >= 12) {
    // Cuti penghargaan masa kerja (>= 6 tahun).
    if (months >= 132) return 16;
    if (months >= 120) return 15;
    if (months >= 96) return 14;
    if (months >= 72) return 13;
    return 12;
  }
  // Bulan 4 = 3 hari, bulan 5 = 4 hari, ... bulan 11 = 10 hari.
  return 3 + (months - 4);
}

/** Klasifikasi tahap jatah untuk pesan UI: NONE | GROWING | FULL. */
export function describeAnnualLeaveTier(emp = {}, refDate = new Date()) {
  const months = monthsSinceJoin(emp, refDate);
  const permanent = isPermanentEmployee(emp);
  const jatahTahunan = getAutoJatahTahunan(emp, refDate);
  let tier = "FULL";
  if (months !== null && months <= 3) tier = "NONE";
  else if (!permanent && months !== null && months < 12) tier = "GROWING";
  return { tier, months, permanent, jatahTahunan };
}
