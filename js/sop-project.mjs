/**
 * =====================================================================
 * SOP-PROJECT.MJS — Logika Proyek Audit SOP (Cirebon & Malang)
 * =====================================================================
 * Alur:
 *   DRAFT (PIC mengisi) -> SUBMITTED (HRD verifikasi & analisa)
 *   -> REVISION (perbaikan) -> SUBMITTED lagi
 *   -> VERIFIED (efektif & efisien) -> SOCIALIZED -> ESTABLISHED.
 */

export const ITEM_STATUSES = Object.freeze([
  "DRAFT", "SUBMITTED", "REVISION", "VERIFIED", "SOCIALIZED", "ESTABLISHED"
]);

export const ITEM_STATUS_META = Object.freeze({
  DRAFT: { label: "Draft PIC", tone: "slate" },
  SUBMITTED: { label: "Menunggu Verifikasi", tone: "amber" },
  REVISION: { label: "Perlu Revisi", tone: "red" },
  VERIFIED: { label: "Terverifikasi (Efektif & Efisien)", tone: "blue" },
  SOCIALIZED: { label: "Sudah Disosialisasi", tone: "violet" },
  ESTABLISHED: { label: "Berlaku / Ditetapkan", tone: "green" }
});

export const PROJECT_STATUSES = Object.freeze(["Draft", "Berjalan", "Selesai"]);

export const ASSIGNMENT_TYPES = Object.freeze([
  { value: "DIVISI", label: "Per Divisi" },
  { value: "JABATAN", label: "Per Jabatan" },
  { value: "KARYAWAN", label: "Karyawan Tertentu (PIC)" }
]);

export const SOCIALIZATION_METHODS = Object.freeze([
  "Tatap Muka / Briefing",
  "Rapat Divisi",
  "Zoom / Video Conference",
  "Email & Portal HRIS",
  "Kombinasi"
]);

export const SOCIALIZATION_TARGETS = Object.freeze([
  { value: "SEMUA", label: "Seluruh Karyawan" },
  { value: "CABANG", label: "Karyawan Cabang Terkait" },
  { value: "DIVISI", label: "Karyawan Divisi Terkait" },
  { value: "JABATAN", label: "Jabatan Terkait" }
]);

const TRANSITIONS = Object.freeze({
  DRAFT: { submit: "SUBMITTED" },
  REVISION: { submit: "SUBMITTED" },
  SUBMITTED: { verify: "VERIFIED", revise: "REVISION" },
  VERIFIED: { socialize: "SOCIALIZED" },
  SOCIALIZED: { establish: "ESTABLISHED" }
});

const normalizeText = value => String(value ?? "").trim().toLowerCase();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function sessionIdentity(session = {}) {
  return [session.nik, session.username, session.nama, session.email]
    .map(normalizeText)
    .filter(Boolean);
}

function sameBranch(itemCabang, sessionCabang) {
  const item = normalizeText(itemCabang);
  if (!item || item === "semua") return true;
  return item === normalizeText(sessionCabang);
}

/** Apakah user adalah PIC yang ditunjuk (langsung, per divisi, atau per jabatan). */
export function itemMatchesSession(session = {}, item = {}) {
  const keys = sessionIdentity(session);
  const directKeys = [item.pic_nik, item.pic_username, item.pic_nama, item.pic_email]
    .map(normalizeText)
    .filter(Boolean);
  if (directKeys.some(value => keys.includes(value))) return true;
  if (!sameBranch(item.cabang, session.cabang)) return false;
  if (item.penugasan_tipe === "DIVISI") {
    const division = normalizeText(item.divisi);
    if (!division) return false;
    if (["semua divisi", "semua", "all"].includes(division)) return true;
    return division === normalizeText(session.divisi);
  }
  if (item.penugasan_tipe === "JABATAN") {
    const posisi = normalizeText(session.posisi || session.jabatan);
    return Boolean(normalizeText(item.jabatan)) && normalizeText(item.jabatan) === posisi;
  }
  return false;
}

/** Bisa mengisi/merevisi item (HRD selalu boleh, PIC sesuai penugasan). */
export function canFillItem(session = {}, item = {}, { isHrd = false } = {}) {
  if (isHrd) return true;
  return itemMatchesSession(session, item);
}

/** Item terlihat user: milik PIC, atau sudah disosialisasikan/ditetapkan (semua karyawan). */
export function itemVisibleTo(session = {}, item = {}, { isHrd = false } = {}) {
  if (isHrd) return true;
  const status = String(item.status || "").toUpperCase();
  if (status === "SOCIALIZED" || status === "ESTABLISHED") return true;
  return itemMatchesSession(session, item);
}

/** Nilai analisa HRD dari skor efektivitas & efisiensi (1-5) menjadi 0-100. */
export function computeAnalysisValue(effectiveness, efficiency) {
  const eff = Number(effectiveness);
  const efi = Number(efficiency);
  if (!Number.isFinite(eff) || !Number.isFinite(efi)) return 0;
  if (eff < 1 || eff > 5 || efi < 1 || efi > 5) return 0;
  return Math.round(((eff + efi) / 10) * 100);
}

export function analysisGrade(value) {
  const score = clamp(Number(value) || 0, 0, 100);
  if (score >= 90) return { grade: "A", label: "Sangat Efektif & Efisien", tone: "green" };
  if (score >= 80) return { grade: "B", label: "Efektif & Efisien", tone: "blue" };
  if (score >= 70) return { grade: "C", label: "Cukup - perlu penyempurnaan", tone: "amber" };
  if (score >= 60) return { grade: "D", label: "Kurang - perlu revisi", tone: "red" };
  return { grade: "E", label: "Tidak Efektif - wajib revisi", tone: "red" };
}

