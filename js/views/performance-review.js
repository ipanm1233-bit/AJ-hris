import { db, COL, collection, query, where, getDocs, orderBy, limit, addDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, fmtDateShort, escapeHtml, genId } from "../utils.js";
import { avatar, badge, emptyState } from "../components.js";
import { COMPANY_NAME, logoImgTag, isoDocHeaderTable } from "../branding.js";

export async function mount(container, { session }) {
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN" || session.role === "DIREKTUR" || session.role === "MANAGER" || session.role === "ATASAN";
  const tabHeader = container.querySelector("#review-tab-header");
  const contentWrap = container.querySelector("#review-content");

  let activeTab = isHrd ? "all-reviews" : "my-reviews";

  // Seeding initial data if empty
  await seedPerformanceReviewsIfEmpty();

  function renderTabs() {
    let tabsHtml = "";
    if (isHrd) {
      tabsHtml += `
        <button id="tab-all-reviews" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'all-reviews' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
          Semua Review Kinerja
        </button>
      `;
    }
    tabsHtml += `
      <button id="tab-my-reviews" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'my-reviews' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
        Review Kinerja Saya
      </button>
    `;
    tabHeader.innerHTML = tabsHtml;

    if (isHrd) {
      container.querySelector("#tab-all-reviews").onclick = () => { activeTab = "all-reviews"; renderTabs(); loadActiveTab(); };
    }
    container.querySelector("#tab-my-reviews").onclick = () => { activeTab = "my-reviews"; renderTabs(); loadActiveTab(); };
  }

  async function loadActiveTab() {
    contentWrap.innerHTML = `
      <div class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-maroon-700"></div>
      </div>
    `;

    try {
      if (activeTab === "all-reviews") {
        await renderAllReviews(contentWrap, session);
      } else {
        await renderMyReviews(contentWrap, session);
      }
    } catch (err) {
      console.error("Failed to load review tab:", err);
      contentWrap.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl">Error: ${err.message}</div>`;
    }
  }

  renderTabs();
  await loadActiveTab();
}

/* ---------------------------------------------------------------------
 * 1. SEED INITIAL PERFORMANCE REVIEW DATA
 * ------------------------------------------------------------------- */
async function seedPerformanceReviewsIfEmpty() {
  const existing = await fsGetAll(COL.PERFORMANCE_REVIEW);
  if (existing.length > 0) return;

  const mockReviews = [
    {
      id: "REV-001",
      nama_karyawan: "Budi Santoso",
      nik: "10291",
      periode: "Semester 1 2026",
      kualitas_kerja: 88,
      produktivitas: 85,
      kerja_sama: 90,
      kedisiplinan: 95,
      komunikasi: 82,
      skor_akhir: 88,
      grade: "A",
      kelebihan: "Memiliki integritas tinggi, disiplin dalam presensi kehadiran, dan kerja sama tim sangat solid.",
      area_pengembangan: "Perlu meningkatkan skill komunikasi teknis dan penyusunan laporan tertulis agar lebih ringkas.",
      rekomendasi: "Kontrak diperpanjang dengan usulan penyesuaian kelas jabatan (promosi).",
      reviewer: "Irwan Setiawan (Manager)",
      tanggal: new Date(Date.now() - 30 * 24 * 3600000).toISOString()
    },
    {
      id: "REV-002",
      nama_karyawan: "Ani Wijaya",
      nik: "10292",
      periode: "Semester 1 2026",
      kualitas_kerja: 75,
      produktivitas: 78,
      kerja_sama: 85,
      kedisiplinan: 80,
      komunikasi: 88,
      skor_akhir: 81.2,
      grade: "B",
      kelebihan: "Proaktif dalam berdiskusi, pandai bernegosiasi dengan rekan kerja, dan komunikatif.",
      area_pengembangan: "Akurasi kerja dalam penginputan data inventaris gudang harus lebih teliti untuk meminimalisir deviasi.",
      rekomendasi: "Pelatihan ketelitian administrasi (Excel/Data Entry) disarankan.",
      reviewer: "Irwan Setiawan (Manager)",
      tanggal: new Date(Date.now() - 28 * 24 * 3600000).toISOString()
    }
  ];

  for (const r of mockReviews) {
    await fsAdd(COL.PERFORMANCE_REVIEW, r, r.id);
  }
}

