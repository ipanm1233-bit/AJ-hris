import { db, COL, collection, getDocs, writeBatch, doc, getDoc, query, where, updateDoc, deleteDoc } from "../firebase-config.js";
import { toast, genId, fsGetAll, escapeHtml, openModal, closeModal, formatUangJalanEkspedisiRows } from "../utils.js";
import { skeletonRows, emptyState } from "../components.js";
import { callGasArchiveWebApp } from "../gas-integration.js";
import { hasSubMenuAccess, canEditModuleData } from "../auth.js";
import { authFetch } from "../api-client.js";
import { resolveWorkSchedule } from "../work-schedule.mjs";

async function fingerprintApi(action, payload = {}) {
 const response = await authFetch('/api/sync-absen', {
 method: 'POST',
 body: JSON.stringify({ action, ...payload })
 });
 const result = await response.json().catch(() => ({}));
 if (!response.ok || result.success === false) throw new Error(result.error || `HTTP ${response.status}`);
 return result;
}

function fingerprintInstallCommand(pairingCode) {
 const installer = 'https://raw.githubusercontent.com/ipanm1233-bit/AJ-hris/main/fingerprint-bridge/install.ps1';
 const origin = window.location.origin;
 return `Invoke-WebRequest "${installer}" -OutFile "$env:TEMP\\ajhris-fingerprint-install.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\ajhris-fingerprint-install.ps1" -HrisUrl "${origin}" -PairingCode "${pairingCode}"`;
}

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
 const filterBranch = container.querySelector("#filter-absen-cabang");
 const filterDivision = container.querySelector("#filter-absen-divisi");
 const btnResetFilterAbsen = container.querySelector("#btn-reset-filter-absen");
 const btnExportRawAbsen = container.querySelector("#btn-export-raw-absen");
 const thSortNama = container.querySelector("#th-sort-nama");
 const iconSortNama = container.querySelector("#th-sort-nama-icon");

 const archiveAlertBox = container.querySelector("#archive-alert-box");
 const btnPullArchive = container.querySelector("#btn-pull-archive");
 const btnSyncFingerprint = container.querySelector("#btn-sync-fingerprint");
 const btnConfigFingerprint = container.querySelector("#btn-config-fingerprint");

 const { startStr: twoMonthsStart, endStr: twoMonthsEnd } = getTwoRunningMonthsRange();

 let listAbsensiGlobal = [];
 let employeeRowsGlobal = [];
 let scheduleRowsGlobal = [];
 // sortNama: null (default, urut tanggal terbaru) | "asc" (A-Z) | "desc" (Z-A)
 let filterState = {
 search: "",
 start: isHrdOrAdmin ? "" : twoMonthsStart,
 end: isHrdOrAdmin ? "" : twoMonthsEnd,
 branch: "",
 division: "",
 sortNama: null
 };

 function attendanceKey(value) {
 return String(value || "").trim().toUpperCase();
 }

 function buildUniqueEmployeeMap(rows, valueGetter) {
 const map = new Map();
 rows.forEach(employee => {
 const keys = valueGetter(employee).map(attendanceKey).filter(Boolean);
 keys.forEach(key => {
 if (!map.has(key)) map.set(key, employee);
 else if (map.get(key) !== employee) map.set(key, null);
 });
 });
 return map;
 }

 function enrichAttendanceRows(rows) {
 const employeeByNik = buildUniqueEmployeeMap(employeeRowsGlobal, employee => [employee.id, employee.nik, employee.nik_karyawan]);
 const employeeByFingerId = buildUniqueEmployeeMap(employeeRowsGlobal, employee => [employee.finger_id, employee.kode_finger, employee.no_finger, employee.id_finger, employee.pin]);
 const employeeByFingerName = buildUniqueEmployeeMap(employeeRowsGlobal, employee => [employee.finger_name]);

 return rows.map(row => {
 const machineId = row.fingerprint_no_id || row.no_id || row.fingerprint_user_id || "";
 const machineName = row.fingerprint_name || row.nama_finger || "";
 const employee = employeeByNik.get(attendanceKey(row.nik || row.nik_karyawan))
 || employeeByFingerId.get(attendanceKey(machineId))
 || employeeByFingerName.get(attendanceKey(machineName));
 const employeeView = employee || row;
 const shift = resolveWorkSchedule(employeeView, scheduleRowsGlobal, row.tanggal);
 const source = String(row.sumber || "").toUpperCase();
 const autoAssigned = typeof row.auto_assign === "boolean"
 ? row.auto_assign
 : source === "FINGERPRINT" && Boolean(employee);

 return {
 ...row,
 nik: row.nik || row.nik_karyawan || employee?.nik || employee?.nik_karyawan || "",
 nama: row.nama || employee?.nama_karyawan || employee?.nama || "",
 cabang: row.cabang || employee?.cabang || "",
 divisi: row.divisi || row.departemen || employee?.divisi || employee?.departemen || "",
 jabatan: row.jabatan || row.posisi || employee?.jabatan || employee?.posisi || "",
 emp_no: row.fingerprint_emp_no || row.emp_no || row.fingerprint_user_id || "",
 no_id: machineId,
 nama_finger: machineName || employee?.finger_name || "",
 auto_assign_label: autoAssigned ? "Ya" : "Tidak",
 jam_kerja: row.jam_kerja || shift.jamKerja,
 jadwal_masuk: shift.masuk || row.jadwal_masuk || "",
 jadwal_keluar: shift.pulang || row.jadwal_keluar || "",
 scan_masuk: row.scan_masuk || "",
 scan_keluar: row.scan_keluar || row.scan_pulang || ""
 };
 });
 }

 // Sembunyikan kontrol admin jika bukan HRD/Admin
 if (!isHrdOrAdmin) {
 if (btnImport) btnImport.style.display = "none";
 if (btnExport) btnExport.style.display = "none";
 if (btnExportRawAbsen) btnExportRawAbsen.style.display = "none";
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
 rawTbody.innerHTML = `<tr><td colspan="13" class="p-4">${skeletonRows(4)}</td></tr>`;
 const [attendanceRows, employeeRows, scheduleSnapshot] = await Promise.all([
 fsGetAll(COL.DATA_ABSENSI),
 fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
 getDoc(doc(db, COL.APP_SETTINGS, "main")).catch(() => null)
 ]);
 employeeRowsGlobal = employeeRows;
 scheduleRowsGlobal = scheduleSnapshot?.exists() ? (scheduleSnapshot.data()?.jadwal || []) : [];
 listAbsensiGlobal = enrichAttendanceRows(attendanceRows);
 populateAttendanceFilterOptions();

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

 function setAttendanceSelectOptions(select, emptyLabel, values, selectedValue = "") {
 if (!select) return;
 select.innerHTML = "";
 const emptyOption = document.createElement("option");
 emptyOption.value = "";
 emptyOption.textContent = emptyLabel;
 select.appendChild(emptyOption);
 values.forEach(value => {
 const option = document.createElement("option");
 option.value = value;
 option.textContent = value;
 select.appendChild(option);
 });
 select.value = values.includes(selectedValue) ? selectedValue : "";
 }

 function populateAttendanceFilterOptions() {
 const branches = [...new Set(listAbsensiGlobal.map(row => String(row.cabang || "").trim()).filter(Boolean))]
 .sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
 setAttendanceSelectOptions(filterBranch, "Semua Cabang", branches, filterState.branch);
 if (filterBranch && filterState.branch && !filterBranch.value) filterState.branch = "";

 const divisionSource = filterState.branch
 ? listAbsensiGlobal.filter(row => String(row.cabang || "").trim().toUpperCase() === filterState.branch.toUpperCase())
 : listAbsensiGlobal;
 const divisions = [...new Set(divisionSource.map(row => String(row.divisi || "").trim()).filter(Boolean))]
 .sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
 setAttendanceSelectOptions(filterDivision, "Semua Divisi", divisions, filterState.division);
 if (filterDivision && filterState.division && !filterDivision.value) filterState.division = "";
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
 if (filterState.branch) data = data.filter(x => String(x.cabang || "").trim().toUpperCase() === filterState.branch.toUpperCase());
 if (filterState.division) data = data.filter(x => String(x.divisi || "").trim().toUpperCase() === filterState.division.toUpperCase());
 if (filterState.search) {
 const term = filterState.search;
 data = data.filter(x => [x.nama, x.nik, x.nama_finger, x.emp_no, x.no_id]
 .some(value => String(value || "").toLowerCase().includes(term)));
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
 rawTbody.innerHTML = `<tr><td colspan="13" class="p-8 text-center">${emptyState("Tidak ada data absensi Anda pada periode ini")}</td></tr>`;
 return;
 }
 rawTbody.innerHTML = data.map(r => `
 <tr class="hover:bg-slate-50 transition text-xs">
 <td class="px-4 py-3 text-slate-500">${escapeHtml(r.emp_no || "-")}</td>
 <td class="px-4 py-3 text-slate-500">${escapeHtml(r.no_id || "-")}</td>
 <td class="px-4 py-3 text-slate-500">${escapeHtml(r.nik || "-")}</td>
 <td class="px-4 py-3 text-slate-600">${escapeHtml(r.nama_finger || "-")}</td>
 <td class="px-4 py-3 font-semibold text-slate-800">${escapeHtml(r.nama || "-")}</td>
 <td class="px-4 py-3 text-center">${escapeHtml(r.auto_assign_label)}</td>
 <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(r.tanggal || "-")}</td>
 <td class="px-4 py-3 text-center whitespace-nowrap">${escapeHtml(r.jam_kerja || "-")}</td>
 <td class="px-4 py-3 text-center font-mono">${escapeHtml(r.jadwal_masuk || "-")}</td>
 <td class="px-4 py-3 text-center font-mono">${escapeHtml(r.jadwal_keluar || "-")}</td>
 <td class="px-4 py-3 text-center font-mono ${r.scan_masuk ? 'text-slate-700':'text-red-400 font-bold'}">${escapeHtml(r.scan_masuk || "-")}</td>
 <td class="px-4 py-3 text-center font-mono ${r.scan_keluar ? 'text-slate-700':'text-red-400 font-bold'}">${escapeHtml(r.scan_keluar || "-")}</td>
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
 if (filterBranch) {
 filterBranch.onchange = (e) => {
 filterState.branch = e.target.value;
 filterState.division = "";
 populateAttendanceFilterOptions();
 applyFiltersAbsen();
 };
 }
 if (filterDivision) {
 filterDivision.onchange = (e) => { filterState.division = e.target.value; applyFiltersAbsen(); };
 }
 if (btnResetFilterAbsen) {
 btnResetFilterAbsen.onclick = () => {
 filterState = {
 search: "",
 start: isHrdOrAdmin ? "" : twoMonthsStart,
 end: isHrdOrAdmin ? "" : twoMonthsEnd,
 branch: "",
 division: "",
 sortNama: null
 };
 if (searchRaw) searchRaw.value = "";
 if (filterStart) filterStart.value = isHrdOrAdmin ? "" : twoMonthsStart;
 if (filterEnd) filterEnd.value = isHrdOrAdmin ? "" : twoMonthsEnd;
 populateAttendanceFilterOptions();
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

 if (btnExportRawAbsen) {
 btnExportRawAbsen.onclick = () => {
 if (!filterState.start || !filterState.end) {
 toast("Pilih tanggal mulai dan tanggal akhir terlebih dahulu.", "warning");
 return;
 }
 if (filterState.start > filterState.end) {
 toast("Tanggal mulai tidak boleh melewati tanggal akhir.", "warning");
 return;
 }
 if (typeof window.XLSX === "undefined") {
 toast("Komponen Excel belum tersedia. Muat ulang halaman lalu coba kembali.", "error");
 return;
 }

 const filteredRows = applyFiltersAbsen();
 if (!filteredRows.length) {
 toast("Tidak ada data absensi pada filter yang dipilih.", "warning");
 return;
 }

 const exportRows = [...filteredRows]
 .sort((a, b) => String(a.tanggal || "").localeCompare(String(b.tanggal || "")) || String(a.nama || "").localeCompare(String(b.nama || ""), "id"))
 .map(row => ({
 "Emp No.": row.emp_no || "",
 "No. ID": row.no_id || "",
 "NIK": row.nik || "",
 "Nama Finger": row.nama_finger || "",
 "Nama Karyawan": row.nama || "",
 "Auto-Assign": row.auto_assign_label || "Tidak",
 "Tanggal": row.tanggal || "",
 "Jam Kerja": row.jam_kerja || "",
 "Jam Masuk": row.jadwal_masuk || "",
 "Jam Pulang": row.jadwal_keluar || "",
 "Scan Masuk": row.scan_masuk || "",
 "Scan Pulang": row.scan_keluar || ""
 }));

 const worksheet = window.XLSX.utils.json_to_sheet(exportRows);
 worksheet["!cols"] = [
 { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 30 }, { wch: 14 },
 { wch: 13 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
 ];
 if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
 const workbook = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(workbook, worksheet, "Raw Finger");

 const safePart = value => String(value || "SEMUA").replace(/[^a-zA-Z0-9_-]/g, "_");
 const filename = `RAW_FINGER_${filterState.start}_SD_${filterState.end}_${safePart(filterState.branch)}_${safePart(filterState.division)}.xlsx`;
 window.XLSX.writeFile(workbook, filename);
 toast(`${exportRows.length} baris raw finger berhasil diunduh.`, "success");
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

 const [allKaryawan, snapCfg] = await Promise.all([
 fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
 getDoc(doc(db, COL.APP_SETTINGS, "main")).catch(() => null)
 ]);
 const cfgJadwal = (snapCfg && snapCfg.exists()) ? (snapCfg.data()?.jadwal || []) : [];

 const chunks = []; let tempArr = [];
 rows.forEach(r => {
 const getVal = (keys) => {
 for(let k of Object.keys(r)) { if(keys.some(x => k.toUpperCase().includes(x))) return r[k]; }
 return null;
 };

 const tglStr = parseTanggalImport(getVal(["TANGGAL", "DATE"]));
 const empNama = getVal(["NAMA", "NAME"]);
 const empNik = getVal(["NIK", "ID"]);

 const empObj = (allKaryawan || []).find(k => {
 const kNik = String(k.nik || k.nik_karyawan || "").trim();
 const kNama = String(k.nama_karyawan || k.nama || "").trim().toLowerCase();
 if (kNik && empNik && kNik === String(empNik).trim()) return true;
 if (kNama && empNama && kNama === String(empNama).trim().toLowerCase()) return true;
 return false;
 });
 const shift = resolveWorkSchedule(empObj, cfgJadwal, tglStr);

 const resolvedNik = String(empNik || empObj?.nik || empObj?.nik_karyawan || "").trim();
 const stableEmployeeKey = (resolvedNik || String(empNama || empObj?.nama_karyawan || empObj?.nama || ""))
 .normalize("NFKD")
 .replace(/[\u0300-\u036f]/g, "")
 .replace(/[^a-zA-Z0-9._-]/g, "_")
 .slice(0, 100);
 // ID deterministik mencegah file/periode yang sama membuat baris ganda.
 const uid = `ABS-IMP-${stableEmployeeKey}-${tglStr}`;
 const payload = {
 id: uid,
 nik: resolvedNik,
 nama: empNama || empObj?.nama_karyawan || empObj?.nama || "",
 tanggal: tglStr,
 cabang: getVal(["CABANG", "BRANCH"]) || empObj?.cabang || "",
 sumber: "IMPORT_EXCEL",
 jadwal_masuk: getVal(["JAM KERJA MASUK"]) || shift.masuk,
 jadwal_keluar: getVal(["JAM KERJA KELUAR"]) || shift.pulang,
 // Scan selalu berasal dari file; jangan isi jam dummy jika kolom kosong.
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
 const newRows = enrichAttendanceRows(res.rows.filter(x => !existingIds.has(x.id)));
 listAbsensiGlobal = [...listAbsensiGlobal, ...newRows];
 populateAttendanceFilterOptions();
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
 btnSyncFingerprint.innerHTML = `Memuat data terbaru...`;
 try {
 await loadRawAbsensiTable();
 toast("Data absensi terbaru sudah dimuat. Penarikan dari mesin dilakukan otomatis oleh agent komputer kantor.", "success");
 } catch (err) {
 toast("Gagal memuat data absensi: " + err.message, "error");
 }
 btnSyncFingerprint.disabled = false;
 btnSyncFingerprint.innerHTML = origText;
 };
 }

 if (btnConfigFingerprint) {
 btnConfigFingerprint.onclick = () => {
 openModal({
 title: "Konfigurasi Mesin Fingerprint",
 size: "lg",
 bodyHtml: `
 <div class="space-y-4 text-left min-w-0">
 <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800">
 <p class="font-bold">Connector per Cabang</p>
 <p class="mt-1">Tambahkan mesin, lalu jalankan satu perintah pemasangan pada komputer yang satu jaringan dengan mesin. Setelah itu sinkronisasi berjalan otomatis.</p>
 </div>

 <div id="fp-device-list" class="space-y-3">
   <div class="p-4 text-center text-xs text-slate-500">Memuat konfigurasi mesin...</div>
 </div>

 <form id="fp-add-form" class="border border-slate-200 rounded-xl p-3 space-y-3">
   <p class="text-xs font-bold text-slate-700">Tambah Mesin Baru</p>
   <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
     <label class="text-[11px] text-slate-600">Cabang
       <input id="fp-new-branch" value="MALANG" required class="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-xs uppercase">
     </label>
     <label class="text-[11px] text-slate-600">Nama mesin
       <input id="fp-new-name" value="Fingerprint Malang" required class="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-xs">
     </label>
     <label class="text-[11px] text-slate-600">Alamat IP lokal
       <input id="fp-new-ip" placeholder="Contoh: 192.168.1.201" required class="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono">
     </label>
     <div class="grid grid-cols-2 gap-2">
       <label class="text-[11px] text-slate-600">Port
         <input id="fp-new-port" type="number" value="4370" min="1" max="65535" required class="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono">
       </label>
       <label class="text-[11px] text-slate-600">Interval (menit)
         <input id="fp-new-interval" type="number" value="5" min="1" max="1440" required class="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-xs">
       </label>
     </div>
   </div>
   <button id="fp-add-button" type="submit" class="w-full bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold px-4 py-2.5 rounded-lg">Tambah & Buat Kode Pairing</button>
 </form>

 <div id="fp-pairing-result" class="hidden rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
   <p class="text-xs font-bold text-emerald-900">Kode pairing berlaku selama 30 menit</p>
   <p id="fp-pairing-code" class="text-xl font-mono font-bold tracking-wider text-emerald-800"></p>
   <p class="text-[11px] text-emerald-800">Pada komputer cabang, buka PowerShell lalu tempel perintah pemasangan berikut.</p>
   <textarea id="fp-install-command" readonly rows="4" class="w-full p-2 border border-emerald-200 rounded-lg bg-white text-[10px] font-mono"></textarea>
   <button id="fp-copy-command" type="button" class="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-2 rounded-lg">Salin Perintah Pemasangan</button>
 </div>
 </div>
 `,
 footerHtml: `
 <button id="btn-cfg-fp-close" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-semibold transition">Tutup</button>
 `,
 onMount: m => {
 m.querySelector("#btn-cfg-fp-close").onclick = closeModal;

 const listEl = m.querySelector('#fp-device-list');
 const pairingBox = m.querySelector('#fp-pairing-result');
 const showPairing = code => {
   pairingBox.classList.remove('hidden');
   m.querySelector('#fp-pairing-code').textContent = code;
   m.querySelector('#fp-install-command').value = fingerprintInstallCommand(code);
   pairingBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
 };

 const renderDevices = devices => {
   if (!devices.length) {
     listEl.innerHTML = `<div class="p-4 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500">Belum ada mesin yang dikonfigurasi melalui HRIS.</div>`;
     return;
   }
   listEl.innerHTML = devices.map(device => {
     const hasError = Boolean(device.online && device.lastError);
     const statusClass = hasError ? 'bg-red-100 text-red-700' : device.online ? 'bg-emerald-100 text-emerald-700' : device.paired ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
     const statusText = hasError ? 'Koneksi mesin bermasalah' : device.online ? 'Online' : device.paired ? 'Offline' : 'Belum dipasangkan';
     const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString('id-ID') : 'Belum pernah';
     return `
       <div class="fp-device-card border border-slate-200 rounded-xl p-3 space-y-2" data-device-id="${escapeHtml(device.id)}">
         <div class="flex items-center justify-between gap-2">
           <div><span class="font-bold text-xs text-slate-800">${escapeHtml(device.name)}</span> <span class="text-[10px] text-slate-400">• ${escapeHtml(device.branch)}</span></div>
           <span class="px-2 py-1 rounded-full text-[10px] font-bold ${statusClass}">${statusText}</span>
         </div>
         <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
           <input data-field="branch" value="${escapeHtml(device.branch)}" aria-label="Cabang" class="px-2 py-1.5 border rounded text-[11px] uppercase">
           <input data-field="name" value="${escapeHtml(device.name)}" aria-label="Nama mesin" class="px-2 py-1.5 border rounded text-[11px]">
           <input data-field="ip" value="${escapeHtml(device.ip)}" aria-label="Alamat IP" class="px-2 py-1.5 border rounded text-[11px] font-mono">
           <input data-field="port" type="number" value="${device.port}" aria-label="Port" class="px-2 py-1.5 border rounded text-[11px] font-mono">
           <input data-field="intervalMinutes" type="number" min="1" value="${device.intervalMinutes}" aria-label="Interval" class="px-2 py-1.5 border rounded text-[11px]">
         </div>
         <div class="flex items-center justify-between gap-2 flex-wrap">
           <div>
             <p class="text-[10px] text-slate-500">Terakhir terhubung: ${escapeHtml(lastSeen)}</p>
             ${device.lastError ? `<p class="text-[10px] text-red-600 mt-0.5">${escapeHtml(device.lastError)}</p>` : ''}
           </div>
           <div class="flex gap-2">
             <button type="button" data-action="save" class="text-[11px] font-semibold text-indigo-700 hover:underline">Simpan konfigurasi</button>
             <button type="button" data-action="pair" class="text-[11px] font-semibold text-emerald-700 hover:underline">${device.paired ? 'Pasangkan ulang' : 'Buat kode pairing'}</button>
           </div>
         </div>
       </div>`;
   }).join('');

   listEl.querySelectorAll('[data-action="save"]').forEach(button => {
     button.onclick = async () => {
       const card = button.closest('.fp-device-card');
       button.disabled = true;
       try {
         const value = field => card.querySelector(`[data-field="${field}"]`).value.trim();
         await fingerprintApi('admin_update_device', {
           deviceId: card.dataset.deviceId,
           branch: value('branch'), name: value('name'), ip: value('ip'),
           port: Number(value('port')), intervalMinutes: Number(value('intervalMinutes')), enabled: true
         });
         toast('Konfigurasi mesin berhasil disimpan.', 'success');
       } catch (error) { toast(error.message, 'error'); }
       button.disabled = false;
     };
   });
   listEl.querySelectorAll('[data-action="pair"]').forEach(button => {
     button.onclick = async () => {
       if (button.textContent.includes('ulang') && !confirm('Pairing ulang akan memutus connector lama. Lanjutkan?')) return;
       button.disabled = true;
       try {
         const result = await fingerprintApi('admin_pairing_code', { deviceId: button.closest('.fp-device-card').dataset.deviceId });
         showPairing(result.pairingCode);
       } catch (error) { toast(error.message, 'error'); }
       button.disabled = false;
     };
   });
 };

 const loadDevices = async () => {
   try {
     const result = await fingerprintApi('admin_list_devices');
     renderDevices(result.devices || []);
   } catch (error) {
     listEl.innerHTML = `<div class="p-3 bg-red-50 text-red-700 rounded-lg text-xs">${escapeHtml(error.message)}</div>`;
   }
 };

 m.querySelector('#fp-add-form').onsubmit = async event => {
   event.preventDefault();
   const button = m.querySelector('#fp-add-button');
   button.disabled = true;
   button.textContent = 'Menyimpan...';
   try {
     const result = await fingerprintApi('admin_create_device', {
       branch: m.querySelector('#fp-new-branch').value.trim(),
       name: m.querySelector('#fp-new-name').value.trim(),
       ip: m.querySelector('#fp-new-ip').value.trim(),
       port: Number(m.querySelector('#fp-new-port').value),
       intervalMinutes: Number(m.querySelector('#fp-new-interval').value)
     });
     showPairing(result.pairingCode);
     toast('Mesin ditambahkan. Lanjutkan pemasangan pada komputer cabang.', 'success');
     await loadDevices();
   } catch (error) { toast(error.message, 'error'); }
   button.disabled = false;
   button.textContent = 'Tambah & Buat Kode Pairing';
 };

 m.querySelector('#fp-copy-command').onclick = async () => {
   const command = m.querySelector('#fp-install-command').value;
   try {
     await navigator.clipboard.writeText(command);
     toast('Perintah pemasangan berhasil disalin.', 'success');
   } catch (_) {
     m.querySelector('#fp-install-command').select();
     document.execCommand('copy');
     toast('Perintah pemasangan berhasil disalin.', 'success');
   }
 };

 loadDevices();
 }
 });
 };
 }

 return { unmount() {} };
}
