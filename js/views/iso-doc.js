/**
 * =====================================================================
 * ISO-DOC.JS — Generator Dokumen Cetak Standar ISO (Terpusat)
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Sebelum perbaikan ini, hanya modul Cuti yang bisa mencetak formulir
 * resmi (PDF) -- modul lain (Buat Pengajuan/ISO catalog generik,
 * Inventory, Kendaraan, dst.) murni tempat input data tanpa kemampuan
 * menghasilkan dokumen fisik/tanda terima sama sekali.
 *
 * Utilitas ini menyediakan SATU kerangka dokumen ber-kop standar ISO
 * (logo + nama perusahaan + kotak Hal/No Dok/Terbit-Revisi/Tgl Terbit,
 * mengikuti persis format formulir resmi CV Andela Jaya) yang bisa
 * dipakai ulang oleh modul mana pun untuk mencetak:
 *   - Tanda terima (barang, kendaraan, gimmick, dsb.)
 *   - Formulir pengajuan fisik hasil dari Form Builder / Katalog ISO
 *   - Dokumen persetujuan/serah-terima lain yang butuh tanda tangan basah
 *
 * Cara pakai singkat:
 *   import { openIsoDocument } from "../iso-doc.js";
 *   openIsoDocument({
 *     judul: "TANDA TERIMA BARANG ATK",
 *     noDok: "HR9", terbitRevisi: "1/1", tglTerbit: "1 September 2025",
 *     bodyHtml: "<table class='it'>...</table>",
 *     signatures: [ { label: "Diserahkan oleh,", nama: "Gudang" }, ... ]
 *   });
 * ------------------------------------------------------------------- */
import { COMPANY_NAME, logoImgTag } from "./branding.js";
import { escapeHtml } from "./utils.js";

/**
 * @param {object} opts
 * @param {string} opts.judul - Judul dokumen, mis. "TANDA TERIMA BARANG"
 * @param {string} [opts.noDok] - Nomor dokumen ISO, default "HR-GEN"
 * @param {string} [opts.terbitRevisi] - default "1/1"
 * @param {string} [opts.tglTerbit] - default "1 September 2025"
 * @param {string} opts.bodyHtml - HTML isi dokumen (tabel data, dsb.) -- tanggung jawab pemanggil untuk escape data dinamis
 * @param {Array<{label:string, nama?:string}>} [opts.signatures] - kolom tanda tangan di footer (default 2 kolom: Yang Menyerahkan / Yang Menerima)
 * @param {string} [opts.catatan] - catatan/perhatian tambahan di bawah tanda tangan
 * @param {boolean} [opts.autoPrint] - langsung memicu dialog print (default true)
 */
export function openIsoDocument(opts) {
  const {
    judul,
    noDok = "HR-GEN",
    terbitRevisi = "1/1",
    tglTerbit = "1 September 2025",
    bodyHtml,
    signatures = [
      { label: "Yang Menyerahkan," },
      { label: "Yang Menerima," }
    ],
    catatan = "",
    autoPrint = true
  } = opts;

  const printWindow = window.open('', '_blank');
  const todayStr = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  const colWidth = Math.floor(100 / signatures.length);

  const html = `
  <html><head><title>${escapeHtml(judul)} - ${COMPANY_NAME}</title>
    <style>
      body { font-family: 'Times New Roman', Times, serif; font-size: 14px; padding: 30px; line-height: 1.5; color: #000; }
      .ht { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .ht td { border: 1px solid #000; padding: 10px; text-align: center; font-weight: bold; }
      .it { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .it td, .it th { border: 1px solid #000; padding: 6px 10px; vertical-align: top; }
      .it th { background: #e2e8f0; }
      .col-lbl { width: 35%; font-weight: bold; background: #f9fafb; }
      .sign-table { width: 100%; text-align: center; margin-top: 30px; }
      .sign-table td { vertical-align: top; }
    </style>
  </head><body ${autoPrint ? `onload="setTimeout(() => { window.print(); window.close(); }, 800);"` : ""}>

    <table class="ht">
      <tr>
        <td rowspan="2" width="20%" style="padding:5px;">${logoImgTag(80)}</td>
        <td rowspan="2" style="font-size: 16px; text-transform: uppercase;">
           ${escapeHtml(judul)}<br/>${COMPANY_NAME}
        </td>
        <td width="25%" style="font-size: 11px; text-align: left; font-weight: normal;">
           Hal: 1 dari 1<br/>No Dok: ${escapeHtml(noDok)}
        </td>
      </tr>
      <tr>
        <td style="font-size: 11px; text-align: left; font-weight: normal;">Terbit/Revisi: ${escapeHtml(terbitRevisi)}<br/>Tgl terbit: ${escapeHtml(tglTerbit)}</td>
      </tr>
    </table>

    ${bodyHtml}

    <div style="text-align:right; margin-top:15px; font-size:11px; color:#666;">${todayStr}</div>

    <table class="sign-table">
      <tr>${signatures.map(s => `<td width="${colWidth}%">${escapeHtml(s.label)}</td>`).join("")}</tr>
      <tr>${signatures.map(() => `<td height="80"></td>`).join("")}</tr>
      <tr>${signatures.map(s => `<td>( ${s.nama ? `<strong>${escapeHtml(s.nama)}</strong>` : ".................................."} )</td>`).join("")}</tr>
    </table>

    ${catatan ? `
    <div style="margin-top:20px; font-size:12px; border:1px solid #000; padding:10px;">
       ${catatan}
    </div>` : ""}
  </body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  return printWindow;
}
