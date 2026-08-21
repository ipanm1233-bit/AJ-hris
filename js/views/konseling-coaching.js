import {
  db, COL, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, doc, arrayUnion
} from "../firebase-config.js";
import {
  openModal, closeModal, confirmDialog, toast, escapeHtml, fmtDateTime, fmtDateShort,
  fsGetAll, fsAdd, fsUpdate, fsDelete, downloadHtmlAsPdf, notifyUser, getTargetsForRole,
  downloadXlsx
} from "../utils.js";
import { isoDocHeaderTable } from "../branding.js";
import { getSession } from "../auth.js";

// =========================================================================
// CONSTANTS & DEFINITIONS
// =========================================================================
export const CASE_CATEGORIES = {
  Counseling: [
    "Personal issue", "Work-related issue", "Relationship with coworker",
    "Relationship with supervisor", "Work stress", "Communication issue",
    "Motivation issue", "Other"
  ],
  Coaching: [
    "Performance", "Attendance", "Discipline", "Productivity",
    "Communication", "Leadership", "Sales performance", "Work behavior",
    "SOP compliance", "Other"
  ],
  Disciplinary: [
    "Late attendance", "Absence", "Leaving workplace without permission",
    "SOP violation", "Negligence", "Misconduct", "Insubordination",
    "Unauthorized activity", "Other"
  ],
  "Corrective Action": [
    "Performance improvement", "Behavioral improvement", "SOP improvement",
    "Attendance improvement", "Sales improvement"
  ],
  "Follow-up SP": [
    "SP1", "SP2", "SP3", "Other formal warning"
  ]
};

export const CASE_SOURCES = [
  "HR Monitoring", "Supervisor Report", "Employee Request",
  "Attendance", "KPI", "Complaint", "Management", "Other"
];

export const ROOT_CAUSES = [
  "Knowledge gap", "Skill gap", "Communication issue", "Personal factor",
  "Workload", "Leadership issue", "System/process issue", "Motivation",
  "Discipline", "SOP misunderstanding", "Other"
];

export const ACTION_TAKENS = [
  "Counseling", "Coaching", "Verbal Reminder", "Written Reminder",
  "Corrective Action", "Training", "Mediation", "Monitoring",
  "SP Recommendation", "Management Escalation", "Other"
];

export const CASE_STATUSES = [
  "Draft", "Open", "Investigation", "Counseling", "Coaching",
  "Action Plan", "Monitoring", "Review", "Closed", "Escalated", "Cancelled"
];

export const PRIORITIES = ["Low", "Medium", "High", "Critical"];

// Module State
let activeTab = "dashboard";
let currentSession = null;
let allCases = [];
let allEmployees = [];
let allActionPlans = [];
let allFollowups = [];
let auditLogs = [];

// =========================================================================
// ENTRY POINT (mount)
// =========================================================================
export async function mount(container, { params, session }) {
  currentSession = session || getSession();
  
  if (params && params.get("tab")) {
    const t = params.get("tab");
    if (["dashboard", "case_management", "action_plan", "follow_up", "reports"].includes(t)) {
      activeTab = t;
    }
  }

  // Bind Top Buttons & Navigation Tabs
  initNavigation(container);

  // Load Data
  await reloadAllData(container);

  // Deep link support (e.g. from attendance or KPI)
  if (params && params.get("action") === "new_case") {
    const prefill = {
      nik: params.get("nik") || "",
      case_type: params.get("case_type") || "Disciplinary",
      source: params.get("source") || "Attendance",
      description: params.get("description") || ""
    };
    showCaseFormModal(null, prefill);
  }

  return {
    unmount: () => {
      // Clean up if needed
    }
  };
}

// =========================================================================
// NAVIGATION & TAB SWITCHING
// =========================================================================
function initNavigation(container) {
  const topNewBtn = container.querySelector("#kc-btn-new-case");
  if (topNewBtn) {
    topNewBtn.onclick = () => showCaseFormModal(null);
  }

  const topExportBtn = container.querySelector("#kc-btn-export-excel");
  if (topExportBtn) {
    topExportBtn.onclick = () => exportCasesToExcel();
  }

  const tabBtns = container.querySelectorAll(".kc-tab-btn");
  tabBtns.forEach(btn => {
    btn.onclick = () => {
      const target = btn.dataset.kctab;
      switchTab(container, target);
    };
  });
}

function switchTab(container, tabName) {
  activeTab = tabName;
  const tabBtns = container.querySelectorAll(".kc-tab-btn");
  tabBtns.forEach(b => {
    const isTarget = b.dataset.kctab === tabName;
    b.className = `kc-tab-btn px-4 py-3 text-xs md:text-sm whitespace-nowrap transition flex items-center gap-2 ${
      isTarget
        ? "font-bold border-b-2 border-maroon-700 text-maroon-700"
        : "font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700"
    }`;
  });

  const panels = container.querySelectorAll(".kc-tab-content");
  panels.forEach(p => {
    if (p.id === `kc-panel-${tabName}`) {
      p.classList.remove("hidden");
    } else {
      p.classList.add("hidden");
    }
  });

  renderActiveTabContent(container);
}

// =========================================================================
// DATA FETCHING & PERMISSION FILTERING
// =========================================================================
async function reloadAllData(container) {
  try {
    const [casesRaw, empsRaw, apRaw, folRaw] = await Promise.all([
      fsGetAll(COL.HR_CASES || "hr_cases").catch(() => []),
      fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
      fsGetAll(COL.HR_CASE_ACTION_PLANS || "hr_case_action_plans").catch(() => []),
      fsGetAll(COL.HR_CASE_FOLLOWUPS || "hr_case_followups").catch(() => [])
    ]);

    allEmployees = empsRaw || [];
    allActionPlans = apRaw || [];
    allFollowups = folRaw || [];
    
    // Sort cases by latest report date or createdAt
    allCases = (casesRaw || []).sort((a, b) => {
      const da = new Date(a.report_date || a.created_at || 0).getTime();
      const db = new Date(b.report_date || b.created_at || 0).getTime();
      return db - da;
    });

    // Update badges
    updateTabBadges(container);

    // Render active tab
    renderActiveTabContent(container);
  } catch (err) {
    console.error("Error loading HR cases data:", err);
    toast("Gagal memuat data konseling & coaching: " + err.message, "error");
  }
}

function filterCasesByRole(cases) {
  const role = (currentSession?.role || "").toUpperCase();
  const uname = (currentSession?.username || "").toUpperCase();
  const userNik = String(currentSession?.nik || "");

  if (role === "SUPERADMIN" || role === "HRD") {
    return cases;
  }

  // Manager / SPV / Branch Manager: only see cases of their subordinates or where they are assigned / creator
  return cases.filter(c => {
    // Highly confidential can only be seen by HRD/Superadmin unless explicitly assigned
    if (c.confidentiality === "Highly Confidential") {
      return (c.created_by || "").toUpperCase() === uname || (c.hr_officer_username || "").toUpperCase() === uname;
    }
    if (c.confidentiality === "Confidential") {
      return (c.created_by || "").toUpperCase() === uname || (c.atasan || "").toLowerCase().includes((currentSession?.nama || "").toLowerCase());
    }
    // Normal cases: visible if supervisor / creator / assigned
    if ((c.created_by || "").toUpperCase() === uname) return true;
    if ((c.hr_officer_username || "").toUpperCase() === uname) return true;
    if (c.nik && userNik && String(c.nik) === userNik) return false; // Employee doesn't see confidential investigation without explicit sharing
    return true;
  });
}

