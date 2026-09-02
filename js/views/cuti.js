import { db, COL, collection, getDocs, doc, setDoc, getDoc, updateDoc, query, where } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, toNumber, escapeHtml, genId, fmtDateShort, confirmDialog, sendEmailNotif, buildStandardEmailHtml, notifyUser, getTargetsForRole, generateAndSaveCutiDocument, printFormCutiFisik, downloadFormCutiPdf, generateStandardFormCutiHtml, smartParseDate, getCalculatedJatahCuti, getCarryoverPercentage, calculateCarryoverJatah, ensureXlsxLoaded, getCutiDeductionCategory } from "../utils.js";
import { avatar, emptyState, skeletonRows, badge } from "../components.js";
import { FULL_ACCESS_ROLES, ATASAN_VIEW_ROLES, getBawahanNames } from "../auth.js";
import { COMPANY_NAME, logoImgTag, isoDocHeaderTable } from "../branding.js";
import { generateCutiDocViaGAS } from "../gas-integration.js";

const DEFAULT_LEAVE_TYPES = [
 { id: "C", name: "Cuti Tahunan", potong: "Tahunan", count: 1 },
 { id: "C1/2", name: "Cuti Setengah Hari", potong: "Tahunan", count: 0.5 },
 { id: "C+", name: "Cuti Khusus", potong: "Khusus", count: 1 },
 { id: "C+I", name: "Izin (Cuti Khusus)", potong: "Tidak Dipotong", count: 0 },
 { id: "S", name: "Sakit dgn Surat Dokter", potong: "Tidak Dipotong", count: 0 },
 { id: "S-", name: "Sakit tanpa Surat Dokter", potong: "Tahunan", count: 1 },
 { id: "CB", name: "Cuti Bersama", potong: "Tahunan", count: 1 },
 { id: "C-", name: "Cuti Potong Gaji", potong: "Potong Gaji", count: 1 },
 { id: "CS", name: "Cuti Sisa", potong: "Akumulasi", count: 1 },
 { id: "C+1/2", name: "Cuti Khusus Setengah Hari", potong: "Khusus", count: 0.5 },
 { id: "D", name: "Dinas Luar Kota", potong: "Tidak Dipotong", count: 0 },
 { id: "C-BESAR", name: "Cuti Besar", potong: "Tidak Dipotong", count: 0 }
];

