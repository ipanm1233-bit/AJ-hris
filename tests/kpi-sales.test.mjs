import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_INDICATOR_TARGET_MAP,
  resolveSalesIndicatorSpec,
  computeSalesAchievementScore,
  formatSalesTarget,
  findSalesTarget,
  formatSalesAchievement,
  normalizeSalesIndicatorList
} from "../js/kpi-sales.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("indikator Sales dipetakan ke field target bulanan yang benar", () => {
  assert.equal(SALES_INDICATOR_TARGET_MAP.sales_value_prima.targetKey, "target_value_prima");
  assert.equal(SALES_INDICATOR_TARGET_MAP.sales_value_dcota.targetKey, "target_value_dcota");
  assert.equal(SALES_INDICATOR_TARGET_MAP.total_target_penjualan_ici.targetKey, "target_total_penjualan_ici");
  assert.equal(SALES_INDICATOR_TARGET_MAP.value_penjualan_tertagih.targetKey, "target_value_penjualan");
  assert.equal(SALES_INDICATOR_TARGET_MAP.overdue_piutang.lowerIsBetter, true);
});

test("resolveSalesIndicatorSpec memakai target bulanan lalu fallback default indikator", () => {
  const fromTarget = resolveSalesIndicatorSpec(
    { key: "sales_value_prima", defaultTarget: 50000000 },
    { target_value_prima: 75000000 }
  );
  assert.equal(fromTarget.targetValue, 75000000);
  assert.equal(fromTarget.unit, "Rp");
  assert.equal(fromTarget.hasTarget, true);

  const fallback = resolveSalesIndicatorSpec({ key: "ao_ici", defaultTarget: 25 }, null);
  assert.equal(fallback.targetValue, 25);
  assert.equal(fallback.unit, "Toko");

  assert.equal(resolveSalesIndicatorSpec({ key: "total_weighted_target" }, {}), null);
  assert.equal(resolveSalesIndicatorSpec({ key: "cust_123" }, {}), null);
});

test("skor capaian Sales dihitung dari nilai nyata dibagi target", () => {
  assert.equal(computeSalesAchievementScore({ actual: 8, target: 10 }), 80);
  assert.equal(computeSalesAchievementScore({ actual: 12.5, target: 10 }), 100);
  assert.equal(computeSalesAchievementScore({ actual: 0, target: 10 }), 0);
  assert.equal(computeSalesAchievementScore({ actual: 8, target: 0 }), null);
  assert.equal(computeSalesAchievementScore({ actual: -1, target: 10 }), null);
  assert.equal(computeSalesAchievementScore({ actual: "", target: 10 }), null);
});

test("overdue piutang memakai batas maksimum, semakin kecil semakin baik", () => {
  assert.equal(computeSalesAchievementScore({ actual: 10000000, target: 20000000, lowerIsBetter: true }), 100);
  assert.equal(computeSalesAchievementScore({ actual: 25000000, target: 20000000, lowerIsBetter: true }), 80);
  assert.equal(computeSalesAchievementScore({ actual: 0, target: 20000000, lowerIsBetter: true }), 100);
  assert.equal(computeSalesAchievementScore({ actual: 5000000, target: 0, lowerIsBetter: true }), 0);
});

test("format nilai dan ringkasan capaian mudah dibaca", () => {
  assert.equal(formatSalesTarget(50000000, "Rp"), "Rp 50.000.000");
  assert.equal(formatSalesTarget(12.5, "Ton"), "12,5 Ton");
  assert.equal(formatSalesTarget(null, "Rp"), "-");
  assert.equal(formatSalesAchievement(8, 10, "Ton"), "8 Ton / 10 Ton (80%)");
});

