import { db, collection, getDocs, addDoc, query, where } from "../firebase-config.js";
import { openModal, closeModal, toast, genId, escapeHtml } from "../utils.js";
import { emptyState, skeletonRows } from "../components.js";

const COLLECTION_NAME = "sales_outlets";

// Seed default outlets if none exist
const DEFAULT_OUTLETS = [
  { id: "OT-001", kode: "OT-001", nama: "Supermarket Pamella 1", wilayah: "Yogyakarta", alamat: "Jl. Kusumanegara No.141, Umbulharjo", telepon: "0274-377243", tipe: "Supermarket" },
  { id: "OT-002", kode: "OT-002", nama: "Mirota Kampus Godean", wilayah: "Sleman", alamat: "Jl. Raya Godean Km.2.8, Sleman", telepon: "0274-561234", tipe: "Supermarket" },
  { id: "OT-003", kode: "OT-003", nama: "Toko Kelontong Berkah", wilayah: "Bantul", alamat: "Jl. Bantul Km.7, Pendowoharjo, Sewon", telepon: "0812-3456-7890", tipe: "Retail" },
  { id: "OT-004", kode: "OT-004", nama: "Suryamart Wates", wilayah: "Kulon Progo", alamat: "Jl. Wates Km. 1, Kulon Progo", telepon: "0857-1111-2222", tipe: "Minimarket" }
];

