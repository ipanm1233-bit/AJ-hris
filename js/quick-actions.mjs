/**
 * Logika murni tombol akses cepat (floating "+").
 *
 * Konfigurasi disimpan di app_settings/main.quick_actions agar bisa diatur
 * HRD dari menu Konfigurasi. Modul ini tidak menyentuh DOM supaya mudah diuji.
 */

export const QUICK_ACTION_MAX_ITEMS = 12;
export const QUICK_ACTION_MAX_LABEL = 40;

const ROUTE_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;

export const DEFAULT_QUICK_ACTIONS = Object.freeze([
  { id: "cuti", label: "Ajukan Cuti", route: "pengajuan-cuti", icon: "calendar", enabled: true },
  { id: "izin", label: "Ajukan Izin", route: "izin", icon: "doc-plus", enabled: true },
  { id: "pengajuan", label: "Katalog Pengajuan", route: "pengajuan", icon: "doc-plus", enabled: true },
  { id: "absensi", label: "Absensi Saya", route: "absensi-saya", icon: "clock", enabled: true },
  { id: "riwayat", label: "Riwayat Pengajuan", route: "riwayat", icon: "clock", enabled: true }
]);

/**
 * Route swalayan yang selalu boleh dibuka setelah login (lihat canAccessRoute
 * di auth.js). Dipakai agar item akses cepat tidak ikut tersembunyi hanya
 * karena route tersebut bukan menu utama di sidebar.
 */
export const ALWAYS_ALLOWED_QUICK_ROUTES = Object.freeze([
  "karir",
  "lowongan",
  "portal-karir",
  "loker",
  "absensi",
  "absensi-saya",
  "pengajuan",
  "pengajuan-cuti",
  "izin",
  "performance-review"
]);

function cleanLabel(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const resolved = text || String(fallback || "").replace(/\s+/g, " ").trim();
  return (resolved || "Akses Cepat").slice(0, QUICK_ACTION_MAX_LABEL);
}

function cloneDefaults() {
  return DEFAULT_QUICK_ACTIONS.map(item => ({ ...item }));
}

/**
 * Normalisasi konfigurasi. `null`/`undefined` menghasilkan daftar default,
 * sedangkan `{ items: [] }` berarti pengguna sengaja mengosongkan daftar.
 */
export function normalizeQuickActions(raw, options = {}) {
  if (raw === null || raw === undefined) {
    return { enabled: true, items: cloneDefaults() };
  }

  const source = Array.isArray(raw)
    ? { enabled: true, items: raw }
    : (typeof raw === "object" ? raw : {});
  const labels = options.routeLabels || {};
  const icons = options.iconByRoute || {};
  const entries = Array.isArray(source.items) ? source.items : [];
  const seen = new Set();
  const items = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const route = String(entry.route || entry.id || "").trim().toLowerCase();
    if (!ROUTE_RE.test(route) || seen.has(route)) continue;
    seen.add(route);
    const iconValue = String(entry.icon || "").trim().toLowerCase();
    items.push({
      id: String(entry.id || route).trim().slice(0, 60) || route,
      label: cleanLabel(entry.label, labels[route] || route),
      route,
      icon: ICON_RE.test(iconValue) ? iconValue : (icons[route] || "doc-plus"),
      enabled: entry.enabled !== false
    });
    if (items.length >= QUICK_ACTION_MAX_ITEMS) break;
  }

  return { enabled: source.enabled !== false, items };
}

/**
 * Item yang boleh tampil untuk sesi ini. `allowedRoutes` berisi route yang
 * memang terlihat oleh role pengguna (hasil computeVisibleMenus).
 */
export function resolveQuickActions(config, allowedRoutes) {
  const normalized = normalizeQuickActions(config);
  if (!normalized.enabled) return [];
  const allow = allowedRoutes instanceof Set
    ? allowedRoutes
    : (Array.isArray(allowedRoutes) ? new Set(allowedRoutes) : null);
  return normalized.items.filter(item => item.enabled && (!allow || allow.has(item.route)));
}

/**
 * Tombol + hanya untuk tampilan web biasa. Saat aplikasi dibuka sebagai PWA
 * (standalone) atau fullscreen, tombol disembunyikan agar tidak menutupi UI.
 */
export function isStandaloneWebApp(win = globalThis.window, nav = globalThis.navigator) {
  try {
    if (nav && nav.standalone === true) return true;
    if (win && (win.Capacitor || win.__AJ_NATIVE_APP__)) return true;
    if (nav && /(?:^|[\s;])wv[);\s]/i.test(String(nav.userAgent || ""))) return true;
    if (!win || typeof win.matchMedia !== "function") return false;
    return Boolean(
      win.matchMedia("(display-mode: standalone)").matches
      || win.matchMedia("(display-mode: fullscreen)").matches
      || win.matchMedia("(display-mode: minimal-ui)").matches
    );
  } catch (_) {
    return false;
  }
}

export function quickActionHref(route) {
  const value = String(route || "").trim().toLowerCase();
  if (!ROUTE_RE.test(value)) return "";
  return `#/${value}`;
}
