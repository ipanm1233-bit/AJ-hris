/**
 * =====================================================================
 * VIEW: KUNJUNGAN LAPANGAN (JOINT VISIT & AUDIT LAPANGAN)
 * =====================================================================
 * Satu pintu untuk:
 *  - Pengajuan kunjungan (SPV/Koordinator Sales, HRGA, manajemen)
 *  - Persetujuan 2 tahap: Atasan Langsung → HRD/HRGA (APPROVED_FINAL)
 *  - Pelaporan hasil kunjungan (mobile-first, foto bukti toko)
 *  - Monitoring, rekap, export CSV, tindak lanjut/eskalasi
 *  - Master Toko (CRUD + import CSV)
 * =====================================================================
 */
import { COL, db, collection, getDocs, query, where } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, fsDelete, escapeHtml, toast, openModal, closeModal,
  fmtDateShort
} from "../utils.js";
import { badge, emptyState, icon, skeletonRows } from "../components.js";
import { getSession, resolveBranchScope, branchMatches } from "../auth.js";
import { authFetch } from "../api-client.js";
import { uploadFileToDrive } from "../gas-integration.js";
import {
  APPROVAL_STATUS, APPROVAL_STATUS_LABELS, REPORT_STATUS, REPORT_STATUS_LABELS,
  VISIT_TYPE_OPTIONS, VISIT_OUTCOME_OPTIONS, ESCALATION_DIVISIONS,
  FIELD_VISIT_CREATOR_ROLES, FIELD_VISIT_VIEW_ALL_ROLES,
  buildVisitCsv, computeReportDeadline, effectiveReportStatus,
  nextDocumentNumber, parseStoreCsv, storeCsvTemplate, summarizeFieldVisits,
  toDateOnly, validateVisitReport, validateVisitRequest, wibDateStr
} from "../kunjungan-lapangan.mjs";

const HRD_ROLES = ["HRD", "HRGA", "SUPERADMIN"];
const MANAGER_ROLES = [
  "SPV", "SUPERVISOR", "KOORDINATOR", "MANAGER", "BRANCH MANAGER", "BRANCH_MANAGER",
  "KEPALA CABANG", "GM", "DIREKTUR", "DIRECTOR"
];
const BRANCH_OPTIONS = ["CIREBON", "MALANG"];

const state = {
  container: null,
  session: {},
  tab: "ringkasan",
  employees: [],
  stores: [],
  requests: [],
  reports: [],
  items: [],
  followups: [],
  loading: false,
  loaded: false,
  filters: { search: "", branch: "", type: "", report: "" },
  reportDraft: null
};

const APPROVAL_TONE = {
  PENDING_ATASAN: "amber",
  PENDING_HRD: "blue",
  APPROVED_FINAL: "green",
  REJECTED: "red",
  CANCELLED: "slate"
};
const REPORT_TONE = {
  NOT_APPLICABLE: "slate",
  PENDING_REPORT: "amber",
  SUBMITTED: "green",
  OVERDUE: "red"
};

/* ---------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------- */
function upper(value) { return String(value || "").trim().toUpperCase(); }
function roleOf() { return upper(state.session?.role); }
function isHrd() { return HRD_ROLES.includes(roleOf()); }
function isViewAll() { return FIELD_VISIT_VIEW_ALL_ROLES.includes(roleOf()); }
function isManager() {
  if (isHrd() || isViewAll()) return true;
  return MANAGER_ROLES.includes(roleOf()) || Boolean(state.session?.is_atasan);
}
function isCreator() {
  if (FIELD_VISIT_CREATOR_ROLES.includes(roleOf())) return true;
  return isManager();
}
function branchScope() { return resolveBranchScope(state.session); }
function canSeeRequest(request) {
  if (!request) return false;
  if (isViewAll()) return true;
  const scope = branchScope();
  if (scope && !branchMatches(scope, request.branch)) return false;
  return true;
}
function typeLabel(value) {
  return VISIT_TYPE_OPTIONS.find(option => option.value === upper(value))?.label || value || "-";
}
function approvalLabel(value) {
  return APPROVAL_STATUS_LABELS[upper(value)] || value || "-";
}
function reportLabel(value) {
  return REPORT_STATUS_LABELS[upper(value)] || value || "-";
}
function dateText(value) {
  if (!value) return "-";
  return fmtDateShort(toDateOnly(value) || value) || "-";
}
function personName(identity = {}) {
  return identity.nama || identity.nama_karyawan || identity.username || identity.nik || "-";
}
function employeeNik(row) { return String(row?.nik_karyawan || row?.nik || "").trim(); }
function employeeName(row) { return String(row?.nama_karyawan || row?.nama || "").trim(); }
function isEmployeeActive(row) {
  const roleStatus = upper(row?.status_karyawan || row?.aktif_tdk_aktif || row?.status);
  if (!roleStatus) return true;
  return !["NONAKTIF", "TIDAK AKTIF", "INACTIVE", "RESIGN", "KELUAR", "PHK"].some(word => roleStatus.includes(word));
}
function activeSales() {
  return state.employees
    .filter(row => upper(row.divisi || row.departemen || "").includes("SALES"))
    .filter(isEmployeeActive)
    .map(row => ({ nik: employeeNik(row), nama: employeeName(row), cabang: upper(row.cabang) }))
    .filter(row => row.nama)
    .sort((a, b) => a.nama.localeCompare(b.nama));
}
function activeStores() {
  return state.stores
    .filter(row => row.is_active !== false)
    .sort((a, b) => String(a.store_name || "").localeCompare(String(b.store_name || "")));
}
function storeById(id) {
  const key = String(id || "").trim();
  return state.stores.find(row => String(row.store_code || "").trim() === key || String(row.id) === key) || null;
}
function salesByNik(nik) {
  const key = upper(nik);
  return state.employees.find(row => upper(employeeNik(row)) === key) || null;
}
function myEmployee() {
  const nik = upper(state.session?.nik);
  const nama = upper(state.session?.nama);
  return state.employees.find(row =>
    (nik && upper(employeeNik(row)) === nik) ||
    (nama && upper(employeeName(row)) === nama)
  ) || null;
}
function myAtasan() {
  const me = myEmployee();
  const atasanName = String(me?.atasan || "").trim();
  if (!atasanName) return { nama: "", nik: "", username: "" };
  const atasan = state.employees.find(row => upper(employeeName(row)) === upper(atasanName));
  return {
    nama: atasanName,
    nik: atasan ? employeeNik(atasan) : "",
    username: ""
  };
}
function requestsForMe() {
  const nik = upper(state.session?.nik);
  const nama = upper(state.session?.nama);
  const username = upper(state.session?.username);
  return state.requests.filter(row => {
    if (isViewAll()) return true;
    return (
      (nik && upper(row.nik_pemohon) === nik) ||
      (nama && upper(row.nama_pemohon) === nama) ||
      (username && upper(row.username_pemohon) === username) ||
      (nik && upper(row.atasan_nik) === nik) ||
      (nama && upper(row.atasan_nama) === nama)
    );
  });
}
function canApproveStage(request) {
  if (!request) return false;
  const status = upper(request.approval_status);
  const nik = upper(state.session?.nik);
  const nama = upper(state.session?.nama);
  if (status === APPROVAL_STATUS.PENDING_ATASAN) {
    if (isHrd()) return true;
    return (nik && upper(request.atasan_nik) === nik) || (nama && upper(request.atasan_nama) === nama);
  }
  if (status === APPROVAL_STATUS.PENDING_HRD) return isHrd();
  return false;
}
function reportFor(requestId) {
  return state.reports.find(row => String(row.visit_request_id) === String(requestId)) || null;
}
function itemsFor(requestId) {
  return state.items.filter(row => String(row.visit_request_id) === String(requestId));
}
function followupsFor(requestId) {
  return state.followups.filter(row => String(row.visit_request_id) === String(requestId));
}
function reportStatusOf(request, now = new Date()) {
  return effectiveReportStatus(request, now);
}
function isReportable(request) {
  if (!request) return false;
  if (upper(request.approval_status) !== APPROVAL_STATUS.APPROVED_FINAL) return false;
  if (upper(request.report_status) === REPORT_STATUS.SUBMITTED) return false;
  const today = wibDateStr();
  return !request.start_date || toDateOnly(request.start_date) <= today;
}
function canWriteRequest(request) {
  if (!request) return false;
  const nik = upper(state.session?.nik);
  const nama = upper(state.session?.nama);
  return isHrd() || (nik && upper(request.nik_pemohon) === nik) || (nama && upper(request.nama_pemohon) === nama);
}
function tabList() {
  const tabs = [{ id: "ringkasan", label: "Ringkasan" }];
  if (isCreator()) tabs.push({ id: "pengajuan", label: "Pengajuan" });
  if (isManager()) tabs.push({ id: "persetujuan", label: "Persetujuan" });
  tabs.push({ id: "laporan", label: "Laporan" });
  if (isManager()) tabs.push({ id: "monitoring", label: "Monitoring" });
  if (isHrd() || isViewAll()) tabs.push({ id: "master_toko", label: "Master Toko" });
  return tabs;
}
function normalizeTab(value) {
  const tab = String(value || "").trim();
  return tabList().some(item => item.id === tab) ? tab : "ringkasan";
}

/* ---------------------------------------------------------------------
 * MOUNT
 * ------------------------------------------------------------------- */
export async function mount(container, { session, params } = {}) {
  state.container = container;
  state.session = session || getSession() || {};
  state.tab = normalizeTab(params?.get ? params.get("tab") : "");
  state.loaded = false;
  state.reportDraft = null;

  container.innerHTML = container.innerHTML; // pertahankan template
  renderTabBar();
  const summary = container.querySelector("#kl-summary");
  const panel = container.querySelector("#kl-panel");
  if (summary) summary.innerHTML = skeletonRows(2);
  if (panel) panel.innerHTML = skeletonRows(6);

  container.addEventListener("click", handleClick);
  container.addEventListener("submit", handleSubmit);
  container.addEventListener("change", handleChange);

  try {
    await loadData();
  } catch (error) {
    console.error("Gagal memuat data kunjungan lapangan:", error);
    if (panel) panel.innerHTML = emptyState("Data belum dapat dimuat", error?.message || "Periksa koneksi lalu muat ulang halaman.");
    if (summary) summary.innerHTML = "";
    return;
  }
  render();
}

async function loadData() {
  state.loading = true;
  const [employees, stores] = await Promise.all([
    fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
    fsGetAll(COL.MASTER_STORES).catch(() => [])
  ]);
  state.employees = Array.isArray(employees) ? employees : [];
  state.stores = Array.isArray(stores) ? stores : [];
  state.requests = await loadRequests();
  const [reports, items, followups] = await Promise.all([
    fsGetAll(COL.FIELD_VISIT_REPORTS).catch(() => []),
    fsGetAll(COL.FIELD_VISIT_REPORT_ITEMS).catch(() => []),
    fsGetAll(COL.FIELD_VISIT_FOLLOWUPS).catch(() => [])
  ]);
  state.reports = Array.isArray(reports) ? reports : [];
  state.items = Array.isArray(items) ? items : [];
  state.followups = Array.isArray(followups) ? followups : [];
  state.loaded = true;
  state.loading = false;
}

