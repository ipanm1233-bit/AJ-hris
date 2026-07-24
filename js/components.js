/**
 * =====================================================================
 * COMPONENTS.JS — Pustaka komponen UI yang dapat dipakai ulang
 * =====================================================================
 */
import { COL } from "./firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, confirmDialog,
  toast, fmtDateShort, fmtRupiah, toNumber, genId, escapeHtml, localDateStr
} from "./utils.js";

/* ---------------------------------------------------------------------
 * ICON SET (inline SVG, mengikuti aksen warna via currentColor)
 * ------------------------------------------------------------------- */
const ICONS = {
  home: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>',
  "doc-plus": '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-3-3v6m5 5H7a2 2 0 01-2-2V4a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
  clock: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>',
  calendar: '<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>',
  database: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 7c0 1.657 3.582 3 8 3s8-1.343 8-3M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3m0 5c0 1.657-3.582 3-8 3s-8-1.343-8-3"/>',
  "user-plus": '<path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m9-11a4 4 0 100-8 4 4 0 000 8zm6 3v6m3-3h-6"/>',
  utensils: '<path stroke-linecap="round" stroke-linejoin="round" d="M11 3v18M7 3v6a2 2 0 002 2h0a2 2 0 002-2V3M17 3c-1.5 0-3 1.5-3 4s1.5 4 3 4v8"/>',
  wallet: '<path stroke-linecap="round" stroke-linejoin="round" d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4h-4z"/>',
  box: '<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>',
  truck: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 16V6a1 1 0 011-1h9a1 1 0 011 1v10m-11 0h11m-11 0a2 2 0 104 0m7 0a2 2 0 104 0m-4 0h4m0 0V9h3l3 4v3h-2"/>',
  book: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>',
  layers: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5"/>',
  alert: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>',
  download: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>',
  refresh: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>',
  settings: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
  "check-circle": '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
  star: '<path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.519-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>',
  sun: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>',
  megaphone: '<path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>',
  edit: '<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>',
  trash: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>',
  search: '<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>',
  chevron: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>',
  x: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>',
  menu: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>',
  bell: '<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>',
  logout: '<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>',
  plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>',
  filter: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>',
  printer: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/>',
  link: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>',
  car: '<path stroke-linecap="round" stroke-linejoin="round" d="M5 17h14M5 17a2 2 0 11-4 0 2 2 0 014 0zm14 0a2 2 0 11-4 0 2 2 0 014 0zM5 17V9l2-5h10l2 5v8M5 9h14"/>',
  gauge: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
};
export function icon(name, cls = "w-5 h-5") {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">${ICONS[name] || ICONS.star}</svg>`;
}

export function avatar(name = "?", size = "w-10 h-10") {
  if (name && (name.startsWith("data:image/") || name.startsWith("http://") || name.startsWith("https://"))) {
    return `<div class="${size} rounded-full overflow-hidden shrink-0"><img src="${name}" class="w-full h-full object-cover"></div>`;
  }
  const cachedPhoto = localStorage.getItem("custom_avatar_" + name);
  if (cachedPhoto) {
    return `<div class="${size} rounded-full overflow-hidden shrink-0"><img src="${cachedPhoto}" class="w-full h-full object-cover"></div>`;
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return `<div class="${size} rounded-full bg-maroon-100 text-maroon-800 flex items-center justify-center font-semibold text-sm shrink-0">${initials || "?"}</div>`;
}

export function badge(text, tone = "slate") {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    maroon: "bg-maroon-100 text-maroon-800",
    blue: "bg-blue-100 text-blue-700",
  };
  return `<span class="px-2.5 py-1 rounded-full text-xs font-medium ${tones[tone] || tones.slate}">${escapeHtml(text)}</span>`;
}

export function emptyState(message = "Belum ada data", sub = "") {
  return `
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 text-slate-300">${icon("box", "w-8 h-8")}</div>
      <p class="text-slate-500 font-medium">${message}</p>
      ${sub ? `<p class="text-slate-400 text-sm mt-1">${sub}</p>` : ""}
    </div>`;
}

export function skeletonRows(n = 4) {
  return Array.from({ length: n }).map(() => `<div class="h-14 bg-slate-100 rounded-xl animate-pulse"></div>`).join("");
}

/* ---------------------------------------------------------------------
 * GENERIC CRUD MODULE FACTORY
 * Menyediakan: search bar, tombol tambah, tabel data, modal form
 * add/edit, hapus dengan konfirmasi, dan export CSV bawaan.
 * Dipakai oleh modul-modul list/manajemen sederhana agar konsisten &
 * hemat kode (Inventory, Kendaraan, Gimmick/SOP, Rekrutmen non-kanban,
 * Uang Makan, Log-log operasional, dsb).
 * ------------------------------------------------------------------- */
