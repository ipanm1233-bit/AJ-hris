/**
 * Mesin KPI Andela Jaya 2027.
 *
 * Modul ini murni (tanpa DOM/Firestore) agar formula, validasi bobot, status
 * PENDING, dan pembatasan skor dapat diuji otomatis. Semua angka target dan
 * bobot berasal dari paket dokumen KPI 2027 versi 0.1 DRAFT dan WAJIB
 * divalidasi manajemen sebelum dipakai sebagai dasar keputusan.
 */

export const KPI_2027_VERSION = "2027.0-draft";
export const KPI_2027_LABEL = "Draft KPI 2027 — target dan bobot usulan, menunggu pengesahan manajemen.";
export const MAX_INDICATOR_SCORE = 120;
export const MIN_INDICATOR_SCORE = 0;
export const REQUIRED_TOTAL_WEIGHT = 100;
export const WEIGHT_TOLERANCE = 0.01;

export const KPI_DIRECTIONS = Object.freeze({
  HIGHER_BETTER: "HIGHER_BETTER",
  LOWER_BETTER: "LOWER_BETTER",
  BINARY: "BINARY",
  MILESTONE: "MILESTONE",
  RATIO_TO_BUDGET: "RATIO_TO_BUDGET"
});

export const KPI_DIRECTION_LABELS = Object.freeze({
  HIGHER_BETTER: "Semakin tinggi semakin baik",
  LOWER_BETTER: "Semakin rendah semakin baik",
  BINARY: "Biner / kepatuhan",
  MILESTONE: "Milestone",
  RATIO_TO_BUDGET: "Rasio terhadap anggaran"
});

export const KPI_ITEM_STATUS = Object.freeze({
  PENDING: "PENDING",
  SCORED: "SCORED",
  INVALID: "INVALID",
  EXEMPT: "EXEMPT"
});

export const KPI_SCORECARD_STATUS = Object.freeze([
  "DRAFT",
  "SUBMITTED",
  "SUPERVISOR_REVIEW",
  "HR_VALIDATION",
  "CALIBRATION",
  "APPROVED",
  "LOCKED",
  "CORRECTION_REQUESTED",
  "CANCELLED"
]);

export const KPI_SCORECARD_STATUS_LABELS = Object.freeze({
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  SUPERVISOR_REVIEW: "Review Atasan",
  HR_VALIDATION: "Validasi HR",
  CALIBRATION: "Kalibrasi",
  APPROVED: "Disetujui",
  LOCKED: "Terkunci",
  CORRECTION_REQUESTED: "Minta Koreksi",
  CANCELLED: "Dibatalkan"
});

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.includes(",") && !trimmed.includes(".")
      ? trimmed.replace(",", ".")
      : trimmed;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDirection(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!raw) return KPI_DIRECTIONS.HIGHER_BETTER;
  if (["HIGHER", "HIGHER_BETTER", "HIGHER_IS_BETTER", "NAIK", "POSITIF"].includes(raw)) return KPI_DIRECTIONS.HIGHER_BETTER;
  if (["LOWER", "LOWER_BETTER", "LOWER_IS_BETTER", "TURUN", "NEGATIF"].includes(raw)) return KPI_DIRECTIONS.LOWER_BETTER;
  if (["BINARY", "BINER", "COMPLIANCE", "KEPATUHAN"].includes(raw)) return KPI_DIRECTIONS.BINARY;
  if (["MILESTONE", "MILESTONES", "TAHAPAN"].includes(raw)) return KPI_DIRECTIONS.MILESTONE;
  if (["RATIO_TO_BUDGET", "RATIO_BUDGET", "BUDGET", "ANGGARAN"].includes(raw)) return KPI_DIRECTIONS.RATIO_TO_BUDGET;
  return KPI_DIRECTIONS.HIGHER_BETTER;
}

export function formatKpiValue(value, unit = "") {
  const number = toNumber(value);
  if (number === null) return "-";
  const formatted = Number.isInteger(number)
    ? number.toLocaleString("id-ID")
    : number.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function validateWeights(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    return { valid: false, total: 0, message: "Scorecard belum memiliki indikator." };
  }
  let total = 0;
  for (const item of rows) {
    const weight = toNumber(item?.weight_percent ?? item?.bobot ?? item?.weight);
    if (weight === null) {
      return { valid: false, total, message: `Bobot indikator ${item?.kpi_code || item?.kpi_name || "tanpa nama"} belum diisi.` };
    }
    if (weight < 0) {
      return { valid: false, total, message: "Bobot indikator tidak boleh negatif." };
    }
    total += weight;
  }
  total = round2(total);
  if (Math.abs(total - REQUIRED_TOTAL_WEIGHT) > WEIGHT_TOLERANCE) {
    return {
      valid: false,
      total,
      message: `Total bobot harus 100%. Saat ini ${total}%. Pengesahan ditolak sampai bobot diperbaiki.`
    };
  }
  return { valid: true, total, message: "Total bobot 100%." };
}

/**
 * Hitung skor satu indikator sesuai KPI_DICTIONARY.md.
 * Data kosong selalu PENDING, bukan otomatis 0 atau 100.
 */
