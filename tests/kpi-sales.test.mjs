import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SALES_INDICATOR_TARGET_MAP,
  SALES_VOLUME_INDICATOR_KEYS,
  resolveSalesIndicatorSpec,
  computeSalesAchievementScore,
  formatSalesTarget,
  findSalesTarget,
  formatSalesAchievement,
  normalizeSalesIndicatorList,
  sumVolumeTargets,
  sumVolumeActuals,
  hasVolumeActual,
  roundVolumeTotal
} from "../js/kpi-sales.mjs";
import { monthlyMetricRows, validateMonthlyAchievement } from "../js/monthly-achievement.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("indikator Sales dipetakan ke field target bulanan yang benar", () => {
  assert.equal(SALES_INDICATOR_TARGET_MAP.sales_value_prima.targetKey, "target_value_prima");
  assert.equal(SALES_INDICATOR_TARGET_MAP.sales_value_dcota.targetKey, "target_value_dcota");
  assert.equal(SALES_INDICATOR_TARGET_MAP.value_penjualan_tertagih.targetKey, "target_value_penjualan");
  assert.equal(SALES_INDICATOR_TARGET_MAP.overdue_piutang.lowerIsBetter, true);
  assert.equal(SALES_INDICATOR_TARGET_MAP.total_volume_ici.targetKey, "target_total_volume_ici");
  assert.equal(SALES_INDICATOR_TARGET_MAP.total_volume_ici.derived, true);
  assert.deepEqual(SALES_INDICATOR_TARGET_MAP.total_volume_ici.derivedFrom, SALES_VOLUME_INDICATOR_KEYS);
  assert.equal(SALES_INDICATOR_TARGET_MAP.total_target_penjualan_ici, undefined);
});

