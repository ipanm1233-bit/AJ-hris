import test from "node:test";
import assert from "node:assert/strict";
import { belongsToEmployee, employeeHistoryRows } from "../js/employee-history.mjs";

test("history matches NIK before name so another employee's notes never appear", () => {
  const employee = { nik_karyawan: "123", nama_karyawan: "Dewi", cabang: "Cirebon" };
  assert.equal(belongsToEmployee({ nik_dinilai: "456", nama_dinilai: "Dewi" }, employee), false);
  assert.equal(belongsToEmployee({ nik: "123", nama_karyawan: "Nama Lama" }, employee), true);
  assert.deepEqual(employeeHistoryRows([
    { nik: "456", nama_karyawan: "Dewi" },
    { nik: "123", nama_karyawan: "Dewi" }
  ], employee).map(row => row.nik), ["123"]);
});

test("name-only legacy records require exact name and matching branch if known", () => {
  const employee = { nik: "123", nama_karyawan: "Ayu", cabang: "Malang" };
  assert.equal(belongsToEmployee({ nama_karyawan: "Ayu", cabang: "Cirebon" }, employee), false);
  assert.equal(belongsToEmployee({ nama_karyawan: "Ayu", cabang: "Malang" }, employee), true);
  assert.equal(belongsToEmployee({ nama_karyawan: "Ayu R" }, employee), false);
});
