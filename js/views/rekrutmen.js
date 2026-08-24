/**
 * =====================================================================
 * REKRUTMEN.JS — Full ATS & Recruitment Suite Controller
 * HRIS Andela Jaya (Corporate Modern Red-Accent Theme)
 * =====================================================================
 */
import { db, COL, collection, onSnapshot, doc, updateDoc, setDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, confirmDialog, toast, escapeHtml, genId, fmtDateShort, fmtRupiah } from "../utils.js";
import { evaluateCandidateATS, extractBasicInfo, extractTextFromPdfFile, extractTextFromDocxFile, DEFAULT_SYNONYMS, CITIES_DICTIONARY } from "./ats-engine.js";
import { openCandidateDetailModal, openCvViewerModal, openInterviewScorecardModal, openCreateVacancyWizardModal, openPublicIntakeModal, loadRecruitmentMasterData } from "./ats-ui-components.js";
import { renderAtsAnalyticsHtml } from "./ats-analytics.js";

const KANBAN_STAGES = [
  { id: "Applied", label: "Pelamar Baru (Applied)", badgeColor: "bg-slate-100 text-slate-700" },
  { id: "Screening", label: "Screening ATS", badgeColor: "bg-blue-100 text-blue-800" },
  { id: "Shortlist", label: "Shortlist HR (Lolos)", badgeColor: "bg-teal-100 text-teal-800" },
  { id: "Interview", label: "Interview (User/HR)", badgeColor: "bg-amber-100 text-amber-800" },
  { id: "Offered", label: "Offering / PKWT", badgeColor: "bg-purple-100 text-purple-800" },
  { id: "Hired", label: "Hired (Diterima)", badgeColor: "bg-emerald-100 text-emerald-800" }
];

