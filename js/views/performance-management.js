import { db, COL, collection, query, where, getDocs } from "../firebase-config.js";
import {
  fsGetAll, fsGetOwnedRecords, fsAdd, fsUpdate, fsDelete, openModal, closeModal,
  toast, genId, fmtDateShort, escapeHtml, downloadHtmlAsPdf
} from "../utils.js";
import { badge, emptyState, icon, skeletonRows } from "../components.js";
import { canEditModuleData, hasPermission, resolveBranchScope, branchMatches } from "../auth.js";
import { isoDocHeaderTable } from "../branding.js";
import {
  KPI_2027_VERSION, KPI_2027_LABEL, KPI_2027_OPEN_DECISIONS, KPI_2027_ROLLOUT,
  KPI_MASTER_SEED, KPI_SCORECARD_TEMPLATES_SEED, KPI_DIRECTIONS, KPI_DIRECTION_LABELS,
  KPI_SCORECARD_STATUS, KPI_SCORECARD_STATUS_LABELS, KPI_ITEM_STATUS,
  calculateScorecard, scoreIndicator, validateWeights, validateScorecardForApproval,
  buildScorecardFromTemplate, resolveTemplateForEmployee, summarizeScorecard,
  getProposedRating, formatKpiValue, aggregateBranchResults
} from "../kpi-2027.mjs";
import {
  RENEWAL_WINDOW_DAYS,
  buildPerformaIndex,
  renewalQueue,
  summarizePerformaContracts
} from "../performa-data.mjs";

const STATUS_TONE = {
  DRAFT: "slate",
  SUBMITTED: "blue",
  SUPERVISOR_REVIEW: "blue",
  HR_VALIDATION: "amber",
  CALIBRATION: "amber",
  APPROVED: "green",
  LOCKED: "maroon",
  CORRECTION_REQUESTED: "red",
  CANCELLED: "red"
};

const RATING_TONE = { emerald: "green", blue: "blue", amber: "amber", rose: "red", slate: "slate" };

const state = {
  session: null,
  container: null,
  tab: "dashboard",
  loaded: false,
  canViewAll: false,
  canConfigure: false,
  canInput: false,
  canApprove: false,
  canReview: false,
  canCoaching: false,
  canViewAudit: false,
  isManager: false,
  branchScope: "",
  masterPersisted: false,
  templatesPersisted: false,
  master: [],
  templates: [],
  scorecards: [],
  reviews: [],
  coaching: [],
  audit: [],
  employees: [],
  contracts: [],
  performa: [],
  filters: { period: "2027", status: "", branch: "", search: "" }
};

const upper = value => String(value || "").trim().toUpperCase();
const nowIso = () => new Date().toISOString();

function statusBadge(status) {
  const key = upper(status || "DRAFT");
  return badge(KPI_SCORECARD_STATUS_LABELS[key] || key || "DRAFT", STATUS_TONE[key] || "slate");
}

function ratingBadge(score) {
  const rating = getProposedRating(score);
  return badge(rating.label, RATING_TONE[rating.tone] || "slate");
}

function sessionNik(session) {
  return String(session?.nik || session?.nik_karyawan || "").trim();
}

function sessionName(session) {
  return String(session?.nama || session?.nama_karyawan || "").trim();
}

function employeeNik(employee) {
  return String(employee?.nik_karyawan || employee?.nik || employee?.id || "").trim();
}

function employeeName(employee) {
  return String(employee?.nama_karyawan || employee?.nama || "").trim();
}

function employeePosition(employee) {
  return String(employee?.jabatan || employee?.posisi || employee?.position || "").trim();
}

function employeeBranch(employee) {
  return String(employee?.cabang || employee?.branch || "").trim();
}

function isActiveEmployee(employee) {
  return !["NONAKTIF", "RESIGN", "KELUAR", "TERMINATED"].includes(upper(employee?.aktif_tdk_aktif || employee?.status_aktif || "AKTIF"));
}

function periodOptions(selected = "2027") {
  const years = new Set(["2026", "2027", "2028", String(selected || "2027")]);
  return [...years].sort().map(year => `<option value="${year}" ${String(year) === String(selected) ? "selected" : ""}>${year}</option>`).join("");
}

function tableShell(title, subtitle, actionsHtml, bodyHtml) {
  return `
  <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h3 class="font-bold text-slate-800 text-base">${title}</h3>
        <p class="text-xs text-slate-400 mt-0.5">${subtitle}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">${actionsHtml || ""}</div>
    </div>
    ${bodyHtml}
  </div>`;
}

function primaryButton(id, label, iconName = "plus") {
  return `<button id="${id}" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-sm transition inline-flex items-center gap-1.5">${icon(iconName, "w-4 h-4")}${label}</button>`;
}

function ghostButton(id, label, iconName = "settings") {
  return `<button id="${id}" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5">${icon(iconName, "w-4 h-4")}${label}</button>`;
}

export async function mount(container, { session, params }) {
  state.session = session;
  state.container = container;
  state.tab = "dashboard";
  state.loaded = false;
  state.contracts = [];
  state.performa = [];

  const role = upper(session?.role);
  const posisi = upper(session?.posisi || session?.jabatan);
  const isAdminRole = ["HRD", "SUPERADMIN", "DIREKTUR", "GM"].includes(role);
  const isManagerRole = isAdminRole || ["MANAGER", "SPV", "KOORDINATOR", "ATASAN", "BRANCH MANAGER", "BRANCH_MANAGER", "KEPALA CABANG", "KACAB"].includes(role)
    || posisi.includes("SUPERVISOR") || posisi.includes("SPV") || posisi.includes("MANAGER") || posisi.includes("KEPALA CABANG");
  const canEdit = await canEditModuleData(session).catch(() => false);

  state.isManager = isManagerRole;
  state.branchScope = resolveBranchScope(session) || "";
  state.canViewAll = isAdminRole || isManagerRole
    || await hasPermission("performance_management.view_all", session).catch(() => false)
    || await hasPermission("performance_review.semua_review.view", session).catch(() => false);
  state.canConfigure = isAdminRole && canEdit
    || await hasPermission("performance_management.kpi_master.configure", session).catch(() => false);
  state.canInput = canEdit || await hasPermission("performance_management.actual.input", session).catch(() => false);
  state.canApprove = canEdit || await hasPermission("performance_management.review.approve", session).catch(() => false);
  state.canReview = canEdit || await hasPermission("performance_management.review.manage", session).catch(() => false);
  state.canCoaching = canEdit || await hasPermission("performance_management.coaching.manage", session).catch(() => false);
  state.canViewAudit = state.canViewAll || await hasPermission("performance_management.audit.view", session).catch(() => false);

  // GM bersifat view-only pada modul operasional.
  if (role === "GM") {
    state.canConfigure = false;
    state.canInput = false;
    state.canReview = false;
    state.canCoaching = false;
  }

  const requested = String(params?.get?.("tab") || "").trim();
  if (requested) state.tab = requested;

  renderTabs();
  bindTabHeader();
  await loadCoreData();
  await loadActiveTab();
}

function availableTabs() {
  const tabs = [{ id: "dashboard", label: "Dashboard", icon: "gauge" }];
  if (state.canViewAll) {
    tabs.push({ id: "employee", label: "Dashboard Karyawan", icon: "layers" });
    tabs.push({ id: "scorecards", label: "Scorecard Karyawan", icon: "layers" });
    tabs.push({ id: "contract", label: "Kontrak & Perpanjangan", icon: "doc-plus" });
    tabs.push({ id: "master", label: "Master KPI 2027", icon: "book" });
    tabs.push({ id: "templates", label: "Template Scorecard", icon: "doc-plus" });
  } else {
    tabs.push({ id: "my", label: "Scorecard Saya", icon: "user" });
    tabs.push({ id: "contract", label: "Kontrak Saya", icon: "doc-plus" });
  }
  tabs.push({ id: "reviews", label: state.canViewAll ? "Review & Kalibrasi" : "Review Saya", icon: "check" });
  tabs.push({ id: "coaching", label: "Coaching & Action Plan", icon: "user-plus" });
  if (state.canViewAudit) tabs.push({ id: "audit", label: "Jejak Audit", icon: "clock" });
  tabs.push({ id: "legacy", label: "Review Historis", icon: "clock" });
  return tabs;
}

function renderTabs() {
  const holder = state.container?.querySelector("#pm-tab-header");
  if (!holder) return;
  const tabs = availableTabs();
  if (!tabs.some(tab => tab.id === state.tab)) state.tab = tabs[0]?.id || "dashboard";
  holder.innerHTML = tabs.map(tab => `
    <button type="button" data-pm-tab="${tab.id}" class="ui-tab pm-tab ${tab.id === state.tab ? "active" : ""} inline-flex items-center gap-1.5">
      ${icon(tab.icon || "gauge", "w-4 h-4")}${tab.label}
    </button>
  `).join("");
}

function bindTabHeader() {
  const holder = state.container?.querySelector("#pm-tab-header");
  holder?.querySelectorAll("[data-pm-tab]").forEach(button => {
    button.onclick = () => switchTab(button.dataset.pmTab);
  });
}

async function switchTab(tabId) {
  if (!tabId || tabId === state.tab) return;
  state.tab = tabId;
  renderTabs();
  bindTabHeader();
  await loadActiveTab();
}

async function reloadCurrentTab() {
  await loadActiveTab();
}

async function loadActiveTab() {
  const wrap = state.container?.querySelector("#pm-content");
  if (!wrap) return;
  wrap.innerHTML = `<div class="p-8">${skeletonRows(5)}</div>`;
  try {
    if (state.tab === "dashboard") await renderDashboard(wrap);
    else if (state.tab === "employee") await renderEmployeeDashboard(wrap);
    else if (state.tab === "contract") await renderContractTab(wrap);
    else if (state.tab === "scorecards") await renderScorecards(wrap);
    else if (state.tab === "my") await renderMyScorecards(wrap);
    else if (state.tab === "master") await renderMaster(wrap);
    else if (state.tab === "templates") await renderTemplates(wrap);
    else if (state.tab === "reviews") await renderReviews(wrap);
    else if (state.tab === "coaching") await renderCoaching(wrap);
    else if (state.tab === "audit") await renderAudit(wrap);
    else if (state.tab === "legacy") await renderLegacy(wrap);
    else await renderDashboard(wrap);
  } catch (error) {
    console.error("performance-management", error);
    wrap.innerHTML = `<div class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><b>Gagal memuat modul:</b> ${escapeHtml(error?.message || String(error))}</div>`;
  }
}

async function queryRows(colName, field, value) {
  if (!value) return [];
  try {
    const snap = await getDocs(query(collection(db, colName), where(field, "==", value)));
    return snap.docs.map(item => ({ id: item.id, _docId: item.id, ...item.data() }));
  } catch (error) {
    console.warn(`queryRows ${colName}.${field}`, error?.code || error?.message || error);
    return [];
  }
}

async function loadScopedCollection(colName) {
  if (state.canViewAll) {
    if (state.branchScope) {
      const rows = await queryRows(colName, "branch", state.branchScope);
      if (rows.length) return rows;
      // Data lama mungkin memakai field cabang.
      const legacyRows = await queryRows(colName, "cabang", state.branchScope);
      if (legacyRows.length) return legacyRows;
    }
    return await fsGetAll(colName).catch(error => {
      console.warn(`fsGetAll ${colName}`, error?.code || error?.message || error);
      return [];
    });
  }
  return await fsGetOwnedRecords(colName, state.session, { fields: ["nik", "employee_nik", "nik_karyawan"] });
}

async function loadContractSource() {
  // HRD/manajemen membaca seluruh kontrak; karyawan biasa hanya kontraknya
  // sendiri agar tetap hemat kuota baca dan tidak membocorkan data rekan kerja.
  if (state.canViewAll) return await fsGetAll(COL.MASTER_KONTRAK).catch(() => []);
  const rows = [];
  const nik = sessionNik(state.session);
  const name = sessionName(state.session);
  if (nik) rows.push(...await queryRows(COL.MASTER_KONTRAK, "nik_karyawan", nik));
  if (name) {
    const byName = await queryRows(COL.MASTER_KONTRAK, "nama_karyawan", name);
    byName.forEach(row => {
      if (!rows.some(item => item.id === row.id)) rows.push(row);
    });
  }
  return rows;
}

function rebuildPerforma() {
  state.performa = buildPerformaIndex({
    employees: state.employees,
    contracts: state.contracts,
    scorecards: state.scorecards,
    today: new Date()
  });
}

async function loadCoreData() {
  const [masterRaw, templatesRaw, scorecards, reviews, coaching, employeesRaw, contractsRaw, audit] = await Promise.all([
    state.canViewAll ? fsGetAll(COL.KPI_MASTER).catch(() => []) : Promise.resolve([]),
    fsGetAll(COL.KPI_SCORECARD_TEMPLATES).catch(() => []),
    loadScopedCollection(COL.KPI_SCORECARDS),
    loadScopedCollection(COL.KPI_REVIEWS),
    loadScopedCollection(COL.KPI_COACHING),
    fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
    loadContractSource(),
    state.canViewAudit ? fsGetAll(COL.KPI_AUDIT).catch(() => []) : Promise.resolve([])
  ]);

  state.masterPersisted = Array.isArray(masterRaw) && masterRaw.length > 0;
  state.templatesPersisted = Array.isArray(templatesRaw) && templatesRaw.length > 0;
  state.master = state.masterPersisted
    ? masterRaw.sort((a, b) => String(a.kpi_code || "").localeCompare(String(b.kpi_code || "")))
    : KPI_MASTER_SEED.map(item => ({ ...item }));
  state.templates = (state.templatesPersisted ? templatesRaw : KPI_SCORECARD_TEMPLATES_SEED)
    .map(template => ({ ...template, items: Array.isArray(template.items) ? template.items.map(item => ({ ...item })) : [] }));
  state.scorecards = sortScorecards(scorecards || []);
  state.reviews = sortByDate(reviews || []);
  state.coaching = sortByDate(coaching || []);
  state.audit = sortByDate(audit || []);
  state.employees = (employeesRaw || []).filter(isActiveEmployee);
  if (state.branchScope) {
    state.employees = state.employees.filter(employee => branchMatches(state.branchScope, employeeBranch(employee)));
  }
  // Kontrak tidak difilter per cabang di sini: pencocokan dilakukan ke
  // karyawan yang sudah difilter, sehingga kontrak lama tanpa kolom cabang
  // tetap terbaca tanpa membocorkan data cabang lain.
  state.contracts = contractsRaw || [];
  rebuildPerforma();
  state.loaded = true;
}

