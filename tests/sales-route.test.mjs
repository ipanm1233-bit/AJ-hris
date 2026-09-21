import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyDailyRouteOverride, buildDailyRouteReconciliation, calculateFuelClaim } from "../js/sales-route.mjs";

test("daily route override does not mutate the shared salesman route", () => {
  const base = { sales_points: { S01: { start_gps: "-6.1, 108.1", end_gps: "-6.2, 108.2" } } };
  const result = applyDailyRouteOverride(base, { start_gps: "-7.1, 109.1" }, "S01");
  assert.equal(result.sales_points.S01.start_gps, "-7.1, 109.1");
  assert.equal(result.sales_points.S01.end_gps, "-6.2, 108.2");
  assert.equal(base.sales_points.S01.start_gps, "-6.1, 108.1");
});

test("weekly reconciliation uses odometer as the fuel claim basis", () => {
  assert.equal(calculateFuelClaim(25), 10000);
  assert.deepEqual(buildDailyRouteReconciliation({ gpsKm: 20.2, odometerKm: 25, storeCount: 8 }), {
    storeCount: 8,
    gpsKm: 20.2,
    odometerKm: 25,
    differenceKm: 4.8,
    claimAmount: 10000
  });
});

test("sales PDF contains daily visit, distance, claim and reconciliation details", () => {
  const source = readFileSync(new URL("../js/views/sales-track.js", import.meta.url), "utf8");
  assert.match(source, /Titik awal.*khusus tanggal|khusus tanggal.*berhasil disimpan/i);
  assert.match(source, /Google Maps:.*dailyRecon\.gpsKm/);
  assert.match(source, /Odometer:.*dailyRecon\.odometerKm/);
  assert.match(source, /Klaim: Rp.*dailyRecon\.claimAmount/);
  assert.match(source, /value="PDF_FULL" \$\{defaultFormat === "PDF" \? "checked"/);
});
