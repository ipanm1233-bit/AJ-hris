/**
 * =====================================================================
 * AI-CONFIG.JS — Sumber tunggal konfigurasi AI Gemini untuk seluruh sistem
 * (dipakai oleh Rekrutmen/ATS untuk analisa CV & Gimmick/SOP untuk generate
 * flowchart). Single source of truth — ganti API key/model DI SINI SAJA.
 *
 * ADA 2 MASALAH YANG DITEMUKAN & DIPERBAIKI DI FILE INI:
 *
 * 1) NAMA MODEL SUDAH MATI (404): Kode lama memanggil "gemini-1.5-flash".
 * Per Juli 2026, SELURUH model Gemini 1.0 dan 1.5 sudah resmi
 * di-shutdown oleh Google — setiap request ke model ini otomatis
 * balas error 404, apapun API key-nya. Diganti ke alias
 * "gemini-flash-latest" yang otomatis mengikuti model stabil terbaru
 * dari Google, supaya tidak mati lagi tiap kali Google pensiunkan model.
 *
 * 2) FORMAT API KEY MENCURIGAKAN: Key yang tersimpan di kode lama diawali
 * "AQ." (bukan "AIzaSy..." seperti key Gemini pada umumnya). Google
 * sedang bermasalah dengan sebagian akun yang HANYA bisa generate key
 * format baru ini ("Auth key"), dan per laporan resmi di forum
 * developer Google (ai.google.dev/discuss, Juni-Juli 2026), key
 * berformat "AQ." ini SERING ditolak (401 UNAUTHENTICATED /
 * ACCESS_TOKEN_TYPE_UNSUPPORTED) saat dipanggil langsung ke endpoint
 * generativelanguage.googleapis.com seperti yang dipakai di sistem ini.
 * => Solusi: buka https://aistudio.google.com/apikey, buat API key baru,
 * dan PASTIKAN key yang di-copy diawali "AIzaSy...". Kalau akun Anda
 * cuma bisa generate key "AQ.", coba buat project Google Cloud baru,
 * atau laporkan ke forum Google AI Developer (banyak developer lain
 * mengalami hal sama dan sedang menunggu perbaikan dari pihak Google).
 * ------------------------------------------------------------------- */

import { authFetch } from "./api-client.js";

// API Key dikelola aman via GEMINI_API_KEY di server-side (.env / Settings)
export const GEMINI_API_KEY = "";

// Alias model default untuk Gemini
export const GEMINI_MODEL = "gemini-3.6-flash";

export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Cek cepat apakah API key yang terpasang kemungkinan besar TIDAK akan
 * berfungsi untuk panggilan REST langsung (lihat catatan masalah #2 di atas).
 */
export function isLikelyBrokenKeyFormat(key) {
 return !key || !key.startsWith("AIzaSy");
}

/**
 * Helper terpusat untuk memanggil Gemini generateContent.
 * Menggunakan server-side endpoint /api/gemini agar API key aman di server.
 * @param {string} prompt
 * @returns {Promise<string>} teks mentah hasil respons Gemini
 */
export async function callGemini(prompt) {
  // 1. Panggil server-side endpoint /api/gemini terlebih dahulu (Aman & Standar AI Studio)
  try {
    const serverResp = await authFetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model: GEMINI_MODEL })
    });
    const serverData = await serverResp.json();
    if (serverResp.ok && serverData && serverData.success && serverData.text) {
      return serverData.text;
    }
    if (!serverResp.ok && serverData && serverData.error) {
      // Jika server memberikan error eksplisit (misal GEMINI_API_KEY belum diset)
      if (!GEMINI_API_KEY) {
        throw new Error(serverData.error);
      }
    }
  } catch (e) {
    if (!GEMINI_API_KEY) {
      throw e;
    }
    console.warn("[AI Gemini] Server route failed, falling back to direct REST client:", e);
  }

  // 2. Fallback ke Direct Client REST jika GEMINI_API_KEY diset di client
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di server (.env).");
  }

  if (isLikelyBrokenKeyFormat(GEMINI_API_KEY)) {
    console.warn("[AI Gemini] Format API key tidak diawali 'AIzaSy' — kemungkinan besar akan ditolak Google (401).");
  }

  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
  } catch (networkErr) {
    throw new Error("Gagal menghubungi server Gemini (kemungkinan masalah koneksi internet atau domain generativelanguage.googleapis.com diblokir jaringan Anda).");
  }

  if (!response.ok) {
    let errData = null;
    try { errData = await response.json(); } catch { /* ignore */ }
    const rawMsg = errData?.error?.message || `HTTP ${response.status}`;

    if (response.status === 401 || /ACCESS_TOKEN_TYPE_UNSUPPORTED|API key not valid/i.test(rawMsg)) {
      throw new Error(`API Key Gemini ditolak Google (${rawMsg}). Buat API key baru di aistudio.google.com/apikey dan pastikan diawali "AIzaSy...".`);
    }
    if (response.status === 404) {
      throw new Error(`Model AI tidak ditemukan (${rawMsg}). Model mungkin sudah dipensiunkan Google — cek js/ai-config.js.`);
    }
    if (response.status === 429) {
      throw new Error("Kuota AI Gemini harian/menit sudah habis (429). Coba lagi beberapa saat lagi.");
    }
    throw new Error(`Gemini error: ${rawMsg}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Respons AI kosong / tidak terduga. Coba ulangi beberapa saat lagi.");
  return text;
}

/** Sama seperti callGemini(), tapi otomatis membersihkan pagar ```json dan parse ke object. */
export async function callGeminiJSON(prompt) {
 const raw = await callGemini(prompt);
 const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
 try {
 return JSON.parse(cleaned);
 } catch {
 throw new Error("AI memberikan respons yang tidak valid sebagai JSON. Coba ulangi.");
 }
}
