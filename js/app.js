/**
 * =====================================================================
 * APP.JS — Mesin Router Utama SPA (Hash-based, tanpa reload halaman)
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 */
import { getSession, logout, computeVisibleMenus, canAccessRoute, MENU_CONFIG, loginWithToken } from "./auth.js";
import { parseHash, toast, fmtDateTime, openModal, closeModal, sha256, fsUpdate } from "./utils.js";
import { icon, avatar, openNotificationCenter, showMemoDetailById, skeletonShadowLayout } from "./components.js";
import { db, messaging, firebaseConfig, COL, collection, query, where, getDocs, doc, getDoc, updateDoc } from "./firebase-config.js";
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
      params.delete("token");
      const remainingQs = params.toString();
      const targetHash = (path || "approval") + (remainingQs ? "?" + remainingQs : "");
      history.replaceState(null, "", window.location.pathname + "#" + targetHash);
      
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
    // 1. CEK DUKUNGAN BROWSER & SERVICeworker: Mencegah error di iframe / browser yang belum mengizinkan
    if (!messaging || !('Notification' in window)) {
        console.info("Fitur FCM Push Notification tidak diaktifkan pada lingkungan tab browser ini.");
        return; 
    }

    try {
        // Hanya proses token jika izin sudah diberikan pengguna secara eksplisit
        if (Notification.permission !== 'granted') {
            return;
        }

        let registration = null;
        if ('serviceWorker' in navigator) {
            registration = await navigator.serviceWorker.ready.catch(() => null);
        }
        
        let currentToken = null;
        try {
            const vKey = firebaseConfig?.vapidKey || window.fcmVapidKey || undefined;
            currentToken = await getToken(messaging, { 
                vapidKey: vKey,
                serviceWorkerRegistration: registration || undefined
            });
        } catch (fcmErr) {
            console.info("Layanan Notifikasi FCM tidak memerlukan tindakan lanjutan (Sandbox/VAPID Mode):", fcmErr.message);
            return;
        }

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
    } catch (error) {
        console.info('Pemberitahuan Notifikasi:', error.message);
    }
}

export function syncNotifSwitchUI() {
  const isGranted = 'Notification' in window && Notification.permission === 'granted';

  // Desktop Elements
  const trackDesktop = document.getElementById("notif-toggle-track-desktop");
  const knobDesktop = document.getElementById("notif-toggle-knob-desktop");
  const textDesktop = document.getElementById("notif-toggle-text-desktop");

  if (trackDesktop && knobDesktop && textDesktop) {
    if (isGranted) {
      trackDesktop.className = "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-emerald-500 transition-colors duration-200 ease-in-out shadow-xs";
      knobDesktop.className = "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-4";
      textDesktop.className = "text-[10px] font-black text-emerald-600 w-6 text-center";
      textDesktop.textContent = "ON";
    } else {
      trackDesktop.className = "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-300 transition-colors duration-200 ease-in-out";
      knobDesktop.className = "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-0";
      textDesktop.className = "text-[10px] font-extrabold text-slate-400 w-6 text-center";
      textDesktop.textContent = "OFF";
    }
  }

  // Mobile Elements
  const trackMobile = document.getElementById("notif-toggle-track-mobile");
  const knobMobile = document.getElementById("notif-toggle-knob-mobile");
  const textMobile = document.getElementById("notif-toggle-text-mobile");

  if (trackMobile && knobMobile && textMobile) {
    if (isGranted) {
      trackMobile.className = "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-emerald-500 transition-colors duration-200 ease-in-out shadow-xs";
      knobMobile.className = "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-3.5";
      textMobile.className = "text-[10px] font-black text-emerald-600";
      textMobile.textContent = "ON";
    } else {
      trackMobile.className = "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-300 transition-colors duration-200 ease-in-out";
      knobMobile.className = "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-0";
      textMobile.className = "text-[10px] font-extrabold text-slate-400";
      textMobile.textContent = "OFF";
    }
  }
}

