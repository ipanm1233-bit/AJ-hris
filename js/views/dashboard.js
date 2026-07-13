import { db, COL, collection, query, where, getDocs, orderBy, limit, getDoc, doc } from "../firebase-config.js";
import { fmtDate, fmtDateShort, escapeHtml, openModal, closeModal, toNumber, sendEmailNotif, toast, fsUpdate, fsAdd, genId, fsGetAll, createLoginToken } from "../utils.js";
import { avatar, badge, icon, emptyState, skeletonRows } from "../components.js";
import { MANAJEMEN_ROLES } from "../auth.js";

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export async function mount(container, { session }) {
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam";
  container.querySelector("#dash-greeting").textContent = `${greet}, ${session.nama.split(" ")[0]} 👋`;

  const isMgmt = MANAJEMEN_ROLES.includes(session.role) || session.role === "HRD";
  
  await Promise.all([
    loadProfileCard(container, session),
    loadLeaveBalances(container, session),
    loadKpiTasks(container, session),
    loadCutiHariIni(container),
    loadAnnouncements(container),
    isMgmt ? loadContractExpiry(container) : Promise.resolve()
  ]);
  return { unmount() {} };
}

/* ------------------------ a. PROFILE CARD & MODAL ------------------------ */
async function loadProfileCard(container, session) {
  let karyawan = null;
  if (session.nik && session.nik !== "null" && session.nik !== "undefined") {
    const snap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)));
    if (snap.exists()) karyawan = snap.data();
  } else {
    const q = query(collection(db, COL.MASTER_KARYAWAN), where("nama_karyawan", "==", session.nama), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) karyawan = snap.docs[0].data();
  }

  const profileCard = container.querySelector("#dash-profile-card");
  container.querySelector("#dash-profile-avatar").innerHTML = avatar(session.nama, "w-14 h-14 text-base");
  container.querySelector("#dash-profile-nama").textContent = session.nama;
  container.querySelector("#dash-profile-jabatan").textContent = `${session.posisi || "-"} • ${karyawan?.cabang || session.cabang || "-"}`;
  container.querySelector("#dash-profile-badges").innerHTML = `
    ${badge(session.role, "maroon")}
    ${karyawan?.status_karyawan ? badge(karyawan.status_karyawan, "blue") : ""}
    ${karyawan?.aktif_tdk_aktif ? badge(karyawan.aktif_tdk_aktif, karyawan.aktif_tdk_aktif === "AKTIF" ? "green" : "red") : ""}
  `;

  // Memicu modal profil saat kartu diklik
  if (profileCard) {
     profileCard.onclick = () => openProfileModal(session, karyawan);
  }
}

function profileRow(label, value) {
  return `<div><p class="text-[11px] text-slate-400 uppercase tracking-wide">${label}</p><p class="text-sm text-slate-700 font-medium mt-0.5">${value || "-"}</p></div>`;
}

function openProfileModal(session, k) {
  if (!k) {
    openModal({ title: "Profil Karyawan", bodyHtml: `<p class="text-sm text-slate-500">Data lengkap karyawan belum tertaut (NIK tidak ditemukan di Master Karyawan). Hubungi HRD.</p>` });
    return;
  }
  const body = `
    <div class="flex items-center gap-4 mb-6 pb-5 border-b border-slate-100">
      ${avatar(k.nama_karyawan || session.nama, "w-16 h-16 text-lg")}
      <div>
        <p class="font-bold text-slate-800 text-lg">${escapeHtml(k.nama_karyawan || session.nama)}</p>
        <p class="text-sm text-slate-500">${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.divisi || "-")}</p>
      </div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
      ${profileRow("NIK Karyawan", k.nik_karyawan)}
      ${profileRow("Cabang", k.cabang)}
      ${profileRow("Status Karyawan", k.status_karyawan)}
      ${profileRow("Jenis Kelamin", k.jenis_kelamin)}
      ${profileRow("Tanggal Lahir", fmtDate(k.tanggal_lahir))}
      ${profileRow("Tanggal Join", fmtDate(k.tanggal_join))}
      ${profileRow("Pendidikan", k.pendidikan)}
      ${profileRow("Agama", k.agama)}
      ${profileRow("No HP Aktif", k.no_hp_aktif)}
      ${profileRow("Email", k.email)}
      ${profileRow("Atasan", k.atasan)}
      <div class="col-span-2 sm:col-span-3">${profileRow("Alamat", k.alamat)}</div>
    </div>
    <div class="mt-6 flex justify-end">
       <button id="btn-tutup-profil" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition">Tutup Profil</button>
    </div>
  `;
  openModal({ 
     title: "Data Pribadi Karyawan", 
     size: "lg", 
     bodyHtml: body,
     onMount: (m) => m.querySelector("#btn-tutup-profil").onclick = closeModal
  });
}

