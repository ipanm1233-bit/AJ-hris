import test from "node:test";
import assert from "node:assert/strict";
import {
  KPI_ROLE_STANDARDS,
  mapEmployeesToKpiStandards,
  resolveKpiStandard,
  standardToTemplatePayload,
  validateKpiStandards
} from "../js/kpi-role-standards.mjs";

test("all role standards are unique and weighted exactly 100 percent", () => {
  assert.ok(KPI_ROLE_STANDARDS.length >= 20);
  assert.deepEqual(validateKpiStandards(), []);
  assert.equal(new Set(KPI_ROLE_STANDARDS.map(item => item.key)).size, KPI_ROLE_STANDARDS.length);
});

test("resolves representative roles with leader precedence and branch-specific sales", () => {
  assert.equal(resolveKpiStandard({ jabatan: "Koordinator Sales", divisi: "Sales", cabang: "Cirebon" }).key, "sales_supervisor");
  assert.equal(resolveKpiStandard({ jabatan: "Sales", divisi: "Sales", cabang: "Cirebon" }).key, "sales_cirebon");
  assert.equal(resolveKpiStandard({ jabatan: "Salesman", divisi: "Sales", cabang: "Malang" }).key, "sales_malang");
  assert.equal(resolveKpiStandard({ jabatan: "Admin Sales", divisi: "Admin", cabang: "Cirebon" }).key, "sales_admin");
  assert.equal(resolveKpiStandard({ jabatan: "Warehouse Leader", divisi: "Warehouse" }).key, "warehouse_leader");
  assert.equal(resolveKpiStandard({ jabatan: "Kasir", divisi: "Finance" }).key, "finance_cashier");
  assert.equal(resolveKpiStandard({ jabatan: "Satpam", divisi: "HRGA" }).key, "security");
});

test("unknown roles receive an explicit generic fallback instead of a wrong standard", () => {
  const standard = resolveKpiStandard({ jabatan: "Peran Baru", divisi: "Divisi Baru" });
  assert.equal(standard.key, "generic_staff");
  assert.match(standard.name, /Fallback/);
});

test("maps every employee and builds editable Firestore template payload", () => {
  const employees = [
    { nama_karyawan: "Ani", jabatan: "Accounting", divisi: "Finance" },
    { nama_karyawan: "Budi", jabatan: "Peran Baru", divisi: "Divisi Baru" }
  ];
  const mapping = mapEmployeesToKpiStandards(employees);
  assert.equal(mapping.length, 2);
  assert.ok(mapping.every(item => item.standard));
  const payload = standardToTemplatePayload(mapping[0].standard, [employees[0]]);
  assert.equal(payload.is_system_standard, true);
  assert.deepEqual(payload.karyawan_assigned, ["Ani"]);
  assert.equal(payload.soal_json.reduce((sum, item) => sum + item.bobot, 0), 100);
  assert.equal(payload.decision_policy, "REKOMENDASI_HRD_DENGAN_VALIDASI_BUKTI");
});
