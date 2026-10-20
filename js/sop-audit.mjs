/**
 * =====================================================================
 * SOP-AUDIT.MJS — Logika audit kepatuhan SOP per divisi
 * =====================================================================
 * Skala penilaian 0-4 (model maturity sederhana):
 *   0 Tidak diterapkan | 1 Sebagian kecil | 2 Sebagian
 *   3 Sebagian besar   | 4 Diterapkan penuh
 * Skor akhir = total(bobot * skor/maks) / total(bobot) * 100.
 */

export const AUDIT_STATUSES = Object.freeze(["Draft", "Terjadwal", "Berlangsung", "Selesai", "Tindak Lanjut"]);

export const FINDING_SEVERITIES = Object.freeze(["Mayor", "Minor", "Observasi", "Peluang Perbaikan"]);

export const FOLLOW_UP_STATUSES = Object.freeze(["Open", "Progres", "Selesai"]);

export const SCORE_MAX = 4;

export const SCORE_SCALE_LABELS = Object.freeze({
  0: "Tidak Diterapkan",
  1: "Sebagian Kecil",
  2: "Sebagian",
  3: "Sebagian Besar",
  4: "Diterapkan Penuh"
});

export const AUDIT_GRADES = Object.freeze([
  { min: 90, grade: "A", label: "Sangat Baik", tone: "green" },
  { min: 80, grade: "B", label: "Baik", tone: "blue" },
  { min: 70, grade: "C", label: "Cukup", tone: "amber" },
  { min: 60, grade: "D", label: "Kurang", tone: "red" },
  { min: 0, grade: "E", label: "Tidak Memenuhi", tone: "red" }
]);

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampScore(value) {
  return clamp(Math.round(numeric(value, 0)), 0, SCORE_MAX);
}

export function normalizeFinding(item = {}, index = 0) {
  const bobot = Math.max(0, numeric(item.bobot, 1));
  const skor = clampScore(item.skor);
  const followUp = FOLLOW_UP_STATUSES.includes(String(item.status_tindak_lanjut))
    ? String(item.status_tindak_lanjut)
    : (skor >= 3 ? "Selesai" : "Open");
  return {
    ...item,
    id: item.id || `chk_${index + 1}`,
    klausul: String(item.klausul || item.item || "").trim(),
    standar: String(item.standar || item.kriteria || "").trim(),
    bobot,
    skor,
    temuan: String(item.temuan || "").trim(),
    severity: FINDING_SEVERITIES.includes(String(item.severity)) ? String(item.severity) : "Observasi",
    tindak_lanjut: String(item.tindak_lanjut || "").trim(),
    pic: String(item.pic || "").trim(),
    deadline: item.deadline || "",
    status_tindak_lanjut: followUp
  };
}

export function normalizeChecklist(checklist = []) {
  if (!Array.isArray(checklist)) return [];
  return checklist.filter(Boolean).map((item, index) => normalizeFinding(item, index));
}

/** Skor kepatuhan 0-100 (dibulatkan 2 desimal). */
export function computeAuditScore(checklist = []) {
  const rows = normalizeChecklist(checklist);
  if (!rows.length) return 0;
  let weighted = 0;
  let totalWeight = 0;
  rows.forEach(row => {
    const weight = row.bobot > 0 ? row.bobot : 1;
    weighted += weight * (row.skor / SCORE_MAX);
    totalWeight += weight;
  });
  if (!totalWeight) return 0;
  return Math.round((weighted / totalWeight) * 10000) / 100;
}

/** Grade & label dari skor 0-100. */
export function gradeAudit(score) {
  const value = clamp(numeric(score, 0), 0, 100);
  return AUDIT_GRADES.find(entry => value >= entry.min) || AUDIT_GRADES[AUDIT_GRADES.length - 1];
}

