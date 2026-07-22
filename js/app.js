/**
 * =====================================================================
 * APP.JS — Mesin Router Utama SPA (Hash-based, tanpa reload halaman)
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 */
import { getSession, logout, computeVisibleMenus, canAccessRoute, MENU_CONFIG, loginWithToken } from "./auth.js";
import { parseHash, toast, fmtDateTime, openModal, closeModal, sha256, fsUpdate } from "./utils.js";
import { icon, avatar, openNotificationCenter } from "./components.js";
import { db, messaging, COL, collection, query, where, getDocs, doc, getDoc, updateDoc } from "./firebase-config.js";
import { getToken } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

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
      
      await loginWithToken(token);
      history.replaceState(null, "", window.location.pathname + "#" + (path || "approval"));
      
    } catch (e) {
      alert("Akses otomatis gagal: " + e.message + "\nSilakan login secara manual.");
      history.replaceState(null, "", window.location.pathname + "#login");
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
  aktifkanNotifikasiHP(session);

   window.addEventListener("hashchange", () => router(session));
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'NAVIGATE') {
        let target = event.data.url || '#dashboard';
        if (target.includes('#')) {
          const hash = target.split('#')[1];
          window.location.hash = '#' + hash;
        } else if (target.startsWith('#')) {
          window.location.hash = target;
        } else {
          window.location.hash = '#dashboard';
        }
      }
    });
  }

  if (!location.hash || location.hash === "#login") {
     location.hash = "#dashboard";
  }
  
  await router(session);
  bootLoader.classList.add("hidden");
}

/* ---------------------------------------------------------------------
 * FUNGSI NOTIFIKASI PWA (FCM)
 * ------------------------------------------------------------------- */
async function aktifkanNotifikasiHP(userData) {
    // 1. CEK DUKUNGAN BROWSER: Mencegah crash di iPhone (Safari)
    if (!messaging) {
        console.warn("Fitur Push Notification tidak didukung di tab ini (Gunakan fitur Add to Home Screen).");
        return; 
    }

    try {
        // 2. Minta izin ke pengguna HP
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            let registration = null;
            if ('serviceWorker' in navigator) {
                registration = await navigator.serviceWorker.ready;
            }
            
            const currentToken = await getToken(messaging, { 
                vapidKey: 'BLAv8-HIF945zC4llQ3VaSi_n1cIuk6GbFJLasQA7notR1IP0JbKmG1kzTJ2xoqQs7StT_tyKRW4BWe5ZN24XGE',
                serviceWorkerRegistration: registration
            });

            if (currentToken) {
                console.log('Token HP Karyawan:', currentToken);
                
                // Simpan token ke database karyawan & users
                if (userData && userData.username) {
                    await fsUpdate(COL.USERS, userData.username, {
                        fcm_token: currentToken
                    });
                    
                    if (userData.nik) {
                        try {
                            await updateDoc(doc(db, COL.MASTER_KARYAWAN, String(userData.nik)), {
                                fcm_token: currentToken
                            });
                        } catch(e) {
                            console.warn("Karyawan doc update failed: ", e);
                        }
                    } else if (userData.id) {
                        try {
                            await updateDoc(doc(db, COL.MASTER_KARYAWAN, String(userData.id)), {
                                fcm_token: currentToken
                            });
                        } catch(e) {
                            console.warn("Karyawan doc update failed: ", e);
                        }
                    }
                    console.log("Token FCM berhasil disimpan ke database!");
                }
            }
        } else {
            console.log('Izin notifikasi ditolak oleh pengguna.');
        }
    } catch (error) {
        console.error('Gagal mengaktifkan notifikasi:', error);
    }
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
      location.reload(); 
    }
  });
}

/* ---------------------------------------------------------------------
 * RENDER SHELL: HEADER + SIDEBAR SESUAI RBAC
 * ------------------------------------------------------------------- */
