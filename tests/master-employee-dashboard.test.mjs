import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EMPLOYEE_ACTIVE,
  EMPLOYEE_INACTIVE,
  UNKNOWN_LABEL,
  employeeActiveStatus,
  employeeIsActive,
  employeeBranchName,
  employeeDivisionName,
  employeeEmploymentStatus,
  ageFromBirthDate,
  tenureMonthsFromJoin,
  ageBucket,
  tenureBucket,
  buildMasterEmployeeDashboard,
  filterMasterEmployees,
  masterEmployeeFilterOptions
} from "../js/master-employee-dashboard.mjs";

const NOW = new Date(2026, 10, 6);

const employees = [
  {
    nik_karyawan: "A1", nama_karyawan: "Andi", cabang: "Malang", divisi: "Sales",
    status_karyawan: "PKWTT", aktif_tdk_aktif: "AKTIF", jenis_kelamin: "LAKI-LAKI",
    tanggal_lahir: "1990-05-10", tanggal_join: "2020-01-15", kontrak_habis: "2026-12-31",
    email: "andi@example.com", no_hp_aktif: "0812", nik_ktp: "357001", bpjs_tk: "1", bpjs_kes: "2", alamat: "Jl. A"
  },
  {
    nik_karyawan: "A2", nama_karyawan: "Bunga", cabang: "Malang", divisi: "Sales",
    status_karyawan: "PKWT", aktif_tdk_aktif: "TIDAK AKTIF", jenis_kelamin: "PEREMPUAN",
    tanggal_lahir: "1995-03-20", tanggal_join: "2026-09-01", kontrak_habis: "2026-10-31",
    email: "bunga@example.com", no_hp_aktif: "0813", nik_ktp: "", bpjs_tk: "", bpjs_kes: "", alamat: "Jl. B"
  },
  {
    nik_karyawan: "A3", nama_karyawan: "Candra", cabang: "Cirebon", divisi: "Finance",
    status_karyawan: "PKWTT", aktif_tdk_aktif: "AKTIF", jenis_kelamin: "LAKI-LAKI",
    tanggal_lahir: "1980-01-01", tanggal_join: "2010-01-01", kontrak_habis: "",
    email: "", no_hp_aktif: "", nik_ktp: "", bpjs_tk: "", bpjs_kes: "", alamat: ""
  },
  {
    nik_karyawan: "A4", nama_karyawan: "Dewi", cabang: "Cirebon", divisi: "Finance",
    status_karyawan: "PKWTT", aktif_tdk_aktif: "AKTIF", jenis_kelamin: "PEREMPUAN",
    tanggal_lahir: "2000-12-01", tanggal_join: "2026-10-15", kontrak_habis: "2027-01-15",
    email: "dewi@example.com", no_hp_aktif: "0815", nik_ktp: "357004", bpjs_tk: "1", bpjs_kes: "2", alamat: "Jl. D"
  },
  {
    nik_karyawan: "A5", nama_karyawan: "Eko", cabang: "", divisi: "",
    status_karyawan: "", aktif_tdk_aktif: "", jenis_kelamin: "",
    tanggal_lahir: "", tanggal_join: "", kontrak_habis: "",
    email: "eko@example.com", no_hp_aktif: "0816", nik_ktp: "", bpjs_tk: "", bpjs_kes: "", alamat: "Jl. E"
  }
];

test("employeeActiveStatus membaca AKTIF, TIDAK AKTIF, dan fallback status kerja", () => {
  assert.equal(employeeActiveStatus({ aktif_tdk_aktif: "AKTIF" }), EMPLOYEE_ACTIVE);
  assert.equal(employeeActiveStatus({ aktif_tdk_aktif: "TIDAK AKTIF" }), EMPLOYEE_INACTIVE);
  assert.equal(employeeActiveStatus({ "aktif/tidak_aktif": "NONAKTIF" }), EMPLOYEE_INACTIVE);
  assert.equal(employeeActiveStatus({ status_karyawan: "RESIGN" }), EMPLOYEE_INACTIVE);
  assert.equal(employeeActiveStatus({}), EMPLOYEE_ACTIVE);
  assert.equal(employeeIsActive({ aktif_tdk_aktif: "TIDAK AKTIF" }), false);
});

test("helper identitas memakai fallback yang konsisten", () => {
  assert.equal(employeeBranchName({ cabang: "" }), UNKNOWN_LABEL);
  assert.equal(employeeDivisionName({ departemen: "HRGA" }), "HRGA");
  assert.equal(employeeEmploymentStatus({}), UNKNOWN_LABEL);
});

