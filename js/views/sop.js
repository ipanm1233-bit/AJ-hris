import { COL } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, toast, openModal, closeModal,
  escapeHtml, fmtDateShort, genId, localDateStr
} from "../utils.js";
import { renderCrudModule, icon, badge, emptyState } from "../components.js";
import { hasPermission, canDeleteModuleData } from "../auth.js";
import { isoDocHeaderTable, COMPANY_NAME, COMPANY_ADDRESS_LINE1 } from "../branding.js";
import {
  buildMermaidCode, resolveSteps, normalizeSteps, formatSopNumber,
  isSopReviewDue, SOP_STEP_CATEGORIES, SOP_STATUSES,
  SOP_DIVISIONS, SOP_CATEGORIES, DEFAULT_DECISION_YES, DEFAULT_DECISION_NO
} from "../sop-flowchart.mjs";
import {
  summarizeAudits, normalizeChecklist, computeAuditScore, gradeAudit,
  standardChecklistFor, AUDIT_STATUSES, FINDING_SEVERITIES, FOLLOW_UP_STATUSES,
  SCORE_SCALE_LABELS, SCORE_MAX
} from "../sop-audit.mjs";

/* ---------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------- */
function formatTanggalIndo(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

function safeSvg(svg) {
  const raw = String(svg || "");
  if (!/<svg[\s>]/i.test(raw)) return "";
  return raw.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/onload\s*=\s*"[^"]*"/gi, "");
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "aktif") return "green";
  if (value === "review" || value === "revisi") return "amber";
  if (value === "obsolete") return "red";
  return "slate";
}

function auditStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "selesai") return "green";
  if (value === "berlangsung") return "blue";
  if (value === "tindak lanjut") return "amber";
  if (value === "terjadwal") return "maroon";
  return "slate";
}

function printStyles() {
  return `
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 14px; font-size: 10.5px; line-height: 1.35; }
    .doc { max-width: 100%; }
    h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin: 14px 0 6px; }
    p { margin: 0 0 6px; }
    .muted { color: #64748b; font-style: italic; }
    table.meta, table.grid, table.sign, table.kpi { width: 100%; border-collapse: collapse; }
    table.meta td, table.grid th, table.grid td, table.sign td, table.kpi td, table.kpi th { border: 1px solid #94a3b8; padding: 4px 5px; vertical-align: top; }
    table.meta td.label { background: #e2e8f0; font-weight: bold; width: 26%; }
    table.grid th, table.kpi th { background: #e2e8f0; text-align: left; font-size: 9.5px; text-transform: uppercase; }
    table.grid td.center, table.grid th.center { text-align: center; }
    .diagram { text-align: center; border: 1px solid #cbd5e1; padding: 10px; margin-top: 6px; }
    .diagram svg { max-width: 100%; height: auto; }
    .score-box { display: flex; gap: 10px; margin: 8px 0; }
    .score-box .box { flex: 1; border: 1px solid #94a3b8; padding: 8px; text-align: center; }
    .score-box .box b { display: block; font-size: 18px; }
    .pengesahan { margin-top: 18px; page-break-inside: avoid; }
    .pengesahan table td { border: 1px solid #94a3b8; text-align: center; height: 78px; vertical-align: top; padding: 6px; }
    .ttd-space { height: 42px; }
    .small { font-size: 9px; color: #475569; }
    .avoid-break { page-break-inside: avoid; }
  `;
}

function wrapPrintDocument(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${printStyles()}</style>
</head>
<body>
<div class="doc">${bodyHtml}</div>
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { try { window.print(); } catch (e) {} }, 400);
  });
</script>
</body>
</html>`;
}

function openPrintWindow(html) {
  const win = window.open("", "_blank", "width=980,height=860");
  if (!win) {
    toast("Izin popup diblokir browser. Izinkan popup untuk mencetak dokumen.", "error");
    return;
  }
  win.document.write(html);
  win.document.close();
}

/**
 * Buka jendela cetak lebih awal (masih di dalam gesture klik) agar tidak
 * diblokir popup saat flowchart harus dirender secara async.
 */
function openPrintPlaceholder() {
  const win = window.open("", "_blank", "width=980,height=860");
  if (!win) {
    toast("Izin popup diblokir browser. Izinkan popup untuk mencetak dokumen.", "error");
    return null;
  }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Menyiapkan dokumen…</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;padding:32px;color:#334155;font-size:13px;">Menyiapkan dokumen SOP dan flowchart…</body></html>`);
  win.document.close();
  return win;
}

function writePrintWindow(win, html) {
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ---------------------------------------------------------------------
 * MERMAID RENDER — Kroki.io -> mermaid.js CDN -> fallback HTML
 * ------------------------------------------------------------------- */
let mermaidModulePromise = null;

async function renderMermaidWithKroki(code) {
  const res = await fetch("https://kroki.io/mermaid/svg", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: code
  });
  if (!res.ok) throw new Error(`Kroki menolak diagram (${res.status})`);
  const svg = await res.text();
  if (!/<svg[\s>]/i.test(svg)) throw new Error("Kroki tidak mengembalikan SVG");
  return svg;
}

async function renderMermaidLocally(code) {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
  }
  const mod = await mermaidModulePromise;
  const mermaid = mod.default || mod;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    flowchart: { htmlLabels: true, useMaxWidth: true, curve: "basis" },
    themeVariables: { fontSize: "13px", primaryColor: "#1e293b", primaryTextColor: "#f8fafc" }
  });
  const { svg } = await mermaid.render(`sop-mermaid-${Date.now()}`, code);
  return svg;
}

async function ensureDiagramSvg(code) {
  try { return await renderMermaidWithKroki(code); } catch (e) { /* lanjut fallback */ }
  try { return await renderMermaidLocally(code); } catch (e) { /* lanjut fallback */ }
  return "";
}

/* ---------------------------------------------------------------------
 * MOUNT
 * ------------------------------------------------------------------- */