async function loadRequests() {
  const map = new Map();
  const add = rows => (rows || []).forEach(row => { if (row?.id) map.set(row.id, row); });
  try {
    if (isViewAll() || isHrd()) {
      add(await fsGetAll(COL.FIELD_VISIT_REQUESTS));
      return sortRequests([...map.values()]);
    }
    const nik = String(state.session?.nik || "").trim();
    const nama = String(state.session?.nama || "").trim();
    const attempts = [];
    if (nik) {
      attempts.push(getDocs(query(collection(db, COL.FIELD_VISIT_REQUESTS), where("nik_pemohon", "==", nik))));
      attempts.push(getDocs(query(collection(db, COL.FIELD_VISIT_REQUESTS), where("atasan_nik", "==", nik))));
    }
    if (nama) {
      attempts.push(getDocs(query(collection(db, COL.FIELD_VISIT_REQUESTS), where("nama_pemohon", "==", nama))));
      attempts.push(getDocs(query(collection(db, COL.FIELD_VISIT_REQUESTS), where("atasan_nama", "==", nama))));
    }
    const results = await Promise.all(attempts.map(promise => promise.catch(() => null)));
    results.forEach(snap => {
      if (!snap) return;
      snap.forEach(docSnap => map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
    });
    if (!map.size && isManager()) {
      // Atasan dengan data lama tanpa nik: ambil semua agar bisa menyetujui.
      add(await fsGetAll(COL.FIELD_VISIT_REQUESTS).catch(() => []));
    }
  } catch (error) {
    console.warn("loadRequests:", error?.code || error?.message || error);
  }
  return sortRequests([...map.values()]);
}

function sortRequests(rows) {
  return rows.sort((a, b) => {
    const left = String(a.start_date || a.created_at?.seconds || a.created_at || "");
    const right = String(b.start_date || b.created_at?.seconds || b.created_at || "");
    return right.localeCompare(left);
  });
}

/* ---------------------------------------------------------------------
 * RENDER KERANGKA
 * ------------------------------------------------------------------- */
function renderTabBar() {
  const holder = state.container?.querySelector("#kl-tabbar");
  if (!holder) return;
  holder.innerHTML = tabList().map(tab => `
    <button type="button" data-action="tab" data-tab="${tab.id}"
      class="px-3 py-1.5 rounded-full text-xs font-semibold border transition ${state.tab === tab.id
        ? "bg-maroon-700 text-white border-maroon-700 shadow-sm"
        : "bg-white text-slate-600 border-slate-200 hover:border-maroon-300 hover:text-maroon-700"}">
      ${escapeHtml(tab.label)}
    </button>`).join("");
}

function render() {
  renderTabBar();
  renderSummary();
  const panel = state.container?.querySelector("#kl-panel");
  if (!panel) return;
  if (state.tab === "pengajuan") panel.innerHTML = renderPengajuanPanel();
  else if (state.tab === "persetujuan") panel.innerHTML = renderApprovalPanel();
  else if (state.tab === "laporan") panel.innerHTML = renderLaporanPanel();
  else if (state.tab === "monitoring") panel.innerHTML = renderMonitoringPanel();
  else if (state.tab === "master_toko") panel.innerHTML = renderMasterTokoPanel();
  else panel.innerHTML = renderRingkasanPanel();
  if (state.reportDraft && state.tab === "laporan") mountReportForm();
}

function renderSummary() {
  const holder = state.container?.querySelector("#kl-summary");
  if (!holder) return;
  const rows = requestsForMe();
  const summary = summarizeFieldVisits(rows, state.reports, state.followups);
  const cards = [
    { label: "Total Kunjungan", value: summary.total, sub: `${summary.this_month} bulan ini`, tone: "maroon" },
    { label: "Menunggu Atasan", value: summary.pending_atasan, sub: "Tahap 1", tone: "amber" },
    { label: "Menunggu HRD", value: summary.pending_hrd, sub: "Tahap final", tone: "blue" },
    { label: "Belum Lapor", value: summary.waiting_report, sub: "Dalam tenggat", tone: "slate" },
    { label: "Terlambat", value: summary.overdue, sub: "Perlu tindak lanjut", tone: "red" },
    { label: "Selesai Lapor", value: summary.submitted, sub: summary.on_time_rate === null ? "-" : `${summary.on_time_rate}% tepat waktu`, tone: "green" }
  ];
  const tones = {
    maroon: "from-maroon-700 to-maroon-900 text-white",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    red: "bg-red-50 border-red-200 text-red-900",
    green: "bg-emerald-50 border-emerald-200 text-emerald-900"
  };
  holder.innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
      ${cards.map(card => `
        <div class="rounded-2xl border p-3.5 ${tones[card.tone]} ${card.tone === "maroon" ? "border-maroon-900 shadow-sm" : ""}">
          <p class="text-[10.5px] font-bold uppercase tracking-wide opacity-80">${escapeHtml(card.label)}</p>
          <p class="text-2xl font-extrabold leading-tight mt-1">${Number(card.value || 0)}</p>
          <p class="text-[10.5px] opacity-75 mt-0.5">${escapeHtml(card.sub)}</p>
        </div>`).join("")}
    </div>`;
}

function renderRingkasanPanel() {
  const rows = requestsForMe().slice(0, 8);
  const pendingReports = requestsForMe().filter(isReportable);
  return `
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 class="font-bold text-slate-800">Kunjungan Terbaru</h2>
            <p class="text-xs text-slate-500">8 pengajuan terakhir yang relevan dengan Anda.</p>
          </div>
          ${isCreator() ? `<button type="button" data-action="new-request" class="inline-flex items-center gap-1.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-semibold px-3 py-2 rounded-lg">${icon("doc-plus", "w-4 h-4")} Buat Pengajuan</button>` : ""}
        </div>
        ${rows.length ? `<div class="divide-y divide-slate-100">${rows.map(renderRequestRow).join("")}</div>` : emptyState("Belum ada kunjungan", "Pengajuan kunjungan lapangan akan tampil di sini.")}
      </div>
      <div class="space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 class="font-bold text-slate-800 mb-1">Perlu Dilaporkan</h2>
          <p class="text-xs text-slate-500 mb-3">Batas laporan H+1 pukul 10:00 WIB.</p>
          ${pendingReports.length ? `<div class="space-y-2">${pendingReports.slice(0, 5).map(request => `
            <button type="button" data-action="fill-report" data-id="${escapeHtml(request.id)}" class="w-full text-left rounded-xl border border-slate-200 hover:border-maroon-300 p-3">
              <p class="text-sm font-semibold text-slate-800">${escapeHtml(request.document_number || "-")}</p>
              <p class="text-xs text-slate-500">${escapeHtml(dateText(request.start_date))} • ${escapeHtml(typeLabel(request.visit_type))}</p>
            </button>`).join("")}</div>` : `<p class="text-xs text-slate-500">Tidak ada laporan tertunda. 🎉</p>`}
        </div>
        <div class="bg-gradient-to-br from-maroon-700 to-maroon-900 text-white rounded-2xl p-4">
          <p class="text-[11px] font-bold uppercase tracking-wide opacity-80">Alur Kunjungan</p>
          <ol class="mt-2 space-y-1.5 text-xs opacity-95">
            <li>1. Pengajuan oleh SPV/Koordinator/HRGA</li>
            <li>2. Persetujuan Atasan Langsung</li>
            <li>3. Validasi final HRD/HRGA</li>
            <li>4. Pelaksanaan &amp; laporan H+1 10:00 WIB</li>
            <li>5. Tindak lanjut / eskalasi</li>
          </ol>
        </div>
      </div>
    </div>`;
}

function renderRequestRow(request) {
  const reportStatus = reportStatusOf(request);
  return `
    <div class="py-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="text-sm font-bold text-slate-800 truncate">${escapeHtml(request.document_number || "-")}</p>
          ${badge(approvalLabel(request.approval_status), APPROVAL_TONE[upper(request.approval_status)] || "slate")}
          ${upper(request.approval_status) === APPROVAL_STATUS.APPROVED_FINAL ? badge(reportLabel(reportStatus), REPORT_TONE[reportStatus] || "slate") : ""}
        </div>
        <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(typeLabel(request.visit_type))} • ${escapeHtml(dateText(request.start_date))}${request.end_date && request.end_date !== request.start_date ? ` s/d ${escapeHtml(dateText(request.end_date))}` : ""} • ${escapeHtml(request.branch || "-")}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(request.nama_pemohon || "-")}</p>
      </div>
      <button type="button" data-action="detail" data-id="${escapeHtml(request.id)}" class="shrink-0 text-xs font-semibold text-maroon-700 hover:text-maroon-900 px-2 py-1">Detail</button>
    </div>`;
}

/* ---------------------------------------------------------------------
 * TAB: PENGAJUAN
 * ------------------------------------------------------------------- */
function renderPengajuanPanel() {
  const nik = upper(state.session?.nik);
  const nama = upper(state.session?.nama);
  const username = upper(state.session?.username);
  const rows = state.requests.filter(row =>
    isViewAll() ||
    (nik && upper(row.nik_pemohon) === nik) ||
    (nama && upper(row.nama_pemohon) === nama) ||
    (username && upper(row.username_pemohon) === username)
  );
  return `
    <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 class="font-bold text-slate-800">Pengajuan Kunjungan Saya</h2>
          <p class="text-xs text-slate-500">Joint Visit mendampingi Sales, atau Audit Lapangan oleh HRGA/manajemen.</p>
        </div>
        <button type="button" data-action="new-request" class="inline-flex items-center justify-center gap-1.5 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
          ${icon("doc-plus", "w-4 h-4")} Buat Pengajuan
        </button>
      </div>
      ${rows.length ? `<div class="space-y-2.5">${rows.map(renderPengajuanCard).join("")}</div>` : emptyState("Belum ada pengajuan", "Tekan Buat Pengajuan untuk menjadwalkan kunjungan lapangan.")}
    </div>`;
}

function renderPengajuanCard(request) {
  const status = upper(request.approval_status);
  const sales = Array.isArray(request.planned_sales_names) ? request.planned_sales_names : [];
  const stores = Array.isArray(request.planned_store_names) ? request.planned_store_names : [];
  const pending = [APPROVAL_STATUS.PENDING_ATASAN, APPROVAL_STATUS.PENDING_HRD].includes(status);
  return `
    <div class="rounded-xl border border-slate-200 p-3.5 hover:border-slate-300">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-bold text-slate-800">${escapeHtml(request.document_number || "-")}</p>
            ${badge(approvalLabel(status), APPROVAL_TONE[status] || "slate")}
          </div>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(typeLabel(request.visit_type))} • ${escapeHtml(dateText(request.start_date))}${request.end_date && request.end_date !== request.start_date ? ` s/d ${escapeHtml(dateText(request.end_date))}` : ""}</p>
          <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(request.branch || "-")} • Sales: ${escapeHtml(sales.join(", ") || "-")}</p>
          <p class="text-[11px] text-slate-400">Toko: ${escapeHtml(stores.slice(0, 3).join(", ") || "-")}${stores.length > 3 ? ` +${stores.length - 3} lainnya` : ""}</p>
        </div>
        <button type="button" data-action="detail" data-id="${escapeHtml(request.id)}" class="shrink-0 text-xs font-semibold text-maroon-700 px-2 py-1">Detail</button>
      </div>
      ${pending && canWriteRequest(request) ? `<div class="mt-2.5 flex justify-end"><button type="button" data-action="cancel-request" data-id="${escapeHtml(request.id)}" class="text-[11px] font-semibold text-red-600 hover:text-red-800">Batalkan Pengajuan</button></div>` : ""}
    </div>`;
}

function branchOptions(selected = "") {
  const branches = new Set(BRANCH_OPTIONS);
  state.stores.forEach(row => { if (row.branch) branches.add(upper(row.branch)); });
  state.employees.forEach(row => { if (row.cabang) branches.add(upper(row.cabang)); });
  if (selected) branches.add(upper(selected));
  return [...branches].filter(Boolean).sort().map(branch =>
    `<option value="${escapeHtml(branch)}" ${upper(selected) === branch ? "selected" : ""}>${escapeHtml(branch)}</option>`
  ).join("");
}

function openRequestForm(prefill = null) {
  if (!isCreator()) { toast("Anda tidak memiliki akses membuat pengajuan kunjungan.", "warning"); return; }
  const atasan = myAtasan();
  const today = wibDateStr();
  const data = prefill || {};
  const sales = activeSales();
  const stores = activeStores();
  const defaultBranch = data.branch || state.session?.cabang || BRANCH_OPTIONS[0];
  const selectedSales = new Set((data.planned_sales_niks || []).map(upper));
  const selectedStores = new Set(data.planned_store_ids || []);

  const body = `
    <form id="kl-request-form" class="space-y-4" data-atasan-nik="${escapeHtml(atasan.nik)}" data-atasan-nama="${escapeHtml(atasan.nama)}">
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs font-semibold text-slate-600">Jenis Kunjungan *</span>
          <select name="visit_type" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            ${VISIT_TYPE_OPTIONS.map(option => `<option value="${option.value}" ${upper(data.visit_type || "JOINT_VISIT") === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <label class="block">
          <span class="text-xs font-semibold text-slate-600">Cabang / Area *</span>
          <select name="branch" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            ${branchOptions(defaultBranch)}
          </select>
        </label>
        <label class="block">
          <span class="text-xs font-semibold text-slate-600">Tanggal Mulai *</span>
          <input type="date" name="start_date" required value="${escapeHtml(data.start_date || today)}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        </label>
        <label class="block">
          <span class="text-xs font-semibold text-slate-600">Tanggal Selesai *</span>
          <input type="date" name="end_date" required value="${escapeHtml(data.end_date || data.start_date || today)}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        </label>
      </div>

      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-semibold text-slate-600">Sales yang Didampingi <span class="font-normal text-slate-400">(wajib untuk Joint Visit)</span></span>
          <span class="text-[10px] text-slate-400">${sales.length} sales aktif</span>
        </div>
        <input type="text" data-filter="sales" placeholder="Cari nama sales..." class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
        <div class="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2 grid sm:grid-cols-2 gap-1" id="kl-sales-list">
          ${sales.map(row => `
            <label class="kl-sales-item flex items-center gap-2 text-xs text-slate-700 rounded px-1.5 py-1 hover:bg-slate-50" data-search="${escapeHtml(upper(row.nama + " " + row.nik))}">
              <input type="checkbox" name="planned_sales" value="${escapeHtml(row.nik)}" data-name="${escapeHtml(row.nama)}" ${selectedSales.has(upper(row.nik)) ? "checked" : ""} class="rounded border-slate-300">
              <span class="truncate">${escapeHtml(row.nama)}${row.nik ? ` <span class="text-slate-400">(${escapeHtml(row.nik)})</span>` : ""}</span>
            </label>`).join("") || `<p class="text-xs text-slate-400 p-1">Data sales belum tersedia di Master Karyawan.</p>`}
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-semibold text-slate-600">Toko yang Dikunjungi *</span>
          <span class="text-[10px] text-slate-400">${stores.length} toko aktif</span>
        </div>
        <input type="text" data-filter="stores" placeholder="Cari kode / nama toko..." class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
        <div class="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-0.5" id="kl-store-list">
          ${stores.map(row => `
            <label class="kl-store-item flex items-center gap-2 text-xs text-slate-700 rounded px-1.5 py-1 hover:bg-slate-50" data-search="${escapeHtml(upper([row.store_code, row.store_name, row.city_area, row.branch].join(" ")))}">
              <input type="checkbox" name="planned_store" value="${escapeHtml(row.store_code)}" data-name="${escapeHtml(row.store_name)}" data-branch="${escapeHtml(row.branch || "")}" ${selectedStores.has(String(row.store_code)) ? "checked" : ""} class="rounded border-slate-300">
              <span class="truncate">${escapeHtml(row.store_name || "-")} <span class="text-slate-400">(${escapeHtml(row.store_code || "-")})</span></span>
            </label>`).join("") || `<p class="text-xs text-slate-400 p-1">Master Toko masih kosong. HRD dapat mengisinya lewat tab Master Toko.</p>`}
        </div>
      </div>

      <label class="block">
        <span class="text-xs font-semibold text-slate-600">Tujuan &amp; Atensi Khusus *</span>
        <textarea name="purpose_notes" rows="3" required minlength="10" placeholder="Contoh: Audit toko jarang dikunjungi, cek display & stok, coaching sales baru." class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">${escapeHtml(data.purpose_notes || "")}</textarea>
      </label>

      <div class="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600">
        <b>Alur persetujuan:</b> Atasan Langsung ${atasan.nama ? `(<b>${escapeHtml(atasan.nama)}</b>)` : "(belum terdeteksi — pengajuan diteruskan ke HRD)"} → HRD/HRGA.
        Laporan wajib diisi maksimal <b>H+1 pukul 10:00 WIB</b>.
      </div>
    </form>`;

  openModal({
    title: "Buat Pengajuan Kunjungan Lapangan",
    bodyHtml: body,
    size: "lg",
    footerHtml: `
      <button type="button" data-action="close-modal" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Batal</button>
      <button type="submit" form="kl-request-form" class="px-4 py-2 rounded-lg text-sm font-semibold bg-maroon-700 hover:bg-maroon-800 text-white">Kirim Pengajuan</button>`
  });
}

async function submitRequest(form) {
  const formData = new FormData(form);
  const salesNiks = formData.getAll("planned_sales").map(value => String(value || "").trim()).filter(Boolean);
  const storeIds = formData.getAll("planned_store").map(value => String(value || "").trim()).filter(Boolean);
  const salesNames = [...form.querySelectorAll('input[name="planned_sales"]:checked')].map(input => input.dataset.name || input.value);
  const storeNames = [...form.querySelectorAll('input[name="planned_store"]:checked')].map(input => input.dataset.name || input.value);
  const payload = {
    visit_type: upper(formData.get("visit_type")),
    branch: upper(formData.get("branch")),
    start_date: toDateOnly(formData.get("start_date")),
    end_date: toDateOnly(formData.get("end_date")),
    planned_sales_niks: salesNiks,
    planned_sales_names: salesNames,
    planned_store_ids: storeIds,
    planned_store_names: storeNames,
    purpose_notes: String(formData.get("purpose_notes") || "").trim()
  };
  const errors = validateVisitRequest(payload);
  if (errors.length) { toast(errors[0], "warning"); return; }
  if (!storeIds.length) { toast("Pilih minimal 1 toko.", "warning"); return; }

  const atasan = myAtasan();
  const existingNumbers = state.requests.map(row => row.document_number).filter(Boolean);
  const documentNumber = nextDocumentNumber(payload.start_date, existingNumbers);
  const deadline = computeReportDeadline(payload.end_date);
  const nowIso = new Date().toISOString();
  const record = {
    ...payload,
    document_number: documentNumber,
    nama_pemohon: state.session?.nama || state.session?.username || "-",
    nik_pemohon: String(state.session?.nik || "").trim(),
    username_pemohon: String(state.session?.username || "").trim(),
    role_pemohon: roleOf(),
    cabang_pemohon: state.session?.cabang || "",
    atasan_nama: atasan.nama,
    atasan_nik: atasan.nik,
    atasan_username: atasan.username,
    approval_status: APPROVAL_STATUS.PENDING_ATASAN,
    approval_history: [],
    report_status: REPORT_STATUS.PENDING_REPORT,
    report_deadline_at: deadline,
    created_at: nowIso,
    updated_at: nowIso
  };

  const submitBtn = form.closest("#app-modal-backdrop")?.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Menyimpan..."; }
  try {
    const id = await fsAdd(COL.FIELD_VISIT_REQUESTS, record);
    record.id = id;
    state.requests.unshift(record);
    closeModal();
    toast(`Pengajuan ${documentNumber} terkirim.`, "success");
    notifyEvent(id, "request_submitted");
    state.tab = "pengajuan";
    render();
  } catch (error) {
    console.error("submitRequest:", error);
    toast(error?.message || "Pengajuan gagal disimpan.", "error");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Kirim Pengajuan"; }
  }
}

async function cancelRequest(requestId, note = "") {
  const request = state.requests.find(row => row.id === requestId);
  if (!request) return;
  if (!canWriteRequest(request)) { toast("Anda tidak berhak membatalkan pengajuan ini.", "warning"); return; }
  if (!window.confirm(`Batalkan pengajuan ${request.document_number || ""}?`)) return;
  try {
    await fsUpdate(COL.FIELD_VISIT_REQUESTS, requestId, {
      approval_status: APPROVAL_STATUS.CANCELLED,
      cancelled_at: new Date().toISOString(),
      cancellation_note: note || "",
      updated_at: new Date().toISOString(),
      approval_history: [...(request.approval_history || []), {
        stage: "CANCELLED", action: "CANCELLED", by: state.session?.nama || "", by_nik: state.session?.nik || "",
        at: new Date().toISOString(), note: note || "Dibatalkan oleh pemohon"
      }]
    });
    request.approval_status = APPROVAL_STATUS.CANCELLED;
    toast("Pengajuan dibatalkan.", "success");
    notifyEvent(requestId, "cancelled", note);
    render();
  } catch (error) {
    console.error("cancelRequest:", error);
    toast(error?.message || "Gagal membatalkan pengajuan.", "error");
  }
}

/* ---------------------------------------------------------------------
 * TAB: PERSETUJUAN
 * ------------------------------------------------------------------- */
function renderApprovalPanel() {
  const rows = requestsForMe();
  const stage1 = rows.filter(row => upper(row.approval_status) === APPROVAL_STATUS.PENDING_ATASAN);
  const stage2 = rows.filter(row => upper(row.approval_status) === APPROVAL_STATUS.PENDING_HRD);
  const history = rows.filter(row => ![APPROVAL_STATUS.PENDING_ATASAN, APPROVAL_STATUS.PENDING_HRD].includes(upper(row.approval_status))).slice(0, 8);
  return `
    <div class="space-y-4">
      ${renderApprovalGroup("Menunggu Persetujuan Atasan Langsung", stage1, "Tahap 1", "amber")}
      ${isHrd() ? renderApprovalGroup("Menunggu Validasi HRD / HRGA", stage2, "Tahap final", "blue") : ""}
      <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <h2 class="font-bold text-slate-800 mb-1">Riwayat Keputusan</h2>
        <p class="text-xs text-slate-500 mb-3">Pengajuan terakhir yang sudah diproses.</p>
        ${history.length ? `<div class="divide-y divide-slate-100">${history.map(renderRequestRow).join("")}</div>` : `<p class="text-xs text-slate-500">Belum ada riwayat.</p>`}
      </div>
    </div>`;
}

function renderApprovalGroup(title, rows, hint, tone) {
  const toneClass = tone === "amber" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50";
  return `
    <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 class="font-bold text-slate-800">${escapeHtml(title)}</h2>
          <p class="text-xs text-slate-500">${escapeHtml(hint)} • ${rows.length} pengajuan</p>
        </div>
        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${toneClass}">${rows.length}</span>
      </div>
      ${rows.length ? `<div class="space-y-2.5">${rows.map(renderApprovalCard).join("")}</div>` : `<p class="text-xs text-slate-500">Tidak ada pengajuan pada tahap ini.</p>`}
    </div>`;
}

function renderApprovalCard(request) {
  const sales = Array.isArray(request.planned_sales_names) ? request.planned_sales_names : [];
  const stores = Array.isArray(request.planned_store_names) ? request.planned_store_names : [];
  const actionable = canApproveStage(request);
  return `
    <div class="rounded-xl border border-slate-200 p-3.5">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-bold text-slate-800">${escapeHtml(request.document_number || "-")}</p>
        ${badge(approvalLabel(request.approval_status), APPROVAL_TONE[upper(request.approval_status)] || "slate")}
      </div>
      <p class="text-xs text-slate-600 mt-1">${escapeHtml(typeLabel(request.visit_type))} • ${escapeHtml(dateText(request.start_date))}${request.end_date && request.end_date !== request.start_date ? ` s/d ${escapeHtml(dateText(request.end_date))}` : ""}</p>
      <p class="text-[11px] text-slate-500">Pemohon: <b>${escapeHtml(request.nama_pemohon || "-")}</b> • ${escapeHtml(request.branch || "-")}</p>
      <p class="text-[11px] text-slate-500">Sales: ${escapeHtml(sales.join(", ") || "-")}</p>
      <p class="text-[11px] text-slate-500">Toko: ${escapeHtml(stores.slice(0, 4).join(", ") || "-")}${stores.length > 4 ? ` +${stores.length - 4}` : ""}</p>
      <p class="text-[11px] text-slate-600 mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 border border-slate-100">${escapeHtml(request.purpose_notes || "-")}</p>
      <div class="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        <button type="button" data-action="detail" data-id="${escapeHtml(request.id)}" class="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1">Detail</button>
        ${actionable ? `
          <button type="button" data-action="reject-request" data-id="${escapeHtml(request.id)}" class="text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">Tolak</button>
          <button type="button" data-action="approve-request" data-id="${escapeHtml(request.id)}" class="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg">Setujui</button>` : ""}
      </div>
    </div>`;
}

function openApprovalDialog(requestId, action) {
  const request = state.requests.find(row => row.id === requestId);
  if (!request) return;
  if (!canApproveStage(request)) { toast("Anda bukan approver pada tahap ini.", "warning"); return; }
  const approve = action === "approve";
  const stageNow = upper(request.approval_status);
  const nextStatus = stageNow === APPROVAL_STATUS.PENDING_ATASAN
    ? (approve ? "Menunggu HRD/HRGA" : "Ditolak")
    : (approve ? "Disetujui Final" : "Ditolak");
  openModal({
    title: `${approve ? "Setujui" : "Tolak"} ${request.document_number || "Pengajuan"}`,
    bodyHtml: `
      <form id="kl-approval-form" data-id="${escapeHtml(requestId)}" data-action="${approve ? "approve" : "reject"}" class="space-y-3">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
          <p><b>Pemohon:</b> ${escapeHtml(request.nama_pemohon || "-")} (${escapeHtml(request.nik_pemohon || "-")})</p>
          <p><b>Kunjungan:</b> ${escapeHtml(typeLabel(request.visit_type))} • ${escapeHtml(dateText(request.start_date))}</p>
          <p><b>Status sekarang:</b> ${escapeHtml(approvalLabel(stageNow))} → <b>${escapeHtml(nextStatus)}</b></p>
        </div>
        <label class="block">
          <span class="text-xs font-semibold text-slate-600">Catatan ${approve ? "(opsional)" : "*"}</span>
          <textarea name="note" rows="3" ${approve ? "" : "required"} placeholder="${approve ? "Contoh: Disetujui, koordinasi jadwal dengan sales." : "Alasan penolakan agar pemohon dapat memperbaiki."}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
        </label>
      </form>`,
    size: "md",
    footerHtml: `
      <button type="button" data-action="close-modal" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Batal</button>
      <button type="submit" form="kl-approval-form" class="px-4 py-2 rounded-lg text-sm font-semibold text-white ${approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}">${approve ? "Setujui" : "Tolak"}</button>`
  });
}

async function submitApproval(form) {
  const requestId = form.dataset.id;
  const action = form.dataset.action;
  const note = String(new FormData(form).get("note") || "").trim();
  const request = state.requests.find(row => row.id === requestId);
  if (!request) return;
  if (action === "reject" && !note) { toast("Catatan penolakan wajib diisi.", "warning"); return; }

  const nowIso = new Date().toISOString();
  const stageNow = upper(request.approval_status);
  const isStage1 = stageNow === APPROVAL_STATUS.PENDING_ATASAN;
  const nextStatus = action === "reject"
    ? APPROVAL_STATUS.REJECTED
    : (isStage1 ? APPROVAL_STATUS.PENDING_HRD : APPROVAL_STATUS.APPROVED_FINAL);
  const entry = {
    stage: isStage1 ? "ATASAN" : "HRD",
    action: action === "reject" ? "REJECTED" : (isStage1 ? "APPROVED_ATASAN" : "APPROVED_FINAL"),
    by: state.session?.nama || state.session?.username || "",
    by_nik: state.session?.nik || "",
    by_role: roleOf(),
    at: nowIso,
    note
  };
  const patch = {
    approval_status: nextStatus,
    approval_history: [...(request.approval_history || []), entry],
    updated_at: nowIso
  };
  if (isStage1 && action === "approve") {
    patch.atasan_approved_at = nowIso;
    patch.atasan_approved_by = entry.by;
    patch.atasan_note = note;
  }
  if (nextStatus === APPROVAL_STATUS.APPROVED_FINAL) {
    patch.hrd_approved_at = nowIso;
    patch.hrd_approved_by = entry.by;
    patch.hrd_note = note;
    patch.report_status = request.report_status || REPORT_STATUS.PENDING_REPORT;
    patch.report_deadline_at = request.report_deadline_at || computeReportDeadline(request.end_date || request.start_date);
  }
  if (nextStatus === APPROVAL_STATUS.REJECTED) {
    patch.rejected_at = nowIso;
    patch.rejected_by = entry.by;
    patch.rejection_note = note;
  }

  const submitBtn = form.closest("#app-modal-backdrop")?.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Memproses..."; }
  try {
    await fsUpdate(COL.FIELD_VISIT_REQUESTS, requestId, patch);
    Object.assign(request, patch);
    closeModal();
    toast(action === "reject" ? "Pengajuan ditolak." : (isStage1 ? "Disetujui, menunggu HRD." : "Disetujui final. Laporan dapat diisi."), "success");
    notifyEvent(requestId, action === "reject" ? "rejected" : (isStage1 ? "approved_atasan" : "approved_final"), note);
    render();
  } catch (error) {
    console.error("submitApproval:", error);
    toast(error?.message || "Gagal menyimpan keputusan.", "error");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = action === "reject" ? "Tolak" : "Setujui"; }
  }
}

