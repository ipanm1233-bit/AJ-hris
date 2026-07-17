import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, toSnakeCase, toast, confirmDialog, escapeHtml, genId } from "../utils.js";
import { icon, emptyState } from "../components.js";

const ROLE_OPTIONS = ["HRD", "GM", "FINANCE", "SPV", "ATASAN", "SALES", "MANAGER"];
let allForms = [];
let editingId = null;
let currentFields = [];
let currentLpjFields = [];
let currentFlow = [];
let currentRules = [];
let dragIndex = null;
let lpjDragIndex = null;

export async function mount(container) {
  allForms = await fsGetAll(COL.FORM_CONFIG);
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

  container.querySelector("#fb-empty-hint").classList.add("hidden");
  container.querySelector("#fb-builder-wrap").classList.remove("hidden");
  container.querySelector("#fb-id").value = form ? form.id : genId("F-CUSTOM");
  container.querySelector("#fb-id").disabled = !!form;
  container.querySelector("#fb-nama").value = form ? form.nama_form : "";
  container.querySelector("#fb-users").value = form ? (Array.isArray(form.allowed_users) ? form.allowed_users.join(", ") : form.allowed_users || "") : "ALL";
  container.querySelector("#fb-delete").classList.toggle("hidden", !form);

  const requiresLpj = !!(form && form.requires_lpj);
  container.querySelector("#fb-requires-lpj").checked = requiresLpj;
  container.querySelector("#fb-lpj-wrap").classList.toggle("hidden", !requiresLpj);
  container.querySelector("#fb-lpj-deadline").value = (form && form.lpj_deadline_days) || 7;

  ensureToolbar(container);
  ensureLpjToolbar(container);
  renderFlowChips(container);
  renderRuleChips(container);
  renderFields(container);
  renderLpjFields(container);
  renderFormList(container);

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
     <div class="flex flex-wrap gap-2 mb-4 bg-slate-50 p-2 border border-slate-200 rounded-lg">
        <button type="button" class="btn-add-field text-xs bg-white text-slate-700 px-3 py-1.5 rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="text">+ Teks Singkat</button>
        <button type="button" class="btn-add-field text-xs bg-white text-slate-700 px-3 py-1.5 rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="textarea">+ Paragraf</button>
        <button type="button" class="btn-add-field text-xs bg-white text-slate-700 px-3 py-1.5 rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="number">+ Angka</button>
        <button type="button" class="btn-add-field text-xs bg-white text-slate-700 px-3 py-1.5 rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="date">+ Tanggal</button>
        <button type="button" class="btn-add-field text-xs bg-white text-slate-700 px-3 py-1.5 rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition shadow-sm" data-type="select">+ Dropdown Manual</button>
        <button type="button" class="btn-add-field text-xs bg-emerald-50 font-bold text-emerald-700 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100 transition shadow-sm" data-type="db_select">+ Dropdown Database</button>
        <button type="button" class="btn-add-field text-xs bg-amber-50 font-bold text-amber-700 px-3 py-1.5 rounded border border-amber-200 hover:bg-amber-100 transition shadow-sm" data-type="formula">+ Formula Kalkulasi</button>
        <button type="button" class="btn-add-field text-xs bg-indigo-50 font-bold text-indigo-700 px-3 py-1.5 rounded border border-indigo-200 hover:bg-indigo-100 transition shadow-sm" data-type="file">+ Upload Foto/File</button>
     </div>
   `;
   tb.querySelectorAll(".btn-add-field").forEach(btn => {
      btn.onclick = () => {
         const type = btn.dataset.type;
         currentFields.push({
            name: `kolom_${currentFields.length + 1}`,
            label: `Kolom Baru ${currentFields.length + 1}`,
            type: type,
            required: false,
            options: type === "select" ? ["Opsi 1", "Opsi 2"] : undefined,
            db_source: type === "db_select" ? "master_karyawan" : undefined,
            formula: type === "formula" ? "([harga]*[jumlah])" : undefined,
            is_quiz: false,
            correct_answer: "",
            score_value: 0
         });
         renderFields(container);
      };
   });
}

function renderFields(container) {
  const el = container.querySelector("#fb-fields");
  if (!currentFields.length) { el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50">Belum ada kolom. Klik tombol penambahan di atas.</p>`; return; }

  el.innerHTML = currentFields.map((f, i) => `
    <div draggable="true" data-idx="${i}" class="fb-field bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-3">
      <div class="flex items-start gap-3">
        <div class="cursor-grab text-slate-300 pt-2 hover:text-maroon-700 transition" title="Seret untuk urutkan">${icon("menu", "w-5 h-5")}</div>
        <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2 flex items-center justify-between">
             <span class="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded uppercase tracking-wider border border-slate-200">Tipe: ${f.type.replace('_', ' ')}</span>
          </div>
          <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Label Kolom (Pertanyaan)</label>
            <input data-f="label" value="${escapeHtml(f.label)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
          </div>
          <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Variabel Sistem (Otomatis)</label>
            <input data-f="name" value="${escapeHtml(f.name)}" readonly class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-100 text-slate-500 outline-none font-mono">
          </div>
          
          ${f.type === "formula" ? `
          <div class="sm:col-span-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
            <label class="text-[10px] font-bold text-amber-800 uppercase">Rumus Matematika</label>
            <p class="text-[10px] text-amber-700 mb-1">Gunakan nama <b>Variabel Sistem</b> di dalam kurung siku. Contoh: <code>([qty] * [harga]) / 100</code></p>
            <input data-f="formula" value="${escapeHtml(f.formula || "")}" placeholder="([field_a]+[field_b])" class="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 focus:border-amber-500 outline-none font-mono bg-white">
          </div>` : ""}

          ${f.type === "select" ? `
          <div class="sm:col-span-2">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Opsi Pilihan Manual (Pisahkan dg koma)</label>
            <input data-f="options" value="${escapeHtml((f.options || []).join(", "))}" placeholder="Laki-laki, Perempuan" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
          </div>` : ""}

          ${f.type === "db_select" ? `
          <div class="sm:col-span-2 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
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
          <div class="sm:col-span-2 grid grid-cols-2 gap-3 mt-1 p-3 bg-blue-50 border border-blue-200 rounded-lg">
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
          <div class="sm:col-span-2 mt-1 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
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

  // Event Listener Inputs
  el.querySelectorAll("[data-f]").forEach(input => {
    // Gunakan 'change' untuk checkbox/select agar langsung render ulang UI jika struktur berubah
    const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
    
    input.addEventListener(eventType, (e) => {
      const idx = parseInt(input.closest("[data-idx]").dataset.idx, 10);
      const key = input.dataset.f;

      if (key === "required") {
          currentFields[idx].required = input.checked;
      } 
      else if (key === "is_quiz") { 
          currentFields[idx].is_quiz = input.checked; 
          renderFields(container); // Render ulang untuk memunculkan kolom skor
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
          // Update visual name tanpa memicu render ulang keseluruhan (mencegah kursor hilang)
          const nameInput = input.closest('.fb-field').querySelector('[data-f="name"]');
          if (nameInput) nameInput.value = currentFields[idx].name;
      } 
      else if (key === "score_value") {
          currentFields[idx].score_value = parseFloat(input.value) || 0;
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
    <button type="button" class="btn-add-lpj-field text-xs bg-indigo-100 font-bold text-indigo-700 px-2.5 py-1 rounded border border-indigo-300 hover:bg-indigo-200 transition" data-type="file">+ Upload Bukti</button>
  `;
  tb.querySelectorAll(".btn-add-lpj-field").forEach(btn => {
    btn.onclick = () => {
      currentLpjFields.push({
        name: `lpj_kolom_${currentLpjFields.length + 1}`,
        label: `Kolom LPJ Baru ${currentLpjFields.length + 1}`,
        type: btn.dataset.type,
        required: true
      });
      renderLpjFields(container);
    };
  });
}

function renderLpjFields(container) {
  const el = container.querySelector("#fb-lpj-fields");
  if (!currentLpjFields.length) { el.innerHTML = `<p class="text-xs text-amber-700 text-center py-4 border-2 border-dashed border-amber-200 rounded-lg bg-white">Belum ada kolom LPJ. Contoh: "Foto Bukti Penggunaan" (Upload Bukti), "Nominal Realisasi" (Angka), "Catatan Realisasi" (Paragraf).</p>`; return; }

  el.innerHTML = currentLpjFields.map((f, i) => `
    <div draggable="true" data-lpj-idx="${i}" class="fb-lpj-field bg-white border border-amber-200 rounded-lg p-3">
      <div class="flex items-start gap-2">
        <div class="cursor-grab text-amber-300 pt-2" title="Seret untuk urutkan">${icon("menu", "w-4 h-4")}</div>
        <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="sm:col-span-2 text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded uppercase w-fit">Tipe: ${f.type}</div>
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

async function saveForm(container) {
  const id = container.querySelector("#fb-id").value.trim();
  const nama = container.querySelector("#fb-nama").value.trim();
  const usersRaw = container.querySelector("#fb-users").value.trim();
  if (!id || !nama) { toast("ID Form dan Nama Formulir wajib diisi", "warning"); return; }
  if (!currentFields.length) { toast("Tambahkan minimal satu kolom formulir", "warning"); return; }

  const requiresLpj = container.querySelector("#fb-requires-lpj").checked;
  const lpjDeadline = parseInt(container.querySelector("#fb-lpj-deadline").value) || 7;
  if (requiresLpj && !currentLpjFields.length) { toast("Aktifkan LPJ butuh minimal 1 kolom formulir LPJ (mis. Upload Bukti)", "warning"); return; }

  const payload = {
    nama_form: nama,
    approval_flow: currentFlow,
    allowed_rules: currentRules.join(", "),
    allowed_users: usersRaw || "ALL",
    fields_json: currentFields,
    requires_lpj: requiresLpj,
    lpj_deadline_days: lpjDeadline,
    lpj_fields_json: requiresLpj ? currentLpjFields : []
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