async function renderShellForUser(session) {
  const elNama = document.getElementById("header-nama");
  if (elNama) elNama.textContent = session.nama;

  const elRole = document.getElementById("header-role");
  if (elRole) elRole.textContent = session.role;

  const elAvatar = document.getElementById("header-avatar");
  if (elAvatar) elAvatar.outerHTML = avatar(session.foto_url || session.nama, "w-8 h-8").replace('class="', 'id="header-avatar" class="');

  const mobileAvatarEl = document.getElementById("header-avatar-mobile");
  if (mobileAvatarEl) {
    mobileAvatarEl.outerHTML = avatar(session.foto_url || session.nama, "w-8 h-8").replace('class="', 'id="header-avatar-mobile" class="');
  }

  const menus = await computeVisibleMenus(session);

  // 1. Kelompokkan menu berdasarkan properti "kategori"
  const groupedMenus = menus.reduce((acc, menu) => {
    const cat = menu.kategori || "Lain-lain";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(menu);
    return acc;
  }, {});

  const nav = document.getElementById("sidebar-nav");
  let html = "";

  // 2. Render HTML menggunakan elemen <details> untuk efek Accordion (Buka/Tutup)
  for (const [kategori, items] of Object.entries(groupedMenus)) {
    // Biarkan "Menu Utama" selalu terbuka secara default saat login
    const isOpen = kategori === "Menu Utama" ? "open" : "";

    html += `
    <details class="group mb-2" ${isOpen}>
      <summary class="flex items-center justify-between px-4 py-2.5 cursor-pointer rounded-lg hover:bg-slate-50 transition list-none outline-none [&::-webkit-details-marker]:hidden sidebar-item">
        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider sidebar-label">${kategori}</span>
        <!-- Icon Panah (Berputar 180 derajat saat tab dibuka) -->
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      
      <!-- Isi Anak Menu (Sub-menu) -->
      <div class="mt-1 space-y-1 px-2 pb-2">
        ${items.map(m => `
          <a href="#${m.route || m.id}" data-route="${m.route || m.id}" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-maroon-50 hover:text-maroon-700 transition" title="${m.label}">
            ${icon(m.icon || 'box', 'w-[18px] h-[18px] shrink-0')}
            <span class="sidebar-label">${m.label}</span>
          </a>
        `).join('')}
      </div>
    </details>`;
  }

  if (nav) nav.innerHTML = html;
}

function highlightActive(route) {
  document.querySelectorAll(".sidebar-item").forEach(a => {
    a.classList.toggle("active", a.dataset.route === route);
  });

  // Mobile bottom tab active indicator mapping
  document.querySelectorAll("[data-mobile-tab]").forEach(tab => {
    const tabRoute = tab.getAttribute("data-mobile-tab");
    let isActive = false;
    
    if (tabRoute === route) {
      isActive = true;
    } else if (tabRoute === "dashboard" && route === "dashboard") {
      isActive = true;
    } else if (tabRoute === "absensi" && (route === "absensi" || route === "klaim-bensin" || route === "lembur-kasbon" || route === "manajemen-cuti" || route === "cuti")) {
      isActive = true;
    } else if (tabRoute === "pengajuan" && route === "pengajuan") {
      isActive = true;
    } else if (tabRoute === "riwayat" && (route === "riwayat" || route === "performance-review" || route === "penilaian-kontrak" || route === "training" || route === "siklus-karyawan" || route === "broadcast")) {
      isActive = true;
    } else if (tabRoute === "profile" && route === "profile") {
      isActive = true;
    }

    if (isActive) {
      tab.classList.remove("text-slate-400");
      tab.classList.add("text-maroon-700");
    } else {
      tab.classList.add("text-slate-400");
      tab.classList.remove("text-maroon-700");
    }
  });

  // Toggle mobile header back button
  const backBtn = document.getElementById("mobile-back-btn");
  if (backBtn) {
    if (["dashboard", "absensi", "pengajuan", "riwayat", "profile"].includes(route)) {
      backBtn.classList.add("hidden");
    } else {
      backBtn.classList.remove("hidden");
    }
  }
}

/* ---------------------------------------------------------------------
 * ROUTER — inti navigasi SPA tanpa reload
 * ------------------------------------------------------------------- */
const ROUTE_TITLES = {
  profile: "Profil Saya",
  ...Object.fromEntries(MENU_CONFIG.map(m => [m.route || m.id, m.label]))
};

