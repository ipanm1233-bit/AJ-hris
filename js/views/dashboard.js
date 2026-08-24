import { db, COL, collection, query, where, getDocs, orderBy, limit, getDoc, doc, updateDoc, messaging } from "../firebase-config.js";
import { fmtDate, fmtDateShort, escapeHtml, openModal, closeModal, toNumber, sendEmailNotif, getTargetsForRole, toast, fsUpdate, fsAdd, fsGetAll, fsDelete, deleteBroadcastMemoAndNotifs, genId, localDateStr, getCalculatedJatahCuti, calculateAge, calculateTenure, cleanSalesName, calculateSalesRouteMetrics, normalizeCheckinItem, getDirectImageUrl } from "../utils.js";
import { avatar, badge, icon, emptyState, skeletonRows, getDismissedAnnouncements, dismissAnnouncementForUser } from "../components.js";
import { MANAJEMEN_ROLES, computeVisibleMenus } from "../auth.js";
// IMPORT BARU UNTUK MENDAPATKAN TOKEN HP (FCM)
import { getToken } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export async function mount(container, { session }) {
 const hour = new Date().getHours();
 const greet = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam";
 container.querySelector("#dash-greeting").textContent = `${greet}, ${session.nama.split(" ")[0]}`;

 const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";

 // Widget dashboard karyawan bisa diatur HRD per-karyawan (user_dashboard_widgets)
 // atau secara global (dashboard_widgets). Default: semua widget aktif jika belum diatur.
 const WIDGET_IDS = ["dash-widget-leave", "dash-widget-kpi", "dash-widget-cuti-hari-ini", "dash-widget-pengumuman", "dash-widget-attendance", "dash-widget-performance", "dash-widget-assets", "dash-contract-widget-wrap", "dash-widget-sales-performance"];
 try {
 const cfgSnap = await getDoc(doc(db, COL.APP_SETTINGS, "main"));
 if (cfgSnap.exists()) {
 const appData = cfgSnap.data();
 const globalWidgets = appData.dashboard_widgets || {};
 const userWidgets = appData.user_dashboard_widgets || {};

 const userKey = (session.username || session.nik || session.nama || "").trim().toLowerCase();
 const specificUserCfg = userWidgets[userKey] || userWidgets[session.username?.toLowerCase()] || userWidgets[session.nik?.toLowerCase()];

 const effectiveCfg = specificUserCfg || globalWidgets;

 WIDGET_IDS.forEach(wid => {
 if (effectiveCfg[wid] === false) {
 const el = container.querySelector(`#${wid}`);
 if (el) el.classList.add("hidden");
 }
 });
 }
 } catch (e) { /* jika gagal memuat konfigurasi, tampilkan semua widget seperti biasa */ }

 // loadProfileCard dipanggil lebih dulu (bukan di dalam Promise.all) karena
 // loadPersonalBanner butuh data karyawan yang sama supaya tidak query dobel.
 const karyawanProfile = await loadProfileCard(container, session);

 await Promise.all([
 loadPersonalBanner(container, session, karyawanProfile),
 loadSalesPerformanceWidget(container, session, karyawanProfile),
 loadLeaveBalances(container, session),
 loadKpiTasks(container, session),
 loadAssignedAssets(container, session, karyawanProfile),
 loadCutiHariIni(container),
 loadAnnouncements(container, session),
 loadAttendanceAnalytics(container, session),
 loadPerformanceWidget(container, session),
 loadTrainingHistory(container, session),
 loadContractExpiry(container, session)
 ]);

 // Lonceng notifikasi kini ditangani secara global di app.js (bindShellEvents)
 // agar bisa diklik dari halaman manapun, tidak hanya saat berada di Dashboard.

 // Tombol "Tes Notif" kini berada di Header Atas (sebelah Lonceng Notifikasi)
 // dan dihandle secara global oleh bindShellEvents di app.js.
 
 const SHORT_MENU_LABELS = {
  "pengajuan-cuti": "CUTI",
  "manajemen-cuti": "CUTI",
  "cuti": "CUTI",
  "izin": "IZIN / SAKIT",
  "pengajuan-kasbon": "KASBON",
  "lembur-kasbon": "LEMBUR",
  "lembur": "LEMBUR",
  "klaim-bensin": "BENSIN",
  "reimbursement": "REIMBURSE",
  "absensi": "PRESENSI",
  "form-builder": "FORMULIR",
  "uang-makan": "UANG MAKAN",
  "inventory": "ASET GA",
  "kendaraan": "KENDARAAN",
  "gimmick-sop": "SOP & GIMMICK",
  "training": "PELATIHAN",
  "performance-review": "REVIEW KPI",
  "penilaian-kontrak": "SPK & KPI",
  "pemanggilan": "SP DISIPLIN",
  "dokumen": "DRAFT DOC",
  "sales-order": "ORDER SALES",
  "sales-outlet": "OUTLET",
  "sales-item": "ITEM SALES",
  "sales-task": "KUNJUNGAN",
  "sales-track": "TRACK SALES",
  "manajemen-data": "DATA BACKUP",
  "pengaturan": "HAK AKSES",
  "konfigurasi": "ATURAN HRD",
  "broadcast": "BROADCAST",
  "profile": "PROFIL",
  "riwayat": "LOG ABSEN"
 };

 const MENU_THEMES = {
  "absensi": "bg-rose-50 border-rose-100/80 text-rose-700",
  "pengajuan-cuti": "bg-blue-50 border-blue-100/80 text-blue-700",
  "manajemen-cuti": "bg-blue-50 border-blue-100/80 text-blue-700",
  "pengajuan-kasbon": "bg-amber-50 border-amber-100/80 text-amber-700",
  "lembur-kasbon": "bg-indigo-50 border-indigo-100/80 text-indigo-700",
  "lembur": "bg-indigo-50 border-indigo-100/80 text-indigo-700",
  "klaim-bensin": "bg-orange-50 border-orange-100/80 text-orange-700",
  "reimbursement": "bg-emerald-50 border-emerald-100/80 text-emerald-700",
  "form-builder": "bg-purple-50 border-purple-100/80 text-purple-700",
  "training": "bg-cyan-50 border-cyan-100/80 text-cyan-700",
  "performance-review": "bg-teal-50 border-teal-100/80 text-teal-700",
  "penilaian-kontrak": "bg-green-50 border-green-100/80 text-green-700",
  "inventory": "bg-red-50 border-red-100/80 text-maroon-700"
 };

 const visibleMenus = await computeVisibleMenus(session);
 const gridEl = container.querySelector("#mobile-services-grid");
 if (gridEl && visibleMenus && visibleMenus.length > 0) {
  const itemsHtml = visibleMenus.map(m => {
   if (m.id === "dashboard") return "";
   const route = m.route || m.id;
   const iconName = m.icon || "file-text";
   const shortLabel = SHORT_MENU_LABELS[route] || SHORT_MENU_LABELS[m.id] || (m.label || m.id).substring(0, 10).toUpperCase();
   const themeClass = MENU_THEMES[route] || MENU_THEMES[m.id] || "bg-slate-50 border-slate-200/80 text-slate-700";

   return `
    <a href="#${escapeHtml(route)}" class="mobile-menu-item group p-1.5 rounded-2xl hover:bg-slate-50 transition flex flex-col items-center">
     <div class="w-11 h-11 rounded-2xl ${themeClass} border flex items-center justify-center shadow-2xs group-active:scale-95 transition-transform mb-1 shrink-0">
      ${icon(iconName, "w-5 h-5")}
     </div>
     <span class="text-[10px] font-black tracking-wider text-slate-800 uppercase leading-none block truncate w-full text-center mt-0.5">${escapeHtml(shortLabel)}</span>
    </a>
   `;
  }).filter(Boolean).join("");
  if (gridEl && itemsHtml) gridEl.innerHTML = itemsHtml;
 }

 const mobileSearchInput = container.querySelector("#mobile-dash-search");
 if (mobileSearchInput) {
  mobileSearchInput.addEventListener("input", (e) => {
   const q = (e.target.value || "").toLowerCase().trim();
   container.querySelectorAll(".mobile-menu-item").forEach(item => {
    const txt = (item.textContent || "").toLowerCase();
    const href = (item.getAttribute("href") || "").toLowerCase();
    if (!q || txt.includes(q) || href.includes(q)) {
     item.classList.remove("hidden");
    } else {
     item.classList.add("hidden");
    }
   });
  });
 }

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
 const avatarEl = container.querySelector("#dash-profile-avatar");
 if (avatarEl) avatarEl.innerHTML = avatar(karyawan?.foto_url || session.foto_url || session.nama, "w-14 h-14 text-base");
 const namaEl = container.querySelector("#dash-profile-nama");
 if (namaEl) namaEl.textContent = session.nama;
 const jabatanEl = container.querySelector("#dash-profile-jabatan");
 if (jabatanEl) jabatanEl.textContent = `${session.posisi || "-"} • ${karyawan?.cabang || session.cabang || "-"}`;
 const badgesEl = container.querySelector("#dash-profile-badges");
 if (badgesEl) {
 badgesEl.innerHTML = `
 ${badge(session.role, "maroon")}
 ${karyawan?.status_karyawan ? badge(karyawan.status_karyawan, "blue") : ""}
 ${karyawan?.aktif_tdk_aktif ? badge(karyawan.aktif_tdk_aktif, karyawan.aktif_tdk_aktif === "AKTIF" ? "green" : "red") : ""}
 `;
 }

 if (profileCard) profileCard.onclick = () => openProfileModal(session, karyawan);
 return karyawan;
}

function profileRow(label, value) {
 return `<div><p class="text-[11px] text-slate-400 uppercase tracking-wide">${label}</p><p class="text-sm text-slate-700 font-medium mt-0.5">${value || "-"}</p></div>`;
}

function openProfileModal(session, k) {
 if (!k) { openModal({ title: "Profil Karyawan", bodyHtml: `<p class="text-sm text-slate-500">Data lengkap belum tertaut (Hubungi HRD).</p>` }); return; }
 const body = `
 <div class="flex items-center gap-4 mb-6 pb-5 border-b border-slate-100">
 ${avatar(k.foto_url || session.foto_url || k.nama_karyawan || session.nama, "w-16 h-16 text-lg")}
 <div><p class="font-bold text-slate-800 text-lg">${escapeHtml(k.nama_karyawan || session.nama)}</p><p class="text-sm text-slate-500">${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.divisi || "-")}</p></div>
 </div>
 <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
 ${profileRow("NIK Karyawan", k.nik_karyawan)} ${profileRow("Cabang", k.cabang)} ${profileRow("Status Karyawan", k.status_karyawan)}
 ${profileRow("NIK KTP", k.nik_ktp || k.no_ktp || "-")} ${profileRow("No. KK", k.no_kk || k.no_kartu_keluarga || "-")} ${profileRow("NPWP", k.npwp || k.no_npwp || "-")}
 ${profileRow("BPJS Ketenagakerjaan", k.bpjs_tk || k.no_bpjs_tk || k.bpjs_ketenagakerjaan || "-")} ${profileRow("BPJS Kesehatan", k.bpjs_kes || k.no_bpjs_kes || k.bpjs_kesehatan || "-")} ${profileRow("No HP Aktif", k.no_hp_aktif)}
 ${profileRow("Jenis Kelamin", k.jenis_kelamin)} ${profileRow("Tanggal Lahir", fmtDate(k.tanggal_lahir))} ${profileRow("Usia", k.tanggal_lahir ? `${calculateAge(k.tanggal_lahir)} Tahun` : (k.usia ? `${k.usia} Tahun` : "-"))}
 ${profileRow("Tanggal Join", fmtDate(k.tanggal_join))} ${profileRow("Masa Kerja", k.tanggal_join ? calculateTenure(k.tanggal_join) : (k.masa_kerja || "-"))} ${profileRow("Atasan", k.atasan)}
 ${profileRow("Pendidikan", k.pendidikan)} ${profileRow("Agama", k.agama)} ${profileRow("Email", k.email)}
 <div class="col-span-2 sm:col-span-3">${profileRow("Alamat", k.alamat)}</div>
 </div>
 <div class="mt-6 flex justify-end"><button id="btn-tutup-profil" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition">Tutup Profil</button></div>
 `;
 openModal({ title: "Data Pribadi", size: "lg", bodyHtml: body, onMount: (m) => m.querySelector("#btn-tutup-profil").onclick = closeModal });
}

/* ------------------------ a2. PERSONALISASI (ULTAH / ANNIVERSARY / CUTI) ------------------------ */
/**
 * Menampilkan banner personalisasi di dashboard karyawan sesuai kondisi
 * hari ini: ulang tahun, hari jadi (anniversary kerja), dan/atau sedang
 * cuti/izin. Banner bisa tampil lebih dari satu sekaligus (mis. ulang
 * tahun sekaligus sedang cuti). Kalau tidak ada kondisi yang berlaku,
 * wrapper dikosongkan (tidak ada banner).
 */