export async function renderCrudModule(container, cfg) {
  const {
    title, subtitle = "", collectionName, columns, formFields,
    idPrefix = "REC", searchFields = [], canCreate = true, canEdit = true,
    canDelete = true, extraToolbarHtml = "", onRowRender = null, printFn = null, printLabel = "Cetak Dokumen",
    beforeSave = null, afterSave = null, orderByField = null, filterFn = null, emptyMessage = null
  } = cfg;

  container.innerHTML = `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold text-slate-800">${title}</h2>
          ${subtitle ? `<p class="text-sm text-slate-500 mt-0.5">${subtitle}</p>` : ""}
        </div>
        <div class="flex items-center gap-2">
          ${extraToolbarHtml}
          <div class="relative">
            <input id="crud-search" type="text" placeholder="Cari..." class="pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition w-48">
            <span class="absolute left-2.5 top-2.5 text-slate-400">${icon("search", "w-4 h-4")}</span>
          </div>
          <button id="crud-export" class="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition" title="Export CSV">${icon("download", "w-4 h-4")}</button>
          ${canCreate ? `<button id="crud-add" class="flex items-center gap-1.5 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition shadow-sm shadow-maroon-900/10">${icon("plus", "w-4 h-4")}Tambah</button>` : ""}
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                ${columns.map(c => `<th class="px-4 py-3 text-left font-medium">${c.label}</th>`).join("")}
                <th class="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody id="crud-tbody"></tbody>
          </table>
        </div>
        <div id="crud-empty"></div>
      </div>
    </div>`;

  let rows = [];
  const tbody = container.querySelector("#crud-tbody");
  tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" class="p-4"><div class="space-y-2">${skeletonRows(3)}</div></td></tr>`;

  async function load() {
    rows = await fsGetAll(collectionName, orderByField ? { orderByField } : {});
    if (filterFn) rows = rows.filter(filterFn);
    renderRows(rows);
  }

  function cellValue(row, col) {
    let v = row[col.key];
    if (col.type === "date") return fmtDateShort(v);
    if (col.type === "currency") return fmtRupiah(v);
    if (col.type === "number") return (v ?? 0).toLocaleString("id-ID");
    if (col.type === "badge") return badge(v ?? "-", (col.badgeTone && col.badgeTone(v)) || "slate");
    if (col.type === "link") return v ? `<a href="${v}" target="_blank" class="text-maroon-700 hover:underline inline-flex items-center gap-1">${icon("link","w-3.5 h-3.5")}Lihat</a>` : "-";
    return v === undefined || v === null || v === "" ? "-" : escapeHtml(String(v));
  }

  function renderRows(list) {
    if (!list.length) {
      tbody.innerHTML = "";
      container.querySelector("#crud-empty").innerHTML = emptyState(emptyMessage || "Belum ada data pada modul ini", "Klik tombol Tambah untuk membuat data baru.");
      return;
    }
    container.querySelector("#crud-empty").innerHTML = "";
    tbody.innerHTML = list.map(row => `
      <tr class="border-t border-slate-50 hover:bg-slate-50/60 transition">
        ${columns.map(c => `<td class="px-4 py-3 text-slate-700">${cellValue(row, c)}</td>`).join("")}
        <td class="px-4 py-3 text-right whitespace-nowrap">
          ${printFn ? `<button data-print="${row.id}" title="${escapeHtml(printLabel)}" class="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition">${icon("printer", "w-4 h-4")}</button>` : ""}
          ${canEdit ? `<button data-edit="${row.id}" class="text-slate-400 hover:text-maroon-700 p-1.5 rounded-lg hover:bg-maroon-50 transition">${icon("edit", "w-4 h-4")}</button>` : ""}
          ${canDelete ? `<button data-del="${row.id}" class="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition">${icon("trash", "w-4 h-4")}</button>` : ""}
        </td>
      </tr>`).join("");

    if (printFn) {
      tbody.querySelectorAll("[data-print]").forEach(btn => {
        btn.onclick = () => printFn(rows.find(r => r.id === btn.dataset.print));
      });
    }
    tbody.querySelectorAll("[data-edit]").forEach(btn => {
      btn.onclick = () => openForm(rows.find(r => r.id === btn.dataset.edit));
    });
    tbody.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = async () => {
        const ok = await confirmDialog("Data yang dihapus tidak dapat dikembalikan. Lanjutkan hapus data ini?");
        if (!ok) return;
        await fsDelete(collectionName, btn.dataset.del);
        toast("Data berhasil dihapus", "success");
        load();
      };
    });
    if (onRowRender) onRowRender(list, container);
  }

  function fieldInput(f, value = "") {
    const val = value === undefined || value === null ? "" : value;
    const base = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition";
    if (f.type === "textarea") return `<textarea name="${f.name}" rows="3" class="${base}" ${f.required ? "required" : ""}>${escapeHtml(val)}</textarea>`;
    if (f.type === "select") return `<select name="${f.name}" class="${base}" ${f.required ? "required" : ""}>
        <option value="">Pilih ${f.label}</option>
        ${(f.options || []).map(o => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("")}
      </select>`;
    if (f.type === "date") {
      let dv = "";
      if (val) { const dv2 = localDateStr(val); if (dv2) dv = dv2; }
      return `<input type="date" name="${f.name}" value="${dv}" class="${base}" ${f.required ? "required" : ""}>`;
    }
    return `<input type="${f.type === "number" ? "number" : "text"}" name="${f.name}" value="${escapeHtml(val)}" class="${base}" ${f.required ? "required" : ""}>`;
  }

  function openForm(existing = null) {
    openModal({
      title: existing ? `Edit ${title}` : `Tambah ${title}`,
      size: "md",
      bodyHtml: `
        <form id="crud-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${formFields.map(f => `
            <div class="${f.full ? "sm:col-span-2" : ""}">
              <label class="block text-xs font-medium text-slate-500 mb-1.5">${f.label}${f.required ? ' <span class="text-red-500">*</span>' : ""}</label>
              ${fieldInput(f, existing ? existing[f.name] : (f.default || ""))}
            </div>`).join("")}
        </form>`,
      footerHtml: `
        <button id="crud-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="crud-save" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition">Simpan</button>`,
      onMount: (m) => {
        m.querySelector("#crud-cancel").onclick = closeModal;
        m.querySelector("#crud-save").onclick = async () => {
          const form = m.querySelector("#crud-form");
          if (!form.reportValidity()) return;
          const fd = new FormData(form);
          let data = {};
          formFields.forEach(f => {
            let v = fd.get(f.name);
            if (f.type === "number") v = toNumber(v);
            data[f.name] = v;
          });
          if (beforeSave) data = (await beforeSave(data, existing)) || data;
          try {
            let savedId;
            if (existing) { await fsUpdate(collectionName, existing.id, data); savedId = existing.id; }
            else { savedId = formFields.idFromField ? data[formFields.idFromField] : genId(idPrefix); await fsAdd(collectionName, data, savedId); }
            if (afterSave) { try { await afterSave(data, !existing, savedId); } catch (e) { console.warn("afterSave error:", e); } }
            toast(existing ? "Data berhasil diperbarui" : "Data baru berhasil ditambahkan", "success");
            closeModal();
            load();
          } catch (e) {
            console.error(e);
            toast("Gagal menyimpan data: " + e.message, "error");
          }
        };
      }
    });
  }

  container.querySelector("#crud-add")?.addEventListener("click", () => openForm());
  container.querySelector("#crud-export")?.addEventListener("click", () => {
    if (!rows.length) { toast("Tidak ada data untuk diekspor", "warning"); return; }
    openExportPicker(title, columns, rows);
  });
  container.querySelector("#crud-search")?.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) return renderRows(rows);
    const fields = searchFields.length ? searchFields : columns.map(c => c.key);
    renderRows(rows.filter(r => fields.some(f => String(r[f] ?? "").toLowerCase().includes(term))));
  });

  await load();
  return { reload: load };
}

