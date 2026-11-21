/**
 * =====================================================================
 * KUNJUNGAN-LAPANGAN.MJS
 * =====================================================================
 * Logika murni (tanpa DOM/Firestore) untuk modul Pengajuan & Pelaporan
 * Kunjungan Lapangan (Joint Visit & Audit Lapangan).
 *
 * Dipakai oleh:
 *  - js/views/kunjungan-lapangan.js  (UI web/mobile)
 *  - api/cron-kunjungan.js           (pengingat 16:00 & 08:00 WIB)
 *  - tests/kunjungan-lapangan.test.mjs
 *
 * Zona waktu operasional: Asia/Jakarta (WIB, GMT+7), Senin–Sabtu.
 * =====================================================================
 */

export const VISIT_TYPES = Object.freeze({
  JOINT_VISIT: "Joint Visit / Pendampingan Sales",
  AUDIT_LAPANGAN: "Audit Kunjungan & Toko"
});

export const VISIT_TYPE_OPTIONS = Object.freeze([
  { value: "JOINT_VISIT", label: VISIT_TYPES.JOINT_VISIT },
  { value: "AUDIT_LAPANGAN", label: VISIT_TYPES.AUDIT_LAPANGAN }
]);

export const APPROVAL_STATUS = Object.freeze({
  PENDING_ATASAN: "PENDING_ATASAN",
  PENDING_HRD: "PENDING_HRD",
  APPROVED_FINAL: "APPROVED_FINAL",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED"
});

export const APPROVAL_STATUS_LABELS = Object.freeze({
  PENDING_ATASAN: "Menunggu Atasan",
  PENDING_HRD: "Menunggu HRD",
  APPROVED_FINAL: "Disetujui Final",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan"
});

export const REPORT_STATUS = Object.freeze({
  NOT_APPLICABLE: "NOT_APPLICABLE",
  PENDING_REPORT: "PENDING_REPORT",
  SUBMITTED: "SUBMITTED",
  OVERDUE: "OVERDUE"
});

export const REPORT_STATUS_LABELS = Object.freeze({
  NOT_APPLICABLE: "Tidak Berlaku",
  PENDING_REPORT: "Belum Dilaporkan",
  SUBMITTED: "Selesai Dilaporkan",
  OVERDUE: "Terlambat Lapor"
});

export const VISIT_OUTCOMES = Object.freeze({
  TERKUNJUNGI: "Terkunjungi",
  TOKO_TUTUP: "Toko Tutup",
  TIDAK_TERKUNJUNGI: "Tidak Terkunjungi"
});

export const VISIT_OUTCOME_OPTIONS = Object.freeze([
  { value: "TERKUNJUNGI", label: VISIT_OUTCOMES.TERKUNJUNGI },
  { value: "TOKO_TUTUP", label: VISIT_OUTCOMES.TOKO_TUTUP },
  { value: "TIDAK_TERKUNJUNGI", label: VISIT_OUTCOMES.TIDAK_TERKUNJUNGI }
]);

export const ESCALATION_DIVISIONS = Object.freeze([
  "GENERAL MANAGER",
  "FINANCE & KREDIT",
  "WAREHOUSE & LOGISTIK",
  "HRD"
]);

export const FOLLOWUP_STATUS = Object.freeze({
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE"
});

export const FOLLOWUP_STATUS_LABELS = Object.freeze({
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  DONE: "Selesai"
});

/** Role yang boleh membuat pengajuan kunjungan. */
export const FIELD_VISIT_CREATOR_ROLES = Object.freeze([
  "SPV", "SPV SALES", "SUPERVISOR", "KOORDINATOR", "KOORDINATOR SALES",
  "SALES", "HRD", "HRGA", "SUPERADMIN", "MANAGER", "BRANCH MANAGER", "GM"
]);

/** Role yang boleh menyetujui tahap final (HRD/HRGA). */
export const FIELD_VISIT_HRD_ROLES = Object.freeze(["HRD", "HRGA", "SUPERADMIN"]);