test("usia dan masa kerja dihitung dari tanggal", () => {
  assert.equal(ageFromBirthDate("1990-05-10", NOW), 36);
  assert.equal(ageFromBirthDate("2000-12-01", NOW), 25);
  assert.equal(ageFromBirthDate("", NOW), null);
  assert.equal(tenureMonthsFromJoin("2020-01-15", NOW), 81);
  assert.equal(tenureMonthsFromJoin("2026-10-15", NOW), 0);
  assert.equal(tenureMonthsFromJoin("", NOW), null);
  assert.equal(ageBucket(36), "30–39 tahun");
  assert.equal(tenureBucket(81), "6–9 tahun");
});

test("buildMasterEmployeeDashboard menghitung total, sebaran, kontrak, dan kelengkapan", () => {
  const data = buildMasterEmployeeDashboard(employees, { now: NOW, contractWindowDays: 90, newHireDays: 90 });

  assert.equal(data.total, 5);
  assert.equal(data.active, 4);
  assert.equal(data.inactive, 1);
  assert.equal(data.branches, 3);
  assert.equal(data.divisions, 3);

  assert.deepEqual(data.byBranch.map(row => row.name), ["Cirebon", "Malang", UNKNOWN_LABEL]);
  assert.deepEqual(data.byBranch[1], { name: "Malang", total: 2, active: 1, inactive: 1 });
  assert.deepEqual(data.byDivision.map(row => row.name), ["Finance", "Sales", UNKNOWN_LABEL]);
  assert.deepEqual(data.byEmploymentStatus.map(row => [row.name, row.count]), [["PKWTT", 3], ["PKWT", 1], [UNKNOWN_LABEL, 1]]);
  assert.deepEqual(data.byGender.map(row => [row.name, row.count]), [["Laki-laki", 2], ["Perempuan", 2], [UNKNOWN_LABEL, 1]]);
  assert.deepEqual(data.byAge.find(row => row.name === "30–39 tahun"), { name: "30–39 tahun", count: 2 });
  assert.deepEqual(data.byTenure.find(row => row.name === "< 1 tahun"), { name: "< 1 tahun", count: 2 });

  assert.equal(data.contractExpiring.length, 2);
  assert.deepEqual(data.contractExpiring.map(row => row.name), ["Andi", "Dewi"]);
  assert.equal(data.contractExpiring[0].daysLeft, 55);
  assert.equal(data.contractExpired.length, 0);
  assert.deepEqual(data.newHires.map(row => row.name), ["Dewi"]);

  const email = data.completeness.find(item => item.key === "email");
  assert.equal(email.missing, 1);
  assert.equal(email.percent, 80);
  const nikKtp = data.completeness.find(item => item.key === "nik_ktp");
  assert.equal(nikKtp.missing, 3);
  assert.equal(nikKtp.percent, 40);
  const contract = data.completeness.find(item => item.key === "contract_end");
  assert.equal(contract.percent, 60);
});

test("filterMasterEmployees mendukung cabang, divisi, status, dan pencarian", () => {
  assert.equal(filterMasterEmployees(employees, { branch: "Malang" }).length, 2);
  assert.equal(filterMasterEmployees(employees, { active: EMPLOYEE_INACTIVE }).length, 1);
  assert.equal(filterMasterEmployees(employees, { employment: "PKWTT" }).length, 3);
  assert.equal(filterMasterEmployees(employees, { branch: "Cirebon", active: EMPLOYEE_ACTIVE }).length, 2);
  assert.deepEqual(filterMasterEmployees(employees, { search: "dewi" }).map(row => row.nama_karyawan), ["Dewi"]);
  assert.equal(filterMasterEmployees(employees, { search: "0815" }).length, 1);
});

test("masterEmployeeFilterOptions mengurutkan pilihan filter", () => {
  const options = masterEmployeeFilterOptions(employees);
  assert.deepEqual(options.branches, ["Cirebon", "Malang", UNKNOWN_LABEL]);
  assert.deepEqual(options.divisions, ["Finance", "Sales", UNKNOWN_LABEL]);
  assert.deepEqual(options.employments, ["PKWT", "PKWTT", UNKNOWN_LABEL]);
});

test("Data Master memasang tab dashboard dan memuat modulnya", () => {
  const html = fs.readFileSync("views/manajemen-data.html", "utf8");
  assert.match(html, /data-mtab="dashboard"/);
  assert.match(html, /id="md-panel-dashboard"/);

  const view = fs.readFileSync("js/views/manajemen-data.js", "utf8");
  assert.match(view, /mountMasterEmployeeDashboard/);
  assert.match(view, /tab === "karyawan"\) await loadKaryawanTab\(\)/);
  assert.match(view, /loadDashboardTab\(\)/);
});
