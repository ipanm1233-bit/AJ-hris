import test from "node:test";
import assert from "node:assert/strict";

import {
  ALWAYS_ALLOWED_QUICK_ROUTES,
  DEFAULT_QUICK_ACTIONS,
  QUICK_ACTION_MAX_ITEMS,
  isStandaloneWebApp,
  normalizeQuickActions,
  quickActionHref,
  resolveQuickActions
} from "../js/quick-actions.mjs";

test("konfigurasi kosong memakai daftar default", () => {
  const config = normalizeQuickActions(undefined);
  assert.equal(config.enabled, true);
  assert.deepEqual(config.items.map(item => item.route), DEFAULT_QUICK_ACTIONS.map(item => item.route));
});

test("normalizeQuickActions membersihkan entri tidak valid dan duplikat", () => {
  const config = normalizeQuickActions({
    enabled: true,
    items: [
      { route: "pengajuan-cuti", label: "  Cuti   Saya  " },
      { route: "pengajuan-cuti", label: "Duplikat" },
      { route: "Rute Tidak Valid!", label: "X" },
      { route: "approval", label: "", enabled: false },
      null,
      "bukan objek"
    ]
  });
  assert.equal(config.items.length, 2);
  assert.equal(config.items[0].route, "pengajuan-cuti");
  assert.equal(config.items[0].label, "Cuti Saya");
  assert.equal(config.items[1].route, "approval");
  assert.equal(config.items[1].label, "approval");
  assert.equal(config.items[1].enabled, false);
});

test("normalizeQuickActions membatasi jumlah item", () => {
  const items = Array.from({ length: QUICK_ACTION_MAX_ITEMS + 5 }, (_, index) => ({
    route: `menu-${index}`,
    label: `Menu ${index}`
  }));
  const config = normalizeQuickActions({ enabled: true, items });
  assert.equal(config.items.length, QUICK_ACTION_MAX_ITEMS);
});

test("daftar kosong yang disimpan tetap kosong", () => {
  const config = normalizeQuickActions({ enabled: false, items: [] });
  assert.equal(config.enabled, false);
  assert.deepEqual(config.items, []);
});

test("resolveQuickActions memfilter route yang tidak boleh diakses", () => {
  const config = {
    enabled: true,
    items: [
      { route: "pengajuan", label: "Pengajuan", enabled: true },
      { route: "approval", label: "Approval", enabled: true },
      { route: "izin", label: "Izin", enabled: false }
    ]
  };
  const items = resolveQuickActions(config, new Set(["pengajuan", "izin"]));
  assert.deepEqual(items.map(item => item.route), ["pengajuan"]);

  const all = resolveQuickActions(config, null);
  assert.deepEqual(all.map(item => item.route), ["pengajuan", "approval"]);
});

test("resolveQuickActions mengembalikan kosong saat tombol dimatikan", () => {
  const config = normalizeQuickActions({
    enabled: false,
    items: [{ route: "pengajuan", label: "Pengajuan" }]
  });
  assert.deepEqual(resolveQuickActions(config, new Set(["pengajuan"])), []);
});

test("quickActionHref hanya menerima route yang aman", () => {
  assert.equal(quickActionHref("pengajuan-cuti"), "#/pengajuan-cuti");
  assert.equal(quickActionHref("  IZIN "), "#/izin");
  assert.equal(quickActionHref("../api"), "");
  assert.equal(quickActionHref(""), "");
});

test("isStandaloneWebApp mendeteksi PWA dan iOS standalone", () => {
  const makeWindow = matches => ({
    matchMedia: query => ({ matches: matches.includes(query) })
  });

  assert.equal(isStandaloneWebApp(makeWindow([]), {}), false);
  assert.equal(
    isStandaloneWebApp(makeWindow(["(display-mode: standalone)"]), {}),
    true
  );
  assert.equal(
    isStandaloneWebApp(makeWindow(["(display-mode: fullscreen)"]), {}),
    true
  );
  assert.equal(isStandaloneWebApp(makeWindow([]), { standalone: true }), true);
  assert.equal(isStandaloneWebApp(makeWindow([]), { userAgent: "Mozilla/5.0 (Linux; Android 13; wv) Chrome/120" }), true);
  assert.equal(isStandaloneWebApp({ Capacitor: {} }, {}), true);
  assert.equal(isStandaloneWebApp(makeWindow([]), { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120" }), false);
  assert.equal(isStandaloneWebApp(null, {}), false);
});

test("ALWAYS_ALLOWED_QUICK_ROUTES memuat route swalayan", () => {
  assert.ok(ALWAYS_ALLOWED_QUICK_ROUTES.includes("pengajuan-cuti"));
  assert.ok(ALWAYS_ALLOWED_QUICK_ROUTES.includes("absensi-saya"));
  assert.ok(ALWAYS_ALLOWED_QUICK_ROUTES.includes("izin"));
});
