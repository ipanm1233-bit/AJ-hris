import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, toSnakeCase, toast, confirmDialog, escapeHtml, genId } from "../utils.js";
import { icon, emptyState } from "../components.js";

const ROLE_OPTIONS = ["HRD", "GM", "FINANCE", "SPV", "ATASAN", "SALES", "MANAGER"];
let allForms = [];
let editingId = null;
let currentFields = [];
let currentFlow = [];
let currentRules = [];
let dragIndex = null;

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
      <p class="text-[11px] font-medium text-slate-400 mt-1">ID: ${f.id} ${f.wajib_lpj ? '<span class="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-1">Wajib LPJ</span>' : ''}</p>
    </button>`).join("");
  listEl.querySelectorAll("[data-form]").forEach(btn => {
    btn.addEventListener("click", () => openBuilder(container, allForms.find(f => f.id === btn.dataset.form)));
  });
}

function normalizeFields(v) { if (Array.isArray(v)) return v; if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } } return []; }
function normalizeArray(v) { if (Array.isArray(v)) return v; if (typeof v === "string") { try { return JSON.parse(v); } catch { return v.split(",").map(s => s.trim()).filter(Boolean); } } return []; }

function openBuilder(container, form) {
  editingId = form ? form.id : null;
  currentFields = form ? JSON.parse(JSON.stringify(normalizeFields(form.fields_json))) : [];
  currentFlow = form ? normalizeArray(form.approval_flow) : ["HRD"];
  currentRules = form ? (typeof form.allowed_rules === "string" ? form.allowed_rules.split(",").map(s => s.trim()) : normalizeArray(form.allowed_rules)) : ["HRD"];

  container.querySelector("#fb-empty-hint").classList.add("hidden");
  container.querySelector("#fb-builder-wrap").classList.remove("hidden");
  container.querySelector("#fb-id").value = form ? form.id : genId("F-CUSTOM");
  container.querySelector("#fb-id").disabled = !!form;
  container.querySelector("#fb-nama").value = form ? form.nama_form : "";
  container.querySelector("#fb-users").value = form ? (Array.isArray(form.allowed_users) ? form.allowed_users.join(", ") : form.allowed_users || "") : "ALL";
  
  // Fitur Wajib LPJ / Pertanggungjawaban
  const lpjHtml = `<label class="flex items-center gap-2 mt-4 text-sm font-bold text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200 cursor-pointer">
       <input type="checkbox" id="fb-wajib-lpj" ${form && form.wajib_lpj ? "checked" : ""} class="w-4 h-4 rounded text-amber-600 focus:ring-amber-500">
       Formulir ini Membutuhkan Laporan Pertanggungjawaban (LPJ) setelah disetujui (Contoh: Dinas, Kasbon).
  </label>`;
  if(!container.querySelector("#fb-wajib-lpj")) {
      container.querySelector("#fb-nama").parentElement.insertAdjacentHTML("afterend", lpjHtml);
  } else {
      container.querySelector("#fb-wajib-lpj").checked = form ? form.wajib_lpj : false;
  }

  container.querySelector("#fb-delete").classList.toggle("hidden", !form);

  ensureToolbar(container);
  renderFlowChips(container);
  renderRuleChips(container);
  renderFields(container);
  renderFormList(container);
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
        <button type="button" class="btn-add-field text-xs bg-white text-slate-700 px-3 py-1.5 rounded border border-slate-200 hover:border-emerald-500 hover:text-emerald-700 transition shadow-sm" data-type="select">+ Dropdown Manual</button>
        <button type="button" class="btn-add-field text-xs bg-emerald-50 font-bold text-emerald-700 px-3 py-1.5 rounded border border-emerald-200 hover:bg-emerald-100 transition shadow-sm" data-type="db_select">+ Dropdown Database</button>
        <button type="button" class="btn-add-field text-xs bg-purple-50 font-bold text-purple-700 px-3 py-1.5 rounded border border-purple-200 hover:bg-purple-100 transition shadow-sm" data-type="upload">+ Upload Foto/Bukti</button>
        <button type="button" class="btn-add-field text-xs bg-amber-50 font-bold text-amber-700 px-3 py-1.5 rounded border border-amber-200 hover:bg-amber-100 transition shadow-sm" data-type="formula">+ Formula Kalkulasi</button>
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
            panduan: "" // Menambahkan properti Panduan SOP
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

          <div class="sm:col-span-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
            <label class="text-[10px] font-bold text-blue-800 uppercase tracking-wide">Panduan / SOP Pengisian Karyawan (Opsional)</label>
            <p class="text-[10px] text-blue-600 mb-1">Teks ini akan muncul sebagai instruksi bagi karyawan saat mengisi kolom ini.</p>
            <input data-f="panduan" value="${escapeHtml(f.panduan || "")}" placeholder="Cth: Jika untuk perbaikan rumah, wajib fotokan area yang rusak..." class="w-full px-3 py-2 text-sm rounded-lg border border-blue-200 focus:border-blue-400 outline-none bg-white">
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
          </div>
        </div>
        <button data-remove="${i}" class="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition" title="Hapus Kolom">${icon("trash", "w-5 h-5")}</button>
      </div>
    </div>`).join("");

  el.querySelectorAll("[data-f]").forEach(input => {
    const eventType = (input.type === 'checkbox' || input.tagName === 'SELECT') ? 'change' : 'input';
    input.addEventListener(eventType, (e) => {
      const idx = parseInt(input.closest("[data-idx]").dataset.idx, 10);
      const key = input.dataset.f;

      if (key === "required") { currentFields[idx].required = input.checked; } 
      else if (key === "options") { currentFields[idx].options = input.value.split(",").map(s => s.trim()).filter(Boolean); } 
      else if (key === "label") { 
          currentFields[idx].label = input.value; 
          currentFields[idx].name = toSnakeCase(input.value) || `kolom_${idx + 1}`; 
          const nameInput = input.closest('.fb-field').querySelector('[data-f="name"]');
          if (nameInput) nameInput.value = currentFields[idx].name;
      } 
      else { currentFields[idx][key] = input.value; }
    });
  });

  el.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => { currentFields.splice(parseInt(btn.dataset.remove, 10), 1); renderFields(container); });
  });

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

async function saveForm(container) {
  const id = container.querySelector("#fb-id").value.trim();
  const nama = container.querySelector("#fb-nama").value.trim();
  const usersRaw = container.querySelector("#fb-users").value.trim();
  const wajibLpj = container.querySelector("#fb-wajib-lpj") ? container.querySelector("#fb-wajib-lpj").checked : false;

  if (!id || !nama) { toast("ID Form dan Nama Formulir wajib diisi", "warning"); return; }
  if (!currentFields.length) { toast("Tambahkan minimal satu kolom formulir", "warning"); return; }

  const payload = {
    nama_form: nama,
    approval_flow: currentFlow,
    allowed_rules: currentRules.join(", "),
    allowed_users: usersRaw || "ALL",
    fields_json: currentFields,
    wajib_lpj: wajibLpj // Simpan setingan LPJ
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
  const ok = await confirmDialog("Formulir yang dihapus tidak dapat dikembalikan. Lanjutkan?");
  if (!ok) return;
  try {
    await fsDelete(COL.FORM_CONFIG, editingId);
    allForms = allForms.filter(f => f.id !== editingId);
    toast("Formulir berhasil dihapus", "success");
    closeBuilder(container);
  } catch (e) { toast("Gagal menghapus: " + e.message, "error"); }
}
