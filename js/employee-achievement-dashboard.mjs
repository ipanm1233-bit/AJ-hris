/**
 * =====================================================================
 * EMPLOYEE-ACHIEVEMENT-DASHBOARD.MJS
 * =====================================================================
 * Logika murni untuk dashboard pencapaian per karyawan beserta seluruh
 * catatan kedisiplinan dan catatan lainnya. Modul ini dipakai oleh
 * views/dashboard-karyawan.js dan diuji tanpa DOM/Firebase.
 *
 * Sumber data (nama koleksi):
 * - master_karyawan            -> identitas karyawan
 * - log_penilaian_harian       -> skor & catatan penilaian harian
 * - target_bulanan_kpi         -> target + realisasi bulanan
 * - log_penilaian_kpi          -> hasil penilaian KPI/360
 * - performance_review         -> review kinerja formal
 * - log_sp_konseling           -> SP, teguran, konseling
 * - data_pemanggilan           -> surat panggilan
 * - hr_cases                   -> kasus konseling/coaching/disiplin
 * - evaluasi_kontrak           -> evaluasi perpanjangan kontrak
 * - pip_programs               -> program PIP
 * =====================================================================
 */
import { monthlyMetricRows } from "./monthly-achievement.mjs";

export const ALL_PERIOD = "ALL";

export const NIK_FIELDS = Object.freeze([
  "nik_dinilai", "nik_karyawan", "nik_pemohon", "nik", "karyawan_nik",
  "employee_nik", "nik_pegawai", "nik_karyawan_dinilai"
]);

export const NAME_FIELDS = Object.freeze([
  "nama_dinilai", "nama_karyawan", "nama_pemohon", "nama", "karyawan_nama",
  "nama_pegawai", "nama_karyawan_dinilai"
]);

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const INACTIVE_STATUSES = [
  "TIDAK AKTIF", "NON AKTIF", "NONAKTIF", "INACTIVE", "RESIGN", "KELUAR", "BERHENTI", "PHK", "TERMINATED"
];

function localDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Normalisasi NIK: hanya huruf/angka, kapital. */
export function normalizeNik(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalisasi nama: kapital, tanda baca/spasi berlebih disatukan. */
export function normalizePersonName(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Ubah berbagai format tanggal menjadi kunci YYYY-MM-DD (tanggal lokal). */
export function toDateKey(value) {
  if (value === null || value === undefined || value === "") return "";

  if (value instanceof Date) return localDateKey(value);

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        return toDateKey(value.toDate());
      } catch {
        return "";
      }
    }
    if (Number.isFinite(Number(value.seconds))) {
      return toDateKey(new Date(Number(value.seconds) * 1000));
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Serial tanggal Excel (mis. 46300) agar impor tetap terbaca.
    if (value > 20000 && value < 80000) {
      return toDateKey(new Date(Math.round((value - 25569) * 86400000)));
    }
    return toDateKey(new Date(value));
  }

  const text = String(value).trim();
  if (!text) return "";

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  }

  match = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-01`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : localDateKey(parsed);
}

/** Ambil tanggal pertama yang valid dari beberapa field. */
export function rowDateKey(row, fields = []) {
  if (!row || typeof row !== "object") return "";
  for (const field of fields) {
    const key = toDateKey(row[field]);
    if (key) return key;
  }
  return "";
}

export function periodFromDateKey(dateKey) {
  return String(dateKey || "").slice(0, 7);
}

/** Label periode Indonesia, mis. "2026-11" -> "November 2026". */
export function periodLabel(period) {
  const value = String(period || "").trim();
  if (!value || value.toUpperCase() === ALL_PERIOD) return "Semua Periode";
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const month = MONTH_NAMES[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : value;
}

/** Daftar periode terakhir (termasuk bulan berjalan) untuk filter UI. */
export function recentPeriodOptions(endDate = new Date(), count = 24) {
  const anchor = endDate instanceof Date && !Number.isNaN(endDate.getTime()) ? endDate : new Date();
  const total = Math.max(1, Number(count) || 24);
  const list = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    list.push({ value, label: periodLabel(value) });
  }
  return list;
}

/** Karyawan dianggap aktif kecuali statusnya menandakan keluar. */
export function isActiveEmployee(employee = {}) {
  const status = String(
    employee.aktif_tdk_aktif || employee["aktif/tidak_aktif"] || employee.status_aktif || employee.status_karyawan || "AKTIF"
  ).trim().toUpperCase();
  return !INACTIVE_STATUSES.some(token => status.includes(token));
}

/**
 * Cocokkan satu baris data dengan karyawan.
 * NIK diprioritaskan; nama dipakai bila baris tidak memiliki NIK.
 */
export function matchesEmployee(row, employee, options = {}) {
  if (!row || !employee) return false;
  const nikFields = Array.isArray(options.nikFields) ? options.nikFields : NIK_FIELDS;
  const nameFields = Array.isArray(options.nameFields) ? options.nameFields : NAME_FIELDS;

  const employeeNik = normalizeNik(employee.nik_karyawan || employee.nik || employee.id);
  const rowNik = nikFields.map(field => normalizeNik(row[field])).find(Boolean) || "";
  if (employeeNik && rowNik) return employeeNik === rowNik;

  const employeeName = normalizePersonName(employee.nama_karyawan || employee.nama);
  const rowName = nameFields.map(field => normalizePersonName(row[field])).find(Boolean) || "";
  if (!employeeName || !rowName) return false;
  if (employeeName === rowName) return true;

  // Toleransi nama yang salah satunya memuat gelar/keterangan tambahan.
  const employeeTokens = employeeName.split(" ");
  const rowTokens = rowName.split(" ");
  const containsTokens = (shorter, longer) =>
    shorter.length >= 2 && longer.length >= 2 && shorter.every(token => longer.includes(token));
  return containsTokens(employeeTokens, rowTokens) || containsTokens(rowTokens, employeeTokens);
}

export function filterRowsForEmployee(rows, employee, options = {}) {
  return (Array.isArray(rows) ? rows : []).filter(row => matchesEmployee(row, employee, options));
}

/**
 * Filter periode. `ALL_PERIOD` / string kosong mengembalikan semua baris.
 * Baris tanpa tanggal hanya disertakan pada mode semua periode.
 */
export function filterRowsByPeriod(rows, dateFields, period) {
  const list = Array.isArray(rows) ? rows : [];
  const target = String(period || "").trim();
  if (!target || target.toUpperCase() === ALL_PERIOD) return list.slice();
  return list.filter(row => rowDateKey(row, dateFields).startsWith(target));
}

export function sortNewestFirst(rows, dateField = "date") {
  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const dateCompare = String(right?.[dateField] || "").localeCompare(String(left?.[dateField] || ""));
    if (dateCompare) return dateCompare;
    return String(right?.title || "").localeCompare(String(left?.title || ""), "id");
  });
}

/**
 * Cari target bulanan milik karyawan. Bila periode ALL, target terbaru
 * yang dipakai agar ringkasan tetap informatif.
 */
export function findMonthlyTarget(targets, employee, period) {
  const matched = filterRowsForEmployee(targets, employee).filter(row => {
    const rowPeriod = String(row.periode || "").slice(0, 7);
    if (!rowPeriod) return false;
    if (String(period || "").toUpperCase() === ALL_PERIOD) return true;
    return rowPeriod === String(period || "").slice(0, 7);
  });
  if (!matched.length) return null;
  return matched.slice().sort((left, right) => {
    const periodCompare = String(right.periode || "").localeCompare(String(left.periode || ""));
    if (periodCompare) return periodCompare;
    return String(right.updated_at || right.created_at || "").localeCompare(
      String(left.updated_at || left.created_at || "")
    );
  })[0];
}

function highestSeverity(values) {
  const order = { high: 3, medium: 2, low: 1 };
  return values.reduce((current, value) => (order[value] > order[current] ? value : current), "low");
}

function spSeverity(level) {
  const text = String(level || "").toUpperCase();
  if (text.includes("SP 3") || text.includes("SP3")) return "high";
  if (text.includes("SP 2") || text.includes("SP2")) return "high";
  if (text.includes("SP 1") || text.includes("SP1") || text.includes("TEGURAN TERTULIS")) return "medium";
  if (text.includes("KONSELING")) return "medium";
  return "low";
}

function caseSeverity(priority) {
  const text = String(priority || "").toUpperCase();
  if (text === "KRITIS" || text === "TINGGI") return "high";
  if (text === "SEDANG") return "medium";
  return "low";
}

function textValue(...values) {
  return values
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Timeline kedisiplinan: SP/konseling, pemanggilan, dan kasus HR. */
export function buildDisciplineTimeline({ employee, period, spRows = [], callRows = [], cases = [] } = {}) {
  const entries = [];

  filterRowsByPeriod(filterRowsForEmployee(spRows, employee), ["tanggal", "created_at"], period)
    .forEach(row => {
      const date = rowDateKey(row, ["tanggal", "created_at"]);
      const level = row.tingkat_sp || "Catatan Disiplin";
      entries.push({
        kind: "SP",
        date,
        title: level,
        subtitle: row.pasal_pp || row.kategori_pelanggaran || "",
        detail: textValue(row.pelanggaran || row.keterangan),
        status: row.masa_berlaku ? `Berlaku s.d. ${row.masa_berlaku}` : "",
        severity: spSeverity(level),
        source: "Log SP & Konseling",
        raw: row
      });
    });

  filterRowsByPeriod(filterRowsForEmployee(callRows, employee), ["tanggal_panggilan", "created_at"], period)
    .forEach(row => {
      const date = rowDateKey(row, ["tanggal_panggilan", "created_at"]);
      entries.push({
        kind: "Pemanggilan",
        date,
        title: "Surat Panggilan",
        subtitle: row.perihal || "",
        detail: textValue(
          row.waktu ? `Waktu: ${row.waktu}` : "",
          row.keterangan || "",
          row.catatan || ""
        ),
        status: row.status || "",
        severity: String(row.status || "").toUpperCase() === "MANGKIR" ? "high" : "low",
        source: "Data Pemanggilan",
        raw: row
      });
    });

  filterRowsByPeriod(filterRowsForEmployee(cases, employee), ["incident_date", "report_date", "created_at"], period)
    .forEach(row => {
      const date = rowDateKey(row, ["incident_date", "report_date", "created_at"]);
      const assessmentNotes = row.hr_assessment?.assessment_notes || row.assessment_notes || "";
      entries.push({
        kind: "Kasus HR",
        date,
        title: textValue(row.case_type || "Kasus", row.category || "") || "Kasus HR",
        subtitle: row.case_number || row.source || "",
        detail: textValue(
          row.description || row.chronology || "",
          assessmentNotes ? `Asesmen HRD: ${assessmentNotes}` : "",
          row.action_taken ? `Tindakan: ${row.action_taken}` : ""
        ),
        status: textValue(row.status || "", row.priority ? `Prioritas ${row.priority}` : ""),
        severity: caseSeverity(row.priority),
        source: "Konseling & Coaching",
        raw: row
      });
    });

  return sortNewestFirst(entries);
}

/** Timeline catatan lainnya: penilaian harian, review, kontrak, PIP, KPI 360. */
export function buildNotesTimeline({
  employee,
  period,
  dailyLogs = [],
  reviews = [],
  contractEvals = [],
  pipPrograms = [],
  kpiLogs = [],
  kpiTasks = [],
  monthlyTarget = null
} = {}) {
  const entries = [];

  filterRowsByPeriod(filterRowsForEmployee(dailyLogs, employee), ["tanggal", "created_at"], period)
    .forEach(row => {
      const note = textValue(
        row.catatan_harian,
        row.catatan_baik ? `Hal baik: ${row.catatan_baik}` : "",
        row.catatan_perbaikan ? `Perlu perbaikan: ${row.catatan_perbaikan}` : "",
        row.alasan_potongan ? `Alasan potongan: ${row.alasan_potongan}` : ""
      );
      if (!note) return;
      const score = row.total_skor;
      entries.push({
        kind: "Penilaian Harian",
        date: rowDateKey(row, ["tanggal", "created_at"]),
        title: score === null || score === undefined || score === "" ? "Catatan Penilaian Harian" : `Penilaian Harian · Skor ${score}`,
        subtitle: textValue(row.penilai ? `Penilai: ${row.penilai}` : "", row.predikat || ""),
        detail: note,
        status: row.kategori || "",
        severity: row.potongan_kpi ? "medium" : "low",
        source: "Penilaian Harian",
        raw: row
      });
    });

  filterRowsByPeriod(filterRowsForEmployee(reviews, employee), ["tanggal", "created_at"], period)
    .forEach(row => {
      const score = row.skor_akhir === null || row.skor_akhir === undefined || row.skor_akhir === "" ? "" : `Skor ${row.skor_akhir}`;
      entries.push({
        kind: "Review Kinerja",
        date: rowDateKey(row, ["tanggal", "created_at"]),
        title: textValue("Review Kinerja", row.periode || "") || "Review Kinerja",
        subtitle: textValue(score, row.grade ? `Grade ${row.grade}` : ""),
        detail: textValue(
          row.kelebihan ? `Kelebihan: ${row.kelebihan}` : "",
          row.area_pengembangan ? `Area pengembangan: ${row.area_pengembangan}` : "",
          row.rekomendasi ? `Rekomendasi: ${row.rekomendasi}` : "",
          row.sumber_bukti ? `Sumber bukti: ${row.sumber_bukti}` : ""
        ),
        status: row.reviewer || "",
        severity: "low",
        source: "Review Kinerja",
        raw: row
      });
    });

  filterRowsByPeriod(filterRowsForEmployee(contractEvals, employee), ["tgl_review_hrd", "tgl_akhir_kontrak", "created_at"], period)
    .forEach(row => {
      const note = textValue(
        row.rekomendasi_hrd ? `Rekomendasi HRD: ${row.rekomendasi_hrd}` : "",
        row.catatan_hrd ? `Catatan HRD: ${row.catatan_hrd}` : "",
        row.catatan_atasan ? `Catatan atasan: ${row.catatan_atasan}` : ""
      );
      if (!note) return;
      entries.push({
        kind: "Evaluasi Kontrak",
        date: rowDateKey(row, ["tgl_review_hrd", "tgl_akhir_kontrak", "created_at"]),
        title: textValue("Evaluasi Kontrak", row.tahap || "") || "Evaluasi Kontrak",
        subtitle: row.tgl_akhir_kontrak ? `Kontrak berakhir ${row.tgl_akhir_kontrak}` : "",
        detail: note,
        status: row.keputusan || row.status || "",
        severity: /TIDAK DIPERPANJANG/i.test(String(row.rekomendasi_hrd || "")) ? "high" : "low",
        source: "Penilaian Kontrak",
        raw: row
      });
    });

  filterRowsByPeriod(filterRowsForEmployee(pipPrograms, employee), ["tanggal_mulai", "created_at"], period)
    .forEach(row => {
      const spCount = Array.isArray(row.sp_records) ? row.sp_records.length : 0;
      entries.push({
        kind: "PIP",
        date: rowDateKey(row, ["tanggal_mulai", "created_at"]),
        title: `Program PIP · ${row.status || "AKTIF"}`,
        subtitle: textValue(row.nomor_perjanjian || "", row.durasi_bulan ? `${row.durasi_bulan} bulan` : ""),
        detail: textValue(
          row.catatan || "",
          spCount ? `${spCount} catatan SP dalam program PIP.` : ""
        ) || "Program PIP tercatat.",
        status: spCount ? `${spCount} SP` : "",
        severity: spCount >= 2 ? "high" : spCount ? "medium" : "low",
        source: "PIP",
        raw: row
      });
    });

  filterRowsByPeriod(filterRowsForEmployee(kpiLogs, employee), ["tanggal", "created_at"], period)
    .forEach(row => {
      const note = textValue(
        row.catatan_baik ? `Hal baik: ${row.catatan_baik}` : "",
        row.catatan_perbaikan ? `Perlu perbaikan: ${row.catatan_perbaikan}` : "",
        row.catatan_penilai ? `Catatan penilai: ${row.catatan_penilai}` : ""
      );
      if (!note) return;
      const score = row.skor_akhir ?? row.total_skor;
      entries.push({
        kind: "Penilaian KPI",
        date: rowDateKey(row, ["tanggal", "created_at"]),
        title: textValue("Penilaian KPI", row.periode || "") || "Penilaian KPI",
        subtitle: textValue(
          row.penilai || row.nama_penilai ? `Penilai: ${row.penilai || row.nama_penilai}` : "",
          score === null || score === undefined || score === "" ? "" : `Skor ${score}`
        ),
        detail: note,
        status: row.tipe_relasi || "",
        severity: "low",
        source: "Penilaian KPI 360",
        raw: row
      });
    });

  filterRowsByPeriod(filterRowsForEmployee(kpiTasks, employee), ["tanggal_diselesaikan", "updated_at", "created_at"], period)
    .forEach(row => {
      const note = textValue(
        row.catatan_hrd ? `Instruksi HRD: ${row.catatan_hrd}` : "",
        row.catatan_baik ? `Hal baik: ${row.catatan_baik}` : "",
        row.catatan_perbaikan ? `Perlu perbaikan: ${row.catatan_perbaikan}` : "",
        row.catatan_penilai ? `Catatan penilai: ${row.catatan_penilai}` : ""
      );
      if (!note) return;
      const score = row.skor_akhir;
      entries.push({
        kind: "Tugas KPI 360",
        date: rowDateKey(row, ["tanggal_diselesaikan", "updated_at", "created_at"]),
        title: textValue("Tugas KPI 360", row.periode || "") || "Tugas KPI 360",
        subtitle: textValue(
          row.tipe_relasi || "",
          row.nama_penilai ? `Penilai: ${row.nama_penilai}` : "",
          score === null || score === undefined || score === "" ? "" : `Skor ${score}`
        ),
        detail: note,
        status: row.status || "",
        severity: "low",
        source: "Distribusi Tugas KPI",
        raw: row
      });
    });

  if (monthlyTarget?.capaian_bulanan?.catatan) {
    const achievement = monthlyTarget.capaian_bulanan;
    entries.push({
      kind: "Realisasi Bulanan",
      date: rowDateKey(achievement, ["dicatat_pada"]) || `${String(monthlyTarget.periode || "").slice(0, 7)}-01`,
      title: textValue("Realisasi Target Bulanan", periodLabel(monthlyTarget.periode)),
      subtitle: textValue(
        achievement.dicatat_oleh ? `Dicatat oleh: ${achievement.dicatat_oleh}` : "",
        monthlyTarget.kategori || ""
      ),
      detail: achievement.catatan,
      status: "",
      severity: "low",
      source: "Target Bulanan KPI",
      raw: monthlyTarget
    });
  }

  return sortNewestFirst(entries);
}

function average(values) {
  const numbers = (Array.isArray(values) ? values : [])
    .filter(value => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
  if (!numbers.length) return null;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  return Math.round((total / numbers.length) * 100) / 100;
}

function latestByDate(rows, dateFields) {
  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const dateCompare = rowDateKey(right, dateFields).localeCompare(rowDateKey(left, dateFields));
    if (dateCompare) return dateCompare;
    return String(right.created_at || "").localeCompare(String(left.created_at || ""));
  })[0] || null;
}

/** Rata-rata capaian metrik bulanan (tanpa metrik turunan & overdue). */
export function overallAttainment(metrics) {
  const values = (Array.isArray(metrics) ? metrics : [])
    .filter(metric => !metric.derived && !metric.lowerIsBetter && metric.attainment !== null)
    .map(metric => Number(metric.attainment))
    .filter(Number.isFinite);
  return average(values);
}

export function buildDailyTrend(dailyLogs, limit = 31) {
  const rows = (Array.isArray(dailyLogs) ? dailyLogs : [])
    .filter(row => row.total_skor !== null && row.total_skor !== undefined && row.total_skor !== "")
    .map(row => ({
      date: rowDateKey(row, ["tanggal", "created_at"]),
      score: Number(row.total_skor),
      predikat: row.predikat || "",
      kategori: row.kategori || ""
    }))
    .filter(row => row.date && Number.isFinite(row.score))
    .sort((left, right) => left.date.localeCompare(right.date));
  const max = Math.max(1, Number(limit) || 31);
  return rows.slice(-max);
}

/**
 * Susun seluruh data satu karyawan untuk dashboard & laporan.
 * Semua sumber menerima array mentah; fungsi ini yang memfilter.
 */
export function buildEmployeeDashboardData({ employee, period = ALL_PERIOD, sources = {} } = {}) {
  if (!employee) throw new Error("Data karyawan wajib diisi.");

  const dailyLogs = filterRowsForEmployee(sources.dailyLogs, employee);
  const reviews = filterRowsForEmployee(sources.reviews, employee);
  const kpiLogs = filterRowsForEmployee(sources.kpiLogs, employee);
  const kpiTasks = filterRowsForEmployee(sources.kpiTasks, employee);
  const contractEvals = filterRowsForEmployee(sources.contractEvals, employee);
  const pipPrograms = filterRowsForEmployee(sources.pipPrograms, employee);
  const spRows = filterRowsForEmployee(sources.spRows, employee);
  const callRows = filterRowsForEmployee(sources.callRows, employee);
  const cases = filterRowsForEmployee(sources.cases, employee);

  const periodDailyLogs = filterRowsByPeriod(dailyLogs, ["tanggal", "created_at"], period);
  const periodReviews = filterRowsByPeriod(reviews, ["tanggal", "created_at"], period);
  const periodKpiLogs = filterRowsByPeriod(kpiLogs, ["tanggal", "created_at"], period);
  const periodKpiTasks = filterRowsByPeriod(kpiTasks, ["tanggal_diselesaikan", "updated_at", "created_at"], period);
  const periodContracts = filterRowsByPeriod(contractEvals, ["tgl_review_hrd", "tgl_akhir_kontrak", "created_at"], period);
  const periodPip = filterRowsByPeriod(pipPrograms, ["tanggal_mulai", "created_at"], period);

  const target = findMonthlyTarget(sources.targets, employee, period);
  const metrics = target ? monthlyMetricRows(target) : [];
  const overall = overallAttainment(metrics);

  const latestDaily = latestByDate(periodDailyLogs, ["tanggal", "created_at"]);
  const latestReview = latestByDate(periodReviews, ["tanggal", "created_at"]);
  const latestKpi = latestByDate(periodKpiLogs, ["tanggal", "created_at"]);

  const discipline = buildDisciplineTimeline({
    employee,
    period,
    spRows: sources.spRows,
    callRows: sources.callRows,
    cases: sources.cases
  });

  const notes = buildNotesTimeline({
    employee,
    period,
    dailyLogs: sources.dailyLogs,
    reviews: sources.reviews,
    contractEvals: sources.contractEvals,
    pipPrograms: sources.pipPrograms,
    kpiLogs: sources.kpiLogs,
    kpiTasks: sources.kpiTasks,
    monthlyTarget: target
  });

  const openCases = filterRowsByPeriod(cases, ["incident_date", "report_date", "created_at"], period)
    .filter(row => !["SELESAI", "DIBATALKAN"].includes(String(row.status || "").toUpperCase()));
  const spPeriod = filterRowsByPeriod(spRows, ["tanggal", "created_at"], period);
  const callPeriod = filterRowsByPeriod(callRows, ["tanggal_panggilan", "created_at"], period);

  return {
    employee,
    identity: {
      nama: employee.nama_karyawan || employee.nama || "-",
      nik: employee.nik_karyawan || employee.nik || "-",
      jabatan: employee.jabatan || "-",
      cabang: employee.cabang || "-",
      divisi: employee.divisi || employee.departemen || "-",
      status: employee.status_karyawan || employee.status || "-",
      atasan: employee.atasan || ""
    },
    period,
    periodLabel: periodLabel(period),
    target,
    metrics,
    overallAttainment: overall,
    dailyTrend: buildDailyTrend(periodDailyLogs),
    summary: {
      dailyCount: periodDailyLogs.length,
      dailyAverage: average(periodDailyLogs.map(row => row.total_skor)),
      latestDailyScore: latestDaily?.total_skor ?? null,
      latestDailyDate: latestDaily ? rowDateKey(latestDaily, ["tanggal", "created_at"]) : "",
      latestPredikat: latestDaily?.predikat || "",
      reviewLatestScore: latestReview?.skor_akhir ?? null,
      reviewLatestGrade: latestReview?.grade || "",
      reviewLatestPeriod: latestReview?.periode || (latestReview ? rowDateKey(latestReview, ["tanggal", "created_at"]) : ""),
      reviewCount: periodReviews.length,
      kpiLatestScore: latestKpi?.skor_akhir ?? latestKpi?.total_skor ?? null,
      kpiLatestPeriod: latestKpi?.periode || "",
      kpiCount: periodKpiLogs.length,
      kpiTaskCount: periodKpiTasks.length,
      monthlyOverall: overall,
      monthlyPeriod: target?.periode || "",
      disciplineCount: discipline.length,
      spCount: spPeriod.length,
      callCount: callPeriod.length,
      caseCount: filterRowsByPeriod(cases, ["incident_date", "report_date", "created_at"], period).length,
      openCaseCount: openCases.length,
      noteCount: notes.length,
      contractCount: periodContracts.length,
      pipCount: periodPip.length
    },
    discipline,
    notes
  };
}

/** Ringkasan seluruh karyawan untuk tabel dashboard. */
export function buildDashboardRows({ employees = [], period = ALL_PERIOD, sources = {} } = {}) {
  return (Array.isArray(employees) ? employees : [])
    .filter(Boolean)
    .map(employee => buildEmployeeDashboardData({ employee, period, sources }))
    .sort((left, right) => String(left.identity.nama || "").localeCompare(String(right.identity.nama || ""), "id"));
}

/** Total agregat untuk kartu ringkasan manajemen. */
export function dashboardTotals(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const discipline = list.reduce((sum, row) => sum + Number(row.summary?.disciplineCount || 0), 0);
  const openCases = list.reduce((sum, row) => sum + Number(row.summary?.openCaseCount || 0), 0);
  const notes = list.reduce((sum, row) => sum + Number(row.summary?.noteCount || 0), 0);
  const assessed = list.filter(row => Number(row.summary?.dailyCount || 0) > 0 || row.summary?.reviewLatestScore !== null).length;
  return {
    employees: list.length,
    assessed,
    discipline,
    openCases,
    notes,
    averageDaily: average(list.map(row => row.summary?.dailyAverage))
  };
}
