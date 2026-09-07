/**
 * =====================================================================
 * AUTH.JS — Mesin RBAC ("RBAC Sakti") & Sesi Login
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Alur:
 * 1. login() -> endpoint server memverifikasi/migrasi akun ke Firebase Authentication
 * 2. Firebase ID token menjadi sumber identitas; browser hanya menyimpan profil tampilan minimum
 * 3. getMenuConfig() mendefinisikan SELURUH menu sistem + kelompok otoritas
 * 4. computeVisibleMenus() = (menu default sesuai role) DIGABUNG/DITINDIH
 * oleh override per-user dari koleksi `user_permissions` (diatur HRD)
 * 5. canAccessForm(formConfig) untuk kontrol akses Katalog Pengajuan ISO
 * =====================================================================
 */
import {
 db, COL, doc, getDoc, collection, getDocs, query, where, updateDoc, addDoc,
 auth, signInWithCustomToken, firebaseSignOut, setPersistence,
 browserLocalPersistence, browserSessionPersistence
} from "./firebase-config.js";
import { fsGetAll, escapeHtml, toast } from "./utils.js";
import { authFetch, waitForAuthReady, publicSecurityHeaders } from "./api-client.js";

const SESSION_KEY = "andela_hris_session";
const REMEMBER_KEY = "andela_hris_remember";

/* ---------------------------------------------------------------------
 * DEFINISI MENU GLOBAL — SATU SUMBER KEBENARAN UNTUK SIDEBAR & ROUTER
 * group: 'all' | 'hrd' | 'manajemen'
 * roles: daftar role tambahan yang berhak (di luar aturan group bawaan)
 * ------------------------------------------------------------------- */
export const DEFAULT_EMPLOYEE_MENU_IDS = [
 "dashboard",
 "pengajuan",
 "absensi",
 "pengajuan-cuti",
 "izin",
 "performance-review"
];

