import { COL } from "../firebase-config.js";
import { fsGetAll, smartParseDate, escapeHtml, fmtDateShort } from "../utils.js";
import { renderCrudModule, badge, emptyState } from "../components.js";

export async function mount(container) {
  await renderAlerts(container);

  const panels = {
    data: container.querySelector("#kd-panel-data"),
    bbm: container.querySelector("#kd-panel-bbm"),
    service: container.querySelector("#kd-panel-service"),
    pajak: container.querySelector("#kd-panel-pajak"),
  };
  const loaded = {};

  async function loadData() {
    const fields = [
      { name: "no_polisi", label: "No. Polisi", type: "text", required: true },
      { name: "nama_pemilik", label: "Nama Pemilik / Atas Nama", type: "text" },
      { name: "merk", label: "Merk", type: "text" },
      { name: "tipe", label: "Tipe", type: "text" },
      { name: "model", label: "Model", type: "text" },
      { name: "tahun", label: "Tahun", type: "number" },
      { name: "warna", label: "Warna", type: "text" },
      { name: "bahan_bakar", label: "Bahan Bakar", type: "select", options: ["Solar", "Pertalite", "Pertamax", "Listrik"] },
      { name: "no_rangka", label: "No. Rangka", type: "text" },
      { name: "no_mesin", label: "No. Mesin", type: "text" },
      { name: "tgl_stnk_tahunan", label: "Jatuh Tempo STNK Tahunan", type: "date" },
      { name: "tgl_pajak_5thn", label: "Jatuh Tempo Pajak 5 Tahun", type: "date" },
      { name: "tgl_kir", label: "Jatuh Tempo KIR", type: "date" },
      { name: "alamat", label: "Alamat Terdaftar", type: "textarea", full: true },
    ];
    fields.idFromField = "no_polisi";
    await renderCrudModule(panels.data, {
      title: "Data Kendaraan",
      collectionName: COL.MASTER_KENDARAAN,
      idPrefix: "KND",
      orderByField: "merk",
      searchFields: ["no_polisi", "merk", "nama_pemilik"],
      columns: [
        { key: "no_polisi", label: "No. Polisi" },
        { key: "merk", label: "Merk" },
        { key: "tipe", label: "Tipe" },
        { key: "tahun", label: "Tahun", type: "number" },
        { key: "tgl_stnk_tahunan", label: "STNK", type: "date" },
        { key: "tgl_pajak_5thn", label: "Pajak 5Th", type: "date" },
      ],
      formFields: fields
    });
  }

  async function loadBbm() {
    await renderCrudModule(panels.bbm, {
      title: "Log Pengisian BBM",
      collectionName: COL.LOG_KENDARAAN_FUEL,
      idPrefix: "FUEL",
      searchFields: ["no_polisi", "nama_driver"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "no_polisi", label: "No. Polisi" },
        { key: "nama_driver", label: "Driver" },
        { key: "km_awal", label: "KM Awal", type: "number" },
        { key: "km_akhir", label: "KM Akhir", type: "number" },
        { key: "liter", label: "Liter", type: "number" },
        { key: "total_biaya", label: "Biaya", type: "currency" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "no_polisi", label: "No. Polisi", type: "text", required: true },
        { name: "nama_driver", label: "Nama Driver", type: "text", required: true },
        { name: "km_awal", label: "KM Awal", type: "number" },
        { name: "km_akhir", label: "KM Akhir", type: "number" },
        { name: "liter", label: "Liter", type: "number" },
        { name: "jenis_bbm", label: "Jenis BBM", type: "select", options: ["Solar", "Pertalite", "Pertamax"] },
        { name: "total_biaya", label: "Total Biaya (Rp)", type: "number", required: true },
      ]
    });
  }

  async function loadService() {
    await renderCrudModule(panels.service, {
      title: "Log Service & Dokumen Kendaraan",
      collectionName: COL.LOG_KENDARAAN_SERVICE,
      idPrefix: "SVC",
      searchFields: ["no_polisi", "nama_driver", "vendor"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "no_polisi", label: "No. Polisi" },
        { key: "jenis_dokumen", label: "Jenis" },
        { key: "vendor", label: "Vendor" },
        { key: "masa_berlaku", label: "Masa Berlaku", type: "date" },
        { key: "total_biaya", label: "Biaya", type: "currency" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "no_polisi", label: "No. Polisi", type: "text", required: true },
        { name: "nama_driver", label: "Nama Driver", type: "text" },
        { name: "jenis_dokumen", label: "Jenis Service/Dokumen", type: "text", required: true },
        { name: "masa_berlaku", label: "Masa Berlaku Hingga", type: "date" },
        { name: "vendor", label: "Vendor / Bengkel", type: "text" },
        { name: "no_referensi", label: "No. Referensi", type: "text" },
        { name: "total_biaya", label: "Total Biaya (Rp)", type: "number" },
      ]
    });
  }

  async function loadPajak() {
    await renderCrudModule(panels.pajak, {
      title: "Pajak & Compliance Kendaraan",
      collectionName: COL.LOG_KENDARAAN_COMPLIANCE,
      idPrefix: "CMP",
      searchFields: ["no_polisi", "jenis_pajak"],
      columns: [
        { key: "tanggal_bayar", label: "Tgl Bayar", type: "date" },
        { key: "no_polisi", label: "No. Polisi" },
        { key: "jenis_pajak", label: "Jenis Pajak" },
        { key: "berlaku_hingga", label: "Berlaku Hingga", type: "date" },
        { key: "total_biaya", label: "Biaya", type: "currency" },
        { key: "dokumen_url", label: "Dokumen", type: "link" },
      ],
      formFields: [
        { name: "tanggal_bayar", label: "Tanggal Bayar", type: "date", required: true },
        { name: "no_polisi", label: "No. Polisi", type: "text", required: true },
        { name: "jenis_pajak", label: "Jenis Pajak", type: "text", required: true },
        { name: "berlaku_hingga", label: "Berlaku Hingga", type: "date" },
        { name: "total_biaya", label: "Total Biaya (Rp)", type: "number" },
        { name: "dokumen_url", label: "URL Dokumen", type: "text", full: true },
      ]
    });
  }

  await loadData(); loaded.data = true;

  container.querySelectorAll(".kd-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ktab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".kd-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "bbm") await loadBbm();
        if (tab === "service") await loadService();
        if (tab === "pajak") await loadPajak();
      }
    });
  });

  return { unmount() {} };
}

