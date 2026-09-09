export const KPI_RELATION_WEIGHTS = Object.freeze({
  ATASAN: 50,
  PEER: 25,
  BAWAHAN: 15,
  SELF: 10,
  MULTI: 25,
  LAINNYA: 25
});

export const DEFAULT_KPI_GRADE_RULES = Object.freeze({
  MASA_PERCOBAAN: [
    { min: 91, max: 100, predikat: "Sangat Baik", rekomendasi: "Sangat Baik - Lulus Masa Percobaan (Karyawan Tetap)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { min: 81, max: 90, predikat: "Baik", rekomendasi: "Baik - Lulus Masa Percobaan", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
    { min: 0, max: 80, predikat: "Kurang", rekomendasi: "Kurang - Tidak Lulus Masa Percobaan / Evaluasi", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
  ],
  KONTRAK: [
    { min: 91, max: 100, predikat: "Sangat Baik", rekomendasi: "Direkomendasikan Karyawan Tetap (Kartap)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { min: 81, max: 90, predikat: "Baik", rekomendasi: "Perpanjang Kontrak 12 Bulan", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
    { min: 70, max: 80, predikat: "Cukup", rekomendasi: "Perpanjang Kontrak 6 Bulan", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
    { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Tidak Diperpanjang (Putus Kontrak)", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
  ],
  KARTAP: [
    { min: 91, max: 100, predikat: "Sangat Baik", rekomendasi: "Direkomendasikan Menjadi Karyawan Tetap", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { min: 81, max: 90, predikat: "Baik", rekomendasi: "Diperpanjang Kontrak Kembali (12 Bulan)", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
    { min: 70, max: 80, predikat: "Cukup", rekomendasi: "Diperpanjang Kontrak Kembali (6 Bulan)", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
    { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Tidak Direkomendasikan (Putus Hubungan Kerja)", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
  ],
  PIP: [
    { min: 85, max: 100, predikat: "Sangat Baik", rekomendasi: "Lulus PIP (Performa Membaik / Lanjut Kerja)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { min: 70, max: 84, predikat: "Cukup", rekomendasi: "Perpanjang Masa PIP (1 - 3 Bulan)", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
    { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Gagal PIP (Demosi / Sanksi / PHK)", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
  ],
  MUTASI_DEMOSI: [
    { min: 90, max: 100, predikat: "Sangat Baik", rekomendasi: "Direkomendasikan Promosi Jabatan", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { min: 75, max: 89, predikat: "Baik", rekomendasi: "Tetap Pada Posisi Saat Ini", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
    { min: 60, max: 74, predikat: "Cukup", rekomendasi: "Direkomendasikan Mutasi Jabatan / Divisi", badgeClass: "bg-purple-100 text-purple-800 border-purple-300" },
    { min: 0, max: 59, predikat: "Kurang", rekomendasi: "Direkomendasikan Demosi Jabatan", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
  ],
  KPI_360: [
    { min: 90, max: 100, predikat: "Sangat Baik", rekomendasi: "Kinerja Sangat Baik (Apresiasi / Bonus)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { min: 80, max: 89, predikat: "Baik", rekomendasi: "Kinerja Memenuhi Ekspektasi (Dipertahankan)", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
    { min: 70, max: 79, predikat: "Cukup", rekomendasi: "Kinerja Perlu Perbaikan (Evaluasi / Guidance)", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
    { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Saran Pelatihan & Peningkatan Kompetensi", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
  ]
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
  // NIK adalah identitas utama. Nama hanya menjadi fallback untuk data lama
  // yang memang belum memiliki NIK, agar karyawan bernama sama tidak tertukar.
  if (wantedNik && recordNik) return wantedNik === recordNik;
  return Boolean(wantedName && recordName && wantedName === recordName);
}

function periodOf(record) {
  const explicit = String(record?.periode || record?.bulan || "").trim();
  if (explicit) {
    const compact = explicit.replace(/\s+/g, " ");
    return compact.replace(/^q([1-4])\s*(\d{4})$/i, "Q$1 $2");
  }
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
    const periodKey = period.toLocaleLowerCase("id-ID");
    if (!periods.has(periodKey)) periods.set(periodKey, { label: period, records: [] });
    periods.get(periodKey).records.push(record);
  });

  return Array.from(periods.values()).map(({ label: period, records: periodRecords }) => {
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
    const indicatorGroups = new Map();
    deduped.forEach(record => {
      const relation = normalizeKpiRelation(record.tipe_relasi);
      const details = Array.isArray(record.detail_json) ? record.detail_json : (Array.isArray(record.soal_json) ? record.soal_json : []);
      details.forEach((item, index) => {
        const indicator = String(item.indikator || item.pertanyaan || `Indikator ${index + 1}`).trim();
        const aspect = String(item.aspek || "Kompetensi").trim();
        const value = Number(item.nilai_diberikan ?? item.nilai ?? item.skor);
        if (!Number.isFinite(value)) return;
        const key = `${clean(aspect)}|${clean(indicator)}`;
        if (!indicatorGroups.has(key)) indicatorGroups.set(key, { aspek: aspect, indikator: indicator, bobot: Number(item.bobot) || 0, relations: new Map() });
        const group = indicatorGroups.get(key);
        if (!group.relations.has(relation)) group.relations.set(relation, []);
        group.relations.get(relation).push(Math.min(100, Math.max(0, value)));
      });
    });
    const indicatorScores = Array.from(indicatorGroups.values()).map(group => {
      let total = 0;
      let weightTotal = 0;
      group.relations.forEach((values, relation) => {
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        const weight = KPI_RELATION_WEIGHTS[relation] || KPI_RELATION_WEIGHTS.LAINNYA;
        total += average * weight;
        weightTotal += weight;
      });
      return { aspek: group.aspek, indikator: group.indikator, bobot: group.bobot, nilai_diberikan: weightTotal ? Math.round((total / weightTotal) * 100) / 100 : 0 };
    });
    const latestLog = [...deduped].sort((a, b) => recordTime(b) - recordTime(a))[0] || null;
    return {
      period,
      score,
      raterCount: deduped.length,
      relationScores,
      indicatorScores,
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
