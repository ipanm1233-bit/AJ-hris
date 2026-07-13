/**
 * =====================================================================
 * FIREBASE CONFIGURATION — Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * GANTI seluruh nilai di bawah ini dengan kredensial proyek Firebase
 * Anda sendiri. Dapatkan dari: Firebase Console > Project Settings >
 * General > Your apps > SDK setup and configuration.
 *
 * File ini di-load sebagai <script type="module"> dan mengekspor
 * instance `db` (Firestore) serta `auth` (jika suatu saat migrasi ke
 * Firebase Authentication) agar bisa dipakai ulang oleh seluruh modul
 * lain cukup dengan:
 *   import { db } from '../firebase-config.js';
 * =====================================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  increment,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// -----------------------------------------------------------------
// GANTI DENGAN KONFIGURASI PROYEK FIREBASE ANDA
// -----------------------------------------------------------------
const firebaseConfig = {
  apiKey: "GANTI_DENGAN_API_KEY_ANDA",
  authDomain: "GANTI-PROJECT-ID.firebaseapp.com",
  projectId: "GANTI-PROJECT-ID",
  storageBucket: "GANTI-PROJECT-ID.appspot.com",
  messagingSenderId: "GANTI_SENDER_ID",
  appId: "GANTI_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Aktifkan cache offline agar navigasi antar-menu tetap instan walau
// koneksi terputus sesaat (opsional tapi direkomendasikan untuk SPA).
try {
  enableIndexedDbPersistence(db).catch(() => {
    /* multi-tab / unsupported browser — abaikan, aplikasi tetap jalan online */
  });
} catch (e) { /* no-op */ }

// Re-export helper Firestore yang sering dipakai supaya modul lain
// tinggal import dari satu file ini saja.
export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
  Timestamp, increment
};

// -----------------------------------------------------------------
// Daftar nama koleksi Firestore — SATU SUMBER KEBENARAN.
// Jangan hardcode string nama koleksi di file lain, selalu import COL.
// -----------------------------------------------------------------
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
  APP_SETTINGS: "app_settings"
};