/* ---------------------------------------------------------------------
 * TIMELINE COMPONENT — Riwayat Karyawan terpadu
 * items: [{ date, type:'pengajuan'|'memo'|'pemanggilan'|'sp'|'konseling', title, desc, status, tone }]
 * ------------------------------------------------------------------- */
export function renderTimeline(container, items) {
  if (!items.length) { container.innerHTML = emptyState("Belum ada riwayat", "Aktivitas karyawan akan muncul di sini secara kronologis."); return; }
  const typeIcon = { pengajuan: "doc-plus", memo: "megaphone", pemanggilan: "alert", sp: "alert", konseling: "star" };
  const typeTone = { pengajuan: "blue", memo: "maroon", pemanggilan: "amber", sp: "red", konseling: "green" };
  container.innerHTML = `
    <div class="relative pl-8">
      <div class="absolute left-[13px] top-2 bottom-2 w-px bg-slate-200"></div>
      <div class="space-y-6">
        ${items.map(it => `
          <div class="relative">
            <div class="absolute -left-8 top-0.5 w-7 h-7 rounded-full flex items-center justify-center bg-${typeTone[it.type] === "maroon" ? "maroon" : typeTone[it.type]}-100 text-${typeTone[it.type] === "maroon" ? "maroon" : typeTone[it.type]}-700 ring-4 ring-white">
              ${icon(typeIcon[it.type] || "star", "w-3.5 h-3.5")}
            </div>
            <div class="bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:shadow-md transition">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <p class="font-medium text-slate-800 text-sm">${escapeHtml(it.title)}</p>
                <span class="text-xs text-slate-400">${fmtDateShort(it.date)}</span>
              </div>
              ${it.desc ? `<p class="text-sm text-slate-500 mt-1">${escapeHtml(it.desc)}</p>` : ""}
              ${it.status ? `<div class="mt-2">${badge(it.status, it.tone || "slate")}</div>` : ""}
            </div>
          </div>`).join("")}
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------
 * KANBAN COMPONENT — untuk Rekrutmen (ATS) & Siklus Karyawan
 * ------------------------------------------------------------------- */
export function renderKanban(container, { columns, items, onCardClick, onDrop }) {
  container.innerHTML = `
    <div class="flex gap-4 overflow-x-auto pb-4">
      ${columns.map(col => `
        <div class="flex-shrink-0 w-72 bg-slate-50 rounded-2xl p-3" data-col="${col.key}">
          <div class="flex items-center justify-between px-1 mb-3">
            <p class="text-sm font-semibold text-slate-600">${col.label}</p>
            <span class="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-500">${items.filter(i => i.status === col.key).length}</span>
          </div>
          <div class="space-y-2 min-h-[80px]" data-dropzone="${col.key}">
            ${items.filter(i => i.status === col.key).map(card => `
              <div draggable="true" data-card="${card.id}" class="bg-white rounded-xl p-3 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition">
                <p class="text-sm font-medium text-slate-800">${escapeHtml(card.title)}</p>
                <p class="text-xs text-slate-400 mt-1">${escapeHtml(card.subtitle || "")}</p>
              </div>`).join("")}
          </div>
        </div>`).join("")}
    </div>`;

  container.querySelectorAll("[data-card]").forEach(cardEl => {
    cardEl.addEventListener("click", () => onCardClick && onCardClick(items.find(i => i.id === cardEl.dataset.card)));
    cardEl.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", cardEl.dataset.card));
  });
  container.querySelectorAll("[data-dropzone]").forEach(zone => {
    zone.addEventListener("dragover", (e) => e.preventDefault());
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const cardId = e.dataTransfer.getData("text/plain");
      onDrop && onDrop(cardId, zone.dataset.dropzone);
    });
  });
}

/** Versi teks-polos dari cellValue() — dipakai untuk export, bukan tampilan tabel (tanpa tag HTML). */
function plainCellValue(row, col) {
  let v = row[col.key];
  if (v && typeof v === "object" && typeof v.toDate === "function") v = v.toDate();
  if (col.type === "date" || v instanceof Date) return v ? fmtDateShort(v) : "";
  if (col.type === "currency") return v ? fmtRupiah(v) : 0;
  if (col.type === "number") return v ?? 0;
  if (col.type === "badge" || col.type === "link") return v ?? "";
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return v;
}

/** Menggabungkan kolom tampilan (label rapi) dengan SEMUA field lain yang ada di data (label otomatis). */
function buildFullColumnList(columns, rows) {
  const seen = new Set(columns.map(c => c.key));
  const extra = [];
  rows.forEach(row => {
    Object.keys(row).forEach(k => { if (!seen.has(k)) { seen.add(k); extra.push(k); } });
  });
  const autoLabel = (k) => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return [...columns, ...extra.map(k => ({ key: k, label: autoLabel(k) }))];
}

/**
 * Modal pemilih kolom export — kini SELALU menampilkan seluruh field yang ada
 * di data (bukan cuma kolom tampilan tabel), plus pilihan format CSV/Excel.
 * Kirim columns=[] untuk memaksa daftar kolom sepenuhnya otomatis dari data
 * (dipakai oleh Export Data untuk koleksi apapun).
 */
export function openExportPicker(title, columns, rows) {
  const fullColumns = buildFullColumnList(columns || [], rows);
  let order = fullColumns.map((c, i) => i);
  let dragIdx = null;

  function renderList(container) {
    const list = container.querySelector("#exp-col-list");
    list.innerHTML = order.map((colIdx, pos) => {
      const c = fullColumns[colIdx];
      return `
      <div draggable="true" data-pos="${pos}" class="exp-col-row flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
        <span class="cursor-grab text-slate-300" title="Seret untuk urutkan">${icon("menu", "w-4 h-4")}</span>
        <label class="flex items-center gap-2 text-sm text-slate-700 flex-1 cursor-pointer">
          <input type="checkbox" data-colidx="${colIdx}" class="exp-col-check rounded border-slate-300 text-maroon-700" checked>
          ${escapeHtml(c.label)}
        </label>
      </div>`;
    }).join("");

    list.querySelectorAll(".exp-col-row").forEach(row => {
      row.addEventListener("dragstart", () => { dragIdx = parseInt(row.dataset.pos, 10); row.style.opacity = "0.4"; });
      row.addEventListener("dragend", () => { row.style.opacity = "1"; dragIdx = null; });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", () => {
        const targetPos = parseInt(row.dataset.pos, 10);
        if (dragIdx === null || dragIdx === targetPos) return;
        const [moved] = order.splice(dragIdx, 1);
        order.splice(targetPos, 0, moved);
        renderList(container);
      });
    });
  }

  openModal({
    title: `Export ${title}`,
    size: "md",
    bodyHtml: `
      <p class="text-xs text-slate-500 mb-3">Pilih kolom (seluruh field yang ada di data ditampilkan) dan seret ${icon("menu","w-3.5 h-3.5 inline")} untuk mengatur urutan.</p>
      <div class="flex gap-2 mb-3">
        <button type="button" id="exp-select-all" class="text-xs px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50">Pilih Semua</button>
        <button type="button" id="exp-select-none" class="text-xs px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50">Kosongkan</button>
      </div>
      <div id="exp-col-list" class="space-y-1.5 max-h-80 overflow-y-auto pr-1"></div>
    `,
    footerHtml: `
      <button id="exp-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="exp-csv" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-600 hover:bg-slate-700 transition flex items-center gap-1.5">${icon("download","w-4 h-4")}CSV</button>
      <button id="exp-xlsx" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition flex items-center gap-1.5">${icon("download","w-4 h-4")}Excel</button>`,
    onMount: (m) => {
      renderList(m);
      m.querySelector("#exp-select-all").onclick = () => m.querySelectorAll(".exp-col-check").forEach(chk => chk.checked = true);
      m.querySelector("#exp-select-none").onclick = () => m.querySelectorAll(".exp-col-check").forEach(chk => chk.checked = false);
      m.querySelector("#exp-cancel").onclick = closeModal;

      function getChosen() {
        const checks = Array.from(m.querySelectorAll(".exp-col-check"));
        const chosenIdx = checks.filter(c => c.checked).map(c => parseInt(c.dataset.colidx, 10));
        if (!chosenIdx.length) { toast("Pilih minimal satu kolom", "warning"); return null; }
        const chosenOrdered = order.filter(idx => chosenIdx.includes(idx));
        const chosenCols = chosenOrdered.map(idx => fullColumns[idx]);
        return {
          headers: chosenCols.map(c => c.label),
          matrix: rows.map(row => chosenCols.map(c => plainCellValue(row, c)))
        };
      }
      const baseName = title.toLowerCase().replace(/\s+/g, "_");
      m.querySelector("#exp-csv").onclick = async () => {
        const data = getChosen(); if (!data) return;
        const { downloadCsv } = await import("./utils.js");
        downloadCsv(`${baseName}.csv`, data.headers, data.matrix);
        toast("File CSV berhasil diunduh", "success");
        closeModal();
      };
      m.querySelector("#exp-xlsx").onclick = async () => {
        const data = getChosen(); if (!data) return;
        const { downloadXlsx } = await import("./utils.js");
        await downloadXlsx(`${baseName}.xlsx`, data.headers, data.matrix, title);
        toast("File Excel berhasil diunduh", "success");
        closeModal();
      };
    }
  });
}

