import { db, collection, getDocs, addDoc } from "../firebase-config.js";
import { openModal, closeModal, toast, escapeHtml } from "../utils.js";
import { emptyState, skeletonRows } from "../components.js";

const COLLECTION_NAME = "sales_items";

// Seed default items if none exist
const DEFAULT_ITEMS = [
  { sku: "ICI-DLX-01", nama: "Dulux Catylac Interior Pure White 5L", kategori: "Cat Dekoratif (ICI)", cabang: "Cirebon & Malang", harga: 145000, satuan: "Galon", deskripsi: "Cat tembok emulsi berkualitas tinggi daya tutup maksimal." },
  { sku: "ICI-WTH-01", nama: "Dulux Weathershield Exterior 20L", kategori: "Cat Dekoratif (ICI)", cabang: "Cirebon & Malang", harga: 1850000, satuan: "Pail", deskripsi: "Cat tembok eksterior tahan cuaca ekstrem garansi 5 tahun." },
  { sku: "PRM-KUS-03", nama: "Kuas Prima Bulu Halus 3 Inch", kategori: "Alat Cat (Kuas Prima)", cabang: "Cirebon", harga: 12500, satuan: "Pcs", deskripsi: "Kuas cat kayu dan besi premium tidak gampang rontok." },
  { sku: "PRM-RLR-09", nama: "Roller Cat Prima Foam Pro 9 Inch", kategori: "Alat Cat (Kuas Prima)", cabang: "Cirebon", harga: 38000, satuan: "Set", deskripsi: "Roller cat tembok permukaan halus hemat konsumsi cat." },
  { sku: "DCT-KRN-12", nama: "Dcota Kran Tembok Kuningan Krom 1/2 Inch", kategori: "Sanitari & Fitting (Dcota)", cabang: "Cirebon", harga: 45000, satuan: "Pcs", deskripsi: "Kran air bahan kuningan tebal lapis krom anti karat." },
  { sku: "WMK-TNT-YL", nama: "Warna Mikha Pigmen Tinting Yellow Oxide 1L", kategori: "Warna & Tinting (Warna Mikha)", cabang: "Cirebon", harga: 95000, satuan: "Botol", deskripsi: "Pewarna cair pekat untuk mesin tinting cat." },
  { sku: "BLS-BTA-10", nama: "Bata Ringan Blesscon AAC 10x20x60cm", kategori: "Bata Ringan (Blesscon)", cabang: "Malang", harga: 650000, satuan: "M3", deskripsi: "Bata ringan presisi hemat semen perekat." },
  { sku: "BLS-MRT-40", nama: "Mortar Blesscon Perekat Bata Ringan 40kg", kategori: "Semen Instan (Blesscon)", cabang: "Malang", harga: 68000, satuan: "Sak", deskripsi: "Semen instan perekat hebel daya rekat kuat." }
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

  const btnImportExcel = container.querySelector("#btn-import-item-excel");
  if (btnImportExcel) {
    btnImportExcel.onclick = () => {
      openModal({
        title: "Import Master Item (Produk) dari Excel",
        size: "lg",
        bodyHtml: `
          <div class="space-y-4 text-left">
            <div class="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <h4 class="font-bold text-slate-800 text-sm mb-2 flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Struktur & Format Kolom Excel yang Diterima:
              </h4>
              <p class="text-xs text-slate-600 leading-relaxed mb-3">
                Sistem secara cerdas memetakan nama kolom Anda (tidak sensitif huruf besar/kecil). Pastikan dokumen Excel Anda memiliki baris header dengan setidaknya kolom berikut:
              </p>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">SKU / Kode Item</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: SKU, Kode Item, SKU Code, Kode</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Nama Produk</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Nama, Nama Produk, Nama Barang, Item Name, Name</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Kategori</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Kategori, Category</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Harga Jual (Rp)</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Harga, Harga Jual, Price, Rate</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Satuan (UoM)</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Satuan, UoM, Unit, Kemasan</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-slate-400 uppercase">Deskripsi (Opsional)</span>
                  <span class="text-slate-400 text-[11px] block mt-0.5">Contoh: Deskripsi, Keterangan, Description</span>
                </div>
              </div>
            </div>

            <!-- Drag & Drop Zone -->
            <div id="excel-dropzone" class="border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl p-8 text-center cursor-pointer transition">
              <input type="file" id="excel-file-input" class="hidden" accept=".xlsx, .xls, .csv">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <p class="font-semibold text-slate-700 text-sm">Tarik & letakkan berkas Excel Anda di sini</p>
              <p class="text-xs text-slate-400 mt-1">atau klik untuk memilih berkas (.xlsx, .xls, .csv)</p>
            </div>

            <!-- Preview Container -->
            <div id="import-preview-container" class="hidden space-y-3">
              <div class="flex items-center justify-between">
                <h5 class="font-bold text-slate-800 text-sm">Pratinjau Data Import (<span id="import-count">0</span> baris):</h5>
                <button id="btn-clear-import" class="text-rose-600 hover:text-rose-800 text-xs font-semibold">Ganti File</button>
              </div>
              <div class="max-h-56 overflow-y-auto border border-slate-100 rounded-xl">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="sticky top-0 bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                    <tr>
                      <th class="px-4 py-2">SKU / Kode</th>
                      <th class="px-4 py-2">Nama Barang</th>
                      <th class="px-4 py-2">Kategori</th>
                      <th class="px-4 py-2">Harga Jual</th>
                      <th class="px-4 py-2">Satuan</th>
                      <th class="px-4 py-2">Deskripsi</th>
                    </tr>
                  </thead>
                  <tbody id="import-preview-body" class="divide-y divide-slate-50 text-slate-600"></tbody>
                </table>
              </div>
            </div>
          </div>
        `,
        footerHtml: `
          <button id="btn-cancel-import" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
          <button id="btn-save-import" disabled class="bg-slate-300 text-slate-500 px-5 py-2 rounded-lg text-sm font-semibold transition cursor-not-allowed">Simpan Data</button>
        `,
        onMount: (m) => {
          const dropzone = m.querySelector("#excel-dropzone");
          const fileInput = m.querySelector("#excel-file-input");
          const previewContainer = m.querySelector("#import-preview-container");
          const previewBody = m.querySelector("#import-preview-body");
          const importCount = m.querySelector("#import-count");
          const btnClearImport = m.querySelector("#btn-clear-import");
          const btnSaveImport = m.querySelector("#btn-save-import");
          const btnCancelImport = m.querySelector("#btn-cancel-import");

          let parsedRows = [];

          btnCancelImport.onclick = closeModal;

          dropzone.onclick = () => fileInput.click();

          // Drag and drop handlers
          ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
            dropzone.addEventListener(eventName, e => {
              e.preventDefault();
              e.stopPropagation();
            });
          });

          dropzone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const file = dt.files[0];
            if (file) handleExcelFile(file);
          });

          fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) handleExcelFile(file);
          };

          btnClearImport.onclick = () => {
            fileInput.value = "";
            parsedRows = [];
            previewContainer.classList.add("hidden");
            dropzone.classList.remove("hidden");
            btnSaveImport.disabled = true;
            btnSaveImport.className = "bg-slate-300 text-slate-500 px-5 py-2 rounded-lg text-sm font-semibold transition cursor-not-allowed";
          };

          function handleExcelFile(file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(sheet);

                if (!json || json.length === 0) {
                  return toast("File Excel kosong atau tidak terbaca!", "warning");
                }

                parsedRows = json.map((row, index) => {
                  // Cerdas memetakan header kolom
                  const mapped = {};
                  for (const key of Object.keys(row)) {
                    const k = key.toLowerCase().trim();
                    const val = String(row[key] || "").trim();
                    if (k.includes("sku") || k.includes("kode item") || k.includes("sku code") || k.includes("kode")) {
                      mapped.sku = val.toUpperCase();
                    } else if (k.includes("nama produk") || k.includes("nama barang") || k.includes("item name") || k.includes("product name") || k.includes("nama") || k.includes("name")) {
                      mapped.nama = val;
                    } else if (k.includes("kategori") || k.includes("category")) {
                      mapped.kategori = val;
                    } else if (k.includes("harga") || k.includes("price") || k.includes("rate")) {
                      mapped.harga = Number(val.replace(/[^\d]/g, "")) || 0;
                    } else if (k.includes("satuan") || k.includes("uom") || k.includes("unit") || k.includes("kemasan")) {
                      mapped.satuan = val;
                    } else if (k.includes("deskripsi") || k.includes("keterangan") || k.includes("description") || k.includes("notes")) {
                      mapped.deskripsi = val;
                    }
                  }

                  // Validasi minimal
                  if (!mapped.nama) return null;

                  // Set defaults jika kosong
                  mapped.sku = mapped.sku || `SKU-TEMP-${Date.now()}-${index}`;
                  mapped.kategori = mapped.kategori || "Makanan";
                  mapped.harga = mapped.harga || 0;
                  mapped.satuan = mapped.satuan || "Pcs";
                  mapped.deskripsi = mapped.deskripsi || "-";

                  return mapped;
                }).filter(Boolean);

                if (parsedRows.length === 0) {
                  return toast("Gagal mengurai baris data! Pastikan kolom 'Nama Produk' ada.", "warning");
                }

                // Render Preview Table
                importCount.textContent = parsedRows.length;
                previewBody.innerHTML = parsedRows.map(r => `
                  <tr>
                    <td class="px-4 py-2 font-mono font-semibold">${escapeHtml(r.sku)}</td>
                    <td class="px-4 py-2 font-medium">${escapeHtml(r.nama)}</td>
                    <td class="px-4 py-2">${escapeHtml(r.kategori)}</td>
                    <td class="px-4 py-2 font-mono font-bold">Rp ${r.harga.toLocaleString("id-ID")}</td>
                    <td class="px-4 py-2 font-mono">${escapeHtml(r.satuan)}</td>
                    <td class="px-4 py-2 max-w-xs truncate" title="${escapeHtml(r.deskripsi)}">${escapeHtml(r.deskripsi)}</td>
                  </tr>
                `).join("");

                dropzone.classList.add("hidden");
                previewContainer.classList.remove("hidden");
                btnSaveImport.disabled = false;
                btnSaveImport.className = "bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md";

              } catch (err) {
                console.error(err);
                toast("Gagal membaca berkas Excel: " + err.message, "error");
              }
            };
            reader.readAsArrayBuffer(file);
          }

          btnSaveImport.onclick = async () => {
            btnSaveImport.disabled = true;
            btnSaveImport.innerHTML = "Menyimpan...";

            try {
              for (const r of parsedRows) {
                await addDoc(collection(db, COLLECTION_NAME), {
                  sku: r.sku,
                  nama: r.nama,
                  kategori: r.kategori,
                  harga: r.harga,
                  satuan: r.satuan,
                  deskripsi: r.deskripsi
                });
              }

              toast(`Berhasil mengimpor ${parsedRows.length} produk baru!`, "success");
              closeModal();
              loadItems();
            } catch (err) {
              console.error(err);
              toast("Gagal menyimpan data: " + err.message, "error");
              btnSaveImport.disabled = false;
              btnSaveImport.innerHTML = "Simpan Data";
            }
          };
        }
      });
    };
  }

  await loadItems();
  return { unmount() {} };
}