/* ---------------------------------------------------------------------
 * DETAIL PENGAJUAN
 * ------------------------------------------------------------------- */
function openDetail(requestId) {
  const request = state.requests.find(row => row.id === requestId);
  if (!request) return;
  const report = reportFor(requestId);
  const items = itemsFor(requestId);
  const followups = followupsFor(requestId);
  const sales = Array.isArray(request.planned_sales_names) ? request.planned_sales_names : [];
  const stores = Array.isArray(request.planned_store_names) ? request.planned_store_names : [];
  const timeline = Array.isArray(request.approval_history) ? request.approval_history : [];
  const reportStatus = reportStatusOf(request);
  openModal({
    title: `Detail ${request.document_number || "Kunjungan"}`,
    size: "lg",
    bodyHtml: `
      <div class="space-y-4 text-sm">
        <div class="flex flex-wrap gap-1.5">
          ${badge(approvalLabel(request.approval_status), APPROVAL_TONE[upper(request.approval_status)] || "slate")}
          ${upper(request.approval_status) === APPROVAL_STATUS.APPROVED_FINAL ? badge(reportLabel(reportStatus), REPORT_TONE[reportStatus] || "slate") : ""}
        </div>
        <div class="grid sm:grid-cols-2 gap-2 text-xs">
          ${detailRow("Jenis", typeLabel(request.visit_type))}
          ${detailRow("Tanggal", `${dateText(request.start_date)}${request.end_date && request.end_date !== request.start_date ? ` s/d ${dateText(request.end_date)}` : ""}`)}
          ${detailRow("Cabang / Area", request.branch || "-")}
          ${detailRow("Pemohon", `${request.nama_pemohon || "-"}${request.nik_pemohon ? ` (${request.nik_pemohon})` : ""}`)}
          ${detailRow("Atasan Langsung", request.atasan_nama || "-")}
          ${detailRow("Batas Laporan", request.report_deadline_at ? `${dateText(request.report_deadline_at)} 10:00 WIB` : "-")}
        </div>
        <div class="text-xs"><p class="font-semibold text-slate-600 mb-1">Tujuan &amp; Atensi</p><p class="rounded-lg bg-slate-50 border border-slate-200 p-3 text-slate-700 whitespace-pre-line">${escapeHtml(request.purpose_notes || "-")}</p></div>
        <div class="grid sm:grid-cols-2 gap-3 text-xs">
          <div><p class="font-semibold text-slate-600 mb-1">Sales Didampingi</p><p class="text-slate-700">${escapeHtml(sales.join(", ") || "-")}</p></div>
          <div><p class="font-semibold text-slate-600 mb-1">Toko Rencana</p><p class="text-slate-700">${escapeHtml(stores.join(", ") || "-")}</p></div>
        </div>
        ${timeline.length ? `
          <div>
            <p class="font-semibold text-slate-600 text-xs mb-1.5">Jejak Persetujuan</p>
            <div class="space-y-1.5">${timeline.map(entry => `
              <div class="rounded-lg border border-slate-200 px-3 py-2 text-[11px]">
                <p class="font-semibold text-slate-700">${escapeHtml(entry.stage || "-")} • ${escapeHtml(entry.action || "-")}</p>
                <p class="text-slate-500">${escapeHtml(entry.by || "-")} • ${escapeHtml(entry.at ? dateText(entry.at) : "-")}</p>
                ${entry.note ? `<p class="text-slate-600 mt-0.5">${escapeHtml(entry.note)}</p>` : ""}
              </div>`).join("")}</div>
          </div>` : ""}
        ${report ? renderReportDetail(report, items, followups) : ""}
      </div>`,
    footerHtml: canApproveStage(request)
      ? `<button type="button" data-action="detail-reject" data-id="${escapeHtml(request.id)}" class="px-4 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50">Tolak</button>
         <button type="button" data-action="detail-approve" data-id="${escapeHtml(request.id)}" class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white">Setujui</button>`
      : (isReportable(request) && canWriteRequest(request)
        ? `<button type="button" data-action="fill-report" data-id="${escapeHtml(request.id)}" class="px-4 py-2 rounded-lg text-sm font-semibold bg-maroon-700 hover:bg-maroon-800 text-white">Isi Laporan</button>`
        : "")
  });
}

