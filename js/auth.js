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
 // KATEGORI: MENU UTAMA & PERSONAL
 { id: "dashboard", label: "Home & Dashboard", icon: "home", kategori: "Menu Utama & Personal", roles: ["ALL"] },
 { id: "pengajuan", label: "Buat Pengajuan (Form ISO)", icon: "doc-plus", kategori: "Menu Utama & Personal", roles: ["ALL"] },
 { id: "riwayat", label: "Riwayat Pengajuan Saya", icon: "clock", kategori: "Menu Utama & Personal", roles: ["ALL"] },

 // KATEGORI: PERSETUJUAN & MEMO
 { id: "approval", label: "Antrean Persetujuan", icon: "alert", kategori: "Persetujuan & Memo", roles: ["HRD", "FINANCE", "SUPERADMIN", "ATASAN"] },
 { id: "broadcast", label: "Broadcast & Memo Perusahaan", icon: "book", kategori: "Persetujuan & Memo", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: KEHADIRAN & PERIZINAN
 { id: "absensi", label: "Manajemen Absensi", icon: "clock", kategori: "Kehadiran & Perizinan", roles: ["HRD", "SUPERADMIN"] },
 { id: "pengajuan-cuti", label: "Pengajuan Cuti Personal", icon: "calendar", kategori: "Kehadiran & Perizinan", roles: ["ALL"] },
 { id: "cuti", label: "Manajemen Cuti Karyawan", icon: "calendar", kategori: "Kehadiran & Perizinan", roles: ["HRD", "SUPERADMIN"] },
 { id: "izin", label: "Pengajuan & Surat Izin", icon: "doc-plus", kategori: "Kehadiran & Perizinan", roles: ["ALL"] },
 { id: "kalender-hr", label: "Kalender HR & Hari Libur", icon: "calendar", kategori: "Kehadiran & Perizinan", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: KARYAWAN & KINERJA
 { id: "siklus-karyawan", label: "Siklus & Master Karyawan", icon: "refresh", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },
 { id: "rekrutmen", label: "Rekrutmen (ATS)", icon: "user-plus", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },
 { id: "penilaian-kontrak", label: "Penilaian & Kontrak (SPK)", icon: "doc-plus", kategori: "Karyawan & Kinerja", roles: ["ALL"] },
 { id: "performance-review", label: "Review Kinerja & KPI", icon: "gauge", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN", "MANAGER", "SPV"] },
 { id: "training", label: "Pelatihan & TNA", icon: "book", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN", "MANAGER", "SPV"] },
 { id: "pemanggilan", label: "Kedisiplinan & SP", icon: "alert", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },
 { id: "dokumen", label: "Draft & Builder Dokumen", icon: "doc-plus", kategori: "Karyawan & Kinerja", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: KEUANGAN & KLAIM
 { id: "reimbursement", label: "Manajemen Reimbursement", icon: "wallet", kategori: "Keuangan & Klaim", roles: ["ALL"] },
 { id: "pengajuan-kasbon", label: "Pengajuan Kasbon Personal", icon: "wallet", kategori: "Keuangan & Klaim", roles: ["ALL"] },
 { id: "klaim-bensin", label: "Klaim Bensin Operasional", icon: "wallet", kategori: "Keuangan & Klaim", roles: ["ALL"] },
 { id: "lembur-kasbon", label: "Lembur & Kasbon Operasional", icon: "wallet", kategori: "Keuangan & Klaim", roles: ["HRD", "FINANCE", "SUPERADMIN"] },
 { id: "uang-makan", label: "Uang Makan Expedisi", icon: "utensils", kategori: "Keuangan & Klaim", roles: ["HRD", "FINANCE", "SUPERADMIN"] },

 // KATEGORI: OPERASIONAL & ASET
 { id: "inventory", label: "Inventaris & Belanja ATK", icon: "box", kategori: "Operasional & Aset", roles: ["HRD", "GA", "SUPERADMIN"] },
 { id: "kendaraan", label: "Manajemen Kendaraan", icon: "truck", kategori: "Operasional & Aset", roles: ["HRD", "GA", "SUPERADMIN"] },
 { id: "gimmick-sop", label: "Gimmick & SOP", icon: "book", kategori: "Operasional & Aset", roles: ["HRD", "SUPERADMIN"] },

 // KATEGORI: MODUL SALES
 { id: "sales-order", label: "Order Penjualan", icon: "wallet", kategori: "Modul Sales", roles: ["ALL"] },
 { id: "sales-outlet", label: "Master Outlet", icon: "user-plus", kategori: "Modul Sales", roles: ["ALL"] },
 { id: "sales-item", label: "Master Item Sales", icon: "box", kategori: "Modul Sales", roles: ["ALL"] },
 { id: "sales-task", label: "Tugas & Kunjungan Sales", icon: "clock", kategori: "Modul Sales", roles: ["ALL"] },
 { id: "sales-track", label: "Summary & Tracking Sales", icon: "layers", kategori: "Modul Sales", roles: ["ALL"] },

 // KATEGORI: PENGATURAN SISTEM
 { id: "manajemen-data", label: "Manajemen Data & Backup", icon: "database", kategori: "Pengaturan Sistem", roles: ["HRD", "SUPERADMIN"] },
 { id: "pengaturan", label: "Hak Akses & Pengguna", icon: "user-plus", kategori: "Pengaturan Sistem", roles: ["HRD", "SUPERADMIN"] },
 { id: "konfigurasi", label: "Konfigurasi Aturan Bisnis", icon: "layers", kategori: "Pengaturan Sistem", roles: ["HRD", "SUPERADMIN"] },
 { id: "form-builder", label: "Form Builder ISO", icon: "doc-plus", kategori: "Pengaturan Sistem", roles: ["HRD", "SUPERADMIN"] }
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