/** Role yang melihat seluruh data (dashboard & rekap). */
export const FIELD_VISIT_VIEW_ALL_ROLES = Object.freeze([
  "HRD", "HRGA", "SUPERADMIN", "GM", "DIREKTUR", "DIRECTOR"
]);

export const FIELD_VISIT_REMINDER = Object.freeze({
  EVENING: "EVENING_1600",
  MORNING: "MORNING_0800",
  OVERDUE: "OVERDUE_ESCALATION_0800"
});

const WIB_OFFSET_MINUTES = 7 * 60;
const DAY_MS = 86400000;

/* ---------------------------------------------------------------------
 * UTILITAS TANGGAL (WIB)
 * ------------------------------------------------------------------- */

/** Tanggal `YYYY-MM-DD` menurut WIB untuk sebuah Date/ISO string. */
export function wibDateStr(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + WIB_OFFSET_MINUTES * 60000);
  return shifted.toISOString().slice(0, 10);
}

/** Jam `HH:mm` menurut WIB. */
export function wibTimeStr(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + WIB_OFFSET_MINUTES * 60000);
  return shifted.toISOString().slice(11, 16);
}

/** Normalisasi nilai tanggal (string ISO / Firestore Timestamp) ke `YYYY-MM-DD`. */
export function toDateOnly(value) {
  if (!value) return "";
  if (typeof value?.toDate === "function") return wibDateStr(value.toDate());
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return wibDateStr(parsed);
}

/** Tambah sejumlah hari pada `YYYY-MM-DD` (UTC-safe). */
export function addDays(dateStr, days = 0) {
  const base = toDateOnly(dateStr);
  if (!base) return "";
  const [y, m, d] = base.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d) + Number(days) * DAY_MS);
  return target.toISOString().slice(0, 10);
}

