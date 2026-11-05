// Target dan realisasi disimpan bersama agar periode dan identitas karyawan tetap sama.
export const MONTHLY_METRICS = {
  SALES: [
    { key: "target_volume_dulux", label: "Volume Dulux", unit: "Ton" },
    { key: "target_volume_catylac", label: "Volume Catylac", unit: "Ton" },
    { key: "target_volume_maxilite", label: "Volume Maxilite", unit: "Ton" },
    { key: "target_volume_aquashield", label: "Volume Aquashield", unit: "Ton" },
    { key: "target_total_volume_ici", label: "Total Volume ICI", unit: "Ton", derived: true },
    { key: "target_value_penjualan", label: "Penjualan Tertagih", unit: "Rp" },
    { key: "target_value_prima", label: "Value Prima", unit: "Rp" },
    { key: "target_value_dcota", label: "Value DCota", unit: "Rp" },
    { key: "target_overdue_piutang", label: "Overdue Piutang (batas maksimum)", unit: "Rp", lowerIsBetter: true },
    { key: "target_ao_ici", label: "Active Outlet ICI", unit: "Toko" },
    { key: "target_ao_prima", label: "Active Outlet PRIMA", unit: "Toko" },
    { key: "target_ao_dcota", label: "Active Outlet DCOTA", unit: "Toko" }
  ],
  NON_SALES: [
    { key: "target_sop_tugas", label: "Penyelesaian SOP & tugas", unit: "%" },
    { key: "target_respon_divisi", label: "SLA respon & pelayanan", unit: "%" },
    { key: "target_kedisiplinan", label: "Kedisiplinan", unit: "%" },
    { key: "target_inisiatif_team", label: "Inisiatif & kerja sama", unit: "%" }
  ]
};

const VOLUME_METRIC_KEYS = ["target_volume_dulux", "target_volume_catylac", "target_volume_maxilite", "target_volume_aquashield"];

function sumPositiveNumbers(source, keys) {
  return keys.reduce((total, key) => {
    const value = Number(source?.[key]);
    return total + (Number.isFinite(value) && value >= 0 ? value : 0);
  }, 0);
}

export function monthlyMetricRows(target = {}) {
  const metrics = String(target.kategori || "").toUpperCase() === "SALES" ? MONTHLY_METRICS.SALES : MONTHLY_METRICS.NON_SALES;
  const values = target.capaian_bulanan?.nilai || {};
  return metrics.map(metric => {
    let planned = Number(target[metric.key]);
    let actual = values[metric.key] === undefined || values[metric.key] === null || values[metric.key] === "" ? null : Number(values[metric.key]);

    // Total Volume ICI adalah penjumlahan otomatis empat volume produk.
    if (metric.derived) {
      const targetsFilled = VOLUME_METRIC_KEYS.every(key => {
        const value = target[key];
        return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
      });
      planned = targetsFilled ? sumPositiveNumbers(target, VOLUME_METRIC_KEYS) : NaN;

      const actualFilled = VOLUME_METRIC_KEYS.some(key => {
        const value = values[key];
        return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
      });
      actual = actualFilled ? sumPositiveNumbers(values, VOLUME_METRIC_KEYS) : null;
    }

    const validTarget = Number.isFinite(planned) && planned >= 0;
    const validActual = actual !== null && Number.isFinite(actual) && actual >= 0;
    let attainment = null;
    if (validTarget && validActual) {
      if (metric.lowerIsBetter) attainment = planned === 0 ? (actual === 0 ? 100 : 0) : (actual === 0 ? 100 : Math.min(100, (planned / actual) * 100));
      else if (planned > 0) attainment = (actual / planned) * 100;
    }
    return { ...metric, target: validTarget ? planned : null, actual: validActual ? actual : null,
      attainment: attainment === null ? null : Math.round(attainment * 10) / 10 };
  });
}

export function validateMonthlyAchievement(target, values) {
  const metrics = monthlyMetricRows(target);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(target.periode || ""))) return "Periode target bulanan tidak valid.";
  if (!metrics.length || !values || typeof values !== "object") return "Isi realisasi target terlebih dahulu.";
  for (const metric of metrics) {
    if (metric.derived) continue;
    const value = values[metric.key];
    if (value === null || value === undefined || value === "") return `Isi realisasi ${metric.label}.`;
    if (!Number.isFinite(Number(value)) || Number(value) < 0) return `Realisasi ${metric.label} harus angka positif atau nol.`;
    if (metric.unit === "%" && Number(value) > 100) return `Realisasi ${metric.label} tidak boleh melebihi 100%.`;
  }
  return null;
}
