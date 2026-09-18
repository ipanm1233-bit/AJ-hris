import { db, COL, collection, getDocs, writeBatch, doc, getDoc, query, where, setDoc, deleteDoc } from "../firebase-config.js";
import { toast, genId, fsGetAll, escapeHtml, openModal, closeModal, formatUangJalanEkspedisiRows } from "../utils.js";
import { skeletonRows, emptyState } from "../components.js";
import { callGasArchiveWebApp } from "../gas-integration.js";
import { hasSubMenuAccess, hasPermission, canEditModuleData } from "../auth.js";
import { authFetch } from "../api-client.js";
import { resolveWorkSchedule } from "../work-schedule.mjs";
import { buildRawAttendanceExport } from "../attendance-export.mjs";
import { attendanceImportDate, attendanceImportValues, attendanceImportScan } from "../attendance-import.mjs";
import { buildAttendanceStatusRows } from "../attendance-status.mjs";
import { attendanceDeductionSource, calculateAttendancePenalty } from "../attendance-penalty.mjs";
import { buildAttendanceAnalytics } from "../attendance-analytics.mjs";
import { buildMissingAttendanceToday } from "../attendance-missing.mjs";
import { attendanceSelectionKey as attendanceRowKey, selectedDeletableAttendanceRows } from "../attendance-bulk.mjs";

function normalizeToken(value) {
 return String(value || "").trim().toUpperCase();
}

async function fingerprintApi(action, payload = {}) {
 const response = await authFetch('/api/sync-absen', {
 method: 'POST',
 body: JSON.stringify({ action, ...payload })
 });
 const result = await response.json().catch(() => ({}));
 if (!response.ok || result.success === false) throw new Error(result.error || `HTTP ${response.status}`);
 return result;
}

