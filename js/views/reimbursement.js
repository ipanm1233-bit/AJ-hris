import { db, COL, collection, getDocs, getDoc, doc, updateDoc, addDoc, query, where, orderBy } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, fsDelete, toast, fmtDateShort, fmtDate, fmtRupiah,
  escapeHtml, genId, confirmDialog, toNumber, sendEmailNotif, getTargetsForRole, fsGet,
  openModal, closeModal
} from "../utils.js";
import { icon, emptyState, badge, avatar } from "../components.js";
import { uploadFileToDrive } from "../gas-integration.js";
import { hasSubMenuAccess, canEditModuleData } from "../auth.js";

// Default seed categories if master_reimbursement_type is empty
const DEFAULT_TYPES = [
  {
    id: "RMB-TYPE-TRANSPORT",
    nama_jenis: "Bensin & Transportasi Operasional",
    plafon_mingguan: 250000,
    plafon_bulanan: 1000000,
    plafon_tahunan: 12000000,
    hak_akses: ["ALL"],
    wajib_bukti: true,
    keterangan: "Penggantian BBM, tol, parkir, dan ongkos perjalanan dinas operasional kantor.",
    aktif: true
  },
  {
    id: "RMB-TYPE-MEDIS",
    nama_jenis: "Pengobatan & Rawat Jalan Medis",
    plafon_mingguan: 0,
    plafon_bulanan: 500000,
    plafon_tahunan: 3000000,
    hak_akses: ["ALL"],
    wajib_bukti: true,
    keterangan: "Klaim biaya kuitansi dokter, resep obat apotek, dan pemeriksaan kesehatan rutin.",
    aktif: true
  },
  {
    id: "RMB-TYPE-MEAL",
    nama_jenis: "Makan Client & Jamuan Bisnis",
    plafon_mingguan: 0,
    plafon_bulanan: 1000000,
    plafon_tahunan: 12000000,
    hak_akses: ["SALES", "SPV", "MANAGER", "HRD", "FINANCE", "GA"],
    wajib_bukti: true,
    keterangan: "Jamuan makan dan meeting prospek dengan mitra / pelanggan bisnis perusahaan.",
    aktif: true
  },
  {
    id: "RMB-TYPE-ATK",
    nama_jenis: "Kebutuhan ATK & Operasional Kantor",
    plafon_mingguan: 100000,
    plafon_bulanan: 400000,
    plafon_tahunan: 4800000,
    hak_akses: ["ALL"],
    wajib_bukti: true,
    keterangan: "Pembelian darurat alat tulis kantor, cetak dokumen, fotokopi, atau meterai.",
    aktif: true
  }
];

