import { db, COL, doc, getDoc, setDoc, query, collection, where, getDocs, deleteDoc } from "../firebase-config.js";
import { fsGetAll, openModal, closeModal, toast, fmtDateShort, fmtRupiah, escapeHtml, genId, notifyUser, getTargetsForRole, confirmDialog, downloadHtmlAsPdf } from "../utils.js";
import { uploadFileToDrive } from "../gas-integration.js";
import { badge } from "../components.js";
import { hasSubMenuAccess } from "../auth.js";
import { isoDocHeaderTable } from "../branding.js";

const DEFAULT_KASBON_CATEGORIES = [
 {
  id: "SPP_SEKOLAH",
  name: "Pembayaran SPP / Biaya Sekolah Anak",
  need_file: true,
  file_label: "Surat Tagihan Resmi Sekolah & Bukti Kwitansi Pembayaran",
  multiple_files: true,
  min_files: 2,
  description: "Wajib melampirkan minimal 2 dokumen: Surat tagihan resmi sekolah/kampus dan bukti rincian kwitansi pembayaran biaya pendidikan anak."
 },
 {
  id: "PERALATAN_SEKOLAH",
  name: "Pembelian Keperluan & Peralatan Sekolah / Kerja",
  need_file: true,
  file_label: "Nota / Kwitansi Pembelian Alat & Rincian Estimasi",
  multiple_files: true,
  min_files: 2,
  description: "Sistem Reimbursement: Pengajuan kasbon memerlukan minimal 2 lampiran (Nota pembelian asli + Bukti fisik alat / rincian pendukung)."
 },
 {
  id: "KESEHATAN_DARURAT",
  name: "Pengobatan & Darurat Kesehatan",
  need_file: true,
  file_label: "Kwitansi Berobat / Rincian Medis RS",
  multiple_files: false,
  min_files: 1,
  description: "Wajib melampirkan kwitansi pembayaran atau rincian kuitansi biaya pengobatan dari rumah sakit / klinik."
 },
 {
  id: "RENOVASI_MUSIBAH",
  name: "Renovasi Rumah / Bencana Alam / Musibah",
  need_file: true,
  file_label: "Foto Kerusakan & Estimasi Biaya",
  multiple_files: true,
  min_files: 2,
  description: "Melampirkan minimal 2 bukti dokumen: Foto kondisi fisik kerusakan + Rincian RAB estimasi perbaikan."
 },
 {
  id: "LAINNYA_MENDESAK",
  name: "Kebutuhan Mendesak Lainnya",
  need_file: false,
  multiple_files: false,
  min_files: 0,
  file_label: "Lampiran Pendukung (Opsional)",
  description: "Jelaskan alasan kebutuhan mendesak secara rinci pada kolom alasan."
 }
];

