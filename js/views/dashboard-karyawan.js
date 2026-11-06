import { COL } from "../firebase-config.js";
import {
  fsGetAll, escapeHtml, toast, downloadXlsx, downloadHtmlAsPdf, fmtDate
} from "../utils.js";
import { avatar, emptyState, skeletonRows } from "../components.js";
import { letterheadHtml, officialPrintHtml } from "../branding.js";
import { resolveBranchScope, branchMatches } from "../auth.js";
import {
  ALL_PERIOD, recentPeriodOptions, periodLabel, buildDashboardRows, dashboardTotals,
  isActiveEmployee, normalizeNik, normalizePersonName
} from "../employee-achievement-dashboard.mjs";
import { formatSalesTarget } from "../kpi-sales.mjs";

// =========================================================================
// STATE
// =========================================================================
const state = {
  session: null,
  period: currentPeriod(),
  branch: "",
  division: "",
  search: "",
  includeInactive: false,
  tab: "summary",
  selectedKey: "",
  notesLimit: 40,
  scopedEmployees: [],
  rows: [],
  sources: {}
};

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function employeeKey(employee) {
  return normalizeNik(employee?.nik_karyawan || employee?.nik || employee?.id)
    || normalizePersonName(employee?.nama_karyawan || employee?.nama);
}

function employeeName(employee) {
  return employee?.nama_karyawan || employee?.nama || "-";
}

function escapeMultiline(value) {
  return escapeHtml(value ?? "-").replace(/\n/g, "<br/>");
}

function fmtNumber(value, digits = 2) {
  const number = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return "-";
  return number.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

function fmtMetric(value, unit) {
  if (value === null || value === undefined || value === "") return "-";
  return formatSalesTarget(value, unit);
}

function scoreTone(value) {
  if (value === null || value === undefined || value === "") return "slate";
  const number = Number(value);
  if (!Number.isFinite(number)) return "slate";
  if (number >= 85) return "green";
  if (number >= 70) return "blue";
  if (number >= 55) return "amber";
  return "red";
}

function toneClasses(tone) {
  return {
    green: "bg-emerald-100 text-emerald-700 border-emerald-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    red: "bg-red-100 text-red-700 border-red-200",
    maroon: "bg-maroon-50 text-maroon-700 border-maroon-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200"
  }[tone] || "bg-slate-100 text-slate-600 border-slate-200";
}

function pill(text, tone = "slate") {
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClasses(tone)}">${escapeHtml(text)}</span>`;
}

function barColor(tone) {
  return {
    green: "bg-emerald-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    slate: "bg-slate-400"
  }[tone] || "bg-slate-400";
}

function sanitizeFilename(value) {
  return String(value || "laporan").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 90);
}

