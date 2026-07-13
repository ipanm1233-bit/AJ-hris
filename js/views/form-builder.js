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

  container.querySelectorAll(".fb-add-type").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.addtype;
      currentFields.push({
        name: `kolom_${currentFields.length + 1}`,
        label: `Kolom Baru ${currentFields.length + 1}`,
        type: type === "formula" ? "text" : type,
        required: false,
        options: type === "select" ? ["Opsi 1", "Opsi 2"] : undefined,
        formula: type === "formula" ? "" : undefined
      });
      renderFields(container);
    });
  });

  container.querySelector("#fb-cancel").addEventListener("click", () => closeBuilder(container));
  container.querySelector("#fb-save").addEventListener("click", () => saveForm(container));
  container.querySelector("#fb-delete").addEventListener("click", () => deleteForm(container));

  return { unmount() {} };
}

function renderFormList(container) {
  const listEl = container.querySelector("#fb-list");
  if (!allForms.length) { listEl.innerHTML = emptyState("Belum ada formulir dibuat"); return; }
  listEl.innerHTML = allForms.map(f => `
    <button data-form="${f.id}" class="w-full text-left bg-white border border-slate-100 rounded-xl p-3.5 hover:border-maroon-200 transition ${f.id === editingId ? "ring-2 ring-maroon-300" : ""}">
      <p class="text-sm font-medium text-slate-700">${escapeHtml(f.nama_form || f.id)}</p>
      <p class="text-xs text-slate-400 mt-0.5">${f.id}</p>
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

  container.querySelector("#fb-empty-hint").classList.add("hidden");
  container.querySelector("#fb-builder-wrap").classList.remove("hidden");
  container.querySelector("#fb-id").value = form ? form.id : genId("F-CUSTOM");
  container.querySelector("#fb-id").disabled = !!form;
  container.querySelector("#fb-nama").value = form ? form.nama_form : "";
  container.querySelector("#fb-users").value = form ? (Array.isArray(form.allowed_users) ? form.allowed_users.join(", ") : form.allowed_users || "") : "ALL";
  container.querySelector("#fb-delete").classList.toggle("hidden", !form);

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
    return `<button data-role="${r}" class="fb-flow-chip text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-maroon-700 text-white border-maroon-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}">${active ? `${idx + 1}. ` : ""}${r}</button>`;
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
    return `<button data-rule="${r}" class="fb-rule-chip text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}">${r}</button>`;
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

function renderFields(container) {
  const el = container.querySelector("#fb-fields");
  if (!currentFields.length) { el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">Belum ada kolom. Klik tombol "+ Teks", "+ Tanggal", dsb di atas.</p>`; return; }

  el.innerHTML = currentFields.map((f, i) => `
    <div draggable="true" data-idx="${i}" class="fb-field bg-slate-50 border border-slate-100 rounded-xl p-3.5">
      <div class="flex items-start gap-2">
        <div class="cursor-grab text-slate-300 pt-2" title="Seret untuk urutkan">${icon("menu", "w-4 h-4")}</div>
        <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-slate-400">Label Kolom</label>
            <input data-f="label" value="${escapeHtml(f.label)}" class="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
          </div>
          <div>
            <label class="text-[10px] text-slate-400">Nama Field (otomatis)</label>
            <input data-f="name" value="${escapeHtml(f.name)}" readonly class="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-100 text-slate-500 outline-none">
          </div>
          ${f.formula !== undefined ? `
          <div class="sm:col-span-2">
            <label class="text-[10px] text-slate-400">Rumus (gunakan [nama_field], contoh: ([km_akhir]-[km_awal])*(10000/25))</label>
            <input data-f="formula" value="${escapeHtml(f.formula || "")}" placeholder="([field_a]-[field_b])*(10000/25)" class="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none font-mono text-xs">
          </div>` : `
          <div class="flex items-center gap-2 pt-4">
            <label class="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" data-f="required" ${f.required ? "checked" : ""} class="rounded border-slate-300 text-maroon-700"> Wajib diisi</label>
          </div>`}
          ${f.type === "select" ? `
          <div class="sm:col-span-2">
            <label class="text-[10px] text-slate-400">Opsi Pilihan (pisahkan dengan koma)</label>
            <input data-f="options" value="${escapeHtml((f.options || []).join(", "))}" class="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
          </div>` : ""}
        </div>
        <button data-remove="${i}" class="text-slate-300 hover:text-red-600 p-1.5 transition">${icon("trash", "w-4 h-4")}</button>
      </div>
    </div>`).join("");

  el.querySelectorAll("[data-f]").forEach(input => {
    input.addEventListener("input", () => {
      const idx = parseInt(input.closest("[data-idx]").dataset.idx, 10);
      const key = input.dataset.f;
      if (key === "required") currentFields[idx].required = input.checked;
      else if (key === "options") currentFields[idx].options = input.value.split(",").map(s => s.trim()).filter(Boolean);
      else if (key === "label") { currentFields[idx].label = input.value; currentFields[idx].name = toSnakeCase(input.value) || `kolom_${idx + 1}`; renderFields(container); }
      else currentFields[idx][key] = input.value;
    });
  });
  el.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => { currentFields.splice(parseInt(btn.dataset.remove, 10), 1); renderFields(container); });
  });

  // Drag & drop reorder
  el.querySelectorAll(".fb-field").forEach(row => {
    row.addEventListener("dragstart", () => { dragIndex = parseInt(row.dataset.idx, 10); row.classList.add("dragging"); });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
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
  if (!id || !nama) { toast("ID Form dan Nama Formulir wajib diisi", "warning"); return; }
  if (!currentFields.length) { toast("Tambahkan minimal satu kolom formulir", "warning"); return; }

  const payload = {
    nama_form: nama,
    approval_flow: currentFlow,
    allowed_rules: currentRules.join(", "),
    allowed_users: usersRaw || "ALL",
    fields_json: currentFields
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
