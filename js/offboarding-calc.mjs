/**
 * =====================================================================
 * OFFBOARDING-CALC.MJS — logika murni perhitungan offboarding.
 *
 * Dipisahkan dari view `siklus-karyawan.js` agar bisa diuji tanpa DOM.
 * Fokus:
 *  - prorata sisa gaji berjalan untuk GAJI POKOK **dan** TUNJANGAN TETAP
 *    (bukan hanya gaji pokok seperti sebelumnya);
 *  - periode cut-off penggajian 22 bulan sebelumnya s.d. 21 bulan berjalan;
 *  - tanggal penerbitan Paklaring / Surat Keterangan (30 hari setelah
 *    hari terakhir bekerja).
 * =====================================================================
 */

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const text = String(value || "").slice(0, 10);
  const parts = text.split("-").map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part) || part <= 0)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function toIsoDateLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Tambah sejumlah hari kalender ke tanggal (ISO `YYYY-MM-DD`). */
export function addDaysIso(value, days = 0) {
  const date = parseLocalDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return toIsoDateLocal(date);
}

/**
 * Tanggal default penerbitan Paklaring / Surat Keterangan Kerja:
 * 30 (tiga puluh) hari kalender setelah hari terakhir bekerja.
 */
export function paklaringIssuanceDate(outDate, days = 30) {
  return addDaysIso(outDate, days);
}

/** Hitung hari kerja Senin-Sabtu (Minggu libur), inklusif start s.d. end. */
export function countWorkingDaysInclusive(startValue, endValue) {
  const start = parseLocalDate(startValue);
  const end = parseLocalDate(endValue);
  if (!start || !end || end < start) return 0;
  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== 0) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

/**
 * Awal periode sisa gaji mengikuti cut-off penggajian:
 * gaji dibayar tgl 25 menghitung absensi 22 bulan sebelumnya s.d. 21 bulan berjalan.
 * - Keluar setelah tgl cut-off (22 s.d. akhir bulan): mulai tgl 22 bulan berjalan
 *   (periode payroll berikutnya yang belum dibayarkan).
 * - Keluar tgl cut-off atau sebelumnya: mulai tgl 22 bulan sebelumnya
 *   (periode payroll berjalan yang belum dibayarkan).
 */
export function defaultSisaGajiStart(outDate, cutoffDay) {
  const out = parseLocalDate(outDate);
  if (!out) return "";
  const cutoff = Math.min(Math.max(parseInt(cutoffDay, 10) || 21, 1), 31);
  const batasBulan = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  const tglCutoff = new Date(out.getFullYear(), out.getMonth(), Math.min(cutoff, batasBulan));
  if (out > tglCutoff) {
    return toIsoDateLocal(new Date(out.getFullYear(), out.getMonth(), tglCutoff.getDate() + 1));
  }
  const bulanSebelumnya = new Date(out.getFullYear(), out.getMonth() - 1, 1);
  const batasBulanLalu = new Date(bulanSebelumnya.getFullYear(), bulanSebelumnya.getMonth() + 1, 0).getDate();
  const tglCutoffLalu = new Date(bulanSebelumnya.getFullYear(), bulanSebelumnya.getMonth(), Math.min(cutoff, batasBulanLalu));
  return toIsoDateLocal(new Date(tglCutoffLalu.getFullYear(), tglCutoffLalu.getMonth(), tglCutoffLalu.getDate() + 1));
}

/**
 * Hitung sisa gaji berjalan (belum dibayarkan) karyawan yang keluar.
 *
 * Gaji pokok dan tunjangan tetap diprorata TERPISAH dengan pembagi hari kerja
 * yang sama, lalu dijumlahkan. Dengan begitu slip/ surat perjanjian dapat
 * menampilkan rincian prorata gaji pokok dan prorata tunjangan.
 *
 * @param {object} opts
 * @param {string} opts.outDate tanggal efektif keluar (YYYY-MM-DD)
 * @param {number} opts.gajiPokok gaji pokok per bulan
 * @param {number} [opts.tunjanganTetap] tunjangan tetap per bulan
 * @param {number} [opts.cutoffDay] tanggal cut-off payroll (default 21)
 * @param {number} [opts.hariKerjaPerBulan] baseline hari kerja (default 25)
 * @param {string} [opts.startDate] override tanggal mulai perhitungan
 */
