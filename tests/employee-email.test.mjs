import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidEmail, normalizeEmail, pickEmployeeEmail } from "../js/employee-email.mjs";

test("normalizes and validates employee email addresses", () => {
  assert.equal(normalizeEmail("  Ayu.Risna@Andela.co.id "), "ayu.risna@andela.co.id");
  assert.equal(isValidEmail("ayu.risna@andela.co.id"), true);
  assert.equal(isValidEmail("bukan-email"), false);
  assert.equal(isValidEmail(""), false);
});

test("picks the first valid email from legacy and current employee fields", () => {
  assert.equal(pickEmployeeEmail({ email_perusahaan: "HRD@ANDELA.CO.ID" }), "hrd@andela.co.id");
  assert.equal(pickEmployeeEmail(
    { email: "", email_karyawan: "bukan-email" },
    { email_pribadi: "ayu@example.com" }
  ), "ayu@example.com");
  assert.equal(pickEmployeeEmail({ email: "  " }, null, "fallback@example.com"), "fallback@example.com");
});

test("document release and lifecycle actions deliver email explicitly", () => {
  const dokumen = readFileSync(new URL("../js/views/dokumen.js", import.meta.url), "utf8");
  const siklus = readFileSync(new URL("../js/views/siklus-karyawan.js", import.meta.url), "utf8");
  const utils = readFileSync(new URL("../js/utils.js", import.meta.url), "utf8");

  assert.match(utils, /export async function resolveEmployeeEmail/);
  assert.match(dokumen, /resolveEmployeeEmail\(/);
  assert.match(dokumen, /sendEmailNotif\([\s\S]*\{ manual: true \}/);
  assert.match(dokumen, /targetEmail/);
  assert.match(siklus, /resolveEmployeeEmail\(/);
  assert.match(siklus, /sendEmailNotif\([\s\S]*\{ manual: true \}/);
  assert.match(siklus, /emailSent = await sendEmailNotif/);
});

test("employee data menu enforces notification-ready identity data", () => {
  const source = readFileSync(new URL("../js/views/manajemen-data.js", import.meta.url), "utf8");
  const components = readFileSync(new URL("../js/components.js", import.meta.url), "utf8");

  assert.match(source, /label: "Email Aktif \(untuk notifikasi\)", type: "email", required: true/);
  assert.match(source, /NIK KTP harus terdiri dari 16 digit angka/);
  assert.match(source, /Email aktif wajib diisi untuk karyawan aktif/);
  assert.match(source, /Data karyawan duplikat/);
  assert.match(source, /\{ key: "email", label: "Email Aktif"/);
  assert.doesNotMatch(source, /\{ key: "nik_karyawan", label: "nik_karyawan" \}/);
  assert.match(components, /\["email", "tel", "url"\]/);
});