/* ---------------------------------------------------------------------
 * 2. STAFF VIEW: MY PERFORMANCE REVIEWS
 * ------------------------------------------------------------------- */
async function renderMyReviews(wrap, session) {
  const allReviews = await fsGetAll(COL.PERFORMANCE_REVIEW);
  const myReviews = allReviews.filter(r => r.nik === session.nik || r.nama_karyawan === session.nama)
    .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

  if (myReviews.length === 0) {
    wrap.innerHTML = emptyState("Belum ada evaluasi kinerja resmi", "Saat ini manajemen belum merilis review kinerja formal untuk profil Anda.");
    return;
  }

  const latestReview = myReviews[0];
  const avgScore = latestReview.skor_akhir;
  let gradeColor = "text-emerald-600 bg-emerald-50 border-emerald-100";
  if (latestReview.grade === "B") gradeColor = "text-blue-600 bg-blue-50 border-blue-100";
  if (latestReview.grade === "C") gradeColor = "text-amber-600 bg-amber-50 border-amber-100";
  if (latestReview.grade === "D") gradeColor = "text-rose-600 bg-rose-50 border-rose-100";

  wrap.innerHTML = `
    <!-- ACTION BUTTONS -->
    <div class="flex justify-end gap-2 mb-4">
      <button id="btn-print-my-review" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition flex items-center gap-1.5 shadow-sm">
        🖨️ Cetak Review
      </button>
      <button id="btn-download-my-review" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-semibold text-xs rounded-lg transition flex items-center gap-1.5 shadow-sm">
        ⬇️ Unduh PDF
      </button>
    </div>

    <!-- LATEST PERFORMANCE GAUGE & OVERVIEW -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- SCORE BOX -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center text-center">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Skor Evaluasi Terbaru (${latestReview.periode})</p>
        
        <div class="relative w-36 h-36 flex items-center justify-center">
          <!-- Circular Ring Accent -->
          <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" stroke="#f1f5f9" stroke-width="8" fill="transparent" />
            <circle cx="50" cy="50" r="40" stroke="#a70000" stroke-width="8" fill="transparent" 
              stroke-dasharray="251.2" stroke-dashoffset="${251.2 - (251.2 * avgScore / 100)}" />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-3xl font-black text-slate-800">${avgScore}</span>
            <span class="text-[10px] text-slate-400 font-semibold uppercase">Skor Akhir</span>
          </div>
        </div>

        <div class="mt-5 px-4 py-1.5 rounded-full border font-bold text-sm ${gradeColor}">
          Predikat Grade: ${latestReview.grade}
        </div>
      </div>

      <!-- RATINGS DETAILS -->
      <div class="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <h3 class="font-bold text-slate-800 text-base">Detail Penilaian Kompetensi</h3>
        <p class="text-xs text-slate-400 -mt-2">Evaluator: <b>${escapeHtml(latestReview.reviewer || "Manajemen")}</b> pada ${fmtDateShort(latestReview.tanggal)}</p>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <!-- Quality of Work -->
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-semibold text-slate-600">
              <span>Kualitas Kerja</span>
              <span class="text-slate-800">${latestReview.kualitas_kerja} / 100</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="bg-maroon-700 h-full rounded-full" style="width: ${latestReview.kualitas_kerja}%"></div>
            </div>
          </div>

          <!-- Productivity -->
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-semibold text-slate-600">
              <span>Produktivitas & Efisiensi</span>
              <span class="text-slate-800">${latestReview.produktivitas} / 100</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="bg-maroon-700 h-full rounded-full" style="width: ${latestReview.produktivitas}%"></div>
            </div>
          </div>

          <!-- Teamwork -->
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-semibold text-slate-600">
              <span>Kerja Sama Tim</span>
              <span class="text-slate-800">${latestReview.kerja_sama} / 100</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="bg-maroon-700 h-full rounded-full" style="width: ${latestReview.kerja_sama}%"></div>
            </div>
          </div>

          <!-- Discipline -->
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-semibold text-slate-600">
              <span>Kedisiplinan & Sikap</span>
              <span class="text-slate-800">${latestReview.kedisiplinan} / 100</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="bg-maroon-700 h-full rounded-full" style="width: ${latestReview.kedisiplinan}%"></div>
            </div>
          </div>

          <!-- Communication -->
          <div class="space-y-1 sm:col-span-2">
            <div class="flex justify-between text-xs font-semibold text-slate-600">
              <span>Keahlian Komunikasi</span>
              <span class="text-slate-800">${latestReview.komunikasi} / 100</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="bg-maroon-700 h-full rounded-full" style="width: ${latestReview.komunikasi}%"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- WRITTEN EVALUATIONS -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6 mt-6">
      <h3 class="font-bold text-slate-800 text-base border-b border-slate-100 pb-3">Ulasan & Rekomendasi Karir</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100/50 space-y-1">
          <h4 class="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
            <span>🌟</span> Kelebihan / Kekuatan Utama
          </h4>
          <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(latestReview.kelebihan || "-")}</p>
        </div>

        <div class="bg-rose-50/40 p-4 rounded-xl border border-rose-100/50 space-y-1">
          <h4 class="text-xs font-bold text-rose-800 uppercase tracking-wide flex items-center gap-1">
            <span>⚙️</span> Area Pengembangan / Kekurangan
          </h4>
          <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(latestReview.area_pengembangan || "-")}</p>
        </div>
      </div>

      <div class="bg-blue-50/30 p-4 rounded-xl border border-blue-100/50 space-y-1.5">
        <h4 class="text-xs font-bold text-blue-800 uppercase tracking-wide">Usulan & Rekomendasi Manajemen</h4>
        <p class="text-sm font-semibold text-slate-800">${escapeHtml(latestReview.rekomendasi || "-")}</p>
      </div>
    </div>

    <!-- HISTORICAL REVIEWS -->
    ${myReviews.length > 1 ? `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 mt-6">
        <h3 class="font-bold text-slate-800 text-base">Riwayat Evaluasi Sebelumnya</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th class="py-3 px-4">Periode</th>
                <th class="py-3 px-4">Reviewer</th>
                <th class="py-3 px-4 text-center">Skor Akhir</th>
                <th class="py-3 px-4 text-center">Grade</th>
                <th class="py-3 px-4">Rekomendasi</th>
                <th class="py-3 px-4">Tanggal</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-sm">
              ${myReviews.slice(1).map(r => `
                <tr class="hover:bg-slate-50/50 transition">
                  <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(r.periode)}</td>
                  <td class="py-3 px-4 text-slate-600">${escapeHtml(r.reviewer)}</td>
                  <td class="py-3 px-4 text-center font-bold text-maroon-700">${r.skor_akhir}</td>
                  <td class="py-3 px-4 text-center">${badge(r.grade, r.grade === 'A' || r.grade === 'B' ? 'green' : 'amber')}</td>
                  <td class="py-3 px-4 text-slate-500">${escapeHtml(r.rekomendasi)}</td>
                  <td class="py-3 px-4 text-slate-400">${fmtDateShort(r.tanggal)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    ` : ""}
  `;

  // Bind Actions
  const btnPrint = wrap.querySelector("#btn-print-my-review");
  const btnDownload = wrap.querySelector("#btn-download-my-review");
  if (btnPrint) {
    btnPrint.onclick = () => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Review Kinerja - ${escapeHtml(latestReview.nama_karyawan)}</title>
          </head>
          <body onload="window.print(); window.close();">
            ${generateReviewHtml(latestReview)}
          </body>
        </html>
      `);
      printWindow.document.close();
    };
  }
  if (btnDownload) {
    btnDownload.onclick = async () => {
      const { downloadHtmlAsPdf } = await import("../utils.js");
      toast("Sedang memproses PDF...", "info");
      await downloadHtmlAsPdf(generateReviewHtml(latestReview), `Review_Kinerja_${toSnakeCase(latestReview.nama_karyawan)}_${toSnakeCase(latestReview.periode)}.pdf`);
      toast("PDF berhasil diunduh!", "success");
    };
  }
}

