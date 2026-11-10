import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("dashboard menyediakan tombol atur widget dan wadah layout", () => {
  const html = fs.readFileSync("views/dashboard.html", "utf8");
  assert.match(html, /id="dash-arrange-widgets"/);
  assert.match(html, /id="dash-layout-root"/);
  assert.match(html, /id="dash-cuti-count"/);
  assert.match(html, /id="dash-cuti-hari-ini"[^>]*grid-cols-1[^>]*sm:grid-cols-2[^>]*xl:grid-cols-3/);
});

test("dashboard memakai layout tersimpan, ukuran widget, dan daftar cuti yang rapi", () => {
  const js = fs.readFileSync("js/views/dashboard.js", "utf8");
  assert.match(js, /DASH_WIDGETS/);
  assert.match(js, /setupDashboardLayout\(container, session, forcedHidden\)/);
  assert.match(js, /localStorage\.setItem\(dashboardLayoutKey/);
  assert.match(js, /dash-layout-hidden/);
  assert.match(js, /loadCutiHariIni\(container, session\)/);
  assert.match(js, /dash-cuti-count/);
  assert.match(js, /max-w-full truncate/);

  const css = fs.readFileSync("css/style.css", "utf8");
  assert.match(css, /\.dash-layout-full/);
  assert.match(css, /\.dash-layout-hidden/);
  assert.match(css, /\.dash-layout-empty/);
});