// Pengelompokan & Penyesuaian Icon Menu
export const MENU_CONFIG = [
 // KATEGORI: MENU UTAMA
 { id: "dashboard", label: "Dashboard", icon: "home", kategori: "Menu Utama", roles: ["ALL"] },
 { id: "pengajuan", label: "Pengajuan", icon: "doc-plus", kategori: "Menu Utama", roles: ["ALL"] },
 { id: "riwayat", label: "Riwayat", icon: "clock", kategori: "Menu Utama", roles: ["ALL"] },

 // KATEGORI: PERSETUJUAN
 { id: "approval", label: "Persetujuan", icon: "alert", kategori: "Persetujuan", roles: ["HRD", "FINANCE", "SUPERADMIN", "ATASAN"] },
 { id: "broadcast", label: "Memo & Berita", icon: "book", kategori: "Persetujuan", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: KEHADIRAN
 { id: "absensi", label: "Absensi", icon: "clock", kategori: "Kehadiran", roles: ["ALL"], subMenus: [
  { id: "proses_tarif", label: "Proses & Tarif Laporan" }
 ] },
 { id: "pengajuan-cuti", label: "Pengajuan Cuti", icon: "calendar", kategori: "Kehadiran", roles: ["ALL"] },
 { id: "cuti", label: "Kelola Cuti", icon: "calendar", kategori: "Kehadiran", roles: ["HRD", "SUPERADMIN"] },
 { id: "izin", label: "Izin", icon: "doc-plus", kategori: "Kehadiran", roles: ["ALL"], subMenus: [
  { id: "lihat_semua", label: "Lihat Semua Izin" }
 ] },
 { id: "kalender-hr", label: "Kalender", icon: "calendar", kategori: "Kehadiran", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: KARYAWAN & KINERJA
 { id: "siklus-karyawan", label: "Karyawan", icon: "refresh", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },
 { id: "rekrutmen", label: "Rekrutmen", icon: "user-plus", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN", "GM", "MANAGER"], subMenus: [
  { id: "dashboard", label: "Dashboard ATS" },
  { id: "lowongan", label: "Lowongan" },
  { id: "kandidat", label: "Kandidat" },
  { id: "screening", label: "Screening ATS" },
  { id: "pipeline", label: "Pipeline" },
  { id: "interview", label: "Interview" },
  { id: "analytics", label: "Analytics" },
  { id: "rules", label: "Master Rules ATS" }
 ] },
 { id: "penilaian-kontrak", label: "Penilaian Kontrak", icon: "doc-plus", kategori: "Karyawan & Kinerja", roles: ["ALL"], subMenus: [
  { id: "standar_grade", label: "Standar Grade HRD" },
  { id: "template_soal", label: "Template Soal KPI" },
  { id: "distribusi_kpi360", label: "Distribusi Tugas KPI" }
 ] },
 { id: "performance-review", label: "Review Kinerja", icon: "gauge", kategori: "Karyawan & Kinerja", roles: ["ALL"], subMenus: [
  { id: "semua_review", label: "Semua Review Kinerja" }
 ] },
 { id: "training", label: "Pelatihan", icon: "book", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN", "MANAGER", "SPV"], subMenus: [
  { id: "tna_dashboard", label: "Program Pelatihan" }
 ] },
 { id: "konseling-coaching", label: "Konseling & Coaching", icon: "user-plus", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN", "MANAGER", "SPV"], subMenus: [
    { id: "dashboard", label: "Dashboard Kasus" },
    { id: "case_management", label: "Manajemen Kasus" },
    { id: "action_plan", label: "Action Plan" },
    { id: "follow_up", label: "Jadwal Follow-up" },
    { id: "reports", label: "Laporan & Rekap" }
  ] },
  { id: "pemanggilan", label: "Disiplin & SP", icon: "alert", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },
 { id: "dokumen", label: "Dokumen", icon: "doc-plus", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: KEUANGAN
 { id: "reimbursement", label: "Reimbursement", icon: "wallet", kategori: "Keuangan", roles: ["ALL"], subMenus: [
  { id: "daftar_semua", label: "Daftar Pengajuan" },
  { id: "pengaturan_jenis", label: "Pengaturan Jenis & Plafon" }
 ] },
 { id: "pengajuan-kasbon", label: "Kasbon", icon: "wallet", kategori: "Keuangan", roles: ["ALL"], subMenus: [
  { id: "pengaturan_kategori", label: "Pengaturan Kategori" }
 ] },
 { id: "klaim-bensin", label: "Klaim Bensin", icon: "wallet", kategori: "Keuangan", roles: ["ALL"], subMenus: [
  { id: "admin_cabang", label: "Admin Cabang" }
 ] },
 { id: "lembur-kasbon", label: "Lembur", icon: "clock", kategori: "Keuangan", roles: ["HRD", "SUPERADMIN", "GM", "FINANCE", "SPV", "MANAGER", "WAREHOUSE", "BACK OFFICE", "BACKOFFICE", "STAFF", "KARYAWAN", "DRIVER"], subMenus: [
  { id: "dashboard", label: "Dashboard" },
  { id: "perintah", label: "Perintah Lembur" },
  { id: "usulan_saya", label: "Usulan Saya" },
  { id: "persetujuan_saya", label: "Persetujuan Saya" },
  { id: "realisasi", label: "Realisasi & Verifikasi" },
  { id: "rekap_jam", label: "Rekap Jam Lembur" },
  { id: "laporan", label: "Laporan" },
  { id: "pengaturan", label: "Pengaturan" }
 ] },
 { id: "uang-makan", label: "Uang Makan", icon: "utensils", kategori: "Keuangan", roles: ["HRD", "FINANCE", "SUPERADMIN"] },

 // KATEGORI: OPERASIONAL
 { id: "inventory", label: "Inventaris", icon: "box", kategori: "Operasional", roles: ["HRD", "GA", "SUPERADMIN"] },
 { id: "kendaraan", label: "Kendaraan", icon: "truck", kategori: "Operasional", roles: ["HRD", "GA", "SUPERADMIN"] },
 { id: "gimmick-sop", label: "SOP & Gimmick", icon: "book", kategori: "Operasional", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: SALES
 { id: "sales-order", label: "Sales Order", icon: "wallet", kategori: "Sales", roles: ["ALL"] },
 { id: "sales-outlet", label: "Outlet", icon: "user-plus", kategori: "Sales", roles: ["ALL"], subMenus: [
  { id: "lihat_semua", label: "Lihat Semua Outlet" },
  { id: "import_excel", label: "Import Excel" }
 ] },
 { id: "sales-item", label: "Item", icon: "box", kategori: "Sales", roles: ["ALL"] },
 { id: "sales-task", label: "Kunjungan", icon: "clock", kategori: "Sales", roles: ["ALL"] },
 { id: "sales-track", label: "Tracking", icon: "layers", kategori: "Sales", roles: ["ALL"] },

 // KATEGORI: PENGATURAN
 { id: "manajemen-data", label: "Data Master", icon: "database", kategori: "Pengaturan", roles: ["HRD", "SUPERADMIN"] },
 { id: "pengaturan", label: "Hak Akses", icon: "user-plus", kategori: "Pengaturan", roles: ["HRD", "SUPERADMIN"] },
 { id: "konfigurasi", label: "Konfigurasi", icon: "layers", kategori: "Pengaturan", roles: ["HRD", "SUPERADMIN"] },
 { id: "form-builder", label: "Form Builder", icon: "doc-plus", kategori: "Pengaturan", roles: ["HRD", "SUPERADMIN"] }
];

const MANAJEMEN_ROLES = ["SPV", "HRD", "GM", "FINANCE", "MANAGER", "BRANCH MANAGER"];

/* ---------------------------------------------------------------------
 * SESSION HELPERS
 * ------------------------------------------------------------------- */
export function getSession() {
 try {
 const raw = sessionStorage.getItem(SESSION_KEY) || (localStorage.getItem(REMEMBER_KEY) === "true" ? localStorage.getItem(SESSION_KEY) : null);
 return raw ? JSON.parse(raw) : null;
 } catch { return null; }
}
export function setSession(data, remember = null) {
 try {
 const str = JSON.stringify(data);
 if (str) {
 sessionStorage.setItem(SESSION_KEY, str);
 const shouldRemember = remember === null ? localStorage.getItem(REMEMBER_KEY) === "true" : Boolean(remember);
 if (shouldRemember) {
  localStorage.setItem(SESSION_KEY, str);
  localStorage.setItem(REMEMBER_KEY, "true");
 } else {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
 }
 }
 } catch (e) {
 console.error("Gagal menyimpan session:", e);
 }
}
export function clearSession() {
 sessionStorage.removeItem(SESSION_KEY);
 localStorage.removeItem(SESSION_KEY);
 localStorage.removeItem(REMEMBER_KEY);
}
export function isLoggedIn() { return Boolean(auth.currentUser && getSession()); }

/* ---------------------------------------------------------------------
 * LOGIN & AUTHENTICATION RESOLUTION
 * ------------------------------------------------------------------- */
/**
 * Mencari dokumen pengguna di koleksi USERS secara cerdas:
 * 1. Cek langsung Document ID (Huruf besar, asli, huruf kecil).
 * 2. Cek field username (case-insensitive).
 * 3. Cek field nik (angka/kode NIK).
 * 4. Cek field email (case-insensitive).
 * 5. Cek field nama (case-insensitive).
 */
export async function findUserForAuth(loginInput) {
 if (!loginInput) return null;
 const rawInput = String(loginInput).trim();
 if (!rawInput) return null;

 const inputUpper = rawInput.toUpperCase();
 const inputLower = rawInput.toLowerCase();

 // 1. Direct doc ID lookups
 const tryIds = Array.from(new Set([inputUpper, rawInput, inputLower]));
 for (const tid of tryIds) {
  try {
   const snap = await getDoc(doc(db, COL.USERS, tid));
   if (snap.exists()) {
    const u = snap.data();
    return { docId: snap.id, docRef: snap.ref, data: u };
   }
  } catch (e) {}
 }

 // 2. Query / Scan koleksi USERS
 try {
  const allUsers = await fsGetAll(COL.USERS);
  
  // a. Match by username
  let matched = allUsers.find(u => {
   const un = String(u.username || u.id || "").trim().toLowerCase();
   return un === inputLower;
  });

  // b. Match by NIK
  if (!matched) {
   matched = allUsers.find(u => {
    const unk = String(u.nik || "").trim();
    return unk && (unk === rawInput || unk.toUpperCase() === inputUpper);
   });
  }

  // c. Match by email
  if (!matched && rawInput.includes("@")) {
   matched = allUsers.find(u => {
    const uem = String(u.email || "").trim().toLowerCase();
    return uem === inputLower;
   });
  }

  // d. Match by Nama
  if (!matched) {
   matched = allUsers.find(u => {
    const unm = String(u.nama || "").trim().toLowerCase();
    return unm && unm === inputLower;
   });
  }

  if (matched) {
   const docId = matched.id || matched.username || inputUpper;
   return { docId, docRef: doc(db, COL.USERS, docId), data: matched };
  }
 } catch (e) {
  console.warn("findUserForAuth scan failed:", e);
 }

 return null;
}

let _editAuthGraceUntil = 0; // Timestamp batas grace period otentikasi pengeditan

export function isEditAuthValid() {
  return Date.now() < _editAuthGraceUntil;
}

export function resetEditAuthGrace() {
  _editAuthGraceUntil = 0;
}

/** Memvalidasi ulang password melalui Firebase Authentication di server. */
export async function verifyUserPassword(usernameOrNik, password) {
  if (!password) throw new Error("Kata sandi wajib diisi.");
  const session = getSession();
  const targetId = usernameOrNik || session?.username || session?.nik || session?.nama;
  if (!targetId) throw new Error("Identitas pengguna tidak ditemukan.");
  const response = await fetch('/api/auth-login', {
    method: 'POST',
    headers: await publicSecurityHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ identifier: targetId, password, verifyOnly: true })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Kata sandi salah. Akses ditolak.");
  return payload.profile;
}

/**
 * Modal Autentikasi Keamanan Universal untuk Pengeditan Data (Universal Edit Authentication).
 * Mencegah Staff atau HRD mengubah kuota jatah cuti atau data sensitif perusahaan tanpa verifikasi.
 */
export async function requestEditAuth(options = {}) {
  const {
    actionTitle = "Verifikasi Otentikasi Pengeditan Data",
    actionDescription = "Konfirmasi kata sandi akun Anda diperlukan sebelum perubahan data resmi dapat disimpan.",
    targetName = "",
    requireRoles = null,
    forceFresh = false
  } = options;

  const session = getSession();
  if (!session) {
    toast("Sesi login Anda tidak ditemukan. Silakan login kembali.", "error");
    return false;
  }

  // Grace period aktif dan tidak dipaksa verifikasi fresh
  if (!forceFresh && Date.now() < _editAuthGraceUntil) {
    return true;
  }

  // Hapus modal lama jika ada
  const prevModal = document.getElementById("app-edit-auth-backdrop");
  if (prevModal) prevModal.remove();

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.id = "app-edit-auth-backdrop";
    backdrop.className = "fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 opacity-0 transition-opacity duration-200";

    const defaultRole = (session.role || "STAFF").toUpperCase();
    const canUseCurrent = !requireRoles || requireRoles.map(r => r.toUpperCase()).includes(defaultRole);

    backdrop.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 flex flex-col scale-95 transition-transform duration-200 overflow-hidden" id="app-edit-auth-panel">
        
        <!-- Header -->
        <div class="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-maroon-100 text-maroon-800 flex items-center justify-center text-lg font-black shadow-xs shrink-0">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded-full border border-maroon-200">
                <i class="fa-solid fa-lock text-[9px]"></i> Keamanan Data Master
              </span>
              <h3 class="text-base font-bold text-slate-800 mt-1 leading-snug">${escapeHtml(actionTitle)}</h3>
            </div>
          </div>
          <button id="auth-btn-close" type="button" class="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg w-8 h-8 flex items-center justify-center transition cursor-pointer">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-4">
          <!-- Description & Target -->
          <div class="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
            <p class="font-medium text-slate-700 mb-1">${escapeHtml(actionDescription)}</p>
            ${targetName ? `
              <div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/80 text-xs">
                <span class="text-slate-500 font-semibold shrink-0">Target Data:</span>
                <span class="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 truncate">${escapeHtml(targetName)}</span>
              </div>
            ` : ""}
          </div>

          <!-- Active Account Card -->
          <div class="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs space-y-1">
            <div class="flex items-center justify-between text-slate-500 font-medium">
              <span>Akun Otoritas (Operator):</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${canUseCurrent ? 'bg-amber-200 text-amber-900' : 'bg-rose-100 text-rose-800'}">
                ${escapeHtml(defaultRole)}
              </span>
            </div>
            <p class="text-sm font-bold text-slate-800">${escapeHtml(session.nama || session.username)} <span class="font-normal text-xs text-slate-500">(${escapeHtml(session.nik || session.username)})</span></p>
            ${!canUseCurrent ? `
              <p class="text-[11px] text-rose-700 font-semibold mt-1">
                <i class="fa-solid fa-triangle-exclamation"></i> Role Anda (${escapeHtml(defaultRole)}) memerlukan otorisasi Supervisor / Atasan HRD. Silakan masukkan kredensial Atasan di bawah ini.
              </p>
            ` : ""}
          </div>

          <!-- Alternate / Supervisor User Input (if needed or toggled) -->
          <div id="auth-alt-user-box" class="${canUseCurrent ? 'hidden' : ''} space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700">Username / NIK Otorisator (Atasan / HRD): <span class="text-rose-500">*</span></label>
            <input type="text" id="auth-alt-user" placeholder="Contoh: HRD001 atau NIK Atasan" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-600 focus:ring-1 focus:ring-maroon-200 bg-white font-medium" />
          </div>

          <!-- Password Input -->
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Kata Sandi (Password): <span class="text-rose-500">*</span></span>
              ${canUseCurrent ? `
                <button type="button" id="auth-toggle-alt-btn" class="text-[11px] text-maroon-700 hover:underline font-semibold cursor-pointer">
                  Gunakan Akun Atasan Lain
                </button>
              ` : ""}
            </label>
            <div class="relative">
              <input type="password" id="auth-input-pwd" placeholder="Ketik kata sandi untuk verifikasi..." class="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-600 focus:ring-2 focus:ring-maroon-100 bg-white font-medium" autocomplete="current-password" autofocus />
              <button type="button" id="auth-toggle-pwd-btn" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-sm cursor-pointer">
                <i class="fa-solid fa-eye" id="auth-pwd-icon"></i>
              </button>
            </div>
          </div>

          <!-- Remember Auth Checkbox -->
          <div class="flex items-center gap-2 pt-1">
            <input type="checkbox" id="auth-chk-remember" class="w-4 h-4 text-maroon-700 rounded border-slate-300 focus:ring-maroon-500 cursor-pointer" />
            <label for="auth-chk-remember" class="text-xs text-slate-600 cursor-pointer select-none">
              Ingat otentikasi pengeditan selama 5 menit untuk sesi ini
            </label>
          </div>

          <!-- Error Alert Box -->
          <div id="auth-error-box" class="hidden p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2.5">
            <i class="fa-solid fa-circle-exclamation text-rose-600 text-sm shrink-0"></i>
            <span id="auth-error-text">Kata sandi tidak valid.</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
          <button type="button" id="auth-btn-cancel" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer">
            Batal
          </button>
          <button type="button" id="auth-btn-submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 active:scale-95 rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-check"></i> Verifikasi & Lanjutkan
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => {
      backdrop.classList.remove("opacity-0");
      const pnl = backdrop.querySelector("#app-edit-auth-panel");
      if (pnl) pnl.classList.remove("scale-95");
    });

    const closeAndResolve = (result) => {
      backdrop.classList.add("opacity-0");
      setTimeout(() => {
        backdrop.remove();
      }, 200);
      resolve(result);
    };

    const inPwd = backdrop.querySelector("#auth-input-pwd");
    const inAltUser = backdrop.querySelector("#auth-alt-user");
    const boxAltUser = backdrop.querySelector("#auth-alt-user-box");
    const btnToggleAlt = backdrop.querySelector("#auth-toggle-alt-btn");
    const btnTogglePwd = backdrop.querySelector("#auth-toggle-pwd-btn");
    const iconPwd = backdrop.querySelector("#auth-pwd-icon");
    const btnSubmit = backdrop.querySelector("#auth-btn-submit");
    const btnCancel = backdrop.querySelector("#auth-btn-cancel");
    const btnClose = backdrop.querySelector("#auth-btn-close");
    const errBox = backdrop.querySelector("#auth-error-box");
    const errText = backdrop.querySelector("#auth-error-text");
    const chkRemember = backdrop.querySelector("#auth-chk-remember");

    if (btnToggleAlt && boxAltUser) {
      btnToggleAlt.onclick = () => {
        const isHidden = boxAltUser.classList.contains("hidden");
        boxAltUser.classList.toggle("hidden", !isHidden);
        btnToggleAlt.textContent = isHidden ? "Kembali ke Akun Saya" : "Gunakan Akun Atasan Lain";
        if (isHidden && inAltUser) inAltUser.focus();
      };
    }

    if (btnTogglePwd && inPwd && iconPwd) {
      btnTogglePwd.onclick = () => {
        const isPwd = inPwd.type === "password";
        inPwd.type = isPwd ? "text" : "password";
        iconPwd.className = isPwd ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
      };
    }

    const showError = (msg) => {
      if (errText) errText.textContent = msg;
      if (errBox) errBox.classList.remove("hidden");
      if (inPwd) {
        inPwd.classList.add("border-rose-400", "focus:ring-rose-200");
        inPwd.select();
      }
    };

    const hideError = () => {
      if (errBox) errBox.classList.add("hidden");
      if (inPwd) inPwd.classList.remove("border-rose-400", "focus:ring-rose-200");
    };

    const doVerify = async () => {
      hideError();
      const pwd = (inPwd?.value || "").trim();
      if (!pwd) {
        showError("Kata sandi wajib diisi untuk verifikasi keamanan.");
        inPwd?.focus();
        return;
      }

      let authUsername = session.username || session.nik;
      if (boxAltUser && !boxAltUser.classList.contains("hidden")) {
        const altU = (inAltUser?.value || "").trim();
        if (!altU) {
          showError("Username atau NIK Atasan wajib diisi.");
          inAltUser?.focus();
          return;
        }
        authUsername = altU;
      }

      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memverifikasi...`;

      try {
        const verifiedUser = await verifyUserPassword(authUsername, pwd);

        // Jika memerlukan role tertentu, periksa role pengguna yang terverifikasi
        if (requireRoles && requireRoles.length > 0) {
          const vRole = (verifiedUser.role || "STAFF").toUpperCase();
          const roleAllowed = requireRoles.map(r => r.toUpperCase()).includes(vRole);
          if (!roleAllowed) {
            throw new Error(`Akun (${verifiedUser.nama || authUsername}) memiliki role ${vRole}. Pengeditan ini hanya diizinkan untuk: ${requireRoles.join(", ")}.`);
          }
        }

        // Jika opsi remember dicentang, aktifkan grace period 5 menit
        if (chkRemember && chkRemember.checked) {
          _editAuthGraceUntil = Date.now() + (5 * 60 * 1000);
        }

        // Catat ke log aktivitas secara asinkron
        try {
          addDoc(collection(db, "audit_edit_logs"), {
            operator_user: session.username || session.nik || "ANON",
            operator_nama: session.nama || "Unknown",
            authorized_by: verifiedUser.nama || verifiedUser.username || authUsername,
            authorized_role: verifiedUser.role || "STAFF",
            action: actionTitle,
            description: actionDescription,
            target: targetName || "-",
            timestamp: new Date().toISOString()
          }).catch(() => {});
        } catch (eLog) {}

        toast("Otentikasi berhasil diverifikasi.", "success");
        closeAndResolve(true);
      } catch (err) {
        console.warn("Verifikasi otentikasi gagal:", err);
        showError(err.message || "Kata sandi yang Anda masukkan salah. Coba periksa kembali.");
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-check"></i> Verifikasi & Lanjutkan`;
      }
    };

    if (btnSubmit) btnSubmit.onclick = doVerify;
    if (inPwd) {
      inPwd.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doVerify();
        }
      };
      setTimeout(() => inPwd.focus(), 150);
    }
    if (btnCancel) btnCancel.onclick = () => closeAndResolve(false);
    if (btnClose) btnClose.onclick = () => closeAndResolve(false);
    backdrop.onclick = (e) => {
      if (e.target === backdrop) closeAndResolve(false);
    };
  });
}

if (typeof window !== "undefined") {
  window.requestEditAuth = requestEditAuth;
  window.verifyUserPassword = verifyUserPassword;
  window.isEditAuthValid = isEditAuthValid;
  window.resetEditAuthGrace = resetEditAuthGrace;
}

