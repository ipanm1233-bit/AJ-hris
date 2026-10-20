/**
 * =====================================================================
 * DIVISION-OPTIONS.MJS - Sumber tunggal pilihan divisi CV Andela Jaya
 * =====================================================================
 * Pilihan divisi di seluruh menu (SOP, audit SOP, ATS/rekrutmen,
 * manajemen data karyawan) memakai daftar yang sama. Nilai utama diambil
 * dari data master karyawan agar selalu sesuai kondisi Andela Jaya.
 * Bila master masih kosong, dipakai daftar divisi Andela Jaya di bawah.
 *
 * Modul ini bebas DOM/Firestore agar mudah diuji. Loader Firestore ada di
 * `utils.js` (`loadDivisionOptions`).
 */

export const ANDELA_JAYA_DIVISIONS = Object.freeze([
  "HRD & GA",
  "FINANCE & ACCOUNTING",
  "OPERASIONAL",
  "MARKETING & SALES",
  "IT & DIGITAL",
  "LOGISTIK & GUDANG",
  "PRODUKSI",
  "SALES & DISTRIBUTION"
]);

export const DIVISION_ALL = "ALL";

const EMPLOYEE_DIVISION_FIELDS = Object.freeze([
  "divisi",
  "departemen",
  "department",
  "bagian",
  "unit_kerja"
]);

const MASTER_DIVISION_FIELDS = Object.freeze([
  "nama_divisi",
  "divisi",
  "nama",
  "name",
  "label",
  "value",
  "departemen",
  "department"
]);

export function cleanDivisionName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function divisionKey(value) {
  return cleanDivisionName(value).toUpperCase();
}

function collectDivisions(records, fields) {
  const map = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== "object") continue;
    for (const field of fields) {
      const label = cleanDivisionName(record[field]);
      if (!label) continue;
      const key = divisionKey(label);
      if (!map.has(key)) map.set(key, label);
      break;
    }
  }
  return [...map.values()];
}

export function divisionsFromEmployees(employees = []) {
  return collectDivisions(employees, EMPLOYEE_DIVISION_FIELDS);
}

export function divisionsFromMasterRecords(records = []) {
  return collectDivisions(records, MASTER_DIVISION_FIELDS);
}

export function sortDivisionOptions(list = []) {
  return [...list].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base", numeric: true }));
}

/**
 * Susun pilihan divisi dari master divisi, master karyawan, atau fallback.
 * Prioritas: master_divisi -> divisi karyawan -> daftar Andela Jaya.
 */
export function divisionOptionsFromSources({
  masterDivisions = [],
  employees = [],
  includeAll = false,
  fallback = ANDELA_JAYA_DIVISIONS
} = {}) {
  const fromMaster = divisionsFromMasterRecords(masterDivisions);
  const fromEmployees = divisionsFromEmployees(employees);
  const found = fromMaster.length ? fromMaster : fromEmployees;
  const base = sortDivisionOptions(found.length ? found : fallback);
  return includeAll ? [DIVISION_ALL, ...base] : base;
}

/** Tambahkan nilai lama yang belum ada di daftar agar tetap terpilih saat edit. */
export function withCurrentDivision(options = [], current = "") {
  const list = [...options];
  const value = cleanDivisionName(current);
  if (!value) return list;
  const exists = list.some(item => divisionKey(item) === divisionKey(value));
  if (!exists) list.push(value);
  return list;
}
