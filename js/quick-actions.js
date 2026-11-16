/**
 * Floating "+" akses cepat (khusus tampilan web).
 *
 * - Hanya muncul setelah login, di dalam #app-shell.
 * - Item dapat diatur HRD lewat menu Konfigurasi (app_settings/main.quick_actions).
 * - Disembunyikan saat aplikasi berjalan sebagai PWA/standalone.
 */
import { db, COL, doc, getDoc } from "./firebase-config.js";
import { escapeHtml } from "./utils.js";
import { icon } from "./components.js";
import {
  ALWAYS_ALLOWED_QUICK_ROUTES,
  isStandaloneWebApp,
  quickActionHref,
  resolveQuickActions
} from "./quick-actions.mjs";

const ROOT_ID = "quick-action-root";
const PANEL_ID = "quick-action-panel";
const ITEMS_ID = "quick-action-items";
const FAB_ID = "quick-action-fab";

const state = {
  config: undefined,
  allowedRoutes: null,
  loading: null,
  bound: false
};

function buildRoot() {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "qa-root hidden";
  root.innerHTML = `
    <div id="${PANEL_ID}" class="qa-panel hidden" role="menu" aria-label="Akses cepat">
      <div class="qa-panel-head">
        <span>Akses Cepat</span>
        <button type="button" class="qa-close" id="quick-action-close" aria-label="Tutup akses cepat">&times;</button>
      </div>
      <div id="${ITEMS_ID}" class="qa-items"></div>
    </div>
    <button type="button" id="${FAB_ID}" class="qa-fab" aria-label="Buka akses cepat" aria-expanded="false" aria-controls="${PANEL_ID}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  `;
  return root;
}

function setOpen(root, open) {
  const panel = root.querySelector(`#${PANEL_ID}`);
  const fab = root.querySelector(`#${FAB_ID}`);
  if (!panel || !fab) return;
  panel.classList.toggle("hidden", !open);
  fab.classList.toggle("is-open", open);
  fab.setAttribute("aria-expanded", open ? "true" : "false");
}

function isOpen(root) {
  const panel = root.querySelector(`#${PANEL_ID}`);
  return Boolean(panel && !panel.classList.contains("hidden"));
}

function renderItems(root) {
  const list = root.querySelector(`#${ITEMS_ID}`);
  if (!list) return;
  const items = resolveQuickActions(state.config, state.allowedRoutes);
  if (!items.length) {
    root.classList.add("hidden");
    setOpen(root, false);
    list.innerHTML = "";
    return;
  }

  list.innerHTML = items.map(item => {
    const href = quickActionHref(item.route);
    if (!href) return "";
    return `
      <a class="qa-item" role="menuitem" href="${escapeHtml(href)}" data-qa-route="${escapeHtml(item.route)}">
        ${icon(item.icon || "doc-plus", "w-4 h-4 shrink-0")}
        <span>${escapeHtml(item.label)}</span>
      </a>`;
  }).join("");
  root.classList.remove("hidden");
}

function bindEvents(root) {
  if (state.bound) return;
  state.bound = true;

  const fab = root.querySelector(`#${FAB_ID}`);
  const close = root.querySelector("#quick-action-close");

  if (fab) {
    fab.addEventListener("click", event => {
      event.stopPropagation();
      setOpen(root, !isOpen(root));
    });
  }
  if (close) {
    close.addEventListener("click", event => {
      event.stopPropagation();
      setOpen(root, false);
    });
  }

  root.addEventListener("click", event => {
    if (event.target.closest(".qa-item")) setOpen(root, false);
  });

  document.addEventListener("click", event => {
    if (!root.isConnected) return;
    if (isOpen(root) && !root.contains(event.target)) setOpen(root, false);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && root.isConnected) setOpen(root, false);
  });

  window.addEventListener("hashchange", () => {
    if (root.isConnected) setOpen(root, false);
  });

  window.addEventListener("aj:quick-actions-updated", event => {
    state.config = event.detail ?? null;
    if (root.isConnected) renderItems(root);
  });
}

async function loadConfig(force = false) {
  if (state.config !== undefined && !force) return state.config;
  if (state.loading && !force) return state.loading;

  state.loading = (async () => {
    try {
      const snap = await getDoc(doc(db, COL.APP_SETTINGS, "main"));
      state.config = snap.exists() ? (snap.data().quick_actions ?? null) : null;
    } catch (error) {
      console.warn("[quick-actions] Gagal memuat konfigurasi:", error.message);
      state.config = null;
    } finally {
      state.loading = null;
    }
    return state.config;
  })();

  return state.loading;
}

export async function mountQuickActions({ menus } = {}) {
  if (isStandaloneWebApp()) {
    document.getElementById(ROOT_ID)?.remove();
    state.bound = false;
    return;
  }

  const host = document.getElementById("app-shell") || document.body;
  if (!host) return;

  state.allowedRoutes = menus
    ? new Set([
        ...menus.map(menu => menu.route || menu.id).filter(Boolean),
        ...ALWAYS_ALLOWED_QUICK_ROUTES
      ])
    : null;

  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = buildRoot();
    host.appendChild(root);
  }
  bindEvents(root);

  await loadConfig(true);
  renderItems(root);
}

/** Uji/perorangan: paksa muat ulang konfigurasi (dipakai setelah login ulang). */
export function resetQuickActionsCache() {
  state.config = undefined;
  state.loading = null;
}
