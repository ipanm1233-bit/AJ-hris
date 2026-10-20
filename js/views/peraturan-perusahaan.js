import {
  PP_META, PP_BABS, PP_CATEGORIES,
  PP_COMPLIANCE_SUMMARY, PP_KEY_FINDINGS, PP_COMPARISONS,
  PP_MANAGEMENT_DECISIONS, PP_LEGAL_BASIS, PP_COMPLIANCE_MATRIX,
  disciplinePpArticles, getPpArticle, ppArticleLabel, ppArticleReferences,
  searchPpArticles, ppStats
} from "../peraturan-perusahaan.mjs";
import { icon, badge, emptyState } from "../components.js";
import { hasPermission, canAccessRoute } from "../auth.js";
import { escapeHtml, navigate, toast, openModal, closeModal } from "../utils.js";
import { isoDocHeaderTable } from "../branding.js";

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

function printShell(title, bodyHtml) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Times New Roman", Times, serif; font-size: 10.5pt; color: #111; line-height: 1.45; }
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
    kepatuhan: container.querySelector("#pp-panel-kepatuhan")
  };
  const state = {
    tab: "katalog",
    query: "",
    bab: "",
    kategori: "",
    disciplineOnly: false,
    matrixQuery: "",
    matrixStatus: ""
  };
  const stats = ppStats();
  const canView = await hasPermission("peraturan_perusahaan.view", session);
  const canPrint = await hasPermission("peraturan_perusahaan.print", session);
  const canLinkDiscipline = await hasPermission("peraturan_perusahaan.disiplin", session)
    && await canAccessRoute("pemanggilan", session);

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
      disciplineOnly: state.disciplineOnly
    });
  }

  function articleCard(article) {
    const disiplinBadge = article.disiplin ? badge("Terkait Disiplin", "red") : "";
    const catatanBadge = article.catatan ? badge("Catatan", "amber") : "";
    const perubahanBadge = article.perubahan ? badge("Diperbarui", "green") : "";
    return `
      <article class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-maroon-200 transition flex flex-col">
        <div class="flex items-start justify-between gap-2 mb-2">
          <span class="text-[10px] font-black uppercase tracking-wider text-maroon-700 bg-maroon-50 px-2 py-1 rounded-lg">Pasal ${article.pasal}</span>
          <span class="text-[10px] font-medium text-slate-500 text-right">${escapeHtml(article.kategori)}</span>
        </div>
        <h3 class="font-bold text-slate-800 text-sm leading-snug">${escapeHtml(article.judul)}</h3>
        <p class="text-xs text-slate-500 mt-2 leading-relaxed flex-1">${escapeHtml(ringkas(article.ringkasan))}</p>
        <div class="flex flex-wrap gap-1.5 mt-3">${disiplinBadge}${perubahanBadge}${catatanBadge}</div>
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
                ${PP_BABS.map(b => `<option value="${b.nomor}" ${String(state.bab) === String(b.nomor) ? "selected" : ""}>BAB ${b.nomor} — ${escapeHtml(b.judul)}</option>`).join("")}
              </select>
            </div>
            <div class="md:col-span-3">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Kategori</label>
              <select id="pp-kategori" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
                <option value="">Semua kategori</option>
                ${PP_CATEGORIES.map(k => `<option value="${escapeHtml(k)}" ${state.kategori === k ? "selected" : ""}>${escapeHtml(k)}</option>`).join("")}
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
      const groups = PP_BABS
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
    const article = getPpArticle(pasal);
    if (!article) return;
    const refs = ppArticleReferences(article);
    const disiplin = article.disiplin;
    const body = `
      <div class="space-y-4 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-black uppercase tracking-wider text-maroon-700 bg-maroon-50 px-2.5 py-1 rounded-lg">Pasal ${article.pasal}</span>
          ${badge(`BAB ${article.bab} — ${article.bab_judul}`, "slate")}
          ${badge(article.kategori, "blue")}
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
        ${canPrint ? `<button id="pp-detail-print" class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition">Cetak Pasal</button>` : ""}
        ${disiplin && canLinkDiscipline ? `<button id="pp-detail-sp" class="px-4 py-2 rounded-lg text-sm font-semibold bg-maroon-700 text-white hover:bg-maroon-800 transition">Buat SP / Tindak Lanjut</button>` : ""}`,
      onMount: (modal) => {
        modal.querySelector("#pp-detail-close")?.addEventListener("click", closeModal);
        modal.querySelector("#pp-detail-print")?.addEventListener("click", () => printArticle(article));
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
    const items = disciplinePpArticles();
    const ladder = [43, 44, 49, 53, 54].map(getPpArticle).filter(Boolean);
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

        <div class="grid grid-cols-1 md:grid-cols-5 gap-2.5">
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

  function switchTab(tab) {
    state.tab = tab;
    Object.entries(panels).forEach(([key, panel]) => panel?.classList.toggle("hidden", key !== tab));
    container.querySelectorAll(".pp-tab").forEach(btn => {
      const active = btn.dataset.pptab === tab;
      btn.classList.toggle("bg-white", active);
      btn.classList.toggle("text-maroon-700", active);
      btn.classList.toggle("shadow-sm", active);
      btn.classList.toggle("text-slate-600", !active);
    });
    if (tab === "disiplin" && !panels.disiplin.dataset.rendered) {
      renderDisiplin();
      panels.disiplin.dataset.rendered = "1";
    }
    if (tab === "kepatuhan" && !panels.kepatuhan.dataset.rendered) {
      renderKepatuhan();
      panels.kepatuhan.dataset.rendered = "1";
    }
  }

  renderKatalog();
  container.querySelectorAll(".pp-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.pptab));
  });

  const initialPasal = params?.get?.("pasal");
  if (initialPasal) {
    const article = getPpArticle(initialPasal);
    if (article) setTimeout(() => openArticle(article.pasal), 60);
  }

  return { unmount() {} };
}
