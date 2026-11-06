/**
 * =====================================================================
 * MASTER-EMPLOYEE-DASHBOARD.MJS
 * =====================================================================
 * Logika murni dashboard interaktif Data Master Karyawan:
 * total, aktif/tidak aktif, sebaran cabang & divisi, status kerja,
 * usia, masa kerja, pendidikan, kontrak akan berakhir, karyawan baru,
 * dan kelengkapan data.
 * =====================================================================
 */
import { toDateKey } from "./employee-achievement-dashboard.mjs";

export const EMPLOYEE_ACTIVE = "AKTIF";
export const EMPLOYEE_INACTIVE = "TIDAK AKTIF";
export const UNKNOWN_LABEL = "Tidak tercatat";

const INACTIVE_PATTERN = /TIDAK\s*AKTIF|NON\s*AKTIF|NONAKTIF|INACTIVE|RESIGN|KELUAR|BERHENTI|PHK|TERMINATED/i;

function localDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayNumber(dateKey) {
  const text = String(dateKey || "").slice(0, 10);
  const [year, month, day] = text.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function normalizedText(value) {
  return String(value ?? "").trim();
}

/** Status keaktifan karyawan: AKTIF atau TIDAK AKTIF. */
export function employeeActiveStatus(employee = {}) {
  const explicit = employee.aktif_tdk_aktif
    ?? employee["aktif/tidak_aktif"]
    ?? employee.status_aktif
    ?? employee.aktif;
  const raw = normalizedText(explicit || employee.status_karyawan || employee.status || EMPLOYEE_ACTIVE).toUpperCase();
  if (!raw) return EMPLOYEE_ACTIVE;
  if (INACTIVE_PATTERN.test(raw)) return EMPLOYEE_INACTIVE;
  return EMPLOYEE_ACTIVE;
}

export function employeeIsActive(employee = {}) {
  return employeeActiveStatus(employee) === EMPLOYEE_ACTIVE;
}

export function employeeBranchName(employee = {}) {
  return normalizedText(employee.cabang || employee.branch || employee.lokasi) || UNKNOWN_LABEL;
}

export function employeeDivisionName(employee = {}) {
  return normalizedText(employee.divisi || employee.departemen || employee.unit || employee.unit_kerja) || UNKNOWN_LABEL;
}

export function employeeEmploymentStatus(employee = {}) {
  return normalizedText(employee.status_karyawan || employee.status_kepegawaian || employee.status) || UNKNOWN_LABEL;
}

export function employeeDisplayName(employee = {}) {
  return normalizedText(employee.nama_karyawan || employee.nama) || "Tanpa nama";
}

export function employeeNik(employee = {}) {
  return normalizedText(employee.nik_karyawan || employee.nik || employee.id) || "-";
}

/** Usia dalam tahun (null bila tanggal lahir tidak valid). */
export function ageFromBirthDate(birthDate, now = new Date()) {
  const birthKey = toDateKey(birthDate);
  const todayKey = localDateKey(now instanceof Date ? now : new Date(now));
  if (!birthKey || !todayKey) return null;
  const [by, bm, bd] = birthKey.split("-").map(Number);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  if (!by || !bm || !bd) return null;
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/** Masa kerja dalam bulan penuh (null bila tanggal join tidak valid). */
export function tenureMonthsFromJoin(joinDate, now = new Date()) {
  const joinKey = toDateKey(joinDate);
  const todayKey = localDateKey(now instanceof Date ? now : new Date(now));
  if (!joinKey || !todayKey) return null;
  const [jy, jm, jd] = joinKey.split("-").map(Number);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  if (!jy || !jm || !jd) return null;
  let months = (ty - jy) * 12 + (tm - jm);
  if (td < jd) months -= 1;
  return months >= 0 ? months : null;
}

export function ageBucket(age) {
  if (age === null || age === undefined || !Number.isFinite(Number(age))) return UNKNOWN_LABEL;
  const value = Number(age);
  if (value < 20) return "< 20 tahun";
  if (value < 30) return "20–29 tahun";
  if (value < 40) return "30–39 tahun";
  if (value < 50) return "40–49 tahun";
  if (value < 60) return "50–59 tahun";
  return "≥ 60 tahun";
}

export function tenureBucket(months) {
  if (months === null || months === undefined || !Number.isFinite(Number(months))) return UNKNOWN_LABEL;
  const value = Number(months);
  if (value < 12) return "< 1 tahun";
  if (value < 36) return "1–2 tahun";
  if (value < 72) return "3–5 tahun";
  if (value < 120) return "6–9 tahun";
  return "≥ 10 tahun";
}

function genderLabel(employee) {
  const raw = normalizedText(employee.jenis_kelamin || employee.gender).toUpperCase();
  if (!raw) return UNKNOWN_LABEL;
  if (/^(L|LAKI|LAKI-LAKI|LAKI LAKI|MALE|M)$/.test(raw)) return "Laki-laki";
  if (/^(P|PEREMPUAN|FEMALE|F|WANITA)$/.test(raw)) return "Perempuan";
  return raw;
}

function educationLabel(employee) {
  const raw = normalizedText(employee.pendidikan || employee.pendidikan_terakhir).toUpperCase();
  return raw || UNKNOWN_LABEL;
}

function bump(map, name, active) {
  const key = name || UNKNOWN_LABEL;
  const current = map.get(key) || { name: key, total: 0, active: 0, inactive: 0 };
  current.total += 1;
  if (active) current.active += 1;
  else current.inactive += 1;
  map.set(key, current);
  return current;
}

function sortedDistribution(rows, limit = 0) {
  const list = [...rows].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return String(left.name).localeCompare(String(right.name), "id");
  });
  return limit > 0 ? list.slice(0, limit) : list;
}