test("resolveSalesIndicatorSpec memakai target bulanan lalu fallback default indikator", () => {
  const fromTarget = resolveSalesIndicatorSpec(
    { key: "sales_value_prima", defaultTarget: 50000000 },
    { target_value_prima: 75000000 }
  );
  assert.equal(fromTarget.targetValue, 75000000);
  assert.equal(fromTarget.unit, "Rp");
  assert.equal(fromTarget.hasTarget, true);
  assert.equal(fromTarget.derived, false);

  const fallback = resolveSalesIndicatorSpec({ key: "ao_ici", defaultTarget: 25 }, null);
  assert.equal(fallback.targetValue, 25);
  assert.equal(fallback.unit, "Toko");

  const derived = resolveSalesIndicatorSpec({ key: "total_volume_ici", defaultTarget: 40 }, { target_total_volume_ici: 55 });
  assert.equal(derived.targetValue, 55);
  assert.equal(derived.unit, "Ton");
  assert.equal(derived.derived, true);
  assert.deepEqual(derived.derivedFrom, SALES_VOLUME_INDICATOR_KEYS);

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

test("Total Volume ICI menjumlahkan target empat volume produk", () => {
  const indicators = [
    { key: "volume_dulux", defaultTarget: 10 },
    { key: "volume_catylac", defaultTarget: 15 },
    { key: "volume_maxilite", defaultTarget: 10 },
    { key: "volume_aquashield", defaultTarget: 5 }
  ];
  const target = {
    target_volume_dulux: 3,
    target_volume_catylac: 4,
    target_volume_maxilite: 2,
    target_volume_aquashield: 1
  };
  assert.equal(sumVolumeTargets(target, indicators), 10);
  // Tanpa target bulanan, nilai bawaan indikator dipakai.
  assert.equal(sumVolumeTargets(null, indicators), 40);
  assert.equal(sumVolumeTargets(null, []), 0);
});

test("Total Volume ICI menjumlahkan capaian harian empat volume produk", () => {
  const actuals = {
    volume_dulux: 1,
    volume_catylac: 2,
    volume_maxilite: 2,
    volume_aquashield: 3
  };
  assert.equal(sumVolumeActuals(actuals), 8);
  assert.equal(sumVolumeActuals({ ...actuals, volume_dulux: -1, volume_catylac: "x" }), 5);
  assert.equal(sumVolumeActuals({}), 0);

  assert.equal(hasVolumeActual(actuals), true);
  assert.equal(hasVolumeActual({ volume_dulux: 0 }), true);
  assert.equal(hasVolumeActual({ volume_dulux: "" }), false);
  assert.equal(hasVolumeActual({}), false);

  assert.equal(roundVolumeTotal(10.000000000000002), 10);
  assert.equal(roundVolumeTotal(10.12345), 10.123);
  assert.equal(roundVolumeTotal(null), 0);
});

test("skor Total Volume ICI dihitung dari total capaian dibagi total target", () => {
  const indicators = [
    { key: "volume_dulux", defaultTarget: 10 },
    { key: "volume_catylac", defaultTarget: 15 },
    { key: "volume_maxilite", defaultTarget: 10 },
    { key: "volume_aquashield", defaultTarget: 5 }
  ];
  const target = {
    target_volume_dulux: 3,
    target_volume_catylac: 4,
    target_volume_maxilite: 2,
    target_volume_aquashield: 1
  };
  const actuals = {
    volume_dulux: 1,
    volume_catylac: 2,
    volume_maxilite: 2,
    volume_aquashield: 3
  };
  const totalTarget = sumVolumeTargets(target, indicators);
  const totalActual = roundVolumeTotal(sumVolumeActuals(actuals));
  assert.equal(totalTarget, 10);
  assert.equal(totalActual, 8);
  assert.equal(computeSalesAchievementScore({ actual: totalActual, target: totalTarget }), 80);
});

test("modal target Sales menghitung Total Target Penjualan ICI dari empat volume", () => {
  const source = read("js/views/penilaian-kontrak.js");
  assert.match(source, /from "\.\.\/kpi-sales\.mjs"/);
  assert.match(source, /id="tgt-val-prima"/);
  assert.match(source, /id="tgt-val-dcota"/);
  assert.match(source, /id="tgt-total-volume"/);
  assert.doesNotMatch(source, /id="tgt-val-total-ici"/);
  assert.doesNotMatch(source, /payload\.target_total_penjualan_ici/);
  assert.match(source, /payload\.target_total_volume_ici/);
  assert.match(source, /syncTargetVolume/);
  assert.match(source, /indikator: "Value Prima"/);
  assert.match(source, /indikator: "Value DCota"/);
  assert.match(source, /key: "total_volume_ici"/);
  assert.doesNotMatch(source, /key: "total_target_penjualan_ici"/);
});

test("input harian Sales menjumlahkan otomatis Total Volume ICI", () => {
  const source = read("js/views/penilaian-kontrak.js");
  assert.match(source, /ph-actual-input/);
  assert.match(source, /computeSalesAchievementScore\(/);
  assert.match(source, /resolveSalesIndicatorSpec\(ind, salesTarget\)/);
  assert.match(source, /data-target-value="\$\{salesSpec\.targetValue \|\| 0\}"/);
  assert.match(source, /data-total-volume-display/);
  assert.match(source, /syncTotalVolume\(/);
  assert.match(source, /sumVolumeActuals\(/);
  assert.match(source, /renderScoreBadge\(/);
  assert.match(source, /indikator_nilai: indikatorNilaiMap/);
  assert.match(source, /indikator_target: indikatorTargetMap/);
  // Skor cepat 0–100 tetap dipakai untuk indikator non-Sales.
  assert.match(source, /class="btn-ph-quick/);
  assert.match(source, /class="ph-score-input/);
});

test("daftar indikator Sales lama dibersihkan dan Total Volume ICI ditambahkan", () => {
  const defaults = [
    { key: "total_volume_ici", principle: "ICI", aspek: "Sales Volume (SO)", indikator: "Total Volume ICI", unit: "Ton", defaultTarget: 40 }
  ];
  const legacy = [
    { key: "sales_value_prima", indikator: "Sales Value PRIMA Tertagih", unit: "Rp" },
    { key: "sales_value_dcota", indikator: "Sales Value DCOTA Tertagih", unit: "Rp" },
    { key: "total_target_penjualan_ici", indikator: "Total Target Penjualan ICI", unit: "Rp" }
  ];
  const normalized = normalizeSalesIndicatorList(legacy, defaults);
  assert.equal(normalized.find(ind => ind.key === "sales_value_prima").indikator, "Value Prima");
  assert.equal(normalized.find(ind => ind.key === "sales_value_dcota").indikator, "Value DCota");
  assert.equal(normalized.some(ind => ind.key === "total_target_penjualan_ici"), false);
  assert.equal(normalized.filter(ind => ind.key === "total_volume_ici").length, 1);

  const alreadyPresent = normalizeSalesIndicatorList([
    ...legacy,
    { key: "total_volume_ici", indikator: "Total Volume ICI" }
  ], defaults);
  assert.equal(alreadyPresent.filter(ind => ind.key === "total_volume_ici").length, 1);
});

test("realisasi bulanan menjumlahkan Total Volume ICI dari empat volume", () => {
  const target = {
    kategori: "SALES",
    periode: "2026-11",
    target_volume_dulux: 10,
    target_volume_catylac: 15,
    target_volume_maxilite: 10,
    target_volume_aquashield: 5,
    capaian_bulanan: {
      nilai: {
        target_volume_dulux: "3",
        target_volume_catylac: "5",
        target_volume_maxilite: "4",
        target_volume_aquashield: "2"
      }
    }
  };
  const rows = monthlyMetricRows(target);
  const total = rows.find(row => row.key === "target_total_volume_ici");
  assert.equal(total.target, 40);
  assert.equal(total.actual, 14);
  assert.equal(total.attainment, 35);
  assert.equal(rows.some(row => row.key === "target_total_penjualan_ici"), false);

  const values = {
    target_volume_dulux: "3",
    target_volume_catylac: "5",
    target_volume_maxilite: "4",
    target_volume_aquashield: "2",
    target_value_penjualan: "100000000",
    target_value_prima: "50000000",
    target_value_dcota: "50000000",
    target_overdue_piutang: "10000000",
    target_ao_ici: "25",
    target_ao_prima: "15",
    target_ao_dcota: "15"
  };
  assert.equal(validateMonthlyAchievement(target, values), null);
  assert.match(validateMonthlyAchievement(target, { ...values, target_volume_dulux: "" }), /Volume Dulux/);
});

test("metrik realisasi bulanan memakai Total Volume ICI otomatis", () => {
  const source = read("js/monthly-achievement.mjs");
  assert.match(source, /key: "target_total_volume_ici"/);
  assert.match(source, /derived: true/);
  assert.doesNotMatch(source, /key: "target_total_penjualan_ici"/);
});