/* ------------------------ b. LEAVE BALANCE ------------------------ */
async function loadLeaveBalances(container, session) {
  const wrap = container.querySelector("#dash-cuti-cards");
  wrap.innerHTML = `<div class="col-span-3">${skeletonRows(1)}</div>`;
  let jatah = { tahunan: 0, khusus: 0, akumulasi: 0 };
  
  if (session.nik && session.nik !== "null") {
    const snap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)));
    if (snap.exists()) {
      const k = snap.data();
      jatah = { tahunan: toNumber(k.jatah_tahunan), khusus: toNumber(k.jatah_khusus), akumulasi: toNumber(k.jatah_akumulasi) };
    }
  }

  let terpakai = { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
  try {
    const q = query(collection(db, COL.MASTER_CUTI), where("nama_karyawan", "==", session.nama));
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const row = d.data();
      if (row.potong_jatah && terpakai[row.potong_jatah] !== undefined) terpakai[row.potong_jatah] += toNumber(row.count) || 1;
    });
  } catch (e) {}

  const cards = [
    { label: "Cuti Tahunan", jatah: jatah.tahunan, terpakai: terpakai.Tahunan, tone: "maroon", ic: "sun" },
    { label: "Cuti Khusus", jatah: jatah.khusus, terpakai: terpakai.Khusus, tone: "blue", ic: "star" },
    { label: "Cuti Akumulasi", jatah: jatah.akumulasi, terpakai: terpakai.Akumulasi, tone: "amber", ic: "clock" },
  ];

  wrap.innerHTML = cards.map(c => {
    const sisa = Math.max(c.jatah - c.terpakai, 0);
    const pct = c.jatah > 0 ? Math.min((c.terpakai / c.jatah) * 100, 100) : 0;
    const toneClasses = { maroon: "text-maroon-700 bg-maroon-50", blue: "text-blue-700 bg-blue-50", amber: "text-amber-700 bg-amber-50" };
    const barTone = { maroon: "bg-maroon-600", blue: "bg-blue-600", amber: "bg-amber-500" };
    return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="w-9 h-9 rounded-xl ${toneClasses[c.tone]} flex items-center justify-center">${icon(c.ic, "w-4.5 h-4.5")}</div>
          <span class="text-[11px] text-slate-400">Jatah: ${c.jatah} hari</span>
        </div>
        <p class="text-sm text-slate-500">${c.label}</p>
        <p class="text-3xl font-bold text-slate-800 mt-1">${sisa}</p>
        <p class="text-xs text-slate-400 mt-1">${c.terpakai} hari telah digunakan</p>
        <div class="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
          <div class="h-full ${barTone[c.tone]} rounded-full" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join("");
}

/* ------------------------ c. KPI 360 TASKS (POPUP AUTO & FORMULIR) ------------------------ */
async function loadKpiTasks(container, session) {
  const wrap = container.querySelector("#dash-kpi-tasks");
  try {
    const q = query(collection(db, COL.TUGAS_KPI_360), where("nama_penilai", "==", session.nama));
    const snap = await getDocs(q);
    
    // Saring hanya tugas yang belum selesai
    const pending = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => (r.status || "").toUpperCase() !== "DONE");
    
    // POPUP OTOMATIS: Muncul ketika login/buka sistem via Magic Link
    if (pending.length > 0 && !window.hasShownKpiPopup) {
      window.hasShownKpiPopup = true; // Mencegah popup muncul berkali-kali di sesi yang sama
      
      let listHtml = pending.map(p => `
        <li class="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
          <span class="font-medium text-slate-700">${escapeHtml(p.nama_dinilai)}</span>
          <span class="text-xs text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2 py-1 rounded">Batas: ${p.deadline ? fmtDateShort(p.deadline) : '-'}</span>
        </li>
      `).join("");

      openModal({
        title: "Tugas Penilaian Menunggu",
        bodyHtml: `
          <div class="p-4 bg-slate-50 rounded-xl mb-4 border border-slate-100">
             <p class="text-sm text-slate-600">Anda memiliki <strong>${pending.length}</strong> karyawan yang harus segera dievaluasi.</p>
          </div>
          <ul class="text-sm">${listHtml}</ul>
          <p class="mt-5 text-[11px] text-slate-400 text-center uppercase tracking-wide">Silakan klik nama karyawan di kotak "Penilaian 360" pada Dashboard untuk mulai menilai.</p>
        `,
        footerHtml: `<button id="btn-tutup-kpi-popup" class="w-full py-2.5 bg-maroon-700 text-white font-medium rounded-lg text-sm hover:bg-maroon-800 transition">Mengerti & Lanjutkan</button>`,
        onMount: m => m.querySelector("#btn-tutup-kpi-popup").onclick = closeModal
      });
    }

    if (!pending.length) { wrap.innerHTML = emptyState("Tidak ada tugas penilaian tertunda"); return; }
    
    wrap.innerHTML = pending.map(t => `
      <div data-kpi-id="${t.id}" class="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-maroon-300 hover:shadow-md transition cursor-pointer bg-white">
        <div class="flex items-center gap-3">
          ${avatar(t.nama_dinilai || "?", "w-9 h-9 text-xs")}
          <div>
            <p class="text-sm font-medium text-slate-700">Evaluasi ${escapeHtml(t.nama_dinilai || "-")}</p>
            <p class="text-[11px] text-slate-400">Deadline: <span class="text-amber-600 font-medium">${t.deadline ? fmtDateShort(t.deadline) : '-'}</span></p>
          </div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-maroon-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
      </div>`).join("");

    // Klik untuk buka formulir pengisian nilai
    wrap.querySelectorAll("[data-kpi-id]").forEach(el => {
       el.onclick = () => {
          const task = pending.find(x => x.id === el.dataset.kpiId);
          openPenilaianForm(task, container, session);
       };
    });

  } catch (e) { wrap.innerHTML = emptyState("Belum ada data penilaian"); }
}

