import { COL } from "../firebase-config.js";
import { fsGetAll, fsUpdate, toNumber, genId } from "../utils.js";
import { renderCrudModule } from "../components.js";

export async function mount(container) {
  const panels = {
    barang: container.querySelector("#inv-panel-barang"),
    ambil: container.querySelector("#inv-panel-ambil"),
    opname: container.querySelector("#inv-panel-opname"),
  };
  const loaded = {};

  async function loadBarang() {
    const fields = [
      { name: "id_item", label: "ID Barang", type: "text", required: true },
      { name: "nama_barang", label: "Nama Barang", type: "text", required: true, full: true },
      { name: "kategori", label: "Kategori", type: "select", options: ["ATK", "Elektronik", "Furniture", "Consumable", "Lainnya"] },
      { name: "satuan", label: "Satuan", type: "text" },
      { name: "lokasi", label: "Lokasi Penyimpanan", type: "text" },
      { name: "stok_awal", label: "Stok Awal", type: "number", default: 0 },
      { name: "stok_saat_ini", label: "Stok Saat Ini", type: "number", default: 0 },
    ];
    fields.idFromField = "id_item";
    await renderCrudModule(panels.barang, {
      title: "Master Barang",
      subtitle: "Katalog aset kantor & alat tulis kantor beserta stok berjalan.",
      collectionName: COL.MASTER_INVENTORY,
      orderByField: "nama_barang",
      searchFields: ["nama_barang", "id_item", "kategori"],
      columns: [
        { key: "id_item", label: "ID" },
        { key: "nama_barang", label: "Nama Barang" },
        { key: "kategori", label: "Kategori", type: "badge" },
        { key: "stok_saat_ini", label: "Stok Saat Ini", type: "number" },
        { key: "satuan", label: "Satuan" },
        { key: "lokasi", label: "Lokasi" },
      ],
      formFields: fields
    });
  }

  async function loadAmbil() {
    const items = await fsGetAll(COL.MASTER_INVENTORY);
    
    await renderCrudModule(panels.ambil, {
      title: "Log Pengambilan Barang",
      subtitle: "Setiap pengambilan otomatis mengurangi stok barang terkait.",
      collectionName: COL.LOG_INVENTORY_PENGAMBILAN,
      idPrefix: "AMB",
      canEdit: false,
      searchFields: ["nama_barang", "nama_karyawan"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_barang", label: "Barang" },
        { key: "nama_karyawan", label: "Diambil Oleh" },
        { key: "jumlah_ambil", label: "Jumlah", type: "number" },
        { key: "keperluan", label: "Keperluan" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        {
          // PERUBAHAN 1: Buat field sementara untuk dropdown nama barang
          name: "nama_barang_pilihan", 
          label: "Pilih Barang", 
          type: "select", 
          required: true,
          // Menampilkan daftar nama barang (hanya yang stoknya lebih dari 0)
          options: items.filter(i => toNumber(i.stok_saat_ini) > 0).map(i => i.nama_barang)
        },
        { name: "nama_karyawan", label: "Diambil Oleh", type: "text", required: true },
        { name: "jumlah_ambil", label: "Jumlah Diambil", type: "number", required: true, default: 1 },
        { name: "keperluan", label: "Keperluan", type: "textarea", full: true },
      ],
      beforeSave: async (data) => {
        // PERUBAHAN 2: Cari objek barang aslinya berdasarkan NAMA BARANG yang dipilih
        const item = items.find(i => i.nama_barang === data.nama_barang_pilihan);
        
        if (item) {
          // Kalkulasi pengurangan stok
          const newStok = Math.max(toNumber(item.stok_saat_ini) - toNumber(data.jumlah_ambil), 0);
          
          // Update stok di database MASTER_INVENTORY
          await fsUpdate(COL.MASTER_INVENTORY, item.id, { stok_saat_ini: newStok });
          
          // Update state lokal agar tidak perlu refresh halaman
          item.stok_saat_ini = newStok;
          
          // Simpan nama barang dan id aslinya ke data Log yang akan di-save
          data.id_barang = item.id_item;
          data.nama_barang = item.nama_barang;
        } else {
           throw new Error("Barang tidak ditemukan. Silakan refresh halaman.");
        }

        // Hapus field pilihan temporary agar tidak ikut masuk ke database
        delete data.nama_barang_pilihan;
        
        return data;
      }
    });
  }

  async function loadOpname() {
    await renderCrudModule(panels.opname, {
      title: "Stock Opname",
      subtitle: "Pencatatan hasil audit fisik stok berkala.",
      collectionName: COL.STOCK_OPNAME,
      idPrefix: "OPN",
      searchFields: ["nama_barang", "nama_karyawan"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_barang", label: "Barang" },
        { key: "jumlah_ambil", label: "Selisih/Jumlah", type: "number" },
        { key: "nama_karyawan", label: "Petugas" },
        { key: "keperluan", label: "Catatan" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "id_barang", label: "ID Barang", type: "text", required: true },
        { name: "nama_barang", label: "Nama Barang", type: "text", required: true },
        { name: "jumlah_ambil", label: "Jumlah Hasil Opname", type: "number", required: true },
        { name: "nama_karyawan", label: "Petugas Opname", type: "text", required: true },
        { name: "keperluan", label: "Catatan", type: "textarea", full: true },
      ]
    });
  }

  await loadBarang(); loaded.barang = true;

  container.querySelectorAll(".inv-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.itab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".inv-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
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
