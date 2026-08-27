import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, toSnakeCase, toast, confirmDialog, escapeHtml, genId } from "../utils.js";
import { icon, emptyState } from "../components.js";

const ROLE_OPTIONS = ["HRD", "GM", "FINANCE", "SPV", "ATASAN", "SALES", "MANAGER"];
let allForms = [];
let allEmployees = [];
let editingId = null;
let currentFields = [];
let currentLpjFields = [];
let currentFlow = [];
let currentRules = [];
let selectedAllowedUsers = ["ALL"];
let selectedNotifyUsers = [];
let notifyUserRules = [];
let notifyFilterMode = "all"; // "all" | "selected"
let dragIndex = null;
let lpjDragIndex = null;

export async function mount(container) {
 const [formsData, empData] = await Promise.all([
 fsGetAll(COL.FORM_CONFIG),
 fsGetAll(COL.MASTER_KARYAWAN).catch(() => [])
 ]);
 allForms = formsData || [];
 allEmployees = (empData || []).filter(e => e.nama_karyawan || e.nama);
 allEmployees.sort((a, b) => (a.nama_karyawan || a.nama || "").localeCompare(b.nama_karyawan || b.nama || ""));

 renderFormList(container);

 container.querySelector("#fb-new").addEventListener("click", () => openBuilder(container, null));
 container.querySelector("#fb-cancel").addEventListener("click", () => closeBuilder(container));
 container.querySelector("#fb-save").addEventListener("click", () => saveForm(container));
 container.querySelector("#fb-delete").addEventListener("click", () => deleteForm(container));

 return { unmount() {} };
}

function renderFormList(container) {
 const listEl = container.querySelector("#fb-list");
 if (!allForms.length) { listEl.innerHTML = emptyState("Belum ada formulir dibuat"); return; }
 listEl.innerHTML = allForms.map(f => `
 <button data-form="${f.id}" class="w-full text-left bg-white border border-slate-100 rounded-xl p-3.5 hover:border-maroon-200 transition ${f.id === editingId ? "ring-2 ring-maroon-300 shadow-sm" : ""}">
 <p class="text-sm font-bold text-slate-700">${escapeHtml(f.nama_form || f.id)}</p>
 <p class="text-xs text-slate-400 mt-0.5">ID: ${f.id}</p>
 </button>`).join("");
 listEl.querySelectorAll("[data-form]").forEach(btn => {
 btn.addEventListener("click", () => openBuilder(container, allForms.find(f => f.id === btn.dataset.form)));
 });
}

function normalizeFields(v) {
 if (Array.isArray(v)) return v;
 if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
 return [];
}
function normalizeArray(v) {
 if (Array.isArray(v)) return v;
 if (typeof v === "string") { try { return JSON.parse(v); } catch { return v.split(",").map(s => s.trim()).filter(Boolean); } }
 return [];
}

function openBuilder(container, form) {
 editingId = form ? form.id : null;
 currentFields = form ? JSON.parse(JSON.stringify(normalizeFields(form.fields_json))) : [];
 currentFlow = form ? normalizeArray(form.approval_flow) : ["HRD"];
 currentRules = form ? (typeof form.allowed_rules === "string" ? form.allowed_rules.split(",").map(s => s.trim()) : normalizeArray(form.allowed_rules)) : ["HRD"];
 currentLpjFields = form ? JSON.parse(JSON.stringify(normalizeFields(form.lpj_fields_json))) : [];

 // Parse Akses Personil Spesifik
 if (!form || !form.allowed_users) {
 selectedAllowedUsers = ["ALL"];
 } else if (typeof form.allowed_users === "string") {
 selectedAllowedUsers = form.allowed_users.toUpperCase() === "ALL" ? ["ALL"] : form.allowed_users.split(",").map(s => s.trim()).filter(Boolean);
 } else if (Array.isArray(form.allowed_users)) {
 selectedAllowedUsers = form.allowed_users.includes("ALL") ? ["ALL"] : [...form.allowed_users];
 } else {
 selectedAllowedUsers = ["ALL"];
 }

 // Parse Target Notifikasi & Email Spesifik (Matriks Per Personil)
 const rawRules = form?.notify_user_rules || form?.notify_targets?.user_rules || [];
 const customNotify = form?.notify_specific_users || form?.notify_targets?.specific_users || [];
 if (Array.isArray(rawRules) && rawRules.length > 0) {
 notifyUserRules = rawRules.map(r => ({
   nama: r.nama || "",
   nik: r.nik || "",
   email: r.email || "",
   info_dinas: r.info_dinas !== false && r.info_pengajuan !== false,
   approval: r.approval !== false,
   hasil_status: r.hasil_status !== false && r.final_status !== false
 })).filter(r => r.nama);
 } else if (Array.isArray(customNotify) && customNotify.length > 0) {
 notifyUserRules = customNotify.map(name => {
   const strName = typeof name === "string" ? name : (name?.nama || "");
   const emp = allEmployees.find(e => (e.nama_karyawan || e.nama || "").toLowerCase() === strName.toLowerCase());
   return {
     nama: strName,
     nik: emp ? (emp.nik_karyawan || emp.nik || "") : "",
     email: emp ? (emp.email || "") : "",
     info_dinas: true,
     approval: true,
     hasil_status: true
   };
 }).filter(r => r.nama);
 } else {
 notifyUserRules = [];
 }
 selectedNotifyUsers = notifyUserRules.map(r => r.nama);
 notifyFilterMode = "all";

 container.querySelector("#fb-empty-hint").classList.add("hidden");
 container.querySelector("#fb-builder-wrap").classList.remove("hidden");
 container.querySelector("#fb-id").value = form ? form.id : genId("F-CUSTOM");
 container.querySelector("#fb-id").disabled = !!form;
 container.querySelector("#fb-nama").value = form ? form.nama_form : "";
 container.querySelector("#fb-users").value = selectedAllowedUsers.join(", ");
 container.querySelector("#fb-delete").classList.toggle("hidden", !form);

 const requiresLpj = !!(form && form.requires_lpj);
 container.querySelector("#fb-requires-lpj").checked = requiresLpj;
 container.querySelector("#fb-lpj-wrap").classList.toggle("hidden", !requiresLpj);
 container.querySelector("#fb-lpj-deadline").value = (form && form.lpj_deadline_days) || 7;

 // Load target notifikasi
 const nt = form?.notify_targets || { pemohon: true, atasan_bawahan: true, peers: true, finance: true };
 if (container.querySelector("#fb-nt-pemohon")) container.querySelector("#fb-nt-pemohon").checked = nt.pemohon !== false;
 if (container.querySelector("#fb-nt-atasan-bawahan")) container.querySelector("#fb-nt-atasan-bawahan").checked = nt.atasan_bawahan !== false;
 if (container.querySelector("#fb-nt-peers")) container.querySelector("#fb-nt-peers").checked = nt.peers !== false;
 if (container.querySelector("#fb-nt-finance")) container.querySelector("#fb-nt-finance").checked = nt.finance !== false;

 ensureToolbar(container);
 ensureLpjToolbar(container);
 renderFlowChips(container);
 renderRuleChips(container);
 renderFields(container);
 renderLpjFields(container);
 renderFormList(container);

 initAllowedUsersSelector(container);
 initNotifyUsersSelector(container);

 container.querySelector("#fb-requires-lpj").onchange = (e) => {
 container.querySelector("#fb-lpj-wrap").classList.toggle("hidden", !e.target.checked);
 };
}

