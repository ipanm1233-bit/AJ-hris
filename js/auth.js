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
  // ===================== MENU UTAMA (semua role yang login) =====================
  { id: "dashboard", route: "dashboard", label: "Home & Dashboard", icon: "home", group: "all", roles: [] },
  { id: "pengajuan", route: "pengajuan", label: "Buat Pengajuan", icon: "document-add", group: "all", roles: [] },
  { id: "klaim-bensin", route: "klaim-bensin", label: "Klaim Bensin", icon: "truck", group: "all", roles: ["SALES", "DRIVER", "HELPER", "MANAGER", "DIREKTUR", "SPV", "KOORDINATOR", "SUPERADMIN"] },
  { id: "riwayat", route: "riwayat", label: "Riwayat Pengajuan", icon: "clock", group: "all", roles: [] },

  // ===================== MODUL HRD =====================
  { id: "kalender-hr", route: "kalender-hr", label: "Kalender HR", icon: "calendar", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR"] },
  { id: "penilaian-kontrak", route: "penilaian-kontrak", label: "Penilaian & Kontrak", icon: "star", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR", "MANAGER", "SPV", "KOORDINATOR"] },
  { id: "rekrutmen", route: "rekrutmen", label: "Rekrutmen (ATS)", icon: "user-group", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR"] },
  { id: "siklus-karyawan", route: "siklus-karyawan", label: "Siklus Karyawan", icon: "refresh", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR"] },
  { id: "manajemen-cuti", route: "manajemen-cuti", label: "Jatah Cuti Karyawan", icon: "calendar", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR"] },
  { id: "uang-makan", route: "uang-makan", label: "Uang Makan Expedisi", icon: "currency-dollar", group: "hrd", roles: ["HRD", "SUPERADMIN", "FINANCE", "ACCOUNTING"] },
  { id: "lembur-kasbon", route: "lembur-kasbon", label: "Lembur & Kasbon", icon: "cash", group: "hrd", roles: ["HRD", "SUPERADMIN", "FINANCE", "ACCOUNTING"] },
  { id: "pemanggilan", route: "pemanggilan", label: "Kedisiplinan & SP", icon: "shield-exclamation", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR", "MANAGER"] },
  { id: "inventory", route: "inventory", label: "Manajemen Inventory & ATK", icon: "archive", group: "hrd", roles: ["HRD", "SUPERADMIN", "ADMIN"] },
  { id: "gimmick-sop", route: "gimmick-sop", label: "Manajemen Gimmick & SOP", icon: "gift", group: "hrd", roles: ["HRD", "SUPERADMIN", "MARKETING", "DIREKTUR"] },
  { id: "kendaraan", route: "kendaraan", label: "Manajemen Kendaraan", icon: "truck", group: "hrd", roles: ["HRD", "SUPERADMIN", "GA"] },
  { id: "manajemen-data", route: "manajemen-data", label: "Manajemen Data", icon: "database", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR", "FINANCE"] },
  { id: "pengaturan", route: "pengaturan", label: "Akses & Pengguna", icon: "shield-check", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR", "HRD"] },
  { id: "konfigurasi", route: "konfigurasi", label: "Konfigurasi Sistem", icon: "cog", group: "hrd", roles: ["SUPERADMIN", "DIREKTUR", "HRD"] },
  { id: "form-builder", route: "form-builder", label: "Form Builder", icon: "doc-plus", group: "hrd", roles: ["HRD", "SUPERADMIN", "DIREKTUR"] },

  // ===================== MODUL MANAJEMEN =====================
  // CATATAN: value `route` HARUS SAMA PERSIS dengan nama file di /views/*.html & /js/views/*.js
  // agar router (app.js) tidak 404.
  { id: "approval", route: "approval", label: "Antrean Persetujuan", icon: "check-circle", group: "manajemen", roles: ["MANAGER", "HRD", "SUPERADMIN", "DIREKTUR", "FINANCE", "ACCOUNTING", "SPV", "KOORDINATOR"] },
  { id: "broadcast", route: "broadcast", label: "Broadcast Memo", icon: "speakerphone", group: "manajemen", roles: ["HRD", "SUPERADMIN", "DIREKTUR"] },
  { id: "absensi", route: "absensi", label: "Manajemen Absensi", icon: "calendar", group: "manajemen", roles: ["HRD", "SUPERADMIN", "DIREKTUR"] },
  { id: "cuti", route: "cuti", label: "Manajemen Cuti", icon: "calendar", group: "manajemen", roles: ["HRD", "SUPERADMIN", "DIREKTUR", "MANAGER", "SPV", "KOORDINATOR"] }
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
  if (userOverride && Array.isArray(userOverride.allowed_menus) && userOverride.allowed_menus.length) {
    return MENU_CONFIG.filter(m => userOverride.allowed_menus.includes(m.id));
  }

  // PERBAIKAN: gerbang lama (group === "hrd" -> hanya role persis "HRD") menyebabkan
  // SUPERADMIN & DIREKTUR ter-blokir dari hampir semua menu HRD walau sudah ada di
  // daftar `roles` masing-masing item. Sekarang setiap item dicek langsung terhadap
  // `roles`-nya sendiri (satu sumber kebenaran), `group` murni untuk pengelompokan sidebar.
  const isAtasanRole = await isAtasan(session.nama);

  return MENU_CONFIG.filter(m => {
    if (m.group === "all") return true;
    if (!m.roles || m.roles.length === 0) return true;
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

  // PERBAIKAN: Mengamankan konversi String ke Array jika data tersimpan sebagai teks
  let allowedUsers = formConfig.allowed_users || [];
  if (typeof allowedUsers === "string") {
    allowedUsers = allowedUsers.split(",").map(u => u.trim());
  }
  
  let allowedRules = formConfig.allowed_rules || [];
  if (typeof allowedRules === "string") {
    allowedRules = allowedRules.split(",").map(r => r.trim());
  }
  
  allowedRules = allowedRules.map(r => r.toUpperCase());

  if (allowedUsers.includes("ALL")) return true;
  if (allowedUsers.some(u => u.toUpperCase() === session.nama.toUpperCase())) return true;
  if (allowedRules.includes(session.role.toUpperCase())) return true;
  if (session.role.toUpperCase() === "HRD") return true; // HRD selalu bisa lihat semua form
  
  return false;
}

export { MANAJEMEN_ROLES };