export function isFollowUpOverdue(item = {}, now = new Date()) {
  const status = String(item.status_tindak_lanjut || "Open");
  if (status === "Selesai") return false;
  if (!item.deadline) return false;
  const deadline = new Date(item.deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() < new Date(now).getTime();
}

/** Ringkasan temuan: jumlah per severity, temuan terbuka, dan overdue. */
export function summarizeChecklist(checklist = [], now = new Date()) {
  const rows = normalizeChecklist(checklist);
  const bySeverity = { Mayor: 0, Minor: 0, Observasi: 0, "Peluang Perbaikan": 0 };
  let withFinding = 0;
  let open = 0;
  let overdue = 0;

  rows.forEach(row => {
    bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    const hasFinding = row.skor < SCORE_MAX || Boolean(row.temuan) || Boolean(row.tindak_lanjut);
    if (hasFinding) withFinding += 1;
    if (row.status_tindak_lanjut !== "Selesai") {
      open += 1;
      if (isFollowUpOverdue(row, now)) overdue += 1;
    }
  });

  return {
    totalItems: rows.length,
    withFinding,
    open,
    overdue,
    bySeverity,
    score: computeAuditScore(rows),
    grade: gradeAudit(computeAuditScore(rows))
  };
}

/** Ringkasan satu sesi audit (header + checklist) siap dipakai UI. */
export function summarizeAudit(audit = {}, now = new Date()) {
  const checklist = normalizeChecklist(audit.checklist);
  const summary = summarizeChecklist(checklist, now);
  return {
    ...audit,
    checklist,
    skor: summary.score,
    grade: summary.grade.grade,
    gradeLabel: summary.grade.label,
    gradeTone: summary.grade.tone,
    totalItems: summary.totalItems,
    findings: summary.withFinding,
    openFindings: summary.open,
    overdueFindings: summary.overdue,
    bySeverity: summary.bySeverity
  };
}

/** Ringkasan seluruh audit untuk kartu dashboard & rekap divisi. */
export function summarizeAudits(list = [], now = new Date()) {
  const rows = (Array.isArray(list) ? list : []).map(item => summarizeAudit(item, now));
  const byDivisi = {};
  let openFindings = 0;
  let overdueFindings = 0;
  let scoreSum = 0;
  let scored = 0;

  rows.forEach(audit => {
    const divisi = String(audit.divisi || "LAINNYA").toUpperCase();
    if (!byDivisi[divisi]) byDivisi[divisi] = { total: 0, scoreSum: 0, scored: 0, openFindings: 0 };
    byDivisi[divisi].total += 1;
    if (audit.totalItems > 0) byDivisi[divisi].scored += 1;
    byDivisi[divisi].scoreSum += audit.skor;
    byDivisi[divisi].openFindings += audit.openFindings;
    openFindings += audit.openFindings;
    overdueFindings += audit.overdueFindings;
    if (audit.totalItems > 0) {
      scoreSum += audit.skor;
      scored += 1;
    }
  });

  const divisiList = Object.entries(byDivisi).map(([divisi, value]) => ({
    divisi,
    total: value.total,
    averageScore: value.scored ? Math.round((value.scoreSum / value.scored) * 100) / 100 : 0,
    openFindings: value.openFindings
  })).sort((a, b) => b.averageScore - a.averageScore);

  return {
    totalAudits: rows.length,
    averageScore: scored ? Math.round((scoreSum / scored) * 100) / 100 : 0,
    openFindings,
    overdueFindings,
    byDivisi: divisiList,
    audits: rows
  };
}

/** Checklist standar per divisi — dipakai tombol "Muat Checklist Standar". */
function resolveChecklistDivision(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("HRD") || text.includes("PERSONALIA") || /\bGA\b/.test(text)) return "HRD";
  if (text.includes("FINANCE") || text.includes("KEUANGAN") || text.includes("ACCOUNT")) return "FINANCE";
  if (text.includes("SALES") || text.includes("MARKETING") || text.includes("PENJUALAN")) return "SALES";
  if (text.includes("GUDANG") || text.includes("WAREHOUSE")) return "WAREHOUSE";
  if (text.includes("LOGISTIK") || text.includes("LOGISTIC") || text.includes("EKSPEDISI")) return "LOGISTIC";
  return text;
}

export function standardChecklistFor(divisi = "HRD") {
  const base = [
    { klausul: "Dokumentasi", standar: "SOP terdokumentasi, bernomor, dan versi terbaru tersedia di tempat kerja", bobot: 2 },
    { klausul: "Sosialisasi", standar: "Seluruh pelaksana telah menerima sosialisasi / pelatihan SOP terkait", bobot: 2 },
    { klausul: "Kepatuhan", standar: "Pelaksanaan kerja sesuai langkah SOP yang berlaku", bobot: 3 },
    { klausul: "Pencatatan", standar: "Bukti pelaksanaan (form/log) terisi lengkap dan dapat ditelusuri", bobot: 2 },
    { klausul: "Pengendalian", standar: "Penyimpangan dicatat, dianalisis, dan ditindaklanjuti atasan", bobot: 2 }
  ];

  const extra = {
    SALES: [
      { klausul: "Kunjungan", standar: "Rute dan laporan kunjungan toko dijalankan sesuai SOP Sales", bobot: 3 },
      { klausul: "Gimmick", standar: "Distribusi gimmick tercatat dan memiliki tanda terima toko", bobot: 2 }
    ],
    WAREHOUSE: [
      { klausul: "FIFO/FEFO", standar: "Penerapan FIFO/FEFO dan penataan gudang sesuai SOP", bobot: 3 },
      { klausul: "Stock Opname", standar: "Stock opname berkala dilakukan dan selisih ditindaklanjuti", bobot: 2 }
    ],
    FINANCE: [
      { klausul: "Rekonsiliasi", standar: "Rekonsiliasi kas/bank dilakukan harian dan diverifikasi", bobot: 3 },
      { klausul: "Dokumen", standar: "Bukti transaksi lengkap dan diarsipkan sesuai SOP", bobot: 2 }
    ],
    HRD: [
      { klausul: "Data Karyawan", standar: "Data kepegawaian mutakhir dan akses dibatasi sesuai kewenangan", bobot: 3 },
      { klausul: "Kerahasiaan", standar: "Dokumen rahasia karyawan disimpan sesuai SOP kerahasiaan", bobot: 2 }
    ],
    LOGISTIC: [
      { klausul: "Pengiriman", standar: "Surat jalan, serah terima, dan bukti pengiriman lengkap", bobot: 3 },
      { klausul: "Kendaraan", standar: "Pemeriksaan kendaraan dan keselamatan dijalankan sebelum berangkat", bobot: 2 }
    ]
  };

  const div = resolveChecklistDivision(divisi || "HRD");
  return [...base, ...(extra[div] || [])].map((item, index) => normalizeFinding({
    ...item,
    id: `chk_std_${index + 1}`,
    skor: 0,
    temuan: "",
    severity: "Observasi",
    tindak_lanjut: "",
    pic: "",
    deadline: "",
    status_tindak_lanjut: "Open"
  }, index));
}
