import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Pengecekan sumber untuk penyebaran role "BRANCH MANAGER" (Kepala Cabang)
 * ke semua modul/menu, termasuk pembatasan proses hanya pada cabangnya sendiri:
 *
 * 1. Role terdaftar di daftar role akun (Pengaturan) & opsi alur Form Builder.
 * 2. Hak lihat bawahan (ATASAN_VIEW_ROLES) + preset permission alias di auth.js.
 * 3. Approval: eligible di tahap MANAGER/BRANCH MANAGER, dipagari cabang sendiri.
 * 4. Email target (getTargetsForRole): alias role cabang + pembatasan cabang
 *    pemohon + prioritas atasan eksplisit.
 * 5. Personil berkolom "Approval" pada Form Builder menerima notifikasi approval.
 * 6. Modul lain (dashboard, cuti, izin, penilaian-kontrak, sales-track) mengenali role.
 */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf-8");

test("role BRANCH MANAGER terdaftar di Pengaturan & Form Builder", () => {
  const pengaturan = read("../js/views/pengaturan.js");
  assert.ok(
    pengaturan.includes('"BRANCH MANAGER"'),
    "opsi role BRANCH MANAGER wajib ada pada dropdown role akun"
  );
  assert.ok(
    pengaturan.includes('["HRD", "GM", "FINANCE", "SPV", "MANAGER", "BRANCH MANAGER"'),
    "urutan opsi role memuat BRANCH MANAGER setelah MANAGER"
  );

  const formBuilder = read("../js/views/form-builder.js");
  assert.ok(
    formBuilder.includes('"MANAGER", "BRANCH MANAGER"]'),
    "ROLE_OPTIONS Form Builder wajib memuat BRANCH MANAGER (alur approval & notifikasi)"
  );
});

test("auth.js: ATASAN_VIEW_ROLES + alias preset role cabang", () => {
  const auth = read("../js/auth.js");

  assert.ok(
    auth.includes('export const ATASAN_VIEW_ROLES = ["MANAGER", "SPV", "KOORDINATOR", "BRANCH MANAGER", "BRANCH_MANAGER", "KEPALA_CABANG", "KACAB"];'),
    "role cabang wajib masuk ATASAN_VIEW_ROLES agar bisa melihat data bawahannya di semua menu"
  );

  for (const alias of ['"BRANCH MANAGER"', '"BRANCH_MANAGER"', '"KEPALA CABANG"', "KEPALA_CABANG", "KACAB"]) {
    assert.ok(
      auth.includes(`ROLE_PERMISSIONS_PRESETS[${alias}] `) || auth.includes(`ROLE_PERMISSIONS_PRESETS.${alias}`),
      `alias preset ${alias} wajib terdaftar`
    );
  }

  // Role tetap bisa memproses (edit) — setara management, tapi bukan GM read-only
  assert.ok(
    auth.includes('"GA", "BRANCH MANAGER"]'),
    "BRANCH MANAGER wajib tetap di _MANAGEMENT_ROLES (boleh memproses data)"
  );
  assert.ok(
    !auth.includes('ROLE === "BRANCH MANAGER"') && !auth.includes('role === "BRANCH MANAGER" ? true'),
    "BRANCH MANAGER tidak boleh ikut read-only khusus GM"
  );
});

test("approval.js: tahap BRANCH MANAGER + pagar cabang", () => {
  const approval = read("../js/views/approval.js");
  const fnStart = approval.indexOf("function isEligible(row, session)");
  assert.ok(fnStart > -1, "isEligible harus ada di approval.js");
  const fn = approval.slice(fnStart, approval.indexOf("\nfunction ", fnStart));

  assert.ok(fn.includes('isBranchScopedApprover'), "wajib ada penanda approver ber-cakupan cabang");
  assert.ok(
    fn.includes('rowCabang !== myCabang'),
    "approver role cabang wajib ditolak untuk pengajuan di luar cabangnya"
  );
  assert.ok(
    fn.includes('KEPALA_CABANG') && fn.includes('"BRANCH MANAGER"'),
    "tahap MANAGER wajib menerima alias role kepala cabang"
  );
});

test("utils.js: email tahap MANAGER/SPV dibatasai cabang pemohon + prioritas atasan", () => {
  const utils = read("../js/utils.js");
  const fnStart = utils.indexOf("export async function getTargetsForRole");
  const fnEnd = utils.indexOf("* PERHITUNGAN JATAH CUTI", fnStart);
  const fn = utils.slice(fnStart, fnEnd);

  assert.ok(
    fn.includes('roleUpper === "BRANCH MANAGER"') && fn.includes('roleUpper === "KACAB"'),
    "getTargetsForRole wajib mengenali alias role kepala cabang pada tahap MANAGER"
  );
  assert.ok(fn.includes("pemCabang"), "wajib ada pembatasan cabang pemohon pada target email");
  assert.ok(fn.includes("pemCabangSpv"), "tahap SPV juga wajib dibatasi cabang pemohon");
  assert.ok(fn.includes("atasanNama"), "atasan eksplisit pemohon wajib didahulukan saat pemilihan target");
});

test("notifikasi kolom 'Approval' Form Builder benar-benar terkirim", () => {
  const pengajuan = read("../js/views/pengajuan.js");
  const approval = read("../js/views/approval.js");

  assert.ok(
    pengajuan.includes("approvalNotifyNames"),
    "saat submit, personil berkolom Approval wajib dinotifikasi"
  );
  assert.ok(
    pengajuan.includes("approval Dibutuhkan") || pengajuan.includes("Approval Dibutuhkan"),
    "isi notifikasi approval wajib ada"
  );
  assert.ok(
    approval.includes("stageRules"),
    "setiap pergantian tahap approval wajib melewatkan notifikasi ke personil berkolom Approval"
  );
});

test("modul lain mengenali role cabang (dashboard, cuti, izin, penilaian, sales)", () => {
  const dashboard = read("../js/views/dashboard.js");
  assert.ok(
    dashboard.includes('"MANAJEMEN", "BRANCH MANAGER"'),
    "widget kontrak dashboard wajib mengenali role cabang"
  );

  const cuti = read("../js/views/cuti.js");
  assert.ok(
    cuti.includes('"KACAB", "BRANCH MANAGER", "BRANCH_MANAGER"]'),
    "penyelesaian target atasan cuti wajib mengenali role cabang (dalam batas cabang sama)"
  );

  const izin = read("../js/views/izin.js");
  assert.ok(izin.includes('"BRANCH MANAGER"'), "izin.js wajib mengenali role cabang");

  const penilaian = read("../js/views/penilaian-kontrak.js");
  assert.ok(penilaian.includes('"BRANCH MANAGER"'), "penilaian-kontrak.js wajib mengenali role cabang");

  const salesTrack = read("../js/views/sales-track.js");
  assert.ok(salesTrack.includes('"BRANCH MANAGER"'), "sales-track.js wajib mengenali role cabang");
});
