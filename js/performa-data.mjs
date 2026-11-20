/**
 * =====================================================================
 * PERFORMA-DATA.MJS
 * =====================================================================
 * Satu sumber data untuk modul penilaian performa:
 *  - Master Karyawan  : identitas, jabatan, cabang, status kepegawaian
 *  - Master Kontrak   : jenis kontrak, masa berlaku, sisa hari
 *  - Scorecard KPI    : ringkasan skor terbaru (opsional)
 *
 * Modul ini murni (tanpa DOM/Firestore) agar aturan berikut dapat diuji:
 *  - Karyawan hanya punya satu identitas penilaian (NIK, fallback nama).
 *  - Penilaian perpanjangan hanya relevan untuk kontrak non-PKWTT yang
 *    mendekati tanggal berakhir (default 60 hari).
 *  - Karyawan tetap (PKWTT) tidak pernah masuk antrean perpanjangan.
 * =====================================================================
 */

import {
  contractTypeOf,
  isPermanentContractType,
  selectLatestContract,
  toDateOnly
} from "./contract-sync.mjs";

/** Jendela waktu (hari) sebelum kontrak berakhir untuk memulai penilaian perpanjangan. */
export const RENEWAL_WINDOW_DAYS = 60;

export const CONTRACT_TYPE_LABELS = Object.freeze({
  PKWTT: "PKWTT (Tetap)",
  PKWT: "PKWT (Kontrak)",
  PROBATION: "Probation",
  MAGANG: "Magang",
  "BURUH HARIAN": "Buruh Harian",
  OUTSOURCING: "Outsourcing",
  LAINNYA: "Lainnya"
});

export const CONTRACT_URGENCY_LABELS = Object.freeze({
  KADALUARSA: "Kadaluarsa",
  KRITIS: "Kritis",
  WASPADA: "Waspada",
  PERSIAPAN: "Persiapan",
  AMAN: "Aman",
  "TANPA BATAS": "Tanpa batas"
});

/** Kunci identitas yang stabil untuk mencocokkan karyawan, kontrak, dan scorecard. */
export function performaKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function performaEmployeeNik(employee = {}) {
  return String(employee.nik_karyawan || employee.nik || employee.id || "").trim();
}

export function performaEmployeeName(employee = {}) {
  return String(employee.nama_karyawan || employee.nama || "").trim();
}

/** Selisih hari tanggal akhir kontrak terhadap hari ini (UTC, bebas pergeseran zona waktu). */
export function contractDaysLeft(endDate, today = new Date()) {
  const end = toDateOnly(endDate);
  if (!end) return null;
  const todayKey = toDateOnly(today);
  if (!todayKey) return null;
  const [ey, em, ed] = end.split("-").map(Number);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  if (!ey || !em || !ed || !ty || !tm || !td) return null;
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

/** Tingkat urgensi yang dipakai pipeline perpanjangan kontrak. */
export function contractUrgency(daysLeft) {
  if (daysLeft === null || daysLeft === undefined || !Number.isFinite(Number(daysLeft))) return "TANPA BATAS";
  const value = Number(daysLeft);
  if (value < 0) return "KADALUARSA";
  if (value <= 14) return "KRITIS";
  if (value <= 30) return "WASPADA";
  if (value <= 45) return "PERSIAPAN";
  return "AMAN";
}

function pushInto(map, key, value) {
  const normalized = performaKey(key);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, []);
  const list = map.get(normalized);
  if (!list.some(item => item === value)) list.push(value);
}

function contractLookupKeys(contract = {}) {
  return [
    contract.nik_karyawan,
    contract.nik,
    contract.nama_karyawan
  ];
}

function scorecardLookupKeys(scorecard = {}) {
  return [
    scorecard.employee_nik,
    scorecard.nik,
    scorecard.nik_karyawan,
    scorecard.employee_name,
    scorecard.nama_karyawan
  ];
}

function sortContracts(contracts = []) {
  return [...contracts].sort((a, b) => {
    const end = toDateOnly(b.tanggal_akhir).localeCompare(toDateOnly(a.tanggal_akhir));
    if (end !== 0) return end;
    const start = toDateOnly(b.tanggal_mulai).localeCompare(toDateOnly(a.tanggal_mulai));
    if (start !== 0) return start;
    return (Number(b.kontrak_ke) || 0) - (Number(a.kontrak_ke) || 0);
  });
}

function scorecardSortValue(scorecard = {}) {
  const period = String(scorecard.period_label || scorecard.period_year || "");
  const updated = String(scorecard.updated_at || scorecard.created_at || "");
  return `${period}|${updated}`;
}

function latestScorecard(scorecards = []) {
  return [...scorecards].sort((a, b) => scorecardSortValue(b).localeCompare(scorecardSortValue(a)))[0] || null;
}

/**
 * Gabungkan Master Karyawan + Master Kontrak + Scorecard KPI menjadi satu
 * daftar penilaian yang dipakai semua menu performa.
 *
 * @param {object} options
 * @param {Array} options.employees
 * @param {Array} options.contracts
 * @param {Array} options.scorecards
 * @param {Date|string} options.today
 * @returns {Array}
 */
