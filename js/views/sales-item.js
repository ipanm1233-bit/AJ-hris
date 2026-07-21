import { db, collection, getDocs, addDoc } from "../firebase-config.js";
import { openModal, closeModal, toast, escapeHtml } from "../utils.js";
import { emptyState, skeletonRows } from "../components.js";

const COLLECTION_NAME = "sales_items";

// Seed default items if none exist
const DEFAULT_ITEMS = [
  { sku: "SKU-GULA-01", nama: "Gula Pasir Andela Premium 1kg", kategori: "Sembako", harga: 16500, satuan: "Pcs", deskripsi: "Gula pasir tebu asli, butiran halus dan putih bersih." },
  { sku: "SKU-BERAS-01", nama: "Beras Mentari Wangi 5kg", kategori: "Sembako", harga: 78000, satuan: "Bag", deskripsi: "Beras poles super pulen dan beraroma pandan alami." },
  { sku: "SKU-TEH-01", nama: "Teh Melati Wangi Khas Andela", kategori: "Minuman", harga: 6000, satuan: "Pack", deskripsi: "Teh celup melati khas dengan rasa pekat mendalam." },
  { sku: "SKU-KOPI-01", nama: "Kopi Arabika Bubuk Java 250gr", kategori: "Minuman", harga: 32000, satuan: "Pcs", deskripsi: "Kopi murni 100% Arabika giling halus siap seduh." },
  { sku: "SKU-SNACK-01", nama: "Keripik Singkong Renyah Andela", kategori: "Makanan", harga: 11000, satuan: "Pcs", deskripsi: "Camilan keripik singkong gurih aneka rasa." }
];

