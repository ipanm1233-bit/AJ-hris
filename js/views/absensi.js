import { db, COL, collection, getDocs, writeBatch, doc, query, where } from "../firebase-config.js";
import { toast, genId } from "../utils.js";

export async function mount(container) {
   const btnImport = container.querySelector("#btn-import-absen");
   const inputUpload = container.querySelector("#absen-upload");
   const btnExport = container.querySelector("#btn-export-absen");

   // ==========================================
   // 1. LOGIKA IMPORT RAW ABSENSI
   // ==========================================
   btnImport.onclick = () => inputUpload.click();
   
   inputUpload.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (typeof window.XLSX === "undefined") {
         return toast("Sistem sedang memuat library Excel. Coba lagi dalam 3 detik.", "warning");
      }

      btnImport.disabled = true; btnImport.textContent = "Memproses Ratusan Baris Data...";

      try {
         const data = new Uint8Array(await file.arrayBuffer());
         const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
         const sheet = workbook.Sheets[workbook.SheetNames[0]];
         
         const rows = window.XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: "yyyy-mm-dd" });
         
         if (rows.length === 0) throw new Error("File Excel kosong.");

         // Pisahkan ke dalam chunk (batch) agar database tidak crash
         const chunks = [];
         let tempArr = [];
         rows.forEach(r => {
             const getVal = (keys) => {
                for(let k of Object.keys(r)) { if(keys.some(x => k.toUpperCase().includes(x))) return r[k]; }
                return null;
             };

             let tglStr = getVal(["TANGGAL", "DATE"]);
             if (tglStr && typeof tglStr === 'string' && tglStr.includes('/')) {
                 // Format ulang DD/MM/YYYY ke YYYY-MM-DD agar seragam di pencarian
                 const [d,m,y] = tglStr.split('/');
                 tglStr = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
             }

             const payload = {
                nik: getVal(["NIK", "ID"]),
                nama: getVal(["NAMA", "NAME"]),
                tanggal: tglStr,
                jadwal_masuk: getVal(["JAM KERJA MASUK"]),
                jadwal_keluar: getVal(["JAM KERJA KELUAR"]),
                scan_masuk: getVal(["JAM MASUK", "SCAN MASUK"]),
                scan_keluar: getVal(["JAM KELUAR", "SCAN KELUAR"])
             };

             if (payload.nama && payload.tanggal) {
                tempArr.push(payload);
                if (tempArr.length === 450) { chunks.push(tempArr); tempArr = []; }
             }
         });
         if (tempArr.length > 0) chunks.push(tempArr);

         // Upload bertahap
         for (const chunk of chunks) {
             const batch = writeBatch(db);
             for (const p of chunk) {
                batch.set(doc(collection(db, COL.DATA_ABSENSI)), p);
             }
             await batch.commit();
         }

         toast(`Berhasil mengimpor ${rows.length} baris data absensi!`, "success");
      } catch (err) {
         toast("Gagal Import: " + err.message, "error");
      }
      
      btnImport.disabled = false; 
      btnImport.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg> Pilih & Unggah File Excel`;
      inputUpload.value = ""; // reset
   };

   // ==========================================
   // 2. LOGIKA EXPORT (KALIBRASI ABSENSI & CUTI)
   // ==========================================
   btnExport.onclick = async () => {
       const start = container.querySelector("#ex-start").value;
       const end = container.querySelector("#ex-end").value;

       if (!start || !end) return toast("Pilih Tanggal Mulai dan Akhir Cutoff!", "warning");
       
       if (typeof window.XLSX === "undefined") return toast("Library Excel belum siap.", "warning");

       btnExport.disabled = true; btnExport.textContent = "Mengkalkulasi Laporan...";

       try {
           // A. Ambil Raw Absensi berdasarkan Tanggal
           const qAbsen = query(collection(db, COL.DATA_ABSENSI), where("tanggal", ">=", start), where("tanggal", "<=", end));
           const snapAbsen = await getDocs(qAbsen);
           const rawAbsen = snapAbsen.docs.map(d => d.data());

           // B. Ambil Master Cuti (Pencarian Lokal karena rentang tanggalnya manual di DB kita)
           const snapCuti = await getDocs(collection(db, COL.MASTER_CUTI));
           const rawCuti = snapCuti.docs.map(d => d.data()).filter(c => {
               if(!c.tanggal) return false;
               const tCuti = typeof c.tanggal === 'string' ? c.tanggal.split('T')[0] : new Date(c.tanggal).toISOString().split('T')[0];
               return tCuti >= start && tCuti <= end;
           });

           // C. Gabungkan Logika (Kalibrasi)
           const exportData = [];
           
           rawAbsen.forEach(absen => {
               // Cek apakah di tanggal ini orang tersebut ada di database Cuti/Izin/Sakit
               const cutiMatch = rawCuti.find(c => c.nama_karyawan === absen.nama && c.tanggal.startsWith(absen.tanggal));
               
               let statusKehadiran = "Hadir";
               let keterangan = "-";

               if (cutiMatch) {
                   statusKehadiran = cutiMatch.type_cuti || "Cuti/Izin";
                   keterangan = cutiMatch.keterangan_cuti || "Disetujui HRIS";
               } else if (!absen.scan_masuk && !absen.scan_keluar) {
                   statusKehadiran = "Alpa / Mangkir";
               } else if (!absen.scan_masuk || !absen.scan_keluar) {
                   statusKehadiran = "Lupa Absen Masuk/Pulang";
               }

               // Hitung Keterlambatan Sederhana
               let telatMenit = 0;
               if (absen.jadwal_masuk && absen.scan_masuk && statusKehadiran === "Hadir") {
                   const [jJadwal, mJadwal] = absen.jadwal_masuk.split(':');
                   const [jScan, mScan] = absen.scan_masuk.split(':');
                   const menitJadwal = (parseInt(jJadwal)*60) + parseInt(mJadwal);
                   const menitScan = (parseInt(jScan)*60) + parseInt(mScan);
                   if (menitScan > menitJadwal) telatMenit = menitScan - menitJadwal;
               }

               exportData.push({
                   "NIK": absen.nik,
                   "Nama Karyawan": absen.nama,
                   "Tanggal": absen.tanggal,
                   "Jadwal Shift": `${absen.jadwal_masuk} - ${absen.jadwal_keluar}`,
                   "Scan Masuk": absen.scan_masuk || "",
                   "Scan Keluar": absen.scan_keluar || "",
                   "Keterlambatan (Menit)": telatMenit,
                   "Status HRIS": statusKehadiran,
                   "Keterangan HRIS": keterangan
               });
           });

           if(exportData.length === 0) throw new Error("Tidak ada data absensi di rentang tanggal tersebut.");

           // Urutkan berdasarkan Nama, lalu Tanggal
           exportData.sort((a,b) => a["Nama Karyawan"].localeCompare(b["Nama Karyawan"]) || a["Tanggal"].localeCompare(b["Tanggal"]));

           // Cetak Excel
           const ws = window.XLSX.utils.json_to_sheet(exportData);
           const wb = window.XLSX.utils.book_new();
           window.XLSX.utils.book_append_sheet(wb, ws, "Rekap_Kehadiran");
           window.XLSX.writeFile(wb, `Laporan_Absensi_${start}_to_${end}.xlsx`);

           toast("Laporan Absensi berhasil di-download!", "success");

       } catch (err) {
           toast("Gagal menarik laporan: " + err.message, "error");
       }
       
       btnExport.disabled = false; 
       btnExport.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Tarik & Download Excel Rekap`;
   };

   return { unmount() {} };
}