function sortByDate(rows = []) {
  return [...rows].sort((a, b) => {
    const left = new Date(b.updated_at?.seconds ? b.updated_at.seconds * 1000 : (b.updated_at || b.created_at || b.tanggal || 0)).getTime() || 0;
    const right = new Date(a.updated_at?.seconds ? a.updated_at.seconds * 1000 : (a.updated_at || a.created_at || a.tanggal || 0)).getTime() || 0;
    return left - right;
  });
}

function sortScorecards(rows = []) {
  return [...rows].sort((a, b) => {
    const period = String(b.period_year || "").localeCompare(String(a.period_year || ""));
    if (period) return period;
    return String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));
  });
}

function scorecardMatchesSession(scorecard, session = state.session) {
  const nik = sessionNik(session).toLowerCase();
  const name = sessionName(session).toLowerCase();
  const rowNik = String(scorecard.employee_nik || scorecard.nik || scorecard.nik_karyawan || "").toLowerCase();
  const rowName = String(scorecard.employee_name || scorecard.nama_karyawan || "").toLowerCase();
  if (nik && rowNik) return nik === rowNik;
  return Boolean(name && rowName && name === rowName);
}

async function writeAudit({ entityType, entityId, fieldChanged, oldValue, newValue, reason }) {
  try {
    await fsAdd(COL.KPI_AUDIT, {
      audit_id: genId("KAUD"),
      entity_type: entityType,
      entity_id: entityId,
      field_changed: fieldChanged || "",
      old_value: oldValue === undefined ? "" : oldValue,
      new_value: newValue === undefined ? "" : newValue,
      change_reason: reason || "",
      changed_by: sessionName(state.session) || sessionNik(state.session),
      changed_by_nik: sessionNik(state.session),
      changed_by_role: upper(state.session?.role),
      changed_at: nowIso()
    });
  } catch (error) {
    console.warn("audit KPI 2027 gagal disimpan", error?.code || error?.message || error);
  }
}

/* -------------------------------------------------------------------------
 * DASHBOARD
 * ----------------------------------------------------------------------- */
const CONTRACT_TONE = {
  KADALUARSA: "red",
  KRITIS: "red",
  WASPADA: "amber",
  PERSIAPAN: "blue",
  AMAN: "slate",
  "TANPA BATAS": "slate"
};

function contractBadge(row) {
  const key = upper(row.urgency || "AMAN");
  return badge(row.urgency_label || key, CONTRACT_TONE[key] || "slate");
}

function rowMatchesSession(row) {
  const nik = sessionNik(state.session).toLowerCase();
  const name = sessionName(state.session).toLowerCase();
  const rowNik = String(row.nik || row.employee_nik || "").toLowerCase();
  const rowName = String(row.nama || row.employee_name || "").toLowerCase();
  if (nik && rowNik) return nik === rowNik;
  return Boolean(name && rowName && name === rowName);
}

function performaForScorecard(scorecard = {}) {
  const nik = String(scorecard.employee_nik || scorecard.nik || scorecard.nik_karyawan || "").toLowerCase();
  const name = String(scorecard.employee_name || scorecard.nama_karyawan || "").toLowerCase();
  return state.performa.find(row => {
    const rowNik = String(row.nik || "").toLowerCase();
    const rowName = String(row.nama || "").toLowerCase();
    if (nik && rowNik) return nik === rowNik;
    return Boolean(name && rowName && name === rowName);
  }) || null;
}

function scorecardScore(scorecard) {
  if (!scorecard) return "-";
  const summary = summarizeScorecard(scorecard);
  const value = summary.final_score ?? summary.provisional_score;
  return value === null || value === undefined || value === "" ? "-" : value;
}

function formatDaysLeft(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return "Tanpa batas";
  const value = Number(daysLeft);
  if (!Number.isFinite(value)) return "Tanpa batas";
  if (value < 0) return `${Math.abs(value)} hari lalu`;
  return `${value} hari`;
}

async function renderEmployeeDashboard(wrap) {
  wrap.innerHTML = `<div id="pm-employee-dashboard"><div class="p-8">${skeletonRows(5)}</div></div>`;
  const host = wrap.querySelector("#pm-employee-dashboard");
  try {
    const html = await fetch(`./views/dashboard-karyawan.html?v=20261120-performa-v40`).then(response => {
      if (!response.ok) throw new Error(`Gagal memuat template (${response.status})`);
      return response.text();
    });
    host.innerHTML = html;
    const mod = await import("./dashboard-karyawan.js?v=20261120-performa-v40");
    await mod.mount(host, {
      session: state.session,
      params: new URLSearchParams({ embedded: "1" })
    });
  } catch (error) {
    console.error("performance-management: dashboard karyawan", error);
    host.innerHTML = `<div class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><b>Gagal memuat Dashboard Karyawan:</b> ${escapeHtml(error?.message || String(error))}</div>`;
  }
}

