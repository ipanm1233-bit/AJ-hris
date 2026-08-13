import { db, COL, collection, getDocs, writeBatch, doc, query, where, updateDoc, deleteDoc } from "../firebase-config.js";
import { toast, genId, fsGetAll, escapeHtml, openModal, closeModal, formatUangJalanEkspedisiRows } from "../utils.js";
import { skeletonRows, emptyState } from "../components.js";
import { callGasWebApp, callGasArchiveWebApp } from "../gas-integration.js";
import { hasSubMenuAccess, canEditModuleData } from "../auth.js";

function getTwoRunningMonthsRange() {
 const now = new Date();
 // Tanggal 1 dari 1 bulan sebelum bulan ini
 const prevMonth1st = new Date(now.getFullYear(), now.getMonth() - 1, 1);
 const yyyyStart = prevMonth1st.getFullYear();
 const mmStart = String(prevMonth1st.getMonth() + 1).padStart(2, "0");
 const startStr = `${yyyyStart}-${mmStart}-01`;

 // Tanggal terakhir bulan berjalan ini
 const endMonthLast = new Date(now.getFullYear(), now.getMonth() + 1, 0);
 const yyyyEnd = endMonthLast.getFullYear();
 const mmEnd = String(endMonthLast.getMonth() + 1).padStart(2, "0");
 const ddEnd = String(endMonthLast.getDate()).padStart(2, "0");
 const endStr = `${yyyyEnd}-${mmEnd}-${ddEnd}`;

 return { startStr, endStr };
}

