/**
 * =====================================================================
 * KARIR.JS — Public Career & Applicant Portal Controller
 * CV Andela Jaya (Portal Rekrutmen Terbuka Tanpa Perlu Login HRIS)
 * =====================================================================
 */
import { db, COL, collection, getDocs, query, where } from "../firebase-config.js";
import { fsGetAll, fsAdd, openModal, closeModal, toast, escapeHtml, genId, fmtDateShort, fmtRupiah } from "../utils.js";
import { evaluateCandidateATS, extractBasicInfo, extractTextFromPdfFile, extractTextFromDocxFile, DEFAULT_SYNONYMS, CITIES_DICTIONARY } from "./ats-engine.js";
import { loadRecruitmentMasterData } from "./ats-ui-components.js";

export async function mount(container, { params, session }) {
  // Ensure PDF.js is loaded in background
  if (!window['pdfjs-dist/build/pdf']) {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    document.head.appendChild(script);
  }

  let allVacancies = [];
  let masterData = { divisiList: [], cabangList: [], managerList: [] };
  let selectedFilterType = "ALL";

  // Elements
  const searchInput = container.querySelector("#pub-search-kw");
  const cabangSelect = container.querySelector("#pub-filter-cabang");
  const divisiSelect = container.querySelector("#pub-filter-divisi");
  const btnSearch = container.querySelector("#pub-btn-search");
  const vacanciesGrid = container.querySelector("#pub-vacancies-grid");
  const statTotalJobs = container.querySelector("#pub-stat-total-jobs");
  const statusResult = container.querySelector("#pub-status-result");
  const statusQueryInput = container.querySelector("#pub-status-query");
  const btnCheckStatus = container.querySelector("#pub-btn-check-status");

  // Navigation scroll handlers
  container.querySelector("#pub-nav-jobs")?.addEventListener("click", () => {
    container.querySelector("#section-jobs")?.scrollIntoView({ behavior: "smooth" });
  });
  container.querySelector("#pub-nav-culture")?.addEventListener("click", () => {
    container.querySelector("#section-culture")?.scrollIntoView({ behavior: "smooth" });
  });
  container.querySelector("#pub-nav-status")?.addEventListener("click", () => {
    container.querySelector("#section-status")?.scrollIntoView({ behavior: "smooth" });
    statusQueryInput?.focus();
  });
  container.querySelector("#pub-btn-check-status-top")?.addEventListener("click", () => {
    container.querySelector("#section-status")?.scrollIntoView({ behavior: "smooth" });
    statusQueryInput?.focus();
  });

  // Type filter buttons
  container.querySelectorAll(".pub-type-btn").forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll(".pub-type-btn").forEach(b => {
        b.classList.remove("bg-maroon-700", "text-white", "active");
        b.classList.add("bg-white", "text-slate-600", "border", "border-slate-200");
      });
      btn.classList.add("bg-maroon-700", "text-white", "active");
      btn.classList.remove("bg-white", "text-slate-600", "border", "border-slate-200");
      selectedFilterType = btn.dataset.filterType;
      renderVacancies();
    };
  });

  async function loadData() {
    try {
      masterData = await loadRecruitmentMasterData().catch(() => ({ divisiList: [], cabangList: [], managerList: [] }));
      
      // Populate select options
      if (cabangSelect && masterData.cabangList) {
        masterData.cabangList.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c;
          opt.textContent = c;
          cabangSelect.appendChild(opt);
        });
      }
      if (divisiSelect && masterData.divisiList) {
        masterData.divisiList.forEach(d => {
          const opt = document.createElement("option");
          opt.value = d;
          opt.textContent = d;
          divisiSelect.appendChild(opt);
        });
      }

      // Fetch vacancies
      if (session) {
        allVacancies = await fsGetAll(COL.DATA_REKRUTMEN || "data_rekrutmen").catch(() => []);
      } else {
        const publicVacancies = query(
          collection(db, COL.DATA_REKRUTMEN || "data_rekrutmen"),
          where("status", "in", ["Open", "OPEN", "AKTIF", "Aktif", "Dibuka", "DIBUKA"])
        );
        const vacancySnap = await getDocs(publicVacancies);
        allVacancies = vacancySnap.docs.map(item => ({ ...item.data(), id: item.id, _docId: item.id }));
      }

      // If no vacancies, seed default open vacancies for immediate testing
      if (allVacancies.length === 0 && session && ["HRD", "SUPERADMIN"].includes(String(session.role || "").toUpperCase())) {
        const defaultList = [
          {
            id: "VAC-001",
            posisi: "Sales Executive Lapangan",
            departemen: "MARKETING & SALES",
            cabang: "HEAD OFFICE",
            penempatan: "HEAD OFFICE",
            tipe_pekerjaan: "PKWT (Karyawan Kontrak)",
            jumlah_kebutuhan: 2,
            hiring_manager: "GENERAL MANAGER",
            tanggal_buka: new Date().toISOString().split('T')[0],
            tanggal_tutup: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            status: "Open",
            pendidikan_min: "SMA/SMK",
            pengalaman_min: 1,
            sim_required: ["SIM C"],
            skills: ["Sales", "Negotiation", "Canvassing", "Komunikasi", "Target Sales"],
            deskripsi_tugas: "Melakukan canvassing, penawaran produk, pembukaan toko/outlet baru, serta menjaga hubungan baik dengan pelanggan setia.",
            kualifikasi_wajib: "Pria/Wanita, Usia maks. 35 tahun, memiliki sepeda motor & SIM C aktif, komunikatif dan menyukai target.",
            fasilitas_benefit: "Gaji Pokok, Insentif Penjualan Bulanan, Uang Bensin/Klaim Operasional, BPJS Ketenagakerjaan & Kesehatan.",
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
          },
          {
            id: "VAC-002",
            posisi: "Staff Accounting & Pajak",
            departemen: "FINANCE & ACCOUNTING",
            cabang: "HEAD OFFICE",
            penempatan: "HEAD OFFICE",
            tipe_pekerjaan: "Karyawan Tetap",
            jumlah_kebutuhan: 1,
            hiring_manager: "FINANCE MANAGER",
            tanggal_buka: new Date().toISOString().split('T')[0],
            tanggal_tutup: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
            status: "Open",
            pendidikan_min: "D3",
            pengalaman_min: 2,
            sim_required: [],
            skills: ["Accounting", "Pajak", "Excel", "Laporan Keuangan", "Jurnal"],
            deskripsi_tugas: "Menyusun pembukuan jurnal harian, rekonsiliasi bank, pelaporan pajak masa (PPh 21/23/PPN), dan rekapitulasi hutang piutang.",
            kualifikasi_wajib: "Pendidikan min. D3/S1 Akuntansi/Perpajakan, mahir Microsoft Excel (Vlookup/Pivot), teliti dan berintegritas tinggi.",
            fasilitas_benefit: "Gaji Pokok Kompetitif, Tunjangan Jabatan, BPJS Ketenagakerjaan & Kesehatan, Jenjang Karir.",
            ats_pass_threshold: 75,
            ats_rules: [
              { kriteria: "Pendidikan", bobot: 20, mandatory: true, key: "pendidikan" },
              { kriteria: "Pengalaman Akuntansi", bobot: 30, mandatory: true, key: "pengalaman" },
              { kriteria: "Keahlian Excel & Software", bobot: 25, mandatory: true, key: "software" },
              { kriteria: "Pemahaman Pajak", bobot: 25, mandatory: false, key: "skills" }
            ],
            created_at: new Date().toISOString()
          }
        ];
        for (const v of defaultList) {
          await fsAdd(COL.DATA_REKRUTMEN || "data_rekrutmen", v);
          allVacancies.push(v);
        }
      }

      // Filter only Open vacancies for public
      renderVacancies();

      // Deep link to specific vacancy if provided in URL params
      const deepId = params?.get("id");
      if (deepId) {
        const matched = allVacancies.find(v => v.id === deepId);
        if (matched) {
          const isOpen = (matched.status || "Open").toLowerCase() === "open" || (matched.status || "").toLowerCase() === "dibuka";
          if (isOpen) {
            openPublicVacancyDetail(matched);
          } else {
            toast("Publikasi lowongan ini telah dicabut atau sudah tidak aktif.", "warning");
          }
        }
      }

    } catch (err) {
      console.error("Gagal memuat lowongan publik:", err);
      if (vacanciesGrid) {
        vacanciesGrid.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">Gagal memuat daftar lowongan kerja. Silakan segarkan halaman.</div>`;
      }
    }
  }

  function getFilteredVacancies() {
    const kw = (searchInput?.value || "").toLowerCase().trim();
    const cVal = cabangSelect?.value || "";
    const dVal = divisiSelect?.value || "";

    return allVacancies.filter(v => {
      // Only show open vacancies to the public
      if (v.status && v.status.toLowerCase() !== "open" && v.status.toLowerCase() !== "dibuka") {
        return false;
      }

      if (kw) {
        const text = `${v.posisi || ''} ${v.departemen || ''} ${v.cabang || ''} ${(v.skills || []).join(' ')} ${v.deskripsi_tugas || ''}`.toLowerCase();
        if (!text.includes(kw)) return false;
      }

      if (cVal && v.cabang !== cVal && v.penempatan !== cVal) return false;
      if (dVal && v.departemen !== dVal) return false;

      if (selectedFilterType === "KONTRAK") {
        if (!String(v.tipe_pekerjaan || "").toUpperCase().includes("KONTRAK") && !String(v.tipe_pekerjaan || "").toUpperCase().includes("PKWT")) return false;
      } else if (selectedFilterType === "TETAP") {
        if (!String(v.tipe_pekerjaan || "").toUpperCase().includes("TETAP")) return false;
      }

      return true;
    });
  }

  function renderVacancies() {
    const list = getFilteredVacancies();
    
    if (statTotalJobs) {
      statTotalJobs.textContent = `${list.length} Lowongan Kerja Tersedia`;
    }

    if (!vacanciesGrid) return;

    if (list.length === 0) {
      vacanciesGrid.innerHTML = `
        <div class="col-span-full py-16 px-6 bg-white rounded-3xl border border-slate-200 text-center space-y-3">
          <div class="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto text-2xl">
            📂
          </div>
          <h3 class="text-base font-bold text-slate-800">Tidak Ada Lowongan yang Cocok</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Coba ubah kata kunci pencarian atau reset filter lokasi dan departemen Anda.
          </p>
          <button type="button" id="pub-btn-reset-filter" class="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">
            Reset Filter
          </button>
        </div>
      `;
      container.querySelector("#pub-btn-reset-filter")?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (cabangSelect) cabangSelect.value = "";
        if (divisiSelect) divisiSelect.value = "";
        selectedFilterType = "ALL";
        container.querySelectorAll(".pub-type-btn").forEach((b, i) => {
          if (i === 0) {
            b.classList.add("bg-maroon-700", "text-white", "active");
            b.classList.remove("bg-white", "text-slate-600");
          } else {
            b.classList.remove("bg-maroon-700", "text-white", "active");
            b.classList.add("bg-white", "text-slate-600");
          }
        });
        renderVacancies();
      });
      return;
    }

    vacanciesGrid.innerHTML = list.map(v => {
      const skills = (v.skills || []).slice(0, 3);
      return `
        <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs hover:shadow-md hover:border-maroon-300 transition-all flex flex-col justify-between space-y-4 group">
          
          <div class="space-y-3">
            <!-- Top Badges -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-maroon-50 text-maroon-700 border border-maroon-100">
                ${escapeHtml(v.departemen || "Operasional")}
              </span>
              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                ${escapeHtml(v.tipe_pekerjaan || "PKWT")}
              </span>
            </div>

            <!-- Job Title -->
            <div>
              <h3 class="text-base font-extrabold text-slate-900 group-hover:text-maroon-700 transition">
                ${escapeHtml(v.posisi)}
              </h3>
              <p class="text-xs text-slate-500 flex items-center gap-1.5 mt-1 font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-maroon-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span>${escapeHtml(v.cabang || "Kantor Pusat")}</span>
                ${v.jumlah_kebutuhan ? `<span class="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md ml-auto">Dibutuhkan ${v.jumlah_kebutuhan} Orang</span>` : ''}
              </p>
            </div>

            <!-- Quick Requirements -->
            <div class="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-[11px]">Pendidikan:</span>
                <span class="font-bold text-slate-700 text-[11px]">${escapeHtml(v.pendidikan_min || "SMA/SMK")}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-[11px]">Pengalaman:</span>
                <span class="font-bold text-slate-700 text-[11px]">${v.pengalaman_min ? `${v.pengalaman_min} Tahun` : "Fresh Graduate / Terbuka"}</span>
              </div>
            </div>

            <!-- Skill Tags -->
            ${skills.length > 0 ? `
              <div class="flex flex-wrap gap-1.5 pt-1">
                ${skills.map(s => `<span class="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-semibold text-slate-600">${escapeHtml(s)}</span>`).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Bottom Actions -->
          <div class="pt-3 border-t border-slate-100 flex items-center gap-2">
            <button type="button" data-job-id="${v.id}" class="pub-btn-detail flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer">
              <span>Detail Posisi</span>
            </button>
            <button type="button" data-job-id="${v.id}" class="pub-btn-apply flex-1 py-2.5 px-3 rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer">
              <span>Lamar Sekarang</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </button>
            <button type="button" data-job-id="${v.id}" class="pub-btn-share p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-maroon-700 hover:bg-maroon-50 transition cursor-pointer" title="Salin Tautan Lowongan">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
            </button>
          </div>

        </div>
      `;
    }).join('');

    // Bind card action buttons
    vacanciesGrid.querySelectorAll(".pub-btn-detail").forEach(btn => {
      btn.onclick = () => {
        const v = allVacancies.find(x => x.id === btn.dataset.jobId);
        if (v) openPublicVacancyDetail(v);
      };
    });

    vacanciesGrid.querySelectorAll(".pub-btn-apply").forEach(btn => {
      btn.onclick = () => {
        const v = allVacancies.find(x => x.id === btn.dataset.jobId);
        if (v) openPublicApplicationModal(v);
      };
    });

    vacanciesGrid.querySelectorAll(".pub-btn-share").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const v = allVacancies.find(x => x.id === btn.dataset.jobId);
        if (v) {
          const shareUrl = `${window.location.origin}${window.location.pathname}#karir?id=${v.id}`;
          navigator.clipboard.writeText(shareUrl).then(() => {
            toast(`Tautan lowongan ${v.posisi} berhasil disalin ke clipboard!`, "success");
          }).catch(() => {
            prompt("Salin tautan lowongan ini:", shareUrl);
          });
        }
      };
    });
  }

  // Trigger search on input change or click
  searchInput?.addEventListener("input", () => renderVacancies());
  cabangSelect?.addEventListener("change", () => renderVacancies());
  divisiSelect?.addEventListener("change", () => renderVacancies());
  btnSearch?.addEventListener("click", () => renderVacancies());

  /* ---------------------------------------------------------------------
   * MODAL DETAIL LOWONGAN KERJA
   * ------------------------------------------------------------------- */
  function openPublicVacancyDetail(v) {
    const modalContent = `
      <div class="space-y-6">
        
        <!-- Header Info -->
        <div class="border-b border-slate-100 pb-4">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-maroon-50 text-maroon-700 border border-maroon-200">${escapeHtml(v.departemen || "Operasional")}</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">${escapeHtml(v.tipe_pekerjaan || "PKWT")}</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Status: Dibuka</span>
          </div>
          <h2 class="text-xl font-extrabold text-slate-900">${escapeHtml(v.posisi)}</h2>
          <p class="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>📍 Penempatan: <strong>${escapeHtml(v.cabang || "Kantor Pusat")}</strong></span>
            ${v.tanggal_tutup ? `<span>• Batas Lamaran: <strong>${fmtDateShort(v.tanggal_tutup)}</strong></span>` : ''}
          </p>
        </div>

        <!-- Deskripsi Pekerjaan -->
        <div class="space-y-2">
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Deskripsi Tugas & Tanggung Jawab</h4>
          <div class="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 whitespace-pre-line">
            ${escapeHtml(v.deskripsi_tugas || "Melaksanakan tugas operasional dan teknis sesuai dengan standar prosedur (SOP) perusahaan CV Andela Jaya, berkoordinasi aktif dengan atasan serta tim kerja.")}
          </div>
        </div>

        <!-- Kualifikasi Utama -->
        <div class="space-y-3">
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Kualifikasi Pelamar</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
              <span class="text-slate-400 block text-[11px]">Pendidikan Minimal</span>
              <strong class="text-slate-800 font-bold">${escapeHtml(v.pendidikan_min || "SMA/SMK Sederajat")}</strong>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
              <span class="text-slate-400 block text-[11px]">Pengalaman Kerja</span>
              <strong class="text-slate-800 font-bold">${v.pengalaman_min ? `${v.pengalaman_min} Tahun di bidang terkait` : "Fresh graduate dipersilakan"}</strong>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
              <span class="text-slate-400 block text-[11px]">Kebutuhan SIM / Kendaraan</span>
              <strong class="text-slate-800 font-bold">${(v.sim_required && v.sim_required.length) ? v.sim_required.join(', ') : "Tidak wajib / Fleksibel"}</strong>
            </div>
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
              <span class="text-slate-400 block text-[11px]">Kuota Lowongan</span>
              <strong class="text-slate-800 font-bold">${v.jumlah_kebutuhan ? `${v.jumlah_kebutuhan} Orang` : "Terbuka"}</strong>
            </div>
          </div>
          ${v.kualifikasi_wajib ? `
            <div class="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100 whitespace-pre-line">
              ${escapeHtml(v.kualifikasi_wajib)}
            </div>
          ` : ''}
        </div>

        <!-- Skills & Keahlian -->
        ${(v.skills && v.skills.length > 0) ? `
          <div class="space-y-2">
            <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Keahlian yang Diutamakan</h4>
            <div class="flex flex-wrap gap-2">
              ${v.skills.map(s => `<span class="px-3 py-1 bg-maroon-50 text-maroon-800 rounded-xl text-xs font-bold border border-maroon-100">${escapeHtml(s)}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Benefit & Fasilitas -->
        <div class="space-y-2">
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Fasilitas & Keuntungan</h4>
          <div class="text-xs text-slate-600 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 leading-relaxed">
            ${escapeHtml(v.fasilitas_benefit || "Gaji pokok, insentif / komisi menarik, jaminan BPJS Ketenagakerjaan & Kesehatan, serta peluang pengembangan karir profesional di CV Andela Jaya.")}
          </div>
        </div>

        <!-- Action Footer -->
        <div class="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button type="button" id="pub-modal-btn-close" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition">
            Tutup
          </button>
          <button type="button" id="pub-modal-btn-apply" class="px-6 py-2.5 rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer">
            <span>Lamar Posisi Ini Sekarang</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </button>
        </div>

      </div>
    `;

    const m = openModal({
      title: "Detail Lowongan Kerja",
      bodyHtml: modalContent,
      size: "md"
    });
    const closeBtn = m?.querySelector("#pub-modal-btn-close");
    if (closeBtn) closeBtn.onclick = () => closeModal(m);
    const applyBtn = m?.querySelector("#pub-modal-btn-apply");
    if (applyBtn) {
      applyBtn.onclick = () => {
        closeModal(m);
        openPublicApplicationModal(v);
      };
    }
  }

  /* ---------------------------------------------------------------------
   * FORMULIR PENDAFTARAN & UPLOAD CV ONLINE (PELAMAR PUBLIK)
   * ------------------------------------------------------------------- */
  function openPublicApplicationModal(selectedVacancy = null) {
    const modalHtml = `
      <form id="pub-form-apply" class="space-y-6">
        
        <div class="bg-maroon-50/80 p-4 rounded-2xl border border-maroon-100 text-xs text-maroon-900 space-y-1">
          <p class="font-bold">Formulir Lamaran Pekerjaan — CV Andela Jaya</p>
          <p class="text-slate-600">Pastikan data yang diisi benar dan nomor WhatsApp aktif agar tim HRD dapat menghubungi Anda untuk tahapan seleksi selanjutnya.</p>
        </div>

        <!-- Pilihan Posisi Lowongan -->
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1.5">Posisi yang Dilamar *</label>
          <select id="pub-inp-vac-id" required class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
            <option value="">-- Pilih Posisi Lowongan --</option>
            ${allVacancies.map(v => `<option value="${v.id}" ${selectedVacancy && selectedVacancy.id === v.id ? 'selected' : ''}>${escapeHtml(v.posisi)} (${escapeHtml(v.cabang || 'Kantor Pusat')})</option>`).join('')}
          </select>
        </div>

        <!-- DRAG AND DROP CV UPLOADER WITH AUTO PARSER -->
        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-slate-700">Unggah Berkas CV / Resume (PDF / DOCX) *</label>
          <div id="pub-dropzone" class="border-2 border-dashed border-slate-300 hover:border-maroon-600 bg-slate-50/60 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2">
            <input type="file" id="pub-file-cv" accept=".pdf,.docx,.doc" class="hidden">
            <div class="w-12 h-12 rounded-2xl bg-white shadow-2xs border border-slate-200 text-maroon-700 flex items-center justify-center text-xl">
              📄
            </div>
            <p id="pub-file-status" class="text-xs font-bold text-slate-700">
              Tarik file CV Anda ke sini atau <span class="text-maroon-700 underline">Pilih Berkas</span>
            </p>
            <p class="text-[11px] text-slate-400">Format yang didukung: PDF, DOCX (Maksimal 10 MB)</p>
          </div>
        </div>

        <!-- DATA DIRI PELAMAR -->
        <div class="space-y-4 pt-2 border-t border-slate-100">
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider">Informasi Data Diri</h4>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap (sesuai KTP) *</label>
              <input type="text" id="pub-inp-nama" required placeholder="Nama Lengkap" 
                class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Nomor WhatsApp Aktif *</label>
              <input type="tel" id="pub-inp-hp" required placeholder="Contoh: 081234567890" 
                class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Alamat Email *</label>
              <input type="email" id="pub-inp-email" required placeholder="email.anda@gmail.com" 
                class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Domisili / Kota Saat Ini *</label>
              <input type="text" id="pub-inp-domisili" required placeholder="Contoh: Cirebon / Kuningan / dsb" 
                class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Pendidikan Terakhir *</label>
              <select id="pub-inp-pendidikan" required class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
                <option value="SMA/SMK">SMA / SMK Sederajat</option>
                <option value="D3">Diploma (D3)</option>
                <option value="S1" selected>Sarjana (S1 / D4)</option>
                <option value="S2">Magister (S2)</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Total Pengalaman Kerja (Tahun) *</label>
              <input type="number" id="pub-inp-pengalaman" min="0" max="40" step="0.5" value="1" required 
                class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Kepemilikan SIM</label>
              <div class="flex items-center gap-3 pt-1 text-xs">
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" name="pub-sim" value="SIM C" class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-600" checked>
                  <span>SIM C</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" name="pub-sim" value="SIM A" class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-600">
                  <span>SIM A</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" name="pub-sim" value="SIM B1" class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-600">
                  <span>SIM B1 / B2</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Ekspektasi Gaji Bulanan (Rp)</label>
              <input type="number" id="pub-inp-gaji" placeholder="Contoh: 3500000" 
                class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Link LinkedIn / Portofolio / Catatan Tambahan</label>
            <textarea id="pub-inp-catatan" rows="2" placeholder="Tuliskan ringkasan portofolio atau informasi pendukung lainnya..." 
              class="w-full px-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-600 focus:bg-white transition"></textarea>
          </div>
        </div>

        <!-- SUBMIT BUTTONS -->
        <div class="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button type="button" id="pub-apply-cancel" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition">
            Batal
          </button>
          <button type="submit" id="pub-apply-submit" class="px-6 py-2.5 rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer">
            <span id="pub-apply-submit-text">Kirim Lamaran Sekarang</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </button>
        </div>

      </form>
    `;

    const m = openModal({
      title: "Formulir Pendaftaran Lamaran",
      bodyHtml: modalHtml,
      size: "md"
    });
    if (!m) return;
    
    const form = m.querySelector("#pub-form-apply");
    const dropzone = m.querySelector("#pub-dropzone");
    const fileInput = m.querySelector("#pub-file-cv");
    const fileStatus = m.querySelector("#pub-file-status");
    const cancelBtn = m.querySelector("#pub-apply-cancel");
    const submitBtn = m.querySelector("#pub-apply-submit");
    const submitText = m.querySelector("#pub-apply-submit-text");

    let parsedResumeText = "";
    let uploadedFile = null;

    if (cancelBtn) cancelBtn.onclick = () => closeModal(m);

    // Drag & Drop handlers
    if (dropzone && fileInput) dropzone.onclick = () => fileInput.click();

    async function handleFileProcess(file) {
      if (!file) return;
      uploadedFile = file;
      fileStatus.innerHTML = `Membaca berkas: <strong class="text-maroon-700">${escapeHtml(file.name)}</strong>...`;

      try {
        if (file.name.toLowerCase().endsWith(".pdf")) {
          parsedResumeText = await extractTextFromPdfFile(file);
        } else {
          parsedResumeText = await extractTextFromDocxFile(file);
        }

        if (parsedResumeText) {
          const info = extractBasicInfo(parsedResumeText, file.name);
          const namaEl = m.querySelector("#pub-inp-nama");
          const hpEl = m.querySelector("#pub-inp-hp");
          const emailEl = m.querySelector("#pub-inp-email");
          const domEl = m.querySelector("#pub-inp-domisili");

          if (namaEl && !namaEl.value && info.nama) namaEl.value = info.nama;
          if (hpEl && !hpEl.value && info.no_hp) hpEl.value = info.no_hp;
          if (emailEl && !emailEl.value && info.email) emailEl.value = info.email;
          if (domEl && !domEl.value && info.domisili) domEl.value = info.domisili;

          fileStatus.innerHTML = `Berkas siap: <strong class="text-maroon-700">${escapeHtml(file.name)}</strong> (${Math.round(file.size/1024)} KB) — <span class="text-emerald-600 font-bold">✓ Data otomatis terbaca</span>`;
        } else {
          fileStatus.innerHTML = `Berkas dipilih: <strong class="text-maroon-700">${escapeHtml(file.name)}</strong> (${Math.round(file.size/1024)} KB)`;
        }
      } catch (err) {
        console.warn("Gagal mengekstrak teks resume:", err);
        fileStatus.innerHTML = `Berkas dipilih: <strong class="text-maroon-700">${escapeHtml(file.name)}</strong> (${Math.round(file.size/1024)} KB)`;
      }
    }

    fileInput.onchange = () => {
      if (fileInput.files.length > 0) handleFileProcess(fileInput.files[0]);
    };

    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("border-maroon-600", "bg-maroon-50"); };
    dropzone.ondragleave = () => dropzone.classList.remove("border-maroon-600", "bg-maroon-50");
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove("border-maroon-600", "bg-maroon-50");
      if (e.dataTransfer.files.length > 0) handleFileProcess(e.dataTransfer.files[0]);
    };

    // Submit handler
    form.onsubmit = async (e) => {
      e.preventDefault();

      const vacId = m.querySelector("#pub-inp-vac-id").value;
      const targetVac = allVacancies.find(x => x.id === vacId);
      if (!targetVac) {
        toast("Silakan pilih posisi lowongan yang dilamar", "warning");
        return;
      }

      const nama = m.querySelector("#pub-inp-nama").value.trim();
      const no_hp = m.querySelector("#pub-inp-hp").value.trim();
      const email = m.querySelector("#pub-inp-email").value.trim();
      const domisili = m.querySelector("#pub-inp-domisili").value.trim();
      const pendidikan = m.querySelector("#pub-inp-pendidikan").value;
      const pengalaman_tahun = parseFloat(m.querySelector("#pub-inp-pengalaman").value) || 0;
      const ekspektasi_gaji = parseFloat(m.querySelector("#pub-inp-gaji").value) || 0;
      const catatan = m.querySelector("#pub-inp-catatan").value.trim();

      const simChecked = Array.from(m.querySelectorAll("input[name='pub-sim']:checked")).map(x => x.value);

      // Generate Application Reference ID
      const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const regCode = `AJ-REC-${dateStr}-${randomSuffix}`;
      const candId = `CAND-${genId()}`;

      // Build candidate payload
      const candidatePayload = {
        id: candId,
        nomor_registrasi: regCode,
        nama,
        email,
        no_hp,
        domisili,
        pendidikan_terakhir: pendidikan,
        pengalaman_tahun,
        sim_dimiliki: simChecked,
        ekspektasi_gaji,
        catatan,
        posisi_dilamar: targetVac.posisi,
        lowongan_id: targetVac.id,
        cabang_penempatan: targetVac.cabang || "HEAD OFFICE",
        tanggal_lamar: new Date().toISOString(),
        status: "Applied",
        status_pemberkasan: "Lengkap",
        resume_text: parsedResumeText || `${nama} ${email} ${no_hp} ${domisili} ${pendidikan} Pengalaman ${pengalaman_tahun} tahun`,
        resume_filename: uploadedFile ? uploadedFile.name : "Resume_Online.pdf",
        source: "Portal Karir Publik",
        created_at: new Date().toISOString()
      };

      // Run ATS evaluation
      const evalResult = evaluateCandidateATS(candidatePayload, targetVac, DEFAULT_SYNONYMS);
      candidatePayload.evaluation = evalResult;
      candidatePayload.ai_score = evalResult.skor_ats;

      submitBtn.disabled = true;
      submitText.textContent = "Mengirim Berkas Lamaran...";

      try {
        // Save directly to Firestore collection
        await fsAdd(COL.PELAMAR || "pelamar_ats", candidatePayload);

        closeModal(m);
        showApplicationSuccessModal(candidatePayload, targetVac);
        
      } catch (err) {
        console.error("Gagal mengirim lamaran:", err);
        toast("Gagal mengirim lamaran: " + err.message, "error");
        submitBtn.disabled = false;
        submitText.textContent = "Kirim Lamaran Sekarang";
      }
    };
  }

  /* ---------------------------------------------------------------------
   * MODAL SUKSES KIRIM LAMARAN (DENGAN NOMOR REGISTRASI)
   * ------------------------------------------------------------------- */
  function showApplicationSuccessModal(cand, vac) {
    const successHtml = `
      <div class="text-center space-y-5 py-4">
        
        <div class="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm animate-bounce">
          ✓
        </div>

        <div class="space-y-1">
          <h2 class="text-xl font-extrabold text-slate-900">Lamaran Anda Berhasil Terkirim!</h2>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Terima kasih telah melamar posisi <strong>${escapeHtml(vac.posisi)}</strong> di CV Andela Jaya.
          </p>
        </div>

        <!-- Registration Code Box -->
        <div class="bg-slate-50 border-2 border-dashed border-maroon-300 rounded-2xl p-4 max-w-sm mx-auto space-y-1.5">
          <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nomor Registrasi Lamaran</span>
          <div class="text-lg font-black font-mono text-maroon-700 tracking-wider select-all" id="pub-success-code">
            ${cand.nomor_registrasi}
          </div>
          <p class="text-[10px] text-slate-400">Simpan nomor ini atau gunakan No. WhatsApp Anda untuk melacak status seleksi.</p>
        </div>

        <div class="pt-3 flex flex-wrap items-center justify-center gap-3">
          <button type="button" id="pub-btn-copy-reg" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            <span>Salin Nomor Registrasi</span>
          </button>
          <button type="button" id="pub-btn-finish" class="px-6 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer">
            Selesai & Tutup
          </button>
        </div>

      </div>
    `;

    const sm = openModal({
      title: "Lamaran Terkirim",
      bodyHtml: successHtml,
      size: "sm"
    });
    const finishBtn = sm?.querySelector("#pub-btn-finish");
    if (finishBtn) finishBtn.onclick = () => closeModal(sm);
    const copyBtn = sm?.querySelector("#pub-btn-copy-reg");
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(cand.nomor_registrasi).then(() => {
          toast("Nomor registrasi berhasil disalin!", "success");
        }).catch(() => {
          prompt("Nomor registrasi Anda:", cand.nomor_registrasi);
        });
      };
    }
  }

  /* ---------------------------------------------------------------------
   * FITUR CEK STATUS LAMARAN ONLINE
   * ------------------------------------------------------------------- */
  async function handleCheckStatus() {
    const q = (statusQueryInput?.value || "").trim().toLowerCase();
    if (!q) {
      toast("Masukkan No. WhatsApp atau Nomor Registrasi Anda", "warning");
      statusQueryInput?.focus();
      return;
    }

    if (!statusResult) return;
    statusResult.classList.remove("hidden");
    statusResult.innerHTML = `<div class="p-6 text-center text-slate-300 text-xs">Mencari data lamaran Anda di database CV Andela Jaya...</div>`;

    try {
      const allCands = await fsGetAll(COL.PELAMAR || "pelamar_ats").catch(() => []);
      
      const matched = allCands.filter(c => {
        const hp = String(c.no_hp || "").replace(/\D/g, '');
        const queryClean = q.replace(/\D/g, '');
        const reg = String(c.nomor_registrasi || "").toLowerCase();
        const em = String(c.email || "").toLowerCase();

        if (reg && reg.includes(q)) return true;
        if (em && em === q) return true;
        if (queryClean.length >= 6 && hp.includes(queryClean)) return true;
        return false;
      });

      if (matched.length === 0) {
        statusResult.innerHTML = `
          <div class="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 text-center space-y-2">
            <p class="text-sm font-bold text-rose-200">Data Lamaran Tidak Ditemukan</p>
            <p class="text-xs text-slate-300 max-w-md mx-auto">
              Tidak ditemukan data pelamar dengan identitas "<strong>${escapeHtml(q)}</strong>". Pastikan nomor WhatsApp atau Nomor Registrasi yang dimasukkan sudah sesuai.
            </p>
          </div>
        `;
        return;
      }

      const stages = [
        { id: "Applied", label: "Terkirim", desc: "Lamaran berhasil masuk ke sistem database HRD." },
        { id: "Screening", label: "Screening ATS", desc: "Berkas sedang dievaluasi oleh tim rekrutmen." },
        { id: "Shortlist", label: "Lolos Berkas", desc: "Kualifikasi Anda lolos seleksi awal." },
        { id: "Interview", label: "Wawancara", desc: "Tahap wawancara kerja (HR / User)." },
        { id: "Offered", label: "Penawaran", desc: "Tahap penawaran kontrak kerja (Offering)." },
        { id: "Hired", label: "Diterima", desc: "Selamat bergabung di CV Andela Jaya!" }
      ];

      statusResult.innerHTML = `
        <div class="space-y-4">
          <p class="text-xs font-bold text-rose-200">Ditemukan ${matched.length} Berkas Lamaran:</p>
          
          ${matched.map(c => {
            const currentStatus = c.status || "Applied";
            const isRejected = currentStatus.toLowerCase() === "rejected" || currentStatus.toLowerCase() === "tidak lolos";
            const currentStageIdx = stages.findIndex(s => s.id.toLowerCase() === currentStatus.toLowerCase());

            return `
              <div class="bg-white rounded-2xl p-5 text-slate-800 shadow-lg space-y-4 text-left border border-slate-200">
                
                <div class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span class="text-[10px] font-mono font-bold text-slate-400 uppercase">No. Registrasi: ${escapeHtml(c.nomor_registrasi || c.id)}</span>
                    <h3 class="text-base font-extrabold text-slate-900">${escapeHtml(c.posisi_dilamar || "Posisi Lamaran")}</h3>
                    <p class="text-xs text-slate-500">${escapeHtml(c.nama)} • ${escapeHtml(c.cabang_penempatan || "Kantor Pusat")}</p>
                  </div>
                  <span class="px-3 py-1 rounded-full text-xs font-bold ${isRejected ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}">
                    ${isRejected ? 'Belum Sesuai' : `Tahap: ${currentStatus}`}
                  </span>
                </div>

                <!-- PROGRESS STEPPER -->
                ${!isRejected ? `
                  <div class="pt-2">
                    <div class="grid grid-cols-2 sm:grid-cols-6 gap-2">
                      ${stages.map((stg, sIdx) => {
                        const isDone = sIdx <= currentStageIdx;
                        const isCurrent = sIdx === currentStageIdx;
                        return `
                          <div class="p-2.5 rounded-xl border ${isCurrent ? 'bg-maroon-50 border-maroon-300 text-maroon-800' : isDone ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400'} text-center space-y-1">
                            <div class="w-5 h-5 mx-auto rounded-full flex items-center justify-center text-[10px] font-bold ${isCurrent ? 'bg-maroon-700 text-white' : isDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}">
                              ${isDone ? '✓' : (sIdx + 1)}
                            </div>
                            <p class="text-[11px] font-bold truncate">${stg.label}</p>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : `
                  <div class="p-3 bg-red-50 rounded-xl text-xs text-red-700 border border-red-100">
                    Terima kasih atas partisipasi Anda. Saat ini kualifikasi profil Anda belum sesuai dengan kebutuhan posisi ini. Data Anda tetap tersimpan dalam basis data talent pool kami.
                  </div>
                `}

                <div class="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                  <span>Tanggal Lamar: ${fmtDateShort(c.tanggal_lamar)}</span>
                  <span class="text-maroon-700 font-bold">Tim HRD CV Andela Jaya</span>
                </div>

              </div>
            `;
          }).join('')}
        </div>
      `;

    } catch (err) {
      console.error("Gagal memeriksa status lamaran:", err);
      statusResult.innerHTML = `<div class="p-4 bg-red-50 text-red-700 text-xs rounded-xl text-center">Gagal memeriksa status lamaran. Silakan coba kembali.</div>`;
    }
  }

  btnCheckStatus?.addEventListener("click", handleCheckStatus);
  statusQueryInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCheckStatus();
  });

  // Initial load
  loadData();

  return {
    unmount: () => {}
  };
}
