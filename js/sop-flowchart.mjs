/**
 * =====================================================================
 * SOP-FLOWCHART.MJS — Logika murni untuk dokumen SOP & flowchart Mermaid
 * =====================================================================
 * Modul ini sengaja bebas dari DOM / Firestore agar mudah diuji dan
 * dipakai ulang oleh view `sop.js` maupun proses cetak dokumen.
 */

export const SOP_STEP_CATEGORIES = Object.freeze(["START", "PROCESS", "DECISION", "DOKUMEN", "END"]);

export const SOP_STATUSES = Object.freeze(["Draft", "Review", "Revisi", "Aktif", "Obsolete"]);

export const SOP_DIVISIONS = Object.freeze([
  "HRD", "FINANCE", "SALES", "MARKETING", "WAREHOUSE", "LOGISTIC", "GA", "IT", "ALL"
]);

export const SOP_CATEGORIES = Object.freeze([
  "Prosedur Operasional",
  "Prosedur SDM",
  "Prosedur Keuangan",
  "Prosedur Sales & Marketing",
  "Prosedur Gudang & Logistik",
  "Prosedur K3",
  "Prosedur Sistem Informasi",
  "Lainnya"
]);

export const DEFAULT_DECISION_YES = "Ya / Sesuai";
export const DEFAULT_DECISION_NO = "Tidak / Revisi";

const MAX_LABEL_LENGTH = 160;

/**
 * Bersihkan teks agar aman dipakai sebagai label Mermaid:
 * tanda kutip, kurung kurawal, kurung siku, dan backslash dihapus karena
 * dipakai Mermaid untuk sintaks bentuk node & edge.
 */
export function sanitizeMermaidLabel(value, maxLength = MAX_LABEL_LENGTH) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/["'`]/g, " ")
    .replace(/[{}()\[\]\\]/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeCategory(value) {
  const cat = String(value || "").trim().toUpperCase();
  if (cat === "DOKUMEN" || cat === "DOCUMENT" || cat === "DOC") return "DOKUMEN";
  if (cat === "KEPUTUSAN" || cat === "DECISION") return "DECISION";
  if (cat === "MULAI" || cat === "START") return "START";
  if (cat === "SELESAI" || cat === "END") return "END";
  return SOP_STEP_CATEGORIES.includes(cat) ? cat : "PROCESS";
}

/** Normalisasi satu langkah SOP tanpa mengubah objek asli. */
export function normalizeStep(step = {}, index = 0) {
  const category = normalizeCategory(step.category || step.shape);
  return {
    ...step,
    id: step.id || `step_${index + 1}`,
    category,
    nama_aktivitas: String(step.nama_aktivitas || step.title || `Langkah ${index + 1}`).trim(),
    actor: String(step.actor || step.pelaksana || "").trim(),
    detail_proses: String(step.detail_proses || step.description || "").trim(),
    decision_yes: String(step.decision_yes || DEFAULT_DECISION_YES).trim(),
    decision_no: String(step.decision_no || DEFAULT_DECISION_NO).trim()
  };
}

export function normalizeSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  return steps.filter(Boolean).map((step, index) => normalizeStep(step, index));
}

/**
 * Ubah teks "Alur Proses" (satu langkah per baris) menjadi langkah
 * terstruktur. Heuristik kategori dibuat konservatif agar hasil diagram
 * tetap rapi: baris pertama START, baris terakhir END, kalimat tanya /
 * kata keputusan menjadi DECISION, dan kata dokumen menjadi DOKUMEN.
 */
export function stepsFromText(rawText, { divisi = "HRD", judul = "" } = {}) {
  const lines = String(rawText || "")
    .split(/\r?\n+/)
    .map(line => line.replace(/^\s*(?:\d+[\.\)]\s*|[-*•]\s*|langkah\s*\d+\s*[:\.]\s*)/i, "").trim())
    .filter(Boolean);

  if (!lines.length) {
    const subject = sanitizeMermaidLabel(judul) || "prosedur ini";
    lines.push(
      `Penerimaan permohonan / kebutuhan terkait ${subject}`,
      "Verifikasi kelengkapan dokumen dan persetujuan atasan",
      "Apakah dokumen dinyatakan lengkap dan disetujui?",
      "Pelaksanaan proses sesuai standar dan pencatatan hasil",
      "Pengarsipan dokumen dan penutupan proses"
    );
  }

  const total = lines.length;
  const actorDefault = `Tim ${divisi || "HRD"}`;

  return lines.map((lineText, index) => {
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const isDecision = /apakah|jika|bila|setuju|disetujui|sanggah|revisi|valid|lengkap\?/i.test(lineText);
    const isDoc = /dokumen|formulir|berkas|laporan|surat|cetak|arsip|invoice|faktur/i.test(lineText);

    let category = "PROCESS";
    if (isFirst) category = "START";
    else if (isLast) category = "END";
    else if (isDecision) category = "DECISION";
    else if (isDoc) category = "DOKUMEN";

    let actor = actorDefault;
    if (/pemohon|karyawan|staf|sales/i.test(lineText)) actor = "Pemohon / Staf";
    if (/atasan|manajer|kabag|direktur|supervisor|spv/i.test(lineText)) actor = "Atasan / Manajer";

    return normalizeStep({
      id: `step_${index + 1}`,
      category,
      nama_aktivitas: isFirst ? `Mulai: ${lineText}` : isLast ? `Selesai: ${lineText}` : lineText,
      actor,
      detail_proses: lineText,
      decision_yes: DEFAULT_DECISION_YES,
      decision_no: DEFAULT_DECISION_NO
    }, index);
  });
}