function updateTabBadges(container) {
  const visibleCases = filterCasesByRole(allCases);
  const totalCasesEl = container.querySelector("#kc-badge-total-cases");
  if (totalCasesEl) {
    totalCasesEl.textContent = visibleCases.length;
    totalCasesEl.classList.toggle("hidden", visibleCases.length === 0);
  }

  const activeAp = allActionPlans.filter(ap => ap.status === "In Progress" || ap.status === "Pending");
  const apEl = container.querySelector("#kc-badge-active-ap");
  if (apEl) {
    apEl.textContent = activeAp.length;
    apEl.classList.toggle("hidden", activeAp.length === 0);
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const overdueFol = allFollowups.filter(f => f.next_followup_date && f.next_followup_date < todayStr && f.status !== "Completed");
  const folEl = container.querySelector("#kc-badge-overdue-fol");
  if (folEl) {
    folEl.textContent = overdueFol.length;
    folEl.classList.toggle("hidden", overdueFol.length === 0);
  }
}

function renderActiveTabContent(container) {
  switch (activeTab) {
    case "dashboard":
      renderDashboard(container);
      break;
    case "case_management":
      renderCaseManagement(container);
      break;
    case "action_plan":
      renderActionPlanTab(container);
      break;
    case "follow_up":
      renderFollowupTab(container);
      break;
    case "reports":
      renderReportsTab(container);
      break;
  }
}

// =========================================================================
// 1. DASHBOARD VIEW
// =========================================================================
function renderDashboard(container) {
  const panel = container.querySelector("#kc-panel-dashboard");
  if (!panel) return;

  const visibleCases = filterCasesByRole(allCases);
  const todayStr = new Date().toISOString().split("T")[0];

  const totalCases = visibleCases.length;
  const openCases = visibleCases.filter(c => ["Open", "Draft", "Investigation"].includes(c.status)).length;
  const monitoringCases = visibleCases.filter(c => ["Monitoring", "Action Plan", "Counseling", "Coaching", "Review"].includes(c.status)).length;
  const closedCases = visibleCases.filter(c => c.status === "Closed").length;
  const escalatedCases = visibleCases.filter(c => c.status === "Escalated").length;
  
  // Overdue followups calculation
  const overdueFollowups = allFollowups.filter(f => f.next_followup_date && f.next_followup_date < todayStr);
  const overdueCount = overdueFollowups.length;

  // Recurring cases detection
  const empCaseMap = {};
  visibleCases.forEach(c => {
    const key = (c.nama_karyawan || "").trim().toLowerCase();
    if (!key) return;
    if (!empCaseMap[key]) empCaseMap[key] = [];
    empCaseMap[key].push(c);
  });

  const recurringList = Object.entries(empCaseMap).filter(([_, list]) => list.length >= 2);

  // Category breakdown
  const catCount = {};
  visibleCases.forEach(c => {
    const type = c.case_type || "Counseling";
    catCount[type] = (catCount[type] || 0) + 1;
  });

  // Department breakdown
  const deptCount = {};
  visibleCases.forEach(c => {
    const dept = c.departemen || "Umum";
    deptCount[dept] = (deptCount[dept] || 0) + 1;
  });

  panel.innerHTML = `
    <!-- KPI Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Kasus</span>
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl font-black text-slate-800">${totalCases}</span>
          <span class="text-[10px] text-slate-400 font-medium">tercatat</span>
        </div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-sky-200/80 bg-sky-50/20 shadow-xs flex flex-col justify-between">
        <span class="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Kasus Terbuka</span>
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl font-black text-sky-700">${openCases}</span>
          <span class="text-[10px] text-sky-600 font-medium">Open / Inv.</span>
        </div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-xs flex flex-col justify-between">
        <span class="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Dalam Monitoring</span>
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl font-black text-amber-700">${monitoringCases}</span>
          <span class="text-[10px] text-amber-600 font-medium">aktif</span>
        </div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-rose-200/80 bg-rose-50/20 shadow-xs flex flex-col justify-between">
        <span class="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Follow-up Terlambat</span>
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl font-black text-rose-700">${overdueCount}</span>
          <span class="text-[10px] text-rose-600 font-bold">overdue</span>
        </div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
        <span class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Kasus Selesai</span>
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl font-black text-emerald-700">${closedCases}</span>
          <span class="text-[10px] text-emerald-600 font-medium">resolved</span>
        </div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-purple-200/80 bg-purple-50/20 shadow-xs flex flex-col justify-between">
        <span class="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Eskalasi Direksi</span>
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl font-black text-purple-700">${escalatedCases}</span>
          <span class="text-[10px] text-purple-600 font-medium">SP / Mgmt</span>
        </div>
      </div>
    </div>

    <!-- Recurring Cases Alert (PRD Item 21) -->
    ${recurringList.length > 0 ? `
      <div class="bg-amber-50 border border-amber-200/80 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shrink-0 shadow-xs">!</div>
          <div>
            <h2 class="text-sm font-bold text-amber-900 flex items-center gap-2">
              <span>Perhatian: Ditemukan ${recurringList.length} Karyawan dengan Kasus Berulang (Recurring Cases)</span>
              <span class="px-2 py-0.5 text-[10px] bg-amber-200 text-amber-900 rounded-full font-black">RECURRING</span>
            </h2>
            <p class="text-xs text-amber-700 mt-0.5">Sistem mendeteksi adanya permasalahan pembinaan yang berulang pada karyawan berikut:</p>
            <div class="flex flex-wrap gap-2 mt-2">
              ${recurringList.map(([name, list]) => `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 text-amber-900 text-xs font-semibold rounded-lg shadow-2xs">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <b>${escapeHtml(name.toUpperCase())}</b> (${list.length} Kasus)
                </span>
              `).join("")}
            </div>
          </div>
        </div>
        <button type="button" onclick="window.kcFilterRecurring()" class="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shrink-0 cursor-pointer">
          Lihat Kasus Berulang
        </button>
      </div>
    ` : ""}

    <!-- Charts & Analytics Section -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Tipe & Kategori Pembinaan -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 class="text-sm font-bold text-slate-800">Distribusi Tipe Pembinaan</h2>
          <span class="text-xs font-semibold text-slate-400">${totalCases} Total</span>
        </div>
        <div class="space-y-3">
          ${["Counseling", "Coaching", "Disciplinary", "Corrective Action", "Follow-up SP"].map(type => {
            const count = catCount[type] || 0;
            const pct = totalCases > 0 ? Math.round((count / totalCases) * 100) : 0;
            const colorMap = {
              Counseling: "bg-teal-600",
              Coaching: "bg-sky-600",
              Disciplinary: "bg-amber-600",
              "Corrective Action": "bg-indigo-600",
              "Follow-up SP": "bg-rose-600"
            };
            return `
              <div>
                <div class="flex items-center justify-between text-xs mb-1 font-semibold">
                  <span class="text-slate-700">${type}</span>
                  <span class="text-slate-500">${count} (${pct}%)</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div class="${colorMap[type] || 'bg-slate-600'} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Center: Departemen Terbanyak -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 class="text-sm font-bold text-slate-800">Distribusi Departemen</h2>
          <span class="text-xs font-semibold text-slate-400">${Object.keys(deptCount).length} Dept</span>
        </div>
        <div class="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          ${Object.entries(deptCount).length === 0 ? '<p class="text-xs text-slate-400 italic py-4 text-center">Belum ada data kasus</p>' : ""}
          ${Object.entries(deptCount).sort((a, b) => b[1] - a[1]).map(([dept, count]) => {
            const pct = totalCases > 0 ? Math.round((count / totalCases) * 100) : 0;
            return `
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span class="text-xs font-bold text-slate-700 truncate">${escapeHtml(dept)}</span>
                <span class="text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">${count} (${pct}%)</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Right: Prioritas & Perhatian Manajemen -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 class="text-sm font-bold text-slate-800">Kasus Prioritas Tinggi & Kritis</h2>
          <span class="text-xs font-bold text-rose-600">Urgent</span>
        </div>
        <div class="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          ${(() => {
            const urgentCases = visibleCases.filter(c => ["High", "Critical"].includes(c.priority) && c.status !== "Closed");
            if (urgentCases.length === 0) {
              return '<div class="p-6 text-center text-xs text-emerald-600 bg-emerald-50 rounded-xl font-medium">Semua kasus prioritas tinggi sudah tertangani dengan baik.</div>';
            }
            return urgentCases.slice(0, 5).map(c => `
              <div class="p-3 bg-rose-50/50 border border-rose-100 rounded-xl hover:bg-rose-50 transition cursor-pointer" onclick="window.kcShowCaseDetail('${c.id}')">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[11px] font-black text-rose-800">${escapeHtml(c.case_number || c.id)}</span>
                  <span class="px-1.5 py-0.5 text-[9px] font-black rounded-md ${c.priority === 'Critical' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}">${c.priority}</span>
                </div>
                <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(c.nama_karyawan)}</div>
                <div class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(c.category || c.case_type)} — ${escapeHtml(c.description || "-")}</div>
              </div>
            `).join("");
          })()}
        </div>
      </div>
    </div>

    <!-- Recent Active Cases Table -->
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 class="text-sm font-bold text-slate-800">Kasus Pembinaan Terbaru</h2>
          <p class="text-xs text-slate-400">Daftar kasus pembinaan dan konseling karyawan yang baru dicatat</p>
        </div>
        <button type="button" onclick="window.kcSwitchToTab('case_management')" class="text-xs font-bold text-maroon-700 hover:underline inline-flex items-center gap-1">
          Lihat Semua Kasus &rarr;
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-600 font-bold border-y border-slate-200">
              <th class="py-2.5 px-3">Case ID</th>
              <th class="py-2.5 px-3">Karyawan</th>
              <th class="py-2.5 px-3">Tipe & Kategori</th>
              <th class="py-2.5 px-3">Prioritas</th>
              <th class="py-2.5 px-3">Status</th>
              <th class="py-2.5 px-3">Tgl Kejadian</th>
              <th class="py-2.5 px-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
            ${visibleCases.length === 0 ? `
              <tr><td colspan="7" class="py-6 text-center text-slate-400 italic">Belum ada data kasus pembinaan.</td></tr>
            ` : visibleCases.slice(0, 8).map(c => `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="py-2.5 px-3 font-bold text-maroon-700">${escapeHtml(c.case_number || c.id)}</td>
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-800">${escapeHtml(c.nama_karyawan || "-")}</div>
                  <div class="text-[10px] text-slate-400">${escapeHtml(c.jabatan || "-")} &bull; ${escapeHtml(c.departemen || "-")}</div>
                </td>
                <td class="py-2.5 px-3">
                  <span class="inline-block font-semibold text-slate-700">${escapeHtml(c.case_type || "-")}</span>
                  <div class="text-[10px] text-slate-500">${escapeHtml(c.category || "-")}</div>
                </td>
                <td class="py-2.5 px-3">
                  ${renderPriorityBadge(c.priority)}
                </td>
                <td class="py-2.5 px-3">
                  ${renderStatusBadge(c.status)}
                </td>
                <td class="py-2.5 px-3 text-slate-500">${fmtDateShort(c.incident_date || c.report_date)}</td>
                <td class="py-2.5 px-3 text-right">
                  <button type="button" onclick="window.kcShowCaseDetail('${c.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition">Detail</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Helpers for badges
function renderPriorityBadge(priority) {
  const map = {
    Low: "bg-slate-100 text-slate-700 border-slate-200",
    Medium: "bg-sky-50 text-sky-700 border-sky-200",
    High: "bg-amber-50 text-amber-700 border-amber-200",
    Critical: "bg-rose-100 text-rose-700 border-rose-300 font-black"
  };
  return `<span class="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border ${map[priority] || map.Low}">${escapeHtml(priority || "Low")}</span>`;
}

function renderStatusBadge(status) {
  const map = {
    Draft: "bg-slate-100 text-slate-600",
    Open: "bg-sky-100 text-sky-800 font-bold",
    Investigation: "bg-purple-100 text-purple-800 font-bold",
    Counseling: "bg-teal-100 text-teal-800 font-bold",
    Coaching: "bg-indigo-100 text-indigo-800 font-bold",
    "Action Plan": "bg-amber-100 text-amber-800 font-bold",
    Monitoring: "bg-yellow-100 text-yellow-800 font-bold",
    Review: "bg-blue-100 text-blue-800 font-bold",
    Closed: "bg-emerald-100 text-emerald-800 font-bold",
    Escalated: "bg-rose-100 text-rose-800 font-black",
    Cancelled: "bg-slate-100 text-slate-400 line-through"
  };
  return `<span class="inline-block px-2.5 py-0.5 text-[10px] rounded-full ${map[status] || 'bg-slate-100 text-slate-700'}">${escapeHtml(status || "Open")}</span>`;
}

// =========================================================================
// 2. CASE MANAGEMENT VIEW
// =========================================================================
let caseSearchKeyword = "";
let caseFilterType = "ALL";
let caseFilterStatus = "ALL";
let caseFilterPriority = "ALL";
let caseOnlyRecurring = false;

function renderCaseManagement(container) {
  const panel = container.querySelector("#kc-panel-case_management");
  if (!panel) return;

  const visibleCases = filterCasesByRole(allCases);

  // Apply filters
  const filtered = visibleCases.filter(c => {
    if (caseFilterType !== "ALL" && c.case_type !== caseFilterType) return false;
    if (caseFilterStatus !== "ALL" && c.status !== caseFilterStatus) return false;
    if (caseFilterPriority !== "ALL" && c.priority !== caseFilterPriority) return false;
    if (caseOnlyRecurring) {
      const matchCount = visibleCases.filter(x => (x.nama_karyawan || "").trim().toLowerCase() === (c.nama_karyawan || "").trim().toLowerCase()).length;
      if (matchCount < 2) return false;
    }
    if (caseSearchKeyword) {
      const kw = caseSearchKeyword.toLowerCase();
      const matchId = (c.case_number || c.id || "").toLowerCase().includes(kw);
      const matchName = (c.nama_karyawan || "").toLowerCase().includes(kw);
      const matchNik = (c.nik || "").toLowerCase().includes(kw);
      const matchDept = (c.departemen || "").toLowerCase().includes(kw);
      const matchDesc = (c.description || "").toLowerCase().includes(kw);
      if (!matchId && !matchName && !matchNik && !matchDept && !matchDesc) return false;
    }
    return true;
  });

  panel.innerHTML = `
    <!-- Filter & Search Toolbar -->
    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-center justify-between gap-3">
      <div class="flex items-center gap-2 w-full lg:w-auto flex-1">
        <div class="relative w-full lg:max-w-xs">
          <input type="text" id="kc-search-input" value="${escapeHtml(caseSearchKeyword)}" placeholder="Cari ID, nama karyawan, NIK..." class="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon-700/20 focus:border-maroon-700 font-medium">
          <svg class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <select id="kc-filter-type" class="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:outline-none focus:border-maroon-700">
          <option value="ALL" ${caseFilterType === 'ALL' ? 'selected' : ''}>Semua Tipe</option>
          <option value="Counseling" ${caseFilterType === 'Counseling' ? 'selected' : ''}>Counseling</option>
          <option value="Coaching" ${caseFilterType === 'Coaching' ? 'selected' : ''}>Coaching</option>
          <option value="Disciplinary" ${caseFilterType === 'Disciplinary' ? 'selected' : ''}>Disciplinary</option>
          <option value="Corrective Action" ${caseFilterType === 'Corrective Action' ? 'selected' : ''}>Corrective Action</option>
          <option value="Follow-up SP" ${caseFilterType === 'Follow-up SP' ? 'selected' : ''}>Follow-up SP</option>
        </select>
        <select id="kc-filter-status" class="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:outline-none focus:border-maroon-700">
          <option value="ALL" ${caseFilterStatus === 'ALL' ? 'selected' : ''}>Semua Status</option>
          ${CASE_STATUSES.map(st => `<option value="${st}" ${caseFilterStatus === st ? 'selected' : ''}>${st}</option>`).join("")}
        </select>
      </div>

      <div class="flex items-center gap-2 w-full lg:w-auto justify-end">
        <label class="inline-flex items-center gap-1.5 text-xs text-slate-600 font-bold cursor-pointer">
          <input type="checkbox" id="kc-check-recurring" ${caseOnlyRecurring ? 'checked' : ''} class="rounded text-maroon-700 focus:ring-maroon-700">
          <span>Hanya Recurring Cases</span>
        </label>
        <button type="button" id="kc-btn-table-new" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span>Buat Case</span>
        </button>
      </div>
    </div>

    <!-- Data Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <th class="py-3 px-4">Case ID</th>
              <th class="py-3 px-4">Karyawan</th>
              <th class="py-3 px-4">Tipe & Kategori</th>
              <th class="py-3 px-4">Sumber</th>
              <th class="py-3 px-4">Prioritas</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Kerahasiaan</th>
              <th class="py-3 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
            ${filtered.length === 0 ? `
              <tr><td colspan="8" class="py-8 text-center text-slate-400 italic">Tidak ada data kasus yang sesuai dengan filter.</td></tr>
            ` : filtered.map(c => {
              const isRecurring = visibleCases.filter(x => (x.nama_karyawan || "").trim().toLowerCase() === (c.nama_karyawan || "").trim().toLowerCase()).length >= 2;
              return `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3 px-4">
                    <div class="font-bold text-maroon-700">${escapeHtml(c.case_number || c.id)}</div>
                    <div class="text-[10px] text-slate-400">${fmtDateShort(c.report_date || c.created_at)}</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="font-bold text-slate-800 flex items-center gap-1.5">
                      <span>${escapeHtml(c.nama_karyawan || "-")}</span>
                      ${isRecurring ? '<span class="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-black rounded-md">RECURRING</span>' : ''}
                    </div>
                    <div class="text-[10px] text-slate-500">${escapeHtml(c.nik || "-")} &bull; ${escapeHtml(c.jabatan || "-")} &bull; ${escapeHtml(c.cabang || "-")}</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="font-bold text-slate-700">${escapeHtml(c.case_type || "-")}</div>
                    <div class="text-[11px] text-slate-500">${escapeHtml(c.category || "-")}</div>
                  </td>
                  <td class="py-3 px-4 text-slate-600">${escapeHtml(c.source || "-")}</td>
                  <td class="py-3 px-4">${renderPriorityBadge(c.priority)}</td>
                  <td class="py-3 px-4">${renderStatusBadge(c.status)}</td>
                  <td class="py-3 px-4">
                    <span class="inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                      c.confidentiality === 'Highly Confidential' ? 'bg-rose-100 text-rose-800 font-bold' :
                      c.confidentiality === 'Confidential' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-600'
                    }">${escapeHtml(c.confidentiality || "Normal")}</span>
                  </td>
                  <td class="py-3 px-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button type="button" onclick="window.kcShowCaseDetail('${c.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer">
                        Detail
                      </button>
                      <button type="button" onclick="window.kcEditCase('${c.id}')" class="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-bold transition cursor-pointer">
                        Edit
                      </button>
                      <button type="button" onclick="window.kcPrintCaseDossier('${c.id}')" class="p-1 text-slate-400 hover:text-slate-700 transition" title="Cetak Dossier PDF">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
        <span>Menampilkan <b>${filtered.length}</b> dari total <b>${visibleCases.length}</b> kasus</span>
      </div>
    </div>
  `;

  // Wire search and filter events
  const searchInput = panel.querySelector("#kc-search-input");
  if (searchInput) {
    searchInput.oninput = (e) => {
      caseSearchKeyword = e.target.value;
      renderCaseManagement(container);
    };
  }
  const filterType = panel.querySelector("#kc-filter-type");
  if (filterType) {
    filterType.onchange = (e) => {
      caseFilterType = e.target.value;
      renderCaseManagement(container);
    };
  }
  const filterStatus = panel.querySelector("#kc-filter-status");
  if (filterStatus) {
    filterStatus.onchange = (e) => {
      caseFilterStatus = e.target.value;
      renderCaseManagement(container);
    };
  }
  const checkRecurring = panel.querySelector("#kc-check-recurring");
  if (checkRecurring) {
    checkRecurring.onchange = (e) => {
      caseOnlyRecurring = e.target.checked;
      renderCaseManagement(container);
    };
  }
  const btnTableNew = panel.querySelector("#kc-btn-table-new");
  if (btnTableNew) {
    btnTableNew.onclick = () => showCaseFormModal(null);
  }
}

// =========================================================================
// 3. ACTION PLAN VIEW
// =========================================================================
let apFilterStatus = "ALL";

function renderActionPlanTab(container) {
  const panel = container.querySelector("#kc-panel-action_plan");
  if (!panel) return;

  const todayStr = new Date().toISOString().split("T")[0];

  const totalAp = allActionPlans.length;
  const inProgressAp = allActionPlans.filter(a => a.status === "In Progress" || a.status === "Pending").length;
  const overdueAp = allActionPlans.filter(a => a.target_date && a.target_date < todayStr && a.status !== "Completed" && a.status !== "Cancelled").length;
  const completedAp = allActionPlans.filter(a => a.status === "Completed").length;

  const filtered = allActionPlans.filter(a => {
    if (apFilterStatus === "ALL") return true;
    if (apFilterStatus === "Overdue") {
      return a.target_date && a.target_date < todayStr && a.status !== "Completed" && a.status !== "Cancelled";
    }
    return a.status === apFilterStatus;
  });

  panel.innerHTML = `
    <!-- Action Plan Metrics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5">
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Action Plans</span>
        <div class="text-2xl font-black text-slate-800 mt-2">${totalAp}</div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-sky-200/80 bg-sky-50/20 shadow-xs">
        <span class="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Sedang Berjalan</span>
        <div class="text-2xl font-black text-sky-700 mt-2">${inProgressAp}</div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-rose-200/80 bg-rose-50/20 shadow-xs">
        <span class="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Terlambat (Overdue)</span>
        <div class="text-2xl font-black text-rose-700 mt-2">${overdueAp}</div>
      </div>
      <div class="bg-white p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-xs">
        <span class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Selesai (Completed)</span>
        <div class="text-2xl font-black text-emerald-700 mt-2">${completedAp}</div>
      </div>
    </div>

    <!-- Filter Toolbar -->
    <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-600">Filter Status:</span>
        <div class="flex items-center gap-1.5 flex-wrap">
          ${["ALL", "In Progress", "Pending", "Overdue", "Completed", "Cancelled"].map(st => `
            <button type="button" onclick="window.kcFilterAp('${st}')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              apFilterStatus === st ? 'bg-maroon-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }">${st}</button>
          `).join("")}
        </div>
      </div>
    </div>

    <!-- Table Action Plans -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <th class="py-3 px-4">Case / Karyawan</th>
              <th class="py-3 px-4">Deskripsi Action Plan</th>
              <th class="py-3 px-4">PIC</th>
              <th class="py-3 px-4">Target Waktu</th>
              <th class="py-3 px-4">Indikator Keberhasilan</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
            ${filtered.length === 0 ? `
              <tr><td colspan="7" class="py-8 text-center text-slate-400 italic">Tidak ada Action Plan pada kategori ini.</td></tr>
            ` : filtered.map(a => {
              const isOverdue = a.target_date && a.target_date < todayStr && a.status !== "Completed" && a.status !== "Cancelled";
              return `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3 px-4">
                    <div class="font-bold text-maroon-700 cursor-pointer hover:underline" onclick="window.kcShowCaseDetail('${a.case_id}')">${escapeHtml(a.case_number || a.case_id || "-")}</div>
                    <div class="text-[11px] font-semibold text-slate-800">${escapeHtml(a.employee_name || "-")}</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="font-bold text-slate-800">${escapeHtml(a.description || "-")}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">Target: ${escapeHtml(a.expected_result || "-")}</div>
                  </td>
                  <td class="py-3 px-4 font-semibold text-slate-700">${escapeHtml(a.pic || "Employee")}</td>
                  <td class="py-3 px-4">
                    <div class="font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-800'}">${fmtDateShort(a.target_date)}</div>
                    ${isOverdue ? '<span class="inline-block text-[9px] font-black text-rose-600 uppercase">OVERDUE</span>' : ''}
                  </td>
                  <td class="py-3 px-4 text-slate-600">${escapeHtml(a.measurement || "-")}</td>
                  <td class="py-3 px-4">
                    <span class="inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                      a.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                      a.status === 'In Progress' ? 'bg-sky-100 text-sky-800' :
                      a.status === 'Pending' ? 'bg-slate-100 text-slate-700' :
                      'bg-rose-100 text-rose-800'
                    }">${escapeHtml(a.status || "Pending")}</span>
                  </td>
                  <td class="py-3 px-4 text-right">
                    <button type="button" onclick="window.kcUpdateApStatus('${a.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition">Update</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// =========================================================================
// 4. FOLLOW-UP & MONITORING VIEW
// =========================================================================
function renderFollowupTab(container) {
  const panel = container.querySelector("#kc-panel-follow_up");
  if (!panel) return;

  const todayStr = new Date().toISOString().split("T")[0];

  const overdueList = allFollowups.filter(f => f.next_followup_date && f.next_followup_date < todayStr);
  const todayList = allFollowups.filter(f => f.next_followup_date === todayStr || f.followup_date === todayStr);
  const upcomingList = allFollowups.filter(f => f.next_followup_date && f.next_followup_date > todayStr);

  panel.innerHTML = `
    <!-- Top reminder banners -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="p-4 rounded-2xl border border-rose-200 bg-rose-50/50 shadow-xs flex items-center justify-between">
        <div>
          <span class="text-xs font-bold text-rose-700 uppercase">Follow-up Terlambat</span>
          <div class="text-2xl font-black text-rose-800 mt-1">${overdueList.length} Kasus</div>
        </div>
        <div class="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">!</div>
      </div>
      <div class="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 shadow-xs flex items-center justify-between">
        <div>
          <span class="text-xs font-bold text-amber-700 uppercase">Follow-up Hari Ini</span>
          <div class="text-2xl font-black text-amber-800 mt-1">${todayList.length} Jadwal</div>
        </div>
        <div class="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">⏰</div>
      </div>
      <div class="p-4 rounded-2xl border border-sky-200 bg-sky-50/50 shadow-xs flex items-center justify-between">
        <div>
          <span class="text-xs font-bold text-sky-700 uppercase">Jadwal Mendatang</span>
          <div class="text-2xl font-black text-sky-800 mt-1">${upcomingList.length} Jadwal</div>
        </div>
        <div class="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold">📅</div>
      </div>
    </div>

    <!-- History / Log Follow-up List -->
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 class="text-sm font-bold text-slate-800">Catatan Monitoring & Follow-up</h2>
          <p class="text-xs text-slate-400">Riwayat perkembangan dan evaluasi pembinaan karyawan secara berkala</p>
        </div>
      </div>

      <div class="space-y-3">
        ${allFollowups.length === 0 ? `
          <div class="p-8 text-center text-slate-400 italic">Belum ada catatan follow-up. Buka detail kasus untuk menambahkan monitoring follow-up.</div>
        ` : allFollowups.map(f => {
          const matchingCase = allCases.find(c => String(c.id) === String(f.case_id));
          return `
            <div class="p-4 bg-slate-50 border border-slate-200/80 rounded-xl hover:border-slate-300 transition space-y-2">
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                <div class="flex items-center gap-2">
                  <span class="font-black text-xs text-maroon-700 cursor-pointer hover:underline" onclick="window.kcShowCaseDetail('${f.case_id}')">${escapeHtml(f.case_number || matchingCase?.case_number || f.case_id)}</span>
                  <span class="text-xs font-bold text-slate-800">${escapeHtml(matchingCase?.nama_karyawan || "-")}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-500">Tgl Monitoring: <b>${fmtDateShort(f.followup_date)}</b></span>
                  ${renderImprovementBadge(f.improvement_status)}
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <span class="font-bold text-slate-500">Kondisi & Progress Karyawan:</span>
                  <p class="text-slate-800 mt-0.5">${escapeHtml(f.employee_progress || f.current_condition || "-")}</p>
                </div>
                <div>
                  <span class="font-bold text-slate-500">Feedback Supervisor / HR:</span>
                  <p class="text-slate-800 mt-0.5">${escapeHtml(f.supervisor_feedback || f.notes || "-")}</p>
                </div>
              </div>
              ${f.next_followup_date ? `
                <div class="pt-1 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-200/40">
                  <span>Jadwal Follow-up Berikutnya: <b class="text-maroon-700">${fmtDateShort(f.next_followup_date)}</b></span>
                  <button type="button" onclick="window.kcAddFollowup('${f.case_id}')" class="text-maroon-700 font-bold hover:underline">Catat Sesi Lanjutan &rarr;</button>
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderImprovementBadge(status) {
  const map = {
    "Significant Improvement": "bg-emerald-100 text-emerald-800 border-emerald-300 font-black",
    Improvement: "bg-teal-100 text-teal-800 border-teal-300 font-bold",
    "No Improvement": "bg-amber-100 text-amber-800 border-amber-300 font-bold",
    Regression: "bg-rose-100 text-rose-800 border-rose-300 font-black"
  };
  return `<span class="inline-block px-2.5 py-0.5 text-[10px] rounded-full border ${map[status] || 'bg-slate-100 text-slate-700 border-slate-200'}">${escapeHtml(status || "Monitoring")}</span>`;
}

// =========================================================================
// 5. REPORTS & MANAGEMENT SUMMARY
// =========================================================================
function renderReportsTab(container) {
  const panel = container.querySelector("#kc-panel-reports");
  if (!panel) return;

  const visibleCases = filterCasesByRole(allCases);
  const total = visibleCases.length;
  const closed = visibleCases.filter(c => c.status === "Closed").length;
  const active = visibleCases.filter(c => c.status !== "Closed" && c.status !== "Cancelled").length;
  const escalated = visibleCases.filter(c => c.status === "Escalated").length;
  const resolvedPct = total > 0 ? Math.round((closed / total) * 100) : 0;

  panel.innerHTML = `
    <!-- Top Summary Banner -->
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 class="text-base font-black text-slate-800 tracking-tight">Executive Management Summary — HR Case Management</h2>
          <p class="text-xs text-slate-500 font-medium mt-0.5">Ringkasan hasil pembinaan, tingkat penyelesaian masalah (Resolution Rate), dan efektivitas intervensi HR</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="window.kcExportManagementPdf()" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>Download PDF Summary</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="text-[11px] font-bold text-slate-500 uppercase">Total Kasus</span>
          <div class="text-xl font-black text-slate-800 mt-1">${total}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="text-[11px] font-bold text-sky-700 uppercase">Kasus Aktif</span>
          <div class="text-xl font-black text-sky-800 mt-1">${active}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="text-[11px] font-bold text-emerald-700 uppercase">Kasus Terselesaikan</span>
          <div class="text-xl font-black text-emerald-800 mt-1">${closed} (${resolvedPct}%)</div>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <span class="text-[11px] font-bold text-purple-700 uppercase">Eskalasi Formal</span>
          <div class="text-xl font-black text-purple-800 mt-1">${escalated}</div>
        </div>
      </div>
    </div>

    <!-- Export & Individual Dossier Generator -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <h3 class="text-sm font-bold text-slate-800">Cetak Berkas Case Report (Per Kasus)</h3>
        <p class="text-xs text-slate-500">Pilih kasus untuk mengunduh dokumen laporan resmi lengkap dengan Fakta, Pernyataan Karyawan, Assessment HR, Action Plan, dan Riwayat Monitoring.</p>
        <div class="space-y-2 pt-2">
          <select id="kc-report-case-select" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white font-medium focus:outline-none focus:border-maroon-700">
            <option value="">-- Pilih Kasus --</option>
            ${visibleCases.map(c => `
              <option value="${c.id}">${c.case_number || c.id} — ${escapeHtml(c.nama_karyawan)} (${c.case_type})</option>
            `).join("")}
          </select>
          <button type="button" id="kc-btn-print-selected" class="w-full py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer">
            Download Berkas Kasus PDF
          </button>
        </div>
      </div>

      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <h3 class="text-sm font-bold text-slate-800">Export Rekapitulasi Excel / CSV</h3>
        <p class="text-xs text-slate-500">Unduh seluruh rekaman database kasus pembinaan karyawan ke format Microsoft Excel (.xlsx / .csv) untuk kebutuhan audit & pelaporan manajemen.</p>
        <div class="pt-4">
          <button type="button" onclick="window.kcExportAllExcel()" class="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>Download Rekap Kasus (Excel)</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const btnPrintSelected = panel.querySelector("#kc-btn-print-selected");
  if (btnPrintSelected) {
    btnPrintSelected.onclick = () => {
      const select = panel.querySelector("#kc-report-case-select");
      if (!select || !select.value) {
        toast("Silakan pilih kasus terlebih dahulu", "warning");
        return;
      }
      printCaseDossier(select.value);
    };
  }
}

// =========================================================================
// MODALS: CREATE / EDIT CASE
// =========================================================================
function showCaseFormModal(caseId = null, prefill = {}) {
  const existing = caseId ? allCases.find(c => String(c.id) === String(caseId)) : null;
  const isEdit = !!existing;

  const currentYear = new Date().getFullYear();
  const nextSeq = String(allCases.length + 1).padStart(5, "0");
  const autoCaseNumber = isEdit ? existing.case_number : `HR-CASE-${currentYear}-${nextSeq}`;

  const html = `
    <div class="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      <div class="bg-maroon-50/60 p-3.5 rounded-xl border border-maroon-100 flex items-center justify-between">
        <div>
          <span class="text-[10px] font-black text-maroon-700 uppercase tracking-wider">Nomor Kasus / Case ID</span>
          <div class="text-sm font-black text-slate-800">${escapeHtml(autoCaseNumber)}</div>
        </div>
        <span class="px-2.5 py-1 bg-white text-maroon-700 text-xs font-bold rounded-lg border border-maroon-200">
          ${isEdit ? 'Edit Case' : 'Buat Kasus Baru'}
        </span>
      </div>

      <!-- Section 1: Employee Information -->
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
          <span>1. Informasi Karyawan</span>
        </h3>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Karyawan <span class="text-rose-500">*</span></label>
          <input type="text" id="kc-form-emp-search" list="kc-emp-datalist" value="${escapeHtml(existing?.nama_karyawan || prefill.nama_karyawan || '')}" placeholder="Ketik nama / NIK karyawan..." class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:outline-none focus:border-maroon-700">
          <datalist id="kc-emp-datalist">
            ${allEmployees.map(e => `<option value="${escapeHtml(e.nama_karyawan)}">${e.nik || ''} - ${e.jabatan || ''} - ${e.cabang || ''}</option>`).join("")}
          </datalist>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label class="block font-semibold text-slate-500">NIK</label>
            <input type="text" id="kc-form-nik" value="${escapeHtml(existing?.nik || prefill.nik || '')}" class="w-full mt-1 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-100 font-bold" readonly>
          </div>
          <div>
            <label class="block font-semibold text-slate-500">Jabatan</label>
            <input type="text" id="kc-form-jabatan" value="${escapeHtml(existing?.jabatan || '')}" class="w-full mt-1 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-100 font-bold" readonly>
          </div>
          <div>
            <label class="block font-semibold text-slate-500">Departemen</label>
            <input type="text" id="kc-form-dept" value="${escapeHtml(existing?.departemen || '')}" class="w-full mt-1 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-100 font-bold" readonly>
          </div>
          <div>
            <label class="block font-semibold text-slate-500">Cabang</label>
            <input type="text" id="kc-form-cabang" value="${escapeHtml(existing?.cabang || '')}" class="w-full mt-1 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-100 font-bold" readonly>
          </div>
        </div>
      </div>

      <!-- Section 2: Case Information -->
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1.5">
          2. Informasi Kasus & Kategori
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tipe Kasus <span class="text-rose-500">*</span></label>
            <select id="kc-form-case-type" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:border-maroon-700">
              ${Object.keys(CASE_CATEGORIES).map(k => `
                <option value="${k}" ${(existing?.case_type || prefill.case_type || 'Counseling') === k ? 'selected' : ''}>${k}</option>
              `).join("")}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Kategori <span class="text-rose-500">*</span></label>
            <select id="kc-form-category" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:border-maroon-700"></select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Sumber Kasus</label>
            <select id="kc-form-source" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
              ${CASE_SOURCES.map(s => `
                <option value="${s}" ${(existing?.source || prefill.source || 'HR Monitoring') === s ? 'selected' : ''}>${s}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Kejadian <span class="text-rose-500">*</span></label>
            <input type="date" id="kc-form-incident-date" value="${existing?.incident_date || new Date().toISOString().split('T')[0]}" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Prioritas</label>
            <select id="kc-form-priority" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:border-maroon-700">
              ${PRIORITIES.map(p => `
                <option value="${p}" ${(existing?.priority || 'Medium') === p ? 'selected' : ''}>${p}</option>
              `).join("")}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tingkat Kerahasiaan</label>
            <select id="kc-form-confidentiality" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:border-maroon-700">
              <option value="Normal" ${(existing?.confidentiality || 'Normal') === 'Normal' ? 'selected' : ''}>Normal (HR & SPV)</option>
              <option value="Confidential" ${(existing?.confidentiality) === 'Confidential' ? 'selected' : ''}>Confidential (HR & Mgmt)</option>
              <option value="Highly Confidential" ${(existing?.confidentiality) === 'Highly Confidential' ? 'selected' : ''}>Highly Confidential (HR Only)</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Deskripsi Masalah / Fakta Lapangan <span class="text-rose-500">*</span></label>
          <textarea id="kc-form-desc" rows="3" placeholder="Uraikan fakta kejadian secara objektif tanpa asumsi..." class="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white font-medium focus:border-maroon-700">${escapeHtml(existing?.description || prefill.description || '')}</textarea>
        </div>
      </div>

      <!-- Section 3: Employee Statement (Pernyataan Karyawan) -->
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1.5">
          3. Employee Statement (Klarifikasi & Pernyataan Karyawan)
        </h3>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Penjelasan / Alasan dari Karyawan</label>
          <textarea id="kc-form-emp-explanation" rows="2" placeholder="Catat klarifikasi langsung yang disampaikan karyawan..." class="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white font-medium focus:border-maroon-700">${escapeHtml(existing?.employee_statement?.explanation || '')}</textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Respon & Komitmen Karyawan</label>
          <input type="text" id="kc-form-emp-response" value="${escapeHtml(existing?.employee_statement?.employee_response || '')}" placeholder="Respon kesiapan perbaikan diri..." class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
        </div>
      </div>

      <!-- Section 4: HR Assessment & Action Taken -->
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1.5">
          4. HR Assessment & Tindakan
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Akar Masalah (Root Cause)</label>
            <select id="kc-form-root-cause" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
              ${ROOT_CAUSES.map(rc => `
                <option value="${rc}" ${(existing?.hr_assessment?.root_cause || 'Discipline') === rc ? 'selected' : ''}>${rc}</option>
              `).join("")}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tindakan Pembinaan (Action Taken)</label>
            <select id="kc-form-action-taken" class="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:border-maroon-700">
              ${ACTION_TAKENS.map(at => `
                <option value="${at}" ${(existing?.action_taken || 'Coaching') === at ? 'selected' : ''}>${at}</option>
              `).join("")}
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Analisa & Catatan HR</label>
          <textarea id="kc-form-assessment-notes" rows="2" placeholder="Catatan penilaian objektif dari HR Officer..." class="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white font-medium focus:border-maroon-700">${escapeHtml(existing?.hr_assessment?.assessment_notes || '')}</textarea>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
        <button type="button" id="kc-modal-btn-cancel" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Batal</button>
        <button type="button" id="kc-modal-btn-save" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs transition">Simpan Kasus</button>
      </div>
    </div>
  `;

  openModal({
    title: isEdit ? `Edit Kasus: ${escapeHtml(existing.case_number)}` : "Buat Kasus Pembinaan Baru",
    content: html,
    maxWidth: "max-w-3xl"
  });

  // Autocomplete bindings for Employee
  const empInput = document.getElementById("kc-form-emp-search");
  const nikInput = document.getElementById("kc-form-nik");
  const jabInput = document.getElementById("kc-form-jabatan");
  const deptInput = document.getElementById("kc-form-dept");
  const cabInput = document.getElementById("kc-form-cabang");

  function autoFillEmployee(nameOrNik) {
    const found = allEmployees.find(e => 
      (e.nama_karyawan || "").trim().toLowerCase() === (nameOrNik || "").trim().toLowerCase() ||
      String(e.nik || "") === String(nameOrNik)
    );
    if (found) {
      if (empInput) empInput.value = found.nama_karyawan || "";
      if (nikInput) nikInput.value = found.nik || "-";
      if (jabInput) jabInput.value = found.jabatan || "-";
      if (deptInput) deptInput.value = found.divisi || found.departemen || "-";
      if (cabInput) cabInput.value = found.cabang || "-";
    }
  }

  if (empInput) {
    empInput.onchange = () => autoFillEmployee(empInput.value);
    empInput.oninput = () => autoFillEmployee(empInput.value);
    if (empInput.value) autoFillEmployee(empInput.value);
  }

  // Dynamic category options based on case type
  const typeSelect = document.getElementById("kc-form-case-type");
  const catSelect = document.getElementById("kc-form-category");

  function syncCategories() {
    const selectedType = typeSelect.value || "Counseling";
    const cats = CASE_CATEGORIES[selectedType] || ["Other"];
    catSelect.innerHTML = cats.map(c => `
      <option value="${c}" ${(existing?.category) === c ? 'selected' : ''}>${c}</option>
    `).join("");
  }

  if (typeSelect && catSelect) {
    typeSelect.onchange = syncCategories;
    syncCategories();
  }

  // Cancel & Save handlers
  const cancelBtn = document.getElementById("kc-modal-btn-cancel");
  if (cancelBtn) cancelBtn.onclick = () => closeModal();

  const saveBtn = document.getElementById("kc-modal-btn-save");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const nama = empInput ? empInput.value.trim() : "";
      const nik = nikInput ? nikInput.value.trim() : "";
      const caseType = typeSelect ? typeSelect.value : "Counseling";
      const category = catSelect ? catSelect.value : "Other";
      const source = document.getElementById("kc-form-source")?.value || "HR Monitoring";
      const incidentDate = document.getElementById("kc-form-incident-date")?.value || new Date().toISOString().split("T")[0];
      const priority = document.getElementById("kc-form-priority")?.value || "Medium";
      const confidentiality = document.getElementById("kc-form-confidentiality")?.value || "Normal";
      const desc = document.getElementById("kc-form-desc")?.value.trim() || "";
      const empExpl = document.getElementById("kc-form-emp-explanation")?.value.trim() || "";
      const empResp = document.getElementById("kc-form-emp-response")?.value.trim() || "";
      const rootCause = document.getElementById("kc-form-root-cause")?.value || "Discipline";
      const actionTaken = document.getElementById("kc-form-action-taken")?.value || "Coaching";
      const assessNotes = document.getElementById("kc-form-assessment-notes")?.value.trim() || "";

      if (!nama || !desc) {
        toast("Silakan isi nama karyawan dan deskripsi fakta masalah.", "warning");
        return;
      }

      const payload = {
        case_number: autoCaseNumber,
        nama_karyawan: nama,
        nik: nik || "-",
        jabatan: jabInput?.value || "-",
        departemen: deptInput?.value || "-",
        cabang: cabInput?.value || "-",
        case_type: caseType,
        category: category,
        source: source,
        incident_date: incidentDate,
        report_date: existing?.report_date || new Date().toISOString().split("T")[0],
        priority: priority,
        confidentiality: confidentiality,
        description: desc,
        employee_statement: {
          explanation: empExpl,
          employee_response: empResp
        },
        hr_assessment: {
          root_cause: rootCause,
          assessment_notes: assessNotes,
          recommended_action: actionTaken
        },
        action_taken: actionTaken,
        status: existing?.status || "Open",
        hr_officer: currentSession?.nama || "HR Officer",
        hr_officer_username: currentSession?.username || "",
        updated_at: new Date().toISOString()
      };

      try {
        saveBtn.disabled = true;
        saveBtn.textContent = "Menyimpan...";

        if (isEdit) {
          await fsUpdate(COL.HR_CASES || "hr_cases", caseId, payload);
          await addAuditLog(caseId, autoCaseNumber, "UPDATE_CASE", "Memperbarui rincian kasus pembinaan");
          toast("Kasus berhasil diperbarui", "success");
        } else {
          payload.created_at = new Date().toISOString();
          payload.created_by = currentSession?.username || "HR";
          const newDoc = await fsAdd(COL.HR_CASES || "hr_cases", payload);
          await addAuditLog(newDoc.id, autoCaseNumber, "CREATE_CASE", `Kasus baru dibuat untuk ${nama} (${caseType})`);
          toast("Kasus pembinaan baru berhasil dicatat", "success");
        }

        closeModal();
        const mainContainer = document.getElementById("view-container");
        if (mainContainer) reloadAllData(mainContainer);
      } catch (err) {
        console.error("Gagal menyimpan kasus:", err);
        toast("Gagal menyimpan: " + err.message, "error");
        saveBtn.disabled = false;
        saveBtn.textContent = "Simpan Kasus";
      }
    };
  }
}

// =========================================================================
// MODAL: CASE DOSSIER & DETAIL
// =========================================================================
export function showCaseDetail(caseId) {
  const c = allCases.find(x => String(x.id) === String(caseId));
  if (!c) {
    toast("Data kasus tidak ditemukan", "error");
    return;
  }

  const caseAps = allActionPlans.filter(a => String(a.case_id) === String(caseId));
  const caseFls = allFollowups.filter(f => String(f.case_id) === String(caseId));

  const html = `
    <div class="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
      <!-- Header Banner -->
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-black text-maroon-700">${escapeHtml(c.case_number || c.id)}</span>
            ${renderPriorityBadge(c.priority)}
            ${renderStatusBadge(c.status)}
          </div>
          <div class="text-xs text-slate-500 mt-1">Dibuat tgl <b>${fmtDateShort(c.created_at || c.report_date)}</b> oleh <b>${escapeHtml(c.hr_officer || c.created_by || "HR")}</b></div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="window.kcAddActionPlan('${c.id}')" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-2xs transition">+ Action Plan</button>
          <button type="button" onclick="window.kcAddFollowup('${c.id}')" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-2xs transition">+ Follow-up</button>
          ${c.status !== "Closed" ? `
            <button type="button" onclick="window.kcCloseCase('${c.id}')" class="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-2xs transition">Tutup Kasus</button>
          ` : ""}
          <button type="button" onclick="window.kcPrintCaseDossier('${c.id}')" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-2xs transition">Print PDF</button>
        </div>
      </div>

      <!-- Employee Data -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
        <div><span class="text-slate-400 font-semibold block">Nama Karyawan:</span><b class="text-slate-800">${escapeHtml(c.nama_karyawan)}</b></div>
        <div><span class="text-slate-400 font-semibold block">NIK:</span><b class="text-slate-800">${escapeHtml(c.nik || "-")}</b></div>
        <div><span class="text-slate-400 font-semibold block">Jabatan / Divisi:</span><b class="text-slate-800">${escapeHtml(c.jabatan || "-")} &bull; ${escapeHtml(c.departemen || "-")}</b></div>
        <div><span class="text-slate-400 font-semibold block">Cabang:</span><b class="text-slate-800">${escapeHtml(c.cabang || "-")}</b></div>
      </div>

      <!-- Core Fact & Incident -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
        <h4 class="font-black text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-1.5">Fakta Lapangan & Deskripsi Kejadian</h4>
        <div class="flex items-center gap-4 text-slate-500 mb-1">
          <span>Tipe: <b class="text-slate-700">${escapeHtml(c.case_type)}</b></span>
          <span>Kategori: <b class="text-slate-700">${escapeHtml(c.category)}</b></span>
          <span>Tgl Kejadian: <b class="text-slate-700">${fmtDateShort(c.incident_date)}</b></span>
        </div>
        <p class="text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-100">${escapeHtml(c.description || "-")}</p>
      </div>

      <!-- Employee Statement & HR Assessment -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
          <h4 class="font-black text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-1.5">Pernyataan Karyawan (Employee Statement)</h4>
          <div>
            <span class="text-slate-400 font-semibold block">Klarifikasi & Penjelasan:</span>
            <p class="text-slate-700 mt-0.5 font-medium">${escapeHtml(c.employee_statement?.explanation || "Belum ada pernyataan tercatat.")}</p>
          </div>
          <div>
            <span class="text-slate-400 font-semibold block">Komitmen:</span>
            <p class="text-slate-700 mt-0.5 font-medium">${escapeHtml(c.employee_statement?.employee_response || "-")}</p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
          <h4 class="font-black text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-1.5">HR Assessment & Tindakan</h4>
          <div>
            <span class="text-slate-400 font-semibold block">Akar Masalah (Root Cause):</span>
            <b class="text-slate-800">${escapeHtml(c.hr_assessment?.root_cause || "-")}</b>
          </div>
          <div>
            <span class="text-slate-400 font-semibold block">Tindakan yang Diambil:</span>
            <b class="text-maroon-700">${escapeHtml(c.action_taken || "-")}</b>
          </div>
          <div>
            <span class="text-slate-400 font-semibold block">Catatan Analisa HR:</span>
            <p class="text-slate-700 mt-0.5 font-medium">${escapeHtml(c.hr_assessment?.assessment_notes || "-")}</p>
          </div>
        </div>
      </div>

      <!-- Action Plans Section -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <h4 class="font-black text-slate-800 uppercase tracking-wider text-[11px]">Rencana Aksi Pembinaan (Action Plans)</h4>
          <span class="text-xs font-bold text-amber-700">${caseAps.length} Rencana</span>
        </div>
        ${caseAps.length === 0 ? `
          <p class="text-xs text-slate-400 italic py-2">Belum ada action plan yang dibuat untuk kasus ini.</p>
        ` : `
          <div class="space-y-2">
            ${caseAps.map(ap => `
              <div class="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-800">${escapeHtml(ap.description)}</div>
                  <div class="text-[10px] text-slate-500 mt-0.5">PIC: <b>${escapeHtml(ap.pic || "Employee")}</b> &bull; Target: <b>${fmtDateShort(ap.target_date)}</b> &bull; Indikator: ${escapeHtml(ap.measurement || "-")}</div>
                </div>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-md ${ap.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${ap.status}</span>
              </div>
            `).join("")}
          </div>
        `}
      </div>

      <!-- Monitoring & Follow-up History -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <h4 class="font-black text-slate-800 uppercase tracking-wider text-[11px]">Riwayat Monitoring & Follow-up</h4>
          <span class="text-xs font-bold text-sky-700">${caseFls.length} Sesi</span>
        </div>
        ${caseFls.length === 0 ? `
          <p class="text-xs text-slate-400 italic py-2">Belum ada catatan follow-up.</p>
        ` : `
          <div class="space-y-2">
            ${caseFls.map(fl => `
              <div class="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">Tgl: ${fmtDateShort(fl.followup_date)}</span>
                  ${renderImprovementBadge(fl.improvement_status)}
                </div>
                <p class="text-slate-600">${escapeHtml(fl.employee_progress || fl.notes || "-")}</p>
              </div>
            `).join("")}
          </div>
        `}
      </div>

      <!-- Resolution Section if Closed -->
      ${c.status === "Closed" ? `
        <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200 space-y-2 text-xs">
          <h4 class="font-black text-emerald-900 uppercase tracking-wider text-[11px]">Resolusi & Penutupan Kasus</h4>
          <div><span class="text-emerald-700 font-semibold">Hasil Akhir:</span> <b class="text-emerald-900">${escapeHtml(c.resolution || "-")}</b></div>
          <div><span class="text-emerald-700 font-semibold">Tgl Penutupan:</span> <b class="text-emerald-900">${fmtDateShort(c.closing_date)}</b></div>
        </div>
      ` : ""}
    </div>
  `;

  openModal({
    title: `Berkas Kasus: ${escapeHtml(c.case_number || c.id)}`,
    content: html,
    maxWidth: "max-w-4xl"
  });
}

// =========================================================================
// ACTION PLAN & FOLLOW-UP MODALS
// =========================================================================
export function showAddActionPlanModal(caseId) {
  const c = allCases.find(x => String(x.id) === String(caseId));
  if (!c) return;

  const html = `
    <div class="space-y-4 text-xs">
      <div>
        <label class="block font-bold text-slate-700 mb-1">Deskripsi Action Plan <span class="text-rose-500">*</span></label>
        <textarea id="kc-ap-desc" rows="2" placeholder="Contoh: Memastikan kehadiran tepat waktu minimal 14 hari kerja berturut-turut..." class="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium focus:border-maroon-700"></textarea>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block font-bold text-slate-700 mb-1">PIC (Penanggung Jawab)</label>
          <input type="text" id="kc-ap-pic" value="Employee & SPV" class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Target Tanggal Selesai <span class="text-rose-500">*</span></label>
          <input type="date" id="kc-ap-target" class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
        </div>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Indikator Keberhasilan (Measurement)</label>
        <input type="text" id="kc-ap-measurement" placeholder="Contoh: Log absensi tidak mencatat keterlambatan..." class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
      </div>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
        <button type="button" onclick="window.kcCloseModal()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold">Batal</button>
        <button type="button" id="kc-ap-btn-save" class="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs">Simpan Action Plan</button>
      </div>
    </div>
  `;

  openModal({
    title: `Tambah Action Plan — ${escapeHtml(c.case_number || c.id)}`,
    content: html,
    maxWidth: "max-w-lg"
  });

  const saveBtn = document.getElementById("kc-ap-btn-save");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const desc = document.getElementById("kc-ap-desc")?.value.trim();
      const pic = document.getElementById("kc-ap-pic")?.value.trim() || "Employee";
      const targetDate = document.getElementById("kc-ap-target")?.value;
      const measure = document.getElementById("kc-ap-measurement")?.value.trim();

      if (!desc || !targetDate) {
        toast("Silakan isi deskripsi dan target tanggal selesai", "warning");
        return;
      }

      try {
        await fsAdd(COL.HR_CASE_ACTION_PLANS || "hr_case_action_plans", {
          case_id: caseId,
          case_number: c.case_number || c.id,
          employee_name: c.nama_karyawan,
          description: desc,
          pic: pic,
          target_date: targetDate,
          measurement: measure || "-",
          status: "In Progress",
          created_at: new Date().toISOString()
        });

        // Update case status to 'Action Plan' if still Open/Counseling
        if (["Open", "Counseling", "Coaching"].includes(c.status)) {
          await fsUpdate(COL.HR_CASES || "hr_cases", caseId, { status: "Action Plan" });
        }

        await addAuditLog(caseId, c.case_number, "ADD_ACTION_PLAN", `Action plan ditambahkan: ${desc}`);
        toast("Action plan berhasil ditambahkan", "success");
        closeModal();
        const mainContainer = document.getElementById("view-container");
        if (mainContainer) reloadAllData(mainContainer);
      } catch (err) {
        toast("Gagal menambah action plan: " + err.message, "error");
      }
    };
  }
}

export function showAddFollowupModal(caseId) {
  const c = allCases.find(x => String(x.id) === String(caseId));
  if (!c) return;

  const html = `
    <div class="space-y-4 text-xs">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Tanggal Monitoring <span class="text-rose-500">*</span></label>
          <input type="date" id="kc-fol-date" value="${new Date().toISOString().split('T')[0]}" class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Indikator Perbaikan <span class="text-rose-500">*</span></label>
          <select id="kc-fol-improvement" class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:border-maroon-700">
            <option value="Significant Improvement">Significant Improvement</option>
            <option value="Improvement" selected>Improvement</option>
            <option value="No Improvement">No Improvement</option>
            <option value="Regression">Regression</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Kondisi & Progress Karyawan <span class="text-rose-500">*</span></label>
        <textarea id="kc-fol-progress" rows="2" placeholder="Catat perubahan perilaku atau peningkatan kinerja..." class="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium focus:border-maroon-700"></textarea>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Feedback Supervisor / HR</label>
        <textarea id="kc-fol-feedback" rows="2" placeholder="Umpan balik dari atasan langsung..." class="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium focus:border-maroon-700"></textarea>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Jadwal Follow-up Berikutnya</label>
        <input type="date" id="kc-fol-next-date" class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
      </div>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
        <button type="button" onclick="window.kcCloseModal()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold">Batal</button>
        <button type="button" id="kc-fol-btn-save" class="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-xs">Simpan Follow-up</button>
      </div>
    </div>
  `;

  openModal({
    title: `Catat Monitoring Follow-up — ${escapeHtml(c.case_number || c.id)}`,
    content: html,
    maxWidth: "max-w-lg"
  });

  const saveBtn = document.getElementById("kc-fol-btn-save");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const folDate = document.getElementById("kc-fol-date")?.value;
      const improve = document.getElementById("kc-fol-improvement")?.value;
      const progress = document.getElementById("kc-fol-progress")?.value.trim();
      const feedback = document.getElementById("kc-fol-feedback")?.value.trim();
      const nextDate = document.getElementById("kc-fol-next-date")?.value;

      if (!folDate || !progress) {
        toast("Silakan isi tanggal dan catatan progress karyawan", "warning");
        return;
      }

      try {
        await fsAdd(COL.HR_CASE_FOLLOWUPS || "hr_case_followups", {
          case_id: caseId,
          case_number: c.case_number || c.id,
          followup_date: folDate,
          improvement_status: improve,
          employee_progress: progress,
          supervisor_feedback: feedback || "-",
          next_followup_date: nextDate || "",
          created_by: currentSession?.username || "HR",
          created_at: new Date().toISOString()
        });

        // Update case status to 'Monitoring'
        await fsUpdate(COL.HR_CASES || "hr_cases", caseId, { status: "Monitoring" });

        await addAuditLog(caseId, c.case_number, "ADD_FOLLOWUP", `Follow-up dicatat (${improve})`);
        toast("Catatan follow-up berhasil disimpan", "success");
        closeModal();
        const mainContainer = document.getElementById("view-container");
        if (mainContainer) reloadAllData(mainContainer);
      } catch (err) {
        toast("Gagal menyimpan follow-up: " + err.message, "error");
      }
    };
  }
}

// =========================================================================
// CLOSE CASE MODAL (PRD Item 33)
// =========================================================================
export function showCloseCaseModal(caseId) {
  const c = allCases.find(x => String(x.id) === String(caseId));
  if (!c) return;

  const html = `
    <div class="space-y-4 text-xs">
      <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800">
        Pastikan pembinaan dan action plan telah berjalan dengan baik sebelum menutup kasus secara resmi.
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Resolusi / Hasil Akhir Pembinaan <span class="text-rose-500">*</span></label>
        <textarea id="kc-close-resolution" rows="3" placeholder="Contoh: Karyawan telah menunjukkan perbaikan kedisiplinan dan absensi normal selama 30 hari..." class="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium focus:border-maroon-700"></textarea>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Tanggal Penutupan Kasus <span class="text-rose-500">*</span></label>
        <input type="date" id="kc-close-date" value="${new Date().toISOString().split('T')[0]}" class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium focus:border-maroon-700">
      </div>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
        <button type="button" onclick="window.kcCloseModal()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold">Batal</button>
        <button type="button" id="kc-close-btn-save" class="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-xs">Tutup Kasus Resmi</button>
      </div>
    </div>
  `;

  openModal({
    title: `Tutup Kasus (Case Closing) — ${escapeHtml(c.case_number || c.id)}`,
    content: html,
    maxWidth: "max-w-md"
  });

  const saveBtn = document.getElementById("kc-close-btn-save");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const res = document.getElementById("kc-close-resolution")?.value.trim();
      const closeDate = document.getElementById("kc-close-date")?.value;

      if (!res || !closeDate) {
        toast("Silakan isi ringkasan resolusi dan tanggal penutupan", "warning");
        return;
      }

      try {
        await fsUpdate(COL.HR_CASES || "hr_cases", caseId, {
          status: "Closed",
          resolution: res,
          closing_date: closeDate,
          closed_at: new Date().toISOString(),
          closed_by: currentSession?.username || "HR"
        });

        await addAuditLog(caseId, c.case_number, "CLOSE_CASE", `Kasus resmi ditutup dengan resolusi: ${res}`);
        toast("Kasus berhasil ditutup secara resmi", "success");
        closeModal();
        const mainContainer = document.getElementById("view-container");
        if (mainContainer) reloadAllData(mainContainer);
      } catch (err) {
        toast("Gagal menutup kasus: " + err.message, "error");
      }
    };
  }
}

// =========================================================================
// AUDIT LOG HELPER
// =========================================================================
async function addAuditLog(caseId, caseNumber, action, details) {
  try {
    await fsAdd(COL.HR_CASE_AUDIT_LOGS || "hr_case_audit_logs", {
      case_id: caseId,
      case_number: caseNumber || caseId,
      user_id: currentSession?.username || "SYSTEM",
      user_nama: currentSession?.nama || "HR Officer",
      action: action,
      details: details,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn("Could not write audit log:", e);
  }
}

// =========================================================================
// PDF DOSSIER GENERATOR (PRD Item 25)
// =========================================================================
export async function printCaseDossier(caseId) {
  const c = allCases.find(x => String(x.id) === String(caseId));
  if (!c) {
    toast("Data kasus tidak ditemukan", "error");
    return;
  }

  const caseAps = allActionPlans.filter(a => String(a.case_id) === String(caseId));
  const caseFls = allFollowups.filter(f => String(f.case_id) === String(caseId));

  toast("Menyiapkan berkas Case Report PDF...", "info");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Case Report — ${escapeHtml(c.case_number || c.id)}</title>
  <style>
    @page { size: A4; margin: 10mm 12mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.4; margin: 0; padding: 0; }
    .header-box { border-bottom: 2px solid #7a1f2b; padding-bottom: 8px; margin-bottom: 12px; }
    .header-title { font-size: 15px; font-weight: bold; color: #7a1f2b; margin: 0; text-transform: uppercase; }
    .header-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
    .section-title { font-size: 11px; font-weight: bold; background: #f1f5f9; padding: 5px 8px; border-left: 3px solid #7a1f2b; margin-top: 12px; margin-bottom: 6px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { padding: 4px 6px; font-size: 10.5px; vertical-align: top; }
    .grid-table td { border-bottom: 1px solid #f1f5f9; }
    .bordered-table th, .bordered-table td { border: 1px solid #cbd5e1; }
    .bordered-table th { background: #f8fafc; font-weight: bold; text-align: left; }
    .sign-box { margin-top: 25px; page-break-inside: avoid; }
    .badge { display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: bold; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header-box">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 class="header-title">BERKAS PEMBINAAN & KONSELING KARYAWAN</h1>
        <div class="header-sub">CV ANDELA JAYA &bull; Human Resource Information System</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: bold; font-size: 12px; color: #7a1f2b;">${escapeHtml(c.case_number || c.id)}</div>
        <div style="font-size: 9.5px; color: #64748b;">Kerahasiaan: <b>${escapeHtml(c.confidentiality || "Normal")}</b></div>
      </div>
    </div>
  </div>

  <div class="section-title">1. Profil Karyawan</div>
  <table class="grid-table">
    <tr>
      <td width="20%"><b>Nama Karyawan</b></td>
      <td width="30%">: ${escapeHtml(c.nama_karyawan)}</td>
      <td width="20%"><b>Jabatan</b></td>
      <td width="30%">: ${escapeHtml(c.jabatan || "-")}</td>
    </tr>
    <tr>
      <td><b>NIK</b></td>
      <td>: ${escapeHtml(c.nik || "-")}</td>
      <td><b>Departemen / Divisi</b></td>
      <td>: ${escapeHtml(c.departemen || "-")}</td>
    </tr>
    <tr>
      <td><b>Cabang</b></td>
      <td>: ${escapeHtml(c.cabang || "-")}</td>
      <td><b>HR Officer / Konselor</b></td>
      <td>: ${escapeHtml(c.hr_officer || "-")}</td>
    </tr>
  </table>

  <div class="section-title">2. Fakta Masalah & Kejadian</div>
  <table class="grid-table">
    <tr>
      <td width="20%"><b>Tipe Pembinaan</b></td>
      <td width="30%">: ${escapeHtml(c.case_type)}</td>
      <td width="20%"><b>Prioritas</b></td>
      <td width="30%">: ${escapeHtml(c.priority)}</td>
    </tr>
    <tr>
      <td><b>Kategori Kasus</b></td>
      <td>: ${escapeHtml(c.category)}</td>
      <td><b>Tanggal Kejadian</b></td>
      <td>: ${fmtDateShort(c.incident_date)}</td>
    </tr>
    <tr>
      <td><b>Sumber Informasi</b></td>
      <td>: ${escapeHtml(c.source || "-")}</td>
      <td><b>Status Kasus</b></td>
      <td>: ${escapeHtml(c.status)}</td>
    </tr>
  </table>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 8px; margin-top: 4px; font-size: 10.5px;">
    <b>Uraian Fakta Lapangan:</b><br>
    ${escapeHtml(c.description || "-")}
  </div>

  <div class="section-title">3. Klarifikasi & Pernyataan Karyawan (Employee Statement)</div>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 10.5px;">
    <b>Pernyataan / Penjelasan Karyawan:</b><br>
    ${escapeHtml(c.employee_statement?.explanation || "-")}<br><br>
    <b>Respon & Komitmen Karyawan:</b><br>
    ${escapeHtml(c.employee_statement?.employee_response || "-")}
  </div>

  <div class="section-title">4. HR Assessment & Tindakan yang Diambil</div>
  <table class="grid-table">
    <tr>
      <td width="20%"><b>Akar Masalah (Root Cause)</b></td>
      <td width="30%">: ${escapeHtml(c.hr_assessment?.root_cause || "-")}</td>
      <td width="20%"><b>Tindakan (Action Taken)</b></td>
      <td width="30%">: ${escapeHtml(c.action_taken || "-")}</td>
    </tr>
  </table>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 8px; margin-top: 4px; font-size: 10.5px;">
    <b>Analisa & Catatan HR:</b><br>
    ${escapeHtml(c.hr_assessment?.assessment_notes || "-")}
  </div>

  <div class="section-title">5. Rencana Aksi (Action Plans)</div>
  <table class="bordered-table">
    <thead>
      <tr>
        <th width="40%">Deskripsi Rencana Aksi</th>
        <th width="20%">PIC</th>
        <th width="20%">Target Selesai</th>
        <th width="20%">Status</th>
      </tr>
    </thead>
    <tbody>
      ${caseAps.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: #94a3b8;">Belum ada action plan tercatat</td></tr>' : caseAps.map(a => `
        <tr>
          <td>${escapeHtml(a.description)}</td>
          <td>${escapeHtml(a.pic || "-")}</td>
          <td>${fmtDateShort(a.target_date)}</td>
          <td>${escapeHtml(a.status)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="section-title">6. Riwayat Monitoring & Evaluasi Follow-up</div>
  <table class="bordered-table">
    <thead>
      <tr>
        <th width="20%">Tgl Monitoring</th>
        <th width="25%">Indikator Perbaikan</th>
        <th width="55%">Perkembangan & Feedback</th>
      </tr>
    </thead>
    <tbody>
      ${caseFls.length === 0 ? '<tr><td colspan="3" style="text-align: center; color: #94a3b8;">Belum ada catatan follow-up</td></tr>' : caseFls.map(f => `
        <tr>
          <td>${fmtDateShort(f.followup_date)}</td>
          <td><b>${escapeHtml(f.improvement_status || "-")}</b></td>
          <td>${escapeHtml(f.employee_progress || f.notes || "-")}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  ${c.status === "Closed" ? `
    <div class="section-title">7. Kesimpulan & Resolusi Penutupan Kasus</div>
    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 6px 8px; font-size: 10.5px;">
      <b>Hasil Akhir & Resolusi (Tgl: ${fmtDateShort(c.closing_date)}):</b><br>
      ${escapeHtml(c.resolution || "-")}
    </div>
  ` : ""}

  <div class="sign-box">
    <table style="text-align: center; font-size: 10px;">
      <tr>
        <td width="33%">Karyawan Bersangkutan,</td>
        <td width="33%">Atasan Langsung (SPV/Manager),</td>
        <td width="34%">HRD / Konselor,</td>
      </tr>
      <tr>
        <td height="50px"></td>
        <td height="50px"></td>
        <td height="50px"></td>
      </tr>
      <tr>
        <td><b>(${escapeHtml(c.nama_karyawan)})</b></td>
        <td><b>(${escapeHtml(c.atasan || "Supervisor")})</b></td>
        <td><b>(${escapeHtml(c.hr_officer || "HR Department")})</b></td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;

  const fileName = `Case_Report_${(c.case_number || c.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  await downloadHtmlAsPdf(html, fileName);
  toast("Berkas Case Report PDF berhasil diunduh!", "success");
}

export function exportManagementPdf() {
  const visible = filterCasesByRole(allCases);
  if (visible.length === 0) {
    toast("Tidak ada data kasus untuk dibuatkan ringkasan PDF", "warning");
    return;
  }

  const total = visible.length;
  const closed = visible.filter(c => c.status === "Closed").length;
  const active = visible.filter(c => c.status !== "Closed" && c.status !== "Cancelled").length;
  const escalated = visible.filter(c => c.status === "Escalated").length;
  const resolutionRate = total > 0 ? Math.round((closed / total) * 100) : 0;

  // Breakdown by case type
  const typeCounts = {};
  visible.forEach(c => {
    typeCounts[c.case_type] = (typeCounts[c.case_type] || 0) + 1;
  });

  // Breakdown by department
  const deptCounts = {};
  visible.forEach(c => {
    const d = c.departemen || "Lainnya";
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Executive Summary — HR Case Management</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.4; margin: 0; padding: 0; }
    .header-box { border-bottom: 2px solid #7a1f2b; padding-bottom: 8px; margin-bottom: 14px; }
    .header-title { font-size: 16px; font-weight: bold; color: #7a1f2b; margin: 0; text-transform: uppercase; }
    .header-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
    .section-title { font-size: 11px; font-weight: bold; background: #f1f5f9; padding: 5px 8px; border-left: 3px solid #7a1f2b; margin-top: 14px; margin-bottom: 8px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { padding: 5px 8px; font-size: 10.5px; vertical-align: top; }
    .bordered-table th, .bordered-table td { border: 1px solid #cbd5e1; }
    .bordered-table th { background: #f8fafc; font-weight: bold; text-align: left; }
    .stat-card { border: 1px solid #e2e8f0; background: #f8fafc; padding: 8px; text-align: center; border-radius: 4px; }
    .stat-num { font-size: 18px; font-weight: bold; color: #7a1f2b; }
    .stat-lbl { font-size: 9.5px; color: #64748b; text-transform: uppercase; font-weight: bold; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="header-box">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 class="header-title">RINGKASAN EKSEKUTIF PEMBINAAN & KONSELING</h1>
        <div class="header-sub">CV ANDELA JAYA &bull; Human Resource Information System</div>
      </div>
      <div style="text-align: right; font-size: 9.5px; color: #64748b;">
        Tanggal Cetak: ${fmtDateShort(new Date().toISOString().split("T")[0])}<br>
        Dicetak Oleh: ${escapeHtml(currentSession?.nama || "HR Department")}
      </div>
    </div>
  </div>

  <table style="margin-bottom: 12px;">
    <tr>
      <td width="25%"><div class="stat-card"><div class="stat-num">${total}</div><div class="stat-lbl">Total Kasus</div></div></td>
      <td width="25%"><div class="stat-card"><div class="stat-num" style="color:#0369a1;">${active}</div><div class="stat-lbl">Kasus Aktif</div></div></td>
      <td width="25%"><div class="stat-card"><div class="stat-num" style="color:#047857;">${closed} (${resolutionRate}%)</div><div class="stat-lbl">Terselesaikan</div></div></td>
      <td width="25%"><div class="stat-card"><div class="stat-num" style="color:#7e22ce;">${escalated}</div><div class="stat-lbl">Eskalasi Formal</div></div></td>
    </tr>
  </table>

  <div class="section-title">1. Distribusi Kasus Berdasarkan Tipe & Departemen</div>
  <table style="margin-bottom: 8px;">
    <tr>
      <td width="50%" style="padding: 0 4px 0 0;">
        <table class="bordered-table">
          <thead><tr><th>Tipe Pembinaan</th><th width="30%">Jumlah</th></tr></thead>
          <tbody>
            ${Object.entries(typeCounts).map(([t, count]) => `
              <tr><td>${escapeHtml(t)}</td><td style="font-weight:bold;">${count}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </td>
      <td width="50%" style="padding: 0 0 0 4px;">
        <table class="bordered-table">
          <thead><tr><th>Departemen / Unit</th><th width="30%">Jumlah</th></tr></thead>
          <tbody>
            ${Object.entries(deptCounts).map(([d, count]) => `
              <tr><td>${escapeHtml(d)}</td><td style="font-weight:bold;">${count}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </td>
    </tr>
  </table>

  <div class="section-title">2. Daftar Kasus Pembinaan Karyawan</div>
  <table class="bordered-table">
    <thead>
      <tr>
        <th width="15%">No. Kasus</th>
        <th width="20%">Nama Karyawan</th>
        <th width="18%">Departemen / Cabang</th>
        <th width="15%">Tipe Kasus</th>
        <th width="12%">Prioritas</th>
        <th width="20%">Status & Tindakan</th>
      </tr>
    </thead>
    <tbody>
      ${visible.map(c => `
        <tr>
          <td><b>${escapeHtml(c.case_number || c.id)}</b><br><span style="font-size:9px; color:#64748b;">${fmtDateShort(c.incident_date)}</span></td>
          <td><b>${escapeHtml(c.nama_karyawan)}</b><br><span style="font-size:9px; color:#64748b;">NIK: ${escapeHtml(c.nik || "-")}</span></td>
          <td>${escapeHtml(c.departemen || "-")}<br><span style="font-size:9px; color:#64748b;">${escapeHtml(c.cabang || "-")}</span></td>
          <td>${escapeHtml(c.case_type)}</td>
          <td><b>${escapeHtml(c.priority)}</b></td>
          <td><b>${escapeHtml(c.status)}</b><br><span style="font-size:9px; color:#64748b;">${escapeHtml(c.action_taken || "-")}</span></td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div style="margin-top: 30px; page-break-inside: avoid;">
    <table style="text-align: center; font-size: 10px;">
      <tr>
        <td width="50%">Disusun Oleh,<br><br><br><br><b>(${escapeHtml(currentSession?.nama || "HR Officer")})</b><br>HR Department</td>
        <td width="50%">Mengetahui,<br><br><br><br><b>(_________________________)</b><br>HR Manager / Direksi</td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;

  downloadHtmlAsPdf(html, `Executive_Summary_HR_Cases_${new Date().toISOString().split("T")[0]}.pdf`);
  toast("Ringkasan Eksekutif PDF berhasil diunduh!", "success");
}

export function showUpdateApStatusModal(actionPlanId) {
  const ap = allActionPlans.find(x => String(x.id) === String(actionPlanId));
  if (!ap) {
    toast("Action Plan tidak ditemukan", "error");
    return;
  }

  const html = `
    <div class="space-y-4 text-xs">
      <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div class="font-bold text-slate-800">${escapeHtml(ap.description)}</div>
        <div class="text-[11px] text-slate-500 mt-1">Karyawan: <b>${escapeHtml(ap.employee_name || "-")}</b> &bull; Target: <b>${fmtDateShort(ap.target_date)}</b></div>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Status Action Plan <span class="text-rose-500">*</span></label>
        <select id="kc-up-ap-status" class="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold focus:border-maroon-700">
          <option value="Pending" ${ap.status === "Pending" ? "selected" : ""}>Pending</option>
          <option value="In Progress" ${ap.status === "In Progress" ? "selected" : ""}>In Progress</option>
          <option value="Completed" ${ap.status === "Completed" ? "selected" : ""}>Completed</option>
          <option value="Cancelled" ${ap.status === "Cancelled" ? "selected" : ""}>Cancelled</option>
        </select>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Catatan Pencapaian / Hasil</label>
        <textarea id="kc-up-ap-note" rows="3" placeholder="Catat progress pencapaian target..." class="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium focus:border-maroon-700">${escapeHtml(ap.notes || "")}</textarea>
      </div>
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
        <button type="button" onclick="window.kcCloseModal()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold">Batal</button>
        <button type="button" id="kc-up-ap-btn-save" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl font-bold shadow-xs">Simpan Status</button>
      </div>
    </div>
  `;

  openModal({
    title: `Update Progress Action Plan`,
    content: html,
    maxWidth: "max-w-md"
  });

  const saveBtn = document.getElementById("kc-up-ap-btn-save");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const status = document.getElementById("kc-up-ap-status")?.value;
      const note = document.getElementById("kc-up-ap-note")?.value.trim();

      try {
        await fsUpdate(COL.HR_CASE_ACTION_PLANS || "hr_case_action_plans", actionPlanId, {
          status: status,
          notes: note || "",
          updated_at: new Date().toISOString(),
          updated_by: currentSession?.username || "HR"
        });

        await addAuditLog(ap.case_id, ap.case_number, "UPDATE_ACTION_PLAN", `Status Action Plan diubah menjadi: ${status}`);
        toast("Status Action Plan berhasil diperbarui", "success");
        closeModal();
        const mainContainer = document.getElementById("view-container");
        if (mainContainer) reloadAllData(mainContainer);
      } catch (err) {
        toast("Gagal mengupdate Action Plan: " + err.message, "error");
      }
    };
  }
}

// =========================================================================
// EXCEL EXPORT
// =========================================================================
export function exportCasesToExcel() {
  const visible = filterCasesByRole(allCases);
  if (visible.length === 0) {
    toast("Tidak ada data kasus untuk diekspor", "warning");
    return;
  }

  const rows = visible.map((c, idx) => ({
    No: idx + 1,
    "Case Number": c.case_number || c.id,
    "Nama Karyawan": c.nama_karyawan,
    NIK: c.nik || "-",
    Jabatan: c.jabatan || "-",
    Departemen: c.departemen || "-",
    Cabang: c.cabang || "-",
    "Tipe Kasus": c.case_type,
    Kategori: c.category,
    Prioritas: c.priority,
    Status: c.status,
    "Tgl Kejadian": c.incident_date,
    "Tgl Lapor": c.report_date || c.created_at,
    "Akar Masalah": c.hr_assessment?.root_cause || "-",
    "Tindakan Diambil": c.action_taken || "-",
    Kerahasiaan: c.confidentiality || "Normal",
    "HR Officer": c.hr_officer || "-",
    Resolusi: c.resolution || "-"
  }));

  downloadXlsx(rows, `Rekap_Konseling_Coaching_${new Date().toISOString().split("T")[0]}`);
  toast("Data rekap kasus berhasil diekspor ke Excel", "success");
}

// =========================================================================
// GLOBAL WINDOW BINDINGS FOR TEMPLATE CALLS
// =========================================================================
window.kcShowCaseDetail = showCaseDetail;
window.kcEditCase = (caseId) => showCaseFormModal(caseId);
window.kcAddActionPlan = showAddActionPlanModal;
window.kcAddFollowup = showAddFollowupModal;
window.kcCloseCase = showCloseCaseModal;
window.kcPrintCaseDossier = printCaseDossier;
window.kcExportAllExcel = exportCasesToExcel;
window.kcExportManagementPdf = exportManagementPdf;
window.kcUpdateApStatus = showUpdateApStatusModal;
window.kcCloseModal = () => closeModal();
window.kcSwitchToTab = (tabName) => {
  const container = document.getElementById("view-container");
  if (container) switchTab(container, tabName);
};
window.kcFilterRecurring = () => {
  caseOnlyRecurring = true;
  const container = document.getElementById("view-container");
  if (container) switchTab(container, "case_management");
};
window.kcFilterAp = (st) => {
  apFilterStatus = st;
  const container = document.getElementById("view-container");
  if (container) renderActionPlanTab(container);
};
