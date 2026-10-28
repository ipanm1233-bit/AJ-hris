import { COL } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, fsDelete, toast, openModal, closeModal, escapeHtml,
  genId, fmtDateShort, localDateStr, loadDivisionOptions, confirmDialog,
  notifyUser, downloadHtmlAsPdf
} from "../utils.js";
import { getSession, hasPermission } from "../auth.js";
import { icon } from "../components.js";
import { isoDocHeaderTable, COMPANY_NAME } from "../branding.js";
import {
  ITEM_STATUSES, ITEM_STATUS_META, PROJECT_STATUSES, ASSIGNMENT_TYPES,
  SOCIALIZATION_METHODS, SOCIALIZATION_TARGETS, canFillItem, itemVisibleTo,
  summarizeItems, computeAnalysisValue, analysisGrade, nextStatus,
  autoSopNumber, buildSopDocument, normalizeWorkSteps, normalizeCommunicationFlow, normalizeOutputs
} from "../sop-project.mjs";

const esc = value => escapeHtml(value ?? "");
const today = () => localDateStr() || new Date().toISOString().slice(0, 10);
const isHrdSession = session => ["HRD", "SUPERADMIN"].includes(String(session?.role || "").toUpperCase());
const normalize = value => String(value ?? "").trim().toLowerCase();
const dateText = value => value ? fmtDateShort(value) : "-";

const STATUS_TONES = {
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  red: "bg-rose-100 text-rose-700 border-rose-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  green: "bg-emerald-100 text-emerald-700 border-emerald-200"
};

function statusMeta(status) {
  return ITEM_STATUS_META[String(status || "").toUpperCase()] || ITEM_STATUS_META.DRAFT;
}

function statusPill(status) {
  const meta = statusMeta(status);
  return `<span class="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONES[meta.tone] || STATUS_TONES.slate}">${esc(meta.label)}</span>`;
}

function branchPill(branch) {
  const label = !branch || branch === "SEMUA" ? "Semua Cabang" : branch === "CIREBON" ? "Cirebon" : branch === "MALANG" ? "Malang" : branch;
  return `<span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">${esc(label)}</span>`;
}

function emptyBox(text) {
  return `<div class="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">${esc(text)}</div>`;
}

function metric(label, value, note, tone = "slate") {
  const colors = { slate: "text-slate-800", amber: "text-amber-700", red: "text-rose-700", green: "text-emerald-700", blue: "text-blue-700", violet: "text-violet-700" };
  return `<div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
    <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">${esc(label)}</p>
    <p class="mt-1 text-2xl font-black ${colors[tone] || colors.slate}">${esc(value)}</p>
    <p class="mt-1 text-[11px] text-slate-400">${esc(note)}</p>
  </div>`;
}

function picLabel(item) {
  if (item.penugasan_tipe === "DIVISI") return `PIC Divisi ${item.divisi || "-"}`;
  if (item.penugasan_tipe === "JABATAN") return `PIC Jabatan ${item.jabatan || "-"}`;
  return item.pic_nama || item.pic_username || item.pic_email || "Belum ditunjuk";
}

function employeeTarget(employee = {}) {
  return {
    username: employee.username || employee.nik_karyawan || employee.nik || employee.email || "",
    nama: employee.nama_karyawan || employee.nama || employee.username || "",
    email: employee.email || "",
    nik: employee.nik_karyawan || employee.nik || ""
  };
}

