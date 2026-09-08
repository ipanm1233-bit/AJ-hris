export const KPI_RELATION_WEIGHTS = Object.freeze({
  ATASAN: 50,
  PEER: 25,
  BAWAHAN: 15,
  SELF: 10,
  MULTI: 25,
  LAINNYA: 25
});

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function recordTime(record) {
  const raw = record?.tanggal_diselesaikan || record?.updated_at || record?.created_at || record?.tanggal || "";
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getKpiScore(record) {
  for (const field of ["total_skor", "skor_akhir", "nilai_akhir"]) {
    const raw = record?.[field];
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return Math.min(100, Math.max(0, value));
  }
  return null;
}

export function normalizeKpiRelation(value) {
  const relation = clean(value);
  if (relation.includes("atasan") || relation.includes("manager") || relation.includes("supervisor")) return "ATASAN";
  if (relation.includes("rekan") || relation.includes("peer")) return "PEER";
  if (relation.includes("bawahan") || relation.includes("upward")) return "BAWAHAN";
  if (relation.includes("mandiri") || relation.includes("self")) return "SELF";
  if (relation.includes("360") || relation.includes("multi")) return "MULTI";
  return "LAINNYA";
}

export function matchesKpiEmployee(record, employee = {}) {
  const wantedName = clean(employee.name || employee.nama_karyawan || employee.nama);
  const wantedNik = clean(employee.nik || employee.nik_karyawan);
  const recordName = clean(record?.nama_dinilai || record?.nama_karyawan || record?.nama);
  const recordNik = clean(record?.nik_dinilai || record?.nik_karyawan || record?.nik);
  return Boolean(
    (wantedNik && recordNik && wantedNik === recordNik) ||
    (wantedName && recordName && wantedName === recordName)
  );
}

function periodOf(record) {
  const explicit = String(record?.periode || record?.bulan || "").trim();
  if (explicit) return explicit;
  const rawDate = record?.tanggal_diselesaikan || record?.tanggal || record?.created_at || "";
  const parsed = new Date(rawDate);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 7);
  return "Tanpa Periode";
}

export function aggregateKpiByPeriod(records, employee = {}) {
  const matched = (Array.isArray(records) ? records : [])
    .filter(record => matchesKpiEmployee(record, employee))
    .filter(record => getKpiScore(record) !== null);

  const periods = new Map();
  matched.forEach(record => {
    const period = periodOf(record);
    if (!periods.has(period)) periods.set(period, []);
    periods.get(period).push(record);
  });

  return Array.from(periods.entries()).map(([period, periodRecords]) => {
    // Satu evaluator hanya dihitung sekali pada periode yang sama. Jika pernah
    // tersimpan ganda, gunakan kiriman yang paling baru.
    const unique = new Map();
    periodRecords.forEach(record => {
      const evaluator = clean(record.nama_penilai || record.penilai || record.nik_penilai || "tanpa-penilai");
      const relation = normalizeKpiRelation(record.tipe_relasi);
      const key = record.task_id || `${evaluator}|${relation}`;
      const previous = unique.get(key);
      if (!previous || recordTime(record) >= recordTime(previous)) unique.set(key, record);
    });

    const deduped = Array.from(unique.values());
    const relationGroups = new Map();
    deduped.forEach(record => {
      const relation = normalizeKpiRelation(record.tipe_relasi);
      if (!relationGroups.has(relation)) relationGroups.set(relation, []);
      relationGroups.get(relation).push(getKpiScore(record));
    });

    let weightedTotal = 0;
    let usedWeight = 0;
    const relationScores = {};
    relationGroups.forEach((scores, relation) => {
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const weight = KPI_RELATION_WEIGHTS[relation] || KPI_RELATION_WEIGHTS.LAINNYA;
      relationScores[relation] = {
        score: Math.round(average * 100) / 100,
        count: scores.length,
        weight
      };
      weightedTotal += average * weight;
      usedWeight += weight;
    });

    const score = usedWeight ? Math.round((weightedTotal / usedWeight) * 100) / 100 : 0;
    const latestLog = [...deduped].sort((a, b) => recordTime(b) - recordTime(a))[0] || null;
    return {
      period,
      score,
      raterCount: deduped.length,
      relationScores,
      latestLog,
      latestAt: Math.max(0, ...deduped.map(recordTime)),
      logs: deduped
    };
  }).sort((a, b) => b.latestAt - a.latestAt || String(b.period).localeCompare(String(a.period)));
}

export function getLatestKpiSummary(records, employee = {}) {
  return aggregateKpiByPeriod(records, employee)[0] || null;
}

export function evaluateKpiGrade(categoryKey, score, rulesMap) {
  const category = categoryKey || "KPI_360";
  const rules = rulesMap?.[category] || rulesMap?.KPI_360 || [];
  const numeric = Number(score);
  const value = Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;

  const normalized = rules.map(rule => ({
    ...rule,
    min: Number(rule.min),
    max: Number(rule.max)
  })).filter(rule => Number.isFinite(rule.min) && Number.isFinite(rule.max));

  let selected = normalized.find(rule => value >= rule.min && value <= rule.max);
  if (!selected) {
    // Rentang UI lazim ditulis 70-80 dan 81-90. Nilai desimal seperti 80,5
    // tidak boleh meloncat ke tier tertinggi; gunakan tier dengan batas bawah
    // terdekat yang sudah terlewati.
    selected = [...normalized].sort((a, b) => b.min - a.min).find(rule => value >= rule.min)
      || [...normalized].sort((a, b) => a.min - b.min)[0];
  }

  return {
    predikat: selected?.predikat || (value >= 80 ? "Baik" : "Kurang"),
    rekomendasi: selected?.rekomendasi || "Evaluasi",
    badgeClass: selected?.badgeClass || (value >= 80
      ? "bg-blue-100 text-blue-800 border-blue-300"
      : "bg-rose-100 text-rose-800 border-rose-300")
  };
}

export function validateGradeRulesMap(rulesMap) {
  for (const [category, rules] of Object.entries(rulesMap || {})) {
    if (!Array.isArray(rules) || rules.length === 0) return `${category}: minimal satu aturan grade diperlukan.`;
    const normalized = rules.map(rule => ({ min: Number(rule.min), max: Number(rule.max), rule }));
    for (const item of normalized) {
      if (!Number.isFinite(item.min) || !Number.isFinite(item.max)) return `${category}: batas nilai harus berupa angka.`;
      if (item.min < 0 || item.max > 100 || item.min > item.max) return `${category}: rentang nilai harus berada di 0-100 dan minimum tidak boleh melebihi maksimum.`;
      if (!String(item.rule.predikat || "").trim() || !String(item.rule.rekomendasi || "").trim()) return `${category}: predikat dan rekomendasi wajib diisi.`;
    }
    const sorted = normalized.sort((a, b) => a.min - b.min);
    if (sorted[0].min !== 0 || sorted[sorted.length - 1].max !== 100) return `${category}: aturan harus mencakup nilai 0 sampai 100.`;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min <= sorted[i - 1].max) return `${category}: rentang grade tidak boleh saling tumpang tindih.`;
      if (sorted[i].min > sorted[i - 1].max + 1) return `${category}: terdapat celah terlalu besar antar-rentang grade.`;
    }
  }
  return null;
}
