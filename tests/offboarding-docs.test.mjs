import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  hitungSisaGaji,
  paklaringIssuanceDate,
  normalizePbClauses,
  OFFBOARDING_DOCUMENT_OPTIONS,
  offboardingDocumentLabel,
  offboardingDocumentShort,
  OFFBOARDING_DOCUMENT_ISSUE_DAYS
} from "../js/offboarding-calc.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("sisa gaji memprorata gaji pokok dan tunjangan tetap secara terpisah", () => {
  const info = hitungSisaGaji({
    outDate: "2026-10-15",
    gajiPokok: 4000000,
    tunjanganTetap: 1000000,
    cutoffDay: 21,
    hariKerjaPerBulan: 25,
    startDate: "2026-09-22"
  });

  assert.equal(info.gajiPokok, 4000000);
  assert.equal(info.tunjanganTetap, 1000000);
  assert.equal(info.gajiPokokPerHari, Math.round(4000000 / 25));
  assert.equal(info.tunjanganPerHari, Math.round(1000000 / 25));
  assert.equal(info.sisaGajiPokok, info.gajiPokokPerHari * info.sisaHariKerja);
  assert.equal(info.sisaTunjangan, info.tunjanganPerHari * info.sisaHariKerja);
  assert.equal(info.sisaGaji, info.sisaGajiPokok + info.sisaTunjangan);
  assert.ok(info.sisaGaji > 0);
});

test("tanpa tunjangan tetap, hasil prorata hanya berasal dari gaji pokok", () => {
  const info = hitungSisaGaji({
    outDate: "2026-10-15",
    gajiPokok: 4000000,
    cutoffDay: 21,
    hariKerjaPerBulan: 25,
    startDate: "2026-09-22"
  });

  assert.equal(info.tunjanganTetap, 0);
  assert.equal(info.sisaTunjangan, 0);
  assert.equal(info.sisaGaji, info.sisaGajiPokok);
});

test("paklaring diterbitkan 30 hari setelah hari terakhir bekerja", () => {
  assert.equal(OFFBOARDING_DOCUMENT_ISSUE_DAYS, 30);
  assert.equal(paklaringIssuanceDate("2026-09-30"), "2026-10-30");
  assert.equal(paklaringIssuanceDate("2026-12-15"), "2027-01-14");
  assert.equal(paklaringIssuanceDate(""), "");
});

test("klausul tambahan Perjanjian Bersama dinormalisasi dari array maupun teks", () => {
  assert.deepEqual(normalizePbClauses(["  Benefit BPJS  ", "", "Bonus tahunan"]), ["Benefit BPJS", "Bonus tahunan"]);
  assert.deepEqual(normalizePbClauses("Satu\n\nDua\n"), ["Satu", "Dua"]);
  assert.deepEqual(normalizePbClauses(null), []);
});

test("picklist dokumen keluar menyediakan Paklaring dan Surat Keterangan", () => {
  const values = OFFBOARDING_DOCUMENT_OPTIONS.map(option => option.value);
  assert.deepEqual(values, ["PAKLARING", "SURAT_KETERANGAN", "TIDAK_ADA"]);
  assert.match(offboardingDocumentLabel("PAKLARING"), /Paklaring/);
  assert.match(offboardingDocumentLabel("SURAT_KETERANGAN"), /Surat Keterangan/);
  assert.equal(offboardingDocumentShort("PAKLARING"), "Paklaring");
  assert.equal(offboardingDocumentShort("SURAT_KETERANGAN"), "Surat Keterangan");
});

test("form offboarding memisahkan input gaji pokok dan tunjangan serta picklist dokumen", () => {
  const source = read("js/views/siklus-karyawan.js");
  assert.match(source, /id="off-gapok"/);
  assert.match(source, /id="off-tunjangan"/);
  assert.match(source, /id="off-gapok"[^>]*step="any"/);
  assert.match(source, /id="off-tunjangan"[^>]*step="any"/);
  assert.doesNotMatch(source, /id="off-(?:gapok|tunjangan|mcu-biaya)"[^>]*step="1000"/);
  assert.doesNotMatch(source, /id="off-gaji"/);
  assert.match(source, /id="off-dokumen"/);
  assert.match(source, /OFFBOARDING_DOCUMENT_OPTIONS\.map/);
  assert.match(source, /id="off-dok-nomor"/);
  assert.match(source, /id="off-dok-tanggal"/);
  assert.match(source, /paklaringIssuanceDate/);
  assert.match(source, /tunjanganTetap,/);
});

test("editor klausul tambahan Perjanjian Bersama dapat menambah dan menghapus baris", () => {
  const source = read("js/views/siklus-karyawan.js");
  assert.match(source, /id="pb-clause-container"/);
  assert.match(source, /id="btn-add-pb-clause"/);
  assert.match(source, /function addPbClauseRow/);
  assert.match(source, /normalizePbClauses\(Array\.from\(container\.querySelectorAll\("\.pb-clause-input"\)\)/);
  assert.match(source, /klausul_tambahan: pbClauses/);
});

test("kop surat resmi tersedia dan dipakai pada setiap lembar dokumen offboarding", () => {
  assert.ok(existsSync(new URL("../assets/kop-andela-jaya.png", import.meta.url)));
  const branding = read("js/branding.js");
  assert.match(branding, /export const KOP_SURAT_URL = "\/assets\/kop-andela-jaya\.png"/);
  assert.match(branding, /export function kopSuratHtml/);
  assert.match(branding, /width:145mm/);

  const source = read("js/views/siklus-karyawan.js");
  assert.match(source, /function printPaklaringPdf/);
  assert.match(source, /printPaklaringPdf\(\{/);
  // Kop dipakai pada Paklaring + tiga halaman Surat Perjanjian Bersama.
  const kopCalls = source.match(/kopSuratHtml\(/g) || [];
  assert.ok(kopCalls.length >= 4, `kopSuratHtml dipakai ${kopCalls.length} kali`);
});

test("tanda terima asset Perjanjian Bersama berada di lembar terpisah dari klausul", () => {
  const source = read("js/views/siklus-karyawan.js");
  assert.match(source, /page-break-after:always/);
  const clauseIndex = source.indexOf("<!-- HALAMAN 2: RINCIAN HAK, KLAUSUL, DAN TANDA TANGAN -->");
  const assetIndex = source.indexOf("<!-- HALAMAN 3: TANDA TERIMA PENYERAHAN ASSET (LEMBAR TERPISAH) -->");
  assert.ok(clauseIndex > 0 && assetIndex > clauseIndex);
});

test("email offboarding memberitahukan dokumen keluar terbit 30 hari setelah hari terakhir", () => {
  const source = read("js/views/siklus-karyawan.js");
  assert.match(source, /label: "Dokumen Keluar"/);
  assert.match(source, /diberikan <strong>\$\{OFFBOARDING_DOCUMENT_ISSUE_DAYS\} hari setelah hari terakhir bekerja<\/strong>/);
});