export async function login(username, password, remember = false) {
 if (!username || !password) throw new Error("Username/NIK dan password wajib diisi.");
 await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
 const response = await fetch('/api/auth-login', {
  method: 'POST',
  headers: await publicSecurityHeaders({ 'Content-Type': 'application/json' }),
  body: JSON.stringify({ identifier: String(username).trim(), password })
 });
 const payload = await response.json().catch(() => ({}));
 if (!response.ok || !payload.success || !payload.customToken) {
  throw new Error(payload.error || "Username/NIK atau password salah.");
 }
 await signInWithCustomToken(auth, payload.customToken);
 const user = payload.profile || {};
 const session = {
  uid: user.uid,
  id: user.id || user.uid,
  username: user.username || String(username).trim().toUpperCase(),
  role: (user.role || "STAFF").toUpperCase(),
  nama: user.nama || user.username || String(username).trim(),
  email: user.email || "",
  posisi: user.posisi || "-",
  nik: user.nik || null,
  cabang: user.cabang || "-",
  divisi: user.divisi || "-",
  must_change_password: user.must_change_password === true,
  foto_url: user.foto_url || null,
  loginAt: Date.now()
 };
 setSession(session, remember);
 return session;
}

export async function loginWithToken(tokenStr) {
 void tokenStr;
 throw new Error("Login otomatis dari tautan sudah dinonaktifkan. Silakan login dengan NIK/username untuk melanjutkan.");
}
export async function logout() {
 try { await firebaseSignOut(auth); } catch (error) { console.warn('Firebase logout:', error.message); }
 clearSession();
 location.hash = "#login";
 location.reload();
}

/* ---------------------------------------------------------------------
 * RBAC — MENU VISIBILITY & PERMISSION OVERRIDES
 * ------------------------------------------------------------------- */
let _permCache = null; // Map of key -> permission record

export async function loadPermissionOverrides(force = false) {
 if (_permCache && !force) return _permCache;
 const rows = await fsGetAll(COL.USER_PERMISSIONS);
 _permCache = {};
 rows.forEach(r => {
  if (!r) return;
  const targetKeys = new Set();
  if (r.id) {
   const strId = String(r.id).trim();
   targetKeys.add(strId);
   targetKeys.add(strId.toLowerCase());
   targetKeys.add(strId.toUpperCase());
  }
  if (r.username) {
   const strUn = String(r.username).trim();
   targetKeys.add(strUn);
   targetKeys.add(strUn.toLowerCase());
   targetKeys.add(strUn.toUpperCase());
   if (strUn.includes(".")) {
    targetKeys.add(strUn.replace(/\./g, " ").toLowerCase());
    targetKeys.add(strUn.replace(/\./g, " ").toUpperCase());
   }
  }
  if (r.nik && r.nik !== "-" && r.nik !== "null" && r.nik !== "undefined") {
   const strNik = String(r.nik).trim();
   targetKeys.add(strNik);
   targetKeys.add(strNik.toLowerCase());
   targetKeys.add(strNik.toUpperCase());
  }
  if (r.user_id) {
   const strUid = String(r.user_id).trim();
   targetKeys.add(strUid);
   targetKeys.add(strUid.toLowerCase());
   targetKeys.add(strUid.toUpperCase());
  }
  if (r.nama) {
   const strNama = String(r.nama).trim();
   targetKeys.add(strNama);
   targetKeys.add(strNama.toLowerCase());
   targetKeys.add(strNama.toUpperCase());
   targetKeys.add(strNama.toLowerCase().replace(/\s+/g, "."));
  }
  if (r.email) {
   const strEmail = String(r.email).trim().toLowerCase();
   targetKeys.add(strEmail);
  }

  targetKeys.forEach(k => {
   if (k) _permCache[k] = r;
  });
 });
 return _permCache;
}

/** Apakah user adalah "atasan" (punya bawahan) berdasarkan field ATASAN di master_karyawan */
export async function isAtasan(namaUser) {
 try {
  const q = query(collection(db, COL.MASTER_KARYAWAN), where("atasan", "==", namaUser));
  const snap = await getDocs(q);
  return !snap.empty;
 } catch { return false; }
}

/**
 * Roles yang punya akses PENUH (lihat semua + tambah/edit/hapus) di modul
 * Manajemen Cuti & Manajemen Kontrak.
 */
export const FULL_ACCESS_ROLES = ["HRD", "SUPERADMIN", "DIREKTUR"];
/**
 * Roles "Atasan" yang HANYA boleh melihat (read-only), dan HANYA untuk
 * karyawan yang menjadi bawahan langsung mereka (field `atasan` di
 * master_karyawan harus sama dengan nama atasan yang login).
 */
export const ATASAN_VIEW_ROLES = ["MANAGER", "SPV", "KOORDINATOR"];

/** Ambil daftar nama karyawan yang menjadi bawahan langsung dari `namaAtasan` */
export async function getBawahanNames(namaAtasan) {
 try {
  const q = query(collection(db, COL.MASTER_KARYAWAN), where("atasan", "==", namaAtasan));
  const snap = await getDocs(q);
  return snap.docs.map(d => (d.data().nama_karyawan || "").trim()).filter(Boolean);
 } catch { return []; }
}

export async function computeVisibleMenus(session) {
 if (!session) return [];
 const role = (session.role || "").toUpperCase();
 const posisi = (session.posisi || session.jabatan || "").toUpperCase();
 const isSales = role === "SALES" || posisi.includes("SALES");
 const userOverride = await _findUserOverride(session);

 // Jika HRD/Super Admin sudah menetapkan daftar menu spesifik untuk user ini -> pakai itu (whitelist absolut)
 if (userOverride && (userOverride.allowed_menus_set || (Array.isArray(userOverride.allowed_menus) && userOverride.allowed_menus.length > 0))) {
  const allowed = userOverride.allowed_menus || [];
  let list = MENU_CONFIG.filter(m => allowed.includes(m.id));
  // Sales tidak dapat menu lembur kecuali secara eksplisit ada di allowed_menus custom
  if (isSales && !allowed.includes("lembur-kasbon")) {
   list = list.filter(m => m.id !== "lembur-kasbon");
  }
  if (!list.some(m => m.id === "dashboard")) {
   const dash = MENU_CONFIG.find(m => m.id === "dashboard");
   if (dash) list.unshift(dash);
  }
  return list;
 }

 const isAtasanRole = await isAtasan(session.nama);
 const isManagementOrHrd = ["HRD", "SUPERADMIN", "DIREKTUR", "MANAGER", "SPV", "KOORDINATOR", "GM", "FINANCE", "GA", "BRANCH MANAGER"].includes(role) || isAtasanRole;

 // Sesuai instruksi: Menu Default Standar Karyawan hanya berisi:
 // 1. Dashboard, 2. Pengajuan, 3. Absensi, 4. Pengajuan Cuti, 5. Izin, 6. Review Kinerja
 if (!isManagementOrHrd || role === "KARYAWAN" || role === "STAFF" || role === "DEFAULT") {
  return MENU_CONFIG.filter(m => DEFAULT_EMPLOYEE_MENU_IDS.includes(m.id));
 }

 return MENU_CONFIG.filter(m => {
  // Sales secara spesifik tidak memiliki hak lembur
  if (isSales && m.id === "lembur-kasbon") return false;
  if (m.group === "all") return true;
  if (!m.roles || m.roles.length === 0) return true;
  if (m.roles.includes("ALL")) return true;
  if (m.roles.includes(role)) return true;
  // Siapapun yang tercatat sebagai atasan (punya bawahan) otomatis kebagian akses
  // ke menu yang secara eksplisit mengizinkan role generik "ATASAN"
  if (isAtasanRole && m.roles.includes("ATASAN")) return true;
  return false;
 });
}

const _MANAGEMENT_ROLES = ["HRD", "SUPERADMIN", "DIREKTUR", "MANAGER", "SPV", "KOORDINATOR", "GM", "FINANCE", "GA", "BRANCH MANAGER"];

function _permOverrideSearchKeys(session) {
 if (!session) return [];
 const raw = [
  session.username,
  session.id,
  session.nik,
  session.nama,
  session.email,
  session.username && String(session.username).includes(".") ? String(session.username).replace(/\./g, " ") : null,
  session.nama ? String(session.nama).toLowerCase().replace(/\s+/g, ".") : null
 ].filter(Boolean);

 const keysSet = new Set();
 raw.forEach(k => {
  const s = String(k).trim();
  if (!s || s === "null" || s === "undefined" || s === "UNLINKED") return;
  keysSet.add(s);
  keysSet.add(s.toLowerCase());
  keysSet.add(s.toUpperCase());
 });
 return Array.from(keysSet);
}

export async function findUserOverride(session) {
 const overrides = await loadPermissionOverrides(true);
 const keys = _permOverrideSearchKeys(session);
 for (const k of keys) {
  if (overrides[k]) return overrides[k];
 }
 return null;
}
export const _findUserOverride = findUserOverride;

/**
 * Sinkronisasi data sesi aktif dari USERS & MASTER_KARYAWAN secara real-time
 * Menjamin perubahan Role, NIK, Jabatan, dan Cabang oleh Super Admin langsung terefleksi
 */
export async function syncSessionWithDb(session) {
 if (!session) return null;
 try {
  await waitForAuthReady();
  if (!auth.currentUser) {
   clearSession();
   return null;
  }
  const response = await authFetch('/api/auth-session');
  const payload = await response.json();
  if (!response.ok || !payload.success || !payload.profile) throw new Error(payload.error || 'Profil sesi tidak valid.');
  const p = payload.profile;
  const current = {
   ...session,
   uid: p.uid || auth.currentUser.uid,
   id: p.id || session.id,
   username: p.username || session.username,
   role: String(p.role || 'STAFF').toUpperCase(),
   nama: p.nama || session.nama,
   email: p.email || '',
   posisi: p.posisi || '-',
   nik: p.nik || null,
   cabang: p.cabang || '-',
   divisi: p.divisi || '-',
   must_change_password: p.must_change_password === true,
   foto_url: p.foto_url || null
  };
  setSession(current);
  return current;
 } catch (err) {
  console.warn("syncSessionWithDb error:", err);
  clearSession();
  return null;
 }
}

/**
 * Ringkasan Status Hak Akses Pengguna untuk Ditampilkan di Profil
 */
export async function getUserPermissionSummary(session) {
  if (!session) return null;
  const override = await findUserOverride(session);
  const visibleMenus = await computeVisibleMenus(session);
  const role = (session.role || "STAFF").toUpperCase();
  const isSuperadmin = role === "SUPERADMIN";
  const preset = ROLE_PERMISSIONS_PRESETS[role] || ROLE_PERMISSIONS_PRESETS.DEFAULT_KARYAWAN;

  const isCustom = !!(override && (override.allowed_menus_set || (Array.isArray(override.allowed_actions) && override.allowed_actions.length > 0)));
  const allowedActions = isSuperadmin
    ? ["*"]
    : (isCustom && Array.isArray(override.allowed_actions) ? override.allowed_actions : (preset || []));
  const readOnly = isSuperadmin ? false : (override?.read_only === true);

  return {
    isSuperadmin: isSuperadmin,
    hasOverride: isCustom,
    role: role,
    visibleMenus: visibleMenus,
    visibleMenuIds: visibleMenus.map(m => m.id),
    allowedMenuNames: visibleMenus.map(m => m.label || m.name || m.id),
    allowedActions: allowedActions,
    allowedForms: Array.isArray(override?.allowed_forms) ? override.allowed_forms : [],
    allowedSubmenus: override?.allowed_submenus || {},
    readOnly: readOnly,
    updatedAt: override?.updated_at || null
  };
}

/**
 * Cek apakah `session` boleh melihat sub-menu tertentu di dalam sebuah
 * modul (lihat MENU_CONFIG[x].subMenus). Kalau HRD sudah menyetel daftar
 * sub-menu spesifik untuk user ini (allowed_submenus[menuId]), itu jadi
 * whitelist mutlak. Kalau belum diset sama sekali, default-nya: role
 * management/HRD dapat semua sub-menu, role karyawan biasa TIDAK dapat
 * sub-menu admin manapun (cuma lihat tampilan dasar modulnya).
 */
export async function hasSubMenuAccess(menuId, subMenuId, session) {
 if (!session) return false;
 const role = (session.role || "").toUpperCase();
 const posisi = (session.posisi || session.jabatan || "").toUpperCase();
 const isSales = role === "SALES" || posisi.includes("SALES");
 if (isSales && menuId === "lembur-kasbon") return false;

 const isManagementOrHrd = _MANAGEMENT_ROLES.includes(role) || await isAtasan(session.nama);

 const userOverride = await _findUserOverride(session);
 if (userOverride && userOverride.allowed_submenus && Array.isArray(userOverride.allowed_submenus[menuId])) {
 return userOverride.allowed_submenus[menuId].includes(subMenuId);
 }
 return isManagementOrHrd;
}

/**
 * Cek apakah `session` boleh mengedit/menghapus data di modul (bukan
 * cuma lihat). Kalau HRD sudah menyetel eksplisit read_only untuk user
 * ini, itu yang dipakai. Kalau belum diset, default-nya: role
 * management/HRD boleh edit, karyawan biasa hanya boleh lihat & buat
 * pengajuan sendiri (tidak boleh edit/hapus data siapa pun termasuk
 * miliknya sendiri yang sudah diproses).
 */
