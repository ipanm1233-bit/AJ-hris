import { db, COL, collection, query, where, getDocs, orderBy, limit, getDoc, doc } from "../firebase-config.js";
import { fmtDate, fmtDateShort, escapeHtml, openModal, toNumber } from "../utils.js";
import { avatar, badge, icon, emptyState, skeletonRows } from "../components.js";
import { MANAJEMEN_ROLES } from "../auth.js";

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export async function mount(container, { session }) {
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam";
  container.querySelector("#dash-greeting").textContent = `${greet}, ${session.nama.split(" ")[0]} 👋`;

  const isMgmt = MANAJEMEN_ROLES.includes(session.role) || session.role === "HRD";

  // Jalankan semua widget secara paralel agar dashboard terasa instan
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
  if (session.nik) {
    const snap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)));
    if (snap.exists()) karyawan = snap.data();
  }
  container.querySelector("#dash-profile-avatar").innerHTML = avatar(session.nama, "w-14 h-14 text-base");
  container.querySelector("#dash-profile-nama").textContent = session.nama;
  container.querySelector("#dash-profile-jabatan").textContent = `${session.posisi || "-"} • ${karyawan?.cabang || session.cabang || "-"}`;
  container.querySelector("#dash-profile-badges").innerHTML = `
    ${badge(session.role, "maroon")}
    ${karyawan?.status_karyawan ? badge(karyawan.status_karyawan, "blue") : ""}
    ${karyawan?.aktif_tdk_aktif ? badge(karyawan.aktif_tdk_aktif, karyawan.aktif_tdk_aktif === "AKTIF" ? "green" : "red") : ""}
  `;

  container.querySelector("#dash-profile-card").addEventListener("click", () => openProfileModal(session, karyawan));
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
        <p class="text-sm text-slate-500">${escapeHtml(k.jabatan || "-")} — ${escapeHtml(k.divisi || "-")}</p>
      </div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
      ${profileRow("NIK Karyawan", k.nik_karyawan)}
      ${profileRow("Cabang", k.cabang)}
      ${profileRow("Status Karyawan", k.status_karyawan)}
      ${profileRow("Jenis Kelamin", k.jenis_kelamin)}
      ${profileRow("Tanggal Lahir", fmtDate(k.tanggal_lahir))}
      ${profileRow("Usia", k.usia ? Math.floor(k.usia) + " Tahun" : "-")}
      ${profileRow("Tanggal Join", fmtDate(k.tanggal_join))}
      ${profileRow("Masa Kerja", k.masa_kerja)}
      ${profileRow("Pendidikan", k.pendidikan)}
      ${profileRow("Agama", k.agama)}
      ${profileRow("Golongan Darah", k.golongan_darah)}
      ${profileRow("No HP Aktif", k.no_hp_aktif)}
      ${profileRow("Email", k.email)}
      ${profileRow("Kontak Darurat", k.kontak_darurat)}
      ${profileRow("Nama Kontak Darurat", k.nama_kontak_darurat)}
      ${profileRow("NPWP", k.npwp)}
      ${profileRow("Jam Kerja", k.jam_kerja)}
      ${profileRow("Atasan", k.atasan)}
      <div class="col-span-2 sm:col-span-3">${profileRow("Alamat", k.alamat)}</div>
    </div>
    <p class="text-[11px] text-slate-400 mt-5 italic">*Informasi saldo cuti tidak ditampilkan di sini — lihat kartu saldo cuti pada dashboard.</p>
  `;
  openModal({ title: "Data Pribadi Karyawan", size: "lg", bodyHtml: body });
}

/* ------------------------ b. 3 LEAVE BALANCE CARDS ------------------------ */
async function loadLeaveBalances(container, session) {
  const wrap = container.querySelector("#dash-cuti-cards");
  wrap.innerHTML = `<div class="col-span-3">${skeletonRows(1)}</div>`;

  let jatah = { tahunan: 0, khusus: 0, akumulasi: 0 };
  if (session.nik) {
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
      const tipe = row.potong_jatah;
      const cnt = toNumber(row.count) || 1;
      if (tipe && terpakai[tipe] !== undefined) terpakai[tipe] += cnt;
    });
  } catch (e) { console.warn("Gagal hitung cuti terpakai", e); }

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
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 card-hover">
        <div class="flex items-center justify-between mb-3">
          <div class="w-9 h-9 rounded-xl ${toneClasses[c.tone]} flex items-center justify-center">${icon(c.ic, "w-4.5 h-4.5")}</div>
          <span class="text-[11px] text-slate-400">Jatah: ${c.jatah} hari</span>
        </div>
        <p class="text-sm text-slate-500">${c.label}</p>
        <p class="text-3xl font-bold text-slate-800 mt-1 tabular-nums" data-counter="${sisa}">0</p>
        <p class="text-xs text-slate-400 mt-1">${c.terpakai} hari telah digunakan</p>
        <div class="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
          <div class="h-full ${barTone[c.tone]} rounded-full transition-all duration-700" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join("");

  // animasi counter naik dari 0 -> nilai riil (kesan real-time & dinamis)
  wrap.querySelectorAll("[data-counter]").forEach(el => {
    const target = parseInt(el.dataset.counter, 10);
    let cur = 0;
    const step = Math.max(1, Math.ceil(target / 20));
    const t = setInterval(() => {
      cur += step;
      if (cur >= target) { cur = target; clearInterval(t); }
      el.textContent = cur;
    }, 25);
  });
}

/* ------------------------ c. KPI 360 TASKS ------------------------ */
async function loadKpiTasks(container, session) {
  const wrap = container.querySelector("#dash-kpi-tasks");
  try {
    const q = query(collection(db, COL.TUGAS_KPI_360), where("nama_penilai", "==", session.nama));
    const snap = await getDocs(q);
    const pending = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => (r.status || "").toUpperCase() !== "DONE");
    if (!pending.length) { wrap.innerHTML = emptyState("Tidak ada tugas penilaian tertunda", "Semua penilaian 360° Anda sudah selesai."); return; }
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
  const todayDate = now.getDate();
  try {
    const q = query(collection(db, COL.MASTER_CUTI), where("tahun", "==", now.getFullYear()), where("bulan", "==", BULAN_ID[now.getMonth()]));
    const snap = await getDocs(q);
    const todayRows = snap.docs.map(d => d.data()).filter(r => {
      const t = r.tanggal?.toDate ? r.tanggal.toDate() : new Date(r.tanggal);
      return !isNaN(t) && t.getDate() === todayDate;
    });
    if (!todayRows.length) { wrap.innerHTML = emptyState("Tidak ada karyawan cuti/izin hari ini", "Seluruh tim aktif bertugas hari ini."); return; }
    wrap.innerHTML = todayRows.map(r => `
      <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100">
        <div class="flex items-center gap-3">
          ${avatar(r.nama_karyawan || "?", "w-9 h-9 text-xs")}
          <div>
            <p class="text-sm font-medium text-slate-700">${escapeHtml(r.nama_karyawan || "-")}</p>
            <p class="text-xs text-slate-400">${escapeHtml(r.jabatan || "-")} • ${escapeHtml(r.cabang || "-")}</p>
          </div>
        </div>
        ${badge(r.potong_jatah || r.type_cuti || "Cuti", "blue")}
      </div>`).join("");
  } catch (e) { wrap.innerHTML = emptyState("Gagal memuat data cuti hari ini"); }
}

/* ------------------------ e. ANNOUNCEMENTS ------------------------ */
async function loadAnnouncements(container) {
  const wrap = container.querySelector("#dash-announcements");
  try {
    const q = query(collection(db, COL.BROADCAST), orderBy("tanggal", "desc"), limit(6));
    const snap = await getDocs(q);
    if (snap.empty) { wrap.innerHTML = emptyState("Belum ada pengumuman"); return; }
    wrap.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const plainText = String(r.isi || "").replace(/<[^>]+>/g, "").slice(0, 90);
      return `
        <div class="flex gap-3">
          <div class="w-2 h-2 rounded-full bg-maroon-600 mt-2 shrink-0"></div>
          <div>
            <p class="text-sm font-medium text-slate-700">${escapeHtml(r.judul || "Pengumuman")}</p>
            <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(plainText)}${plainText.length >= 90 ? "..." : ""}</p>
            <p class="text-[11px] text-slate-400 mt-1">${fmtDateShort(r.tanggal)} • oleh ${escapeHtml(r.dibuat_oleh || "-")}</p>
          </div>
        </div>`;
    }).join("");
  } catch (e) { wrap.innerHTML = emptyState("Belum ada pengumuman"); }
}

/* ------------------------ f. CONTRACT EXPIRY WIDGET ------------------------ */
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

    if (!soon.length) { wrap.innerHTML = emptyState("Tidak ada kontrak yang akan berakhir", "Dalam 60 hari ke depan."); return; }
    wrap.innerHTML = soon.map(k => `
      <div class="flex items-center justify-between p-3 rounded-xl border border-amber-100 bg-amber-50/50">
        <div>
          <p class="text-sm font-medium text-slate-700">${escapeHtml(k.nama_karyawan)}</p>
          <p class="text-xs text-slate-500">${escapeHtml(k.jabatan || "-")} • Berakhir ${fmtDateShort(k._expiry)}</p>
        </div>
        ${badge(`${k._days} hari lagi`, k._days <= 14 ? "red" : "amber")}
      </div>`).join("");
  } catch (e) { wrap.innerHTML = emptyState("Gagal memuat data kontrak"); }
}
