import { COL } from "../firebase-config.js";
import { fsGetAll as firebaseGetAll, openModal, closeModal, confirmDialog, toast, escapeHtml, genId, notifyUser, ensureXlsxLoaded, downloadHtmlAsPdf } from "../utils.js";
import { authFetch } from "../api-client.js";
import { hasPermission, resolveBranchScope, branchMatches } from "../auth.js";
import {
  TRAINING_STATUS, TNA_COMPETENCY_TEMPLATES, aggregateNeeds, campaignTargetsEmployee, competenciesForEmployee,
  competencyGap, needPriorityScore, participantMatchesSession, priorityLabel, responseStandardMet,
  safeParticipantSnapshot, surveyReportRows, templateCompetencyText, trainingMetrics, uniqueRespondentCount
} from "../training-tna.mjs";

const C = {
  campaigns: "training_tna_campaigns", assignments: "training_tna_assignments",
  needs: "training_needs", plans: "training_tna_plans", progress: "training_tna_progress",
  materials: "training_materials", audit: "training_audit_logs"
};

const esc = value => escapeHtml(value ?? "");
const val = (root, selector) => root.querySelector(selector)?.value?.trim() || "";
const roleIn = (session, roles) => roles.includes(String(session.role || "").toUpperCase());
const isHrd = session => roleIn(session, ["HRD", "SUPERADMIN"]);
const isManagement = session => roleIn(session, ["HRD", "SUPERADMIN", "GM", "DIREKTUR", "MANAGER", "BRANCH MANAGER", "SPV", "ATASAN"]);
const myNik = session => String(session.nik || session.nik_karyawan || "").trim();
const money = value => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const dateText = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID") : "-";
const statCard = (label, value, note = "") => `<div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${esc(label)}</p><p class="mt-1 text-2xl font-bold text-slate-800">${esc(value)}</p><p class="mt-1 text-xs text-slate-400">${esc(note)}</p></div>`;
const empty = text => `<div class="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">${esc(text)}</div>`;
const field = (label, id, type = "text", attrs = "") => `<label class="block text-xs font-semibold text-slate-600">${esc(label)}<input id="${id}" type="${type}" ${attrs} class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"></label>`;
const select = (label, id, options) => `<label class="block text-xs font-semibold text-slate-600">${esc(label)}<select id="${id}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">${options.map(([v,l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></label>`;

function collectionType(name) {
  return Object.entries(C).find(([, value]) => value === name)?.[0] || "";
}

