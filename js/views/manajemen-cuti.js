import { db, COL, doc, updateDoc } from "../firebase-config.js";
import { fsGetAll, toast, escapeHtml, smartParseDate, toNumber } from "../utils.js";
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
         tbody.innerHTML = `<tr><td colspan="6">${emptyState("Belum ada data karyawan aktif.")}</td></tr>`;
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
               <td class="py-3 px-4 text-center">
                  <span class="bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-lg">${jAkumulasi}</span>
                  ${k.cuti_akumulasi_expired ? `<p class="text-[10px] text-amber-600 mt-1">Hangus stlh ${escapeHtml(k.cuti_akumulasi_expired)}</p>` : ""}
               </td>
               <td class="py-3 px-4 text-center">
                  <input type="number" step="0.5" min="0" data-sisa-lalu="${k.id}"
                     value="${k.sisa_cuti_tahun_lalu ?? ""}" placeholder="Belum diisi"
                     class="w-24 text-center px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-maroon-400 text-sm font-semibold text-slate-700">
                  ${(k.sisa_cuti_tahun_lalu === undefined || k.sisa_cuti_tahun_lalu === null) ? `<p class="text-[10px] text-amber-600 mt-1">Belum diisi HRD</p>` : ""}
               </td>
            </tr>
         `;
     }).join("");

     // Input manual "Sisa Cuti Tahun Lalu" -- inilah basis carryover yang BENAR
     // (sesuai SK bagian C: "sisa cuti tahunan yang MASIH TERSISA" di tahun
     // lalu), bukan dihitung otomatis dari jatah tahun ini. HRD mengisi
     // langsung di sini (atau lewat Import Excel) sebelum menekan Reset Otomatis.
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
                      // Kolom baru (opsional): kalau HRD isi lewat Excel, dipakai sebagai basis
                      // carryover otomatis saat Reset Otomatis dijalankan (lihat langkah 3 di bawah).
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
  // 3. KALKULASI & RESET OTOMATIS BERDASARKAN SK No.018/HRGA-AJ/XII/2024
  //    (Surat Keputusan Kebijakan Cuti Karyawan CV Andela Jaya)
  // ==========================================
  btnReset.onclick = async () => {
      if (!confirm("Apakah Anda yakin ingin me-reset jatah cuti seluruh karyawan aktif?\n\nSistem akan MEMPRIORITASKAN kolom 'Sisa Cuti Tahun Lalu' yang sudah Anda isi manual sebagai basis carryover (sesuai SK No.018/HRGA-AJ/XII/2024). Karyawan yang kolomnya masih kosong akan dihitung otomatis dari log transaksi sebagai cadangan.\n\nPastikan kolom tsb sudah diisi HRD untuk hasil yang paling akurat. Lanjutkan?")) return;

      btnReset.disabled = true;
      btnReset.textContent = "Mengkalkulasi...";

      try {
          const now = new Date();
          const nextYear = now.getFullYear() + 1;

          // Muat seluruh riwayat cuti agar SISA AKTUAL (bukan jatah kotor) yang dipakai
          // sebagai basis carryover -- sebelumnya bug ini memakai jatah_tahunan mentah
          // (total alokasi tahun lalu) padahal SK bagian C menyebut "sisa cuti tahunan
          // yang MASIH TERSISA", yaitu jatah dikurangi yang sudah terpakai.
          const allCutiLog = await fsGetAll(COL.MASTER_CUTI);
          const tahunLalu = now.getFullYear() - 1;
          const terpakaiTahunLalu = {};
          allCutiLog.forEach(r => {
              const key = r.nama_karyawan;
              if (!key) return;
              const rowYear = parseInt(r.tahun) || (r.tanggal ? new Date(r.tanggal).getFullYear() : null);
              if (rowYear !== tahunLalu) return; // hanya transaksi tahun yang baru saja ditutup
              if (!terpakaiTahunLalu[key]) terpakaiTahunLalu[key] = { Tahunan: 0, Akumulasi: 0 };
              if (r.potong_jatah === "Tahunan" || r.potong_jatah === "Akumulasi") {
                  terpakaiTahunLalu[key][r.potong_jatah] += parseFloat(r.count) || 0;
              }
          });

          for (const emp of allKaryawan) {
              let jTahunanBaru = 0;
              let jKhusus = 4; // SK bagian A.e: jatah Cuti Khusus = 4 hari/tahun
              let jAkumulasiBaru = 0;

              const jatahTahunanLama = toNumber(emp.jatah_cuti_tahunan ?? emp.jatah_tahunan);
              const jatahAkumulasiLama = toNumber(emp.jatah_cuti_akumulasi ?? emp.jatah_akumulasi);
              const used = terpakaiTahunLalu[emp.nama_karyawan] || { Tahunan: 0, Akumulasi: 0 };

              // PERBAIKAN UTAMA: basis carryover sekarang MEMPRIORITASKAN input manual
              // HRD ("Sisa Cuti Tahun Lalu" di kolom tabel / Import Excel) -- sesuai SK
              // bagian C ("sisa cuti tahunan yang MASIH TERSISA" di tahun lalu). Ini
              // penting karena perhitungan otomatis dari log transaksi bisa saja tidak
              // akurat/tidak lengkap (mis. ada cuti lama yang dicatat manual di luar
              // sistem sebelum migrasi ke HRIS ini). Kalau HRD belum sempat mengisi
              // kolom manual untuk karyawan tsb, sistem tetap fallback ke perhitungan
              // otomatis dari log (jatah dikurangi realisasi pemakaian tahun berjalan)
              // supaya proses reset tidak terhambat -- tapi hasilnya sebaiknya dicek
              // ulang oleh HRD.
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

                      // A. LOGIKA CUTI TAHUNAN
                      if (diffMonths >= 12) {
                          // SK bagian A.a poin 1: 12 hari kerja setelah 12 bulan kerja berturut-turut
                          jTahunanBaru = 12;

                          // SK bagian B: Cuti Penghargaan Masa Kerja (tambahan di atas 12 hari dasar)
                          if (tenureYears >= 11) jTahunanBaru += 4;       // > 10 tahun: +4
                          else if (tenureYears >= 10) jTahunanBaru += 3; // 10 tahun: +3
                          else if (tenureYears >= 8) jTahunanBaru += 2;  // 8 tahun: +2
                          else if (tenureYears >= 6) jTahunanBaru += 1;  // 6 tahun: +1
                      } else if (diffMonths >= 3) {
                          // SK bagian A.a poin 2: masa kerja < 1 tahun -> cuti tahunan PROPORSIONAL
                          // sesuai masa kerja (1 hari/bulan), baru bisa dipakai setelah masa kerja 3 bulan.
                          jTahunanBaru = diffMonths;
                      } else {
                          // Masa kerja < 3 bulan: belum berhak cuti tahunan sama sekali.
                          jTahunanBaru = 0;
                      }

                      // B. LOGIKA PERSENTASE CARRYOVER SISA CUTI TAHUNAN (SK bagian C)
                      // PERBAIKAN: basis carryover sekarang SISA AKTUAL (sisaTahunanAktual +
                      // sisaAkumulasiAktual), bukan jatah_tahunan kotor tahun lalu.
                      if (tenureYears >= 5) {
                          jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 1.0); // > 5 tahun: 100% carryover
                      } else if (tenureYears >= 3) {
                          jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 0.5); // 3-5 tahun: 50% carryover
                      } else {
                          jAkumulasiBaru = 0; // < 3 tahun: tidak ada carryover
                      }
                  }
              }

              // Simpan ganda ke field snake_case baru dan format lama agar kompatibel di semua widget.
              // `cuti_akumulasi_expired` mencatat batas pemakaian carryover sesuai SK bagian C:
              // "Sisa Cuti Tahunan bisa digunakan karyawan maksimal sampai bulan Juni tahun
              // berikutnya, jika melewati maka sisa cuti tahunan yang dimiliki karyawan akan hangus."
              await updateDoc(doc(db, COL.MASTER_KARYAWAN, emp.id), {
                 jatah_cuti_tahunan: jTahunanBaru, jatah_tahunan: jTahunanBaru,
                 jatah_cuti_khusus: jKhusus, jatah_khusus: jKhusus,
                 jatah_cuti_akumulasi: jAkumulasiBaru, jatah_akumulasi: jAkumulasiBaru,
                 sisa_cuti_tahun_lalu: null, // dikosongkan lagi -- HRD wajib input ulang utk siklus tahun berikutnya
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
          btnReset.innerHTML = `<i class="fa-solid fa-rotate opacity-80"></i> Reset Otomatis`;
      }
  };

  await loadData();
  return { unmount() {} };
}
