import { test } from "node:test";
import { strict as assert } from "node:assert";
import { MONTHLY_METRICS, monthlyMetricRows, validateMonthlyAchievement } from "../js/monthly-achievement.mjs";

test("monthly achievement preserves distinct targets and handles overdue as a maximum", () => {
  const target = { periode: "2026-09", kategori: "SALES", target_volume_dulux: 10, target_overdue_piutang: 20000000,
    capaian_bulanan: { nilai: { target_volume_dulux: 8, target_overdue_piutang: 10000000 } } };
  const rows = monthlyMetricRows(target);
  assert.equal(rows.find(row => row.key === "target_volume_dulux").attainment, 80);
  assert.equal(rows.find(row => row.key === "target_overdue_piutang").attainment, 100);
  assert.equal(rows.find(row => row.key === "target_ao_ici").actual, null);
  assert.equal(monthlyMetricRows({ kategori: "SALES", capaian_bulanan: { nilai: { target_ao_ici: "" } } }).find(row => row.key === "target_ao_ici").actual, null);
  assert.equal(rows.length, MONTHLY_METRICS.SALES.length);
});

test("monthly achievement rejects incomplete, negative, and out of range evidence", () => {
  const target = { periode: "2026-09", kategori: "NON_SALES" };
  const valid = Object.fromEntries(MONTHLY_METRICS.NON_SALES.map(metric => [metric.key, 0]));
  assert.equal(validateMonthlyAchievement(target, valid), null);
  assert.match(validateMonthlyAchievement(target, { ...valid, target_sop_tugas: "" }), /Isi realisasi/);
  assert.match(validateMonthlyAchievement(target, { ...valid, target_sop_tugas: -1 }), /angka positif/);
  assert.match(validateMonthlyAchievement(target, { ...valid, target_sop_tugas: 101 }), /100%/);
});
