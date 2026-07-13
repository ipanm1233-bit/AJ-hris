import { db, COL, collection, query, where, getDocs, orderBy, limit } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, openModal, closeModal, toast, genId, escapeHtml,
  fmtDateShort, evalFormula, toNumber
} from "../utils.js";
import { canAccessForm } from "../auth.js";
import { icon, badge, emptyState, skeletonRows } from "../components.js";

const FORM_ICONS = ["doc-plus", "clock", "wallet", "truck", "sun", "star", "box", "book"];

export async function mount(container, { session, params }) {
  const catalogEl = container.querySelector("#pengajuan-catalog");
  catalogEl.innerHTML = skeletonRows(3);

  const allForms = await fsGetAll(COL.FORM_CONFIG);
  const checks = await Promise.all(allForms.map(f => canAccessForm(normalizeForm(f), session)));
  let myForms = allForms.filter((f, i) => checks[i]);

  function renderCatalog(list) {
    if (!list.length) { catalogEl.innerHTML = `<div class="sm:col-span-2 lg:col-span-3">${emptyState("Belum ada formulir yang bisa Anda akses", "Hubungi HRD jika Anda memerlukan akses formulir tertentu.")}</div>`; return; }
    catalogEl.innerHTML = list.map((f, i) => `
      <button data-form="${f.id}" class="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-maroon-200 hover:shadow-md transition card-hover group">
        <div class="w-11 h-11 rounded-xl bg-maroon-50 text-maroon-700 flex items-center justify-center mb-3 group-hover:bg-maroon-700 group-hover:text-white transition">
          ${icon(FORM_ICONS[i % FORM_ICONS.length], "w-5 h-5")}
        </div>
        <p class="font-semibold text-slate-800 text-sm">${escapeHtml(f.nama_form || f.id)}</p>
        <p class="text-xs text-slate-400 mt-1">${(f.fields_json ? normalizeFields(f.fields_json).length : 0)} kolom isian • Alur: ${(normalizeArray(f.approval_flow)).join(" → ") || "-"}</p>
      </button>`).join("");

    catalogEl.querySelectorAll("[data-form]").forEach(btn => {
      btn.addEventListener("click", () => openFormModal(myForms.find(f => f.id === btn.dataset.form), session));
    });
  }
  renderCatalog(myForms);

  container.querySelector("#pengajuan-search").addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    renderCatalog(myForms.filter(f => (f.nama_form || "").toLowerCase().includes(term)));
  });

  await loadRecent(container, session);

  // Deep-link: #pengajuan?form=F-ISO-01 langsung buka modal form
  if (params && params.get && params.get("form")) {
    const f = myForms.find(x => x.id === params.get("form"));
    if (f) openFormModal(f, session);
  }

  return { unmount() {} };
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return v.split(",").map(s => s.trim()).filter(Boolean); } }
  return [];
}
function normalizeFields(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}
function normalizeForm(f) {
  return {
    ...f,
    allowed_users: normalizeArray(f.allowed_users).length ? normalizeArray(f.allowed_users) : (typeof f.allowed_users === "string" ? f.allowed_users.split(",").map(s => s.trim()) : []),
    allowed_rules: typeof f.allowed_rules === "string" ? f.allowed_rules.split(",").map(s => s.trim()) : normalizeArray(f.allowed_rules)
  };
}

/* ---------------------------------------------------------------------
 * DYNAMIC FORM RENDERER — mendukung: text, textarea, number, date,
 * select, formula (read-only terhitung otomatis), dan show_if (logika
 * kondisional sederhana: tampil hanya jika field lain bernilai tertentu)
 * ------------------------------------------------------------------- */
function openFormModal(formCfg, session) {
  if (!formCfg) return;
  const fields = normalizeFields(formCfg.fields_json);

  const bodyHtml = `
    <form id="dyn-form" class="space-y-4">
      ${fields.map(f => fieldWrapper(f)).join("")}
    </form>`;

  const modal = openModal({
    title: formCfg.nama_form,
    size: "md",
    bodyHtml,
    footerHtml: `
      <button id="dyn-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="dyn-submit" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition">Ajukan Sekarang</button>`,
    onMount: (m) => {
      const form = m.querySelector("#dyn-form");
      wireConditionalAndFormula(form, fields);
      m.querySelector("#dyn-cancel").onclick = closeModal;
      m.querySelector("#dyn-submit").onclick = async () => {
        if (!form.reportValidity()) return;
        const detail = collectValues(form, fields);
        await submitPengajuan(formCfg, detail, session);
      };
    }
  });
}

function fieldWrapper(f) {
  const req = f.required ? ' <span class="text-red-500">*</span>' : "";
  return `
    <div data-field-wrap="${f.name}" class="${f.show_if ? "hidden" : ""}">
      <label class="block text-xs font-medium text-slate-500 mb-1.5">${escapeHtml(f.label || f.name)}${req}</label>
      ${renderInput(f)}
      ${f.formula ? `<p class="text-[11px] text-slate-400 mt-1">Dihitung otomatis: ${escapeHtml(f.formula)}</p>` : ""}
    </div>`;
}

