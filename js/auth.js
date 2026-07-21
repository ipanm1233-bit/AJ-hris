/**
 * =====================================================================
 * AUTH.JS — Mesin RBAC ("RBAC Sakti") & Sesi Login
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Alur:
 *  1. login() -> cocokkan username/password (hash SHA-256) ke koleksi `users`
 *  2. Simpan sesi minimal (username, role, nama, nik) ke sessionStorage
 *  3. getMenuConfig() mendefinisikan SELURUH menu sistem + kelompok otoritas
 *  4. computeVisibleMenus() = (menu default sesuai role) DIGABUNG/DITINDIH
 *     oleh override per-user dari koleksi `user_permissions` (diatur HRD)
 *  5. canAccessForm(formConfig) untuk kontrol akses Katalog Pengajuan ISO
 * =====================================================================
 */
import { db, COL, doc, getDoc, collection, getDocs, query, where, updateDoc } from "./firebase-config.js";
import { sha256, fsGetAll } from "./utils.js";

const SESSION_KEY = "andela_hris_session";

/* ---------------------------------------------------------------------
 * DEFINISI MENU GLOBAL — SATU SUMBER KEBENARAN UNTUK SIDEBAR & ROUTER
 * group: 'all' | 'hrd' | 'manajemen'
 * roles: daftar role tambahan yang berhak (di luar aturan group bawaan)
 * ------------------------------------------------------------------- */
// Pengelompokan & Penyesuaian Icon Menu
export const MENU_CONFIG = [
  // 📁 KATEGORI: MENU UTAMA (Personal)
  { id: "dashboard", label: "Home & Dashboard", icon: "home", kategori: "Menu Utama", roles: ["ALL"] },
  { id: "pengajuan", label: "Buat Pengajuan", icon: "doc-plus", kategori: "Menu Utama", roles: ["ALL"] },
  { id: "klaim-bensin", label: "Klaim Bensin", icon: "wallet", kategori: "Menu Utama", roles: ["ALL"] },
  { id: "riwayat", label: "Riwayat Pengajuan", icon: "clock", kategori: "Menu Utama", roles: ["ALL"] },

  // 📁 KATEGORI: MANAJEMEN & PERSETUJUAN
  { id: "approval", label: "Antrean Persetujuan", icon: "alert", kategori: "Manajemen & Persetujuan", roles: ["HRD", "FINANCE", "SUPERADMIN", "ATASAN"] },
  { id: "broadcast", label: "Broadcast Memo", icon: "book", kategori: "Manajemen & Persetujuan", roles: ["HRD", "SUPERADMIN"] },

  // 📁 KATEGORI: KEHADIRAN & CUTI
  { id: "absensi", label: "Manajemen Absensi", icon: "clock", kategori: "Kehadiran & Cuti", roles: ["HRD", "SUPERADMIN"] },
  { id: "manajemen-cuti", label: "Manajemen Cuti", icon: "calendar", kategori: "Kehadiran & Cuti", roles: ["HRD", "SUPERADMIN"] },
  { id: "cuti", label: "Jatah Cuti Karyawan", icon: "layers", kategori: "Kehadiran & Cuti", roles: ["HRD", "SUPERADMIN"] },
  { id: "lembur-kasbon", label: "Lembur & Kasbon", icon: "wallet", kategori: "Kehadiran & Cuti", roles: ["HRD", "FINANCE", "SUPERADMIN"] },
  { id: "kalender-hr", label: "Kalender HR", icon: "calendar", kategori: "Kehadiran & Cuti", roles: ["HRD", "SUPERADMIN"] },

  // 📁 KATEGORI: KINERJA & KEDISIPLINAN
  { id: "rekrutmen", label: "Rekrutmen (ATS)", icon: "user-plus", kategori: "Kinerja & Karyawan", roles: ["HRD", "SUPERADMIN"] },
  { id: "siklus-karyawan", label: "Siklus Karyawan", icon: "refresh", kategori: "Kinerja & Karyawan", roles: ["HRD", "SUPERADMIN"] },
  { id: "penilaian-kontrak", label: "Penilaian & Kontrak", icon: "doc-plus", kategori: "Kinerja & Karyawan", roles: ["HRD", "SUPERADMIN"] },
  { id: "training", label: "Pelatihan & TNA", icon: "book", kategori: "Kinerja & Karyawan", roles: ["ALL"] },
  { id: "performance-review", label: "Review Kinerja", icon: "gauge", kategori: "Kinerja & Karyawan", roles: ["ALL"] },
  // 👇 INI ADALAH PERBAIKAN UNTUK BUG 404 KEDISIPLINAN:
  { id: "pemanggilan", label: "Kedisiplinan & SP", icon: "alert", kategori: "Kinerja & Karyawan", roles: ["HRD", "SUPERADMIN"] }, 

  // 📁 KATEGORI: OPERASIONAL & ASET
  { id: "kendaraan", label: "Manajemen Kendaraan", icon: "truck", kategori: "Operasional & Aset", roles: ["HRD", "GA", "SUPERADMIN"] },
  { id: "inventory", label: "Manajemen Inventory & ATK", icon: "box", kategori: "Operasional & Aset", roles: ["HRD", "GA", "SUPERADMIN"] },
  { id: "uang-makan", label: "Uang Makan Expedisi", icon: "utensils", kategori: "Operasional & Aset", roles: ["HRD", "FINANCE", "SUPERADMIN"] },
  { id: "gimmick-sop", label: "Gimmick & SOP", icon: "book", kategori: "Operasional & Aset", roles: ["HRD", "SUPERADMIN"] },

  // 📁 KATEGORI: MODUL SALES
  { id: "sales-order", label: "Order Penjualan", icon: "wallet", kategori: "Modul Sales", roles: ["ALL"] },
  { id: "sales-outlet", label: "Master Outlet", icon: "user-plus", kategori: "Modul Sales", roles: ["ALL"] },
  { id: "sales-item", label: "Master Item", icon: "box", kategori: "Modul Sales", roles: ["ALL"] },
  { id: "sales-task", label: "Tugas Sales", icon: "clock", kategori: "Modul Sales", roles: ["ALL"] },
  { id: "sales-track", label: "Summary Track", icon: "layers", kategori: "Modul Sales", roles: ["ALL"] },

  // 📁 KATEGORI: PENGATURAN SISTEM
  { id: "manajemen-data", label: "Manajemen Data", icon: "database", kategori: "Pengaturan Sistem", roles: ["HRD", "SUPERADMIN"] },
  { id: "pengaturan", label: "Akses & Pengguna", icon: "user-plus", kategori: "Pengaturan Sistem", roles: ["HRD", "SUPERADMIN"] },
  { id: "konfigurasi", label: "Konfigurasi Sistem", icon: "layers", kategori: "Pengaturan Sistem", roles: ["SUPERADMIN"] },
  { id: "form-builder", label: "Form Builder", icon: "doc-plus", kategori: "Pengaturan Sistem", roles: ["HRD", "SUPERADMIN"] }
];