async function trainingApi(body) {
  const response = await authFetch("/api/sync-absen", { method: "POST", body: JSON.stringify({ ...body, action: `training_${body.action}` }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Operasi pelatihan gagal.");
  return payload;
}

async function fsAdd(collectionName, data, customId) {
  return (await trainingApi({ action: "create", type: collectionType(collectionName), id: customId || genId("TRN"), data })).id;
}

async function fsUpdate(collectionName, id, data) {
  return (await trainingApi({ action: "update", type: collectionType(collectionName), id, data })).id;
}

async function allData(session) {
  const canPickParticipants = isHrd(session) || await hasPermission("training.planning.create", session);
  const [workflow, employees] = await Promise.all([
    trainingApi({ action: "list" }),
    canPickParticipants ? firebaseGetAll(COL.MASTER_KARYAWAN) : Promise.resolve([])
  ]);
  return { ...workflow.data, employees };
}

async function audit(session, action, entity, entityId, detail = {}) {
  // Mutasi dicatat server-side agar audit log tidak dapat dipalsukan browser.
  return Promise.resolve({ session, action, entity, entityId, detail });
}

function planParticipants(plan) {
  if (Array.isArray(plan.participants)) return plan.participants;
  return (plan.peserta || []).map(nama => ({ nik: "", nama, cabang: "", divisi: "", jabatan: "" }));
}

/** Apakah sebuah program pelatihan termasuk lingkup cabang Branch Manager. */
function planInBranch(plan, branchScope) {
  if (!branchScope) return true;
  if (branchMatches(branchScope, plan.cabang)) return true;
  return planParticipants(plan).some(p => branchMatches(branchScope, p.cabang));
}

function planQuestions(plan) {
  return Array.isArray(plan.assessment_questions) && plan.assessment_questions.length
    ? plan.assessment_questions
    : [{ question: "Saya memahami tujuan dan materi utama pelatihan ini.", answer: "Benar" }];
}

const activeEmployee = employee => !["NONAKTIF", "RESIGN"].includes(String(employee.aktif_tdk_aktif || employee.status || "").toUpperCase());
const employeePosition = employee => String(employee.jabatan || employee.posisi || "").trim();
const uniqueValues = values => [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
const checkedValues = (root, group) => [...root.querySelectorAll(`[data-target-group="${group}"]:checked`)].map(input => input.value);

function targetPicker(id, label, values) {
  return `<section data-picker-panel="${id}" class="rounded-xl border border-slate-200 p-3"><div class="flex items-center justify-between gap-2"><p class="text-xs font-bold text-slate-700">${esc(label)}</p><button type="button" data-clear-group="${id}" class="text-[10px] font-semibold text-maroon-700">Kosongkan</button></div><input type="search" data-picker-search="${id}" placeholder="Cari ${esc(label.toLowerCase())}…" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><div data-picker-list="${id}" class="mt-2 max-h-40 space-y-1 overflow-y-auto">${values.map(value => `<label data-picker-item data-search="${esc(value.toLowerCase())}" class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50"><input type="checkbox" data-target-group="${id}" value="${esc(value)}" class="rounded border-slate-300"><span>${esc(value)}</span></label>`).join("") || `<p class="px-2 py-3 text-xs text-slate-400">Data belum tersedia.</p>`}</div><button type="button" data-check-visible="${id}" class="mt-2 text-[10px] font-semibold text-slate-600">Pilih semua hasil pencarian</button></section>`;
}

function campaignTargetText(campaign) {
  const parts = [
    Array.isArray(campaign.target_branches) && campaign.target_branches.length ? campaign.target_branches.join(", ") : campaign.target_branch || "Semua cabang",
    Array.isArray(campaign.target_divisions) && campaign.target_divisions.length ? campaign.target_divisions.join(", ") : campaign.target_division || "Semua divisi",
    Array.isArray(campaign.target_positions) && campaign.target_positions.length ? campaign.target_positions.join(", ") : campaign.target_position || "Semua jabatan"
  ];
  if (Array.isArray(campaign.target_niks) && campaign.target_niks.length) parts.push(`${campaign.target_niks.length} karyawan dipilih`);
  return parts.join(" · ");
}

async function sendSurveyEmail(campaign, assignment, reminder = false) {
  if (!assignment.email) return false;
  const sent = await notifyUser(
    { username: assignment.username, email: assignment.email, nama: assignment.nama, nik: assignment.nik, id: assignment.id },
    reminder ? "Pengingat survey kebutuhan pelatihan" : "Survey kebutuhan pelatihan",
    reminder ? `Survey ${campaign.title} belum diselesaikan. Mohon isi sebelum ${dateText(campaign.deadline)}.` : `Mohon isi survey ${campaign.title} sebelum ${dateText(campaign.deadline)}.`,
    `#training?tab=my&survey=${encodeURIComponent(assignment.id)}`,
    { manual: true, sendEmail: true }
  );
  if (sent) await fsUpdate(C.assignments, assignment.id, { email_sent_at: new Date().toISOString(), email_status: "SENT" });
  return sent;
}

async function sendSurveyEmails(campaign, assignments, reminder = false) {
  let sent = 0;
  for (let index = 0; index < assignments.length; index += 5) {
    const results = await Promise.all(assignments.slice(index, index + 5).map(item => sendSurveyEmail(campaign, item, reminder)));
    sent += results.filter(Boolean).length;
  }
  return sent;
}

const safeFileName = value => String(value || "survey-tna").trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "survey-tna";

function surveyCompetencySummary(rows) {
  const groups = new Map();
  rows.filter(row => row.competency).forEach(row => {
    const item = groups.get(row.competency) || { competency: row.competency, count: 0, current: 0, expected: 0, gap: 0, urgency: 0, priority: 0 };
    item.count += 1;
    item.current += Number(row.current_level || 0);
    item.expected += Number(row.expected_level || 0);
    item.gap += Number(row.gap || 0);
    item.urgency += Number(row.urgency || 0);
    item.priority += Number(row.priority_score || 0);
    groups.set(row.competency, item);
  });
  return [...groups.values()].map(item => ({
    Kompetensi: item.competency, Responden: item.count,
    "Rata-rata Level Saat Ini": Number((item.current / item.count).toFixed(2)),
    "Rata-rata Level Harapan": Number((item.expected / item.count).toFixed(2)),
    "Rata-rata Gap": Number((item.gap / item.count).toFixed(2)),
    "Rata-rata Urgensi": Number((item.urgency / item.count).toFixed(2)),
    "Skor Prioritas": Number((item.priority / item.count).toFixed(2))
  })).sort((a, b) => b["Skor Prioritas"] - a["Skor Prioritas"]);
}

async function exportSurveyExcel(campaign, assignments) {
  await ensureXlsxLoaded();
  const rows = surveyReportRows(campaign, assignments);
  const submitted = assignments.filter(item => item.status === "SUBMITTED").length;
  const summary = surveyCompetencySummary(rows);
  const workbook = window.XLSX.utils.book_new();
  const overview = [
    ["LAPORAN TRAINING NEED ANALYSIS"], ["Judul Survey", campaign.title || ""], ["Periode", campaign.period || ""],
    ["Batas Pengisian", dateText(campaign.deadline)], ["Target", campaignTargetText(campaign)],
    ["Jumlah Penerima", assignments.length], ["Jumlah Respon", submitted], ["Response Rate", assignments.length ? `${Math.round(submitted / assignments.length * 100)}%` : "0%"], []
  ];
  const wsOverview = window.XLSX.utils.aoa_to_sheet(overview);
  const wsSummary = window.XLSX.utils.json_to_sheet(summary.length ? summary : [{ Keterangan: "Belum ada respons survey" }]);
  const wsDetail = window.XLSX.utils.json_to_sheet(rows.map(row => ({
    NIK: row.nik, Nama: row.nama, Cabang: row.cabang, Divisi: row.divisi, Jabatan: row.jabatan, Status: row.status,
    Kompetensi: row.competency, "Level Harapan": row.expected_level, "Level Saat Ini": row.current_level, Gap: row.gap,
    Urgensi: row.urgency, "Dampak Bisnis": row.business_impact, "Skor Prioritas": row.priority_score,
    Alasan: row.reason, "Waktu Mengisi": row.submitted_at
  })));
  window.XLSX.utils.book_append_sheet(workbook, wsOverview, "Ringkasan");
  window.XLSX.utils.book_append_sheet(workbook, wsSummary, "Analisis Kompetensi");
  window.XLSX.utils.book_append_sheet(workbook, wsDetail, "Detail Respon");
  window.XLSX.writeFile(workbook, `Laporan_TNA_${safeFileName(campaign.title)}.xlsx`);
}

async function exportSurveyPdf(campaign, assignments) {
  const rows = surveyReportRows(campaign, assignments);
  const summary = surveyCompetencySummary(rows);
  const submitted = assignments.filter(item => item.status === "SUBMITTED").length;
  const rate = assignments.length ? Math.round(submitted / assignments.length * 100) : 0;
  const tableStyle = "border-collapse:collapse;width:100%;font-size:10px";
  const cellStyle = "border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top";
  const html = `<div style="padding:28px;font-family:Arial,sans-serif;color:#1e293b"><div style="border-bottom:3px solid #7f1d1d;padding-bottom:14px"><h1 style="margin:0;font-size:22px;color:#7f1d1d">Laporan Training Need Analysis</h1><p style="margin:6px 0 0;font-size:13px">${esc(campaign.title)} · ${esc(campaign.period || "-")}</p></div><table style="${tableStyle};margin-top:18px"><tr><td style="${cellStyle}"><b>Target</b><br>${esc(campaignTargetText(campaign))}</td><td style="${cellStyle}"><b>Batas Pengisian</b><br>${dateText(campaign.deadline)}</td><td style="${cellStyle}"><b>Response Rate</b><br>${submitted}/${assignments.length} (${rate}%)</td></tr></table><h2 style="font-size:15px;margin-top:22px">Ringkasan Kebutuhan Kompetensi</h2><table style="${tableStyle}"><thead><tr style="background:#f1f5f9">${["Kompetensi","Responden","Level Saat Ini","Level Harapan","Gap","Urgensi","Prioritas"].map(label=>`<th style="${cellStyle}">${label}</th>`).join("")}</tr></thead><tbody>${summary.map(item=>`<tr><td style="${cellStyle}">${esc(item.Kompetensi)}</td><td style="${cellStyle}">${item.Responden}</td><td style="${cellStyle}">${item["Rata-rata Level Saat Ini"]}</td><td style="${cellStyle}">${item["Rata-rata Level Harapan"]}</td><td style="${cellStyle}">${item["Rata-rata Gap"]}</td><td style="${cellStyle}">${item["Rata-rata Urgensi"]}</td><td style="${cellStyle}">${item["Skor Prioritas"]}</td></tr>`).join("") || `<tr><td colspan="7" style="${cellStyle}">Belum ada respons.</td></tr>`}</tbody></table><h2 style="font-size:15px;margin-top:22px">Detail Responden</h2><table style="${tableStyle}"><thead><tr style="background:#f1f5f9">${["Nama","Unit","Kompetensi","Saat Ini / Harapan","Urgensi","Alasan"].map(label=>`<th style="${cellStyle}">${label}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr><td style="${cellStyle}"><b>${esc(row.nama)}</b><br>${esc(row.nik)}</td><td style="${cellStyle}">${esc(row.cabang)}<br>${esc(row.divisi)}</td><td style="${cellStyle}">${esc(row.competency || "Belum mengisi")}</td><td style="${cellStyle}">${row.current_level || "-"} / ${row.expected_level || "-"}</td><td style="${cellStyle}">${row.urgency || "-"}</td><td style="${cellStyle}">${esc(row.reason || row.status)}</td></tr>`).join("")}</tbody></table><p style="margin-top:22px;font-size:9px;color:#64748b">Dokumen dibuat melalui HRIS CV Andela Jaya pada ${new Date().toLocaleString("id-ID")}.</p></div>`;
  await downloadHtmlAsPdf(html, `Laporan_TNA_${safeFileName(campaign.title)}.pdf`, "landscape");
}

function clickableScale(name, label, descriptions = ["Sangat rendah", "Rendah", "Cukup", "Baik", "Sangat tinggi"]) {
  return `<fieldset><legend class="text-xs font-semibold text-slate-600">${esc(label)} *</legend><div class="mt-2 grid grid-cols-5 gap-2">${descriptions.map((description, index) => { const score = index + 1; return `<label class="cursor-pointer"><input type="radio" name="${esc(name)}" value="${score}" class="peer sr-only"><span class="flex min-h-16 flex-col items-center justify-center rounded-lg border border-slate-200 px-1 text-center text-[10px] text-slate-500 transition peer-checked:border-maroon-700 peer-checked:bg-maroon-700 peer-checked:text-white"><b class="text-base">${score}</b>${esc(description)}</span></label>`; }).join("")}</div></fieldset>`;
}

export async function mount(container, { session, params = new URLSearchParams() }) {
  const header = container.querySelector("#training-tab-header");
  const body = container.querySelector("#training-content");
  const tabs = [{ id: "my", label: "Pelatihan Saya" }];
  if (isHrd(session)) tabs.unshift(
    { id: "dashboard", label: "Dashboard TNA" }, { id: "survey", label: "Distribusi Survey" },
    { id: "analysis", label: "Analisis" }, { id: "planning", label: "Planning" },
    { id: "execution", label: "Pelaksanaan" }, { id: "report", label: "Laporan" }
  );
  else if (isManagement(session)) tabs.unshift(
    { id: "analysis", label: "Analisis" }, { id: "planning", label: "Planning" },
    { id: "execution", label: "Pelaksanaan" }, { id: "report", label: "Laporan" }
  );
  else if (roleIn(session, ["FINANCE"])) tabs.unshift({ id: "planning", label: "Approval Anggaran" });
  tabs.push({ id: "library", label: "Modul & Deck Training" });
  let active = tabs[0].id;
  const requestedTab = typeof params?.get === "function" ? params.get("tab") : "";
  if (requestedTab && tabs.some(tab => tab.id === requestedTab)) active = requestedTab;
  const requestedSurvey = typeof params?.get === "function" ? params.get("survey") : "";

  async function load() {
    header.innerHTML = tabs.map(t => `<button data-tab="${t.id}" class="px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${active === t.id ? "bg-maroon-700 text-white shadow" : "bg-white border border-slate-200 text-slate-600"}">${t.label}</button>`).join("");
    header.className = "flex items-center gap-2 flex-wrap justify-end";
    header.querySelectorAll("[data-tab]").forEach(button => button.onclick = () => { active = button.dataset.tab; load(); });
    body.innerHTML = `<div class="py-20 text-center text-sm text-slate-400">Memuat data pelatihan…</div>`;
    try {
      const data = await allData(session);
      const renderers = { dashboard: renderDashboard, survey: renderSurvey, analysis: renderAnalysis, planning: renderPlanning, execution: renderExecution, report: renderReport, my: renderMy, library: renderLibrary };
      await renderers[active](body, session, data, load);
      const requestedAssignment = requestedSurvey ? (data.assignments || []).find(item => item.id === requestedSurvey) : null;
      if (active === "my" && requestedAssignment && requestedAssignment.status !== "SUBMITTED") surveyResponseModal(requestedAssignment, session, load, data);
    } catch (error) {
      console.error("training", error);
      body.innerHTML = `<div class="rounded-xl bg-red-50 p-4 text-sm text-red-700">Gagal memuat modul Pelatihan: ${esc(error.message)}</div>`;
    }
  }
  await load();
}

async function renderDashboard(wrap, session, data, reload) {
  const metrics = trainingMetrics(data);
  const response = responseStandardMet(data);
  const urgent = data.needs.filter(n => needPriorityScore(n) >= 20).length;
  const responseNote = response.hasAssignments
    ? `${metrics.submitted}/${metrics.assigned} selesai${response.ok ? "" : ` · di bawah ambang ${response.minResponseRate}%`}`
    : "Belum ada penugasan survey";
  wrap.innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
      ${statCard("Respon survey", `${metrics.responseRate}%`, responseNote)}
      ${statCard("Data kebutuhan", metrics.needs, `${urgent} prioritas tinggi/kritis · ${metrics.uniqueRespondents} responden unik`)}
      ${statCard("Program", metrics.plans, `${metrics.completedPlans} selesai`)}
      ${statCard("Learning gain", `${metrics.averageLearningGain.toFixed(1)} poin`, "Rata-rata post-test − pre-test")}
      ${statCard("Kampanye aktif", data.campaigns.filter(c => c.status === "PUBLISHED").length, "Survey sedang berjalan")}
    </div>
    ${response.ok ? "" : `<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><b>Catatan validitas:</b> ${response.hasAssignments ? `response rate ${response.rate}% dan ${response.respondents} responden unik.` : "Data penugasan survey tidak tersedia."} Ambang minimal ${response.minResponseRate}% dan ${response.minRespondents} responden. Hasil analisis diperlakukan sebagai indikasi awal sampai ambang terpenuhi.</div>`}
    <div class="grid lg:grid-cols-2 gap-5">
      <section class="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm"><h3 class="font-bold text-slate-800">Alur Training Need Analysis</h3><div class="mt-4 space-y-3 text-sm">${[
        ["1", "Survey kebutuhan", "HRD distribusikan kompetensi sasaran"], ["2", "Validasi & analitik", "Atasan mengonfirmasi gap dan urgensi"],
        ["3", "Planning & approval", "Program disusun, GM dan Finance menyetujui"], ["4", "Pelaksanaan", "Absensi, bukti, biaya aktual, pre/post-test"],
        ["5", "Evaluasi", "Feedback, perilaku 30–60 hari, dan hasil kerja"], ["6", "Laporan", "Efektivitas, biaya, cabang, divisi untuk manajemen"]
      ].map(([n,t,d]) => `<div class="flex gap-3"><span class="w-7 h-7 rounded-full bg-maroon-50 text-maroon-700 grid place-items-center font-bold">${n}</span><div><b>${t}</b><p class="text-xs text-slate-400">${d}</p></div></div>`).join("")}</div></section>
      <section class="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm"><h3 class="font-bold text-slate-800">Prioritas Kompetensi</h3><div class="mt-4 space-y-3">${aggregateNeeds(data.needs).slice(0, 7).map(row => `<div><div class="flex justify-between text-xs"><b>${esc(row.key)}</b><span>${row.respondents} karyawan · ${row.count} penilaian · gap ${row.averageGap.toFixed(1)}</span></div><div class="mt-1 h-2 rounded bg-slate-100"><div class="h-2 rounded bg-maroon-600" style="width:${Math.min(100, row.averagePriority / 36 * 100)}%"></div></div></div>`).join("") || empty("Belum ada data kebutuhan.")}</div></section>
    </div>`;
}

async function renderSurvey(wrap, session, data, reload) {
  wrap.innerHTML = `<div class="flex justify-between items-center"><div><h2 class="text-lg font-bold text-slate-800">Distribusi Survey TNA</h2><p class="text-xs text-slate-400">Pilih sasaran dengan checkbox. Publikasi tidak otomatis mengirim email.</p></div><button id="new-campaign" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">+ Buat Survey</button></div>
    <div class="grid md:grid-cols-2 gap-4">${data.campaigns.sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).map(c => {
      const assigned = data.assignments.filter(a => a.campaign_id === c.id);
      const submitted = assigned.filter(a => a.status === "SUBMITTED").length;
      return `<article class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><div class="flex justify-between gap-3"><div><span class="text-[10px] font-bold text-maroon-700">${esc(c.period)}</span><h3 class="font-bold text-slate-800">${esc(c.title)}</h3></div><span class="text-xs font-bold ${c.status === "PUBLISHED" ? "text-emerald-600" : "text-slate-400"}">${esc(c.status)}</span></div><p class="mt-2 text-xs text-slate-500">Target: ${esc(campaignTargetText(c))} · Batas ${dateText(c.deadline)}</p><div class="mt-4 h-2 rounded bg-slate-100"><div class="h-2 rounded bg-emerald-500" style="width:${assigned.length ? submitted / assigned.length * 100 : 0}%"></div></div><p class="mt-1 text-[11px] text-slate-400">${submitted}/${assigned.length} respon</p><div class="mt-4 flex flex-wrap gap-2">${c.status === "DRAFT" ? `<button data-publish="${c.id}" class="rounded-lg bg-maroon-700 px-3 py-2 text-xs font-semibold text-white">Publikasikan</button>` : `<button data-manage-email="${c.id}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Email &amp; Pengingat</button>`}${c.status === "PUBLISHED" ? `<button data-close="${c.id}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Tutup</button>` : ""}${assigned.length ? `<button data-export-xlsx="${c.id}" class="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">Excel</button><button data-export-pdf="${c.id}" class="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700">PDF</button>` : ""}<button data-delete-survey="${c.id}" class="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Hapus</button></div></article>`;
    }).join("") || empty("Belum ada survey TNA.")}</div>`;
  wrap.querySelector("#new-campaign").onclick = () => campaignModal(session, data.employees, reload);
  wrap.querySelectorAll("[data-publish]").forEach(btn => btn.onclick = async () => {
    const campaign = data.campaigns.find(c => c.id === btn.dataset.publish);
    const targets = data.employees.filter(e => campaignTargetsEmployee(campaign, e) && activeEmployee(e));
    if (!targets.length) return toast("Tidak ada karyawan yang sesuai target survey.", "warning");
    btn.disabled = true;
    try {
      const rows = targets.map(employee => {
        const person = safeParticipantSnapshot(employee);
        const competencies = campaign.use_role_matrix === true
          ? competenciesForEmployee(employee, campaign.competencies || [])
          : (campaign.competencies || []);
        return { id: `${campaign.id}_${person.nik}`, data: { campaign_id: campaign.id, ...person, username: employee.username || "", status: "PENDING", competencies, matrix_key: campaign.use_role_matrix === true ? "ROLE" : "CAMPAIGN", cabang: person.cabang, divisi: person.divisi } };
      });
      await trainingApi({ action: "bulk_assignments", campaignId: campaign.id, rows });
      await fsUpdate(C.campaigns, campaign.id, { status: "PUBLISHED", published_at: new Date().toISOString(), assigned_count: targets.length });
      const sent = campaign.email_on_publish === true ? await sendSurveyEmails(campaign, rows.map(row => ({ id: row.id, ...row.data }))) : 0;
      await audit(session, "PUBLISH_CAMPAIGN", "campaign", campaign.id, { target_count: targets.length, email_sent: sent });
      toast(campaign.email_on_publish === true ? `Survey dibagikan ke ${targets.length} karyawan; ${sent} email terkirim.` : `Survey dibagikan ke ${targets.length} karyawan tanpa email.`, "success");
      reload();
    } catch (error) {
      console.error("publish training survey", error);
      toast(error.message || "Publikasi survey gagal.", "error");
      btn.disabled = false;
    }
  });
  wrap.querySelectorAll("[data-manage-email]").forEach(btn => btn.onclick = () => campaignEmailModal(
    data.campaigns.find(c => c.id === btn.dataset.manageEmail),
    data.assignments.filter(a => a.campaign_id === btn.dataset.manageEmail),
    session,
    reload
  ));
  wrap.querySelectorAll("[data-close]").forEach(btn => btn.onclick = async () => { await fsUpdate(C.campaigns, btn.dataset.close, { status: "CLOSED", closed_at: new Date().toISOString() }); await audit(session, "CLOSE_CAMPAIGN", "campaign", btn.dataset.close); reload(); });
  wrap.querySelectorAll("[data-export-xlsx]").forEach(btn => btn.onclick = async () => {
    const campaign = data.campaigns.find(item => item.id === btn.dataset.exportXlsx);
    const assignments = data.assignments.filter(item => item.campaign_id === campaign.id);
    try { await exportSurveyExcel(campaign, assignments); } catch (error) { console.error(error); toast(error.message || "Export Excel gagal.", "error"); }
  });
  wrap.querySelectorAll("[data-export-pdf]").forEach(btn => btn.onclick = async () => {
    const campaign = data.campaigns.find(item => item.id === btn.dataset.exportPdf);
    const assignments = data.assignments.filter(item => item.campaign_id === campaign.id);
    try { await exportSurveyPdf(campaign, assignments); } catch (error) { console.error(error); toast(error.message || "Export PDF gagal.", "error"); }
  });
  wrap.querySelectorAll("[data-delete-survey]").forEach(btn => btn.onclick = async () => {
    const campaign = data.campaigns.find(item => item.id === btn.dataset.deleteSurvey);
    const assignments = data.assignments.filter(item => item.campaign_id === campaign.id);
    const submitted = assignments.filter(item => item.status === "SUBMITTED").length;
    const confirmed = await confirmDialog(`Hapus survey "${campaign.title}" secara permanen?\n\n${assignments.length} penugasan dan ${submitted} respons yang sudah masuk akan ikut dihapus. Data ini tidak dapat dipulihkan.`, { title: "Hapus Survey TNA", danger: true });
    if (!confirmed) return;
    btn.disabled = true;
    try {
      const result = await trainingApi({ action: "delete_campaign", campaignId: campaign.id });
      closeModal();
      toast(`Survey dihapus bersama ${result.deleted.assignments} penugasan dan ${result.deleted.needs} data kebutuhan.`, "success");
      reload();
    } catch (error) {
      toast(error.message || "Survey gagal dihapus.", "error");
      btn.disabled = false;
    }
  });
}

function campaignModal(session, employees, reload) {
  const candidates = employees.filter(activeEmployee).map(employee => ({ source: employee, ...safeParticipantSnapshot(employee) })).filter(person => person.nik && person.nama);
  const branches = uniqueValues(candidates.map(person => person.cabang));
  const divisions = uniqueValues(candidates.map(person => person.divisi));
  const positions = uniqueValues(candidates.map(person => person.jabatan));
  const employeeItems = candidates.map((person, index) => `<label data-employee-row data-employee-index="${index}" class="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs hover:bg-slate-50"><input type="checkbox" data-target-group="employees" value="${esc(person.nik)}" class="mt-0.5 rounded border-slate-300"><span><b>${esc(person.nama)}</b> · ${esc(person.nik)}<br><span class="text-slate-400">${esc(person.cabang || "-")} · ${esc(person.divisi || "-")} · ${esc(person.jabatan || "-")}</span></span></label>`).join("");
  const templateOptions = Object.entries(TNA_COMPETENCY_TEMPLATES).map(([key, template]) => `<option value="${esc(key)}">${esc(template.label)}</option>`).join("");
  openModal({ title: "Buat Survey Training Need Analysis", size: "xl", bodyHtml: `<div id="campaign-form" class="space-y-5"><div class="grid md:grid-cols-3 gap-4">${field("Judul survey", "c-title", "text", "placeholder='TNA Semester I 2027'")}${field("Periode", "c-period", "text", "placeholder='Semester I 2027'")}${field("Batas pengisian", "c-deadline", "date")}</div><div><p class="text-sm font-bold text-slate-800">Sasaran survey</p><p class="mt-1 text-xs text-slate-400">Kosongkan kelompok untuk mencakup semua. Pilihan karyawan akan mempersempit hasil filter organisasi.</p><div class="mt-3 grid md:grid-cols-3 gap-3">${targetPicker("branches", "Cabang", branches)}${targetPicker("divisions", "Divisi", divisions)}${targetPicker("positions", "Jabatan", positions)}</div><section class="mt-3 rounded-xl border border-slate-200 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><div><p class="text-xs font-bold text-slate-700">Karyawan</p><p id="c-target-count" class="text-[11px] text-slate-400"></p></div><div class="flex gap-3"><button type="button" data-clear-group="employees" class="text-[10px] font-semibold text-maroon-700">Kosongkan</button><button type="button" data-check-visible="employees" class="text-[10px] font-semibold text-slate-600">Pilih semua yang tampil</button></div></div><input id="c-employee-search" type="search" placeholder="Cari nama, NIK, cabang, divisi, atau jabatan…" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><div id="c-employee-list" class="mt-2 grid max-h-64 gap-2 overflow-y-auto md:grid-cols-2">${employeeItems || `<p class="text-xs text-slate-400">Data karyawan aktif belum tersedia.</p>`}</div></section></div><div class="rounded-xl border border-blue-100 bg-blue-50 p-3"><p class="text-xs font-bold text-blue-900">Template kebutuhan pengembangan</p><div class="mt-2 flex flex-col gap-2 sm:flex-row"><select id="c-template" class="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"><option value="">Pilih template kompetensi…</option>${templateOptions}</select><button type="button" id="apply-competency-template" class="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">Gunakan Template</button></div><p class="mt-2 text-[11px] text-blue-700">Template dapat disesuaikan kembali sebelum survey disimpan.</p></div><label class="block text-xs font-semibold text-slate-600">Kompetensi yang dinilai<textarea id="c-competencies" rows="7" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Advanced Excel | 4 | 5&#10;Keselamatan Kerja | 5 | 5"></textarea><span class="font-normal text-slate-400">Satu baris: kompetensi | level harapan (1–5) | dampak bisnis (1–5)</span></label><label class="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><input id="c-use-role-matrix" type="checkbox" class="mt-0.5 rounded border-emerald-300" checked><span><b>Sesuaikan level harapan per jabatan</b><br>Gunakan competency matrix per posisi/jabatan. Daftar kompetensi di atas menjadi fallback untuk jabatan yang belum dipetakan.</span></label><label class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><input id="c-email-on-publish" type="checkbox" class="mt-0.5 rounded border-amber-300"><span><b>Kirim email segera saat survey dipublikasikan</b><br>Opsional dan tidak dicentang secara default. Jika tidak dipilih, email dapat dikirim satu per satu setelah publikasi.</span></label></div>`, footerHtml: `<button id="save-campaign" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">Simpan Draft</button>`, onMount: modal => {
    const root = modal.querySelector("#campaign-form");
    const selectedSet = group => new Set(checkedValues(root, group));
    const matchesOrg = person => {
      const selectedBranches = selectedSet("branches"), selectedDivisions = selectedSet("divisions"), selectedPositions = selectedSet("positions");
      return (!selectedBranches.size || selectedBranches.has(person.cabang)) && (!selectedDivisions.size || selectedDivisions.has(person.divisi)) && (!selectedPositions.size || selectedPositions.has(person.jabatan));
    };
    const refreshEmployees = () => {
      const query = String(root.querySelector("#c-employee-search")?.value || "").trim().toLowerCase();
      root.querySelectorAll("[data-employee-row]").forEach(row => {
        const person = candidates[Number(row.dataset.employeeIndex)];
        const haystack = [person.nama, person.nik, person.cabang, person.divisi, person.jabatan].join(" ").toLowerCase();
        row.classList.toggle("hidden", !matchesOrg(person) || (query && !haystack.includes(query)));
      });
      const selectedNiks = selectedSet("employees");
      const total = candidates.filter(person => matchesOrg(person) && (!selectedNiks.size || selectedNiks.has(person.nik))).length;
      root.querySelector("#c-target-count").textContent = selectedNiks.size ? `${total} karyawan terpilih sesuai filter` : `${total} karyawan sesuai filter organisasi`;
    };
    root.querySelectorAll("[data-picker-search]").forEach(input => input.oninput = () => {
      const query = input.value.trim().toLowerCase();
      root.querySelectorAll(`[data-picker-list="${input.dataset.pickerSearch}"] [data-picker-item]`).forEach(item => item.classList.toggle("hidden", query && !item.dataset.search.includes(query)));
    });
    root.querySelectorAll('[data-target-group="branches"],[data-target-group="divisions"],[data-target-group="positions"],[data-target-group="employees"]').forEach(input => input.onchange = refreshEmployees);
    root.querySelector("#c-employee-search").oninput = refreshEmployees;
    root.querySelectorAll("[data-clear-group]").forEach(button => button.onclick = () => { root.querySelectorAll(`[data-target-group="${button.dataset.clearGroup}"]`).forEach(input => { input.checked = false; }); refreshEmployees(); });
    root.querySelectorAll("[data-check-visible]").forEach(button => button.onclick = () => {
      const group = button.dataset.checkVisible;
      const scope = group === "employees" ? root.querySelector("#c-employee-list") : root.querySelector(`[data-picker-list="${group}"]`);
      scope?.querySelectorAll(`[data-target-group="${group}"]`).forEach(input => { if (!input.closest("label")?.classList.contains("hidden")) input.checked = true; });
      refreshEmployees();
    });
    root.querySelector("#apply-competency-template").onclick = async () => {
      const templateKey = val(root, "#c-template");
      if (!templateKey) return toast("Pilih template kompetensi terlebih dahulu.", "warning");
      const textarea = root.querySelector("#c-competencies");
      if (textarea.value.trim()) {
        const replace = await confirmDialog("Kompetensi yang sudah ditulis akan diganti oleh template pilihan. Lanjutkan?", { title: "Gunakan Template Kompetensi" });
        if (!replace) return;
      }
      textarea.value = templateCompetencyText(templateKey);
      textarea.focus();
      toast("Template kompetensi diterapkan dan masih dapat diedit.", "success");
    };
    refreshEmployees();
    modal.querySelector("#save-campaign").onclick = async () => {
      const competencies = val(root, "#c-competencies").split("\n").map(line => { const [name, expected, impact] = line.split("|").map(x => x.trim()); return { name, expected_level: Math.min(5, Math.max(1, Number(expected || 3))), business_impact: Math.min(5, Math.max(1, Number(impact || 3))) }; }).filter(x => x.name);
      if (!val(root, "#c-title") || !val(root, "#c-deadline") || !competencies.length) return toast("Judul, batas pengisian, dan kompetensi wajib diisi.", "warning");
      const id = genId("TNA");
      await fsAdd(C.campaigns, { title: val(root,"#c-title"), period: val(root,"#c-period"), deadline: val(root,"#c-deadline"), target_branches: checkedValues(root,"branches"), target_divisions: checkedValues(root,"divisions"), target_positions: checkedValues(root,"positions"), target_niks: checkedValues(root,"employees"), email_on_publish: root.querySelector("#c-email-on-publish").checked, use_role_matrix: root.querySelector("#c-use-role-matrix").checked, competencies, status: "DRAFT", created_by_nik: myNik(session) }, id);
      await audit(session, "CREATE_CAMPAIGN", "campaign", id); closeModal(); toast("Draft survey disimpan.", "success"); reload();
    };
  }});
}

function campaignEmailModal(campaign, assignments, session, reload) {
  const rows = assignments.slice().sort((a, b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id"));
  openModal({ title: `Email Survey: ${esc(campaign.title)}`, size: "lg", bodyHtml: `<div class="space-y-4"><div class="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">Email tidak dikirim otomatis dari halaman ini. Pilih karyawan lalu tekan tombol kirim, atau gunakan tombol <b>Kirim</b> pada satu karyawan.</div><input id="survey-email-search" type="search" placeholder="Cari nama, NIK, cabang, atau divisi…" class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><div class="flex items-center justify-between"><label class="flex items-center gap-2 text-xs font-semibold"><input id="survey-email-all" type="checkbox" class="rounded border-slate-300"> Pilih semua yang tampil</label><span id="survey-email-count" class="text-xs text-slate-400">0 dipilih</span></div><div id="survey-email-list" class="max-h-[50vh] space-y-2 overflow-y-auto">${rows.map((item, index) => `<div data-email-row data-email-index="${index}" class="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" data-email-select="${index}" class="rounded border-slate-300" ${item.email ? "" : "disabled"}><div class="min-w-0 flex-1 text-xs"><b>${esc(item.nama)}</b> · ${esc(item.nik)}<br><span class="text-slate-400">${esc(item.cabang || "-")} · ${esc(item.divisi || "-")} · ${esc(item.email || "Email belum tersedia")}</span><br><span data-email-status="${index}" class="${item.email_sent_at ? "text-emerald-600" : "text-slate-400"}">${item.email_sent_at ? `Terakhir dikirim ${esc(new Date(item.email_sent_at).toLocaleString("id-ID"))}` : "Belum dikirim"}</span></div><button type="button" data-send-one="${index}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold ${item.email ? "" : "cursor-not-allowed opacity-40"}" ${item.email ? "" : "disabled"}>Kirim</button></div>`).join("") || empty("Belum ada karyawan penerima survey.")}</div></div>`, footerHtml: `<button id="send-selected-survey-email" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">Kirim ke yang dipilih</button>`, onMount: modal => {
    const updateCount = () => { modal.querySelector("#survey-email-count").textContent = `${modal.querySelectorAll("[data-email-select]:checked").length} dipilih`; };
    modal.querySelector("#survey-email-search").oninput = event => {
      const query = event.target.value.trim().toLowerCase();
      modal.querySelectorAll("[data-email-row]").forEach(row => {
        const item = rows[Number(row.dataset.emailIndex)];
        row.classList.toggle("hidden", query && ![item.nama, item.nik, item.cabang, item.divisi, item.email].join(" ").toLowerCase().includes(query));
      });
    };
    modal.querySelector("#survey-email-all").onchange = event => {
      modal.querySelectorAll("[data-email-row]").forEach(row => { const input = row.querySelector("[data-email-select]"); if (!row.classList.contains("hidden") && !input.disabled) input.checked = event.target.checked; });
      updateCount();
    };
    modal.querySelectorAll("[data-email-select]").forEach(input => input.onchange = updateCount);
    const deliver = async (items, button) => {
      if (!items.length) return toast("Pilih minimal satu karyawan yang memiliki email.", "warning");
      button.disabled = true;
      try {
        const sent = await sendSurveyEmails(campaign, items, true);
        items.forEach(item => { const index = rows.indexOf(item), status = modal.querySelector(`[data-email-status="${index}"]`); if (status) { status.textContent = sent ? "Pengiriman telah diproses" : "Pengiriman gagal"; status.className = sent ? "text-emerald-600" : "text-red-600"; } });
        await audit(session, "SEND_CAMPAIGN_EMAIL", "campaign", campaign.id, { selected: items.length, sent });
        toast(`${sent} dari ${items.length} email berhasil diproses.`, sent ? "success" : "error");
      } finally { button.disabled = false; }
    };
    modal.querySelectorAll("[data-send-one]").forEach(button => button.onclick = () => deliver([rows[Number(button.dataset.sendOne)]], button));
    modal.querySelector("#send-selected-survey-email").onclick = event => deliver([...modal.querySelectorAll("[data-email-select]:checked")].map(input => rows[Number(input.dataset.emailSelect)]), event.currentTarget);
  }, onClose: reload });
}

