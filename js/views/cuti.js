import { db, COL, collection, getDocs, doc, setDoc, getDoc, updateDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, toNumber, escapeHtml, genId, fmtDateShort, confirmDialog, sendEmailNotif, notifyUser, getTargetsForRole, generateAndSaveCutiDocument, printFormCutiFisik, generateStandardFormCutiHtml, smartParseDate } from "../utils.js";
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
  { id: "CS", name: "Cuti Sisa", potong: "Tahunan", count: 1 },
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
             <p class="text-sm text-slate-500 mt-1">${canManage ? "Kelola jatah cuti, input izin manual, cetak form fisik, serta kalkulasi reset & import Excel." : "Mode lihat saja — hanya menampilkan karyawan yang menjadi bawahan Anda."}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
             ${canManage ? `
             <button id="btn-setting-cuti" class="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
               Atur Jenis Cuti
             </button>` : ""}
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
             <p class="font-bold text-sm">📋 Pengaturan & Reset Otomatis Jatah Cuti (SK No.018/HRGA-AJ/XII/2024)</p>
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
                         <th class="py-3 px-4 text-center">Cuti Tahunan</th>
                         <th class="py-3 px-4 text-center">Cuti Khusus</th>
                         <th class="py-3 px-4 text-center">Carryover (Akumulasi)</th>
                         <th class="py-3 px-4 text-center">Sisa Cuti Tahun Lalu<br><span class="font-normal normal-case text-[10px] text-slate-400">(input manual HRD)</span></th>
                      </tr>
                   </thead>
                   <tbody id="cuti-tbody" class="divide-y divide-slate-100">
                      <tr><td colspan="6" class="py-10 text-center text-slate-400">Memuat data karyawan...</td></tr>
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

      allKaryawan = snapK.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF" && k.nama_karyawan && k.nama_karyawan.trim() !== "");
      if (isAtasanView) {
         const bset = new Set(bawahanNames || []);
         allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
      }
      allKaryawan.sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id", { sensitivity: "base" }));

      allCuti = snapC;
      
      if (snapCfg.exists() && snapCfg.data().types) {
         leaveConfig = snapCfg.data().types;
      } else {
         leaveConfig = [...DEFAULT_LEAVE_TYPES];
      }

      calculateBalances();
      renderCards(allKaryawan);
      renderTable(allKaryawan);
    } catch(e) { 
      if (wrap) wrap.innerHTML = `<div class="col-span-full text-red-500">Error: ${e.message}</div>`; 
    }
  }

  function calculateBalances() {
    terpakaiMap = {};
    const currentYear = new Date().getFullYear();
    allCuti.forEach(r => {
      const key = r.nama_karyawan;
      if(!key) return;
      const rowYear = parseInt(r.tahun) || (r.tanggal ? new Date(r.tanggal).getFullYear() : currentYear);
      if (rowYear !== currentYear) return;
      if (!terpakaiMap[key]) terpakaiMap[key] = { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
      if (r.potong_jatah && terpakaiMap[key][r.potong_jatah] !== undefined) {
         terpakaiMap[key][r.potong_jatah] += parseFloat(r.count) || 0;
      }
    });
  }

  function getSisa(k) {
     const used = terpakaiMap[k.nama_karyawan] || { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
     return {
        Tahunan: Math.max(toNumber(k.jatah_tahunan) - used.Tahunan, 0),
        Khusus: Math.max(toNumber(k.jatah_khusus) - used.Khusus, 0),
        Akumulasi: Math.max(toNumber(k.jatah_akumulasi) - used.Akumulasi, 0),
        used
     };
  }

  function renderCards(list) {
    if (!wrap) return;
    if (!list.length) { wrap.innerHTML = `<div class="col-span-full">${emptyState("Karyawan tidak ditemukan")}</div>`; return; }
    
    wrap.innerHTML = list.map(k => {
      const sisa = getSisa(k);
      return `
        <div data-karyawan-id="${k.id}" class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-maroon-300 transition cursor-pointer overflow-hidden flex flex-col">
           <div class="p-4 flex items-center gap-3 border-b border-slate-50 bg-slate-50/50">
              ${avatar(k.nama_karyawan, "w-12 h-12 text-sm")}
              <div class="flex-1 min-w-0">
                 <p class="font-bold text-slate-800 truncate">${escapeHtml(k.nama_karyawan)}</p>
                 <p class="text-[11px] text-slate-500 truncate">${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.cabang || "-")}</p>
              </div>
           </div>
           <div class="p-4 bg-white grid grid-cols-3 gap-2 text-center flex-1">
              <div class="p-2 bg-blue-50 rounded-lg border border-blue-100">
                 <p class="text-[10px] text-slate-400 uppercase font-semibold mb-1">Tahunan</p>
                 <p class="text-lg font-black text-blue-700">${sisa.Tahunan}</p>
              </div>
              <div class="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                 <p class="text-[10px] text-slate-400 uppercase font-semibold mb-1">Khusus</p>
                 <p class="text-lg font-black text-emerald-700">${sisa.Khusus}</p>
              </div>
              <div class="p-2 bg-amber-50 rounded-lg border border-amber-100">
                 <p class="text-[10px] text-slate-400 uppercase font-semibold mb-1">Akumulasi</p>
                 <p class="text-lg font-black text-amber-700">${sisa.Akumulasi}</p>
              </div>
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
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Belum ada data karyawan aktif.</td></tr>`;
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

         const jTahunan = k.jatah_cuti_tahunan || k.jatah_tahunan || 0;
         const jKhusus = k.jatah_cuti_khusus || k.jatah_khusus || 0;
         const jAkumulasi = k.jatah_cuti_akumulasi || k.jatah_akumulasi || 0;

         return `
            <tr class="hover:bg-slate-50/50 transition">
               <td class="py-3 px-4">
                  <p class="font-bold text-slate-800">${escapeHtml(k.nama_karyawan)}</p>
                  <p class="text-[11px] text-slate-400 font-medium">${escapeHtml(k.nik || k.nik_karyawan || "-")}</p>
               </td>
               <td class="py-3 px-4 text-slate-600 font-medium">${masaKerjaStr}</td>
               <td class="py-3 px-4 text-center"><span class="bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-lg">${jTahunan}</span></td>
               <td class="py-3 px-4 text-center"><span class="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-lg">${jKhusus}</span></td>
               <td class="py-3 px-4 text-center">
                  <span class="bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-lg">${jAkumulasi}</span>
                  ${k.cuti_akumulasi_expired ? `<p class="text-[10px] text-amber-600 mt-1">Hangus stlh ${escapeHtml(k.cuti_akumulasi_expired)}</p>` : ""}
               </td>
               <td class="py-3 px-4 text-center">
                  <input type="number" step="0.5" min="0" data-sisa-lalu="${k.id}"
                     value="${k.sisa_cuti_tahun_lalu ?? ""}" placeholder="Belum diisi"
                     class="w-24 text-center px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-maroon-400 text-xs font-semibold text-slate-700">
                  ${(k.sisa_cuti_tahun_lalu === undefined || k.sisa_cuti_tahun_lalu === null) ? `<p class="text-[10px] text-amber-600 mt-1">Belum diisi HRD</p>` : ""}
               </td>
            </tr>
         `;
     }).join("");

     tbody.querySelectorAll("[data-sisa-lalu]").forEach(inp => {
        inp.addEventListener("change", async () => {
           const id = inp.dataset.sisaLalu;
           const val = inp.value === "" ? null : (parseFloat(inp.value) || 0);
           try {
              await updateDoc(doc(db, COL.MASTER_KARYAWAN, id), { sisa_cuti_tahun_lalu: val });
              const emp = allKaryawan.find(k => k.id === id);
              if (emp) emp.sisa_cuti_tahun_lalu = val;
              toast("Sisa cuti tahun lalu tersimpan", "success");
           } catch (e) {
              toast("Gagal menyimpan: " + e.message, "error");
           }
        });
     });
  }

  if (searchInput) {
     searchInput.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        renderCards(allKaryawan.filter(k => (k.nama_karyawan||"").toLowerCase().includes(term) || (k.jabatan||"").toLowerCase().includes(term)));
     };
  }

  if (searchTableInput) {
     searchTableInput.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        renderTable(allKaryawan.filter(k => (k.nama_karyawan||"").toLowerCase().includes(term) || (k.nik||k.nik_karyawan||"").toLowerCase().includes(term)));
     };
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

              if (json.length === 0) throw new Error("File Excel kosong.");

              btnImport.disabled = true;
              btnImport.textContent = "Memproses...";

              let updateCount = 0;
              for (const row of json) {
                 const nik = row["NIK"];
                 const nama = row["Nama Karyawan"];
                 if (!nik && !nama) continue;

                 const targetEmp = allKaryawan.find(k => k.nik == nik || k.nik_karyawan == nik || (k.nama_karyawan || "").toLowerCase() === (nama || "").toLowerCase());
                 if (targetEmp) {
                    const payload = {
                       jatah_cuti_tahunan: parseInt(row["Jatah Cuti Tahunan"]) || 0,
                       jatah_tahunan: parseInt(row["Jatah Cuti Tahunan"]) || 0,
                       jatah_cuti_khusus: parseInt(row["Jatah Cuti Khusus"]) || 0,
                       jatah_khusus: parseInt(row["Jatah Cuti Khusus"]) || 0,
                       jatah_cuti_akumulasi: parseInt(row["Jatah Cuti Akumulasi"]) || 0,
                       jatah_akumulasi: parseInt(row["Jatah Cuti Akumulasi"]) || 0
                    };
                    const sisaLaluRaw = row["Sisa Cuti Tahun Lalu"];
                    if (sisaLaluRaw !== undefined && sisaLaluRaw !== "") {
                       payload.sisa_cuti_tahun_lalu = parseFloat(sisaLaluRaw) || 0;
                    }
                    await updateDoc(doc(db, COL.MASTER_KARYAWAN, targetEmp.id), payload);
                    updateCount++;
                 }
              }

              toast(`Berhasil mengupdate jatah cuti ${updateCount} karyawan!`, "success");
              await loadData();
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
        if (!confirm("Apakah Anda yakin ingin me-reset jatah cuti seluruh karyawan aktif?\n\nSistem akan MEMPRIORITASKAN kolom 'Sisa Cuti Tahun Lalu' yang sudah Anda isi manual sebagai basis carryover (sesuai SK No.018/HRGA-AJ/XII/2024).\n\nLanjutkan?")) return;

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
              if (!terpakaiTahunLalu[key]) terpakaiTahunLalu[key] = { Tahunan: 0, Akumulasi: 0 };
              if (r.potong_jatah === "Tahunan" || r.potong_jatah === "Akumulasi") {
                 terpakaiTahunLalu[key][r.potong_jatah] += parseFloat(r.count) || 0;
              }
           });

           for (const emp of allKaryawan) {
              let jTahunanBaru = 0;
              let jKhusus = 4;
              let jAkumulasiBaru = 0;

              const jatahTahunanLama = toNumber(emp.jatah_cuti_tahunan ?? emp.jatah_tahunan);
              const jatahAkumulasiLama = toNumber(emp.jatah_cuti_akumulasi ?? emp.jatah_akumulasi);
              const used = terpakaiTahunLalu[emp.nama_karyawan] || { Tahunan: 0, Akumulasi: 0 };

              const sisaLaluManual = emp.sisa_cuti_tahun_lalu;
              const adaInputManual = sisaLaluManual !== undefined && sisaLaluManual !== null && sisaLaluManual !== "";
              const sisaTahunanAktual = Math.max(jatahTahunanLama - used.Tahunan, 0);
              const sisaAkumulasiAktual = Math.max(jatahAkumulasiLama - used.Akumulasi, 0);
              const totalSisaUntukCarry = adaInputManual ? toNumber(sisaLaluManual) : (sisaTahunanAktual + sisaAkumulasiAktual);

              if (emp.tanggal_join) {
                 const join = smartParseDate(emp.tanggal_join);
                 if (join) {
                    const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
                    const tenureYears = diffMonths / 12;

                    if (diffMonths >= 12) {
                       jTahunanBaru = 12;
                       if (tenureYears >= 11) jTahunanBaru += 4;
                       else if (tenureYears >= 10) jTahunanBaru += 3;
                       else if (tenureYears >= 8) jTahunanBaru += 2;
                       else if (tenureYears >= 6) jTahunanBaru += 1;
                    } else if (diffMonths >= 3) {
                       jTahunanBaru = diffMonths;
                    } else {
                       jTahunanBaru = 0;
                    }

                    if (tenureYears >= 5) {
                       jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 1.0);
                    } else if (tenureYears >= 3) {
                       jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 0.5);
                    } else {
                       jAkumulasiBaru = 0;
                    }
                 }
              }

              await updateDoc(doc(db, COL.MASTER_KARYAWAN, emp.id), {
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
     return myLeaves.map(c => `
        <tr class="hover:bg-slate-50" data-cuti-id="${c.id}">
           <td class="p-3 font-medium">${fmtDateShort(c.tanggal)}</td>
           <td class="p-3">${escapeHtml(c.type_cuti)}</td>
           <td class="p-3">${escapeHtml(c.keterangan_cuti || "-")}</td>
           <td class="p-3 text-center"><span class="bg-red-50 text-red-600 px-2 py-0.5 rounded font-bold">${c.count} ${c.potong_jatah !== 'Tidak Dipotong' ? c.potong_jatah : ''}</span></td>
           <td class="p-3 text-right whitespace-nowrap">
              <button type="button" data-print-cuti="${c.id}" class="text-emerald-700 hover:underline font-bold mr-3">📄 Form Cuti</button>
              ${canManage ? `
              <button type="button" data-edit-cuti="${c.id}" class="text-blue-600 hover:underline font-medium mr-3">Edit</button>
              <button type="button" data-del-cuti="${c.id}" class="text-red-600 hover:underline font-medium">Hapus</button>
              ` : ''}
           </td>
        </tr>
     `).join("");
  }

  function wireRiwayatActions(m, k) {
     const tbody = m.querySelector("#tbody-riwayat-cuti");
     if (!tbody) return;

     tbody.querySelectorAll("[data-print-cuti]").forEach(btn => {
        btn.onclick = () => {
           const row = allCuti.find(c => c.id === btn.dataset.printCuti);
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
              allCuti = allCuti.filter(c => c.id !== id);
              calculateBalances();
              renderCards(allKaryawan);
              renderTable(allKaryawan);
              closeModal();
              const refreshed = allKaryawan.find(x => x.id === k.id);
              if (refreshed) openEmployeeModal(refreshed);
           } catch (e) {
              toast("Gagal menghapus: " + e.message, "error");
           }
        };
     });

     tbody.querySelectorAll("[data-edit-cuti]").forEach(btn => {
        btn.onclick = () => {
           const row = allCuti.find(c => c.id === btn.dataset.editCuti);
           if (row) openEditCutiModal(row, k);
        };
     });
  }

  function openEditCutiModal(row, k) {
     const optLeaveTypes = leaveConfig.map(c => `<option value="${c.id}" ${row.type_cuti && row.type_cuti.startsWith(c.id + " ") ? "selected" : ""} data-potong="${c.potong}">${c.id} - ${c.name}</option>`).join("");
     openModal({
        title: "Edit Riwayat Cuti",
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
                 <select id="edit-jenis" class="w-full px-3 py-2 text-sm border rounded-lg outline-none bg-white">${optLeaveTypes}</select>
              </div>
              <div>
                 <label class="block text-xs font-bold text-slate-600 mb-1">Keterangan / Alasan</label>
                 <input type="text" id="edit-keterangan" value="${escapeHtml(row.keterangan_cuti || "")}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
              </div>
              <div>
                 <label class="block text-xs font-bold text-slate-600 mb-1">Potong Saldo (Hari)</label>
                 <input type="number" step="0.5" id="edit-count" required value="${row.count}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none text-center font-bold">
              </div>
           </form>
        `,
        footerHtml: `
           <button id="btn-edit-cuti-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
           <button id="btn-edit-cuti-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-bold shadow transition">Simpan Perubahan</button>
        `,
        onMount: (m2) => {
           m2.querySelector("#btn-edit-cuti-batal").onclick = () => openEmployeeModal(k);
           m2.querySelector("#btn-edit-cuti-simpan").onclick = async () => {
              const form = m2.querySelector("#form-edit-cuti");
              if (!form.reportValidity()) return;
              const selEl = m2.querySelector("#edit-jenis");
              const opt = selEl.options[selEl.selectedIndex];
              const payload = {
                 tanggal: m2.querySelector("#edit-tanggal").value,
                 tanggal_selesai: m2.querySelector("#edit-tanggal-selesai").value || m2.querySelector("#edit-tanggal").value,
                 type_cuti: opt.text,
                 potong_jatah: opt.dataset.potong,
                 keterangan_cuti: m2.querySelector("#edit-keterangan").value.trim(),
                 count: parseFloat(m2.querySelector("#edit-count").value) || 0
              };
              try {
                 await fsUpdate(COL.MASTER_CUTI, row.id, payload);
                 toast("Riwayat cuti berhasil diperbarui", "success");
                 Object.assign(row, payload);
                 calculateBalances();
                 renderCards(allKaryawan);
                 renderTable(allKaryawan);
                 const refreshed = allKaryawan.find(x => x.id === k.id);
                 openEmployeeModal(refreshed || k);
              } catch (e) {
                 toast("Gagal menyimpan perubahan: " + e.message, "error");
              }
           };
        }
     });
  }

  function openEmployeeModal(k) {
     const sisa = getSisa(k);
     const myLeaves = allCuti.filter(c => c.nama_karyawan === k.nama_karyawan).sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
     const optLeaveTypes = leaveConfig.map(c => `<option value="${c.id}" data-potong="${c.potong}" data-count="${c.count}">${c.id} - ${c.name}</option>`).join("");

     openModal({
        title: "Manajemen Cuti Karyawan",
        size: "lg",
        bodyHtml: `
          <div class="flex items-center gap-4 mb-5 pb-4 border-b border-slate-100">
            ${avatar(k.nama_karyawan, "w-14 h-14 text-base")}
            <div class="flex-1">
               <h3 class="font-bold text-lg text-slate-800">${escapeHtml(k.nama_karyawan)}</h3>
               <p class="text-sm text-slate-500">${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.cabang || "-")}</p>
            </div>
            <div class="flex gap-3 text-center">
               <div><p class="text-[10px] font-bold text-slate-400 uppercase">Tahunan</p><p class="text-xl font-black text-blue-600">${sisa.Tahunan}</p></div>
               <div><p class="text-[10px] font-bold text-slate-400 uppercase">Khusus</p><p class="text-xl font-black text-emerald-600">${sisa.Khusus}</p></div>
               <div><p class="text-[10px] font-bold text-slate-400 uppercase">Akumulasi</p><p class="text-xl font-black text-amber-600">${sisa.Akumulasi}</p></div>
            </div>
          </div>

          ${canManage ? `
          <div class="flex border-b border-slate-200 mb-4">
             <button id="tab-input-cuti" class="px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700">Input Cuti Baru</button>
             <button id="tab-riwayat-cuti" class="px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700">Riwayat Cuti</button>
          </div>` : `
          <div class="flex border-b border-slate-200 mb-4">
             <span class="px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700">Riwayat Cuti</span>
             <span class="ml-auto self-center text-[11px] text-slate-400 pr-1">Mode lihat saja</span>
          </div>`}

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

                <div class="grid grid-cols-2 gap-4 hidden" id="wrap-jam">
                   <div>
                      <label class="block text-xs font-bold text-slate-600 mb-1">Jam Keluar</label>
                      <input type="time" id="inp-jam-keluar" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
                   </div>
                   <div>
                      <label class="block text-xs font-bold text-slate-600 mb-1">Jam Kembali</label>
                      <input type="time" id="inp-jam-kembali" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
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
             </form>
          </div>

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
           const pnlInput = m.querySelector("#panel-input-cuti");
           const pnlRiwayat = m.querySelector("#panel-riwayat-cuti");
           const btnSimpan = m.querySelector("#btn-modal-simpan");

           if (tabInput && tabRiwayat) {
              tabInput.onclick = () => {
                 tabInput.className = "px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700";
                 tabRiwayat.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700";
                 pnlInput.classList.remove("hidden"); pnlRiwayat.classList.add("hidden");
                 if (btnSimpan) btnSimpan.classList.remove("hidden");
              };
              tabRiwayat.onclick = () => {
                 tabRiwayat.className = "px-4 py-2 text-sm font-bold text-maroon-700 border-b-2 border-maroon-700";
                 tabInput.className = "px-4 py-2 text-sm font-medium text-slate-500 border-b-2 border-transparent hover:text-slate-700";
                 pnlRiwayat.classList.remove("hidden"); pnlInput.classList.add("hidden");
                 if (btnSimpan) btnSimpan.classList.add("hidden");
              };
           }

           wireRiwayatActions(m, k);

           const selJenis = m.querySelector("#inp-jenis");
           const wrapTglAkhir = m.querySelector("#wrap-tgl-akhir");
           const wrapJam = m.querySelector("#wrap-jam");
           const inMulai = m.querySelector("#inp-tgl-mulai");
           const inAkhir = m.querySelector("#inp-tgl-akhir");
           const inHari = m.querySelector("#inp-hari");
           const lblPotong = m.querySelector("#lbl-potong-tipe");

           function calcDays() {
              const opt = selJenis.options[selJenis.selectedIndex];
              if(!opt || !opt.value) return;
              const baseCount = parseFloat(opt.dataset.count);
              const potongTipe = opt.dataset.potong;

              lblPotong.textContent = potongTipe;

              if (baseCount === 0.5) { 
                 wrapTglAkhir.classList.add("hidden");
                 wrapJam.classList.remove("hidden");
                 inHari.value = 0.5;
              } else { 
                 wrapTglAkhir.classList.remove("hidden");
                 wrapJam.classList.add("hidden");
                 
                 if (inMulai.value && inAkhir.value) {
                    const d1 = new Date(inMulai.value); const d2 = new Date(inAkhir.value);
                    let diff = Math.round((d2-d1)/86400000) + 1;
                    if(diff < 1) diff = 1;
                    inHari.value = diff * baseCount; 
                 } else {
                    inHari.value = baseCount;
                 }
              }
           }

           selJenis.onchange = calcDays;
           inMulai.onchange = () => { if(!inAkhir.value) inAkhir.value = inMulai.value; calcDays(); };
           inAkhir.onchange = calcDays;

           m.querySelector("#btn-modal-batal").onclick = closeModal;
           if (btnSimpan) btnSimpan.onclick = async () => {
              const form = m.querySelector("#form-input-cuti");
              if (!form.reportValidity()) return;
              
              const jenisVal = selJenis.value;
              const opt = selJenis.options[selJenis.selectedIndex];
              const tipePotong = opt.dataset.potong;
              const isHalfDay = parseFloat(opt.dataset.count) === 0.5;

              btnSimpan.disabled = true; btnSimpan.textContent = "Menyimpan & Membuat Dokumen...";

              const tglMulai = inMulai.value;
              const tglAkhir = isHalfDay ? tglMulai : inAkhir.value;
              const payload = {
                 tanggal: tglMulai,
                 tanggal_selesai: tglAkhir,
                 nama_karyawan: k.nama_karyawan,
                 cabang: k.cabang || "-",
                 type_cuti: jenisVal + " - " + opt.text.split(" - ")[1],
                 potong_jatah: tipePotong,
                 count: parseFloat(inHari.value) || 0,
                 keterangan_cuti: m.querySelector("#inp-alasan").value.trim(),
                 tahun: new Date(tglMulai).getFullYear(),
                 bulan: new Date(tglMulai).toLocaleString('id-ID', { month: 'long' })
              };

              try {
                 await fsAdd(COL.MASTER_CUTI, payload, genId("CUTI"));
                 toast("Cuti berhasil diinput", "success");
                 
                 allCuti.push(payload);
                 calculateBalances();
                 renderCards(allKaryawan);
                 renderTable(allKaryawan);
                 closeModal();

                 const pdfData = {
                    ...payload,
                    isHalfDay,
                    tgl_akhir: tglAkhir,
                    jam_keluar: m.querySelector("#inp-jam-keluar").value,
                    jam_kembali: m.querySelector("#inp-jam-kembali").value,
                    kontak: m.querySelector("#inp-kontak").value
                 };
                 const currentSisa = getSisa(k);

                 await generateCutiDocument(k, pdfData, currentSisa);

              } catch (e) {
                 toast("Gagal menyimpan: " + e.message, "error");
                 btnSimpan.disabled = false; btnSimpan.textContent = "Simpan & Cetak PDF";
              }
           };
        }
     });
  }

  async function generateCutiDocument(k, pdfData, sisa) {
     toast("Membuat dokumen di Google Drive...", "info");
     try {
        const result = await generateCutiDocViaGAS({
           nama_karyawan: k.nama_karyawan,
           jabatan: k.jabatan || "-",
           cabang: k.cabang || "-",
           tanggal: pdfData.tanggal,
           tanggal_display: fmtDateShort(pdfData.tanggal),
           tgl_akhir: pdfData.tgl_akhir,
           tgl_akhir_display: fmtDateShort(pdfData.tgl_akhir),
           isHalfDay: pdfData.isHalfDay,
           count: pdfData.count,
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
          if (t.email) await sendEmailNotif(t.email, "Cuti Anda Telah Dicatat", `<p>Halo ${escapeHtml(k.nama_karyawan)},</p><p>Pengajuan cuti Anda tanggal <b>${fmtDateShort(pdfData.tanggal)}</b> telah dicatat oleh HRD. Dokumen: <a href="${result.pdfUrl}">lihat di sini</a>.</p>`);
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
                    <td class="p-1.5 text-center"><button type="button" data-cfg-del="${i}" class="text-red-500 hover:text-red-700 font-bold">✖</button></td>
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