export function scoreIndicator(input = {}) {
  const direction = normalizeDirection(input.direction || input.measurement_direction || input.formula_type);
  const cap = clamp(toNumber(input.capScore ?? input.cap_score) ?? MAX_INDICATOR_SCORE, MIN_INDICATOR_SCORE, MAX_INDICATOR_SCORE);
  const target = toNumber(input.target ?? input.target_value);
  const actual = toNumber(input.actual ?? input.actual_value);
  const zeroActualScore = toNumber(input.zero_actual_score ?? input.zeroActualScore);
  const zeroTargetScore = toNumber(input.zero_target_score ?? input.zeroTargetScore);

  if (actual === null) {
    return {
      score: null,
      raw_score: null,
      status: KPI_ITEM_STATUS.PENDING,
      direction,
      target,
      actual,
      cap_score: cap,
      reason: "Aktual belum tersedia. Data kosong tidak dianggap nol atau 100."
    };
  }
  if (target === null) {
    return {
      score: null,
      raw_score: null,
      status: KPI_ITEM_STATUS.PENDING,
      direction,
      target,
      actual,
      cap_score: cap,
      reason: "Target belum ditetapkan untuk periode ini."
    };
  }
  if (target < 0 || actual < 0) {
    return {
      score: null,
      raw_score: null,
      status: KPI_ITEM_STATUS.INVALID,
      direction,
      target,
      actual,
      cap_score: cap,
      reason: "Target dan aktual tidak boleh negatif."
    };
  }
  if (target === 0) {
    if (zeroTargetScore !== null) {
      const capped = clamp(zeroTargetScore, MIN_INDICATOR_SCORE, cap);
      return {
        score: round2(capped),
        raw_score: round2(zeroTargetScore),
        status: KPI_ITEM_STATUS.SCORED,
        direction,
        target,
        actual,
        cap_score: cap,
        capped: zeroTargetScore > cap,
        reason: "Target nol memakai aturan khusus indikator."
      };
    }
    return {
      score: null,
      raw_score: null,
      status: KPI_ITEM_STATUS.PENDING,
      direction,
      target,
      actual,
      cap_score: cap,
      needs_rule: true,
      reason: "Target nol memerlukan aturan khusus yang disepakati sebelum periode."
    };
  }

  let rawScore = null;
  let reason = "";

  if (direction === KPI_DIRECTIONS.BINARY) {
    // Nilai biner: 1/100 = terpenuhi, 0 = tidak terpenuhi. Nilai antara
    // diperlakukan sebagai skala kepatuhan 0-100.
    rawScore = actual >= 100 ? 100 : actual >= 1 ? 100 : 0;
    reason = "Kepatuhan biner: terpenuhi = 100, tidak terpenuhi = 0.";
  } else if (direction === KPI_DIRECTIONS.MILESTONE) {
    rawScore = (actual / target) * 100;
    reason = "Persentase milestone tervalidasi dibanding milestone rencana.";
  } else if (direction === KPI_DIRECTIONS.LOWER_BETTER) {
    if (actual === 0) {
      if (zeroActualScore === null) {
        return {
          score: null,
          raw_score: null,
          status: KPI_ITEM_STATUS.PENDING,
          direction,
          target,
          actual,
          cap_score: cap,
          needs_rule: true,
          reason: "Aktual nol pada indikator lower-is-better memerlukan aturan khusus, bukan pembagian matematis."
        };
      }
      rawScore = zeroActualScore;
      reason = "Aktual nol memakai aturan khusus indikator.";
    } else {
      rawScore = (target / actual) * 100;
      reason = "Skor = target ÷ aktual × 100.";
    }
  } else {
    // HIGHER_BETTER dan RATIO_TO_BUDGET.
    rawScore = (actual / target) * 100;
    reason = "Skor = aktual ÷ target × 100.";
  }

  if (!Number.isFinite(rawScore)) {
    return {
      score: null,
      raw_score: null,
      status: KPI_ITEM_STATUS.INVALID,
      direction,
      target,
      actual,
      cap_score: cap,
      reason: "Formula tidak menghasilkan angka yang valid."
    };
  }

  const capped = clamp(rawScore, MIN_INDICATOR_SCORE, cap);
  return {
    score: round2(capped),
    raw_score: round2(rawScore),
    status: KPI_ITEM_STATUS.SCORED,
    direction,
    target,
    actual,
    cap_score: cap,
    capped: rawScore > cap,
    reason: rawScore > cap ? `${reason} Skor dibatasi maksimum ${cap}.` : reason
  };
}

export function calculateScorecard(items = [], options = {}) {
  const rows = Array.isArray(items) ? items : [];
  const weightCheck = validateWeights(rows);
  const scoredItems = [];
  const pendingItems = [];
  const invalidItems = [];

  rows.forEach((item, index) => {
    const computed = item?.status === KPI_ITEM_STATUS.EXEMPT
      ? { ...item, status: KPI_ITEM_STATUS.EXEMPT, score: null, weighted_score: 0 }
      : { ...item, ...scoreIndicator(item) };
    const row = { ...computed, index };
    if (row.status === KPI_ITEM_STATUS.SCORED && Number.isFinite(Number(row.score))) {
      row.weighted_score = round2(Number(row.score) * (toNumber(row.weight_percent ?? row.bobot ?? row.weight) || 0) / 100);
      scoredItems.push(row);
    } else if (row.status === KPI_ITEM_STATUS.INVALID) {
      invalidItems.push(row);
    } else if (row.status !== KPI_ITEM_STATUS.EXEMPT) {
      pendingItems.push(row);
    }
  });

  const totalWeight = weightCheck.total;
  const availableWeight = round2(scoredItems.reduce((sum, item) => sum + (toNumber(item.weight_percent ?? item.bobot ?? item.weight) || 0), 0));
  const weightedTotal = round2(scoredItems.reduce((sum, item) => sum + item.weighted_score, 0));
  const provisionalScore = availableWeight > 0 ? round2(weightedTotal / (availableWeight / 100)) : null;
  const complete = pendingItems.length === 0 && invalidItems.length === 0 && weightCheck.valid;
  const finalScore = complete ? round2(clamp(weightedTotal, MIN_INDICATOR_SCORE, MAX_INDICATOR_SCORE)) : null;
  let status = "SCORED";
  if (invalidItems.length) status = "INVALID";
  else if (pendingItems.length) status = KPI_ITEM_STATUS.PENDING;
  else if (!weightCheck.valid) status = "WEIGHT_INVALID";

  return {
    status,
    total_weight: totalWeight,
    available_weight: availableWeight,
    weighted_total: weightedTotal,
    final_score: finalScore,
    provisional_score: finalScore === null ? provisionalScore : finalScore,
    provisional: !complete,
    score: finalScore === null ? provisionalScore : finalScore,
    rating: getProposedRating(finalScore === null ? provisionalScore : finalScore, { provisional: !complete }),
    items: [...scoredItems, ...pendingItems, ...invalidItems].sort((a, b) => a.index - b.index),
    scored_items: scoredItems,
    pending_items: pendingItems,
    invalid_items: invalidItems,
    weight_check: weightCheck
  };
}

/**
 * Predikat usulan. Bukan keputusan kompensasi/disiplin otomatis.
 */