async function renderAnalysis(wrap, session, data, reload) {
  const branchScope = resolveBranchScope(session);
  const scopedNeeds = branchScope ? data.needs.filter(n => branchMatches(branchScope, n.cabang)) : data.needs;
  const branches = [...new Set(scopedNeeds.map(n => n.cabang).filter(Boolean))].sort();
  const divisions = [...new Set(scopedNeeds.map(n => n.divisi).filter(Boolean))].sort();
  wrap.innerHTML = `<div><h2 class="text-lg font-bold text-slate-800">Analisis Kebutuhan Pelatihan</h2><p class="text-xs text-slate-400">Gap = level harapan − level saat ini; prioritas mempertimbangkan gap, urgensi, dan dampak bisnis.</p></div><div class="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap gap-3">${select("Cabang", "filter-branch", [["","Semua"], ...branches.map(x=>[x,x])])}${select("Divisi", "filter-division", [["","Semua"], ...divisions.map(x=>[x,x])])}</div><div id="analysis-table"></div>`;
  const draw = () => {
    const branch = val(wrap,"#filter-branch"), division = val(wrap,"#filter-division");
    const rows = data.needs.filter(n => branchMatches(branchScope, n.cabang) && (!branch || n.cabang === branch) && (!division || n.divisi === division) && (!isManagement(session) || roleIn(session,["HRD","SUPERADMIN","GM","DIREKTUR"]) || !session.cabang || n.cabang === session.cabang));
    wrap.querySelector("#analysis-table").innerHTML = `<div class="overflow-x-auto bg-white rounded-2xl border border-slate-100 shadow-sm"><table class="min-w-full text-xs"><thead class="bg-slate-50 text-slate-500"><tr>${["Karyawan","Cabang / Divisi","Kompetensi","Level","Prioritas","Validasi atasan"].map(h=>`<th class="px-4 py-3 text-left">${h}</th>`).join("")}</tr></thead><tbody>${rows.sort((a,b)=>needPriorityScore(b)-needPriorityScore(a)).map(n => `<tr class="border-t border-slate-100"><td class="px-4 py-3"><b>${esc(n.nama)}</b><br><span class="text-slate-400">${esc(n.nik)}</span></td><td class="px-4 py-3">${esc(n.cabang)}<br>${esc(n.divisi)}</td><td class="px-4 py-3"><b>${esc(n.competency_name)}</b><br><span class="text-slate-400">${esc(n.reason)}</span></td><td class="px-4 py-3">${n.current_level} → ${n.expected_level}<br><b>Gap ${competencyGap(n.expected_level,n.current_level)}</b></td><td class="px-4 py-3"><b>${priorityLabel(needPriorityScore(n))}</b><br>${needPriorityScore(n)} poin</td><td class="px-4 py-3">${n.validation_status === "VALIDATED" ? `<span class="text-emerald-600 font-bold">Tervalidasi</span><br>${esc(n.manager_note)}` : isManagement(session) ? `<button data-validate="${n.id}" class="rounded bg-maroon-700 px-3 py-2 text-white">Validasi</button>` : "Menunggu"}</td></tr>`).join("") || `<tr><td colspan="6" class="p-8 text-center text-slate-400">Belum ada data sesuai filter.</td></tr>`}</tbody></table></div>`;
    wrap.querySelectorAll("[data-validate]").forEach(btn => btn.onclick = () => validationModal(rows.find(n=>n.id===btn.dataset.validate), session, reload));
  };
  wrap.querySelectorAll("select").forEach(el => el.onchange = draw); draw();
}

