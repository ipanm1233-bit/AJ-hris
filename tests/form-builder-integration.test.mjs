import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("form builder menyediakan panel integrasi Google Form", () => {
  const html = fs.readFileSync("views/form-builder.html", "utf8");
  for (const id of [
    "fb-gform-wrap",
    "fb-gform-status",
    "fb-gform-body",
    "fb-gform-id",
    "fb-gform-webhook",
    "fb-gform-mapping",
    "fb-gform-save",
    "fb-gform-inbox",
    "fb-gform-secret",
    "fb-gform-unlink",
    "fb-gform-script",
    "fb-gform-copy"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `elemen #${id} harus ada`);
  }
  assert.match(html, /005_google_forms\.sql/);
  assert.match(html, /3\.000 respons/);
});

test("form builder memanggil API integrasi dengan autentikasi", () => {
  const js = fs.readFileSync("js/views/form-builder.js", "utf8");
  assert.match(js, /import \{ authFetch \} from "\.\.\/api-client\.js"/);
  assert.match(js, /action: "form_list"/);
  assert.match(js, /action: "form_register"/);
  assert.match(js, /action: "form_script"/);
  assert.match(js, /action: "form_submissions"/);
  assert.match(js, /action: "form_import"/);
  assert.match(js, /action: "form_reject"/);
  assert.match(js, /action: "form_rotate_secret"/);
  assert.match(js, /action: "form_unlink"/);
  assert.match(js, /renderGoogleMapping/);
  assert.match(js, /data-gmap-target/);
  assert.match(js, /openGoogleInbox/);
});

test("asset version dashboard dinaikkan setelah integrasi Google Form", () => {
  const app = fs.readFileSync("js/app.js", "utf8");
  const index = fs.readFileSync("index.html", "utf8");
  const match = app.match(/APP_ASSET_VERSION = "([^"]+)"/);
  assert.ok(match, "APP_ASSET_VERSION harus ada");
  assert.match(index, new RegExp(`js/app\\.js\\?v=${match[1]}`));
});