export async function mount(container, { session }) {
 const roleIsHrd = ["HRD", "SUPERADMIN", "FINANCE", "MANAGER", "SPV", "DIREKTUR", "BRANCH MANAGER"].includes((session.role || "").toUpperCase());
 const isHrd = roleIsHrd || await hasSubMenuAccess("pengajuan-kasbon", "pengaturan_kategori", session);

 const btnSettings = container.querySelector("#btn-kasbon-settings");
 const btnOpen = container.querySelector("#btn-open-kasbon-modal");
 const tblBody = container.querySelector("#tbl-my-kasbon");
 const elTenure = container.querySelector("#st-tenure-badge");
 const elLoan = container.querySelector("#st-loan-badge");
 const hrdTabBar = container.querySelector("#hrd-kasbon-tab-bar");
 const countPendingBadge = container.querySelector("#badge-count-pending");
 const filterStatus = container.querySelector("#kasbon-filter-status");
 const searchInput = container.querySelector("#kasbon-search-input");
 const tableTitle = container.querySelector("#kasbon-table-title");
 const tableSubtitle = container.querySelector("#kasbon-table-subtitle");

 if (isHrd) {
  if (btnSettings) btnSettings.classList.remove("hidden");
  if (hrdTabBar) hrdTabBar.classList.remove("hidden");
 }

 let categories = DEFAULT_KASBON_CATEGORIES;
 let allKasbonRecords = [];
 let displayKasbonRecords = [];
 let activeTab = isHrd ? "all" : "my"; // Default tab for HRD is "all"

 // Toggle HRD Tabs
 if (isHrd && hrdTabBar) {
  const tabs = hrdTabBar.querySelectorAll(".tab-kasbon-btn");
  tabs.forEach(btn => {
   btn.onclick = () => {
    activeTab = btn.dataset.tab;
    tabs.forEach(b => {
     const isCurrent = b.dataset.tab === activeTab;
     b.classList.toggle("border-maroon-700", isCurrent);
     b.classList.toggle("text-maroon-700", isCurrent);
     b.classList.toggle("font-bold", isCurrent);
     b.classList.toggle("border-transparent", !isCurrent);
     b.classList.toggle("text-slate-500", !isCurrent);
     b.classList.toggle("font-semibold", !isCurrent);
    });
    applyFilterAndRender();
   };
  });
 }

 async function loadData() {
  try {
   // 1. Fetch Categories from APP_SETTINGS
   try {
    const setSnap = await getDoc(doc(db, COL.APP_SETTINGS, "kasbon_categories"));
    if (setSnap.exists() && Array.isArray(setSnap.data().items) && setSnap.data().items.length) {
     categories = setSnap.data().items;
    }
   } catch (e) {
    console.warn("Using default kasbon categories");
   }

   // 2. Fetch Employee's Tenure & Active Loans
   let tenureMonths = 12;
   if (session.nik) {
    const kSnap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik))).catch(() => null);
    if (kSnap && kSnap.exists()) {
     const k = kSnap.data();
     if (k.tanggal_masuk) {
      const joinDate = new Date(k.tanggal_masuk);
      const now = new Date();
      tenureMonths = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
     }
    }
   }

   if (tenureMonths < 12) {
    elTenure.innerHTML = `<span class="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold">Masa Kerja < 1 Tahun (${tenureMonths} Bln)</span>`;
   } else {
    elTenure.innerHTML = `<span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">Lolos (Masa Kerja ${Math.floor(tenureMonths / 12)} Thn ${tenureMonths % 12} Bln)</span>`;
   }

   // 3. Fetch Kasbon Records
   allKasbonRecords = await fsGetAll(COL.LOG_KASBON).catch(() => []);
   
   // Sort by newest
   allKasbonRecords.sort((a, b) => new Date(b.createdAt || b.tanggal || 0) - new Date(a.createdAt || a.tanggal || 0));

   // Check Active Loans for current user
   const myLoans = allKasbonRecords.filter(r => (r.pemohon || r.nama_pemohon || "").toLowerCase() === (session.nama || "").toLowerCase());
   const hasActiveLoan = myLoans.some(r => {
    const st = (r.status || "").toUpperCase();
    const stLunas = (r.status_lunas || "").toUpperCase();
    return (st.includes("PENDING") || st.includes("SETUJU") || st.includes("APPROVED")) && stLunas !== "LUNAS";
   });

   if (hasActiveLoan) {
    elLoan.innerHTML = `<span class="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg text-xs font-bold">Ada Pinjaman Aktif</span>`;
   } else {
    elLoan.innerHTML = `<span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">Bebas Pinjaman Aktif</span>`;
   }

   // Count Pending for HRD
   const pendingCount = allKasbonRecords.filter(r => (r.status || "PENDING").toUpperCase().includes("PENDING")).length;
   if (pendingCount > 0 && countPendingBadge) {
    countPendingBadge.textContent = `${pendingCount} Pending`;
    countPendingBadge.classList.remove("hidden");
   } else if (countPendingBadge) {
    countPendingBadge.classList.add("hidden");
   }

   applyFilterAndRender();
  } catch (err) {
   console.error("Error loading kasbon data:", err);
   tblBody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-rose-500">Gagal memuat data kasbon: ${escapeHtml(err.message)}</td></tr>`;
  }
 }

 function applyFilterAndRender() {
  let list = [...allKasbonRecords];

  if (activeTab === "my") {
   list = list.filter(r => (r.pemohon || r.nama_pemohon || "").toLowerCase() === (session.nama || "").toLowerCase());
   if (tableTitle) tableTitle.textContent = "Riwayat & Status Pengajuan Kasbon Saya";
   if (tableSubtitle) tableSubtitle.textContent = "Daftar pengajuan pinjaman kasbon pribadi dan status persetujuan.";
  } else {
   if (tableTitle) tableTitle.textContent = "Kelola Pengajuan Kasbon Karyawan";
   if (tableSubtitle) tableSubtitle.textContent = "Seluruh data pengajuan kasbon staf, verifikasi berkas, persetujuan HRD, dan status pelunasan.";
  }

  // Filter status
  const stVal = (filterStatus ? filterStatus.value : "ALL").toUpperCase();
  if (stVal !== "ALL") {
   list = list.filter(r => {
    const st = (r.status || "PENDING").toUpperCase();
    const stLunas = (r.status_lunas || "").toUpperCase();
    if (stVal === "PENDING") return st.includes("PENDING");
    if (stVal === "APPROVED") return st.includes("SETUJU") || st.includes("APPROVED");
    if (stVal === "REJECTED") return st.includes("TOLAK") || st.includes("REJECTED");
    if (stVal === "LUNAS") return stLunas === "LUNAS";
    return true;
   });
  }

  // Filter search
  const qVal = (searchInput ? searchInput.value : "").trim().toLowerCase();
  if (qVal) {
   list = list.filter(r => 
    (r.no_referensi || r.id || "").toLowerCase().includes(qVal) ||
    (r.pemohon || r.nama_pemohon || "").toLowerCase().includes(qVal) ||
    (r.kategori_kasbon || "").toLowerCase().includes(qVal) ||
    (r.alasan || "").toLowerCase().includes(qVal)
   );
  }

  displayKasbonRecords = list;
  renderTable();
 }

 if (filterStatus) filterStatus.onchange = applyFilterAndRender;
 if (searchInput) searchInput.oninput = applyFilterAndRender;

 function renderTable() {
  if (!displayKasbonRecords.length) {
   tblBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Tidak ada data pengajuan kasbon yang sesuai.</td></tr>`;
   return;
  }

  tblBody.innerHTML = displayKasbonRecords.map(r => {
   const st = (r.status || "PENDING").toUpperCase();
   const stLunas = (r.status_lunas || "").toUpperCase();
   
   let stBadge = badge("Pending HRD", "amber");
   if (stLunas === "LUNAS") stBadge = badge("Lunas", "blue");
   else if (st.includes("SETUJU") || st.includes("APPROVED")) stBadge = badge("Disetujui HRD", "green");
   else if (st.includes("TOLAK") || st.includes("REJECTED")) stBadge = badge("Ditolak", "red");

   const urls = (r.lampiran_url || "").split(",").map(s => s.trim()).filter(Boolean);
   let docLink = `<span class="text-slate-400 text-[11px]">-</span>`;
   if (urls.length > 0) {
    docLink = urls.map((u, i) => `
    <a href="${u}" target="_blank" rel="noopener" class="inline-block px-2 py-0.5 text-[10px] font-bold bg-maroon-50 text-maroon-700 hover:bg-maroon-100 rounded border border-maroon-200 mr-1 mb-1 transition">
     Berkas ${urls.length > 1 ? i + 1 : ''}
    </a>
    `).join("");
   }

   return `
   <tr class="hover:bg-slate-50 transition">
    <td class="p-3 font-mono font-bold text-slate-800">${escapeHtml(r.no_referensi || r.id)}</td>
    <td class="p-3">
     <span class="font-bold text-slate-800 block">${escapeHtml(r.pemohon || r.nama_pemohon || "-")}</span>
     <span class="text-[10.5px] text-slate-400 font-mono">${escapeHtml(r.nik_pemohon || r.cabang || "-")}</span>
    </td>
    <td class="p-3">
     <span class="font-bold text-slate-800 block">${escapeHtml(r.kategori_kasbon || "Kasbon Routine")}</span>
     <span class="text-[11px] text-slate-500 truncate max-w-[180px] block">${escapeHtml(r.alasan || "-")}</span>
    </td>
    <td class="p-3 font-medium text-slate-700 whitespace-nowrap">${fmtDateShort(r.createdAt || r.tanggal)}</td>
    <td class="p-3 whitespace-nowrap">
     <span class="font-bold font-mono text-slate-900 block">${fmtRupiah(r.nominal)}</span>
     <span class="text-[11px] text-slate-500">Tenor: ${r.tenor_bulan || 1} Bln (${fmtRupiah(r.cicilan_per_bulan || (r.nominal / (r.tenor_bulan || 1)))})</span>
    </td>
    <td class="p-3">${docLink}</td>
    <td class="p-3 whitespace-nowrap">${stBadge}</td>
    <td class="p-3 text-center whitespace-nowrap space-x-1">
     <button data-id="${r.id}" class="btn-view-detail-kasbon px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition">
      Detail & HRD
     </button>
    </td>
   </tr>`;
  }).join("");

  tblBody.querySelectorAll(".btn-view-detail-kasbon").forEach(btn => {
   btn.onclick = () => {
    const item = allKasbonRecords.find(x => x.id === btn.dataset.id);
    if (item) openDetailModal(item);
   };
  });
 }

 function openDetailModal(item) {
  const urls = (item.lampiran_url || "").split(",").map(s => s.trim()).filter(Boolean);
  const st = (item.status || "PENDING").toUpperCase();
  const stLunas = (item.status_lunas || "").toUpperCase();

  openModal({
   title: `Detail Kasbon — ${item.no_referensi || item.id}`,
   size: "lg",
   bodyHtml: `
   <div class="space-y-4 text-left text-xs">
    <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
     <div class="flex justify-between items-center"><span class="text-slate-500">Nama Pemohon:</span><span class="font-bold text-slate-800 text-sm">${escapeHtml(item.pemohon || item.nama_pemohon)}</span></div>
     <div class="flex justify-between items-center"><span class="text-slate-500">NIK / Cabang:</span><span class="font-mono font-semibold text-slate-700">${escapeHtml(item.nik_pemohon || '-')} / ${escapeHtml(item.cabang || '-')}</span></div>
     <div class="flex justify-between items-center"><span class="text-slate-500">Kategori Kasbon:</span><span class="font-bold text-maroon-700">${escapeHtml(item.kategori_kasbon)}</span></div>
     <div class="flex justify-between items-center"><span class="text-slate-500">Nominal Disetujui:</span><span class="font-bold font-mono text-slate-900 text-base">${fmtRupiah(item.nominal)}</span></div>
     <div class="flex justify-between items-center"><span class="text-slate-500">Tenor Angsuran:</span><span class="font-semibold text-slate-800">${item.tenor_bulan || 1} Bulan</span></div>
     <div class="flex justify-between items-center"><span class="text-slate-500">Cicilan Per Bulan:</span><span class="font-mono font-bold text-slate-800">${fmtRupiah((item.nominal || 0) / (item.tenor_bulan || 1))}</span></div>
     <div class="flex justify-between items-center"><span class="text-slate-500">Tanggal Pengajuan:</span><span class="font-medium text-slate-700">${fmtDateShort(item.createdAt || item.tanggal)}</span></div>
    </div>

    <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1">
     <span class="text-slate-500 block font-bold">Alasan Pengajuan & Keperluan Dana:</span>
     <p class="text-slate-800 leading-relaxed text-xs">${escapeHtml(item.alasan || '-')}</p>
    </div>

    ${urls.length > 0 ? `
    <div class="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 space-y-2">
     <span class="font-bold text-emerald-900 block">Bukti File Persyaratan (${urls.length} Berkas):</span>
     <div class="flex flex-wrap gap-2">
      ${urls.map((u, i) => `
      <a href="${u}" target="_blank" rel="noopener" class="px-3 py-1.5 bg-emerald-700 text-white rounded-xl font-bold text-xs hover:bg-emerald-800 transition flex items-center gap-1.5 shadow-xs">
       <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
       <span>Buka Berkas ${urls.length > 1 ? i + 1 : ''}</span>
      </a>
      `).join('')}
     </div>
    </div>` : ''}

    <!-- PANEL KONTROL MANAJEMEN / HRD -->
    ${isHrd ? `
    <div class="p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl space-y-3">
     <div class="flex items-center justify-between border-b border-amber-200/60 pb-2">
      <span class="font-bold text-amber-900 text-xs">Panel Aksi HRD & Keuangan</span>
      <span class="text-[11px] font-mono font-bold text-amber-800">Status Saat Ini: ${stLunas === "LUNAS" ? "LUNAS" : st}</span>
     </div>
     <div class="flex flex-wrap gap-2">
      ${!st.includes("SETUJU") && stLunas !== "LUNAS" ? `
      <button id="btn-hrd-approve" class="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition shadow-xs">
       ✓ Setujui Kasbon
      </button>` : ''}
      
      ${!st.includes("TOLAK") && stLunas !== "LUNAS" ? `
      <button id="btn-hrd-reject" class="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs transition shadow-xs">
       ✕ Tolak Kasbon
      </button>` : ''}

      ${stLunas !== "LUNAS" ? `
      <button id="btn-hrd-lunas" class="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs transition shadow-xs">
       $ Tandai Sudah Lunas
      </button>` : `
      <span class="px-3 py-1.5 bg-blue-100 text-blue-900 font-bold rounded-xl text-xs">✓ Status Lunas</span>`}

      <button id="btn-hrd-print-pdf" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center gap-1.5">
       <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
       <span>Cetak PDF Form ISO</span>
      </button>

      <button id="btn-hrd-delete" class="px-3.5 py-2 bg-slate-200 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-bold rounded-xl text-xs transition">
       Hapus
      </button>
     </div>
    </div>` : `
    <div class="flex justify-end pt-2">
     <button id="btn-emp-print-pdf" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
      <span>Cetak Form Kasbon PDF</span>
     </button>
    </div>
    `}
   </div>`
  });

  // Action Handlers inside Detail Modal
  const btnApprove = document.getElementById("btn-hrd-approve");
  const btnReject = document.getElementById("btn-hrd-reject");
  const btnLunas = document.getElementById("btn-hrd-lunas");
  const btnPrintPdf = document.getElementById("btn-hrd-print-pdf") || document.getElementById("btn-emp-print-pdf");
  const btnDelete = document.getElementById("btn-hrd-delete");

  if (btnApprove) {
   btnApprove.onclick = async () => {
    if (await confirmDialog(`Setujui pengajuan kasbon sebesar ${fmtRupiah(item.nominal)} untuk ${item.pemohon}?`)) {
     const updated = { status: "DISETUJUHRD", status_final: "DISETUJUI", status_lunas: "BELUM LUNAS" };
     await Promise.all([
      setDoc(doc(db, COL.LOG_KASBON, item.id), updated, { merge: true }),
      setDoc(doc(db, COL.DATA_PENGAJUAN, item.id), updated, { merge: true })
     ]);
     toast("Kasbon berhasil disetujui HRD!", "success");
     closeModal();
     await loadData();
    }
   };
  }

  if (btnReject) {
   btnReject.onclick = async () => {
    const reason = prompt("Masukkan alasan penolakan kasbon:");
    if (reason !== null) {
     const updated = { status: "DITOLAK", status_final: "DITOLAK", catatan_hrd: reason };
     await Promise.all([
      setDoc(doc(db, COL.LOG_KASBON, item.id), updated, { merge: true }),
      setDoc(doc(db, COL.DATA_PENGAJUAN, item.id), updated, { merge: true })
     ]);
     toast("Kasbon ditolak.", "info");
     closeModal();
     await loadData();
    }
   };
  }

  if (btnLunas) {
   btnLunas.onclick = async () => {
    if (await confirmDialog(`Tandai kasbon ${item.pemohon} ini LUNAS hari ini?`)) {
     const updated = { status_lunas: "LUNAS", tanggal_lunas: new Date().toISOString() };
     await Promise.all([
      setDoc(doc(db, COL.LOG_KASBON, item.id), updated, { merge: true }),
      setDoc(doc(db, COL.DATA_PENGAJUAN, item.id), updated, { merge: true })
     ]);
     toast("Kasbon ditandai LUNAS!", "success");
     closeModal();
     await loadData();
    }
   };
  }

  if (btnPrintPdf) {
   btnPrintPdf.onclick = () => {
    printKasbonPdf(item);
   };
  }

  if (btnDelete) {
   btnDelete.onclick = async () => {
    if (await confirmDialog("Hapus data pengajuan kasbon ini dari sistem?")) {
     await Promise.all([
      deleteDoc(doc(db, COL.LOG_KASBON, item.id)).catch(() => {}),
      deleteDoc(doc(db, COL.DATA_PENGAJUAN, item.id)).catch(() => {})
     ]);
     toast("Data kasbon berhasil dihapus.", "success");
     closeModal();
     await loadData();
    }
   };
  }
 }

 async function printKasbonPdf(data) {
  const html = `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
  <div style="page-break-inside:avoid; margin-bottom:15px;">
  ${isoDocHeaderTable({ judul: "FORMULIR PENGAJUAN PINJAMAN / KASBON", noDok: "FIN-KSBN", terbitRevisi: "1/1", tglTerbit: "1 September 2025", hal: "1 dari 1" })}
  </div>
  <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #000; font-size:11px;">
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc; width: 35%;">Nama Karyawan Pemohon</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.pemohon || data.nama_pemohon)}</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">NIK / Cabang</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.nik_pemohon || "-")} / ${escapeHtml(data.cabang || "-")}</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Kategori Kasbon</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.kategori_kasbon || "-")}</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Tanggal Pengajuan</td><td style="border: 1px solid #000; padding: 6px 10px;">${fmtDateShort(data.createdAt || data.tanggal)}</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Nominal Pinjaman</td><td style="border: 1px solid #000; padding: 6px 10px;"><strong style="font-size:13px;">${fmtRupiah(data.nominal)}</strong> (Tenor: ${data.tenor_bulan || 1} Bulan)</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Keperluan / Alasan</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.alasan || "-")}</td></tr>
  </table>
  <div style="margin-top:15px; font-size:10px; border:1px solid #000; padding:8px 10px; line-height:1.4; page-break-inside:avoid;">
  <strong>Perjanjian:</strong> Dengan ini saya menyatakan meminjam uang perusahaan dan bersedia dipotong gaji setiap bulannya sebesar ${fmtRupiah((data.nominal || 0) / (data.tenor_bulan || 1))} selama ${data.tenor_bulan || 1} bulan untuk melunasi pinjaman tersebut sesuai kebijakan resmi CV Andela Jaya.
  </div>
  <table style="width:100%; text-align:center; margin-top:35px; page-break-inside:avoid; font-size:11px;">
  <tr><td width="33%">Peminjam,</td><td width="33%">Mengetahui (HRD),</td><td width="33%">Menyetujui (Finance),</td></tr>
  <tr><td height="60"></td><td></td><td></td></tr>
  <tr><td>( <strong>${escapeHtml(data.pemohon || data.nama_pemohon)}</strong> )</td><td>( ................................. )</td><td>( ................................. )</td></tr>
  </table>
  </div>`;
  await downloadHtmlAsPdf(html, `Form_Kasbon_${escapeHtml(data.pemohon || data.nama_pemohon).replace(/\s+/g, "_")}.pdf`);
  toast("PDF Form Kasbon berhasil diunduh!", "success");
 }

 // FORM MODAL PENGAJUAN KASBON
 function openFormKasbonModal() {
  openModal({
   title: "Formulir Pengajuan Kasbon Karyawan",
   size: "lg",
   bodyHtml: `
   <form id="form-kasbon-cat" class="space-y-4 text-left">
    ${isHrd ? `
    <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-900 mb-2 flex items-center justify-between">
     <span>Input Sebagai HRD/Admin untuk Karyawan Lain?</span>
     <label class="flex items-center gap-1.5 font-bold cursor-pointer">
      <input type="checkbox" id="fk-hrd-manual" class="w-4 h-4 rounded text-maroon-700"> Ya, Pilihkah Karyawan
     </label>
    </div>
    <div id="wrap-emp-picker" class="hidden">
     <label class="block text-xs font-bold text-slate-800 mb-1">Pilih Karyawan Pemohon *</label>
     <select id="fk-emp-name" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-semibold text-slate-800 bg-white">
      <option value="">Pilih Karyawan...</option>
     </select>
    </div>` : ''}

    <!-- KATEGORI KASBON -->
    <div>
     <label class="block text-xs font-bold text-slate-800 mb-1">Pilih Kategori Kasbon HRD *</label>
     <select id="fk-kategori" required class="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-semibold text-slate-800 bg-slate-50">
      <option value="">-- Pilih Kategori Penggunaan Kasbon --</option>
      ${categories.map(c => `<option value="${c.id}">${c.name} ${c.multiple_files ? ' (Wajib >1 Lampiran)' : ''}</option>`).join("")}
     </select>
    </div>

    <!-- GUIDANCE & FILE UPLOAD -->
    <div id="fk-guide-wrap" class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 hidden">
     <div class="flex items-start gap-2">
      <span class="text-amber-600 text-base">ℹ️</span>
      <div>
       <h5 class="font-bold text-xs text-amber-900" id="fk-guide-title">Ketentuan Kategori</h5>
       <p class="text-[11px] text-amber-800 mt-0.5 leading-relaxed" id="fk-guide-desc">-</p>
      </div>
     </div>

     <div id="fk-upload-wrap" class="pt-2 border-t border-amber-200/80">
      <label class="block text-xs font-bold text-amber-900 mb-1" id="fk-upload-label">Upload Berkas Persyaratan *</label>
      <input type="file" id="fk-file" accept="image/*,.pdf" multiple class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-maroon-700 file:text-white hover:file:bg-maroon-800">
      <p class="text-[10px] text-amber-700 mt-1" id="fk-upload-hint">Tekan Ctrl/Shift saat memilih file untuk melampirkan lebih dari 1 dokumen.</p>
     </div>
    </div>

    <!-- NOMINAL & TENOR -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
     <div>
      <label class="block text-xs font-bold text-slate-800 mb-1">Nominal Kasbon Diajukan (Rp) *</label>
      <input type="number" id="fk-nominal" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-mono font-bold text-maroon-700" placeholder="Cth: 2000000">
     </div>
     <div>
      <label class="block text-xs font-bold text-slate-800 mb-1">Tenor Angsuran (Bulan) *</label>
      <select id="fk-tenor" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-semibold text-slate-800">
       <option value="1">1 Bulan (Potong Gaji Bulan Depan)</option>
       <option value="2">2 Bulan</option>
       <option value="3">3 Bulan</option>
       <option value="6">6 Bulan</option>
      </select>
     </div>
    </div>

    <!-- REASON -->
    <div>
     <label class="block text-xs font-bold text-slate-800 mb-1">Alasan Pengajuan & Rincian Kebutuhan *</label>
     <textarea id="fk-alasan" rows="3" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400" placeholder="Jelaskan secara rinci penggunaan dana kasbon..."></textarea>
    </div>

    <div class="pt-3 flex justify-end gap-2 border-t border-slate-100">
     <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
     <button type="submit" id="btn-submit-kasbon" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow-xs flex items-center gap-2">
      Kirim Pengajuan Kasbon
     </button>
    </div>
   </form>`
  });

  const catSelect = document.getElementById("fk-kategori");
  const guideWrap = document.getElementById("fk-guide-wrap");
  const guideTitle = document.getElementById("fk-guide-title");
  const guideDesc = document.getElementById("fk-guide-desc");
  const uploadLabel = document.getElementById("fk-upload-label");
  const uploadHint = document.getElementById("fk-upload-hint");
  const fileInput = document.getElementById("fk-file");
  const hrdManualChk = document.getElementById("fk-hrd-manual");
  const empPickerWrap = document.getElementById("wrap-emp-picker");
  const empSelect = document.getElementById("fk-emp-name");

  if (hrdManualChk && empSelect) {
   hrdManualChk.onchange = async () => {
    if (hrdManualChk.checked) {
     empPickerWrap.classList.remove("hidden");
     empSelect.required = true;
     if (empSelect.options.length <= 1) {
      const emps = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);
      empSelect.innerHTML = `<option value="">Pilih Karyawan...</option>` + emps.map(k => `
       <option value="${escapeHtml(k.nama_karyawan || k.nama)}" data-nik="${escapeHtml(k.nik_karyawan || k.nik || '')}" data-cabang="${escapeHtml(k.cabang || '-')}">
        ${escapeHtml(k.nama_karyawan || k.nama)} (${escapeHtml(k.nik_karyawan || k.nik || 'No NIK')})
       </option>
      `).join("");
     }
    } else {
     empPickerWrap.classList.add("hidden");
     empSelect.required = false;
    }
   };
  }

  catSelect.onchange = () => {
   const val = catSelect.value;
   const catObj = categories.find(c => c.id === val);
   if (!catObj) {
    guideWrap.classList.add("hidden");
    fileInput.required = false;
    return;
   }

   guideWrap.classList.remove("hidden");
   guideTitle.textContent = catObj.name;
   guideDesc.textContent = catObj.description || "Harus melampirkan berkas bukti fisik sesuai kategori yang dipilih.";

   const isMulti = catObj.multiple_files || (catObj.min_files && catObj.min_files > 1);

   if (isMulti) {
    uploadLabel.textContent = `Upload Berkas Persyaratan (Wajib Minimal ${catObj.min_files || 2} File Lampiran) *`;
    uploadHint.textContent = "Kategori ini memerlukan lebih dari 1 lampiran dokumen bukti fisik. Gunakan Ctrl/Shift saat memilih file.";
    fileInput.required = true;
   } else {
    uploadLabel.textContent = `${catObj.file_label || 'Upload Berkas Persyaratan'} ${catObj.need_file ? '*' : '(Opsional)'}`;
    uploadHint.textContent = "Lampirkan berkas bukti pendukung dalam format Gambar/PDF.";
    fileInput.required = !!catObj.need_file;
   }
  };

  document.getElementById("form-kasbon-cat").onsubmit = async (e) => {
   e.preventDefault();
   const btnSubmit = document.getElementById("btn-submit-kasbon");

   const catVal = catSelect.value;
   const catObj = categories.find(c => c.id === catVal) || {};
   const isMulti = catObj.multiple_files || (catObj.min_files && catObj.min_files > 1);

   if (isMulti && fileInput.files.length < (catObj.min_files || 2)) {
    toast(`Kategori ini mengharuskan Anda melampirkan minimal ${catObj.min_files || 2} berkas/file lampiran!`, "warning");
    return;
   }

   btnSubmit.disabled = true;
   btnSubmit.textContent = "Mengupload & Menyimpan...";

   try {
    let targetPemohon = session.nama;
    let targetNik = session.nik || "";
    let targetCabang = session.cabang || "-";

    if (hrdManualChk && hrdManualChk.checked && empSelect && empSelect.value) {
     targetPemohon = empSelect.value;
     const selectedOpt = empSelect.options[empSelect.selectedIndex];
     targetNik = selectedOpt ? selectedOpt.dataset.nik : "";
     targetCabang = selectedOpt ? selectedOpt.dataset.cabang : "-";
    }

    let uploadedUrls = [];
    if (fileInput.files && fileInput.files.length > 0) {
     for (let i = 0; i < fileInput.files.length; i++) {
      const url = await uploadFileToDrive(fileInput.files[i], `Kasbon/${targetPemohon}`);
      if (url) uploadedUrls.push(url);
     }
    }
    const uploadedUrl = uploadedUrls.join(", ");

    const nominal = parseFloat(document.getElementById("fk-nominal").value) || 0;
    const tenor = parseInt(document.getElementById("fk-tenor").value) || 1;
    const refNo = genId("KSB");
    const nowIso = new Date().toISOString();

    const payload = {
     id: refNo,
     no_referensi: refNo,
     tipe_form: "KASBON",
     id_form: "KASBON",
     nama_form: "Pengajuan Kasbon Karyawan",
     pemohon: targetPemohon,
     nama_pemohon: targetPemohon,
     nik_pemohon: targetNik,
     cabang: targetCabang,
     kategori_kasbon: catObj.name || catVal,
     nominal,
     tenor_bulan: tenor,
     cicilan_per_bulan: nominal / tenor,
     alasan: document.getElementById("fk-alasan").value.trim(),
     lampiran_url: uploadedUrl,
     approval_flow: ["HRD", "FINANCE"],
     approval_steps: [isHrd ? "APPROVED" : "PENDING", "PENDING"],
     status_final: isHrd ? "DISETUJUI" : "MENUNGGU",
     status: isHrd ? "DISETUJUHRD" : "PENDING",
     createdAt: nowIso
    };

    await Promise.all([
     setDoc(doc(db, COL.LOG_KASBON, refNo), payload),
     setDoc(doc(db, COL.DATA_PENGAJUAN, refNo), payload)
    ]);

    toast("Pengajuan kasbon berhasil dikirim!", "success");
    closeModal();
    await loadData();
   } catch (err) {
    console.error("Error submitting kasbon:", err);
    toast(`Gagal mengirim kasbon: ${err.message}`, "error");
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Kirim Pengajuan Kasbon";
   }
  };
 }

 // CATEGORY MANAGER MODAL FOR HRD
 function openCategoryManagerModal() {
  openModal({
   title: "Kelola Kategori & Persyaratan Kasbon HRD",
   size: "lg",
   bodyHtml: `
   <div class="space-y-4 text-left">
    <p class="text-xs text-slate-500">Atur kategori kasbon, petunjuk aturan, dan jumlah berkas yang wajib dilampirkan oleh karyawan.</p>

    <div class="space-y-3 max-h-[350px] overflow-y-auto pr-1" id="cat-list-wrap">
     ${categories.map((c, idx) => `
     <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
      <div class="flex items-center justify-between">
       <span class="font-bold text-slate-800">${escapeHtml(c.name)}</span>
       <span class="px-2 py-0.5 rounded-md ${c.multiple_files ? 'bg-purple-100 text-purple-800' : c.need_file ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'} text-[10px] font-bold">
        ${c.multiple_files ? 'Wajib >1 Lampiran' : c.need_file ? 'Wajib Upload File' : 'Upload Opsional'}
       </span>
      </div>
      <p class="text-slate-600 text-[11px] leading-relaxed">${escapeHtml(c.description || '-')}</p>
     </div>
     `).join("")}
    </div>
   </div>`
  });
 }

 if (btnOpen) btnOpen.onclick = openFormKasbonModal;
 if (btnSettings) btnSettings.onclick = openCategoryManagerModal;

 await loadData();
 return { unmount() {} };
}