function validationModal(need, session, reload) {
  openModal({ title: `Validasi: ${esc(need.competency_name)}`, bodyHtml: `<div id="validation" class="grid gap-4">${field("Level saat ini hasil validasi (1–5)","v-level","number",`min='1' max='5' value='${need.current_level}'`)}${field("Urgensi (1–5)","v-urgency","number",`min='1' max='5' value='${need.urgency || 3}'`)}<label class="text-xs font-semibold text-slate-600">Catatan atasan<textarea id="v-note" rows="4" class="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Observasi kinerja dan intervensi yang disarankan"></textarea></label></div>`, footerHtml: `<button id="save-validation" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">Simpan validasi</button>`, onMount: modal => modal.querySelector("#save-validation").onclick = async () => {
    const root = modal.querySelector("#validation");
    await fsUpdate(C.needs, need.id, { current_level: Number(val(root,"#v-level")), urgency: Number(val(root,"#v-urgency")), manager_note: val(root,"#v-note"), validation_status: "VALIDATED", validated_by_nik: myNik(session), validated_at: new Date().toISOString() });
    await audit(session,"VALIDATE_NEED","need",need.id); closeModal(); toast("Kebutuhan tervalidasi.","success"); reload();
  }});
}

async function renderPlanning(wrap, session, data, reload) {
  const canCreate = isHrd(session) || await hasPermission("training.planning.create", session);
  // Branch Manager hanya melihat program pelatihan yang menyentuh cabangnya.
  const branchScope = resolveBranchScope(session);
  const plans = branchScope ? data.plans.filter(p => planInBranch(p, branchScope)) : data.plans;
  wrap.innerHTML = `<div class="flex justify-between items-center"><div><h2 class="text-lg font-bold text-slate-800">Planning & Persetujuan</h2><p class="text-xs text-slate-400">Rencana berbasis kebutuhan tervalidasi dengan peserta ber-NIK.</p></div>${canCreate ? `<button id="new-plan" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">+ Buat Program</button>` : ""}</div><div class="grid lg:grid-cols-2 gap-4">${plans.map(p => `<article class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><div class="flex justify-between gap-3"><div><span class="text-[10px] font-bold text-maroon-700">${esc(p.competency_name || p.kategori || "PROGRAM")}</span><h3 class="font-bold text-slate-800">${esc(p.title || p.judul)}</h3></div><b class="text-xs text-slate-500">${esc(p.status)}</b></div><p class="mt-2 text-xs text-slate-500">${dateText(p.start_date || p.tanggal)} · ${esc(p.trainer)} · ${planParticipants(p).length} peserta</p><p class="mt-1 text-xs">Estimasi ${money(p.budget_estimate || p.estimasi_biaya)}${p.result_metric ? ` · Hasil: ${esc(p.result_metric)}` : ""}</p><p class="mt-1 text-[11px] ${p.plan_origin === "MANDATORY" ? "text-blue-600" : p.need_ids?.length ? "text-emerald-600" : "text-amber-600"}">${p.plan_origin === "MANDATORY" ? "Program mandatory / regulasi" : p.need_ids?.length ? `${p.need_ids.length} kebutuhan TNA tertaut` : "Belum tertaut ke kebutuhan TNA"}</p><div class="mt-4 flex flex-wrap gap-2">${approvalButtons(p,session)}</div></article>`).join("") || empty("Belum ada rencana program.")}</div>`;
  if (wrap.querySelector("#new-plan")) wrap.querySelector("#new-plan").onclick = () => planModal(session,data,reload);
  wrap.querySelectorAll("[data-decision]").forEach(btn => btn.onclick = async () => {
    const [decision, planId] = btn.dataset.decision.split(":"); const plan = data.plans.find(p=>p.id===planId);
    let update = {};
    if (decision === "gm-ok") update = { status: TRAINING_STATUS.PENDING_FINANCE, gm_status:"APPROVED", gm_by:session.nama, gm_at:new Date().toISOString() };
    if (decision === "gm-no") update = { status: TRAINING_STATUS.REJECTED_GM, gm_status:"REJECTED", gm_by:session.nama, gm_at:new Date().toISOString() };
    if (decision === "fin-ok") update = { status: TRAINING_STATUS.SCHEDULED, finance_status:"APPROVED", finance_by:session.nama, finance_at:new Date().toISOString() };
    if (decision === "fin-no") update = { status: TRAINING_STATUS.REJECTED_FINANCE, finance_status:"REJECTED", finance_by:session.nama, finance_at:new Date().toISOString() };
    await fsUpdate(C.plans, plan.id, update); await audit(session,"PLAN_DECISION","plan",plan.id,{decision}); toast("Keputusan tersimpan.","success"); reload();
  });
}

function approvalButtons(plan, session) {
  const role = String(session.role || "").toUpperCase();
  if (plan.status === TRAINING_STATUS.PENDING_GM && ["GM","DIREKTUR","SUPERADMIN"].includes(role)) return `<button data-decision="gm-ok:${plan.id}" class="rounded bg-emerald-600 px-3 py-2 text-xs text-white">Setujui GM</button><button data-decision="gm-no:${plan.id}" class="rounded bg-red-600 px-3 py-2 text-xs text-white">Tolak</button>`;
  if (plan.status === TRAINING_STATUS.PENDING_FINANCE && ["FINANCE","SUPERADMIN"].includes(role)) return `<button data-decision="fin-ok:${plan.id}" class="rounded bg-emerald-600 px-3 py-2 text-xs text-white">Setujui Finance</button><button data-decision="fin-no:${plan.id}" class="rounded bg-red-600 px-3 py-2 text-xs text-white">Tolak</button>`;
  return `<span class="text-xs text-slate-400">GM: ${esc(plan.gm_status || "Menunggu")} · Finance: ${esc(plan.finance_status || "Menunggu")}</span>`;
}