function openPenilaianForm(task, container, session) {
  const soalHtml = (task.soal_json || []).map((s, i) => `
     <div class="border-b border-slate-100 pb-4 mb-4">
        <div class="flex items-center gap-2 mb-1.5">
           <span class="bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${escapeHtml(s.aspek)}</span>
           <span class="text-[10px] text-slate-400 font-medium">Bobot: ${s.bobot}%</span>
        </div>
        <p class="text-sm text-slate-800 mb-3">${escapeHtml(s.indikator)}</p>
        <div class="relative">
           <input type="number" data-idx="${i}" data-bobot="${s.bobot}" class="kpi-nilai-input w-full pl-3 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 transition" placeholder="Berikan Skor (0-100)" required min="0" max="100">
           <span class="absolute right-3 top-2.5 text-slate-300 font-medium text-sm">/ 100</span>
        </div>
     </div>
  `).join("");

  const catatanHrdHtml = task.catatan_hrd ? `
    <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
       <span class="font-bold block mb-1">Catatan HRD untuk Evaluasi ini:</span>
       ${escapeHtml(task.catatan_hrd)}
    </div>` : '';

  openModal({
     title: `Evaluasi: ${escapeHtml(task.nama_dinilai)}`,
     size: "md",
     bodyHtml: `
        <form id="form-isi-kpi">
           <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <p class="text-xs text-amber-800 leading-relaxed">Penilaian ini dihitung otomatis berdasarkan bobot tiap indikator. Batas waktu pengumpulan form ini: <strong>${task.deadline ? fmtDateShort(task.deadline) : '-'}</strong>.</p>
           </div>
           
           ${catatanHrdHtml}
           ${soalHtml}

           <div class="mt-5">
             <label class="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Catatan / Ulasan untuk Karyawan (Opsional)</label>
             <textarea id="kpi-catatan-penilai" rows="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 transition" placeholder="Berikan ulasan, kelebihan, atau area yang perlu ditingkatkan oleh karyawan yang Anda nilai..."></textarea>
           </div>
        </form>
     `,
     footerHtml: `
        <div class="w-full flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3">
           <span class="text-sm font-bold text-slate-600">Skor Akhir Sementara:</span>
           <span id="kpi-live-score" class="text-lg font-black text-maroon-700">0.00</span>
        </div>
        <div class="flex gap-2 justify-end">
           <button id="btn-cancel-kpi" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
           <button id="btn-submit-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition shadow-md">Kirim Penilaian</button>
        </div>
     `,
     onMount: (m) => {
        const liveScore = m.querySelector("#kpi-live-score");
        m.querySelector("#form-isi-kpi").addEventListener("input", () => {
           let calcTotal = 0;
           m.querySelectorAll(".kpi-nilai-input").forEach(input => {
               const bbt = parseFloat(input.dataset.bobot) || 0;
               const val = parseFloat(input.value) || 0;
               calcTotal += val * (bbt / 100);
           });
           liveScore.textContent = calcTotal.toFixed(2);
        });

        m.querySelector("#btn-cancel-kpi").onclick = closeModal;
        m.querySelector("#btn-submit-kpi").onclick = async () => {
           const form = m.querySelector("#form-isi-kpi");
           if(!form.reportValidity()) return;

           let totalSkorBobot = 0;
           const answeredSoal = [...task.soal_json];
           const catatanPenilai = m.querySelector("#kpi-catatan-penilai").value.trim();

           m.querySelectorAll(".kpi-nilai-input").forEach(input => {
              const idx = parseInt(input.dataset.idx);
              const nilai = parseFloat(input.value) || 0;
              const bobot = parseFloat(answeredSoal[idx].bobot) || 0;
              
              answeredSoal[idx].nilai_diberikan = nilai;
              totalSkorBobot += (nilai * (bobot / 100));
           });

           let finalScore = Math.round(totalSkorBobot * 100) / 100;
           let keputusan = finalScore >= 80 ? "Sangat Baik" : finalScore >= 60 ? "Baik" : "Kurang";

           const btn = m.querySelector("#btn-submit-kpi");
           btn.disabled = true; btn.textContent = "Merekap Nilai...";

           try {
              await fsUpdate(COL.TUGAS_KPI_360, task.id, {
                 status: "DONE",
                 skor_akhir: finalScore,
                 soal_json: answeredSoal,
                 catatan_penilai: catatanPenilai,
                 tanggal_diselesaikan: new Date().toISOString()
              });

              await fsAdd(COL.LOG_PENILAIAN_KPI, {
                 tanggal: new Date().toISOString(),
                 nama_dinilai: task.nama_dinilai,
                 penilai: task.nama_penilai,
                 total_skor: finalScore,
                 keputusan: keputusan,
                 periode: task.periode,
                 detail_json: answeredSoal,
                 catatan_penilai: catatanPenilai 
              }, genId("KPI-LOG"));

              toast("Evaluasi berhasil diselesaikan!", "success");
              closeModal();
              loadKpiTasks(container, session);
           } catch(e) {
              toast("Gagal menyimpan evaluasi: " + e.message, "error");
              btn.disabled = false; btn.textContent = "Kirim Penilaian";
           }
        };
     }
  });
}