export async function canEditModuleData(session) {
 if (!session) return false;
 const role = (session.role || "").toUpperCase();
 const userOverride = await _findUserOverride(session);
 if (userOverride && typeof userOverride.read_only === "boolean") {
 return !userOverride.read_only;
 }
 return _MANAGEMENT_ROLES.includes(role);
}

/**
 * Cek apakah `session` boleh menghapus data di sistem.
 * SPV, Koordinator Sales, Salesman, dan Karyawan biasa TIDAK memiliki izin menghapus data apapun di sistem.
 * Hanya SUPERADMIN, HRD, DIREKTUR, dan GM yang berhak menghapus data.
 */
export function canDeleteModuleData(session) {
 if (!session) return false;
 const role = (session.role || "").toUpperCase();
 const posisi = (session.posisi || session.jabatan || "").toUpperCase();
 if (
  role === "SPV" || role === "KOORDINATOR" || role === "SALES" || role === "STAFF" || role === "KARYAWAN" ||
  posisi.includes("SPV") || posisi.includes("SUPERVISOR") || posisi.includes("KOORDINATOR") || posisi.includes("KORLAP") || posisi.includes("SALES")
 ) {
  return false;
 }
 return ["SUPERADMIN", "HRD", "DIREKTUR", "DIRECTOR", "GM"].includes(role);
}

export async function canAccessRoute(routeId, session) {
 let targetId = routeId;
 if (["kedisiplinan", "kedisiplinan-sp", "sp", "disiplin"].includes(targetId)) {
 targetId = "pemanggilan";
 }
 if (["penilaian", "kontrak", "master-kontrak", "kontrak-karyawan", "evaluasi-kontrak", "kpi", "kpi360", "evaluasi"].includes(targetId)) {
 targetId = "penilaian-kontrak";
 }
 if (["sppkl", "spl", "lembur", "overtime", "perintah-lembur"].includes(targetId)) {
 targetId = "lembur-kasbon";
 }

 // Cek aturan khusus Lembur: Divisi Sales tidak memiliki hak lembur, Karyawan Non-Sales diizinkan akses SPPKL mereka
 if (targetId === "lembur-kasbon" && session) {
  const role = (session.role || "").toUpperCase();
  const posisi = (session.posisi || session.jabatan || "").toUpperCase();
  const isSales = role === "SALES" || posisi.includes("SALES");
  if (isSales) {
   const userOverride = await _findUserOverride(session);
   const hasExplicitLembur = userOverride?.allowed_menus?.includes("lembur-kasbon");
   if (!hasExplicitLembur) return false;
  } else {
   return true;
  }
 }

 // Route publik & route bawaan default karyawan
 if (["karir", "lowongan", "portal-karir", "loker", "absensi", "absensi-saya", "pengajuan", "pengajuan-cuti", "izin", "performance-review"].includes(targetId)) return true;

 const menus = await computeVisibleMenus(session);
 // route yang tidak ada di MENU_CONFIG (mis. sub-halaman) dianggap boleh selama login
 const found = MENU_CONFIG.find(m => (m.route || m.id) === targetId);
 if (!found) return true;
 return menus.some(m => (m.route || m.id) === targetId);
}

/* ---------------------------------------------------------------------
 * RBAC — AKSES FORM PENGAJUAN (Katalog ISO)
 * ------------------------------------------------------------------- */
export async function canAccessForm(formConfig, session) {
 const overrides = await loadPermissionOverrides(true);
 const searchKeys = [
 session.username,
 session.username ? String(session.username).toLowerCase() : null,
 session.username ? String(session.username).toUpperCase() : null,
 session.id,
 session.id ? String(session.id).toLowerCase() : null,
 session.id ? String(session.id).toUpperCase() : null,
 session.nik ? String(session.nik) : null,
 session.nama,
 session.nama ? String(session.nama).toLowerCase() : null,
 session.nama ? String(session.nama).toUpperCase() : null
 ].filter(Boolean);

 let userOverride = null;
 for (const k of searchKeys) {
 if (overrides[k]) {
 userOverride = overrides[k];
 break;
 }
 }

 if (userOverride && Array.isArray(userOverride.allowed_forms) && userOverride.allowed_forms.length) {
 return userOverride.allowed_forms.includes(formConfig.id);
 }
 const allowedUsers = (formConfig.allowed_users || []);
 const allowedRules = (formConfig.allowed_rules || []).map(r => r.trim().toUpperCase());
 if (allowedUsers.includes("ALL")) return true;
 if (allowedUsers.some(u => u.trim().toUpperCase() === session.nama.toUpperCase())) return true;
 if (allowedRules.includes(session.role.toUpperCase())) return true;
 if (session.role.toUpperCase() === "HRD") return true; // HRD selalu bisa lihat semua form
 return false;
}

/* ---------------------------------------------------------------------
 * PERMISSION CATALOG GRANULAR (RBAC V2) — MENU → SUBMENU → ACTION
 * Sesuai Dokumen Mapping Hak Akses AJ-HRIS CV Andela Jaya
 * ------------------------------------------------------------------- */
