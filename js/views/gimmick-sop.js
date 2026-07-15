import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";

export async function mount(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Manajemen Gimmick & SOP</h1>
        <p class="text-sm text-slate-500 mt-1">Pusat dokumentasi SOP perusahaan dan alokasi gimmick (merchandise) ke area/toko.</p>
      </div>
      <div class="flex items-center gap-2 border-b border-slate-100 overflow-x-auto">
        <button data-gtab="gimmick" class="gs-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">Distribusi Gimmick</button>
        <button data-gtab="sop" class="gs-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap">Database SOP</button>
      </div>
      <div id="gs-panel-gimmick"></div>
      <div id="gs-panel-sop" class="hidden"></div>
    </div>
  `;

  const panelGimmick = container.querySelector("#gs-panel-gimmick");
  const panelSOP = container.querySelector("#gs-panel-sop");
  const loaded = {};

  async function loadGimmick() {
    await renderCrudModule(panelGimmick, {
      title: "Alokasi Gimmick (Merchandise)",
      collectionName: "master_gimmick", idPrefix: "GMK",
      searchFields: ["nama_item", "principle", "alokasi_toko"],
      columns: [
        { key: "nama_item", label: "Nama Gimmick" },
        { key: "principle", label: "Principle", type: "badge", badgeTone: (v) => v === "ICI" ? "blue" : v === "DCOTA" ? "amber" : "green" },
        { key: "alokasi_toko", label: "Toko / Area" },
        { key: "jumlah", label: "Jumlah (Pcs)", type: "number" },
        { key: "tanggal_distribusi", label: "Tgl Distribusi", type: "date" },
      ],
      formFields: [
        { name: "nama_item", label: "Nama Item Gimmick", type: "text", required: true, full: true },
        { name: "principle", label: "Principle", type: "select", options: ["ICI", "DCOTA", "PRIMA"], required: true },
        { name: "jumlah", label: "Jumlah Stok (Pcs)", type: "number", required: true },
        { name: "alokasi_toko", label: "Alokasi Toko / Area Target", type: "text", required: true },
        { name: "pic_sales", label: "PIC Sales (Pembawa)", type: "text" },
        { name: "tanggal_distribusi", label: "Rencana Distribusi", type: "date", required: true },
        { name: "keterangan", label: "Keterangan", type: "textarea", full: true },
      ]
    });
  }

  async function loadSOP() {
    await renderCrudModule(panelSOP, {
      title: "Database SOP",
      subtitle: "Input alur proses HR untuk otomatis di-generate menjadi struktur SOP.",
      collectionName: COL.GIMMICK_SOP, idPrefix: "SOP",
      searchFields: ["judul", "kategori"],
      columns: [
        { key: "judul", label: "Judul SOP" },
        { key: "departemen", label: "Departemen" },
        { key: "versi", label: "Versi", type: "badge" },
        { key: "status", label: "Status", type: "badge", badgeTone: (v) => v === "Aktif" ? "green" : "slate" },
        { key: "file_url", label: "Dokumen Resmi", type: "link" },
      ],
      formFields: [
        { name: "judul", label: "Judul Prosedur (SOP)", type: "text", required: true, full: true },
        { name: "departemen", label: "Departemen Terkait", type: "select", options: ["HRD", "FINANCE", "SALES", "WAREHOUSE", "LOGISTIC", "ALL"], required: true },
        { name: "versi", label: "Versi / Revisi", type: "text", default: "1.0" },
        { name: "status", label: "Status Dokumen", type: "select", options: ["Aktif", "Revisi", "Draft"], default: "Aktif" },
        { name: "alur_proses", label: "Alur Proses (Pisahkan langkah dengan angka, misal: 1. Awal 2. Tengah)", type: "textarea", full: true },
        { name: "file_url", label: "Link Lampiran Flowchart (PDF/Img)", type: "text", full: true },
      ],
      extraToolbarHtml: `<button class="p-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition" onclick="alert('Fitur Generate Flowchart AI dalam pengembangan!')">✨ Generate Flowchart</button>`
    });
  }

  await loadGimmick(); loaded.gimmick = true;

  container.querySelectorAll(".gs-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.gtab;
      panelGimmick.classList.toggle("hidden", tab !== "gimmick");
      panelSOP.classList.toggle("hidden", tab !== "sop");
      container.querySelectorAll(".gs-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if (tab === "sop" && !loaded.sop) { loaded.sop = true; await loadSOP(); }
    });
  });

  return { unmount() {} };
}