/* ---------------------------------------------------------------------
 * 3. MANAGEMENT WORKSPACE: ALL EMPLOYEE REVIEWS
 * ------------------------------------------------------------------- */
async function renderAllReviews(wrap, session) {
  const allReviews = await fsGetAll(COL.PERFORMANCE_REVIEW);
  const employees = await fsGetAll(COL.MASTER_KARYAWAN);

  wrap.innerHTML = `
    <!-- MAIN REVIEW TABLE -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="font-bold text-slate-800 text-base">Master Penilaian Kinerja Karyawan</h3>
          <p class="text-xs text-slate-400 mt-0.5">Berisi daftar seluruh review kinerja formal yang dikeluarkan oleh Manajemen.</p>
        </div>
        <button id="btn-create-review" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-semibold rounded-lg shadow-sm transition flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Buat Review Kinerja Baru
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
              <th class="py-3 px-4">Karyawan</th>
              <th class="py-3 px-4">Periode</th>
              <th class="py-3 px-4 text-center">Skor Akhir</th>
              <th class="py-3 px-4 text-center">Grade</th>
              <th class="py-3 px-4">Rekomendasi</th>
              <th class="py-3 px-4">Reviewer</th>
              <th class="py-3 px-4">Tanggal Rilis</th>
              <th class="py-3 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50 text-sm">
            ${allReviews.length === 0 ? `
              <tr>
                <td colspan="8" class="py-12 text-center text-slate-400">Belum ada review kinerja yang diposting. Silakan buat review kinerja baru.</td>
              </tr>
            ` : allReviews.map(r => `
              <tr class="hover:bg-slate-50/50 transition">
                <td class="py-3.5 px-4 font-semibold text-slate-800">${escapeHtml(r.nama_karyawan)}</td>
                <td class="py-3.5 px-4 text-slate-600 font-medium">${escapeHtml(r.periode)}</td>
                <td class="py-3.5 px-4 text-center font-bold text-maroon-700">${r.skor_akhir}</td>
                <td class="py-3.5 px-4 text-center">${badge(r.grade, r.grade === 'A' || r.grade === 'B' ? 'green' : 'amber')}</td>
                <td class="py-3.5 px-4 text-slate-500 max-w-xs truncate" title="${escapeHtml(r.rekomendasi)}">${escapeHtml(r.rekomendasi)}</td>
                <td class="py-3.5 px-4 text-slate-500 text-xs">${escapeHtml(r.reviewer)}</td>
                <td class="py-3.5 px-4 text-slate-400 text-xs">${fmtDateShort(r.tanggal)}</td>
                <td class="py-3.5 px-4 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button data-action="print" data-idx="${r.id}" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition text-xs" title="Cetak Review">
                      🖨️
                    </button>
                    <button data-action="download" data-idx="${r.id}" class="p-1.5 text-maroon-700 hover:bg-maroon-50 rounded-lg transition text-xs" title="Unduh PDF">
                      ⬇️
                    </button>
                    <button data-action="delete" data-id="${r.id}" class="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Hapus Review">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach button actions
  wrap.querySelector("#btn-create-review").onclick = () => openCreateReviewModal(employees, session, async () => {
    await renderAllReviews(wrap, session);
  });

  wrap.querySelectorAll("[data-action='print']").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.idx;
      const review = allReviews.find(x => x.id === id);
      if (!review) return;
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Review Kinerja - ${escapeHtml(review.nama_karyawan)}</title>
          </head>
          <body onload="window.print(); window.close();">
            ${generateReviewHtml(review)}
          </body>
        </html>
      `);
      printWindow.document.close();
    };
  });

  wrap.querySelectorAll("[data-action='download']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.idx;
      const review = allReviews.find(x => x.id === id);
      if (!review) return;
      const { downloadHtmlAsPdf } = await import("../utils.js");
      toast("Sedang memproses PDF...", "info");
      await downloadHtmlAsPdf(generateReviewHtml(review), `Review_Kinerja_${toSnakeCase(review.nama_karyawan)}_${toSnakeCase(review.periode)}.pdf`);
      toast("PDF berhasil diunduh!", "success");
    };
  });

  wrap.querySelectorAll("[data-action='delete']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      if (confirm("Apakah Anda yakin ingin menghapus review kinerja ini secara permanen?")) {
        try {
          await fsDelete(COL.PERFORMANCE_REVIEW, id);
          toast("Review kinerja berhasil dihapus!", "success");
          await renderAllReviews(wrap, session);
        } catch (err) {
          toast("Error: " + err.message, "error");
        }
      }
    };
  });
}

function openCreateReviewModal(employees, session, onSuccess) {
  const selectEmployeeOptions = employees.map(e => `
    <option value="${escapeHtml(e.id)}" data-nama="${escapeHtml(e.nama_karyawan || e.nama || '')}" data-nik="${escapeHtml(e.nik_karyawan || e.nik || '')}">
      ${escapeHtml(e.nama_karyawan || e.nama)} (${escapeHtml(e.nik_karyawan || e.nik || '-')})
    </option>
  `).join("");

  openModal({
    title: "Buat Evaluasi Review Kinerja Baru",
    size: "lg",
    bodyHtml: `
      <form id="form-create-review" class="space-y-4 text-left grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        
        <!-- ROW 1: Karyawan & Periode (Symmetrical Columns) -->
        <div class="flex flex-col justify-between h-full">
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 h-4">Pilih Karyawan</label>
          <select id="rev-employee-select" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500 h-10">
            <option value="" disabled selected>-- Pilih Karyawan --</option>
            ${selectEmployeeOptions}
          </select>
        </div>
        <div class="flex flex-col justify-between h-full">
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 h-4">Periode Evaluasi</label>
          <select id="rev-periode" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500 h-10">
            <option value="Semester 1 2026">Semester 1 2026</option>
            <option value="Semester 2 2026">Semester 2 2026</option>
            <option value="Review Tahunan 2026">Review Tahunan 2026</option>
            <option value="__NEW__">+ Tambah Periode Baru...</option>
          </select>
        </div>

        <!-- ROW 2: Core Competencies -->
        <div class="md:col-span-2 border-t border-slate-100 pt-3">
          <h4 class="font-bold text-slate-800 text-sm mb-3">Penilaian Skor Kompetensi Utama (Skor 0 - 100)</h4>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Kualitas Kerja (Quality of Work)</label>
              <input type="number" id="rev-kualitas" required min="0" max="100" class="score-input w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="0-100">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Produktivitas & Efisiensi Kerja</label>
              <input type="number" id="rev-produktivitas" required min="0" max="100" class="score-input w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="0-100">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Kerja Sama Tim (Teamwork)</label>
              <input type="number" id="rev-kerjasama" required min="0" max="100" class="score-input w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="0-100">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Kedisiplinan & Sikap (Discipline)</label>
              <input type="number" id="rev-kedisiplinan" required min="0" max="100" class="score-input w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="0-100">
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-medium text-slate-600 mb-1">Keahlian Komunikasi</label>
              <input type="number" id="rev-komunikasi" required min="0" max="100" class="score-input w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="0-100">
            </div>
          </div>
        </div>

        <!-- ROW 3: Written Comments -->
        <div class="md:col-span-2 border-t border-slate-100 pt-3">
          <h4 class="font-bold text-slate-800 text-sm mb-3">Tinjauan Kualitatif & Rekomendasi</h4>
          
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Kekuatan Utama Karyawan (Strengths)</label>
              <textarea id="rev-kelebihan" rows="2" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500 text-sm" placeholder="Sebutkan prestasi rill, dedikasi, atau kekuatan kerja karyawan..."></textarea>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Area Pengembangan (Improvements Needed)</label>
              <textarea id="rev-area-pengembangan" rows="2" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500 text-sm" placeholder="Sebutkan hal-hal yang perlu diperbaiki atau disempurnakan..."></textarea>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Rekomendasi / Usulan Karir</label>
              <input type="text" id="rev-rekomendasi" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="Contoh: Perpanjang Kontrak 1 Tahun, Promosi Jabatan, dsb.">
            </div>
          </div>
        </div>

        <!-- LIVE SCORE PREVIEW -->
        <div class="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-center mt-3">
          <div>
            <p class="text-xs text-slate-400 font-bold uppercase">Skor Akhir Kalkulasi</p>
            <p class="text-xs text-slate-400">Rata-rata otomatis dari kelima kompetensi di atas.</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <span id="live-avg-score" class="text-2xl font-black text-maroon-700">0.0</span>
              <span class="text-slate-400 text-xs">/ 100</span>
            </div>
            <div id="live-avg-grade" class="px-3.5 py-1.5 bg-slate-200 text-slate-700 font-black text-sm rounded-lg border border-slate-300">
              -
            </div>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button id="btn-cancel-rev" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Batal</button>
      <button id="btn-save-rev" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-medium rounded-lg transition shadow">Rilis Review Kinerja</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-cancel-rev").onclick = closeModal;

      // Handle custom periods addition
      const selectPeriode = m.querySelector("#rev-periode");
      selectPeriode.addEventListener("change", () => {
        if (selectPeriode.value === "__NEW__") {
          const newPeriod = prompt("Masukkan Periode Evaluasi Baru (contoh: Quarter 1 2026):");
          if (newPeriod && newPeriod.trim()) {
            const cleanVal = newPeriod.trim();
            const opt = document.createElement("option");
            opt.value = cleanVal;
            opt.textContent = cleanVal;
            selectPeriode.insertBefore(opt, selectPeriode.lastElementChild);
            selectPeriode.value = cleanVal;
          } else {
            selectPeriode.selectedIndex = 0;
          }
        }
      });

      // Handle Live calculations
      const liveAvg = m.querySelector("#live-avg-score");
      const liveGrade = m.querySelector("#live-avg-grade");

      m.querySelectorAll(".score-input").forEach(input => {
        input.addEventListener("input", () => {
          let sum = 0;
          let count = 0;
          m.querySelectorAll(".score-input").forEach(inp => {
            const val = parseFloat(inp.value);
            if (!isNaN(val)) {
              sum += val;
              count++;
            }
          });

          if (count > 0) {
            const avg = (sum / count).toFixed(1);
            liveAvg.textContent = avg;
            
            const numAvg = parseFloat(avg);
            let grade = "D";
            let tone = "text-rose-700 bg-rose-50 border-rose-200";
            if (numAvg >= 85) { grade = "A"; tone = "text-emerald-700 bg-emerald-50 border-emerald-200"; }
            else if (numAvg >= 70) { grade = "B"; tone = "text-blue-700 bg-blue-50 border-blue-200"; }
            else if (numAvg >= 55) { grade = "C"; tone = "text-amber-700 bg-amber-50 border-amber-200"; }

            liveGrade.textContent = `GRADE ${grade}`;
            liveGrade.className = `px-3.5 py-1.5 font-black text-sm rounded-lg border ${tone}`;
          } else {
            liveAvg.textContent = "0.0";
            liveGrade.textContent = "-";
            liveGrade.className = "px-3.5 py-1.5 bg-slate-200 text-slate-700 font-black text-sm rounded-lg border border-slate-300";
          }
        });
      });

      m.querySelector("#btn-save-rev").onclick = async () => {
        const form = m.querySelector("#form-create-review");
        if (!form.reportValidity()) return;

        const sel = m.querySelector("#rev-employee-select");
        const opt = sel.options[sel.selectedIndex];
        const nama_karyawan = opt.dataset.nama;
        const nik = opt.dataset.nik;

        const periode = m.querySelector("#rev-periode").value;
        const kualitas_kerja = parseFloat(m.querySelector("#rev-kualitas").value) || 0;
        const produktivitas = parseFloat(m.querySelector("#rev-produktivitas").value) || 0;
        const kerja_sama = parseFloat(m.querySelector("#rev-kerjasama").value) || 0;
        const kedisiplinan = parseFloat(m.querySelector("#rev-kedisiplinan").value) || 0;
        const komunikasi = parseFloat(m.querySelector("#rev-komunikasi").value) || 0;

        const kelebihan = m.querySelector("#rev-kelebihan").value.trim();
        const area_pengembangan = m.querySelector("#rev-area-pengembangan").value.trim();
        const rekomendasi = m.querySelector("#rev-rekomendasi").value.trim();

        const skor_akhir = Math.round(((kualitas_kerja + produktivitas + kerja_sama + kedisiplinan + komunikasi) / 5) * 10) / 10;
        let grade = "D";
        if (skor_akhir >= 85) grade = "A";
        else if (skor_akhir >= 70) grade = "B";
        else if (skor_akhir >= 55) grade = "C";

        const btn = m.querySelector("#btn-save-rev");
        btn.disabled = true;
        btn.textContent = "Mengirim...";

        try {
          const revId = genId("REV");
          await fsAdd(COL.PERFORMANCE_REVIEW, {
            id: revId,
            nama_karyawan,
            nik,
            periode,
            kualitas_kerja,
            produktivitas,
            kerja_sama,
            kedisiplinan,
            komunikasi,
            skor_akhir,
            grade,
            kelebihan,
            area_pengembangan,
            rekomendasi,
            reviewer: `${session.nama} (${session.posisi})`,
            tanggal: new Date().toISOString()
          }, revId);

          toast("Review kinerja resmi berhasil diterbitkan!", "success");
          closeModal();
          if (onSuccess) onSuccess();
        } catch (err) {
          toast("Error: " + err.message, "error");
          btn.disabled = false;
          btn.textContent = "Rilis Review Kinerja";
        }
      };
    }
  });
}

