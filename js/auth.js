/**
 * =====================================================================
 * AUTH.JS — Mesin RBAC ("RBAC Sakti") & Sesi Login
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Alur:
 * 1. login() -> cocokkan username/password (hash SHA-256) ke koleksi `users`
 * 2. Simpan sesi minimal (username, role, nama, nik) ke sessionStorage
 * 3. getMenuConfig() mendefinisikan SELURUH menu sistem + kelompok otoritas
 * 4. computeVisibleMenus() = (menu default sesuai role) DIGABUNG/DITINDIH
 * oleh override per-user dari koleksi `user_permissions` (diatur HRD)
 * 5. canAccessForm(formConfig) untuk kontrol akses Katalog Pengajuan ISO
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
 // KATEGORI: MENU UTAMA
 { id: "dashboard", label: "Dashboard", icon: "home", kategori: "Menu Utama", roles: ["ALL"] },
 { id: "pengajuan", label: "Pengajuan", icon: "doc-plus", kategori: "Menu Utama", roles: ["ALL"] },
 { id: "riwayat", label: "Riwayat", icon: "clock", kategori: "Menu Utama", roles: ["ALL"] },

 // KATEGORI: PERSETUJUAN
 { id: "approval", label: "Persetujuan", icon: "alert", kategori: "Persetujuan", roles: ["HRD", "FINANCE", "SUPERADMIN", "ATASAN"] },
 { id: "broadcast", label: "Memo & Berita", icon: "book", kategori: "Persetujuan", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: KEHADIRAN
 { id: "absensi", label: "Absensi", icon: "clock", kategori: "Kehadiran", roles: ["HRD", "SUPERADMIN"], subMenus: [
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
 { id: "rekrutmen", label: "Rekrutmen", icon: "user-plus", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },
 { id: "penilaian-kontrak", label: "Penilaian Kontrak", icon: "doc-plus", kategori: "Karyawan & Kinerja", roles: ["ALL"], subMenus: [
  { id: "standar_grade", label: "Standar Grade HRD" },
  { id: "template_soal", label: "Template Soal KPI" },
  { id: "distribusi_kpi360", label: "Distribusi Tugas KPI" }
 ] },
 { id: "performance-review", label: "Review Kinerja", icon: "gauge", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN", "MANAGER", "SPV"], subMenus: [
  { id: "semua_review", label: "Semua Review Kinerja" }
 ] },
 { id: "training", label: "Pelatihan", icon: "book", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN", "MANAGER", "SPV"], subMenus: [
  { id: "tna_dashboard", label: "Program Pelatihan" }
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
 { id: "lembur-kasbon", label: "Lembur", icon: "clock", kategori: "Keuangan", roles: ["HRD", "FINANCE", "SUPERADMIN"] },
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
 const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
 return raw ? JSON.parse(raw) : null;
 } catch { return null; }
}
export function setSession(data) {
 try {
 const str = JSON.stringify(data);
 if (str) {
 sessionStorage.setItem(SESSION_KEY, str);
 localStorage.setItem(SESSION_KEY, str);
 }
 } catch (e) {
 console.error("Gagal menyimpan session:", e);
 }
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
 const storedHash = user.password_hash || "";
 const storedPlain = user.password || "";
 const matchedViaHash = storedHash && storedHash === inputHash;
 const matchedViaPlain = !matchedViaHash && storedPlain && storedPlain === password;
 if (!matchedViaHash && !matchedViaPlain) throw new Error("Password salah.");

 // Kalau field plaintext masih ada di dokumen ini (akun lama/migrasi),
 // hapus permanen sekarang & pastikan password_hash tersimpan benar.
 if (storedPlain) {
 try {
 await updateDoc(doc(db, COL.USERS, uname), {
 password_hash: inputHash,
 password: ""
 });
 } catch (e) {
 console.warn("Gagal migrasi hash password saat login:", e);
 }
 }

 let karyawan = null;
 if (user.nik) {
 const kSnap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(user.nik)));
 if (kSnap.exists()) karyawan = kSnap.data();
 }

 const session = {
 id: user.id || snap.id || uname,
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
 id: user.id || snap.id || uname,
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
 const userOverride = await _findUserOverride(session);

 // Jika HRD sudah menetapkan daftar menu spesifik untuk user ini -> pakai itu (whitelist absolut)
 if (userOverride && (userOverride.allowed_menus_set || (Array.isArray(userOverride.allowed_menus) && userOverride.allowed_menus.length > 0))) {
  const allowed = userOverride.allowed_menus || [];
  const list = MENU_CONFIG.filter(m => allowed.includes(m.id));
  if (!list.some(m => m.id === "dashboard")) {
   const dash = MENU_CONFIG.find(m => m.id === "dashboard");
   if (dash) list.unshift(dash);
  }
  return list;
 }

 const isAtasanRole = await isAtasan(session.nama);
 const isManagementOrHrd = ["HRD", "SUPERADMIN", "DIREKTUR", "MANAGER", "SPV", "KOORDINATOR", "GM", "FINANCE", "GA", "BRANCH MANAGER"].includes(role) || isAtasanRole;

 // Sesuai instruksi: Untuk role karyawan default (tanpa custom override HRD), menu yang tertampil HANYA Dashboard, Penilaian, dan Reimbursement
 if (!isManagementOrHrd || role === "KARYAWAN" || role === "STAFF") {
 return [
 MENU_CONFIG.find(m => m.id === "dashboard") || { id: "dashboard", label: "Home & Dashboard", icon: "home", kategori: "Menu Utama" },
 { id: "penilaian-kontrak", route: "penilaian-kontrak", label: "Penilaian & Kontrak", icon: "doc-plus", kategori: "Menu Utama" },
 { id: "reimbursement", route: "reimbursement", label: "Reimbursement", icon: "wallet", kategori: "Keuangan & Operasional" }
 ];
 }

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

const _MANAGEMENT_ROLES = ["HRD", "SUPERADMIN", "DIREKTUR", "MANAGER", "SPV", "KOORDINATOR", "GM", "FINANCE", "GA", "BRANCH MANAGER"];

function _permOverrideSearchKeys(session) {
 if (!session) return [];
 const raw = [session.username, session.id, session.nik, session.nama].filter(Boolean);
 const keysSet = new Set();
 raw.forEach(k => {
  const s = String(k).trim();
  if (!s) return;
  keysSet.add(s);
  keysSet.add(s.toLowerCase());
  keysSet.add(s.toUpperCase());
 });
 return Array.from(keysSet);
}

async function _findUserOverride(session) {
 const overrides = await loadPermissionOverrides(true);
 const keys = _permOverrideSearchKeys(session);
 for (const k of keys) { if (overrides[k]) return overrides[k]; }
 return null;
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
 // Semua role berhak mengakses route absensi, penilaian/kontrak & reimbursement
 if (targetId === "absensi" || targetId === "absensi-saya" || targetId === "penilaian" || targetId === "penilaian-kontrak" || targetId === "kontrak" || targetId === "reimbursement") return true;

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

export { MANAJEMEN_ROLES };