export async function mount(container, { session }) {
 // Load library XLSX jika belum ter-load untuk fitur import Excel
 if (!window.XLSX) {
 const script = document.createElement('script');
 script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
 document.head.appendChild(script);
 }

 const role = (session.role || "").toUpperCase();
 const isFullAccess = FULL_ACCESS_ROLES.includes(role);
 const isAtasanView = !isFullAccess && ATASAN_VIEW_ROLES.includes(role);
 const canManage = isFullAccess; // hanya HRD/SUPERADMIN/DIREKTUR yang boleh atasi/edit/import/reset

 container.innerHTML = `
 <div class="max-w-7xl mx-auto space-y-6 pb-10">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
 <div>
 <h1 class="text-2xl font-bold text-slate-800">Manajemen Cuti</h1>
 <p class="text-sm text-slate-500 mt-1">${canManage ? "Kelola jatah cuti, input izin manual, cetak form fisik, ekspor data Excel, serta kalkulasi reset & import." : "Mode lihat saja — hanya menampilkan karyawan yang menjadi bawahan Anda."}</p>
 </div>
 <div class="flex flex-wrap items-center gap-2">
 ${canManage ? `
 <button id="btn-setting-cuti" class="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
 Atur Jenis Cuti
 </button>` : ""}
 </div>
 </div>

 <!-- FILTER & EXPORT BAR (TARIK RIWAYAT & JATAH EXCEL SESUAI FILTER CABANG & PERIODE TANGGAL) -->
 <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
   <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
     <!-- FILTER CONTROLS -->
     <div class="flex flex-wrap items-end gap-3">
       <div>
         <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
           <i class="fa-solid fa-building-user text-slate-400 mr-1"></i> Filter Cabang
         </label>
         <select id="cuti-filter-cabang" class="bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 pl-3 pr-8 py-2 rounded-xl border border-slate-200 focus:border-maroon-500 outline-none transition cursor-pointer min-w-[170px]">
           <option value="">Semua Cabang</option>
         </select>
       </div>

       <div>
         <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
           <i class="fa-solid fa-calendar-days text-slate-400 mr-1"></i> Dari Tanggal
         </label>
         <input type="date" id="cuti-filter-start-date" class="bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl border border-slate-200 focus:border-maroon-500 outline-none transition cursor-pointer">
       </div>

       <div>
         <label class="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
           <i class="fa-solid fa-calendar-days text-slate-400 mr-1"></i> Sampai Tanggal
         </label>
         <input type="date" id="cuti-filter-end-date" class="bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl border border-slate-200 focus:border-maroon-500 outline-none transition cursor-pointer">
       </div>

       <button id="btn-reset-filter" class="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center gap-1.5" title="Reset filter cabang dan tanggal">
         <i class="fa-solid fa-rotate-left"></i> Reset
       </button>
     </div>

     <!-- TOMBOL EXPORT EXCEL -->
     <div class="flex flex-wrap items-center gap-2.5 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100">
       <!-- TARIK RIWAYAT CUTI EXCEL -->
       <button id="btn-export-riwayat-excel" class="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2" title="Tarik seluruh data riwayat cuti karyawan format Excel (.xlsx) berdasarkan filter cabang dan periode tanggal">
         <i class="fa-solid fa-file-excel text-sm"></i>
         <span>Tarik Riwayat Cuti (Excel)</span>
       </button>

       <!-- TARIK JATAH CUTI TERAKHIR EXCEL -->
       <button id="btn-export-jatah-excel" class="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2" title="Tarik data jatah dan saldo cuti karyawan terakhir format Excel (.xlsx) berdasarkan filter cabang">
         <i class="fa-solid fa-table-list text-sm"></i>
         <span>Tarik Jatah Cuti (Excel)</span>
       </button>
     </div>
   </div>
 </div>

 ${canManage ? `
 <!-- TAB NAVIGASI UTAMA -->
 <div class="flex items-center gap-2 border-b border-slate-200">
 <button id="tab-mode-cards" class="px-4 py-2.5 text-xs font-bold border-b-2 border-maroon-700 text-maroon-700 transition flex items-center gap-2">
 <i class="fa-solid fa-address-card text-sm"></i> Daftar Card Karyawan
 </button>
 <button id="tab-mode-table" class="px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition flex items-center gap-2">
 <i class="fa-solid fa-file-excel text-sm"></i> Atur Jatah & Import Excel (SK 018)
 </button>
 </div>` : ""}

 <!-- PANEL 1: CARDS GRID (DAFTAR CARD KARYAWAN) -->
 <div id="panel-view-cards" class="space-y-4">
 <div class="flex flex-wrap items-center justify-between gap-3">
 <div class="relative w-full sm:w-72">
 <input type="text" id="cuti-search" placeholder="Cari nama karyawan / jabatan..." class="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
 </div>
 </div>
 <div id="cuti-cards-wrap" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
 <div class="col-span-full">${skeletonRows(3)}</div>
 </div>
 </div>

 <!-- PANEL 2: TABEL EXCEL & RESET OTOMATIS (SK 018) -->
 ${canManage ? `
 <div id="panel-view-table" class="hidden space-y-4">
 <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl text-blue-900 text-xs leading-relaxed space-y-2">
 <p class="font-bold text-sm"> Pengaturan & Reset Otomatis Jatah Cuti (SK No.018/HRGA-AJ/XII/2024)</p>
 <p>HRD dapat menginput <strong>Sisa Cuti Tahun Lalu</strong> secara manual di tabel di bawah ini atau melalui file Excel. Sisa tersebut akan menjadi basis carryover saat menekan tombol <strong>Reset Otomatis</strong>.</p>
 <p class="font-mono bg-white px-2 py-1 rounded border border-blue-100 text-[11px] inline-block">Format Kolom Excel: NIK | Nama Karyawan | Jatah Cuti Tahunan | Jatah Cuti Khusus | Jatah Cuti Akumulasi | Sisa Cuti Tahun Lalu</p>
 </div>

 <div class="flex flex-wrap items-center justify-between gap-3">
 <div class="relative w-full sm:w-72">
 <input type="text" id="cuti-table-search" placeholder="Cari nama karyawan..." class="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
 </div>
 <div class="flex items-center gap-2">
 <input type="file" id="excel-upload" accept=".xlsx, .xls" class="hidden">
 <button id="btn-import-excel" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-sm">
 <i class="fa-solid fa-file-import"></i> Import Excel
 </button>
 <button id="btn-reset-tahunan" class="flex items-center gap-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-sm">
 <i class="fa-solid fa-rotate"></i> Reset Otomatis
 </button>
 </div>
 </div>

 <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
 <div class="overflow-x-auto">
 <table class="w-full text-xs text-left">
 <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
 <tr>
 <th class="py-3 px-4">Karyawan</th>
 <th class="py-3 px-4">Masa Kerja</th>
 <th class="py-3 px-4 text-center">Cuti Tahunan<br><span class="font-normal normal-case text-[10px] text-slate-400">(Awal / Pakai / Sisa)</span></th>
 <th class="py-3 px-4 text-center">Cuti Khusus<br><span class="font-normal normal-case text-[10px] text-slate-400">(Awal / Pakai / Sisa)</span></th>
 <th class="py-3 px-4 text-center">Carryover (Akumulasi)<br><span class="font-normal normal-case text-[10px] text-slate-400">(Awal / Pakai / Sisa)</span></th>
 <th class="py-3 px-4 text-center">Sisa Cuti Thn Lalu<br><span class="font-normal normal-case text-[10px] text-slate-400">(Manual HRD)</span></th>
 <th class="py-3 px-4 text-center">Aksi</th>
 </tr>
 </thead>
 <tbody id="cuti-tbody" class="divide-y divide-slate-100">
 <tr><td colspan="7" class="py-10 text-center text-slate-400">Memuat data karyawan...</td></tr>
 </tbody>
 </table>
 </div>
 </div>
 </div>` : ""}
 </div>
 `;

 // TABS SWITCHER (Cards vs Table)
 const tabCards = container.querySelector("#tab-mode-cards");
 const tabTable = container.querySelector("#tab-mode-table");
 const panelCards = container.querySelector("#panel-view-cards");
 const panelTable = container.querySelector("#panel-view-table");

 if (tabCards && tabTable && panelCards && panelTable) {
 tabCards.onclick = () => {
 tabCards.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-maroon-700 text-maroon-700 transition flex items-center gap-2";
 tabTable.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition flex items-center gap-2";
 panelCards.classList.remove("hidden");
 panelTable.classList.add("hidden");
 };
 tabTable.onclick = () => {
 tabTable.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-maroon-700 text-maroon-700 transition flex items-center gap-2";
 tabCards.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition flex items-center gap-2";
 panelTable.classList.remove("hidden");
 panelCards.classList.add("hidden");
 };
 }

 const wrap = container.querySelector("#cuti-cards-wrap");
 const searchInput = container.querySelector("#cuti-search");
 const searchTableInput = container.querySelector("#cuti-table-search");
 const filterCabang = container.querySelector("#cuti-filter-cabang");
 const filterStartDate = container.querySelector("#cuti-filter-start-date");
 const filterEndDate = container.querySelector("#cuti-filter-end-date");
 const btnResetFilter = container.querySelector("#btn-reset-filter");
 const btnExportRiwayat = container.querySelector("#btn-export-riwayat-excel");
 const btnExportJatah = container.querySelector("#btn-export-jatah-excel");

 // Default tanggal filter
 const curYear = new Date().getFullYear();
 if (filterStartDate && !filterStartDate.value) {
   filterStartDate.value = `${curYear}-01-01`;
 }
 if (filterEndDate && !filterEndDate.value) {
   const today = new Date();
   const mm = String(today.getMonth() + 1).padStart(2, '0');
   const dd = String(today.getDate()).padStart(2, '0');
   filterEndDate.value = `${curYear}-${mm}-${dd}`;
 }

 function toDateYmd(val) {
   if (!val) return null;
   if (typeof val === "string") {
     const trimmed = val.trim();
     const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
     if (m) return `${m[1]}-${m[2]}-${m[3]}`;
     const d = smartParseDate(trimmed);
     if (d && !isNaN(d.getTime())) {
       const y = d.getFullYear();
       const mm = String(d.getMonth() + 1).padStart(2, '0');
       const dd = String(d.getDate()).padStart(2, '0');
       return `${y}-${mm}-${dd}`;
     }
     return trimmed.substring(0, 10);
   }
   if (typeof val === "object") {
     if (val.toDate && typeof val.toDate === "function") {
       const d = val.toDate();
       if (!isNaN(d.getTime())) {
         const y = d.getFullYear();
         const mm = String(d.getMonth() + 1).padStart(2, '0');
         const dd = String(d.getDate()).padStart(2, '0');
         return `${y}-${mm}-${dd}`;
       }
     }
     if (val instanceof Date && !isNaN(val.getTime())) {
       const y = val.getFullYear();
       const mm = String(val.getMonth() + 1).padStart(2, '0');
       const dd = String(val.getDate()).padStart(2, '0');
       return `${y}-${mm}-${dd}`;
     }
   }
   return null;
 }

 function populateCabangDropdown() {
   if (!filterCabang) return;
   const currentVal = filterCabang.value;
   const branches = [...new Set(allKaryawan.map(k => (k.cabang || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
   
   filterCabang.innerHTML = `<option value="">Semua Cabang (${allKaryawan.length} Karyawan)</option>` + 
     branches.map(b => {
       const count = allKaryawan.filter(k => (k.cabang || "").trim().toUpperCase() === b.toUpperCase()).length;
       return `<option value="${escapeHtml(b)}">${escapeHtml(b)} (${count} Karyawan)</option>`;
     }).join("");
   
   if (currentVal && branches.includes(currentVal)) {
     filterCabang.value = currentVal;
   }
 }

 function applyFilters() {
   const selectedCabang = (filterCabang?.value || "").trim().toUpperCase();
   const cardTerm = (searchInput?.value || "").trim().toLowerCase();
   const tableTerm = (searchTableInput?.value || "").trim().toLowerCase();

   const filteredForCards = allKaryawan.filter(k => {
     const matchCabang = !selectedCabang || (k.cabang || "").trim().toUpperCase() === selectedCabang;
     const matchSearch = !cardTerm || 
       (k.nama_karyawan || "").toLowerCase().includes(cardTerm) || 
       (k.jabatan || "").toLowerCase().includes(cardTerm) || 
       (k.nik || k.nik_karyawan || "").toLowerCase().includes(cardTerm);
     return matchCabang && matchSearch;
   });

   const filteredForTable = allKaryawan.filter(k => {
     const matchCabang = !selectedCabang || (k.cabang || "").trim().toUpperCase() === selectedCabang;
     const matchSearch = !tableTerm || 
       (k.nama_karyawan || "").toLowerCase().includes(tableTerm) || 
       (k.nik || k.nik_karyawan || "").toLowerCase().includes(tableTerm) ||
       (k.jabatan || "").toLowerCase().includes(tableTerm);
     return matchCabang && matchSearch;
   });

   renderCards(filteredForCards);
   renderTable(filteredForTable);
 }

  // Helper untuk menyimpan perubahan jatah cuti karyawan ke Firestore secara konsisten & sinkron
  async function syncSaveEmployeeLeave(emp, payload) {
    const cleanPayload = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) {
        cleanPayload[k] = v;
      }
    }

    if (emp.id) {
      await updateDoc(doc(db, COL.MASTER_KARYAWAN, String(emp.id)), cleanPayload);
    }

    try {
      const empNik = (emp.nik || emp.nik_karyawan || "").toString().trim();
      const empName = (emp.nama_karyawan || "").toString().trim();
      if (empNik || empName) {
        const qColl = collection(db, COL.MASTER_KARYAWAN);
        const matches = [];
        if (empNik) {
          const snapNik = await getDocs(query(qColl, where("nik_karyawan", "==", empNik)));
          snapNik.forEach(d => { if (d.id !== emp.id) matches.push(d.id); });
          const snapNikAlt = await getDocs(query(qColl, where("nik", "==", empNik)));
          snapNikAlt.forEach(d => { if (d.id !== emp.id) matches.push(d.id); });
        }
        if (empName) {
          const snapName = await getDocs(query(qColl, where("nama_karyawan", "==", empName)));
          snapName.forEach(d => { if (d.id !== emp.id) matches.push(d.id); });
        }
        const uniqueOtherDocIds = [...new Set(matches)];
        for (const otherId of uniqueOtherDocIds) {
          await updateDoc(doc(db, COL.MASTER_KARYAWAN, otherId), cleanPayload).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Sinkronisasi doc alternatif:", err);
    }

    Object.assign(emp, cleanPayload);
    for (const other of allKaryawan) {
      if (other !== emp) {
        const oNik = (other.nik || other.nik_karyawan || "").toString().trim();
        const oName = (other.nama_karyawan || "").toString().trim();
        const empNik = (emp.nik || emp.nik_karyawan || "").toString().trim();
        const empName = (emp.nama_karyawan || "").toString().trim();
        if ((empNik && oNik === empNik) || (empName && oName === empName)) {
          Object.assign(other, cleanPayload);
        }
      }
    }
  }

  let allKaryawan = [], allCuti = [], leaveConfig = [];
 let terpakaiMap = {};
 let bawahanNames = null;

 async function loadData() {
 try {
 const [snapK, snapC, snapCfg] = await Promise.all([
 fsGetAll(COL.MASTER_KARYAWAN),
 fsGetAll(COL.MASTER_CUTI),
 getDoc(doc(db, COL.APP_SETTINGS, "leave_types"))
 ]);
 
 if (isAtasanView && bawahanNames === null) {
 bawahanNames = await getBawahanNames(session.nama);
 }

    const rawActive = snapK.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF" && k.nama_karyawan && k.nama_karyawan.trim() !== "");
    const uniqueMap = new Map();
    for (const k of rawActive) {
      const nikKey = (k.nik_karyawan || k.nik || "").toString().trim().toUpperCase();
      const nameKey = (k.nama_karyawan || "").toString().trim().toUpperCase();
      const key = nikKey || nameKey;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, k);
      } else {
        const existing = uniqueMap.get(key);
        if (k.jatah_cuti_tahunan !== undefined) existing.jatah_cuti_tahunan = k.jatah_cuti_tahunan;
        if (k.jatah_tahunan !== undefined) existing.jatah_tahunan = k.jatah_tahunan;
        if (k.jatah_cuti_khusus !== undefined) existing.jatah_cuti_khusus = k.jatah_cuti_khusus;
        if (k.jatah_khusus !== undefined) existing.jatah_khusus = k.jatah_khusus;
        if (k.jatah_cuti_akumulasi !== undefined) existing.jatah_cuti_akumulasi = k.jatah_cuti_akumulasi;
        if (k.jatah_akumulasi !== undefined) existing.jatah_akumulasi = k.jatah_akumulasi;
        if (k.sisa_cuti_tahun_lalu !== undefined) existing.sisa_cuti_tahun_lalu = k.sisa_cuti_tahun_lalu;
      }
    }
    allKaryawan = Array.from(uniqueMap.values());
 if (isAtasanView) {
  const bset = new Set(bawahanNames || []);
  if (session?.nama) bset.add(session.nama);
 allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
 }
 allKaryawan.sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id", { sensitivity: "base" }));

 allCuti = snapC;
 
 if (snapCfg.exists() && snapCfg.data().types) {
 leaveConfig = snapCfg.data().types;
 } else {
 leaveConfig = [...DEFAULT_LEAVE_TYPES];
 }

 populateCabangDropdown();
 calculateBalances();
 applyFilters();
 } catch(e) { 
 if (wrap) wrap.innerHTML = `<div class="col-span-full text-red-500">Error: ${e.message}</div>`; 
 }
 }

  function calculateBalances() {
    terpakaiMap = {};
    const currentYear = new Date().getFullYear();
    allCuti.forEach(r => {
      const key = r.nama_karyawan;
      if (!key) return;
      const st = (r.status_final || r.status || "").toUpperCase();
      if (st.includes("REJECT") || st.includes("TOLAK")) return;

      const rowYear = parseInt(r.tahun) || (r.tanggal ? new Date(r.tanggal).getFullYear() : currentYear);
      if (rowYear !== currentYear) return;
      if (!terpakaiMap[key]) terpakaiMap[key] = { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
      
      const deduction = getCutiDeductionCategory(r);
      if (!deduction.isDeducted || deduction.count <= 0) return;

      if (deduction.category === "Tahunan") {
        terpakaiMap[key].Tahunan += deduction.count;
      } else if (deduction.category === "Khusus") {
        terpakaiMap[key].Khusus += deduction.count;
      } else if (deduction.category === "Akumulasi") {
        terpakaiMap[key].Akumulasi += deduction.count;
      }
    });
  }

 function getSisa(k) {
 const empCuti = allCuti.filter(c => c.nama_karyawan === k.nama_karyawan || (k.nik && c.nik === k.nik));
 const calc = getCalculatedJatahCuti(k, empCuti);
 return {
 jatahTahunan: calc.jatahTahunan,
 jatahKhusus: calc.jatahKhusus,
 jatahAkumulasi: calc.jatahAkumulasi,
 Tahunan: calc.sisaTahunan,
 Khusus: calc.sisaKhusus,
 Akumulasi: calc.sisaAkumulasi,
 used: {
   Tahunan: calc.usedTahunan,
   Khusus: calc.usedKhusus,
   Akumulasi: calc.usedAkumulasi
 }
 };
 }

 function renderCards(list) {
 if (!wrap) return;
 if (!list.length) { wrap.innerHTML = `<div class="col-span-full">${emptyState("Karyawan tidak ditemukan")}</div>`; return; }
 
 wrap.innerHTML = list.map(k => {
 const sisa = getSisa(k);
 return `
 <div data-karyawan-id="${k.id}" class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-maroon-300 transition cursor-pointer overflow-hidden flex flex-col">
 <div class="p-4 flex items-center gap-3 border-b border-slate-100 bg-slate-50/50">
 ${avatar(k.nama_karyawan, "w-12 h-12 text-sm")}
 <div class="flex-1 min-w-0">
 <p class="font-bold text-slate-800 truncate">${escapeHtml(k.nama_karyawan)}</p>
 <p class="text-[11px] text-slate-500 truncate">${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.cabang || "-")}</p>
 </div>
 </div>
 
 <div class="p-3 bg-white grid grid-cols-3 gap-2 text-center flex-1">
 <!-- TAHUNAN -->
 <div class="p-2 bg-blue-50/80 rounded-xl border border-blue-100 flex flex-col justify-between">
 <div>
 <p class="text-[9px] text-blue-900 font-bold uppercase tracking-wider mb-1">Tahunan</p>
 <div class="text-[10px] text-slate-500 flex justify-between px-1 mb-1">
 <span>Awal: <strong>${sisa.jatahTahunan}</strong></span>
 <span>Pakai: <strong class="text-amber-700">${sisa.used.Tahunan}</strong></span>
 </div>
 </div>
 <div class="pt-1 border-t border-blue-200/60">
 <p class="text-[9px] text-slate-400 font-medium">Sisa Saldo</p>
 <p class="text-base font-black text-blue-700">${sisa.Tahunan} <span class="text-[10px] font-normal text-slate-500">Hari</span></p>
 </div>
 </div>

 <!-- KHUSUS -->
 <div class="p-2 bg-emerald-50/80 rounded-xl border border-emerald-100 flex flex-col justify-between">
 <div>
 <p class="text-[9px] text-emerald-900 font-bold uppercase tracking-wider mb-1">Khusus</p>
 <div class="text-[10px] text-slate-500 flex justify-between px-1 mb-1">
 <span>Awal: <strong>${sisa.jatahKhusus}</strong></span>
 <span>Pakai: <strong class="text-amber-700">${sisa.used.Khusus}</strong></span>
 </div>
 </div>
 <div class="pt-1 border-t border-emerald-200/60">
 <p class="text-[9px] text-slate-400 font-medium">Sisa Saldo</p>
 <p class="text-base font-black text-emerald-700">${sisa.Khusus} <span class="text-[10px] font-normal text-slate-500">Hari</span></p>
 </div>
 </div>

 <!-- AKUMULASI -->
 <div class="p-2 bg-amber-50/80 rounded-xl border border-amber-100 flex flex-col justify-between">
 <div>
 <p class="text-[9px] text-amber-900 font-bold uppercase tracking-wider mb-1">Akumulasi</p>
 <div class="text-[10px] text-slate-500 flex justify-between px-1 mb-1">
 <span>Awal: <strong>${sisa.jatahAkumulasi}</strong></span>
 <span>Pakai: <strong class="text-amber-700">${sisa.used.Akumulasi}</strong></span>
 </div>
 </div>
 <div class="pt-1 border-t border-amber-200/60">
 <p class="text-[9px] text-slate-400 font-medium">Sisa Saldo</p>
 <p class="text-base font-black text-amber-700">${sisa.Akumulasi} <span class="text-[10px] font-normal text-slate-500">Hari</span></p>
 </div>
 </div>
 </div>

 <div class="px-3.5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
 <span>Kelola Cuti & Izin</span>
 <span class="font-bold text-maroon-700">Detail &rarr;</span>
 </div>
 </div>
 `;
 }).join("");

 wrap.querySelectorAll("[data-karyawan-id]").forEach(card => {
 card.onclick = () => openEmployeeModal(allKaryawan.find(x => x.id === card.dataset.karyawanId));
 });
 }

 function renderTable(list) {
		const tbody = container.querySelector("#cuti-tbody");
		if (!tbody) return;

		if (!list.length) {
			tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada data karyawan aktif.</td></tr>`;
			return;
		}

		const now = new Date();
		tbody.innerHTML = list.map(k => {
			let masaKerjaStr = "-";
			if (k.tanggal_join) {
				const join = smartParseDate(k.tanggal_join);
				if (join) {
					const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
					const yrs = Math.floor(diffMonths / 12);
					const mths = diffMonths % 12;
					masaKerjaStr = yrs > 0 ? `${yrs} Thn ${mths} Bln` : `${mths} Bln`;
				}
			}

			const sisa = getSisa(k);

			return `
			<tr class="hover:bg-slate-50/50 transition">
				<td class="py-3 px-4">
					<p class="font-bold text-slate-800">${escapeHtml(k.nama_karyawan)}</p>
					<p class="text-[11px] text-slate-400 font-medium">${escapeHtml(k.nik || k.nik_karyawan || "-")}</p>
				</td>
				<td class="py-3 px-4 text-slate-600 font-medium text-xs">${masaKerjaStr}</td>
				
				<!-- CUTI TAHUNAN -->
				<td class="py-3 px-4 text-center">
					<div class="inline-flex flex-col items-center gap-1">
						<div class="flex items-center gap-1">
							<span class="text-[10px] text-slate-500 font-medium">Awal:</span>
							<input type="number" step="0.5" min="0" data-edit-tahunan="${k.id}" value="${sisa.jatahTahunan}" title="Edit Jatah Tahunan Awal (Manual HRD)" class="w-14 text-center px-1 py-0.5 border border-slate-200 rounded text-xs font-bold text-blue-800 bg-blue-50/40 focus:bg-white focus:border-blue-500 outline-none">
						</div>
						<div class="flex items-center gap-1">
							<span class="bg-blue-100 text-blue-900 font-black px-2 py-0.5 rounded text-[11px]">Sisa: ${sisa.Tahunan} Hari</span>
							<span class="text-[10px] text-slate-400 font-mono">(${sisa.used.Tahunan} pki)</span>
						</div>
					</div>
				</td>

				<!-- CUTI KHUSUS -->
				<td class="py-3 px-4 text-center">
					<div class="inline-flex flex-col items-center gap-1">
						<div class="flex items-center gap-1">
							<span class="text-[10px] text-slate-500 font-medium">Awal:</span>
							<input type="number" step="0.5" min="0" data-edit-khusus="${k.id}" value="${sisa.jatahKhusus}" title="Edit Jatah Khusus Awal (Manual HRD)" class="w-14 text-center px-1 py-0.5 border border-slate-200 rounded text-xs font-bold text-emerald-800 bg-emerald-50/40 focus:bg-white focus:border-emerald-500 outline-none">
						</div>
						<div class="flex items-center gap-1">
							<span class="bg-emerald-100 text-emerald-900 font-black px-2 py-0.5 rounded text-[11px]">Sisa: ${sisa.Khusus} Hari</span>
							<span class="text-[10px] text-slate-400 font-mono">(${sisa.used.Khusus} pki)</span>
						</div>
					</div>
				</td>

				<!-- CARRYOVER AKUMULASI -->
				<td class="py-3 px-4 text-center">
					<div class="inline-flex flex-col items-center gap-1">
						<div class="flex items-center gap-1">
							<span class="text-[10px] text-slate-500 font-medium">Awal:</span>
							<input type="number" step="0.5" min="0" data-edit-akumulasi="${k.id}" value="${sisa.jatahAkumulasi}" title="Edit Jatah Akumulasi Awal (Manual HRD)" class="w-14 text-center px-1 py-0.5 border border-slate-200 rounded text-xs font-bold text-amber-800 bg-amber-50/40 focus:bg-white focus:border-amber-500 outline-none">
						</div>
						<div class="flex items-center gap-1">
							<span class="bg-amber-100 text-amber-900 font-black px-2 py-0.5 rounded text-[11px]">Sisa: ${sisa.Akumulasi} Hari</span>
							<span class="text-[10px] text-slate-400 font-mono">(${sisa.used.Akumulasi} pki)</span>
						</div>
						${k.cuti_akumulasi_expired ? `<p class="text-[9px] text-amber-600 font-medium">Hangus ${escapeHtml(k.cuti_akumulasi_expired)}</p>` : ""}
					</div>
				</td>

				<!-- SISA CUTI TAHUN LALU (INPUT MANUAL) -->
				<td class="py-3 px-4 text-center">
					<div class="flex flex-col items-center gap-1">
						<input type="number" step="0.5" min="0" data-sisa-lalu="${k.id}"
							value="${k.sisa_cuti_tahun_lalu ?? ""}" placeholder="-" title="Input Sisa Cuti Tahun Lalu (Manual HRD)"
							class="w-16 text-center px-1.5 py-1 border border-slate-200 rounded text-xs font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:border-maroon-400 outline-none">
						${(k.sisa_cuti_tahun_lalu === undefined || k.sisa_cuti_tahun_lalu === null) ? `<span class="text-[9px] text-slate-400">Kosong</span>` : ""}
					</div>
				</td>

				<!-- AKSI -->
				<td class="py-3 px-4 text-center">
					<button type="button" data-btn-edit-karyawan-jatah="${k.id}" class="bg-maroon-50 hover:bg-maroon-100 text-maroon-700 hover:text-maroon-800 px-2.5 py-1.5 rounded-lg font-bold text-[11px] border border-maroon-200 transition inline-flex items-center gap-1 shadow-2xs" title="Edit Rinci Jatah Cuti Karyawan">
						<i class="fa-solid fa-pen-to-square"></i> Edit
					</button>
				</td>
			</tr>
			`;
		}).join("");

		// Event listener inline edit tahunan
		tbody.querySelectorAll("[data-edit-tahunan]").forEach(inp => {
			inp.addEventListener("change", async () => {
				const id = inp.dataset.editTahunan;
				const val = parseFloat(inp.value) || 0;
				try {
					const emp = allKaryawan.find(k => k.id === id);
					if (emp) {
						await syncSaveEmployeeLeave(emp, { 
							jatah_cuti_tahunan: val,
							jatah_tahunan: val
						});
					}
					calculateBalances();
					renderTable(allKaryawan);
					renderCards(allKaryawan);
					toast(`Jatah Cuti Tahunan ${emp?.nama_karyawan || ''} diperbarui: ${val} Hari`, "success");
				} catch (e) {
					toast("Gagal menyimpan: " + e.message, "error");
				}
			});
		});

		// Event listener inline edit khusus
		tbody.querySelectorAll("[data-edit-khusus]").forEach(inp => {
			inp.addEventListener("change", async () => {
				const id = inp.dataset.editKhusus;
				const val = parseFloat(inp.value) || 0;
				try {
					const emp = allKaryawan.find(k => k.id === id);
					if (emp) {
						await syncSaveEmployeeLeave(emp, { 
							jatah_cuti_khusus: val,
							jatah_khusus: val
						});
					}
					calculateBalances();
					renderTable(allKaryawan);
					renderCards(allKaryawan);
					toast(`Jatah Cuti Khusus ${emp?.nama_karyawan || ''} diperbarui: ${val} Hari`, "success");
				} catch (e) {
					toast("Gagal menyimpan: " + e.message, "error");
				}
			});
		});

		// Event listener inline edit akumulasi
		tbody.querySelectorAll("[data-edit-akumulasi]").forEach(inp => {
			inp.addEventListener("change", async () => {
				const id = inp.dataset.editAkumulasi;
				const val = parseFloat(inp.value) || 0;
				try {
					const emp = allKaryawan.find(k => k.id === id);
					if (emp) {
						await syncSaveEmployeeLeave(emp, { 
							jatah_cuti_akumulasi: val,
							jatah_akumulasi: val
						});
					}
					calculateBalances();
					renderTable(allKaryawan);
					renderCards(allKaryawan);
					toast(`Jatah Cuti Akumulasi ${emp?.nama_karyawan || ''} diperbarui: ${val} Hari`, "success");
				} catch (e) {
					toast("Gagal menyimpan: " + e.message, "error");
				}
			});
		});

		// Event listener inline edit sisa cuti tahun lalu
		tbody.querySelectorAll("[data-sisa-lalu]").forEach(inp => {
			inp.addEventListener("change", async () => {
				const id = inp.dataset.sisaLalu;
				const val = inp.value === "" ? null : (parseFloat(inp.value) || 0);
				try {
					const emp = allKaryawan.find(k => k.id === id);
					let jAkumulasiBaru = 0;
					if (val !== null && val > 0 && emp) {
						jAkumulasiBaru = calculateCarryoverJatah(val, emp.tanggal_join);
					}
					if (emp) {
						await syncSaveEmployeeLeave(emp, { 
							sisa_cuti_tahun_lalu: val,
							jatah_cuti_akumulasi: jAkumulasiBaru,
							jatah_akumulasi: jAkumulasiBaru
						});
					}
					calculateBalances();
					renderTable(allKaryawan);
					renderCards(allKaryawan);
					toast("Sisa cuti tahun lalu dan jatah akumulasi berhasil diperbarui", "success");
				} catch (e) {
					toast("Gagal menyimpan: " + e.message, "error");
				}
			});
		});

		// Tombol edit modal
		tbody.querySelectorAll("[data-btn-edit-karyawan-jatah]").forEach(btn => {
			btn.onclick = () => {
				const emp = allKaryawan.find(k => k.id === btn.dataset.btnEditKaryawanJatah);
				if (emp) openEmployeeModal(emp, { defaultTab: "edit" });
			};
		});
	}

	if (filterCabang) {
 filterCabang.onchange = applyFilters;
 }

 if (searchInput) {
 searchInput.oninput = applyFilters;
 }

 if (searchTableInput) {
 searchTableInput.oninput = applyFilters;
 }

 if (btnResetFilter) {
 btnResetFilter.onclick = () => {
 if (filterCabang) filterCabang.value = "";
 if (filterStartDate) filterStartDate.value = `${curYear}-01-01`;
 if (filterEndDate) {
 const today = new Date();
 const mm = String(today.getMonth() + 1).padStart(2, '0');
 const dd = String(today.getDate()).padStart(2, '0');
 filterEndDate.value = `${curYear}-${mm}-${dd}`;
 }
 if (searchInput) searchInput.value = "";
 if (searchTableInput) searchTableInput.value = "";
 applyFilters();
 toast("Filter telah direset", "info");
 };
 }

 // EKSPOR RIWAYAT CUTI (EXCEL)
 async function exportRiwayatCutiExcel() {
 try {
 await ensureXlsxLoaded();
 if (!window.XLSX) throw new Error("Library Excel (SheetJS) belum siap. Silakan coba beberapa detik lagi.");

 const selectedCabang = (filterCabang?.value || "").trim();
 const startDate = (filterStartDate?.value || "").trim();
 const endDate = (filterEndDate?.value || "").trim();

 // Saring riwayat cuti
 const filtered = allCuti.filter(c => {
 // Mode bawahan untuk atasan
 if (isAtasanView && bawahanNames && !bawahanNames.includes(c.nama_karyawan)) {
 return false;
 }

 // Filter Cabang
 const emp = allKaryawan.find(k => k.nama_karyawan === c.nama_karyawan || (k.nik && c.nik === k.nik));
 if (selectedCabang) {
 const empCabang = (emp?.cabang || c.cabang || "").trim().toUpperCase();
 if (empCabang !== selectedCabang.toUpperCase()) return false;
 }

 // Filter Rentang Tanggal
 const cStart = toDateYmd(c.tanggal || c.tanggal_mulai || c.tgl_mulai) || toDateYmd(c.createdAt || c.created_at);
 const cEnd = toDateYmd(c.tanggal_selesai || c.tgl_selesai || c.tanggal || c.tanggal_mulai) || cStart;

 if (startDate) {
 if (cEnd && cEnd < startDate && cStart && cStart < startDate) return false;
 }
 if (endDate) {
 if (cStart && cStart > endDate && cEnd && cEnd > endDate) return false;
 }

 return true;
 });

 if (filtered.length === 0) {
 toast("Tidak ada data riwayat cuti yang sesuai dengan filter cabang dan periode tanggal yang dipilih.", "warning");
 return;
 }

 // Urutkan data berdasarkan tanggal terbaru
 filtered.sort((a, b) => {
 const da = toDateYmd(a.tanggal || a.tanggal_mulai || a.createdAt) || "";
 const db = toDateYmd(b.tanggal || b.tanggal_mulai || b.createdAt) || "";
 return db.localeCompare(da);
 });

 const exportRows = filtered.map((c, idx) => {
 const emp = allKaryawan.find(k => k.nama_karyawan === c.nama_karyawan || (k.nik && c.nik === k.nik)) || {};
 const tglMulai = toDateYmd(c.tanggal || c.tanggal_mulai || c.tgl_mulai) || c.tanggal || "-";
 const tglSelesai = toDateYmd(c.tanggal_selesai || c.tgl_selesai) || tglMulai;
 const tglPengajuan = c.createdAt ? (typeof c.createdAt === 'object' && c.createdAt.toDate ? fmtDateShort(c.createdAt) : String(c.createdAt).substring(0, 10)) : (c.created_at ? (typeof c.created_at === 'object' && c.created_at.toDate ? fmtDateShort(c.created_at) : String(c.created_at).substring(0, 10)) : "-");

 return {
 "No": idx + 1,
 "NIK": emp.nik || emp.nik_karyawan || c.nik || "-",
 "Nama Karyawan": c.nama_karyawan || emp.nama_karyawan || "-",
 "Cabang": emp.cabang || c.cabang || "-",
 "Jabatan": emp.jabatan || c.jabatan || "-",
 "Divisi": emp.divisi || c.divisi || "-",
 "Jenis Cuti / Izin": c.type_cuti || c.kategori_cuti || "-",
 "Kategori Pemotongan": getCutiDeductionCategory(c).category,
 "Tanggal Mulai": tglMulai,
 "Tanggal Selesai": tglSelesai,
 "Sesi Cuti": c.sesi || (c.type_cuti && c.type_cuti.includes("1/2") ? "Setengah Hari" : "Full Day"),
 "Durasi (Hari)": parseFloat(c.count || c.jumlah_hari) || 0,
 "Keterangan / Alasan": c.keterangan_cuti || c.alasan || "-",
 "Status Pengajuan": c.status_final || c.status || "APPROVED",
 "Tanggal Pengajuan": tglPengajuan,
 "Disetujui Oleh": c.disetujui_oleh || c.atasan || "-"
 };
 });

 const ws = window.XLSX.utils.json_to_sheet(exportRows);
 ws['!cols'] = [
 { wch: 6 },  // No
 { wch: 15 }, // NIK
 { wch: 28 }, // Nama Karyawan
 { wch: 18 }, // Cabang
 { wch: 22 }, // Jabatan
 { wch: 16 }, // Divisi
 { wch: 26 }, // Jenis Cuti / Izin
 { wch: 20 }, // Kategori Pemotongan
 { wch: 15 }, // Tanggal Mulai
 { wch: 15 }, // Tanggal Selesai
 { wch: 15 }, // Sesi Cuti
 { wch: 14 }, // Durasi (Hari)
 { wch: 36 }, // Keterangan / Alasan
 { wch: 18 }, // Status Pengajuan
 { wch: 18 }, // Tanggal Pengajuan
 { wch: 24 }  // Disetujui Oleh
 ];

 const wb = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(wb, ws, "Riwayat Cuti");

 const cabangTag = (selectedCabang || "SEMUA_CABANG").replace(/[^a-zA-Z0-9_-]/g, '_');
 const startTag = startDate || "AWAL";
 const endTag = endDate || "AKHIR";
 const filename = `Riwayat_Cuti_${cabangTag}_${startTag}_sd_${endTag}.xlsx`;

 window.XLSX.writeFile(wb, filename);
 toast(`Berhasil menarik ${exportRows.length} data riwayat cuti (${filename})`, "success");
 } catch (err) {
 console.error(err);
 toast("Gagal mengekspor riwayat cuti: " + err.message, "error");
 }
 }

 // EKSPOR JATAH CUTI TERAKHIR (EXCEL)
 async function exportJatahCutiExcel() {
 try {
 await ensureXlsxLoaded();
 if (!window.XLSX) throw new Error("Library Excel (SheetJS) belum siap. Silakan coba beberapa detik lagi.");

 const selectedCabang = (filterCabang?.value || "").trim();

 let targetEmployees = allKaryawan;
 if (selectedCabang) {
 targetEmployees = targetEmployees.filter(k => (k.cabang || "").trim().toUpperCase() === selectedCabang.toUpperCase());
 }

 if (targetEmployees.length === 0) {
 toast("Tidak ada data karyawan pada cabang yang dipilih.", "warning");
 return;
 }

 const now = new Date();
 const exportRows = targetEmployees.map((k, idx) => {
 const sisa = getSisa(k);
 let masaKerjaStr = "-";
 if (k.tanggal_join) {
 const join = smartParseDate(k.tanggal_join);
 if (join) {
 const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
 const yrs = Math.floor(diffMonths / 12);
 const mths = diffMonths % 12;
 masaKerjaStr = yrs > 0 ? `${yrs} Thn ${mths} Bln` : `${mths} Bln`;
 }
 }
 const totalSisa = (sisa.Tahunan || 0) + (sisa.Khusus || 0) + (sisa.Akumulasi || 0);

 return {
 "No": idx + 1,
 "NIK": k.nik || k.nik_karyawan || "-",
 "Nama Karyawan": k.nama_karyawan || "-",
 "Cabang": k.cabang || "-",
 "Jabatan": k.jabatan || "-",
 "Divisi": k.divisi || "-",
 "Tanggal Join": k.tanggal_join || "-",
 "Masa Kerja": masaKerjaStr,
 "Jatah Tahunan (Awal)": sisa.jatahTahunan ?? 0,
 "Cuti Tahunan Terpakai": sisa.used.Tahunan ?? 0,
 "Sisa Cuti Tahunan": sisa.Tahunan ?? 0,
 "Jatah Khusus (Awal)": sisa.jatahKhusus ?? 0,
 "Cuti Khusus Terpakai": sisa.used.Khusus ?? 0,
 "Sisa Cuti Khusus": sisa.Khusus ?? 0,
 "Jatah Akumulasi (Carryover)": sisa.jatahAkumulasi ?? 0,
 "Akumulasi Terpakai": sisa.used.Akumulasi ?? 0,
 "Sisa Cuti Akumulasi": sisa.Akumulasi ?? 0,
 "Sisa Cuti Tahun Lalu (Manual HRD)": k.sisa_cuti_tahun_lalu ?? "-",
 "Total Sisa Cuti Aktif": totalSisa
 };
 });

 const ws = window.XLSX.utils.json_to_sheet(exportRows);
 ws['!cols'] = [
 { wch: 6 },  // No
 { wch: 15 }, // NIK
 { wch: 28 }, // Nama Karyawan
 { wch: 18 }, // Cabang
 { wch: 22 }, // Jabatan
 { wch: 16 }, // Divisi
 { wch: 15 }, // Tanggal Join
 { wch: 16 }, // Masa Kerja
 { wch: 20 }, // Jatah Tahunan (Awal)
 { wch: 20 }, // Cuti Tahunan Terpakai
 { wch: 18 }, // Sisa Cuti Tahunan
 { wch: 18 }, // Jatah Khusus (Awal)
 { wch: 18 }, // Cuti Khusus Terpakai
 { wch: 16 }, // Sisa Cuti Khusus
 { wch: 26 }, // Jatah Akumulasi (Carryover)
 { wch: 18 }, // Akumulasi Terpakai
 { wch: 18 }, // Sisa Cuti Akumulasi
 { wch: 30 }, // Sisa Cuti Tahun Lalu (Manual HRD)
 { wch: 20 }  // Total Sisa Cuti Aktif
 ];

 const wb = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(wb, ws, "Jatah & Sisa Cuti");

 const cabangTag = (selectedCabang || "SEMUA_CABANG").replace(/[^a-zA-Z0-9_-]/g, '_');
 const filename = `Rekap_Jatah_Cuti_${cabangTag}_${now.getFullYear()}.xlsx`;

 window.XLSX.writeFile(wb, filename);
 toast(`Berhasil menarik ${exportRows.length} data jatah cuti karyawan (${filename})`, "success");
 } catch (err) {
 console.error(err);
 toast("Gagal mengekspor data jatah cuti: " + err.message, "error");
 }
 }

 if (btnExportRiwayat) {
 btnExportRiwayat.onclick = exportRiwayatCutiExcel;
 }

 if (btnExportJatah) {
 btnExportJatah.onclick = exportJatahCutiExcel;
 }

 // WIRING EXCEL IMPORT & RESET OTOMATIS
	const btnImport = container.querySelector("#btn-import-excel");
	const fileInput = container.querySelector("#excel-upload");
	if (btnImport && fileInput) {
		btnImport.onclick = () => fileInput.click();
		fileInput.onchange = (e) => {
			const file = e.target.files[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = async (event) => {
				try {
					if (!window.XLSX) throw new Error("Library Excel (SheetJS) sedang dimuat, coba beberapa detik lagi.");
					const data = new Uint8Array(event.target.result);
					const workbook = XLSX.read(data, {type: 'array'});
					const worksheet = workbook.Sheets[workbook.SheetNames[0]];
					const json = XLSX.utils.sheet_to_json(worksheet);

					if (json.length === 0) throw new Error("File Excel kosong atau format tidak terbaca.");

					btnImport.disabled = true;
					btnImport.textContent = "Memproses...";

					// Helper flexible matching column name
					const getVal = (row, names) => {
						const rowKeys = Object.keys(row);
						for (const n of names) {
							const cleanN = n.toLowerCase().replace(/[^a-z0-9]/g, "");
							for (const k of rowKeys) {
								const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
								if (cleanK === cleanN) return row[k];
							}
						}
						for (const n of names) {
							const cleanN = n.toLowerCase().replace(/[^a-z0-9]/g, "");
							if (!cleanN) continue;
							for (const k of rowKeys) {
								const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
								if (cleanK.includes(cleanN) || cleanN.includes(cleanK)) return row[k];
							}
						}
						return undefined;
					};

					const parseNum = (v) => {
						if (v === undefined || v === null || v === "") return null;
						if (typeof v === "number") return isNaN(v) ? null : v;
						const str = String(v).trim().replace(",", ".");
						const m = str.match(/-?\d+(\.\d+)?/);
						if (m) {
							const res = parseFloat(m[0]);
							return isNaN(res) ? null : res;
						}
						return null;
					};

					let updateCount = 0;
					let unmatched = [];

					for (const row of json) {
						const nikRaw = getVal(row, ["nik", "no induk", "no. induk", "nomor induk", "id karyawan", "nip", "no karyawan", "kode karyawan", "id"]);
						const namaRaw = getVal(row, ["nama karyawan", "nama", "nama lengkap", "karyawan", "nama_karyawan", "nama pemohon"]);

						const cleanNik = nikRaw !== undefined && nikRaw !== null ? String(nikRaw).trim() : "";
						const cleanNama = namaRaw !== undefined && namaRaw !== null ? String(namaRaw).trim().toLowerCase().replace(/\s+/g, " ") : "";

						if (!cleanNik && !cleanNama) continue;

						let targetEmp = null;
						if (cleanNik) {
							const pureNik = cleanNik.replace(/^0+/, "");
							targetEmp = allKaryawan.find(k => {
								const kNik = (k.nik || k.nik_karyawan || "").toString().trim();
								return kNik && (kNik === cleanNik || kNik.replace(/^0+/, "") === pureNik);
							});
						}
						if (!targetEmp && cleanNama) {
							targetEmp = allKaryawan.find(k => (k.nama_karyawan || "").trim().toLowerCase().replace(/\s+/g, " ") === cleanNama);
							if (!targetEmp && cleanNama.length >= 4) {
								targetEmp = allKaryawan.find(k => {
									const kN = (k.nama_karyawan || "").trim().toLowerCase().replace(/\s+/g, " ");
									return kN.includes(cleanNama) || cleanNama.includes(kN);
								});
							}
						}

						if (!targetEmp) {
							unmatched.push(cleanNama || cleanNik);
							continue;
						}

						const jTahunan = parseNum(getVal(row, ["jatah cuti tahunan", "jatah tahunan", "jatah tahunan awal", "jatah cuti tahunan awal", "cuti tahunan", "tahunan", "hak cuti tahunan", "saldo cuti tahunan", "sisa cuti tahunan"]));
						const jKhusus = parseNum(getVal(row, ["jatah cuti khusus", "jatah khusus", "jatah khusus awal", "jatah cuti khusus awal", "cuti khusus", "khusus", "hak cuti khusus", "saldo cuti khusus", "sisa cuti khusus"]));
						const jAkumulasi = parseNum(getVal(row, ["jatah cuti akumulasi", "jatah akumulasi", "jatah akumulasi carryover", "carryover akumulasi", "carryover", "akumulasi", "cuti akumulasi", "hak cuti akumulasi", "saldo cuti akumulasi", "sisa cuti akumulasi"]));
						const sisaLalu = parseNum(getVal(row, ["sisa cuti tahun lalu", "sisa cuti tahun lalu manual hrd", "sisa cuti tahun lalu input manual hrd", "sisa tahun lalu", "sisa cuti lalu", "sisa lalu", "sisa cuti tahun sebelumnya", "cuti tahun lalu"]));

						const payload = {};
						let hasChange = false;

						if (jTahunan !== null) {
							payload.jatah_cuti_tahunan = jTahunan;
							payload.jatah_tahunan = jTahunan;
							hasChange = true;
						}
						if (jKhusus !== null) {
							payload.jatah_cuti_khusus = jKhusus;
							payload.jatah_khusus = jKhusus;
							hasChange = true;
						}
						if (jAkumulasi !== null) {
							payload.jatah_cuti_akumulasi = jAkumulasi;
							payload.jatah_akumulasi = jAkumulasi;
							hasChange = true;
						}
						if (sisaLalu !== null) {
							payload.sisa_cuti_tahun_lalu = sisaLalu;
							if (jAkumulasi === null) {
								const calcAkum = calculateCarryoverJatah(sisaLalu, targetEmp.tanggal_join);
								payload.jatah_cuti_akumulasi = calcAkum;
								payload.jatah_akumulasi = calcAkum;
							}
							hasChange = true;
						}

						if (hasChange) {
							await syncSaveEmployeeLeave(targetEmp, payload);
							updateCount++;
						}
					}

					calculateBalances();
					renderCards(allKaryawan);
					renderTable(allKaryawan);

					if (updateCount > 0) {
						let msg = `Berhasil mengupdate jatah cuti ${updateCount} karyawan dari file Excel!`;
						if (unmatched.length > 0) {
							msg += ` (${unmatched.length} baris tidak ditemukan di data karyawan aktif)`;
						}
						toast(msg, "success");
					} else {
						toast("Tidak ada data karyawan yang cocok untuk diupdate dari file Excel.", "warning");
					}
				} catch (err) {
					console.error(err);
					toast("Gagal membaca Excel: " + err.message, "error");
				} finally {
					btnImport.disabled = false;
					btnImport.innerHTML = `<i class="fa-solid fa-file-import"></i> Import Excel`;
					fileInput.value = ""; 
				}
			};
			reader.readAsArrayBuffer(file);
		};
	}

	const btnReset = container.querySelector("#btn-reset-tahunan");
  if (btnReset) {
    btnReset.onclick = async () => {
      if (!confirm("Apakah Anda yakin ingin me-reset jatah cuti seluruh karyawan aktif?\n\nSistem akan menggunakan 'Sisa Cuti Tahun Lalu' (input manual HRD / Import Excel) dikalikan persentase masa kerja sebagai basis carryover cuti akumulasi (sesuai SK No.018/HRGA-AJ/XII/2024):\n- 0 s/d < 3 tahun: 0%\n- 3 s/d < 5 tahun: 50%\n- 5 tahun ke atas: 100%\n\nLanjutkan?")) return;

      btnReset.disabled = true;
      btnReset.textContent = "Mengkalkulasi...";

      try {
        const now = new Date();
        const nextYear = now.getFullYear() + 1;

        const allCutiLog = await fsGetAll(COL.MASTER_CUTI);
        const tahunLalu = now.getFullYear() - 1;
        const terpakaiTahunLalu = {};
        allCutiLog.forEach(r => {
          const key = r.nama_karyawan;
          if (!key) return;
          const rowYear = parseInt(r.tahun) || (r.tanggal ? new Date(r.tanggal).getFullYear() : null);
          if (rowYear !== tahunLalu) return;
          if (!terpakaiTahunLalu[key]) terpakaiTahunLalu[key] = { Tahunan: 0, Akumulasi: 0, Khusus: 0 };
          const deduction = getCutiDeductionCategory(r);
          if (deduction.isDeducted && deduction.category) {
            terpakaiTahunLalu[key][deduction.category] = (terpakaiTahunLalu[key][deduction.category] || 0) + deduction.count;
          }
        });

        for (const emp of allKaryawan) {
          let jTahunanBaru = 12;
          let jKhusus = 4;
          let jAkumulasiBaru = 0;

          const jatahTahunanLama = toNumber(emp.jatah_cuti_tahunan ?? emp.jatah_tahunan ?? 12);
          const used = terpakaiTahunLalu[emp.nama_karyawan] || { Tahunan: 0, Akumulasi: 0 };

          const sisaLaluManual = emp.sisa_cuti_tahun_lalu;
          const adaInputManual = sisaLaluManual !== undefined && sisaLaluManual !== null && sisaLaluManual !== "";
          const sisaTahunanAktual = Math.max(jatahTahunanLama - used.Tahunan, 0);
          const totalSisaUntukCarry = adaInputManual ? toNumber(sisaLaluManual) : sisaTahunanAktual;

          if (emp.tanggal_join) {
            const join = smartParseDate(emp.tanggal_join);
            if (join) {
              const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
              const tenureYears = diffMonths / 12;

              if (diffMonths >= 12) {
                if (tenureYears >= 10 || diffMonths >= 120) jTahunanBaru = 16;
                else if (tenureYears >= 8 || diffMonths >= 96) jTahunanBaru = 14;
                else if (tenureYears >= 6 || diffMonths >= 72) jTahunanBaru = 13;
                else jTahunanBaru = 12;
              } else if (diffMonths >= 3) {
                jTahunanBaru = diffMonths;
              } else {
                jTahunanBaru = 0;
              }

              // Ketentuan carryover cuti akumulasi:
              // - 0 s/d < 3 tahun: 0%
              // - 3 s/d < 5 tahun: 50%
              // - 5 tahun ke atas: 100%
              if (tenureYears >= 5 || diffMonths >= 60) {
                jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 1.0);
              } else if (tenureYears >= 3 || diffMonths >= 36) {
                jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 0.5);
              } else {
                jAkumulasiBaru = 0;
              }
            } else {
              jTahunanBaru = 12;
              jAkumulasiBaru = 0;
            }
          } else {
            jTahunanBaru = 12;
            jAkumulasiBaru = 0;
          }

          await syncSaveEmployeeLeave(emp, {
            jatah_cuti_tahunan: jTahunanBaru, jatah_tahunan: jTahunanBaru,
            jatah_cuti_khusus: jKhusus, jatah_khusus: jKhusus,
            jatah_cuti_akumulasi: jAkumulasiBaru, jatah_akumulasi: jAkumulasiBaru,
            sisa_cuti_tahun_lalu: null,
            cuti_akumulasi_expired: `30 Juni ${nextYear}`
          });
        }

 toast("Kalkulasi & Reset Tahunan Selesai Berhasil (mengacu SK No.018/HRGA-AJ/XII/2024)!", "success");
 await loadData();
 } catch (err) {
 console.error(err);
 toast("Terjadi kesalahan saat mereset data.", "error");
 } finally {
 btnReset.disabled = false;
 btnReset.innerHTML = `<i class="fa-solid fa-rotate"></i> Reset Otomatis`;
 }
 };
 }

  function renderRiwayatRows(myLeaves) {
    if (!myLeaves.length) return `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada riwayat cuti.</td></tr>`;
    return myLeaves.map(c => {
      const ded = getCutiDeductionCategory(c);
      let badgeClass = "bg-blue-50 text-blue-700 border-blue-200";
      let badgeLabel = `${c.count} Hari (Tahunan)`;

      if (ded.category === "Khusus") {
        badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
        badgeLabel = `${c.count} Hari (Khusus)`;
      } else if (ded.category === "Akumulasi") {
        badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
        badgeLabel = `${c.count} Hari (Akumulasi)`;
      } else if (ded.category === "Potong Gaji") {
        badgeClass = "bg-rose-50 text-rose-700 border-rose-200";
        badgeLabel = `${c.count} Hari (Potong Gaji)`;
      } else if (ded.category === "Tidak Dipotong") {
        badgeClass = "bg-slate-100 text-slate-600 border-slate-200";
        badgeLabel = `Bebas Potongan`;
      }

      return `
  <tr class="hover:bg-slate-50" data-cuti-id="${c.id}">
  <td class="p-3 font-medium">${fmtDateShort(c.tanggal)}</td>
  <td class="p-3">${escapeHtml(c.type_cuti)}</td>
  <td class="p-3">${escapeHtml(c.keterangan_cuti || "-")}</td>
  <td class="p-3 text-center"><span class="inline-block border px-2.5 py-0.5 rounded-full text-[11px] font-bold ${badgeClass}">${badgeLabel}</span></td>
  <td class="p-3 text-right whitespace-nowrap">
  <button type="button" data-pdf-cuti="${c.id}" class="text-emerald-700 hover:underline font-bold mr-3 inline-flex items-center gap-1">
   <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
   Download PDF
 </button>
 <button type="button" data-print-cuti="${c.id}" class="text-slate-600 hover:underline font-medium mr-3">Cetak</button>
  ${canManage ? `
  <button type="button" data-edit-cuti="${c.id}" class="text-blue-600 hover:underline font-medium mr-3">Edit</button>
  <button type="button" data-del-cuti="${c.id}" class="text-red-600 hover:underline font-medium">Hapus</button>
  ` : ''}
  </td>
  </tr>
  `;
    }).join("");
  }

 function wireRiwayatActions(m, k) {
    const tbody = m.querySelector("#tbody-riwayat-cuti");
    if (!tbody) return;

    tbody.querySelectorAll("[data-pdf-cuti]").forEach(btn => {
      btn.onclick = () => {
        const rowId = btn.dataset.pdfCuti;
        const row = allCuti.find(c => String(c.id) === String(rowId));
        if (row) {
          downloadFormCutiPdf({
            ...row,
            nama_pemohon: k.nama_karyawan,
            nik: k.nik || "-",
            jabatan: k.jabatan || "-",
            cabang: k.cabang || "-",
            kategori_cuti: row.type_cuti,
            tanggal_mulai: row.tanggal,
            tanggal_selesai: row.tanggal_selesai || row.tanggal,
            jumlah_hari: row.count,
            alasan: row.keterangan_cuti,
            status_final: "APPROVED FINAL"
          });
        } else {
          toast("Data riwayat cuti tidak ditemukan", "error");
        }
      };
    });

    tbody.querySelectorAll("[data-print-cuti]").forEach(btn => {
      btn.onclick = () => {
        const rowId = btn.dataset.printCuti;
        const row = allCuti.find(c => String(c.id) === String(rowId));
        if (row) {
          printFormCutiFisik({
            ...row,
            nama_pemohon: k.nama_karyawan,
            nik: k.nik || "-",
            jabatan: k.jabatan || "-",
            cabang: k.cabang || "-",
            kategori_cuti: row.type_cuti,
            tanggal_mulai: row.tanggal,
            tanggal_selesai: row.tanggal_selesai || row.tanggal,
            jumlah_hari: row.count,
            alasan: row.keterangan_cuti,
            status_final: "APPROVED FINAL"
          });
        } else {
          toast("Data riwayat cuti tidak ditemukan", "error");
        }
      };
    });

    if (!canManage) return;

    tbody.querySelectorAll("[data-del-cuti]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.delCuti;
        const ok = await confirmDialog("Hapus data cuti ini secara permanen? Saldo cuti karyawan akan otomatis terhitung ulang.", { title: "Hapus Riwayat Cuti" });
        if (!ok) return;
        try {
          await fsDelete(COL.MASTER_CUTI, id);
          toast("Riwayat cuti berhasil dihapus", "success");
          allCuti = allCuti.filter(c => String(c.id) !== String(id));
          calculateBalances();
          renderCards(allKaryawan);
          renderTable(allKaryawan);
          closeModal();
          const refreshed = allKaryawan.find(x => x.id === k.id);
          if (refreshed) openEmployeeModal(refreshed, { defaultTab: "riwayat" });
        } catch (e) {
          toast("Gagal menghapus: " + e.message, "error");
        }
      };
    });

    tbody.querySelectorAll("[data-edit-cuti]").forEach(btn => {
      btn.onclick = () => {
        const rowId = btn.dataset.editCuti;
        const row = allCuti.find(c => String(c.id) === String(rowId));
        if (row) {
          openEditCutiModal(row, k);
        } else {
          toast("Data cuti tidak ditemukan", "error");
        }
      };
    });
  }

  function openEditCutiModal(row, k) {
    if (!row) {
      toast("Data cuti tidak ditemukan", "error");
      return;
    }

    const currentConfigs = (leaveConfig && leaveConfig.length ? leaveConfig : DEFAULT_LEAVE_TYPES);
    let matched = false;
    let optLeaveTypes = currentConfigs.map(c => {
      const isSelected = row.type_cuti && (
        row.type_cuti === `${c.id} - ${c.name}` ||
        row.type_cuti === c.name ||
        row.type_cuti.startsWith(c.id + " ") ||
        row.type_cuti.startsWith(c.id + " -") ||
        (row.potong_jatah && row.potong_jatah === c.potong && row.type_cuti.toLowerCase().includes(c.name.toLowerCase()))
      );
      if (isSelected) matched = true;
      return `<option value="${c.id}" ${isSelected ? "selected" : ""} data-potong="${c.potong}" data-count="${c.count || 1}">${c.id} - ${c.name}</option>`;
    }).join("");

    if (!matched && row.type_cuti) {
      optLeaveTypes = `<option value="CUSTOM" selected data-potong="${row.potong_jatah || 'Tahunan'}" data-count="${row.count || 1}">${escapeHtml(row.type_cuti)}</option>` + optLeaveTypes;
    }

    openModal({
      title: `Edit Riwayat Cuti — ${escapeHtml(k.nama_karyawan)}`,
      size: "md",
      bodyHtml: `
        <form id="form-edit-cuti" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Mulai</label>
            <input type="date" id="edit-tanggal" required value="${row.tanggal || ""}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Selesai</label>
            <input type="date" id="edit-tanggal-selesai" value="${row.tanggal_selesai || row.tanggal || ""}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
            <p class="text-[11px] text-slate-400 mt-1">Dipakai laporan absensi utk menandai SEMUA hari dalam rentang cuti ini.</p>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Jenis Cuti</label>
            <select id="edit-jenis" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none bg-white focus:border-maroon-400">${optLeaveTypes}</select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Keterangan / Alasan</label>
            <input type="text" id="edit-keterangan" value="${escapeHtml(row.keterangan_cuti || "")}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400" placeholder="Keterangan cuti...">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Potong Saldo (Hari)</label>
              <input type="number" step="0.5" id="edit-count" required value="${row.count ?? 1}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none text-center font-bold focus:border-maroon-400">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Tipe Pemotongan</label>
              <select id="edit-potong-jatah" class="w-full px-3 py-2 text-sm border rounded-lg outline-none bg-white focus:border-maroon-400">
                <option value="Tahunan" ${(row.potong_jatah || "Tahunan") === "Tahunan" ? "selected" : ""}>Tahunan</option>
                <option value="Khusus" ${row.potong_jatah === "Khusus" ? "selected" : ""}>Khusus</option>
                <option value="Akumulasi" ${row.potong_jatah === "Akumulasi" ? "selected" : ""}>Akumulasi</option>
                <option value="Tidak Dipotong" ${row.potong_jatah === "Tidak Dipotong" ? "selected" : ""}>Tidak Dipotong</option>
              </select>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button type="button" id="btn-edit-cuti-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button type="button" id="btn-edit-cuti-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-bold shadow transition">Simpan Perubahan</button>
      `,
      onMount: (m2) => {
        const selJenis = m2.querySelector("#edit-jenis");
        const selPotong = m2.querySelector("#edit-potong-jatah");
        const inMulai = m2.querySelector("#edit-tanggal");
        const inAkhir = m2.querySelector("#edit-tanggal-selesai");
        const inCount = m2.querySelector("#edit-count");

        if (selJenis && selPotong) {
          selJenis.onchange = () => {
            const opt = selJenis.options[selJenis.selectedIndex];
            if (opt && opt.dataset.potong) {
              selPotong.value = opt.dataset.potong;
            }
          };
        }

        m2.querySelector("#btn-edit-cuti-batal").onclick = () => {
          closeModal();
          const refreshed = allKaryawan.find(x => x.id === k.id);
          openEmployeeModal(refreshed || k, { defaultTab: "riwayat" });
        };

        m2.querySelector("#btn-edit-cuti-simpan").onclick = async () => {
          const form = m2.querySelector("#form-edit-cuti");
          if (!form.reportValidity()) return;
          const opt = selJenis ? selJenis.options[selJenis.selectedIndex] : null;
          const typeCutiVal = opt ? opt.text : (row.type_cuti || "Cuti");
          const potongJatahVal = selPotong ? selPotong.value : (opt?.dataset.potong || row.potong_jatah || "Tahunan");
          const tglMulai = inMulai.value;
          const tglSelesai = inAkhir.value || tglMulai;
          const jmlHari = parseFloat(inCount.value) || 0;
          const keterangan = m2.querySelector("#edit-keterangan").value.trim();

          const btnSimpan = m2.querySelector("#btn-edit-cuti-simpan");
          btnSimpan.disabled = true;
          btnSimpan.textContent = "Menyimpan...";

          const payload = {
            tanggal: tglMulai,
            tanggal_selesai: tglSelesai,
            type_cuti: typeCutiVal,
            potong_jatah: potongJatahVal,
            keterangan_cuti: keterangan,
            count: jmlHari,
            tahun: new Date(tglMulai).getFullYear(),
            bulan: new Date(tglMulai).toLocaleString('id-ID', { month: 'long' })
          };

          try {
            const docId = row.id || row.doc_id || row.record_id_cuti;
            if (!docId) throw new Error("ID dokumen cuti tidak ditemukan.");
            await fsUpdate(COL.MASTER_CUTI, docId, payload);
            toast("Riwayat cuti berhasil diperbarui", "success");
            Object.assign(row, payload);
            calculateBalances();
            renderCards(allKaryawan);
            renderTable(allKaryawan);
            closeModal();
            const refreshed = allKaryawan.find(x => x.id === k.id);
            openEmployeeModal(refreshed || k, { defaultTab: "riwayat" });
          } catch (e) {
            toast("Gagal menyimpan perubahan: " + e.message, "error");
            btnSimpan.disabled = false;
            btnSimpan.textContent = "Simpan Perubahan";
          }
        };
      }
    });
  }

  function openEmployeeModal(k, options = {}) {
    let sisa = getSisa(k);
    const myLeaves = allCuti.filter(c => c.nama_karyawan === k.nama_karyawan).sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
    const optLeaveTypes = leaveConfig.map(c => `<option value="${c.id}" data-potong="${c.potong}" data-count="${c.count}">${c.id} - ${c.name}</option>`).join("");

    openModal({
      title: "Manajemen Cuti Karyawan",
      size: "lg",
      bodyHtml: `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
          <div class="flex items-center gap-3">
            ${avatar(k.nama_karyawan, "w-12 h-12 text-sm")}
            <div>
              <h3 class="font-bold text-base text-slate-800">${escapeHtml(k.nama_karyawan)}</h3>
              <p class="text-xs text-slate-500">${escapeHtml(k.nik || "-")} • ${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.cabang || "-")}</p>
            </div>
          </div>
          ${canManage ? `
          <button type="button" id="btn-quick-switch-edit-jatah" class="text-xs bg-maroon-50 hover:bg-maroon-100 text-maroon-700 font-bold px-3 py-1.5 rounded-lg border border-maroon-200 transition flex items-center gap-1.5 self-start sm:self-center shadow-2xs">
            <i class="fa-solid fa-pen-to-square"></i> Edit Jatah Manual
          </button>` : ''}
        </div>

        <!-- RINCIAN SALDO CUTI: SALDO AWAL, TERPAKAI & SISA SALDO -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4">
          <!-- Tahunan -->
          <div class="bg-white p-2.5 rounded-lg border border-blue-100 shadow-xs flex flex-col justify-between">
            <div class="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span class="text-[10px] font-bold text-blue-900 uppercase">Cuti Tahunan</span>
              <span class="text-[10px] font-semibold text-slate-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">Awal: <strong id="modal-stat-awal-tahunan">${sisa.jatahTahunan}</strong></span>
            </div>
            <div class="flex justify-between items-baseline pt-1">
              <div>
                <span class="text-[9px] uppercase font-semibold text-slate-400 block">Terpakai</span>
                <span class="text-xs font-bold text-amber-700 font-mono">${sisa.used.Tahunan} Hari</span>
              </div>
              <div class="text-right">
                <span class="text-[9px] uppercase font-semibold text-slate-400 block">Sisa Saldo</span>
                <span id="modal-stat-sisa-tahunan" class="text-lg font-black text-blue-700 font-mono">${sisa.Tahunan}</span>
                <span class="text-[10px] font-medium text-slate-500">Hari</span>
              </div>
            </div>
          </div>

          <!-- Khusus -->
          <div class="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-xs flex flex-col justify-between">
            <div class="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span class="text-[10px] font-bold text-emerald-900 uppercase">Cuti Khusus</span>
              <span class="text-[10px] font-semibold text-slate-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">Awal: <strong id="modal-stat-awal-khusus">${sisa.jatahKhusus}</strong></span>
            </div>
            <div class="flex justify-between items-baseline pt-1">
              <div>
                <span class="text-[9px] uppercase font-semibold text-slate-400 block">Terpakai</span>
                <span class="text-xs font-bold text-amber-700 font-mono">${sisa.used.Khusus} Hari</span>
              </div>
              <div class="text-right">
                <span class="text-[9px] uppercase font-semibold text-slate-400 block">Sisa Saldo</span>
                <span id="modal-stat-sisa-khusus" class="text-lg font-black text-emerald-700 font-mono">${sisa.Khusus}</span>
                <span class="text-[10px] font-medium text-slate-500">Hari</span>
              </div>
            </div>
          </div>

          <!-- Akumulasi -->
          <div class="bg-white p-2.5 rounded-lg border border-amber-100 shadow-xs flex flex-col justify-between">
            <div class="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span class="text-[10px] font-bold text-amber-900 uppercase">Carryover (Akumulasi)</span>
              <span class="text-[10px] font-semibold text-slate-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-100">Awal: <strong id="modal-stat-awal-akumulasi">${sisa.jatahAkumulasi}</strong></span>
            </div>
            <div class="flex justify-between items-baseline pt-1">
              <div>
                <span class="text-[9px] uppercase font-semibold text-slate-400 block">Terpakai</span>
                <span class="text-xs font-bold text-amber-700 font-mono">${sisa.used.Akumulasi} Hari</span>
              </div>
              <div class="text-right">
                <span class="text-[9px] uppercase font-semibold text-slate-400 block">Sisa Saldo</span>
                <span id="modal-stat-sisa-akumulasi" class="text-lg font-black text-amber-700 font-mono">${sisa.Akumulasi}</span>
                <span class="text-[10px] font-medium text-slate-500">Hari</span>
              </div>
            </div>
          </div>
        </div>

        ${canManage ? `
        <div class="flex border-b border-slate-200 mb-4 gap-2">
          <button id="tab-input-cuti" class="px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700 transition">Input Cuti Baru</button>
          <button id="tab-riwayat-cuti" class="px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition">Riwayat Cuti</button>
          <button id="tab-edit-jatah" class="px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition flex items-center gap-1.5"><i class="fa-solid fa-pen-to-square text-xs text-maroon-700"></i> Edit Jatah Cuti</button>
        </div>` : `
        <div class="flex border-b border-slate-200 mb-4">
          <span class="px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700">Riwayat Cuti</span>
          <span class="ml-auto self-center text-[11px] text-slate-400 pr-1">Mode lihat saja</span>
        </div>`}

        <!-- PANEL 1: INPUT CUTI BARU -->
        <div id="panel-input-cuti" class="${canManage ? "" : "hidden"}">
          <form id="form-input-cuti" class="space-y-4">
            <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
              <p class="text-xs text-blue-800 font-medium">*Formulir pengajuan ini akan otomatis dicetak ke PDF untuk ditandatangani setelah disimpan.</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-xs font-bold text-slate-600 mb-1">Jenis Cuti</label>
                <select id="inp-jenis" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 bg-white">
                  <option value="">Pilih Jenis Cuti...</option>
                  ${optLeaveTypes}
                </select>
              </div>
              <div class="col-span-2 sm:col-span-1">
                <label class="block text-xs font-bold text-slate-600 mb-1">Alamat / No HP Saat Cuti</label>
                <input type="text" id="inp-kontak" value="${escapeHtml(k.alamat || '')} / ${escapeHtml(k.no_hp_aktif || '')}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4" id="wrap-tgl">
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Mulai Tanggal</label>
                <input type="date" id="inp-tgl-mulai" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
              </div>
              <div id="wrap-tgl-akhir">
                <label class="block text-xs font-bold text-slate-600 mb-1">Sampai Tanggal</label>
                <input type="date" id="inp-tgl-akhir" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
              </div>
            </div>

            <div class="space-y-3 hidden" id="wrap-jam">
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Pilihan Sesi Cuti Setengah Hari</label>
                <select id="inp-sesi-cuti" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 bg-white">
                  <option value="Cuti Pagi">Cuti Pagi (Masuk Siang: 08:00 - 12:00)</option>
                  <option value="Cuti Siang">Cuti Siang (Pulang Awal: 12:00 - 17:00)</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-600 mb-1">Jam Keluar / Absen Cuti</label>
                  <input type="time" id="inp-jam-keluar" value="08:00" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-600 mb-1">Jam Kembali / Masuk Kerja</label>
                  <input type="time" id="inp-jam-kembali" value="12:00" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="col-span-2">
                <label class="block text-xs font-bold text-slate-600 mb-1">Keterangan / Alasan</label>
                <input type="text" id="inp-alasan" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400" placeholder="Keperluan keluarga, sakit, dll...">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Potong Saldo (Hari)</label>
                <input type="number" id="inp-hari" required step="0.5" class="w-full px-3 py-2 text-sm border rounded-lg outline-none bg-slate-50 font-bold text-maroon-700 text-center">
                <p id="lbl-potong-tipe" class="text-[10px] text-center text-slate-400 mt-1 uppercase">-</p>
              </div>
            </div>

            <!-- LIVE PRATINJAU PEMOTONGAN SALDO -->
            <div id="box-preview-potong" class="bg-amber-50/80 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs text-amber-950">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-calculator text-amber-600"></i>
                <span id="txt-preview-info">Pilih jenis cuti untuk melihat estimasi saldo setelah pemotongan.</span>
              </div>
              <span id="txt-preview-hasil" class="font-mono font-bold text-xs text-amber-900"></span>
            </div>
          </form>
        </div>

        <!-- PANEL 2: RIWAYAT CUTI -->
        <div id="panel-riwayat-cuti" class="${canManage ? "hidden" : ""}">
          <div class="max-h-80 overflow-y-auto border border-slate-100 rounded-lg">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr><th class="p-3">Tanggal</th><th class="p-3">Jenis</th><th class="p-3">Keterangan</th><th class="p-3 text-center">Potongan</th>${canManage ? '<th class="p-3 text-right">Aksi</th>' : ''}</tr>
              </thead>
              <tbody id="tbody-riwayat-cuti" class="divide-y divide-slate-100">
                ${renderRiwayatRows(myLeaves)}
              </tbody>
            </table>
          </div>
        </div>

        <!-- PANEL 3: EDIT JATAH CUTI (MANUAL HRD) -->
        ${canManage ? `
        <div id="panel-edit-jatah" class="hidden space-y-4">
          <div class="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-950 text-xs leading-relaxed space-y-1">
            <div class="font-bold flex items-center gap-1.5 text-sm text-amber-900">
              <i class="fa-solid fa-pen-nib text-maroon-700"></i> Form Edit Jatah Cuti Manual HRD
            </div>
            <p>HRD memiliki otoritas penuh untuk mengatur dan mengubah kuota jatah cuti karyawan di bawah ini secara langsung.</p>
          </div>

          <form id="form-edit-jatah" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Jatah Cuti Tahunan (Awal)</label>
                <div class="relative">
                  <input type="number" id="inp-edit-tahunan" step="0.5" min="0" required value="${sisa.jatahTahunan}" class="w-full px-3 py-2 text-sm font-bold text-blue-800 border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white">
                  <span class="absolute right-3 top-2 text-xs text-slate-400 font-medium">Hari</span>
                </div>
                <p class="text-[10px] text-slate-400 mt-1">Terpakai: <b>${sisa.used.Tahunan} Hari</b></p>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Jatah Cuti Khusus (Awal)</label>
                <div class="relative">
                  <input type="number" id="inp-edit-khusus" step="0.5" min="0" required value="${sisa.jatahKhusus}" class="w-full px-3 py-2 text-sm font-bold text-emerald-800 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white">
                  <span class="absolute right-3 top-2 text-xs text-slate-400 font-medium">Hari</span>
                </div>
                <p class="text-[10px] text-slate-400 mt-1">Terpakai: <b>${sisa.used.Khusus} Hari</b></p>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Jatah Akumulasi (Carryover)</label>
                <div class="relative">
                  <input type="number" id="inp-edit-akumulasi" step="0.5" min="0" required value="${sisa.jatahAkumulasi}" class="w-full px-3 py-2 text-sm font-bold text-amber-800 border border-slate-200 rounded-lg outline-none focus:border-amber-500 bg-white">
                  <span class="absolute right-3 top-2 text-xs text-slate-400 font-medium">Hari</span>
                </div>
                <p class="text-[10px] text-slate-400 mt-1">Terpakai: <b>${sisa.used.Akumulasi} Hari</b></p>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Sisa Cuti Tahun Lalu (Manual HRD)</label>
                <input type="number" id="inp-edit-sisa-lalu" step="0.5" min="0" value="${k.sisa_cuti_tahun_lalu ?? ""}" placeholder="Opsional (basis kalkulasi carryover)" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 bg-white">
                <p class="text-[10px] text-slate-400 mt-1">Jika diisi, jatah akumulasi dapat otomatis dihitung sesuai masa kerja.</p>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Batas Kedaluwarsa Cuti Akumulasi</label>
                <input type="text" id="inp-edit-expired" value="${escapeHtml(k.cuti_akumulasi_expired || '')}" placeholder="Contoh: 30 Juni 2026" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 bg-white">
                <p class="text-[10px] text-slate-400 mt-1">Default sesuai SK: 30 Juni tahun berjalan.</p>
              </div>
            </div>

            <!-- Pratinjau kalkulasi sisa saldo -->
            <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <div class="text-[11px] font-bold text-slate-600 mb-2 uppercase tracking-wide">Pratinjau Sisa Saldo Setelah Disimpan:</div>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="bg-white p-2 rounded-lg border border-blue-100">
                  <span class="text-[10px] text-slate-400 block font-medium">Sisa Tahunan</span>
                  <span id="preview-modal-sisa-tahunan" class="text-base font-extrabold text-blue-700 font-mono">${sisa.Tahunan} Hari</span>
                </div>
                <div class="bg-white p-2 rounded-lg border border-emerald-100">
                  <span class="text-[10px] text-slate-400 block font-medium">Sisa Khusus</span>
                  <span id="preview-modal-sisa-khusus" class="text-base font-extrabold text-emerald-700 font-mono">${sisa.Khusus} Hari</span>
                </div>
                <div class="bg-white p-2 rounded-lg border border-amber-100">
                  <span class="text-[10px] text-slate-400 block font-medium">Sisa Akumulasi</span>
                  <span id="preview-modal-sisa-akumulasi" class="text-base font-extrabold text-amber-700 font-mono">${sisa.Akumulasi} Hari</span>
                </div>
              </div>
            </div>

            <div class="pt-2">
              <button type="button" id="btn-save-edit-jatah" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan Jatah Cuti
              </button>
            </div>
          </form>
        </div>` : ''}
      `,
      footerHtml: canManage ? `
        <button id="btn-modal-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-modal-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-bold shadow transition">Simpan & Cetak PDF</button>
      ` : `
        <button id="btn-modal-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>
      `,
      onMount: (m) => {
        const tabInput = m.querySelector("#tab-input-cuti");
        const tabRiwayat = m.querySelector("#tab-riwayat-cuti");
        const tabEditJatah = m.querySelector("#tab-edit-jatah");
        const pnlInput = m.querySelector("#panel-input-cuti");
        const pnlRiwayat = m.querySelector("#panel-riwayat-cuti");
        const pnlEditJatah = m.querySelector("#panel-edit-jatah");
        const btnSimpan = m.querySelector("#btn-modal-simpan");
        const btnQuickEdit = m.querySelector("#btn-quick-switch-edit-jatah");

        const switchTab = (tab) => {
          if (tab === "riwayat") {
            if (tabRiwayat) tabRiwayat.className = "px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700 transition";
            if (tabInput) tabInput.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition";
            if (tabEditJatah) tabEditJatah.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition flex items-center gap-1.5";
            if (pnlRiwayat) pnlRiwayat.classList.remove("hidden");
            if (pnlInput) pnlInput.classList.add("hidden");
            if (pnlEditJatah) pnlEditJatah.classList.add("hidden");
            if (btnSimpan) btnSimpan.classList.add("hidden");
          } else if (tab === "edit") {
            if (tabEditJatah) tabEditJatah.className = "px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700 transition flex items-center gap-1.5";
            if (tabInput) tabInput.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition";
            if (tabRiwayat) tabRiwayat.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition";
            if (pnlEditJatah) pnlEditJatah.classList.remove("hidden");
            if (pnlInput) pnlInput.classList.add("hidden");
            if (pnlRiwayat) pnlRiwayat.classList.add("hidden");
            if (btnSimpan) btnSimpan.classList.add("hidden");
          } else {
            if (tabInput) tabInput.className = "px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700 transition";
            if (tabRiwayat) tabRiwayat.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition";
            if (tabEditJatah) tabEditJatah.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700 transition flex items-center gap-1.5";
            if (pnlInput) pnlInput.classList.remove("hidden");
            if (pnlRiwayat) pnlRiwayat.classList.add("hidden");
            if (pnlEditJatah) pnlEditJatah.classList.add("hidden");
            if (btnSimpan) btnSimpan.classList.remove("hidden");
          }
        };

        if (tabInput && tabRiwayat) {
          tabInput.onclick = () => switchTab("input");
          tabRiwayat.onclick = () => switchTab("riwayat");
        }
        if (tabEditJatah) {
          tabEditJatah.onclick = () => switchTab("edit");
        }
        if (btnQuickEdit) {
          btnQuickEdit.onclick = () => switchTab("edit");
        }

        if (options && options.defaultTab === "riwayat") {
          switchTab("riwayat");
        } else if (options && options.defaultTab === "edit") {
          switchTab("edit");
        }

        // Wiring Edit Jatah Manual Form
        if (pnlEditJatah) {
          const inEditTahunan = m.querySelector("#inp-edit-tahunan");
          const inEditKhusus = m.querySelector("#inp-edit-khusus");
          const inEditAkumulasi = m.querySelector("#inp-edit-akumulasi");
          const inEditSisaLalu = m.querySelector("#inp-edit-sisa-lalu");
          const inEditExpired = m.querySelector("#inp-edit-expired");
          const btnSaveEditJatah = m.querySelector("#btn-save-edit-jatah");

          const prevTahunan = m.querySelector("#preview-modal-sisa-tahunan");
          const prevKhusus = m.querySelector("#preview-modal-sisa-khusus");
          const prevAkumulasi = m.querySelector("#preview-modal-sisa-akumulasi");

          const updateEditPreviews = () => {
            const valTahunan = parseFloat(inEditTahunan?.value) || 0;
            const valKhusus = parseFloat(inEditKhusus?.value) || 0;
            const valAkumulasi = parseFloat(inEditAkumulasi?.value) || 0;

            const sisaT = Math.max(0, valTahunan - sisa.used.Tahunan);
            const sisaK = Math.max(0, valKhusus - sisa.used.Khusus);
            const sisaA = Math.max(0, valAkumulasi - sisa.used.Akumulasi);

            if (prevTahunan) prevTahunan.textContent = `${sisaT} Hari`;
            if (prevKhusus) prevKhusus.textContent = `${sisaK} Hari`;
            if (prevAkumulasi) prevAkumulasi.textContent = `${sisaA} Hari`;
          };

          if (inEditTahunan) inEditTahunan.oninput = updateEditPreviews;
          if (inEditKhusus) inEditKhusus.oninput = updateEditPreviews;
          if (inEditAkumulasi) inEditAkumulasi.oninput = updateEditPreviews;

          if (inEditSisaLalu) {
            inEditSisaLalu.onchange = () => {
              const val = inEditSisaLalu.value === "" ? null : (parseFloat(inEditSisaLalu.value) || 0);
              if (val !== null && val > 0 && inEditAkumulasi) {
                const autoAkum = calculateCarryoverJatah(val, k.tanggal_join);
                inEditAkumulasi.value = autoAkum;
                updateEditPreviews();
              }
            };
          }

          if (btnSaveEditJatah) {
            btnSaveEditJatah.onclick = async () => {
              btnSaveEditJatah.disabled = true;
              btnSaveEditJatah.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

              try {
                const valTahunan = parseFloat(inEditTahunan.value) || 0;
                const valKhusus = parseFloat(inEditKhusus.value) || 0;
                const valAkumulasi = parseFloat(inEditAkumulasi.value) || 0;
                const valSisaLalu = inEditSisaLalu.value === "" ? null : (parseFloat(inEditSisaLalu.value) || 0);
                const valExpired = inEditExpired.value.trim();

                const payload = {
                  jatah_cuti_tahunan: valTahunan,
                  jatah_tahunan: valTahunan,
                  jatah_cuti_khusus: valKhusus,
                  jatah_khusus: valKhusus,
                  jatah_cuti_akumulasi: valAkumulasi,
                  jatah_akumulasi: valAkumulasi,
                  sisa_cuti_tahun_lalu: valSisaLalu,
                  cuti_akumulasi_expired: valExpired || null
                };

                await syncSaveEmployeeLeave(k, payload);

                calculateBalances();
                sisa = getSisa(k);

                // Update modal top stats
                const stAwalT = m.querySelector("#modal-stat-awal-tahunan");
                const stSisaT = m.querySelector("#modal-stat-sisa-tahunan");
                const stAwalK = m.querySelector("#modal-stat-awal-khusus");
                const stSisaK = m.querySelector("#modal-stat-sisa-khusus");
                const stAwalA = m.querySelector("#modal-stat-awal-akumulasi");
                const stSisaA = m.querySelector("#modal-stat-sisa-akumulasi");

                if (stAwalT) stAwalT.textContent = sisa.jatahTahunan;
                if (stSisaT) stSisaT.textContent = sisa.Tahunan;
                if (stAwalK) stAwalK.textContent = sisa.jatahKhusus;
                if (stSisaK) stSisaK.textContent = sisa.Khusus;
                if (stAwalA) stAwalA.textContent = sisa.jatahAkumulasi;
                if (stSisaA) stSisaA.textContent = sisa.Akumulasi;

                renderCards(allKaryawan);
                renderTable(allKaryawan);

                toast(`Jatah cuti ${k.nama_karyawan} berhasil disimpan dan diperbarui!`, "success");
              } catch (err) {
                console.error(err);
                toast("Gagal menyimpan jatah cuti: " + err.message, "error");
              } finally {
                btnSaveEditJatah.disabled = false;
                btnSaveEditJatah.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan Jatah Cuti`;
              }
            };
          }
        }

        wireRiwayatActions(m, k);

        const selJenis = m.querySelector("#inp-jenis");
        const wrapTglAkhir = m.querySelector("#wrap-tgl-akhir");
        const wrapJam = m.querySelector("#wrap-jam");
        const selSesi = m.querySelector("#inp-sesi-cuti");
        const inJamKeluar = m.querySelector("#inp-jam-keluar");
        const inJamKembali = m.querySelector("#inp-jam-kembali");

        const inMulai = m.querySelector("#inp-tgl-mulai");
        const inAkhir = m.querySelector("#inp-tgl-akhir");
        const inHari = m.querySelector("#inp-hari");
        const inAlasan = m.querySelector("#inp-alasan");
        const lblPotong = m.querySelector("#lbl-potong-tipe");
        const txtPreviewInfo = m.querySelector("#txt-preview-info");
        const txtPreviewHasil = m.querySelector("#txt-preview-hasil");

        let curCfg = null;

        const updateCalculations = () => {
          if (!curCfg) {
            if (txtPreviewInfo) txtPreviewInfo.textContent = "Pilih jenis cuti untuk melihat estimasi saldo setelah pemotongan.";
            if (txtPreviewHasil) txtPreviewHasil.textContent = "";
            return;
          }
          const isHalf = curCfg.id === "CT-02";
          if (isHalf) {
            inHari.value = 0.5;
            if (inAkhir) inAkhir.value = inMulai.value;
          } else {
            if (inMulai.value && inAkhir.value) {
              const d1 = new Date(inMulai.value);
              const d2 = new Date(inAkhir.value);
              if (d2 >= d1) {
                const diffTime = Math.abs(d2 - d1);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                inHari.value = diffDays;
              } else {
                inHari.value = 1;
              }
            } else {
              inHari.value = curCfg.count || 1;
            }
          }

          const countVal = parseFloat(inHari.value) || 0;
          if (curCfg.potong === "Tahunan") {
            const estimasiSisa = sisa.Tahunan - countVal;
            if (txtPreviewInfo) txtPreviewInfo.innerHTML = `Potong Jatah: <b>Cuti Tahunan</b> | Saldo Awal: <b>${sisa.jatahTahunan}</b> Hari, Terpakai: <b>${sisa.used.Tahunan}</b> Hari, Pengajuan Ini: <b>${countVal}</b> Hari`;
            if (txtPreviewHasil) txtPreviewHasil.innerHTML = `Estimasi Sisa: <span class="${estimasiSisa < 0 ? 'text-rose-600' : 'text-blue-700'} font-bold text-sm">${estimasiSisa} Hari</span>`;
          } else if (curCfg.potong === "Khusus") {
            const estimasiSisa = sisa.Khusus - countVal;
            if (txtPreviewInfo) txtPreviewInfo.innerHTML = `Potong Jatah: <b>Cuti Khusus</b> | Saldo Awal: <b>${sisa.jatahKhusus}</b> Hari, Terpakai: <b>${sisa.used.Khusus}</b> Hari, Pengajuan Ini: <b>${countVal}</b> Hari`;
            if (txtPreviewHasil) txtPreviewHasil.innerHTML = `Estimasi Sisa: <span class="${estimasiSisa < 0 ? 'text-rose-600' : 'text-emerald-700'} font-bold text-sm">${estimasiSisa} Hari</span>`;
          } else if (curCfg.potong === "Akumulasi") {
            const estimasiSisa = sisa.Akumulasi - countVal;
            if (txtPreviewInfo) txtPreviewInfo.innerHTML = `Potong Jatah: <b>Carryover Akumulasi</b> | Saldo Awal: <b>${sisa.jatahAkumulasi}</b> Hari, Terpakai: <b>${sisa.used.Akumulasi}</b> Hari, Pengajuan Ini: <b>${countVal}</b> Hari`;
            if (txtPreviewHasil) txtPreviewHasil.innerHTML = `Estimasi Sisa: <span class="${estimasiSisa < 0 ? 'text-rose-600' : 'text-amber-700'} font-bold text-sm">${estimasiSisa} Hari</span>`;
          } else {
            if (txtPreviewInfo) txtPreviewInfo.innerHTML = `Tidak memotong saldo cuti tahunan/khusus/akumulasi (${curCfg.potong || 'Izin'})`;
            if (txtPreviewHasil) txtPreviewHasil.innerHTML = `<span class="text-slate-600 font-semibold">Bebas Potongan</span>`;
          }
        };

        if (selJenis) {
          selJenis.onchange = () => {
            curCfg = leaveConfig.find(c => c.id === selJenis.value);
            if (!curCfg) return;
            const isHalf = curCfg.id === "CT-02";
            if (isHalf) {
              wrapTglAkhir.classList.add("hidden");
              wrapJam.classList.remove("hidden");
            } else {
              wrapTglAkhir.classList.remove("hidden");
              wrapJam.classList.add("hidden");
            }
            lblPotong.textContent = "Potong Jatah: " + curCfg.potong;
            updateCalculations();
          };
        }

        if (inMulai) inMulai.onchange = updateCalculations;
        if (inAkhir) inAkhir.onchange = updateCalculations;
        if (inHari) inHari.oninput = updateCalculations;

        if (selSesi) {
          selSesi.onchange = () => {
            if (selSesi.value === "Cuti Pagi") {
              inJamKeluar.value = "08:00";
              inJamKembali.value = "12:00";
            } else {
              inJamKeluar.value = "12:00";
              inJamKembali.value = "17:00";
            }
          };
        }

        m.querySelector("#btn-modal-batal").onclick = closeModal;

        if (btnSimpan) {
          btnSimpan.onclick = async () => {
            const form = m.querySelector("#form-input-cuti");
            if (!form.reportValidity()) return;
            if (!curCfg) {
              toast("Pilih jenis cuti terlebih dahulu", "error");
              return;
            }

            const tglAwal = inMulai.value;
            const tglAkhirVal = curCfg.id === "CT-02" ? tglAwal : (inAkhir.value || tglAwal);
            const countVal = parseFloat(inHari.value) || 1;

            if (curCfg.potong === "Tahunan" && sisa.Tahunan < countVal) {
              toast(`Sisa cuti tahunan tidak mencukupi (${sisa.Tahunan} hari tersisa)`, "error");
              return;
            }
            if (curCfg.potong === "Khusus" && sisa.Khusus < countVal) {
              toast(`Sisa cuti khusus tidak mencukupi (${sisa.Khusus} hari tersisa)`, "error");
              return;
            }
            if (curCfg.potong === "Akumulasi" && sisa.Akumulasi < countVal) {
              toast(`Sisa cuti akumulasi tidak mencukupi (${sisa.Akumulasi} hari tersisa)`, "error");
              return;
            }

            btnSimpan.disabled = true;
            btnSimpan.textContent = "Menyimpan & Mencetak...";

            const payload = {
              nama_karyawan: k.nama_karyawan,
              tanggal: tglAwal,
              tanggal_selesai: tglAkhirVal,
              tahun: new Date(tglAwal).getFullYear(),
              bulan: new Date(tglAwal).toLocaleString('id-ID', { month: 'long' }),
              type_cuti: `${curCfg.id} - ${curCfg.name}`,
              potong_jatah: curCfg.potong,
              count: countVal,
              keterangan_cuti: inAlasan.value,
              nik: k.nik || "-",
              cabang: k.cabang || "-",
              jabatan: k.jabatan || "-",
              createdAt: new Date().toISOString()
            };

            const pdfData = {
              ...payload,
              tgl_akhir: tglAkhirVal,
              isHalfDay: curCfg.id === "CT-02",
              jam_keluar: curCfg.id === "CT-02" ? inJamKeluar.value : "-",
              jam_kembali: curCfg.id === "CT-02" ? inJamKembali.value : "-",
              kontak: m.querySelector("#inp-kontak")?.value || "-",
              alasan: inAlasan.value
            };

            try {
              const newId = await fsAdd(COL.MASTER_CUTI, payload);
              payload.id = newId;
              allCuti.unshift(payload);

              calculateBalances();
              sisa = getSisa(k);

              renderCards(allKaryawan);
              renderTable(allKaryawan);

              closeModal();
              toast("Pengajuan cuti berhasil disimpan", "success");

              generatePdfAndNotify(k, pdfData, sisa);
            } catch (err) {
              console.error(err);
              toast("Gagal menyimpan cuti: " + err.message, "error");
              btnSimpan.disabled = false;
              btnSimpan.textContent = "Simpan & Cetak PDF";
            }
          };
        }
      }
    });
  }

  async function generatePdfAndNotify(k, pdfData, sisa) {
    try {
      toast("Menerbitkan Dokumen Form Cuti...", "info");
      const result = await generateAndSaveCutiDocument({
        nama_karyawan: k.nama_karyawan,
        divisi: k.divisi || k.jabatan || k.cabang || "-",
        jabatan: k.jabatan || "-",
        cabang: k.cabang || "-",
        jenis_cuti: pdfData.type_cuti,
        tipe_hari: pdfData.isHalfDay ? "Setengah Hari" : "Hari Penuh",
        tanggal_mulai: pdfData.tanggal,
        tanggal_selesai: pdfData.tgl_akhir || pdfData.tanggal,
        keterangan_cuti: pdfData.keterangan_cuti,
        kontak: pdfData.kontak,
        jam_keluar: pdfData.jam_keluar,
        jam_kembali: pdfData.jam_kembali,
        sisa_tahunan: sisa.Tahunan,
        sisa_khusus: sisa.Khusus,
        tanggal_pengajuan: fmtDateShort(new Date())
      });
      toast("Dokumen berhasil dibuat", "success");
      const targets = await getTargetsForRole("PEMOHON", k.nama_karyawan);
      for (const t of targets) {
        await notifyUser(t.username, "Pengajuan Cuti Tercatat", `Cuti Anda (${pdfData.tanggal_display || pdfData.tanggal}) telah dicatat HRD.`);
        if (t.email) {
          const emailBody = buildStandardEmailHtml({
            badgeText: "Cuti Tercatat",
            badgeVariant: "green",
            title: "Pengajuan Cuti Anda Telah Dicatat",
            recipientName: k.nama_karyawan,
            introText: `Pengajuan cuti Anda telah berhasil diverifikasi dan dicatat oleh Tim HRD. Dokumen formulir cuti telah diterbitkan secara resmi.`,
            infoList: [
              { label: "Nama Karyawan", value: k.nama_karyawan },
              { label: "Tanggal Cuti", value: fmtDateShort(pdfData.tanggal) },
              { label: "Keperluan", value: pdfData.alasan || "-" }
            ],
            actionUrl: result.pdfUrl,
            actionText: "Unduh / Lihat Dokumen Cuti (PDF) →",
            secondaryNote: "Dokumen cuti resmi ini telah tersimpan dalam arsip sistem HRIS."
          });
          await sendEmailNotif(t.email, `[HRIS Cuti] Pengajuan Cuti Anda Telah Dicatat`, emailBody);
        }
      } 
      window.open(result.pdfUrl, "_blank");
    } catch (err) {
      toast("Gagal generate via Google Apps Script (" + err.message + "), mencetak versi cadangan...", "warning");
      printCutiPdfFallback(k, pdfData, sisa);
    }
  }

  async function printCutiPdfFallback(k, data, sisa) {
 const { downloadHtmlAsPdf, toast, generateStandardFormCutiHtml } = await import("../utils.js");
 toast("Sedang memproses PDF...", "info");

 const html = generateStandardFormCutiHtml({
 namaKaryawan: k.nama_karyawan,
 divisi: k.divisi || k.jabatan || k.cabang || "-",
 jabatan: k.jabatan || "-",
 cabang: k.cabang || "-",
 jenisCuti: data.type_cuti || "Cuti",
 isHalfDay: data.isHalfDay,
 tglMulai: data.tanggal,
 tglSelesai: data.tgl_akhir || data.tanggal,
 jamKeluar: data.jam_keluar || "-",
 jamKembali: data.jam_kembali || "-",
 kontak: data.kontak || "-",
 alasan: data.keterangan_cuti || "-",
 sisaTahunan: sisa ? (sisa.Tahunan ?? 0) : 0,
 sisaKhusus: sisa ? (sisa.Khusus ?? 0) : 0,
 sisaAkumulasi: sisa ? (sisa.Akumulasi ?? 0) : 0,
 tglPengajuan: new Date().toISOString()
 });

 await downloadHtmlAsPdf(html, `Form_Cuti_${escapeHtml(k.nama_karyawan).replace(/\s+/g, "_")}.pdf`);
 toast("PDF berhasil diunduh!", "success");
 }

 container.querySelector("#btn-setting-cuti")?.addEventListener("click", () => {
 openModal({
 title: "Pengaturan Jenis Cuti",
 size: "lg",
 bodyHtml: `
 <div class="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
 <p class="text-xs text-slate-600">Tambah atau ubah jenis cuti yang tersedia di formulir pengajuan. Nilai <strong>Multiplier</strong> adalah pengali jumlah pemotongan per hari (Contoh: Setengah Hari = 0.5, Izin Bebas = 0).</p>
 </div>
 <div class="border border-slate-200 rounded-lg overflow-hidden">
 <table class="w-full text-xs text-left" id="table-cfg-cuti">
 <thead class="bg-slate-100 text-slate-600 border-b border-slate-200">
 <tr><th class="p-2 w-16">Kode</th><th class="p-2">Nama Jenis Cuti</th><th class="p-2">Target Saldo</th><th class="p-2 w-20 text-center">Multiplier</th><th class="p-2 w-12 text-center">Del</th></tr>
 </thead>
 <tbody class="divide-y divide-slate-100 bg-white">
 <!-- Dirender via JS -->
 </tbody>
 </table>
 <div class="bg-slate-50 p-2 text-center border-t border-slate-200">
 <button type="button" id="btn-add-cfg-cuti" class="text-xs font-bold text-maroon-700 hover:underline">+ Tambah Jenis Cuti Baru</button>
 </div>
 </div>
 `,
 footerHtml: `
 <button id="btn-cfg-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="btn-cfg-simpan" class="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-bold shadow transition">Simpan Konfigurasi</button>
 `,
 onMount: (m) => {
 const tbody = m.querySelector("#table-cfg-cuti tbody");
 
 function renderCfgTable() {
 tbody.innerHTML = leaveConfig.map((c, i) => `
 <tr>
 <td class="p-1.5"><input type="text" class="cfg-id w-full border rounded px-1.5 py-1 outline-none uppercase font-bold" value="${c.id}"></td>
 <td class="p-1.5"><input type="text" class="cfg-name w-full border rounded px-1.5 py-1 outline-none" value="${c.name}"></td>
 <td class="p-1.5">
 <select class="cfg-potong w-full border rounded px-1.5 py-1 outline-none bg-white">
 <option value="Tahunan" ${c.potong === 'Tahunan'?'selected':''}>Tahunan</option>
 <option value="Khusus" ${c.potong === 'Khusus'?'selected':''}>Khusus</option>
 <option value="Akumulasi" ${c.potong === 'Akumulasi'?'selected':''}>Akumulasi</option>
 <option value="Potong Gaji" ${c.potong === 'Potong Gaji'?'selected':''}>Potong Gaji</option>
 <option value="Tidak Dipotong" ${c.potong === 'Tidak Dipotong'?'selected':''}>Tidak Dipotong (0)</option>
 </select>
 </td>
 <td class="p-1.5"><input type="number" step="0.5" class="cfg-count w-full border rounded px-1.5 py-1 outline-none text-center" value="${c.count}"></td>
 <td class="p-1.5 text-center"><button type="button" data-cfg-del="${i}" class="text-red-500 hover:text-red-700 font-bold">&times;</button></td>
 </tr>
 `).join("");

 tbody.querySelectorAll("[data-cfg-del]").forEach(btn => {
 btn.onclick = () => { leaveConfig.splice(btn.dataset.cfgDel, 1); renderCfgTable(); };
 });
 }
 renderCfgTable();

 m.querySelector("#btn-add-cfg-cuti").onclick = () => {
 leaveConfig.push({ id: "", name: "", potong: "Tahunan", count: 1 });
 renderCfgTable();
 };

 m.querySelector("#btn-cfg-batal").onclick = () => { loadData(); closeModal(); };
 
 m.querySelector("#btn-cfg-simpan").onclick = async () => {
 const newCfg = [];
 let isValid = true;
 tbody.querySelectorAll("tr").forEach(tr => {
 const id = tr.querySelector(".cfg-id").value.trim().toUpperCase();
 const name = tr.querySelector(".cfg-name").value.trim();
 if(!id || !name) isValid = false;
 newCfg.push({
 id, name,
 potong: tr.querySelector(".cfg-potong").value,
 count: parseFloat(tr.querySelector(".cfg-count").value) || 0
 });
 });

 if(!isValid) return toast("Kode dan Nama Cuti tidak boleh kosong!", "warning");

 const btnSave = m.querySelector("#btn-cfg-simpan");
 btnSave.disabled = true; btnSave.textContent = "Menyimpan...";

 try {
 await setDoc(doc(db, COL.APP_SETTINGS, "leave_types"), { types: newCfg }, { merge: true });
 leaveConfig = newCfg;
 toast("Konfigurasi Jenis Cuti berhasil disimpan", "success");
 closeModal();
 } catch(e) {
 toast("Gagal menyimpan: " + e.message, "error");
 btnSave.disabled = false; btnSave.textContent = "Simpan Konfigurasi";
 }
 };
 }
 });
 });

 loadData();
 return { unmount() {} };
}