/* ------------------------ d. CUTI HARI INI ------------------------ */
async function loadCutiHariIni(container) {
  const wrap = container.querySelector("#dash-cuti-hari-ini");
  const now = new Date();
  try {
    const q = query(collection(db, COL.MASTER_CUTI), where("tahun", "==", now.getFullYear()), where("bulan", "==", BULAN_ID[now.getMonth()]));
    const snap = await getDocs(q);
    const todayRows = snap.docs.map(d => d.data()).filter(r => {
      const t = r.tanggal?.toDate ? r.tanggal.toDate() : new Date(r.tanggal);
      return !isNaN(t) && t.getDate() === now.getDate();
    });
    if (!todayRows.length) { wrap.innerHTML = emptyState("Tidak ada yang cuti hari ini"); return; }
    wrap.innerHTML = todayRows.map(r => `
      <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100">
        <div class="flex items-center gap-3">
          ${avatar(r.nama_karyawan || "?", "w-9 h-9 text-xs")}
          <div>
            <p class="text-sm font-medium text-slate-700">${escapeHtml(r.nama_karyawan || "-")}</p>
            <p class="text-xs text-slate-400">${escapeHtml(r.jabatan || "-")}</p>
          </div>
        </div>
        ${badge(r.potong_jatah || "Cuti", "blue")}
      </div>`).join("");
  } catch (e) { wrap.innerHTML = emptyState("Gagal memuat data cuti"); }
}