async function attendanceAccessApi(action, payload = null) {
 const response = await authFetch('/api/sync-absen', {
  method: "POST",
  body: JSON.stringify({ action, ...(payload || {}) })
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

function fingerprintUpdateCommand() {
 const updater = 'https://raw.githubusercontent.com/ipanm1233-bit/AJ-hris/main/fingerprint-bridge/update.ps1';
 return `Invoke-WebRequest "${updater}" -OutFile "$env:TEMP\\ajhris-fingerprint-update.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\ajhris-fingerprint-update.ps1"`;
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
 const canViewDashboard = roleIsHrdOrAdmin || await hasSubMenuAccess("absensi", "dashboard", session);
 // "isHrdOrAdmin" sekarang final ditentukan lewat Pengaturan > Akses Menu >
 // Manajemen Absensi > Proses & Tarif Laporan -- default-nya tetap sama
 // seperti sebelumnya (role HRD/SUPERADMIN/ADMIN dapat akses penuh), tapi
 // HRD bisa memberi/mencabut akses ini per-karyawan secara individual.
 const isHrdOrAdmin = roleIsHrdOrAdmin || await hasSubMenuAccess("absensi", "proses_tarif", session);
 const canViewAll = roleIsHrdOrAdmin || await hasPermission("absensi.data.view_all", session);
 const canCorrectBranch = !roleIsHrdOrAdmin && await hasPermission("absensi.data.edit", session);
 const canEdit = roleIsHrdOrAdmin ? await canEditModuleData(session) : canCorrectBranch;
 const scopedBranch = !roleIsHrdOrAdmin && canViewAll ? String(session?.cabang || "").trim() : "";
 const isPicBranch = Boolean(scopedBranch);

 const btnImport = container.querySelector("#btn-import-absen");
 const inputUpload = container.querySelector("#absen-upload");
 const btnExport = container.querySelector("#btn-export-absen");
 
 const panelProses = container.querySelector("#absen-panel-proses");
 const panelDashboard = container.querySelector("#absen-panel-dashboard");
 const panelData = container.querySelector("#absen-panel-data");
 const rawTbody = container.querySelector("#absen-raw-tbody");
 const searchRaw = container.querySelector("#search-absen-raw");
 const filterStart = container.querySelector("#filter-absen-start");
 const filterEnd = container.querySelector("#filter-absen-end");
 const filterBranch = container.querySelector("#filter-absen-cabang");
 const filterDivision = container.querySelector("#filter-absen-divisi");
 const filterEmployee = container.querySelector("#filter-absen-karyawan");
 const filterCompleteness = container.querySelector("#filter-absen-kelengkapan");
 const btnResetFilterAbsen = container.querySelector("#btn-reset-filter-absen");
 const btnExportRawAbsen = container.querySelector("#btn-export-raw-absen");
 const thSortNama = container.querySelector("#th-sort-nama");
 const iconSortNama = container.querySelector("#th-sort-nama-icon");

 const archiveAlertBox = container.querySelector("#archive-alert-box");
 const btnPullArchive = container.querySelector("#btn-pull-archive");
 const btnSyncFingerprint = container.querySelector("#btn-sync-fingerprint");
 const btnConfigFingerprint = container.querySelector("#btn-config-fingerprint");
 const bulkToolbar = container.querySelector("#absen-bulk-toolbar");
 const selectedCountEl = container.querySelector("#absen-selected-count");
 const btnBulkEdit = container.querySelector("#btn-bulk-edit-absen");
 const btnBulkDelete = container.querySelector("#btn-bulk-delete-absen");
 const btnClearSelected = container.querySelector("#btn-clear-selected-absen");
 const selectAllVisible = container.querySelector("#absen-select-all-visible");
 const dashboardSection = container.querySelector("#attendance-dashboard");
 const dashboardMonth = container.querySelector("#attendance-dashboard-month");
 const dashboardBranch = container.querySelector("#attendance-dashboard-branch");
 const dashboardDivision = container.querySelector("#attendance-dashboard-division");
 const dashboardLoadArchive = container.querySelector("#attendance-dashboard-load-archive");
 const dashboardSource = container.querySelector("#attendance-dashboard-source");
 const dashboardKpis = container.querySelector("#attendance-dashboard-kpis");
 const dashboardTrend = container.querySelector("#attendance-dashboard-trend");
 const dashboardTopLate = container.querySelector("#attendance-dashboard-top-late");
 const dashboardDivisions = container.querySelector("#attendance-dashboard-divisions");
 const dashboardMissingToday = container.querySelector("#attendance-dashboard-missing-today");
 const dashboardMissingMeta = container.querySelector("#attendance-dashboard-missing-meta");

 const { startStr: twoMonthsStart, endStr: twoMonthsEnd } = getTwoRunningMonthsRange();

 let listAbsensiGlobal = [];
 let employeeRowsGlobal = [];
 let scheduleRowsGlobal = [];
 let absenceRowsGlobal = [];
 let archiveAttendanceRowsGlobal = [];
 let currentFilteredRows = [];
 const archiveMonthsLoaded = new Set();
 const jakartaDateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(part => [part.type, part.value]));
 let dashboardState = { month: `${jakartaDateParts.year}-${jakartaDateParts.month}`, branch: "", division: "" };
 const selectedAttendanceKeys = new Set();
 // sortNama: null (default, urut tanggal terbaru) | "asc" (A-Z) | "desc" (Z-A)
 let filterState = {
 search: "",
 start: isHrdOrAdmin ? "" : twoMonthsStart,
 end: isHrdOrAdmin ? "" : twoMonthsEnd,
 branch: scopedBranch,
 division: "",
 employee: "",
 completeness: "",
 sortNama: null
 };

 function dashboardMonthRange(month) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${match[1]}-${match[2]}-01`, end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}` };
 }

 function setDashboardOptions(select, emptyLabel, values, selected) {
  if (!select) return;
  select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = values.includes(selected) ? selected : "";
 }

 function populateDashboardFilters() {
  if (!canViewDashboard || !dashboardSection) return;
  const monthEmployees = employeeRowsGlobal;
  const branches = [...new Set(monthEmployees.map(row => String(row.cabang || "").trim()).filter(Boolean))]
   .sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
  setDashboardOptions(dashboardBranch, "Semua Cabang", branches, dashboardState.branch);
  if (dashboardState.branch && !dashboardBranch.value) dashboardState.branch = "";
  const divisionEmployees = dashboardState.branch
   ? monthEmployees.filter(row => normalizeToken(row.cabang) === normalizeToken(dashboardState.branch))
   : monthEmployees;
  const divisions = [...new Set(divisionEmployees.map(row => String(row.divisi || row.departemen || "").trim()).filter(Boolean))]
   .sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
  setDashboardOptions(dashboardDivision, "Semua Divisi", divisions, dashboardState.division);
  if (dashboardState.division && !dashboardDivision.value) dashboardState.division = "";
 }

 function renderAttendanceDashboard() {
  if (!canViewDashboard || !dashboardSection) return;
  const analytics = buildAttendanceAnalytics(listAbsensiGlobal, dashboardState);
  const { totals } = analytics;
  const formatNumber = value => Number(value || 0).toLocaleString("id-ID");
  const kpis = [
   ["Karyawan Tercatat", totals.employees, "text-slate-800", "bg-slate-50 border-slate-200"],
   ["Hari Scan Lengkap", totals.complete_days, "text-emerald-800", "bg-emerald-50 border-emerald-200"],
   ["Tepat Waktu", totals.on_time_days, "text-sky-800", "bg-sky-50 border-sky-200"],
   ["Keterlambatan", totals.late_days, "text-rose-800", "bg-rose-50 border-rose-200"],
   ["Total Denda", `Rp ${formatNumber(totals.total_penalty)}`, "text-amber-900", "bg-amber-50 border-amber-200"],
   ["C1/2 Terlambat", totals.half_day_penalty_days, "text-violet-800", "bg-violet-50 border-violet-200"],
   ["Dibebaskan HRD", totals.waived_days, "text-teal-800", "bg-teal-50 border-teal-200"],
   ["Perlu Koreksi", totals.review_days, "text-orange-800", "bg-orange-50 border-orange-200"]
  ];
  dashboardKpis.innerHTML = kpis.map(([label, value, textClass, boxClass]) => `<div class="rounded-xl border p-3 ${boxClass}"><p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">${label}</p><p class="mt-1 text-lg font-black ${textClass}">${value}</p></div>`).join("");

  const maxDaily = Math.max(1, ...analytics.daily.flatMap(day => [day.complete, day.late, day.absence]));
  dashboardTrend.innerHTML = analytics.daily.length ? `<div class="min-w-max h-44 flex items-end gap-2 px-1 pt-4">${analytics.daily.map(day => {
   const height = value => Math.max(value ? 4 : 0, Math.round((value / maxDaily) * 112));
   return `<div class="w-8 shrink-0 text-center" title="${escapeHtml(day.date)} — Lengkap ${day.complete}, Terlambat ${day.late}, Cuti/Izin ${day.absence}"><div class="h-28 flex items-end justify-center gap-0.5"><span class="w-1.5 rounded-t bg-emerald-500" style="height:${height(day.complete)}px"></span><span class="w-1.5 rounded-t bg-rose-500" style="height:${height(day.late)}px"></span><span class="w-1.5 rounded-t bg-violet-500" style="height:${height(day.absence)}px"></span></div><p class="text-[9px] text-slate-500 mt-1">${escapeHtml(day.date.slice(8))}</p></div>`;
  }).join("")}</div>` : `<div class="h-40 flex items-center justify-center text-xs text-slate-400">Belum ada data pada filter ini.</div>`;

  dashboardTopLate.innerHTML = analytics.top_late.length ? `<table class="w-full text-xs"><thead class="text-[10px] uppercase text-slate-400 border-b"><tr><th class="pb-2 text-left">Karyawan</th><th class="pb-2 text-right">Kali</th><th class="pb-2 text-right">Menit</th><th class="pb-2 text-right">Denda</th></tr></thead><tbody class="divide-y divide-slate-100">${analytics.top_late.map(row => `<tr><td class="py-2 pr-2"><strong class="text-slate-700">${escapeHtml(row.name)}</strong><p class="text-[9px] text-slate-400">${escapeHtml(row.branch)} • ${escapeHtml(row.division)}</p></td><td class="py-2 text-right font-bold">${row.occurrences}</td><td class="py-2 text-right text-rose-700 font-bold">${row.minutes}</td><td class="py-2 text-right font-mono">Rp ${formatNumber(row.penalty)}</td></tr>`).join("")}</tbody></table>` : `<div class="h-40 flex items-center justify-center text-xs text-slate-400">Tidak ada keterlambatan.</div>`;

  dashboardDivisions.innerHTML = analytics.divisions.length ? `<table class="w-full text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="p-2 text-left">Divisi</th><th class="p-2 text-right">Hari Tercatat</th><th class="p-2 text-right">Scan Lengkap</th><th class="p-2 text-right">Terlambat</th><th class="p-2 text-right">Cuti/Izin</th><th class="p-2 text-right">Perlu Koreksi</th><th class="p-2 text-right">Denda</th><th class="p-2 text-left min-w-36">Kelengkapan</th></tr></thead><tbody class="divide-y divide-slate-100">${analytics.divisions.map(row => `<tr><td class="p-2 font-bold text-slate-700">${escapeHtml(row.division)}</td><td class="p-2 text-right">${row.employee_days}</td><td class="p-2 text-right text-emerald-700 font-bold">${row.complete}</td><td class="p-2 text-right text-rose-700 font-bold">${row.late}</td><td class="p-2 text-right">${row.absence}</td><td class="p-2 text-right text-orange-700">${row.review}</td><td class="p-2 text-right font-mono">Rp ${formatNumber(row.penalty)}</td><td class="p-2"><div class="flex items-center gap-2"><div class="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${Math.min(100, row.completeness_rate)}%"></div></div><span class="text-[10px] font-bold text-slate-600">${row.completeness_rate}%</span></div></td></tr>`).join("")}</tbody></table>` : `<p class="py-8 text-center text-xs text-slate-400">Belum ada data divisi pada filter ini.</p>`;

  const jakartaNowParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = `${jakartaNowParts.year}-${jakartaNowParts.month}-${jakartaNowParts.day}`;
  const currentTime = `${jakartaNowParts.hour}:${jakartaNowParts.minute}`;
  const missingToday = buildMissingAttendanceToday({
   employees: employeeRowsGlobal,
   attendanceRows: listAbsensiGlobal,
   schedules: scheduleRowsGlobal,
   date: today,
   currentTime,
   branch: dashboardState.branch,
   division: dashboardState.division
  });
  if (dashboardMissingMeta) dashboardMissingMeta.innerHTML = `<span class="inline-flex items-center rounded-full px-2.5 py-1 font-bold ${missingToday.length ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">${missingToday.length} karyawan</span><span>${escapeHtml(new Date(`${today}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} • pembaruan ${escapeHtml(currentTime)} WIB</span>`;
  if (dashboardMissingToday) dashboardMissingToday.innerHTML = missingToday.length
   ? `<table class="w-full text-xs"><thead class="bg-rose-50 text-[10px] uppercase text-rose-700"><tr><th class="p-2.5 text-left">Karyawan</th><th class="p-2.5 text-left">Cabang</th><th class="p-2.5 text-left">Divisi / Jabatan</th><th class="p-2.5 text-center">Jadwal Masuk</th><th class="p-2.5 text-left">Status</th></tr></thead><tbody class="divide-y divide-slate-100">${missingToday.map(row => `<tr class="hover:bg-rose-50/50"><td class="p-2.5"><strong class="text-slate-800">${escapeHtml(row.name)}</strong><p class="text-[9px] text-slate-400">NIK ${escapeHtml(row.nik || "-")}</p></td><td class="p-2.5 font-semibold text-slate-600">${escapeHtml(row.branch)}</td><td class="p-2.5"><span class="text-slate-700">${escapeHtml(row.division)}</span><p class="text-[9px] text-slate-400">${escapeHtml(row.position)}</p></td><td class="p-2.5 text-center font-mono font-bold text-slate-700">${escapeHtml(row.scheduled_start)}</td><td class="p-2.5"><span class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${row.needs_review ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}">${escapeHtml(row.status)}</span></td></tr>`).join("")}</tbody></table>`
   : `<div class="py-10 text-center"><p class="text-sm font-bold text-emerald-700">Semua karyawan terjadwal sudah melakukan absensi</p><p class="text-xs text-slate-400 mt-1">Karyawan cuti/izin penuh dan yang belum memasuki jam kerja tidak dihitung.</p></div>`;

  const archiveLoaded = archiveMonthsLoaded.has(dashboardState.month);
  dashboardSource.innerHTML = `<div class="flex flex-wrap items-center gap-2"><span class="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">${formatNumber(totals.employee_days)} hari-karyawan</span><span class="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">Kelengkapan scan ${totals.completeness_rate}%</span><span class="px-2 py-1 rounded-full ${archiveLoaded ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'} font-semibold">${archiveLoaded ? `${formatNumber(totals.spreadsheet_rows)} data arsip Spreadsheet tergabung` : 'Arsip Spreadsheet belum dimuat'}</span></div>`;
 }

 function mergeArchivedAttendanceRows(rows = []) {
  const normalized = rows.map(row => ({
   ...row,
   scan_masuk: row.scan_masuk === "-" ? "" : (row.scan_masuk || ""),
   scan_keluar: row.scan_keluar === "-" ? "" : (row.scan_keluar || row.scan_pulang || ""),
   _archive_source: true
  }));
  const processed = buildAttendanceStatusRows({
   attendanceRows: enrichAttendanceRows(normalized),
   employees: employeeRowsGlobal,
   absenceRecords: absenceRowsGlobal,
   schedules: scheduleRowsGlobal
  }).filter(row => !row.is_status_only);
  const existing = new Set([...listAbsensiGlobal, ...archiveAttendanceRowsGlobal].map(row => String(row.id || "")).filter(Boolean));
  const additions = processed.filter(row => !row.id || !existing.has(String(row.id)));
  archiveAttendanceRowsGlobal.push(...additions);
  listAbsensiGlobal.push(...additions);
  return additions.length;
 }

 async function loadAttendanceArchiveForDashboard({ force = false } = {}) {
  if (!canViewDashboard || !dashboardMonth) return;
  const range = dashboardMonthRange(dashboardState.month);
  if (!range) return;
  if (!force && archiveMonthsLoaded.has(dashboardState.month)) return renderAttendanceDashboard();
  const originalLabel = dashboardLoadArchive?.textContent || "Muat Spreadsheet";
  if (dashboardLoadArchive) { dashboardLoadArchive.disabled = true; dashboardLoadArchive.textContent = "Memuat..."; }
  if (dashboardSource) dashboardSource.innerHTML = `<span class="text-blue-700 font-semibold">Mengambil arsip Spreadsheet ${range.start} s/d ${range.end}...</span>`;
  try {
   const result = await callGasArchiveWebApp({ action: "get_archived_attendance", start: range.start, end: range.end });
   const added = mergeArchivedAttendanceRows(result.rows || []);
   archiveMonthsLoaded.add(dashboardState.month);
   populateAttendanceFilterOptions();
   applyFiltersAbsen();
   renderAttendanceDashboard();
   if (force) toast(`${added} data arsip baru digabungkan ke dashboard.`, "success");
  } catch (error) {
   console.error("Gagal memuat arsip dashboard:", error);
   renderAttendanceDashboard();
   if (dashboardSource) dashboardSource.insertAdjacentHTML("beforeend", `<p class="mt-2 text-rose-700">Arsip Spreadsheet belum dapat dimuat: ${escapeHtml(error.message || "Koneksi gagal")}</p>`);
   if (force) toast("Gagal memuat arsip Spreadsheet: " + error.message, "error");
  } finally {
   if (dashboardLoadArchive) { dashboardLoadArchive.disabled = false; dashboardLoadArchive.textContent = originalLabel; }
  }
 }

 function updateBulkToolbar() {
  const count = selectedAttendanceKeys.size;
  if (selectedCountEl) selectedCountEl.textContent = String(count);
  if (bulkToolbar) {
   bulkToolbar.classList.toggle("hidden", !canEdit || count === 0);
   bulkToolbar.classList.toggle("flex", canEdit && count > 0);
  }
  if (selectAllVisible) {
   const selectable = currentFilteredRows.filter(row => canEdit && (roleIsHrdOrAdmin || isPicBranch));
   const selectedVisible = selectable.filter(row => selectedAttendanceKeys.has(attendanceRowKey(row))).length;
   selectAllVisible.checked = selectable.length > 0 && selectedVisible === selectable.length;
   selectAllVisible.indeterminate = selectedVisible > 0 && selectedVisible < selectable.length;
   selectAllVisible.disabled = selectable.length === 0;
  }
  if (btnBulkDelete) {
   const deletableCount = selectedDeletableAttendanceRows(listAbsensiGlobal, selectedAttendanceKeys).length;
   btnBulkDelete.classList.toggle("hidden", !roleIsHrdOrAdmin);
   btnBulkDelete.disabled = deletableCount === 0;
   btnBulkDelete.textContent = deletableCount ? `Hapus ${deletableCount} Baris` : "Hapus Baris Terpilih";
  }
 }

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
 if (!roleIsHrdOrAdmin) {
 if (!canViewDashboard && dashboardSection) dashboardSection.style.display = "none";
 if (btnImport) btnImport.style.display = "none";
 if (btnExport) btnExport.style.display = "none";
 if (btnExportRawAbsen && !isPicBranch) btnExportRawAbsen.style.display = "none";
 if (btnSyncFingerprint) btnSyncFingerprint.style.display = "none";
 if (btnConfigFingerprint) btnConfigFingerprint.style.display = "none";
 if (btnPullArchive) btnPullArchive.style.display = "none";
 if (archiveAlertBox) archiveAlertBox.style.display = "none";

 // Pengguna tanpa akses dashboard langsung ke data; penerima akses
 // dashboard tetap mendapatkan pemisahan sub-menu yang sama seperti HRD.
 if (panelProses) panelProses.classList.add("hidden");
 if (panelDashboard) panelDashboard.classList.toggle("hidden", !canViewDashboard);
 if (panelData) panelData.classList.toggle("hidden", canViewDashboard);

 const tabHeaderContainer = container.querySelector(".absen-tab")?.parentElement;
 if (tabHeaderContainer && !canViewDashboard) tabHeaderContainer.style.display = "none";

 const pageH1 = container.querySelector("h1");
 if (pageH1) pageH1.textContent = isPicBranch ? `Data Absensi Cabang ${scopedBranch}` : "Data Absensi Saya";
 const pageP = container.querySelector("p");
 if (pageP) pageP.textContent = isPicBranch ? `Data kehadiran ${scopedBranch} yang diizinkan HRD.` : "Daftar riwayat kehadiran sidik jari Anda pada 2 bulan berjalan.";

 if (filterStart) filterStart.value = twoMonthsStart;
 if (filterEnd) filterEnd.value = twoMonthsEnd;

 // Panggil pemuatan data absensi otomatis untuk non-HRD
 loadRawAbsensiTable();
 }

 if (roleIsHrdOrAdmin && !canViewDashboard) {
  panelDashboard?.classList.add("hidden");
  panelProses?.classList.remove("hidden");
  container.querySelector('[data-atab="dashboard"]')?.classList.add("hidden");
  const processTab = container.querySelector('[data-atab="proses"]');
  processTab?.classList.add("border-maroon-700", "text-maroon-700");
  processTab?.classList.remove("border-transparent", "text-slate-500");
 }

 if (canViewDashboard && dashboardSection) {
  if (dashboardMonth) dashboardMonth.value = dashboardState.month;
  dashboardMonth.onchange = () => {
   dashboardState.month = dashboardMonth.value || dashboardState.month;
   renderAttendanceDashboard();
   loadAttendanceArchiveForDashboard();
  };
  dashboardBranch.onchange = () => {
   dashboardState.branch = dashboardBranch.value;
   dashboardState.division = "";
   populateDashboardFilters();
   renderAttendanceDashboard();
  };
  dashboardDivision.onchange = () => {
   dashboardState.division = dashboardDivision.value;
   renderAttendanceDashboard();
  };
  dashboardLoadArchive.onclick = () => loadAttendanceArchiveForDashboard({ force: true });
 }

 container.querySelectorAll(".absen-tab").forEach(btn => {
 if (btn.dataset.atab === "proses" && !roleIsHrdOrAdmin) btn.classList.add("hidden");
 if (btn.dataset.atab === "dashboard" && !canViewDashboard) btn.classList.add("hidden");
 btn.onclick = () => {
 const selectedTab = btn.dataset.atab;
 const isProses = selectedTab === "proses";
 const isDashboard = selectedTab === "dashboard";
 if (isProses && !roleIsHrdOrAdmin) return;
 if (isDashboard && !canViewDashboard) return;
 panelProses.classList.toggle("hidden", !isProses);
 panelDashboard.classList.toggle("hidden", !isDashboard);
 panelData.classList.toggle("hidden", selectedTab !== "data");

 container.querySelectorAll(".absen-tab").forEach(b => {
 b.classList.toggle("border-maroon-700", b === btn);
 b.classList.toggle("text-maroon-700", b === btn);
 b.classList.toggle("border-transparent", b !== btn);
 b.classList.toggle("text-slate-500", b !== btn);
 });

 if (!isProses) loadRawAbsensiTable();
 };
 });

 if (canViewDashboard) loadRawAbsensiTable();

 async function loadRawAbsensiTable() {
 rawTbody.innerHTML = `<tr><td colspan="18" class="p-4">${skeletonRows(4)}</td></tr>`;
 if (canViewAll && !roleIsHrdOrAdmin && !scopedBranch) {
  rawTbody.innerHTML = `<tr><td colspan="18" class="p-4 text-amber-800">Cabang akun belum terdaftar. Hubungi HRD agar akses PIC absensi dapat dibatasi ke cabang yang tepat.</td></tr>`;
  return;
 }
 const attendanceRef = collection(db, COL.DATA_ABSENSI);
 const attendanceRequest = roleIsHrdOrAdmin ? fsGetAll(COL.DATA_ABSENSI)
  : isPicBranch ? attendanceAccessApi("attendance_list").then(result => result.rows || [])
  : session?.nik ? Promise.all([
      getDocs(query(attendanceRef, where("nik", "==", String(session.nik)))),
      getDocs(query(attendanceRef, where("nik_karyawan", "==", String(session.nik))))
    ]).then(snaps => [...new Map(snaps.flatMap(snap => snap.docs).map(d => [d.id, { ...d.data(), id: d.id }])).values()])
  : Promise.resolve([]);
 let attendanceRows, employeeRows, scheduleSnapshot, leaveRows, submissionRows;
 try {
 [attendanceRows, employeeRows, scheduleSnapshot, leaveRows, submissionRows] = await Promise.all([
 attendanceRequest,
 fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
 getDoc(doc(db, COL.APP_SETTINGS, "main")).catch(() => null),
 fsGetAll(COL.MASTER_CUTI).catch(() => []),
 fsGetAll(COL.DATA_PENGAJUAN).catch(() => [])
 ]);
 } catch (error) {
  console.error("Gagal membaca data absensi:", error);
  rawTbody.innerHTML = `<tr><td colspan="18" class="p-4 text-rose-700">Data absensi belum dapat dibaca oleh akun ini. Periksa izin data dan cabang akun di Pengaturan Hak Akses. (${escapeHtml(error.message || 'Akses ditolak')})</td></tr>`;
  return;
 }
 employeeRowsGlobal = isPicBranch ? employeeRows.filter(k => normalizeToken(k.cabang) === normalizeToken(scopedBranch)) : employeeRows;
 scheduleRowsGlobal = scheduleSnapshot?.exists() ? (scheduleSnapshot.data()?.jadwal || []) : [];
 absenceRowsGlobal = isPicBranch ? [...leaveRows, ...submissionRows].filter(row => normalizeToken(row.cabang) === normalizeToken(scopedBranch)) : [...leaveRows, ...submissionRows];
 const liveAttendanceRows = buildAttendanceStatusRows({
 attendanceRows: enrichAttendanceRows(attendanceRows),
 employees: employeeRowsGlobal,
 absenceRecords: absenceRowsGlobal,
 schedules: scheduleRowsGlobal
 });
 const liveIds = new Set(liveAttendanceRows.map(row => String(row.id || "")).filter(Boolean));
 listAbsensiGlobal = [...liveAttendanceRows, ...archiveAttendanceRowsGlobal.filter(row => !row.id || !liveIds.has(String(row.id)))];
 populateAttendanceFilterOptions();
 populateDashboardFilters();
 renderAttendanceDashboard();
 if (canViewDashboard && !archiveMonthsLoaded.has(dashboardState.month)) loadAttendanceArchiveForDashboard();

 // Check for records older than 60 days per employee to keep Firebase lightweight
 const sixtyDaysAgo = new Date();
 sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
 const thresholdStr = sixtyDaysAgo.toISOString().substring(0, 10);
 
 // Select records older than 60 days from today
 const oldRecords = roleIsHrdOrAdmin ? listAbsensiGlobal.filter(x => !x.is_status_only && x.tanggal && x.tanggal < thresholdStr) : [];

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

 const employeeSource = filterState.division
  ? divisionSource.filter(row => String(row.divisi || "").trim().toUpperCase() === filterState.division.toUpperCase())
  : divisionSource;
 const employees = [...new Map(employeeSource
  .filter(row => row.nik || row.nama)
  .map(row => [String(row.nik || row.nama).trim(), `${row.nama || '-'}${row.nik ? ` — ${row.nik}` : ''}`])).entries()]
  .sort((a, b) => a[1].localeCompare(b[1], "id", { sensitivity: "base" }));
 if (filterEmployee) {
  filterEmployee.innerHTML = `<option value="">Semua Karyawan</option>${employees.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}`;
  filterEmployee.value = employees.some(([value]) => value === filterState.employee) ? filterState.employee : "";
  if (filterState.employee && !filterEmployee.value) filterState.employee = "";
 }
 }

 /**
 * Terapkan filter periode/tanggal + pencarian nama/NIK + urutan
 * (default tanggal terbaru, atau A-Z/Z-A kalau kolom Nama diklik).
 */
 function applyFiltersAbsen() {
 let data = [...listAbsensiGlobal];

 if (!canViewAll) {
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
 if (filterState.employee) data = data.filter(x => String(x.nik || x.nama || "").trim() === filterState.employee);
 if (filterState.completeness === "incomplete") data = data.filter(x => !x.ketidakhadiran && (x.perlu_koreksi || !x.scan_masuk || !x.scan_keluar));
 if (filterState.completeness === "missing_in") data = data.filter(x => !x.ketidakhadiran && !x.scan_masuk);
 if (filterState.completeness === "missing_out") data = data.filter(x => !x.ketidakhadiran && !x.scan_keluar);
 if (filterState.completeness === "complete") data = data.filter(x => Boolean(x.scan_masuk && x.scan_keluar));
 if (filterState.search) {
 const term = filterState.search;
 data = data.filter(x => [x.nama, x.nik, x.nama_finger, x.emp_no, x.no_id, x.attendance_status]
 .some(value => String(value || "").toLowerCase().includes(term)));
 }

 if (filterState.sortNama === "asc") {
 data.sort((a, b) => (a.nama || "").localeCompare(b.nama || "", "id", { sensitivity: "base" }));
 } else if (filterState.sortNama === "desc") {
 data.sort((a, b) => (b.nama || "").localeCompare(a.nama || "", "id", { sensitivity: "base" }));
 } else {
 data.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "") || (a.nama || "").localeCompare(b.nama || ""));
 }

 currentFilteredRows = data;
 renderRawTable(data);
 updateBulkToolbar();
 return data;
 }

 function renderRawTable(data) {
 if(!data.length) {
 rawTbody.innerHTML = `<tr><td colspan="18" class="p-8 text-center">${emptyState("Tidak ada data absensi pada filter ini")}</td></tr>`;
 return;
 }
 rawTbody.innerHTML = data.map(r => `
 <tr class="transition text-xs ${r.status_kind === 'review' ? 'bg-amber-50 hover:bg-amber-100' : r.status_kind === 'absence' ? 'bg-blue-50 hover:bg-blue-100' : ['half-day', 'permission', 'late-half-day'].includes(r.status_kind) ? 'bg-violet-50 hover:bg-violet-100' : r.status_kind === 'late-waived' ? 'bg-emerald-50 hover:bg-emerald-100' : r.status_kind === 'late' ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-slate-50'}">
 <td class="px-3 py-3 text-center">${canEdit && (roleIsHrdOrAdmin || isPicBranch) ? `<input type="checkbox" data-select-absen="${escapeHtml(attendanceRowKey(r))}" class="rounded border-slate-300 text-maroon-700" ${selectedAttendanceKeys.has(attendanceRowKey(r)) ? 'checked' : ''}>` : ''}</td>
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
 <td class="px-4 py-3 min-w-44">
 ${r.late_minutes ? `<span title="${escapeHtml(r.late_penalty_note || '')}" class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${r.late_penalty_waived ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : r.half_day_leave ? 'bg-violet-100 text-violet-800 border border-violet-200' : 'bg-rose-100 text-rose-800 border border-rose-200'}">${escapeHtml(String(r.late_minutes))} menit — ${r.late_penalty_waived ? 'Dibebaskan HRD' : r.half_day_leave ? 'Cuti 1/2 hari' : `Rp ${Number(r.late_penalty || 0).toLocaleString('id-ID')}`}</span>${r.late_penalty_waived && r.late_penalty_note ? `<p class="text-[10px] text-emerald-700 mt-1">${escapeHtml(r.late_penalty_note)}</p>` : ''}` : `<span class="text-emerald-600 text-[10px] font-bold">Tepat waktu</span>`}
 </td>
 <td class="px-4 py-3 min-w-56 text-[11px] text-slate-600">${r.late_minutes ? escapeHtml(r.deduction_source || '-') : '—'}</td>
 <td class="px-4 py-3 min-w-44">
 ${r.ketidakhadiran ? `<span class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">${escapeHtml(r.ketidakhadiran)}</span>` : `<span class="text-slate-400">—</span>`}
 </td>
 <td class="px-4 py-3 min-w-52">
 ${r.perlu_koreksi ? `<span title="${escapeHtml(r.alasan_koreksi || '')}" class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Perlu koreksi HRD</span><p class="text-[10px] text-amber-800 mt-1">${escapeHtml(r.alasan_koreksi || 'Periksa scan')}</p>` : `<span class="text-emerald-600 text-[10px] font-bold">Tidak</span>`}
 </td>
 <td class="px-4 py-3 text-right">
 ${canEdit && (roleIsHrdOrAdmin || isPicBranch) ? `
 <button data-edit-id="${r.id}" class="text-maroon-700 font-medium hover:underline mr-3">Koreksi</button>
 ${roleIsHrdOrAdmin && !r.is_status_only ? `<button data-del-id="${r.id}" class="text-red-500 hover:underline">Hapus</button>` : ''}
 ` : `<span class="text-slate-300">-</span>`}
 </td>
 </tr>
 `).join("");

 rawTbody.querySelectorAll("[data-edit-id]").forEach(btn => {
 btn.onclick = () => openEditAbsenModal(data.find(x => x.id === btn.dataset.editId));
 });

 rawTbody.querySelectorAll("[data-select-absen]").forEach(cb => {
  cb.onchange = () => {
   if (cb.checked) selectedAttendanceKeys.add(cb.dataset.selectAbsen);
   else selectedAttendanceKeys.delete(cb.dataset.selectAbsen);
   updateBulkToolbar();
  };
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
 filterDivision.onchange = (e) => {
  filterState.division = e.target.value;
  filterState.employee = "";
  populateAttendanceFilterOptions();
  applyFiltersAbsen();
 };
 }
 if (filterEmployee) {
 filterEmployee.onchange = (e) => { filterState.employee = e.target.value; applyFiltersAbsen(); };
 }
 if (filterCompleteness) {
 filterCompleteness.onchange = (e) => { filterState.completeness = e.target.value; applyFiltersAbsen(); };
 }
 if (btnResetFilterAbsen) {
 btnResetFilterAbsen.onclick = () => {
 filterState = {
 search: "",
 start: isHrdOrAdmin ? "" : twoMonthsStart,
 end: isHrdOrAdmin ? "" : twoMonthsEnd,
 branch: scopedBranch,
 division: "",
 employee: "",
 completeness: "",
 sortNama: null
 };
 if (searchRaw) searchRaw.value = "";
 if (filterStart) filterStart.value = isHrdOrAdmin ? "" : twoMonthsStart;
 if (filterEnd) filterEnd.value = isHrdOrAdmin ? "" : twoMonthsEnd;
 if (filterCompleteness) filterCompleteness.value = "";
 selectedAttendanceKeys.clear();
 populateAttendanceFilterOptions();
 if (iconSortNama) iconSortNama.textContent = "↕";
 applyFiltersAbsen();
 };
 }
 if (selectAllVisible) {
 selectAllVisible.onchange = () => {
  currentFilteredRows.forEach(row => {
   const key = attendanceRowKey(row);
   if (selectAllVisible.checked) selectedAttendanceKeys.add(key);
   else selectedAttendanceKeys.delete(key);
  });
  renderRawTable(currentFilteredRows);
  updateBulkToolbar();
 };
 }
 if (btnClearSelected) {
 btnClearSelected.onclick = () => {
  selectedAttendanceKeys.clear();
  renderRawTable(currentFilteredRows);
  updateBulkToolbar();
 };
 }
 if (btnBulkEdit) {
 btnBulkEdit.onclick = () => openBulkEditAbsensiModal();
 }
 if (btnBulkDelete) {
 btnBulkDelete.onclick = () => openBulkDeleteAbsensiModal();
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
 btnExportRawAbsen.onclick = async () => {
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

 btnExportRawAbsen.disabled = true;
 const originalLabel = btnExportRawAbsen.innerHTML;
 btnExportRawAbsen.textContent = "Menyiapkan data...";
 let exportRows;
 try {
 const freshEmployees = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => employeeRowsGlobal);
 const filteredAttendance = applyFiltersAbsen().filter(row => !row.is_status_only);
 exportRows = buildRawAttendanceExport({
 attendanceRows: filteredAttendance,
 employees: isPicBranch ? freshEmployees.filter(k => normalizeToken(k.cabang) === normalizeToken(scopedBranch)) : freshEmployees,
 leaves: absenceRowsGlobal,
 schedules: scheduleRowsGlobal,
 start: filterState.start,
 end: filterState.end,
 branch: scopedBranch || filterState.branch,
 division: filterState.division
 });
 } catch (error) {
 toast("Gagal menyiapkan data raw finger: " + error.message, "error");
 btnExportRawAbsen.disabled = false;
 btnExportRawAbsen.innerHTML = originalLabel;
 return;
 }
 if (!exportRows.length) {
 toast("Tidak ada karyawan atau data absensi pada filter yang dipilih.", "warning");
 btnExportRawAbsen.disabled = false;
 btnExportRawAbsen.innerHTML = originalLabel;
 return;
 }

 try {
 const worksheet = window.XLSX.utils.json_to_sheet(exportRows);
 worksheet["!cols"] = [
 { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 30 }, { wch: 14 },
 { wch: 13 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
 { wch: 34 }, { wch: 18 }, { wch: 70 }
 ];
 if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
 const workbook = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(workbook, worksheet, "Raw Finger");

 const safePart = value => String(value || "SEMUA").replace(/[^a-zA-Z0-9_-]/g, "_");
 const filename = `RAW_FINGER_${filterState.start}_SD_${filterState.end}_${safePart(filterState.branch)}_${safePart(filterState.division)}.xlsx`;
 window.XLSX.writeFile(workbook, filename);
 toast(`${exportRows.length} baris raw finger berhasil diunduh.`, "success");
 } catch (error) {
 toast("Gagal membuat file Excel raw finger: " + error.message, "error");
 } finally {
 btnExportRawAbsen.disabled = false;
 btnExportRawAbsen.innerHTML = originalLabel;
 }
 };
 }

 function openBulkEditAbsensiModal() {
 const selectedRows = listAbsensiGlobal.filter(row => selectedAttendanceKeys.has(attendanceRowKey(row)));
 if (!selectedRows.length) return toast("Pilih minimal satu baris absensi.", "warning");
 if (selectedRows.length > 400) return toast("Maksimal 400 baris dalam satu kali koreksi.", "warning");

 openModal({
  title: `Koreksi Massal Absensi (${selectedRows.length} Baris)`,
  size: "max-w-6xl",
  bodyHtml: `
   <div class="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
    Isi hanya jam yang perlu diperbaiki. Format jam <strong>HH:mm</strong>; kolom kosong akan disimpan sebagai scan kosong.
   </div>
   <div class="max-h-[55vh] overflow-auto border border-slate-200 rounded-xl">
    <table class="w-full text-xs">
     <thead class="sticky top-0 bg-slate-100 text-slate-600"><tr><th class="p-2 text-left">Karyawan</th><th class="p-2">Tanggal</th><th class="p-2">Scan Masuk</th><th class="p-2">Scan Pulang</th>${roleIsHrdOrAdmin ? '<th class="p-2 text-left">Denda</th>' : ''}<th class="p-2 text-left">Penanda</th></tr></thead>
     <tbody class="divide-y divide-slate-100">${selectedRows.map((row, index) => `
      <tr data-bulk-row="${index}">
       <td class="p-2"><strong>${escapeHtml(row.nama || '-')}</strong><div class="text-[10px] text-slate-400">${escapeHtml(row.nik || '-')}</div></td>
       <td class="p-2 text-center whitespace-nowrap">${escapeHtml(row.tanggal || '-')}</td>
       <td class="p-2"><input data-bulk-in="${index}" value="${escapeHtml(row.scan_masuk || '')}" placeholder="HH:mm" class="w-24 px-2 py-1.5 border rounded-lg font-mono"></td>
       <td class="p-2"><input data-bulk-out="${index}" value="${escapeHtml(row.scan_keluar || '')}" placeholder="HH:mm" class="w-24 px-2 py-1.5 border rounded-lg font-mono"></td>
       ${roleIsHrdOrAdmin ? `<td class="p-2 min-w-52"><label class="flex items-center gap-2"><input type="checkbox" data-bulk-waive="${index}" class="rounded border-slate-300 text-maroon-700" ${row.late_penalty_waived ? 'checked' : ''}><span>Bebaskan konsekuensi</span></label><input data-bulk-waive-note="${index}" value="${escapeHtml(row.late_penalty_note || '')}" placeholder="Alasan HRD" class="mt-1 w-full px-2 py-1.5 border rounded-lg"></td>` : ''}
       <td class="p-2 text-slate-500">${escapeHtml(row.alasan_koreksi || row.ketidakhadiran || '-')}</td>
      </tr>`).join("")}</tbody>
    </table>
   </div>`,
  footerHtml: `<button id="btn-bulk-cancel" class="px-4 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-100">Batal</button><button id="btn-bulk-save" class="px-4 py-2 text-sm font-bold text-white bg-maroon-700 rounded-lg">Simpan ${selectedRows.length} Baris</button>`,
  onMount: modal => {
   modal.querySelector("#btn-bulk-cancel").onclick = closeModal;
   modal.querySelector("#btn-bulk-save").onclick = async event => {
    const saveBtn = event.currentTarget;
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    const changes = selectedRows.map((row, index) => ({
     row,
     scan_masuk: modal.querySelector(`[data-bulk-in="${index}"]`).value.trim(),
     scan_keluar: modal.querySelector(`[data-bulk-out="${index}"]`).value.trim(),
     late_penalty_waived: roleIsHrdOrAdmin ? modal.querySelector(`[data-bulk-waive="${index}"]`).checked : Boolean(row.late_penalty_waived),
     late_penalty_note: roleIsHrdOrAdmin ? modal.querySelector(`[data-bulk-waive-note="${index}"]`).value.trim() : String(row.late_penalty_note || "")
    }));
    const invalid = changes.find(item => (item.scan_masuk && !timePattern.test(item.scan_masuk)) || (item.scan_keluar && !timePattern.test(item.scan_keluar)));
    if (invalid) return toast(`Format jam ${invalid.row.nama || ''} tanggal ${invalid.row.tanggal || ''} belum benar. Gunakan HH:mm.`, "warning");
    const missingWaiverReason = changes.find(item => item.late_penalty_waived && !item.late_penalty_note);
    if (roleIsHrdOrAdmin && missingWaiverReason) return toast(`Isi alasan pembebasan denda untuk ${missingWaiverReason.row.nama || 'karyawan'} tanggal ${missingWaiverReason.row.tanggal || ''}.`, "warning");
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan...";
    try {
     const apiChanges = changes.map(({ row, scan_masuk, scan_keluar, late_penalty_waived, late_penalty_note }) => {
      const targetId = row.is_status_only
       ? `ABS-MANUAL-${String(row.nik || row.id).replace(/[^a-zA-Z0-9._-]/g, '_')}-${row.tanggal}`
       : row.id;
      return {
       id: targetId, scan_masuk: scan_masuk || null, scan_keluar: scan_keluar || null,
       nik: row.nik || "", nama: row.nama || "", tanggal: row.tanggal,
       cabang: row.cabang || "", divisi: row.divisi || "", jabatan: row.jabatan || "",
       ...(roleIsHrdOrAdmin ? { late_penalty_waived, late_penalty_note } : {}),
      };
     });
     if (roleIsHrdOrAdmin) {
      const batch = writeBatch(db);
      changes.forEach(({ row, scan_masuk, scan_keluar, late_penalty_waived, late_penalty_note }, index) => {
       const data = apiChanges[index];
       const update = {
        scan_masuk: scan_masuk || null,
        scan_keluar: scan_keluar || null,
        late_penalty_waived,
        late_penalty_note: late_penalty_waived ? late_penalty_note : "",
        late_penalty_updated_by: session?.nama || session?.username || "HRD",
        late_penalty_updated_at: new Date().toISOString()
       };
       batch.set(doc(db, COL.DATA_ABSENSI, data.id), row.is_status_only ? {
        nik: data.nik, nama: data.nama, tanggal: data.tanggal, cabang: data.cabang,
        divisi: data.divisi, jabatan: data.jabatan, sumber: "KOREKSI HRD", ...update
       } : update, { merge: true });
      });
      await batch.commit();
     } else {
      await attendanceAccessApi("attendance_patch", { changes: apiChanges });
     }
     selectedAttendanceKeys.clear();
     closeModal();
     toast(`${changes.length} baris absensi berhasil dikoreksi.`, "success");
     await loadRawAbsensiTable();
    } catch (error) {
     console.error("Koreksi massal absensi gagal:", error);
     toast("Koreksi massal gagal: " + error.message, "error");
     saveBtn.disabled = false;
     saveBtn.textContent = `Simpan ${selectedRows.length} Baris`;
    }
   };
  }
 });
 }

 function openBulkDeleteAbsensiModal() {
 if (!roleIsHrdOrAdmin) return toast("Hanya HRD/Admin yang dapat menghapus data absensi.", "warning");
 const selectedRows = listAbsensiGlobal.filter(row => selectedAttendanceKeys.has(attendanceRowKey(row)));
 const deletableRows = selectedDeletableAttendanceRows(listAbsensiGlobal, selectedAttendanceKeys);
 const skippedCount = selectedRows.length - deletableRows.length;
 if (!deletableRows.length) return toast("Pilihan hanya berisi status cuti/izin virtual atau data arsip Spreadsheet yang tidak dapat dihapus dari sini.", "warning");
 const previewRows = deletableRows.slice(0, 12);

 openModal({
  title: `Hapus Massal Absensi (${deletableRows.length} Baris)`,
  bodyHtml: `
   <div class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
    <p class="font-bold">Data berikut akan dihapus permanen dari Data Absensi.</p>
    <p class="text-xs text-rose-700 mt-1">Tindakan ini tidak dapat dibatalkan. Data dari mesin fingerprint dapat muncul kembali jika bridge melakukan sinkronisasi ulang.</p>
   </div>
   ${skippedCount ? `<p class="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">${skippedCount} baris status cuti/izin virtual atau arsip Spreadsheet dilewati dan tidak akan dihapus.</p>` : ""}
   <div class="mt-3 max-h-64 overflow-auto border border-slate-200 rounded-xl">
    <table class="w-full text-xs"><thead class="sticky top-0 bg-slate-100 text-slate-500"><tr><th class="p-2 text-left">Karyawan</th><th class="p-2 text-left">NIK</th><th class="p-2 text-left">Tanggal</th><th class="p-2 text-left">Cabang</th></tr></thead><tbody class="divide-y divide-slate-100">${previewRows.map(row => `<tr><td class="p-2 font-semibold text-slate-800">${escapeHtml(row.nama || "-")}</td><td class="p-2">${escapeHtml(row.nik || "-")}</td><td class="p-2">${escapeHtml(row.tanggal || "-")}</td><td class="p-2">${escapeHtml(row.cabang || "-")}</td></tr>`).join("")}</tbody></table>
   </div>
   ${deletableRows.length > previewRows.length ? `<p class="mt-2 text-[11px] text-slate-500">Dan ${deletableRows.length - previewRows.length} baris lainnya.</p>` : ""}`,
  footerHtml: `<button id="btn-bulk-delete-cancel" class="px-4 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-100">Batal</button><button id="btn-bulk-delete-confirm" class="px-4 py-2 text-sm font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg">Hapus ${deletableRows.length} Baris</button>`,
  onMount: modal => {
   modal.querySelector("#btn-bulk-delete-cancel").onclick = closeModal;
   modal.querySelector("#btn-bulk-delete-confirm").onclick = async event => {
    const deleteButton = event.currentTarget;
    deleteButton.disabled = true;
    deleteButton.textContent = "Menghapus...";
    try {
     for (let index = 0; index < deletableRows.length; index += 400) {
      const batch = writeBatch(db);
      deletableRows.slice(index, index + 400).forEach(row => batch.delete(doc(db, COL.DATA_ABSENSI, row.id)));
      await batch.commit();
     }
     selectedAttendanceKeys.clear();
     closeModal();
     toast(`${deletableRows.length} baris absensi berhasil dihapus.`, "success");
     await loadRawAbsensiTable();
    } catch (error) {
     console.error("Hapus massal absensi gagal:", error);
     toast("Hapus massal gagal: " + error.message, "error");
     deleteButton.disabled = false;
     deleteButton.textContent = `Hapus ${deletableRows.length} Baris`;
    }
   };
  }
 });
 }

 function openEditAbsenModal(item) {
 if(!item) return;
 openModal({
 title: `Koreksi Absen — ${item.nama}`,
 bodyHtml: `
 <form id="form-koreksi-absen" class="space-y-4">
 <div><label class="block text-xs font-medium text-slate-500 mb-1">Jam Scan Masuk</label><input type="text" id="k-masuk" value="${item.scan_masuk || ''}" placeholder="Cth: 07:55" class="w-full px-3 py-2 text-sm border rounded outline-none"></div>
 <div><label class="block text-xs font-medium text-slate-500 mb-1">Jam Scan Keluar</label><input type="text" id="k-keluar" value="${item.scan_keluar || ''}" placeholder="Cth: 17:02" class="w-full px-3 py-2 text-sm border rounded outline-none"></div>
 ${roleIsHrdOrAdmin ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2"><label class="flex items-center gap-2 text-xs font-bold text-emerald-900"><input type="checkbox" id="k-waive-penalty" class="rounded border-emerald-300 text-emerald-700" ${item.late_penalty_waived ? 'checked' : ''}> Bebaskan denda/konsekuensi keterlambatan</label><div><label class="block text-[11px] font-medium text-emerald-800 mb-1">Alasan koreksi HRD</label><input type="text" id="k-waive-note" value="${escapeHtml(item.late_penalty_note || '')}" placeholder="Contoh: gangguan mesin fingerprint" class="w-full px-3 py-2 text-sm border border-emerald-200 rounded outline-none bg-white"></div><p class="text-[10px] text-emerald-700">Jika dicentang, denda uang maupun konsekuensi C1/2 tidak diterapkan. Hapus centang untuk mengaktifkan kembali perhitungan otomatis.</p></div>` : ''}
 </form>
 `,
 footerHtml: `
 <button id="btn-k-batal" class="px-4 py-2 text-sm rounded-lg text-slate-500 hover:bg-slate-100">Batal</button>
 <button id="btn-k-simpan" class="bg-maroon-700 text-white font-medium px-4 py-2 text-sm rounded-lg shadow">Simpan</button>
 `,
 onMount: m => {
 m.querySelector("#btn-k-batal").onclick = closeModal;
 m.querySelector("#btn-k-simpan").onclick = async () => {
 const waivePenalty = roleIsHrdOrAdmin && m.querySelector("#k-waive-penalty").checked;
 const waiverNote = roleIsHrdOrAdmin ? m.querySelector("#k-waive-note").value.trim() : "";
 if (waivePenalty && !waiverNote) return toast("Isi alasan pembebasan denda terlebih dahulu.", "warning");
 const dataUpdate = {
 scan_masuk: m.querySelector("#k-masuk").value.trim() || null,
 scan_keluar: m.querySelector("#k-keluar").value.trim() || null,
 ...(roleIsHrdOrAdmin ? {
  late_penalty_waived: waivePenalty,
  late_penalty_note: waivePenalty ? waiverNote : "",
  late_penalty_updated_by: session?.nama || session?.username || "HRD",
  late_penalty_updated_at: new Date().toISOString()
 } : {})
 };
 const targetId = item.is_status_only
 ? `ABS-MANUAL-${String(item.nik || item.id).replace(/[^a-zA-Z0-9._-]/g, '_')}-${item.tanggal}`
 : item.id;
 if (roleIsHrdOrAdmin) {
  await setDoc(doc(db, COL.DATA_ABSENSI, targetId), item.is_status_only ? {
   nik: item.nik, nama: item.nama, tanggal: item.tanggal, cabang: item.cabang || "",
   divisi: item.divisi || "", jabatan: item.jabatan || "", sumber: "KOREKSI HRD", ...dataUpdate
  } : dataUpdate, { merge: true });
 } else {
  await attendanceAccessApi("attendance_patch", { changes: [{
   id: targetId, nik: item.nik || "", nama: item.nama || "", tanggal: item.tanggal,
   cabang: item.cabang || "", divisi: item.divisi || "", jabatan: item.jabatan || "",
   ...dataUpdate
  }] });
 }
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

 const [allKaryawan, snapCfg] = await Promise.all([
 fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
 getDoc(doc(db, COL.APP_SETTINGS, "main")).catch(() => null)
 ]);
 const cfgJadwal = (snapCfg && snapCfg.exists()) ? (snapCfg.data()?.jadwal || []) : [];

 const chunks = []; let tempArr = []; let importedCount = 0;
 rows.forEach(r => {
 const values = attendanceImportValues(r);
 const tglStr = attendanceImportDate(values.tanggal);
 const empNama = values.nama;
 const empNik = values.nik;
 const sameBranch = k => !values.cabang || attendanceKey(k.cabang) === attendanceKey(values.cabang);
 const nikMatches = empNik ? (allKaryawan || []).filter(k => sameBranch(k) && attendanceKey(k.nik || k.nik_karyawan) === attendanceKey(empNik)) : [];
 const nameMatches = empNama ? (allKaryawan || []).filter(k => sameBranch(k) && attendanceKey(k.nama_karyawan || k.nama) === attendanceKey(empNama)) : [];
 const idMatches = values.fingerId ? (allKaryawan || []).filter(k => sameBranch(k) && [k.finger_id, k.no_finger, k.id_finger, k.pin].some(id => attendanceKey(id) === attendanceKey(values.fingerId))) : [];
 const empObj = empNik ? (nikMatches.length === 1 ? nikMatches[0] : null)
   : idMatches.length === 1 ? idMatches[0] : nameMatches.length === 1 ? nameMatches[0] : null;
 const conflictingIdentity = Boolean(
   (empNik && nikMatches.length !== 1) ||
   (empObj && empNama && nameMatches.length && !nameMatches.includes(empObj)) ||
   (empObj && values.fingerId && idMatches.length && !idMatches.includes(empObj)) ||
   (empObj && values.fingerName && ![empObj.finger_name, empObj.nama_karyawan, empObj.nama]
     .map(attendanceKey).filter(Boolean).some(alias => alias === attendanceKey(values.fingerName) ||
       alias.startsWith(`${attendanceKey(values.fingerName)} `))) ||
   (!empNik && !empObj && (idMatches.length > 1 || nameMatches.length > 1))
 );
 const shift = resolveWorkSchedule(empObj, cfgJadwal, tglStr);

 const resolvedNik = String(empNik || empObj?.nik || empObj?.nik_karyawan || "").trim();
 const stableEmployeeKey = (resolvedNik || String(values.fingerId || empNama || empObj?.nama_karyawan || empObj?.nama || ""))
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
 cabang: values.cabang || empObj?.cabang || "",
 sumber: "IMPORT_EXCEL",
 fingerprint_no_id: values.fingerId || "",
 fingerprint_name: values.fingerName || "",
 auto_assign: Boolean(empObj && !conflictingIdentity),
 perlu_koreksi: conflictingIdentity,
 alasan_koreksi: conflictingIdentity ? "NIK, nama, atau ID finger pada file tidak cocok dengan master karyawan; periksa sumber scan." : "",
 jadwal_masuk: values.jadwalMasuk || shift.masuk,
 jadwal_keluar: values.jadwalPulang || shift.pulang,
 // Scan selalu berasal dari file; jangan isi jam dummy jika kolom kosong.
 scan_masuk: attendanceImportScan(values.scanMasuk),
 scan_keluar: attendanceImportScan(values.scanPulang)
 };

 if (payload.nama && /^\d{4}-\d{2}-\d{2}$/.test(payload.tanggal) && (payload.scan_masuk || payload.scan_keluar)) {
 tempArr.push(payload);
 importedCount++;
 if (tempArr.length === 400) { chunks.push(tempArr); tempArr = []; }
 }
 });
 if (tempArr.length > 0) chunks.push(tempArr);

 for (const chunk of chunks) {
 const batch = writeBatch(db);
 chunk.forEach(p => { batch.set(doc(db, COL.DATA_ABSENSI, p.id), p); });
 await batch.commit();
 }
 toast(`${importedCount} baris scan diimpor; ${rows.length - importedCount} baris tanpa scan/tanggal valid tidak dibuat menjadi finger palsu.`, "success");
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
 const [allKaryawan, snapAbsen, snapCuti, snapUme, snapSettings] = await Promise.all([
 fsGetAll(COL.MASTER_KARYAWAN),
 getDocs(query(collection(db, COL.DATA_ABSENSI), where("tanggal", ">=", start), where("tanggal", "<=", end))),
 getDocs(collection(db, COL.MASTER_CUTI)),
 getDocs(collection(db, COL.UANG_MAKAN_EXPEDISI)),
 getDoc(doc(db, COL.APP_SETTINGS, "main")).catch(() => null)
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
 const reportSchedules = snapSettings?.exists() ? (snapSettings.data()?.jadwal || []) : [];

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
 let totalMenitTerlambat = 0; let totalDendaTerlambat = 0; let totalCutiSetengahTerlambat = 0;
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
 const shift = resolveWorkSchedule(k, reportSchedules, dStr);
 const penalty = calculateAttendancePenalty({
  ...matchAbsen,
  jadwal_masuk: matchAbsen.jadwal_masuk || shift.masuk || ""
 }, k);
 totalMenitTerlambat += penalty.late_minutes;
 if (penalty.half_day_leave) {
  cellCode = "C1/2";
  c_setengah++;
  totalCutiSetengahTerlambat++;
  hariMasuk++;
  totalJam += 4;
 } else {
  cellCode = "8";
  hariMasuk++;
  totalJam += 8;
  totalDendaTerlambat += penalty.late_penalty;
 }
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
 rowObj["Total Menit Terlambat"] = totalMenitTerlambat;
 rowObj["Total Denda Terlambat"] = totalDendaTerlambat;
 rowObj["Cuti 1/2 Hari karena Terlambat"] = totalCutiSetengahTerlambat;
 rowObj["Dasar Pemotongan Denda"] = attendanceDeductionSource(k);
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

 const sheet5Rows = buildRawAttendanceExport({
  attendanceRows: listAbsen,
  employees: allKaryawan,
  leaves: listCuti,
  schedules: reportSchedules,
  start,
  end
 }).filter(row => Number(row["Terlambat (Menit)"] || 0) > 0).map(row => ({
  "Tanggal": row.Tanggal,
  "NIK": row.NIK,
  "Nama Karyawan": row["Nama Karyawan"],
  "Cabang": allKaryawan.find(k => String(k.nik || k.nik_karyawan || "") === String(row.NIK || ""))?.cabang || "-",
  "Divisi": allKaryawan.find(k => String(k.nik || k.nik_karyawan || "") === String(row.NIK || ""))?.divisi || "-",
  "Jabatan": allKaryawan.find(k => String(k.nik || k.nik_karyawan || "") === String(row.NIK || ""))?.jabatan || "-",
  "Jadwal Masuk": row["Jam Masuk"],
  "Scan Masuk": row["Scan Masuk"],
  "Terlambat (Menit)": row["Terlambat (Menit)"],
  "Konsekuensi": row["Konsekuensi Terlambat"],
  "Nominal Denda": row["Nominal Denda"],
  "Dasar Pemotongan": row["Dasar Pemotongan"]
 }));

 const wb = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet1Rows), "Rekap Matriks Absensi");
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet2Rows), "Data Lembur");
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet3Rows), "Data Cuti");
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet4Rows), "UANG JALAN 2026");
 window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(sheet5Rows), "Rekap Keterlambatan");

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
 const addedCount = mergeArchivedAttendanceRows(res.rows);
 populateAttendanceFilterOptions();
 applyFiltersAbsen();
 renderAttendanceDashboard();
 toast(`Sukses memuat ${addedCount} data arsip baru untuk periode terpilih!`, "success");
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
 <button id="fp-copy-update" type="button" class="mt-2 font-semibold text-indigo-700 hover:underline">Salin perintah pembaruan connector</button>
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
 m.querySelector('#fp-copy-update').onclick = async () => {
   try {
     await navigator.clipboard.writeText(fingerprintUpdateCommand());
     toast('Perintah pembaruan connector berhasil disalin.', 'success');
   } catch (_) {
     toast('Browser tidak mengizinkan clipboard. Gunakan perintah pemasangan ulang.', 'warning');
   }
 };

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
             <label class="flex items-center gap-1 text-[10px] text-slate-500">Tanggal
               <input data-field="resyncDate" type="date" value="${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}" class="px-2 py-1 border rounded text-[11px]">
             </label>
             <button type="button" data-action="resync" class="text-[11px] font-semibold text-amber-700 hover:underline">Tarik ulang log</button>
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
   listEl.querySelectorAll('[data-action="resync"]').forEach(button => {
     button.onclick = async () => {
       const card = button.closest('.fp-device-card');
       const date = card.querySelector('[data-field="resyncDate"]').value;
       if (!date) return toast('Pilih tanggal yang akan ditarik ulang.', 'warning');
       button.disabled = true;
       const original = button.textContent;
       button.textContent = 'Meminta...';
       try {
         await fingerprintApi('admin_request_sync', { deviceId: card.dataset.deviceId, fromDate: date, toDate: date });
         toast(`Permintaan tarik ulang ${date} dikirim. Connector akan memprosesnya pada siklus berikutnya.`, 'success');
       } catch (error) { toast(error.message, 'error'); }
       button.disabled = false;
       button.textContent = original;
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
