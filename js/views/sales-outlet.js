import { db, collection, getDocs, addDoc, doc, updateDoc, query, where } from "../firebase-config.js";
import {
  openModal, closeModal, toast, genId, escapeHtml,
  geocodeAddressSmart, parseGpsCoordinates, isValidOperationalCoordinate,
  fsGetAll, fsUpdate, cleanStoreName
} from "../utils.js";
import { emptyState, skeletonRows } from "../components.js";
import { hasSubMenuAccess, canEditModuleData } from "../auth.js";

const COLLECTION_NAME = "sales_outlets";

// Seed default outlets with valid GPS coordinates if none exist
const DEFAULT_OUTLETS = [
  { id: "OT-CRB-01", kode: "OT-CRB-01", nama: "Toko Cat Warna Abadi Cirebon", wilayah: "Cirebon", alamat: "Jl. Siliwangi No. 88, Cirebon", koordinat_gps: "-6.713500, 108.558200", lat: -6.7135, lng: 108.5582, telepon: "0231-201988", tipe: "Depo Cat / Store", assigned_sales_nama: "Andika Putera", assigned_sales_nik: "SLS-001" },
  { id: "OT-CRB-02", kode: "OT-CRB-02", nama: "TB Bangunan Jaya Bersama", wilayah: "Cirebon", alamat: "Jl. Pemuda No. 45, Cirebon", koordinat_gps: "-6.726800, 108.554300", lat: -6.7268, lng: 108.5543, telepon: "0231-332110", tipe: "Toko Bangunan", assigned_sales_nama: "Andika Putera", assigned_sales_nik: "SLS-001" },
  { id: "OT-CRB-03", kode: "OT-CRB-03", nama: "Depo Cat Prima Tuparev", wilayah: "Cirebon", alamat: "Jl. Tuparev No. 12, Cirebon", koordinat_gps: "-6.718900, 108.541200", lat: -6.7189, lng: 108.5412, telepon: "0812-9876-5432", tipe: "Distributor Retail", assigned_sales_nama: "Bambang Wijaya", assigned_sales_nik: "SLS-002" },
  { id: "OT-BBS-01", kode: "OT-BBS-01", nama: "TB Berkah Abadi Brebes", wilayah: "Brebes", alamat: "Jl. Jenderal Sudirman No. 15, Brebes", koordinat_gps: "-6.871200, 109.043500", lat: -6.8712, lng: 109.0435, telepon: "0283-671234", tipe: "Toko Bangunan", assigned_sales_nama: "Cahyo Nugroho", assigned_sales_nik: "SLS-003" },
  { id: "OT-TGL-01", kode: "OT-TGL-01", nama: "Toko Cat Surya Bahari Tegal", wilayah: "Tegal", alamat: "Jl. Kolonel Sugiono No. 80, Tegal", koordinat_gps: "-6.868500, 109.138200", lat: -6.8685, lng: 109.1382, telepon: "0283-356789", tipe: "Depo Cat / Store", assigned_sales_nama: "Dedi Setiawan", assigned_sales_nik: "SLS-004" }
];