export async function handleTestAndActivateNotification(session) {
  if (!('Notification' in window)) {
    toast("Browser HP ini tidak mendukung fitur Notifikasi Web.", "error");
    return;
  }

  const sendSafeNotification = (title, options) => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  };

  const registerDeviceToken = async () => {
    if (!messaging) {
      console.info("Modul FCM Firebase belum dikonfigurasi di browser ini.");
      return;
    }
    try {
      toast("Sedang mendaftarkan token notifikasi perangkat...", "info");
      let registration = null;
      if ('serviceWorker' in navigator) {
        registration = await navigator.serviceWorker.ready.catch(() => null);
      }
      
      let currentToken = null;
      try {
        const vKey = firebaseConfig?.vapidKey || window.fcmVapidKey || undefined;
        currentToken = await getToken(messaging, { 
          vapidKey: vKey,
          serviceWorkerRegistration: registration || undefined
        });
      } catch (fcmErr) {
        console.warn("FCM Token subscription info:", fcmErr.message);
      }
      
      if (currentToken) {
        if (session && session.username) {
          await fsUpdate(COL.USERS, session.username, {
            fcm_token: currentToken
          });
          
          if (session.nik) {
            try {
              await updateDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)), {
                fcm_token: currentToken
              });
            } catch(err) {
              console.warn("Karyawan doc update failed: ", err);
            }
          }
          toast("Token notifikasi berhasil disimpan ke profil Anda!", "success");
        }
      } else {
        console.info("Pendaftaran FCM Token tidak mengembalikan token, menggunakan notifikasi browser lokal.");
      }
    } catch (e) {
      console.warn("Proses token notifikasi:", e.message);
    }
  };

  if (Notification.permission === 'granted') {
    await registerDeviceToken();
    sendSafeNotification("HRAPP — Notification Test", {
      body: "Status Notifikasi: AKTIF (ON). Perangkat Anda terhubung!",
      icon: "/assets/icon-192x192.png" 
    });
    toast("Modul Notifikasi AKTIF (ON). Tes pengiriman berhasil!", "success");
    syncNotifSwitchUI();
    return;
  }

  if (Notification.permission === 'denied') {
    toast("Izin notifikasi ditolak di browser. Silakan izinkan di pengaturan browser Anda.", "warning");
    syncNotifSwitchUI();
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerDeviceToken();
      sendSafeNotification("HRAPP — Notification Test", {
        body: "Pendaftaran sukses! Modul notifikasi kini dalam status AKTIF (ON).",
        icon: "/assets/icon-192x192.png"
      });
      toast("Modul Notifikasi Berhasil Diaktifkan (ON)!", "success");
    } else {
      toast("Izin notifikasi belum diberikan.", "warning");
    }
    syncNotifSwitchUI();
  } catch (e) {
    toast("Gagal meminta izin notifikasi: " + e.message, "error");
    syncNotifSwitchUI();
  }
}

async function loadViewHtml(viewName) {
  const paths = [
    `/views/${viewName}.html`,
    `./views/${viewName}.html`,
    `views/${viewName}.html`
  ];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res.ok) {
        return await res.text();
      }
    } catch (e) {
      // lanjut mencoba path berikutnya
    }
  }
  throw new Error(`view-not-found: ${viewName}`);
}

/* ---------------------------------------------------------------------
 * LOGIN SCREEN
 * ------------------------------------------------------------------- */