/** Validasi transisi status workflow. Mengembalikan status baru atau null. */
export function nextStatus(current, action) {
  const key = String(current || "").toUpperCase();
  const actionKey = String(action || "").toLowerCase();
  return TRANSITIONS[key]?.[actionKey] || null;
}

export function isValidTransition(current, action) {
  return Boolean(nextStatus(current, action));
}

/** Ringkasan item dalam satu proyek / keseluruhan. */
export function summarizeItems(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const counts = Object.fromEntries(ITEM_STATUSES.map(status => [status, 0]));
  rows.forEach(item => {
    const status = String(item?.status || "").toUpperCase();
    if (counts[status] !== undefined) counts[status] += 1;
  });
  const total = rows.length;
  return {
    total,
    counts,
    progress: total ? Math.round((counts.ESTABLISHED / total) * 100) : 0,
    pendingVerification: counts.SUBMITTED,
    needRevision: counts.REVISION,
    established: counts.ESTABLISHED
  };
}

export function autoSopNumber({ divisi = "UMUM", urut = 1, tahun = new Date().getFullYear() } = {}) {
  const slug = String(divisi || "UMUM")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "UMUM";
  const sequence = String(Math.max(1, Number(urut) || 1)).padStart(3, "0");
  return `SOP/${slug}/${tahun}/${sequence}`;
}

function normalizeStepRow(step = {}, index = 0) {
  return {
    urutan: Number(step.urutan) || index + 1,
    aktivitas: String(step.aktivitas || "").trim(),
    pelaksana: String(step.pelaksana || "").trim(),
    jenis: String(step.jenis || "").trim().toUpperCase(),
    waktu: String(step.waktu || step.sla || "").trim(),
    output: String(step.output || "").trim()
  };
}

function normalizeFlowRow(row = {}) {
  return {
    dari: String(row.dari || "").trim(),
    ke: String(row.ke || "").trim(),
    media: String(row.media || "").trim(),
    frekuensi: String(row.frekuensi || "").trim(),
    tujuan: String(row.tujuan || "").trim()
  };
}

function normalizeOutputRow(row = {}) {
  return {
    nama: String(row.nama || "").trim(),
    bentuk: String(row.bentuk || "").trim(),
    penerima: String(row.penerima || "").trim(),
    frekuensi: String(row.frekuensi || "").trim()
  };
}

export function normalizeWorkSteps(value, { deriveFromText = "" } = {}) {
  const rows = Array.isArray(value) && value.length
    ? value
    : String(deriveFromText || "").split(/\r?\n+/).map(line => ({ aktivitas: line.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, "") }));
  return rows
    .map((row, index) => (typeof row === "string" ? normalizeStepRow({ aktivitas: row }, index) : normalizeStepRow(row, index)))
    .filter(row => row.aktivitas);
}

export function normalizeCommunicationFlow(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeFlowRow).filter(row => row.dari || row.ke || row.media || row.tujuan);
}

export function normalizeOutputs(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeOutputRow).filter(row => row.nama || row.bentuk || row.penerima);
}

/**
 * Bentuk payload dokumen SOP_DOKUMEN dari satu item audit yang sudah
 * ditetapkan, agar otomatis muncul di Database SOP & generator flowchart.
 */
export function buildSopDocument(item = {}, options = {}) {
  const steps = normalizeWorkSteps(item.langkah);
  const flowchartSteps = steps.map((step, index) => {
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;
    const category = isFirst ? "START" : isLast ? "END" : step.jenis === "KEPUTUSAN" ? "DECISION" : step.jenis === "DOKUMEN" ? "DOKUMEN" : "PROCESS";
    const stepId = `S${String(index + 1).padStart(2, "0")}`;
    return {
      id: `step_${index + 1}`,
      step_id: stepId,
      category,
      shape: category,
      nama_aktivitas: step.aktivitas,
      actor: step.pelaksana,
      detail_proses: step.output ? `Output: ${step.output}` : "",
      output_document: step.output,
      sla: step.waktu,
      next_step_yes: isLast ? "" : `S${String(index + 2).padStart(2, "0")}`,
      next_step_no: "",
      decision_yes: "Ya / Sesuai",
      decision_no: "Tidak / Revisi"
    };
  });

  return {
    judul: String(item.nama_proses || "").trim(),
    nomor_dokumen: String(options.nomor_dokumen || "").trim(),
    divisi: String(item.divisi || "UMUM").trim(),
    kategori: String(options.kategori || "Prosedur Operasional"),
    versi: String(options.versi || "1.0"),
    status: "Aktif",
    tanggal_terbit: options.tanggal_terbit || "",
    tanggal_review: options.tanggal_review || "",
    pembuat: String(item.pic_nama || item.pic_username || `PIC ${item.divisi || ""}`).trim(),
    penyetuju: String(options.penyetuju || "").trim(),
    tujuan: String(item.tujuan || "").trim(),
    ruang_lingkup: String(item.ruang_lingkup || "").trim(),
    alur_proses: steps.map((step, index) => `${index + 1}. ${step.aktivitas}${step.pelaksana ? ` (${step.pelaksana})` : ""}`).join("\n"),
    flowchart_steps: flowchartSteps,
    referensi: String(item.referensi || "").trim(),
    sumber: "AUDIT_SOP",
    audit_item_id: item.id || "",
    audit_project_id: item.project_id || "",
    flow_komunikasi: normalizeCommunicationFlow(item.flow_komunikasi),
    output_proses: normalizeOutputs(item.output),
    updated_at: new Date().toISOString()
  };
}