export async function mount(container, { session } = {}) {
  const panelDatabase = container.querySelector("#sop-panel-database");
  const panelAudit = container.querySelector("#sop-panel-audit");
  const panelGenerator = container.querySelector("#sop-panel-generator");
  const auditSummaryEl = container.querySelector("#sop-audit-summary");
  const auditCrudEl = container.querySelector("#sop-audit-crud");

  const loaded = { database: false, audit: false, generator: false };
  let sopCache = [];
  let auditCrud = null;

  const generatorState = {
    sops: [],
    sopId: "",
    current: null,
    steps: [],
    code: "",
    svg: "",
    mode: "VISUAL",
    requestToken: 0
  };

  /* -------------------------------------------------------------------
   * DATA SOP
   * ----------------------------------------------------------------- */
  async function loadSopCache() {
    sopCache = await fsGetAll(COL.SOP_DOKUMEN).catch(() => []);
    return sopCache;
  }

  function sopLabel(sop) {
    return sop?.judul || sop?.nomor_dokumen || sop?.id || "SOP";
  }

  /* -------------------------------------------------------------------
   * TAB 1 — DATABASE SOP
   * ----------------------------------------------------------------- */
  async function renderDatabase() {
    const [canCreate, canEdit, canDelete, canExport] = await Promise.all([
      hasPermission("sop.create", session),
      hasPermission("sop.edit", session),
      hasPermission("sop.delete", session),
      hasPermission("sop.document.export", session)
    ]);

    await loadSopCache();

    const crud = await renderCrudModule(panelDatabase, {
      title: "Database SOP Perusahaan",
      subtitle: "Seluruh prosedur standar Andela Jaya: pembuatan SOP baru, revisi, status, dan lampiran dokumen resmi.",
      collectionName: COL.SOP_DOKUMEN,
      idPrefix: "SOP",
      orderByField: "judul",
      searchFields: ["judul", "nomor_dokumen", "divisi", "kategori", "status", "pembuat"],
      canCreate,
      canEdit,
      canDelete: canDelete && canDeleteModuleData(session),
      emptyMessage: "Belum ada SOP terdaftar",
      columns: [
        {
          key: "nomor_dokumen",
          label: "No. Dokumen",
          format: (v, row) => `<span class="font-mono text-[11px] font-bold text-maroon-800">${escapeHtml(v || formatSopNumber(row))}</span>`
        },
        {
          key: "judul",
          label: "Judul SOP",
          format: (v, row) => `<div class="font-semibold text-slate-800">${escapeHtml(v || "-")}</div>
            <div class="text-[11px] text-slate-400">${escapeHtml(row.kategori || "Prosedur")}</div>`
        },
        { key: "divisi", label: "Divisi", type: "badge", badgeTone: () => "blue" },
        { key: "versi", label: "Versi" },
        { key: "status", label: "Status", type: "badge", badgeTone: statusTone },
        {
          key: "tanggal_review",
          label: "Review Berikutnya",
          format: (v, row) => {
            if (!v) return `<span class="text-slate-400">-</span>`;
            const due = isSopReviewDue(row);
            return `<span class="${due ? "text-amber-700 font-bold" : "text-slate-600"}">${fmtDateShort(v)}${due ? ' <span class="text-[10px]">(review)</span>' : ""}</span>`;
          }
        }
      ],
      formFields: [
        { name: "nomor_dokumen", label: "Nomor Dokumen (otomatis bila kosong)", type: "text" },
        { name: "judul", label: "Judul Prosedur (SOP)", type: "text", required: true, full: true },
        { name: "divisi", label: "Divisi Terkait", type: "select", options: [...SOP_DIVISIONS], required: true },
        { name: "kategori", label: "Kategori SOP", type: "select", options: [...SOP_CATEGORIES] },
        { name: "versi", label: "Versi / Revisi", type: "text", default: "1.0" },
        { name: "status", label: "Status Dokumen", type: "select", options: [...SOP_STATUSES], default: "Draft" },
        { name: "tanggal_terbit", label: "Tanggal Terbit", type: "date" },
        { name: "tanggal_review", label: "Jadwal Review Berikutnya", type: "date" },
        { name: "pembuat", label: "Disusun Oleh", type: "text" },
        { name: "penyetuju", label: "Disetujui Oleh", type: "text" },
        { name: "tujuan", label: "Tujuan Prosedur", type: "textarea", full: true },
        { name: "ruang_lingkup", label: "Ruang Lingkup", type: "textarea", full: true },
        { name: "dasar_hukum", label: "Dasar Hukum / Kebijakan", type: "textarea", full: true },
        { name: "definisi", label: "Definisi / Istilah", type: "textarea", full: true },
        { name: "alur_proses", label: "Alur Proses (satu langkah per baris)", type: "textarea", full: true },
        { name: "referensi", label: "Referensi & Dokumen Terkait", type: "textarea", full: true },
        { name: "file_url", label: "Link Lampiran Lengkap (opsional)", type: "text", full: true }
      ],
      extraToolbarHtml: `<button id="btn-sop-open-generator" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white hover:opacity-95 transition shadow-sm">${icon("book", "w-4 h-4")}Dokumen & Flowchart</button>`,
      beforeSave: (data, existing) => {
        const payload = { ...data };
        payload.nomor_dokumen = String(payload.nomor_dokumen || "").trim() || formatSopNumber(payload, sopCache.length + 1);
        payload.updated_at = new Date().toISOString();
        if (!existing) payload.created_at = payload.updated_at;
        return payload;
      },
      afterSave: async () => {
        await loadSopCache();
        loaded.generator = false;
      },
      onRowClick: (row) => openGenerator(row.id),
      printFn: (row) => {
        if (!canExport) {
          toast("Akses ditolak: Anda tidak berwenang mencetak dokumen SOP.", "warning");
          return;
        }
        printSopDocument(row);
      },
      printLabel: "Cetak Dokumen SOP"
    });

    panelDatabase.querySelector("#btn-sop-open-generator")?.addEventListener("click", () => openGenerator());

    return crud;
  }

  /* -------------------------------------------------------------------
   * TAB 2 — AUDIT KEPATUHAN SOP
   * ----------------------------------------------------------------- */
  function renderAuditSummary(list) {
    if (!auditSummaryEl) return;
    const summary = summarizeAudits(list);
    const divisiRows = summary.byDivisi.map(row => `
      <tr class="border-t border-slate-100">
        <td class="px-3 py-2 font-semibold text-slate-700">${escapeHtml(row.divisi)}</td>
        <td class="px-3 py-2 text-center">${row.total}</td>
        <td class="px-3 py-2 text-center font-bold ${row.averageScore >= 80 ? "text-emerald-700" : row.averageScore >= 60 ? "text-amber-700" : "text-red-700"}">${row.averageScore.toFixed(2)}</td>
        <td class="px-3 py-2 text-center ${row.openFindings > 0 ? "text-amber-700 font-bold" : "text-slate-500"}">${row.openFindings}</td>
      </tr>`).join("");

    auditSummaryEl.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Sesi Audit</p>
          <p class="text-2xl font-black text-slate-800 mt-1">${summary.totalAudits}</p>
          <p class="text-[11px] text-slate-400">Seluruh divisi</p>
        </div>
        <div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Rata-rata Skor</p>
          <p class="text-2xl font-black ${summary.averageScore >= 80 ? "text-emerald-700" : summary.averageScore >= 60 ? "text-amber-700" : "text-red-700"} mt-1">${summary.averageScore.toFixed(2)}</p>
          <p class="text-[11px] text-slate-400">Skala 0 - 100</p>
        </div>
        <div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Temuan Terbuka</p>
          <p class="text-2xl font-black text-amber-700 mt-1">${summary.openFindings}</p>
          <p class="text-[11px] text-slate-400">Perlu tindak lanjut</p>
        </div>
        <div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Lewat Deadline</p>
          <p class="text-2xl font-black ${summary.overdueFindings > 0 ? "text-red-700" : "text-slate-800"} mt-1">${summary.overdueFindings}</p>
          <p class="text-[11px] text-slate-400">Tindak lanjut terlambat</p>
        </div>
      </div>
      ${summary.byDivisi.length ? `
      <div class="bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-800">Rekap Kepatuhan per Divisi</h3>
          <span class="text-[11px] text-slate-400">${summary.byDivisi.length} divisi</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
              <tr>
                <th class="px-3 py-2 text-left">Divisi</th>
                <th class="px-3 py-2 text-center">Sesi</th>
                <th class="px-3 py-2 text-center">Rata-rata Skor</th>
                <th class="px-3 py-2 text-center">Temuan Terbuka</th>
              </tr>
            </thead>
            <tbody>${divisiRows}</tbody>
          </table>
        </div>
      </div>` : ""}
    `;
  }

  async function renderAuditTab() {
    const [canCreate, canEdit, canDelete, canExport] = await Promise.all([
      hasPermission("sop.audit.create", session),
      hasPermission("sop.audit.edit", session),
      hasPermission("sop.audit.delete", session),
      hasPermission("sop.audit.export", session)
    ]);

    auditCrud = await renderCrudModule(auditCrudEl, {
      title: "Audit Kepatuhan SOP Per Divisi",
      subtitle: "Jadwalkan audit, isi checklist kepatuhan, catat temuan, dan pantau tindak lanjut tiap divisi.",
      collectionName: COL.SOP_AUDIT,
      idPrefix: "AUDSOP",
      searchFields: ["divisi", "auditor", "periode", "status", "nomor_audit"],
      canCreate: false,
      canEdit: false,
      canDelete: canDelete && canDeleteModuleData(session),
      emptyMessage: "Belum ada sesi audit SOP",
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "divisi", label: "Divisi", type: "badge", badgeTone: () => "blue" },
        { key: "periode", label: "Periode" },
        { key: "auditor", label: "Auditor" },
        {
          key: "skor",
          label: "Skor",
          format: (v, row) => {
            const score = Number(v || 0);
            const grade = row.grade || gradeAudit(score).grade;
            const tone = score >= 80 ? "text-emerald-700" : score >= 60 ? "text-amber-700" : "text-red-700";
            return `<span class="font-bold ${tone}">${score.toFixed(2)}</span> <span class="text-[10px] font-bold text-slate-400">(${escapeHtml(grade)})</span>`;
          }
        },
        { key: "status", label: "Status", type: "badge", badgeTone: auditStatusTone },
        {
          key: "jumlah_temuan",
          label: "Temuan",
          format: (v, row) => {
            const open = Number(row.open_temuan || 0);
            return `<span class="font-semibold">${Number(v || 0)}</span>${open > 0 ? ` <span class="text-[10px] font-bold text-amber-700">(${open} open)</span>` : ""}`;
          }
        }
      ],
      formFields: [
        { name: "nomor_audit", label: "Nomor Audit", type: "text" },
        { name: "divisi", label: "Divisi Diaudit", type: "select", options: [...SOP_DIVISIONS], required: true },
        { name: "periode", label: "Periode Audit", type: "text" },
        { name: "tanggal", label: "Tanggal Audit", type: "date", required: true },
        { name: "auditor", label: "Auditor / Tim Audit", type: "text" },
        { name: "status", label: "Status Audit", type: "select", options: [...AUDIT_STATUSES], default: "Draft" },
        { name: "ruang_lingkup", label: "Ruang Lingkup Audit", type: "textarea", full: true },
        { name: "catatan", label: "Catatan / Ringkasan", type: "textarea", full: true }
      ],
      extraToolbarHtml: `<button id="btn-sop-audit-new" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-maroon-700 to-rose-800 text-white hover:opacity-95 transition shadow-sm">${icon("plus", "w-4 h-4")}Buat Sesi Audit</button>`,
      onRowClick: (row, ctx) => {
        if (!canEdit) {
          toast("Akses ditolak: Anda tidak berwenang mengubah audit SOP.", "warning");
          return;
        }
        openAuditEditor(row, ctx.reload);
      },
      onRowRender: (list) => renderAuditSummary(list),
      printFn: (row) => {
        if (!canExport) {
          toast("Akses ditolak: Anda tidak berwenang mencetak laporan audit.", "warning");
          return;
        }
        printAuditReport(row);
      },
      printLabel: "Cetak Laporan Audit"
    });

    auditCrudEl.querySelector("#btn-sop-audit-new")?.addEventListener("click", () => {
      if (!canCreate) {
        toast("Akses ditolak: Anda tidak berwenang menjadwalkan audit SOP.", "warning");
        return;
      }
      openAuditEditor(null, () => auditCrud?.reload());
    });
  }

  /* -------------------------------------------------------------------
   * EDITOR AUDIT (HEADER + CHECKLIST + TEMUAN)
   * ----------------------------------------------------------------- */
  function openAuditEditor(audit, reload) {
    let items = normalizeChecklist(audit?.checklist || []);
    let model = { ...(audit || {}) };

    openModal({
      title: audit ? `Audit SOP — ${audit.divisi || ""} ${audit.periode || ""}` : "Buat Sesi Audit SOP Baru",
      size: "full",
      bodyHtml: `
        <div class="space-y-4 text-left text-xs">
          <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-3">
            <h4 class="font-black text-slate-800 text-sm">Identitas Audit</h4>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block font-bold text-slate-600 mb-1">Nomor Audit</label>
                <input id="aud-nomor" type="text" value="${escapeHtml(model.nomor_audit || "")}" placeholder="AUDSOP/2026/001" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
              </div>
              <div>
                <label class="block font-bold text-slate-600 mb-1">Divisi <span class="text-rose-500">*</span></label>
                <select id="aud-divisi" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white font-bold">
                  ${SOP_DIVISIONS.map(d => `<option value="${d}" ${String(model.divisi || "").toUpperCase() === d ? "selected" : ""}>${d}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-600 mb-1">Periode</label>
                <input id="aud-periode" type="text" value="${escapeHtml(model.periode || "")}" placeholder="Contoh: Q1 2026" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
              </div>
              <div>
                <label class="block font-bold text-slate-600 mb-1">Tanggal Audit</label>
                <input id="aud-tanggal" type="date" value="${escapeHtml(localDateStr(model.tanggal) || "")}" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
              </div>
              <div>
                <label class="block font-bold text-slate-600 mb-1">Auditor</label>
                <input id="aud-auditor" type="text" value="${escapeHtml(model.auditor || "")}" placeholder="Nama auditor / tim" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
              </div>
              <div>
                <label class="block font-bold text-slate-600 mb-1">Status</label>
                <select id="aud-status" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
                  ${AUDIT_STATUSES.map(s => `<option value="${s}" ${model.status === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
              </div>
              <div class="md:col-span-2">
                <label class="block font-bold text-slate-600 mb-1">Ruang Lingkup Audit</label>
                <input id="aud-lingkup" type="text" value="${escapeHtml(model.ruang_lingkup || "")}" placeholder="Contoh: Proses penjualan, penagihan, dan distribusi gimmick" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white">
            <div>
              <p class="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Skor Kepatuhan Sementara</p>
              <p class="text-xl font-black"><span id="aud-live-score">0.00</span> <span class="text-xs text-slate-300">/ 100</span></p>
            </div>
            <div class="flex items-center gap-2">
              <span id="aud-live-grade" class="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 font-bold text-xs">Grade -</span>
              <button id="btn-aud-standard" class="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs">Muat Checklist Standar</button>
              <button id="btn-aud-add-item" class="px-3 py-2 rounded-lg bg-white text-slate-900 font-bold text-xs">+ Tambah Item</button>
            </div>
          </div>

          <div id="aud-items" class="space-y-3 max-h-[52vh] overflow-y-auto pr-1"></div>

          <div>
            <label class="block font-bold text-slate-600 mb-1">Catatan / Ringkasan Audit</label>
            <textarea id="aud-catatan" rows="2" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">${escapeHtml(model.catatan || "")}</textarea>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full">
          <p class="text-[11px] text-slate-400">Skor dihitung otomatis dari bobot dan skor tiap item (0-4).</p>
          <div class="flex items-center gap-2">
            <button id="btn-aud-cancel" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
            <button id="btn-aud-save" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl shadow">Simpan Audit</button>
          </div>
        </div>
      `,
      onMount: (m) => {
        const listEl = m.querySelector("#aud-items");
        const scoreEl = m.querySelector("#aud-live-score");
        const gradeEl = m.querySelector("#aud-live-grade");

        function refreshScore() {
          const score = computeAuditScore(items);
          const grade = gradeAudit(score);
          if (scoreEl) scoreEl.textContent = score.toFixed(2);
          if (gradeEl) gradeEl.textContent = `Grade ${grade.grade} - ${grade.label}`;
        }

        function renderItems() {
          if (!items.length) {
            listEl.innerHTML = `<div class="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Belum ada item checklist. Klik <b>Muat Checklist Standar</b> atau <b>Tambah Item</b>.</div>`;
            refreshScore();
            return;
          }

          listEl.innerHTML = items.map((item, index) => `
            <div class="p-3 bg-white border border-slate-200 rounded-2xl space-y-2 shadow-2xs">
              <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span class="font-black text-slate-700 text-xs">Item ${index + 1}</span>
                <button type="button" data-aud-del="${index}" class="px-2 py-1 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50">Hapus</button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-12 gap-2">
                <div class="md:col-span-3">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Klausul / Aspek</label>
                  <input data-aud-field="klausul" data-aud-index="${index}" type="text" value="${escapeHtml(item.klausul)}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white" placeholder="Contoh: Dokumentasi">
                </div>
                <div class="md:col-span-5">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Standar / Kriteria</label>
                  <input data-aud-field="standar" data-aud-index="${index}" type="text" value="${escapeHtml(item.standar)}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white" placeholder="Kriteria yang harus dipenuhi">
                </div>
                <div class="md:col-span-1">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Bobot</label>
                  <input data-aud-field="bobot" data-aud-index="${index}" type="number" min="0" step="1" value="${item.bobot}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white">
                </div>
                <div class="md:col-span-1">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Skor 0-4</label>
                  <select data-aud-field="skor" data-aud-index="${index}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white font-bold">
                    ${[0, 1, 2, 3, 4].map(v => `<option value="${v}" ${Number(item.skor) === v ? "selected" : ""}>${v}</option>`).join("")}
                  </select>
                </div>
                <div class="md:col-span-2">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Severity</label>
                  <select data-aud-field="severity" data-aud-index="${index}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white">
                    ${FINDING_SEVERITIES.map(v => `<option value="${v}" ${item.severity === v ? "selected" : ""}>${v}</option>`).join("")}
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-12 gap-2">
                <div class="md:col-span-5">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Temuan / Ketidaksesuaian</label>
                  <textarea data-aud-field="temuan" data-aud-index="${index}" rows="2" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white" placeholder="Uraian temuan audit">${escapeHtml(item.temuan)}</textarea>
                </div>
                <div class="md:col-span-4">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Rencana Tindak Lanjut</label>
                  <textarea data-aud-field="tindak_lanjut" data-aud-index="${index}" rows="2" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white" placeholder="Perbaikan yang akan dilakukan">${escapeHtml(item.tindak_lanjut)}</textarea>
                </div>
                <div class="md:col-span-2">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">PIC</label>
                  <input data-aud-field="pic" data-aud-index="${index}" type="text" value="${escapeHtml(item.pic)}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5 mt-1">Deadline</label>
                  <input data-aud-field="deadline" data-aud-index="${index}" type="date" value="${escapeHtml(localDateStr(item.deadline) || "")}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white">
                </div>
                <div class="md:col-span-1">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Status TL</label>
                  <select data-aud-field="status_tindak_lanjut" data-aud-index="${index}" class="w-full p-1.5 rounded-lg border border-slate-300 outline-none bg-white">
                    ${FOLLOW_UP_STATUSES.map(v => `<option value="${v}" ${item.status_tindak_lanjut === v ? "selected" : ""}>${v}</option>`).join("")}
                  </select>
                </div>
              </div>
            </div>
          `).join("");

          listEl.querySelectorAll("[data-aud-field]").forEach(el => {
            const index = Number(el.dataset.audIndex);
            const field = el.dataset.audField;
            const isSelect = el.tagName === "SELECT" || el.type === "date";
            el.addEventListener(isSelect ? "change" : "input", () => {
              let value = el.value;
              if (field === "bobot" || field === "skor") value = Number(value) || 0;
              items[index][field] = value;
              refreshScore();
            });
          });

          listEl.querySelectorAll("[data-aud-del]").forEach(btn => {
            btn.onclick = () => {
              items.splice(Number(btn.dataset.audDel), 1);
              renderItems();
            };
          });

          refreshScore();
        }

        m.querySelector("#btn-aud-add-item").onclick = () => {
          items.push({
            id: `chk_${items.length + 1}`,
            klausul: "",
            standar: "",
            bobot: 1,
            skor: 0,
            temuan: "",
            severity: "Observasi",
            tindak_lanjut: "",
            pic: "",
            deadline: "",
            status_tindak_lanjut: "Open"
          });
          renderItems();
        };

        m.querySelector("#btn-aud-standard").onclick = () => {
          const divisi = m.querySelector("#aud-divisi")?.value || "HRD";
          if (items.length && !confirm("Ganti checklist saat ini dengan checklist standar divisi?")) return;
          items = standardChecklistFor(divisi);
          renderItems();
        };

        m.querySelector("#aud-divisi").onchange = () => {
          if (!items.length) items = standardChecklistFor(m.querySelector("#aud-divisi").value);
          renderItems();
        };

        m.querySelector("#btn-aud-cancel").onclick = closeModal;
        m.querySelector("#btn-aud-save").onclick = async () => {
          const btn = m.querySelector("#btn-aud-save");
          btn.disabled = true;
          btn.textContent = "Menyimpan...";
          try {
            const header = {
              nomor_audit: m.querySelector("#aud-nomor").value.trim(),
              divisi: m.querySelector("#aud-divisi").value,
              periode: m.querySelector("#aud-periode").value.trim(),
              tanggal: m.querySelector("#aud-tanggal").value,
              auditor: m.querySelector("#aud-auditor").value.trim(),
              status: m.querySelector("#aud-status").value,
              ruang_lingkup: m.querySelector("#aud-lingkup").value.trim(),
              catatan: m.querySelector("#aud-catatan").value.trim()
            };
            if (!header.divisi) {
              toast("Divisi audit wajib dipilih.", "warning");
              return;
            }
            const checklist = normalizeChecklist(items);
            const score = computeAuditScore(checklist);
            const grade = gradeAudit(score);
            const payload = {
              ...header,
              nomor_audit: header.nomor_audit || `AUDSOP/${header.divisi}/${new Date().getFullYear()}/${localDateStr(header.tanggal || new Date()).replace(/-/g, "").slice(4)}`,
              checklist,
              skor: score,
              grade: grade.grade,
              grade_label: grade.label,
              jumlah_temuan: checklist.filter(item => item.skor < SCORE_MAX || item.temuan).length,
              open_temuan: checklist.filter(item => item.status_tindak_lanjut !== "Selesai").length,
              updated_at: new Date().toISOString()
            };
            if (audit?.id) {
              await fsUpdate(COL.SOP_AUDIT, audit.id, payload);
            } else {
              payload.created_at = payload.updated_at;
              await fsAdd(COL.SOP_AUDIT, payload, genId("AUDSOP"));
            }
            toast("Audit SOP berhasil disimpan.", "success");
            closeModal();
            if (typeof reload === "function") await reload();
          } catch (e) {
            console.error(e);
            toast("Gagal menyimpan audit: " + (e.message || e), "error");
            btn.disabled = false;
            btn.textContent = "Simpan Audit";
          }
        };

        renderItems();
      }
    });
  }

  function buildAuditReportBody(audit) {
    const summary = summarizeAudits([audit]).audits[0];
    const rows = summary.checklist.map((item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td><b>${escapeHtml(item.klausul || "-")}</b><br/>${escapeHtml(item.standar || "")}</td>
        <td class="center">${item.bobot}</td>
        <td class="center">${item.skor}</td>
        <td>${escapeHtml(item.temuan || "-")}</td>
        <td class="center">${escapeHtml(item.severity)}</td>
        <td>${escapeHtml(item.tindak_lanjut || "-")}<br/><span class="small">PIC: ${escapeHtml(item.pic || "-")} | Deadline: ${escapeHtml(item.deadline || "-")}</span></td>
        <td class="center">${escapeHtml(item.status_tindak_lanjut)}</td>
      </tr>`).join("");

    return `
      ${isoDocHeaderTable({
        judul: "LAPORAN AUDIT KEPATUHAN SOP",
        noDok: summary.nomor_audit || summary.id || "-",
        terbitRevisi: "1/1",
        tglTerbit: formatTanggalIndo(summary.tanggal),
        hal: "1 dari 1"
      })}
      <table class="meta" style="margin-top:8px;">
        <tr><td class="label">DIVISI DIAUDIT</td><td>${escapeHtml(summary.divisi || "-")}</td><td class="label">PERIODE</td><td>${escapeHtml(summary.periode || "-")}</td></tr>
        <tr><td class="label">TANGGAL AUDIT</td><td>${escapeHtml(formatTanggalIndo(summary.tanggal))}</td><td class="label">AUDITOR</td><td>${escapeHtml(summary.auditor || "-")}</td></tr>
        <tr><td class="label">RUANG LINGKUP</td><td colspan="3">${escapeHtml(summary.ruang_lingkup || "-")}</td></tr>
        <tr><td class="label">STATUS</td><td>${escapeHtml(summary.status || "-")}</td><td class="label">TOTAL ITEM</td><td>${summary.totalItems} item</td></tr>
      </table>

      <div class="score-box">
        <div class="box"><span class="small">SKOR KEPATUHAN</span><b>${summary.skor.toFixed(2)}</b><span class="small">dari 100</span></div>
        <div class="box"><span class="small">GRADE</span><b>${escapeHtml(summary.grade)}</b><span class="small">${escapeHtml(summary.gradeLabel)}</span></div>
        <div class="box"><span class="small">TEMUAN</span><b>${summary.findings}</b><span class="small">${summary.openFindings} masih terbuka</span></div>
      </div>

      <h3>Rincian Checklist & Temuan</h3>
      <table class="grid">
        <thead>
          <tr>
            <th class="center" style="width:26px;">No</th>
            <th>Klausul & Standar</th>
            <th class="center" style="width:38px;">Bobot</th>
            <th class="center" style="width:38px;">Skor</th>
            <th>Temuan</th>
            <th class="center" style="width:62px;">Severity</th>
            <th>Tindak Lanjut</th>
            <th class="center" style="width:58px;">Status</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="8" class="center muted">Belum ada item checklist.</td></tr>`}</tbody>
      </table>

      <h3>Catatan Audit</h3>
      <p>${escapeHtml(summary.catatan || "-")}</p>

      <div class="pengesahan">
        <table class="sign">
          <tr>
            <td style="width:33.33%;"><b>Auditor</b><div class="ttd-space"></div><u>${escapeHtml(summary.auditor || "( ................... )")}</u><div class="small">Tanggal: ${escapeHtml(formatTanggalIndo(summary.tanggal))}</div></td>
            <td style="width:33.33%;"><b>Kepala Divisi / Auditee</b><div class="ttd-space"></div><u>( .................................. )</u><div class="small">Divisi ${escapeHtml(summary.divisi || "-")}</div></td>
            <td style="width:33.33%;"><b>Mengetahui, HRD / Management</b><div class="ttd-space"></div><u>( .................................. )</u><div class="small">${escapeHtml(COMPANY_NAME)}</div></td>
          </tr>
        </table>
      </div>
    `;
  }

  function printAuditReport(audit) {
    if (!audit) return;
    openPrintWindow(wrapPrintDocument(`Laporan Audit SOP - ${audit.divisi || ""}`, buildAuditReportBody(audit)));
  }

  /* -------------------------------------------------------------------
   * TAB 3 — DOKUMEN & FLOWCHART
   * ----------------------------------------------------------------- */
  async function renderGenerator(preselectedId = "") {
    await loadSopCache();
    generatorState.sops = sopCache.slice().sort((a, b) =>
      String(sopLabel(a)).localeCompare(String(sopLabel(b)), "id"));
    generatorState.sopId = preselectedId || generatorState.sopId || generatorState.sops[0]?.id || "";

    const [canGenerate, canExport] = await Promise.all([
      hasPermission("sop.flowchart.generate", session),
      hasPermission("sop.document.export", session)
    ]);

    const options = generatorState.sops.map(sop =>
      `<option value="${escapeHtml(sop.id)}">${escapeHtml(sopLabel(sop))} [${escapeHtml(sop.divisi || "ALL")}]</option>`
    ).join("");

    panelGenerator.innerHTML = `
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div class="space-y-4">
          <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
            <div>
              <label class="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Pilih Prosedur SOP</label>
              <select id="sop-gen-select" class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none bg-white focus:border-emerald-500">
                ${options || `<option value="">Belum ada SOP</option>`}
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Mode Tampilan</label>
              <div class="grid grid-cols-3 p-1 bg-slate-100 rounded-xl text-[11px] font-bold text-center">
                <button data-sop-mode="VISUAL" class="sop-mode-btn py-1.5 rounded-lg bg-white text-emerald-800 shadow-xs">Diagram</button>
                <button data-sop-mode="MERMAID" class="sop-mode-btn py-1.5 rounded-lg text-slate-600 hover:text-slate-900">Mermaid</button>
                <button data-sop-mode="DOC" class="sop-mode-btn py-1.5 rounded-lg text-slate-600 hover:text-slate-900">Dokumen</button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1">
              <button id="btn-sop-edit-steps" class="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5">${icon("edit", "w-3.5 h-3.5")}Atur Langkah</button>
              <button id="btn-sop-print" class="px-3 py-2 rounded-lg bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold flex items-center justify-center gap-1.5">${icon("printer", "w-3.5 h-3.5")}Cetak / PDF</button>
              <button id="btn-sop-copy" class="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold">Salin Mermaid</button>
              <button id="btn-sop-download" class="px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold">Unduh SVG</button>
              <button id="btn-sop-download-png" class="px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold">Unduh PNG</button>
              <button id="btn-sop-drawio" class="col-span-2 px-3 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold">Buka di Draw.io</button>
            </div>

            <div class="p-3 bg-slate-900 rounded-xl text-[10px] text-slate-300 font-medium space-y-1.5">
              <p class="font-bold text-emerald-400 uppercase tracking-wider">Kategori Node</p>
              <div class="flex flex-wrap gap-1.5">
                <span class="px-2 py-0.5 rounded bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 font-bold">START</span>
                <span class="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold">PROCESS</span>
                <span class="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-amber-300 font-bold">DECISION</span>
                <span class="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-bold">DOKUMEN</span>
                <span class="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/50 text-rose-300 font-bold">END</span>
              </div>
            </div>
          </div>

          <div id="sop-gen-meta" class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs text-xs space-y-2"></div>
        </div>

        <div class="xl:col-span-2 bg-slate-950 rounded-2xl border border-slate-800 text-white min-h-[560px] p-4 overflow-auto shadow-inner" id="sop-render-box"></div>
      </div>
    `;

    const select = panelGenerator.querySelector("#sop-gen-select");
    const modeButtons = panelGenerator.querySelectorAll(".sop-mode-btn");
    const box = panelGenerator.querySelector("#sop-render-box");

    select?.addEventListener("change", () => {
      generatorState.sopId = select.value;
      refreshGenerator();
    });

    const applyModeStyles = () => {
      modeButtons.forEach(b => {
        const active = b.dataset.sopMode === generatorState.mode;
        b.classList.toggle("bg-white", active);
        b.classList.toggle("text-emerald-800", active);
        b.classList.toggle("shadow-xs", active);
        b.classList.toggle("text-slate-600", !active);
      });
    };
    applyModeStyles();

    modeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        generatorState.mode = btn.dataset.sopMode;
        applyModeStyles();
        renderGeneratorMode();
      });
    });

    panelGenerator.querySelector("#btn-sop-edit-steps").onclick = () => {
      if (!canGenerate) return toast("Akses ditolak: Anda tidak berwenang mengatur flowchart SOP.", "warning");
      if (!generatorState.current) return toast("Pilih SOP terlebih dahulu.", "warning");
      openStepEditor(generatorState.current, generatorState.steps, async (updatedSteps) => {
        try {
          await fsUpdate(COL.SOP_DOKUMEN, generatorState.current.id, {
            flowchart_steps: updatedSteps,
            updated_at: new Date().toISOString()
          });
          toast("Langkah SOP berhasil disimpan dan diagram diperbarui.", "success");
          await loadSopCache();
          generatorState.svg = "";
          refreshGenerator();
        } catch (e) {
          toast("Gagal menyimpan langkah SOP: " + (e.message || e), "error");
        }
      });
    };

    panelGenerator.querySelector("#btn-sop-print").onclick = () => {
      if (!canExport) return toast("Akses ditolak: Anda tidak berwenang mencetak dokumen SOP.", "warning");
      printCurrentSop();
    };

    panelGenerator.querySelector("#btn-sop-copy").onclick = async () => {
      if (!canGenerate) return toast("Akses ditolak: Anda tidak berwenang menyalin flowchart SOP.", "warning");
      if (!generatorState.code) return toast("Belum ada kode Mermaid.", "warning");
      try {
        await navigator.clipboard.writeText(generatorState.code);
        toast("Kode Mermaid berhasil disalin.", "success");
      } catch {
        toast("Browser menolak akses clipboard.", "warning");
      }
    };

    panelGenerator.querySelector("#btn-sop-download").onclick = () => {
      if (!canExport) return toast("Akses ditolak: Anda tidak berwenang mengunduh diagram SOP.", "warning");
      if (!generatorState.current) return;
      if (!generatorState.svg) {
        const blob = new Blob([generatorState.code], { type: "text/plain;charset=utf-8" });
        downloadBlob(blob, `flowchart-${generatorState.current.id}.mmd`);
        toast("SVG belum siap, kode Mermaid diunduh sebagai gantinya.", "info");
        return;
      }
      downloadBlob(new Blob([generatorState.svg], { type: "image/svg+xml;charset=utf-8" }), `flowchart-${generatorState.current.id}.svg`);
      toast("Flowchart SVG berhasil diunduh.", "success");
    };

    panelGenerator.querySelector("#btn-sop-download-png").onclick = async () => {
      if (!canExport) return toast("Akses ditolak: Anda tidak berwenang mengunduh diagram SOP.", "warning");
      if (!generatorState.current) return;
      try {
        if (!generatorState.svg) {
          generatorState.svg = safeSvg(await ensureDiagramSvg(generatorState.code));
        }
        if (!generatorState.svg) throw new Error("Diagram belum tersedia");
        const png = await svgToPngBlob(generatorState.svg);
        downloadBlob(png, `flowchart-${generatorState.current.id}.png`);
        toast("Flowchart PNG berhasil diunduh.", "success");
      } catch (e) {
        toast("Gagal mengunduh PNG: " + (e.message || e), "error");
      }
    };

    panelGenerator.querySelector("#btn-sop-drawio").onclick = async () => {
      if (!canGenerate) return toast("Akses ditolak: Anda tidak berwenang menyalin flowchart SOP.", "warning");
      try { await navigator.clipboard.writeText(generatorState.code); } catch { /* abaikan */ }
      toast("Kode Mermaid disalin. Di Draw.io: Insert > Advanced > Mermaid.", "info");
      window.open("https://app.diagrams.net/", "_blank");
    };

    refreshGenerator();
  }

  function refreshGenerator() {
    const sop = generatorState.sops.find(item => item.id === generatorState.sopId) || null;
    generatorState.current = sop;
    generatorState.steps = sop ? resolveSteps(sop) : [];
    generatorState.code = sop ? buildMermaidCode(sop, generatorState.steps) : "";
    generatorState.svg = "";

    const metaEl = panelGenerator.querySelector("#sop-gen-meta");
    if (metaEl) {
      if (!sop) {
        metaEl.innerHTML = `<p class="text-slate-400">Belum ada SOP. Buat SOP pada tab Database SOP.</p>`;
      } else {
        const due = isSopReviewDue(sop);
        metaEl.innerHTML = `
          <div class="flex items-center justify-between gap-2">
            <span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] uppercase">${escapeHtml(sop.divisi || "ALL")}</span>
            ${badge(sop.status || "Draft", statusTone(sop.status))}
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Nomor Dokumen</p>
            <p class="font-mono font-bold text-slate-800">${escapeHtml(formatSopNumber(sop))}</p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Versi</p>
              <p class="font-bold text-slate-700">${escapeHtml(sop.versi || "1.0")}</p>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Jumlah Langkah</p>
              <p class="font-bold text-slate-700">${generatorState.steps.length} langkah</p>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Terbit</p>
              <p class="font-semibold text-slate-600">${escapeHtml(formatTanggalIndo(sop.tanggal_terbit))}</p>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Review</p>
              <p class="font-semibold ${due ? "text-amber-700" : "text-slate-600"}">${escapeHtml(formatTanggalIndo(sop.tanggal_review))}</p>
            </div>
          </div>
          ${due ? `<p class="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px]">SOP ini mendekati / melewati jadwal review.</p>` : ""}
        `;
      }
    }

    renderGeneratorMode();
  }

  function renderGeneratorMode() {
    const box = panelGenerator.querySelector("#sop-render-box");
    if (!box) return;
    const sop = generatorState.current;
    if (!sop) {
      box.innerHTML = emptyState("Belum ada SOP terdaftar", "Buat SOP terlebih dahulu pada tab Database SOP.");
      box.classList.remove("bg-slate-950");
      box.classList.add("bg-white");
      return;
    }
    box.classList.add("bg-slate-950");
    box.classList.remove("bg-white");

    if (generatorState.mode === "MERMAID") {
      renderMermaidCodeMode(box);
    } else if (generatorState.mode === "DOC") {
      renderDocumentMode(box);
    } else {
      renderVisualMode(box);
    }
  }

  async function renderVisualMode(box) {
    const token = ++generatorState.requestToken;
    box.innerHTML = loadingBlock("Merender diagram Mermaid...", "Mencoba Kroki.io, lalu mermaid.js lokal.");
    const svg = await ensureDiagramSvg(generatorState.code);
    if (token !== generatorState.requestToken) return;

    generatorState.svg = safeSvg(svg);
    if (generatorState.svg) {
      box.innerHTML = `
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div>
              <span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">Flowchart Otomatis</span>
              <h3 class="text-base font-black text-white mt-1">${escapeHtml(sopLabel(generatorState.current))}</h3>
            </div>
            <span class="text-[11px] text-slate-400">${generatorState.steps.length} langkah</span>
          </div>
          <div class="p-4 bg-slate-900 rounded-xl border border-slate-800 flex justify-center overflow-auto">
            <div class="w-full max-w-full flex justify-center">${generatorState.svg}</div>
          </div>
        </div>`;
    } else {
      renderHtmlFallbackDiagram(box);
    }
  }

  function renderHtmlFallbackDiagram(box) {
    const steps = generatorState.steps;
    let html = `
      <div class="max-w-3xl mx-auto space-y-4 text-left">
        <div class="text-center pb-3 border-b border-slate-800">
          <span class="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">Diagram Fallback (tanpa layanan eksternal)</span>
          <h3 class="text-base font-black text-white mt-2">${escapeHtml(sopLabel(generatorState.current))}</h3>
        </div>`;

    steps.forEach((step, index) => {
      const cat = String(step.category || "PROCESS").toUpperCase();
      const tone = cat === "START" ? "border-emerald-500/60 bg-emerald-950/70 text-emerald-200"
        : cat === "END" ? "border-rose-500/60 bg-rose-950/70 text-rose-200"
        : cat === "DECISION" ? "border-amber-500/60 bg-amber-950/70 text-amber-200"
        : cat === "DOKUMEN" ? "border-cyan-500/60 bg-cyan-950/70 text-cyan-200"
        : "border-slate-700 bg-slate-800/80 text-slate-100";
      html += `
        <div class="flex flex-col items-center">
          <div class="w-full border ${tone} rounded-xl p-3">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-[10px] font-extrabold uppercase tracking-wide">${escapeHtml(cat)} - Langkah ${index + 1}</span>
              <span class="text-[10px] font-semibold opacity-80">${escapeHtml(step.actor || "")}</span>
            </div>
            <p class="text-xs font-bold">${escapeHtml(step.nama_aktivitas || "")}</p>
            ${step.detail_proses ? `<p class="text-[11px] opacity-80 mt-0.5">${escapeHtml(step.detail_proses)}</p>` : ""}
          </div>
          ${index < steps.length - 1 ? `<div class="text-slate-500 text-xs font-bold my-0.5">v</div>` : ""}
        </div>`;
    });

    html += `</div>`;
    box.innerHTML = html;
  }

  function renderMermaidCodeMode(box) {
    box.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <span class="text-xs font-bold text-emerald-400">Kode Bahasa Mermaid (bisa ditempel ke Kroki / Draw.io)</span>
          <button id="btn-sop-copy-inner" class="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs">Salin Kode</button>
        </div>
        <textarea readonly class="w-full h-[430px] p-4 bg-slate-900 text-emerald-300 rounded-xl font-mono text-[11px] border border-slate-800 outline-none leading-relaxed resize-none">${escapeHtml(generatorState.code)}</textarea>
      </div>`;
    box.querySelector("#btn-sop-copy-inner").onclick = async () => {
      try {
        await navigator.clipboard.writeText(generatorState.code);
        toast("Kode Mermaid berhasil disalin.", "success");
      } catch {
        toast("Browser menolak akses clipboard.", "warning");
      }
    };
  }

  async function renderDocumentMode(box) {
    const token = ++generatorState.requestToken;
    box.innerHTML = loadingBlock("Menyiapkan dokumen SOP...", "Menyusun kop, metadata, alur proses, dan flowchart.");
    if (!generatorState.svg) {
      generatorState.svg = safeSvg(await ensureDiagramSvg(generatorState.code));
    }
    if (token !== generatorState.requestToken) return;
    const body = buildSopDocumentBody(generatorState.current, generatorState.steps, generatorState.svg);
    box.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <span class="text-xs font-bold text-emerald-400">Pratinjau Dokumen SOP Resmi</span>
          <span class="text-[11px] text-slate-400">Gunakan tombol Cetak / PDF untuk mengunduh</span>
        </div>
        <div class="bg-white text-slate-900 rounded-xl p-6 max-h-[68vh] overflow-auto shadow-2xl">${body}</div>
      </div>`;
  }

  async function printCurrentSop() {
    const sop = generatorState.current;
    if (!sop) return toast("Pilih SOP terlebih dahulu.", "warning");
    const win = openPrintPlaceholder();
    if (!win) return;
    let svg = generatorState.svg;
    if (!svg) svg = safeSvg(await ensureDiagramSvg(generatorState.code));
    writePrintWindow(win, wrapPrintDocument(`Dokumen SOP - ${sopLabel(sop)}`, buildSopDocumentBody(sop, generatorState.steps, svg)));
  }

  async function printSopDocument(sop) {
    const win = openPrintPlaceholder();
    if (!win) return;
    const steps = resolveSteps(sop);
    const code = buildMermaidCode(sop, steps);
    const svg = safeSvg(await ensureDiagramSvg(code));
    writePrintWindow(win, wrapPrintDocument(`Dokumen SOP - ${sopLabel(sop)}`, buildSopDocumentBody(sop, steps, svg)));
  }

  function buildSopDocumentBody(sop, steps, svg) {
    const stepRows = steps.map((step, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="center"><b>${escapeHtml(step.category || "PROCESS")}</b></td>
        <td>${escapeHtml(step.actor || "-")}</td>
        <td><b>${escapeHtml(step.nama_aktivitas || "")}</b>${step.detail_proses ? `<br/><span class="small">${escapeHtml(step.detail_proses)}</span>` : ""}</td>
      </tr>`).join("");

    const decisionNotes = steps
      .filter(step => step.category === "DECISION")
      .map((step, index) => `<li><b>${escapeHtml(step.nama_aktivitas)}</b> - Ya: ${escapeHtml(step.decision_yes || DEFAULT_DECISION_YES)}; Tidak: ${escapeHtml(step.decision_no || DEFAULT_DECISION_NO)}</li>`)
      .join("");

    return `
      ${isoDocHeaderTable({
        judul: "PROSEDUR OPERASIONAL STANDAR (SOP)",
        noDok: formatSopNumber(sop),
        terbitRevisi: `${sop.versi || "1.0"} / ${sop.status || "Draft"}`,
        tglTerbit: formatTanggalIndo(sop.tanggal_terbit),
        hal: "1 dari 1"
      })}

      <table class="meta" style="margin-top:8px;">
        <tr>
          <td class="label">JUDUL PROSEDUR</td>
          <td colspan="3"><b>${escapeHtml(sop.judul || "-")}</b></td>
        </tr>
        <tr>
          <td class="label">DIVISI / DEPARTEMEN</td>
          <td>${escapeHtml(sop.divisi || "ALL")}</td>
          <td class="label">KATEGORI</td>
          <td>${escapeHtml(sop.kategori || "Prosedur Operasional")}</td>
        </tr>
        <tr>
          <td class="label">RUANG LINGKUP</td>
          <td>${escapeHtml(sop.ruang_lingkup || "Seluruh unit terkait di lingkungan perusahaan")}</td>
          <td class="label">REVIEW BERIKUTNYA</td>
          <td>${escapeHtml(formatTanggalIndo(sop.tanggal_review))}</td>
        </tr>
        <tr>
          <td class="label">DISUSUN OLEH</td>
          <td>${escapeHtml(sop.pembuat || "-")}</td>
          <td class="label">DISETUJUI OLEH</td>
          <td>${escapeHtml(sop.penyetuju || "-")}</td>
        </tr>
      </table>

      <h3>1. Tujuan</h3>
      <p>${escapeHtml(sop.tujuan || `Menjadi acuan kerja resmi dalam melaksanakan ${sop.judul || "prosedur"} di ${COMPANY_NAME}.`)}</p>

      <h3>2. Dasar Hukum & Kebijakan</h3>
      <p>${escapeHtml(sop.dasar_hukum || "Peraturan Perusahaan dan kebijakan operasional yang berlaku.")}</p>

      <h3>3. Definisi / Istilah</h3>
      <p>${escapeHtml(sop.definisi || "-")}</p>

      <h3>4. Alur Proses & Pelaksana</h3>
      <table class="grid">
        <thead>
          <tr>
            <th class="center" style="width:30px;">No</th>
            <th class="center" style="width:72px;">Kategori</th>
            <th style="width:120px;">Pelaksana</th>
            <th>Nama Aktivitas & Detail Prosedur</th>
          </tr>
        </thead>
        <tbody>${stepRows || `<tr><td colspan="4" class="center muted">Belum ada langkah prosedur.</td></tr>`}</tbody>
      </table>
      ${decisionNotes ? `<div class="small" style="margin-top:5px;">Percabangan keputusan:<ul style="margin:3px 0 0 16px;padding:0;">${decisionNotes}</ul></div>` : ""}

      <h3>5. Flowchart Prosedur</h3>
      ${svg
        ? `<div class="diagram">${svg}</div>`
        : `<p class="muted">Diagram belum dapat dirender saat dokumen dibuat. Buka menu Dokumen &amp; Flowchart untuk mencetak ulang.</p>`}

      <h3>6. Referensi & Dokumen Terkait</h3>
      <p>${escapeHtml(sop.referensi || "-")}</p>
      ${sop.file_url ? `<p class="small">Lampiran: ${escapeHtml(sop.file_url)}</p>` : ""}

      <div class="pengesahan">
        <h3 style="text-align:center;border-bottom:none;">7. Pengesahan</h3>
        <p class="small" style="text-align:right;margin-bottom:4px;">Cirebon, ${escapeHtml(formatTanggalIndo(sop.tanggal_terbit || new Date()))}</p>
        <table class="sign">
          <tr>
            <td style="width:33.33%;"><b>Dibuat Oleh,</b><div class="ttd-space"></div><u>${escapeHtml(sop.pembuat || "( ................... )")}</u><div class="small">Staf / HRD Specialist</div></td>
            <td style="width:33.33%;"><b>Ditinjau Oleh,</b><div class="ttd-space"></div><u>( .................................. )</u><div class="small">HRD &amp; Finance Manager</div></td>
            <td style="width:33.33%;"><b>Disetujui Oleh,</b><div class="ttd-space"></div><u>${escapeHtml(sop.penyetuju || "( ................... )")}</u><div class="small">Direktur Operasional</div></td>
          </tr>
        </table>
        <p class="small" style="margin-top:6px;">${escapeHtml(COMPANY_NAME)} - ${escapeHtml(COMPANY_ADDRESS_LINE1)}</p>
      </div>
    `;
  }

  function loadingBlock(title, subtitle) {
    return `
      <div class="flex flex-col items-center justify-center min-h-[460px] text-center space-y-3">
        <div class="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs font-bold text-emerald-400">${escapeHtml(title)}</p>
        <p class="text-[11px] text-slate-400">${escapeHtml(subtitle || "")}</p>
      </div>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Konversi SVG hasil render flowchart menjadi PNG (latar putih, 2x). */
  function svgToPngBlob(svgText, scale = 2) {
    return new Promise((resolve, reject) => {
      const source = String(svgText || "");
      if (!/<svg[\s>]/i.test(source)) {
        reject(new Error("SVG tidak valid"));
        return;
      }
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          const viewBox = /viewBox="([^"]+)"/i.exec(source);
          let width = img.naturalWidth;
          let height = img.naturalHeight;
          if ((!width || !height) && viewBox) {
            const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              width = parts[2];
              height = parts[3];
            }
          }
          width = Math.max(320, Math.round(width || 1200));
          height = Math.max(240, Math.round(height || 800));

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas tidak didukung browser");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(png => {
            URL.revokeObjectURL(url);
            if (png) resolve(png);
            else reject(new Error("Canvas gagal membuat PNG"));
          }, "image/png");
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("SVG tidak dapat dimuat sebagai gambar"));
      };

      img.src = url;
    });
  }

  /* -------------------------------------------------------------------
   * STEP EDITOR (START / PROCESS / DECISION / DOKUMEN / END)
   * ----------------------------------------------------------------- */
  function openStepEditor(sop, existingSteps, onSave) {
    let steps = normalizeSteps(JSON.parse(JSON.stringify(existingSteps || [])));

    openModal({
      title: `Atur Langkah SOP & Kategori — ${sopLabel(sop)}`,
      size: "full",
      bodyHtml: `
        <div class="space-y-4 text-left text-xs">
          <div class="bg-slate-100 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <p class="text-slate-600 font-medium">
              Pilih kategori tiap langkah: <b>START, PROCESS, DECISION, DOKUMEN, END</b>. Diagram Mermaid dibuat otomatis dari urutan ini.
            </p>
            <button id="btn-step-add" class="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition shrink-0">+ Tambah Langkah</button>
          </div>
          <div id="step-editor-list" class="space-y-3 max-h-[62vh] overflow-y-auto pr-1"></div>
        </div>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full">
          <button id="btn-step-cancel" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
          <button id="btn-step-save" class="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow">Generate & Simpan Flowchart</button>
        </div>
      `,
      onMount: (m) => {
        const list = m.querySelector("#step-editor-list");

        function renderList() {
          list.innerHTML = steps.map((step, index) => {
            const category = step.category || "PROCESS";
            return `
              <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div class="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-full bg-slate-900 text-emerald-400 font-extrabold text-xs flex items-center justify-center">${index + 1}</span>
                    <span class="font-extrabold text-slate-800 text-xs">Langkah ${index + 1}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    ${index > 0 ? `<button type="button" data-step-up="${index}" class="px-2 py-1 rounded text-slate-500 hover:bg-slate-200 font-bold text-[11px]">Naik</button>` : ""}
                    ${index < steps.length - 1 ? `<button type="button" data-step-down="${index}" class="px-2 py-1 rounded text-slate-500 hover:bg-slate-200 font-bold text-[11px]">Turun</button>` : ""}
                    <button type="button" data-step-del="${index}" class="px-2 py-1 rounded text-rose-600 hover:bg-rose-100 font-bold text-[11px]">Hapus</button>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div class="md:col-span-3">
                    <label class="block font-bold text-slate-700 mb-1">Kategori <span class="text-rose-500">*</span></label>
                    <select data-step-cat="${index}" class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 font-bold bg-white">
                      ${SOP_STEP_CATEGORIES.map(cat => `<option value="${cat}" ${category === cat ? "selected" : ""}>${cat}</option>`).join("")}
                    </select>
                  </div>
                  <div class="md:col-span-6">
                    <label class="block font-bold text-slate-700 mb-1">Nama Aktivitas / Proses <span class="text-rose-500">*</span></label>
                    <input data-step-name="${index}" type="text" value="${escapeHtml(step.nama_aktivitas || "")}" placeholder="Contoh: Verifikasi berkas karyawan" class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 font-bold bg-white">
                  </div>
                  <div class="md:col-span-3">
                    <label class="block font-bold text-slate-700 mb-1">Pelaksana / PIC</label>
                    <input data-step-actor="${index}" type="text" value="${escapeHtml(step.actor || "")}" placeholder="Contoh: Staf HRD" class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 bg-white">
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-700 mb-1">Detail Proses (Instruksi Kerja)</label>
                  <textarea data-step-detail="${index}" rows="2" class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 bg-white">${escapeHtml(step.detail_proses || "")}</textarea>
                </div>

                ${category === "DECISION" ? `
                  <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label class="block font-bold text-emerald-800 mb-1">Cabang YA / DISETUJUI</label>
                      <input data-step-yes="${index}" type="text" value="${escapeHtml(step.decision_yes || DEFAULT_DECISION_YES)}" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
                    </div>
                    <div>
                      <label class="block font-bold text-rose-800 mb-1">Cabang TIDAK / REVISI</label>
                      <input data-step-no="${index}" type="text" value="${escapeHtml(step.decision_no || DEFAULT_DECISION_NO)}" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
                    </div>
                  </div>` : ""}
              </div>`;
          }).join("");

          list.querySelectorAll("[data-step-cat]").forEach(el => {
            el.onchange = () => {
              const index = Number(el.dataset.stepCat);
              steps[index].category = el.value;
              steps[index].shape = el.value;
              renderList();
            };
          });
          list.querySelectorAll("[data-step-name]").forEach(el => {
            el.oninput = () => { steps[Number(el.dataset.stepName)].nama_aktivitas = el.value; };
          });
          list.querySelectorAll("[data-step-actor]").forEach(el => {
            el.oninput = () => { steps[Number(el.dataset.stepActor)].actor = el.value; };
          });
          list.querySelectorAll("[data-step-detail]").forEach(el => {
            el.oninput = () => { steps[Number(el.dataset.stepDetail)].detail_proses = el.value; };
          });
          list.querySelectorAll("[data-step-yes]").forEach(el => {
            el.oninput = () => { steps[Number(el.dataset.stepYes)].decision_yes = el.value; };
          });
          list.querySelectorAll("[data-step-no]").forEach(el => {
            el.oninput = () => { steps[Number(el.dataset.stepNo)].decision_no = el.value; };
          });
          list.querySelectorAll("[data-step-del]").forEach(btn => {
            btn.onclick = () => { steps.splice(Number(btn.dataset.stepDel), 1); renderList(); };
          });
          list.querySelectorAll("[data-step-up]").forEach(btn => {
            btn.onclick = () => {
              const index = Number(btn.dataset.stepUp);
              [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
              renderList();
            };
          });
          list.querySelectorAll("[data-step-down]").forEach(btn => {
            btn.onclick = () => {
              const index = Number(btn.dataset.stepDown);
              [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]];
              renderList();
            };
          });
        }

        m.querySelector("#btn-step-add").onclick = () => {
          steps.push({
            id: `step_${steps.length + 1}`,
            category: "PROCESS",
            nama_aktivitas: "Aktivitas prosedur baru",
            actor: `Tim ${sop.divisi || "HRD"}`,
            detail_proses: "",
            decision_yes: DEFAULT_DECISION_YES,
            decision_no: DEFAULT_DECISION_NO
          });
          renderList();
        };

        m.querySelector("#btn-step-cancel").onclick = closeModal;
        m.querySelector("#btn-step-save").onclick = () => {
          if (!steps.length) {
            toast("Minimal satu langkah SOP diperlukan.", "warning");
            return;
          }
          const cleaned = normalizeSteps(steps).map((step, index) => ({ ...step, id: `step_${index + 1}` }));
          closeModal();
          if (typeof onSave === "function") onSave(cleaned);
        };

        renderList();
      }
    });
  }

  /* -------------------------------------------------------------------
   * TAB SWITCHING
   * ----------------------------------------------------------------- */
  async function switchTab(tab) {
    panelDatabase.classList.toggle("hidden", tab !== "database");
    panelAudit.classList.toggle("hidden", tab !== "audit");
    panelGenerator.classList.toggle("hidden", tab !== "generator");

    container.querySelectorAll(".sop-tab").forEach(btn => {
      const active = btn.dataset.stab === tab;
      btn.classList.toggle("bg-white", active);
      btn.classList.toggle("text-maroon-700", active);
      btn.classList.toggle("font-bold", active);
      btn.classList.toggle("shadow-sm", active);
      btn.classList.toggle("text-slate-600", !active);
      btn.classList.toggle("font-semibold", !active);
    });

    if (tab === "database" && !loaded.database) {
      loaded.database = true;
      await renderDatabase();
    }
    if (tab === "audit" && !loaded.audit) {
      loaded.audit = true;
      await renderAuditTab();
    }
    if (tab === "generator" && !loaded.generator) {
      loaded.generator = true;
      await renderGenerator();
    }
  }

  async function openGenerator(sopId) {
    generatorState.mode = "VISUAL";
    loaded.generator = true;
    await switchTab("generator");
    if (sopId) generatorState.sopId = sopId;
    await renderGenerator(sopId || generatorState.sopId);
  }

  container.querySelectorAll(".sop-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.stab));
  });

  await switchTab("database");

  return { unmount() {} };
}