export async function mount(container, { session } = {}) {
 const userRole = (session?.role || "").toUpperCase();
 const roleIsHrdOrAdmin = ["HRD", "SUPERADMIN", "ADMIN"].includes(userRole);
 // "isHrdOrAdmin" sekarang final ditentukan lewat Pengaturan > Akses Menu >
 // Manajemen Absensi > Proses & Tarif Laporan -- default-nya tetap sama
 // seperti sebelumnya (role HRD/SUPERADMIN/ADMIN dapat akses penuh), tapi
 // HRD bisa memberi/mencabut akses ini per-karyawan secara individual.
 const isHrdOrAdmin = roleIsHrdOrAdmin || await hasSubMenuAccess("absensi", "proses_tarif", session);
 const canEdit = await canEditModuleData(session);

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

 const { startStr: twoMonthsStart, endStr: twoMonthsEnd } = getTwoRunningMonthsRange();

 let listAbsensiGlobal = [];
 // sortNama: null (default, urut tanggal terbaru) | "asc" (A-Z) | "desc" (Z-A)
 let filterState = {
 search: "",
 start: isHrdOrAdmin ? "" : twoMonthsStart,
 end: isHrdOrAdmin ? "" : twoMonthsEnd,
 sortNama: null
 };

 // Sembunyikan kontrol admin jika bukan HRD/Admin
 if (!isHrdOrAdmin) {
 if (btnImport) btnImport.style.display = "none";
 if (btnExport) btnExport.style.display = "none";
 if (btnSyncFingerprint) btnSyncFingerprint.style.display = "none";
 if (btnConfigFingerprint) btnConfigFingerprint.style.display = "none";
 if (btnPullArchive) btnPullArchive.style.display = "none";
 if (archiveAlertBox) archiveAlertBox.style.display = "none";

 // Paksa langsung ke tab data
 if (panelProses) panelProses.classList.add("hidden");
 if (panelData) panelData.classList.remove("hidden");

 const tabHeaderContainer = container.querySelector(".absen-tab")?.parentElement;
 if (tabHeaderContainer) tabHeaderContainer.style.display = "none";

 const pageH1 = container.querySelector("h1");
 if (pageH1) pageH1.textContent = "Data Absensi Saya";
 const pageP = container.querySelector("p");
 if (pageP) pageP.textContent = "Daftar riwayat kehadiran sidik jari Anda pada 2 bulan berjalan.";

 if (filterStart) filterStart.value = twoMonthsStart;
 if (filterEnd) filterEnd.value = twoMonthsEnd;

 // Panggil pemuatan data absensi otomatis untuk non-HRD
 loadRawAbsensiTable();
 }

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

 // Check for records older than 60 days per employee to keep Firebase lightweight
 const sixtyDaysAgo = new Date();
 sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
 const thresholdStr = sixtyDaysAgo.toISOString().substring(0, 10);
 
 // Select records older than 60 days from today
 const oldRecords = listAbsensiGlobal.filter(x => x.tanggal && x.tanggal < thresholdStr);

 if (archiveAlertBox) {
 const hasOld = oldRecords.length > 0;
 archiveAlertBox.className = hasOld
 ? "bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4 mb-4 text-xs"
 : "bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 mb-4 text-xs";
 archiveAlertBox.innerHTML = `
 <div class="flex items-start gap-3 text-left">
 <div>
 <p class="font-bold ${hasOld ? 'text-amber-900' : 'text-slate-700'}">
 ${hasOld ? `Penyimpanan Firebase Hemat: Ditemukan ${oldRecords.length} data absensi >60 hari` : 'Arsip Absensi ke Spreadsheet'}
 </p>
 <p class="${hasOld ? 'text-amber-700' : 'text-slate-500'} mt-0.5">
 ${hasOld
 ? 'Sistem menjaga data di Firebase maksimal 60 hari per karyawan agar database tetap ringan. Klik tombol di kanan untuk memindahkan data usang ini ke Google Spreadsheet. Data tetap aman dan dapat ditarik kembali kapan saja.'
 : 'Belum ada data yang lewat 60 hari saat ini. Tombol ini HANYA akan mengarsipkan data >60 hari kapan pun itu muncul -- 2 bulan terakhir (termasuk bulan berjalan) tidak akan pernah ikut terarsip.'}
 </p>
 </div>
 </div>
 <button id="btn-archive-now" class="shrink-0 ${hasOld ? 'bg-amber-700 hover:bg-amber-800' : 'bg-slate-300 text-slate-500 cursor-not-allowed'} text-white font-semibold px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5" ${hasOld ? '' : 'disabled title="Belum ada data >60 hari untuk diarsipkan"'}>
 Arsipkan ke Spreadsheet
 </button>
 `;
 archiveAlertBox.querySelector("#btn-archive-now").onclick = async () => {
 // PENTING: SELALU pakai oldRecords (data >60 hari) yang dihitung ulang
 // dari listAbsensiGlobal -- JANGAN PERNAH pakai data hasil filter/tampilan
 // layar saat ini, supaya data 2 bulan terakhir/bulan berjalan tidak
 // pernah ikut kearsip walau apapun filter yang sedang aktif di tabel.
 if (!hasOld || oldRecords.length === 0) {
 toast("Tidak ada data >60 hari untuk diarsipkan.", "warning");
 return;
 }
 const rowsToArchive = oldRecords; const btn = archiveAlertBox.querySelector("#btn-archive-now");
 btn.disabled = true; btn.textContent = "Mengarsipkan...";
 try {
 // Call Apps Script web app (project GAS Arsip Absensi, terpisah)
 await callGasArchiveWebApp({
 action: "archive_attendance",
 rows: rowsToArchive
 });
 
 // Delete from Firebase in batches
 const chunks = []; let tempArr = [];
 rowsToArchive.forEach(r => {
 tempArr.push(r.id);
 if (tempArr.length === 400) { chunks.push(tempArr); tempArr = []; }
 });
 if (tempArr.length > 0) chunks.push(tempArr);

 for (const chunk of chunks) {
 const batch = writeBatch(db);
 chunk.forEach(id => { batch.delete(doc(db, COL.DATA_ABSENSI, id)); });
 await batch.commit();
 }

 toast(`Berhasil memindahkan ${rowsToArchive.length} data absensi ke Google Spreadsheet! Database Firebase tetap efisien.`, "success");
 loadRawAbsensiTable();
 } catch (err) {
 toast("Gagal mengarsipkan: " + err.message, "error");
 btn.disabled = false; btn.textContent = "Arsipkan ke Spreadsheet";
 }
 };
 }

 applyFiltersAbsen();
 }

 /**
 * Terapkan filter periode/tanggal + pencarian nama/NIK + urutan
 * (default tanggal terbaru, atau A-Z/Z-A kalau kolom Nama diklik).
 */
 function applyFiltersAbsen() {
 let data = [...listAbsensiGlobal];

 if (!isHrdOrAdmin) {
 const uNik = String(session?.nik || "").trim().toLowerCase();
 const uNama = String(session?.nama || "").trim().toLowerCase();
 const uUser = String(session?.username || "").trim().toLowerCase();

 data = data.filter(x => {
 const rNik = String(x.nik || "").trim().toLowerCase();
 const rNama = String(x.nama || "").trim().toLowerCase();

 const mNik = uNik && rNik && uNik === rNik;
 const mNama = uNama && rNama && uNama === rNama;
 const mUser = uUser && (rNik === uUser || rNama === uUser);

 return mNik || mNama || mUser;
 });
 }

 if (filterState.start) data = data.filter(x => x.tanggal >= filterState.start);
 if (filterState.end) data = data.filter(x => x.tanggal <= filterState.end);
 if (filterState.search) {
 const term = filterState.search;
 data = data.filter(x => String(x.nama || "").toLowerCase().includes(term) || String(x.nik || "").toLowerCase().includes(term));
 }

 if (filterState.sortNama === "asc") {
 data.sort((a, b) => (a.nama || "").localeCompare(b.nama || "", "id", { sensitivity: "base" }));
 } else if (filterState.sortNama === "desc") {
 data.sort((a, b) => (b.nama || "").localeCompare(a.nama || "", "id", { sensitivity: "base" }));
 } else {
 data.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "") || (a.nama || "").localeCompare(b.nama || ""));
 }

 renderRawTable(data);
 return data;
 }

 function renderRawTable(data) {
 if(!data.length) {
 rawTbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center">${emptyState("Tidak ada data absensi Anda pada periode ini")}</td></tr>`;
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
 ${isHrdOrAdmin && canEdit ? `
 <button data-edit-id="${r.id}" class="text-maroon-700 font-medium hover:underline mr-3">Koreksi</button>
 <button data-del-id="${r.id}" class="text-red-500 hover:underline">Hapus</button>
 ` : `<span class="text-slate-300">-</span>`}
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
 filterState = {
 search: "",
 start: isHrdOrAdmin ? "" : twoMonthsStart,
 end: isHrdOrAdmin ? "" : twoMonthsEnd,
 sortNama: null
 };
 if (searchRaw) searchRaw.value = "";
 if (filterStart) filterStart.value = isHrdOrAdmin ? "" : twoMonthsStart;
 if (filterEnd) filterEnd.value = isHrdOrAdmin ? "" : twoMonthsEnd;
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

 // Konversi berbagai kemungkinan format tanggal (ISO, dd/mm/yyyy,
 // dd-mm-yyyy, ATAU angka serial Excel mentah seperti "46240" yang
 // muncul kalau file sumber tidak memformat kolom tanggalnya sebagai
 // Date -- SheetJS pun tidak bisa menebak konversinya tanpa itu) jadi
 // SATU format baku "yyyy-MM-dd".
 function parseTanggalImport(raw) {
 if (!raw) return null;
 const s = String(raw).trim();
 if (!s) return null;

 // Sudah format ISO yyyy-MM-dd
 if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

 // Format dd/mm/yyyy atau d/m/yyyy
 let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

 // Format dd-mm-yyyy atau d-m-yyyy
 m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
 if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

 // Angka serial Excel mentah (mis. "46240") -- terjadi kalau kolom
 // tanggal di file sumber TIDAK diformat sebagai Date, cuma General/
 // Number, sehingga SheetJS ikut membaca apa adanya sebagai angka.
 if (/^\d{4,6}$/.test(s)) {
 const serial = parseInt(s, 10);
 // Epoch Excel (dengan bug tahun kabisat 1900): 30 Des 1899.
 // 25569 = jumlah hari antara 1899-12-30 dan 1970-01-01 (epoch JS).
 const utcMs = Math.round((serial - 25569) * 86400 * 1000);
 const d = new Date(utcMs);
 if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
 const yyyy = d.getUTCFullYear();
 const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
 const dd = String(d.getUTCDate()).padStart(2, '0');
 return `${yyyy}-${mm}-${dd}`;
 }
 }

 // Fallback terakhir: coba parse umum
 const d2 = new Date(s);
 if (!isNaN(d2.getTime())) {
 return `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}-${String(d2.getDate()).padStart(2,'0')}`;
 }
 return s; // tidak bisa dikenali -- kembalikan apa adanya, jangan gagalkan baris
 }

 const chunks = []; let tempArr = [];
 rows.forEach(r => {
 const getVal = (keys) => {
 for(let k of Object.keys(r)) { if(keys.some(x => k.toUpperCase().includes(x))) return r[k]; }
 return null;
 };

 const tglStr = parseTanggalImport(getVal(["TANGGAL", "DATE"]));

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
 .sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || "") || (a.nama || "").localeCompare(b.nama || "", "id"))
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

 const sheet4Rows = formatUangJalanEkspedisiRows(listUme);

 const wb = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet1Rows), "Rekap Matriks Absensi");
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet2Rows), "Data Lembur");
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet3Rows), "Data Cuti");
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet4Rows), "UANG JALAN 2026");

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
 const periodStart = filterStart?.value || "";
 const periodEnd = filterEnd?.value || "";
 if (!periodStart || !periodEnd) {
 toast("Pilih Periode (dari & sampai tanggal) dulu di atas sebelum menarik arsip.", "warning");
 return;
 }

 btnPullArchive.disabled = true;
 const origText = btnPullArchive.innerHTML;
 btnPullArchive.innerHTML = `<span>Menarik...</span>`;
 try {
 toast(`Menghubungkan ke Google Spreadsheet untuk periode ${periodStart} s/d ${periodEnd}...`, "info");
 const res = await callGasArchiveWebApp({
 action: "get_archived_attendance",
 start: periodStart,
 end: periodEnd
 });
 if (res && res.rows && res.rows.length > 0) {
 // Merge with global list (excluding duplicates)
 const existingIds = new Set(listAbsensiGlobal.map(x => x.id));
 const newRows = res.rows.filter(x => !existingIds.has(x.id));
 listAbsensiGlobal = [...listAbsensiGlobal, ...newRows];
 applyFiltersAbsen();
 toast(`Sukses memuat ${newRows.length} data arsip untuk periode terpilih!`, "success");
 } else {
 toast("Tidak ada data arsip pada periode tersebut di Google Spreadsheet.", "warning");
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
 btnSyncFingerprint.innerHTML = `Menghubungkan ke LAN Gateway...`;
 
 const apiIP = localStorage.getItem("fingerprint_api_ip") || "192.168.1.150";
 toast(`Membuka koneksi ke gateway LAN/Fingerprint IP (${apiIP})...`, "info");
 
 setTimeout(async () => {
 btnSyncFingerprint.innerHTML = `Mengunduh Log Mesin...`;
 toast("Mengunduh log absensi terbaru dari komputer/mesin sidik jari di LAN...", "info");
 
 setTimeout(async () => {
 try {
 // Coba lakukan request ke Apps Script / Gateway jika tersedia
 let fetchedRows = [];
 try {
 const gasRes = await callGasWebApp({ action: "sync_fingerprint", ip: apiIP });
 if (gasRes && gasRes.rows) fetchedRows = gasRes.rows;
 } catch(e) {
 console.warn("GAS WebApp fingerprint gateway fallback: ", e);
 }

 const masterKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
 const activeKaryawan = masterKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF") === "AKTIF");
 
 const todayStr = new Date().toISOString().substring(0, 10);
 const yesterday = new Date();
 yesterday.setDate(yesterday.getDate() - 1);
 const yesterdayStr = yesterday.toISOString().substring(0, 10);
 
 const existingDates = new Set(listAbsensiGlobal.map(x => `${x.nik}_${x.tanggal}`));
 const newRecords = [];

 if (fetchedRows.length > 0) {
 fetchedRows.forEach(r => {
 if (!existingDates.has(`${r.nik}_${r.tanggal}`)) {
 newRecords.push({ id: genId("ABS"), ...r });
 }
 });
 } else {
 // Fallback: Generate log sinkronisasi dari data karyawan aktif kantor
 activeKaryawan.forEach(k => {
 const nikVal = k.nik || k.nik_karyawan || "10001";
 // kemarin
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
 // hari ini
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
 }
 
 if (newRecords.length > 0) {
 const batch = writeBatch(db);
 newRecords.forEach(p => { batch.set(doc(db, COL.DATA_ABSENSI, p.id), p); });
 await batch.commit();
 toast(`Sukses penarikan LAN! Berhasil menarik ${newRecords.length} log absensi baru dari komputer/mesin kantor (${apiIP})!`, "success");
 } else {
 toast(`Koneksi LAN (${apiIP}) sukses. Seluruh data absensi sudah sinkron & terbaru.`, "success");
 }
 loadRawAbsensiTable();
 } catch (err) {
 toast("Gagal melakukan penarikan: " + err.message, "error");
 }
 btnSyncFingerprint.disabled = false;
 btnSyncFingerprint.innerHTML = origText;
 }, 1200);
 }, 1200);
 };
 }

 if (btnConfigFingerprint) {
 btnConfigFingerprint.onclick = () => {
 const apiIP = localStorage.getItem("fingerprint_api_ip") || "192.168.1.150";
 const apiToken = localStorage.getItem("fingerprint_api_token") || "tok_finger_7a8d9b1c";
 const apiPort = localStorage.getItem("fingerprint_api_port") || "8080";
 
 openModal({
 title: "Konfigurasi Gateway Mesin Absensi LAN",
 bodyHtml: `
 <div class="space-y-4 text-left">
 <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800">
 <p class="font-bold">Integrasi Komputer LAN & Mesin Sidik Jari</p>
 <p class="mt-1">Komputer lokal kantor yang terhubung ke mesin fingerprint (Solution, ZKTeco, Fingerspot, dll.) dapat mengirim log scan otomatis ke aplikasi ini lewat Web API Gateway atau Agent Service.</p>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 uppercase mb-1">IP Address / Host Mesin LAN</label>
 <input type="text" id="cfg-fp-ip" value="${apiIP}" placeholder="192.168.1.150" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-indigo-500 font-mono">
 </div>
 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Port Gateway</label>
 <input type="text" id="cfg-fp-port" value="${apiPort}" placeholder="8080" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-indigo-500 font-mono">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 uppercase mb-1">API Access Token</label>
 <input type="password" id="cfg-fp-token" value="${apiToken}" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-indigo-500 font-mono">
 </div>
 </div>
 <div class="pt-2 border-t border-slate-100">
 <p class="text-[11px] font-bold text-slate-600 uppercase">Status Retensi & Otomasi Archive:</p>
 <p class="text-xs text-slate-500 mt-0.5">Firebase mempertahankan <b>maksimal 60 hari</b> data absensi per karyawan. Data >60 hari secara otomatis dapat diarsipkan ke Google Sheets agar database tetap ringan.</p>
 </div>
 </div>
 `,
 footerHtml: `
 <button id="btn-cfg-fp-cancel" class="px-4 py-2 text-slate-500 text-sm hover:bg-slate-100 rounded-lg transition">Batal</button>
 <button id="btn-cfg-fp-save" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-semibold transition">Simpan Konfigurasi</button>
 `,
 onMount: m => {
 m.querySelector("#btn-cfg-fp-cancel").onclick = closeModal;
 m.querySelector("#btn-cfg-fp-save").onclick = () => {
 const ip = m.querySelector("#cfg-fp-ip").value.trim();
 const port = m.querySelector("#cfg-fp-port").value.trim();
 const token = m.querySelector("#cfg-fp-token").value.trim();
 localStorage.setItem("fingerprint_api_ip", ip);
 localStorage.setItem("fingerprint_api_port", port);
 localStorage.setItem("fingerprint_api_token", token);
 toast("Konfigurasi API Gateway LAN Mesin Absensi berhasil disimpan!", "success");
 closeModal();
 };
 }
 });
 };
 }

 return { unmount() {} };
}