export const PERMISSION_CATALOG = [
 // A. MENU UTAMA
 {
  id: "dashboard",
  label: "Dashboard",
  category: "Menu Utama",
  icon: "home",
  actions: [
   { key: "dashboard.view", label: "Lihat Ringkasan Dashboard", type: "view" },
   { key: "dashboard.sensitive_widgets.view", label: "Lihat Widget Sensitif (Target / KPI / Keuangan)", type: "view" },
   { key: "dashboard.kpi.submit", label: "Kirim Penilaian KPI Cepat", type: "create" }
  ]
 },
 {
  id: "pengajuan",
  label: "Pengajuan",
  category: "Menu Utama",
  icon: "doc-plus",
  actions: [
   { key: "pengajuan.view", label: "Lihat Katalog Formulir Pengajuan", type: "view" },
   { key: "pengajuan.create", label: "Buat Pengajuan Baru (Ajukan Sekarang)", type: "create" }
  ]
 },
 {
  id: "riwayat",
  label: "Riwayat",
  category: "Menu Utama",
  icon: "clock",
  actions: [
   { key: "riwayat.view", label: "Lihat Riwayat Pengajuan Saya & Detail", type: "view" },
   { key: "riwayat.print", label: "Cetak / Download PDF Pengajuan", type: "print" },
   { key: "riwayat.lpj.submit", label: "Isi dan Kirim Laporan Pertanggungjawaban (LPJ)", type: "create" }
  ]
 },

 // B. PERSETUJUAN
 {
  id: "approval",
  label: "Persetujuan",
  category: "Persetujuan",
  icon: "alert",
  subMenus: [
   {
    id: "pending",
    label: "Menunggu Persetujuan Saya",
    actions: [
     { key: "approval.pending.view", label: "Lihat Detail Pengajuan Pending", type: "view" },
     { key: "approval.pending.edit", label: "Simpan Revisi / Catatan HRD", type: "edit" },
     { key: "approval.pending.approve", label: "Setujui Pengajuan (Approve)", type: "approve" },
     { key: "approval.pending.reject", label: "Tolak Pengajuan (Reject)", type: "reject" },
     { key: "approval.pending.print", label: "Cetak Formulir Pengajuan", type: "print" }
    ]
   },
   {
    id: "history",
    label: "Riwayat Saya Proses",
    actions: [
     { key: "approval.history.view", label: "Lihat Riwayat yang Sudah Diproses", type: "view" }
    ]
   }
  ]
 },
 {
  id: "broadcast",
  label: "Memo & Berita",
  category: "Persetujuan",
  icon: "book",
  actions: [
   { key: "broadcast.view", label: "Lihat Daftar Memo & Berita", type: "view" },
   { key: "broadcast.create", label: "Buat Draft Memo Baru", type: "create" },
   { key: "broadcast.publish", label: "Publikasikan / Kirim Memo Resmi", type: "publish" },
   { key: "broadcast.delete", label: "Hapus Memo", type: "delete", dangerous: true }
  ]
 },

 // C. KEHADIRAN
 {
  id: "absensi",
  label: "Absensi",
  category: "Kehadiran",
  icon: "clock",
  subMenus: [
   {
    id: "data",
    label: "Lihat & Koreksi Data",
    actions: [
     { key: "absensi.data.view_all", label: "Lihat Seluruh Data Absensi Karyawan", type: "view_all" },
     { key: "absensi.data.edit", label: "Koreksi / Simpan Log Absensi", type: "edit" },
     { key: "absensi.data.delete", label: "Hapus Data Absensi", type: "delete", dangerous: true }
    ]
   },
   {
    id: "proses_tarif",
    label: "Proses & Tarif Laporan",
    actions: [
     { key: "absensi.proses_tarif.import", label: "Import Data Absensi Excel", type: "import" },
     { key: "absensi.proses_tarif.export", label: "Generate & Unduh Paket Report Excel", type: "export" },
     { key: "absensi.proses_tarif.archive", label: "Tarik / Arsip Spreadsheet", type: "sync" }
    ]
   },
   {
    id: "fingerprint",
    label: "Integrasi Fingerprint",
    actions: [
     { key: "absensi.fingerprint.sync", label: "Sinkronisasi Mesin Fingerprint", type: "sync" },
     { key: "absensi.fingerprint.configure", label: "Konfigurasi Parameter API Mesin", type: "configure" }
    ]
   }
  ]
 },
 {
  id: "pengajuan-cuti",
  label: "Pengajuan Cuti",
  category: "Kehadiran",
  icon: "calendar",
  actions: [
   { key: "pengajuan_cuti.create", label: "Buat / Kirim Formulir Cuti", type: "create" },
   { key: "pengajuan_cuti.print", label: "Cetak / Unduh Formulir Cuti", type: "print" }
  ]
 },
 {
  id: "cuti",
  label: "Kelola Cuti",
  category: "Kehadiran",
  icon: "calendar",
  actions: [
   { key: "cuti.view_all", label: "Lihat Daftar Cuti Seluruh Karyawan", type: "view_all" },
   { key: "cuti.create", label: "Input / Simpan Cuti Karyawan", type: "create" },
   { key: "cuti.edit", label: "Edit Riwayat Cuti", type: "edit" },
   { key: "cuti.delete", label: "Hapus Riwayat Cuti", type: "delete", dangerous: true },
   { key: "cuti.print", label: "Cetak / Download PDF Surat Cuti", type: "print" },
   { key: "cuti.import", label: "Import Jatah Cuti dari Excel", type: "import" },
   { key: "cuti.export", label: "Export Rekap Cuti ke Excel", type: "export" },
   { key: "cuti.annual_reset", label: "Eksekusi Reset Jatah Tahunan Otomatis", type: "configure", dangerous: true },
   { key: "cuti.configure", label: "Pengaturan Master Jenis Cuti & Kebijakan", type: "configure" }
  ]
 },
 {
  id: "izin",
  label: "Izin",
  category: "Kehadiran",
  icon: "doc-plus",
  actions: [
   { key: "izin.create", label: "Buat / Kirim Pengajuan Izin", type: "create" },
   { key: "izin.print", label: "Cetak Surat Pengajuan Izin", type: "print" }
  ],
  subMenus: [
   {
    id: "lihat_semua",
    label: "Lihat Semua Izin",
    actions: [
     { key: "izin.lihat_semua.view", label: "Lihat Izin Seluruh Karyawan", type: "view_all" },
     { key: "izin.lihat_semua.approve", label: "Setujui Permohonan Izin", type: "approve" },
     { key: "izin.lihat_semua.reject", label: "Tolak Permohonan Izin", type: "reject" }
    ]
   }
  ]
 },
 {
  id: "kalender-hr",
  label: "Kalender",
  category: "Kehadiran",
  icon: "calendar",
  actions: [
   { key: "kalender_hr.view", label: "Lihat Agenda & Kalender HR", type: "view" },
   { key: "kalender_hr.create", label: "Tambah Agenda Kalender", type: "create" },
   { key: "kalender_hr.edit", label: "Edit Agenda Kalender", type: "edit" },
   { key: "kalender_hr.delete", label: "Hapus Agenda Kalender", type: "delete", dangerous: true },
   { key: "kalender_hr.send_email", label: "Kirim Notifikasi / Ucapan Email", type: "publish" }
  ]
 },

 // D. KARYAWAN & KINERJA
 {
  id: "siklus-karyawan",
  label: "Karyawan",
  category: "Karyawan & Kinerja",
  icon: "refresh",
  actions: [
   { key: "siklus_karyawan.input.create", label: "Input Mutasi / Promosi / Demosi / Onboarding / Offboarding", type: "create" },
   { key: "siklus_karyawan.input.finalize", label: "Finalisasi & Update Master Karyawan Otomatis", type: "configure", dangerous: true },
   { key: "siklus_karyawan.input.print", label: "Cetak / Unduh Dokumen Siklus Karyawan", type: "print" },
   { key: "siklus_karyawan.riwayat.view", label: "Lihat Riwayat Pergerakan Siklus Karyawan", type: "view" }
  ]
 },
 {
  id: "rekrutmen",
  label: "Rekrutmen",
  category: "Karyawan & Kinerja",
  icon: "user-plus",
  subMenus: [
   {
    id: "dashboard",
    label: "Dashboard ATS",
    actions: [
     { key: "rekrutmen.dashboard.view", label: "Lihat Dashboard Statistik ATS", type: "view" }
    ]
   },
   {
    id: "lowongan",
    label: "Lowongan",
    actions: [
     { key: "rekrutmen.lowongan.create", label: "Buat Lowongan Pekerjaan", type: "create" },
     { key: "rekrutmen.lowongan.edit", label: "Edit Lowongan Pekerjaan", type: "edit" },
     { key: "rekrutmen.lowongan.publish", label: "Publikasikan / Tutup Lowongan", type: "publish" },
     { key: "rekrutmen.lowongan.delete", label: "Hapus Lowongan", type: "delete", dangerous: true }
    ]
   },
   {
    id: "kandidat",
    label: "Kandidat",
    actions: [
     { key: "rekrutmen.kandidat.create", label: "Input / Upload CV Kandidat", type: "create" },
     { key: "rekrutmen.kandidat.view", label: "Lihat CV & Detail Profil Pelamar", type: "view" },
     { key: "rekrutmen.kandidat.edit", label: "Edit Data & Pindah Tahap Kandidat", type: "edit" },
     { key: "rekrutmen.kandidat.delete", label: "Hapus Data Kandidat", type: "delete", dangerous: true },
     { key: "rekrutmen.kandidat.convert_employee", label: "Konversi Kandidat Lolos Menjadi Karyawan", type: "configure" }
    ]
   },
   {
    id: "screening",
    label: "Screening ATS",
    actions: [
     { key: "rekrutmen.screening.run", label: "Jalankan Screening AI / CV Parser", type: "sync" },
     { key: "rekrutmen.screening.save", label: "Simpan Batch Hasil Screening", type: "create" }
    ]
   },
   {
    id: "pipeline",
    label: "Pipeline",
    actions: [
     { key: "rekrutmen.pipeline.view", label: "Lihat Papan Kanban Pipeline", type: "view" },
     { key: "rekrutmen.pipeline.move", label: "Pindahkan Tahapan Kandidat", type: "edit" }
    ]
   },
   {
    id: "interview",
    label: "Interview",
    actions: [
     { key: "rekrutmen.interview.score", label: "Isi Scorecard Penilaian Wawancara", type: "create" },
     { key: "rekrutmen.interview.invite", label: "Kirim Undangan Wawancara (Email/WA)", type: "publish" }
    ]
   },
   {
    id: "analytics",
    label: "Analytics",
    actions: [
     { key: "rekrutmen.analytics.view", label: "Lihat Analisis & Funnel Rekrutmen", type: "view" },
     { key: "rekrutmen.analytics.export", label: "Export Laporan Rekrutmen", type: "export" }
    ]
   },
   {
    id: "rules",
    label: "Master Rules ATS",
    actions: [
     { key: "rekrutmen.rules.configure", label: "Kelola Sinonim, Bobot, Eksklusi & Template Interview", type: "configure" }
    ]
   }
  ]
 },
 {
  id: "penilaian-kontrak",
  label: "Penilaian Kontrak",
  category: "Karyawan & Kinerja",
  icon: "doc-plus",
  actions: [
   { key: "penilaian_kontrak.hasil_saya.view", label: "Lihat Hasil & Grafik Penilaian Saya", type: "view" },
   { key: "penilaian_kontrak.kontrak_saya.view", label: "Lihat & Download Kontrak Kerja Saya", type: "view" },
   { key: "penilaian_kontrak.kontrak.view_all", label: "Lihat Semua Kontrak Karyawan", type: "view_all" },
   { key: "penilaian_kontrak.kontrak.create", label: "Tambah / Perpanjang Kontrak Baru", type: "create" },
   { key: "penilaian_kontrak.kontrak.edit", label: "Edit Data Kontrak Karyawan", type: "edit" },
   { key: "penilaian_kontrak.kontrak.delete", label: "Hapus Kontrak Karyawan", type: "delete", dangerous: true },
   { key: "penilaian_kontrak.standar_grade.configure", label: "Pengaturan Standar Grade HRD & Keputusan", type: "configure" },
   { key: "penilaian_kontrak.template_soal.configure", label: "Buat / Edit / Hapus / Import Template Soal KPI", type: "configure" },
   { key: "penilaian_kontrak.distribusi_kpi360.create", label: "Distribusikan Tugas Penilaian KPI 360°", type: "create" },
   { key: "penilaian_kontrak.distribusi_kpi360.remind", label: "Kirim Pengingat Notifikasi KPI", type: "publish" },
   { key: "penilaian_kontrak.distribusi_kpi360.delete", label: "Hapus Tugas KPI / Log Distribusi", type: "delete", dangerous: true },
   { key: "penilaian_kontrak.evaluasi.edit", label: "Koordinasikan & Simpan Progres Evaluasi Kontrak", type: "edit" },
   { key: "penilaian_kontrak.evaluasi.execute_renewal", label: "Terbitkan Dokumen Kontrak Kerja Baru", type: "publish" },
   { key: "penilaian_kontrak.daily.manage", label: "Input / Edit / Hapus Nilai Kerja Harian", type: "edit" },
   { key: "penilaian_kontrak.target.configure", label: "Atur Target KPI Bulanan", type: "configure" },
   { key: "penilaian_kontrak.daily.export", label: "Export Rekap Nilai Harian ke Excel", type: "export" }
  ]
 },
 {
  id: "performance-review",
  label: "Review Kinerja",
  category: "Karyawan & Kinerja",
  icon: "gauge",
  actions: [
   { key: "performance_review.my.view", label: "Lihat Review Kinerja Saya", type: "view" },
   { key: "performance_review.my.print", label: "Cetak / Unduh Hasil Review Saya", type: "print" }
  ],
  subMenus: [
   {
    id: "semua_review",
    label: "Semua Review Kinerja",
    actions: [
     { key: "performance_review.semua_review.view", label: "Lihat Review Seluruh Karyawan", type: "view_all" },
     { key: "performance_review.semua_review.create", label: "Buat & Rilis Periode Review Kinerja", type: "create" },
     { key: "performance_review.semua_review.publish", label: "Publikasikan Hasil Review Kinerja", type: "publish" },
     { key: "performance_review.semua_review.delete", label: "Hapus Review Kinerja", type: "delete", dangerous: true }
    ]
   }
  ]
 },
 {
  id: "training",
  label: "Pelatihan",
  category: "Karyawan & Kinerja",
  icon: "book",
  actions: [
   { key: "training.my.submit", label: "Ajukan Kebutuhan Pelatihan (TNA)", type: "create" },
   { key: "training.my.participate", label: "Ikut Kelas, Kuis & Isi Feedback", type: "participate" }
  ],
  subMenus: [
   {
    id: "tna_dashboard",
    label: "Program Pelatihan",
    actions: [
     { key: "training.tna_dashboard.create_class", label: "Buat Jadwal & Kelas Pelatihan Bersama", type: "create" },
     { key: "training.tna_dashboard.view_progress", label: "Lihat Progres Seluruh Peserta Kelas", type: "view_all" },
     { key: "training.requests.approve", label: "Setujui Pengajuan Pelatihan (Atasan/GM/Finance)", type: "approve" },
     { key: "training.requests.reject", label: "Tolak Pengajuan Pelatihan", type: "reject" }
    ]
   }
  ]
 },
 {
  id: "konseling-coaching",
  label: "Konseling & Coaching",
  category: "Karyawan & Kinerja",
  icon: "user-plus",
  subMenus: [
   {
    id: "dashboard",
    label: "Dashboard Kasus",
    actions: [
     { key: "konseling.dashboard.view", label: "Lihat Dashboard Kasus Konseling", type: "view" }
    ]
   },
   {
    id: "case_management",
    label: "Manajemen Kasus",
    actions: [
     { key: "konseling.case_management.create", label: "Buat Kasus Konseling / Coaching Baru", type: "create" },
     { key: "konseling.case_management.edit", label: "Edit & Update Catatan Kasus", type: "edit" },
     { key: "konseling.case_management.close", label: "Tutup Kasus Secara Resmi", type: "publish" }
    ]
   },
   {
    id: "action_plan",
    label: "Action Plan",
    actions: [
     { key: "konseling.action_plan.manage", label: "Tambah / Ubah Status Rencana Tindakan (Action Plan)", type: "edit" }
    ]
   },
   {
    id: "follow_up",
    label: "Jadwal Follow-up",
    actions: [
     { key: "konseling.follow_up.manage", label: "Tambah & Update Jadwal Sesi Follow-up", type: "edit" }
    ]
   },
   {
    id: "reports",
    label: "Laporan & Rekap",
    actions: [
     { key: "konseling.reports.export", label: "Download Laporan Konseling (PDF/Excel)", type: "export" }
    ]
   }
  ]
 },
 {
  id: "pemanggilan",
  label: "Disiplin & SP",
  category: "Karyawan & Kinerja",
  icon: "alert",
  actions: [
   { key: "pemanggilan.sp.view", label: "Lihat Surat Peringatan (SP)", type: "view" },
   { key: "pemanggilan.sp.create", label: "Terbitkan Surat Peringatan (SP)", type: "create" },
   { key: "pemanggilan.sp.edit", label: "Edit Data Surat Peringatan", type: "edit" },
   { key: "pemanggilan.sp.delete", label: "Hapus Surat Peringatan", type: "delete", dangerous: true },
   { key: "pemanggilan.panggil.view", label: "Lihat Surat Pemanggilan Klarifikasi", type: "view" },
   { key: "pemanggilan.panggil.create", label: "Buat Surat Pemanggilan Klarifikasi", type: "create" },
   { key: "pemanggilan.panggil.edit", label: "Edit Surat Pemanggilan", type: "edit" },
   { key: "pemanggilan.panggil.delete", label: "Hapus Surat Pemanggilan", type: "delete", dangerous: true }
  ]
 },
 {
  id: "dokumen",
  label: "Dokumen",
  category: "Karyawan & Kinerja",
  icon: "doc-plus",
  actions: [
   { key: "dokumen.drafts.create", label: "Buat Draft Dokumen / Surat Resmi", type: "create" },
   { key: "dokumen.drafts.edit", label: "Edit Isi & Klausul Dokumen", type: "edit" },
   { key: "dokumen.drafts.delete", label: "Hapus Dokumen", type: "delete", dangerous: true },
   { key: "dokumen.drafts.publish", label: "Simpan & Rilis Dokumen Resmi", type: "publish" },
   { key: "dokumen.drafts.print", label: "Preview, Cetak & Unduh Dokumen (PDF/Word)", type: "print" },
   { key: "dokumen.signed.view", label: "Lihat Dokumen Tertanda-tangan Digital", type: "view" },
   { key: "dokumen.signed.print", label: "Cetak Dokumen Tertanda-tangan", type: "print" },
   { key: "dokumen.templates.configure", label: "Kelola Master Template Dokumen", type: "configure" },
   { key: "dokumen.placeholders.configure", label: "Kelola Variabel Placeholder Dinamis", type: "configure" }
  ]
 },

 // E. KEUANGAN
 {
  id: "reimbursement",
  label: "Reimbursement",
  category: "Keuangan",
  icon: "wallet",
  actions: [
   { key: "reimbursement.my.create", label: "Buat / Kirim Pengajuan Klaim Saya", type: "create" },
   { key: "reimbursement.my.view", label: "Lihat & Cetak Nota Klaim Saya", type: "view" }
  ],
  subMenus: [
   {
    id: "daftar_semua",
    label: "Daftar Pengajuan",
    actions: [
     { key: "reimbursement.daftar_semua.view", label: "Lihat Seluruh Pengajuan Klaim Karyawan", type: "view_all" },
     { key: "reimbursement.daftar_semua.approve", label: "Setujui Klaim Reimbursement (Approve)", type: "approve" },
     { key: "reimbursement.daftar_semua.reject", label: "Tolak Pengajuan Reimbursement (Reject)", type: "reject" },
     { key: "reimbursement.daftar_semua.mark_paid", label: "Tandai Cair / Ditransfer ke Karyawan", type: "publish" },
     { key: "reimbursement.daftar_semua.delete", label: "Hapus Pengajuan Reimbursement", type: "delete", dangerous: true }
    ]
   },
   {
    id: "pengaturan_jenis",
    label: "Pengaturan Jenis & Plafon",
    actions: [
     { key: "reimbursement.pengaturan_jenis.configure", label: "Kelola Master Jenis Klaim & Batas Plafon", type: "configure" }
    ]
   }
  ]
 },
 {
  id: "pengajuan-kasbon",
  label: "Kasbon",
  category: "Keuangan",
  icon: "wallet",
  actions: [
   { key: "kasbon.my.create", label: "Buat Pengajuan Kasbon Baru", type: "create" },
   { key: "kasbon.my.print", label: "Cetak Bukti Pengajuan Kasbon", type: "print" },
   { key: "kasbon.all.view", label: "Lihat Seluruh Kasbon Karyawan", type: "view_all" },
   { key: "kasbon.all.approve", label: "Setujui Pengajuan Kasbon", type: "approve" },
   { key: "kasbon.all.reject", label: "Tolak Pengajuan Kasbon", type: "reject" },
   { key: "kasbon.all.mark_paid", label: "Tandai Kasbon Lunas / Potong Gaji", type: "publish" },
   { key: "kasbon.all.delete", label: "Hapus Pengajuan Kasbon", type: "delete", dangerous: true }
  ],
  subMenus: [
   {
    id: "pengaturan_kategori",
    label: "Pengaturan Kategori",
    actions: [
     { key: "kasbon.pengaturan_kategori.configure", label: "Kelola Kategori & Ketentuan Kasbon", type: "configure" }
    ]
   }
  ]
 },
 {
  id: "klaim-bensin",
  label: "Klaim Bensin",
  category: "Keuangan",
  icon: "wallet",
  actions: [
   { key: "klaim_bensin.form.create", label: "Tambah Perjalanan & Kirim Klaim Bensin", type: "create" },
   { key: "klaim_bensin.form.print", label: "Cetak Formulir Klaim Bensin", type: "print" }
  ],
  subMenus: [
   {
    id: "admin_cabang",
    label: "Admin Cabang",
    actions: [
     { key: "klaim_bensin.admin_cabang.view", label: "Lihat Klaim Cabang Cirebon & Malang", type: "view_all" },
     { key: "klaim_bensin.admin_cabang.approve", label: "Setujui Klaim Bensin Cabang", type: "approve" },
     { key: "klaim_bensin.admin_cabang.reject", label: "Tolak Klaim Bensin Cabang", type: "reject" },
     { key: "klaim_bensin.admin_cabang.print", label: "Cetak Rekap & Verifikasi Klaim Cabang", type: "print" }
    ]
   }
  ]
 },
 {
  id: "lembur-kasbon",
  label: "Lembur",
  category: "Keuangan",
  icon: "clock",
  subMenus: [
   {
    id: "dashboard",
    label: "Dashboard Lembur",
    actions: [
     { key: "lembur.dashboard.view", label: "Lihat Dashboard Jam Lembur", type: "view" }
    ]
   },
   {
    id: "perintah",
    label: "Perintah Lembur",
    actions: [
     { key: "lembur.perintah.create", label: "Buat & Terbitkan Surat Perintah Lembur (SPPKL)", type: "create" }
    ]
   },
   {
    id: "usulan_saya",
    label: "Usulan Saya",
    actions: [
     { key: "lembur.usulan_saya.create", label: "Ajukan Usulan Kerja Lembur Mandiri", type: "create" }
    ]
   },
   {
    id: "persetujuan_saya",
    label: "Persetujuan Saya",
    actions: [
     { key: "lembur.persetujuan_saya.approve", label: "Jadikan SPPKL / Setujui Usulan Lembur", type: "approve" },
     { key: "lembur.persetujuan_saya.reject", label: "Tolak Usulan Lembur", type: "reject" }
    ]
   },
   {
    id: "realisasi",
    label: "Realisasi & Verifikasi",
    actions: [
     { key: "lembur.realisasi.verify", label: "Input Realisasi & Verifikasi Jam Lembur", type: "verify" }
    ]
   },
   {
    id: "rekap_jam",
    label: "Rekap Jam Lembur",
    actions: [
     { key: "lembur.rekap_jam.view", label: "Lihat Rekap Jam Lembur Tertimbang", type: "view_all" },
     { key: "lembur.rekap_jam.export", label: "Export 19 Kolom Standar Andela Jaya Excel", type: "export" }
    ]
   },
   {
    id: "laporan",
    label: "Laporan",
    actions: [
     { key: "lembur.laporan.view", label: "Lihat Laporan Rekap Lembur", type: "view_all" },
     { key: "lembur.laporan.export", label: "Export Laporan Lembur", type: "export" }
    ]
   },
   {
    id: "pengaturan",
    label: "Pengaturan",
    actions: [
     { key: "lembur.pengaturan.configure", label: "Konfigurasi Kebijakan & Tarif Lembur", type: "configure" }
    ]
   }
  ]
 },
 {
  id: "uang-makan",
  label: "Uang Makan",
  category: "Keuangan",
  icon: "utensils",
  actions: [
   { key: "uang_makan.create", label: "Input Catatan Trip / Perjalanan", type: "create" },
   { key: "uang_makan.edit", label: "Edit Catatan Trip Uang Makan", type: "edit" },
   { key: "uang_makan.view_all", label: "Lihat Rekap Uang Makan Seluruh Karyawan", type: "view_all" },
   { key: "uang_makan.export", label: "Export Rekap Uang Makan ke Excel", type: "export" }
  ]
 },

 // F. OPERASIONAL
 {
  id: "inventory",
  label: "Inventaris",
  category: "Operasional",
  icon: "box",
  actions: [
   { key: "inventory.barang.view", label: "Lihat Master Aset & Inventaris", type: "view" },
   { key: "inventory.barang.create", label: "Tambah Aset / Barang Baru", type: "create" },
   { key: "inventory.barang.edit", label: "Edit Data Aset & Penempatan", type: "edit" },
   { key: "inventory.barang.delete", label: "Hapus Data Aset / Barang", type: "delete", dangerous: true },
   { key: "inventory.barang.scan", label: "Scan QR Code Barang", type: "sync" },
   { key: "inventory.barang.print_qr", label: "Cetak Label QR Code Barang", type: "print" },
   { key: "inventory.restock.edit", label: "Update Stok & Pembelian Barang", type: "edit" },
   { key: "inventory.restock.export", label: "Export Daftar Belanja & Restock Excel", type: "export" },
   { key: "inventory.ambil.assign", label: "Catat Serah-Terima & Penyerahan Barang", type: "create" },
   { key: "inventory.ambil.return", label: "Catat Pengembalian Barang", type: "edit" },
   { key: "inventory.ambil.print", label: "Cetak Berita Acara Serah Terima", type: "print" },
   { key: "inventory.opname.edit", label: "Input / Update Hasil Stock Opname Fisik", type: "edit" },
   { key: "inventory.opname.print", label: "Cetak Blanko & Laporan Opname Fisik", type: "print" }
  ]
 },
 {
  id: "kendaraan",
  label: "Kendaraan",
  category: "Operasional",
  icon: "truck",
  actions: [
   { key: "kendaraan.cards.create", label: "Tambah Data Kendaraan Baru", type: "create" },
   { key: "kendaraan.cards.edit", label: "Edit Spesifikasi & Status Kendaraan", type: "edit" },
   { key: "kendaraan.cards.delete", label: "Hapus Data Kendaraan", type: "delete", dangerous: true },
   { key: "kendaraan.cards.export", label: "Export Data Kendaraan (Excel/Word)", type: "export" },
   { key: "kendaraan.cards.generate_document", label: "Generate Surat Kuasa & Surat Aset", type: "print" },
   { key: "kendaraan.bbm.manage", label: "Input / Edit / Hapus Log Pembelian BBM", type: "edit" },
   { key: "kendaraan.service.manage", label: "Input / Edit / Hapus Log Service & Perawatan", type: "edit" },
   { key: "kendaraan.pajak.manage", label: "Input / Edit / Hapus Legalitas Pajak & KIR", type: "edit" }
  ]
 },
 {
  id: "gimmick-sop",
  label: "SOP & Gimmick",
  category: "Operasional",
  icon: "book",
  actions: [
   { key: "gimmick_sop.gimmick.manage", label: "Lihat / Tambah / Edit / Hapus Distribusi Gimmick", type: "edit" },
   { key: "gimmick_sop.sop.manage", label: "Lihat / Tambah / Edit / Hapus SOP Operasional", type: "edit" },
   { key: "gimmick_sop.sop.generate_flowchart", label: "Generate Diagram Flowchart SOP", type: "sync" },
   { key: "gimmick_sop.sop.export", label: "Cetak / Unduh Flowchart & Dokumen SOP", type: "export" }
  ]
 },

 // G. SALES
 {
  id: "sales-order",
  label: "Sales Order",
  category: "Sales",
  icon: "wallet",
  actions: [
   { key: "sales_order.view", label: "Lihat Riwayat Sales Order", type: "view" },
   { key: "sales_order.create", label: "Buat Sales Order Baru", type: "create" },
   { key: "sales_order.publish", label: "Terbitkan Faktur / Invoice Penjualan", type: "publish" },
   { key: "sales_order.print", label: "Cetak / Unduh Faktur Penjualan PDF", type: "print" }
  ]
 },
 {
  id: "sales-outlet",
  label: "Outlet",
  category: "Sales",
  icon: "user-plus",
  actions: [
   { key: "sales_outlet.view", label: "Lihat Outlet Saya", type: "view" },
   { key: "sales_outlet.create", label: "Tambah Outlet Baru", type: "create" },
   { key: "sales_outlet.edit", label: "Edit Informasi & Koordinat GPS Outlet", type: "edit" },
   { key: "sales_outlet.assign", label: "Assign Penugasan Sales ke Outlet", type: "edit" }
  ],
  subMenus: [
   {
    id: "lihat_semua",
    label: "Lihat Semua Outlet",
    actions: [
     { key: "sales_outlet.lihat_semua.view", label: "Lihat Seluruh Outlet Toko Mitra", type: "view_all" }
    ]
   },
   {
    id: "import_excel",
    label: "Import Excel",
    actions: [
     { key: "sales_outlet.import_excel.import", label: "Import Data Master Outlet dari Excel", type: "import" }
    ]
   }
  ]
 },
 {
  id: "sales-item",
  label: "Item",
  category: "Sales",
  icon: "box",
  actions: [
   { key: "sales_item.view", label: "Lihat Master Produk / Item", type: "view" },
   { key: "sales_item.create", label: "Tambah Master Item Baru", type: "create" },
   { key: "sales_item.edit", label: "Edit Harga & Data Item", type: "edit" },
   { key: "sales_item.import", label: "Import Master Item dari Excel", type: "import" }
  ]
 },
 {
  id: "sales-task",
  label: "Kunjungan",
  category: "Sales",
  icon: "clock",
  actions: [
   { key: "sales_task.create", label: "Buat Agenda Jadwal Kunjungan", type: "create" },
   { key: "sales_task.edit", label: "Edit Rencana Kunjungan", type: "edit" },
   { key: "sales_task.complete", label: "Selesaikan Kunjungan & Kirim Laporan Toko", type: "publish" }
  ]
 },
 {
  id: "sales-track",
  label: "Tracking",
  category: "Sales",
  icon: "layers",
  actions: [
   { key: "sales_track.view", label: "Lihat Peta & Rute Tracking Sales", type: "view" },
   { key: "sales_track.edit", label: "Ubah GPS / Odometer / Catatan Rute", type: "edit" },
   { key: "sales_track.delete", label: "Hapus Kunjungan / Data Uji Coba", type: "delete", dangerous: true },
   { key: "sales_track.departure.configure", label: "Konfigurasi Titik Keberangkatan HRD", type: "configure" },
   { key: "sales_track.import", label: "Import Data Rute dari Excel", type: "import" },
   { key: "sales_track.export", label: "Export Data Tracking (Excel/PDF)", type: "export" },
   { key: "sales_track.sync", label: "Sinkronisasi Data Checkin Kanal.work", type: "sync" }
  ]
 },

 // H. PENGATURAN
 {
  id: "manajemen-data",
  label: "Data Master",
  category: "Pengaturan",
  icon: "database",
  actions: [
   { key: "manajemen_data.karyawan.manage", label: "Lihat, Tambah, Edit, Hapus Master Database Karyawan", type: "configure" },
   { key: "manajemen_data.karyawan.sync_all", label: "Sinkronkan Nama Karyawan ke Seluruh Modul", type: "sync" },
   { key: "manajemen_data.rekap.view", label: "Lihat Rekap Seluruh Pengajuan", type: "view" },
   { key: "manajemen_data.rekap.export", label: "Export Rekap Seluruh Pengajuan", type: "export" },
   { key: "manajemen_data.dokumen.manage", label: "Kelola Dokumen Operasional", type: "configure" },
   { key: "manajemen_data.signdoc.manage", label: "Kelola Pengajuan Tanda Tangan Digital", type: "configure" },
   { key: "manajemen_data.alldb.view_raw", label: "Lihat Raw JSON Koleksi Database", type: "view" },
   { key: "manajemen_data.alldb.delete_records", label: "Hapus Record Terpilih di Database", type: "delete", dangerous: true },
   { key: "manajemen_data.alldb.clear_collection", label: "Kosongkan Koleksi Database", type: "delete", dangerous: true }
  ]
 },
 {
  id: "pengaturan",
  label: "Hak Akses",
  category: "Pengaturan",
  icon: "user-plus",
  actions: [
   { key: "pengaturan.users.manage", label: "Lihat, Tambah, Edit, Hapus Akun Pengguna", type: "configure" },
   { key: "pengaturan.users.invite", label: "Undang Karyawan Baru (Buat Akun)", type: "create" },
   { key: "pengaturan.rbac.manage", label: "Kelola Hak Akses Menu, Submenu & Action (RBAC)", type: "configure" },
   { key: "pengaturan.forms.manage", label: "Kelola Hak Akses Formulir Pengajuan", type: "configure" },
   { key: "pengaturan.kanal.view", label: "Lihat Konfigurasi API Kanal External", type: "view" },
   { key: "pengaturan.kanal.configure", label: "Simpan Konfigurasi Kredensial Kanal", type: "configure" },
   { key: "pengaturan.kanal.test", label: "Uji Koneksi Server API Kanal", type: "sync" },
   { key: "pengaturan.kanal.sync", label: "Tarik Data Live dari API Kanal", type: "sync" }
  ]
 },
 {
  id: "konfigurasi",
  label: "Konfigurasi",
  category: "Pengaturan",
  icon: "layers",
  actions: [
   { key: "konfigurasi.general.configure", label: "Kelola Shift Kerja & Kebijakan Umum", type: "configure" },
   { key: "konfigurasi.widget_access.configure", label: "Konfigurasi Izin Tampil Widget Dashboard", type: "configure" },
   { key: "konfigurasi.cuti.bulk_execute", label: "Eksekusi Massal Reset Saldo Cuti", type: "configure", dangerous: true },
   { key: "konfigurasi.email.configure", label: "Konfigurasi Email SMTP & Pengingat Otomatis", type: "configure" },
   { key: "konfigurasi.email.send_test", label: "Kirim Uji Coba Email Reminder", type: "publish" },
   { key: "konfigurasi.email.run_now", label: "Jalankan Scan & Kirim Email Reminder Sekarang", type: "sync" },
   { key: "konfigurasi.branch.configure", label: "Kelola & Sinkronisasi Daftar Cabang", type: "configure" }
  ]
 },
 {
  id: "form-builder",
  label: "Form Builder",
  category: "Pengaturan",
  icon: "doc-plus",
  actions: [
   { key: "form_builder.view", label: "Lihat Daftar Formulir Dinamis", type: "view" },
   { key: "form_builder.create", label: "Buat Formulir Pengajuan Baru", type: "create" },
   { key: "form_builder.edit", label: "Edit Desain & Field Formulir", type: "edit" },
   { key: "form_builder.delete", label: "Hapus Formulir Pengajuan", type: "delete", dangerous: true },
   { key: "form_builder.configure", label: "Atur Penerima, Notifikasi & Workflow Approval", type: "configure" }
  ]
 },

 // I. FITUR PROFILE & PENDUKUNG
 {
  id: "profile",
  label: "Profil Saya",
  category: "Fitur Profil",
  icon: "user",
  actions: [
   { key: "profile.view", label: "Lihat Profil Biodata Saya", type: "view" },
   { key: "profile.edit", label: "Edit Biodata & Upload Foto Profil", type: "edit" },
   { key: "profile.documents.view", label: "Lihat Arsip Dokumen Pribadi", type: "view" },
   { key: "profile.sign_document", label: "Bubuhkan Tanda Tangan Digital pada Dokumen", type: "publish" }
  ]
 },
 {
  id: "absensi-saya",
  label: "Absensi Saya",
  category: "Kehadiran",
  icon: "clock",
  actions: [
   { key: "absensi_saya.view", label: "Lihat Riwayat Presensi Sendiri", type: "view" }
  ]
 },
 {
  id: "export-data",
  label: "Export Data",
  category: "Pengaturan",
  icon: "download",
  actions: [
   { key: "export_data.export", label: "Export Data Master CSV / Excel", type: "export" }
  ]
 }
];