function simpleCountMap(employees, labelFn, limit = 0) {
  const map = new Map();
  employees.forEach(employee => {
    const label = labelFn(employee) || UNKNOWN_LABEL;
    map.set(label, (map.get(label) || 0) + 1);
  });
  const rows = [...map.entries()].map(([name, count]) => ({ name, count }));
  rows.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return String(left.name).localeCompare(String(right.name), "id");
  });
  return limit > 0 ? rows.slice(0, limit) : rows;
}

/**
 * Susun seluruh agregat dashboard dari daftar karyawan.
 */
export function buildMasterEmployeeDashboard(employees = [], options = {}) {
  const list = (Array.isArray(employees) ? employees : []).filter(Boolean);
  const now = options.now instanceof Date && !Number.isNaN(options.now.getTime())
    ? options.now
    : new Date(options.now || Date.now());
  const contractWindowDays = Math.max(0, Number(options.contractWindowDays) || 90);
  const newHireDays = Math.max(0, Number(options.newHireDays) || 90);

  const todayKey = localDateKey(now);
  const todayNumber = dayNumber(todayKey);

  const byBranchMap = new Map();
  const byDivisionMap = new Map();
  let activeCount = 0;

  const contractExpiring = [];
  const contractExpired = [];
  const newHires = [];

  list.forEach(employee => {
    const active = employeeIsActive(employee);
    if (active) activeCount += 1;

    bump(byBranchMap, employeeBranchName(employee), active);
    bump(byDivisionMap, employeeDivisionName(employee), active);

    const contractKey = toDateKey(employee.kontrak_habis || employee.tanggal_kontrak_berakhir);
    if (active && contractKey && todayNumber !== null) {
      const contractNumber = dayNumber(contractKey);
      if (contractNumber !== null) {
        const daysLeft = contractNumber - todayNumber;
        const row = {
          employee,
          name: employeeDisplayName(employee),
          nik: employeeNik(employee),
          branch: employeeBranchName(employee),
          division: employeeDivisionName(employee),
          position: normalizedText(employee.jabatan) || UNKNOWN_LABEL,
          contractDate: contractKey,
          daysLeft
        };
        if (daysLeft < 0) contractExpired.push(row);
        else if (daysLeft <= contractWindowDays) contractExpiring.push(row);
      }
    }

    const joinKey = toDateKey(employee.tanggal_join || employee.tanggal_masuk || employee.join_date);
    if (active && joinKey && todayNumber !== null) {
      const joinNumber = dayNumber(joinKey);
      if (joinNumber !== null) {
        const daysAgo = todayNumber - joinNumber;
        if (daysAgo >= 0 && daysAgo <= newHireDays) {
          newHires.push({
            employee,
            name: employeeDisplayName(employee),
            nik: employeeNik(employee),
            branch: employeeBranchName(employee),
            division: employeeDivisionName(employee),
            position: normalizedText(employee.jabatan) || UNKNOWN_LABEL,
            joinDate: joinKey,
            daysAgo
          });
        }
      }
    }
  });

  contractExpiring.sort((left, right) => left.daysLeft - right.daysLeft);
  contractExpired.sort((left, right) => right.daysLeft - left.daysLeft);
  newHires.sort((left, right) => left.daysAgo - right.daysAgo);

  const completenessChecks = [
    { key: "email", label: "Email aktif", has: employee => Boolean(normalizedText(employee.email || employee.email_perusahaan)) },
    { key: "phone", label: "No. HP aktif", has: employee => Boolean(normalizedText(employee.no_hp_aktif || employee.no_hp)) },
    { key: "nik_ktp", label: "NIK KTP", has: employee => Boolean(normalizedText(employee.nik_ktp || employee.no_ktp)) },
    { key: "bpjs_tk", label: "BPJS Ketenagakerjaan", has: employee => Boolean(normalizedText(employee.bpjs_tk || employee.no_bpjs_tk)) },
    { key: "bpjs_kes", label: "BPJS Kesehatan", has: employee => Boolean(normalizedText(employee.bpjs_kes || employee.no_bpjs_kes)) },
    { key: "join_date", label: "Tanggal join", has: employee => Boolean(toDateKey(employee.tanggal_join || employee.tanggal_masuk)) },
    { key: "contract_end", label: "Tanggal kontrak berakhir", has: employee => Boolean(toDateKey(employee.kontrak_habis)) },
    { key: "address", label: "Alamat domisili", has: employee => Boolean(normalizedText(employee.alamat || employee.alamat_domisili)) }
  ];

  const completeness = completenessChecks.map(check => {
    const missing = list.filter(employee => !check.has(employee)).length;
    return {
      key: check.key,
      label: check.label,
      missing,
      complete: list.length - missing,
      percent: list.length ? Math.round(((list.length - missing) / list.length) * 1000) / 10 : 0
    };
  });

  return {
    total: list.length,
    active: activeCount,
    inactive: list.length - activeCount,
    branches: byBranchMap.size,
    divisions: byDivisionMap.size,
    byBranch: sortedDistribution([...byBranchMap.values()]),
    byDivision: sortedDistribution([...byDivisionMap.values()]),
    byEmploymentStatus: simpleCountMap(list, employeeEmploymentStatus),
    byGender: simpleCountMap(list, genderLabel),
    byAge: simpleCountMap(list, employee => ageBucket(ageFromBirthDate(employee.tanggal_lahir, now))),
    byTenure: simpleCountMap(list, employee => tenureBucket(tenureMonthsFromJoin(employee.tanggal_join || employee.tanggal_masuk, now))),
    byEducation: simpleCountMap(list, educationLabel),
    contractExpiring,
    contractExpired,
    newHires,
    completeness,
    contractWindowDays,
    newHireDays,
    todayKey
  };
}

