/**
 * =====================================================================
 * LEMBUR-KASBON.JS — Modul Surat Perintah & Persetujuan Kerja Lembur (SPPKL)
 * HRIS CV Andela Jaya — Standar PRD & Workflow v1.1
 * 
 * PENTING: HRIS tidak menghitung nominal rupiah upah lembur.
 * Modul ini berfokus pada otorisasi, digital consent, komparasi realisasi,
 * serta verifikasi Jam Lembur Disetujui HR (Maksimum 4 Jam / Hari).
 * =====================================================================
 */
import { db, COL, doc, getDoc, setDoc, deleteDoc, updateDoc } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, fsDelete, toast, fmtDateShort, genId,
  escapeHtml, confirmDialog, openModal, closeModal, downloadXlsx
} from "../utils.js";
import { badge, icon, avatar } from "../components.js";
import { getSession } from "../auth.js";
import {
  DAY_TYPES, DEFAULT_OVERTIME_CONFIG, calculateDurationMinutes, fmtMinutesToDisplay,
  formatOtDuration, getIndonesianDayName, getIndonesianMonthName,
  calculateAndelaHours, generateSppklNumber, detectOvertimeVariances
} from "./lembur-calc.js";
import { generateSppklPdf } from "./lembur-pdf.js";
import {
  openCreateSppklModal, openSubmitProposalModal, openVerifyRealisasiModal
} from "./lembur-modals.js";

