import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Atur Jenis Cuti menyediakan opsi cetak form per jenis cuti", () => {
  const source = read("js/views/cuti.js");
  assert.match(source, /class="cfg-cetak/);
  assert.match(source, /<option value="1"[\s\S]*<option value="0"/);
  assert.match(source, /cetak_form: tr\.querySelector\("\.cfg-cetak"\)\.value === "1"/);
});

test("pencatatan cuti menghormati opsi tanpa cetak form", () => {
  const source = read("js/views/cuti.js");
  assert.match(source, /const shouldPrintForm = leaveTypeAllowsForm\(curCfg\)/);
  assert.match(source, /if \(shouldPrintForm\)[\s\S]*publishDocument: true,[\s\S]*cetakForm: true/);
  assert.match(source, /Cuti tersimpan tanpa cetak form sesuai pengaturan jenis cuti/);
  assert.match(source, /const cetakForm = options\.cetakForm !== false/);
  assert.match(source, /const publishDocument = options\.publishDocument === true && !sickRecord && cetakForm/);
  assert.match(source, /Simpan Tanpa Cetak Form/);
});

test("jenis cuti sakit tetap bisa cetak form bila opsi Cetak Form = Ya", () => {
  const source = read("js/views/cuti.js");
  // Catatan sakit hanya dipakai saat form memang tidak dicetak.
  assert.match(source, /const sickRecord = isDoctorCertifiedSickLeave\([\s\S]*&& !cetakForm/);
  // Baris riwayat memprioritaskan opsi cetak form sebelum mode catatan sakit.
  assert.match(source, /\(sickRecord && !allowForm\) \?/);
  assert.match(source, /: allowForm \? `/);
});

test("karyawan tidak melihat tombol PDF/cetak untuk jenis tanpa form", () => {
  const source = read("js/views/pengajuan-cuti.js");
  assert.match(source, /function leaveTypeAllowsForm/);
  assert.match(source, /typeof cfg\.cetak_form === "boolean"\) return cfg\.cetak_form/);
  assert.match(source, /Tanpa form cetak/);
});