async function renderAlerts(container) {
  const wrap = container.querySelector("#kend-alert-wrap");
  const kendaraan = await fsGetAll(COL.MASTER_KENDARAAN);
  const now = new Date();
  const soon = [];
  kendaraan.forEach(k => {
    ["tgl_stnk_tahunan", "tgl_pajak_5thn", "tgl_kir"].forEach(f => {
      const d = smartParseDate(k[f]);
      if (!d) return;
      const days = Math.round((d - now) / 86400000);
      if (days >= 0 && days <= 30) soon.push({ no_polisi: k.no_polisi, label: f.replace("tgl_", "").replace(/_/g, " ").toUpperCase(), date: d, days });
    });
  });
  if (!soon.length) { wrap.innerHTML = ""; return; }
  soon.sort((a, b) => a.days - b.days);
  wrap.innerHTML = `
    <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4">
      <p class="text-sm font-semibold text-amber-800 mb-2">⚠ ${soon.length} Dokumen Kendaraan Segera Jatuh Tempo</p>
      <div class="flex flex-wrap gap-2">
        ${soon.map(s => `<span class="text-xs bg-white border border-amber-200 rounded-full px-3 py-1 text-amber-700">${escapeHtml(s.no_polisi)} • ${s.label} • ${s.days} hari lagi</span>`).join("")}
      </div>
    </div>`;
}