async function showLogin() {
  document.getElementById("app-shell").classList.add("hidden");
  const loginContainer = document.getElementById("login-container");
  loginContainer.classList.remove("hidden");

  try {
    const html = await loadViewHtml("login");
    loginContainer.innerHTML = html;
  } catch (e) {
    console.warn("Gagal memuat login template via fetch:", e);
  }

  try {
    const mod = await import("./views/login.js");
    if (mod && typeof mod.mount === "function") {
      mod.mount(loginContainer, {
        onSuccess: () => {
          loginContainer.classList.add("hidden");
          location.reload(); 
        }
      });
    }
  } catch (e) {
    console.error("Gagal memuat modul login.js:", e);
  }
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

  const roleUpper = (session?.role || "").toUpperCase();
  let displayMenus = menus;

  // 1. Kelompokkan menu berdasarkan properti "kategori"
  const groupedMenus = displayMenus.reduce((acc, menu) => {
    const cat = menu.kategori || "Lain-lain";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(menu);
    return acc;
  }, {});

  const nav = document.getElementById("sidebar-nav");
  let html = "";

  // 2. Render HTML menggunakan elemen <details> untuk efek Accordion (Buka/Tutup)
  for (const [kategori, items] of Object.entries(groupedMenus)) {
    // Biarkan kategori menu yang memiliki isi terbuka secara default agar user langsung dapat melihat seluruh menu yang diberikan
    const isOpen = "open";

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
    } else if (tabRoute === "absensi" && (route === "absensi" || route === "klaim-bensin" || route === "lembur-kasbon" || route === "manajemen-cuti" || route === "cuti" || route === "izin")) {
      isActive = true;
    } else if (tabRoute === "pengajuan" && route === "pengajuan") {
      isActive = true;
    } else if (tabRoute === "riwayat" && (route === "riwayat" || route === "performance-review" || route === "penilaian-kontrak" || route === "training" || route === "siklus-karyawan" || route === "broadcast")) {
      isActive = true;
    } else if (tabRoute === "profile" && route === "profile") {
      isActive = true;
    }

    if (isActive) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
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

  let { path, params } = parseHash();
  let cleanPath = String(path || "").replace(/^[\/#]+/, "").replace(/[\/#]+$/, "").trim();
  if (!cleanPath || cleanPath === "login") cleanPath = "dashboard";

  let mappedPath = cleanPath;
  if (["manajemen-cuti"].includes(cleanPath)) {
    mappedPath = "cuti";
  }
  if (["kedisiplinan", "kedisiplinan-sp", "sp", "disiplin"].includes(cleanPath)) {
    mappedPath = "pemanggilan";
  }
  if (["penilaian", "kontrak", "master-kontrak", "kontrak-karyawan", "evaluasi-kontrak", "kpi", "kpi360", "evaluasi", "penilaian-kontrak"].includes(cleanPath)) {
    if (["kontrak", "master-kontrak", "kontrak-karyawan"].includes(cleanPath)) {
      params.set("tab", "kontrak");
    } else if (["evaluasi-kontrak", "evaluasi"].includes(cleanPath)) {
      params.set("tab", "evaluasi");
    } else if (["kpi", "kpi360"].includes(cleanPath)) {
      params.set("tab", "kpi360");
    }
    mappedPath = "penilaian-kontrak";
  }

  if (cleanPath === currentRoute && cleanPath !== "pengajuan") {
    // re-render tetap diizinkan untuk pengajuan (deep link form)
  }

  const allowed = await canAccessRoute(cleanPath, session);
  if (!allowed) {
    toast("Anda tidak memiliki akses ke menu tersebut", "warning");
    location.hash = "#dashboard";
    return;
  }

  container.classList.remove("animate-fadein");
  void container.offsetWidth; // reflow trigger biar animasi re-trigger tiap navigasi
  container.classList.add("animate-fadein");

  // Render shadow layout instant agar transisi halaman smooth tanpa patah/kedip
  container.innerHTML = skeletonShadowLayout(mappedPath);

  try {
    if (typeof currentUnmount === "function") { currentUnmount(); currentUnmount = null; }
    
    const html = await loadViewHtml(mappedPath);
    container.innerHTML = html;
    
    try {
      const mod = await import(`./views/${mappedPath}.js`);
      if (mod && typeof mod.mount === "function") {
        const result = await mod.mount(container, { params, session });
        if (result && typeof result.unmount === "function") currentUnmount = result.unmount;
      }
    } catch (modErr) {
      console.error(`Could not mount script for view "${mappedPath}":`, modErr);
      if (!container.firstElementChild || container.children.length === 0 || container.innerHTML.trim() === '<div id="sk-panel"></div>') {
        container.innerHTML = `
          <div class="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
            <div class="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-lg">!</div>
            <p class="text-base font-bold text-slate-800 mb-1">Gagal Memuat Halaman ${escapeHtml(cleanPath)}</p>
            <p class="text-xs text-slate-500 mb-4">${escapeHtml(modErr.message || "Terjadi kendala teknis saat menyiapkan tampilan.")}</p>
            <button onclick="location.reload()" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow transition">Muat Ulang Halaman</button>
          </div>
        `;
      }
    }
    
    currentRoute = cleanPath;
    highlightActive(mappedPath);
    document.title = `${ROUTE_TITLES[mappedPath] || ROUTE_TITLES[cleanPath] || "Portal"} — Andela Jaya HRIS`;
    
    if (params && (params.memo_id || params.id)) {
      const mId = params.memo_id || params.id;
      showMemoDetailById(mId, session);
    }
    
  } catch (err) {
    console.error("Router error:", err);
    container.innerHTML = `
      <div class="text-center py-24">
        <p class="text-2xl font-bold text-slate-300">404</p>
        <p class="text-slate-500 mt-2">Halaman "${escapeHtml(cleanPath)}" tidak ditemukan.</p>
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

  const closeMobileSidebar = () => {
    sidebar?.classList.remove("mobile-open");
    backdrop?.classList.add("hidden");
  };

  const toggleMobileSidebar = () => {
    sidebar?.classList.toggle("mobile-open");
    backdrop?.classList.toggle("hidden");
  };

  document.getElementById("btn-sidebar-toggle")?.addEventListener("click", () => {
    if (window.innerWidth < 1024) {
      toggleMobileSidebar();
    } else {
      sidebar?.classList.toggle("collapsed");
      main?.classList.toggle("expanded");
    }
  });

  document.getElementById("btn-mobile-sidebar-toggle")?.addEventListener("click", () => {
    toggleMobileSidebar();
  });

  document.getElementById("btn-close-sidebar-mobile")?.addEventListener("click", () => {
    closeMobileSidebar();
  });

  if (backdrop) {
    backdrop.addEventListener("click", closeMobileSidebar);
  }

  document.getElementById("sidebar-nav")?.addEventListener("click", (e) => {
    if (window.innerWidth < 1024 && e.target.closest("[data-route]")) {
      closeMobileSidebar();
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

  document.querySelectorAll(".btn-test-notif-action, #btn-test-notif-desktop, #btn-test-notif-mobile, #btn-test-notif, #notif-slide-desktop, #notif-slide-mobile").forEach(btn => {
    btn.addEventListener("click", () => handleTestAndActivateNotification(session));
  });

  // Sync state notif slide switch UI saat init
  syncNotifSwitchUI();

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
    if (!session) return;
    const uName = (session.username || "").toLowerCase().trim();
    const uNama = (session.nama || "").toLowerCase().trim();
    const uNik = (session.nik || "").toLowerCase().trim();

    const allNotifs = await fsGetAll(COL.NOTIFICATIONS);
    const hasUnread = allNotifs.some(n => {
      if (n.dibaca) return false;
      const target = (n.username_target || "").toLowerCase().trim();
      const namaTarget = (n.nama_target || "").toLowerCase().trim();
      const nikTarget = (n.nik_target || "").toLowerCase().trim();
      const aliases = Array.isArray(n.target_aliases) ? n.target_aliases.map(x => String(x).toLowerCase().trim()) : [];

      return (
        (uName && target === uName) ||
        (uNama && target === uNama) ||
        (uNama && namaTarget === uNama) ||
        (uNik && nikTarget === uNik) ||
        (uName && aliases.includes(uName)) ||
        (uNama && aliases.includes(uNama)) ||
        (uNik && aliases.includes(uNik))
      );
    });

    const dotEl = document.getElementById("notif-dot");
    const dotMobileEl = document.getElementById("notif-dot-mobile");
    if (hasUnread) {
      if (dotEl) dotEl.classList.remove("hidden");
      if (dotMobileEl) dotMobileEl.classList.remove("hidden");
    } else {
      if (dotEl) dotEl.classList.add("hidden");
      if (dotMobileEl) dotMobileEl.classList.add("hidden");
    }
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