/**
 * Ambil langkah efektif sebuah SOP: pakai `flowchart_steps` bila sudah
 * disimpan, jika belum turunkan otomatis dari `alur_proses`.
 */
export function resolveSteps(sop = {}) {
  if (Array.isArray(sop.flowchart_steps) && sop.flowchart_steps.length > 0) {
    return normalizeSteps(sop.flowchart_steps);
  }
  return stepsFromText(sop.alur_proses, { divisi: sop.divisi || sop.departemen, judul: sop.judul });
}

/**
 * Bangun sintaks Mermaid `flowchart TD` dari daftar langkah.
 * @param {object|string} sopOrTitle - objek SOP (judul/divisi) atau judul saja.
 * @param {Array} steps - daftar langkah.
 */
export function buildMermaidCode(sopOrTitle, steps = []) {
  const sop = typeof sopOrTitle === "string" ? { judul: sopOrTitle } : (sopOrTitle || {});
  const judul = sanitizeMermaidLabel(sop.judul || "Prosedur SOP");
  const normalized = normalizeSteps(steps);

  if (!normalized.length) {
    return [
      "flowchart TD",
      `  %% Mermaid Flowchart - ${judul}`,
      '  N1(["START: Mulai Prosedur"]):::startStyle',
      '  N2["Proses Standar"]:::processStyle',
      '  N3(["END: Selesai Prosedur"]):::endStyle',
      "  N1 --> N2 --> N3",
      "",
      "  classDef startStyle fill:#059669,stroke:#047857,color:#ffffff,font-weight:bold;",
      "  classDef processStyle fill:#1e293b,stroke:#475569,color:#f8fafc;",
      "  classDef decisionStyle fill:#78350f,stroke:#d97706,color:#fef3c7;",
      "  classDef docStyle fill:#083344,stroke:#06b6d4,color:#e0f2fe;",
      "  classDef endStyle fill:#991b1b,stroke:#dc2626,color:#ffffff,font-weight:bold;"
    ].join("\n");
  }

  const lines = ["flowchart TD", `  %% Mermaid Flowchart - ${judul}`];
  lines.push(
    "  classDef startStyle fill:#059669,stroke:#047857,color:#ffffff,font-weight:bold;",
    "  classDef processStyle fill:#1e293b,stroke:#475569,color:#f8fafc;",
    "  classDef decisionStyle fill:#78350f,stroke:#d97706,color:#fef3c7;",
    "  classDef docStyle fill:#083344,stroke:#06b6d4,color:#e0f2fe;",
    "  classDef endStyle fill:#991b1b,stroke:#dc2626,color:#ffffff,font-weight:bold;",
    ""
  );

  const nodeIds = normalized.map((_, index) => `N${index + 1}`);

  normalized.forEach((step, index) => {
    const nodeId = nodeIds[index];
    const name = sanitizeMermaidLabel(step.nama_aktivitas || `Langkah ${index + 1}`);
    const actor = sanitizeMermaidLabel(step.actor, 60);
    const detail = sanitizeMermaidLabel(step.detail_proses, 90);

    let label = `<b>${name}</b>`;
    if (actor) label += `<br/><i>${actor}</i>`;
    if (detail && detail.toLowerCase() !== name.toLowerCase()) label += `<br/>${detail}`;

    switch (step.category) {
      case "START":
        lines.push(`  ${nodeId}(["START: ${name}"]):::startStyle`);
        break;
      case "DECISION":
        lines.push(`  ${nodeId}{"${name}"}:::decisionStyle`);
        break;
      case "DOKUMEN":
        lines.push(`  ${nodeId}[/"${label}"/]:::docStyle`);
        break;
      case "END":
        lines.push(`  ${nodeId}(["END: ${name}"]):::endStyle`);
        break;
      default:
        lines.push(`  ${nodeId}["${label}"]:::processStyle`);
        break;
    }
  });

  lines.push("", "  %% Alur & Percabangan");

  normalized.forEach((step, index) => {
    const current = nodeIds[index];
    const next = nodeIds[index + 1] || null;

    if (step.category === "DECISION") {
      const yesLabel = sanitizeMermaidLabel(step.decision_yes || DEFAULT_DECISION_YES, 40);
      const noLabel = sanitizeMermaidLabel(step.decision_no || DEFAULT_DECISION_NO, 40);
      const noTarget = index > 0 ? nodeIds[index - 1] : current;
      if (next) {
        lines.push(`  ${current} -->|"${yesLabel}"| ${next}`);
      } else {
        lines.push(`  ${current} -->|"${yesLabel}"| ${current}`);
      }
      lines.push(`  ${current} -.->|"${noLabel}"| ${noTarget}`);
    } else if (next) {
      lines.push(`  ${current} --> ${next}`);
    }
  });

  return lines.join("\n");
}