/** Selisih hari `to - from` (UTC-safe). */
export function daysBetween(from, to) {
  const a = toDateOnly(from);
  const b = toDateOnly(to);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** Deadline laporan: H+1 pukul 10:00 WIB setelah tanggal selesai kunjungan. */
export function computeReportDeadline(endDate) {
  const end = toDateOnly(endDate);
  if (!end) return "";
  return `${addDays(end, 1)}T10:00:00+07:00`;
}

/** Apakah deadline laporan sudah terlewati. */
export function isDeadlinePassed(deadlineAt, now = new Date()) {
  if (!deadlineAt) return false;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() < new Date(now).getTime();
}

/** Status laporan efektif (termasuk deteksi OVERDUE tanpa menunggu cron). */
export function effectiveReportStatus(request = {}, now = new Date()) {
  const status = String(request.report_status || REPORT_STATUS.NOT_APPLICABLE).toUpperCase();
  if (status === REPORT_STATUS.SUBMITTED) return REPORT_STATUS.SUBMITTED;
  if (String(request.approval_status || "").toUpperCase() !== APPROVAL_STATUS.APPROVED_FINAL) {
    return status === REPORT_STATUS.SUBMITTED ? REPORT_STATUS.SUBMITTED : REPORT_STATUS.NOT_APPLICABLE;
  }
  if (status === REPORT_STATUS.NOT_APPLICABLE) return REPORT_STATUS.PENDING_REPORT;
  if (status === REPORT_STATUS.OVERDUE) return REPORT_STATUS.OVERDUE;
  return isDeadlinePassed(request.report_deadline_at, now)
    ? REPORT_STATUS.OVERDUE
    : REPORT_STATUS.PENDING_REPORT;
}

/* ---------------------------------------------------------------------
 * NOMOR DOKUMEN
 * ------------------------------------------------------------------- */

export const DOC_PREFIX = "KJN";

/** Nomor dokumen `KJN-YYYYMMDD-XXX` berikutnya untuk tanggal tertentu. */
export function nextDocumentNumber(dateStr, existingNumbers = []) {
  const date = toDateOnly(dateStr) || wibDateStr();
  const compact = date.replace(/-/g, "");
  const prefix = `${DOC_PREFIX}-${compact}-`;
  const used = new Set(
    (Array.isArray(existingNumbers) ? existingNumbers : [])
      .map(value => String(value || "").trim().toUpperCase())
      .filter(value => value.startsWith(prefix))
  );
  let sequence = 1;
  while (used.has(`${prefix}${String(sequence).padStart(3, "0")}`)) sequence += 1;
  return `${prefix}${String(sequence).padStart(3, "0")}`;
}

/* ---------------------------------------------------------------------
 * VALIDASI
 * ------------------------------------------------------------------- */

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function validateVisitRequest(input = {}) {
  const errors = [];
  const type = String(input.visit_type || "").toUpperCase();
  if (!VISIT_TYPES[type]) errors.push("Jenis kunjungan wajib dipilih.");
  const start = toDateOnly(input.start_date);
  const end = toDateOnly(input.end_date || input.start_date);
  if (!start) errors.push("Tanggal mulai kunjungan wajib diisi.");
  if (!end) errors.push("Tanggal selesai kunjungan wajib diisi.");
  if (start && end && end < start) errors.push("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  if (isBlank(input.branch)) errors.push("Cabang / area wajib diisi.");
  const sales = Array.isArray(input.planned_sales_niks) ? input.planned_sales_niks.filter(Boolean) : [];
  if (type === "JOINT_VISIT" && sales.length === 0) {
    errors.push("Joint Visit wajib memilih minimal 1 Sales yang didampingi.");
  }
  const stores = Array.isArray(input.planned_store_ids) ? input.planned_store_ids.filter(Boolean) : [];
  if (stores.length === 0) errors.push("Pilih minimal 1 toko yang akan dikunjungi.");
  if (isBlank(input.purpose_notes)) errors.push("Tujuan & atensi khusus wajib diisi.");
  if (!isBlank(input.purpose_notes) && String(input.purpose_notes).trim().length < 10) {
    errors.push("Tujuan kunjungan minimal 10 karakter agar jelas.");
  }
  return errors;
}

export function validateVisitReport(input = {}) {
  const errors = [];
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) errors.push("Minimal 1 kartu kunjungan toko wajib diisi.");
  items.forEach((item, index) => {
    const label = `Toko #${index + 1}`;
    if (isBlank(item.store_id)) errors.push(`${label}: pilih toko dari Master Toko.`);
    const outcome = String(item.visit_outcome || "").toUpperCase();
    if (!VISIT_OUTCOMES[outcome]) errors.push(`${label}: status kunjungan wajib dipilih.`);
    if (outcome !== "TERKUNJUNGI" && isBlank(item.skip_reason)) {
      errors.push(`${label}: alasan wajib diisi bila toko tidak terkunjungi.`);
    }
    if (outcome === "TERKUNJUNGI") {
      const photos = Array.isArray(item.photo_urls) ? item.photo_urls.filter(Boolean) : [];
      if (photos.length === 0) errors.push(`${label}: minimal 1 foto bukti untuk toko yang terkunjungi.`);
    }
  });
  if (isBlank(input.executive_summary)) errors.push("Ringkasan eksekutif kunjungan wajib diisi.");
  if (input.needs_escalation) {
    if (isBlank(input.escalation_division)) errors.push("Divisi tujuan eskalasi wajib dipilih.");
    if (isBlank(input.escalation_notes)) errors.push("Detail isu & rekomendasi solusi wajib diisi.");
  }
  return errors;
}

/* ---------------------------------------------------------------------
 * PENGINGAT OTOMATIS
 * ------------------------------------------------------------------- */

/**
 * Tentukan jenis pengingat yang jatuh tempo untuk sebuah pengajuan.
 * Aturan PRD (WIB, Senin–Sabtu):
 *  - 16:00 di hari kunjungan selesai → EVENING_1600
 *  - 08:00 H+1 (sehari setelah selesai) → MORNING_0800
 *  - 08:00 mulai H+2 sampai laporan dikirim → OVERDUE_ESCALATION_0800
 */
export function reminderTypeFor(request = {}, now = new Date()) {
  if (String(request.approval_status || "").toUpperCase() !== APPROVAL_STATUS.APPROVED_FINAL) return "";
  const status = effectiveReportStatus(request, now);
  if (status === REPORT_STATUS.SUBMITTED) return "";
  const today = wibDateStr(now);
  const endDate = toDateOnly(request.end_date);
  if (!endDate) return "";
  const diff = daysBetween(endDate, today);
  if (diff === null) return "";
  const time = wibTimeStr(now);
  if (diff === 0 && time >= "16:00") return FIELD_VISIT_REMINDER.EVENING;
  if (diff === 1 && time >= "08:00") return FIELD_VISIT_REMINDER.MORNING;
  if (diff >= 2 && time >= "08:00") return FIELD_VISIT_REMINDER.OVERDUE;
  return "";
}

/* ---------------------------------------------------------------------
 * RINGKASAN DASHBOARD
 * ------------------------------------------------------------------- */

function monthKey(value) {
  return toDateOnly(value).slice(0, 7) || String(value || "").slice(0, 7);
}

export function summarizeFieldVisits(requests = [], reports = [], followups = [], now = new Date()) {
  const requestRows = (Array.isArray(requests) ? requests : []).filter(Boolean);
  const reportRows = (Array.isArray(reports) ? reports : []).filter(Boolean);
  const followupRows = (Array.isArray(followups) ? followups : []).filter(Boolean);
  const thisMonth = wibDateStr(now).slice(0, 7);
  const summary = {
    total: requestRows.length,
    this_month: 0,
    joint_visit: 0,
    audit_lapangan: 0,
    pending_atasan: 0,
    pending_hrd: 0,
    approved_final: 0,
    waiting_report: 0,
    submitted: 0,
    overdue: 0,
    rejected: 0,
    cancelled: 0,
    on_time: 0,
    late: 0,
    on_time_rate: null,
    open_followups: 0,
    escalation_open: 0
  };

  requestRows.forEach(request => {
    const approval = String(request.approval_status || "").toUpperCase();
    const type = String(request.visit_type || "").toUpperCase();
    if (monthKey(request.start_date || request.created_at) === thisMonth) summary.this_month += 1;
    if (type === "JOINT_VISIT") summary.joint_visit += 1;
    if (type === "AUDIT_LAPANGAN") summary.audit_lapangan += 1;
    if (approval === APPROVAL_STATUS.PENDING_ATASAN) summary.pending_atasan += 1;
    if (approval === APPROVAL_STATUS.PENDING_HRD) summary.pending_hrd += 1;
    if (approval === APPROVAL_STATUS.REJECTED) summary.rejected += 1;
    if (approval === APPROVAL_STATUS.CANCELLED) summary.cancelled += 1;
    if (approval === APPROVAL_STATUS.APPROVED_FINAL) {
      summary.approved_final += 1;
      const reportStatus = effectiveReportStatus(request, now);
      if (reportStatus === REPORT_STATUS.SUBMITTED) summary.submitted += 1;
      else if (reportStatus === REPORT_STATUS.OVERDUE) summary.overdue += 1;
      else summary.waiting_report += 1;
    }
  });

  reportRows.forEach(report => {
    if (report.is_late === true) summary.late += 1;
    else if (report.submitted_at) summary.on_time += 1;
  });
  const graded = summary.on_time + summary.late;
  summary.on_time_rate = graded ? Math.round((summary.on_time / graded) * 100) : null;

  followupRows.forEach(followup => {
    const status = String(followup.status || "OPEN").toUpperCase();
    if (status !== "DONE") {
      summary.open_followups += 1;
      if (String(followup.action_type || "").toUpperCase() === "ESKALASI_MANAJEMEN") {
        summary.escalation_open += 1;
      }
    }
  });

  return summary;
}

/* ---------------------------------------------------------------------
 * MASTER TOKO — CSV
 * ------------------------------------------------------------------- */

/** Parse CSV sederhana dengan dukungan tanda kutip ganda dan newline di dalam kutip. */
export function parseCsv(text = "") {
  const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = "";
    } else if (char === "\n") {
      row.push(field); field = "";
      if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

const STORE_HEADER_ALIASES = Object.freeze({
  store_code: ["store_code", "kode", "kode_toko", "kode customer", "kode_customer", "customer_code"],
  store_name: ["store_name", "nama", "nama_toko", "nama customer", "customer_name"],
  address: ["address", "alamat", "alamat_toko"],
  city_area: ["city_area", "kota", "area", "kecamatan", "kota_area"],
  branch: ["branch", "cabang"],
  assigned_sales_nik: ["assigned_sales_nik", "nik_sales", "sales_nik", "nik sales"],
  is_active: ["is_active", "aktif", "status"]
});

function headerKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function truthyActive(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return true;
  if (["AKTIF", "ACTIVE", "TRUE", "1", "YA", "Y"].includes(raw)) return true;
  if (["TIDAK AKTIF", "NONAKTIF", "INACTIVE", "FALSE", "0", "TIDAK", "N"].includes(raw)) return false;
  return true;
}

/**
 * Ubah CSV master toko menjadi baris siap upsert berdasarkan `store_code`.
 * Header menerima bahasa Indonesia maupun Inggris.
 */
export function parseStoreCsv(text = "") {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], errors: ["File CSV kosong atau hanya berisi header."] };
  const headers = rows[0].map(headerKey);
  const index = {};
  Object.entries(STORE_HEADER_ALIASES).forEach(([field, aliases]) => {
    index[field] = headers.findIndex(header => aliases.map(headerKey).includes(header));
  });
  if (index.store_code < 0 && index.store_name < 0) {
    return { rows: [], errors: ["Kolom kode toko / nama toko tidak ditemukan pada header CSV."] };
  }
  const errors = [];
  const parsed = [];
  const seen = new Set();
  rows.slice(1).forEach((cells, rowIndex) => {
    const read = field => (index[field] >= 0 ? String(cells[index[field]] ?? "").trim() : "");
    const code = read("store_code");
    const name = read("store_name");
    if (!code && !name) return;
    if (!code) { errors.push(`Baris ${rowIndex + 2}: kode toko wajib diisi.`); return; }
    if (!name) { errors.push(`Baris ${rowIndex + 2}: nama toko wajib diisi.`); return; }
    const key = code.toUpperCase();
    if (seen.has(key)) { errors.push(`Baris ${rowIndex + 2}: kode toko ${code} duplikat di file.`); return; }
    seen.add(key);
    parsed.push({
      store_code: code,
      store_name: name,
      address: read("address"),
      city_area: read("city_area"),
      branch: read("branch").toUpperCase(),
      assigned_sales_nik: read("assigned_sales_nik"),
      is_active: truthyActive(read("is_active"))
    });
  });
  return { rows: parsed, errors };
}

