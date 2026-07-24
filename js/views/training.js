import { db, COL, collection, query, where, getDocs, orderBy, limit, doc, setDoc, updateDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, fmtDateShort, escapeHtml, genId, notifyUser } from "../utils.js";
import { avatar, badge, emptyState } from "../components.js";

const PLAN_COLL = "training_plans";
const PROGRESS_COLL = "training_progress";

export async function mount(container, { session }) {
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";
  const isGm = session.role === "GM" || session.role === "SUPERADMIN";
  const isFinance = session.role === "FINANCE" || session.role === "SUPERADMIN";
  const tabHeader = container.querySelector("#training-tab-header");
  const contentWrap = container.querySelector("#training-content");

  let activeTab = isHrd ? "tna" : ((isGm || isFinance) ? "requests" : "my-requests");

  // Seed initial data
  await seedTrainingDataIfEmpty();

  function renderTabs() {
    let tabsHtml = "";
    if (isHrd) {
      tabsHtml += `
        <button id="tab-tna" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'tna' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
          TNA Dashboard & Kelas
        </button>
      `;
    }
    if (isHrd || isGm || isFinance) {
      tabsHtml += `
        <button id="tab-requests" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'requests' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
          📥 Review Pengajuan
        </button>
      `;
    }
    tabsHtml += `
      <button id="tab-my-requests" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'my-requests' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
        🔑 Kelas & Pengajuan Saya
      </button>
    `;
    tabHeader.innerHTML = tabsHtml;

    // Register Tab Listeners
    if (isHrd) {
      container.querySelector("#tab-tna").onclick = () => { activeTab = "tna"; renderTabs(); loadActiveTab(); };
    }
    if (isHrd || isGm || isFinance) {
      container.querySelector("#tab-requests").onclick = () => { activeTab = "requests"; renderTabs(); loadActiveTab(); };
    }
    container.querySelector("#tab-my-requests").onclick = () => { activeTab = "my-requests"; renderTabs(); loadActiveTab(); };
  }

  async function loadActiveTab() {
    contentWrap.innerHTML = `
      <div class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-maroon-700"></div>
      </div>
    `;

    try {
      if (activeTab === "tna") {
        await renderTnaDashboard(contentWrap, session);
      } else if (activeTab === "requests") {
        await renderAllRequests(contentWrap, session);
      } else {
        await renderMyRequests(contentWrap, session);
      }
    } catch (err) {
      console.error("Failed to load training tab:", err);
      contentWrap.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl">Error: ${err.message}</div>`;
    }
  }

  renderTabs();
  await loadActiveTab();
}

/* ---------------------------------------------------------------------
 * 1. SEED DATA FUNCTION (FOR DEMONSTRATION & PERSISTENCE)
 * ------------------------------------------------------------------- */
async function seedTrainingDataIfEmpty() {
  const existing = await fsGetAll(COL.DATA_TRAINING);
  if (existing.length > 0) return;

  const mockData = [
    {
      id: "TNA-001",
      nama_karyawan: "Budi Santoso",
      nik: "10291",
      kompetensi: "Advanced Microsoft Excel",
      kategori: "Soft & Technical Skills",
      level_sekarang: 2,
      level_diharapkan: 5,
      alasan: "Mempercepat pembuatan laporan rekap bulanan HRGA agar tidak manual.",
      status: "PENDING",
      tanggal_pengajuan: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
    },
    {
      id: "TNA-002",
      nama_karyawan: "Ani Wijaya",
      nik: "10292",
      kompetensi: "Advanced Microsoft Excel",
      kategori: "Soft & Technical Skills",
      level_sekarang: 3,
      level_diharapkan: 5,
      alasan: "Sering mengolah pivot table besar untuk analisis data gudang.",
      status: "APPROVED",
      tanggal_pengajuan: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
    },
    {
      id: "TNA-003",
      nama_karyawan: "Citra Lestari",
      nik: "10293",
      kompetensi: "Sertifikasi Audit Mutu ISO 9001",
      kategori: "Operational & Safety",
      level_sekarang: 1,
      level_diharapkan: 4,
      alasan: "Kebutuhan internal audit tahunan dari departemen jaminan kualitas.",
      status: "SCHEDULED",
      tanggal_pengajuan: new Date(Date.now() - 10 * 24 * 3600000).toISOString(),
      training_plan_id: "PLAN-101"
    }
  ];

  for (const item of mockData) {
    await fsAdd(COL.DATA_TRAINING, item, item.id);
  }

  // Also seed some training plans
  const existingPlans = await fsGetAll(PLAN_COLL);
  if (existingPlans.length === 0) {
    const mockPlans = [
      {
        id: "PLAN-101",
        judul: "Sertifikasi ISO 9001:2015 Lead Auditor",
        kategori: "Operational & Safety",
        trainer: "Sentra Sertifikasi Indonesia",
        tanggal: new Date(Date.now() + 15 * 24 * 3600000).toISOString().split('T')[0],
        peserta: ["Citra Lestari"],
        estimasi_biaya: 4500000,
        status: "SCHEDULED"
      }
    ];
    for (const plan of mockPlans) {
      await fsAdd(PLAN_COLL, plan, plan.id);
    }
  }
}

/* ---------------------------------------------------------------------
 * 2. STAFF VIEW: ACTIVE CLASSES & PRE-POST TEST PROGRESS
 * ------------------------------------------------------------------- */