/** Tahun aman dari sebuah tanggal (string/Date) dengan fallback hari ini. */
function safeYear(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

/** Nomor dokumen SOP standar: SOP/<DIVISI>/<TAHUN>/<URUT 3 digit>. */
export function buildSopNumber(divisi, dateValue, sequence = 1) {
  const div = String(divisi || "ALL")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ALL";
  const seq = Math.max(1, Math.trunc(Number(sequence) || 1));
  return `SOP/${div}/${safeYear(dateValue)}/${String(seq).padStart(3, "0")}`;
}

/** Nomor SOP final: pakai nomor yang sudah diisi user bila ada. */
export function formatSopNumber(sop = {}, fallbackSequence = 1) {
  const stored = String(sop.nomor_dokumen || sop.nomor || "").trim();
  if (stored) return stored;
  return buildSopNumber(sop.divisi || sop.departemen, sop.tanggal_terbit, fallbackSequence);
}

/** True bila tanggal review SOP sudah lewat / mendekat (<= 30 hari). */
export function isSopReviewDue(sop = {}, now = new Date(), warningDays = 30) {
  const raw = sop.tanggal_review || sop.tanggal_review_berikutnya;
  if (!raw) return false;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  const diffMs = date.getTime() - new Date(now).getTime();
  return diffMs <= warningDays * 24 * 60 * 60 * 1000;
}

/** Ringkasan portofolio SOP untuk kartu dashboard. */
export function summarizeSops(list = [], now = new Date()) {
  const rows = Array.isArray(list) ? list : [];
  const byDivisi = {};
  let aktif = 0;
  let draft = 0;
  let perluReview = 0;
  let obsolete = 0;

  rows.forEach(sop => {
    const divisi = String(sop.divisi || sop.departemen || "LAINNYA").toUpperCase();
    byDivisi[divisi] = (byDivisi[divisi] || 0) + 1;

    const status = String(sop.status || "").toLowerCase();
    if (status === "aktif") aktif += 1;
    else if (status === "obsolete") obsolete += 1;
    else draft += 1;

    if (isSopReviewDue(sop, now)) perluReview += 1;
  });

  return { total: rows.length, aktif, draft, obsolete, perluReview, byDivisi };
}