function planModal(session, data, reload) {
  const branchScope = resolveBranchScope(session);
  let candidates = data.employees.map(safeParticipantSnapshot).filter(p => p.nik && p.nama);
  // Branch Manager hanya dapat memilih peserta dari cabangnya sendiri.
  if (branchScope) candidates = candidates.filter(p => branchMatches(branchScope, p.cabang));
  const validatedNeeds = (data.needs || [])
    .filter(n => n.validation_status === "VALIDATED" && (!branchScope || branchMatches(branchScope, n.cabang)))
    .sort((a, b) => needPriorityScore(b) - needPriorityScore(a));
  const needItems = validatedNeeds.slice(0, 80).map(n => `<label class="flex items-start gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs"><input type="checkbox" data-need="${esc(n.id)}" data-need-nik="${esc(n.nik)}" data-need-competency="${esc(n.competency_name)}" class="mt-0.5 rounded border-emerald-300"><span><b>${esc(n.nama || "-")}</b> · ${esc(n.nik || "-")}<br><span class="text-slate-500">${esc(n.competency_name || "-")} · gap ${competencyGap(n.expected_level, n.current_level)} · ${priorityLabel(needPriorityScore(n))}</span></span></label>`).join("");
  const candidateItems = candidates.map((p, i) => `<label class="flex items-center gap-2 text-xs"><input type="checkbox" data-person="${i}"><span><b>${esc(p.nama)}</b> · ${esc(p.nik)} · ${esc(p.cabang)}</span></label>`).join("");
  openModal({
    title: "Buat Rencana Program Pelatihan",
    size: "xl",
    bodyHtml: `<div id="plan-form" class="space-y-4">
      <div class="grid md:grid-cols-2 gap-4">
        ${field("Nama program", "p-title")}
        ${select("Jenis program", "p-origin", [["TNA", "Berbasis TNA / kebutuhan tervalidasi"], ["MANDATORY", "Mandatory / regulasi"], ["OTHER", "Lainnya"]])}
        ${field("Kompetensi utama", "p-competency")}
        ${field("Trainer / vendor", "p-trainer")}
        ${field("Tanggal mulai", "p-date", "date")}
        ${field("Metode", "p-method", "text", "placeholder='Kelas / OJT / Coaching'")}
        ${field("Estimasi biaya", "p-budget", "number", "min='0'")}
        ${field("Nilai kelulusan", "p-pass", "number", "min='0' max='100' value='70'")}
      </div>
      <label class="block text-xs font-semibold text-slate-600">Tujuan terukur<textarea id="p-objective" class="mt-1 w-full rounded-lg border px-3 py-2" rows="3"></textarea></label>
      <section class="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p class="text-xs font-bold text-emerald-900">Kebutuhan tervalidasi yang menjadi dasar program</p>
        <p class="mt-1 text-[11px] text-emerald-800">Pilih minimal satu kebutuhan untuk program berbasis TNA. Peserta dengan NIK yang sama akan ditandai otomatis dan tetap dapat disesuaikan.</p>
        <div class="mt-2 max-h-48 overflow-y-auto grid md:grid-cols-2 gap-2">${needItems || `<p class="text-xs text-emerald-800">Belum ada kebutuhan tervalidasi. Pilih jenis program Mandatory/Lainnya bila tidak berbasis TNA.</p>`}</div>
      </section>
      <div class="grid md:grid-cols-2 gap-4">
        ${field("Metrik hasil level 4", "p-metric", "text", "placeholder='Contoh: nilai audit, penjualan, error rate'")}
        ${field("Satuan metrik", "p-unit", "text", "placeholder='%, Rp, unit'")}
        ${field("Baseline", "p-baseline", "number")}
        ${field("Target", "p-target", "number")}
      </div>
      <label class="block text-xs font-semibold text-slate-600">Pertanyaan asesmen<textarea id="p-questions" class="mt-1 w-full rounded-lg border px-3 py-2" rows="4" placeholder="Pertanyaan | Benar"></textarea></label>
      <div><p class="text-xs font-semibold text-slate-600 mb-2">Peserta</p><div class="max-h-56 overflow-y-auto grid md:grid-cols-2 gap-2 border rounded-xl p-3">${candidateItems}</div></div>
    </div>`,
    footerHtml: `<button id="save-plan" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">Kirim ke GM</button>`,
    onMount: modal => {
      const root = modal.querySelector("#plan-form");
      const needInputs = [...root.querySelectorAll("[data-need]")];
      const syncNeedSelection = () => {
        const selected = needInputs.filter(input => input.checked);
        const niks = new Set(selected.map(input => input.dataset.needNik).filter(Boolean));
        root.querySelectorAll("[data-person]").forEach(input => {
          const person = candidates[Number(input.dataset.person)];
          if (person && niks.has(person.nik)) input.checked = true;
        });
        const competencyNames = uniqueValues(selected.map(input => input.dataset.needCompetency));
        if (competencyNames.length === 1) root.querySelector("#p-competency").value = competencyNames[0];
      };
      needInputs.forEach(input => input.onchange = syncNeedSelection);
      modal.querySelector("#save-plan").onclick = async () => {
        const participants = [...root.querySelectorAll("[data-person]:checked")].map(x => candidates[Number(x.dataset.person)]);
        const selectedNeeds = needInputs
          .filter(input => input.checked)
          .map(input => validatedNeeds.find(need => need.id === input.dataset.need))
          .filter(Boolean);
        const origin = val(root, "#p-origin") || "TNA";
        const questions = val(root, "#p-questions").split("\n").map(line => {
          const [question, answer] = line.split("|").map(x => x.trim());
          return { question, answer: answer || "Benar" };
        }).filter(q => q.question);
        if (!val(root, "#p-title") || !val(root, "#p-date") || !participants.length) return toast("Nama, tanggal, dan peserta wajib dipilih.", "warning");
        if (origin === "TNA" && !selectedNeeds.length) return toast("Pilih minimal satu kebutuhan tervalidasi untuk program berbasis TNA.", "warning");
        const id = genId("PLAN");
        const participantNiks = participants.map(p => p.nik);
        const planData = {
          title: val(root, "#p-title"),
          plan_origin: origin,
          competency_name: val(root, "#p-competency") || uniqueValues(selectedNeeds.map(n => n.competency_name))[0] || "",
          trainer: val(root, "#p-trainer"),
          start_date: val(root, "#p-date"),
          method: val(root, "#p-method"),
          budget_estimate: Number(val(root, "#p-budget") || 0),
          passing_grade: Number(val(root, "#p-pass") || 70),
          objective: val(root, "#p-objective"),
          result_metric: val(root, "#p-metric"),
          result_unit: val(root, "#p-unit"),
          baseline_value: val(root, "#p-baseline") === "" ? null : Number(val(root, "#p-baseline")),
          target_value: val(root, "#p-target") === "" ? null : Number(val(root, "#p-target")),
          assessment_questions: questions,
          participants,
          participant_niks: participantNiks,
          participant_branches: uniqueValues(participants.map(p => p.cabang)),
          need_ids: selectedNeeds.map(n => n.id),
          campaign_ids: uniqueValues(selectedNeeds.map(n => n.campaign_id)),
          cabang: branchScope || session.cabang || "",
          status: TRAINING_STATUS.PENDING_GM,
          gm_status: "PENDING",
          finance_status: "PENDING",
          created_by_nik: myNik(session)
        };
        await fsAdd(C.plans, planData, id);
        if (selectedNeeds.length) {
          await Promise.all(selectedNeeds.map(need => fsUpdate(C.needs, need.id, { plan_id: id, planned_at: new Date().toISOString() })));
        }
        await audit(session, "CREATE_PLAN", "plan", id, { participants: participants.length, needs: selectedNeeds.length, origin });
        closeModal();
        toast("Rencana dikirim ke GM.", "success");
        reload();
      };
    }
  });
}

async function renderExecution(wrap, session, data, reload) {
  const plans = data.plans.filter(p=>[TRAINING_STATUS.SCHEDULED,TRAINING_STATUS.ONGOING,TRAINING_STATUS.COMPLETED,TRAINING_STATUS.CANCELLED].includes(p.status));
  wrap.innerHTML=`<div><h2 class="text-lg font-bold text-slate-800">Pelaksanaan Training</h2><p class="text-xs text-slate-400">Catat status, kehadiran, bukti pelaksanaan, dan biaya aktual.</p></div><div class="space-y-4">${plans.map(p=>{const attendees=planParticipants(p);return `<article class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><div class="flex flex-wrap justify-between gap-3"><div><h3 class="font-bold">${esc(p.title||p.judul)}</h3><p class="text-xs text-slate-400">${dateText(p.start_date||p.tanggal)} · ${esc(p.trainer)} · ${attendees.length} peserta</p></div><b class="text-xs">${esc(p.status)}</b></div><div class="mt-3 text-xs text-slate-500">Hadir: ${(p.attendance_niks||[]).length}/${attendees.length} · Biaya aktual: ${money(p.actual_cost)}</div>${isHrd(session)?`<div class="mt-4 flex gap-2"><button data-execute="${p.id}" class="rounded bg-maroon-700 px-3 py-2 text-xs text-white">Update pelaksanaan</button></div>`:""}</article>`}).join("")||empty("Belum ada program yang lolos persetujuan.")}</div>`;
  wrap.querySelectorAll("[data-execute]").forEach(btn=>btn.onclick=()=>executionModal(data.plans.find(p=>p.id===btn.dataset.execute),session,reload));
}

function executionModal(plan, session, reload) {
  const people = planParticipants(plan), present = new Set(plan.attendance_niks || []);
  const numberValue = value => value === null || value === undefined || value === "" ? "" : Number(value);
  openModal({
    title: `Pelaksanaan: ${esc(plan.title || plan.judul)}`,
    size: "lg",
    bodyHtml: `<div id="exec" class="space-y-4">
      ${select("Status", "e-status", [["SCHEDULED", "Terjadwal"], ["ONGOING", "Berjalan"], ["COMPLETED", "Selesai"], ["CANCELLED", "Dibatalkan"]])}
      <div class="grid sm:grid-cols-2 gap-3">
        ${field("Biaya aktual", "e-cost", "number", `min='0' value='${numberValue(plan.actual_cost) || 0}'`)}
        ${field("Tautan bukti / dokumentasi", "e-evidence", "url", `value='${esc(plan.evidence_url || "")}'`)}
      </div>
      <section class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p class="text-xs font-bold text-slate-700">Hasil dampak (level 4)</p>
        <p class="mt-1 text-[11px] text-slate-500">Tetapkan metrik yang dipengaruhi pelatihan. Isi hasil aktual setelah periode evaluasi.</p>
        <div class="mt-3 grid sm:grid-cols-2 gap-3">
          ${field("Metrik hasil", "e-metric", "text", `value='${esc(plan.result_metric || "")}'`)}
          ${field("Satuan metrik", "e-unit", "text", `value='${esc(plan.result_unit || "")}'`)}
          ${field("Baseline", "e-baseline", "number", `value='${numberValue(plan.baseline_value)}'`)}
          ${field("Target", "e-target", "number", `value='${numberValue(plan.target_value)}'`)}
          ${field("Hasil aktual", "e-actual", "number", `value='${numberValue(plan.actual_value)}'`)}
        </div>
        <label class="mt-3 block text-xs font-semibold text-slate-600">Catatan hasil<textarea id="e-result-note" rows="2" class="mt-1 w-full rounded-lg border px-3 py-2">${esc(plan.result_note || "")}</textarea></label>
      </section>
      <label class="block text-xs font-semibold text-slate-600">Catatan<textarea id="e-notes" rows="3" class="mt-1 w-full rounded-lg border px-3 py-2">${esc(plan.execution_notes || "")}</textarea></label>
      <div><p class="text-xs font-semibold mb-2">Kehadiran peserta</p>${people.map((p, i) => `<label class="flex gap-2 py-1 text-xs"><input type="checkbox" data-attendee="${i}" ${present.has(p.nik) ? "checked" : ""}>${esc(p.nama)} · ${esc(p.nik)}</label>`).join("")}</div>
    </div>`,
    footerHtml: `<button id="save-exec" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Simpan</button>`,
    onMount: modal => {
      modal.querySelector("#e-status").value = plan.status;
      modal.querySelector("#save-exec").onclick = async () => {
        const root = modal.querySelector("#exec");
        const status = val(root, "#e-status");
        const attendance = [...root.querySelectorAll("[data-attendee]:checked")].map(x => people[Number(x.dataset.attendee)].nik).filter(Boolean);
        if (status === "COMPLETED" && !attendance.length && !val(root, "#e-evidence")) return toast("Pelatihan selesai memerlukan kehadiran atau tautan bukti pelaksanaan.", "warning");
        const nullableNumber = selector => {
          const raw = val(root, selector);
          return raw === "" ? null : Number(raw);
        };
        await fsUpdate(C.plans, plan.id, {
          status,
          actual_cost: Number(val(root, "#e-cost") || 0),
          evidence_url: val(root, "#e-evidence"),
          execution_notes: val(root, "#e-notes"),
          result_metric: val(root, "#e-metric"),
          result_unit: val(root, "#e-unit"),
          baseline_value: nullableNumber("#e-baseline"),
          target_value: nullableNumber("#e-target"),
          actual_value: nullableNumber("#e-actual"),
          result_note: val(root, "#e-result-note"),
          attendance_niks: attendance
        });
        await audit(session, "UPDATE_EXECUTION", "plan", plan.id, { status, attendance: attendance.length, has_result: Boolean(val(root, "#e-metric")) });
        closeModal();
        toast("Pelaksanaan diperbarui.", "success");
        reload();
      };
    }
  });
}

/* ============================================================
 * SUBMENU: MODUL & DECK TRAINING (PUSTAKA MATERI BASIC TRAINING)
 * ============================================================ */