async function renderMyRequests(wrap, session) {
  const allData = await fsGetAll(COL.DATA_TRAINING);
  const myData = allData.filter(x => x.nik === session.nik || x.nama_karyawan === session.nama)
    .sort((a, b) => new Date(b.tanggal_pengajuan) - new Date(a.tanggal_pengajuan));

  // Get active plans where this user is listed as participant
  const allPlans = await fsGetAll(PLAN_COLL);
  const myPlans = allPlans.filter(p => (p.peserta || []).includes(session.nama));

  // Fetch my progress records
  const allProgress = await fsGetAll(PROGRESS_COLL);
  const myProgressMap = {};
  allProgress.forEach(pr => {
    if (pr.nama === session.nama || pr.nik === session.nik) {
      myProgressMap[pr.plan_id] = pr;
    }
  });

  const statsApproved = myData.filter(x => x.status === "APPROVED" || x.status === "SCHEDULED").length;
  const statsPending = myData.filter(x => x.status === "PENDING").length;

  wrap.innerHTML = `
    <!-- Top Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Pengajuan Kompetensi</p>
        <p class="text-2xl font-bold text-slate-800">${myData.length}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <p class="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">Disetujui / Terjadwal</p>
        <p class="text-2xl font-bold text-emerald-600">${statsApproved}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <p class="text-xs font-bold text-amber-500 uppercase tracking-wider mb-1">Menunggu Review</p>
        <p class="text-2xl font-bold text-amber-600">${statsPending}</p>
      </div>
    </div>

    <!-- ACTIVE TRAINING CLASSES SECTION -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <h3 class="font-bold text-slate-800 flex items-center gap-2">
        <span class="w-1.5 h-4 bg-maroon-700 rounded-full"></span>
        🎯 Kelas Pelatihan Aktif & Progress Saya
      </h3>
      <p class="text-xs text-slate-400">Ikuti pre-test sebelum kelas, post-test sesudah kelas, dan isi kuesioner feedback untuk menyelesaikan program.</p>

      ${myPlans.length === 0 ? `
        <div class="border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
          Anda belum terdaftar di kelas pelatihan aktif mana pun saat ini.
        </div>
      ` : `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${myPlans.map(p => {
            const prog = myProgressMap[p.id] || { pretest_score: null, posttest_score: null, feedback: null };
            
            // Calculate progress percentage
            let pct = 0;
            if (prog.pretest_score !== null && prog.pretest_score !== undefined) pct += 33;
            if (prog.posttest_score !== null && prog.posttest_score !== undefined) pct += 33;
            if (prog.feedback !== null && prog.feedback !== undefined) pct += 34;

            return `
              <div class="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 hover:border-maroon-200 transition flex flex-col justify-between space-y-4">
                <div class="space-y-1">
                  <div class="flex justify-between items-start gap-2">
                    <span class="px-2 py-0.5 bg-maroon-50 text-maroon-700 rounded text-[9px] font-bold uppercase">${escapeHtml(p.kategori)}</span>
                    <span class="text-xs font-bold text-maroon-700">${pct}% Selesai</span>
                  </div>
                  <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(p.judul)}</h4>
                  <p class="text-xs text-slate-500">Trainer: <b>${escapeHtml(p.trainer)}</b></p>
                  <p class="text-xs text-slate-400">Jadwal: ${p.tanggal ? fmtDateShort(p.tanggal) : "-"}</p>
                </div>

                <!-- Progress Bar -->
                <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div class="bg-gradient-to-r from-maroon-600 to-red-500 h-full rounded-full transition-all" style="width: ${pct}%"></div>
                </div>

                <!-- Test Actions -->
                <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100/60">
                  <div class="flex flex-col items-center">
                    <span class="text-[9px] text-slate-400 mb-1">Pre-Test</span>
                    ${prog.pretest_score !== null && prog.pretest_score !== undefined ? `
                      <span class="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded">Skor: ${prog.pretest_score}</span>
                    ` : `
                      <button class="btn-pretest bg-maroon-700 hover:bg-maroon-800 text-white font-semibold text-[9px] px-2 py-1 rounded-lg w-full text-center transition" data-plan-id="${p.id}" data-judul="${escapeHtml(p.judul)}" data-kategori="${escapeHtml(p.kategori)}">Ikut</button>
                    `}
                  </div>

                  <div class="flex flex-col items-center">
                    <span class="text-[9px] text-slate-400 mb-1">Post-Test</span>
                    ${prog.posttest_score !== null && prog.posttest_score !== undefined ? `
                      <span class="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded">Skor: ${prog.posttest_score}</span>
                    ` : (prog.pretest_score !== null && prog.pretest_score !== undefined ? `
                      <button class="btn-posttest bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[9px] px-2 py-1 rounded-lg w-full text-center transition" data-plan-id="${p.id}" data-judul="${escapeHtml(p.judul)}" data-kategori="${escapeHtml(p.kategori)}">Ikut</button>
                    ` : `
                      <button disabled class="bg-slate-200 text-slate-400 cursor-not-allowed font-semibold text-[9px] px-2 py-1 rounded-lg w-full text-center">Locked</button>
                    `)}
                  </div>

                  <div class="flex flex-col items-center">
                    <span class="text-[9px] text-slate-400 mb-1">Kuesioner</span>
                    ${prog.feedback !== null && prog.feedback !== undefined ? `
                      <span class="text-emerald-600 font-bold text-[9px] bg-emerald-50 px-2 py-1 border border-emerald-200 rounded text-center">Selesai ✨</span>
                    ` : (prog.posttest_score !== null && prog.posttest_score !== undefined ? `
                      <button class="btn-feedback bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[9px] px-2 py-1 rounded-lg w-full text-center transition" data-plan-id="${p.id}" data-judul="${escapeHtml(p.judul)}">Isi</button>
                    ` : `
                      <button disabled class="bg-slate-200 text-slate-400 cursor-not-allowed font-semibold text-[9px] px-2 py-1 rounded-lg w-full text-center">Locked</button>
                    `)}
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `}
    </div>

    <!-- MY COMPETENCY REQUESTS SECTION -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-slate-800">Daftar Pengajuan Kompetensi Saya</h3>
        <button id="btn-add-tna" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-semibold rounded-lg shadow-sm transition flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Ajukan Kompetensi Baru
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
              <th class="py-3 px-4">Kompetensi</th>
              <th class="py-3 px-4">Kategori</th>
              <th class="py-3 px-4 text-center">Tingkat Saat Ini</th>
              <th class="py-3 px-4 text-center">Ekspektasi</th>
              <th class="py-3 px-4 text-center">Gap</th>
              <th class="py-3 px-4">Tanggal Pengajuan</th>
              <th class="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50 text-sm">
            ${myData.length === 0 ? `
              <tr>
                <td colspan="7" class="py-12 text-center text-slate-400">Belum ada pengajuan kompetensi. Silakan buat pengajuan kompetensi baru.</td>
              </tr>
            ` : myData.map(r => {
              const gap = r.level_sekarang - r.level_diharapkan;
              let statusTone = "slate";
              if (r.status === "PENDING") statusTone = "amber";
              if (r.status === "APPROVED") statusTone = "blue";
              if (r.status === "SCHEDULED") statusTone = "green";
              if (r.status === "REJECTED") statusTone = "red";

              return `
                <tr class="hover:bg-slate-50/50 transition">
                  <td class="py-3.5 px-4 font-semibold text-slate-800">${escapeHtml(r.kompetensi)}</td>
                  <td class="py-3.5 px-4 text-slate-500">${escapeHtml(r.kategori || "Lain-lain")}</td>
                  <td class="py-3.5 px-4 text-center font-semibold text-amber-600">${r.level_sekarang} / 5</td>
                  <td class="py-3.5 px-4 text-center font-semibold text-blue-600">${r.level_diharapkan} / 5</td>
                  <td class="py-3.5 px-4 text-center font-bold text-rose-600">${gap}</td>
                  <td class="py-3.5 px-4 text-slate-400">${fmtDateShort(r.tanggal_pengajuan)}</td>
                  <td class="py-3.5 px-4">${badge(r.status, statusTone)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach button action
  wrap.querySelector("#btn-add-tna").onclick = () => openAddCompetencyModal(session, async () => {
    await renderMyRequests(wrap, session);
  });

  // Attach interactive test events
  wrap.querySelectorAll(".btn-pretest").forEach(btn => {
    btn.onclick = () => {
      const planId = btn.dataset.planId;
      const planJudul = btn.dataset.judul;
      const kategori = btn.dataset.kategori;
      openQuizModal("PRE-TEST", planId, planJudul, kategori, session, async () => {
        await renderMyRequests(wrap, session);
      });
    };
  });

  wrap.querySelectorAll(".btn-posttest").forEach(btn => {
    btn.onclick = () => {
      const planId = btn.dataset.planId;
      const planJudul = btn.dataset.judul;
      const kategori = btn.dataset.kategori;
      openQuizModal("POST-TEST", planId, planJudul, kategori, session, async () => {
        await renderMyRequests(wrap, session);
      });
    };
  });

  wrap.querySelectorAll(".btn-feedback").forEach(btn => {
    btn.onclick = () => {
      const planId = btn.dataset.planId;
      const planJudul = btn.dataset.judul;
      openFeedbackModal(planId, planJudul, session, async () => {
        await renderMyRequests(wrap, session);
      });
    };
  });
}

function openAddCompetencyModal(session, onSuccess) {
  openModal({
    title: "🎯 Ajukan Peningkatan Kompetensi",
    size: "md",
    bodyHtml: `
      <form id="form-tna-request" class="space-y-4 text-left">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Nama Kompetensi / Deskripsi Pelatihan</label>
          <input type="text" id="tna-kompetensi" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="Contoh: Flutter Mobile Development, Advanced Excel, dsb.">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Kategori Kompetensi</label>
          <select id="tna-kategori" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
            <option value="Soft & Technical Skills">Soft & Technical Skills</option>
            <option value="IT & Software">IT & Software</option>
            <option value="Operational & Safety">Operational & Safety</option>
            <option value="Leadership">Leadership</option>
            <option value="Lain-lain">Lain-lain</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Skor Kompetensi Sekarang</label>
            <select id="tna-level-sekarang" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
              <option value="1">1 - Pemula Sekali (No Knowledge)</option>
              <option value="2" selected>2 - Tingkat Dasar (Basic)</option>
              <option value="3">3 - Menengah (Intermediate)</option>
              <option value="4">4 - Mahir (Advanced)</option>
              <option value="5">5 - Ahli / Konsultan (Expert)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Tingkat yang Diharapkan</label>
            <select id="tna-level-diharapkan" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
              <option value="2">2 - Tingkat Dasar</option>
              <option value="3">3 - Menengah</option>
              <option value="4" selected>4 - Mahir (Advanced)</option>
              <option value="5">5 - Ahli / Konsultan (Expert)</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Tujuan & Alasan Peningkatan</label>
          <textarea id="tna-alasan" rows="3" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-maroon-500" placeholder="Kenapa kompetensi ini penting bagi pekerjaan Anda saat ini?"></textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button id="btn-cancel-tna" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Batal</button>
      <button id="btn-save-tna" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-medium rounded-lg transition shadow">Kirim Pengajuan</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-cancel-tna").onclick = closeModal;
      m.querySelector("#btn-save-tna").onclick = async () => {
        const form = m.querySelector("#form-tna-request");
        if (!form.reportValidity()) return;

        const kompetensi = m.querySelector("#tna-kompetensi").value.trim();
        const kategori = m.querySelector("#tna-kategori").value;
        const level_sekarang = parseInt(m.querySelector("#tna-level-sekarang").value);
        const level_diharapkan = parseInt(m.querySelector("#tna-level-diharapkan").value);
        const alasan = m.querySelector("#tna-alasan").value.trim();

        if (level_sekarang >= level_diharapkan) {
          toast("Tingkat kompetensi yang diharapkan harus lebih tinggi dari saat ini", "warning");
          return;
        }

        const btn = m.querySelector("#btn-save-tna");
        btn.disabled = true;
        btn.textContent = "Mengirim...";

        try {
          const newId = genId("TNA");
          await fsAdd(COL.DATA_TRAINING, {
            id: newId,
            nama_karyawan: session.nama,
            nik: session.nik || "STAFF",
            kompetensi,
            kategori,
            level_sekarang,
            level_diharapkan,
            alasan,
            status: "PENDING",
            tanggal_pengajuan: new Date().toISOString()
          }, newId);

          toast("Pengajuan kompetensi berhasil dikirim!", "success");
          closeModal();
          if (onSuccess) onSuccess();
        } catch (err) {
          toast("Error: " + err.message, "error");
          btn.disabled = false;
          btn.textContent = "Kirim Pengajuan";
        }
      };
    }
  });
}

/* ---------------------------------------------------------------------
 * 3. INTERACTIVE QUIZZES & QUESTIONNAIRES GENERATOR
 * ------------------------------------------------------------------- */
function openQuizModal(type, planId, planJudul, kategori, session, onDone) {
  const quizzes = {
    "Soft & Technical Skills": [
      { q: "Apakah kepanjangan dari metode target SMART?", a: "Specific, Measurable, Achievable, Relevant, Time-bound", b: "Simple, Managed, Active, Regular, Test-ready", c: "Super, Model, Active, Run, Time", correct: "a" },
      { q: "Mana durasi fokus optimal sebelum butuh rehat menurut teknik Pomodoro?", a: "25 Menit", b: "60 Menit", c: "120 Menit", correct: "a" },
      { q: "Mana dari berikut yang merupakan elemen komunikasi efektif?", a: "Active listening & feedback", b: "Bicara tanpa henti", c: "Mengirim email formal saja", correct: "a" }
    ],
    "IT & Software": [
      { q: "Apakah kegunaan utama dari Git?", a: "Version Control System", b: "Web Server hosting", c: "Database Relasional", correct: "a" },
      { q: "Apakah arti dari akronim API?", a: "Application Programming Interface", b: "Active Program Internals", c: "Access Point Intranet", correct: "a" },
      { q: "Mana yang merupakan framework CSS yang populer?", a: "Tailwind CSS", b: "Python", c: "Node JS", correct: "a" }
    ],
    "Operational & Safety": [
      { q: "Apa tindakan pertama Anda saat mendeteksi kebocoran gas di area kerja?", a: "Buka ventilasi & matikan sumber api", b: "Menyiramnya dengan air", c: "Melanjutkan pekerjaan dengan cepat", correct: "a" },
      { q: "Apakah arti simbol segitiga api K3?", a: "Bahan mudah terbakar", b: "Area aman berkumpul", c: "Arah evakuasi keluar", correct: "a" },
      { q: "Helm proyek warna merah biasanya dipakai oleh siapa?", a: "Safety Officer / K3", b: "Pekerja umum", c: "Tamu kunjungan", correct: "a" }
    ],
    "default": [
      { q: "Mengapa standardisasi pekerjaan (SOP) itu penting?", a: "Menjamin keselamatan & kualitas konsisten", b: "Membatasi kreativitas karyawan", c: "Agar admin dapat menghukum bawahan", correct: "a" },
      { q: "Sikap asertif saat bekerja berarti...", a: "Menyampaikan pendapat dengan sopan namun tegas", b: "Menyetujui segala perintah tanpa tanya", c: "Marah jika tidak disetujui", correct: "a" },
      { q: "Langkah pertama menyelesaikan konflik tim adalah...", a: "Mendiskusikan inti masalah secara kekeluargaan", b: "Saling menyalahkan", c: "Melapor ke direktur utama langsung", correct: "a" }
    ]
  };

  const selectedQuiz = quizzes[kategori] || quizzes["default"];

  openModal({
    title: `${type} — ${escapeHtml(planJudul)}`,
    size: "md",
    bodyHtml: `
      <div class="space-y-4 text-left">
        <p class="text-xs text-slate-500 leading-normal">Uji pemahaman Anda tentang materi training ini. Pilih satu jawaban terbaik untuk setiap pertanyaan.</p>
        <form id="quiz-form" class="space-y-4">
          ${selectedQuiz.map((q, idx) => `
            <div class="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <p class="text-xs font-bold text-slate-800">${idx + 1}. ${escapeHtml(q.q)}</p>
              <div class="space-y-1.5 text-xs text-slate-600 font-medium">
                <label class="flex items-center gap-2 cursor-pointer hover:text-slate-800">
                  <input type="radio" name="q-${idx}" value="a" required class="accent-maroon-700">
                  <span>A. ${escapeHtml(q.a)}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer hover:text-slate-800">
                  <input type="radio" name="q-${idx}" value="b" class="accent-maroon-700">
                  <span>B. ${escapeHtml(q.b)}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer hover:text-slate-800">
                  <input type="radio" name="q-${idx}" value="c" class="accent-maroon-700">
                  <span>C. ${escapeHtml(q.c)}</span>
                </label>
              </div>
            </div>
          `).join("")}
        </form>
      </div>`,
    footerHtml: `
      <button id="btn-quiz-cancel" class="px-4 py-2 text-slate-500 text-sm hover:bg-slate-100 rounded-lg">Batal</button>
      <button id="btn-quiz-submit" class="bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-sm px-5 py-2 rounded-lg shadow-md">Kirim Jawaban</button>`,
    onMount: m => {
      m.querySelector("#btn-quiz-cancel").onclick = closeModal;
      m.querySelector("#btn-quiz-submit").onclick = async () => {
        const form = m.querySelector("#quiz-form");
        if (!form.reportValidity()) return;

        let correctCount = 0;
        selectedQuiz.forEach((q, idx) => {
          const selected = form.querySelector(`input[name="q-${idx}"]:checked`).value;
          if (selected === q.correct) correctCount++;
        });

        const score = Math.round((correctCount / selectedQuiz.length) * 100);
        const submitBtn = m.querySelector("#btn-quiz-submit");
        submitBtn.disabled = true; submitBtn.textContent = "Menyimpan...";

        try {
          const docId = `${planId}_${session.nik}`;
          const currentProgressList = await fsGetAll(PROGRESS_COLL);
          const currentProg = currentProgressList.find(x => x.id === docId) || {
            id: docId,
            plan_id: planId,
            judul_training: planJudul,
            nik: session.nik,
            nama: session.nama,
            pretest_score: null,
            posttest_score: null,
            feedback: null,
            completed_at: null
          };

          if (type === "PRE-TEST") {
            currentProg.pretest_score = score;
          } else {
            currentProg.posttest_score = score;
          }

          await setDoc(doc(db, PROGRESS_COLL, docId), currentProg);
          toast(`Jawaban ${type} berhasil dikirim! Skor Anda: ${score}/100`, "success");
          closeModal();
          if (onDone) onDone();
        } catch (err) {
          toast("Gagal menyimpan jawaban: " + err.message, "error");
          submitBtn.disabled = false; submitBtn.textContent = "Kirim Jawaban";
        }
      };
    }
  });
}

function openFeedbackModal(planId, planJudul, session, onDone) {
  openModal({
    title: `⭐ Feedback Pelatihan — ${escapeHtml(planJudul)}`,
    size: "md",
    bodyHtml: `
      <form id="feedback-form" class="space-y-4 text-left">
        <p class="text-xs text-slate-500 leading-normal">Berikan umpan balik obyektif Anda agar kami dapat menyelenggarakan pelatihan yang lebih berkualitas.</p>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">1. Bagaimana Anda menilai kinerja Trainer / Pembicara?</label>
          <select id="fb-rating" required class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-maroon-500">
            <option value="5">Sangat Puas (⭐⭐⭐⭐⭐)</option>
            <option value="4">Puas (⭐⭐⭐⭐)</option>
            <option value="3">Cukup (⭐⭐⭐)</option>
            <option value="2">Kurang Puas (⭐⭐)</option>
            <option value="1">Sangat Kurang (⭐)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">2. Apakah materi pelatihan relevan dengan tugas harian Anda?</label>
          <select id="fb-relevance" required class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-maroon-500">
            <option value="Sangat Relevan">Sangat Relevan & Bermanfaat</option>
            <option value="Cukup Relevan">Cukup Relevan</option>
            <option value="Kurang Relevan">Kurang Relevan</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">3. Tuliskan saran, kritik, atau masukan berharga lainnya</label>
          <textarea id="fb-comments" rows="3" required placeholder="Cth: Penjelasan sudah sangat baik, alangkah baiknya jika ditambahkan modul latihan tertulis..." class="w-full px-3 py-2 border rounded-lg text-xs outline-none focus:border-maroon-500"></textarea>
        </div>
      </form>`,
    footerHtml: `
      <button id="btn-fb-cancel" class="px-4 py-2 text-slate-500 text-sm hover:bg-slate-100 rounded-lg">Batal</button>
      <button id="btn-fb-submit" class="bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-sm px-5 py-2 rounded-lg shadow-md">Kirim Feedback</button>`,
    onMount: m => {
      m.querySelector("#btn-fb-cancel").onclick = closeModal;
      m.querySelector("#btn-fb-submit").onclick = async () => {
        const form = m.querySelector("#feedback-form");
        if (!form.reportValidity()) return;

        const rating = parseInt(m.querySelector("#fb-rating").value);
        const relevance = m.querySelector("#fb-relevance").value;
        const comments = m.querySelector("#fb-comments").value.trim();

        const btn = m.querySelector("#btn-fb-submit");
        btn.disabled = true; btn.textContent = "⏳ Menyimpan...";

        try {
          const docId = `${planId}_${session.nik}`;
          const currentProgressList = await fsGetAll(PROGRESS_COLL);
          const currentProg = currentProgressList.find(x => x.id === docId) || {
            id: docId,
            plan_id: planId,
            judul_training: planJudul,
            nik: session.nik,
            nama: session.nama,
            pretest_score: null,
            posttest_score: null
          };

          currentProg.feedback = { rating, relevance, comments };
          currentProg.completed_at = new Date().toISOString();

          await setDoc(doc(db, PROGRESS_COLL, docId), currentProg);
          toast("Terima kasih atas feedback berharga Anda!", "success");
          closeModal();
          if (onDone) onDone();
        } catch (err) {
          toast("Gagal: " + err.message, "error");
          btn.disabled = false; btn.textContent = "Kirim Feedback";
        }
      };
    }
  });
}

/* ---------------------------------------------------------------------
 * 4. HRD TNA DASHBOARD & ANALYTICS
 * ------------------------------------------------------------------- */
async function renderTnaDashboard(wrap, session) {
  const allRequests = await fsGetAll(COL.DATA_TRAINING);
  const allPlans = await fsGetAll(PLAN_COLL);

  // Calculate Metrics
  const totalCompetencyRequests = allRequests.length;
  const pendingCount = allRequests.filter(x => x.status === "PENDING").length;

  let totalGap = 0;
  let gapCount = 0;
  allRequests.forEach(r => {
    const gap = r.level_diharapkan - r.level_sekarang;
    if (gap > 0) {
      totalGap += gap;
      gapCount++;
    }
  });
  const avgGap = gapCount > 0 ? (totalGap / gapCount).toFixed(1) : "0.0";

  // Group by competency title
  const compGroups = {};
  allRequests.forEach(r => {
    const title = (r.kompetensi || "").trim().toUpperCase();
    if (!title) return;
    if (!compGroups[title]) {
      compGroups[title] = {
        name: r.kompetensi,
        kategori: r.kategori,
        count: 0,
        requests: [],
        gaps: []
      };
    }
    compGroups[title].count++;
    compGroups[title].requests.push(r);
    compGroups[title].gaps.push(r.level_diharapkan - r.level_sekarang);
  });

  const recommendations = Object.values(compGroups)
    .map(g => {
      const avgG = g.gaps.reduce((a, b) => a + b, 0) / g.gaps.length;
      return {
        ...g,
        avgGap: avgG.toFixed(1)
      };
    })
    .sort((a, b) => b.count - a.count);

  wrap.innerHTML = `
    <!-- Top Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gap Keahlian Teridentifikasi</p>
        <p class="text-2xl font-bold text-slate-800">${totalCompetencyRequests}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <p class="text-xs font-bold text-red-500 uppercase tracking-wider mb-1">Rata-rata Gap Keahlian</p>
        <p class="text-2xl font-bold text-rose-600">-${avgGap} Level</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <p class="text-xs font-bold text-amber-500 uppercase tracking-wider mb-1">Pengajuan Perlu Review</p>
        <p class="text-2xl font-bold text-amber-600">${pendingCount}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <p class="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">Program Pelatihan Aktif</p>
        <p class="text-2xl font-bold text-emerald-600">${allPlans.length}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- RECOMMENDATION ENGINE PANEL (TNA) -->
      <div class="lg:col-span-2 space-y-6">
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 class="font-bold text-slate-800 flex items-center gap-2">
                TNA Analytical Intelligence Engine
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Pengelompokan gap keahlian mayoritas otomatis untuk penghematan budget training.</p>
            </div>
            <button id="btn-create-shared-class" class="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition">
              + Jadwalkan Kelas Bersama
            </button>
          </div>

          <div class="space-y-3">
            ${recommendations.length === 0 ? `
              <p class="text-center text-sm text-slate-400 py-10">Belum ada data kompetensi untuk dianalisis.</p>
            ` : recommendations.slice(0, 3).map((rec, i) => {
              const bgTones = ["bg-rose-50 border-rose-100", "bg-amber-50 border-amber-100", "bg-blue-50 border-blue-100"];
              const borderTone = bgTones[i % bgTones.length] || "bg-slate-50 border-slate-100";

              return `
                <div class="p-4 rounded-xl border ${borderTone} flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div class="space-y-1 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-0.5 bg-slate-200/60 text-slate-700 rounded text-[10px] font-bold uppercase tracking-wider">${escapeHtml(rec.kategori)}</span>
                      <span class="text-xs text-slate-400">Diminta oleh <b>${rec.count} Karyawan</b></span>
                    </div>
                    <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(rec.name)}</h4>
                    <p class="text-xs text-slate-500">Rata-rata gap keahlian adalah <span class="font-semibold text-rose-600">-${rec.avgGap} tingkat</span>.</p>
                  </div>
                  <button data-rec-name="${escapeHtml(rec.name)}" data-rec-cat="${escapeHtml(rec.kategori)}" class="btn-create-plan-from-rec shrink-0 px-3.5 py-1.5 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 text-xs font-semibold rounded-lg transition shadow-xs">
                    Buat Jadwal Pelatihan
                  </button>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- LIST OF SCHEDULED TRAINING PLANS WITH PROGRESS TRACKING -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 class="font-bold text-slate-800">Daftar Jadwal Program Pelatihan & Progress Peserta</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                  <th class="py-3 px-4">Nama Pelatihan</th>
                  <th class="py-3 px-4">Trainer / Lembaga</th>
                  <th class="py-3 px-4">Tanggal Pelaksanaan</th>
                  <th class="py-3 px-4 text-right">Biaya (Est)</th>
                  <th class="py-3 px-4 text-center">Peserta</th>
                  <th class="py-3 px-4 text-center">Progress TTD/Test</th>
                  <th class="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 text-sm">
                ${allPlans.length === 0 ? `
                  <tr>
                    <td colspan="7" class="py-10 text-center text-slate-400">Belum ada program pelatihan terjadwal.</td>
                  </tr>
                ` : allPlans.map(p => {
                  let statusTone = "slate";
                  if (p.status === "SCHEDULED") statusTone = "amber";
                  if (p.status === "ONGOING") statusTone = "blue";
                  if (p.status === "COMPLETED") statusTone = "green";

                  return `
                    <tr class="hover:bg-slate-50/50 transition">
                      <td class="py-3.5 px-4 font-semibold text-slate-800">
                        <div class="font-bold">${escapeHtml(p.judul)}</div>
                        <div class="text-[10px] text-slate-400">ID: ${p.id}</div>
                      </td>
                      <td class="py-3.5 px-4 text-slate-500">${escapeHtml(p.trainer || "-")}</td>
                      <td class="py-3.5 px-4 text-slate-400">${p.tanggal ? fmtDateShort(p.tanggal) : "-"}</td>
                      <td class="py-3.5 px-4 text-right font-medium text-slate-600">${p.estimasi_biaya ? "Rp " + p.estimasi_biaya.toLocaleString("id-ID") : "-"}</td>
                      <td class="py-3.5 px-4 text-center font-bold text-blue-600">${(p.peserta || []).length} Orang</td>
                      <td class="py-3.5 px-4 text-center">
                        <button class="btn-view-participants text-xs text-maroon-700 hover:underline font-bold" data-plan-id="${p.id}" data-judul="${escapeHtml(p.judul)}">
                          🔎 Lihat Progress
                        </button>
                      </td>
                      <td class="py-3.5 px-4">${badge(p.status, statusTone)}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- DISTRIBUTIONS SIDEBAR -->
      <div class="space-y-6">
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h4 class="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">Distribusi Berdasarkan Kategori</h4>
          <div class="space-y-3">
            ${Object.entries(
              allRequests.reduce((acc, r) => {
                acc[r.kategori || "Lain-lain"] = (acc[r.kategori || "Lain-lain"] || 0) + 1;
                return acc;
              }, {})
            ).map(([cat, count]) => {
              const pct = totalCompetencyRequests > 0 ? (count / totalCompetencyRequests) * 100 : 0;
              return `
                <div class="space-y-1 text-xs">
                  <div class="flex justify-between text-slate-600 font-medium">
                    <span>${escapeHtml(cat)}</span>
                    <span class="font-semibold text-slate-800">${count} (${pct.toFixed(0)}%)</span>
                  </div>
                  <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="bg-maroon-700 h-full rounded-full" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 text-xs leading-relaxed text-slate-500">
          <h4 class="font-bold text-slate-800 text-sm">💡 Informasi Kompetensi & TNA</h4>
          <p>TNA (Training Need Analysis) mengumpulkan gap antara kemampuan riil staf sekarang dan performa yang diharapkan agar rencana pelatihan tepat sasaran & hemat budget.</p>
        </div>
      </div>
    </div>
  `;

  // Attach click listeners to create training plans
  wrap.querySelectorAll(".btn-create-plan-from-rec").forEach(btn => {
    btn.onclick = async () => {
      const recName = btn.dataset.recName;
      const recCat = btn.dataset.recCat;
      await openCreatePlanModal(recName, recCat, async () => {
        await renderTnaDashboard(wrap, session);
      });
    };
  });

  wrap.querySelector("#btn-create-shared-class").onclick = async () => {
    await openCreatePlanModal("", "", async () => {
      await renderTnaDashboard(wrap, session);
    });
  };

  // View interactive participant progress
  wrap.querySelectorAll(".btn-view-participants").forEach(btn => {
    btn.onclick = () => {
      const planId = btn.dataset.planId;
      const planJudul = btn.dataset.judul;
      openParticipantsProgressModal(planId, planJudul);
    };
  });
}

async function openParticipantsProgressModal(planId, planJudul) {
  openModal({
    title: `🔎 Progress Peserta — ${escapeHtml(planJudul)}`,
    size: "lg",
    bodyHtml: `
      <div class="space-y-4 text-left">
        <p class="text-xs text-slate-500">Berikut adalah daftar peserta beserta progress pengisian Pre-Test, Post-Test, dan rating kuesioner feedback dari database.</p>
        <div id="participants-list-wrap" class="overflow-x-auto border rounded-xl">
           <table class="w-full text-sm">
             <thead class="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wide">
               <tr class="border-b">
                 <th class="py-3 px-4 text-left">Nama Peserta</th>
                 <th class="py-3 px-4 text-center">Skor Pre-Test</th>
                 <th class="py-3 px-4 text-center">Skor Post-Test</th>
                 <th class="py-3 px-4 text-center">Rating Kuesioner</th>
                 <th class="py-3 px-4 text-left">Saran / Masukan</th>
                 <th class="py-3 px-4 text-center">Progress</th>
               </tr>
             </thead>
             <tbody id="tbl-participants-body" class="divide-y text-xs text-slate-700">
               <tr><td colspan="6" class="p-6 text-center text-slate-400">Loading progress data...</td></tr>
             </tbody>
           </table>
        </div>
      </div>`,
    footerHtml: `
      <button id="btn-part-close" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm">Tutup</button>`,
    onMount: async m => {
      m.querySelector("#btn-part-close").onclick = closeModal;
      const tbody = m.querySelector("#tbl-participants-body");

      try {
        // Fetch plan to get registered attendees
        const plans = await fsGetAll(PLAN_COLL);
        const plan = plans.find(x => x.id === planId);
        if (!plan) {
          tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-red-600 font-bold">Plan tidak ditemukan!</td></tr>`;
          return;
        }

        const attendees = plan.peserta || [];
        if (attendees.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Belum ada peserta yang didaftarkan.</td></tr>`;
          return;
        }

        // Fetch progress records
        const allProgress = await fsGetAll(PROGRESS_COLL);
        const planProgress = allProgress.filter(x => x.plan_id === planId);

        tbody.innerHTML = attendees.map(att => {
          const prog = planProgress.find(x => x.nama === att) || { pretest_score: null, posttest_score: null, feedback: null };
          
          let pct = 0;
          if (prog.pretest_score !== null && prog.pretest_score !== undefined) pct += 33;
          if (prog.posttest_score !== null && prog.posttest_score !== undefined) pct += 33;
          if (prog.feedback !== null && prog.feedback !== undefined) pct += 34;

          const preText = prog.pretest_score !== null ? `${prog.pretest_score}/100` : "-";
          const postText = prog.posttest_score !== null ? `${prog.posttest_score}/100` : "-";
          const ratingText = prog.feedback ? `${"⭐".repeat(prog.feedback.rating)}` : "-";
          const commentsText = prog.feedback ? escapeHtml(prog.feedback.comments) : "-";

          return `
            <tr class="hover:bg-slate-50 transition">
              <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(att)}</td>
              <td class="py-3 px-4 text-center font-bold text-amber-600">${preText}</td>
              <td class="py-3 px-4 text-center font-bold text-emerald-600">${postText}</td>
              <td class="py-3 px-4 text-center">${ratingText}</td>
              <td class="py-3 px-4 max-w-xs truncate" title="${commentsText}">${commentsText}</td>
              <td class="py-3 px-4 text-center">
                 <span class="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold">${pct}%</span>
              </td>
            </tr>`;
        }).join("");

      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${err.message}</td></tr>`;
      }
    }
  });
}

async function openCreatePlanModal(defaultJudul = "", defaultKategori = "", onSuccess) {
  let activeKaryawan = [];
  try {
     const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
     activeKaryawan = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
     activeKaryawan.sort((a,b) => (a.nama_karyawan||"").localeCompare(b.nama_karyawan||""));
  } catch(e) {
     console.warn("Gagal mengambil daftar karyawan dari database:", e);
  }

  openModal({
    title: "Susun Rencana & Jadwalkan Pelatihan",
    size: "lg",
    bodyHtml: `
      <form id="form-create-plan" class="space-y-4 text-left">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
           <!-- Sisi Kiri: Detail Program -->
           <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Nama Program Pelatihan</label>
                <input type="text" id="plan-judul" required value="${escapeHtml(defaultJudul)}" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="Contoh: Pelatihan Ahli Excel & VBA">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Kategori Pelatihan</label>
                <select id="plan-kategori" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white">
                  <option value="Soft & Technical Skills" ${defaultKategori === 'Soft & Technical Skills' ? 'selected' : ''}>Soft & Technical Skills</option>
                  <option value="IT & Software" ${defaultKategori === 'IT & Software' ? 'selected' : ''}>IT & Software</option>
                  <option value="Operational & Safety" ${defaultKategori === 'Operational & Safety' ? 'selected' : ''}>Operational & Safety</option>
                  <option value="Leadership" ${defaultKategori === 'Leadership' ? 'selected' : ''}>Leadership</option>
                  <option value="Lain-lain" ${defaultKategori === 'Lain-lain' ? 'selected' : ''}>Lain-lain</option>
                  <option value="NEW_CATEGORY">+ Tambah Kategori Baru...</option>
                </select>
                <div id="wrap-kategori-baru" class="hidden mt-2">
                   <input type="text" id="plan-kategori-baru" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-xs" placeholder="Ketik Kategori Baru...">
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Trainer / Lembaga</label>
                  <input type="text" id="plan-trainer" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="Lembaga Pelaksana">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Tanggal Pelaksanaan</label>
                  <input type="date" id="plan-tanggal" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500">
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Estimasi Biaya (Rp)</label>
                <input type="number" id="plan-biaya" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="Anggaran Pelatihan">
              </div>
              
              <!-- Lampiran Dokumen dan Link -->
              <div class="border-t border-slate-100 pt-3 mt-3 space-y-3">
                 <p class="text-xs font-bold text-maroon-700 uppercase">Lampiran & Tautan Pelatihan</p>
                 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-bold text-slate-600 mb-1">URL / Link Dokumen (Drive/PDF)</label>
                      <input type="url" id="plan-dokumen-url" class="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="https://drive.google.com/...">
                    </div>
                    <div>
                      <label class="block text-xs font-bold text-slate-600 mb-1">URL / Link Pelatihan (Zoom/Referensi)</label>
                      <input type="url" id="plan-link-url" class="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="https://zoom.us/...">
                    </div>
                 </div>
              </div>
           </div>
           
           <!-- Sisi Kanan: Daftar Checkbox Karyawan -->
           <div class="flex flex-col h-full border-l border-slate-100 pl-4">
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Pilih Daftar Karyawan Terpilih</label>
              <p class="text-[10px] text-slate-400 mb-2">Pilih karyawan dari database untuk diikutsertakan dalam rencana pelatihan ini.</p>
              <div id="plan-peserta-checkbox-container" class="flex-1 max-h-80 overflow-y-auto border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
                 ${activeKaryawan.length === 0 ? `
                   <p class="text-xs text-slate-400 text-center py-10">Belum ada karyawan aktif terdaftar di database.</p>
                 ` : activeKaryawan.map(k => `
                   <label class="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer p-1.5 hover:bg-white rounded transition">
                      <input type="checkbox" name="plan-peserta-checkbox" value="${escapeHtml(k.nama_karyawan)}" class="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                      <div>
                         <span class="font-bold text-slate-800">${escapeHtml(k.nama_karyawan)}</span>
                         <div class="text-[10px] text-slate-400">${escapeHtml(k.jabatan || "-")} (${escapeHtml(k.cabang || "-")})</div>
                      </div>
                   </label>
                 `).join("")}
              </div>
           </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button id="btn-cancel-plan" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Batal</button>
      <button id="btn-save-plan" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-semibold rounded-lg transition shadow-md">Ajukan Ke GM & Finance</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-cancel-plan").onclick = closeModal;

      // Handle custom category toggling
      const selectKategori = m.querySelector("#plan-kategori");
      const wrapKategoriBaru = m.querySelector("#wrap-kategori-baru");
      const inputKategoriBaru = m.querySelector("#plan-kategori-baru");

      selectKategori.onchange = () => {
         const isNew = selectKategori.value === "NEW_CATEGORY";
         wrapKategoriBaru.classList.toggle("hidden", !isNew);
         if (isNew) {
            inputKategoriBaru.focus();
         }
      };

      m.querySelector("#btn-save-plan").onclick = async () => {
        const form = m.querySelector("#form-create-plan");
        if (!form.reportValidity()) return;

        const judul = m.querySelector("#plan-judul").value.trim();
        const trainer = m.querySelector("#plan-trainer").value.trim();
        const tanggal = m.querySelector("#plan-tanggal").value;
        const estimasi_biaya = parseFloat(m.querySelector("#plan-biaya").value) || 0;
        const dokumen_url = m.querySelector("#plan-dokumen-url").value.trim();
        const link_url = m.querySelector("#plan-link-url").value.trim();

        // Get selected category
        let kategori = selectKategori.value;
        if (kategori === "NEW_CATEGORY") {
           kategori = inputKategoriBaru.value.trim();
           if (!kategori) {
              return toast("Silakan masukkan kategori baru!", "warning");
           }
        }

        // Get selected participants from checkboxes
        const selectedCheckboxes = m.querySelectorAll('input[name="plan-peserta-checkbox"]:checked');
        const peserta = Array.from(selectedCheckboxes).map(cb => cb.value);

        if (peserta.length === 0) {
           return toast("Pilih minimal satu karyawan sebagai peserta pelatihan!", "warning");
        }

        const btn = m.querySelector("#btn-save-plan");
        btn.disabled = true;
        btn.textContent = "Mengajukan...";

        try {
          const planId = genId("PLAN");
          await fsAdd(PLAN_COLL, {
            id: planId,
            judul,
            kategori,
            trainer,
            tanggal,
            peserta,
            estimasi_biaya,
            dokumen_url,
            link_url,
            status: "PENDING_GM", // Starts with GM approval
            created_at: new Date().toISOString()
          }, planId);

          toast("Rencana pelatihan diajukan! Menunggu persetujuan GM.", "success");
          closeModal();
          if (onSuccess) onSuccess();

        } catch (err) {
          toast("Error: " + err.message, "error");
          btn.disabled = false;
          btn.textContent = "Ajukan Ke GM & Finance";
        }
      };
    }
  });
}

/* ---------------------------------------------------------------------
 * 5. ALL EMPLOYEE REQUESTS (HRD WORKSPACE)
 * ------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
 * 5. ALL EMPLOYEE REQUESTS (HRD WORKSPACE & GM / FINANCE APPROVALS)
 * ------------------------------------------------------------------- */
async function renderAllRequests(wrap, session) {
  const userRole = (session.role || "").toUpperCase();
  const isHrd = ["HRD", "SUPERADMIN", "ADMIN", "MANAGER", "ATASAN", "SPV", "DIRECTOR", "GM", "FINANCE"].includes(userRole);
  const isGm = ["GM", "SUPERADMIN", "DIRECTOR", "MANAGER", "ADMIN"].includes(userRole);
  const isFinance = ["FINANCE", "SUPERADMIN", "ADMIN", "MANAGER"].includes(userRole);

  const allData = await fsGetAll(COL.DATA_TRAINING);
  const allPlans = await fsGetAll(PLAN_COLL);

  let html = `<div class="space-y-6 pb-10">`;

  // SECTION 1: HRD Review of Employee-initiated competency requests
  if (isHrd) {
    const pendingData = allData.filter(x => x.status === "PENDING")
      .sort((a, b) => new Date(b.tanggal_pengajuan) - new Date(a.tanggal_pengajuan));

    html += `
      <!-- Pending Demands -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 class="font-bold text-slate-800 flex items-center gap-2">
          <span class="w-1.5 h-4 bg-maroon-700 rounded-full"></span>
          Review Pengajuan Kompetensi Karyawan (${pendingData.length})
        </h3>
        <p class="text-xs text-slate-400">Tinjau kesenjangan keahlian yang diajukan oleh karyawan sebelum diubah menjadi Program Rencana Pelatihan.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th class="py-3 px-4">Karyawan</th>
                <th class="py-3 px-4">Kompetensi</th>
                <th class="py-3 px-4 text-center">Tingkat Saat Ini</th>
                <th class="py-3 px-4 text-center">Ekspektasi</th>
                <th class="py-3 px-4">Alasan Kebutuhan</th>
                <th class="py-3 px-4">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-sm">
              ${pendingData.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-10 text-center text-slate-400">Tidak ada pengajuan kompetensi baru yang tertunda.</td>
                </tr>
              ` : pendingData.map(r => {
                return `
                  <tr class="hover:bg-slate-50/50 transition">
                    <td class="py-3.5 px-4 font-semibold text-slate-800">${escapeHtml(r.nama_karyawan)}</td>
                    <td class="py-3.5 px-4 font-medium text-slate-700">${escapeHtml(r.kompetensi)}</td>
                    <td class="py-3.5 px-4 text-center text-amber-600 font-semibold">${r.level_sekarang} / 5</td>
                    <td class="py-3.5 px-4 text-center text-blue-600 font-semibold">${r.level_diharapkan} / 5</td>
                    <td class="py-3.5 px-4 text-slate-500 max-w-xs truncate" title="${escapeHtml(r.alasan)}">${escapeHtml(r.alasan)}</td>
                    <td class="py-3.5 px-4 flex items-center gap-2">
                      <button data-action="approve" data-id="${r.id}" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded transition shadow-sm">Setuju</button>
                      <button data-action="reject" data-id="${r.id}" class="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded transition shadow-sm">Tolak</button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // SECTION 2: GM Review of HRD Training Plans
  if (isGm) {
    const pendingGmPlans = allPlans.filter(p => p.status === "PENDING_GM");
    html += `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 class="font-bold text-slate-800 flex items-center gap-2">
          <span class="w-1.5 h-4 bg-blue-600 rounded-full"></span>
          📥 Antrean Persetujuan Rencana Pelatihan (General Manager) (${pendingGmPlans.length})
        </h3>
        <p class="text-xs text-slate-400">Setujui program pelatihan yang disusun HRD agar dapat diteruskan ke Finance untuk pencairan anggaran.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th class="py-3 px-4">Nama Pelatihan</th>
                <th class="py-3 px-4">Trainer / Lembaga</th>
                <th class="py-3 px-4">Tanggal Pelaksanaan</th>
                <th class="py-3 px-4 text-right">Estimasi Biaya</th>
                <th class="py-3 px-4">Peserta Terpilih</th>
                <th class="py-3 px-4">Dokumen & Tautan</th>
                <th class="py-3 px-4 text-center">Keputusan GM</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-sm">
              ${pendingGmPlans.length === 0 ? `
                <tr>
                  <td colspan="7" class="py-10 text-center text-slate-400">Tidak ada pengajuan rencana pelatihan untuk disetujui GM saat ini.</td>
                </tr>
              ` : pendingGmPlans.map(p => {
                return `
                  <tr class="hover:bg-slate-50/50 transition">
                    <td class="py-3.5 px-4">
                      <div class="font-bold text-slate-800">${escapeHtml(p.judul)}</div>
                      <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold uppercase">${escapeHtml(p.kategori)}</span>
                    </td>
                    <td class="py-3.5 px-4 text-slate-500">${escapeHtml(p.trainer || "-")}</td>
                    <td class="py-3.5 px-4 text-slate-400">${p.tanggal ? fmtDateShort(p.tanggal) : "-"}</td>
                    <td class="py-3.5 px-4 text-right font-bold text-slate-700">Rp ${(p.estimasi_biaya || 0).toLocaleString("id-ID")}</td>
                    <td class="py-3.5 px-4 text-xs max-w-xs truncate" title="${(p.peserta || []).join(", ")}">
                      ${(p.peserta || []).join(", ")}
                    </td>
                    <td class="py-3.5 px-4 space-y-1">
                      ${p.dokumen_url ? `<a href="${p.dokumen_url}" target="_blank" class="text-xs text-maroon-700 hover:underline block font-bold">📄 Buka Dokumen</a>` : ""}
                      ${p.link_url ? `<a href="${p.link_url}" target="_blank" class="text-xs text-blue-600 hover:underline block font-bold">🔗 Buka Link</a>` : ""}
                      ${!p.dokumen_url && !p.link_url ? `<span class="text-slate-300 text-xs">-</span>` : ""}
                    </td>
                    <td class="py-3.5 px-4 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <button data-plan-action="gm-approve" data-id="${p.id}" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-sm">Setujui GM</button>
                        <button data-plan-action="gm-reject" data-id="${p.id}" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition shadow-sm">Tolak</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // SECTION 3: Finance Review of Training Plan budgets
  if (isFinance) {
    const pendingFinancePlans = allPlans.filter(p => p.status === "PENDING_FINANCE");
    html += `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 class="font-bold text-slate-800 flex items-center gap-2">
          <span class="w-1.5 h-4 bg-emerald-600 rounded-full"></span>
          💰 Antrean Persetujuan Anggaran (Finance) (${pendingFinancePlans.length})
        </h3>
        <p class="text-xs text-slate-400">Verifikasi dan setujui anggaran biaya pelatihan yang sudah disetujui oleh GM agar program dapat resmi terlaksana.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th class="py-3 px-4">Nama Pelatihan</th>
                <th class="py-3 px-4">Trainer / Lembaga</th>
                <th class="py-3 px-4">Tanggal Pelaksanaan</th>
                <th class="py-3 px-4 text-right">Anggaran Pelatihan</th>
                <th class="py-3 px-4">Peserta Terpilih</th>
                <th class="py-3 px-4">Dokumen & Tautan</th>
                <th class="py-3 px-4 text-center">Keputusan Budget</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-sm">
              ${pendingFinancePlans.length === 0 ? `
                <tr>
                  <td colspan="7" class="py-10 text-center text-slate-400">Tidak ada anggaran pelatihan yang menunggu keputusan saat ini.</td>
                </tr>
              ` : pendingFinancePlans.map(p => {
                return `
                  <tr class="hover:bg-slate-50/50 transition">
                    <td class="py-3.5 px-4">
                      <div class="font-bold text-slate-800">${escapeHtml(p.judul)}</div>
                      <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold uppercase">${escapeHtml(p.kategori)}</span>
                    </td>
                    <td class="py-3.5 px-4 text-slate-500">${escapeHtml(p.trainer || "-")}</td>
                    <td class="py-3.5 px-4 text-slate-400">${p.tanggal ? fmtDateShort(p.tanggal) : "-"}</td>
                    <td class="py-3.5 px-4 text-right font-black text-rose-600">Rp ${(p.estimasi_biaya || 0).toLocaleString("id-ID")}</td>
                    <td class="py-3.5 px-4 text-xs max-w-xs truncate" title="${(p.peserta || []).join(", ")}">
                      ${(p.peserta || []).join(", ")}
                    </td>
                    <td class="py-3.5 px-4 space-y-1">
                      ${p.dokumen_url ? `<a href="${p.dokumen_url}" target="_blank" class="text-xs text-maroon-700 hover:underline block font-bold">📄 Buka Dokumen</a>` : ""}
                      ${p.link_url ? `<a href="${p.link_url}" target="_blank" class="text-xs text-blue-600 hover:underline block font-bold">🔗 Buka Link</a>` : ""}
                      ${!p.dokumen_url && !p.link_url ? `<span class="text-slate-300 text-xs">-</span>` : ""}
                    </td>
                    <td class="py-3.5 px-4 text-center">
                      <div class="flex items-center justify-center gap-2">
                        <button data-plan-action="finance-approve" data-id="${p.id}" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-sm">Setujui Budget</button>
                        <button data-plan-action="finance-reject" data-id="${p.id}" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition shadow-sm">Tolak</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // SECTION 4: HRD tracking of created Training Plans and their approval status
  if (isHrd) {
    const trackedPlans = allPlans.filter(p => ["PENDING_GM", "PENDING_FINANCE", "REJECTED_GM", "REJECTED_FINANCE"].includes(p.status));
    html += `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 class="font-bold text-slate-800 flex items-center gap-2">
          <span class="w-1.5 h-4 bg-slate-500 rounded-full"></span>
          🔄 Tracking Persetujuan Rencana Pelatihan HRD
        </h3>
        <p class="text-xs text-slate-400">Pantau proses persetujuan berjenjang dari General Manager (GM) dan Finance.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th class="py-3 px-4">Nama Pelatihan</th>
                <th class="py-3 px-4">Trainer / Lembaga</th>
                <th class="py-3 px-4">Tanggal Pelaksanaan</th>
                <th class="py-3 px-4 text-right">Biaya (Est)</th>
                <th class="py-3 px-4">Peserta</th>
                <th class="py-3 px-4">Status Pengajuan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-sm">
              ${trackedPlans.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-10 text-center text-slate-400">Tidak ada pengajuan rencana aktif yang sedang dilacak.</td>
                </tr>
              ` : trackedPlans.map(p => {
                let badgeTone = "slate";
                let statusLabel = p.status;
                if (p.status === "PENDING_GM") { badgeTone = "blue"; statusLabel = "Menunggu GM"; }
                else if (p.status === "PENDING_FINANCE") { badgeTone = "amber"; statusLabel = "Menunggu Finance (Budget)"; }
                else if (p.status === "REJECTED_GM") { badgeTone = "red"; statusLabel = "Ditolak GM"; }
                else if (p.status === "REJECTED_FINANCE") { badgeTone = "red"; statusLabel = "Ditolak Finance"; }

                return `
                  <tr class="hover:bg-slate-50/50 transition">
                    <td class="py-3.5 px-4 font-semibold text-slate-800">
                      <div>${escapeHtml(p.judul)}</div>
                    </td>
                    <td class="py-3.5 px-4 text-slate-500">${escapeHtml(p.trainer || "-")}</td>
                    <td class="py-3.5 px-4 text-slate-400">${p.tanggal ? fmtDateShort(p.tanggal) : "-"}</td>
                    <td class="py-3.5 px-4 text-right font-medium text-slate-600">Rp ${(p.estimasi_biaya || 0).toLocaleString("id-ID")}</td>
                    <td class="py-3.5 px-4 text-xs font-bold text-blue-600">${(p.peserta || []).length} Orang</td>
                    <td class="py-3.5 px-4">${badge(statusLabel, badgeTone)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // SECTION 5: All approved competency demands resolved
  if (isHrd) {
    const otherData = allData.filter(x => x.status !== "PENDING")
      .sort((a, b) => new Date(b.tanggal_pengajuan) - new Date(a.tanggal_pengajuan));
    html += `
      <!-- Approved / Managed History -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Riwayat Pengajuan Terselesaikan</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                <th class="py-3 px-4">Karyawan</th>
                <th class="py-3 px-4">Kompetensi</th>
                <th class="py-3 px-4">Kategori</th>
                <th class="py-3 px-4 text-center">Gap</th>
                <th class="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 text-sm">
              ${otherData.length === 0 ? `
                <tr>
                  <td colspan="5" class="py-8 text-center text-slate-400">Belum ada riwayat pengajuan terselesaikan.</td>
                </tr>
              ` : otherData.map(r => {
                const gap = r.level_sekarang - r.level_diharapkan;
                let statusTone = "slate";
                if (r.status === "APPROVED") statusTone = "blue";
                if (r.status === "SCHEDULED") statusTone = "green";
                if (r.status === "REJECTED") statusTone = "red";

                return `
                  <tr class="hover:bg-slate-50/50 transition">
                    <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(r.nama_karyawan)}</td>
                    <td class="py-3 px-4 text-slate-700 font-medium">${escapeHtml(r.kompetensi)}</td>
                    <td class="py-3 px-4 text-slate-500">${escapeHtml(r.kategori)}</td>
                    <td class="py-3 px-4 text-center font-semibold text-rose-600">${gap}</td>
                    <td class="py-3 px-4">${badge(r.status, statusTone)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  html += `</div>`;
  wrap.innerHTML = html;

  // Attach Approval Events for competency requests
  wrap.querySelectorAll("[data-action]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      const actionText = action === "approve" ? "APPROVED" : "REJECTED";
      const actionName = action === "approve" ? "menyetujui" : "menolak";

      if (confirm(`Apakah Anda yakin ingin ${actionName} pengajuan kompetensi ini?`)) {
        try {
          await fsUpdate(COL.DATA_TRAINING, id, { status: actionText });
          toast(`Pengajuan kompetensi ${actionText}!`, "success");
          await renderAllRequests(wrap, session);
        } catch (err) {
          toast("Error: " + err.message, "error");
        }
      }
    };
  });

  // Attach Approval Events for Training Plans (GM / Finance)
  wrap.querySelectorAll("[data-plan-action]").forEach(btn => {
    btn.onclick = async () => {
      const planId = btn.dataset.id;
      const act = btn.dataset.planAction;

      let nextStatus = "";
      let confirmMsg = "";
      let toastMsg = "";

      if (act === "gm-approve") {
        nextStatus = "PENDING_FINANCE";
        confirmMsg = "Setujui rencana pelatihan ini dan teruskan ke Finance untuk review budget?";
        toastMsg = "Rencana pelatihan disetujui GM & diteruskan ke Finance!";
      } else if (act === "gm-reject") {
        nextStatus = "REJECTED_GM";
        confirmMsg = "Tolak rencana pelatihan ini?";
        toastMsg = "Rencana pelatihan ditolak oleh GM.";
      } else if (act === "finance-approve") {
        nextStatus = "SCHEDULED";
        confirmMsg = "Setujui anggaran untuk program pelatihan ini dan aktifkan jadwal pelaksanaan secara resmi?";
        toastMsg = "Anggaran disetujui! Program pelatihan sekarang aktif & dijadwalkan.";
      } else if (act === "finance-reject") {
        nextStatus = "REJECTED_FINANCE";
        confirmMsg = "Tolak anggaran program pelatihan ini?";
        toastMsg = "Anggaran program ditolak oleh Finance.";
      }

      if (confirm(confirmMsg)) {
        try {
          await fsUpdate(PLAN_COLL, planId, { status: nextStatus });
          toast(toastMsg, "success");

          // If Finance approved, also mark related requests as SCHEDULED in database and send alerts to employees
          if (nextStatus === "SCHEDULED") {
            const plans = await fsGetAll(PLAN_COLL);
            const p = plans.find(x => x.id === planId);
            if (p) {
              const allReqs = await fsGetAll(COL.DATA_TRAINING);
              for (const req of allReqs) {
                if ((p.peserta || []).includes(req.nama_karyawan) && req.kompetensi.toLowerCase().includes(p.judul.split(" ")[0].toLowerCase())) {
                  await fsUpdate(COL.DATA_TRAINING, req.id, {
                    status: "SCHEDULED",
                    training_plan_id: planId
                  });
                }
              }

              // Send push notifications and in-app alerts to each added participant
              for (const name of (p.peserta || [])) {
                try {
                  const userQ = query(collection(db, COL.USERS), where("nama", "==", name), limit(1));
                  const userSnap = await getDocs(userQ);
                  if (!userSnap.empty) {
                    const targetUser = userSnap.docs[0].id;
                    await notifyUser(targetUser, "Undangan Pelatihan Baru", `Anda terpilih mengikuti program "${p.judul}" oleh trainer ${p.trainer || "-"} pada tanggal ${p.tanggal}. Silakan cek tab Program Pelatihan Anda.`, "/#training");
                  }
                } catch(e) {
                   console.warn("Gagal mengirim notifikasi ke user:", name, e);
                }
              }
            }
          }

          await renderAllRequests(wrap, session);
        } catch (err) {
          toast("Error: " + err.message, "error");
        }
      }
    };
  });
}
