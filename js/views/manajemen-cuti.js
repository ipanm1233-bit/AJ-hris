import { db, COL, collection, getDocs, doc, updateDoc, writeBatch } from "../firebase-config.js";
import { fsGetAll, toast, escapeHtml, smartParseDate } from "../utils.js";
import { emptyState, badge } from "../components.js";

export async function mount(container) {
  // Load library pembaca Excel (SheetJS)
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
          <p class="text-sm text-slate-500 mt-1">Atur jatah cuti karyawan via Excel atau Auto-Reset sesuai Kebijakan CV Andela Jaya.</p>
        </div>
        <div class="flex items-center gap-2">
           <input type="file" id="excel-upload" accept=".xlsx, .xls" class="hidden">
           
           <button id="btn-import-excel" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition shadow-sm">
             📥 Import dari Excel
           </button>
           <button id="btn-reset-tahunan" class="flex items-center gap-2 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition shadow-sm">
             🔄 Kalkulasi & Reset Otomatis
           </button>
        </div>
      </div>

      <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl text-blue-800 text-sm mb-4">
        <p class="font-bold mb-1">Format Kolom Excel untuk Import (Baris pertama harus persis seperti ini):</p>
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
  // 1. RENDER DATA KARYAWAN
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
         // Hitung Masa Kerja Visual
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
                  <p class="text-xs text-slate-500">${escapeHtml(k.nik || "-")}</p>
               </td>
               <td class="py-3 px-4 text-slate-600 font-medium">${masaKerjaStr}</td>
               <td class="py-3 px-4 text-center"><span class="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-lg">${tahunan}</span></td>
               <td class="py-3 px-4 text-center"><span class="bg-purple-100 text-purple-700 font-bold px-3 py-1 rounded-lg">${khusus}</span></td>
               <td class="py-3 px-4 text-center"><span class="bg-amber-100 text-amber-700 font-bold px-3 py-1 rounded-lg">${akumulasi}</span></td>
            </tr>
         `;
     }).join("");
  }

  // ==========================================
  // 2. FITUR IMPORT EXCEL
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
              btnImport.textContent = "⏳ Memproses...";

              let updateCount = 0;
              
              // Proses setiap baris di Excel
              for (const row of json) {
                  const nik = row["NIK"];
                  const nama = row["Nama Karyawan"];
                  if (!nik && !nama) continue;

                  // Cari karyawan di database berdasarkan NIK atau Nama
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

              toast(`Berhasil mengupdate jatah cuti untuk ${updateCount} karyawan!`, "success");
              await loadData(); // Refresh tabel
          } catch (err) {
              console.error(err);
              toast("Gagal membaca Excel. Pastikan format kolom sesuai.", "error");
          } finally {
              btnImport.disabled = false;
              btnImport.innerHTML = `📥 Import dari Excel`;
              fileInput.value = ""; // Reset input
          }
      };
      reader.readAsArrayBuffer(file);
  });

  // ==========================================
  // 3. FITUR RESET OTOMATIS BERDASARKAN KEBIJAKAN
  // ==========================================
  btnReset.addEventListener("click", async () => {
      const confirmReset = confirm("Apakah Anda yakin ingin me-reset jatah cuti seluruh karyawan aktif? Sistem akan otomatis menghitung ulang Cuti Tahunan, Khusus, dan Carryover berdasarkan masa kerja saat ini.");
      if (!confirmReset) return;

      btnReset.disabled = true;
      btnReset.textContent = "⏳ Mengkalkulasi...";

      try {
          const now = new Date();
          
          for (const emp of allKaryawan) {
              let jTahunan = 0;
              let jKhusus = 4; // Tetap 4 per tahun
              let jAkumulasi = 0;

              // Ambil Sisa Cuti Tahunan lama (untuk di-carryover)
              const sisaTahunLalu = parseInt(emp.jatah_cuti_tahunan) || 0;

              if (emp.tanggal_join) {
                  const join = smartParseDate(emp.tanggal_join);
                  if (join) {
                      const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
                      const tenureYears = diffMonths / 12;

                      // A. LOGIKA CUTI TAHUNAN (Min 3 bulan)
                      if (diffMonths >= 3) {
                          jTahunan = 12; // Dasar
                          
                          // Tambahan Cuti Penghargaan Masa Kerja
                          if (tenureYears >= 11) jTahunan += 4;
                          else if (tenureYears >= 10) jTahunan += 3;
                          else if (tenureYears >= 8) jTahunan += 2;
                          else if (tenureYears >= 6) jTahunan += 1;
                      }

                      // B. LOGIKA CARRYOVER (Persentase dari sisa cuti sebelumnya)
                      if (tenureYears >= 5) {
                          jAkumulasi = Math.floor(sisaTahunLalu * 1.0); // 100%
                      } else if (tenureYears >= 3) {
                          jAkumulasi = Math.floor(sisaTahunLalu * 0.5); // 50%
                      } else {
                          jAkumulasi = 0; // 0%
                      }
                  }
              }

              // Update data karyawan ke Firestore
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
          btnReset.innerHTML = `🔄 Kalkulasi & Reset Otomatis`;
      }
  });

  // Mulai memuat data saat layar dibuka
  await loadData();

  return { unmount() {} };
}