async function loadPersonalBanner(container, session, karyawan) {
 const wrap = container.querySelector("#dash-personal-banner");
 if (!wrap) return;
 if (!karyawan) { wrap.innerHTML = ""; return; }

 const now = new Date();
 const banners = [];
 const firstName = escapeHtml((session.nama || "").split(" ")[0] || "Anda");

 // PERBAIKAN: sebelumnya pakai Date.getDate()/getMonth() yang ikut zona
 // waktu SISTEM PERANGKAT (bisa salah 1 hari kalau perangkat tidak di-set
 // WIB). Sekarang pakai localDateStr() yang memaksa Asia/Jakarta secara
 // eksplisit, lalu dibandingkan sebagai teks "MM-DD" -- selalu akurat WIB.
 const todayMD = localDateStr(now)?.substring(5); // "MM-DD"

 // 1) ULANG TAHUN
 const lahirMD = localDateStr(karyawan.tanggal_lahir)?.substring(5);
 if (lahirMD && lahirMD === todayMD) {
 banners.push(`
 <div class="rounded-2xl p-5 text-white shadow-sm flex items-center gap-4" style="background:linear-gradient(135deg,#db2777,#7c3aed)">
 <div class="text-4xl"></div>
 <div>
 <p class="font-bold text-lg">Selamat Ulang Tahun, ${firstName}!</p>
 <p class="text-sm text-white/90 mt-0.5">Seluruh keluarga besar CV Andela Jaya mendoakan yang terbaik untuk Anda. </p>
 </div>
 </div>`);
 }

 // 2) HARI JADI / ANNIVERSARY KERJA
 const joinStr = localDateStr(karyawan.tanggal_join); // "YYYY-MM-DD" WIB
 if (joinStr && joinStr.substring(5) === todayMD) {
 const years = now.getFullYear() - parseInt(joinStr.substring(0, 4), 10);
 if (years > 0) {
 banners.push(`
 <div class="rounded-2xl p-5 text-white shadow-sm flex items-center gap-4" style="background:linear-gradient(135deg,#0891b2,#1d4ed8)">
 <div class="text-4xl"></div>
 <div>
 <p class="font-bold text-lg">Selamat Hari Jadi ke-${years} Tahun!</p>
 <p class="text-sm text-white/90 mt-0.5">Terima kasih atas dedikasi Anda selama ${years} tahun bersama CV Andela Jaya.</p>
 </div>
 </div>`);
 }
 }

 // 3) SEDANG CUTI/IZIN HARI INI
 try {
 const todayStr = localDateStr(now);
 const q = query(collection(db, COL.MASTER_CUTI), where("nama_karyawan", "==", session.nama), where("tahun", "==", now.getFullYear()));
 const snap = await getDocs(q);
 const activeLeave = snap.docs.map(d => d.data()).find(r => {
 const start = (r.tanggal || "").toString().substring(0, 10);
 const end = (r.tanggal_selesai || r.tanggal || "").toString().substring(0, 10);
 return start && todayStr >= start && todayStr <= end;
 });
 if (activeLeave) {
 banners.push(`
 <div class="rounded-2xl p-5 text-white shadow-sm flex items-center gap-4" style="background:linear-gradient(135deg,#059669,#0d9488)">
 <div class="text-4xl"></div>
 <div>
 <p class="font-bold text-lg">Anda Sedang ${escapeHtml(activeLeave.type_cuti || "Cuti")}</p>
 <p class="text-sm text-white/90 mt-0.5">Nikmati waktu istirahat Anda. Sampai jumpa lagi setelah cuti selesai!</p>
 </div>
 </div>`);
 // Ganti subtitle sapaan dashboard supaya "terasa" berbeda saat sedang cuti,
 // bukan cuma tampil banner tambahan.
 const greetEl = container.querySelector("#dash-greeting");
 const subtitleEl = greetEl ? greetEl.nextElementSibling : null;
 if (subtitleEl) subtitleEl.textContent = "Anda tercatat sedang cuti/izin hari ini. Selamat beristirahat!";
 }
 } catch (e) { /* banner cuti bersifat pelengkap, jangan sampai mengganggu dashboard kalau query gagal */ }

 wrap.innerHTML = banners.length ? `<div class="space-y-3">${banners.join("")}</div>` : "";
}

