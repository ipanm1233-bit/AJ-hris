import { db, COL, collection, query, where, getDocs, limit } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, genId, fmtDateShort, escapeHtml, sendEmailNotif, createLoginToken, notifyUser, daysBetween } from "../utils.js";
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
                  <span>• Status: <strong class="text-slate-800">${escapeHtml(item.status_karyawan || "KONTRAK")}</strong></span>
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
                  <option value="KONTRAK" ${(empData.status_karyawan || "KONTRAK") === "KONTRAK" ? 'selected' : ''}>KONTRAK</option>
                  <option value="TETAP" ${empData.status_karyawan === "TETAP" ? 'selected' : ''}>TETAP</option>
                  <option value="PROBATION" ${empData.status_karyawan === "PROBATION" ? 'selected' : ''}>PROBATION</option>
                  <option value="OUTSOURCING" ${empData.status_karyawan === "OUTSOURCING" ? 'selected' : ''}>OUTSOURCING</option>
                  <option value="RESIGN" ${empData.status_karyawan === "RESIGN" ? 'selected' : ''}>RESIGN</option>
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
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    const templates = await fsGetAll(COL.MASTER_SOAL_KPI);

    let html = `
        <div class="mb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
             <h2 class="text-xl font-semibold text-slate-800">Master Template KPI</h2>
             <p class="text-sm text-slate-500">Buat set indikator penilaian (Contoh: Template Sales, Admin) untuk digunakan berulang kali.</p>
          </div>
          <div class="flex gap-2">
             <input type="file" id="kpi-excel-upload" accept=".xlsx, .xls" class="hidden">
             <button id="btn-import-template" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
               Import Excel
             </button>
             <button id="btn-add-template" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
               Buat Manual
             </button>
          </div>
        </div>
    `;

    if (!templates.length) {
        html += emptyState("Belum ada Template Soal KPI", "Klik tombol Import Excel atau Buat Manual di atas.");
    } else {
        html += `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th class="px-4 py-3 text-left">Nama Template / Jabatan</th><th class="px-4 py-3 text-center">Jml Indikator</th><th class="px-4 py-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              ${templates.map(t => {
                const isLegacy = !t.nama_template || !t.soal_json;
                const nama = t.nama_template || "Data Migrasi Lama (Tanpa Nama)";
                const count = isLegacy ? "-" : (t.soal_json || []).length;
                return `
                <tr class="border-t border-slate-50 hover:bg-slate-50 transition">
                  <td class="px-4 py-3 font-medium ${isLegacy ? 'text-red-500' : 'text-slate-700'}">
                     ${escapeHtml(nama)}
                     ${isLegacy ? '<span class="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Format Lama (Hapus)</span>' : ''}
                  </td>
                  <td class="px-4 py-3 text-center">${count} Indikator</td>
                  <td class="px-4 py-3 text-right">
                    ${!isLegacy ? `<button data-edit-tpl="${t.id}" class="text-maroon-700 hover:underline mr-3 font-medium text-xs">Edit</button>` : ''}
                    <button data-del-tpl="${t.id}" class="text-red-500 hover:underline font-medium text-xs">Hapus</button>
                  </td>
                </tr>
              `}).join("")}
            </tbody>
          </table>
        </div>`;
    }
    wrap.innerHTML = html;

    const btnImport = wrap.querySelector("#btn-import-template");
    const inputExcel = wrap.querySelector("#kpi-excel-upload");
    if (btnImport && inputExcel) {
       btnImport.onclick = () => inputExcel.click();
       inputExcel.onchange = (e) => handleExcelImport(e.target.files[0]);
    }
    const btnAdd = wrap.querySelector("#btn-add-template");
    if(btnAdd) btnAdd.onclick = () => openTemplateModal();

    wrap.querySelectorAll("[data-edit-tpl]").forEach(btn => {
        btn.onclick = () => openTemplateModal(templates.find(x => x.id === btn.dataset.editTpl));
    });
    wrap.querySelectorAll("[data-del-tpl]").forEach(btn => {
        btn.onclick = async () => {
            if(confirm("Apakah Anda yakin ingin menghapus data ini?")) {
                await fsDelete(COL.MASTER_SOAL_KPI, btn.dataset.delTpl);
                toast("Template berhasil dihapus", "success");
                loadTemplateKpi();
            }
        }
    });
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
                if (!groupedTemplates[jabatan]) groupedTemplates[jabatan] = { nama_template: jabatan, soal_json: [] };
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

  function openTemplateModal(existingData = null) {
    openModal({
        title: existingData ? "Edit Template KPI" : "Buat Template KPI Baru",
        size: "lg",
        bodyHtml: `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-medium text-slate-500 mb-1.5">Nama Template (Cth: Template KPI Sales Staff)</label>
                    <input type="text" id="tpl-nama" value="${existingData ? escapeHtml(existingData.nama_template) : ''}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
                </div>
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div class="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                       <label class="text-xs font-bold text-slate-700 uppercase tracking-wide">Rancang Indikator & Bobot (Wajib Total 100%)</label>
                       <span id="tpl-bobot-total" class="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">Total Bobot: 0%</span>
                    </div>
                    <div id="tpl-soal-list" class="space-y-3 mb-3"></div>
                    <button type="button" id="btn-tpl-add" class="text-xs text-maroon-700 font-medium hover:underline flex items-center gap-1">
                       <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Tambah Indikator Baru
                    </button>
                </div>
            </div>
        `,
        footerHtml: `
            <button id="btn-tpl-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
            <button id="btn-tpl-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Simpan Template</button>
        `,
        onMount: (m) => {
            const soalList = m.querySelector("#tpl-soal-list");
            const badgeBobot = m.querySelector("#tpl-bobot-total");

            function calcTotalBobot() {
                let total = 0;
                m.querySelectorAll(".soal-bobot").forEach(input => total += parseFloat(input.value) || 0);
                badgeBobot.textContent = `Total Bobot: ${total}%`;
                if (total === 100) badgeBobot.className = "text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded";
                else badgeBobot.className = "text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded";
                return total;
            }

            function addSoalUI(data = { aspek: "", indikator: "", bobot: "" }) {
                const div = document.createElement("div");
                div.className = "flex gap-2 items-start bg-white p-2 rounded-lg border border-slate-200 shadow-sm";
                div.innerHTML = `
                  <div class="flex-1 space-y-2">
                     <input type="text" placeholder="Aspek" value="${escapeHtml(data.aspek)}" class="soal-aspek w-full px-2 py-1.5 text-xs border rounded outline-none" required>
                     <input type="text" placeholder="Indikator" value="${escapeHtml(data.indikator)}" class="soal-indikator w-full px-2 py-1.5 text-xs border rounded outline-none" required>
                  </div>
                  <div class="w-20">
                     <input type="number" placeholder="Bobot %" value="${data.bobot}" class="soal-bobot w-full px-2 py-1.5 text-xs border rounded text-center" required min="1" max="100">
                  </div>
                  <button type="button" class="text-slate-300 hover:text-red-500 mt-1.5 p-1">✖</button>
                `;
                div.querySelector(".soal-bobot").addEventListener("input", calcTotalBobot);
                div.querySelector("button").addEventListener("click", () => { div.remove(); calcTotalBobot(); });
                soalList.appendChild(div); calcTotalBobot();
            }

            if (existingData && existingData.soal_json) existingData.soal_json.forEach(s => addSoalUI(s));
            else addSoalUI();

            m.querySelector("#btn-tpl-add").onclick = () => addSoalUI();
            m.querySelector("#btn-tpl-batal").onclick = closeModal;
            m.querySelector("#btn-tpl-simpan").onclick = async () => {
                const nama = m.querySelector("#tpl-nama").value.trim();
                if (!nama || calcTotalBobot() !== 100) return toast("Lengkapi nama & pastikan total bobot tepat 100%!", "warning");

                const soalArray = [];
                soalList.querySelectorAll(".flex.gap-2").forEach(row => {
                   soalArray.push({
                      aspek: row.querySelector(".soal-aspek").value.trim(),
                      indikator: row.querySelector(".soal-indikator").value.trim(),
                      bobot: parseFloat(row.querySelector(".soal-bobot").value) || 0,
                      nilai_diberikan: 0
                   });
                });

                if (existingData) await fsUpdate(COL.MASTER_SOAL_KPI, existingData.id, { nama_template: nama, soal_json: soalArray });
                else await fsAdd(COL.MASTER_SOAL_KPI, { nama_template: nama, soal_json: soalArray }, genId("TPL-KPI"));
                toast("Template disimpan", "success"); closeModal(); loadTemplateKpi();
            }
        }
    });
  }

  async function loadKpi360() {
    const wrap = panels.kpi360;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    const tasks = await fsGetAll(COL.TUGAS_KPI_360);
    const isHrd = session.role === "HRD";

    let htmlContent = isHrd ? `
        <div class="mb-4 flex justify-end">
          <button id="btn-distribusi-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2">
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
                <th class="px-4 py-3 text-left">Periode</th><th class="px-4 py-3 text-left">Penilai</th><th class="px-4 py-3 text-left">Dinilai</th><th class="px-4 py-3 text-left">Batas Waktu</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Skor</th>
              </tr></thead>
              <tbody>${tasks.map(t => `
                <tr class="border-t border-slate-50 hover:bg-slate-50 transition">
                  <td class="px-4 py-3">${escapeHtml(t.periode || "-")}</td>
                  <td class="px-4 py-3 font-medium">${escapeHtml(t.nama_penilai || "-")}</td>
                  <td class="px-4 py-3">${escapeHtml(t.nama_dinilai || "-")}</td>
                  <td class="px-4 py-3 text-xs text-slate-500">${t.deadline ? fmtDateShort(t.deadline) : "-"}</td>
                  <td class="px-4 py-3">${badge(t.status || "PENDING", t.status === "DONE" ? "green" : "amber")}</td>
                  <td class="px-4 py-3 font-semibold">${t.skor_akhir || "-"}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }
    if (isHrd && wrap.querySelector("#btn-distribusi-kpi")) wrap.querySelector("#btn-distribusi-kpi").onclick = openDistribusiModal;
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
            if (tpl && tpl.soal_json) { soalList.innerHTML = ""; tpl.soal_json.forEach(s => addSoalUI(s)); }
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

               for (const dinilai of dinilaiList) {
                  await fsAdd(COL.TUGAS_KPI_360, { periode, nama_penilai: penilai, nama_dinilai: dinilai, soal_json: soalArray, status: "PENDING", skor_akhir: 0, tanggal: new Date().toISOString(), deadline: deadlineISO }, genId("KPI"));
               }

               if (penilaiEmail && penilaiUsername && typeof sendEmailNotif === 'function') {
                  const token = await createLoginToken(penilaiUsername);
                  const magicLink = `https://andela-hris.vercel.app/#dashboard?token=${token}`;
                  const htmlEmail = `<div style="font-family: Arial; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;"><h2 style="color: #7a1f2b;">Tugas Penilaian KPI Baru</h2><p>Halo <strong>${penilai}</strong>,</p><p>Anda ditugaskan menilai <strong>${dinilaiList.length} karyawan</strong> periode <strong>${periode}</strong>.</p><a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Mulai Menilai</a></div>`;
                  sendEmailNotif(penilaiEmail, "Tugas Penilaian KPI 360", htmlEmail).catch(e => console.warn(e));
                  await notifyUser(penilaiUsername, "Tugas Penilaian KPI 360", `Anda ditugaskan menilai ${dinilaiList.length} karyawan periode ${periode}.`);
               }

               toast("Tugas Penilaian berhasil didistribusikan.", "success"); closeModal(); await loadKpi360(); 
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