export function storeCsvTemplate() {
  return [
    "store_code,store_name,address,city_area,branch,assigned_sales_nik,is_active",
    "291625,FERDY JAYA KERAMIK,Jl. Contoh No. 1,CIREBON,CIREBON,,AKTIF"
  ].join("\n");
}

/* ---------------------------------------------------------------------
 * EXPORT REKAP
 * ------------------------------------------------------------------- */

function csvCell(value) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

/** CSV rekap kunjungan (kompatibel Excel, memakai BOM saat diunduh). */
export function buildVisitCsv(rows = []) {
  const header = [
    "Nomor Pengajuan", "Jenis", "Tanggal Mulai", "Tanggal Selesai", "Cabang",
    "Pemohon", "NIK Pemohon", "Status Approval", "Status Laporan",
    "Deadline Laporan", "Sales", "Toko", "Temuan", "Tindak Lanjut", "Eskalasi"
  ];
  const body = (Array.isArray(rows) ? rows : []).map(row => [
    row.document_number, row.visit_type_label, row.start_date, row.end_date, row.branch,
    row.nama_pemohon, row.nik_pemohon, row.approval_status_label, row.report_status_label,
    row.report_deadline_at, row.sales_label, row.stores_label, row.findings,
    row.followup_label, row.escalation_label
  ].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...body].join("\n");
}
