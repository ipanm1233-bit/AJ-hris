import { db, collection, getDocs, addDoc, query, where } from "../firebase-config.js";
import { openModal, closeModal, toast, genId, escapeHtml } from "../utils.js";
import { emptyState, skeletonRows } from "../components.js";

const COLLECTION_NAME = "sales_outlets";

// Seed default outlets if none exist
const DEFAULT_OUTLETS = [
  { id: "OT-CRB-01", kode: "OT-CRB-01", nama: "Toko Cat Warna Abadi Cirebon", wilayah: "Cirebon", alamat: "Jl. Siliwangi No. 88, Cirebon", telepon: "0231-201988", tipe: "Depo Cat / Store" },
  { id: "OT-CRB-02", kode: "OT-CRB-02", nama: "TB Bangunan Jaya Bersama", wilayah: "Cirebon", alamat: "Jl. Pemuda No. 45, Cirebon", telepon: "0231-332110", tipe: "Toko Bangunan" },
  { id: "OT-CRB-03", kode: "OT-CRB-03", nama: "Depo Cat Prima Tuparev", wilayah: "Cirebon", alamat: "Jl. Tuparev No. 12, Cirebon", telepon: "0812-9876-5432", tipe: "Distributor Retail" },
  { id: "OT-MLG-01", kode: "OT-MLG-01", nama: "Toko Cat Dulux Paint Center Malang", wilayah: "Malang", alamat: "Jl. Ahmad Yani No. 102, Malang", telepon: "0341-491223", tipe: "Paint Center" },
  { id: "OT-MLG-02", kode: "OT-MLG-02", nama: "TB Malang Indah Building Supply", wilayah: "Malang", alamat: "Jl. Raya Dieng No. 15, Malang", telepon: "0341-567890", tipe: "Toko Bangunan" },
  { id: "OT-MLG-03", kode: "OT-MLG-03", nama: "Depo Material Blesscon Soekarno Hatta", wilayah: "Malang", alamat: "Jl. Soekarno Hatta No. 20, Malang", telepon: "0857-3333-4444", tipe: "Agent Blesscon" }
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

      updateRegionDropdown();
      renderList();
    } catch (e) {
      console.error(e);
      tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500 font-medium">Gagal memuat data outlet: ${e.message}</td></tr>`;
    }
  }

  function updateRegionDropdown() {
    if (!regionFilter) return;
    const currentVal = regionFilter.value;
    const rawRegions = outletList
      .map(o => o.wilayah || o.kategori || o.cabang || o.wilayah_sales || "")
      .filter(Boolean);
    const uniqueRegions = Array.from(new Set(rawRegions)).sort();

    regionFilter.innerHTML = `
      <option value="">Semua Wilayah / Kategori Outlet (${outletList.length})</option>
      ${uniqueRegions.map(r => `<option value="${escapeHtml(r)}"${r === currentVal ? " selected" : ""}>${escapeHtml(r)}</option>`).join("")}
    `;
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

  const btnImportExcel = container.querySelector("#btn-import-outlet-excel");
  if (btnImportExcel) {
    btnImportExcel.onclick = () => {
      openModal({
        title: "Import Master Outlet dari Excel",
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
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Nama Outlet</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Nama, Nama Outlet, Name</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Wilayah</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Wilayah, Daerah, Region, Kota</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Alamat Lengkap</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Alamat, Alamat Lengkap, Address</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">No. Telepon</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Telepon, No Telepon, Phone, HP</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-emerald-700 uppercase">Tipe Outlet</span>
                  <span class="text-slate-500 text-[11px] block mt-0.5">Contoh: Tipe, Tipe Outlet, Kelas, Kategori</span>
                </div>
                <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                  <span class="block text-[10px] font-bold text-slate-400 uppercase">Kode Outlet (Opsional)</span>
                  <span class="text-slate-400 text-[11px] block mt-0.5">Bisa kosong (auto-generate OT-001 dst)</span>
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
                      <th class="px-4 py-2">Kode</th>
                      <th class="px-4 py-2">Nama Outlet</th>
                      <th class="px-4 py-2">Wilayah</th>
                      <th class="px-4 py-2">Alamat</th>
                      <th class="px-4 py-2">Telepon</th>
                      <th class="px-4 py-2">Tipe</th>
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
                    if (k.includes("nama") || k.includes("name")) {
                      mapped.nama = val;
                    } else if (k.includes("wilayah") || k.includes("daerah") || k.includes("region") || k.includes("kota")) {
                      mapped.wilayah = val;
                    } else if (k.includes("alamat") || k.includes("address")) {
                      mapped.alamat = val;
                    } else if (k.includes("telepon") || k.includes("phone") || k.includes("hp") || k.includes("telp")) {
                      mapped.telepon = val;
                    } else if (k.includes("tipe") || k.includes("type") || k.includes("kelas") || k.includes("kategori")) {
                      mapped.tipe = val;
                    } else if (k.includes("kode") || k.includes("code")) {
                      mapped.kode = val;
                    }
                  }

                  // Validasi minimal
                  if (!mapped.nama) return null;

                  // Set defaults jika kosong
                  mapped.wilayah = mapped.wilayah || "Yogyakarta";
                  mapped.tipe = mapped.tipe || "Retail";
                  mapped.alamat = mapped.alamat || "-";
                  mapped.telepon = mapped.telepon || "-";

                  return mapped;
                }).filter(Boolean);

                if (parsedRows.length === 0) {
                  return toast("Gagal mengurai baris data! Pastikan kolom 'Nama Outlet' ada.", "warning");
                }

                // Render Preview Table
                importCount.textContent = parsedRows.length;
                previewBody.innerHTML = parsedRows.map((r, i) => `
                  <tr>
                    <td class="px-4 py-2 font-mono font-semibold">${escapeHtml(r.kode || `(Auto: OT-${String(outletList.length + 1 + i).padStart(3, '0')})`)}</td>
                    <td class="px-4 py-2 font-medium">${escapeHtml(r.nama)}</td>
                    <td class="px-4 py-2">${escapeHtml(r.wilayah)}</td>
                    <td class="px-4 py-2 max-w-xs truncate" title="${escapeHtml(r.alamat)}">${escapeHtml(r.alamat)}</td>
                    <td class="px-4 py-2 font-mono">${escapeHtml(r.telepon)}</td>
                    <td class="px-4 py-2 uppercase font-bold text-[10px] text-maroon-700">${escapeHtml(r.tipe)}</td>
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
              let nextIdx = outletList.length + 1;
              for (const r of parsedRows) {
                const kodeStr = r.kode || `OT-${String(nextIdx++).padStart(3, '0')}`;
                await addDoc(collection(db, COLLECTION_NAME), {
                  kode: kodeStr,
                  nama: r.nama,
                  wilayah: r.wilayah,
                  alamat: r.alamat,
                  telepon: r.telepon,
                  tipe: r.tipe
                });
              }

              toast(`Berhasil mengimpor ${parsedRows.length} data outlet baru!`, "success");
              closeModal();
              loadOutlets();
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

  await loadOutlets();
  return { unmount() {} };
}
