/**
 * =====================================================================
 * ATS-UI-COMPONENTS.JS — Modular UI Modals, Wizards & Scorecards for ATS
 * HRIS Andela Jaya (Corporate Modern Red-Accent Theme)
 * =====================================================================
 */
import { COL } from "../firebase-config.js";
import { openModal, closeModal, toast, escapeHtml, genId, fmtDateShort, fsGetAll } from "../utils.js";
import { evaluateCandidateATS, extractBasicInfo, extractTextFromPdfFile, extractTextFromDocxFile, DEFAULT_SYNONYMS, DEFAULT_ATS_RULES, DEFAULT_INTERVIEW_TEMPLATES, DEFAULT_INDUSTRY_EXCLUSIONS } from "./ats-engine.js";

/**
 * Helper untuk memuat Master Data terintegrasi (Cabang, Divisi/Departemen, Jabatan, Atasan/Manager, Status, Pendidikan)
 */
export async function loadRecruitmentMasterData() {
  const defaultCabang = ["HEAD OFFICE", "CABANG BANDUNG", "CABANG SURABAYA", "CABANG SEMARANG", "CABANG BALI", "WORKSHOP", "CIREBON", "KUNINGAN", "MAJALENGKA", "INDRAMAYU", "TEGAL / BREBES"];
  const defaultDivisi = ["HRD & GA", "FINANCE & ACCOUNTING", "OPERASIONAL", "MARKETING & SALES", "IT & DIGITAL", "LOGISTIK & GUDANG", "PRODUKSI", "SALES & DISTRIBUTION"];
  const defaultJabatan = ["DIREKTUR", "GENERAL MANAGER", "MANAGER HRD", "SUPERVISOR", "STAFF HRD", "STAFF FINANCE", "STAFF OPERASIONAL", "SALES EXECUTIVE LAPANGAN", "SALES REPRESENTATIVE", "ADMIN GUDANG", "DRIVER / EXPEDISI", "SECURITY", "HEAD STORE", "STORE ASSOCIATE", "DIGITAL MARKETING SPECIALIST"];
  const defaultManagers = ["DIREKTUR", "GENERAL MANAGER", "MANAGER HRD", "SUPERVISOR OPERASIONAL", "KABAG SALES", "HEAD STORE", "KEPALA GUDANG"];
  const tipePekerjaanList = ["PKWT (Karyawan Kontrak)", "PKWTT (Karyawan Tetap)", "Probation (Masa Percobaan)", "Magang / Internship", "Buruh Harian / Harian Lepas", "Outsourcing", "Lainnya"];
  const pendidikanList = ["SMA/SMK", "D1", "D2", "D3", "S1", "S2", "S3", "SMP", "SD", "Lainnya"];

  try {
    const emps = await fsGetAll(COL.MASTER_KARYAWAN || "master_karyawan").catch(() => []);
    const existingCabang = emps.map(e => (e.cabang || e.cabang_area || e.penempatan || "").trim()).filter(Boolean);
    const existingDivisi = emps.map(e => (e.divisi || e.departemen || "").trim()).filter(Boolean);
    const existingJabatan = emps.map(e => (e.jabatan || "").trim()).filter(Boolean);
    const existingManagers = emps
      .filter(e => e.nama_karyawan || e.nama)
      .map(e => {
        const name = (e.nama_karyawan || e.nama || "").trim();
        const role = (e.jabatan || "").trim();
        return role ? `${name} (${role})` : name;
      });

    const normalizeList = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));

    return {
      cabangList: normalizeList([...defaultCabang, ...existingCabang]),
      divisiList: normalizeList([...defaultDivisi, ...existingDivisi]),
      jabatanList: normalizeList([...defaultJabatan, ...existingJabatan]),
      managerList: normalizeList([...defaultManagers, ...existingManagers]),
      tipePekerjaanList,
      pendidikanList,
      rawEmployees: emps
    };
  } catch (e) {
    console.warn("Gagal memuat master data recruitment:", e);
    return {
      cabangList: defaultCabang,
      divisiList: defaultDivisi,
      jabatanList: defaultJabatan,
      managerList: defaultManagers,
      tipePekerjaanList,
      pendidikanList,
      rawEmployees: []
    };
  }
}

/**
 * Modal Detail Kandidat & Evaluasi ATS (Dua Kolom Desktop Sesuai PRD Section 11 & 12)
 */
