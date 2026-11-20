import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const auth = readFileSync(new URL("../js/auth.js", import.meta.url), "utf8");

test("navigation reuses short-lived session and permission results", () => {
  assert.match(auth, /PERMISSION_CACHE_TTL_MS = 15_000/);
  assert.match(auth, /SESSION_SYNC_TTL_MS = 30_000/);
  assert.match(auth, /ATASAN_CACHE_TTL_MS = 60_000/);
  assert.match(auth, /findUserOverride\(session\)[\s\S]*loadPermissionOverrides\(false\)/);
  assert.match(auth, /if \(!force && _sessionSyncCache/);
});

test("router avoids duplicate session sync and warms route assets", () => {
  const routerBlock = app.split("async function router(session)")[1]?.split("/* ---------------------------------------------------------------------\n * SHELL INTERACTIONS")[0] || "";
  assert.doesNotMatch(routerBlock, /syncSessionWithDb\(/);
  assert.match(app, /const routeModuleCache = new Map\(\)/);
  assert.match(app, /function prefetchRoute\(route\)/);
  assert.match(app, /nav\.addEventListener\("pointerover", warmRoute/);
  assert.match(routerBlock, /container\.innerHTML = html;[\s\S]*const mod = await modulePromise/);
});

test("all route modules retry once with a fresh URL after a parse failure", () => {
  assert.match(app, /if \(!\(error instanceof SyntaxError\)\)/);
  assert.match(app, /import\(`\$\{modulePath\}-retry-\$\{Date\.now\(\)\}`\)/);
  assert.doesNotMatch(app, /viewName !== ["']cuti["']/);
});

test("unchanged navigation shell is not rebuilt", () => {
  assert.match(app, /renderedShellSignature === shellSignature/);
  assert.match(app, /renderedShellSignature = shellSignature/);
});

test("penilaian performa menjadi dua pintu dengan satu sumber data", () => {
  // Dua menu penilaian final: Penilaian Performa dan Perpanjangan Kontrak.
  assert.match(auth, /id: "performance-management", label: "Penilaian Performa"/);
  assert.match(auth, /id: "penilaian-kontrak", label: "Perpanjangan Kontrak"/);
  // Dashboard Karyawan tidak lagi menjadi menu terpisah.
  assert.doesNotMatch(auth, /\{ id: "dashboard-karyawan", label: "Dashboard Karyawan"/);
  assert.match(auth, /"performance-management",\s*"penilaian-kontrak"/);
  // Rute lama tetap diarahkan ke tab yang tepat.
  assert.match(app, /"dashboard-karyawan"[\s\S]*params\.set\("tab", "employee"\)/);
  assert.match(app, /cleanPath === "perpanjangan-kontrak"[\s\S]*params\.set\("tab", "alur_perpanjangan"\)/);
  // Penilaian perpanjangan memakai jendela waktu yang sama.
  assert.match(auth, /route: "penilaian-kontrak\?tab=alur_perpanjangan"/);
});
