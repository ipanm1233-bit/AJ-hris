import { db, COL, collection, query, where, getDocs, limit } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, genId, fmtDateShort, escapeHtml, sendEmailNotif, createLoginToken, notifyUser, daysBetween, formatStatusKaryawan } from "../utils.js";
import { renderCrudModule, badge, emptyState, skeletonRows, avatar } from "../components.js";
import { FULL_ACCESS_ROLES, ATASAN_VIEW_ROLES, getBawahanNames } from "../auth.js";
import { COMPANY_NAME, logoImgTag, isoDocHeaderTable } from "../branding.js";
import { uploadFileToDrive } from "../gas-integration.js";

export async function mount(container, { session }) {
  const role = (session.role || "").toUpperCase();
  const isFullAccess = FULL_ACCESS_ROLES.includes(role);
  const isAtasanView = !isFullAccess && ATASAN_VIEW_ROLES.includes(role);
  const canManageKontrak = isFullAccess;
  let bawahanNames = null;

  const panels = {
    kontrak: container.querySelector("#pk-panel-kontrak"),
    kpi360: container.querySelector("#pk-panel-kpi360"),
    hasil: container.querySelector("#pk-panel-hasil"),
    evaluasi: container.querySelector("#pk-panel-evaluasi"),
    template: container.querySelector("#pk-panel-template"),
  };
  const loaded = {};

  async function loadKontrak() {
    if (isAtasanView && bawahanNames === null) {
      bawahanNames = await getBawahanNames(session.nama);
    }
    const bset = new Set(bawahanNames || []);

    const wrap = panels.kontrak;
    wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;

    let allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
    let allKontrak = await fsGetAll(COL.MASTER_KONTRAK);

    if (isAtasanView) {
      allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
      allKontrak = allKontrak.filter(k => bset.has(k.nama_karyawan));
    }

    function renderCardView() {
      const kontrakMap = {};
      allKontrak.forEach(c => {
        if (!c.nama_karyawan) return;
        if (!kontrakMap[c.nama_karyawan]) kontrakMap[c.nama_karyawan] = [];
        kontrakMap[c.nama_karyawan].push(c);
      });

      // Sort contracts for each employee by tanggal_mulai / created_at descending
      Object.keys(kontrakMap).forEach(nama => {
        kontrakMap[nama].sort((a, b) => new Date(b.tanggal_mulai || b.created_at || 0) - new Date(a.tanggal_mulai || a.created_at || 0));
      });

      // Combine employees list with contract data
      const empList = allKaryawan.map(k => {
        const contracts = kontrakMap[k.nama_karyawan] || [];
        const latestContract = contracts[0] || null;
        
        let contractStatus = "TANPA KONTRAK";
        let daysLeft = null;

        if (latestContract && latestContract.tanggal_akhir) {
          const today = new Date().toISOString().split("T")[0];
          daysLeft = daysBetween(today, latestContract.tanggal_akhir);
          if (daysLeft < 0) {
            contractStatus = "HABIS";
          } else if (daysLeft <= 30) {
            contractStatus = "SEGERA HABIS";
          } else {
            contractStatus = "AKTIF";
          }
        }

        return {
          ...k,
          contracts,
          latestContract,
          contractStatus,
          daysLeft
        };
      });

      // Add employees from contracts that are not in master karyawan list
      const existingNames = new Set(allKaryawan.map(k => k.nama_karyawan));
      Object.keys(kontrakMap).forEach(nama => {
        if (!existingNames.has(nama)) {
          const contracts = kontrakMap[nama];
          const latestContract = contracts[0] || null;
          let contractStatus = "TANPA KONTRAK";
          let daysLeft = null;
          if (latestContract && latestContract.tanggal_akhir) {
            const today = new Date().toISOString().split("T")[0];
            daysLeft = daysBetween(today, latestContract.tanggal_akhir);
            if (daysLeft < 0) contractStatus = "HABIS";
            else if (daysLeft <= 30) contractStatus = "SEGERA HABIS";
            else contractStatus = "AKTIF";
          }
          empList.push({
            id: null,
            nama_karyawan: nama,
            jabatan: latestContract?.jabatan || "-",
            cabang: latestContract?.cabang || "-",
            divisi: latestContract?.divisi || "-",
            status_karyawan: "KONTRAK",
            aktif_tdk_aktif: "AKTIF",
            contracts,
            latestContract,
            contractStatus,
            daysLeft
          });
        }
      });

      wrap.innerHTML = `
        <div class="space-y-5">
          <!-- Toolbar & Header -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-bold text-slate-800">Kartu Kontrak Karyawan</h2>
              <p class="text-xs text-slate-500 mt-1">Kelola ikatan dinas, riwayat kontrak per karyawan, dan status keaktifan kerja.</p>
            </div>
            ${canManageKontrak ? `
            <button id="btn-add-global-kontrak" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-2 self-start md:self-auto">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              Tambah Kontrak Baru
            </button>` : ''}
          </div>

          <!-- Filter & Search Bar -->
          <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div class="relative w-full sm:w-72">
              <input type="text" id="ktr-search-input" placeholder="🔍 Cari nama, jabatan, cabang..." class="w-full px-3 py-2 pl-9 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
            </div>
            <div class="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              <select id="ktr-filter-status-karyawan" class="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:border-maroon-500 font-medium">
                <option value="ALL">Semua Status Karyawan</option>
                <option value="AKTIF">Status: AKTIF</option>
                <option value="TIDAK AKTIF">Status: TIDAK AKTIF</option>
              </select>
              <select id="ktr-filter-status-kontrak" class="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:border-maroon-500 font-medium">
                <option value="ALL">Semua Masa Kontrak</option>
                <option value="AKTIF">Kontrak: AKTIF (>30 Hari)</option>
                <option value="SEGERA HABIS">Kontrak: SEGERA HABIS (≤30 Hari)</option>
                <option value="HABIS">Kontrak: HABIS</option>
                <option value="TANPA KONTRAK">Tanpa Kontrak</option>
              </select>
            </div>
          </div>

          <!-- Cards Grid -->
          <div id="ktr-cards-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          </div>
        </div>
      `;

      const cardsContainer = wrap.querySelector("#ktr-cards-container");
      const searchInput = wrap.querySelector("#ktr-search-input");
      const filterStatusKaryawan = wrap.querySelector("#ktr-filter-status-karyawan");
      const filterStatusKontrak = wrap.querySelector("#ktr-filter-status-kontrak");

      function drawCards() {
        const q = (searchInput.value || "").toLowerCase().trim();
        const fStatKaryawan = filterStatusKaryawan.value;
        const fStatKontrak = filterStatusKontrak.value;

        const filtered = empList.filter(e => {
          const nameMatch = (e.nama_karyawan || "").toLowerCase().includes(q) ||
                            (e.jabatan || "").toLowerCase().includes(q) ||
                            (e.cabang || "").toLowerCase().includes(q);
          if (!nameMatch) return false;

          const isAktifStr = (e.aktif_tdk_aktif || "AKTIF").toUpperCase();
          if (fStatKaryawan !== "ALL" && isAktifStr !== fStatKaryawan) return false;

          if (fStatKontrak !== "ALL" && e.contractStatus !== fStatKontrak) return false;

          return true;
        });

        if (!filtered.length) {
          cardsContainer.innerHTML = `<div class="col-span-full">${emptyState("Tidak ada data karyawan yang cocok", "Coba ubah kata kunci pencarian atau filter di atas.")}</div>`;
          return;
        }

        cardsContainer.innerHTML = filtered.map(item => {
          const isAktif = (item.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF";
          const contractCount = item.contracts.length;
          const lc = item.latestContract;

          let badgeContractColor = "slate";
          let daysLabel = "Tanpa ikatan kontrak aktif";

          if (item.contractStatus === "AKTIF") {
            badgeContractColor = "emerald";
            daysLabel = `Sisa ${item.daysLeft} Hari`;
          } else if (item.contractStatus === "SEGERA HABIS") {
            badgeContractColor = "amber";
            daysLabel = `Perlu Perpanjangan (${item.daysLeft} Hari Lagi)`;
          } else if (item.contractStatus === "HABIS") {
            badgeContractColor = "red";
            daysLabel = `Sudah Kadaluarsa (${Math.abs(item.daysLeft)} Hari Lalu)`;
          }

          return `
            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between group cursor-pointer card-emp-kontrak" data-emp-name="${escapeHtml(item.nama_karyawan)}">
              <div>
                <!-- Top Header -->
                <div class="flex items-start justify-between gap-3 mb-3">
                  <div class="flex items-center gap-3">
                    ${avatar(item.nama_karyawan || "?", "w-11 h-11 border-2 border-slate-100")}
                    <div>
                      <h3 class="font-bold text-slate-800 text-sm group-hover:text-maroon-700 transition leading-snug">${escapeHtml(item.nama_karyawan)}</h3>
                      <p class="text-xs text-slate-500 font-medium">${escapeHtml(item.jabatan || "-")}</p>
                    </div>
                  </div>
                  ${badge(isAktif ? "AKTIF" : "TIDAK AKTIF", isAktif ? "emerald" : "slate")}
                </div>

                <!-- Info Chips -->
                <div class="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span class="font-semibold text-slate-700">🏢 ${escapeHtml(item.cabang || "Pusat")}</span>
                  ${item.divisi ? `<span>• Divisi: ${escapeHtml(item.divisi)}</span>` : ''}
                  <span>• Status: <strong class="text-slate-800">${escapeHtml(formatStatusKaryawan(item.status_karyawan))}</strong></span>
                </div>

                <!-- Latest Contract Info -->
                <div class="border-t border-slate-100 pt-3 space-y-1.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-slate-400 font-medium">Kontrak Terbaru:</span>
                    <span class="font-bold text-slate-700">${lc ? `Kontrak Ke-${lc.kontrak_ke || 1}` : "Belum Ada"}</span>
                  </div>
                  ${lc ? `
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-slate-400 font-medium">Periode:</span>
                    <span class="font-medium text-slate-700">${fmtDateShort(lc.tanggal_mulai)} - ${fmtDateShort(lc.tanggal_akhir)}</span>
                  </div>
                  <div class="mt-2 flex items-center justify-between">
                    ${badge(item.contractStatus, badgeContractColor)}
                    <span class="text-[11px] font-semibold text-slate-500">${daysLabel}</span>
                  </div>` : `
                  <div class="py-2 text-center text-xs text-slate-400 italic">Belum ada riwayat kontrak di sistem</div>`}
                </div>
              </div>

              <!-- Footer Action -->
              <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-slate-500">📄 ${contractCount} Riwayat Kontrak</span>
                <button type="button" class="text-xs font-bold text-maroon-700 hover:text-maroon-800 hover:bg-maroon-50 px-3 py-1.5 rounded-xl transition flex items-center gap-1">
                  👁️ Detail & Kelola
                </button>
              </div>
            </div>
          `;
        }).join("");

        cardsContainer.querySelectorAll(".card-emp-kontrak").forEach(card => {
          card.onclick = () => {
            const empName = card.dataset.empName;
            const empData = empList.find(e => e.nama_karyawan === empName);
            if (empData) openEmployeeContractModal(empData, reloadData);
          };
        });
      }

      searchInput.oninput = drawCards;
      filterStatusKaryawan.onchange = drawCards;
      filterStatusKontrak.onchange = drawCards;
      drawCards();

      if (canManageKontrak && wrap.querySelector("#btn-add-global-kontrak")) {
        wrap.querySelector("#btn-add-global-kontrak").onclick = () => {
          openAddNewContractGlobalModal(allKaryawan, reloadData);
        };
      }
    }

    async function reloadData() {
      allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
      allKontrak = await fsGetAll(COL.MASTER_KONTRAK);
      if (isAtasanView) {
        allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
        allKontrak = allKontrak.filter(k => bset.has(k.nama_karyawan));
      }
      renderCardView();
    }

    renderCardView();
  }

  function openEmployeeContractModal(empData, reloadData) {
    const isAktif = (empData.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF";
    const contracts = empData.contracts || [];
    const latestKe = contracts.length ? Math.max(...contracts.map(c => Number(c.kontrak_ke || 1))) : 0;

    openModal({
      title: `Riwayat & Kelola Kontrak: ${escapeHtml(empData.nama_karyawan)}`,
      size: "lg",
      bodyHtml: `
        <div class="space-y-6">
          <!-- Profile Header & Employee Status Update -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              ${avatar(empData.nama_karyawan || "?", "w-12 h-12 border-2 border-white shadow-xs")}
              <div>
                <h3 class="font-bold text-slate-800 text-base">${escapeHtml(empData.nama_karyawan)}</h3>
                <p class="text-xs text-slate-500">${escapeHtml(empData.jabatan || "-")} • ${escapeHtml(empData.cabang || "Pusat")}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 w-full md:w-auto flex-wrap bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
              <div class="flex flex-col">
                <label class="text-[10px] font-bold text-slate-400 uppercase">Status Keaktifan</label>
                <select id="modal-emp-aktif" class="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 outline-none focus:border-maroon-500">
                  <option value="AKTIF" ${isAktif ? 'selected' : ''}>AKTIF</option>
                  <option value="TIDAK AKTIF" ${!isAktif ? 'selected' : ''}>TIDAK AKTIF</option>
                </select>
              </div>
              <div class="flex flex-col">
                <label class="text-[10px] font-bold text-slate-400 uppercase">Status Karyawan</label>
                <select id="modal-emp-type" class="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 outline-none focus:border-maroon-500">
                  <option value="PKWTT" ${String(empData.status_karyawan || "").toUpperCase().includes("PKWTT") || empData.status_karyawan === "TETAP" ? 'selected' : ''}>PKWTT (Karyawan Tetap)</option>
                  <option value="PKWT" ${String(empData.status_karyawan || "").toUpperCase().includes("PKWT") || empData.status_karyawan === "KONTRAK" || !empData.status_karyawan ? 'selected' : ''}>PKWT (Karyawan Kontrak)</option>
                  <option value="PROBATION" ${String(empData.status_karyawan || "").toUpperCase().includes("PROBATION") ? 'selected' : ''}>Probation (Masa Percobaan)</option>
                  <option value="MAGANG" ${String(empData.status_karyawan || "").toUpperCase().includes("MAGANG") ? 'selected' : ''}>Magang</option>
                  <option value="BURUH HARIAN" ${String(empData.status_karyawan || "").toUpperCase().includes("BURUH") ? 'selected' : ''}>Buruh Harian</option>
                  <option value="OUTSOURCING" ${String(empData.status_karyawan || "").toUpperCase().includes("OUTSOURCING") ? 'selected' : ''}>Outsourcing</option>
                  <option value="LAINNYA" ${String(empData.status_karyawan || "").toUpperCase().includes("LAINNYA") || empData.status_karyawan === "RESIGN" ? 'selected' : ''}>Lainnya</option>
                </select>
              </div>
              ${empData.id ? `
              <button id="btn-save-emp-status" class="mt-auto bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs">
                💾 Simpan
              </button>` : ''}
            </div>
          </div>

          <!-- Section 1: Riwayat Kontrak -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>📋 Riwayat Kontrak Kerja</span>
                <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">${contracts.length} Dokumen</span>
              </h4>
              ${canManageKontrak ? `
              <button id="btn-toggle-add-kontrak" class="text-xs font-bold text-maroon-700 bg-maroon-50 hover:bg-maroon-100 px-3 py-1.5 rounded-xl border border-maroon-200 transition flex items-center gap-1">
                ➕ Perpanjang / Kontrak Baru
              </button>` : ''}
            </div>

            <!-- Add Contract Form -->
            <div id="add-kontrak-form-wrap" class="hidden mb-4 bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3">
              <h5 class="text-xs font-bold text-amber-900 uppercase tracking-wide">Form Tambah / Perpanjang Kontrak</h5>
              <form id="form-new-kontrak" class="space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Kontrak Ke-</label>
                    <input type="number" name="kontrak_ke" value="${latestKe + 1}" required class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal Mulai</label>
                    <input type="date" name="tanggal_mulai" required class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal Akhir</label>
                    <input type="date" name="tanggal_akhir" required class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jabatan</label>
                    <input type="text" name="jabatan" value="${escapeHtml(empData.jabatan || "")}" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Cabang</label>
                    <input type="text" name="cabang" value="${escapeHtml(empData.cabang || "")}" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Divisi</label>
                    <input type="text" name="divisi" value="${escapeHtml(empData.divisi || "")}" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Status Kontrak</label>
                    <select name="status_kolom_kontrak" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white font-medium">
                      <option value="AKTIF" selected>AKTIF</option>
                      <option value="SEGERA HABIS">SEGERA HABIS</option>
                      <option value="DIPERPANJANG">DIPERPANJANG</option>
                      <option value="DONE">DONE / SELESAI</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-slate-600 mb-1">Dokumen Lampiran Kontrak (Google Drive)</label>
                    <input type="file" name="file_dokumen" accept="image/*,.pdf,.doc,.docx" class="w-full px-3 py-1 text-xs rounded-xl border border-slate-200 bg-white">
                  </div>
                </div>

                <div class="flex items-center justify-between pt-2">
                  <button type="button" id="btn-cancel-add-kontrak" class="text-xs font-semibold text-slate-500 hover:text-slate-700">Batal</button>
                  <button type="submit" id="btn-submit-kontrak" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs">
                    💾 Simpan Kontrak Baru
                  </button>
                </div>
              </form>
            </div>

            <!-- History Timeline Cards -->
            ${contracts.length === 0 ? `
              <div class="bg-slate-50 rounded-xl p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200">
                Belum ada data riwayat kontrak tercatat untuk karyawan ini. Klik tombol "Perpanjang / Kontrak Baru" di atas untuk menambahkan.
              </div>` : `
              <div class="space-y-3 max-h-80 overflow-y-auto pr-1">
                ${contracts.map((c, idx) => `
                  <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-slate-800 text-xs bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">Kontrak Ke-${c.kontrak_ke || (contracts.length - idx)}</span>
                        ${badge(c.status_kolom_kontrak || "AKTIF", c.status_kolom_kontrak === "AKTIF" ? "emerald" : "amber")}
                      </div>
                      <p class="text-xs text-slate-600 font-medium">
                        📅 Periode: <strong>${fmtDateShort(c.tanggal_mulai)}</strong> s/d <strong>${fmtDateShort(c.tanggal_akhir)}</strong>
                      </p>
                      <p class="text-[11px] text-slate-400">
                        Jabatan: ${escapeHtml(c.jabatan || "-")} ${c.cabang ? `• Cabang: ${escapeHtml(c.cabang)}` : ''}
                      </p>
                      ${c.link_dokumen ? `
                      <a href="${escapeHtml(c.link_dokumen)}" target="_blank" class="inline-block text-xs font-semibold text-maroon-700 hover:underline mt-1">
                        🔗 Lihat File Dokumen Kontrak
                      </a>` : ''}
                    </div>
                    ${canManageKontrak ? `
                    <button type="button" class="btn-del-kontrak-item text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition shrink-0" data-kontrak-id="${c.id}">
                      🗑️ Hapus
                    </button>` : ''}
                  </div>
                `).join("")}
              </div>`}
          </div>
        </div>
      `,
      footerHtml: `
        <button id="modal-close-btn" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition">Tutup</button>
      `,
      onMount: (m) => {
        m.querySelector("#modal-close-btn").onclick = closeModal;

        // Update Employee status button logic
        const btnSaveEmpStatus = m.querySelector("#btn-save-emp-status");
        if (btnSaveEmpStatus && empData.id) {
          btnSaveEmpStatus.onclick = async () => {
            const aktif_tdk_aktif = m.querySelector("#modal-emp-aktif").value;
            const status_karyawan = m.querySelector("#modal-emp-type").value;

            try {
              btnSaveEmpStatus.disabled = true;
              btnSaveEmpStatus.textContent = "Menyimpan...";
              await fsUpdate(COL.MASTER_KARYAWAN, empData.id, {
                aktif_tdk_aktif,
                status_karyawan
              });
              toast("Status karyawan berhasil diperbarui!", "success");
              closeModal();
              reloadData();
            } catch (e) {
              toast("Gagal memperbarui status: " + e.message, "error");
              btnSaveEmpStatus.disabled = false;
              btnSaveEmpStatus.textContent = "💾 Simpan";
            }
          };
        }

        // Toggle Add Contract Form
        const formWrap = m.querySelector("#add-kontrak-form-wrap");
        const btnToggleAdd = m.querySelector("#btn-toggle-add-kontrak");
        const btnCancelAdd = m.querySelector("#btn-cancel-add-kontrak");

        if (btnToggleAdd) btnToggleAdd.onclick = () => formWrap.classList.toggle("hidden");
        if (btnCancelAdd) btnCancelAdd.onclick = () => formWrap.classList.add("hidden");

        // Handle Delete Contract Item
        m.querySelectorAll(".btn-del-kontrak-item").forEach(btn => {
          btn.onclick = async () => {
            const kId = btn.dataset.kontrakId;
            if (!kId) return;
            if (!confirm("Apakah Anda yakin ingin menghapus catatan kontrak ini?")) return;

            try {
              await fsDelete(COL.MASTER_KONTRAK, kId);
              toast("Catatan kontrak berhasil dihapus", "success");
              closeModal();
              reloadData();
            } catch (e) {
              toast("Gagal menghapus kontrak: " + e.message, "error");
            }
          };
        });

        // Submit New Contract Form
        const formNew = m.querySelector("#form-new-kontrak");
        if (formNew) {
          formNew.onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(formNew);
            const btnSubmit = m.querySelector("#btn-submit-kontrak");

            try {
              btnSubmit.disabled = true;
              btnSubmit.textContent = "Menyimpan...";

              const kId = genId("KTR");
              let link_dokumen = "";

              const fileInput = formNew.querySelector('input[name="file_dokumen"]');
              const file = fileInput.files && fileInput.files[0];
              if (file) {
                btnSubmit.textContent = "Mengupload File...";
                link_dokumen = await uploadFileToDrive(file, `Kontrak/${empData.nama_karyawan}/${kId}`);
              }

              const payload = {
                nama_karyawan: empData.nama_karyawan,
                kontrak_ke: Number(fd.get("kontrak_ke") || 1),
                tanggal_mulai: fd.get("tanggal_mulai"),
                tanggal_akhir: fd.get("tanggal_akhir"),
                jabatan: fd.get("jabatan") || empData.jabatan || "",
                cabang: fd.get("cabang") || empData.cabang || "",
                divisi: fd.get("divisi") || empData.divisi || "",
                status_kolom_kontrak: fd.get("status_kolom_kontrak") || "AKTIF",
                link_dokumen: link_dokumen
              };

              await fsAdd(COL.MASTER_KONTRAK, payload, kId);

              // Update Master Karyawan contract dates & status if employee exists
              if (empData.id) {
                await fsUpdate(COL.MASTER_KARYAWAN, empData.id, {
                  status_karyawan: "KONTRAK",
                  tgl_mulai_kontrak: payload.tanggal_mulai,
                  tgl_akhir_kontrak: payload.tanggal_akhir,
                  aktif_tdk_aktif: "AKTIF"
                });
              }

              toast("Kontrak baru berhasil ditambahkan!", "success");
              closeModal();
              reloadData();
            } catch (err) {
              toast("Gagal menambahkan kontrak: " + err.message, "error");
              btnSubmit.disabled = false;
              btnSubmit.textContent = "💾 Simpan Kontrak Baru";
            }
          };
        }
      }
    });
  }

  function openAddNewContractGlobalModal(allKaryawan, reloadData) {
    openModal({
      title: "Tambah Kontrak Kerja Baru",
      size: "md",
      bodyHtml: `
        <form id="form-global-kontrak" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Pilih Karyawan *</label>
            <select name="nama_karyawan" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none bg-white font-medium">
              <option value="">-- Pilih Karyawan --</option>
              ${allKaryawan.map(k => `<option value="${escapeHtml(k.nama_karyawan)}" data-jabatan="${escapeHtml(k.jabatan || '')}" data-cabang="${escapeHtml(k.cabang || '')}">${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || '')}</option>`).join("")}
            </select>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Kontrak Ke- *</label>
              <input type="number" name="kontrak_ke" value="1" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Mulai *</label>
              <input type="date" name="tanggal_mulai" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Akhir *</label>
              <input type="date" name="tanggal_akhir" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Jabatan</label>
              <input type="text" name="jabatan" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Cabang</label>
              <input type="text" name="cabang" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Dokumen Lampiran (Google Drive)</label>
            <input type="file" name="file_dokumen" accept="image/*,.pdf,.doc,.docx" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white">
          </div>
        </form>
      `,
      footerHtml: `
        <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="modal-submit-btn" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 transition">Simpan Kontrak</button>
      `,
      onMount: (m) => {
        m.querySelector("#modal-cancel-btn").onclick = closeModal;

        const selEmp = m.querySelector('select[name="nama_karyawan"]');
        selEmp.onchange = () => {
          const opt = selEmp.options[selEmp.selectedIndex];
          if (opt) {
            m.querySelector('input[name="jabatan"]').value = opt.dataset.jabatan || "";
            m.querySelector('input[name="cabang"]').value = opt.dataset.cabang || "";
          }
        };

        m.querySelector("#modal-submit-btn").onclick = async () => {
          const form = m.querySelector("#form-global-kontrak");
          if (!form.reportValidity()) return;

          const fd = new FormData(form);
          const btnSubmit = m.querySelector("#modal-submit-btn");

          try {
            btnSubmit.disabled = true;
            btnSubmit.textContent = "Menyimpan...";

            const kId = genId("KTR");
            let link_dokumen = "";

            const fileInput = form.querySelector('input[name="file_dokumen"]');
            const file = fileInput.files && fileInput.files[0];
            const namaKaryawan = fd.get("nama_karyawan");

            if (file) {
              btnSubmit.textContent = "Mengupload File...";
              link_dokumen = await uploadFileToDrive(file, `Kontrak/${namaKaryawan}/${kId}`);
            }

            const payload = {
              nama_karyawan: namaKaryawan,
              kontrak_ke: Number(fd.get("kontrak_ke") || 1),
              tanggal_mulai: fd.get("tanggal_mulai"),
              tanggal_akhir: fd.get("tanggal_akhir"),
              jabatan: fd.get("jabatan") || "",
              cabang: fd.get("cabang") || "",
              status_kolom_kontrak: "AKTIF",
              link_dokumen: link_dokumen
            };

            await fsAdd(COL.MASTER_KONTRAK, payload, kId);

            // Find employee in allKaryawan to update master karyawan
            const matched = allKaryawan.find(k => k.nama_karyawan === namaKaryawan);
            if (matched && matched.id) {
              await fsUpdate(COL.MASTER_KARYAWAN, matched.id, {
                status_karyawan: "KONTRAK",
                tgl_mulai_kontrak: payload.tanggal_mulai,
                tgl_akhir_kontrak: payload.tanggal_akhir,
                aktif_tdk_aktif: "AKTIF"
              });
            }

            toast("Kontrak kerja berhasil disimpan!", "success");
            closeModal();
            reloadData();
          } catch (e) {
            toast("Gagal menyimpan kontrak: " + e.message, "error");
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Simpan Kontrak";
          }
        };
      }
    });
  }

  async function loadTemplateKpi() {
    const wrap = panels.template;
    wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;

    const [templates, allKaryawan] = await Promise.all([
      fsGetAll(COL.MASTER_SOAL_KPI),
      fsGetAll(COL.MASTER_KARYAWAN)
    ]);

    const activeKaryawan = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF" && k.nama_karyawan);

    function renderView() {
      let html = `
        <div class="space-y-5">
          <!-- Header Toolbar -->
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-bold text-slate-800">Master Template Soal KPI</h2>
              <p class="text-xs text-slate-500 mt-1">Kelola set indikator penilaian (Contoh: Sales, Admin, Produksi) dan tetapkan daftar karyawan untuk tiap template.</p>
            </div>
            <div class="flex items-center gap-2 self-start md:self-auto flex-wrap">
              <input type="file" id="kpi-excel-upload" accept=".xlsx, .xls" class="hidden">
              <button id="btn-import-template" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                Import Excel
              </button>
              <button id="btn-add-template" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                Buat Template Baru
              </button>
            </div>
          </div>

          <!-- Search & Filter Bar -->
          <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between gap-3">
            <div class="relative w-full sm:w-80">
              <input type="text" id="tpl-search-input" placeholder="🔍 Cari nama template, indikator, atau karyawan..." class="w-full px-3.5 py-2 pl-9 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
            </div>
            <div class="text-xs text-slate-500 font-medium">
              Total <strong class="text-slate-800">${templates.length}</strong> Template Tersedia
            </div>
          </div>

          <!-- Cards Grid -->
          <div id="tpl-cards-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          </div>
        </div>
      `;

      wrap.innerHTML = html;

      const userRole = (session?.role || "").toUpperCase();
      const isHrdRole = ["HRD", "SUPERADMIN", "ADMIN"].includes(userRole);
      const btnImport = wrap.querySelector("#btn-import-template");
      const inputExcel = wrap.querySelector("#kpi-excel-upload");
      if (btnImport) {
        if (!isHrdRole) {
          btnImport.style.display = "none";
        } else if (inputExcel) {
          btnImport.onclick = () => inputExcel.click();
          inputExcel.onchange = (e) => handleExcelImport(e.target.files[0]);
        }
      }

      const btnAdd = wrap.querySelector("#btn-add-template");
      if (btnAdd) btnAdd.onclick = () => openTemplateModal(null, activeKaryawan);

      const searchInput = wrap.querySelector("#tpl-search-input");
      const cardsContainer = wrap.querySelector("#tpl-cards-container");

      function drawCards() {
        const q = (searchInput.value || "").toLowerCase().trim();

        const filtered = templates.filter(t => {
          const nama = (t.nama_template || "").toLowerCase();
          const assigned = (t.karyawan_assigned || []).join(" ").toLowerCase();
          const indikatorText = (t.soal_json || []).map(s => `${s.aspek} ${s.indikator}`).join(" ").toLowerCase();

          return nama.includes(q) || assigned.includes(q) || indikatorText.includes(q);
        });

        if (!filtered.length) {
          cardsContainer.innerHTML = `<div class="col-span-full">${emptyState("Belum ada Template Soal KPI yang cocok", "Klik tombol Buat Template Baru di atas untuk menambah template.")}</div>`;
          return;
        }

        cardsContainer.innerHTML = filtered.map(t => {
          const nama = t.nama_template || "Template Tanpa Nama";
          const soalList = t.soal_json || [];
          const totalBobot = soalList.reduce((acc, curr) => acc + (parseFloat(curr.bobot) || 0), 0);
          const assignedList = Array.isArray(t.karyawan_assigned) ? t.karyawan_assigned : [];

          const isBobot100 = Math.round(totalBobot) === 100;

          // Preview indicators (up to 3)
          const previewSoal = soalList.slice(0, 3);
          const extraSoalCount = soalList.length - 3;

          // Preview assigned employees (up to 4)
          const previewEmployees = assignedList.slice(0, 4);
          const extraEmpCount = assignedList.length - 4;

          return `
            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between group cursor-pointer tpl-card-item" data-tpl-id="${t.id}">
              <div>
                <!-- Top Header -->
                <div class="flex items-start justify-between gap-3 mb-3">
                  <div class="flex items-center gap-2.5">
                    <div class="w-10 h-10 rounded-xl bg-maroon-50 text-maroon-700 font-bold flex items-center justify-center text-lg shadow-2xs group-hover:bg-maroon-700 group-hover:text-white transition">
                      📋
                    </div>
                    <div>
                      <h3 class="font-bold text-slate-800 text-sm group-hover:text-maroon-700 transition leading-snug">${escapeHtml(nama)}</h3>
                      <p class="text-[11px] text-slate-400 font-medium">${soalList.length} Indikator Kinerja</p>
                    </div>
                  </div>
                  ${isBobot100 ? `
                    <span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Total 100%</span>
                  ` : `
                    <span class="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Bobot ${totalBobot}%</span>
                  `}
                </div>

                <!-- Section Preview Indikator KPI -->
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-3 space-y-1.5">
                  <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
                    <span>🎯 Detail Soal KPI</span>
                    <span class="text-slate-400 font-normal lowercase">${soalList.length} soal</span>
                  </div>
                  ${soalList.length > 0 ? `
                    <div class="space-y-1 mt-1">
                      ${previewSoal.map(s => `
                        <div class="flex items-center justify-between text-xs bg-white p-1.5 rounded-lg border border-slate-100">
                          <span class="truncate text-slate-700 font-medium pr-2" title="${escapeHtml(s.indikator)}">${escapeHtml(s.indikator || s.aspek)}</span>
                          <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${s.bobot}%</span>
                        </div>
                      `).join("")}
                      ${extraSoalCount > 0 ? `
                        <div class="text-[10px] text-slate-400 italic text-center pt-0.5">+ ${extraSoalCount} indikator lainnya</div>
                      ` : ''}
                    </div>
                  ` : `
                    <p class="text-xs text-slate-400 italic py-1">Belum ada indikator ditambahkan</p>
                  `}
                </div>

                <!-- Section Karyawan Terdaftar -->
                <div class="border-t border-slate-100 pt-3">
                  <div class="flex items-center justify-between text-xs mb-2">
                    <span class="text-slate-500 font-semibold flex items-center gap-1">👥 Karyawan Masuk Template:</span>
                    <span class="font-bold text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded-full text-[11px]">${assignedList.length} Orang</span>
                  </div>
                  ${assignedList.length > 0 ? `
                    <div class="flex flex-wrap gap-1">
                      ${previewEmployees.map(emp => `
                        <span class="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-medium border border-slate-200">
                          <span>👤</span> ${escapeHtml(emp)}
                        </span>
                      `).join("")}
                      ${extraEmpCount > 0 ? `
                        <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">+${extraEmpCount} lagi</span>
                      ` : ''}
                    </div>
                  ` : `
                    <p class="text-xs text-slate-400 italic bg-amber-50/50 border border-amber-100 p-2 rounded-xl text-center">Belum ada karyawan yang dimasukkan ke template ini.</p>
                  `}
                </div>
              </div>

              <!-- Footer Action Buttons -->
              <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button type="button" data-del-tpl="${t.id}" class="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition">
                  🗑️ Hapus
                </button>
                <button type="button" data-edit-tpl="${t.id}" class="text-xs font-bold text-maroon-700 bg-maroon-50 hover:bg-maroon-100 px-3 py-1.5 rounded-xl transition flex items-center gap-1">
                  👁️ Detail Soal & Edit
                </button>
              </div>
            </div>
          `;
        }).join("");

        // Attach Card Action Events
        cardsContainer.querySelectorAll("[data-edit-tpl]").forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const tplId = btn.dataset.editTpl;
            openTemplateModal(templates.find(x => x.id === tplId), activeKaryawan);
          };
        });

        cardsContainer.querySelectorAll(".tpl-card-item").forEach(card => {
          card.onclick = () => {
            const tplId = card.dataset.tplId;
            openTemplateModal(templates.find(x => x.id === tplId), activeKaryawan);
          };
        });

        cardsContainer.querySelectorAll("[data-del-tpl]").forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            const tplId = btn.dataset.delTpl;
            if (confirm("Apakah Anda yakin ingin menghapus template KPI ini?")) {
              await fsDelete(COL.MASTER_SOAL_KPI, tplId);
              toast("Template berhasil dihapus", "success");
              loadTemplateKpi();
            }
          };
        });
      }

      drawCards();
      if (searchInput) searchInput.oninput = drawCards;
    }

    renderView();
  }

  async function handleExcelImport(file) {
    if (!file || typeof window.XLSX === "undefined") return;
    const btn = panels.template.querySelector("#btn-import-template");
    btn.innerHTML = `Membaca File...`; btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = window.XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = window.XLSX.utils.sheet_to_json(worksheet, {raw: false});
            const groupedTemplates = {};

            rows.forEach(row => {
                const getVal = (keys) => {
                    for(let k of Object.keys(row)) { if(keys.some(x => k.toUpperCase().includes(x))) return row[k]; }
                    return "";
                };
                const jabatan = getVal(["JABATAN", "POSISI"]);
                const aspek = getVal(["ASPEK"]);
                const indikator = getVal(["INDIKATOR", "PERTANYAAN"]);
                const bobot = parseFloat(getVal(["BOBOT", "BOB"])) || 0;

                if (!jabatan || !indikator) return;
                if (!groupedTemplates[jabatan]) groupedTemplates[jabatan] = { nama_template: jabatan, soal_json: [], karyawan_assigned: [] };
                groupedTemplates[jabatan].soal_json.push({ aspek: aspek || "Umum", indikator, bobot, nilai_diberikan: 0 });
            });

            const templateNames = Object.keys(groupedTemplates);
            for (const name of templateNames) {
                await fsAdd(COL.MASTER_SOAL_KPI, groupedTemplates[name], genId("TPL-KPI"));
            }
            toast(`Berhasil meng-import ${templateNames.length} Template dari Excel!`, "success");
            loadTemplateKpi();
        } catch(err) { toast("Gagal: " + err.message, "error"); }
    };
    reader.readAsArrayBuffer(file);
  }

  function openTemplateModal(existingData = null, activeKaryawan = []) {
    const assignedSet = new Set(existingData?.karyawan_assigned || []);

    openModal({
      title: existingData ? `Detail & Edit Template: ${escapeHtml(existingData.nama_template || "Template KPI")}` : "Buat Template Soal KPI Baru",
      size: "lg",
      bodyHtml: `
        <div class="space-y-4">
          <!-- Nama Template -->
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Nama Template / Jabatan <span class="text-red-500">*</span></label>
            <input type="text" id="tpl-nama" value="${existingData ? escapeHtml(existingData.nama_template || '') : ''}" placeholder="Cth: Template KPI Sales Representative" required class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:border-maroon-500 outline-none font-medium bg-white">
          </div>

          <!-- TAB / SECTION SELECTOR -->
          <div class="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button type="button" id="tab-btn-soal" class="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-maroon-700 text-white transition shadow-2xs">
              📝 Detail Soal & Indikator KPI
            </button>
            <button type="button" id="tab-btn-karyawan" class="px-3.5 py-1.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5">
              👥 Karyawan yang Masuk Template
              <span id="tpl-karyawan-counter" class="bg-maroon-100 text-maroon-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">${assignedSet.size}</span>
            </button>
          </div>

          <!-- PANEL 1: SOAL & INDIKATOR KPI -->
          <div id="panel-tpl-soal" class="space-y-3">
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div class="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                <label class="text-xs font-bold text-slate-700 uppercase tracking-wide">Indikator & Bobot Penilaian (Wajib Total 100%)</label>
                <span id="tpl-bobot-total" class="text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg">Total Bobot: 0%</span>
              </div>
              <div id="tpl-soal-list" class="space-y-2.5 mb-3"></div>
              <button type="button" id="btn-tpl-add" class="text-xs text-maroon-700 font-bold hover:underline flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-maroon-200 shadow-2xs">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Tambah Indikator Baru
              </button>
            </div>
          </div>

          <!-- PANEL 2: DAFTAR KARYAWAN -->
          <div id="panel-tpl-karyawan" class="hidden space-y-3">
            <div class="bg-amber-50/60 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
              <span>💡 <strong>Informasi:</strong> Karyawan yang dicentang di bawah ini akan otomatis menggunakan template KPI ini saat HRD melakukan Distribusi Penilaian 360.</span>
            </div>

            <div class="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
              <!-- Search & Quick Selection -->
              <div class="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
                <input type="text" id="tpl-search-karyawan" placeholder="🔍 Cari nama karyawan, jabatan, divisi..." class="w-full sm:w-72 px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-white">
                <div class="flex items-center gap-2 self-end sm:self-auto">
                  <button type="button" id="btn-check-all-karyawan" class="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">Centang Semua</button>
                  <button type="button" id="btn-uncheck-all-karyawan" class="text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">Hapus Semua</button>
                </div>
              </div>

              <!-- List Checkbox -->
              <div id="tpl-karyawan-checkbox-list" class="max-h-60 overflow-y-auto divide-y divide-slate-100 p-1 bg-white">
              </div>
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full">
          <button id="btn-tpl-batal" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
          <button id="btn-tpl-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">💾 Simpan Template & Karyawan</button>
        </div>
      `,
      onMount: (m) => {
        const tabBtnSoal = m.querySelector("#tab-btn-soal");
        const tabBtnKaryawan = m.querySelector("#tab-btn-karyawan");
        const panelSoal = m.querySelector("#panel-tpl-soal");
        const panelKaryawan = m.querySelector("#panel-tpl-karyawan");

        const soalList = m.querySelector("#tpl-soal-list");
        const badgeBobot = m.querySelector("#tpl-bobot-total");
        const counterKaryawan = m.querySelector("#tpl-karyawan-counter");
        const karyawanListContainer = m.querySelector("#tpl-karyawan-checkbox-list");
        const searchKaryawanInput = m.querySelector("#tpl-search-karyawan");

        // Tab Switch logic
        tabBtnSoal.onclick = () => {
          panelSoal.classList.remove("hidden");
          panelKaryawan.classList.add("hidden");
          tabBtnSoal.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl bg-maroon-700 text-white transition shadow-2xs";
          tabBtnKaryawan.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5";
        };

        tabBtnKaryawan.onclick = () => {
          panelKaryawan.classList.remove("hidden");
          panelSoal.classList.add("hidden");
          tabBtnKaryawan.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl bg-maroon-700 text-white transition shadow-2xs flex items-center gap-1.5";
          tabBtnSoal.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition";
        };

        // Render Karyawan Checkbox List
        function updateCounter() {
          const checkedBoxes = m.querySelectorAll('input[name="tpl-karyawan-cb"]:checked');
          counterKaryawan.textContent = checkedBoxes.length;
        }

        function drawKaryawanCheckboxes(filterText = "") {
          const term = filterText.toLowerCase().trim();

          karyawanListContainer.innerHTML = activeKaryawan.map(k => {
            const nama = k.nama_karyawan || "";
            const jabatan = k.jabatan || "-";
            const cabang = k.cabang || "Pusat";
            const divisi = k.divisi || "";

            const match = nama.toLowerCase().includes(term) || jabatan.toLowerCase().includes(term) || divisi.toLowerCase().includes(term);
            if (!match || !nama) return "";

            const isChecked = assignedSet.has(nama);

            return `
              <label class="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition select-none group">
                <div class="flex items-center gap-3">
                  <input type="checkbox" name="tpl-karyawan-cb" value="${escapeHtml(nama)}" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-maroon-600 border-slate-300 rounded focus:ring-maroon-500 cursor-pointer">
                  <div>
                    <p class="text-xs font-bold text-slate-800 group-hover:text-maroon-700 transition">${escapeHtml(nama)}</p>
                    <p class="text-[11px] text-slate-400 font-medium">${escapeHtml(jabatan)} ${divisi ? `• Divisi ${escapeHtml(divisi)}` : ''} • Cabang ${escapeHtml(cabang)}</p>
                  </div>
                </div>
              </label>
            `;
          }).join("");

          m.querySelectorAll('input[name="tpl-karyawan-cb"]').forEach(cb => {
            cb.onchange = updateCounter;
          });
          updateCounter();
        }

        drawKaryawanCheckboxes();
        if (searchKaryawanInput) {
          searchKaryawanInput.oninput = (e) => drawKaryawanCheckboxes(e.target.value);
        }

        m.querySelector("#btn-check-all-karyawan").onclick = () => {
          m.querySelectorAll('input[name="tpl-karyawan-cb"]').forEach(cb => cb.checked = true);
          updateCounter();
        };

        m.querySelector("#btn-uncheck-all-karyawan").onclick = () => {
          m.querySelectorAll('input[name="tpl-karyawan-cb"]').forEach(cb => cb.checked = false);
          updateCounter();
        };

        // Indicator & Bobot Logic
        function calcTotalBobot() {
          let total = 0;
          m.querySelectorAll(".soal-bobot").forEach(input => total += parseFloat(input.value) || 0);
          badgeBobot.textContent = `Total Bobot: ${total}%`;
          if (total === 100) {
            badgeBobot.className = "text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-300";
          } else {
            badgeBobot.className = "text-xs font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-lg border border-red-300";
          }
          return total;
        }

        function addSoalUI(data = { aspek: "", indikator: "", bobot: "" }) {
          const div = document.createElement("div");
          div.className = "flex gap-2 items-start bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs";
          div.innerHTML = `
            <div class="flex-1 space-y-2">
              <input type="text" placeholder="Aspek Penilaian (Cth: Kedisiplinan / Target)" value="${escapeHtml(data.aspek || '')}" class="soal-aspek w-full px-2.5 py-1.5 text-xs border rounded-lg outline-none focus:border-maroon-400 font-medium" required>
              <input type="text" placeholder="Indikator Kinerja / Detail Pertanyaan" value="${escapeHtml(data.indikator || '')}" class="soal-indikator w-full px-2.5 py-1.5 text-xs border rounded-lg outline-none focus:border-maroon-400" required>
            </div>
            <div class="w-24 text-center">
              <label class="block text-[10px] text-slate-400 font-semibold mb-1">Bobot %</label>
              <input type="number" placeholder="10" value="${data.bobot || ''}" class="soal-bobot w-full px-2.5 py-1.5 text-xs border rounded-lg text-center font-bold text-slate-800 outline-none focus:border-maroon-400" required min="1" max="100">
            </div>
            <button type="button" class="text-slate-300 hover:text-red-500 mt-5 p-1 rounded hover:bg-red-50 transition" title="Hapus Indikator">✖</button>
          `;
          div.querySelector(".soal-bobot").addEventListener("input", calcTotalBobot);
          div.querySelector("button").addEventListener("click", () => { div.remove(); calcTotalBobot(); });
          soalList.appendChild(div);
          calcTotalBobot();
        }

        if (existingData && existingData.soal_json && existingData.soal_json.length > 0) {
          existingData.soal_json.forEach(s => addSoalUI(s));
        } else {
          addSoalUI();
        }

        m.querySelector("#btn-tpl-add").onclick = () => addSoalUI();
        m.querySelector("#btn-tpl-batal").onclick = closeModal;

        m.querySelector("#btn-tpl-simpan").onclick = async () => {
          const nama = m.querySelector("#tpl-nama").value.trim();
          if (!nama) return toast("Nama Template wajib diisi!", "warning");
          if (calcTotalBobot() !== 100) return toast("Total bobot indikator wajib tepat 100%!", "warning");

          const soalArray = [];
          soalList.querySelectorAll(".flex.gap-2").forEach(row => {
            const asp = row.querySelector(".soal-aspek").value.trim();
            const ind = row.querySelector(".soal-indikator").value.trim();
            const bbt = parseFloat(row.querySelector(".soal-bobot").value) || 0;
            if (asp || ind) {
              soalArray.push({
                aspek: asp || "Umum",
                indikator: ind || asp,
                bobot: bbt,
                nilai_diberikan: 0
              });
            }
          });

          if (!soalArray.length) return toast("Tambahkan minimal 1 indikator soal KPI!", "warning");

          // Extract checked employees
          const checkedBoxes = m.querySelectorAll('input[name="tpl-karyawan-cb"]:checked');
          const checkedEmployees = Array.from(checkedBoxes).map(cb => cb.value);

          const payload = {
            nama_template: nama,
            soal_json: soalArray,
            karyawan_assigned: checkedEmployees
          };

          const btnSave = m.querySelector("#btn-tpl-simpan");
          btnSave.disabled = true;
          btnSave.textContent = "Menyimpan...";

          try {
            if (existingData && existingData.id) {
              await fsUpdate(COL.MASTER_SOAL_KPI, existingData.id, payload);
            } else {
              await fsAdd(COL.MASTER_SOAL_KPI, payload, genId("TPL-KPI"));
            }
            toast("Template Soal KPI & daftar karyawan berhasil disimpan!", "success");
            closeModal();
            loadTemplateKpi();
          } catch (err) {
            toast("Gagal menyimpan: " + err.message, "error");
            btnSave.disabled = false;
            btnSave.textContent = "💾 Simpan Template & Karyawan";
          }
        };
      }
    });
  }

  async function loadKpi360() {
    const wrap = panels.kpi360;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    const tasks = await fsGetAll(COL.TUGAS_KPI_360);
    const isHrd = session.role === "HRD";

    let htmlContent = isHrd ? `
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-600">Dokumen Fisik:</span>
            <button id="btn-print-batch-kpi" class="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs">
              🖨️ Cetak Form Fisik Semua (${tasks.length})
            </button>
          </div>
          <button id="btn-distribusi-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Distribusi Penilaian 360
          </button>
        </div>` : ``;

    if (!tasks.length) { wrap.innerHTML = htmlContent + emptyState("Belum ada penugasan"); }
    else {
      wrap.innerHTML = htmlContent + `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
                <th class="px-4 py-3 text-left">Periode</th><th class="px-4 py-3 text-left">Penilai</th><th class="px-4 py-3 text-left">Dinilai</th><th class="px-4 py-3 text-left">Batas Waktu</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Skor</th><th class="px-4 py-3 text-right">Aksi & Form Fisik</th>
              </tr></thead>
              <tbody>${tasks.map(t => `
                <tr class="border-t border-slate-50 hover:bg-slate-50 transition">
                  <td class="px-4 py-3 font-semibold">${escapeHtml(t.periode || "-")}</td>
                  <td class="px-4 py-3 font-medium">${escapeHtml(t.nama_penilai || "-")}</td>
                  <td class="px-4 py-3 font-bold text-slate-800">${escapeHtml(t.nama_dinilai || "-")}</td>
                  <td class="px-4 py-3 text-xs text-slate-500">${t.deadline ? fmtDateShort(t.deadline) : "-"}</td>
                  <td class="px-4 py-3">
                    ${badge(t.status || "PENDING", t.status === "DONE" ? "green" : "amber")}
                    ${t.diinput_oleh_hrd ? '<span class="block text-[10px] text-emerald-700 font-semibold mt-0.5">📄 Form Fisik (HRD)</span>' : ''}
                  </td>
                  <td class="px-4 py-3 font-semibold">${t.skor_akhir || "-"}</td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      ${isHrd ? `
                        <button data-input-manual="${t.id}" class="px-3 py-1.5 text-xs font-semibold ${t.status === 'DONE' ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs'} rounded-lg inline-flex items-center gap-1 transition">
                          ${t.status === 'DONE' ? '✏️ Edit Input' : '📝 Input Manual HRD'}
                        </button>
                      ` : ''}
                      <button data-print-fisik="${t.id}" class="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg inline-flex items-center gap-1 border border-slate-200 transition">🖨️ Form Fisik</button>
                    </div>
                  </td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }
    if (isHrd && wrap.querySelector("#btn-distribusi-kpi")) wrap.querySelector("#btn-distribusi-kpi").onclick = openDistribusiModal;
    if (isHrd && wrap.querySelector("#btn-print-batch-kpi")) wrap.querySelector("#btn-print-batch-kpi").onclick = () => printBatchFormKpiFisik(tasks);

    wrap.querySelectorAll("[data-input-manual]").forEach(btn => {
      btn.onclick = () => {
        const task = tasks.find(x => x.id === btn.dataset.inputManual);
        if (task) openManualInputModal(task);
      };
    });

    wrap.querySelectorAll("[data-print-fisik]").forEach(btn => {
      btn.onclick = () => printFormKpiFisik(tasks.find(x => x.id === btn.dataset.printFisik));
    });
  }

  function openManualInputModal(task) {
    const isDone = task.status === "DONE";
    const soalHtml = (task.soal_json || []).map((s, i) => `
       <div class="border-b border-slate-100 pb-4 mb-4 text-left">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${escapeHtml(s.aspek || "ASPEK")}</span>
            <span class="text-[10px] text-slate-400 font-medium">Bobot: ${s.bobot || 0}%</span>
          </div>
          <p class="text-xs font-semibold text-slate-800 mb-2">${escapeHtml(s.indikator)}</p>
          <div class="relative">
            <input type="number" data-idx="${i}" data-bobot="${s.bobot}" class="kpi-nilai-input w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-500 focus:ring-2 focus:ring-maroon-100 font-bold transition" placeholder="Skor dari Form Fisik (0-100)" value="${s.nilai_diberikan !== undefined && s.nilai_diberikan !== null ? s.nilai_diberikan : ''}" required min="0" max="100">
            <span class="absolute right-3 top-2 text-slate-400 font-medium text-xs">/ 100</span>
          </div>
       </div>
    `).join("");

    const initialScore = task.skor_akhir ? parseFloat(task.skor_akhir).toFixed(2) : "0.00";

    openModal({
      title: `${isDone ? '✏️ Edit Input Manual' : '📝 Input Manual'} Penilaian Fisik KPI`,
      size: "lg",
      bodyHtml: `
        <div class="text-left space-y-4">
          <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <span class="text-xl">📄</span>
            <div class="text-xs text-amber-900 leading-relaxed">
              <strong class="font-bold block text-amber-950 text-sm mb-0.5">Input Manual Penilaian Form Fisik (Kertas)</strong>
              HRD menginputkan skor dan ulasan kualitatif yang telah diisi penilai secara manual pada dokumen fisik.
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold">Karyawan Dinilai</span>
              <strong class="text-slate-800 font-bold text-sm">${escapeHtml(task.nama_dinilai)}</strong>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold">Penilai (Atasan/Rekan)</span>
              <strong class="text-slate-700 font-semibold">${escapeHtml(task.nama_penilai)}</strong>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold">Periode</span>
              <span class="text-slate-700 font-medium">${escapeHtml(task.periode || '-')}</span>
            </div>
            <div>
              <span class="text-slate-400 block text-[10px] uppercase font-bold">Batas Waktu</span>
              <span class="text-slate-700 font-medium">${task.deadline ? fmtDateShort(task.deadline) : '-'}</span>
            </div>
          </div>

          <form id="form-manual-kpi">
            <div class="mb-4">
              <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200">1. Skor Indikator Penilaian</h4>
              ${soalHtml}
            </div>

            <div class="mt-5 space-y-3">
              <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider pb-1 border-b border-slate-200">2. Evaluasi Kualitatif & Ulasan Penilai</h4>
              <div>
                <label class="block text-xs font-bold text-emerald-800 mb-1 uppercase tracking-wide">✓ Hal-hal yang Sudah Baik (Kelebihan / Prestasi Kerja)</label>
                <textarea id="manual-catatan-baik" rows="3" class="w-full px-3 py-2 text-xs border border-emerald-200 bg-emerald-50/20 rounded-lg outline-none focus:border-emerald-500 font-medium" placeholder="Tuliskan poin-poin kelebihan dari lembar fisik...">${escapeHtml(task.catatan_baik || '')}</textarea>
              </div>
              <div>
                <label class="block text-xs font-bold text-red-800 mb-1 uppercase tracking-wide">⚠ Hal-hal yang Harus Diperbaiki (Area Peningkatan)</label>
                <textarea id="manual-catatan-perbaikan" rows="3" class="w-full px-3 py-2 text-xs border border-red-200 bg-red-50/20 rounded-lg outline-none focus:border-red-500 font-medium" placeholder="Tuliskan area peningkatan dari lembar fisik...">${escapeHtml(task.catatan_perbaikan || '')}</textarea>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">💬 Catatan & Rekomendasi Tambahan Penilai</label>
                <textarea id="manual-catatan-penilai" rows="3" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-medium" placeholder="Catatan atau masukan umum penilai...">${escapeHtml(task.catatan_penilai || task.catatan_umum || '')}</textarea>
              </div>
            </div>
          </form>
        </div>
      `,
      footerHtml: `
        <div class="w-full flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3">
          <span class="text-xs font-bold text-slate-600">Total Skor Akhir (Dihitung Otomatis):</span>
          <span id="manual-kpi-live-score" class="text-xl font-black text-maroon-700">${initialScore}</span>
        </div>
        <div class="flex gap-2 justify-end w-full">
          <button id="btn-close-manual-modal" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition">Batal</button>
          <button id="btn-save-manual-kpi" class="bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1.5">
            💾 Simpan Penilaian Manual
          </button>
        </div>
      `,
      onMount: (m) => {
        const liveScore = m.querySelector("#manual-kpi-live-score");
        const calcScore = () => {
          let calcTotal = 0;
          m.querySelectorAll(".kpi-nilai-input").forEach(input => {
            const bbt = parseFloat(input.dataset.bobot) || 0;
            const val = parseFloat(input.value) || 0;
            calcTotal += val * (bbt / 100);
          });
          liveScore.textContent = calcTotal.toFixed(2);
        };

        m.querySelector("#form-manual-kpi").addEventListener("input", calcScore);
        m.querySelector("#btn-close-manual-modal").onclick = closeModal;

        m.querySelector("#btn-save-manual-kpi").onclick = async () => {
          const form = m.querySelector("#form-manual-kpi");
          if (!form.reportValidity()) return;

          let totalSkorBobot = 0;
          const answeredSoal = [...(task.soal_json || [])];
          const catatanBaik = m.querySelector("#manual-catatan-baik") ? m.querySelector("#manual-catatan-baik").value.trim() : "";
          const catatanPerbaikan = m.querySelector("#manual-catatan-perbaikan") ? m.querySelector("#manual-catatan-perbaikan").value.trim() : "";
          const catatanPenilai = m.querySelector("#manual-catatan-penilai") ? m.querySelector("#manual-catatan-penilai").value.trim() : "";

          m.querySelectorAll(".kpi-nilai-input").forEach(input => {
            const idx = parseInt(input.dataset.idx, 10);
            const nilai = parseFloat(input.value) || 0;
            const bobot = parseFloat(answeredSoal[idx].bobot) || 0;
            answeredSoal[idx].nilai_diberikan = nilai;
            totalSkorBobot += (nilai * (bobot / 100));
          });

          let finalScore = Math.round(totalSkorBobot * 100) / 100;
          let keputusan = finalScore >= 80 ? "Sangat Baik" : finalScore >= 60 ? "Baik" : "Kurang";

          const btn = m.querySelector("#btn-save-manual-kpi");
          btn.disabled = true; btn.textContent = "Menyimpan Hasil...";

          try {
            await fsUpdate(COL.TUGAS_KPI_360, task.id, {
              status: "DONE",
              skor_akhir: finalScore,
              soal_json: answeredSoal,
              catatan_baik: catatanBaik,
              catatan_perbaikan: catatanPerbaikan,
              catatan_penilai: catatanPenilai,
              diinput_oleh_hrd: true,
              metode_penilaian: "FORM_FISIK",
              tanggal_diselesaikan: new Date().toISOString()
            });

            await fsAdd(COL.LOG_PENILAIAN_KPI, {
              tanggal: new Date().toISOString(),
              nama_dinilai: task.nama_dinilai,
              penilai: task.nama_penilai + " (Input Manual HRD)",
              total_skor: finalScore,
              keputusan: keputusan,
              periode: task.periode,
              detail_json: answeredSoal,
              catatan_baik: catatanBaik,
              catatan_perbaikan: catatanPerbaikan,
              catatan_penilai: catatanPenilai,
              diinput_oleh_hrd: true,
              metode_penilaian: "FORM_FISIK"
            }, genId("KPI-LOG"));

            toast("Hasil penilaian fisik berhasil disimpan!", "success");
            closeModal();
            loadKpi360();
          } catch(e) {
            toast("Gagal menyimpan: " + e.message, "error");
            btn.disabled = false;
            btn.textContent = "💾 Simpan Penilaian Manual";
          }
        };
      }
    });
  }

  // =====================================================================
  // HELPER UNTUK GENERATE & MENCETAK DOKUMEN PENILAIAN FISIK KPI (HEMAT KERTAS)
  // =====================================================================
  async function getKaryawanMap() {
    const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
    const map = {};
    allKaryawan.forEach(k => {
      if (k.nama_karyawan) map[k.nama_karyawan] = k;
    });
    return map;
  }

  // FORMAT HALF A4 / A5 CARD (UNTUK MUAT 2 PENILAIAN DALAM 1 KERTAS A4)
  function generateFormKpiA5CardHtml(task, karyawanMap = {}, isArchiveCopy = false) {
    const dinilaiInfo = karyawanMap[task.nama_dinilai] || {};
    const penilaiInfo = karyawanMap[task.nama_penilai] || {};

    const nikDinilai = dinilaiInfo.nik_karyawan || dinilaiInfo.nik || "-";
    const jabatanDinilai = dinilaiInfo.jabatan || "-";
    const divisiDinilai = dinilaiInfo.divisi || "-";
    const cabangDinilai = dinilaiInfo.cabang || "Pusat";
    const statusDinilai = formatStatusKaryawan(dinilaiInfo.status_karyawan || "-");

    let tbody = "";
    const soalList = task.soal_json || [];
    soalList.forEach((item, idx) => {
      tbody += `
        <tr>
          <td style="border:1px solid #000; padding:2px 3px; text-align:center; font-weight:bold; font-size:8.5px;">${idx + 1}</td>
          <td style="border:1px solid #000; padding:2px 3px; font-weight:600; font-size:8.5px;">${escapeHtml(item.aspek || "-")}</td>
          <td style="border:1px solid #000; padding:2px 3px; font-size:8px;">${escapeHtml(item.indikator || "-")}</td>
          <td style="border:1px solid #000; padding:2px 3px; text-align:center; font-weight:bold; font-size:8.5px;">${item.bobot || 0}%</td>
          <td style="border:1px solid #000; padding:2px 3px; text-align:center; font-weight:bold; background:#fafafa;">
            <div style="min-height:16px; border:1px dashed #64748b; border-radius:2px; margin:0 auto; width:55px; line-height:16px; text-align:center; font-size:9.5px; color:#334155;">
              ${item.nilai_diberikan ? item.nilai_diberikan : '[ &nbsp; &nbsp; ]'}
            </div>
          </td>
          <td style="border:1px solid #000; padding:2px 3px; text-align:center;">
            <div style="min-height:16px; border:1px dashed #cbd5e1; border-radius:2px; margin:0 auto; width:55px;"></div>
          </td>
        </tr>
      `;
    });

    return `
      <div style="border:1px solid #000; padding:8px 10px; background:#fff; box-sizing:border-box; border-radius:4px; font-family:'Times New Roman', Times, serif; font-size:9px; line-height:1.15; color:#000; position:relative;">
        ${isArchiveCopy ? `<div style="position:absolute; top:8px; right:12px; font-size:8px; font-weight:bold; color:#7a1f2b; border:1px solid #7a1f2b; padding:1px 4px; border-radius:2px; background:#fff0f2;">[ LEMBAR ARSIP HRD ]</div>` : ''}
        
        <!-- KOP ISO COMPACT -->
        <div style="margin-bottom:4px;">
          ${isoDocHeaderTable({
            judul: "FORMULIR PENILAIAN KPI",
            noDok: "FM-HRD-KPI-01A5",
            terbitRevisi: "1/0",
            tglTerbit: fmtDateShort(new Date()),
            hal: "1 dari 1"
          })}
        </div>

        <!-- INFO KARYAWAN & PENILAI -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:4px; border:1px solid #000; font-size:8.5px;">
          <tr>
            <td width="16%" style="border:1px solid #000; padding:2px 4px; font-weight:bold; background:#f8fafc;">Yang Dinilai</td>
            <td width="34%" style="border:1px solid #000; padding:2px 4px; font-weight:bold;">${escapeHtml(task.nama_dinilai)} (${escapeHtml(nikDinilai)})</td>
            <td width="16%" style="border:1px solid #000; padding:2px 4px; font-weight:bold; background:#f8fafc;">Penilai</td>
            <td width="34%" style="border:1px solid #000; padding:2px 4px; font-weight:bold;">${escapeHtml(task.nama_penilai)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:2px 4px; font-weight:bold; background:#f8fafc;">Jabatan/Div</td>
            <td style="border:1px solid #000; padding:2px 4px;">${escapeHtml(jabatanDinilai)} / ${escapeHtml(divisiDinilai)} (${escapeHtml(cabangDinilai)})</td>
            <td style="border:1px solid #000; padding:2px 4px; font-weight:bold; background:#f8fafc;">Periode & Batas</td>
            <td style="border:1px solid #000; padding:2px 4px;"><strong>${escapeHtml(task.periode || "-")}</strong> | Batas: ${task.deadline ? fmtDateShort(task.deadline) : "-"}</td>
          </tr>
        </table>

        <!-- TABEL INDIKATOR KPI -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:4px; border:1px solid #000;">
          <thead>
            <tr style="background:#e2e8f0; font-weight:bold; text-align:center; font-size:8.5px;">
              <th width="4%" style="border:1px solid #000; padding:3px 2px;">No</th>
              <th width="24%" style="border:1px solid #000; padding:3px 3px; text-align:left;">Aspek</th>
              <th width="42%" style="border:1px solid #000; padding:3px 3px; text-align:left;">Indikator Kinerja Utama</th>
              <th width="8%" style="border:1px solid #000; padding:3px 2px;">Bobot</th>
              <th width="11%" style="border:1px solid #000; padding:3px 2px;">Nilai (0-100)</th>
              <th width="11%" style="border:1px solid #000; padding:3px 2px;">Skor Terbobot</th>
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
          <tfoot>
            <tr style="background:#f8fafc; font-weight:bold; font-size:8.5px;">
              <td colspan="3" style="border:1px solid #000; padding:2px 4px; text-align:right;">TOTAL SKOR AKHIR:</td>
              <td style="border:1px solid #000; padding:2px 2px; text-align:center;">100%</td>
              <td colspan="2" style="border:1px solid #000; padding:2px 2px; text-align:center;">
                <div style="min-height:16px; border:1px solid #000; border-radius:2px; margin:0 auto; width:70px; background:#fff;"></div>
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- CATATAN & EVALUASI DETIL PENILAI -->
        <div style="border:1px solid #000; padding:4px 6px; margin-bottom:5px; font-size:8.5px; background:#fff;">
          <div style="font-weight:bold; font-size:9px; border-bottom:1px solid #000; padding-bottom:2px; margin-bottom:3px; color:#000;">
            📝 CATATAN & EVALUASI KUALITATIF PENILAI:
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-bottom:3px;">
            <div style="border:1px solid #cbd5e1; padding:3px 5px; background:#f8fafc; border-radius:2px;">
              <strong style="color:#166534; font-size:8.5px;">✓ Hal-hal yang Sudah Baik (Kelebihan/Prestasi):</strong>
              <div style="min-height:38px; font-size:8.5px; line-height:1.25; margin-top:2px; color:#1e293b;">
                ${escapeHtml(task.catatan_baik || "") || `<div style="border-bottom:1px dotted #94a3b8; min-height:11px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:11px; margin-top:2px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:11px; margin-top:2px;"></div>`}
              </div>
            </div>
            <div style="border:1px solid #cbd5e1; padding:3px 5px; background:#f8fafc; border-radius:2px;">
              <strong style="color:#991b1b; font-size:8.5px;">⚠ Hal-hal yang Harus Diperbaiki (Area Peningkatan):</strong>
              <div style="min-height:38px; font-size:8.5px; line-height:1.25; margin-top:2px; color:#1e293b;">
                ${escapeHtml(task.catatan_perbaikan || "") || `<div style="border-bottom:1px dotted #94a3b8; min-height:11px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:11px; margin-top:2px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:11px; margin-top:2px;"></div>`}
              </div>
            </div>
          </div>
          <div style="border:1px solid #cbd5e1; padding:3px 5px; background:#fafafa; border-radius:2px;">
            <strong style="color:#334155; font-size:8.5px;">💬 Catatan & Rekomendasi Tambahan Penilai:</strong>
            <div style="min-height:26px; font-size:8.5px; line-height:1.25; margin-top:2px; color:#1e293b;">
              ${escapeHtml(task.catatan_penilai || task.catatan_umum || "") || `<div style="border-bottom:1px dotted #94a3b8; min-height:11px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:11px; margin-top:2px;"></div>`}
            </div>
          </div>
        </div>

        <!-- KATEGORI & TANDA TANGAN GRID COMPACT -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:8px; margin-top:4px;">
          <div style="width:46%;">
            <div style="border:1px solid #000; background:#f8fafc; padding:3px; font-size:8px; line-height:1.2;">
              <strong>Kategori Performance:</strong><br>
              [ ] Sangat Baik (90-100) &nbsp; [ ] Baik (80-89)<br>
              [ ] Cukup (70-79) &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; [ ] Kurang (&lt;70)
            </div>
          </div>
          <div style="width:52%;">
            <table style="width:100%; text-align:center; font-size:8.5px;">
              <tr>
                <td width="33%">Karyawan,</td>
                <td width="33%">Penilai,</td>
                <td width="34%">HRD,</td>
              </tr>
              <tr>
                <td height="22" style="vertical-align:bottom; font-size:7px; color:#64748b;">(TTD)</td>
                <td height="22" style="vertical-align:bottom; font-size:7px; color:#64748b;">(TTD)</td>
                <td height="22" style="vertical-align:bottom; font-size:7px; color:#64748b;">(TTD)</td>
              </tr>
              <tr>
                <td>( <strong>${escapeHtml(task.nama_dinilai)}</strong> )</td>
                <td>( <strong>${escapeHtml(task.nama_penilai)}</strong> )</td>
                <td>( <strong>Andela</strong> )</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // GENERATE BATCH 2-UP PER A4 PAGE LANDSCAPE (SETENGAH A4 / A5 SIDE-BY-SIDE DENGAN GARIS POTONG VERTIKAL)
  function generate2UpA4Html(tasks, karyawanMap = {}) {
    if (!tasks || !tasks.length) return "";
    let html = "";
    
    for (let i = 0; i < tasks.length; i += 2) {
      const taskLeft = tasks[i];
      const taskRight = tasks[i + 1];

      const leftCard = generateFormKpiA5CardHtml(taskLeft, karyawanMap, false);
      let rightCard = "";

      if (taskRight) {
        rightCard = generateFormKpiA5CardHtml(taskRight, karyawanMap, false);
      } else {
        // Jika ganjil, salinan kanan adalah lembar arsip HRD
        rightCard = generateFormKpiA5CardHtml(taskLeft, karyawanMap, true);
      }

      html += `
        <div class="a4-2up-page-landscape" style="width:100%; max-width:1050px; margin:0 auto 20px auto; box-sizing:border-box; display:flex; flex-direction:row; justify-content:space-between; align-items:stretch; page-break-after:always; page-break-inside:avoid; min-height:185mm; padding:3mm 0;">
          <!-- SISI KIRI (FORM 1) -->
          <div style="width:48.5%; display:flex; flex-direction:column; justify-content:space-between;">
            ${leftCard}
          </div>

          <!-- GARIS POTONG VERTIKAL A5 -->
          <div style="width:3%; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative;">
            <div style="border-left:1.5px dashed #475569; height:100%; margin:0 auto;"></div>
            <span style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-90deg); white-space:nowrap; background:#ffffff; padding:2px 8px; font-size:8px; color:#334155; font-style:italic; font-weight:bold; border:1px solid #cbd5e1; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
              ✂ POTONG DI SINI (UKURAN A5)
            </span>
          </div>

          <!-- SISI KANAN (FORM 2 / ARSIP) -->
          <div style="width:48.5%; display:flex; flex-direction:column; justify-content:space-between;">
            ${rightCard}
          </div>
        </div>
      `;
    }
    return html;
  }

  // FORMAT INDIVIDUAL FULL A4
  function generateFormKpiFisikHtml(task, karyawanMap = {}) {
    const dinilaiInfo = karyawanMap[task.nama_dinilai] || {};
    const penilaiInfo = karyawanMap[task.nama_penilai] || {};

    const nikDinilai = dinilaiInfo.nik_karyawan || dinilaiInfo.nik || "-";
    const jabatanDinilai = dinilaiInfo.jabatan || "-";
    const divisiDinilai = dinilaiInfo.divisi || "-";
    const cabangDinilai = dinilaiInfo.cabang || "Pusat";
    const statusDinilai = formatStatusKaryawan(dinilaiInfo.status_karyawan || "-");
    const jabatanPenilai = penilaiInfo.jabatan || "Atasan Direct / Assessor";

    let tbody = "";
    const soalList = task.soal_json || [];
    soalList.forEach((item, idx) => {
      tbody += `
        <tr>
          <td style="border:1px solid #000; padding:3px 4px; text-align:center; font-weight:bold; font-size:10px;">${idx + 1}</td>
          <td style="border:1px solid #000; padding:3px 4px; font-weight:600; font-size:10px;">${escapeHtml(item.aspek || "-")}</td>
          <td style="border:1px solid #000; padding:3px 4px; font-size:9.5px;">${escapeHtml(item.indikator || "-")}</td>
          <td style="border:1px solid #000; padding:3px 4px; text-align:center; font-weight:bold; font-size:10px;">${item.bobot || 0}%</td>
          <td style="border:1px solid #000; padding:3px 4px; text-align:center; font-weight:bold; background:#fafafa;">
            <div style="min-height:20px; border:1px dashed #64748b; border-radius:3px; margin:1px auto; width:65px; line-height:20px; text-align:center; font-size:11px; color:#334155;">
              ${item.nilai_diberikan ? item.nilai_diberikan : '[ &nbsp; &nbsp; &nbsp; ]'}
            </div>
          </td>
          <td style="border:1px solid #000; padding:3px 4px; text-align:center;">
            <div style="min-height:20px; border:1px dashed #cbd5e1; border-radius:3px; margin:1px auto; width:65px;"></div>
          </td>
          <td style="border:1px solid #000; padding:3px 4px; font-size:9px; color:#334155;">
            <div style="min-height:20px;"></div>
          </td>
        </tr>
      `;
    });

    return `
      <div class="kpi-form-fisik-page" style="width:100%; max-width:750px; margin:0 auto 15px auto; padding:0; font-family:'Times New Roman', Times, serif; font-size:10px; line-height:1.2; color:#000; background:#ffffff; page-break-after:always; page-break-inside:avoid;">
        <!-- KOP ISO COMPACT -->
        <div style="margin-bottom:6px;">
          ${isoDocHeaderTable({
            judul: "FORMULIR PENILAIAN KINERJA KARYAWAN (KPI)",
            noDok: "FM-HRD-KPI-01",
            terbitRevisi: "1/0",
            tglTerbit: fmtDateShort(new Date()),
            hal: "1 dari 1"
          })}
        </div>

        <!-- INFORMASI KARYAWAN & PENILAI COMPACT -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px; border:1px solid #000; font-size:10px;">
          <tr>
            <td width="18%" style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Nama Karyawan</td>
            <td width="32%" style="border:1px solid #000; padding:3px 6px; font-weight:bold;">${escapeHtml(task.nama_dinilai)}</td>
            <td width="18%" style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Penilai (Assessor)</td>
            <td width="32%" style="border:1px solid #000; padding:3px 6px; font-weight:bold;">${escapeHtml(task.nama_penilai)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">NIK / Status</td>
            <td style="border:1px solid #000; padding:3px 6px;">${escapeHtml(nikDinilai)} / ${escapeHtml(statusDinilai)}</td>
            <td style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Jabatan Penilai</td>
            <td style="border:1px solid #000; padding:3px 6px;">${escapeHtml(jabatanPenilai)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Jabatan / Divisi</td>
            <td style="border:1px solid #000; padding:3px 6px;">${escapeHtml(jabatanDinilai)} / ${escapeHtml(divisiDinilai)} (${escapeHtml(cabangDinilai)})</td>
            <td style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Periode & Batas</td>
            <td style="border:1px solid #000; padding:3px 6px;"><strong>${escapeHtml(task.periode || "-")}</strong> | Batas: ${task.deadline ? fmtDateShort(task.deadline) : "-"}</td>
          </tr>
        </table>

        <!-- PETUNJUK COMPACT 1 LINE -->
        <div style="border:1px solid #000; background:#f1f5f9; padding:3px 8px; margin-bottom:6px; font-size:9px; line-height:1.2;">
          <strong>PETUNJUK:</strong> Berikan nilai angka <strong>0 - 100</strong> pada kolom <em>Nilai Fisik</em>. Hitung Skor = (Nilai x Bobot) / 100. Tulis catatan jika ada.
        </div>

        <!-- TABEL INDIKATOR KPI -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px; border:1px solid #000;">
          <thead>
            <tr style="background:#e2e8f0; font-weight:bold; text-align:center; font-size:9.5px;">
              <th width="4%" style="border:1px solid #000; padding:4px 2px;">No</th>
              <th width="22%" style="border:1px solid #000; padding:4px 4px; text-align:left;">Aspek KPI</th>
              <th width="36%" style="border:1px solid #000; padding:4px 4px; text-align:left;">Indikator Kinerja Utama</th>
              <th width="8%" style="border:1px solid #000; padding:4px 2px;">Bobot</th>
              <th width="11%" style="border:1px solid #000; padding:4px 2px;">Nilai Fisik<br>(0-100)</th>
              <th width="9%" style="border:1px solid #000; padding:4px 2px;">Skor Terbobot</th>
              <th width="10%" style="border:1px solid #000; padding:4px 2px;">Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
          <tfoot>
            <tr style="background:#f8fafc; font-weight:bold; font-size:9.5px;">
              <td colspan="3" style="border:1px solid #000; padding:4px 6px; text-align:right;">TOTAL BOBOT & SKOR AKHIR:</td>
              <td style="border:1px solid #000; padding:4px 2px; text-align:center;">100%</td>
              <td colspan="2" style="border:1px solid #000; padding:4px 2px; text-align:center;">
                <div style="min-height:20px; border:1px solid #000; border-radius:3px; margin:1px auto; width:80px; background:#fff;"></div>
              </td>
              <td style="border:1px solid #000; padding:4px 2px;"></td>
            </tr>
          </tfoot>
        </table>

        <!-- CATATAN & EVALUASI PENILAI COMPACT & LENGKAP (2-KOLOM UNTUK 1 Halaman) -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px; border:1px solid #000; font-size:9.5px;">
          <tr style="background:#f1f5f9; font-weight:bold;">
            <td colspan="2" style="border:1px solid #000; padding:4px 6px; color:#000; font-size:9.5px;">
              📝 Ulasan & Catatan Evaluasi Penilai (Kualitatif):
            </td>
          </tr>
          <tr>
            <td width="50%" style="border:1px solid #000; padding:5px; background:#fff; vertical-align:top;">
              <strong style="color:#166534; font-size:9.5px;">1. Hal-hal yang Sudah Baik (Kelebihan / Prestasi):</strong>
              <div style="min-height:38px; font-size:9px; line-height:1.3; color:#1e293b; margin-top:2px;">
                ${escapeHtml(task.catatan_baik || "") || `<div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div>`}
              </div>
            </td>
            <td width="50%" style="border:1px solid #000; padding:5px; background:#fff; vertical-align:top;">
              <strong style="color:#991b1b; font-size:9.5px;">2. Hal-hal yang Harus Diperbaiki (Area Peningkatan):</strong>
              <div style="min-height:38px; font-size:9px; line-height:1.3; color:#1e293b; margin-top:2px;">
                ${escapeHtml(task.catatan_perbaikan || "") || `<div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div>`}
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="border:1px solid #000; padding:5px; background:#fff;">
              <strong style="color:#334155; font-size:9.5px;">3. Catatan & Rekomendasi Tambahan Penilai:</strong>
              <div style="min-height:26px; font-size:9px; line-height:1.3; color:#1e293b; margin-top:2px;">
                ${escapeHtml(task.catatan_penilai || task.catatan_umum || "") || `<div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div><div style="border-bottom:1px dotted #94a3b8; min-height:12px; margin-top:2px;"></div>`}
              </div>
            </td>
          </tr>
        </table>

        <!-- KATEGORI SKOR PERFORMANCE HORIZONTAL -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:8px; border:1px solid #000; font-size:9px;">
          <tr style="background:#f1f5f9; font-weight:bold; text-align:center;">
            <td width="25%" style="border:1px solid #000; padding:3px 4px;">[ &nbsp; ] <strong>Sangat Baik</strong> (90 - 100)</td>
            <td width="25%" style="border:1px solid #000; padding:3px 4px;">[ &nbsp; ] <strong>Baik</strong> (80 - 89)</td>
            <td width="25%" style="border:1px solid #000; padding:3px 4px;">[ &nbsp; ] <strong>Cukup</strong> (70 - 79)</td>
            <td width="25%" style="border:1px solid #000; padding:3px 4px;">[ &nbsp; ] <strong>Kurang</strong> (&lt; 70)</td>
          </tr>
        </table>

        <!-- TANDA TANGAN 3 PIHAK COMPACT -->
        <table style="width:100%; text-align:center; margin-top:8px; page-break-inside:avoid; font-size:10px;">
          <tr>
            <td width="33%">Karyawan (Yang Dinilai),</td>
            <td width="33%">Penilai (Assessor),</td>
            <td width="34%">Mengetahui (HRD / Manajemen),</td>
          </tr>
          <tr>
            <td height="35" style="vertical-align:bottom; font-size:8.5px; color:#64748b;">(Tanda Tangan & Tanggal)</td>
            <td height="35" style="vertical-align:bottom; font-size:8.5px; color:#64748b;">(Tanda Tangan & Tanggal)</td>
            <td height="35" style="vertical-align:bottom; font-size:8.5px; color:#64748b;">(Tanda Tangan & Stempel)</td>
          </tr>
          <tr>
            <td>( <strong>${escapeHtml(task.nama_dinilai)}</strong> )</td>
            <td>( <strong>${escapeHtml(task.nama_penilai)}</strong> )</td>
            <td>( <strong>HRD CV ANDELA JAYA</strong> )</td>
          </tr>
        </table>
      </div>
    `;
  }

  // FORMAT MATRIKS KOLEKTIF - HEMAT KERTAS MAKSIMAL (GABUNG BANYAK KARYAWAN DALAM 1 LEMBAR)
  function generateFormKpiMatriksKolektifHtml(tasks, karyawanMap = {}) {
    if (!tasks || !tasks.length) return "";
    const samplePenilai = tasks[0].nama_penilai || "Assessor";
    const samplePeriode = tasks[0].periode || "-";
    const sampleDeadline = tasks[0].deadline ? fmtDateShort(tasks[0].deadline) : "-";

    const soalList = tasks[0].soal_json || [];

    let thKaryawan = "";
    tasks.forEach((t, idx) => {
      const kInfo = karyawanMap[t.nama_dinilai] || {};
      const jabatan = kInfo.jabatan || "-";
      thKaryawan += `
        <th style="border:1px solid #000; padding:4px 3px; text-align:center; width:${Math.floor(50 / tasks.length)}%;">
          <div style="font-size:10px; font-weight:bold; color:#000;">${idx + 1}. ${escapeHtml(t.nama_dinilai)}</div>
          <div style="font-size:8.5px; font-weight:normal; color:#475569;">${escapeHtml(jabatan)}</div>
        </th>
      `;
    });

    let tbody = "";
    soalList.forEach((item, sIdx) => {
      let tdScores = "";
      tasks.forEach(t => {
        const itemVal = (t.soal_json && t.soal_json[sIdx]) ? t.soal_json[sIdx].nilai_diberikan : "";
        tdScores += `
          <td style="border:1px solid #000; padding:3px 2px; text-align:center; background:#fafafa;">
            <div style="min-height:18px; border:1px dashed #94a3b8; border-radius:3px; margin:0 auto; width:90%; line-height:18px; font-size:10px; font-weight:bold;">
              ${itemVal ? itemVal : '[ &nbsp; ]'}
            </div>
          </td>
        `;
      });

      tbody += `
        <tr>
          <td style="border:1px solid #000; padding:3px 4px; text-align:center; font-weight:bold; font-size:9.5px;">${sIdx + 1}</td>
          <td style="border:1px solid #000; padding:3px 4px; font-size:9.5px; font-weight:600;">${escapeHtml(item.aspek || "-")}</td>
          <td style="border:1px solid #000; padding:3px 4px; font-size:9px;">${escapeHtml(item.indikator || "-")}</td>
          <td style="border:1px solid #000; padding:3px 4px; text-align:center; font-weight:bold; font-size:9.5px;">${item.bobot || 0}%</td>
          ${tdScores}
        </tr>
      `;
    });

    let tdTotalFoot = "";
    tasks.forEach(() => {
      tdTotalFoot += `
        <td style="border:1px solid #000; padding:4px 2px; text-align:center;">
          <div style="min-height:22px; border:1px solid #000; border-radius:3px; margin:0 auto; width:90%; background:#fff;"></div>
        </td>
      `;
    });

    return `
      <div class="kpi-form-fisik-page" style="width:100%; max-width:800px; margin:0 auto 20px auto; padding:0; font-family:'Times New Roman', Times, serif; font-size:10px; line-height:1.2; color:#000; background:#ffffff; page-break-after:always; page-break-inside:avoid;">
        <!-- KOP ISO MATRIKS -->
        <div style="margin-bottom:6px;">
          ${isoDocHeaderTable({
            judul: "MATRIKS PENILAIAN KPI KOLEKTIF (HEMAT KERTAS)",
            noDok: "FM-HRD-KPI-01M",
            terbitRevisi: "1/0",
            tglTerbit: fmtDateShort(new Date()),
            hal: "1 dari 1"
          })}
        </div>

        <!-- HEADER PENILAI & PERIODE -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px; border:1px solid #000; font-size:10px;">
          <tr>
            <td width="15%" style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Nama Penilai</td>
            <td width="35%" style="border:1px solid #000; padding:3px 6px; font-weight:bold;">${escapeHtml(samplePenilai)}</td>
            <td width="18%" style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Periode & Batas</td>
            <td width="32%" style="border:1px solid #000; padding:3px 6px;"><strong>${escapeHtml(samplePeriode)}</strong> | Batas: ${sampleDeadline}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Jumlah Dinilai</td>
            <td style="border:1px solid #000; padding:3px 6px;"><strong>${tasks.length} Karyawan</strong> dalam 1 Lembar Dokumen</td>
            <td style="border:1px solid #000; padding:3px 6px; font-weight:bold; background:#f8fafc;">Metode Pengisian</td>
            <td style="border:1px solid #000; padding:3px 6px;">Isi angka skor (0-100) pada kolom masing-masing karyawan</td>
          </tr>
        </table>

        <!-- TABEL MATRIKS UNTUK SELURUH KARYAWAN -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:8px; border:1px solid #000;">
          <thead>
            <tr style="background:#e2e8f0; font-weight:bold;">
              <th width="3%" style="border:1px solid #000; padding:4px 2px; text-align:center;">No</th>
              <th width="18%" style="border:1px solid #000; padding:4px 4px; text-align:left;">Aspek KPI</th>
              <th width="25%" style="border:1px solid #000; padding:4px 4px; text-align:left;">Indikator Utama</th>
              <th width="6%" style="border:1px solid #000; padding:4px 2px; text-align:center;">Bobot</th>
              ${thKaryawan}
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
          <tfoot>
            <tr style="background:#f8fafc; font-weight:bold; font-size:9.5px;">
              <td colspan="3" style="border:1px solid #000; padding:4px 6px; text-align:right;">SKOR AKHIR TERBOBOT:</td>
              <td style="border:1px solid #000; padding:4px 2px; text-align:center;">100%</td>
              ${tdTotalFoot}
            </tr>
          </tfoot>
        </table>

        <!-- KATEGORI SKOR PERFORMANCE -->
        <div style="border:1px solid #000; background:#f8fafc; padding:4px 8px; margin-bottom:10px; font-size:8.5px; text-align:center;">
          <strong>Standar Skor:</strong> Sangat Baik (90-100) | Baik (80-89) | Cukup (70-79) | Kurang (&lt;70)
        </div>

        <!-- TANDA TANGAN PENILAI & HRD -->
        <table style="width:100%; text-align:center; margin-top:10px; page-break-inside:avoid; font-size:10px;">
          <tr>
            <td width="50%">Penilai (Assessor),</td>
            <td width="50%">Mengetahui (HRD / Manajemen),</td>
          </tr>
          <tr>
            <td height="40" style="vertical-align:bottom; font-size:8.5px; color:#64748b;">(Tanda Tangan & Tanggal)</td>
            <td height="40" style="vertical-align:bottom; font-size:8.5px; color:#64748b;">(Tanda Tangan & Stempel)</td>
          </tr>
          <tr>
            <td>( <strong>${escapeHtml(samplePenilai)}</strong> )</td>
            <td>( <strong>HRD CV ANDELA JAYA</strong> )</td>
          </tr>
        </table>
      </div>
    `;
  }

  function openPrintOrPdfModal({ title, tasks = [], karyawanMap = {}, filename }) {
    let currentMode = "HALF_A4"; // DEFAULT: 2 FORM PER LEMBAR A4 (HALF A4 / A5)
    let currentTasks = [...tasks];

    // Daftar semua nama karyawan dari master karyawan untuk opsi pairing Karyawan Ke-2
    const allKaryawanNames = Object.keys(karyawanMap).filter(k => k && k !== "undefined");

    function renderActiveContent() {
      if (currentMode === "HALF_A4") {
        return generate2UpA4Html(currentTasks, karyawanMap);
      } else if (currentMode === "MATRIKS" && currentTasks.length > 0) {
        return generateFormKpiMatriksKolektifHtml(currentTasks, karyawanMap);
      }
      return currentTasks.map(t => generateFormKpiFisikHtml(t, karyawanMap)).join("\n");
    }

    let initialHtml = renderActiveContent();

    // Buat dropdown pilihan karyawan ke-2 jika hanya ada 1 task awal
    let pairingSelectorHtml = "";
    if (tasks.length === 1 && allKaryawanNames.length > 0) {
      const sampleTask = tasks[0];
      const optKaryawanBawah = allKaryawanNames
        .filter(n => n !== sampleTask.nama_dinilai)
        .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)} (${escapeHtml(karyawanMap[n]?.jabatan || "Karyawan")})</option>`)
        .join("");

      pairingSelectorHtml = `
        <div id="pairing-control-box" class="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="font-bold text-amber-900 flex items-center gap-1">✂️ Pasangkan 2 Karyawan (Kiri & Kanan) dalam 1 Lembar A4 Landscape:</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-slate-600 font-medium">Sisi Kanan (Karyawan 2):</span>
            <select id="select-karyawan-2" class="px-2.5 py-1 text-xs rounded-lg border border-amber-300 bg-white font-semibold text-slate-800 outline-none cursor-pointer focus:ring-2 focus:ring-amber-500">
              <option value="__ARSIP__">-- (Lembar Salinan Arsip HRD) --</option>
              ${optKaryawanBawah}
            </select>
          </div>
        </div>
      `;
    }

    openModal({
      title,
      size: "xl",
      bodyHtml: `
        <div class="space-y-3">
          <div class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div class="flex items-center gap-1.5 font-medium">
              <span>🍃 <strong>Format Landscape Hemat Kertas:</strong> 1 Lembar A4 Landscape Memuat 2 Form Penilaian KPI Side-by-Side</span>
            </div>
            <div class="flex items-center bg-white border border-emerald-300 rounded-lg p-0.5 shadow-2xs">
              <button id="toggle-fmt-half" class="px-3 py-1.5 text-[11px] font-bold rounded-md bg-emerald-700 text-white transition shadow-2xs">
                ✂️ 2 Karyawan Side-by-Side (A4 Landscape)
              </button>
              <button id="toggle-fmt-individual" class="px-3 py-1.5 text-[11px] font-bold rounded-md text-emerald-800 hover:bg-emerald-100 transition">
                📄 1 Karyawan Per A4 Portrait
              </button>
              ${tasks.length > 1 ? `
              <button id="toggle-fmt-matriks" class="px-3 py-1.5 text-[11px] font-bold rounded-md text-emerald-800 hover:bg-emerald-100 transition">
                📊 Matriks Kolektif (${tasks.length} Karyawan)
              </button>
              ` : ''}
            </div>
          </div>

          ${pairingSelectorHtml}

          <div class="border rounded-xl p-4 bg-slate-50 max-h-[60vh] overflow-y-auto shadow-inner border-slate-200">
            <div id="kpi-print-preview-container">${initialHtml}</div>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full">
          <button id="btn-close-print-preview" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition">Tutup</button>
          <div class="flex items-center gap-2">
            <button id="btn-do-print-window" class="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 transition shadow flex items-center gap-1.5">🖨️ Cetak Langsung (Print)</button>
            <button id="btn-do-download-pdf" class="px-4 py-2 bg-maroon-700 text-white rounded-lg text-xs font-bold hover:bg-maroon-800 transition shadow flex items-center gap-1.5">📥 Download PDF</button>
          </div>
        </div>
      `,
      onMount: (m) => {
        m.querySelector("#btn-close-print-preview").onclick = closeModal;

        const container = m.querySelector("#kpi-print-preview-container");
        const btnHalf = m.querySelector("#toggle-fmt-half");
        const btnInd = m.querySelector("#toggle-fmt-individual");
        const btnMat = m.querySelector("#toggle-fmt-matriks");
        const selectKaryawan2 = m.querySelector("#select-karyawan-2");
        const pairingBox = m.querySelector("#pairing-control-box");

        function updateBtnStyles() {
          const activeClass = "px-3 py-1.5 text-[11px] font-bold rounded-md bg-emerald-700 text-white transition shadow-2xs";
          const inactiveClass = "px-3 py-1.5 text-[11px] font-bold rounded-md text-emerald-800 hover:bg-emerald-100 transition";

          if (btnHalf) btnHalf.className = currentMode === "HALF_A4" ? activeClass : inactiveClass;
          if (btnInd) btnInd.className = currentMode === "INDIVIDUAL" ? activeClass : inactiveClass;
          if (btnMat) btnMat.className = currentMode === "MATRIKS" ? activeClass : inactiveClass;

          if (pairingBox) {
            pairingBox.style.display = currentMode === "HALF_A4" ? "flex" : "none";
          }

          container.innerHTML = renderActiveContent();
        }

        if (selectKaryawan2) {
          selectKaryawan2.onchange = (e) => {
            const selectedVal = e.target.value;
            if (selectedVal === "__ARSIP__") {
              currentTasks = [tasks[0]];
            } else {
              const secondTask = {
                ...tasks[0],
                nama_dinilai: selectedVal
              };
              currentTasks = [tasks[0], secondTask];
            }
            container.innerHTML = renderActiveContent();
          };
        }

        if (btnHalf) btnHalf.onclick = () => { currentMode = "HALF_A4"; updateBtnStyles(); };
        if (btnInd) btnInd.onclick = () => { currentMode = "INDIVIDUAL"; updateBtnStyles(); };
        if (btnMat) btnMat.onclick = () => { currentMode = "MATRIKS"; updateBtnStyles(); };

        m.querySelector("#btn-do-download-pdf").onclick = async () => {
          const btn = m.querySelector("#btn-do-download-pdf");
          btn.disabled = true; btn.textContent = "Mengunduh PDF...";
          try {
            const { downloadHtmlAsPdf } = await import("../utils.js");
            const finalContent = renderActiveContent();
            const isLandscape = currentMode === "HALF_A4";
            await downloadHtmlAsPdf(finalContent, filename, isLandscape ? "landscape" : "portrait");
            toast("PDF dokumen fisik KPI berhasil diunduh!", "success");
          } catch (e) {
            toast("Gagal mengunduh PDF: " + e.message, "error");
          } finally {
            btn.disabled = false; btn.textContent = "📥 Download PDF";
          }
        };

        m.querySelector("#btn-do-print-window").onclick = () => {
          const printWin = window.open("", "_blank");
          if (!printWin) return toast("Izinkan popup browser untuk mencetak langsung.", "warning");
          const finalContent = renderActiveContent();
          const isLandscape = currentMode === "HALF_A4";
          const pageStyle = isLandscape ? "@page { size: A4 landscape; margin: 4mm 6mm 4mm 6mm; }" : "@page { size: A4 portrait; margin: 6mm 8mm 6mm 8mm; }";

          printWin.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>${escapeHtml(title)}</title>
                <style>
                  ${pageStyle}
                  body { font-family: 'Times New Roman', Times, serif; margin: 0; padding: 0; background: #fff; color: #000; font-size: 9px; }
                  .a4-2up-page-landscape { page-break-after: always; page-break-inside: avoid; }
                  .a4-2up-page-landscape:last-child { page-break-after: auto; }
                  .kpi-form-fisik-page { page-break-after: always; page-break-inside: avoid; }
                  .kpi-form-fisik-page:last-child { page-break-after: auto; }
                  table { border-collapse: collapse; width: 100%; }
                  @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  }
                </style>
              </head>
              <body>
                ${finalContent}
                <script>
                  window.onload = function() {
                    window.focus();
                    window.print();
                  };
                </script>
              </body>
            </html>
          `);
          printWin.document.close();
        };
      }
    });
  }

  async function printFormKpiFisik(task) {
    if (!task) return toast("Data tugas KPI tidak ditemukan", "error");
    toast("Menyiapkan dokumen fisik KPI...", "info");
    const karyawanMap = await getKaryawanMap();

    openPrintOrPdfModal({
      title: `Form Fisik KPI — ${escapeHtml(task.nama_dinilai)} (${escapeHtml(task.periode || "")})`,
      tasks: [task],
      karyawanMap,
      filename: `Form_Fisik_KPI_${escapeHtml(task.nama_dinilai).replace(/\s+/g, "_")}_${escapeHtml(task.periode || "").replace(/\s+/g, "_")}.pdf`
    });
  }

  async function printBatchFormKpiFisik(tasks) {
    if (!tasks || !tasks.length) return toast("Tidak ada tugas untuk dicetak", "warning");
    toast("Menyiapkan dokumen fisik KPI...", "info");
    const karyawanMap = await getKaryawanMap();

    const samplePeriode = tasks[0]?.periode || "360";
    const samplePenilai = tasks[0]?.nama_penilai || "Assessor";

    openPrintOrPdfModal({
      title: `Dokumen Fisik KPI Batch (${tasks.length} Karyawan) — Penilai: ${escapeHtml(samplePenilai)}`,
      tasks,
      karyawanMap,
      filename: `Form_Fisik_KPI_Batch_${escapeHtml(samplePenilai).replace(/\s+/g, "_")}_${escapeHtml(samplePeriode).replace(/\s+/g, "_")}.pdf`
    });
  }

  // =====================================================================
  // MODAL DISTRIBUSI PINTAR: IMPLEMENTASI FITUR SEARCH & LIST CHECKBOX
  // =====================================================================
  async function openDistribusiModal() {
    const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
    // PERBAIKAN: Pastikan kita menyaring dan hanya mengambil data yang benar-benar memiliki nama
    const activeK = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF" && k.nama_karyawan);
    
    const optKaryawanSelect = activeK.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} — ${escapeHtml(k.jabatan || "")}</option>`).join("");

    const templates = await fsGetAll(COL.MASTER_SOAL_KPI);
    const validTemplates = templates.filter(t => t.nama_template && t.soal_json && t.soal_json.length > 0);
    const optTemplates = validTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.nama_template)}</option>`).join("");

    openModal({
      title: "Distribusi Penilaian KPI 360",
      size: "lg",
      bodyHtml: `
        <form id="form-distribusi" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">Periode Penilaian</label>
              <input type="text" id="kpi-periode" placeholder="Cth: Q3 2026" required class="w-full px-3 py-2 text-sm rounded-lg border outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">Pilih PENILAI (Assessor)</label>
              <select id="kpi-penilai" required class="w-full px-3 py-2 text-sm rounded-lg border outline-none">
                 <option value="">Pilih Karyawan Penilai...</option>
                 ${optKaryawanSelect}
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Pilih Karyawan yang DINILAI (Bisa Centang Banyak)</label>
            <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
               <div class="p-2.5 bg-slate-50 border-b border-slate-200">
                  <input type="text" id="kpi-search-box" placeholder="Ketik nama karyawan untuk mencari..." class="w-full px-3 py-1.5 text-xs rounded border border-slate-200 outline-none focus:border-maroon-500">
               </div>
               <div id="kpi-checkbox-list" class="max-h-40 overflow-y-auto divide-y divide-slate-100 p-1 bg-white space-y-0.5">
                  </div>
            </div>
          </div>
          
          <div class="bg-slate-50 p-4 rounded-xl border mt-2">
            <div class="flex justify-between items-center mb-3 border-b pb-3">
               <label class="text-xs font-bold text-slate-700 uppercase">Rancang Indikator & Bobot</label>
               <select id="kpi-template-picker" class="w-48 px-2 py-1.5 text-xs rounded border bg-white outline-none font-medium cursor-pointer">
                  <option value="">-- Muat Dari Template --</option>
                  ${optTemplates}
               </select>
            </div>
            <div id="soal-list" class="space-y-3 mb-3"></div>
            <button type="button" id="btn-add-soal" class="text-xs text-maroon-700 font-medium hover:underline flex items-center gap-1">✖ Tambah Indikator Manual</button>
            <div class="mt-3 text-right">
              <span id="indikator-bobot-total" class="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">Total Bobot: 0%</span>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-batal-kpi" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Kirim Tugas Penilaian</button>
      `,
      onMount: (m) => {
         const listContainer = m.querySelector("#kpi-checkbox-list");
         const searchBox = m.querySelector("#kpi-search-box");
         const soalList = m.querySelector("#soal-list");
         const badgeBobot = m.querySelector("#indikator-bobot-total");

         // Loop Render Checkbox Berdasarkan Array Pencarian
         function drawCheckboxes(filterText = "") {
             const term = filterText.toLowerCase();
             
             listContainer.innerHTML = activeK.map(k => {
                 // Pengaman tambahan agar tidak error saat map jika data aneh masuk
                 const nama = k.nama_karyawan || "";
                 const jabatan = k.jabatan || "";
                 const cabang = k.cabang || "";

                 const match = nama.toLowerCase().includes(term) || jabatan.toLowerCase().includes(term);
                 if(!match || !nama) return "";
                 
                 return `
                   <label class="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition select-none">
                      <input type="checkbox" name="dinilai-checkbox" value="${escapeHtml(nama)}" class="w-4 h-4 text-maroon-600 border-slate-300 rounded focus:ring-maroon-500 cursor-pointer">
                      <div class="text-xs">
                         <p class="font-semibold text-slate-700">${escapeHtml(nama)}</p>
                         <p class="text-slate-400 text-[10px]">${escapeHtml(jabatan)} • ${escapeHtml(cabang)}</p>
                      </div>
                   </label>
                 `;
             }).join("");
         }
         drawCheckboxes(); // Init render pertama

         searchBox.oninput = (e) => drawCheckboxes(e.target.value);

         function calcTotalBobot() {
            let total = 0; m.querySelectorAll(".soal-bobot").forEach(input => total += parseFloat(input.value) || 0);
            badgeBobot.textContent = `Total Bobot: ${total}%`;
            badgeBobot.className = total === 100 ? "text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded" : "text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded";
            return total;
         }

         function addSoalUI(data = { aspek: "", indikator: "", bobot: "" }) {
            const div = document.createElement("div"); div.className = "flex gap-2 items-start bg-white p-2 rounded-lg border shadow-sm";
            div.innerHTML = `
              <div class="flex-1 space-y-2">
                 <input type="text" placeholder="Aspek" value="${escapeHtml(data.aspek)}" class="soal-aspek w-full px-2 py-1.5 text-xs border rounded outline-none" required>
                 <input type="text" placeholder="Indikator Kinerja" value="${escapeHtml(data.indikator)}" class="soal-indikator w-full px-2 py-1.5 text-xs border rounded outline-none" required>
              </div>
              <div class="w-20"><input type="number" placeholder="Bobot" value="${data.bobot}" class="soal-bobot w-full px-2 py-1.5 text-xs border rounded text-center" required></div>
              <button type="button" class="text-slate-300 hover:text-red-500 mt-1.5 p-1">✖</button>
            `;
            div.querySelector(".soal-bobot").oninput = calcTotalBobot;
            div.querySelector("button").onclick = () => { div.remove(); calcTotalBobot(); };
            soalList.appendChild(div); calcTotalBobot();
         }
         addSoalUI();

         m.querySelector("#kpi-template-picker").onchange = (e) => {
            const tpl = validTemplates.find(t => t.id === e.target.value);
            if (tpl && tpl.soal_json) {
              soalList.innerHTML = "";
              tpl.soal_json.forEach(s => addSoalUI(s));
            }
            if (tpl && Array.isArray(tpl.karyawan_assigned) && tpl.karyawan_assigned.length > 0) {
              const assignedSet = new Set(tpl.karyawan_assigned);
              const checkboxes = m.querySelectorAll('input[name="dinilai-checkbox"]');
              let autoCheckedCount = 0;
              checkboxes.forEach(cb => {
                const shouldCheck = assignedSet.has(cb.value);
                cb.checked = shouldCheck;
                if (shouldCheck) autoCheckedCount++;
              });
              if (autoCheckedCount > 0) {
                toast(`Otomatis mencentang ${autoCheckedCount} karyawan terdaftar dari template ini!`, "info");
              }
            }
         };

         m.querySelector("#btn-add-soal").onclick = () => addSoalUI();
         m.querySelector("#btn-batal-kpi").onclick = closeModal;
         
         m.querySelector("#btn-save-kpi").onclick = async () => {
            const form = m.querySelector("#form-distribusi");
            if (!form.reportValidity() || calcTotalBobot() !== 100) return toast("Lengkapi form & pastikan total bobot tepat 100%!", "warning");

            const periode = m.querySelector("#kpi-periode").value.trim();
            const penilai = m.querySelector("#kpi-penilai").value;
            
            // Ekstrak nama karyawan yang dicentang dari modul checkbox list
            const checkedBoxes = m.querySelectorAll('input[name="dinilai-checkbox"]:checked');
            const dinilaiList = Array.from(checkedBoxes).map(box => box.value);

            if(!dinilaiList.length) return toast("Centang minimal 1 karyawan yang akan dinilai!", "warning");
            if(dinilaiList.includes(penilai)) return toast("Penilai tidak boleh berada di dalam daftar centang yang dinilai!", "warning");

            const soalArray = [];
            soalList.querySelectorAll(".flex.gap-2").forEach(row => {
               soalArray.push({
                  aspek: row.querySelector(".soal-aspek").value.trim(),
                  indikator: row.querySelector(".soal-indikator").value.trim(),
                  bobot: parseFloat(row.querySelector(".soal-bobot").value) || 0,
                  nilai_diberikan: 0
               });
            });

            const deadlineDate = new Date(); deadlineDate.setDate(deadlineDate.getDate() + 3);
            const deadlineISO = deadlineDate.toISOString();

            const btn = m.querySelector("#btn-save-kpi");
            btn.disabled = true; btn.textContent = "Menyebarkan Tugas...";

            try {
               const qU = query(collection(db, COL.USERS), where("nama", "==", penilai), limit(1));
               const snapU = await getDocs(qU);
               let penilaiEmail = "", penilaiUsername = "";
               if (!snapU.empty) { penilaiEmail = snapU.docs[0].data().email; penilaiUsername = snapU.docs[0].id; }

               const createdTasks = [];
               for (const dinilai of dinilaiList) {
                  const payload = {
                    periode,
                    nama_penilai: penilai,
                    nama_dinilai: dinilai,
                    soal_json: soalArray,
                    status: "PENDING",
                    skor_akhir: 0,
                    tanggal: new Date().toISOString(),
                    deadline: deadlineISO
                  };
                  const kpiId = genId("KPI");
                  await fsAdd(COL.TUGAS_KPI_360, payload, kpiId);
                  createdTasks.push({ id: kpiId, ...payload });
               }

               if (penilaiEmail && penilaiUsername && typeof sendEmailNotif === 'function') {
                  const token = await createLoginToken(penilaiUsername);
                  const magicLink = `https://andela-hris.vercel.app/#dashboard?token=${token}`;
                  const htmlEmail = `<div style="font-family: Arial; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;"><h2 style="color: #7a1f2b;">Tugas Penilaian KPI Baru</h2><p>Halo <strong>${penilai}</strong>,</p><p>Anda ditugaskan menilai <strong>${dinilaiList.length} karyawan</strong> periode <strong>${periode}</strong>.</p><a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Mulai Menilai</a></div>`;
                  sendEmailNotif(penilaiEmail, "Tugas Penilaian KPI 360", htmlEmail).catch(e => console.warn(e));
                  await notifyUser(penilaiUsername, "Tugas Penilaian KPI 360", `Anda ditugaskan menilai ${dinilaiList.length} karyawan periode ${periode}.`);
               }

               toast("Tugas Penilaian berhasil didistribusikan.", "success");
               closeModal();
               await loadKpi360();

               // Dialog konfirmasi cetak dokumen pengisian fisik
               openModal({
                  title: "Pendistribusian KPI Berhasil",
                  bodyHtml: `
                    <div class="text-center py-4 space-y-3">
                      <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">✓</div>
                      <h3 class="text-sm font-bold text-slate-800">Tugas Penilaian KPI Berhasil Dikirim</h3>
                      <p class="text-xs text-slate-600 max-w-md mx-auto">
                        Telah didistribusikan <strong>${createdTasks.length} tugas penilaian</strong> untuk Penilai <strong>${escapeHtml(penilai)}</strong> pada periode <strong>${escapeHtml(periode)}</strong>.
                      </p>
                      <p class="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        Anda dapat langsung mengunduh atau mencetak dokumen pengisian fisik ber-standar ISO CV Andela Jaya untuk keperluan penilaian offline/fisik.
                      </p>
                    </div>
                  `,
                  footerHtml: `
                    <div class="flex items-center justify-between w-full">
                      <button id="btn-done-distribusi" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition">Selesai</button>
                      <button id="btn-print-fisik-now" class="px-5 py-2.5 bg-maroon-700 text-white rounded-lg text-xs font-bold hover:bg-maroon-800 transition shadow-md flex items-center gap-1.5">🖨️ Cetak / Download Form Fisik (${createdTasks.length} Karyawan)</button>
                    </div>
                  `,
                  onMount: (m2) => {
                    m2.querySelector("#btn-done-distribusi").onclick = closeModal;
                    m2.querySelector("#btn-print-fisik-now").onclick = () => {
                      closeModal();
                      printBatchFormKpiFisik(createdTasks);
                    };
                  }
               }); 
            } catch (e) { toast("Gagal: " + e.message, "error"); btn.disabled = false; }
         }
      }
    });
  }

  async function loadHasil() {
    const wrap = panels.hasil; wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    try {
      const logs = await fsGetAll(COL.LOG_PENILAIAN_KPI);
      logs.sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
      if (!logs.length) { wrap.innerHTML = emptyState("Belum ada data hasil"); return; }

      wrap.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
                <th class="px-4 py-3 text-left">Tanggal</th><th class="px-4 py-3 text-left">Dinilai</th><th class="px-4 py-3 text-left">Penilai</th><th class="px-4 py-3 text-left">Skor Akhir</th><th class="px-4 py-3 text-left">Kategori</th><th class="px-4 py-3 text-right">Aksi</th>
              </tr></thead>
              <tbody>${logs.map(r => `
                <tr class="border-t border-slate-50 hover:bg-slate-50 transition">
                  <td class="px-4 py-3">${fmtDateShort(r.tanggal)}</td>
                  <td class="px-4 py-3 font-medium">${escapeHtml(r.nama_dinilai)}</td>
                  <td class="px-4 py-3">${escapeHtml(r.penilai)}</td>
                  <td class="px-4 py-3 font-semibold">${r.total_skor}</td>
                  <td class="px-4 py-3">${badge(r.keputusan, r.keputusan === "Sangat Baik" ? "green" : "blue")}</td>
                  <td class="px-4 py-3 text-right">
                    <button data-print="${r.id}" class="text-xs bg-slate-800 text-white px-3 py-1.5 rounded flex items-center gap-1 ml-auto">Cetak PDF</button>
                  </td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;

      wrap.querySelectorAll("[data-print]").forEach(btn => {
         btn.onclick = () => printKpiToHtml(logs.find(x => x.id === btn.dataset.print));
      });
    } catch (e) { wrap.innerHTML = emptyState("Gagal memuat"); }
  }

  async function printKpiToHtml(row) {
    const { downloadHtmlAsPdf } = await import("../utils.js");
    toast("Sedang memproses PDF...", "info");
    let tbody = '';
    (row.detail_json || []).forEach(item => {
        let weighted = (item.nilai_diberikan * (item.bobot / 100)).toFixed(2);
        tbody += `<tr>
          <td style="border:1px solid #000; padding:6px 10px;">${escapeHtml(item.aspek)}</td>
          <td style="border:1px solid #000; padding:6px 10px;">${escapeHtml(item.indikator)}</td>
          <td style="border:1px solid #000; padding:6px 10px; text-align: center;">${item.bobot}%</td>
          <td style="border:1px solid #000; padding:6px 10px; text-align: center;">${item.nilai_diberikan}</td>
          <td style="border:1px solid #000; padding:6px 10px; text-align: center;"><strong>${weighted}</strong></td>
        </tr>`;
    });

    const html = `
      <div style="width:100%; max-width:760px; margin:0 auto; padding:0; font-family:'Times New Roman', Times, serif; font-size:11px; line-height:1.35; color:#000; background:#ffffff;">
        <div style="page-break-inside:avoid; margin-bottom:15px;">
          ${isoDocHeaderTable({ judul: "LAPORAN EVALUASI & PENILAIAN KPI KARYAWAN", noDok: "HR-KPI-01", terbitRevisi: "1/0", hal: "1 dari 1" })}
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:15px; border:1px solid #000;">
          <tr><td width="35%" style="border:1px solid #000; padding:6px 10px; font-weight:bold; background:#f8fafc;">Nama Karyawan</td><td style="border:1px solid #000; padding:6px 10px;"><strong>${escapeHtml(row.nama_dinilai)}</strong></td></tr>
          <tr><td style="border:1px solid #000; padding:6px 10px; font-weight:bold; background:#f8fafc;">Penilai / Atasan</td><td style="border:1px solid #000; padding:6px 10px;">${escapeHtml(row.penilai || "-")}</td></tr>
          <tr><td style="border:1px solid #000; padding:6px 10px; font-weight:bold; background:#f8fafc;">Skor KPI Akhir</td><td style="border:1px solid #000; padding:6px 10px;"><strong>${row.total_skor || row.skor_akhir || "-"}</strong></td></tr>
        </table>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; border:1px solid #000;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="border:1px solid #000; padding:6px 10px; text-align: left;">Aspek</th>
              <th style="border:1px solid #000; padding:6px 10px; text-align: left;">Indikator</th>
              <th style="border:1px solid #000; padding:6px 10px; text-align: center;">Bobot</th>
              <th style="border:1px solid #000; padding:6px 10px; text-align: center;">Nilai</th>
              <th style="border:1px solid #000; padding:6px 10px; text-align: center;">Skor Akhir</th>
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
        </table>

        <!-- CATATAN & FEEDBACK KUALITATIF -->
        <table style="width:100%; border-collapse:collapse; margin-top:12px; border:1px solid #000; font-size:11px;">
          <tr style="background:#f1f5f9; font-weight:bold;">
            <td style="border:1px solid #000; padding:6px 10px;">📝 Catatan Evaluasi & Ulasan Penilai:</td>
          </tr>
          <tr>
            <td style="border:1px solid #000; padding:8px 10px; background:#fff;">
              <div style="margin-bottom:8px;">
                <strong style="color:#166534;">✓ Hal-hal yang Sudah Baik (Kelebihan / Prestasi Kerja):</strong>
                <div style="margin-top:3px; font-size:10.5px; line-height:1.4; color:#1e293b; background:#f8fafc; padding:6px 8px; border:1px solid #e2e8f0; border-radius:3px;">
                  ${escapeHtml(row.catatan_baik || "-")}
                </div>
              </div>
              <div style="margin-bottom:8px;">
                <strong style="color:#991b1b;">⚠ Hal-hal yang Harus Diperbaiki (Area Peningkatan):</strong>
                <div style="margin-top:3px; font-size:10.5px; line-height:1.4; color:#1e293b; background:#f8fafc; padding:6px 8px; border:1px solid #e2e8f0; border-radius:3px;">
                  ${escapeHtml(row.catatan_perbaikan || "-")}
                </div>
              </div>
              <div>
                <strong style="color:#334155;">💬 Catatan & Rekomendasi Tambahan Penilai:</strong>
                <div style="margin-top:3px; font-size:10.5px; line-height:1.4; color:#1e293b; background:#f8fafc; padding:6px 8px; border:1px solid #e2e8f0; border-radius:3px;">
                  ${escapeHtml(row.catatan_penilai || row.catatan_umum || "-")}
                </div>
              </div>
            </td>
          </tr>
        </table>
        <table style="width:100%; text-align:center; margin-top:35px; page-break-inside:avoid; font-size:11px;">
          <tr><td width="50%">Karyawan Dinilai,</td><td width="50%">Penilai / HRD,</td></tr>
          <tr><td height="60"></td><td></td></tr>
          <tr><td>( <strong>${escapeHtml(row.nama_dinilai)}</strong> )</td><td>( <strong>${escapeHtml(row.penilai || "Atasan Direct")}</strong> )</td></tr>
        </table>
      </div>
    `;
    await downloadHtmlAsPdf(html, `Laporan_KPI_${escapeHtml(row.nama_dinilai).replace(/\s+/g, "_")}.pdf`);
    toast("PDF berhasil diunduh!", "success");
  }

  async function loadEvaluasi() {
    await renderCrudModule(panels.evaluasi, {
      title: "Evaluasi Kontrak",
      collectionName: COL.EVALUASI_KONTRAK,
      idPrefix: "EVK",
      searchFields: ["nama_pekerja"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_pekerja", label: "Karyawan" },
        { key: "skor", label: "Skor" },
        { key: "rekomendasi", label: "Rekomendasi", type: "badge" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "nama_pekerja", label: "Nama Karyawan", type: "text", required: true },
        { name: "skor", label: "Skor (0-100)", type: "number", required: true },
        { name: "rekomendasi", label: "Rekomendasi", type: "select", options: ["Perpanjang Kontrak", "Angkat Tetap", "Tidak Diperpanjang"], required: true },
      ]
    });
  }

  await loadKontrak(); loaded.kontrak = true;

  container.querySelectorAll(".pk-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ntab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".pk-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "kpi360") await loadKpi360();
        if (tab === "hasil") await loadHasil();
        if (tab === "evaluasi") await loadEvaluasi();
        if (tab === "template") await loadTemplateKpi();
      }
    });
  });

  return { unmount() {} };
}