/* ------------------------ b. LEAVE BALANCE ------------------------ */
async function loadLeaveBalances(container, session) {
 const wrap = container.querySelector("#dash-cuti-cards");
 wrap.innerHTML = `<div class="col-span-3">${skeletonRows(1)}</div>`;
 let jatah = { tahunan: 0, khusus: 0, akumulasi: 0 };
 
 try {
 let kData = null;
 if (session.nik && session.nik !== "null" && session.nik !== "undefined") {
 const snap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)));
 if (snap.exists()) kData = snap.data();
 }
 if (!kData) {
 const q = query(collection(db, COL.MASTER_KARYAWAN), where("nama_karyawan", "==", session.nama), limit(1));
 const snap = await getDocs(q);
 if (!snap.empty) kData = snap.docs[0].data();
 }
 if (kData) {
 const calc = getCalculatedJatahCuti(kData);
 jatah = { tahunan: calc.jatahTahunan, khusus: calc.jatahKhusus, akumulasi: calc.jatahAkumulasi };
 }
 } catch (e) {}

 let terpakai = { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
 try {
 const q = query(collection(db, COL.MASTER_CUTI), where("nama_karyawan", "==", session.nama));
 const snap = await getDocs(q);
 const currentYear = new Date().getFullYear();
 const seenMap = new Set();
 snap.docs.forEach(d => {
 const row = d.data();
 const rowYear = parseInt(row.tahun) || (row.tanggal ? new Date(row.tanggal).getFullYear() : currentYear);
 if (rowYear !== currentYear) return; // hanya hitung transaksi tahun berjalan (lihat cuti.js)
 
 const dedupKey = row.no_referensi || `${(row.nama_karyawan||"").trim()}_${row.tanggal}_${row.type_cuti}_${row.count}`;
 if (seenMap.has(dedupKey)) return;
 seenMap.add(dedupKey);

 if (row.potong_jatah && terpakai[row.potong_jatah] !== undefined) {
 let hitung = parseFloat(row.count);
 if (isNaN(hitung)) hitung = 1; 
 terpakai[row.potong_jatah] += hitung;
 }
 });
 } catch (e) {}

 const cards = [
 { label: "Cuti Tahunan", jatah: jatah.tahunan, terpakai: terpakai.Tahunan, tone: "maroon", ic: "sun", cardBg: "bg-maroon-50/40 border-maroon-100" },
 { label: "Cuti Khusus", jatah: jatah.khusus, terpakai: terpakai.Khusus, tone: "blue", ic: "star", cardBg: "bg-blue-50/40 border-blue-100" },
 { label: "Cuti Akumulasi", jatah: jatah.akumulasi, terpakai: terpakai.Akumulasi, tone: "amber", ic: "clock", cardBg: "bg-amber-50/40 border-amber-100" },
 ];

 wrap.innerHTML = cards.map(c => {
 const sisa = Math.max(c.jatah - c.terpakai, 0);
 const pct = c.jatah > 0 ? Math.min((c.terpakai / c.jatah) * 100, 100) : 0;
 const toneClasses = { maroon: "text-maroon-700 bg-maroon-100", blue: "text-blue-700 bg-blue-100", amber: "text-amber-700 bg-amber-100" };
 const barTone = { maroon: "bg-maroon-600", blue: "bg-blue-600", amber: "bg-amber-500" };
 return `
 <div class="p-2.5 rounded-xl border ${c.cardBg} flex flex-col justify-between transition hover:shadow-xs">
 <div class="flex items-center justify-between gap-1.5">
 <div class="flex items-center gap-1.5 min-w-0">
 <div class="w-6 h-6 rounded-lg ${toneClasses[c.tone]} flex items-center justify-center shrink-0">
 ${icon(c.ic, "w-3.5 h-3.5")}
 </div>
 <span class="text-xs font-bold text-slate-800 truncate">${c.label}</span>
 </div>
 <span class="text-[10px] font-medium text-slate-500 bg-white/90 px-1.5 py-0.5 rounded border border-slate-200/80 shrink-0">
 Total: ${c.jatah} hr
 </span>
 </div>

 <div class="flex items-baseline justify-between mt-2 mb-1">
 <div class="flex items-baseline gap-1">
 <span class="text-xl font-black text-slate-800 font-mono leading-none">${sisa}</span>
 <span class="text-[10px] text-slate-500 font-semibold">sisa hari</span>
 </div>
 <span class="text-[10px] text-slate-500 font-medium">${c.terpakai} hr terpakai</span>
 </div>

 <div class="w-full h-1 bg-slate-200/80 rounded-full overflow-hidden">
 <div class="h-full ${barTone[c.tone]} rounded-full transition-all duration-300" style="width:${pct}%"></div>
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

 wrap.querySelectorAll("[data-kpi-id]").forEach(el => {
 el.onclick = () => { openPenilaianForm(pending.find(x => x.id === el.dataset.kpiId), container, session); };
 });

 } catch (e) { wrap.innerHTML = emptyState("Belum ada data penilaian"); }
}

function openPenilaianForm(task, container, session) {
 const soalHtml = (task.soal_json || []).map((s, i) => `
 <div class="border-b border-slate-100 pb-4 mb-4">
 <div class="flex items-center gap-2 mb-1.5"><span class="bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${escapeHtml(s.aspek)}</span><span class="text-[10px] text-slate-400 font-medium">Bobot: ${s.bobot}%</span></div>
 <p class="text-sm text-slate-800 mb-3">${escapeHtml(s.indikator)}</p>
 <div class="relative"><input type="number" data-idx="${i}" data-bobot="${s.bobot}" class="kpi-nilai-input w-full pl-3 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 transition" placeholder="Berikan Skor (0-100)" required min="0" max="100"><span class="absolute right-3 top-2.5 text-slate-300 font-medium text-sm">/ 100</span></div>
 </div>
 `).join("");

 const catatanHrdHtml = task.catatan_hrd ? `<div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800"><span class="font-bold block mb-1">Catatan HRD untuk Evaluasi ini:</span>${escapeHtml(task.catatan_hrd)}</div>` : '';

 openModal({
 title: `Evaluasi: ${escapeHtml(task.nama_dinilai)}`, size: "md",
 bodyHtml: `
 <form id="form-isi-kpi">
 <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
 <p class="text-xs text-amber-800 leading-relaxed">Dihitung otomatis berdasar bobot. Batas pengumpulan: <strong>${task.deadline ? fmtDateShort(task.deadline) : '-'}</strong>.</p>
 </div>
 ${catatanHrdHtml} ${soalHtml}
 <div class="mt-5 space-y-3">
 <div>
 <label class="block text-xs font-bold text-emerald-800 mb-1 uppercase tracking-wide">[v] Hal-hal yang Sudah Baik (Kelebihan / Prestasi Kerja)</label>
 <textarea id="kpi-catatan-baik" rows="2" class="w-full px-3 py-2 text-xs border border-emerald-200 bg-emerald-50/30 rounded-lg outline-none focus:border-emerald-500 font-medium" placeholder="Tuliskan aspek positif, pencapaian, atau kelebihan kerja..."></textarea>
 </div>
 <div>
 <label class="block text-xs font-bold text-red-800 mb-1 uppercase tracking-wide"> Hal-hal yang Harus Diperbaiki (Area Peningkatan)</label>
 <textarea id="kpi-catatan-perbaikan" rows="2" class="w-full px-3 py-2 text-xs border border-red-200 bg-red-50/30 rounded-lg outline-none focus:border-red-500 font-medium" placeholder="Tuliskan area yang perlu diperbaiki / ditingkatkan..."></textarea>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Catatan & Rekomendasi Tambahan Penilai</label>
 <textarea id="kpi-catatan-penilai" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-medium" placeholder="Saran, masukan, atau rekomendasi umum..."></textarea>
 </div>
 </div>
 </form>
 `,
 footerHtml: `
 <div class="w-full flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3"><span class="text-sm font-bold text-slate-600">Skor Akhir Sementara:</span><span id="kpi-live-score" class="text-lg font-black text-maroon-700">0.00</span></div>
 <div class="flex gap-2 justify-end"><button id="btn-cancel-kpi" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button><button id="btn-submit-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition shadow-md">Kirim Penilaian</button></div>
 `,
 onMount: (m) => {
 const liveScore = m.querySelector("#kpi-live-score");
 m.querySelector("#form-isi-kpi").addEventListener("input", () => {
 let calcTotal = 0;
 m.querySelectorAll(".kpi-nilai-input").forEach(input => {
 const bbt = parseFloat(input.dataset.bobot) || 0; const val = parseFloat(input.value) || 0;
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
 const catatanBaik = m.querySelector("#kpi-catatan-baik") ? m.querySelector("#kpi-catatan-baik").value.trim() : "";
 const catatanPerbaikan = m.querySelector("#kpi-catatan-perbaikan") ? m.querySelector("#kpi-catatan-perbaikan").value.trim() : "";
 const catatanPenilai = m.querySelector("#kpi-catatan-penilai") ? m.querySelector("#kpi-catatan-penilai").value.trim() : "";

 m.querySelectorAll(".kpi-nilai-input").forEach(input => {
 const idx = parseInt(input.dataset.idx); const nilai = parseFloat(input.value) || 0; const bobot = parseFloat(answeredSoal[idx].bobot) || 0;
 answeredSoal[idx].nilai_diberikan = nilai; totalSkorBobot += (nilai * (bobot / 100));
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
 catatan_baik: catatanBaik,
 catatan_perbaikan: catatanPerbaikan,
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
 catatan_baik: catatanBaik,
 catatan_perbaikan: catatanPerbaikan,
 catatan_penilai: catatanPenilai
 }, genId("KPI-LOG"));

 toast("Evaluasi diselesaikan!", "success"); closeModal(); loadKpiTasks(container, session);
 } catch(e) { toast("Gagal menyimpan: " + e.message, "error"); btn.disabled = false; btn.textContent = "Kirim Penilaian"; }
 };
 }
 });
}

/* ------------------------ d. CUTI HARI INI ------------------------ */
async function loadCutiHariIni(container) {
 const wrap = container.querySelector("#dash-cuti-hari-ini");
 const now = new Date();
 const todayStr = localDateStr(now);
 try {
 // PERBAIKAN: query lama memfilter berdasar `bulan`/`tahun` dari TANGGAL
 // MULAI cuti lalu mencocokkan hanya tanggal (getDate()) hari ini -- jadi
 // cuti multi-hari yang mulainya BUKAN hari ini (misalnya mulai kemarin,
 // masih berlangsung hari ini) tidak pernah muncul di widget ini. Sekarang
 // diambil semua transaksi cuti TAHUN INI, lalu dicek apakah HARI INI ada
 // di dalam rentang [tanggal, tanggal_selesai] masing-masing baris.
 const q = query(collection(db, COL.MASTER_CUTI), where("tahun", "==", now.getFullYear()));
 const snap = await getDocs(q);
 const rawRows = snap.docs.map(d => d.data()).filter(r => {
 const start = (r.tanggal || "").toString().substring(0, 10);
 const end = (r.tanggal_selesai || r.tanggal || "").toString().substring(0, 10);
 return start && todayStr >= start && todayStr <= end;
 });
 const uniqueMap = new Map();
 rawRows.forEach(r => {
 const key = `${(r.nama_karyawan || "").trim().toLowerCase()}_${r.tanggal || ""}_${r.type_cuti || ""}`;
 if (!uniqueMap.has(key)) {
 uniqueMap.set(key, r);
 }
 });
 const todayRows = Array.from(uniqueMap.values());
 if (!todayRows.length) { 
 wrap.innerHTML = `<div class="col-span-full py-2 px-3 text-center text-xs text-slate-400 italic bg-slate-50/80 rounded-lg border border-dashed border-slate-200">Tidak ada karyawan yang cuti / izin hari ini</div>`; 
 return; 
 }
 wrap.innerHTML = todayRows.map(r => `
 <div class="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition text-xs">
 <div class="flex items-center gap-2.5 min-w-0">
 ${avatar(r.nama_karyawan || "?", "w-7 h-7 text-[10px] shrink-0")}
 <div class="min-w-0">
 <p class="font-semibold text-slate-800 truncate leading-tight">${escapeHtml(r.nama_karyawan || "-")}</p>
 <p class="text-[10px] text-slate-400 truncate">${escapeHtml(r.cabang || "-")}</p>
 </div>
 </div>
 <span class="px-2 py-0.5 rounded-md font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-100 shrink-0 ml-1.5">
 ${escapeHtml(r.type_cuti || "Cuti")}
 </span>
 </div>`).join("");
 } catch (e) { wrap.innerHTML = `<div class="col-span-full py-2 px-3 text-center text-xs text-slate-400 italic bg-slate-50 rounded-lg">Gagal memuat data cuti</div>`; }
}

/* ------------------------ e. PENGUMUMAN ------------------------ */
async function loadAnnouncements(container, session) {
 const wrap = container.querySelector("#dash-announcements");
 try {
 const q = query(collection(db, COL.BROADCAST), orderBy("tanggal", "desc"), limit(20));
 const snap = await getDocs(q);
 const now = new Date();
 const isHrdRole = ["HRD", "SUPERADMIN", "ADMIN", "ADMINISTRATOR", "DIREKTUR", "GM", "FINANCE"].includes((session?.role || "").toUpperCase());
 const dismissedIds = getDismissedAnnouncements(session).map(String);

 const validMemos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => {
 if (dismissedIds.includes(String(r.id))) return false;

 if (r.tanggal_berakhir) { 
 const tglBatas = new Date(r.tanggal_berakhir); tglBatas.setHours(23, 59, 59, 999);
 if (tglBatas < now) return false;
 }
 
 if (isHrdRole) return true;
 if (r.dibuat_oleh && r.dibuat_oleh.toLowerCase() === String(session?.nama || "").toLowerCase()) return true;

 // Filter Penerima Spesifik
 if (r.target_type === "SPESIFIK") {
 const list = (r.target_list || []).map(x => String(x || "").trim().toLowerCase());
 const myName = String(session?.nama || "").trim().toLowerCase();
 const myUsername = String(session?.username || "").trim().toLowerCase();
 const myNik = String(session?.nik || "").trim().toLowerCase();
 return list.some(target => 
 target === myName || 
 target === myUsername || 
 (myNik && target === myNik) ||
 (myName && (target.includes(myName) || myName.includes(target)))
 );
 }
 return true;
 }).slice(0, 6);

 if (!validMemos.length) { wrap.innerHTML = emptyState("Belum ada pengumuman aktif"); return; }
 wrap.innerHTML = validMemos.map((r, idx) => {
 const plainText = String(r.isi || "").replace(/<[^>]+>/g, "").slice(0, 90);
 return `
 <div data-memo-idx="${idx}" class="flex gap-3 cursor-pointer hover:bg-slate-50 rounded-lg p-2 -m-2 transition">
 <div class="w-2 h-2 rounded-full bg-maroon-600 mt-2 shrink-0"></div>
 <div>
 <p class="text-sm font-medium text-slate-700">${escapeHtml(r.judul || "Pengumuman")}</p>
 <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(plainText)}${plainText.length >= 90 ? "..." : ""}</p>
 <p class="text-[11px] text-slate-400 mt-1">${fmtDateShort(r.tanggal)} oleh ${escapeHtml(r.dibuat_oleh || "-")}</p>
 </div>
 </div>`;
 }).join("");

 wrap.querySelectorAll("[data-memo-idx]").forEach(el => {
 el.onclick = () => openAnnouncementDetailModal(validMemos[parseInt(el.dataset.memoIdx, 10)], session, () => loadAnnouncements(container, session));
 });
 } catch (e) { wrap.innerHTML = emptyState("Belum ada pengumuman"); }
}

function openAnnouncementDetailModal(memo, session, onRefresh) {
 if (!memo) return;
 const isHrdRole = ["HRD", "SUPERADMIN", "ADMIN", "ADMINISTRATOR", "DIREKTUR", "GM", "FINANCE"].includes((session?.role || "").toUpperCase());
 const isCreator = memo.dibuat_oleh && memo.dibuat_oleh.toLowerCase() === String(session?.nama || "").toLowerCase();
 const canDeleteDb = isHrdRole || isCreator;

 const body = `
 <div class="space-y-4">
 <div class="flex items-center justify-between text-xs text-slate-400 border-b border-slate-100 pb-2">
 <span>${fmtDateShort(memo.tanggal)} • oleh ${escapeHtml(memo.dibuat_oleh || "-")}</span>
 ${memo.tanggal_berakhir ? `<span>Berlaku s/d ${fmtDateShort(memo.tanggal_berakhir)}</span>` : ""}
 </div>
 <div class="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 quill-content">${memo.isi || "<i>Tidak ada isi.</i>"}</div>
 ${memo.lampiran_url ? `<a href="${escapeHtml(memo.lampiran_url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm font-medium text-maroon-700 hover:underline">${icon("link", "w-4 h-4")} Lihat Lampiran</a>` : ""}
 </div>
 <div class="mt-6 flex items-center justify-between gap-2">
 <button id="btn-delete-dash-memo" class="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
 ${canDeleteDb ? 'Hapus Pengumuman' : 'Sembunyikan Pengumuman'}
 </button>
 <button id="btn-tutup-pengumuman" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition">Tutup</button>
 </div>
 `;
 openModal({
 title: memo.judul || "Pengumuman",
 size: "lg",
 bodyHtml: body,
 onMount: (m) => {
 m.querySelector("#btn-tutup-pengumuman").onclick = closeModal;
 const btnDel = m.querySelector("#btn-delete-dash-memo");
 if (btnDel) {
 btnDel.onclick = async () => {
 if (!memo.id) return;
 const promptMsg = canDeleteDb
 ? `Apakah Anda yakin ingin MENGHAPUS pengumuman "${memo.judul}" ini dari database?`
 : `Apakah Anda yakin ingin MENGHAPUS / MENYEMBUNYIKAN pengumuman "${memo.judul}" ini dari tampilan Anda?`;

 if (confirm(promptMsg)) {
 try {
 if (canDeleteDb) {
 await deleteBroadcastMemoAndNotifs(memo.id);
 toast(`Pengumuman "${memo.judul}" berhasil dihapus dari database.`, "success");
 } else {
 dismissAnnouncementForUser(memo.id, session);
 toast(`Pengumuman "${memo.judul}" berhasil disembunyikan.`, "success");
 }
 closeModal();
 if (typeof onRefresh === "function") onRefresh();
 } catch (err) {
 toast("Gagal menghapus pengumuman: " + err.message, "error");
 }
 }
 };
 }
 }
 });
}


/* ------------------------ f. CONTRACT EXPIRY ------------------------ */
async function loadContractExpiry(container, session) {
 const wrapOuter = container.querySelector("#dash-contract-widget-wrap");
 if (!wrapOuter) return;

 const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";
 const isAtasanRole = ["SPV", "MANAGER", "GM", "ATASAN", "MANAJEMEN"].includes((session.role || "").toUpperCase());

 try {
 const snap = await getDocs(collection(db, COL.MASTER_KARYAWAN));
 const now = new Date();
 const allKaryawan = snap.docs.map(d => ({ id: d.id, ...d.data() }));

 const myNameLower = (session.nama || "").trim().toLowerCase();
 const myUsernameLower = (session.username || "").trim().toLowerCase();
 const myNik = (session.nik || "").trim();

 const isDirectAtasan = allKaryawan.some(k => {
 const atasanStr = (k.atasan_langsung || k.atasan || k.nama_atasan || "").toLowerCase();
 return atasanStr.includes(myNameLower) || atasanStr.includes(myUsernameLower);
 });

 if (!isHrd && !isAtasanRole && !isDirectAtasan) {
 wrapOuter.classList.add("hidden");
 return;
 }

 wrapOuter.classList.remove("hidden");
 const wrap = container.querySelector("#dash-contract-list");
 const countBadge = container.querySelector("#dash-contract-count-badge");
 const subtitleEl = container.querySelector("#dash-contract-subtitle");

 let expiringList = allKaryawan.filter(k => k.kontrak_habis).map(k => {
 const t = k.kontrak_habis?.toDate ? k.kontrak_habis.toDate() : new Date(k.kontrak_habis);
 return { ...k, _expiry: t, _days: Math.round((t - now) / 86400000) };
 }).filter(k => !isNaN(k._expiry) && k._days >= 0 && k._days <= 60).sort((a, b) => a._days - b._days);

 // If supervisor (not HRD), show only their subordinates
 if (!isHrd) {
 expiringList = expiringList.filter(k => {
 const atasanStr = (k.atasan_langsung || k.atasan || k.nama_atasan || "").toLowerCase();
 return atasanStr.includes(myNameLower) || atasanStr.includes(myUsernameLower) || (myNik && k.nik_atasan === myNik);
 });
 if (subtitleEl) subtitleEl.textContent = "Masa berlaku kontrak bawahan langsung Anda yang berakhir dalam 60 hari ke depan. Lakukan evaluasi sebelum perpanjangan.";
 }

 if (countBadge) countBadge.textContent = `${expiringList.length} Karyawan`;

 if (!expiringList.length) {
 wrap.innerHTML = `
 <div class="col-span-full bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 text-center">
 <p class="text-xs font-bold text-amber-900">Semua Kontrak Dalam Kondisi Aman</p>
 <p class="text-[11px] text-amber-700/80 mt-0.5">Tidak ada karyawan ${!isHrd ? 'bawahan Anda' : ''} yang masa berlaku kontraknya berakhir dalam 60 hari ke depan.</p>
 </div>
 `;
 return;
 }

 wrap.innerHTML = expiringList.map(k => {
 const days = k._days;
 let badgeStyle = "bg-amber-100 text-amber-900 border-amber-300";
 if (days <= 14) badgeStyle = "bg-rose-100 text-rose-800 border-rose-300 animate-pulse";
 else if (days <= 30) badgeStyle = "bg-orange-100 text-orange-800 border-orange-300";

 return `
 <div class="flex flex-col p-3.5 bg-white rounded-2xl border border-amber-200/90 shadow-xs justify-between gap-3 hover:border-amber-400 transition">
 <div class="flex items-start justify-between gap-2">
 <div>
 <p class="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
 <span>${escapeHtml(k.nama_karyawan || k.nama)}</span>
 <span class="text-[10px] font-mono text-slate-400 font-normal">(${escapeHtml(k.nik_karyawan || k.nik || '-')})</span>
 </p>
 <p class="text-[11px] text-slate-600 font-medium mt-0.5">
 ${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.cabang_penempatan || k.cabang || "-")}
 </p>
 <p class="text-[10px] text-amber-900 font-semibold mt-1">
 Habis Kontrak: <span class="underline">${fmtDate(k._expiry)}</span>
 </p>
 </div>
 <span class="px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${badgeStyle}">
 sisa ${days} hari
 </span>
 </div>

 <div class="flex items-center gap-1.5 pt-2 border-t border-amber-100/80 flex-wrap">
 <a href="#penilaian-kontrak" class="flex-1 px-2.5 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-[11px] rounded-xl text-center transition shadow-xs">
 Evaluasi / Penilaian
 </a>
 <a href="#dokumen" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-[11px] rounded-xl text-center border border-blue-200 transition">
 Draft PKWT
 </a>
 ${k.atasan_langsung ? `
 <button data-atasan="${escapeHtml(k.atasan_langsung)}" data-nama="${escapeHtml(k.nama_karyawan || k.nama)}" data-days="${days}" class="btn-notify-atasan px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl border border-slate-200" title="Kirim Pengingat Notif Atasan">
 Pengingat
 </button>
 ` : ''}
 </div>
 </div>
 `;
 }).join("");

 // Bind notify button
 wrap.querySelectorAll(".btn-notify-atasan").forEach(btn => {
 btn.onclick = async () => {
 const targetAtasan = btn.dataset.atasan;
 const targetNama = btn.dataset.nama;
 const remainingDays = btn.dataset.days;
 try {
 await notifyUser(targetAtasan, `Pengingat Penilaian Kontrak: ${targetNama}`, `Masa kontrak ${targetNama} tersisa ${remainingDays} hari. Mohon lakukan Penilaian Kontrak & Evaluasi Kinerja.`, "#penilaian-kontrak");
 toast(`Notifikasi pengingat evaluasi berhasil dikirim ke ${targetAtasan}`, "success");
 } catch (e) {
 toast("Gagal mengirim notifikasi: " + e.message, "error");
 }
 };
 });

 } catch (e) {
 console.warn("Contract widget err:", e);
 if (wrapOuter) wrapOuter.classList.add("hidden");
 }
}

/* ------------------------ g. ATTENDANCE ANALYTICS ------------------------ */
function parseDateStringToYMD(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function formatMonthYearLabel(prefix) {
  if (!prefix || prefix.length < 7) return "Bulan Ini";
  const [yyyy, mm] = prefix.split("-");
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const idx = parseInt(mm, 10) - 1;
  if (idx >= 0 && idx < 12) {
    return `${monthNames[idx]} ${yyyy}`;
  }
  return prefix;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  const m = s.match(/^(\d{1,2})[:\.](\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function getShiftForEmployee(empObjectOrJabatan, cfgJadwal = []) {
  let jab = "";
  let nama = "";

  if (typeof empObjectOrJabatan === "string") {
    jab = empObjectOrJabatan.trim().toLowerCase();
  } else if (empObjectOrJabatan && typeof empObjectOrJabatan === "object") {
    jab = String(empObjectOrJabatan.jabatan || empObjectOrJabatan.posisi || "").trim().toLowerCase();
    nama = String(empObjectOrJabatan.nama_karyawan || empObjectOrJabatan.nama || "").trim().toLowerCase();
  }

  const isCashier = jab.includes("cashier") || jab.includes("kasir") || nama.includes("jannah") || nama.includes("amaliatul");

  if (jab && cfgJadwal && cfgJadwal.length) {
    const match = cfgJadwal.find(j => {
      const jJab = String(j.jabatan || "").trim().toLowerCase();
      return jJab && (jJab === jab || jab.includes(jJab) || jJab.includes(jab));
    });
    if (match && match.masuk) {
      return { masuk: match.masuk, pulang: match.pulang || "17:00" };
    }
  }

  if (isCashier) {
    return { masuk: "09:00", pulang: "18:00" };
  }

  if (cfgJadwal && cfgJadwal.length) {
    const defaultShift = cfgJadwal.find(j => {
      const jJab = String(j.jabatan || "").trim().toLowerCase();
      return !jJab || jJab === "all" || jJab === "semua jabatan" || jJab === "semua";
    });
    if (defaultShift && defaultShift.masuk) {
      return { masuk: defaultShift.masuk, pulang: defaultShift.pulang || "17:00" };
    }
  }

  return { masuk: "08:00", pulang: "17:00" };
}

function checkIsLate(scanMasuk, jadwalMasuk = "08:00", tolTelatMins = 0) {
  const scanMins = parseTimeToMinutes(scanMasuk);
  if (scanMins === null) return false;
  const targetMins = parseTimeToMinutes(jadwalMasuk) ?? 480; // 08:00 WIB = 480
  const tol = parseInt(tolTelatMins, 10) || 0;
  return scanMins > (targetMins + tol);
}

function getLateDurationMinutes(scanMasuk, jadwalMasuk = "08:00") {
  const scanMins = parseTimeToMinutes(scanMasuk);
  if (scanMins === null) return 0;
  const targetMins = parseTimeToMinutes(jadwalMasuk) ?? 480;
  return Math.max(0, scanMins - targetMins);
}

function isRecordMatchingUser(record, userSession, userEmpObj = null) {
  if (!record || !userSession) return false;
  const uNik = String(userSession.nik || "").trim().toLowerCase();
  const uNama = String(userSession.nama || "").trim().toLowerCase();
  const uUser = String(userSession.username || "").trim().toLowerCase();

  const rNik = String(record.nik || "").trim().toLowerCase();
  const rNama = String(record.nama || "").trim().toLowerCase();

  if (uNik && rNik && uNik === rNik) return true;
  if (uUser && (rNik === uUser || rNama === uUser || rNama.includes(uUser))) return true;
  if (uNama && rNama) {
    if (uNama === rNama || uNama.includes(rNama) || rNama.includes(uNama)) return true;
    if ((uNama.includes("jannah") || uNama.includes("amaliatul")) && (rNama.includes("jannah") || rNama.includes("amaliatul"))) return true;
  }

  if (userEmpObj) {
    const eNik = String(userEmpObj.nik || userEmpObj.nik_karyawan || "").trim().toLowerCase();
    const eNama = String(userEmpObj.nama_karyawan || userEmpObj.nama || "").trim().toLowerCase();
    const eUser = String(userEmpObj.username || "").trim().toLowerCase();

    if (eNik && rNik && eNik === rNik) return true;
    if (eNama && rNama && (eNama === rNama || eNama.includes(rNama) || rNama.includes(eNama))) return true;
    if (eUser && (rNik === eUser || rNama === eUser)) return true;
  }

  if (record._empObj) {
    const reNik = String(record._empObj.nik || record._empObj.nik_karyawan || "").trim().toLowerCase();
    const reNama = String(record._empObj.nama_karyawan || record._empObj.nama || "").trim().toLowerCase();

    if (uNik && reNik && uNik === reNik) return true;
    if (uNama && reNama && (uNama === reNama || uNama.includes(reNama) || reNama.includes(uNama))) return true;
    if (uUser && (reNik === uUser || reNama === uUser)) return true;

    if (userEmpObj) {
      const eNik = String(userEmpObj.nik || userEmpObj.nik_karyawan || "").trim().toLowerCase();
      const eNama = String(userEmpObj.nama_karyawan || userEmpObj.nama || "").trim().toLowerCase();
      if (eNik && reNik && eNik === reNik) return true;
      if (eNama && reNama && (eNama === reNama || eNama.includes(reNama) || reNama.includes(eNama))) return true;
    }
  }

  return false;
}

async function loadAttendanceAnalytics(container, session) {
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";
  const titleEl = container.querySelector("#dash-attendance-title");
  const bodyEl = container.querySelector("#dash-attendance-body");

  try {
    const [rawAllAbsen, allKaryawan, cfgSnap] = await Promise.all([
      fsGetAll(COL.DATA_ABSENSI),
      fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
      getDoc(doc(db, COL.APP_SETTINGS, "main")).catch(() => null)
    ]);

    const cfgData = (cfgSnap && cfgSnap.exists()) ? cfgSnap.data() : {};
    const cfgJadwal = cfgData?.jadwal || [];
    const tolTelatMins = parseInt(cfgData?.tarif?.tol_telat, 10) || 0;

    // Resolve user's employee record in MASTER_KARYAWAN
    const userEmpObj = (allKaryawan || []).find(k => {
      const kNik = String(k.nik || k.nik_karyawan || "").trim().toLowerCase();
      const kNama = String(k.nama_karyawan || k.nama || "").trim().toLowerCase();
      const kUser = String(k.username || "").trim().toLowerCase();

      const sNik = String(session.nik || "").trim().toLowerCase();
      const sNama = String(session.nama || "").trim().toLowerCase();
      const sUser = String(session.username || "").trim().toLowerCase();

      if (sNik && kNik && sNik === kNik) return true;
      if (sUser && (kUser === sUser || kNik === sUser)) return true;
      if (sNama && kNama && (sNama === kNama || sNama.includes(kNama) || kNama.includes(sNama))) return true;
      if (sNama && (sNama.includes("jannah") || sNama.includes("amaliatul")) && (kNama.includes("jannah") || kNama.includes("amaliatul"))) return true;
      return false;
    });

    // Annotate with normalized dates & month prefixes
    const annotatedAll = rawAllAbsen.map(item => {
      const normDate = parseDateStringToYMD(item.tanggal) || parseDateStringToYMD(item.created_at) || "";
      const monthPrefix = normDate ? normDate.substring(0, 7) : "";
      
      // Resolve employee object from master karyawan
      const empObj = (allKaryawan || []).find(k => {
        const kNik = String(k.nik || k.nik_karyawan || "").trim();
        const kNama = String(k.nama_karyawan || k.nama || "").trim().toLowerCase();
        const rNik = String(item.nik || "").trim();
        const rNama = String(item.nama || "").trim().toLowerCase();
        if (kNik && rNik && kNik === rNik) return true;
        if (kNama && rNama && kNama === rNama) return true;
        if (rNama && (rNama.includes("jannah") || rNama.includes("amaliatul")) && (kNama.includes("jannah") || kNama.includes("amaliatul"))) return true;
        return false;
      });

      const shiftInput = empObj || { nama: item.nama, jabatan: item.jabatan || "" };
      const shift = getShiftForEmployee(shiftInput, cfgJadwal);

      const empNameStr = String(item.nama || empObj?.nama_karyawan || empObj?.nama || "").toLowerCase();
      const empJabStr = String(item.jabatan || empObj?.jabatan || empObj?.posisi || "").toLowerCase();
      const isCashierOrJannah = empNameStr.includes("jannah") || empNameStr.includes("amaliatul") || empJabStr.includes("cashier") || empJabStr.includes("kasir");

      let effectiveJadwalMasuk = shift.masuk;
      if (!isCashierOrJannah && item.jadwal_masuk && item.jadwal_masuk !== "08:00") {
        effectiveJadwalMasuk = item.jadwal_masuk;
      }

      let effectiveJadwalKeluar = shift.pulang;
      if (!isCashierOrJannah && item.jadwal_keluar && item.jadwal_keluar !== "17:00") {
        effectiveJadwalKeluar = item.jadwal_keluar;
      }

      return { 
        ...item, 
        jadwal_masuk: effectiveJadwalMasuk,
        jadwal_keluar: effectiveJadwalKeluar,
        _normDate: normDate, 
        _monthPrefix: monthPrefix,
        _nikStr: String(item.nik || "").trim(),
        _namaStr: String(item.nama || "").trim(),
        _empObj: empObj
      };
    }).filter(x => x._normDate !== "");

    if (annotatedAll.length === 0) {
      if (titleEl) titleEl.textContent = isHrd ? "Analitik Kehadiran Perusahaan" : "Analitik Kehadiran Saya";
      bodyEl.innerHTML = emptyState(
        isHrd ? "Belum ada data absensi tercatat di sistem" : "Belum ada data absensi Anda tercatat di sistem",
        "Data absensi harian yang diinput melalui menu Manajemen Absensi atau penarikan LAN akan otomatis dianalisis di sini."
      );
      return;
    }

    // Determine default base records for regular user vs HRD
    let baseUserAbsen = annotatedAll;
    if (!isHrd) {
      baseUserAbsen = annotatedAll.filter(x => isRecordMatchingUser(x, session, userEmpObj));
      if (baseUserAbsen.length === 0) {
        if (titleEl) titleEl.textContent = "Analitik Kehadiran Saya";
        bodyEl.innerHTML = emptyState(
          "Belum ada data absensi Anda tercatat di sistem",
          "Data absensi Anda akan otomatis dianalisis di sini setelah diinput atau disinkronkan."
        );
        return;
      }
    }

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const availableMonths = Array.from(new Set(baseUserAbsen.map(x => x._monthPrefix))).filter(Boolean).sort().reverse();

    let selectedMonthPrefix = currentMonthPrefix;
    if (!availableMonths.includes(currentMonthPrefix) && availableMonths.length > 0) {
      selectedMonthPrefix = availableMonths[0];
    }

    // Prepare list of employees for HRD filter dropdown
    let selectedEmpKey = "ALL"; // "ALL" or specific NIK/Nama key
    const employeeList = [];
    if (isHrd) {
      const empMap = new Map();
      // Add active karyawan from MASTER_KARYAWAN first
      (allKaryawan || []).forEach(k => {
        const nik = String(k.nik || k.nik_karyawan || "").trim();
        const nama = String(k.nama_karyawan || k.nama || "").trim();
        if (nama) {
          const key = nik || nama.toLowerCase();
          empMap.set(key, { key, nik, nama, label: nik ? `${nama} (NIK: ${nik})` : nama });
        }
      });
      // Add any unique employees from attendance logs if not in master
      annotatedAll.forEach(a => {
        const nik = a._nikStr;
        const nama = a._namaStr;
        if (nama) {
          const key = nik || nama.toLowerCase();
          if (!empMap.has(key)) {
            empMap.set(key, { key, nik, nama, label: nik ? `${nama} (NIK: ${nik})` : nama });
          }
        }
      });
      employeeList.push(...Array.from(empMap.values()).sort((a, b) => a.nama.localeCompare(b.nama)));
    }

    function renderAnalytics() {
      // 1. Filter by month
      let monthFiltered = baseUserAbsen.filter(x => x._monthPrefix === selectedMonthPrefix);

      // 2. Filter by selected employee (for HRD)
      let selectedEmpObj = null;
      if (isHrd && selectedEmpKey !== "ALL") {
        selectedEmpObj = employeeList.find(e => e.key === selectedEmpKey);
        monthFiltered = monthFiltered.filter(x => {
          if (selectedEmpObj?.nik && x._nikStr) return x._nikStr === selectedEmpObj.nik;
          return x._namaStr.toLowerCase() === (selectedEmpObj?.nama || "").toLowerCase();
        });
      }

      // Update widget header title & selectors
      if (titleEl) {
        if (!isHrd) {
          titleEl.textContent = "Analitik Kehadiran Saya";
        } else if (selectedEmpKey === "ALL") {
          titleEl.textContent = "Analitik Kehadiran Perusahaan";
        } else {
          titleEl.textContent = `Analitik Kehadiran: ${selectedEmpObj?.nama || "Karyawan"}`;
        }
      }

      const totalPresent = monthFiltered.length;

      // Month dropdown options
      const monthOptionsHtml = availableMonths.map(m => 
        `<option value="${m}" ${m === selectedMonthPrefix ? "selected" : ""}>${formatMonthYearLabel(m)}</option>`
      ).join("");

      // Employee dropdown options for HRD
      let empSelectorHtml = "";
      if (isHrd) {
        const empOptionsHtml = [
          `<option value="ALL" ${selectedEmpKey === "ALL" ? "selected" : ""}>👥 Seluruh Karyawan (Perusahaan)</option>`,
          ...employeeList.map(e => `<option value="${escapeHtml(e.key)}" ${e.key === selectedEmpKey ? "selected" : ""}>👤 ${escapeHtml(e.label)}</option>`)
        ].join("");

        empSelectorHtml = `
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-[11px] text-slate-500 font-medium hidden sm:inline">Karyawan:</span>
            <select id="dash-attendance-emp-select" class="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-700 outline-none focus:border-maroon-600 max-w-[180px] sm:max-w-[220px] truncate shadow-2xs">
              ${empOptionsHtml}
            </select>
          </div>
        `;
      }

      const topControlsHtml = `
        <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl text-xs">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="font-bold text-slate-700 hidden sm:inline">Periode:</span>
            <select id="dash-attendance-month-select" class="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-700 outline-none focus:border-maroon-600 shadow-2xs">
              ${monthOptionsHtml}
            </select>
          </div>
          ${empSelectorHtml}
          <div class="flex items-center gap-1.5">
            <span class="font-semibold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200 text-[10.5px] shadow-2xs">Toleransi: ${tolTelatMins} Menit</span>
            <span class="font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] shadow-2xs">${totalPresent} Log Presensi</span>
          </div>
        </div>
      `;

      if (totalPresent === 0) {
        bodyEl.innerHTML = `
          <div class="space-y-3">
            ${topControlsHtml}
            ${emptyState(
              `Belum ada data absensi ${isHrd && selectedEmpKey !== "ALL" ? `untuk ${selectedEmpObj?.nama}` : ""} pada periode ${formatMonthYearLabel(selectedMonthPrefix)}`
            )}
          </div>
        `;
        bindControls();
        return;
      }

      // Calculate Late Logs accurately using configured tolerance
      const lateLogs = monthFiltered.filter(x => checkIsLate(x.scan_masuk, x.jadwal_masuk, tolTelatMins));
      const lateCount = lateLogs.length;
      const onTimeCount = totalPresent - lateCount;
      const onTimeRateVal = ((onTimeCount / totalPresent) * 100);
      const onTimeRateStr = onTimeRateVal.toFixed(1);
      const skorKedisiplinan = Math.round(onTimeRateVal);

      let grade = "A";
      let gradeClass = "text-emerald-400";
      let gradeLabel = "SANGAT DISIPLIN";
      if (skorKedisiplinan < 60) {
        grade = "D"; gradeClass = "text-rose-400"; gradeLabel = "PERLU PEMBINAAN";
      } else if (skorKedisiplinan < 75) {
        grade = "C"; gradeClass = "text-amber-400"; gradeLabel = "CUKUP DISIPLIN";
      } else if (skorKedisiplinan < 90) {
        grade = "B"; gradeClass = "text-blue-400"; gradeLabel = "DISIPLIN BAIK";
      }

      // Daily Bar Chart Data Preparation
      const dayMap = {};
      monthFiltered.forEach(x => {
        const dStr = x._normDate;
        if (!dayMap[dStr]) dayMap[dStr] = { onTime: 0, late: 0, total: 0 };
        const isLate = checkIsLate(x.scan_masuk, x.jadwal_masuk, tolTelatMins);
        if (isLate) dayMap[dStr].late++;
        else dayMap[dStr].onTime++;
        dayMap[dStr].total++;
      });

      const sortedDays = Object.keys(dayMap).sort();
      const maxDayCount = Math.max(1, ...sortedDays.map(d => dayMap[d].total));

      const dailyBarsHtml = sortedDays.length === 0 ? `
        <div class="w-full text-center py-6 text-xs text-slate-400 italic">Belum ada grafik rincian harian.</div>
      ` : sortedDays.map(dStr => {
        const dayData = dayMap[dStr];
        const dayNum = dStr.split("-")[2] || dStr;
        const onTimePct = Math.round((dayData.onTime / maxDayCount) * 100);
        const latePct = Math.round((dayData.late / maxDayCount) * 100);

        const lateBar = latePct > 0 ? `<div class="w-full bg-rose-500 transition-all duration-300" style="height: ${latePct}%"></div>` : "";
        const onTimeBar = onTimePct > 0 ? `<div class="w-full bg-emerald-500 transition-all duration-300" style="height: ${onTimePct}%"></div>` : "";

        return `
          <div class="flex-1 min-w-[20px] max-w-[36px] flex flex-col items-center gap-1 group relative cursor-pointer" title="Tanggal ${dStr}: Total ${dayData.total} Presensi (${dayData.onTime} Tepat Waktu, ${dayData.late} Terlambat)">
            <div class="w-full bg-slate-100 rounded-t-md flex flex-col justify-end overflow-hidden h-24 border border-slate-200/60 shadow-2xs">
              ${lateBar}
              ${onTimeBar}
            </div>
            <span class="text-[9.5px] font-bold text-slate-500 group-hover:text-slate-900 transition">${dayNum}</span>
          </div>
        `;
      }).join("");

      // Detail section for late records
      let lateDetailSectionHtml = "";
      if (isHrd && selectedEmpKey === "ALL") {
        const employeeLates = {};
        lateLogs.forEach(log => {
          const nameKey = log._namaStr || "Karyawan";
          employeeLates[nameKey] = (employeeLates[nameKey] || 0) + 1;
        });
        const topLates = Object.entries(employeeLates)
          .map(([nama, count]) => ({ nama, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4);

        if (topLates.length > 0) {
          const topLatesRows = topLates.map(tl => `
            <div class="flex items-center justify-between text-xs text-slate-600 bg-rose-50/80 px-3 py-1.5 rounded-lg border border-rose-100">
              <span class="font-bold text-slate-800">${escapeHtml(tl.nama)}</span>
              <span class="font-extrabold text-rose-600">${tl.count} kali keterlambatan</span>
            </div>
          `).join("");
          lateDetailSectionHtml = `
            <div class="pt-1 space-y-2">
              <h4 class="text-xs font-bold text-slate-700">Daftar Karyawan Terlambat Periode Ini:</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${topLatesRows}
              </div>
            </div>
          `;
        } else {
          lateDetailSectionHtml = `
            <p class="text-xs text-emerald-700 font-bold text-center py-2 bg-emerald-50/80 rounded-xl border border-emerald-100">Luar biasa! Tidak ada keterlambatan tercatat pada seluruh perusahaan periode ini.</p>
          `;
        }
      } else {
        // Individual Employee Late History Logs
        if (lateLogs.length > 0) {
          const lateItemRows = lateLogs.slice(0, 5).map(l => {
            const minsLate = getLateDurationMinutes(l.scan_masuk, l.jadwal_masuk);
            const durText = minsLate > 0 ? `+${minsLate} menit` : "Terlambat";
            return `
              <div class="flex items-center justify-between text-xs bg-rose-50/70 border border-rose-100 p-2 rounded-lg">
                <span class="font-bold text-slate-700">${fmtDateShort(l._normDate)}</span>
                <span class="font-mono text-slate-600">Jam Scan: <b class="text-rose-700">${escapeHtml(l.scan_masuk)}</b> (Shift: ${escapeHtml(l.jadwal_masuk || "08:00")})</span>
                <span class="font-extrabold text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded text-[10px]">${durText}</span>
              </div>
            `;
          }).join("");

          lateDetailSectionHtml = `
            <div class="pt-1 space-y-1.5">
              <h4 class="text-xs font-bold text-slate-700">Catatan Keterlambatan (${lateLogs.length} Kali):</h4>
              <div class="space-y-1">
                ${lateItemRows}
              </div>
            </div>
          `;
        } else {
          lateDetailSectionHtml = `
            <div class="text-xs bg-emerald-50/80 border border-emerald-100 rounded-xl p-3 text-emerald-800 font-medium flex items-center gap-2">
              <span class="text-base">🎉</span>
              <span>Luar biasa! Selalu tepat waktu dan tidak pernah keterlambatan pada periode ini.</span>
            </div>
          `;
        }
      }

      const strokeDash = 201.06 - (201.06 * skorKedisiplinan / 100);

      bodyEl.innerHTML = `
        <div class="space-y-4">
          ${topControlsHtml}

          <!-- Donut Score Widget & Stats Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <!-- Donut Score Widget -->
            <div class="sm:col-span-1 bg-slate-900 text-white p-3.5 rounded-xl flex flex-col items-center justify-center text-center shadow-xs relative overflow-hidden">
              <span class="text-[10px] font-bold tracking-wider uppercase text-slate-300 mb-1">Skor Kedisiplinan</span>
              <div class="relative w-20 h-20 my-1 flex items-center justify-center">
                <svg class="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" stroke="currentColor" stroke-width="8" class="text-slate-800" fill="transparent" />
                  <circle cx="40" cy="40" r="32" stroke="currentColor" stroke-width="8" class="${gradeClass}" fill="transparent" stroke-dasharray="201.06" stroke-dashoffset="${strokeDash}" stroke-linecap="round" />
                </svg>
                <div class="absolute flex flex-col items-center justify-center text-center">
                  <span class="text-xl font-black text-white leading-none">${skorKedisiplinan}</span>
                  <span class="text-[9px] text-slate-300 font-bold">/ 100</span>
                </div>
              </div>
              <span class="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white backdrop-blur-xs border border-white/20">
                Grade ${grade} • ${gradeLabel}
              </span>
            </div>

            <!-- On-Time & Late Summary Cards -->
            <div class="sm:col-span-2 grid grid-cols-2 gap-2.5">
              <div class="bg-emerald-50/60 border border-emerald-100 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
                <div>
                  <span class="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Tepat Waktu (&lt;= Shift)</span>
                  <span class="text-2xl font-black text-emerald-700 mt-1 block">${onTimeCount}</span>
                </div>
                <span class="text-[10.5px] text-emerald-600 font-semibold">${onTimeRateStr}% dari presensi</span>
              </div>
              <div class="bg-rose-50/60 border border-rose-100 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
                <div>
                  <span class="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">Terlambat (&gt; Shift)</span>
                  <span class="text-2xl font-black text-rose-700 mt-1 block">${lateCount} Kali</span>
                </div>
                <span class="text-[10.5px] text-rose-600 font-semibold">${(100 - parseFloat(onTimeRateStr)).toFixed(1)}% keterlambatan</span>
              </div>
            </div>
          </div>

          <!-- GRAFIK BATANG TREN PRESENSI HARIAN -->
          <div class="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/70 space-y-2">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <h4 class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>📊 Grafik Tren Presensi Harian</span>
              </h4>
              <div class="flex items-center gap-3 text-[10px] font-bold">
                <span class="flex items-center gap-1 text-emerald-700"><span class="w-2.5 h-2.5 bg-emerald-500 rounded-xs inline-block"></span> Tepat Waktu</span>
                <span class="flex items-center gap-1 text-rose-700"><span class="w-2.5 h-2.5 bg-rose-500 rounded-xs inline-block"></span> Terlambat</span>
              </div>
            </div>

            <div class="pt-1">
              <div class="flex items-end justify-center gap-1.5 h-28 w-full overflow-x-auto pb-1.5 border-b border-slate-200 px-1">
                ${dailyBarsHtml}
              </div>
            </div>
          </div>

          ${lateDetailSectionHtml}
        </div>
      `;

      bindControls();
    }

    function bindControls() {
      const monthSelect = bodyEl.querySelector("#dash-attendance-month-select");
      if (monthSelect) {
        monthSelect.onchange = (e) => {
          selectedMonthPrefix = e.target.value;
          renderAnalytics();
        };
      }
      const empSelect = bodyEl.querySelector("#dash-attendance-emp-select");
      if (empSelect) {
        empSelect.onchange = (e) => {
          selectedEmpKey = e.target.value;
          renderAnalytics();
        };
      }
    }

    renderAnalytics();

  } catch (err) {
    console.error(err);
    bodyEl.innerHTML = `<p class="text-xs text-rose-500 p-4">Gagal memuat analitik kehadiran: ${escapeHtml(err.message)}</p>`;
  }
}

/* ------------------------ h. PERFORMANCE WIDGET ------------------------ */
async function loadPerformanceWidget(container, session) {
 const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";
 const titleEl = container.querySelector("#dash-performance-title");
 const bodyEl = container.querySelector("#dash-performance-body");

 try {
 const allReviews = await fsGetAll(COL.PERFORMANCE_REVIEW);

 if (isHrd) {
 titleEl.textContent = "Evaluasi Kinerja Karyawan Perusahaan";
 
 const totalReviews = allReviews.length;
 if (totalReviews === 0) {
 bodyEl.innerHTML = emptyState("Belum ada evaluasi kinerja dirilis");
 return;
 }

 // Calculate Average Score
 const totalScore = allReviews.reduce((acc, r) => acc + (r.skor_akhir || 0), 0);
 const avgScore = (totalScore / totalReviews).toFixed(1);

 // Best Performer
 const bestPerformer = [...allReviews].sort((a, b) => b.skor_akhir - a.skor_akhir)[0];

 bodyEl.innerHTML = `
 <div class="grid grid-cols-2 gap-4">
 <div class="bg-[#faf8ff] p-4 rounded-xl border border-slate-100 flex flex-col justify-center shadow-xs">
 <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Rerata Nilai Karyawan</span>
 <span class="text-2xl font-black text-maroon-700">${avgScore}</span>
 <span class="text-[10px] text-slate-400 mt-0.5">Skala 1-100</span>
 </div>
 <div class="bg-[#faf8ff] p-4 rounded-xl border border-slate-100 flex flex-col justify-center shadow-xs">
 <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Evaluasi Rilis</span>
 <span class="text-2xl font-black text-blue-600">${totalReviews} Review</span>
 <span class="text-[10px] text-slate-400 mt-0.5">Semua Departemen</span>
 </div>
 </div>

 <div class="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between gap-3">
 <div class="space-y-0.5">
 <span class="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">Nilai Tertinggi (Top Performer)</span>
 <h4 class="font-bold text-slate-800 text-xs">${escapeHtml(bestPerformer.nama_karyawan)}</h4>
 <p class="text-[11px] text-slate-500">Reviewer: ${escapeHtml(bestPerformer.reviewer)}</p>
 </div>
 <div class="text-right">
 <span class="text-lg font-black text-emerald-700">${bestPerformer.skor_akhir}</span>
 <span class="text-xs text-emerald-600 block">Grade ${bestPerformer.grade}</span>
 </div>
 </div>
 `;
 } else {
 titleEl.textContent = "Evaluasi Kinerja Saya";
 
 const myReviews = allReviews.filter(r => r.nik === session.nik || r.nama_karyawan === session.nama)
 .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

 if (myReviews.length === 0) {
 bodyEl.innerHTML = emptyState("Belum ada evaluasi kinerja resmi", "Manajemen belum merilis review kinerja formal untuk profil Anda.");
 return;
 }

 const latestReview = myReviews[0];
 const avgScore = latestReview.skor_akhir;
 let gradeColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
 if (latestReview.grade === "B") gradeColor = "text-blue-700 bg-blue-50 border-blue-100";
 if (latestReview.grade === "C") gradeColor = "text-amber-700 bg-amber-50 border-amber-100";
 if (latestReview.grade === "D") gradeColor = "text-rose-700 bg-rose-50 border-rose-100";

 bodyEl.innerHTML = `
 <div class="flex items-center justify-between p-4 bg-[#faf8ff] border border-slate-100 rounded-2xl gap-4 shadow-xs">
 <div class="space-y-1">
 <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Skor Evaluasi Periodik</span>
 <h4 class="font-black text-2xl text-slate-800">${avgScore} <span class="text-xs text-slate-400 font-medium">/ 100</span></h4>
 <p class="text-xs text-slate-500">Periode: <b>${escapeHtml(latestReview.periode)}</b></p>
 </div>
 <div class="text-right flex flex-col items-end justify-center">
 <span class="px-3.5 py-1.5 border rounded-full font-bold text-xs ${gradeColor}">Grade ${latestReview.grade}</span>
 <span class="text-[10px] text-slate-400 mt-1.5">Penilai: ${escapeHtml(latestReview.reviewer.split(" ")[0])}</span>
 </div>
 </div>

 <div class="bg-blue-50/50 p-3 rounded-xl border border-blue-100/30 text-xs text-slate-600 leading-relaxed">
 <span class="font-bold text-blue-800 block mb-1">Usulan Manajemen:</span>
 ${escapeHtml(latestReview.rekomendasi || "-")}
 </div>
 `;
 }
 } catch (err) {
 console.error(err);
 bodyEl.innerHTML = `<p class="text-xs text-rose-500">Gagal memuat evaluasi kinerja: ${err.message}</p>`;
 }
}

/* ------------------------ i. TRAINING HISTORY WIDGET ------------------------ */
async function loadTrainingHistory(container, session) {
 const wrap = container.querySelector("#dash-training-history-body");
 if (!wrap) return;
 try {
 const allTrainings = await fsGetAll(COL.DATA_TRAINING);
 const myTrainings = allTrainings.filter(t => 
 (t.nik && session.nik && String(t.nik).trim() === String(session.nik).trim()) ||
 (t.nama_karyawan && session.nama && String(t.nama_karyawan).trim().toLowerCase() === String(session.nama).trim().toLowerCase())
 );

 if (!myTrainings.length) {
 wrap.innerHTML = `
 <div class="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center text-slate-400">
 <p class="text-xs font-medium">Belum ada riwayat training yang diikuti.</p>
 <a href="#training" class="text-xs text-maroon-700 font-bold hover:underline mt-1 inline-block">+ Ajukan Pelatihan Baru</a>
 </div>
 `;
 return;
 }

 wrap.innerHTML = myTrainings.slice(0, 4).map(t => {
 const status = (t.status || "PENDING").toUpperCase();
 let badgeClass = "bg-amber-50 text-amber-700 border-amber-200";
 if (status === "APPROVED" || status === "DISETUJUI" || status === "SELESAI") badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
 if (status === "REJECTED" || status === "DITOLAK") badgeClass = "bg-rose-50 text-rose-700 border-rose-200";

 return `
 <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100/70 transition">
 <div class="min-w-0 flex-1 pr-2">
 <p class="font-bold text-slate-800 text-xs truncate">${escapeHtml(t.kompetensi || t.nama_pelatihan || "Training TNA")}</p>
 <p class="text-[11px] text-slate-500 truncate">${escapeHtml(t.kategori || "Pelatihan Skill")} • ${t.tanggal_pengajuan ? fmtDateShort(t.tanggal_pengajuan) : '-'}</p>
 </div>
 <span class="px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${badgeClass}">${status}</span>
 </div>
 `;
 }).join("");
 } catch (err) {
 wrap.innerHTML = `<p class="text-xs text-slate-400">Gagal memuat riwayat training</p>`;
 }
}

/* ------------------------ j. INVENTARIS, ASET & PENGAMBILAN ATK WIDGET ------------------------ */
function cleanPersonName(raw = "") {
 return String(raw || "")
  .toLowerCase()
  .replace(/\b(s\.kom|s\.t|s\.e|s\.pd|s\.sos|s\.farm|s\.ked|m\.kom|m\.m|m\.t|dr\.|dra\.|drs\.|h\.|hj\.)\b/gi, "")
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();
}

function cleanPersonNik(raw = "") {
 return String(raw || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().trim();
}

function isAtkCategory(catStr = "", namaStr = "") {
 const s = (String(catStr || "") + " " + String(namaStr || "")).toLowerCase();
 return /atk|office supplies|supplies|alat tulis|habis pakai|stationery|kertas|tinta|spidol|ballpoint|pulpen|buku tulis|lakban|amplop|buku|stapler|penghapus|pensil|binder/i.test(s);
}

function isAssetRecordMatchingUser(record, session, userEmp = null) {
 if (!record || !session) return false;

 const INVALID_TERMS = new Set([
  "", "-", "--", "none", "null", "undefined", "unassigned", "tersedia", "ready",
  "gudang", "gudang utama", "kantor", "kantor pusat", "stok", "stock", "n/a", "na",
  "belum ada", "belum diserahkan", "semua", "all", "general affair", "ga", "hrd", "hr",
  "admin", "petugas ga", "pembelian", "penjualan", "bengkel", "pos satpam"
 ]);

 // 1. User NIK identifiers
 const userNiks = new Set(
  [session.nik, userEmp?.nik, userEmp?.nik_karyawan, session.username]
   .filter(Boolean)
   .map(cleanPersonNik)
   .filter(n => n.length >= 3 && !INVALID_TERMS.has(n))
 );

 // 2. User Name identifiers
 const userRawNames = [session.nama, userEmp?.nama_karyawan, userEmp?.nama].filter(Boolean);
 const userCleanNames = userRawNames.map(cleanPersonName).filter(n => n.length >= 3 && !INVALID_TERMS.has(n));
 const userWordsList = userCleanNames.map(cn => cn.split(" ").filter(w => w.length >= 3));

 const userUsername = cleanPersonNik(session.username);

 // 3. Record terms
 const recordNikTerms = [record.assigned_nik, record.nik, record.nik_karyawan].filter(Boolean).map(cleanPersonNik);
 const recordNameTerms = [
  record.assigned_to,
  record.pemegang,
  record.nama_karyawan,
  record.nama,
  record.penerima,
  record.penanggung_jawab,
  record.user
 ].filter(Boolean);

 // Check NIK match
 for (const rNik of recordNikTerms) {
  if (!rNik || INVALID_TERMS.has(rNik)) continue;
  if (userNiks.has(rNik)) return true;
 }

 // Check Name & Username match
 for (const rRaw of recordNameTerms) {
  const rClean = cleanPersonName(rRaw);
  if (!rClean || INVALID_TERMS.has(rClean)) continue;

  const rNikCandidate = cleanPersonNik(rRaw);
  if (rNikCandidate && userNiks.has(rNikCandidate)) return true;

  // Exact clean name match
  if (userCleanNames.includes(rClean)) return true;

  // Match username if exact
  if (userUsername && userUsername.length >= 4 && !INVALID_TERMS.has(userUsername) && cleanPersonNik(rRaw) === userUsername) {
   return true;
  }

  // Token / Substring word match (word by word)
  const rWords = rClean.split(" ").filter(w => w.length >= 3);
  if (rWords.length > 0) {
   for (const uWords of userWordsList) {
    if (!uWords.length) continue;
    const shorter = rWords.length <= uWords.length ? rWords : uWords;
    const longer = rWords.length > uWords.length ? rWords : uWords;
    const allMatch = shorter.every(sw => longer.some(lw => lw === sw || (lw.length >= 4 && lw.startsWith(sw))));
    if (allMatch && shorter.length >= 1) return true;
   }
  }
 }

 return false;
}

function openDashboardAssetDetailModal(item) {
 const assetId = item.id_item || item.id || "-";
 const isAtk = item.jenis === "ATK";
 const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(JSON.stringify({ id: assetId, name: item.nama_barang, cat: item.kategori }))}`;
 const isReturned = (item.status_pengembalian || "").toUpperCase() === "DIKEMBALIKAN";

 openModal({
  title: isAtk ? `Detail Pengambilan ATK — ${escapeHtml(item.nama_barang)}` : `Detail Aset & Tanggung Jawab — ${escapeHtml(assetId)}`,
  size: "md",
  bodyHtml: `
   <div class="space-y-4 text-xs text-left">
    <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
     ${!isAtk ? `
     <div class="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs shrink-0 text-center">
      <img src="${qrUrl}" alt="QR ${escapeHtml(assetId)}" class="w-24 h-24 mx-auto rounded-lg">
      <span class="text-[9px] font-mono text-slate-400 block mt-1">QR Identitas</span>
     </div>` : `
     <div class="w-16 h-16 rounded-2xl bg-red-50 text-maroon-700 flex items-center justify-center shrink-0 border border-red-100">
      ${icon("box", "w-8 h-8")}
     </div>`}
     <div class="min-w-0 flex-1 space-y-1.5 w-full">
      <div class="flex items-center gap-2 flex-wrap">
       <span class="px-2.5 py-0.5 text-xs font-mono font-bold text-maroon-800 bg-red-50 border border-red-100 rounded-lg">${escapeHtml(assetId)}</span>
       <span class="px-2.5 py-0.5 text-xs font-bold text-slate-700 bg-slate-200 rounded-lg">${escapeHtml(item.kategori || (isAtk ? "ATK" : "Aset"))}</span>
       <span class="px-2.5 py-0.5 text-xs font-bold ${isReturned ? 'text-slate-700 bg-slate-100 border border-slate-200' : 'text-emerald-800 bg-emerald-50 border border-emerald-200'} rounded-lg">
        ${isReturned ? 'Dikembalikan' : (isAtk ? `Diterima (${item.qty} ${item.satuan || 'Pcs'})` : (item.kondisi || 'Baik (Good)'))}
       </span>
      </div>
      <h3 class="text-base font-black text-slate-800 leading-tight">${escapeHtml(item.nama_barang)}</h3>
      <div class="grid grid-cols-2 gap-2 pt-1 text-slate-600 font-medium text-[11px]">
       <p>Tanggal: <b class="text-slate-800">${item.tanggal ? fmtDateShort(item.tanggal) : '-'}</b></p>
       <p>Jumlah: <b class="text-slate-800">${item.qty || 1} ${escapeHtml(item.satuan || 'Unit')}</b></p>
       ${item.serial_number ? `<p>No. Seri / Plat: <b class="text-slate-800 font-mono">${escapeHtml(item.serial_number)}</b></p>` : ''}
       ${item.lokasi ? `<p>Lokasi / Cabang: <b class="text-slate-800">${escapeHtml(item.lokasi)}</b></p>` : ''}
      </div>
     </div>
    </div>

    ${item.keperluan ? `
    <div class="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-1">
     <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Catatan / Keperluan</span>
     <p class="text-slate-700 font-medium leading-relaxed">${escapeHtml(item.keperluan)}</p>
    </div>` : ''}

    <div class="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-[11px] text-blue-900 leading-relaxed">
     <b>Informasi Hak Guna:</b><br/>
     ${isAtk ? 'Barang ATK/supplies operasional telah tercatat dalam sistem inventory kantor.' : 'Aset fisik ini tercatat resmi sebagai tanggung jawab Anda. Jaga dan rawat unit fisik dengan baik sesuai SOP perusahaan.'}
    </div>
   </div>`,
  footerHtml: `
   <div class="flex items-center justify-end w-full">
    <button id="btn-close-asset-detail" class="px-5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Tutup</button>
   </div>`,
  onMount: m => {
   m.querySelector("#btn-close-asset-detail").onclick = closeModal;
  }
 });
}

async function loadAssignedAssets(container, session, userEmpProfile = null) {
 const wrap = container.querySelector("#dash-assigned-assets-body");
 if (!wrap) return;

 try {
  const [allAssets, allLogs, allKaryawan] = await Promise.all([
   fsGetAll(COL.MASTER_INVENTORY).catch(() => []),
   fsGetAll(COL.LOG_INVENTORY_PENGAMBILAN).catch(() => []),
   userEmpProfile ? Promise.resolve([userEmpProfile]) : fsGetAll(COL.MASTER_KARYAWAN).catch(() => [])
  ]);

  const userEmp = userEmpProfile || (allKaryawan || []).find(k => {
   const kNik = cleanPersonNik(k.nik || k.nik_karyawan);
   const kNama = cleanPersonName(k.nama_karyawan || k.nama);
   const kUser = cleanPersonNik(k.username);

   const sNik = cleanPersonNik(session.nik);
   const sNama = cleanPersonName(session.nama);
   const sUser = cleanPersonNik(session.username);

   if (sNik && kNik && sNik === kNik) return true;
   if (sUser && kUser && sUser === kUser) return true;
   if (sNama && kNama && sNama === kNama) return true;
   return false;
  });

  const activeAssets = [];
  const atkLogs = [];
  const returnedAssets = [];
  const activeAssetKeyMap = new Map();

  // 1. MASTER_INVENTORY (Aset Fisik Aktif)
  const userMasterItems = (allAssets || []).filter(a => isAssetRecordMatchingUser(a, session, userEmp));
  userMasterItems.forEach(a => {
   const isAtk = isAtkCategory(a.kategori, a.nama_barang);
   if (isAtk) {
    atkLogs.push({
     id: a.id,
     id_item: a.id_item || a.id,
     nama_barang: a.nama_barang || "ATK Kantor",
     kategori: a.kategori || "ATK & Office Supplies",
     serial_number: a.serial_number || "",
     kondisi: a.kondisi || "Good",
     tanggal: a.tanggal_serah_terima || a.created_at || "",
     jenis: "ATK",
     status_pengembalian: "DITERIMA",
     qty: parseInt(a.stok_saat_ini, 10) || 1,
     satuan: a.satuan || "Unit",
     keperluan: a.catatan || a.catatan_penyerahan || "",
     lokasi: a.penempatan || a.lokasi || "",
     raw: a
    });
   } else {
    const itemObj = {
     id: a.id,
     id_item: a.id_item || a.id,
     nama_barang: a.nama_barang || "Aset Kantor",
     kategori: a.kategori || "Aset Kantor",
     serial_number: a.serial_number || "",
     kondisi: a.kondisi || "Good",
     tanggal: a.tanggal_serah_terima || a.created_at || "",
     jenis: "ASET",
     status_pengembalian: "SEDANG_DIPAKAI",
     qty: 1,
     satuan: a.satuan || "Unit",
     keperluan: a.catatan_penyerahan || a.catatan || "",
     lokasi: a.penempatan || a.lokasi || "",
     raw: a
    };
    activeAssets.push(itemObj);

    if (a.id) activeAssetKeyMap.set(String(a.id).trim().toLowerCase(), itemObj);
    if (a.id_item) activeAssetKeyMap.set(String(a.id_item).trim().toLowerCase(), itemObj);
    if (a.nama_barang) activeAssetKeyMap.set(cleanPersonName(a.nama_barang), itemObj);
   }
  });

  // 2. LOG_INVENTORY_PENGAMBILAN (Penyerahan / Pengambilan ATK & History Aset)
  const userLogs = (allLogs || []).filter(l => isAssetRecordMatchingUser(l, session, userEmp));
  userLogs.forEach(l => {
   const isAtk = isAtkCategory(l.kategori, l.nama_barang);
   const isRet = (l.status_pengembalian || "").toUpperCase() === "DIKEMBALIKAN" || (l.jenis_aksi || "").toUpperCase() === "PENGEMBALIAN";
   const logCode = String(l.id_barang || l.id || "").trim().toLowerCase();
   const logNameClean = cleanPersonName(l.nama_barang);

   if (isAtk) {
    const existingAtk = atkLogs.find(x => 
     (x.id_item && String(x.id_item).trim().toLowerCase() === logCode) ||
     (cleanPersonName(x.nama_barang) === logNameClean && x.tanggal === l.tanggal)
    );
    if (existingAtk) {
     if (!existingAtk.tanggal && l.tanggal) existingAtk.tanggal = l.tanggal;
     if (!existingAtk.keperluan && l.keperluan) existingAtk.keperluan = l.keperluan;
     if (l.jumlah_ambil) existingAtk.qty = parseInt(l.jumlah_ambil, 10);
    } else {
     atkLogs.push({
      id: l.id,
      id_item: l.id_barang || ("LOG-" + l.id.slice(-4).toUpperCase()),
      nama_barang: l.nama_barang || "ATK / Barang",
      kategori: l.kategori || "ATK & Office Supplies",
      serial_number: "",
      kondisi: l.kondisi_pengembalian || "",
      tanggal: l.tanggal || l.created_at || "",
      jenis: "ATK",
      status_pengembalian: isRet ? "DIKEMBALIKAN" : (l.status_pengembalian || "DITERIMA"),
      qty: parseInt(l.jumlah_ambil, 10) || 1,
      satuan: l.satuan || "Pcs",
      keperluan: l.keperluan || l.catatan || "",
      lokasi: "",
      raw: l
     });
    }
   } else {
    // Aset log
    const matchingActive = activeAssetKeyMap.get(logCode) || activeAssetKeyMap.get(logNameClean);

    if (matchingActive) {
     if (!matchingActive.tanggal && l.tanggal) matchingActive.tanggal = l.tanggal;
     if (!matchingActive.keperluan && l.keperluan) matchingActive.keperluan = l.keperluan;
     if (!matchingActive.logId) matchingActive.logId = l.id;
    } else if (isRet) {
     const existingRet = returnedAssets.find(r => 
      String(r.id_item).toLowerCase() === logCode || cleanPersonName(r.nama_barang) === logNameClean
     );
     if (!existingRet) {
      returnedAssets.push({
       id: l.id,
       id_item: l.id_barang || ("LOG-" + l.id.slice(-4).toUpperCase()),
       nama_barang: l.nama_barang || "Aset Kantor",
       kategori: l.kategori || "Aset Kantor",
       serial_number: "",
       kondisi: l.kondisi_pengembalian || "Good",
       tanggal: l.tanggal || l.created_at || "",
       jenis: "ASET",
       status_pengembalian: "DIKEMBALIKAN",
       qty: 1,
       satuan: l.satuan || "Unit",
       keperluan: l.keperluan || l.catatan || "",
       lokasi: "",
       raw: l
      });
     }
    }
   }
  });

  // Sort lists by date descending
  activeAssets.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  atkLogs.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  returnedAssets.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));

  const allItems = [...activeAssets, ...atkLogs, ...returnedAssets];
  const totalAset = activeAssets.length;
  const totalAtk = atkLogs.length;
  const totalRet = returnedAssets.length;
  const totalAll = allItems.length;

  if (totalAll === 0) {
   wrap.innerHTML = `
   <div class="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-5 text-center text-slate-400">
    <div class="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-2xs mx-auto mb-2">
     ${icon("box", "w-5 h-5 text-slate-400")}
    </div>
    <p class="text-xs font-bold text-slate-700">Belum Ada Aset atau Pengambilan ATK</p>
    <p class="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
     Seluruh barang inventaris, seragam, laptop, kendaraan dinas, kunci kantor, serta riwayat pengambilan ATK akan tercatat di sini secara otomatis.
    </p>
   </div>`;
   return;
  }

  const categoryIcons = {
   "Vehicles": "truck",
   "Kendaraan": "truck",
   "Motor": "truck",
   "Mobil": "truck",
   "Office Eq": "laptop",
   "Laptop": "laptop",
   "Komputer": "laptop",
   "PC": "laptop",
   "Elektronik": "laptop",
   "Tools": "tools",
   "Peralatan": "tools",
   "Kunci": "key",
   "Dokumen": "file",
   "Seragam": "user",
   "Baju": "user",
   "ATK": "box",
   "Supplies": "box",
   "Alat Tulis": "box",
   "Furniture": "box"
  };

  function renderListItems(list) {
   if (!list || !list.length) {
    return `
    <div class="p-4 bg-slate-50 rounded-xl text-center text-slate-400 text-xs">
     Tidak ada data untuk kategori ini.
    </div>`;
   }

   return list.map((a, idx) => {
    const catKey = Object.keys(categoryIcons).find(k => (a.kategori || "").toLowerCase().includes(k.toLowerCase())) || "box";
    const iconKey = categoryIcons[catKey] || "box";
    const isReturned = (a.status_pengembalian || "").toUpperCase() === "DIKEMBALIKAN";
    const isAtk = (a.jenis || "").toUpperCase() === "ATK" || isAtkCategory(a.kategori, a.nama_barang);

    let statusBadge = "";
    if (isReturned) {
     statusBadge = `<span class="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">Dikembalikan</span>`;
    } else if (isAtk) {
     const qtyLabel = a.qty > 1 ? `${a.qty} ${a.satuan || 'Pcs'}` : (a.satuan ? `1 ${a.satuan}` : 'Diterima');
     statusBadge = `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">${icon("check", "w-3 h-3 text-emerald-600")} Diterima (${qtyLabel})</span>`;
    } else {
     const cond = (a.kondisi || "Good").toUpperCase();
     if (cond.includes("MAINTENANCE") || cond.includes("PERBAIKAN")) {
      statusBadge = `<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Perlu Servis</span>`;
     } else if (cond.includes("RUSAK") || cond.includes("DAMAGED")) {
      statusBadge = `<span class="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">Rusak</span>`;
     } else {
      statusBadge = `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Baik (Good)</span>`;
     }
    }

    const tglFormatted = a.tanggal ? fmtDateShort(a.tanggal) : "";

    return `
    <div data-dash-asset-idx="${idx}" class="dash-asset-item-card p-3 bg-slate-50/90 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 hover:bg-white hover:border-maroon-200 hover:shadow-2xs transition cursor-pointer group">
     <div class="flex items-center gap-3 min-w-0">
      <div class="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-2xs shrink-0 group-hover:border-maroon-300 group-hover:text-maroon-700 transition">
       ${icon(iconKey, "w-5 h-5 text-maroon-700")}
      </div>
      <div class="min-w-0">
       <div class="flex items-center gap-2 flex-wrap">
        <span class="font-bold text-slate-800 text-xs truncate">${escapeHtml(a.nama_barang || "-")}</span>
        <span class="font-mono text-[10px] font-extrabold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">${escapeHtml(a.id_item || a.id)}</span>
        ${isAtk && a.qty > 1 ? `<span class="text-[10px] font-bold text-maroon-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md">${a.qty} ${escapeHtml(a.satuan || 'Pcs')}</span>` : ''}
       </div>
       <p class="text-[11px] text-slate-500 mt-0.5 truncate">
        ${escapeHtml(a.kategori || (isAtk ? "Pengambilan ATK" : "Aset Kantor"))}
        ${tglFormatted ? ` • <span class="text-slate-600 font-medium">Tgl: ${tglFormatted}</span>` : ''}
        ${a.serial_number ? ` • SN: ${escapeHtml(a.serial_number)}` : ''}
        ${a.keperluan ? ` • <span class="italic text-slate-400 truncate">${escapeHtml(a.keperluan)}</span>` : ''}
       </p>
      </div>
     </div>
     <div class="shrink-0 text-right">
      ${statusBadge}
     </div>
    </div>`;
   }).join("");
  }

  wrap.innerHTML = `
   <div class="space-y-3">
    <!-- FILTER TABS -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-100 text-xs">
     <button data-dash-asset-tab="all" class="dash-asset-tab-btn px-3 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1.5 bg-maroon-700 text-white shadow-2xs">
      <span>Semua</span>
      <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white">${totalAll}</span>
     </button>
     <button data-dash-asset-tab="aset" class="dash-asset-tab-btn px-3 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200">
      <span>Aset Tanggung Jawab</span>
      <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">${totalAset}</span>
     </button>
     <button data-dash-asset-tab="atk" class="dash-asset-tab-btn px-3 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200">
      <span>Pengambilan ATK</span>
      <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">${totalAtk}</span>
     </button>
     ${totalRet > 0 ? `
     <button data-dash-asset-tab="ret" class="dash-asset-tab-btn px-3 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200">
      <span>Dikembalikan</span>
      <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">${totalRet}</span>
     </button>` : ''}
    </div>

    <!-- LIST CONTAINER -->
    <div id="dash-asset-items-wrap" class="space-y-2.5">
     ${renderListItems(allItems)}
    </div>
   </div>
  `;

  let currentRenderedList = allItems;

  function bindCardEvents() {
   wrap.querySelectorAll(".dash-asset-item-card").forEach(card => {
    card.onclick = () => {
     const idx = parseInt(card.dataset.dashAssetIdx, 10);
     const item = currentRenderedList[idx];
     if (item) openDashboardAssetDetailModal(item);
    };
   });
  }

  bindCardEvents();

  // Bind Tab Filter Switching
  wrap.querySelectorAll(".dash-asset-tab-btn").forEach(btn => {
   btn.onclick = () => {
    const tab = btn.dataset.dashAssetTab;

    wrap.querySelectorAll(".dash-asset-tab-btn").forEach(b => {
     const isActive = b === btn;
     b.className = `dash-asset-tab-btn px-3 py-1.5 rounded-xl font-bold transition text-xs flex items-center gap-1.5 ${isActive ? 'bg-maroon-700 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;
     const badge = b.querySelector("span:last-child");
     if (badge) {
      badge.className = `px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`;
     }
    });

    if (tab === "aset") currentRenderedList = activeAssets;
    else if (tab === "atk") currentRenderedList = atkLogs;
    else if (tab === "ret") currentRenderedList = returnedAssets;
    else currentRenderedList = allItems;

    const listWrap = wrap.querySelector("#dash-asset-items-wrap");
    if (listWrap) {
     listWrap.innerHTML = renderListItems(currentRenderedList);
     bindCardEvents();
    }
   };
  });

 } catch (err) {
  console.warn("Gagal memuat aset & ATK karyawan:", err);
  wrap.innerHTML = `<p class="text-xs text-slate-400">Gagal memuat daftar aset dan log pengambilan ATK.</p>`;
 }
}

/* ------------------------ k. REKAPAN PENCAPAIAN KUNJUNGAN SALES WIDGET ------------------------ */
async function loadSalesPerformanceWidget(container, session, karyawanProfile = null) {
  const widgetWrap = container.querySelector("#dash-widget-sales-performance");
  const contentEl = container.querySelector("#dash-sales-performance-content");
  const badgeNamaEl = container.querySelector("#dash-sales-badge-nama");
  if (!widgetWrap || !contentEl) return;

  const empJabatan = (karyawanProfile?.jabatan || session.posisi || session.jabatan || "").trim();
  const empDivisi = (karyawanProfile?.divisi || session.divisi || "").trim();
  const empRole = (session.role || "").trim();
  const empNik = (session.nik || karyawanProfile?.nik_karyawan || session.username || "").trim();
  const empNama = (session.nama || karyawanProfile?.nama_karyawan || "").trim();
  const normEmpNama = cleanSalesName(empNama);

  const isSalesPerson = /sales|kanvas|canvas|motoris|spv sales|supervisor sales|account executive/i.test(empJabatan) ||
                        /sales/i.test(empDivisi) ||
                        /sales/i.test(empRole);

  try {
    // 1. Ambil data checkin kunjungan sales, odometer, dan departure config
    const [rawCheckins, rawOdo, rawDep] = await Promise.all([
      fsGetAll("kanal_checkins").catch(() => []),
      fsGetAll("sales_odometer").catch(() => []),
      fsGetAll("departure_config").catch(() => [])
    ]);

    const departureConfig = (rawDep && rawDep.length > 0) ? rawDep[0] : null;

    // Filter data kunjungan untuk sales yang sedang login (berdasarkan NIK atau nama terseragamkan)
    const userCheckins = (rawCheckins || []).map(normalizeCheckinItem).filter(c => {
      const cNik = (c.sales_nik || "").trim();
      const cName = cleanSalesName(c.sales_nama);
      if (empNik && cNik && (cNik === empNik || cNik === session.username)) return true;
      if (normEmpNama && cName && (cName === normEmpNama || normEmpNama.includes(cName) || cName.includes(normEmpNama))) return true;
      return false;
    });

    // Jika bukan karyawan jabatan sales dan tidak memiliki data kunjungan di sistem, sembunyikan widget
    if (!isSalesPerson && userCheckins.length === 0) {
      widgetWrap.classList.add("hidden");
      return;
    }

    // Tampilkan widget untuk karyawan sales
    widgetWrap.classList.remove("hidden");

    if (badgeNamaEl) {
      badgeNamaEl.textContent = normEmpNama || empNama || "Salesman";
    }

    const now = new Date();
    const todayStr = localDateStr(now);
    const currentYearMonth = todayStr.substring(0, 7);

    // Map log odometer sales
    const odoMap = new Map();
    (rawOdo || []).forEach(o => {
      const oNik = (o.sales_nik || "").trim();
      const oName = cleanSalesName(o.sales_nama);
      const isMatch = (empNik && oNik && oNik === empNik) || (normEmpNama && oName && oName === normEmpNama);
      if (isMatch && o.tanggal) {
        odoMap.set(o.tanggal, o);
      }
    });

    let currentPeriod = "MONTH";

    const renderData = () => {
      // Filter berdasarkan periode yang aktif
      let filtered = [];
      if (currentPeriod === "TODAY") {
        filtered = userCheckins.filter(c => c.tanggal === todayStr);
      } else if (currentPeriod === "WEEK") {
        filtered = userCheckins.filter(c => {
          if (!c.tanggal) return false;
          const dt = new Date(c.tanggal);
          const diff = (now - dt) / (1000 * 3600 * 24);
          return !isNaN(diff) && diff <= 7 && diff >= -1;
        });
      } else if (currentPeriod === "MONTH") {
        filtered = userCheckins.filter(c => (c.tanggal || "").startsWith(currentYearMonth));
      } else {
        filtered = [...userCheckins];
      }

      // Urutkan kunjungan dari yang terbaru (tanggal & waktu)
      filtered.sort((a, b) => {
        const dComp = (b.tanggal || "").localeCompare(a.tanggal || "");
        if (dComp !== 0) return dComp;
        return (b.waktu_checkin || "").localeCompare(a.waktu_checkin || "");
      });

      const totalVisits = filtered.length;
      const todayVisitsCount = userCheckins.filter(c => c.tanggal === todayStr).length;
      const monthVisitsCount = userCheckins.filter(c => (c.tanggal || "").startsWith(currentYearMonth)).length;

      const ecVisits = filtered.filter(c => {
        const st = (c.status_kunjungan || "").toLowerCase();
        return st.includes("effective") || c.is_effective_call === true;
      }).length;

      const stokVisits = filtered.filter(c => (c.status_kunjungan || "").toLowerCase().includes("stok")).length;
      const penawaranVisits = filtered.filter(c => (c.status_kunjungan || "").toLowerCase().includes("penawaran")).length;
      const lainnyaVisits = Math.max(0, totalVisits - ecVisits - stokVisits - penawaranVisits);

      const ecRate = totalVisits > 0 ? Math.round((ecVisits / totalVisits) * 100) : 0;
      const stokRate = totalVisits > 0 ? Math.round((stokVisits / totalVisits) * 100) : 0;
      const penawaranRate = totalVisits > 0 ? Math.round((penawaranVisits / totalVisits) * 100) : 0;
      const lainnyaRate = totalVisits > 0 ? Math.max(0, 100 - ecRate - stokRate - penawaranRate) : 0;

      const uniqueOutlets = new Set(filtered.map(c => (c.toko_outlet || "").trim().toLowerCase()).filter(Boolean));

      // Hitung total jarak tempuh GPS berdasarkan rute kunjungan
      const dateGroups = new Map();
      filtered.forEach(c => {
        const d = c.tanggal || todayStr;
        if (!dateGroups.has(d)) dateGroups.set(d, []);
        dateGroups.get(d).push(c);
      });

      let totalKm = 0;
      dateGroups.forEach((visitsOnDate, dateKey) => {
        const odo = odoMap.get(dateKey);
        if (odo && odo.manual_jarak_gps !== undefined && odo.manual_jarak_gps !== null && odo.manual_jarak_gps !== "") {
          totalKm += parseFloat(odo.manual_jarak_gps) || 0;
        } else if (visitsOnDate.length > 0) {
          const metrics = calculateSalesRouteMetrics(visitsOnDate, departureConfig);
          totalKm += (metrics.totalKm || 0);
        }
      });
      totalKm = Math.round(totalKm * 10) / 10;

      if (totalVisits === 0) {
        contentEl.innerHTML = `
          <div class="p-6 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl text-center">
            <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center mx-auto mb-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p class="text-sm font-bold text-slate-700">Belum ada kunjungan pada periode ini</p>
            <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">Riwayat rute outlet, status order/stok, dan pencapaian target kunjungan akan otomatis muncul di sini setelah sinkronisasi data lapangan.</p>
            <div class="mt-3 flex items-center justify-center gap-2">
              <a href="#sales-track" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold transition">Lihat Peta Sales Track</a>
            </div>
          </div>
        `;
        return;
      }

      // Daftar 5 kunjungan terakhir
      const recentVisits = filtered.slice(0, 5);

      contentEl.innerHTML = `
        <!-- KPI METRICS GRID -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- Total Kunjungan -->
          <div class="p-3.5 bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/80 rounded-2xl">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Kunjungan</span>
              <span class="p-1 bg-maroon-50 text-maroon-700 rounded-lg text-xs font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              </span>
            </div>
            <div class="mt-2 flex items-baseline gap-1.5">
              <span class="text-2xl font-black text-slate-900 tracking-tight">${totalVisits}</span>
              <span class="text-xs font-semibold text-slate-500">Visit</span>
            </div>
            <p class="text-[10px] text-slate-500 mt-1 font-medium">Hari ini: <strong class="text-slate-800">${todayVisitsCount}</strong> • Bulan ini: <strong class="text-slate-800">${monthVisitsCount}</strong></p>
          </div>

          <!-- Effective Call (EC) -->
          <div class="p-3.5 bg-gradient-to-br from-emerald-50/70 to-emerald-100/40 border border-emerald-200/80 rounded-2xl">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">Effective Call (EC)</span>
              <span class="px-1.5 py-0.5 bg-emerald-600 text-white rounded-md text-[10px] font-extrabold shadow-2xs">${ecRate}%</span>
            </div>
            <div class="mt-2 flex items-baseline gap-1.5">
              <span class="text-2xl font-black text-emerald-950 tracking-tight">${ecVisits}</span>
              <span class="text-xs font-semibold text-emerald-800">Toko Closing</span>
            </div>
            <p class="text-[10px] text-emerald-800 mt-1 font-medium">Tingkat keberhasilan pesanan outlet</p>
          </div>

          <!-- Outlet Unik -->
          <div class="p-3.5 bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200/80 rounded-2xl">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Outlet Terlayani</span>
              <span class="p-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              </span>
            </div>
            <div class="mt-2 flex items-baseline gap-1.5">
              <span class="text-2xl font-black text-blue-950 tracking-tight">${uniqueOutlets.size}</span>
              <span class="text-xs font-semibold text-blue-800">Toko Unik</span>
            </div>
            <p class="text-[10px] text-blue-800 mt-1 font-medium">Cakupan pelanggan & sebaran toko</p>
          </div>

          <!-- Total Jarak GPS -->
          <div class="p-3.5 bg-gradient-to-br from-amber-50/70 to-orange-50/50 border border-amber-200/80 rounded-2xl">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-amber-900 uppercase tracking-wider">Jarak Tempuh GPS</span>
              <span class="p-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </span>
            </div>
            <div class="mt-2 flex items-baseline gap-1.5">
              <span class="text-2xl font-black text-amber-950 tracking-tight">${totalKm}</span>
              <span class="text-xs font-semibold text-amber-800">KM</span>
            </div>
            <p class="text-[10px] text-amber-800 mt-1 font-medium">Akumulasi rute perjalanan sales</p>
          </div>
        </div>

        <!-- VISUAL COMPOSITION BAR -->
        <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-700">Komposisi Hasil Kunjungan:</span>
            <div class="flex items-center gap-3 text-[11px] font-semibold flex-wrap">
              <span class="flex items-center gap-1.5 text-emerald-700">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> EC: <strong>${ecVisits} (${ecRate}%)</strong>
              </span>
              <span class="flex items-center gap-1.5 text-blue-700">
                <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Cek Stok: <strong>${stokVisits}</strong>
              </span>
              <span class="flex items-center gap-1.5 text-amber-700">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Penawaran: <strong>${penawaranVisits}</strong>
              </span>
              ${lainnyaVisits > 0 ? `
              <span class="flex items-center gap-1.5 text-slate-600">
                <span class="w-2.5 h-2.5 rounded-full bg-slate-400"></span> Lainnya: <strong>${lainnyaVisits}</strong>
              </span>` : ''}
            </div>
          </div>

          <!-- Multi-Color Progress Bar -->
          <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
            <div style="width: ${ecRate}%" class="bg-emerald-500 h-full transition-all duration-500" title="Effective Call: ${ecRate}%"></div>
            <div style="width: ${stokRate}%" class="bg-blue-500 h-full transition-all duration-500" title="Cek Stok: ${stokRate}%"></div>
            <div style="width: ${penawaranRate}%" class="bg-amber-500 h-full transition-all duration-500" title="Penawaran: ${penawaranRate}%"></div>
            <div style="width: ${lainnyaRate}%" class="bg-slate-400 h-full transition-all duration-500" title="Lainnya: ${lainnyaRate}%"></div>
          </div>
        </div>

        <!-- RECENT VISITS TIMELINE -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-maroon-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Aktivitas Kunjungan Lapangan Terkini</span>
            </h4>
            <a href="#sales-track" class="text-[11px] font-bold text-maroon-700 hover:underline">Lihat Semua di Sales Track &rarr;</a>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            ${recentVisits.map((v) => {
              const isEc = (v.status_kunjungan || "").toLowerCase().includes("effective") || v.is_effective_call === true;
              const isStok = (v.status_kunjungan || "").toLowerCase().includes("stok");
              const isPenawaran = (v.status_kunjungan || "").toLowerCase().includes("penawaran");

              let statusBadgeHtml = `<span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(v.status_kunjungan || "Kunjungan")}</span>`;
              if (isEc) {
                statusBadgeHtml = `<span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">✓ Effective Call</span>`;
              } else if (isStok) {
                statusBadgeHtml = `<span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200">Cek Stok</span>`;
              } else if (isPenawaran) {
                statusBadgeHtml = `<span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">Penawaran Baru</span>`;
              }

              const photoUrl = v.gambar_checkin || v.foto_checkin || "";
              const formattedPhoto = photoUrl ? getDirectImageUrl(photoUrl) : "";

              return `
                <div class="p-3 bg-white border border-slate-200/90 rounded-2xl shadow-2xs hover:border-slate-300 transition flex items-start gap-3">
                  ${formattedPhoto ? `
                    <div class="relative shrink-0 cursor-pointer group/img btn-preview-visit-photo" data-img="${escapeHtml(formattedPhoto)}" data-toko="${escapeHtml(v.toko_outlet || '')}">
                      <img src="${escapeHtml(formattedPhoto)}" alt="Foto Checkin" class="w-12 h-12 rounded-xl object-cover border border-slate-200 group-hover/img:scale-105 transition" loading="lazy" />
                      <div class="absolute inset-0 bg-black/20 rounded-xl flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">
                        <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
                      </div>
                    </div>
                  ` : `
                    <div class="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    </div>
                  `}

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1 flex-wrap">
                      <h5 class="font-bold text-slate-800 text-xs truncate max-w-[180px]">${escapeHtml(v.toko_outlet || "Outlet")}</h5>
                      ${statusBadgeHtml}
                    </div>
                    <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(v.alamat_toko || "Alamat outlet")}</p>
                    <div class="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-slate-100 text-[10.5px]">
                      <span class="text-slate-400 flex items-center gap-1">
                        <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        ${v.tanggal ? fmtDateShort(v.tanggal) : "-"} ${v.waktu_checkin ? `• ${escapeHtml(v.waktu_checkin)}` : ''}
                      </span>
                      ${v.catatan && v.catatan !== "-" ? `
                        <span class="text-slate-600 italic truncate max-w-[140px]" title="${escapeHtml(v.catatan)}">"${escapeHtml(v.catatan)}"</span>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;

      // Event listener modal preview foto kunjungan
      contentEl.querySelectorAll(".btn-preview-visit-photo").forEach(btn => {
        btn.onclick = () => {
          const imgUrl = btn.getAttribute("data-img");
          const toko = btn.getAttribute("data-toko");
          openModal({
            title: `Foto Kunjungan: ${escapeHtml(toko || 'Outlet')}`,
            bodyHtml: `
              <div class="text-center p-2">
                <img src="${escapeHtml(imgUrl)}" alt="Foto Checkin" class="max-h-[70vh] w-auto mx-auto rounded-2xl shadow-lg border border-slate-200" />
              </div>
            `
          });
        };
      });
    };

    // Event listener tombol tab filter periode
    const tabButtons = widgetWrap.querySelectorAll(".dash-sales-tab");
    tabButtons.forEach(btn => {
      btn.onclick = () => {
        tabButtons.forEach(b => {
          b.classList.remove("bg-white", "text-maroon-700", "shadow-2xs", "font-bold");
          b.classList.add("text-slate-600");
        });
        btn.classList.add("bg-white", "text-maroon-700", "shadow-2xs", "font-bold");
        btn.classList.remove("text-slate-600");

        currentPeriod = btn.getAttribute("data-period");
        renderData();
      };
    });

    renderData();

  } catch (err) {
    console.warn("Gagal memuat widget pencapaian sales:", err);
    if (!isSalesPerson) {
      widgetWrap.classList.add("hidden");
    } else {
      contentEl.innerHTML = `<p class="text-xs text-slate-400">Gagal memuat rekapan pencapaian sales.</p>`;
    }
  }
}
