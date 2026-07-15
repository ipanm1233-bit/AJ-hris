import { db, COL, doc, updateDoc } from "../firebase-config.js";
import { fsGetAll, toast, escapeHtml, smartParseDate } from "../utils.js";
import { emptyState } from "../components.js";

export async function mount(container, { session }) {
  // Load library pembaca Excel (SheetJS) secara dinamis
  if (!window.XLSX) {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      document.head.appendChild(script);
  }

  container.innerHTML = `
    <div class="max-w-7xl mx-auto space-y-6 pb-10">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Manajemen Jatah Cuti</h1>
          <p class="text-sm text-slate-500 mt-1">Atur jatah cuti karyawan via Excel atau Kalkulasi Auto-Reset Tahunan.</p>
        </div>
        <div class="flex items-center gap-2">
           <input type="file" id="excel-upload" accept=".xlsx, .xls" class="hidden">
           
           <button id="btn-import-excel" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition shadow-sm">
             <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
             Import Excel
           </button>
           <button id="btn-reset-tahunan" class="flex items-center gap-2 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition shadow-sm">
             <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
             Reset Otomatis
           </button>
        </div>
      </div>

      <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl text-blue-800 text-sm mb-4">
        <p class="font-bold mb-1">Format Kolom Excel untuk Import (Baris pertama harus persis):</p>
        <code class="bg-white px-2 py-1 rounded border border-blue-100 font-mono text-xs">NIK | Nama Karyawan | Jatah Cuti Tahunan | Jatah Cuti Khusus | Jatah Cuti Akumulasi</code>
      </div>

      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th class="py-3 px-4">Karyawan</th>
                <th class="py-3 px-4">Masa Kerja</th>
                <th class="py-3 px-4 text-center">Cuti Tahunan</th>
                <th class="py-3 px-4 text-center">Cuti Khusus</th>
                <th class="py-3 px-4 text-center">Carryover (Akumulasi)</th>
              </tr>
            </thead>
            <tbody id="cuti-tbody" class="divide-y divide-slate-100">
               <tr><td colspan="5" class="py-10 text-center text-slate-400">Memuat data karyawan...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const tbody = container.querySelector("#cuti-tbody");
  const btnImport = container.querySelector("#btn-import-excel");
  const fileInput = container.querySelector("#excel-upload");
  const btnReset = container.querySelector("#btn-reset-tahunan");

  let allKaryawan = [];

  // ==========================================
  // RENDER DATA KARYAWAN
  // ==========================================
  async function loadData() {
     const data = await fsGetAll(COL.MASTER_KARYAWAN);
     allKaryawan = data.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
     allKaryawan.sort((a,b) => (a.nama_karyawan||"").localeCompare(b.nama_karyawan||""));

     if (allKaryawan.length === 0) {
         tbody.innerHTML = `<tr><td colspan="5">${emptyState("Belum ada data karyawan aktif.")}</td></tr>`;
         return;
     }

     const now = new Date();
     
     tbody.innerHTML = allKaryawan.map(k => {
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

         const tahunan = k.jatah_cuti_tahunan || 0;
         const khusus = k.jatah_cuti_khusus || 0;
         const akumulasi = k.jatah_cuti_akumulasi || 0;

         return `
            <tr class="hover:bg-slate-50/50 transition">
               <td class="py-3 px-4">
                  <p class="font-bold text-slate-800">${escapeHtml(k.nama_karyawan)}</p>
                  <p class="text-[11px] text-slate-400 font-medium">${escapeHtml(k.nik || "-")}</p>
               </td>
               <td class="py-3 px-4 text-slate-600 font-medium">${masaKerjaStr}</td>
               <td class="py-3 px-4 text-center"><span class="bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-lg">${tahunan}</span></td>
               <td class="py-3 px-4 text-center"><span class="bg-purple-100 text-purple-800 font-bold px-3 py-1 rounded-lg">${khusus}</span></td>
               <td class="py-3 px-4 text-center"><span class="bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-lg">${akumulasi}</span></td>
            </tr>
         `;
     }).join("");
  }

  // ==========================================
  // FITUR IMPORT EXCEL
  // ==========================================
  btnImport.addEventListener("click", () => fileInput.click());
  
  fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const data = new Uint8Array(event.target.result);
              const workbook = XLSX.read(data, {type: 'array'});
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              const json = XLSX.utils.sheet_to_json(worksheet);

              if (json.length === 0) throw new Error("File Excel kosong.");

              btnImport.disabled = true;
              btnImport.textContent = "Memproses...";

              let updateCount = 0;
              
              for (const row of json) {
                  const nik = row["NIK"];
                  const nama = row["Nama Karyawan"];
                  if (!nik && !nama) continue;

                  const targetEmp = allKaryawan.find(k => k.nik == nik || (k.nama_karyawan || "").toLowerCase() === (nama || "").toLowerCase());
                  
                  if (targetEmp) {
                      const payload = {
                         jatah_cuti_tahunan: parseInt(row["Jatah Cuti Tahunan"]) || 0,
                         jatah_cuti_khusus: parseInt(row["Jatah Cuti Khusus"]) || 0,
                         jatah_cuti_akumulasi: parseInt(row["Jatah Cuti Akumulasi"]) || 0
                      };
                      await updateDoc(doc(db, COL.MASTER_KARYAWAN, targetEmp.id), payload);
                      updateCount++;
                  }
              }

              toast(`Berhasil mengupdate jatah cuti ${updateCount} karyawan!`, "success");
              await loadData();
          } catch (err) {
              console.error(err);
              toast("Gagal membaca Excel. Pastikan format kolom sesuai.", "error");
          } finally {
              btnImport.disabled = false;
              btnImport.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg> Import Excel`;
              fileInput.value = ""; 
          }
      };
      reader.readAsArrayBuffer(file);
  });

  // ==========================================
  // FITUR RESET OTOMATIS BERDASARKAN KEBIJAKAN
  // ==========================================
  btnReset.addEventListener("click", async () => {
      const confirmReset = confirm("Yakin ingin me-reset jatah cuti seluruh karyawan aktif? Sistem akan otomatis menghitung ulang Cuti Tahunan, Khusus, dan Carryover berdasarkan masa kerja saat ini.");
      if (!confirmReset) return;

      btnReset.disabled = true;
      btnReset.textContent = "Mengkalkulasi...";

      try {
          const now = new Date();
          
          for (const emp of allKaryawan) {
              let jTahunan = 0;
              let jKhusus = 4; // Tetap 4 per tahun
              let jAkumulasi = 0;

              const sisaTahunLalu = parseInt(emp.jatah_cuti_tahunan) || 0;

              if (emp.tanggal_join) {
                  const join = smartParseDate(emp.tanggal_join);
                  if (join) {
                      const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
                      const tenureYears = diffMonths / 12;

                      // A. LOGIKA CUTI TAHUNAN (Min 3 bulan)
                      if (diffMonths >= 3) {
                          jTahunan = 12;
                          // Penghargaan Masa Kerja
                          if (tenureYears >= 11) jTahunan += 4;
                          else if (tenureYears >= 10) jTahunan += 3;
                          else if (tenureYears >= 8) jTahunan += 2;
                          else if (tenureYears >= 6) jTahunan += 1;
                      }

                      // B. LOGIKA CARRYOVER (Persentase)
                      if (tenureYears >= 5) {
                          jAkumulasi = Math.floor(sisaTahunLalu * 1.0); // 100%
                      } else if (tenureYears >= 3) {
                          jAkumulasi = Math.floor(sisaTahunLalu * 0.5); // 50%
                      } else {
                          jAkumulasi = 0; // 0%
                      }
                  }
              }

              await updateDoc(doc(db, COL.MASTER_KARYAWAN, emp.id), {
                 jatah_cuti_tahunan: jTahunan,
                 jatah_cuti_khusus: jKhusus,
                 jatah_cuti_akumulasi: jAkumulasi
              });
          }

          toast("Kalkulasi & Reset Tahunan Selesai!", "success");
          await loadData();
      } catch (err) {
          console.error(err);
          toast("Terjadi kesalahan saat mereset data.", "error");
      } finally {
          btnReset.disabled = false;
          btnReset.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Reset Otomatis`;
      }
  });

  await loadData();
  return { unmount() {} };
}