export function buildPerformaIndex({
  employees = [],
  contracts = [],
  scorecards = [],
  today = new Date()
} = {}) {
  const contractsByKey = new Map();
  (Array.isArray(contracts) ? contracts : []).filter(Boolean).forEach(contract => {
    contractLookupKeys(contract).forEach(key => pushInto(contractsByKey, key, contract));
  });

  const scorecardsByKey = new Map();
  (Array.isArray(scorecards) ? scorecards : []).filter(Boolean).forEach(scorecard => {
    scorecardLookupKeys(scorecard).forEach(key => pushInto(scorecardsByKey, key, scorecard));
  });

  return (Array.isArray(employees) ? employees : []).filter(Boolean).map(employee => {
    const nik = performaEmployeeNik(employee);
    const nama = performaEmployeeName(employee);
    const nameKey = performaKey(nama);
    const nikKey = performaKey(nik);

    const relatedContracts = new Set();
    if (nikKey) (contractsByKey.get(nikKey) || []).forEach(contract => relatedContracts.add(contract));
    if (nameKey) (contractsByKey.get(nameKey) || []).forEach(contract => relatedContracts.add(contract));
    const employeeContracts = sortContracts([...relatedContracts]);
    const latestContract = selectLatestContract(employeeContracts);

    const type = contractTypeOf(latestContract || {}, employee);
    const isPermanent = isPermanentContractType(type)
      || isPermanentContractType(employee.status_karyawan || employee.status_kepegawaian || employee.status);

    const contractStart = toDateOnly(latestContract?.tanggal_mulai || employee.tgl_mulai_kontrak);
    const contractEnd = toDateOnly(latestContract?.tanggal_akhir || employee.tgl_akhir_kontrak);
    const daysLeft = contractEnd ? contractDaysLeft(contractEnd, today) : null;
    const urgency = contractUrgency(daysLeft);
    const renewalDue = !isPermanent && daysLeft !== null && daysLeft <= RENEWAL_WINDOW_DAYS;

    const relatedScorecards = new Set();
    if (nikKey) (scorecardsByKey.get(nikKey) || []).forEach(scorecard => relatedScorecards.add(scorecard));
    if (nameKey) (scorecardsByKey.get(nameKey) || []).forEach(scorecard => relatedScorecards.add(scorecard));

    return {
      ...employee,
      key: nikKey || nameKey,
      nik: nik || nama,
      nama,
      employee_nik: nik,
      employee_name: nama,
      jabatan: String(employee.jabatan || employee.posisi || "").trim(),
      cabang: String(employee.cabang || employee.branch || "").trim(),
      divisi: String(employee.divisi || employee.departemen || employee.unit || "").trim(),
      contracts: employeeContracts,
      kontrak: latestContract,
      contract_type: type,
      contract_type_label: CONTRACT_TYPE_LABELS[type] || type,
      is_permanent: isPermanent,
      is_contract: !isPermanent,
      contract_start: contractStart,
      contract_end: contractEnd,
      contract_number: latestContract?.nomor_kontrak || employee.nomor_kontrak || "",
      contract_ke: Number(latestContract?.kontrak_ke || employee.kontrak_ke || 1) || 1,
      days_left: daysLeft,
      urgency,
      urgency_label: CONTRACT_URGENCY_LABELS[urgency] || urgency,
      renewal_due: renewalDue,
      latest_scorecard: latestScorecard([...relatedScorecards]),
      scorecard_count: relatedScorecards.size
    };
  });
}

/** Ringkasan kontrak untuk kartu dashboard. */
export function summarizePerformaContracts(records = []) {
  const rows = (Array.isArray(records) ? records : []).filter(Boolean);
  const summary = {
    total: rows.length,
    permanent: 0,
    contract: 0,
    renewal_due: 0,
    expired: 0,
    no_contract: 0,
    with_scorecard: 0
  };
  rows.forEach(record => {
    if (record.is_permanent) summary.permanent += 1;
    else summary.contract += 1;
    if (record.renewal_due) summary.renewal_due += 1;
    if (record.urgency === "KADALUARSA") summary.expired += 1;
    if (!record.contract_end) summary.no_contract += 1;
    if (record.latest_scorecard) summary.with_scorecard += 1;
  });
  return summary;
}

/** Antrean penilaian perpanjangan: kontrak non-PKWTT dalam jendela waktu. */
export function renewalQueue(records = [], { windowDays = RENEWAL_WINDOW_DAYS } = {}) {
  const limit = Number.isFinite(Number(windowDays)) ? Number(windowDays) : RENEWAL_WINDOW_DAYS;
  return (Array.isArray(records) ? records : [])
    .filter(record => record && !record.is_permanent)
    .filter(record => record.days_left !== null && record.days_left !== undefined && Number(record.days_left) <= limit)
    .sort((a, b) => Number(a.days_left) - Number(b.days_left) || String(a.nama || "").localeCompare(String(b.nama || ""), "id"));
}
