import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
 initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
 collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
 query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
 Timestamp, increment, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// TAMBAHKAN IMPORT STORAGE DI SINI
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { getMessaging, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js"; 
// Pastikan versinya (10.7.1) sama dengan versi firebase-app.js yang Anda gunakan di baris atas

let firebaseConfig = {
 apiKey: "AIzaSyB7hYGj4DmellhfggbDbzQdubeL3T8lKHM",
 authDomain: "gen-lang-client-0670613891.firebaseapp.com",
 projectId: "gen-lang-client-0670613891",
 storageBucket: "gen-lang-client-0670613891.firebasestorage.app",
 messagingSenderId: "558851473740",
 appId: "1:558851473740:web:bb87504a9d5f324aec4fe9"
};

let customDbId = undefined;

try {
 const resp = await fetch("/firebase-applet-config.json");
 if (resp.ok) {
 const config = await resp.json();
 if (config && config.apiKey && config.projectId) {
 firebaseConfig = config;
 if (config.firestoreDatabaseId) {
 customDbId = config.firestoreDatabaseId;
 }
 }
 }
} catch (e) {
 console.warn("Using fallback firebase config:", e);
}

export const app = initializeApp(firebaseConfig);
export { firebaseConfig };
export let messaging = null;

// Cek dulu apakah HP/Browser mendukung notifikasi sebelum menyalakan fiturnya
isSupported().then((supported) => {
 if (supported) {
 messaging = getMessaging(app);

 // PENTING: onBackgroundMessage di firebase-messaging-sw.js HANYA menangani
 // notifikasi saat tab tidak aktif/browser diminimize. Saat tab HRIS sedang
 // dibuka & difokus (foreground), pesan FCM TIDAK otomatis tampil kecuali
 // ditangkap manual di sini lewat onMessage().
 onMessage(messaging, (payload) => {
 const title = (payload.notification && payload.notification.title) || "HRIS Andela Jaya";
 const body = (payload.notification && payload.notification.body) || "Ada pembaruan baru.";
 const link = payload.data ? payload.data.link : "";

 if (typeof Notification !== "undefined" && Notification.permission === "granted") {
 const n = new Notification(title, { body, icon: "/assets/icon-192x192.png" });
 n.onclick = () => {
 window.focus();
 if (link) {
 window.location.hash = link.startsWith("#") ? link : "#" + link;
 }
 n.close();
 };
 }
 });
 } else {
 console.log("Firebase Messaging tidak didukung di tab ini (Harus Add to Home Screen).");
 }
}).catch((err) => {
 console.log("Gagal mengecek dukungan messaging:", err);
});

export const db = customDbId 
 ? initializeFirestore(app, { localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()}) }, customDbId)
 : initializeFirestore(app, { localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()}) });

// INISIALISASI STORAGE
export const storage = getStorage(app);

// Helper exports (tambahkan ref, uploadBytes, getDownloadURL)
export {
 collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
 query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
 Timestamp, increment, ref, uploadBytes, getDownloadURL, arrayUnion
};

// Daftar Koleksi
export const COL = {
 USERS: "users",
 USER_PERMISSIONS: "user_permissions",
 MASTER_KARYAWAN: "master_karyawan",
 MASTER_CUTI: "master_cuti",
 MASTER_KENDARAAN: "master_kendaraan",
 MASTER_INVENTORY: "master_inventory",
 MASTER_KONTRAK: "master_kontrak",
 MASTER_SOAL_KPI: "master_soal_kpi",
 FORM_CONFIG: "form_config",
 DATA_PENGAJUAN: "data_pengajuan",
 BROADCAST: "broadcast",
 LOG_SP_KONSELING: "log_sp_konseling",
 DATA_PEMANGGILAN: "data_pemanggilan",
 LOG_PENILAIAN_KPI: "log_penilaian_kpi",
 TUGAS_KPI_360: "tugas_kpi_360",
 LOG_KENDARAAN_FUEL: "log_kendaraan_fuel",
 LOG_KENDARAAN_SERVICE: "log_kendaraan_service",
 LOG_KENDARAAN_COMPLIANCE: "log_kendaraan_compliance",
 LOG_INVENTORY_PENGAMBILAN: "log_inventory_pengambilan",
 STOCK_OPNAME: "stock_opname",
 EVALUASI_KONTRAK: "evaluasi_kontrak",
 LOG_OFFBOARDING: "log_offboarding",
 KONFIGURASI_EMAIL: "konfigurasi_email",
 REKRUTMEN_PELAMAR: "pelamar_ats",
 DATA_REKRUTMEN: "data_rekrutmen",
 PELAMAR: "pelamar_ats",
 ATS_VACANCIES: "data_rekrutmen",
 ATS_CANDIDATES: "pelamar_ats",
 ATS_INTERVIEWS: "ats_interviews",
 ATS_RULES: "ats_rules",
 ATS_STATUS_HISTORY: "ats_status_history",
 GIMMICK_SOP: "gimmick_sop",
 KALENDER_HR: "kalender_hr_events",
 SIKLUS_KARYAWAN: "siklus_karyawan",
 UANG_MAKAN_EXPEDISI: "uang_makan_expedisi",
 NOTIFICATIONS: "notifications",
 APP_SETTINGS: "app_settings",
 DATA_ABSENSI: "data_absensi",
 LOG_LEMBUR: "log_lembur",
 OVERTIME_ORDERS: "overtime_orders",
 OVERTIME_PROPOSALS: "overtime_proposals",
 OVERTIME_APPROVALS: "overtime_approvals",
 OVERTIME_REALIZATIONS: "overtime_realizations",
 OVERTIME_CALCULATIONS: "overtime_calculation_details",
 OVERTIME_AUDIT_LOGS: "overtime_audit_logs",
 OVERTIME_PAYROLL_BATCHES: "overtime_payroll_batches",
 OVERTIME_SETTINGS: "overtime_settings",
 LOG_KASBON: "log_kasbon",
 DATA_TRAINING: "data_training",
 PERFORMANCE_REVIEW: "performance_review",
 SIGN_DOCUMENTS: "sign_documents",
 TARGET_BULANAN_KPI: "target_bulanan_kpi",
 LOG_PENILAIAN_HARIAN: "log_penilaian_harian",
 MASTER_REIMBURSEMENT_TYPE: "master_reimbursement_type",
 DATA_REIMBURSEMENT: "data_reimbursement",
  HR_CASES: "hr_cases",
  HR_CASE_ACTION_PLANS: "hr_case_action_plans",
  HR_CASE_FOLLOWUPS: "hr_case_followups",
  HR_CASE_AUDIT_LOGS: "hr_case_audit_logs"
};