export async function mount(container, { session }) {
  const tableBody = container.querySelector("#item-table-body");
  const emptyStateContainer = container.querySelector("#item-empty-state");
  const searchInput = container.querySelector("#search-item");
  const categoryFilter = container.querySelector("#filter-category");
  const btnAddItem = container.querySelector("#btn-add-item");

  let itemList = [];

  async function loadItems() {
    tableBody.innerHTML = skeletonRows(5);
    emptyStateContainer.classList.add("hidden");

    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      itemList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // If empty, seed default items
      if (itemList.length === 0) {
        for (const item of DEFAULT_ITEMS) {
          await addDoc(collection(db, COLLECTION_NAME), item);
        }
        // reload
        const reloadSnap = await getDocs(collection(db, COLLECTION_NAME));
        itemList = reloadSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      renderList();
    } catch (e) {
      console.error(e);
      tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500 font-medium">Gagal memuat data item: ${e.message}</td></tr>`;
    }
  }

  function renderList() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const catVal = categoryFilter.value;

    const filtered = itemList.filter(i => {
      const matchesSearch = (i.nama || "").toLowerCase().includes(searchVal) ||
                            (i.sku || "").toLowerCase().includes(searchVal) ||
                            (i.kategori || "").toLowerCase().includes(searchVal);
      const matchesCategory = !catVal || i.kategori === catVal;
      return matchesSearch && matchesCategory;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = "";
      emptyStateContainer.innerHTML = emptyState("Tidak ada item ditemukan", "Ganti kata kunci pencarian atau bersihkan filter kategori Anda.");
      emptyStateContainer.classList.remove("hidden");
      return;
    }

    emptyStateContainer.classList.add("hidden");
    tableBody.innerHTML = filtered.map(i => `
      <tr class="hover:bg-slate-50/50 transition">
        <td class="px-6 py-4 font-mono font-semibold text-slate-700">${escapeHtml(i.sku)}</td>
        <td class="px-6 py-4 font-medium text-slate-800">${escapeHtml(i.nama)}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            ${escapeHtml(i.kategori)}
          </span>
        </td>
        <td class="px-6 py-4 font-mono font-bold text-slate-800">Rp ${Number(i.harga || 0).toLocaleString("id-ID")}</td>
        <td class="px-6 py-4 font-mono text-xs text-slate-500">${escapeHtml(i.satuan || "Pcs")}</td>
        <td class="px-6 py-4 text-xs max-w-xs truncate" title="${escapeHtml(i.deskripsi || '')}">${escapeHtml(i.deskripsi || "-")}</td>
        <td class="px-6 py-4 text-right">
          <button data-id="${i.id}" class="btn-detail text-maroon-700 hover:text-maroon-900 font-semibold text-xs transition">
            Detail
          </button>
        </td>
      </tr>
    `).join("");

    tableBody.querySelectorAll(".btn-detail").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = itemList.find(x => x.id === btn.dataset.id);
        if (item) openDetailModal(item);
      });
    });
  }

  function openDetailModal(item) {
    openModal({
      title: `Detail Produk: ${escapeHtml(item.sku)}`,
      size: "md",
      bodyHtml: `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">SKU / Kode Item</span>
              <span class="font-mono font-semibold text-slate-800 text-sm">${escapeHtml(item.sku)}</span>
            </div>
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Kategori</span>
              <span class="font-semibold text-slate-800 text-sm">${escapeHtml(item.kategori)}</span>
            </div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block">Nama Barang</span>
            <span class="font-bold text-slate-800 text-sm">${escapeHtml(item.nama)}</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Harga Jual Jaringan</span>
              <span class="font-mono font-extrabold text-maroon-700 text-sm">Rp ${Number(item.harga || 0).toLocaleString("id-ID")}</span>
            </div>
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Satuan (UoM)</span>
              <span class="font-semibold text-slate-800 text-sm">${escapeHtml(item.satuan)}</span>
            </div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block">Deskripsi / Spesifikasi</span>
            <span class="text-slate-700 text-xs leading-relaxed block bg-slate-50 p-3 rounded-lg border border-slate-100">${escapeHtml(item.deskripsi || "-")}</span>
          </div>
        </div>
      `,
      footerHtml: `
        <button id="btn-close-modal" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2 rounded-lg text-sm font-semibold transition">Tutup</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-close-modal").onclick = closeModal;
      }
    });
  }

  btnAddItem.onclick = () => {
    openModal({
      title: "Tambah Item Baru",
      size: "md",
      bodyHtml: `
        <form id="form-item" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">SKU / Kode Item</label>
              <input name="sku" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition uppercase font-mono" placeholder="Contoh: SKU-GULA-02">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Kategori</label>
              <select name="kategori" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition bg-white">
                <option value="Makanan">Makanan</option>
                <option value="Minuman">Minuman</option>
                <option value="Sembako">Sembako</option>
                <option value="Kebutuhan Rumah Tangga">Kebutuhan Rumah Tangga</option>
                <option value="Lain-lain">Lain-lain</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Nama Produk</label>
            <input name="nama" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Contoh: Gula Premium 500gr">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Harga Jual (Rp)</label>
              <input type="number" name="harga" required min="0" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition font-mono" placeholder="Contoh: 15000">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Satuan Kemasan (UoM)</label>
              <input name="satuan" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Contoh: Pcs, Bag, Pack, Dus">
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Deskripsi Produk</label>
            <textarea name="deskripsi" rows="3" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Isikan info pelengkap produk..."></textarea>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-item" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-item" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md">Simpan Item</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-cancel-item").onclick = closeModal;
        m.querySelector("#btn-save-item").onclick = async () => {
          const form = m.querySelector("#form-item");
          if (!form.reportValidity()) return;

          const fd = new FormData(form);
          const btn = m.querySelector("#btn-save-item");
          btn.disabled = true;
          btn.innerHTML = "Menyimpan...";

          try {
            const payload = {
              sku: fd.get("sku").trim().toUpperCase(),
              nama: fd.get("nama"),
              kategori: fd.get("kategori"),
              harga: Number(fd.get("harga")),
              satuan: fd.get("satuan"),
              deskripsi: fd.get("deskripsi")
            };

            await addDoc(collection(db, COLLECTION_NAME), payload);
            toast("Produk baru berhasil disimpan!", "success");
            closeModal();
            loadItems();
          } catch (err) {
            toast(`Gagal menambahkan: ${err.message}`, "error");
            btn.disabled = false;
            btn.innerHTML = "Simpan Item";
          }
        };
      }
    });
  };

  searchInput.addEventListener("input", renderList);
  categoryFilter.addEventListener("change", renderList);

  await loadItems();
  return { unmount() {} };
}