function detailRow(label, value) {
  return `<div class="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5"><p class="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">${escapeHtml(label)}</p><p class="text-slate-700 font-semibold">${escapeHtml(value || "-")}</p></div>`;
}

function renderReportDetail(report, items, followups) {
  return `
    <div class="border-t border-slate-200 pt-3">
      <div class="flex items-center justify-between gap-2">
        <p class="font-semibold text-slate-700 text-xs">Laporan Hasil Kunjungan</p>
        ${report.is_late ? badge("Terlambat", "red") : badge("Tepat Waktu", "green")}
      </div>
      <p class="text-[11px] text-slate-500 mt-0.5">Dikirim ${escapeHtml(report.submitted_at ? dateText(report.submitted_at) : "-")} oleh ${escapeHtml(report.nama_pelapor || "-")}</p>
      <p class="text-xs text-slate-700 mt-2 whitespace-pre-line">${escapeHtml(report.executive_summary || "-")}</p>
      <div class="mt-2 space-y-1.5">
        ${items.map(item => `
          <div class="rounded-lg border border-slate-200 p-2.5 text-[11px]">
            <p class="font-semibold text-slate-700">${escapeHtml(item.store_name || item.store_id || "-")} • ${escapeHtml(item.visit_outcome || "-")}</p>
            <p class="text-slate-600 whitespace-pre-line">${escapeHtml(item.findings_notes || item.skip_reason || "-")}</p>
            ${Array.isArray(item.photo_urls) && item.photo_urls.length ? `<p class="mt-1 flex flex-wrap gap-1">${item.photo_urls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="underline text-maroon-700">Foto ${index + 1}</a>`).join(" • ")}</p>` : ""}
          </div>`).join("") || `<p class="text-[11px] text-slate-500">Tidak ada rincian toko.</p>`}
      </div>
      ${followups.length ? `<div class="mt-2"><p class="text-[11px] font-semibold text-slate-600 mb-1">Tindak Lanjut</p>${followups.map(row => `<p class="text-[11px] text-slate-600">• ${escapeHtml(row.action_type === "ESKALASI_MANAJEMEN" ? `Eskalasi ${row.division || ""}` : "Tindak lanjut mandiri")} — ${escapeHtml(row.notes || "-")} <b>(${escapeHtml(row.status || "OPEN")})</b></p>`).join("")}</div>` : ""}
      ${report.needs_escalation ? `<div class="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-800"><b>Eskalasi ${escapeHtml(report.escalation_division || "")}:</b> ${escapeHtml(report.escalation_notes || "-")}</div>` : ""}
    </div>`;
}

/* ---------------------------------------------------------------------
 * TAB: LAPORAN
 * ------------------------------------------------------------------- */
function renderLaporanPanel() {
  if (state.reportDraft) {
    const request = state.requests.find(row => row.id === state.reportDraft.requestId);
    if (request) return renderReportForm(request);
    state.reportDraft = null;
  }
  const rows = requestsForMe().filter(row => upper(row.approval_status) === APPROVAL_STATUS.APPROVED_FINAL);
  const todo = rows.filter(isReportable);
  const done = rows.filter(row => upper(row.report_status) === REPORT_STATUS.SUBMITTED);
  const overdue = rows.filter(row => reportStatusOf(row) === REPORT_STATUS.OVERDUE && upper(row.report_status) !== REPORT_STATUS.SUBMITTED);
  return `
    <div class="space-y-4">
      <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div class="flex items-center justify-between gap-2 mb-1">
          <h2 class="font-bold text-slate-800">Wajib Dilaporkan</h2>
          <span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">${todo.length + overdue.length}</span>
        </div>
        <p class="text-xs text-slate-500 mb-3">Laporan maksimal H+1 pukul 10:00 WIB. Pengingat dikirim 16:00 WIB hari kunjungan dan 08:00 WIB berikutnya.</p>
        ${(todo.length || overdue.length) ? `<div class="space-y-2.5">${[...overdue, ...todo.filter(row => !overdue.includes(row))].map(renderLaporanCard).join("")}</div>` : `<p class="text-xs text-slate-500">Semua laporan sudah lengkap. 🎉</p>`}
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <h2 class="font-bold text-slate-800 mb-1">Riwayat Laporan</h2>
        <p class="text-xs text-slate-500 mb-3">Laporan yang sudah dikirim beserta tindak lanjutnya.</p>
        ${done.length ? `<div class="space-y-2.5">${done.map(renderLaporanCard).join("")}</div>` : `<p class="text-xs text-slate-500">Belum ada laporan terkirim.</p>`}
      </div>
    </div>`;
}

function renderLaporanCard(request) {
  const reportStatus = reportStatusOf(request);
  const report = reportFor(request.id);
  const late = report?.is_late;
  const actionable = isReportable(request) && canWriteRequest(request);
  return `
    <div class="rounded-xl border ${reportStatus === REPORT_STATUS.OVERDUE ? "border-red-200 bg-red-50/40" : "border-slate-200"} p-3.5">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-bold text-slate-800">${escapeHtml(request.document_number || "-")}</p>
        ${badge(reportLabel(reportStatus), REPORT_TONE[reportStatus] || "slate")}
        ${late ? badge("Terlambat", "red") : ""}
      </div>
      <p class="text-xs text-slate-500 mt-1">${escapeHtml(typeLabel(request.visit_type))} • ${escapeHtml(dateText(request.start_date))} • ${escapeHtml(request.branch || "-")}</p>
      <p class="text-[11px] text-slate-500">Batas: ${escapeHtml(request.report_deadline_at ? `${dateText(request.report_deadline_at)} 10:00 WIB` : "-")}</p>
      ${report ? `<p class="text-[11px] text-slate-600 mt-1 line-clamp-2">${escapeHtml(report.executive_summary || "-")}</p>` : ""}
      <div class="mt-2 flex justify-end gap-2">
        <button type="button" data-action="detail" data-id="${escapeHtml(request.id)}" class="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1">Detail</button>
        ${actionable ? `<button type="button" data-action="fill-report" data-id="${escapeHtml(request.id)}" class="text-xs font-semibold text-white bg-maroon-700 hover:bg-maroon-800 px-3 py-1.5 rounded-lg">Isi Laporan</button>` : ""}
      </div>
    </div>`;
}

function storeCardHtml(index, request, preset = {}) {
  const plannedSales = (request.planned_sales_niks || []).map(nik => ({ nik, nama: salesByNik(nik) ? employeeName(salesByNik(nik)) : nik }));
  const storeOptions = activeStores().map(row => `<option value="${escapeHtml(row.store_code)}" ${String(preset.store_id) === String(row.store_code) ? "selected" : ""}>${escapeHtml(row.store_name || "-")} (${escapeHtml(row.store_code || "-")})</option>`).join("");
  return `
    <div class="kl-store-card rounded-xl border border-slate-200 p-3.5 space-y-2.5" data-card="${index}">
      <div class="flex items-center justify-between">
        <p class="text-xs font-bold text-slate-700">Kartu Toko #<span data-card-number>${index + 1}</span></p>
        <button type="button" data-action="remove-store-card" class="text-[11px] font-semibold text-red-600 hover:text-red-800">Hapus</button>
      </div>
      <label class="block">
        <span class="text-[11px] font-semibold text-slate-600">Toko *</span>
        <select name="store_id" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">— Pilih toko —</option>
          ${storeOptions}
        </select>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[11px] font-semibold text-slate-600">Sales</span>
          <select name="sales_nik" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">—</option>
            ${plannedSales.map(row => `<option value="${escapeHtml(row.nik)}" ${String(preset.sales_nik) === String(row.nik) ? "selected" : ""}>${escapeHtml(row.nama)}</option>`).join("")}
          </select>
        </label>
        <label class="block">
          <span class="text-[11px] font-semibold text-slate-600">Status Kunjungan *</span>
          <select name="visit_outcome" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">— Pilih —</option>
            ${VISIT_OUTCOME_OPTIONS.map(option => `<option value="${option.value}" ${String(preset.visit_outcome || "").toUpperCase() === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="block kl-skip-reason hidden">
        <span class="text-[11px] font-semibold text-slate-600">Alasan tidak terkunjungi *</span>
        <input type="text" name="skip_reason" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Contoh: toko tutup, akses jalan ditutup.">
      </label>
      <label class="block">
        <span class="text-[11px] font-semibold text-slate-600">Temuan / Catatan</span>
        <textarea name="findings_notes" rows="2" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Display, stok, harga, kompetitor, peluang order.">${escapeHtml(preset.findings_notes || "")}</textarea>
      </label>
      <div class="kl-photo-block">
        <span class="text-[11px] font-semibold text-slate-600">Foto Bukti <span class="font-normal text-slate-400">(wajib bila terkunjungi)</span></span>
        <input type="file" accept="image/*" multiple data-photo-card="${index}" class="mt-1 block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-maroon-50 file:text-maroon-700 file:text-xs file:font-semibold">
        <div class="mt-1.5 flex flex-wrap gap-1.5" data-photo-preview="${index}"></div>
        <p class="text-[10px] text-slate-400 mt-1">Foto dikompres otomatis sebelum diunggah.</p>
      </div>
    </div>`;
}

function renderReportForm(request) {
  state.reportDraft = state.reportDraft || { requestId: request.id, photos: {}, seq: 0 };
  if (!state.reportDraft.photos) state.reportDraft.photos = {};
  if (state.reportDraft.seq === undefined) state.reportDraft.seq = 0;
  const plannedStores = Array.isArray(request.planned_store_ids) ? request.planned_store_ids : [];
  const presets = plannedStores.length
    ? plannedStores.map(storeId => ({ store_id: storeId }))
    : [{}];
  presets.forEach((preset, index) => { if (!state.reportDraft.photos[index]) state.reportDraft.photos[index] = []; });
  state.reportDraft.seq = Math.max(state.reportDraft.seq, presets.length);
  const cards = presets.map((preset, index) => storeCardHtml(index, request, preset)).join("");
  return `
    <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div class="flex items-start justify-between gap-2 mb-3">
        <div>
          <button type="button" data-action="close-report" class="text-xs font-semibold text-slate-500 hover:text-maroon-700 mb-1">← Kembali</button>
          <h2 class="font-bold text-slate-800">Laporan ${escapeHtml(request.document_number || "Kunjungan")}</h2>
          <p class="text-xs text-slate-500">${escapeHtml(typeLabel(request.visit_type))} • ${escapeHtml(dateText(request.start_date))} • ${escapeHtml(request.branch || "-")}</p>
        </div>
        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">Batas ${escapeHtml(dateText(request.report_deadline_at))} 10:00</span>
      </div>

      <form id="kl-report-form" data-id="${escapeHtml(request.id)}" data-seq="${state.reportDraft.seq}" class="space-y-4">
        <div class="space-y-2.5" id="kl-store-cards">${cards}</div>
        <button type="button" data-action="add-store-card" class="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-600 hover:border-maroon-400 hover:text-maroon-700">+ Tambah Kartu Toko</button>

        <label class="block">
          <span class="text-xs font-semibold text-slate-600">Ringkasan Eksekutif *</span>
          <textarea name="executive_summary" rows="3" required placeholder="Kesimpulan kunjungan, kondisi area, dan rekomendasi utama." class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
        </label>

        <div class="rounded-xl border border-slate-200 p-3 space-y-2">
          <label class="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" name="needs_escalation" class="mt-0.5 rounded border-slate-300">
            <span><b>Perlu eskalasi ke manajemen</b><br><span class="text-slate-500">Centang bila isu membutuhkan keputusan lintas divisi.</span></span>
          </label>
          <div class="kl-escalation-fields hidden space-y-2">
            <select name="escalation_division" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">— Pilih divisi tujuan —</option>
              ${ESCALATION_DIVISIONS.map(division => `<option value="${escapeHtml(division)}">${escapeHtml(division)}</option>`).join("")}
            </select>
            <textarea name="escalation_notes" rows="2" placeholder="Detail isu & rekomendasi solusi." class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
          </div>
        </div>

        <label class="block">
          <span class="text-xs font-semibold text-slate-600">Tindak Lanjut / Action Plan</span>
          <textarea name="followup_notes" rows="2" placeholder="Contoh: coaching sales, perbaikan display, follow-up order." class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
        </label>

        <button type="submit" class="w-full rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-bold py-3">Kirim Laporan</button>
        <p class="text-[10.5px] text-slate-400 text-center">Setelah dikirim, laporan tidak dapat diubah. Pastikan foto &amp; temuan sudah benar.</p>
      </form>
    </div>`;
}

function mountReportForm() {
  // Form dirender langsung di panel; listener global sudah menangani perubahan.
}

function addStoreCard() {
  const form = state.container?.querySelector("#kl-report-form");
  const wrapper = form?.querySelector("#kl-store-cards");
  const request = state.requests.find(row => row.id === state.reportDraft?.requestId);
  if (!form || !wrapper || !request) return;
  const seq = (state.reportDraft.seq = Number(form.dataset.seq || 0) || 0);
  form.dataset.seq = seq + 1;
  state.reportDraft.photos[seq] = [];
  wrapper.insertAdjacentHTML("beforeend", storeCardHtml(seq, request, {}));
}

function removeStoreCard(button) {
  const card = button.closest(".kl-store-card");
  if (!card) return;
  const wrapper = card.parentElement;
  if (wrapper && wrapper.querySelectorAll(".kl-store-card").length <= 1) {
    toast("Minimal 1 kartu toko harus diisi.", "warning");
    return;
  }
  card.remove();
  renumberStoreCards();
}

function renumberStoreCards() {
  state.container?.querySelectorAll("#kl-store-cards .kl-store-card").forEach((card, index) => {
    const label = card.querySelector("[data-card-number]");
    if (label) label.textContent = String(index + 1);
  });
}

async function handlePhotoUpload(input) {
  const cardIndex = input.dataset.photoCard;
  const files = [...(input.files || [])].slice(0, 4);
  if (!files.length) return;
  const request = state.requests.find(row => row.id === state.reportDraft?.requestId);
  const docNumber = request?.document_number || "KUNJUNGAN";
  if (!state.reportDraft.photos[cardIndex]) state.reportDraft.photos[cardIndex] = [];
  input.disabled = true;
  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      const url = await uploadFileToDrive(compressed, `Kunjungan Lapangan/${docNumber}`);
      state.reportDraft.photos[cardIndex].push(url);
      renderPhotoPreview(cardIndex);
    } catch (error) {
      console.error("upload foto kunjungan:", error);
      toast(error?.message || "Foto gagal diunggah.", "error");
    }
  }
  input.disabled = false;
  input.value = "";
}