function toSnakeCase(str) {
  return String(str)
    .trim()
    .replace(/[^\w\s/]/g, "")
    .replace(/\s+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();
}

function generateReviewHtml(r) {
  return `
    <div style="font-family: 'Times New Roman', serif; font-size: 14px; padding: 20px; line-height: 1.5; color: #000; background: #fff; max-width: 800px; margin: 0 auto;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border: 1px solid #000;">
        <tr>
          <td style="border: 1px solid #000; padding: 10px; text-align: center; font-weight: bold; font-size: 16px;" colspan="4">
            CV ANDELA JAYA<br/>
            <span style="font-size: 12px; font-weight: normal;">Jl. Raya Solo-Sragen KM 12, Karanganyar</span>
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 6px; font-weight: bold; width: 25%;">JUDUL DOKUMEN</td>
          <td style="border: 1px solid #000; padding: 6px; width: 35%; text-align: center;" colspan="3"><strong>LAPORAN EVALUASI & REVIEW KINERJA</strong></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 6px; font-weight: bold;">NO. DOKUMEN</td>
          <td style="border: 1px solid #000; padding: 6px; width: 25%;">HR-EVAL-PERF</td>
          <td style="border: 1px solid #000; padding: 6px; font-weight: bold; width: 20%;">PERIODE</td>
          <td style="border: 1px solid #000; padding: 6px; width: 30%;">${escapeHtml(r.periode)}</td>
        </tr>
      </table>

      <h3 style="text-align: center; margin-bottom: 20px; font-size: 18px; text-decoration: underline;">SURAT HASIL PENILAIAN KINERJA</h3>
      
      <table style="width: 100%; margin-bottom: 20px;">
        <tr><td style="width: 25%; font-weight: bold;">Nama Karyawan</td><td style="width: 2%;">:</td><td><strong>${escapeHtml(r.nama_karyawan)}</strong></td></tr>
        <tr><td style="font-weight: bold;">NIK</td><td>:</td><td>${escapeHtml(r.nik || "-")}</td></tr>
        <tr><td style="font-weight: bold;">Tanggal Review</td><td>:</td><td>${fmtDateShort(r.tanggal)}</td></tr>
        <tr><td style="font-weight: bold;">Reviewer</td><td>:</td><td>${escapeHtml(r.reviewer)}</td></tr>
      </table>

      <h4 style="border-bottom: 1px solid #000; padding-bottom: 4px; margin-top: 25px; font-size: 14px;">I. HASIL PENILAIAN KOMPETENSI</h4>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="border: 1px solid #000; padding: 8px; text-align: left; width: 60%;">Kompetensi Utama</th>
            <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 20%;">Skor Maksimal</th>
            <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 20%;">Skor Penilaian</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">Kualitas Kerja (Quality of Work)</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">100</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${r.kualitas_kerja}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">Produktivitas & Efisiensi Kerja</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">100</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${r.produktivitas}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">Kerja Sama Tim (Teamwork)</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">100</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${r.kerja_sama}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">Kedisiplinan & Sikap (Discipline)</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">100</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${r.kedisiplinan}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 8px;">Keahlian Komunikasi</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">100</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold;">${r.komunikasi}</td>
          </tr>
          <tr style="background: #f9f9f9; font-weight: bold;">
            <td style="border: 1px solid #000; padding: 8px; text-align: right;">SKOR AKHIR RATA-RATA</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;">100</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center; font-size: 16px; color: #a70000;">${r.skor_akhir}</td>
          </tr>
          <tr style="background: #f9f9f9; font-weight: bold;">
            <td style="border: 1px solid #000; padding: 8px; text-align: right;">PREDIKAT GRADE</td>
            <td style="border: 1px solid #000; padding: 8px; text-align: center;" colspan="2">${r.grade}</td>
          </tr>
        </tbody>
      </table>

      <h4 style="border-bottom: 1px solid #000; padding-bottom: 4px; margin-top: 25px; font-size: 14px;">II. ULASAN KUALITATIF & REKOMENDASI</h4>
      <div style="margin-top: 10px; margin-bottom: 15px; padding: 10px; border: 1px solid #000;">
        <strong>Kelebihan / Kekuatan Utama:</strong><br/>
        <p style="margin: 5px 0 0 0; text-align: justify;">${escapeHtml(r.kelebihan || "-")}</p>
      </div>
      <div style="margin-bottom: 15px; padding: 10px; border: 1px solid #000;">
        <strong>Area Pengembangan / Kekurangan:</strong><br/>
        <p style="margin: 5px 0 0 0; text-align: justify;">${escapeHtml(r.area_pengembangan || "-")}</p>
      </div>
      <div style="margin-bottom: 25px; padding: 10px; border: 1px solid #000; background-color: #f9f9f9;">
        <strong>Usulan & Rekomendasi Karir:</strong><br/>
        <p style="margin: 5px 0 0 0; font-weight: bold;">${escapeHtml(r.rekomendasi || "-")}</p>
      </div>

      <table style="width: 100%; text-align: center; margin-top: 50px;">
        <tr>
          <td style="width: 50%;">Karyawan Bersangkutan,</td>
          <td style="width: 50%;">Reviewer / Atasan,</td>
        </tr>
        <tr>
          <td style="height: 70px;"></td>
          <td></td>
        </tr>
        <tr>
          <td>( <strong>${escapeHtml(r.nama_karyawan)}</strong> )</td>
          <td>( <strong>${escapeHtml(r.reviewer)}</strong> )</td>
        </tr>
      </table>
    </div>
  `;
}
