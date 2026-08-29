import { db, COL, doc, getDoc } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, fsDelete, toast, fmtDateShort, fmtRupiah,
  escapeHtml, genId, confirmDialog, toNumber, downloadXlsx, formatUangJalanEkspedisiRows
} from "../utils.js";
import { icon, emptyState, openExportPicker } from "../components.js";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export async function mount(container) {
  const [karyawan, kendaraan, settingsSnap] = await Promise.all([
    fsGetAll(COL.MASTER_KARYAWAN),
    fsGetAll(COL.MASTER_KENDARAAN),
    getDoc(doc(db, COL.APP_SETTINGS, "main")),
  ]);

  const activeEmpNames = karyawan
    .filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF")
    .map(k => k.nama_karyawan)
    .sort();

  const platNomor = kendaraan.map(k => k.no_polisi).filter(Boolean).sort();

  const tarif = (settingsSnap.exists() ? settingsSnap.data().tarif : {}) || {};
  const rateDriver = toNumber(tarif.um_driver) || 0;
  const rateHelper = toNumber(tarif.um_helper) || 0;

  let allRows = [];
  let filteredRows = [];
  let editId = null;

  // Default periode: Bulan Ini & Tahun Berjalan
  const now = new Date();
  const currentMonthIdx = now.getMonth(); // 0 - 11
  const currentYearNum = now.getFullYear();

  let filterMode = "month"; // "month" | "range" | "all"
  let selectedMonth = currentMonthIdx + 1; // 1 - 12
  let selectedYear = currentYearNum;

  container.innerHTML = `
  <div class="space-y-6 max-w-[1600px] mx-auto pb-12">
    <div class="flex items-center justify-between flex-wrap gap-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Uang Makan Ekspedisi</h1>
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-maroon-100 text-maroon-800 border border-maroon-200">Input & Penarikan Data Trip</span>
        </div>
        <p class="text-xs md:text-sm text-slate-500 font-medium mt-0.5">Pencatatan, kalkulasi tarif driver/helper, dan penarikan rekapitulasi data per periode tanggal & bulan.</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="um-btn-refresh" class="flex items-center gap-1.5 text-xs md:text-sm px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-bold transition shadow-xs cursor-pointer">
          ${icon("refresh","w-4 h-4 text-slate-500")} Segarkan Data
        </button>
      </div>
    </div>

    <!-- Form Input Trip Pengiriman -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
      <h3 id="um-form-title" class="font-bold text-slate-800 text-base mb-4 flex items-center gap-2">
        ${icon("doc-plus","w-5 h-5 text-maroon-700")} Form Input Trip Pengiriman
      </h3>
      <form id="um-form" class="space-y-5">
        <input type="hidden" name="edit_id">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Tanggal Pengiriman <span class="text-red-500">*</span></label>
            <input type="date" name="tanggal" required class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-maroon-500 focus:ring-2 focus:ring-maroon-100 outline-none transition">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Area / Kota Tujuan <span class="text-red-500">*</span></label>
            <input type="text" name="tujuan" required placeholder="Contoh: Majalengka, Indramayu, Subang" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-maroon-500 focus:ring-2 focus:ring-maroon-100 outline-none transition">
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1.5">Plat Nomor Kendaraan <span class="text-red-500">*</span></label>
          <select name="no_polisi" required class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-maroon-500 focus:ring-2 focus:ring-maroon-100 outline-none bg-white transition">
            <option value="">${platNomor.length ? "Pilih kendaraan operasional..." : "Belum ada data kendaraan"}</option>
            ${platNomor.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
          </select>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Jam Berangkat</label>
            <input type="time" name="jam_berangkat" class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Jam Tiba</label>
            <input type="time" name="jam_tiba" class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Jml Toko (Target)</label>
            <input type="number" name="jml_toko" min="0" placeholder="0" class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1.5">Realisasi Toko</label>
            <input type="number" name="realisasi_toko" min="0" placeholder="0" class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 outline-none">
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Driver -->
          <div class="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4">
            <p class="text-xs font-bold text-blue-900 mb-2 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-blue-600"></span> Driver Ekspedisi
            </p>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Nama Driver <span class="text-red-500">*</span></label>
                <input type="text" name="driver" list="um-dl-nama" required placeholder="Ketik / pilih nama driver..." class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white outline-none">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Tarif Uang Makan Driver</label>
                <input type="text" id="um-display-driver" disabled value="${fmtRupiah(rateDriver)}" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-100 font-mono font-bold text-slate-700 outline-none">
              </div>
            </div>
          </div>

          <!-- Helper -->
          <div class="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4">
            <p class="text-xs font-bold text-emerald-900 mb-2 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-600"></span> Helper (Kenek / Pendamping)
            </p>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Nama Helper (Opsional)</label>
                <input type="text" name="helper" list="um-dl-nama" placeholder="Ketik / pilih nama helper..." class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white outline-none">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Tarif Uang Makan Helper</label>
                <input type="text" id="um-display-helper" disabled value="Rp 0" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-100 font-mono font-bold text-slate-700 outline-none">
              </div>
            </div>
          </div>
        </div>

        <datalist id="um-dl-nama">
          ${activeEmpNames.map(n => `<option value="${escapeHtml(n)}">`).join("")}
        </datalist>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1.5">Keterangan / Alasan Selisih Realisasi Toko</label>
          <input type="text" name="keterangan_selisih" placeholder="Tulis alasan jika Jumlah Target Toko ≠ Realisasi Toko Terkirim" class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 outline-none">
        </div>

        <div class="flex gap-2.5 pt-2">
          <button type="submit" id="um-btn-submit" class="flex-1 flex items-center justify-center gap-2 bg-maroon-800 hover:bg-maroon-900 text-white font-bold py-3 px-5 rounded-xl shadow-xs transition cursor-pointer">
            ${icon("check-circle","w-5 h-5")} Simpan Trip (Driver + Helper Sekaligus)
          </button>
          <button type="button" id="um-btn-cancel-edit" class="hidden px-5 py-3 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer">Batal Edit</button>
        </div>
      </form>
    </div>

    <!-- PANEL PENARIKAN DATA BERDASARKAN PERIODE TANGGAL & BULAN -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-xl bg-maroon-50 text-maroon-700 flex items-center justify-center font-bold shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          </div>
          <div>
            <h3 class="font-black text-slate-800 text-base">Penarikan Data Berdasarkan Periode</h3>
            <p class="text-xs text-slate-500">Tarik data trip ekspedisi sesuai bulan & tahun atau rentang tanggal spesifik</p>
          </div>
        </div>

        <!-- Tombol Pintas Periode Cepat -->
        <div class="flex items-center flex-wrap gap-1.5">
          <button type="button" data-preset="this_month" class="um-preset-btn px-3 py-1.5 text-xs font-bold rounded-lg bg-maroon-50 text-maroon-700 border border-maroon-200 hover:bg-maroon-100 transition cursor-pointer">
            Bulan Ini
          </button>
          <button type="button" data-preset="last_month" class="um-preset-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition cursor-pointer">
            Bulan Lalu
          </button>
          <button type="button" data-preset="today" class="um-preset-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition cursor-pointer">
            Hari Ini
          </button>
          <button type="button" data-preset="this_year" class="um-preset-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition cursor-pointer">
            Tahun Ini
          </button>
          <button type="button" data-preset="all" class="um-preset-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition cursor-pointer">
            Semua Data
          </button>
        </div>
      </div>

      <!-- Controls Form Penarikan Data -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
        <!-- Pilihan Mode Periode -->
        <div class="md:col-span-3">
          <label class="block text-xs font-bold text-slate-700 mb-1">Mode Penarikan</label>
          <select id="um-filter-mode" class="w-full px-3 py-2 text-xs md:text-sm font-semibold rounded-xl border border-slate-200 bg-white focus:border-maroon-500 outline-none">
            <option value="month">📅 Berdasarkan Bulan & Tahun</option>
            <option value="range">🗓️ Berdasarkan Rentang Tanggal</option>
            <option value="all">🌐 Semua Periode Data</option>
          </select>
        </div>

        <!-- Bagian Bulan & Tahun -->
        <div id="um-box-month" class="md:col-span-5 grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Bulan</label>
            <select id="um-filter-month" class="w-full px-3 py-2 text-xs md:text-sm font-medium rounded-xl border border-slate-200 bg-white focus:border-maroon-500 outline-none">
              <option value="ALL">Semua Bulan</option>
              ${MONTH_NAMES.map((m, idx) => `<option value="${idx + 1}" ${idx + 1 === selectedMonth ? 'selected' : ''}>${m}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Tahun</label>
            <select id="um-filter-year" class="w-full px-3 py-2 text-xs md:text-sm font-medium rounded-xl border border-slate-200 bg-white focus:border-maroon-500 outline-none">
              ${[currentYearNum - 2, currentYearNum - 1, currentYearNum, currentYearNum + 1].map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join("")}
            </select>
          </div>
        </div>

        <!-- Bagian Rentang Tanggal (Hidden by default jika mode month) -->
        <div id="um-box-range" class="hidden md:col-span-5 grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Dari Tanggal</label>
            <input type="date" id="um-filter-start-date" class="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 bg-white focus:border-maroon-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Sampai Tanggal</label>
            <input type="date" id="um-filter-end-date" class="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 bg-white focus:border-maroon-500 outline-none">
          </div>
        </div>

        <!-- Tombol Tarik Data -->
        <div class="md:col-span-4 flex items-center gap-2">
          <button type="button" id="um-btn-fetch" class="flex-1 px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-xs md:text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            Tarik Data Sesuai Periode
          </button>
          <button type="button" id="um-btn-reset-filter" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs md:text-sm rounded-xl border border-slate-200 transition cursor-pointer" title="Reset Filter">
            Reset
          </button>
        </div>
      </div>

      <!-- Filter Tambahan: Driver, Kendaraan, Pencarian Cepat -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2.5 border-t border-slate-100">
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">Filter Driver</label>
          <select id="um-filter-driver" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white outline-none">
            <option value="ALL">Semua Driver</option>
            ${activeEmpNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">Filter Kendaraan</label>
          <select id="um-filter-vehicle" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white outline-none">
            <option value="ALL">Semua Plat Nomor</option>
            ${platNomor.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">Cari Cepat (Kota / Helper / Ket)</label>
          <input type="text" id="um-filter-search" placeholder="Ketik kata kunci..." class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white outline-none">
        </div>
      </div>
    </div>

    <!-- Ringkasan Statistik Penarikan Data (KPI Summary Cards) -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5">
      <div class="bg-white p-4 md:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Trip Ditarik</p>
        <p id="um-stat-trips" class="text-xl md:text-2xl font-black text-slate-800 mt-1">0 Trip</p>
        <p id="um-stat-coverage" class="text-[11px] text-slate-500 font-medium mt-0.5">Target: 0 | Real: 0 Toko</p>
      </div>
      <div class="bg-white p-4 md:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <p class="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Total UM Driver</p>
        <p id="um-stat-driver" class="text-lg md:text-xl font-black text-blue-700 mt-1">Rp 0</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Tarif Driver: ${fmtRupiah(rateDriver)}</p>
      </div>
      <div class="bg-white p-4 md:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <p class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Total UM Helper</p>
        <p id="um-stat-helper" class="text-lg md:text-xl font-black text-emerald-700 mt-1">Rp 0</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Tarif Helper: ${fmtRupiah(rateHelper)}</p>
      </div>
      <div class="bg-maroon-50 p-4 md:p-5 rounded-2xl border border-maroon-200/80 shadow-xs">
        <p class="text-[11px] font-bold text-maroon-800 uppercase tracking-wider">Grand Total Uang Makan</p>
        <p id="um-stat-grandtotal" class="text-xl md:text-2xl font-black text-maroon-900 mt-1">Rp 0</p>
        <p id="um-stat-period-tag" class="text-[11px] font-bold text-maroon-700 mt-0.5 truncate">Periode: -</p>
      </div>
    </div>

    <!-- Riwayat Trip & Tabel Data -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div class="flex items-center justify-between px-5 pt-5 pb-3 flex-wrap gap-2 border-b border-slate-100">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-black text-slate-800 text-base">Riwayat Trip Ekspedisi</h3>
            <span id="um-badge-count" class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-700">0 Data</span>
          </div>
          <p id="um-current-period-desc" class="text-xs text-slate-500 mt-0.5 font-medium">Periode aktif: -</p>
        </div>

        <div class="flex items-center gap-2">
          <button id="um-btn-export-template" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition shadow-xs cursor-pointer">
            ${icon("download","w-4 h-4")} Download Excel Sesuai Periode
          </button>
          <button id="um-btn-export" class="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer" title="Export Kustom">${icon("download","w-4 h-4")}</button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide border-b border-slate-200 font-bold">
            <tr>
              <th class="px-4 py-3 text-left">Tanggal</th>
              <th class="px-4 py-3 text-left">Tujuan</th>
              <th class="px-4 py-3 text-left">Kendaraan</th>
              <th class="px-4 py-3 text-left">Driver</th>
              <th class="px-4 py-3 text-left">Helper</th>
              <th class="px-4 py-3 text-left">Jam (Berangkat/Tiba)</th>
              <th class="px-4 py-3 text-left">Toko (Target/Real)</th>
              <th class="px-4 py-3 text-left">Total UM</th>
              <th class="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody id="um-tbody"></tbody>
        </table>
      </div>
      <div id="um-empty"></div>
    </div>
  </div>`;

  const form = container.querySelector("#um-form");
  const tbody = container.querySelector("#um-tbody");
  const emptyEl = container.querySelector("#um-empty");
  const displayDriver = container.querySelector("#um-display-driver");
  const displayHelper = container.querySelector("#um-display-helper");
  const btnSubmit = container.querySelector("#um-btn-submit");
  const btnCancelEdit = container.querySelector("#um-btn-cancel-edit");
  const formTitle = container.querySelector("#um-form-title");

  // Filter Elements
  const modeSelect = container.querySelector("#um-filter-mode");
  const monthSelect = container.querySelector("#um-filter-month");
  const yearSelect = container.querySelector("#um-filter-year");
  const startDateInput = container.querySelector("#um-filter-start-date");
  const endDateInput = container.querySelector("#um-filter-end-date");
  const driverSelect = container.querySelector("#um-filter-driver");
  const vehicleSelect = container.querySelector("#um-filter-vehicle");
  const searchInput = container.querySelector("#um-filter-search");
  const btnFetch = container.querySelector("#um-btn-fetch");
  const btnResetFilter = container.querySelector("#um-btn-reset-filter");

  // Summary elements
  const statTrips = container.querySelector("#um-stat-trips");
  const statCoverage = container.querySelector("#um-stat-coverage");
  const statDriver = container.querySelector("#um-stat-driver");
  const statHelper = container.querySelector("#um-stat-helper");
  const statGrandTotal = container.querySelector("#um-stat-grandtotal");
  const statPeriodTag = container.querySelector("#um-stat-period-tag");
  const currentPeriodDesc = container.querySelector("#um-current-period-desc");
  const badgeCount = container.querySelector("#um-badge-count");

  // Box toggle
  const boxMonth = container.querySelector("#um-box-month");
  const boxRange = container.querySelector("#um-box-range");

  // Set default initial date inputs
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  startDateInput.value = `${yyyy}-${mm}-01`;
  endDateInput.value = `${yyyy}-${mm}-${dd}`;

  function updateModeUI() {
    filterMode = modeSelect.value;
    if (filterMode === "month") {
      boxMonth.classList.remove("hidden");
      boxRange.classList.add("hidden");
    } else if (filterMode === "range") {
      boxMonth.classList.add("hidden");
      boxRange.classList.remove("hidden");
    } else {
      boxMonth.classList.add("hidden");
      boxRange.classList.add("hidden");
    }
  }

  modeSelect.addEventListener("change", () => {
    updateModeUI();
    applyFilterAndRender();
  });

  // Preset buttons
  container.querySelectorAll(".um-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".um-preset-btn").forEach(b => {
        b.className = "um-preset-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition cursor-pointer";
      });
      btn.className = "um-preset-btn px-3 py-1.5 text-xs font-bold rounded-lg bg-maroon-50 text-maroon-700 border border-maroon-200 hover:bg-maroon-100 transition cursor-pointer";

      const preset = btn.dataset.preset;
      const today = new Date();
      const currY = today.getFullYear();
      const currM = today.getMonth() + 1;

      if (preset === "this_month") {
        modeSelect.value = "month";
        monthSelect.value = String(currM);
        yearSelect.value = String(currY);
      } else if (preset === "last_month") {
        modeSelect.value = "month";
        const prevM = currM === 1 ? 12 : currM - 1;
        const prevY = currM === 1 ? currY - 1 : currY;
        monthSelect.value = String(prevM);
        yearSelect.value = String(prevY);
      } else if (preset === "today") {
        modeSelect.value = "range";
        const todayIso = today.toISOString().split("T")[0];
        startDateInput.value = todayIso;
        endDateInput.value = todayIso;
      } else if (preset === "this_year") {
        modeSelect.value = "month";
        monthSelect.value = "ALL";
        yearSelect.value = String(currY);
      } else if (preset === "all") {
        modeSelect.value = "all";
      }

      updateModeUI();
      applyFilterAndRender();
    });
  });

  form.helper.addEventListener("input", () => {
    displayHelper.value = form.helper.value.trim() ? fmtRupiah(rateHelper) : fmtRupiah(0);
  });

  function resetForm() {
    form.reset();
    form.edit_id.value = "";
    editId = null;
    displayDriver.value = fmtRupiah(rateDriver);
    displayHelper.value = fmtRupiah(0);
    btnSubmit.innerHTML = `${icon("check-circle","w-5 h-5")} Simpan Trip (Driver + Helper Sekaligus)`;
    btnCancelEdit.classList.add("hidden");
    formTitle.textContent = "Form Input Trip Pengiriman";
  }

  function startEdit(row) {
    editId = row.id;
    form.edit_id.value = row.id;
    form.tanggal.value = row.tanggal ? String(row.tanggal).slice(0, 10) : "";
    form.tujuan.value = row.tujuan || "";
    form.no_polisi.value = row.no_polisi || "";
    form.jam_berangkat.value = row.jam_berangkat || "";
    form.jam_tiba.value = row.jam_tiba || "";
    form.jml_toko.value = row.jml_toko ?? "";
    form.realisasi_toko.value = row.realisasi_toko ?? "";
    form.driver.value = row.driver || "";
    form.helper.value = row.helper || "";
    form.keterangan_selisih.value = row.keterangan_selisih || "";
    displayDriver.value = fmtRupiah(row.um_driver ?? rateDriver);
    displayHelper.value = fmtRupiah(row.um_helper ?? 0);
    btnSubmit.innerHTML = `${icon("check-circle","w-5 h-5")} Update Trip`;
    btnCancelEdit.classList.remove("hidden");
    formTitle.textContent = `Edit Trip — ${row.tujuan || ""}`;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  btnCancelEdit.addEventListener("click", resetForm);

  function getActivePeriodDescription() {
    if (filterMode === "month") {
      const mVal = monthSelect.value;
      const yVal = yearSelect.value;
      if (mVal === "ALL") {
        return `Tahun ${yVal}`;
      }
      return `${MONTH_NAMES[parseInt(mVal, 10) - 1]} ${yVal}`;
    } else if (filterMode === "range") {
      const s = startDateInput.value || "Awal";
      const e = endDateInput.value || "Akhir";
      return `${fmtDateShort(s)} s/d ${fmtDateShort(e)}`;
    }
    return "Semua Periode";
  }

  function applyFilterAndRender() {
    filterMode = modeSelect.value;
    const mVal = monthSelect.value;
    const yVal = yearSelect.value;
    const sDate = startDateInput.value;
    const eDate = endDateInput.value;
    const dVal = driverSelect.value;
    const vVal = vehicleSelect.value;
    const qVal = (searchInput.value || "").toLowerCase().trim();

    filteredRows = allRows.filter(r => {
      const rawDate = r.tanggal ? String(r.tanggal).slice(0, 10) : "";
      if (!rawDate) return false;

      // 1. Filter Periode Tanggal / Bulan
      if (filterMode === "month") {
        const parts = rawDate.split("-"); // [YYYY, MM, DD]
        if (parts.length >= 2) {
          const rowY = parts[0];
          const rowM = parseInt(parts[1], 10);
          if (rowY !== yVal) return false;
          if (mVal !== "ALL" && rowM !== parseInt(mVal, 10)) return false;
        }
      } else if (filterMode === "range") {
        if (sDate && rawDate < sDate) return false;
        if (eDate && rawDate > eDate) return false;
      }

      // 2. Filter Driver
      if (dVal !== "ALL" && (r.driver || "").toLowerCase() !== dVal.toLowerCase()) {
        return false;
      }

      // 3. Filter Kendaraan
      if (vVal !== "ALL" && (r.no_polisi || "").toLowerCase() !== vVal.toLowerCase()) {
        return false;
      }

      // 4. Search Query
      if (qVal) {
        const matchTujuan = (r.tujuan || "").toLowerCase().includes(qVal);
        const matchDriver = (r.driver || "").toLowerCase().includes(qVal);
        const matchHelper = (r.helper || "").toLowerCase().includes(qVal);
        const matchPlat = (r.no_polisi || "").toLowerCase().includes(qVal);
        const matchKet = (r.keterangan_selisih || "").toLowerCase().includes(qVal);
        if (!matchTujuan && !matchDriver && !matchHelper && !matchPlat && !matchKet) {
          return false;
        }
      }

      return true;
    });

    renderRows();
    updateSummaryCards();
  }

  function updateSummaryCards() {
    const periodDesc = getActivePeriodDescription();
    currentPeriodDesc.textContent = `Periode penarikan: ${periodDesc}`;
    statPeriodTag.textContent = `Periode: ${periodDesc}`;
    badgeCount.textContent = `${filteredRows.length} Data`;

    let sumDriver = 0;
    let sumHelper = 0;
    let sumGrand = 0;
    let sumTargetToko = 0;
    let sumRealToko = 0;

    filteredRows.forEach(r => {
      const umD = toNumber(r.um_driver) || 0;
      const umH = toNumber(r.um_helper) || 0;
      const total = toNumber(r.uang_makan) || (umD + umH);
      sumDriver += umD;
      sumHelper += umH;
      sumGrand += total;
      sumTargetToko += (toNumber(r.jml_toko) || 0);
      sumRealToko += (toNumber(r.realisasi_toko) || 0);
    });

    statTrips.textContent = `${filteredRows.length} Trip`;
    statCoverage.textContent = `Target: ${sumTargetToko} | Real: ${sumRealToko} Toko`;
    statDriver.textContent = fmtRupiah(sumDriver);
    statHelper.textContent = fmtRupiah(sumHelper);
    statGrandTotal.textContent = fmtRupiah(sumGrand);
  }

  function renderRows() {
    if (!filteredRows.length) {
      tbody.innerHTML = "";
      emptyEl.innerHTML = emptyState(
        "Tidak ada data trip pada periode ini",
        "Ubah pilihan bulan/rentang tanggal di atas atau klik 'Tarik Data Sesuai Periode' untuk memuat periode lainnya."
      );
      return;
    }

    emptyEl.innerHTML = "";
    tbody.innerHTML = filteredRows.map(r => {
      const hasSelisih = (r.jml_toko !== null && r.jml_toko !== undefined) && 
                          (r.realisasi_toko !== null && r.realisasi_toko !== undefined) && 
                          (r.jml_toko !== r.realisasi_toko);

      return `
      <tr class="border-t border-slate-100 hover:bg-slate-50/80 transition">
        <td class="px-4 py-3 text-slate-700 whitespace-nowrap font-medium">
          ${fmtDateShort(r.tanggal)}
        </td>
        <td class="px-4 py-3 text-slate-800 font-semibold">
          ${escapeHtml(r.tujuan || "-")}
        </td>
        <td class="px-4 py-3 text-slate-700 font-mono text-xs">
          <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">${escapeHtml(r.no_polisi || "-")}</span>
        </td>
        <td class="px-4 py-3 text-slate-700">
          <div class="font-bold text-slate-800">${escapeHtml(r.driver || "-")}</div>
          <div class="text-[11px] text-blue-600 font-semibold">${fmtRupiah(r.um_driver || rateDriver)}</div>
        </td>
        <td class="px-4 py-3 text-slate-700">
          <div class="font-medium text-slate-700">${escapeHtml(r.helper || "-")}</div>
          <div class="text-[11px] text-emerald-600 font-semibold">${r.helper ? fmtRupiah(r.um_helper || rateHelper) : "-"}</div>
        </td>
        <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
          ${escapeHtml(r.jam_berangkat || "-")} s/d ${escapeHtml(r.jam_tiba || "-")}
        </td>
        <td class="px-4 py-3 text-slate-700">
          <div class="font-bold ${hasSelisih ? 'text-amber-600' : 'text-slate-800'}">
            ${r.jml_toko ?? "-"} / ${r.realisasi_toko ?? "-"}
          </div>
          ${r.keterangan_selisih ? `<div class="text-[11px] text-slate-500 italic max-w-[150px] truncate" title="${escapeHtml(r.keterangan_selisih)}">${escapeHtml(r.keterangan_selisih)}</div>` : ''}
        </td>
        <td class="px-4 py-3 font-mono text-maroon-700 font-bold whitespace-nowrap">
          ${fmtRupiah(r.uang_makan)}
        </td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <button data-edit="${r.id}" class="text-slate-400 hover:text-maroon-700 p-1.5 rounded-lg hover:bg-maroon-50 transition cursor-pointer" title="Edit Trip">${icon("edit","w-4 h-4")}</button>
          <button data-del="${r.id}" class="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer" title="Hapus Trip">${icon("trash","w-4 h-4")}</button>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-edit]").forEach(btn => {
      btn.onclick = () => startEdit(allRows.find(r => r.id === btn.dataset.edit));
    });
    tbody.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = async () => {
        const ok = await confirmDialog("Data trip yang dihapus tidak dapat dikembalikan. Lanjutkan?");
        if (!ok) return;
        await fsDelete(COL.UANG_MAKAN_EXPEDISI, btn.dataset.del);
        toast("Data trip berhasil dihapus", "success");
        if (editId === btn.dataset.del) resetForm();
        await load();
      };
    });
  }

  async function load() {
    allRows = await fsGetAll(COL.UANG_MAKAN_EXPEDISI);
    allRows.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    applyFilterAndRender();
  }

  // Filter change handlers
  btnFetch.addEventListener("click", applyFilterAndRender);
  monthSelect.addEventListener("change", applyFilterAndRender);
  yearSelect.addEventListener("change", applyFilterAndRender);
  startDateInput.addEventListener("change", applyFilterAndRender);
  endDateInput.addEventListener("change", applyFilterAndRender);
  driverSelect.addEventListener("change", applyFilterAndRender);
  vehicleSelect.addEventListener("change", applyFilterAndRender);
  searchInput.addEventListener("input", applyFilterAndRender);

  btnResetFilter.addEventListener("click", () => {
    modeSelect.value = "month";
    monthSelect.value = String(currentMonthIdx + 1);
    yearSelect.value = String(currentYearNum);
    driverSelect.value = "ALL";
    vehicleSelect.value = "ALL";
    searchInput.value = "";
    updateModeUI();
    applyFilterAndRender();
    toast("Filter periode berhasil direset ke bulan ini", "info");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const jmlToko = form.jml_toko.value === "" ? null : toNumber(form.jml_toko.value);
    const realisasi = form.realisasi_toko.value === "" ? null : toNumber(form.realisasi_toko.value);
    const keterangan = form.keterangan_selisih.value.trim();

    if (jmlToko !== null && realisasi !== null && jmlToko !== realisasi && !keterangan) {
      toast("Jml Toko dan Realisasi berbeda — mohon isi Keterangan/Alasan Selisih Toko", "warning");
      return;
    }

    const helperName = form.helper.value.trim();
    const umDriver = rateDriver;
    const umHelper = helperName ? rateHelper : 0;

    const payload = {
      tanggal: form.tanggal.value,
      tujuan: form.tujuan.value.trim(),
      no_polisi: form.no_polisi.value,
      jam_berangkat: form.jam_berangkat.value,
      jam_tiba: form.jam_tiba.value,
      jml_toko: jmlToko,
      realisasi_toko: realisasi,
      driver: form.driver.value.trim(),
      um_driver: umDriver,
      helper: helperName,
      um_helper: umHelper,
      keterangan_selisih: keterangan,
      uang_makan: umDriver + umHelper,
    };

    try {
      if (editId) {
        await fsUpdate(COL.UANG_MAKAN_EXPEDISI, editId, payload);
        toast("Data trip berhasil diperbarui", "success");
      } else {
        await fsAdd(COL.UANG_MAKAN_EXPEDISI, payload, genId("UME"));
        toast("Trip berhasil disimpan (driver + helper sekaligus)", "success");
      }
      resetForm();
      await load();
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan data: " + err.message, "error");
    }
  });

  container.querySelector("#um-btn-refresh")?.addEventListener("click", async () => {
    toast("Menyegarkan data trip ekspedisi...", "info");
    await load();
    toast("Data berhasil dimuat ulang", "success");
  });
  
  // Download Excel Sesuai Periode yang Sedang Ditarik
  container.querySelector("#um-btn-export-template")?.addEventListener("click", async () => {
    if (!filteredRows.length) { 
      toast("Tidak ada data pada periode yang ditarik untuk diekspor", "warning"); 
      return; 
    }
    try {
      const formatted = formatUangJalanEkspedisiRows(filteredRows);
      if (!formatted.length) { 
        toast("Tidak ada data trip valid untuk diekspor", "warning"); 
        return; 
      }
      
      const headers = Object.keys(formatted[0]);
      const matrix = formatted.map(r => headers.map(h => r[h]));
      
      const periodLabel = getActivePeriodDescription().replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
      const currentYear = new Date().getFullYear();
      const sheetName = `UANG JALAN ${periodLabel || currentYear}`.substring(0, 31);
      const filename = `REKAP_UANG_JALAN_EKSPEDISI_${periodLabel || currentYear}.xlsx`;
      
      await downloadXlsx(filename, headers, matrix, sheetName);
      toast(`Berhasil mengunduh Excel rekap (${sheetName})`, "success");
    } catch (err) {
      console.error(err);
      toast("Gagal mengekspor data: " + err.message, "error");
    }
  });

  // Export Kustom Sesuai Periode yang Sedang Ditarik
  container.querySelector("#um-btn-export")?.addEventListener("click", () => {
    if (!filteredRows.length) { 
      toast("Tidak ada data pada periode yang ditarik untuk diekspor", "warning"); 
      return; 
    }
    const formatted = formatUangJalanEkspedisiRows(filteredRows);
    openExportPicker(`Uang Makan Expedisi (${getActivePeriodDescription()})`, [], formatted);
  });

  resetForm();
  await load();

  return { unmount() {} };
}