function renderPhotoPreview(cardIndex) {
  const holder = state.container?.querySelector(`[data-photo-preview="${cardIndex}"]`);
  if (!holder) return;
  const urls = state.reportDraft.photos[cardIndex] || [];
  holder.innerHTML = urls.map((url, index) => `
    <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] px-2 py-0.5">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="underline">Foto ${index + 1}</a>
      <button type="button" data-action="remove-photo" data-card="${cardIndex}" data-index="${index}" class="font-bold text-emerald-700">×</button>
    </span>`).join("");
}

function compressImage(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) { reject(new Error("File harus berupa gambar.")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca foto."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Foto tidak dapat diproses."));
      image.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(image.width || 1, image.height || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((image.width || 1) * scale);
        canvas.height = Math.round((image.height || 1) * scale);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error("Kompresi foto gagal.")); return; }
          const name = String(file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
          resolve(new File([blob], name, { type: "image/jpeg" }));
        }, "image/jpeg", quality);
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

async function submitReport(form) {
  const requestId = form.dataset.id;
  const request = state.requests.find(row => row.id === requestId);
  if (!request) return;
  const formData = new FormData(form);
  const cards = [...form.querySelectorAll(".kl-store-card")];
  const items = cards.map(card => {
    const index = card.dataset.card;
    const outcome = upper(card.querySelector('[name="visit_outcome"]')?.value);
    const storeId = String(card.querySelector('[name="store_id"]')?.value || "").trim();
    const store = storeById(storeId);
    const salesNik = String(card.querySelector('[name="sales_nik"]')?.value || "").trim();
    return {
      store_id: storeId,
      store_code: store?.store_code || storeId,
      store_name: store?.store_name || "",
      sales_nik: salesNik,
      sales_name: salesNik ? (salesByNik(salesNik) ? employeeName(salesByNik(salesNik)) : salesNik) : "",
      visit_outcome: outcome,
      skip_reason: String(card.querySelector('[name="skip_reason"]')?.value || "").trim(),
      findings_notes: String(card.querySelector('[name="findings_notes"]')?.value || "").trim(),
      photo_urls: [...(state.reportDraft.photos[index] || [])]
    };
  });
  const payload = {
    items,
    executive_summary: String(formData.get("executive_summary") || "").trim(),
    needs_escalation: formData.get("needs_escalation") === "on",
    escalation_division: String(formData.get("escalation_division") || "").trim(),
    escalation_notes: String(formData.get("escalation_notes") || "").trim(),
    followup_notes: String(formData.get("followup_notes") || "").trim()
  };
  const errors = validateVisitReport(payload);
  if (errors.length) { toast(errors[0], "warning"); return; }
  if (!request.report_deadline_at) request.report_deadline_at = computeReportDeadline(request.end_date || request.start_date);
  const submittedAt = new Date().toISOString();
  const isLate = new Date(request.report_deadline_at).getTime() < Date.now();
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Mengirim..."; }

  try {
    const reportPayload = {
      visit_request_id: requestId,
      document_number: request.document_number || "",
      nama_pelapor: state.session?.nama || state.session?.username || "-",
      nik_pelapor: state.session?.nik || "",
      username_pelapor: state.session?.username || "",
      submitted_at: submittedAt,
      is_late: isLate,
      executive_summary: payload.executive_summary,
      needs_escalation: payload.needs_escalation,
      escalation_division: payload.escalation_division,
      escalation_notes: payload.escalation_notes,
      followup_notes: payload.followup_notes,
      items_count: items.length,
      photo_count: items.reduce((total, item) => total + item.photo_urls.length, 0),
      branch: request.branch || "",
      start_date: request.start_date || "",
      end_date: request.end_date || ""
    };
    const reportId = await fsAdd(COL.FIELD_VISIT_REPORTS, reportPayload);
    const itemRecords = [];
    for (const item of items) {
      const record = await fsAdd(COL.FIELD_VISIT_REPORT_ITEMS, {
        ...item,
        visit_request_id: requestId,
        report_id: reportId,
        branch: request.branch || "",
        reported_at: submittedAt
      });
      itemRecords.push({ id: record, ...item, visit_request_id: requestId, report_id: reportId });
    }

    const followupRecords = [];
    const followupBase = {
      visit_request_id: requestId,
      report_id: reportId,
      document_number: request.document_number || "",
      status: "OPEN",
      created_by: state.session?.nama || "",
      created_by_nik: state.session?.nik || "",
      due_date: request.report_deadline_at ? toDateOnly(request.report_deadline_at) : "",
      created_at: submittedAt
    };
    const manualFollowup = payload.followup_notes || items.map(item => item.findings_notes).filter(Boolean).join(" | ");
    const followupId = await fsAdd(COL.FIELD_VISIT_FOLLOWUPS, {
      ...followupBase,
      action_type: "MANDIRI",
      division: "",
      notes: manualFollowup || "Tindak lanjut hasil kunjungan.",
      owner: state.session?.nama || ""
    });
    followupRecords.push({ id: followupId, ...followupBase, action_type: "MANDIRI", notes: manualFollowup });
    if (payload.needs_escalation) {
      const escalationId = await fsAdd(COL.FIELD_VISIT_FOLLOWUPS, {
        ...followupBase,
        action_type: "ESKALASI_MANAJEMEN",
        division: payload.escalation_division,
        notes: payload.escalation_notes,
        owner: payload.escalation_division
      });
      followupRecords.push({ id: escalationId, ...followupBase, action_type: "ESKALASI_MANAJEMEN", division: payload.escalation_division, notes: payload.escalation_notes });
    }

    const patch = {
      report_status: REPORT_STATUS.SUBMITTED,
      report_id: reportId,
      report_submitted_at: submittedAt,
      report_is_late: isLate,
      report_summary: payload.executive_summary,
      needs_escalation: payload.needs_escalation,
      escalation_division: payload.escalation_division,
      escalation_notes: payload.escalation_notes,
      updated_at: submittedAt
    };
    await fsUpdate(COL.FIELD_VISIT_REQUESTS, requestId, patch);
    Object.assign(request, patch);

    state.reports.push({ id: reportId, ...reportPayload });
    state.items.push(...itemRecords);
    state.followups.push(...followupRecords);
    state.reportDraft = null;
    toast("Laporan kunjungan terkirim. Terima kasih.", "success");
    notifyEvent(requestId, "report_submitted", payload.executive_summary.slice(0, 300));
    state.tab = "laporan";
    render();
  } catch (error) {
    console.error("submitReport:", error);
    toast(error?.message || "Laporan gagal dikirim.", "error");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Kirim Laporan"; }
  }
}

