import { COL } from "../firebase-config.js";
import {
  fsGetAll, toast, escapeHtml, fmtDateShort, fmtRupiah, localDateStr
} from "../utils.js";
import { renderCrudModule, icon, badge } from "../components.js";
import { hasPermission, canDeleteModuleData } from "../auth.js";
import { isoDocHeaderTable, COMPANY_NAME, COMPANY_ADDRESS_LINE1 } from "../branding.js";
import {
  PENERIMA_TIPE, ALOKASI_TIPE, PRINCIPLES, DISTRIBUSI_STATUSES, ENGAGEMENT_LEVELS,
  CONSUMED_STATUSES, computeAllocationLedger, computeEffectiveness,
  summarizeEffectiveness, summarizeGimmick, buildReceiptNumber, allocationLabel,
  allocationKey
} from "../gimmick-analytics.mjs";

/* ---------------------------------------------------------------------
 * KONSTANTA & HELPER
 * ------------------------------------------------------------------- */
const KATEGORI_GIMMICK = Object.freeze([
  "Merchandise", "Sample Produk", "Display / POSM", "Voucher", "Hadiah", "Lainnya"
]);

const MASTER_STATUSES = Object.freeze(["Aktif", "Nonaktif"]);

const SATUAN_OPTIONS = Object.freeze(["Pcs", "Box", "Pack", "Lusin", "Set", "Unit", "Rim"]);

function nf(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function nf2(value) {
  return Number(value || 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tanggalIndo(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

function isConsumed(row) {
  return CONSUMED_STATUSES.includes(String(row?.status || "Diterima"));
}

function distributionTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "direalisasikan") return "green";
  if (value === "diterima") return "blue";
  if (value === "diserahkan") return "maroon";
  if (value === "dibatalkan") return "red";
  return "slate";
}

function effectivenessTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "efektif") return "green";
  if (value === "cukup") return "amber";
  if (value === "tidak efektif") return "red";
  return "slate";
}

function stockTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "aman") return "green";
  if (value === "menipis") return "amber";
  if (value === "over alokasi") return "red";
  return "slate";
}

function progressBar(value, max, tone = "emerald") {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
  const tones = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    maroon: "bg-maroon-700"
  };
  return `
    <div class="flex items-center gap-2 min-w-[110px]">
      <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div class="h-full rounded-full ${tones[tone] || tones.emerald}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <span class="text-[10px] font-semibold text-slate-500 shrink-0">${pct.toFixed(0)}%</span>
    </div>`;
}

function summaryCard(label, value, note = "", tone = "slate") {
  const tones = {
    slate: "text-slate-800",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    maroon: "text-maroon-800",
    blue: "text-blue-700"
  };
  return `
    <div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
      <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">${escapeHtml(label)}</p>
      <p class="text-2xl font-black ${tones[tone] || tones.slate} mt-1">${value}</p>
      ${note ? `<p class="text-[11px] text-slate-400">${escapeHtml(note)}</p>` : ""}
    </div>`;
}

