import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isPermanentEmployee,
  monthsSinceJoin,
  getAutoJatahTahunan,
  describeAnnualLeaveTier
} from "../js/leave-entitlement.mjs";

const REF = new Date(2026, 9, 17); // 17 Oktober 2026 (tanggal tetap agar tes deterministik)

function empAt(monthsAgo, extra = {}) {
  // tanggal_join DMY + bulan relative thn REF, memvalidasi parser "DD/MM/YYYY"
  const d = new Date(REF.getFullYear(), REF.getMonth() - monthsAgo, 17);
  const dmy = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return { tanggal_join: dmy, ...extra };
}

test("bulan kerja 1-3 (probation / kontrak pertama) belum berhak cuti tahunan", () => {
  assert.equal(getAutoJatahTahunan(empAt(0), REF), 0);
  assert.equal(getAutoJatahTahunan(empAt(1), REF), 0);
  assert.equal(getAutoJatahTahunan(empAt(2), REF), 0);
  assert.equal(getAutoJatahTahunan(empAt(3), REF), 0);
});

test("bulan ke-4 langsung mendapat 3 hari, lalu +1 hari tiap bulan", () => {
  assert.equal(getAutoJatahTahunan(empAt(4), REF), 3);   // bulan kerja ke-4
  assert.equal(getAutoJatahTahunan(empAt(5), REF), 4);   // bulan ke-5
  assert.equal(getAutoJatahTahunan(empAt(7), REF), 6);   // bulan ke-7
  assert.equal(getAutoJatahTahunan(empAt(10), REF), 9);  // bulan ke-10
  assert.equal(getAutoJatahTahunan(empAt(11), REF), 10); // bulan ke-11
});

test("masa kerja >= 1 tahun mendapat jatah penuh 12 hari", () => {
  assert.equal(getAutoJatahTahunan(empAt(12), REF), 12);
  assert.equal(getAutoJatahTahunan(empAt(24), REF), 12);
  assert.equal(getAutoJatahTahunan(empAt(60), REF), 12);
});

test("cuti penghargaan masa kerja tetap berlaku (6/8/10/11 tahun)", () => {
  assert.equal(getAutoJatahTahunan(empAt(72), REF), 13);
  assert.equal(getAutoJatahTahunan(empAt(96), REF), 14);
  assert.equal(getAutoJatahTahunan(empAt(120), REF), 15);
  assert.equal(getAutoJatahTahunan(empAt(132), REF), 16);
});

test("karyawan tetap (PKWTT/KARTAP/TETAP) langsung 12 hari setelah bulan ke-3", () => {
  assert.equal(isPermanentEmployee({ status_karyawan: "PKWTT (Karyawan Tetap)" }), true);
  assert.equal(isPermanentEmployee({ status_karyawan: "KARTAP" }), true);
  assert.equal(isPermanentEmployee({ status: "Tetap" }), true);
  assert.equal(isPermanentEmployee({ status_karyawan: "PKWT" }), false);

  assert.equal(getAutoJatahTahunan(empAt(5, { status_karyawan: "PKWTT" }), REF), 12);
  // bulan 1-3 tetap belum berhak, apapun statusnya (aturan karyawan baru)
  assert.equal(getAutoJatahTahunan(empAt(2, { status_karyawan: "PKWTT" }), REF), 0);
});

test("tanggal_join ISO & Firestore Timestamp tetap terbaca; tanpa join = jatah standar", () => {
  // 17 Sep 2026 -> 17 Okt 2026 = 1 bulan penuh (masa kerja 1-3 bulan: belum berhak)
  assert.equal(getAutoJatahTahunan({ tanggal_join: "2026-09-17" }, REF), 0);
  assert.equal(getAutoJatahTahunan({ tanggal_join: { toDate: () => new Date(2026, 6, 17) } }, REF), 0);
  assert.equal(getAutoJatahTahunan({ tanggal_join: "2025-09-17" }, REF), 12);
  assert.equal(getAutoJatahTahunan({}, REF), 12);
  assert.equal(monthsSinceJoin({ tanggal_join: "bukan-tanggal" }, REF), null);
});

test("describeAnnualLeaveTier mengklasifikasikan NONE / GROWING / FULL", () => {
  assert.equal(describeAnnualLeaveTier(empAt(2), REF).tier, "NONE");
  assert.equal(describeAnnualLeaveTier(empAt(6), REF).tier, "GROWING");
  assert.equal(describeAnnualLeaveTier(empAt(12), REF).tier, "FULL");
  assert.equal(describeAnnualLeaveTier(empAt(6, { status_karyawan: "KARTAP" }), REF).tier, "FULL");
});

test("utils.js & formulir cuti memakai aturan masa kerja baru", () => {
  const utils = readFileSync(new URL("../js/utils.js", import.meta.url), "utf-8");
  assert.ok(
    utils.includes("getAutoJatahTahunan"),
    "getCalculatedJatahCuti harus memakai aturan otomatis dari leave-entitlement.mjs"
  );

  const form = readFileSync(new URL("../js/views/pengajuan-cuti.js", import.meta.url), "utf-8");
  assert.ok(form.includes("monthsSinceJoin"), "Form cuti wajib memiliki gate masa kerja bulan ke-4");

  const banner = readFileSync(new URL("../js/views/pengajuan.js", import.meta.url), "utf-8");
  assert.ok(banner.includes("Aturan Masa Kerja"), "Banner sisa saldo harus menjelaskan aturan masa kerja baru");
});
