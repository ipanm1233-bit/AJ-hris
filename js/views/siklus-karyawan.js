import { COL, db, updateDoc, doc, getDoc, setDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, toast, genId, fmtRupiah, fmtDateShort, smartParseDate, sendEmailNotif, buildStandardEmailHtml, openModal, closeModal, resolveEmployeeEmail } from "../utils.js";
import { renderCrudModule, icon } from "../components.js";
import { getSession, canEditModuleData, resolveBranchScope, branchMatches } from "../auth.js";
import { isoDocHeaderTable, COMPANY_NAME, COMPANY_ADDRESS_LINE1 } from "../branding.js";

// Fungsi pelindung teks bawaan (Bulletproof)
function escapeHtml(unsafe) {
 return (unsafe || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ============================================================
// HELPER TANGGAL, TERBILANG & PERHITUNGAN SISA GAJI OFFBOARDING
// ============================================================
const NAMA_BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const NAMA_HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function pad2(value) { return String(value).padStart(2, "0"); }

function parseLocalDate(value) {
 if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
 const text = String(value || "").slice(0, 10);
 const parts = text.split("-").map(Number);
 if (parts.length !== 3 || parts.some(part => !Number.isFinite(part) || part <= 0)) return null;
 return new Date(parts[0], parts[1] - 1, parts[2]);
}

function toIsoDateLocal(date) {
 if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
 return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function angkaTerbilang(value) {
 const n = Math.floor(Math.abs(Number(value) || 0));
 const satuan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
 if (n < 12) return satuan[n];
 if (n < 20) return `${angkaTerbilang(n - 10)} Belas`;
 if (n < 100) return `${angkaTerbilang(Math.floor(n / 10))} Puluh ${angkaTerbilang(n % 10)}`.trim();
 if (n < 200) return `Seratus ${angkaTerbilang(n - 100)}`.trim();
 if (n < 1000) return `${angkaTerbilang(Math.floor(n / 100))} Ratus ${angkaTerbilang(n % 100)}`.trim();
 if (n < 2000) return `Seribu ${angkaTerbilang(n - 1000)}`.trim();
 if (n < 1000000) return `${angkaTerbilang(Math.floor(n / 1000))} Ribu ${angkaTerbilang(n % 1000)}`.trim();
 if (n < 1000000000) return `${angkaTerbilang(Math.floor(n / 1000000))} Juta ${angkaTerbilang(n % 1000000)}`.trim();
 return String(n);
}

function formatTanggalIndo(value, { withDay = true } = {}) {
 const date = parseLocalDate(value);
 if (!date) return "-";
 const text = `${date.getDate()} ${NAMA_BULAN_ID[date.getMonth()]} ${date.getFullYear()}`;
 return withDay ? `${NAMA_HARI_ID[date.getDay()]}, ${text}` : text;
}

function formatTanggalTerbilang(value) {
 const date = parseLocalDate(value);
 if (!date) return "-";
 const hari = NAMA_HARI_ID[date.getDay()];
 const teks = `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
 const huruf = `${angkaTerbilang(date.getDate())} ${NAMA_BULAN_ID[date.getMonth()]} ${angkaTerbilang(date.getFullYear())}`;
 return `${hari}, ${teks} (${huruf})`;
}

/** Hitung hari kerja Senin-Sabtu (Minggu libur), inklusif start s.d. end. */
function countWorkingDaysInclusive(startValue, endValue) {
 const start = parseLocalDate(startValue);
 const end = parseLocalDate(endValue);
 if (!start || !end || end < start) return 0;
 let total = 0;
 const cursor = new Date(start);
 while (cursor <= end) {
 if (cursor.getDay() !== 0) total += 1;
 cursor.setDate(cursor.getDate() + 1);
 }
 return total;
}

/**
 * Hitung sisa gaji berjalan (belum dibayarkan) karyawan yang keluar.
 * Gaji per hari = (gaji pokok + tunjangan tetap) / hari kerja per bulan.
 * Hari kerja dihitung Senin-Sabtu dan belum memperhitungkan hari libur nasional.
 */
function hitungSisaGaji({ outDate, gajiPokok, cutoffDay = 21, hariKerjaPerBulan = 25, startDate = "" }) {
 const out = parseLocalDate(outDate);
 const gaji = Number(gajiPokok) || 0;
 const pembagi = Number(hariKerjaPerBulan) > 0 ? Number(hariKerjaPerBulan) : 25;
 const cutoff = Math.min(Math.max(parseInt(cutoffDay, 10) || 21, 1), 31);
 if (!out) return { gajiPerHari: 0, sisaHariKerja: 0, sisaGaji: 0, mulai: "", cutoffDay: cutoff, hariKerjaPerBulan: pembagi };

 const batasBulan = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
 const tglCutoff = new Date(out.getFullYear(), out.getMonth(), Math.min(cutoff, batasBulan));
 const defaultStartIso = defaultSisaGajiStart(out, cutoff);
 const manualStart = parseLocalDate(startDate);
 const isManualStart = Boolean(manualStart) && toIsoDateLocal(manualStart) !== defaultStartIso;
 const start = manualStart || parseLocalDate(defaultStartIso);

 let sisaHariKerja = 0;
 if (isManualStart) {
 // HRD mengubah tanggal mulai secara manual: hitung hari kerja aktual.
 sisaHariKerja = Math.min(countWorkingDaysInclusive(start, out), pembagi);
 } else if (out > tglCutoff) {
 // Periode payroll berikutnya (22 bulan berjalan s.d. 21 bulan berikutnya):
 // hitung hari kerja aktual dari 22 bulan berjalan sampai tanggal keluar.
 sisaHariKerja = Math.min(countWorkingDaysInclusive(new Date(out.getFullYear(), out.getMonth(), tglCutoff.getDate() + 1), out), pembagi);
 } else {
 // Periode payroll berjalan (22 bulan sebelumnya s.d. 21 bulan berjalan).
 // Gaji penuh periode = hari kerja per bulan (25). Kurangkan hari kerja yang
 // tidak dijalani setelah tanggal keluar sampai tanggal cut-off.
 const hariTerlewat = countWorkingDaysInclusive(new Date(out.getFullYear(), out.getMonth(), out.getDate() + 1), tglCutoff);
 sisaHariKerja = Math.max(0, pembagi - hariTerlewat);
 }

 const gajiPerHari = Math.round(gaji / pembagi);
 const sisaGaji = sisaHariKerja >= pembagi ? gaji : gajiPerHari * sisaHariKerja;
 return {
 gajiPerHari,
 sisaHariKerja,
 sisaGaji,
 mulai: start ? toIsoDateLocal(start) : "",
 cutoffDay: cutoff,
 hariKerjaPerBulan: pembagi
 };
}

/**
 * Awal periode sisa gaji mengikuti cut-off penggajian:
 * gaji dibayar tgl 25 menghitung absensi 22 bulan sebelumnya s.d. 21 bulan berjalan.
 * - Keluar setelah tgl cut-off (22 s.d. akhir bulan): mulai tgl 22 bulan berjalan
 *   (periode payroll berikutnya yang belum dibayarkan).
 * - Keluar tgl cut-off atau sebelumnya: mulai tgl 22 bulan sebelumnya
 *   (periode payroll berjalan yang belum dibayarkan).
 */
function defaultSisaGajiStart(outDate, cutoffDay) {
 const out = parseLocalDate(outDate);
 if (!out) return "";
 const cutoff = Math.min(Math.max(parseInt(cutoffDay, 10) || 21, 1), 31);
 const batasBulan = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
 const tglCutoff = new Date(out.getFullYear(), out.getMonth(), Math.min(cutoff, batasBulan));
 if (out > tglCutoff) {
 return toIsoDateLocal(new Date(out.getFullYear(), out.getMonth(), tglCutoff.getDate() + 1));
 }
 const bulanSebelumnya = new Date(out.getFullYear(), out.getMonth() - 1, 1);
 const batasBulanLalu = new Date(bulanSebelumnya.getFullYear(), bulanSebelumnya.getMonth() + 1, 0).getDate();
 const tglCutoffLalu = new Date(bulanSebelumnya.getFullYear(), bulanSebelumnya.getMonth(), Math.min(cutoff, batasBulanLalu));
 return toIsoDateLocal(new Date(tglCutoffLalu.getFullYear(), tglCutoffLalu.getMonth(), tglCutoffLalu.getDate() + 1));
}

// ============================================================
// KETENTUAN UANG PISAH (DAPAT DIUBAH LANGSUNG OLEH HRD)
// Default: 3-<6 thn = 1x gaji; 6-<9 thn = 2x gaji; >=9 thn = 3x gaji
// ============================================================
const DEFAULT_UANG_PISAH_TIERS = Object.freeze([
 { min_years: 3, max_years: 6, multiplier: 1 },
 { min_years: 6, max_years: 9, multiplier: 2 },
 { min_years: 9, max_years: null, multiplier: 3 }
]);

function normalizeUangPisahTiers(input) {
 const fallback = DEFAULT_UANG_PISAH_TIERS.map(tier => ({ ...tier }));
 if (!Array.isArray(input) || !input.length) return fallback;
 const tiers = input.map(item => {
 const minYears = Math.max(0, Number(item?.min_years) || 0);
 const rawMax = item?.max_years;
 const maxYears = (rawMax === null || rawMax === undefined || rawMax === "") ? null : Math.max(0, Number(rawMax));
 return { min_years: minYears, max_years: maxYears, multiplier: Math.max(0, Number(item?.multiplier) || 0) };
 }).filter(tier => tier.max_years === null || tier.max_years > tier.min_years)
 .sort((a, b) => a.min_years - b.min_years);
 return tiers.length ? tiers : fallback;
}

function uangPisahMultiplier(masaKerjaTahun, tiers) {
 const years = Math.max(0, Number(masaKerjaTahun) || 0);
 for (const tier of normalizeUangPisahTiers(tiers)) {
 const maxYears = tier.max_years === null ? Infinity : tier.max_years;
 if (years >= tier.min_years && years < maxYears) return tier.multiplier;
 }
 return 0;
}

function formatUangPisahTiers(tiers) {
 return normalizeUangPisahTiers(tiers).map(tier => {
 const batas = tier.max_years === null ? `>= ${tier.min_years} tahun` : `${tier.min_years} s.d. < ${tier.max_years} tahun`;
 return `${batas}: ${tier.multiplier}x gaji`;
 }).join(" | ");
}

/** Baca ketentuan uang pisah dari baris input HRD di form offboarding. */
function readUangPisahTiersFromDom(root, fallback) {
 if (!root) return normalizeUangPisahTiers(fallback);
 const box = root.querySelector("#uang-pisah-tiers");
 if (!box) return normalizeUangPisahTiers(fallback);
 const rows = Array.from(box.querySelectorAll(".uang-pisah-tier-row"));
 const tiers = rows.map(row => {
 const maxRaw = row.querySelector(".tier-max")?.value || "";
 return {
 min_years: parseFloat(row.querySelector(".tier-min")?.value || "0") || 0,
 max_years: maxRaw === "" ? null : (parseFloat(maxRaw) || null),
 multiplier: parseFloat(row.querySelector(".tier-mult")?.value || "0") || 0
 };
 }).filter(tier => tier.max_years === null || tier.max_years > tier.min_years)
 .sort((a, b) => a.min_years - b.min_years);
 return tiers.length ? tiers : normalizeUangPisahTiers(DEFAULT_UANG_PISAH_TIERS);
}

// FUNGSI CETAK SURAT EXIT CLEARANCE & HANDOVER PEKERJAAN (PDF & PREVIEW)
async function printExitClearancePdf(data) {
 const { downloadHtmlAsPdf, toast, openModal } = await import("../utils.js");
 
 const { karyawan, pengganti, assets, tglEfektif, alasan, masaKerja, catatanHandover, handoverTasks, checklistDoc, penggantianMcu, sisaGaji } = data;

 const sisaGajiRow = (sisaGaji && Number(sisaGaji.sisa_gaji) > 0) ? `
 <tr><td>Sisa Gaji Berjalan</td><td><strong>${fmtRupiah(sisaGaji.sisa_gaji)}</strong> (${sisaGaji.sisa_hari_kerja} hari kerja x ${fmtRupiah(sisaGaji.gaji_per_hari)}; periode cut-off 22 bulan sebelumnya s.d. 21 bulan berjalan, dibayar tgl ${sisaGaji.tanggal_bayar_gaji || 25})</td></tr>
 ` : "";

 const mcuRowHtml = (penggantianMcu && penggantianMcu.wajib) ? `
 <tr><td>Kewajiban Penggantian Biaya MCU</td><td><strong style="color:#b91c1c;">Nominal ${fmtRupiah(penggantianMcu.biaya_mcu || 0)}</strong> &mdash; Status saat resign: ${escapeHtml(penggantianMcu.status_kontrak_saat_resign || "-")} ${penggantianMcu.referensi_invoice && penggantianMcu.referensi_invoice !== "-" ? `(Ref: ${escapeHtml(penggantianMcu.referensi_invoice)})` : ''}${penggantianMcu.metode_pembayaran === "POTONG_SISA_GAJI" ? `; disepakati dipotong dari sisa gaji ${fmtRupiah(penggantianMcu.potongan_sisa_gaji || 0)}` : ""} (Sesuai Surat Komitmen Kerja; wajib dibayar maks. 7 hari kerja setelah tanggal efektif resign)</td></tr>
 ` : "";

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
 <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:Arial, Helvetica, sans-serif; font-size:10px; line-height:1.3; color:#000; background:#ffffff; box-sizing:border-box;">
 <style>
 * { box-sizing: border-box !important; }
 body, div, p, span, table, tr, th, td { font-family: Arial, Helvetica, sans-serif; }
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
 ${sisaGajiRow}
 ${mcuRowHtml}
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
 body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif; }
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

// FUNGSI CETAK SURAT TAGIHAN PENGANTIAN BIAYA MCU (RESIGN PROBATION / 3 BULAN PERTAMA KONTRAK)
async function printMcuBillingPdf(data) {
 const { downloadHtmlAsPdf, openModal } = await import("../utils.js");

 const { karyawan, tglJoin, tglEfektif, masaKerjaBulan, sisaGaji, mcu } = data;

 if (!mcu || !mcu.wajib) {
 toast("Karyawan ini tidak terkena ketentuan penggantian biaya MCU.", "info");
 return;
 }

 const biayaMcu = Number(mcu.biaya_mcu) || 0;
 const refInvoice = (mcu.referensi_invoice && mcu.referensi_invoice !== "-") ? mcu.referensi_invoice : "-";
 const statusResign = mcu.status_kontrak_saat_resign || "-";
 const metodeMcu = mcu.metode_pembayaran === "POTONG_SISA_GAJI" ? "Potong dari Sisa Gaji (Payroll)" : "Transfer / Tunai oleh Karyawan";
 const potonganSisaGaji = Number(mcu.potongan_sisa_gaji || 0);
 const kekuranganMcu = Number(mcu.kekurangan_dibayar_karyawan || 0);
 const sisaGajiNominal = Number(sisaGaji?.sisa_gaji || 0);
 const noSuratMcu = `HRD-MCU/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
 const hariIni = fmtDateShort(new Date());

 const docHtmlMcu = `
 <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:Arial, Helvetica, sans-serif; font-size:10.5px; line-height:1.4; color:#000; background:#ffffff; box-sizing:border-box;">
 <div style="page-break-inside:avoid; margin-bottom:6px;">
 ${isoDocHeaderTable({ judul: "SURAT TAGIHAN PENGANTIAN BIAYA MEDICAL CHECK UP (MCU)", noDok: "HRD-MCU-01", terbitRevisi: "1/0", hal: "1 dari 1" })}
 </div>

 <div style="margin-top:8px; font-size:10.5px;">Nomor Surat: <strong>${escapeHtml(noSuratMcu)}</strong> | Tanggal: <strong>${escapeHtml(hariIni)}</strong></div>

 <div style="margin-top:8px;">
 <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:10.5px;">
 <colgroup><col style="width:35%;" /><col style="width:65%;" /></colgroup>
 <tr style="background:#f1f5f9;"><td colspan="2" style="border:1px solid #000; font-weight:bold; text-transform:uppercase;">A. DATA KARYAWAN</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Nama Karyawan</td><td style="border:1px solid #000; padding:3.5px 5px; font-weight:bold;">${escapeHtml(karyawan.nama_karyawan)}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">NIK / ID</td><td style="border:1px solid #000; padding:3.5px 5px;">${escapeHtml(karyawan.nik_karyawan || karyawan.id || "-")}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Jabatan / Cabang</td><td style="border:1px solid #000; padding:3.5px 5px;">${escapeHtml(karyawan.jabatan || "-")} (${escapeHtml(karyawan.cabang || "-")})</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Tanggal Join</td><td style="border:1px solid #000; padding:3.5px 5px;">${escapeHtml(tglJoin ? fmtDateShort(tglJoin) : "-")}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Tanggal Efektif Resign</td><td style="border:1px solid #000; padding:3.5px 5px;">${escapeHtml(tglEfektif ? fmtDateShort(tglEfektif) : "-")}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Masa Kerja Saat Resign</td><td style="border:1px solid #000; padding:3.5px 5px;">${Number(masaKerjaBulan || mcu.masa_kerja_bulan || 0)} bulan (${escapeHtml(statusResign)})</td></tr>
 <tr style="background:#f1f5f9;"><td colspan="2" style="border:1px solid #000; font-weight:bold; text-transform:uppercase;">B. RINCIAN TAGIHAN</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Kewajiban Penggantian Biaya MCU</td><td style="border:1px solid #000; padding:3.5px 5px; font-weight:bold; font-size:12px; color:#b91c1c;">${fmtRupiah(biayaMcu)}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Referensi Invoice / Laboratorium</td><td style="border:1px solid #000; padding:3.5px 5px;">${escapeHtml(refInvoice)}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Batas Waktu Pembayaran</td><td style="border:1px solid #000; padding:3.5px 5px; font-weight:bold;">${escapeHtml(mcu.batas_pembayaran || "Maksimal 7 hari kerja setelah tanggal efektif resign")}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Metode Penggantian</td><td style="border:1px solid #000; padding:3.5px 5px; font-weight:bold;">${escapeHtml(metodeMcu)}</td></tr>
 ${mcu.metode_pembayaran === "POTONG_SISA_GAJI" ? `
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Sisa Gaji Berjalan</td><td style="border:1px solid #000; padding:3.5px 5px;">${fmtRupiah(sisaGajiNominal)} (${Number(sisaGaji?.sisa_hari_kerja || 0)} hari kerja)</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">Potongan dari Sisa Gaji</td><td style="border:1px solid #000; padding:3.5px 5px; font-weight:bold;">${fmtRupiah(potonganSisaGaji)}</td></tr>
 <tr><td style="border:1px solid #000; padding:3.5px 5px;">${kekuranganMcu > 0 ? "Kekurangan Wajib Dibayar Karyawan" : "Sisa Gaji Setelah Potongan"}</td><td style="border:1px solid #000; padding:3.5px 5px; font-weight:bold; color:#b91c1c;">${fmtRupiah(kekuranganMcu > 0 ? kekuranganMcu : Math.max(0, sisaGajiNominal - potonganSisaGaji))}</td></tr>
 ` : ""}
 </table>
 </div>

 <div style="margin-top:8px; text-align:justify;">
 <p style="margin:4px 0;">Sesuai <strong>Surat Komitmen Kerja</strong> yang ditandatangani karyawan pada awal masuk: apabila karyawan mengundurkan diri secara sepihak sebelum masa probation berakhir atau di dalam <strong>3 (tiga) bulan pertama kontrak pertama</strong>, maka karyawan bersedia mengganti biaya Medical Check Up (MCU) yang telah dibayar oleh perusahaan sesuai nominal invoice laboratorium, sebagai bentuk pertanggungjawaban pribadi terhadap biaya yang telah dikeluarkan perusahaan.</p>
 <p style="margin:4px 0;">${mcu.metode_pembayaran === "POTONG_SISA_GAJI" ? `Berdasarkan kesepakatan, biaya MCU sebesar <strong>${fmtRupiah(biayaMcu)}</strong> akan <strong>dipotong dari sisa gaji</strong> Pihak Kedua sebesar <strong>${fmtRupiah(potonganSisaGaji)}</strong>${kekuranganMcu > 0 ? `, dengan kekurangan sebesar <strong>${fmtRupiah(kekuranganMcu)}</strong> tetap wajib dibayar Pihak Kedua melalui transfer ke rekening resmi perusahaan` : ""}. Bukti potong/pembayaran akan diserahkan HRD kepada karyawan.` : `Mohon kewajiban penggantian biaya MCU ini dapat diselesaikan kepada HRD melalui transfer ke rekening resmi perusahaan dan menunjukkan bukti pembayaran kepada HRD.`}</p>
 </div>

 <table style="width:100%; border-collapse:collapse; table-layout:fixed; text-align:center; margin-top:18px; font-size:10px; page-break-inside:avoid;">
 <tr>
 <td style="width:50%; border:none; padding:2px;">Karyawan Yang Terkena Ketentuan,</td>
 <td style="width:50%; border:none; padding:2px;">HRD &amp; Finance Manager,</td>
 </tr>
 <tr><td style="border:none; height:40px;"></td><td style="border:none;"></td></tr>
 <tr>
 <td style="border:none; padding:2px;">( <strong>${escapeHtml(karyawan.nama_karyawan)}</strong> )</td>
 <td style="border:none; padding:2px;">( ................................... )</td>
 </tr>
 </table>
 </div>`;

 const filenameMcu = `Surat_Tagihan_MCU_${escapeHtml(karyawan.nama_karyawan).replace(/\s+/g, "_")}.pdf`;

 openModal({
 title: `Surat Tagihan Biaya MCU - ${escapeHtml(karyawan.nama_karyawan)}`,
 bodyHtml: `
 <div class="space-y-4">
 <div class="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl flex-wrap gap-2">
 <div class="text-xs">
 <p class="font-bold text-red-800">Total Kewajiban Penggantian Biaya MCU</p>
 <p class="font-black text-red-900 text-lg">${fmtRupiah(biayaMcu)}</p>
 </div>
 <button type="button" id="btn-modal-dl-mcu" class="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
 ${icon('download', 'w-4 h-4')} Unduh PDF
 </button>
 </div>
 <div class="border border-slate-300 rounded-xl p-4 bg-slate-100 overflow-y-auto max-h-[70vh]">
 <div class="bg-white shadow-md p-6 rounded-lg mx-auto" style="max-width:794px;">
 ${docHtmlMcu}
 </div>
 </div>
 </div>
 `,
 size: "xl",
 onMount: (backdrop) => {
 backdrop.querySelector("#btn-modal-dl-mcu")?.addEventListener("click", async () => {
 toast("Sedang mengunduh file PDF...", "info");
 await downloadHtmlAsPdf(docHtmlMcu, filenameMcu);
 toast("Surat Tagihan MCU PDF berhasil diunduh!", "success");
 });
 }
 });

 try {
 await downloadHtmlAsPdf(docHtmlMcu, filenameMcu);
 toast("Surat Tagihan MCU PDF berhasil diunduh!", "success");
 } catch (e) {
 console.warn("Gagal auto download Surat Tagihan MCU PDF:", e);
 }
}

// FUNGSI CETAK SURAT PERJANJIAN BERSAMA (BERAKHIRNYA HUBUNGAN KERJA & PENGANTIAN BIAYA MCU)
async function printPerjanjianBersamaPdf(data) {
 const { downloadHtmlAsPdf, openModal } = await import("../utils.js");
 const {
 karyawan, alasan, tglEfektif, tglSurat, nomorSurat, masaKerjaTahun, masaKerjaBulan,
 sisaGaji, uangPisah, mcu, assets, catatanTambahan
 } = data;

 const session = getSession() || {};
 const pihakSatuNama = session.nama || session.nama_karyawan || session.username || "HRGA";
 const pihakSatuJabatan = session.jabatan || "HRGA";
 const alamatPerusahaan = COMPANY_ADDRESS_LINE1 || "Jl. Jend. Sudirman No. 58, Cirebon";

 const suratIso = tglSurat || toIsoDateLocal(new Date());
 const suratObj = parseLocalDate(suratIso) || new Date();
 const romawi = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
 const nomor = (nomorSurat || "").trim() || `___/HRGA-AJ/${romawi[suratObj.getMonth()]}/${suratObj.getFullYear()}`;
 const tanggalSuratTeks = formatTanggalTerbilang(suratIso);

 const gaji = sisaGaji || {};
 const gajiPokokTetap = Number(gaji.gaji_pokok_tetap || 0);
 const hariKerjaBulan = Number(gaji.hari_kerja_per_bulan || 25);
 const gajiPerHari = Number(gaji.gaji_per_hari || 0);
 const sisaHariKerja = Number(gaji.sisa_hari_kerja || 0);
 const sisaGajiNominal = Number(gaji.sisa_gaji || 0);
 const biayaMcu = mcu && mcu.wajib ? Number(mcu.biaya_mcu || 0) : 0;
 const potonganMcu = Number((mcu && mcu.potongan_sisa_gaji) || 0);
 const kekuranganMcu = Number((mcu && mcu.kekurangan_dibayar_karyawan) || 0);
 const metodeMcu = (mcu && mcu.metode_pembayaran) || "-";
 const uangPisahNominal = Number((uangPisah && uangPisah.nominal) || 0);
 const uangPisahMult = Number((uangPisah && uangPisah.multiplier) || 0);
 const totalDiterima = Math.max(0, sisaGajiNominal + uangPisahNominal - potonganMcu);

 const exitDate = parseLocalDate(tglEfektif) || new Date();
 const bulanGajiTeks = `${NAMA_BULAN_ID[exitDate.getMonth()].toUpperCase()} ${exitDate.getFullYear()}`;
 const payDay = Number(gaji.tanggal_bayar_gaji || 25);
 let payMonth = exitDate.getMonth();
 let payYear = exitDate.getFullYear();
 if (payDay <= exitDate.getDate()) {
 payMonth += 1;
 if (payMonth > 11) { payMonth = 0; payYear += 1; }
 }
 const tanggalBayarTeks = `${payDay} ${NAMA_BULAN_ID[payMonth]} ${payYear}`;

 const alasanKalimat = ({
 Resign: "Pihak Kedua mengundurkan diri atas kemauan sendiri dan Para Pihak sepakat mengakhiri hubungan kerja secara musyawarah",
 "Habis Kontrak": "berakhirnya jangka waktu Perjanjian Kerja Waktu Tertentu (PKWT) Pihak Kedua",
 "PHK Efisiensi": "Pihak Pertama melakukan pemutusan hubungan kerja karena efisiensi perusahaan",
 Mangkir: "Pihak Kedua tidak hadir bekerja lebih dari 5 (lima) hari kerja tanpa keterangan",
 "Pelanggaran Berat": "Pihak Kedua melakukan pelanggaran berat terhadap Peraturan Perusahaan",
 Pensiun: "Pihak Kedua telah mencapai usia pensiun"
 })[alasan] || "berakhirnya hubungan kerja Para Pihak";

 const masaKerjaTeks = `${Number(masaKerjaTahun || 0)} tahun ${Number(masaKerjaBulan || 0)} bulan`;

 const assetRows = (assets && assets.length) ? assets.map((asset, index) => `
 <tr>
 <td style="border:1px solid #000; padding:3px; text-align:center;">${index + 1}</td>
 <td style="border:1px solid #000; padding:3px;">${escapeHtml(asset.nama_barang || "-")}</td>
 <td style="border:1px solid #000; padding:3px;">${escapeHtml(asset.kategori || "-")}</td>
 <td style="border:1px solid #000; padding:3px; text-align:center;">${escapeHtml(asset.status_pengembalian || "Diterima & Lengkap")}</td>
 </tr>`).join("") : `
 <tr><td colspan="4" style="border:1px solid #000; padding:4px; text-align:center; font-style:italic;">Tidak ada aset yang tercatat.</td></tr>`;

 const docHtmlPb = `
 <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:Arial, Helvetica, sans-serif; font-size:10.5px; line-height:1.45; color:#000; background:#ffffff; box-sizing:border-box;">
 <div style="page-break-inside:avoid; margin-bottom:4px;">
 ${isoDocHeaderTable({ judul: "SURAT PERJANJIAN BERSAMA", noDok: "HRD-PB-01", terbitRevisi: "1/0", hal: "1 dari 1" })}
 </div>

 <div style="text-align:center; font-weight:bold; font-size:13px; letter-spacing:0.4px; margin:8px 0 1px;">SURAT PERJANJIAN BERSAMA</div>
 <div style="text-align:center; font-size:10px; margin-bottom:8px;">Nomor: ${escapeHtml(nomor)}</div>

 <p style="margin:0 0 6px; text-align:justify;">Pada hari ini, ${escapeHtml(tanggalSuratTeks)}, kami yang bertanda tangan di bawah ini:</p>

 <table style="width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:4px;">
 <tr><td style="width:18%; padding:1px 0; vertical-align:top;">Nama</td><td style="width:2%;">:</td><td><b>${escapeHtml(pihakSatuNama)}</b></td></tr>
 <tr><td style="padding:1px 0; vertical-align:top;">Jabatan</td><td>:</td><td>${escapeHtml(pihakSatuJabatan)}</td></tr>
 <tr><td style="padding:1px 0; vertical-align:top;">Alamat</td><td>:</td><td>${escapeHtml(alamatPerusahaan)}</td></tr>
 <tr><td colspan="3" style="padding-top:3px; text-align:justify;">Dalam hal ini bertindak atas nama dan untuk kepentingan <b>${escapeHtml(COMPANY_NAME)}</b>, yang selanjutnya disebut sebagai <b>Pihak Pertama</b>.</td></tr>
 </table>

 <table style="width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:6px;">
 <tr><td style="width:18%; padding:1px 0; vertical-align:top;">Nama</td><td style="width:2%;">:</td><td><b>${escapeHtml(karyawan.nama_karyawan || "-")}</b></td></tr>
 <tr><td style="padding:1px 0; vertical-align:top;">Jabatan</td><td>:</td><td>${escapeHtml(karyawan.jabatan || "-")}</td></tr>
 <tr><td style="padding:1px 0; vertical-align:top;">Alamat</td><td>:</td><td>${escapeHtml(karyawan.alamat || "-")}</td></tr>
 <tr><td colspan="3" style="padding-top:3px; text-align:justify;">Dalam hal ini bertindak atas nama pribadi, yang selanjutnya disebut sebagai <b>Pihak Kedua</b>.</td></tr>
 </table>

 <p style="margin:6px 0; font-weight:bold;">Bersama-sama telah menyepakati hal-hal berikut:</p>
 <ol style="margin:0; padding-left:16px; text-align:justify;">
 <li style="margin-bottom:4px;">Bahwa ${escapeHtml(alasanKalimat)}, terhitung sejak tanggal <b>${escapeHtml(formatTanggalIndo(tglEfektif))}</b> (masa kerja ${escapeHtml(masaKerjaTeks)}).</li>
 <li style="margin-bottom:4px;">Bahwa atas berakhirnya hubungan kerja tersebut, Pihak Pertama memberikan hak kepada Pihak Kedua sampai dengan tanggal tersebut berupa <b>Sisa Upah</b> dengan rincian sebagai berikut:</li>
 </ol>

 <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:9px; margin:4px 0 5px;">
 <colgroup><col style="width:17%;" /><col style="width:19%;" /><col style="width:10%;" /><col style="width:19%;" /><col style="width:14%;" /><col style="width:21%;" /></colgroup>
 <thead>
 <tr style="background:#e2e8f0; text-align:center;">
 <th style="border:1px solid #000; padding:3px;">TGL PEMBAYARAN</th>
 <th style="border:1px solid #000; padding:3px;">DESKRIPSI</th>
 <th style="border:1px solid #000; padding:3px;">TOTAL HARI KERJA</th>
 <th style="border:1px solid #000; padding:3px;">GAJI POKOK + TUNJANGAN</th>
 <th style="border:1px solid #000; padding:3px;">UPAH / HARI</th>
 <th style="border:1px solid #000; padding:3px;">TOTAL UPAH</th>
 </tr>
 </thead>
 <tbody>
 <tr>
 <td style="border:1px solid #000; padding:3px; text-align:center;">${escapeHtml(tanggalBayarTeks)}</td>
 <td style="border:1px solid #000; padding:3px;">GAJI ${escapeHtml(bulanGajiTeks)}</td>
 <td style="border:1px solid #000; padding:3px; text-align:center;">${sisaHariKerja}</td>
 <td style="border:1px solid #000; padding:3px; text-align:right;">${fmtRupiah(gajiPokokTetap)}</td>
 <td style="border:1px solid #000; padding:3px; text-align:right;">${fmtRupiah(gajiPerHari)}</td>
 <td style="border:1px solid #000; padding:3px; text-align:right; font-weight:bold;">${fmtRupiah(sisaGajiNominal)}</td>
 </tr>
 </tbody>
 </table>
 <p style="margin:0 0 5px; font-size:9.5px; text-align:justify;">Perhitungan: ${fmtRupiah(gajiPokokTetap)} &divide; ${hariKerjaBulan} hari kerja = ${fmtRupiah(gajiPerHari)}/hari &times; ${sisaHariKerja} hari kerja (Senin&ndash;Sabtu) = <b>${fmtRupiah(sisaGajiNominal)}</b>. Cut-off penggajian tanggal ${Number(gaji.cutoff_hari || 21)} (periode 22 bulan sebelumnya s.d. 21 bulan berjalan) dan pembayaran gaji tanggal ${payDay} setiap bulan.</p>

 ${mcu && mcu.wajib ? `
 <div style="border:1px solid #b91c1c; background:#fef2f2; padding:6px; margin:5px 0; page-break-inside:avoid;">
 <div style="font-weight:bold; text-transform:uppercase; color:#991b1b; font-size:9.5px;">Kewajiban Penggantian Biaya Medical Check Up (MCU)</div>
 <p style="margin:3px 0 0; text-align:justify;">Sesuai Surat Komitmen Kerja, karena Pihak Kedua berhenti bekerja pada masa ${escapeHtml(mcu.status_kontrak_saat_resign || "-")}, Pihak Kedua wajib mengganti biaya MCU sebesar <b>${fmtRupiah(biayaMcu)}</b>${mcu.referensi_invoice && mcu.referensi_invoice !== "-" ? ` (Ref. invoice: ${escapeHtml(mcu.referensi_invoice)})` : ""}. ${metodeMcu === "POTONG_SISA_GAJI" ? `Para Pihak sepakat biaya tersebut <b>dipotong dari sisa upah</b> sebesar <b>${fmtRupiah(potonganMcu)}</b>${kekuranganMcu > 0 ? `, dengan kekurangan <b>${fmtRupiah(kekuranganMcu)}</b> wajib dibayar Pihak Kedua maksimal 7 (tujuh) hari kerja setelah tanggal efektif` : ", sehingga tidak ada kewajiban pembayaran tambahan"}.` : `Pihak Kedua wajib membayar biaya tersebut secara transfer/tunai maksimal 7 (tujuh) hari kerja setelah tanggal efektif.`}</p>
 </div>
 ` : ""}

 <table style="width:100%; border-collapse:collapse; font-size:10px; margin:4px 0 8px;">
 <tr><td style="padding:2px 0;">Total Sisa Upah</td><td style="text-align:right; font-weight:bold;">${fmtRupiah(sisaGajiNominal)}</td></tr>
 ${uangPisahNominal > 0 ? `<tr><td style="padding:2px 0;">Uang Pisah (${uangPisahMult}x gaji &mdash; masa kerja ${Number(masaKerjaTahun || 0)} tahun)</td><td style="text-align:right; font-weight:bold;">${fmtRupiah(uangPisahNominal)}</td></tr>` : ""}
 ${mcu && mcu.wajib && metodeMcu === "POTONG_SISA_GAJI" ? `<tr><td style="padding:2px 0;">Potongan Penggantian Biaya MCU</td><td style="text-align:right; font-weight:bold; color:#b91c1c;">- ${fmtRupiah(potonganMcu)}</td></tr>` : ""}
 <tr style="border-top:1px solid #000;"><td style="padding:3px 0; font-weight:bold;">Total Sisa Hak Diterima Pihak Kedua</td><td style="text-align:right; font-weight:bold;">${fmtRupiah(totalDiterima)}</td></tr>
 ${mcu && mcu.wajib && kekuranganMcu > 0 ? `<tr><td style="padding:2px 0; color:#b91c1c;">Kekurangan biaya MCU yang wajib dibayar Pihak Kedua</td><td style="text-align:right; font-weight:bold; color:#b91c1c;">${fmtRupiah(kekuranganMcu)}</td></tr>` : ""}
 </table>

 <ol start="3" style="margin:0; padding-left:16px; text-align:justify;">
 <li style="margin-bottom:4px;">Bahwa dengan ditandatangani serta dilaksanakannya Perjanjian Bersama ini, maka permasalahan hukum dan hubungan kerja di antara Para Pihak dinyatakan telah selesai, termasuk pengaduan Pihak Kedua kepada instansi-instansi terkait, dan masing-masing pihak tidak akan saling menuntut apa pun baik secara perdata maupun pidana.</li>
 <li style="margin-bottom:4px;">Bahwa dengan ditandatanganinya Perjanjian Bersama ini Para Pihak telah melaksanakan hak dan kewajibannya dan tidak akan menuntut masalah ketenagakerjaan di kemudian hari.</li>
 <li style="margin-bottom:4px;">Bahwa Perjanjian Bersama ini dibuat dengan keadaan sadar, sehat jasmani dan rohani serta tanpa adanya paksaan, tekanan, dan tipuan dari pihak mana pun.</li>
 ${catatanTambahan ? `<li style="margin-bottom:4px;">${escapeHtml(catatanTambahan)}</li>` : ""}
 </ol>

 <p style="margin:6px 0 10px; text-align:justify;">Demikian Perjanjian Bersama ini dibuat dalam rangkap dua, masing-masing bermeterai cukup dan mempunyai kekuatan hukum yang sama. Perjanjian ini mulai berlaku sejak ditandatangani oleh kedua belah pihak.</p>

 <div style="text-align:right; margin-bottom:2px;">Cirebon, ${escapeHtml(formatTanggalIndo(suratIso, { withDay: false }))}</div>
 <table style="width:100%; border-collapse:collapse; table-layout:fixed; text-align:center; font-size:10px; page-break-inside:avoid;">
 <tr>
 <td style="width:50%; border:none; padding:2px;">Pihak Pertama,</td>
 <td style="width:50%; border:none; padding:2px;">Pihak Kedua,</td>
 </tr>
 <tr><td style="border:none; height:46px;"></td><td style="border:none;"></td></tr>
 <tr>
 <td style="border:none; padding:2px;"><b><u>${escapeHtml(pihakSatuNama)}</u></b><br/>${escapeHtml(pihakSatuJabatan)}</td>
 <td style="border:none; padding:2px;"><b><u>${escapeHtml(karyawan.nama_karyawan || "-")}</u></b><br/>${escapeHtml(karyawan.jabatan || "-")}</td>
 </tr>
 </table>

 ${assets && assets.length ? `
 <div style="margin-top:14px; page-break-inside:avoid;">
 <div style="font-weight:bold; font-size:10.5px; text-transform:uppercase; border-top:1px solid #000; padding-top:8px;">Tanda Terima Penyerahan Asset</div>
 <p style="margin:3px 0;">Pada tanggal ${escapeHtml(formatTanggalIndo(tglEfektif, { withDay: false }))}, telah diterima kembali asset ${escapeHtml(COMPANY_NAME)} dari Pihak Kedua dengan detail sebagai berikut:</p>
 <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:9.5px;">
 <colgroup><col style="width:6%;" /><col style="width:44%;" /><col style="width:25%;" /><col style="width:25%;" /></colgroup>
 <thead>
 <tr style="background:#e2e8f0; text-align:center;">
 <th style="border:1px solid #000; padding:3px;">No</th>
 <th style="border:1px solid #000; padding:3px;">Nama Barang / Aset / Seragam</th>
 <th style="border:1px solid #000; padding:3px;">Kategori</th>
 <th style="border:1px solid #000; padding:3px;">Status Pengembalian</th>
 </tr>
 </thead>
 <tbody>${assetRows}</tbody>
 </table>
 <table style="width:100%; border-collapse:collapse; text-align:center; font-size:10px; margin-top:12px;">
 <tr><td style="width:50%;">Yang Menyerahkan,</td><td style="width:50%;">Menerima,</td></tr>
 <tr><td style="height:38px;"></td><td></td></tr>
 <tr>
 <td>( <b>${escapeHtml(karyawan.nama_karyawan || "-")}</b> )</td>
 <td>( <b>${escapeHtml(pihakSatuNama)}</b> )</td>
 </tr>
 </table>
 </div>` : ""}
 </div>`;

 const filenamePb = `Surat_Perjanjian_Bersama_${escapeHtml(karyawan.nama_karyawan || "Karyawan").replace(/\s+/g, "_")}.pdf`;

 openModal({
 title: `Surat Perjanjian Bersama - ${escapeHtml(karyawan.nama_karyawan || "-")}`,
 bodyHtml: `
 <div class="space-y-4">
 <div class="flex items-center justify-between gap-2 flex-wrap p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
 <div class="text-xs">
 <p class="font-bold text-indigo-800">Surat Perjanjian Bersama (Offboarding &amp; Ganti Rugi MCU)</p>
 <p class="text-indigo-700">Nomor: ${escapeHtml(nomor)}</p>
 </div>
 <button type="button" id="btn-modal-dl-pb" class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
 ${icon('download', 'w-4 h-4')} Unduh PDF
 </button>
 </div>
 <div class="border border-slate-300 rounded-xl p-4 bg-slate-100 overflow-y-auto max-h-[70vh]">
 <div class="bg-white shadow-md p-6 rounded-lg mx-auto" style="max-width:794px;">${docHtmlPb}</div>
 </div>
 </div>`,
 size: "xl",
 onMount: (backdrop) => {
 backdrop.querySelector("#btn-modal-dl-pb")?.addEventListener("click", async () => {
 toast("Sedang mengunduh file PDF...", "info");
 await downloadHtmlAsPdf(docHtmlPb, filenamePb);
 toast("Surat Perjanjian Bersama PDF berhasil diunduh!", "success");
 });
 }
 });

 try {
 await downloadHtmlAsPdf(docHtmlPb, filenamePb);
 toast("Surat Perjanjian Bersama PDF berhasil diunduh!", "success");
 } catch (error) {
 console.warn("Gagal auto download Surat Perjanjian Bersama:", error);
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
 <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:1.35; color:#000; background:#ffffff; box-sizing:border-box;">
 <style>
 * { box-sizing: border-box !important; }
 body, div, p, span, table, tr, th, td { font-family: Arial, Helvetica, sans-serif; }
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
 body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif; }
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
 // GM (tanpa override) hanya boleh melihat & cetak PDF → sembunyikan formulir tulis
 const authSession = getSession();
 const gmViewOnly = String(authSession?.role || "").toUpperCase() === "GM" && !(await canEditModuleData(authSession));
 // Branch Manager hanya melihat data cabangnya sendiri; role pusat bebas (branchScope = "")
 const branchScope = resolveBranchScope(authSession);

 const panel = container.querySelector("#sk-panel") || container;
 panel.innerHTML = `
 <div class="max-w-6xl mx-auto space-y-6 pb-10">
 <div>
 <h1 class="text-2xl font-bold text-slate-800">Siklus & Pergerakan Karyawan</h1>
 <p class="text-sm text-slate-500 mt-1">Manajemen Onboarding, Mutasi, Promosi, Demosi, dan Kalkulator Offboarding.</p>
 </div>
 
 <div class="ui-tabs mb-4">
 <button data-stab="input" class="sk-tab ui-tab active">Formulir Pergerakan</button>
 <button data-stab="riwayat" class="sk-tab ui-tab">Riwayat Siklus</button>
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

 // Link Google Form Exit Interview bawaan (dapat diedit & disimpan ulang oleh HRD)
 let exitInterviewUrl = "";
 try {
 const exitSnap = await getDoc(doc(db, COL.APP_SETTINGS, "offboarding_exit_interview"));
 if (exitSnap.exists()) exitInterviewUrl = String(exitSnap.data()?.url || "").trim();
 } catch (errExit) {
 console.warn("Gagal memuat link Google Form Exit Interview:", errExit);
 }

 // Ketentuan uang pisah (disimpan HRD, dapat diubah kapan saja)
 let uangPisahTiers = DEFAULT_UANG_PISAH_TIERS.map(tier => ({ ...tier }));
 try {
 const rulesSnap = await getDoc(doc(db, COL.APP_SETTINGS, "offboarding_rules"));
 const savedTiers = rulesSnap.exists() ? rulesSnap.data()?.uang_pisah_tiers : null;
 if (Array.isArray(savedTiers) && savedTiers.length) uangPisahTiers = normalizeUangPisahTiers(savedTiers);
 } catch (errRule) {
 console.warn("Gagal memuat ketentuan uang pisah:", errRule);
 }
 const activeKaryawan = allKaryawan
 .filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF")
 .filter(k => branchMatches(branchScope, k.cabang));
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

 <!-- FORM EXIT INTERVIEW (GOOGLE FORM) - DISEMATKAN PADA EMAIL OFFBOARDING -->
 <div class="border border-blue-200 rounded-xl p-3 bg-blue-50 space-y-2">
 <p class="text-xs font-black text-blue-800 uppercase tracking-wide">Form Exit Interview (Google Form)</p>
 <p class="text-[11px] text-blue-700 leading-relaxed">Tautan di bawah otomatis disematkan sebagai tombol <b>Isi Form Exit Interview</b> pada email notifikasi offboarding karyawan. HRD dapat mengganti link kapan saja, lalu simpan sebagai link bawaan untuk proses offboarding berikutnya.</p>
 <input type="url" id="off-exit-form" value="${escapeHtml(exitInterviewUrl)}" class="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg outline-none focus:border-blue-500 bg-white" placeholder="https://docs.google.com/forms/d/e/.../viewform">
 <div class="flex flex-wrap items-center justify-between gap-2">
 <p class="text-[10px] text-blue-600">Kosongkan bila belum ada form exit interview.</p>
 <button type="button" id="btn-save-exit-form" class="px-3 py-1.5 text-[11px] font-bold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition shadow-sm">Simpan sebagai Link Bawaan</button>
 </div>
 </div>

 <!-- KETENTUAN PENGGANTIAN BIAYA MCU: RESIGN DI MASA PROBATION / 3 BULAN PERTAMA KONTRAK PERTAMA -->
 <div id="wrap-mcu" class="hidden border border-red-200 rounded-xl p-3 bg-red-50 space-y-2">
 <p class="text-xs font-black text-red-800 uppercase tracking-wide">Wajib Ganti Biaya MCU - Surat Komitmen Kerja</p>
 <p class="text-[11px] text-red-700 leading-relaxed">Karyawan yang <b>mengundurkan diri (resign)</b> selama masa <b>Probation</b> atau di dalam <b>3 bulan pertama kontrak pertama</b> wajib mengganti biaya Medical Check Up (MCU) yang telah dibayar oleh perusahaan saat awal masuk sesuai nominal invoice laboratorium. Penggantian wajib diselesaikan maksimal 7 hari kerja setelah tanggal efektif resign.</p>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-[11px] font-bold text-red-800 mb-1">Nominal Biaya MCU (Sesuai Invoice) (Rp) *</label>
 <input type="number" id="off-mcu-biaya" min="0" step="1000" class="w-full px-3 py-2 text-sm border border-red-300 rounded-lg outline-none focus:border-red-500 bg-white font-bold" placeholder="Cth: 450000">
 </div>
 <div>
 <label class="block text-[11px] font-bold text-red-800 mb-1">Referensi Invoice / Laboratorium</label>
 <input type="text" id="off-mcu-referensi" class="w-full px-3 py-2 text-sm border border-red-300 rounded-lg outline-none focus:border-red-500 bg-white" placeholder="Cth: Invoice Prodia INV-2301 / Lab Klinik ABC">
 </div>
 </div>
 </div>

 <!-- SISA GAJI & PENGARAHAN PEMOTONGAN MCU -->
 <div class="border border-emerald-200 rounded-xl p-3 bg-emerald-50 space-y-3">
 <div class="flex items-center justify-between flex-wrap gap-2">
 <p class="text-xs font-black text-emerald-800 uppercase tracking-wide">Sisa Gaji &amp; Pemotongan MCU</p>
 <span class="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-full">Hari kerja Senin - Sabtu</span>
 </div>
 <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <div>
 <label class="block text-[10px] font-bold text-emerald-800 mb-1">Cut-off Gaji (tgl)</label>
 <input type="number" id="off-cutoff" min="1" max="31" value="21" class="w-full px-2.5 py-1.5 text-xs border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 bg-white font-bold">
 </div> <div>
 <label class="block text-[10px] font-bold text-emerald-800 mb-1">Hari Kerja / Bulan</label>
 <input type="number" id="off-harikerja" min="1" max="31" value="25" class="w-full px-2.5 py-1.5 text-xs border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 bg-white font-bold">
 </div>
 <div>
 <label class="block text-[10px] font-bold text-emerald-800 mb-1">Bayar Gaji (tgl)</label>
 <input type="number" id="off-bayar" min="1" max="31" value="25" class="w-full px-2.5 py-1.5 text-xs border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 bg-white font-bold">
 </div>
 <div>
 <label class="block text-[10px] font-bold text-emerald-800 mb-1">Gaji Dihitung Mulai</label>
 <input type="date" id="off-sisa-mulai" class="w-full px-2 py-1 text-xs border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 bg-white font-semibold">
 </div>
 </div>
 <p class="text-[10px] text-emerald-700 leading-relaxed">Periode cut-off penggajian: <b>tanggal 22 bulan sebelumnya s.d. tanggal 21 bulan berjalan</b>. Contoh: gaji dibayar 25 Oktober menghitung absensi 22 September s.d. 21 Oktober.</p>
 <div id="off-sisa-summary" class="rounded-lg bg-white border border-emerald-100 p-2.5 text-[11px] text-slate-600">Isi gaji pokok + tunjangan tetap serta tanggal efektif keluar untuk menghitung sisa gaji otomatis.</div>
 <div id="wrap-mcu-metode" class="hidden rounded-lg bg-white border border-red-200 p-2.5 space-y-2">
 <label class="block text-[11px] font-bold text-red-800 mb-1">Metode Penggantian Biaya MCU</label>
 <select id="off-mcu-metode" class="w-full px-2.5 py-1.5 text-xs border border-red-300 rounded-lg outline-none bg-white font-bold text-slate-700">
 <option value="POTONG_SISA_GAJI">Potong dari Sisa Gaji (Payroll) - disarankan</option>
 <option value="TRANSFER">Bayar Sendiri oleh Karyawan (Transfer / Tunai)</option>
 </select>
 <p class="text-[10px] text-red-700">Bila biaya MCU melebihi sisa gaji, sistem mencatat kekurangan yang wajib dibayar karyawan.</p>
 </div>
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
 <div>
 <label class="block text-[10px] font-bold text-emerald-800 mb-1">Nomor Surat Perjanjian Bersama (opsional)</label>
 <input type="text" id="off-pb-nomor" class="w-full px-2.5 py-1.5 text-xs border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 bg-white" placeholder="Cth: 009/HRGA-AJ/X/2026">
 </div>
 <div>
 <label class="block text-[10px] font-bold text-emerald-800 mb-1">Tanggal Surat Perjanjian Bersama</label>
 <input type="date" id="off-pb-tanggal" value="${new Date().toISOString().split("T")[0]}" class="w-full px-2 py-1 text-xs border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 bg-white font-semibold">
 </div>
 </div>
 <div>
 <label class="block text-[10px] font-bold text-emerald-800 mb-1">Klausul / Catatan Tambahan Surat Perjanjian Bersama (opsional)</label>
 <textarea id="off-pb-catatan" rows="2" class="w-full px-2.5 py-1.5 text-xs border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 bg-white" placeholder="Cth: Kedua pihak sepakat menyelesaikan seluruh kewajiban secara kekeluargaan."></textarea>
 </div>
 </div>

 <!-- KETENTUAN UANG PISAH - DAPAT DIUBAH LANGSUNG OLEH HRD -->
 <details class="border border-amber-200 rounded-xl bg-amber-50 p-3">
 <summary class="cursor-pointer text-xs font-black text-amber-800 uppercase tracking-wide">Ketentuan Uang Pisah (Resign) - dapat diubah HRD</summary>
 <div class="mt-3 space-y-2">
 <p class="text-[11px] text-amber-700 leading-relaxed">Berlaku untuk karyawan tetap yang mengundurkan diri. Uang pisah = <b>pengali &times; (gaji pokok + tunjangan tetap)</b>. Kosongkan kolom "s.d. &lt;" untuk tingkat tanpa batas atas. Perubahan di sini langsung dipakai pada perhitungan, tombol <b>Simpan Ketentuan</b> menjadikannya default untuk offboarding berikutnya.</p>
 <div class="grid grid-cols-12 gap-2 text-[10px] font-bold text-amber-800 px-1">
 <div class="col-span-4">Masa Kerja &ge; (tahun)</div>
 <div class="col-span-4">s.d. &lt; (tahun)</div>
 <div class="col-span-3">Pengali Gaji</div>
 <div class="col-span-1 text-center">Aksi</div>
 </div>
 <div id="uang-pisah-tiers" class="space-y-2"></div>
 <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
 <button type="button" id="btn-add-pisah-tier" class="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition shadow-sm">+ Tambah Tingkat</button>
 <div class="flex flex-wrap gap-2">
 <button type="button" id="btn-reset-pisah-tier" class="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition shadow-sm">Reset Default</button>
 <button type="button" id="btn-save-pisah-tier" class="px-2.5 py-1 text-[11px] font-bold text-white bg-amber-600 border border-amber-600 rounded-lg hover:bg-amber-700 transition shadow-sm">Simpan Ketentuan</button>
 </div>
 </div>
 </div>
 </details>

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
 <button type="button" class="btn-del-off-asset text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Barang" aria-label="Hapus barang">${icon("trash", "w-3.5 h-3.5")}</button>
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

 // ==== KETENTUAN PENGGANTIAN BIAYA MCU (PROBATION / 3 BULAN PERTAMA KONTRAK PERTAMA) ====
 const wrapMcu = dynFields.querySelector("#wrap-mcu");
 const inpMcuBiaya = dynFields.querySelector("#off-mcu-biaya");
 const inpMcuRef = dynFields.querySelector("#off-mcu-referensi");
 const inpOffJoin = dynFields.querySelector("#off-join");
 const inpOffOut = dynFields.querySelector("#off-out");

 function computeMcuLiability() {
 const alasanNow = selAlasan ? selAlasan.value : "";
 const joinStr = inpOffJoin ? inpOffJoin.value : "";
 const outStr = inpOffOut ? inpOffOut.value : "";
 const joinDate = joinStr ? new Date(joinStr) : null;
 const outDate = outStr ? new Date(outStr) : new Date();
 const hariKerja = (joinDate && outDate && !isNaN(joinDate) && !isNaN(outDate)) ? Math.max(0, Math.floor((outDate - joinDate) / 86400000)) : 0;
 const blnKerja = Math.floor(hariKerja / 30.4375);
 const statKaryawan = ((currentSelectedKaryawan && currentSelectedKaryawan.status_karyawan) || "").toUpperCase();
 const isProbation = statKaryawan.includes("PROBATION") || statKaryawan.includes("PERCOBAAN");
 const wajib = alasanNow === "Resign" && (isProbation || blnKerja < 3);
 return { wajib, blnKerja, isProbation };
 }

 function refreshMcuBlock() {
 if (!wrapMcu || !inpMcuBiaya) return;
 const { wajib } = computeMcuLiability();
 wrapMcu.classList.toggle("hidden", !wajib);
 inpMcuBiaya.required = wajib;
 if (wrapMcuMetode) wrapMcuMetode.classList.toggle("hidden", !wajib);
 refreshSisaGajiSummary();
 }

 // ==== SISA GAJI BERJALAN & PENGARAHAN PEMOTONGAN MCU ====
 const inpOffCutoff = dynFields.querySelector("#off-cutoff");
 const inpOffHariKerja = dynFields.querySelector("#off-harikerja");
 const inpOffBayar = dynFields.querySelector("#off-bayar");
 const inpOffSisaMulai = dynFields.querySelector("#off-sisa-mulai");
 const inpOffGaji = dynFields.querySelector("#off-gaji");
 const selMetodeMcu = dynFields.querySelector("#off-mcu-metode");
 const wrapMcuMetode = dynFields.querySelector("#wrap-mcu-metode");
 const sisaGajiSummary = dynFields.querySelector("#off-sisa-summary");

 function readSisaGajiForm() {
 return hitungSisaGaji({
 outDate: inpOffOut ? inpOffOut.value : "",
 gajiPokok: parseFloat(inpOffGaji?.value || "0") || 0,
 cutoffDay: parseInt(inpOffCutoff?.value || "21", 10) || 21,
 hariKerjaPerBulan: parseInt(inpOffHariKerja?.value || "25", 10) || 25,
 startDate: inpOffSisaMulai?.value || ""
 });
 }

 function refreshSisaGajiSummary() {
 if (!sisaGajiSummary) return;
 if (!inpOffOut?.value || !(parseFloat(inpOffGaji?.value || "0") > 0)) {
 sisaGajiSummary.innerHTML = `Isi <b>Gaji Pokok + Tunjangan Tetap</b> serta <b>Tanggal Efektif Keluar</b> untuk menghitung sisa gaji otomatis.`;
 return;
 }
 const info = readSisaGajiForm();
 const mcu = computeMcuLiability();
 const biayaMcu = parseFloat(inpMcuBiaya?.value || "0") || 0;
 const metode = selMetodeMcu?.value || "POTONG_SISA_GAJI";
 const potongan = (mcu.wajib && metode === "POTONG_SISA_GAJI") ? Math.min(biayaMcu, info.sisaGaji) : 0;
 const sisaSetelah = info.sisaGaji - potongan;
 const kekurangan = mcu.wajib ? Math.max(0, biayaMcu - potongan) : 0;
 sisaGajiSummary.innerHTML = `
 <div class="space-y-1">
 <div class="flex justify-between gap-2"><span>Gaji pokok + tunjangan tetap</span><b>${fmtRupiah(parseFloat(inpOffGaji?.value || "0") || 0)}</b></div>
 <div class="flex justify-between gap-2"><span>Gaji per hari (dibagi ${info.hariKerjaPerBulan} hari kerja)</span><b>${fmtRupiah(info.gajiPerHari)}</b></div>
 <div class="flex justify-between gap-2"><span>Sisa hari kerja (${formatTanggalIndo(info.mulai, { withDay: false })} s.d. ${formatTanggalIndo(inpOffOut.value, { withDay: false })}, Senin-Sabtu)</span><b>${info.sisaHariKerja} hari</b></div>
 <div class="flex justify-between gap-2 border-t border-emerald-100 pt-1 mt-1 text-emerald-800"><span class="font-bold">Sisa gaji berjalan</span><b>${fmtRupiah(info.sisaGaji)}</b></div>
 ${mcu.wajib ? `<div class="flex justify-between gap-2 text-red-700"><span>Potongan MCU (${metode === "POTONG_SISA_GAJI" ? "potong sisa gaji" : "bayar sendiri"})</span><b>- ${fmtRupiah(potongan)}</b></div>
 <div class="flex justify-between gap-2 text-red-800"><span class="font-bold">${kekurangan > 0 ? "Kekurangan wajib dibayar karyawan" : "Sisa gaji setelah potongan MCU"}</span><b>${fmtRupiah(kekurangan > 0 ? kekurangan : sisaSetelah)}</b></div>` : ""}
 <p class="text-[10px] text-slate-400 pt-1">Belum memperhitungkan hari libur nasional, BPJS, lembur, dan potongan lain.</p>
 </div>`;
 }

 function syncSisaGajiStart() {
 if (!inpOffSisaMulai) return;
 inpOffSisaMulai.value = defaultSisaGajiStart(inpOffOut?.value || "", inpOffCutoff?.value || "21");
 refreshSisaGajiSummary();
 }

 // ==== EDITOR KETENTUAN UANG PISAH (LANGSUNG OLEH HRD) ====
 const tiersBox = dynFields.querySelector("#uang-pisah-tiers");

 function addPisahTierRow(tier = {}) {
 if (!tiersBox) return;
 const row = document.createElement("div");
 row.className = "uang-pisah-tier-row grid grid-cols-12 gap-2 items-center";
 const maxVal = (tier.max_years === null || tier.max_years === undefined) ? "" : Number(tier.max_years);
 row.innerHTML = `
 <div class="col-span-4"><input type="number" min="0" step="0.5" class="tier-min w-full px-2 py-1 text-xs border border-amber-300 rounded-md outline-none focus:border-amber-500 bg-white" value="${Number(tier.min_years || 0)}"></div>
 <div class="col-span-4"><input type="number" min="0" step="0.5" class="tier-max w-full px-2 py-1 text-xs border border-amber-300 rounded-md outline-none focus:border-amber-500 bg-white" placeholder="Tanpa batas" value="${maxVal}"></div>
 <div class="col-span-3"><input type="number" min="0" step="0.5" class="tier-mult w-full px-2 py-1 text-xs border border-amber-300 rounded-md outline-none focus:border-amber-500 bg-white font-bold" value="${Number(tier.multiplier || 0)}"></div>
 <div class="col-span-1 text-center"><button type="button" class="btn-del-tier text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded px-1 py-1" title="Hapus tingkat">Hapus</button></div>`;
 row.querySelector(".btn-del-tier").onclick = () => {
 if (tiersBox.children.length > 1) row.remove();
 else toast("Minimal 1 tingkat uang pisah", "info");
 };
 tiersBox.appendChild(row);
 }

 function renderPisahTiers(tiers) {
 if (!tiersBox) return;
 tiersBox.innerHTML = "";
 normalizeUangPisahTiers(tiers).forEach(tier => addPisahTierRow(tier));
 }

 function readPisahTiersFromForm() {
 return readUangPisahTiersFromDom(dynFields, uangPisahTiers);
 }

 renderPisahTiers(uangPisahTiers);

 dynFields.querySelector("#btn-add-pisah-tier")?.addEventListener("click", () => addPisahTierRow({ min_years: 0, max_years: null, multiplier: 0 }));
 dynFields.querySelector("#btn-reset-pisah-tier")?.addEventListener("click", () => {
 renderPisahTiers(DEFAULT_UANG_PISAH_TIERS);
 toast("Form direset ke ketentuan default. Klik Simpan Ketentuan untuk menyimpannya.", "info");
 });
 dynFields.querySelector("#btn-save-pisah-tier")?.addEventListener("click", async () => {
 const tiers = readPisahTiersFromForm();
 try {
 await setDoc(doc(db, COL.APP_SETTINGS, "offboarding_rules"), {
 uang_pisah_tiers: tiers,
 updated_at: new Date().toISOString()
 }, { merge: true });
 uangPisahTiers = tiers;
 toast("Ketentuan uang pisah tersimpan dan langsung berlaku untuk offboarding berikutnya.", "success");
 } catch (error) {
 console.error("Gagal menyimpan ketentuan uang pisah:", error);
 toast("Gagal menyimpan ketentuan uang pisah: " + error.message, "error");
 }
 });

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
 <button type="button" class="btn-del-chk text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Item" aria-label="Hapus item checklist">${icon("trash", "w-3.5 h-3.5")}</button>
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
 if (reason === "Resign" && computeMcuLiability().wajib) {
 defaults.push("Surat Pernyataan & SPK Penggantian Biaya MCU (Sesuai Surat Komitmen Kerja)");
 }
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
 selAlasan.addEventListener("change", () => {
 populateDefaultChecklists(selAlasan.value);
 refreshMcuBlock();
 });
 }
 if (inpOffJoin) inpOffJoin.addEventListener("change", refreshMcuBlock);
 if (inpOffOut) inpOffOut.addEventListener("change", refreshMcuBlock);
 if (inpOffOut) inpOffOut.addEventListener("change", syncSisaGajiStart);
 if (inpOffCutoff) inpOffCutoff.addEventListener("change", syncSisaGajiStart);
 if (inpOffSisaMulai) inpOffSisaMulai.addEventListener("change", refreshSisaGajiSummary);
 if (inpOffGaji) inpOffGaji.addEventListener("input", refreshSisaGajiSummary);
 if (inpOffHariKerja) inpOffHariKerja.addEventListener("change", refreshSisaGajiSummary);
 if (inpMcuBiaya) inpMcuBiaya.addEventListener("input", refreshSisaGajiSummary);
 if (selMetodeMcu) selMetodeMcu.addEventListener("change", refreshSisaGajiSummary);
 refreshMcuBlock();
 syncSisaGajiStart();

 // Simpan link Google Form Exit Interview sebagai bawaan (dapat diganti kapan saja)
 const btnSaveExitForm = dynFields.querySelector("#btn-save-exit-form");
 if (btnSaveExitForm) {
 btnSaveExitForm.addEventListener("click", async () => {
 const urlVal = (dynFields.querySelector("#off-exit-form")?.value || "").trim();
 if (urlVal && !/^https?:\/\//i.test(urlVal)) return toast("Link Google Form Exit Interview harus diawali http:// atau https://", "warning");
 try {
 await setDoc(doc(db, COL.APP_SETTINGS, "offboarding_exit_interview"), { url: urlVal, updated_at: new Date().toISOString() }, { merge: true });
 exitInterviewUrl = urlVal;
 toast(urlVal ? "Link Google Form Exit Interview disimpan sebagai link bawaan." : "Link bawaan Exit Interview dikosongkan.", "success");
 } catch (errSaveExit) {
 console.error("Gagal menyimpan link exit interview:", errSaveExit);
 toast("Gagal menyimpan link exit interview: " + errSaveExit.message, "error");
 }
 });
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
 <button type="button" class="btn-del-orientasi text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Item" aria-label="Hapus item orientasi">${icon("trash", "w-3.5 h-3.5")}</button>
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
 <button type="button" class="btn-del-training text-xs text-rose-500 hover:bg-rose-50 p-1 rounded-md font-bold" title="Hapus Modul" aria-label="Hapus modul training">${icon("trash", "w-3.5 h-3.5")}</button>
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
 const exitFormUrlVal = container.querySelector("#off-exit-form") ? container.querySelector("#off-exit-form").value.trim() : "";
 if (exitFormUrlVal && !/^https?:\/\//i.test(exitFormUrlVal)) return toast("Link Google Form Exit Interview harus diawali http:// atau https://", "warning");

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
 const hariKerjaTotal = Math.max(0, Math.floor(diffTime / 86400000));
 const masaKerjaBulan = Math.floor(hariKerjaTotal / 30.4375);

 const tiersUsed = readUangPisahTiersFromDom(dynFields, uangPisahTiers);
 const uangPisahBerlaku = ["Resign", "Mangkir", "Pelanggaran Berat"].includes(alasan);
 const uangPisahMult = uangPisahBerlaku ? uangPisahMultiplier(mathYears, tiersUsed) : 0;

 const hitungUangPisah = (y, upah) => uangPisahBerlaku ? uangPisahMultiplier(y, tiersUsed) * upah : 0;

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

 // ==== KETENTUAN PENGGANTIAN BIAYA MCU: RESIGN DI MASA PROBATION / 3 BULAN PERTAMA KONTRAK PERTAMA ====
 const statKaryawanNow = ((currentSelectedKaryawan && currentSelectedKaryawan.status_karyawan) || "").toUpperCase();
 const isProbationAtExit = statKaryawanNow.includes("PROBATION") || statKaryawanNow.includes("PERCOBAAN");
 const mcuWajib = alasan === "Resign" && (isProbationAtExit || masaKerjaBulan < 3);
 const mcuStatus = isProbationAtExit ? "Probation (Masa Percobaan)" : "Kontrak Pertama (3 Bulan Pertama)";
 let biayaMcu = 0;
 let refMcu = "";
 if (mcuWajib) {
 biayaMcu = parseFloat((dynFields.querySelector("#off-mcu-biaya")?.value || "0")) || 0;
 refMcu = (dynFields.querySelector("#off-mcu-referensi")?.value || "").trim();
 if (biayaMcu <= 0) {
 toast("Nominal biaya MCU wajib diisi: karyawan resign di masa Probation / 3 bulan pertama kontrak pertama wajib mengganti biaya MCU yang telah dibayar perusahaan saat awal masuk.", "warning");
 return;
 }
 if (!checklist.some(c => c.toUpperCase().includes("MCU"))) {
 checklist.push("Surat Pernyataan & SPK Penggantian Biaya MCU (Sesuai Surat Komitmen Kerja)");
 }
 }

 // ==== SISA GAJI BERJALAN & PENGARAHAN PEMOTONGAN MCU ====
 const cutoffHari = parseInt(container.querySelector("#off-cutoff")?.value || "21", 10) || 21;
 const hariKerjaPerBulan = parseInt(container.querySelector("#off-harikerja")?.value || "25", 10) || 25;
 const tanggalBayarGaji = parseInt(container.querySelector("#off-bayar")?.value || "25", 10) || 25;
 const sisaMulaiVal = container.querySelector("#off-sisa-mulai")?.value || defaultSisaGajiStart(out, cutoffHari);
 const sisaGajiInfo = hitungSisaGaji({ outDate: out, gajiPokok: gaji, cutoffDay: cutoffHari, hariKerjaPerBulan, startDate: sisaMulaiVal });
 let metodeMcu = "TRANSFER";
 let potonganSisaGaji = 0;
 let sisaGajiSetelahPotong = sisaGajiInfo.sisaGaji;
 let kekuranganMcu = 0;
 if (mcuWajib) {
 metodeMcu = container.querySelector("#off-mcu-metode")?.value || "POTONG_SISA_GAJI";
 potonganSisaGaji = metodeMcu === "POTONG_SISA_GAJI" ? Math.min(biayaMcu, sisaGajiInfo.sisaGaji) : 0;
 sisaGajiSetelahPotong = sisaGajiInfo.sisaGaji - potonganSisaGaji;
 kekuranganMcu = Math.max(0, biayaMcu - potonganSisaGaji);
 if (metodeMcu === "POTONG_SISA_GAJI" && kekuranganMcu > 0) {
 toast(`Biaya MCU melebihi sisa gaji. Kekurangan ${fmtRupiah(kekuranganMcu)} tetap wajib dibayar karyawan.`, "warning");
 }
 }
 const catatanPbVal = container.querySelector("#off-pb-catatan") ? container.querySelector("#off-pb-catatan").value.trim() : "";
 const nomorPbVal = container.querySelector("#off-pb-nomor") ? container.querySelector("#off-pb-nomor").value.trim() : "";
 const tanggalPbVal = container.querySelector("#off-pb-tanggal") ? container.querySelector("#off-pb-tanggal").value : "";

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
 const uangPisahLabel = alasan === "Habis Kontrak" ? "Uang Kompensasi PKWT (PP 35/2021)" : "Uang Pisah (Psl 61/62)";
 payloadLog.keterangan = `Alasan: ${alasan}${penggantiVal ? ` | Pengganti: ${penggantiVal}` : ''}${mcuWajib ? ` | Wajib Ganti Biaya MCU: ${fmtRupiah(biayaMcu)} (${mcuStatus})` : ''}${sisaGajiInfo.sisaGaji > 0 ? ` | Sisa Gaji: ${fmtRupiah(sisaGajiInfo.sisaGaji)} (${sisaGajiInfo.sisaHariKerja} hari)` : ''}${mcuWajib && metodeMcu === "POTONG_SISA_GAJI" ? ` | MCU dipotong dari sisa gaji: ${fmtRupiah(potonganSisaGaji)}` : ''}`;
 payloadLog.detail_offboarding = { 
 masa_kerja_tahun: mathYears, 
 masa_kerja_bulan: masaKerjaBulan,
 pesangon, 
 upmk, 
 uang_pisah: uangPisah, 
 karyawan_pengganti: penggantiVal, 
 catatan_handover: catatanHandoverVal,
 handover_tasks: handoverTasksList,
 checklist_doc: checklist,
 exit_interview: {
 form_url: exitFormUrlVal,
 provider: "Google Form"
 },
 sisa_gaji: {
 gaji_pokok_tetap: gaji,
 cutoff_hari: cutoffHari,
 tanggal_bayar_gaji: tanggalBayarGaji,
 hari_kerja_per_bulan: hariKerjaPerBulan,
 mulai_hitung: sisaGajiInfo.mulai,
 sisa_hari_kerja: sisaGajiInfo.sisaHariKerja,
 gaji_per_hari: sisaGajiInfo.gajiPerHari,
 sisa_gaji: sisaGajiInfo.sisaGaji
 },
 uang_pisah_rule: {
 masa_kerja_tahun: mathYears,
 multiplier: uangPisahMult,
 nominal: uangPisah,
 tiers: tiersUsed
 },
 penggantian_mcu: {
 wajib: mcuWajib,
 status_kontrak_saat_resign: mcuWajib ? mcuStatus : "-",
 masa_kerja_bulan: masaKerjaBulan,
 biaya_mcu: mcuWajib ? biayaMcu : 0,
 referensi_invoice: refMcu || "-",
 metode_pembayaran: mcuWajib ? metodeMcu : "-",
 potongan_sisa_gaji: potonganSisaGaji,
 sisa_gaji_setelah_potongan: sisaGajiSetelahPotong,
 kekurangan_dibayar_karyawan: kekuranganMcu,
 nomor_surat_pb: nomorPbVal,
 tanggal_surat_pb: tanggalPbVal || new Date().toISOString().split("T")[0],
 catatan_pb: catatanPbVal,
 batas_pembayaran: "Maksimal 7 hari kerja setelah tanggal efektif resign"
 },
 assigned_assets: assignedAssets 
 };
 payloadLog.update_master = { aktif_tdk_aktif: "TIDAK AKTIF" }; 

 previewHtml = `
 <div class="mb-4">
 <p class="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Lama Masa Kerja</p>
 <p class="text-xl font-black text-slate-800">${mathYears} Tahun <span class="text-sm font-medium text-slate-500">(${(years).toFixed(1)} Thn riil • ${masaKerjaBulan} bulan)</span></p>
 </div>

 ${mcuWajib ? `
 <div class="p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-xs">
 <p class="font-black text-red-800 uppercase mb-1">Wajib Mengganti Biaya MCU - ${escapeHtml(mcuStatus)}</p>
 <p class="text-red-700 leading-relaxed">Karyawan mengundurkan diri selama masa ${escapeHtml(mcuStatus)} (masa kerja ${masaKerjaBulan} bulan). Sesuai <b>Surat Komitmen Kerja</b>, karyawan wajib mengganti biaya Medical Check Up (MCU) yang telah dibayar perusahaan saat awal masuk: <b class="text-red-900">${fmtRupiah(biayaMcu)}</b>${refMcu ? ` - Ref: ${escapeHtml(refMcu)}` : ""}. ${metodeMcu === "POTONG_SISA_GAJI" ? `Biaya ini akan <b>dipotong dari sisa gaji</b> sebesar <b>${fmtRupiah(potonganSisaGaji)}</b>${kekuranganMcu > 0 ? ` dan kekurangan <b>${fmtRupiah(kekuranganMcu)}</b> wajib dibayar karyawan` : ""}.` : "Biaya dibayar sendiri oleh karyawan (transfer / tunai)."} Penggantian wajib diselesaikan maksimal 7 hari kerja setelah tanggal efektif resign.</p>
 </div>
 ` : ''}

 <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-4 text-xs">
 <p class="font-black text-emerald-800 uppercase mb-1">Sisa Gaji Berjalan</p>
 <div class="space-y-1 text-emerald-900">
 <div class="flex justify-between gap-2"><span>Gaji pokok + tunjangan tetap ÷ ${hariKerjaPerBulan} hari kerja</span><b>${fmtRupiah(sisaGajiInfo.gajiPerHari)} / hari</b></div>
 <div class="flex justify-between gap-2"><span>Sisa ${sisaGajiInfo.sisaHariKerja} hari kerja (${formatTanggalIndo(sisaGajiInfo.mulai, { withDay: false })} s.d. ${formatTanggalIndo(out, { withDay: false })}, Senin-Sabtu)</span><b>${fmtRupiah(sisaGajiInfo.sisaGaji)}</b></div>
 <div class="flex justify-between gap-2 text-[10px] text-emerald-700"><span>Cut-off gaji tanggal ${cutoffHari}, pembayaran gaji tanggal ${tanggalBayarGaji}</span><span>Belum termasuk libur nasional & potongan lain</span></div>
 ${mcuWajib ? `<div class="flex justify-between gap-2 border-t border-emerald-200 pt-1 mt-1 text-red-700"><span>Potongan biaya MCU (${metodeMcu === "POTONG_SISA_GAJI" ? "potong sisa gaji" : "bayar sendiri"})</span><b>- ${fmtRupiah(potonganSisaGaji)}</b></div>
 <div class="flex justify-between gap-2 text-red-800"><span class="font-bold">${kekuranganMcu > 0 ? "Kekurangan MCU wajib dibayar karyawan" : "Sisa gaji setelah potongan MCU"}</span><b>${fmtRupiah(kekuranganMcu > 0 ? kekuranganMcu : sisaGajiSetelahPotong)}</b></div>` : ""}
 </div>
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
 <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">${escapeHtml(uangPisahLabel)}${uangPisahMult > 0 ? ` &mdash; ${uangPisahMult}x gaji` : ""}</span><span class="font-bold text-maroon-700">${fmtRupiah(uangPisah)}</span></div>
 <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex justify-between items-center"><span class="text-xs font-semibold text-emerald-700">Sisa Gaji Berjalan (${sisaGajiInfo.sisaHariKerja} hari kerja)</span><span class="font-bold text-emerald-800">${fmtRupiah(sisaGajiInfo.sisaGaji)}</span></div>
 <div class="p-3 ${mcuWajib ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'} rounded-lg border flex justify-between items-center"><span class="text-xs font-semibold ${mcuWajib ? 'text-red-700' : 'text-slate-500'}">Penggantian Biaya MCU (Probation / Kontrak Pertama)</span><span class="font-bold ${mcuWajib ? 'text-red-700' : 'text-slate-400'}">${mcuWajib ? fmtRupiah(biayaMcu) : 'Tidak Wajib'}</span></div>
 ${mcuWajib ? `<div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">${metodeMcu === "POTONG_SISA_GAJI" ? "Potongan MCU dari Sisa Gaji" : "MCU Dibayar Sendiri oleh Karyawan"}</span><span class="font-bold ${metodeMcu === "POTONG_SISA_GAJI" ? "text-red-700" : "text-slate-600"}">${metodeMcu === "POTONG_SISA_GAJI" ? fmtRupiah(potonganSisaGaji) : fmtRupiah(biayaMcu)}</span></div>
 <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">${kekuranganMcu > 0 ? "Kekurangan MCU Wajib Dibayar Karyawan" : "Sisa Gaji Setelah Potongan MCU"}</span><span class="font-bold text-slate-700">${fmtRupiah(kekuranganMcu > 0 ? kekuranganMcu : sisaGajiSetelahPotong)}</span></div>` : ""}
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
 ${mcuWajib ? `
 <button type="button" id="btn-print-mcu-doc" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2 text-xs mb-4">
 Cetak & Unduh Surat Tagihan Penggantian Biaya MCU (PDF)
 </button>
 ` : ''}
 <button type="button" id="btn-print-pb-doc" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2 text-xs mb-4">
 Cetak & Unduh Surat Perjanjian Bersama (PDF)
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
 checklistDoc: ["Surat Pengunduran Diri / PHK", "Form Exit Interview", "Form Serah Terima Aset & Kerahasiaan", "BPJS & Paklaring"],
 penggantianMcu: payloadLog.detail_offboarding?.penggantian_mcu || null,
 sisaGaji: payloadLog.detail_offboarding?.sisa_gaji || null
 });
 }

 const btnPrintMcu = resBox.querySelector("#btn-print-mcu-doc");
 if (btnPrintMcu && currentSelectedKaryawan) {
 btnPrintMcu.onclick = () => printMcuBillingPdf({
 karyawan: currentSelectedKaryawan,
 tglJoin: container.querySelector("#off-join") ? container.querySelector("#off-join").value : "",
 tglEfektif: payloadLog.tanggal_efektif,
 masaKerjaBulan: payloadLog.detail_offboarding?.masa_kerja_bulan || 0,
 sisaGaji: payloadLog.detail_offboarding?.sisa_gaji || null,
 mcu: payloadLog.detail_offboarding?.penggantian_mcu || null
 });
 }

 const btnPrintPb = resBox.querySelector("#btn-print-pb-doc");
 if (btnPrintPb && currentSelectedKaryawan) {
 btnPrintPb.onclick = () => printPerjanjianBersamaPdf({
 karyawan: currentSelectedKaryawan,
 alasan: container.querySelector("#off-alasan") ? container.querySelector("#off-alasan").value : "Resign",
 tglJoin: container.querySelector("#off-join") ? container.querySelector("#off-join").value : "",
 tglEfektif: payloadLog.tanggal_efektif,
 tglSurat: payloadLog.detail_offboarding?.penggantian_mcu?.tanggal_surat_pb || new Date().toISOString().split("T")[0],
 nomorSurat: payloadLog.detail_offboarding?.penggantian_mcu?.nomor_surat_pb || "",
 masaKerjaTahun: payloadLog.detail_offboarding?.masa_kerja_tahun || 0,
 masaKerjaBulan: payloadLog.detail_offboarding?.masa_kerja_bulan || 0,
 sisaGaji: payloadLog.detail_offboarding?.sisa_gaji || null,
 uangPisah: payloadLog.detail_offboarding?.uang_pisah_rule || null,
 mcu: payloadLog.detail_offboarding?.penggantian_mcu || null,
 pengganti: payloadLog.detail_offboarding?.karyawan_pengganti || "",
 assets: payloadLog.detail_offboarding?.assigned_assets || [],
 handoverTasks: payloadLog.detail_offboarding?.handover_tasks || [],
 catatanTambahan: payloadLog.detail_offboarding?.penggantian_mcu?.catatan_pb || ""
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
 let targetEmail = "";

 if (payloadLog.new_employee_data) {
 const newId = genId("KRY");
 await fsAdd(COL.MASTER_KARYAWAN, payloadLog.new_employee_data, newId);
 payloadLog.id_karyawan = newId;
 } else if (payloadLog.update_master) {
 await updateDoc(doc(db, COL.MASTER_KARYAWAN, payloadLog.id_karyawan), payloadLog.update_master);
 if (currentSelectedKaryawan) Object.assign(currentSelectedKaryawan, payloadLog.update_master);
 }

 targetEmail = await resolveEmployeeEmail(
  payloadLog.new_employee_data || currentSelectedKaryawan || {},
  { nik_karyawan: payloadLog.id_karyawan, nama_karyawan: payloadLog.nama_karyawan }
 );

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

 let emailSent = false;
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
 const mcuInfo = payloadLog.detail_offboarding?.penggantian_mcu || null;
 const sisaInfo = payloadLog.detail_offboarding?.sisa_gaji || null;
 emailBody = buildStandardEmailHtml({
   badgeText: "Offboarding",
   badgeVariant: "amber",
   title: "Pemberitahuan Proses Offboarding",
   recipientName: namaTarget,
   introText: `Dengan ini diinformasikan bahwa proses offboarding Anda telah diproses oleh HRD dengan tanggal efektif <strong>${fmtDateShort(payloadLog.tanggal_efektif)}</strong>.`,
   infoList: [
     { label: "Karyawan", value: namaTarget },
     { label: "Tanggal Efektif", value: fmtDateShort(payloadLog.tanggal_efektif) },
     { label: "Keterangan", value: payloadLog.keterangan || "-" },
     ...(sisaInfo && Number(sisaInfo.sisa_gaji) > 0 ? [{ label: "Sisa Gaji Berjalan", value: `${fmtRupiah(sisaInfo.sisa_gaji)} (${sisaInfo.sisa_hari_kerja} hari kerja)` }] : []),
     ...(Number(payloadLog.detail_offboarding?.uang_pisah_rule?.nominal || 0) > 0 ? [{ label: "Uang Pisah", value: `${fmtRupiah(payloadLog.detail_offboarding.uang_pisah_rule.nominal)} (${payloadLog.detail_offboarding.uang_pisah_rule.multiplier}x gaji)` }] : []),
     ...(mcuInfo?.wajib ? [{ label: "Wajib Ganti Biaya MCU", value: `${fmtRupiah(mcuInfo.biaya_mcu || 0)}${mcuInfo.metode_pembayaran === "POTONG_SISA_GAJI" ? ` - dipotong dari sisa gaji (${fmtRupiah(mcuInfo.potongan_sisa_gaji || 0)})` : " (selesaikan maks. 7 hari kerja)"}` }] : []),
     ...(payloadLog.detail_offboarding?.exit_interview?.form_url ? [{ label: "Form Exit Interview", value: "Google Form - silakan isi melalui tombol pada email ini" }] : [])
   ],
   actionUrl: payloadLog.detail_offboarding?.exit_interview?.form_url || "",
   actionText: "Isi Form Exit Interview (Google Form) →",
   secondaryNote: `Harap segera mengoordinasikan serah terima aset perusahaan, berkas dokumen, dan penyelesaian administrasi dengan HRD.${payloadLog.detail_offboarding?.exit_interview?.form_url ? " Mohon isi <strong>Form Exit Interview</strong> melalui tautan Google Form pada email ini sebagai bagian dari proses offboarding." : ""}${mcuInfo?.wajib ? ` <strong>Ketentuan Surat Komitmen Kerja: karena resign di masa Probation / 3 bulan pertama kontrak pertama, Anda wajib mengganti biaya Medical Check Up (MCU) sebesar ${fmtRupiah(mcuInfo.biaya_mcu || 0)}.${mcuInfo.metode_pembayaran === "POTONG_SISA_GAJI" ? ` Biaya tersebut disepakati dipotong dari sisa gaji Anda sebesar ${fmtRupiah(mcuInfo.potongan_sisa_gaji || 0)}${Number(mcuInfo.kekurangan_dibayar_karyawan || 0) > 0 ? ` dan kekurangan ${fmtRupiah(mcuInfo.kekurangan_dibayar_karyawan)} wajib dibayar maksimal 7 hari kerja` : ""}.` : " Pembayaran wajib diselesaikan maksimal 7 hari kerja setelah tanggal efektif resign."}</strong>` : ""}`
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
 emailSent = await sendEmailNotif(targetEmail, emailSubject, emailBody, "", null, { manual: true });
 if (!emailSent) console.warn("Email siklus karyawan gagal dikirim ke:", targetEmail);
 }
 } else {
 console.warn("Email siklus karyawan tidak terkirim: karyawan tidak memiliki alamat email.");
 }

 if (emailSent) {
 toast(`Siklus ${jenis} berhasil direkam & email notifikasi terkirim!`, "success");
 } else if (targetEmail) {
 toast(`Siklus ${jenis} berhasil direkam, tetapi email gagal dikirim. Periksa konfigurasi email server.`, "warning");
 } else {
 toast(`Siklus ${jenis} berhasil direkam. Email belum dikirim karena alamat email karyawan belum diisi.`, "warning");
 }

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
 filterFn: (row) => branchMatches(branchScope, row.cabang, row.detail_onboarding?.cabang),
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
 checklistDoc: row.detail_offboarding?.checklist_doc || [],
 penggantianMcu: row.detail_offboarding?.penggantian_mcu || null,
 sisaGaji: row.detail_offboarding?.sisa_gaji || null
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
 b.classList.toggle("active", b === btn);
 });
 
 if (tab === "riwayat" && !loaded.riwayat) {
 loaded.riwayat = true;
 await loadRiwayat();
 }
 });
 });

 // GM view-only: sembunyikan tab + panel formulir tulis, alihkan ke tab Riwayat
 if (gmViewOnly) {
 const inputTabBtn = container.querySelector('.sk-tab[data-stab="input"]');
 const riwayatTabBtn = container.querySelector('.sk-tab[data-stab="riwayat"]');
 if (inputTabBtn) inputTabBtn.classList.add("hidden");
 if (panelInput) panelInput.classList.add("hidden");
 if (panelRiwayat) panelRiwayat.classList.remove("hidden");
 if (riwayatTabBtn) {
 riwayatTabBtn.classList.add("active");
 inputTabBtn?.classList.remove("active");
 }
 if (!loaded.riwayat) {
 loaded.riwayat = true;
 await loadRiwayat();
 }
 }

 return { unmount() {} };
}