async function renderContractTab(wrap) {
  rebuildPerforma();
  const visible = state.canViewAll
    ? state.performa
    : state.performa.filter(row => rowMatchesSession(row));
  const summary = summarizePerformaContracts(visible);
  const queue = renewalQueue(visible);
  const rows = [...visible].sort((a, b) => {
    const left = a.days_left === null || a.days_left === undefined ? Number.POSITIVE_INFINITY : Number(a.days_left);
    const right = b.days_left === null || b.days_left === undefined ? Number.POSITIVE_INFINITY : Number(b.days_left);
    return left - right || String(a.nama || "").localeCompare(String(b.nama || ""), "id");
  });

  const queueNote = queue.length
    ? `<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <p class="font-bold">${queue.length} kontrak masuk masa penilaian perpanjangan (≤ ${RENEWAL_WINDOW_DAYS} hari).</p>
        <p class="mt-1">Mulai dari ${escapeHtml(queue[0]?.nama || "-")} (${formatDaysLeft(queue[0]?.days_left)}). Penilaian tambahan hanya dibuka untuk kontrak yang mendekati berakhir.</p>
      </div>`
    : `<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">Tidak ada kontrak yang masuk masa perpanjangan dalam ${RENEWAL_WINDOW_DAYS} hari ke depan.</div>`;

  const tableRows = rows.length ? rows.map(row => {
    const action = state.canViewAll
      ? (row.is_permanent
        ? `<span class="text-[10px] font-bold text-slate-400">Karyawan tetap</span>`
        : row.renewal_due
          ? `<button type="button" data-open-renewal class="px-2.5 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg font-bold text-[11px]">Buka Alur</button>`
          : `<span class="text-[10px] font-bold text-slate-400">Belum masuk masa perpanjangan</span>`)
      : `<a href="#penilaian-kontrak?tab=kontrak" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px]">Lihat Kontrak</a>`;
    return `<tr class="hover:bg-slate-50/60">
      <td class="px-3 py-3"><b class="text-slate-800">${escapeHtml(row.nama || "-")}</b><br><span class="text-slate-400">${escapeHtml(row.nik || "-")} · ${escapeHtml(row.jabatan || "jabatan belum diisi")}</span></td>
      <td class="px-3 py-3 text-slate-600">${escapeHtml(row.contract_type_label || "-")}<br><span class="text-slate-400">${escapeHtml(row.cabang || "-")}</span></td>
      <td class="px-3 py-3 text-slate-600">${escapeHtml(row.contract_start || "-")} s/d ${escapeHtml(row.contract_end || "-")}</td>
      <td class="px-3 py-3"><div class="font-bold text-slate-700">${escapeHtml(formatDaysLeft(row.days_left))}</div><div class="mt-1">${row.is_permanent ? badge("Tanpa batas", "slate") : contractBadge(row)}</div></td>
      <td class="px-3 py-3 text-center"><div class="font-black text-indigo-700">${escapeHtml(String(scorecardScore(row.latest_scorecard)))}</div><div class="text-[10px] text-slate-400">${row.latest_scorecard ? escapeHtml(row.latest_scorecard.period_label || row.latest_scorecard.period_year || "") : "belum ada"}</div></td>
      <td class="px-3 py-3 text-right">${action}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="px-3 py-8">${emptyState("Belum ada data kontrak", "Lengkapi Master Karyawan dan Master Kontrak untuk melihat masa berlaku.")}</td></tr>`;

  wrap.innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Karyawan</p>
        <p class="text-2xl font-black text-slate-800 mt-1">${summary.total}</p>
        <p class="text-[11px] text-slate-400 mt-1">Aktif di pusat data</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">PKWTT</p>
        <p class="text-2xl font-black text-emerald-700 mt-1">${summary.permanent}</p>
        <p class="text-[11px] text-slate-400 mt-1">Karyawan tetap</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">PKWT / Kontrak</p>
        <p class="text-2xl font-black text-blue-700 mt-1">${summary.contract}</p>
        <p class="text-[11px] text-slate-400 mt-1">Perlu siklus perpanjangan</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Jatuh Tempo ≤ ${RENEWAL_WINDOW_DAYS} hari</p>
        <p class="text-2xl font-black ${summary.renewal_due ? "text-amber-700" : "text-emerald-700"} mt-1">${summary.renewal_due}</p>
        <p class="text-[11px] text-slate-400 mt-1">Siap dinilai</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Kadaluarsa</p>
        <p class="text-2xl font-black ${summary.expired ? "text-rose-700" : "text-emerald-700"} mt-1">${summary.expired}</p>
        <p class="text-[11px] text-slate-400 mt-1">Perlu tindakan segera</p>
      </div>
    </div>

    ${queueNote}

    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
      <b>Satu sumber data:</b> Master Karyawan + Master Kontrak. Menu <b>Perpanjangan Kontrak</b> memakai data yang sama; penilaian tambahan hanya muncul saat kontrak mendekati berakhir.
    </div>

    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="font-bold text-slate-800 text-base">${state.canViewAll ? "Kontrak & Perpanjangan" : "Kontrak Saya"}</h3>
          <p class="text-xs text-slate-400 mt-0.5">Identitas, jenis kontrak, masa berlaku, dan skor KPI terakhir dari sumber yang sama.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <a href="#penilaian-kontrak?tab=alur_perpanjangan" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Buka Pipeline Perpanjangan</a>
        </div>
      </div>
      <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table class="w-full min-w-[900px] text-left text-xs">
          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Karyawan</th><th class="px-3 py-3">Jenis Kontrak</th><th class="px-3 py-3">Masa Kontrak</th><th class="px-3 py-3">Sisa</th><th class="px-3 py-3 text-center">Skor Terakhir</th><th class="px-3 py-3 text-right">Tindakan</th></tr></thead>
          <tbody class="divide-y divide-slate-100">${tableRows}</tbody>
        </table>
      </div>
    </div>`;

  wrap.querySelectorAll("[data-open-renewal]").forEach(button => {
    button.onclick = () => { window.location.hash = "#penilaian-kontrak?tab=alur_perpanjangan"; };
  });
}

async function renderDashboard(wrap) {
  rebuildPerforma();
  const summaries = state.scorecards.map(scorecard => summarizeScorecard(scorecard));
  const scored = summaries.filter(row => Number.isFinite(Number(row.final_score ?? row.provisional_score)));
  const average = scored.length
    ? Math.round((scored.reduce((sum, row) => sum + Number(row.final_score ?? row.provisional_score), 0) / scored.length) * 10) / 10
    : null;
  const pendingCount = summaries.filter(row => row.pending_count > 0).length;
  const approvedCount = summaries.filter(row => ["APPROVED", "LOCKED"].includes(row.status)).length;
  const openCoaching = state.coaching.filter(row => ["OPEN", "IN_PROGRESS"].includes(upper(row.status))).length;
  const mine = state.scorecards.filter(scorecard => scorecardMatchesSession(scorecard)).map(scorecard => summarizeScorecard(scorecard));
  const latestMine = mine.sort((a, b) => String(b.period_label || "").localeCompare(String(a.period_label || "")))[0] || null;

  const lowest = [...scored].sort((a, b) => Number(a.final_score ?? a.provisional_score) - Number(b.final_score ?? b.provisional_score)).slice(0, 5);
  const contractSummary = summarizePerformaContracts(state.performa);
  const renewal = renewalQueue(state.performa).slice(0, 5);

  wrap.innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Scorecard Karyawan</p>
        <p class="text-2xl font-black text-slate-800 mt-1">${summaries.length}</p>
        <p class="text-[11px] text-slate-400 mt-1">${state.canViewAll ? "Sesuai cakupan akses Anda" : "Milik Anda"}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Rata-rata Skor</p>
        <p class="text-2xl font-black ${average === null ? "text-slate-400" : "text-indigo-700"} mt-1">${average === null ? "—" : average}</p>
        <p class="text-[11px] text-slate-400 mt-1">Maksimum 120 · predikat usulan</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Masih PENDING</p>
        <p class="text-2xl font-black ${pendingCount ? "text-amber-700" : "text-emerald-700"} mt-1">${pendingCount}</p>
        <p class="text-[11px] text-slate-400 mt-1">Data kosong tidak dianggap nol</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Disetujui / Terkunci</p>
        <p class="text-2xl font-black text-emerald-700 mt-1">${approvedCount}</p>
        <p class="text-[11px] text-slate-400 mt-1">${openCoaching} coaching terbuka</p>
      </div>
    </div>

    ${state.canViewAll ? `
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="font-bold text-slate-800 text-base">Kontrak & Perpanjangan</h3>
            <p class="text-xs text-slate-400 mt-0.5">Sumber yang sama dengan menu Perpanjangan Kontrak: Master Karyawan + Master Kontrak.</p>
          </div>
          <a href="#penilaian-kontrak?tab=alur_perpanjangan" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Buka Pipeline</a>
        </div>
        <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-[10px] font-black uppercase text-slate-400">PKWTT</p><p class="text-xl font-black text-emerald-700 mt-1">${contractSummary.permanent}</p></div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-[10px] font-black uppercase text-slate-400">PKWT / Kontrak</p><p class="text-xl font-black text-blue-700 mt-1">${contractSummary.contract}</p></div>
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-3"><p class="text-[10px] font-black uppercase text-amber-700">Jatuh Tempo ≤ ${RENEWAL_WINDOW_DAYS} hari</p><p class="text-xl font-black text-amber-800 mt-1">${contractSummary.renewal_due}</p></div>
          <div class="rounded-xl border border-rose-200 bg-rose-50 p-3"><p class="text-[10px] font-black uppercase text-rose-700">Kadaluarsa</p><p class="text-xl font-black text-rose-800 mt-1">${contractSummary.expired}</p></div>
        </div>
        ${renewal.length ? `<div class="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p class="text-[10px] font-black uppercase tracking-wide text-amber-800">Antrean perpanjangan terdekat</p>
          <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            ${renewal.map(row => `<div class="flex items-center justify-between gap-2 rounded-lg bg-white/80 border border-amber-100 px-3 py-2"><span class="text-xs font-bold text-slate-700">${escapeHtml(row.nama || "-")}</span><span class="text-[11px] font-bold text-amber-800">${escapeHtml(formatDaysLeft(row.days_left))}</span></div>`).join("")}
          </div>
        </div>` : `<p class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Tidak ada kontrak yang masuk masa perpanjangan dalam ${RENEWAL_WINDOW_DAYS} hari ke depan.</p>`}
      </div>` : ""}

    ${!state.canViewAll ? `
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="font-bold text-slate-800 text-base">Scorecard Saya</h3>
            <p class="text-xs text-slate-400 mt-0.5">Skor KPI hanya salah satu masukan keputusan, bukan dasar otomatis.</p>
          </div>
          <button id="pm-dash-open-my" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl">Lihat Scorecard Saya</button>
        </div>
        ${latestMine ? `
          <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-[10px] font-black uppercase text-slate-400">Periode</p>
              <p class="font-bold text-slate-800 mt-1">${escapeHtml(latestMine.period_label || "-")}</p>
              <p class="text-xs text-slate-500">${escapeHtml(latestMine.position || "-")}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-[10px] font-black uppercase text-slate-400">Skor</p>
              <p class="text-2xl font-black text-indigo-700 mt-1">${latestMine.final_score ?? latestMine.provisional_score ?? "—"}</p>
              <p class="text-xs text-slate-500">${latestMine.provisional ? "Sementara — masih ada data PENDING" : "Nilai akhir"}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-[10px] font-black uppercase text-slate-400">Status</p>
              <p class="mt-2">${statusBadge(latestMine.status)} ${ratingBadge(latestMine.final_score ?? latestMine.provisional_score)}</p>
              <p class="text-[11px] text-slate-400 mt-1">${latestMine.pending_count} indikator PENDING</p>
            </div>
          </div>` : `
          <div class="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            Belum ada scorecard untuk akun Anda. HRD/atasan akan membuat scorecard setelah template jabatan dan target disahkan.
          </div>`}
      </div>` : ""}

    ${state.canViewAll ? `
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <div class="flex items-center justify-between gap-2">
            <div><h3 class="font-bold text-slate-800 text-base">Skor Terendah — Perlu Perhatian</h3><p class="text-xs text-slate-400 mt-0.5">Bukan dasar sanksi otomatis; tindak lanjuti lewat coaching.</p></div>
            <button id="pm-dash-open-scorecards" class="text-xs font-bold text-maroon-700 hover:underline">Semua scorecard</button>
          </div>
          <div class="mt-3 overflow-x-auto">
            ${lowest.length ? `<table class="w-full text-left text-xs"><thead class="text-[10px] uppercase text-slate-400"><tr><th class="py-2 pr-3">Karyawan</th><th class="py-2 pr-3">Jabatan</th><th class="py-2 pr-3 text-center">Skor</th><th class="py-2 text-center">Status</th></tr></thead><tbody class="divide-y divide-slate-100">${lowest.map(row => `<tr><td class="py-2.5 pr-3"><b class="text-slate-800">${escapeHtml(row.employee_name || "-")}</b><br><span class="text-slate-400">${escapeHtml(row.employee_nik || "")}</span></td><td class="py-2.5 pr-3 text-slate-500">${escapeHtml(row.position || "-")}</td><td class="py-2.5 pr-3 text-center font-black text-indigo-700">${row.final_score ?? row.provisional_score}</td><td class="py-2.5 text-center">${statusBadge(row.status)}</td></tr>`).join("")}</tbody></table>` : emptyState("Belum ada skor", "Buat scorecard dan lengkapi aktual untuk melihat peringkat.")}
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <h3 class="font-bold text-slate-800 text-base">Kalender Implementasi</h3>
          <p class="text-xs text-slate-400 mt-0.5">Pilot Jan–Mar 2027; standar penuh direncanakan April 2027.</p>
          <div class="mt-3 space-y-2">
            ${KPI_2027_ROLLOUT.map(row => `<div class="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"><div class="w-2 h-2 rounded-full bg-maroon-600 mt-1.5 shrink-0"></div><div class="min-w-0"><p class="text-xs font-bold text-slate-700">${escapeHtml(row.period)} · ${escapeHtml(row.activity)}</p><p class="text-[11px] text-slate-500">${escapeHtml(row.output)} — ${escapeHtml(row.gate)}</p></div></div>`).join("")}
          </div>
        </div>
      </div>` : ""}

    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
      <div class="flex items-center justify-between gap-2">
        <div><h3 class="font-bold text-slate-800 text-base">Keputusan & Data yang Masih Terbuka</h3><p class="text-xs text-slate-400 mt-0.5">Jangan mengaktifkan konsekuensi finansial sebelum butir ini dikonfirmasi.</p></div>
        <span class="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-black text-amber-800">${KPI_2027_OPEN_DECISIONS.length} butir</span>
      </div>
      <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        ${KPI_2027_OPEN_DECISIONS.map(row => `<div class="rounded-xl border border-slate-100 p-3"><p class="text-xs font-bold text-slate-700">${escapeHtml(row.id)} · ${escapeHtml(row.label)}</p><p class="text-[11px] text-slate-400">Pemilik: ${escapeHtml(row.owner)}</p></div>`).join("")}
      </div>
    </div>
  `;

  wrap.querySelector("#pm-dash-open-my")?.addEventListener("click", () => switchTab("my"));
  wrap.querySelector("#pm-dash-open-scorecards")?.addEventListener("click", () => switchTab("scorecards"));
}

/* -------------------------------------------------------------------------
 * SCORECARD SAYA
 * ----------------------------------------------------------------------- */
async function renderMyScorecards(wrap) {
  const rows = state.scorecards
    .filter(scorecard => scorecardMatchesSession(scorecard))
    .map(scorecard => summarizeScorecard(scorecard))
    .sort((a, b) => String(b.period_label || "").localeCompare(String(a.period_label || "")));

  if (!rows.length) {
    wrap.innerHTML = tableShell(
      "Scorecard Saya",
      "Scorecard dibuat oleh HRD/atasan dari template jabatan yang sudah tersedia.",
      "",
      emptyState("Belum ada scorecard", "Template jabatan Anda mungkin belum tersedia atau scorecard belum dibuat. Hubungi HRD/atasan langsung.")
    );
    return;
  }

  wrap.innerHTML = `
    <div class="space-y-3">
      ${rows.map(row => {
        const scorecard = state.scorecards.find(item => item.id === row.id || item._docId === row.id);
        return `
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-bold text-slate-800 text-base">${escapeHtml(row.period_label || "-")}</h3>
                ${statusBadge(row.status)}
                ${ratingBadge(row.final_score ?? row.provisional_score)}
              </div>
              <p class="text-xs text-slate-500 mt-1">${escapeHtml(row.position || "-")} · ${escapeHtml(row.branch || "-")} · ${row.template_name ? escapeHtml(row.template_name) : ""}</p>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <p class="text-[10px] font-black uppercase text-slate-400">Skor</p>
                <p class="text-2xl font-black ${row.pending_count ? "text-amber-700" : "text-indigo-700"}">${row.final_score ?? row.provisional_score ?? "—"}</p>
              </div>
              <button data-open-scorecard="${escapeHtml(scorecard?.id || scorecard?._docId || row.id)}" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">Detail</button>
              ${scorecard && !scorecard.employee_acknowledged_at ? `<button data-ack-scorecard="${escapeHtml(scorecard.id || scorecard._docId)}" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl">Akui & Tanggapi</button>` : ""}
            </div>
          </div>
          ${scorecard?.employee_acknowledged_at ? `<p class="mt-3 text-[11px] text-emerald-700">Sudah diakui karyawan pada ${fmtDateShort(scorecard.employee_acknowledged_at)}.</p>` : ""}
        </div>`;
      }).join("")}
    </div>
  `;

  wrap.querySelectorAll("[data-open-scorecard]").forEach(button => {
    button.onclick = () => openScorecardDetail(button.dataset.openScorecard);
  });
  wrap.querySelectorAll("[data-ack-scorecard]").forEach(button => {
    button.onclick = () => openAcknowledgeModal(button.dataset.ackScorecard);
  });
}

async function openAcknowledgeModal(scorecardId) {
  const scorecard = state.scorecards.find(item => (item.id || item._docId) === scorecardId);
  if (!scorecard) return;
  openModal({
    title: "Akui & Tanggapi Scorecard",
    size: "md",
    bodyHtml: `
      <div class="space-y-3 text-sm">
        <p class="text-slate-600">Dengan mengakui, Anda menyatakan sudah membaca target, bobot, dan hasil aktual pada scorecard ini. Pengakuan bukan berarti menyetujui seluruh penilaian; Anda tetap dapat menulis tanggapan.</p>
        <label class="block">
          <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Tanggapan Karyawan (opsional)</span>
          <textarea id="pm-ack-comment" rows="4" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contoh: target kunjungan perlu mempertimbangkan jarak wilayah...">${escapeHtml(scorecard.employee_comments || "")}</textarea>
        </label>
      </div>`,
    footerHtml: `<button id="pm-ack-cancel" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Batal</button><button id="pm-ack-save" class="px-5 py-2 bg-maroon-700 text-white text-sm font-medium rounded-lg">Simpan Pengakuan</button>`,
    onMount: (modal) => {
      modal.querySelector("#pm-ack-cancel").onclick = closeModal;
      modal.querySelector("#pm-ack-save").onclick = async () => {
        const comments = modal.querySelector("#pm-ack-comment").value.trim();
        try {
          await fsUpdate(COL.KPI_SCORECARDS, scorecard.id || scorecard._docId, {
            employee_acknowledged_at: nowIso(),
            employee_comments: comments
          });
          await writeAudit({
            entityType: "employee_scorecard",
            entityId: scorecard.id || scorecard._docId,
            fieldChanged: "employee_acknowledged_at",
            oldValue: scorecard.employee_acknowledged_at || "",
            newValue: nowIso(),
            reason: "Pengakuan karyawan"
          });
          toast("Pengakuan scorecard tersimpan.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menyimpan pengakuan: " + error.message, "error");
        }
      };
    }
  });
}

async function refreshDataAndTab() {
  state.loaded = false;
  await loadCoreData();
  await reloadCurrentTab();
}

/* -------------------------------------------------------------------------
 * DAFTAR SCORECARD (MANAJEMEN)
 * ----------------------------------------------------------------------- */
async function renderScorecards(wrap) {
  wrap.innerHTML = tableShell(
    "Scorecard Karyawan",
    "Satu scorecard per karyawan per periode. Target dan bobot mengikuti template yang disahkan; aktual wajib punya bukti.",
    `${ghostButton("pm-scorecard-refresh", "Muat Ulang", "refresh")}${state.canReview || state.canConfigure ? primaryButton("pm-scorecard-create", "Buat Scorecard", "plus") : ""}`,
    `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label class="text-xs font-bold text-slate-600">Periode<select id="pm-filter-period" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium">${periodOptions(state.filters.period)}</select></label>
        <label class="text-xs font-bold text-slate-600">Status<select id="pm-filter-status" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"><option value="">Semua Status</option>${KPI_SCORECARD_STATUS.map(status => `<option value="${status}">${KPI_SCORECARD_STATUS_LABELS[status] || status}</option>`).join("")}</select></label>
        <label class="text-xs font-bold text-slate-600">Cabang<input id="pm-filter-branch" value="${escapeHtml(state.filters.branch)}" placeholder="Semua cabang" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"></label>
        <label class="text-xs font-bold text-slate-600">Cari<input id="pm-filter-search" value="${escapeHtml(state.filters.search)}" placeholder="Nama / NIK / jabatan" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"></label>
      </div>
      <div id="pm-scorecard-table" class="mt-4"></div>
    `
  );

  const draw = () => {
    state.filters.period = wrap.querySelector("#pm-filter-period")?.value || "";
    state.filters.status = wrap.querySelector("#pm-filter-status")?.value || "";
    state.filters.branch = wrap.querySelector("#pm-filter-branch")?.value.trim() || "";
    state.filters.search = wrap.querySelector("#pm-filter-search")?.value.trim().toLowerCase() || "";
    const rows = state.scorecards.filter(scorecard => {
      if (state.filters.period && String(scorecard.period_year || "") !== String(state.filters.period)) return false;
      if (state.filters.status && upper(scorecard.status) !== state.filters.status) return false;
      if (state.filters.branch && !upper(scorecard.branch || scorecard.cabang).includes(upper(state.filters.branch))) return false;
      if (state.filters.search) {
        const text = `${scorecard.employee_name || ""} ${scorecard.employee_nik || scorecard.nik || ""} ${scorecard.position || ""}`.toLowerCase();
        if (!text.includes(state.filters.search)) return false;
      }
      return true;
    });
    const holder = wrap.querySelector("#pm-scorecard-table");
    if (!rows.length) {
      holder.innerHTML = emptyState("Belum ada scorecard pada filter ini", "Buat scorecard baru dari template jabatan. Template yang belum dikonfirmasi tidak boleh dipakai.");
      return;
    }
    holder.innerHTML = `<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full min-w-[1040px] text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Karyawan</th><th class="px-3 py-3">Jabatan / Cabang</th><th class="px-3 py-3">Kontrak</th><th class="px-3 py-3">Template</th><th class="px-3 py-3 text-center">Periode</th><th class="px-3 py-3 text-center">Skor</th><th class="px-3 py-3 text-center">Status</th><th class="px-3 py-3 text-center">PENDING</th><th class="px-3 py-3 text-right">Aksi</th></tr></thead><tbody class="divide-y divide-slate-100">${rows.map(scorecard => {
      const summary = summarizeScorecard(scorecard);
      const perf = performaForScorecard(scorecard);
      const contractCell = perf
        ? `${escapeHtml(perf.contract_type_label || "-")}<br><span class="text-slate-400">${perf.is_permanent ? "Tanpa batas" : escapeHtml(formatDaysLeft(perf.days_left))}</span>`
        : "-";
      return `<tr class="hover:bg-slate-50/60">
        <td class="px-3 py-3"><b class="text-slate-800">${escapeHtml(scorecard.employee_name || "-")}</b><br><span class="text-slate-400">${escapeHtml(scorecard.employee_nik || scorecard.nik || "")}</span></td>
        <td class="px-3 py-3 text-slate-600">${escapeHtml(scorecard.position || "-")}<br><span class="text-slate-400">${escapeHtml(scorecard.branch || scorecard.cabang || "-")}</span></td>
        <td class="px-3 py-3 text-slate-600">${contractCell}</td>
        <td class="px-3 py-3 text-slate-500">${escapeHtml(scorecard.template_name || scorecard.template_id || "-")}</td>
        <td class="px-3 py-3 text-center font-semibold text-slate-600">${escapeHtml(scorecard.period_label || scorecard.period_year || "-")}</td>
        <td class="px-3 py-3 text-center font-black ${summary.pending_count ? "text-amber-700" : "text-indigo-700"}">${summary.final_score ?? summary.provisional_score ?? "—"}</td>
        <td class="px-3 py-3 text-center">${statusBadge(scorecard.status)}</td>
        <td class="px-3 py-3 text-center font-bold ${summary.pending_count ? "text-amber-700" : "text-emerald-700"}">${summary.pending_count}</td>
        <td class="px-3 py-3 text-right"><div class="flex items-center justify-end gap-1.5"><button data-open-scorecard="${escapeHtml(scorecard.id || scorecard._docId)}" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700">Detail</button>${state.canConfigure ? `<button data-delete-scorecard="${escapeHtml(scorecard.id || scorecard._docId)}" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg font-bold text-rose-700">Hapus</button>` : ""}</div></td>
      </tr>`;
    }).join("")}</tbody></table></div>`;

    holder.querySelectorAll("[data-open-scorecard]").forEach(button => {
      button.onclick = () => openScorecardDetail(button.dataset.openScorecard);
    });
    holder.querySelectorAll("[data-delete-scorecard]").forEach(button => {
      button.onclick = async () => {
        const id = button.dataset.deleteScorecard;
        const row = state.scorecards.find(item => (item.id || item._docId) === id);
        if (!row) return;
        if (!confirm(`Hapus scorecard ${row.employee_name || ""} periode ${row.period_label || ""}? Tindakan ini permanen.`)) return;
        try {
          await fsDelete(COL.KPI_SCORECARDS, id);
          await writeAudit({ entityType: "employee_scorecard", entityId: id, fieldChanged: "deleted", oldValue: row.status || "", newValue: "", reason: "Hapus scorecard" });
          toast("Scorecard dihapus.", "success");
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menghapus: " + error.message, "error");
        }
      };
    });
  };

  ["pm-filter-period", "pm-filter-status", "pm-filter-branch", "pm-filter-search"].forEach(id => {
    const input = wrap.querySelector(`#${id}`);
    input?.addEventListener(input?.tagName === "SELECT" ? "change" : "input", draw);
  });
  draw();
  wrap.querySelector("#pm-scorecard-refresh")?.addEventListener("click", () => refreshDataAndTab());
  wrap.querySelector("#pm-scorecard-create")?.addEventListener("click", openCreateScorecardModal);
}

