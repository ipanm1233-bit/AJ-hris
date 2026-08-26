/**
 * =====================================================================
 * REKRUTMEN.JS — Full ATS & Recruitment Suite Controller
 * HRIS Andela Jaya (Corporate Modern Red-Accent Theme)
 * =====================================================================
 */
import { db, COL, collection, onSnapshot, doc, updateDoc, setDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, confirmDialog, toast, escapeHtml, genId, fmtDateShort, fmtRupiah } from "../utils.js";
import { 
  evaluateCandidateATS, 
  extractBasicInfo, 
  extractTextFromPdfFile, 
  extractTextFromDocxFile, 
  DEFAULT_SYNONYMS, 
  DEFAULT_ATS_RULES, 
  DEFAULT_INDUSTRY_EXCLUSIONS, 
  DEFAULT_INTERVIEW_TEMPLATES, 
  CITIES_DICTIONARY,
  loadAtsMasterConfig,
  saveAtsMasterConfig,
  resetAtsMasterConfig
} from "./ats-engine.js";
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
  let activeRulesSubTab = "synonyms"; // 'synonyms' | 'rules' | 'exclusions' | 'interviews'
  let selectedInterviewTplId = "tpl_sales";
  let allCandidates = [];
  let allVacancies = [];
  let allInterviews = [];
  let masterData = null;
  let atsMasterConfig = {
    synonyms: { ...DEFAULT_SYNONYMS },
    ats_rules: [ ...DEFAULT_ATS_RULES ],
    industry_exclusions: { ...DEFAULT_INDUSTRY_EXCLUSIONS },
    interview_templates: [ ...DEFAULT_INTERVIEW_TEMPLATES ],
    ats_pass_threshold: 70
  };
  let customSynonyms = {};
  let unsubscribeCands = null;
  let unsubscribeVacancies = null;

  // Render tab container layout
  const tabContentEl = container.querySelector("#ats-tab-content") || container;

  function reEvaluateAllCandidates() {
    allCandidates.forEach(cand => {
      const v = allVacancies.find(x => x.id === cand.lowongan_id || x.posisi === cand.posisi_dilamar);
      cand.evaluation = evaluateCandidateATS(cand, v, atsMasterConfig.synonyms, atsMasterConfig);
      cand.ai_score = cand.evaluation.skor_ats;
    });
  }

  async function loadInitialData() {
    try {
      masterData = await loadRecruitmentMasterData();
      atsMasterConfig = await loadAtsMasterConfig();
      customSynonyms = atsMasterConfig.synonyms;
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
          ats_pass_threshold: atsMasterConfig.ats_pass_threshold || 70,
          ats_rules: atsMasterConfig.ats_rules,
          industry_exclusions: atsMasterConfig.industry_exclusions,
          created_at: new Date().toISOString()
        };
        await fsAdd(COL.DATA_REKRUTMEN || "data_rekrutmen", defaultVac);
        allVacancies.push(defaultVac);
      }

      // Re-evaluasi kandidat dengan aturan & sinonim terbaru
      reEvaluateAllCandidates();

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
          onConvertToEmployee: handleConvertToEmployee,
          onDeleteCandidate: handleDeleteCandidate
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
            <option value="Open">Open (Dipublikasikan)</option>
            <option value="Draft">Draft (Dicabut)</option>
            <option value="Closed">Closed (Ditutup)</option>
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
                <th class="p-3 text-center">Status Publikasi</th>
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

      if (list.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="p-8 text-center text-slate-400">
              <div class="max-w-xs mx-auto space-y-2">
                <div class="text-3xl">📂</div>
                <p class="font-bold text-slate-600">Tidak ada data lowongan pekerjaan</p>
                <p class="text-[11px] text-slate-400">Coba sesuaikan kata kunci pencarian atau filter status.</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = list.map(v => {
        const vCands = allCandidates.filter(c => c.lowongan_id === v.id || c.posisi_dilamar === v.posisi);
        const vLolos = vCands.filter(c => (c.evaluation?.skor_ats || 0) >= 70).length;

        const isOpen = (v.status || "Open").toLowerCase() === "open" || (v.status || "").toLowerCase() === "dibuka";
        const isDraft = (v.status || "").toLowerCase() === "draft" || (v.status || "").toLowerCase() === "unpublished";
        const isClosed = (v.status || "").toLowerCase() === "closed" || (v.status || "").toLowerCase() === "ditutup";

        let statusBadgeHtml = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
            Publik (Open)
          </span>
        `;
        if (isDraft) {
          statusBadgeHtml = `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              Draft (Dicabut)
            </span>
          `;
        } else if (isClosed) {
          statusBadgeHtml = `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Ditutup (Closed)
            </span>
          `;
        }

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
              ${statusBadgeHtml}
            </td>
            <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
              ${isOpen ? `
                <button data-vac-id="${v.id}" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold btn-vac-unpublish cursor-pointer transition inline-flex items-center gap-1" title="Cabut publikasi dari portal karir">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                  Cabut Publikasi
                </button>
              ` : `
                <button data-vac-id="${v.id}" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold btn-vac-publish cursor-pointer transition inline-flex items-center gap-1" title="Publikasikan lowongan ke portal karir">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                  Publikasikan
                </button>
              `}
              <button data-vac-id="${v.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold btn-vac-edit cursor-pointer transition">
                Edit
              </button>
              <button data-vac-id="${v.id}" class="px-2.5 py-1 bg-maroon-50 hover:bg-maroon-100 text-maroon-800 rounded-lg text-xs font-bold btn-vac-cands cursor-pointer transition">
                Lihat Pelamar
              </button>
              <button data-vac-id="${v.id}" class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold btn-vac-delete cursor-pointer transition inline-flex items-center" title="Hapus Lowongan">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll(".btn-vac-unpublish").forEach(b => {
        b.onclick = async () => {
          const v = allVacancies.find(x => x.id === b.dataset.vacId);
          if (!v) return;
          const ok = await confirmDialog(
            `Apakah Anda yakin ingin mencabut publikasi lowongan "${v.posisi}"?\n\n• Lowongan tidak akan lagi tampil di portal karir publik bagi calon pelamar.\n• Calon pelamar baru tidak dapat mengirimkan berkas untuk posisi ini.\n• Status lowongan akan dialihkan menjadi Draft (Internal).`,
            { title: "Cabut Publikasi Lowongan", danger: true }
          );
          if (ok) {
            try {
              await fsUpdate(COL.DATA_REKRUTMEN || "data_rekrutmen", v.id, {
                status: "Draft",
                unpublished_at: new Date().toISOString()
              });
              toast(`Publikasi lowongan "${v.posisi}" berhasil dicabut (status diubah ke Draft)!`, "success");
              await loadInitialData();
            } catch (err) {
              console.error("Gagal mencabut publikasi:", err);
              toast("Gagal mencabut publikasi lowongan: " + err.message, "danger");
            }
          }
        };
      });

      tbody.querySelectorAll(".btn-vac-publish").forEach(b => {
        b.onclick = async () => {
          const v = allVacancies.find(x => x.id === b.dataset.vacId);
          if (!v) return;
          try {
            await fsUpdate(COL.DATA_REKRUTMEN || "data_rekrutmen", v.id, {
              status: "Open",
              published_at: new Date().toISOString()
            });
            toast(`Lowongan "${v.posisi}" berhasil dipublikasikan ke portal karir!`, "success");
            await loadInitialData();
          } catch (err) {
            console.error("Gagal mempublikasikan lowongan:", err);
            toast("Gagal mempublikasikan lowongan: " + err.message, "danger");
          }
        };
      });

      tbody.querySelectorAll(".btn-vac-delete").forEach(b => {
        b.onclick = async () => {
          const v = allVacancies.find(x => x.id === b.dataset.vacId);
          if (!v) return;
          const count = allCandidates.filter(c => c.lowongan_id === v.id || c.posisi_dilamar === v.posisi).length;
          const ok = await confirmDialog(
            `Apakah Anda yakin ingin menghapus data lowongan "${v.posisi}" (${v.id})?${count > 0 ? `\n\nPerhatian: Terdapat ${count} kandidat/pelamar yang terkait dengan lowongan ini.` : ''}`,
            { title: "Hapus Lowongan", danger: true }
          );
          if (ok) {
            try {
              await fsDelete(COL.DATA_REKRUTMEN || "data_rekrutmen", v.id);
              toast(`Lowongan "${v.posisi}" berhasil dihapus.`, "success");
              await loadInitialData();
            } catch (err) {
              console.error("Gagal menghapus lowongan:", err);
              toast("Gagal menghapus lowongan: " + err.message, "danger");
            }
          }
        };
      });

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
            <button data-cand-id="${c.id}" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 rounded-lg text-xs font-bold btn-delete-cand-row cursor-pointer transition" title="Hapus Data Pelamar">
              Hapus
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
            onConvertToEmployee: handleConvertToEmployee,
            onDeleteCandidate: handleDeleteCandidate
          });
        };
      });

      tbody.querySelectorAll(".btn-delete-cand-row").forEach(b => {
        b.onclick = () => {
          handleDeleteCandidate(b.dataset.candId);
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
            onConvertToEmployee: handleConvertToEmployee,
            onDeleteCandidate: handleDeleteCandidate
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
        <div class="flex items-center gap-2">
          <button type="button" id="btn-goto-interview-templates" class="px-3.5 py-2 bg-maroon-50 hover:bg-maroon-100 text-maroon-800 text-xs font-bold rounded-xl border border-maroon-200 transition inline-flex items-center gap-1.5 cursor-pointer">
            <svg class="w-4 h-4 text-maroon-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            <span>Kelola Template & Pertanyaan Wawancara</span>
          </button>
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

    const btnGoToTpls = el.querySelector("#btn-goto-interview-templates");
    if (btnGoToTpls) {
      btnGoToTpls.onclick = () => {
        switchTab("rules", "interviews");
      };
    }

    el.querySelectorAll(".btn-view-sc").forEach(b => {
      b.onclick = () => {
        const cand = allCandidates.find(x => x.id === b.dataset.scCandId);
        const vac = allVacancies.find(x => x.id === cand?.lowongan_id || x.posisi === cand?.posisi_dilamar);
        if (cand) handleOpenScorecard(cand, vac);
      };
    });
  }

  /* 7. MASTER RULES, SYNONYMS, INDUSTRY EXCLUSION & INTERVIEW QUESTIONS TAB */
  function renderRulesTab(el) {
    let synonymFilter = "";

    function renderSubTabNav() {
      return `
        <div class="flex items-center gap-2 border-b border-slate-200 pb-3 mb-5 overflow-x-auto">
          <button type="button" data-rules-subtab="synonyms" class="rules-subtab-btn px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeRulesSubTab === 'synonyms' ? 'bg-maroon-700 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            📚 Kamus Sinonim ATS (${Object.keys(atsMasterConfig.synonyms || {}).length})
          </button>
          <button type="button" data-rules-subtab="rules" class="rules-subtab-btn px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeRulesSubTab === 'rules' ? 'bg-maroon-700 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            ⚖️ Aturan Bobot ATS (${(atsMasterConfig.ats_rules || []).length})
          </button>
          <button type="button" data-rules-subtab="exclusions" class="rules-subtab-btn px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeRulesSubTab === 'exclusions' ? 'bg-maroon-700 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            🚫 Eksklusi Industri & Anti-Kompetitor
          </button>
          <button type="button" data-rules-subtab="interviews" class="rules-subtab-btn px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${activeRulesSubTab === 'interviews' ? 'bg-maroon-700 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            🎙️ Master Template & Pertanyaan Wawancara (${(atsMasterConfig.interview_templates || []).length})
          </button>
        </div>
      `;
    }

    function renderSynonymsContent() {
      const synEntries = Object.entries(atsMasterConfig.synonyms || {}).filter(([k, terms]) => {
        if (!synonymFilter) return true;
        const q = synonymFilter.toLowerCase();
        return k.toLowerCase().includes(q) || terms.some(t => t.toLowerCase().includes(q));
      });

      return `
        <div class="space-y-4">
          <!-- Top Actions -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div class="flex-1 max-w-md">
              <input type="text" id="syn-search-input" value="${escapeHtml(synonymFilter)}" placeholder="Cari kata kunci atau sinonim..." 
                class="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-maroon-600 shadow-2xs">
            </div>
            <div class="flex items-center flex-wrap gap-2">
              <button type="button" id="btn-add-syn-keyword" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer">
                <span>+ Tambah Kata Kunci Utama</span>
              </button>
              <button type="button" id="btn-reset-synonyms" class="px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition cursor-pointer">
                Reset ke Default
              </button>
            </div>
          </div>

          <!-- Cards Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${synEntries.length > 0 ? synEntries.map(([keyword, synonyms]) => `
              <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5 group hover:border-slate-300 transition">
                <div class="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-maroon-900 uppercase tracking-wide bg-maroon-50 px-2 py-0.5 rounded-lg border border-maroon-100">${escapeHtml(keyword)}</span>
                    <span class="text-[10px] text-slate-400 font-semibold">(${synonyms.length} sinonim)</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <button type="button" data-kw="${escapeHtml(keyword)}" class="p-1 text-slate-400 hover:text-maroon-700 rounded hover:bg-slate-50 btn-edit-kw cursor-pointer" title="Edit Kata Kunci">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button type="button" data-kw="${escapeHtml(keyword)}" class="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 btn-del-kw cursor-pointer" title="Hapus Kata Kunci">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>

                <div class="flex flex-wrap gap-1.5 items-center">
                  ${synonyms.map((s, sIdx) => `
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-700 font-medium group/pill">
                      <span>${escapeHtml(s)}</span>
                      <button type="button" data-kw="${escapeHtml(keyword)}" data-syn="${escapeHtml(s)}" class="text-slate-400 hover:text-rose-600 font-bold ml-0.5 btn-del-syn-pill cursor-pointer">✕</button>
                    </span>
                  `).join('')}
                  <button type="button" data-kw="${escapeHtml(keyword)}" class="px-2 py-0.5 border border-dashed border-slate-300 hover:border-maroon-700 text-slate-500 hover:text-maroon-700 rounded-lg text-[11px] font-bold transition btn-add-syn-pill cursor-pointer">
                    + Tambah Sinonim
                  </button>
                </div>
              </div>
            `).join('') : `
              <div class="col-span-2 p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs">
                Tidak ada kata kunci yang cocok dengan pencarian "${escapeHtml(synonymFilter)}".
              </div>
            `}
          </div>
        </div>
      `;
    }

    function renderRulesContent() {
      const rules = atsMasterConfig.ats_rules || [];
      const totalWeight = rules.reduce((sum, r) => sum + (parseInt(r.bobot, 10) || 0), 0);
      const isWeightValid = totalWeight === 100;

      return `
        <div class="space-y-4">
          <!-- Weight Warning & Passing Grade Threshold -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border ${isWeightValid ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'}">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs ${isWeightValid ? 'text-emerald-900' : 'text-rose-900'}">Status Bobot Penilaian ATS:</span>
                <span class="px-3 py-0.5 rounded-full text-xs font-black ${isWeightValid ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}">
                  Total: ${totalWeight}% ${isWeightValid ? '✓ (Valid)' : '⚠️ (Harus 100%)'}
                </span>
              </div>
              <p class="text-[11px] ${isWeightValid ? 'text-emerald-700' : 'text-rose-700'}">
                Total penjumlahan bobot semua kriteria penilaian harus persis 100% agar skor terbobot akurat.
              </p>
            </div>

            <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
              <label class="text-xs font-bold text-slate-700">Passing Grade Kelulusan:</label>
              <input type="number" id="inp-ats-threshold" min="30" max="95" value="${atsMasterConfig.ats_pass_threshold || 70}" 
                class="w-16 px-2 py-1 text-center font-bold text-xs bg-slate-50 border border-slate-300 rounded-lg outline-none focus:border-maroon-700">
              <span class="text-xs font-bold text-slate-500">%</span>
            </div>
          </div>

          <!-- Rules Table -->
          <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                    <th class="p-3 text-left">Nama Kriteria Penilaian</th>
                    <th class="p-3 text-left w-32">Kunci Parameter</th>
                    <th class="p-3 text-center w-28">Bobot (%)</th>
                    <th class="p-3 text-center w-28">Wajib Lolos (Mandatory)</th>
                    <th class="p-3 text-right w-20">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${rules.map((rule, idx) => `
                    <tr class="hover:bg-slate-50/70 transition">
                      <td class="p-2.5 font-bold text-slate-800">
                        <input type="text" value="${escapeHtml(rule.kriteria)}" data-idx="${idx}" class="w-full px-2 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-maroon-600 rounded-lg outline-none rule-inp-kriteria">
                      </td>
                      <td class="p-2.5 text-slate-500 font-mono text-[11px]">
                        ${escapeHtml(rule.key || `kriteria_${idx}`)}
                      </td>
                      <td class="p-2.5 text-center">
                        <input type="number" min="0" max="100" value="${rule.bobot}" data-idx="${idx}" class="w-20 px-2 py-1.5 text-center font-mono font-bold bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-maroon-600 rounded-lg outline-none rule-inp-bobot">
                      </td>
                      <td class="p-2.5 text-center">
                        <input type="checkbox" ${rule.mandatory ? 'checked' : ''} data-idx="${idx}" class="w-4 h-4 rounded border-slate-300 text-maroon-700 cursor-pointer rule-chk-mandatory">
                      </td>
                      <td class="p-2.5 text-right">
                        <button type="button" data-idx="${idx}" class="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 btn-del-rule cursor-pointer" title="Hapus Kriteria">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Bottom Actions -->
            <div class="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button type="button" id="btn-add-new-rule" class="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer">
                <span>+ Tambah Kriteria Baru</span>
              </button>

              <div class="flex items-center gap-2">
                <button type="button" id="btn-reset-rules" class="px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition cursor-pointer">
                  Reset Aturan Default
                </button>
                <button type="button" id="btn-save-rules" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer">
                  Simpan Aturan Bobot ATS
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderExclusionsContent() {
      const excl = atsMasterConfig.industry_exclusions || DEFAULT_INDUSTRY_EXCLUSIONS;
      const isEnabled = excl.enabled !== false;
      const positions = excl.affected_positions || [];
      const keywords = excl.keywords || [];

      return `
        <div class="space-y-5">
          <!-- Policy Explanation Banner -->
          <div class="p-5 bg-gradient-to-r from-rose-900 to-maroon-900 text-white rounded-2xl space-y-2 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="px-2.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-400/40 text-[10px] font-bold uppercase tracking-wider">Anti-Kompetisi & Kebijakan Industri</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="excl-enable-toggle" class="sr-only peer" ${isEnabled ? 'checked' : ''}>
                <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            <h3 class="text-base font-black">Eksklusi Kandidat Alumni Distributor / Pabrik Cat</h3>
            <p class="text-xs text-rose-100 leading-relaxed">
              Kandidat untuk posisi tertentu (seperti <strong>Sales, Canvasser, Admin, Finance, Collector</strong>) yang memiliki rekam jejak kerja di distributor cat, pabrik cat, atau brand kompetitor sejenis akan secara otomatis terdeteksi oleh ATS untuk diberi penalti skor atau diskualifikasi langsung sesuai SOP CV Andela Jaya.
            </p>
          </div>

          <!-- Configuration Form -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            <!-- Aksi & Penalti -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-800">Aksi Penanganan ATS Saat Terdeteksi:</label>
                <select id="excl-action-select" class="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-maroon-700 cursor-pointer">
                  <option value="penalty_flag" ${excl.action === 'penalty_flag' ? 'selected' : ''}>Peringatan & Penalti Nilai Skor (Direkomendasikan)</option>
                  <option value="auto_reject" ${excl.action === 'auto_reject' ? 'selected' : ''}>Auto-Reject (Gugur / Diskualifikasi Otomatis)</option>
                  <option value="warning_only" ${excl.action === 'warning_only' ? 'selected' : ''}>Hanya Catatan Peringatan Review (Tanpa Potong Skor)</option>
                </select>
                <p class="text-[11px] text-slate-500">Opsi penalti nilai akan memotong poin ATS kandidat dan memberikan badge peringatan.</p>
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-800">Besaran Penalti Skor ATS (Poin):</label>
                <div class="flex items-center gap-2">
                  <input type="number" id="excl-penalty-points" min="5" max="60" value="${excl.penalty_points || 25}" 
                    class="w-24 px-3.5 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-700 text-center font-mono">
                  <span class="text-xs font-bold text-slate-600">Poin Pelanggaran</span>
                </div>
                <p class="text-[11px] text-slate-500">Skor total ATS kandidat akan dikurangi sebesar poin ini jika terdeteksi.</p>
              </div>
            </div>

            <!-- Posisi yang Dibatasi -->
            <div class="space-y-2 pb-4 border-b border-slate-100">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-bold text-slate-800">Posisi Lowongan yang Dibatasi (Target Rules):</label>
                <span class="text-[11px] text-slate-500">${positions.length} Posisi Terdaftar</span>
              </div>
              <div class="flex flex-wrap gap-1.5 items-center p-3 bg-slate-50 rounded-xl border border-slate-200 min-h-[50px]">
                ${positions.map(p => `
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 font-bold shadow-2xs">
                    <span>${escapeHtml(p)}</span>
                    <button type="button" data-pos="${escapeHtml(p)}" class="text-slate-400 hover:text-rose-600 font-bold ml-0.5 btn-del-excl-pos cursor-pointer">✕</button>
                  </span>
                `).join('')}
              </div>
              <div class="flex items-center gap-2 pt-1">
                <input type="text" id="inp-add-excl-pos" placeholder="Ketik nama posisi (misal: Collector, Sales B2B, Kasir)..." 
                  class="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-maroon-600">
                <button type="button" id="btn-add-excl-pos" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer">
                  + Tambah Posisi
                </button>
              </div>
            </div>

            <!-- Kata Kunci / Brand Industri Kompetitor Terlarang -->
            <div class="space-y-2 pb-4 border-b border-slate-100">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-bold text-slate-800">Daftar Kata Kunci & Brand Industri Kompetitor Terlarang:</label>
                <span class="text-[11px] text-slate-500">${keywords.length} Keyword Aktif</span>
              </div>
              <div class="flex flex-wrap gap-1.5 items-center p-3 bg-rose-50/50 rounded-xl border border-rose-200 min-h-[60px]">
                ${keywords.map(kw => `
                  <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-rose-200 rounded-lg text-[11px] text-rose-900 font-bold shadow-2xs">
                    <span>${escapeHtml(kw)}</span>
                    <button type="button" data-kw="${escapeHtml(kw)}" class="text-rose-400 hover:text-rose-700 font-bold ml-0.5 btn-del-excl-kw cursor-pointer">✕</button>
                  </span>
                `).join('')}
              </div>
              <div class="flex items-center gap-2 pt-1">
                <input type="text" id="inp-add-excl-kw" placeholder="Ketik keyword terlarang (misal: Toko Cat, Cat Kayu, Mowilex, Propan, dsb)..." 
                  class="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-maroon-600">
                <button type="button" id="btn-add-excl-kw" class="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl transition cursor-pointer">
                  + Tambah Keyword
                </button>
              </div>
            </div>

            <!-- Pesan Peringatan Custom -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-slate-800">Pesan Peringatan untuk HRD / Hiring Manager:</label>
              <textarea id="excl-warning-msg" rows="2" class="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-700 leading-relaxed">${escapeHtml(excl.warning_message || "Terindikasi memiliki riwayat kerja di distributor/pabrik cat kompetitor (Dilarang untuk posisi Sales & Admin CV Andela Jaya)")}</textarea>
            </div>

            <!-- Save & Reset Action -->
            <div class="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button type="button" id="btn-reset-excl" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition cursor-pointer">
                Reset Eksklusi ke Default
              </button>
              <button type="button" id="btn-save-excl" class="px-5 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer">
                Simpan Aturan Eksklusi Industri
              </button>
            </div>
          </div>
        </div>
      `;
    }

    function renderInterviewsContent() {
      const templates = atsMasterConfig.interview_templates || DEFAULT_INTERVIEW_TEMPLATES;
      const currentTpl = templates.find(t => t.id === selectedInterviewTplId) || templates[0] || DEFAULT_INTERVIEW_TEMPLATES[0];
      const aspects = currentTpl.aspek || [];
      const totalWeight = aspects.reduce((sum, a) => sum + (parseInt(a.bobot, 10) || 0), 0);

      return `
        <div class="space-y-5">
          <!-- Template Selector Tabs -->
          <div class="flex items-center gap-2 overflow-x-auto pb-1">
            ${templates.map(tpl => `
              <button type="button" data-tpl-id="${tpl.id}" class="tpl-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${tpl.id === currentTpl.id ? 'bg-maroon-700 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}">
                ${escapeHtml(tpl.kategori_posisi)}
              </button>
            `).join('')}
            <button type="button" id="btn-add-new-tpl" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer">
              + Tambah Kategori Template
            </button>
          </div>

          <!-- Active Template Editor Card -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            <!-- Header Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-800">Nama Kategori Template Wawancara:</label>
                <input type="text" id="tpl-inp-name" value="${escapeHtml(currentTpl.kategori_posisi)}" class="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-maroon-700">
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-800">Target Posisi (Pisahkan Koma atau gunakan * untuk semua):</label>
                <input type="text" id="tpl-inp-positions" value="${escapeHtml((currentTpl.posisi_target || []).join(', '))}" class="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-700">
              </div>
            </div>

            <!-- Aspects & Interview Questions List -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-bold text-slate-800">Daftar Aspek Penilaian & Panduan Pertanyaan Interviewer:</h4>
                  <p class="text-[11px] text-slate-500">Pertanyaan panduan akan langsung tampil di formulir scorecard pewawancara.</p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-black ${totalWeight === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                  Total Bobot: ${totalWeight}%
                </span>
              </div>

              <div class="space-y-3.5" id="tpl-aspects-list">
                ${aspects.map((asp, aIdx) => `
                  <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 group hover:border-slate-300 transition" data-aspect-idx="${aIdx}">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div class="flex-1 flex items-center gap-2">
                        <span class="w-6 h-6 rounded-full bg-maroon-100 text-maroon-800 flex items-center justify-center text-[11px] font-black shrink-0">${aIdx + 1}</span>
                        <input type="text" value="${escapeHtml(asp.label || '')}" placeholder="Nama Aspek Kompetensi..." class="flex-1 px-2.5 py-1 text-xs font-bold bg-white border border-slate-200 rounded-lg outline-none focus:border-maroon-700 asp-inp-label">
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <label class="text-[11px] font-bold text-slate-600">Bobot:</label>
                        <input type="number" min="0" max="100" value="${asp.bobot || 20}" class="w-16 px-2 py-1 text-center font-bold font-mono text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-maroon-700 asp-inp-bobot">
                        <span class="text-xs font-bold text-slate-500">%</span>
                        <button type="button" data-aspect-idx="${aIdx}" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 btn-del-aspect cursor-pointer" title="Hapus Aspek Ini">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </div>

                    <div class="space-y-1">
                      <label class="block text-[11px] font-bold text-slate-600">Deskripsi Indikator Penilaian:</label>
                      <input type="text" value="${escapeHtml(asp.desc || '')}" placeholder="Uraian apa yang dinilai pada aspek ini..." class="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-maroon-700 asp-inp-desc">
                    </div>

                    <!-- Pertanyaan Panduan Wawancara (Editable) -->
                    <div class="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
                      <label class="block text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                        <span class="px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded font-black text-[10px] uppercase">🎙️ Panduan Pertanyaan Interviewer:</span>
                      </label>
                      <textarea rows="2" placeholder="Tuliskan contoh pertanyaan tajam yang harus diajukan pewawancara kepada kandidat..." class="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg outline-none focus:border-maroon-700 text-slate-800 leading-relaxed asp-inp-question">${escapeHtml(asp.pertanyaan_panduan || '')}</textarea>
                    </div>
                  </div>
                `).join('')}
              </div>

              <button type="button" id="btn-add-aspect-item" class="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-maroon-600 rounded-xl text-xs font-bold text-slate-600 hover:text-maroon-700 transition flex items-center justify-center gap-1.5 cursor-pointer">
                <span>+ Tambah Aspek & Pertanyaan Wawancara Baru</span>
              </button>
            </div>

            <!-- Bottom Actions -->
            <div class="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <button type="button" id="btn-reset-tpl" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition cursor-pointer">
                  Reset Semua Template ke Default
                </button>
                ${templates.length > 1 ? `
                  <button type="button" id="btn-delete-current-tpl" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition cursor-pointer">
                    Hapus Kategori Ini
                  </button>
                ` : ''}
              </div>

              <button type="button" id="btn-save-tpl" class="px-5 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer">
                Simpan Perubahan Template Wawancara
              </button>
            </div>
          </div>
        </div>
      `;
    }

    function renderActiveRulesSubTab() {
      let contentHtml = "";
      if (activeRulesSubTab === "synonyms") contentHtml = renderSynonymsContent();
      else if (activeRulesSubTab === "rules") contentHtml = renderRulesContent();
      else if (activeRulesSubTab === "exclusions") contentHtml = renderExclusionsContent();
      else if (activeRulesSubTab === "interviews") contentHtml = renderInterviewsContent();

      el.innerHTML = `
        <div class="space-y-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <h3 class="text-sm font-bold text-slate-800">Master Aturan ATS, Kamus Sinonim, Eksklusi & Wawancara</h3>
            <p class="text-xs text-slate-500">Konfigurasi cerdas parameter penyaringan CV, aturan pembatasan industri non-kompetisi, dan template pertanyaan interview HRIS Andela Jaya.</p>
          </div>

          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            ${renderSubTabNav()}
            <div id="rules-subtab-container">
              ${contentHtml}
            </div>
          </div>
        </div>
      `;

      bindRulesEvents();
    }

    function bindRulesEvents() {
      // Subtab switch
      el.querySelectorAll(".rules-subtab-btn").forEach(btn => {
        btn.onclick = () => {
          activeRulesSubTab = btn.dataset.rulesSubtab;
          renderActiveRulesSubTab();
        };
      });

      // --- 1. SYNONYMS EVENTS ---
      if (activeRulesSubTab === "synonyms") {
        const synSearch = el.querySelector("#syn-search-input");
        if (synSearch) {
          synSearch.oninput = (e) => {
            synonymFilter = e.target.value;
            const container = el.querySelector("#rules-subtab-container");
            if (container) {
              container.innerHTML = renderSynonymsContent();
              bindRulesEvents();
            }
          };
        }

        const btnAddKw = el.querySelector("#btn-add-syn-keyword");
        if (btnAddKw) {
          btnAddKw.onclick = () => {
            openAddSynonymModal();
          };
        }

        const btnResetSyn = el.querySelector("#btn-reset-synonyms");
        if (btnResetSyn) {
          btnResetSyn.onclick = async () => {
            const ok = await confirmDialog("Apakah Anda yakin ingin mengembalikan seluruh kamus sinonim ke standar bawaan sistem?", {
              title: "Reset Kamus Sinonim?",
              danger: true
            });
            if (!ok) return;

            atsMasterConfig.synonyms = await resetAtsMasterConfig("synonyms");
            customSynonyms = atsMasterConfig.synonyms;
            reEvaluateAllCandidates();
            toast("Kamus sinonim berhasil direset ke default!", "success");
            renderActiveRulesSubTab();
          };
        }

        el.querySelectorAll(".btn-del-kw").forEach(btn => {
          btn.onclick = async () => {
            const kw = btn.dataset.kw;
            const ok = await confirmDialog(`Kata kunci "${kw}" dan seluruh daftar sinonimnya akan dihapus dari sistem ATS. Lanjutkan?`, {
              title: `Hapus Kata Kunci "${kw}"?`,
              danger: true
            });
            if (!ok) return;

            delete atsMasterConfig.synonyms[kw];
            await saveAtsMasterConfig("synonyms", atsMasterConfig.synonyms);
            customSynonyms = atsMasterConfig.synonyms;
            reEvaluateAllCandidates();
            toast(`Kata kunci "${kw}" berhasil dihapus!`, "success");
            renderActiveRulesSubTab();
          };
        });

        el.querySelectorAll(".btn-edit-kw").forEach(btn => {
          btn.onclick = () => {
            const kw = btn.dataset.kw;
            openEditSynonymModal(kw);
          };
        });

        el.querySelectorAll(".btn-add-syn-pill").forEach(btn => {
          btn.onclick = () => {
            const kw = btn.dataset.kw;
            openAddSingleSynonymModal(kw);
          };
        });

        el.querySelectorAll(".btn-del-syn-pill").forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            const kw = btn.dataset.kw;
            const syn = btn.dataset.syn;
            atsMasterConfig.synonyms[kw] = atsMasterConfig.synonyms[kw].filter(s => s !== syn);
            await saveAtsMasterConfig("synonyms", atsMasterConfig.synonyms);
            customSynonyms = atsMasterConfig.synonyms;
            reEvaluateAllCandidates();
            renderActiveRulesSubTab();
          };
        });
      }

      // --- 2. RULES EVENTS ---
      if (activeRulesSubTab === "rules") {
        const btnAddRule = el.querySelector("#btn-add-new-rule");
        if (btnAddRule) {
          btnAddRule.onclick = () => {
            openAddRuleModal();
          };
        }

        el.querySelectorAll(".btn-del-rule").forEach(btn => {
          btn.onclick = () => {
            const idx = parseInt(btn.dataset.idx, 10);
            atsMasterConfig.ats_rules.splice(idx, 1);
            renderActiveRulesSubTab();
          };
        });

        const btnSaveRules = el.querySelector("#btn-save-rules");
        if (btnSaveRules) {
          btnSaveRules.onclick = async () => {
            const updatedRules = [];
            el.querySelectorAll("tbody tr").forEach((tr, idx) => {
              const kInp = tr.querySelector(".rule-inp-kriteria");
              const bInp = tr.querySelector(".rule-inp-bobot");
              const mChk = tr.querySelector(".rule-chk-mandatory");
              if (kInp && bInp) {
                const kriteria = kInp.value.trim() || `Kriteria #${idx+1}`;
                const bobot = parseInt(bInp.value, 10) || 0;
                const mandatory = mChk ? mChk.checked : false;
                const origKey = atsMasterConfig.ats_rules[idx]?.key || kriteria.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                updatedRules.push({ kriteria, bobot, mandatory, key: origKey });
              }
            });

            const thresholdInp = el.querySelector("#inp-ats-threshold");
            if (thresholdInp) {
              atsMasterConfig.ats_pass_threshold = parseInt(thresholdInp.value, 10) || 70;
              await saveAtsMasterConfig("ats_pass_threshold", atsMasterConfig.ats_pass_threshold);
            }

            atsMasterConfig.ats_rules = updatedRules;
            await saveAtsMasterConfig("ats_rules", updatedRules);
            reEvaluateAllCandidates();
            toast("Aturan bobot & kriteria ATS berhasil disimpan!", "success");
            renderActiveRulesSubTab();
          };
        }

        const btnResetRules = el.querySelector("#btn-reset-rules");
        if (btnResetRules) {
          btnResetRules.onclick = async () => {
            const ok = await confirmDialog("Kembalikan kriteria bobot dan passing threshold ke konfigurasi standar?", {
              title: "Reset Aturan Bobot ATS?",
              danger: true
            });
            if (!ok) return;

            atsMasterConfig.ats_rules = await resetAtsMasterConfig("ats_rules");
            atsMasterConfig.ats_pass_threshold = await resetAtsMasterConfig("ats_pass_threshold");
            reEvaluateAllCandidates();
            toast("Aturan bobot berhasil direset ke default!", "success");
            renderActiveRulesSubTab();
          };
        }
      }

      // --- 3. EXCLUSIONS EVENTS ---
      if (activeRulesSubTab === "exclusions") {
        const toggle = el.querySelector("#excl-enable-toggle");
        if (toggle) {
          toggle.onchange = () => {
            atsMasterConfig.industry_exclusions.enabled = toggle.checked;
          };
        }

        const btnAddPos = el.querySelector("#btn-add-excl-pos");
        const inpPos = el.querySelector("#inp-add-excl-pos");
        if (btnAddPos && inpPos) {
          const doAddPos = () => {
            const val = inpPos.value.trim().toLowerCase();
            if (!val) return;
            if (!atsMasterConfig.industry_exclusions.affected_positions) {
              atsMasterConfig.industry_exclusions.affected_positions = [];
            }
            if (!atsMasterConfig.industry_exclusions.affected_positions.includes(val)) {
              atsMasterConfig.industry_exclusions.affected_positions.push(val);
              inpPos.value = "";
              renderActiveRulesSubTab();
            }
          };
          btnAddPos.onclick = doAddPos;
          inpPos.onkeydown = (e) => { if (e.key === "Enter") doAddPos(); };
        }

        el.querySelectorAll(".btn-del-excl-pos").forEach(btn => {
          btn.onclick = () => {
            const p = btn.dataset.pos;
            atsMasterConfig.industry_exclusions.affected_positions = (atsMasterConfig.industry_exclusions.affected_positions || []).filter(x => x !== p);
            renderActiveRulesSubTab();
          };
        });

        const btnAddKw = el.querySelector("#btn-add-excl-kw");
        const inpKw = el.querySelector("#inp-add-excl-kw");
        if (btnAddKw && inpKw) {
          const doAddKw = () => {
            const val = inpKw.value.trim().toLowerCase();
            if (!val) return;
            if (!atsMasterConfig.industry_exclusions.keywords) {
              atsMasterConfig.industry_exclusions.keywords = [];
            }
            if (!atsMasterConfig.industry_exclusions.keywords.includes(val)) {
              atsMasterConfig.industry_exclusions.keywords.push(val);
              inpKw.value = "";
              renderActiveRulesSubTab();
            }
          };
          btnAddKw.onclick = doAddKw;
          inpKw.onkeydown = (e) => { if (e.key === "Enter") doAddKw(); };
        }

        el.querySelectorAll(".btn-del-excl-kw").forEach(btn => {
          btn.onclick = () => {
            const kw = btn.dataset.kw;
            atsMasterConfig.industry_exclusions.keywords = (atsMasterConfig.industry_exclusions.keywords || []).filter(x => x !== kw);
            renderActiveRulesSubTab();
          };
        });

        const btnSaveExcl = el.querySelector("#btn-save-excl");
        if (btnSaveExcl) {
          btnSaveExcl.onclick = async () => {
            const actionSel = el.querySelector("#excl-action-select");
            const ptsInp = el.querySelector("#excl-penalty-points");
            const warnText = el.querySelector("#excl-warning-msg");
            const toggle = el.querySelector("#excl-enable-toggle");

            atsMasterConfig.industry_exclusions.enabled = toggle ? toggle.checked : true;
            atsMasterConfig.industry_exclusions.action = actionSel ? actionSel.value : "penalty_flag";
            atsMasterConfig.industry_exclusions.penalty_points = ptsInp ? parseInt(ptsInp.value, 10) || 25 : 25;
            atsMasterConfig.industry_exclusions.warning_message = warnText ? warnText.value.trim() : "";

            await saveAtsMasterConfig("industry_exclusions", atsMasterConfig.industry_exclusions);
            reEvaluateAllCandidates();
            toast("Aturan eksklusi industri alumni distributor cat berhasil disimpan!", "success");
            renderActiveRulesSubTab();
          };
        }

        const btnResetExcl = el.querySelector("#btn-reset-excl");
        if (btnResetExcl) {
          btnResetExcl.onclick = async () => {
            const ok = await confirmDialog("Kembalikan parameter eksklusi industri ke pengaturan bawaan CV Andela Jaya?", {
              title: "Reset Aturan Eksklusi?",
              danger: true
            });
            if (!ok) return;

            atsMasterConfig.industry_exclusions = await resetAtsMasterConfig("industry_exclusions");
            reEvaluateAllCandidates();
            toast("Aturan eksklusi berhasil direset!", "success");
            renderActiveRulesSubTab();
          };
        }
      }

      // --- 4. INTERVIEWS EVENTS ---
      if (activeRulesSubTab === "interviews") {
        el.querySelectorAll(".tpl-tab-btn").forEach(btn => {
          btn.onclick = () => {
            selectedInterviewTplId = btn.dataset.tplId;
            renderActiveRulesSubTab();
          };
        });

        const btnAddNewTpl = el.querySelector("#btn-add-new-tpl");
        if (btnAddNewTpl) {
          btnAddNewTpl.onclick = () => {
            openAddInterviewTemplateModal();
          };
        }

        const btnAddAspect = el.querySelector("#btn-add-aspect-item");
        if (btnAddAspect) {
          btnAddAspect.onclick = () => {
            const tpl = atsMasterConfig.interview_templates.find(t => t.id === selectedInterviewTplId);
            if (tpl) {
              if (!tpl.aspek) tpl.aspek = [];
              tpl.aspek.push({
                key: "aspek_" + Date.now(),
                label: "Aspek Penilaian Baru",
                desc: "Deskripsi indikator penilaian wawancara.",
                pertanyaan_panduan: "Panduan pertanyaan interviewer...",
                bobot: 20
              });
              renderActiveRulesSubTab();
            }
          };
        }

        el.querySelectorAll(".btn-del-aspect").forEach(btn => {
          btn.onclick = () => {
            const aIdx = parseInt(btn.dataset.aspectIdx, 10);
            const tpl = atsMasterConfig.interview_templates.find(t => t.id === selectedInterviewTplId);
            if (tpl && tpl.aspek) {
              tpl.aspek.splice(aIdx, 1);
              renderActiveRulesSubTab();
            }
          };
        });

        const btnSaveTpl = el.querySelector("#btn-save-tpl");
        if (btnSaveTpl) {
          btnSaveTpl.onclick = async () => {
            const tpl = atsMasterConfig.interview_templates.find(t => t.id === selectedInterviewTplId);
            if (!tpl) return;

            const nameInp = el.querySelector("#tpl-inp-name");
            const posInp = el.querySelector("#tpl-inp-positions");
            if (nameInp) tpl.kategori_posisi = nameInp.value.trim();
            if (posInp) {
              tpl.posisi_target = posInp.value.split(",").map(p => p.trim()).filter(Boolean);
            }

            const updatedAspects = [];
            el.querySelectorAll("#tpl-aspects-list [data-aspect-idx]").forEach((card, idx) => {
              const lbl = card.querySelector(".asp-inp-label")?.value.trim() || `Aspek #${idx+1}`;
              const bbt = parseInt(card.querySelector(".asp-inp-bobot")?.value, 10) || 20;
              const dsc = card.querySelector(".asp-inp-desc")?.value.trim() || "";
              const qst = card.querySelector(".asp-inp-question")?.value.trim() || "";
              const origKey = tpl.aspek[idx]?.key || ("asp_" + idx);

              updatedAspects.push({
                key: origKey,
                label: lbl,
                desc: dsc,
                pertanyaan_panduan: qst,
                bobot: bbt
              });
            });

            tpl.aspek = updatedAspects;
            await saveAtsMasterConfig("interview_templates", atsMasterConfig.interview_templates);
            toast("Template wawancara & pertanyaan interviewer berhasil disimpan!", "success");
            renderActiveRulesSubTab();
          };
        }

        const btnDelCurrentTpl = el.querySelector("#btn-delete-current-tpl");
        if (btnDelCurrentTpl) {
          btnDelCurrentTpl.onclick = async () => {
            const ok = await confirmDialog("Apakah Anda yakin ingin menghapus kategori template ini?", {
              title: "Hapus Kategori Template?",
              danger: true
            });
            if (!ok) return;

            atsMasterConfig.interview_templates = atsMasterConfig.interview_templates.filter(t => t.id !== selectedInterviewTplId);
            selectedInterviewTplId = atsMasterConfig.interview_templates[0]?.id || "tpl_sales";
            await saveAtsMasterConfig("interview_templates", atsMasterConfig.interview_templates);
            toast("Template berhasil dihapus!", "success");
            renderActiveRulesSubTab();
          };
        }

        const btnResetTpl = el.querySelector("#btn-reset-tpl");
        if (btnResetTpl) {
          btnResetTpl.onclick = async () => {
            const ok = await confirmDialog("Kembalikan seluruh template wawancara dan panduan pertanyaan ke format standar?", {
              title: "Reset Semua Template Wawancara?",
              danger: true
            });
            if (!ok) return;

            atsMasterConfig.interview_templates = await resetAtsMasterConfig("interview_templates");
            selectedInterviewTplId = "tpl_sales";
            toast("Template interview berhasil direset ke default!", "success");
            renderActiveRulesSubTab();
          };
        }
      }
    }

    /* ---------------------------------------------------------------------
     * MODAL BUILDERS UNTUK EDIT RULES & KAMUS SINONIM
     * ------------------------------------------------------------------- */
    function openAddSynonymModal() {
      const modalHtml = `
        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Kata Kunci Utama <span class="text-red-500">*</span></label>
            <input type="text" id="inp-add-main-kw" placeholder="Contoh: logistik, supervisor, perpajakan, audit..." class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 font-bold text-slate-800" />
            <p class="text-[11px] text-slate-500 mt-1">Kata kunci utama ini menjadi acuan klasifikasi keahlian dalam evaluasi ATS.</p>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Daftar Sinonim / Variasi Kata Terkait</label>
            <textarea id="inp-add-syn-list" rows="4" placeholder="Contoh: pergudangan, warehouse, gudang, inventaris, stock opname, fifo..." class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 text-slate-700"></textarea>
            <p class="text-[11px] text-slate-500 mt-1">Pisahkan setiap kata atau frasa dengan tanda koma ( , ). Kata kunci utama otomatis disertakan.</p>
          </div>
        </div>
      `;

      const footerHtml = `
        <div class="flex justify-end gap-2 w-full">
          <button type="button" id="btn-cancel-add-syn" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">Batal</button>
          <button type="button" id="btn-save-add-syn" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Simpan Kata Kunci
          </button>
        </div>
      `;

      openModal({
        title: "Tambah Kata Kunci & Sinonim Baru",
        size: "md",
        bodyHtml: modalHtml,
        footerHtml: footerHtml,
        onMount: (m) => {
          m.querySelector("#btn-cancel-add-syn").onclick = closeModal;
          m.querySelector("#btn-save-add-syn").onclick = async () => {
            const rawKw = (m.querySelector("#inp-add-main-kw").value || "").trim().toLowerCase();
            if (!rawKw) {
              toast("Harap masukkan nama kata kunci utama!", "warning");
              return;
            }

            const synRaw = (m.querySelector("#inp-add-syn-list").value || "").trim().toLowerCase();
            let synList = synRaw ? synRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
            if (!synList.includes(rawKw)) {
              synList.unshift(rawKw);
            }

            atsMasterConfig.synonyms[rawKw] = synList;
            await saveAtsMasterConfig("synonyms", atsMasterConfig.synonyms);
            customSynonyms = atsMasterConfig.synonyms;
            reEvaluateAllCandidates();
            closeModal();
            toast(`Kata kunci utama "${rawKw}" dan sinonimnya berhasil disimpan!`, "success");
            renderActiveRulesSubTab();
          };
        }
      });
    }

    function openEditSynonymModal(kw) {
      const currentSynonyms = atsMasterConfig.synonyms[kw] || [];
      const modalHtml = `
        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Kata Kunci Utama</label>
            <input type="text" id="inp-edit-main-kw" value="${escapeHtml(kw)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 font-bold text-slate-800 bg-slate-50" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Daftar Sinonim / Variasi Kata Terkait</label>
            <textarea id="inp-edit-syn-list" rows="5" class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 text-slate-700 leading-relaxed">${escapeHtml(currentSynonyms.join(", "))}</textarea>
            <p class="text-[11px] text-slate-500 mt-1">Pisahkan setiap kata atau frasa sinonim dengan tanda koma ( , ).</p>
          </div>
        </div>
      `;

      const footerHtml = `
        <div class="flex justify-end gap-2 w-full">
          <button type="button" id="btn-cancel-edit-syn" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">Batal</button>
          <button type="button" id="btn-save-edit-syn" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Simpan Perubahan
          </button>
        </div>
      `;

      openModal({
        title: `Edit Kata Kunci & Sinonim: "${kw}"`,
        size: "md",
        bodyHtml: modalHtml,
        footerHtml: footerHtml,
        onMount: (m) => {
          m.querySelector("#btn-cancel-edit-syn").onclick = closeModal;
          m.querySelector("#btn-save-edit-syn").onclick = async () => {
            const newKw = (m.querySelector("#inp-edit-main-kw").value || "").trim().toLowerCase();
            if (!newKw) {
              toast("Kata kunci utama tidak boleh kosong!", "warning");
              return;
            }

            const synRaw = (m.querySelector("#inp-edit-syn-list").value || "").trim().toLowerCase();
            let synList = synRaw ? synRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
            if (!synList.includes(newKw)) {
              synList.unshift(newKw);
            }

            if (newKw !== kw) {
              delete atsMasterConfig.synonyms[kw];
            }
            atsMasterConfig.synonyms[newKw] = synList;
            await saveAtsMasterConfig("synonyms", atsMasterConfig.synonyms);
            customSynonyms = atsMasterConfig.synonyms;
            reEvaluateAllCandidates();
            closeModal();
            toast(`Kamus sinonim "${newKw}" berhasil diperbarui!`, "success");
            renderActiveRulesSubTab();
          };
        }
      });
    }

    function openAddSingleSynonymModal(kw) {
      const modalHtml = `
        <div class="space-y-3 text-xs">
          <p class="text-slate-600">Tambahkan kata atau frasa sinonim baru untuk kata kunci utama <strong class="text-maroon-700">${escapeHtml(kw)}</strong>:</p>
          <input type="text" id="inp-single-syn" placeholder="Misal: team leader, koordinator lapangan..." class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 font-medium text-slate-800" />
        </div>
      `;
      const footerHtml = `
        <div class="flex justify-end gap-2 w-full">
          <button type="button" id="btn-cancel-single-syn" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer">Batal</button>
          <button type="button" id="btn-save-single-syn" class="px-3 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-sm">+ Tambahkan</button>
        </div>
      `;
      openModal({
        title: `Tambah Sinonim: "${kw}"`,
        size: "sm",
        bodyHtml: modalHtml,
        footerHtml: footerHtml,
        onMount: (m) => {
          const inp = m.querySelector("#inp-single-syn");
          setTimeout(() => inp?.focus(), 100);
          m.querySelector("#btn-cancel-single-syn").onclick = closeModal;
          const doSave = async () => {
            const val = (inp?.value || "").trim().toLowerCase();
            if (!val) return;
            if (!atsMasterConfig.synonyms[kw]) atsMasterConfig.synonyms[kw] = [kw];
            if (!atsMasterConfig.synonyms[kw].includes(val)) {
              atsMasterConfig.synonyms[kw].push(val);
              await saveAtsMasterConfig("synonyms", atsMasterConfig.synonyms);
              customSynonyms = atsMasterConfig.synonyms;
              reEvaluateAllCandidates();
              closeModal();
              toast(`Sinonim "${val}" berhasil ditambahkan ke "${kw}"!`, "success");
              renderActiveRulesSubTab();
            } else {
              toast(`Sinonim "${val}" sudah ada dalam daftar!`, "warning");
            }
          };
          m.querySelector("#btn-save-single-syn").onclick = doSave;
          inp.onkeydown = (e) => { if (e.key === "Enter") doSave(); };
        }
      });
    }

    function openAddRuleModal() {
      const modalHtml = `
        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Nama Kriteria Penilaian <span class="text-red-500">*</span></label>
            <input type="text" id="inp-rule-name" placeholder="Contoh: Sertifikasi Keahlian, Usia, Pengalaman Lapangan..." class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 font-bold text-slate-800" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Bobot Nilai (%)</label>
              <input type="number" id="inp-rule-bobot" value="15" min="1" max="100" class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 font-bold text-slate-800" />
            </div>
            <div class="flex items-center pt-5">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="chk-rule-mandatory" class="w-4 h-4 rounded text-maroon-700 focus:ring-maroon-700 cursor-pointer" />
                <span class="font-bold text-slate-700">Wajib Dipenuhi (Mandatory)</span>
              </label>
            </div>
          </div>
        </div>
      `;
      const footerHtml = `
        <div class="flex justify-end gap-2 w-full">
          <button type="button" id="btn-cancel-add-rule" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">Batal</button>
          <button type="button" id="btn-save-add-rule" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm">
            + Tambah Kriteria
          </button>
        </div>
      `;
      openModal({
        title: "Tambah Kriteria Bobot ATS",
        size: "md",
        bodyHtml: modalHtml,
        footerHtml: footerHtml,
        onMount: (m) => {
          m.querySelector("#btn-cancel-add-rule").onclick = closeModal;
          m.querySelector("#btn-save-add-rule").onclick = async () => {
            const name = (m.querySelector("#inp-rule-name").value || "").trim();
            if (!name) {
              toast("Harap masukkan nama kriteria penilaian!", "warning");
              return;
            }
            const bobot = parseInt(m.querySelector("#inp-rule-bobot").value, 10) || 10;
            const mandatory = m.querySelector("#chk-rule-mandatory").checked;
            const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

            atsMasterConfig.ats_rules.push({
              kriteria: name,
              bobot,
              mandatory,
              key
            });
            await saveAtsMasterConfig("ats_rules", atsMasterConfig.ats_rules);
            reEvaluateAllCandidates();
            closeModal();
            toast(`Kriteria "${name}" berhasil ditambahkan!`, "success");
            renderActiveRulesSubTab();
          };
        }
      });
    }

    function openAddInterviewTemplateModal() {
      const modalHtml = `
        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Nama Kategori Template <span class="text-red-500">*</span></label>
            <input type="text" id="inp-new-tpl-name" placeholder="Contoh: Staff IT, Legal & Compliance, Teknisi Pabrik..." class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 font-bold text-slate-800" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Posisi Target (pisahkan dengan koma)</label>
            <input type="text" id="inp-new-tpl-pos" placeholder="Contoh: IT Support, Programmer, Network Engineer..." class="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-maroon-700 text-slate-800" />
          </div>
        </div>
      `;
      const footerHtml = `
        <div class="flex justify-end gap-2 w-full">
          <button type="button" id="btn-cancel-add-tpl" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">Batal</button>
          <button type="button" id="btn-save-add-tpl" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">
            Buat Kategori Template
          </button>
        </div>
      `;
      openModal({
        title: "Buat Kategori Template Wawancara Baru",
        size: "md",
        bodyHtml: modalHtml,
        footerHtml: footerHtml,
        onMount: (m) => {
          m.querySelector("#btn-cancel-add-tpl").onclick = closeModal;
          m.querySelector("#btn-save-add-tpl").onclick = async () => {
            const name = (m.querySelector("#inp-new-tpl-name").value || "").trim();
            if (!name) {
              toast("Harap masukkan nama kategori template!", "warning");
              return;
            }
            const posRaw = (m.querySelector("#inp-new-tpl-pos").value || "").trim();
            const posList = posRaw ? posRaw.split(",").map(p => p.trim()).filter(Boolean) : [name];
            const newId = "tpl_" + Date.now();

            atsMasterConfig.interview_templates.push({
              id: newId,
              kategori_posisi: name,
              posisi_target: posList,
              aspek: [
                {
                  key: "kompetensi_teknis",
                  label: "Kompetensi & Pemahaman Kerja",
                  desc: "Penguasaan keahlian teknis sesuai posisi yang dilamar.",
                  pertanyaan_panduan: "Ceritakan proyek atau pekerjaan paling menantang yang pernah Anda selesaikan?",
                  bobot: 50
                },
                {
                  key: "attitude_kerja",
                  label: "Attitude, Loyalitas & Kerja Sama Tim",
                  desc: "Sikap kerja profesional, kejujuran, dan komunikasi tim.",
                  pertanyaan_panduan: "Bagaimana cara Anda menyelesaikan kendala kerja saat tenggat waktu mendesak?",
                  bobot: 50
                }
              ]
            });
            selectedInterviewTplId = newId;
            await saveAtsMasterConfig("interview_templates", atsMasterConfig.interview_templates);
            closeModal();
            toast("Kategori template wawancara baru berhasil dibuat!", "success");
            renderActiveRulesSubTab();
          };
        }
      });
    }

    renderActiveRulesSubTab();
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

  async function handleDeleteCandidate(candId) {
    const cand = allCandidates.find(c => c.id === candId);
    if (!cand) return;

    const ok = await confirmDialog(`Apakah Anda yakin ingin menghapus data pelamar "${cand.nama || 'Kandidat'}" secara permanen dari sistem?`, {
      title: "Hapus Data Pelamar",
      danger: true
    });
    if (!ok) return;

    try {
      await fsDelete(COL.PELAMAR || "pelamar_ats", candId);
      allCandidates = allCandidates.filter(c => c.id !== candId);
      closeModal();
      toast(`Data pelamar "${cand.nama}" berhasil dihapus`, "success");
      updateBadges();
      renderActiveTab();
    } catch (e) {
      console.error("Gagal menghapus data pelamar:", e);
      toast("Gagal menghapus data pelamar", "error");
    }
  }

  function handleOpenScorecard(cand, vac) {
    openInterviewScorecardModal(cand, vac, {
      masterTemplates: atsMasterConfig.interview_templates,
      onSaveScorecard: async (scorecardData) => {
        await fsAdd("interview_scorecards", scorecardData);
        allInterviews.unshift(scorecardData);
        toast("Hasil scorecard interview berhasil disimpan!", "success");
        if (scorecardData.rekomendasi === "Hire") {
          await handleStatusChange(cand.id, "Offered");
        }
        updateBadges();
      }
    });
  }

  async function handleConvertToEmployee(cand, vac) {
    const ok = await confirmDialog(`Apakah Anda yakin ingin memindahkan kandidat ${cand.nama} ke Master Karyawan CV Andela Jaya? Data profil, jabatan, dan cabang akan disinkronkan secara otomatis.`, {
      title: "Konversi ke Master Karyawan?",
      danger: false
    });
    if (!ok) return;

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

  // Load awal
  loadInitialData();

  return {
    unmount: () => {
      if (unsubscribeCands) unsubscribeCands();
      if (unsubscribeVacancies) unsubscribeVacancies();
    }
  };
}
