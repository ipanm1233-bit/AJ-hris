import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  initializeFirestore, // Menggunakan inisialisasi modern
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
  Timestamp, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBAAUHaqYrzTp6wi1PDYkrKY0IWI2XQoVw",
    authDomain: "andela-hris-bc9ed.firebaseapp.com",
    projectId: "andela-hris-bc9ed",
    storageBucket: "andela-hris-bc9ed.firebasestorage.app",
    messagingSenderId: "718041616100",
    appId: "1:718041616100:web:cde303edb932b25ae826f1"
};

export const app = initializeApp(firebaseConfig);

// SOLUSI MULTI-TAB FIREBASE ERROR
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

// Helper exports
export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
  Timestamp, increment
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
  DATA_ABSENSI: "data_absensi"
};
