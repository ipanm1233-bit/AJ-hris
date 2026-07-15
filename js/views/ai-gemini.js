/**
 * =====================================================================
 * AI-GEMINI.JS — Konektor Terpusat AI Google Gemini
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * SEBELUM PERBAIKAN INI: setiap modul (Rekrutmen, Gimmick & SOP) punya
 * API Key dan endpoint sendiri-sendiri yang di-hardcode di source code,
 * memakai model lama "gemini-1.5-flash" (berisiko deprecated) dan tidak
 * bisa diganti tanpa deploy ulang.
 *
 * SETELAH PERBAIKAN: SATU sumber kebenaran untuk seluruh integrasi AI.
 * Konfigurasi (API Key & pilihan model) disimpan di Firestore
 * (app_settings/main.gemini) dan diatur lewat menu
 * "Konfigurasi Sistem -> Konfigurasi AI Gemini" oleh SUPERADMIN/DIREKTUR/HRD,
 * sehingga key bisa dirotasi kapan saja tanpa perlu edit kode / deploy ulang.
 *
 * CATATAN ARSITEKTUR (harap dibaca oleh admin):
 * Karena aplikasi ini adalah SPA statis murni (tanpa server backend),
 * API Key yang dipakai di sini TETAP akan terlihat oleh browser client
 * (sama seperti Firebase API Key). Menyimpannya di Firestore config
 * (dibanding hardcode di source/GitHub) tetap jauh lebih baik karena:
 *   1. Tidak tersimpan permanen di riwayat Git / source control publik.
 *   2. Bisa dirotasi instan dari UI kalau key bocor/dipakai berlebihan.
 *   3. Satu tempat untuk audit & update, tidak tercecer di banyak file.
 * Untuk keamanan kelas produksi penuh, sebaiknya panggilan Gemini
 * dipindah ke Cloud Function / server proxy agar key tidak pernah
 * terekspos ke client sama sekali.
 * ------------------------------------------------------------------- */
import { db, COL, doc, getDoc } from "./firebase-config.js";

// Model default yang didukung (per Juli 2026). "flash" = cepat & murah,
// dipakai sebagai default untuk seluruh modul (analisa CV, flowchart, dst).
export const GEMINI_MODELS = {
  FLASH: "gemini-2.5-flash",
  FLASH_LITE: "gemini-2.5-flash-lite",
  PRO: "gemini-2.5-pro"
};
const DEFAULT_MODEL = GEMINI_MODELS.FLASH;

let _cfgCache = null;

/** Muat konfigurasi Gemini dari Firestore (di-cache di memori selama sesi berjalan). */
export async function loadGeminiConfig(force = false) {
  if (_cfgCache && !force) return _cfgCache;
  try {
    const snap = await getDoc(doc(db, COL.APP_SETTINGS, "main"));
    const gemini = (snap.exists() && snap.data().gemini) || {};
    _cfgCache = {
      apiKey: gemini.api_key || "",
      model: gemini.model || DEFAULT_MODEL,
      active: gemini.active !== false // default aktif jika belum pernah diatur
    };
  } catch (e) {
    console.error("Gagal memuat konfigurasi Gemini:", e);
    _cfgCache = { apiKey: "", model: DEFAULT_MODEL, active: true };
  }
  return _cfgCache;
}

/** Bersihkan cache config (dipanggil setelah Konfigurasi Sistem menyimpan perubahan). */
export function invalidateGeminiConfigCache() {
  _cfgCache = null;
}

/**
 * Panggil Gemini generateContent dengan prompt teks biasa.
 * @param {string} prompt
 * @param {object} opts { model?: string, jsonMode?: boolean }
 * @returns {Promise<string>} teks respon mentah dari model (belum di-parse JSON)
 */
export async function callGemini(prompt, opts = {}) {
  const cfg = await loadGeminiConfig();

  if (!cfg.active) {
    throw new Error("Fitur AI Gemini sedang dinonaktifkan oleh Admin di Konfigurasi Sistem.");
  }
  if (!cfg.apiKey) {
    throw new Error("API Key Gemini belum diatur. Silakan atur di menu Konfigurasi Sistem -> Konfigurasi AI Gemini.");
  }

  const model = opts.model || cfg.model || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;

  const body = { contents: [{ parts: [{ text: prompt }] }] };
  if (opts.jsonMode) {
    body.generationConfig = { responseMimeType: "application/json" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let msg = `HTTP Error ${response.status}`;
    try {
      const errData = await response.json();
      msg = errData.error?.message || msg;
    } catch { /* ignore parse error */ }
    if (response.status === 400 && /API key/i.test(msg)) {
      msg = "API Key Gemini tidak valid. Silakan periksa kembali di Konfigurasi Sistem.";
    }
    if (response.status === 404) {
      msg = `Model "${model}" tidak ditemukan / sudah tidak didukung. Silakan ganti model di Konfigurasi Sistem.`;
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini tidak mengembalikan respon (kemungkinan diblokir filter keamanan konten).");
  return text;
}

/** Sama seperti callGemini, tapi otomatis mem-parse hasilnya sebagai JSON (menghapus fence markdown jika ada). */
export async function callGeminiJson(prompt, opts = {}) {
  const raw = await callGemini(prompt, { ...opts, jsonMode: true });
  const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Gagal membaca respon AI sebagai JSON. Coba ulangi beberapa saat lagi.");
  }
}

/** Uji koneksi + validitas API Key — dipakai oleh tombol "Tes Koneksi" di Konfigurasi Sistem. */
export async function testGeminiConnection(apiKey, model) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Balas dengan satu kata: OK" }] }] })
  });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try { const e = await response.json(); msg = e.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  return true;
}