export function hitungSisaGaji({
  outDate,
  gajiPokok,
  tunjanganTetap = 0,
  cutoffDay = 21,
  hariKerjaPerBulan = 25,
  startDate = ""
}) {
  const out = parseLocalDate(outDate);
  const pokok = Math.max(0, Number(gajiPokok) || 0);
  const tunjangan = Math.max(0, Number(tunjanganTetap) || 0);
  const upahTotal = pokok + tunjangan;
  const pembagi = Number(hariKerjaPerBulan) > 0 ? Number(hariKerjaPerBulan) : 25;
  const cutoff = Math.min(Math.max(parseInt(cutoffDay, 10) || 21, 1), 31);

  if (!out) {
    return {
      gajiPokok: pokok,
      tunjanganTetap: tunjangan,
      upahTotal,
      gajiPerHari: 0,
      gajiPokokPerHari: 0,
      tunjanganPerHari: 0,
      sisaHariKerja: 0,
      sisaGajiPokok: 0,
      sisaTunjangan: 0,
      sisaGaji: 0,
      mulai: "",
      cutoffDay: cutoff,
      hariKerjaPerBulan: pembagi
    };
  }

  const batasBulan = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  const tglCutoff = new Date(out.getFullYear(), out.getMonth(), Math.min(cutoff, batasBulan));
  const defaultStartIso = defaultSisaGajiStart(out, cutoff);
  const manualStart = parseLocalDate(startDate);
  const isManualStart = Boolean(manualStart) && toIsoDateLocal(manualStart) !== defaultStartIso;
  const start = manualStart || parseLocalDate(defaultStartIso);

  let sisaHariKerja = 0;
  if (isManualStart) {
    // HRD mengubah tanggal mulai secara manual: hitung hari kerja aktual.
    sisaHariKerja = Math.min(countWorkingDaysInclusive(start, out), pembagi);
  } else if (out > tglCutoff) {
    // Periode payroll berikutnya (22 bulan berjalan s.d. 21 bulan berikutnya):
    // hitung hari kerja aktual dari 22 bulan berjalan sampai tanggal keluar.
    sisaHariKerja = Math.min(countWorkingDaysInclusive(new Date(out.getFullYear(), out.getMonth(), tglCutoff.getDate() + 1), out), pembagi);
  } else {
    // Periode payroll berjalan (22 bulan sebelumnya s.d. 21 bulan berjalan).
    // Gaji penuh periode = hari kerja per bulan (25). Kurangkan hari kerja yang
    // tidak dijalani setelah tanggal keluar sampai tanggal cut-off.
    const hariTerlewat = countWorkingDaysInclusive(new Date(out.getFullYear(), out.getMonth(), out.getDate() + 1), tglCutoff);
    sisaHariKerja = Math.max(0, pembagi - hariTerlewat);
  }

  const gajiPokokPerHari = Math.round(pokok / pembagi);
  const tunjanganPerHari = Math.round(tunjangan / pembagi);
  const sisaGajiPokok = sisaHariKerja >= pembagi ? pokok : gajiPokokPerHari * sisaHariKerja;
  const sisaTunjangan = sisaHariKerja >= pembagi ? tunjangan : tunjanganPerHari * sisaHariKerja;

  return {
    gajiPokok: pokok,
    tunjanganTetap: tunjangan,
    upahTotal,
    gajiPokokPerHari,
    tunjanganPerHari,
    gajiPerHari: gajiPokokPerHari + tunjanganPerHari,
    sisaHariKerja,
    sisaGajiPokok,
    sisaTunjangan,
    sisaGaji: sisaGajiPokok + sisaTunjangan,
    mulai: start ? toIsoDateLocal(start) : "",
    cutoffDay: cutoff,
    hariKerjaPerBulan: pembagi
  };
}

/**
 * Normalisasi daftar klausul tambahan Surat Perjanjian Bersama dari input
 * HRD (array, teks multi-baris, atau nilai lama `catatan_pb`).
 */
export function normalizePbClauses(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || "").split(/\r?\n/);
  return list
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

/** Label dokumen keluar yang dipilih HRD pada picklist offboarding. */
export const OFFBOARDING_DOCUMENT_OPTIONS = Object.freeze([
  {
    value: "PAKLARING",
    label: "Paklaring (Surat Keterangan Kerja + Ucapan Terima Kasih)",
    short: "Paklaring"
  },
  {
    value: "SURAT_KETERANGAN",
    label: "Surat Keterangan Kerja (Keperluan BPJS / Administrasi)",
    short: "Surat Keterangan"
  },
  {
    value: "TIDAK_ADA",
    label: "Tidak Diterbitkan",
    short: "Tidak Ada"
  }
]);

export function offboardingDocumentLabel(value) {
  const found = OFFBOARDING_DOCUMENT_OPTIONS.find(option => option.value === value);
  return found ? found.label : OFFBOARDING_DOCUMENT_OPTIONS[0].label;
}

export function offboardingDocumentShort(value) {
  const found = OFFBOARDING_DOCUMENT_OPTIONS.find(option => option.value === value);
  return found ? found.short : OFFBOARDING_DOCUMENT_OPTIONS[0].short;
}

/** Jumlah hari setelah hari terakhir bekerja sebelum dokumen keluar diterbitkan. */
export const OFFBOARDING_DOCUMENT_ISSUE_DAYS = 30;