test("findSalesTarget mencocokkan nama atau NIK dan periode bulan", () => {
  const targets = [
    { nama_karyawan: "Budi", nik_karyawan: "A-1", periode: "2026-11", kategori: "SALES" },
    { nama_karyawan: "Budi", nik_karyawan: "A-1", periode: "2026-10", kategori: "SALES" },
    { nama_karyawan: "Budi", nik_karyawan: "A-1", periode: "2026-11", kategori: "NON_SALES" }
  ];
  assert.equal(findSalesTarget(targets, { namaKaryawan: "Budi", periode: "2026-11-04" }).periode, "2026-11");
  assert.equal(findSalesTarget(targets, { nikKaryawan: "a-1", periode: "2026-10" }).periode, "2026-10");
  assert.equal(findSalesTarget(targets, { namaKaryawan: "Siti", periode: "2026-11" }), null);
});

test("modal target Sales memuat Value Prima, Value DCota, dan Total Target Penjualan ICI", () => {
  const source = read("js/views/penilaian-kontrak.js");
  assert.match(source, /from "\.\.\/kpi-sales\.mjs"/);
  assert.match(source, /id="tgt-val-prima"/);
  assert.match(source, /id="tgt-val-dcota"/);
  assert.match(source, /id="tgt-val-total-ici"/);
  assert.match(source, /payload\.target_value_prima/);
  assert.match(source, /payload\.target_value_dcota/);
  assert.match(source, /payload\.target_total_penjualan_ici/);
  assert.match(source, /key: "total_target_penjualan_ici"/);
  assert.match(source, /indikator: "Value Prima"/);
  assert.match(source, /indikator: "Value DCota"/);
});

test("input penilaian harian Sales memakai nilai capaian nyata dan menyimpan nilainya", () => {
  const source = read("js/views/penilaian-kontrak.js");
  assert.match(source, /ph-actual-input/);
  assert.match(source, /computeSalesAchievementScore\(/);
  assert.match(source, /resolveSalesIndicatorSpec\(ind, salesTarget\)/);
  assert.match(source, /data-target-value="\$\{salesSpec\.targetValue \|\| 0\}"/);
  assert.match(source, /indikator_nilai: indikatorNilaiMap/);
  assert.match(source, /indikator_target: indikatorTargetMap/);
  // Skor cepat 0–100 tetap dipakai untuk indikator non-Sales.
  assert.match(source, /class="btn-ph-quick/);
  assert.match(source, /class="ph-score-input/);
});

test("daftar indikator Sales lama diperbarui tanpa menduplikasi indikator", () => {
  const defaults = [
    { key: "total_target_penjualan_ici", principle: "ICI", aspek: "Total Penjualan ICI", indikator: "Total Target Penjualan ICI", unit: "Rp", defaultTarget: 150000000 }
  ];
  const legacy = [
    { key: "sales_value_prima", indikator: "Sales Value PRIMA Tertagih", unit: "Rp" },
    { key: "sales_value_dcota", indikator: "Sales Value DCOTA Tertagih", unit: "Rp" }
  ];
  const normalized = normalizeSalesIndicatorList(legacy, defaults);
  assert.equal(normalized.find(ind => ind.key === "sales_value_prima").indikator, "Value Prima");
  assert.equal(normalized.find(ind => ind.key === "sales_value_dcota").indikator, "Value DCota");
  assert.equal(normalized.filter(ind => ind.key === "total_target_penjualan_ici").length, 1);

  const alreadyPresent = normalizeSalesIndicatorList([
    ...legacy,
    { key: "total_target_penjualan_ici", indikator: "Total Target Penjualan ICI" }
  ], defaults);
  assert.equal(alreadyPresent.filter(ind => ind.key === "total_target_penjualan_ici").length, 1);
});

test("metrik realisasi bulanan mencakup target value PRIMA, DCOTA, dan total ICI", () => {
  const source = read("js/monthly-achievement.mjs");
  assert.match(source, /key: "target_value_prima"/);
  assert.match(source, /key: "target_value_dcota"/);
  assert.match(source, /key: "target_total_penjualan_ici"/);
});
