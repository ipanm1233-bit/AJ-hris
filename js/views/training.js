import { db, COL, collection, query, where, getDocs, orderBy, limit, addDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, fmtDateShort, escapeHtml, genId } from "../utils.js";
import { avatar, badge, emptyState } from "../components.js";

export async function mount(container, { session }) {
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";
  const tabHeader = container.querySelector("#training-tab-header");
  const contentWrap = container.querySelector("#training-content");

  let activeTab = isHrd ? "tna" : "my-requests";

  // Seeding initial data if empty to make the experience extremely rich on first load
  await seedTrainingDataIfEmpty();

  // Render Tab Headers
  function renderTabs() {
    let tabsHtml = "";
    if (isHrd) {
      tabsHtml += `
        <button id="tab-tna" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'tna' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
          📊 TNA Dashboard
        </button>
        <button id="tab-requests" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'requests' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
          📥 Pengajuan Karyawan
        </button>
      `;
    }
    tabsHtml += `
      <button id="tab-my-requests" class="px-4 py-2 text-sm font-semibold rounded-lg transition ${activeTab === 'my-requests' ? 'bg-maroon-700 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'}">
        🔑 Pengajuan Saya
      </button>
    `;
    tabHeader.innerHTML = tabsHtml;

    // Register Tab Listeners
    if (isHrd) {
      container.querySelector("#tab-tna").onclick = () => { activeTab = "tna"; renderTabs(); loadActiveTab(); };
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
      console.error("Failed to load tab:", err);
      contentWrap.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl">Error: ${err.message}</div>`;
    }
  }

  renderTabs();
  await loadActiveTab();
}

/* ---------------------------------------------------------------------
 * 1. SEED DATA FUNCTION (FOR FIRST TIME ACCESS)
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
    },
    {
      id: "TNA-004",
      nama_karyawan: "Heri Prasetyo",
      nik: "10294",
      kompetensi: "Public Speaking & Presentation",
      kategori: "Leadership",
      level_sekarang: 2,
      level_diharapkan: 4,
      alasan: "Meningkatkan kepercayaan diri saat presentasi project ke client.",
      status: "PENDING",
      tanggal_pengajuan: new Date(Date.now() - 1 * 24 * 3600000).toISOString(),
    }
  ];

  for (const item of mockData) {
    await fsAdd(COL.DATA_TRAINING, item, item.id);
  }

  // Also seed some training plans
  const planColl = "training_plans";
  const existingPlans = await fsGetAll(planColl);
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
      await fsAdd(planColl, plan, plan.id);
    }
  }
}

/* ---------------------------------------------------------------------
 * 2. STAFF VIEW: MY REQUESTS
 * ------------------------------------------------------------------- */
