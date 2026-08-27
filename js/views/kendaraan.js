import { db, COL, doc, deleteDoc, setDoc } from "../firebase-config.js";
import { fsGetAll, smartParseDate, escapeHtml, fmtDateShort, fmtRupiah, fmtDateIndoLong, openModal, closeModal, toast, confirmDialog, genId, downloadWordDoc, ensureXlsxLoaded, downloadHtmlAsPdf } from "../utils.js";
import { renderCrudModule, badge, emptyState, icon } from "../components.js";
import { canEditModuleData } from "../auth.js";
import { COMPANY_NAME, COMPANY_ADDRESS_LINE1, logoImgTag } from "../branding.js";

export async function mount(container, { session }) {
 const isHrd = ["HRD", "SUPERADMIN", "GA"].includes((session.role || "").toUpperCase());
 const canEdit = await canEditModuleData(session);
 
 const alertWrap = container.querySelector("#kend-alert-wrap");
 const cardsGrid = container.querySelector("#kend-cards-grid");
 const searchInput = container.querySelector("#kend-search");
 const statusFilter = container.querySelector("#kend-status-filter");
 const btnAdd = container.querySelector("#btn-add-kendaraan");

 const btnExportMenu = container.querySelector("#btn-export-kendaraan-menu");
 const exportMenu = container.querySelector("#kend-export-menu");
 const btnExportExcel = container.querySelector("#btn-export-excel-kendaraan");
 const btnExportWord = container.querySelector("#btn-export-word-kendaraan");
 const btnExportOptions = container.querySelector("#btn-export-options-kendaraan");

 const panels = {
 cards: container.querySelector("#kd-panel-cards"),
 bbm: container.querySelector("#kd-panel-bbm"),
 service: container.querySelector("#kd-panel-service"),
 pajak: container.querySelector("#kd-panel-pajak"),
 };

 let allVehicles = [];
  let allFuelLogs = [];
  let allServiceLogs = [];
  let allComplianceLogs = [];
  let allEmployees = [];
  let loadedTables = {};

 // Load all dataset
 async function loadAllData() {
    try {
      const [vData, fData, sData, cData, eData] = await Promise.all([
        fsGetAll(COL.MASTER_KENDARAAN),
        fsGetAll(COL.LOG_KENDARAAN_FUEL),
        fsGetAll(COL.LOG_KENDARAAN_SERVICE),
        fsGetAll(COL.LOG_KENDARAAN_COMPLIANCE),
        fsGetAll(COL.MASTER_KARYAWAN).catch(() => [])
      ]);

      allVehicles = vData || [];
      allFuelLogs = fData || [];
      allServiceLogs = sData || [];
      allComplianceLogs = cData || [];
      allEmployees = eData || [];

      renderAlerts();
      renderVehicleCards();
 } catch (err) {
 console.error("Error loading vehicles:", err);
 cardsGrid.innerHTML = `<div class="col-span-full p-8 text-center text-red-500 bg-red-50 rounded-2xl border border-red-200">Gagal memuat data kendaraan: ${escapeHtml(err.message)}</div>`;
 }
 }

 // -------------------------------------------------------------
 // 1. SMART REMINDER & ALERT COMPUTATION
 // -------------------------------------------------------------
 function renderAlerts() {
 const now = new Date();
 const urgentItems = [];

 allVehicles.forEach(v => {
 const plate = v.no_polisi || "Tanpa Plat";
 const name = `${v.merk || ""} ${v.tipe || ""}`.trim() || plate;

 // Check STNK Tahunan
 if (v.tgl_stnk_tahunan) {
 const d = smartParseDate(v.tgl_stnk_tahunan);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days <= 30) {
 urgentItems.push({ plate, name, type: "Perpanjangan STNK", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
 }
 }
 }

 // Check Pajak 5 Tahun
 if (v.tgl_pajak_5thn) {
 const d = smartParseDate(v.tgl_pajak_5thn);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days <= 30) {
 urgentItems.push({ plate, name, type: "Pajak 5 Tahunan", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
 }
 }
 }

 // Check KIR
 if (v.tgl_kir) {
 const d = smartParseDate(v.tgl_kir);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days <= 30) {
 urgentItems.push({ plate, name, type: "Uji KIR Kendaraan", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
 }
 }
 }

 // Check Scheduled Service
 if (v.tgl_service_berikutnya) {
 const d = smartParseDate(v.tgl_service_berikutnya);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days <= 14) {
 urgentItems.push({ plate, name, type: "Jadwal Rutin Service", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
 }
 }
 }
 });

 if (!urgentItems.length) {
 alertWrap.innerHTML = `
 <div class="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-800 text-xs font-semibold">
 <div class="flex items-center gap-2">
 <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
 <span>Seluruh dokumen legalitas (STNK, Pajak 5th, KIR) & jadwal service armada dalam kondisi aman.</span>
 </div>
 <span class="px-2.5 py-1 bg-emerald-100 rounded-lg text-emerald-700 text-[11px]">Status: OK</span>
 </div>`;
 return;
 }

 urgentItems.sort((a, b) => a.days - b.days);

 alertWrap.innerHTML = `
 <div class="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4.5 space-y-3 shadow-sm">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2">
 <span class="relative flex h-3 w-3">
 <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
 <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
 </span>
 <p class="text-xs font-bold text-amber-900 uppercase tracking-wide">
 Pengingat Legalitas & Service Kendaraan (${urgentItems.length} Perhatian)
 </p>
 </div>
 <span class="text-[11px] font-medium text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full">Perlu Tindakan Segera</span>
 </div>
 <div class="flex flex-wrap gap-2">
 ${urgentItems.map(item => {
 const isExp = item.level === "EXPIRED";
 const bg = isExp ? "bg-rose-100 border-rose-300 text-rose-800" : "bg-white border-amber-200 text-amber-900";
 const statusStr = item.days < 0 ? `LEWAT ${Math.abs(item.days)} HARI` : `${item.days} HARI LAGI`;
 return `
 <div class="text-xs ${bg} border px-3 py-1.5 rounded-xl font-medium flex items-center gap-2 shadow-xs">
 <span class="font-bold font-mono">${escapeHtml(item.plate)}</span>
 <span class="opacity-40">•</span>
 <span>${escapeHtml(item.type)}</span>
 <span class="opacity-40">•</span>
 <span class="font-bold ${isExp ? 'text-rose-700' : 'text-amber-700'}">${statusStr} (${fmtDateShort(item.date)})</span>
 </div>
 `;
 }).join("")}
 </div>
 </div>`;
 }

 // -------------------------------------------------------------
 // 2. RENDER VEHICLE CARDS GRID
 // -------------------------------------------------------------
 function renderVehicleCards() {
 const q = (searchInput.value || "").trim().toLowerCase();
 const stFilter = statusFilter.value;
 const now = new Date();

 const filtered = allVehicles.filter(v => {
 const plate = String(v.no_polisi || "").toLowerCase();
 const merk = String(v.merk || "").toLowerCase();
 const tipe = String(v.tipe || "").toLowerCase();
 const driver = String(v.nama_pemilik || v.driver_pj || "").toLowerCase();

 const matchQuery = !q || plate.includes(q) || merk.includes(q) || tipe.includes(q) || driver.includes(q);
 if (!matchQuery) return false;

 // Status filter
 if (stFilter === "SIAP") return String(v.status_kendaraan || "SIAP").toUpperCase() === "SIAP";
 if (stFilter === "SERVICE") return String(v.status_kendaraan || "").toUpperCase().includes("SERVICE") || String(v.status_kendaraan || "").toUpperCase().includes("RUSAK");
 
 if (stFilter === "ALERT") {
 let isAlert = false;
 ["tgl_stnk_tahunan", "tgl_pajak_5thn", "tgl_kir", "tgl_service_berikutnya"].forEach(f => {
 const d = smartParseDate(v[f]);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days <= 30) isAlert = true;
 }
 });
 return isAlert;
 }

 return true;
 });

 if (!filtered.length) {
 cardsGrid.innerHTML = `
 <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200/80">
 ${emptyState("Tidak ada data kendaraan yang cocok dengan filter.")}
 </div>`;
 return;
 }

 cardsGrid.innerHTML = filtered.map(v => {
 const plate = escapeHtml(v.no_polisi || "TANPA PLAT");
 const title = escapeHtml(`${v.merk || ""} ${v.tipe || ""}`.trim() || "Kendaraan Operasional");
 const driver = escapeHtml(v.driver_pj || v.nama_pemilik || "Belum Ditetapkan");
 const fuelType = escapeHtml(v.bahan_bakar || "Solar/Bensin");
 const year = v.tahun || "-";

 // Calculate days to STNK, Pajak 5th, KIR
 const dStnk = smartParseDate(v.tgl_stnk_tahunan);
 const dPajak = smartParseDate(v.tgl_pajak_5thn);
 const dKir = smartParseDate(v.tgl_kir);

 const daysStnk = dStnk ? Math.round((dStnk - now) / 86400000) : null;
 const daysKir = dKir ? Math.round((dKir - now) / 86400000) : null;

 let stnkBadge = `<span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">STNK: ${dStnk ? fmtDateShort(dStnk) : '-'}</span>`;
 if (daysStnk !== null) {
 if (daysStnk < 0) stnkBadge = `<span class="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">STNK Expired!</span>`;
 else if (daysStnk <= 30) stnkBadge = `<span class="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">STNK: ${daysStnk}hr lagi</span>`;
 }

 let kirBadge = dKir ? `<span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">KIR: ${fmtDateShort(dKir)}</span>` : '';
 if (daysKir !== null) {
 if (daysKir < 0) kirBadge = `<span class="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">KIR Expired!</span>`;
 else if (daysKir <= 30) kirBadge = `<span class="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">KIR: ${daysKir}hr lagi</span>`;
 }

 // Count total fuel logs and service cost
 const fuelCount = allFuelLogs.filter(f => String(f.no_polisi || "").toUpperCase() === plate.toUpperCase()).length;
 const vehicleServices = allServiceLogs.filter(s => String(s.no_polisi || "").toUpperCase() === plate.toUpperCase());
 const serviceCost = vehicleServices.reduce((sum, s) => sum + (parseFloat(s.total_biaya) || 0), 0);

 // Status Badge
 const statusRaw = String(v.status_kendaraan || "Siap Pakai").toUpperCase();
 let statusBadgeHtml = badge("Siap Pakai", "green");
 if (statusRaw.includes("SERVICE") || statusRaw.includes("PERBAIKAN")) {
 statusBadgeHtml = badge("Dalam Perbaikan", "amber");
 } else if (statusRaw.includes("RUSAK")) {
 statusBadgeHtml = badge("Rusak", "red");
 }

 return `
 <div data-vehicle-id="${v.id}" class="vehicle-card bg-white rounded-2xl border border-slate-200/80 hover:border-maroon-400 p-5 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between group relative overflow-hidden">
 <div class="absolute top-0 right-0 w-24 h-24 bg-maroon-500/5 rounded-full blur-xl group-hover:bg-maroon-500/10 transition"></div>
 
 <div class="space-y-3 relative z-10">
 <!-- Header Card: Icon + Plat Nomor -->
 <div class="flex items-start justify-between gap-2">
 <div class="flex items-center gap-3">
 <div class="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-700 group-hover:bg-maroon-700 group-hover:text-white transition shrink-0">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8 17a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zM4 9h11l3 4v4H4V9zM15 9V5a1 1 0 00-1-1H4a1 1 0 00-1 1v4"/></svg>
 </div>
 <div>
 <div class="inline-block px-2.5 py-0.5 bg-slate-900 text-amber-400 font-mono font-bold text-xs rounded-md tracking-wider border border-slate-800 shadow-2xs">
 ${plate}
 </div>
 <h3 class="font-bold text-slate-800 text-sm mt-1 leading-snug group-hover:text-maroon-700 transition line-clamp-1">${title}</h3>
 </div>
 </div>
 <div class="shrink-0">
 ${statusBadgeHtml}
 </div>
 </div>

 <!-- Details Specs -->
 <div class="grid grid-cols-2 gap-2 py-2 border-y border-slate-100 text-xs">
 <div>
 <span class="text-slate-400 block text-[10px]">DRIVER / PJ</span>
 <span class="font-semibold text-slate-700 truncate block">${driver}</span>
 </div>
 <div>
 <span class="text-slate-400 block text-[10px]">THN & BAHAN BAKAR</span>
 <span class="font-semibold text-slate-700 block">${year} • ${fuelType}</span>
 </div>
 </div>

 <!-- Expiry Badges -->
 <div class="flex flex-wrap gap-1.5 pt-0.5">
 ${stnkBadge}
 ${kirBadge}
 </div>
 </div>

 <!-- Card Footer Stats & Action -->
    <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 relative z-10 gap-2">
      <button type="button" data-doc-btn="${v.id}" class="px-2.5 py-1 text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <span>Surat Kuasa & Aset</span>
      </button>

      <span class="text-maroon-700 font-bold group-hover:translate-x-0.5 transition flex items-center gap-1">
        Detail →
      </span>
    </div>
  </div>`;
 }).join("");

 // Bind click handlers to cards & quick doc button
    cardsGrid.querySelectorAll("[data-doc-btn]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const vId = btn.dataset.docBtn;
        const vDoc = allVehicles.find(x => x.id === vId);
        if (vDoc) openVehicleDocGeneratorModal(vDoc, "KUASA");
      };
    });

    cardsGrid.querySelectorAll("[data-vehicle-id]").forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest("[data-doc-btn]")) return;
        const vId = card.dataset.vehicleId;
        const vDoc = allVehicles.find(x => x.id === vId);
        if (vDoc) openVehicleDetailModal(vDoc);
      };
    });
  }

 // -------------------------------------------------------------
 
  // Helper to format Roman numerals for surat number
  function getRomanMonth(monthIdx) {
    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    return roman[monthIdx] || "I";
  }

  // -------------------------------------------------------------
  // HELPER GENERATE DOKUMEN LEGALITAS (SURAT KUASA & SKET ASET A4)
  // -------------------------------------------------------------
  function downloadA4LetterWordDoc({ htmlContent, filename = "Dokumen_Kendaraan.doc", title = "Dokumen Resmi" }) {
    const docHtml = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page Section1 {
  size: 595.3pt 841.9pt;
  margin: 0.9in 0.9in 0.9in 0.9in;
  mso-header-margin: 0.5in;
  mso-footer-margin: 0.5in;
  mso-paper-source: 0;
}
div.Section1 { page: Section1; }
body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000000; line-height: 1.4; }
table { border-collapse: collapse; width: 100%; }
p { margin: 0 0 8pt 0; }
</style>
</head>
<body>
<div class="Section1">
${htmlContent}
</div>
</body>
</html>
`;

    const blob = new Blob(["\uFEFF" + docHtml], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cleanFilename = filename.endsWith(".doc") ? filename : filename.replace(/\.[^/.]+$/, "") + ".doc";
    a.href = url;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function buildSuratKuasaHtml(cfg) {
    const {
      noSurat = "042/SKUASA-KND/AJ/II/2025",
      tglSurat = new Date().toISOString().substring(0, 10),
      pemberiNama = "Ika Novista",
      pemberiJabatan = "Manager Operasional & GA",
      pemberiPerusahaan = COMPANY_NAME || "CV ANDELA JAYA",
      pemberiAlamat = COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
      penerimaNama = "-",
      penerimaNik = "-",
      penerimaJabatan = "Driver / Staff Operasional",
      penerimaAlamat = "-",
      tujuanPengurusan = "Perpanjangan Pajak Kendaraan Bermotor (STNK Tahunan / 5 Tahunan) dan/atau Pelaksanaan Uji Berkala (KIR)",
      instansiTujuan = "Kantor Bersama SAMSAT dan/atau Dinas Perhubungan Kota Cirebon",
      kendaraan = {}
    } = cfg;

    const plate = escapeHtml(kendaraan.no_polisi || "-");
    const merkTipe = escapeHtml(`${kendaraan.merk || "-"} ${kendaraan.tipe || ""}`.trim());
    const model = escapeHtml(kendaraan.model || "-");
    const tahun = escapeHtml(String(kendaraan.tahun || "-"));
    const warna = escapeHtml(kendaraan.warna || "-");
    const noRangka = escapeHtml(kendaraan.no_rangka || "-");
    const noMesin = escapeHtml(kendaraan.no_mesin || "-");
    const noBpkb = escapeHtml(kendaraan.no_bpkb || kendaraan.no_dokumen_bpkb || "-");
    const atasNama = escapeHtml(kendaraan.atas_nama_kendaraan || kendaraan.nama_pemilik || pemberiPerusahaan);
    const driverPj = escapeHtml(kendaraan.driver_pj || "-");
    const tglIndoFormatted = fmtDateIndoLong(tglSurat) || fmtDateShort(tglSurat);

    return `
    <div class="surat-kuasa-a4" style="font-family:'Times New Roman', Times, serif; font-size:11pt; line-height:1.4; color:#000; background:#fff; width:100%; max-width:760px; margin:0 auto; padding:10px 15px;">
      <!-- KOP SURAT -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:6px; border-bottom:3px double #000; padding-bottom:8px;">
        <tr>
          <td style="width:75px; vertical-align:middle; text-align:center; padding-right:12px;">
            ${logoImgTag(60)}
          </td>
          <td style="vertical-align:middle; text-align:center;">
            <div style="font-size:16pt; font-weight:bold; letter-spacing:1px; font-family:'Times New Roman', serif;">${COMPANY_NAME}</div>
            <div style="font-size:9.5pt; margin-top:3px; color:#222;">${COMPANY_ADDRESS_LINE1}</div>
          </td>
        </tr>
      </table>

      <!-- JUDUL SURAT -->
      <div style="text-align:center; margin-top:14px; margin-bottom:16px;">
        <div style="font-size:13pt; font-weight:bold; text-decoration:underline; letter-spacing:0.5px;">SURAT KUASA KHUSUS</div>
        <div style="font-size:10.5pt; font-weight:normal; margin-top:2px;">Nomor: ${escapeHtml(noSurat)}</div>
      </div>

      <p style="margin-bottom:8px; text-align:justify;">Yang bertanda tangan di bawah ini:</p>

      <!-- PIHAK I (PEMBERI KUASA) -->
      <table style="width:100%; border-collapse:collapse; margin-left:15px; margin-bottom:12px; font-size:10.5pt;">
        <tr>
          <td style="width:170px; padding:2.5px 0; vertical-align:top;">Nama Lengkap</td>
          <td style="width:15px; padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; font-weight:bold; vertical-align:top;">${escapeHtml(pemberiNama)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Jabatan</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; vertical-align:top;">${escapeHtml(pemberiJabatan)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Nama Perusahaan</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; font-weight:bold; vertical-align:top;">${escapeHtml(pemberiPerusahaan)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Alamat Perusahaan</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; vertical-align:top;">${escapeHtml(pemberiAlamat)}</td>
        </tr>
      </table>

      <p style="margin-bottom:8px; text-align:justify;">Dalam hal ini bertindak untuk dan atas nama <strong>${escapeHtml(pemberiPerusahaan)}</strong>, yang selanjutnya disebut sebagai <strong>PEMBERI KUASA</strong>.</p>

      <p style="margin-bottom:8px; text-align:justify;">Dengan ini memberikan kuasa penuh kepada:</p>

      <!-- PIHAK II (PENERIMA KUASA) -->
      <table style="width:100%; border-collapse:collapse; margin-left:15px; margin-bottom:12px; font-size:10.5pt;">
        <tr>
          <td style="width:170px; padding:2.5px 0; vertical-align:top;">Nama Lengkap</td>
          <td style="width:15px; padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; font-weight:bold; vertical-align:top;">${escapeHtml(penerimaNama)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">NIK / No. KTP</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; font-family:monospace; vertical-align:top;">${escapeHtml(penerimaNik)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Jabatan / Tugas</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; vertical-align:top;">${escapeHtml(penerimaJabatan)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Alamat Domisili</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; vertical-align:top;">${escapeHtml(penerimaAlamat)}</td>
        </tr>
      </table>

      <p style="margin-bottom:8px; text-align:justify;">Yang selanjutnya disebut sebagai <strong>PENERIMA KUASA</strong>.</p>

      <!-- KLAUSUL KHUSUS -->
      <div style="text-align:center; font-weight:bold; font-size:11pt; margin:10px 0 6px 0; letter-spacing:1px;">------------------------ K H U S U S ------------------------</div>

      <p style="margin-bottom:8px; text-align:justify;">
        Untuk dan atas nama Pemberi Kuasa mewakili <strong>${escapeHtml(pemberiPerusahaan)}</strong> guna melakukan pengurusan <strong>${escapeHtml(tujuanPengurusan)}</strong> pada instansi <strong>${escapeHtml(instansiTujuan)}</strong> terhadap unit kendaraan bermotor operasional dengan spesifikasi sebagai berikut:
      </p>

      <!-- TABEL SPESIFIKASI KENDARAAN -->
      <table style="width:100%; border-collapse:collapse; margin:8px 0 12px 0; font-size:10pt; border:1px solid #333;">
        <tr style="background:#f1f5f9;">
          <td style="width:36%; border:1px solid #333; padding:5px 8px; font-weight:bold;">Nomor Polisi / Nomor Plat</td>
          <td style="border:1px solid #333; padding:5px 8px; font-weight:bold; font-family:monospace; font-size:11pt;">${plate}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Merk & Tipe Kendaraan</td>
          <td style="border:1px solid #333; padding:4px 8px;">${merkTipe}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Jenis / Model / Warna</td>
          <td style="border:1px solid #333; padding:4px 8px;">${model} / ${warna} (Tahun: ${tahun})</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Nomor Rangka (VIN)</td>
          <td style="border:1px solid #333; padding:4px 8px; font-family:monospace;">${noRangka}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Nomor Mesin</td>
          <td style="border:1px solid #333; padding:4px 8px; font-family:monospace;">${noMesin}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold; color:#0f172a; background:#e0f2fe;">Nomor Dokumen BPKB</td>
          <td style="border:1px solid #333; padding:4px 8px; font-family:monospace; font-weight:bold; background:#f0f9ff;">${noBpkb}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Atas Nama Kendaraan (STNK/BPKB)</td>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">${atasNama}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Driver / Penanggung Jawab Armada</td>
          <td style="border:1px solid #333; padding:4px 8px;">${driverPj}</td>
        </tr>
      </table>

      <p style="margin-bottom:8px; text-align:justify;">
        Untuk keperluan tersebut di atas, Penerima Kuasa berhak menghadap petugas/pejabat berwenang, menandatangani surat/formulir permohonan, melakukan pembayaran retribusi/pajak resmi yang dipersyaratkan, menerima Surat Ketetapan Pajak Daerah (SKPD), STNK, Tanda Bukti Lulus Uji Elektronik (BLU-e) / Buku Uji KIR, serta melakukan tindakan administratif lainnya yang sah dan diperlukan sesuai peraturan perundang-undangan.
      </p>

      <p style="margin-bottom:14px; text-align:justify;">
        Demikian Surat Kuasa Khusus ini dibuat dengan sebenarnya dengan penuh rasa tanggung jawab untuk dapat dipergunakan sebagaimana mestinya.
      </p>

      <!-- TANDA TANGAN -->
      <table style="width:100%; border-collapse:collapse; margin-top:20px; text-align:center; font-size:10.5pt; page-break-inside:avoid;">
        <tr>
          <td style="width:50%; vertical-align:top;">
            <div>Cirebon, ${tglIndoFormatted}</div>
            <div style="font-weight:bold; margin-top:2px;">Penerima Kuasa,</div>
            <div style="height:65px;"></div>
            <div style="font-weight:bold; text-decoration:underline;">( ${escapeHtml(penerimaNama)} )</div>
            <div style="font-size:9pt; color:#444; margin-top:2px;">NIK: ${escapeHtml(penerimaNik)}</div>
          </td>
          <td style="width:50%; vertical-align:top;">
            <div>${escapeHtml(pemberiPerusahaan)}</div>
            <div style="font-weight:bold; margin-top:2px;">Pemberi Kuasa,</div>
            <div style="height:15px;"></div>
            <div style="border:1px dashed #666; width:95px; height:45px; margin:0 auto 5px auto; font-size:7.5pt; line-height:45px; color:#555; text-align:center;">
              METERAI 10.000
            </div>
            <div style="font-weight:bold; text-decoration:underline;">( ${escapeHtml(pemberiNama)} )</div>
            <div style="font-size:9pt; color:#444; margin-top:2px;">${escapeHtml(pemberiJabatan)}</div>
          </td>
        </tr>
      </table>
    </div>
    `;
  }

  function buildSuratKeteranganAsetHtml(cfg) {
    const {
      noSurat = "042/SKET-ASET/AJ/II/2025",
      tglSurat = new Date().toISOString().substring(0, 10),
      pejabatNama = "Ika Novista",
      pejabatJabatan = "Manager Operasional & GA",
      namaPerusahaan = COMPANY_NAME || "CV ANDELA JAYA",
      alamatPerusahaan = COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
      keperluan = "Kelengkapan berkas administrasi pengurusan Pajak Kendaraan Bermotor (STNK Tahunan / 5 Tahunan) dan/atau Uji Kelayakan Kendaraan Bermotor (Uji KIR)",
      kendaraan = {}
    } = cfg;

    const plate = escapeHtml(kendaraan.no_polisi || "-");
    const merkTipe = escapeHtml(`${kendaraan.merk || "-"} ${kendaraan.tipe || ""}`.trim());
    const model = escapeHtml(kendaraan.model || "-");
    const tahun = escapeHtml(String(kendaraan.tahun || "-"));
    const warna = escapeHtml(kendaraan.warna || "-");
    const bahanBakar = escapeHtml(kendaraan.bahan_bakar || "Solar");
    const noRangka = escapeHtml(kendaraan.no_rangka || "-");
    const noMesin = escapeHtml(kendaraan.no_mesin || "-");
    const noBpkb = escapeHtml(kendaraan.no_bpkb || kendaraan.no_dokumen_bpkb || "-");
    const atasNama = escapeHtml(kendaraan.atas_nama_kendaraan || kendaraan.nama_pemilik || namaPerusahaan);
    const driverPj = escapeHtml(kendaraan.driver_pj || "-");
    const tglIndoFormatted = fmtDateIndoLong(tglSurat) || fmtDateShort(tglSurat);

    return `
    <div class="surat-ket-aset-a4" style="font-family:'Times New Roman', Times, serif; font-size:11pt; line-height:1.45; color:#000; background:#fff; width:100%; max-width:760px; margin:0 auto; padding:10px 15px;">
      <!-- KOP SURAT -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:6px; border-bottom:3px double #000; padding-bottom:8px;">
        <tr>
          <td style="width:75px; vertical-align:middle; text-align:center; padding-right:12px;">
            ${logoImgTag(60)}
          </td>
          <td style="vertical-align:middle; text-align:center;">
            <div style="font-size:16pt; font-weight:bold; letter-spacing:1px; font-family:'Times New Roman', serif;">${COMPANY_NAME}</div>
            <div style="font-size:9.5pt; margin-top:3px; color:#222;">${COMPANY_ADDRESS_LINE1}</div>
          </td>
        </tr>
      </table>

      <!-- JUDUL SURAT -->
      <div style="text-align:center; margin-top:16px; margin-bottom:18px;">
        <div style="font-size:13pt; font-weight:bold; text-decoration:underline; letter-spacing:0.5px;">SURAT KETERANGAN KEPEMILIKAN ASET</div>
        <div style="font-size:10.5pt; font-weight:normal; margin-top:2px;">Nomor: ${escapeHtml(noSurat)}</div>
      </div>

      <p style="margin-bottom:8px; text-align:justify;">Yang bertanda tangan di bawah ini:</p>

      <!-- PIHAK PENERANG -->
      <table style="width:100%; border-collapse:collapse; margin-left:15px; margin-bottom:12px; font-size:10.5pt;">
        <tr>
          <td style="width:170px; padding:2.5px 0; vertical-align:top;">Nama Lengkap</td>
          <td style="width:15px; padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; font-weight:bold; vertical-align:top;">${escapeHtml(pejabatNama)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Jabatan</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; vertical-align:top;">${escapeHtml(pejabatJabatan)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Badan Usaha / Perusahaan</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; font-weight:bold; vertical-align:top;">${escapeHtml(namaPerusahaan)}</td>
        </tr>
        <tr>
          <td style="padding:2.5px 0; vertical-align:top;">Alamat Kantor</td>
          <td style="padding:2.5px 0; vertical-align:top;">:</td>
          <td style="padding:2.5px 0; vertical-align:top;">${escapeHtml(alamatPerusahaan)}</td>
        </tr>
      </table>

      <p style="margin-bottom:10px; text-align:justify;">
        Dengan ini menerangkan dengan sebenarnya bahwa unit kendaraan bermotor dengan identitas dan spesifikasi teknis di bawah ini:
      </p>

      <!-- TABEL SPESIFIKASI KENDARAAN -->
      <table style="width:100%; border-collapse:collapse; margin:8px 0 14px 0; font-size:10pt; border:1px solid #333;">
        <tr style="background:#f1f5f9;">
          <td style="width:36%; border:1px solid #333; padding:5px 8px; font-weight:bold;">Nomor Polisi / No. Plat</td>
          <td style="border:1px solid #333; padding:5px 8px; font-weight:bold; font-family:monospace; font-size:11pt;">${plate}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Merk & Tipe Kendaraan</td>
          <td style="border:1px solid #333; padding:4px 8px;">${merkTipe}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Jenis / Model Kendaraan</td>
          <td style="border:1px solid #333; padding:4px 8px;">${model}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Tahun Pembuatan / Warna</td>
          <td style="border:1px solid #333; padding:4px 8px;">Tahun ${tahun} / Warna ${warna}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Bahan Bakar</td>
          <td style="border:1px solid #333; padding:4px 8px;">${bahanBakar}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Nomor Rangka (VIN)</td>
          <td style="border:1px solid #333; padding:4px 8px; font-family:monospace;">${noRangka}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Nomor Mesin</td>
          <td style="border:1px solid #333; padding:4px 8px; font-family:monospace;">${noMesin}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold; color:#0f172a; background:#e0f2fe;">Nomor Dokumen BPKB</td>
          <td style="border:1px solid #333; padding:4px 8px; font-family:monospace; font-weight:bold; background:#f0f9ff;">${noBpkb}</td>
        </tr>
        <tr style="background:#fafafa;">
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Atas Nama di STNK & BPKB</td>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">${atasNama}</td>
        </tr>
        <tr>
          <td style="border:1px solid #333; padding:4px 8px; font-weight:bold;">Driver / Penanggung Jawab Armada</td>
          <td style="border:1px solid #333; padding:4px 8px;">${driverPj}</td>
        </tr>
      </table>

      <p style="margin-bottom:10px; text-align:justify;">
        Adalah <strong>BENAR-BENAR MERUPAKAN ASET OPERASIONAL SAH MILIK ${escapeHtml(namaPerusahaan)}</strong> yang dipergunakan sehari-hari untuk kelancaran kegiatan operasional, distribusi, dan logistik perusahaan.
      </p>

      <p style="margin-bottom:10px; text-align:justify;">
        Surat keterangan kepemilikan aset ini diterbitkan untuk dipergunakan sebagai: <strong>${escapeHtml(keperluan)}</strong> pada instansi SAMSAT, Dinas Perhubungan, maupun instansi terkait lainnya.
      </p>

      <p style="margin-bottom:16px; text-align:justify;">
        Demikian Surat Keterangan Aset ini kami buat dengan sebenarnya dan dapat dipertanggungjawabkan sebagaimana mestinya.
      </p>

      <!-- TANDA TANGAN -->
      <table style="width:100%; border-collapse:collapse; margin-top:24px; text-align:center; font-size:10.5pt; page-break-inside:avoid;">
        <tr>
          <td style="width:50%;"></td>
          <td style="width:50%; vertical-align:top;">
            <div>Cirebon, ${tglIndoFormatted}</div>
            <div style="font-weight:bold; margin-top:2px;">${escapeHtml(namaPerusahaan)}</div>
            <div style="height:65px;"></div>
            <div style="font-weight:bold; text-decoration:underline;">( ${escapeHtml(pejabatNama)} )</div>
            <div style="font-size:9pt; color:#444; margin-top:2px;">${escapeHtml(pejabatJabatan)}</div>
          </td>
        </tr>
      </table>
    </div>
    `;
  }

  // MODAL GENERATOR SURAT KUASA & SKET ASET
  async function openVehicleDocGeneratorModal(targetVDoc = null, initialDocType = "KUASA") {
    if (!allVehicles || allVehicles.length === 0) {
      return toast("Belum ada data kendaraan yang terdaftar untuk dibuatkan surat.", "warning");
    }

    if (!allEmployees || allEmployees.length === 0) {
      try {
        allEmployees = (await fsGetAll(COL.MASTER_KARYAWAN).catch(() => [])) || [];
      } catch (_) {
        allEmployees = [];
      }
    }

    let currentVehicle = targetVDoc || allVehicles[0];
    const activeEmployees = (allEmployees || []).filter(e => (e.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");

    const now = new Date();
    const currentYear = now.getFullYear();
    const romanMo = getRomanMonth(now.getMonth());
    const randNum = String(Math.floor(100 + Math.random() * 900));

    let currentDocType = initialDocType; // "KUASA" or "ASET"

    const defaultNoKuasa = `${randNum}/SKUASA-KND/AJ/${romanMo}/${currentYear}`;
    const defaultNoAset = `${randNum}/SKET-ASET/AJ/${romanMo}/${currentYear}`;

    function getDriverEmp(vDoc) {
      if (!vDoc || !vDoc.driver_pj) return null;
      return activeEmployees.find(e => e.nama_karyawan && e.nama_karyawan.toLowerCase().includes(vDoc.driver_pj.toLowerCase())) || null;
    }

    // Cari pimpinan / pemberi kuasa dari database karyawan (utamakan Ika Novista / Manager / Pimpinan / Direktur / Kepala)
    let defaultPemberiEmp = activeEmployees.find(e => 
      (e.nama_karyawan && (e.nama_karyawan.toLowerCase().includes("ika") || e.nama_karyawan.toLowerCase().includes("novista"))) ||
      (e.jabatan && (e.jabatan.toLowerCase().includes("manager") || e.jabatan.toLowerCase().includes("direktur") || e.jabatan.toLowerCase().includes("pimpinan") || e.jabatan.toLowerCase().includes("kepala")))
    ) || activeEmployees[0] || null;

    let currentDriverEmp = getDriverEmp(currentVehicle);

    const initPemberiNama = defaultPemberiEmp ? defaultPemberiEmp.nama_karyawan : "Ika Novista";
    const initPemberiJabatan = defaultPemberiEmp ? (defaultPemberiEmp.jabatan || defaultPemberiEmp.divisi || "Manager Operasional & GA") : "Manager Operasional & GA";
    const initPemberiNik = defaultPemberiEmp ? (defaultPemberiEmp.nik || defaultPemberiEmp.no_ktp || "-") : "-";

    openModal({
      title: `<div class="flex items-center gap-3">
        <div class="p-2 rounded-xl bg-amber-500/10 text-amber-600">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
        <div>
          <h3 class="font-bold text-slate-800 text-sm">Generator Dokumen Legalitas Kendaraan (A4)</h3>
          <p class="text-[11px] text-slate-500">Cetak Surat Kuasa Khusus & Surat Keterangan Kepemilikan Aset Resmi</p>
        </div>
      </div>`,
      size: "2xl",
      bodyHtml: `
      <div class="space-y-4 text-left">
        <!-- VEHICLE SELECTOR BANNER -->
        <div class="bg-gradient-to-r from-slate-900 to-maroon-950 p-3.5 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border border-slate-800">
          <div class="space-y-0.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400">Pilih Unit Kendaraan</span>
            <div class="flex items-center gap-2">
              <span id="label-curr-plate" class="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-mono font-bold text-xs rounded-md shadow-2xs">${escapeHtml(currentVehicle.no_polisi || '-')}</span>
              <span id="label-curr-name" class="font-bold text-xs text-slate-100">${escapeHtml(currentVehicle.merk || '')} ${escapeHtml(currentVehicle.tipe || '')}</span>
            </div>
          </div>
          <div class="w-full sm:w-64">
            <select id="cfg-select-vehicle-doc" class="w-full px-3 py-1.5 text-xs font-semibold bg-slate-800 text-slate-100 border border-slate-700 rounded-xl outline-none focus:border-amber-400">
              ${allVehicles.map(v => `<option value="${v.id}" ${v.id === currentVehicle.id ? 'selected' : ''}>${escapeHtml(v.no_polisi || 'Plat -')} | ${escapeHtml(v.merk || '')} ${escapeHtml(v.tipe || '')}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- TIPE DOKUMEN SELECTOR TABS -->
        <div class="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button type="button" id="btn-tab-doc-kuasa" class="py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 ${currentDocType === 'KUASA' ? 'bg-white text-maroon-800 shadow-sm border border-slate-200/80' : 'text-slate-500 hover:text-slate-800'}">
            <span>📝 Surat Kuasa Khusus (STNK / KIR)</span>
          </button>
          <button type="button" id="btn-tab-doc-aset" class="py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 ${currentDocType === 'ASET' ? 'bg-white text-maroon-800 shadow-sm border border-slate-200/80' : 'text-slate-500 hover:text-slate-800'}">
            <span>🏢 Surat Keterangan Kepemilikan Aset</span>
          </button>
        </div>

        <!-- FORM CONFIG -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
          <!-- NOMOR & TANGGAL -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">Nomor Surat Resmi</label>
              <input type="text" id="cfg-no-surat" class="w-full px-3 py-1.5 text-xs font-mono font-semibold border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${currentDocType === 'KUASA' ? defaultNoKuasa : defaultNoAset}">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">Tanggal Surat</label>
              <input type="date" id="cfg-tgl-surat" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${now.toISOString().substring(0, 10)}">
            </div>
          </div>

          <!-- SECTION PEMBERI KUASA / PEJABAT PENANDATANGAN (DARI DATABASE) -->
          <div class="space-y-3 border-t border-slate-200 pt-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>🏢 Pemberi Kuasa / Pejabat Penandatangan</span>
              </h4>
              <span class="text-[10px] text-slate-500">Sesuaikan dengan Master Karyawan</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Pilih dari Master Karyawan</label>
                <select id="cfg-pemberi-select" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white">
                  <option value="">-- Ketik Manual / Custom --</option>
                  ${activeEmployees.map(e => `<option value="${escapeHtml(e.id)}" ${defaultPemberiEmp && defaultPemberiEmp.id === e.id ? 'selected' : ''}>${escapeHtml(e.nama_karyawan)} (${escapeHtml(e.jabatan || e.divisi || 'Karyawan')})</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Nama Pemberi Kuasa *</label>
                <input type="text" id="cfg-pemberi-nama" class="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${escapeHtml(initPemberiNama)}">
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jabatan Pemberi Kuasa *</label>
                <input type="text" id="cfg-pemberi-jabatan" class="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${escapeHtml(initPemberiJabatan)}">
              </div>
            </div>
          </div>

          <!-- SECTION KHUSUS SURAT KUASA (PENERIMA KUASA DARI DATABASE) -->
          <div id="cfg-section-kuasa" class="space-y-3 ${currentDocType === 'KUASA' ? '' : 'hidden'} border-t border-slate-200 pt-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>👤 Penerima Kuasa (Driver / Petugas Pajak)</span>
              </h4>
              <span class="text-[10px] text-slate-500">Sesuaikan dengan Master Karyawan</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Pilih dari Master Karyawan</label>
                <select id="cfg-penerima-select" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white">
                  <option value="">-- Ketik Manual / Custom --</option>
                  ${activeEmployees.map(e => `<option value="${escapeHtml(e.id)}" ${currentDriverEmp && currentDriverEmp.id === e.id ? 'selected' : ''}>${escapeHtml(e.nama_karyawan)} (${escapeHtml(e.jabatan || e.divisi || 'Karyawan')})</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Nama Penerima Kuasa *</label>
                <input type="text" id="cfg-penerima-nama" class="w-full px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${currentDriverEmp ? currentDriverEmp.nama_karyawan : (currentVehicle.driver_pj || '')}">
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">NIK / No. KTP</label>
                <input type="text" id="cfg-penerima-nik" class="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${currentDriverEmp?.nik || currentDriverEmp?.no_ktp || '-'}">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jabatan Penerima Kuasa</label>
                <input type="text" id="cfg-penerima-jabatan" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${currentDriverEmp?.jabatan || 'Driver / PJ Operasional'}">
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Alamat Domisili Penerima Kuasa</label>
                <input type="text" id="cfg-penerima-alamat" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="${currentDriverEmp?.alamat || currentDriverEmp?.domisili || 'Cirebon'}">
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Tujuan / Keperluan Kuasa</label>
                <select id="cfg-tujuan-kuasa" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white">
                  <option value="Perpanjangan Pajak Kendaraan Bermotor (STNK Tahunan) & Pengesahan STNK">Perpanjangan Pajak STNK Tahunan</option>
                  <option value="Perpanjangan Pajak 5 Tahunan, Ganti Plat Nomor (TNKB) & Cek Fisik Kendaraan">Pajak 5 Tahunan & Ganti Plat (TNKB)</option>
                  <option value="Pelaksanaan Uji Berkala Kendaraan Bermotor (Uji KIR) & Bukti Lulus Uji Elektronik (BLU-e)">Pelaksanaan Uji Berkala (KIR)</option>
                  <option value="Pengurusan Pajak Kendaraan Bermotor (STNK Tahunan/5 Tahunan) dan Uji Berkala (KIR) Sekaligus" selected>Pengurusan STNK & Uji KIR Sekaligus</option>
                  <option value="Pengurusan Balik Nama / Mutasi Dokumen Kendaraan Bermotor">Pengurusan Balik Nama / Mutasi</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 mb-1">Instansi Tujuan</label>
                <input type="text" id="cfg-instansi" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="Kantor Bersama SAMSAT dan/atau Dinas Perhubungan">
              </div>
            </div>
          </div>

          <!-- SECTION KHUSUS SURAT KET ASET -->
          <div id="cfg-section-aset" class="space-y-3 ${currentDocType === 'ASET' ? '' : 'hidden'} border-t border-slate-200 pt-3">
            <h4 class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>🏢 Keperluan Surat Keterangan Aset</span>
            </h4>
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">Maksud / Keperluan Penerbitan</label>
              <input type="text" id="cfg-keperluan-aset" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-white" value="Kelengkapan berkas administrasi pengurusan Pajak Kendaraan Bermotor (STNK Tahunan / 5 Tahunan) dan/atau Uji Kelayakan Kendaraan Bermotor (Uji KIR)">
            </div>
          </div>
        </div>

        <!-- LIVE PREVIEW CONTAINER -->
        <div class="border border-slate-200 rounded-2xl p-4 bg-slate-100 max-h-96 overflow-y-auto shadow-inner">
          <div class="flex items-center justify-between mb-2 pb-2 border-b border-slate-200 text-xs">
            <span class="font-bold text-slate-600 flex items-center gap-1.5">
              <span>👁️</span> Pratinjau Dokumen Format A4
            </span>
            <span class="text-[11px] text-slate-400">Ukuran Standar: A4 Portrait</span>
          </div>
          <div id="doc-live-preview-box" class="bg-white p-6 rounded-xl shadow-sm border border-slate-300">
            <!-- Will be populated dynamically -->
          </div>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
          <div class="flex items-center gap-2">
            <button type="button" id="btn-cancel-doc-gen" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition cursor-pointer">
              Tutup
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="btn-download-doc-word" class="px-4 py-2 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer">
              <span class="font-mono text-[10px] bg-blue-200 text-blue-900 px-1 py-0.2 rounded font-bold">DOC</span>
              <span>Unduh Word (A4)</span>
            </button>
            <button type="button" id="btn-download-doc-pdf" class="px-4.5 py-2 text-xs font-bold bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer">
              <span class="font-mono text-[10px] bg-red-800 text-white px-1 py-0.2 rounded font-bold">PDF</span>
              <span>Unduh PDF (A4)</span>
            </button>
          </div>
        </div>
      </div>
      `
    });

    const previewBox = document.getElementById("doc-live-preview-box");
    const tabKuasa = document.getElementById("btn-tab-doc-kuasa");
    const tabAset = document.getElementById("btn-tab-doc-aset");
    const secKuasa = document.getElementById("cfg-section-kuasa");
    const secAset = document.getElementById("cfg-section-aset");
    const vehSelector = document.getElementById("cfg-select-vehicle-doc");
    const labelPlate = document.getElementById("label-curr-plate");
    const labelName = document.getElementById("label-curr-name");

    const inputNoSurat = document.getElementById("cfg-no-surat");
    const inputTglSurat = document.getElementById("cfg-tgl-surat");
    const inputPemberiSelect = document.getElementById("cfg-pemberi-select");
    const inputPemberiNama = document.getElementById("cfg-pemberi-nama");
    const inputPemberiJabatan = document.getElementById("cfg-pemberi-jabatan");
    const inputPenerimaSelect = document.getElementById("cfg-penerima-select");
    const inputPenerimaNama = document.getElementById("cfg-penerima-nama");
    const inputPenerimaNik = document.getElementById("cfg-penerima-nik");
    const inputPenerimaJabatan = document.getElementById("cfg-penerima-jabatan");
    const inputPenerimaAlamat = document.getElementById("cfg-penerima-alamat");
    const inputTujuanKuasa = document.getElementById("cfg-tujuan-kuasa");
    const inputInstansi = document.getElementById("cfg-instansi");
    const inputKeperluanAset = document.getElementById("cfg-keperluan-aset");

    function renderCurrentPreview() {
      const pNama = inputPemberiNama ? inputPemberiNama.value.trim() : initPemberiNama;
      const pJabatan = inputPemberiJabatan ? inputPemberiJabatan.value.trim() : initPemberiJabatan;

      if (currentDocType === "KUASA") {
        const html = buildSuratKuasaHtml({
          noSurat: inputNoSurat ? inputNoSurat.value.trim() : defaultNoKuasa,
          tglSurat: inputTglSurat ? inputTglSurat.value : now.toISOString().substring(0, 10),
          pemberiNama: pNama,
          pemberiJabatan: pJabatan,
          pemberiPerusahaan: COMPANY_NAME || "CV ANDELA JAYA",
          pemberiAlamat: COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
          penerimaNama: inputPenerimaNama ? inputPenerimaNama.value.trim() : "-",
          penerimaNik: inputPenerimaNik ? inputPenerimaNik.value.trim() : "-",
          penerimaJabatan: inputPenerimaJabatan ? inputPenerimaJabatan.value.trim() : "Driver / Staff Operasional",
          penerimaAlamat: inputPenerimaAlamat ? inputPenerimaAlamat.value.trim() : "Cirebon",
          tujuanPengurusan: inputTujuanKuasa ? inputTujuanKuasa.value : "Pengurusan STNK & Uji KIR Sekaligus",
          instansiTujuan: inputInstansi ? inputInstansi.value.trim() : "Kantor Bersama SAMSAT dan/atau Dinas Perhubungan",
          kendaraan: currentVehicle
        });
        if (previewBox) previewBox.innerHTML = html;
      } else {
        const html = buildSuratKeteranganAsetHtml({
          noSurat: inputNoSurat ? inputNoSurat.value.trim() : defaultNoAset,
          tglSurat: inputTglSurat ? inputTglSurat.value : now.toISOString().substring(0, 10),
          pejabatNama: pNama,
          pejabatJabatan: pJabatan,
          namaPerusahaan: COMPANY_NAME || "CV ANDELA JAYA",
          alamatPerusahaan: COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
          keperluan: inputKeperluanAset ? inputKeperluanAset.value.trim() : "Kelengkapan berkas administrasi pengurusan Pajak Kendaraan Bermotor (STNK Tahunan / 5 Tahunan) dan/atau Uji Kelayakan Kendaraan Bermotor (Uji KIR)",
          kendaraan: currentVehicle
        });
        if (previewBox) previewBox.innerHTML = html;
      }
    }

    if (vehSelector) {
      vehSelector.onchange = () => {
        const v = allVehicles.find(x => x.id === vehSelector.value);
        if (v) {
          currentVehicle = v;
          currentDriverEmp = getDriverEmp(v);
          if (labelPlate) labelPlate.textContent = v.no_polisi || '-';
          if (labelName) labelName.textContent = `${v.merk || ''} ${v.tipe || ''}`;
          if (currentDriverEmp) {
            if (inputPenerimaSelect) inputPenerimaSelect.value = currentDriverEmp.id;
            if (inputPenerimaNama) inputPenerimaNama.value = currentDriverEmp.nama_karyawan || '';
            if (inputPenerimaNik) inputPenerimaNik.value = currentDriverEmp.nik || currentDriverEmp.no_ktp || '-';
            if (inputPenerimaJabatan) inputPenerimaJabatan.value = currentDriverEmp.jabatan || 'Driver / PJ Operasional';
            if (inputPenerimaAlamat) inputPenerimaAlamat.value = currentDriverEmp.alamat || currentDriverEmp.domisili || 'Cirebon';
          } else {
            if (inputPenerimaSelect) inputPenerimaSelect.value = "";
            if (inputPenerimaNama) inputPenerimaNama.value = v.driver_pj || '';
          }
          renderCurrentPreview();
        }
      };
    }

    // Tab switching
    if (tabKuasa && tabAset) {
      tabKuasa.onclick = () => {
        currentDocType = "KUASA";
        tabKuasa.className = "py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 bg-white text-maroon-800 shadow-sm border border-slate-200/80";
        tabAset.className = "py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800";
        if (secKuasa) secKuasa.classList.remove("hidden");
        if (secAset) secAset.classList.add("hidden");
        if (inputNoSurat) inputNoSurat.value = defaultNoKuasa;
        renderCurrentPreview();
      };

      tabAset.onclick = () => {
        currentDocType = "ASET";
        tabAset.className = "py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 bg-white text-maroon-800 shadow-sm border border-slate-200/80";
        tabKuasa.className = "py-2.5 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800";
        if (secKuasa) secKuasa.classList.add("hidden");
        if (secAset) secAset.classList.remove("hidden");
        if (inputNoSurat) inputNoSurat.value = defaultNoAset;
        renderCurrentPreview();
      };
    }

    // Auto-fill Pemberi Kuasa dari master karyawan select
    if (inputPemberiSelect) {
      inputPemberiSelect.onchange = () => {
        const empId = inputPemberiSelect.value;
        const emp = activeEmployees.find(e => e.id === empId);
        if (emp) {
          inputPemberiNama.value = emp.nama_karyawan || "";
          inputPemberiJabatan.value = emp.jabatan || emp.divisi || "Pimpinan";
        }
        renderCurrentPreview();
      };
    }

    // Auto-fill Penerima Kuasa dari master karyawan select
    if (inputPenerimaSelect) {
      inputPenerimaSelect.onchange = () => {
        const empId = inputPenerimaSelect.value;
        const emp = activeEmployees.find(e => e.id === empId);
        if (emp) {
          inputPenerimaNama.value = emp.nama_karyawan || "";
          inputPenerimaNik.value = emp.nik || emp.no_ktp || "-";
          inputPenerimaJabatan.value = emp.jabatan || emp.divisi || "Driver / Staff Operasional";
          inputPenerimaAlamat.value = emp.alamat || emp.domisili || "Cirebon";
        }
        renderCurrentPreview();
      };
    }

    // Auto-update instansi dan keperluan saat tujuan pengurusan berubah
    if (inputTujuanKuasa) {
      inputTujuanKuasa.onchange = () => {
        const val = inputTujuanKuasa.value;
        const valLower = val.toLowerCase();

        if (inputInstansi) {
          if (valLower.includes("tahunan") && !valLower.includes("5 tahun") && !valLower.includes("kir")) {
            inputInstansi.value = "Kantor Bersama SAMSAT";
          } else if (valLower.includes("5 tahun") || valLower.includes("ganti plat") || valLower.includes("tnkb")) {
            inputInstansi.value = "Kantor Bersama SAMSAT Induk & Layanan Cek Fisik";
          } else if (valLower.includes("uji berkala") || valLower.includes("uji kir") || valLower.includes("blu-e") || (valLower.includes("kir") && !valLower.includes("stnk"))) {
            inputInstansi.value = "Balai/Unit Pelaksana Pengujian Kendaraan Bermotor (Dishub)";
          } else if (valLower.includes("sekaligus") || (valLower.includes("stnk") && valLower.includes("kir"))) {
            inputInstansi.value = "Kantor Bersama SAMSAT dan Dinas Perhubungan";
          } else if (valLower.includes("balik nama") || valLower.includes("mutasi")) {
            inputInstansi.value = "Kantor Bersama SAMSAT & Ditlantas Kepolisian";
          }
        }

        if (inputKeperluanAset) {
          inputKeperluanAset.value = `Kelengkapan berkas administrasi pengurusan ${val}`;
        }

        renderCurrentPreview();
      };
    }

    // Inputs dynamic listeners (input + change events for instant reactive preview)
    [inputNoSurat, inputTglSurat, inputPemberiNama, inputPemberiJabatan, inputPenerimaNama, inputPenerimaNik, inputPenerimaJabatan, inputPenerimaAlamat, inputTujuanKuasa, inputInstansi, inputKeperluanAset].forEach(el => {
      if (el) {
        el.addEventListener("input", renderCurrentPreview);
        el.addEventListener("change", renderCurrentPreview);
      }
    });

    // Close button
    const btnCloseGen = document.getElementById("btn-cancel-doc-gen");
    if (btnCloseGen) btnCloseGen.onclick = () => closeModal();

    // Download Word
    const btnDlWord = document.getElementById("btn-download-doc-word");
    if (btnDlWord) {
      btnDlWord.onclick = () => {
        const cleanPlate = (currentVehicle.no_polisi || "KENDARAAN").replace(/\s+/g, "_");
        const pNama = inputPemberiNama ? inputPemberiNama.value.trim() : initPemberiNama;
        const pJabatan = inputPemberiJabatan ? inputPemberiJabatan.value.trim() : initPemberiJabatan;

        if (currentDocType === "KUASA") {
          const html = buildSuratKuasaHtml({
            noSurat: inputNoSurat.value.trim(),
            tglSurat: inputTglSurat.value,
            pemberiNama: pNama,
            pemberiJabatan: pJabatan,
            pemberiPerusahaan: COMPANY_NAME || "CV ANDELA JAYA",
            pemberiAlamat: COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
            penerimaNama: inputPenerimaNama.value.trim(),
            penerimaNik: inputPenerimaNik.value.trim(),
            penerimaJabatan: inputPenerimaJabatan.value.trim(),
            penerimaAlamat: inputPenerimaAlamat.value.trim(),
            tujuanPengurusan: inputTujuanKuasa.value,
            instansiTujuan: inputInstansi.value.trim(),
            kendaraan: currentVehicle
          });
          downloadA4LetterWordDoc({
            htmlContent: html,
            filename: `Surat_Kuasa_${cleanPlate}.doc`,
            title: "Surat Kuasa Khusus Pengurusan Kendaraan"
          });
          toast("Surat Kuasa format Word berhasil diunduh!", "success");
        } else {
          const html = buildSuratKeteranganAsetHtml({
            noSurat: inputNoSurat.value.trim(),
            tglSurat: inputTglSurat.value,
            pejabatNama: pNama,
            pejabatJabatan: pJabatan,
            namaPerusahaan: COMPANY_NAME || "CV ANDELA JAYA",
            alamatPerusahaan: COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
            keperluan: inputKeperluanAset.value.trim(),
            kendaraan: currentVehicle
          });
          downloadA4LetterWordDoc({
            htmlContent: html,
            filename: `Surat_Ket_Aset_${cleanPlate}.doc`,
            title: "Surat Keterangan Kepemilikan Aset"
          });
          toast("Surat Keterangan Aset format Word berhasil diunduh!", "success");
        }
      };
    }

    // Download PDF (via iframe print)
    const btnDlPdf = document.getElementById("btn-download-doc-pdf");
    if (btnDlPdf) {
      btnDlPdf.onclick = () => {
        let html = "";
        const pNama = inputPemberiNama ? inputPemberiNama.value.trim() : initPemberiNama;
        const pJabatan = inputPemberiJabatan ? inputPemberiJabatan.value.trim() : initPemberiJabatan;

        if (currentDocType === "KUASA") {
          html = buildSuratKuasaHtml({
            noSurat: inputNoSurat.value.trim(),
            tglSurat: inputTglSurat.value,
            pemberiNama: pNama,
            pemberiJabatan: pJabatan,
            pemberiPerusahaan: COMPANY_NAME || "CV ANDELA JAYA",
            pemberiAlamat: COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
            penerimaNama: inputPenerimaNama.value.trim(),
            penerimaNik: inputPenerimaNik.value.trim(),
            penerimaJabatan: inputPenerimaJabatan.value.trim(),
            penerimaAlamat: inputPenerimaAlamat.value.trim(),
            tujuanPengurusan: inputTujuanKuasa.value,
            instansiTujuan: inputInstansi.value.trim(),
            kendaraan: currentVehicle
          });
        } else {
          html = buildSuratKeteranganAsetHtml({
            noSurat: inputNoSurat.value.trim(),
            tglSurat: inputTglSurat.value,
            pejabatNama: pNama,
            pejabatJabatan: pJabatan,
            namaPerusahaan: COMPANY_NAME || "CV ANDELA JAYA",
            alamatPerusahaan: COMPANY_ADDRESS_LINE1 || "Jln. Jendral Sudirman No 58, Penggung, Kota Cirebon",
            keperluan: inputKeperluanAset.value.trim(),
            kendaraan: currentVehicle
          });
        }

        const printIframe = document.createElement("iframe");
        printIframe.style.position = "fixed";
        printIframe.style.right = "0";
        printIframe.style.bottom = "0";
        printIframe.style.width = "0";
        printIframe.style.height = "0";
        printIframe.style.border = "0";
        document.body.appendChild(printIframe);

        const doc = printIframe.contentWindow.document;
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${currentDocType === 'KUASA' ? 'Surat_Kuasa_' : 'Surat_Ket_Aset_'}${(currentVehicle.no_polisi || '').replace(/\s+/g, '_')}</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 20mm 15mm 20mm 15mm;
              }
              body {
                font-family: 'Times New Roman', Times, serif;
                font-size: 11pt;
                line-height: 1.4;
                color: #000;
                margin: 0;
                padding: 0;
              }
              table { border-collapse: collapse; width: 100%; }
              p { margin: 0 0 8pt 0; }
            </style>
          </head>
          <body>
            ${html}
            <script>
              window.onload = function() {
                window.focus();
                window.print();
                setTimeout(() => {
                  window.parent.document.body.removeChild(window.frameElement);
                }, 1000);
              };
            </script>
          </body>
          </html>
        `);
        doc.close();
        toast("Membuka dialog cetak PDF...", "info");
      };
    }

    // Initial render
    renderCurrentPreview();
  }

  // 3. COMPREHENSIVE VEHICLE DETAIL MODAL// 3. COMPREHENSIVE VEHICLE DETAIL MODAL// 3. COMPREHENSIVE VEHICLE DETAIL MODAL
 // -------------------------------------------------------------
 function openVehicleDetailModal(vDoc) {
 const plate = escapeHtml(vDoc.no_polisi || "TANPA PLAT");
 const name = escapeHtml(`${vDoc.merk || ""} ${vDoc.tipe || ""}`.trim() || plate);

 // Filter sub logs for this vehicle
 const vehicleFuels = allFuelLogs.filter(f => String(f.no_polisi || "").toUpperCase() === plate.toUpperCase());
 const vehicleServices = allServiceLogs.filter(s => String(s.no_polisi || "").toUpperCase() === plate.toUpperCase());
 const vehicleCompliance = allComplianceLogs.filter(c => String(c.no_polisi || "").toUpperCase() === plate.toUpperCase());

 const totalFuelCost = vehicleFuels.reduce((sum, f) => sum + (parseFloat(f.total_biaya) || 0), 0);
 const totalServiceCost = vehicleServices.reduce((sum, s) => sum + (parseFloat(s.total_biaya) || 0), 0);

 openModal({
 title: `<div class="flex items-center gap-3">
 <span class="px-2.5 py-1 bg-slate-900 text-amber-400 font-mono font-bold text-xs rounded-md tracking-wider border border-slate-800">${plate}</span>
 <span class="text-slate-800 font-bold">${name}</span>
 </div>`,
 size: "xl",
 bodyHtml: `
 <div class="space-y-5 text-left">
 <!-- SUB TABS HEADER -->
 <div class="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 text-xs">
 <button id="vtab-btn-identitas" class="vsub-tab px-4 py-2 font-bold border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">
 Identitas & Spesifikasi
 </button>
 <button id="vtab-btn-bbm" class="vsub-tab px-4 py-2 font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap">
 Log BBM (${vehicleFuels.length})
 </button>
 <button id="vtab-btn-service" class="vsub-tab px-4 py-2 font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap">
 Log Service & Perbaikan (${vehicleServices.length})
 </button>
 <button id="vtab-btn-pajak" class="vsub-tab px-4 py-2 font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap">
 Pajak, STNK & KIR (${vehicleCompliance.length})
 </button>
 </div>

 <!-- TAB 1: IDENTITAS -->
 <div id="vtab-panel-identitas" class="space-y-4">
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
 <h4 class="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 text-[11px]">Informasi Fisik & Driver</h4>
 <div class="flex justify-between"><span class="text-slate-500">No. Polisi / Plat:</span><span class="font-mono font-bold text-slate-900">${plate}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Merk & Tipe:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.merk || '-')} ${escapeHtml(vDoc.tipe || '')}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Model & Warna:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.model || '-')} / ${escapeHtml(vDoc.warna || '-')}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Tahun Pembuatan:</span><span class="font-semibold text-slate-800">${vDoc.tahun || '-'}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Bahan Bakar:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.bahan_bakar || '-')}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Driver / PJ:</span><span class="font-bold text-maroon-700">${escapeHtml(vDoc.driver_pj || vDoc.nama_pemilik || '-')}</span></div>
 </div>

 <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
 <h4 class="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 text-[11px]">Legalitas & Tanggal Penting</h4>
 <div class="flex justify-between"><span class="text-slate-500">Atas Nama Pemilik:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.nama_pemilik || '-')}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">No. Rangka:</span><span class="font-mono text-slate-800">${escapeHtml(vDoc.no_rangka || '-')}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">No. Mesin:</span><span class="font-mono text-slate-800">${escapeHtml(vDoc.no_mesin || '-')}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Jatuh Tempo STNK:</span><span class="font-bold text-slate-900">${fmtDateShort(vDoc.tgl_stnk_tahunan)}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Jatuh Tempo Pajak 5Th:</span><span class="font-bold text-slate-900">${fmtDateShort(vDoc.tgl_pajak_5thn)}</span></div>
 <div class="flex justify-between"><span class="text-slate-500">Jatuh Tempo KIR:</span><span class="font-bold text-slate-900">${fmtDateShort(vDoc.tgl_kir)}</span></div>
 </div>
 </div>

 <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs">
 <span class="text-slate-500 block font-semibold mb-1">Alamat Terdaftar STNK / Catatan Tambahan:</span>
 <p class="text-slate-700 leading-relaxed">${escapeHtml(vDoc.alamat || 'Tidak ada catatan khusus.')}</p>
 </div>

 <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
 <div class="flex items-center gap-2">
 <button id="btn-quick-gen-kuasa-${vDoc.id}" class="px-3 py-1.5 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span>Surat Kuasa (A4)</span>
        </button>
        <button id="btn-quick-gen-aset-${vDoc.id}" class="px-3 py-1.5 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
          <span>🏢 Surat Ket. Aset</span>
        </button>
        <button id="btn-export-single-excel-${vDoc.id}" class="px-3 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
 <span class="font-bold text-[10px] bg-emerald-200 text-emerald-900 px-1 py-0.2 rounded">XLS</span>
 <span>Export Excel</span>
 </button>
 <button id="btn-export-single-word-${vDoc.id}" class="px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
 <span class="font-bold text-[10px] bg-blue-200 text-blue-900 px-1 py-0.2 rounded">DOC</span>
 <span>Export Word</span>
 </button>
 </div>
 ${isHrd && canEdit ? `
 <div class="flex items-center gap-2">
 <button id="btn-edit-veh-${vDoc.id}" class="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition cursor-pointer">
 Edit Data
 </button>
 <button id="btn-del-veh-${vDoc.id}" class="px-3.5 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition cursor-pointer">
 Hapus
 </button>
 </div>` : ''}
 </div>
 </div>

 <!-- TAB 2: LOG BBM -->
 <div id="vtab-panel-bbm" class="space-y-3 hidden">
 <div class="flex items-center justify-between">
 <div class="text-xs text-slate-500">
 Total Biaya BBM: <b class="text-slate-800 font-mono text-sm">${fmtRupiah(totalFuelCost)}</b> (${vehicleFuels.length} Transaksi)
 </div>
 <button id="btn-quick-add-bbm" class="px-3 py-1.5 text-xs font-bold bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg shadow-xs transition">
 + Input Log BBM
 </button>
 </div>
 
 <div class="border border-slate-200 rounded-xl overflow-x-auto">
 <table class="w-full text-xs text-left">
 <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
 <tr>
 <th class="p-2.5">Tanggal</th>
 <th class="p-2.5">Driver</th>
 <th class="p-2.5">KM awal - akhir</th>
 <th class="p-2.5">Liter</th>
 <th class="p-2.5 text-right">Biaya</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-100">
 ${vehicleFuels.length ? vehicleFuels.map(f => `
 <tr class="hover:bg-slate-50">
 <td class="p-2.5 font-medium">${fmtDateShort(f.tanggal)}</td>
 <td class="p-2.5">${escapeHtml(f.nama_driver || '-')}</td>
 <td class="p-2.5 font-mono">${f.km_awal || 0} - ${f.km_akhir || 0} km</td>
 <td class="p-2.5 font-bold">${f.liter || 0} L (${escapeHtml(f.jenis_bbm || 'BBM')})</td>
 <td class="p-2.5 text-right font-mono font-bold text-slate-800">${fmtRupiah(f.total_biaya)}</td>
 </tr>
 `).join('') : `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada catatan log BBM untuk kendaraan ini.</td></tr>`}
 </tbody>
 </table>
 </div>
 </div>

 <!-- TAB 3: LOG SERVICE -->
 <div id="vtab-panel-service" class="space-y-3 hidden">
 <div class="flex items-center justify-between">
 <div class="text-xs text-slate-500">
 Total Biaya Perbaikan: <b class="text-slate-800 font-mono text-sm">${fmtRupiah(totalServiceCost)}</b>
 </div>
 <button id="btn-quick-add-service" class="px-3 py-1.5 text-xs font-bold bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg shadow-xs transition">
 + Input Log Service
 </button>
 </div>

 <div class="border border-slate-200 rounded-xl overflow-x-auto">
 <table class="w-full text-xs text-left">
 <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
 <tr>
 <th class="p-2.5">Tanggal</th>
 <th class="p-2.5">Jenis Service</th>
 <th class="p-2.5">Vendor / Bengkel</th>
 <th class="p-2.5">Driver</th>
 <th class="p-2.5 text-right">Biaya</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-100">
 ${vehicleServices.length ? vehicleServices.map(s => `
 <tr class="hover:bg-slate-50">
 <td class="p-2.5 font-medium">${fmtDateShort(s.tanggal)}</td>
 <td class="p-2.5 font-semibold text-slate-800">${escapeHtml(s.jenis_dokumen || s.keterangan || 'Service Rutin')}</td>
 <td class="p-2.5">${escapeHtml(s.vendor || '-')}</td>
 <td class="p-2.5">${escapeHtml(s.nama_driver || '-')}</td>
 <td class="p-2.5 text-right font-mono font-bold text-slate-800">${fmtRupiah(s.total_biaya)}</td>
 </tr>
 `).join('') : `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada riwayat service untuk kendaraan ini.</td></tr>`}
 </tbody>
 </table>
 </div>
 </div>

 <!-- TAB 4: LOG PAJAK & COMPLIANCE -->
 <div id="vtab-panel-pajak" class="space-y-3 hidden">
 <div class="flex items-center justify-between">
 <div class="text-xs text-slate-500">
 Riwayat Perpanjangan STNK / Pajak / KIR (${vehicleCompliance.length} Catatan)
 </div>
 <button id="btn-quick-add-pajak" class="px-3 py-1.5 text-xs font-bold bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg shadow-xs transition">
 + Input Log Pajak/KIR
 </button>
 </div>

 <div class="border border-slate-200 rounded-xl overflow-x-auto">
 <table class="w-full text-xs text-left">
 <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
 <tr>
 <th class="p-2.5">Tgl Bayar</th>
 <th class="p-2.5">Jenis Pajak / Legalitas</th>
 <th class="p-2.5">Berlaku Hingga</th>
 <th class="p-2.5">Dokumen</th>
 <th class="p-2.5 text-right">Biaya</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-100">
 ${vehicleCompliance.length ? vehicleCompliance.map(c => `
 <tr class="hover:bg-slate-50">
 <td class="p-2.5 font-medium">${fmtDateShort(c.tanggal_bayar)}</td>
 <td class="p-2.5 font-semibold text-slate-800">${escapeHtml(c.jenis_pajak || '-')}</td>
 <td class="p-2.5 font-bold text-emerald-700">${fmtDateShort(c.berlaku_hingga)}</td>
 <td class="p-2.5">
 ${c.dokumen_url ? `<a href="${c.dokumen_url}" target="_blank" class="text-maroon-700 hover:underline font-bold">Lihat Dokumen</a>` : '-'}
 </td>
 <td class="p-2.5 text-right font-mono font-bold text-slate-800">${fmtRupiah(c.total_biaya)}</td>
 </tr>
 `).join('') : `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada catatan pajak & compliance.</td></tr>`}
 </tbody>
 </table>
 </div>
 </div>
 </div>`
 });

 // Sub-tab toggles inside modal
 const vtabs = {
 identitas: document.getElementById("vtab-panel-identitas"),
 bbm: document.getElementById("vtab-panel-bbm"),
 service: document.getElementById("vtab-panel-service"),
 pajak: document.getElementById("vtab-panel-pajak"),
 };
 const vtabBtns = {
 identitas: document.getElementById("vtab-btn-identitas"),
 bbm: document.getElementById("vtab-btn-bbm"),
 service: document.getElementById("vtab-btn-service"),
 pajak: document.getElementById("vtab-btn-pajak"),
 };

 Object.keys(vtabBtns).forEach(k => {
 if (vtabBtns[k]) {
 vtabBtns[k].onclick = () => {
 Object.keys(vtabs).forEach(tk => {
 vtabs[tk].classList.toggle("hidden", tk !== k);
 vtabBtns[tk].classList.toggle("border-maroon-700", tk === k);
 vtabBtns[tk].classList.toggle("text-maroon-700", tk === k);
 vtabBtns[tk].classList.toggle("font-bold", tk === k);
 vtabBtns[tk].classList.toggle("border-transparent", tk !== k);
 vtabBtns[tk].classList.toggle("text-slate-500", tk !== k);
 });
 };
 }
 });

 // Quick Action Buttons
 const btnQuickBbm = document.getElementById("btn-quick-add-bbm");
 if (btnQuickBbm) {
 btnQuickBbm.onclick = () => {
 closeModal();
 openAddFuelModal(vDoc.no_polisi);
 };
 }

 const btnQuickService = document.getElementById("btn-quick-add-service");
 if (btnQuickService) {
 btnQuickService.onclick = () => {
 closeModal();
 openAddServiceModal(vDoc.no_polisi);
 };
 }

 const btnQuickPajak = document.getElementById("btn-quick-add-pajak");
 if (btnQuickPajak) {
 btnQuickPajak.onclick = () => {
 closeModal();
 openAddComplianceModal(vDoc.no_polisi);
 };
 }

 // Export Single Vehicle Buttons
 const btnSingleExcel = document.getElementById(`btn-export-single-excel-${vDoc.id}`);
 if (btnSingleExcel) {
 btnSingleExcel.onclick = async () => {
 await exportSingleVehicleExcel(vDoc);
 };
 }

 const btnSingleWord = document.getElementById(`btn-export-single-word-${vDoc.id}`);
 if (btnSingleWord) {
 btnSingleWord.onclick = () => {
 exportSingleVehicleWord(vDoc);
 };
 }

 // Edit/Delete Vehicle Buttons
 const btnEdit = document.getElementById(`btn-edit-veh-${vDoc.id}`);
 if (btnEdit) {
 btnEdit.onclick = () => {
 closeModal();
 openVehicleFormModal(vDoc);
 };
 }

 const btnDel = document.getElementById(`btn-del-veh-${vDoc.id}`);
 if (btnDel) {
 btnDel.onclick = async () => {
 if (await confirmDialog(`Hapus kendaraan ${vDoc.no_polisi} dari database?`)) {
 await deleteDoc(doc(db, COL.MASTER_KENDARAAN, vDoc.id));
 toast("Kendaraan berhasil dihapus", "success");
 closeModal();
 await loadAllData();
 }
 };
 }
 }

 // -------------------------------------------------------------
 // 4. FORM MODALS FOR KENDARAAN, FUEL, SERVICE, COMPLIANCE
 // -------------------------------------------------------------
 function openVehicleFormModal(vDoc = null) {
 const isEdit = !!vDoc;
 openModal({
 title: isEdit ? `Edit Kendaraan — ${vDoc.no_polisi}` : "Tambah Kendaraan Baru",
 size: "lg",
 bodyHtml: `
 <form id="form-vehicle" class="space-y-4 text-left grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi / Plat *</label>
 <input type="text" id="fv-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-mono uppercase" placeholder="Cth: B 1234 ABC" value="${vDoc?.no_polisi || ''}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Nama Pemilik / Atas Nama STNK</label>
 <input type="text" id="fv-pemilik" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="CV Andela Jaya" value="${vDoc?.nama_pemilik || ''}">
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Merk Kendaraan *</label>
 <input type="text" id="fv-merk" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Toyota / Isuzu / Honda" value="${vDoc?.merk || ''}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Tipe / Model</label>
 <input type="text" id="fv-tipe" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Hilux / Traga / Grand Max" value="${vDoc?.tipe || ''}">
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Tahun & Warna</label>
 <div class="grid grid-cols-2 gap-2">
 <input type="number" id="fv-tahun" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="2022" value="${vDoc?.tahun || ''}">
 <input type="text" id="fv-warna" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Putih" value="${vDoc?.warna || ''}">
 </div>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jenis Bahan Bakar</label>
 <select id="fv-bbm" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
 <option value="Solar" ${vDoc?.bahan_bakar === 'Solar' ? 'selected' : ''}>Solar / BioSolar</option>
 <option value="Pertalite" ${vDoc?.bahan_bakar === 'Pertalite' ? 'selected' : ''}>Pertalite</option>
 <option value="Pertamax" ${vDoc?.bahan_bakar === 'Pertamax' ? 'selected' : ''}>Pertamax</option>
 <option value="Dexlite" ${vDoc?.bahan_bakar === 'Dexlite' ? 'selected' : ''}>Dexlite</option>
 <option value="Listrik" ${vDoc?.bahan_bakar === 'Listrik' ? 'selected' : ''}>Listrik (EV)</option>
 </select>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Driver / Penanggung Jawab</label>
 <input type="text" id="fv-driver" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Nama driver / PJ armada" value="${vDoc?.driver_pj || vDoc?.nama_pemilik || ''}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Status Kendaraan</label>
 <select id="fv-status" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
 <option value="Siap Pakai" ${vDoc?.status_kendaraan === 'Siap Pakai' ? 'selected' : ''}>Siap Pakai / Baik</option>
 <option value="Perlu Service" ${vDoc?.status_kendaraan === 'Perlu Service' ? 'selected' : ''}>Perlu Service / Maintenance</option>
 <option value="Dalam Perbaikan" ${vDoc?.status_kendaraan === 'Dalam Perbaikan' ? 'selected' : ''}>Dalam Perbaikan Bengkel</option>
 <option value="Rusak" ${vDoc?.status_kendaraan === 'Rusak' ? 'selected' : ''}>Rusak / Tidak Layak</option>
 </select>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">No. Rangka</label>
 <input type="text" id="fv-rangka" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-mono" value="${vDoc?.no_rangka || ''}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">No. Mesin</label>
 <input type="text" id="fv-mesin" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-mono" value="${vDoc?.no_mesin || ''}">
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jatuh Tempo STNK Tahunan</label>
 <input type="date" id="fv-stnk" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_stnk_tahunan || ''}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jatuh Tempo Pajak 5 Tahun</label>
 <input type="date" id="fv-pajak5" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_pajak_5thn || ''}">
 </div>

 <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jatuh Tempo Uji KIR</label>
 <input type="date" id="fv-kir" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_kir || ''}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jadwal Service Rutin Berikutnya</label>
 <input type="date" id="fv-nxt-service" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_service_berikutnya || ''}">
 </div>
 </div>

 <div class="md:col-span-2">
 <label class="block text-xs font-bold text-slate-700 mb-1">Alamat Terdaftar / Catatan STNK</label>
 <textarea id="fv-alamat" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Alamat cabang / lokasi simpan armada">${vDoc?.alamat || ''}</textarea>
 </div>

 <div class="md:col-span-2 pt-3 flex justify-end gap-2 border-t border-slate-100">
 <button type="button" id="btn-cancel-fv" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
 <button type="submit" id="btn-submit-fv" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow-xs">
 Simpan Data Kendaraan
 </button>
 </div>
 </form>`
 });

 document.getElementById("btn-cancel-fv").onclick = () => closeModal();
 document.getElementById("form-vehicle").onsubmit = async (e) => {
 e.preventDefault();
 const polisi = document.getElementById("fv-polisi").value.trim().toUpperCase();
 if (!polisi) return toast("No. Polisi Wajib diisi", "warning");

 const payload = {
 no_polisi: polisi,
 nama_pemilik: document.getElementById("fv-pemilik").value.trim(),
 merk: document.getElementById("fv-merk").value.trim(),
 tipe: document.getElementById("fv-tipe").value.trim(),
 tahun: parseInt(document.getElementById("fv-tahun").value) || null,
 warna: document.getElementById("fv-warna").value.trim(),
 bahan_bakar: document.getElementById("fv-bbm").value,
 driver_pj: document.getElementById("fv-driver").value.trim(),
 status_kendaraan: document.getElementById("fv-status").value,
 no_rangka: document.getElementById("fv-rangka").value.trim(),
 no_mesin: document.getElementById("fv-mesin").value.trim(),
 tgl_stnk_tahunan: document.getElementById("fv-stnk").value,
 tgl_pajak_5thn: document.getElementById("fv-pajak5").value,
 tgl_kir: document.getElementById("fv-kir").value,
 tgl_service_berikutnya: document.getElementById("fv-nxt-service").value,
 alamat: document.getElementById("fv-alamat").value.trim(),
 updatedAt: new Date().toISOString()
 };

 const docId = isEdit ? vDoc.id : genId("KND");
 await setDoc(doc(db, COL.MASTER_KENDARAAN, docId), payload, { merge: true });
 toast("Data kendaraan berhasil disimpan!", "success");
 closeModal();
 await loadAllData();
 };
 }

 // Quick Fuel Input
 function openAddFuelModal(defaultPlate = "") {
 openModal({
 title: "Input Log Pengisian BBM",
 size: "md",
 bodyHtml: `
 <form id="form-fuel" class="space-y-3 text-left">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi Kendaraan *</label>
 <input type="text" id="ff-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono uppercase" value="${defaultPlate}">
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal *</label>
 <input type="date" id="ff-tgl" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${new Date().toISOString().split('T')[0]}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Nama Driver *</label>
 <input type="text" id="ff-driver" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${session.nama}">
 </div>
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">KM Awal Speedometer</label>
 <input type="number" id="ff-kmawal" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">KM Akhir Pengisian</label>
 <input type="number" id="ff-kmakhir" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
 </div>
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jumlah Liter *</label>
 <input type="number" step="0.1" id="ff-liter" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Total Biaya (Rp) *</label>
 <input type="number" id="ff-biaya" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-bold text-maroon-700">
 </div>
 </div>
 <div class="pt-3 flex justify-end gap-2">
 <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500">Batal</button>
 <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl">Simpan Log BBM</button>
 </div>
 </form>`
 });

 document.getElementById("form-fuel").onsubmit = async (e) => {
 e.preventDefault();
 const payload = {
 no_polisi: document.getElementById("ff-polisi").value.trim().toUpperCase(),
 tanggal: document.getElementById("ff-tgl").value,
 nama_driver: document.getElementById("ff-driver").value.trim(),
 km_awal: parseFloat(document.getElementById("ff-kmawal").value) || 0,
 km_akhir: parseFloat(document.getElementById("ff-kmakhir").value) || 0,
 liter: parseFloat(document.getElementById("ff-liter").value) || 0,
 total_biaya: parseFloat(document.getElementById("ff-biaya").value) || 0,
 createdAt: new Date().toISOString()
 };
 await setDoc(doc(db, COL.LOG_KENDARAAN_FUEL, genId("FUEL")), payload);
 toast("Log BBM tersimpan", "success");
 closeModal();
 await loadAllData();
 };
 }

 // Quick Service Input
 function openAddServiceModal(defaultPlate = "") {
 openModal({
 title: "Input Log Service & Perbaikan",
 size: "md",
 bodyHtml: `
 <form id="form-service" class="space-y-3 text-left">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi Kendaraan *</label>
 <input type="text" id="fs-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono uppercase" value="${defaultPlate}">
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Service *</label>
 <input type="date" id="fs-tgl" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${new Date().toISOString().split('T')[0]}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Vendor / Bengkel</label>
 <input type="text" id="fs-vendor" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="Bengkel Resmi / Auto2000">
 </div>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Rincian Service / Perbaikan *</label>
 <input type="text" id="fs-jenis" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="Ganti oli, rem, balancing, dll">
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Driver PJ</label>
 <input type="text" id="fs-driver" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${session.nama}">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Total Biaya (Rp) *</label>
 <input type="number" id="fs-biaya" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-bold text-maroon-700">
 </div>
 </div>
 <div class="pt-3 flex justify-end gap-2">
 <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500">Batal</button>
 <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl">Simpan Log Service</button>
 </div>
 </form>`
 });

 document.getElementById("form-service").onsubmit = async (e) => {
 e.preventDefault();
 const payload = {
 no_polisi: document.getElementById("fs-polisi").value.trim().toUpperCase(),
 tanggal: document.getElementById("fs-tgl").value,
 vendor: document.getElementById("fs-vendor").value.trim(),
 jenis_dokumen: document.getElementById("fs-jenis").value.trim(),
 nama_driver: document.getElementById("fs-driver").value.trim(),
 total_biaya: parseFloat(document.getElementById("fs-biaya").value) || 0,
 createdAt: new Date().toISOString()
 };
 await setDoc(doc(db, COL.LOG_KENDARAAN_SERVICE, genId("SVC")), payload);
 toast("Log service tersimpan", "success");
 closeModal();
 await loadAllData();
 };
 }

 // Quick Compliance Input
 function openAddComplianceModal(defaultPlate = "") {
 openModal({
 title: "Input Pajak, STNK & Uji KIR",
 size: "md",
 bodyHtml: `
 <form id="form-compliance" class="space-y-3 text-left">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi Kendaraan *</label>
 <input type="text" id="fc-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono uppercase" value="${defaultPlate}">
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jenis Legalitas *</label>
 <select id="fc-jenis" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
 <option value="STNK Tahunan">STNK Tahunan</option>
 <option value="Pajak 5 Tahun">Pajak 5 Tahun (Ganti Kaleng)</option>
 <option value="Uji KIR">Uji KIR Kendaraan</option>
 <option value="Asuransi Armada">Asuransi Armada</option>
 </select>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Bayar *</label>
 <input type="date" id="fc-tgl" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${new Date().toISOString().split('T')[0]}">
 </div>
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Berlaku Baru Hingga *</label>
 <input type="date" id="fc-berlaku" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Total Biaya (Rp)</label>
 <input type="number" id="fc-biaya" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-bold text-maroon-700">
 </div>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">URL / Link Dokumen Bukti</label>
 <input type="text" id="fc-url" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="https://drive.google.com/...">
 </div>
 <div class="pt-3 flex justify-end gap-2">
 <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500">Batal</button>
 <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl">Simpan Log Legalitas</button>
 </div>
 </form>`
 });

 document.getElementById("form-compliance").onsubmit = async (e) => {
 e.preventDefault();
 const plate = document.getElementById("fc-polisi").value.trim().toUpperCase();
 const jenis = document.getElementById("fc-jenis").value;
 const berlaku = document.getElementById("fc-berlaku").value;

 const payload = {
 no_polisi: plate,
 jenis_pajak: jenis,
 tanggal_bayar: document.getElementById("fc-tgl").value,
 berlaku_hingga: berlaku,
 total_biaya: parseFloat(document.getElementById("fc-biaya").value) || 0,
 dokumen_url: document.getElementById("fc-url").value.trim(),
 createdAt: new Date().toISOString()
 };
 await setDoc(doc(db, COL.LOG_KENDARAAN_COMPLIANCE, genId("CMP")), payload);

 // Auto update vehicle expiration date if matching
 const vMatch = allVehicles.find(x => (x.no_polisi || "").toUpperCase() === plate);
 if (vMatch) {
 const updateField = {};
 if (jenis.includes("STNK")) updateField.tgl_stnk_tahunan = berlaku;
 else if (jenis.includes("5 Tahun")) updateField.tgl_pajak_5thn = berlaku;
 else if (jenis.includes("KIR")) updateField.tgl_kir = berlaku;

 if (Object.keys(updateField).length) {
 await setDoc(doc(db, COL.MASTER_KENDARAAN, vMatch.id), updateField, { merge: true });
 }
 }

 toast("Log legalitas tersimpan!", "success");
 closeModal();
 await loadAllData();
 };
 }

 // -------------------------------------------------------------
 // 5. EXPORT MASTER KENDARAAN (WORD & EXCEL)
 // -------------------------------------------------------------
 function getFilteredVehicles() {
 const q = (searchInput.value || "").trim().toLowerCase();
 const stFilter = statusFilter.value;
 const now = new Date();

 return allVehicles.filter(v => {
 const plate = String(v.no_polisi || "").toLowerCase();
 const merk = String(v.merk || "").toLowerCase();
 const tipe = String(v.tipe || "").toLowerCase();
 const driver = String(v.nama_pemilik || v.driver_pj || "").toLowerCase();

 const matchQuery = !q || plate.includes(q) || merk.includes(q) || tipe.includes(q) || driver.includes(q);
 if (!matchQuery) return false;

 if (stFilter === "SIAP") return String(v.status_kendaraan || "SIAP").toUpperCase().includes("SIAP");
 if (stFilter === "SERVICE") return String(v.status_kendaraan || "").toUpperCase().includes("SERVICE") || String(v.status_kendaraan || "").toUpperCase().includes("RUSAK") || String(v.status_kendaraan || "").toUpperCase().includes("PERBAIKAN");
 
 if (stFilter === "ALERT") {
 let isAlert = false;
 ["tgl_stnk_tahunan", "tgl_pajak_5thn", "tgl_kir", "tgl_service_berikutnya"].forEach(f => {
 const d = smartParseDate(v[f]);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days <= 30) isAlert = true;
 }
 });
 return isAlert;
 }

 return true;
 });
 }

 async function exportKendaraanExcel(targetVehicles = null) {
 const list = targetVehicles || allVehicles;
 if (!list || !list.length) {
 return toast("Tidak ada data kendaraan untuk diekspor", "warning");
 }

 await ensureXlsxLoaded();
 const now = new Date();

 // 1. Sheet Master Kendaraan
 const masterHeaders = [
 "No",
 "No. Polisi / Plat",
 "Merk Kendaraan",
 "Tipe / Model",
 "Tahun",
 "Warna",
 "Bahan Bakar",
 "Driver / PJ",
 "Atas Nama STNK",
 "Status Kendaraan",
 "Jatuh Tempo STNK Tahunan",
 "Status STNK",
 "Jatuh Tempo Pajak 5 Tahun",
 "Status Pajak 5 Tahun",
 "Jatuh Tempo Uji KIR",
 "Status Uji KIR",
 "Jadwal Service Berikutnya",
 "Total Log BBM",
 "Total Biaya BBM (Rp)",
 "Total Log Service",
 "Total Biaya Service (Rp)",
 "Total Biaya Operasional (Rp)",
 "No. Rangka",
 "No. Mesin",
 "Alamat STNK / Catatan"
 ];

 const masterRows = list.map((v, idx) => {
 const plate = (v.no_polisi || "").toUpperCase();
 
 // Status STNK
 let stnkStatus = "Aman";
 if (v.tgl_stnk_tahunan) {
 const d = smartParseDate(v.tgl_stnk_tahunan);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days < 0) stnkStatus = `Lewat ${Math.abs(days)} Hari`;
 else if (days <= 30) stnkStatus = `Perlu Perpanjang (${days} hari lagi)`;
 }
 } else {
 stnkStatus = "Belum Diisi";
 }

 // Status Pajak 5th
 let pajak5Status = "Aman";
 if (v.tgl_pajak_5thn) {
 const d = smartParseDate(v.tgl_pajak_5thn);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days < 0) pajak5Status = `Lewat ${Math.abs(days)} Hari`;
 else if (days <= 30) pajak5Status = `Perlu Perpanjang (${days} hari lagi)`;
 }
 } else {
 pajak5Status = "Belum Diisi";
 }

 // Status KIR
 let kirStatus = "Aman";
 if (v.tgl_kir) {
 const d = smartParseDate(v.tgl_kir);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days < 0) kirStatus = `Lewat ${Math.abs(days)} Hari`;
 else if (days <= 30) kirStatus = `Perlu Uji (${days} hari lagi)`;
 }
 } else {
 kirStatus = "Tidak Ada / Belum Diisi";
 }

 // Fuels for this plate
 const vFuels = allFuelLogs.filter(f => (f.no_polisi || "").toUpperCase() === plate);
 const totalBbmCost = vFuels.reduce((sum, f) => sum + (parseFloat(f.total_biaya) || 0), 0);

 // Services for this plate
 const vServices = allServiceLogs.filter(s => (s.no_polisi || "").toUpperCase() === plate);
 const totalSvcCost = vServices.reduce((sum, s) => sum + (parseFloat(s.total_biaya) || 0), 0);

 return [
 idx + 1,
 plate,
 v.merk || "-",
 v.tipe || "-",
 v.tahun || "-",
 v.warna || "-",
 v.bahan_bakar || "-",
 v.driver_pj || v.nama_pemilik || "-",
 v.nama_pemilik || "-",
 v.status_kendaraan || "Siap Pakai",
 fmtDateShort(v.tgl_stnk_tahunan),
 stnkStatus,
 fmtDateShort(v.tgl_pajak_5thn),
 pajak5Status,
 fmtDateShort(v.tgl_kir),
 kirStatus,
 fmtDateShort(v.tgl_service_berikutnya),
 vFuels.length,
 totalBbmCost,
 vServices.length,
 totalSvcCost,
 totalBbmCost + totalSvcCost,
 v.no_rangka || "-",
 v.no_mesin || "-",
 v.alamat || "-"
 ];
 });

 const wb = window.XLSX.utils.book_new();
 const wsMaster = window.XLSX.utils.aoa_to_sheet([masterHeaders, ...masterRows]);
 window.XLSX.utils.book_append_sheet(wb, wsMaster, "Master Kendaraan");

 // 2. Sheet Log BBM
 const relevantPlates = new Set(list.map(v => (v.no_polisi || "").toUpperCase()));
 const fuelRows = allFuelLogs
 .filter(f => relevantPlates.has((f.no_polisi || "").toUpperCase()))
 .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""))
 .map((f, i) => [
 i + 1,
 fmtDateShort(f.tanggal),
 (f.no_polisi || "").toUpperCase(),
 f.nama_driver || "-",
 parseFloat(f.km_awal) || 0,
 parseFloat(f.km_akhir) || 0,
 parseFloat(f.liter) || 0,
 parseFloat(f.total_biaya) || 0
 ]);
 const wsFuel = window.XLSX.utils.aoa_to_sheet([
 ["No", "Tanggal", "No. Polisi", "Nama Driver", "KM Awal", "KM Akhir", "Liter", "Total Biaya (Rp)"],
 ...fuelRows
 ]);
 window.XLSX.utils.book_append_sheet(wb, wsFuel, "Log BBM");

 // 3. Sheet Log Service
 const svcRows = allServiceLogs
 .filter(s => relevantPlates.has((s.no_polisi || "").toUpperCase()))
 .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""))
 .map((s, i) => [
 i + 1,
 fmtDateShort(s.tanggal),
 (s.no_polisi || "").toUpperCase(),
 s.jenis_dokumen || "-",
 s.vendor || "-",
 s.nama_driver || "-",
 parseFloat(s.total_biaya) || 0
 ]);
 const wsSvc = window.XLSX.utils.aoa_to_sheet([
 ["No", "Tanggal", "No. Polisi", "Rincian Service / Perbaikan", "Vendor / Bengkel", "Driver PJ", "Total Biaya (Rp)"],
 ...svcRows
 ]);
 window.XLSX.utils.book_append_sheet(wb, wsSvc, "Log Service");

 // 4. Sheet Log Compliance / Pajak
 const cmpRows = allComplianceLogs
 .filter(c => relevantPlates.has((c.no_polisi || "").toUpperCase()))
 .sort((a, b) => (b.tanggal_bayar || "").localeCompare(a.tanggal_bayar || ""))
 .map((c, i) => [
 i + 1,
 fmtDateShort(c.tanggal_bayar),
 (c.no_polisi || "").toUpperCase(),
 c.jenis_pajak || "-",
 fmtDateShort(c.berlaku_hingga),
 parseFloat(c.total_biaya) || 0,
 c.dokumen_url || "-"
 ]);
 const wsCmp = window.XLSX.utils.aoa_to_sheet([
 ["No", "Tgl Bayar", "No. Polisi", "Jenis Pajak / Legalitas", "Berlaku Hingga", "Total Biaya (Rp)", "Link Bukti Dokumen"],
 ...cmpRows
 ]);
 window.XLSX.utils.book_append_sheet(wb, wsCmp, "Pajak & Legalitas");

 const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
 const fname = `Master_Kendaraan_CV_Andela_Jaya_${todayStr}.xlsx`;
 window.XLSX.writeFile(wb, fname);
 toast("Berhasil mengunduh Laporan Master Kendaraan (Excel)!", "success");
 }

 function exportKendaraanWord(targetVehicles = null) {
 const list = targetVehicles || allVehicles;
 if (!list || !list.length) {
 return toast("Tidak ada data kendaraan untuk diekspor", "warning");
 }

 const now = new Date();
 const todayFormatted = fmtDateIndoLong(now.toISOString().slice(0, 10));
 const todayStr = now.toISOString().slice(0, 10).replace(/-/g, "");

 const siapCount = list.filter(v => (v.status_kendaraan || "Siap").toUpperCase().includes("SIAP")).length;
 const serviceCount = list.filter(v => (v.status_kendaraan || "").toUpperCase().includes("SERVICE") || (v.status_kendaraan || "").toUpperCase().includes("RUSAK") || (v.status_kendaraan || "").toUpperCase().includes("PERBAIKAN")).length;

 let totalBbmAll = 0;
 let totalSvcAll = 0;

 // Table 1: Master List
 const masterRows = list.map((v, i) => {
 const plate = (v.no_polisi || "").toUpperCase();
 const st = v.status_kendaraan || "Siap Pakai";
 let badgeHtml = `<b style="color:#166534;">${escapeHtml(st)}</b>`;
 if (st.toLowerCase().includes("rusak") || st.toLowerCase().includes("perbaikan")) {
 badgeHtml = `<b style="color:#991b1b;">${escapeHtml(st)}</b>`;
 } else if (st.toLowerCase().includes("service")) {
 badgeHtml = `<b style="color:#b45309;">${escapeHtml(st)}</b>`;
 }

 return [
 i + 1,
 `<strong>${escapeHtml(plate)}</strong>`,
 `${escapeHtml(v.merk || '')} ${escapeHtml(v.tipe || '')}`.trim() || '-',
 `${v.tahun || '-'} / ${escapeHtml(v.warna || '-')}`,
 escapeHtml(v.bahan_bakar || '-'),
 escapeHtml(v.driver_pj || v.nama_pemilik || '-'),
 escapeHtml(v.nama_pemilik || '-'),
 badgeHtml
 ];
 });

 // Table 2: Legalities
 const legalRows = list.map((v, i) => {
 const plate = (v.no_polisi || "").toUpperCase();
 
 const alerts = [];
 if (v.tgl_stnk_tahunan) {
 const d = smartParseDate(v.tgl_stnk_tahunan);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days < 0) alerts.push(`<span style="color:#dc2626; font-weight:bold;">STNK Expired (${Math.abs(days)} hr lalu)</span>`);
 else if (days <= 30) alerts.push(`<span style="color:#d97706; font-weight:bold;">STNK (${days} hr lagi)</span>`);
 }
 }
 if (v.tgl_pajak_5thn) {
 const d = smartParseDate(v.tgl_pajak_5thn);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days < 0) alerts.push(`<span style="color:#dc2626; font-weight:bold;">Pajak 5Th Expired (${Math.abs(days)} hr lalu)</span>`);
 else if (days <= 30) alerts.push(`<span style="color:#d97706; font-weight:bold;">Pajak 5Th (${days} hr lagi)</span>`);
 }
 }
 if (v.tgl_kir) {
 const d = smartParseDate(v.tgl_kir);
 if (d) {
 const days = Math.round((d - now) / 86400000);
 if (days < 0) alerts.push(`<span style="color:#dc2626; font-weight:bold;">KIR Expired (${Math.abs(days)} hr lalu)</span>`);
 else if (days <= 30) alerts.push(`<span style="color:#d97706; font-weight:bold;">KIR (${days} hr lagi)</span>`);
 }
 }

 return [
 i + 1,
 `<strong>${escapeHtml(plate)}</strong>`,
 fmtDateShort(v.tgl_stnk_tahunan),
 fmtDateShort(v.tgl_pajak_5thn),
 fmtDateShort(v.tgl_kir),
 fmtDateShort(v.tgl_service_berikutnya),
 alerts.length ? alerts.join("<br>") : `<span style="color:#16a34a; font-weight:bold;">Aman</span>`
 ];
 });

 // Table 3: Costs Recap
 const costRows = list.map((v, i) => {
 const plate = (v.no_polisi || "").toUpperCase();
 const vFuels = allFuelLogs.filter(f => (f.no_polisi || "").toUpperCase() === plate);
 const bbmCost = vFuels.reduce((sum, f) => sum + (parseFloat(f.total_biaya) || 0), 0);

 const vServices = allServiceLogs.filter(s => (s.no_polisi || "").toUpperCase() === plate);
 const svcCost = vServices.reduce((sum, s) => sum + (parseFloat(s.total_biaya) || 0), 0);

 totalBbmAll += bbmCost;
 totalSvcAll += svcCost;

 return [
 i + 1,
 `<strong>${escapeHtml(plate)}</strong>`,
 escapeHtml(v.driver_pj || v.nama_pemilik || '-'),
 `${vFuels.length} Trx`,
 fmtRupiah(bbmCost),
 `${vServices.length} Trx`,
 fmtRupiah(svcCost),
 `<strong>${fmtRupiah(bbmCost + svcCost)}</strong>`
 ];
 });

 // Append Total Summary Row
 costRows.push([
 "",
 "<strong>TOTAL KESELURUHAN</strong>",
 "-",
 "-",
 `<strong>${fmtRupiah(totalBbmAll)}</strong>`,
 "-",
 `<strong>${fmtRupiah(totalSvcAll)}</strong>`,
 `<strong style="color:#7f1d1d; font-size:10pt;">${fmtRupiah(totalBbmAll + totalSvcAll)}</strong>`
 ]);

 downloadWordDoc({
 filename: `Laporan_Master_Kendaraan_CV_Andela_Jaya_${todayStr}.doc`,
 title: "LAPORAN MASTER KENDARAAN & ARMADA OPERASIONAL",
 subtitle: "CV ANDELA JAYA — MANAJEMEN HRIS & OPERASIONAL ARMADA",
 meta: [
 { label: "Tanggal Laporan", value: todayFormatted },
 { label: "Total Armada Terdaftar", value: `${list.length} Unit Kendaraan` },
 { label: "Kondisi Armada", value: `Siap Pakai: ${siapCount} Unit | Perlu Service / Perbaikan: ${serviceCount} Unit` },
 { label: "Total Biaya Operasional", value: `BBM: ${fmtRupiah(totalBbmAll)} | Service: ${fmtRupiah(totalSvcAll)} | Total: ${fmtRupiah(totalBbmAll + totalSvcAll)}` },
 { label: "Pencetak Laporan", value: `${session.nama} (${session.role || 'Staff'})` }
 ],
 tables: [
 {
 title: "I. DAFTAR MASTER ARMADA & KONDISI OPERASIONAL",
 subtitle: "Spesifikasi fisik, penanggung jawab armada, dan status kelayakan jalan unit",
 headers: ["No", "No. Polisi", "Merk & Tipe", "Tahun / Warna", "Bahan Bakar", "Driver / PJ", "Atas Nama", "Status"],
 rows: masterRows,
 aligns: ["center", "left", "left", "left", "left", "left", "left", "center"]
 },
 {
 title: "II. MONITORING LEGALITAS DOKUMEN & JADWAL SERVICE",
 subtitle: "Tanggal jatuh tempo STNK Tahunan, Pajak 5 Tahun (Kaleng), Uji KIR, dan Service Berkala",
 headers: ["No", "No. Polisi", "STNK Tahunan", "Pajak 5 Tahun", "Uji KIR", "Jadwal Service", "Status & Pengingat"],
 rows: legalRows,
 aligns: ["center", "left", "center", "center", "center", "center", "left"]
 },
 {
 title: "III. REKAPITULASI BIAYA OPERASIONAL PER KENDARAAN",
 subtitle: "Akumulasi pengeluaran bahan bakar (BBM) dan biaya service / perawatan bengkel",
 headers: ["No", "No. Polisi", "Driver / PJ", "Jml BBM", "Total BBM (Rp)", "Jml Svc", "Total Service (Rp)", "Total Operasional (Rp)"],
 rows: costRows,
 aligns: ["center", "left", "left", "center", "right", "center", "right", "right"]
 }
 ],
 signatures: [
 { role: "Dibuat Oleh,", title: "Staff GA / Pengelola Armada", name: session.nama || "Staff GA" },
 { role: "Diperiksa Oleh,", title: "Manager Operasional & GA", name: "Ika Novista" },
 { role: "Disetujui Oleh,", title: "Pimpinan / Direktur", name: "Pimpinan CV Andela Jaya" }
 ]
 });

 toast("Berhasil mengunduh Laporan Master Kendaraan (Word)!", "success");
 }

 function exportSingleVehicleWord(vDoc) {
 const plate = (vDoc.no_polisi || "").toUpperCase();
 const vFuels = allFuelLogs.filter(f => (f.no_polisi || "").toUpperCase() === plate);
 const vServices = allServiceLogs.filter(s => (s.no_polisi || "").toUpperCase() === plate);
 const vCompliance = allComplianceLogs.filter(c => (c.no_polisi || "").toUpperCase() === plate);

 const totalFuel = vFuels.reduce((sum, f) => sum + (parseFloat(f.total_biaya) || 0), 0);
 const totalSvc = vServices.reduce((sum, s) => sum + (parseFloat(s.total_biaya) || 0), 0);
 const totalCmp = vCompliance.reduce((sum, c) => sum + (parseFloat(c.total_biaya) || 0), 0);

 const now = new Date();
 const todayFormatted = fmtDateIndoLong(now.toISOString().slice(0, 10));

 const fuelRows = vFuels.map((f, i) => [
 i + 1,
 fmtDateShort(f.tanggal),
 f.nama_driver || "-",
 f.km_awal || "-",
 f.km_akhir || "-",
 f.liter ? `${f.liter} L` : "-",
 fmtRupiah(f.total_biaya)
 ]);

 const svcRows = vServices.map((s, i) => [
 i + 1,
 fmtDateShort(s.tanggal),
 escapeHtml(s.jenis_dokumen || "-"),
 escapeHtml(s.vendor || "-"),
 escapeHtml(s.nama_driver || "-"),
 fmtRupiah(s.total_biaya)
 ]);

 const cmpRows = vCompliance.map((c, i) => [
 i + 1,
 fmtDateShort(c.tanggal_bayar),
 escapeHtml(c.jenis_pajak || "-"),
 fmtDateShort(c.berlaku_hingga),
 c.dokumen_url ? `<a href="${c.dokumen_url}">Link Bukti</a>` : "-",
 fmtRupiah(c.total_biaya)
 ]);

 downloadWordDoc({
 filename: `Dossier_Kendaraan_${plate.replace(/\s+/g, "_")}.doc`,
 title: `DOSSIER & RIWAYAT KENDARAAN — ${plate}`,
 subtitle: `CV ANDELA JAYA — SISTEM MANAJEMEN ARMADA OPERASIONAL`,
 meta: [
 { label: "No. Polisi / Plat", value: plate },
 { label: "Merk / Tipe", value: `${vDoc.merk || '-'} ${vDoc.tipe || ''}` },
 { label: "Tahun & Warna", value: `${vDoc.tahun || '-'} / ${vDoc.warna || '-'}` },
 { label: "Bahan Bakar", value: vDoc.bahan_bakar || '-' },
 { label: "Driver / Penanggung Jawab", value: vDoc.driver_pj || vDoc.nama_pemilik || '-' },
 { label: "Atas Nama Pemilik STNK", value: vDoc.nama_pemilik || '-' },
 { label: "Nomor Rangka", value: vDoc.no_rangka || '-' },
 { label: "Nomor Mesin", value: vDoc.no_mesin || '-' },
 { label: "Status Kondisi Kendaraan", value: vDoc.status_kendaraan || 'Siap Pakai' },
 { label: "Jatuh Tempo STNK Tahunan", value: fmtDateShort(vDoc.tgl_stnk_tahunan) },
 { label: "Jatuh Tempo Pajak 5 Tahun", value: fmtDateShort(vDoc.tgl_pajak_5thn) },
 { label: "Jatuh Tempo Uji KIR", value: fmtDateShort(vDoc.tgl_kir) },
 { label: "Jadwal Service Rutin", value: fmtDateShort(vDoc.tgl_service_berikutnya) },
 { label: "Total Biaya Pengisian BBM", value: `${fmtRupiah(totalFuel)} (${vFuels.length} Transaksi)` },
 { label: "Total Biaya Perbaikan / Service", value: `${fmtRupiah(totalSvc)} (${vServices.length} Transaksi)` },
 { label: "Total Biaya Legalitas / Pajak", value: `${fmtRupiah(totalCmp)} (${vCompliance.length} Transaksi)` },
 { label: "Akumulasi Biaya Total", value: fmtRupiah(totalFuel + totalSvc + totalCmp) },
 { label: "Alamat / Catatan", value: vDoc.alamat || '-' },
 { label: "Tanggal Dokumen Dicetak", value: todayFormatted }
 ],
 tables: [
 {
 title: "I. RIWAYAT PENGISIAN BAHAN BAKAR (BBM)",
 headers: ["No", "Tanggal", "Driver", "KM Awal", "KM Akhir", "Liter", "Total Biaya (Rp)"],
 rows: fuelRows,
 aligns: ["center", "center", "left", "right", "right", "right", "right"]
 },
 {
 title: "II. RIWAYAT SERVICE & PERBAIKAN BENGKEL",
 headers: ["No", "Tanggal", "Rincian Perbaikan", "Vendor / Bengkel", "Driver PJ", "Total Biaya (Rp)"],
 rows: svcRows,
 aligns: ["center", "center", "left", "left", "left", "right"]
 },
 {
 title: "III. RIWAYAT PAJAK, STNK & LEGALITAS",
 headers: ["No", "Tgl Bayar", "Jenis Pajak / Legalitas", "Berlaku Hingga", "Dokumen", "Total Biaya (Rp)"],
 rows: cmpRows,
 aligns: ["center", "center", "left", "center", "center", "right"]
 }
 ],
 signatures: [
 { role: "Pengelola Armada,", title: "Staff GA / Driver", name: vDoc.driver_pj || session.nama || "Staff GA" },
 { role: "Mengetahui,", title: "Manager Operasional", name: "Ika Novista" }
 ]
 });

 toast(`Berhasil mengunduh dokumen Word untuk kendaraan ${plate}!`, "success");
 }

 async function exportSingleVehicleExcel(vDoc) {
 await exportKendaraanExcel([vDoc]);
 }

 function openExportOptionsModal() {
 const filtered = getFilteredVehicles();
 openModal({
 title: "Opsi & Export Data Master Kendaraan",
 size: "md",
 bodyHtml: `
 <form id="form-export-opts" class="space-y-4 text-left">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1.5">Cakupan Data Kendaraan</label>
 <div class="space-y-2">
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs">
 <input type="radio" name="exp_scope" value="all" checked class="text-maroon-700 focus:ring-maroon-700">
 <div>
 <div class="font-bold text-slate-800">Semua Kendaraan (${allVehicles.length} Unit)</div>
 <div class="text-[11px] text-slate-500">Ekspor seluruh database armada operasional</div>
 </div>
 </label>
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs">
 <input type="radio" name="exp_scope" value="filtered" class="text-maroon-700 focus:ring-maroon-700">
 <div>
 <div class="font-bold text-slate-800">Sesuai Filter / Pencarian Aktif (${filtered.length} Unit)</div>
 <div class="text-[11px] text-slate-500">Hanya kendaraan yang sedang tampil di layar</div>
 </div>
 </label>
 </div>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1.5">Pilih Format File</label>
 <div class="grid grid-cols-2 gap-2.5">
 <label class="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 hover:bg-emerald-50/60 cursor-pointer text-xs">
 <input type="radio" name="exp_format" value="excel" checked class="text-emerald-700 focus:ring-emerald-700">
 <span class="w-6 h-6 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px]">XLS</span>
 <div>
 <div class="font-bold text-slate-800">Excel (.xlsx)</div>
 <div class="text-[10px] text-slate-400">Multi-sheet data</div>
 </div>
 </label>
 <label class="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 hover:bg-blue-50/60 cursor-pointer text-xs">
 <input type="radio" name="exp_format" value="word" class="text-blue-700 focus:ring-blue-700">
 <span class="w-6 h-6 rounded bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[10px]">DOC</span>
 <div>
 <div class="font-bold text-slate-800">Word (.doc)</div>
 <div class="text-[10px] text-slate-400">Laporan cetak resmi</div>
 </div>
 </label>
 </div>
 </div>

 <div class="pt-3 flex justify-end gap-2 border-t border-slate-100">
 <button type="button" id="btn-cancel-exp-opts" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
 <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
 <span>Unduh File Sekarang</span>
 </button>
 </div>
 </form>
 `
 });

 const btnCancel = document.getElementById("btn-cancel-exp-opts");
 if (btnCancel) btnCancel.onclick = () => closeModal();

 const formExp = document.getElementById("form-export-opts");
 if (formExp) {
 formExp.onsubmit = async (e) => {
 e.preventDefault();
 const scope = document.querySelector('input[name="exp_scope"]:checked')?.value || "all";
 const format = document.querySelector('input[name="exp_format"]:checked')?.value || "excel";
 const targets = scope === "filtered" ? filtered : allVehicles;
 closeModal();
 if (format === "excel") {
 await exportKendaraanExcel(targets);
 } else {
 exportKendaraanWord(targets);
 }
 };
 }
 }

 // -------------------------------------------------------------
 // 6. EVENT BINDINGS & TAB SWITCHING
  // -------------------------------------------------------------
  const btnDocGenHeader = container.querySelector("#btn-open-doc-generator-header");
  const btnExportDocGenMenu = container.querySelector("#btn-export-doc-gen-menu");

  if (btnDocGenHeader) {
    btnDocGenHeader.onclick = () => {
      openVehicleDocGeneratorModal(allVehicles[0] || null, "KUASA");
    };
  }

  if (btnExportDocGenMenu) {
    btnExportDocGenMenu.onclick = () => {
      if (exportMenu) exportMenu.classList.add("hidden");
      openVehicleDocGeneratorModal(allVehicles[0] || null, "KUASA");
    };
  }

  if (canEdit) {
    btnAdd.onclick = () => openVehicleFormModal();
  } else if (btnAdd) {
    btnAdd.classList.add("hidden");
  }
  searchInput.oninput = () => renderVehicleCards();
  statusFilter.onchange = () => renderVehicleCards();

  // Export Dropdown & Action Buttons
  if (btnExportMenu && exportMenu) {
    btnExportMenu.onclick = (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle("hidden");
    };
    document.addEventListener("click", (e) => {
      if (!exportMenu.contains(e.target) && e.target !== btnExportMenu && !btnExportMenu.contains(e.target)) {
        exportMenu.classList.add("hidden");
      }
    });
  }

  if (btnExportExcel) {
    btnExportExcel.onclick = async () => {
      if (exportMenu) exportMenu.classList.add("hidden");
      await exportKendaraanExcel();
    };
  }

  if (btnExportWord) {
    btnExportWord.onclick = () => {
      if (exportMenu) exportMenu.classList.add("hidden");
      exportKendaraanWord();
    };
  }

  if (btnExportOptions) {
    btnExportOptions.onclick = () => {
      if (exportMenu) exportMenu.classList.add("hidden");
      openExportOptionsModal();
    };
  }

  container.querySelectorAll(".kd-tab").forEach(btn => {
 btn.addEventListener("click", async () => {
 const tab = btn.dataset.ktab;
 
 Object.keys(panels).forEach(k => {
 panels[k].classList.toggle("hidden", k !== tab);
 });

 container.querySelectorAll(".kd-tab").forEach(b => {
 const isCurrent = b === btn;
 b.classList.toggle("bg-white", isCurrent);
 b.classList.toggle("text-maroon-700", isCurrent);
 b.classList.toggle("font-bold", isCurrent);
 b.classList.toggle("shadow-sm", isCurrent);
 b.classList.toggle("text-slate-600", !isCurrent);
 b.classList.toggle("font-semibold", !isCurrent);
 });

 if (tab === "bbm" && !loadedTables.bbm) {
 loadedTables.bbm = true;
 await renderCrudModule(panels.bbm, {
 title: "Seluruh Log Pengisian BBM Armada",
 collectionName: COL.LOG_KENDARAAN_FUEL,
 idPrefix: "FUEL",
 canCreate: false,
 canEdit: false,
 searchFields: ["no_polisi", "nama_driver"],
 columns: [
 { key: "tanggal", label: "Tanggal", type: "date" },
 { key: "no_polisi", label: "No. Polisi" },
 { key: "nama_driver", label: "Driver" },
 { key: "km_awal", label: "KM Awal", type: "number" },
 { key: "km_akhir", label: "KM Akhir", type: "number" },
 { key: "liter", label: "Liter", type: "number" },
 { key: "total_biaya", label: "Biaya", type: "currency" },
 ]
 });
 }

 if (tab === "service" && !loadedTables.service) {
 loadedTables.service = true;
 await renderCrudModule(panels.service, {
 title: "Seluruh Log Service & Perbaikan Armada",
 collectionName: COL.LOG_KENDARAAN_SERVICE,
 idPrefix: "SVC",
 canCreate: false,
 canEdit: false,
 searchFields: ["no_polisi", "nama_driver", "vendor"],
 columns: [
 { key: "tanggal", label: "Tanggal", type: "date" },
 { key: "no_polisi", label: "No. Polisi" },
 { key: "jenis_dokumen", label: "Rincian" },
 { key: "vendor", label: "Vendor / Bengkel" },
 { key: "total_biaya", label: "Biaya", type: "currency" },
 ]
 });
 }

 if (tab === "pajak" && !loadedTables.pajak) {
 loadedTables.pajak = true;
 await renderCrudModule(panels.pajak, {
 title: "Seluruh Log Pajak, STNK & Uji KIR",
 collectionName: COL.LOG_KENDARAAN_COMPLIANCE,
 idPrefix: "CMP",
 canCreate: false,
 canEdit: false,
 searchFields: ["no_polisi", "jenis_pajak"],
 columns: [
 { key: "tanggal_bayar", label: "Tgl Bayar", type: "date" },
 { key: "no_polisi", label: "No. Polisi" },
 { key: "jenis_pajak", label: "Jenis" },
 { key: "berlaku_hingga", label: "Berlaku Hingga", type: "date" },
 { key: "total_biaya", label: "Biaya", type: "currency" },
 { key: "dokumen_url", label: "Dokumen", type: "link" },
 ]
 });
 }
 });
 });

 await loadAllData();
 return { unmount() {} };
}