export async function mount(container, { session }) {
  const userRole = (session?.role || "").toUpperCase();
  const roleIsHrdOrAdmin = ["HRD", "SUPERADMIN", "ADMIN", "GM", "MANAGER", "SPV"].includes(userRole);
  const isHrdOrAdmin = roleIsHrdOrAdmin || await hasSubMenuAccess("sales-outlet", "lihat_semua", session);
  const canEdit = await canEditModuleData(session);

  const headerTitle = container.querySelector("h1");
  const headerSubtitle = container.querySelector("p");
  if (!isHrdOrAdmin) {
    if (headerTitle) headerTitle.textContent = "Master Outlet Binaan Saya";
    if (headerSubtitle) headerSubtitle.textContent = `Daftar toko dan outlet mitra yang ditugaskan kepada ${escapeHtml(session?.nama || "Sales")}.`;
  }

  const tableBody = container.querySelector("#outlet-table-body");
  const emptyStateContainer = container.querySelector("#outlet-empty-state");
  const searchInput = container.querySelector("#search-outlet");
  const regionFilter = container.querySelector("#filter-region");
  const btnAddOutlet = container.querySelector("#btn-add-outlet");

  let outletList = [];

  async function loadOutlets() {
    if (tableBody) tableBody.innerHTML = skeletonRows(5);
    if (emptyStateContainer) emptyStateContainer.classList.add("hidden");

    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      outletList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // If database is empty, seed defaults
      if (outletList.length === 0) {
        for (const out of DEFAULT_OUTLETS) {
          await addDoc(collection(db, COLLECTION_NAME), out);
        }
        const refreshedSnap = await getDocs(collection(db, COLLECTION_NAME));
        outletList = refreshedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      updateRegionDropdown();
      renderList();
    } catch (e) {
      console.error(e);
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="9" class="px-6 py-8 text-center text-rose-500 font-medium">Gagal memuat data outlet: ${e.message}</td></tr>`;
      }
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
      <option value="">Semua Wilayah (${outletList.length})</option>
      ${uniqueRegions.map(r => `<option value="${escapeHtml(r)}"${r === currentVal ? " selected" : ""}>${escapeHtml(r)}</option>`).join("")}
    `;
  }

  function renderList() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const regionVal = regionFilter.value;

    const userNik = String(session?.nik || "").trim().toLowerCase();
    const userNama = String(session?.nama || "").trim().toLowerCase();
    const userUsername = String(session?.username || "").trim().toLowerCase();

    const filtered = outletList.filter(o => {
      // Filter outlets assigned to this sales person if not HRD/Admin
      if (!isHrdOrAdmin) {
        const oNik = String(o.assigned_sales_nik || o.sales_nik || "").trim().toLowerCase();
        const oNama = String(o.assigned_sales_nama || o.sales_nama || o.salesperson || "").trim().toLowerCase();

        if (oNik || oNama) {
          const matchNik = userNik && oNik && userNik === oNik;
          const matchNama = userNama && oNama && (userNama === oNama || userNama.includes(oNama) || oNama.includes(userNama));
          const matchUser = userUsername && (oNik === userUsername || oNama.includes(userUsername));
          if (!matchNik && !matchNama && !matchUser) {
            return false;
          }
        }
      }

      const matchesSearch = (o.nama || "").toLowerCase().includes(searchVal) ||
        (o.kode || "").toLowerCase().includes(searchVal) ||
        (o.alamat || "").toLowerCase().includes(searchVal) ||
        (o.koordinat_gps || "").toLowerCase().includes(searchVal) ||
        (o.assigned_sales_nama || o.salesperson || "").toLowerCase().includes(searchVal);
      const matchesRegion = !regionVal || o.wilayah === regionVal;
      return matchesSearch && matchesRegion;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = "";
      emptyStateContainer.innerHTML = emptyState("Tidak ada outlet ditemukan", !isHrdOrAdmin ? "Belum ada outlet mitra yang di-assign untuk akun Sales Anda." : "Ganti kata kunci pencarian atau bersihkan filter wilayah Anda.");
      emptyStateContainer.classList.remove("hidden");
      return;
    }

    emptyStateContainer.classList.add("hidden");
    tableBody.innerHTML = filtered.map(o => {
      const gpsDisplay = o.koordinat_gps ? `
        <a href="https://www.google.com/maps?q=${encodeURIComponent(o.koordinat_gps)}" target="_blank" title="Buka di Google Maps" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition shadow-2xs">
          <svg class="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span class="truncate max-w-[130px]">${escapeHtml(o.koordinat_gps)}</span>
        </a>
      ` : `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <svg class="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          Belum Ada GPS
        </span>
      `;

      return `
        <tr class="hover:bg-slate-50/70 transition">
          <td class="px-6 py-4 font-mono font-semibold text-slate-700">${escapeHtml(o.kode || "-")}</td>
          <td class="px-6 py-4 font-semibold text-slate-800">
            <div>${escapeHtml(o.nama)}</div>
          </td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              ${escapeHtml(o.wilayah || "Cirebon")}
            </span>
          </td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${o.assigned_sales_nama || o.salesperson ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-100 text-slate-500'}">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              ${escapeHtml(o.assigned_sales_nama || o.salesperson || "Belum Ditetapkan")}
            </span>
          </td>
          <td class="px-6 py-4 text-xs max-w-xs truncate" title="${escapeHtml(o.alamat || '-')}">${escapeHtml(o.alamat || "-")}</td>
          <td class="px-6 py-4">${gpsDisplay}</td>
          <td class="px-6 py-4 font-mono text-xs">${escapeHtml(o.telepon || "-")}</td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-maroon-50 text-maroon-700">
              ${escapeHtml(o.tipe || "Retail")}
            </span>
          </td>
          <td class="px-6 py-4 text-right">
            <div class="inline-flex items-center gap-2 justify-end">
              <button data-id="${o.id}" class="btn-detail px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition cursor-pointer">
                Detail
              </button>
              ${canEdit ? `
                <button data-id="${o.id}" class="btn-edit-outlet px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Edit & GPS
                </button>
              ` : ''}
              ${isHrdOrAdmin && canEdit ? `
                <button data-id="${o.id}" class="btn-edit-sales px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-lg font-semibold text-xs transition cursor-pointer">
                  Assign
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tableBody.querySelectorAll(".btn-detail").forEach(btn => {
      btn.addEventListener("click", () => {
        const outlet = outletList.find(x => x.id === btn.dataset.id);
        if (outlet) openDetailModal(outlet);
      });
    });

    tableBody.querySelectorAll(".btn-edit-outlet").forEach(btn => {
      btn.addEventListener("click", () => {
        const outlet = outletList.find(x => x.id === btn.dataset.id);
        if (outlet) openEditOutletModal(outlet);
      });
    });

    tableBody.querySelectorAll(".btn-edit-sales").forEach(btn => {
      btn.addEventListener("click", () => {
        const outlet = outletList.find(x => x.id === btn.dataset.id);
        if (outlet) openAssignSalesModal(outlet);
      });
    });
  }

  function openDetailModal(outlet) {
    const hasGps = Boolean(outlet.koordinat_gps);
    openModal({
      title: `Detail Outlet: ${escapeHtml(outlet.nama)}`,
      size: "md",
      bodyHtml: `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Kode Outlet</span>
              <span class="font-mono font-semibold text-slate-800 text-sm">${escapeHtml(outlet.kode || "-")}</span>
            </div>
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Tipe / Kategori</span>
              <span class="font-bold text-maroon-700 text-sm uppercase">${escapeHtml(outlet.tipe || "Retail")}</span>
            </div>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block">Nama Outlet</span>
            <span class="font-semibold text-slate-800 text-base">${escapeHtml(outlet.nama)}</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Wilayah / Daerah</span>
              <span class="text-slate-800 text-sm">${escapeHtml(outlet.wilayah || "Cirebon")}</span>
            </div>
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-400 block">Sales Person Binaan</span>
              <span class="font-bold text-indigo-700 text-sm">${escapeHtml(outlet.assigned_sales_nama || outlet.salesperson || "Belum Ditetapkan")}</span>
            </div>
          </div>

          <!-- GPS Coordinates Card -->
          <div class="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
            <span class="text-[10px] uppercase font-bold text-emerald-800 flex items-center gap-1">
              <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Titik Koordinat GPS Master Outlet (Fallback System)
            </span>
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-sm font-bold text-emerald-900">${escapeHtml(outlet.koordinat_gps || "Belum Terdaftar")}</span>
              ${hasGps ? `
                <a href="https://www.google.com/maps?q=${encodeURIComponent(outlet.koordinat_gps)}" target="_blank" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs">
                  Buka Google Maps
                </a>
              ` : ''}
            </div>
            <p class="text-[11px] text-slate-600 leading-snug">
              Titik GPS ini menjadi referensi utama saat check-in sales atau import Excel tidak memiliki Plus Code/koordinat akurat.
            </p>
          </div>

          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block">No. Telepon / HP</span>
            <span class="font-mono text-slate-800 text-sm">${escapeHtml(outlet.telepon || "-")}</span>
          </div>
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-400 block">Alamat Lengkap</span>
            <span class="text-slate-700 text-xs leading-relaxed block bg-slate-50 p-3 rounded-lg border border-slate-100">${escapeHtml(outlet.alamat || "-")}</span>
          </div>
        </div>
      `,
      footerHtml: `
        <button id="btn-close-modal" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer">Tutup</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-close-modal").onclick = closeModal;
      }
    });
  }

  // EDIT OUTLET MODAL WITH SMART GPS GEOCODING & MASTER FALLBACK
  function openEditOutletModal(outlet) {
    openModal({
      title: `Edit Master Outlet: ${escapeHtml(outlet.nama)}`,
      size: "lg",
      bodyHtml: `
        <form id="form-edit-outlet" class="space-y-4 text-left">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Kode Outlet</label>
              <input name="kode" value="${escapeHtml(outlet.kode || '')}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono focus:border-maroon-500 outline-none transition" placeholder="OT-001">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Nama Outlet</label>
              <input name="nama" id="edit-outlet-nama" value="${escapeHtml(outlet.nama || '')}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Nama Toko / Outlet">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Wilayah / Daerah</label>
              <input name="wilayah" value="${escapeHtml(outlet.wilayah || 'Cirebon')}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Cirebon, Brebes, Tegal...">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Tipe / Kategori Outlet</label>
              <select name="tipe" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition bg-white cursor-pointer">
                <option value="Retail" ${outlet.tipe === 'Retail' ? 'selected' : ''}>Retail / Toko Cat</option>
                <option value="Toko Bangunan" ${outlet.tipe === 'Toko Bangunan' ? 'selected' : ''}>Toko Bangunan</option>
                <option value="Depo Cat / Store" ${outlet.tipe === 'Depo Cat / Store' ? 'selected' : ''}>Depo Cat / Store</option>
                <option value="Distributor Retail" ${outlet.tipe === 'Distributor Retail' ? 'selected' : ''}>Distributor Retail</option>
                <option value="Minimarket" ${outlet.tipe === 'Minimarket' ? 'selected' : ''}>Minimarket</option>
                <option value="Supermarket" ${outlet.tipe === 'Supermarket' ? 'selected' : ''}>Supermarket</option>
                <option value="Grosir" ${outlet.tipe === 'Grosir' ? 'selected' : ''}>Grosir / Agen</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Telepon / HP</label>
            <input name="telepon" value="${escapeHtml(outlet.telepon || '')}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Contoh: 0812-3456-7890">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Alamat Lengkap</label>
            <textarea name="alamat" id="edit-outlet-alamat" required rows="2" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Alamat jalan, nomor, patokan...">${escapeHtml(outlet.alamat || '')}</textarea>
          </div>

          <!-- GPS COORDINATES SECTION -->
          <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Titik Koordinat GPS (Latitude, Longitude)
              </label>
              <button type="button" id="btn-generate-gps" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer">
                📍 Generate GPS dari Alamat
              </button>
            </div>
            <div class="grid grid-cols-1 gap-2">
              <input name="koordinat_gps" id="edit-outlet-gps" value="${escapeHtml(outlet.koordinat_gps || '')}" class="w-full px-3 py-2 text-sm font-mono font-bold text-emerald-900 bg-white rounded-lg border border-slate-300 focus:border-emerald-500 outline-none transition" placeholder="Contoh: -6.713500, 108.558200">
            </div>
            <div id="gps-preview-box" class="text-xs text-slate-600">
              ${outlet.koordinat_gps ? `
                <div class="flex items-center gap-2">
                  <span class="text-emerald-700 font-semibold">✓ Koordinat terdaftar di Master Outlet</span>
                  <a href="https://www.google.com/maps?q=${encodeURIComponent(outlet.koordinat_gps)}" target="_blank" class="text-blue-600 underline font-semibold">Test di Google Maps</a>
                </div>
              ` : `
                <span class="text-amber-700 italic">Belum ada koordinat GPS. Klik tombol 'Generate GPS' atau isi manual format: Lat, Long</span>
              `}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Sales Person Penanggung Jawab</label>
              <input name="assigned_sales_nama" value="${escapeHtml(outlet.assigned_sales_nama || outlet.salesperson || '')}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Nama Sales">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">NIK Sales (Opsional)</label>
              <input name="assigned_sales_nik" value="${escapeHtml(outlet.assigned_sales_nik || '')}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition font-mono" placeholder="SLS-001">
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-edit" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer">Batal</button>
        <button id="btn-save-edit" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md cursor-pointer">Simpan Perubahan</button>
      `,
      onMount: (m) => {
        const form = m.querySelector("#form-edit-outlet");
        const btnCancel = m.querySelector("#btn-cancel-edit");
        const btnSave = m.querySelector("#btn-save-edit");
        const btnGen = m.querySelector("#btn-generate-gps");
        const inpGps = m.querySelector("#edit-outlet-gps");
        const inpAlamat = m.querySelector("#edit-outlet-alamat");
        const inpNama = m.querySelector("#edit-outlet-nama");
        const previewBox = m.querySelector("#gps-preview-box");

        btnCancel.onclick = closeModal;

        btnGen.onclick = async () => {
          const addrQuery = [inpAlamat.value.trim(), inpNama.value.trim()].filter(Boolean).join(", ");
          if (!addrQuery) {
            toast("Silakan isi alamat lengkap terlebih dahulu!", "warning");
            return;
          }
          btnGen.disabled = true;
          btnGen.textContent = "Geocoding...";

          try {
            const geoRes = await geocodeAddressSmart(addrQuery);
            if (geoRes && isValidOperationalCoordinate(geoRes.lat, geoRes.lng)) {
              const formattedGps = `${geoRes.lat.toFixed(6)}, ${geoRes.lng.toFixed(6)}`;
              inpGps.value = formattedGps;
              previewBox.innerHTML = `
                <div class="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 flex items-center justify-between">
                  <div>
                    <span class="font-bold">Sukses (${geoRes.source || 'OSM'}):</span> ${formattedGps}
                  </div>
                  <a href="https://www.google.com/maps?q=${formattedGps}" target="_blank" class="text-blue-600 underline font-bold text-[11px]">Buka Maps</a>
                </div>
              `;
              toast("Berhasil menggenerasi titik koordinat GPS!", "success");
            } else if (outlet.koordinat_gps) {
              // Preserve existing valid GPS if geocoding returned a default fallback
              inpGps.value = outlet.koordinat_gps;
              previewBox.innerHTML = `
                <div class="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                  <span>Mempertahankan titik koordinat terdaftar sebelumnya: <b>${escapeHtml(outlet.koordinat_gps)}</b></span>
                </div>
              `;
              toast("Menggunakan titik koordinat GPS terdaftar sebelumnya", "info");
            } else {
              const formattedGps = `${geoRes.lat.toFixed(6)}, ${geoRes.lng.toFixed(6)}`;
              inpGps.value = formattedGps;
              previewBox.innerHTML = `
                <div class="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
                  <span class="font-bold">Hasil:</span> ${formattedGps}
                </div>
              `;
            }
          } catch (geoErr) {
            toast("Gagal geocoding: " + geoErr.message, "error");
          } finally {
            btnGen.disabled = false;
            btnGen.textContent = "📍 Generate GPS dari Alamat";
          }
        };

        btnSave.onclick = async () => {
          if (!form.reportValidity()) return;
          const fd = new FormData(form);
          btnSave.disabled = true;
          btnSave.innerHTML = "Menyimpan...";

          try {
            const rawGps = fd.get("koordinat_gps").trim();
            let parsedCoords = null;
            let finalGps = rawGps;

            if (rawGps) {
              parsedCoords = parseGpsCoordinates(rawGps);
              if (parsedCoords && isValidOperationalCoordinate(parsedCoords.lat, parsedCoords.lng)) {
                finalGps = `${parsedCoords.lat.toFixed(6)}, ${parsedCoords.lng.toFixed(6)}`;
              }
            }

            const updatedNama = fd.get("nama").trim();
            const salesNama = fd.get("assigned_sales_nama").trim();
            const salesNik = fd.get("assigned_sales_nik").trim();

            const payload = {
              kode: fd.get("kode").trim(),
              nama: updatedNama,
              wilayah: fd.get("wilayah").trim(),
              tipe: fd.get("tipe"),
              telepon: fd.get("telepon").trim(),
              alamat: fd.get("alamat").trim(),
              koordinat_gps: finalGps || outlet.koordinat_gps || "",
              lat: parsedCoords ? parsedCoords.lat : (outlet.lat || null),
              lng: parsedCoords ? parsedCoords.lng : (outlet.lng || null),
              assigned_sales_nama: salesNama,
              assigned_sales_nik: salesNik,
              salesperson: salesNama,
              updated_at: new Date().toISOString()
            };

            await updateDoc(doc(db, COLLECTION_NAME, outlet.id), payload);

            // Synchronize updated GPS to all visits in kanal_checkins with matching store name
            if (finalGps) {
              try {
                const allCheckins = await fsGetAll("kanal_checkins").catch(() => []);
                const cleanTarget = cleanStoreName(updatedNama);
                for (const chk of allCheckins) {
                  if (cleanStoreName(chk.toko_outlet) === cleanTarget) {
                    await fsUpdate("kanal_checkins", chk.id, {
                      koordinat_gps: finalGps,
                      lat: parsedCoords?.lat || null,
                      lng: parsedCoords?.lng || null,
                      updated_at: new Date().toISOString()
                    }).catch(() => {});
                  }
                }
              } catch (syncErr) {
                console.warn("Gagal sinkronisasi check-in:", syncErr);
              }
            }

            toast(`Data & titik koordinat GPS '${updatedNama}' berhasil diperbarui!`, "success");
            closeModal();
            loadOutlets();
          } catch (err) {
            toast(`Gagal menyimpan: ${err.message}`, "error");
            btnSave.disabled = false;
            btnSave.innerHTML = "Simpan Perubahan";
          }
        };
      }
    });
  }

  function openAssignSalesModal(outlet) {
    openModal({
      title: `Assign Sales Person: ${escapeHtml(outlet.nama)}`,
      size: "md",
      bodyHtml: `
        <form id="form-assign-sales" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Nama Sales Person Penanggung Jawab</label>
            <input name="assigned_sales_nama" value="${escapeHtml(outlet.assigned_sales_nama || outlet.salesperson || "")}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 outline-none transition" placeholder="Contoh: Andika Putera">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">NIK Sales (Opsional)</label>
            <input name="assigned_sales_nik" value="${escapeHtml(outlet.assigned_sales_nik || "")}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 outline-none transition font-mono" placeholder="Contoh: SLS-001">
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-assign" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer">Batal</button>
        <button id="btn-save-assign" class="bg-indigo-700 hover:bg-indigo-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md cursor-pointer">Simpan Penugasan</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-cancel-assign").onclick = closeModal;
        m.querySelector("#btn-save-assign").onclick = async () => {
          const form = m.querySelector("#form-assign-sales");
          if (!form.reportValidity()) return;
          const fd = new FormData(form);
          const btn = m.querySelector("#btn-save-assign");
          btn.disabled = true;
          btn.innerHTML = "Menyimpan...";

          try {
            const salesNama = fd.get("assigned_sales_nama").trim();
            const salesNik = fd.get("assigned_sales_nik").trim();

            await updateDoc(doc(db, COLLECTION_NAME, outlet.id), {
              assigned_sales_nama: salesNama,
              assigned_sales_nik: salesNik,
              salesperson: salesNama,
              updated_at: new Date().toISOString()
            });

            toast(`Penugasan Sales untuk outlet ${outlet.nama} berhasil diperbarui!`, "success");
            closeModal();
            loadOutlets();
          } catch (err) {
            toast(`Gagal memperbarui: ${err.message}`, "error");
            btn.disabled = false;
            btn.innerHTML = "Simpan Penugasan";
          }
        };
      }
    });
  }

  btnAddOutlet.onclick = () => {
    openModal({
      title: "Tambah Master Outlet Baru",
      size: "lg",
      bodyHtml: `
        <form id="form-outlet" class="space-y-4 text-left">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Nama Outlet</label>
            <input name="nama" id="new-outlet-nama" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Contoh: Toko Cat Cirebon Makmur">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Wilayah / Daerah</label>
              <select name="wilayah" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition bg-white cursor-pointer">
                <option value="Cirebon" selected>Cirebon</option>
                <option value="Brebes">Brebes</option>
                <option value="Tegal">Tegal</option>
                <option value="Majalengka">Majalengka</option>
                <option value="Kuningan">Kuningan</option>
                <option value="Indramayu">Indramayu</option>
                <option value="Yogyakarta">Yogyakarta</option>
                <option value="Sleman">Sleman</option>
                <option value="Bantul">Bantul</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Tipe Outlet</label>
              <select name="tipe" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition bg-white cursor-pointer">
                <option value="Retail">Retail / Toko Cat</option>
                <option value="Toko Bangunan">Toko Bangunan</option>
                <option value="Depo Cat / Store">Depo Cat / Store</option>
                <option value="Distributor Retail">Distributor Retail</option>
                <option value="Minimarket">Minimarket</option>
                <option value="Supermarket">Supermarket</option>
                <option value="Grosir">Grosir / Agen</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Telepon / HP</label>
            <input name="telepon" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Contoh: 0812-3456-7890">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Alamat Lengkap</label>
            <textarea name="alamat" id="new-outlet-alamat" required rows="2" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Alamat jalan, nomor, patokan..."></textarea>
          </div>

          <!-- GPS COORDINATE INPUT -->
          <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Titik Koordinat GPS Master (Latitude, Longitude)
              </label>
              <button type="button" id="btn-gen-gps-new" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer">
                📍 Generate GPS
              </button>
            </div>
            <input name="koordinat_gps" id="new-outlet-gps" class="w-full px-3 py-2 text-sm font-mono font-bold text-emerald-900 bg-white rounded-lg border border-slate-300 focus:border-emerald-500 outline-none transition" placeholder="Contoh: -6.713500, 108.558200">
            <p class="text-[11px] text-slate-500">Jika dikosongkan, sistem akan otomatis melakukan geocoding alamat.</p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Sales Person Penanggung Jawab</label>
              <input name="assigned_sales_nama" value="${escapeHtml(session?.nama || '')}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition" placeholder="Nama Sales">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">NIK Sales (Opsional)</label>
              <input name="assigned_sales_nik" value="${escapeHtml(session?.nik || '')}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-maroon-500 outline-none transition font-mono" placeholder="SLS-001">
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-outlet" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer">Batal</button>
        <button id="btn-save-outlet" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md cursor-pointer">Simpan Outlet</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-cancel-outlet").onclick = closeModal;
        const btnGen = m.querySelector("#btn-gen-gps-new");
        const inpGps = m.querySelector("#new-outlet-gps");
        const inpAlamat = m.querySelector("#new-outlet-alamat");
        const inpNama = m.querySelector("#new-outlet-nama");

        btnGen.onclick = async () => {
          const addrQuery = [inpAlamat.value.trim(), inpNama.value.trim()].filter(Boolean).join(", ");
          if (!addrQuery) return toast("Isi alamat terlebih dahulu!", "warning");
          btnGen.disabled = true;
          btnGen.textContent = "Geocoding...";
          try {
            const geoRes = await geocodeAddressSmart(addrQuery);
            inpGps.value = `${geoRes.lat.toFixed(6)}, ${geoRes.lng.toFixed(6)}`;
            toast("Titik koordinat berhasil digenerasi!", "success");
          } catch (e) {
            toast("Gagal geocoding: " + e.message, "error");
          } finally {
            btnGen.disabled = false;
            btnGen.textContent = "📍 Generate GPS";
          }
        };

        m.querySelector("#btn-save-outlet").onclick = async () => {
          const form = m.querySelector("#form-outlet");
          if (!form.reportValidity()) return;

          const fd = new FormData(form);
          const btn = m.querySelector("#btn-save-outlet");
          btn.disabled = true;
          btn.innerHTML = "Menyimpan...";

          try {
            let finalGps = fd.get("koordinat_gps").trim();
            let parsedCoords = null;

            if (!finalGps) {
              const addrQuery = [fd.get("alamat").trim(), fd.get("nama").trim()].filter(Boolean).join(", ");
              const geoRes = await geocodeAddressSmart(addrQuery);
              finalGps = `${geoRes.lat.toFixed(6)}, ${geoRes.lng.toFixed(6)}`;
              parsedCoords = { lat: geoRes.lat, lng: geoRes.lng };
            } else {
              parsedCoords = parseGpsCoordinates(finalGps);
            }

            const nextCode = `OT-${String(outletList.length + 1).padStart(3, '0')}`;
            const salesNama = fd.get("assigned_sales_nama") || session?.nama || "";
            const salesNik = fd.get("assigned_sales_nik") || session?.nik || "";

            const payload = {
              kode: nextCode,
              nama: fd.get("nama").trim(),
              wilayah: fd.get("wilayah").trim(),
              tipe: fd.get("tipe"),
              telepon: fd.get("telepon").trim(),
              alamat: fd.get("alamat").trim(),
              koordinat_gps: finalGps,
              lat: parsedCoords?.lat || null,
              lng: parsedCoords?.lng || null,
              assigned_sales_nama: salesNama,
              assigned_sales_nik: salesNik,
              salesperson: salesNama,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            await addDoc(collection(db, COLLECTION_NAME), payload);
            toast("Master Outlet baru berhasil ditambahkan!", "success");
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

  const isHrdRole = isHrdOrAdmin || await hasSubMenuAccess("sales-outlet", "import_excel", session);
  const btnImportExcel = container.querySelector("#btn-import-outlet-excel");
  if (btnImportExcel) {
    if (!isHrdRole) {
      btnImportExcel.style.display = "none";
    } else {
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
                  Sistem secara cerdas membaca kolom Nama Toko, Alamat, Koordinat GPS, dan Sales Person:
                </p>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                    <span class="block text-[10px] font-bold text-emerald-700 uppercase">Nama Outlet</span>
                    <span class="text-slate-500 text-[11px] block mt-0.5">Nama, Toko, Outlet</span>
                  </div>
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                    <span class="block text-[10px] font-bold text-emerald-700 uppercase">Wilayah</span>
                    <span class="text-slate-500 text-[11px] block mt-0.5">Wilayah, Kota, Daerah</span>
                  </div>
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                    <span class="block text-[10px] font-bold text-emerald-700 uppercase">Alamat Lengkap</span>
                    <span class="text-slate-500 text-[11px] block mt-0.5">Alamat, Address, Lokasi</span>
                  </div>
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                    <span class="block text-[10px] font-bold text-emerald-700 uppercase">Koordinat GPS (Opsional)</span>
                    <span class="text-slate-500 text-[11px] block mt-0.5">GPS, Koordinat, Lat Long</span>
                  </div>
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                    <span class="block text-[10px] font-bold text-emerald-700 uppercase">No. Telepon</span>
                    <span class="text-slate-500 text-[11px] block mt-0.5">Telepon, HP, Phone</span>
                  </div>
                  <div class="bg-white p-2.5 rounded-xl border border-slate-200/50">
                    <span class="block text-[10px] font-bold text-emerald-700 uppercase">Tipe Outlet</span>
                    <span class="text-slate-500 text-[11px] block mt-0.5">Tipe, Kategori, Kelas</span>
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
                  <button id="btn-clear-import" class="text-rose-600 hover:text-rose-800 text-xs font-semibold cursor-pointer">Ganti File</button>
                </div>
                <div class="max-h-56 overflow-y-auto border border-slate-100 rounded-xl">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead class="sticky top-0 bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                      <tr>
                        <th class="px-4 py-2">Kode</th>
                        <th class="px-4 py-2">Nama Outlet</th>
                        <th class="px-4 py-2">Wilayah</th>
                        <th class="px-4 py-2">Koordinat GPS</th>
                        <th class="px-4 py-2">Alamat</th>
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
            <button id="btn-cancel-import" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer">Batal</button>
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
                  const workbook = window.XLSX.read(data, { type: 'array' });
                  const firstSheetName = workbook.SheetNames[0];
                  const sheet = workbook.Sheets[firstSheetName];
                  const json = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });

                  if (!json || json.length === 0) {
                    return toast("File Excel kosong atau tidak terbaca!", "warning");
                  }

                  parsedRows = json.map((row, index) => {
                    const mapped = {};
                    for (const key of Object.keys(row)) {
                      const k = key.toLowerCase().trim();
                      const val = String(row[key] || "").trim();
                      if (k.includes("nama") || k.includes("name") || k.includes("toko") || k.includes("outlet") || k.includes("pelanggan")) {
                        if (!mapped.nama) mapped.nama = val;
                      } else if (k.includes("wilayah") || k.includes("daerah") || k.includes("region") || k.includes("kota")) {
                        mapped.wilayah = val;
                      } else if (k.includes("alamat") || k.includes("address") || k.includes("lokasi")) {
                        mapped.alamat = val;
                      } else if (k.includes("gps") || k.includes("koordinat") || k.includes("lat") || k.includes("long")) {
                        mapped.koordinat_gps = val;
                      } else if (k.includes("telepon") || k.includes("phone") || k.includes("hp") || k.includes("telp")) {
                        mapped.telepon = val;
                      } else if (k.includes("tipe") || k.includes("type") || k.includes("kelas") || k.includes("kategori")) {
                        mapped.tipe = val;
                      } else if (k.includes("kode") || k.includes("code")) {
                        mapped.kode = val;
                      } else if (k.includes("sales") || k.includes("pic")) {
                        mapped.assigned_sales_nama = val;
                      }
                    }

                    if (!mapped.nama) return null;

                    mapped.wilayah = mapped.wilayah || "Cirebon";
                    mapped.tipe = mapped.tipe || "Retail";
                    mapped.alamat = mapped.alamat || "-";
                    mapped.telepon = mapped.telepon || "-";
                    mapped.assigned_sales_nama = mapped.assigned_sales_nama || session?.nama || "";

                    return mapped;
                  }).filter(Boolean);

                  if (parsedRows.length === 0) {
                    return toast("Gagal mengurai baris data! Pastikan kolom 'Nama Outlet' ada.", "warning");
                  }

                  importCount.textContent = parsedRows.length;
                  previewBody.innerHTML = parsedRows.map((r, i) => `
                    <tr>
                      <td class="px-4 py-2 font-mono font-semibold">${escapeHtml(r.kode || `(Auto: OT-${String(outletList.length + 1 + i).padStart(3, '0')})`)}</td>
                      <td class="px-4 py-2 font-medium">${escapeHtml(r.nama)}</td>
                      <td class="px-4 py-2">${escapeHtml(r.wilayah)}</td>
                      <td class="px-4 py-2 font-mono text-[11px]">${escapeHtml(r.koordinat_gps || "(Auto Geocode)")}</td>
                      <td class="px-4 py-2 max-w-xs truncate" title="${escapeHtml(r.alamat)}">${escapeHtml(r.alamat)}</td>
                      <td class="px-4 py-2 uppercase font-bold text-[10px] text-maroon-700">${escapeHtml(r.tipe)}</td>
                    </tr>
                  `).join("");

                  dropzone.classList.add("hidden");
                  previewContainer.classList.remove("hidden");
                  btnSaveImport.disabled = false;
                  btnSaveImport.className = "bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md cursor-pointer";

                } catch (err) {
                  console.error(err);
                  toast("Gagal membaca berkas Excel: " + err.message, "error");
                }
              };
              reader.readAsArrayBuffer(file);
            }

            btnSaveImport.onclick = async () => {
              btnSaveImport.disabled = true;
              btnSaveImport.innerHTML = "Menyimpan & Geocoding...";

              try {
                let nextIdx = outletList.length + 1;
                for (let i = 0; i < parsedRows.length; i++) {
                  const r = parsedRows[i];
                  const kodeStr = r.kode || `OT-${String(nextIdx++).padStart(3, '0')}`;
                  
                  let finalGps = r.koordinat_gps || "";
                  let parsedCoords = null;

                  if (finalGps) {
                    parsedCoords = parseGpsCoordinates(finalGps);
                  } else if (r.alamat && r.alamat !== "-") {
                    const geoRes = await geocodeAddressSmart([r.alamat, r.nama].join(", "), i);
                    if (geoRes && isValidOperationalCoordinate(geoRes.lat, geoRes.lng)) {
                      finalGps = `${geoRes.lat.toFixed(6)}, ${geoRes.lng.toFixed(6)}`;
                      parsedCoords = { lat: geoRes.lat, lng: geoRes.lng };
                    }
                  }

                  await addDoc(collection(db, COLLECTION_NAME), {
                    kode: kodeStr,
                    nama: r.nama,
                    wilayah: r.wilayah,
                    alamat: r.alamat,
                    telepon: r.telepon,
                    tipe: r.tipe,
                    koordinat_gps: finalGps,
                    lat: parsedCoords?.lat || null,
                    lng: parsedCoords?.lng || null,
                    assigned_sales_nama: r.assigned_sales_nama || session?.nama || "",
                    assigned_sales_nik: session?.nik || "",
                    salesperson: r.assigned_sales_nama || session?.nama || "",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  });
                }

                toast(`Berhasil mengimpor ${parsedRows.length} data outlet baru ke Master Outlet!`, "success");
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
  }

  await loadOutlets();
  return { unmount() {} };
}