/* -------------------------------------------------------------------------
 * BUAT SCORECARD
 * ----------------------------------------------------------------------- */
function openCreateScorecardModal() {
  const employees = [...state.employees].sort((a, b) => employeeName(a).localeCompare(employeeName(b), "id"));
  if (!employees.length) {
    toast("Tidak ada karyawan aktif pada cakupan akses Anda.", "warning");
    return;
  }
  const employeeOptions = employees.map(employee => `<option value="${escapeHtml(employee.id || employeeNik(employee))}" data-nik="${escapeHtml(employeeNik(employee))}" data-name="${escapeHtml(employeeName(employee))}" data-position="${escapeHtml(employeePosition(employee))}" data-branch="${escapeHtml(employeeBranch(employee))}" data-atasan="${escapeHtml(employee.atasan || "")}">${escapeHtml(employeeName(employee))} — ${escapeHtml(employeePosition(employee) || "jabatan belum diisi")} (${escapeHtml(employeeNik(employee) || "-")})</option>`).join("");
  const templateOptions = state.templates.map(template => `<option value="${escapeHtml(template.template_id)}">${escapeHtml(template.position_name)} · ${template.items?.length || 0} indikator</option>`).join("");

  openModal({
    title: "Buat Scorecard Karyawan",
    size: "lg",
    bodyHtml: `
      <div class="space-y-4 text-sm">
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Template dan target masih <b>draft usulan</b>. Pastikan jabatan karyawan sudah dikonfirmasi dan target periode disetujui sebelum scorecard dipakai untuk keputusan.</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="block md:col-span-2"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Karyawan</span><select id="pm-create-employee" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${employeeOptions}</select></label>
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Periode Tahun</span><select id="pm-create-year" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${periodOptions("2027")}</select></label>
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Template</span><select id="pm-create-template" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">Deteksi otomatis dari jabatan</option>${templateOptions}</select></label>
        </div>
        <div id="pm-create-preview" class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"></div>
      </div>`,
    footerHtml: `<button id="pm-create-cancel" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Batal</button><button id="pm-create-save" class="px-5 py-2 bg-maroon-700 text-white text-sm font-medium rounded-lg">Buat Scorecard</button>`,
    onMount: (modal) => {
      const employeeSelect = modal.querySelector("#pm-create-employee");
      const templateSelect = modal.querySelector("#pm-create-template");
      const preview = modal.querySelector("#pm-create-preview");
      const yearSelect = modal.querySelector("#pm-create-year");

      const selectedEmployee = () => employees.find(employee => String(employee.id || employeeNik(employee)) === String(employeeSelect.value));
      const selectedTemplate = () => {
        const manual = templateSelect.value;
        if (manual) return state.templates.find(template => template.template_id === manual) || null;
        return resolveTemplateForEmployee(selectedEmployee() || {}, state.templates);
      };

      const drawPreview = () => {
        const employee = selectedEmployee();
        const template = selectedTemplate();
        if (!template) {
          preview.innerHTML = `<span class="font-bold text-rose-700">Template jabatan tidak ditemukan.</span> Scorecard tidak boleh dibuat untuk jabatan yang belum dikonfirmasi. Pilih template manual atau lengkapi job mapping terlebih dahulu.`;
          return;
        }
        const weights = validateWeights(template.items || []);
        preview.innerHTML = `
          <p class="font-bold text-slate-800">${escapeHtml(employeeName(employee) || "-")} · ${escapeHtml(employeePosition(employee) || "-")}</p>
          <p class="mt-1">Template: <b>${escapeHtml(template.position_name)}</b> (${template.items?.length || 0} indikator)</p>
          <p class="mt-1 ${weights.valid ? "text-emerald-700" : "text-rose-700"}">${escapeHtml(weights.message)}</p>
          <p class="mt-1 text-slate-400">Target dan bobot akan disalin ke scorecard. Aktual dikosongkan dan berstatus PENDING sampai diisi bukti.</p>
        `;
      };

      employeeSelect.onchange = drawPreview;
      templateSelect.onchange = drawPreview;
      yearSelect.onchange = drawPreview;
      drawPreview();

      modal.querySelector("#pm-create-cancel").onclick = closeModal;
      modal.querySelector("#pm-create-save").onclick = async () => {
        const employee = selectedEmployee();
        const template = selectedTemplate();
        if (!employee || !template) {
          toast("Template jabatan belum tersedia. Scorecard tidak dibuat.", "warning");
          return;
        }
        const weights = validateWeights(template.items || []);
        if (!weights.valid) {
          toast(weights.message, "warning");
          return;
        }
        const year = Number(yearSelect.value) || 2027;
        const payload = buildScorecardFromTemplate(template, employee, {
          period_year: year,
          period_label: `Tahun ${year}`,
          period_start: `${year}-01-01`,
          period_end: `${year}-12-31`
        });
        payload.nik = employeeNik(employee);
        payload.employee_nik = employeeNik(employee);
        payload.employee_id = employee.id || employeeNik(employee);
        payload.employee_name = employeeName(employee);
        payload.branch = employeeBranch(employee);
        payload.department = String(employee.divisi || employee.departemen || "");
        payload.position = employeePosition(employee);
        payload.supervisor_name = String(employee.atasan || "");
        payload.supervisor_nik = "";
        payload.created_by = sessionName(state.session);
        payload.created_by_nik = sessionNik(state.session);
        payload.created_at = nowIso();
        payload.updated_at = nowIso();

        const button = modal.querySelector("#pm-create-save");
        button.disabled = true;
        button.textContent = "Menyimpan...";
        try {
          const id = genId("KSC");
          await fsAdd(COL.KPI_SCORECARDS, payload, id);
          await writeAudit({
            entityType: "employee_scorecard",
            entityId: id,
            fieldChanged: "created",
            oldValue: "",
            newValue: `${payload.employee_name} · ${payload.period_label}`,
            reason: "Buat scorecard dari template " + template.template_id
          });
          toast("Scorecard berhasil dibuat. Lengkapi aktual dan bukti.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal membuat scorecard: " + error.message, "error");
          button.disabled = false;
          button.textContent = "Buat Scorecard";
        }
      };
    }
  });
}

/* -------------------------------------------------------------------------
 * DETAIL & INPUT SCORECARD
 * ----------------------------------------------------------------------- */
