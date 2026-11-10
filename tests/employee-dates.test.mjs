import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeDateOnly,
  employeeBirthDate,
  employeeJoinDate,
  employeeContractEndDate,
  normalizeEmployeeDateFields
} from "../js/employee-dates.mjs";

test("normalizeDateOnly mempertahankan tanggal date-only tanpa pergeseran zona waktu", () => {
  assert.equal(normalizeDateOnly("1986-11-10"), "1986-11-10");
  assert.equal(normalizeDateOnly("1986/11/10"), "1986-11-10");
  assert.equal(normalizeDateOnly("10/11/1986"), "1986-11-10");
  assert.equal(normalizeDateOnly("10-11-1986"), "1986-11-10");
});

test("normalizeDateOnly membaca ISO UTC midnight sebagai tanggal UTC", () => {
  assert.equal(normalizeDateOnly("1986-11-10T00:00:00.000Z"), "1986-11-10");
  assert.equal(normalizeDateOnly(new Date(Date.UTC(1986, 10, 10))), "1986-11-10");
});

test("normalizeDateOnly membaca serial Excel dan timestamp", () => {
  assert.equal(normalizeDateOnly(31726), "1986-11-10");
  assert.equal(normalizeDateOnly({ seconds: 531964800 }), "1986-11-10");
  assert.equal(normalizeDateOnly({ toDate: () => new Date(Date.UTC(1986, 10, 10)) }), "1986-11-10");
});

test("employeeBirthDate/JoinDate memprioritaskan alias sumber tgl_lahir dan tgl_join", () => {
  const employee = {
    tgl_lahir: "1986-11-10",
    tanggal_lahir: "1986-11-09",
    tgl_join: "2010-01-07",
    tanggal_join: "2010-01-06",
    kontrak_habis: "2026-10-22"
  };
  assert.equal(employeeBirthDate(employee), "1986-11-10");
  assert.equal(employeeJoinDate(employee), "2010-01-07");
  assert.equal(employeeContractEndDate(employee), "2026-10-22");

  const normalized = normalizeEmployeeDateFields(employee);
  assert.equal(normalized.tanggal_lahir, "1986-11-10");
  assert.equal(normalized.tgl_lahir, "1986-11-10");
  assert.equal(normalized.tanggal_join, "2010-01-07");
  assert.equal(normalized.tgl_join, "2010-01-07");
  // Record asli tidak boleh berubah.
  assert.equal(employee.tanggal_lahir, "1986-11-09");
});

test("normalizeEmployeeDateFields memakai fallback tanggal_* bila alias tgl_* tidak ada", () => {
  const normalized = normalizeEmployeeDateFields({
    tanggal_lahir: "1995-03-20",
    tanggal_join: "2020-08-01",
    kontrak_habis: "2027-01-31"
  });
  assert.equal(normalized.tgl_lahir, "1995-03-20");
  assert.equal(normalized.tgl_join, "2020-08-01");
  assert.equal(normalized.kontrak_habis, "2027-01-31");
});

test("tanggal kosong atau tidak valid tidak menghasilkan field palsu", () => {
  const normalized = normalizeEmployeeDateFields({ nama_karyawan: "Tanpa Tanggal", tanggal_lahir: "" });
  assert.equal(normalized.tanggal_lahir, "");
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "tgl_lahir"), false);
  assert.equal(normalizeDateOnly("bukan tanggal"), "");
});

test("kalender memakai alias tanggal yang benar dan skeleton tanpa teks loading", () => {
  const calendar = fs.readFileSync("js/views/kalender-hr.js", "utf8");
  assert.match(calendar, /employeeBirthDate/);
  assert.match(calendar, /employeeJoinDate/);
  assert.match(calendar, /renderCalendarSkeleton/);
  assert.doesNotMatch(calendar, /Memuat Kalender/);
});
