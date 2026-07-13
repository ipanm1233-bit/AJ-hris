import { db, COL, collection, query, where, getDocs, orderBy, limit, getDoc, doc } from "../firebase-config.js";
import { fmtDate, fmtDateShort, escapeHtml, openModal, toNumber, sendEmailNotif, getTargetsForRole, toast } from "../utils.js";
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

/* ------------------------ a. PROFILE CARD ------------------------ */
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

  container.querySelector("#dash-profile-avatar").innerHTML = avatar(session.nama, "w-14 h-14 text-base");
  container.querySelector("#dash-profile-nama").textContent = session.nama;
  container.querySelector("#dash-profile-jabatan").textContent = `${session.posisi || "-"} • ${karyawan?.cabang || session.cabang || "-"}`;
  container.querySelector("#dash-profile-badges").innerHTML = `
    ${badge(session.role, "maroon")}
    ${karyawan?.status_karyawan ? badge(karyawan.status_karyawan, "blue") : ""}
    ${karyawan?.aktif_tdk_aktif ? badge(karyawan.aktif_tdk_aktif, karyawan.aktif_tdk_aktif === "AKTIF" ? "green" : "red") : ""}
  `;
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

/* ------------------------ c. KPI 360 TASKS ------------------------ */
async function loadKpiTasks(container, session) {
  const wrap = container.querySelector("#dash-kpi-tasks");
  try {
    const q = query(collection(db, COL.TUGAS_KPI_360), where("nama_penilai", "==", session.nama));
    const snap = await getDocs(q);
    const pending = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => (r.status || "").toUpperCase() !== "DONE");
    if (!pending.length) { wrap.innerHTML = emptyState("Tidak ada tugas penilaian tertunda"); return; }
    wrap.innerHTML = pending.map(t => `
      <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition">
        <div class="flex items-center gap-3">
          ${avatar(t.nama_dinilai || "?", "w-9 h-9 text-xs")}
          <div>
            <p class="text-sm font-medium text-slate-700">Menilai ${escapeHtml(t.nama_dinilai || "-")}</p>
            <p class="text-xs text-slate-400">${escapeHtml(t.periode || "-")}</p>
          </div>
        </div>
        ${badge("Menunggu Dinilai", "amber")}
      </div>`).join("");
  } catch (e) { wrap.innerHTML = emptyState("Belum ada data penilaian"); }
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

/* ------------------------ e. ANNOUNCEMENTS (DENGAN FILTER DEADLINE) ------------------------ */
async function loadAnnouncements(container) {
  const wrap = container.querySelector("#dash-announcements");
  try {
    const q = query(collection(db, COL.BROADCAST), orderBy("tanggal", "desc"), limit(20));
    const snap = await getDocs(q);
    
    const now = new Date();
    // Filter memo yang tanggal berakhirnya belum terlewat
    const validMemos = snap.docs.map(d => d.data()).filter(r => {
      if (!r.tanggal_berakhir) return true; // Memo tanpa batas waktu
      const tglBatas = new Date(r.tanggal_berakhir);
      tglBatas.setHours(23, 59, 59, 999);
      return tglBatas >= now;
    }).slice(0, 6); // Ambil 6 teratas

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

/* ------------------------ f. CONTRACT EXPIRY (DENGAN TOMBOL AKSI) ------------------------ */
async function loadContractExpiry(container) {
  const wrapOuter = container.querySelector("#dash-contract-widget-wrap");
  wrapOuter.classList.remove("hidden");
  const wrap = container.querySelector("#dash-contract-list");
  
  try {
    const snap = await getDocs(collection(db, COL.MASTER_KARYAWAN));
    const now = new Date();
    const soon = snap.docs
      .map(d => d.data())
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
           <button data-id="${k.nik_karyawan}" data-action="atasan" class="flex-1 bg-maroon-700 hover:bg-maroon-800 text-white text-[11px] py-1.5 rounded transition">Notif Penilaian (Atasan)</button>
           <button data-id="${k.nik_karyawan}" data-action="karyawan" class="flex-1 border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] py-1.5 rounded transition">Panggil Konseling</button>
        </div>
      </div>`).join("");

    // Tombol Notif ke Atasan
    wrap.querySelectorAll('button[data-action="atasan"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
         const btnEl = e.currentTarget;
         const k = soon.find(x => x.nik_karyawan === btnEl.dataset.id);
         btnEl.disabled = true; btnEl.textContent = "Mengirim...";
         try {
            const targets = await getTargetsForRole("ATASAN", k.nama_karyawan);
            if(targets.length === 0) throw new Error("Email atasan tidak ditemukan");
            for(const t of targets) {
               const html = `<div style="font-family: Arial; padding: 20px;"><h2>Reminder Evaluasi Kontrak</h2><p>Mengingatkan bahwa kontrak kerja <b>${k.nama_karyawan}</b> akan berakhir dalam ${k._days} hari. Mohon segera berikan penilaian untuk proses perpanjangan/pemutusan kontrak.</p></div>`;
               await sendEmailNotif(t.email, "Reminder Evaluasi Kontrak: " + k.nama_karyawan, html);
            }
            toast("Notifikasi ke atasan terkirim", "success");
         } catch (err) { toast(err.message, "error"); }
         btnEl.disabled = false; btnEl.textContent = "Notif Penilaian (Atasan)";
      });
    });

    // Tombol Notif Konseling ke Karyawan
    wrap.querySelectorAll('button[data-action="karyawan"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
         const btnEl = e.currentTarget;
         const k = soon.find(x => x.nik_karyawan === btnEl.dataset.id);
         btnEl.disabled = true; btnEl.textContent = "Mengirim...";
         try {
            if(!k.email) throw new Error("Email karyawan tidak terdata di Master Karyawan");
            const html = `<div style="font-family: Arial; padding: 20px;"><h2>Undangan Konseling Kontrak Kerja</h2><p>Halo <b>${k.nama_karyawan}</b>,</p><p>Mengingatkan bahwa kontrak kerja Anda akan segera berakhir. Mohon temui HRD untuk melakukan proses konseling terkait status kontrak Anda selanjutnya.</p></div>`;
            await sendEmailNotif(k.email, "Undangan Konseling HRD", html);
            toast("Undangan konseling terkirim", "success");
         } catch (err) { toast(err.message, "error"); }
         btnEl.disabled = false; btnEl.textContent = "Panggil Konseling";
      });
    });

  } catch (e) { wrap.innerHTML = emptyState("Gagal memuat data kontrak"); }
}
