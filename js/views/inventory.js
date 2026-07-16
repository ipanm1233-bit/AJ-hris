import { COL } from "../firebase-config.js";
import { fsGetAll, fsUpdate, toNumber, escapeHtml, fmtDateShort } from "../utils.js";
import { renderCrudModule } from "../components.js";
import { isoDocHeaderTable } from "../branding.js";

// FUNGSI CETAK BLANKO STOCK OPNAME
async function printBlankoOpname() {
  const items = await fsGetAll(COL.MASTER_INVENTORY);
  items.sort((a,b) => a.nama_barang.localeCompare(b.nama_barang));
  
  const printWindow = window.open('', '_blank');
  let tableRows = items.map(i => `
    <tr>
      <td>${escapeHtml(i.id_item)}</td>
      <td>${escapeHtml(i.nama_barang)}</td>
      <td>${escapeHtml(i.kategori)}</td>
      <td style="text-align:center;">${i.stok_saat_ini}</td>
      <td></td>
      <td></td>
    </tr>`).join("");

  const html = `
    <html><head><title>Blanko Stock Opname</title>
    <style>
      body { font-family: 'Times New Roman', serif; font-size: 12px; padding: 30px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #000; padding: 6px; }
      th { background: #f0f0f0; }
    </style></head>
    <body onload="setTimeout(() => { window.print(); window.close(); }, 800);">
      ${isoDocHeaderTable({ judul: "BLANKO PEMERIKSAAN FISIK GUDANG (STOCK OPNAME)", noDok: "GA-OPNAME", hal: "1 dari 1" })}
      <table>
        <thead>
          <tr><th>ID Barang</th><th>Nama Barang</th><th>Kategori</th><th width="10%">Stok Sistem</th><th width="15%">Stok Fisik Gudang</th><th width="20%">Keterangan/Selisih</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div style="margin-top:30px; display:flex; justify-content:space-between; text-align:center;">
         <div style="width:30%;">Petugas Pemeriksa,<br/><br/><br/><br/>( ........................ )</div>
         <div style="width:30%;">Mengetahui,<br/><br/><br/><br/>( ........................ )</div>
      </div>
    </body></html>`;
  printWindow.document.write(html); printWindow.document.close();
}

function printTandaTerimaBarang(row) {
  const printWindow = window.open('', '_blank');
  const html = `
    <html><head><title>Tanda Terima - ${escapeHtml(row.nama_barang || "")}</title>
    <style>body { font-family: 'Times New Roman', serif; font-size: 14px; padding: 30px; line-height: 1.5;} .it{width: 100%; border-collapse: collapse; margin-top: 20px;} .it td{border: 1px solid #000; padding: 6px 10px;}</style></head>
    <body onload="setTimeout(() => { window.print(); window.close(); }, 800);">
      ${isoDocHeaderTable({ judul: "TANDA TERIMA BARANG INVENTORY / ATK", noDok: "GA1", terbitRevisi: "1/1", hal: "1 dari 1" })}
      <table class="it">
        <tr><td width="35%" style="font-weight:bold; background:#f9fafb;">Tanggal</td><td>${fmtDateShort(row.tanggal)}</td></tr>
        <tr><td style="font-weight:bold; background:#f9fafb;">Nama Barang</td><td>${escapeHtml(row.nama_barang || "-")}</td></tr>
        <tr><td style="font-weight:bold; background:#f9fafb;">Jumlah</td><td>${escapeHtml(String(row.jumlah_ambil ?? "-"))}</td></tr>
        <tr><td style="font-weight:bold; background:#f9fafb;">Diambil Oleh</td><td>${escapeHtml(row.nama_karyawan || "-")}</td></tr>
      </table>
      <table style="width:100%; text-align:center; margin-top:40px;">
        <tr><td width="50%">Yang Menyerahkan,</td><td width="50%">Yang Menerima,</td></tr>
        <tr><td height="80"></td><td></td></tr>
        <tr><td>( ................................... )</td><td>( <strong>${escapeHtml(row.nama_karyawan || "")}</strong> )</td></tr>
      </table>
    </body></html>`;
  printWindow.document.write(html); printWindow.document.close();
}