/**
 * PRESET TEMPLATE HAK AKSES PER ROLE
 * Memudahkan HRD menetapkan hak akses granular secara instan
 */
export const ROLE_PERMISSIONS_PRESETS = {
 SUPERADMIN: ["*"],
 HRD: [
  "dashboard.view", "dashboard.sensitive_widgets.view", "dashboard.kpi.submit",
  "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print", "riwayat.lpj.submit",
  "approval.pending.view", "approval.pending.edit", "approval.pending.approve", "approval.pending.reject", "approval.pending.print", "approval.history.view",
  "broadcast.view", "broadcast.create", "broadcast.publish", "broadcast.delete",
  "absensi.data.view_all", "absensi.data.edit", "absensi.data.delete", "absensi.proses_tarif.import", "absensi.proses_tarif.export", "absensi.proses_tarif.archive", "absensi.fingerprint.sync", "absensi.fingerprint.configure",
  "pengajuan_cuti.create", "pengajuan_cuti.print",
  "cuti.view_all", "cuti.create", "cuti.edit", "cuti.delete", "cuti.print", "cuti.import", "cuti.export", "cuti.annual_reset", "cuti.configure",
  "izin.create", "izin.print", "izin.lihat_semua.view", "izin.lihat_semua.approve", "izin.lihat_semua.reject",
  "kalender_hr.view", "kalender_hr.create", "kalender_hr.edit", "kalender_hr.delete", "kalender_hr.send_email",
  "siklus_karyawan.input.create", "siklus_karyawan.input.finalize", "siklus_karyawan.input.print", "siklus_karyawan.riwayat.view",
  "rekrutmen.dashboard.view", "rekrutmen.lowongan.create", "rekrutmen.lowongan.edit", "rekrutmen.lowongan.publish", "rekrutmen.lowongan.delete", "rekrutmen.kandidat.create", "rekrutmen.kandidat.view", "rekrutmen.kandidat.edit", "rekrutmen.kandidat.delete", "rekrutmen.kandidat.convert_employee", "rekrutmen.screening.run", "rekrutmen.screening.save", "rekrutmen.pipeline.view", "rekrutmen.pipeline.move", "rekrutmen.interview.score", "rekrutmen.interview.invite", "rekrutmen.analytics.view", "rekrutmen.analytics.export", "rekrutmen.rules.configure",
  "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view", "penilaian_kontrak.kontrak.view_all", "penilaian_kontrak.kontrak.create", "penilaian_kontrak.kontrak.edit", "penilaian_kontrak.kontrak.delete", "penilaian_kontrak.standar_grade.configure", "penilaian_kontrak.template_soal.configure", "penilaian_kontrak.distribusi_kpi360.create", "penilaian_kontrak.distribusi_kpi360.remind", "penilaian_kontrak.distribusi_kpi360.delete", "penilaian_kontrak.evaluasi.edit", "penilaian_kontrak.evaluasi.execute_renewal", "penilaian_kontrak.daily.manage", "penilaian_kontrak.target.configure", "penilaian_kontrak.daily.export",
  "performance_review.my.view", "performance_review.my.print", "performance_review.semua_review.view", "performance_review.semua_review.create", "performance_review.semua_review.publish", "performance_review.semua_review.delete",
  "training.my.submit", "training.my.participate", "training.tna_dashboard.create_class", "training.tna_dashboard.view_progress", "training.requests.approve", "training.requests.reject",
  "konseling.dashboard.view", "konseling.case_management.create", "konseling.case_management.edit", "konseling.case_management.close", "konseling.action_plan.manage", "konseling.follow_up.manage", "konseling.reports.export",
  "pemanggilan.sp.view", "pemanggilan.sp.create", "pemanggilan.sp.edit", "pemanggilan.sp.delete", "pemanggilan.panggil.view", "pemanggilan.panggil.create", "pemanggilan.panggil.edit", "pemanggilan.panggil.delete",
  "dokumen.drafts.create", "dokumen.drafts.edit", "dokumen.drafts.delete", "dokumen.drafts.publish", "dokumen.drafts.print", "dokumen.signed.view", "dokumen.signed.print", "dokumen.templates.configure", "dokumen.placeholders.configure",
  "reimbursement.my.create", "reimbursement.my.view", "reimbursement.daftar_semua.view", "reimbursement.daftar_semua.approve", "reimbursement.daftar_semua.reject", "reimbursement.pengaturan_jenis.configure",
  "kasbon.my.create", "kasbon.my.print", "kasbon.all.view", "kasbon.all.approve", "kasbon.all.reject", "kasbon.pengaturan_kategori.configure",
  "klaim_bensin.form.create", "klaim_bensin.form.print", "klaim_bensin.admin_cabang.view", "klaim_bensin.admin_cabang.approve", "klaim_bensin.admin_cabang.reject", "klaim_bensin.admin_cabang.print",
  "lembur.dashboard.view", "lembur.perintah.create", "lembur.usulan_saya.create", "lembur.persetujuan_saya.approve", "lembur.persetujuan_saya.reject", "lembur.realisasi.verify", "lembur.rekap_jam.view", "lembur.rekap_jam.export", "lembur.laporan.view", "lembur.laporan.export", "lembur.pengaturan.configure",
  "uang_makan.create", "uang_makan.edit", "uang_makan.view_all", "uang_makan.export",
  "inventory.barang.view", "inventory.barang.create", "inventory.barang.edit", "inventory.barang.delete", "inventory.barang.scan", "inventory.barang.print_qr", "inventory.restock.edit", "inventory.restock.export", "inventory.ambil.assign", "inventory.ambil.return", "inventory.ambil.print", "inventory.opname.edit", "inventory.opname.print",
  "kendaraan.cards.create", "kendaraan.cards.edit", "kendaraan.cards.delete", "kendaraan.cards.export", "kendaraan.cards.generate_document", "kendaraan.bbm.manage", "kendaraan.service.manage", "kendaraan.pajak.manage",
  "gimmick_sop.gimmick.manage", "gimmick_sop.sop.manage", "gimmick_sop.sop.generate_flowchart", "gimmick_sop.sop.export",
  "manajemen_data.karyawan.manage", "manajemen_data.karyawan.sync_all", "manajemen_data.rekap.view", "manajemen_data.rekap.export", "manajemen_data.dokumen.manage", "manajemen_data.signdoc.manage",
  "pengaturan.users.manage", "pengaturan.users.invite", "pengaturan.rbac.manage", "pengaturan.forms.manage", "pengaturan.kanal.view", "pengaturan.kanal.configure", "pengaturan.kanal.test", "pengaturan.kanal.sync",
  "konfigurasi.general.configure", "konfigurasi.widget_access.configure", "konfigurasi.cuti.bulk_execute", "konfigurasi.email.configure", "konfigurasi.email.send_test", "konfigurasi.email.run_now", "konfigurasi.branch.configure",
  "form_builder.view", "form_builder.create", "form_builder.edit", "form_builder.delete", "form_builder.configure",
  "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document",
  "absensi_saya.view", "export_data.export"
 ],
 GM: [
  "dashboard.view", "dashboard.sensitive_widgets.view",
  "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print",
  "approval.pending.view", "approval.pending.approve", "approval.pending.reject", "approval.pending.print", "approval.history.view",
  "broadcast.view", "broadcast.create", "broadcast.publish",
  "absensi.data.view_all", "absensi.proses_tarif.export",
  "pengajuan_cuti.create", "pengajuan_cuti.print", "cuti.view_all", "cuti.export",
  "izin.create", "izin.print", "izin.lihat_semua.view", "izin.lihat_semua.approve", "izin.lihat_semua.reject",
  "kalender_hr.view", "siklus_karyawan.riwayat.view",
  "rekrutmen.dashboard.view", "rekrutmen.lowongan.view", "rekrutmen.kandidat.view", "rekrutmen.pipeline.view", "rekrutmen.interview.score", "rekrutmen.analytics.view", "rekrutmen.analytics.export",
  "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view", "penilaian_kontrak.kontrak.view_all", "penilaian_kontrak.distribusi_kpi360.create", "penilaian_kontrak.daily.export",
  "performance_review.my.view", "performance_review.semua_review.view", "performance_review.semua_review.create", "performance_review.semua_review.publish",
  "training.my.submit", "training.my.participate", "training.tna_dashboard.view_progress", "training.requests.approve", "training.requests.reject",
  "konseling.dashboard.view", "konseling.reports.export",
  "pemanggilan.sp.view", "pemanggilan.panggil.view",
  "dokumen.signed.view", "dokumen.signed.print",
  "reimbursement.my.create", "reimbursement.my.view", "reimbursement.daftar_semua.view", "reimbursement.daftar_semua.approve", "reimbursement.daftar_semua.reject",
  "kasbon.my.create", "kasbon.my.print", "kasbon.all.view", "kasbon.all.approve", "kasbon.all.reject",
  "klaim_bensin.form.create", "klaim_bensin.form.print", "klaim_bensin.admin_cabang.view", "klaim_bensin.admin_cabang.approve", "klaim_bensin.admin_cabang.reject",
  "lembur.dashboard.view", "lembur.perintah.create", "lembur.usulan_saya.create", "lembur.persetujuan_saya.approve", "lembur.persetujuan_saya.reject", "lembur.rekap_jam.view", "lembur.rekap_jam.export", "lembur.laporan.view", "lembur.laporan.export",
  "uang_makan.view_all", "uang_makan.export",
  "inventory.barang.view", "inventory.restock.export", "inventory.opname.print",
  "kendaraan.cards.export", "kendaraan.bbm.manage",
  "gimmick_sop.sop.manage", "gimmick_sop.sop.export",
  "sales_order.view", "sales_outlet.lihat_semua.view", "sales_item.view", "sales_track.view", "sales_track.export",
  "manajemen_data.rekap.view", "manajemen_data.rekap.export",
  "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document",
  "absensi_saya.view"
 ],
 FINANCE: [
  "dashboard.view", "dashboard.sensitive_widgets.view",
  "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print", "riwayat.lpj.submit",
  "approval.pending.view", "approval.pending.approve", "approval.pending.reject", "approval.pending.print", "approval.history.view",
  "broadcast.view", "absensi.data.view_all", "absensi.proses_tarif.export",
  "pengajuan_cuti.create", "pengajuan_cuti.print",
  "izin.create", "izin.print",
  "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view",
  "performance_review.my.view",
  "training.my.submit", "training.my.participate", "training.requests.approve", "training.requests.reject",
  "reimbursement.my.create", "reimbursement.my.view", "reimbursement.daftar_semua.view", "reimbursement.daftar_semua.approve", "reimbursement.daftar_semua.reject", "reimbursement.daftar_semua.mark_paid", "reimbursement.pengaturan_jenis.configure",
  "kasbon.my.create", "kasbon.my.print", "kasbon.all.view", "kasbon.all.approve", "kasbon.all.reject", "kasbon.all.mark_paid", "kasbon.pengaturan_kategori.configure",
  "klaim_bensin.form.create", "klaim_bensin.form.print", "klaim_bensin.admin_cabang.view", "klaim_bensin.admin_cabang.approve", "klaim_bensin.admin_cabang.reject", "klaim_bensin.admin_cabang.print",
  "lembur.dashboard.view", "lembur.usulan_saya.create", "lembur.persetujuan_saya.approve", "lembur.persetujuan_saya.reject", "lembur.rekap_jam.view", "lembur.rekap_jam.export", "lembur.laporan.view", "lembur.laporan.export",
  "uang_makan.create", "uang_makan.edit", "uang_makan.view_all", "uang_makan.export",
  "inventory.barang.view", "inventory.restock.export",
  "kendaraan.cards.export", "kendaraan.bbm.manage",
  "sales_order.view", "sales_order.print", "sales_item.view",
  "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document",
  "absensi_saya.view", "export_data.export"
 ],
 SPV: [
  "dashboard.view",
  "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print", "riwayat.lpj.submit",
  "approval.pending.view", "approval.pending.approve", "approval.pending.reject", "approval.pending.print", "approval.history.view",
  "broadcast.view",
  "pengajuan_cuti.create", "pengajuan_cuti.print",
  "izin.create", "izin.print", "izin.lihat_semua.view", "izin.lihat_semua.approve", "izin.lihat_semua.reject",
  "kalender_hr.view",
  "rekrutmen.kandidat.view", "rekrutmen.interview.score",
  "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view", "penilaian_kontrak.distribusi_kpi360.create", "penilaian_kontrak.daily.manage",
  "performance_review.my.view", "performance_review.semua_review.view",
  "training.my.submit", "training.my.participate", "training.requests.approve",
  "konseling.dashboard.view", "konseling.case_management.create", "konseling.action_plan.manage", "konseling.follow_up.manage",
  "reimbursement.my.create", "reimbursement.my.view",
  "kasbon.my.create", "kasbon.my.print",
  "klaim_bensin.form.create", "klaim_bensin.form.print",
  "lembur.dashboard.view", "lembur.perintah.create", "lembur.usulan_saya.create", "lembur.persetujuan_saya.approve", "lembur.persetujuan_saya.reject", "lembur.realisasi.verify", "lembur.rekap_jam.view",
  "uang_makan.create",
  "inventory.barang.view", "inventory.ambil.assign", "inventory.ambil.return", "inventory.ambil.print",
  "kendaraan.bbm.manage",
  "sales_order.view", "sales_order.create", "sales_outlet.lihat_semua.view", "sales_item.view", "sales_task.create", "sales_task.edit", "sales_task.complete", "sales_track.view",
  "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document",
  "absensi_saya.view"
 ],
 SALES: [
  "dashboard.view",
  "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print", "riwayat.lpj.submit",
  "broadcast.view",
  "pengajuan_cuti.create", "pengajuan_cuti.print",
  "izin.create", "izin.print",
  "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view",
  "performance_review.my.view",
  "training.my.submit", "training.my.participate",
  "reimbursement.my.create", "reimbursement.my.view",
  "kasbon.my.create", "kasbon.my.print",
  "klaim_bensin.form.create", "klaim_bensin.form.print",
  "sales_order.view", "sales_order.create", "sales_order.print",
  "sales_outlet.view", "sales_outlet.create", "sales_outlet.edit",
  "sales_item.view",
  "sales_task.create", "sales_task.edit", "sales_task.complete",
  "sales_track.view",
  "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document",
  "absensi_saya.view"
 ],
 STAFF: [
  "dashboard.view",
  "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print", "riwayat.lpj.submit",
  "broadcast.view",
  "pengajuan_cuti.create", "pengajuan_cuti.print",
  "izin.create", "izin.print",
  "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view",
  "performance_review.my.view",
  "training.my.submit", "training.my.participate",
  "reimbursement.my.create", "reimbursement.my.view",
  "kasbon.my.create", "kasbon.my.print",
  "klaim_bensin.form.create", "klaim_bensin.form.print",
  "lembur.usulan_saya.create",
  "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document",
  "absensi_saya.view"
 ]
};