export async function mount(container) {
  const session = getSession() || {};
  const hrd = isHrdSession(session);
  const [canCreate, canVerify, canSocialize, canEstablish, canDeleteProject] = await Promise.all([
    hrd || hasPermission("sop.project.create", session),
    hrd || hasPermission("sop.project.verify", session),
    hrd || hasPermission("sop.project.socialize", session),
    hrd || hasPermission("sop.project.establish", session),
    hrd || hasPermission("sop.project.delete", session)
  ]);
  const managerView = hrd || canCreate || canVerify || canSocialize || canEstablish;

  const tabBar = container.querySelector("#sop-proyek-tabbar");
  const summaryEl = container.querySelector("#sop-proyek-summary");
  const panel = container.querySelector("#sop-proyek-panel");

  const state = {
    projects: [],
    items: [],
    employees: [],
    divisions: [],
    activeTab: "proyek",
    projectId: "",
    filterBranch: "",
    search: ""
  };

  const tabs = [
    { id: "proyek", label: "Proyek & Penugasan" },
    ...(canVerify ? [{ id: "verifikasi", label: "Verifikasi & Analisa" }] : []),
    ...(canSocialize || canEstablish ? [{ id: "sosialisasi", label: "Sosialisasi & Penetapan" }] : []),
    { id: "berlaku", label: "SOP Berlaku" }
  ];

  const visibleItems = () => state.items.filter(item => itemVisibleTo(session, item, { isHrd: managerView }));
  const projectItems = projectId => state.items.filter(item => item.project_id === projectId);
  const projectOf = item => state.projects.find(project => project.id === item.project_id) || null;
  const myTasks = () => state.items.filter(item =>
    canFillItem(session, item, { isHrd: false }) &&
    ["DRAFT", "REVISION"].includes(String(item.status || "").toUpperCase())
  );
  const matchesBranch = value => !state.filterBranch || value === state.filterBranch || value === "SEMUA";

  async function loadData() {
    const [projects, items, employees] = await Promise.all([
      fsGetAll(COL.SOP_PROJECTS).catch(error => { console.error("Gagal memuat proyek SOP:", error); return []; }),
      fsGetAll(COL.SOP_PROJECT_ITEMS).catch(error => { console.error("Gagal memuat proses SOP:", error); return []; }),
      fsGetAll(COL.MASTER_KARYAWAN).catch(error => { console.error("Gagal memuat karyawan:", error); return []; })
    ]);
    state.projects = (projects || []).sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
    state.items = (items || []).sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
    state.employees = (employees || []).filter(employee =>
      !["TIDAK AKTIF", "NONAKTIF", "RESIGN"].includes(String(employee.aktif_tdk_aktif || "AKTIF").toUpperCase())
    );
    state.divisions = await loadDivisionOptions({ includeAll: true, employees: state.employees });
    if (!state.divisions.length) state.divisions = ["UMUM"];
  }

  async function refreshAll() {
    await loadData();
    renderSummary();
    await renderPanel();
  }

  function renderTabs() {
    if (!tabBar) return;
    tabBar.innerHTML = tabs.map(tab => `
      <button type="button" data-skp-tab="${tab.id}" class="px-3.5 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap ${state.activeTab === tab.id ? "bg-white text-maroon-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}">${esc(tab.label)}</button>
    `).join("");
    tabBar.className = "flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 overflow-x-auto";
    tabBar.querySelectorAll("[data-skp-tab]").forEach(button => {
      button.onclick = async () => {
        state.activeTab = button.dataset.skpTab;
        state.projectId = "";
        renderTabs();
        await renderPanel();
      };
    });
  }

  function renderSummary() {
    if (!summaryEl) return;
    const scoped = managerView ? state.items : visibleItems();
    const summary = summarizeItems(scoped);
    const tasks = myTasks().length;
    summaryEl.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        ${metric("Proyek Audit", state.projects.length, "Cirebon & Malang")}
        ${metric("Proses Kerja", summary.total, `${summary.established} sudah ditetapkan`)}
        ${metric("Menunggu Verifikasi", summary.pendingVerification, "Menunggu analisa HRD", "amber")}
        ${metric("Perlu Revisi", summary.needRevision, "Dikembalikan ke PIC", "red")}
        ${metric("Tugas PIC Saya", tasks, tasks ? "Perlu diisi / direvisi" : "Tidak ada tugas", tasks ? "blue" : "slate")}
      </div>
      <div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-bold text-slate-700">Progress Penetapan SOP sebagai Dasar Operasional</p>
            <p class="text-[11px] text-slate-400">${summary.established} dari ${summary.total} proses kerja telah ditetapkan & berlaku</p>
          </div>
          <p class="text-lg font-black ${summary.progress >= 80 ? "text-emerald-700" : summary.progress >= 50 ? "text-amber-700" : "text-slate-700"}">${summary.progress}%</p>
        </div>
        <div class="mt-2 h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full rounded-full ${summary.progress >= 80 ? "bg-emerald-500" : summary.progress >= 50 ? "bg-amber-500" : "bg-maroon-600"}" style="width:${summary.progress}%"></div>
        </div>
      </div>`;
  }

  async function renderPanel() {
    if (!panel) return;
    panel.innerHTML = `<div class="py-16 text-center text-sm text-slate-400">Memuat Proyek Audit SOP…</div>`;
    if (state.activeTab === "verifikasi" && canVerify) return renderVerifikasiTab();
    if (state.activeTab === "sosialisasi" && (canSocialize || canEstablish)) return renderSosialisasiTab();
    if (state.activeTab === "berlaku") return renderBerlakuTab();
    return renderProyekTab();
  }

  function filterChips() {
    const options = [
      { value: "", label: "Semua Cabang" },
      { value: "CIREBON", label: "Cirebon" },
      { value: "MALANG", label: "Malang" }
    ];
    return options.map(option => `
      <button type="button" data-skp-branch="${option.value}" class="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${state.filterBranch === option.value ? "bg-maroon-700 text-white border-maroon-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}">${option.label}</button>
    `).join("");
  }

  function bindFilterControls(root) {
    root.querySelectorAll("[data-skp-branch]").forEach(button => {
      button.onclick = async () => {
        state.filterBranch = button.dataset.skpBranch || "";
        await renderPanel();
      };
    });
    const search = root.querySelector("#skp-search");
    if (search) {
      search.oninput = async () => {
        state.search = search.value;
        const cursor = search.selectionStart;
        await renderPanel();
        const next = panel.querySelector("#skp-search");
        if (next) { next.focus(); next.setSelectionRange(cursor, cursor); }
      };
    }
  }

  /* =================================================================
   * TAB PROYEK & PENUGASAN
   * =============================================================== */
  async function renderProyekTab() {
    if (state.projectId) return renderProjectDetail();

    const projects = state.projects.filter(project => {
      if (!matchesBranch(project.cabang)) return false;
      if (!state.search || `${project.nama_proyek} ${project.periode} ${project.koordinator}`.toLowerCase().includes(state.search.toLowerCase())) {
        if (managerView) return true;
        return projectItems(project.id).some(item => itemVisibleTo(session, item, { isHrd: false }));
      }
      return false;
    });
    const tasks = myTasks();

    panel.innerHTML = `
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">${filterChips()}
          <input id="skp-search" type="search" value="${esc(state.search)}" placeholder="Cari proyek / periode / koordinator…" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs w-64">
        </div>
        ${canCreate ? `<button id="skp-new-project" class="inline-flex items-center gap-1.5 rounded-lg bg-maroon-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-maroon-800">${icon("plus", "w-4 h-4")}Buat Proyek Audit</button>` : ""}
      </div>

      ${tasks.length ? `
      <section class="space-y-3">
        <div class="flex items-center gap-2"><h2 class="text-sm font-black uppercase tracking-wide text-slate-700">Tugas Saya sebagai PIC</h2><span class="rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5">${tasks.length}</span></div>
        <div class="grid md:grid-cols-2 gap-3">
          ${tasks.map(item => {
            const project = projectOf(item);
            return `<article class="bg-white rounded-2xl border border-blue-200 p-4 shadow-2xs">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-[10px] font-bold uppercase tracking-wide text-blue-700">${esc(project?.nama_proyek || "Proyek SOP")}</p>
                  <h3 class="font-bold text-slate-800">${esc(item.nama_proses || "Proses kerja")}</h3>
                  <p class="text-[11px] text-slate-500">${esc(item.divisi || "-")} · ${esc(item.cabang === "MALANG" ? "Malang" : item.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")} · Deadline ${esc(dateText(item.deadline))}</p>
                </div>
                ${statusPill(item.status)}
              </div>
              ${item.status === "REVISION" && Array.isArray(item.riwayat_revisi) && item.riwayat_revisi.length ? `<p class="mt-2 rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-700"><b>Catatan HRD:</b> ${esc(item.riwayat_revisi[item.riwayat_revisi.length - 1].catatan || "-")}</p>` : ""}
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" data-skp-fill="${esc(item.id)}" class="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">${item.status === "REVISION" ? "Perbaiki & Ajukan" : "Isi Proses Kerja"}</button>
                <button type="button" data-skp-view="${esc(item.id)}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Lihat Detail</button>
              </div>
            </article>`;
          }).join("")}
        </div>
      </section>` : ""}

      <div class="grid md:grid-cols-2 gap-4">
        ${projects.map(project => {
          const items = projectItems(project.id).filter(item => managerView || itemVisibleTo(session, item, { isHrd: false }));
          const stats = summarizeItems(items);
          return `<article class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h3 class="font-bold text-slate-800">${esc(project.nama_proyek || "Proyek Audit SOP")}</h3>
                <p class="text-[11px] text-slate-500 mt-0.5">${esc(project.periode || "-")} · Koordinator: ${esc(project.koordinator || "-")}</p>
              </div>
              ${branchPill(project.cabang)}
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
              <span class="rounded-md bg-slate-100 px-2 py-1 text-slate-600">${stats.total} proses</span>
              <span class="rounded-md bg-amber-50 text-amber-700 px-2 py-1">${stats.counts.SUBMITTED} verifikasi</span>
              <span class="rounded-md bg-rose-50 text-rose-700 px-2 py-1">${stats.counts.REVISION} revisi</span>
              <span class="rounded-md bg-emerald-50 text-emerald-700 px-2 py-1">${stats.counts.ESTABLISHED} berlaku</span>
            </div>
            <div class="mt-3">
              <div class="flex justify-between text-[10px] text-slate-400 mb-1"><span>Progress penetapan</span><b>${stats.progress}%</b></div>
              <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full ${stats.progress >= 80 ? "bg-emerald-500" : stats.progress >= 50 ? "bg-amber-500" : "bg-maroon-600"}" style="width:${stats.progress}%"></div></div>
            </div>
            <p class="mt-2 text-[11px] text-slate-400">Mulai ${esc(dateText(project.tanggal_mulai))} · Target ${esc(dateText(project.target_selesai))} · Status ${esc(project.status || "Berjalan")}</p>
            <div class="mt-auto pt-4 flex flex-wrap gap-2">
              <button type="button" data-skp-open-project="${esc(project.id)}" class="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900">Kelola / Lihat Proses</button>
              ${canCreate ? `<button type="button" data-skp-edit-project="${esc(project.id)}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Edit</button>` : ""}
              ${canDeleteProject ? `<button type="button" data-skp-delete-project="${esc(project.id)}" class="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Hapus</button>` : ""}
            </div>
          </article>`;
        }).join("") || emptyBox(canCreate ? "Belum ada proyek audit SOP. Klik “Buat Proyek Audit” untuk memulai." : "Belum ada proyek audit SOP untuk Anda.")}
      </div>`;

    bindFilterControls(panel);
    panel.querySelector("#skp-new-project")?.addEventListener("click", () => projectModal());
    panel.querySelectorAll("[data-skp-open-project]").forEach(button => button.onclick = async () => {
      state.projectId = button.dataset.skpOpenProject;
      await renderPanel();
    });
    panel.querySelectorAll("[data-skp-edit-project]").forEach(button => button.onclick = () => projectModal(state.projects.find(project => project.id === button.dataset.skpEditProject)));
    panel.querySelectorAll("[data-skp-delete-project]").forEach(button => button.onclick = async () => {
      const project = state.projects.find(entry => entry.id === button.dataset.skpDeleteProject);
      const confirmed = await confirmDialog(`Hapus proyek "${project?.nama_proyek || "-"}" beserta ${projectItems(button.dataset.skpDeleteProject).length} proses kerja di dalamnya?`, { title: "Hapus Proyek Audit SOP", danger: true });
      if (!confirmed) return;
      try {
        for (const item of projectItems(button.dataset.skpDeleteProject)) await fsDelete(COL.SOP_PROJECT_ITEMS, item.id);
        await fsDelete(COL.SOP_PROJECTS, button.dataset.skpDeleteProject);
        toast("Proyek audit SOP dihapus.", "success");
        await refreshAll();
      } catch (error) {
        console.error("delete sop project", error);
        toast("Gagal menghapus proyek: " + error.message, "error");
      }
    });
    panel.querySelectorAll("[data-skp-fill]").forEach(button => button.onclick = () => itemForm(state.items.find(item => item.id === button.dataset.skpFill)));
    panel.querySelectorAll("[data-skp-view]").forEach(button => button.onclick = () => itemDetailModal(state.items.find(item => item.id === button.dataset.skpView)));
  }

  async function renderProjectDetail() {
    const project = state.projects.find(entry => entry.id === state.projectId);
    if (!project) { state.projectId = ""; return renderProyekTab(); }
    const items = projectItems(project.id).filter(item => managerView || itemVisibleTo(session, item, { isHrd: false }));
    const stats = summarizeItems(items);

    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button type="button" id="skp-back-project" class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">← Kembali ke daftar proyek</button>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="skp-print-project" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Ringkasan Proyek</button>
          ${canCreate ? `<button type="button" id="skp-add-item" class="inline-flex items-center gap-1.5 rounded-lg bg-maroon-700 px-3 py-2 text-xs font-bold text-white">${icon("plus", "w-4 h-4")}Tugaskan Proses Kerja</button>` : ""}
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-lg font-black text-slate-800">${esc(project.nama_proyek || "Proyek Audit SOP")}</h2>
            <p class="text-xs text-slate-500">${esc(project.periode || "-")} · Koordinator ${esc(project.koordinator || "-")} · ${esc(project.status || "Berjalan")}</p>
          </div>
          <div class="flex items-center gap-2">${branchPill(project.cabang)}<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">${stats.progress}% ditetapkan</span></div>
        </div>
        ${project.catatan ? `<p class="mt-2 text-xs text-slate-500">${esc(project.catatan)}</p>` : ""}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${metric("Total Proses", stats.total, "Dalam proyek ini")}
        ${metric("Draft PIC", stats.counts.DRAFT, "Belum diajukan")}
        ${metric("Menunggu Verifikasi", stats.counts.SUBMITTED, "HRD memeriksa", "amber")}
        ${metric("Berlaku", stats.counts.ESTABLISHED, "SOP ditetapkan", "green")}
      </div>
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-800">Daftar Proses Kerja & PIC</h3>
          <span class="text-[11px] text-slate-400">${items.length} proses</span>
        </div>
        <div class="divide-y divide-slate-100">
          ${items.map(item => {
            const canFill = canFillItem(session, item, { isHrd: hrd });
            const status = String(item.status || "DRAFT").toUpperCase();
            return `<div class="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-bold text-slate-800">${esc(item.nama_proses || "Proses kerja")}</h4>
                  ${statusPill(status)}
                </div>
                <p class="text-[11px] text-slate-500 mt-0.5">${esc(item.divisi || "-")}${item.jabatan ? " · " + esc(item.jabatan) : ""} · ${esc(picLabel(item))} · ${esc(item.cabang === "MALANG" ? "Malang" : item.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")}</p>
                <p class="text-[11px] text-slate-400">${normalizeWorkSteps(item.langkah).length} langkah · ${normalizeCommunicationFlow(item.flow_komunikasi).length} flow komunikasi · ${normalizeOutputs(item.output).length} output · diperbarui ${esc(dateText(item.updated_at || item.created_at))}</p>
              </div>
              <div class="flex flex-wrap gap-2 shrink-0">
                <button type="button" data-skp-view-item="${esc(item.id)}" class="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600">Lihat</button>
                ${canFill && ["DRAFT", "REVISION"].includes(status) ? `<button type="button" data-skp-fill-item="${esc(item.id)}" class="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white">${status === "REVISION" ? "Revisi" : "Isi"}</button>` : ""}
                ${canFill && ["DRAFT", "REVISION"].includes(status) ? `<button type="button" data-skp-submit-item="${esc(item.id)}" class="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white">Ajukan Verifikasi</button>` : ""}
                ${canVerify && status === "SUBMITTED" ? `<button type="button" data-skp-verify-item="${esc(item.id)}" class="rounded-lg bg-maroon-700 px-3 py-1.5 text-[11px] font-bold text-white">Verifikasi</button>` : ""}
                ${canCreate ? `<button type="button" data-skp-assign-edit="${esc(item.id)}" class="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-500">Penugasan</button>` : ""}
                ${canDeleteProject ? `<button type="button" data-skp-delete-item="${esc(item.id)}" class="rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-rose-700">Hapus</button>` : ""}
              </div>
            </div>`;
          }).join("") || `<div class="p-6">${emptyBox(canCreate ? "Belum ada proses kerja. Klik “Tugaskan Proses Kerja”." : "Belum ada proses kerja yang terlihat untuk Anda.")}</div>`}
        </div>
      </div>`;

    panel.querySelector("#skp-back-project").onclick = async () => { state.projectId = ""; await renderPanel(); };
    panel.querySelector("#skp-add-item")?.addEventListener("click", () => assignmentModal(project));
    panel.querySelector("#skp-print-project")?.addEventListener("click", () => printProjectSummary(project, items));
    panel.querySelectorAll("[data-skp-view-item]").forEach(button => button.onclick = () => itemDetailModal(state.items.find(item => item.id === button.dataset.skpViewItem)));
    panel.querySelectorAll("[data-skp-fill-item]").forEach(button => button.onclick = () => itemForm(state.items.find(item => item.id === button.dataset.skpFillItem)));
    panel.querySelectorAll("[data-skp-submit-item]").forEach(button => button.onclick = () => submitItem(state.items.find(item => item.id === button.dataset.skpSubmitItem)));
    panel.querySelectorAll("[data-skp-verify-item]").forEach(button => button.onclick = () => verifyModal(state.items.find(item => item.id === button.dataset.skpVerifyItem)));
    panel.querySelectorAll("[data-skp-assign-edit]").forEach(button => button.onclick = () => assignmentModal(project, state.items.find(item => item.id === button.dataset.skpAssignEdit)));
    panel.querySelectorAll("[data-skp-delete-item]").forEach(button => button.onclick = async () => {
      const item = state.items.find(entry => entry.id === button.dataset.skpDeleteItem);
      const confirmed = await confirmDialog(`Hapus proses kerja "${item?.nama_proses || "-"}" dari proyek ini?`, { title: "Hapus Proses Kerja", danger: true });
      if (!confirmed) return;
      try {
        await fsDelete(COL.SOP_PROJECT_ITEMS, button.dataset.skpDeleteItem);
        toast("Proses kerja dihapus.", "success");
        await refreshAll();
      } catch (error) {
        console.error("delete sop item", error);
        toast("Gagal menghapus proses kerja: " + error.message, "error");
      }
    });
  }

  /* =================================================================
   * TAB VERIFIKASI & ANALISA (HRD)
   * =============================================================== */
  async function renderVerifikasiTab() {
    const submitted = state.items.filter(item => String(item.status) === "SUBMITTED" && matchesBranch(item.cabang));
    const revision = state.items.filter(item => String(item.status) === "REVISION" && matchesBranch(item.cabang));
    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">${filterChips()}</div>
        <p class="text-[11px] text-slate-400">Verifikasi efektivitas & efisiensi proses kerja yang diajukan PIC.</p>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        ${metric("Menunggu Verifikasi", submitted.length, "Siap dianalisa HRD", "amber")}
        ${metric("Dalam Revisi", revision.length, "Menunggu perbaikan PIC", "red")}
        ${metric("Rata-rata Nilai Verifikasi", (() => {
          const rows = state.items.map(item => Number(item.analisa_hrd?.nilai || 0)).filter(value => value > 0);
          return rows.length ? Math.round(rows.reduce((total, value) => total + value, 0) / rows.length) : 0;
        })(), "Skala 0-100", "blue")}
      </div>
      <div class="space-y-3">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-700">Menunggu Verifikasi HRD</h2>
        ${submitted.map(item => verificationCard(item)).join("") || emptyBox("Tidak ada proses kerja yang menunggu verifikasi.")}
      </div>
      <div class="space-y-3">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-700">Dikembalikan untuk Revisi</h2>
        ${revision.map(item => verificationCard(item)).join("") || emptyBox("Tidak ada proses kerja dalam status revisi.")}
      </div>`;
    bindFilterControls(panel);
    bindVerificationCards();
  }

  function verificationCard(item) {
    const project = projectOf(item);
    return `<article class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${esc(project?.nama_proyek || "Proyek SOP")} · ${esc(item.divisi || "-")}</p>
          <h3 class="font-bold text-slate-800">${esc(item.nama_proses || "Proses kerja")}</h3>
          <p class="text-[11px] text-slate-500">${esc(picLabel(item))} · ${normalizeWorkSteps(item.langkah).length} langkah · ${normalizeCommunicationFlow(item.flow_komunikasi).length} flow · ${normalizeOutputs(item.output).length} output · Diajukan ${esc(dateText(item.submitted_at))}</p>
        </div>
        <div class="flex items-center gap-2">${statusPill(item.status)}${branchPill(item.cabang)}</div>
      </div>
      ${item.analisa_hrd ? `<p class="mt-2 text-[11px] text-slate-500"><b>Analisa terakhir:</b> ${esc(item.analisa_hrd.analisa || "-")} (nilai ${Number(item.analisa_hrd.nilai || 0)})</p>` : ""}
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" data-skp-view-item="${esc(item.id)}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Lihat Detail</button>
        ${String(item.status) === "SUBMITTED" ? `<button type="button" data-skp-verify-item="${esc(item.id)}" class="rounded-lg bg-maroon-700 px-3 py-2 text-xs font-bold text-white">Verifikasi & Analisa</button>` : ""}
      </div>
    </article>`;
  }

  function bindVerificationCards() {
    panel.querySelectorAll("[data-skp-view-item]").forEach(button => button.onclick = () => itemDetailModal(state.items.find(item => item.id === button.dataset.skpViewItem)));
    panel.querySelectorAll("[data-skp-verify-item]").forEach(button => button.onclick = () => verifyModal(state.items.find(item => item.id === button.dataset.skpVerifyItem)));
  }

  /* =================================================================
   * TAB SOSIALISASI & PENETAPAN (HRD)
   * =============================================================== */
  async function renderSosialisasiTab() {
    const verified = state.items.filter(item => String(item.status) === "VERIFIED" && matchesBranch(item.cabang));
    const socialized = state.items.filter(item => String(item.status) === "SOCIALIZED" && matchesBranch(item.cabang));
    const established = state.items.filter(item => String(item.status) === "ESTABLISHED" && matchesBranch(item.cabang));
    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">${filterChips()}</div>
        <p class="text-[11px] text-slate-400">Sosialisasikan SOP terverifikasi, lalu tetapkan sebagai dasar operasional perusahaan.</p>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        ${metric("Siap Disosialisasi", verified.length, "Sudah efektif & efisien", "blue")}
        ${metric("Sudah Disosialisasi", socialized.length, "Menunggu penetapan", "violet")}
        ${metric("Sudah Ditetapkan", established.length, "Menjadi SOP berlaku", "green")}
      </div>
      <div class="space-y-3">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-700">1. Siap Disosialisasi</h2>
        ${verified.map(item => socializationCard(item, canSocialize ? "socialize" : "view")).join("") || emptyBox("Belum ada SOP terverifikasi yang siap disosialisasikan.")}
      </div>
      <div class="space-y-3">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-700">2. Sudah Disosialisasi - Menunggu Penetapan</h2>
        ${socialized.map(item => socializationCard(item, canEstablish ? "establish" : "view")).join("") || emptyBox("Belum ada SOP yang menunggu penetapan.")}
      </div>`;
    bindFilterControls(panel);
    panel.querySelectorAll("[data-skp-view-item]").forEach(button => button.onclick = () => itemDetailModal(state.items.find(item => item.id === button.dataset.skpViewItem)));
    panel.querySelectorAll("[data-skp-socialize-item]").forEach(button => button.onclick = () => socializationModal(state.items.find(item => item.id === button.dataset.skpSocializeItem)));
    panel.querySelectorAll("[data-skp-establish-item]").forEach(button => button.onclick = () => establishmentModal(state.items.find(item => item.id === button.dataset.skpEstablishItem)));
  }

  function socializationCard(item, action) {
    const project = projectOf(item);
    const info = item.sosialisasi || {};
    return `<article class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${esc(project?.nama_proyek || "Proyek SOP")} · ${esc(item.divisi || "-")}</p>
          <h3 class="font-bold text-slate-800">${esc(item.nama_proses || "Proses kerja")}</h3>
          <p class="text-[11px] text-slate-500">${esc(picLabel(item))} · Nilai analisa ${Number(item.analisa_hrd?.nilai || 0)} (${esc(item.analisa_hrd?.grade || "-")}) · ${esc(item.cabang === "MALANG" ? "Malang" : item.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")}</p>
        </div>
        <div class="flex items-center gap-2">${statusPill(item.status)}${branchPill(item.cabang)}</div>
      </div>
      ${action === "establish" && info.tanggal ? `<p class="mt-2 text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">Disosialisasikan ${esc(dateText(info.tanggal))} · ${esc(info.metode || "-")} · ${Number(info.peserta_count || 0)} peserta</p>` : ""}
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" data-skp-view-item="${esc(item.id)}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Lihat Detail</button>
        ${action === "socialize" ? `<button type="button" data-skp-socialize-item="${esc(item.id)}" class="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white">Sosialisasikan</button>` : ""}
        ${action === "establish" ? `<button type="button" data-skp-establish-item="${esc(item.id)}" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Tetapkan sebagai SOP</button>` : ""}
      </div>
    </article>`;
  }

  /* =================================================================
   * TAB SOP BERLAKU
   * =============================================================== */
  async function renderBerlakuTab() {
    const rows = state.items.filter(item => {
      if (String(item.status) !== "ESTABLISHED") return false;
      if (!matchesBranch(item.cabang)) return false;
      if (!state.search) return true;
      const haystack = `${item.nama_proses} ${item.divisi} ${item.penetapan?.nomor_sop} ${item.penetapan?.versi}`.toLowerCase();
      return haystack.includes(state.search.toLowerCase());
    });
    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">${filterChips()}
          <input id="skp-search" type="search" value="${esc(state.search)}" placeholder="Cari SOP / nomor / divisi…" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs w-64">
        </div>
        <p class="text-[11px] text-slate-400">SOP yang sudah ditetapkan sebagai dasar operasional perusahaan.</p>
      </div>
      <div class="grid md:grid-cols-2 gap-4">
        ${rows.map(item => `
          <article class="bg-white rounded-2xl border border-emerald-200 p-5 shadow-2xs">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-mono text-[10px] font-bold text-emerald-700">${esc(item.penetapan?.nomor_sop || "-")}</p>
                <h3 class="font-bold text-slate-800">${esc(item.nama_proses || "SOP")}</h3>
                <p class="text-[11px] text-slate-500">${esc(item.divisi || "-")} · Versi ${esc(item.penetapan?.versi || "1.0")} · Berlaku ${esc(dateText(item.penetapan?.tanggal_berlaku))}</p>
              </div>
              ${branchPill(item.cabang)}
            </div>
            <p class="mt-2 text-[11px] text-slate-500">${esc(item.tujuan || "-")}</p>
            <p class="mt-2 text-[10px] text-slate-400">Disosialisasikan ${esc(dateText(item.sosialisasi?.tanggal))} · ${Number(item.sosialisasi?.peserta_count || 0)} peserta · Penyetuju ${esc(item.penetapan?.penyetuju || "-")}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" data-skp-view-item="${esc(item.id)}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Lihat SOP</button>
              <button type="button" data-skp-print-item="${esc(item.id)}" class="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">Cetak Dokumen SOP</button>
            </div>
          </article>`).join("") || emptyBox("Belum ada SOP yang ditetapkan. Selesaikan verifikasi & sosialisasi terlebih dahulu.")}
      </div>`;
    bindFilterControls(panel);
    panel.querySelectorAll("[data-skp-view-item]").forEach(button => button.onclick = () => itemDetailModal(state.items.find(item => item.id === button.dataset.skpViewItem)));
    panel.querySelectorAll("[data-skp-print-item]").forEach(button => button.onclick = () => printSopItem(state.items.find(item => item.id === button.dataset.skpPrintItem)));
  }

  /* =================================================================
   * MODAL: PROYEK
   * =============================================================== */
  function projectModal(existing = null) {
    openModal({
      title: existing ? "Edit Proyek Audit SOP" : "Buat Proyek Audit SOP",
      size: "lg",
      bodyHtml: `
        <form id="skp-project-form" class="space-y-3">
          <label class="block text-xs font-semibold text-slate-600">Nama Proyek Audit *
            <input id="skp-project-name" required value="${esc(existing?.nama_proyek || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: Audit SOP Operasional 2026">
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Cabang
              <select id="skp-project-branch" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${["CIREBON", "MALANG", "SEMUA"].map(value => `<option value="${value}" ${((existing?.cabang || "SEMUA") === value) ? "selected" : ""}>${value === "SEMUA" ? "Semua Cabang (Cirebon & Malang)" : value === "CIREBON" ? "Cirebon" : "Malang"}</option>`).join("")}
              </select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Periode
              <input id="skp-project-period" value="${esc(existing?.periode || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: 2026 / Semester 2">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Koordinator
              <input id="skp-project-coordinator" value="${esc(existing?.koordinator || session.nama || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Status Proyek
              <select id="skp-project-status" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${PROJECT_STATUSES.map(status => `<option value="${status}" ${((existing?.status || "Berjalan") === status) ? "selected" : ""}>${status}</option>`).join("")}
              </select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Tanggal Mulai
              <input id="skp-project-start" type="date" value="${esc(existing?.tanggal_mulai || today())}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Target Selesai
              <input id="skp-project-target" type="date" value="${esc(existing?.target_selesai || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
          </div>
          <label class="block text-xs font-semibold text-slate-600">Catatan / Tujuan Proyek
            <textarea id="skp-project-note" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(existing?.catatan || "")}</textarea>
          </label>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" id="skp-project-cancel" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
            <button type="submit" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">${existing ? "Simpan Perubahan" : "Buat Proyek"}</button>
          </div>
        </form>`,
      onMount: backdrop => {
        const form = backdrop.querySelector("#skp-project-form");
        backdrop.querySelector("#skp-project-cancel")?.addEventListener("click", closeModal);
        form.onsubmit = async event => {
          event.preventDefault();
          const payload = {
            nama_proyek: form.querySelector("#skp-project-name").value.trim(),
            cabang: form.querySelector("#skp-project-branch").value,
            periode: form.querySelector("#skp-project-period").value.trim(),
            koordinator: form.querySelector("#skp-project-coordinator").value.trim(),
            status: form.querySelector("#skp-project-status").value,
            tanggal_mulai: form.querySelector("#skp-project-start").value,
            target_selesai: form.querySelector("#skp-project-target").value,
            catatan: form.querySelector("#skp-project-note").value.trim(),
            updated_at: new Date().toISOString(),
            updated_by: session.nama || session.username || ""
          };
          if (!payload.nama_proyek) return toast("Nama proyek wajib diisi.", "warning");
          try {
            if (existing) await fsUpdate(COL.SOP_PROJECTS, existing.id, payload);
            else await fsAdd(COL.SOP_PROJECTS, { ...payload, created_at: payload.updated_at, created_by: payload.updated_by }, genId("SOPPRJ"));
            closeModal();
            toast(existing ? "Proyek audit SOP diperbarui." : "Proyek audit SOP dibuat.", "success");
            await refreshAll();
          } catch (error) {
            console.error("save sop project", error);
            toast("Gagal menyimpan proyek: " + error.message, "error");
          }
        };
      }
    });
  }

  /* =================================================================
   * MODAL: PENUGASAN PROSES KERJA KE PIC
   * =============================================================== */
  function assignmentModal(project, existing = null) {
    const employeeOptions = state.employees.slice().sort((a, b) =>
      String(a.nama_karyawan || a.nama || "").localeCompare(String(b.nama_karyawan || b.nama || ""), "id")
    ).map(employee => {
      const nik = employee.nik_karyawan || employee.nik || "";
      const name = employee.nama_karyawan || employee.nama || employee.username || nik;
      return `<option value="${esc(nik)}" data-name="${esc(name)}" data-username="${esc(employee.username || "")}" data-email="${esc(employee.email || "")}" data-position="${esc(employee.jabatan || employee.posisi || "")}" data-division="${esc(employee.divisi || "")}" data-branch="${esc(employee.cabang || "")}" ${existing?.pic_nik === nik ? "selected" : ""}>${esc(name)} - ${esc(employee.jabatan || employee.posisi || "-")} (${esc(employee.cabang || "-")})</option>`;
    }).join("");

    openModal({
      title: existing ? "Edit Penugasan Proses Kerja" : "Tugaskan Proses Kerja ke PIC",
      size: "xl",
      bodyHtml: `
        <form id="skp-assign-form" class="space-y-3">
          <div class="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-800">PIC mengisi proses kerja yang berjalan saat ini. HRD dapat menunjuk <b>per divisi</b>, <b>per jabatan</b>, atau <b>karyawan tertentu</b>. Setelah diajukan, HRD memverifikasi efektivitas & efisiensinya.</div>
          <label class="block text-xs font-semibold text-slate-600">Nama Proses Kerja / SOP *
            <input id="skp-item-name" required value="${esc(existing?.nama_proses || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: Proses Penerimaan Barang dari Supplier">
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Divisi
              <select id="skp-item-division" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${state.divisions.map(division => `<option value="${esc(division)}" ${existing?.divisi === division ? "selected" : ""}>${esc(division)}</option>`).join("")}
              </select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Cabang
              <select id="skp-item-branch" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${["CIREBON", "MALANG", "SEMUA"].map(value => `<option value="${value}" ${((existing?.cabang || project.cabang || "SEMUA") === value) ? "selected" : ""}>${value === "SEMUA" ? "Semua Cabang" : value === "CIREBON" ? "Cirebon" : "Malang"}</option>`).join("")}
              </select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Tipe Penugasan
              <select id="skp-item-assign-type" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${ASSIGNMENT_TYPES.map(type => `<option value="${type.value}" ${((existing?.penugasan_tipe || "KARYAWAN") === type.value) ? "selected" : ""}>${esc(type.label)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="block text-xs font-semibold text-slate-600" id="skp-item-position-wrap">Jabatan (untuk penugasan per jabatan)
            <input id="skp-item-position" value="${esc(existing?.jabatan || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: Admin Gudang">
          </label>
          <label class="block text-xs font-semibold text-slate-600" id="skp-item-employee-wrap">PIC Karyawan (untuk penugasan karyawan tertentu)
            <select id="skp-item-employee" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
              <option value="">-- Pilih karyawan --</option>${employeeOptions}
            </select>
          </label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Nama PIC
              <input id="skp-item-pic-name" value="${esc(existing?.pic_nama || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">NIK PIC
              <input id="skp-item-pic-nik" value="${esc(existing?.pic_nik || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Username PIC
              <input id="skp-item-pic-username" value="${esc(existing?.pic_username || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Email PIC
              <input id="skp-item-pic-email" type="email" value="${esc(existing?.pic_email || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Batas Waktu Pengisian
              <input id="skp-item-deadline" type="date" value="${esc(existing?.deadline || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Catatan untuk PIC
              <input id="skp-item-note" value="${esc(existing?.catatan || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: Fokus pada proses yang paling sering dilakukan">
            </label>
          </div>
          <label class="block text-xs font-semibold text-slate-600">Tujuan Proses (boleh diisi HRD, PIC dapat melengkapi)
            <textarea id="skp-item-purpose" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(existing?.tujuan || "")}</textarea>
          </label>
          <label class="block text-xs font-semibold text-slate-600">Ruang Lingkup
            <textarea id="skp-item-scope" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(existing?.ruang_lingkup || "")}</textarea>
          </label>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" id="skp-assign-cancel" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
            <button type="submit" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">${existing ? "Simpan Penugasan" : "Buat Penugasan"}</button>
          </div>
        </form>`,
      onMount: backdrop => {
        const form = backdrop.querySelector("#skp-assign-form");
        const typeSelect = form.querySelector("#skp-item-assign-type");
        const positionWrap = form.querySelector("#skp-item-position-wrap");
        const employeeWrap = form.querySelector("#skp-item-employee-wrap");
        const syncType = () => {
          const type = typeSelect.value;
          positionWrap.classList.toggle("hidden", type !== "JABATAN");
          employeeWrap.classList.toggle("hidden", type !== "KARYAWAN");
        };
        syncType();
        typeSelect.addEventListener("change", syncType);
        form.querySelector("#skp-item-employee")?.addEventListener("change", event => {
          const option = event.target.selectedOptions[0];
          if (!option || !option.value) return;
          form.querySelector("#skp-item-pic-name").value = option.dataset.name || "";
          form.querySelector("#skp-item-pic-nik").value = option.value;
          form.querySelector("#skp-item-pic-username").value = option.dataset.username || "";
          form.querySelector("#skp-item-pic-email").value = option.dataset.email || "";
          const division = form.querySelector("#skp-item-division");
          if (option.dataset.division && [...division.options].some(entry => entry.value === option.dataset.division)) division.value = option.dataset.division;
          form.querySelector("#skp-item-position").value = option.dataset.position || "";
        });
        backdrop.querySelector("#skp-assign-cancel")?.addEventListener("click", closeModal);
        form.onsubmit = async event => {
          event.preventDefault();
          const name = form.querySelector("#skp-item-name").value.trim();
          if (!name) return toast("Nama proses kerja wajib diisi.", "warning");
          const payload = {
            project_id: project.id,
            nama_proses: name,
            divisi: form.querySelector("#skp-item-division").value,
            cabang: form.querySelector("#skp-item-branch").value,
            penugasan_tipe: typeSelect.value,
            jabatan: form.querySelector("#skp-item-position").value.trim(),
            pic_nama: form.querySelector("#skp-item-pic-name").value.trim(),
            pic_nik: form.querySelector("#skp-item-pic-nik").value.trim(),
            pic_username: form.querySelector("#skp-item-pic-username").value.trim(),
            pic_email: form.querySelector("#skp-item-pic-email").value.trim(),
            deadline: form.querySelector("#skp-item-deadline").value,
            catatan: form.querySelector("#skp-item-note").value.trim(),
            tujuan: form.querySelector("#skp-item-purpose").value.trim(),
            ruang_lingkup: form.querySelector("#skp-item-scope").value.trim(),
            status: existing?.status || "DRAFT",
            langkah: existing?.langkah || [],
            flow_komunikasi: existing?.flow_komunikasi || [],
            output: existing?.output || [],
            risiko: existing?.risiko || "",
            kontrol: existing?.kontrol || "",
            alat_bahan: existing?.alat_bahan || "",
            referensi: existing?.referensi || "",
            updated_at: new Date().toISOString(),
            updated_by: session.nama || session.username || ""
          };
          try {
            if (existing) await fsUpdate(COL.SOP_PROJECT_ITEMS, existing.id, payload);
            else await fsAdd(COL.SOP_PROJECT_ITEMS, { ...payload, created_at: payload.updated_at, created_by: payload.updated_by }, genId("SOPITM"));
            closeModal();
            toast(existing ? "Penugasan diperbarui." : "Proses kerja berhasil ditugaskan ke PIC.", "success");
            await refreshAll();
          } catch (error) {
            console.error("save sop assignment", error);
            toast("Gagal menyimpan penugasan: " + error.message, "error");
          }
        };
      }
    });
  }

  /* =================================================================
   * MODAL: PENGISIAN PROSES KERJA (PIC)
   * =============================================================== */
  function itemForm(item) {
    if (!item) return;
    if (!canFillItem(session, item, { isHrd: hrd })) return toast("Anda bukan PIC untuk proses kerja ini.", "warning");
    const lastRevision = Array.isArray(item.riwayat_revisi) && item.riwayat_revisi.length ? item.riwayat_revisi[item.riwayat_revisi.length - 1] : null;

    openModal({
      title: `Isi Proses Kerja - ${item.nama_proses || "SOP"}`,
      size: "xl",
      bodyHtml: `
        <form id="skp-item-form" class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
            <b>${esc(item.nama_proses || "-")}</b> · ${esc(item.divisi || "-")} · ${esc(picLabel(item))} · ${esc(item.cabang === "MALANG" ? "Malang" : item.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")}
          </div>
          ${item.status === "REVISION" && lastRevision ? `<div class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800"><b>Catatan revisi HRD (${esc(dateText(lastRevision.tanggal))}):</b> ${esc(lastRevision.catatan || "-")}<br>Nilai analisa: <b>${Number(lastRevision.nilai || 0)}</b> - ${esc(lastRevision.label || "")}</div>` : ""}

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Nama Proses Kerja *
              <input id="skp-form-name" required value="${esc(item.nama_proses || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Pemilik Proses / Pelaksana Utama
              <input id="skp-form-owner" value="${esc(item.pemilik_proses || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: Admin Gudang">
            </label>
          </div>
          <label class="block text-xs font-semibold text-slate-600">Tujuan Proses
            <textarea id="skp-form-purpose" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(item.tujuan || "")}</textarea>
          </label>
          <label class="block text-xs font-semibold text-slate-600">Ruang Lingkup
            <textarea id="skp-form-scope" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(item.ruang_lingkup || "")}</textarea>
          </label>

          <section class="rounded-xl border border-slate-200 p-3">
            <div class="flex items-center justify-between gap-2">
              <div><h3 class="text-xs font-black uppercase tracking-wide text-slate-700">Langkah Kerja</h3><p class="text-[10px] text-slate-400">Tuliskan urutan proses yang benar-benar dijalankan saat ini.</p></div>
              <button type="button" id="skp-add-step" class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">+ Langkah</button>
            </div>
            <div id="skp-step-list" class="mt-2 space-y-2"></div>
          </section>

          <section class="rounded-xl border border-slate-200 p-3">
            <div class="flex items-center justify-between gap-2">
              <div><h3 class="text-xs font-black uppercase tracking-wide text-slate-700">Flow Komunikasi</h3><p class="text-[10px] text-slate-400">Siapa berkomunikasi dengan siapa, melalui media apa, dan untuk tujuan apa.</p></div>
              <button type="button" id="skp-add-flow" class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">+ Flow</button>
            </div>
            <div id="skp-flow-list" class="mt-2 space-y-2"></div>
          </section>

          <section class="rounded-xl border border-slate-200 p-3">
            <div class="flex items-center justify-between gap-2">
              <div><h3 class="text-xs font-black uppercase tracking-wide text-slate-700">Output yang Dihasilkan</h3><p class="text-[10px] text-slate-400">Dokumen / data / hasil yang keluar dari proses ini.</p></div>
              <button type="button" id="skp-add-output" class="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">+ Output</button>
            </div>
            <div id="skp-output-list" class="mt-2 space-y-2"></div>
          </section>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Risiko / Kendala
              <textarea id="skp-form-risk" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(item.risiko || "")}</textarea>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Kontrol / Pencegahan
              <textarea id="skp-form-control" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(item.kontrol || "")}</textarea>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Alat / Bahan / Sistem
              <textarea id="skp-form-tools" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(item.alat_bahan || "")}</textarea>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Referensi / Dokumen Terkait
              <textarea id="skp-form-reference" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(item.referensi || "")}</textarea>
            </label>
          </div>

          <div class="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" id="skp-form-cancel" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
            <button type="button" id="skp-save-draft" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Simpan Draft</button>
            <button type="submit" class="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white">Ajukan Verifikasi HRD</button>
          </div>
        </form>`,
      onMount: backdrop => {
        const form = backdrop.querySelector("#skp-item-form");
        const stepList = form.querySelector("#skp-step-list");
        const flowList = form.querySelector("#skp-flow-list");
        const outputList = form.querySelector("#skp-output-list");

        const addStep = (step = {}) => {
          const row = document.createElement("div");
          row.className = "skp-step-row grid grid-cols-12 gap-2 items-start rounded-lg bg-slate-50 p-2";
          row.innerHTML = `
            <div class="col-span-4"><input class="step-activity w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Aktivitas / langkah" value="${esc(step.aktivitas || "")}"></div>
            <div class="col-span-2"><input class="step-actor w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Pelaksana" value="${esc(step.pelaksana || "")}"></div>
            <div class="col-span-2"><select class="step-type w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs bg-white"><option value="PROSES">Proses</option><option value="KEPUTUSAN">Keputusan</option><option value="DOKUMEN">Dokumen</option></select></div>
            <div class="col-span-2"><input class="step-sla w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Waktu / SLA" value="${esc(step.waktu || "")}"></div>
            <div class="col-span-2"><input class="step-output w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Output langkah" value="${esc(step.output || "")}"></div>
            <div class="col-span-12 flex justify-end"><button type="button" class="step-remove text-[11px] font-bold text-rose-600">Hapus langkah</button></div>`;
          row.querySelector(".step-type").value = ["PROSES", "KEPUTUSAN", "DOKUMEN"].includes(String(step.jenis || "").toUpperCase()) ? String(step.jenis).toUpperCase() : "PROSES";
          row.querySelector(".step-remove").onclick = () => row.remove();
          stepList.appendChild(row);
        };

        const addFlow = (flow = {}) => {
          const row = document.createElement("div");
          row.className = "skp-flow-row grid grid-cols-12 gap-2 items-start rounded-lg bg-slate-50 p-2";
          row.innerHTML = `
            <div class="col-span-3"><input class="flow-from w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Dari (pengirim)" value="${esc(flow.dari || "")}"></div>
            <div class="col-span-3"><input class="flow-to w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Ke (penerima)" value="${esc(flow.ke || "")}"></div>
            <div class="col-span-3"><input class="flow-media w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Media (WA/Email/Rapat)" value="${esc(flow.media || "")}"></div>
            <div class="col-span-2"><input class="flow-frequency w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Frekuensi" value="${esc(flow.frekuensi || "")}"></div>
            <div class="col-span-1 flex justify-end"><button type="button" class="flow-remove text-[11px] font-bold text-rose-600">X</button></div>
            <div class="col-span-12"><input class="flow-purpose w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Tujuan komunikasi / informasi yang disampaikan" value="${esc(flow.tujuan || "")}"></div>`;
          row.querySelector(".flow-remove").onclick = () => row.remove();
          flowList.appendChild(row);
        };

        const addOutput = (output = {}) => {
          const row = document.createElement("div");
          row.className = "skp-output-row grid grid-cols-12 gap-2 items-start rounded-lg bg-slate-50 p-2";
          row.innerHTML = `
            <div class="col-span-4"><input class="out-name w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Nama output" value="${esc(output.nama || "")}"></div>
            <div class="col-span-3"><input class="out-form w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Bentuk (dokumen/data)" value="${esc(output.bentuk || "")}"></div>
            <div class="col-span-3"><input class="out-recipient w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Penerima output" value="${esc(output.penerima || "")}"></div>
            <div class="col-span-2 flex gap-1"><input class="out-frequency w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs" placeholder="Frekuensi" value="${esc(output.frekuensi || "")}"><button type="button" class="out-remove text-[11px] font-bold text-rose-600">X</button></div>`;
          row.querySelector(".out-remove").onclick = () => row.remove();
          outputList.appendChild(row);
        };

        const existingSteps = normalizeWorkSteps(item.langkah);
        const existingFlows = normalizeCommunicationFlow(item.flow_komunikasi);
        const existingOutputs = normalizeOutputs(item.output);
        (existingSteps.length ? existingSteps : [{}]).forEach(addStep);
        (existingFlows.length ? existingFlows : [{}]).forEach(addFlow);
        (existingOutputs.length ? existingOutputs : [{}]).forEach(addOutput);

        form.querySelector("#skp-add-step").onclick = () => addStep({});
        form.querySelector("#skp-add-flow").onclick = () => addFlow({});
        form.querySelector("#skp-add-output").onclick = () => addOutput({});
        backdrop.querySelector("#skp-form-cancel")?.addEventListener("click", closeModal);

        const collect = () => ({
          nama_proses: form.querySelector("#skp-form-name").value.trim(),
          pemilik_proses: form.querySelector("#skp-form-owner").value.trim(),
          tujuan: form.querySelector("#skp-form-purpose").value.trim(),
          ruang_lingkup: form.querySelector("#skp-form-scope").value.trim(),
          langkah: Array.from(form.querySelectorAll(".skp-step-row")).map((row, index) => ({
            urutan: index + 1,
            aktivitas: row.querySelector(".step-activity").value.trim(),
            pelaksana: row.querySelector(".step-actor").value.trim(),
            jenis: row.querySelector(".step-type").value,
            waktu: row.querySelector(".step-sla").value.trim(),
            output: row.querySelector(".step-output").value.trim()
          })).filter(row => row.aktivitas),
          flow_komunikasi: Array.from(form.querySelectorAll(".skp-flow-row")).map(row => ({
            dari: row.querySelector(".flow-from").value.trim(),
            ke: row.querySelector(".flow-to").value.trim(),
            media: row.querySelector(".flow-media").value.trim(),
            frekuensi: row.querySelector(".flow-frequency").value.trim(),
            tujuan: row.querySelector(".flow-purpose").value.trim()
          })).filter(row => row.dari || row.ke || row.media || row.tujuan),
          output: Array.from(form.querySelectorAll(".skp-output-row")).map(row => ({
            nama: row.querySelector(".out-name").value.trim(),
            bentuk: row.querySelector(".out-form").value.trim(),
            penerima: row.querySelector(".out-recipient").value.trim(),
            frekuensi: row.querySelector(".out-frequency").value.trim()
          })).filter(row => row.nama || row.bentuk || row.penerima),
          risiko: form.querySelector("#skp-form-risk").value.trim(),
          kontrol: form.querySelector("#skp-form-control").value.trim(),
          alat_bahan: form.querySelector("#skp-form-tools").value.trim(),
          referensi: form.querySelector("#skp-form-reference").value.trim()
        });

        const save = async (submit = false) => {
          const payload = collect();
          if (!payload.nama_proses) return toast("Nama proses kerja wajib diisi.", "warning");
          if (!payload.langkah.length) return toast("Minimal 1 langkah kerja harus diisi.", "warning");
          if (submit && !payload.flow_komunikasi.length) return toast("Minimal 1 flow komunikasi harus diisi sebelum diajukan.", "warning");
          if (submit && !payload.output.length) return toast("Minimal 1 output proses harus diisi sebelum diajukan.", "warning");
          payload.updated_at = new Date().toISOString();
          payload.updated_by = session.nama || session.username || "";
          if (submit) {
            payload.status = nextStatus(item.status, "submit") || "SUBMITTED";
            payload.submitted_at = new Date().toISOString();
            payload.submitted_by = payload.updated_by;
          }
          try {
            await fsUpdate(COL.SOP_PROJECT_ITEMS, item.id, payload);
            closeModal();
            toast(submit ? "Proses kerja diajukan ke HRD untuk verifikasi." : "Draft proses kerja disimpan.", "success");
            await refreshAll();
          } catch (error) {
            console.error("save sop item form", error);
            toast("Gagal menyimpan proses kerja: " + error.message, "error");
          }
        };

        backdrop.querySelector("#skp-save-draft").onclick = () => save(false);
        form.onsubmit = event => { event.preventDefault(); save(true); };
      }
    });
  }

  async function submitItem(item) {
    if (!item) return;
    if (!canFillItem(session, item, { isHrd: hrd })) return toast("Anda bukan PIC untuk proses kerja ini.", "warning");
    if (!normalizeWorkSteps(item.langkah).length || !normalizeCommunicationFlow(item.flow_komunikasi).length || !normalizeOutputs(item.output).length) {
      toast("Lengkapi langkah kerja, flow komunikasi, dan output sebelum mengajukan verifikasi.", "warning");
      return itemForm(item);
    }
    const confirmed = await confirmDialog(`Ajukan proses kerja "${item.nama_proses}" ke HRD untuk verifikasi? Pastikan langkah, flow komunikasi, dan output sudah lengkap.`, { title: "Ajukan Verifikasi", danger: false });
    if (!confirmed) return;
    try {
      await fsUpdate(COL.SOP_PROJECT_ITEMS, item.id, {
        status: nextStatus(item.status, "submit") || "SUBMITTED",
        submitted_at: new Date().toISOString(),
        submitted_by: session.nama || session.username || "",
        updated_at: new Date().toISOString(),
        updated_by: session.nama || session.username || ""
      });
      toast("Proses kerja diajukan ke HRD.", "success");
      await refreshAll();
    } catch (error) {
      console.error("submit sop item", error);
      toast("Gagal mengajukan proses kerja: " + error.message, "error");
    }
  }

  /* =================================================================
   * MODAL: VERIFIKASI & ANALISA HRD
   * =============================================================== */
  function verifyModal(item) {
    if (!item) return;
    if (!canVerify) return toast("Hanya HRD / user dengan izin verifikasi yang dapat memverifikasi SOP.", "warning");
    const analysis = item.analisa_hrd || {};
    openModal({
      title: `Verifikasi & Analisa - ${item.nama_proses || "SOP"}`,
      size: "xl",
      bodyHtml: `
        <form id="skp-verify-form" class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
            <b>${esc(item.nama_proses || "-")}</b> · ${esc(item.divisi || "-")} · ${esc(picLabel(item))} · ${esc(item.cabang === "MALANG" ? "Malang" : item.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")}<br>
            ${normalizeWorkSteps(item.langkah).length} langkah · ${normalizeCommunicationFlow(item.flow_komunikasi).length} flow komunikasi · ${normalizeOutputs(item.output).length} output · diajukan ${esc(dateText(item.submitted_at))}
          </div>
          ${normalizeOutputs(item.output).length ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800"><b>Output proses:</b> ${normalizeOutputs(item.output).map(output => esc(output.nama || output.bentuk || "-")).join(", ")}</div>` : ""}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Skor Efektivitas (1-5)
              <select id="skp-verify-effect" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${[5, 4, 3, 2, 1].map(value => `<option value="${value}" ${(Number(analysis.efektivitas || 3) === value) ? "selected" : ""}>${value} - ${["", "Tidak efektif", "Kurang efektif", "Cukup efektif", "Efektif", "Sangat efektif"][value]}</option>`).join("")}
              </select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Skor Efisiensi (1-5)
              <select id="skp-verify-efficiency" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${[5, 4, 3, 2, 1].map(value => `<option value="${value}" ${(Number(analysis.efisiensi || 3) === value) ? "selected" : ""}>${value} - ${["", "Tidak efisien", "Kurang efisien", "Cukup efisien", "Efisien", "Sangat efisien"][value]}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">Nilai analisa: <span id="skp-verify-value">${computeAnalysisValue(analysis.efektivitas || 3, analysis.efisiensi || 3)}</span> / 100</div>
          <label class="block text-xs font-semibold text-slate-600">Analisa HRD (efektivitas & efisiensi proses saat ini)
            <textarea id="skp-verify-analysis" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Contoh: langkah sudah jelas, namun belum ada kontrol verifikasi stok sehingga berisiko selisih.">${esc(analysis.analisa || "")}</textarea>
          </label>
          <label class="block text-xs font-semibold text-slate-600">Rekomendasi Perbaikan
            <textarea id="skp-verify-recommendation" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Contoh: tambahkan checklist verifikasi dan PIC penanggung jawab di setiap langkah.">${esc(analysis.rekomendasi || "")}</textarea>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Keputusan
              <select id="skp-verify-decision" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                <option value="EFEKTIF" ${analysis.keputusan === "EFEKTIF" ? "selected" : ""}>Sudah Efektif & Efisien - Setujui</option>
                <option value="REVISI" ${analysis.keputusan === "REVISI" ? "selected" : ""}>Belum Efektif / Efisien - Minta Revisi</option>
              </select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Catatan untuk PIC (wajib bila meminta revisi)
              <input id="skp-verify-revision-note" value="${esc(analysis.catatan_revisi || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Bagian mana yang harus diperbaiki?">
            </label>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" id="skp-verify-cancel" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
            <button type="submit" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-bold text-white">Simpan Hasil Verifikasi</button>
          </div>
        </form>`,
      onMount: backdrop => {
        const form = backdrop.querySelector("#skp-verify-form");
        const effect = form.querySelector("#skp-verify-effect");
        const efficiency = form.querySelector("#skp-verify-efficiency");
        const valueEl = form.querySelector("#skp-verify-value");
        const syncValue = () => { valueEl.textContent = String(computeAnalysisValue(effect.value, efficiency.value)); };
        effect.addEventListener("change", syncValue);
        efficiency.addEventListener("change", syncValue);
        backdrop.querySelector("#skp-verify-cancel")?.addEventListener("click", closeModal);
        form.onsubmit = async event => {
          event.preventDefault();
          const effectiveness = Number(effect.value);
          const efficiencyScore = Number(efficiency.value);
          const value = computeAnalysisValue(effectiveness, efficiencyScore);
          const decision = form.querySelector("#skp-verify-decision").value;
          const revisionNote = form.querySelector("#skp-verify-revision-note").value.trim();
          const analysisText = form.querySelector("#skp-verify-analysis").value.trim();
          if (decision === "REVISI" && !revisionNote) return toast("Catatan revisi wajib diisi agar PIC mengetahui bagian yang harus diperbaiki.", "warning");
          const now = new Date().toISOString();
          const grade = analysisGrade(value);
          const payload = {
            status: nextStatus(item.status, decision === "EFEKTIF" ? "verify" : "revise") || (decision === "EFEKTIF" ? "VERIFIED" : "REVISION"),
            analisa_hrd: {
              efektivitas: effectiveness,
              efisiensi: efficiencyScore,
              nilai: value,
              grade: grade.grade,
              label: grade.label,
              analisa: analysisText,
              rekomendasi: form.querySelector("#skp-verify-recommendation").value.trim(),
              keputusan: decision,
              catatan_revisi: revisionNote,
              verified_by: session.nama || session.username || "HRD",
              verified_at: now
            },
            updated_at: now,
            updated_by: session.nama || session.username || "HRD"
          };
          if (decision === "REVISI") {
            payload.riwayat_revisi = [...(Array.isArray(item.riwayat_revisi) ? item.riwayat_revisi : []), {
              tanggal: now,
              oleh: session.nama || session.username || "HRD",
              catatan: revisionNote || analysisText,
              nilai: value,
              label: grade.label
            }];
          }
          try {
            await fsUpdate(COL.SOP_PROJECT_ITEMS, item.id, payload);
            closeModal();
            toast(decision === "EFEKTIF" ? "SOP dinyatakan efektif & efisien. Lanjutkan sosialisasi." : "SOP dikembalikan ke PIC untuk revisi.", "success");
            try {
              const target = item.pic_username || item.pic_email || item.pic_nik;
              if (target) await notifyUser({ username: item.pic_username || target, nama: item.pic_nama || target, email: item.pic_email, nik: item.pic_nik }, decision === "EFEKTIF" ? "SOP disetujui HRD" : "SOP perlu revisi", decision === "EFEKTIF" ? `Proses kerja "${item.nama_proses}" telah diverifikasi efektif & efisien. Siap disosialisasikan.` : `Proses kerja "${item.nama_proses}" perlu revisi: ${revisionNote}`, "#sop-proyek", { manual: true });
            } catch (notifyError) { console.warn("notify PIC failed", notifyError); }
            await refreshAll();
          } catch (error) {
            console.error("verify sop item", error);
            toast("Gagal menyimpan verifikasi: " + error.message, "error");
          }
        };
      }
    });
  }

  /* =================================================================
   * MODAL: SOSIALISASI
   * =============================================================== */
  function socializationRecipients(item, target) {
    return state.employees.filter(employee => {
      if (target === "SEMUA") return true;
      if (target === "CABANG") return !item.cabang || item.cabang === "SEMUA" || normalize(employee.cabang) === normalize(item.cabang);
      if (target === "DIVISI") return normalize(employee.divisi) === normalize(item.divisi);
      if (target === "JABATAN") return normalize(employee.jabatan || employee.posisi) === normalize(item.jabatan);
      return false;
    });
  }

  function socializationModal(item) {
    if (!item) return;
    if (!canSocialize) return toast("Hanya HRD / user dengan izin sosialisasi yang dapat mensosialisasikan SOP.", "warning");
    openModal({
      title: `Sosialisasi SOP - ${item.nama_proses || "SOP"}`,
      size: "lg",
      bodyHtml: `
        <form id="skp-social-form" class="space-y-3">
          <div class="rounded-xl border border-violet-200 bg-violet-50 p-3 text-[11px] text-violet-800">Sosialisasikan SOP yang sudah dinyatakan efektif & efisien kepada karyawan. Sosialisasi dapat mengirim notifikasi & email otomatis.</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Tanggal Sosialisasi
              <input id="skp-social-date" type="date" value="${today()}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Metode
              <select id="skp-social-method" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">${SOCIALIZATION_METHODS.map(method => `<option value="${esc(method)}">${esc(method)}</option>`).join("")}</select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Target Peserta
              <select id="skp-social-target" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">${SOCIALIZATION_TARGETS.map(target => `<option value="${target.value}">${esc(target.label)}</option>`).join("")}</select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Link Bukti / Dokumentasi
              <input id="skp-social-evidence" type="url" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Google Drive / foto / daftar hadir">
            </label>
          </div>
          <label class="block text-xs font-semibold text-slate-600">Catatan Sosialisasi
            <textarea id="skp-social-note" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Ringkasan materi yang disampaikan, pertanyaan peserta, komitmen penerapan."></textarea>
          </label>
          <label class="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <input id="skp-social-notify" type="checkbox" checked class="mt-0.5 rounded border-slate-300">
            <span>Kirim notifikasi & email ke karyawan sesuai target (melalui sistem).</span>
          </label>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" id="skp-social-cancel" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
            <button type="submit" class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white">Simpan Sosialisasi</button>
          </div>
        </form>`,
      onMount: backdrop => {
        const form = backdrop.querySelector("#skp-social-form");
        backdrop.querySelector("#skp-social-cancel")?.addEventListener("click", closeModal);
        form.onsubmit = async event => {
          event.preventDefault();
          const target = form.querySelector("#skp-social-target").value;
          const date = form.querySelector("#skp-social-date").value || today();
          const method = form.querySelector("#skp-social-method").value;
          const recipients = socializationRecipients(item, target);
          const submitButton = form.querySelector('button[type="submit"]');
          submitButton.disabled = true;
          submitButton.textContent = "Menyimpan…";
          const payload = {
            status: nextStatus(item.status, "socialize") || "SOCIALIZED",
            sosialisasi: {
              tanggal: date,
              metode: method,
              target,
              peserta_count: recipients.length,
              bukti_url: form.querySelector("#skp-social-evidence").value.trim(),
              catatan: form.querySelector("#skp-social-note").value.trim(),
              by: session.nama || session.username || "HRD",
              at: new Date().toISOString()
            },
            updated_at: new Date().toISOString(),
            updated_by: session.nama || session.username || "HRD"
          };
          try {
            await fsUpdate(COL.SOP_PROJECT_ITEMS, item.id, payload);
            let sent = 0;
            if (form.querySelector("#skp-social-notify").checked) {
              submitButton.textContent = "Mengirim notifikasi…";
              for (const employee of recipients.slice(0, 150)) {
                try {
                  const ok = await notifyUser(employeeTarget(employee), "Sosialisasi SOP Baru", `SOP "${item.nama_proses}" telah disosialisasikan pada ${dateText(date)}. Silakan buka menu Audit SOP > SOP Berlaku untuk membaca SOP ini.`, "#sop-proyek", { manual: true, sendEmail: true });
                  if (ok) sent += 1;
                } catch (notifyError) { console.warn("notify socialization failed", notifyError); }
              }
            }
            closeModal();
            toast(`Sosialisasi tersimpan. ${sent ? `${sent} notifikasi terkirim.` : "Notifikasi tidak dikirim."}`, "success");
            await refreshAll();
          } catch (error) {
            console.error("socialize sop", error);
            toast("Gagal menyimpan sosialisasi: " + error.message, "error");
            submitButton.disabled = false;
            submitButton.textContent = "Simpan Sosialisasi";
          }
        };
      }
    });
  }

  /* =================================================================
   * MODAL: PENETAPAN SOP
   * =============================================================== */
  function establishmentModal(item) {
    if (!item) return;
    if (!canEstablish) return toast("Hanya HRD / user dengan izin penetapan yang dapat menetapkan SOP.", "warning");
    const year = new Date().getFullYear();
    const sequence = state.items.filter(entry => String(entry.status) === "ESTABLISHED" && entry.divisi === item.divisi).length + 1;
    const suggestedNumber = item.penetapan?.nomor_sop || autoSopNumber({ divisi: item.divisi, urut: sequence, tahun: year });
    const nextYear = new Date(new Date().setFullYear(year + 1)).toISOString().slice(0, 10);

    openModal({
      title: `Tetapkan SOP - ${item.nama_proses || "SOP"}`,
      size: "lg",
      bodyHtml: `
        <form id="skp-establish-form" class="space-y-3">
          <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800">Penetapan akan membuat SOP aktif di <b>Database SOP</b> dan menjadi dasar operasional perusahaan. Flow komunikasi & output dari proses ini ikut tercatat.</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-semibold text-slate-600">Nomor SOP
              <input id="skp-establish-number" value="${esc(suggestedNumber)}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Versi
              <input id="skp-establish-version" value="${esc(item.penetapan?.versi || "1.0")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Tanggal Berlaku
              <input id="skp-establish-effective" type="date" value="${esc(item.penetapan?.tanggal_berlaku || today())}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Review Berikutnya
              <input id="skp-establish-review" type="date" value="${esc(item.penetapan?.tanggal_review || nextYear)}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
            <label class="block text-xs font-semibold text-slate-600">Kategori SOP
              <select id="skp-establish-category" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">
                ${["Prosedur Operasional", "Prosedur SDM", "Prosedur Keuangan", "Prosedur Sales & Marketing", "Prosedur Gudang & Logistik", "Prosedur K3", "Prosedur Sistem Informasi", "Lainnya"].map(category => `<option value="${category}" ${((item.penetapan?.kategori || "Prosedur Operasional") === category) ? "selected" : ""}>${category}</option>`).join("")}
              </select>
            </label>
            <label class="block text-xs font-semibold text-slate-600">Disetujui Oleh
              <input id="skp-establish-approver" value="${esc(item.penetapan?.penyetuju || session.nama || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            </label>
          </div>
          <label class="block text-xs font-semibold text-slate-600">Dasar Penetapan
            <textarea id="skp-establish-basis" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">${esc(item.penetapan?.dasar || "Peraturan Perusahaan & kebutuhan standarisasi operasional CV Andela Jaya.")}</textarea>
          </label>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" id="skp-establish-cancel" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
            <button type="submit" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Tetapkan & Aktifkan SOP</button>
          </div>
        </form>`,
      onMount: backdrop => {
        const form = backdrop.querySelector("#skp-establish-form");
        backdrop.querySelector("#skp-establish-cancel")?.addEventListener("click", closeModal);
        form.onsubmit = async event => {
          event.preventDefault();
          const button = form.querySelector('button[type="submit"]');
          button.disabled = true;
          button.textContent = "Menetapkan…";
          const nomor = form.querySelector("#skp-establish-number").value.trim();
          const versi = form.querySelector("#skp-establish-version").value.trim() || "1.0";
          const effective = form.querySelector("#skp-establish-effective").value;
          const review = form.querySelector("#skp-establish-review").value;
          const approver = form.querySelector("#skp-establish-approver").value.trim();
          const category = form.querySelector("#skp-establish-category").value;
          if (!nomor) { button.disabled = false; button.textContent = "Tetapkan & Aktifkan SOP"; return toast("Nomor SOP wajib diisi.", "warning"); }
          try {
            let sopDocumentId = item.sop_document_id || "";
            const documentPayload = buildSopDocument(item, {
              nomor_dokumen: nomor,
              versi,
              tanggal_terbit: effective,
              tanggal_review: review,
              penyetuju: approver,
              kategori: category
            });
            if (sopDocumentId) {
              await fsUpdate(COL.SOP_DOKUMEN, sopDocumentId, documentPayload);
            } else {
              sopDocumentId = genId("SOP");
              await fsAdd(COL.SOP_DOKUMEN, documentPayload, sopDocumentId);
            }
            await fsUpdate(COL.SOP_PROJECT_ITEMS, item.id, {
              status: nextStatus(item.status, "establish") || "ESTABLISHED",
              penetapan: {
                nomor_sop: nomor,
                versi,
                tanggal_berlaku: effective,
                tanggal_review: review,
                kategori: category,
                penyetuju: approver,
                dasar: form.querySelector("#skp-establish-basis").value.trim(),
                sop_document_id: sopDocumentId,
                established_by: session.nama || session.username || "HRD",
                established_at: new Date().toISOString()
              },
              sop_document_id: sopDocumentId,
              updated_at: new Date().toISOString(),
              updated_by: session.nama || session.username || "HRD"
            });
            closeModal();
            toast("SOP berhasil ditetapkan dan kini aktif di Database SOP.", "success");
            await refreshAll();
          } catch (error) {
            console.error("establish sop", error);
            toast("Gagal menetapkan SOP: " + error.message, "error");
            button.disabled = false;
            button.textContent = "Tetapkan & Aktifkan SOP";
          }
        };
      }
    });
  }

  /* =================================================================
   * DETAIL & CETAK
   * =============================================================== */
  function timelineHtml(item) {
    const order = ["DRAFT", "SUBMITTED", "REVISION", "VERIFIED", "SOCIALIZED", "ESTABLISHED"];
    const currentIndex = Math.max(0, order.indexOf(String(item.status || "DRAFT").toUpperCase()));
    return `<div class="flex flex-wrap gap-2">${order.map((status, index) => {
      const done = index <= currentIndex && !(item.status === "REVISION" && status === "SUBMITTED");
      return `<span class="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${done ? "border-maroon-200 bg-maroon-50 text-maroon-700" : "border-slate-200 bg-white text-slate-400"}">${index + 1}. ${esc(statusMeta(status).label)}</span>`;
    }).join("")}</div>`;
  }

  function itemDetailModal(item) {
    if (!item) return;
    const steps = normalizeWorkSteps(item.langkah);
    const flows = normalizeCommunicationFlow(item.flow_komunikasi);
    const outputs = normalizeOutputs(item.output);
    const analysis = item.analisa_hrd || {};
    const socialization = item.sosialisasi || {};
    const establishment = item.penetapan || {};
    const project = projectOf(item);

    openModal({
      title: `Detail Proses Kerja - ${item.nama_proses || "SOP"}`,
      size: "xl",
      bodyHtml: `
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${esc(project?.nama_proyek || "Proyek SOP")} · ${esc(item.divisi || "-")} · ${esc(picLabel(item))}</p>
              <h2 class="text-lg font-black text-slate-800">${esc(item.nama_proses || "-")}</h2>
              <p class="text-[11px] text-slate-500">${esc(item.cabang === "MALANG" ? "Malang" : item.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")} · Deadline ${esc(dateText(item.deadline))}</p>
            </div>
            <div class="flex items-center gap-2">${statusPill(item.status)}${branchPill(item.cabang)}</div>
          </div>
          ${timelineHtml(item)}
          ${item.tujuan ? `<div class="rounded-xl border border-slate-200 p-3 text-xs text-slate-600"><b>Tujuan:</b> ${esc(item.tujuan)}${item.ruang_lingkup ? `<br><b>Ruang lingkup:</b> ${esc(item.ruang_lingkup)}` : ""}</div>` : ""}
          <section>
            <h3 class="text-xs font-black uppercase tracking-wide text-slate-700 mb-2">Langkah Kerja (${steps.length})</h3>
            ${steps.length ? `<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full text-xs"><thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th class="px-2 py-2 text-left">No</th><th class="px-2 py-2 text-left">Aktivitas</th><th class="px-2 py-2 text-left">Pelaksana</th><th class="px-2 py-2 text-left">Waktu</th><th class="px-2 py-2 text-left">Output</th></tr></thead><tbody>${steps.map((step, index) => `<tr class="border-t border-slate-100"><td class="px-2 py-2">${index + 1}</td><td class="px-2 py-2">${esc(step.aktivitas)}</td><td class="px-2 py-2">${esc(step.pelaksana || "-")}</td><td class="px-2 py-2">${esc(step.waktu || "-")}</td><td class="px-2 py-2">${esc(step.output || "-")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="text-xs text-slate-400">Belum ada langkah kerja.</p>`}
          </section>
          <div class="grid md:grid-cols-2 gap-3">
            <section>
              <h3 class="text-xs font-black uppercase tracking-wide text-slate-700 mb-2">Flow Komunikasi (${flows.length})</h3>
              ${flows.length ? `<div class="space-y-1.5">${flows.map(flow => `<div class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]"><b>${esc(flow.dari || "-")}</b> → <b>${esc(flow.ke || "-")}</b> · ${esc(flow.media || "-")} · ${esc(flow.frekuensi || "-")}${flow.tujuan ? `<br><span class="text-slate-500">${esc(flow.tujuan)}</span>` : ""}</div>`).join("")}</div>` : `<p class="text-xs text-slate-400">Belum ada flow komunikasi.</p>`}
            </section>
            <section>
              <h3 class="text-xs font-black uppercase tracking-wide text-slate-700 mb-2">Output Proses (${outputs.length})</h3>
              ${outputs.length ? `<div class="space-y-1.5">${outputs.map(output => `<div class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]"><b>${esc(output.nama || "-")}</b> · ${esc(output.bentuk || "-")}${output.penerima ? ` · penerima: ${esc(output.penerima)}` : ""}${output.frekuensi ? ` · ${esc(output.frekuensi)}` : ""}</div>`).join("")}</div>` : `<p class="text-xs text-slate-400">Belum ada output.</p>`}
            </section>
          </div>
          ${item.risiko || item.kontrol || item.alat_bahan || item.referensi ? `<div class="rounded-xl border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">${item.risiko ? `<p><b>Risiko:</b> ${esc(item.risiko)}</p>` : ""}${item.kontrol ? `<p><b>Kontrol:</b> ${esc(item.kontrol)}</p>` : ""}${item.alat_bahan ? `<p><b>Alat/Bahan:</b> ${esc(item.alat_bahan)}</p>` : ""}${item.referensi ? `<p><b>Referensi:</b> ${esc(item.referensi)}</p>` : ""}</div>` : ""}
          ${analysis.nilai ? `<div class="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900"><b>Analisa HRD:</b> nilai ${Number(analysis.nilai)} (${esc(analysis.grade || "-")}) - ${esc(analysis.label || "")}<br>${esc(analysis.analisa || "-")}${analysis.rekomendasi ? `<br><b>Rekomendasi:</b> ${esc(analysis.rekomendasi)}` : ""}${analysis.catatan_revisi ? `<br><b>Catatan revisi:</b> ${esc(analysis.catatan_revisi)}` : ""}</div>` : ""}
          ${socialization.tanggal ? `<div class="rounded-xl border border-violet-200 bg-violet-50 p-3 text-[11px] text-violet-900"><b>Sosialisasi:</b> ${esc(dateText(socialization.tanggal))} · ${esc(socialization.metode || "-")} · ${Number(socialization.peserta_count || 0)} peserta${socialization.bukti_url ? ` · <a href="${esc(socialization.bukti_url)}" target="_blank" rel="noopener" class="underline">bukti</a>` : ""}${socialization.catatan ? `<br>${esc(socialization.catatan)}` : ""}</div>` : ""}
          ${establishment.nomor_sop ? `<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-900"><b>SOP Ditetapkan:</b> ${esc(establishment.nomor_sop)} · versi ${esc(establishment.versi || "1.0")} · berlaku ${esc(dateText(establishment.tanggal_berlaku))} · disetujui ${esc(establishment.penyetuju || "-")}${establishment.dasar ? `<br><b>Dasar:</b> ${esc(establishment.dasar)}` : ""}</div>` : ""}
          ${Array.isArray(item.riwayat_revisi) && item.riwayat_revisi.length ? `<div class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800"><b>Riwayat Revisi:</b><ul class="list-disc pl-4 mt-1 space-y-0.5">${item.riwayat_revisi.map(revision => `<li>${esc(dateText(revision.tanggal))} - ${esc(revision.oleh || "-")}: ${esc(revision.catatan || "-")}</li>`).join("")}</ul></div>` : ""}
          <div class="flex flex-wrap justify-end gap-2 pt-1">
            ${canFillItem(session, item, { isHrd: hrd }) && ["DRAFT", "REVISION"].includes(String(item.status)) ? `<button type="button" id="skp-detail-fill" class="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">Isi / Revisi Proses Kerja</button>` : ""}
            ${canVerify && String(item.status) === "SUBMITTED" ? `<button type="button" id="skp-detail-verify" class="rounded-lg bg-maroon-700 px-4 py-2 text-xs font-bold text-white">Verifikasi & Analisa</button>` : ""}
            ${canSocialize && String(item.status) === "VERIFIED" ? `<button type="button" id="skp-detail-socialize" class="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white">Sosialisasikan</button>` : ""}
            ${canEstablish && String(item.status) === "SOCIALIZED" ? `<button type="button" id="skp-detail-establish" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Tetapkan SOP</button>` : ""}
            <button type="button" id="skp-detail-print" class="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white">Cetak Dokumen SOP</button>
          </div>
        </div>`,
      onMount: backdrop => {
        backdrop.querySelector("#skp-detail-fill")?.addEventListener("click", () => { closeModal(); itemForm(item); });
        backdrop.querySelector("#skp-detail-verify")?.addEventListener("click", () => { closeModal(); verifyModal(item); });
        backdrop.querySelector("#skp-detail-socialize")?.addEventListener("click", () => { closeModal(); socializationModal(item); });
        backdrop.querySelector("#skp-detail-establish")?.addEventListener("click", () => { closeModal(); establishmentModal(item); });
        backdrop.querySelector("#skp-detail-print")?.addEventListener("click", () => { closeModal(); printSopItem(item); });
      }
    });
  }

  function printSopItem(item) {
    if (!item) return;
    const steps = normalizeWorkSteps(item.langkah);
    const flows = normalizeCommunicationFlow(item.flow_komunikasi);
    const outputs = normalizeOutputs(item.output);
    const analysis = item.analisa_hrd || {};
    const establishment = item.penetapan || {};
    const socialization = item.sosialisasi || {};

    const docHtml = `
      <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:1.4; color:#000; background:#fff; box-sizing:border-box;">
        <div style="page-break-inside:avoid; margin-bottom:6px;">${isoDocHeaderTable({ judul: "STANDAR OPERASIONAL PROSEDUR (SOP)", noDok: "SOP-PROYEK-01", terbitRevisi: "1/0", hal: "1 dari 1" })}</div>
        <div style="text-align:center; font-weight:bold; font-size:13px; margin:6px 0 2px;">STANDAR OPERASIONAL PROSEDUR</div>
        <div style="text-align:center; font-size:10px; margin-bottom:8px;">${esc(establishment.nomor_sop || item.nama_proses || "-")}</div>
        <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:10px; margin-bottom:8px;">
          <colgroup><col style="width:22%;"><col style="width:28%;"><col style="width:22%;"><col style="width:28%;"></colgroup>
          <tr><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Nama Proses</td><td style="border:1px solid #000; padding:3px 5px; font-weight:bold;">${esc(item.nama_proses || "-")}</td><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Divisi / Cabang</td><td style="border:1px solid #000; padding:3px 5px;">${esc(item.divisi || "-")} / ${esc(item.cabang === "MALANG" ? "Malang" : item.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")}</td></tr>
          <tr><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">PIC Penyusun</td><td style="border:1px solid #000; padding:3px 5px;">${esc(picLabel(item))}</td><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Versi / Berlaku</td><td style="border:1px solid #000; padding:3px 5px;">${esc(establishment.versi || "-")} / ${esc(dateText(establishment.tanggal_berlaku))}</td></tr>
          <tr><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Disetujui Oleh</td><td style="border:1px solid #000; padding:3px 5px;">${esc(establishment.penyetuju || "-")}</td><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Status</td><td style="border:1px solid #000; padding:3px 5px; font-weight:bold;">${esc(statusMeta(item.status).label)}</td></tr>
        </table>
        ${item.tujuan ? `<p style="margin:0 0 4px;"><b>Tujuan:</b> ${esc(item.tujuan)}</p>` : ""}
        ${item.ruang_lingkup ? `<p style="margin:0 0 6px;"><b>Ruang Lingkup:</b> ${esc(item.ruang_lingkup)}</p>` : ""}
        <div style="font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin:8px 0 4px;">A. Langkah Kerja</div>
        <table style="width:100%; border-collapse:collapse; font-size:9px;">
          <colgroup><col style="width:5%;"><col style="width:38%;"><col style="width:17%;"><col style="width:14%;"><col style="width:26%;"></colgroup>
          <thead><tr style="background:#e2e8f0; text-align:center;"><th style="border:1px solid #000; padding:3px;">No</th><th style="border:1px solid #000; padding:3px;">Aktivitas</th><th style="border:1px solid #000; padding:3px;">Pelaksana</th><th style="border:1px solid #000; padding:3px;">Waktu</th><th style="border:1px solid #000; padding:3px;">Output</th></tr></thead>
          <tbody>${steps.map((step, index) => `<tr><td style="border:1px solid #000; padding:3px; text-align:center;">${index + 1}</td><td style="border:1px solid #000; padding:3px;">${esc(step.aktivitas)}</td><td style="border:1px solid #000; padding:3px;">${esc(step.pelaksana || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(step.waktu || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(step.output || "-")}</td></tr>`).join("") || `<tr><td colspan="5" style="border:1px solid #000; padding:4px; text-align:center; font-style:italic;">Belum ada langkah kerja.</td></tr>`}</tbody>
        </table>
        <div style="font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin:10px 0 4px;">B. Flow Komunikasi</div>
        <table style="width:100%; border-collapse:collapse; font-size:9px;">
          <colgroup><col style="width:18%;"><col style="width:18%;"><col style="width:20%;"><col style="width:14%;"><col style="width:30%;"></colgroup>
          <thead><tr style="background:#e2e8f0; text-align:center;"><th style="border:1px solid #000; padding:3px;">Dari</th><th style="border:1px solid #000; padding:3px;">Ke</th><th style="border:1px solid #000; padding:3px;">Media</th><th style="border:1px solid #000; padding:3px;">Frekuensi</th><th style="border:1px solid #000; padding:3px;">Tujuan Komunikasi</th></tr></thead>
          <tbody>${flows.map(flow => `<tr><td style="border:1px solid #000; padding:3px;">${esc(flow.dari || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(flow.ke || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(flow.media || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(flow.frekuensi || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(flow.tujuan || "-")}</td></tr>`).join("") || `<tr><td colspan="5" style="border:1px solid #000; padding:4px; text-align:center; font-style:italic;">Belum ada flow komunikasi.</td></tr>`}</tbody>
        </table>
        <div style="font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin:10px 0 4px;">C. Output yang Dihasilkan</div>
        <table style="width:100%; border-collapse:collapse; font-size:9px;">
          <colgroup><col style="width:30%;"><col style="width:25%;"><col style="width:25%;"><col style="width:20%;"></colgroup>
          <thead><tr style="background:#e2e8f0; text-align:center;"><th style="border:1px solid #000; padding:3px;">Output</th><th style="border:1px solid #000; padding:3px;">Bentuk</th><th style="border:1px solid #000; padding:3px;">Penerima</th><th style="border:1px solid #000; padding:3px;">Frekuensi</th></tr></thead>
          <tbody>${outputs.map(output => `<tr><td style="border:1px solid #000; padding:3px;">${esc(output.nama || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(output.bentuk || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(output.penerima || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(output.frekuensi || "-")}</td></tr>`).join("") || `<tr><td colspan="4" style="border:1px solid #000; padding:4px; text-align:center; font-style:italic;">Belum ada output.</td></tr>`}</tbody>
        </table>
        ${item.risiko || item.kontrol ? `<div style="font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin:10px 0 4px;">D. Risiko &amp; Kontrol</div><p style="margin:0 0 3px;"><b>Risiko:</b> ${esc(item.risiko || "-")}</p><p style="margin:0;"><b>Kontrol:</b> ${esc(item.kontrol || "-")}</p>` : ""}
        ${analysis.nilai ? `<div style="font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin:10px 0 4px;">E. Hasil Analisa HRD</div><p style="margin:0 0 3px;">Nilai efektivitas & efisiensi: <b>${Number(analysis.nilai)} / 100</b> (${esc(analysis.grade || "-")}) - ${esc(analysis.label || "")}</p><p style="margin:0 0 3px;"><b>Analisa:</b> ${esc(analysis.analisa || "-")}</p>${analysis.rekomendasi ? `<p style="margin:0;"><b>Rekomendasi:</b> ${esc(analysis.rekomendasi)}</p>` : ""}` : ""}
        ${socialization.tanggal || establishment.nomor_sop ? `<div style="font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:2px; margin:10px 0 4px;">F. Sosialisasi &amp; Penetapan</div>${socialization.tanggal ? `<p style="margin:0 0 3px;"><b>Sosialisasi:</b> ${esc(dateText(socialization.tanggal))} · ${esc(socialization.metode || "-")} · ${Number(socialization.peserta_count || 0)} peserta</p>` : ""}${establishment.nomor_sop ? `<p style="margin:0 0 3px;"><b>Ditetapkan:</b> ${esc(establishment.nomor_sop)} · versi ${esc(establishment.versi || "1.0")} · berlaku ${esc(dateText(establishment.tanggal_berlaku))}</p><p style="margin:0;"><b>Dasar:</b> ${esc(establishment.dasar || "-")}</p>` : ""}` : ""}
        <table style="width:100%; border-collapse:collapse; text-align:center; margin-top:16px; font-size:10px; page-break-inside:avoid;">
          <tr><td style="width:33%; padding:2px;">Disusun oleh PIC,</td><td style="width:33%; padding:2px;">Diverifikasi HRD,</td><td style="width:34%; padding:2px;">Disetujui Manajemen,</td></tr>
          <tr><td style="height:38px;"></td><td></td><td></td></tr>
          <tr><td>( <b>${esc(item.pic_nama || picLabel(item))}</b> )</td><td>( <b>${esc(analysis.verified_by || "HRD")}</b> )</td><td>( <b>${esc(establishment.penyetuju || "-")}</b> )</td></tr>
        </table>
      </div>`;

    openModal({
      title: `Dokumen SOP - ${item.nama_proses || "-"}`,
      size: "xl",
      bodyHtml: `
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2 flex-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p class="text-xs font-bold text-emerald-800">Pratinjau Dokumen SOP - flow komunikasi & output tercantum</p>
            <button type="button" id="skp-dl-pdf" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Unduh PDF</button>
          </div>
          <div class="rounded-xl border border-slate-300 bg-slate-100 p-4 overflow-y-auto max-h-[70vh]"><div class="mx-auto bg-white p-6 shadow-md" style="max-width:794px;">${docHtml}</div></div>
        </div>`,
      onMount: backdrop => {
        backdrop.querySelector("#skp-dl-pdf")?.addEventListener("click", async () => {
          try {
            await downloadHtmlAsPdf(docHtml, `SOP_${String(item.nama_proses || "Proses").replace(/[^A-Za-z0-9]+/g, "_")}.pdf`);
            toast("Dokumen SOP diunduh.", "success");
          } catch (error) {
            console.error("download sop document", error);
            toast("Gagal mengunduh dokumen SOP: " + error.message, "error");
          }
        });
      }
    });
  }

  function printProjectSummary(project, items) {
    const stats = summarizeItems(items);
    const docHtml = `
      <div style="width:100%; max-width:760px; margin:0 auto; padding:15px; font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:1.45; color:#000; background:#fff; box-sizing:border-box;">
        <div style="page-break-inside:avoid; margin-bottom:6px;">${isoDocHeaderTable({ judul: "LAPORAN PROYEK AUDIT SOP", noDok: "HRD-AUDITSOP-01", terbitRevisi: "1/0", hal: "1 dari 1" })}</div>
        <div style="text-align:center; font-weight:bold; font-size:13px; margin:6px 0 8px;">LAPORAN PROYEK AUDIT SOP</div>
        <table style="width:100%; border-collapse:collapse; font-size:10px; margin-bottom:8px;">
          <tr><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9; width:25%;">Nama Proyek</td><td style="border:1px solid #000; padding:3px 5px; font-weight:bold;">${esc(project.nama_proyek || "-")}</td><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9; width:22%;">Cabang</td><td style="border:1px solid #000; padding:3px 5px;">${esc(project.cabang === "MALANG" ? "Malang" : project.cabang === "CIREBON" ? "Cirebon" : "Semua Cabang")}</td></tr>
          <tr><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Periode</td><td style="border:1px solid #000; padding:3px 5px;">${esc(project.periode || "-")}</td><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Koordinator</td><td style="border:1px solid #000; padding:3px 5px;">${esc(project.koordinator || "-")}</td></tr>
          <tr><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Total Proses</td><td style="border:1px solid #000; padding:3px 5px;">${stats.total}</td><td style="border:1px solid #000; padding:3px 5px; background:#f1f5f9;">Progress Penetapan</td><td style="border:1px solid #000; padding:3px 5px; font-weight:bold;">${stats.progress}%</td></tr>
        </table>
        <table style="width:100%; border-collapse:collapse; font-size:9px;">
          <colgroup><col style="width:4%;"><col style="width:30%;"><col style="width:16%;"><col style="width:18%;"><col style="width:16%;"><col style="width:16%;"></colgroup>
          <thead><tr style="background:#e2e8f0; text-align:center;"><th style="border:1px solid #000; padding:3px;">No</th><th style="border:1px solid #000; padding:3px;">Proses Kerja</th><th style="border:1px solid #000; padding:3px;">Divisi</th><th style="border:1px solid #000; padding:3px;">PIC</th><th style="border:1px solid #000; padding:3px;">Status</th><th style="border:1px solid #000; padding:3px;">Output</th></tr></thead>
          <tbody>${items.map((item, index) => `<tr><td style="border:1px solid #000; padding:3px; text-align:center;">${index + 1}</td><td style="border:1px solid #000; padding:3px;">${esc(item.nama_proses || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(item.divisi || "-")}</td><td style="border:1px solid #000; padding:3px;">${esc(picLabel(item))}</td><td style="border:1px solid #000; padding:3px; text-align:center;">${esc(statusMeta(item.status).label)}</td><td style="border:1px solid #000; padding:3px;">${normalizeOutputs(item.output).map(output => esc(output.nama || "-")).join(", ") || "-"}</td></tr>`).join("") || `<tr><td colspan="6" style="border:1px solid #000; padding:4px; text-align:center; font-style:italic;">Belum ada proses kerja.</td></tr>`}</tbody>
        </table>
      </div>`;

    openModal({
      title: "Laporan Proyek Audit SOP",
      size: "xl",
      bodyHtml: `
        <div class="space-y-3">
          <div class="flex justify-end"><button type="button" id="skp-dl-project" class="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">Unduh PDF</button></div>
          <div class="rounded-xl border border-slate-300 bg-slate-100 p-4 overflow-y-auto max-h-[70vh]"><div class="mx-auto bg-white p-6 shadow-md" style="max-width:794px;">${docHtml}</div></div>
        </div>`,
      onMount: backdrop => {
        backdrop.querySelector("#skp-dl-project")?.addEventListener("click", async () => {
          try {
            await downloadHtmlAsPdf(docHtml, `Laporan_Audit_SOP_${String(project.nama_proyek || "Proyek").replace(/[^A-Za-z0-9]+/g, "_")}.pdf`);
            toast("Laporan proyek diunduh.", "success");
          } catch (error) {
            console.error("download project summary", error);
            toast("Gagal mengunduh laporan: " + error.message, "error");
          }
        });
      }
    });
  }

  await loadData();
  renderTabs();
  renderSummary();
  await renderPanel();

  return { unmount() {} };
}