async function openScorecardDetail(scorecardId) {
  const scorecard = state.scorecards.find(item => (item.id || item._docId) === scorecardId);
  if (!scorecard) {
    toast("Scorecard tidak ditemukan.", "warning");
    return;
  }
  const status = upper(scorecard.status || "DRAFT");
  const locked = status === "LOCKED";
  const canEditTarget = state.canInput && status === "DRAFT";
  const canEditActual = state.canInput && ["DRAFT", "SUBMITTED", "SUPERVISOR_REVIEW", "CORRECTION_REQUESTED"].includes(status);
  const summary = summarizeScorecard(scorecard);
  const items = Array.isArray(scorecard.items) ? scorecard.items : [];
  const branchResults = Array.isArray(scorecard.branch_results) ? scorecard.branch_results : [
    { branch: "Cirebon", target: "", actual: "" },
    { branch: "Malang", target: "", actual: "" }
  ];

  const itemRows = items.map((item, index) => {
    const computed = scoreIndicator(item);
    const scoreLabel = computed.status === KPI_ITEM_STATUS.SCORED ? computed.score : "PENDING";
    return `<tr class="border-t border-slate-100 align-top">
      <td class="px-3 py-3">
        <p class="text-xs font-bold text-slate-800">${escapeHtml(item.kpi_code || "")} · ${escapeHtml(item.kpi_name || "")}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(item.definition || "")}</p>
        <p class="text-[10px] text-slate-400 mt-1">${escapeHtml(KPI_DIRECTION_LABELS[item.measurement_direction] || item.measurement_direction || "")} · ${escapeHtml(item.data_source || "-")}</p>
      </td>
      <td class="px-3 py-3 text-center font-bold text-slate-700">${Number(item.weight_percent || 0)}%</td>
      <td class="px-3 py-3 text-center">
        ${canEditTarget
          ? `<input type="number" step="any" min="0" data-target="${index}" value="${item.target_value ?? ""}" class="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-center font-semibold">`
          : `<span class="font-semibold text-slate-700">${formatKpiValue(item.target_value, item.target_unit)}</span>`}
      </td>
      <td class="px-3 py-3 text-center">
        ${canEditActual
          ? `<input type="number" step="any" min="0" data-actual="${index}" value="${item.actual_value ?? ""}" class="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-center font-semibold">`
          : `<span class="font-semibold text-slate-700">${formatKpiValue(item.actual_value, item.target_unit)}</span>`}
      </td>
      <td class="px-3 py-3 text-center">
        <span data-preview-score="${index}" class="inline-flex min-w-[52px] justify-center px-2 py-1 rounded-full text-[11px] font-black ${computed.status === KPI_ITEM_STATUS.SCORED ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}">${scoreLabel}</span>
        <p class="text-[10px] text-slate-400 mt-1" data-preview-status="${index}">${computed.status === KPI_ITEM_STATUS.PENDING ? "PENDING" : computed.capped ? "Dibatasi 120" : ""}</p>
      </td>
      <td class="px-3 py-3">
        ${canEditActual
          ? `<input type="text" data-evidence="${index}" value="${escapeHtml(item.evidence_reference || item.evidence || "")}" placeholder="Nomor laporan / tautan bukti" class="w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">`
          : `<span class="text-xs text-slate-500">${escapeHtml(item.evidence_reference || item.evidence || "-")}</span>`}
      </td>
      <td class="px-3 py-3 text-center font-bold text-slate-700">${computed.weighted_score ?? "—"}</td>
    </tr>`;
  }).join("");

  const footerButtons = [
    `<button id="pm-detail-print" class="px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl inline-flex items-center gap-1.5">${icon("printer", "w-4 h-4")}Cetak</button>`,
    `<button id="pm-detail-close" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Tutup</button>`
  ];
  if (canEditActual || canEditTarget) footerButtons.push(`<button id="pm-detail-save" class="px-4 py-2 bg-maroon-700 text-white text-sm font-medium rounded-lg">Hitung & Simpan</button>`);
  if (state.canReview && ["DRAFT", "CORRECTION_REQUESTED"].includes(status)) footerButtons.push(`<button id="pm-detail-submit" class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg">Ajukan</button>`);
  if (state.canApprove && ["SUBMITTED", "SUPERVISOR_REVIEW", "HR_VALIDATION", "CALIBRATION"].includes(status)) footerButtons.push(`<button id="pm-detail-approve" class="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Setujui</button>`);
  if (state.canApprove && status === "APPROVED") footerButtons.push(`<button id="pm-detail-lock" class="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg">Kunci Nilai</button>`);
  if (state.canReview && !locked && !["DRAFT"].includes(status)) footerButtons.push(`<button id="pm-detail-correction" class="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg">Minta Koreksi</button>`);

  openModal({
    title: `Scorecard · ${scorecard.employee_name || "-"} · ${scorecard.period_label || scorecard.period_year || ""}`,
    size: "xl",
    bodyHtml: `
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Karyawan</p><p class="font-bold text-slate-800 mt-1">${escapeHtml(scorecard.employee_name || "-")}</p><p class="text-[11px] text-slate-400">${escapeHtml(scorecard.employee_nik || scorecard.nik || "")}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Jabatan / Cabang</p><p class="font-bold text-slate-800 mt-1">${escapeHtml(scorecard.position || "-")}</p><p class="text-[11px] text-slate-400">${escapeHtml(scorecard.branch || "-")}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Status</p><p class="mt-1">${statusBadge(status)}</p><p class="text-[11px] text-slate-400 mt-1">${escapeHtml(scorecard.template_name || scorecard.template_id || "")}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Skor</p><p id="pm-calc-score" class="text-2xl font-black text-indigo-700">${summary.final_score ?? summary.provisional_score ?? "—"}</p><p id="pm-calc-status" class="text-[11px] text-slate-400">${summary.provisional ? "Sementara" : "Nilai akhir"} · bobot <span id="pm-calc-weight">${summary.total_weight}</span>%</p></div>
        </div>

        ${scorecard.template_id === "TPL-SS" ? `
          <div class="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div><p class="text-xs font-black text-blue-900 uppercase tracking-wide">Hasil per Cabang — Sales Supervisor</p><p class="text-[11px] text-blue-800">Hasil Cirebon dan Malang ditampilkan terpisah. Skor gabungan memakai pembobotan target, bukan rata-rata sederhana.</p></div>
              <button id="pm-ss-aggregate" class="px-3 py-2 bg-blue-700 text-white text-xs font-bold rounded-lg">Hitung Gabungan</button>
            </div>
            <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              ${branchResults.slice(0, 2).map((row, index) => `
                <label class="text-[11px] font-bold text-blue-900">Cabang<input value="${escapeHtml(row.branch || (index ? "Malang" : "Cirebon"))}" data-branch-name="${index}" class="mt-1 w-full rounded-lg border border-blue-200 px-2 py-1.5"></label>
                <label class="text-[11px] font-bold text-blue-900">Target<input type="number" step="any" min="0" value="${row.target ?? ""}" data-branch-target="${index}" class="mt-1 w-full rounded-lg border border-blue-200 px-2 py-1.5"></label>
                <label class="text-[11px] font-bold text-blue-900">Aktual<input type="number" step="any" min="0" value="${row.actual ?? ""}" data-branch-actual="${index}" class="mt-1 w-full rounded-lg border border-blue-200 px-2 py-1.5"></label>
              `).join("")}
            </div>
            <p id="pm-ss-result" class="mt-2 text-[11px] font-semibold text-blue-900"></p>
          </div>` : ""}

        <div class="overflow-x-auto rounded-xl border border-slate-200">
          <table class="w-full min-w-[980px] text-left text-xs">
            <thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Indikator</th><th class="px-3 py-3 text-center">Bobot</th><th class="px-3 py-3 text-center">Target</th><th class="px-3 py-3 text-center">Aktual</th><th class="px-3 py-3 text-center">Skor</th><th class="px-3 py-3">Bukti / Rujukan</th><th class="px-3 py-3 text-center">Bobot × Skor</th></tr></thead>
            <tbody>${itemRows || `<tr><td colspan="7" class="p-6 text-center text-slate-400">Scorecard belum memiliki indikator.</td></tr>`}</tbody>
          </table>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Catatan Atasan</span><textarea id="pm-supervisor-comments" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">${escapeHtml(scorecard.supervisor_comments || "")}</textarea></label>
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Tanggapan Karyawan</span><textarea id="pm-employee-comments" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" ${state.canViewAll && !scorecardMatchesSession(scorecard, state.session) ? "readonly" : ""}>${escapeHtml(scorecard.employee_comments || "")}</textarea></label>
        </div>
        ${scorecard.correction_reason ? `<div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><b>Alasan koreksi:</b> ${escapeHtml(scorecard.correction_reason)}</div>` : ""}
        ${locked ? `<div class="rounded-xl border border-slate-300 bg-slate-100 p-3 text-xs text-slate-700">Nilai sudah <b>LOCKED</b>. Perubahan hanya melalui correction request dan tercatat di audit trail.</div>` : ""}
      </div>`,
    footerHtml: footerButtons.join(""),
    onMount: (modal) => {
      const collectItems = () => items.map((item, index) => {
        const targetInput = modal.querySelector(`[data-target="${index}"]`);
        const actualInput = modal.querySelector(`[data-actual="${index}"]`);
        const evidenceInput = modal.querySelector(`[data-evidence="${index}"]`);
        return {
          ...item,
          target_value: targetInput ? Number(targetInput.value) : item.target_value,
          actual_value: actualInput ? (actualInput.value === "" ? null : Number(actualInput.value)) : item.actual_value,
          evidence_reference: evidenceInput ? evidenceInput.value.trim() : (item.evidence_reference || item.evidence || "")
        };
      });

      const refreshPreview = () => {
        const collection = collectItems();
        const calc = calculateScorecard(collection);
        calc.items.forEach(row => {
          const scoreEl = modal.querySelector(`[data-preview-score="${row.index}"]`);
          const statusEl = modal.querySelector(`[data-preview-status="${row.index}"]`);
          if (scoreEl) {
            scoreEl.textContent = row.status === KPI_ITEM_STATUS.SCORED ? row.score : "PENDING";
            scoreEl.className = `inline-flex min-w-[52px] justify-center px-2 py-1 rounded-full text-[11px] font-black ${row.status === KPI_ITEM_STATUS.SCORED ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}`;
          }
          if (statusEl) statusEl.textContent = row.status === KPI_ITEM_STATUS.PENDING ? "PENDING" : row.capped ? "Dibatasi 120" : "";
        });
        const scoreEl = modal.querySelector("#pm-calc-score");
        const statusEl = modal.querySelector("#pm-calc-status");
        const weightEl = modal.querySelector("#pm-calc-weight");
        if (scoreEl) scoreEl.textContent = calc.final_score ?? calc.provisional_score ?? "—";
        if (statusEl) statusEl.textContent = calc.provisional ? "Sementara — masih ada PENDING" : "Nilai akhir";
        if (weightEl) weightEl.textContent = calc.total_weight;
        return { items: collection, calc };
      };

      modal.querySelectorAll("[data-target], [data-actual], [data-evidence]").forEach(input => {
        input.addEventListener("input", refreshPreview);
      });

      const save = async (nextStatus = null, reason = "") => {
        if (locked) {
          toast("Nilai sudah LOCKED. Gunakan alur koreksi.", "warning");
          return null;
        }
        const { items: collected, calc } = refreshPreview();
        if (calc.invalid_items.length) {
          toast("Ada data indikator yang tidak valid.", "warning");
          return null;
        }
        const branchRows = scorecard.template_id === "TPL-SS"
          ? [0, 1].map(index => ({
            branch: modal.querySelector(`[data-branch-name="${index}"]`)?.value.trim() || (index ? "Malang" : "Cirebon"),
            target: modal.querySelector(`[data-branch-target="${index}"]`)?.value,
            actual: modal.querySelector(`[data-branch-actual="${index}"]`)?.value
          })).filter(row => row.target !== "" || row.actual !== "")
          : [];
        const payload = {
          items: calc.items.map(({ index, ...row }) => row),
          final_score: calc.final_score,
          provisional_score: calc.provisional_score,
          total_weight: calc.total_weight,
          weighted_total: calc.weighted_total,
          pending_count: calc.pending_items.length,
          rating: calc.rating?.label || "PENDING",
          supervisor_comments: modal.querySelector("#pm-supervisor-comments")?.value.trim() || "",
          employee_comments: modal.querySelector("#pm-employee-comments")?.value.trim() || "",
          branch_results: branchRows,
          updated_at: nowIso()
        };
        if (nextStatus) payload.status = nextStatus;
        if (reason) payload.correction_reason = reason;
        await fsUpdate(COL.KPI_SCORECARDS, scorecard.id || scorecard._docId, payload);
        await writeAudit({
          entityType: "employee_scorecard",
          entityId: scorecard.id || scorecard._docId,
          fieldChanged: nextStatus ? "status" : "items",
          oldValue: nextStatus ? status : (scorecard.final_score ?? ""),
          newValue: nextStatus || (calc.final_score ?? calc.provisional_score ?? ""),
          reason: reason || "Simpan aktual/target scorecard"
        });
        return { calc, payload };
      };

      modal.querySelector("#pm-detail-close")?.addEventListener("click", closeModal);
      modal.querySelector("#pm-detail-print")?.addEventListener("click", () => printScorecard(scorecard, refreshPreview().calc));

      modal.querySelector("#pm-ss-aggregate")?.addEventListener("click", () => {
        const rows = [0, 1].map(index => ({
          branch: modal.querySelector(`[data-branch-name="${index}"]`)?.value.trim() || (index ? "Malang" : "Cirebon"),
          target: modal.querySelector(`[data-branch-target="${index}"]`)?.value,
          actual: modal.querySelector(`[data-branch-actual="${index}"]`)?.value
        }));
        const aggregate = aggregateBranchResults(rows);
        const resultEl = modal.querySelector("#pm-ss-result");
        if (resultEl) resultEl.textContent = aggregate.score === null
          ? "Target gabungan belum diisi. Skor gabungan PENDING."
          : `Target gabungan ${formatKpiValue(aggregate.target)} · aktual ${formatKpiValue(aggregate.actual)} · skor ${aggregate.score} (${aggregate.method})`;
        const omzetIndex = items.findIndex(item => item.kpi_code === "SS01");
        if (omzetIndex >= 0 && aggregate.score !== null) {
          const targetInput = modal.querySelector(`[data-target="${omzetIndex}"]`);
          const actualInput = modal.querySelector(`[data-actual="${omzetIndex}"]`);
          if (targetInput) targetInput.value = aggregate.target;
          if (actualInput) actualInput.value = aggregate.actual;
          refreshPreview();
        }
      });

      modal.querySelector("#pm-detail-save")?.addEventListener("click", async () => {
        const button = modal.querySelector("#pm-detail-save");
        button.disabled = true;
        try {
          const result = await save();
          if (result) {
            toast("Scorecard dihitung dan disimpan.", "success");
            closeModal();
            await refreshDataAndTab();
          }
        } catch (error) {
          toast("Gagal menyimpan: " + error.message, "error");
        } finally {
          button.disabled = false;
        }
      });

      modal.querySelector("#pm-detail-submit")?.addEventListener("click", async () => {
        const { items: collected } = refreshPreview();
        const validation = validateScorecardForApproval({ ...scorecard, items: collected });
        if (!validation.valid) {
          toast(validation.errors[0], "warning");
          return;
        }
        try {
          await save("SUBMITTED");
          toast("Scorecard diajukan untuk review.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal mengajukan: " + error.message, "error");
        }
      });

      modal.querySelector("#pm-detail-approve")?.addEventListener("click", async () => {
        const { items: collected } = refreshPreview();
        const validation = validateScorecardForApproval({ ...scorecard, items: collected });
        if (!validation.valid) {
          toast(validation.errors[0], "warning");
          return;
        }
        try {
          await save("APPROVED");
          toast("Scorecard disetujui.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menyetujui: " + error.message, "error");
        }
      });

      modal.querySelector("#pm-detail-lock")?.addEventListener("click", async () => {
        if (!confirm("Kunci nilai scorecard ini? Setelah terkunci, perubahan hanya melalui koreksi.")) return;
        try {
          await save("LOCKED");
          toast("Nilai scorecard dikunci.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal mengunci: " + error.message, "error");
        }
      });

      modal.querySelector("#pm-detail-correction")?.addEventListener("click", async () => {
        const reason = prompt("Alasan permintaan koreksi:");
        if (!reason || !reason.trim()) return;
        try {
          await save("CORRECTION_REQUESTED", reason.trim());
          toast("Permintaan koreksi dikirim.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal meminta koreksi: " + error.message, "error");
        }
      });
    }
  });
}

/* -------------------------------------------------------------------------
 * MASTER KPI 2027
 * ----------------------------------------------------------------------- */
