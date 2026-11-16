import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicFormLinkDoc,
  isReservedPublicSlug,
  parsePublicFormSlug,
  pickAvailableSlug,
  publicFormUrlFor,
  publicShortLink,
  resolvePublicLinkTarget,
  slugifyFormName,
  toPublicFormUrl
} from "../js/form-link.mjs";

test("slugifyFormName menghasilkan slug yang aman dan stabil", () => {
  assert.equal(slugifyFormName("Formulir Cuti Tahunan"), "formulir-cuti-tahunan");
  assert.equal(slugifyFormName("  Reimbursement / Klaim  "), "reimbursement-klaim");
  assert.equal(slugifyFormName("Café & Résumé"), "cafe-resume");
  assert.equal(slugifyFormName("***"), "");
});

test("isReservedPublicSlug menolak path sistem", () => {
  assert.equal(isReservedPublicSlug("api"), true);
  assert.equal(isReservedPublicSlug("login"), true);
  assert.equal(isReservedPublicSlug(""), true);
  assert.equal(isReservedPublicSlug("formulir-cuti"), false);
});

test("parsePublicFormSlug memahami /slug dan /f/slug", () => {
  assert.equal(parsePublicFormSlug("/formulir-cuti"), "formulir-cuti");
  assert.equal(parsePublicFormSlug("/f/formulir-cuti"), "formulir-cuti");
  assert.equal(parsePublicFormSlug("/f/Formulir-Cuti?x=1"), "formulir-cuti");
  assert.equal(parsePublicFormSlug("/"), "");
  assert.equal(parsePublicFormSlug("/f/"), "");
  assert.equal(parsePublicFormSlug("/a/b"), "");
});

test("pickAvailableSlug menambahkan akhiran saat bentrok", () => {
  assert.equal(pickAvailableSlug("Formulir Cuti", new Set()), "formulir-cuti");
  assert.equal(pickAvailableSlug("Formulir Cuti", new Set(["formulir-cuti"])), "formulir-cuti-2");
  assert.equal(
    pickAvailableSlug("Formulir Cuti", new Set(["formulir-cuti", "formulir-cuti-2", "formulir-cuti-3"])),
    "formulir-cuti-4"
  );
  assert.equal(pickAvailableSlug("Login", new Set()), "login-form");
  assert.equal(pickAvailableSlug("", new Set()), "");
});

test("publicShortLink membentuk tautan ringkas", () => {
  assert.equal(
    publicShortLink("https://andela-hris.vercel.app/", "formulir-cuti"),
    "https://andela-hris.vercel.app/formulir-cuti"
  );
  assert.equal(publicShortLink("", "formulir-cuti"), "");
  assert.equal(publicShortLink("https://andela-hris.vercel.app", ""), "");
});

test("toPublicFormUrl menormalkan URL Google Form", () => {
  assert.equal(
    toPublicFormUrl("https://docs.google.com/forms/d/abc1234567890/edit"),
    "https://docs.google.com/forms/d/abc1234567890/viewform"
  );
  assert.equal(
    toPublicFormUrl("https://docs.google.com/forms/d/e/abc1234567890/viewform?x=1"),
    "https://docs.google.com/forms/d/abc1234567890/viewform"
  );
  assert.equal(toPublicFormUrl("https://forms.gle/abc123"), "https://forms.gle/abc123");
  assert.equal(toPublicFormUrl("http://docs.google.com/forms/d/abc1234567890/edit"), "");
  assert.equal(toPublicFormUrl("bukan url"), "");
});

test("publicFormUrlFor memakai ID bila URL tidak tersedia", () => {
  assert.equal(
    publicFormUrlFor({ google_form_id: "abc1234567890" }),
    "https://docs.google.com/forms/d/abc1234567890/viewform"
  );
  assert.equal(publicFormUrlFor({ google_form_id: "pendek" }), "");
});

test("buildPublicFormLinkDoc memvalidasi form id", () => {
  const doc = buildPublicFormLinkDoc({
    formId: "cuti",
    namaForm: "Formulir Cuti",
    google_form_url: "https://docs.google.com/forms/d/abc1234567890/edit",
    active: true
  });
  assert.equal(doc.form_id, "cuti");
  assert.equal(doc.google_form_url, "https://docs.google.com/forms/d/abc1234567890/viewform");
  assert.equal(doc.active, true);
  assert.throws(() => buildPublicFormLinkDoc({ namaForm: "Tanpa ID" }), /wajib diisi/);
});

test("resolvePublicLinkTarget membedakan missing, inactive, dan ok", () => {
  assert.deepEqual(resolvePublicLinkTarget(null), { status: "missing" });
  assert.deepEqual(
    resolvePublicLinkTarget({
      active: false,
      google_form_url: "https://docs.google.com/forms/d/abc1234567890/viewform"
    }),
    { status: "inactive" }
  );
  assert.deepEqual(
    resolvePublicLinkTarget({
      active: true,
      google_form_url: "https://docs.google.com/forms/d/abc1234567890/viewform"
    }),
    {
      status: "ok",
      url: "https://docs.google.com/forms/d/abc1234567890/viewform"
    }
  );
  assert.deepEqual(resolvePublicLinkTarget({ active: true }), { status: "missing" });
});