// Role Presets for Default & Specific Divisions
ROLE_PERMISSIONS_PRESETS.DEFAULT_KARYAWAN = [
 "dashboard.view",
 "pengajuan.view", "pengajuan.create", "riwayat.view",
 "absensi.data.view_all", "absensi_saya.view",
 "pengajuan_cuti.create", "pengajuan_cuti.print",
 "izin.create", "izin.print",
 "performance_review.my.view",
 "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document"
];
ROLE_PERMISSIONS_PRESETS.BACK_OFFICE = [
 "dashboard.view",
 "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print", "riwayat.lpj.submit",
 "broadcast.view",
 "absensi.data.view_all", "absensi_saya.view",
 "pengajuan_cuti.create", "pengajuan_cuti.print",
 "izin.create", "izin.print",
 "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view",
 "performance_review.my.view",
 "training.my.submit", "training.my.participate",
 "reimbursement.my.create", "reimbursement.my.view",
 "kasbon.my.create", "kasbon.my.print",
 "klaim_bensin.form.create", "klaim_bensin.form.print",
 "lembur.dashboard.view", "lembur.usulan_saya.create",
 "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document"
];
ROLE_PERMISSIONS_PRESETS.WAREHOUSE = [
 "dashboard.view",
 "pengajuan.view", "pengajuan.create", "riwayat.view", "riwayat.print",
 "broadcast.view",
 "absensi.data.view_all", "absensi_saya.view",
 "pengajuan_cuti.create", "pengajuan_cuti.print",
 "izin.create", "izin.print",
 "penilaian_kontrak.hasil_saya.view", "penilaian_kontrak.kontrak_saya.view",
 "performance_review.my.view",
 "training.my.submit", "training.my.participate",
 "lembur.dashboard.view", "lembur.usulan_saya.create",
 "inventory.barang.view", "inventory.ambil.create",
 "kendaraan.bbm.manage",
 "profile.view", "profile.edit", "profile.documents.view", "profile.sign_document"
];