export async function mount(container, { params, session }) {
  // Pastikan library PDF.js tersedia
  if (!window['pdfjs-dist/build/pdf']) {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    document.head.appendChild(script);
  }

  let activeTab = params?.get("tab") || "dashboard";
  let allCandidates = [];
  let allVacancies = [];
  let allInterviews = [];
  let masterData = null;
  let customSynonyms = {};
  let unsubscribeCands = null;
  let unsubscribeVacancies = null;

  // Render tab container layout
  const tabContentEl = container.querySelector("#ats-tab-content") || container;

  async function loadInitialData() {
    try {
      masterData = await loadRecruitmentMasterData();
      allVacancies = await fsGetAll(COL.DATA_REKRUTMEN || "data_rekrutmen").catch(() => []);
      allCandidates = await fsGetAll(COL.PELAMAR || "pelamar_ats").catch(() => []);
      allInterviews = await fsGetAll("interview_scorecards").catch(() => []);

      // Auto-seed default lowongan jika belum ada data agar langsung siap pakai
      if (allVacancies.length === 0) {
        const defaultVac = {
          id: "VAC-001",
          posisi: "Sales Executive Lapangan",
          departemen: masterData.divisiList[0] || "MARKETING & SALES",
          cabang: masterData.cabangList[0] || "HEAD OFFICE",
          penempatan: masterData.cabangList[0] || "HEAD OFFICE",
          tipe_pekerjaan: "PKWT (Karyawan Kontrak)",
          jumlah_kebutuhan: 2,
          hiring_manager: masterData.managerList[0] || "GENERAL MANAGER",
          tanggal_buka: new Date().toISOString().split('T')[0],
          status: "Open",
          pendidikan_min: "SMA/SMK",
          pengalaman_min: 1,
          sim_required: ["SIM C"],
          skills: ["Sales", "Negotiation", "Canvassing", "Komunikasi", "Target Sales"],
          industri_relevan: ["Distributor", "FMCG", "Bahan Bangunan", "Retail"],
          ats_pass_threshold: 70,
          ats_rules: [
            { kriteria: "Pendidikan", bobot: 10, mandatory: true, key: "pendidikan" },
            { kriteria: "Pengalaman Kerja", bobot: 25, mandatory: true, key: "pengalaman" },
            { kriteria: "SIM C / Mengemudi", bobot: 15, mandatory: true, key: "sim" },
            { kriteria: "Domisili & Penempatan", bobot: 10, mandatory: false, key: "domisili" },
            { kriteria: "Keahlian Utama / Sales", bobot: 20, mandatory: false, key: "skills" },
            { kriteria: "Software & Excel", bobot: 10, mandatory: false, key: "software" },
            { kriteria: "Pengalaman Industri Relevan", bobot: 10, mandatory: false, key: "industri" }
          ],
          created_at: new Date().toISOString()
        };
        await fsAdd(COL.DATA_REKRUTMEN || "data_rekrutmen", defaultVac);
        allVacancies.push(defaultVac);
      }

      // Pastikan evaluasi ATS terisi untuk kandidat
      allCandidates.forEach(cand => {
        const v = allVacancies.find(x => x.id === cand.lowongan_id || x.posisi === cand.posisi_dilamar);
        cand.evaluation = evaluateCandidateATS(cand, v, customSynonyms);
        cand.ai_score = cand.evaluation.skor_ats;
      });

      updateBadges();
      renderActiveTab();
    } catch (e) {
      console.error("Gagal memuat data rekrutmen:", e);
    }
  }

  function updateBadges() {
    const bVac = container.querySelector("#ats-badge-vacancies");
    const bCand = container.querySelector("#ats-badge-candidates");
    if (bVac) {
      bVac.textContent = allVacancies.length;
      bVac.classList.remove("hidden");
    }
    if (bCand) {
      bCand.textContent = allCandidates.length;
      bCand.classList.remove("hidden");
    }
  }

  function switchTab(tabId) {
    activeTab = tabId;
    container.querySelectorAll(".ats-tab-btn").forEach(btn => {
      const isTarget = btn.dataset.atstab === tabId;
      btn.classList.toggle("border-maroon-700", isTarget);
      btn.classList.toggle("text-maroon-700", isTarget);
      btn.classList.toggle("font-bold", isTarget);
      btn.classList.toggle("border-transparent", !isTarget);
      btn.classList.toggle("text-slate-500", !isTarget);
    });
    renderActiveTab();
  }

  // Bind Tab Click Events
  container.querySelectorAll(".ats-tab-btn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.atstab);
  });

  // Bind Top Action Buttons
  const btnNewVac = container.querySelector("#ats-btn-new-vacancy");
  if (btnNewVac) {
    btnNewVac.onclick = () => {
      openCreateVacancyWizardModal({
        masterData,
        onSaveVacancy: async (vacData) => {
          if (!vacData.id) vacData.id = `VAC-${String(allVacancies.length + 1).padStart(3, '0')}`;
          vacData.created_at = new Date().toISOString();
          await fsAdd(COL.DATA_REKRUTMEN || "data_rekrutmen", vacData);
          toast("Lowongan baru berhasil dibuat & dipublikasikan!", "success");
          loadInitialData();
        }
      });
    };
  }

  const btnNewCand = container.querySelector("#ats-btn-new-candidate");
  if (btnNewCand) {
    btnNewCand.onclick = () => {
      openPublicIntakeModal(allVacancies, {
        masterData,
        onSubmitApplication: async (candPayload) => {
          await fsAdd(COL.PELAMAR || "pelamar_ats", candPayload);
          allCandidates.unshift(candPayload);
          toast(`Kandidat ${candPayload.nama} berhasil ditambahkan dan dievaluasi!`, "success");
          loadInitialData();
          switchTab("kandidat");
        }
      });
    };
  }

  const btnPublicPortal = container.querySelector("#ats-btn-public-portal");
  if (btnPublicPortal) {
    btnPublicPortal.onclick = () => {
      const publicUrl = `${window.location.origin}${window.location.pathname}#karir`;
      const modalContent = `
        <div class="space-y-5">
          <div class="bg-blue-50/80 p-4 rounded-2xl border border-blue-100 text-xs text-blue-900 space-y-1">
            <p class="font-bold">Portal Karir Publik CV Andela Jaya</p>
            <p class="text-slate-600">Halaman ini dapat diakses bebas oleh pelamar umum tanpa perlu akun HRIS. Berkas lamaran yang masuk akan otomatis tersinkronisasi ke sistem ATS ini.</p>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-slate-700">Link Publik untuk Pelamar:</label>
            <div class="flex items-center gap-2">
              <input type="text" readonly value="${publicUrl}" id="modal-pub-link-inp" 
                class="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 select-all outline-none focus:border-maroon-600">
              <button type="button" id="modal-btn-copy-pub-link" class="px-4 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0 cursor-pointer">
                Salin Link
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <a href="#karir" target="_blank" class="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition group block">
              <span class="text-xs font-bold text-slate-800 group-hover:text-maroon-700 flex items-center gap-1.5">
                <span>Buka Portal Karir</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </span>
              <p class="text-[11px] text-slate-500 mt-1">Buka tampilan halaman pelamar di tab baru.</p>
            </a>

            <button type="button" id="modal-btn-intake-form" class="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition group cursor-pointer">
              <span class="text-xs font-bold text-slate-800 group-hover:text-maroon-700 flex items-center gap-1.5">
                <span>Formulir Input Lamaran</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
              </span>
              <p class="text-[11px] text-slate-500 mt-1">Input CV pelamar langsung dari internal HRD.</p>
            </button>
          </div>

          <div class="pt-3 border-t border-slate-100 flex justify-end">
            <button type="button" id="modal-btn-close-portal-dlg" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">
              Tutup
            </button>
          </div>
        </div>
      `;

      const m = openModal({
        title: "Akses Portal Karir & Rekrutmen",
        bodyHtml: modalContent,
        size: "sm"
      });
      const closeBtn = m?.querySelector("#modal-btn-close-portal-dlg");
      if (closeBtn) closeBtn.onclick = () => closeModal(m);
      
      const copyBtn = m?.querySelector("#modal-btn-copy-pub-link");
      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(publicUrl).then(() => {
            toast("Link Portal Karir berhasil disalin ke clipboard!", "success");
          }).catch(() => {
            prompt("Salin link ini:", publicUrl);
          });
        };
      }

      const intakeBtn = m?.querySelector("#modal-btn-intake-form");
      if (intakeBtn) {
        intakeBtn.onclick = () => {
          closeModal(m);
          openPublicIntakeModal(allVacancies, {
            masterData,
            onSubmitApplication: async (candPayload) => {
              await fsAdd(COL.PELAMAR || "pelamar_ats", candPayload);
              allCandidates.unshift(candPayload);
              loadInitialData();
            }
          });
        };
      }
    };
  }

  /* ---------------------------------------------------------------------
   * RENDER TAB VIEWS
   * ------------------------------------------------------------------- */
  function renderActiveTab() {
    const target = container.querySelector("#ats-tab-content");
    if (!target) return;

    switch (activeTab) {
      case "dashboard":
        renderDashboard(target);
        break;
      case "lowongan":
        renderLowonganTab(target);
        break;
      case "kandidat":
        renderKandidatTab(target);
        break;
      case "screening":
        renderScreeningTab(target);
        break;
      case "pipeline":
        renderPipelineTab(target);
        break;
      case "interview":
        renderInterviewTab(target);
        break;
      case "analytics":
        target.innerHTML = renderAtsAnalyticsHtml(allCandidates, allVacancies);
        break;
      case "rules":
        renderRulesTab(target);
        break;
      default:
        renderDashboard(target);
        break;
    }
  }

  /* 1. DASHBOARD VIEW */
  function renderDashboard(el) {
    const activeJobs = allVacancies.filter(v => v.status === "Open").length;
    const totalCV = allCandidates.length;
    const lolosAts = allCandidates.filter(c => (c.evaluation?.skor_ats || 0) >= 70).length;
    const hired = allCandidates.filter(c => c.status === "Hired").length;

    el.innerHTML = `
    <div class="space-y-6">
      <!-- 4 Metric Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Lowongan Aktif</p>
            <p class="text-2xl font-black text-slate-800 mt-1">${activeJobs}</p>
            <p class="text-[11px] text-emerald-600 font-bold mt-1">✓ Siap Terima Lamaran</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-maroon-50 text-maroon-700 flex items-center justify-center font-bold">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Total CV Masuk</p>
            <p class="text-2xl font-black text-slate-800 mt-1">${totalCV}</p>
            <p class="text-[11px] text-blue-600 font-bold mt-1">Otomatis Ter-parsing</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Lolos ATS (≥70%)</p>
            <p class="text-2xl font-black text-teal-700 mt-1">${lolosAts}</p>
            <p class="text-[11px] text-teal-600 font-bold mt-1">${totalCV > 0 ? Math.round((lolosAts / totalCV) * 100) : 0}% Tingkat Lolos</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Hired (Diterima)</p>
            <p class="text-2xl font-black text-emerald-700 mt-1">${hired}</p>
            <p class="text-[11px] text-emerald-600 font-bold mt-1">Siap Onboarding</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          </div>
        </div>
      </div>

      <!-- Quick Funnel & Recent Applicants Section -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Lowongan Aktif Ringkas -->
        <div class="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-sm font-bold text-slate-800">Lowongan Pekerjaan Aktif</h3>
            <button id="db-btn-all-jobs" class="text-xs font-bold text-maroon-700 hover:underline cursor-pointer">Semua</button>
          </div>
          <div class="space-y-3">
            ${allVacancies.slice(0, 4).map(v => {
              const count = allCandidates.filter(c => c.lowongan_id === v.id || c.posisi_dilamar === v.posisi).length;
              return `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-maroon-200 transition flex justify-between items-center">
                  <div>
                    <p class="text-xs font-bold text-slate-800">${escapeHtml(v.posisi)}</p>
                    <p class="text-[11px] text-slate-500">${escapeHtml(v.cabang || 'Kantor Pusat')} • Butuh: ${v.jumlah_kebutuhan || 1}</p>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-maroon-100 text-maroon-800">${count} CV</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Kandidat Skor Tertinggi (Top Talent Ranking) -->
        <div class="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-sm font-bold text-slate-800">Kandidat Skor Tertinggi (Top Ranking)</h3>
            <button id="db-btn-all-candidates" class="text-xs font-bold text-maroon-700 hover:underline cursor-pointer">Lihat Semua</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <th class="p-2.5 text-left">Nama</th>
                  <th class="p-2.5 text-left">Posisi</th>
                  <th class="p-2.5 text-center">Skor ATS</th>
                  <th class="p-2.5 text-left">Klasifikasi</th>
                  <th class="p-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${allCandidates.slice().sort((a,b) => (b.evaluation?.skor_ats || 0) - (a.evaluation?.skor_ats || 0)).slice(0, 5).map(c => `
                  <tr class="hover:bg-slate-50/60 transition">
                    <td class="p-2.5 font-bold text-slate-800">${escapeHtml(c.nama)}</td>
                    <td class="p-2.5 text-slate-600">${escapeHtml(c.posisi_dilamar || "-")}</td>
                    <td class="p-2.5 text-center font-mono font-bold ${(c.evaluation?.skor_ats || 0) >= 80 ? 'text-emerald-600' : 'text-blue-600'}">
                      ${c.evaluation?.skor_ats || 0}%
                    </td>
                    <td class="p-2.5">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${c.evaluation?.badge_class || 'bg-slate-100 text-slate-700'}">
                        ${c.evaluation?.klasifikasi || 'Review'}
                      </span>
                    </td>
                    <td class="p-2.5 text-center">
                      <button data-detail-id="${c.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold btn-dash-detail cursor-pointer">
                        Detail
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    `;

    el.querySelector("#db-btn-all-jobs")?.addEventListener("click", () => switchTab("lowongan"));
    el.querySelector("#db-btn-all-candidates")?.addEventListener("click", () => switchTab("kandidat"));

    el.querySelectorAll(".btn-dash-detail").forEach(btn => {
      btn.onclick = () => {
        const cand = allCandidates.find(x => x.id === btn.dataset.detailId);
        const vac = allVacancies.find(x => x.id === cand?.lowongan_id || x.posisi === cand?.posisi_dilamar);
        openCandidateDetailModal(cand, vac, {
          onStatusChange: handleStatusChange,
          onOpenScorecard: handleOpenScorecard,
          onConvertToEmployee: handleConvertToEmployee
        });
      };
    });
  }

  /* 2. LOWONGAN TAB */
  function renderLowonganTab(el) {
    const cbList = masterData?.cabangList || ["HEAD OFFICE", "CABANG BANDUNG", "CABANG SURABAYA", "CABANG SEMARANG", "CABANG BALI", "WORKSHOP", "CIREBON", "KUNINGAN", "MAJALENGKA", "INDRAMAYU", "TEGAL / BREBES"];
    const dvList = masterData?.divisiList || ["HRD & GA", "FINANCE & ACCOUNTING", "OPERASIONAL", "MARKETING & SALES", "IT & DIGITAL", "LOGISTIK & GUDANG", "PRODUKSI", "SALES & DISTRIBUTION"];

    el.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div class="flex flex-wrap items-center gap-2">
          <input type="text" id="vac-search" placeholder="Cari posisi atau cabang..." class="px-3.5 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700 w-56">
          <select id="vac-filter-cabang" class="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700">
            <option value="">Semua Cabang</option>
            ${cbList.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <select id="vac-filter-divisi" class="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700">
            <option value="">Semua Divisi</option>
            ${dvList.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
          </select>
          <select id="vac-filter-status" class="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700">
            <option value="">Semua Status</option>
            <option value="Open">Open</option>
            <option value="Draft">Draft</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <button type="button" id="btn-add-vac-tab" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Buat Lowongan Baru
        </button>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <th class="p-3 text-left">ID & Posisi</th>
                <th class="p-3 text-left">Departemen / Cabang</th>
                <th class="p-3 text-center">Pelamar / Target</th>
                <th class="p-3 text-center">Lolos ATS (≥70)</th>
                <th class="p-3 text-center">Status</th>
                <th class="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody id="vac-tbody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>
    </div>
    `;

    function renderVacRows(list) {
      const tbody = el.querySelector("#vac-tbody");
      if (!tbody) return;

      tbody.innerHTML = list.map(v => {
        const vCands = allCandidates.filter(c => c.lowongan_id === v.id || c.posisi_dilamar === v.posisi);
        const vLolos = vCands.filter(c => (c.evaluation?.skor_ats || 0) >= 70).length;

        return `
          <tr class="hover:bg-slate-50/70 transition">
            <td class="p-3">
              <span class="font-mono text-[10px] text-slate-400 block">${v.id}</span>
              <span class="font-bold text-slate-800 text-sm">${escapeHtml(v.posisi)}</span>
            </td>
            <td class="p-3 text-slate-600">
              <p class="font-medium">${escapeHtml(v.departemen || "Sales & Marketing")}</p>
              <p class="text-[11px] text-slate-400">${escapeHtml(v.cabang || "HEAD OFFICE")}</p>
            </td>
            <td class="p-3 text-center font-bold text-slate-800">
              ${vCands.length} / ${v.jumlah_kebutuhan || 1} Org
            </td>
            <td class="p-3 text-center">
              <span class="px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 font-bold">${vLolos} Kandidat</span>
            </td>
            <td class="p-3 text-center">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${v.status === 'Open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                ${v.status || 'Open'}
              </span>
            </td>
            <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
              <button data-vac-id="${v.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold btn-vac-edit cursor-pointer">
                Edit
              </button>
              <button data-vac-id="${v.id}" class="px-2.5 py-1 bg-maroon-50 hover:bg-maroon-100 text-maroon-800 rounded-lg text-xs font-bold btn-vac-cands cursor-pointer">
                Lihat Pelamar
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll(".btn-vac-edit").forEach(b => {
        b.onclick = () => {
          const v = allVacancies.find(x => x.id === b.dataset.vacId);
          openCreateVacancyWizardModal({
            initialData: v,
            masterData,
            onSaveVacancy: async (upd) => {
              await fsUpdate(COL.DATA_REKRUTMEN || "data_rekrutmen", v.id, upd);
              toast("Lowongan berhasil diperbarui!", "success");
              loadInitialData();
            }
          });
        };
      });

      tbody.querySelectorAll(".btn-vac-cands").forEach(b => {
        b.onclick = () => {
          switchTab("kandidat");
        };
      });
    }

    renderVacRows(allVacancies);

    el.querySelector("#btn-add-vac-tab")?.addEventListener("click", () => {
      openCreateVacancyWizardModal({
        masterData,
        onSaveVacancy: async (vacData) => {
          if (!vacData.id) vacData.id = `VAC-${String(allVacancies.length + 1).padStart(3, '0')}`;
          vacData.created_at = new Date().toISOString();
          await fsAdd(COL.DATA_REKRUTMEN || "data_rekrutmen", vacData);
          toast("Lowongan baru berhasil dibuat!", "success");
          loadInitialData();
        }
      });
    });

    const searchInp = el.querySelector("#vac-search");
    const cabangInp = el.querySelector("#vac-filter-cabang");
    const divisiInp = el.querySelector("#vac-filter-divisi");
    const statusInp = el.querySelector("#vac-filter-status");

    const applyFilter = () => {
      const q = (searchInp.value || "").toLowerCase();
      const cab = (cabangInp.value || "").toLowerCase();
      const div = (divisiInp.value || "").toLowerCase();
      const st = statusInp.value;

      const filtered = allVacancies.filter(v => {
        const mPos = (v.posisi || "").toLowerCase().includes(q) || (v.cabang || "").toLowerCase().includes(q);
        const mCab = !cab || (v.cabang || "").toLowerCase() === cab;
        const mDiv = !div || (v.departemen || "").toLowerCase() === div;
        const mSt = !st || v.status === st;
        return mPos && mCab && mDiv && mSt;
      });
      renderVacRows(filtered);
    };

    searchInp.oninput = applyFilter;
    cabangInp.onchange = applyFilter;
    divisiInp.onchange = applyFilter;
    statusInp.onchange = applyFilter;
  }

  /* 3. KANDIDAT & RANKING VIEW */
  function renderKandidatTab(el) {
    const cbList = masterData?.cabangList || ["HEAD OFFICE", "CABANG BANDUNG", "CABANG SURABAYA", "CABANG SEMARANG", "CABANG BALI", "WORKSHOP", "CIREBON", "KUNINGAN", "MAJALENGKA", "INDRAMAYU", "TEGAL / BREBES"];

    el.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div class="flex flex-wrap items-center gap-2">
          <input type="text" id="cand-search" placeholder="Cari nama, email, skill..." class="px-3.5 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700 w-52">
          <select id="cand-filter-pos" class="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700">
            <option value="">Semua Posisi</option>
            ${allVacancies.map(v => `<option value="${v.posisi}">${escapeHtml(v.posisi)}</option>`).join('')}
          </select>
          <select id="cand-filter-cabang" class="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700">
            <option value="">Semua Cabang/Domisili</option>
            ${cbList.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <select id="cand-filter-score" class="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700">
            <option value="">Semua Skor ATS</option>
            <option value="90">≥ 90% (Highly Recommended)</option>
            <option value="80">≥ 80% (Recommended)</option>
            <option value="70">≥ 70% (Lolos Threshold)</option>
            <option value="60">< 70% (Di Bawah Threshold)</option>
          </select>
          <select id="cand-filter-status" class="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-maroon-700">
            <option value="">Semua Status</option>
            <option value="Applied">Applied</option>
            <option value="Screening">Screening</option>
            <option value="Shortlist">Shortlist</option>
            <option value="Interview">Interview</option>
            <option value="Offered">Offered</option>
            <option value="Hired">Hired</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <th class="p-3 text-center w-12">Rank</th>
                <th class="p-3 text-left">Nama & Kontak</th>
                <th class="p-3 text-left">Posisi & Domisili</th>
                <th class="p-3 text-center">Skor ATS</th>
                <th class="p-3 text-left">Klasifikasi Rekomendasi</th>
                <th class="p-3 text-center">Status</th>
                <th class="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody id="cand-tbody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>
    </div>
    `;

    function renderCandRows(list) {
      const tbody = el.querySelector("#cand-tbody");
      if (!tbody) return;

      if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Tidak ada kandidat ditemukan. Silakan klik tombol "+ Upload / Input CV" di atas untuk menambahkan berkas lamaran.</td></tr>`;
        return;
      }

      const sorted = list.slice().sort((a,b) => (b.evaluation?.skor_ats || 0) - (a.evaluation?.skor_ats || 0));

      tbody.innerHTML = sorted.map((c, idx) => `
        <tr class="hover:bg-slate-50/70 transition">
          <td class="p-3 text-center font-bold font-mono text-slate-400">#${idx+1}</td>
          <td class="p-3">
            <p class="font-bold text-slate-800">${escapeHtml(c.nama)}</p>
            <p class="text-[11px] text-slate-500">${escapeHtml(c.email || "-")} • ${escapeHtml(c.no_hp || "-")}</p>
          </td>
          <td class="p-3 text-slate-600">
            <p class="font-medium text-slate-800">${escapeHtml(c.posisi_dilamar || "-")}</p>
            <p class="text-[11px] text-slate-400">${escapeHtml(c.domisili || "-")} • Exp: ${c.total_pengalaman_tahun || 0} Thn</p>
          </td>
          <td class="p-3 text-center">
            <span class="font-mono text-sm font-black ${(c.evaluation?.skor_ats || 0) >= 80 ? 'text-emerald-600' : 'text-blue-600'}">
              ${c.evaluation?.skor_ats || 0}%
            </span>
          </td>
          <td class="p-3">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${c.evaluation?.badge_class || 'bg-slate-100 text-slate-700'}">
              ${c.evaluation?.klasifikasi || 'Review'}
            </span>
          </td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(c.status || "Applied")}</span>
          </td>
          <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
            <button data-cand-id="${c.id}" class="px-2.5 py-1 bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg text-xs font-bold btn-open-detail cursor-pointer">
              Evaluasi & Detail
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll(".btn-open-detail").forEach(b => {
        b.onclick = () => {
          const cand = allCandidates.find(x => x.id === b.dataset.candId);
          const vac = allVacancies.find(x => x.id === cand?.lowongan_id || x.posisi === cand?.posisi_dilamar);
          openCandidateDetailModal(cand, vac, {
            onStatusChange: handleStatusChange,
            onOpenScorecard: handleOpenScorecard,
            onConvertToEmployee: handleConvertToEmployee
          });
        };
      });
    }

    renderCandRows(allCandidates);

    const sInp = el.querySelector("#cand-search");
    const pInp = el.querySelector("#cand-filter-pos");
    const cabInp = el.querySelector("#cand-filter-cabang");
    const scInp = el.querySelector("#cand-filter-score");
    const stInp = el.querySelector("#cand-filter-status");

    const filterCands = () => {
      const q = (sInp.value || "").toLowerCase();
      const pos = pInp.value;
      const cab = (cabInp.value || "").toLowerCase();
      const sc = scInp.value;
      const st = stInp.value;

      const filtered = allCandidates.filter(c => {
        const mQ = (c.nama || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.raw_text || "").toLowerCase().includes(q);
        const mPos = !pos || c.posisi_dilamar === pos;
        const mCab = !cab || (c.domisili || "").toLowerCase().includes(cab);
        const mSt = !st || c.status === st;
        let mSc = true;
        const score = c.evaluation?.skor_ats || 0;
        if (sc === "90") mSc = score >= 90;
        else if (sc === "80") mSc = score >= 80;
        else if (sc === "70") mSc = score >= 70;
        else if (sc === "60") mSc = score < 70;
        return mQ && mPos && mCab && mSt && mSc;
      });
      renderCandRows(filtered);
    };

    sInp.oninput = filterCands;
    pInp.onchange = filterCands;
    cabInp.onchange = filterCands;
    scInp.onchange = filterCands;
    stInp.onchange = filterCands;
  }

  /* 4. BULK SCREENING ATS VIEW (Drag & Drop Processing) */
  function renderScreeningTab(el) {
    el.innerHTML = `
    <div class="space-y-5">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-slate-800">Bulk Resume Screening & ATS Batch Parser</h3>
            <p class="text-xs text-slate-500 mt-0.5">Unggah beberapa file CV sekaligus (PDF/DOCX) untuk pemindaian instan tanpa API eksternal.</p>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Target Lowongan Kerja:</label>
            <select id="bulk-target-vacancy" class="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-maroon-700">
              ${allVacancies.map(v => `<option value="${v.id}">${escapeHtml(v.posisi)} (${escapeHtml(v.cabang || 'Kantor Pusat')})</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Drag & Drop Dropzone -->
        <div id="bulk-dropzone" class="border-2 border-dashed border-slate-300 hover:border-maroon-600 bg-slate-50/70 p-8 rounded-2xl text-center cursor-pointer transition">
          <input type="file" id="bulk-file-input" multiple accept=".pdf,.docx,.doc" class="hidden">
          <svg class="w-12 h-12 text-maroon-700 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          <p class="font-bold text-slate-800 text-sm">Tarik & Letakkan File CV Anda di Sini (Bulk Multi-Upload)</p>
          <p class="text-xs text-slate-500 mt-1">Mendukung format PDF Text-based & DOCX • Klik untuk memilih file dari komputer</p>
        </div>

        <!-- Progress Bar (Hidden by default) -->
        <div id="bulk-progress-wrap" class="hidden space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div class="flex justify-between text-xs font-bold text-slate-700">
            <span id="bulk-progress-status">Sedang memproses 0 dari 0 file CV...</span>
            <span id="bulk-progress-pct" class="font-mono text-maroon-700">0%</span>
          </div>
          <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div id="bulk-progress-bar" class="h-full bg-maroon-700 rounded-full transition-all duration-200" style="width: 0%"></div>
          </div>
        </div>
      </div>

      <!-- Hasil Batch Screening Table -->
      <div id="bulk-results-panel" class="hidden bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-bold text-slate-800">Hasil Pemindaian Batch ATS</h4>
            <p class="text-xs text-slate-500 mt-0.5" id="bulk-result-count">0 kandidat selesai dievaluasi</p>
          </div>
          <button type="button" id="btn-save-batch-all" class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer">
            ✓ Simpan Semua ke Database
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-slate-50 text-slate-600 uppercase font-semibold">
                <th class="p-2.5 text-left">Nama File & Kandidat</th>
                <th class="p-2.5 text-left">Pendidikan & Exp</th>
                <th class="p-2.5 text-center">Skor ATS</th>
                <th class="p-2.5 text-left">Klasifikasi</th>
                <th class="p-2.5 text-left">Evidence Matches</th>
              </tr>
            </thead>
            <tbody id="bulk-results-tbody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>
    </div>
    `;

    const dropzone = el.querySelector("#bulk-dropzone");
    const fileInp = el.querySelector("#bulk-file-input");
    const progWrap = el.querySelector("#bulk-progress-wrap");
    const progStatus = el.querySelector("#bulk-progress-status");
    const progPct = el.querySelector("#bulk-progress-pct");
    const progBar = el.querySelector("#bulk-progress-bar");
    const resPanel = el.querySelector("#bulk-results-panel");
    const resTbody = el.querySelector("#bulk-results-tbody");
    const resCount = el.querySelector("#bulk-result-count");

    let parsedBatchCandidates = [];

    dropzone.onclick = () => fileInp.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("border-maroon-700", "bg-maroon-50"); };
    dropzone.ondragleave = () => dropzone.classList.remove("border-maroon-700", "bg-maroon-50");
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove("border-maroon-700", "bg-maroon-50");
      if (e.dataTransfer.files.length > 0) {
        processFiles(Array.from(e.dataTransfer.files));
      }
    };
    fileInp.onchange = () => {
      if (fileInp.files.length > 0) {
        processFiles(Array.from(fileInp.files));
      }
    };

    async function processFiles(files) {
      if (!files.length) return;
      const targetVacId = el.querySelector("#bulk-target-vacancy").value;
      const targetVac = allVacancies.find(v => v.id === targetVacId) || allVacancies[0];

      progWrap.classList.remove("hidden");
      resPanel.classList.add("hidden");
      parsedBatchCandidates = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pct = Math.round(((i + 1) / files.length) * 100);
        progStatus.textContent = `Memproses (${i+1}/${files.length}): ${file.name}...`;
        progPct.textContent = `${pct}%`;
        progBar.style.width = `${pct}%`;

        let rawText = "";
        try {
          if (file.name.endsWith(".pdf")) {
            rawText = await extractTextFromPdfFile(file);
          } else {
            rawText = await extractTextFromDocxFile(file);
          }
        } catch (e) {
          console.warn("Gagal mengekstrak teks file:", file.name, e);
        }

        const basic = extractBasicInfo(rawText, file.name);
        const candObj = {
          id: genId("cand_"),
          lowongan_id: targetVac.id,
          posisi_dilamar: targetVac.posisi,
          nama: basic.nama,
          email: basic.email,
          no_hp: basic.no_hp,
          domisili: basic.domisili || targetVac.cabang || "HEAD OFFICE",
          pendidikan_tertinggi: basic.pendidikan_tertinggi,
          jurusan: basic.jurusan,
          sim: basic.sim,
          total_pengalaman_tahun: basic.total_pengalaman_tahun,
          riwayat_kerja: basic.riwayat_kerja,
          raw_text: rawText,
          status: "Screening",
          tanggal_lamar: new Date().toISOString()
        };

        candObj.evaluation = evaluateCandidateATS(candObj, targetVac, customSynonyms);
        candObj.ai_score = candObj.evaluation.skor_ats;
        parsedBatchCandidates.push(candObj);
      }

      progStatus.textContent = `Selesai memproses ${files.length} file CV!`;
      setTimeout(() => progWrap.classList.add("hidden"), 1000);

      // Render Hasil
      resPanel.classList.remove("hidden");
      resCount.textContent = `${parsedBatchCandidates.length} kandidat berhasil dipindai untuk posisi "${targetVac.posisi}"`;

      resTbody.innerHTML = parsedBatchCandidates.map(c => `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-2.5 font-bold text-slate-800">${escapeHtml(c.nama)}</td>
          <td class="p-2.5 text-slate-600">${escapeHtml(c.pendidikan_tertinggi)} • ${c.total_pengalaman_tahun} Thn Exp</td>
          <td class="p-2.5 text-center font-mono font-bold text-sm ${c.evaluation.skor_ats >= 80 ? 'text-emerald-600' : 'text-blue-600'}">
            ${c.evaluation.skor_ats}%
          </td>
          <td class="p-2.5">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${c.evaluation.badge_class}">
              ${c.evaluation.klasifikasi}
            </span>
          </td>
          <td class="p-2.5 text-[11px] text-slate-500 max-w-xs truncate">
            ${c.evaluation.evidence_matches.join(", ") || "-"}
          </td>
        </tr>
      `).join('');
    }

    el.querySelector("#btn-save-batch-all")?.addEventListener("click", async () => {
      if (parsedBatchCandidates.length === 0) return;
      for (const cand of parsedBatchCandidates) {
        await fsAdd(COL.PELAMAR || "pelamar_ats", cand);
        allCandidates.push(cand);
      }
      toast(`${parsedBatchCandidates.length} kandidat berhasil disimpan ke database!`, "success");
      switchTab("kandidat");
    });
  }

  /* 5. PIPELINE KANBAN BOARD */
  function renderPipelineTab(el) {
    el.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Recruitment Pipeline Kanban</h3>
          <p class="text-xs text-slate-500">Seret (drag & drop) kartu kandidat untuk memindahkan status tahapan seleksi secara instan.</p>
        </div>
        <div class="flex items-center gap-2">
          <select id="kanban-filter-vac" class="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-maroon-700">
            <option value="">Semua Lowongan (${allCandidates.length} Pelamar)</option>
            ${allVacancies.map(v => `<option value="${v.id}">${escapeHtml(v.posisi)} (${escapeHtml(v.cabang || 'Kantor Pusat')})</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="pipeline-board" class="flex gap-4 overflow-x-auto pb-4 items-start min-h-[550px] scrollbar-thin"></div>
    </div>
    `;

    function renderKanbanBoard(selectedVacId = "") {
      const board = el.querySelector("#pipeline-board");
      if (!board) return;

      const filteredCands = selectedVacId 
        ? allCandidates.filter(c => c.lowongan_id === selectedVacId || c.posisi_dilamar === (allVacancies.find(v => v.id === selectedVacId)?.posisi))
        : allCandidates;

      board.innerHTML = KANBAN_STAGES.map(stage => {
        const candsInStage = filteredCands.filter(c => c.status === stage.id);
        return `
          <div class="flex-shrink-0 w-80 bg-slate-100/70 border border-slate-200/80 rounded-2xl flex flex-col max-h-[75vh]" data-stage="${stage.id}">
            <div class="p-3.5 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-2xl">
              <h4 class="font-bold text-slate-800 text-xs tracking-wide">${stage.label}</h4>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold ${stage.badgeColor}">${candsInStage.length}</span>
            </div>
            <div class="p-3 flex-1 overflow-y-auto space-y-2.5 kanban-dropzone min-h-[140px]" data-dropzone="${stage.id}">
              ${candsInStage.length > 0 ? candsInStage.map(c => `
                <div draggable="true" data-kandidat-id="${c.id}" class="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs cursor-grab hover:border-maroon-400 hover:shadow-sm transition">
                  <div class="flex justify-between items-start mb-1">
                    <p class="text-xs font-bold text-slate-800">${escapeHtml(c.nama)}</p>
                    <span class="font-mono font-bold text-xs ${(c.evaluation?.skor_ats || 0) >= 80 ? 'text-emerald-600' : 'text-blue-600'}">${c.evaluation?.skor_ats || 0}%</span>
                  </div>
                  <p class="text-[11px] text-slate-500 mb-2">${escapeHtml(c.posisi_dilamar || "-")}</p>
                  <div class="flex justify-between items-center pt-1 border-t border-slate-100">
                    <span class="text-[10px] text-slate-400">${fmtDateShort(c.tanggal_lamar)}</span>
                    <button type="button" data-cand-id="${c.id}" class="text-[11px] font-bold text-maroon-700 hover:underline btn-kanban-detail cursor-pointer">Detail</button>
                  </div>
                </div>
              `).join('') : `
                <div class="h-full flex items-center justify-center p-4 border border-dashed border-slate-200 rounded-xl text-center min-h-[80px]">
                  <p class="text-[11px] text-slate-400 italic">Belum ada kandidat di tahap ini</p>
                </div>
              `}
            </div>
          </div>
        `;
      }).join('');

      // Bind Drag and Drop
      board.querySelectorAll("[draggable]").forEach(card => {
        card.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", card.dataset.kandidatId);
          card.classList.add("opacity-50");
        });
        card.addEventListener("dragend", () => card.classList.remove("opacity-50"));
      });

      board.querySelectorAll(".kanban-dropzone").forEach(zone => {
        zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("bg-maroon-50/60"); });
        zone.addEventListener("dragleave", () => zone.classList.remove("bg-maroon-50/60"));
        zone.addEventListener("drop", async (e) => {
          e.preventDefault();
          zone.classList.remove("bg-maroon-50/60");
          const candId = e.dataTransfer.getData("text/plain");
          const newStatus = zone.dataset.dropzone;
          await handleStatusChange(candId, newStatus);
        });
      });

      board.querySelectorAll(".btn-kanban-detail").forEach(btn => {
        btn.onclick = () => {
          const cand = allCandidates.find(x => x.id === btn.dataset.candId);
          const vac = allVacancies.find(x => x.id === cand?.lowongan_id || x.posisi === cand?.posisi_dilamar);
          openCandidateDetailModal(cand, vac, {
            onStatusChange: handleStatusChange,
            onOpenScorecard: handleOpenScorecard,
            onConvertToEmployee: handleConvertToEmployee
          });
        };
      });
    }

    renderKanbanBoard();

    const vacFilter = el.querySelector("#kanban-filter-vac");
    if (vacFilter) {
      vacFilter.onchange = () => renderKanbanBoard(vacFilter.value);
    }
  }

  /* 6. INTERVIEW & SCORECARD VIEW */
  function renderInterviewTab(el) {
    el.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Riwayat & Scorecard Interview</h3>
          <p class="text-xs text-slate-500">Evaluasi terstruktur aspek kompetensi wawancara kandidat.</p>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <th class="p-3 text-left">Nama Kandidat</th>
                <th class="p-3 text-left">Posisi</th>
                <th class="p-3 text-left">Interviewer</th>
                <th class="p-3 text-center">Tanggal</th>
                <th class="p-3 text-center">Skor Wawancara</th>
                <th class="p-3 text-center">Rekomendasi</th>
                <th class="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody id="vac-tbody" class="divide-y divide-slate-100">
              ${allInterviews.length > 0 ? allInterviews.map(sc => `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="p-3 font-bold text-slate-800">${escapeHtml(sc.kandidat_nama)}</td>
                  <td class="p-3 text-slate-600">${escapeHtml(sc.posisi)}</td>
                  <td class="p-3 text-slate-600">${escapeHtml(sc.interviewer)}</td>
                  <td class="p-3 text-center text-slate-500">${fmtDateShort(sc.tanggal)}</td>
                  <td class="p-3 text-center font-mono font-bold text-sm text-emerald-700">${sc.total_skor_interview || 0}%</td>
                  <td class="p-3 text-center">
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${sc.rekomendasi === 'Hire' ? 'bg-emerald-100 text-emerald-800' : sc.rekomendasi === 'Reject' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}">
                      ${sc.rekomendasi || 'Consider'}
                    </span>
                  </td>
                  <td class="p-3 text-right">
                    <button data-sc-cand-id="${sc.kandidat_id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold btn-view-sc cursor-pointer">
                      Buka Scorecard
                    </button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada data scorecard interview. Masuk ke tab Pipeline/Kandidat dan klik Scorecard.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    `;

    el.querySelectorAll(".btn-view-sc").forEach(b => {
      b.onclick = () => {
        const cand = allCandidates.find(x => x.id === b.dataset.scCandId);
        const vac = allVacancies.find(x => x.id === cand?.lowongan_id || x.posisi === cand?.posisi_dilamar);
        if (cand) handleOpenScorecard(cand, vac);
      };
    });
  }

  /* 7. MASTER RULES & SYNONYM DICTIONARY TAB */
  function renderRulesTab(el) {
    el.innerHTML = `
    <div class="space-y-5">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <h3 class="text-sm font-bold text-slate-800">Master Kamus Sinonim & ATS Rule Dictionary</h3>
        <p class="text-xs text-slate-500">Kamus sinonim yang digunakan oleh sistem ATS untuk mencocokkan kata kunci dalam resume secara cerdas.</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${Object.entries({ ...DEFAULT_SYNONYMS, ...customSynonyms }).map(([keyword, synonyms]) => `
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <div class="flex justify-between items-center">
                <span class="font-bold text-xs text-maroon-900 uppercase tracking-wide">${escapeHtml(keyword)}</span>
                <span class="text-[10px] text-slate-400">${synonyms.length} Istilah</span>
              </div>
              <div class="flex flex-wrap gap-1">
                ${synonyms.map(s => `<span class="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-600 font-medium">${escapeHtml(s)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    `;
  }

  /* ---------------------------------------------------------------------
   * EVENT HANDLERS (Shared across modals & pipeline)
   * ------------------------------------------------------------------- */
  async function handleStatusChange(candId, newStatus) {
    const cand = allCandidates.find(c => c.id === candId);
    if (!cand || cand.status === newStatus) return;

    cand.status = newStatus;
    await fsUpdate(COL.PELAMAR || "pelamar_ats", candId, { status: newStatus });
    toast(`Status ${cand.nama} diubah ke "${newStatus}"`, "success");
    renderActiveTab();
  }

  function handleOpenScorecard(cand, vac) {
    openInterviewScorecardModal(cand, vac, {
      onSaveScorecard: async (scorecardData) => {
        await fsAdd("interview_scorecards", scorecardData);
        allInterviews.unshift(scorecardData);
        toast("Hasil scorecard interview berhasil disimpan!", "success");
        if (scorecardData.rekomendasi === "Hire") {
          await handleStatusChange(cand.id, "Offered");
        }
      }
    });
  }

  async function handleConvertToEmployee(cand, vac) {
    confirmDialog({
      title: "Konversi ke Master Karyawan?",
      message: `Apakah Anda yakin ingin memindahkan kandidat ${cand.nama} ke Master Karyawan CV Andela Jaya? Data profil, jabatan, dan cabang akan disinkronkan secara otomatis.`,
      confirmLabel: "Ya, Konversi Karyawan",
      onConfirm: async () => {
        const newNik = `EMP-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
        const newKaryawan = {
          nik_karyawan: newNik,
          nama_karyawan: cand.nama || "",
          email: cand.email || "",
          no_hp_aktif: cand.no_hp || "",
          jabatan: cand.posisi_dilamar || vac?.posisi || "STAFF OPERASIONAL",
          divisi: vac?.departemen || "HRD & GA",
          cabang: vac?.cabang || cand.domisili || "HEAD OFFICE",
          status_karyawan: vac?.tipe_pekerjaan || "PKWT (Karyawan Kontrak)",
          pendidikan: cand.pendidikan_tertinggi || "SMA/SMK",
          atasan: vac?.hiring_manager || "MANAGER HRD",
          tanggal_join: new Date().toISOString().split('T')[0],
          aktif_tdk_aktif: "AKTIF",
          alamat: cand.domisili || "",
          created_at: new Date().toISOString()
        };

        await fsAdd(COL.MASTER_KARYAWAN || "master_karyawan", newKaryawan);
        await handleStatusChange(cand.id, "Hired");
        toast(`Kandidat ${cand.nama} berhasil dikonversi menjadi Karyawan resmi (NIK: ${newNik})!`, "success");
      }
    });
  }

  // Load awal
  loadInitialData();

  return {
    unmount: () => {
      if (unsubscribeCands) unsubscribeCands();
      if (unsubscribeVacancies) unsubscribeVacancies();
    }
  };
}
