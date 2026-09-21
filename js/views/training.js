import { COL } from "../firebase-config.js";
import { fsGetAll as firebaseGetAll, openModal, closeModal, toast, escapeHtml, genId, notifyUser } from "../utils.js";
import { authFetch } from "../api-client.js";
import { hasPermission } from "../auth.js";
import {
  TRAINING_STATUS, aggregateNeeds, campaignTargetsEmployee, competencyGap,
  needPriorityScore, priorityLabel, safeParticipantSnapshot, trainingMetrics
} from "../training-tna.mjs";

const C = {
  campaigns: "training_tna_campaigns", assignments: "training_tna_assignments",
  needs: "training_needs", plans: "training_tna_plans", progress: "training_tna_progress",
  audit: "training_audit_logs"
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
  const response = await authFetch("/api/training", { method: "POST", body: JSON.stringify(body) });
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
  const [workflow, employees] = await Promise.all([
    trainingApi({ action: "list" }),
    isHrd(session) ? firebaseGetAll(COL.MASTER_KARYAWAN) : Promise.resolve([])
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

function planQuestions(plan) {
  return Array.isArray(plan.assessment_questions) && plan.assessment_questions.length
    ? plan.assessment_questions
    : [{ question: "Saya memahami tujuan dan materi utama pelatihan ini.", answer: "Benar" }];
}

export async function mount(container, { session }) {
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
  let active = tabs[0].id;

  async function load() {
    header.innerHTML = tabs.map(t => `<button data-tab="${t.id}" class="px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${active === t.id ? "bg-maroon-700 text-white shadow" : "bg-white border border-slate-200 text-slate-600"}">${t.label}</button>`).join("");
    header.className = "flex items-center gap-2 flex-wrap justify-end";
    header.querySelectorAll("[data-tab]").forEach(button => button.onclick = () => { active = button.dataset.tab; load(); });
    body.innerHTML = `<div class="py-20 text-center text-sm text-slate-400">Memuat data pelatihan…</div>`;
    try {
      const data = await allData(session);
      const renderers = { dashboard: renderDashboard, survey: renderSurvey, analysis: renderAnalysis, planning: renderPlanning, execution: renderExecution, report: renderReport, my: renderMy };
      await renderers[active](body, session, data, load);
    } catch (error) {
      console.error("training", error);
      body.innerHTML = `<div class="rounded-xl bg-red-50 p-4 text-sm text-red-700">Gagal memuat modul Pelatihan: ${esc(error.message)}</div>`;
    }
  }
  await load();
}

async function renderDashboard(wrap, session, data, reload) {
  const metrics = trainingMetrics(data);
  const urgent = data.needs.filter(n => needPriorityScore(n) >= 20).length;
  wrap.innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
      ${statCard("Respon survey", `${metrics.responseRate}%`, `${metrics.submitted}/${metrics.assigned} selesai`)}
      ${statCard("Kebutuhan", metrics.needs, `${urgent} prioritas tinggi/kritis`)}
      ${statCard("Program", metrics.plans, `${metrics.completedPlans} selesai`)}
      ${statCard("Learning gain", `${metrics.averageLearningGain.toFixed(1)} poin`, "Rata-rata post-test − pre-test")}
      ${statCard("Kampanye aktif", data.campaigns.filter(c => c.status === "PUBLISHED").length, "Survey sedang berjalan")}
    </div>
    <div class="grid lg:grid-cols-2 gap-5">
      <section class="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm"><h3 class="font-bold text-slate-800">Alur Training Need Analysis</h3><div class="mt-4 space-y-3 text-sm">${[
        ["1", "Survey kebutuhan", "HRD distribusikan kompetensi sasaran"], ["2", "Validasi & analitik", "Atasan mengonfirmasi gap dan urgensi"],
        ["3", "Planning & approval", "Program disusun, GM dan Finance menyetujui"], ["4", "Pelaksanaan", "Absensi, bukti, biaya aktual, pre/post-test"],
        ["5", "Evaluasi", "Feedback dan perubahan perilaku 30–60 hari"], ["6", "Laporan", "Efektivitas, biaya, cabang, divisi untuk manajemen"]
      ].map(([n,t,d]) => `<div class="flex gap-3"><span class="w-7 h-7 rounded-full bg-maroon-50 text-maroon-700 grid place-items-center font-bold">${n}</span><div><b>${t}</b><p class="text-xs text-slate-400">${d}</p></div></div>`).join("")}</div></section>
      <section class="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm"><h3 class="font-bold text-slate-800">Prioritas Kompetensi</h3><div class="mt-4 space-y-3">${aggregateNeeds(data.needs).slice(0, 7).map(row => `<div><div class="flex justify-between text-xs"><b>${esc(row.key)}</b><span>${row.count} karyawan · gap ${row.averageGap.toFixed(1)}</span></div><div class="mt-1 h-2 rounded bg-slate-100"><div class="h-2 rounded bg-maroon-600" style="width:${Math.min(100, row.averagePriority / 36 * 100)}%"></div></div></div>`).join("") || empty("Belum ada data kebutuhan.")}</div></section>
    </div>`;
}

async function renderSurvey(wrap, session, data, reload) {
  wrap.innerHTML = `<div class="flex justify-between items-center"><div><h2 class="text-lg font-bold text-slate-800">Distribusi Survey TNA</h2><p class="text-xs text-slate-400">Buat periode, sasaran, dan daftar kompetensi yang dinilai.</p></div><button id="new-campaign" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">+ Buat Survey</button></div>
    <div class="grid md:grid-cols-2 gap-4">${data.campaigns.sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).map(c => {
      const assigned = data.assignments.filter(a => a.campaign_id === c.id);
      const submitted = assigned.filter(a => a.status === "SUBMITTED").length;
      return `<article class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><div class="flex justify-between gap-3"><div><span class="text-[10px] font-bold text-maroon-700">${esc(c.period)}</span><h3 class="font-bold text-slate-800">${esc(c.title)}</h3></div><span class="text-xs font-bold ${c.status === "PUBLISHED" ? "text-emerald-600" : "text-slate-400"}">${esc(c.status)}</span></div><p class="mt-2 text-xs text-slate-500">Target: ${esc(c.target_branch || "Semua")} · ${esc(c.target_division || "Semua")} · Batas ${dateText(c.deadline)}</p><div class="mt-4 h-2 rounded bg-slate-100"><div class="h-2 rounded bg-emerald-500" style="width:${assigned.length ? submitted / assigned.length * 100 : 0}%"></div></div><p class="mt-1 text-[11px] text-slate-400">${submitted}/${assigned.length} respon</p><div class="mt-4 flex gap-2">${c.status === "DRAFT" ? `<button data-publish="${c.id}" class="rounded-lg bg-maroon-700 px-3 py-2 text-xs font-semibold text-white">Publikasikan</button>` : `<button data-remind="${c.id}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Kirim pengingat</button>`}${c.status === "PUBLISHED" ? `<button data-close="${c.id}" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Tutup</button>` : ""}</div></article>`;
    }).join("") || empty("Belum ada survey TNA.")}</div>`;
  wrap.querySelector("#new-campaign").onclick = () => campaignModal(session, reload);
  wrap.querySelectorAll("[data-publish]").forEach(btn => btn.onclick = async () => {
    const campaign = data.campaigns.find(c => c.id === btn.dataset.publish);
    const targets = data.employees.filter(e => campaignTargetsEmployee(campaign, e) && !["NONAKTIF", "RESIGN"].includes(String(e.aktif_tdk_aktif || e.status || "").toUpperCase()));
    if (!targets.length) return toast("Tidak ada karyawan yang sesuai target survey.", "warning");
    btn.disabled = true;
    const rows = targets.map(employee => {
      const person = safeParticipantSnapshot(employee);
      return { id: `${campaign.id}_${person.nik}`, data: { campaign_id: campaign.id, ...person, username: employee.username || "", status: "PENDING", competencies: campaign.competencies || [], cabang: person.cabang, divisi: person.divisi } };
    });
    await trainingApi({ action: "bulk_assignments", campaignId: campaign.id, rows });
    await fsUpdate(C.campaigns, campaign.id, { status: "PUBLISHED", published_at: new Date().toISOString(), assigned_count: targets.length });
    await Promise.all(targets.filter(e => e.username).map(e => notifyUser(e.username, "Survey kebutuhan pelatihan", `Mohon isi survey ${campaign.title} sebelum ${dateText(campaign.deadline)}.`, "#training")));
    await audit(session, "PUBLISH_CAMPAIGN", "campaign", campaign.id, { target_count: targets.length });
    toast(`Survey dikirim ke ${targets.length} karyawan.`, "success"); reload();
  });
  wrap.querySelectorAll("[data-remind]").forEach(btn => btn.onclick = async () => {
    const pending = data.assignments.filter(a => a.campaign_id === btn.dataset.remind && a.status !== "SUBMITTED");
    await Promise.all(pending.filter(a => a.username).map(a => notifyUser(a.username, "Pengingat survey pelatihan", "Survey TNA Anda belum diselesaikan.", "#training")));
    await audit(session, "REMIND_CAMPAIGN", "campaign", btn.dataset.remind, { pending: pending.length });
    toast(`Pengingat diproses untuk ${pending.length} karyawan.`, "success");
  });
  wrap.querySelectorAll("[data-close]").forEach(btn => btn.onclick = async () => { await fsUpdate(C.campaigns, btn.dataset.close, { status: "CLOSED", closed_at: new Date().toISOString() }); await audit(session, "CLOSE_CAMPAIGN", "campaign", btn.dataset.close); reload(); });
}

function campaignModal(session, reload) {
  openModal({ title: "Buat Survey Training Need Analysis", size: "lg", bodyHtml: `<div id="campaign-form" class="space-y-4"><div class="grid md:grid-cols-2 gap-4">${field("Judul survey", "c-title", "text", "placeholder='TNA Semester I 2027'")}${field("Periode", "c-period", "text", "placeholder='Semester I 2027'")}${field("Batas pengisian", "c-deadline", "date")}${field("Target cabang", "c-branch", "text", "placeholder='Semua / Cirebon / Malang'")}${field("Target divisi", "c-division", "text", "placeholder='Semua / Sales / Warehouse'")}${field("Target jabatan", "c-position", "text", "placeholder='Semua / Staff / SPV'")}</div><label class="block text-xs font-semibold text-slate-600">Kompetensi yang dinilai<textarea id="c-competencies" rows="6" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Advanced Excel | 4 | 5&#10;Keselamatan Kerja | 5 | 5"></textarea><span class="font-normal text-slate-400">Satu baris: kompetensi | level harapan (1–5) | dampak bisnis (1–5)</span></label></div>`, footerHtml: `<button id="save-campaign" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">Simpan Draft</button>`, onMount: modal => {
    modal.querySelector("#save-campaign").onclick = async () => {
      const root = modal.querySelector("#campaign-form");
      const competencies = val(root, "#c-competencies").split("\n").map(line => { const [name, expected, impact] = line.split("|").map(x => x.trim()); return { name, expected_level: Math.min(5, Math.max(1, Number(expected || 3))), business_impact: Math.min(5, Math.max(1, Number(impact || 3))) }; }).filter(x => x.name);
      if (!val(root, "#c-title") || !val(root, "#c-deadline") || !competencies.length) return toast("Judul, batas pengisian, dan kompetensi wajib diisi.", "warning");
      const id = genId("TNA");
      await fsAdd(C.campaigns, { title: val(root,"#c-title"), period: val(root,"#c-period"), deadline: val(root,"#c-deadline"), target_branch: val(root,"#c-branch") || "Semua", target_division: val(root,"#c-division") || "Semua", target_position: val(root,"#c-position") || "Semua", competencies, status: "DRAFT", created_by_nik: myNik(session) }, id);
      await audit(session, "CREATE_CAMPAIGN", "campaign", id); closeModal(); toast("Draft survey disimpan.", "success"); reload();
    };
  }});
}

