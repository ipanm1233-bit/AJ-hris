/**
 * =====================================================================
 * ATS-ANALYTICS.JS — Recruitment & ATS Funnel Analytics & Reporting
 * HRIS Andela Jaya (Section 19 PRD & Desain)
 * =====================================================================
 */
import { escapeHtml } from "../utils.js";

/**
 * Render Full Analytics Dashboard View
 */
export function renderAtsAnalyticsHtml(candidates = [], vacancies = []) {
  const totalApplicants = candidates.length;
  const screenedCount = candidates.filter(c => c.evaluation || c.ai_score !== undefined).length;
  const shortlistCount = candidates.filter(c => (c.evaluation?.skor_ats || c.ai_score || 0) >= 70).length;
  const interviewCount = candidates.filter(c => ['Interview', 'Offered', 'Hired'].includes(c.status)).length;
  const offeredCount = candidates.filter(c => ['Offered', 'Hired'].includes(c.status)).length;
  const hiredCount = candidates.filter(c => c.status === 'Hired').length;
  const rejectedCount = candidates.filter(c => c.status === 'Rejected').length;

  // Conversion rates
  const screenRate = totalApplicants > 0 ? Math.round((screenedCount / totalApplicants) * 100) : 0;
  const passRate = totalApplicants > 0 ? Math.round((shortlistCount / totalApplicants) * 100) : 0;
  const interviewRate = totalApplicants > 0 ? Math.round((interviewCount / totalApplicants) * 100) : 0;
  const hireRate = totalApplicants > 0 ? Math.round((hiredCount / totalApplicants) * 100) : 0;

  // Analisis Skor Distribusi
  const scoreBands = {
    "90-100 (Highly Recommended)": candidates.filter(c => (c.evaluation?.skor_ats || c.ai_score || 0) >= 90).length,
    "80-89 (Recommended)": candidates.filter(c => (c.evaluation?.skor_ats || c.ai_score || 0) >= 80 && (c.evaluation?.skor_ats || c.ai_score || 0) < 90).length,
    "70-79 (HR Review)": candidates.filter(c => (c.evaluation?.skor_ats || c.ai_score || 0) >= 70 && (c.evaluation?.skor_ats || c.ai_score || 0) < 80).length,
    "60-69 (Reserve)": candidates.filter(c => (c.evaluation?.skor_ats || c.ai_score || 0) >= 60 && (c.evaluation?.skor_ats || c.ai_score || 0) < 70).length,
    "< 60 (Not Recommended)": candidates.filter(c => (c.evaluation?.skor_ats || c.ai_score || 0) < 60).length
  };

  // Alasan Gagal / Rejection Factor Aggregation
  let simGapCount = 0;
  let expGapCount = 0;
  let eduGapCount = 0;
  let locGapCount = 0;

  candidates.forEach(c => {
    const gaps = c.evaluation?.potential_gaps || [];
    gaps.forEach(g => {
      const gl = g.toLowerCase();
      if (gl.includes("sim")) simGapCount++;
      else if (gl.includes("pengalaman")) expGapCount++;
      else if (gl.includes("pendidikan")) eduGapCount++;
      else if (gl.includes("domisili") || gl.includes("area")) locGapCount++;
    });
  });

  return `
  <div class="space-y-6">
    <!-- Header Analytics -->
    <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
      <div>
        <h2 class="text-lg font-bold text-slate-800">Recruitment & ATS Performance Analytics</h2>
        <p class="text-xs text-slate-500 mt-0.5">Analisis konversi tahapan seleksi, distribusi skor ATS, dan alasan diskualifikasi.</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200">
          Conversion Rate: ${hireRate}% Hired
        </span>
      </div>
    </div>

    <!-- 1. HIRING FUNNEL SECTION -->
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
      <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
        <svg class="w-4 h-4 text-maroon-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
        Hiring Funnel & Stage Drop-off
      </h3>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p class="text-[10px] uppercase font-bold text-slate-400">01. Total CV</p>
          <p class="text-2xl font-black text-slate-800 my-0.5">${totalApplicants}</p>
          <span class="text-[10px] text-slate-500 font-bold">100% Inbound</span>
        </div>
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p class="text-[10px] uppercase font-bold text-slate-400">02. ATS Screened</p>
          <p class="text-2xl font-black text-blue-700 my-0.5">${screenedCount}</p>
          <span class="text-[10px] text-blue-600 font-bold">${screenRate}% Parsed</span>
        </div>
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p class="text-[10px] uppercase font-bold text-slate-400">03. Lolos ATS (≥70)</p>
          <p class="text-2xl font-black text-teal-700 my-0.5">${shortlistCount}</p>
          <span class="text-[10px] text-teal-600 font-bold">${passRate}% Qualified</span>
        </div>
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p class="text-[10px] uppercase font-bold text-slate-400">04. Interview</p>
          <p class="text-2xl font-black text-amber-700 my-0.5">${interviewCount}</p>
          <span class="text-[10px] text-amber-600 font-bold">${interviewRate}% Sesi</span>
        </div>
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p class="text-[10px] uppercase font-bold text-slate-400">05. Offering</p>
          <p class="text-2xl font-black text-indigo-700 my-0.5">${offeredCount}</p>
          <span class="text-[10px] text-indigo-600 font-bold">${totalApplicants > 0 ? Math.round((offeredCount / totalApplicants) * 100) : 0}% Penawaran</span>
        </div>
        <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
          <p class="text-[10px] uppercase font-bold text-emerald-700">06. Hired</p>
          <p class="text-2xl font-black text-emerald-800 my-0.5">${hiredCount}</p>
          <span class="text-[10px] text-emerald-700 font-bold">${hireRate}% Diterima</span>
        </div>
      </div>

      <!-- Funnel Progress Bars -->
      <div class="space-y-2 pt-2">
        <div>
          <div class="flex justify-between text-xs font-bold text-slate-600 mb-1">
            <span>Penyaringan ATS (Screening → Shortlist)</span>
            <span>${passRate}%</span>
          </div>
          <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-teal-500 rounded-full" style="width: ${passRate}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs font-bold text-slate-600 mb-1">
            <span>Interview ke Offering/Hire</span>
            <span>${interviewCount > 0 ? Math.round((hiredCount / interviewCount) * 100) : 0}%</span>
          </div>
          <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full" style="width: ${interviewCount > 0 ? Math.round((hiredCount / interviewCount) * 100) : 0}%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. DUA KOLOM: ATS SCORE DISTRIBUTION & REJECTION REASONS -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <!-- Distribusi Skor ATS -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <h3 class="text-sm font-bold text-slate-800 flex items-center justify-between">
          <span>Distribusi Skor Evaluasi ATS</span>
          <span class="text-xs text-slate-400 font-normal">N = ${totalApplicants} Pelamar</span>
        </h3>
        <div class="space-y-2.5 pt-1">
          ${Object.entries(scoreBands).map(([label, count]) => {
            const pct = totalApplicants > 0 ? Math.round((count / totalApplicants) * 100) : 0;
            return `
              <div>
                <div class="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>${label}</span>
                  <span class="font-bold">${count} (${pct}%)</span>
                </div>
                <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-maroon-700 rounded-full" style="width: ${pct}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Analisis Gap & Alasan Diskualifikasi -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <h3 class="text-sm font-bold text-slate-800 flex items-center justify-between">
          <span>Faktor Utama Gugur / Diskualifikasi</span>
          <span class="text-xs text-rose-600 font-bold">${rejectedCount} Ditolak</span>
        </h3>
        <p class="text-xs text-slate-500">Berdasarkan audit evaluasi kriteria wajib & pembobotan ATS:</p>

        <div class="space-y-3 pt-1">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs">SIM</span>
              <div>
                <p class="text-xs font-bold text-slate-800">Tidak Memiliki SIM yang Disyaratkan</p>
                <p class="text-[11px] text-slate-500">Khususnya SIM C untuk posisi Sales Lapangan</p>
              </div>
            </div>
            <span class="font-mono font-bold text-xs text-slate-800">${simGapCount} Kandidat</span>
          </div>

          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">EXP</span>
              <div>
                <p class="text-xs font-bold text-slate-800">Pengalaman Kerja di Bawah Syarat Minimal</p>
                <p class="text-[11px] text-slate-500">Kurang dari ketentuan tahun lowongan</p>
              </div>
            </div>
            <span class="font-mono font-bold text-xs text-slate-800">${expGapCount} Kandidat</span>
          </div>

          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">EDU</span>
              <div>
                <p class="text-xs font-bold text-slate-800">Jenjang Pendidikan Belum Memenuhi</p>
                <p class="text-[11px] text-slate-500">Di bawah syarat minimal posisi terkait</p>
              </div>
            </div>
            <span class="font-mono font-bold text-xs text-slate-800">${eduGapCount} Kandidat</span>
          </div>

          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">LOC</span>
              <div>
                <p class="text-xs font-bold text-slate-800">Domisili di Luar Area Operasional</p>
                <p class="text-[11px] text-slate-500">Di luar wilayah cabang penempatan</p>
              </div>
            </div>
            <span class="font-mono font-bold text-xs text-slate-800">${locGapCount} Kandidat</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. TABEL PERFORMA LOWONGAN PEKERJAAN -->
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
      <h3 class="text-sm font-bold text-slate-800">Tabel Kinerja & Konversi per Lowongan</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <th class="p-3 text-left">Nama Posisi</th>
              <th class="p-3 text-left">Cabang</th>
              <th class="p-3 text-center">Status</th>
              <th class="p-3 text-center">Total Pelamar</th>
              <th class="p-3 text-center">Lolos ATS (≥70)</th>
              <th class="p-3 text-center">Interview</th>
              <th class="p-3 text-center">Hired</th>
              <th class="p-3 text-center">Target</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${vacancies.map(v => {
              const vCands = candidates.filter(c => c.lowongan_id === v.id || c.posisi_dilamar === v.posisi);
              const vLolos = vCands.filter(c => (c.evaluation?.skor_ats || c.ai_score || 0) >= 70).length;
              const vInt = vCands.filter(c => ['Interview', 'Offered', 'Hired'].includes(c.status)).length;
              const vHired = vCands.filter(c => c.status === 'Hired').length;

              return `
                <tr class="hover:bg-slate-50/70 transition">
                  <td class="p-3 font-bold text-slate-800">${escapeHtml(v.posisi)}</td>
                  <td class="p-3 text-slate-600">${escapeHtml(v.cabang || 'Cirebon')}</td>
                  <td class="p-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${v.status === 'Open' || v.status === 'Dibuka' ? 'bg-emerald-100 text-emerald-800' : (v.status === 'Draft' || v.status === 'Unpublished' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')}">
                      ${v.status === 'Draft' ? 'Draft (Dicabut)' : (v.status || 'Open')}
                    </span>
                  </td>
                  <td class="p-3 text-center font-bold text-slate-800">${vCands.length}</td>
                  <td class="p-3 text-center font-bold text-teal-700">${vLolos}</td>
                  <td class="p-3 text-center font-bold text-amber-700">${vInt}</td>
                  <td class="p-3 text-center font-bold text-emerald-700">${vHired}</td>
                  <td class="p-3 text-center font-mono text-slate-600">${v.jumlah_kebutuhan || 1} Org</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  `;
}