async function renderMaster(wrap) {
  wrap.innerHTML = tableShell(
    "Master KPI 2027",
    "Kamus indikator: definisi, arah pengukuran, unit, sumber data, dan pemilik data. Status masih draft sampai disahkan.",
    `${state.canConfigure && !state.masterPersisted ? primaryButton("pm-seed-kpi", "Muat Paket KPI 2027", "download") : ""}${state.canConfigure ? ghostButton("pm-master-add", "Tambah KPI", "plus") : ""}`,
    `
      ${!state.masterPersisted ? `<div class="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">Master masih memakai <b>paket draft di memori</b>. Klik “Muat Paket KPI 2027” untuk menyimpan 90+ indikator dan 13 template ke Firestore agar dapat dipakai lintas perangkat. Penulisan hanya dilakukan sekali.</div>` : ""}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label class="text-xs font-bold text-slate-600">Cari<input id="pm-master-search" placeholder="Kode / nama / sumber data" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"></label>
        <label class="text-xs font-bold text-slate-600">Arah<select id="pm-master-direction" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"><option value="">Semua Arah</option>${Object.entries(KPI_DIRECTION_LABELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
        <label class="text-xs font-bold text-slate-600">Status<select id="pm-master-status" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"><option value="">Semua Status</option><option value="DRAFT">Draft</option><option value="ACTIVE">Aktif</option><option value="RETIRED">Tidak dipakai</option></select></label>
      </div>
      <div id="pm-master-table" class="mt-4"></div>
    `
  );

  const draw = () => {
    const search = wrap.querySelector("#pm-master-search")?.value.trim().toLowerCase() || "";
    const direction = wrap.querySelector("#pm-master-direction")?.value || "";
    const status = wrap.querySelector("#pm-master-status")?.value || "";
    const rows = state.master.filter(item => {
      if (direction && upper(item.measurement_direction) !== direction) return false;
      if (status && upper(item.status || "DRAFT") !== status) return false;
      if (search) {
        const text = `${item.kpi_code || ""} ${item.kpi_name || ""} ${item.data_source || ""} ${item.data_owner_role || ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
    const holder = wrap.querySelector("#pm-master-table");
    if (!rows.length) {
      holder.innerHTML = emptyState("Tidak ada KPI pada filter ini");
      return;
    }
    holder.innerHTML = `<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full min-w-[1000px] text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Kode</th><th class="px-3 py-3">Indikator</th><th class="px-3 py-3">Arah</th><th class="px-3 py-3 text-center">Unit</th><th class="px-3 py-3">Sumber Data</th><th class="px-3 py-3">Pemilik</th><th class="px-3 py-3 text-center">Status</th><th class="px-3 py-3 text-right">Aksi</th></tr></thead><tbody class="divide-y divide-slate-100">${rows.map(item => `<tr class="hover:bg-slate-50/60 align-top"><td class="px-3 py-3 font-black text-slate-700">${escapeHtml(item.kpi_code)}</td><td class="px-3 py-3"><p class="font-bold text-slate-800">${escapeHtml(item.kpi_name)}</p><p class="text-[11px] text-slate-400 mt-0.5 max-w-md">${escapeHtml(item.definition || "")}</p></td><td class="px-3 py-3 text-slate-500">${escapeHtml(KPI_DIRECTION_LABELS[item.measurement_direction] || item.measurement_direction || "-")}</td><td class="px-3 py-3 text-center text-slate-500">${escapeHtml(item.unit || "%")}</td><td class="px-3 py-3 text-slate-500">${escapeHtml(item.data_source || "-")}</td><td class="px-3 py-3 text-slate-500">${escapeHtml(item.data_owner_role || "-")}</td><td class="px-3 py-3 text-center">${badge(item.status || "DRAFT", upper(item.status) === "ACTIVE" ? "green" : "amber")}</td><td class="px-3 py-3 text-right">${state.canConfigure ? `<div class="flex items-center justify-end gap-1.5"><button data-edit-master="${escapeHtml(item.kpi_code)}" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700">Edit</button><button data-delete-master="${escapeHtml(item.kpi_code)}" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg font-bold text-rose-700">Hapus</button></div>` : `<span class="text-slate-300">—</span>`}</td></tr>`).join("")}</tbody></table></div>`;

    holder.querySelectorAll("[data-edit-master]").forEach(button => {
      button.onclick = () => {
        const item = state.master.find(row => row.kpi_code === button.dataset.editMaster);
        if (item) openMasterEditor(item);
      };
    });
    holder.querySelectorAll("[data-delete-master]").forEach(button => {
      button.onclick = async () => {
        const code = button.dataset.deleteMaster;
        if (!confirm(`Hapus KPI ${code} dari master? Template yang sudah memakai indikator ini tetap menyimpan salinannya.`)) return;
        try {
          await fsDelete(COL.KPI_MASTER, `KPI-${code}`);
          await writeAudit({ entityType: "kpi_master", entityId: code, fieldChanged: "deleted", oldValue: code, newValue: "", reason: "Hapus KPI master" });
          toast("KPI dihapus dari master.", "success");
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menghapus KPI: " + error.message, "error");
        }
      };
    });
  };

  ["pm-master-search", "pm-master-direction", "pm-master-status"].forEach(id => {
    const input = wrap.querySelector(`#${id}`);
    input?.addEventListener(input?.tagName === "SELECT" ? "change" : "input", draw);
  });
  draw();

  wrap.querySelector("#pm-seed-kpi")?.addEventListener("click", () => persistKpiSeed());
  wrap.querySelector("#pm-master-add")?.addEventListener("click", () => openMasterEditor(null));
}

async function persistKpiSeed() {
  if (!state.canConfigure) return;
  if (state.masterPersisted) {
    toast("Master KPI sudah tersimpan.", "info");
    return;
  }
  if (!confirm(`Simpan ${KPI_MASTER_SEED.length} indikator dan ${KPI_SCORECARD_TEMPLATES_SEED.length} template KPI 2027 ke Firestore? Semua berstatus DRAFT.`)) return;
  const button = state.container?.querySelector("#pm-seed-kpi");
  if (button) {
    button.disabled = true;
    button.textContent = "Menyimpan...";
  }
  try {
    for (const item of KPI_MASTER_SEED) {
      await fsAdd(COL.KPI_MASTER, {
        ...item,
        created_by: sessionName(state.session),
        created_at: nowIso(),
        updated_at: nowIso()
      }, `KPI-${item.kpi_code}`);
    }
    for (const template of KPI_SCORECARD_TEMPLATES_SEED) {
      await fsAdd(COL.KPI_SCORECARD_TEMPLATES, {
        ...template,
        created_by: sessionName(state.session),
        created_at: nowIso(),
        updated_at: nowIso()
      }, template.template_id);
    }
    await fsAdd(COL.KPI_SETTINGS, {
      version: KPI_2027_VERSION,
      status: "DRAFT",
      seeded_at: nowIso(),
      seeded_by: sessionName(state.session),
      note: KPI_2027_LABEL
    }, "kpi_2027");
    await writeAudit({
      entityType: "kpi_master",
      entityId: "kpi_2027",
      fieldChanged: "seeded",
      oldValue: "",
      newValue: `${KPI_MASTER_SEED.length} indikator, ${KPI_SCORECARD_TEMPLATES_SEED.length} template`,
      reason: "Muat paket KPI 2027 draft"
    });
    toast("Paket KPI 2027 berhasil dimuat ke Firestore.", "success");
    await refreshDataAndTab();
  } catch (error) {
    toast("Gagal memuat paket KPI: " + error.message, "error");
    if (button) {
      button.disabled = false;
      button.textContent = "Muat Paket KPI 2027";
    }
  }
}

function openMasterEditor(item) {
  const isNew = !item;
  const row = item || {
    kpi_code: "", kpi_name: "", definition: "", unit: "%",
    measurement_direction: KPI_DIRECTIONS.HIGHER_BETTER, formula_type: "RASIO",
    data_source: "", data_owner_role: "", measurement_frequency: "Bulanan",
    validation_rule: "", status: "DRAFT"
  };
  openModal({
    title: isNew ? "Tambah KPI Master" : `Edit KPI ${row.kpi_code}`,
    size: "lg",
    bodyHtml: `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Kode KPI</span><input id="pm-master-code" value="${escapeHtml(row.kpi_code)}" ${isNew ? "" : "readonly"} class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 ${isNew ? "" : "bg-slate-100"}"></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Nama Indikator</span><input id="pm-master-name" value="${escapeHtml(row.kpi_name)}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
        <label class="block md:col-span-2"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Definisi Operasional</span><textarea id="pm-master-definition" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(row.definition || "")}</textarea></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Arah Pengukuran</span><select id="pm-master-direction-input" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${Object.entries(KPI_DIRECTION_LABELS).map(([key, label]) => `<option value="${key}" ${row.measurement_direction === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Unit</span><input id="pm-master-unit" value="${escapeHtml(row.unit || "%")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Sumber Data</span><input id="pm-master-source" value="${escapeHtml(row.data_source || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Pemilik Data</span><input id="pm-master-owner" value="${escapeHtml(row.data_owner_role || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Frekuensi</span><input id="pm-master-frequency" value="${escapeHtml(row.measurement_frequency || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Status</span><select id="pm-master-status-input" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="DRAFT" ${row.status === "DRAFT" ? "selected" : ""}>Draft</option><option value="ACTIVE" ${row.status === "ACTIVE" ? "selected" : ""}>Aktif</option><option value="RETIRED" ${row.status === "RETIRED" ? "selected" : ""}>Tidak dipakai</option></select></label>
        <label class="block md:col-span-2"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Aturan Validasi</span><textarea id="pm-master-validation" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(row.validation_rule || "")}</textarea></label>
      </div>`,
    footerHtml: `<button id="pm-master-cancel" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Batal</button><button id="pm-master-save" class="px-5 py-2 bg-maroon-700 text-white text-sm font-medium rounded-lg">Simpan KPI</button>`,
    onMount: (modal) => {
      modal.querySelector("#pm-master-cancel").onclick = closeModal;
      modal.querySelector("#pm-master-save").onclick = async () => {
        const code = modal.querySelector("#pm-master-code").value.trim().toUpperCase();
        const name = modal.querySelector("#pm-master-name").value.trim();
        if (!code || !name) {
          toast("Kode dan nama KPI wajib diisi.", "warning");
          return;
        }
        const payload = {
          kpi_id: `KPI-${code}`,
          kpi_code: code,
          kpi_name: name,
          definition: modal.querySelector("#pm-master-definition").value.trim(),
          unit: modal.querySelector("#pm-master-unit").value.trim() || "%",
          measurement_direction: modal.querySelector("#pm-master-direction-input").value,
          formula_type: modal.querySelector("#pm-master-direction-input").value,
          data_source: modal.querySelector("#pm-master-source").value.trim(),
          data_owner_role: modal.querySelector("#pm-master-owner").value.trim(),
          measurement_frequency: modal.querySelector("#pm-master-frequency").value.trim(),
          validation_rule: modal.querySelector("#pm-master-validation").value.trim(),
          status: modal.querySelector("#pm-master-status-input").value,
          version: KPI_2027_VERSION,
          effective_from: "2027-01-01",
          updated_at: nowIso(),
          updated_by: sessionName(state.session)
        };
        try {
          if (isNew) {
            await fsAdd(COL.KPI_MASTER, payload, `KPI-${code}`);
          } else {
            await fsUpdate(COL.KPI_MASTER, `KPI-${code}`, payload);
          }
          await writeAudit({ entityType: "kpi_master", entityId: code, fieldChanged: isNew ? "created" : "updated", oldValue: row.kpi_name || "", newValue: name, reason: "Simpan master KPI" });
          toast("Master KPI tersimpan.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menyimpan KPI: " + error.message, "error");
        }
      };
    }
  });
}

/* -------------------------------------------------------------------------
 * TEMPLATE SCORECARD
 * ----------------------------------------------------------------------- */
async function renderTemplates(wrap) {
  const cards = state.templates.map(template => {
    const weights = validateWeights(template.items || []);
    return `<div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2"><h3 class="font-bold text-slate-800 text-base">${escapeHtml(template.position_name)}</h3>${badge(template.status || "DRAFT", template.status === "ACTIVE" ? "green" : "amber")}</div>
          <p class="text-xs text-slate-400 mt-1">${escapeHtml(template.scope || "POSITION")} · ${template.items?.length || 0} indikator · versi ${escapeHtml(template.version || KPI_2027_VERSION)}</p>
        </div>
        <p class="text-xs font-black ${weights.valid ? "text-emerald-700" : "text-rose-700"}">${weights.total}%</p>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">${(template.items || []).slice(0, 5).map(item => `<span class="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-600">${escapeHtml(item.kpi_code)} · ${Number(item.weight_percent || 0)}%</span>`).join("")}${(template.items || []).length > 5 ? `<span class="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500">+${(template.items || []).length - 5} lagi</span>` : ""}</div>
      ${template.notes ? `<p class="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">${escapeHtml(template.notes)}</p>` : ""}
      <div class="mt-4 flex flex-wrap gap-2">
        <button data-view-template="${escapeHtml(template.template_id)}" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg">Lihat Indikator</button>
        ${state.canConfigure ? `<button data-edit-template="${escapeHtml(template.template_id)}" class="px-3 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-lg">Edit Bobot & Target</button>` : ""}
      </div>
    </div>`;
  }).join("");

  wrap.innerHTML = `
    ${!state.templatesPersisted ? `<div class="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">Template masih memakai <b>paket draft di memori</b>. Buat scorecard tetap bisa dilakukan karena item disalin ke scorecard. Untuk mengubah lintas perangkat, simpan paket melalui tab Master KPI.</div>` : ""}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${cards || emptyState("Belum ada template scorecard")}</div>
  `;

  wrap.querySelectorAll("[data-view-template]").forEach(button => {
    button.onclick = () => openTemplateDetail(button.dataset.viewTemplate);
  });
  wrap.querySelectorAll("[data-edit-template]").forEach(button => {
    button.onclick = () => openTemplateEditor(button.dataset.editTemplate);
  });
}

function openTemplateDetail(templateId) {
  const template = state.templates.find(row => row.template_id === templateId);
  if (!template) return;
  const weights = validateWeights(template.items || []);
  openModal({
    title: `Template · ${template.position_name}`,
    size: "xl",
    bodyHtml: `
      <div class="space-y-3 text-sm">
        <div class="flex flex-wrap items-center gap-2">${badge(template.status || "DRAFT", "amber")}<span class="text-xs text-slate-500">${template.items?.length || 0} indikator · total bobot <b class="${weights.valid ? "text-emerald-700" : "text-rose-700"}">${weights.total}%</b></span></div>
        ${template.notes ? `<p class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">${escapeHtml(template.notes)}</p>` : ""}
        <div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full min-w-[760px] text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Kode</th><th class="px-3 py-3">Indikator</th><th class="px-3 py-3 text-center">Bobot</th><th class="px-3 py-3 text-center">Target Usulan</th><th class="px-3 py-3">Arah</th><th class="px-3 py-3">Sumber Data</th></tr></thead><tbody class="divide-y divide-slate-100">${(template.items || []).map(item => `<tr><td class="px-3 py-3 font-black text-slate-700">${escapeHtml(item.kpi_code)}</td><td class="px-3 py-3"><p class="font-bold text-slate-800">${escapeHtml(item.kpi_name)}</p><p class="text-[11px] text-slate-400 max-w-md">${escapeHtml(item.definition || "")}</p></td><td class="px-3 py-3 text-center font-bold">${Number(item.weight_percent || 0)}%</td><td class="px-3 py-3 text-center">${escapeHtml(item.target_label || formatKpiValue(item.target_value, item.target_unit))}</td><td class="px-3 py-3 text-slate-500">${escapeHtml(KPI_DIRECTION_LABELS[item.measurement_direction] || item.measurement_direction || "-")}</td><td class="px-3 py-3 text-slate-500">${escapeHtml(item.data_source || "-")}</td></tr>`).join("")}</tbody></table></div>
      </div>`,
    footerHtml: `<button id="pm-template-close" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Tutup</button>`,
    onMount: (modal) => {
      modal.querySelector("#pm-template-close").onclick = closeModal;
    }
  });
}

function openTemplateEditor(templateId) {
  const template = state.templates.find(row => row.template_id === templateId);
  if (!template) return;
  const masterOptions = state.master.map(item => `<option value="${escapeHtml(item.kpi_code)}">${escapeHtml(item.kpi_code)} · ${escapeHtml(item.kpi_name)}</option>`).join("");
  const rowHtml = (item, index) => `
    <tr data-template-row="${index}" class="border-t border-slate-100">
      <td class="px-3 py-2"><p class="font-bold text-slate-800">${escapeHtml(item.kpi_code)}</p><p class="text-[11px] text-slate-400">${escapeHtml(item.kpi_name)}</p></td>
      <td class="px-3 py-2"><input type="number" step="any" min="0" max="100" data-row-weight="${index}" value="${Number(item.weight_percent || 0)}" class="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center font-bold"></td>
      <td class="px-3 py-2"><input type="number" step="any" min="0" data-row-target="${index}" value="${item.target_value ?? ""}" class="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-center"></td>
      <td class="px-3 py-2"><select data-row-direction="${index}" class="rounded-lg border border-slate-200 px-2 py-1.5">${Object.entries(KPI_DIRECTION_LABELS).map(([key, label]) => `<option value="${key}" ${item.measurement_direction === key ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td class="px-3 py-2 text-center"><button type="button" data-row-remove="${index}" class="px-2 py-1.5 bg-rose-50 text-rose-700 rounded-lg font-bold">Hapus</button></td>
    </tr>`;
  openModal({
    title: `Edit Template · ${template.position_name}`,
    size: "xl",
    bodyHtml: `
      <div class="space-y-3 text-sm">
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Mengubah bobot/target setelah periode berjalan wajib memiliki alasan dan persetujuan. Perubahan akan dicatat di audit trail.</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Nama Jabatan</span><input id="pm-template-name" value="${escapeHtml(template.position_name)}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Status</span><select id="pm-template-status" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="DRAFT" ${template.status === "DRAFT" ? "selected" : ""}>Draft</option><option value="ACTIVE" ${template.status === "ACTIVE" ? "selected" : ""}>Aktif</option><option value="RETIRED" ${template.status === "RETIRED" ? "selected" : ""}>Tidak dipakai</option></select></label>
        </div>
        <div class="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label class="text-xs font-bold text-slate-600">Tambah Indikator<select id="pm-template-add-select" class="mt-1 w-full min-w-[260px] rounded-lg border border-slate-200 px-2 py-1.5">${masterOptions}</select></label>
          <button id="pm-template-add-row" type="button" class="px-3 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg">Tambah ke Template</button>
        </div>
        <div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full min-w-[760px] text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Indikator</th><th class="px-3 py-3 text-center">Bobot</th><th class="px-3 py-3 text-center">Target</th><th class="px-3 py-3">Arah</th><th class="px-3 py-3 text-center">Aksi</th></tr></thead><tbody id="pm-template-rows">${(template.items || []).map(rowHtml).join("")}</tbody></table></div>
        <p id="pm-template-weight-note" class="text-xs font-bold text-slate-500"></p>
      </div>`,
    footerHtml: `<button id="pm-template-cancel" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Batal</button><button id="pm-template-save" class="px-5 py-2 bg-maroon-700 text-white text-sm font-medium rounded-lg">Simpan Template</button>`,
    onMount: (modal) => {
      let nextIndex = 1000;
      const rowsBody = modal.querySelector("#pm-template-rows");
      const updateWeightNote = () => {
        const values = [...modal.querySelectorAll("[data-row-weight]")].map(input => Number(input.value) || 0);
        const total = Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
        const note = modal.querySelector("#pm-template-weight-note");
        if (note) {
          note.textContent = `Total bobot: ${total}% ${Math.abs(total - 100) <= 0.01 ? "(valid)" : "(harus 100%)"}`;
          note.className = `text-xs font-bold ${Math.abs(total - 100) <= 0.01 ? "text-emerald-700" : "text-rose-700"}`;
        }
      };
      modal.querySelectorAll("[data-row-weight]").forEach(input => input.addEventListener("input", updateWeightNote));
      updateWeightNote();

      modal.querySelector("#pm-template-add-row").onclick = () => {
        const code = modal.querySelector("#pm-template-add-select").value;
        const master = state.master.find(item => item.kpi_code === code);
        if (!master) return;
        const index = nextIndex++;
        rowsBody.insertAdjacentHTML("beforeend", rowHtml({ ...master, weight_percent: 0, target_value: 100 }, index));
        const weightInput = modal.querySelector(`[data-row-weight="${index}"]`);
        weightInput?.addEventListener("input", updateWeightNote);
        modal.querySelector(`[data-row-remove="${index}"]`)?.addEventListener("click", event => {
          event.currentTarget.closest("tr")?.remove();
          updateWeightNote();
        });
        updateWeightNote();
      };

      modal.querySelectorAll("[data-row-remove]").forEach(button => {
        button.onclick = () => {
          button.closest("tr")?.remove();
          updateWeightNote();
        };
      });

      modal.querySelector("#pm-template-cancel").onclick = closeModal;
      modal.querySelector("#pm-template-save").onclick = async () => {
        const rows = [...modal.querySelectorAll("[data-template-row]")].map(row => {
          const index = row.dataset.templateRow;
          const code = row.querySelector("p")?.textContent?.trim() || "";
          const master = state.master.find(item => item.kpi_code === code);
          return {
            ...(master || {}),
            kpi_code: code,
            kpi_name: master?.kpi_name || code,
            weight_percent: Number(modal.querySelector(`[data-row-weight="${index}"]`)?.value) || 0,
            target_value: Number(modal.querySelector(`[data-row-target="${index}"]`)?.value),
            measurement_direction: modal.querySelector(`[data-row-direction="${index}"]`)?.value || KPI_DIRECTIONS.HIGHER_BETTER
          };
        });
        const weights = validateWeights(rows);
        if (!weights.valid) {
          toast(weights.message, "warning");
          return;
        }
        const payload = {
          ...template,
          position_name: modal.querySelector("#pm-template-name").value.trim() || template.position_name,
          status: modal.querySelector("#pm-template-status").value,
          items: rows,
          updated_at: nowIso(),
          updated_by: sessionName(state.session)
        };
        try {
          if (state.templatesPersisted) {
            await fsUpdate(COL.KPI_SCORECARD_TEMPLATES, template.template_id, payload);
          } else {
            await fsAdd(COL.KPI_SCORECARD_TEMPLATES, { ...payload, created_at: nowIso() }, template.template_id);
          }
          await writeAudit({
            entityType: "scorecard_template",
            entityId: template.template_id,
            fieldChanged: "items",
            oldValue: `${template.items?.length || 0} indikator`,
            newValue: `${rows.length} indikator, bobot ${weights.total}%`,
            reason: "Edit bobot/target template"
          });
          toast("Template scorecard tersimpan.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menyimpan template: " + error.message, "error");
        }
      };
    }
  });
}

/* -------------------------------------------------------------------------
 * CETAK SCORECARD
 * ----------------------------------------------------------------------- */
function buildScorecardHtml(scorecard, calculation) {
  const rows = (calculation?.items || scorecard.items || []).map(item => `
    <tr>
      <td style="border:1px solid #000;padding:5px;">${escapeHtml(item.kpi_code || "")} — ${escapeHtml(item.kpi_name || "")}</td>
      <td style="border:1px solid #000;padding:5px;text-align:center;">${Number(item.weight_percent || 0)}%</td>
      <td style="border:1px solid #000;padding:5px;text-align:center;">${escapeHtml(item.target_label || formatKpiValue(item.target_value, item.target_unit))}</td>
      <td style="border:1px solid #000;padding:5px;text-align:center;">${formatKpiValue(item.actual_value, item.target_unit)}</td>
      <td style="border:1px solid #000;padding:5px;text-align:center;font-weight:bold;">${item.status === KPI_ITEM_STATUS.SCORED ? item.score : "PENDING"}</td>
      <td style="border:1px solid #000;padding:5px;">${escapeHtml(item.evidence_reference || item.evidence || "-")}</td>
    </tr>`).join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff;padding:18px;max-width:900px;margin:0 auto;">
    ${isoDocHeaderTable({ judul: "LAPORAN SCORECARD KPI 2027 (DRAFT)", noDok: "HR-KPI-2027", terbitRevisi: "0.1/0", tglTerbit: fmtDateShort(nowIso()), hal: "1 dari 1" })}
    <h3 style="text-align:center;text-transform:uppercase;text-decoration:underline;margin:12px 0;">Scorecard Kinerja Karyawan</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11px;border:1px solid #000;">
      <tr><td style="border:1px solid #000;padding:5px;font-weight:bold;width:22%;">Nama Karyawan</td><td style="border:1px solid #000;padding:5px;">${escapeHtml(scorecard.employee_name || "-")}</td><td style="border:1px solid #000;padding:5px;font-weight:bold;width:22%;">NIK</td><td style="border:1px solid #000;padding:5px;">${escapeHtml(scorecard.employee_nik || scorecard.nik || "-")}</td></tr>
      <tr><td style="border:1px solid #000;padding:5px;font-weight:bold;">Jabatan</td><td style="border:1px solid #000;padding:5px;">${escapeHtml(scorecard.position || "-")}</td><td style="border:1px solid #000;padding:5px;font-weight:bold;">Cabang</td><td style="border:1px solid #000;padding:5px;">${escapeHtml(scorecard.branch || "-")}</td></tr>
      <tr><td style="border:1px solid #000;padding:5px;font-weight:bold;">Periode</td><td style="border:1px solid #000;padding:5px;">${escapeHtml(scorecard.period_label || scorecard.period_year || "-")}</td><td style="border:1px solid #000;padding:5px;font-weight:bold;">Status</td><td style="border:1px solid #000;padding:5px;">${escapeHtml(KPI_SCORECARD_STATUS_LABELS[upper(scorecard.status)] || scorecard.status || "DRAFT")}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead><tr style="background:#f1f5f9;"><th style="border:1px solid #000;padding:5px;">Indikator</th><th style="border:1px solid #000;padding:5px;">Bobot</th><th style="border:1px solid #000;padding:5px;">Target</th><th style="border:1px solid #000;padding:5px;">Aktual</th><th style="border:1px solid #000;padding:5px;">Skor</th><th style="border:1px solid #000;padding:5px;">Bukti</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px;border:1px solid #000;padding:8px;background:#f8fafc;">
      <b>Skor akhir: ${calculation?.final_score ?? calculation?.provisional_score ?? "PENDING"}</b> — ${escapeHtml(getProposedRating(calculation?.final_score ?? calculation?.provisional_score).label)}<br/>
      <span style="font-size:10px;">${calculation?.provisional ? "Nilai sementara; masih ada indikator PENDING." : "Nilai final untuk periode ini."} Skor KPI bukan dasar pembayaran/promosi/sanksi otomatis.</span>
    </div>
    <p style="margin-top:8px;font-size:9px;color:#555;">Dokumen ini dihasilkan dari paket KPI 2027 versi ${KPI_2027_VERSION} yang masih berstatus DRAFT. Target dan bobot wajib disahkan manajemen.</p>
    <table style="width:100%;margin-top:30px;text-align:center;font-size:10px;"><tr><td>Karyawan,</td><td>Atasan / Reviewer,</td><td>HRD,</td></tr><tr><td style="height:50px;"></td><td></td><td></td></tr><tr><td>( ${escapeHtml(scorecard.employee_name || "-")} )</td><td>( ${escapeHtml(scorecard.supervisor_name || "-")} )</td><td>( ________________ )</td></tr></table>
  </div>`;
}

function printScorecard(scorecard, calculation) {
  const html = buildScorecardHtml(scorecard, calculation);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast("Popup diblokir browser. Izinkan popup untuk mencetak.", "warning");
    return;
  }
  printWindow.document.write(`<html><head><title>Scorecard KPI 2027 — ${escapeHtml(scorecard.employee_name || "")}</title></head><body onload="window.print();window.close();">${html}</body></html>`);
  printWindow.document.close();
}

/* -------------------------------------------------------------------------
 * REVIEW & KALIBRASI
 * ----------------------------------------------------------------------- */
async function renderReviews(wrap) {
  const rows = state.reviews;
  const actions = state.canReview ? primaryButton("pm-review-create", "Buat Review", "plus") : "";
  wrap.innerHTML = tableShell(
    state.canViewAll ? "Review & Kalibrasi" : "Review Saya",
    "Review formal menghubungkan skor scorecard dengan komentar atasan, HR, dan status kalibrasi. Bukan keputusan otomatis.",
    actions,
    rows.length ? `<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full min-w-[880px] text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Karyawan</th><th class="px-3 py-3">Periode</th><th class="px-3 py-3 text-center">Skor Akhir</th><th class="px-3 py-3 text-center">Predikat Usulan</th><th class="px-3 py-3 text-center">Kalibrasi</th><th class="px-3 py-3 text-center">Status</th><th class="px-3 py-3 text-right">Aksi</th></tr></thead><tbody class="divide-y divide-slate-100">${rows.map(review => `<tr class="hover:bg-slate-50/60"><td class="px-3 py-3"><b class="text-slate-800">${escapeHtml(review.employee_name || "-")}</b><br><span class="text-slate-400">${escapeHtml(review.employee_nik || review.nik || "")}</span></td><td class="px-3 py-3 text-slate-600">${escapeHtml(review.review_period || "-")}<br><span class="text-slate-400">${escapeHtml(review.position || "")}</span></td><td class="px-3 py-3 text-center font-black text-indigo-700">${review.final_score ?? "—"}</td><td class="px-3 py-3 text-center">${ratingBadge(review.final_score)}</td><td class="px-3 py-3 text-center">${badge(review.calibration_status || "PENDING", review.calibration_status === "CALIBRATED" ? "green" : "amber")}</td><td class="px-3 py-3 text-center">${badge(review.status || "DRAFT", review.status === "APPROVED" ? "green" : "slate")}</td><td class="px-3 py-3 text-right"><button data-open-review="${escapeHtml(review.id || review._docId)}" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700">Detail</button></td></tr>`).join("")}</tbody></table></div>` : emptyState("Belum ada review", "Review dibuat dari scorecard yang sudah memiliki nilai dan bukti.")
  );

  wrap.querySelector("#pm-review-create")?.addEventListener("click", openCreateReviewModal);
  wrap.querySelectorAll("[data-open-review]").forEach(button => {
    button.onclick = () => openReviewDetail(button.dataset.openReview);
  });
}

function openCreateReviewModal() {
  const eligible = state.scorecards.filter(scorecard => {
    const summary = summarizeScorecard(scorecard);
    return summary.final_score !== null || summary.provisional_score !== null;
  });
  if (!eligible.length) {
    toast("Belum ada scorecard yang memiliki nilai. Lengkapi aktual dan bukti terlebih dahulu.", "warning");
    return;
  }
  const options = eligible.map(scorecard => `<option value="${escapeHtml(scorecard.id || scorecard._docId)}">${escapeHtml(scorecard.employee_name || "-")} · ${escapeHtml(scorecard.period_label || scorecard.period_year || "")} · ${summarizeScorecard(scorecard).final_score ?? summarizeScorecard(scorecard).provisional_score ?? "PENDING"}</option>`).join("");
  openModal({
    title: "Buat Review Kinerja 2027",
    size: "lg",
    bodyHtml: `
      <div class="space-y-3 text-sm">
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Scorecard</span><select id="pm-review-scorecard" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${options}</select></label>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Periode Review</span><input id="pm-review-period" value="Tahun 2027" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
          <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Status Kalibrasi</span><select id="pm-review-calibration" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="PENDING">PENDING — belum dikalibrasi</option><option value="CALIBRATED">CALIBRATED — sudah dikalibrasi</option></select></label>
        </div>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Komentar Atasan</span><textarea id="pm-review-supervisor" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></textarea></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Komentar HR</span><textarea id="pm-review-hr" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></textarea></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Komentar Karyawan</span><textarea id="pm-review-employee" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></textarea></label>
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Predikat yang dihasilkan adalah <b>usulan</b>. Kalibrasi dan persetujuan tetap wajib sebelum dipakai untuk keputusan.</div>
      </div>`,
    footerHtml: `<button id="pm-review-cancel" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Batal</button><button id="pm-review-save" class="px-5 py-2 bg-maroon-700 text-white text-sm font-medium rounded-lg">Simpan Review</button>`,
    onMount: (modal) => {
      modal.querySelector("#pm-review-cancel").onclick = closeModal;
      modal.querySelector("#pm-review-save").onclick = async () => {
        const scorecardId = modal.querySelector("#pm-review-scorecard").value;
        const scorecard = state.scorecards.find(item => (item.id || item._docId) === scorecardId);
        if (!scorecard) return;
        const summary = summarizeScorecard(scorecard);
        const finalScore = summary.final_score ?? summary.provisional_score;
        const payload = {
          review_id: genId("KREV"),
          scorecard_id: scorecardId,
          employee_id: scorecard.employee_id || "",
          employee_nik: scorecard.employee_nik || scorecard.nik || "",
          nik: scorecard.employee_nik || scorecard.nik || "",
          employee_name: scorecard.employee_name || "",
          position: scorecard.position || "",
          branch: scorecard.branch || "",
          review_period: modal.querySelector("#pm-review-period").value.trim() || scorecard.period_label || "",
          final_score: finalScore,
          rating: getProposedRating(finalScore).label,
          supervisor_comments: modal.querySelector("#pm-review-supervisor").value.trim(),
          hr_comments: modal.querySelector("#pm-review-hr").value.trim(),
          employee_comments: modal.querySelector("#pm-review-employee").value.trim(),
          calibration_status: modal.querySelector("#pm-review-calibration").value,
          status: "DRAFT",
          created_by: sessionName(state.session),
          created_by_nik: sessionNik(state.session),
          created_at: nowIso(),
          updated_at: nowIso()
        };
        try {
          const id = genId("KREV");
          payload.review_id = id;
          await fsAdd(COL.KPI_REVIEWS, payload, id);
          await writeAudit({ entityType: "performance_review", entityId: id, fieldChanged: "created", oldValue: "", newValue: `${payload.employee_name} · ${payload.review_period}`, reason: "Buat review KPI 2027" });
          toast("Review berhasil dibuat.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal membuat review: " + error.message, "error");
        }
      };
    }
  });
}

function openReviewDetail(reviewId) {
  const review = state.reviews.find(row => (row.id || row._docId) === reviewId);
  if (!review) return;
  const scorecard = state.scorecards.find(row => (row.id || row._docId) === review.scorecard_id);
  const summary = scorecard ? summarizeScorecard(scorecard) : null;
  openModal({
    title: `Review · ${review.employee_name || "-"} · ${review.review_period || ""}`,
    size: "xl",
    bodyHtml: `
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Karyawan</p><p class="font-bold text-slate-800 mt-1">${escapeHtml(review.employee_name || "-")}</p><p class="text-[11px] text-slate-400">${escapeHtml(review.employee_nik || review.nik || "")}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Skor Akhir</p><p class="text-2xl font-black text-indigo-700 mt-1">${review.final_score ?? "—"}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Predikat Usulan</p><p class="mt-1">${ratingBadge(review.final_score)}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400">Status</p><p class="mt-1">${badge(review.status || "DRAFT", review.status === "APPROVED" ? "green" : "slate")}</p><p class="text-[11px] text-slate-400 mt-1">${escapeHtml(review.calibration_status || "PENDING")}</p></div>
        </div>
        ${summary ? `<div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Scorecard: <b>${escapeHtml(scorecard.period_label || "")}</b> · ${summary.pending_count} indikator PENDING · ${summary.scored_items.length} indikator sudah dinilai.</div>` : ""}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400 mb-1">Komentar Atasan</p><p class="text-xs text-slate-700 whitespace-pre-line">${escapeHtml(review.supervisor_comments || "-")}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400 mb-1">Komentar HR</p><p class="text-xs text-slate-700 whitespace-pre-line">${escapeHtml(review.hr_comments || "-")}</p></div>
          <div class="rounded-xl border border-slate-200 p-3"><p class="text-[10px] font-black uppercase text-slate-400 mb-1">Komentar Karyawan</p><p class="text-xs text-slate-700 whitespace-pre-line">${escapeHtml(review.employee_comments || "-")}</p></div>
        </div>
        ${review.approved_by ? `<p class="text-[11px] text-emerald-700">Disetujui oleh ${escapeHtml(review.approved_by)} pada ${fmtDateShort(review.approved_at)}.</p>` : ""}
      </div>`,
    footerHtml: `<button id="pm-review-close" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Tutup</button>${state.canApprove && review.status !== "APPROVED" ? `<button id="pm-review-approve" class="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Setujui Review</button>` : ""}`,
    onMount: (modal) => {
      modal.querySelector("#pm-review-close").onclick = closeModal;
      modal.querySelector("#pm-review-approve")?.addEventListener("click", async () => {
        try {
          await fsUpdate(COL.KPI_REVIEWS, review.id || review._docId, {
            status: "APPROVED",
            approved_by: sessionName(state.session),
            approved_at: nowIso(),
            updated_at: nowIso()
          });
          await writeAudit({ entityType: "performance_review", entityId: review.id || review._docId, fieldChanged: "status", oldValue: review.status || "DRAFT", newValue: "APPROVED", reason: "Persetujuan review" });
          toast("Review disetujui.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menyetujui review: " + error.message, "error");
        }
      });
    }
  });
}

/* -------------------------------------------------------------------------
 * COACHING & ACTION PLAN
 * ----------------------------------------------------------------------- */
async function renderCoaching(wrap) {
  const rows = state.coaching;
  wrap.innerHTML = tableShell(
    "Coaching & Action Plan",
    "Tindak lanjut atas gap kinerja. Fokus pada perbaikan, bukan sanksi otomatis.",
    state.canCoaching ? primaryButton("pm-coaching-create", "Tambah Action Plan", "plus") : "",
    rows.length ? `<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${rows.map(action => `<div class="rounded-xl border border-slate-200 p-4"><div class="flex items-start justify-between gap-2"><div><p class="text-xs font-black text-slate-800">${escapeHtml(action.employee_name || "-")}</p><p class="text-[11px] text-slate-400">${escapeHtml(action.performance_gap || "Gap belum diisi")}</p></div>${badge(action.status || "OPEN", ["DONE", "SELESAI"].includes(upper(action.status)) ? "green" : upper(action.status) === "CANCELLED" ? "red" : "amber")}</div><p class="mt-2 text-xs text-slate-600"><b>Rencana:</b> ${escapeHtml(action.action_plan || "-")}</p><p class="mt-1 text-[11px] text-slate-500"><b>Pemilik:</b> ${escapeHtml(action.owner_name || "-")} · <b>Tenggat:</b> ${escapeHtml(action.due_date || "-")}</p>${action.outcome ? `<p class="mt-1 text-[11px] text-emerald-700"><b>Hasil:</b> ${escapeHtml(action.outcome)}</p>` : ""}<div class="mt-3 flex gap-2">${state.canCoaching ? `<button data-edit-coaching="${escapeHtml(action.id || action._docId)}" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700">Edit</button>` : ""}</div></div>`).join("")}</div>` : emptyState("Belum ada action plan", "Buat tindak lanjut setelah review atau ketika ada gap kinerja yang terverifikasi.")
  );

  wrap.querySelector("#pm-coaching-create")?.addEventListener("click", () => openCoachingModal(null));
  wrap.querySelectorAll("[data-edit-coaching]").forEach(button => {
    button.onclick = () => {
      const action = state.coaching.find(row => (row.id || row._docId) === button.dataset.editCoaching);
      if (action) openCoachingModal(action);
    };
  });
}

function openCoachingModal(action) {
  const isNew = !action;
  const row = action || {};
  const employeeOptions = state.employees.map(employee => `<option value="${escapeHtml(employeeNik(employee))}" ${row.employee_nik === employeeNik(employee) ? "selected" : ""}>${escapeHtml(employeeName(employee))} (${escapeHtml(employeeNik(employee))})</option>`).join("");
  const reviewOptions = state.reviews.map(review => `<option value="${escapeHtml(review.id || review._docId)}" ${row.review_id === (review.id || review._docId) ? "selected" : ""}>${escapeHtml(review.employee_name || "-")} · ${escapeHtml(review.review_period || "")}</option>`).join("");
  openModal({
    title: isNew ? "Tambah Coaching / Action Plan" : "Edit Coaching / Action Plan",
    size: "lg",
    bodyHtml: `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Karyawan</span><select id="pm-coach-employee" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${employeeOptions}</select></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Terkait Review</span><select id="pm-coach-review" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">Tidak terkait review</option>${reviewOptions}</select></label>
        <label class="block md:col-span-2"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Gap Kinerja</span><textarea id="pm-coach-gap" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(row.performance_gap || "")}</textarea></label>
        <label class="block md:col-span-2"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Akar Masalah</span><textarea id="pm-coach-root" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(row.root_cause || "")}</textarea></label>
        <label class="block md:col-span-2"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Rencana Tindakan</span><textarea id="pm-coach-plan" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(row.action_plan || "")}</textarea></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Pemilik Tindakan</span><input id="pm-coach-owner" value="${escapeHtml(row.owner_name || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Tenggat</span><input id="pm-coach-due" type="date" value="${escapeHtml(row.due_date || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></label>
        <label class="block"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Status</span><select id="pm-coach-status" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].map(status => `<option value="${status}" ${upper(row.status) === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
        <label class="block md:col-span-2"><span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Hasil / Outcome</span><textarea id="pm-coach-outcome" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(row.outcome || "")}</textarea></label>
      </div>`,
    footerHtml: `<button id="pm-coach-cancel" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg">Batal</button><button id="pm-coach-save" class="px-5 py-2 bg-maroon-700 text-white text-sm font-medium rounded-lg">Simpan</button>`,
    onMount: (modal) => {
      modal.querySelector("#pm-coach-cancel").onclick = closeModal;
      modal.querySelector("#pm-coach-save").onclick = async () => {
        const employee = state.employees.find(item => employeeNik(item) === modal.querySelector("#pm-coach-employee").value);
        const reviewId = modal.querySelector("#pm-coach-review").value;
        const review = state.reviews.find(item => (item.id || item._docId) === reviewId);
        const payload = {
          action_id: row.action_id || genId("KCOACH"),
          employee_nik: employeeNik(employee),
          nik: employeeNik(employee),
          employee_name: employeeName(employee),
          branch: employeeBranch(employee),
          position: employeePosition(employee),
          review_id: reviewId,
          performance_gap: modal.querySelector("#pm-coach-gap").value.trim(),
          root_cause: modal.querySelector("#pm-coach-root").value.trim(),
          action_plan: modal.querySelector("#pm-coach-plan").value.trim(),
          owner_name: modal.querySelector("#pm-coach-owner").value.trim(),
          owner_id: sessionNik(state.session),
          due_date: modal.querySelector("#pm-coach-due").value,
          status: modal.querySelector("#pm-coach-status").value,
          outcome: modal.querySelector("#pm-coach-outcome").value.trim(),
          updated_at: nowIso()
        };
        if (!payload.performance_gap || !payload.action_plan) {
          toast("Gap kinerja dan rencana tindakan wajib diisi.", "warning");
          return;
        }
        try {
          if (isNew) {
            await fsAdd(COL.KPI_COACHING, payload, payload.action_id);
          } else {
            await fsUpdate(COL.KPI_COACHING, row.id || row._docId, payload);
          }
          await writeAudit({ entityType: "coaching_action", entityId: payload.action_id, fieldChanged: isNew ? "created" : "updated", oldValue: row.status || "", newValue: payload.status, reason: "Simpan coaching/action plan" });
          toast("Action plan tersimpan.", "success");
          closeModal();
          await refreshDataAndTab();
        } catch (error) {
          toast("Gagal menyimpan action plan: " + error.message, "error");
        }
      };
    }
  });
}

/* -------------------------------------------------------------------------
 * JEJAK AUDIT
 * ----------------------------------------------------------------------- */
async function renderAudit(wrap) {
  wrap.innerHTML = tableShell(
    "Jejak Audit KPI 2027",
    "Catatan perubahan penting: target, aktual, status, dan template. Audit tidak dapat diubah/dihapus dari UI.",
    ghostButton("pm-audit-refresh", "Muat Ulang", "refresh"),
    `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label class="text-xs font-bold text-slate-600">Entitas<input id="pm-audit-entity" placeholder="employee_scorecard / kpi_master" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"></label>
        <label class="text-xs font-bold text-slate-600">Cari<input id="pm-audit-search" placeholder="Aktor / alasan / field" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-medium"></label>
      </div>
      <div id="pm-audit-table" class="mt-4"></div>
    `
  );

  const draw = () => {
    const entity = wrap.querySelector("#pm-audit-entity")?.value.trim().toLowerCase() || "";
    const search = wrap.querySelector("#pm-audit-search")?.value.trim().toLowerCase() || "";
    const rows = state.audit.filter(row => {
      if (entity && !String(row.entity_type || "").toLowerCase().includes(entity)) return false;
      if (search) {
        const text = `${row.changed_by || ""} ${row.change_reason || ""} ${row.field_changed || ""} ${row.entity_id || ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
    const holder = wrap.querySelector("#pm-audit-table");
    if (!rows.length) {
      holder.innerHTML = emptyState("Belum ada jejak audit pada filter ini");
      return;
    }
    holder.innerHTML = `<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full min-w-[900px] text-left text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-3 py-3">Waktu</th><th class="px-3 py-3">Entitas</th><th class="px-3 py-3">Field</th><th class="px-3 py-3">Nilai Lama</th><th class="px-3 py-3">Nilai Baru</th><th class="px-3 py-3">Aktor</th><th class="px-3 py-3">Alasan</th></tr></thead><tbody class="divide-y divide-slate-100">${rows.map(row => `<tr class="align-top"><td class="px-3 py-3 text-slate-500 whitespace-nowrap">${escapeHtml(fmtDateShort(row.changed_at || row.created_at || ""))}</td><td class="px-3 py-3"><b class="text-slate-700">${escapeHtml(row.entity_type || "-")}</b><br><span class="text-[10px] text-slate-400">${escapeHtml(row.entity_id || "")}</span></td><td class="px-3 py-3 text-slate-600">${escapeHtml(row.field_changed || "-")}</td><td class="px-3 py-3 text-slate-500 max-w-[160px] break-words">${escapeHtml(String(row.old_value || "-"))}</td><td class="px-3 py-3 text-slate-700 max-w-[160px] break-words">${escapeHtml(String(row.new_value || "-"))}</td><td class="px-3 py-3 text-slate-600">${escapeHtml(row.changed_by || "-")}</td><td class="px-3 py-3 text-slate-500 max-w-[220px]">${escapeHtml(row.change_reason || "-")}</td></tr>`).join("")}</tbody></table></div>`;
  };

  ["pm-audit-entity", "pm-audit-search"].forEach(id => {
    wrap.querySelector(`#${id}`)?.addEventListener("input", draw);
  });
  draw();
  wrap.querySelector("#pm-audit-refresh")?.addEventListener("click", async () => {
    state.audit = await fsGetAll(COL.KPI_AUDIT).catch(() => []);
    state.audit = sortByDate(state.audit);
    draw();
  });
}

/* -------------------------------------------------------------------------
 * REVIEW KINERJA HISTORIS (modul lama)
 * ----------------------------------------------------------------------- */
async function renderLegacy(wrap) {
  wrap.innerHTML = `
    <div class="rounded-2xl border border-slate-200 bg-white p-4">
      <div class="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        Tab ini menampilkan <b>review kompetensi lama</b> dari koleksi <code>performance_review</code>. Data historis tidak dihapus dan tidak dicampur dengan scorecard KPI 2027.
      </div>
      <div id="review-tab-header" class="ui-tabs mb-4"></div>
      <div id="review-content"></div>
    </div>`;
  try {
    const mod = await import("./performance-review.js");
    await mod.mount(wrap, { session: state.session });
  } catch (error) {
    console.error("legacy performance review", error);
    wrap.querySelector("#review-content").innerHTML = `<div class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Gagal memuat review historis: ${escapeHtml(error.message)}</div>`;
  }
}




