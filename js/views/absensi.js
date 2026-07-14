import { db, COL, collection, getDocs, writeBatch, doc, query, where, updateDoc, deleteDoc } from "../firebase-config.js";
import { toast, genId, fsGetAll, escapeHtml, openModal, closeModal } from "../utils.js";
import { skeletonRows, emptyState } from "../components.js";

export async function mount(container) {
   const btnImport = container.querySelector("#btn-import-absen");
   const inputUpload = container.querySelector("#absen-upload");
   const btnExport = container.querySelector("#btn-export-absen");
   
   const panelProses = container.querySelector("#absen-panel-proses");
   const panelData = container.querySelector("#absen-panel-data");
   const rawTbody = container.querySelector("#absen-raw-tbody");
   const searchRaw = container.querySelector("#search-absen-raw");

   let listAbsensiGlobal = [];

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
      listAbsensiGlobal.sort((a,b) => b.tanggal.localeCompare(a.tanggal) || a.nama.localeCompare(b.nama));
      renderRawTable(listAbsensiGlobal);
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
         const term = e.target.value.toLowerCase().trim();
         const filtered = listAbsensiGlobal.filter(x => x.nama.toLowerCase().includes(term) || (x.nik || "").includes(term));
         renderRawTable(filtered);
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
           const listCuti = snapCuti.docs.map(d => d.data()).filter(c => c.tanggal && c.tanggal.substring(0,10) >= start && c.tanggal.substring(0,10) <= end);
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

           allKaryawan.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF").forEach(k => {
               const rowObj = { "NO": noIndex++, "NAMA KARYAWAN": k.nama_karyawan };
               
               let totalJam = 0; let hariMasuk = 0;
               let c_tahunan = 0; let c_setengah = 0; let c_khusus = 0; let c_sakit = 0;
               let c_sakit_tanpa = 0; let c_bersama = 0; let c_potong_gaji = 0; let c_sisa = 0;
               let c_khusus_setengah = 0; let alpa_count = 0;

               datesArr.forEach(dStr => {
                   const tDate = new Date(dStr);
                   const isSunday = tDate.getDay() === 0;

                   const matchAbsen = listAbsen.find(x => x.nama === k.nama_karyawan && x.tanggal === dStr);
                   const matchCuti = listCuti.find(x => x.nama_karyawan === k.nama_karyawan && x.tanggal.substring(0,10) === dStr);

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

                   // Membuat header tanggal berurutan horizontal (Matrix)
                   rowObj[`${tDate.getDate().toString()}`] = cellCode;
               });

               rowObj["Total Jam"] = totalJam;
               rowObj["HARI MASUK"] = hariMasuk;
               rowObj["C"] = c_tahunan;
               rowObj["CS"] = c_sisa;
               rowObj["C-"] = c_potong_gaji;
               rowObj["A"] = alpa_count;
               rowObj["S"] = c_sakit;
               rowObj["S-"] = c_sakit_tanpa;
               rowObj["C+"] = c_khusus;
               rowObj["C 1/2"] = c_setengah;
               rowObj["C+ 1/2"] = c_khusus_setengah;
               rowObj["L"] = datesArr.filter(d => new Date(d).getDay() === 0).length;

               sheet1Rows.push(rowObj);
           });

           const sheet2Rows = listAbsen.filter(x => x.scan_masuk && x.scan_keluar).map(x => ({
               "Nama Karyawan": x.nama, "Tanggal": x.tanggal, "Jam Masuk": x.scan_masuk, "Jam Keluar": x.scan_keluar, "Keterangan": "Lembur Terdata"
           }));

           const sheet3Rows = listCuti.map(c => ({ "Nama Karyawan": c.nama_karyawan, "Tanggal": c.tanggal.substring(0,10), "Jenis Cuti": c.type_cuti, "Keterangan": c.keterangan_cuti || "-" }));
           const sheet4Rows = listUme.map(u => ({ "Tanggal": u.tanggal, "Driver": u.driver || "-", "Helper": u.helper || "-", "Tujuan": u.tujuan || "-", "Uang Makan": u.uang_makan || 0 }));

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

   return { unmount() {} };
}
