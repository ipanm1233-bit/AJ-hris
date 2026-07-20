import { db, COL, collection, query, where, getDocs, orderBy, limit, getDoc, doc, updateDoc, messaging } from "../firebase-config.js";
import { fmtDate, fmtDateShort, escapeHtml, openModal, closeModal, toNumber, sendEmailNotif, getTargetsForRole, toast, fsUpdate, fsAdd, genId, localDateStr } from "../utils.js";
import { avatar, badge, icon, emptyState, skeletonRows } from "../components.js";
import { MANAJEMEN_ROLES } from "../auth.js";
// IMPORT BARU UNTUK MENDAPATKAN TOKEN HP (FCM)
import { getToken } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export async function mount(container, { session }) {
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam";
  container.querySelector("#dash-greeting").textContent = `${greet}, ${session.nama.split(" ")[0]} 👋`;

  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";

  // Widget dashboard karyawan bisa diatur HRD lewat menu Konfigurasi Sistem
  // (APP_SETTINGS/main.dashboard_widgets). Default: semua widget aktif jika belum diatur.
  const WIDGET_IDS = ["dash-widget-leave", "dash-widget-kpi", "dash-widget-cuti-hari-ini", "dash-widget-pengumuman"];
  if (!isHrd) {
    try {
      const cfgSnap = await getDoc(doc(db, COL.APP_SETTINGS, "main"));
      const widgetCfg = (cfgSnap.exists() && cfgSnap.data().dashboard_widgets) || {};
      WIDGET_IDS.forEach(wid => {
        if (widgetCfg[wid] === false) {
          const el = container.querySelector(`#${wid}`);
          if (el) el.classList.add("hidden");
        }
      });
    } catch (e) { /* jika gagal memuat konfigurasi, tampilkan semua widget seperti biasa */ }
  }

  // loadProfileCard dipanggil lebih dulu (bukan di dalam Promise.all) karena
  // loadPersonalBanner butuh data karyawan yang sama supaya tidak query dobel.
  const karyawanProfile = await loadProfileCard(container, session);

  await Promise.all([
    loadPersonalBanner(container, session, karyawanProfile),
    loadLeaveBalances(container, session),
    loadKpiTasks(container, session),
    loadCutiHariIni(container),
    loadAnnouncements(container),
    // Batasi widget kontrak habis hanya muncul di Dashboard HRD
    isHrd ? loadContractExpiry(container) : (() => { 
        const w = container.querySelector("#dash-contract-widget-wrap"); 
        if(w) w.classList.add("hidden"); 
        return Promise.resolve(); 
    })()
  ]);

  // Lonceng notifikasi kini ditangani secara global di app.js (bindShellEvents)
  // agar bisa diklik dari halaman manapun, tidak hanya saat berada di Dashboard.

  // -----------------------------------------------------------------
  // LOGIKA TOMBOL TEST & REGISTRASI NOTIFIKASI
  // -----------------------------------------------------------------
  const btnTestNotif = container.querySelector('#btn-test-notif');
  if (btnTestNotif) {
      btnTestNotif.addEventListener('click', async function() {
          if (!('Notification' in window)) {
              alert("GAGAL: HP/Browser ini tidak mendukung fitur Notifikasi Web.");
              return;
          }

          const sendSafeNotification = (title, options) => {
              if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then((registration) => {
                      registration.showNotification(title, options);
                  });
              } else {
                  new Notification(title, options);
              }
          };

          // FUNGSI PENTING: Menyimpan Token HP ke Database Karyawan
          // FUNGSI PENTING: Menyimpan Token HP ke Database Karyawan
          const registerDeviceToken = async () => {
              if (!messaging) {
                  alert("ERROR: Modul 'messaging' Firebase belum siap.");
                  return;
              }
              try {
                  alert("1. Sedang meminta Token unik dari HP Anda...");
                  const currentToken = await getToken(messaging, { 
                      // Pastikan VAPID KEY ini sudah benar milik Anda
                      vapidKey: 'BLAv8-HIF945zC4llQ3VaSi_n1cIuk6GbFJLasQA7notR1IP0JbKmG1kzTJ2xoqQs7StT_tyKRW4BWe5ZN24XGE' 
                  });
                  
                  if (currentToken) {
                      alert("2. Token berhasil didapat! Menyimpan ke database...");
                      if (session && session.username) {
                          // Menyimpan ke koleksi USERS menggunakan fsUpdate bawaan utils Anda
                          await fsUpdate(COL.USERS, session.username, {
                              fcm_token: currentToken
                          });
                          alert("3. SUKSES! Token berhasil disimpan ke profil Anda (" + session.username + ") di Firestore!");
                      } else {
                          alert("ERROR: Sesi login tidak ditemukan (session.username kosong).");
                      }
                  } else {
                      alert("Gagal mendapatkan token dari Google. Pastikan koneksi internet Anda stabil.");
                  }
              } catch (e) {
                  alert("CRASH SISTEM saat memproses token: " + e.message);
                  console.error("Gagal mendaftarkan token:", e);
              }
          };

          if (Notification.permission === 'granted') {
              alert("Izin sudah ada! Mengirim notifikasi test dan meregistrasi perangkat...");
              await registerDeviceToken();
              sendSafeNotification("HRIS Andela Jaya", {
                  body: "Perangkat ini siap menerima pengumuman Broadcast 🚀",
                  icon: "/assets/icon-192x192.png" 
              });
              return;
          }

          if (Notification.permission === 'denied') {
              alert("Izin ditolak permanen. Anda harus meresetnya dari pengaturan browser HP Anda.");
              return;
          }

          try {
              const permission = await Notification.requestPermission();
              if (permission === 'granted') {
                  alert("Izin berhasil! Mendaftarkan perangkat Anda...");
                  await registerDeviceToken();
                  sendSafeNotification("HRIS Andela Jaya", {
                      body: "Pendaftaran sukses! Anda akan menerima notifikasi di sini 🚀",
                      icon: "/assets/icon-192x192.png"
                  });
              }
          } catch (e) {
              alert("Error saat meminta izin: " + e.message);
          }
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
  container.querySelector("#dash-profile-avatar").innerHTML = avatar(session.nama, "w-14 h-14 text-base");
  container.querySelector("#dash-profile-nama").textContent = session.nama;
  container.querySelector("#dash-profile-jabatan").textContent = `${session.posisi || "-"} • ${karyawan?.cabang || session.cabang || "-"}`;
  container.querySelector("#dash-profile-badges").innerHTML = `
    ${badge(session.role, "maroon")}
    ${karyawan?.status_karyawan ? badge(karyawan.status_karyawan, "blue") : ""}
    ${karyawan?.aktif_tdk_aktif ? badge(karyawan.aktif_tdk_aktif, karyawan.aktif_tdk_aktif === "AKTIF" ? "green" : "red") : ""}
  `;

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
      ${avatar(k.nama_karyawan || session.nama, "w-16 h-16 text-lg")}
      <div><p class="font-bold text-slate-800 text-lg">${escapeHtml(k.nama_karyawan || session.nama)}</p><p class="text-sm text-slate-500">${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.divisi || "-")}</p></div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
      ${profileRow("NIK Karyawan", k.nik_karyawan)} ${profileRow("Cabang", k.cabang)} ${profileRow("Status Karyawan", k.status_karyawan)}
      ${profileRow("Jenis Kelamin", k.jenis_kelamin)} ${profileRow("Tanggal Lahir", fmtDate(k.tanggal_lahir))} ${profileRow("Tanggal Join", fmtDate(k.tanggal_join))}
      ${profileRow("Pendidikan", k.pendidikan)} ${profileRow("Agama", k.agama)} ${profileRow("No HP Aktif", k.no_hp_aktif)}
      ${profileRow("Email", k.email)} ${profileRow("Atasan", k.atasan)}
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
        <div class="text-4xl">🎂</div>
        <div>
          <p class="font-bold text-lg">Selamat Ulang Tahun, ${firstName}!</p>
          <p class="text-sm text-white/90 mt-0.5">Seluruh keluarga besar CV Andela Jaya mendoakan yang terbaik untuk Anda. 🎉</p>
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
          <div class="text-4xl">🎉</div>
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
          <div class="text-4xl">🌴</div>
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
    if (kData) { jatah = { tahunan: toNumber(kData.jatah_tahunan), khusus: toNumber(kData.jatah_khusus), akumulasi: toNumber(kData.jatah_akumulasi) }; }
  } catch (e) {}

  let terpakai = { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
  try {
    const q = query(collection(db, COL.MASTER_CUTI), where("nama_karyawan", "==", session.nama));
    const snap = await getDocs(q);
    const currentYear = new Date().getFullYear();
    snap.docs.forEach(d => {
      const row = d.data();
      const rowYear = parseInt(row.tahun) || (row.tanggal ? new Date(row.tanggal).getFullYear() : currentYear);
      if (rowYear !== currentYear) return; // hanya hitung transaksi tahun berjalan (lihat cuti.js)
      if (row.potong_jatah && terpakai[row.potong_jatah] !== undefined) {
         let hitung = parseFloat(row.count);
         if (isNaN(hitung)) hitung = 1; 
         terpakai[row.potong_jatah] += hitung;
      }
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
           <div class="mt-5"><label class="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Ulasan Karyawan (Opsional)</label><textarea id="kpi-catatan-penilai" rows="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Kelebihan / area peningkatan..."></textarea></div>
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
           const catatanPenilai = m.querySelector("#kpi-catatan-penilai").value.trim();

           m.querySelectorAll(".kpi-nilai-input").forEach(input => {
              const idx = parseInt(input.dataset.idx); const nilai = parseFloat(input.value) || 0; const bobot = parseFloat(answeredSoal[idx].bobot) || 0;
              answeredSoal[idx].nilai_diberikan = nilai; totalSkorBobot += (nilai * (bobot / 100));
           });

           let finalScore = Math.round(totalSkorBobot * 100) / 100;
           let keputusan = finalScore >= 80 ? "Sangat Baik" : finalScore >= 60 ? "Baik" : "Kurang";

           const btn = m.querySelector("#btn-submit-kpi");
           btn.disabled = true; btn.textContent = "Merekap Nilai...";

           try {
              await fsUpdate(COL.TUGAS_KPI_360, task.id, { status: "DONE", skor_akhir: finalScore, soal_json: answeredSoal, catatan_penilai: catatanPenilai, tanggal_diselesaikan: new Date().toISOString() });
              await fsAdd(COL.LOG_PENILAIAN_KPI, { tanggal: new Date().toISOString(), nama_dinilai: task.nama_dinilai, penilai: task.nama_penilai, total_skor: finalScore, keputusan: keputusan, periode: task.periode, detail_json: answeredSoal, catatan_penilai: catatanPenilai }, genId("KPI-LOG"));

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
    const todayRows = snap.docs.map(d => d.data()).filter(r => {
     const start = (r.tanggal || "").toString().substring(0, 10);
     const end = (r.tanggal_selesai || r.tanggal || "").toString().substring(0, 10);
     return start && todayStr >= start && todayStr <= end;
    });
    if (!todayRows.length) { wrap.innerHTML = emptyState("Tidak ada yang cuti hari ini"); return; }
    wrap.innerHTML = todayRows.map(r => `
      <div class="flex items-center justify-between p-3 rounded-xl border border-slate-100">
        <div class="flex items-center gap-3">
          ${avatar(r.nama_karyawan || "?", "w-9 h-9 text-xs")}
          <div><p class="text-sm font-medium text-slate-700">${escapeHtml(r.nama_karyawan || "-")}</p><p class="text-xs text-slate-400">${escapeHtml(r.cabang || "-")}</p></div>
        </div>
        ${badge(r.type_cuti || "Cuti", "blue")}
      </div>`).join("");
  } catch (e) { wrap.innerHTML = emptyState("Gagal memuat data cuti"); }
}

/* ------------------------ e. PENGUMUMAN ------------------------ */
async function loadAnnouncements(container) {
  const wrap = container.querySelector("#dash-announcements");
  try {
    const q = query(collection(db, COL.BROADCAST), orderBy("tanggal", "desc"), limit(20));
    const snap = await getDocs(q);
    const now = new Date();
    const validMemos = snap.docs.map(d => d.data()).filter(r => {
      if (!r.tanggal_berakhir) return true; 
      const tglBatas = new Date(r.tanggal_berakhir); tglBatas.setHours(23, 59, 59, 999);
      return tglBatas >= now;
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

    // Klik salah satu pengumuman -> tampilkan detail lengkapnya di modal
    // (sebelumnya cuma cuplikan 90 karakter yang tampil, tanpa cara melihat
    // isi lengkap/lampiran dari widget dashboard).
    wrap.querySelectorAll("[data-memo-idx]").forEach(el => {
      el.onclick = () => openAnnouncementDetailModal(validMemos[parseInt(el.dataset.memoIdx)]);
    });
  } catch (e) { wrap.innerHTML = emptyState("Belum ada pengumuman"); }
}

function openAnnouncementDetailModal(memo) {
  if (!memo) return;
  const body = `
    <div class="space-y-4">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>${fmtDateShort(memo.tanggal)} • oleh ${escapeHtml(memo.dibuat_oleh || "-")}</span>
        ${memo.tanggal_berakhir ? `<span>Berlaku s/d ${fmtDateShort(memo.tanggal_berakhir)}</span>` : ""}
      </div>
      <div class="text-sm text-slate-700 leading-relaxed">${memo.isi || "<i>Tidak ada isi.</i>"}</div>
      ${memo.lampiran_url ? `<a href="${memo.lampiran_url}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm font-medium text-maroon-700 hover:underline">${icon("link", "w-4 h-4")} Lihat Lampiran</a>` : ""}
    </div>
    <div class="mt-6 flex justify-end"><button id="btn-tutup-pengumuman" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition">Tutup</button></div>
  `;
  openModal({
    title: memo.judul || "Pengumuman",
    size: "lg",
    bodyHtml: body,
    onMount: (m) => { m.querySelector("#btn-tutup-pengumuman").onclick = closeModal; }
  });
}


/* ------------------------ f. CONTRACT EXPIRY ------------------------ */
async function loadContractExpiry(container) {
  const wrapOuter = container.querySelector("#dash-contract-widget-wrap");
  wrapOuter.classList.remove("hidden");
  const wrap = container.querySelector("#dash-contract-list");
  try {
    const snap = await getDocs(collection(db, COL.MASTER_KARYAWAN));
    const now = new Date();
    const soon = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(k => k.kontrak_habis).map(k => {
        const t = k.kontrak_habis?.toDate ? k.kontrak_habis.toDate() : new Date(k.kontrak_habis);
        return { ...k, _expiry: t, _days: Math.round((t - now) / 86400000) };
      }).filter(k => !isNaN(k._expiry) && k._days >= 0 && k._days <= 60).sort((a, b) => a._days - b._days);

    if (!soon.length) { wrap.innerHTML = emptyState("Tidak ada kontrak yang segera berakhir"); return; }
    wrap.innerHTML = soon.map(k => `
      <div class="flex flex-col p-3 rounded-xl border border-amber-200 bg-amber-50 gap-3">
        <div class="flex items-center justify-between">
          <div><p class="text-sm font-semibold text-slate-800">${escapeHtml(k.nama_karyawan)}</p><p class="text-xs text-slate-600">${escapeHtml(k.jabatan || "-")} • Berakhir: ${fmtDateShort(k._expiry)}</p></div>
          ${badge(`${k._days} hari lagi`, k._days <= 14 ? "red" : "amber")}
        </div>
        <div class="flex items-center gap-2 pt-2 border-t border-amber-200/60">
           <button data-id="${k.id}" data-action="atasan" class="flex-1 bg-maroon-700 hover:bg-maroon-800 text-white text-[11px] py-1.5 rounded transition">Tugaskan Penilaian (Atasan)</button>
        </div>
      </div>`).join("");
      
    // (Fungsi kirim tugas Atasan sudah dimigrasikan ke file penilaian-kontrak untuk manajemen yang lebih baik)
    wrap.querySelectorAll('button[data-action="atasan"]').forEach(btn => btn.onclick = () => toast("Silakan masuk ke menu Penilaian & Kontrak untuk menugaskan Evaluasi KPI", "info"));
  } catch (e) { wrap.innerHTML = emptyState("Gagal memuat data kontrak"); }
}