export { fsGetAll, fsAdd, fsUpdate, fsDelete };

/* ---------------------------------------------------------------------
 * PUSAT NOTIFIKASI (lonceng header) — dipanggil global dari app.js agar
 * bisa diklik dari halaman manapun, tidak hanya saat berada di Dashboard.
 * Menampilkan: Antrean Persetujuan, Tugas KPI 360, Warning Kontrak
 * (khusus HRD/SUPERADMIN), dan Pengumuman aktif (broadcast memo).
 * ------------------------------------------------------------------- */
export async function openNotificationCenter(session) {
  openModal({
    title: "Pusat Notifikasi",
    bodyHtml: `<div class="p-8 text-center text-slate-500 font-medium animate-pulse">Mengumpulkan data notifikasi...</div>`,
    footerHtml: `<button id="btn-tutup-notif" class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs text-slate-700 font-bold transition">Tutup</button>`,
    onMount: m => m.querySelector("#btn-tutup-notif").onclick = closeModal
  });

  try {
    const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";

    const [semuaPengajuan, tugasKpi, kontrak, broadcastRows, personalNotifs] = await Promise.all([
      fsGetAll(COL.DATA_PENGAJUAN),
      fsGetAll(COL.TUGAS_KPI_360).catch(() => []),
      isHrd ? fsGetAll(COL.MASTER_KONTRAK) : Promise.resolve([]),
      fsGetAll(COL.BROADCAST).catch(() => []),
      fsGetAll(COL.NOTIFICATIONS).then(rows => rows.filter(n => n.username_target === session.username).sort((a,b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0))).catch(() => [])
    ]);

    const myApproval = semuaPengajuan.filter(r => {
      if (r.status_final !== "MENUNGGU") return false;
      const idx = (r.approval_steps || []).findIndex(s => s === "PENDING");
      if (idx === -1) return false;
      const stepLabel = (r.approval_flow || [])[idx] || "";
      return stepLabel.toUpperCase() === session.role.toUpperCase() || stepLabel.toUpperCase() === "ATASAN";
    });

    const myKpi = tugasKpi.filter(t => t.nama_penilai === session.nama && t.status !== "DONE");
    const kontrakHabis = isHrd ? kontrak.filter(k => k.status_kolom_kontrak === "SEGERA HABIS") : [];

    const nowForLpj = new Date();
    const myLpjPending = semuaPengajuan.filter(r => r.requires_lpj && r.lpj_status === "BELUM" && r.nama_pemohon === session.nama);
    const myLpjOverdue = myLpjPending.filter(r => r.lpj_due_date && new Date(r.lpj_due_date) < nowForLpj);
    const orgLpjOverdue = isHrd ? semuaPengajuan.filter(r => r.requires_lpj && r.lpj_status === "BELUM" && r.lpj_due_date && new Date(r.lpj_due_date) < nowForLpj) : [];

    const now = new Date();
    const pengumumanAktif = broadcastRows.filter(r => {
      if (r.tanggal_berakhir) {
        const batas = new Date(r.tanggal_berakhir); batas.setHours(23, 59, 59, 999);
        if (batas < now) return false;
      }
      if (r.target_type === "SPESIFIK") {
         return (r.target_list || []).includes(session?.nama);
      }
      return true;
    }).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

    // Bikin struktur Terpadu & Terkonsolidasi (Unified Stream)
    const items = [];

    // 1. Notifikasi Pribadi & Status Pengajuan
    personalNotifs.forEach(n => {
      items.push({
        id: n.id,
        cat: 'status',
        badge: 'Update Status',
        tone: 'indigo',
        iconName: 'bell',
        title: n.judul || 'Notifikasi Sistem',
        message: n.pesan || '',
        date: n.tanggal ? new Date(n.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
        unread: !n.dibaca,
        link: n.link || '#riwayat'
      });
    });

    // 2. Pengumuman Aktif
    if (pengumumanAktif.length > 0) {
      items.push({
        id: 'announcements-group',
        cat: 'announcement',
        badge: 'Pengumuman Perusahaan',
        tone: 'purple',
        iconName: 'megaphone',
        title: `${pengumumanAktif.length} Pengumuman Resmi Aktif`,
        message: pengumumanAktif.slice(0, 3).map(p => p.judul || p.title || "Pengumuman").join(" • "),
        date: pengumumanAktif[0]?.tanggal ? fmtDateShort(pengumumanAktif[0].tanggal) : '',
        unread: true,
        action: () => openActiveAnnouncementsModal(pengumumanAktif, session)
      });
    }

    // 3. Antrean Persetujuan
    if (myApproval.length > 0) {
      items.push({
        id: 'approval-group',
        cat: 'task',
        badge: 'Antrean Persetujuan',
        tone: 'amber',
        iconName: 'alert',
        title: `${myApproval.length} Pengajuan Menunggu Persetujuan`,
        message: `Memerlukan pemeriksaan dan persetujuan dari Anda saat ini.`,
        unread: true,
        link: '#approval'
      });
    }

    // 4. Tugas KPI 360
    if (myKpi.length > 0) {
      items.push({
        id: 'kpi-group',
        cat: 'task',
        badge: 'Tugas Evaluasi KPI',
        tone: 'blue',
        iconName: 'gauge',
        title: `${myKpi.length} Penilaian Rekan Kerja Pending`,
        message: `Silakan selesaikan pengisian formulir evaluasi kinerja tim.`,
        unread: true,
        action: () => openKpiTasksModal(myKpi, session)
      });
    }

    // 5. Warning Kontrak
    if (kontrakHabis.length > 0) {
      items.push({
        id: 'contract-group',
        cat: 'task',
        badge: 'Warning Kontrak',
        tone: 'red',
        iconName: 'doc-plus',
        title: `${kontrakHabis.length} Masa Kontrak Berakhir`,
        message: `Karyawan akan mengakhiri ikatan dinas/kontrak bulan ini.`,
        unread: true,
        link: '#penilaian-kontrak'
      });
    }

    // 6. Tagihan LPJ Saya
    if (myLpjPending.length > 0) {
      items.push({
        id: 'lpj-group',
        cat: 'status',
        badge: 'Tagihan LPJ',
        tone: 'orange',
        iconName: 'clock',
        title: `${myLpjPending.length} Laporan LPJ Pengajuan`,
        message: `Harap melengkapi LPJ pengajuan dana yang telah disetujui.${myLpjOverdue.length > 0 ? ` (${myLpjOverdue.length} terlambat)` : ''}`,
        unread: true,
        link: '#riwayat'
      });
    }

    // 7. LPJ Overdue HRD
    if (orgLpjOverdue.length > 0) {
      items.push({
        id: 'org-lpj-group',
        cat: 'status',
        badge: 'LPJ Terlambat',
        tone: 'red',
        iconName: 'clock',
        title: `${orgLpjOverdue.length} LPJ Karyawan Terlambat`,
        message: `Laporan pertanggungjawaban dana belum diunggah oleh karyawan.`,
        unread: true,
        link: '#riwayat'
      });
    }

    const unreadCount = items.filter(i => i.unread).length;

    let htmlContent = `
      <div class="space-y-3.5 text-left">
        <!-- Header & Counter -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="p-2 bg-maroon-50 text-maroon-700 rounded-xl">
              ${icon("bell", "w-4 h-4")}
            </span>
            <div>
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide">Pemberitahuan & Aktivitas</h4>
              <p class="text-[11px] text-slate-500">Pusat pemantauan status, tugas persetujuan, dan memo perusahaan</p>
            </div>
          </div>
          ${unreadCount > 0 ? `<span class="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-bold">${unreadCount} Aktif / Baru</span>` : ''}
        </div>

        <!-- Filter Tab Buttons -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
          <button data-notif-tab="all" class="notif-tab-btn px-3 py-1.5 rounded-lg font-bold bg-maroon-700 text-white transition">Semua (${items.length})</button>
          <button data-notif-tab="status" class="notif-tab-btn px-3 py-1.5 rounded-lg font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Update Status</button>
          <button data-notif-tab="task" class="notif-tab-btn px-3 py-1.5 rounded-lg font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Tugas & Persetujuan</button>
          <button data-notif-tab="announcement" class="notif-tab-btn px-3 py-1.5 rounded-lg font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Pengumuman</button>
        </div>

        <!-- Unified Feed Stream -->
        <div id="notif-feed-container" class="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          ${renderNotifFeed(items)}
        </div>
      </div>
    `;

    const modalDiv = document.getElementById("app-modal-panel");
    if (modalDiv) {
      const loadingEl = modalDiv.querySelector(".animate-pulse");
      if (loadingEl && loadingEl.parentElement) {
        loadingEl.parentElement.innerHTML = htmlContent;

        // Bind filter tabs
        modalDiv.querySelectorAll(".notif-tab-btn").forEach(btn => {
          btn.onclick = () => {
            modalDiv.querySelectorAll(".notif-tab-btn").forEach(b => {
              b.className = "notif-tab-btn px-3 py-1.5 rounded-lg font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition";
            });
            btn.className = "notif-tab-btn px-3 py-1.5 rounded-lg font-bold bg-maroon-700 text-white transition";

            const cat = btn.dataset.notifTab;
            const filtered = cat === "all" ? items : items.filter(i => i.cat === cat);
            const feedContainer = modalDiv.querySelector("#notif-feed-container");
            if (feedContainer) {
              feedContainer.innerHTML = renderNotifFeed(filtered);
              bindFeedEvents(modalDiv, filtered, session);
            }
          };
        });

        bindFeedEvents(modalDiv, items, session);
      }
    }
  } catch (e) {
    console.error("Gagal memuat notifikasi", e);
  }
}

function renderNotifFeed(items) {
  if (!items.length) {
    return `
      <div class="text-center py-10 text-slate-400 space-y-2">
        <div class="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-300">
          ${icon("bell", "w-6 h-6")}
        </div>
        <p class="text-xs font-semibold text-slate-500">Tidak ada pemberitahuan pada kategori ini.</p>
      </div>
    `;
  }

  return items.map((item, idx) => {
    const toneClasses = {
      indigo: "bg-indigo-50 border-indigo-100 text-indigo-700",
      purple: "bg-purple-50 border-purple-100 text-purple-700",
      amber: "bg-amber-50 border-amber-100 text-amber-700",
      blue: "bg-blue-50 border-blue-100 text-blue-700",
      red: "bg-red-50 border-red-100 text-red-700",
      orange: "bg-orange-50 border-orange-100 text-orange-700"
    };

    const iconBox = `
      <div class="p-2.5 rounded-xl border shrink-0 ${toneClasses[item.tone] || toneClasses.indigo}">
        ${icon(item.iconName || "bell", "w-4 h-4")}
      </div>
    `;

    return `
      <div data-feed-item-idx="${idx}" class="group block p-3 rounded-xl border border-slate-200/80 bg-white hover:border-maroon-300 hover:shadow-sm transition text-xs cursor-pointer">
        <div class="flex items-start gap-3">
          ${iconBox}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${toneClasses[item.tone]}">${escapeHtml(item.badge)}</span>
              ${item.date ? `<span class="text-[10px] text-slate-400 font-medium shrink-0">${item.date}</span>` : ''}
            </div>
            <h5 class="font-bold text-slate-800 text-xs group-hover:text-maroon-700 transition truncate">${escapeHtml(item.title)}</h5>
            <p class="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">${escapeHtml(item.message)}</p>
          </div>
          <span class="text-slate-300 group-hover:text-maroon-700 transition self-center pl-1">
            ${icon("chevron", "w-4 h-4 -rotate-90")}
          </span>
        </div>
      </div>
    `;
  }).join("");
}

function bindFeedEvents(modalDiv, currentList, session) {
  modalDiv.querySelectorAll("[data-feed-item-idx]").forEach(el => {
    el.onclick = async () => {
      const idx = parseInt(el.dataset.feedItemIdx, 10);
      const item = currentList[idx];
      if (!item) return;

      // Mark notification as read if it is a personal notification
      if (item.id && !item.id.includes("-group")) {
        try {
          await fsUpdate(COL.NOTIFICATIONS, item.id, { dibaca: true });
        } catch (e) {
          console.warn("Failed to mark notification read", e);
        }
      }

      closeModal();

      if (typeof item.action === "function") {
        item.action();
      } else if (item.link) {
        const rawLink = String(item.link).trim();
        const targetRoute = rawLink.replace(/^\/+#?|^#+/, "").trim();
        const currentHash = location.hash.replace(/^#/, "").split("?")[0];

        location.hash = "#" + targetRoute;
        if (currentHash === targetRoute) {
          window.dispatchEvent(new Event("hashchange"));
        }
      }
    };
  });
}

/* ---------------------------------------------------------------------
 * POPUP PENGUMUMAN AKTIF & DETAILNYA
 * ------------------------------------------------------------------- */
function openActiveAnnouncementsModal(memos, session) {
  const memosHtml = memos.map((r, idx) => {
    const plainText = String(r.isi || "").replace(/<[^>]+>/g, "").slice(0, 120);
    return `
      <div data-memo-idx="${idx}" class="p-4 rounded-xl border border-slate-100 hover:border-purple-300 hover:bg-purple-50/30 transition cursor-pointer text-left">
        <div class="flex items-start gap-3">
          <div class="w-2.5 h-2.5 rounded-full bg-purple-600 mt-1.5 shrink-0"></div>
          <div class="flex-1">
            <h5 class="text-sm font-semibold text-slate-800">${escapeHtml(r.judul || "Pengumuman")}</h5>
            <p class="text-xs text-slate-500 mt-1 leading-relaxed">${escapeHtml(plainText)}${plainText.length >= 120 ? "..." : ""}</p>
            <div class="flex items-center justify-between mt-3 text-[11px] text-slate-400">
              <span>Oleh: <strong>${escapeHtml(r.dibuat_oleh || "-")}</strong></span>
              <span>${fmtDateShort(r.tanggal)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");

  openModal({
    title: "Pengumuman Aktif",
    size: "md",
    bodyHtml: `
      <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        ${memosHtml}
      </div>`,
    footerHtml: `
      <button id="btn-back-to-notif" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition mr-auto">Kembali</button>
      <button id="btn-close-ann" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Tutup</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-back-to-notif").onclick = () => openNotificationCenter(session);
      m.querySelector("#btn-close-ann").onclick = closeModal;

      m.querySelectorAll("[data-memo-idx]").forEach(el => {
        el.onclick = () => {
          const memo = memos[parseInt(el.dataset.memoIdx)];
          openAnnouncementDetailFromNotif(memo, memos, session);
        };
      });
    }
  });
}

function openAnnouncementDetailFromNotif(memo, memos, session) {
  if (!memo) return;
  const body = `
    <div class="space-y-4 text-left">
      <div class="flex items-center justify-between text-xs text-slate-400 border-b border-slate-100 pb-2">
        <span>Oleh: <strong>${escapeHtml(memo.dibuat_oleh || "-")}</strong></span>
        <span>${fmtDateShort(memo.tanggal)}</span>
      </div>
      <div class="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">${memo.isi || "<i>Tidak ada isi.</i>"}</div>
      ${memo.lampiran_url ? `
        <div class="pt-2">
          <a href="${memo.lampiran_url}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm font-semibold text-purple-700 hover:text-purple-800 hover:underline">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
            Lihat Lampiran File
          </a>
        </div>` : ""}
    </div>
  `;
  openModal({
    title: memo.judul || "Pengumuman",
    size: "lg",
    bodyHtml: body,
    footerHtml: `
      <button id="btn-back-to-memos" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition mr-auto">Kembali ke Daftar</button>
      <button id="btn-close-memo-detail" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Tutup</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-back-to-memos").onclick = () => openActiveAnnouncementsModal(memos, session);
      m.querySelector("#btn-close-memo-detail").onclick = closeModal;
    }
  });
}

/* ---------------------------------------------------------------------
 * POPUP DAFTAR KPI 360 & MODUL APPRAISAL PENILAIAN
 * ------------------------------------------------------------------- */
function openKpiTasksModal(kpis, session) {
  const kpiListHtml = kpis.map((t, idx) => `
    <div data-kpi-idx="${idx}" class="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-blue-300 hover:bg-blue-50/30 transition cursor-pointer bg-white text-left">
      <div class="flex items-center gap-3">
        ${avatar(t.nama_dinilai || "?", "w-10 h-10 text-xs font-bold")}
        <div>
          <h5 class="text-sm font-semibold text-slate-800">Evaluasi ${escapeHtml(t.nama_dinilai || "-")}</h5>
          <p class="text-xs text-slate-400 mt-0.5">Deadline: <span class="text-amber-600 font-medium">${t.deadline ? fmtDateShort(t.deadline) : '-'}</span></p>
        </div>
      </div>
      <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow transition">Nilai</button>
    </div>`).join("");

  openModal({
    title: "Daftar Evaluasi Rekan Kerja (KPI 360)",
    size: "md",
    bodyHtml: `
      <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        ${kpis.length === 0 ? '<p class="text-center text-sm text-slate-400 py-6">Semua tugas penilaian KPI telah diselesaikan.</p>' : kpiListHtml}
      </div>`,
    footerHtml: `
      <button id="btn-back-to-notif-kpi" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition mr-auto">Kembali</button>
      <button id="btn-close-kpi-list" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Tutup</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-back-to-notif-kpi").onclick = () => openNotificationCenter(session);
      m.querySelector("#btn-close-kpi-list").onclick = closeModal;

      m.querySelectorAll("[data-kpi-idx]").forEach(el => {
        el.onclick = () => {
          const task = kpis[parseInt(el.dataset.kpiIdx, 10)];
          openPenilaianFormFromNotif(task, kpis, session);
        };
      });
    }
  });
}

function openPenilaianFormFromNotif(task, kpis, session) {
  const soalHtml = (task.soal_json || []).map((s, i) => `
     <div class="border-b border-slate-100 pb-4 mb-4 text-left">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${escapeHtml(s.aspek)}</span>
          <span class="text-[10px] text-slate-400 font-medium">Bobot: ${s.bobot}%</span>
        </div>
        <p class="text-sm text-slate-800 mb-3">${escapeHtml(s.indikator)}</p>
        <div class="relative">
          <input type="number" data-idx="${i}" data-bobot="${s.bobot}" class="kpi-nilai-input w-full pl-3 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 transition" placeholder="Berikan Skor (0-100)" required min="0" max="100">
          <span class="absolute right-3 top-2.5 text-slate-300 font-medium text-sm">/ 100</span>
        </div>
     </div>
  `).join("");

  const catatanHrdHtml = task.catatan_hrd ? `<div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 text-left"><span class="font-bold block mb-1">Catatan HRD untuk Evaluasi ini:</span>${escapeHtml(task.catatan_hrd)}</div>` : '';

  openModal({
     title: `Evaluasi: ${escapeHtml(task.nama_dinilai)}`, size: "md",
     bodyHtml: `
        <form id="form-isi-kpi" class="text-left">
           <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-left">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <p class="text-xs text-amber-800 leading-relaxed">Dihitung otomatis berdasar bobot. Batas pengumpulan: <strong>${task.deadline ? fmtDateShort(task.deadline) : '-'}</strong>.</p>
           </div>
           ${catatanHrdHtml} ${soalHtml}
           <div class="mt-5 text-left">
              <label class="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Ulasan Karyawan (Opsional)</label>
              <textarea id="kpi-catatan-penilai" rows="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Kelebihan / area peningkatan..."></textarea>
           </div>
        </form>
     `,
     footerHtml: `
        <div class="w-full flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3"><span class="text-sm font-bold text-slate-600">Skor Akhir Sementara:</span><span id="kpi-live-score" class="text-lg font-black text-maroon-700">0.00</span></div>
        <div class="flex gap-2 justify-end w-full">
          <button id="btn-back-to-kpi-list" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition mr-auto">Kembali</button>
          <button id="btn-submit-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition shadow-md">Kirim Penilaian</button>
        </div>
     `,
     onMount: (m) => {
        const liveScore = m.querySelector("#kpi-live-score");
        m.querySelector("#form-isi-kpi").addEventListener("input", () => {
           let calcTotal = 0;
           m.querySelectorAll(".kpi-nilai-input").forEach(input => {
               const bbt = parseFloat(input.dataset.bobot) || 0; const val = parseFloat(input.value) || 0;
               calcTotal += val * (bbt / 100);
           });
           liveScore.textContent = calcTotal.toFixed(2);
        });

        m.querySelector("#btn-back-to-kpi-list").onclick = () => openKpiTasksModal(kpis, session);
        m.querySelector("#btn-submit-kpi").onclick = async () => {
           const form = m.querySelector("#form-isi-kpi");
           if(!form.reportValidity()) return;

           let totalSkorBobot = 0;
           const answeredSoal = [...task.soal_json];
           const catatanPenilai = m.querySelector("#kpi-catatan-penilai").value.trim();

           m.querySelectorAll(".kpi-nilai-input").forEach(input => {
              const idx = parseInt(input.dataset.idx, 10); const nilai = parseFloat(input.value) || 0; const bobot = parseFloat(answeredSoal[idx].bobot) || 0;
              answeredSoal[idx].nilai_diberikan = nilai; totalSkorBobot += (nilai * (bobot / 100));
           });

           let finalScore = Math.round(totalSkorBobot * 100) / 100;
           let keputusan = finalScore >= 80 ? "Sangat Baik" : finalScore >= 60 ? "Baik" : "Kurang";

           const btn = m.querySelector("#btn-submit-kpi");
           btn.disabled = true; btn.textContent = "Merekap Nilai...";

           try {
              // Update database
              await fsUpdate(COL.TUGAS_KPI_360, task.id, { status: "DONE", skor_akhir: finalScore, soal_json: answeredSoal, catatan_penilai: catatanPenilai, tanggal_diselesaikan: new Date().toISOString() });
              await fsAdd(COL.LOG_PENILAIAN_KPI, { tanggal: new Date().toISOString(), nama_dinilai: task.nama_dinilai, penilai: task.nama_penilai, total_skor: finalScore, keputusan: keputusan, periode: task.periode, detail_json: answeredSoal, catatan_penilai: catatanPenilai }, genId("KPI-LOG"));

              toast("Evaluasi diselesaikan!", "success");
              
              // Refresh dashboard widgets if present
              const dashKpiTasks = document.querySelector("#dash-kpi-tasks");
              if (dashKpiTasks) {
                 const itemEl = dashKpiTasks.querySelector(`[data-kpi-id="${task.id}"]`);
                 if (itemEl) itemEl.remove();
                 if (!dashKpiTasks.children.length) {
                    dashKpiTasks.innerHTML = `<div class="text-center p-8 text-slate-400">Tidak ada tugas penilaian tertunda</div>`;
                 }
              }

              // Filter out the completed task from the local kpis list
              const remainingKpis = kpis.filter(x => x.id !== task.id);
              if (remainingKpis.length > 0) {
                 openKpiTasksModal(remainingKpis, session);
              } else {
                 toast("Semua evaluasi rekan kerja telah diselesaikan!", "success");
                 closeModal();
              }
           } catch(e) {
              toast("Gagal menyimpan: " + e.message, "error");
              btn.disabled = false;
              btn.textContent = "Kirim Penilaian";
           }
        };
     }
  });
}
