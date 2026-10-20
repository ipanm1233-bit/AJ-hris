/**
 * =====================================================================
 * SOP-FLOWCHART.MJS — Logika murni untuk dokumen SOP & flowchart Mermaid
 * =====================================================================
 * Modul ini sengaja bebas dari DOM / Firestore agar mudah diuji dan
 * dipakai ulang oleh view `sop.js` maupun proses cetak dokumen.
 */

export const SOP_STEP_CATEGORIES = Object.freeze(["START", "PROCESS", "DECISION", "DOKUMEN", "END", "LAINNYA"]);

export const SOP_STEP_CATEGORY_LABELS = Object.freeze({
  START: "START - Mulai",
  PROCESS: "PROCESS - Proses",
  DECISION: "DECISION - Keputusan",
  DOKUMEN: "DOKUMEN - Dokumen",
  END: "END - Selesai",
  LAINNYA: "LAINNYA - Kategori lain"
});

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
  if (cat === "LAINNYA" || cat === "OTHER" || cat === "LAIN LAIN") return "LAINNYA";
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
      "  classDef otherStyle fill:#334155,stroke:#94a3b8,color:#f8fafc,stroke-dasharray:5 3;",
      "  classDef endStyle fill:#991b1b,stroke:#dc2626,color:#ffffff,font-weight:bold;"
    ].join("\n");
  }

  const lines = ["flowchart TD", `  %% Mermaid Flowchart - ${judul}`];
  lines.push(
    "  classDef startStyle fill:#059669,stroke:#047857,color:#ffffff,font-weight:bold;",
    "  classDef processStyle fill:#1e293b,stroke:#475569,color:#f8fafc;",
    "  classDef decisionStyle fill:#78350f,stroke:#d97706,color:#fef3c7;",
    "  classDef docStyle fill:#083344,stroke:#06b6d4,color:#e0f2fe;",
    "  classDef otherStyle fill:#334155,stroke:#94a3b8,color:#f8fafc,stroke-dasharray:5 3;",
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
      case "LAINNYA":
        lines.push(`  ${nodeId}[/"${label}"/]:::otherStyle`);
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

/* ---------------------------------------------------------------------
 * FALLBACK SVG LOKAL
 * Diagram Mermaid di atas tetap menjadi sumber utama. Fungsi di bawah ini
 * menggambar flowchart SVG murni tanpa layanan eksternal (tanpa Kroki/CDN)
 * sehingga dokumen SOP tetap punya diagram saat Mermaid gagal dimuat.
 * ------------------------------------------------------------------- */

function escapeSvgText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapSvgText(value, maxChars = 44) {
  const words = sanitizeMermaidLabel(value, 280).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

/**
 * Bangun SVG flowchart sederhana dari langkah SOP. Dipakai sebagai fallback
 * terakhir saat Mermaid (CDN) tidak tersedia, mis. saat offline atau CDN
 * diblokir. Tidak melakukan request jaringan apa pun.
 */
export function buildFlowchartSvg(sopOrTitle, steps = []) {
  const sop = typeof sopOrTitle === "string" ? { judul: sopOrTitle } : (sopOrTitle || {});
  const judul = sanitizeMermaidLabel(sop.judul || "Prosedur SOP", 100);
  let normalized = normalizeSteps(steps);
  if (!normalized.length) {
    normalized = normalizeSteps([
      { category: "START", nama_aktivitas: "Mulai Prosedur" },
      { category: "PROCESS", nama_aktivitas: "Proses Standar" },
      { category: "END", nama_aktivitas: "Selesai Prosedur" }
    ]);
  }

  const width = 760;
  const nodeWidth = 500;
  const centerX = width / 2;
  const nodeX = centerX - nodeWidth / 2;
  const gap = 46;
  const titleHeight = 34;
  const nodes = [];
  let cursorY = titleHeight + 14;

  normalized.forEach((step, index) => {
    const nameLines = wrapSvgText(step.nama_aktivitas || `Langkah ${index + 1}`, 48);
    const detailLines = step.detail_proses
      ? wrapSvgText(step.detail_proses, 62).slice(0, 2)
      : [];
    const allLines = [...nameLines, ...detailLines];
    let height = Math.max(70, 28 + allLines.length * 15);
    if (step.category === "DECISION") height = Math.max(112, height + 24);
    nodes.push({ step, index, y: cursorY, height, nameLines, detailLines });
    cursorY += height + gap;
  });

  const totalHeight = Math.max(180, cursorY - gap + 18);
  const defs = `
    <defs>
      <marker id="sop-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="#64748b"></path>
      </marker>
    </defs>`;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" role="img" aria-label="Flowchart ${escapeSvgText(judul)}" style="max-width:100%;height:auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">`,
    defs,
    `<text x="${centerX}" y="21" text-anchor="middle" font-size="13" font-weight="bold" fill="#334155">${escapeSvgText(judul)}</text>`
  ];

  nodes.forEach(({ step, index, y, height, nameLines, detailLines }) => {
    const category = normalizeCategory(step.category);
    const categoryLabel = SOP_STEP_CATEGORY_LABELS[category] || category;
    const next = nodes[index + 1];
    const centerY = y + height / 2;
    const textStartY = category === "DECISION"
      ? centerY - ((nameLines.length + detailLines.length) * 15) / 2 + 9
      : y + 24;

    if (next) {
      const lineY = y + height;
      parts.push(`<line x1="${centerX}" y1="${lineY}" x2="${centerX}" y2="${next.y - 3}" stroke="#64748b" stroke-width="1.5" marker-end="url(#sop-arrow)"></line>`);
      if (category === "DECISION") {
        parts.push(`<text x="${centerX + 12}" y="${lineY + 22}" font-size="10" font-weight="bold" fill="#047857">YA</text>`);
      }
    }

    if (category === "DECISION") {
      const points = `${centerX},${y} ${nodeX + nodeWidth},${centerY} ${centerX},${y + height} ${nodeX},${centerY}`;
      parts.push(`<polygon points="${points}" fill="#78350f" stroke="#d97706" stroke-width="1.5"></polygon>`);
    } else if (category === "DOKUMEN") {
      parts.push(`<rect x="${nodeX}" y="${y}" width="${nodeWidth}" height="${height}" rx="10" fill="#083344" stroke="#06b6d4" stroke-width="1.5"></rect>`);
      parts.push(`<path d="M${nodeX + 16},${y + 10} v${height - 20}" stroke="#22d3ee" stroke-width="2" stroke-dasharray="4 3"></path>`);
    } else if (category === "LAINNYA") {
      parts.push(`<rect x="${nodeX}" y="${y}" width="${nodeWidth}" height="${height}" rx="14" fill="#334155" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 4"></rect>`);
    } else if (category === "START" || category === "END") {
      parts.push(`<rect x="${nodeX}" y="${y}" width="${nodeWidth}" height="${height}" rx="${height / 2}" fill="${category === "START" ? "#047857" : "#b91c1c"}" stroke="${category === "START" ? "#10b981" : "#ef4444"}" stroke-width="1.5"></rect>`);
    } else {
      parts.push(`<rect x="${nodeX}" y="${y}" width="${nodeWidth}" height="${height}" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1.5"></rect>`);
    }

    parts.push(`<text x="${nodeX + 12}" y="${y + 14}" font-size="8.5" font-weight="bold" fill="#e2e8f0" opacity="0.72">${escapeSvgText(categoryLabel)}</text>`);

    const nameAnchor = category === "DECISION" ? "middle" : "start";
    const nameX = category === "DECISION" ? centerX : nodeX + 24;
    parts.push(`<text x="${nameX}" y="${textStartY}" text-anchor="${nameAnchor}" font-size="12.5" font-weight="bold" fill="#f8fafc">${escapeSvgText(nameLines[0] || "-")}</text>`);
    nameLines.slice(1).forEach((line, lineIndex) => {
      parts.push(`<text x="${nameX}" y="${textStartY + (lineIndex + 1) * 15}" text-anchor="${nameAnchor}" font-size="12.5" font-weight="bold" fill="#f8fafc">${escapeSvgText(line)}</text>`);
    });
    const detailStart = textStartY + nameLines.length * 15;
    detailLines.forEach((line, lineIndex) => {
      parts.push(`<text x="${nameX}" y="${detailStart + lineIndex * 14}" text-anchor="${nameAnchor}" font-size="10.5" fill="#e2e8f0" opacity="0.85">${escapeSvgText(line)}</text>`);
    });
    if (step.actor) {
      parts.push(`<text x="${nameX}" y="${y + height - 10}" text-anchor="${nameAnchor}" font-size="10" font-style="italic" fill="#cbd5e1">${escapeSvgText(step.actor)}</text>`);
    }
  });

  parts.push("</svg>");
  return parts.join("\n");
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
