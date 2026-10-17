import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Pengecekan sumber untuk konsistensi "sisa cuti" pada dokumen cetak
 * (form cuti F-ISO-CUTI) dengan perhitungan sistem yang tampil di UI.
 *
 * Akar masalah yang sudah diperbaiki:
 * 1. Override saldo basi dari field tersimpan dokumen (sisa_tahunan /
 *    total_sisa_tahunan) yang menimpa hitungan live getCalculatedJatahCuti.
 * 2. PDF cadangan (fallback) memakai snapshot getSisa(k) yang SUDAH terpotong
 *    cuti yang diterbitkan dokumennya -> sisa berkurang ganda.
 * 3. Twin cuti yang sama di MASTER_CUTI dan DATA_PENGAJUAN dihitung dua kali.
 * 4. Pengajuan masih PENDING ikut memotong jatah pada cetak, padahal jatah
 *    baru terpotong setelah Approved Final.
 */

test("saldo cetak selalu dihitung ulang dari getCalculatedJatahCuti (tanpa override basi)", () => {
  const utils = readFileSync(new URL("../js/utils.js", import.meta.url), "utf-8");
  const fnStart = utils.indexOf("export async function calculateLeaveHistoryBalances");
  const fnEnd = utils.indexOf("export function generateStandardFormCutiHtml");
  assert.ok(fnStart > -1 && fnEnd > fnStart, "fungsi calculateLeaveHistoryBalances harus ada di utils.js");
  const fn = utils.slice(fnStart, fnEnd);

  assert.ok(fn.includes("getCalculatedJatahCuti"), "saldo wajib lewat getCalculatedJatahCuti");
  assert.ok(fn.includes("sisaHakTahunan = historyCalc.sisaTahunan"), "Baris 1 (Sisa Hak) wajib hasil hitung live");

  // override basi dari dokumen penyimpanan tidak boleh ada lagi
  assert.ok(!fn.includes("checkVal"), "checkVal (pembaca field basi) sudah dihapus dari fungsi ini");
  ["docSisa", "docTotal"].forEach((w) => {
    assert.ok(!fn.includes(w), `override "${w}*" tidak boleh menimpa hitungan live`);
  });
});

test("dedupe twin MASTER_CUTI vs DATA_PENGAJUAN + hanya cuti yang sudah disetujui", () => {
  const utils = readFileSync(new URL("../js/utils.js", import.meta.url), "utf-8");
  const fnStart = utils.indexOf("export async function calculateLeaveHistoryBalances");
  const fnEnd = utils.indexOf("export function generateStandardFormCutiHtml");
  const fn = utils.slice(fnStart, fnEnd);

  assert.ok(fn.includes("seenRefs"), "dedupe twin memakai set referensi no_referensi/id");
  assert.ok(
    fn.includes("if (keyRef && (seenKeys.has(keyRef) || seenRefs.has(keyRef))) continue"),
    "pengajuan dengan twin di MASTER_CUTI wajib di-skip agar tidak potong ganda"
  );
  assert.ok(
    fn.includes("if (!/APPROVED|APPROVE|DISETUJUI/.test(st)) continue;"),
    "riwayat DATA_PENGAJUAN yang masih PENDING tidak boleh memotong jatah pada cetak"
  );
});

test("PDF cadangan tidak memakai snapshot sudah-terpotong, melainkan hitung ulang", () => {
  const cuti = readFileSync(new URL("../js/views/cuti.js", import.meta.url), "utf-8");
  const fnStart = cuti.indexOf("async function printCutiPdfFallback");
  assert.ok(fnStart > -1, "printCutiPdfFallback harus ada di cuti.js");
  const fn = cuti.slice(fnStart, cuti.indexOf("}", cuti.indexOf("downloadHtmlAsPdf(html", fnStart)) + 1);

  assert.ok(fn.includes("calculateLeaveHistoryBalances"), "fallback wajib hitung ulang saldo dari sumber resmi");
  assert.ok(!fn.includes("(sisa.Tahunan ?? 0)"), "fallback tidak boleh memakai snapshot getSisa yang sudah terpotong");
  assert.ok(fn.includes("balances.sisaHakTahunan"), "fallback wajib memakai saldo hasil hitung ulang yang sama dengan jalur utama");
  assert.ok(fn.includes("sisaTahunan: balances.sisaHakTahunan"), "fallback mengisi form dengan angka yang identik dengan jalur utama");
});
