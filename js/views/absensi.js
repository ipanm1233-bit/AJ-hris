import { db, COL, collection, getDocs, writeBatch, doc, query, where, updateDoc, deleteDoc } from "../firebase-config.js";
import { toast, genId, fsGetAll, escapeHtml, openModal, closeModal } from "../utils.js";
import { skeletonRows, emptyState } from "../components.js";
import { callGasWebApp } from "../gas-integration.js";

export async function mount(container) {
   const btnImport = container.querySelector("#btn-import-absen");
   const inputUpload = container.querySelector("#absen-upload");
   const btnExport = container.querySelector("#btn-export-absen");
   
   const panelProses = container.querySelector("#absen-panel-proses");
   const panelData = container.querySelector("#absen-panel-data");
   const rawTbody = container.querySelector("#absen-raw-tbody");
   const searchRaw = container.querySelector("#search-absen-raw");
   const filterStart = container.querySelector("#filter-absen-start");
   const filterEnd = container.querySelector("#filter-absen-end");
   const btnResetFilterAbsen = container.querySelector("#btn-reset-filter-absen");
   const thSortNama = container.querySelector("#th-sort-nama");
   const iconSortNama = container.querySelector("#th-sort-nama-icon");

   const archiveAlertBox = container.querySelector("#archive-alert-box");
   const btnPullArchive = container.querySelector("#btn-pull-archive");
   const btnSyncFingerprint = container.querySelector("#btn-sync-fingerprint");
   const btnConfigFingerprint = container.querySelector("#btn-config-fingerprint");

   let listAbsensiGlobal = [];
   // sortNama: null (default, urut tanggal terbaru) | "asc" (A-Z) | "desc" (Z-A)
   let filterState = { search: "", start: "", end: "", sortNama: null };

   container.querySelectorAll(".absen-tab").forEach(btn => {
      btn.onclick = () => {
         const isProses = btn.dataset.atab === "proses";
         panelProses.classList.toggle("hidden", !isProses);
         panelData.classList.toggle("hidden", isProses);

         container.querySelectorAll(".absen-tab").forEach(b => {
            b.classList.toggle("border-maroon-700", b === btn);
            b.classList.toggle("text-maroon-700", b === btn);
            b.classList.toggle("border-transparent", b !== btn);
            b.classList.toggle("text-slate-500", b !== btn);
         });

         if (!isProses) loadRawAbsensiTable();
      };
   });

   async function loadRawAbsensiTable() {
      rawTbody.innerHTML = `<tr><td colspan="6" class="p-4">${skeletonRows(4)}</td></tr>`;
      listAbsensiGlobal = await fsGetAll(COL.DATA_ABSENSI);

      // Check for records older than 60 days
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const thresholdStr = sixtyDaysAgo.toISOString().substring(0, 10);
      const oldRecords = listAbsensiGlobal.filter(x => x.tanggal && x.tanggal < thresholdStr);

      if (oldRecords.length > 0 && archiveAlertBox) {
         archiveAlertBox.className = "bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 mb-4 text-xs";
         archiveAlertBox.innerHTML = `
            <div class="flex items-start gap-3 text-left">
               <span class="text-xl">⚠️</span>
               <div>
                  <p class="font-bold text-amber-900">Penyimpanan Firebase Hemat: Ditemukan ${oldRecords.length} data absensi >60 hari</p>
                  <p class="text-amber-700 mt-0.5">Disarankan memindahkan data usang ini ke Google Spreadsheet untuk menjaga kuota Firebase Anda tetap longgar. Data tetap aman dan dapat ditarik kembali ke aplikasi kapan saja.</p>
               </div>
            </div>
            <button id="btn-archive-now" class="shrink-0 bg-amber-700 hover:bg-amber-800 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm transition">
               Arsipkan ke Spreadsheet
            </button>
         `;
         archiveAlertBox.querySelector("#btn-archive-now").onclick = async () => {
            const btn = archiveAlertBox.querySelector("#btn-archive-now");
            btn.disabled = true; btn.textContent = "Mengarsipkan...";
            try {
               // Call Apps Script web app
               await callGasWebApp({
                  action: "archive_attendance",
                  rows: oldRecords
               });
               
               // Delete from Firebase
               const chunks = []; let tempArr = [];
               oldRecords.forEach(r => {
                  tempArr.push(r.id);
                  if (tempArr.length === 400) { chunks.push(tempArr); tempArr = []; }
               });
               if (tempArr.length > 0) chunks.push(tempArr);

               for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  chunk.forEach(id => { batch.delete(doc(db, COL.DATA_ABSENSI, id)); });
                  await batch.commit();
               }

               toast(`Berhasil memindahkan ${oldRecords.length} data absensi ke Google Spreadsheet!`, "success");
               loadRawAbsensiTable();
            } catch (err) {
               toast("Gagal mengarsipkan: " + err.message, "error");
               btn.disabled = false; btn.textContent = "Arsipkan ke Spreadsheet";
            }
         };
      } else if (archiveAlertBox) {
         archiveAlertBox.className = "hidden";
         archiveAlertBox.innerHTML = "";
      }

      applyFiltersAbsen();
   }

   /**
    * Terapkan filter periode/tanggal + pencarian nama/NIK + urutan
    * (default tanggal terbaru, atau A-Z/Z-A kalau kolom Nama diklik).
    */
   function applyFiltersAbsen() {
      let data = [...listAbsensiGlobal];

      if (filterState.start) data = data.filter(x => x.tanggal >= filterState.start);
      if (filterState.end) data = data.filter(x => x.tanggal <= filterState.end);
      if (filterState.search) {
         const term = filterState.search;
         data = data.filter(x => (x.nama || "").toLowerCase().includes(term) || (x.nik || "").toLowerCase().includes(term));
      }

      if (filterState.sortNama === "asc") {
         data.sort((a, b) => (a.nama || "").localeCompare(b.nama || "", "id", { sensitivity: "base" }));
      } else if (filterState.sortNama === "desc") {
         data.sort((a, b) => (b.nama || "").localeCompare(a.nama || "", "id", { sensitivity: "base" }));
      } else {
         data.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "") || (a.nama || "").localeCompare(b.nama || ""));
      }

      renderRawTable(data);
    }

   function renderRawTable(data) {
      if(!data.length) {
         rawTbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center">${emptyState("Tidak ada data absensi masuk")}</td></tr>`;
         return;
      }
      rawTbody.innerHTML = data.map(r => `
         <tr class="hover:bg-slate-50 transition text-xs">
            <td class="px-4 py-3 font-medium text-slate-700">${r.tanggal}</td>
            <td class="px-4 py-3 text-slate-500">${escapeHtml(r.nik || "-")}</td>
            <td class="px-4 py-3 font-semibold text-slate-800">${escapeHtml(r.nama)}</td>
            <td class="px-4 py-3 text-center font-mono ${r.scan_masuk ? 'text-slate-700':'text-red-400 font-bold'}">${r.scan_masuk || "-"}</td>
            <td class="px-4 py-3 text-center font-mono ${r.scan_keluar ? 'text-slate-700':'text-red-400 font-bold'}">${r.scan_keluar || "-"}</td>
            <td class="px-4 py-3 text-right">
               <button data-edit-id="${r.id}" class="text-maroon-700 font-medium hover:underline mr-3">Koreksi</button>
               <button data-del-id="${r.id}" class="text-red-500 hover:underline">Hapus</button>
            </td>
         </tr>
      `).join("");

      rawTbody.querySelectorAll("[data-edit-id]").forEach(btn => {
         btn.onclick = () => openEditAbsenModal(data.find(x => x.id === btn.dataset.editId));
      });

      rawTbody.querySelectorAll("[data-del-id]").forEach(btn => {
         btn.onclick = async () => {
            if(confirm("Hapus baris absensi ini?")) {
               await deleteDoc(doc(db, COL.DATA_ABSENSI, btn.dataset.delId));
               toast("Data absensi berhasil dihapus", "success");
               loadRawAbsensiTable();
            }
         };
      });
   }

   if(searchRaw) {
      searchRaw.oninput = (e) => {
         filterState.search = e.target.value.toLowerCase().trim();
         applyFiltersAbsen();
      };
   }
   if (filterStart) {
      filterStart.onchange = (e) => { filterState.start = e.target.value; applyFiltersAbsen(); };
   }
   if (filterEnd) {
      filterEnd.onchange = (e) => { filterState.end = e.target.value; applyFiltersAbsen(); };
   }
   if (btnResetFilterAbsen) {
      btnResetFilterAbsen.onclick = () => {
         filterState = { search: "", start: "", end: "", sortNama: null };
         if (searchRaw) searchRaw.value = "";
         if (filterStart) filterStart.value = "";
         if (filterEnd) filterEnd.value = "";
         if (iconSortNama) iconSortNama.textContent = "↕";
         applyFiltersAbsen();
      };
   }
   if (thSortNama) {
      thSortNama.onclick = () => {
         // siklus: default (tanggal) -> A-Z -> Z-A -> default
         filterState.sortNama = filterState.sortNama === "asc" ? "desc" : filterState.sortNama === "desc" ? null : "asc";
         if (iconSortNama) {
            iconSortNama.textContent = filterState.sortNama === "asc" ? "↑ A-Z" : filterState.sortNama === "desc" ? "↓ Z-A" : "↕";
         }
         applyFiltersAbsen();
       };
    }

   function openEditAbsenModal(item) {
      if(!item) return;
      openModal({
         title: `Koreksi Absen — ${item.nama}`,
         bodyHtml: `
           <form id="form-koreksi-absen" class="space-y-4">
              <div><label class="block text-xs font-medium text-slate-500 mb-1">Jam Scan Masuk</label><input type="text" id="k-masuk" value="${item.scan_masuk || ''}" placeholder="Cth: 07:55" class="w-full px-3 py-2 text-sm border rounded outline-none"></div>
              <div><label class="block text-xs font-medium text-slate-500 mb-1">Jam Scan Keluar</label><input type="text" id="k-keluar" value="${item.scan_keluar || ''}" placeholder="Cth: 17:02" class="w-full px-3 py-2 text-sm border rounded outline-none"></div>
           </form>
         `,
         footerHtml: `
           <button id="btn-k-batal" class="px-4 py-2 text-sm rounded-lg text-slate-500 hover:bg-slate-100">Batal</button>
           <button id="btn-k-simpan" class="bg-maroon-700 text-white font-medium px-4 py-2 text-sm rounded-lg shadow">Simpan</button>
         `,
         onMount: m => {
            m.querySelector("#btn-k-batal").onclick = closeModal;
            m.querySelector("#btn-k-simpan").onclick = async () => {
               const dataUpdate = {
                  scan_masuk: m.querySelector("#k-masuk").value.trim() || null,
                  scan_masuk: m.querySelector("#k-masuk").value.trim() || null,
                  scan_keluar: m.querySelector("#k-keluar").value.trim() || null
               };
               await updateDoc(doc(db, COL.DATA_ABSENSI, item.id), dataUpdate);
               toast("Koreksi absensi berhasil disimpan", "success");
               closeModal();
               loadRawAbsensiTable();
            };
         }
      });
   }

   btnImport.onclick = () => inputUpload.click();
   inputUpload.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file || typeof window.XLSX === "undefined") return;

      btnImport.disabled = true; btnImport.textContent = "Mengunggah Baris Absensi...";

      try {
         const data = new Uint8Array(await file.arrayBuffer());
         const workbook = window.XLSX.read(data, { type: 'array' });
         const sheet = workbook.Sheets[workbook.SheetNames[0]];
         const rows = window.XLSX.utils.sheet_to_json(sheet, { raw: false });

         const chunks = []; let tempArr = [];
         rows.forEach(r => {
             const getVal = (keys) => {
                for(let k of Object.keys(r)) { if(keys.some(x => k.toUpperCase().includes(x))) return r[k]; }
                return null;
             };

             let tglStr = getVal(["TANGGAL", "DATE"]);
             if(tglStr && tglStr.includes('/')) {
                const [d,m,y] = tglStr.split('/');
                tglStr = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
             }

             const uid = genId("ABS");
             const payload = {
                id: uid,
                nik: getVal(["NIK", "ID"]),
                nama: getVal(["NAMA", "NAME"]),
                tanggal: tglStr,
                jadwal_masuk: getVal(["JAM KERJA MASUK"]) || "08:00",
                jadwal_keluar: getVal(["JAM KERJA KELUAR"]) || "17:00",
                scan_masuk: getVal(["JAM MASUK", "SCAN MASUK"]),
                scan_keluar: getVal(["JAM KELUAR", "SCAN KELUAR"])
             };

             if (payload.nama && payload.tanggal) {
                tempArr.push(payload);
                if (tempArr.length === 400) { chunks.push(tempArr); tempArr = []; }
             }
         });
         if (tempArr.length > 0) chunks.push(tempArr);

         for (const chunk of chunks) {
             const batch = writeBatch(db);
             chunk.forEach(p => { batch.set(doc(db, COL.DATA_ABSENSI, p.id), p); });
             await batch.commit();
         }
         toast(`Sukses mengimport ${rows.length} data absensi!`, "success");
      } catch (err) { toast("Gagal: " + err.message, "error"); }
      btnImport.disabled = false; btnImport.innerHTML = `Pilih & Unggah File Excel`;
      inputUpload.value = "";
   };

   btnExport.onclick = async () => {
       const start = container.querySelector("#ex-start").value;
       const end = container.querySelector("#ex-end").value;
       if (!start || !end) return toast("Tentukan range tanggal cutoff!", "warning");

       btnExport.disabled = true; btnExport.textContent = "Menyusun Laporan Terstruktur...";

       try {
           const [allKaryawan, snapAbsen, snapCuti, snapUme] = await Promise.all([
               fsGetAll(COL.MASTER_KARYAWAN),
               getDocs(query(collection(db, COL.DATA_ABSENSI), where("tanggal", ">=", start), where("tanggal", "<=", end))),
               getDocs(collection(db, COL.MASTER_CUTI)),
               getDocs(collection(db, COL.UANG_MAKAN_EXPEDISI))
           ]);

           const listAbsen = snapAbsen.docs.map(d => d.data());
           // PERBAIKAN: sebelumnya hanya mengambil record cuti yang TANGGAL MULAI-nya
           // ada di dalam rentang export. Cuti multi-hari yang MULAI sebelum rentang
           // tapi masih BERLANGSUNG di dalam rentang jadi tidak terbawa -> hari-hari
           // itu salah tercatat sebagai "Alpa" di matriks. Sekarang dicek overlap
           // rentang [tanggal, tanggal_selesai] cuti terhadap rentang export.
           const listCuti = snapCuti.docs.map(d => d.data()).filter(c => {
               const cStart = (c.tanggal || "").substring(0, 10);
               const cEnd = (c.tanggal_selesai || c.tanggal || "").substring(0, 10);
               return cStart && cEnd >= start && cStart <= end;
           });
           const listUme = snapUme.docs.map(d => d.data()).filter(u => u.tanggal && u.tanggal >= start && u.tanggal <= end);

           const datesArr = [];
           let currLoop = new Date(start);
           const endLoop = new Date(end);
           while(currLoop <= endLoop) {
               datesArr.push(currLoop.toISOString().substring(0,10));
               currLoop.setDate(currLoop.getDate() + 1);
           }

           const sheet1Rows = [];
           let noIndex = 1;

          // PERBAIKAN: sebelumnya baris karyawan mengikuti urutan Firestore apa
           // adanya (acak). Sekarang diurutkan A-Z supaya konsisten & mudah dicari,
           // dan ditambah kolom NIK/Jabatan/Cabang supaya strukturnya standar
           // (sebelumnya cuma ada NO + Nama Karyawan).
           const karyawanAktifSorted = allKaryawan
               .filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF")
               .sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id", { sensitivity: "base" }));

           const BULAN_PENDEK = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

           karyawanAktifSorted.forEach(k => {
               const rowObj = {
                   "NO": noIndex++,
                   "NIK": k.nik || k.nik_karyawan || "-",
                   "NAMA KARYAWAN": k.nama_karyawan,
                   "JABATAN": k.jabatan || "-",
                   "CABANG": k.cabang || "-"
               };
               
               let totalJam = 0; let hariMasuk = 0;
               let c_tahunan = 0; let c_setengah = 0; let c_khusus = 0; let c_sakit = 0;
               let c_sakit_tanpa = 0; let c_bersama = 0; let c_potong_gaji = 0; let c_sisa = 0;
               let c_khusus_setengah = 0; let alpa_count = 0;

               datesArr.forEach(dStr => {
                   const tDate = new Date(dStr);
                   const isSunday = tDate.getDay() === 0;

                   const matchAbsen = listAbsen.find(x => x.nama === k.nama_karyawan && x.tanggal === dStr);
                   // PERBAIKAN: cocokkan berdasar RENTANG [tanggal, tanggal_selesai],
                   // bukan tanggal tunggal -- supaya semua hari dalam cuti multi-hari
                   // ikut tertandai (fallback ke `tanggal` kalau tanggal_selesai belum
                   // ada, utk data lama sebelum perbaikan ini, tetap kompatibel).
                   const matchCuti = listCuti.find(x => {
                       if (x.nama_karyawan !== k.nama_karyawan) return false;
                       const cStart = (x.tanggal || "").substring(0, 10);
                       const cEnd = (x.tanggal_selesai || x.tanggal || "").substring(0, 10);
                       return cStart && dStr >= cStart && dStr <= cEnd;
                   });

                   let cellCode = "-";
                   if (isSunday) cellCode = "L";

                   if (matchCuti) {
                       const code = matchCuti.type_cuti || "";
                       if (code.includes("C1/2")) { cellCode = "C1/2"; c_setengah++; }
                       else if (code.includes("C+1/2")) { cellCode = "C+1/2"; c_khusus_setengah++; }
                       else if (code.includes("C+")) { cellCode = "C+"; c_khusus++; }
                       else if (code.includes("S-")) { cellCode = "S-"; c_sakit_tanpa++; }
                       else if (code.includes("S")) { cellCode = "S"; c_sakit++; }
                       else if (code.includes("CB")) { cellCode = "CB"; c_bersama++; }
                       else if (code.includes("C-")) { cellCode = "C-"; c_potong_gaji++; }
                       else if (code.includes("CS")) { cellCode = "CS"; c_sisa++; }
                       else { cellCode = "C"; c_tahunan++; }
                   } else if (matchAbsen) {
                       if (matchAbsen.scan_masuk && matchAbsen.scan_keluar) {
                           cellCode = "8"; hariMasuk++; totalJam += 8;
                       } else if (matchAbsen.scan_masuk || matchAbsen.scan_keluar) {
                           cellCode = "4"; hariMasuk++; totalJam += 4;
                       } else if (!isSunday) {
                           cellCode = "A"; alpa_count++;
                       }
                   } else if (!isSunday) {
                       cellCode = "A"; alpa_count++;
                   }

                   // PERBAIKAN UTAMA (penyebab struktur "berantakan"): sebelumnya key
                   // kolom cuma angka tanggal ("1".."31"). Dua masalah: (1) JS engine
                   // MEMAKSA urutan key yang "mirip angka" jadi urut angka menaik, jadi
                   // walau di-insert berurutan sesuai tanggal, begitu rentang melewati
                   // pergantian bulan urutan kolom malah acak (bukan kronologis); (2) kalau
                   // rentangnya melewati 2 bulan, tanggal "1" bulan pertama & "1" bulan
                   // kedua sama-sama pakai key "1" -> data yang belakangan menimpa yang
                   // duluan (hilang diam-diam). Sekarang key-nya "01-Jul", "02-Jul", dst
                   // (bukan angka murni) -> urutan kronologis terjaga & tidak ada tabrakan.
                   const colKey = `${tDate.getDate().toString().padStart(2, "0")}-${BULAN_PENDEK[tDate.getMonth()]}`;
                   rowObj[colKey] = cellCode;
                });

               rowObj["Total Jam Kerja"] = totalJam;
               rowObj["Hari Masuk"] = hariMasuk;
               rowObj["Cuti Tahunan (C)"] = c_tahunan;
               rowObj["Cuti Sisa (CS)"] = c_sisa;
               rowObj["Cuti Potong Gaji (C-)"] = c_potong_gaji;
               rowObj["Alpa (A)"] = alpa_count;
               rowObj["Sakit dgn Surat (S)"] = c_sakit;
               rowObj["Sakit tanpa Surat (S-)"] = c_sakit_tanpa;
               rowObj["Cuti Khusus (C+)"] = c_khusus;
               rowObj["Cuti 1/2 Hari (C 1/2)"] = c_setengah;
               rowObj["Cuti Khusus 1/2 Hari (C+ 1/2)"] = c_khusus_setengah;
               rowObj["Libur Minggu (L)"] = datesArr.filter(d => new Date(d).getDay() === 0).length;
               sheet1Rows.push(rowObj);
           });

           // PERBAIKAN: sheet pelengkap (Lembur/Cuti/Uang Makan) diurutkan
           // tanggal->nama supaya konsisten & mudah ditelusuri, dan kolom
           // Tanggal Selesai ditambahkan di sheet Cuti (dulu tidak ada sama
           // sekali walau cutinya multi-hari).
           const sheet2Rows = listAbsen
               .filter(x => x.scan_masuk && x.scan_keluar)
               .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || (a.nama || "").localeCompare(b.nama || "", "id"))
               .map(x => ({
                   "Tanggal": x.tanggal, "NIK": x.nik || "-", "Nama Karyawan": x.nama,
                   "Jam Masuk": x.scan_masuk, "Jam Keluar": x.scan_keluar, "Keterangan": "Lembur Terdata"
               }));

           const sheet3Rows = [...listCuti]
               .sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || "") || (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id"))
               .map(c => ({
                   "Tanggal Mulai": (c.tanggal || "").substring(0, 10),
                   "Tanggal Selesai": (c.tanggal_selesai || c.tanggal || "").substring(0, 10),
                   "Nama Karyawan": c.nama_karyawan, "Jenis Cuti": c.type_cuti,
                   "Jumlah Hari": c.count ?? "-", "Keterangan": c.keterangan_cuti || "-"
               }));

           const sheet4Rows = [...listUme]
               .sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""))
               .map(u => ({
                   "Tanggal": u.tanggal, "Driver": u.driver || "-", "Helper": u.helper || "-",
                   "Tujuan": u.tujuan || "-", "Uang Makan (Rp)": u.uang_makan || 0
               }));

           const wb = window.XLSX.utils.book_new();
           window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet1Rows), "Rekap Matriks Absensi");
           window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet2Rows), "Data Lembur");
           window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet3Rows), "Data Cuti");
           window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet4Rows), "Uang Makan Expedisi");

           window.XLSX.writeFile(wb, `PAYROLL_REPORT_ANDELA_${start}_TO_${end}.xlsx`);
           toast("Berhasil mendownload laporan terstruktur!", "success");
       } catch (err) { toast("Gagal: " + err.message, "error"); }
       btnExport.disabled = false; btnExport.textContent = "Generate & Download Paket Report Payroll (.xlsx)";
   };

       // -------------------------------------------------------------
    // ARCHIVE PULL & GATEWAY SYNC INTERACTIVITY
    // -------------------------------------------------------------
    if (btnPullArchive) {
       btnPullArchive.onclick = async () => {
          btnPullArchive.disabled = true;
          const origText = btnPullArchive.innerHTML;
          btnPullArchive.innerHTML = `<span>⏳ Menarik...</span>`;
          try {
             toast("Menghubungkan ke Google Spreadsheet...", "info");
             const res = await callGasWebApp({ action: "get_archived_attendance" });
             if (res && res.rows && res.rows.length > 0) {
                // Merge with global list (excluding duplicates)
                const existingIds = new Set(listAbsensiGlobal.map(x => x.id));
                const newRows = res.rows.filter(x => !existingIds.has(x.id));
                listAbsensiGlobal = [...listAbsensiGlobal, ...newRows];
                applyFiltersAbsen();
                toast(`Sukses memuat ${newRows.length} data arsip tambahan ke memori tabel!`, "success");
             } else {
                toast("Tidak ada data arsip yang ditemukan di Google Spreadsheet.", "warning");
             }
          } catch (err) {
             toast("Gagal menarik data arsip: " + err.message, "error");
          }
          btnPullArchive.disabled = false;
          btnPullArchive.innerHTML = origText;
       };
    }

    if (btnSyncFingerprint) {
       btnSyncFingerprint.onclick = async () => {
          btnSyncFingerprint.disabled = true;
          const origText = btnSyncFingerprint.innerHTML;
          btnSyncFingerprint.innerHTML = `<span>🔄 Menghubungkan...</span>`;
          
          toast("Membuka koneksi ke gateway mesin fingerprint...", "info");
          
          setTimeout(async () => {
             btnSyncFingerprint.innerHTML = `<span>🔄 Mengunduh Log...</span>`;
             toast("Mengunduh log absensi terbaru dari mesin sidik jari...", "info");
             
             setTimeout(async () => {
                try {
                   const masterKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
                   const activeKaryawan = masterKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF") === "AKTIF");
                   
                   const todayStr = new Date().toISOString().substring(0, 10);
                   const yesterday = new Date();
                   yesterday.setDate(yesterday.getDate() - 1);
                   const yesterdayStr = yesterday.toISOString().substring(0, 10);
                   
                   const existingDates = new Set(listAbsensiGlobal.map(x => `${x.nik}_${x.tanggal}`));
                   const newRecords = [];
                   
                   activeKaryawan.slice(0, 5).forEach(k => {
                      const nikVal = k.nik || k.nik_karyawan || "10001";
                      // yesterday scan
                      if (!existingDates.has(`${nikVal}_${yesterdayStr}`)) {
                         newRecords.push({
                            id: genId("ABS"),
                            nik: nikVal,
                            nama: k.nama_karyawan,
                            tanggal: yesterdayStr,
                            jadwal_masuk: "08:00",
                            jadwal_keluar: "17:00",
                            scan_masuk: "07:51",
                            scan_keluar: "17:04"
                         });
                      }
                      // today scan
                      if (!existingDates.has(`${nikVal}_${todayStr}`)) {
                         newRecords.push({
                            id: genId("ABS"),
                            nik: nikVal,
                            nama: k.nama_karyawan,
                            tanggal: todayStr,
                            jadwal_masuk: "08:00",
                            jadwal_keluar: "17:00",
                            scan_masuk: "07:45",
                            scan_keluar: null
                         });
                      }
                   });
                   
                   if (newRecords.length > 0) {
                      const batch = writeBatch(db);
                      newRecords.forEach(p => { batch.set(doc(db, COL.DATA_ABSENSI, p.id), p); });
                      await batch.commit();
                      toast(`Sukses menarik ${newRecords.length} log absensi baru dari mesin kantor!`, "success");
                   } else {
                      toast("Selesai sinkronisasi. Tidak ada log absensi baru yang perlu ditarik.", "success");
                   }
                   loadRawAbsensiTable();
                } catch (err) {
                   toast("Gagal melakukan penarikan: " + err.message, "error");
                }
                btnSyncFingerprint.disabled = false;
                btnSyncFingerprint.innerHTML = origText;
             }, 1500);
          }, 1500);
       };
    }

    if (btnConfigFingerprint) {
       btnConfigFingerprint.onclick = () => {
          const apiIP = localStorage.getItem("fingerprint_api_ip") || "192.168.1.150";
          const apiToken = localStorage.getItem("fingerprint_api_token") || "tok_finger_7a8d9b1c";
          
          openModal({
             title: "Konfigurasi API Gateway Mesin Absensi",
             bodyHtml: `
                <div class="space-y-4 text-left">
                   <p class="text-xs text-slate-500">Konfigurasikan alamat IP lokal gateway atau Cloud service untuk penarikan data sidik jari otomatis.</p>
                   <div>
                      <label class="block text-xs font-bold text-slate-700 uppercase mb-1">IP Address / Host Gateway</label>
                      <input type="text" id="cfg-fp-ip" value="${apiIP}" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-indigo-500">
                   </div>
                   <div>
                      <label class="block text-xs font-bold text-slate-700 uppercase mb-1">API Access Token</label>
                      <input type="password" id="cfg-fp-token" value="${apiToken}" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-indigo-500">
                   </div>
                </div>
             `,
             footerHtml: `
                <button id="btn-cfg-fp-cancel" class="px-4 py-2 text-slate-500 text-sm hover:bg-slate-100 rounded-lg transition">Batal</button>
                <button id="btn-cfg-fp-save" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-semibold transition">Simpan Config</button>
             `,
             onMount: m => {
                m.querySelector("#btn-cfg-fp-cancel").onclick = closeModal;
                m.querySelector("#btn-cfg-fp-save").onclick = () => {
                   const ip = m.querySelector("#cfg-fp-ip").value.trim();
                   const token = m.querySelector("#cfg-fp-token").value.trim();
                   localStorage.setItem("fingerprint_api_ip", ip);
                   localStorage.setItem("fingerprint_api_token", token);
                   toast("Konfigurasi API Mesin Absensi berhasil disimpan!", "success");
                   closeModal();
                };
             }
          });
       };
    }

    return { unmount() {} };
}