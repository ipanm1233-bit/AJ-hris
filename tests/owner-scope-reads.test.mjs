import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("helper baca data milik sendiri tersedia dan memakai query per field kepemilikan", () => {
  const source = read("js/utils.js");
  assert.match(source, /export async function fsGetOwnedRecords/);
  assert.match(source, /where\(field, "==", value\)/);
  assert.match(source, /fields\.map\(async \(field\)/);
});

test("pengajuan cuti hanya membaca dokumen milik akun, bukan seluruh koleksi", () => {
  const source = read("js/views/pengajuan-cuti.js");
  assert.doesNotMatch(source, /fsGetAll\(COL\.DATA_PENGAJUAN\)/);
  assert.match(source, /fsGetOwnedRecords\(COL\.DATA_PENGAJUAN/);
});

test("modul izin membatasi query data_pengajuan untuk akun non-manajemen", () => {
  const source = read("js/views/izin.js");
  assert.match(source, /isHrdOrAdmin[\s\S]*fsGetOwnedRecords\(COL\.DATA_PENGAJUAN/);
});

test("review kinerja saya memakai query NIK agar lolos Firestore rules", () => {
  const source = read("js/views/performance-review.js");
  assert.match(source, /async function renderMyReviews[\s\S]*fsGetOwnedRecords\(COL\.PERFORMANCE_REVIEW/);
});

test("widget kinerja dashboard tidak membaca seluruh performance_review untuk staf", () => {
  const source = read("js/views/dashboard.js");
  assert.match(source, /isHrd\s*\n?\s*\? await fsGetAll\(COL\.PERFORMANCE_REVIEW\)\s*\n?\s*: await fsGetOwnedRecords\(COL\.PERFORMANCE_REVIEW/);
});

test("reimbursement, kasbon, dan riwayat membatasi data ke pemilik untuk staf", () => {
  assert.match(read("js/views/reimbursement.js"), /isManagement\s*\n?\s*\? await fsGetAll\(COL\.DATA_REIMBURSEMENT\)\s*\n?\s*: await fsGetOwnedRecords/);
  assert.match(read("js/views/pengajuan-kasbon.js"), /isHrd\s*\n?\s*\? await fsGetAll\(COL\.LOG_KASBON\)[\s\S]*fsGetOwnedRecords\(COL\.LOG_KASBON/);
  assert.match(read("js/views/riwayat.js"), /isHrd\s*\n?\s*\? await fsGetAll\(COL\.DATA_PENGAJUAN\)[\s\S]*fsGetOwnedRecords\(COL\.DATA_PENGAJUAN/);
});

test("pusat notifikasi dan badge lonceng memakai fallback dokumen milik sendiri", () => {
  const app = read("js/app.js");
  assert.match(app, /fsGetAll\(COL\.NOTIFICATIONS\)[\s\S]*fsGetOwnedRecords\(COL\.NOTIFICATIONS/);
  const components = read("js/components.js");
  assert.match(components, /fsGetAll\(COL\.NOTIFICATIONS\)\.catch\(\(\) => fsGetOwnedRecords\(COL\.NOTIFICATIONS/);
  assert.match(components, /fsGetAll\(COL\.DATA_PENGAJUAN\)\.catch\(\(\) => fsGetOwnedRecords\(COL\.DATA_PENGAJUAN/);
});

test("riwayat cuti karyawan menggabungkan catatan master_cuti yang diinput HRD", () => {
  const source = read("js/views/pengajuan-cuti.js");
  assert.match(source, /fsGetAll\(COL\.MASTER_CUTI\)/);
  assert.match(source, /recordedFromMaster/);
  assert.match(source, /sumber: "MASTER_CUTI"/);
  assert.match(source, /seenLeaveKeys/);
});