export async function mount(container, { session }) {
  const roleIsManagement = ["HRD", "SUPERADMIN", "FINANCE", "MANAGER", "SPV", "GM", "DIREKTUR"].includes((session.role || "").toUpperCase());
  // "isManagement" sekarang final ditentukan oleh hak akses sub-menu HRD
  // (Pengaturan > Akses Menu), bukan cuma role statis -- HRD bisa override
  // per-user lewat sub-menu "Daftar Pengajuan (Semua Karyawan)".
  const isManagement = roleIsManagement && await hasSubMenuAccess("reimbursement", "daftar_semua", session);
  const canManageSettings = roleIsManagement && await hasSubMenuAccess("reimbursement", "pengaturan_jenis", session);
  const canEdit = await canEditModuleData(session);

  // Initialize view tabs
  const tabPengajuan = container.querySelector("#rmb-tab-pengajuan");
  const tabPengaturan = container.querySelector("#rmb-tab-pengaturan");
  const contentPengajuan = container.querySelector("#rmb-content-pengajuan");
  const contentPengaturan = container.querySelector("#rmb-content-pengaturan");
  const mgmtDashboard = container.querySelector("#rmb-mgmt-dashboard");
  const employeeView = container.querySelector("#rmb-employee-view");
  const tabBar = tabPengajuan?.closest("div.border-b");

  if (!isManagement) {
    // Karyawan biasa: sembunyikan tab bar (cuma 1 tampilan, tidak perlu tab),
    // sembunyikan dashboard admin (stats+filter+tabel semua karyawan),
    // tampilkan cuma tombol ajukan + riwayat pengajuan singkat milik sendiri.
    if (tabBar) tabBar.classList.add("hidden");
    if (mgmtDashboard) mgmtDashboard.classList.add("hidden");
    if (employeeView) employeeView.classList.remove("hidden");
  }
  if (!canManageSettings) {
    // Sub-menu terpisah: walau punya akses "Daftar Pengajuan", HRD bisa
    // cabut akses "Pengaturan Jenis & Plafon" ini secara independen.
    if (tabPengaturan) tabPengaturan.classList.add("hidden");
    if (contentPengaturan) contentPengaturan.classList.add("hidden");
  }

  function switchTab(target) {
    if (target === "pengaturan") {
      tabPengajuan.className = "rmb-nav-tab px-4 py-3 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 transition whitespace-nowrap";
      tabPengaturan.className = "rmb-nav-tab px-4 py-3 text-sm font-bold border-b-2 border-maroon-700 text-maroon-800 flex items-center gap-2 transition whitespace-nowrap";
      contentPengajuan.classList.add("hidden");
      contentPengaturan.classList.remove("hidden");
    } else {
      tabPengajuan.className = "rmb-nav-tab px-4 py-3 text-sm font-bold border-b-2 border-maroon-700 text-maroon-800 flex items-center gap-2 transition whitespace-nowrap";
      if (tabPengaturan) tabPengaturan.className = "rmb-nav-tab px-4 py-3 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 transition whitespace-nowrap";
      contentPengajuan.classList.remove("hidden");
      contentPengaturan.classList.add("hidden");
    }
  }

  tabPengajuan?.addEventListener("click", () => switchTab("pengajuan"));
  tabPengaturan?.addEventListener("click", () => switchTab("pengaturan"));

  let types = [];
  let claims = [];
  let masterKaryawanList = [];

  async function loadMasterKaryawan() {
    try {
      masterKaryawanList = await fsGetAll(COL.MASTER_KARYAWAN);
      masterKaryawanList.sort((a, b) => (a.nama_karyawan || a.nama || "").localeCompare(b.nama_karyawan || b.nama || ""));
    } catch (e) {
      console.error("Gagal memuat master_karyawan:", e);
    }
  }

  // Seed default types if empty
  async function loadMasterTypes() {
    types = await fsGetAll(COL.MASTER_REIMBURSEMENT_TYPE);
    if (!types.length) {
      for (const t of DEFAULT_TYPES) {
        await fsAdd(COL.MASTER_REIMBURSEMENT_TYPE, t, t.id);
      }
      types = await fsGetAll(COL.MASTER_REIMBURSEMENT_TYPE);
    }
    renderTypesGrid();
    populateTypeFilters();
  }

  async function loadClaims() {
    claims = await fsGetAll(COL.DATA_REIMBURSEMENT);
    claims.sort((a, b) => new Date(b.created_at || b.tanggal_pengeluaran) - new Date(a.created_at || a.tanggal_pengeluaran));
    renderClaimsTable();
    updateStats();
    populateCabangFilters();
  }

  // Calculate used plafon for an employee for a specific reimbursement type
  function getUsedPlafon(employeeNikOrNama, typeId) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    
    // Start of week (Monday)
    const dayOfWeek = now.getDay(); // 0 is Sun
    const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);
    const startOfWeek = mon.toISOString().slice(0, 10);

    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const startOfYear = `${now.getFullYear()}-01-01`;

    let weekUsed = 0;
    let monthUsed = 0;
    let yearUsed = 0;

    claims.forEach(c => {
      if ((c.status === "APPROVED" || c.status === "PAID" || c.status === "PENDING") &&
          c.id_jenis === typeId &&
          (c.nik === employeeNikOrNama || c.nama_karyawan === employeeNikOrNama)) {
        const tgl = (c.tanggal_pengeluaran || c.created_at || "").slice(0, 10);
        const nom = toNumber(c.nominal);

        if (tgl >= startOfWeek) weekUsed += nom;
        if (tgl >= startOfMonth) monthUsed += nom;
        if (tgl >= startOfYear) yearUsed += nom;
      }
    });

    return { weekUsed, monthUsed, yearUsed };
  }

  /* ---------------------------------------------------------------------
   * RENDER STATS & FILTERS
   * ------------------------------------------------------------------- */
  function updateStats() {
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let totalNominal = 0, totalCount = 0;
    let pendingNominal = 0, pendingCount = 0;
    let approvedNominal = 0, approvedCount = 0;
    let paidNominal = 0, paidCount = 0;

    // Filter by user role if normal staff
    const userClaims = isManagement ? claims : claims.filter(c => c.nama_karyawan === session.nama || c.nik === session.nik);

    userClaims.forEach(c => {
      const tgl = (c.tanggal_pengeluaran || c.created_at || "").slice(0, 7);
      const nom = toNumber(c.nominal);

      if (tgl === curMonth) {
        totalNominal += nom;
        totalCount++;
      }

      if (c.status === "PENDING") {
        pendingNominal += nom;
        pendingCount++;
      } else if (c.status === "APPROVED") {
        approvedNominal += nom;
        approvedCount++;
      } else if (c.status === "PAID") {
        paidNominal += nom;
        paidCount++;
      }
    });

    container.querySelector("#rmb-stat-total-nominal").textContent = fmtRupiah(totalNominal);
    container.querySelector("#rmb-stat-total-count").textContent = `${totalCount} klaim bulan ini`;

    container.querySelector("#rmb-stat-pending-nominal").textContent = fmtRupiah(pendingNominal);
    container.querySelector("#rmb-stat-pending-count").textContent = `${pendingCount} perlu persetujuan`;

    container.querySelector("#rmb-stat-approved-nominal").textContent = fmtRupiah(approvedNominal);
    container.querySelector("#rmb-stat-approved-count").textContent = `${approvedCount} disetujui`;

    container.querySelector("#rmb-stat-paid-nominal").textContent = fmtRupiah(paidNominal);
    container.querySelector("#rmb-stat-paid-count").textContent = `${paidCount} telah dicairkan`;

    const badgePending = container.querySelector("#rmb-badge-pending-count");
    if (badgePending) {
      if (pendingCount > 0 && isManagement) {
        badgePending.textContent = pendingCount;
        badgePending.classList.remove("hidden");
      } else {
        badgePending.classList.add("hidden");
      }
    }
  }

  function populateTypeFilters() {
    const sel = container.querySelector("#rmb-filter-jenis");
    if (!sel) return;
    sel.innerHTML = `<option value="ALL">Semua Jenis Reimbursement</option>` +
      types.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nama_jenis)}</option>`).join("");
  }

  function populateCabangFilters() {
    const sel = container.querySelector("#rmb-filter-cabang");
    if (!sel) return;
    const cabangs = [...new Set(claims.map(c => c.cabang).filter(Boolean))].sort();
    sel.innerHTML = `<option value="ALL">Semua Cabang / Penempatan</option>` +
      cabangs.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  /* ---------------------------------------------------------------------
   * RENDER CLAIMS TABLE
   * ------------------------------------------------------------------- */
  function renderEmployeeMiniList() {
    const wrap = container.querySelector("#rmb-employee-mini-list");
    if (!wrap) return;
    const myClaims = claims
      .filter(c => c.nama_karyawan === session.nama || c.nik === session.nik)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(0, 5);

    if (!myClaims.length) {
      wrap.innerHTML = `<p class="text-xs text-slate-400 italic">Belum ada pengajuan.</p>`;
      return;
    }

    wrap.innerHTML = myClaims.map(c => {
      let statusBadge = badge("PENDING", "amber");
      if (c.status === "APPROVED") statusBadge = badge("DISETUJUI", "green");
      if (c.status === "PAID") statusBadge = badge("DICAIRKAN", "blue");
      if (c.status === "REJECTED") statusBadge = badge("DITOLAK", "red");
      return `
        <div class="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
          <div class="min-w-0">
            <p class="font-bold text-slate-700 text-xs truncate">${escapeHtml(c.nama_jenis || "-")}</p>
            <p class="text-[11px] text-slate-400">${fmtDateShort(c.tanggal_pengeluaran || c.created_at)} • ${fmtRupiah(c.nominal || 0)}</p>
          </div>
          ${statusBadge}
        </div>
      `;
    }).join("");
  }

  function renderClaimsTable() {
    if (!isManagement) renderEmployeeMiniList();

    const tbody = container.querySelector("#rmb-tbody-pengajuan");
    const emptyEl = container.querySelector("#rmb-empty-pengajuan");
    const countEl = container.querySelector("#rmb-table-count");

    const searchStr = (container.querySelector("#rmb-filter-search")?.value || "").toLowerCase().trim();
    const filterStatus = container.querySelector("#rmb-filter-status")?.value || "ALL";
    const filterJenis = container.querySelector("#rmb-filter-jenis")?.value || "ALL";
    const filterCabang = container.querySelector("#rmb-filter-cabang")?.value || "ALL";

    let filtered = isManagement ? [...claims] : claims.filter(c => c.nama_karyawan === session.nama || c.nik === session.nik);

    if (filterStatus !== "ALL") {
      filtered = filtered.filter(c => c.status === filterStatus);
    }
    if (filterJenis !== "ALL") {
      filtered = filtered.filter(c => c.id_jenis === filterJenis);
    }
    if (filterCabang !== "ALL") {
      filtered = filtered.filter(c => c.cabang === filterCabang);
    }
    if (searchStr) {
      filtered = filtered.filter(c =>
        (c.nama_karyawan || "").toLowerCase().includes(searchStr) ||
        (c.nik || "").toLowerCase().includes(searchStr) ||
        (c.keterangan || "").toLowerCase().includes(searchStr) ||
        (c.nama_jenis || "").toLowerCase().includes(searchStr)
      );
    }

    if (countEl) countEl.textContent = `${filtered.length} klaim ditemukan`;

    if (!filtered.length) {
      tbody.innerHTML = "";
      emptyEl.innerHTML = emptyState("Belum Ada Pengajuan Reimbursement", "Klik tombol 'Buat Pengajuan Reimbursement' di atas untuk mengajukan klaim.");
      return;
    }

    emptyEl.innerHTML = "";
    tbody.innerHTML = filtered.map(c => {
      let statusBadge = badge("PENDING", "amber");
      if (c.status === "APPROVED") statusBadge = badge("DISETUJUI", "green");
      if (c.status === "PAID") statusBadge = badge("DICAIRKAN", "blue");
      if (c.status === "REJECTED") statusBadge = badge("DITOLAK", "red");

      const hasReceipt = Boolean(c.bukti_url);

      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
            ${fmtDateShort(c.tanggal_pengeluaran || c.created_at)}
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              ${avatar(c.nama_karyawan || "?", "w-7 h-7 text-[10px] shrink-0")}
              <div>
                <p class="font-bold text-slate-800 text-xs leading-tight">${escapeHtml(c.nama_karyawan || "-")}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(c.jabatan || "-")} • ${escapeHtml(c.cabang || "-")}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 font-semibold text-slate-700">
            ${escapeHtml(c.nama_jenis || "-")}
          </td>
          <td class="px-4 py-3 font-black text-maroon-800 font-mono text-sm whitespace-nowrap">
            ${fmtRupiah(c.nominal)}
          </td>
          <td class="px-4 py-3 text-slate-600 max-w-xs truncate" title="${escapeHtml(c.keterangan || "-")}">
            ${escapeHtml(c.keterangan || "-")}
          </td>
          <td class="px-4 py-3">
            ${hasReceipt ? `
              <button data-view-receipt="${c.id}" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] border border-blue-200 transition">
                ${icon("link", "w-3 h-3")} Nota
              </button>
            ` : `<span class="text-slate-300 text-[11px] italic">Tidak Ada</span>`}
          </td>
          <td class="px-4 py-3">
            ${statusBadge}
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button data-detail="${c.id}" class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition">
              Detail & Review
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Bind event handlers
    tbody.querySelectorAll("[data-view-receipt]").forEach(btn => {
      btn.onclick = () => {
        const item = claims.find(x => x.id === btn.dataset.viewReceipt);
        if (item && item.bukti_url) {
          openModal({
            title: `Bukti Nota / Kwitansi — ${escapeHtml(item.nama_karyawan)}`,
            size: "lg",
            bodyHtml: `
              <div class="text-center p-2 bg-slate-900 rounded-xl overflow-hidden">
                <img src="${escapeHtml(item.bukti_url)}" alt="Bukti Nota" class="max-h-[70vh] mx-auto object-contain rounded-lg shadow-lg">
              </div>
            `,
            footerHtml: `
              <a href="${escapeHtml(item.bukti_url)}" target="_blank" download="Nota_${item.id}.png" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition">Buka Full Resolution / Download</a>
              <button onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Tutup</button>
            `
          });
        }
      };
    });

    tbody.querySelectorAll("[data-detail]").forEach(btn => {
      btn.onclick = () => {
        const item = claims.find(x => x.id === btn.dataset.detail);
        if (item) openReviewModal(item);
      };
    });
  }

  /* ---------------------------------------------------------------------
   * REVIEW & APPROVAL MODAL
   * ------------------------------------------------------------------- */
  function openReviewModal(claim) {
    const typeObj = types.find(t => t.id === claim.id_jenis) || {};
    const { weekUsed, monthUsed, yearUsed } = getUsedPlafon(claim.nik || claim.nama_karyawan, claim.id_jenis);

    const plafonWeek = typeObj.plafon_mingguan || 0;
    const plafonMonth = typeObj.plafon_bulanan || 0;
    const plafonYear = typeObj.plafon_tahunan || 0;

    let statusBadge = badge("PENDING", "amber");
    if (claim.status === "APPROVED") statusBadge = badge("DISETUJUI", "green");
    if (claim.status === "PAID") statusBadge = badge("DICAIRKAN (PAID)", "blue");
    if (claim.status === "REJECTED") statusBadge = badge("DITOLAK", "red");

    openModal({
      title: `Detail Klaim Reimbursement #${claim.id}`,
      size: "lg",
      bodyHtml: `
        <div class="space-y-5">
          <!-- Header Employee & Status -->
          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 flex-wrap gap-3">
            <div class="flex items-center gap-3">
              ${avatar(claim.nama_karyawan || "?", "w-12 h-12 text-sm")}
              <div>
                <h4 class="font-extrabold text-slate-800 text-base leading-tight">${escapeHtml(claim.nama_karyawan || "-")}</h4>
                <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(claim.jabatan || "-")} • ${escapeHtml(claim.cabang || "-")} (NIK: ${escapeHtml(claim.nik || "-")})</p>
              </div>
            </div>
            <div class="text-right">
              ${statusBadge}
              <p class="text-[11px] text-slate-400 mt-1">Diajukan: ${fmtDate(claim.created_at || claim.tanggal_pengeluaran)}</p>
            </div>
          </div>

          <!-- Claim Amount & Details -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="p-4 bg-maroon-50/60 rounded-2xl border border-maroon-100">
              <span class="text-[11px] font-bold text-maroon-800 uppercase tracking-wide">Nominal Di-Klaim</span>
              <p class="text-2xl font-black text-maroon-800 font-mono mt-1">${fmtRupiah(claim.nominal)}</p>
              <p class="text-xs text-slate-500 mt-1">Jenis: <b>${escapeHtml(claim.nama_jenis)}</b></p>
            </div>
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Tanggal Pengeluaran Nota</span>
              <p class="text-base font-extrabold text-slate-800 mt-1">${fmtDate(claim.tanggal_pengeluaran)}</p>
              <p class="text-xs text-slate-500 mt-1">Status Transfer: <b>${claim.paid_at ? 'Sudah Dicairkan (' + fmtDateShort(claim.paid_at) + ')' : 'Belum Dicairkan'}</b></p>
            </div>
          </div>

          <!-- Keterangan & Catatan -->
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Keperluan / Description Nota</label>
            <div class="p-3 bg-white rounded-xl border border-slate-200 text-sm text-slate-700 leading-relaxed min-h-[60px]">
              ${escapeHtml(claim.keterangan || "-")}
            </div>
          </div>

          ${claim.catatan_approval ? `
            <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
              <span class="font-bold block mb-0.5">Catatan Reviewer / Approval:</span>
              ${escapeHtml(claim.catatan_approval)}
            </div>
          ` : ''}

          <!-- Live Plafon Status -->
          <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <h5 class="text-xs font-bold text-slate-700 uppercase tracking-wide">Status Penggunaan Plafon Karyawan ini (${escapeHtml(claim.nama_jenis)}):</h5>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div class="p-2.5 bg-white rounded-xl border border-slate-200">
                <span class="text-[10px] text-slate-400 block font-bold uppercase">Plafon Mingguan</span>
                <span class="font-extrabold text-slate-800 font-mono">${fmtRupiah(weekUsed)}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">Limit: ${plafonWeek ? fmtRupiah(plafonWeek) : 'Tanpa Batas'}</span>
              </div>
              <div class="p-2.5 bg-white rounded-xl border border-slate-200">
                <span class="text-[10px] text-slate-400 block font-bold uppercase">Plafon Bulanan</span>
                <span class="font-extrabold text-slate-800 font-mono">${fmtRupiah(monthUsed)}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">Limit: ${plafonMonth ? fmtRupiah(plafonMonth) : 'Tanpa Batas'}</span>
              </div>
              <div class="p-2.5 bg-white rounded-xl border border-slate-200">
                <span class="text-[10px] text-slate-400 block font-bold uppercase">Plafon Tahunan</span>
                <span class="font-extrabold text-slate-800 font-mono">${fmtRupiah(yearUsed)}</span>
                <span class="text-[10px] text-slate-400 block mt-0.5">Limit: ${plafonYear ? fmtRupiah(plafonYear) : 'Tanpa Batas'}</span>
              </div>
            </div>
          </div>

          <!-- Attachment Receipt Preview -->
          ${claim.bukti_url ? `
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Lampiran Bukti Nota / Kuitansi</label>
              <div class="p-2 bg-slate-900 rounded-2xl text-center">
                <img src="${escapeHtml(claim.bukti_url)}" alt="Nota" class="max-h-60 mx-auto object-contain rounded-xl">
              </div>
            </div>
          ` : ''}
        </div>
      `,
      footerHtml: `
        <div class="w-full flex items-center justify-between gap-2 flex-wrap">
          <div>
            ${isManagement && canEdit ? `
              <button id="rmb-btn-delete-claim" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition">
                Hapus Klaim
              </button>
            ` : ''}
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button id="rmb-btn-close-modal" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Tutup</button>
            ${isManagement && canEdit && claim.status === "PENDING" ? `
              <button id="rmb-btn-reject" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition">Tolak Klaim</button>
              <button id="rmb-btn-approve" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition">Setujui Klaim</button>
            ` : ''}
            ${isManagement && canEdit && claim.status === "APPROVED" ? `
              <button id="rmb-btn-mark-paid" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition">Tandai Sudah Cair / Transfer</button>
            ` : ''}
          </div>
        </div>
      `,
      onMount: (m) => {
        m.querySelector("#rmb-btn-close-modal").onclick = closeModal;

        const btnDelete = m.querySelector("#rmb-btn-delete-claim");
        if (btnDelete) {
          btnDelete.onclick = async () => {
            const ok = await confirmDialog("Penghapusan klaim reimbursement ini bersifat permanen. Lanjutkan?");
            if (!ok) return;
            await fsDelete(COL.DATA_REIMBURSEMENT, claim.id);
            toast("Klaim reimbursement dihapus", "success");
            closeModal();
            await loadClaims();
          };
        }

        const btnApprove = m.querySelector("#rmb-btn-approve");
        if (btnApprove) {
          btnApprove.onclick = async () => {
            const ok = await confirmDialog(`Setujui pengajuan reimbursement ${escapeHtml(claim.nama_karyawan)} sebesar ${fmtRupiah(claim.nominal)}?`);
            if (!ok) return;
            await fsUpdate(COL.DATA_REIMBURSEMENT, claim.id, {
              status: "APPROVED",
              approved_by: session.nama,
              approved_at: new Date().toISOString()
            });
            toast("Klaim reimbursement disetujui!", "success");
            closeModal();
            await loadClaims();
          };
        }

        const btnReject = m.querySelector("#rmb-btn-reject");
        if (btnReject) {
          btnReject.onclick = async () => {
            const reason = prompt("Masukkan alasan penolakan klaim reimbursement ini:");
            if (reason === null) return;
            await fsUpdate(COL.DATA_REIMBURSEMENT, claim.id, {
              status: "REJECTED",
              approved_by: session.nama,
              approved_at: new Date().toISOString(),
              catatan_approval: reason || "Ditolak oleh atasan/management"
            });
            toast("Klaim reimbursement ditolak", "info");
            closeModal();
            await loadClaims();
          };
        }

        const btnMarkPaid = m.querySelector("#rmb-btn-mark-paid");
        if (btnMarkPaid) {
          btnMarkPaid.onclick = async () => {
            const ok = await confirmDialog(`Tandai klaim ${escapeHtml(claim.nama_karyawan)} sebesar ${fmtRupiah(claim.nominal)} sebagai SUDAH DICAIRKAN / DITRANSFER?`);
            if (!ok) return;
            await fsUpdate(COL.DATA_REIMBURSEMENT, claim.id, {
              status: "PAID",
              paid_at: new Date().toISOString()
            });
            toast("Status pencairan reimbursement diperbarui!", "success");
            closeModal();
            await loadClaims();
          };
        }
      }
    });
  }

  /* ---------------------------------------------------------------------
   * SUBMISSION FORM MODAL
   * ------------------------------------------------------------------- */
  function openSubmissionModal() {
    let selectedType = types.find(t => t.aktif) || types[0];
    let fileBase64 = "";
    let fileToUpload = null;

    // Filter active types eligible for user
    const userRole = (session.role || "").toUpperCase();
    const userNik = String(session.nik || session.username || "").toUpperCase();
    const userNama = String(session.nama || "").toUpperCase();

    const eligibleTypes = types.filter(t => {
      if (!t.aktif) return false;
      if (!t.hak_akses || !t.hak_akses.length || t.hak_akses.includes("ALL")) return true;
      const upperHak = t.hak_akses.map(x => String(x).toUpperCase());
      return upperHak.includes("ALL") ||
             upperHak.includes(userRole) ||
             upperHak.includes(userNik) ||
             upperHak.includes(userNama);
    });

    if (!eligibleTypes.length) {
      toast("Tidak ada jenis reimbursement yang terbuka untuk role akun Anda saat ini.", "warning");
      return;
    }

    selectedType = eligibleTypes[0];

    openModal({
      title: "Form Pengajuan Reimbursement Karyawan",
      size: "md",
      bodyHtml: `
        <form id="rmb-form-submission" class="space-y-4">
          <!-- Employee Info Read-only -->
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
            <div>
              <p class="font-bold text-slate-800">${escapeHtml(session.nama)}</p>
              <p class="text-[11px] text-slate-400">${escapeHtml(session.posisi || session.role)} • ${escapeHtml(session.cabang || "-")}</p>
            </div>
            <span class="px-2 py-0.5 rounded-md font-bold text-[10px] bg-maroon-100 text-maroon-800">${session.role}</span>
          </div>

          <!-- Jenis Reimbursement -->
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Jenis Reimbursement <span class="text-rose-500">*</span></label>
            <select id="rmb-input-jenis" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-maroon-400 outline-none bg-white">
              ${eligibleTypes.map(t => `<option value="${t.id}">${escapeHtml(t.nama_jenis)}</option>`).join("")}
            </select>
          </div>

          <!-- Live Plafon Limits Info -->
          <div id="rmb-plafon-info-box" class="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1.5 text-xs text-blue-950">
            <!-- filled dynamically -->
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Tanggal Pengeluaran <span class="text-rose-500">*</span></label>
              <input type="date" id="rmb-input-tanggal" required value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-maroon-400 outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Nominal Klaim (Rp) <span class="text-rose-500">*</span></label>
              <input type="number" id="rmb-input-nominal" required min="1000" step="500" placeholder="Contoh: 150000" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-maroon-400 outline-none font-mono">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Keterangan / Keperluan Keuangan <span class="text-rose-500">*</span></label>
            <textarea id="rmb-input-keterangan" rows="3" required placeholder="Jelaskan secara rinci rincian nota / kuitansi pengeluaran..." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-maroon-400 outline-none"></textarea>
          </div>

          <!-- Upload Receipt File -->
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Upload Foto Nota / Kuitansi (Wajib)</label>
            <input type="file" id="rmb-input-file" accept="image/*,.pdf" class="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-maroon-50 file:text-maroon-700 hover:file:bg-maroon-100">
            <div id="rmb-preview-container" class="mt-2 hidden">
              <img id="rmb-preview-img" class="max-h-40 rounded-xl border border-slate-200 shadow-2xs mx-auto">
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="rmb-btn-cancel-submit" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Batal</button>
        <button id="rmb-btn-save-submit" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-xs transition">Kirim Pengajuan</button>
      `,
      onMount: (m) => {
        const selectJenis = m.querySelector("#rmb-input-jenis");
        const boxPlafon = m.querySelector("#rmb-plafon-info-box");
        const fileInput = m.querySelector("#rmb-input-file");
        const previewWrap = m.querySelector("#rmb-preview-container");
        const previewImg = m.querySelector("#rmb-preview-img");

        function updatePlafonInfo() {
          const typeId = selectJenis.value;
          const typeObj = types.find(t => t.id === typeId);
          if (!typeObj) return;

          const { weekUsed, monthUsed, yearUsed } = getUsedPlafon(session.nik || session.nama, typeId);

          const wLimit = typeObj.plafon_mingguan || 0;
          const mLimit = typeObj.plafon_bulanan || 0;
          const yLimit = typeObj.plafon_tahunan || 0;

          const wRem = wLimit ? Math.max(wLimit - weekUsed, 0) : null;
          const mRem = mLimit ? Math.max(mLimit - monthUsed, 0) : null;
          const yRem = yLimit ? Math.max(yLimit - yearUsed, 0) : null;

          boxPlafon.innerHTML = `
            <p class="font-bold text-blue-900 flex items-center justify-between">
              <span>Limit & Sisa Plafon Anda (${escapeHtml(typeObj.nama_jenis)}):</span>
            </p>
            <div class="grid grid-cols-3 gap-1.5 pt-1 text-[11px]">
              <div>
                <span class="text-[10px] text-slate-500 block">Mingguan:</span>
                <span class="font-mono font-bold ${wRem !== null && wRem <= 0 ? 'text-rose-600' : 'text-emerald-700'}">${wRem !== null ? fmtRupiah(wRem) : 'Tanpa Batas'}</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-500 block">Bulanan:</span>
                <span class="font-mono font-bold ${mRem !== null && mRem <= 0 ? 'text-rose-600' : 'text-emerald-700'}">${mRem !== null ? fmtRupiah(mRem) : 'Tanpa Batas'}</span>
              </div>
              <div>
                <span class="text-[10px] text-slate-500 block">Tahunan:</span>
                <span class="font-mono font-bold ${yRem !== null && yRem <= 0 ? 'text-rose-600' : 'text-emerald-700'}">${yRem !== null ? fmtRupiah(yRem) : 'Tanpa Batas'}</span>
              </div>
            </div>
            ${typeObj.keterangan ? `<p class="text-[10px] text-slate-500 italic mt-1">${escapeHtml(typeObj.keterangan)}</p>` : ''}
          `;
        }

        selectJenis.onchange = updatePlafonInfo;
        updatePlafonInfo();

        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;

          if (file.size > 5 * 1024 * 1024) {
            toast("Ukuran file nota maksimal 5MB", "warning");
            fileInput.value = "";
            return;
          }
          fileToUpload = file;

          const reader = new FileReader();
          reader.onload = (evt) => {
            fileBase64 = evt.target.result;
            if (file.type.startsWith("image/")) {
              previewImg.src = fileBase64;
              previewWrap.classList.remove("hidden");
            } else {
              previewWrap.classList.add("hidden");
            }
          };
          reader.readAsDataURL(file);
        };

        m.querySelector("#rmb-btn-cancel-submit").onclick = closeModal;

        m.querySelector("#rmb-btn-save-submit").onclick = async () => {
          const form = m.querySelector("#rmb-form-submission");
          if (!form.reportValidity()) return;

          const typeId = selectJenis.value;
          const typeObj = types.find(t => t.id === typeId);
          const nominal = toNumber(m.querySelector("#rmb-input-nominal").value);
          const tanggal = m.querySelector("#rmb-input-tanggal").value;
          const keterangan = m.querySelector("#rmb-input-keterangan").value.trim();

          if (typeObj.wajib_bukti && !fileBase64) {
            toast("Wajib mengunggah foto nota/kuitansi bukti pengeluaran!", "warning");
            return;
          }

          // Check Plafon limits
          const { weekUsed, monthUsed, yearUsed } = getUsedPlafon(session.nik || session.nama, typeId);

          if (typeObj.plafon_mingguan && (weekUsed + nominal) > typeObj.plafon_mingguan) {
            const rem = Math.max(typeObj.plafon_mingguan - weekUsed, 0);
            toast(`Nominal melebihi sisa plafon MINGGUAN Anda (${fmtRupiah(rem)})`, "error");
            return;
          }

          if (typeObj.plafon_bulanan && (monthUsed + nominal) > typeObj.plafon_bulanan) {
            const rem = Math.max(typeObj.plafon_bulanan - monthUsed, 0);
            toast(`Nominal melebihi sisa plafon BULANAN Anda (${fmtRupiah(rem)})`, "error");
            return;
          }

          if (typeObj.plafon_tahunan && (yearUsed + nominal) > typeObj.plafon_tahunan) {
            const rem = Math.max(typeObj.plafon_tahunan - yearUsed, 0);
            toast(`Nominal melebihi sisa plafon TAHUNAN Anda (${fmtRupiah(rem)})`, "error");
            return;
          }

          const btnSave = m.querySelector("#rmb-btn-save-submit");
          btnSave.disabled = true;
          btnSave.textContent = "Mengirim...";

          try {
            const claimId = genId("RMB");
            let buktiUrl = "";
            if (fileToUpload) {
              btnSave.textContent = "Mengunggah bukti...";
              buktiUrl = await uploadFileToDrive(fileToUpload, `Reimbursement/${claimId}`);
            }

            const payload = {
              id: claimId,
              nama_karyawan: session.nama,
              nik: session.nik || session.username,
              cabang: session.cabang || "-",
              divisi: session.posisi || "-",
              jabatan: session.posisi || session.role || "-",
              id_jenis: typeId,
              nama_jenis: typeObj.nama_jenis,
              nominal: nominal,
              tanggal_pengeluaran: tanggal,
              keterangan: keterangan,
              bukti_url: buktiUrl,
              status: "PENDING",
              created_at: new Date().toISOString()
            };

            await fsAdd(COL.DATA_REIMBURSEMENT, payload, payload.id);
            toast("Pengajuan reimbursement berhasil dikirim!", "success");
            closeModal();
            await loadClaims();
          } catch (e) {
            console.error(e);
            toast("Gagal mengirim pengajuan: " + e.message, "error");
            btnSave.disabled = false;
            btnSave.textContent = "Kirim Pengajuan";
          }
        };
      }
    });
  }

  /* ---------------------------------------------------------------------
   * RENDER TYPE SETTINGS GRID
   * ------------------------------------------------------------------- */
  function renderHakAksesBadges(hakArray) {
    if (!hakArray || !hakArray.length || hakArray.includes("ALL")) {
      return `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Semua Karyawan</span>`;
    }

    const labels = hakArray.map(item => {
      const upper = String(item).toUpperCase();
      const emp = masterKaryawanList.find(e =>
        String(e.nik_karyawan || e.nik || e.id || "").toUpperCase() === upper ||
        String(e.nama_karyawan || e.nama || "").toUpperCase() === upper
      );
      return emp ? (emp.nama_karyawan || emp.nama) : item;
    });

    if (labels.length <= 3) {
      return labels.map(n => `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">${escapeHtml(n)}</span>`).join("");
    } else {
      const shown = labels.slice(0, 2);
      const restCount = labels.length - 2;
      return shown.map(n => `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">${escapeHtml(n)}</span>`).join("") +
        `<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">+${restCount} Karyawan</span>`;
    }
  }

  function renderTypesGrid() {
    const grid = container.querySelector("#rmb-type-cards-grid");
    if (!grid) return;

    if (!types.length) {
      grid.innerHTML = emptyState("Belum Ada Jenis Reimbursement", "Klik Tambah Jenis Reimbursement untuk membuat kategori.");
      return;
    }

    grid.innerHTML = types.map(t => {
      const isAktif = t.aktif !== false;
      return `
        <div class="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-extrabold text-slate-800 text-sm leading-tight">${escapeHtml(t.nama_jenis)}</h4>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isAktif ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'} shrink-0">
                ${isAktif ? 'AKTIF' : 'NONAKTIF'}
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(t.keterangan || "-")}</p>

            <div class="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs font-mono">
              <div class="flex justify-between">
                <span class="text-[10px] text-slate-400 font-sans">Plafon Mingguan:</span>
                <span class="font-bold text-slate-700">${t.plafon_mingguan ? fmtRupiah(t.plafon_mingguan) : 'Tanpa Batas'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-[10px] text-slate-400 font-sans">Plafon Bulanan:</span>
                <span class="font-bold text-slate-700">${t.plafon_bulanan ? fmtRupiah(t.plafon_bulanan) : 'Tanpa Batas'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-[10px] text-slate-400 font-sans">Plafon Tahunan:</span>
                <span class="font-bold text-slate-700">${t.plafon_tahunan ? fmtRupiah(t.plafon_tahunan) : 'Tanpa Batas'}</span>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap gap-1">
              <span class="text-[10px] font-bold text-slate-400 mr-1 self-center">Hak Akses:</span>
              ${renderHakAksesBadges(t.hak_akses)}
            </div>
          </div>

          <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <button data-toggle-type="${t.id}" class="text-xs font-bold ${isAktif ? 'text-amber-600 hover:underline' : 'text-emerald-600 hover:underline'}">
              ${isAktif ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
            <div class="flex items-center gap-1">
              <button data-edit-type="${t.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition">Edit</button>
              <button data-del-type="${t.id}" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg transition">Hapus</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    grid.querySelectorAll("[data-toggle-type]").forEach(btn => {
      btn.onclick = async () => {
        const item = types.find(x => x.id === btn.dataset.toggleType);
        if (!item) return;
        await fsUpdate(COL.MASTER_REIMBURSEMENT_TYPE, item.id, { aktif: !item.aktif });
        toast(`Status jenis ${item.nama_jenis} diperbarui`, "success");
        await loadMasterTypes();
      };
    });

    grid.querySelectorAll("[data-edit-type]").forEach(btn => {
      btn.onclick = () => {
        const item = types.find(x => x.id === btn.dataset.editType);
        if (item) openTypeFormModal(item);
      };
    });

    grid.querySelectorAll("[data-del-type]").forEach(btn => {
      btn.onclick = async () => {
        const item = types.find(x => x.id === btn.dataset.delType);
        if (!item) return;
        const ok = await confirmDialog(`Hapus jenis reimbursement "${item.nama_jenis}"?`);
        if (!ok) return;
        await fsDelete(COL.MASTER_REIMBURSEMENT_TYPE, item.id);
        toast("Jenis reimbursement dihapus", "success");
        await loadMasterTypes();
      };
    });
  }

  async function openTypeFormModal(typeItem = null) {
    const isEdit = Boolean(typeItem);

    if (!masterKaryawanList.length) {
      await loadMasterKaryawan();
    }

    const currentHak = typeItem ? (typeItem.hak_akses || ["ALL"]) : ["ALL"];
    const currentHakUpper = currentHak.map(x => String(x).toUpperCase());
    const isAllChecked = !typeItem || currentHakUpper.includes("ALL");

    openModal({
      title: isEdit ? "Edit Jenis Reimbursement" : "Tambah Jenis Reimbursement Baru",
      size: "lg",
      bodyHtml: `
        <form id="rmb-form-type" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Nama Jenis Reimbursement <span class="text-rose-500">*</span></label>
            <input type="text" id="rmb-type-nama" required value="${escapeHtml(typeItem?.nama_jenis || '')}" placeholder="Contoh: Bensin Operasional, Medis Rawat Jalan" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-maroon-400 outline-none">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Plafon Mingguan (Rp)</label>
              <input type="number" id="rmb-type-mingguan" value="${typeItem?.plafon_mingguan || 0}" min="0" step="10000" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none font-mono" placeholder="0 = Tanpa limit">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Plafon Bulanan (Rp)</label>
              <input type="number" id="rmb-type-bulanan" value="${typeItem?.plafon_bulanan || 0}" min="0" step="50000" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none font-mono" placeholder="0 = Tanpa limit">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Plafon Tahunan (Rp)</label>
              <input type="number" id="rmb-type-tahunan" value="${typeItem?.plafon_tahunan || 0}" min="0" step="100000" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none font-mono" placeholder="0 = Tanpa limit">
            </div>
          </div>

          <!-- Hak Akses Karyawan Section -->
          <div>
            <div class="flex items-center justify-between mb-1 text-xs">
              <label class="block font-bold text-slate-700 uppercase tracking-wide">
                Hak Akses Karyawan <span class="text-rose-500">*</span>
              </label>
              <label class="inline-flex items-center gap-1.5 cursor-pointer font-bold text-maroon-800 bg-maroon-50 hover:bg-maroon-100 px-2.5 py-1 rounded-lg border border-maroon-200 transition">
                <input type="checkbox" id="rmb-type-hak-all" ${isAllChecked ? 'checked' : ''} class="w-3.5 h-3.5 rounded text-maroon-700">
                <span>Semua Karyawan (ALL)</span>
              </label>
            </div>
            <p class="text-[11px] text-slate-500 mb-2">Daftar karyawan yang memiliki izin mengajukan klaim jenis ini (centang karyawan yang diizinkan):</p>

            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <input type="text" id="rmb-type-emp-search" placeholder="Cari nama karyawan / NIK / jabatan..." class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-maroon-400 outline-none bg-white">
                <button type="button" id="rmb-btn-select-all-emp" class="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition shrink-0">Pilih Semua</button>
                <button type="button" id="rmb-btn-deselect-all-emp" class="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition shrink-0">Batal Semua</button>
              </div>

              <div id="rmb-type-emp-list" class="max-h-56 overflow-y-auto space-y-1 pr-1 bg-white rounded-lg border border-slate-200 p-2 text-xs">
                <!-- Checklist populated in onMount -->
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Keterangan / Syarat Klaim</label>
            <textarea id="rmb-type-keterangan" rows="2" placeholder="Ketentuan nota, tanggal maksimal klaim, dll." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">${escapeHtml(typeItem?.keterangan || '')}</textarea>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input type="checkbox" id="rmb-type-wajib-bukti" ${typeItem?.wajib_bukti !== false ? 'checked' : ''} class="w-4 h-4 rounded text-maroon-700">
            <label for="rmb-type-wajib-bukti" class="text-xs font-bold text-slate-700">Wajib Mengunggah Foto Bukti Nota / Kuitansi</label>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="rmb-btn-cancel-type-form" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Batal</button>
        <button id="rmb-btn-save-type-form" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-xs transition">Simpan Jenis</button>
      `,
      onMount: (m) => {
        const empListEl = m.querySelector("#rmb-type-emp-list");
        const chkAll = m.querySelector("#rmb-type-hak-all");
        const searchInput = m.querySelector("#rmb-type-emp-search");
        const btnSelectAll = m.querySelector("#rmb-btn-select-all-emp");
        const btnDeselectAll = m.querySelector("#rmb-btn-deselect-all-emp");

        const selectedNiksSet = new Set();
        if (isAllChecked) {
          masterKaryawanList.forEach(e => {
            const val = String(e.nik_karyawan || e.nik || e.id || e.nama_karyawan || "");
            if (val) selectedNiksSet.add(val);
          });
        } else {
          masterKaryawanList.forEach(e => {
            const nik = String(e.nik_karyawan || e.nik || e.id || "").toUpperCase();
            const nama = String(e.nama_karyawan || e.nama || "").toUpperCase();
            const role = String(e.jabatan || e.posisi || e.role || "").toUpperCase();
            const val = String(e.nik_karyawan || e.nik || e.id || e.nama_karyawan || "");

            if (currentHakUpper.some(h => h === nik || h === nama || h === role)) {
              selectedNiksSet.add(val);
            }
          });
        }

        function renderChecklist() {
          const q = (searchInput.value || "").toLowerCase().trim();
          let filtered = masterKaryawanList;
          if (q) {
            filtered = masterKaryawanList.filter(e =>
              (e.nama_karyawan || e.nama || "").toLowerCase().includes(q) ||
              (e.nik_karyawan || e.nik || "").toLowerCase().includes(q) ||
              (e.jabatan || e.posisi || e.role || "").toLowerCase().includes(q) ||
              (e.cabang || "").toLowerCase().includes(q)
            );
          }

          if (!filtered.length) {
            empListEl.innerHTML = `<p class="text-slate-400 text-center py-4 italic text-xs">Tidak ada karyawan ditemukan.</p>`;
            return;
          }

          empListEl.innerHTML = filtered.map(e => {
            const val = String(e.nik_karyawan || e.nik || e.id || e.nama_karyawan || "");
            const nama = e.nama_karyawan || e.nama || "Tanpa Nama";
            const nik = e.nik_karyawan || e.nik || "-";
            const jabatan = e.jabatan || e.posisi || e.role || "Staff";
            const cabang = e.cabang || "-";
            const checked = selectedNiksSet.has(val);

            return `
              <label class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 border border-slate-100/70 cursor-pointer transition select-none">
                <div class="flex items-center gap-2.5">
                  <input type="checkbox" value="${escapeHtml(val)}" ${checked ? 'checked' : ''} class="rmb-emp-cb w-4 h-4 rounded text-maroon-700 cursor-pointer">
                  <div>
                    <p class="font-bold text-slate-800 text-xs">${escapeHtml(nama)}</p>
                    <p class="text-[10px] text-slate-400">NIK: <span class="font-mono font-medium">${escapeHtml(nik)}</span> • ${escapeHtml(jabatan)} (${escapeHtml(cabang)})</p>
                  </div>
                </div>
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${checked ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}">
                  ${checked ? 'Diizinkan' : 'Dibatasi'}
                </span>
              </label>
            `;
          }).join("");

          empListEl.querySelectorAll(".rmb-emp-cb").forEach(cb => {
            cb.onchange = () => {
              if (cb.checked) {
                selectedNiksSet.add(cb.value);
              } else {
                selectedNiksSet.delete(cb.value);
                chkAll.checked = false;
              }
              if (selectedNiksSet.size === masterKaryawanList.length && masterKaryawanList.length > 0) {
                chkAll.checked = true;
              }
              renderChecklist();
            };
          });
        }

        chkAll.onchange = () => {
          if (chkAll.checked) {
            masterKaryawanList.forEach(e => {
              const val = String(e.nik_karyawan || e.nik || e.id || e.nama_karyawan || "");
              if (val) selectedNiksSet.add(val);
            });
          } else {
            selectedNiksSet.clear();
          }
          renderChecklist();
        };

        searchInput.oninput = renderChecklist;

        btnSelectAll.onclick = () => {
          masterKaryawanList.forEach(e => {
            const val = String(e.nik_karyawan || e.nik || e.id || e.nama_karyawan || "");
            if (val) selectedNiksSet.add(val);
          });
          if (masterKaryawanList.length > 0) chkAll.checked = true;
          renderChecklist();
        };

        btnDeselectAll.onclick = () => {
          selectedNiksSet.clear();
          chkAll.checked = false;
          renderChecklist();
        };

        renderChecklist();

        m.querySelector("#rmb-btn-cancel-type-form").onclick = closeModal;

        m.querySelector("#rmb-btn-save-type-form").onclick = async () => {
          const form = m.querySelector("#rmb-form-type");
          if (!form.reportValidity()) return;

          const nama = m.querySelector("#rmb-type-nama").value.trim();
          const mingguan = toNumber(m.querySelector("#rmb-type-mingguan").value);
          const bulanan = toNumber(m.querySelector("#rmb-type-bulanan").value);
          const tahunan = toNumber(m.querySelector("#rmb-type-tahunan").value);
          const ket = m.querySelector("#rmb-type-keterangan").value.trim();
          const wajib = m.querySelector("#rmb-type-wajib-bukti").checked;

          let hakArray = [];
          if (chkAll.checked || selectedNiksSet.size === masterKaryawanList.length) {
            hakArray = ["ALL"];
          } else {
            hakArray = Array.from(selectedNiksSet);
          }

          if (hakArray.length === 0) {
            toast("Pilih minimal 1 karyawan atau centang 'Semua Karyawan (ALL)'!", "warning");
            return;
          }

          const payload = {
            nama_jenis: nama,
            plafon_mingguan: mingguan,
            plafon_bulanan: bulanan,
            plafon_tahunan: tahunan,
            hak_akses: hakArray,
            wajib_bukti: wajib,
            keterangan: ket,
            aktif: true
          };

          try {
            if (isEdit) {
              await fsUpdate(COL.MASTER_REIMBURSEMENT_TYPE, typeItem.id, payload);
              toast("Jenis reimbursement diperbarui!", "success");
            } else {
              const newId = genId("RMB-TYPE");
              await fsAdd(COL.MASTER_REIMBURSEMENT_TYPE, { id: newId, ...payload }, newId);
              toast("Jenis reimbursement baru berhasil ditambahkan!", "success");
            }
            closeModal();
            await loadMasterTypes();
          } catch (e) {
            toast("Gagal menyimpan jenis: " + e.message, "error");
          }
        };
      }
    });
  }

  // Bind top action buttons
  container.querySelector("#rmb-btn-add-submission")?.addEventListener("click", openSubmissionModal);
 container.querySelector("#rmb-btn-employee-submit")?.addEventListener("click", openSubmissionModal);
  container.querySelector("#rmb-btn-add-type")?.addEventListener("click", () => openTypeFormModal());
  container.querySelector("#rmb-btn-refresh")?.addEventListener("click", async () => {
    toast("Menyegarkan data reimbursement...", "info");
    await Promise.all([loadMasterKaryawan(), loadMasterTypes(), loadClaims()]);
  });

  // Filter events
  ["rmb-filter-search", "rmb-filter-status", "rmb-filter-jenis", "rmb-filter-cabang"].forEach(id => {
    container.querySelector(`#${id}`)?.addEventListener("input", renderClaimsTable);
    container.querySelector(`#${id}`)?.addEventListener("change", renderClaimsTable);
  });

  // Initial load
  await Promise.all([loadMasterKaryawan(), loadMasterTypes(), loadClaims()]);

  return { unmount() {} };
}