function startReport(requestId) {
  const request = state.requests.find(row => row.id === requestId);
  if (!request) return;
  if (!isReportable(request)) { toast("Laporan belum dapat diisi (menunggu approval final atau tanggal kunjungan).", "warning"); return; }
  if (!canWriteRequest(request)) { toast("Hanya pemohon yang dapat mengisi laporan ini.", "warning"); return; }
  state.reportDraft = { requestId, photos: {}, seq: 0 };
  state.tab = "laporan";
  closeModal();
  render();
  setTimeout(() => state.container?.querySelector("#kl-report-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

/* ---------------------------------------------------------------------
 * TAB: MONITORING & REKAP
 * ------------------------------------------------------------------- */
function filteredRequests() {
  const filters = state.filters;
  const keyword = upper(filters.search);
  return requestsForMe().filter(row => {
    if (filters.branch && upper(row.branch) !== upper(filters.branch)) return false;
    if (filters.type && upper(row.visit_type) !== upper(filters.type)) return false;
    if (filters.report && reportStatusOf(row) !== upper(filters.report)) return false;
    if (keyword) {
      const haystack = upper([
        row.document_number, row.nama_pemohon, row.nik_pemohon, row.branch,
        (row.planned_sales_names || []).join(" "), (row.planned_store_names || []).join(" ")
      ].join(" "));
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function renderMonitoringPanel() {
  const rows = filteredRequests();
  const summary = summarizeFieldVisits(rows, state.reports, state.followups);
  const branches = [...new Set(state.requests.map(row => upper(row.branch)).filter(Boolean))].sort();
  return `
    <div class="space-y-4">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${monitorCard("Total", summary.total, "pengajuan")}
        ${monitorCard("Selesai Lapor", summary.submitted, `${summary.on_time_rate ?? "-"}% tepat waktu`, "green")}
        ${monitorCard("Terlambat", summary.overdue, "perlu tindak lanjut", "red")}
        ${monitorCard("Tindak Lanjut", summary.open_followups, `${summary.escalation_open} eskalasi terbuka`, "amber")}
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
          <div>
            <h2 class="font-bold text-slate-800">Rekap Kunjungan Lapangan</h2>
            <p class="text-xs text-slate-500">Filter, pantau SLA laporan, lalu unduh rekap.</p>
          </div>
          <button type="button" data-action="export-csv" class="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg">
            ${icon("doc-plus", "w-4 h-4")} Export CSV
          </button>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          <input type="text" data-filter="monitor-search" value="${escapeHtml(state.filters.search)}" placeholder="Cari nomor / nama / toko..." class="rounded-lg border border-slate-300 px-3 py-2 text-xs">
          <select data-filter="monitor-branch" class="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white">
            <option value="">Semua cabang</option>
            ${branches.map(branch => `<option value="${escapeHtml(branch)}" ${upper(state.filters.branch) === branch ? "selected" : ""}>${escapeHtml(branch)}</option>`).join("")}
          </select>
          <select data-filter="monitor-type" class="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white">
            <option value="">Semua jenis</option>
            ${VISIT_TYPE_OPTIONS.map(option => `<option value="${option.value}" ${upper(state.filters.type) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
          <select data-filter="monitor-report" class="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white">
            <option value="">Semua status laporan</option>
            ${Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${upper(state.filters.report) === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
        </div>
        ${rows.length ? `
          <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-slate-500 border-b border-slate-200">
                  <th class="py-2 pr-3 font-semibold">Nomor</th>
                  <th class="py-2 pr-3 font-semibold">Tanggal</th>
                  <th class="py-2 pr-3 font-semibold">Jenis</th>
                  <th class="py-2 pr-3 font-semibold">Cabang</th>
                  <th class="py-2 pr-3 font-semibold">Pemohon</th>
                  <th class="py-2 pr-3 font-semibold">Approval</th>
                  <th class="py-2 pr-3 font-semibold">Laporan</th>
                  <th class="py-2 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(row => `<tr class="border-b border-slate-50 hover:bg-slate-50/60">
                  <td class="py-2 pr-3 font-semibold text-slate-800">${escapeHtml(row.document_number || "-")}</td>
                  <td class="py-2 pr-3 text-slate-600">${escapeHtml(dateText(row.start_date))}</td>
                  <td class="py-2 pr-3 text-slate-600">${escapeHtml(typeLabel(row.visit_type))}</td>
                  <td class="py-2 pr-3 text-slate-600">${escapeHtml(row.branch || "-")}</td>
                  <td class="py-2 pr-3 text-slate-600">${escapeHtml(row.nama_pemohon || "-")}</td>
                  <td class="py-2 pr-3">${badge(approvalLabel(row.approval_status), APPROVAL_TONE[upper(row.approval_status)] || "slate")}</td>
                  <td class="py-2 pr-3">${badge(reportLabel(reportStatusOf(row)), REPORT_TONE[reportStatusOf(row)] || "slate")}</td>
                  <td class="py-2"><button type="button" data-action="detail" data-id="${escapeHtml(row.id)}" class="text-maroon-700 font-semibold">Detail</button></td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2">
            ${rows.map(row => `
              <button type="button" data-action="detail" data-id="${escapeHtml(row.id)}" class="w-full text-left rounded-xl border border-slate-200 p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-bold text-slate-800">${escapeHtml(row.document_number || "-")}</p>
                  ${badge(reportLabel(reportStatusOf(row)), REPORT_TONE[reportStatusOf(row)] || "slate")}
                </div>
                <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(dateText(row.start_date))} • ${escapeHtml(row.branch || "-")} • ${escapeHtml(row.nama_pemohon || "-")}</p>
              </button>`).join("")}
          </div>` : emptyState("Tidak ada data", "Ubah filter atau buat pengajuan baru.")}
      </div>
    </div>`;
}

function monitorCard(label, value, sub, tone = "slate") {
  const tones = {
    slate: "bg-white border-slate-200 text-slate-800",
    green: "bg-emerald-50 border-emerald-200 text-emerald-900",
    red: "bg-red-50 border-red-200 text-red-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900"
  };
  return `<div class="rounded-2xl border p-3.5 ${tones[tone] || tones.slate}">
    <p class="text-[10.5px] font-bold uppercase tracking-wide opacity-70">${escapeHtml(label)}</p>
    <p class="text-2xl font-extrabold leading-tight mt-0.5">${Number(value || 0)}</p>
    <p class="text-[10.5px] opacity-70">${escapeHtml(sub)}</p>
  </div>`;
}

function exportCsv() {
  const rows = filteredRequests().map(request => {
    const report = reportFor(request.id);
    const followups = followupsFor(request.id);
    const escalation = followups.find(row => upper(row.action_type) === "ESKALASI_MANAJEMEN");
    return {
      document_number: request.document_number || "",
      visit_type_label: typeLabel(request.visit_type),
      start_date: request.start_date || "",
      end_date: request.end_date || "",
      branch: request.branch || "",
      nama_pemohon: request.nama_pemohon || "",
      nik_pemohon: request.nik_pemohon || "",
      approval_status_label: approvalLabel(request.approval_status),
      report_status_label: reportLabel(reportStatusOf(request)),
      report_deadline_at: request.report_deadline_at || "",
      sales_label: (request.planned_sales_names || []).join(", "),
      stores_label: (request.planned_store_names || []).join(", "),
      findings: report?.executive_summary || request.report_summary || "",
      followup_label: followups.filter(row => upper(row.action_type) !== "ESKALASI_MANAJEMEN").map(row => row.notes).filter(Boolean).join(" | "),
      escalation_label: escalation ? `${escalation.division || ""}: ${escalation.notes || ""}` : "-"
    };
  });
  const csv = buildVisitCsv(rows);
  downloadTextFile(`rekap-kunjungan-lapangan-${wibDateStr()}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  toast(`${rows.length} baris rekap diunduh.`, "success");
}

/* ---------------------------------------------------------------------
 * TAB: MASTER TOKO
 * ------------------------------------------------------------------- */
function renderMasterTokoPanel() {
  const keyword = upper(state.storeSearch || "");
  const rows = state.stores
    .filter(row => !keyword || upper([row.store_code, row.store_name, row.city_area, row.branch, row.assigned_sales_nik].join(" ")).includes(keyword))
    .sort((a, b) => String(a.store_name || "").localeCompare(String(b.store_name || "")));
  return `
    <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 class="font-bold text-slate-800">Master Toko</h2>
          <p class="text-xs text-slate-500">${state.stores.length} toko terdaftar • ${state.stores.filter(row => row.is_active !== false).length} aktif</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-action="download-store-template" class="text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg">Template CSV</button>
          <button type="button" data-action="import-store-csv" class="text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg">Import CSV</button>
          <button type="button" data-action="new-store" class="text-xs font-semibold text-white bg-maroon-700 hover:bg-maroon-800 px-3 py-2 rounded-lg">+ Tambah Toko</button>
        </div>
      </div>
      <input type="file" id="kl-store-import" class="hidden" accept=".csv,text/csv" data-import="store-csv">
      <input type="text" data-filter="store-search" value="${escapeHtml(state.storeSearch || "")}" placeholder="Cari kode, nama, area, cabang..." class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs mb-3">
      ${rows.length ? `
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-xs">
            <thead><tr class="text-left text-slate-500 border-b border-slate-200">
              <th class="py-2 pr-3 font-semibold">Kode</th>
              <th class="py-2 pr-3 font-semibold">Nama Toko</th>
              <th class="py-2 pr-3 font-semibold">Area</th>
              <th class="py-2 pr-3 font-semibold">Cabang</th>
              <th class="py-2 pr-3 font-semibold">Status</th>
              <th class="py-2 font-semibold">Aksi</th>
            </tr></thead>
            <tbody>
              ${rows.map(row => `<tr class="border-b border-slate-50">
                <td class="py-2 pr-3 font-semibold text-slate-700">${escapeHtml(row.store_code || "-")}</td>
                <td class="py-2 pr-3 text-slate-700">${escapeHtml(row.store_name || "-")}</td>
                <td class="py-2 pr-3 text-slate-600">${escapeHtml(row.city_area || "-")}</td>
                <td class="py-2 pr-3 text-slate-600">${escapeHtml(row.branch || "-")}</td>
                <td class="py-2 pr-3">${badge(row.is_active === false ? "Nonaktif" : "Aktif", row.is_active === false ? "slate" : "green")}</td>
                <td class="py-2">
                  <button type="button" data-action="edit-store" data-id="${escapeHtml(row.id)}" class="text-maroon-700 font-semibold mr-2">Edit</button>
                  <button type="button" data-action="delete-store" data-id="${escapeHtml(row.id)}" class="text-red-600 font-semibold">Hapus</button>
                </td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="md:hidden space-y-2">
          ${rows.map(row => `
            <div class="rounded-xl border border-slate-200 p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-bold text-slate-800">${escapeHtml(row.store_name || "-")}</p>
                ${badge(row.is_active === false ? "Nonaktif" : "Aktif", row.is_active === false ? "slate" : "green")}
              </div>
              <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(row.store_code || "-")} • ${escapeHtml(row.city_area || "-")} • ${escapeHtml(row.branch || "-")}</p>
              <div class="mt-2 flex justify-end gap-3">
                <button type="button" data-action="edit-store" data-id="${escapeHtml(row.id)}" class="text-[11px] font-semibold text-maroon-700">Edit</button>
                <button type="button" data-action="delete-store" data-id="${escapeHtml(row.id)}" class="text-[11px] font-semibold text-red-600">Hapus</button>
              </div>
            </div>`).join("")}
        </div>` : emptyState("Belum ada toko", "Tambah manual atau import CSV master toko.")}
    </div>`;
}

function openStoreForm(store = null) {
  const row = store || {};
  openModal({
    title: store ? "Edit Toko" : "Tambah Toko",
    size: "md",
    bodyHtml: `
      <form id="kl-store-form" data-id="${escapeHtml(row.id || "")}" class="space-y-3">
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block"><span class="text-xs font-semibold text-slate-600">Kode Toko *</span>
            <input type="text" name="store_code" required value="${escapeHtml(row.store_code || "")}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          </label>
          <label class="block"><span class="text-xs font-semibold text-slate-600">Nama Toko *</span>
            <input type="text" name="store_name" required value="${escapeHtml(row.store_name || "")}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          </label>
        </div>
        <label class="block"><span class="text-xs font-semibold text-slate-600">Alamat</span>
          <input type="text" name="address" value="${escapeHtml(row.address || "")}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        </label>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block"><span class="text-xs font-semibold text-slate-600">Kota / Area</span>
            <input type="text" name="city_area" value="${escapeHtml(row.city_area || "")}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          </label>
          <label class="block"><span class="text-xs font-semibold text-slate-600">Cabang</span>
            <select name="branch" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">${branchOptions(row.branch || state.session?.cabang || "")}</select>
          </label>
        </div>
        <label class="block"><span class="text-xs font-semibold text-slate-600">NIK Sales Penanggung Jawab</span>
          <input type="text" name="assigned_sales_nik" value="${escapeHtml(row.assigned_sales_nik || "")}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="is_active" ${row.is_active === false ? "" : "checked"} class="rounded border-slate-300"> Toko aktif
        </label>
      </form>`,
    footerHtml: `
      <button type="button" data-action="close-modal" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Batal</button>
      <button type="submit" form="kl-store-form" class="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-maroon-700 hover:bg-maroon-800">Simpan</button>`
  });
}

async function submitStore(form) {
  const formData = new FormData(form);
  const payload = {
    store_code: String(formData.get("store_code") || "").trim(),
    store_name: String(formData.get("store_name") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    city_area: String(formData.get("city_area") || "").trim(),
    branch: upper(formData.get("branch")),
    assigned_sales_nik: String(formData.get("assigned_sales_nik") || "").trim(),
    is_active: formData.get("is_active") === "on",
    updated_at: new Date().toISOString()
  };
  if (!payload.store_code || !payload.store_name) { toast("Kode dan nama toko wajib diisi.", "warning"); return; }
  const id = form.dataset.id;
  const duplicate = state.stores.find(row =>
    upper(row.store_code) === upper(payload.store_code) && String(row.id) !== String(id)
  );
  if (duplicate) { toast("Kode toko sudah digunakan.", "warning"); return; }
  const submitBtn = form.closest("#app-modal-backdrop")?.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Menyimpan..."; }
  try {
    if (id) {
      await fsUpdate(COL.MASTER_STORES, id, payload);
      const existing = state.stores.find(row => row.id === id);
      if (existing) Object.assign(existing, payload);
      toast("Toko diperbarui.", "success");
    } else {
      const newId = await fsAdd(COL.MASTER_STORES, { ...payload, created_at: new Date().toISOString() });
      state.stores.push({ id: newId, ...payload });
      toast("Toko ditambahkan.", "success");
    }
    closeModal();
    render();
  } catch (error) {
    console.error("submitStore:", error);
    toast(error?.message || "Gagal menyimpan toko.", "error");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Simpan"; }
  }
}

async function deleteStore(id) {
  const store = state.stores.find(row => row.id === id);
  if (!store) return;
  if (!window.confirm(`Hapus toko ${store.store_name || store.store_code}?`)) return;
  try {
    await fsDelete(COL.MASTER_STORES, id);
    state.stores = state.stores.filter(row => row.id !== id);
    toast("Toko dihapus.", "success");
    render();
  } catch (error) {
    console.error("deleteStore:", error);
    toast(error?.message || "Gagal menghapus toko.", "error");
  }
}

async function importStoreCsv(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const { rows, errors } = parseStoreCsv(text);
    if (!rows.length) { toast(errors[0] || "Tidak ada baris valid pada CSV.", "warning"); return; }
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const existing = state.stores.find(item => upper(item.store_code) === upper(row.store_code));
      const payload = { ...row, updated_at: new Date().toISOString() };
      if (existing) {
        await fsUpdate(COL.MASTER_STORES, existing.id, payload);
        Object.assign(existing, payload);
        updated += 1;
      } else {
        const id = await fsAdd(COL.MASTER_STORES, { ...payload, created_at: new Date().toISOString() });
        state.stores.push({ id, ...payload });
        created += 1;
      }
    }
    toast(`Import selesai: ${created} baru, ${updated} diperbarui${errors.length ? `, ${errors.length} baris dilewati` : ""}.`, errors.length ? "warning" : "success");
    render();
  } catch (error) {
    console.error("importStoreCsv:", error);
    toast(error?.message || "Import CSV gagal.", "error");
  }
}

/* ---------------------------------------------------------------------
 * EVENT HANDLERS
 * ------------------------------------------------------------------- */
function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target || !state.container?.contains(target)) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === "tab") {
    state.tab = normalizeTab(target.dataset.tab);
    state.reportDraft = state.tab === "laporan" ? state.reportDraft : null;
    try {
      const url = new URL(window.location.href);
      url.hash = `#kunjungan-lapangan?tab=${state.tab}`;
      window.history.replaceState(null, "", url.toString());
    } catch { /* abaikan */ }
    render();
    return;
  }
  if (action === "new-request") { openRequestForm(); return; }
  if (action === "detail") { openDetail(id); return; }
  if (action === "approve-request" || action === "detail-approve") { openApprovalDialog(id, "approve"); return; }
  if (action === "reject-request" || action === "detail-reject") { openApprovalDialog(id, "reject"); return; }
  if (action === "cancel-request") { cancelRequest(id); return; }
  if (action === "fill-report") { startReport(id); return; }
  if (action === "close-report") { state.reportDraft = null; render(); return; }
  if (action === "add-store-card") { addStoreCard(); return; }
  if (action === "remove-store-card") { removeStoreCard(target); return; }
  if (action === "remove-photo") {
    const card = String(target.dataset.card);
    const index = Number(target.dataset.index);
    if (state.reportDraft?.photos?.[card]) {
      state.reportDraft.photos[card].splice(index, 1);
      renderPhotoPreview(card);
    }
    return;
  }
  if (action === "export-csv") { exportCsv(); return; }
  if (action === "new-store") { openStoreForm(); return; }
  if (action === "edit-store") { openStoreForm(state.stores.find(row => row.id === id)); return; }
  if (action === "delete-store") { deleteStore(id); return; }
  if (action === "download-store-template") {
    downloadTextFile("template-master-toko.csv", `\uFEFF${storeCsvTemplate()}`, "text/csv;charset=utf-8");
    return;
  }
  if (action === "import-store-csv") {
    const input = state.container?.querySelector("#kl-store-import");
    if (input) input.click();
    return;
  }
  if (action === "close-modal") { closeModal(); }
}

function handleSubmit(event) {
  const form = event.target;
  if (!form || !form.id) return;
  if (form.id === "kl-request-form") { event.preventDefault(); submitRequest(form); return; }
  if (form.id === "kl-approval-form") { event.preventDefault(); submitApproval(form); return; }
  if (form.id === "kl-report-form") { event.preventDefault(); submitReport(form); return; }
  if (form.id === "kl-store-form") { event.preventDefault(); submitStore(form); return; }
}

function handleChange(event) {
  const target = event.target;
  if (target.matches("[data-photo-card]")) { handlePhotoUpload(target); return; }
  if (target.matches('[data-import="store-csv"]')) {
    const file = target.files?.[0];
    target.value = "";
    if (file) importStoreCsv(file);
    return;
  }
  if (target.matches('[name="visit_outcome"]')) {
    const card = target.closest(".kl-store-card");
    const skip = card?.querySelector(".kl-skip-reason");
    if (skip) skip.classList.toggle("hidden", upper(target.value) === "TERKUNJUNGI");
    return;
  }
  if (target.matches('[name="needs_escalation"]')) {
    const fields = state.container?.querySelector(".kl-escalation-fields");
    if (fields) fields.classList.toggle("hidden", !target.checked);
    return;
  }
  const filter = target.dataset.filter;
  if (!filter) return;
  if (filter === "sales" || filter === "stores") {
    filterOptionList(filter, target.value);
  } else if (filter === "store-search") {
    state.storeSearch = target.value;
    render();
  } else if (filter === "monitor-search") {
    state.filters.search = target.value;
    preserveMonitorFocus(() => render());
  } else if (filter === "monitor-branch") {
    state.filters.branch = target.value;
    render();
  } else if (filter === "monitor-type") {
    state.filters.type = target.value;
    render();
  } else if (filter === "monitor-report") {
    state.filters.report = target.value;
    render();
  }
}

function filterOptionList(kind, value) {
  const keyword = upper(value);
  const selector = kind === "sales" ? ".kl-sales-item" : ".kl-store-item";
  state.container?.querySelectorAll(selector).forEach(item => {
    const haystack = upper(item.dataset.search || "");
    item.classList.toggle("hidden", Boolean(keyword) && !haystack.includes(keyword));
  });
}

function preserveMonitorFocus(callback) {
  const active = document.activeElement;
  const hadFocus = active?.dataset?.filter === "monitor-search";
  const caret = hadFocus ? active.selectionStart : null;
  callback();
  if (!hadFocus) return;
  const next = state.container?.querySelector('[data-filter="monitor-search"]');
  if (next) {
    next.focus();
    if (caret !== null) { try { next.setSelectionRange(caret, caret); } catch { /* abaikan */ } }
  }
}

/* ---------------------------------------------------------------------
 * UTIL: NOTIFIKASI & UNDUH
 * ------------------------------------------------------------------- */
async function notifyEvent(requestId, eventName, note = "") {
  if (!requestId || !eventName) return;
  try {
    await authFetch("/api/field-visit", {
      method: "POST",
      body: JSON.stringify({ request_id: requestId, event: eventName, note })
    });
  } catch (error) {
    console.warn("Notifikasi kunjungan lapangan gagal dikirim:", error?.message || error);
  }
}

function downloadTextFile(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}





