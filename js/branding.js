/**
 * =====================================================================
 * BRANDING.JS — Sumber logo perusahaan yang dipakai di SEMUA dokumen
 * yang tergenerate oleh sistem (Form Cuti, Form Ijin, Slip Kontrak,
 * Form Persetujuan, dll).
 *
 * PENTING UNTUK ADMIN:
 * Variabel LOGO_DATA_URI di bawah ini masih berisi PLACEHOLDER
 * (lambang "AJ" generik) karena file logo asli CV Andela Jaya belum
 * disediakan saat perbaikan ini dibuat. Untuk memasang logo resmi:
 *   1. Siapkan file logo (PNG/JPG, disarankan persegi, min 300x300px,
 *      latar transparan).
 *   2. Convert ke Base64, misalnya lewat https://www.base64-image.de/
 *      atau command: `base64 -i logo.png`.
 *   3. Ganti isi LOGO_DATA_URI di bawah ini dengan hasilnya, format:
 *      "data:image/png;base64,XXXXXXXXXX...."
 *   4. Simpan file ini — seluruh dokumen (Form Cuti, Form Kontrak, dll)
 *      otomatis akan memakai logo baru karena semua modul mengambil
 *      logo dari satu sumber ini (single source of truth).
 * ------------------------------------------------------------------- */

export const COMPANY_NAME = "CV ANDELA JAYA";

// Placeholder logo (lambang "AJ" bulat warna maroon) — GANTI dengan logo asli perusahaan.
export const LOGO_DATA_URI =
  "data:image/svg+xml;base64," +
  btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="78" fill="#7f1d1d" stroke="#450a0a" stroke-width="3"/>
      <text x="80" y="98" font-family="Georgia, 'Times New Roman', serif" font-size="58" font-weight="bold" fill="#ffffff" text-anchor="middle">AJ</text>
    </svg>
  `);

/**
 * Kembalikan tag <img> logo siap-pakai untuk header dokumen cetak (HTML string).
 * @param {number} sizePx ukuran lebar/tinggi logo dalam px (default 56)
 */
export function logoImgTag(sizePx = 56) {
  return `<img src="${LOGO_DATA_URI}" alt="Logo ${COMPANY_NAME}" width="${sizePx}" height="${sizePx}" style="display:block;border-radius:6px;object-fit:contain;" />`;
}