async function renderMyRequests(wrap, session) {
  const allData = await fsGetAll(COL.DATA_TRAINING);
  const myData = allData.filter(x => x.nik === session.nik || x.nama_karyawan === session.nama)
    .sort((a, b) => new Date(b.tanggal_pengajuan) - new Date(a.tanggal_pengajuan));

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

    <!-- Actions & Table -->
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
 * 3. HRD TNA DASHBOARD & ANALYTICS
 * ------------------------------------------------------------------- */
async function renderTnaDashboard(wrap, session) {
  const allRequests = await fsGetAll(COL.DATA_TRAINING);
  const allPlans = await fsGetAll("training_plans");

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

  // Recommended group training programs based on popular demand
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
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Kebutuhan Kompetensi Diidentifikasi</p>
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
                <span class="text-amber-500">⚡</span> Training Need Analytics (TNA) Engine
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Sistem secara otomatis mengelompokkan gap keahlian terbesar dari seluruh karyawan.</p>
            </div>
            <button id="btn-create-shared-class" class="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition">
              + Jadwalkan Kelas Bersama
            </button>
          </div>

          <div class="space-y-4">
            ${recommendations.length === 0 ? `
              <p class="text-center text-sm text-slate-400 py-10">Belum ada cukup data kompetensi untuk dianalisis.</p>
            ` : recommendations.map((rec, i) => {
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
                    <p class="text-xs text-slate-500">Rekomendasi program pelatihan kelompok karena rata-rata gap keahlian adalah <span class="font-semibold text-rose-600">-${rec.avgGap} tingkat</span>.</p>
                  </div>
                  <button data-rec-name="${escapeHtml(rec.name)}" data-rec-cat="${escapeHtml(rec.kategori)}" class="btn-create-plan-from-rec shrink-0 px-3.5 py-1.5 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 text-xs font-semibold rounded-lg transition shadow-xs">
                    Buat Jadwal Pelatihan
                  </button>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- LIST OF SCHEDULED TRAINING PLANS -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 class="font-bold text-slate-800">Daftar Jadwal Pelatihan Terlaksana</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                  <th class="py-3 px-4">Nama Pelatihan</th>
                  <th class="py-3 px-4">Trainer / Lembaga</th>
                  <th class="py-3 px-4">Tanggal Pelaksanaan</th>
                  <th class="py-3 px-4 text-right">Biaya (Est)</th>
                  <th class="py-3 px-4 text-center">Jumlah Peserta</th>
                  <th class="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50 text-sm">
                ${allPlans.length === 0 ? `
                  <tr>
                    <td colspan="6" class="py-10 text-center text-slate-400">Belum ada pelatihan terprogram.</td>
                  </tr>
                ` : allPlans.map(p => {
                  let statusTone = "slate";
                  if (p.status === "SCHEDULED") statusTone = "amber";
                  if (p.status === "ONGOING") statusTone = "blue";
                  if (p.status === "COMPLETED") statusTone = "green";

                  return `
                    <tr class="hover:bg-slate-50/50 transition">
                      <td class="py-3.5 px-4 font-semibold text-slate-800">${escapeHtml(p.judul)}</td>
                      <td class="py-3.5 px-4 text-slate-500">${escapeHtml(p.trainer || "-")}</td>
                      <td class="py-3.5 px-4 text-slate-400">${p.tanggal ? fmtDateShort(p.tanggal) : "-"}</td>
                      <td class="py-3.5 px-4 text-right font-medium text-slate-600">${p.estimasi_biaya ? "Rp " + p.estimasi_biaya.toLocaleString("id-ID") : "-"}</td>
                      <td class="py-3.5 px-4 text-center font-bold text-blue-600">${(p.peserta || []).length} Orang</td>
                      <td class="py-3.5 px-4">${badge(p.status, statusTone)}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- STATIC ANALYSIS SIDEBAR -->
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
          <h4 class="font-bold text-slate-800 text-sm">💡 Apa itu TNA Engine?</h4>
          <p>TNA (Training Need Analysis) adalah model analitik berbasis pengumpulan gap kompetensi. Karyawan melaporkan level keahlian rill mereka serta ekspektasi performa kerja.</p>
          <p>Jika banyak karyawan meminta kompetensi sejenis (seperti Excel atau Sertifikasi ISO), TNA menyarankan <b>Jadwal Kelas Bersama</b> untuk mengefisiensikan anggaran pelatihan korporat Andela Jaya.</p>
        </div>
      </div>
    </div>
  `;

  // Attach click listeners to create training plans
  wrap.querySelectorAll(".btn-create-plan-from-rec").forEach(btn => {
    btn.onclick = () => {
      const recName = btn.dataset.recName;
      const recCat = btn.dataset.recCat;
      openCreatePlanModal(recName, recCat, async () => {
        await renderTnaDashboard(wrap, session);
      });
    };
  });

  wrap.querySelector("#btn-create-shared-class").onclick = () => {
    openCreatePlanModal("", "", async () => {
      await renderTnaDashboard(wrap, session);
    });
  };
}

function openCreatePlanModal(defaultJudul = "", defaultKategori = "", onSuccess) {
  openModal({
    title: "📅 Susun Rencana & Jadwalkan Pelatihan",
    size: "md",
    bodyHtml: `
      <form id="form-create-plan" class="space-y-4 text-left">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Nama Program Pelatihan</label>
          <input type="text" id="plan-judul" required value="${escapeHtml(defaultJudul)}" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="Contoh: Pelatihan Ahli Excel & VBA">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Kategori Pelatihan</label>
          <select id="plan-kategori" class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500">
            <option value="Soft & Technical Skills" ${defaultKategori === 'Soft & Technical Skills' ? 'selected' : ''}>Soft & Technical Skills</option>
            <option value="IT & Software" ${defaultKategori === 'IT & Software' ? 'selected' : ''}>IT & Software</option>
            <option value="Operational & Safety" ${defaultKategori === 'Operational & Safety' ? 'selected' : ''}>Operational & Safety</option>
            <option value="Leadership" ${defaultKategori === 'Leadership' ? 'selected' : ''}>Leadership</option>
            <option value="Lain-lain" ${defaultKategori === 'Lain-lain' ? 'selected' : ''}>Lain-lain</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Trainer / Lembaga Sertifikasi</label>
            <input type="text" id="plan-trainer" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="Lembaga Pelaksana">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Tanggal Pelaksanaan</label>
            <input type="date" id="plan-tanggal" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Estimasi Biaya (Rp)</label>
            <input type="number" id="plan-biaya" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="Anggaran Pelatihan">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Daftar Karyawan Terpilih (Satu nama per baris)</label>
            <textarea id="plan-peserta" rows="3" required class="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-xs" placeholder="Budi Santoso&#10;Ani Wijaya"></textarea>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button id="btn-cancel-plan" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">Batal</button>
      <button id="btn-save-plan" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow">Simpan & Daftarkan</button>
    `,
    onMount: (m) => {
      m.querySelector("#btn-cancel-plan").onclick = closeModal;
      m.querySelector("#btn-save-plan").onclick = async () => {
        const form = m.querySelector("#form-create-plan");
        if (!form.reportValidity()) return;

        const judul = m.querySelector("#plan-judul").value.trim();
        const kategori = m.querySelector("#plan-kategori").value;
        const trainer = m.querySelector("#plan-trainer").value.trim();
        const tanggal = m.querySelector("#plan-tanggal").value;
        const estimasi_biaya = parseFloat(m.querySelector("#plan-biaya").value) || 0;
        const pesertaText = m.querySelector("#plan-peserta").value.trim();
        const peserta = pesertaText.split("\n").map(x => x.trim()).filter(Boolean);

        const btn = m.querySelector("#btn-save-plan");
        btn.disabled = true;
        btn.textContent = "Menyimpan...";

        try {
          const planId = genId("PLAN");
          await fsAdd("training_plans", {
            id: planId,
            judul,
            kategori,
            trainer,
            tanggal,
            peserta,
            estimasi_biaya,
            status: "SCHEDULED"
          }, planId);

          // Update status of relevant matching employee requests to APPROVED / SCHEDULED
          const allReqs = await fsGetAll(COL.DATA_TRAINING);
          for (const req of allReqs) {
            if (peserta.includes(req.nama_karyawan) && req.kompetensi.toLowerCase().includes(judul.split(" ")[0].toLowerCase())) {
              await fsUpdate(COL.DATA_TRAINING, req.id, {
                status: "SCHEDULED",
                training_plan_id: planId
              });
            }
          }

          toast("Program pelatihan berhasil dijadwalkan!", "success");
          closeModal();
          if (onSuccess) onSuccess();
        } catch (err) {
          toast("Error: " + err.message, "error");
          btn.disabled = false;
          btn.textContent = "Simpan & Daftarkan";
        }
      };
    }
  });
}

/* ---------------------------------------------------------------------
 * 4. ALL EMPLOYEE REQUESTS (HRD WORKSPACE)
 * ------------------------------------------------------------------- */
async function renderAllRequests(wrap, session) {
  const allData = await fsGetAll(COL.DATA_TRAINING);
  const pendingData = allData.filter(x => x.status === "PENDING")
    .sort((a, b) => new Date(b.tanggal_pengajuan) - new Date(a.tanggal_pengajuan));
  const otherData = allData.filter(x => x.status !== "PENDING")
    .sort((a, b) => new Date(b.tanggal_pengajuan) - new Date(a.tanggal_pengajuan));

  wrap.innerHTML = `
    <!-- Pending Demands -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <h3 class="font-bold text-slate-800">Menunggu Review Pengajuan Kompetensi Karyawan (${pendingData.length})</h3>
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
                <td colspan="6" class="py-10 text-center text-slate-400">Tidak ada pengajuan baru yang tertunda.</td>
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
                    <button data-action="approve" data-id="${r.id}" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition shadow-sm">Setuju</button>
                    <button data-action="reject" data-id="${r.id}" class="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded transition shadow-sm">Tolak</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>

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

  // Attach Approval Events
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
}
