import { COL, db, updateDoc, doc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, toast, genId, fmtRupiah, fmtDateShort, smartParseDate, sendEmailNotif, buildStandardEmailHtml, openModal, closeModal } from "../utils.js";
import { renderCrudModule, icon } from "../components.js";
import { isoDocHeaderTable } from "../branding.js";

// Fungsi pelindung teks bawaan (Bulletproof)
function escapeHtml(unsafe) {
 return (unsafe || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// FUNGSI CETAK SURAT EXIT CLEARANCE & HANDOVER PEKERJAAN (PDF & PREVIEW)
async function printExitClearancePdf(data) {
 const { downloadHtmlAsPdf, toast, openModal } = await import("../utils.js");
 
 const { karyawan, pengganti, assets, tglEfektif, alasan, masaKerja, catatanHandover, handoverTasks, checklistDoc } = data;

 const taskRowsHtml = (handoverTasks && handoverTasks.length) ? handoverTasks.map((t, idx) => `
 <tr>
 <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
 <td>${escapeHtml(t.pekerjaan || t)}</td>
 <td style="text-align:center; font-weight:bold; background:#fafafa;">${escapeHtml(t.pemahaman || "Paham (Siap Eksekusi)")}</td>
 </tr>
 `).join("") : `
 <tr>
 <td colspan="3" style="text-align:center; color:#555; font-style:italic;">
 ${escapeHtml(catatanHandover || "Seluruh tugas harian, file dokumen kerja, dan tanggung jawab pekerjaan telah dialihkan penuh.")}
 </td>
 </tr>`;

 const assetRows = (assets && assets.length) ? assets.map((a, idx) => {
 const isWarn = (a.status_pengembalian || "").includes("Hilang") || (a.status_pengembalian || "").includes("Rusak");
 return `
 <tr>
 <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
 <td style="text-align:center; font-weight:bold; color:#334155;">${escapeHtml(a.kategori || "Aset / Seragam")}</td>
 <td>
 <strong style="color:#0f172a;">${escapeHtml(a.nama_barang || a.nama || "Barang")}</strong>
 ${(a.id_item || a.id) ? `<br/><span style="font-family:monospace; font-size:9px; color:#64748b;">ID/Kode: ${escapeHtml(a.id_item || a.id)}</span>` : ''}
 </td>
 <td style="text-align:center; font-weight:bold; color:${isWarn ? '#b91c1c' : '#15803d'};">
 ${escapeHtml(a.status_pengembalian || "Diterima & Lengkap")}
 </td>
 </tr>
 `;
 }).join("") : `
 <tr>
 <td colspan="4" style="text-align:center; color:#555; font-style:italic; padding:10px;">
 Tidak ada aset, seragam, atau barang inventaris kantor yang terdaftar atas nama karyawan.
 </td>
 </tr>`;

 const docRows = (checklistDoc && checklistDoc.length) ? checklistDoc.map(d => `
 <div style="margin-bottom:3px; font-size:10px; color:#111827;">[v] <strong>${escapeHtml(d)}</strong> — Diverifikasi & Disetujui HRD</div>
 `).join("") : "";

 const docHtml = `
 <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:'Times New Roman', Times, serif; font-size:10px; line-height:1.3; color:#000; background:#ffffff; box-sizing:border-box;">
 <style>
 * { box-sizing: border-box !important; }
 body, div, p, span, table, tr, th, td { font-family: 'Times New Roman', Times, serif; }
 table.clearance-tbl {
 width: 100% !important;
 border-collapse: collapse !important;
 table-layout: fixed !important;
 margin-top: 5px !important;
 font-size: 10px !important;
 page-break-inside: avoid !important;
 }
 table.clearance-tbl th, table.clearance-tbl td {
 border: 1px solid #000 !important;
 padding: 3.5px 5px !important;
 word-wrap: break-word !important;
 word-break: break-word !important;
 overflow-wrap: break-word !important;
 box-sizing: border-box !important;
 vertical-align: middle !important;
 }
 .header-table { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; }
 .header-table td { word-wrap: break-word !important; word-break: break-word !important; }
 </style>

 <div style="page-break-inside:avoid; margin-bottom:6px;">
 ${isoDocHeaderTable({ judul: "BERITA ACARA EXIT CLEARANCE, SERAH TERIMA ASET & HANDOVER PEKERJAAN", noDok: "HRD-CLR-01", terbitRevisi: "1/0", hal: "1 dari 1" })}
 </div>
 
 <div style="margin-top:6px; text-align:justify; font-size:10.5px;">
 <p style="margin:0 0 5px 0;">Pada hari ini, tanggal <strong>${fmtDateShort(tglEfektif)}</strong>, telah dilaksanakan proses <strong>Exit Clearance & Handover Pekerjaan Resmi</strong> di lingkungan CV ANDELA JAYA untuk karyawan berikut:</p>
 </div>

 <table class="clearance-tbl">
 <colgroup><col style="width:35%;" /><col style="width:65%;" /></colgroup>
 <tr style="background:#f1f5f9;"><td colspan="2" style="font-weight:bold; text-transform:uppercase;">I. IDENTITAS KARYAWAN (OFFBOARDING)</td></tr>
 <tr><td>Nama Lengkap</td><td style="font-weight:bold;">${escapeHtml(karyawan.nama_karyawan)}</td></tr>
 <tr><td>NIK / ID Karyawan</td><td>${escapeHtml(karyawan.nik_karyawan || karyawan.id || "-")}</td></tr>
 <tr><td>Jabatan & Cabang</td><td>${escapeHtml(karyawan.jabatan || "-")} (${escapeHtml(karyawan.cabang || "-")})</td></tr>
 <tr><td>Masa Kerja & Tgl Efektif</td><td>${masaKerja} Tahun | Efektif: ${fmtDateShort(tglEfektif)}</td></tr>
 <tr><td>Alasan Resign / Terminasi</td><td>${escapeHtml(alasan)}</td></tr>
 </table>

 <table class="clearance-tbl">
 <colgroup><col style="width:35%;" /><col style="width:65%;" /></colgroup>
 <tr style="background:#f1f5f9;"><td colspan="2" style="font-weight:bold; text-transform:uppercase;">II. IDENTITAS KARYAWAN PENGGANTI (PENERIMA HANDOVER)</td></tr>
 <tr><td>Nama Karyawan Pengganti</td><td style="font-weight:bold;">${escapeHtml(pengganti || "Tidak Ada (Dialihkan ke Tim Divisi)")}</td></tr>
 ${catatanHandover ? `<tr><td>Catatan Tambahan Handover</td><td>${escapeHtml(catatanHandover)}</td></tr>` : ''}
 </table>

 <div style="margin-top:6px; font-weight:bold; font-size:10px; text-transform:uppercase; page-break-after:avoid;">III. DAFTAR PEKERJAAN HANDOVER & TINGKAT PEMAHAMAN</div>
 <table class="clearance-tbl">
 <colgroup><col style="width:6%;" /><col style="width:60%;" /><col style="width:34%;" /></colgroup>
 <thead>
 <tr style="background:#e2e8f0; text-align:center;">
 <th>No</th>
 <th style="text-align:left;">Rincian Pekerjaan Handover</th>
 <th>Tingkat Pemahaman Karyawan Pengganti</th>
 </tr>
 </thead>
 <tbody>
 ${taskRowsHtml}
 </tbody>
 </table>

 <div style="margin-top:6px; font-weight:bold; font-size:10px; text-transform:uppercase; page-break-after:avoid;">IV. BUKTI PENGEMBALIAN ASET, SERAGAM & BARANG PERUSAHAAN</div>
 <table class="clearance-tbl">
 <colgroup><col style="width:6%;" /><col style="width:20%;" /><col style="width:46%;" /><col style="width:28%;" /></colgroup>
 <thead>
 <tr style="background:#e2e8f0; text-align:center;">
 <th>No</th>
 <th>Kategori</th>
 <th style="text-align:left;">Nama Barang / Aset / Seragam / Perlengkapan</th>
 <th>Status Audit & Pengembalian</th>
 </tr>
 </thead>
 <tbody>
 ${assetRows}
 </tbody>
 </table>

 <div style="page-break-inside:avoid; break-inside:avoid; margin-top:6px;">
 <div style="font-size:9.5px; border:1px solid #000; padding:6px; background:#fafafa;">
 <strong style="text-transform:uppercase;">V. VERIFIKASI DOKUMEN & SERAH TERIMA:</strong><br/>
 <div style="margin-top:3px;">${docRows}</div>
 <p style="margin-top:4px; margin-bottom:0; font-style:italic; font-size:9px; color:#1f2937; line-height:1.3;">
 Dengan ditandatanganinya Berita Acara ini, Karyawan yang bersangkutan dinyatakan <strong>RESMI BEBAS TANGGUNG JAWAB (CLEAR)</strong> dari seluruh penguasaan fisik aset, seragam, dan inventaris perusahaan serta telah menyerahkan seluruh berkas dan kewenangan pekerjaan.
 </p>
 </div>

 <table style="width:100%; border-collapse:collapse; table-layout:fixed; text-align:center; margin-top:10px; font-size:10px; page-break-inside:avoid; break-inside:avoid;">
 <tr>
 <td style="width:25%; border:none; padding:2px;">Karyawan Resign,</td>
 <td style="width:25%; border:none; padding:2px;">Karyawan Pengganti,</td>
 <td style="width:25%; border:none; padding:2px;">Atasan Langsung,</td>
 <td style="width:25%; border:none; padding:2px;">HRD & GA Manager,</td>
 </tr>
 <tr><td style="border:none; height:34px;"></td><td style="border:none;"></td><td style="border:none;"></td><td style="border:none;"></td></tr>
 <tr>
 <td style="border:none; padding:2px;">( <strong>${escapeHtml(karyawan.nama_karyawan)}</strong> )</td>
 <td style="border:none; padding:2px;">( <strong>${escapeHtml(pengganti || "-")}</strong> )</td>
 <td style="border:none; padding:2px;">( ................................... )</td>
 <td style="border:none; padding:2px;">( ................................... )</td>
 </tr>
 </table>
 </div>
 </div>`;

 const filename = `Surat_Clearance_Resign_${escapeHtml(karyawan.nama_karyawan).replace(/\s+/g, "_")}.pdf`;

 const modalBody = `
 <div class="space-y-4">
 <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl flex-wrap gap-2">
 <span class="text-xs font-semibold text-slate-600">Dokumen Resmi Exit Clearance (Pratinjau)</span>
 <div class="flex items-center gap-2">
 <button type="button" id="btn-modal-print-clr" class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
 ${icon('printer', 'w-4 h-4')} Cetak Dokumen
 </button>
 <button type="button" id="btn-modal-dl-clr" class="px-3.5 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
 ${icon('download', 'w-4 h-4')} Unduh PDF
 </button>
 </div>
 </div>
 <div class="border border-slate-300 rounded-xl p-4 bg-slate-100 overflow-y-auto max-h-[70vh]">
 <div class="bg-white shadow-md p-6 rounded-lg mx-auto" style="max-width:794px;">
 ${docHtml}
 </div>
 </div>
 </div>
 `;

 openModal({
 title: `Dokumen Exit Clearance — ${escapeHtml(karyawan.nama_karyawan)}`,
 bodyHtml: modalBody,
 size: "xl",
 onMount: (backdrop) => {
 backdrop.querySelector("#btn-modal-dl-clr")?.addEventListener("click", async () => {
 toast("Sedang mengunduh file PDF...", "info");
 await downloadHtmlAsPdf(docHtml, filename);
 toast("Dokumen Clearance PDF berhasil diunduh!", "success");
 });

 backdrop.querySelector("#btn-modal-print-clr")?.addEventListener("click", () => {
 const printWin = window.open("", "_blank", "width=850,height=900");
 if (!printWin) {
 toast("Izin popup diblokir browser. Gunakan tombol Unduh PDF.", "error");
 return;
 }
 printWin.document.write(`
 <html>
 <head>
 <title>${filename}</title>
 <style>
 body { margin: 0; padding: 20px; font-family: 'Times New Roman', serif; }
 @media print { @page { size: A4 portrait; margin: 10mm; } }
 </style>
 </head>
 <body>
 ${docHtml}
 <script>window.onload = function() { window.print(); };</script>
 </body>
 </html>
 `);
 printWin.document.close();
 });
 }
 });

 // Otomatis jalankan unduh PDF di latar belakang
 try {
 await downloadHtmlAsPdf(docHtml, filename);
 toast("Dokumen Clearance PDF berhasil diunduh!", "success");
 } catch (e) {
 console.warn("Gagal auto download PDF:", e);
 }
}

// FUNGSI CETAK BERITA ACARA ONBOARDING, ORIENTASI & TRAINING (PDF)
async function printOnboardingDocPdf(data) {
 const { downloadHtmlAsPdf, toast, openModal } = await import("../utils.js");

 const { nama, nik, email, jabatan, cabang, tglJoin, statusKontrak, orientasiItems, trainingItems, catatanFasilitas } = data;

 const orientasiRowsHtml = (orientasiItems && orientasiItems.length) ? orientasiItems.map((o, idx) => `
 <tr>
 <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
 <td>${escapeHtml(o.topik)}</td>
 <td style="text-align:center; font-weight:bold; color:#15803d;">${escapeHtml(o.status)}</td>
 </tr>
 `).join("") : `
 <tr>
 <td colspan="3" style="text-align:center; color:#555; font-style:italic;">Orientasi lingkungan kantor diselesaikan sesuai SOP standar.</td>
 </tr>`;

 const trainingRowsHtml = (trainingItems && trainingItems.length) ? trainingItems.map((t, idx) => `
 <tr>
 <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
 <td><strong>${escapeHtml(t.materi)}</strong></td>
 <td style="text-align:center;">${escapeHtml(t.trainer || "HRD / Atasan")}</td>
 <td style="text-align:center; font-weight:bold; color:#1e40af;">${escapeHtml(t.status)}</td>
 </tr>
 `).join("") : `
 <tr>
 <td colspan="4" style="text-align:center; color:#555; font-style:italic;">Seluruh materi pembekalan & training dasar telah disajikan.</td>
 </tr>`;

 const docHtml = `
 <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:'Times New Roman', Times, serif; font-size:11px; line-height:1.35; color:#000; background:#ffffff; box-sizing:border-box;">
 <style>
 * { box-sizing: border-box !important; }
 body, div, p, span, table, tr, th, td { font-family: 'Times New Roman', Times, serif; }
 table.onb-tbl {
 width: 100% !important;
 border-collapse: collapse !important;
 table-layout: fixed !important;
 margin-top: 6px !important;
 font-size: 10.5px !important;
 page-break-inside: avoid !important;
 }
 table.onb-tbl th, table.onb-tbl td {
 border: 1px solid #000 !important;
 padding: 5px 6px !important;
 word-wrap: break-word !important;
 word-break: break-word !important;
 overflow-wrap: break-word !important;
 box-sizing: border-box !important;
 vertical-align: top !important;
 }
 </style>

 <div style="page-break-inside:avoid; margin-bottom:10px;">
 ${isoDocHeaderTable({ judul: "BERITA ACARA ONBOARDING, ORIENTASI & TRAINING KARYAWAN BARU", noDok: "HRD-ONB-01", terbitRevisi: "1/0", hal: "1 dari 1" })}
 </div>
 
 <div style="margin-top:8px; text-align:justify; font-size:11px;">
 <p style="margin:0 0 8px 0;">Pada hari ini, tanggal <strong>${fmtDateShort(tglJoin)}</strong>, telah dilaksanakan proses <strong>Onboarding, Orientasi Kantor & Pembekalan Training Resmi</strong> di lingkungan CV ANDELA JAYA untuk karyawan baru berikut:</p>
 </div>

 <table class="onb-tbl">
 <tr style="background:#f1f5f9;"><td colspan="2" style="font-weight:bold; text-transform:uppercase;">I. IDENTITAS KARYAWAN BARU</td></tr>
 <tr><td style="width:35%;">Nama Lengkap Karyawan</td><td style="width:65%; font-weight:bold;">${escapeHtml(nama)}</td></tr>
 <tr><td>NIK / ID Karyawan</td><td>${escapeHtml(nik || "-")}</td></tr>
 <tr><td>Email & Kontak</td><td>${escapeHtml(email || "-")}</td></tr>
 <tr><td>Jabatan & Cabang</td><td>${escapeHtml(jabatan || "-")} (${escapeHtml(cabang || "-")})</td></tr>
 <tr><td>Tanggal Bergabung & Tipe Kontrak</td><td>${fmtDateShort(tglJoin)} | Status: ${escapeHtml(statusKontrak || "PKWTT")}</td></tr>
 ${catatanFasilitas ? `<tr><td>Catatan Fasilitas / Seragam</td><td>${escapeHtml(catatanFasilitas)}</td></tr>` : ''}
 </table>

 <div style="margin-top:10px; font-weight:bold; font-size:11px; text-transform:uppercase; page-break-after:avoid;">II. REKAPITULASI PENGENALAN LINGKUNGAN KANTOR (ORIENTASI)</div>
 <table class="onb-tbl">
 <thead>
 <tr style="background:#e2e8f0; text-align:center;">
 <th style="width:6%;">No</th>
 <th style="width:64%; text-align:left;">Topik / Item Pengenalan Lingkungan Kantor</th>
 <th style="width:30%;">Status Progress</th>
 </tr>
 </thead>
 <tbody>
 ${orientasiRowsHtml}
 </tbody>
 </table>

 <div style="margin-top:10px; font-weight:bold; font-size:11px; text-transform:uppercase; page-break-after:avoid;">III. DAFTAR MATERI TRAINING & PEMBEKALAN KARYAWAN</div>
 <table class="onb-tbl">
 <thead>
 <tr style="background:#e2e8f0; text-align:center;">
 <th style="width:6%;">No</th>
 <th style="width:44%; text-align:left;">Materi / Modul Training</th>
 <th style="width:25%;">Pemateri / Trainer</th>
 <th style="width:25%;">Progress & Pemahaman</th>
 </tr>
 </thead>
 <tbody>
 ${trainingRowsHtml}
 </tbody>
 </table>

 <table style="width:100%; border-collapse:collapse; table-layout:fixed; text-align:center; margin-top:25px; font-size:10.5px; page-break-inside:avoid;">
 <tr>
 <td style="width:33%; border:none; padding:4px;">Karyawan Baru,</td>
 <td style="width:33%; border:none; padding:4px;">Atasan Direct / Mentor,</td>
 <td style="width:34%; border:none; padding:4px;">HRD & GA Manager,</td>
 </tr>
 <tr><td style="border:none; height:45px;"></td><td style="border:none;"></td><td style="border:none;"></td></tr>
 <tr>
 <td style="border:none; padding:4px;">( <strong>${escapeHtml(nama)}</strong> )</td>
 <td style="border:none; padding:4px;">( ................................... )</td>
 <td style="border:none; padding:4px;">( ................................... )</td>
 </tr>
 </table>
 </div>`;

 const filename = `Berita_Acara_Onboarding_${escapeHtml(nama).replace(/\s+/g, "_")}.pdf`;

 const modalBody = `
 <div class="space-y-4">
 <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl flex-wrap gap-2">
 <span class="text-xs font-semibold text-slate-600">Dokumen Resmi Onboarding (Pratinjau)</span>
 <div class="flex items-center gap-2">
 <button type="button" id="btn-modal-print-onb" class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
 ${icon('printer', 'w-4 h-4')} Cetak Dokumen
 </button>
 <button type="button" id="btn-modal-dl-onb" class="px-3.5 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
 ${icon('download', 'w-4 h-4')} Unduh PDF
 </button>
 </div>
 </div>
 <div class="border border-slate-300 rounded-xl p-4 bg-slate-100 overflow-y-auto max-h-[70vh]">
 <div class="bg-white shadow-md p-6 rounded-lg mx-auto" style="max-width:794px;">
 ${docHtml}
 </div>
 </div>
 </div>
 `;

 openModal({
 title: `Dokumen Onboarding — ${escapeHtml(nama)}`,
 bodyHtml: modalBody,
 size: "xl",
 onMount: (backdrop) => {
 backdrop.querySelector("#btn-modal-dl-onb")?.addEventListener("click", async () => {
 toast("Sedang mengunduh file PDF...", "info");
 await downloadHtmlAsPdf(docHtml, filename);
 toast("Dokumen Onboarding PDF berhasil diunduh!", "success");
 });

 backdrop.querySelector("#btn-modal-print-onb")?.addEventListener("click", () => {
 const printWin = window.open("", "_blank", "width=850,height=900");
 if (!printWin) {
 toast("Izin popup diblokir browser. Gunakan tombol Unduh PDF.", "error");
 return;
 }
 printWin.document.write(`
 <html>
 <head>
 <title>${filename}</title>
 <style>
 body { margin: 0; padding: 20px; font-family: 'Times New Roman', serif; }
 @media print { @page { size: A4 portrait; margin: 10mm; } }
 </style>
 </head>
 <body>
 ${docHtml}
 <script>window.onload = function() { window.print(); };</script>
 </body>
 </html>
 `);
 printWin.document.close();
 });
 }
 });

 // Auto-download PDF in background
 try {
 await downloadHtmlAsPdf(docHtml, filename);
 toast("Dokumen Onboarding PDF berhasil diunduh!", "success");
 } catch (e) {
 console.warn("Gagal auto download PDF:", e);
 }
}

export async function mount(container) {
 const panel = container.querySelector("#sk-panel") || container;
 panel.innerHTML = `
 <div class="max-w-6xl mx-auto space-y-6 pb-10">
 <div>
 <h1 class="text-2xl font-bold text-slate-800">Siklus & Pergerakan Karyawan</h1>
 <p class="text-sm text-slate-500 mt-1">Manajemen Onboarding, Mutasi, Promosi, Demosi, dan Kalkulator Offboarding.</p>
 </div>
 
 <div class="flex items-center gap-2 border-b border-slate-100 overflow-x-auto mb-4">
 <button data-stab="input" class="sk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">Formulir Pergerakan</button>
 <button data-stab="riwayat" class="sk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap">Riwayat Siklus</button>
 </div>

 <div id="sk-panel-input">
 <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
 <h3 class="font-bold text-slate-800 mb-4">Input Data Pergerakan</h3>
 <form id="form-siklus" class="space-y-4">
 <div>
 <label class="block text-xs font-medium text-slate-500 mb-1">Jenis Pergerakan / Siklus</label>
 <select id="siklus-jenis" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 bg-white">
 <option value="">Pilih Jenis...</option>
 <option value="Onboarding">Onboarding (Karyawan Baru)</option>
 <option value="Mutasi">Mutasi (Pindah Cabang/Divisi)</option>
 <option value="Promosi">Promosi (Naik Jabatan)</option>
 <option value="Demosi">Demosi (Turun Jabatan)</option>
 <option value="Offboarding">Offboarding (Resign/PHK)</option>
 </select>
 </div>
 <div id="wrap-nama">
 <label class="block text-xs font-medium text-slate-500 mb-1">Pilih Karyawan Aktif</label>
 <select id="siklus-nama" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 bg-white disabled:bg-slate-100 disabled:text-slate-400">
 <option value="">Sedang Memuat Data Karyawan...</option>
 </select>
 </div>

 <div id="wrap-onb-newdata" class="hidden space-y-4 border-t border-slate-100 pt-4">
 <p class="text-xs font-bold text-maroon-700 uppercase">Data Karyawan Baru</p>
 <div class="grid grid-cols-2 gap-4">
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">Nama Lengkap</label>
 <input type="text" id="onb-nama" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">NIK Karyawan</label>
 <input type="text" id="onb-nik" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">Email (untuk welcoming letter)</label>
 <input type="email" id="onb-email" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">No. HP Aktif</label>
 <input type="text" id="onb-hp" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">Jabatan</label>
 <input type="text" id="onb-jabatan" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">Cabang / Divisi</label>
 <input type="text" id="onb-cabang" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">Atasan Langsung</label>
 <input type="text" id="onb-atasan" placeholder="Nama atasan (persis)" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 <div class="col-span-2 sm:col-span-1">
 <label class="block text-xs font-bold text-slate-600 mb-1">Alamat</label>
 <input type="text" id="onb-alamat" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
 </div>
 </div>
 </div>
 
 <div id="siklus-dynamic-fields" class="space-y-4 border-t border-slate-100 pt-4 mt-4 hidden"></div>
 
 <button type="button" id="btn-kalkulasi" class="w-full bg-slate-800 text-white font-medium py-2.5 rounded-lg hover:bg-slate-900 transition hidden shadow-sm">Buat Rincian & Analisa Dokumen</button>
 </form>
 </div>

 <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
 <h3 class="font-bold text-slate-800 mb-4">Hasil Analisa & Rencana Aksi</h3>
 <div id="siklus-result-box" class="space-y-4">
 <div class="text-center py-10 flex flex-col items-center justify-center text-slate-400">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
 <p class="text-sm">Pilih jenis siklus dan isi formulir di samping untuk melihat prosedur & dokumen yang harus disiapkan.</p>
 </div>
 </div>
 </div>
 </div>
 </div>
 
 <div id="sk-panel-riwayat" class="hidden"></div>
 </div>
 `;

 let allKaryawan = [];
 try {
 allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
 } catch (err) {
 console.error("Gagal memuat MASTER_KARYAWAN di Siklus Karyawan:", err);
 }
 const activeKaryawan = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
 activeKaryawan.sort((a,b) => (a.nama_karyawan||"").localeCompare(b.nama_karyawan||""));
 
 const selectNama = container.querySelector("#siklus-nama");
 if (selectNama) {
 selectNama.innerHTML = `<option value="">Pilih Karyawan Aktif...</option>` + 
 activeKaryawan.map(k => `<option value="${k.id}">${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || "")} (${escapeHtml(k.cabang || "-")})</option>`).join("");
 }

 const selJenis = container.querySelector("#siklus-jenis");
 const dynFields = container.querySelector("#siklus-dynamic-fields");
 const btnKalkulasi = container.querySelector("#btn-kalkulasi");
 const resBox = container.querySelector("#siklus-result-box");
 const wrapNama = container.querySelector("#wrap-nama");
 const wrapOnbNew = container.querySelector("#wrap-onb-newdata");

 let currentSelectedKaryawan = null;
 let isNewHireOnboarding = false; // true jika Onboarding karyawan BARU (belum ada di Master Karyawan)

 if (selectNama) {
 selectNama.addEventListener("change", () => {
 currentSelectedKaryawan = activeKaryawan.find(k => k.id === selectNama.value);
 renderFields(); 
 });
 }

 if (selJenis) {
 selJenis.addEventListener("change", () => {
 isNewHireOnboarding = selJenis.value === "Onboarding";
 if (wrapNama) wrapNama.classList.toggle("hidden", isNewHireOnboarding);
 if (wrapOnbNew) wrapOnbNew.classList.toggle("hidden", !isNewHireOnboarding);
 if (selectNama) selectNama.required = !isNewHireOnboarding;

 // Toggle required attributes for hidden onboarding fields to prevent silent form.reportValidity() failure
 const onbNama = container.querySelector("#onb-nama");
 const onbEmail = container.querySelector("#onb-email");
 if (onbNama) {
 onbNama.required = isNewHireOnboarding;
 }
 if (onbEmail) {
 onbEmail.required = isNewHireOnboarding;
 }

 if (isNewHireOnboarding && selectNama) {
 selectNama.value = "";
 currentSelectedKaryawan = null;
 }
 renderFields();
 });
 }

 function formatDateInput(d) {
 if(!d) return "";
 const date = smartParseDate(d);
 if (!date) return "";
 return date.toISOString().split("T")[0];
 }

 function renderFields() {
 const jenis = selJenis.value;
 if (!jenis) {
 dynFields.classList.add("hidden");
 btnKalkulasi.classList.add("hidden");
 return;
 }

 dynFields.classList.remove("hidden");
 btnKalkulasi.classList.remove("hidden");
 resBox.innerHTML = `<p class="text-sm text-slate-400 text-center py-10 border-2 border-dashed border-slate-200 rounded-xl mt-4">Isi form di samping lalu klik tombol Buat Rincian.</p>`;

 const joinDate = currentSelectedKaryawan ? formatDateInput(currentSelectedKaryawan.tanggal_join) : "";
 const jabLama = currentSelectedKaryawan ? escapeHtml(currentSelectedKaryawan.jabatan || "-") : "";
 const cabLama = currentSelectedKaryawan ? escapeHtml(currentSelectedKaryawan.cabang || "-") : "";

 if (jenis === "Offboarding") {
 const otherActive = activeKaryawan.filter(k => !currentSelectedKaryawan || k.id !== currentSelectedKaryawan.id);
 dynFields.innerHTML = `
 <div class="grid grid-cols-2 gap-4">
 <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Join (Auto)</label><input type="date" id="off-join" value="${joinDate}" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none bg-slate-50 text-slate-600"></div>
 <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Efektif Keluar</label><input type="date" id="off-out" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 border-slate-300"></div>
 </div>
 <div><label class="block text-xs font-bold text-slate-600 mb-1">Gaji Pokok + Tunjangan Tetap (Rp)</label><input type="number" id="off-gaji" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400" placeholder="Cth: 5000000"></div>
 <div>
 <label class="block text-xs font-bold text-slate-600 mb-1">Alasan Terminasi (Sesuai PP Andela Jaya)</label>
 <select id="off-alasan" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400 bg-white font-medium text-slate-700">
 <option value="Habis Kontrak">Berakhirnya Jangka Waktu Kontrak Kerja (Habis Kontrak) - PKWT</option>
 <option value="Resign">Mengundurkan Diri (Resign) - Pasal 46 & 61</option>
 <option value="PHK Efisiensi">PHK - Efisiensi / Perusahaan Tutup - Pasal 55 & 56</option>
 <option value="Mangkir">Mangkir > 5 Hari Kerja - Pasal 52</option>
 <option value="Pelanggaran Berat">PHK - Pelanggaran Peraturan Berat - Pasal 53</option>
 <option value="Pensiun">Mencapai Usia Pensiun - Pasal 47</option>
 </select>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-600 mb-1">Karyawan Pengganti (Penerima Handover Pekerjaan)</label>
 <select id="off-pengganti" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400 bg-white font-medium text-slate-700">
 <option value="">-- Tidak Ada Pengganti (Dialihkan ke Tim Divisi) --</option>
 ${otherActive.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || '')} (${escapeHtml(k.cabang || '-')})</option>`).join("")}
 </select>
 </div> <!-- LIST PEKERJAAN HANDOVER & TINGKAT PEMAHAMAN -->
 <div class="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 mt-2">
 <div class="flex items-center justify-between">
 <label class="block text-xs font-bold text-slate-700">Daftar Pekerjaan Handover & Pemahaman Pengganti</label>
 <button type="button" id="btn-add-handover-row" class="px-2.5 py-1 text-[11px] font-bold text-maroon-700 bg-white border border-maroon-200 rounded-lg hover:bg-maroon-50 transition flex items-center gap-1 shadow-sm">
 + Tambah Pekerjaan
 </button>
 </div>
 <p class="text-[11px] text-slate-500">Rincikan tugas/tanggung jawab yang diserahterimakan beserta tingkat pemahaman karyawan pengganti.</p>

 <div class="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-600 px-2 pt-1 border-b border-slate-200 pb-1">
 <div class="col-span-7">Rincian / List Pekerjaan Handover</div>
 <div class="col-span-4">Tingkat Pemahaman</div>
 <div class="col-span-1 text-center">Aksi</div>
 </div>

 <div id="handover-tasks-container" class="space-y-2 max-h-52 overflow-y-auto pr-1">
 <!-- Populated dynamically -->
 </div>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-600 mb-1">Catatan Tambahan Handover (Opsi)</label>
 <textarea id="off-catatan-handover" rows="1" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400" placeholder="Cth: Lokasi simpan file kerja di Google Drive Tim & password email..."></textarea>
 </div>

 <!-- CUSTOMIZABLE ASSETS / SERAGAM / BARANG MELEKAT MANAGER -->
 <div class="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 mt-2">
 <div class="flex items-center justify-between">
 <div>
 <label class="block text-xs font-bold text-slate-700">Pengembalian Aset, Seragam & Barang Melekat (Clearance)</label>
 <p class="text-[10px] text-slate-500">HRD dapat mengkustomisasi, menambah, atau menghapus seragam/barang/aset yang masih melekat di karyawan.</p>
 </div>
 <button type="button" id="btn-add-off-asset-row" class="px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 transition flex items-center gap-1 shadow-sm shrink-0">
 + Tambah Seragam / Barang
 </button>
 </div>

 <div class="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-600 px-2 pt-1 border-b border-slate-200 pb-1">
 <div class="col-span-5">Nama Barang / Aset / Seragam</div>
 <div class="col-span-3">Kategori</div>
 <div class="col-span-3">Status Pengembalian</div>
 <div class="col-span-1 text-center">Aksi</div>
 </div>

 <div id="offboarding-assets-container" class="space-y-2 max-h-56 overflow-y-auto pr-1">
 <!-- Populated dynamically -->
 </div>
 </div>

 <!-- CUSTOMIZABLE TERMINATION CHECKLIST FOR HRD -->
 <div class="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 mt-2">
 <div class="flex items-center justify-between">
 <label class="block text-xs font-bold text-slate-700">Checklist Dokumen Exit Clearance (Kustom HRD)</label>
 <button type="button" id="btn-add-checklist-row" class="px-2.5 py-1 text-[11px] font-bold text-maroon-700 bg-white border border-maroon-200 rounded-lg hover:bg-maroon-50 transition flex items-center gap-1 shadow-sm">
 + Tambah Syarat Checklist
 </button>
 </div>
 <p class="text-[11px] text-slate-500">Checklist dokumen di bawah diatur sesuai aturan HRD dan dapat ditambah/diubah secara fleksibel.</p>

 <div id="offboarding-checklist-container" class="space-y-2 max-h-52 overflow-y-auto pr-1">
 <!-- Populated dynamically -->
 </div>
 </div>
 `;

 const taskBox = dynFields.querySelector("#handover-tasks-container");
 const btnAddRow = dynFields.querySelector("#btn-add-handover-row");

 function addHandoverRow(desc = "", pemahaman = "Paham (Siap Eksekusi)") {
 if (!taskBox) return;
 const row = document.createElement("div");
 row.className = "handover-task-row grid grid-cols-12 gap-2 items-center p-2 bg-white border border-slate-200 rounded-lg shadow-sm";
 row.innerHTML = `
 <div class="col-span-7">
 <input type="text" class="task-desc w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none focus:border-maroon-400 text-slate-800" placeholder="Cth: Rekapitulasi Laporan Kas & Berkas Utama" value="${escapeHtml(desc)}">
 </div>
 <div class="col-span-4">
 <select class="task-understanding w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md outline-none bg-white font-medium text-slate-700">
 <option value="Sangat Paham (Mandiri)" ${pemahaman === "Sangat Paham (Mandiri)" ? "selected" : ""}>Sangat Paham (Mandiri)</option>
 <option value="Paham (Siap Eksekusi)" ${pemahaman === "Paham (Siap Eksekusi)" ? "selected" : ""}>Paham (Siap Eksekusi)</option>
 <option value="Cukup (Perlu Review)" ${pemahaman === "Cukup (Perlu Review)" ? "selected" : ""}>Cukup (Perlu Review)</option>
 <option value="Perlu Pendampingan" ${pemahaman === "Perlu Pendampingan" ? "selected" : ""}>Perlu Pendampingan</option>
 </select>
 </div>
 <div class="col-span-1 text-center">
 <button type="button" class="btn-del-task px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition font-bold" title="Hapus Pekerjaan">Hapus</button>
 </div>
 `;

 row.querySelector(".btn-del-task").onclick = () => {
 if (taskBox.children.length > 1) {
 row.remove();
 } else {
 toast("Minimal 1 pekerjaan handover", "info");
 }
 };

 taskBox.appendChild(row);
 }

 // Starter default task rows
 addHandoverRow("Laporan harian, rekapitulasi data, dan file kerja operasional utama", "Paham (Siap Eksekusi)");
 addHandoverRow("Pengalihan kredensial akun, email, dan kewenangan pekerjaan", "Sangat Paham (Mandiri)");

 if (btnAddRow) {
 btnAddRow.onclick = () => addHandoverRow("", "Paham (Siap Eksekusi)");
 }

 // Assets & Uniforms editor container
 const offAssetBox = dynFields.querySelector("#offboarding-assets-container");
 const btnAddOffAsset = dynFields.querySelector("#btn-add-off-asset-row");

 function addOffAssetRow(item = {}) {
 if (!offAssetBox) return;
 const row = document.createElement("div");
 row.className = "off-asset-item-row grid grid-cols-12 gap-2 items-center p-2 bg-white border border-slate-200 rounded-lg shadow-sm";

    const namaVal = item.nama_barang || item.nama || "";
    const katVal = item.kategori || "Seragam & APD";
    const statusVal = item.status_pengembalian || "Diterima & Lengkap";
    const itemIdVal = item.id_item || item.id || "";
    const docIdVal = item.id_doc || (item.is_master_inventory ? item.id : "") || "";
    const isMasterVal = item.is_master_inventory ? "1" : "0";

    row.innerHTML = `
      <div class="col-span-5">
        <input type="text" class="asset-item-nama w-full px-2 py-1 text-xs border border-slate-300 rounded-md outline-none focus:border-maroon-400 font-medium text-slate-800" placeholder="Cth: Seragam Kerja 2 Stel / ID Card" value="${escapeHtml(namaVal)}">
        ${itemIdVal ? `<input type="hidden" class="asset-item-id" value="${escapeHtml(itemIdVal)}">` : ""}
        <input type="hidden" class="asset-item-doc-id" value="${escapeHtml(docIdVal)}">
        <input type="hidden" class="asset-item-is-master" value="${isMasterVal}">
      </div>
 <div class="col-span-3">
 <select class="asset-item-kategori w-full px-1.5 py-1 text-xs border border-slate-300 rounded-md outline-none bg-white font-medium text-slate-700">
 <option value="Seragam & APD" ${katVal === "Seragam & APD" ? "selected" : ""}>Seragam & APD</option>
 <option value="ID Card & Akses" ${katVal === "ID Card & Akses" ? "selected" : ""}>ID Card & Akses</option>
 <option value="Aset Kantor / Laptop" ${katVal === "Aset Kantor / Laptop" || katVal === "Elektronik" || katVal === "Laptop" ? "selected" : ""}>Aset / Laptop</option>
 <option value="Kendaraan / Kunci" ${katVal === "Kendaraan / Kunci" || katVal === "Kendaraan" ? "selected" : ""}>Kendaraan / Kunci</option>
 <option value="Lainnya" ${["Seragam & APD", "ID Card & Akses", "Aset Kantor / Laptop", "Kendaraan / Kunci"].includes(katVal) ? "" : "selected"}>Lainnya (${escapeHtml(katVal)})</option>
 </select>
 </div>
 <div class="col-span-3">
 <select class="asset-item-status w-full px-1.5 py-1 text-xs border border-slate-300 rounded-md outline-none bg-white font-medium text-slate-700">
 <option value="Diterima & Lengkap" ${statusVal === "Diterima & Lengkap" ? "selected" : ""}>Diterima & Lengkap</option>
 <option value="Dikembalikan (Rusak)" ${statusVal.includes("Rusak") ? "selected" : ""}>Dikembalikan (Rusak)</option>
 <option value="Hilang / Potong Gaji" ${statusVal.includes("Hilang") || statusVal.includes("Potong") ? "selected" : ""}>Hilang / Potong Gaji</option>
 <option value="Dalam Proses" ${statusVal.includes("Proses") ? "selected" : ""}>Dalam Proses</option>
 </select>
 </div>
 <div class="col-span-1 text-center">
 <button type="button" class="btn-del-off-asset text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Barang"></button>
 </div>
 `;

 row.querySelector(".btn-del-off-asset").onclick = () => {
 row.remove();
 };

 offAssetBox.appendChild(row);
 }

 if (btnAddOffAsset) {
 btnAddOffAsset.onclick = () => addOffAssetRow({ nama_barang: "", kategori: "Seragam & APD", status_pengembalian: "Diterima & Lengkap" });
 }

 async function populateOffboardingAssets() {
    if (!offAssetBox) return;
    offAssetBox.innerHTML = `<p class="text-xs text-slate-400 text-center py-2 col-span-12">Memuat data aset & ATK karyawan...</p>`;

    let combinedAssets = [];
    if (currentSelectedKaryawan) {
      try {
        const targetName = (currentSelectedKaryawan.nama_karyawan || "").trim().toLowerCase();
        
        // 1. Ambil dari Master Inventaris (Aset / Laptop / Kendaraan)
        const allInventory = (await fsGetAll(COL.MASTER_INVENTORY)) || [];
        const invItems = allInventory.filter(a => {
          const assign = (a.assigned_to || "").trim().toLowerCase();
          const place = (a.penempatan || "").trim().toLowerCase();
          const holder = (a.pemegang || "").trim().toLowerCase();
          return (assign && assign.includes(targetName)) || 
                 (place && place.includes(targetName)) || 
                 (holder && holder.includes(targetName));
        });

        // 2. Ambil dari Log Pengambilan & Serah Terima ATK / Barang
        const allLogs = (await fsGetAll(COL.LOG_INVENTORY_PENGAMBILAN)) || [];
        const logItems = allLogs.filter(l => {
          const emp = (l.nama_karyawan || "").trim().toLowerCase();
          return emp === targetName;
        });

        const itemMap = new Map();

        invItems.forEach(a => {
          const key = (a.id_item || a.id || a.nama_barang).toLowerCase();
          itemMap.set(key, {
            id_doc: a.id,
            id_item: a.id_item || a.id,
            is_master_inventory: true,
            nama_barang: a.nama_barang,
            kategori: a.kategori || "Aset Kantor / Laptop",
            status_pengembalian: "Diterima & Lengkap"
          });
        });

        logItems.forEach(l => {
          const key = (l.id_barang || l.nama_barang).toLowerCase();
          if (!itemMap.has(key)) {
            const qtyStr = l.jumlah_ambil ? ` (${l.jumlah_ambil} ${l.satuan || "Pcs"})` : "";
            itemMap.set(key, {
              id_doc: "",
              id_item: l.id_barang || ("LOG-" + l.id),
              is_master_inventory: false,
              nama_barang: l.nama_barang + qtyStr,
              kategori: l.kategori || "Pengambilan ATK / Barang",
              status_pengembalian: "Diterima & Lengkap"
            });
          }
        });

        combinedAssets = Array.from(itemMap.values());
      } catch (e) {
        console.warn("Error fetching employee inventory & ATK assets:", e);
      }
    }

    offAssetBox.innerHTML = "";
    if (combinedAssets && combinedAssets.length > 0) {
      combinedAssets.forEach(a => addOffAssetRow({
        id_doc: a.id_doc,
        id_item: a.id_item,
        is_master_inventory: a.is_master_inventory,
        nama_barang: a.nama_barang,
        kategori: a.kategori,
        status_pengembalian: a.status_pengembalian || "Diterima & Lengkap"
      }));
    }

    // Pre-populate standard defaults if not present
    if (!combinedAssets.some(a => (a.nama_barang || "").toLowerCase().includes("id card"))) {
      addOffAssetRow({
        id_doc: "",
        id_item: "IDC-01",
        is_master_inventory: false,
        nama_barang: "ID Card & Lanyard Akses Perusahaan",
        kategori: "ID Card & Akses",
        status_pengembalian: "Diterima & Lengkap"
      });
    }
    if (!combinedAssets.some(a => (a.nama_barang || "").toLowerCase().includes("seragam"))) {
      addOffAssetRow({
        id_doc: "",
        id_item: "SRG-01",
        is_master_inventory: false,
        nama_barang: "Seragam Kerja Kantor (2 Stel)",
        kategori: "Seragam & APD",
        status_pengembalian: "Diterima & Lengkap"
      });
    }
  }

  populateOffboardingAssets();

 // Checklist items container and default loader
 const chkBox = dynFields.querySelector("#offboarding-checklist-container");
 const btnAddChk = dynFields.querySelector("#btn-add-checklist-row");

 function addChecklistRow(itemText = "") {
 if (!chkBox) return;
 const row = document.createElement("div");
 row.className = "checklist-item-row flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg shadow-sm";
 row.innerHTML = `
 <span class="text-xs font-bold text-slate-400 font-mono">[v]</span>
 <input type="text" class="chk-item-text w-full px-2.5 py-1 text-xs border border-slate-200 rounded-md outline-none focus:border-maroon-400 text-slate-800 font-medium" placeholder="Cth: Surat Bebas Tunggakan / Form Exit Clearance" value="${escapeHtml(itemText)}">
 <button type="button" class="btn-del-chk text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Item"></button>
 `;
 row.querySelector(".btn-del-chk").onclick = () => {
 if (chkBox.children.length > 1) {
 row.remove();
 } else {
 toast("Minimal 1 item checklist", "info");
 }
 };

 chkBox.appendChild(row);
 }

 function populateDefaultChecklists(reason) {
 if (!chkBox) return;
 chkBox.innerHTML = "";
 let defaults = [];
 if (reason === "Habis Kontrak") {
 defaults = [
 "Surat Pemberitahuan Berakhirnya Kontrak Kerja (PKWT)",
 "Form Evaluasi & Penilaian Kinerja Kontrak (HRD)",
 "Form Exit Interview HRD",
 "Form Serah Terima Pekerjaan & Aset Perusahaan",
 "Perhitungan & Bukti Pembayaran Kompensasi PKWT (PP 35/2021)",
 "Penerbitan Surat Keterangan Kerja (Paklaring HRD)",
 "Penonaktifan BPJS & Akses Sistem / Email Perusahaan"
 ];
 } else if (reason === "Resign" || reason === "Mangkir") {
 defaults = ["Surat Pengunduran Diri Resmi", "Form Exit Interview HRD", "Form Serah Terima Aset & Kerahasiaan", "Surat Keterangan Penonaktifan BPJS"];
 } else if (reason === "PHK Efisiensi") {
 defaults = ["Surat Pemberitahuan PHK", "Perjanjian Bersama (Bipartit)", "Form Pengembalian Aset Perusahaan", "Pencabutan Akses Sistem & Email", "Penerbitan Paklaring HRD"];
 } else if (reason === "Pelanggaran Berat") {
 defaults = ["BAP (Berita Acara Pemeriksaan)", "SK Pemutusan Hubungan Kerja (PHK)", "Bukti Kronologi Pelanggaran (Saksi)", "Tanda Terima Pengembalian Aset"];
 } else if (reason === "Pensiun") {
 defaults = ["Surat Keputusan Pensiun Karyawan", "Formulir Pencairan BPJS JHT & JP", "Penyerahan Piagam Penghargaan / Tali Asih", "Serah Terima Pekerjaan kepada Tim"];
 } else {
 defaults = ["Surat Clearance HRD", "Serah Terima Pekerjaan", "Pengembalian Aset ID Card & Peralatan Kerja"];
 }
 defaults.forEach(d => addChecklistRow(d));
 }

 const selAlasan = dynFields.querySelector("#off-alasan");
 if (selAlasan) {
 populateDefaultChecklists(selAlasan.value);
 selAlasan.addEventListener("change", () => populateDefaultChecklists(selAlasan.value));
 }

 if (btnAddChk) {
 btnAddChk.onclick = () => addChecklistRow("");
 }
 } else if (["Mutasi", "Promosi", "Demosi"].includes(jenis)) {
 dynFields.innerHTML = `
 <div class="grid grid-cols-2 gap-4">
 <div><label class="block text-xs font-bold text-slate-500 mb-1">Jabatan Saat Ini</label><input type="text" id="lama-jabatan" value="${jabLama}" readonly class="w-full px-3 py-2 text-sm border rounded-lg bg-slate-100 outline-none text-slate-500 border-transparent"></div>
 <div><label class="block text-xs font-bold text-slate-500 mb-1">Cabang Saat Ini</label><input type="text" id="lama-cabang" value="${cabLama}" readonly class="w-full px-3 py-2 text-sm border rounded-lg bg-slate-100 outline-none text-slate-500 border-transparent"></div>
 </div>
 <div class="flex items-center gap-3">
 <div class="h-px bg-slate-200 flex-1"></div><span class="text-[10px] font-bold text-maroon-700 uppercase">Posisi Baru</span><div class="h-px bg-slate-200 flex-1"></div>
 </div>
 <div class="grid grid-cols-2 gap-4">
 <div><label class="block text-xs font-bold text-maroon-700 mb-1">Jabatan Baru</label><input type="text" id="baru-jabatan" required class="w-full px-3 py-2 text-sm border border-maroon-200 rounded-lg outline-none focus:border-maroon-500 focus:ring-2 focus:ring-maroon-50"></div>
 <div><label class="block text-xs font-bold text-maroon-700 mb-1">Cabang Baru</label><input type="text" id="baru-cabang" required class="w-full px-3 py-2 text-sm border border-maroon-200 rounded-lg outline-none focus:border-maroon-500 focus:ring-2 focus:ring-maroon-50"></div>
 </div>
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Efektif</label><input type="date" id="mutasi-tgl" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400"></div>
 <div><label class="block text-xs font-bold text-slate-600 mb-1">No. SK Direksi</label><input type="text" id="mutasi-sk" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400" placeholder="Opsi"></div>
 </div>
 <div><label class="block text-xs font-medium text-slate-500 mb-1">Catatan</label><textarea id="mutasi-catatan" rows="2" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400"></textarea></div>
 `;
 } else if (jenis === "Onboarding") {
 const todayStr = new Date().toISOString().split("T")[0];
 dynFields.innerHTML = `
 <div class="grid grid-cols-2 gap-4">
 <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Bergabung</label><input type="date" id="onb-tgl" value="${todayStr}" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400"></div>
 <div>
 <label class="block text-xs font-bold text-slate-600 mb-1">Tipe Kontrak</label>
 <select id="onb-status" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400 bg-white">
 <option value="PKWTT">PKWTT (Tetap)</option>
 <option value="PKWT">PKWT (Kontrak)</option>
 <option value="PROBATION">Probation / Masa Percobaan</option>
 </select>
 </div>
 </div>
 <div><label class="block text-xs font-medium text-slate-500 mb-1">Catatan Fasilitas Karyawan</label><textarea id="onb-catatan" rows="2" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400" placeholder="Cth: Diberikan ID Card, Seragam, Laptop kantor, Kunci Loker..."></textarea></div>

 <!-- KUSTOMISASI PENGENALAN LINGKUNGAN KANTOR (ORIENTASI) -->
 <div class="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 mt-2">
 <div class="flex items-center justify-between">
 <div>
 <label class="block text-xs font-bold text-slate-700">Pengenalan Lingkungan Kantor & Orientasi</label>
 <p class="text-[10px] text-slate-500">Kustomisasi item orientasi fisik, perkenalan tim, serta pengenalan fasilitas/SOP kantor.</p>
 </div>
 <button type="button" id="btn-add-orientasi-row" class="px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 transition flex items-center gap-1 shadow-sm shrink-0">
 + Tambah Item Orientasi
 </button>
 </div>

 <div class="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-600 px-2 pt-1 border-b border-slate-200 pb-1">
 <div class="col-span-7">Item / Topik Pengenalan Kantor</div>
 <div class="col-span-4">Status Progress</div>
 <div class="col-span-1 text-center">Aksi</div>
 </div>

 <div id="orientasi-container" class="space-y-2 max-h-52 overflow-y-auto pr-1">
 <!-- Populated dynamically -->
 </div>
 </div>

 <!-- KUSTOMISASI MATERI TRAINING & PEMBEKALAN KARYAWAN -->
 <div class="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 mt-2">
 <div class="flex items-center justify-between">
 <div>
 <label class="block text-xs font-bold text-slate-700">Materi Training & Pembekalan Karyawan Baru</label>
 <p class="text-[10px] text-slate-500">Materi training yang disampaikan beserta nama pemateri/trainer dan progress pemahaman.</p>
 </div>
 <button type="button" id="btn-add-training-row" class="px-2.5 py-1 text-[11px] font-bold text-maroon-700 bg-white border border-maroon-200 rounded-lg hover:bg-maroon-50 transition flex items-center gap-1 shadow-sm shrink-0">
 + Tambah Materi Training
 </button>
 </div>

 <div class="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-600 px-2 pt-1 border-b border-slate-200 pb-1">
 <div class="col-span-5">Materi / Modul Training</div>
 <div class="col-span-3">Trainer / Pemateri</div>
 <div class="col-span-3">Status Progress</div>
 <div class="col-span-1 text-center">Aksi</div>
 </div>

 <div id="training-container" class="space-y-2 max-h-52 overflow-y-auto pr-1">
 <!-- Populated dynamically -->
 </div>
 </div>
 `;

 const orientasiBox = dynFields.querySelector("#orientasi-container");
 const btnAddOrientasi = dynFields.querySelector("#btn-add-orientasi-row");

 function addOrientasiRow(topik = "", status = "Selesai (100%)") {
 if (!orientasiBox) return;
 const row = document.createElement("div");
 row.className = "orientasi-row grid grid-cols-12 gap-2 items-center p-2 bg-white border border-slate-200 rounded-lg shadow-sm";
 row.innerHTML = `
 <div class="col-span-7">
 <input type="text" class="orientasi-topik w-full px-2 py-1 text-xs border border-slate-300 rounded-md outline-none focus:border-maroon-400 font-medium text-slate-800" placeholder="Cth: Tur Fasilitas & Ruang Kerja / Tata Tertib" value="${escapeHtml(topik)}">
 </div>
 <div class="col-span-4">
 <select class="orientasi-status w-full px-1.5 py-1 text-xs border border-slate-300 rounded-md outline-none bg-white font-medium text-slate-700">
 <option value="Selesai (100%)" ${status === "Selesai (100%)" ? "selected" : ""}>Selesai (100%)</option>
 <option value="Sedang Berlangsung (50%)" ${status.includes("50%") || status.includes("Sedang") ? "selected" : ""}>Sedang Berlangsung (50%)</option>
 <option value="Belum Dilakukan (0%)" ${status.includes("0%") || status.includes("Belum") ? "selected" : ""}>Belum Dilakukan (0%)</option>
 </select>
 </div>
 <div class="col-span-1 text-center">
 <button type="button" class="btn-del-orientasi text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Item"></button>
 </div>
 `;
 row.querySelector(".btn-del-orientasi").onclick = () => {
 if (orientasiBox.children.length > 1) {
 row.remove();
 } else {
 toast("Minimal 1 item orientasi lingkungan kantor", "info");
 }
 };
 orientasiBox.appendChild(row);
 }

 // Standard initial defaults for Office Environment Orientation
 addOrientasiRow("Tur Fasilitas Kantor, Ruang Kerja & Area Umum", "Selesai (100%)");
 addOrientasiRow("Perkenalan Tim Divisi, Atasan & Manajemen Direct", "Selesai (100%)");
 addOrientasiRow("Sosialisasi Peraturan Perusahaan, Jam Kerja & SOP", "Selesai (100%)");
 addOrientasiRow("Penyerahan Akses Wi-Fi, Portal HRIS & Email Kerja", "Selesai (100%)");

 if (btnAddOrientasi) {
 btnAddOrientasi.onclick = () => addOrientasiRow("", "Selesai (100%)");
 }

 const trainingBox = dynFields.querySelector("#training-container");
 const btnAddTraining = dynFields.querySelector("#btn-add-training-row");

 function addTrainingRow(materi = "", trainer = "HRD / Atasan", status = "Selesai & Lulus") {
 if (!trainingBox) return;
 const row = document.createElement("div");
 row.className = "training-row grid grid-cols-12 gap-2 items-center p-2 bg-white border border-slate-200 rounded-lg shadow-sm";
 row.innerHTML = `
 <div class="col-span-5">
 <input type="text" class="training-materi w-full px-2 py-1 text-xs border border-slate-300 rounded-md outline-none focus:border-maroon-400 font-medium text-slate-800" placeholder="Cth: Product Knowledge / SOP Operasional" value="${escapeHtml(materi)}">
 </div>
 <div class="col-span-3">
 <input type="text" class="training-trainer w-full px-2 py-1 text-xs border border-slate-300 rounded-md outline-none focus:border-maroon-400 font-medium text-slate-700" placeholder="Pemateri / HRD" value="${escapeHtml(trainer)}">
 </div>
 <div class="col-span-3">
 <select class="training-status w-full px-1.5 py-1 text-xs border border-slate-300 rounded-md outline-none bg-white font-medium text-slate-700">
 <option value="Selesai & Lulus" ${status === "Selesai & Lulus" ? "selected" : ""}>Selesai & Lulus</option>
 <option value="Sedang Training" ${status.includes("Sedang") ? "selected" : ""}>Sedang Training</option>
 <option value="Perlu Evaluasi" ${status.includes("Evaluasi") ? "selected" : ""}>Perlu Evaluasi</option>
 <option value="Belum Disampaikan" ${status.includes("Belum") ? "selected" : ""}>Belum Disampaikan</option>
 </select>
 </div>
 <div class="col-span-1 text-center">
 <button type="button" class="btn-del-training text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Modul"></button>
 </div>
 `;
 row.querySelector(".btn-del-training").onclick = () => {
 if (trainingBox.children.length > 1) {
 row.remove();
 } else {
 toast("Minimal 1 materi training onboarding", "info");
 }
 };
 trainingBox.appendChild(row);
 }

 // Standard initial defaults for Training
 addTrainingRow("Company Profile, Budaya & Visi Misi Perusahaan", "HRD Manager", "Selesai & Lulus");
 addTrainingRow("Product Knowledge & Standard Operating Procedure (SOP)", "Atasan Direct", "Selesai & Lulus");
 addTrainingRow("Sistem Operational, Tool Kerja & Aplikasi HRIS", "IT / HRD Admin", "Sedang Training");

 if (btnAddTraining) {
 btnAddTraining.onclick = () => addTrainingRow("", "Atasan Direct", "Selesai & Lulus");
 }
 }
 }

if (btnKalkulasi) {
 btnKalkulasi.addEventListener("click", async () => {
 const form = container.querySelector("#form-siklus");
 if (!form.reportValidity()) return;
 if (!isNewHireOnboarding && !currentSelectedKaryawan) return toast("Pilih Karyawan terlebih dahulu", "warning");

 const jenis = selJenis.value;
 let previewHtml = "";

 let payloadLog = isNewHireOnboarding ? {
 id_karyawan: null, // diisi setelah record master_karyawan baru dibuat saat final save
 nama_karyawan: container.querySelector("#onb-nama").value.trim(),
 jenis_siklus: jenis,
 tanggal_proses: new Date().toISOString()
 } : {
 id_karyawan: currentSelectedKaryawan.id,
 nama_karyawan: currentSelectedKaryawan.nama_karyawan,
 jenis_siklus: jenis,
 tanggal_proses: new Date().toISOString()
 };

 if (jenis === "Offboarding") {
 const join = new Date(container.querySelector("#off-join").value);
 const out = new Date(container.querySelector("#off-out").value);
 const gaji = parseFloat(container.querySelector("#off-gaji").value) || 0;
 const alasan = container.querySelector("#off-alasan").value;
 const penggantiVal = container.querySelector("#off-pengganti") ? container.querySelector("#off-pengganti").value.trim() : "";
 const catatanHandoverVal = container.querySelector("#off-catatan-handover") ? container.querySelector("#off-catatan-handover").value.trim() : "";

 // Collect dynamic handover task rows
 const taskRows = Array.from(container.querySelectorAll(".handover-task-row"));
 let handoverTasksList = taskRows.map(row => {
 const d = row.querySelector(".task-desc")?.value.trim();
 const u = row.querySelector(".task-understanding")?.value || "Paham (Siap Eksekusi)";
 return d ? { pekerjaan: d, pemahaman: u } : null;
 }).filter(Boolean);

 if (handoverTasksList.length === 0 && catatanHandoverVal) {
 handoverTasksList.push({ pekerjaan: catatanHandoverVal, pemahaman: "Paham (Siap Eksekusi)" });
 }

 let diffTime = out - join;
 if (diffTime < 0) diffTime = 0;
 const years = diffTime / (1000 * 3600 * 24 * 365.25);
 const mathYears = Math.floor(years); 

 const hitungUangPisah = (y, upah) => {
 if (y >= 9) return 4 * upah;
 if (y >= 6) return 3 * upah;
 if (y >= 3) return 2 * upah;
 return 0;
 };

 const hitungPesangon = (y, upah) => {
 let bln = y + 1;
 if (bln > 9) bln = 9;
 return bln * upah;
 };

 const hitungUPMK = (y, upah) => {
 if (y >= 24) return 10 * upah;
 if (y >= 21) return 8 * upah;
 if (y >= 18) return 7 * upah;
 if (y >= 15) return 6 * upah;
 if (y >= 12) return 5 * upah;
 if (y >= 9) return 4 * upah;
 if (y >= 6) return 3 * upah;
 if (y >= 3) return 2 * upah;
 return 0;
 };

 let pesangon = 0, upmk = 0, uangPisah = 0;
 let checklist = [];

 // Collect custom checklist items from form inputs
 const customChkInputs = dynFields.querySelectorAll(".chk-item-text");
 if (customChkInputs && customChkInputs.length) {
 customChkInputs.forEach(i => {
 const v = i.value.trim();
 if (v) checklist.push(v);
 });
 }

 if (alasan === "Habis Kontrak") {
 const totalMonths = Math.max(1, Math.floor(diffTime / (1000 * 3600 * 24 * 30.4375)));
 uangPisah = Math.round((totalMonths / 12) * gaji); // Uang Kompensasi PKWT (PP 35/2021)
 if (!checklist.length) checklist = [
 "Surat Pemberitahuan Berakhirnya Kontrak Kerja (PKWT)",
 "Form Evaluasi & Penilaian Kinerja Kontrak (HRD)",
 "Form Exit Interview HRD",
 "Form Serah Terima Pekerjaan & Aset Perusahaan",
 "Perhitungan & Bukti Pembayaran Kompensasi PKWT (PP 35/2021)",
 "Penerbitan Surat Keterangan Kerja (Paklaring HRD)",
 "Penonaktifan BPJS & Akses Sistem / Email Perusahaan"
 ];
 } else if (alasan === "Resign" || alasan === "Mangkir") {
 uangPisah = hitungUangPisah(mathYears, gaji);
 if (!checklist.length) checklist = ["Surat Pengunduran Diri Resmi", "Form Exit Interview HRD", "Form Serah Terima Aset & Kerahasiaan", "Surat Keterangan Penonaktifan BPJS"];
 } else if (alasan === "PHK Efisiensi") {
 pesangon = hitungPesangon(mathYears, gaji); 
 upmk = hitungUPMK(mathYears, gaji);
 if (!checklist.length) checklist = ["Surat Pemberitahuan PHK", "Perjanjian Bersama (Bipartit)", "Form Pengembalian Aset Perusahaan", "Pencabutan Akses Sistem & Email", "Penerbitan Paklaring HRD"];
 } else if (alasan === "Pelanggaran Berat") {
 uangPisah = hitungUangPisah(mathYears, gaji);
 if (!checklist.length) checklist = ["BAP (Berita Acara Pemeriksaan)", "SK Pemutusan Hubungan Kerja (PHK)", "Bukti Kronologi Pelanggaran (Saksi)", "Tanda Terima Pengembalian Aset"];
 } else if (alasan === "Pensiun") {
 pesangon = hitungPesangon(mathYears, gaji) * 1.75; 
 upmk = hitungUPMK(mathYears, gaji);
 if (!checklist.length) checklist = ["Surat Keputusan Pensiun Karyawan", "Formulir Pencairan BPJS JHT & JP", "Penyerahan Piagam Penghargaan / Tali Asih", "Serah Terima Pekerjaan kepada Tim"];
 }

 // Collect custom assets / uniforms / equipment rows from form inputs
    const offAssetRows = Array.from(dynFields.querySelectorAll(".off-asset-item-row"));
    let assignedAssets = offAssetRows.map(row => {
      const nama = row.querySelector(".asset-item-nama")?.value.trim();
      const kat = row.querySelector(".asset-item-kategori")?.value || "Seragam & APD";
      const stat = row.querySelector(".asset-item-status")?.value || "Diterima & Lengkap";
      const idVal = row.querySelector(".asset-item-id")?.value || "";
      const docIdVal = row.querySelector(".asset-item-doc-id")?.value || "";
      const isMaster = row.querySelector(".asset-item-is-master")?.value === "1";
      return nama ? {
        id: docIdVal || idVal,
        id_item: idVal,
        id_doc: docIdVal,
        is_master_inventory: isMaster,
        nama_barang: nama,
        kategori: kat,
        status_pengembalian: stat
      } : null;
    }).filter(Boolean);

 payloadLog.tanggal_efektif = out.toISOString();
 payloadLog.keterangan = `Alasan: ${alasan}${penggantiVal ? ` | Pengganti: ${penggantiVal}` : ''}`;
 payloadLog.detail_offboarding = { 
 masa_kerja_tahun: mathYears, 
 pesangon, 
 upmk, 
 uang_pisah: uangPisah, 
 karyawan_pengganti: penggantiVal, 
 catatan_handover: catatanHandoverVal,
 handover_tasks: handoverTasksList,
 checklist_doc: checklist,
 assigned_assets: assignedAssets 
 };
 payloadLog.update_master = { aktif_tdk_aktif: "TIDAK AKTIF" }; 

 previewHtml = `
 <div class="mb-4">
 <p class="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Lama Masa Kerja</p>
 <p class="text-xl font-black text-slate-800">${mathYears} Tahun <span class="text-sm font-medium text-slate-500">(${(years).toFixed(1)} Thn riil)</span></p>
 </div>

 ${penggantiVal ? `
 <div class="p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-xs">
 <p class="font-bold text-maroon-800">Karyawan Pengganti (Penerima Handover):</p>
 <p class="font-black text-slate-800 text-sm mt-0.5">${escapeHtml(penggantiVal)}</p>
 ${catatanHandoverVal ? `<p class="text-[11px] text-slate-600 mt-1 italic">"${escapeHtml(catatanHandoverVal)}"</p>` : ''}
 </div>
 ` : ''}

 ${handoverTasksList.length ? `
 <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4 text-xs">
 <p class="font-bold text-blue-900 mb-2">Daftar Pekerjaan Handover & Pemahaman Pengganti:</p>
 <div class="space-y-1.5">
 ${handoverTasksList.map((t, idx) => `
 <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-blue-100 gap-2">
 <span class="font-bold text-slate-800">${idx + 1}. ${escapeHtml(t.pekerjaan)}</span>
 <span class="px-2.5 py-0.5 text-[10px] font-bold text-blue-800 bg-blue-100 rounded-md shrink-0">${escapeHtml(t.pemahaman)}</span>
 </div>
 `).join("")}
 </div>
 </div>
 ` : ''}

 <div class="space-y-2 mb-6">
 <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Pesangon (Psl 58)</span><span class="font-bold text-maroon-700">${fmtRupiah(pesangon)}</span></div>
 <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Penghargaan Masa Kerja</span><span class="font-bold text-maroon-700">${fmtRupiah(upmk)}</span></div>
 <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Pisah (Psl 61/62)</span><span class="font-bold text-maroon-700">${fmtRupiah(uangPisah)}</span></div>
 <div class="p-3 bg-amber-50 rounded-lg border border-amber-200 flex justify-between items-center"><span class="text-xs font-bold text-amber-700">Sisa Cuti / Penggantian Hak</span><span class="font-bold text-amber-700 text-xs text-right">Dihitung manual<br/>oleh HR/Finance</span></div>
 </div>

 <!-- CHECKLIST ASET, SERAGAM & BARANG TERKAIT UNTUK CLEARANCE -->
 <div class="mb-6">
 <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center justify-between">
 <span>Checklist Pengembalian Aset, Seragam & Barang (Clearance)</span>
 <span class="text-[10px] bg-red-100 text-maroon-800 font-bold px-2 py-0.5 rounded-full">${assignedAssets.length} Barang Clearance</span>
 </p>
 <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
 ${assignedAssets.length === 0 ? `
 <p class="text-xs text-slate-400 italic text-center py-2">Tidak ada daftar aset/seragam/barang yang dicatat.</p>
 ` : assignedAssets.map(a => `
 <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs gap-2">
 <div>
 <p class="font-bold text-slate-800">${escapeHtml(a.nama_barang)} ${a.id_item ? `<span class="font-mono text-[10px] text-slate-400">(${escapeHtml(a.id_item)})</span>` : ''}</p>
 <p class="text-[10px] text-slate-500">${escapeHtml(a.kategori || "Aset")}</p>
 </div>
 <span class="px-2 py-1 text-[10px] font-bold ${a.status_pengembalian.includes('Hilang') || a.status_pengembalian.includes('Rusak') ? 'text-rose-800 bg-rose-50 border border-rose-200' : 'text-emerald-800 bg-emerald-50 border border-emerald-200'} rounded-lg">${escapeHtml(a.status_pengembalian || "Diterima & Lengkap")}</span>
 </div>
 `).join("")}
 </div>
 </div>

 <div class="mb-6">
 <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Checklist Dokumen Wajib</p>
 <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
 ${checklist.map(c => `
 <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
 <input type="checkbox" checked class="mt-1 w-4 h-4 rounded border-slate-300 text-maroon-700 focus:ring-maroon-400"> <span>${escapeHtml(c)}</span>
 </label>
 `).join("")}
 </div>
 </div>

 <button type="button" id="btn-print-clearance-doc" class="w-full bg-maroon-700 hover:bg-maroon-800 text-white font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2 text-xs mb-4">
 Cetak & Unduh Surat Exit Clearance (PDF)
 </button>
 `;
 } 
 else if (["Mutasi", "Promosi", "Demosi"].includes(jenis)) {
 const tglEfektif = container.querySelector("#mutasi-tgl").value;
 const jLama = container.querySelector("#lama-jabatan").value;
 const cLama = container.querySelector("#lama-cabang").value;
 const jBaru = container.querySelector("#baru-jabatan").value.trim();
 const cBaru = container.querySelector("#baru-cabang").value.trim();
 const sk = container.querySelector("#mutasi-sk").value.trim();
 const cat = container.querySelector("#mutasi-catatan").value.trim();

 payloadLog.tanggal_efektif = new Date(tglEfektif).toISOString();
 payloadLog.keterangan = cat || `${jenis} Jabatan`;
 payloadLog.detail_mutasi = { jabatan_lama: jLama, cabang_lama: cLama, jabatan_baru: jBaru, cabang_baru: cBaru, no_sk: sk };
 payloadLog.update_master = { jabatan: jBaru, cabang: cBaru }; 

 previewHtml = `
 <div class="bg-white p-4 rounded-xl border border-slate-200 mb-5 text-center">
 <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Peta Perubahan Jabatan</p>
 <div class="flex items-center justify-center gap-4">
 <div class="flex-1 text-right">
 <p class="text-base font-bold text-slate-800">${escapeHtml(jLama)}</p>
 <p class="text-xs text-slate-500 font-medium">${escapeHtml(cLama)}</p>
 </div>
 <div class="w-10 h-10 shrink-0 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center border-4 border-white shadow-sm">-></div>
 <div class="flex-1 text-left">
 <p class="text-base font-black text-maroon-700">${escapeHtml(jBaru)}</p>
 <p class="text-xs text-maroon-600 font-medium">${escapeHtml(cBaru)}</p>
 </div>
 </div>
 </div>
 <div>
 <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Checklist Dokumen Mutasi</p>
 <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
 <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> SK Direksi / Surat Penugasan (Bipartit)</label>
 <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Berita Acara Serah Terima Jabatan</label>
 <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Penyesuaian Akses Sistem / Portal / Grup WhatsApp</label>
 </div>
 </div>
 `;
 }
 else if (jenis === "Onboarding") {
 const tgl = container.querySelector("#onb-tgl").value;
 const cat = container.querySelector("#onb-catatan").value.trim();
 const stat = container.querySelector("#onb-status").value;
 const nomaBaru = container.querySelector("#onb-nama").value.trim();
 const emailBaru = container.querySelector("#onb-email").value.trim();

 if (!nomaBaru || !emailBaru) { toast("Nama dan Email karyawan baru wajib diisi", "warning"); return; }

 // Collect Orientasi items
 const orientasiRows = Array.from(dynFields.querySelectorAll(".orientasi-row"));
 let orientasiList = orientasiRows.map(r => {
 const t = r.querySelector(".orientasi-topik")?.value.trim();
 const s = r.querySelector(".orientasi-status")?.value || "Selesai (100%)";
 return t ? { topik: t, status: s } : null;
 }).filter(Boolean);

 // Collect Training items
 const trainingRows = Array.from(dynFields.querySelectorAll(".training-row"));
 let trainingList = trainingRows.map(r => {
 const m = r.querySelector(".training-materi")?.value.trim();
 const tr = r.querySelector(".training-trainer")?.value.trim() || "HRD / Atasan";
 const s = r.querySelector(".training-status")?.value || "Selesai & Lulus";
 return m ? { materi: m, trainer: tr, status: s } : null;
 }).filter(Boolean);

 // Calculate completion rate
 let completedOrientasi = orientasiList.filter(o => o.status.includes("100%")).length;
 let completedTraining = trainingList.filter(t => t.status.includes("Lulus") || t.status.includes("Selesai")).length;
 let totalItems = orientasiList.length + trainingList.length;
 let completedCount = completedOrientasi + completedTraining;
 let progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 100;

 payloadLog.nama_karyawan = nomaBaru;
 payloadLog.tanggal_efektif = new Date(tgl).toISOString();
 payloadLog.keterangan = cat || `Onboarding Karyawan Baru (${progressPercent}% Progress)`;

 payloadLog.detail_onboarding = {
 orientasi_items: orientasiList,
 training_items: trainingList,
 catatan_fasilitas: cat,
 tipe_kontrak: stat,
 tanggal_join: tgl,
 progress_persen: progressPercent,
 nik: container.querySelector("#onb-nik").value.trim(),
 email: emailBaru,
 jabatan: container.querySelector("#onb-jabatan").value.trim(),
 cabang: container.querySelector("#onb-cabang").value.trim()
 };

 payloadLog.new_employee_data = {
 nama_karyawan: nomaBaru,
 nik_karyawan: container.querySelector("#onb-nik").value.trim(),
 email: emailBaru,
 no_hp_aktif: container.querySelector("#onb-hp").value.trim(),
 jabatan: container.querySelector("#onb-jabatan").value.trim(),
 cabang: container.querySelector("#onb-cabang").value.trim(),
 atasan: container.querySelector("#onb-atasan").value.trim(),
 alamat: container.querySelector("#onb-alamat").value.trim(),
 tanggal_join: tgl,
 status_karyawan: stat,
 aktif_tdk_aktif: "AKTIF"
 };

 previewHtml = `
 <div class="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
 <div>
 <p class="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Karyawan Baru (Onboarding)</p>
 <p class="text-lg font-bold text-slate-800">${escapeHtml(nomaBaru)}</p>
 <p class="text-xs text-slate-500">${escapeHtml(container.querySelector("#onb-jabatan").value.trim() || "-")} • ${escapeHtml(stat)}</p>
 </div>
 <div class="text-right">
 <p class="text-[10px] text-slate-500 uppercase font-bold">Total Progress</p>
 <span class="px-2.5 py-1 text-xs font-black rounded-lg ${progressPercent >= 80 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}">
 ${progressPercent}% Selesai
 </span>
 </div>
 </div>

 <!-- REKAP PENGENALAN LINGKUNGAN KANTOR -->
 <div class="mb-4">
 <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center justify-between">
 <span>1. Pengenalan Lingkungan Kantor (Orientasi)</span>
 <span class="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">${orientasiList.length} Item</span>
 </p>
 <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
 ${orientasiList.length === 0 ? `
 <p class="text-xs text-slate-400 italic text-center py-2">Belum ada item orientasi lingkungan kantor.</p>
 ` : orientasiList.map((o, idx) => `
 <div class="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs gap-2">
 <span class="font-medium text-slate-800">${idx + 1}. ${escapeHtml(o.topik)}</span>
 <span class="px-2 py-0.5 text-[10px] font-bold ${o.status.includes('100%') ? 'text-emerald-800 bg-emerald-100 border border-emerald-200' : 'text-amber-800 bg-amber-100 border border-amber-200'} rounded-md shrink-0">${escapeHtml(o.status)}</span>
 </div>
 `).join("")}
 </div>
 </div>

 <!-- REKAP MATERI TRAINING & PEMBEKALAN -->
 <div class="mb-4">
 <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center justify-between">
 <span>2. Materi Training & Pembekalan</span>
 <span class="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">${trainingList.length} Modul</span>
 </p>
 <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
 ${trainingList.length === 0 ? `
 <p class="text-xs text-slate-400 italic text-center py-2">Belum ada materi training yang dicatat.</p>
 ` : trainingList.map((t, idx) => `
 <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs gap-2">
 <div>
 <p class="font-bold text-slate-800">${idx + 1}. ${escapeHtml(t.materi)}</p>
 <p class="text-[10px] text-slate-500">Trainer: ${escapeHtml(t.trainer)}</p>
 </div>
 <span class="px-2 py-0.5 text-[10px] font-bold ${t.status.includes('Lulus') || t.status.includes('Selesai') ? 'text-emerald-800 bg-emerald-100 border border-emerald-200' : 'text-blue-800 bg-blue-100 border border-blue-200'} rounded-md shrink-0">${escapeHtml(t.status)}</span>
 </div>
 `).join("")}
 </div>
 </div>

 <div class="mb-6">
 <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Checklist Administrasi Onboarding</p>
 <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
 <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked class="mt-1 w-4 h-4 text-maroon-700"> Penandatanganan Kontrak / PKWTT Baru</label>
 <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked class="mt-1 w-4 h-4 text-maroon-700"> Pembuatan ID Card & Seragam Kerja</label>
 <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked class="mt-1 w-4 h-4 text-maroon-700"> Pendaftaran BPJS Ketenagakerjaan & Kesehatan</label>
 <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked class="mt-1 w-4 h-4 text-maroon-700"> Pembuatan Akun Portal HRIS & Email Operasional</label>
 </div>
 </div>

 <button type="button" id="btn-print-onboarding-doc" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2 text-xs mb-4">
 Cetak Berita Acara Onboarding & Training (PDF)
 </button>
 `;
 }

 resBox.innerHTML = `
 ${previewHtml}
 <div class="mt-6 pt-4 border-t border-slate-200">
 <button type="button" id="btn-final-simpan" class="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition shadow-md flex items-center justify-center gap-2">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
 Selesaikan Proses & Perbarui Master Karyawan
 </button>
 <p class="text-[10px] text-center text-slate-400 mt-2">Menekan tombol di atas akan merekam log riwayat ini dan <b class="text-slate-500">secara ajaib otomatis mengubah status/jabatan karyawan tersebut di Database Induk (Master Karyawan)</b>.</p>
 </div>
 `;

 // Attach PDF listener if offboarding clearance button exists
 const btnPrintDoc = resBox.querySelector("#btn-print-clearance-doc");
 if (btnPrintDoc && currentSelectedKaryawan) {
 btnPrintDoc.onclick = () => printExitClearancePdf({
 karyawan: currentSelectedKaryawan,
 pengganti: payloadLog.detail_offboarding?.karyawan_pengganti || "",
 assets: payloadLog.detail_offboarding?.assigned_assets || [],
 tglEfektif: payloadLog.tanggal_efektif,
 alasan: container.querySelector("#off-alasan") ? container.querySelector("#off-alasan").value : "Resign",
 masaKerja: payloadLog.detail_offboarding?.masa_kerja_tahun || 0,
 catatanHandover: payloadLog.detail_offboarding?.catatan_handover || "",
 handoverTasks: payloadLog.detail_offboarding?.handover_tasks || [],
 checklistDoc: ["Surat Pengunduran Diri / PHK", "Form Exit Interview", "Form Serah Terima Aset & Kerahasiaan", "BPJS & Paklaring"]
 });
 }

 // Attach PDF listener if onboarding document button exists
 const btnPrintOnb = resBox.querySelector("#btn-print-onboarding-doc");
 if (btnPrintOnb) {
 btnPrintOnb.onclick = () => printOnboardingDocPdf({
 nama: payloadLog.new_employee_data?.nama_karyawan || payloadLog.nama_karyawan,
 nik: payloadLog.new_employee_data?.nik_karyawan || "-",
 email: payloadLog.new_employee_data?.email || "-",
 jabatan: payloadLog.new_employee_data?.jabatan || "-",
 cabang: payloadLog.new_employee_data?.cabang || "-",
 tglJoin: payloadLog.new_employee_data?.tanggal_join || payloadLog.tanggal_efektif,
 statusKontrak: payloadLog.new_employee_data?.status_karyawan || "PKWTT",
 orientasiItems: payloadLog.detail_onboarding?.orientasi_items || [],
 trainingItems: payloadLog.detail_onboarding?.training_items || [],
 catatanFasilitas: payloadLog.detail_onboarding?.catatan_fasilitas || ""
 });
 }

 const btnSimpan = resBox ? resBox.querySelector("#btn-final-simpan") : null;
 if (btnSimpan) {
 btnSimpan.addEventListener("click", async () => {
 btnSimpan.disabled = true;
 btnSimpan.textContent = "Menyimpan ke Database...";

 try {
 let targetEmail = null;

 if (payloadLog.new_employee_data) {
 const newId = genId("KRY");
 await fsAdd(COL.MASTER_KARYAWAN, payloadLog.new_employee_data, newId);
 payloadLog.id_karyawan = newId;
 targetEmail = payloadLog.new_employee_data.email;
 } else if (payloadLog.update_master) {
 await updateDoc(doc(db, COL.MASTER_KARYAWAN, payloadLog.id_karyawan), payloadLog.update_master);
 if (currentSelectedKaryawan) Object.assign(currentSelectedKaryawan, payloadLog.update_master);
 targetEmail = currentSelectedKaryawan ? currentSelectedKaryawan.email : null;
 } else if (currentSelectedKaryawan) {
 targetEmail = currentSelectedKaryawan.email;
 }

    if (jenis === "Offboarding" && payloadLog.detail_offboarding?.assigned_assets?.length) {
      const newOwner = payloadLog.detail_offboarding.karyawan_pengganti || "Unassigned";
      for (const asset of payloadLog.detail_offboarding.assigned_assets) {
        // 1. Update status kepemilikan di master_inventory HANYA jika dokumen item memang ada di master_inventory
        if (asset.is_master_inventory && asset.id_doc) {
          try {
            await fsUpdate(COL.MASTER_INVENTORY, asset.id_doc, {
              assigned_to: newOwner
            });
          } catch (errInv) {
            console.warn(`Catatan: Dokumen master_inventory ${asset.id_doc} tidak ditemukan atau gagal diupdate:`, errInv);
          }
        }

        // 2. Catat riwayat serah terima / pengembalian ke log inventory
        try {
          await fsAdd(COL.LOG_INVENTORY_PENGAMBILAN, {
            id_barang: asset.id_item || asset.id || "ASSET-CLR",
            nama_barang: asset.nama_barang,
            kategori: asset.kategori || "Aset",
            nama_karyawan: payloadLog.nama_karyawan,
            tanggal: new Date().toISOString().substring(0, 10),
            jumlah_ambil: 1,
            jenis_aksi: "PENGEMBALIAN",
            status_pengembalian: asset.status_pengembalian || "DIKEMBALIKAN (CLEARANCE RESIGN)",
            keperluan: `Pengembalian asset clearance resign. Handover pengganti: ${newOwner}`
          });
        } catch (errLog) {
          console.warn("Gagal mencatat log inventory:", errLog);
        }
      }
    }

 await fsAdd(COL.SIKLUS_KARYAWAN, payloadLog, genId("SKL"));

 if (targetEmail) {
 btnSimpan.textContent = "Mengirim Email Notifikasi...";

 let emailSubject = "";
 let emailBody = "";
 const namaTarget = payloadLog.nama_karyawan;

 if (jenis === "Onboarding") {
 const d = payloadLog.new_employee_data;
 emailSubject = "Selamat Datang di CV Andela Jaya!";
 emailBody = buildStandardEmailHtml({
   badgeText: "Selamat Bergabung",
   badgeVariant: "green",
   title: "Selamat Datang di CV Andela Jaya!",
   recipientName: namaTarget,
   introText: `Seluruh keluarga besar <strong>CV Andela Jaya</strong> mengucapkan selamat datang. Kami sangat senang Anda bergabung bersama kami.`,
   infoList: [
     { label: "Nama Karyawan", value: namaTarget },
     { label: "Posisi / Jabatan", value: d.jabatan || "-" },
     { label: "Penempatan Cabang", value: d.cabang || "-" },
     { label: "Tanggal Mulai Kerja", value: fmtDateShort(d.tanggal_join) }
   ],
   actionUrl: `${window.location.origin}/#profile`,
   actionText: "Akses Portal HRIS Karyawan →",
   secondaryNote: "Tim HRD akan memandu Anda untuk kelengkapan administrasi (kontrak kerja, ID card, BPJS, dan aktivasi akun sistem)."
 });
 } else if (jenis === "Offboarding") {
 emailSubject = "Pemberitahuan Proses Offboarding";
 emailBody = buildStandardEmailHtml({
   badgeText: "Offboarding",
   badgeVariant: "amber",
   title: "Pemberitahuan Proses Offboarding",
   recipientName: namaTarget,
   introText: `Dengan ini diinformasikan bahwa proses offboarding Anda telah diproses oleh HRD dengan tanggal efektif <strong>${fmtDateShort(payloadLog.tanggal_efektif)}</strong>.`,
   infoList: [
     { label: "Karyawan", value: namaTarget },
     { label: "Tanggal Efektif", value: fmtDateShort(payloadLog.tanggal_efektif) },
     { label: "Keterangan", value: payloadLog.keterangan || "-" }
   ],
   secondaryNote: "Harap segera mengoordinasikan serah terima aset perusahaan, berkas dokumen, dan penyelesaian administrasi dengan HRD."
 });
 } else if (["Mutasi", "Promosi", "Demosi"].includes(jenis)) {
 const d = payloadLog.detail_mutasi || {};
 emailSubject = `Pemberitahuan ${jenis} Jabatan`;
 emailBody = buildStandardEmailHtml({
   badgeText: jenis,
   badgeVariant: jenis === "Promosi" ? "green" : "maroon",
   title: `Pemberitahuan ${jenis} Jabatan`,
   recipientName: namaTarget,
   introText: `Dengan ini diinformasikan bahwa Anda mendapatkan penugasan baru berupa <strong>${jenis}</strong> terhitung efektif <strong>${fmtDateShort(payloadLog.tanggal_efektif)}</strong>.`,
   infoList: [
     { label: "Karyawan", value: namaTarget },
     { label: "Jabatan Lama", value: d.jabatan_lama || "-" },
     { label: "Jabatan Baru", value: d.jabatan_baru || "-" },
     { label: "Cabang Lama", value: d.cabang_lama || "-" },
     { label: "Cabang Baru", value: d.cabang_baru || "-" },
     { label: "Keterangan", value: payloadLog.keterangan || "-" }
   ],
   actionUrl: `${window.location.origin}/#profile`,
   actionText: "Lihat Profil & Riwayat Karir →",
   secondaryNote: "Silakan hubungi HRD apabila ada pertanyaan lebih lanjut terkait penyesuaian tugas baru."
 });
 }

 if (emailSubject) {
 sendEmailNotif(targetEmail, emailSubject, emailBody).catch(e => console.warn("Gagal kirim email siklus karyawan:", e));
 }
 } else {
 console.warn("Email siklus karyawan tidak terkirim: karyawan tidak memiliki alamat email.");
 }

 toast(`Siklus ${jenis} berhasil direkam${targetEmail ? " & email notifikasi terkirim" : ""}!`, "success");

 if (payloadLog.new_employee_data) {
 const added = { id: payloadLog.id_karyawan, ...payloadLog.new_employee_data };
 activeKaryawan.push(added);
 activeKaryawan.sort((a,b) => (a.nama_karyawan||"").localeCompare(b.nama_karyawan||""));
 if (selectNama) {
 selectNama.innerHTML = `<option value="">Pilih Karyawan Aktif...</option>` +
 activeKaryawan.map(k => `<option value="${k.id}">${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || "")} (${escapeHtml(k.cabang || "-")})</option>`).join("");
 }
 }

 form.reset();
 if (selectNama) selectNama.value = "";
 currentSelectedKaryawan = null;
 isNewHireOnboarding = false;
 if (wrapNama) wrapNama.classList.remove("hidden");
 if (wrapOnbNew) wrapOnbNew.classList.add("hidden");
 if (dynFields) dynFields.classList.add("hidden");
 if (btnKalkulasi) btnKalkulasi.classList.add("hidden");
 if (resBox) resBox.innerHTML = `<p class="text-sm text-slate-400 text-center py-10">Pilih jenis siklus dan isi formulir di samping untuk melihat prosedur & dokumen yang harus disiapkan.</p>`;
 
 if (loaded.riwayat) await loadRiwayat();
 } catch (e) {
 toast("Gagal memproses data: " + e.message, "error");
 btnSimpan.disabled = false;
 btnSimpan.innerHTML = `Selesaikan Proses & Perbarui Master Karyawan`;
 }
 });
 }
 });
 }

 const panelInput = container.querySelector("#sk-panel-input");
 const panelRiwayat = container.querySelector("#sk-panel-riwayat");
 const loaded = {};

 async function loadRiwayat() {
 await renderCrudModule(panelRiwayat, {
 title: "Riwayat Pergerakan & Terminasi",
 subtitle: "Log historis seluruh mutasi, promosi, demosi, dan offboarding karyawan.",
 collectionName: COL.SIKLUS_KARYAWAN,
 idPrefix: "SKL",
 canCreate: false, 
 canEdit: false,
 searchFields: ["nama_karyawan", "jenis_siklus", "keterangan"],
 orderByField: "tanggal_proses",
 printLabel: "Cetak Dokumen (PDF)",
 printFn: (row) => {
 if (row.jenis_siklus === "Offboarding") {
 printExitClearancePdf({
 karyawan: {
 nama_karyawan: row.nama_karyawan,
 id: row.id_karyawan || "-",
 nik_karyawan: row.id_karyawan || "-",
 jabatan: row.jabatan || "-",
 cabang: row.cabang || "-"
 },
 pengganti: row.detail_offboarding?.karyawan_pengganti || "",
 assets: row.detail_offboarding?.assigned_assets || [],
 tglEfektif: row.tanggal_efektif || row.tanggal_proses,
 alasan: row.keterangan || "Offboarding Karyawan",
 masaKerja: row.detail_offboarding?.masa_kerja_tahun || 0,
 catatanHandover: row.detail_offboarding?.catatan_handover || "",
 handoverTasks: row.detail_offboarding?.handover_tasks || [],
 checklistDoc: row.detail_offboarding?.checklist_doc || []
 });
 } else if (row.jenis_siklus === "Onboarding") {
 printOnboardingDocPdf({
 nama: row.nama_karyawan,
 nik: row.detail_onboarding?.nik || "-",
 email: row.detail_onboarding?.email || "-",
 jabatan: row.detail_onboarding?.jabatan || "-",
 cabang: row.detail_onboarding?.cabang || "-",
 tglJoin: row.tanggal_efektif || row.tanggal_proses,
 statusKontrak: row.detail_onboarding?.tipe_kontrak || "PKWTT",
 orientasiItems: row.detail_onboarding?.orientasi_items || [],
 trainingItems: row.detail_onboarding?.training_items || [],
 catatanFasilitas: row.detail_onboarding?.catatan_fasilitas || ""
 });
 } else {
 toast("Dokumen cetak PDF tersedia untuk jenis siklus Offboarding (Exit Clearance) dan Onboarding.", "info");
 }
 },
 columns: [
 { key: "tanggal_efektif", label: "Tgl Efektif", type: "date" },
 { key: "nama_karyawan", label: "Karyawan" },
 { key: "jenis_siklus", label: "Jenis Siklus", type: "badge", badgeTone: (v) => v === "Offboarding" ? "red" : v === "Onboarding" ? "green" : v === "Demosi" ? "amber" : "blue" },
 { key: "keterangan", label: "Alasan / Catatan" }
 ],
 formFields: [
 { name: "tanggal_efektif", label: "Tanggal Efektif", type: "date" },
 { name: "nama_karyawan", label: "Nama Karyawan", type: "text" },
 { name: "jenis_siklus", label: "Jenis Siklus", type: "text" },
 { name: "keterangan", label: "Keterangan", type: "textarea", full: true }
 ]
 });
 }

 container.querySelectorAll(".sk-tab").forEach(btn => {
 btn.addEventListener("click", async () => {
 const tab = btn.dataset.stab;
 panelInput.classList.toggle("hidden", tab !== "input");
 panelRiwayat.classList.toggle("hidden", tab !== "riwayat");
 
 container.querySelectorAll(".sk-tab").forEach(b => {
 b.classList.toggle("border-maroon-700", b === btn);
 b.classList.toggle("text-maroon-700", b === btn);
 b.classList.toggle("border-transparent", b !== btn);
 b.classList.toggle("text-slate-500", b !== btn);
 });
 
 if (tab === "riwayat" && !loaded.riwayat) {
 loaded.riwayat = true;
 await loadRiwayat();
 }
 });
 });

 return { unmount() {} };
}
