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
export const MENU_CONFIG = [
  // ===================== MENU UTAMA (semua karyawan login) =====================
  { route: "dashboard", label: "Home & Dashboard", icon: "home", group: "all", roles: [] },
  { route: "pengajuan", label: "Buat Pengajuan", icon: "document-add", group: "all", roles: [] },
  { route: "klaim-bensin", label: "Klaim Bensin", icon: "truck", group: "all", roles: ["SALES", "DRIVER", "HELPER", "MANAGER", "DIREKTUR", "SPV", "KOORDINATOR"] },
  { route: "riwayat", label: "Riwayat Pengajuan", icon: "clock", group: "all", roles: [] },

  // ===================== MODUL HRD =====================
  // CATATAN RBAC: base group "hrd" tampil untuk role HRD. Array `roles` di bawah
  // adalah TAMBAHAN eksplisit (SUPERADMIN/DIREKTUR/dll) yang juga dicek satu-per-satu
  // oleh computeVisibleMenus() -- sebelumnya array ini didefinisikan tapi TIDAK PERNAH
  // benar-benar dipakai untuk grup 'hrd', sehingga SUPERADMIN/DIREKTUR/atasan yang
  // seharusnya berhak tidak melihat menu ini. Sudah diperbaiki di computeVisibleMenus().
  { route: "kalender-hr", label: "Kalender HR", icon: "calendar", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR"] },
  { route: "penilaian-kontrak", label: "Penilaian & Kontrak", icon: "star", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR", "MANAGER", "SPV", "KOORDINATOR"] },
  { route: "rekrutmen", label: "Rekrutmen (ATS)", icon: "user-group", group: "hrd", roles: ["SUPERADMIN"] },
  { route: "siklus-karyawan", label: "Siklus Karyawan", icon: "refresh", group: "hrd", roles: ["SUPERADMIN"] },
  { route: "manajemen-cuti", label: "Jatah Cuti Karyawan", icon: "calendar", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR"] },
  { route: "uang-makan", label: "Uang Makan Expedisi", icon: "currency-dollar", group: "hrd", roles: ["SUPERADMIN", "FINANCE", "ACCOUNTING"] },
  { route: "lembur-kasbon", label: "Lembur & Kasbon", icon: "cash", group: "hrd", roles: ["SUPERADMIN", "FINANCE", "ACCOUNTING"] },
  { route: "pemanggilan", label: "Kedisiplinan & SP", icon: "shield-exclamation", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR", "MANAGER"] },
  { route: "inventory", label: "Manajemen Inventory & ATK", icon: "archive", group: "hrd", roles: ["SUPERADMIN", "ADMIN"] },
  { route: "gimmick-sop", label: "Manajemen Gimmick & SOP", icon: "gift", group: "hrd", roles: ["SUPERADMIN", "MARKETING", "DIREKTUR"] },
  { route: "kendaraan", label: "Manajemen Kendaraan", icon: "truck", group: "hrd", roles: ["SUPERADMIN", "GA"] },
  { route: "manajemen-data", label: "Manajemen Data", icon: "database", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR", "FINANCE"] },
  { route: "pengaturan", label: "Akses & Pengguna", icon: "shield-check", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR"] },
  { route: "konfigurasi", label: "Konfigurasi Sistem", icon: "cog", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR"] },

  // ===================== MODUL MANAJEMEN =====================
  // CATATAN: value `route` HARUS SAMA PERSIS dengan nama file di /views/*.html & /js/views/*.js
  // agar router (app.js) tidak 404. Sebelumnya beberapa route salah ketik dan menyebabkan menu
  // "hilang" (link muncul tapi klik-nya error 404 karena file view sebenarnya bernama beda).
  { route: "approval", label: "Antrean Persetujuan", icon: "check-circle", group: "manajemen", roles: ["DIREKTUR", "ACCOUNTING", "KOORDINATOR"] },
  { route: "broadcast", label: "Broadcast Memo", icon: "speakerphone", group: "manajemen", roles: ["SUPERADMIN", "DIREKTUR"] },
  { route: "absensi", label: "Manajemen Absensi", icon: "calendar", group: "manajemen", roles: ["SUPERADMIN", "DIREKTUR"] },
  { route: "cuti", label: "Manajemen Cuti", icon: "calendar", group: "manajemen", roles: ["SUPERADMIN", "DIREKTUR", "KOORDINATOR"] }
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
export function setSession(data, remember = false) {
  const str = JSON.stringify(data);
  sessionStorage.setItem(SESSION_KEY, str);
  if (remember) localStorage.setItem(SESSION_KEY, str);
  else localStorage.removeItem(SESSION_KEY);
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
  // PERBAIKAN: sebelumnya dibandingkan dengan `m.id` yang tidak pernah ada di MENU_CONFIG
  // (field yang benar adalah `m.route`), sehingga override per-personil ini tidak pernah
  // benar-benar bekerja (selalu menghasilkan daftar kosong).
  if (userOverride && Array.isArray(userOverride.allowed_menus) && userOverride.allowed_menus.length) {
    return MENU_CONFIG.filter(m => userOverride.allowed_menus.includes(m.route));
  }

  // SUPERADMIN adalah super-user: selalu melihat seluruh menu tanpa pengecualian.
  if (role === "SUPERADMIN") return [...MENU_CONFIG];

  const isHrd = role === "HRD";
  const isMgmt = MANAJEMEN_ROLES.includes(role) || await isAtasan(session.nama);

  return MENU_CONFIG.filter(m => {
    // PERBAIKAN HAK AKSES: sebelumnya visibilitas menu grup 'hrd'/'manajemen' hanya
    // ditentukan oleh keanggotaan grup (isHrd / isMgmt) dan mengabaikan sama sekali
    // daftar `roles` per-menu -- akibatnya role seperti DIREKTUR, FINANCE, ADMIN, GA,
    // MARKETING, ACCOUNTING, KOORDINATOR yang sudah didaftarkan di `roles` tidak
    // pernah benar-benar mendapat akses. Sekarang `roles` dicek sebagai OR tambahan
    // di luar aturan grup dasar, per menu.
    const explicitRoleMatch = Array.isArray(m.roles) && m.roles.includes(role);
    if (m.group === "all") return true;
    if (m.group === "hrd") return isHrd || explicitRoleMatch;
    if (m.group === "manajemen") return isMgmt || explicitRoleMatch;
    return false;
  });
}

export async function canAccessRoute(routeId, session) {
  const menus = await computeVisibleMenus(session);
  // route yang tidak ada di MENU_CONFIG (mis. sub-halaman) dianggap boleh selama login
  const found = MENU_CONFIG.find(m => m.route === routeId);
  if (!found) return true;
  return menus.some(m => m.route === routeId);
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
