/**
 * Logika murni target & capaian harian KPI Sales.
 *
 * Untuk divisi Sales, input harian memakai nilai capaian sesungguhnya
 * (mis. 12 Ton, Rp 8.500.000, 4 Toko), bukan skor 0–100. Skor dihitung
 * otomatis dari perbandingan capaian terhadap target bulanan.
 */

// Indikator Sales yang punya padanan target bulanan. Indikator yang tidak
// terdaftar di sini (mis. "Total Weighted Target" atau indikator tambahan
// buatan HRD) tetap memakai input skor 0–100.
export const SALES_INDICATOR_TARGET_MAP = {
  volume_dulux: {
    targetKey: "target_volume_dulux",
    unit: "Ton",
    label: "Volume Dulux"
  },
  volume_catylac: {
    targetKey: "target_volume_catylac",
    unit: "Ton",
    label: "Volume Catylac"
  },
  volume_maxilite: {
    targetKey: "target_volume_maxilite",
    unit: "Ton",
    label: "Volume Maxilite"
  },
  volume_aquashield: {
    targetKey: "target_volume_aquashield",
    unit: "Ton",
    label: "Volume Aquashield"
  },
  value_penjualan_tertagih: {
    targetKey: "target_value_penjualan",
    unit: "Rp",
    label: "Value Penjualan Tertagih"
  },
  total_target_penjualan_ici: {
    targetKey: "target_total_penjualan_ici",
    unit: "Rp",
    label: "Total Target Penjualan ICI"
  },
  overdue_piutang: {
    targetKey: "target_overdue_piutang",
    unit: "Rp",
    label: "Overdue Piutang Toko",
    lowerIsBetter: true
  },
  ao_ici: {
    targetKey: "target_ao_ici",
    unit: "Toko",
    label: "Active Outlet ICI"
  },
  sales_value_prima: {
    targetKey: "target_value_prima",
    unit: "Rp",
    label: "Value Prima"
  },
  ao_prima: {
    targetKey: "target_ao_prima",
    unit: "Toko",
    label: "Active Outlet Prima"
  },
  sales_value_dcota: {
    targetKey: "target_value_dcota",
    unit: "Rp",
    label: "Value DCota"
  },
  ao_dcota: {
    targetKey: "target_ao_dcota",
    unit: "Toko",
    label: "Active Outlet DCota"
  }
};

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ambil spesifikasi input untuk satu indikator Sales.
 * Mengembalikan null bila indikator tidak punya target nilai nyata.
 */
export function resolveSalesIndicatorSpec(indicator = {}, target = null) {
  const map = SALES_INDICATOR_TARGET_MAP[indicator?.key];
  if (!map) return null;

  const fromTarget = target ? toNumberOrNull(target[map.targetKey]) : null;
  const fallback = toNumberOrNull(indicator?.defaultTarget);
  const targetValue = fromTarget !== null ? fromTarget : fallback;

  return {
    key: indicator.key,
    targetKey: map.targetKey,
    label: map.label || indicator.indikator || indicator.key,
    unit: map.unit || indicator.unit || "",
    lowerIsBetter: Boolean(map.lowerIsBetter),
    targetValue,
    hasTarget: targetValue !== null && targetValue >= 0
  };
}

/**
 * Hitung skor 0–100 dari capaian nyata dibanding target.
 * - Indikator "semakin besar semakin baik": actual / target × 100.
 * - Indikator "semakin kecil semakin baik": target / actual × 100.
 * - Skor dibatasi maksimum 100.
 * Mengembalikan null bila capaian atau target belum valid.
 */
export function computeSalesAchievementScore({ actual, target, lowerIsBetter = false, maxScore = 100 } = {}) {
  const a = toNumberOrNull(actual);
  const t = toNumberOrNull(target);
  const cap = Number.isFinite(Number(maxScore)) ? Number(maxScore) : 100;

  if (a === null || a < 0) return null;
  if (t === null || t < 0) return null;

  if (lowerIsBetter) {
    if (a === 0) return cap;
    if (t === 0) return 0;
    return Math.min(cap, Math.round((t / a) * 10000) / 100);
  }

  if (t === 0) return null;
  return Math.min(cap, Math.round((a / t) * 10000) / 100);
}

/** Format angka capaian/target agar mudah dibaca (Rp, Ton, Toko, dll). */
export function formatSalesTarget(value, unit = "") {
  const n = toNumberOrNull(value);
  if (n === null) return "-";
  const formatted = n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const cleanUnit = String(unit || "").trim();
  return cleanUnit.toUpperCase() === "RP" ? `Rp ${formatted}` : cleanUnit ? `${formatted} ${cleanUnit}` : formatted;
}

/**
 * Cari target bulanan Sales milik karyawan pada periode tertentu.
 * Nama atau NIK boleh dipakai; periode dibandingkan sampai bulan saja.
 */
export function findSalesTarget(targets = [], { namaKaryawan = "", nikKaryawan = "", periode = "" } = {}) {
  const name = String(namaKaryawan || "").trim().toLowerCase();
  const nik = String(nikKaryawan || "").trim().toLowerCase();
  const period = String(periode || "").slice(0, 7);
  const list = Array.isArray(targets) ? targets : [];

  return list.find(target => {
    if (String(target?.kategori || "").toUpperCase() !== "SALES") return false;
    if (String(target?.periode || "").slice(0, 7) !== period) return false;
    const targetName = String(target?.nama_karyawan || "").trim().toLowerCase();
    const targetNik = String(target?.nik_karyawan || "").trim().toLowerCase();
    return (name && targetName === name) || (nik && targetNik === nik);
  }) || null;
}

/** Ringkasan capaian untuk badge, mis. "8 / 10 Ton (80%)". */
export function formatSalesAchievement(actual, target, unit = "") {
  const score = computeSalesAchievementScore({ actual, target });
  const parts = [
    formatSalesTarget(actual, unit),
    target === null || target === undefined || target === "" ? "" : `/ ${formatSalesTarget(target, unit)}`
  ].filter(Boolean);
  return `${parts.join(" ")}${score === null ? "" : ` (${score}%)`}`;
}

/**
 * Pastikan daftar indikator Sales yang sudah tersimpan tetap memuat
 * indikator baru dan label terbaru. Indikator yang sengaja dihapus HRD
 * tidak ditambahkan kembali; hanya indikator baru yang belum pernah ada
 * yang ditambahkan otomatis.
 */
export function normalizeSalesIndicatorList(list, defaults = []) {
  if (!Array.isArray(list)) return list;
  const normalized = list.map(indicator => {
    if (!indicator || typeof indicator !== "object") return indicator;
    if (indicator.key === "sales_value_prima" && indicator.indikator === "Sales Value PRIMA Tertagih") {
      return { ...indicator, indikator: "Value Prima" };
    }
    if (indicator.key === "sales_value_dcota" && indicator.indikator === "Sales Value DCOTA Tertagih") {
      return { ...indicator, indikator: "Value DCota" };
    }
    return indicator;
  });

  const newIndicatorKey = "total_target_penjualan_ici";
  if (!normalized.some(indicator => indicator?.key === newIndicatorKey)) {
    const defaultIndicator = (Array.isArray(defaults) ? defaults : []).find(indicator => indicator?.key === newIndicatorKey);
    if (defaultIndicator) normalized.push({ ...defaultIndicator });
  }
  return normalized;
}