function renderInput(f) {
  const base = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition";
  const req = f.required ? "required" : "";
  if (f.formula) return `<input type="text" name="${f.name}" data-formula="${escapeHtml(f.formula)}" readonly class="${base} bg-slate-50 text-slate-500 cursor-not-allowed" value="0">`;
  switch (f.type) {
    case "textarea": return `<textarea name="${f.name}" rows="3" class="${base}" ${req}></textarea>`;
    case "select": return `<select name="${f.name}" class="${base}" ${req}>
        <option value="">Pilih ${escapeHtml(f.label || "")}</option>
        ${(f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
      </select>`;
    case "date": return `<input type="date" name="${f.name}" class="${base}" ${req}>`;
    case "number": return `<input type="number" step="any" name="${f.name}" class="${base}" ${req}>`;
    default: return `<input type="text" name="${f.name}" class="${base}" ${req}>`;
  }
}

function wireConditionalAndFormula(form, fields) {
  const recompute = () => {
    const fd = new FormData(form);
    const values = {};
    fields.forEach(f => values[f.name] = fd.get(f.name));

    // Conditional visibility
    fields.forEach(f => {
      if (!f.show_if) return;
      const wrap = form.querySelector(`[data-field-wrap="${f.name}"]`);
      const show = String(values[f.show_if.field] || "") === String(f.show_if.value);
      wrap.classList.toggle("hidden", !show);
    });

    // Formula fields
    fields.forEach(f => {
      if (!f.formula) return;
      const input = form.querySelector(`[name="${f.name}"]`);
      const result = evalFormula(f.formula, values);
      if (input) input.value = result === null ? "0" : result.toLocaleString("id-ID", { maximumFractionDigits: 2 });
    });
  };
  form.addEventListener("input", recompute);
  recompute();
}

function collectValues(form, fields) {
  const fd = new FormData(form);
  const detail = {};
  fields.forEach(f => { detail[f.name] = fd.get(f.name) ?? ""; });
  return detail;
}

/* ---------------------------------------------------------------------
 * SUBMIT — buat dokumen data_pengajuan + inisialisasi approval_steps
 * ------------------------------------------------------------------- */
async function submitPengajuan(formCfg, detail, session) {
  const approvalFlow = Array.isArray(formCfg.approval_flow) ? formCfg.approval_flow : normalizeArray(formCfg.approval_flow);
  const approvalSteps = approvalFlow.map(() => "PENDING");

  const payload = {
    id: genId("TRX"),
    tgl: new Date().toISOString(),
    nik: session.nik || "-",
    nama_pemohon: session.nama,
    form_id: formCfg.id,
    nama_form: formCfg.nama_form,
    detail,
    lampiran_url: detail.url_pdf || detail.lampiran || null,
    approval_flow: approvalFlow,
    approval_steps: approvalSteps,
    status_final: approvalFlow.length ? "MENUNGGU" : "APPROVED FINAL",
    catatan_penolakan: []
  };

  try {
    await fsAdd(COL.DATA_PENGAJUAN, payload, payload.id);
    toast("Pengajuan berhasil dikirim dan menunggu persetujuan", "success");
    closeModal();
    const container = document.getElementById("view-container");
    if (container) await loadRecent(container, session);
  } catch (e) {
    console.error(e);
    toast("Gagal mengirim pengajuan: " + e.message, "error");
  }
}

/* ---------------------------------------------------------------------
 * RECENT SUBMISSIONS LIST
 * ------------------------------------------------------------------- */
async function loadRecent(container, session) {
  const wrap = container.querySelector("#pengajuan-recent");
  if (!wrap) return;
  wrap.innerHTML = `<div class="p-4">${skeletonRows(3)}</div>`;
  try {
    const q = query(collection(db, COL.DATA_PENGAJUAN), where("nama_pemohon", "==", session.nama), orderBy("tgl", "desc"), limit(5));
    const snap = await getDocs(q);
    if (snap.empty) { wrap.innerHTML = emptyState("Belum ada pengajuan", "Riwayat pengajuan Anda akan tampil di sini."); return; }
    wrap.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const tone = r.status_final?.includes("APPROVED") ? "green" : r.status_final?.includes("REJECT") ? "red" : "amber";
      return `
        <div class="flex items-center justify-between p-4 hover:bg-slate-50 transition">
          <div>
            <p class="text-sm font-medium text-slate-700">${escapeHtml(r.nama_form)}</p>
            <p class="text-xs text-slate-400 mt-0.5">${fmtDateShort(r.tgl)} • ${escapeHtml(r.id)}</p>
          </div>
          ${badge(r.status_final || "MENUNGGU", tone)}
        </div>`;
    }).join("");
  } catch (e) {
    console.error(e);
    wrap.innerHTML = emptyState("Belum ada pengajuan");
  }
}