export async function mount(container, context = {}) {
  const session = context?.session || getSession() || {};
  const userRole = (session?.role || "KARYAWAN").toUpperCase();
  const userNik = String(session?.nik || "").trim();
  const userNama = String(session?.nama || session?.username || "Pengguna").trim();
  const userDivisi = String(session?.divisi || session?.departemen || "Umum").trim();

  // Role permissions
  const isSuper = ["SUPERADMIN", "DIRECTOR", "OWNER"].includes(userRole);
  const isHr = isSuper || ["HRD", "HR", "HRGA", "ADMIN"].includes(userRole);
  const isSupervisor = isSuper || isHr || ["SPV", "SUPERVISOR", "MANAGER", "KOORDINATOR", "KABAG", "GM"].includes(userRole);

  // Active tab state
  let currentTab = context?.params?.get("tab") || "dashboard";
  let activeFilterMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  let activeFilterBranch = "ALL";
  let activeFilterDept = "ALL";
  let activeFilterStatus = "ALL";
  let searchQuery = "";

  // Data cache
  let allKaryawan = [];
  let allOrders = [];
  let allProposals = [];
  let allExportBatches = [];
  let allAbsensi = [];
  let currentConfig = { ...DEFAULT_OVERTIME_CONFIG };

  // Render Base Shell
  container.innerHTML = `
  <div class="space-y-6 max-w-7xl mx-auto pb-12">
    <!-- Header Top -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <span class="p-2 bg-rose-50 text-maroon-700 rounded-xl border border-rose-100">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </span>
          <div>
            <h1 class="text-2xl font-black text-slate-800 tracking-tight">Surat Perintah dan Persetujuan Kerja Lembur (SPPKL)</h1>
            <p class="text-xs text-slate-500 mt-0.5">Otorisasi Perintah Perusahaan, Persetujuan Digital Karyawan, Verifikasi & Rekap Jam Disetujui HR</p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        ${isSupervisor ? `
        <button id="btn-create-sppkl" class="px-4 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          <span>Buat Perintah Lembur</span>
        </button>
        ` : ""}
        
        <button id="btn-submit-proposal" class="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          <span>Ajukan Usulan Lembur</span>
        </button>

        <button id="btn-refresh-data" title="Segarkan Data" class="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        </button>
      </div>
    </div>

    <!-- Navigation Submenu Tabs (8 Submenu Sesuai PRD) -->
    <div class="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-1 scrollbar-none text-xs font-bold">
      <button data-tab="dashboard" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Dashboard</span>
      </button>
      <button data-tab="perintah" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Perintah Lembur</span>
      </button>
      <button data-tab="usulan_saya" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Usulan Saya</span>
      </button>
      <button data-tab="persetujuan_saya" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Persetujuan Saya</span>
      </button>
      <button data-tab="realisasi" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Realisasi & Verifikasi</span>
      </button>
      <button data-tab="rekap_jam" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Rekap Jam Lembur</span>
      </button>
      <button data-tab="laporan" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Laporan</span>
      </button>
      ${isHr ? `
      <button data-tab="pengaturan" class="tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5">
        <span>Pengaturan</span>
      </button>
      ` : ""}
    </div>

    <!-- Active Tab Content Container -->
    <div id="lembur-tab-content" class="min-h-[400px]">
      <div class="p-12 text-center text-slate-400">Memuat data lembur...</div>
    </div>
  </div>
  `;

  // Main Data Loader
  async function loadAllData() {
    try {
      const [karyawanRes, ordersRes, proposalsRes, batchesRes, absensiRes, settingsDoc] = await Promise.all([
        fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
        fsGetAll(COL.OVERTIME_ORDERS || "overtime_orders").catch(() => []),
        fsGetAll(COL.OVERTIME_PROPOSALS || "overtime_proposals").catch(() => []),
        fsGetAll(COL.OVERTIME_EXPORT_BATCHES || "overtime_export_batches").catch(() => []),
        fsGetAll(COL.DATA_ABSENSI || "data_absensi").catch(() => []),
        getDoc(doc(db, COL.APP_SETTINGS || "app_settings", "overtime_settings")).catch(() => null)
      ]);

      allKaryawan = karyawanRes.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
      allOrders = ordersRes;
      allProposals = proposalsRes;
      allExportBatches = batchesRes;
      allAbsensi = absensiRes;

      if (settingsDoc && settingsDoc.exists()) {
        currentConfig = { ...DEFAULT_OVERTIME_CONFIG, ...(settingsDoc.data() || {}) };
      }

      renderCurrentTab();
    } catch (err) {
      console.error("Error loading overtime data:", err);
      toast("Gagal memuat data lembur: " + err.message, "error");
    }
  }

  // Switch Tab
  function setActiveTab(tabKey) {
    currentTab = tabKey;
    container.querySelectorAll(".tab-btn").forEach(b => {
      const isMatch = b.dataset.tab === tabKey;
      b.className = isMatch
        ? "tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 bg-maroon-700 text-white font-bold shadow-xs"
        : "tab-btn px-4 py-2.5 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 font-medium";
    });
    renderCurrentTab();
  }

  // Master Renderer
  function renderCurrentTab() {
    const tabContainer = container.querySelector("#lembur-tab-content");
    if (!tabContainer) return;

    if (currentTab === "dashboard") renderDashboardTab(tabContainer);
    else if (currentTab === "perintah") renderPerintahTab(tabContainer);
    else if (currentTab === "usulan_saya") renderUsulanTab(tabContainer);
    else if (currentTab === "persetujuan_saya") renderPersetujuanTab(tabContainer);
    else if (currentTab === "realisasi") renderRealisasiTab(tabContainer);
    else if (currentTab === "rekap_jam") renderRekapJamTab(tabContainer);
    else if (currentTab === "laporan") renderLaporanTab(tabContainer);
    else if (currentTab === "pengaturan") renderPengaturanTab(tabContainer);
  }

  // =========================================================================
  // 1. DASHBOARD TAB
  // =========================================================================
  function renderDashboardTab(wrapper) {
    const filtered = filterOrders(allOrders);

    // KPI Metrics
    const pendingConsent = filtered.filter(o => ["MENUNGGU_PERSETUJUAN_KARYAWAN", "MENUNGGU_CONSENT"].includes(o.status || o.current_status)).length;
    const scheduledToday = filtered.filter(o => (o.tanggal || o.overtime_date) === new Date().toISOString().slice(0, 10)).length;
    const pendingRealization = filtered.filter(o => ["DISETUJUI_KARYAWAN", "DIJADWALKAN", "MENUNGGU_REALISASI"].includes(o.status || o.current_status)).length;
    const pendingSpv = filtered.filter(o => (o.status || o.current_status) === "MENUNGGU_VERIFIKASI_ATASAN").length;
    const pendingHr = filtered.filter(o => (o.status || o.current_status) === "MENUNGGU_VERIFIKASI_HR").length;
    const verifiedHr = filtered.filter(o => ["SELESAI_DIVERIFIKASI_HR", "SUDAH_DIEKSPOR"].includes(o.status || o.current_status)).length;
    
    // Aggregated Approved Hours (No Rupiah)
    const totalApprovedHours = filtered.reduce((sum, o) => sum + (Number(o.jam_disetujui_hr !== undefined ? o.jam_disetujui_hr : (o.durasi_final_hr || 0))), 0);
    const totalActualMinutes = filtered.reduce((sum, o) => sum + (Number(o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60))), 0);

    wrapper.innerHTML = `
    <div class="space-y-6">
      ${renderFilterToolbar()}

      <!-- KPI Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span class="text-[11px] font-bold text-slate-400">Consent Karyawan</span>
          <div class="flex items-baseline justify-between mt-2">
            <span class="text-2xl font-black text-blue-600">${pendingConsent}</span>
            <span class="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">Menunggu</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span class="text-[11px] font-bold text-slate-400">Lembur Hari Ini</span>
          <div class="flex items-baseline justify-between mt-2">
            <span class="text-2xl font-black text-rose-600">${scheduledToday}</span>
            <span class="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full font-bold">Hari Ini</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span class="text-[11px] font-bold text-slate-400">Menunggu Realisasi</span>
          <div class="flex items-baseline justify-between mt-2">
            <span class="text-2xl font-black text-amber-600">${pendingRealization}</span>
            <span class="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold">Jadwal</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span class="text-[11px] font-bold text-slate-400">Verifikasi Atasan</span>
          <div class="flex items-baseline justify-between mt-2">
            <span class="text-2xl font-black text-indigo-600">${pendingSpv}</span>
            <span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Review</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span class="text-[11px] font-bold text-slate-400">Verifikasi HR</span>
          <div class="flex items-baseline justify-between mt-2">
            <span class="text-2xl font-black text-purple-600">${pendingHr}</span>
            <span class="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold">Kepatuhan</span>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <span class="text-[11px] font-bold text-slate-400">Selesai Verifikasi HR</span>
          <div class="flex items-baseline justify-between mt-2">
            <span class="text-2xl font-black text-emerald-600">${verifiedHr}</span>
            <span class="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Siap Rekap</span>
          </div>
        </div>
      </div>

      <!-- Overview Stats Banner (Fokus pada Jam Disetujui HR, tanpa Rupiah) -->
      <div class="bg-linear-to-r from-slate-900 via-slate-800 to-maroon-900 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span class="text-xs font-semibold text-slate-300">Total Akumulasi Jam Lembur Terverifikasi HR</span>
          <div class="flex items-baseline gap-3 mt-1">
            <span class="text-3xl font-black font-mono text-amber-400">${totalApprovedHours} JAM</span>
            <span class="text-xs text-slate-300">/ Total ${fmtMinutesToDisplay(totalActualMinutes)} kerja aktual</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="dash-btn-export" class="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>Ekspor Rekap Jam (Excel)</span>
          </button>
        </div>
      </div>

      <!-- Orders Table -->
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-800 text-sm">Daftar Transaksi Perintah Lembur (SPPKL)</h3>
          <span class="text-xs text-slate-500 font-medium">${filtered.length} Transaksi Ditemukan</span>
        </div>
        ${renderOrdersTable(filtered)}
      </div>
    </div>
    `;

    bindFilterEvents(wrapper);
    bindOrderActionButtons(wrapper);

    wrapper.querySelector("#dash-btn-export")?.addEventListener("click", () => {
      exportOrdersToExcel(filtered);
    });
  }

  // =========================================================================
  // 2. PERINTAH LEMBUR TAB
  // =========================================================================
  function renderPerintahTab(wrapper) {
    const filtered = filterOrders(allOrders);

    wrapper.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-800">Manajemen Perintah Lembur (SPPKL)</h2>
          <p class="text-xs text-slate-500">Penerbitan surat perintah kerja lembur terpusat (Individu / Kelompok) dengan verifikasi digital</p>
        </div>
        ${isSupervisor ? `
        <button id="btn-add-sppkl-inner" class="px-4 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          <span>+ Buat Perintah Lembur Baru</span>
        </button>
        ` : ""}
      </div>

      ${renderFilterToolbar()}

      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        ${renderOrdersTable(filtered)}
      </div>
    </div>
    `;

    bindFilterEvents(wrapper);
    bindOrderActionButtons(wrapper);

    wrapper.querySelector("#btn-add-sppkl-inner")?.addEventListener("click", () => {
      openCreateSppklModal({}, { allKaryawan, allOrders, currentConfig, userNama, userNik }, loadAllData);
    });
  }

  // =========================================================================
  // 3. USULAN SAYA TAB (Employee Proposals)
  // =========================================================================
  function renderUsulanTab(wrapper) {
    const myProposals = isSupervisor ? allProposals : allProposals.filter(p => p.nik_pemohon === userNik || p.nama_pemohon === userNama);

    wrapper.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-800">Usulan Kerja Lembur Karyawan</h2>
          <p class="text-xs text-slate-500">Penyampaian usulan lembur mandiri. Usulan karyawan belum merupakan perintah lembur sebelum disahkan atasan.</p>
        </div>
        <button id="btn-add-proposal-inner" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          <span>Ajukan Usulan Lembur</span>
        </button>
      </div>

      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
            <tr>
              <th class="p-3.5">Tanggal</th>
              <th class="p-3.5">Nama Pemohon</th>
              <th class="p-3.5">Perkiraan Waktu</th>
              <th class="p-3.5">Rincian Pekerjaan & Alasan</th>
              <th class="p-3.5 text-center">Status</th>
              <th class="p-3.5 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${myProposals.length > 0 ? myProposals.map(p => `
            <tr class="hover:bg-slate-50/80 transition">
              <td class="p-3.5 font-medium text-slate-700">${fmtDateShort(p.tanggal)}</td>
              <td class="p-3.5">
                <div class="font-bold text-slate-800">${escapeHtml(p.nama_pemohon || "-")}</div>
                <div class="text-[11px] text-slate-400">${escapeHtml(p.nik_pemohon || "-")} • ${escapeHtml(p.divisi || "-")}</div>
              </td>
              <td class="p-3.5 font-mono text-slate-600">${escapeHtml(p.jam_mulai || "-")} s/d ${escapeHtml(p.jam_selesai || "-")}</td>
              <td class="p-3.5 max-w-xs">
                <div class="font-medium text-slate-800 truncate">${escapeHtml(p.pekerjaan || "-")}</div>
                <div class="text-[11px] text-slate-500 line-clamp-1">${escapeHtml(p.alasan || "-")}</div>
              </td>
              <td class="p-3.5 text-center">
                ${renderStatusBadge(p.status || "USULAN_DIAJUKAN")}
              </td>
              <td class="p-3.5 text-center space-x-1 whitespace-nowrap">
                ${isSupervisor && (p.status === "USULAN_DIAJUKAN" || p.status === "PENDING") ? `
                <button data-approve-proposal="${p.id}" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition">Jadikan SPPKL</button>
                <button data-reject-proposal="${p.id}" class="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-[11px] transition">Tolak</button>
                ` : `
                <span class="text-slate-400 text-[11px] italic">Tersimpan</span>
                `}
              </td>
            </tr>
            `).join("") : `
            <tr>
              <td colspan="6" class="p-10 text-center text-slate-400">
                Belum ada usulan lembur yang diajukan.
              </td>
            </tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
    `;

    wrapper.querySelector("#btn-add-proposal-inner")?.addEventListener("click", () => {
      openSubmitProposalModal({ userNama, userNik, userDivisi }, loadAllData);
    });

    wrapper.querySelectorAll("[data-approve-proposal]").forEach(btn => {
      btn.onclick = () => {
        const prop = allProposals.find(x => x.id === btn.dataset.approveProposal);
        if (prop) {
          openCreateSppklModal({
            prefill: {
              empNik: prop.nik_pemohon,
              empNiks: [prop.nik_pemohon],
              tanggal: prop.tanggal,
              start: prop.jam_mulai,
              end: prop.jam_selesai,
              tugas: prop.pekerjaan,
              alasan: prop.alasan
            },
            proposalId: prop.id
          }, { allKaryawan, allOrders, currentConfig, userNama, userNik }, loadAllData);
        }
      };
    });

    wrapper.querySelectorAll("[data-reject-proposal]").forEach(btn => {
      btn.onclick = async () => {
        const reason = prompt("Masukkan alasan penolakan usulan lembur:");
        if (reason === null) return;
        await fsUpdate(COL.OVERTIME_PROPOSALS || "overtime_proposals", btn.dataset.rejectProposal, {
          status: "DITOLAK",
          reject_reason: reason,
          rejected_by: userNama,
          rejected_at: new Date().toISOString()
        });
        toast("Usulan lembur telah ditolak", "info");
        loadAllData();
      };
    });
  }

  // =========================================================================
  // 4. PERSETUJUAN SAYA TAB (Individual Digital Consent)
  // =========================================================================
  function renderPersetujuanTab(wrapper) {
    const myOrders = allOrders.filter(o => {
      if (o.nik_karyawan === userNik || o.nama_karyawan === userNama) return true;
      if (Array.isArray(o.employees) && o.employees.some(e => e.nik === userNik || e.nama === userNama)) return true;
      return false;
    });

    wrapper.innerHTML = `
    <div class="space-y-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">Persetujuan Digital Kerja Lembur (Consent)</h2>
        <p class="text-xs text-slate-500">Sesuai PP No 35/2021, kerja lembur wajib didasari kesepakatan tertulis/elektronik karyawan per individu</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${myOrders.length > 0 ? myOrders.map(o => {
          // Check employee specific consent inside order
          let empConsentStatus = o.consent_status;
          if (Array.isArray(o.employees)) {
            const myEmp = o.employees.find(e => e.nik === userNik || e.nama === userNama);
            if (myEmp && myEmp.consent_status) empConsentStatus = myEmp.consent_status;
          }

          const isPending = empConsentStatus === "PENDING" || o.status === "MENUNGGU_PERSETUJUAN_KARYAWAN";
          const isApproved = empConsentStatus === "APPROVED" || ["DISETUJUI_KARYAWAN", "DIJADWALKAN", "MENUNGGU_REALISASI", "SELESAI_DIVERIFIKASI_HR"].includes(o.status);
          const isRejected = empConsentStatus === "REJECTED" || o.status === "DITOLAK_KARYAWAN";

          return `
          <div class="bg-white border ${isPending ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'} rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span class="font-mono text-xs font-bold text-maroon-700">${escapeHtml(o.order_number || o.nomor_sppkl || o.id)}</span>
                  <h3 class="font-bold text-slate-800 text-sm mt-0.5">${fmtDateShort(o.tanggal || o.overtime_date)}</h3>
                </div>
                <div>${renderStatusBadge(o.status || o.current_status)}</div>
              </div>

              <div class="mt-3 space-y-2 text-xs">
                <div class="flex justify-between text-slate-600">
                  <span>Waktu Perintah:</span>
                  <span class="font-bold font-mono text-slate-800">${escapeHtml(o.jam_mulai || o.planned_start_at || "-")} s/d ${escapeHtml(o.jam_selesai || o.planned_end_at || "-")} (${o.durasi_jam || o.durasi_rencana || 0} Jam)</span>
                </div>
                <div class="flex justify-between text-slate-600">
                  <span>Pemberi Perintah:</span>
                  <span class="font-medium text-slate-800">${escapeHtml(o.instructed_by || o.nama_pembuat || o.atasan_nama || "Atasan")}</span>
                </div>
                <div class="flex justify-between text-slate-600">
                  <span>Lokasi:</span>
                  <span class="font-medium text-slate-800">${escapeHtml(o.location || o.lokasi || "Kantor")}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
                  <div class="font-bold text-slate-700 mb-0.5">Uraian Tugas:</div>
                  <div class="text-slate-600 leading-relaxed">${escapeHtml(o.work_description || o.pekerjaan || o.uraian_tugas || "-")}</div>
                </div>
              </div>
            </div>

            <div class="border-t border-slate-100 pt-3 flex items-center justify-between gap-2">
              <button data-view-sppkl="${o.id}" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">Cetak PDF</button>

              ${isPending ? `
              <div class="flex items-center gap-2">
                <button data-reject-consent="${o.id}" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition">Saya Tidak Bersedia</button>
                <button data-approve-consent="${o.id}" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition">Saya Setuju Melaksanakan Lembur</button>
              </div>
              ` : `
              <div class="text-[11px] font-bold ${isApproved ? 'text-emerald-700' : 'text-rose-600'}">
                ${isApproved ? '✓ Telah Disetujui Elektronik' : '✕ Menolak Penugasan Lembur'}
              </div>
              `}
            </div>
          </div>
          `;
        }).join("") : `
        <div class="col-span-full p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
          Belum ada penugasan lembur yang memerlukan persetujuan Anda saat ini.
        </div>
        `}
      </div>
    </div>
    `;

    wrapper.querySelectorAll("[data-approve-consent]").forEach(btn => {
      btn.onclick = async () => {
        const order = allOrders.find(x => x.id === btn.dataset.approveConsent);
        if (!order) return;

        const isAgree = await confirmDialog(
          `Saya telah membaca perintah kerja lembur di atas dan menyatakan bersedia melaksanakan kerja lembur pada tanggal ${fmtDateShort(order.tanggal || order.overtime_date)} (${order.jam_mulai} - ${order.jam_selesai}).`,
          "Konfirmasi Persetujuan Kerja Lembur (Consent)"
        );

        if (isAgree) {
          const timestamp = new Date().toISOString();
          const updatePayload = {
            current_status: "DISETUJUI_KARYAWAN",
            status: "DISETUJUI_KARYAWAN",
            consent_status: "APPROVED",
            consent_timestamp: timestamp,
            status_persetujuan_karyawan: "SETUJU",
            persetujuan_karyawan_at: timestamp,
            consent_user_nik: userNik,
            consent_user_nama: userNama
          };

          // If multi-employee, update employee entry
          if (Array.isArray(order.employees)) {
            updatePayload.employees = order.employees.map(e => {
              if (e.nik === userNik || e.nama === userNama) {
                return { ...e, consent_status: "APPROVED", consent_timestamp: timestamp, status_persetujuan_karyawan: "SETUJU" };
              }
              return e;
            });
          }

          await fsUpdate(COL.OVERTIME_ORDERS || "overtime_orders", order.id, updatePayload);
          toast("Persetujuan lembur Anda berhasil direkam!", "success");
          loadAllData();
        }
      };
    });

    wrapper.querySelectorAll("[data-reject-consent]").forEach(btn => {
      btn.onclick = async () => {
        const order = allOrders.find(x => x.id === btn.dataset.rejectConsent);
        if (!order) return;

        const reason = prompt("Masukkan alasan Anda tidak bersedia melaksanakan tugas lembur:");
        if (reason === null) return;
        if (!reason.trim()) return toast("Wajib mengisi alasan penolakan!", "warning");

        const timestamp = new Date().toISOString();
        const updatePayload = {
          current_status: "DITOLAK_KARYAWAN",
          status: "DITOLAK_KARYAWAN",
          consent_status: "REJECTED",
          consent_timestamp: timestamp,
          consent_reject_reason: reason,
          status_persetujuan_karyawan: "TOLAK",
          persetujuan_karyawan_at: timestamp
        };

        if (Array.isArray(order.employees)) {
          updatePayload.employees = order.employees.map(e => {
            if (e.nik === userNik || e.nama === userNama) {
              return { ...e, consent_status: "REJECTED", consent_timestamp: timestamp, rejection_reason: reason };
            }
            return e;
          });
        }

        await fsUpdate(COL.OVERTIME_ORDERS || "overtime_orders", order.id, updatePayload);
        toast("Penolakan tugas lembur telah dicatat", "info");
        loadAllData();
      };
    });

    wrapper.querySelectorAll("[data-view-sppkl]").forEach(btn => {
      btn.onclick = () => {
        const order = allOrders.find(x => x.id === btn.dataset.viewSppkl);
        if (order) generateSppklPdf(order);
      };
    });
  }

  // =========================================================================
  // 5. REALISASI & VERIFIKASI TAB (4-Way Comparison)
  // =========================================================================
  function renderRealisasiTab(wrapper) {
    const filtered = filterOrders(allOrders);

    wrapper.innerHTML = `
    <div class="space-y-6">
      <div>
        <h2 class="text-lg font-bold text-slate-800">Realisasi & Verifikasi Hasil Lembur</h2>
        <p class="text-xs text-slate-500">Komparasi 4-Titik: [Rencana SPPKL | Log Absensi | Realisasi Aktual | Jam Disetujui HR] & Deteksi Varians Otomatis</p>
      </div>

      ${renderFilterToolbar()}

      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
            <tr>
              <th class="p-3">Tanggal / SPPKL</th>
              <th class="p-3">Nama Karyawan</th>
              <th class="p-3">1. Rencana</th>
              <th class="p-3">2. Log Absensi</th>
              <th class="p-3">3. Realisasi Aktual</th>
              <th class="p-3">4. Jam Disetujui HR</th>
              <th class="p-3 text-center">Varians & Kepatuhan</th>
              <th class="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${filtered.length > 0 ? filtered.map(o => {
              const matchAbs = allAbsensi.find(a => 
                (a.nik === o.nik_karyawan || a.nama === o.nama_karyawan) && 
                (a.tanggal === o.tanggal || String(a.createdAt || "").slice(0, 10) === o.tanggal)
              );

              const variances = detectOvertimeVariances(o, { actual_minutes: o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60) }, matchAbs, currentConfig);
              const approvedHours = o.jam_disetujui_hr !== undefined ? o.jam_disetujui_hr : (o.durasi_final_hr !== undefined ? o.durasi_final_hr : 0);

              return `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="p-3">
                  <div class="font-bold text-slate-800">${fmtDateShort(o.tanggal || o.overtime_date)}</div>
                  <div class="font-mono text-[10px] text-maroon-700">${escapeHtml(o.order_number || o.nomor_sppkl || o.id)}</div>
                </td>
                <td class="p-3">
                  <div class="font-bold text-slate-800">${escapeHtml(o.nama_karyawan || "-")}</div>
                  <div class="text-[11px] text-slate-400">${escapeHtml(o.divisi || "-")}</div>
                </td>
                <td class="p-3 font-mono">
                  <div>${escapeHtml(o.jam_mulai || o.planned_start_at || "-")} - ${escapeHtml(o.jam_selesai || o.planned_end_at || "-")}</div>
                  <div class="font-bold text-slate-700">${o.durasi_jam || o.durasi_rencana || 0} Jam</div>
                </td>
                <td class="p-3 font-mono">
                  ${matchAbs ? `
                  <div class="text-emerald-700 font-semibold">${matchAbs.jam_masuk || "-"} s/d ${matchAbs.jam_pulang || "-"}</div>
                  <div class="text-[10px] text-slate-400">Status: ${matchAbs.status || "HADIR"}</div>
                  ` : `
                  <div class="text-amber-600 font-semibold">Tidak Ada Log</div>
                  `}
                </td>
                <td class="p-3 font-mono">
                  <div class="text-blue-700 font-bold">${o.jam_mulai_aktual ? `${o.jam_mulai_aktual} - ${o.jam_selesai_aktual}` : `${o.jam_mulai || '-'} - ${o.jam_selesai || '-'}`}</div>
                  <div class="text-slate-600">${fmtMinutesToDisplay(o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60))}</div>
                </td>
                <td class="p-3 font-mono">
                  <div class="font-black text-purple-700 text-sm">${approvedHours} JAM</div>
                  <div class="text-[10px] text-slate-500">Maks 4 Jam / Hari</div>
                </td>
                <td class="p-3 text-center">
                  <div class="flex flex-col items-center gap-1">
                    ${variances.length > 0 ? variances.map(v => `
                      <span class="text-[10px] px-2 py-0.5 rounded-md font-bold ${v.severity === 'alert' ? 'bg-rose-100 text-rose-800' : v.severity === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">${escapeHtml(v.label)}</span>
                    `).join("") : `<span class="text-[10px] text-emerald-600 font-bold">✓ Sesuai Rencana</span>`}
                  </div>
                </td>
                <td class="p-3 text-center space-x-1 whitespace-nowrap">
                  <button data-verify-realisasi="${o.id}" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-[11px] transition">Input & Verifikasi</button>
                </td>
              </tr>
              `;
            }).join("") : `
            <tr><td colspan="8" class="p-10 text-center text-slate-400">Tidak ada data lembur untuk verifikasi realisasi.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
    `;

    bindFilterEvents(wrapper);

    wrapper.querySelectorAll("[data-verify-realisasi]").forEach(btn => {
      btn.onclick = () => {
        const order = allOrders.find(x => x.id === btn.dataset.verifyRealisasi);
        if (order) openVerifyRealisasiModal(order, { allAbsensi, currentConfig, isHr, userNama }, loadAllData);
      };
    });
  }

  // =========================================================================
  // 6. REKAP JAM LEMBUR TAB (Export Batch & Final Hours without Rupiah)
  // =========================================================================
  function renderRekapJamTab(wrapper) {
    const verifiedOrders = allOrders.filter(o => ["SELESAI_DIVERIFIKASI_HR", "SUDAH_DIEKSPOR"].includes(o.status || o.current_status));
    const readyToExport = allOrders.filter(o => (o.status || o.current_status) === "SELESAI_DIVERIFIKASI_HR");

    wrapper.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-800">Rekapitulasi Jam Kerja Lembur Final</h2>
          <p class="text-xs text-slate-500">Rekap jam lembur disetujui HR untuk diteruskan kepada bagian penghitung nominal di luar modul HRIS</p>
        </div>
        ${isHr && readyToExport.length > 0 ? `
        <button id="btn-create-export-batch" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span>Ekspor Rekap Jam (${readyToExport.length} Transaksi Baru)</span>
        </button>
        ` : ""}
      </div>

      <!-- Ready to Export Section -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-slate-700 text-sm flex items-center gap-2">
            <span>Daftar Transaksi Selesai Diverifikasi HR</span>
            <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-bold">${verifiedOrders.length}</span>
          </h3>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <table class="w-full text-xs text-left">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th class="p-3">No. SPPKL</th>
                <th class="p-3">Tanggal</th>
                <th class="p-3">Nama Karyawan</th>
                <th class="p-3">Divisi / Cabang</th>
                <th class="p-3">Durasi Aktual</th>
                <th class="p-3 font-bold text-purple-800">Jam Disetujui HR</th>
                <th class="p-3 text-center">Status Ekspor</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${verifiedOrders.length > 0 ? verifiedOrders.map(o => `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="p-3 font-mono font-bold text-maroon-700">${escapeHtml(o.order_number || o.nomor_sppkl || o.id)}</td>
                <td class="p-3">${fmtDateShort(o.tanggal || o.overtime_date)}</td>
                <td class="p-3 font-bold text-slate-800">${escapeHtml(o.nama_karyawan || "-")}</td>
                <td class="p-3">${escapeHtml(o.divisi || "-")} / ${escapeHtml(o.cabang || "Pusat")}</td>
                <td class="p-3 font-mono">${fmtMinutesToDisplay(o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60))}</td>
                <td class="p-3 font-mono font-black text-purple-700 text-sm">${o.jam_disetujui_hr !== undefined ? o.jam_disetujui_hr : (o.durasi_final_hr || 0)} JAM</td>
                <td class="p-3 text-center">
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${(o.status || o.current_status) === 'SUDAH_DIEKSPOR' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}">
                    ${(o.status || o.current_status) === 'SUDAH_DIEKSPOR' ? 'Sudah Diekspor' : 'Siap Ekspor'}
                  </span>
                </td>
              </tr>
              `).join("") : `
              <tr><td colspan="7" class="p-8 text-center text-slate-400">Tidak ada transaksi yang selesai diverifikasi HR.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Export Batches History -->
      <div class="space-y-3 pt-4">
        <h3 class="font-bold text-slate-700 text-sm">Riwayat Berkas Ekspor Rekap Jam Lembur</h3>
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <table class="w-full text-xs text-left">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th class="p-3">Nomor Rekap Ekspor</th>
                <th class="p-3">Tanggal Ekspor</th>
                <th class="p-3">Diekspor Oleh</th>
                <th class="p-3">Jumlah SPPKL</th>
                <th class="p-3 font-bold text-purple-800">Total Jam Disetujui</th>
                <th class="p-3 text-center">Unduh Berkas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${allExportBatches.length > 0 ? allExportBatches.map(b => `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="p-3 font-mono font-bold text-slate-800">${escapeHtml(b.batch_number || b.id)}</td>
                <td class="p-3">${fmtDateShort(b.created_at)}</td>
                <td class="p-3 font-medium">${escapeHtml(b.created_by || "HR")}</td>
                <td class="p-3 font-bold">${b.total_items || (b.order_ids || []).length} Transaksi</td>
                <td class="p-3 font-mono font-bold text-purple-700">${b.total_approved_hours || 0} Jam</td>
                <td class="p-3 text-center">
                  <button data-download-batch="${b.id}" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition flex items-center gap-1 mx-auto">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    <span>Download Excel</span>
                  </button>
                </td>
              </tr>
              `).join("") : `
              <tr><td colspan="6" class="p-8 text-center text-slate-400">Belum ada riwayat berkas ekspor rekap jam.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    `;

    wrapper.querySelector("#btn-create-export-batch")?.addEventListener("click", async () => {
      if (readyToExport.length === 0) return toast("Tidak ada transaksi berstatus Siap Ekspor", "warning");

      const seq = String(allExportBatches.length + 1).padStart(3, "0");
      const ym = new Date().toISOString().slice(0, 7).replace("-", "");
      const batchNo = `REKAP-JAM-${ym}-${seq}`;
      const totalHours = readyToExport.reduce((s, o) => s + (Number(o.jam_disetujui_hr !== undefined ? o.jam_disetujui_hr : (o.durasi_final_hr || 0))), 0);
      const orderIds = readyToExport.map(o => o.id);

      const isConfirm = await confirmDialog(
        `Buat Rekap Ekspor ${batchNo} untuk ${readyToExport.length} transaksi (${totalHours} Jam Disetujui HR)?`,
        "Konfirmasi Ekspor Rekap Jam Lembur"
      );

      if (isConfirm) {
        const batchPayload = {
          batch_number: batchNo,
          order_ids: orderIds,
          total_items: readyToExport.length,
          total_approved_hours: totalHours,
          status: "SUDAH_DIEKSPOR",
          created_at: new Date().toISOString(),
          created_by: userNama
        };

        const batchId = genId("EXP");
        await setDoc(doc(db, COL.OVERTIME_EXPORT_BATCHES || "overtime_export_batches", batchId), batchPayload);

        // Update orders
        for (const ord of readyToExport) {
          await fsUpdate(COL.OVERTIME_ORDERS || "overtime_orders", ord.id, {
            current_status: "SUDAH_DIEKSPOR",
            status: "SUDAH_DIEKSPOR",
            export_batch_id: batchId,
            export_batch_number: batchNo,
            exported_at: new Date().toISOString()
          });
        }

        exportOrdersToExcel(readyToExport, batchNo);
        toast(`Rekap Jam ${batchNo} berhasil dibuat dan diekspor!`, "success");
        loadAllData();
      }
    });

    wrapper.querySelectorAll("[data-download-batch]").forEach(btn => {
      btn.onclick = () => {
        const b = allExportBatches.find(x => x.id === btn.dataset.downloadBatch);
        if (!b) return;
        const bOrders = allOrders.filter(o => (b.order_ids || []).includes(o.id));
        exportOrdersToExcel(bOrders, b.batch_number);
      };
    });
  }

  // =========================================================================
  // 7. LAPORAN & ANALITIK TAB
  // =========================================================================
  function renderLaporanTab(wrapper) {
    const filtered = filterOrders(allOrders);

    // Grouping by Employee
    const byEmployee = {};
    filtered.forEach(o => {
      const k = o.nama_karyawan || "Tanpa Nama";
      if (!byEmployee[k]) byEmployee[k] = { name: k, count: 0, actualMins: 0, approvedHours: 0, nik: o.nik_karyawan, dept: o.divisi };
      byEmployee[k].count += 1;
      byEmployee[k].actualMins += Number(o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60));
      byEmployee[k].approvedHours += Number(o.jam_disetujui_hr !== undefined ? o.jam_disetujui_hr : (o.durasi_final_hr || 0));
    });
    const empRank = Object.values(byEmployee).sort((a, b) => b.approvedHours - a.approvedHours);

    // Grouping by Dept
    const byDept = {};
    filtered.forEach(o => {
      const d = o.divisi || "Umum";
      if (!byDept[d]) byDept[d] = { dept: d, count: 0, actualMins: 0, approvedHours: 0 };
      byDept[d].count += 1;
      byDept[d].actualMins += Number(o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60));
      byDept[d].approvedHours += Number(o.jam_disetujui_hr !== undefined ? o.jam_disetujui_hr : (o.durasi_final_hr || 0));
    });

    wrapper.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-800">Laporan & Analitik Jam Kerja Lembur</h2>
          <p class="text-xs text-slate-500">Statistik jam kerja aktual vs jam disetujui HR per divisi, cabang, dan karyawan</p>
        </div>
        <button id="btn-export-laporan" class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span>Ekspor Laporan Excel</span>
        </button>
      </div>

      ${renderFilterToolbar()}

      <!-- Grid Rekap Divisi -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Dept Table -->
        <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
          <h3 class="font-bold text-slate-800 text-sm">Akumulasi Jam Lembur per Divisi</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th class="p-2">Divisi</th>
                  <th class="p-2 text-center">SPPKL</th>
                  <th class="p-2 text-right">Durasi Aktual</th>
                  <th class="p-2 text-right font-bold text-purple-800">Jam Disetujui</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${Object.values(byDept).map(d => `
                <tr class="hover:bg-slate-50/80">
                  <td class="p-2 font-bold text-slate-800">${escapeHtml(d.dept)}</td>
                  <td class="p-2 text-center">${d.count}</td>
                  <td class="p-2 text-right font-mono text-slate-600">${fmtMinutesToDisplay(d.actualMins)}</td>
                  <td class="p-2 text-right font-mono font-bold text-purple-700">${d.approvedHours} Jam</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Employee Table -->
        <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
          <h3 class="font-bold text-slate-800 text-sm">Peringkat Frekuensi Jam Lembur Karyawan</h3>
          <div class="overflow-x-auto max-h-72 overflow-y-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th class="p-2">Nama Karyawan</th>
                  <th class="p-2 text-center">Jumlah</th>
                  <th class="p-2 text-right">Durasi Aktual</th>
                  <th class="p-2 text-right font-bold text-purple-800">Jam Disetujui</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${empRank.map(e => `
                <tr class="hover:bg-slate-50/80">
                  <td class="p-2 font-bold text-slate-800">${escapeHtml(e.name)}</td>
                  <td class="p-2 text-center">${e.count}x</td>
                  <td class="p-2 text-right font-mono text-slate-600">${fmtMinutesToDisplay(e.actualMins)}</td>
                  <td class="p-2 text-right font-mono font-bold text-purple-700">${e.approvedHours} Jam</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    `;

    bindFilterEvents(wrapper);

    wrapper.querySelector("#btn-export-laporan")?.addEventListener("click", () => {
      exportOrdersToExcel(filtered, "Laporan_Rekap_Jam_Lembur");
    });
  }

  // =========================================================================
  // 8. PENGATURAN TAB (HR / Admin Only)
  // =========================================================================
  function renderPengaturanTab(wrapper) {
    wrapper.innerHTML = `
    <div class="space-y-6 max-w-3xl">
      <div>
        <h2 class="text-lg font-bold text-slate-800">Pengaturan Parameter Kebijakan Jam Lembur</h2>
        <p class="text-xs text-slate-500">Konfigurasi batasan kepatuhan, metode pembulatan jam penuh, dan aturan operasional</p>
      </div>

      <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
        <div>
          <label class="block font-bold text-slate-700 mb-1 text-xs">Versi Kebijakan Konversi</label>
          <input type="text" id="cfg-version" value="${escapeHtml(currentConfig.policyVersion || 'ANDELA-POLICY-V1.1-2026')}" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold">
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block font-bold text-slate-700 mb-1 text-xs">Ambang Durasi Minimal (Menit)</label>
            <input type="number" id="cfg-min-mins" value="${currentConfig.minEligibleMinutes || 60}" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold">
            <p class="text-[11px] text-slate-400 mt-1">Durasi di bawah 60 menit menghasilkan 0 jam diperhitungkan.</p>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1 text-xs">Batas Maksimum Jam Final Rekap (Jam/Hari)</label>
            <input type="number" id="cfg-daily-cap" value="${currentConfig.dailyCapHours || 4}" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold">
            <p class="text-[11px] text-slate-400 mt-1">Standar maksimum 4 jam pada rekap internal.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block font-bold text-slate-700 mb-1 text-xs">Peringatan Akumulasi Mingguan (Jam)</label>
            <input type="number" id="cfg-weekly-warning" value="${currentConfig.maxWeeklyHoursWarning || 18}" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold">
            <p class="text-[11px] text-slate-400 mt-1">Sistem memberi peringatan jika lembur mingguan >18 jam.</p>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1 text-xs">Ambang Wajib Makanan/Minuman (Jam)</label>
            <input type="number" id="cfg-meal-threshold" value="${currentConfig.mealMinHoursThreshold || 4}" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold">
            <p class="text-[11px] text-slate-400 mt-1">Wajib fasilitas konsumsi jika lembur mencapai 4 jam.</p>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-200 flex justify-end">
          <button id="btn-save-settings" class="px-5 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-xl text-xs shadow-xs transition">
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>
    `;

    wrapper.querySelector("#btn-save-settings")?.addEventListener("click", async () => {
      const newCfg = {
        policyVersion: document.getElementById("cfg-version")?.value || "ANDELA-POLICY-V1.1-2026",
        minEligibleMinutes: Number(document.getElementById("cfg-min-mins")?.value) || 60,
        dailyCapHours: Number(document.getElementById("cfg-daily-cap")?.value) || 4,
        maxWeeklyHoursWarning: Number(document.getElementById("cfg-weekly-warning")?.value) || 18,
        mealMinHoursThreshold: Number(document.getElementById("cfg-meal-threshold")?.value) || 4,
        updated_at: new Date().toISOString(),
        updated_by: userNama
      };

      try {
        await setDoc(doc(db, COL.APP_SETTINGS || "app_settings", "overtime_settings"), newCfg);
        currentConfig = { ...DEFAULT_OVERTIME_CONFIG, ...newCfg };
        toast("Pengaturan kebijakan lembur berhasil disimpan!", "success");
      } catch (e) {
        toast("Gagal menyimpan pengaturan: " + e.message, "error");
      }
    });
  }

  // =========================================================================
  // HELPER RENDERERS & EVENT BINDINGS
  // =========================================================================
  function renderFilterToolbar() {
    return `
    <div class="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs text-xs">
      <div class="flex flex-wrap items-center gap-2">
        <div>
          <input type="month" id="f-month" value="${activeFilterMonth}" class="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700">
        </div>

        <div>
          <select id="f-status" class="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700">
            <option value="ALL" ${activeFilterStatus === 'ALL' ? 'selected' : ''}>Semua Status</option>
            <option value="MENUNGGU_PERSETUJUAN_KARYAWAN" ${activeFilterStatus === 'MENUNGGU_PERSETUJUAN_KARYAWAN' ? 'selected' : ''}>Menunggu Consent Karyawan</option>
            <option value="DISETUJUI_KARYAWAN" ${activeFilterStatus === 'DISETUJUI_KARYAWAN' ? 'selected' : ''}>Disetujui Karyawan</option>
            <option value="MENUNGGU_VERIFIKASI_ATASAN" ${activeFilterStatus === 'MENUNGGU_VERIFIKASI_ATASAN' ? 'selected' : ''}>Menunggu Verifikasi Atasan</option>
            <option value="MENUNGGU_VERIFIKASI_HR" ${activeFilterStatus === 'MENUNGGU_VERIFIKASI_HR' ? 'selected' : ''}>Menunggu Verifikasi HR</option>
            <option value="SELESAI_DIVERIFIKASI_HR" ${activeFilterStatus === 'SELESAI_DIVERIFIKASI_HR' ? 'selected' : ''}>Selesai Diverifikasi HR</option>
            <option value="SUDAH_DIEKSPOR" ${activeFilterStatus === 'SUDAH_DIEKSPOR' ? 'selected' : ''}>Sudah Diekspor</option>
          </select>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <input type="text" id="f-search" value="${escapeHtml(searchQuery)}" placeholder="Cari nama / nomor SPPKL..." class="px-3 py-1.5 border border-slate-300 rounded-xl text-xs w-48 sm:w-64">
      </div>
    </div>
    `;
  }

  function bindFilterEvents(wrapper) {
    const mInput = wrapper.querySelector("#f-month");
    const sSelect = wrapper.querySelector("#f-status");
    const searchInput = wrapper.querySelector("#f-search");

    mInput?.addEventListener("change", (e) => {
      activeFilterMonth = e.target.value;
      renderCurrentTab();
    });

    sSelect?.addEventListener("change", (e) => {
      activeFilterStatus = e.target.value;
      renderCurrentTab();
    });

    searchInput?.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderCurrentTab();
    });
  }

  function filterOrders(list = []) {
    return list.filter(o => {
      const oDate = o.tanggal || o.overtime_date || "";
      if (activeFilterMonth && !oDate.startsWith(activeFilterMonth)) return false;

      const oStatus = o.status || o.current_status || "";
      if (activeFilterStatus !== "ALL" && oStatus !== activeFilterStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const num = (o.order_number || o.nomor_sppkl || o.id || "").toLowerCase();
        const nama = (o.nama_karyawan || "").toLowerCase();
        const tugas = (o.work_description || o.pekerjaan || "").toLowerCase();
        if (!num.includes(q) && !nama.includes(q) && !tugas.includes(q)) return false;
      }

      return true;
    });
  }

  function renderOrdersTable(orders = []) {
    return `
    <table class="w-full text-xs text-left">
      <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
        <tr>
          <th class="p-3">No. SPPKL / Tanggal</th>
          <th class="p-3">Karyawan Ditugaskan</th>
          <th class="p-3">Jadwal Rencana</th>
          <th class="p-3">Uraian Tugas</th>
          <th class="p-3 text-center">Durasi / Jam Final</th>
          <th class="p-3 text-center">Status</th>
          <th class="p-3 text-center">Aksi</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${orders.length > 0 ? orders.map(o => {
          const approvedHours = o.jam_disetujui_hr !== undefined ? o.jam_disetujui_hr : (o.durasi_final_hr !== undefined ? o.durasi_final_hr : "-");
          return `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="p-3">
              <div class="font-mono font-bold text-maroon-700">${escapeHtml(o.order_number || o.nomor_sppkl || o.id)}</div>
              <div class="text-[11px] text-slate-500 mt-0.5">${fmtDateShort(o.tanggal || o.overtime_date)}</div>
            </td>
            <td class="p-3">
              <div class="font-bold text-slate-800">${escapeHtml(o.nama_karyawan || "-")}</div>
              <div class="text-[11px] text-slate-400">${escapeHtml(o.divisi || "-")}</div>
            </td>
            <td class="p-3 font-mono text-slate-700">
              <div>${escapeHtml(o.jam_mulai || o.planned_start_at || "-")} s/d ${escapeHtml(o.jam_selesai || o.planned_end_at || "-")}</div>
              <div class="text-[10px] text-slate-400">Rencana: ${o.durasi_jam || o.durasi_rencana || 0} Jam</div>
            </td>
            <td class="p-3 max-w-xs">
              <div class="font-medium text-slate-800 truncate">${escapeHtml(o.work_description || o.pekerjaan || "-")}</div>
              <div class="text-[10px] text-slate-400">${escapeHtml(o.location || o.lokasi || "Kantor")}</div>
            </td>
            <td class="p-3 text-center font-mono">
              <div class="font-bold text-purple-700">${approvedHours !== '-' ? `${approvedHours} Jam` : '-'}</div>
              <div class="text-[10px] text-slate-400">${fmtMinutesToDisplay(o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60))}</div>
            </td>
            <td class="p-3 text-center">
              ${renderStatusBadge(o.status || o.current_status)}
            </td>
            <td class="p-3 text-center space-x-1 whitespace-nowrap">
              <button data-pdf-order="${o.id}" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition" title="Cetak SPPKL PDF">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              </button>
              <button data-detail-order="${o.id}" class="px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-[11px] transition">Verifikasi</button>
            </td>
          </tr>
          `;
        }).join("") : `
        <tr><td colspan="7" class="p-10 text-center text-slate-400">Tidak ada transaksi perintah lembur.</td></tr>
        `}
      </tbody>
    </table>
    `;
  }

  function renderStatusBadge(status) {
    const st = String(status || "").toUpperCase();
    if (st === "SELESAI_DIVERIFIKASI_HR" || st === "SUDAH_DIEKSPOR") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Selesai Verifikasi HR</span>`;
    }
    if (st === "DISETUJUI_KARYAWAN" || st === "DIJADWALKAN") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Disetujui Karyawan</span>`;
    }
    if (st === "MENUNGGU_PERSETUJUAN_KARYAWAN" || st === "MENUNGGU_CONSENT") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Menunggu Consent</span>`;
    }
    if (st === "MENUNGGU_VERIFIKASI_ATASAN") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">Verifikasi Atasan</span>`;
    }
    if (st === "MENUNGGU_VERIFIKASI_HR") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">Verifikasi HR</span>`;
    }
    if (st === "DITOLAK_KARYAWAN" || st === "DITOLAK_PERUSAHAAN") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Ditolak</span>`;
    }
    if (st === "PERLU_KLARIFIKASI") {
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">Perlu Klarifikasi</span>`;
    }
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(status || 'DRAFT')}</span>`;
  }

  function bindOrderActionButtons(wrapper) {
    wrapper.querySelectorAll("[data-pdf-order]").forEach(btn => {
      btn.onclick = () => {
        const order = allOrders.find(x => x.id === btn.dataset.pdfOrder);
        if (order) generateSppklPdf(order);
      };
    });

    wrapper.querySelectorAll("[data-detail-order]").forEach(btn => {
      btn.onclick = () => {
        const order = allOrders.find(x => x.id === btn.dataset.detailOrder);
        if (order) openVerifyRealisasiModal(order, { allAbsensi, currentConfig, isHr, userNama }, loadAllData);
      };
    });
  }

  // Export Excel Function Sesuai PRD Section 21 & FR-17 (19 Kolom Standar Andela Jaya Tanpa Rupiah)
  function exportOrdersToExcel(orders = [], fileName = "Rekap_Jam_Lembur_SPPKL") {
    if (!orders || orders.length === 0) return toast("Tidak ada data untuk diekspor", "warning");

    const rows = orders.map((o) => {
      const tgl = o.tanggal || o.overtime_date || "";
      const scanPulang = o.jam_selesai_aktual || o.actual_end_at || o.jam_selesai || o.planned_end_at || "-";
      const startOt = o.jam_mulai_aktual || o.actual_start_at || o.jam_mulai || o.planned_start_at || "-";
      const netMins = Number(o.durasi_aktual_menit || (Number(o.durasi_aktual || 0) * 60) || 0);
      const andela = calculateAndelaHours(netMins, currentConfig);

      // Cek form validitas digital
      const isFormComplete = ["SELESAI_DIVERIFIKASI_HR", "SUDAH_DIEKSPOR", "DISETUJUI_KARYAWAN"].includes(o.status || o.current_status);

      return {
        "Nama": o.nama_karyawan || "-",
        "KODE": o.order_number || o.nomor_sppkl || o.nik_karyawan || o.id,
        "FINGER": o.finger_id || o.nik_karyawan || o.nama_karyawan || "-",
        "Departemen": o.divisi || o.departemen || "Umum",
        "Tanggal": tgl,
        "BULAN": getIndonesianMonthName(tgl),
        "HARI": getIndonesianDayName(tgl),
        "Scan Pulang": scanPulang,
        "Start OT": startOt,
        "OT": formatOtDuration(netMins),
        "JAM": andela.jam,
        "MENIT": andela.menit,
        "Lembur jam pertama": andela.jamPertama,
        "Lembur jam kedua dst": andela.jamKeduaDst,
        "Minute": andela.minute,
        "total jam lembur": andela.totalJamLembur,
        "UM Lembur": andela.umLembur,
        "KETERANGAN": o.actual_work_result || o.work_description || o.pekerjaan || "-",
        "CEK FORM": isFormComplete ? "TRUE" : "FALSE"
      };
    });

    downloadXlsx(rows, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Berkas rekap jam lembur (19 kolom standar Andela) berhasil diunduh!", "success");
  }

  // Global Listeners
  container.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.tab);
    });
  });

  container.querySelector("#btn-create-sppkl")?.addEventListener("click", () => {
    openCreateSppklModal({}, { allKaryawan, allOrders, currentConfig, userNama, userNik }, loadAllData);
  });

  container.querySelector("#btn-submit-proposal")?.addEventListener("click", () => {
    openSubmitProposalModal({ userNama, userNik, userDivisi }, loadAllData);
  });

  container.querySelector("#btn-refresh-data")?.addEventListener("click", () => {
    toast("Menyegarkan data lembur...", "info");
    loadAllData();
  });

  // Initial load
  setActiveTab(currentTab);
  await loadAllData();
}