const MANAJEMEN_ROLES = ["SPV", "HRD", "GM", "FINANCE", "MANAGER", "BRANCH MANAGER"];

/* ---------------------------------------------------------------------
 * SESSION HELPERS
 * ------------------------------------------------------------------- */
export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setSession(data) {
    const str = JSON.stringify(data);
    // Simpan di KEDUA tempat agar lebih aman dan bertahan lama (Persistent)
    sessionStorage.setItem(SESSION_KEY, str);
    localStorage.setItem(SESSION_KEY, str); 
}
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
export function isLoggedIn() { return !!getSession(); }

/* ---------------------------------------------------------------------
 * LOGIN
 * ------------------------------------------------------------------- */
export async function login(username, password, remember = false) {
  const uname = username.trim().toUpperCase();
  const snap = await getDoc(doc(db, COL.USERS, uname));
  if (!snap.exists()) throw new Error("Username tidak ditemukan.");
  const user = snap.data();

  const inputHash = await sha256(password);
  const storedPass = String(user.password_hash || user.password || "");
  // Mendukung transisi: jika password lama belum di-hash (migrasi awal), izinkan match plaintext sekali lalu paksa hash.
  const match = storedPass === inputHash || storedPass === password;
  if (!match) throw new Error("Password salah.");

  let karyawan = null;
  if (user.nik) {
    const kSnap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(user.nik)));
    if (kSnap.exists()) karyawan = kSnap.data();
  }

  const session = {
    username: uname,
    role: (user.role || "STAFF").toUpperCase(),
    nama: user.nama || uname,
    email: user.email || "",
    posisi: user.posisi || karyawan?.jabatan || "-",
    nik: user.nik || karyawan?.nik_karyawan || null,
    cabang: karyawan?.cabang || user.cabang || "-",
    foto_url: karyawan?.foto_url || null,
    loginAt: Date.now()
  };
  setSession(session, remember);
  return session;
}
export async function loginWithToken(tokenStr) {
  const tokenSnap = await getDoc(doc(db, "login_tokens", tokenStr));
  if (!tokenSnap.exists()) throw new Error("Token tidak valid.");
  
  const tokenData = tokenSnap.data();
  if (tokenData.used) throw new Error("Token sudah pernah digunakan demi keamanan.");

  // Cek kedaluwarsa (Maksimal 24 Jam)
  const now = Date.now();
  if (now - tokenData.createdAt > 24 * 60 * 60 * 1000) throw new Error("Token telah kedaluwarsa.");

  // Ambil Data Pengguna
  const uname = tokenData.username;
  const snap = await getDoc(doc(db, COL.USERS, uname));
  if (!snap.exists()) throw new Error("Pengguna tidak ditemukan.");
  const user = snap.data();

  // HANGUSKAN TOKEN (Tandai sudah terpakai)
  await updateDoc(doc(db, "login_tokens", tokenStr), { used: true, usedAt: now });

  let karyawan = null;
  if (user.nik) {
    const kSnap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(user.nik)));
    if (kSnap.exists()) karyawan = kSnap.data();
  }

  // Buat Sesi Login Otomatis
  const session = {
    username: uname, role: (user.role || "STAFF").toUpperCase(), nama: user.nama || uname,
    email: user.email || "", posisi: user.posisi || karyawan?.jabatan || "-",
    nik: user.nik || karyawan?.nik_karyawan || null, cabang: karyawan?.cabang || user.cabang || "-",
    foto_url: karyawan?.foto_url || null, loginAt: Date.now()
  };
  setSession(session, true); // Paksa login
  return session;
}
export function logout() {
  clearSession();
  location.hash = "#login";
  location.reload();
}

