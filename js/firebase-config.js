import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
  Timestamp, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// TAMBAHKAN IMPORT STORAGE DI SINI
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js"; 
// Pastikan versinya (10.7.1) sama dengan versi firebase-app.js yang Anda gunakan di baris atas

const firebaseConfig = {
    apiKey: "AIzaSyB7hYGj4DmellhfggbDbzQdubeL3T8lKHM",
    authDomain: "gen-lang-client-0670613891.firebaseapp.com",
    projectId: "gen-lang-client-0670613891",
    storageBucket: "gen-lang-client-0670613891.firebasestorage.app",
    messagingSenderId: "558851473740",
    appId: "1:558851473740:web:bb87504a9d5f324aec4fe9"
};

export const app = initializeApp(firebaseConfig);
export let messaging = null;

// Cek dulu apakah HP/Browser mendukung notifikasi sebelum menyalakan fiturnya
isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  } else {
    console.log("Firebase Messaging tidak didukung di tab ini (Harus Add to Home Screen).");
  }
}).catch((err) => {
  console.log("Gagal mengecek dukungan messaging:", err);
});
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
}, "ai-studio-ajhris-b3979000-ada8-4821-9f1a-49af228e2acb");

// INISIALISASI STORAGE
export const storage = getStorage(app);

// Helper exports (tambahkan ref, uploadBytes, getDownloadURL)
export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
  Timestamp, increment, ref, uploadBytes, getDownloadURL
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
  REKRUTMEN_PELAMAR: "rekrutmen_pelamar",
  GIMMICK_SOP: "gimmick_sop",
  KALENDER_HR: "kalender_hr_events",
  SIKLUS_KARYAWAN: "siklus_karyawan",
  UANG_MAKAN_EXPEDISI: "uang_makan_expedisi",
  NOTIFICATIONS: "notifications",
  APP_SETTINGS: "app_settings",
  DATA_ABSENSI: "data_absensi",
  LOG_LEMBUR: "log_lembur",
  LOG_KASBON: "log_kasbon",
  DATA_TRAINING: "data_training",
  PERFORMANCE_REVIEW: "performance_review",
  SIGN_DOCUMENTS: "sign_documents"
};