// Aliases for roles
ROLE_PERMISSIONS_PRESETS.KARYAWAN = ROLE_PERMISSIONS_PRESETS.DEFAULT_KARYAWAN;
ROLE_PERMISSIONS_PRESETS.DEFAULT = ROLE_PERMISSIONS_PRESETS.DEFAULT_KARYAWAN;
ROLE_PERMISSIONS_PRESETS.DRIVER = ROLE_PERMISSIONS_PRESETS.STAFF;
ROLE_PERMISSIONS_PRESETS["BACK OFFICE"] = ROLE_PERMISSIONS_PRESETS.BACK_OFFICE;
ROLE_PERMISSIONS_PRESETS.BACKOFFICE = ROLE_PERMISSIONS_PRESETS.BACK_OFFICE;
ROLE_PERMISSIONS_PRESETS.BO = ROLE_PERMISSIONS_PRESETS.BACK_OFFICE;
ROLE_PERMISSIONS_PRESETS.GUDANG = ROLE_PERMISSIONS_PRESETS.WAREHOUSE;
ROLE_PERMISSIONS_PRESETS.MANAGER = ROLE_PERMISSIONS_PRESETS.SPV;
ROLE_PERMISSIONS_PRESETS.KOORDINATOR = ROLE_PERMISSIONS_PRESETS.SPV;
ROLE_PERMISSIONS_PRESETS["BRANCH MANAGER"] = ROLE_PERMISSIONS_PRESETS.GM;
ROLE_PERMISSIONS_PRESETS.DIREKTUR = ROLE_PERMISSIONS_PRESETS.GM;

/**
 * Cek apakah session memiliki hak permission tertentu
 * @param {string} permissionKey - e.g. "cuti.delete", "approval.pending.approve"
 * @param {object} session - user session
 * @param {boolean} forceReload - apakah reload overrides dari firestore
 */
export async function hasPermission(permissionKey, session, forceReload = false) {
 if (!session) return false;
 const role = (session.role || "").toUpperCase();
 const posisi = (session.posisi || session.jabatan || "").toUpperCase();
 if (role === "SUPERADMIN") return true;

 const isSales = role === "SALES" || posisi.includes("SALES");

 const userOverride = await _findUserOverride(session);
 if (userOverride && Array.isArray(userOverride.allowed_actions) && userOverride.allowed_actions.length > 0) {
  if (isSales && permissionKey.startsWith("lembur.") && !userOverride.allowed_actions.includes(permissionKey)) {
   return false;
  }
  return userOverride.allowed_actions.includes(permissionKey);
 }

 // Aturan Khusus: Sales tidak memiliki hak lembur
 if (isSales && permissionKey.startsWith("lembur.")) {
  return false;
 }

 // Fallback ke Role Presets
 const preset = ROLE_PERMISSIONS_PRESETS[role] || (isSales ? ROLE_PERMISSIONS_PRESETS.SALES : (posisi.includes("WAREHOUSE") || posisi.includes("GUDANG") ? ROLE_PERMISSIONS_PRESETS.WAREHOUSE : (posisi.includes("BACK OFFICE") || posisi.includes("BACKOFFICE") ? ROLE_PERMISSIONS_PRESETS.BACK_OFFICE : ROLE_PERMISSIONS_PRESETS.DEFAULT_KARYAWAN)));
 if (preset && (preset.includes("*") || preset.includes(permissionKey))) {
  if (userOverride?.read_only) {
   const isModify = permissionKey.endsWith(".edit") || permissionKey.endsWith(".delete") || permissionKey.endsWith(".configure") || permissionKey.endsWith(".annual_reset") || permissionKey.endsWith(".bulk_execute");
   if (isModify && !permissionKey.includes(".my.")) return false;
  }
  return true;
 }

 return false;
}

export { MANAJEMEN_ROLES };
