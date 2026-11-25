import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const components = readFileSync(new URL("../js/components.js", import.meta.url), "utf8");
const kpiView = readFileSync(new URL("../js/views/penilaian-kontrak.js", import.meta.url), "utf8");

test("edit langsung pada tabel CRUD hanya tersedia untuk HRD/Superadmin", () => {
  assert.match(components, /const canInlineEdit = canEdit && fieldsList\.length > 0/);
  assert.match(components, /\["HRD", "SUPERADMIN"\]\.includes\(String\(_crudSession\?\.role/);
});

test("baris tabel CRUD dapat diedit lewat double-click tanpa popup", () => {
  assert.match(components, /addEventListener\("dblclick"/);
  assert.match(components, /data-inline-editable="1"/);

  const start = components.indexOf("async function startInlineEdit");
  const end = components.indexOf("function fieldInput", start);
  assert.ok(start > -1 && end > start, "fungsi startInlineEdit harus tersedia");
  const body = components.slice(start, end);
  assert.match(body, /fsUpdate\(collectionName, row\.id/);
  assert.doesNotMatch(body, /openModal\(/, "edit langsung tidak boleh membuka popup");
});

test("tombol edit HRD mengarah ke edit langsung, role lain tetap memakai alur lama", () => {
  assert.match(components, /if \(canInlineEdit\) \{\s*const tr = btn\.closest\("tr"\);/);
  assert.match(components, /onEditClick\(r, \{ openDefaultForm: \(\) => openForm\(r\), reload: load \}\);/);
});

test("tabel log penilaian KPI mendukung edit langsung khusus HRD", () => {
  assert.match(kpiView, /data-log-row-id/);
  assert.match(kpiView, /function startLogInlineEdit\(tr, logObj\)/);
  assert.match(kpiView, /startLogInlineEdit\(tr, logObj\)/);
  const start = kpiView.indexOf("function startLogInlineEdit");
  const end = kpiView.indexOf("wrap.querySelectorAll(\"tr[data-log-row-id]\")", start);
  assert.ok(start > -1 && end > start);
  const body = kpiView.slice(start, end);
  assert.doesNotMatch(body, /openModal\(/, "edit langsung log KPI tidak boleh membuka popup");
  assert.match(body, /COL\.LOG_PENILAIAN_KPI/);
});
