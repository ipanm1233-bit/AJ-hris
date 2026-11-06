import { COL } from "../firebase-config.js";
import {
  fsGetAll, escapeHtml, toast, downloadXlsx, downloadHtmlAsPdf, fmtDateShort
} from "../utils.js";
import { emptyState, icon, skeletonRows } from "../components.js";
import { letterheadHtml, officialPrintHtml } from "../branding.js";
import {
  EMPLOYEE_ACTIVE, EMPLOYEE_INACTIVE, UNKNOWN_LABEL,
  buildMasterEmployeeDashboard, filterMasterEmployees, masterEmployeeFilterOptions,
  employeeDisplayName, employeeNik, employeeBranchName, employeeDivisionName,
  employeeEmploymentStatus, employeeActiveStatus
} from "../master-employee-dashboard.mjs";

const state = {
  employees: [],
  filters: { branch: "", division: "", active: "", employment: "", search: "" },
  loaded: false,
  loading: false
};

export async function mountMasterEmployeeDashboard(panel) {
  state.employees = [];
  state.filters = { branch: "", division: "", active: "", employment: "", search: "" };
  state.loaded = false;
  state.loading = false;
  panel.innerHTML = shellHtml();
  bindShell(panel);
  await loadEmployees(panel);
  return {
    reload: () => loadEmployees(panel, true)
  };
}

function shellHtml() {
  return `
    <div class="space-y-5">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-maroon-50 text-maroon-700 flex items-center justify-center shadow-inner">
              ${icon("database", "w-5 h-5")}
            </div>
            <div>
              <h2 class="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Dashboard Data Karyawan</h2>
              <p class="text-xs md:text-sm text-slate-500 font-medium">Komposisi karyawan, sebaran cabang & divisi, kontrak, dan kelengkapan data master.</p>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" id="mdd-refresh" class="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition inline-flex items-center gap-1.5 cursor-pointer">
            ${icon("refresh", "w-4 h-4")} Refresh
          </button>
          <button type="button" id="mdd-export-excel" class="px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition inline-flex items-center gap-1.5 cursor-pointer">
            ${icon("download", "w-4 h-4")} Export Excel
          </button>
          <button type="button" id="mdd-export-pdf" class="px-3 py-2.5 rounded-xl bg-maroon-700 text-white text-[11px] font-bold hover:bg-maroon-800 transition inline-flex items-center gap-1.5 cursor-pointer">
            ${icon("book", "w-4 h-4")} Cetak / PDF
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
        <div class="flex flex-col xl:flex-row xl:items-end gap-3">
          <label class="block w-full xl:w-48">
            <span class="text-[10px] font-black uppercase tracking-wide text-slate-400">Cabang</span>
            <select id="mdd-branch" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-maroon-400">
              <option value="">Semua Cabang</option>
            </select>
          </label>
          <label class="block w-full xl:w-48">
            <span class="text-[10px] font-black uppercase tracking-wide text-slate-400">Divisi</span>
            <select id="mdd-division" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-maroon-400">
              <option value="">Semua Divisi</option>
            </select>
          </label>
          <label class="block w-full xl:w-40">
            <span class="text-[10px] font-black uppercase tracking-wide text-slate-400">Keaktifan</span>
            <select id="mdd-active" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-maroon-400">
              <option value="">Semua Status</option>
              <option value="${EMPLOYEE_ACTIVE}">Aktif</option>
              <option value="${EMPLOYEE_INACTIVE}">Tidak Aktif</option>
            </select>
          </label>
          <label class="block w-full xl:w-52">
            <span class="text-[10px] font-black uppercase tracking-wide text-slate-400">Status Hubungan Kerja</span>
            <select id="mdd-employment" class="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-maroon-400">
              <option value="">Semua Status</option>
            </select>
          </label>
          <label class="block w-full xl:flex-1">
            <span class="text-[10px] font-black uppercase tracking-wide text-slate-400">Cari Karyawan</span>
            <input id="mdd-search" type="search" placeholder="Nama, NIK, jabatan, email, HP..." class="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-maroon-400" />
          </label>
          <button type="button" id="mdd-reset" class="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Reset</button>
        </div>
        <p id="mdd-filter-info" class="mt-3 text-[11px] text-slate-400 font-medium"></p>
      </div>

      <div id="mdd-content" class="space-y-5"></div>
    </div>`;
}

