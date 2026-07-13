/**
 * =====================================================================
 * APP.JS — Mesin Router Utama SPA (Hash-based, tanpa reload halaman)
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 */
import { getSession, logout, computeVisibleMenus, canAccessRoute, MENU_CONFIG, loginWithToken } from "./auth.js";
import { parseHash, toast, fmtDateTime, openModal, closeModal, sha256, fsUpdate } from "./utils.js";
import { icon, avatar } from "./components.js";
import { db, COL, collection, query, where, getDocs, doc, getDoc } from "./firebase-config.js";

const viewContainer = document.getElementById("view-container");
let currentUnmount = null;
let currentRoute = null;

/* ---------------------------------------------------------------------
 * BOOTSTRAP
 * ------------------------------------------------------------------- */
async function boot() {
  const bootLoader = document.getElementById("boot-loader");
  const { path, params } = parseHash();
  const token = params.get("token");

  // INTERSEP: Jika ada token Magic Link di URL dari Email
  if (token) {
    try {
      const pText = bootLoader.querySelector("p");
      if (pText) pText.textContent = "Memverifikasi login aman sekali pakai...";
      
      // Proses login menggunakan token
      await loginWithToken(token);
      
      // Bersihkan URL dari token agar tidak bisa di-copy orang lain, lalu muat ulang halaman
      window.location.replace(window.location.pathname + "#" + (path || "approval"));
      return; 
    } catch (e) {
      alert("Akses otomatis gagal: " + e.message + "\nSilakan login secara manual.");
      window.location.replace(window.location.pathname + "#login");
      return;
    }
  }

  const session = getSession();

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

  if (path === currentRoute && path !== "pengajuan") {
    // re-render tetap diizinkan untuk pengajuan (deep link form)
    // selain itu abaikan jika route sama
  }

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

  // INJEKSI TOMBOL GANTI PASSWORD
  if (!document.getElementById("btn-ganti-pw")) {
      const pwBtn = document.createElement("button");
      pwBtn.id = "btn-ganti-pw";
      pwBtn.className = "w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition flex items-center gap-2 border-b border-slate-100";
      pwBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4v-3.252a1 1 0 01.293-.707l8.96-8.96A6 6 0 0121 9z"/></svg> Ganti Password`;
      userDropdown.insertBefore(pwBtn, document.getElementById("btn-logout"));
      pwBtn.addEventListener("click", () => openChangePasswordModal(session));
  }

  document.getElementById("btn-logout").addEventListener("click", () => logout());
  document.getElementById("btn-notif").addEventListener("click", () => location.hash = "#dashboard");

  checkUnreadNotifications(session);
}

// LOGIKA MODAL GANTI PASSWORD
async function openChangePasswordModal(session) {
   openModal({
      title: "Ganti Password",
      size: "md",
      bodyHtml: `
        <form id="form-ganti-pw" class="space-y-4">
           <div>
             <label class="block text-xs font-medium text-slate-500 mb-1.5">Password Lama</label>
             <input type="password" id="pw-lama" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
           </div>
           <div>
             <label class="block text-xs font-medium text-slate-500 mb-1.5">Password Baru</label>
             <input type="password" id="pw-baru" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
           </div>
           <div>
             <label class="block text-xs font-medium text-slate-500 mb-1.5">Konfirmasi Password Baru</label>
             <input type="password" id="pw-konfirm" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
           </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-pw" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-pw" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Simpan Password</button>`,
      onMount: (m) => {
         m.querySelector("#btn-cancel-pw").onclick = closeModal;
         m.querySelector("#btn-save-pw").onclick = async () => {
            const form = m.querySelector("#form-ganti-pw");
            if (!form.reportValidity()) return;

            const lama = m.querySelector("#pw-lama").value;
            const baru = m.querySelector("#pw-baru").value;
            const konfirm = m.querySelector("#pw-konfirm").value;

            if (baru !== konfirm) return toast("Konfirmasi password baru tidak cocok!", "warning");
            if (baru.length < 6) return toast("Password minimal 6 karakter", "warning");

            const btn = m.querySelector("#btn-save-pw");
            btn.disabled = true; btn.textContent = "Menyimpan...";

            try {
               const snap = await getDoc(doc(db, COL.USERS, session.username));
               const user = snap.data();
               const hashLama = await sha256(lama);

               // Cek kecocokan password lama
               if (user.password_hash !== hashLama && user.password !== lama) {
                  throw new Error("Password lama salah");
               }

               const hashBaru = await sha256(baru);
               await fsUpdate(COL.USERS, session.username, { password_hash: hashBaru, password: "" });
               
               toast("Password berhasil diubah. Silakan login ulang.", "success");
               closeModal();
               
               // Paksa logout setelah ganti password untuk merefresh sesi
               setTimeout(() => { logout(); }, 2000);
            } catch(e) {
               toast(e.message, "error");
               btn.disabled = false; btn.textContent = "Simpan Password";
            }
         }
      }
   });
}

async function checkUnreadNotifications(session) {
  try {
    const q = query(collection(db, COL.NOTIFICATIONS), where("username_target", "==", session.username), where("dibaca", "==", false));
    const snap = await getDocs(q);
    if (!snap.empty) document.getElementById("notif-dot").classList.remove("hidden");
  } catch (e) {
    /* koleksi mungkin belum ada, abaikan */
  }
}

function startClock() {
  const el = document.getElementById("header-clock");
  const tick = () => {
    el.textContent = new Date().toLocaleString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 30000);
}

// Inisialisasi aplikasi
boot();