export function getProposedRating(score, { provisional = false } = {}) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return { label: "PENDING", tone: "slate", provisional, note: "Belum ada nilai akhir." };
  }
  const value = Number(score);
  if (value >= 110) return { label: "Sangat Baik", tone: "emerald", provisional, note: "Usulan predikat, menunggu kalibrasi." };
  if (value >= 100) return { label: "Baik", tone: "blue", provisional, note: "Usulan predikat, menunggu kalibrasi." };
  if (value >= 90) return { label: "Cukup", tone: "amber", provisional, note: "Usulan predikat, menunggu kalibrasi." };
  return { label: "Perlu Perbaikan", tone: "rose", provisional, note: "Perlu coaching, bukan sanksi otomatis." };
}

export function validateScorecardForApproval(scorecard = {}) {
  const items = Array.isArray(scorecard.items) ? scorecard.items : [];
  const errors = [];
  const weightCheck = validateWeights(items);
  if (!weightCheck.valid) errors.push(weightCheck.message);

  const calculation = calculateScorecard(items);
  if (calculation.pending_items.length) {
    errors.push(`${calculation.pending_items.length} indikator masih PENDING. Lengkapi aktual, target, atau aturan khusus sebelum disahkan.`);
  }
  if (calculation.invalid_items.length) {
    errors.push(`${calculation.invalid_items.length} indikator memiliki data tidak valid.`);
  }

  items.forEach(item => {
    const label = item.kpi_code || item.kpi_name || "Indikator";
    if (toNumber(item.target ?? item.target_value) === null) errors.push(`${label}: target belum diisi.`);
    if (toNumber(item.actual ?? item.actual_value) === null) errors.push(`${label}: aktual belum diisi.`);
    const evidence = item.evidence_reference || item.evidence || item.bukti;
    if (!String(evidence || "").trim()) errors.push(`${label}: bukti/rujukan data aktual wajib dicantumkan.`);
  });

  if (String(scorecard.status || "").toUpperCase() === "LOCKED") {
    errors.push("Nilai sudah LOCKED. Perubahan harus melalui alur correction request dan audit trail.");
  }

  return {
    valid: errors.length === 0,
    errors,
    calculation,
    weight_check: weightCheck
  };
}

export function aggregateBranchResults(branches = []) {
  const rows = (Array.isArray(branches) ? branches : [])
    .map(row => ({ branch: row.branch || row.cabang || "", target: toNumber(row.target), actual: toNumber(row.actual) }))
    .filter(row => row.target !== null && row.target >= 0 && row.actual !== null && row.actual >= 0);
  const target = round2(rows.reduce((sum, row) => sum + row.target, 0));
  const actual = round2(rows.reduce((sum, row) => sum + row.actual, 0));
  const score = target > 0 ? round2(clamp((actual / target) * 100, MIN_INDICATOR_SCORE, MAX_INDICATOR_SCORE)) : null;
  return {
    branches: rows,
    target,
    actual,
    score,
    method: "Agregasi berbobot target, bukan rata-rata sederhana antar-cabang.",
    status: score === null ? KPI_ITEM_STATUS.PENDING : KPI_ITEM_STATUS.SCORED
  };
}