/* ---------------------------------------------------------------------
 * RBAC — MENU VISIBILITY
 * ------------------------------------------------------------------- */
let _permCache = null; // { username: {allowed_menus:[], allowed_forms:[]} }

export async function loadPermissionOverrides(force = false) {
  if (_permCache && !force) return _permCache;
  const rows = await fsGetAll(COL.USER_PERMISSIONS);
  _permCache = {};
  rows.forEach(r => { _permCache[r.id] = r; });
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
  const overrides = await loadPermissionOverrides();
  const userOverride = overrides[session.username];

  // Jika HRD sudah menetapkan daftar menu spesifik untuk user ini -> pakai itu (whitelist absolut)
  if (userOverride && Array.isArray(userOverride.allowed_menus) && userOverride.allowed_menus.length) {
    const list = MENU_CONFIG.filter(m => userOverride.allowed_menus.includes(m.id));
    if (!list.some(m => m.id === "dashboard")) {
      const dash = MENU_CONFIG.find(m => m.id === "dashboard");
      if (dash) list.unshift(dash);
    }
    return list;
  }

  // PERBAIKAN: gerbang lama (group === "hrd" -> hanya role persis "HRD") menyebabkan
  // SUPERADMIN & DIREKTUR ter-blokir dari hampir semua menu HRD walau sudah ada di
  // daftar `roles` masing-masing item. Sekarang setiap item dicek langsung terhadap
  // `roles`-nya sendiri (satu sumber kebenaran), `group` murni untuk pengelompokan sidebar.
  const isAtasanRole = await isAtasan(session.nama);

  return MENU_CONFIG.filter(m => {
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

export async function canAccessRoute(routeId, session) {
  const menus = await computeVisibleMenus(session);
  // route yang tidak ada di MENU_CONFIG (mis. sub-halaman) dianggap boleh selama login
  const found = MENU_CONFIG.find(m => (m.route || m.id) === routeId);
  if (!found) return true;
  return menus.some(m => (m.route || m.id) === routeId);
}

/* ---------------------------------------------------------------------
 * RBAC — AKSES FORM PENGAJUAN (Katalog ISO)
 * ------------------------------------------------------------------- */
export async function canAccessForm(formConfig, session) {
  const overrides = await loadPermissionOverrides();
  const userOverride = overrides[session.username];
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

export { MANAJEMEN_ROLES };