async function router(session) {
  const container = document.getElementById("view-container");
  if (!container) return;

  const { path, params } = parseHash();

  if (path === currentRoute && path !== "pengajuan") {
    // re-render tetap diizinkan untuk pengajuan (deep link form)
  }

  const allowed = await canAccessRoute(path, session);
  if (!allowed) {
    toast("Anda tidak memiliki akses ke menu tersebut", "warning");
    location.hash = "#dashboard";
    return;
  }

  container.classList.remove("animate-fadein");
  void container.offsetWidth; // reflow trigger biar animasi re-trigger tiap navigasi
  container.classList.add("animate-fadein");

  try {
    if (typeof currentUnmount === "function") { currentUnmount(); currentUnmount = null; }
    
    const html = await fetch(`views/${path}.html`).then(r => {
      if (!r.ok) throw new Error("view-not-found");
      return r.text();
    });
    
    container.innerHTML = html;
    
    const mod = await import(`./views/${path}.js`);
    if (mod && typeof mod.mount === "function") {
      const result = await mod.mount(container, { params, session });
      if (result && typeof result.unmount === "function") currentUnmount = result.unmount;
    }
    
    currentRoute = path;
    highlightActive(path);
    document.title = `${ROUTE_TITLES[path] || "Portal"} — Andela Jaya HRIS`;
    
  } catch (err) {
    console.error("Router error:", err);
    container.innerHTML = `
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

  document.getElementById("btn-sidebar-toggle")?.addEventListener("click", () => {
    if (window.innerWidth < 1024) {
      sidebar?.classList.toggle("mobile-open");
      backdrop?.classList.toggle("hidden");
    } else {
      sidebar?.classList.toggle("collapsed");
      main?.classList.toggle("expanded");
    }
  });

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      sidebar?.classList.remove("mobile-open");
      backdrop.classList.add("hidden");
    });
  }

  document.getElementById("sidebar-nav")?.addEventListener("click", (e) => {
    if (window.innerWidth < 1024 && e.target.closest("[data-route]")) {
      sidebar?.classList.remove("mobile-open");
      backdrop?.classList.add("hidden");
    }
  });

  const userBtn = document.getElementById("btn-user-menu");
  const userDropdown = document.getElementById("user-menu-dropdown");
  
  if (userBtn) {
    userBtn.addEventListener("click", () => userDropdown?.classList.toggle("hidden"));
  }

  document.addEventListener("click", (e) => {
    if (userBtn && userDropdown) {
      if (!userBtn.contains(e.target) && !userDropdown.contains(e.target)) userDropdown.classList.add("hidden");
    }
  });

  // INJEKSI TOMBOL GANTI PASSWORD
  if (userDropdown && !document.getElementById("btn-ganti-pw")) {
      const pwBtn = document.createElement("button");
      pwBtn.id = "btn-ganti-pw";
      pwBtn.className = "w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition flex items-center gap-2 border-b border-slate-100";
      pwBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4v-3.252a1 1 0 01.293-.707l8.96-8.96A6 6 0 0121 9z"/></svg> Ganti Password`;
      userDropdown.insertBefore(pwBtn, document.getElementById("btn-logout"));
      pwBtn.addEventListener("click", () => openChangePasswordModal(session));
  }

  document.getElementById("btn-logout")?.addEventListener("click", () => logout());
  document.getElementById("btn-notif")?.addEventListener("click", () => openNotificationCenter(session));

  const btnNotifMobile = document.getElementById("btn-notif-mobile");
  if (btnNotifMobile) {
    btnNotifMobile.addEventListener("click", () => openNotificationCenter(session));
  }

  const btnProfileMobile = document.getElementById("btn-profile-mobile");
  if (btnProfileMobile) {
    btnProfileMobile.addEventListener("click", () => {
      openModal({
        title: "Menu Akun & Profil",
        size: "sm",
        bodyHtml: `
          <div class="space-y-3 py-2 text-left">
            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div class="w-10 h-10 rounded-full bg-maroon-100 text-maroon-800 font-bold flex items-center justify-center shrink-0">
                ${(session.nama || "U").charAt(0)}
              </div>
              <div>
                <p class="font-bold text-slate-800 text-sm leading-tight">${escapeHtml(session.nama || "-")}</p>
                <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(session.role || "-")}</p>
              </div>
            </div>
            <button id="mb-btn-profile" class="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition flex items-center gap-3">
              <span class="text-lg">👤</span>
              <div>
                <p class="font-semibold text-slate-800">Lihat Profil Saya</p>
                <p class="text-[11px] text-slate-400">Ubah data diri & dokumen karyawan</p>
              </div>
            </button>
            <button id="mb-btn-password" class="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition flex items-center gap-3">
              <span class="text-lg">🔑</span>
              <div>
                <p class="font-semibold text-slate-800">Ganti Password</p>
                <p class="text-[11px] text-slate-400">Ubah kata sandi akun Anda</p>
              </div>
            </button>
            <button id="mb-btn-logout" class="w-full text-left px-4 py-3 text-sm font-semibold text-red-600 bg-red-50/60 hover:bg-red-100/80 border border-red-100 rounded-xl transition flex items-center gap-3">
              <span class="text-lg">🚪</span>
              <div>
                <p class="font-bold text-red-700">Logout / Keluar</p>
                <p class="text-[11px] text-red-500">Keluar dari aplikasi HRIS</p>
              </div>
            </button>
          </div>
        `,
        footerHtml: `
          <button id="mb-btn-close" class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition">Tutup</button>
        `,
        onMount: (m) => {
          m.querySelector("#mb-btn-close").onclick = closeModal;
          m.querySelector("#mb-btn-profile").onclick = () => {
            closeModal();
            location.hash = "#profile";
          };
          m.querySelector("#mb-btn-password").onclick = () => {
            closeModal();
            openChangePasswordModal(session);
          };
          m.querySelector("#mb-btn-logout").onclick = () => {
            closeModal();
            logout();
          };
        }
      });
    });
  }

  const mobileBackBtn = document.getElementById("mobile-back-btn");
  if (mobileBackBtn) {
    mobileBackBtn.onclick = () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.hash = "#dashboard";
      }
    };
  }

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

               if (user.password_hash !== hashLama && user.password !== lama) {
                  throw new Error("Password lama salah");
               }

               const hashBaru = await sha256(baru);
               await fsUpdate(COL.USERS, session.username, { password_hash: hashBaru, password: "" });
               
               toast("Password berhasil diubah. Silakan login ulang.", "success");
               closeModal();
               
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

boot();