function panelTable(title, subtitle, headers, rows, emptyMessage = "Belum ada data") {
  return `
    <div class="bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800">${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
            <tr>${headers.map(h => `<th class="px-3 py-2 text-left">${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${headers.length}" class="px-3 py-6 text-center text-slate-400">${escapeHtml(emptyMessage)}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------
 * CETAK DOKUMEN
 * ------------------------------------------------------------------- */
function printStyles() {
  return `
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 10.5px; line-height: 1.35; }
    .doc { max-width: 100%; }
    h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin: 12px 0 6px; }
    p { margin: 0 0 6px; }
    .muted { color: #64748b; font-style: italic; }
    table.meta, table.grid, table.sign, table.kpi { width: 100%; border-collapse: collapse; }
    table.meta td, table.grid th, table.grid td, table.sign td, table.kpi td, table.kpi th { border: 1px solid #94a3b8; padding: 4px 5px; vertical-align: top; }
    table.meta td.label { background: #e2e8f0; font-weight: bold; width: 24%; }
    table.grid th, table.kpi th { background: #e2e8f0; text-align: left; font-size: 9.5px; text-transform: uppercase; }
    table.grid td.center, table.grid th.center, table.kpi td.center { text-align: center; }
    .small { font-size: 9px; color: #475569; }
    .receipt-copy { page-break-inside: avoid; margin-bottom: 6px; }
    .cut-line { border-top: 1.5px dashed #94a3b8; margin: 7px 0; position: relative; text-align: center; }
    .cut-line span { position: relative; top: -8px; background: #fff; padding: 0 8px; font-size: 8.5px; letter-spacing: .12em; color: #64748b; }
    .copy-label { display: flex; justify-content: space-between; font-size: 9px; font-weight: bold; text-transform: uppercase; margin: 3px 0; }
    .receipt-sign td { height: 66px; text-align: center; vertical-align: top; }
    .ttd-space { height: 34px; }
    .pengesahan { margin-top: 12px; page-break-inside: avoid; }
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

function buildReceiptCopy(dist, copyLabel, copyNo) {
  const item = String(dist.item_nama || "-");
  const qty = Number(dist.qty || 0);
  const satuan = dist.satuan || "Pcs";
  const pemberi = [dist.pemberi_tipe, dist.pemberi_nama].filter(Boolean).join(" - ") || "-";
  const penerima = [dist.penerima_tipe, dist.penerima_nama].filter(Boolean).join(" - ") || "-";

  return `
    <div class="receipt-copy">
      <div class="copy-label">
        <span>${escapeHtml(copyLabel)}</span>
        <span>Lembar ${copyNo} dari 2</span>
      </div>
      ${isoDocHeaderTable({
        judul: "TANDA TERIMA GIMMICK MARKETING",
        noDok: dist.nomor_tt || "-",
        terbitRevisi: "1/1",
        tglTerbit: tanggalIndo(dist.tanggal),
        hal: `${copyNo} dari 2`
      })}
      <table class="meta" style="margin-top:7px;">
        <tr>
          <td class="label">NOMOR TANDA TERIMA</td>
          <td><b>${escapeHtml(dist.nomor_tt || "-")}</b></td>
          <td class="label">TANGGAL</td>
          <td>${escapeHtml(tanggalIndo(dist.tanggal))}</td>
        </tr>
        <tr>
          <td class="label">DIBERIKAN OLEH</td>
          <td>${escapeHtml(pemberi)}</td>
          <td class="label">STATUS</td>
          <td>${escapeHtml(dist.status || "-")}</td>
        </tr>
        <tr>
          <td class="label">DITERIMA OLEH</td>
          <td>${escapeHtml(penerima)}</td>
          <td class="label">AREA</td>
          <td>${escapeHtml(dist.area || "-")}</td>
        </tr>
        <tr>
          <td class="label">TOKO / CUSTOMER</td>
          <td colspan="3">${escapeHtml(dist.toko_nama || "-")}</td>
        </tr>
      </table>
      <table class="grid" style="margin-top:7px;">
        <thead>
          <tr>
            <th class="center" style="width:32px;">No</th>
            <th>Nama Barang Gimmick</th>
            <th class="center" style="width:70px;">Jumlah</th>
            <th class="center" style="width:70px;">Satuan</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="center">1</td>
            <td><b>${escapeHtml(item)}</b></td>
            <td class="center"><b>${nf(qty)}</b></td>
            <td class="center">${escapeHtml(satuan)}</td>
            <td>${escapeHtml(dist.keterangan || "-")}</td>
          </tr>
        </tbody>
      </table>
      <table class="sign receipt-sign" style="margin-top:8px;">
        <tr>
          <td style="width:33.33%;"><b>Pemberi</b><div class="ttd-space"></div><u>${escapeHtml(dist.pemberi_nama || "( ................... )")}</u><div class="small">${escapeHtml(dist.pemberi_tipe || "")}</div></td>
          <td style="width:33.33%;"><b>Penerima</b><div class="ttd-space"></div><u>${escapeHtml(dist.penerima_nama || "( ................... )")}</u><div class="small">${escapeHtml(dist.penerima_tipe || "")}</div></td>
          <td style="width:33.33%;"><b>Mengetahui</b><div class="ttd-space"></div><u>( .................................. )</u><div class="small">SPV / HRD Marketing</div></td>
        </tr>
      </table>
      <p class="small" style="margin-top:4px;">${escapeHtml(COMPANY_NAME)} - ${escapeHtml(COMPANY_ADDRESS_LINE1)}</p>
    </div>`;
}

function buildReceiptBody(dist) {
  return `
    ${buildReceiptCopy(dist, "Arsip Admin / Gudang", 1)}
    <div class="cut-line"><span>✂ POTONG DI SINI</span></div>
    ${buildReceiptCopy(dist, "Penerima / Toko", 2)}
  `;
}

function printReceipt(dist) {
  if (!dist) return;
  openPrintWindow(wrapPrintDocument(`Tanda Terima Gimmick - ${dist.nomor_tt || dist.item_nama || ""}`, buildReceiptBody(dist)));
}

/* ---------------------------------------------------------------------
 * VIEW
 * ------------------------------------------------------------------- */
export async function mount(container, { session } = {}) {
  const panelMaster = container.querySelector("#gimmick-panel-master");
  const panelStok = container.querySelector("#gimmick-panel-stok");
  const panelDistribusi = container.querySelector("#gimmick-panel-distribusi");
  const panelEfektivitas = container.querySelector("#gimmick-panel-efektivitas");

  const masterSummaryEl = container.querySelector("#gimmick-master-summary");
  const stokSummaryEl = container.querySelector("#gimmick-stok-summary");
  const distribusiSummaryEl = container.querySelector("#gimmick-distribusi-summary");
  const efektivitasSummaryEl = container.querySelector("#gimmick-efektivitas-summary");

  const state = {
    master: [],
    allocations: [],
    distributions: [],
    effectiveness: []
  };

  let stokCrud = null;
  let distribusiCrud = null;
  let efektivitasCrud = null;
  let canPrintReceipt = false;

  const itemOptions = () => state.master
    .filter(item => String(item.status || "Aktif") !== "Nonaktif")
    .map(item => item.nama_item)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), "id"));

  const holderOptions = () => Array.from(new Set(
    state.allocations.map(row => row.alokasi_nama).filter(Boolean)
  )).sort((a, b) => String(a).localeCompare(String(b), "id"));

  /* -------------------------------------------------------------------
   * DATA
   * ----------------------------------------------------------------- */
  async function loadAll() {
    const [master, allocations, distributions, effectiveness] = await Promise.all([
      fsGetAll(COL.GIMMICK_MASTER).catch(() => []),
      fsGetAll(COL.GIMMICK_STOK).catch(() => []),
      fsGetAll(COL.GIMMICK_DISTRIBUSI).catch(() => []),
      fsGetAll(COL.GIMMICK_EFEKTIVITAS).catch(() => [])
    ]);
    state.master = Array.isArray(master) ? master : [];
    state.allocations = Array.isArray(allocations) ? allocations : [];
    state.distributions = Array.isArray(distributions) ? distributions : [];
    state.effectiveness = Array.isArray(effectiveness) ? effectiveness : [];
    return state;
  }

  function ledgerNow() {
    return computeAllocationLedger(state.allocations, state.distributions);
  }

  function masterByName(name) {
    const key = String(name || "").trim().toLowerCase();
    return state.master.find(item => String(item.nama_item || "").trim().toLowerCase() === key) || null;
  }

  /* -------------------------------------------------------------------
   * TAB 1 — MASTER GIMMICK
   * ----------------------------------------------------------------- */
  function renderMasterSummary(list = state.master) {
    if (!masterSummaryEl) return;
    const summary = summarizeGimmick({
      master: list,
      allocations: state.allocations,
      distributions: state.distributions,
      effectiveness: state.effectiveness
    });
    const lowItems = summary.stock.filter(row => row.low_stock || row.status_stok === "Over Alokasi");

    const rows = summary.stock.map(row => `
      <tr class="border-t border-slate-100">
        <td class="px-3 py-2 font-mono text-[11px] text-slate-500">${escapeHtml(row.kode || "-")}</td>
        <td class="px-3 py-2">
          <div class="font-semibold text-slate-700">${escapeHtml(row.nama_item || "-")}</div>
          <div class="text-[10px] text-slate-400">${escapeHtml(row.kategori || "Gimmick")}</div>
        </td>
        <td class="px-3 py-2 text-center">${escapeHtml(row.principle || "-")}</td>
        <td class="px-3 py-2 text-right font-semibold">${nf(row.stok_awal)} ${escapeHtml(row.satuan || "")}</td>
        <td class="px-3 py-2 text-right">${nf(row.allocated)}</td>
        <td class="px-3 py-2 text-right">${nf(row.distributed)}</td>
        <td class="px-3 py-2 text-right font-bold ${row.stok_gudang < 0 ? "text-red-700" : "text-slate-700"}">${nf(row.stok_gudang)}</td>
        <td class="px-3 py-2 text-center">${badge(row.status_stok, stockTone(row.status_stok))}</td>
      </tr>`).join("");

    masterSummaryEl.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${summaryCard("Jenis Gimmick", nf(summary.totals.items), "Item terdaftar", "maroon")}
        ${summaryCard("Total Stok Awal", nf(summary.totals.stokAwal), "Seluruh item", "blue")}
        ${summaryCard("Sudah Dialokasikan", nf(summary.totals.dialokasikan), `Sisa gudang ${nf(summary.totals.sisaGudang)}`, "slate")}
        ${summaryCard("Perlu Perhatian", nf(lowItems.length), "Stok menipis / over alokasi", lowItems.length ? "red" : "green")}
      </div>
      ${renderLowStockPanel(lowItems)}
      ${renderPrinciplePanel(summary)}
      ${panelTable(
        "Stok Ringkas per Item",
        "Stok gudang = stok awal - alokasi. Stok di tangan = alokasi - distribusi.",
        ["Kode", "Nama Item", "Principle", "Stok Awal", "Dialokasikan", "Terdistribusi", "Sisa Gudang", "Status"],
        rows,
        "Belum ada master gimmick"
      )}
    `;
  }

  function renderLowStockPanel(lowItems) {
    if (!lowItems.length) return "";
    return `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
        <div class="flex items-start gap-3">
          <span class="text-amber-600 mt-0.5">${icon("alert", "w-5 h-5")}</span>
          <div class="min-w-0">
            <p class="text-xs font-bold text-amber-800">Perhatian stok gimmick</p>
            <p class="text-[11px] text-amber-700 mt-0.5">${lowItems.slice(0, 8).map(row => `${escapeHtml(row.nama_item)} (${escapeHtml(row.status_stok)})`).join(", ")}${lowItems.length > 8 ? `, dan ${lowItems.length - 8} item lain` : ""}.</p>
          </div>
        </div>
      </div>`;
  }

  function renderPrinciplePanel(summary) {
    const entries = Object.entries(summary.byPrinciple);
    if (!entries.length) return "";
    const rows = entries.map(([principle, total]) => `
      <tr class="border-t border-slate-100">
        <td class="px-3 py-2 font-semibold text-slate-700">${escapeHtml(principle)}</td>
        <td class="px-3 py-2 text-right">${nf(total)}</td>
        <td class="px-3 py-2 text-right">${summary.totals.stokAwal > 0 ? ((total / summary.totals.stokAwal) * 100).toFixed(1) : "0.0"}%</td>
      </tr>`).join("");
    return panelTable(
      "Distribusi Stok per Principle",
      "Total stok awal yang tercatat untuk setiap principle.",
      ["Principle", "Stok Awal", "Porsi"],
      rows
    );
  }

  async function renderMasterTab() {
    const canManage = await hasPermission("gimmick.master.manage", session);

    renderMasterSummary();

    await renderCrudModule(container.querySelector("#gimmick-master-crud"), {
      title: "Master Barang Gimmick",
      subtitle: "Daftar barang marketing beserta principle, kategori, satuan, stok awal, dan batas stok minimum.",
      collectionName: COL.GIMMICK_MASTER,
      idPrefix: "GMK",
      orderByField: "nama_item",
      searchFields: ["nama_item", "kode", "principle", "kategori", "status"],
      canCreate: canManage,
      canEdit: canManage,
      canDelete: canManage && canDeleteModuleData(session),
      emptyMessage: "Belum ada barang gimmick",
      columns: [
        {
          key: "nomor",
          label: "Nomor",
          format: (_, row) => `<span class="font-mono text-[11px] font-bold text-maroon-800">${escapeHtml(row.kode || row.id || "-")}</span>`
        },
        {
          key: "nama_item",
          label: "Nama Barang",
          format: (v, row) => `<div class="font-semibold text-slate-800">${escapeHtml(v || "-")}</div>
            <div class="text-[11px] text-slate-400">${escapeHtml(row.kategori || "Gimmick")} · ${escapeHtml(row.satuan || "Pcs")}</div>`
        },
        { key: "principle", label: "Principle", type: "badge", badgeTone: () => "blue" },
        { key: "stok_awal", label: "Stok Awal", type: "number" },
        { key: "min_stok", label: "Min. Stok", type: "number" },
        { key: "harga_satuan", label: "Harga Satuan", type: "currency" },
        { key: "status", label: "Status", type: "badge", badgeTone: (v) => String(v || "Aktif") === "Nonaktif" ? "slate" : "green" }
      ],
      formFields: [
        { name: "kode", label: "Kode Barang (otomatis bila kosong)", type: "text" },
        { name: "nama_item", label: "Nama Barang Gimmick", type: "text", required: true, full: true },
        { name: "principle", label: "Principle", type: "select", options: [...PRINCIPLES], default: "ICI", required: true },
        { name: "kategori", label: "Kategori", type: "select", options: [...KATEGORI_GIMMICK], default: "Merchandise" },
        { name: "satuan", label: "Satuan", type: "select", options: [...SATUAN_OPTIONS], default: "Pcs" },
        { name: "stok_awal", label: "Stok Awal", type: "number", default: 0, required: true },
        { name: "min_stok", label: "Batas Stok Minimum", type: "number", default: 0 },
        { name: "harga_satuan", label: "Harga Satuan (Rp)", type: "number", default: 0 },
        { name: "status", label: "Status", type: "select", options: [...MASTER_STATUSES], default: "Aktif" },
        { name: "keterangan", label: "Keterangan", type: "textarea", full: true }
      ],
      beforeSave: (data, existing) => {
        const payload = { ...data };
        payload.kode = String(payload.kode || "").trim();
        if (!payload.kode) {
          let seq = state.master.length + 1;
          do {
            payload.kode = `GMK-${String(seq).padStart(3, "0")}`;
            seq += 1;
          } while (state.master.some(row => String(row.kode || "").toUpperCase() === payload.kode.toUpperCase()));
        }
        payload.nama_item = String(payload.nama_item || "").trim();
        payload.stok_awal = Number(payload.stok_awal || 0);
        payload.min_stok = Number(payload.min_stok || 0);
        payload.harga_satuan = Number(payload.harga_satuan || 0);
        payload.updated_at = new Date().toISOString();
        if (!existing) payload.created_at = payload.updated_at;
        return payload;
      },
      onRowRender: (list) => {
        state.master = list;
        renderMasterSummary(list);
      }
    });
  }

  /* -------------------------------------------------------------------
   * TAB 2 — STOK & ALOKASI
   * ----------------------------------------------------------------- */
  function renderStokSummary() {
    if (!stokSummaryEl) return;
    const summary = summarizeGimmick({
      master: state.master,
      allocations: state.allocations,
      distributions: state.distributions,
      effectiveness: state.effectiveness
    });

    const itemRows = summary.stock.map(row => `
      <tr class="border-t border-slate-100">
        <td class="px-3 py-2">
          <div class="font-semibold text-slate-700">${escapeHtml(row.nama_item || "-")}</div>
          <div class="text-[10px] text-slate-400">${escapeHtml(row.principle || "-")} · ${escapeHtml(row.satuan || "Pcs")}</div>
        </td>
        <td class="px-3 py-2 text-right">${nf(row.stok_awal)}</td>
        <td class="px-3 py-2 text-right">${nf(row.allocated)}</td>
        <td class="px-3 py-2 text-right">${nf(row.distributed)}</td>
        <td class="px-3 py-2 text-right font-bold">${nf(row.stok_gudang)}</td>
        <td class="px-3 py-2 text-right font-semibold ${row.stok_di_tangan < 0 ? "text-red-700" : "text-slate-600"}">${nf(row.stok_di_tangan)}</td>
        <td class="px-3 py-2">${progressBar(row.allocated, row.stok_awal)}</td>
        <td class="px-3 py-2 text-center">${badge(row.status_stok, stockTone(row.status_stok))}</td>
      </tr>`).join("");

    const byHolder = new Map();
    summary.ledger.forEach(row => {
      const key = `${row.alokasi_tipe}|${row.alokasi_nama}|${row.area || ""}`;
      if (!byHolder.has(key)) {
        byHolder.set(key, {
          tipe: row.alokasi_tipe,
          nama: row.alokasi_nama,
          area: row.area || "",
          alokasi: 0,
          terdistribusi: 0,
          sisa: 0,
          items: new Set()
        });
      }
      const bucket = byHolder.get(key);
      bucket.alokasi += Number(row.qty_alokasi || 0);
      bucket.terdistribusi += Number(row.qty_terdistribusi || 0);
      bucket.sisa += Number(row.qty_sisa || 0);
      if (row.item_nama) bucket.items.add(row.item_nama);
    });

    const holderRows = Array.from(byHolder.values())
      .sort((a, b) => String(a.tipe).localeCompare(String(b.tipe), "id") || String(a.nama).localeCompare(String(b.nama), "id"))
      .map(row => `
        <tr class="border-t border-slate-100">
          <td class="px-3 py-2 font-semibold text-slate-700">${escapeHtml(row.nama || "-")}</td>
          <td class="px-3 py-2">${badge(row.tipe || "-", "blue")}</td>
          <td class="px-3 py-2">${escapeHtml(row.area || "-")}</td>
          <td class="px-3 py-2 text-center">${row.items.size}</td>
          <td class="px-3 py-2 text-right">${nf(row.alokasi)}</td>
          <td class="px-3 py-2 text-right">${nf(row.terdistribusi)}</td>
          <td class="px-3 py-2 text-right font-bold ${row.sisa < 0 ? "text-red-700" : "text-slate-700"}">${nf(row.sisa)}</td>
        </tr>`).join("");

    stokSummaryEl.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${summaryCard("Total Alokasi", nf(summary.totals.dialokasikan), "Seluruh pemegang stok", "blue")}
        ${summaryCard("Terdistribusi ke Toko", nf(summary.totals.terdistribusi), "Status diakui", "green")}
        ${summaryCard("Stok di Tangan", nf(summary.totals.sisaDiTangan), "Sales / SPV / Principle / Area", "maroon")}
        ${summaryCard("Sisa Gudang", nf(summary.totals.sisaGudang), "Belum dialokasikan", summary.totals.sisaGudang < 0 ? "red" : "slate")}
      </div>
      ${panelTable(
        "Stok per Item",
        "Pantau stok awal, alokasi, distribusi, dan sisa gudang setiap item.",
        ["Item", "Stok Awal", "Alokasi", "Distribusi", "Sisa Gudang", "Stok di Tangan", "Serapan", "Status"],
        itemRows,
        "Belum ada item gimmick"
      )}
      ${panelTable(
        "Stok per Orang / Area",
        "Akumulasi alokasi dan realisasi distribusi per pemegang stok.",
        ["Pemegang", "Tipe", "Area", "Item", "Alokasi", "Terdistribusi", "Sisa"],
        holderRows,
        "Belum ada alokasi stok"
      )}
    `;
  }

  async function renderStokTab() {
    const canManage = await hasPermission("gimmick.stok.manage", session);
    const canPrint = await hasPermission("gimmick.export", session);
    let ledgerMap = new Map(ledgerNow().map(row => [row.key, row]));

    renderStokSummary();

    stokCrud = await renderCrudModule(container.querySelector("#gimmick-stok-crud"), {
      title: "Alokasi Stok Gimmick",
      subtitle: "Bagikan stok ke Sales, SPV Sales, Principle, area, atau gudang. Sisa stok dihitung otomatis dari distribusi yang sudah diakui.",
      collectionName: COL.GIMMICK_STOK,
      idPrefix: "GSTK",
      orderByField: "item_nama",
      searchFields: ["item_nama", "alokasi_tipe", "alokasi_nama", "area"],
      canCreate: canManage,
      canEdit: canManage,
      canDelete: canManage && canDeleteModuleData(session),
      emptyMessage: "Belum ada alokasi stok",
      columns: [
        {
          key: "item_nama",
          label: "Item Gimmick",
          format: (v, row) => {
            const master = masterByName(v);
            return `<div class="font-semibold text-slate-800">${escapeHtml(v || "-")}</div>
              <div class="text-[11px] text-slate-400">${escapeHtml(master?.principle || row.principle || "Gimmick")} · ${escapeHtml(master?.satuan || "Pcs")}</div>`;
          }
        },
        {
          key: "alokasi_tipe",
          label: "Pemegang",
          format: (v, row) => `<div class="font-semibold text-slate-700">${escapeHtml(row.alokasi_nama || "-")}</div>
            <div class="text-[11px] text-slate-400">${escapeHtml(allocationLabel(v, row.alokasi_nama))}</div>`
        },
        { key: "area", label: "Area" },
        {
          key: "qty_alokasi",
          label: "Qty Alokasi",
          format: (v, row) => {
            const ledgerRow = ledgerMap.get(allocationKey(row.item_nama, row.alokasi_tipe, row.alokasi_nama));
            return `<span class="font-bold text-slate-800">${nf(v)}</span>
              <div class="text-[10px] text-slate-400">sisa ${nf(ledgerRow?.qty_sisa ?? v)}</div>`;
          }
        },
        {
          key: "tanggal",
          label: "Tanggal",
          type: "date"
        }
      ],
      formFields: [
        { name: "item_nama", label: "Nama Barang Gimmick", type: "datalist", options: itemOptions(), required: true },
        { name: "alokasi_tipe", label: "Tipe Pemegang", type: "select", options: [...ALOKASI_TIPE], default: "SALES", required: true },
        { name: "alokasi_nama", label: "Nama Pemegang (Sales / SPV / Principle / Area)", type: "datalist", options: holderOptions(), required: true },
        { name: "area", label: "Area / Wilayah", type: "text" },
        { name: "qty_alokasi", label: "Qty Dialokasikan", type: "number", required: true },
        { name: "tanggal", label: "Tanggal Alokasi", type: "date", default: localDateStr(new Date()) },
        { name: "catatan", label: "Catatan", type: "textarea", full: true }
      ],
      extraToolbarHtml: canPrint
        ? `<button id="btn-gimmick-print-stok" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition shadow-2xs">${icon("printer", "w-4 h-4 text-slate-500")}Cetak Laporan Stok</button>`
        : "",
      beforeSave: (data) => {
        const payload = { ...data };
        payload.item_nama = String(payload.item_nama || "").trim();
        payload.alokasi_nama = String(payload.alokasi_nama || "").trim();
        payload.alokasi_tipe = String(payload.alokasi_tipe || "SALES").toUpperCase();
        payload.qty_alokasi = Number(payload.qty_alokasi || 0);
        if (!payload.item_nama) throw new Error("Nama barang gimmick wajib diisi.");
        if (!payload.alokasi_nama) throw new Error("Nama pemegang alokasi wajib diisi.");
        if (payload.qty_alokasi <= 0) throw new Error("Qty alokasi harus lebih besar dari 0.");
        payload.updated_at = new Date().toISOString();
        return payload;
      },
      afterSave: async () => {
        await loadAll();
        renderStokSummary();
      },
      onRowRender: (list) => {
        state.allocations = list;
        ledgerMap = new Map(ledgerNow().map(row => [row.key, row]));
        renderStokSummary();
      }
    });

    container.querySelector("#btn-gimmick-print-stok")?.addEventListener("click", () => {
      if (!canPrint) {
        toast("Akses ditolak: Anda tidak berwenang mencetak laporan stok.", "warning");
        return;
      }
      printStockReport();
    });
  }

  function printStockReport() {
    const summary = summarizeGimmick({
      master: state.master,
      allocations: state.allocations,
      distributions: state.distributions,
      effectiveness: state.effectiveness
    });

    const itemRows = summary.stock.map(row => `
      <tr>
        <td>${escapeHtml(row.nama_item || "-")}</td>
        <td class="center">${escapeHtml(row.principle || "-")}</td>
        <td class="center">${nf(row.stok_awal)}</td>
        <td class="center">${nf(row.allocated)}</td>
        <td class="center">${nf(row.distributed)}</td>
        <td class="center"><b>${nf(row.stok_gudang)}</b></td>
        <td class="center">${nf(row.stok_di_tangan)}</td>
        <td class="center">${escapeHtml(row.status_stok)}</td>
      </tr>`).join("");

    const holderRows = summary.ledger.map(row => `
      <tr>
        <td>${escapeHtml(row.item_nama || "-")}</td>
        <td>${escapeHtml(row.alokasi_nama || "-")}</td>
        <td class="center">${escapeHtml(row.alokasi_tipe || "-")}</td>
        <td>${escapeHtml(row.area || "-")}</td>
        <td class="center">${nf(row.qty_alokasi)}</td>
        <td class="center">${nf(row.qty_terdistribusi)}</td>
        <td class="center"><b>${nf(row.qty_sisa)}</b></td>
      </tr>`).join("");

    const body = `
      ${isoDocHeaderTable({
        judul: "LAPORAN STOK & ALOKASI GIMMICK",
        noDok: "GMK-STK",
        terbitRevisi: "1/1",
        tglTerbit: tanggalIndo(new Date()),
        hal: "1 dari 1"
      })}
      <div class="score-box" style="display:flex;gap:8px;margin:9px 0;">
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">STOK AWAL</span><br/><b style="font-size:15px;">${nf(summary.totals.stokAwal)}</b></div>
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">DIALOKASIKAN</span><br/><b style="font-size:15px;">${nf(summary.totals.dialokasikan)}</b></div>
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">TERDISTRIBUSI</span><br/><b style="font-size:15px;">${nf(summary.totals.terdistribusi)}</b></div>
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">SISA GUDANG</span><br/><b style="font-size:15px;">${nf(summary.totals.sisaGudang)}</b></div>
      </div>
      <h3>Stok per Item</h3>
      <table class="grid">
        <thead><tr><th>Item</th><th class="center">Principle</th><th class="center">Stok Awal</th><th class="center">Alokasi</th><th class="center">Distribusi</th><th class="center">Sisa Gudang</th><th class="center">Di Tangan</th><th class="center">Status</th></tr></thead>
        <tbody>${itemRows || `<tr><td colspan="8" class="center muted">Belum ada data stok.</td></tr>`}</tbody>
      </table>
      <h3>Alokasi per Orang / Area</h3>
      <table class="grid">
        <thead><tr><th>Item</th><th>Pemegang</th><th class="center">Tipe</th><th>Area</th><th class="center">Alokasi</th><th class="center">Terdistribusi</th><th class="center">Sisa</th></tr></thead>
        <tbody>${holderRows || `<tr><td colspan="7" class="center muted">Belum ada alokasi.</td></tr>`}</tbody>
      </table>
      <div class="pengesahan">
        <table class="sign">
          <tr>
            <td style="width:50%;"><b>Dibuat Oleh, Admin Marketing</b><div class="ttd-space"></div><u>( .................................. )</u></td>
            <td style="width:50%;"><b>Disetujui Oleh, SPV / Manager</b><div class="ttd-space"></div><u>( .................................. )</u></td>
          </tr>
        </table>
        <p class="small" style="margin-top:5px;">${escapeHtml(COMPANY_NAME)} - ${escapeHtml(COMPANY_ADDRESS_LINE1)}</p>
      </div>
    `;
    openPrintWindow(wrapPrintDocument("Laporan Stok Gimmick", body));
  }

  /* -------------------------------------------------------------------
   * TAB 3 — DISTRIBUSI & TANDA TERIMA
   * ----------------------------------------------------------------- */
  function renderDistribusiSummary(list = state.distributions) {
    if (!distribusiSummaryEl) return;
    const rows = Array.isArray(list) ? list : [];
    const consumed = rows.filter(isConsumed);
    const totalQty = consumed.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const tokoSet = new Set(rows.map(row => String(row.toko_nama || row.penerima_nama || "").trim().toLowerCase()).filter(Boolean));
    const pending = rows.filter(row => ["Draft", "Diserahkan"].includes(String(row.status || ""))).length;

    const recent = rows
      .slice()
      .sort((a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || "")))
      .slice(0, 6)
      .map(row => `
        <tr class="border-t border-slate-100">
          <td class="px-3 py-2 font-mono text-[11px] text-slate-500">${escapeHtml(row.nomor_tt || "-")}</td>
          <td class="px-3 py-2">${escapeHtml(fmtDateShort(row.tanggal))}</td>
          <td class="px-3 py-2 font-semibold text-slate-700">${escapeHtml(row.item_nama || "-")}</td>
          <td class="px-3 py-2 text-right">${nf(row.qty)}</td>
          <td class="px-3 py-2">${escapeHtml(row.toko_nama || row.penerima_nama || "-")}</td>
          <td class="px-3 py-2 text-center">${badge(row.status || "-", distributionTone(row.status))}</td>
        </tr>`).join("");

    distribusiSummaryEl.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${summaryCard("Transaksi Distribusi", nf(rows.length), "Seluruh status", "blue")}
        ${summaryCard("Qty Tersalur", nf(totalQty), "Status diakui", "green")}
        ${summaryCard("Toko / Customer", nf(tokoSet.size), "Penerima unik", "maroon")}
        ${summaryCard("Menunggu Realisasi", nf(pending), "Draft / diserahkan", pending ? "amber" : "slate")}
      </div>
      ${panelTable(
        "Distribusi Terbaru",
        "6 transaksi terakhir berdasarkan tanggal.",
        ["No. TT", "Tanggal", "Item", "Qty", "Toko / Penerima", "Status"],
        recent,
        "Belum ada distribusi"
      )}
    `;
  }

  async function renderDistribusiTab() {
    const [canCreate, canEdit, canDelete, canPrint] = await Promise.all([
      hasPermission("gimmick.distribusi.create", session),
      hasPermission("gimmick.distribusi.edit", session),
      hasPermission("gimmick.distribusi.delete", session),
      hasPermission("gimmick.receipt.print", session)
    ]);
    canPrintReceipt = canPrint;

    renderDistribusiSummary();

    distribusiCrud = await renderCrudModule(container.querySelector("#gimmick-distribusi-crud"), {
      title: "Distribusi Gimmick & Tanda Terima",
      subtitle: "Catat penyerahan gimmick dari Sales / SPV / Principle ke toko atau customer, lalu cetak tanda terima 2 ply.",
      collectionName: COL.GIMMICK_DISTRIBUSI,
      idPrefix: "GDST",
      orderByField: "tanggal",
      searchFields: ["nomor_tt", "item_nama", "pemberi_nama", "penerima_nama", "toko_nama", "area", "status"],
      canCreate,
      canEdit,
      canDelete: canDelete && canDeleteModuleData(session),
      emptyMessage: "Belum ada distribusi gimmick",
      columns: [
        {
          key: "nomor_tt",
          label: "No. Tanda Terima",
          format: (v, row) => `<span class="font-mono text-[11px] font-bold text-maroon-800">${escapeHtml(v || "-")}</span>
            <div class="text-[10px] text-slate-400">${escapeHtml(fmtDateShort(row.tanggal))}</div>`
        },
        {
          key: "item_nama",
          label: "Item",
          format: (v, row) => `<div class="font-semibold text-slate-800">${escapeHtml(v || "-")}</div>
            <div class="text-[11px] text-slate-400">${nf(row.qty)} ${escapeHtml(row.satuan || "Pcs")}</div>`
        },
        {
          key: "pemberi_nama",
          label: "Pemberi",
          format: (v, row) => `<div class="text-slate-700">${escapeHtml(v || "-")}</div>
            <div class="text-[10px] text-slate-400">${escapeHtml(row.pemberi_tipe || "-")}</div>`
        },
        {
          key: "penerima_nama",
          label: "Penerima / Toko",
          format: (v, row) => `<div class="font-semibold text-slate-700">${escapeHtml(row.toko_nama || v || "-")}</div>
            <div class="text-[10px] text-slate-400">${escapeHtml(row.penerima_tipe || "-")}${row.area ? ` · ${escapeHtml(row.area)}` : ""}</div>`
        },
        { key: "status", label: "Status", type: "badge", badgeTone: distributionTone }
      ],
      formFields: [
        { name: "nomor_tt", label: "Nomor Tanda Terima (otomatis bila kosong)", type: "text" },
        { name: "tanggal", label: "Tanggal Distribusi", type: "date", default: localDateStr(new Date()), required: true },
        { name: "item_nama", label: "Nama Barang Gimmick", type: "datalist", options: itemOptions(), required: true },
        { name: "qty", label: "Qty Diserahkan", type: "number", required: true },
        { name: "satuan", label: "Satuan", type: "select", options: [...SATUAN_OPTIONS], default: "Pcs" },
        { name: "pemberi_tipe", label: "Tipe Pemberi", type: "select", options: [...ALOKASI_TIPE], default: "SALES", required: true },
        { name: "pemberi_nama", label: "Nama Pemberi (pemegang stok)", type: "datalist", options: holderOptions(), required: true },
        { name: "penerima_tipe", label: "Tipe Penerima", type: "select", options: [...PENERIMA_TIPE], default: "TOKO / CUSTOMER", required: true },
        { name: "penerima_nama", label: "Nama Penerima", type: "text", required: true },
        { name: "toko_nama", label: "Nama Toko / Customer", type: "text" },
        { name: "area", label: "Area / Wilayah", type: "text" },
        { name: "status", label: "Status Distribusi", type: "select", options: [...DISTRIBUSI_STATUSES], default: "Diserahkan" },
        { name: "keterangan", label: "Keterangan", type: "textarea", full: true }
      ],
      beforeSave: (data, existing) => {
        const payload = { ...data };
        payload.item_nama = String(payload.item_nama || "").trim();
        payload.pemberi_nama = String(payload.pemberi_nama || "").trim();
        payload.penerima_nama = String(payload.penerima_nama || "").trim();
        payload.toko_nama = String(payload.toko_nama || "").trim();
        payload.pemberi_tipe = String(payload.pemberi_tipe || "SALES").toUpperCase();
        payload.qty = Number(payload.qty || 0);

        if (!payload.item_nama) throw new Error("Nama barang gimmick wajib diisi.");
        if (payload.qty <= 0) throw new Error("Qty distribusi harus lebih besar dari 0.");
        if (!payload.penerima_nama) throw new Error("Nama penerima wajib diisi.");

        if (isConsumed(payload)) {
          const key = [payload.item_nama.toLowerCase(), payload.pemberi_tipe.toLowerCase(), payload.pemberi_nama.toLowerCase()].join("|");
          const ledgerRow = ledgerNow().find(row => row.key === key);
          if (ledgerRow) {
            const previousQty = existing && isConsumed(existing) &&
              String(existing.pemberi_tipe || "").toUpperCase() === payload.pemberi_tipe &&
              String(existing.pemberi_nama || "").trim().toLowerCase() === payload.pemberi_nama.toLowerCase() &&
              String(existing.item_nama || "").trim().toLowerCase() === payload.item_nama.toLowerCase()
              ? Number(existing.qty || 0) : 0;
            const available = Number(ledgerRow.qty_sisa || 0) + previousQty;
            if (payload.qty > available) {
              throw new Error(`Stok ${payload.item_nama} pada ${payload.pemberi_nama} tidak cukup. Sisa ${nf(available)}.`);
            }
          }
        }

        if (!String(payload.nomor_tt || "").trim()) {
          const dateKey = String(payload.tanggal || localDateStr(new Date())).slice(0, 10);
          const sequence = state.distributions.filter(row => String(row.tanggal || "").slice(0, 10) === dateKey).length + 1;
          payload.nomor_tt = buildReceiptNumber(payload.tanggal || new Date(), sequence);
        }
        payload.updated_at = new Date().toISOString();
        if (!existing) payload.created_at = payload.updated_at;
        return payload;
      },
      afterSave: async () => {
        await loadAll();
        renderDistribusiSummary();
      },
      onRowRender: (list) => {
        state.distributions = list;
        renderDistribusiSummary(list);
      },
      printFn: (row) => {
        if (!canPrintReceipt) {
          toast("Akses ditolak: Anda tidak berwenang mencetak tanda terima.", "warning");
          return;
        }
        printReceipt(row);
      },
      printLabel: "Cetak Tanda Terima 2 Ply"
    });
  }

  /* -------------------------------------------------------------------
   * TAB 4 — EFEKTIVITAS & ANALISA
   * ----------------------------------------------------------------- */
  function renderEfektivitasSummary(list = state.effectiveness) {
    if (!efektivitasSummaryEl) return;
    const summary = summarizeEffectiveness(list);
    const rows = summary.rows;

    const byItem = new Map();
    const byArea = new Map();
    rows.forEach(row => {
      const itemKey = String(row.item_nama || "-").trim();
      if (!byItem.has(itemKey)) byItem.set(itemKey, { total: 0, score: 0, orderUplift: 0, valueUplift: 0 });
      const item = byItem.get(itemKey);
      item.total += 1;
      item.score += Number(row.score || 0);
      item.orderUplift += Number(row.orderUpliftPct || 0);
      item.valueUplift += Number(row.valueUpliftPct || 0);

      const areaKey = String(row.area || "-").trim();
      if (!byArea.has(areaKey)) byArea.set(areaKey, { total: 0, score: 0, orderUplift: 0, valueUplift: 0 });
      const area = byArea.get(areaKey);
      area.total += 1;
      area.score += Number(row.score || 0);
      area.orderUplift += Number(row.orderUpliftPct || 0);
      area.valueUplift += Number(row.valueUpliftPct || 0);
    });

    const bucketRows = map => Array.from(map.entries())
      .map(([name, bucket]) => ({
        name,
        total: bucket.total,
        score: bucket.score / bucket.total,
        orderUplift: bucket.orderUplift / bucket.total,
        valueUplift: bucket.valueUplift / bucket.total
      }))
      .sort((a, b) => b.score - a.score)
      .map(row => `
        <tr class="border-t border-slate-100">
          <td class="px-3 py-2 font-semibold text-slate-700">${escapeHtml(row.name)}</td>
          <td class="px-3 py-2 text-center">${row.total}</td>
          <td class="px-3 py-2 text-center font-bold ${row.score >= 70 ? "text-emerald-700" : row.score >= 45 ? "text-amber-700" : "text-red-700"}">${nf2(row.score)}</td>
          <td class="px-3 py-2 text-right ${row.orderUplift >= 0 ? "text-emerald-700" : "text-red-700"}">${row.orderUplift >= 0 ? "+" : ""}${nf2(row.orderUplift)}%</td>
          <td class="px-3 py-2 text-right ${row.valueUplift >= 0 ? "text-emerald-700" : "text-red-700"}">${row.valueUplift >= 0 ? "+" : ""}${nf2(row.valueUplift)}%</td>
        </tr>`).join("");

    efektivitasSummaryEl.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${summaryCard("Evaluasi", nf(summary.total), "Catatan analisa", "blue")}
        ${summaryCard("Rata-rata Skor", nf2(summary.averageScore), "Skala 0 - 100", summary.averageScore >= 70 ? "green" : summary.averageScore >= 45 ? "amber" : "red")}
        ${summaryCard("Tingkat Efektif", `${nf2(summary.effectiveRate)}%`, `${summary.effectiveCount} dari ${summary.total} evaluasi`, summary.effectiveRate >= 60 ? "green" : "amber")}
        ${summaryCard("Uplift Order", `${summary.averageOrderUplift >= 0 ? "+" : ""}${nf2(summary.averageOrderUplift)}%`, `Nilai order ${summary.averageValueUplift >= 0 ? "+" : ""}${nf2(summary.averageValueUplift)}%`, summary.averageOrderUplift >= 0 ? "green" : "red")}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${panelTable("Efektivitas per Item", "Diurutkan dari skor rata-rata tertinggi.", ["Item", "Evaluasi", "Skor", "Uplift Order", "Uplift Nilai"], bucketRows(byItem), "Belum ada evaluasi")}
        ${panelTable("Efektivitas per Area", "Diurutkan dari skor rata-rata tertinggi.", ["Area", "Evaluasi", "Skor", "Uplift Order", "Uplift Nilai"], bucketRows(byArea), "Belum ada evaluasi")}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
          <p class="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Item Terbaik</p>
          <p class="text-sm font-bold text-emerald-900 mt-0.5">${escapeHtml(summary.bestItem?.name || "Belum ada data")}</p>
          <p class="text-[11px] text-emerald-700">${summary.bestItem ? `Skor rata-rata ${nf2(summary.bestItem.averageScore)} dari ${summary.bestItem.total} evaluasi` : "Tambahkan evaluasi efektivitas"}</p>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <p class="text-[11px] font-bold uppercase tracking-wide text-blue-700">Area Terbaik</p>
          <p class="text-sm font-bold text-blue-900 mt-0.5">${escapeHtml(summary.bestArea?.name || "Belum ada data")}</p>
          <p class="text-[11px] text-blue-700">${summary.bestArea ? `Skor rata-rata ${nf2(summary.bestArea.averageScore)} dari ${summary.bestArea.total} evaluasi` : "Tambahkan evaluasi efektivitas"}</p>
        </div>
      </div>
    `;
  }

  async function renderEfektivitasTab() {
    const [canManage, canPrint] = await Promise.all([
      hasPermission("gimmick.efektivitas.manage", session),
      hasPermission("gimmick.export", session)
    ]);

    renderEfektivitasSummary();

    efektivitasCrud = await renderCrudModule(container.querySelector("#gimmick-efektivitas-crud"), {
      title: "Efektivitas Gimmick terhadap Order Toko",
      subtitle: "Ukur dampak gimmick terhadap jumlah order, nilai order, dan engagement toko. Skor dihitung otomatis (50% order, 30% nilai, 20% engagement).",
      collectionName: COL.GIMMICK_EFEKTIVITAS,
      idPrefix: "GEFK",
      orderByField: "periode",
      searchFields: ["item_nama", "area", "toko_nama", "periode", "status_efektivitas"],
      canCreate: canManage,
      canEdit: canManage,
      canDelete: canManage && canDeleteModuleData(session),
      emptyMessage: "Belum ada evaluasi efektivitas",
      columns: [
        {
          key: "item_nama",
          label: "Item / Periode",
          format: (v, row) => `<div class="font-semibold text-slate-800">${escapeHtml(v || "-")}</div>
            <div class="text-[11px] text-slate-400">${escapeHtml(row.periode || "-")}</div>`
        },
        {
          key: "toko_nama",
          label: "Toko / Area",
          format: (v, row) => `<div class="text-slate-700">${escapeHtml(v || "-")}</div>
            <div class="text-[11px] text-slate-400">${escapeHtml(row.area || "-")}</div>`
        },
        {
          key: "order_sesudah",
          label: "Order (Sebelum → Sesudah)",
          format: (_, row) => {
            const metric = computeEffectiveness(row);
            return `<span class="font-semibold">${nf(row.order_sebelum)} → ${nf(row.order_sesudah)}</span>
              <div class="text-[10px] font-bold ${metric.orderUpliftPct >= 0 ? "text-emerald-700" : "text-red-700"}">${metric.orderUpliftPct >= 0 ? "+" : ""}${nf2(metric.orderUpliftPct)}%</div>`;
          }
        },
        {
          key: "value_sesudah",
          label: "Nilai Order",
          format: (_, row) => {
            const metric = computeEffectiveness(row);
            return `<span class="text-slate-700">${fmtRupiah(row.value_sebelum)} → ${fmtRupiah(row.value_sesudah)}</span>
              <div class="text-[10px] font-bold ${metric.valueUpliftPct >= 0 ? "text-emerald-700" : "text-red-700"}">${metric.valueUpliftPct >= 0 ? "+" : ""}${nf2(metric.valueUpliftPct)}%</div>`;
          }
        },
        {
          key: "skor",
          label: "Skor / Status",
          format: (v, row) => {
            const metric = computeEffectiveness(row);
            const score = row.skor != null ? Number(row.skor) : metric.score;
            const status = row.status_efektivitas || metric.status;
            return `<span class="font-bold ${score >= 70 ? "text-emerald-700" : score >= 45 ? "text-amber-700" : "text-red-700"}">${nf2(score)}</span>
              <div class="mt-0.5">${badge(status, effectivenessTone(status))}</div>`;
          }
        }
      ],
      formFields: [
        { name: "item_nama", label: "Nama Barang Gimmick", type: "datalist", options: itemOptions(), required: true },
        { name: "periode", label: "Periode Evaluasi (mis. Okt 2026)", type: "text", required: true },
        { name: "toko_nama", label: "Nama Toko / Customer", type: "text", required: true },
        { name: "area", label: "Area / Wilayah", type: "text" },
        { name: "order_sebelum", label: "Jumlah Order Sebelum", type: "number", default: 0 },
        { name: "order_sesudah", label: "Jumlah Order Sesudah", type: "number", default: 0 },
        { name: "value_sebelum", label: "Nilai Order Sebelum (Rp)", type: "number", default: 0 },
        { name: "value_sesudah", label: "Nilai Order Sesudah (Rp)", type: "number", default: 0 },
        { name: "engagement", label: "Engagement Toko", type: "select", options: [...ENGAGEMENT_LEVELS], default: "Sedang" },
        { name: "catatan", label: "Catatan / Insight", type: "textarea", full: true }
      ],
      extraToolbarHtml: canPrint
        ? `<button id="btn-gimmick-print-analisa" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition shadow-2xs">${icon("printer", "w-4 h-4 text-slate-500")}Cetak Analisa</button>`
        : "",
      beforeSave: (data) => {
        const payload = { ...data };
        payload.item_nama = String(payload.item_nama || "").trim();
        payload.toko_nama = String(payload.toko_nama || "").trim();
        payload.periode = String(payload.periode || "").trim();
        payload.order_sebelum = Number(payload.order_sebelum || 0);
        payload.order_sesudah = Number(payload.order_sesudah || 0);
        payload.value_sebelum = Number(payload.value_sebelum || 0);
        payload.value_sesudah = Number(payload.value_sesudah || 0);
        const metric = computeEffectiveness(payload);
        payload.skor = metric.score;
        payload.status_efektivitas = metric.status;
        payload.order_uplift = metric.orderUpliftPct;
        payload.value_uplift = metric.valueUpliftPct;
        payload.order_delta = metric.orderDelta;
        payload.value_delta = metric.valueDelta;
        payload.updated_at = new Date().toISOString();
        return payload;
      },
      afterSave: async () => {
        await loadAll();
        renderEfektivitasSummary();
      },
      onRowRender: (list) => {
        state.effectiveness = list;
        renderEfektivitasSummary(list);
      }
    });

    container.querySelector("#btn-gimmick-print-analisa")?.addEventListener("click", () => {
      if (!canPrint) {
        toast("Akses ditolak: Anda tidak berwenang mencetak analisa.", "warning");
        return;
      }
      printEffectivenessReport();
    });
  }

  function printEffectivenessReport() {
    const summary = summarizeEffectiveness(state.effectiveness);
    const rows = summary.rows;

    const detailRows = rows.map(row => `
      <tr>
        <td>${escapeHtml(row.item_nama || "-")}</td>
        <td>${escapeHtml(row.toko_nama || "-")}</td>
        <td>${escapeHtml(row.area || "-")}</td>
        <td class="center">${escapeHtml(row.periode || "-")}</td>
        <td class="center">${nf(row.order_sebelum)} → ${nf(row.order_sesudah)}</td>
        <td class="center">${nf2(row.orderUpliftPct)}%</td>
        <td class="center">${fmtRupiah(row.value_sebelum)} → ${fmtRupiah(row.value_sesudah)}</td>
        <td class="center">${nf2(row.valueUpliftPct)}%</td>
        <td class="center"><b>${nf2(row.score)}</b></td>
        <td class="center">${escapeHtml(row.status)}</td>
      </tr>`).join("");

    const body = `
      ${isoDocHeaderTable({
        judul: "LAPORAN EFEKTIVITAS GIMMICK",
        noDok: "GMK-EFK",
        terbitRevisi: "1/1",
        tglTerbit: tanggalIndo(new Date()),
        hal: "1 dari 1"
      })}
      <div class="score-box" style="display:flex;gap:8px;margin:9px 0;">
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">EVALUASI</span><br/><b style="font-size:15px;">${nf(summary.total)}</b></div>
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">RATA-RATA SKOR</span><br/><b style="font-size:15px;">${nf2(summary.averageScore)}</b></div>
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">TINGKAT EFEKTIF</span><br/><b style="font-size:15px;">${nf2(summary.effectiveRate)}%</b></div>
        <div style="flex:1;border:1px solid #94a3b8;padding:6px;text-align:center;"><span class="small">UPLIFT ORDER</span><br/><b style="font-size:15px;">${summary.averageOrderUplift >= 0 ? "+" : ""}${nf2(summary.averageOrderUplift)}%</b></div>
      </div>
      <p><b>Item terbaik:</b> ${escapeHtml(summary.bestItem?.name || "-")} &nbsp;|&nbsp; <b>Area terbaik:</b> ${escapeHtml(summary.bestArea?.name || "-")}</p>
      <h3>Rincian Evaluasi</h3>
      <table class="grid">
        <thead>
          <tr>
            <th>Item</th><th>Toko</th><th>Area</th><th class="center">Periode</th>
            <th class="center">Order</th><th class="center">Uplift</th>
            <th class="center">Nilai Order</th><th class="center">Uplift</th>
            <th class="center">Skor</th><th class="center">Status</th>
          </tr>
        </thead>
        <tbody>${detailRows || `<tr><td colspan="10" class="center muted">Belum ada evaluasi efektivitas.</td></tr>`}</tbody>
      </table>
      <div class="pengesahan">
        <table class="sign">
          <tr>
            <td style="width:33.33%;"><b>Dibuat Oleh, Admin Marketing</b><div class="ttd-space"></div><u>( .................................. )</u></td>
            <td style="width:33.33%;"><b>Diperiksa, SPV Sales</b><div class="ttd-space"></div><u>( .................................. )</u></td>
            <td style="width:33.33%;"><b>Disetujui, Manager</b><div class="ttd-space"></div><u>( .................................. )</u></td>
          </tr>
        </table>
        <p class="small" style="margin-top:5px;">${escapeHtml(COMPANY_NAME)} - ${escapeHtml(COMPANY_ADDRESS_LINE1)}</p>
      </div>
    `;
    openPrintWindow(wrapPrintDocument("Laporan Efektivitas Gimmick", body));
  }

  /* -------------------------------------------------------------------
   * TAB SWITCHING
   * ----------------------------------------------------------------- */
  const panels = {
    master: panelMaster,
    stok: panelStok,
    distribusi: panelDistribusi,
    efektivitas: panelEfektivitas
  };

  async function switchTab(tab) {
    Object.entries(panels).forEach(([key, panel]) => {
      panel?.classList.toggle("hidden", key !== tab);
    });

    container.querySelectorAll(".gimmick-tab").forEach(btn => {
      const active = btn.dataset.gtab === tab;
      btn.classList.toggle("bg-white", active);
      btn.classList.toggle("text-maroon-700", active);
      btn.classList.toggle("font-bold", active);
      btn.classList.toggle("shadow-sm", active);
      btn.classList.toggle("text-slate-600", !active);
      btn.classList.toggle("font-semibold", !active);
    });

    await loadAll();

    if (tab === "master") await renderMasterTab();
    if (tab === "stok") await renderStokTab();
    if (tab === "distribusi") await renderDistribusiTab();
    if (tab === "efektivitas") await renderEfektivitasTab();
  }

  container.querySelectorAll(".gimmick-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      void switchTab(btn.dataset.gtab);
    });
  });

  await switchTab("master");

  return {
    unmount() {
      stokCrud = null;
      distribusiCrud = null;
      efektivitasCrud = null;
    }
  };
}