export async function mount(container, { session }) {
  const tableBody = container.querySelector("#outlet-table-body");
  const emptyStateContainer = container.querySelector("#outlet-empty-state");
  const searchInput = container.querySelector("#search-outlet");
  const regionFilter = container.querySelector("#filter-region");
  const btnAddOutlet = container.querySelector("#btn-add-outlet");

  let outletList = [];

  async function loadOutlets() {
    tableBody.innerHTML = skeletonRows(5);
    emptyStateContainer.classList.add("hidden");

    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      outletList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // If empty, seed default items
      if (outletList.length === 0) {
        for (const outlet of DEFAULT_OUTLETS) {
          await addDoc(collection(db, COLLECTION_NAME), outlet);
        }
        // reload
        const reloadSnap = await getDocs(collection(db, COLLECTION_NAME));
        outletList = reloadSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      renderList();
    } catch (e) {
      console.error(e);
      tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500 font-medium">Gagal memuat data outlet: ${e.message}</td></tr>`;
    }
  }

  function renderList() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const regionVal = regionFilter.value;

    const filtered = outletList.filter(o => {
      const matchesSearch = (o.nama || "").toLowerCase().includes(searchVal) ||
                            (o.kode || "").toLowerCase().includes(searchVal) ||
                            (o.alamat || "").toLowerCase().includes(searchVal);
      const matchesRegion = !regionVal || o.wilayah === regionVal;
      return matchesSearch && matchesRegion;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = "";
      emptyStateContainer.innerHTML = emptyState("Tidak ada outlet ditemukan", "Ganti kata kunci pencarian atau bersihkan filter wilayah Anda.");
      emptyStateContainer.classList.remove("hidden");
      return;
    }

    emptyStateContainer.classList.add("hidden");
    tableBody.innerHTML = filtered.map(o => `
      <tr class="hover:bg-slate-50/50 transition">
        <td class="px-6 py-4 font-mono font-semibold text-slate-700">${escapeHtml(o.kode)}</td>
        <td class="px-6 py-4 font-medium text-slate-800">${escapeHtml(o.nama)}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            ${escapeHtml(o.wilayah)}
          </span>
        </td>
        <td class="px-6 py-4 text-xs max-w-xs truncate" title="${escapeHtml(o.alamat)}">${escapeHtml(o.alamat)}</td>
        <td class="px-6 py-4 font-mono text-xs">${escapeHtml(o.telepon || "-")}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-maroon-50 text-maroon-700">
            ${escapeHtml(o.tipe || "Retail")}
          </span>
        </td>
        <td class="px-6 py-4 text-right">
          <button data-id="${o.id}" class="btn-detail text-maroon-700 hover:text-maroon-900 font-semibold text-xs transition">
            Lihat Detail
          </button>
        </td>
      </tr>
    `).join("");

    tableBody.querySelectorAll(".btn-detail").forEach(btn => {
      btn.addEventListener("click", () => {
        const outlet = outletList.find(x => x.id === btn.dataset.id);
        if (outlet) openDetailModal(outlet);
      });
    });
  }

  function openDetailModal(outlet) {
    openModal({
      title: `Detail Outlet: ${escapeHtml(outlet.nama)}`,
      size: "md",
      bodyHtml: `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Kode Outlet</span>
              <span class="font-mono font-semibold text-slate-800 text-sm">${escapeHtml(outlet.kode)}</span>
            </div>
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Tipe / Kategori</span>
              <span class="font-bold text-maroon-700 text-sm uppercase">${escapeHtml(outlet.tipe)}</span>
            </div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block">Nama Outlet</span>
            <span class="font-semibold text-slate-800 text-sm">${escapeHtml(outlet.nama)}</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Wilayah / Daerah</span>
              <span class="text-slate-800 text-sm">${escapeHtml(outlet.wilayah)}</span>
            </div>
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">No. Telepon</span>
              <span class="font-mono text-slate-800 text-sm">${escapeHtml(outlet.telepon || "-")}</span>
            </div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block">Alamat Lengkap</span>
            <span class="text-slate-700 text-xs leading-relaxed block bg-slate-50 p-3 rounded-lg border border-slate-100">${escapeHtml(outlet.alamat)}</span>
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

  btnAddOutlet.onclick = () => {
    openModal({
      title: "Tambah Outlet Baru",
      size: "md",
      bodyHtml: `
        <form id="form-outlet" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Nama Outlet</label>
            <input name="nama" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Contoh: Toko Maju Jaya">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Wilayah</label>
              <select name="wilayah" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition bg-white">
                <option value="Yogyakarta">Yogyakarta</option>
                <option value="Sleman">Sleman</option>
                <option value="Bantul">Bantul</option>
                <option value="Kulon Progo">Kulon Progo</option>
                <option value="Gunungkidul">Gunungkidul</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Tipe Outlet</label>
              <select name="tipe" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition bg-white">
                <option value="Retail">Retail / Toko Kelontong</option>
                <option value="Minimarket">Minimarket</option>
                <option value="Supermarket">Supermarket</option>
                <option value="Grosir">Grosir / Distributor</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">No. Telepon / HP</label>
            <input name="telepon" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Contoh: 0812-3456-7890">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Alamat Lengkap</label>
            <textarea name="alamat" required rows="3" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Alamat jalan, nomor, RT/RW, kelurahan..."></textarea>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-outlet" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-outlet" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md">Simpan Outlet</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-cancel-outlet").onclick = closeModal;
        m.querySelector("#btn-save-outlet").onclick = async () => {
          const form = m.querySelector("#form-outlet");
          if (!form.reportValidity()) return;

          const fd = new FormData(form);
          const btn = m.querySelector("#btn-save-outlet");
          btn.disabled = true;
          btn.innerHTML = "Menyimpan...";

          try {
            const nextCode = `OT-${String(outletList.length + 1).padStart(3, '0')}`;
            const payload = {
              kode: nextCode,
              nama: fd.get("nama"),
              wilayah: fd.get("wilayah"),
              tipe: fd.get("tipe"),
              telepon: fd.get("telepon"),
              alamat: fd.get("alamat")
            };

            await addDoc(collection(db, COLLECTION_NAME), payload);
            toast("Outlet baru berhasil ditambahkan!", "success");
            closeModal();
            loadOutlets();
          } catch (err) {
            toast(`Gagal menambahkan: ${err.message}`, "error");
            btn.disabled = false;
            btn.innerHTML = "Simpan Outlet";
          }
        };
      }
    });
  };

  searchInput.addEventListener("input", renderList);
  regionFilter.addEventListener("change", renderList);

  await loadOutlets();
  return { unmount() {} };
}
