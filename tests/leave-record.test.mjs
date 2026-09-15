import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSickLeave, isDoctorCertifiedSickLeave, resolveEffectiveLeaveDeduction } from "../js/leave-policy.mjs";
import { leaveInputDate, leaveInputDisplay, matchesLeaveExportPeriod } from "../js/leave-export.mjs";

test("sick with a doctor's note never deducts leave, even if stored config is wrong", () => {
  assert.equal(isDoctorCertifiedSickLeave({ id: "S", name: "Sakit dengan Keterangan Dokter", potong: "Tahunan" }), true);
  assert.equal(resolveEffectiveLeaveDeduction({ id: "S", name: "Sakit dengan Keterangan Dokter", potong: "Tahunan" }), "Tidak Dipotong");
  assert.equal(isSickLeave({ id: "S-", name: "Sakit tanpa Surat Dokter" }), true);
  assert.equal(isDoctorCertifiedSickLeave({ id: "S-", name: "Sakit tanpa Surat Dokter" }), false);
  assert.equal(resolveEffectiveLeaveDeduction({ id: "S-", name: "Sakit tanpa Surat Dokter", potong: "Tahunan" }), "Tahunan");
});

test("input-based export selects HRD input timestamp instead of leave date", () => {
  const record = { createdAt: "2026-09-15T01:15:00.000Z", tanggal: "2026-09-09" };
  assert.equal(leaveInputDate(record), "2026-09-15");
  assert.match(leaveInputDisplay(record), /08[.:]15 WIB/);
  assert.equal(matchesLeaveExportPeriod(record, { basis: "input", start: "2026-09-15", end: "2026-09-15", leaveStart: "2026-09-09" }), true);
  assert.equal(matchesLeaveExportPeriod(record, { basis: "leave", start: "2026-09-15", end: "2026-09-15", leaveStart: "2026-09-09" }), false);
  assert.equal(matchesLeaveExportPeriod({ tanggal: "2026-09-15" }, { basis: "input", start: "2026-09-15", end: "2026-09-15", leaveStart: "2026-09-15" }), false);
  assert.equal(leaveInputDate({ created_at: "15/09/2026" }), "2026-09-15");
});

test("multi-day execution period overlaps filter and no-scan sick record skips leave PDF", () => {
  assert.equal(matchesLeaveExportPeriod({}, { basis: "leave", start: "2026-09-10", end: "2026-09-10", leaveStart: "2026-09-09", leaveEnd: "2026-09-11" }), true);
  const source = readFileSync(new URL("../js/views/cuti.js", import.meta.url), "utf8");
  assert.match(source, /if \(!sickRecord\) \{\s*await generatePdfAndNotify/);
  assert.match(source, /const formHtml = sickRecord \? null/);
  assert.match(source, /const publishDocument = options\.publishDocument === true && !sickRecord/);
  assert.match(source, /uploadFileToDrive\(sickFile, "Cuti\/Surat Dokter"\)/);
  assert.doesNotMatch(source, /const ok = await confirmDialog\(\s*`Kirim email dan notifikasi cuti/);
});