function searchText(employee) {
  return [
    employeeDisplayName(employee),
    employeeNik(employee),
    employee.jabatan || "",
    employee.email || employee.email_perusahaan || "",
    employee.no_hp_aktif || employee.no_hp || "",
    employeeBranchName(employee),
    employeeDivisionName(employee),
    employeeEmploymentStatus(employee)
  ].join(" ").toLowerCase();
}

/** Filter interaktif dashboard. */
export function filterMasterEmployees(employees = [], filters = {}) {
  const keyword = String(filters.search || "").trim().toLowerCase();
  const branch = String(filters.branch || "").trim();
  const division = String(filters.division || "").trim();
  const active = String(filters.active || "").trim().toUpperCase();
  const employment = String(filters.employment || "").trim();

  return (Array.isArray(employees) ? employees : []).filter(employee => {
    if (branch && employeeBranchName(employee) !== branch) return false;
    if (division && employeeDivisionName(employee) !== division) return false;
    if (active && employeeActiveStatus(employee) !== active) return false;
    if (employment && employeeEmploymentStatus(employee) !== employment) return false;
    if (keyword && !searchText(employee).includes(keyword)) return false;
    return true;
  });
}

export function masterEmployeeFilterOptions(employees = []) {
  const list = Array.isArray(employees) ? employees : [];
  const branches = [...new Set(list.map(employeeBranchName))].sort((a, b) => a.localeCompare(b, "id"));
  const divisions = [...new Set(list.map(employeeDivisionName))].sort((a, b) => a.localeCompare(b, "id"));
  const employments = [...new Set(list.map(employeeEmploymentStatus))].sort((a, b) => a.localeCompare(b, "id"));
  return { branches, divisions, employments };
}