export function openCandidateDetailModal(candidate, vacancy, { onStatusChange, onOpenScorecard, onOpenCvViewer, onConvertToEmployee }) {
  if (!candidate) return;
  const evaluation = candidate.evaluation || evaluateCandidateATS(candidate, vacancy || {});

  const modalHtml = `
  <div class="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
    <!-- Header Summary -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl shadow-sm">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-black">${escapeHtml(candidate.nama || "Tanpa Nama")}</h2>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${evaluation.badge_class}">
            ${escapeHtml(evaluation.klasifikasi)}
          </span>
        </div>
        <p class="text-xs text-slate-300 mt-1 flex items-center gap-3">
          <span>Posisi: <strong class="text-white">${escapeHtml(candidate.posisi_dilamar || vacancy?.posisi || "-")}</strong></span>
          <span>•</span>
          <span>Domisili: <strong class="text-white">${escapeHtml(candidate.domisili || "-")}</strong></span>
          <span>•</span>
          <span>Pengalaman: <strong class="text-white">${candidate.total_pengalaman_tahun || 0} Tahun</strong></span>
        </p>
      </div>

      <div class="flex items-center gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
        <div class="text-right">
          <p class="text-[10px] uppercase font-bold tracking-wider text-slate-400">Skor ATS</p>
          <p class="text-3xl font-black ${evaluation.skor_ats >= 80 ? 'text-emerald-400' : evaluation.skor_ats >= 70 ? 'text-blue-400' : 'text-amber-400'}">${evaluation.skor_ats}%</p>
        </div>
      </div>
    </div>

    <!-- 2-Kolom Layout Desktop -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- Kolom Kiri: Informasi Kontak & CV -->
      <div class="lg:col-span-5 space-y-4">
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-maroon-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            Biodata Kandidat
          </h3>
          <div class="space-y-2.5 text-xs">
            <div class="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span class="text-slate-500">Email:</span>
              <span class="font-medium text-slate-800">${escapeHtml(candidate.email || "-")}</span>
            </div>
            <div class="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span class="text-slate-500">No. WhatsApp / HP:</span>
              <span class="font-medium text-slate-800">${escapeHtml(candidate.no_hp || "-")}</span>
            </div>
            <div class="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span class="text-slate-500">Pendidikan:</span>
              <span class="font-medium text-slate-800">${escapeHtml(candidate.pendidikan_tertinggi || "SMA")} - ${escapeHtml(candidate.jurusan || "")}</span>
            </div>
            <div class="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span class="text-slate-500">SIM yang Dimiliki:</span>
              <span class="font-medium text-slate-800">${Array.isArray(candidate.sim) ? candidate.sim.join(", ") : (candidate.sim || "-")}</span>
            </div>
            <div class="flex justify-between border-b border-slate-200/60 pb-1.5">
              <span class="text-slate-500">Tanggal Melamar:</span>
              <span class="font-medium text-slate-800">${fmtDateShort(candidate.tanggal_lamar)}</span>
            </div>
            <div class="flex justify-between pb-1">
              <span class="text-slate-500">Status Saat Ini:</span>
              <span class="px-2 py-0.5 rounded font-bold bg-slate-200 text-slate-800 text-[11px]">${escapeHtml(candidate.status || "Applied")}</span>
            </div>
          </div>
        </div>

        <!-- Tombol Aksi Dokumen CV -->
        <div class="p-4 bg-white rounded-xl border border-slate-200/80 space-y-2.5">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-maroon-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Dokumen & Text CV
          </h3>
          <div class="flex flex-wrap gap-2">
            ${candidate.cv_url ? `
              <a href="${candidate.cv_url}" target="_blank" class="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg text-center transition flex items-center justify-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                Buka File CV
              </a>
            ` : ''}
            <button type="button" id="btn-modal-open-raw-cv" class="flex-1 py-2 px-3 bg-maroon-50 hover:bg-maroon-100 text-maroon-800 text-xs font-bold rounded-lg text-center transition flex items-center justify-center gap-1.5 cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Viewer & Teks CV
            </button>
          </div>
        </div>

        <!-- WhatsApp Link -->
        ${candidate.no_hp ? `
          <a href="https://wa.me/${candidate.no_hp.replace(/^0/, '62').replace(/[^0-9]/g, '')}?text=Halo%20${encodeURIComponent(candidate.nama || '')},%20kami%20dari%20Tim%20HRD%20CV%20Andela%20Jaya%20terkait%20lamaran%20posisi%20${encodeURIComponent(candidate.posisi_dilamar || '')}..." target="_blank" class="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl text-center transition flex items-center justify-center gap-2 shadow-xs">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
            Hubungi via WhatsApp
          </a>
        ` : ''}
      </div>

      <!-- Kolom Kanan: Detail Evaluasi ATS & Breakdown Bobot -->
      <div class="lg:col-span-7 space-y-4">
        <!-- Breakdown Bobot Kriteria -->
        <div class="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
            <span>ATS Evaluation Criteria & Weight</span>
            <span class="text-maroon-700 font-bold">${evaluation.skor_ats} / 100 Poin</span>
          </h3>

          ${evaluation.has_exclusion_warning ? `
            <div class="mb-3.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1.5 animate-pulse">
              <div class="flex items-center gap-1.5 text-rose-800 font-black">
                <svg class="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span>PERINGATAN ATURAN EKSKLUSI INDUSTRI (ANTI-KOMPETITOR)</span>
              </div>
              <p class="text-rose-700 font-medium">${escapeHtml(evaluation.exclusion_details?.reason || 'Terindikasi alumni distributor cat/kompetitor')}</p>
              <div class="flex flex-wrap gap-1 items-center pt-0.5">
                <span class="text-[10px] text-rose-600 font-bold">Kata Kunci Ditemukan:</span>
                ${(evaluation.exclusion_details?.matched_keywords || []).map(kw => `<span class="px-2 py-0.5 bg-rose-200/70 text-rose-900 font-mono text-[10px] font-bold rounded">${escapeHtml(kw)}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          <div class="space-y-3">
            ${(evaluation.breakdown || []).map(item => `
              <div>
                <div class="flex justify-between items-center text-xs mb-1">
                  <span class="font-bold text-slate-700">${escapeHtml(item.kriteria)} ${item.mandatory ? '<span class="text-red-500 font-black">*Wajib</span>' : ''}</span>
                  <span class="font-mono font-bold text-slate-600">${item.earned_points} / ${item.max_points}</span>
                </div>
                <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full ${item.score_percent >= 80 ? 'bg-emerald-500' : item.score_percent >= 50 ? 'bg-blue-500' : 'bg-amber-500'} rounded-full transition-all duration-300" style="width: ${Math.min(100, item.score_percent)}%"></div>
                </div>
                <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(item.evidence || item.gap || "-")}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Evidence-Based Screening Matches (Section 11 & 14 PRD) -->
        <div class="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200/70">
          <h4 class="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            ATS Evidence (Bukti Ditemukan)
          </h4>
          <ul class="space-y-1.5 text-xs text-emerald-900">
            ${(evaluation.evidence_matches || []).length > 0 
              ? evaluation.evidence_matches.map(ev => `<li class="font-medium">${escapeHtml(ev)}</li>`).join('')
              : '<li class="text-slate-400 italic">Belum ada kecocokan keyword khusus yang terdeteksi.</li>'
            }
          </ul>
        </div>

        <!-- Potential Gaps / Missing Criteria (Section 13 PRD) -->
        ${(evaluation.potential_gaps || []).length > 0 ? `
          <div class="bg-amber-50/70 p-4 rounded-xl border border-amber-200/70">
            <h4 class="text-xs font-bold uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              Potential Gap (Kriteria Tidak Ditemukan dalam CV)
            </h4>
            <ul class="space-y-1 text-xs text-amber-900">
              ${evaluation.potential_gaps.map(gap => `<li class="font-medium">• ${escapeHtml(gap)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  </div>
  `;

  const footerHtml = `
  <div class="flex flex-wrap items-center justify-between gap-3 w-full">
    <div class="flex items-center gap-2">
      <label class="text-xs font-bold text-slate-500">Update Status:</label>
      <select id="modal-select-kandidat-status" class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-maroon-700 cursor-pointer">
        <option value="Applied" ${candidate.status === 'Applied' ? 'selected' : ''}>Applied (Masuk)</option>
        <option value="Screening" ${candidate.status === 'Screening' ? 'selected' : ''}>Screening ATS</option>
        <option value="Shortlist" ${candidate.status === 'Shortlist' ? 'selected' : ''}>Shortlist HR</option>
        <option value="Interview" ${candidate.status === 'Interview' ? 'selected' : ''}>Interview</option>
        <option value="Offered" ${candidate.status === 'Offered' ? 'selected' : ''}>Offering / PKWT</option>
        <option value="Hired" ${candidate.status === 'Hired' ? 'selected' : ''}>Hired (Diterima)</option>
        <option value="Rejected" ${candidate.status === 'Rejected' ? 'selected' : ''}>Rejected (Ditolak)</option>
      </select>
    </div>

    <div class="flex items-center gap-2">
      <button type="button" id="btn-modal-interview-scorecard" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        Scorecard Interview
      </button>

      ${candidate.status === 'Hired' ? `
        <button type="button" id="btn-modal-convert-employee" class="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
          Convert to Karyawan
        </button>
      ` : ''}

      <button type="button" id="btn-modal-close-detail" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">
        Tutup
      </button>
    </div>
  </div>
  `;

  openModal({
    title: `Detail Kandidat & Hasil Screening ATS`,
    size: "xl",
    bodyHtml: modalHtml,
    footerHtml: footerHtml,
    onMount: (m) => {
      m.querySelector("#btn-modal-close-detail").onclick = closeModal;

      // Status selector handler
      const selStatus = m.querySelector("#modal-select-kandidat-status");
      if (selStatus && onStatusChange) {
        selStatus.onchange = () => {
          onStatusChange(candidate.id, selStatus.value);
        };
      }

      // Raw CV Viewer
      const btnRaw = m.querySelector("#btn-modal-open-raw-cv");
      if (btnRaw) {
        btnRaw.onclick = () => openCvViewerModal(candidate, vacancy);
      }

      // Interview Scorecard
      const btnSc = m.querySelector("#btn-modal-interview-scorecard");
      if (btnSc && onOpenScorecard) {
        btnSc.onclick = () => {
          closeModal();
          onOpenScorecard(candidate, vacancy);
        };
      }

      // Convert to Employee
      const btnConv = m.querySelector("#btn-modal-convert-employee");
      if (btnConv && onConvertToEmployee) {
        btnConv.onclick = () => {
          closeModal();
          onConvertToEmployee(candidate, vacancy);
        };
      }
    }
  });
}

/**
 * CV Viewer & Teks Hasil Ekstraksi (Section 14 PRD & Desain)
 */
export function openCvViewerModal(candidate, vacancy) {
  const evalData = candidate.evaluation || evaluateCandidateATS(candidate, vacancy || {});

  openModal({
    title: `CV Viewer & Highlight ATS — ${escapeHtml(candidate.nama || "")}`,
    size: "xl",
    bodyHtml: `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 max-h-[75vh]">
      <!-- Teks Lengkap CV -->
      <div class="lg:col-span-8 flex flex-col h-full bg-slate-950 text-slate-200 p-4 rounded-xl overflow-hidden font-mono text-xs border border-slate-800">
        <div class="flex justify-between items-center pb-2 mb-2 border-b border-slate-800">
          <span class="text-slate-400">Teks Hasil Ekstraksi PDF/DOCX</span>
          <span class="text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">${(candidate.raw_text || '').length} Karakter</span>
        </div>
        <div class="flex-1 overflow-y-auto whitespace-pre-wrap leading-relaxed pr-2 select-text">
          ${escapeHtml(candidate.raw_text || "Tidak ada teks mentah yang terekam.")}
        </div>
      </div>

      <!-- Kolom Kanan: ATS Highlight -->
      <div class="lg:col-span-4 space-y-4 overflow-y-auto">
        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5">ATS Highlight Matrix</h4>
          <div class="space-y-2 text-xs">
            ${(evalData.breakdown || []).map(b => `
              <div class="flex items-center justify-between p-2 rounded-lg ${b.score_percent >= 80 ? 'bg-emerald-50 border border-emerald-200' : b.score_percent > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-rose-50 border border-rose-200'}">
                <span class="font-medium text-slate-800">${escapeHtml(b.kriteria)}</span>
                <span class="font-bold ${b.score_percent >= 80 ? 'text-emerald-700' : b.score_percent > 0 ? 'text-blue-700' : 'text-rose-700'}">
                  ${b.score_percent >= 80 ? '✓ Match' : b.score_percent > 0 ? 'Partial' : '— Gap'}
                </span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
          <p class="text-slate-500 font-medium">Riwayat Kerja yang Terdeteksi:</p>
          ${(candidate.riwayat_kerja || []).length > 0 
            ? candidate.riwayat_kerja.map(r => `
                <div class="p-2 bg-slate-50 rounded border border-slate-100">
                  <p class="font-bold text-slate-800">${escapeHtml(r.periode)} (${r.durasi_tahun} Thn)</p>
                  <p class="text-[11px] text-slate-500 mt-0.5 line-clamp-2">${escapeHtml(r.cuplikan)}</p>
                </div>
              `).join('')
            : '<p class="text-slate-400 italic">Tidak ada rentang tahun eksplisit.</p>'
          }
        </div>
      </div>
    </div>
    `,
    footerHtml: `
    <button type="button" id="btn-close-cv-view" class="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold">Tutup</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-close-cv-view").onclick = closeModal;
    }
  });
}

/**
 * Interactive Interview Scorecard Modal (Section 18 PRD & Desain)
 * Mendukung kustomisasi template, panduan pertanyaan terstruktur & penambahan aspek live
 */
export function openInterviewScorecardModal(candidate, vacancy, { onSaveScorecard, masterTemplates = null }) {
  const evalData = candidate.evaluation || evaluateCandidateATS(candidate, vacancy || {});
  const templates = (masterTemplates && masterTemplates.length > 0) ? masterTemplates : DEFAULT_INTERVIEW_TEMPLATES;
  
  // Auto-detect template yang paling cocok berdasarkan posisi dilamar
  const candPos = (candidate.posisi_dilamar || vacancy?.posisi || "").toLowerCase();
  let currentTemplate = templates.find(t => {
    return (t.posisi_target || []).some(p => p !== "*" && candPos.includes(p.toLowerCase()));
  }) || templates.find(t => (t.posisi_target || []).includes("*")) || templates[0];

  let criteriaList = JSON.parse(JSON.stringify(currentTemplate.aspek || []));

  function renderCriteriaRows() {
    return criteriaList.map((crit, idx) => `
      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 sc-criterion-card" data-idx="${idx}">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex-1 pr-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-800">${escapeHtml(crit.label || `Aspek #${idx+1}`)}</span>
              <span class="text-[10px] font-mono px-2 py-0.5 bg-slate-200 rounded text-slate-700 font-bold">Bobot ${crit.bobot || 20}%</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(crit.desc || "")}</p>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            ${[1, 2, 3, 4, 5].map(val => `
              <label class="cursor-pointer">
                <input type="radio" name="score_${crit.key || ('crit_' + idx)}" value="${val}" class="sr-only peer" ${val === (crit.currentVal || 3) ? 'checked' : ''}>
                <span class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-white text-slate-600 border border-slate-200 peer-checked:bg-maroon-700 peer-checked:text-white peer-checked:border-maroon-700 hover:bg-slate-100 transition shadow-2xs">
                  ${val}
                </span>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Pertanyaan Panduan Interviewer (Editable / Customizable) -->
        ${crit.pertanyaan_panduan ? `
          <div class="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
            <span class="font-bold shrink-0 text-amber-800 text-[10px] uppercase tracking-wider bg-amber-200/60 px-1.5 py-0.5 rounded">Panduan Tanya:</span>
            <span class="flex-1 italic">${escapeHtml(crit.pertanyaan_panduan)}</span>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function renderModalBody() {
    return `
    <form id="form-interview-scorecard" class="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      <!-- Recap Banner & Template Selector -->
      <div class="p-4 bg-slate-900 text-white rounded-2xl space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="font-black text-sm text-white">${escapeHtml(candidate.nama)}</h3>
            <p class="text-xs text-slate-300">Posisi: <strong class="text-white">${escapeHtml(candidate.posisi_dilamar || vacancy?.posisi || "-")}</strong> • Domisili: ${escapeHtml(candidate.domisili || "-")}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${evalData.badge_class}">ATS: ${evalData.skor_ats}%</span>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-xs">
            <label class="text-slate-400 font-bold">Template Aspek:</label>
            <select id="sc-template-selector" class="px-2.5 py-1 bg-slate-800 border border-slate-700 text-white rounded-lg text-xs font-bold outline-none cursor-pointer focus:border-maroon-500">
              ${templates.map(tpl => `
                <option value="${tpl.id}" ${tpl.id === currentTemplate.id ? 'selected' : ''}>${escapeHtml(tpl.kategori_posisi)}</option>
              `).join('')}
            </select>
          </div>
          <p class="text-[11px] text-slate-400 italic">${criteriaList.length} Aspek Penilaian Terload</p>
        </div>
      </div>

      <!-- Form Interviewer & Tanggal -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Nama Pewawancara (Interviewer) *</label>
          <input type="text" id="sc-interviewer" required class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" placeholder="Contoh: HRD / GM / User Manager">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Tanggal Wawancara *</label>
          <input type="date" id="sc-tanggal" required class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>

      <!-- Rating Criteria 1-5 dengan Panduan Pertanyaan -->
      <div class="space-y-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
        <div class="flex items-center justify-between mb-1">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">Aspek Kompetensi & Pertanyaan Wawancara</h4>
          <span class="text-[11px] text-slate-500">Skala Skor: 1 (Sangat Kurang) s/d 5 (Sangat Baik)</span>
        </div>
        
        <div id="sc-criteria-container" class="space-y-3">
          ${renderCriteriaRows()}
        </div>

        <button type="button" id="btn-add-sc-custom-aspek" class="w-full py-2 border border-dashed border-slate-300 hover:border-maroon-600 text-slate-600 hover:text-maroon-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer bg-slate-50/50">
          <svg class="w-4 h-4 text-maroon-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          + Tambah Pertanyaan / Aspek Penilaian Kustom
        </button>
      </div>

      <!-- Catatan Kelebihan & Kekurangan -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label class="block font-bold text-emerald-800 mb-1">Kekuatan & Nilai Lebih (Strength)</label>
          <textarea id="sc-strength" rows="3" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" placeholder="Poin-poin positif, keunggulan teknis, atau karakter kandidat..."></textarea>
        </div>
        <div>
          <label class="block font-bold text-amber-800 mb-1">Catatan / Hal yang Perlu Diperhatikan (Concern)</label>
          <textarea id="sc-concern" rows="3" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" placeholder="Catatan kekurangan, kesenjangan skill, atau background check..."></textarea>
        </div>
      </div>

      <!-- Rekomendasi Akhir -->
      <div class="p-4 bg-slate-900 text-white rounded-xl space-y-2">
        <label class="block text-xs font-bold uppercase tracking-wider text-slate-300">Rekomendasi Keputusan Akhir Interview *</label>
        <div class="grid grid-cols-3 gap-2">
          <label class="cursor-pointer">
            <input type="radio" name="sc_rekomendasi" value="Hire" class="sr-only peer" checked>
            <div class="py-2.5 px-3 text-center rounded-xl border border-slate-700 bg-slate-800 peer-checked:bg-emerald-600 peer-checked:border-emerald-500 font-bold text-xs transition shadow-xs">
              ✓ Hire (Diterima / Lanjut PKWT)
            </div>
          </label>
          <label class="cursor-pointer">
            <input type="radio" name="sc_rekomendasi" value="Consider" class="sr-only peer">
            <div class="py-2.5 px-3 text-center rounded-xl border border-slate-700 bg-slate-800 peer-checked:bg-amber-600 peer-checked:border-amber-500 font-bold text-xs transition shadow-xs">
              ? Pertimbangkan (Cadangan)
            </div>
          </label>
          <label class="cursor-pointer">
            <input type="radio" name="sc_rekomendasi" value="Reject" class="sr-only peer">
            <div class="py-2.5 px-3 text-center rounded-xl border border-slate-700 bg-slate-800 peer-checked:bg-red-600 peer-checked:border-red-500 font-bold text-xs transition shadow-xs">
              ✕ Reject (Gugur / Tolak)
            </div>
          </label>
        </div>
      </div>
    </form>
    `;
  }

  openModal({
    title: `Interview Scorecard — ${escapeHtml(candidate.nama || "")}`,
    size: "lg",
    bodyHtml: `<div id="sc-modal-body-root">${renderModalBody()}</div>`,
    footerHtml: `
    <div class="flex justify-between w-full">
      <button type="button" id="btn-sc-wa-invite" class="px-3 py-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
        <svg class="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
        Salin Undangan WA
      </button>

      <div class="flex items-center gap-2">
        <button type="button" id="btn-sc-cancel" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold">Batal</button>
        <button type="button" id="btn-sc-save" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs">Simpan Hasil Scorecard</button>
      </div>
    </div>
    `,
    onMount: (m) => {
      m.querySelector("#btn-sc-cancel").onclick = closeModal;

      // Copy WhatsApp Interview Template
      const btnWa = m.querySelector("#btn-sc-wa-invite");
      if (btnWa) {
        btnWa.onclick = () => {
          const text = `Selamat Pagi/Siang Sdr/i ${candidate.nama},\n\nKami dari HRD CV Andela Jaya mengundang Anda untuk mengikuti sesi Wawancara Kerja untuk posisi *${candidate.posisi_dilamar || vacancy?.posisi || 'Staff'}*.\n\nJadwal:\nHari/Tgl: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\nWaktu: 09.00 WIB\nLokasi: Kantor CV Andela Jaya / Online Meet\n\nMohon konfirmasi kesediaan Anda. Terima kasih.`;
          navigator.clipboard.writeText(text);
          toast("Draf undangan wawancara WhatsApp berhasil disalin!", "success");
        };
      }

      function setupTemplateSelector() {
        const selTpl = m.querySelector("#sc-template-selector");
        if (selTpl) {
          selTpl.onchange = () => {
            const chosen = templates.find(t => t.id === selTpl.value);
            if (chosen) {
              currentTemplate = chosen;
              criteriaList = JSON.parse(JSON.stringify(chosen.aspek || []));
              const container = m.querySelector("#sc-criteria-container");
              if (container) container.innerHTML = renderCriteriaRows();
            }
          };
        }

        const btnAddAspect = m.querySelector("#btn-add-sc-custom-aspek");
        if (btnAddAspect) {
          btnAddAspect.onclick = () => {
            const aspectName = prompt("Masukkan Nama Aspek / Pertanyaan Baru:");
            if (!aspectName || !aspectName.trim()) return;
            const guide = prompt("Masukkan Panduan Pertanyaan untuk Pewawancara (Opsional):") || "";
            criteriaList.push({
              key: "custom_" + Date.now(),
              label: aspectName.trim(),
              desc: "Aspek penilaian tambahan khusus wawancara.",
              pertanyaan_panduan: guide.trim(),
              bobot: 20,
              currentVal: 3
            });
            const container = m.querySelector("#sc-criteria-container");
            if (container) container.innerHTML = renderCriteriaRows();
            toast("Aspek penilaian kustom berhasil ditambahkan!", "success");
          };
        }
      }

      setupTemplateSelector();

      // Save handler
      const btnSave = m.querySelector("#btn-sc-save");
      if (btnSave && onSaveScorecard) {
        btnSave.onclick = () => {
          const form = m.querySelector("#form-interview-scorecard");
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }

          const scores = {};
          let totalPts = 0;
          criteriaList.forEach((c, idx) => {
            const inputKey = c.key || ('crit_' + idx);
            const rad = form.querySelector(`input[name="score_${inputKey}"]:checked`);
            const val = rad ? parseInt(rad.value, 10) : 3;
            scores[c.label || c.key] = val;
            totalPts += val;
          });

          const recRad = form.querySelector('input[name="sc_rekomendasi"]:checked');
          const rekomendasi = recRad ? recRad.value : "Hire";

          const scorecardData = {
            id: genId("int_"),
            kandidat_id: candidate.id,
            kandidat_nama: candidate.nama,
            lowongan_id: candidate.lowongan_id || vacancy?.id || "",
            posisi: candidate.posisi_dilamar || vacancy?.posisi || "",
            interviewer: m.querySelector("#sc-interviewer").value.trim(),
            tanggal: m.querySelector("#sc-tanggal").value,
            template_used: currentTemplate.kategori_posisi || "Umum",
            scores,
            total_skor_interview: Math.round((totalPts / (Math.max(1, criteriaList.length) * 5)) * 100),
            strength: m.querySelector("#sc-strength").value.trim(),
            concern: m.querySelector("#sc-concern").value.trim(),
            rekomendasi,
            created_at: new Date().toISOString()
          };

          onSaveScorecard(scorecardData);
          closeModal();
        };
      }
    }
  });
}

/**
 * 4-Step Vacancy Wizard Modal (Section 7 PRD & Desain)
 */
export function openCreateVacancyWizardModal({ onSaveVacancy, initialData = null, masterData = null }) {
  let currentStep = 1;

  // Standar fallback jika masterData belum dimuat
  const md = masterData || {
    cabangList: ["HEAD OFFICE", "CABANG BANDUNG", "CABANG SURABAYA", "CABANG SEMARANG", "CABANG BALI", "WORKSHOP", "CIREBON", "KUNINGAN", "MAJALENGKA", "INDRAMAYU", "TEGAL / BREBES"],
    divisiList: ["HRD & GA", "FINANCE & ACCOUNTING", "OPERASIONAL", "MARKETING & SALES", "IT & DIGITAL", "LOGISTIK & GUDANG", "PRODUKSI", "SALES & DISTRIBUTION"],
    jabatanList: ["DIREKTUR", "GENERAL MANAGER", "MANAGER HRD", "SUPERVISOR", "STAFF HRD", "STAFF FINANCE", "STAFF OPERASIONAL", "SALES EXECUTIVE LAPANGAN", "SALES REPRESENTATIVE", "ADMIN GUDANG", "DRIVER / EXPEDISI", "SECURITY", "HEAD STORE", "STORE ASSOCIATE", "DIGITAL MARKETING SPECIALIST"],
    managerList: ["DIREKTUR", "GENERAL MANAGER", "MANAGER HRD", "SUPERVISOR OPERASIONAL", "KABAG SALES", "HEAD STORE", "KEPALA GUDANG"],
    tipePekerjaanList: ["PKWT (Karyawan Kontrak)", "PKWTT (Karyawan Tetap)", "Probation (Masa Percobaan)", "Magang / Internship", "Buruh Harian / Harian Lepas", "Outsourcing", "Lainnya"],
    pendidikanList: ["SMA/SMK", "D1", "D2", "D3", "S1", "S2", "S3", "SMP", "SD", "Lainnya"]
  };

  const formData = initialData ? { ...initialData } : {
    posisi: "",
    departemen: md.divisiList[0] || "MARKETING & SALES",
    cabang: md.cabangList[0] || "HEAD OFFICE",
    penempatan: md.cabangList[0] || "HEAD OFFICE",
    tipe_pekerjaan: md.tipePekerjaanList[0] || "PKWT (Karyawan Kontrak)",
    jumlah_kebutuhan: 1,
    hiring_manager: md.managerList[0] || "GENERAL MANAGER",
    tanggal_buka: new Date().toISOString().split('T')[0],
    tanggal_tutup: "",
    gaji_min: 0,
    gaji_max: 0,
    deskripsi: "",
    pendidikan_min: "SMA/SMK",
    pengalaman_min: 1,
    sim_required: ["SIM C"],
    skills: ["Sales", "Negotiation", "Canvassing"],
    industri_relevan: ["Distributor", "FMCG", "Bahan Bangunan"],
    industry_exclusion: {
      enabled: true,
      affected_positions: ["sales", "admin", "sales executive", "staff admin"],
      keywords: ["distributor cat", "pabrik cat", "toko cat", "penjualan cat", "industri cat", "nippon", "dulux", "avian", "jotun"],
      action: "penalty_flag",
      penalty_points: 25,
      warning_message: "Kandidat memiliki latar belakang distributor/industri cat (Dibatasi untuk posisi Sales & Admin CV Andela Jaya)"
    },
    ats_pass_threshold: 70,
    ats_rules: (DEFAULT_ATS_RULES && DEFAULT_ATS_RULES.length > 0) ? JSON.parse(JSON.stringify(DEFAULT_ATS_RULES)) : [
      { kriteria: "Pendidikan", bobot: 10, mandatory: true, key: "pendidikan" },
      { kriteria: "Pengalaman Kerja", bobot: 25, mandatory: true, key: "pengalaman" },
      { kriteria: "SIM C / Mengemudi", bobot: 15, mandatory: true, key: "sim" },
      { kriteria: "Domisili & Penempatan", bobot: 10, mandatory: false, key: "domisili" },
      { kriteria: "Keahlian Utama / Sales", bobot: 20, mandatory: false, key: "skills" },
      { kriteria: "Software & Excel", bobot: 10, mandatory: false, key: "software" },
      { kriteria: "Pengalaman Industri Relevan", bobot: 10, mandatory: false, key: "industri" }
    ],
    status: "Open"
  };

  // Merge jika edit lowongan
  if (initialData) {
    formData = { ...formData, ...initialData };
  }

  function renderWizardBody() {
    return `
    <div class="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
      <!-- Step Indicator (1 - 4) -->
      <div class="grid grid-cols-4 gap-2 text-center pb-2 border-b border-slate-200">
        <div class="p-2 rounded-xl transition ${currentStep === 1 ? 'bg-maroon-700 text-white font-bold' : currentStep > 1 ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-500'}">
          <p class="text-[10px] uppercase">Langkah 1</p>
          <p class="text-xs">01 Position</p>
        </div>
        <div class="p-2 rounded-xl transition ${currentStep === 2 ? 'bg-maroon-700 text-white font-bold' : currentStep > 2 ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-500'}">
          <p class="text-[10px] uppercase">Langkah 2</p>
          <p class="text-xs">02 Qualification</p>
        </div>
        <div class="p-2 rounded-xl transition ${currentStep === 3 ? 'bg-maroon-700 text-white font-bold' : currentStep > 3 ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-500'}">
          <p class="text-[10px] uppercase">Langkah 3</p>
          <p class="text-xs">03 ATS Rules</p>
        </div>
        <div class="p-2 rounded-xl transition ${currentStep === 4 ? 'bg-maroon-700 text-white font-bold' : 'bg-slate-100 text-slate-500'}">
          <p class="text-[10px] uppercase">Langkah 4</p>
          <p class="text-xs">04 Publish</p>
        </div>
      </div>

      <!-- STEP 1: POSITION DETAILS -->
      <div id="wizard-step-1" class="${currentStep === 1 ? '' : 'hidden'} space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Nama Posisi Lowongan *</label>
            <input type="text" id="wz-posisi" list="wz-posisi-suggestions" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700" value="${escapeHtml(formData.posisi || '')}" placeholder="Ketik atau pilih posisi...">
            <datalist id="wz-posisi-suggestions">
              ${md.jabatanList.map(j => `<option value="${escapeHtml(j)}"></option>`).join('')}
            </datalist>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Divisi / Departemen *</label>
            <select id="wz-departemen" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700">
              ${md.divisiList.map(div => `
                <option value="${escapeHtml(div)}" ${formData.departemen?.toUpperCase() === div.toUpperCase() ? 'selected' : ''}>${escapeHtml(div)}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Cabang / Wilayah Penempatan *</label>
            <select id="wz-cabang" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700">
              ${md.cabangList.map(cab => `
                <option value="${escapeHtml(cab)}" ${formData.cabang?.toUpperCase() === cab.toUpperCase() ? 'selected' : ''}>${escapeHtml(cab)}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Tipe Ikatan Kerja (Status Karyawan) *</label>
            <select id="wz-tipe" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700">
              ${md.tipePekerjaanList.map(tipe => `
                <option value="${escapeHtml(tipe)}" ${formData.tipe_pekerjaan === tipe ? 'selected' : ''}>${escapeHtml(tipe)}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Jumlah Orang yang Dibutuhkan</label>
            <input type="number" id="wz-jumlah" min="1" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700" value="${formData.jumlah_kebutuhan || 1}">
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Hiring Manager / Atasan Langsung</label>
            <input type="text" id="wz-hiring-manager" list="wz-manager-suggestions" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700" value="${escapeHtml(formData.hiring_manager || '')}" placeholder="Ketik atau pilih nama atasan...">
            <datalist id="wz-manager-suggestions">
              ${md.managerList.map(mgr => `<option value="${escapeHtml(mgr)}"></option>`).join('')}
            </datalist>
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">Deskripsi Pekerjaan & Tanggung Jawab Singkat</label>
          <textarea id="wz-deskripsi" rows="3" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700" placeholder="Uraikan tugas harian, target, dan fungsi posisi ini...">${escapeHtml(formData.deskripsi || '')}</textarea>
        </div>
      </div>

      <!-- STEP 2: QUALIFICATIONS BUILDER & INDUSTRY RESTRICTION -->
      <div id="wizard-step-2" class="${currentStep === 2 ? '' : 'hidden'} space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Minimal Pendidikan *</label>
            <select id="wz-pendidikan-min" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700">
              ${md.pendidikanList.map(edu => `
                <option value="${escapeHtml(edu)}" ${formData.pendidikan_min === edu ? 'selected' : ''}>${escapeHtml(edu)}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">Minimal Pengalaman Kerja (Tahun)</label>
            <input type="number" id="wz-pengalaman-min" min="0" max="20" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700" value="${formData.pengalaman_min || 0}">
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1.5">Persyaratan SIM (Surat Izin Mengemudi)</label>
          <div class="flex flex-wrap gap-2">
            ${['SIM C', 'SIM A', 'SIM B1', 'SIM B2'].map(sim => `
              <label class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer text-xs">
                <input type="checkbox" name="wz_sim" value="${sim}" ${(formData.sim_required || []).includes(sim) ? 'checked' : ''} class="rounded border-slate-300 text-maroon-700">
                <span class="font-medium text-slate-700">${sim}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">Target Skills & Keyword Kunci (Pisahkan dengan Koma)</label>
          <input type="text" id="wz-skills-input" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700" value="${(formData.skills || []).join(', ')}" placeholder="Contoh: Sales, Negotiation, Canvassing, Excel, Komunikasi">
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">Latar Belakang Industri Relevan (Kesesuaian Positif)</label>
          <input type="text" id="wz-industri-input" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-700" value="${(formData.industri_relevan || []).join(', ')}" placeholder="Contoh: Distributor, FMCG, Bahan Bangunan, Retail">
        </div>

        <!-- Section Khusus: Eksklusi Industri & Anti-Kompetitor (Distributor Cat dll) -->
        <div class="p-3.5 bg-rose-50/70 rounded-xl border border-rose-200 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="p-1.5 bg-rose-200 text-rose-800 rounded-lg font-bold">🚫</span>
              <div>
                <p class="font-bold text-slate-800 text-xs">Aturan Larangan / Eksklusi Industri (Anti-Kompetitor)</p>
                <p class="text-[11px] text-slate-500">Mendeteksi dan memberi penalti/tolak kandidat dari background terlarang (Misal: Alumni Distributor Cat untuk Sales/Admin).</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="wz-exclusion-enabled" class="sr-only peer" ${formData.industry_exclusion?.enabled !== false ? 'checked' : ''}>
              <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
            </label>
          </div>

          <div id="wz-exclusion-fields" class="${formData.industry_exclusion?.enabled !== false ? '' : 'hidden'} space-y-2.5 pt-2 border-t border-rose-200/80">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Aksi Penanganan ATS:</label>
                <select id="wz-exclusion-action" class="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg outline-none font-bold text-rose-900">
                  <option value="penalty_flag" ${formData.industry_exclusion?.action === 'penalty_flag' ? 'selected' : ''}>Peringatan & Penalti Nilai (-25 Poin)</option>
                  <option value="auto_reject" ${formData.industry_exclusion?.action === 'auto_reject' ? 'selected' : ''}>Auto-Reject (Gugur Otomatis)</option>
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Posisi yang Dibatasi (Pisahkan Koma):</label>
                <input type="text" id="wz-exclusion-positions" class="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg outline-none" value="${(formData.industry_exclusion?.affected_positions || ['sales', 'admin']).join(', ')}" placeholder="sales, admin, sales executive">
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Keyword Industri yang Dilarang (Pisahkan Koma):</label>
              <input type="text" id="wz-exclusion-keywords" class="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg outline-none" value="${(formData.industry_exclusion?.keywords || ['distributor cat', 'pabrik cat', 'toko cat', 'nippon', 'dulux', 'avian', 'jotun']).join(', ')}" placeholder="distributor cat, pabrik cat, avian, jotun, nippon">
            </div>
          </div>
        </div>
      </div>

      <!-- STEP 3: ATS RULES & WEIGHT BUILDER -->
      <div id="wizard-step-3" class="${currentStep === 3 ? '' : 'hidden'} space-y-4 text-xs">
        <div class="flex items-center justify-between p-3 bg-maroon-50 rounded-xl border border-maroon-100">
          <div>
            <p class="font-bold text-maroon-900 text-xs">ATS Weight Rule Engine</p>
            <p class="text-[11px] text-maroon-700">Total bobot seluruh kriteria WAJIB berjumlah 100%.</p>
          </div>
          <div class="text-right">
            <span id="wz-total-weight-display" class="px-3 py-1 rounded-full text-xs font-black bg-white border border-maroon-200 text-maroon-800">Total: 100%</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-600 text-[11px] uppercase">
                <th class="p-2.5 text-left rounded-l-lg">Kriteria Penilaian</th>
                <th class="p-2.5 text-center w-28">Bobot (%)</th>
                <th class="p-2.5 text-center w-24">Mandatory</th>
                <th class="p-2.5 text-center w-12 rounded-r-lg">Aksi</th>
              </tr>
            </thead>
            <tbody id="wz-rules-tbody" class="divide-y divide-slate-100">
              ${(formData.ats_rules || []).map((rule, idx) => `
                <tr data-rule-row="${idx}">
                  <td class="p-2 text-slate-800 font-bold">
                    <input type="text" class="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-maroon-700 px-1 py-0.5 outline-none wz-rule-kriteria" value="${escapeHtml(rule.kriteria)}" data-idx="${idx}">
                  </td>
                  <td class="p-2 text-center">
                    <input type="number" min="0" max="100" class="w-20 px-2 py-1 text-center font-mono font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-700 wz-rule-bobot" value="${rule.bobot}" data-idx="${idx}">
                  </td>
                  <td class="p-2 text-center">
                    <input type="checkbox" class="wz-rule-mandatory rounded border-slate-300 text-maroon-700 cursor-pointer" ${rule.mandatory ? 'checked' : ''} data-idx="${idx}">
                  </td>
                  <td class="p-2 text-center">
                    <button type="button" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-0.5 rounded hover:bg-rose-50 btn-remove-rule" data-idx="${idx}">✕</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="flex justify-between items-center gap-2">
          <button type="button" id="btn-add-wz-rule" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer">
            <span>+</span> Tambah Kriteria ATS Baru
          </button>

          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-700">Threshold Kelulusan (Passing Grade):</span>
            <input type="number" id="wz-threshold" min="40" max="95" class="w-16 px-2 py-1 text-center font-bold border border-slate-300 rounded-lg outline-none focus:border-maroon-700" value="${formData.ats_pass_threshold || 70}">
            <span class="font-bold text-slate-600">%</span>
          </div>
        </div>
      </div>

      <!-- STEP 4: PREVIEW & PUBLISH -->
      <div id="wizard-step-4" class="${currentStep === 4 ? '' : 'hidden'} space-y-4 text-xs">
        <div class="p-4 bg-slate-900 text-white rounded-2xl space-y-2">
          <div class="flex justify-between items-center">
            <span class="px-2.5 py-0.5 rounded-full bg-maroon-600 text-white font-bold text-[10px]">PREVIEW LOWONGAN</span>
            <span class="text-slate-400 text-xs">Siap Dipublikasikan</span>
          </div>
          <h3 class="text-lg font-black text-white" id="prev-posisi">-</h3>
          <p class="text-xs text-slate-300" id="prev-meta">-</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p class="font-bold text-slate-700 mb-1">Kualifikasi Utama</p>
            <ul class="space-y-1 text-slate-600 list-disc list-inside text-[11px]" id="prev-kualifikasi"></ul>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p class="font-bold text-slate-700 mb-1">ATS Rule Configuration</p>
            <p class="text-slate-600 text-[11px]" id="prev-rules-summary">-</p>
          </div>
        </div>
      </div>
    </div>
    `;
  }
          </div>
        </div>
      </div>
    </div>
    `;
  }

  function getWizardFooter() {
    return `
    <div class="flex justify-between items-center w-full">
      <button type="button" id="btn-wz-prev" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition ${currentStep === 1 ? 'invisible' : ''}">
        ← Kembali
      </button>
      <div class="flex items-center gap-2">
        <button type="button" id="btn-wz-cancel" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold">Batal</button>
        ${currentStep < 4 ? `
          <button type="button" id="btn-wz-next" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs">
            Lanjut →
          </button>
        ` : `
          <button type="button" id="btn-wz-save-draft" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold">
            Simpan Draft
          </button>
          <button type="button" id="btn-wz-publish" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-sm">
            ✓ Publish Lowongan
          </button>
        `}
      </div>
    </div>
    `;
  }

  openModal({
    title: initialData ? `Edit Lowongan Pekerjaan` : `Buat Lowongan Pekerjaan & Konfigurasi ATS`,
    size: "lg",
    bodyHtml: `<div id="wz-body-wrapper">${renderWizardBody()}</div>`,
    footerHtml: `<div id="wz-footer-wrapper" class="w-full">${getWizardFooter()}</div>`,
    onMount: (m) => {
      function bindStepEvents() {
        const btnPrev = m.querySelector("#btn-wz-prev");
        const btnNext = m.querySelector("#btn-wz-next");
        const btnCancel = m.querySelector("#btn-wz-cancel");
        const btnDraft = m.querySelector("#btn-wz-save-draft");
        const btnPub = m.querySelector("#btn-wz-publish");

        if (btnCancel) btnCancel.onclick = closeModal;

        if (btnPrev) {
          btnPrev.onclick = () => {
            saveCurrentStepData();
            currentStep = Math.max(1, currentStep - 1);
            refreshWizardUI();
          };
        }

        if (btnNext) {
          btnNext.onclick = () => {
            if (!validateCurrentStep()) return;
            saveCurrentStepData();
            currentStep = Math.min(4, currentStep + 1);
            refreshWizardUI();
          };
        }

        if (btnDraft && onSaveVacancy) {
          btnDraft.onclick = () => {
            saveCurrentStepData();
            formData.status = "Draft";
            onSaveVacancy(formData);
            closeModal();
          };
        }

        if (btnPub && onSaveVacancy) {
          btnPub.onclick = () => {
            saveCurrentStepData();
            formData.status = "Open";
            onSaveVacancy(formData);
            closeModal();
          };
        }

        // Live weight sum calculation
        m.querySelectorAll(".wz-rule-bobot").forEach(inp => {
          inp.oninput = updateWeightDisplay;
        });
      }

      function updateWeightDisplay() {
        let total = 0;
        m.querySelectorAll(".wz-rule-bobot").forEach(inp => {
          total += parseFloat(inp.value) || 0;
        });
        const disp = m.querySelector("#wz-total-weight-display");
        if (disp) {
          disp.textContent = `Total: ${total}%`;
          disp.className = total === 100 
            ? "px-3 py-1 rounded-full text-xs font-black bg-emerald-100 border border-emerald-300 text-emerald-800"
            : "px-3 py-1 rounded-full text-xs font-black bg-rose-100 border border-rose-300 text-rose-800";
        }
      }

      function saveCurrentStepData() {
        if (currentStep === 1) {
          formData.posisi = m.querySelector("#wz-posisi")?.value.trim() || formData.posisi;
          formData.departemen = m.querySelector("#wz-departemen")?.value || formData.departemen;
          formData.cabang = m.querySelector("#wz-cabang")?.value || formData.cabang;
          formData.tipe_pekerjaan = m.querySelector("#wz-tipe")?.value || formData.tipe_pekerjaan;
          formData.jumlah_kebutuhan = parseInt(m.querySelector("#wz-jumlah")?.value || 1, 10);
          formData.hiring_manager = m.querySelector("#wz-hiring-manager")?.value.trim() || formData.hiring_manager;
          formData.deskripsi = m.querySelector("#wz-deskripsi")?.value.trim() || formData.deskripsi;
        } else if (currentStep === 2) {
          formData.pendidikan_min = m.querySelector("#wz-pendidikan-min")?.value || formData.pendidikan_min;
          formData.pengalaman_min = parseInt(m.querySelector("#wz-pengalaman-min")?.value || 0, 10);
          
          const checkedSims = [];
          m.querySelectorAll('input[name="wz_sim"]:checked').forEach(c => checkedSims.push(c.value));
          formData.sim_required = checkedSims;

          const skillsText = m.querySelector("#wz-skills-input")?.value || "";
          formData.skills = skillsText.split(',').map(s => s.trim()).filter(Boolean);

          const indText = m.querySelector("#wz-industri-input")?.value || "";
          formData.industri_relevan = indText.split(',').map(s => s.trim()).filter(Boolean);
        } else if (currentStep === 3) {
          const rules = [];
          m.querySelectorAll("#wz-rules-tbody tr").forEach((tr, i) => {
            const krit = tr.querySelector(".wz-rule-kriteria")?.value.trim();
            const bobot = parseFloat(tr.querySelector(".wz-rule-bobot")?.value) || 0;
            const mand = tr.querySelector(".wz-rule-mandatory")?.checked || false;
            rules.push({ kriteria: krit || `Kriteria ${i+1}`, bobot, mandatory: mand });
          });
          formData.ats_rules = rules;
          formData.ats_pass_threshold = parseInt(m.querySelector("#wz-threshold")?.value || 70, 10);
        }
      }

      function validateCurrentStep() {
        if (currentStep === 1) {
          const pos = m.querySelector("#wz-posisi")?.value.trim();
          if (!pos) {
            toast("Nama Posisi Lowongan wajib diisi", "warning");
            return false;
          }
        } else if (currentStep === 3) {
          let total = 0;
          m.querySelectorAll(".wz-rule-bobot").forEach(inp => total += parseFloat(inp.value) || 0);
          if (total !== 100) {
            toast(`Total bobot saat ini ${total}%. Wajib tepat 100%!`, "warning");
            return false;
          }
        }
        return true;
      }

      function refreshWizardUI() {
        const bodyWrapper = m.querySelector("#wz-body-wrapper");
        const footerWrapper = m.querySelector("#wz-footer-wrapper");
        if (bodyWrapper) bodyWrapper.innerHTML = renderWizardBody();
        if (footerWrapper) footerWrapper.innerHTML = getWizardFooter();
        
        if (currentStep === 4) {
          // Isi preview
          const prevPos = m.querySelector("#prev-posisi");
          const prevMeta = m.querySelector("#prev-meta");
          const prevKual = m.querySelector("#prev-kualifikasi");
          const prevSumm = m.querySelector("#prev-rules-summary");

          if (prevPos) prevPos.textContent = formData.posisi || "Posisi Baru";
          if (prevMeta) prevMeta.textContent = `${formData.departemen} • ${formData.cabang} • ${formData.tipe_pekerjaan} • Butuh: ${formData.jumlah_kebutuhan} Orang`;
          if (prevKual) {
            prevKual.innerHTML = `
              <li>Pendidikan minimal: ${formData.pendidikan_min}</li>
              <li>Pengalaman minimal: ${formData.pengalaman_min} tahun</li>
              <li>SIM: ${(formData.sim_required || []).join(', ') || 'Tidak wajib'}</li>
              <li>Skills: ${(formData.skills || []).join(', ')}</li>
            `;
          }
          if (prevSumm) {
            prevSumm.textContent = `Passing Grade: ${formData.ats_pass_threshold || 70}% • ${formData.ats_rules?.length || 0} Aturan Pembobotan`;
          }
        }

        bindStepEvents();
        updateWeightDisplay();
      }

      bindStepEvents();
      updateWeightDisplay();
    }
  });
}

/**
 * Public Candidate Application Form Modal / Intake Portal (Section 9 PRD & Desain)
 */
export function openPublicIntakeModal(vacancies = [], { onSubmitApplication, masterData = null }) {
  const md = masterData || {
    cabangList: ["HEAD OFFICE", "CABANG BANDUNG", "CABANG SURABAYA", "CABANG SEMARANG", "CABANG BALI", "WORKSHOP", "CIREBON", "KUNINGAN", "MAJALENGKA", "INDRAMAYU", "TEGAL / BREBES"]
  };

  openModal({
    title: "Formulir Pendaftaran & Intake Lamaran Kerja",
    size: "md",
    bodyHtml: `
    <form id="form-public-intake" class="space-y-4 text-xs">
      <div class="p-3 bg-maroon-50 rounded-xl border border-maroon-100 text-maroon-900">
        <p class="font-bold">Portal Lamaran Resmi CV Andela Jaya</p>
        <p class="text-[11px] text-maroon-700 mt-0.5">Unggah berkas CV Anda (PDF/DOCX) untuk pemrosesan screening otomatis.</p>
      </div>

      <div>
        <label class="block font-bold text-slate-700 mb-1">Posisi & Penempatan yang Dilamar *</label>
        <select id="pub-lowongan" required class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700">
          ${vacancies.map(v => `
            <option value="${v.id}">${escapeHtml(v.posisi)} — ${escapeHtml(v.cabang || 'Kantor Pusat')}</option>
          `).join('')}
        </select>
      </div>

      <div>
        <label class="block font-bold text-slate-700 mb-1">Nama Lengkap Sesuai KTP *</label>
        <input type="text" id="pub-nama" required class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" placeholder="Contoh: Budi Santoso">
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Alamat Email *</label>
          <input type="email" id="pub-email" required class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" placeholder="nama@gmail.com">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Nomor WhatsApp / HP Aktif *</label>
          <input type="tel" id="pub-hp" required class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" placeholder="081234567890">
        </div>
      </div>

      <div>
        <label class="block font-bold text-slate-700 mb-1">Kota Domisili Saat Ini *</label>
        <input type="text" id="pub-domisili" list="pub-cabang-list" required class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-maroon-700" placeholder="Contoh: Cirebon / Kuningan / Bandung">
        <datalist id="pub-cabang-list">
          ${md.cabangList.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
        </datalist>
      </div>

      <!-- File Upload Drag & Drop Area -->
      <div>
        <label class="block font-bold text-slate-700 mb-1">Upload Berkas CV (PDF atau DOCX) *</label>
        <div id="pub-dropzone" class="border-2 border-dashed border-slate-300 hover:border-maroon-600 bg-slate-50/70 p-5 rounded-xl text-center cursor-pointer transition">
          <input type="file" id="pub-file-cv" accept=".pdf,.docx,.doc" class="hidden">
          <svg class="w-8 h-8 text-slate-400 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          <p class="font-bold text-slate-700 text-xs" id="pub-file-label">Klik untuk pilih file atau Drag & Drop ke sini</p>
          <p class="text-[10px] text-slate-400 mt-0.5">Maks. 10MB • Format PDF / DOCX</p>
        </div>
      </div>
    </form>
    `,
    footerHtml: `
    <div class="flex justify-between items-center w-full">
      <button type="button" id="btn-pub-close" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer">Batal</button>
      <button type="button" id="btn-pub-submit" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer">Kirim Lamaran Sekarang</button>
    </div>
    `,
    onMount: (m) => {
      m.querySelector("#btn-pub-close").onclick = closeModal;

      const dropzone = m.querySelector("#pub-dropzone");
      const fileInput = m.querySelector("#pub-file-cv");
      const label = m.querySelector("#pub-file-label");
      let selectedFile = null;

      async function handleFileSelected(file) {
        if (!file) return;
        selectedFile = file;
        label.innerHTML = `File dipilih: <strong class="text-maroon-700">${escapeHtml(selectedFile.name)}</strong> (${Math.round(selectedFile.size / 1024)} KB)<br><span class="text-[11px] text-emerald-600 font-bold">⚡ Sedang membaca & mengekstrak data otomatis...</span>`;
        try {
          let text = "";
          if (selectedFile.name.toLowerCase().endsWith('.pdf')) {
            text = await extractTextFromPdfFile(selectedFile);
          } else {
            text = await extractTextFromDocxFile(selectedFile);
          }
          if (text) {
            const extracted = extractBasicInfo(text, selectedFile.name);
            const namaInp = m.querySelector("#pub-nama");
            const emailInp = m.querySelector("#pub-email");
            const hpInp = m.querySelector("#pub-hp");
            const domInp = m.querySelector("#pub-domisili");
            if (namaInp && !namaInp.value && extracted.nama) namaInp.value = extracted.nama;
            if (emailInp && !emailInp.value && extracted.email) emailInp.value = extracted.email;
            if (hpInp && !hpInp.value && extracted.no_hp) hpInp.value = extracted.no_hp;
            if (domInp && !domInp.value && extracted.domisili) domInp.value = extracted.domisili;
            label.innerHTML = `File siap: <strong class="text-maroon-700">${escapeHtml(selectedFile.name)}</strong> (${Math.round(selectedFile.size / 1024)} KB) — <span class="text-emerald-600 font-bold">✓ Data CV berhasil diekstrak otomatis</span>`;
          }
        } catch (e) {
          console.warn("Gagal auto-parse CV:", e);
          label.textContent = `File dipilih: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`;
        }
      }

      dropzone.onclick = () => fileInput.click();
      fileInput.onchange = () => {
        if (fileInput.files.length > 0) {
          handleFileSelected(fileInput.files[0]);
        }
      };

      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("border-maroon-700", "bg-maroon-50"); };
      dropzone.ondragleave = () => { dropzone.classList.remove("border-maroon-700", "bg-maroon-50"); };
      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove("border-maroon-700", "bg-maroon-50");
        if (e.dataTransfer.files.length > 0) {
          handleFileSelected(e.dataTransfer.files[0]);
        }
      };

      const btnSubmit = m.querySelector("#btn-pub-submit");
      btnSubmit.onclick = async () => {
        const form = m.querySelector("#form-public-intake");
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        const vacId = m.querySelector("#pub-lowongan").value;
        const targetVac = vacancies.find(v => v.id === vacId) || {};
        const nama = m.querySelector("#pub-nama").value.trim();
        const email = m.querySelector("#pub-email").value.trim();
        const hp = m.querySelector("#pub-hp").value.trim();
        const domisili = m.querySelector("#pub-domisili").value.trim();

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="inline-block animate-spin mr-1">↻</span> Memproses Parsing CV...`;

        let rawText = "";
        if (selectedFile) {
          try {
            if (selectedFile.name.endsWith('.pdf')) {
              rawText = await extractTextFromPdfFile(selectedFile);
            } else {
              rawText = await extractTextFromDocxFile(selectedFile);
            }
          } catch (e) {
            console.warn("Gagal mengekstrak teks file:", e);
          }
        }

        // Fallback info extractor
        const extracted = extractBasicInfo(rawText || `${nama} ${email} ${hp} ${domisili}`, selectedFile?.name || "");
        
        const candidatePayload = {
          id: genId("cand_"),
          lowongan_id: vacId,
          posisi_dilamar: targetVac.posisi || "Posisi",
          nama: nama || extracted.nama,
          email: email || extracted.email,
          no_hp: hp || extracted.no_hp,
          domisili: domisili || extracted.domisili || targetVac.cabang || "HEAD OFFICE",
          pendidikan_tertinggi: extracted.pendidikan_tertinggi || "SMA/SMK",
          jurusan: extracted.jurusan,
          sim: extracted.sim,
          total_pengalaman_tahun: extracted.total_pengalaman_tahun,
          riwayat_kerja: extracted.riwayat_kerja,
          raw_text: rawText,
          status: "Applied",
          tanggal_lamar: new Date().toISOString()
        };

        // Evaluasi skor ATS langsung
        candidatePayload.evaluation = evaluateCandidateATS(candidatePayload, targetVac);
        candidatePayload.ai_score = candidatePayload.evaluation.skor_ats;

        if (onSubmitApplication) {
          await onSubmitApplication(candidatePayload);
        }

        toast("Lamaran Anda berhasil dikirim dan diverifikasi!", "success");
        closeModal();
      };
    }
  });
}
