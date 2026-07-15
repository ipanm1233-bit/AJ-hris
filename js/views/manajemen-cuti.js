import { db, COL, doc, updateDoc } from "../firebase-config.js";
import { fsGetAll, toast, escapeHtml, smartParseDate } from "../utils.js";
import { emptyState } from "../components.js";

export async function mount(container, { session }) {
  // Memastikan library pembaca Excel (SheetJS) ter-load dengan aman
  if (!window.XLSX) {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      document.head.appendChild(script);
  }

  const tbody = container.querySelector("#cuti-tbody");
  const btnImport = container.querySelector("#btn-import-excel");
  const fileInput = container.querySelector("#excel-upload");
  const btnReset = container.querySelector("#btn-reset-tahunan");

  let allKaryawan = [];

  // ==========================================
  // 1. MEMUAT & MENAMPILKAN DATA KARYAWAN
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
               <td class="py-3 px-4 text-center"><span class="bg-purple-100 text-purple-800 font-bold px-3 py-1 rounded-lg">${jKhusus}</span></td>
               <td class="py-3 px-4 text-center"><span class="bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-lg">${jAkumulasi}</span></td>
            </tr>
         `;
     }).join("");
  }

  // ==========================================
  // 2. PROSES IMPORT FILE EXCEL
  // ==========================================
  btnImport.onclick = () => fileInput.click();
  
  fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
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
              btnImport.innerHTML = `<i class="fa-solid fa-file-import opacity-80"></i> Import Excel`;
              fileInput.value = ""; 
          }
      };
      reader.readAsArrayBuffer(file);
  };

  // ==========================================
  // 3. KALKULASI & RESET OTOMATIS BERDASARKAN PP
  // ==========================================
  btnReset.onclick = async () => {
      if (!confirm("Apakah Anda yakin ingin me-reset jatah cuti seluruh karyawan aktif?\nSistem akan menghitung otomatis Cuti Tahunan, Khusus, dan Carryover berdasarkan parameter kebijakan masa kerja saat ini.")) return;

      btnReset.disabled = true;
      btnReset.textContent = "Mengkalkulasi...";

      try {
          const now = new Date();
          
          for (const emp of allKaryawan) {
              let jTahunan = 0;
              let jKhusus = 4; // Berdasarkan parameter: Jatah Cuti Khusus per tahun = 4 hari
              let jAkumulasi = 0;

              const sisaTahunLalu = parseInt(emp.jatah_cuti_tahunan || emp.jatah_tahunan) || 0;

              if (emp.tanggal_join) {
                  const join = smartParseDate(emp.tanggal_join);
                  if (join) {
                      const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
                      const tenureYears = diffMonths / 12;

                      // A. LOGIKA CUTI TAHUNAN DASAR (Min. masa kerja 3 bulan)
                      if (diffMonths >= 3) {
                          jTahunan = 12; // Hak Cuti Tahunan Dasar
                          
                          // Tambahan Cuti Penghargaan Masa Kerja
                          if (tenureYears >= 11) jTahunan += 4;
                          else if (tenureYears >= 10) jTahunan += 3;
                          else if (tenureYears >= 8) jTahunan += 2;
                          else if (tenureYears >= 6) jTahunan += 1;
                      }

                      // B. LOGIKA PERSENTASE CARRYOVER (Sisa Cuti Tahunan)
                      if (tenureYears >= 5) {
                          jAkumulasi = Math.floor(sisaTahunLalu * 1.0); // 100% Carryover
                      } else if (tenureYears >= 3) {
                          jAkumulasi = Math.floor(sisaTahunLalu * 0.5); // 50% Carryover
                      } else {
                          jAkumulasi = 0; // 0% Carryover (< 3 tahun)
                      }
                  }
              }

              // Simpan ganda ke field snake_case baru dan format lama agar kompatibel di semua widget
              await updateDoc(doc(db, COL.MASTER_KARYAWAN, emp.id), {
                 jatah_cuti_tahunan: jTahunan, jatah_tahunan: jTahunan,
                 jatah_cuti_khusus: jKhusus, jatah_khusus: jKhusus,
                 jatah_cuti_akumulasi: jAkumulasi, jatah_akumulasi: jAkumulasi
              });
          }

          toast("Kalkulasi & Reset Tahunan Selesai Berhasil!", "success");
          await loadData();
      } catch (err) {
          console.error(err);
          toast("Terjadi kesalahan saat mereset data.", "error");
      } finally {
          btnReset.disabled = false;
          btnReset.innerHTML = `<i class="fa-solid fa-rotate opacity-80"></i> Reset Otomatis`;
      }
  };

  await loadData();
  return { unmount() {} };
}