export async function mount(container) {
  const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeEmpNames = karyawan.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF").map(k => k.nama_karyawan).sort();

  const panels = {
    barang: container.querySelector("#inv-panel-barang"),
    ambil: container.querySelector("#inv-panel-ambil"),
    opname: container.querySelector("#inv-panel-opname"),
  };
  const loaded = {};

  async function loadBarang() {
    await renderCrudModule(panels.barang, {
      title: "Master Barang",
      collectionName: COL.MASTER_INVENTORY,
      orderByField: "nama_barang", searchFields: ["nama_barang", "id_item", "kategori"],
      columns: [
        { key: "id_item", label: "ID" }, { key: "nama_barang", label: "Nama Barang" },
        { key: "kategori", label: "Kategori", type: "badge" }, { key: "stok_saat_ini", label: "Stok Saat Ini", type: "number" },
        { key: "satuan", label: "Satuan" }, { key: "lokasi", label: "Lokasi" },
      ],
      formFields: Object.assign([
        { name: "id_item", label: "ID Barang", type: "text", required: true },
        { name: "nama_barang", label: "Nama Barang", type: "text", required: true, full: true },
        { name: "kategori", label: "Kategori", type: "select", options: ["ATK", "Elektronik", "Furniture", "Lainnya"] },
        { name: "satuan", label: "Satuan", type: "text" }, { name: "lokasi", label: "Lokasi Penyimpanan", type: "text" },
        { name: "stok_awal", label: "Stok Awal", type: "number", default: 0 }, { name: "stok_saat_ini", label: "Stok Saat Ini", type: "number", default: 0 },
      ], { idFromField: "id_item" })
    });
  }

  async function loadAmbil() {
    const items = await fsGetAll(COL.MASTER_INVENTORY);
    await renderCrudModule(panels.ambil, {
      title: "Log Pengambilan Barang",
      collectionName: COL.LOG_INVENTORY_PENGAMBILAN, idPrefix: "AMB", canEdit: false,
      printFn: printTandaTerimaBarang, printLabel: "Cetak Tanda Terima",
      searchFields: ["nama_barang", "nama_karyawan"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" }, { key: "nama_barang", label: "Barang" },
        { key: "nama_karyawan", label: "Diambil Oleh" }, { key: "jumlah_ambil", label: "Jumlah", type: "number" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "nama_barang_pilihan", label: "Pilih Barang", type: "select", required: true, options: items.filter(i => toNumber(i.stok_saat_ini) > 0).map(i => i.nama_barang) },
        { name: "nama_karyawan", label: "Diambil Oleh", type: "select", options: activeEmpNames, required: true },
        { name: "jumlah_ambil", label: "Jumlah Diambil", type: "number", required: true, default: 1 },
        { name: "keperluan", label: "Keperluan", type: "textarea", full: true },
      ],
      beforeSave: async (data) => {
        const item = items.find(i => i.nama_barang === data.nama_barang_pilihan);
        if (!item) throw new Error("Barang tidak ditemukan.");
        const newStok = Math.max(toNumber(item.stok_saat_ini) - toNumber(data.jumlah_ambil), 0);
        await fsUpdate(COL.MASTER_INVENTORY, item.id, { stok_saat_ini: newStok });
        item.stok_saat_ini = newStok;
        data.id_barang = item.id_item; data.nama_barang = item.nama_barang;
        delete data.nama_barang_pilihan;
        return data;
      }
    });
  }

  async function loadOpname() {
    await renderCrudModule(panels.opname, {
      title: "Stock Opname",
      collectionName: COL.STOCK_OPNAME, idPrefix: "OPN",
      searchFields: ["nama_barang", "nama_karyawan"],
      extraToolbarHtml: `<button id="btn-print-blanko" class="bg-slate-800 text-white px-3 py-2 rounded-lg text-sm shadow hover:bg-slate-900 transition flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Cetak Blanko Opname (PDF)</button>`,
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" }, { key: "nama_barang", label: "Barang" },
        { key: "jumlah_ambil", label: "Selisih", type: "number" }, { key: "nama_karyawan", label: "Petugas" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "nama_barang", label: "Nama Barang (Sesuai ID)", type: "text", required: true },
        { name: "jumlah_ambil", label: "Jumlah Hasil Opname", type: "number", required: true },
        { name: "nama_karyawan", label: "Petugas", type: "select", options: activeEmpNames, required: true },
        { name: "keperluan", label: "Catatan", type: "textarea", full: true },
      ]
    });
    panels.opname.querySelector("#btn-print-blanko").onclick = printBlankoOpname;
  }

  await loadBarang(); loaded.barang = true;
  container.querySelectorAll(".inv-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.itab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".inv-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "ambil") await loadAmbil();
        if (tab === "opname") await loadOpname();
      }
    });
  });

  return { unmount() {} };
}
