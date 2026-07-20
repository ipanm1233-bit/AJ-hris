/**
 * =====================================================================
 * GAS-INTEGRATION.JS — Sumber tunggal konfigurasi & helper untuk
 * integrasi Google Apps Script (GAS) Web App. Dipakai untuk 2 hal:
 *
 * 1) GENERATE DOKUMEN CUTI DARI TEMPLATE RESMI
 *    Sebelumnya form cuti dicetak dari HTML rakitan sendiri (lihat
 *    printCutiPdf di js/views/cuti.js) sehingga TIDAK 100% identik
 *    dengan template resmi perusahaan (font, spasi, posisi kop, dll
 *    sulit dicocokkan piksel-per-piksel lewat CSS print). Solusinya:
 *    salin LANGSUNG template Google Docs asli, isi placeholder
 *    {{...}} yang sudah ada di dalamnya, lalu export ke PDF. Hasilnya
 *    dijamin identik karena memakai file Google Docs aslinya.
 *
 * 2) UPLOAD LAMPIRAN KE GOOGLE DRIVE
 *    Sebelumnya lampiran (LPJ, Broadcast Memo, dll) diupload ke
 *    Firebase Storage. Sekarang dialihkan ke Google Drive lewat Web
 *    App yang sama, supaya semua dokumen perusahaan (form cuti +
 *    lampiran) terkumpul di satu tempat yang gampang diaudit oleh HRD.
 *
 * CARA SETUP (WAJIB dilakukan manual, lihat panduan lengkap terpisah):
 *   1. Deploy script Code.gs sebagai Web App di script.google.com
 *      (Execute as: Me, Who has access: Anyone).
 *   2. Copy URL yang berakhiran "/exec", tempel di GAS_WEBAPP_URL di
 *      bawah ini.
 * ------------------------------------------------------------------- */

// GANTI dengan URL Web App hasil Deploy Apps Script Anda (harus diakhiri "/exec")
export const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwGqA57R6YUJgj61aMpdDfJ7wPDL4AEhIrwigR5mcrAPUz0GgE-_VacxQsENcld78coBw/exec";

function isConfigured() {
  return !!GAS_WEBAPP_URL && !GAS_WEBAPP_URL.includes("GANTI_DENGAN");
}

/**
 * Helper inti pemanggil Web App. Sengaja TIDAK mengirim header
 * "Content-Type: application/json" secara eksplisit — dengan begitu
 * browser menganggapnya "simple request" (Content-Type default
 * text/plain) dan TIDAK memicu preflight OPTIONS, karena Apps Script
 * Web App tidak bisa merespons preflight OPTIONS dengan benar (ini
 * penyebab umum error CORS yang membingungkan saat memanggil Apps
 * Script langsung dari fetch()). Apps Script tetap bisa membaca body
 * JSON-nya lewat e.postData.contents di sisi Code.gs.
 */
async function callGasWebApp(payload) {
  if (!isConfigured()) {
    throw new Error("URL Google Apps Script belum dikonfigurasi. Buka js/gas-integration.js dan isi GAS_WEBAPP_URL dengan URL hasil Deploy Web App Anda.");
  }

  let response;
  try {
    response = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    throw new Error("Gagal menghubungi Google Apps Script. Cek koneksi internet Anda, atau pastikan URL Web App di js/gas-integration.js masih aktif (belum di-undeploy).");
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error("Respons dari Google Apps Script tidak valid (bukan JSON). Cek kembali isi Code.gs, atau lihat log eksekusi di script.google.com.");
  }

  if (!json || json.success !== true) {
    let msg = (json && json.error) || "Google Apps Script mengembalikan error yang tidak diketahui.";
    // Petunjuk tambahan untuk error izin akses Drive yang paling sering
    // terjadi -- lihat testSetup() & catatan appsscript.json di Code.gs.
    if (/access denied/i.test(msg) || /DriveApp/i.test(msg)) {
      msg += " — Kemungkinan besar scope izin Apps Script belum diatur penuh, atau ID folder/template salah. Buka Code.gs di script.google.com, cek ulang appsscript.json (lihat komentar di bagian bawah Code.gs), lalu jalankan fungsi testSetup() secara manual untuk memicu ulang layar izin akses & mendiagnosa ID folder/template.";
    }
    throw new Error(msg);
   }
  return json;
}

/**
 * Generate dokumen Form Cuti (Full Day / Setengah Hari) dari template
 * Google Docs resmi perusahaan, otomatis diexport ke PDF, dan
 * dikembalikan link-nya. Lihat Code.gs untuk daftar lengkap key
 * {{PLACEHOLDER}} yang didukung template.
 * @param {object} payload data pengajuan cuti (lihat pemanggilan di cuti.js)
 * @returns {Promise<{pdfUrl:string, docUrl:string}>}
 */
export async function generateCutiDocViaGAS(payload) {
  return callGasWebApp({ action: "generate_cuti_doc", ...payload });
}

/**
 * Upload satu file (foto/dokumen) ke Google Drive lewat Apps Script,
 * menggantikan uploadBytes/getDownloadURL Firebase Storage yang lama.
 * @param {File} file  objek File dari <input type="file">
 * @param {string} folderPath  subfolder tujuan, mis. "Pengajuan/TRX-0001" atau "Broadcast/BC-0001"
 * @returns {Promise<string>} URL Google Drive file yang sudah diupload (siap dipakai sbg link di Firestore)
 */
export async function uploadFileToDrive(file, folderPath) {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Ukuran file maksimal 25MB untuk upload ke Google Drive.");
  }
  const base64 = await fileToBase64(file);
  const result = await callGasWebApp({
    action: "upload_file",
    base64,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    folderPath: folderPath || "Lain-lain"
  });
  return result.url;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Gagal membaca file di browser."));
    reader.readAsDataURL(file);
  });
}