/* ------------------------ e. ANNOUNCEMENTS ------------------------ */
async function loadAnnouncements(container) {
  const wrap = container.querySelector("#dash-announcements");
  try {
    const q = query(collection(db, COL.BROADCAST), orderBy("tanggal", "desc"), limit(20));
    const snap = await getDocs(q);
    
    const now = new Date();
    const validMemos = snap.docs.map(d => d.data()).filter(r => {
      if (!r.tanggal_berakhir) return true; 
      const tglBatas = new Date(r.tanggal_berakhir);
      tglBatas.setHours(23, 59, 59, 999);
      return tglBatas >= now;
    }).slice(0, 6);

    if (!validMemos.length) { wrap.innerHTML = emptyState("Belum ada pengumuman aktif"); return; }
    
    wrap.innerHTML = validMemos.map(r => {
      const plainText = String(r.isi || "").replace(/<[^>]+>/g, "").slice(0, 90);
      return `
        <div class="flex gap-3">
          <div class="w-2 h-2 rounded-full bg-maroon-600 mt-2 shrink-0"></div>
          <div>
            <p class="text-sm font-medium text-slate-700">${escapeHtml(r.judul || "Pengumuman")}</p>
            <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(plainText)}${plainText.length >= 90 ? "..." : ""}</p>
            <p class="text-[11px] text-slate-400 mt-1">${fmtDateShort(r.tanggal)} oleh ${escapeHtml(r.dibuat_oleh || "-")}</p>
          </div>
        </div>`;
    }).join("");
  } catch (e) { wrap.innerHTML = emptyState("Belum ada pengumuman"); }
}