const MATERIAL_CATEGORIES = [
  ["Onboarding", "Onboarding Karyawan Baru"],
  ["Product Knowledge", "Product Knowledge"],
  ["SOP", "SOP & Kebijakan"],
  ["Komunikasi", "Komunikasi & Service"],
  ["Kepemimpinan", "Kepemimpinan & Manajerial"],
  ["Teknis", "Teknis & Tools"],
  ["Lainnya", "Lainnya"]
];
const MATERIAL_TYPES = [
  ["Modul", "Modul / Materi Tulis"],
  ["Deck", "Deck / Slide Presentasi"],
  ["Video", "Video Training"],
  ["Buku", "E-Book / Buku Panduan"],
  ["Lainnya", "Lainnya"]
];
const categoryLabel = value => MATERIAL_CATEGORIES.find(([key]) => key === value)?.[1] || value || "Lainnya";
const materialTypeLabel = value => MATERIAL_TYPES.find(([key]) => key === value)?.[1] || value || "Lainnya";
const materialOptions = (options, selected) => options.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`).join("");

const STARTER_MATERIALS = [
  { title: "Training Onboarding Karyawan Baru", category: "Onboarding", file_type: "Deck", description: "Deck orientasi karyawan baru: profil perusahaan, budaya kerja, tata tertib, benefit, pengenalan tim, dan checklist hari pertama.", author: "HRD" },
  { title: "Modul Onboarding: Panduan 30 Hari Pertama", category: "Onboarding", file_type: "Modul", description: "Panduan modul onboarding 30 hari: orientasi, pendampingan atasan, target awal, dan evaluasi masa probation.", author: "HRD" },
  { title: "Training Product Knowledge (Produk & Layanan)", category: "Product Knowledge", file_type: "Deck", description: "Materi pengenalan produk/layanan, keunggulan, perbandingan kompetitor, dan skenario menjawab pertanyaan pelanggan.", author: "Sales & Marketing" },
  { title: "Training SOP & Kebijakan Perusahaan", category: "SOP", file_type: "Modul", description: "Kumpulan SOP dasar: alur kerja, administrasi, keselamatan kerja, disiplin, dan Peraturan Perusahaan.", author: "HRD" },
  { title: "Training Komunikasi Efektif & Service Excellence", category: "Komunikasi", file_type: "Deck", description: "Deck komunikasi efektif: etika komunikasi internal, pelanggan, penanganan komplain, dan standar pelayanan.", author: "HRD" },
  { title: "Training Kepemimpinan Dasar untuk Supervisor", category: "Kepemimpinan", file_type: "Deck", description: "Materi dasar kepemimpinan: delegasi, coaching, umpan balik, dan pengelolaan tim.", author: "HRD" }
];

async function seedStarterMaterials(session, reload) {
  const confirmed = await confirmDialog(
    "Tambahkan 6 materi training basic (onboarding, product knowledge, SOP, komunikasi, kepemimpinan) sebagai kerangka awal?\n\nLink file dapat diisi/diedit HRD setelah materi dibuat.",
    { title: "Isi Materi Training Basic", danger: false }
  );
  if (!confirmed) return;
  try {
    for (const item of STARTER_MATERIALS) {
      await fsAdd(C.materials, { ...item, file_url: "", file_name: "", created_by: session?.nama || session?.username || "HRD" });
    }
    toast("Materi basic berhasil ditambahkan. Lengkapi link file pada tiap materi.", "success");
    reload();
  } catch (error) {
    console.error("seed training materials", error);
    toast(error.message || "Gagal mengisi materi training basic.", "error");
  }
}

async function materialModal(session, item, reload) {
  const editing = Boolean(item?.id);
  openModal({
    title: editing ? "Edit Modul / Deck Training" : "Tambah Modul / Deck Training",
    size: "lg",
    bodyHtml: `
      <form id="material-form" class="space-y-4">
        <label class="block text-xs font-semibold text-slate-600">Judul Modul / Deck *
          <input id="m-title" required value="${esc(item?.title || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: Training Product Knowledge Batch 1">
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block text-xs font-semibold text-slate-600">Kategori Training
            <select id="m-category" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">${materialOptions(MATERIAL_CATEGORIES, item?.category || "Onboarding")}</select>
          </label>
          <label class="block text-xs font-semibold text-slate-600">Tipe File
            <select id="m-type" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm bg-white">${materialOptions(MATERIAL_TYPES, item?.file_type || "Modul")}</select>
          </label>
        </div>
        <label class="block text-xs font-semibold text-slate-600">Link File (Google Drive / URL)
          <input id="m-url" type="url" value="${esc(item?.file_url || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="https://drive.google.com/...">
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block text-xs font-semibold text-slate-600">Nama File
            <input id="m-filename" value="${esc(item?.file_name || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: Deck_Product_Knowledge.pdf">
          </label>
          <label class="block text-xs font-semibold text-slate-600">Penyusun / Divisi
            <input id="m-author" value="${esc(item?.author || "")}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Cth: HRD / Sales & Marketing">
          </label>
        </div>
        <label class="block text-xs font-semibold text-slate-600">Deskripsi Singkat
          <textarea id="m-desc" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" placeholder="Isi materi, sasaran peserta, dan catatan penggunaan…">${esc(item?.description || "")}</textarea>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="m-cancel" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
          <button type="submit" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">${editing ? "Simpan Perubahan" : "Tambah Materi"}</button>
        </div>
      </form>`,
    onMount: backdrop => {
      const form = backdrop.querySelector("#material-form");
      backdrop.querySelector("#m-cancel")?.addEventListener("click", closeModal);
      form.onsubmit = async event => {
        event.preventDefault();
        const payload = {
          title: val(form, "#m-title"),
          category: val(form, "#m-category"),
          file_type: val(form, "#m-type"),
          file_url: val(form, "#m-url"),
          file_name: val(form, "#m-filename"),
          author: val(form, "#m-author"),
          description: val(form, "#m-desc")
        };
        if (!payload.title) return toast("Judul modul wajib diisi.", "warning");
        if (payload.file_url && !/^https?:\/\//i.test(payload.file_url)) return toast("Link materi harus diawali http:// atau https://", "warning");
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true; button.textContent = "Menyimpan…";
        try {
          if (editing) await fsUpdate(C.materials, item.id, payload);
          else await fsAdd(C.materials, payload);
          toast(editing ? "Modul / deck training diperbarui." : "Modul / deck training ditambahkan.", "success");
          closeModal();
          reload();
        } catch (error) {
          console.error("save training material", error);
          toast(error.message || "Gagal menyimpan modul / deck training.", "error");
          button.disabled = false; button.textContent = editing ? "Simpan Perubahan" : "Tambah Materi";
        }
      };
    }
  });
}

async function renderLibrary(wrap, session, data, reload) {
  const materials = (data.materials || []).slice().sort((a, b) =>
    String(categoryLabel(a.category)).localeCompare(String(categoryLabel(b.category)), "id") ||
    String(a.title || "").localeCompare(String(b.title || ""), "id")
  );
  const canManage = isHrd(session);
  const categories = [...new Set(materials.map(item => item.category || "Lainnya"))];
  const chipActive = "rounded-full bg-maroon-700 px-3 py-1.5 text-[11px] font-semibold text-white";
  const chipIdle = "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600";
  wrap.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold text-slate-800">Modul &amp; Deck Training</h2>
        <p class="text-xs text-slate-400">Pustaka file modul, deck, dan video untuk training basic: onboarding, product knowledge, SOP, komunikasi, dan lainnya.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        ${canManage && materials.length === 0 ? `<button id="seed-materials" class="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">Isi Materi Basic (Starter)</button>` : ""}
        ${canManage ? `<button id="add-material" class="rounded-lg bg-maroon-700 px-4 py-2 text-xs font-semibold text-white">+ Tambah Modul / Deck</button>` : ""}
      </div>
    </div>
    <div class="flex flex-col lg:flex-row lg:items-center gap-3">
      <input id="material-search" type="search" placeholder="Cari judul, kategori, atau penyusun…" class="w-full lg:w-80 rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <div id="material-chips" class="flex flex-wrap gap-2">
        <button type="button" data-chip="" class="${chipActive}">Semua (${materials.length})</button>
        ${categories.map(category => `<button type="button" data-chip="${esc(category)}" class="${chipIdle}">${esc(categoryLabel(category))} (${materials.filter(item => (item.category || "Lainnya") === category).length})</button>`).join("")}
      </div>
    </div>
    <div id="material-grid" class="grid md:grid-cols-2 xl:grid-cols-3 gap-4"></div>`;

  const grid = wrap.querySelector("#material-grid");
  const searchInput = wrap.querySelector("#material-search");
  const chips = [...wrap.querySelectorAll("[data-chip]")];
  let activeCategory = "";
  let query = "";

  function draw() {
    const rows = materials.filter(item => {
      const matchCategory = !activeCategory || (item.category || "Lainnya") === activeCategory;
      const haystack = [item.title, item.category, item.file_type, item.author, item.description].join(" ").toLowerCase();
      return matchCategory && (!query || haystack.includes(query));
    });
    grid.innerHTML = rows.map(item => `
      <article class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-md bg-maroon-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-maroon-700">${esc(categoryLabel(item.category))}</span>
          <span class="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">${esc(item.file_type || "Modul")}</span>
        </div>
        <h3 class="mt-3 font-bold text-slate-800 leading-snug">${esc(item.title || "Tanpa Judul")}</h3>
        <p class="mt-1 text-xs text-slate-500">${esc(item.description || "Belum ada deskripsi materi.")}</p>
        <p class="mt-2 text-[10px] text-slate-400">${item.author ? `Penyusun: ${esc(item.author)} · ` : ""}Diperbarui ${dateText(item.updated_at || item.created_at)}${item.file_name ? ` · ${esc(item.file_name)}` : ""}</p>
        <div class="mt-auto pt-4 flex flex-wrap gap-2">
          ${item.file_url
            ? `<a href="${esc(item.file_url)}" target="_blank" rel="noopener noreferrer" class="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white">Buka Materi</a>`
            : `<span class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Link belum diatur HRD</span>`}
          ${canManage ? `<button type="button" data-edit-material="${esc(item.id)}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Edit</button>
          <button type="button" data-delete-material="${esc(item.id)}" class="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Hapus</button>` : ""}
        </div>
      </article>`).join("") || empty(materials.length ? "Tidak ada materi yang cocok dengan pencarian / filter." : "Belum ada modul atau deck training.");

    grid.querySelectorAll("[data-edit-material]").forEach(button => button.onclick = () => materialModal(session, materials.find(entry => entry.id === button.dataset.editMaterial), reload));
    grid.querySelectorAll("[data-delete-material]").forEach(button => button.onclick = async () => {
      const target = materials.find(entry => entry.id === button.dataset.deleteMaterial);
      const confirmed = await confirmDialog(`Hapus materi "${target?.title || "-"}" dari pustaka training?`, { title: "Hapus Materi Training", danger: true });
      if (!confirmed) return;
      try {
        await trainingApi({ action: "delete_material", id: button.dataset.deleteMaterial });
        toast("Materi training dihapus.", "success");
        reload();
      } catch (error) {
        console.error("delete training material", error);
        toast(error.message || "Gagal menghapus materi training.", "error");
      }
    });
  }

  searchInput.oninput = () => { query = searchInput.value.trim().toLowerCase(); draw(); };
  chips.forEach(chip => chip.onclick = () => {
    activeCategory = chip.dataset.chip || "";
    chips.forEach(other => other.className = other === chip ? chipActive : chipIdle);
    draw();
  });
  wrap.querySelector("#add-material")?.addEventListener("click", () => materialModal(session, null, reload));
  wrap.querySelector("#seed-materials")?.addEventListener("click", () => seedStarterMaterials(session, reload));
  draw();
}

async function renderMy(wrap, session, data, reload) {
  const assignments=data.assignments.filter(item=>participantMatchesSession(item,session)), plans=data.plans.filter(plan=>planParticipants(plan).some(item=>participantMatchesSession(item,session))), progressMap=Object.fromEntries(data.progress.filter(item=>participantMatchesSession(item,session)).map(item=>[item.plan_id,item]));
  wrap.innerHTML=`<div><h2 class="text-lg font-bold text-slate-800">Pelatihan Saya</h2><p class="text-xs text-slate-400">Survey, pre-test, post-test, dan evaluasi yang ditugaskan kepada akun Anda.</p></div><section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">Survey TNA</h3><div class="mt-4 grid md:grid-cols-2 gap-3">${assignments.map(a=>`<div class="rounded-xl border p-4"><b class="text-sm">${esc(data.campaigns.find(c=>c.id===a.campaign_id)?.title||"Survey TNA")}</b><p class="text-xs text-slate-400">${esc(a.status)}</p>${a.status!=="SUBMITTED"?`<button data-survey="${a.id}" class="mt-3 rounded bg-maroon-700 px-3 py-2 text-xs text-white">Isi survey</button>`:`<span class="mt-3 inline-block text-xs font-bold text-emerald-600">Sudah dikirim</span>`}</div>`).join("")||empty("Belum ada survey yang dipublikasikan untuk akun Anda.")}</div></section><section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">Program & Evaluasi</h3><p class="mt-1 text-xs text-slate-400">Pre-test dan post-test muncul setelah HRD memasukkan Anda sebagai peserta program.</p><div class="mt-4 grid lg:grid-cols-2 gap-3">${plans.map(p=>{const pr=progressMap[p.id]||{};return `<div class="rounded-xl border p-4"><b>${esc(p.title||p.judul)}</b><p class="text-xs text-slate-400">${dateText(p.start_date||p.tanggal)} · ${esc(p.status)}</p><div class="mt-3 flex flex-wrap gap-2"><button data-assess="pre:${p.id}" class="rounded border px-3 py-2 text-xs">${pr.pretest_score==null?"Isi pre-test":`Pre-test ${pr.pretest_score}`}</button><button data-assess="post:${p.id}" class="rounded border px-3 py-2 text-xs" ${pr.pretest_score==null?"disabled":""}>${pr.posttest_score==null?"Isi post-test":`Post-test ${pr.posttest_score}`}</button><button data-feedback="${p.id}" class="rounded border px-3 py-2 text-xs">${pr.feedback_score?`Feedback ${pr.feedback_score}/5`:"Isi feedback"}</button></div></div>`}).join("")||empty("Anda belum terdaftar sebagai peserta program pelatihan.")}</div></section>`;
  wrap.querySelectorAll("[data-survey]").forEach(btn=>btn.onclick=()=>surveyResponseModal(assignments.find(a=>a.id===btn.dataset.survey),session,reload,data));
  wrap.querySelectorAll("[data-assess]").forEach(btn=>btn.onclick=()=>{const [kind,id]=btn.dataset.assess.split(":");assessmentModal(data.plans.find(p=>p.id===id),progressMap[id],kind,session,reload);});
  wrap.querySelectorAll("[data-feedback]").forEach(btn=>btn.onclick=()=>feedbackModal(data.plans.find(p=>p.id===btn.dataset.feedback),progressMap[btn.dataset.feedback],session,reload));
}

function surveyResponseModal(assignment, session, reload, data = {}) {
  const campaign = (data.campaigns || []).find(item => item.id === assignment.campaign_id) || null;
  const competencies = Array.isArray(assignment.competencies) && assignment.competencies.length
    ? assignment.competencies
    : (Array.isArray(campaign?.competencies) ? campaign.competencies : []);
  const levelDescriptions = ["Belum menguasai", "Dasar", "Cukup", "Baik", "Sangat mahir"];
  const urgencyDescriptions = ["Tidak mendesak", "Rendah", "Sedang", "Tinggi", "Sangat mendesak"];
  openModal({
    title: "Isi Survey Kebutuhan Pelatihan",
    size: "lg",
    bodyHtml: `<div id="survey-response" class="space-y-4"><div class="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">Klik satu angka 1–5 pada setiap skala. Semua skala wajib dijawab sebelum survey dikirim.</div>${competencies.length ? competencies.map((competency, index) => `<section class="rounded-xl border border-slate-200 p-4"><div><b class="text-sm text-slate-800">${index + 1}. ${esc(competency.name)}</b><p class="text-xs text-slate-400">Level yang dibutuhkan perusahaan: ${Number(competency.expected_level || 3)}/5</p></div><div class="mt-4 space-y-4">${clickableScale(`current-${index}`, "Level kemampuan Anda saat ini", levelDescriptions)}${clickableScale(`urgency-${index}`, "Seberapa mendesak pelatihan ini bagi pekerjaan Anda", urgencyDescriptions)}<label class="block text-xs font-semibold text-slate-600">Alasan / contoh kebutuhan dalam pekerjaan<textarea data-reason="${index}" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Opsional: jelaskan tugas atau kendala yang terkait"></textarea></label></div></section>`).join("") : `<div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Kompetensi survey belum ditemukan. Pastikan survey dibagikan ulang setelah kompetensi disimpan.</div>`}</div>`,
    footerHtml: `<button id="submit-survey" class="rounded bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">Kirim survey</button>`,
    onMount: modal => modal.querySelector("#submit-survey").onclick = async event => {
      const root = modal.querySelector("#survey-response");
      const responses = competencies.map((competency, index) => ({
        competency_name: competency.name,
        expected_level: Number(competency.expected_level),
        business_impact: Number(competency.business_impact || 3),
        current_level: Number(root.querySelector(`[name="current-${index}"]:checked`)?.value || 0),
        urgency: Number(root.querySelector(`[name="urgency-${index}"]:checked`)?.value || 0),
        reason: root.querySelector(`[data-reason="${index}"]`)?.value?.trim() || ""
      }));
      if (responses.some(response => response.current_level < 1 || response.urgency < 1)) return toast("Pilih nilai kemampuan dan urgensi untuk seluruh kompetensi.", "warning");
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await Promise.all(responses.map(response => fsAdd(C.needs, {
          ...response, campaign_id: assignment.campaign_id, assignment_id: assignment.id,
          nik: assignment.nik, username: assignment.username || session.username || "", email: assignment.email || session.email || "",
          nama: assignment.nama, cabang: assignment.cabang, divisi: assignment.divisi, jabatan: assignment.jabatan, validation_status: "PENDING"
        }, `${assignment.id}_${response.competency_name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`)));
        await fsUpdate(C.assignments, assignment.id, { status: "SUBMITTED", responses, submitted_at: new Date().toISOString() });
        await audit(session, "SUBMIT_SURVEY", "assignment", assignment.id, { needs: responses.length });
        closeModal();
        toast("Survey berhasil dikirim.", "success");
        reload();
      } catch (error) {
        toast(error.message || "Survey gagal dikirim.", "error");
        button.disabled = false;
      }
    }
  });
}

function assessmentModal(plan, progress={}, kind, session, reload) {
  const questions=planQuestions(plan),label=kind==="pre"?"Pre-test":"Post-test";
  openModal({title:`${label}: ${esc(plan.title||plan.judul)}`,size:"lg",bodyHtml:`<div id="assessment" class="space-y-4">${questions.map((q,i)=>`<div><p class="text-sm font-semibold">${i+1}. ${esc(q.question)}</p><select data-answer="${i}" class="mt-2 rounded-lg border px-3 py-2 text-sm"><option value="Benar">Benar</option><option value="Salah">Salah</option></select></div>`).join("")}</div>`,footerHtml:`<button id="submit-assessment" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Kirim jawaban</button>`,onMount:modal=>modal.querySelector("#submit-assessment").onclick=async()=>{const answers=[...modal.querySelectorAll("[data-answer]")].map(x=>x.value),correct=answers.filter((a,i)=>a.toLowerCase()===String(questions[i].answer||"Benar").toLowerCase()).length,score=Math.round(correct/questions.length*100),identity=myNik(session)||session.username,id=`${plan.id}_${identity}`;await fsUpdate(C.progress,id,{plan_id:plan.id,nik:myNik(session),username:session.username||"",email:session.email||"",nama:session.nama,cabang:session.cabang||"",divisi:session.divisi||"",[`${kind}test_score`]:score,[`${kind}test_at`]:new Date().toISOString()});await audit(session,`SUBMIT_${kind.toUpperCase()}TEST`,"progress",id,{score});closeModal();toast(`${label} selesai. Nilai: ${score}`,"success");reload();}});
}

function feedbackModal(plan, progress={}, session, reload) {
  openModal({title:`Evaluasi: ${esc(plan.title||plan.judul)}`,bodyHtml:`<div id="feedback" class="space-y-4">${field("Nilai kepuasan (1–5)","f-score","number","min='1' max='5' value='5'")}<label class="text-xs font-semibold text-slate-600">Manfaat dan saran<textarea id="f-note" rows="4" class="mt-1 w-full rounded-lg border px-3 py-2"></textarea></label></div>`,footerHtml:`<button id="save-feedback" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Kirim evaluasi</button>`,onMount:modal=>modal.querySelector("#save-feedback").onclick=async()=>{const root=modal.querySelector("#feedback"),identity=myNik(session)||session.username,id=`${plan.id}_${identity}`;await fsUpdate(C.progress,id,{plan_id:plan.id,nik:myNik(session),username:session.username||"",email:session.email||"",nama:session.nama,cabang:session.cabang||"",divisi:session.divisi||"",feedback_score:Number(val(root,"#f-score")),feedback_note:val(root,"#f-note"),feedback_at:new Date().toISOString()});await audit(session,"SUBMIT_FEEDBACK","progress",id);closeModal();toast("Evaluasi berhasil dikirim.","success");reload();}});
}

async function renderReport(wrap, session, data, reload) {
  // Branch Manager hanya melihat laporan untuk cabangnya sendiri.
  const branchScope = resolveBranchScope(session);
  const scoped = branchScope ? {
    ...data,
    needs: data.needs.filter(n => branchMatches(branchScope, n.cabang)),
    plans: data.plans.filter(p => planInBranch(p, branchScope)),
    progress: data.progress.filter(p => branchMatches(branchScope, p.cabang) || planInBranch(data.plans.find(x => x.id === p.plan_id) || {}, branchScope))
  } : data;
  const metrics=trainingMetrics(scoped),byBranch=aggregateNeeds(scoped.needs,"cabang"),byDivision=aggregateNeeds(scoped.needs,"divisi"),totalBudget=scoped.plans.reduce((s,p)=>s+Number(p.actual_cost||p.budget_estimate||p.estimasi_biaya||0),0),passed=scoped.progress.filter(p=>p.posttest_score>=Number(scoped.plans.find(x=>x.id===p.plan_id)?.passing_grade||70)).length;
  const toNumber = value => value === null || value === undefined || value === "" ? NaN : Number(value);
  const impactPlans = scoped.plans.filter(p => p.result_metric).map(plan => {
    const baseline = toNumber(plan.baseline_value), target = toNumber(plan.target_value), actual = toNumber(plan.actual_value);
    const hasNumbers = Number.isFinite(baseline) && Number.isFinite(target) && Number.isFinite(actual);
    const achievement = hasNumbers && target !== baseline ? Math.round((actual - baseline) / (target - baseline) * 1000) / 10 : null;
    const achieved = hasNumbers ? (target >= baseline ? actual >= target : actual <= target) : null;
    return { ...plan, baseline, target, actual, achievement, achieved, hasNumbers };
  });
  const impactSection = `<section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">Hasil dampak level 4</h3><p class="mt-1 text-xs text-slate-400">Metrik hasil kerja yang ditetapkan saat perencanaan dan diukur setelah pelatihan.</p><div class="mt-3 overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="py-2 text-left">Program</th><th class="text-left">Metrik</th><th>Baseline</th><th>Target</th><th>Aktual</th><th>Capaian</th><th>Status</th></tr></thead><tbody>${impactPlans.map(plan => `<tr class="border-t"><td class="py-2 font-semibold">${esc(plan.title || plan.judul)}</td><td>${esc(plan.result_metric)}${plan.result_unit ? ` (${esc(plan.result_unit)})` : ""}</td><td class="text-center">${plan.hasNumbers ? plan.baseline : "-"}</td><td class="text-center">${plan.hasNumbers ? plan.target : "-"}</td><td class="text-center">${plan.hasNumbers ? plan.actual : "-"}</td><td class="text-center">${plan.achievement === null ? "-" : `${plan.achievement}%`}</td><td class="text-center font-semibold ${plan.achieved === null ? "text-slate-400" : plan.achieved ? "text-emerald-600" : "text-amber-600"}">${plan.achieved === null ? "Belum ada hasil" : plan.achieved ? "Tercapai" : "Belum tercapai"}</td></tr>`).join("") || `<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada program dengan metrik hasil level 4.</td></tr>`}</tbody></table></div></section>`;
  wrap.innerHTML=`<div class="flex justify-between items-center"><div><h2 class="text-lg font-bold text-slate-800">Laporan Manajemen</h2><p class="text-xs text-slate-400">Ringkasan efektivitas, kebutuhan organisasi, dan investasi pelatihan.</p></div><button id="export-report" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Export CSV</button></div><div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${statCard("Response rate",`${metrics.responseRate}%`)}${statCard("Program selesai",`${metrics.completedPlans}/${metrics.plans}`)}${statCard("Lulus post-test",passed)}${statCard("Total investasi",money(totalBudget))}</div><div class="grid lg:grid-cols-2 gap-5">${reportTable("Prioritas per cabang",byBranch)}${reportTable("Prioritas per divisi",byDivision)}</div>${impactSection}<section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">Evaluasi dampak 30–60 hari</h3><p class="mt-1 text-xs text-slate-400">Atasan mencatat perubahan perilaku dan hasil kerja setelah pelatihan.</p><div class="mt-4 space-y-2">${scoped.progress.map(p=>`<div class="rounded-xl border p-3 flex justify-between items-center gap-3"><div class="text-xs"><b>${esc(p.nama)}</b> · ${esc(scoped.plans.find(x=>x.id===p.plan_id)?.title||p.plan_id)}<br><span class="text-slate-400">Perilaku: ${esc(p.behavior_score||"-")}/5 · ${esc(p.behavior_note||"Belum dinilai")}</span></div>${isManagement(session)?`<button data-followup="${p.id}" class="rounded border px-3 py-2 text-xs">Nilai dampak</button>`:""}</div>`).join("")||empty("Belum ada peserta yang dievaluasi.")}</div></section>`;
  wrap.querySelector("#export-report").onclick=()=>exportReport(scoped);
  const analysisSection = document.createElement("section"); analysisSection.innerHTML = renderTrainingNeedsAnalysis(scoped, session); wrap.appendChild(analysisSection);
  wrap.querySelectorAll("[data-followup]").forEach(btn=>btn.onclick=()=>followupModal(data.progress.find(p=>p.id===btn.dataset.followup),session,reload));
}

function reportTable(title, rows) { return `<section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">${title}</h3><table class="mt-3 w-full text-xs"><thead><tr class="text-slate-400"><th class="py-2 text-left">Unit</th><th>Orang</th><th>Penilaian</th><th>Gap</th><th>Prioritas</th></tr></thead><tbody>${rows.map(r=>`<tr class="border-t"><td class="py-2 font-semibold">${esc(r.key)}</td><td class="text-center">${r.respondents ?? r.count}</td><td class="text-center">${r.count}</td><td class="text-center">${r.averageGap.toFixed(1)}</td><td class="text-center">${r.averagePriority.toFixed(1)}</td></tr>`).join("")}</tbody></table></section>`; }

function followupModal(progress, session, reload) {
  openModal({title:`Evaluasi Dampak: ${esc(progress.nama)}`,bodyHtml:`<div id="followup" class="space-y-4">${field("Perubahan perilaku (1–5)","b-score","number",`min='1' max='5' value='${progress.behavior_score||3}'`)}<label class="text-xs font-semibold">Bukti perubahan / hasil kerja<textarea id="b-note" rows="4" class="mt-1 w-full rounded-lg border px-3 py-2">${esc(progress.behavior_note||"")}</textarea></label></div>`,footerHtml:`<button id="save-followup" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Simpan</button>`,onMount:modal=>modal.querySelector("#save-followup").onclick=async()=>{const root=modal.querySelector("#followup");await fsUpdate(C.progress,progress.id,{behavior_score:Number(val(root,"#b-score")),behavior_note:val(root,"#b-note"),behavior_reviewed_by:session.nama,behavior_reviewed_at:new Date().toISOString()});await audit(session,"BEHAVIOR_REVIEW","progress",progress.id);closeModal();toast("Evaluasi dampak tersimpan.","success");reload();}});
}

function trainingNeedStatement(need) {
  const gap = competencyGap(Number(need.expected_level), Number(need.current_level));
  const urgency = Number(need.urgency || 0);
  const impact = Number(need.business_impact || 3);
  const parts = [];
  if (gap >= 2) parts.push(`gap level ${gap} menunjukkan selisih kemampuan cukup besar`);
  if (urgency >= 4) parts.push(`urgensi tinggi (${urgency}/5) dari pekerjaan nyata`);
  if (impact >= 4) parts.push(`dampak bisnis tinggi (${impact}/5)`);
  if (need.reason) parts.push(`alasan karyawan: ${escapeHtml(need.reason)}`);
  return parts.join("; ") || "berdasarkan skor survei mandiri yang belum optimal";
}

function topNeeds(needs = [], limit = 3) {
  return needs
    .slice()
    .sort((a, b) => needPriorityScore(b) - needPriorityScore(a))
    .slice(0, limit);
}

function groupedTopNeeds(needs = [], dimension = "cabang") {
  const groups = new Map();
  needs.forEach(need => {
    const key = String(need[dimension] || "Belum ditentukan").trim() || "Belum ditentukan";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(need);
  });
  return [...groups.entries()].sort((a, b) => {
    const pa = aggregateNeeds(b[1], "competency_name")[0]?.averagePriority || 0;
    const pb = aggregateNeeds(a[1], "competency_name")[0]?.averagePriority || 0;
    return pa - pb;
  }).map(([key, items]) => {
    const ranking = aggregateNeeds(items, "competency_name");
    return { key, items, count: items.length, respondents: uniqueRespondentCount(items), top: ranking[0] || null, ranking, averageGap: ranking.length ? ranking.reduce((s, x) => s + x.averageGap, 0) / ranking.length : 0 };
  });
}

function renderTrainingNeedsAnalysis(data = {}, session = {}) {
  const branchScope = resolveBranchScope(session);
  const needs = branchScope ? (data.needs || []).filter(n => branchMatches(branchScope, n.cabang)) : (data.needs || []);
  if (!needs.length) return `<section class="mt-6 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Belum ada respons survei TNA untuk dianalisis.</section>`;

  const overall = aggregateNeeds(needs, "competency_name");
  const topOverall = overall[0];
  const response = responseStandardMet(data);
  const respondentCount = uniqueRespondentCount(needs);
  const byBranch = groupedTopNeeds(needs, "cabang");
  const byDivision = groupedTopNeeds(needs, "divisi");
  const personMap = new Map();
  needs.forEach(need => {
    const key = String(need.nik || need.nama || need.id || "").trim();
    if (!personMap.has(key)) personMap.set(key, { nama: need.nama, nik: need.nik, cabang: need.cabang, divisi: need.divisi, needs: [] });
    personMap.get(key).needs.push(need);
  });
  const people = [...personMap.values()].sort((a, b) => (aggregateNeeds(b.needs, "competency_name")[0]?.averagePriority || 0) - (aggregateNeeds(a.needs, "competency_name")[0]?.averagePriority || 0));

  const sectionTitle = heading => `<h2 class="text-lg font-bold text-slate-800 mb-2">${escapeHtml(heading)}</h2><p class="text-xs text-slate-400 mb-4">Analisis berdasarkan respons survei mandiri karyawan. Prioritas digunakan untuk memilih modul training paling mendesak per individu, divisi, cabang, dan seluruh CV Andela Jaya. Status keputusan mengikuti ambang response rate dan jumlah responden unik.</p>`;
  const responseNote = response.hasAssignments
    ? `Response rate ${response.rate}% (${response.submitted}/${response.total} penerima) dan ${respondentCount} responden unik.`
    : `Data penugasan survey tidak tersedia; ${respondentCount} responden unik tercatat dari data kebutuhan.`;

  return `
    <section class="mt-6 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-6">
      ${sectionTitle("Analisis Kebutuhan Training Berbasis Survey")}
      <div class="rounded-xl border ${response.ok ? "border-emerald-100 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"} p-4 text-sm">
        <b>${response.ok ? "Keputusan organisasi" : "Indikasi awal"}:</b> prioritas tertinggi adalah
        <b>${escapeHtml(topOverall?.key || "tidak tersedia")}</b> dengan rata-rata gap
        <b>${Number(topOverall?.averageGap || 0).toFixed(1)}</b> dan skor prioritas
        <b>${Number(topOverall?.averagePriority || 0).toFixed(1)}</b>.
        ${response.ok
          ? "Data memenuhi ambang minimal sehingga dapat dijadikan dasar keputusan program."
          : `Hasil belum memenuhi ambang minimal ${response.minResponseRate}% dan ${response.minRespondents} responden unik, sehingga diperlakukan sebagai indikasi awal dan perlu konfirmasi atasan.`}
        <p class="mt-2 text-xs opacity-80">${responseNote}</p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
        Ambang validasi: minimal <b>${response.minResponseRate}%</b> response rate dan <b>${response.minRespondents}</b> responden unik. Angka responden pada tabel dihitung per orang, bukan jumlah baris kompetensi.
      </div>
      <div>
        <h3 class="font-bold text-slate-800">Per Cabang</h3>
        <div class="overflow-x-auto mt-3">
          <table class="min-w-full text-xs border border-slate-100">
            <thead class="bg-slate-50 text-slate-500"><tr><th class="px-4 py-3 text-left">Cabang</th><th class="px-4 py-3 text-left">Responden</th><th class="px-4 py-3 text-left">Kebutuhan Utama</th><th class="px-4 py-3 text-left">Gap</th><th class="px-4 py-3 text-left">Penjelasan</th></tr></thead>
            <tbody>
              ${byBranch.map(scope => {
                const need = scope.top?.key ? scope.items.find(item => item.competency_name === scope.top.key) : null;
                return `<tr class="border-t border-slate-100">
                  <td class="px-4 py-3 font-semibold">${escapeHtml(scope.key)}</td>
                  <td class="px-4 py-3">${scope.respondents} orang<br><span class="text-[10px] text-slate-400">${scope.count} penilaian</span></td>
                  <td class="px-4 py-3"><b>${escapeHtml(scope.top?.key || "-")}</b></td>
                  <td class="px-4 py-3">${Number(scope.top?.averageGap || 0).toFixed(1)}</td>
                  <td class="px-4 py-3">Dibutuhkan ${scope.top?.key || "kompetensi tertentu"} karena ${trainingNeedStatement(need || { expected_level: scope.top?.averageGap, current_level: 0, business_impact: need?.business_impact || 3, urgency: need?.urgency || 3, reason: need?.reason })}.</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 class="font-bold text-slate-800">Per Divisi</h3>
        <div class="overflow-x-auto mt-3">
          <table class="min-w-full text-xs border border-slate-100">
            <thead class="bg-slate-50 text-slate-500"><tr><th class="px-4 py-3 text-left">Divisi</th><th class="px-4 py-3 text-left">Responden</th><th class="px-4 py-3 text-left">Kebutuhan Utama</th><th class="px-4 py-3 text-left">Gap</th><th class="px-4 py-3 text-left">Penjelasan</th></tr></thead>
            <tbody>
              ${byDivision.map(scope => {
                const need = scope.top?.key ? scope.items.find(item => item.competency_name === scope.top.key) : null;
                return `<tr class="border-t border-slate-100">
                  <td class="px-4 py-3 font-semibold">${escapeHtml(scope.key)}</td>
                  <td class="px-4 py-3">${scope.respondents} orang<br><span class="text-[10px] text-slate-400">${scope.count} penilaian</span></td>
                  <td class="px-4 py-3"><b>${escapeHtml(scope.top?.key || "-")}</b></td>
                  <td class="px-4 py-3">${Number(scope.top?.averageGap || 0).toFixed(1)}</td>
                  <td class="px-4 py-3">${escapeHtml(scope.key)} paling membutuhkan ${scope.top?.key || "pengembangan"}, dengan gap ${Number(scope.top?.averageGap || 0).toFixed(1)} dan ${scope.count} penilaian dari ${scope.respondents} responden.</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 class="font-bold text-slate-800">Per Individu</h3>
        <div class="grid lg:grid-cols-2 gap-3 mt-3">
          ${people.map(person => {
            const ranking = aggregateNeeds(person.needs, "competency_name");
            const top = ranking[0];
            return `<article class="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div class="flex justify-between gap-3"><div><b>${escapeHtml(person.nama || "-")}</b><br><span class="text-[11px] text-slate-400">${escapeHtml(person.nik || "-")} · ${escapeHtml(person.cabang || "-")} / ${escapeHtml(person.divisi || "-")}</span></div><b class="text-xs">${escapeHtml(priorityLabel(needPriorityScore(top)))}</b></div>
              <ul class="mt-3 space-y-2 text-xs text-slate-600">
                ${topNeeds(person.needs).map(need => `<li><b>${escapeHtml(need.competency_name)}</b>: level ${need.current_level} → ${need.expected_level}, gap ${competencyGap(need.expected_level, need.current_level)}, urgensi ${need.urgency || 0}/5, dampak ${need.business_impact || 0}/5.<br><span class="text-slate-400">${escape(need.reason)}</span></li>`).join("") || "<li>Belum ada kebutuhan yang tercatat.</li>"}
              </ul>
              <p class="mt-3 text-[11px] text-slate-500">Kesimpulan: ${top ? `${escapeHtml(person.nama)} sebaiknya diprioritaskan untuk pelatihan ${escapeHtml(top.key)} karena ${trainingNeedStatement(top)}; skor prioritas ${needPriorityScore(top)}.` : "Belum cukup data."}</p>
            </article>`;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function escape(value) {
  return escapeHtml(value ?? "");
}
function exportReport(data) {
  const toNumber = value => value === null || value === undefined || value === "" ? NaN : Number(value);
  const achievement = plan => {
    const baseline = toNumber(plan.baseline_value), target = toNumber(plan.target_value), actual = toNumber(plan.actual_value);
    if (![baseline, target, actual].every(Number.isFinite) || target === baseline) return "";
    return `${Math.round((actual - baseline) / (target - baseline) * 1000) / 10}%`;
  };
  const rows=[
    ["Jenis","Unit/Program","Jumlah/Orang","Penilaian","Gap Rata-rata","Biaya","Status","Metrik Hasil","Baseline","Target","Aktual","Capaian %"],
    ...aggregateNeeds(data.needs,"cabang").map(r=>["Cabang",r.key,r.respondents ?? r.count,r.count,r.averageGap.toFixed(1),"","","","","","",""]),
    ...aggregateNeeds(data.needs,"divisi").map(r=>["Divisi",r.key,r.respondents ?? r.count,r.count,r.averageGap.toFixed(1),"","","","","","",""]),
    ...data.plans.map(p=>["Program",p.title||p.judul,planParticipants(p).length,"","",p.actual_cost||p.budget_estimate||p.estimasi_biaya||0,p.status,p.result_metric||"",p.baseline_value??"",p.target_value??"",p.actual_value??"",achievement(p)])
  ];
  const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`laporan-training-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
}