async function renderAnalysis(wrap, session, data, reload) {
  const branches = [...new Set(data.needs.map(n => n.cabang).filter(Boolean))].sort();
  const divisions = [...new Set(data.needs.map(n => n.divisi).filter(Boolean))].sort();
  wrap.innerHTML = `<div><h2 class="text-lg font-bold text-slate-800">Analisis Kebutuhan Pelatihan</h2><p class="text-xs text-slate-400">Gap = level harapan − level saat ini; prioritas mempertimbangkan gap, urgensi, dan dampak bisnis.</p></div><div class="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap gap-3">${select("Cabang", "filter-branch", [["","Semua"], ...branches.map(x=>[x,x])])}${select("Divisi", "filter-division", [["","Semua"], ...divisions.map(x=>[x,x])])}</div><div id="analysis-table"></div>`;
  const draw = () => {
    const branch = val(wrap,"#filter-branch"), division = val(wrap,"#filter-division");
    const rows = data.needs.filter(n => (!branch || n.cabang === branch) && (!division || n.divisi === division) && (!isManagement(session) || roleIn(session,["HRD","SUPERADMIN","GM","DIREKTUR"]) || !session.cabang || n.cabang === session.cabang));
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
  wrap.innerHTML = `<div class="flex justify-between items-center"><div><h2 class="text-lg font-bold text-slate-800">Planning & Persetujuan</h2><p class="text-xs text-slate-400">Rencana berbasis kebutuhan tervalidasi dengan peserta ber-NIK.</p></div>${canCreate ? `<button id="new-plan" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">+ Buat Program</button>` : ""}</div><div class="grid lg:grid-cols-2 gap-4">${data.plans.map(p => `<article class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><div class="flex justify-between gap-3"><div><span class="text-[10px] font-bold text-maroon-700">${esc(p.competency_name || p.kategori || "PROGRAM")}</span><h3 class="font-bold text-slate-800">${esc(p.title || p.judul)}</h3></div><b class="text-xs text-slate-500">${esc(p.status)}</b></div><p class="mt-2 text-xs text-slate-500">${dateText(p.start_date || p.tanggal)} · ${esc(p.trainer)} · ${planParticipants(p).length} peserta</p><p class="mt-1 text-xs">Estimasi ${money(p.budget_estimate || p.estimasi_biaya)}</p><div class="mt-4 flex flex-wrap gap-2">${approvalButtons(p,session)}</div></article>`).join("") || empty("Belum ada rencana program.")}</div>`;
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
  const candidates = data.employees.map(safeParticipantSnapshot).filter(p=>p.nik && p.nama);
  openModal({ title:"Buat Rencana Program Pelatihan", size:"xl", bodyHtml:`<div id="plan-form" class="space-y-4"><div class="grid md:grid-cols-2 gap-4">${field("Nama program","p-title")}${field("Kompetensi utama","p-competency")}${field("Trainer / vendor","p-trainer")}${field("Tanggal mulai","p-date","date")}${field("Metode","p-method","text","placeholder='Kelas / OJT / Coaching'")}${field("Estimasi biaya","p-budget","number","min='0'")}${field("Nilai kelulusan","p-pass","number","min='0' max='100' value='70'")}</div><label class="block text-xs font-semibold text-slate-600">Tujuan terukur<textarea id="p-objective" class="mt-1 w-full rounded-lg border px-3 py-2" rows="3"></textarea></label><label class="block text-xs font-semibold text-slate-600">Pertanyaan asesmen<textarea id="p-questions" class="mt-1 w-full rounded-lg border px-3 py-2" rows="4" placeholder="Pertanyaan | Benar"></textarea></label><div><p class="text-xs font-semibold text-slate-600 mb-2">Peserta</p><div class="max-h-56 overflow-y-auto grid md:grid-cols-2 gap-2 border rounded-xl p-3">${candidates.map((p,i)=>`<label class="flex items-center gap-2 text-xs"><input type="checkbox" data-person="${i}"><span><b>${esc(p.nama)}</b> · ${esc(p.nik)} · ${esc(p.cabang)}</span></label>`).join("")}</div></div></div>`, footerHtml:`<button id="save-plan" class="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">Kirim ke GM</button>`, onMount: modal => modal.querySelector("#save-plan").onclick = async () => {
    const root = modal.querySelector("#plan-form"); const participants = [...root.querySelectorAll("[data-person]:checked")].map(x=>candidates[Number(x.dataset.person)]);
    const questions = val(root,"#p-questions").split("\n").map(line=>{const [question,answer]=line.split("|").map(x=>x.trim()); return {question,answer:answer||"Benar"};}).filter(q=>q.question);
    if (!val(root,"#p-title") || !val(root,"#p-date") || !participants.length) return toast("Nama, tanggal, dan peserta wajib dipilih.","warning");
    const id=genId("PLAN"); await fsAdd(C.plans,{ title:val(root,"#p-title"), competency_name:val(root,"#p-competency"), trainer:val(root,"#p-trainer"), start_date:val(root,"#p-date"), method:val(root,"#p-method"), budget_estimate:Number(val(root,"#p-budget")||0), passing_grade:Number(val(root,"#p-pass")||70), objective:val(root,"#p-objective"), assessment_questions:questions, participants, participant_niks:participants.map(p=>p.nik), status:TRAINING_STATUS.PENDING_GM, gm_status:"PENDING", finance_status:"PENDING", created_by_nik:myNik(session)},id); await audit(session,"CREATE_PLAN","plan",id,{participants:participants.length}); closeModal(); toast("Rencana dikirim ke GM.","success"); reload();
  }});
}

async function renderExecution(wrap, session, data, reload) {
  const plans = data.plans.filter(p=>[TRAINING_STATUS.SCHEDULED,TRAINING_STATUS.ONGOING,TRAINING_STATUS.COMPLETED,TRAINING_STATUS.CANCELLED].includes(p.status));
  wrap.innerHTML=`<div><h2 class="text-lg font-bold text-slate-800">Pelaksanaan Training</h2><p class="text-xs text-slate-400">Catat status, kehadiran, bukti pelaksanaan, dan biaya aktual.</p></div><div class="space-y-4">${plans.map(p=>{const attendees=planParticipants(p);return `<article class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"><div class="flex flex-wrap justify-between gap-3"><div><h3 class="font-bold">${esc(p.title||p.judul)}</h3><p class="text-xs text-slate-400">${dateText(p.start_date||p.tanggal)} · ${esc(p.trainer)} · ${attendees.length} peserta</p></div><b class="text-xs">${esc(p.status)}</b></div><div class="mt-3 text-xs text-slate-500">Hadir: ${(p.attendance_niks||[]).length}/${attendees.length} · Biaya aktual: ${money(p.actual_cost)}</div>${isHrd(session)?`<div class="mt-4 flex gap-2"><button data-execute="${p.id}" class="rounded bg-maroon-700 px-3 py-2 text-xs text-white">Update pelaksanaan</button></div>`:""}</article>`}).join("")||empty("Belum ada program yang lolos persetujuan.")}</div>`;
  wrap.querySelectorAll("[data-execute]").forEach(btn=>btn.onclick=()=>executionModal(data.plans.find(p=>p.id===btn.dataset.execute),session,reload));
}

function executionModal(plan, session, reload) {
  const people=planParticipants(plan), present=new Set(plan.attendance_niks||[]);
  openModal({title:`Pelaksanaan: ${esc(plan.title||plan.judul)}`,size:"lg",bodyHtml:`<div id="exec" class="space-y-4">${select("Status","e-status",[["SCHEDULED","Terjadwal"],["ONGOING","Berjalan"],["COMPLETED","Selesai"],["CANCELLED","Dibatalkan"]])}${field("Biaya aktual","e-cost","number",`min='0' value='${Number(plan.actual_cost||0)}'`)}${field("Tautan bukti / dokumentasi","e-evidence","url",`value='${esc(plan.evidence_url||"")}'`)}<label class="block text-xs font-semibold text-slate-600">Catatan<textarea id="e-notes" rows="3" class="mt-1 w-full rounded-lg border px-3 py-2">${esc(plan.execution_notes||"")}</textarea></label><div><p class="text-xs font-semibold mb-2">Kehadiran peserta</p>${people.map((p,i)=>`<label class="flex gap-2 py-1 text-xs"><input type="checkbox" data-attendee="${i}" ${present.has(p.nik)?"checked":""}>${esc(p.nama)} · ${esc(p.nik)}</label>`).join("")}</div></div>`,footerHtml:`<button id="save-exec" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Simpan</button>`,onMount:modal=>{modal.querySelector("#e-status").value=plan.status;modal.querySelector("#save-exec").onclick=async()=>{const root=modal.querySelector("#exec"),attendance=[...root.querySelectorAll("[data-attendee]:checked")].map(x=>people[Number(x.dataset.attendee)].nik).filter(Boolean);await fsUpdate(C.plans,plan.id,{status:val(root,"#e-status"),actual_cost:Number(val(root,"#e-cost")||0),evidence_url:val(root,"#e-evidence"),execution_notes:val(root,"#e-notes"),attendance_niks:attendance});await audit(session,"UPDATE_EXECUTION","plan",plan.id,{status:val(root,"#e-status"),attendance:attendance.length});closeModal();toast("Pelaksanaan diperbarui.","success");reload();};}});
}

async function renderMy(wrap, session, data, reload) {
  const nik=myNik(session), assignments=data.assignments.filter(a=>String(a.nik)===nik), plans=data.plans.filter(p=>planParticipants(p).some(x=>String(x.nik)===nik || (!x.nik&&x.nama===session.nama))), progressMap=Object.fromEntries(data.progress.filter(p=>String(p.nik)===nik).map(p=>[p.plan_id,p]));
  wrap.innerHTML=`<div><h2 class="text-lg font-bold text-slate-800">Pelatihan Saya</h2><p class="text-xs text-slate-400">Isi survey kebutuhan, pre-test, post-test, dan evaluasi pelatihan.</p></div><section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">Survey TNA</h3><div class="mt-4 grid md:grid-cols-2 gap-3">${assignments.map(a=>`<div class="rounded-xl border p-4"><b class="text-sm">${esc(data.campaigns.find(c=>c.id===a.campaign_id)?.title||"Survey TNA")}</b><p class="text-xs text-slate-400">${esc(a.status)}</p>${a.status!=="SUBMITTED"?`<button data-survey="${a.id}" class="mt-3 rounded bg-maroon-700 px-3 py-2 text-xs text-white">Isi survey</button>`:`<span class="mt-3 inline-block text-xs font-bold text-emerald-600">Sudah dikirim</span>`}</div>`).join("")||empty("Tidak ada survey yang perlu diisi.")}</div></section><section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">Program & Evaluasi</h3><div class="mt-4 grid lg:grid-cols-2 gap-3">${plans.map(p=>{const pr=progressMap[p.id]||{};return `<div class="rounded-xl border p-4"><b>${esc(p.title||p.judul)}</b><p class="text-xs text-slate-400">${dateText(p.start_date||p.tanggal)} · ${esc(p.status)}</p><div class="mt-3 flex flex-wrap gap-2"><button data-assess="pre:${p.id}" class="rounded border px-3 py-2 text-xs">${pr.pretest_score==null?"Isi pre-test":`Pre-test ${pr.pretest_score}`}</button><button data-assess="post:${p.id}" class="rounded border px-3 py-2 text-xs" ${pr.pretest_score==null?"disabled":""}>${pr.posttest_score==null?"Isi post-test":`Post-test ${pr.posttest_score}`}</button><button data-feedback="${p.id}" class="rounded border px-3 py-2 text-xs">${pr.feedback_score?`Feedback ${pr.feedback_score}/5`:"Isi feedback"}</button></div></div>`}).join("")||empty("Anda belum terdaftar dalam program pelatihan.")}</div></section>`;
  wrap.querySelectorAll("[data-survey]").forEach(btn=>btn.onclick=()=>surveyResponseModal(assignments.find(a=>a.id===btn.dataset.survey),session,reload));
  wrap.querySelectorAll("[data-assess]").forEach(btn=>btn.onclick=()=>{const [kind,id]=btn.dataset.assess.split(":");assessmentModal(data.plans.find(p=>p.id===id),progressMap[id],kind,session,reload);});
  wrap.querySelectorAll("[data-feedback]").forEach(btn=>btn.onclick=()=>feedbackModal(data.plans.find(p=>p.id===btn.dataset.feedback),progressMap[btn.dataset.feedback],session,reload));
}

function surveyResponseModal(assignment, session, reload) {
  const competencies=assignment.competencies||[];
  openModal({title:"Isi Survey Kebutuhan Pelatihan",size:"lg",bodyHtml:`<div id="survey-response" class="space-y-4">${competencies.map((c,i)=>`<div class="rounded-xl border p-4"><b class="text-sm">${esc(c.name)}</b><p class="text-xs text-slate-400">Level harapan ${c.expected_level}/5</p><div class="mt-3 grid grid-cols-2 gap-3">${field("Level saat ini","current-${i}","number","min='1' max='5' value='1'")}${field("Urgensi","urgency-${i}","number","min='1' max='5' value='3'")}</div>${field("Alasan / contoh pekerjaan","reason-${i}","text")}</div>`).join("")}</div>`,footerHtml:`<button id="submit-survey" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Kirim survey</button>`,onMount:modal=>modal.querySelector("#submit-survey").onclick=async()=>{const root=modal.querySelector("#survey-response"),responses=competencies.map((c,i)=>({competency_name:c.name,expected_level:Number(c.expected_level),business_impact:Number(c.business_impact||3),current_level:Number(val(root,`#current-${i}`)),urgency:Number(val(root,`#urgency-${i}`)),reason:val(root,`#reason-${i}`)}));await Promise.all(responses.map(r=>fsAdd(C.needs,{...r,campaign_id:assignment.campaign_id,assignment_id:assignment.id,nik:assignment.nik,nama:assignment.nama,cabang:assignment.cabang,divisi:assignment.divisi,jabatan:assignment.jabatan,validation_status:"PENDING"},`${assignment.id}_${r.competency_name.toUpperCase().replace(/[^A-Z0-9]+/g,"_")}`)));await fsUpdate(C.assignments,assignment.id,{status:"SUBMITTED",responses,submitted_at:new Date().toISOString()});await audit(session,"SUBMIT_SURVEY","assignment",assignment.id,{needs:responses.length});closeModal();toast("Survey berhasil dikirim.","success");reload();}});
}

function assessmentModal(plan, progress={}, kind, session, reload) {
  const questions=planQuestions(plan),label=kind==="pre"?"Pre-test":"Post-test";
  openModal({title:`${label}: ${esc(plan.title||plan.judul)}`,size:"lg",bodyHtml:`<div id="assessment" class="space-y-4">${questions.map((q,i)=>`<div><p class="text-sm font-semibold">${i+1}. ${esc(q.question)}</p><select data-answer="${i}" class="mt-2 rounded-lg border px-3 py-2 text-sm"><option value="Benar">Benar</option><option value="Salah">Salah</option></select></div>`).join("")}</div>`,footerHtml:`<button id="submit-assessment" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Kirim jawaban</button>`,onMount:modal=>modal.querySelector("#submit-assessment").onclick=async()=>{const answers=[...modal.querySelectorAll("[data-answer]")].map(x=>x.value),correct=answers.filter((a,i)=>a.toLowerCase()===String(questions[i].answer||"Benar").toLowerCase()).length,score=Math.round(correct/questions.length*100),id=`${plan.id}_${myNik(session)}`;await fsUpdate(C.progress,id,{plan_id:plan.id,nik:myNik(session),nama:session.nama,cabang:session.cabang||"",divisi:session.divisi||"",[`${kind}test_score`]:score,[`${kind}test_at`]:new Date().toISOString()});await audit(session,`SUBMIT_${kind.toUpperCase()}TEST`,"progress",id,{score});closeModal();toast(`${label} selesai. Nilai: ${score}`,"success");reload();}});
}

function feedbackModal(plan, progress={}, session, reload) {
  openModal({title:`Evaluasi: ${esc(plan.title||plan.judul)}`,bodyHtml:`<div id="feedback" class="space-y-4">${field("Nilai kepuasan (1–5)","f-score","number","min='1' max='5' value='5'")}<label class="text-xs font-semibold text-slate-600">Manfaat dan saran<textarea id="f-note" rows="4" class="mt-1 w-full rounded-lg border px-3 py-2"></textarea></label></div>`,footerHtml:`<button id="save-feedback" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Kirim evaluasi</button>`,onMount:modal=>modal.querySelector("#save-feedback").onclick=async()=>{const root=modal.querySelector("#feedback"),id=`${plan.id}_${myNik(session)}`;await fsUpdate(C.progress,id,{plan_id:plan.id,nik:myNik(session),nama:session.nama,cabang:session.cabang||"",divisi:session.divisi||"",feedback_score:Number(val(root,"#f-score")),feedback_note:val(root,"#f-note"),feedback_at:new Date().toISOString()});await audit(session,"SUBMIT_FEEDBACK","progress",id);closeModal();toast("Evaluasi berhasil dikirim.","success");reload();}});
}

async function renderReport(wrap, session, data, reload) {
  const metrics=trainingMetrics(data),byBranch=aggregateNeeds(data.needs,"cabang"),byDivision=aggregateNeeds(data.needs,"divisi"),totalBudget=data.plans.reduce((s,p)=>s+Number(p.actual_cost||p.budget_estimate||p.estimasi_biaya||0),0),passed=data.progress.filter(p=>p.posttest_score>=Number(data.plans.find(x=>x.id===p.plan_id)?.passing_grade||70)).length;
  wrap.innerHTML=`<div class="flex justify-between items-center"><div><h2 class="text-lg font-bold text-slate-800">Laporan Manajemen</h2><p class="text-xs text-slate-400">Ringkasan efektivitas, kebutuhan organisasi, dan investasi pelatihan.</p></div><button id="export-report" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Export CSV</button></div><div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${statCard("Response rate",`${metrics.responseRate}%`)}${statCard("Program selesai",`${metrics.completedPlans}/${metrics.plans}`)}${statCard("Lulus post-test",passed)}${statCard("Total investasi",money(totalBudget))}</div><div class="grid lg:grid-cols-2 gap-5">${reportTable("Prioritas per cabang",byBranch)}${reportTable("Prioritas per divisi",byDivision)}</div><section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">Evaluasi dampak 30–60 hari</h3><p class="mt-1 text-xs text-slate-400">Atasan mencatat perubahan perilaku dan hasil kerja setelah pelatihan.</p><div class="mt-4 space-y-2">${data.progress.map(p=>`<div class="rounded-xl border p-3 flex justify-between items-center gap-3"><div class="text-xs"><b>${esc(p.nama)}</b> · ${esc(data.plans.find(x=>x.id===p.plan_id)?.title||p.plan_id)}<br><span class="text-slate-400">Perilaku: ${esc(p.behavior_score||"-")}/5 · ${esc(p.behavior_note||"Belum dinilai")}</span></div>${isManagement(session)?`<button data-followup="${p.id}" class="rounded border px-3 py-2 text-xs">Nilai dampak</button>`:""}</div>`).join("")||empty("Belum ada peserta yang dievaluasi.")}</div></section>`;
  wrap.querySelector("#export-report").onclick=()=>exportReport(data);
  wrap.querySelectorAll("[data-followup]").forEach(btn=>btn.onclick=()=>followupModal(data.progress.find(p=>p.id===btn.dataset.followup),session,reload));
}

function reportTable(title, rows) { return `<section class="bg-white rounded-2xl border p-5"><h3 class="font-bold">${title}</h3><table class="mt-3 w-full text-xs"><thead><tr class="text-slate-400"><th class="py-2 text-left">Unit</th><th>Orang</th><th>Gap</th><th>Prioritas</th></tr></thead><tbody>${rows.map(r=>`<tr class="border-t"><td class="py-2 font-semibold">${esc(r.key)}</td><td class="text-center">${r.count}</td><td class="text-center">${r.averageGap.toFixed(1)}</td><td class="text-center">${r.averagePriority.toFixed(1)}</td></tr>`).join("")}</tbody></table></section>`; }

function followupModal(progress, session, reload) {
  openModal({title:`Evaluasi Dampak: ${esc(progress.nama)}`,bodyHtml:`<div id="followup" class="space-y-4">${field("Perubahan perilaku (1–5)","b-score","number",`min='1' max='5' value='${progress.behavior_score||3}'`)}<label class="text-xs font-semibold">Bukti perubahan / hasil kerja<textarea id="b-note" rows="4" class="mt-1 w-full rounded-lg border px-3 py-2">${esc(progress.behavior_note||"")}</textarea></label></div>`,footerHtml:`<button id="save-followup" class="rounded bg-maroon-700 px-4 py-2 text-sm text-white">Simpan</button>`,onMount:modal=>modal.querySelector("#save-followup").onclick=async()=>{const root=modal.querySelector("#followup");await fsUpdate(C.progress,progress.id,{behavior_score:Number(val(root,"#b-score")),behavior_note:val(root,"#b-note"),behavior_reviewed_by:session.nama,behavior_reviewed_at:new Date().toISOString()});await audit(session,"BEHAVIOR_REVIEW","progress",progress.id);closeModal();toast("Evaluasi dampak tersimpan.","success");reload();}});
}

function exportReport(data) {
  const rows=[["Jenis","Unit/Program","Jumlah","Gap Rata-rata","Biaya","Status"],...aggregateNeeds(data.needs,"cabang").map(r=>["Cabang",r.key,r.count,r.averageGap.toFixed(1),"",""]),...aggregateNeeds(data.needs,"divisi").map(r=>["Divisi",r.key,r.count,r.averageGap.toFixed(1),"",""]),...data.plans.map(p=>["Program",p.title||p.judul,planParticipants(p).length,"",p.actual_cost||p.budget_estimate||p.estimasi_biaya||0,p.status])];
  const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`laporan-training-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
}
