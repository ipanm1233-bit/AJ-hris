/**
 * =====================================================================
 * APP.JS — Mesin Router Utama SPA (Hash-based, tanpa reload halaman)
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 */
import { getSession, logout, computeVisibleMenus, canAccessRoute, MENU_CONFIG } from "./auth.js";
import { parseHash, toast, fmtDateTime } from "./utils.js";
import { icon, avatar } from "./components.js";
import { db, COL, collection, query, where, getDocs } from "./firebase-config.js";

const viewContainer = document.getElementById("view-container");
let currentUnmount = null;
let currentRoute = null;

/* ---------------------------------------------------------------------
 * BOOTSTRAP
 * ------------------------------------------------------------------- */
async function boot() {
  const session = getSession();
  const bootLoader = document.getElementById("boot-loader");

  if (!session) {
    await showLogin();
    bootLoader.classList.add("hidden");
    return;
  }

  document.getElementById("login-container").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");

  await renderShellForUser(session);
  bindShellEvents(session);
  startClock();

  window.addEventListener("hashchange", () => router(session));
  if (!location.hash || location.hash === "#login") location.hash = "#dashboard";
  await router(session);

  bootLoader.classList.add("hidden");
}

/* ---------------------------------------------------------------------
 * LOGIN SCREEN
 * ------------------------------------------------------------------- */
async function showLogin() {
  document.getElementById("app-shell").classList.add("hidden");
  const loginContainer = document.getElementById("login-container");
  loginContainer.classList.remove("hidden");
  const html = await fetch("views/login.html").then(r => r.text());
  loginContainer.innerHTML = html;
  const mod = await import("./views/login.js");
  mod.mount(loginContainer, {
    onSuccess: () => {
      loginContainer.classList.add("hidden");
      location.reload(); // reload bersih agar seluruh state RBAC & cache ter-inisialisasi ulang
    }
  });
}

/* ---------------------------------------------------------------------
 * RENDER SHELL: HEADER + SIDEBAR SESUAI RBAC
 * ------------------------------------------------------------------- */
async function renderShellForUser(session) {
  document.getElementById("header-nama").textContent = session.nama;
  document.getElementById("header-role").textContent = session.role;
  document.getElementById("header-avatar").outerHTML = avatar(session.nama, "w-8 h-8").replace('class="', 'id="header-avatar" class="');

  const menus = await computeVisibleMenus(session);
  const groups = [
    { key: "all", title: "Menu Utama" },
    { key: "hrd", title: "Modul HRD" },
    { key: "manajemen", title: "Modul Manajemen" }
  ];

  const nav = document.getElementById("sidebar-nav");
  nav.innerHTML = groups.map(g => {
    const items = menus.filter(m => m.group === g.key);
    if (!items.length) return "";
    return `
      <div class="sidebar-group-title">${g.title}</div>
      ${items.map(m => `
        <a href="#${m.route}" data-route="${m.route}" class="sidebar-item" title="${m.label}">
          ${icon(m.icon, "w-[18px] h-[18px] shrink-0")}
          <span class="sidebar-label">${m.label}</span>
        </a>`).join("")}
    `;
  }).join("");
}

function highlightActive(route) {
  document.querySelectorAll(".sidebar-item").forEach(a => {
    a.classList.toggle("active", a.dataset.route === route);
  });
}

/* ---------------------------------------------------------------------
 * ROUTER — inti navigasi SPA tanpa reload
 * ------------------------------------------------------------------- */
const ROUTE_TITLES = Object.fromEntries(MENU_CONFIG.map(m => [m.route, m.label]));

async function router(session) {
  const { path, params } = parseHash();
  if (path === currentRoute && path !== "pengajuan") { /* re-render tetap diizinkan untuk pengajuan (deep link form) */ }

  const allowed = await canAccessRoute(path, session);
  if (!allowed) {
    toast("Anda tidak memiliki akses ke menu tersebut", "warning");
    location.hash = "#dashboard";
    return;
  }

  viewContainer.classList.remove("animate-fadein");
  void viewContainer.offsetWidth; // reflow trigger biar animasi re-trigger tiap navigasi
  viewContainer.classList.add("animate-fadein");

  try {
    if (typeof currentUnmount === "function") { currentUnmount(); currentUnmount = null; }

    const html = await fetch(`views/${path}.html`).then(r => {
      if (!r.ok) throw new Error("view-not-found");
      return r.text();
    });
    viewContainer.innerHTML = html;

    const mod = await import(`./views/${path}.js`);
    if (mod && typeof mod.mount === "function") {
      const result = await mod.mount(viewContainer, { params, session });
      if (result && typeof result.unmount === "function") currentUnmount = result.unmount;
    }
    currentRoute = path;
    highlightActive(path);
    document.title = `${ROUTE_TITLES[path] || "Portal"} — Andela Jaya HRIS`;
  } catch (err) {
    console.error("Router error:", err);
    viewContainer.innerHTML = `
      <div class="text-center py-24">
        <p class="text-2xl font-bold text-slate-300">404</p>
        <p class="text-slate-500 mt-2">Halaman "${path}" tidak ditemukan.</p>
        <a href="#dashboard" class="inline-block mt-4 text-maroon-700 font-medium hover:underline">Kembali ke Dashboard</a>
      </div>`;
  }
}

/* ---------------------------------------------------------------------
 * SHELL INTERACTIONS: toggle sidebar, dropdown user, notifikasi, jam
 * ------------------------------------------------------------------- */
function bindShellEvents(session) {
  const sidebar = document.getElementById("sidebar");
  const main = document.getElementById("main-content");
  const backdrop = document.getElementById("sidebar-backdrop");

  document.getElementById("btn-sidebar-toggle").addEventListener("click", () => {
    if (window.innerWidth < 1024) {
      sidebar.classList.toggle("mobile-open");
      backdrop.classList.toggle("hidden");
    } else {
      sidebar.classList.toggle("collapsed");
      main.classList.toggle("expanded");
    }
  });
  backdrop.addEventListener("click", () => {
    sidebar.classList.remove("mobile-open");
    backdrop.classList.add("hidden");
  });
  document.getElementById("sidebar-nav").addEventListener("click", (e) => {
    if (window.innerWidth < 1024 && e.target.closest("[data-route]")) {
      sidebar.classList.remove("mobile-open");
      backdrop.classList.add("hidden");
    }
  });

  const userBtn = document.getElementById("btn-user-menu");
  const userDropdown = document.getElementById("user-menu-dropdown");
  userBtn.addEventListener("click", () => userDropdown.classList.toggle("hidden"));
  document.addEventListener("click", (e) => {
    if (!userBtn.contains(e.target) && !userDropdown.contains(e.target)) userDropdown.classList.add("hidden");
  });
  document.getElementById("btn-logout").addEventListener("click", () => logout());

  document.getElementById("btn-notif").addEventListener("click", () => location.hash = "#dashboard");
  checkUnreadNotifications(session);
}

async function checkUnreadNotifications(session) {
  try {
    const q = query(collection(db, COL.NOTIFICATIONS), where("username_target", "==", session.username), where("dibaca", "==", false));
    const snap = await getDocs(q);
    if (!snap.empty) document.getElementById("notif-dot").classList.remove("hidden");
  } catch (e) { /* koleksi mungkin belum ada, abaikan */ }
}

function startClock() {
  const el = document.getElementById("header-clock");
  const tick = () => {
    el.textContent = new Date().toLocaleString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 30000);
}

boot();