function closeBuilder(container) {
 editingId = null;
 container.querySelector("#fb-builder-wrap").classList.add("hidden");
 container.querySelector("#fb-empty-hint").classList.remove("hidden");
 renderFormList(container);
}

function renderFlowChips(container) {
 const el = container.querySelector("#fb-flow");
 el.innerHTML = ROLE_OPTIONS.map(r => {
 const idx = currentFlow.indexOf(r);
 const active = idx > -1;
 return `<button data-role="${r}" class="fb-flow-chip text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-maroon-700 text-white border-maroon-700 font-bold" : "border-slate-200 text-slate-600 hover:bg-slate-50"}">${active ? `${idx + 1}. ` : ""}${r}</button>`;
 }).join("");
 el.querySelectorAll("[data-role]").forEach(btn => {
 btn.addEventListener("click", () => {
 const r = btn.dataset.role;
 const idx = currentFlow.indexOf(r);
 if (idx > -1) currentFlow.splice(idx, 1); else currentFlow.push(r);
 renderFlowChips(container);
 });
 });
}

function renderRuleChips(container) {
 const el = container.querySelector("#fb-rules");
 el.innerHTML = ROLE_OPTIONS.map(r => {
 const active = currentRules.includes(r);
 return `<button data-rule="${r}" class="fb-rule-chip text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-slate-800 text-white border-slate-800 font-bold" : "border-slate-200 text-slate-600 hover:bg-slate-50"}">${r}</button>`;
 }).join("");
 el.querySelectorAll("[data-rule]").forEach(btn => {
 btn.addEventListener("click", () => {
 const r = btn.dataset.rule;
 const idx = currentRules.indexOf(r);
 if (idx > -1) currentRules.splice(idx, 1); else currentRules.push(r);
 renderRuleChips(container);
 });
 });
}

// Injeksi Toolbar Lengkap secara Dinamis
function ensureToolbar(container) {
 let tb = container.querySelector("#fb-dynamic-toolbar");
 if (!tb) {
 tb = document.createElement("div");
 tb.id = "fb-dynamic-toolbar";
 const fieldsContainer = container.querySelector("#fb-fields");
 fieldsContainer.parentNode.insertBefore(tb, fieldsContainer);
 }
 tb.innerHTML = `
 <p class="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Tambahkan Kolom Baru:</p>
 <div class="flex flex-wrap gap-2 mb-4 bg-slate-50 p-2.5 border border-slate-200 rounded-xl">
 <button type="button" class="btn-add-field text-xs font-medium bg-white text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="text">+ Teks Singkat</button>
 <button type="button" class="btn-add-field text-xs font-medium bg-white text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="textarea">+ Paragraf</button>
 <button type="button" class="btn-add-field text-xs font-medium bg-white text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="number">+ Angka</button>
 <button type="button" class="btn-add-field text-xs font-medium bg-white text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="date">+ Tanggal</button>
 <button type="button" class="btn-add-field text-xs font-semibold bg-sky-50 text-sky-800 px-3 py-1.5 rounded-lg border border-sky-200 hover:bg-sky-100 transition shadow-sm" data-type="time">+ Waktu / Jam</button>
 <button type="button" class="btn-add-field text-xs font-semibold bg-sky-50 text-sky-800 px-3 py-1.5 rounded-lg border border-sky-200 hover:bg-sky-100 transition shadow-sm" data-type="datetime-local">+ Tgl & Waktu</button>
 <button type="button" class="btn-add-field text-xs font-semibold bg-purple-50 text-purple-800 px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-100 transition shadow-sm" data-type="scale">+ Skala Penilaian</button>
 <button type="button" class="btn-add-field text-xs font-medium bg-white text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="radio">+ Radio (Pilihan Tunggal)</button>
 <button type="button" class="btn-add-field text-xs font-medium bg-white text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="checkbox">+ Checkbox (Banyak Pilihan)</button>
 <button type="button" class="btn-add-field text-xs font-medium bg-white text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="select">+ Dropdown Manual</button>
 <button type="button" class="btn-add-field text-xs bg-emerald-50 font-bold text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-300 hover:bg-emerald-100 transition shadow-sm" data-type="list">+ Daftar / List (Bullet / Angka)</button>
 <button type="button" class="btn-add-field text-xs bg-emerald-50 font-bold text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition shadow-sm" data-type="db_select">+ Dropdown Database</button>
 <button type="button" class="btn-add-field text-xs bg-amber-50 font-bold text-amber-700 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition shadow-sm" data-type="formula">+ Formula Kalkulasi</button>
 <button type="button" class="btn-add-field text-xs bg-indigo-50 font-bold text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition shadow-sm" data-type="file">+ Upload Foto/File</button>
 </div>
 `;
 tb.querySelectorAll(".btn-add-field").forEach(btn => {
 btn.onclick = () => {
 const type = btn.dataset.type;
 const newField = {
 name: `kolom_${currentFields.length + 1}`,
 label: `Kolom Baru ${currentFields.length + 1}`,
 type: type,
 required: false,
 is_quiz: false,
 correct_answer: "",
 score_value: 0
 };

 if (type === "select" || type === "radio" || type === "checkbox") {
 newField.options = ["Opsi 1", "Opsi 2"];
 } else if (type === "scale") {
 newField.min_scale = 1;
 newField.max_scale = 5;
 newField.min_label = "Sangat Kurang";
 newField.max_label = "Sangat Baik";
 } else if (type === "list") {
 newField.list_style = "bullet";
 newField.placeholder = "Masukkan satu per baris...";
 } else if (type === "db_select") {
 newField.db_source = "master_karyawan";
 } else if (type === "formula") {
 newField.formula = "([harga]*[jumlah])";
 }

 currentFields.push(newField);
 renderFields(container);
 };
 });
}