function bindShell(panel) {
  panel.querySelector("#mdd-branch")?.addEventListener("change", event => {
    state.filters.branch = event.target.value;
    renderContent(panel);
  });
  panel.querySelector("#mdd-division")?.addEventListener("change", event => {
    state.filters.division = event.target.value;
    renderContent(panel);
  });
  panel.querySelector("#mdd-active")?.addEventListener("change", event => {
    state.filters.active = event.target.value;
    renderContent(panel);
  });
  panel.querySelector("#mdd-employment")?.addEventListener("change", event => {
    state.filters.employment = event.target.value;
    renderContent(panel);
  });
  panel.querySelector("#mdd-search")?.addEventListener("input", event => {
    state.filters.search = event.target.value;
    renderContent(panel);
  });
  panel.querySelector("#mdd-reset")?.addEventListener("click", () => {
    resetFilters(panel);
  });
  panel.querySelector("#mdd-refresh")?.addEventListener("click", () => {
    void loadEmployees(panel, true);
  });
  panel.querySelector("#mdd-export-excel")?.addEventListener("click", () => {
    void exportExcel();
  });
  panel.querySelector("#mdd-export-pdf")?.addEventListener("click", () => {
    void exportPdf();
  });

  panel.querySelector("#mdd-content")?.addEventListener("click", event => {
    const reset = event.target.closest("[data-mdd-reset]");
    if (reset) {
      resetFilters(panel);
      return;
    }

    const scrollTarget = event.target.closest("[data-mdd-scroll]");
    if (scrollTarget) {
      const targetId = scrollTarget.dataset.mddScroll;
      panel.querySelector(`#${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const filterEl = event.target.closest("[data-mdd-filter]");
    if (filterEl) {
      applyFilter(panel, filterEl.dataset.mddFilter, filterEl.dataset.mddValue);
      return;
    }

    const viewEmployee = event.target.closest("[data-mdd-employee]");
    if (viewEmployee) {
      const nik = viewEmployee.dataset.mddEmployee;
      const employee = state.employees.find(item => employeeNik(item) === nik);
      if (employee) {
        void import("../utils.js").then(({ openModal, escapeHtml: esc }) => {
          openModal({
            title: employeeDisplayName(employee),
            size: "lg",
            bodyHtml: employeeQuickViewHtml(employee, esc)
          });
        });
      }
    }
  });
}

async function loadEmployees(panel, force = false) {
  if (state.loading) return;
  state.loading = true;
  const content = panel.querySelector("#mdd-content");
  if (content) {
    content.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-4">${skeletonRows(5)}</div>`;
  }
  try {
    const employees = await fsGetAll(COL.MASTER_KARYAWAN);
    state.employees = Array.isArray(employees) ? employees : [];
    state.loaded = true;
    populateFilters(panel);
    renderContent(panel);
    if (force) toast("Data dashboard karyawan diperbarui.", "success");
  } catch (error) {
    console.error("dashboard data master", error);
    if (content) {
      content.innerHTML = emptyState("Gagal memuat data karyawan.", error?.message || "Periksa koneksi atau hak akses.");
    }
    toast("Gagal memuat dashboard data karyawan.", "error");
  } finally {
    state.loading = false;
  }
}

function populateFilters(panel) {
  const options = masterEmployeeFilterOptions(state.employees);
  const branchSelect = panel.querySelector("#mdd-branch");
  const divisionSelect = panel.querySelector("#mdd-division");
  const employmentSelect = panel.querySelector("#mdd-employment");

  if (branchSelect) {
    branchSelect.innerHTML = `<option value="">Semua Cabang</option>${options.branches
      .map(branch => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join("")}`;
    branchSelect.value = state.filters.branch;
  }
  if (divisionSelect) {
    divisionSelect.innerHTML = `<option value="">Semua Divisi</option>${options.divisions
      .map(division => `<option value="${escapeHtml(division)}">${escapeHtml(division)}</option>`).join("")}`;
    divisionSelect.value = state.filters.division;
  }
  if (employmentSelect) {
    employmentSelect.innerHTML = `<option value="">Semua Status</option>${options.employments
      .map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("")}`;
    employmentSelect.value = state.filters.employment;
  }
}

function applyFilter(panel, key, value) {
  if (!["branch", "division", "active", "employment"].includes(key)) return;
  const nextValue = state.filters[key] === value ? "" : value;
  state.filters[key] = nextValue;
  const selectId = { branch: "#mdd-branch", division: "#mdd-division", active: "#mdd-active", employment: "#mdd-employment" }[key];
  const select = panel.querySelector(selectId);
  if (select) select.value = nextValue;
  renderContent(panel);
}

function resetFilters(panel) {
  state.filters = { branch: "", division: "", active: "", employment: "", search: "" };
  ["#mdd-branch", "#mdd-division", "#mdd-active", "#mdd-employment"].forEach(selector => {
    const element = panel.querySelector(selector);
    if (element) element.value = "";
  });
  const search = panel.querySelector("#mdd-search");
  if (search) search.value = "";
  renderContent(panel);
}

function renderContent(panel) {
  const content = panel.querySelector("#mdd-content");
  if (!content) return;
  const filtered = filterMasterEmployees(state.employees, state.filters);
  const data = buildMasterEmployeeDashboard(filtered, { now: new Date() });
  const info = panel.querySelector("#mdd-filter-info");
  if (info) {
    const parts = [
      `${filtered.length} dari ${state.employees.length} karyawan`,
      state.filters.branch ? `Cabang ${state.filters.branch}` : "Semua cabang",
      state.filters.division ? `Divisi ${state.filters.division}` : "Semua divisi",
      state.filters.active || "Semua keaktifan",
      state.filters.employment || "Semua status kerja"
    ];
    info.textContent = parts.join(" · ");
  }

  if (!filtered.length) {
    content.innerHTML = emptyState("Tidak ada karyawan pada filter ini.", "Ubah cabang, divisi, status, atau kata kunci pencarian.");
    return;
  }

  content.innerHTML = `
    ${renderStats(data)}
    ${renderCharts(data)}
    ${renderContractSection(data)}
    ${renderNewHireSection(data)}
    ${renderCompletenessSection(data)}
    ${renderEmployeeTable(filtered)}
  `;
}

function renderStats(data) {
  const activePercent = data.total ? Math.round((data.active / data.total) * 1000) / 10 : 0;
  const inactivePercent = data.total ? Math.round((data.inactive / data.total) * 1000) / 10 : 0;
  const cards = [
    {
      label: "Total Karyawan",
      value: data.total,
      note: `${data.branches} cabang · ${data.divisions} divisi`,
      tone: "maroon",
      action: `data-mdd-reset="true"`
    },
    {
      label: "Karyawan Aktif",
      value: data.active,
      note: `${activePercent}% dari total`,
      tone: "green",
      action: `data-mdd-filter="active" data-mdd-value="${EMPLOYEE_ACTIVE}"`
    },
    {
      label: "Tidak Aktif",
      value: data.inactive,
      note: `${inactivePercent}% dari total`,
      tone: "red",
      action: `data-mdd-filter="active" data-mdd-value="${EMPLOYEE_INACTIVE}"`
    },
    {
      label: `Kontrak ≤ ${data.contractWindowDays} Hari`,
      value: data.contractExpiring.length,
      note: data.contractExpired.length ? `${data.contractExpired.length} sudah berakhir` : "Tidak ada yang berakhir",
      tone: "amber",
      action: `data-mdd-scroll="mdd-contract-section"`
    },
    {
      label: `Karyawan Baru ≤ ${data.newHireDays} Hari`,
      value: data.newHires.length,
      note: "Berdasarkan tanggal join",
      tone: "blue",
      action: `data-mdd-scroll="mdd-newhire-section"`
    },
    {
      label: "Cabang",
      value: data.branches,
      note: "Lokasi penempatan",
      tone: "slate",
      action: `data-mdd-scroll="mdd-branch-section"`
    },
    {
      label: "Divisi",
      value: data.divisions,
      note: "Unit kerja",
      tone: "slate",
      action: `data-mdd-scroll="mdd-division-section"`
    }
  ];

  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      ${cards.map(card => `
        <button type="button" ${card.action} class="text-left rounded-2xl border ${toneBorder(card.tone)} bg-white p-3.5 shadow-xs hover:shadow-sm transition cursor-pointer">
          <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">${escapeHtml(card.label)}</p>
          <p class="mt-1 text-2xl font-black ${toneText(card.tone)}">${escapeHtml(String(card.value))}</p>
          <p class="mt-1 text-[10px] font-semibold text-slate-400 leading-snug">${escapeHtml(card.note)}</p>
        </button>`).join("")}
    </div>`;
}

function renderCharts(data) {
  return `
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      ${stackedChart({
        id: "mdd-branch-section",
        title: "Karyawan per Cabang",
        subtitle: "Klik batang untuk memfilter cabang.",
        rows: data.byBranch,
        filterKey: "branch"
      })}
      ${stackedChart({
        id: "mdd-division-section",
        title: "Karyawan per Divisi",
        subtitle: "Klik batang untuk memfilter divisi.",
        rows: data.byDivision,
        filterKey: "division"
      })}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${countChart({
        title: "Status Hubungan Kerja",
        subtitle: "Klik untuk memfilter status kerja.",
        rows: data.byEmploymentStatus,
        filterKey: "employment",
        color: "bg-maroon-600"
      })}
      ${countChart({ title: "Jenis Kelamin", subtitle: "Komposisi gender karyawan.", rows: data.byGender, color: "bg-blue-500" })}
      ${countChart({ title: "Kelompok Usia", subtitle: "Berdasarkan tanggal lahir.", rows: data.byAge, color: "bg-amber-500" })}
      ${countChart({ title: "Masa Kerja", subtitle: "Berdasarkan tanggal join.", rows: data.byTenure, color: "bg-emerald-500" })}
      ${countChart({ title: "Pendidikan Terakhir", subtitle: "Sebaran jenjang pendidikan.", rows: data.byEducation, color: "bg-indigo-500" })}
    </div>`;
}

function stackedChart({ id, title, subtitle, rows, filterKey }) {
  const max = Math.max(1, ...rows.map(row => Number(row.total) || 0));
  return `
    <section id="${id}" class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-800">${escapeHtml(title)}</h3>
          <p class="text-[11px] text-slate-400">${escapeHtml(subtitle)}</p>
        </div>
        <div class="flex items-center gap-2 text-[9px] font-bold text-slate-500">
          <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Aktif</span>
          <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-rose-400"></span>Tidak aktif</span>
        </div>
      </div>
      <div class="mt-4 space-y-2.5">
        ${rows.length ? rows.map(row => {
          const total = Number(row.total) || 0;
          const active = Number(row.active) || 0;
          const inactive = Number(row.inactive) || 0;
          const width = Math.max(2, (total / max) * 100);
          const activeWidth = total ? (active / total) * 100 : 0;
          const inactiveWidth = total ? (inactive / total) * 100 : 0;
          return `
            <button type="button" data-mdd-filter="${filterKey}" data-mdd-value="${escapeHtml(row.name)}" class="block w-full text-left group cursor-pointer">
              <div class="flex items-center justify-between gap-2 text-[11px]">
                <span class="font-bold text-slate-700 group-hover:text-maroon-700 transition truncate">${escapeHtml(row.name)}</span>
                <span class="shrink-0 font-semibold text-slate-500">${total} <span class="text-[9px] font-medium text-slate-400">(${active} aktif · ${inactive} nonaktif)</span></span>
              </div>
              <div class="mt-1 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div class="flex h-full rounded-full overflow-hidden" style="width:${width}%">
                  <div class="h-full bg-emerald-500" style="width:${activeWidth}%"></div>
                  <div class="h-full bg-rose-400" style="width:${inactiveWidth}%"></div>
                </div>
              </div>
            </button>`;
        }).join("") : `<p class="text-xs text-slate-400">Tidak ada data.</p>`}
      </div>
    </section>`;
}

function countChart({ title, subtitle, rows, filterKey = "", color = "bg-maroon-600" }) {
  const max = Math.max(1, ...rows.map(row => Number(row.count) || 0));
  return `
    <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <h3 class="text-sm font-black text-slate-800">${escapeHtml(title)}</h3>
      <p class="text-[11px] text-slate-400">${escapeHtml(subtitle)}</p>
      <div class="mt-4 space-y-2.5">
        ${rows.length ? rows.map(row => {
          const count = Number(row.count) || 0;
          const filterAttr = filterKey
            ? `data-mdd-filter="${filterKey}" data-mdd-value="${escapeHtml(row.name)}"`
            : "";
          return `
            <${filterKey ? "button type=\"button\"" : "div"} ${filterAttr} class="block w-full text-left ${filterKey ? "group cursor-pointer" : ""}">
              <div class="flex items-center justify-between gap-2 text-[11px]">
                <span class="font-semibold text-slate-600 ${filterKey ? "group-hover:text-maroon-700 transition" : ""} truncate">${escapeHtml(row.name)}</span>
                <span class="shrink-0 font-bold text-slate-700">${count}</span>
              </div>
              <div class="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full ${color}" style="width:${Math.max(2, (count / max) * 100)}%"></div>
              </div>
            </${filterKey ? "button" : "div"}>`;
        }).join("") : `<p class="text-xs text-slate-400">Tidak ada data.</p>`}
      </div>
    </section>`;
}

function renderContractSection(data) {
  const rows = data.contractExpiring.slice(0, 30);
  return `
    <section id="mdd-contract-section" class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-800">Kontrak Akan Berakhir</h3>
          <p class="text-[11px] text-slate-400">Dalam ${data.contractWindowDays} hari ke depan · ${data.contractExpiring.length} karyawan.</p>
        </div>
        <div class="flex gap-1.5">
          ${statusPill(`${data.contractExpiring.length} akan berakhir`, data.contractExpiring.length ? "amber" : "green")}
          ${data.contractExpired.length ? statusPill(`${data.contractExpired.length} sudah berakhir`, "red") : ""}
        </div>
      </div>
      ${rows.length ? `
        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[680px] text-[11px]">
            <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left font-black">Karyawan</th>
                <th class="px-3 py-2 text-left font-black">Cabang / Divisi</th>
                <th class="px-3 py-2 text-left font-black">Jabatan</th>
                <th class="px-3 py-2 text-left font-black">Kontrak Berakhir</th>
                <th class="px-3 py-2 text-right font-black">Sisa</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows.map(row => `
                <tr class="hover:bg-amber-50/40">
                  <td class="px-3 py-2">
                    <button type="button" data-mdd-employee="${escapeHtml(row.nik)}" class="text-left font-bold text-slate-800 hover:text-maroon-700">${escapeHtml(row.name)}</button>
                    <p class="text-[9px] text-slate-400">${escapeHtml(row.nik)}</p>
                  </td>
                  <td class="px-3 py-2 text-slate-600">${escapeHtml(row.branch)}<p class="text-[9px] text-slate-400">${escapeHtml(row.division)}</p></td>
                  <td class="px-3 py-2 text-slate-600">${escapeHtml(row.position)}</td>
                  <td class="px-3 py-2 font-semibold text-slate-600">${escapeHtml(fmtDateShort(row.contractDate))}</td>
                  <td class="px-3 py-2 text-right">${statusPill(daysLabel(row.daysLeft), row.daysLeft <= 30 ? "red" : "amber")}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>` : `<p class="mt-3 text-xs text-slate-400">Tidak ada kontrak yang akan berakhir dalam ${data.contractWindowDays} hari.</p>`}
      ${data.contractExpired.length ? `
        <details class="mt-3 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
          <summary class="cursor-pointer text-[11px] font-bold text-rose-700">Lihat ${data.contractExpired.length} kontrak yang sudah berakhir</summary>
          <div class="mt-2 space-y-1.5">
            ${data.contractExpired.slice(0, 20).map(row => `
              <div class="flex items-center justify-between gap-2 text-[11px]">
                <span class="font-semibold text-slate-700">${escapeHtml(row.name)} <span class="font-normal text-slate-400">· ${escapeHtml(row.branch)}</span></span>
                <span class="text-rose-600 font-bold">${escapeHtml(fmtDateShort(row.contractDate))}</span>
              </div>`).join("")}
          </div>
        </details>` : ""}
    </section>`;
}

function renderNewHireSection(data) {
  return `
    <section id="mdd-newhire-section" class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-800">Karyawan Baru</h3>
          <p class="text-[11px] text-slate-400">Bergabung dalam ${data.newHireDays} hari terakhir · ${data.newHires.length} karyawan.</p>
        </div>
        ${statusPill(`${data.newHires.length} karyawan`, data.newHires.length ? "blue" : "slate")}
      </div>
      ${data.newHires.length ? `
        <div class="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          ${data.newHires.slice(0, 18).map(row => `
            <button type="button" data-mdd-employee="${escapeHtml(row.nik)}" class="text-left rounded-xl border border-slate-100 bg-slate-50/60 p-3 hover:border-blue-200 hover:bg-blue-50/50 transition cursor-pointer">
              <p class="text-[11px] font-bold text-slate-800 truncate">${escapeHtml(row.name)}</p>
              <p class="text-[9px] text-slate-400">${escapeHtml(row.nik)} · ${escapeHtml(row.position)}</p>
              <p class="mt-1 text-[10px] font-semibold text-blue-700">${escapeHtml(fmtDateShort(row.joinDate))} · ${row.daysAgo === 0 ? "hari ini" : `${row.daysAgo} hari lalu`}</p>
            </button>`).join("")}
        </div>` : `<p class="mt-3 text-xs text-slate-400">Belum ada karyawan baru dalam ${data.newHireDays} hari terakhir.</p>`}
    </section>`;
}

function renderCompletenessSection(data) {
  return `
    <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-black text-slate-800">Kelengkapan Data Karyawan</h3>
          <p class="text-[11px] text-slate-400">Persentase data yang sudah terisi dari total karyawan pada filter ini.</p>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        ${data.completeness.map(item => `
          <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold text-slate-600">${escapeHtml(item.label)}</span>
              <span class="text-[10px] font-black ${item.percent >= 90 ? "text-emerald-700" : item.percent >= 70 ? "text-amber-700" : "text-rose-700"}">${item.percent}%</span>
            </div>
            <div class="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full rounded-full ${item.percent >= 90 ? "bg-emerald-500" : item.percent >= 70 ? "bg-amber-500" : "bg-rose-500"}" style="width:${item.percent}%"></div>
            </div>
            <p class="mt-1 text-[9px] text-slate-400">${item.complete} terisi · ${item.missing} kosong</p>
          </div>`).join("")}
      </div>
    </section>`;
}

function renderEmployeeTable(employees) {
  return `
    <section class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-4 border-b border-slate-100">
        <div>
          <h3 class="text-sm font-black text-slate-800">Daftar Karyawan Sesuai Filter</h3>
          <p class="text-[11px] text-slate-400">${employees.length} karyawan ditampilkan. Klik nama untuk melihat ringkasan profil.</p>
        </div>
        ${statusPill(`${employees.length} karyawan`, "maroon")}
      </div>
      <div class="max-h-[30rem] overflow-auto">
        <table class="w-full min-w-[900px] text-[11px]">
          <thead class="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 z-10">
            <tr>
              <th class="px-3 py-2.5 text-left font-black">Karyawan</th>
              <th class="px-3 py-2.5 text-left font-black">Cabang / Divisi</th>
              <th class="px-3 py-2.5 text-left font-black">Jabatan</th>
              <th class="px-3 py-2.5 text-left font-black">Status Kerja</th>
              <th class="px-3 py-2.5 text-center font-black">Keaktifan</th>
              <th class="px-3 py-2.5 text-left font-black">Join</th>
              <th class="px-3 py-2.5 text-left font-black">Kontrak</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${employees.map(employee => {
              const active = employeeActiveStatus(employee);
              return `
                <tr class="hover:bg-maroon-50/30">
                  <td class="px-3 py-2.5">
                    <button type="button" data-mdd-employee="${escapeHtml(employeeNik(employee))}" class="text-left font-bold text-slate-800 hover:text-maroon-700">${escapeHtml(employeeDisplayName(employee))}</button>
                    <p class="text-[9px] text-slate-400">${escapeHtml(employeeNik(employee))}</p>
                  </td>
                  <td class="px-3 py-2.5 text-slate-600">${escapeHtml(employeeBranchName(employee))}<p class="text-[9px] text-slate-400">${escapeHtml(employeeDivisionName(employee))}</p></td>
                  <td class="px-3 py-2.5 text-slate-600">${escapeHtml(employee.jabatan || "-")}</td>
                  <td class="px-3 py-2.5 text-slate-600">${escapeHtml(employeeEmploymentStatus(employee))}</td>
                  <td class="px-3 py-2.5 text-center">${statusPill(active === EMPLOYEE_ACTIVE ? "Aktif" : "Tidak Aktif", active === EMPLOYEE_ACTIVE ? "green" : "red")}</td>
                  <td class="px-3 py-2.5 text-slate-600">${employee.tanggal_join ? escapeHtml(fmtDateShort(employee.tanggal_join)) : '<span class="text-slate-300">-</span>'}</td>
                  <td class="px-3 py-2.5 text-slate-600">${employee.kontrak_habis ? escapeHtml(fmtDateShort(employee.kontrak_habis)) : '<span class="text-slate-300">-</span>'}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function employeeQuickViewHtml(employee, esc) {
  const rows = [
    ["NIK", employeeNik(employee)],
    ["Nama", employeeDisplayName(employee)],
    ["Jabatan", employee.jabatan || "-"],
    ["Cabang", employeeBranchName(employee)],
    ["Divisi", employeeDivisionName(employee)],
    ["Status Kerja", employeeEmploymentStatus(employee)],
    ["Keaktifan", employeeActiveStatus(employee)],
    ["Tanggal Join", employee.tanggal_join ? fmtDateShort(employee.tanggal_join) : "-"],
    ["Kontrak Berakhir", employee.kontrak_habis ? fmtDateShort(employee.kontrak_habis) : "-"],
    ["Email", employee.email || employee.email_perusahaan || "-"],
    ["No. HP", employee.no_hp_aktif || employee.no_hp || "-"],
    ["Atasan", employee.atasan || "-"]
  ];
  return `
    <div class="space-y-3">
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-[10px] font-black uppercase tracking-wide text-slate-400">Ringkasan Profil</p>
        <p class="mt-1 text-lg font-black text-slate-800">${esc(employeeDisplayName(employee))}</p>
        <p class="text-[11px] text-slate-500">${esc(employeeNik(employee))} · ${esc(employee.jabatan || "-")}</p>
      </div>
      <table class="w-full text-xs">
        <tbody class="divide-y divide-slate-100">
          ${rows.map(([label, value]) => `<tr><td class="py-2 pr-3 font-semibold text-slate-500 w-40">${esc(label)}</td><td class="py-2 font-semibold text-slate-800">${esc(value)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function toneBorder(tone) {
  return {
    green: "border-emerald-200",
    red: "border-rose-200",
    amber: "border-amber-200",
    blue: "border-blue-200",
    maroon: "border-maroon-200",
    slate: "border-slate-200"
  }[tone] || "border-slate-200";
}

function toneText(tone) {
  return {
    green: "text-emerald-700",
    red: "text-rose-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    maroon: "text-maroon-700",
    slate: "text-slate-800"
  }[tone] || "text-slate-800";
}

function statusPill(text, tone) {
  const classes = {
    green: "bg-emerald-100 text-emerald-700 border-emerald-200",
    red: "bg-rose-100 text-rose-700 border-rose-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    maroon: "bg-maroon-50 text-maroon-700 border-maroon-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200"
  }[tone] || "bg-slate-100 text-slate-600 border-slate-200";
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${classes}">${escapeHtml(text)}</span>`;
}

function daysLabel(days) {
  if (days === 0) return "Hari ini";
  if (days < 0) return `${Math.abs(days)} hari lalu`;
  return `${days} hari lagi`;
}

async function exportExcel() {
  const filtered = filterMasterEmployees(state.employees, state.filters);
  if (!filtered.length) return toast("Tidak ada data karyawan untuk diekspor.", "warning");
  const headers = [
    "NIK", "Nama Karyawan", "Jabatan", "Cabang", "Divisi", "Status Hubungan Kerja",
    "Keaktifan", "Tanggal Join", "Kontrak Berakhir", "Email", "No. HP", "Atasan"
  ];
  const rows = filtered.map(employee => [
    employeeNik(employee), employeeDisplayName(employee), employee.jabatan || "",
    employeeBranchName(employee), employeeDivisionName(employee), employeeEmploymentStatus(employee),
    employeeActiveStatus(employee), employee.tanggal_join || "", employee.kontrak_habis || "",
    employee.email || employee.email_perusahaan || "", employee.no_hp_aktif || employee.no_hp || "",
    employee.atasan || ""
  ]);
  await downloadXlsx(
    `Dashboard_Data_Karyawan_${new Date().toISOString().slice(0, 10)}.xlsx`,
    headers,
    rows,
    "Data Karyawan"
  ).catch(error => {
    console.error("export dashboard data master", error);
    toast("Gagal membuat Excel: " + (error?.message || error), "error");
  });
}

async function exportPdf() {
  const filtered = filterMasterEmployees(state.employees, state.filters);
  if (!filtered.length) return toast("Tidak ada data karyawan untuk dicetak.", "warning");
  const data = buildMasterEmployeeDashboard(filtered, { now: new Date() });
  const content = `
    <div class="aj-doc">
      ${letterheadHtml()}
      <div class="aj-title">
        <h1>Dashboard Data Karyawan</h1>
        <div class="aj-number">Filter: ${escapeHtml(filterLabel())} · Dicetak ${escapeHtml(new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }))}</div>
      </div>
      ${reportTable(
        ["Ringkasan", "Nilai"],
        [
          ["Total karyawan", String(data.total)],
          ["Karyawan aktif", String(data.active)],
          ["Karyawan tidak aktif", String(data.inactive)],
          ["Jumlah cabang", String(data.branches)],
          ["Jumlah divisi", String(data.divisions)],
          [`Kontrak ≤ ${data.contractWindowDays} hari`, String(data.contractExpiring.length)],
          ["Kontrak sudah berakhir", String(data.contractExpired.length)],
          [`Karyawan baru ≤ ${data.newHireDays} hari`, String(data.newHires.length)]
        ],
        ["45%", "55%"]
      )}
      ${reportSection("Karyawan per Cabang", reportTable(
        ["Cabang", "Total", "Aktif", "Tidak Aktif"],
        data.byBranch.map(row => [escapeHtml(row.name), String(row.total), String(row.active), String(row.inactive)]),
        ["46%", "18%", "18%", "18%"]
      ))}
      ${reportSection("Karyawan per Divisi", reportTable(
        ["Divisi", "Total", "Aktif", "Tidak Aktif"],
        data.byDivision.map(row => [escapeHtml(row.name), String(row.total), String(row.active), String(row.inactive)]),
        ["46%", "18%", "18%", "18%"]
      ))}
      ${reportSection("Status Hubungan Kerja", reportTable(
        ["Status", "Jumlah"],
        data.byEmploymentStatus.map(row => [escapeHtml(row.name), String(row.count)]),
        ["70%", "30%"]
      ))}
      ${reportSection(`Kontrak Akan Berakhir (≤ ${data.contractWindowDays} hari)`, reportTable(
        ["Nama", "Cabang", "Divisi", "Kontrak Berakhir", "Sisa"],
        data.contractExpiring.length
          ? data.contractExpiring.map(row => [escapeHtml(row.name), escapeHtml(row.branch), escapeHtml(row.division), escapeHtml(fmtDateShort(row.contractDate)), escapeHtml(daysLabel(row.daysLeft))])
          : [["Tidak ada data", "-", "-", "-", "-"]],
        ["28%", "20%", "20%", "17%", "15%"]
      ))}
      ${reportSection(`Karyawan Baru (≤ ${data.newHireDays} hari)`, reportTable(
        ["Nama", "Cabang", "Divisi", "Tanggal Join", "Bergabung"],
        data.newHires.length
          ? data.newHires.map(row => [escapeHtml(row.name), escapeHtml(row.branch), escapeHtml(row.division), escapeHtml(fmtDateShort(row.joinDate)), row.daysAgo === 0 ? "Hari ini" : `${row.daysAgo} hari lalu`])
          : [["Tidak ada data", "-", "-", "-", "-"]],
        ["28%", "20%", "20%", "17%", "15%"]
      ))}
      ${reportSection("Kelengkapan Data", reportTable(
        ["Data", "Terisi", "Kosong", "Persentase"],
        data.completeness.map(item => [escapeHtml(item.label), String(item.complete), String(item.missing), `${item.percent}%`]),
        ["40%", "20%", "20%", "20%"]
      ))}
      ${reportSection("Daftar Karyawan", reportTable(
        ["NIK", "Nama", "Jabatan", "Cabang", "Divisi", "Keaktifan", "Join", "Kontrak"],
        filtered.map(employee => [
          escapeHtml(employeeNik(employee)), escapeHtml(employeeDisplayName(employee)),
          escapeHtml(employee.jabatan || "-"), escapeHtml(employeeBranchName(employee)),
          escapeHtml(employeeDivisionName(employee)), escapeHtml(employeeActiveStatus(employee)),
          escapeHtml(employee.tanggal_join ? fmtDateShort(employee.tanggal_join) : "-"),
          escapeHtml(employee.kontrak_habis ? fmtDateShort(employee.kontrak_habis) : "-")
        ]),
        ["10%", "20%", "15%", "13%", "13%", "10%", "10%", "9%"]
      ))}
    </div>`;
  const html = officialPrintHtml({ title: "Dashboard Data Karyawan", contentHtml: content });
  try {
    await downloadHtmlAsPdf(html, `Dashboard_Data_Karyawan_${new Date().toISOString().slice(0, 10)}.pdf`, "landscape");
    toast("PDF dashboard data karyawan berhasil diunduh.", "success");
  } catch (error) {
    console.error("export PDF data master", error);
    toast("Gagal membuat PDF: " + (error?.message || error), "error");
  }
}

function filterLabel() {
  const parts = [];
  if (state.filters.branch) parts.push(`Cabang ${state.filters.branch}`);
  if (state.filters.division) parts.push(`Divisi ${state.filters.division}`);
  if (state.filters.active) parts.push(state.filters.active);
  if (state.filters.employment) parts.push(state.filters.employment);
  if (state.filters.search) parts.push(`"${state.filters.search}"`);
  return parts.length ? parts.join(" · ") : "Semua karyawan";
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