function normalizePosition(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveTemplateForEmployee(employee = {}, templates = []) {
  const position = normalizePosition(employee.jabatan || employee.posisi || employee.position_name || employee.position || "");
  const branch = normalizePosition(employee.cabang || employee.branch || "");
  if (!position) return null;
  const rows = Array.isArray(templates) ? templates : [];

  const named = (id) => rows.find(template => template.template_id === id) || null;

  // Aturan eksplisit lebih dulu agar jabatan gabungan seperti
  // "Sales Supervisor Cirebon–Malang" tidak jatuh ke template Salesman.
  if (/GENERAL MANAGER|\bGM\b/.test(position)) return named("TPL-GM");
  if (/SALES SUPERVISOR|SUPERVISOR SALES|SPV SALES|KORLAP|KOORDINATOR SALES/.test(position)) return named("TPL-SS");
  if (/SPV ADMIN|SUPERVISOR ADMIN/.test(position)) return named("TPL-AM");
  if (/ADMIN SALES|SALES ADMIN|ADMINISTRASI SALES/.test(position)) {
    return branch.includes("MALANG") ? named("TPL-AS") : named("TPL-SA");
  }
  if (/SPV WAREHOUSE|SUPERVISOR WAREHOUSE|SUPERVISOR GUDANG|SPV GUDANG/.test(position)) return named("TPL-WH");
  if (/STAFF WAREHOUSE|WAREHOUSE STAFF|STAFF GUDANG|STAF GUDANG/.test(position)) return named("TPL-WS");
  if (/DRIVER|SOPIR|PENGEMUDI/.test(position)) return named("TPL-DR");
  if (/RECRUIT|REKRUT/.test(position)) return named("TPL-REC");
  if (/FINANCE|AKUNTANSI|ACCOUNTING|KEUANGAN/.test(position)) return named("TPL-FA");
  if (/HUMAN RESOURCE|HRGA|PERSONALIA|\bHR\b/.test(position)) return named("TPL-HR");
  if (/SALESMAN|SALES MAN|SALES EXECUTIVE|SALES/.test(position)) return named("TPL-SL");

  let best = null;
  let bestScore = 0;
  for (const template of rows) {
    const aliases = [template.position_name, ...(Array.isArray(template.aliases) ? template.aliases : [])]
      .map(normalizePosition)
      .filter(Boolean);
    for (const alias of aliases) {
      if (position === alias) return template;
      if (position.includes(alias) || alias.includes(position)) {
        const score = alias.length;
        if (score > bestScore) {
          best = template;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

export function buildScorecardFromTemplate(template, employee = {}, period = {}) {
  const items = (Array.isArray(template?.items) ? template.items : []).map(item => ({
    kpi_code: item.kpi_code,
    kpi_name: item.kpi_name,
    definition: item.definition || "",
    weight_percent: toNumber(item.weight_percent) || 0,
    target_value: item.target_value ?? null,
    target_label: item.target_label || "",
    target_unit: item.target_unit || "%",
    measurement_direction: normalizeDirection(item.measurement_direction),
    formula_type: item.formula_type || "",
    data_source: item.data_source || "",
    data_owner_role: item.data_owner_role || "",
    cap_score: item.cap_score ?? MAX_INDICATOR_SCORE,
    zero_actual_score: item.zero_actual_score ?? null,
    zero_target_score: item.zero_target_score ?? null,
    notes: item.notes || "",
    actual_value: null,
    evidence_reference: "",
    score: null,
    status: KPI_ITEM_STATUS.PENDING,
    weighted_score: null
  }));
  return {
    template_id: template?.template_id || "",
    template_name: template?.position_name || "",
    position_id: template?.position_id || "",
    position_name: template?.position_name || employee.jabatan || employee.posisi || "",
    scope: template?.scope || "POSITION",
    period_year: Number(period.period_year || period.year || 2027),
    period_label: period.period_label || `Tahun ${period.period_year || period.year || 2027}`,
    period_start: period.period_start || "",
    period_end: period.period_end || "",
    employee_id: employee.id || employee.employee_id || employee.nik_karyawan || employee.nik || "",
    employee_nik: employee.nik_karyawan || employee.nik || "",
    employee_name: employee.nama_karyawan || employee.nama || "",
    branch: employee.cabang || employee.branch || "",
    department: employee.divisi || employee.departemen || employee.department || "",
    position: employee.jabatan || employee.posisi || "",
    supervisor_nik: employee.nik_atasan || "",
    supervisor_name: employee.atasan || "",
    status: "DRAFT",
    items,
    final_score: null,
    rating: "PENDING",
    created_at: new Date().toISOString()
  };
}

export function summarizeScorecard(scorecard = {}) {
  const calculation = calculateScorecard(scorecard.items || []);
  const status = String(scorecard.status || "DRAFT").toUpperCase();
  return {
    ...calculation,
    status,
    status_label: KPI_SCORECARD_STATUS_LABELS[status] || status,
    employee_name: scorecard.employee_name || scorecard.nama_karyawan || "",
    employee_nik: scorecard.employee_nik || scorecard.nik || "",
    position: scorecard.position || scorecard.jabatan || "",
    branch: scorecard.branch || scorecard.cabang || "",
    period_label: scorecard.period_label || scorecard.periode || "",
    pending_count: calculation.pending_items.length
  };
}

/* -------------------------------------------------------------------------
 * Paket seed KPI 2027 (DRAFT)
 * ----------------------------------------------------------------------- */

function item(code, name, weight, target, options = {}) {
  return {
    kpi_code: code,
    kpi_name: name,
    weight_percent: weight,
    target_value: target,
    target_label: options.target_label || String(target),
    target_unit: options.unit || "%",
    measurement_direction: options.direction || KPI_DIRECTIONS.HIGHER_BETTER,
    formula_type: options.formula || "RASIO",
    data_source: options.source || "Laporan operasional",
    data_owner_role: options.owner || "Atasan langsung",
    definition: options.definition || `${name} diukur sesuai definisi operasional yang disepakati sebelum periode.`,
    cap_score: options.cap ?? MAX_INDICATOR_SCORE,
    zero_actual_score: options.zero_actual_score ?? null,
    zero_target_score: options.zero_target_score ?? null,
    notes: options.notes || ""
  };
}

const corporateItems = [
  item("COR-01", "Pencapaian omzet", 25, 100, { target_label: "100% budget", source: "Sales report/Finance", owner: "Sales/Finance", definition: "Penjualan bersih yang diakui sesuai kebijakan perusahaan dibanding target anggaran." }),
  item("COR-02", "Pencapaian gross profit", 20, 100, { target_label: "100% budget", source: "Laporan laba rugi", owner: "Finance", definition: "Laba kotor aktual dibanding target laba kotor." }),
  item("COR-03", "Pengendalian biaya operasional", 10, 100, { target_label: "Maks. 100% budget", direction: KPI_DIRECTIONS.LOWER_BETTER, source: "Finance", owner: "Finance", definition: "Biaya aktual dibanding anggaran yang disetujui; skor = anggaran ÷ aktual × 100." }),
  item("COR-04", "Pertumbuhan pelanggan aktif", 10, 10, { target_label: "+10% tahunan", unit: "% pertumbuhan", source: "Sales", owner: "Sales", definition: "(Pelanggan aktif akhir − baseline) ÷ baseline × 100." }),
  item("COR-05", "Pengendalian piutang", 10, 100, { target_label: "Sesuai aging target", source: "AR aging/receipt", owner: "Finance/Sales", definition: "Nilai tagihan jatuh tempo yang tertagih dibanding total tagihan jatuh tempo." }),
  item("COR-06", "Akurasi persediaan", 10, 99, { target_label: "≥99%", source: "Stock opname", owner: "Warehouse", definition: "SKU-lokasi yang cocok secara fisik dan sistem dibanding yang diperiksa." }),
  item("COR-07", "Rata-rata pencapaian KPI departemen", 10, 90, { target_label: "≥90", unit: "poin", source: "KPI tracker", owner: "HR", definition: "Rata-rata skor KPI departemen yang telah divalidasi." }),
  item("COR-08", "Pelaksanaan program strategis", 5, 90, { target_label: "≥90%", source: "Program tracker", owner: "GM/HR", definition: "Milestone program strategis yang selesai dan tervalidasi dibanding rencana." })
];

function mirrorItems(prefix, sourceItems) {
  return sourceItems.map((source, index) => ({
    ...source,
    kpi_code: `${prefix}${String(index + 1).padStart(2, "0")}`,
    kpi_name: source.kpi_name
  }));
}

export const KPI_SCORECARD_TEMPLATES_SEED = Object.freeze([
  {
    template_id: "TPL-COR",
    position_id: "CORPORATE",
    position_name: "Corporate",
    scope: "CORPORATE",
    aliases: ["CORPORATE", "PERUSAHAAN"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: corporateItems
  },
  {
    template_id: "TPL-GM",
    position_id: "GENERAL_MANAGER",
    position_name: "General Manager",
    scope: "POSITION",
    aliases: ["GENERAL MANAGER", "GM"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: mirrorItems("GM", corporateItems)
  },
  {
    template_id: "TPL-SS",
    position_id: "SALES_SUPERVISOR",
    position_name: "Sales Supervisor",
    scope: "POSITION",
    aliases: ["SALES SUPERVISOR", "SPV SALES", "SUPERVISOR SALES", "KORLAP", "KOORDINATOR SALES"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    notes: "Satu Supervisor gabungan Cirebon–Malang. Hasil per cabang ditampilkan terpisah; skor gabungan memakai pembobotan target.",
    items: [
      item("SS01", "Pencapaian omzet gabungan", 25, 100, { target_label: "≥100% budget", source: "Sales report/Finance", owner: "Sales/Finance", definition: "Omzet gabungan Cirebon dan Malang dibanding total target anggaran." }),
      item("SS02", "Pencapaian gross profit", 15, 100, { target_label: "≥100% budget", source: "Laporan laba rugi", owner: "Finance", definition: "Gross profit aktual dibanding target gross profit." }),
      item("SS03", "Pertumbuhan pelanggan aktif", 10, 10, { target_label: "≥10%", unit: "% pertumbuhan", source: "Customer/order master", owner: "Sales", definition: "Pertumbuhan pelanggan aktif dibanding baseline." }),
      item("SS04", "Produktivitas kunjungan Sales", 10, 90, { target_label: "≥90% target", source: "Visit report", owner: "Sales", definition: "Kunjungan produktif aktual dibanding target kunjungan." }),
      item("SS05", "Pencapaian penagihan/piutang", 10, 95, { target_label: "≥95% target", source: "AR aging/receipt", owner: "Finance/Sales", definition: "Tagihan jatuh tempo yang tertagih dibanding total jatuh tempo." }),
      item("SS06", "Monitoring dan coaching Sales", 15, 100, { target_label: "100% jadwal", source: "Coaching log", owner: "Sales Supervisor", definition: "Jadwal monitoring/coaching yang terlaksana dan terdokumentasi." }),
      item("SS07", "Akurasi dan ketepatan laporan", 10, 98, { target_label: "≥98%", source: "Laporan penjualan", owner: "Sales Supervisor", definition: "Laporan yang akurat dan tepat waktu dibanding laporan wajib." }),
      item("SS08", "Pengembangan kompetensi tim", 5, 90, { target_label: "≥90% program", source: "Training log", owner: "HR/Sales", definition: "Program pengembangan tim yang terlaksana dibanding rencana." })
    ]
  },
  {
    template_id: "TPL-SL",
    position_id: "SALESMAN",
    position_name: "Salesman",
    scope: "POSITION",
    aliases: ["SALESMAN", "SALES EXECUTIVE", "SALES"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    notes: "Target 12 kunjungan/hari adalah baseline yang masih harus diuji, bukan ketentuan final.",
    items: [
      item("SL01", "Pencapaian omzet individu", 30, 100, { target_label: "≥100% target", source: "Sales report", owner: "Sales", definition: "Omzet individu dibanding target individu." }),
      item("SL02", "Pencapaian gross profit", 15, 100, { target_label: "≥100% target", source: "Laporan laba rugi", owner: "Finance", definition: "Gross profit individu dibanding target." }),
      item("SL03", "Kunjungan produktif", 15, 90, { target_label: "≥90% target", source: "Visit report", owner: "Sales", definition: "Kunjungan dengan interaksi bisnis terdokumentasi dibanding target." }),
      item("SL04", "Akuisisi pelanggan baru aktif", 10, 100, { target_label: "Sesuai target area", source: "Customer/order master", owner: "Sales", definition: "Pelanggan baru aktif dibanding target area." }),
      item("SL05", "Retensi pelanggan", 10, 95, { target_label: "≥95%", source: "Customer/order master", owner: "Sales", definition: "Pelanggan awal periode yang tetap aktif di akhir periode." }),
      item("SL06", "Pencapaian penagihan", 10, 95, { target_label: "≥95% target", source: "AR aging/receipt", owner: "Finance/Sales", definition: "Tagihan jatuh tempo yang tertagih dibanding total jatuh tempo." }),
      item("SL07", "Akurasi laporan kunjungan", 10, 98, { target_label: "≥98%", source: "Visit report", owner: "Sales Supervisor", definition: "Laporan kunjungan yang akurat dan lengkap dibanding sampel." })
    ]
  },
  {
    template_id: "TPL-SA",
    position_id: "SALES_ADMINISTRATION",
    position_name: "Sales Administration",
    scope: "POSITION",
    aliases: ["SALES ADMINISTRATION", "ADMINISTRASI SALES", "SALES ADMIN", "ADMIN SALES"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: [
      item("SA01", "Akurasi input pesanan", 25, 99, { target_label: "≥99%", source: "Order/admin log", owner: "Sales Administration", definition: "Input pesanan benar dibanding sampel/total yang diperiksa." }),
      item("SA02", "Ketepatan pemrosesan pesanan", 20, 95, { target_label: "≥95% SLA", source: "Order timestamps", owner: "Sales Administration", definition: "Pesanan selesai dalam SLA dibanding pesanan jatuh tempo." }),
      item("SA03", "Akurasi dokumen penjualan", 15, 99, { target_label: "≥99%", source: "Dokumen transaksi", owner: "Sales Administration", definition: "Dokumen benar dan lengkap dibanding dokumen yang diperiksa." }),
      item("SA04", "Ketepatan laporan penjualan", 15, 100, { target_label: "100%", source: "Laporan penjualan", owner: "Sales Administration", definition: "Laporan penjualan tepat waktu dan lengkap." }),
      item("SA05", "Penanganan retur/koreksi administrasi", 10, 95, { target_label: "≥95% SLA", source: "Retur log", owner: "Sales Administration", definition: "Retur/koreksi selesai dalam SLA dibanding yang jatuh tempo." }),
      item("SA06", "Kelengkapan arsip transaksi", 10, 98, { target_label: "≥98%", source: "Arsip transaksi", owner: "Sales Administration", definition: "Arsip transaksi lengkap dibanding sampel yang diperiksa." }),
      item("SA07", "Penyelesaian permintaan internal", 5, 95, { target_label: "≥95% SLA", source: "Ticket/request log", owner: "Sales Administration", definition: "Permintaan internal selesai dalam SLA." })
    ]
  },
  {
    template_id: "TPL-AM",
    position_id: "SPV_ADMIN_MALANG",
    position_name: "SPV Admin Malang",
    scope: "POSITION",
    aliases: ["SPV ADMIN MALANG", "SUPERVISOR ADMIN MALANG", "SPV ADMIN", "SUPERVISOR ADMIN"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: [
      item("AM01", "Akurasi administrasi penjualan", 20, 99, { target_label: "≥99%", source: "Order/admin log", owner: "SPV Admin", definition: "Administrasi penjualan benar dibanding sampel." }),
      item("AM02", "Verifikasi order dan diskon CSA", 15, 100, { target_label: "100% sesuai ketentuan", source: "Order approval log", owner: "SPV Admin", definition: "Order dan diskon yang diverifikasi sesuai ketentuan." }),
      item("AM03", "Pengelolaan retur RFW", 10, 98, { target_label: "≥98% SLA", source: "Retur log", owner: "SPV Admin", definition: "Retur RFW selesai dalam SLA." }),
      item("AM04", "Akurasi stock opname/rekonsiliasi", 15, 99, { target_label: "≥99%", source: "Stock opname", owner: "SPV Admin", definition: "Hasil stock opname/rekonsiliasi akurat dibanding pemeriksaan." }),
      item("AM05", "Akurasi perhitungan insentif Sales", 10, 99, { target_label: "≥99%", source: "Payroll/insentif", owner: "SPV Admin", definition: "Perhitungan insentif benar dibanding sampel." }),
      item("AM06", "Ketepatan laporan absensi dan izin", 10, 100, { target_label: "100%", source: "Absensi/izin", owner: "SPV Admin", definition: "Laporan absensi dan izin tepat waktu." }),
      item("AM07", "Kelengkapan data/dokumen karyawan", 10, 98, { target_label: "≥98%", source: "HR admin", owner: "SPV Admin", definition: "Data/dokumen karyawan lengkap dibanding sampel." }),
      item("AM08", "Supervisi dan pembagian pekerjaan Admin", 10, 90, { target_label: "≥90%", source: "Supervisi log", owner: "SPV Admin", definition: "Aktivitas supervisi dan pembagian pekerjaan terlaksana." })
    ]
  },
  {
    template_id: "TPL-AS",
    position_id: "ADMIN_SALES_MALANG",
    position_name: "Admin Sales Malang",
    scope: "POSITION",
    aliases: ["ADMIN SALES MALANG", "ADMIN SALES", "SALES ADMIN MALANG"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: [
      item("AS01", "Akurasi input order", 25, 99, { target_label: "≥99%", source: "Order/admin log", owner: "Admin Sales", definition: "Input order benar dibanding sampel." }),
      item("AS02", "Ketepatan proses administrasi", 20, 95, { target_label: "≥95% SLA", source: "Order timestamps", owner: "Admin Sales", definition: "Proses administrasi selesai dalam SLA." }),
      item("AS03", "Akurasi administrasi retur", 15, 99, { target_label: "≥99%", source: "Retur log", owner: "Admin Sales", definition: "Administrasi retur akurat dibanding sampel." }),
      item("AS04", "Ketepatan laporan penjualan", 15, 100, { target_label: "100%", source: "Laporan penjualan", owner: "Admin Sales", definition: "Laporan penjualan tepat waktu." }),
      item("AS05", "Akurasi data insentif", 10, 99, { target_label: "≥99%", source: "Payroll/insentif", owner: "Admin Sales", definition: "Data insentif akurat dibanding sampel." }),
      item("AS06", "Kelengkapan arsip", 10, 98, { target_label: "≥98%", source: "Arsip transaksi", owner: "Admin Sales", definition: "Arsip transaksi lengkap." }),
      item("AS07", "Penyelesaian permintaan internal", 5, 95, { target_label: "≥95% SLA", source: "Ticket/request log", owner: "Admin Sales", definition: "Permintaan internal selesai dalam SLA." })
    ]
  },
  {
    template_id: "TPL-WH",
    position_id: "SPV_WAREHOUSE",
    position_name: "SPV Warehouse",
    scope: "POSITION",
    aliases: ["SPV WAREHOUSE", "SUPERVISOR WAREHOUSE", "SPV GUDANG", "SUPERVISOR GUDANG"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: [
      item("WH01", "Akurasi stok fisik dan sistem", 25, 99, { target_label: "≥99%", source: "Stock opname", owner: "SPV Warehouse", definition: "SKU-lokasi cocok antara fisik dan sistem." }),
      item("WH02", "Ketepatan pemenuhan pesanan", 20, 98, { target_label: "≥98%", source: "Order & delivery", owner: "SPV Warehouse", definition: "Pesanan lengkap dan tepat waktu dibanding pesanan jatuh tempo." }),
      item("WH03", "Barang rusak/hilang terhadap rata-rata nilai stok", 15, 0.2, { target_label: "≤0,2%", unit: "% nilai stok", direction: KPI_DIRECTIONS.LOWER_BETTER, source: "Inventory adjustment", owner: "SPV Warehouse", definition: "Nilai barang rusak/hilang dibanding rata-rata nilai persediaan.", zero_actual_score: MAX_INDICATOR_SCORE }),
      item("WH04", "Ketepatan stock opname", 15, 100, { target_label: "100% jadwal", source: "Stock opname", owner: "SPV Warehouse", definition: "Stock opname terlaksana sesuai jadwal." }),
      item("WH05", "Produktivitas tim gudang", 10, 95, { target_label: "≥95% target", source: "Warehouse productivity log", owner: "SPV Warehouse", definition: "Produktivitas tim dibanding target." }),
      item("WH06", "Kerapian dan keamanan gudang", 10, 95, { target_label: "≥95% audit", source: "Audit gudang", owner: "SPV Warehouse", definition: "Skor audit kerapian dan keamanan gudang." }),
      item("WH07", "Ketepatan laporan gudang", 5, 100, { target_label: "100%", source: "Laporan gudang", owner: "SPV Warehouse", definition: "Laporan gudang tepat waktu." })
    ]
  },
  {
    template_id: "TPL-WS",
    position_id: "STAFF_WAREHOUSE",
    position_name: "Staff Warehouse",
    scope: "POSITION",
    aliases: ["STAFF WAREHOUSE", "WAREHOUSE STAFF", "STAFF GUDANG", "STAF GUDANG"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: [
      item("WS01", "Akurasi picking barang", 25, 99, { target_label: "≥99%", source: "Picking checklist", owner: "Staff Warehouse", definition: "Item yang benar dibanding total item yang dipicking." }),
      item("WS02", "Ketepatan persiapan pesanan", 20, 98, { target_label: "≥98%", source: "Order & delivery", owner: "Staff Warehouse", definition: "Persiapan pesanan tepat waktu dibanding pesanan jatuh tempo." }),
      item("WS03", "Akurasi pencatatan perpindahan barang", 20, 99, { target_label: "≥99%", source: "Inventory log", owner: "Staff Warehouse", definition: "Pencatatan perpindahan barang akurat dibanding sampel." }),
      item("WS04", "Produktivitas pekerjaan", 15, 95, { target_label: "≥95% target", source: "Warehouse productivity log", owner: "Staff Warehouse", definition: "Produktivitas pekerjaan dibanding target." }),
      item("WS05", "Pemeliharaan kondisi barang", 10, 98, { target_label: "≥98%", source: "Audit gudang", owner: "Staff Warehouse", definition: "Kondisi barang terpelihara dibanding audit." }),
      item("WS06", "Kepatuhan SOP dan K3", 10, 95, { target_label: "≥95% audit", source: "Audit SOP/K3", owner: "Staff Warehouse", definition: "Kepatuhan SOP dan K3 dibanding audit." })
    ]
  },
  {
    template_id: "TPL-DR",
    position_id: "DRIVER",
    position_name: "Driver",
    scope: "POSITION",
    aliases: ["DRIVER", "SOPIR", "PENGEMUDI"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: [
      item("DR01", "Ketepatan waktu pengiriman", 25, 95, { target_label: "≥95%", source: "Surat jalan/POD", owner: "Driver", definition: "Pengiriman tiba sesuai slot/jadwal." }),
      item("DR02", "Ketepatan barang diterima pelanggan", 25, 99, { target_label: "≥99%", source: "Surat jalan/POD", owner: "Driver", definition: "Barang diterima lengkap dan sesuai dokumen." }),
      item("DR03", "Pengiriman selesai sesuai jadwal", 15, 98, { target_label: "≥98%", source: "Surat jalan/POD", owner: "Driver", definition: "Pengiriman selesai sesuai jadwal." }),
      item("DR04", "Kepatuhan keselamatan berkendara", 15, 100, { target_label: "100% checklist", source: "Checklist K3", owner: "Driver", definition: "Checklist keselamatan berkendara terpenuhi." }),
      item("DR05", "Pemeliharaan kendaraan", 10, 100, { target_label: "100% checklist", source: "Checklist kendaraan", owner: "Driver", definition: "Checklist pemeliharaan kendaraan terpenuhi." }),
      item("DR06", "Kelengkapan dokumen pengiriman", 10, 100, { target_label: "100%", source: "Dokumen pengiriman", owner: "Driver", definition: "Dokumen pengiriman lengkap." })
    ]
  },
  {
    template_id: "TPL-FA",
    position_id: "FINANCE_ACCOUNTING",
    position_name: "Finance & Accounting",
    scope: "FUNCTION",
    aliases: ["FINANCE", "ACCOUNTING", "AKUNTANSI", "KEUANGAN", "FINANCE & ACCOUNTING"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    notes: "Finance & Accounting dinilai sebagai satu fungsi gabungan.",
    items: [
      item("FA01", "Akurasi pencatatan keuangan", 20, 99, { target_label: "≥99%", source: "General ledger", owner: "Finance & Accounting", definition: "Pencatatan keuangan benar dibanding sampel." }),
      item("FA02", "Ketepatan laporan keuangan", 20, 100, { target_label: "100% jadwal", source: "Laporan keuangan", owner: "Finance & Accounting", definition: "Laporan keuangan tepat waktu." }),
      item("FA03", "Akurasi rekonsiliasi kas dan bank", 15, 100, { target_label: "100%", source: "Bank/cash reconciliation", owner: "Finance & Accounting", definition: "Pos rekonsiliasi sesuai bukti dan saldo." }),
      item("FA04", "Pengendalian piutang/aging", 15, 100, { target_label: "Sesuai target", source: "AR aging", owner: "Finance & Accounting", definition: "Piutang sesuai aging target." }),
      item("FA05", "Pengendalian cash flow", 10, 100, { target_label: "Sesuai proyeksi", source: "Cash flow report", owner: "Finance & Accounting", definition: "Cash flow sesuai proyeksi." }),
      item("FA06", "Pengendalian biaya operasional", 10, 100, { target_label: "≤ budget", direction: KPI_DIRECTIONS.LOWER_BETTER, source: "Finance", owner: "Finance & Accounting", definition: "Biaya aktual dibanding anggaran." }),
      item("FA07", "Kepatuhan pajak dan dokumen", 10, 100, { target_label: "100%", source: "Tax compliance register", owner: "Finance & Accounting", definition: "Kewajiban pajak dan dokumen terpenuhi tepat waktu." })
    ]
  },
  {
    template_id: "TPL-HR",
    position_id: "HR_GENERALIST",
    position_name: "HR Generalist / HRGA",
    scope: "FUNCTION",
    aliases: ["HR GENERALIST", "HRGA", "HUMAN RESOURCE", "PERSONALIA", "HR"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    notes: "Pembagian pekerjaan dua fungsi HR masih menunggu keputusan OD-06.",
    items: [
      item("HR01", "Kepatuhan ketenagakerjaan dan legal HR", 20, 100, { target_label: "100%", source: "Legal compliance register", owner: "HR", definition: "Kewajiban legal HR terpenuhi tepat waktu." }),
      item("HR02", "Akurasi data/administrasi karyawan", 10, 99, { target_label: "≥99%", source: "HR admin", owner: "HR", definition: "Data/administrasi karyawan akurat dibanding sampel." }),
      item("HR03", "Ketepatan kontrak dan administrasi BPJS", 15, 100, { target_label: "100% jadwal", source: "Contract register", owner: "HR", definition: "Kontrak dan BPJS diproses sebelum tenggat internal." }),
      item("HR04", "Pelaksanaan performance management", 15, 100, { target_label: "100% siklus", source: "KPI tracker", owner: "HR", definition: "Aktivitas siklus penilaian selesai sesuai kalender." }),
      item("HR05", "Training dan development", 10, 90, { target_label: "≥90% program", source: "TNA/training log", owner: "HR", definition: "Program pelatihan terlaksana dibanding program disetujui." }),
      item("HR06", "Penyelesaian masalah karyawan", 10, 95, { target_label: "≥95% SLA", source: "HR case log", owner: "HR", definition: "Kasus karyawan selesai sesuai SLA." }),
      item("HR07", "Monitoring absensi/kedisiplinan", 10, 100, { target_label: "100% jadwal", source: "Absensi", owner: "HR", definition: "Monitoring absensi dan kedisiplinan terlaksana sesuai jadwal." }),
      item("HR08", "Perbaikan proses HRGA", 10, 2, { target_label: "≥2 improvement/tahun", unit: "perbaikan", source: "Improvement register", owner: "HR", definition: "Perbaikan proses yang diterapkan dan mempunyai bukti dampak." })
    ]
  },
  {
    template_id: "TPL-REC",
    position_id: "RECRUITMENT_DEVELOPMENT",
    position_name: "Recruitment / Development Support",
    scope: "FUNCTION",
    aliases: ["RECRUITMENT", "REKRUTMEN", "RECRUITMENT SUPPORT", "DEVELOPMENT SUPPORT", "REKRUTER"],
    version: KPI_2027_VERSION,
    status: "DRAFT",
    proposed: true,
    items: [
      item("REC01", "Pemenuhan kebutuhan tenaga kerja", 25, 90, { target_label: "≥90% sesuai SLA", source: "Recruitment tracker", owner: "Recruitment", definition: "Posisi disetujui yang berhasil diisi." }),
      item("REC02", "Ketepatan waktu recruitment", 20, 90, { target_label: "≥90% sesuai SLA", source: "Recruitment tracker", owner: "Recruitment", definition: "Posisi terisi dalam SLA sejak requisition disetujui." }),
      item("REC03", "Keberhasilan karyawan baru", 15, 85, { target_label: "≥85% lolos evaluasi awal", source: "Evaluasi probation", owner: "Recruitment", definition: "Karyawan baru yang lolos evaluasi awal." }),
      item("REC04", "Kelengkapan administrasi recruitment", 10, 100, { target_label: "100%", source: "Recruitment tracker", owner: "Recruitment", definition: "Administrasi recruitment lengkap." }),
      item("REC05", "Ketepatan laporan kebutuhan SDM", 10, 100, { target_label: "100% jadwal", source: "HR report", owner: "Recruitment", definition: "Laporan kebutuhan SDM tepat waktu." }),
      item("REC06", "Pelaksanaan onboarding", 10, 100, { target_label: "100% karyawan baru", source: "Onboarding checklist", owner: "Recruitment", definition: "Karyawan baru menyelesaikan checklist onboarding." }),
      item("REC07", "Dukungan pengembangan karyawan", 10, 90, { target_label: "≥90% program", source: "Training log", owner: "Recruitment", definition: "Program pengembangan karyawan terlaksana." })
    ]
  }
]);

const masterByCode = new Map();
for (const template of KPI_SCORECARD_TEMPLATES_SEED) {
  for (const item of template.items) {
    if (!masterByCode.has(item.kpi_code)) {
      masterByCode.set(item.kpi_code, {
        kpi_id: `KPI-${item.kpi_code}`,
        kpi_code: item.kpi_code,
        kpi_name: item.kpi_name,
        definition: item.definition,
        unit: item.target_unit,
        measurement_direction: item.measurement_direction,
        formula_type: item.formula_type,
        data_source: item.data_source,
        data_owner_role: item.data_owner_role,
        measurement_frequency: "Bulanan/tahunan sesuai periode",
        validation_rule: "Aktual wajib memiliki bukti; data kosong PENDING; skor maksimum 120.",
        effective_from: "2027-01-01",
        effective_to: null,
        version: KPI_2027_VERSION,
        status: "DRAFT",
        proposed: true
      });
    }
  }
}

export const KPI_MASTER_SEED = Object.freeze(Array.from(masterByCode.values()));

export const KPI_2027_OPEN_DECISIONS = Object.freeze([
  { id: "OD-01", label: "Organization chart terbaru", owner: "HR/GM" },
  { id: "OD-02", label: "Daftar jabatan dan jumlah incumbent per cabang", owner: "HR" },
  { id: "OD-03", label: "Atasan langsung setiap karyawan", owner: "HR/GM" },
  { id: "OD-04", label: "Konfirmasi SPV/Staff Warehouse dan Driver", owner: "GM" },
  { id: "OD-05", label: "Konfirmasi fungsi GA/Purchasing/CS/Delivery Coordinator", owner: "GM" },
  { id: "OD-06", label: "Pembagian pekerjaan dua fungsi HR", owner: "HR/GM" },
  { id: "OD-07", label: "Cakupan Sales Supervisor dua cabang", owner: "GM" },
  { id: "OD-08", label: "Jabatan pemegang fungsi Finance & Accounting", owner: "GM/Finance" }
]);

export const KPI_2027_ROLLOUT = Object.freeze([
  { period: "Nov 2026", activity: "Validasi struktur, jabatan, dan job description", output: "Organization/job map", gate: "GM menyetujui" },
  { period: "Nov–Des 2026", activity: "Pengumpulan baseline dan budget", output: "Baseline pack", gate: "Finance/Sales/GM validasi" },
  { period: "Des 2026", activity: "Finalisasi KPI dan kamus", output: "KPI master v1.0", gate: "Direksi/GM menyetujui" },
  { period: "Des 2026", activity: "Sosialisasi dan KPI agreement", output: "Scorecard yang diakui", gate: "HR memeriksa kelengkapan" },
  { period: "Jan–Mar 2027", activity: "Pilot tiga bulan", output: "Pilot report & trend", gate: "GM/Direksi memutuskan go/no-go" },
  { period: "Apr–Des 2027", activity: "Implementasi standar", output: "Laporan bulanan/triwulanan", gate: "Review berkala" }
]);