// =========================================================================
// MOUNT
// =========================================================================
export async function mount(container, { session, params }) {
  state.session = session || null;
  state.period = currentPeriod();
  state.branch = "";
  state.division = "";
  state.search = "";
  state.includeInactive = false;
  state.tab = "summary";
  state.selectedKey = "";
  state.notesLimit = 40;

  const requestedPeriod = String(params?.get?.("periode") || "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod)) state.period = requestedPeriod;

  renderFilterOptions(container, []);
  bindEvents(container);
  showLoading(container);

  await loadSources(container);

  const requestedNik = String(params?.get?.("nik") || params?.get?.("nama") || "").trim();
  if (requestedNik) {
    const match = state.rows.find(row =>
      normalizeNik(row.employee?.nik_karyawan || row.employee?.nik) === normalizeNik(requestedNik)
      || normalizePersonName(employeeName(row.employee)) === normalizePersonName(requestedNik)
    );
    if (match) {
      state.selectedKey = employeeKey(match.employee);
      state.tab = "detail";
    }
  }

  renderAll(container);
  setTab(container, state.tab);
}

async function loadSources(container) {
  const branchScope = resolveBranchScope(state.session);
  const empty = () => [];

  const [
    employees, dailyLogs, targets, kpiLogs, kpiTasks, reviews,
    spRows, callRows, cases, contractEvals, pipPrograms
  ] = await Promise.all([
    fsGetAll(COL.MASTER_KARYAWAN).catch(empty),
    fsGetAll(COL.LOG_PENILAIAN_HARIAN).catch(empty),
    fsGetAll(COL.TARGET_BULANAN_KPI).catch(empty),
    fsGetAll(COL.LOG_PENILAIAN_KPI).catch(empty),
    fsGetAll(COL.TUGAS_KPI_360).catch(empty),
    fsGetAll(COL.PERFORMANCE_REVIEW).catch(empty),
    fsGetAll(COL.LOG_SP_KONSELING).catch(empty),
    fsGetAll(COL.DATA_PEMANGGILAN).catch(empty),
    fsGetAll(COL.HR_CASES || "hr_cases").catch(empty),
    fsGetAll(COL.EVALUASI_KONTRAK).catch(empty),
    fsGetAll(COL.PIP_PROGRAMS).catch(empty)
  ]);

  state.sources = {
    dailyLogs: dailyLogs || [],
    targets: targets || [],
    kpiLogs: kpiLogs || [],
    kpiTasks: kpiTasks || [],
    reviews: reviews || [],
    spRows: spRows || [],
    callRows: callRows || [],
    cases: cases || [],
    contractEvals: contractEvals || [],
    pipPrograms: pipPrograms || []
  };

  state.scopedEmployees = (employees || [])
    .filter(employee => branchMatches(branchScope, employee.cabang))
    .sort((left, right) => employeeName(left).localeCompare(employeeName(right), "id"));

  state.rows = buildDashboardRows({
    employees: state.scopedEmployees,
    period: state.period,
    sources: state.sources
  });

  renderFilterOptions(container, state.scopedEmployees);
}

// =========================================================================
// FILTERS & EVENTS
// =========================================================================
function renderFilterOptions(container, employees) {
  const periodSelect = container.querySelector("#dk-period");
  if (periodSelect) {
    const options = [{ value: ALL_PERIOD, label: "Semua Periode" }, ...recentPeriodOptions(new Date(), 24)];
    if (state.period && !options.some(option => option.value === state.period)) {
      options.splice(1, 0, { value: state.period, label: periodLabel(state.period) });
    }
    periodSelect.innerHTML = options
      .map(option => `<option value="${escapeHtml(option.value)}" ${option.value === state.period ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
      .join("");
  }

  const branchSelect = container.querySelector("#dk-branch");
  if (branchSelect) {
    const branches = [...new Set((employees || []).map(employee => String(employee.cabang || "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "id"));
    branchSelect.innerHTML = `<option value="">Semua Cabang</option>${branches
      .map(branch => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join("")}`;
    branchSelect.value = state.branch;
  }

  const divisionSelect = container.querySelector("#dk-division");
  if (divisionSelect) {
    const divisions = [...new Set((employees || []).map(employee => String(employee.divisi || employee.departemen || "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "id"));
    divisionSelect.innerHTML = `<option value="">Semua Divisi</option>${divisions
      .map(division => `<option value="${escapeHtml(division)}">${escapeHtml(division)}</option>`).join("")}`;
    divisionSelect.value = state.division;
  }
}

function bindEvents(container) {
  container.querySelector("#dk-period")?.addEventListener("change", event => {
    state.period = event.target.value || ALL_PERIOD;
    state.selectedKey = "";
    state.notesLimit = 40;
    recompute(container);
  });

  container.querySelector("#dk-branch")?.addEventListener("change", event => {
    state.branch = event.target.value;
    state.selectedKey = "";
    state.notesLimit = 40;
    renderAll(container);
  });

  container.querySelector("#dk-division")?.addEventListener("change", event => {
    state.division = event.target.value;
    state.selectedKey = "";
    state.notesLimit = 40;
    renderAll(container);
  });

  container.querySelector("#dk-search")?.addEventListener("input", event => {
    state.search = String(event.target.value || "").trim();
    state.selectedKey = "";
    state.notesLimit = 40;
    renderAll(container);
  });

  container.querySelector("#dk-include-inactive")?.addEventListener("change", event => {
    state.includeInactive = Boolean(event.target.checked);
    state.selectedKey = "";
    state.notesLimit = 40;
    renderAll(container);
  });

  container.querySelector("#dk-reset")?.addEventListener("click", () => {
    state.period = currentPeriod();
    state.branch = "";
    state.division = "";
    state.search = "";
    state.includeInactive = false;
    state.selectedKey = "";
    state.notesLimit = 40;
    const searchInput = container.querySelector("#dk-search");
    if (searchInput) searchInput.value = "";
    const inactiveInput = container.querySelector("#dk-include-inactive");
    if (inactiveInput) inactiveInput.checked = false;
    const periodSelect = container.querySelector("#dk-period");
    if (periodSelect) periodSelect.value = state.period;
    const branchSelect = container.querySelector("#dk-branch");
    if (branchSelect) branchSelect.value = "";
    const divisionSelect = container.querySelector("#dk-division");
    if (divisionSelect) divisionSelect.value = "";
    recompute(container);
  });

  container.querySelectorAll("[data-dk-tab]").forEach(button => {
    button.addEventListener("click", () => setTab(container, button.dataset.dkTab));
  });

  container.querySelector("#dk-employee")?.addEventListener("change", event => {
    state.selectedKey = event.target.value;
    state.notesLimit = 40;
    renderDetail(container, getVisibleRows());
  });

  container.querySelector("#dk-summary-table")?.addEventListener("click", event => {
    const target = event.target.closest("[data-dk-open]");
    if (!target) return;
    state.selectedKey = target.dataset.dkOpen;
    state.notesLimit = 40;
    setTab(container, "detail");
    renderEmployeeSelect(container, getVisibleRows());
    renderDetail(container, getVisibleRows());
    container.querySelector("#dk-panel-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  container.querySelector("#dk-detail-content")?.addEventListener("click", event => {
    if (event.target.closest("[data-dk-more-notes]")) {
      state.notesLimit = Number.MAX_SAFE_INTEGER;
      renderDetail(container, getVisibleRows());
    }
  });

  container.querySelector("#dk-btn-pdf")?.addEventListener("click", () => exportPdf(container, state.tab));
  container.querySelector("#dk-detail-pdf")?.addEventListener("click", () => exportPdf(container, "detail"));
  container.querySelector("#dk-btn-excel")?.addEventListener("click", () => exportExcel(container, state.tab));
  container.querySelector("#dk-detail-excel")?.addEventListener("click", () => exportExcel(container, "detail"));
}

function setTab(container, tab) {
  state.tab = tab === "detail" ? "detail" : "summary";
  container.querySelectorAll("[data-dk-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.dkTab === state.tab);
  });
  container.querySelector("#dk-panel-summary")?.classList.toggle("hidden", state.tab !== "summary");
  container.querySelector("#dk-panel-detail")?.classList.toggle("hidden", state.tab !== "detail");
}

function recompute(container) {
  state.rows = buildDashboardRows({
    employees: state.scopedEmployees,
    period: state.period,
    sources: state.sources
  });
  renderAll(container);
}

function getVisibleRows() {
  const keyword = normalizePersonName(state.search);
  return state.rows.filter(row => {
    const employee = row.employee;
    if (!state.includeInactive && !isActiveEmployee(employee)) return false;
    if (state.branch && !branchMatches(state.branch, employee.cabang)) return false;
    if (state.division && String(employee.divisi || employee.departemen || "") !== state.division) return false;
    if (keyword) {
      const haystack = normalizePersonName([
        employeeName(employee), employee.nik_karyawan || employee.nik || "",
        employee.jabatan || "", employee.divisi || employee.departemen || "", employee.cabang || ""
      ].join(" "));
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

// =========================================================================
// RENDER
// =========================================================================
function showLoading(container) {
  const stats = container.querySelector("#dk-stats");
  if (stats) {
    stats.innerHTML = Array.from({ length: 5 }).map(() => `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse">
        <div class="h-2.5 w-20 rounded bg-slate-200"></div>
        <div class="mt-3 h-7 w-16 rounded bg-slate-200"></div>
        <div class="mt-2 h-2 w-24 rounded bg-slate-100"></div>
      </div>`).join("");
  }
  const summary = container.querySelector("#dk-summary-table");
  if (summary) summary.innerHTML = `<div class="p-4">${skeletonRows(6)}</div>`;
  const detail = container.querySelector("#dk-detail-content");
  if (detail) detail.innerHTML = `<div class="p-4">${skeletonRows(4)}</div>`;
}

function renderAll(container) {
  const rows = getVisibleRows();
  renderStats(container, rows);
  renderSummary(container, rows);
  renderEmployeeSelect(container, rows);
  renderDetail(container, rows);
  renderFilterInfo(container, rows);
}

function renderFilterInfo(container, rows) {
  const info = container.querySelector("#dk-filter-info");
  if (!info) return;
  const parts = [
    `Periode: ${periodLabel(state.period)}`,
    `${rows.length} karyawan tampil`,
    state.branch ? `Cabang ${state.branch}` : "Semua cabang",
    state.division ? `Divisi ${state.division}` : "Semua divisi"
  ];
  info.textContent = parts.join(" · ");
}

function renderStats(container, rows) {
  const stats = container.querySelector("#dk-stats");
  if (!stats) return;
  const totals = dashboardTotals(rows);
  const cards = [
    {
      label: "Karyawan",
      value: fmtNumber(totals.employees, 0),
      note: `${totals.assessed} sudah memiliki penilaian`,
      tone: "maroon"
    },
    {
      label: "Rata-rata Skor Harian",
      value: totals.averageDaily === null ? "-" : fmtNumber(totals.averageDaily),
      note: "Skala 0–100",
      tone: scoreTone(totals.averageDaily)
    },
    {
      label: "Catatan Disiplin",
      value: fmtNumber(totals.discipline, 0),
      note: "SP, pemanggilan, kasus HR",
      tone: totals.discipline ? "amber" : "slate"
    },
    {
      label: "Kasus Terbuka",
      value: fmtNumber(totals.openCases, 0),
      note: "Belum selesai / dibatalkan",
      tone: totals.openCases ? "red" : "green"
    },
    {
      label: "Catatan Lainnya",
      value: fmtNumber(totals.notes, 0),
      note: "Penilaian, review, PIP, kontrak",
      tone: "blue"
    }
  ];

  stats.innerHTML = cards.map(card => `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">${escapeHtml(card.label)}</p>
      <p class="mt-1 text-2xl font-black text-slate-800">${escapeHtml(card.value)}</p>
      <span class="mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClasses(card.tone)}">${escapeHtml(card.note)}</span>
    </div>`).join("");
}

function renderSummary(container, rows) {
  const holder = container.querySelector("#dk-summary-table");
  const counter = container.querySelector("#dk-summary-count");
  if (counter) counter.textContent = `${rows.length} karyawan`;

  if (!holder) return;
  if (!rows.length) {
    holder.innerHTML = emptyState("Tidak ada karyawan pada filter ini.", "Ubah periode, cabang, divisi, atau kata kunci pencarian.");
    return;
  }

  const body = rows.map(row => {
    const summary = row.summary;
    const key = employeeKey(row.employee);
    const dailyScore = summary.dailyAverage;
    const reviewScore = summary.reviewLatestScore;
    const monthly = summary.monthlyOverall;
    const disciplineTone = summary.disciplineCount ? "amber" : "slate";
    return `
      <tr class="hover:bg-maroon-50/40 transition cursor-pointer" data-dk-open="${escapeHtml(key)}">
        <td class="px-3 py-3">
          <div class="flex items-center gap-2.5">
            ${avatar(employeeName(row.employee), "w-8 h-8")}
            <div class="min-w-0">
              <p class="font-bold text-slate-800 truncate">${escapeHtml(employeeName(row.employee))}</p>
              <p class="text-[10px] text-slate-400 truncate">${escapeHtml(row.identity.nik)} · ${escapeHtml(row.identity.jabatan)}</p>
            </div>
          </div>
        </td>
        <td class="px-3 py-3">
          <p class="font-semibold text-slate-600">${escapeHtml(row.identity.cabang)}</p>
          <p class="text-[10px] text-slate-400">${escapeHtml(row.identity.divisi)}</p>
        </td>
        <td class="px-3 py-3 text-center">
          ${dailyScore === null ? '<span class="text-slate-300">-</span>' : pill(fmtNumber(dailyScore), scoreTone(dailyScore))}
          <p class="mt-1 text-[10px] text-slate-400">${fmtNumber(summary.dailyCount, 0)} penilaian</p>
        </td>
        <td class="px-3 py-3 text-center">
          ${reviewScore === null ? '<span class="text-slate-300">-</span>' : pill(`${fmtNumber(reviewScore)}${summary.reviewLatestGrade ? ` · ${summary.reviewLatestGrade}` : ""}`, scoreTone(reviewScore))}
          <p class="mt-1 text-[10px] text-slate-400">${escapeHtml(summary.reviewLatestPeriod || "-")}</p>
        </td>
        <td class="px-3 py-3 text-center">
          ${monthly === null ? '<span class="text-slate-300">-</span>' : `
            <div class="flex items-center justify-center gap-1.5">
              <div class="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full ${barColor(scoreTone(monthly))}" style="width:${Math.max(0, Math.min(100, Number(monthly)))}%"></div>
              </div>
              <span class="text-[11px] font-bold text-slate-700">${fmtNumber(monthly)}%</span>
            </div>`}
          <p class="mt-1 text-[10px] text-slate-400">${escapeHtml(summary.monthlyPeriod || row.periodLabel)}</p>
        </td>
        <td class="px-3 py-3 text-center">
          ${pill(`${summary.disciplineCount} catatan`, disciplineTone)}
          <p class="mt-1 text-[10px] text-slate-400">SP ${fmtNumber(summary.spCount, 0)} · Kasus ${fmtNumber(summary.caseCount, 0)}</p>
        </td>
        <td class="px-3 py-3 text-center">
          ${pill(`${summary.noteCount} catatan`, summary.noteCount ? "blue" : "slate")}
          ${summary.openCaseCount ? `<p class="mt-1 text-[10px] font-bold text-rose-600">${summary.openCaseCount} kasus terbuka</p>` : `<p class="mt-1 text-[10px] text-slate-400">Tidak ada kasus terbuka</p>`}
        </td>
        <td class="px-3 py-3 text-right">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold text-maroon-700">Detail
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </span>
        </td>
      </tr>`;
  }).join("");

  holder.innerHTML = `
    <table class="w-full min-w-[1040px] text-[11px]">
      <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-3 py-3 text-left font-black">Karyawan</th>
          <th class="px-3 py-3 text-left font-black">Cabang / Divisi</th>
          <th class="px-3 py-3 text-center font-black">Skor Harian</th>
          <th class="px-3 py-3 text-center font-black">Review Kinerja</th>
          <th class="px-3 py-3 text-center font-black">Target Bulanan</th>
          <th class="px-3 py-3 text-center font-black">Disiplin</th>
          <th class="px-3 py-3 text-center font-black">Catatan</th>
          <th class="px-3 py-3"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">${body}</tbody>
    </table>`;
}

function renderEmployeeSelect(container, rows) {
  const select = container.querySelector("#dk-employee");
  if (!select) return;
  if (!rows.length) {
    select.innerHTML = `<option value="">Tidak ada karyawan</option>`;
    state.selectedKey = "";
    return;
  }
  if (!rows.some(row => employeeKey(row.employee) === state.selectedKey)) {
    state.selectedKey = employeeKey(rows[0].employee);
  }
  select.innerHTML = rows.map(row => {
    const key = employeeKey(row.employee);
    return `<option value="${escapeHtml(key)}" ${key === state.selectedKey ? "selected" : ""}>${escapeHtml(employeeName(row.employee))} · ${escapeHtml(row.identity.nik)} · ${escapeHtml(row.identity.jabatan)}</option>`;
  }).join("");
}

function renderDetail(container, rows) {
  const holder = container.querySelector("#dk-detail-content");
  if (!holder) return;
  const row = rows.find(item => employeeKey(item.employee) === state.selectedKey) || rows[0] || null;
  if (!row) {
    holder.innerHTML = emptyState("Pilih karyawan untuk melihat detail.", "Belum ada karyawan pada filter ini.");
    return;
  }
  state.selectedKey = employeeKey(row.employee);
  const summary = row.summary;

  const kpiCards = [
    {
      label: "Skor Harian",
      value: summary.dailyAverage === null ? "-" : fmtNumber(summary.dailyAverage),
      note: `${fmtNumber(summary.dailyCount, 0)} penilaian · terbaru ${summary.latestDailyScore === null ? "-" : fmtNumber(summary.latestDailyScore)}`,
      tone: scoreTone(summary.dailyAverage)
    },
    {
      label: "Review Kinerja",
      value: summary.reviewLatestScore === null ? "-" : fmtNumber(summary.reviewLatestScore),
      note: summary.reviewLatestScore === null ? "Belum ada review" : `${summary.reviewLatestGrade || "-"} · ${summary.reviewLatestPeriod || "-"}`,
      tone: scoreTone(summary.reviewLatestScore)
    },
    {
      label: "Penilaian KPI / 360",
      value: summary.kpiLatestScore === null ? "-" : fmtNumber(summary.kpiLatestScore),
      note: summary.kpiLatestScore === null ? "Belum ada penilaian" : `${fmtNumber(summary.kpiCount, 0)} catatan · ${fmtNumber(summary.kpiTaskCount, 0)} tugas · ${summary.kpiLatestPeriod || "-"}`,
      tone: scoreTone(summary.kpiLatestScore)
    },
    {
      label: "Capaian Target",
      value: summary.monthlyOverall === null ? "-" : `${fmtNumber(summary.monthlyOverall)}%`,
      note: summary.monthlyPeriod ? `Periode ${periodLabel(summary.monthlyPeriod)}` : "Target belum diisi",
      tone: scoreTone(summary.monthlyOverall)
    },
    {
      label: "Catatan Disiplin",
      value: fmtNumber(summary.disciplineCount, 0),
      note: `SP ${fmtNumber(summary.spCount, 0)} · Panggilan ${fmtNumber(summary.callCount, 0)} · Kasus ${fmtNumber(summary.caseCount, 0)}`,
      tone: summary.disciplineCount ? "amber" : "green"
    }
  ];

  const identityPills = [
    row.identity.status !== "-" ? pill(row.identity.status, "maroon") : "",
    row.identity.cabang !== "-" ? pill(row.identity.cabang, "slate") : "",
    row.identity.divisi !== "-" ? pill(row.identity.divisi, "slate") : "",
    row.identity.jabatan !== "-" ? pill(row.identity.jabatan, "blue") : "",
    pill(periodLabel(row.period), "green")
  ].filter(Boolean).join("");

  holder.innerHTML = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-red-100 bg-gradient-to-br from-white via-white to-red-50/50 p-4 md:p-5 shadow-xs">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-center gap-3">
            ${avatar(employeeName(row.employee), "w-12 h-12")}
            <div>
              <h2 class="text-lg md:text-xl font-black text-slate-800">${escapeHtml(employeeName(row.employee))}</h2>
              <p class="text-[11px] font-semibold text-slate-500">NIK ${escapeHtml(row.identity.nik)}${row.identity.atasan ? ` · Atasan: ${escapeHtml(row.identity.atasan)}` : ""}</p>
              <div class="mt-1.5 flex flex-wrap gap-1.5">${identityPills}</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5">
            ${pill(`${summary.dailyCount} penilaian harian`, "blue")}
            ${pill(`${summary.noteCount} catatan lainnya`, "slate")}
            ${summary.openCaseCount ? pill(`${summary.openCaseCount} kasus terbuka`, "red") : pill("Tidak ada kasus terbuka", "green")}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 xl:grid-cols-5 gap-3">
        ${kpiCards.map(card => `
          <div class="rounded-2xl border ${card.tone === "red" ? "border-rose-200" : card.tone === "amber" ? "border-amber-200" : "border-slate-200"} bg-white p-3.5 shadow-xs">
            <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">${escapeHtml(card.label)}</p>
            <p class="mt-1 text-xl font-black text-slate-800">${escapeHtml(card.value)}</p>
            <p class="mt-1 text-[10px] font-semibold text-slate-400 leading-snug">${escapeHtml(card.note)}</p>
          </div>`).join("")}
      </div>

      ${renderMonthlySection(row)}
      ${renderDailyTrend(row)}
      ${renderDisciplineSection(row)}
      ${renderNotesSection(row)}
    </div>`;
}

function renderMonthlySection(row) {
  if (!row.target || !row.metrics.length) {
    return `
      <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
        <h3 class="text-sm font-black text-slate-800">Target & Realisasi Bulanan</h3>
        <p class="mt-1 text-xs text-slate-400">Belum ada target bulanan pada periode ${escapeHtml(row.periodLabel)}.</p>
      </section>`;
  }

  const metricRows = row.metrics.map(metric => `
    <tr class="border-t border-slate-100">
      <td class="px-3 py-2.5">
        <p class="font-semibold text-slate-700">${escapeHtml(metric.label)}${metric.derived ? ' <span class="text-[9px] font-black text-maroon-700">(otomatis)</span>' : ""}</p>
        ${metric.lowerIsBetter ? '<p class="text-[9px] text-slate-400">Semakin rendah semakin baik</p>' : ""}
      </td>
      <td class="px-3 py-2.5 text-right font-semibold text-slate-600">${escapeHtml(fmtMetric(metric.target, metric.unit))}</td>
      <td class="px-3 py-2.5 text-right font-semibold text-slate-600">${escapeHtml(fmtMetric(metric.actual, metric.unit))}</td>
      <td class="px-3 py-2.5">
        ${metric.attainment === null ? '<span class="text-slate-300">-</span>' : `
          <div class="flex items-center gap-2">
            <div class="h-1.5 flex-1 min-w-12 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full ${barColor(scoreTone(metric.attainment))}" style="width:${Math.max(0, Math.min(100, Number(metric.attainment)))}%"></div>
            </div>
            <span class="w-12 text-right text-[11px] font-bold text-slate-700">${fmtNumber(metric.attainment)}%</span>
          </div>`}
      </td>
    </tr>`).join("");

  return `
    <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-4 border-b border-slate-100">
        <div>
          <h3 class="text-sm font-black text-slate-800">Target & Realisasi Bulanan</h3>
          <p class="text-[11px] text-slate-400">${escapeHtml(periodLabel(row.target.periode || row.period))} · ${escapeHtml(row.target.kategori || "-")}</p>
        </div>
        <div class="flex items-center gap-2">
          ${pill(`Capaian rata-rata ${row.overallAttainment === null ? "-" : `${fmtNumber(row.overallAttainment)}%`}`, scoreTone(row.overallAttainment))}
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-[11px]">
          <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-3 py-2.5 text-left font-black">Indikator</th>
              <th class="px-3 py-2.5 text-right font-black">Target</th>
              <th class="px-3 py-2.5 text-right font-black">Realisasi</th>
              <th class="px-3 py-2.5 text-left font-black">Capaian</th>
            </tr>
          </thead>
          <tbody>${metricRows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderDailyTrend(row) {
  const trend = row.dailyTrend;
  if (!trend.length) return "";
  return `
    <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-800">Tren Skor Penilaian Harian</h3>
          <p class="text-[11px] text-slate-400">${trend.length} penilaian terakhir pada periode ini.</p>
        </div>
        ${pill(`Rata-rata ${fmtNumber(row.summary.dailyAverage)}`, scoreTone(row.summary.dailyAverage))}
      </div>
      <div class="mt-3 space-y-1.5">
        ${trend.map(item => `
          <div class="flex items-center gap-2">
            <span class="w-24 shrink-0 text-[10px] font-semibold text-slate-500">${escapeHtml(item.date)}</span>
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full ${barColor(scoreTone(item.score))}" style="width:${Math.max(0, Math.min(100, item.score))}%"></div>
            </div>
            <span class="w-10 shrink-0 text-right text-[11px] font-bold text-slate-700">${fmtNumber(item.score)}</span>
            <span class="w-20 shrink-0 text-right text-[9px] font-semibold text-slate-400">${escapeHtml(item.predikat || "")}</span>
          </div>`).join("")}
      </div>
    </section>`;
}

function timelineEntry(entry) {
  const tone = entry.severity === "high" ? "red" : entry.severity === "medium" ? "amber" : "slate";
  const dot = entry.severity === "high" ? "bg-rose-500" : entry.severity === "medium" ? "bg-amber-500" : "bg-slate-300";
  return `
    <div class="relative border-l border-slate-200 pl-4 pb-4 last:pb-0">
      <span class="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${dot}"></span>
      <div class="flex flex-wrap items-center gap-1.5">
        ${pill(entry.kind, tone)}
        ${entry.date ? `<span class="text-[10px] font-semibold text-slate-400">${escapeHtml(fmtDate(entry.date))}</span>` : ""}
        ${entry.status ? `<span class="text-[10px] font-semibold text-slate-500">${escapeHtml(entry.status)}</span>` : ""}
      </div>
      <p class="mt-1 text-xs font-bold text-slate-800">${escapeHtml(entry.title)}</p>
      ${entry.subtitle ? `<p class="text-[10px] font-semibold text-slate-500">${escapeHtml(entry.subtitle)}</p>` : ""}
      ${entry.detail ? `<p class="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-600">${escapeHtml(entry.detail)}</p>` : ""}
    </div>`;
}

function renderDisciplineSection(row) {
  const entries = row.discipline;
  return `
    <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-800">Catatan Kedisiplinan</h3>
          <p class="text-[11px] text-slate-400">SP, konseling, surat panggilan, dan kasus HR pada ${escapeHtml(row.periodLabel)}.</p>
        </div>
        <div class="flex gap-1.5">
          ${pill(`${row.summary.disciplineCount} catatan`, row.summary.disciplineCount ? "amber" : "green")}
          ${row.summary.openCaseCount ? pill(`${row.summary.openCaseCount} kasus terbuka`, "red") : ""}
        </div>
      </div>
      <div class="mt-4">
        ${entries.length ? entries.map(timelineEntry).join("") : '<p class="text-xs text-slate-400">Tidak ada catatan kedisiplinan pada periode ini.</p>'}
      </div>
    </section>`;
}

function renderNotesSection(row) {
  const entries = row.notes;
  const limit = Math.max(1, Number(state.notesLimit) || 40);
  const visible = entries.slice(0, limit);
  const remaining = entries.length - visible.length;
  return `
    <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-800">Catatan Lainnya</h3>
          <p class="text-[11px] text-slate-400">Penilaian harian, review kinerja, KPI/360, evaluasi kontrak, dan PIP.</p>
        </div>
        ${pill(`${entries.length} catatan`, entries.length ? "blue" : "green")}
      </div>
      <div class="mt-4">
        ${visible.length ? visible.map(timelineEntry).join("") : '<p class="text-xs text-slate-400">Tidak ada catatan lain pada periode ini.</p>'}
      </div>
      ${remaining > 0 ? `<button type="button" data-dk-more-notes class="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer">Tampilkan ${remaining} catatan lagi</button>` : ""}
    </section>`;
}

// =========================================================================
// EXPORT (PDF / EXCEL)
// =========================================================================
function currentDetailRow(rows) {
  return rows.find(item => employeeKey(item.employee) === state.selectedKey) || rows[0] || null;
}

async function exportPdf(container, mode) {
  const rows = getVisibleRows();
  let html = "";
  let filename = "";
  let orientation = "portrait";

  if (mode === "detail") {
    const row = currentDetailRow(rows);
    if (!row) return toast("Pilih karyawan terlebih dahulu.", "warning");
    html = buildEmployeeReportHtml(row);
    filename = `Laporan_Karyawan_${sanitizeFilename(employeeName(row.employee))}_${sanitizeFilename(row.periodLabel)}.pdf`;
  } else {
    if (!rows.length) return toast("Tidak ada karyawan untuk dicetak.", "warning");
    html = buildSummaryReportHtml(rows);
    filename = `Rekap_Pencapaian_Karyawan_${sanitizeFilename(periodLabel(state.period))}.pdf`;
    orientation = "landscape";
  }

  try {
    toast("Menyiapkan PDF laporan...", "info");
    await downloadHtmlAsPdf(html, filename, orientation);
    toast("PDF laporan berhasil diunduh.", "success");
  } catch (error) {
    console.error("export dashboard PDF", error);
    toast("Gagal membuat PDF: " + (error?.message || error), "error");
  }
}

async function exportExcel(container, mode) {
  const rows = getVisibleRows();
  if (mode === "detail") {
    const row = currentDetailRow(rows);
    if (!row) return toast("Pilih karyawan terlebih dahulu.", "warning");
    const aoa = buildEmployeeExcelAoa(row);
    await downloadXlsx(
      `Laporan_Karyawan_${sanitizeFilename(employeeName(row.employee))}_${sanitizeFilename(row.periodLabel)}.xlsx`,
      aoa,
      "Laporan Karyawan"
    ).catch(error => {
      console.error("export dashboard Excel", error);
      toast("Gagal membuat Excel: " + (error?.message || error), "error");
    });
    return;
  }

  if (!rows.length) return toast("Tidak ada karyawan untuk diekspor.", "warning");
  const headers = [
    "NIK", "Nama Karyawan", "Jabatan", "Cabang", "Divisi", "Status Karyawan",
    "Skor Harian Rata-rata", "Jumlah Penilaian Harian", "Skor Review Terbaru", "Grade Review",
    "Periode Review", "Skor KPI/360 Terbaru", "Jumlah Tugas KPI 360", "Capaian Target Bulanan (%)", "Periode Target",
    "Jumlah SP/Konseling", "Jumlah Pemanggilan", "Jumlah Kasus HR", "Kasus Terbuka",
    "Jumlah Catatan Lainnya", "Jumlah Program PIP", "Periode Laporan"
  ];
  const data = rows.map(row => {
    const summary = row.summary;
    return [
      row.identity.nik, employeeName(row.employee), row.identity.jabatan, row.identity.cabang,
      row.identity.divisi, row.identity.status,
      summary.dailyAverage ?? "", summary.dailyCount,
      summary.reviewLatestScore ?? "", summary.reviewLatestGrade,
      summary.reviewLatestPeriod, summary.kpiLatestScore ?? "",
      summary.kpiTaskCount,
      summary.monthlyOverall ?? "", summary.monthlyPeriod || "",
      summary.spCount, summary.callCount, summary.caseCount, summary.openCaseCount,
      summary.noteCount, summary.pipCount, periodLabel(row.period)
    ];
  });
  await downloadXlsx(
    `Rekap_Pencapaian_Karyawan_${sanitizeFilename(periodLabel(state.period))}.xlsx`,
    headers,
    data,
    "Rekap Karyawan"
  ).catch(error => {
    console.error("export dashboard Excel", error);
    toast("Gagal membuat Excel: " + (error?.message || error), "error");
  });
}

function reportTable(headers, bodyRows, widths = []) {
  const colgroup = widths.length
    ? `<colgroup>${widths.map(width => `<col style="width:${width}" />`).join("")}</colgroup>`
    : "";
  return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt;margin:0 0 10px 0;">
      ${colgroup}
      <thead>
        <tr style="background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
          ${headers.map(header => `<th style="border:1px solid #94a3b8;padding:4px 5px;text-align:left;font-size:8pt;font-weight:700;">${escapeHtml(header)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${bodyRows.map(cells => `<tr>${cells.map(cell => `<td style="border:1px solid #cbd5e1;padding:3.5px 5px;vertical-align:top;word-break:break-word;">${cell}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>`;
}

function reportSection(title, bodyHtml) {
  return `
    <div style="margin:0 0 12px 0;">
      <h2 style="margin:0 0 5px 0;padding:4px 6px;background:#f8fafc;border:1px solid #cbd5e1;font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(title)}</h2>
      ${bodyHtml}
    </div>`;
}

function buildSummaryReportHtml(rows) {
  const totals = dashboardTotals(rows);
  const body = rows.map((row, index) => {
    const summary = row.summary;
    return [
      String(index + 1),
      escapeHtml(row.identity.nik),
      `<strong>${escapeHtml(employeeName(row.employee))}</strong>`,
      escapeHtml(row.identity.jabatan),
      escapeHtml(row.identity.cabang),
      escapeHtml(row.identity.divisi),
      summary.dailyAverage === null ? "-" : escapeHtml(fmtNumber(summary.dailyAverage)),
      summary.reviewLatestScore === null ? "-" : escapeHtml(`${fmtNumber(summary.reviewLatestScore)}${summary.reviewLatestGrade ? ` (${summary.reviewLatestGrade})` : ""}`),
      summary.monthlyOverall === null ? "-" : `${escapeHtml(fmtNumber(summary.monthlyOverall))}%`,
      escapeHtml(String(summary.disciplineCount)),
      escapeHtml(String(summary.openCaseCount)),
      escapeHtml(String(summary.noteCount))
    ];
  });

  const content = `
    <div class="aj-doc">
      ${letterheadHtml()}
      <div class="aj-title">
        <h1>Laporan Rekap Pencapaian & Catatan Karyawan</h1>
        <div class="aj-number">Periode: ${escapeHtml(periodLabel(state.period))}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt;margin:0 0 12px 0;">
        <tr>
          <td style="padding:2px 0;width:32%;"><strong>Jumlah karyawan</strong></td><td style="padding:2px 0;">: ${escapeHtml(String(totals.employees))} orang</td>
          <td style="padding:2px 0;width:24%;"><strong>Sudah dinilai</strong></td><td style="padding:2px 0;">: ${escapeHtml(String(totals.assessed))} orang</td>
        </tr>
        <tr>
          <td style="padding:2px 0;"><strong>Rata-rata skor harian</strong></td><td style="padding:2px 0;">: ${totals.averageDaily === null ? "-" : escapeHtml(fmtNumber(totals.averageDaily))}</td>
          <td style="padding:2px 0;"><strong>Catatan disiplin</strong></td><td style="padding:2px 0;">: ${escapeHtml(String(totals.discipline))} catatan</td>
        </tr>
        <tr>
          <td style="padding:2px 0;"><strong>Kasus terbuka</strong></td><td style="padding:2px 0;">: ${escapeHtml(String(totals.openCases))} kasus</td>
          <td style="padding:2px 0;"><strong>Catatan lainnya</strong></td><td style="padding:2px 0;">: ${escapeHtml(String(totals.notes))} catatan</td>
        </tr>
      </table>
      ${reportTable(
        ["No", "NIK", "Nama Karyawan", "Jabatan", "Cabang", "Divisi", "Skor Harian", "Review", "Target", "Disiplin", "Kasus Terbuka", "Catatan"],
        body,
        ["4%", "9%", "15%", "13%", "9%", "11%", "7%", "8%", "6%", "5%", "6%", "7%"]
      )}
      <p style="margin:8px 0 0 0;font-size:7.5pt;color:#475569;text-align:left;">Dicetak dari HRIS CV Andela Jaya pada ${escapeHtml(new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }))}. Catatan lama tanpa NIK dicocokkan berdasarkan nama; verifikasi manual bila diperlukan.</p>
    </div>`;
  return officialPrintHtml({ title: `Rekap Pencapaian Karyawan ${periodLabel(state.period)}`, contentHtml: content });
}

function buildEmployeeReportHtml(row) {
  const summary = row.summary;
  const identityRows = [
    ["Nama Karyawan", employeeName(row.employee)],
    ["NIK", row.identity.nik],
    ["Jabatan", row.identity.jabatan],
    ["Cabang", row.identity.cabang],
    ["Divisi", row.identity.divisi],
    ["Status Karyawan", row.identity.status],
    ["Atasan Langsung", row.identity.atasan || "-"],
    ["Periode Laporan", periodLabel(row.period)]
  ];
  const identityHtml = identityRows.map(([label, value]) => `
    <tr>
      <td style="border:1px solid #cbd5e1;padding:3px 6px;background:#f8fafc;font-weight:700;width:18%;">${escapeHtml(label)}</td>
      <td style="border:1px solid #cbd5e1;padding:3px 6px;width:32%;">${escapeHtml(value)}</td>
    </tr>`).join("");

  const summaryHtml = reportTable(
    ["Indikator Pencapaian", "Nilai"],
    [
      ["Skor penilaian harian rata-rata", summary.dailyAverage === null ? "-" : escapeHtml(fmtNumber(summary.dailyAverage))],
      ["Jumlah penilaian harian", escapeHtml(String(summary.dailyCount))],
      ["Skor review kinerja terbaru", summary.reviewLatestScore === null ? "-" : escapeHtml(`${fmtNumber(summary.reviewLatestScore)}${summary.reviewLatestGrade ? ` (${summary.reviewLatestGrade})` : ""}`)],
      ["Skor KPI / 360 terbaru", summary.kpiLatestScore === null ? "-" : escapeHtml(fmtNumber(summary.kpiLatestScore))],
      ["Jumlah tugas KPI 360", escapeHtml(String(summary.kpiTaskCount))],
      ["Capaian target bulanan", summary.monthlyOverall === null ? "-" : escapeHtml(`${fmtNumber(summary.monthlyOverall)}%`)],
      ["Catatan kedisiplinan", escapeHtml(`${summary.disciplineCount} catatan (SP ${summary.spCount}, panggilan ${summary.callCount}, kasus ${summary.caseCount})`)],
      ["Kasus HR terbuka", escapeHtml(String(summary.openCaseCount))],
      ["Catatan lainnya", escapeHtml(String(summary.noteCount))]
    ],
    ["58%", "42%"]
  );

  const metricHtml = row.metrics.length
    ? reportTable(
      ["Indikator", "Target", "Realisasi", "Capaian"],
      row.metrics.map(metric => [
        escapeHtml(metric.label),
        escapeHtml(fmtMetric(metric.target, metric.unit)),
        escapeHtml(fmtMetric(metric.actual, metric.unit)),
        metric.attainment === null ? "-" : `${escapeHtml(fmtNumber(metric.attainment))}%`
      ]),
      ["34%", "22%", "22%", "22%"]
    ) + `<p style="margin:-4px 0 8px 0;font-size:8pt;">Periode target: <strong>${escapeHtml(periodLabel(row.target?.periode || row.period))}</strong> · Kategori: <strong>${escapeHtml(row.target?.kategori || "-")}</strong></p>`
    : `<p style="margin:0 0 8px 0;font-size:9pt;">Belum ada target bulanan pada periode ini.</p>`;

  const disciplineHtml = row.discipline.length
    ? reportTable(
      ["Tanggal", "Jenis", "Uraian", "Status"],
      row.discipline.map(entry => [
        escapeHtml(entry.date || "-"),
        escapeHtml(entry.kind),
        `<strong>${escapeHtml(entry.title)}</strong>${entry.subtitle ? `<br/><span style="font-size:8pt;color:#475569;">${escapeHtml(entry.subtitle)}</span>` : ""}${entry.detail ? `<br/><span style="font-size:8pt;">${escapeMultiline(entry.detail)}</span>` : ""}`,
        escapeHtml(entry.status || "-")
      ]),
      ["13%", "14%", "55%", "18%"]
    )
    : `<p style="margin:0 0 8px 0;font-size:9pt;">Tidak ada catatan kedisiplinan pada periode ini.</p>`;

  const notesHtml = row.notes.length
    ? reportTable(
      ["Tanggal", "Jenis", "Catatan", "Status"],
      row.notes.map(entry => [
        escapeHtml(entry.date || "-"),
        escapeHtml(entry.kind),
        `<strong>${escapeHtml(entry.title)}</strong>${entry.subtitle ? `<br/><span style="font-size:8pt;color:#475569;">${escapeHtml(entry.subtitle)}</span>` : ""}${entry.detail ? `<br/><span style="font-size:8pt;">${escapeMultiline(entry.detail)}</span>` : ""}`,
        escapeHtml(entry.status || "-")
      ]),
      ["13%", "16%", "53%", "18%"]
    )
    : `<p style="margin:0 0 8px 0;font-size:9pt;">Tidak ada catatan lain pada periode ini.</p>`;

  const content = `
    <div class="aj-doc">
      ${letterheadHtml()}
      <div class="aj-title">
        <h1>Laporan Pencapaian & Catatan Karyawan</h1>
        <div class="aj-number">Periode: ${escapeHtml(periodLabel(row.period))}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt;margin:0 0 12px 0;">
        ${identityHtml}
      </table>
      ${reportSection("Ringkasan Pencapaian", summaryHtml)}
      ${reportSection("Target & Realisasi Bulanan", metricHtml)}
      ${reportSection("Catatan Kedisiplinan", disciplineHtml)}
      ${reportSection("Catatan Lainnya", notesHtml)}
      <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:9pt;page-break-inside:avoid;">
        <tr>
          <td style="width:50%;text-align:center;vertical-align:top;">
            <p style="margin:0 0 2px 0;">Dibuat oleh,</p>
            <p style="margin:0 0 2px 0;font-weight:700;">HRD</p>
            <div style="height:58px;"></div>
            <p style="margin:0;font-weight:700;text-decoration:underline;">${escapeHtml(state.session?.nama || "____________________")}</p>
          </td>
          <td style="width:50%;text-align:center;vertical-align:top;">
            <p style="margin:0 0 2px 0;">Diketahui oleh,</p>
            <p style="margin:0 0 2px 0;font-weight:700;">Manajemen</p>
            <div style="height:58px;"></div>
            <p style="margin:0;font-weight:700;text-decoration:underline;">____________________</p>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0 0;font-size:7.5pt;color:#475569;text-align:left;">Dicetak dari HRIS CV Andela Jaya pada ${escapeHtml(new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }))}. Catatan lama tanpa NIK dicocokkan berdasarkan nama; verifikasi manual bila diperlukan.</p>
    </div>`;
  return officialPrintHtml({ title: `Laporan ${employeeName(row.employee)} ${periodLabel(row.period)}`, contentHtml: content });
}

function buildEmployeeExcelAoa(row) {
  const summary = row.summary;
  const aoa = [
    ["LAPORAN PENCAPAIAN & CATATAN KARYAWAN"],
    ["Nama Karyawan", employeeName(row.employee), "NIK", row.identity.nik],
    ["Jabatan", row.identity.jabatan, "Cabang", row.identity.cabang],
    ["Divisi", row.identity.divisi, "Status Karyawan", row.identity.status],
    ["Atasan Langsung", row.identity.atasan || "-", "Periode Laporan", periodLabel(row.period)],
    [],
    ["RINGKASAN PENCAPAIAN"],
    ["Metrik", "Nilai"],
    ["Skor Harian Rata-rata", summary.dailyAverage ?? "-"],
    ["Jumlah Penilaian Harian", summary.dailyCount],
    ["Skor Review Kinerja Terbaru", summary.reviewLatestScore ?? "-"],
    ["Grade Review", summary.reviewLatestGrade || "-"],
    ["Skor KPI / 360 Terbaru", summary.kpiLatestScore ?? "-"],
    ["Jumlah Tugas KPI 360", summary.kpiTaskCount],
    ["Capaian Target Bulanan (%)", summary.monthlyOverall ?? "-"],
    ["Jumlah Catatan Disiplin", summary.disciplineCount],
    ["Jumlah SP / Konseling", summary.spCount],
    ["Jumlah Pemanggilan", summary.callCount],
    ["Jumlah Kasus HR", summary.caseCount],
    ["Kasus HR Terbuka", summary.openCaseCount],
    ["Jumlah Catatan Lainnya", summary.noteCount],
    [],
    ["TARGET & REALISASI BULANAN", periodLabel(row.target?.periode || row.period), row.target?.kategori || "-"],
    ["Indikator", "Target", "Realisasi", "Capaian (%)"]
  ];
  row.metrics.forEach(metric => {
    aoa.push([metric.label, metric.target ?? "-", metric.actual ?? "-", metric.attainment ?? "-"]);
  });
  aoa.push([], ["CATATAN KEDISIPLINAN"], ["Tanggal", "Jenis", "Uraian", "Status"]);
  row.discipline.forEach(entry => {
    aoa.push([
      entry.date || "-", entry.kind,
      [entry.title, entry.subtitle, entry.detail].filter(Boolean).join(" | "),
      entry.status || "-"
    ]);
  });
  aoa.push([], ["CATATAN LAINNYA"], ["Tanggal", "Jenis", "Catatan", "Status"]);
  row.notes.forEach(entry => {
    aoa.push([
      entry.date || "-", entry.kind,
      [entry.title, entry.subtitle, entry.detail].filter(Boolean).join(" | "),
      entry.status || "-"
    ]);
  });
  return aoa;
}
