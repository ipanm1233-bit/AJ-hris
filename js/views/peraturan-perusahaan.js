import {
  PP_META, PP_BABS, PP_ARTICLES,
  PP_COMPLIANCE_SUMMARY, PP_KEY_FINDINGS, PP_COMPARISONS,
  PP_MANAGEMENT_DECISIONS, PP_LEGAL_BASIS, PP_COMPLIANCE_MATRIX,
  disciplinePpArticles, getPpArticle, ppArticleLabel, ppArticleReferences,
  searchPpArticles, ppStats, ppCategories, mergePpCatalog,
  mergePpBabs, isPpBabRow
} from "../peraturan-perusahaan.mjs";
import { icon, badge, emptyState } from "../components.js";
import { hasPermission, canAccessRoute } from "../auth.js";
import { escapeHtml, navigate, toast, openModal, closeModal, confirmDialog, fsGetAll, fsUpdate, fsDelete } from "../utils.js";
import { isoDocHeaderTable } from "../branding.js";
import { COL } from "../firebase-config.js";

const STATUS_TONE = {
  "TIDAK SESUAI": "red",
  "BERISIKO HUKUM": "amber",
  "GAP / BELUM DIATUR": "blue",
  "SESUAI - PERLU PENYEMPURNAAN": "maroon",
  "SESUAI": "green"
};

function statusBadge(status) {
  return badge(status || "-", STATUS_TONE[String(status || "").toUpperCase()] || "slate");
}

function ringkas(text, max = 210) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function articleAyat(article) {
  if (!article?.ayat?.length) return "<p class=\"text-sm text-slate-500\">Teks ayat belum tersedia.</p>";
  return article.ayat.map(p => `<p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(p)}</p>`).join("");
}

function splitList(value, separator = /[,;\n]/) {
  return String(value || "").split(separator).map(item => item.trim()).filter(Boolean);
}

