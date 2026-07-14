import { db, COL, collection, getDocs, doc, setDoc, getDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, toNumber, escapeHtml, genId, fmtDateShort, confirmDialog } from "../utils.js";
import { avatar, emptyState, skeletonRows, badge } from "../components.js";
import { FULL_ACCESS_ROLES, ATASAN_VIEW_ROLES, getBawahanNames } from "../auth.js";
import { COMPANY_NAME, logoImgTag } from "../branding.js";

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
  const role = (session.role || "").toUpperCase();
  const isFullAccess = FULL_ACCESS_ROLES.includes(role);
  const isAtasanView = !isFullAccess && ATASAN_VIEW_ROLES.includes(role);
  // Kalau bukan salah satu dari dua kelompok di atas (mis. staff biasa nyasar ke sini),
  // perlakukan paling ketat: view-only + tidak melihat siapa pun (menu ini memang seharusnya
  // tidak terlihat untuk role tsb berkat RBAC di auth.js, ini hanya jaga-jaga).
  const canManage = isFullAccess; // hanya HRD/SUPERADMIN/DIREKTUR yang boleh tambah/edit/hapus

  container.innerHTML = `
    <div class="max-w-7xl mx-auto space-y-6 pb-10">
       <div class="flex justify-between items-end flex-wrap gap-4 border-b border-slate-200 pb-4">
          <div>
             <h1 class="text-2xl font-bold text-slate-800">Manajemen Cuti & Izin</h1>
             <p class="text-sm text-slate-500 mt-1">${canManage ? "Kelola jatah cuti, input izin manual, dan cetak form persetujuan resmi." : "Mode lihat saja — hanya menampilkan karyawan yang menjadi bawahan Anda."}</p>
          </div>
          <div class="flex gap-2">
             <div class="relative w-64">
                <input type="text" id="cuti-search" placeholder="Cari nama karyawan..." class="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
             </div>
             ${canManage ? `
             <button id="btn-setting-cuti" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
               Atur Jenis Cuti
             </button>` : ""}
          </div>
       </div>
       <div id="cuti-cards-wrap" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <div class="col-span-full">${skeletonRows(3)}</div>
       </div>
    </div>
  `;

  const wrap = container.querySelector("#cuti-cards-wrap");
  const searchInput = container.querySelector("#cuti-search");
  
  let allKaryawan = [], allCuti = [], leaveConfig = [];
  let terpakaiMap = {};
  let bawahanNames = null; // null = belum dihitung; array = daftar nama bawahan (untuk role Atasan)

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

      // PERBAIKAN PENTING: Mencegah error trim() dengan menyaring data karyawan yang memiliki 'nama_karyawan' valid
      allKaryawan = snapK.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF" && k.nama_karyawan && k.nama_karyawan.trim() !== "");
      // Atasan (non-HRD) hanya boleh melihat karyawan yang menjadi bawahan langsungnya
      if (isAtasanView) {
         const bset = new Set(bawahanNames || []);
         allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
      }
      // Urutkan A-Z berdasarkan nama karyawan
      allKaryawan.sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id", { sensitivity: "base" }));

      allCuti = snapC;
      
      if (snapCfg.exists() && snapCfg.data().types) {
         leaveConfig = snapCfg.data().types;
      } else {
         leaveConfig = [...DEFAULT_LEAVE_TYPES];
      }

      calculateBalances();
      renderCards(allKaryawan);
    } catch(e) { wrap.innerHTML = `<div class="col-span-full text-red-500">Error: ${e.message}</div>`; }
  }

  function calculateBalances() {
    terpakaiMap = {};
    allCuti.forEach(r => {
      const key = r.nama_karyawan;
      if(!key) return; 
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

  searchInput.oninput = (e) => {
     const term = e.target.value.toLowerCase();
     renderCards(allKaryawan.filter(k => (k.nama_karyawan||"").toLowerCase().includes(term) || (k.jabatan||"").toLowerCase().includes(term)));
  };

  function renderRiwayatRows(myLeaves) {
     if (!myLeaves.length) return `<tr><td colspan="${canManage ? 5 : 4}" class="p-6 text-center text-slate-400">Belum ada riwayat cuti.</td></tr>`;
     return myLeaves.map(c => `
        <tr class="hover:bg-slate-50" data-cuti-id="${c.id}">
           <td class="p-3 font-medium">${fmtDateShort(c.tanggal)}</td>
           <td class="p-3">${escapeHtml(c.type_cuti)}</td>
           <td class="p-3">${escapeHtml(c.keterangan_cuti || "-")}</td>
           <td class="p-3 text-center"><span class="bg-red-50 text-red-600 px-2 py-0.5 rounded font-bold">${c.count} ${c.potong_jatah !== 'Tidak Dipotong' ? c.potong_jatah : ''}</span></td>
           ${canManage ? `
           <td class="p-3 text-right whitespace-nowrap">
              <button type="button" data-edit-cuti="${c.id}" class="text-blue-600 hover:underline font-medium mr-3">Edit</button>
              <button type="button" data-del-cuti="${c.id}" class="text-red-600 hover:underline font-medium">Hapus</button>
           </td>` : ''}
        </tr>
     `).join("");
  }

  function wireRiwayatActions(m, k) {
     if (!canManage) return;
     const tbody = m.querySelector("#tbody-riwayat-cuti");
     if (!tbody) return;

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
                 <label class="block text-xs font-bold text-slate-600 mb-1">Tanggal</label>
                 <input type="date" id="edit-tanggal" required value="${row.tanggal || ""}" class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400">
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

           // Wiring tombol Edit & Hapus di tabel Riwayat Cuti (khusus HRD/SUPERADMIN/DIREKTUR)
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

              btnSimpan.disabled = true; btnSimpan.textContent = "Menyimpan & Mencetak...";

              const tglMulai = inMulai.value;
              const payload = {
                 tanggal: tglMulai,
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
                 closeModal();

                 const pdfData = {
                    ...payload,
                    isHalfDay,
                    tgl_akhir: isHalfDay ? tglMulai : inAkhir.value,
                    jam_keluar: m.querySelector("#inp-jam-keluar").value,
                    jam_kembali: m.querySelector("#inp-jam-kembali").value,
                    kontak: m.querySelector("#inp-kontak").value
                 };
                 const currentSisa = getSisa(k);

                 printCutiPdf(k, pdfData, currentSisa);

              } catch (e) {
                 toast("Gagal menyimpan: " + e.message, "error");
                 btnSimpan.disabled = false; btnSimpan.textContent = "Simpan & Cetak PDF";
              }
           };
        }
     });
  }

  function printCutiPdf(k, data, sisa) {
    const printWindow = window.open('', '_blank');
    const todayStr = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    
    let html = `
    <html><head>
      <title>Form Cuti - ${k.nama_karyawan}</title>
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 14px; padding: 40px; line-height: 1.6; color: #000; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-weight: bold; }
        .header-table td { border: 1px solid #000; padding: 10px; text-align: center; }
        .info-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .info-table td { border: 1px solid #000; padding: 8px 12px; vertical-align: top; }
        .info-table .col-label { width: 35%; font-weight: bold; background-color: #f9fafb; }
        .ttd-table { width: 100%; margin-top: 40px; text-align: center; }
        .ttd-table td { padding-top: 10px; }
        .ttd-space { height: 80px; }
        .notes { margin-top: 30px; font-size: 12px; border: 1px solid #000; padding: 10px; }
        .notes ul { margin: 0; padding-left: 20px; }
      </style>
    </head><body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
      
      <table class="header-table">
        <tr>
          <td rowspan="2" width="14%" style="border-right:none;">${logoImgTag(56)}</td>
          <td rowspan="2" width="20%" style="font-size: 18px; border-left:none; text-align:left;">${COMPANY_NAME}</td>
          <td rowspan="2" style="font-size: 18px; text-transform: uppercase;">
             FORMULIR PENGAJUAN ${data.isHalfDay ? "CUTI SETENGAH HARI" : "CUTI KARYAWAN"}
          </td>
          <td width="25%" style="text-align: left; font-size: 11px;">
             Hal: 1 dari 1<br/>No Dok: HR4
          </td>
        </tr>
        <tr>
          <td style="text-align: left; font-size: 11px;">Terbit/Revisi: 1/1<br/>Tgl terbit: 1 Sep 2025</td>
        </tr>
      </table>

      <table class="info-table">
        <tr><td colspan="2" style="text-align: center; background: #e2e8f0; font-weight: bold;">DATA KARYAWAN</td></tr>
        <tr><td class="col-label">Nama Lengkap</td><td>${escapeHtml(k.nama_karyawan)}</td></tr>
        <tr><td class="col-label">Divisi / Bagian / Unit Kerja</td><td>${escapeHtml(k.divisi || k.jabatan || "-")}</td></tr>
        
        <tr><td colspan="2" style="text-align: center; background: #e2e8f0; font-weight: bold;">KETERANGAN CUTI</td></tr>
        <tr><td class="col-label">Tanggal Cuti</td><td>${fmtDateShort(data.tanggal)}</td></tr>
        
        ${data.isHalfDay ? `
          <tr><td class="col-label">Jenis Cuti Setengah Hari</td><td>${escapeHtml(data.type_cuti)}</td></tr>
          <tr><td class="col-label">Jam Keluar</td><td>${data.jam_keluar || "-"}</td></tr>
          <tr><td class="col-label">Jam Kembali</td><td>${data.jam_kembali || "-"}</td></tr>
        ` : `
          <tr><td class="col-label">Tanggal Selesai Cuti</td><td>${fmtDateShort(data.tgl_akhir)}</td></tr>
          <tr><td class="col-label">Jenis Cuti</td><td>${escapeHtml(data.type_cuti)}</td></tr>
        `}
        
        <tr><td class="col-label">Alamat & No HP Selama Cuti</td><td>${escapeHtml(data.kontak)}</td></tr>
        <tr><td class="col-label">Keterangan / Alasan</td><td>${escapeHtml(data.keterangan_cuti)}</td></tr>
        
        <tr><td class="col-label">Sisa Cuti Tahunan</td><td>${sisa.Tahunan} Hari</td></tr>
        <tr><td class="col-label">Sisa Cuti Khusus</td><td>${sisa.Khusus} Hari</td></tr>
        <tr><td class="col-label">Sisa Cuti Akumulasi</td><td>${sisa.Akumulasi} Hari</td></tr>
      </table>

      <div style="text-align: right; margin-top: 20px; font-size: 12px; color: #666;">
         Dicetak pada: ${todayStr} WIB
      </div>

      <table class="ttd-table">
        <tr>
           <td width="33%">Pemohon Cuti,</td>
           <td width="33%">Menyetujui,<br/>Atasan</td>
           <td width="33%">Mengetahui,<br/>HRD</td>
        </tr>
        <tr>
           <td class="ttd-space"></td><td class="ttd-space"></td><td class="ttd-space"></td>
        </tr>
        <tr>
           <td>( <strong>${escapeHtml(k.nama_karyawan)}</strong> )</td>
           <td>( ......................................... )</td>
           <td>( ......................................... )</td>
        </tr>
      </table>

      <div class="notes">
         <strong>Catatan dari Atasan:</strong><br/><br/><br/>
         <hr style="border-top: 1px dashed #000;"/><br/>
         <strong>Perhatikan:</strong>
         <ul>
            <li>Surat permohonan cuti ini harus diajukan minimal 1 minggu sebelum cuti dijalankan.</li>
            <li>Sebelum ada persetujuan dari atasan, tidak diperkenankan untuk meninggalkan/mendahului cuti, kecuali sakit dengan dibuktikan dengan surat keterangan dokter atau karena keperluan yang mendesak.</li>
         </ul>
      </div>

    </body></html>
    `;
    printWindow.document.write(html); printWindow.document.close();
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