function renderFields(container) {
 const el = container.querySelector("#fb-fields");
 if (!currentFields.length) { el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50">Belum ada kolom. Klik tombol penambahan di atas.</p>`; return; }

 el.innerHTML = currentFields.map((f, i) => `
 <div draggable="true" data-idx="${i}" class="fb-field bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-3">
 <div class="flex items-start gap-3">
 <!-- Reorder Control Box (Drag Handle + Up / Down Buttons) -->
 <div class="flex flex-col items-center gap-1 shrink-0 pt-0.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
 <button type="button" data-move-up="${i}" ${i === 0 ? "disabled class='text-slate-200 cursor-not-allowed p-1'" : "class='text-slate-600 hover:text-maroon-700 hover:bg-white p-1 rounded transition shadow-sm'"} title="Pindahkan Urutan ke Atas">
 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
 </button>
 <div class="cursor-grab text-slate-400 hover:text-maroon-700 transition my-0.5" title="Seret untuk urutkan">${icon("menu", "w-4 h-4")}</div>
 <button type="button" data-move-down="${i}" ${i === currentFields.length - 1 ? "disabled class='text-slate-200 cursor-not-allowed p-1'" : "class='text-slate-600 hover:text-maroon-700 hover:bg-white p-1 rounded transition shadow-sm'"} title="Pindahkan Urutan ke Bawah">
 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
 </button>
 </div>

 <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div class="sm:col-span-2 flex items-center justify-between">
 <span class="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg uppercase tracking-wider border border-slate-200">Tipe: ${f.type.replace('_', ' ')}</span>
 <span class="text-[10px] font-mono text-slate-400">Urutan #${i + 1}</span>
 </div>

 <div>
 <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Label Kolom (Pertanyaan)</label>
 <input data-f="label" value="${escapeHtml(f.label)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
 </div>
 <div>
 <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Variabel Sistem (Otomatis)</label>
 <input data-f="name" value="${escapeHtml(f.name)}" readonly class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-100 text-slate-500 outline-none font-mono">
 </div>
 
 ${f.type === "scale" ? `
 <div class="sm:col-span-2 bg-purple-50/80 p-3 rounded-xl border border-purple-200 grid grid-cols-2 sm:grid-cols-4 gap-2">
 <div>
 <label class="text-[10px] font-bold text-purple-900 uppercase">Batas Min</label>
 <input type="number" data-f="min_scale" value="${f.min_scale ?? 1}" readonly class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-purple-200 bg-white text-slate-600 outline-none">
 </div>
 <div>
 <label class="text-[10px] font-bold text-purple-900 uppercase">Batas Maks</label>
 <select data-f="max_scale" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-purple-300 bg-white outline-none">
 <option value="5" ${(f.max_scale == 5 || !f.max_scale) ? 'selected' : ''}>5 (1 s/d 5)</option>
 <option value="10" ${f.max_scale == 10 ? 'selected' : ''}>10 (1 s/d 10)</option>
 </select>
 </div>
 <div>
 <label class="text-[10px] font-bold text-purple-900 uppercase">Label Nilai Min</label>
 <input data-f="min_label" value="${escapeHtml(f.min_label || "Sangat Kurang")}" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-purple-300 bg-white outline-none">
 </div>
 <div>
 <label class="text-[10px] font-bold text-purple-900 uppercase">Label Nilai Maks</label>
 <input data-f="max_label" value="${escapeHtml(f.max_label || "Sangat Baik")}" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-purple-300 bg-white outline-none">
 </div>
 </div>` : ""}

 ${f.type === "formula" ? `
 <div class="sm:col-span-2 bg-amber-50 p-3 rounded-xl border border-amber-200">
 <label class="text-[10px] font-bold text-amber-800 uppercase">Rumus Matematika</label>
 <p class="text-[10px] text-amber-700 mb-1">Gunakan nama <b>Variabel Sistem</b> di dalam kurung siku. Contoh: <code>([qty] * [harga]) / 100</code></p>
 <input data-f="formula" value="${escapeHtml(f.formula || "")}" placeholder="([field_a]+[field_b])" class="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 focus:border-amber-500 outline-none font-mono bg-white">
 </div>` : ""}

 ${(f.type === "select" || f.type === "radio" || f.type === "checkbox") ? `
 <div class="sm:col-span-2">
 <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Opsi Pilihan (Pisahkan dg koma)</label>
 <input data-f="options" value="${escapeHtml((f.options || []).join(", "))}" placeholder="Opsi 1, Opsi 2, Opsi 3" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
 </div>` : ""}

 ${f.type === "db_select" ? `
 <div class="sm:col-span-2 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
 <label class="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">Sumber Database Otomatis</label>
 <select data-f="db_source" class="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-emerald-300 focus:border-emerald-500 outline-none bg-white">
 <option value="master_karyawan" ${f.db_source === 'master_karyawan' ? 'selected' : ''}>Tarik Data Nama Karyawan</option>
 <option value="master_kendaraan" ${f.db_source === 'master_kendaraan' ? 'selected' : ''}>Tarik Data Kendaraan Operasional</option>
 <option value="inventory" ${f.db_source === 'inventory' ? 'selected' : ''}>Tarik Data Barang / Asset IT</option>
 </select>
 </div>` : ""}

 <div class="sm:col-span-2 mt-2 pt-3 border-t border-slate-100 flex items-center gap-6">
 <label class="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
 <input type="checkbox" data-f="required" ${f.required ? "checked" : ""} class="rounded border-slate-300 text-maroon-700 w-4 h-4"> Wajib Diisi
 </label>
 ${f.type !== "formula" ? `
 <label class="flex items-center gap-2 text-xs font-bold text-blue-700 cursor-pointer bg-blue-50 px-2 py-1 rounded">
 <input type="checkbox" data-f="is_quiz" ${f.is_quiz ? "checked" : ""} class="rounded border-blue-300 text-blue-700 w-4 h-4"> Mode Penilaian / Kuis
 </label>` : ""}
 </div>

 ${f.is_quiz ? `
 <div class="sm:col-span-2 grid grid-cols-2 gap-3 mt-1 p-3 bg-blue-50 border border-blue-200 rounded-xl">
 <div>
 <label class="text-[10px] font-bold text-blue-800 uppercase">Kunci Jawaban Benar</label>
 <input data-f="correct_answer" value="${escapeHtml(f.correct_answer || "")}" placeholder="Tulis jawaban pasti..." class="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-blue-300 focus:border-blue-500 outline-none">
 </div>
 <div>
 <label class="text-[10px] font-bold text-blue-800 uppercase">Nilai Poin (Jika Benar)</label>
 <input type="number" data-f="score_value" value="${f.score_value || 0}" placeholder="10" class="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-blue-300 focus:border-blue-500 outline-none font-bold text-blue-700 text-center">
 </div>
 </div>
 ` : ""}

 ${f.type !== "formula" ? `
 <div class="sm:col-span-2 mt-1 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
 <label class="flex items-center gap-2 text-xs font-bold text-indigo-800 cursor-pointer mb-2">
 <input type="checkbox" data-f="show_if_enabled" ${f.show_if ? "checked" : ""} class="rounded border-indigo-300 text-indigo-700 w-4 h-4">
 Tampilkan Kolom Ini Hanya Jika... (kondisional)
 </label>
 ${f.show_if ? `
 <div class="grid grid-cols-2 gap-2">
 <select data-f="show_if_field" class="px-2 py-1.5 text-xs rounded border border-indigo-300 bg-white outline-none">
 <option value="">Pilih kolom pemicu...</option>
 ${currentFields.filter(o => o.name !== f.name && !o.formula).map(o => `<option value="${escapeHtml(o.name)}" ${f.show_if.field === o.name ? "selected" : ""}>${escapeHtml(o.label || o.name)}</option>`).join("")}
 </select>
 <input data-f="show_if_value" value="${escapeHtml(f.show_if.value || "")}" placeholder="bernilai persis (mis. Renovasi Rumah)" class="px-2 py-1.5 text-xs rounded border border-indigo-300 outline-none">
 </div>
 <p class="text-[10px] text-indigo-600 mt-1.5">Contoh pakai: buat kolom "Tujuan Kasbon" (Dropdown Manual) berisi opsi "Renovasi Rumah, Kebutuhan Sekolah Anak, Lainnya" — lalu kolom Upload Foto ini di-set tampil hanya jika Tujuan Kasbon = "Renovasi Rumah".</p>
 ` : ""}
 </div>` : ""}
 </div>

 <button data-remove="${i}" class="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition" title="Hapus Kolom">${icon("trash", "w-5 h-5")}</button>
 </div>
 </div>`).join("");

 // Event Listener Move Up & Move Down
 el.querySelectorAll("[data-move-up]").forEach(btn => {
 btn.addEventListener("click", () => {
 const idx = parseInt(btn.dataset.moveUp, 10);
 if (idx <= 0) return;
 const temp = currentFields[idx];
 currentFields[idx] = currentFields[idx - 1];
 currentFields[idx - 1] = temp;
 renderFields(container);
 });
 });

 el.querySelectorAll("[data-move-down]").forEach(btn => {
 btn.addEventListener("click", () => {
 const idx = parseInt(btn.dataset.moveDown, 10);
 if (idx >= currentFields.length - 1) return;
 const temp = currentFields[idx];
 currentFields[idx] = currentFields[idx + 1];
 currentFields[idx + 1] = temp;
 renderFields(container);
 });
 });

 // Event Listener Inputs
 el.querySelectorAll("[data-f]").forEach(input => {
 const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
 
 input.addEventListener(eventType, (e) => {
 const idx = parseInt(input.closest("[data-idx]").dataset.idx, 10);
 const key = input.dataset.f;

 if (key === "required") {
 currentFields[idx].required = input.checked;
 } 
 else if (key === "is_quiz") { 
 currentFields[idx].is_quiz = input.checked; 
 renderFields(container);
 } 
 else if (key === "show_if_enabled") {
 if (input.checked) currentFields[idx].show_if = { field: "", value: "" };
 else delete currentFields[idx].show_if;
 renderFields(container);
 }
 else if (key === "show_if_field") {
 currentFields[idx].show_if = { ...(currentFields[idx].show_if || {}), field: input.value };
 }
 else if (key === "show_if_value") {
 currentFields[idx].show_if = { ...(currentFields[idx].show_if || {}), value: input.value };
 }
 else if (key === "options") {
 currentFields[idx].options = input.value.split(",").map(s => s.trim()).filter(Boolean);
 } 
 else if (key === "label") { 
 currentFields[idx].label = input.value; 
 currentFields[idx].name = toSnakeCase(input.value) || `kolom_${idx + 1}`; 
 const nameInput = input.closest('.fb-field').querySelector('[data-f="name"]');
 if (nameInput) nameInput.value = currentFields[idx].name;
 } 
 else if (key === "score_value") {
 currentFields[idx].score_value = parseFloat(input.value) || 0;
 }
 else if (key === "max_scale") {
 currentFields[idx].max_scale = parseInt(input.value) || 5;
 }
 else {
 currentFields[idx][key] = input.value; 
 }
 });
 });

 el.querySelectorAll("[data-remove]").forEach(btn => {
 btn.addEventListener("click", () => { currentFields.splice(parseInt(btn.dataset.remove, 10), 1); renderFields(container); });
 });

 // Drag & drop reorder
 el.querySelectorAll(".fb-field").forEach(row => {
 row.addEventListener("dragstart", () => { dragIndex = parseInt(row.dataset.idx, 10); row.style.opacity = '0.4'; });
 row.addEventListener("dragend", () => { row.style.opacity = '1'; dragIndex = null; });
 row.addEventListener("dragover", (e) => e.preventDefault());
 row.addEventListener("drop", () => {
 const targetIdx = parseInt(row.dataset.idx, 10);
 if (dragIndex === null || dragIndex === targetIdx) return;
 const [moved] = currentFields.splice(dragIndex, 1);
 currentFields.splice(targetIdx, 0, moved);
 dragIndex = null;
 renderFields(container);
 });
 });
}

function ensureLpjToolbar(container) {
 const tb = container.querySelector("#fb-lpj-toolbar");
 tb.innerHTML = `
 <button type="button" class="btn-add-lpj-field text-xs bg-white text-amber-800 px-2.5 py-1 rounded border border-amber-300 hover:bg-amber-100 transition" data-type="text">+ Teks</button>
 <button type="button" class="btn-add-lpj-field text-xs bg-white text-amber-800 px-2.5 py-1 rounded border border-amber-300 hover:bg-amber-100 transition" data-type="textarea">+ Paragraf</button>
 <button type="button" class="btn-add-lpj-field text-xs bg-white text-amber-800 px-2.5 py-1 rounded border border-amber-300 hover:bg-amber-100 transition" data-type="number">+ Angka</button>
 <button type="button" class="btn-add-lpj-field text-xs bg-sky-50 text-sky-800 px-2.5 py-1 rounded border border-sky-300 hover:bg-sky-100 transition" data-type="time">+ Waktu</button>
 <button type="button" class="btn-add-lpj-field text-xs bg-purple-50 text-purple-800 px-2.5 py-1 rounded border border-purple-300 hover:bg-purple-100 transition" data-type="scale">+ Skala</button>
 <button type="button" class="btn-add-lpj-field text-xs bg-indigo-100 font-bold text-indigo-700 px-2.5 py-1 rounded border border-indigo-300 hover:bg-indigo-200 transition" data-type="file">+ Upload Bukti</button>
 `;
 tb.querySelectorAll(".btn-add-lpj-field").forEach(btn => {
 btn.onclick = () => {
 const type = btn.dataset.type;
 const newField = {
 name: `lpj_kolom_${currentLpjFields.length + 1}`,
 label: `Kolom LPJ Baru ${currentLpjFields.length + 1}`,
 type: type,
 required: true
 };
 if (type === "scale") {
 newField.min_scale = 1;
 newField.max_scale = 5;
 newField.min_label = "Sangat Kurang";
 newField.max_label = "Sangat Baik";
 }
 currentLpjFields.push(newField);
 renderLpjFields(container);
 };
 });
}

function renderLpjFields(container) {
 const el = container.querySelector("#fb-lpj-fields");
 if (!currentLpjFields.length) { el.innerHTML = `<p class="text-xs text-amber-700 text-center py-4 border-2 border-dashed border-amber-200 rounded-lg bg-white">Belum ada kolom LPJ. Contoh: "Foto Bukti Penggunaan" (Upload Bukti), "Nominal Realisasi" (Angka), "Catatan Realisasi" (Paragraf).</p>`; return; }

 el.innerHTML = currentLpjFields.map((f, i) => `
 <div draggable="true" data-lpj-idx="${i}" class="fb-lpj-field bg-white border border-amber-200 rounded-xl p-3 shadow-sm">
 <div class="flex items-start gap-2">
 <!-- Reorder Control Box for LPJ -->
 <div class="flex flex-col items-center gap-0.5 shrink-0 pt-0.5 bg-amber-50/70 p-1 rounded-lg border border-amber-200">
 <button type="button" data-move-lpj-up="${i}" ${i === 0 ? "disabled class='text-amber-200 cursor-not-allowed p-0.5'" : "class='text-amber-700 hover:bg-white p-0.5 rounded transition shadow-sm'"} title="Naikkan Urutan">
 <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
 </button>
 <div class="cursor-grab text-amber-400 hover:text-amber-800 transition" title="Seret untuk urutkan">${icon("menu", "w-3.5 h-3.5")}</div>
 <button type="button" data-move-lpj-down="${i}" ${i === currentLpjFields.length - 1 ? "disabled class='text-amber-200 cursor-not-allowed p-0.5'" : "class='text-amber-700 hover:bg-white p-0.5 rounded transition shadow-sm'"} title="Turunkan Urutan">
 <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
 </button>
 </div>

 <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
 <div class="sm:col-span-2 flex items-center justify-between">
 <span class="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded uppercase w-fit">Tipe: ${f.type}</span>
 <span class="text-[10px] font-mono text-amber-600">Urutan #${i + 1}</span>
 </div>
 <div>
 <label class="text-[10px] font-bold text-amber-700 uppercase">Label</label>
 <input data-lf="label" value="${escapeHtml(f.label)}" class="w-full px-2 py-1.5 text-sm rounded border border-amber-200 outline-none">
 </div>
 <div>
 <label class="text-[10px] font-bold text-amber-700 uppercase">Variabel</label>
 <input value="${escapeHtml(f.name)}" readonly class="w-full px-2 py-1.5 text-sm rounded border border-amber-200 bg-amber-50 text-amber-600 outline-none font-mono">
 </div>
 </div>
 <button data-remove-lpj="${i}" class="text-amber-400 hover:text-red-600 p-1.5 rounded transition" title="Hapus">${icon("trash", "w-4 h-4")}</button>
 </div>
 </div>`).join("");

 el.querySelectorAll("[data-move-lpj-up]").forEach(btn => {
 btn.addEventListener("click", () => {
 const idx = parseInt(btn.dataset.moveLpjUp, 10);
 if (idx <= 0) return;
 const temp = currentLpjFields[idx];
 currentLpjFields[idx] = currentLpjFields[idx - 1];
 currentLpjFields[idx - 1] = temp;
 renderLpjFields(container);
 });
 });

 el.querySelectorAll("[data-move-lpj-down]").forEach(btn => {
 btn.addEventListener("click", () => {
 const idx = parseInt(btn.dataset.moveLpjDown, 10);
 if (idx >= currentLpjFields.length - 1) return;
 const temp = currentLpjFields[idx];
 currentLpjFields[idx] = currentLpjFields[idx + 1];
 currentLpjFields[idx + 1] = temp;
 renderLpjFields(container);
 });
 });

 el.querySelectorAll("[data-lf]").forEach(input => {
 input.addEventListener("input", (e) => {
 const idx = parseInt(input.closest("[data-lpj-idx]").dataset.lpjIdx, 10);
 currentLpjFields[idx].label = input.value;
 currentLpjFields[idx].name = toSnakeCase(input.value) || `lpj_kolom_${idx + 1}`;
 const nameEl = input.closest('.fb-lpj-field').querySelector('input[readonly]');
 if (nameEl) nameEl.value = currentLpjFields[idx].name;
 });
 });
 el.querySelectorAll("[data-remove-lpj]").forEach(btn => {
 btn.addEventListener("click", () => { currentLpjFields.splice(parseInt(btn.dataset.removeLpj, 10), 1); renderLpjFields(container); });
 });
 el.querySelectorAll(".fb-lpj-field").forEach(row => {
 row.addEventListener("dragstart", () => { lpjDragIndex = parseInt(row.dataset.lpjIdx, 10); row.style.opacity = '0.4'; });
 row.addEventListener("dragend", () => { row.style.opacity = '1'; lpjDragIndex = null; });
 row.addEventListener("dragover", (e) => e.preventDefault());
 row.addEventListener("drop", () => {
 const targetIdx = parseInt(row.dataset.lpjIdx, 10);
 if (lpjDragIndex === null || lpjDragIndex === targetIdx) return;
 const [moved] = currentLpjFields.splice(lpjDragIndex, 1);
 currentLpjFields.splice(targetIdx, 0, moved);
 lpjDragIndex = null;
 renderLpjFields(container);
 });
 });
}

/* ---------------------------------------------------------------------
 * SELEKSI AKSES PERSONIL SPESIFIK (SEARCH BAR + CHECKLIST KARYAWAN)
 * ------------------------------------------------------------------- */
function initAllowedUsersSelector(container) {
 const searchInput = container.querySelector("#fb-users-search");
 const allCb = container.querySelector("#fb-users-all-cb");
 const hiddenInput = container.querySelector("#fb-users");
 const countBadge = container.querySelector("#fb-users-count");

 if (!searchInput || !allCb) return;

 const updateUI = () => {
 const isAll = selectedAllowedUsers.includes("ALL");
 allCb.checked = isAll;
 
 if (isAll) {
 countBadge.textContent = "ALL (Semua Karyawan)";
 countBadge.className = "text-xs font-semibold text-maroon-700 bg-maroon-50 px-2.5 py-0.5 rounded-full border border-maroon-100";
 hiddenInput.value = "ALL";
 } else {
 const cnt = selectedAllowedUsers.length;
 countBadge.textContent = cnt ? `${cnt} Personil Dipilih` : "0 Personil Dipilih (Akses Dibatasi)";
 countBadge.className = cnt ? "text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100" : "text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100";
 hiddenInput.value = selectedAllowedUsers.join(", ");
 }
 renderAllowedUsersList(container, searchInput.value.trim());
 };

 allCb.onchange = (e) => {
 if (e.target.checked) {
 selectedAllowedUsers = ["ALL"];
 } else {
 selectedAllowedUsers = [];
 }
 updateUI();
 };

 searchInput.oninput = () => {
 renderAllowedUsersList(container, searchInput.value.trim());
 };

 updateUI();
}

function renderAllowedUsersList(container, term = "") {
 const listEl = container.querySelector("#fb-users-list");
 if (!listEl) return;

 const isAll = selectedAllowedUsers.includes("ALL");
 const filterTerm = term.toLowerCase();

 const filtered = allEmployees.filter(emp => {
 if (!filterTerm) return true;
 const name = (emp.nama_karyawan || emp.nama || "").toLowerCase();
 const nik = String(emp.nik_karyawan || emp.nik || "").toLowerCase();
 const jabatan = (emp.jabatan || emp.role || "").toLowerCase();
 const divisi = (emp.divisi || emp.cabang || "").toLowerCase();
 return name.includes(filterTerm) || nik.includes(filterTerm) || jabatan.includes(filterTerm) || divisi.includes(filterTerm);
 });

 if (!filtered.length) {
 listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Tidak ada karyawan yang cocok dengan pencarian "${escapeHtml(term)}".</p>`;
 return;
 }

 listEl.innerHTML = filtered.map(emp => {
 const name = emp.nama_karyawan || emp.nama || "";
 const nik = emp.nik_karyawan || emp.nik || "-";
 const subtext = [emp.jabatan || emp.role, emp.divisi || emp.cabang].filter(Boolean).join(" • ");
 const isChecked = !isAll && selectedAllowedUsers.some(u => u.toLowerCase() === name.toLowerCase());

 return `
 <label class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs border border-transparent hover:border-slate-200 transition ${isChecked ? 'bg-maroon-50/40 border-maroon-100' : ''}">
 <div class="flex items-center gap-2.5">
 <input type="checkbox" data-emp-allowed="${escapeHtml(name)}" ${isChecked ? "checked" : ""} ${isAll ? "disabled" : ""} class="fb-allowed-emp-cb rounded border-slate-300 text-maroon-700 w-4 h-4">
 <div>
 <span class="font-semibold ${isAll ? 'text-slate-400' : 'text-slate-800'}">${escapeHtml(name)}</span>
 ${subtext ? `<p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(subtext)}</p>` : ''}
 </div>
 </div>
 <span class="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">NIK: ${escapeHtml(nik)}</span>
 </label>
 `;
 }).join("");

 listEl.querySelectorAll(".fb-allowed-emp-cb").forEach(cb => {
 cb.onchange = (e) => {
 const targetName = cb.dataset.empAllowed;
 if (selectedAllowedUsers.includes("ALL")) {
 selectedAllowedUsers = [];
 }
 if (e.target.checked) {
 if (!selectedAllowedUsers.some(u => u.toLowerCase() === targetName.toLowerCase())) {
 selectedAllowedUsers.push(targetName);
 }
 } else {
 selectedAllowedUsers = selectedAllowedUsers.filter(u => u.toLowerCase() !== targetName.toLowerCase());
 }
 
 const hiddenInput = container.querySelector("#fb-users");
 const countBadge = container.querySelector("#fb-users-count");
 const allCb = container.querySelector("#fb-users-all-cb");
 allCb.checked = false;

 const cnt = selectedAllowedUsers.length;
 countBadge.textContent = cnt ? `${cnt} Personil Dipilih` : "0 Personil Dipilih (Akses Dibatasi)";
 countBadge.className = cnt ? "text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100" : "text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100";
 hiddenInput.value = selectedAllowedUsers.join(", ");
 };
 });
}

/* ---------------------------------------------------------------------
 * SELEKSI ALUR NOTIFIKASI & EMAIL KHUSUS (TARGET KARYAWAN SPESIFIK & MATRIKS)
 * ------------------------------------------------------------------- */
function initNotifyUsersSelector(container) {
  const searchInput = container.querySelector("#fb-notify-users-search");
  const countBadge = container.querySelector("#fb-notify-users-count");
  const btnFilterAll = container.querySelector("#fb-notify-filter-all");
  const btnFilterSelected = container.querySelector("#fb-notify-filter-selected");

  if (!searchInput) return;

  const updateUI = () => {
    const cnt = notifyUserRules.length;
    countBadge.textContent = cnt ? `${cnt} Personil Dipilih` : "0 Personil Dipilih";
    countBadge.className = cnt ? "text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100" : "text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200";
    
    if (btnFilterAll && btnFilterSelected) {
      if (notifyFilterMode === "all") {
        btnFilterAll.className = "px-2.5 py-1 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 font-bold";
        btnFilterSelected.className = "px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium";
      } else {
        btnFilterSelected.className = "px-2.5 py-1 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 font-bold";
        btnFilterAll.className = "px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium";
      }
    }

    renderNotifyUsersTable(container, searchInput.value.trim());
  };

  searchInput.oninput = () => {
    renderNotifyUsersTable(container, searchInput.value.trim());
  };

  if (btnFilterAll) {
    btnFilterAll.onclick = () => {
      notifyFilterMode = "all";
      updateUI();
    };
  }

  if (btnFilterSelected) {
    btnFilterSelected.onclick = () => {
      notifyFilterMode = "selected";
      updateUI();
    };
  }

  updateUI();
}

function renderNotifyUsersTable(container, term = "") {
  const tbodyEl = container.querySelector("#fb-notify-users-tbody");
  if (!tbodyEl) return;

  const filterTerm = term.toLowerCase();

  let filtered = allEmployees.filter(emp => {
    const name = (emp.nama_karyawan || emp.nama || "").toLowerCase();
    const nik = String(emp.nik_karyawan || emp.nik || "").toLowerCase();
    const jabatan = (emp.jabatan || emp.role || "").toLowerCase();
    const email = (emp.email || "").toLowerCase();
    if (!filterTerm) return true;
    return name.includes(filterTerm) || nik.includes(filterTerm) || jabatan.includes(filterTerm) || email.includes(filterTerm);
  });

  if (notifyFilterMode === "selected") {
    const selectedNames = new Set(notifyUserRules.map(r => r.nama.toLowerCase()));
    filtered = filtered.filter(emp => selectedNames.has((emp.nama_karyawan || emp.nama || "").toLowerCase()));
  }

  if (!filtered.length) {
    tbodyEl.innerHTML = `
      <tr>
        <td colspan="5" class="text-xs text-slate-400 text-center py-6">
          ${notifyFilterMode === 'selected' ? 'Belum ada personil yang dipilih untuk alur notifikasi khusus ini.' : `Tidak ada karyawan yang cocok dengan kata kunci "${escapeHtml(term)}".`}
        </td>
      </tr>
    `;
    return;
  }

  tbodyEl.innerHTML = filtered.map(emp => {
    const name = emp.nama_karyawan || emp.nama || "";
    const nik = emp.nik_karyawan || emp.nik || "-";
    const email = emp.email || "";
    const jabatan = emp.jabatan || emp.role || "-";
    
    const existingRule = notifyUserRules.find(r => r.nama.toLowerCase() === name.toLowerCase());
    const isSelected = !!existingRule;
    const isInfoDinas = existingRule ? existingRule.info_dinas !== false : false;
    const isApproval = existingRule ? existingRule.approval !== false : false;
    const isHasilStatus = existingRule ? existingRule.hasil_status !== false : false;

    return `
      <tr class="hover:bg-blue-50/40 transition ${isSelected ? 'bg-blue-50/20' : ''}" data-emp-row="${escapeHtml(name)}">
        <td class="p-2.5 text-center">
          <input type="checkbox" data-emp-select="${escapeHtml(name)}" ${isSelected ? "checked" : ""} class="fb-notify-row-cb rounded border-slate-300 text-blue-700 w-4 h-4 cursor-pointer">
        </td>
        <td class="p-2.5">
          <div class="flex flex-col">
            <span class="font-semibold text-slate-800">${escapeHtml(name)}</span>
            <div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
              <span class="bg-slate-100 px-1 py-0.2 rounded font-mono">${escapeHtml(nik)}</span>
              <span>•</span>
              <span>${escapeHtml(jabatan)}</span>
              ${email ? `<span>•</span><span class="text-blue-600 font-mono">${escapeHtml(email)}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="p-2.5 text-center">
          <label class="inline-flex items-center justify-center cursor-pointer p-1 rounded hover:bg-blue-100/50">
            <input type="checkbox" data-emp-rule="info_dinas" data-emp-name="${escapeHtml(name)}" ${isInfoDinas ? "checked" : ""} class="fb-rule-cb rounded border-blue-300 text-blue-600 w-4 h-4 cursor-pointer">
          </label>
        </td>
        <td class="p-2.5 text-center">
          <label class="inline-flex items-center justify-center cursor-pointer p-1 rounded hover:bg-amber-100/50">
            <input type="checkbox" data-emp-rule="approval" data-emp-name="${escapeHtml(name)}" ${isApproval ? "checked" : ""} class="fb-rule-cb rounded border-amber-300 text-amber-600 w-4 h-4 cursor-pointer">
          </label>
        </td>
        <td class="p-2.5 text-center">
          <label class="inline-flex items-center justify-center cursor-pointer p-1 rounded hover:bg-emerald-100/50">
            <input type="checkbox" data-emp-rule="hasil_status" data-emp-name="${escapeHtml(name)}" ${isHasilStatus ? "checked" : ""} class="fb-rule-cb rounded border-emerald-300 text-emerald-600 w-4 h-4 cursor-pointer">
          </label>
        </td>
      </tr>
    `;
  }).join("");

  // Event Listener Toggle Seluruh Baris Personil
  tbodyEl.querySelectorAll(".fb-notify-row-cb").forEach(cb => {
    cb.onchange = (e) => {
      const empName = cb.dataset.empSelect;
      const emp = allEmployees.find(x => (x.nama_karyawan || x.nama || "").toLowerCase() === empName.toLowerCase());
      const row = cb.closest("tr");
      
      if (e.target.checked) {
        if (!notifyUserRules.some(r => r.nama.toLowerCase() === empName.toLowerCase())) {
          notifyUserRules.push({
            nama: empName,
            nik: emp ? (emp.nik_karyawan || emp.nik || "") : "",
            email: emp ? (emp.email || "") : "",
            info_dinas: true,
            approval: true,
            hasil_status: true
          });
        }
        if (row) {
          row.classList.add("bg-blue-50/20");
          row.querySelectorAll(".fb-rule-cb").forEach(rcb => { rcb.checked = true; });
        }
      } else {
        notifyUserRules = notifyUserRules.filter(r => r.nama.toLowerCase() !== empName.toLowerCase());
        if (row) {
          row.classList.remove("bg-blue-50/20");
          row.querySelectorAll(".fb-rule-cb").forEach(rcb => { rcb.checked = false; });
        }
      }

      selectedNotifyUsers = notifyUserRules.map(r => r.nama);
      const countBadge = container.querySelector("#fb-notify-users-count");
      const cnt = notifyUserRules.length;
      countBadge.textContent = cnt ? `${cnt} Personil Dipilih` : "0 Personil Dipilih";
      countBadge.className = cnt ? "text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100" : "text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200";
    };
  });

  // Event Listener Toggle Sub-Rule (Info Cuti/Dinas, Approval, Hasil Status)
  tbodyEl.querySelectorAll(".fb-rule-cb").forEach(rcb => {
    rcb.onchange = (e) => {
      const empName = rcb.dataset.empName;
      const ruleKey = rcb.dataset.empRule;
      const emp = allEmployees.find(x => (x.nama_karyawan || x.nama || "").toLowerCase() === empName.toLowerCase());
      const row = rcb.closest("tr");
      const rowCb = row ? row.querySelector(".fb-notify-row-cb") : null;

      let ruleObj = notifyUserRules.find(r => r.nama.toLowerCase() === empName.toLowerCase());
      if (!ruleObj) {
        ruleObj = {
          nama: empName,
          nik: emp ? (emp.nik_karyawan || emp.nik || "") : "",
          email: emp ? (emp.email || "") : "",
          info_dinas: false,
          approval: false,
          hasil_status: false
        };
        notifyUserRules.push(ruleObj);
      }

      ruleObj[ruleKey] = e.target.checked;

      // Jika ketiga rule tidak ada yang dicentang, hapus dari list
      if (!ruleObj.info_dinas && !ruleObj.approval && !ruleObj.hasil_status) {
        notifyUserRules = notifyUserRules.filter(r => r.nama.toLowerCase() !== empName.toLowerCase());
        if (rowCb) rowCb.checked = false;
        if (row) row.classList.remove("bg-blue-50/20");
      } else {
        if (rowCb) rowCb.checked = true;
        if (row) row.classList.add("bg-blue-50/20");
      }

      selectedNotifyUsers = notifyUserRules.map(r => r.nama);
      const countBadge = container.querySelector("#fb-notify-users-count");
      const cnt = notifyUserRules.length;
      countBadge.textContent = cnt ? `${cnt} Personil Dipilih` : "0 Personil Dipilih";
      countBadge.className = cnt ? "text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100" : "text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200";
    };
  });
}

async function saveForm(container) {
  const id = container.querySelector("#fb-id").value.trim();
  const nama = container.querySelector("#fb-nama").value.trim();
  if (!id || !nama) { toast("ID Form dan Nama Formulir wajib diisi", "warning"); return; }
  if (!currentFields.length) { toast("Tambahkan minimal satu kolom formulir", "warning"); return; }

  const requiresLpj = container.querySelector("#fb-requires-lpj").checked;
  const lpjDeadline = parseInt(container.querySelector("#fb-lpj-deadline").value) || 7;
  if (requiresLpj && !currentLpjFields.length) { toast("Aktifkan LPJ butuh minimal 1 kolom formulir LPJ (mis. Upload Bukti)", "warning"); return; }

  selectedNotifyUsers = notifyUserRules.map(r => r.nama);

  const notifyTargets = {
    pemohon: container.querySelector("#fb-nt-pemohon") ? container.querySelector("#fb-nt-pemohon").checked : true,
    atasan_bawahan: container.querySelector("#fb-nt-atasan-bawahan") ? container.querySelector("#fb-nt-atasan-bawahan").checked : true,
    peers: container.querySelector("#fb-nt-peers") ? container.querySelector("#fb-nt-peers").checked : true,
    finance: container.querySelector("#fb-nt-finance") ? container.querySelector("#fb-nt-finance").checked : true,
    specific_users: selectedNotifyUsers,
    user_rules: notifyUserRules
  };

  const allowedUsersVal = selectedAllowedUsers.includes("ALL") ? "ALL" : selectedAllowedUsers;

  const payload = {
    nama_form: nama,
    approval_flow: currentFlow,
    allowed_rules: currentRules.join(", "),
    allowed_users: allowedUsersVal,
    notify_user_rules: notifyUserRules,
    notify_specific_users: selectedNotifyUsers,
    fields_json: currentFields,
    requires_lpj: requiresLpj,
    lpj_deadline_days: lpjDeadline,
    lpj_fields_json: requiresLpj ? currentLpjFields : [],
    notify_targets: notifyTargets
  };

  try {
    if (editingId) {
      await fsUpdate(COL.FORM_CONFIG, editingId, payload);
      Object.assign(allForms.find(f => f.id === editingId), payload);
    } else {
      await fsAdd(COL.FORM_CONFIG, payload, id);
      allForms.push({ id, ...payload });
    }
    toast("Formulir berhasil disimpan", "success");
    closeBuilder(container);
  } catch (e) {
    console.error(e);
    toast("Gagal menyimpan formulir: " + e.message, "error");
  }
}

async function deleteForm(container) {
 if (!editingId) return;
 const ok = await confirmDialog("Formulir yang dihapus tidak dapat dikembalikan dan akan hilang dari Katalog Pengajuan. Lanjutkan?");
 if (!ok) return;
 try {
 await fsDelete(COL.FORM_CONFIG, editingId);
 allForms = allForms.filter(f => f.id !== editingId);
 toast("Formulir berhasil dihapus", "success");
 closeBuilder(container);
 } catch (e) { toast("Gagal menghapus: " + e.message, "error"); }
}