function printShell(title, bodyHtml) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.45; }
  .doc { max-width: 100%; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 2mm; letter-spacing: .3px; }
  h2 { font-size: 11.5pt; margin: 5mm 0 2mm; border-bottom: 1px solid #999; padding-bottom: 1mm; }
  h3 { font-size: 11pt; margin: 4mm 0 1.5mm; }
  p { margin: 0 0 2mm; }
  .muted { color: #555; font-size: 9pt; }
  .note { border: 1px solid #b45309; background: #fffbeb; padding: 2.5mm 3mm; margin: 3mm 0; font-size: 9pt; }
  .article { page-break-inside: avoid; margin-bottom: 4mm; }
  .article-head { display: flex; align-items: baseline; gap: 2mm; }
  .pasal { font-weight: bold; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9pt; }
  th, td { border: 1px solid #777; padding: 1.7mm 2mm; vertical-align: top; text-align: left; }
  th { background: #f1f5f9; }
  ul { margin: 1mm 0 3mm 5mm; padding: 0; }
  li { margin-bottom: 1.4mm; }
  .sign { width: 100%; margin-top: 14mm; page-break-inside: avoid; text-align: center; }
  .sign td { border: none; padding-top: 16mm; }
  @media print { .no-print { display: none; } }
</style></head><body><div class="doc">${bodyHtml}</div></body></html>`;
}

function openPrint(title, bodyHtml) {
  const win = window.open("", "_blank");
  if (!win) {
    toast("Popup diblokir browser. Izinkan popup untuk mencetak.", "warning");
    return;
  }
  win.document.write(printShell(title, bodyHtml));
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch { /* diabaikan */ } }, 350);
}

function printHeader(judul, hal = "1 dari 1") {
  return isoDocHeaderTable({ judul, noDok: "HR-PP", terbitRevisi: `${PP_META.edition}`, hal });
}

function draftNote() {
  return `<div class="note"><b>Catatan status:</b> ${escapeHtml(PP_META.approved_note)}</div>`;
}

export async function mount(container, { session, params } = {}) {
  const panels = {
    katalog: container.querySelector("#pp-panel-katalog"),
    disiplin: container.querySelector("#pp-panel-disiplin"),
    kepatuhan: container.querySelector("#pp-panel-kepatuhan"),
    kelola: container.querySelector("#pp-panel-kelola")
  };
  const state = {
    tab: "katalog",
    query: "",
    bab: "",
    kategori: "",
    disciplineOnly: false,
    matrixQuery: "",
    matrixStatus: "",
    manageQuery: ""
  };

  let catalog = PP_ARTICLES;
  let overrides = [];
  let babs = mergePpBabs([], PP_BABS, PP_ARTICLES);
  let categories = ppCategories(PP_ARTICLES);
  let stats = ppStats(PP_ARTICLES, babs);
  let overrideLoadError = false;

  const canView = await hasPermission("peraturan_perusahaan.view", session);
  const canPrint = await hasPermission("peraturan_perusahaan.print", session);
  const canManage = await hasPermission("peraturan_perusahaan.edit", session);
  const canLinkDiscipline = await hasPermission("peraturan_perusahaan.disiplin", session)
    && await canAccessRoute("pemanggilan", session);

  function applyOverrides(rows) {
    overrides = Array.isArray(rows) ? rows : [];
    babs = mergePpBabs(overrides, PP_BABS);
    catalog = mergePpCatalog(overrides, PP_ARTICLES, babs);
    babs = mergePpBabs(overrides, PP_BABS, catalog);
    categories = ppCategories(catalog);
    stats = ppStats(catalog, babs);
  }

  async function loadOverrides() {
    try {
      const rows = await fsGetAll(COL.PERATURAN_PERUSAHAAN);
      overrideLoadError = false;
      return rows;
    } catch (error) {
      overrideLoadError = true;
      console.warn("Gagal memuat perubahan katalog Peraturan Perusahaan:", error);
      return [];
    }
  }

  applyOverrides(await loadOverrides());

  function overrideMap() {
    const map = new Map();
    overrides.forEach(row => {
      if (isPpBabRow(row)) return;
      const pasal = Number(row?.pasal || 0);
      if (pasal) map.set(pasal, row);
    });
    return map;
  }

  function isBuiltin(pasal) {
    return PP_ARTICLES.some(article => article.pasal === Number(pasal));
  }

  function articleFor(pasal) {
    return getPpArticle(pasal, catalog);
  }

  function nextPasalNumber() {
    const highest = Math.max(
      0,
      ...PP_ARTICLES.map(article => article.pasal),
      ...catalog.map(article => article.pasal)
    );
    return highest + 1;
  }

  function nextBabNumber() {
    const highest = Math.max(0, ...babs.map(bab => Number(bab.nomor) || 0), PP_BABS.length);
    return highest + 1;
  }

  function babFor(nomor) {
    return babs.find(bab => Number(bab.nomor) === Number(nomor)) || null;
  }

  function goToDiscipline(pasal) {
    if (!canLinkDiscipline) {
      toast("Anda tidak memiliki akses membuat SP. Hubungi HRD.", "warning");
      return;
    }
    navigate("pemanggilan", { pp: String(pasal) });
  }

  function filteredArticles() {
    return searchPpArticles({
      query: state.query,
      kategori: state.kategori,
      bab: state.bab,
      disciplineOnly: state.disciplineOnly,
      articles: catalog
    });
  }

  async function refreshCatalog({ rerenderKatalog = true } = {}) {
    applyOverrides(await loadOverrides());
    delete panels.disiplin.dataset.rendered;
    delete panels.kepatuhan.dataset.rendered;
    delete panels.kelola.dataset.rendered;
    if (rerenderKatalog) renderKatalog();
    if (state.tab === "disiplin") renderDisiplin();
    if (state.tab === "kepatuhan") renderKepatuhan();
    if (state.tab === "kelola") renderKelola();
  }

  function articleCard(article) {
    const disiplinBadge = article.disiplin ? badge("Terkait Disiplin", "red") : "";
    const catatanBadge = article.catatan ? badge("Catatan", "amber") : "";
    const perubahanBadge = article.perubahan ? badge("Diperbarui", "green") : "";
    const customBadge = article.is_custom ? badge("Pasal Tambahan", "blue") : "";
    return `
      <article class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-maroon-200 transition flex flex-col">
        <div class="flex items-start justify-between gap-2 mb-2">
          <span class="text-[10px] font-black uppercase tracking-wider text-maroon-700 bg-maroon-50 px-2 py-1 rounded-lg">Pasal ${article.pasal}</span>
          <span class="text-[10px] font-medium text-slate-500 text-right">${escapeHtml(article.kategori)}</span>
        </div>
        <h3 class="font-bold text-slate-800 text-sm leading-snug">${escapeHtml(article.judul)}</h3>
        <p class="text-xs text-slate-500 mt-2 leading-relaxed flex-1">${escapeHtml(ringkas(article.ringkasan))}</p>
        <div class="flex flex-wrap gap-1.5 mt-3">${customBadge}${disiplinBadge}${perubahanBadge}${catatanBadge}</div>
        <div class="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <button data-pp-open="${article.pasal}" class="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition">Lihat Detail</button>
          ${article.disiplin ? `<button data-pp-sp="${article.pasal}" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-maroon-700 text-white hover:bg-maroon-800 transition">Buat SP</button>` : ""}
        </div>
      </article>`;
  }

  function renderKatalog() {
    if (!canView) {
      panels.katalog.innerHTML = emptyState("Akses Peraturan Perusahaan belum diberikan", "Hubungi HRD atau Superadmin untuk mendapatkan izin peraturan_perusahaan.view.");
      return;
    }
    panels.katalog.innerHTML = `
      <div class="space-y-5">
        <div class="bg-white border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">${icon("alert", "w-5 h-5")}</div>
          <div class="flex-1">
            <p class="text-sm font-bold text-slate-800">${escapeHtml(PP_META.title)} — ${escapeHtml(PP_META.edition)}</p>
            <p class="text-xs text-slate-600 mt-1 leading-relaxed">${escapeHtml(PP_META.approved_note)}</p>
            <p class="text-[10px] text-slate-400 mt-2">Sumber: ${escapeHtml(PP_META.source)} · Unit: ${escapeHtml(PP_META.unit)}</p>
          </div>
          ${canPrint ? `<button id="pp-print-catalog" class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition">${icon("printer", "w-4 h-4")} Cetak Katalog</button>` : ""}
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="bg-white border border-slate-200 rounded-2xl p-4">
            <p class="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Pasal</p>
            <p class="text-2xl font-black text-slate-800 mt-1">${stats.total}</p>
            <p class="text-[11px] text-slate-500">${stats.bab} bab</p>
          </div>
          <div class="bg-white border border-slate-200 rounded-2xl p-4">
            <p class="text-[10px] uppercase tracking-wider font-bold text-slate-400">Terkait Disiplin</p>
            <p class="text-2xl font-black text-red-700 mt-1">${stats.disiplin}</p>
            <p class="text-[11px] text-slate-500">pasal dapat dijadikan rujukan SP</p>
          </div>
          <div class="bg-white border border-slate-200 rounded-2xl p-4">
            <p class="text-[10px] uppercase tracking-wider font-bold text-slate-400">Butir Diperbarui</p>
            <p class="text-2xl font-black text-emerald-700 mt-1">${stats.totalPerubahan}</p>
            <p class="text-[11px] text-slate-500">perubahan kunci dari draf 2026</p>
          </div>
          <div class="bg-white border border-slate-200 rounded-2xl p-4">
            <p class="text-[10px] uppercase tracking-wider font-bold text-slate-400">Perlu Catatan</p>
            <p class="text-2xl font-black text-amber-700 mt-1">${stats.denganCatatan}</p>
            <p class="text-[11px] text-slate-500">butir keputusan / verifikasi</p>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            <div class="md:col-span-5">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Cari pasal / kata kunci</label>
              <input id="pp-search" value="${escapeHtml(state.query)}" placeholder="Contoh: cuti, lembur, SP, pesangon..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none">
            </div>
            <div class="md:col-span-3">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bab</label>
              <select id="pp-bab" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
                <option value="">Semua bab</option>
                ${babs.map(b => `<option value="${b.nomor}" ${String(state.bab) === String(b.nomor) ? "selected" : ""}>BAB ${b.nomor} — ${escapeHtml(b.judul)}</option>`).join("")}
              </select>
            </div>
            <div class="md:col-span-3">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Kategori</label>
              <select id="pp-kategori" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
                <option value="">Semua kategori</option>
                ${categories.map(k => `<option value="${escapeHtml(k)}" ${state.kategori === k ? "selected" : ""}>${escapeHtml(k)}</option>`).join("")}
              </select>
            </div>
            <div class="md:col-span-1 flex items-end">
              <label class="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap" title="Hanya pasal terkait disiplin">
                <input id="pp-discipline" type="checkbox" ${state.disciplineOnly ? "checked" : ""} class="rounded border-slate-300 text-maroon-700"> Disiplin
              </label>
            </div>
          </div>
          <div class="flex items-center justify-between mt-3">
            <p id="pp-result-count" class="text-xs text-slate-500"></p>
            <button id="pp-reset" class="text-xs font-semibold text-slate-500 hover:text-maroon-700">Reset filter</button>
          </div>
        </div>

        <div id="pp-results"></div>
      </div>`;

    const search = panels.katalog.querySelector("#pp-search");
    const bab = panels.katalog.querySelector("#pp-bab");
    const kategori = panels.katalog.querySelector("#pp-kategori");
    const discipline = panels.katalog.querySelector("#pp-discipline");
    const reset = panels.katalog.querySelector("#pp-reset");
    const printBtn = panels.katalog.querySelector("#pp-print-catalog");

    function renderResults() {
      const list = filteredArticles();
      const count = panels.katalog.querySelector("#pp-result-count");
      const target = panels.katalog.querySelector("#pp-results");
      if (count) count.textContent = `${list.length} pasal ditemukan`;
      if (!target) return;
      if (!list.length) {
        target.innerHTML = emptyState("Tidak ada pasal yang cocok", "Ubah kata kunci atau reset filter.");
        return;
      }
      const groupBabs = [...babs];
      catalog.forEach(article => {
        if (!groupBabs.some(bab => Number(bab.nomor) === Number(article.bab))) {
          groupBabs.push({
            nomor: Number(article.bab),
            judul: article.bab_judul || `Bab ${article.bab}`,
            kategori: article.kategori || "",
            is_custom: true
          });
        }
      });
      const groups = groupBabs
        .sort((a, b) => Number(a.nomor) - Number(b.nomor))
        .map(b => ({ ...b, items: list.filter(a => a.bab === b.nomor) }))
        .filter(g => g.items.length);
      target.innerHTML = groups.map(group => `
        <section class="mb-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-400">BAB ${group.nomor}</span>
            <h2 class="text-sm font-bold text-slate-700">${escapeHtml(group.judul)}</h2>
            <span class="text-[10px] text-slate-400">${group.items.length} pasal</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            ${group.items.map(articleCard).join("")}
          </div>
        </section>`).join("");

      target.querySelectorAll("[data-pp-open]").forEach(btn => {
        btn.addEventListener("click", () => openArticle(Number(btn.dataset.ppOpen)));
      });
      target.querySelectorAll("[data-pp-sp]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          goToDiscipline(Number(btn.dataset.ppSp));
        });
      });
    }

    search?.addEventListener("input", () => { state.query = search.value; renderResults(); });
    bab?.addEventListener("change", () => { state.bab = bab.value; renderResults(); });
    kategori?.addEventListener("change", () => { state.kategori = kategori.value; renderResults(); });
    discipline?.addEventListener("change", () => { state.disciplineOnly = discipline.checked; renderResults(); });
    reset?.addEventListener("click", () => {
      state.query = ""; state.bab = ""; state.kategori = ""; state.disciplineOnly = false;
      if (search) search.value = "";
      if (bab) bab.value = "";
      if (kategori) kategori.value = "";
      if (discipline) discipline.checked = false;
      renderResults();
    });
    printBtn?.addEventListener("click", () => printCatalog(filteredArticles()));
    renderResults();
  }

  function openArticle(pasal) {
    const article = articleFor(pasal);
    if (!article) return;
    const refs = ppArticleReferences(article, catalog);
    const disiplin = article.disiplin;
    const body = `
      <div class="space-y-4 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-black uppercase tracking-wider text-maroon-700 bg-maroon-50 px-2.5 py-1 rounded-lg">Pasal ${article.pasal}</span>
          ${badge(`BAB ${article.bab} — ${article.bab_judul}`, "slate")}
          ${badge(article.kategori, "blue")}
          ${article.is_custom ? badge("Pasal Tambahan", "blue") : ""}
          ${disiplin ? badge("Terkait Disiplin", "red") : ""}
        </div>
        <div>
          <h3 class="text-lg font-bold text-slate-800">${escapeHtml(article.judul)}</h3>
          <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(PP_META.title)} · ${escapeHtml(PP_META.edition)}</p>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">${articleAyat(article)}</div>
        ${article.perubahan ? `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3"><p class="text-[10px] font-black uppercase tracking-wider text-emerald-700 mb-1">Perubahan kunci</p><p class="text-xs text-emerald-900 leading-relaxed">${escapeHtml(article.perubahan)}</p></div>` : ""}
        ${article.catatan ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3"><p class="text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1">Catatan / butir keputusan</p><p class="text-xs text-amber-900 leading-relaxed">${escapeHtml(article.catatan)}</p></div>` : ""}
        ${disiplin ? `<div class="bg-red-50 border border-red-200 rounded-xl p-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-red-700 mb-1">Kaitan Disiplin & SP</p>
          <p class="text-xs text-red-900 leading-relaxed"><b>${escapeHtml(disiplin.tingkat)}</b> · ${escapeHtml(disiplin.jenis.join(", "))}</p>
          <p class="text-xs text-red-800 mt-1 leading-relaxed">${escapeHtml(disiplin.catatan)}</p>
          <p class="text-[10px] text-red-700/80 mt-2">Rujukan pasal tidak menentukan sanksi otomatis. Keputusan SP tetap memerlukan bukti, klarifikasi, dan pemeriksaan aturan yang berlaku.</p>
        </div>` : ""}
        ${article.dasar_hukum.length ? `<div><p class="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Dasar hukum</p><div class="flex flex-wrap gap-1.5">${article.dasar_hukum.map(x => badge(x, "slate")).join("")}</div></div>` : ""}
        ${refs.length ? `<div><p class="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Pasal terkait</p><div class="flex flex-wrap gap-1.5">${refs.map(r => `<button data-pp-ref="${r.pasal}" class="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-maroon-100 hover:text-maroon-800 transition">${escapeHtml(r.label)}</button>`).join("")}</div></div>` : ""}
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p class="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Status dokumen</p>
          <p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(PP_META.status)}. ${escapeHtml(PP_META.approved_note)}</p>
        </div>
      </div>`;
    openModal({
      title: `Pasal ${article.pasal} — ${article.judul}`,
      size: "lg",
      bodyHtml: body,
      footerHtml: `
        <button id="pp-detail-close" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>
        ${canManage ? `<button id="pp-detail-edit" class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition">Edit Pasal</button>` : ""}
        ${canPrint ? `<button id="pp-detail-print" class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition">Cetak Pasal</button>` : ""}
        ${disiplin && canLinkDiscipline ? `<button id="pp-detail-sp" class="px-4 py-2 rounded-lg text-sm font-semibold bg-maroon-700 text-white hover:bg-maroon-800 transition">Buat SP / Tindak Lanjut</button>` : ""}`,
      onMount: (modal) => {
        modal.querySelector("#pp-detail-close")?.addEventListener("click", closeModal);
        modal.querySelector("#pp-detail-print")?.addEventListener("click", () => printArticle(article));
        modal.querySelector("#pp-detail-edit")?.addEventListener("click", () => { closeModal(); openEditor(article.pasal); });
        modal.querySelector("#pp-detail-sp")?.addEventListener("click", () => { closeModal(); goToDiscipline(article.pasal); });
        modal.querySelectorAll("[data-pp-ref]").forEach(btn => {
          btn.addEventListener("click", () => { closeModal(); openArticle(Number(btn.dataset.ppRef)); });
        });
      }
    });
  }

  function printArticle(article) {
    const body = `
      ${printHeader(`PASAL ${article.pasal} — ${article.judul.toUpperCase()}`)}
      ${draftNote()}
      <p class="muted">${escapeHtml(PP_META.title)} · ${escapeHtml(PP_META.edition)} · ${escapeHtml(PP_META.unit)}</p>
      <h2>Pasal ${article.pasal} — ${escapeHtml(article.judul)}</h2>
      ${article.ayat.map(p => `<p>${escapeHtml(p)}</p>`).join("")}
      ${article.perubahan ? `<h3>Perubahan kunci</h3><p>${escapeHtml(article.perubahan)}</p>` : ""}
      ${article.catatan ? `<h3>Catatan</h3><p>${escapeHtml(article.catatan)}</p>` : ""}
      ${article.disiplin ? `<h3>Kaitan Disiplin & SP</h3><p><b>${escapeHtml(article.disiplin.tingkat)}</b> — ${escapeHtml(article.disiplin.jenis.join(", "))}. ${escapeHtml(article.disiplin.catatan)}</p>` : ""}
      ${article.dasar_hukum.length ? `<h3>Dasar hukum</h3><ul>${article.dasar_hukum.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}
      <table class="sign"><tr><td>Mengetahui,<br>HRD Manager</td><td>Disahkan,<br>Pengurus Perusahaan</td></tr><tr><td>( ............................ )</td><td>( ............................ )</td></tr></table>`;
    openPrint(`Pasal ${article.pasal} — ${article.judul}`, body);
  }

  function printCatalog(list) {
    const body = `
      ${printHeader("KATALOG PERATURAN PERUSAHAAN", "1 dari 1")}
      ${draftNote()}
      <p class="muted">${escapeHtml(PP_META.title)} · ${escapeHtml(PP_META.edition)} · ${escapeHtml(PP_META.unit)}</p>
      <p class="muted">Filter: ${state.query ? `kata kunci "${escapeHtml(state.query)}"` : "semua pasal"}${state.kategori ? ` · kategori ${escapeHtml(state.kategori)}` : ""}${state.bab ? ` · BAB ${escapeHtml(state.bab)}` : ""}${state.disciplineOnly ? " · hanya terkait disiplin" : ""}</p>
      ${list.map(article => `
        <div class="article">
          <div class="article-head"><span class="pasal">Pasal ${article.pasal}</span><b>— ${escapeHtml(article.judul)}</b></div>
          <p class="muted">BAB ${article.bab} — ${escapeHtml(article.bab_judul)} · ${escapeHtml(article.kategori)}</p>
          ${article.ayat.map(p => `<p>${escapeHtml(p)}</p>`).join("")}
          ${article.disiplin ? `<p><i>Kaitan disiplin: ${escapeHtml(article.disiplin.tingkat)} — ${escapeHtml(article.disiplin.jenis.join(", "))}</i></p>` : ""}
          ${article.dasar_hukum.length ? `<p class="muted">Dasar hukum: ${escapeHtml(article.dasar_hukum.join("; "))}</p>` : ""}
        </div>`).join("")}`;
    openPrint("Katalog Peraturan Perusahaan", body);
  }

  function renderDisiplin() {
    if (!canView) {
      panels.disiplin.innerHTML = emptyState("Akses belum diberikan", "Hubungi HRD atau Superadmin.");
      return;
    }
    const items = disciplinePpArticles(catalog);
    const ladder = [43, 44, 49, 53, 54, 70].map(pasal => getPpArticle(pasal, catalog)).filter(Boolean);
    panels.disiplin.innerHTML = `
      <div class="space-y-5">
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">${icon("alert", "w-5 h-5")}</div>
            <div>
              <p class="text-sm font-bold text-red-900">Sanksi harus proporsional, berbasis bukti, dan melalui prosedur</p>
              <p class="text-xs text-red-800 mt-1 leading-relaxed">Pasal rujukan bukan dasar sanksi otomatis. HR wajib mencatat bukti, memberikan kesempatan klarifikasi, memeriksa PP/SOP yang berlaku, dan mempertimbangkan riwayat serta dampak pelanggaran.</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          ${ladder.map((a, i) => `
            <button data-pp-open="${a.pasal}" class="text-left bg-white border border-slate-200 rounded-2xl p-3.5 hover:border-red-300 hover:shadow-md transition">
              <span class="w-7 h-7 rounded-full bg-red-50 text-red-700 text-xs font-black flex items-center justify-center mb-2">${i + 1}</span>
              <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Pasal ${a.pasal}</p>
              <p class="text-xs font-bold text-slate-800 mt-1 leading-snug">${escapeHtml(a.judul)}</p>
              <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(a.disiplin?.tingkat || "")}</p>
            </button>`).join("")}
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 class="text-sm font-bold text-slate-800">Pasal yang dapat dijadikan rujukan disiplin</h2>
              <p class="text-xs text-slate-500 mt-0.5">${items.length} pasal · klik “Buat SP” untuk membuka formulir SP dengan pasal terisi.</p>
            </div>
            <button id="pp-open-sp" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-maroon-700 text-white hover:bg-maroon-800 transition">${icon("alert", "w-4 h-4")} Buka Disiplin & SP</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="text-left px-4 py-2.5 font-bold">Pasal</th>
                  <th class="text-left px-4 py-2.5 font-bold">Tingkat</th>
                  <th class="text-left px-4 py-2.5 font-bold">Jenis pelanggaran</th>
                  <th class="text-left px-4 py-2.5 font-bold">Catatan</th>
                  <th class="text-right px-4 py-2.5 font-bold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(a => `
                  <tr class="border-t border-slate-100 align-top">
                    <td class="px-4 py-3">
                      <button data-pp-open="${a.pasal}" class="text-left font-bold text-maroon-700 hover:underline">Pasal ${a.pasal}</button>
                      <p class="text-xs text-slate-600 mt-0.5">${escapeHtml(a.judul)}</p>
                    </td>
                    <td class="px-4 py-3"><span class="text-xs font-semibold text-slate-700">${escapeHtml(a.disiplin.tingkat)}</span></td>
                    <td class="px-4 py-3 text-xs text-slate-600">${a.disiplin.jenis.map(j => badge(j, "slate")).join(" ")}</td>
                    <td class="px-4 py-3 text-xs text-slate-500 max-w-md">${escapeHtml(a.disiplin.catatan)}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      ${canLinkDiscipline ? `<button data-pp-sp="${a.pasal}" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-maroon-700 text-white hover:bg-maroon-800 transition">Buat SP</button>` : `<span class="text-[11px] text-slate-400">Tidak ada akses</span>`}
                    </td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <h2 class="text-sm font-bold text-slate-800 mb-2">Alur tindak lanjut yang disarankan</h2>
          <ol class="text-xs text-slate-600 space-y-2 list-decimal ml-5">
            <li>Catat fakta, tanggal, saksi, dan bukti pendukung.</li>
            <li>Beri kesempatan karyawan menjelaskan (klarifikasi) dan catat dalam berita acara.</li>
            <li>Tentukan pasal PP/SOP yang relevan serta tingkat sanksi secara proporsional.</li>
            <li>Terbitkan pemanggilan/SP melalui menu <b>Disiplin &amp; SP</b>; simpan bukti pengiriman.</li>
            <li>Lakukan coaching/follow-up dan evaluasi; tutup kasus setelah perbaikan tercatat.</li>
          </ol>
        </div>
      </div>`;

    panels.disiplin.querySelector("#pp-open-sp")?.addEventListener("click", () => navigate("pemanggilan"));
    panels.disiplin.querySelectorAll("[data-pp-open]").forEach(btn => {
      btn.addEventListener("click", () => openArticle(Number(btn.dataset.ppOpen)));
    });
    panels.disiplin.querySelectorAll("[data-pp-sp]").forEach(btn => {
      btn.addEventListener("click", () => goToDiscipline(Number(btn.dataset.ppSp)));
    });
  }

  function renderKepatuhan() {
    if (!canView) {
      panels.kepatuhan.innerHTML = emptyState("Akses belum diberikan", "Hubungi HRD atau Superadmin.");
      return;
    }
    panels.kepatuhan.innerHTML = `
      <div class="space-y-5">
        <div class="bg-slate-900 text-white rounded-2xl p-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-white/50">Hasil analisis</p>
          <h2 class="text-lg font-bold mt-1">Matriks Kepatuhan PP 2024–2026</h2>
          <p class="text-xs text-white/60 mt-1">Penilaian 76 butir terhadap peraturan ketenagakerjaan. Tab ini adalah bahan perbaikan, bukan pengganti naskah PP yang sudah disahkan.</p>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
          ${PP_COMPLIANCE_SUMMARY.filter(r => r.status !== "TOTAL").map(row => `
            <div class="bg-white border border-slate-200 rounded-2xl p-3.5">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-tight">${escapeHtml(row.status)}</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <p class="text-2xl font-black text-slate-800">${row.jumlah}</p>
                <span class="text-[11px] text-slate-400">${row.persen}%</span>
              </div>
              <p class="text-[10px] text-slate-500 mt-1 leading-snug">${escapeHtml(row.tindak_lanjut)}</p>
            </div>`).join("")}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white border border-slate-200 rounded-2xl p-4">
            <h2 class="text-sm font-bold text-slate-800 mb-2">Temuan utama</h2>
            <ul class="space-y-2 text-xs text-slate-600">
              ${PP_KEY_FINDINGS.map(x => `<li class="flex gap-2"><span class="text-red-500 font-black shrink-0">•</span><span>${escapeHtml(x)}</span></li>`).join("")}
            </ul>
          </div>
          <div class="bg-white border border-slate-200 rounded-2xl p-4">
            <h2 class="text-sm font-bold text-slate-800 mb-2">Butir keputusan manajemen</h2>
            <div class="space-y-2">
              ${PP_MANAGEMENT_DECISIONS.map(d => `
                <details class="border border-slate-200 rounded-xl p-2.5">
                  <summary class="text-xs font-semibold text-slate-700 cursor-pointer">${d.no}. ${escapeHtml(d.butir)}</summary>
                  <p class="text-[11px] text-slate-600 mt-2"><b>Usulan:</b> ${escapeHtml(d.usulan)}</p>
                  <p class="text-[11px] text-amber-700 mt-1"><b>Konsekuensi:</b> ${escapeHtml(d.konsekuensi)}</p>
                </details>`).join("")}
            </div>
          </div>
        </div>

        <details class="bg-white border border-slate-200 rounded-2xl p-4">
          <summary class="text-sm font-bold text-slate-800 cursor-pointer">Perbandingan klausul kunci (${PP_COMPARISONS.length} aspek)</summary>
          <div class="overflow-x-auto mt-3">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                <tr><th class="text-left p-2.5">Aspek</th><th class="text-left p-2.5">PP 2024–2026</th><th class="text-left p-2.5">Sesuai hukum</th><th class="text-left p-2.5">Dasar hukum</th></tr>
              </thead>
              <tbody>
                ${PP_COMPARISONS.map(r => `<tr class="border-t border-slate-100 align-top">
                  <td class="p-2.5 font-semibold text-slate-700">${escapeHtml(r.aspek)}</td>
                  <td class="p-2.5 text-slate-600">${escapeHtml(r.lama)}</td>
                  <td class="p-2.5 text-slate-600">${escapeHtml(r.seharusnya)}</td>
                  <td class="p-2.5 text-slate-500">${escapeHtml(r.dasar_hukum)}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </details>

        <details class="bg-white border border-slate-200 rounded-2xl p-4">
          <summary class="text-sm font-bold text-slate-800 cursor-pointer">Dasar hukum yang dirujuk (${PP_LEGAL_BASIS.length})</summary>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            ${PP_LEGAL_BASIS.map(r => `<div class="border border-slate-100 rounded-xl p-2.5"><p class="text-xs font-semibold text-slate-700">${escapeHtml(r.peraturan)}</p><p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(r.pokok)}</p></div>`).join("")}
          </div>
        </details>

        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="p-4 border-b border-slate-100">
            <div class="flex flex-col md:flex-row md:items-end gap-2.5">
              <div class="flex-1">
                <h2 class="text-sm font-bold text-slate-800">Matriks kepatuhan per butir</h2>
                <p class="text-xs text-slate-500 mt-0.5">${PP_COMPLIANCE_MATRIX.length} butir penilaian PP 2024–2026.</p>
              </div>
              <div class="w-full md:w-56">
                <input id="pp-matrix-search" value="${escapeHtml(state.matrixQuery)}" placeholder="Cari pasal / kata kunci..." class="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 outline-none">
              </div>
              <div class="w-full md:w-56">
                <select id="pp-matrix-status" class="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 outline-none">
                  <option value="">Semua status</option>
                  ${[...new Set(PP_COMPLIANCE_MATRIX.map(r => r.status))].map(s => `<option value="${escapeHtml(s)}" ${state.matrixStatus === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
                </select>
              </div>
            </div>
          </div>
          <div id="pp-matrix-results" class="overflow-x-auto"></div>
        </div>
      </div>`;

    const matrixSearch = panels.kepatuhan.querySelector("#pp-matrix-search");
    const matrixStatus = panels.kepatuhan.querySelector("#pp-matrix-status");

    function renderMatrix() {
      const term = state.matrixQuery.trim().toLowerCase();
      const list = PP_COMPLIANCE_MATRIX.filter(row => {
        if (state.matrixStatus && row.status !== state.matrixStatus) return false;
        if (!term) return true;
        return [row.pasal, row.judul, row.klausul, row.status, row.dasar_hukum, row.risiko, row.rekomendasi]
          .join(" ").toLowerCase().includes(term);
      });
      const target = panels.kepatuhan.querySelector("#pp-matrix-results");
      if (!target) return;
      if (!list.length) {
        target.innerHTML = `<div class="p-4">${emptyState("Tidak ada butir yang cocok", "Ubah pencarian atau status.")}</div>`;
        return;
      }
      target.innerHTML = `
        <table class="w-full text-xs">
          <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0">
            <tr>
              <th class="text-left p-2.5">No</th>
              <th class="text-left p-2.5">Pasal</th>
              <th class="text-left p-2.5">Status</th>
              <th class="text-left p-2.5">Risiko / ketidaksesuaian</th>
              <th class="text-left p-2.5">Rekomendasi</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(row => `
              <tr class="border-t border-slate-100 align-top">
                <td class="p-2.5 text-slate-400">${row.no}</td>
                <td class="p-2.5">
                  <p class="font-semibold text-slate-700">${escapeHtml(row.pasal)}</p>
                  <p class="text-[11px] text-slate-500">${escapeHtml(row.judul)}</p>
                  <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(row.dasar_hukum)}</p>
                </td>
                <td class="p-2.5">${statusBadge(row.status)}</td>
                <td class="p-2.5 text-slate-600 max-w-sm">${escapeHtml(row.risiko)}</td>
                <td class="p-2.5 text-slate-600 max-w-sm">${escapeHtml(row.rekomendasi)}</td>
              </tr>`).join("")}
          </tbody>
        </table>`;
    }

    matrixSearch?.addEventListener("input", () => { state.matrixQuery = matrixSearch.value; renderMatrix(); });
    matrixStatus?.addEventListener("change", () => { state.matrixStatus = matrixStatus.value; renderMatrix(); });
    renderMatrix();
  }

  /* -------------------------------------------------------------------
   * KELOLA KATALOG (SUPERADMIN / PEMEGANG IZIN MANAGE)
   * ----------------------------------------------------------------- */
  function renderKelola() {
    if (!canManage) {
      panels.kelola.innerHTML = emptyState("Akses kelola katalog belum diberikan", "Hanya Superadmin atau pengguna dengan izin peraturan_perusahaan.edit yang dapat mengubah pasal.");
      return;
    }
    const map = overrideMap();
    const hidden = PP_ARTICLES.filter(article => {
      const row = map.get(article.pasal);
      return !!(row && row.deleted);
    });
    const customCount = catalog.filter(article => article.is_custom).length;
    const editedCount = overrides.filter(row => row && !isPpBabRow(row) && !row.deleted && isBuiltin(Number(row.pasal))).length;
    const term = state.manageQuery.trim().toLowerCase();
    const list = catalog.filter(article => {
      if (!term) return true;
      return [article.pasal, article.judul, article.kategori, article.bab_judul, article.ayat.join(" ")]
        .join(" ").toLowerCase().includes(term);
    });

    const sourceBadge = (article) => {
      if (article.is_custom) return badge("Pasal Tambahan", "blue");
      if (map.get(article.pasal) && !map.get(article.pasal).deleted) return badge("Diedit", "green");
      return badge("Bawaan", "slate");
    };

    panels.kelola.innerHTML = `
      <div class="space-y-5">
        <div class="bg-slate-900 text-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-white/50">Khusus Superadmin</p>
            <h2 class="text-lg font-bold mt-1">Kelola Katalog Peraturan Perusahaan</h2>
            <p class="text-xs text-white/60 mt-1">Tambah bab dan pasal baru, edit pasal bawaan, atau sembunyikan pasal. Perubahan disimpan di Firestore dan langsung dipakai katalog, Disiplin & SP, serta cetak.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <button id="pp-manage-add-bab" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition">${icon("plus", "w-4 h-4")} Tambah Bab</button>
            <button id="pp-manage-add" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white text-slate-900 hover:bg-slate-100 transition">${icon("plus", "w-4 h-4")} Tambah Pasal</button>
            <button id="pp-manage-refresh" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition">${icon("refresh", "w-4 h-4")} Muat Ulang</button>
          </div>
        </div>

        ${overrideLoadError ? `<div class="bg-red-50 border border-red-200 rounded-2xl p-3 text-xs text-red-800">Perubahan katalog gagal dimuat dari Firestore. Periksa koneksi, status akun, dan rules koleksi <b>peraturan_perusahaan</b>. Katalog bawaan tetap dapat dibaca.</div>` : ""}

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="bg-white border border-slate-200 rounded-2xl p-4"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pasal Aktif</p><p class="text-2xl font-black text-slate-800 mt-1">${catalog.length}</p></div>
          <div class="bg-white border border-slate-200 rounded-2xl p-4"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pasal Tambahan</p><p class="text-2xl font-black text-blue-700 mt-1">${customCount}</p></div>
          <div class="bg-white border border-slate-200 rounded-2xl p-4"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pasal Diedit</p><p class="text-2xl font-black text-emerald-700 mt-1">${editedCount}</p></div>
          <div class="bg-white border border-slate-200 rounded-2xl p-4"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Disembunyikan</p><p class="text-2xl font-black text-amber-700 mt-1">${hidden.length}</p></div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h3 class="text-sm font-bold text-slate-800">Struktur Bab</h3>
              <p class="text-xs text-slate-500 mt-0.5">${babs.length} bab aktif. Bab tambahan dapat dipakai saat menambah atau mengedit pasal.</p>
            </div>
            <button id="pp-manage-add-bab-inline" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">${icon("plus", "w-3.5 h-3.5")} Tambah Bab</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            ${babs.map(bab => `
              <div class="flex items-center justify-between gap-2 border border-slate-100 rounded-xl p-2.5">
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[10px] font-black uppercase tracking-wider text-slate-400">BAB ${bab.nomor}</span>
                    <p class="text-xs font-semibold text-slate-700 truncate">${escapeHtml(bab.judul)}</p>
                    ${bab.is_custom ? badge("Bab Tambahan", "blue") : ""}
                  </div>
                  <p class="text-[11px] text-slate-400">${escapeHtml(bab.kategori || "Tanpa kategori")} &middot; ${Number(bab.jumlah_pasal || 0)} pasal</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button data-pp-manage-bab-edit="${bab.nomor}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">Edit</button>
                  ${bab.is_custom ? `<button data-pp-manage-bab-delete="${bab.nomor}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition">Hapus</button>` : ""}
                </div>
              </div>`).join("")}
          </div>
          <p class="text-[11px] text-slate-400 mt-2">Bab tambahan hanya bisa dihapus setelah tidak memiliki pasal. Bab bawaan dapat diganti judul/kategorinya, tetapi tidak dihapus.</p>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="flex flex-col md:flex-row md:items-end gap-2.5">
            <div class="flex-1">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Cari pasal</label>
              <input id="pp-manage-search" value="${escapeHtml(state.manageQuery)}" placeholder="Cari nomor, judul, atau isi ayat..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
            </div>
            <p class="text-xs text-slate-500">${list.length} pasal ditampilkan</p>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="text-left px-4 py-2.5 font-bold">Pasal</th>
                  <th class="text-left px-4 py-2.5 font-bold">Judul</th>
                  <th class="text-left px-4 py-2.5 font-bold">Bab</th>
                  <th class="text-left px-4 py-2.5 font-bold">Sumber</th>
                  <th class="text-right px-4 py-2.5 font-bold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${list.length ? list.map(article => `
                  <tr class="border-t border-slate-100 align-top">
                    <td class="px-4 py-3 font-bold text-maroon-700 whitespace-nowrap">Pasal ${article.pasal}</td>
                    <td class="px-4 py-3">
                      <p class="font-semibold text-slate-800">${escapeHtml(article.judul)}</p>
                      <p class="text-[11px] text-slate-400">${escapeHtml(article.kategori)} · ${article.ayat.length} ayat</p>
                    </td>
                    <td class="px-4 py-3 text-xs text-slate-600">BAB ${article.bab}<br><span class="text-[11px] text-slate-400">${escapeHtml(article.bab_judul)}</span></td>
                    <td class="px-4 py-3">${sourceBadge(article)}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <button data-pp-manage-edit="${article.pasal}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">Edit</button>
                      ${article.is_custom
                        ? `<button data-pp-manage-delete="${article.pasal}" class="ml-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition">Hapus</button>`
                        : (map.get(article.pasal) && !map.get(article.pasal).deleted
                          ? `<button data-pp-manage-reset="${article.pasal}" class="ml-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition">Reset</button>
                             <button data-pp-manage-hide="${article.pasal}" class="ml-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition">Sembunyikan</button>`
                          : `<button data-pp-manage-hide="${article.pasal}" class="ml-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition">Sembunyikan</button>`)}
                    </td>
                  </tr>`).join("") : `<tr><td colspan="5" class="p-4">${emptyState("Tidak ada pasal yang cocok", "Ubah kata kunci pencarian.")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        ${hidden.length ? `
        <div class="bg-white border border-amber-200 rounded-2xl p-4">
          <h3 class="text-sm font-bold text-slate-800">Pasal bawaan yang disembunyikan</h3>
          <p class="text-xs text-slate-500 mt-0.5">Klik Pulihkan untuk mengembalikan pasal asli dari katalog bawaan.</p>
          <div class="mt-3 space-y-2">
            ${hidden.map(article => `
              <div class="flex items-center justify-between gap-2 border border-slate-100 rounded-xl p-2.5">
                <div>
                  <p class="text-xs font-semibold text-slate-700">Pasal ${article.pasal} — ${escapeHtml(article.judul)}</p>
                  <p class="text-[11px] text-slate-400">BAB ${article.bab} — ${escapeHtml(article.bab_judul)}</p>
                </div>
                <button data-pp-manage-restore="${article.pasal}" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">Pulihkan</button>
              </div>`).join("")}
          </div>
        </div>` : ""}
      </div>`;

    panels.kelola.querySelector("#pp-manage-add")?.addEventListener("click", () => openEditor());
    panels.kelola.querySelector("#pp-manage-add-bab")?.addEventListener("click", () => openBabEditor());
    panels.kelola.querySelector("#pp-manage-add-bab-inline")?.addEventListener("click", () => openBabEditor());
    panels.kelola.querySelector("#pp-manage-refresh")?.addEventListener("click", async () => {
      await refreshCatalog();
      toast("Katalog dimuat ulang", "success");
    });
    panels.kelola.querySelector("#pp-manage-search")?.addEventListener("input", (event) => {
      state.manageQuery = event.target.value;
      renderKelola();
      const nextSearch = panels.kelola.querySelector("#pp-manage-search");
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    });
    panels.kelola.querySelectorAll("[data-pp-manage-edit]").forEach(btn => {
      btn.addEventListener("click", () => openEditor(Number(btn.dataset.ppManageEdit)));
    });
    panels.kelola.querySelectorAll("[data-pp-manage-hide]").forEach(btn => {
      btn.addEventListener("click", () => hideArticle(Number(btn.dataset.ppManageHide)));
    });
    panels.kelola.querySelectorAll("[data-pp-manage-delete]").forEach(btn => {
      btn.addEventListener("click", () => deleteCustomArticle(Number(btn.dataset.ppManageDelete)));
    });
    panels.kelola.querySelectorAll("[data-pp-manage-reset]").forEach(btn => {
      btn.addEventListener("click", () => resetOverride(Number(btn.dataset.ppManageReset)));
    });
    panels.kelola.querySelectorAll("[data-pp-manage-restore]").forEach(btn => {
      btn.addEventListener("click", () => restoreArticle(Number(btn.dataset.ppManageRestore)));
    });
    panels.kelola.querySelectorAll("[data-pp-manage-bab-edit]").forEach(btn => {
      btn.addEventListener("click", () => openBabEditor(Number(btn.dataset.ppManageBabEdit)));
    });
    panels.kelola.querySelectorAll("[data-pp-manage-bab-delete]").forEach(btn => {
      btn.addEventListener("click", () => deleteCustomBab(Number(btn.dataset.ppManageBabDelete)));
    });
  }

  async function hideArticle(pasal) {
    if (!canManage) return;
    const article = articleFor(pasal);
    if (!article) return;
    const ok = await confirmDialog(`Sembunyikan Pasal ${pasal} — ${article.judul} dari katalog? Pasal dapat dipulihkan kembali.`, { title: "Sembunyikan Pasal", danger: true });
    if (!ok) return;
    try {
      await fsUpdate(COL.PERATURAN_PERUSAHAAN, `pp-${pasal}`, { pasal, deleted: true });
      await refreshCatalog();
      toast(`Pasal ${pasal} disembunyikan`, "success");
    } catch (error) {
      console.error(error);
      toast("Gagal menyembunyikan pasal. Periksa izin Firestore Anda.", "error");
    }
  }

  async function deleteCustomArticle(pasal) {
    if (!canManage) return;
    const article = articleFor(pasal);
    if (!article) return;
    const ok = await confirmDialog(`Hapus permanen pasal tambahan ${pasal} — ${article.judul}?`, { title: "Hapus Pasal", danger: true });
    if (!ok) return;
    try {
      await fsDelete(COL.PERATURAN_PERUSAHAAN, `pp-${pasal}`);
      await refreshCatalog();
      toast(`Pasal ${pasal} dihapus`, "success");
    } catch (error) {
      console.error(error);
      toast("Gagal menghapus pasal. Periksa izin Firestore Anda.", "error");
    }
  }

  async function resetOverride(pasal) {
    if (!canManage) return;
    const article = articleFor(pasal);
    if (!article) return;
    const ok = await confirmDialog(`Kembalikan Pasal ${pasal} — ${article.judul} ke naskah bawaan? Perubahan manual akan dihapus.`, { title: "Reset ke Bawaan", danger: true });
    if (!ok) return;
    try {
      await fsDelete(COL.PERATURAN_PERUSAHAAN, `pp-${pasal}`);
      await refreshCatalog();
      toast(`Pasal ${pasal} dikembalikan ke bawaan`, "success");
    } catch (error) {
      console.error(error);
      toast("Gagal mereset pasal. Periksa izin Firestore Anda.", "error");
    }
  }

  async function restoreArticle(pasal) {
    if (!canManage) return;
    try {
      await fsDelete(COL.PERATURAN_PERUSAHAAN, `pp-${pasal}`);
      await refreshCatalog();
      toast(`Pasal ${pasal} dipulihkan`, "success");
    } catch (error) {
      console.error(error);
      toast("Gagal memulihkan pasal. Periksa izin Firestore Anda.", "error");
    }
  }

  async function deleteCustomBab(nomor) {
    if (!canManage) return;
    const bab = babFor(nomor);
    if (!bab || !bab.is_custom) return;
    const used = catalog.some(article => Number(article.bab) === Number(nomor))
      || overrides.some(row => row && !isPpBabRow(row) && Number(row.bab) === Number(nomor));
    if (used) {
      toast(`BAB ${nomor} masih memiliki pasal. Pindahkan atau hapus pasalnya terlebih dahulu.`, "warning");
      return;
    }
    const ok = await confirmDialog(`Hapus BAB ${nomor} - ${bab.judul}?`, { title: "Hapus Bab", danger: true });
    if (!ok) return;
    try {
      await fsDelete(COL.PERATURAN_PERUSAHAAN, `pp-bab-${nomor}`);
      await refreshCatalog();
      toast(`BAB ${nomor} dihapus`, "success");
    } catch (error) {
      console.error(error);
      toast("Gagal menghapus bab. Periksa izin Firestore Anda.", "error");
    }
  }

  function openBabEditor(nomor = null) {
    if (!canManage) {
      toast("Hanya Superadmin yang dapat mengubah struktur bab.", "warning");
      return;
    }
    const existing = nomor ? babFor(nomor) : null;
    const isExisting = !!existing;
    const values = existing || {
      nomor: nextBabNumber(),
      judul: "",
      kategori: ""
    };

    const body = `
      <div class="space-y-4 text-sm">
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900">
          Bab baru dapat langsung dipilih saat menambah atau mengedit pasal. Nomor bab harus unik dan lebih besar dari 0.
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Nomor Bab <span class="text-red-500">*</span></span>
            <input id="ppb-nomor" type="number" min="1" max="999" value="${escapeHtml(values.nomor)}" ${isExisting ? "readonly" : ""} class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 ${isExisting ? "bg-slate-100 text-slate-500" : "bg-white"} outline-none">
          </label>
          <label class="block md:col-span-2">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Judul Bab <span class="text-red-500">*</span></span>
            <input id="ppb-judul" value="${escapeHtml(values.judul || "")}" placeholder="Contoh: Perlindungan Data Pekerja" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
          </label>
        </div>
        <label class="block">
          <span class="block text-xs font-semibold text-slate-600 mb-1">Kategori Bab</span>
          <input id="ppb-kategori" list="ppb-kategori-list" value="${escapeHtml(values.kategori || "")}" placeholder="Contoh: Perlindungan & Kepatuhan" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
          <datalist id="ppb-kategori-list">${categories.map(k => `<option value="${escapeHtml(k)}"></option>`).join("")}</datalist>
        </label>
        <p class="text-[11px] text-slate-400">${isExisting ? "Nomor bab tidak dapat diubah agar pasal yang sudah ada tetap terhubung." : "Nomor bab otomatis memakai urutan berikutnya, tetapi dapat disesuaikan."}</p>
      </div>`;

    openModal({
      title: isExisting ? `Edit BAB ${values.nomor}` : "Tambah Bab Baru",
      size: "lg",
      bodyHtml: body,
      footerHtml: `
        <button id="ppb-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="ppb-save" class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition">Simpan Bab</button>`,
      onMount: (modal) => {
        modal.querySelector("#ppb-cancel")?.addEventListener("click", closeModal);
        modal.querySelector("#ppb-save")?.addEventListener("click", async () => {
          const nomorBab = Number(modal.querySelector("#ppb-nomor")?.value || 0);
          const judul = String(modal.querySelector("#ppb-judul")?.value || "").trim();
          const kategori = String(modal.querySelector("#ppb-kategori")?.value || "").trim() || "Ketentuan Lain";
          if (!Number.isInteger(nomorBab) || nomorBab < 1) {
            toast("Nomor bab wajib berupa angka positif.", "warning");
            return;
          }
          if (!judul) {
            toast("Judul bab wajib diisi.", "warning");
            return;
          }
          if (!isExisting && babFor(nomorBab)) {
            toast(`BAB ${nomorBab} sudah ada. Gunakan tombol Edit pada bab tersebut.`, "warning");
            return;
          }
          const saveBtn = modal.querySelector("#ppb-save");
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Menyimpan..."; }
          try {
            await fsUpdate(COL.PERATURAN_PERUSAHAAN, `pp-bab-${nomorBab}`, {
              type: "bab",
              nomor: nomorBab,
              judul,
              kategori,
              deleted: false
            });
            closeModal();
            await refreshCatalog();
            toast(`BAB ${nomorBab} berhasil disimpan`, "success");
          } catch (error) {
            console.error(error);
            toast("Gagal menyimpan bab. Periksa izin Firestore Anda.", "error");
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Simpan Bab"; }
          }
        });
      }
    });
  }

  function openEditor(pasal = null) {
    if (!canManage) {
      toast("Hanya Superadmin yang dapat mengubah katalog.", "warning");
      return;
    }
    const existing = pasal ? articleFor(pasal) : null;
    const isExisting = !!existing;
    const builtin = existing ? isBuiltin(existing.pasal) : false;
    const defaultBab = babs[babs.length - 1];
    const values = existing || {
      pasal: nextPasalNumber(),
      bab: defaultBab?.nomor || 1,
      kategori: defaultBab?.kategori || "",
      judul: "",
      ayat: [],
      ringkasan: "",
      dasar_hukum: [],
      referensi: [],
      tags: [],
      perubahan: "",
      catatan: "",
      disiplin: null
    };
    const disiplin = values.disiplin || {};
    const hasOverride = isExisting && !!overrideMap().get(values.pasal);
    const editorBabs = [...babs];
    if (existing && !editorBabs.some(bab => Number(bab.nomor) === Number(existing.bab))) {
      editorBabs.push({
        nomor: Number(existing.bab),
        judul: existing.bab_judul || `Bab ${existing.bab}`,
        kategori: existing.kategori || "",
        is_custom: true
      });
    }

    const body = `
      <div class="space-y-4 text-sm">
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          Perubahan ini tersimpan di Firestore. Naskah 2026 tetap berstatus draf sampai disahkan; jangan menghapus peringatan status pada dokumen.
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Bab</span>
            <select id="ppf-bab" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white outline-none">
              ${editorBabs.map(b => `<option value="${b.nomor}" ${Number(values.bab) === Number(b.nomor) ? "selected" : ""}>BAB ${b.nomor} — ${escapeHtml(b.judul)}</option>`).join("")}
            </select>
            <span class="block text-[10px] text-slate-400 mt-1">Butuh bab baru? Tutup formulir ini lalu klik <b>Tambah Bab</b> di tab Kelola.</span>
          </label>
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Nomor Pasal</span>
            <input id="ppf-pasal" type="number" min="1" max="999" value="${escapeHtml(values.pasal)}" ${isExisting ? "readonly" : ""} class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 ${isExisting ? "bg-slate-100 text-slate-500" : "bg-white"} outline-none">
          </label>
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Kategori</span>
            <input id="ppf-kategori" list="ppf-kategori-list" value="${escapeHtml(values.kategori)}" placeholder="Contoh: Cuti & Izin" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
            <datalist id="ppf-kategori-list">${categories.map(k => `<option value="${escapeHtml(k)}"></option>`).join("")}</datalist>
          </label>
        </div>
        <label class="block">
          <span class="block text-xs font-semibold text-slate-600 mb-1">Judul Pasal <span class="text-red-500">*</span></span>
          <input id="ppf-judul" value="${escapeHtml(values.judul)}" placeholder="Contoh: Cuti Tahunan" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
        </label>
        <label class="block">
          <span class="block text-xs font-semibold text-slate-600 mb-1">Ayat / Isi Pasal <span class="text-red-500">*</span> <span class="text-[10px] font-normal text-slate-400">(satu ayat per baris)</span></span>
          <textarea id="ppf-ayat" rows="6" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none font-mono leading-relaxed">${escapeHtml((values.ayat || []).join("\n"))}</textarea>
        </label>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Ringkasan</span>
            <textarea id="ppf-ringkasan" rows="3" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">${escapeHtml(values.ringkasan || "")}</textarea>
          </label>
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Catatan / Butir Keputusan</span>
            <textarea id="ppf-catatan" rows="3" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">${escapeHtml(values.catatan || "")}</textarea>
          </label>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Dasar Hukum <span class="text-[10px] font-normal text-slate-400">(pisahkan dengan ;)</span></span>
            <input id="ppf-dasar" value="${escapeHtml((values.dasar_hukum || []).join("; "))}" placeholder="UU 13/2003; PP 35/2021" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
          </label>
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Pasal Terkait <span class="text-[10px] font-normal text-slate-400">(nomor, pisahkan koma)</span></span>
            <input id="ppf-referensi" value="${escapeHtml((values.referensi || []).join(", "))}" placeholder="9, 10, 43" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
          </label>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Perubahan Kunci</span>
            <input id="ppf-perubahan" value="${escapeHtml(values.perubahan || "")}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
          </label>
          <label class="block">
            <span class="block text-xs font-semibold text-slate-600 mb-1">Tag <span class="text-[10px] font-normal text-slate-400">(pisahkan koma)</span></span>
            <input id="ppf-tags" value="${escapeHtml((values.tags || []).join(", "))}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
          </label>
        </div>

        <div class="bg-red-50 border border-red-200 rounded-xl p-3 space-y-3">
          <label class="flex items-center gap-2 text-xs font-bold text-red-900">
            <input id="ppf-disiplin" type="checkbox" ${values.disiplin ? "checked" : ""} class="rounded border-red-300 text-red-700">
            Pasal ini terkait Disiplin &amp; SP
          </label>
          <div id="ppf-disiplin-fields" class="${values.disiplin ? "" : "hidden"} grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="block">
              <span class="block text-[11px] font-semibold text-red-900 mb-1">Tingkat</span>
              <input id="ppf-disiplin-tingkat" value="${escapeHtml(disiplin.tingkat || "")}" placeholder="Teguran / SP / PHK" class="w-full px-3 py-2 text-sm rounded-lg border border-red-200 outline-none">
            </label>
            <label class="block">
              <span class="block text-[11px] font-semibold text-red-900 mb-1">Jenis Pelanggaran</span>
              <input id="ppf-disiplin-jenis" value="${escapeHtml((disiplin.jenis || []).join(", "))}" placeholder="Pelanggaran ringan, berat" class="w-full px-3 py-2 text-sm rounded-lg border border-red-200 outline-none">
            </label>
            <label class="block">
              <span class="block text-[11px] font-semibold text-red-900 mb-1">Catatan</span>
              <input id="ppf-disiplin-catatan" value="${escapeHtml(disiplin.catatan || "")}" class="w-full px-3 py-2 text-sm rounded-lg border border-red-200 outline-none">
            </label>
          </div>
        </div>
      </div>`;

    openModal({
      title: isExisting ? `Edit Pasal ${values.pasal}` : "Tambah Pasal Baru",
      size: "xl",
      bodyHtml: body,
      footerHtml: `
        <button id="ppf-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        ${isExisting && builtin && hasOverride ? `<button id="ppf-reset" class="px-4 py-2 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition">Reset ke Bawaan</button>` : ""}
        <button id="ppf-save" class="px-4 py-2 rounded-lg text-sm font-semibold bg-maroon-700 text-white hover:bg-maroon-800 transition">Simpan Pasal</button>`,
      onMount: (modal) => {
        modal.querySelector("#ppf-cancel")?.addEventListener("click", closeModal);
        modal.querySelector("#ppf-reset")?.addEventListener("click", async () => { closeModal(); await resetOverride(values.pasal); });
        modal.querySelector("#ppf-disiplin")?.addEventListener("change", (event) => {
          modal.querySelector("#ppf-disiplin-fields")?.classList.toggle("hidden", !event.target.checked);
        });
        modal.querySelector("#ppf-save")?.addEventListener("click", async () => {
          const pasalNumber = Number(modal.querySelector("#ppf-pasal")?.value || 0);
          const judul = String(modal.querySelector("#ppf-judul")?.value || "").trim();
          const ayat = splitList(modal.querySelector("#ppf-ayat")?.value || "", /\r?\n/);
          if (!pasalNumber || pasalNumber < 1) {
            toast("Nomor pasal wajib diisi dengan angka positif.", "warning");
            return;
          }
          if (!judul) {
            toast("Judul pasal wajib diisi.", "warning");
            return;
          }
          if (!ayat.length) {
            toast("Isi pasal minimal satu ayat.", "warning");
            return;
          }
          if (isExisting && pasalNumber !== Number(values.pasal)) {
            toast("Nomor pasal tidak boleh diubah saat mengedit. Buat pasal baru bila perlu.", "warning");
            return;
          }
          if (!isExisting && articleFor(pasalNumber)) {
            toast(`Pasal ${pasalNumber} sudah ada. Gunakan tombol Edit pada pasal tersebut.`, "warning");
            return;
          }
          const disiplinOn = !!modal.querySelector("#ppf-disiplin")?.checked;
          const payload = {
            pasal: pasalNumber,
            deleted: false,
            bab: Number(modal.querySelector("#ppf-bab")?.value || 1),
            judul,
            kategori: String(modal.querySelector("#ppf-kategori")?.value || "").trim(),
            ayat,
            ringkasan: String(modal.querySelector("#ppf-ringkasan")?.value || "").trim(),
            dasar_hukum: splitList(modal.querySelector("#ppf-dasar")?.value || "", /[;\n]/),
            referensi: splitList(modal.querySelector("#ppf-referensi")?.value || "", /[,;\n]/)
              .map(item => Number(item))
              .filter(number => Number.isInteger(number) && number > 0),
            tags: splitList(modal.querySelector("#ppf-tags")?.value || "", /[,;\n]/),
            perubahan: String(modal.querySelector("#ppf-perubahan")?.value || "").trim(),
            catatan: String(modal.querySelector("#ppf-catatan")?.value || "").trim(),
            disiplin: disiplinOn ? {
              tingkat: String(modal.querySelector("#ppf-disiplin-tingkat")?.value || "").trim(),
              jenis: splitList(modal.querySelector("#ppf-disiplin-jenis")?.value || "", /[,;\n]/),
              catatan: String(modal.querySelector("#ppf-disiplin-catatan")?.value || "").trim()
            } : null
          };
          const saveBtn = modal.querySelector("#ppf-save");
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Menyimpan..."; }
          try {
            await fsUpdate(COL.PERATURAN_PERUSAHAAN, `pp-${pasalNumber}`, payload);
            closeModal();
            await refreshCatalog();
            toast(`Pasal ${pasalNumber} berhasil disimpan`, "success");
          } catch (error) {
            console.error(error);
            toast("Gagal menyimpan pasal. Periksa izin Firestore Anda.", "error");
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Simpan Pasal"; }
          }
        });
      }
    });
  }

  function switchTab(tab) {
    if (tab === "kelola" && !canManage) return;
    state.tab = tab;
    Object.entries(panels).forEach(([key, panel]) => panel?.classList.toggle("hidden", key !== tab));
    container.querySelectorAll(".pp-tab").forEach(btn => {
      const active = btn.dataset.pptab === tab;
      btn.classList.toggle("active", active);
    });
    if (tab === "disiplin" && !panels.disiplin.dataset.rendered) {
      renderDisiplin();
      panels.disiplin.dataset.rendered = "1";
    }
    if (tab === "kepatuhan" && !panels.kepatuhan.dataset.rendered) {
      renderKepatuhan();
      panels.kepatuhan.dataset.rendered = "1";
    }
    if (tab === "kelola" && !panels.kelola.dataset.rendered) {
      renderKelola();
      panels.kelola.dataset.rendered = "1";
    }
  }

  const manageTabBtn = container.querySelector('[data-pptab="kelola"]');
  if (manageTabBtn) manageTabBtn.classList.toggle("hidden", !canManage);

  renderKatalog();
  container.querySelectorAll(".pp-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.pptab));
  });

  const initialPasal = params?.get?.("pasal");
  if (initialPasal) {
    const article = articleFor(initialPasal);
    if (article) setTimeout(() => openArticle(article.pasal), 60);
  }

  return { unmount() {} };
}