/* ------------------------ f. CONTRACT EXPIRY (DENGAN TUGAS KPI & TEMPLATE) ------------------------ */
async function loadContractExpiry(container) {
  const wrapOuter = container.querySelector("#dash-contract-widget-wrap");
  wrapOuter.classList.remove("hidden");
  const wrap = container.querySelector("#dash-contract-list");
  
  try {
    const snap = await getDocs(collection(db, COL.MASTER_KARYAWAN));
    const now = new Date();
    const soon = snap.docs
      .map(d => ({ id: d.id, ...d.data() })) 
      .filter(k => k.kontrak_habis)
      .map(k => {
        const t = k.kontrak_habis?.toDate ? k.kontrak_habis.toDate() : new Date(k.kontrak_habis);
        return { ...k, _expiry: t, _days: Math.round((t - now) / 86400000) };
      })
      .filter(k => !isNaN(k._expiry) && k._days >= 0 && k._days <= 60)
      .sort((a, b) => a._days - b._days);

    if (!soon.length) { wrap.innerHTML = emptyState("Tidak ada kontrak yang segera berakhir"); return; }
    
    wrap.innerHTML = soon.map(k => `
      <div class="flex flex-col p-3 rounded-xl border border-amber-200 bg-amber-50 gap-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-slate-800">${escapeHtml(k.nama_karyawan)}</p>
            <p class="text-xs text-slate-600">${escapeHtml(k.jabatan || "-")} • Berakhir: ${fmtDateShort(k._expiry)}</p>
          </div>
          ${badge(`${k._days} hari lagi`, k._days <= 14 ? "red" : "amber")}
        </div>
        <div class="flex items-center gap-2 pt-2 border-t border-amber-200/60">
           <button data-id="${k.id}" data-action="atasan" class="flex-1 bg-maroon-700 hover:bg-maroon-800 text-white text-[11px] py-1.5 rounded transition">Tugaskan Penilaian (Atasan)</button>
           <button data-id="${k.id}" data-action="karyawan" class="flex-1 border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] py-1.5 rounded transition">Panggil Konseling</button>
        </div>
      </div>`).join("");

    // AKSI: MENGIRIMKAN TUGAS PENILAIAN DARI TEMPLATE KEPADA ATASAN
    wrap.querySelectorAll('button[data-action="atasan"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
         const btnEl = e.currentTarget;
         const k = soon.find(x => x.id === btnEl.dataset.id);
         if (!k) { toast("Data karyawan tidak ditemukan.", "error"); return; }
         
         const templates = await fsGetAll(COL.MASTER_SOAL_KPI);
         const optTemplates = templates.map(t => `<option value="${t.id}">${escapeHtml(t.nama_template)}</option>`).join("");

         openModal({
            title: "Tugaskan Penilaian Evaluasi Kontrak",
            bodyHtml: `
               <p class="text-sm text-slate-600 mb-4">Sistem akan membuat tugas penilaian kinerja untuk karyawan <b>${escapeHtml(k.nama_karyawan)}</b> dan mengirimkan notifikasi Email kepada Atasannya.</p>
               <div>
                 <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih Template Indikator Penilaian</label>
                 <select id="eval-template-picker" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
                    <option value="">-- Pilih Template Penilaian --</option>
                    ${optTemplates}
                 </select>
               </div>
            `,
            footerHtml: `
               <button id="btn-batal-eval" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
               <button id="btn-kirim-eval" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Kirim Tugas ke Atasan</button>
            `,
            onMount: (m) => {
               m.querySelector("#btn-batal-eval").onclick = closeModal;
               m.querySelector("#btn-kirim-eval").onclick = async () => {
                  const tplId = m.querySelector("#eval-template-picker").value;
                  if(!tplId) return toast("Anda harus memilih template terlebih dahulu", "warning");

                  const tplData = templates.find(t => t.id === tplId);
                  const soalArray = tplData.soal_json || [];

                  const submitBtn = m.querySelector("#btn-kirim-eval");
                  submitBtn.disabled = true; submitBtn.textContent = "Memproses...";

                  try {
                     let atasanName = k.atasan;
                     if(!atasanName) throw new Error("Karyawan ini tidak memiliki data Atasan di Master Karyawan.");

                     const qU = query(collection(db, COL.USERS), where("nama", "==", atasanName), limit(1));
                     const snapU = await getDocs(qU);
                     if(snapU.empty) throw new Error("Akun Penilai (Atasan) tidak ditemukan di database Users.");

                     const atasanEmail = snapU.docs[0].data().email;
                     const atasanUsername = snapU.docs[0].id;

                     if(!atasanEmail) throw new Error("Atasan tidak memiliki email untuk dikirimkan notifikasi.");

                     // Deadline 3 Hari
                     const deadlineDate = new Date();
                     deadlineDate.setDate(deadlineDate.getDate() + 3);
                     const deadlineISO = deadlineDate.toISOString();

                     // Buat Tugas KPI
                     await fsAdd(COL.TUGAS_KPI_360, {
                        periode: "Evaluasi Kontrak " + (new Date().getFullYear()),
                        nama_penilai: atasanName,
                        nama_dinilai: k.nama_karyawan,
                        catatan_hrd: "Penilaian ini ditugaskan otomatis sebagai dasar pertimbangan perpanjangan kontrak kerja.",
                        soal_json: soalArray,
                        status: "PENDING",
                        skor_akhir: 0,
                        tanggal: new Date().toISOString(),
                        deadline: deadlineISO
                     }, genId("KPI"));

                     // Kirim Email Magic Link ke Atasan
                     if (typeof sendEmailNotif === 'function') {
                        const token = await createLoginToken(atasanUsername);
                        const magicLink = `https://andela-hris.vercel.app/#dashboard?token=${token}`;
                        
                        const htmlEmail = `
                          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <h2 style="color: #7a1f2b;">Tugas Penilaian Evaluasi Kontrak</h2>
                            <p>Halo <strong>${atasanName}</strong>,</p>
                            <p>Mengingatkan bahwa kontrak kerja <strong>${escapeHtml(k.nama_karyawan)}</strong> akan berakhir dalam ${k._days} hari.</p>
                            <p>HRD telah menugaskan Anda untuk melakukan penilaian kinerja sebagai dasar keputusan perpanjangan kontrak.</p>
                            <p>Mohon selesaikan penilaian ini sebelum <strong>${fmtDateShort(deadlineISO)}</strong>.</p>
                            <a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Akses & Mulai Menilai</a>
                          </div>
                        `;
                        await sendEmailNotif(atasanEmail, "Tugas Penilaian Kontrak: " + k.nama_karyawan, htmlEmail);
                     }

                     toast("Tugas penilaian berhasil dibuat dan dikirim ke Atasan", "success");
                     closeModal();
                     
                     // Memperbarui badge tombol agar HRD tahu bahwa email sudah dikirim
                     btnEl.className = "flex-1 bg-green-600 text-white text-[11px] py-1.5 rounded transition";
                     btnEl.textContent = "Tugas Terkirim ✓";
                     btnEl.disabled = true;

                  } catch (err) {
                     toast(err.message, "error");
                     submitBtn.disabled = false; submitBtn.textContent = "Kirim Tugas Penilaian";
                  }
               };
            }
         });
      });
    });

    wrap.querySelectorAll('button[data-action="karyawan"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
         const btnEl = e.currentTarget;
         const k = soon.find(x => x.id === btnEl.dataset.id);
         
         if (!k) return;
         
         btnEl.disabled = true; btnEl.textContent = "Mengirim...";
         try {
            if(!k.email) throw new Error("Email karyawan bersangkutan belum terdata di sistem.");
            const html = `<div style="font-family: Arial; padding: 20px;"><h2>Undangan Konseling</h2><p>Halo <b>${escapeHtml(k.nama_karyawan)}</b>,</p><p>Mengingatkan bahwa kontrak Anda akan segera berakhir. Mohon temui Tim HRD untuk proses konseling lebih lanjut.</p></div>`;
            await sendEmailNotif(k.email, "Undangan Konseling HRD", html);
            toast("Undangan konseling terkirim", "success");
         } catch (err) { toast(err.message, "error"); }
         btnEl.disabled = false; btnEl.textContent = "Panggil Konseling";
      });
    });

  } catch (e) { wrap.innerHTML = emptyState("Gagal memuat data kontrak"); }
}
