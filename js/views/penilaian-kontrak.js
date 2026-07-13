import { db, COL, collection, query, where, getDocs, limit } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, openModal, closeModal, toast, genId, fmtDateShort, escapeHtml, sendEmailNotif, createLoginToken } from "../utils.js";
import { renderCrudModule, badge, emptyState, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  const panels = {
    kontrak: container.querySelector("#pk-panel-kontrak"),
    kpi360: container.querySelector("#pk-panel-kpi360"),
    hasil: container.querySelector("#pk-panel-hasil"),
    evaluasi: container.querySelector("#pk-panel-evaluasi"),
  };
  const loaded = {};

  async function loadKontrak() {
    await renderCrudModule(panels.kontrak, {
      title: "Kontrak Kerja Karyawan",
      subtitle: "Pantau masa berlaku ikatan dinas & status kontrak.",
      collectionName: COL.MASTER_KONTRAK,
      idPrefix: "KTR",
      searchFields: ["nama_karyawan", "jabatan", "cabang"],
      columns: [
        { key: "nama_karyawan", label: "Karyawan" },
        { key: "jabatan", label: "Jabatan" },
        { key: "kontrak_ke", label: "Kontrak Ke", type: "number" },
        { key: "tanggal_mulai", label: "Mulai", type: "date" },
        { key: "tanggal_akhir", label: "Berakhir", type: "date" },
        { key: "status_kolom_kontrak", label: "Status", type: "badge" },
      ],
      formFields: [
        { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "cabang", label: "Cabang", type: "text" },
        { name: "jabatan", label: "Jabatan", type: "text" },
        { name: "divisi", label: "Divisi", type: "text" },
        { name: "kontrak_ke", label: "Kontrak Ke-", type: "number", default: 1 },
        { name: "tanggal_mulai", label: "Tanggal Mulai", type: "date", required: true },
        { name: "tanggal_akhir", label: "Tanggal Akhir", type: "date", required: true },
        { name: "status_kolom_kontrak", label: "Status Kontrak", type: "select", options: ["AKTIF", "SEGERA HABIS", "DONE", "DIPERPANJANG"], default: "AKTIF" },
        { name: "link_dokumen", label: "Link Dokumen", type: "text", full: true },
      ]
    });
  }

  async function loadKpi360() {
    const wrap = panels.kpi360;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    const tasks = await fsGetAll(COL.TUGAS_KPI_360);
    const isHrd = session.role === "HRD";

    let htmlContent = ``;
    if (isHrd) {
      htmlContent += `
        <div class="mb-4 flex justify-end">
          <button id="btn-distribusi-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Distribusi Penilaian 360
          </button>
        </div>
      `;
    }

    if (!tasks.length) { 
      wrap.innerHTML = htmlContent + emptyState("Belum ada tugas penilaian 360", "Buat penugasan penilaian baru untuk memulai."); 
    } else {
      wrap.innerHTML = htmlContent + `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
                <th class="px-4 py-3 text-left">Periode</th><th class="px-4 py-3 text-left">Penilai (Assessor)</th>
                <th class="px-4 py-3 text-left">Dinilai (Assessee)</th><th class="px-4 py-3 text-left">Batas Waktu</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Skor</th>
              </tr></thead>
              <tbody>${tasks.map(t => `
                <tr class="border-t border-slate-50 hover:bg-slate-50/60 transition">
                  <td class="px-4 py-3">${escapeHtml(t.periode || "-")}</td>
                  <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(t.nama_penilai || "-")}</td>
                  <td class="px-4 py-3">${escapeHtml(t.nama_dinilai || "-")}</td>
                  <td class="px-4 py-3 text-xs text-slate-500">${t.deadline ? fmtDateShort(t.deadline) : "-"}</td>
                  <td class="px-4 py-3">${badge(t.status || "PENDING", t.status === "DONE" ? "green" : "amber")}</td>
                  <td class="px-4 py-3 font-semibold text-slate-700">${t.skor_akhir || "-"}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    if (isHrd) {
      const btn = wrap.querySelector("#btn-distribusi-kpi");
      if (btn) btn.addEventListener("click", () => openDistribusiModal());
    }
  }

  async function openDistribusiModal() {
    const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
    const active = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
    const optKaryawan = active.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} — ${escapeHtml(k.jabatan || "")}</option>`).join("");

    openModal({
      title: "Distribusi Penilaian Berbasis Indikator",
      size: "lg",
      bodyHtml: `
        <form id="form-distribusi" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Periode Penilaian</label>
              <input type="text" id="kpi-periode" placeholder="Cth: Q3 2026" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih PENILAI (Assessor)</label>
              <select id="kpi-penilai" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
                 <option value="">Pilih Karyawan Penilai...</option>
                 ${optKaryawan}
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih Karyawan yang DINILAI (Bisa lebih dari 1, tahan CTRL/CMD)</label>
            <select id="kpi-dinilai" multiple required size="5" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
               ${optKaryawan}
            </select>
          </div>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <label class="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Rancang Indikator & Bobot Penilaian</label>
            <div id="soal-list" class="space-y-3 mb-3"></div>
            <button type="button" id="btn-add-soal" class="text-xs text-maroon-700 font-medium hover:underline flex items-center gap-1">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Tambah Indikator Baru
            </button>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-batal-kpi" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Kirim Tugas Penilaian</button>
      `,
      onMount: (m) => {
         const soalList = m.querySelector("#soal-list");
         function addSoal() {
            const div = document.createElement("div");
            div.className = "flex gap-2 items-start bg-white p-2 rounded-lg border border-slate-200";
            div.innerHTML = `
              <div class="flex-1 space-y-2">
                 <input type="text" placeholder="Aspek (Cth: Perilaku & Sikap Kerja)" class="soal-aspek w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400" required>
                 <input type="text" placeholder="Indikator (Cth: Berinisiatif dalam memecahkan masalah tanpa menunggu perintah)" class="soal-indikator w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400" required>
              </div>
              <div class="w-20">
                 <input type="number" placeholder="Bobot %" class="soal-bobot w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400 text-center" required min="1" max="100">
              </div>
              <button type="button" class="text-slate-300 hover:text-red-500 mt-1.5 p-1" onclick="this.parentElement.remove()" title="Hapus">✖</button>
            `;
            soalList.appendChild(div);
         }
         addSoal(); // Row pertama otomatis
         m.querySelector("#btn-add-soal").onclick = addSoal;

         m.querySelector("#btn-batal-kpi").onclick = closeModal;
         m.querySelector("#btn-save-kpi").onclick = async () => {
            const form = m.querySelector("#form-distribusi");
            if (!form.reportValidity()) return;

            const periode = m.querySelector("#kpi-periode").value.trim();
            const penilai = m.querySelector("#kpi-penilai").value;
            const dinilaiList = Array.from(m.querySelector("#kpi-dinilai").selectedOptions).map(opt => opt.value);

            if(dinilaiList.includes(penilai)) return toast("Penilai tidak boleh mengevaluasi dirinya sendiri!", "warning");
            if(soalList.children.length === 0) return toast("Tambahkan minimal 1 indikator penilaian!", "warning");

            // Rangkum aspek dan indikator
            const soalArray = [];
            soalList.querySelectorAll(".flex.gap-2").forEach(row => {
               soalArray.push({
                  aspek: row.querySelector(".soal-aspek").value.trim(),
                  indikator: row.querySelector(".soal-indikator").value.trim(),
                  bobot: parseFloat(row.querySelector(".soal-bobot").value) || 0,
                  nilai_diberikan: 0
               });
            });

            // Kalkulasi Deadline 3 Hari
            const deadlineDate = new Date();
            deadlineDate.setDate(deadlineDate.getDate() + 3);
            const deadlineISO = deadlineDate.toISOString();

            const btn = m.querySelector("#btn-save-kpi");
            btn.disabled = true; btn.textContent = "Menyebarkan & Mengirim Email...";

            try {
               // 1. Cari Data Akun Penilai untuk Pengiriman Email
               const qU = query(collection(db, COL.USERS), where("nama", "==", penilai), limit(1));
               const snapU = await getDocs(qU);
               let penilaiEmail = "";
               let penilaiUsername = "";
               if (!snapU.empty) {
                  penilaiEmail = snapU.docs[0].data().email;
                  penilaiUsername = snapU.docs[0].id;
               }

               // 2. Buat Rekaman Penugasan untuk masing-masing karyawan yang dinilai
               for (const dinilai of dinilaiList) {
                  await fsAdd(COL.TUGAS_KPI_360, {
                     periode: periode,
                     nama_penilai: penilai,
                     nama_dinilai: dinilai,
                     soal_json: soalArray,
                     status: "PENDING",
                     skor_akhir: 0,
                     tanggal: new Date().toISOString(),
                     deadline: deadlineISO // Disematkan deadline
                  }, genId("KPI"));
               }

               // 3. Kirim Email Notifikasi beserta Magic Link 
               if (penilaiEmail && penilaiUsername && typeof sendEmailNotif === 'function') {
                  const token = await createLoginToken(penilaiUsername);
                  const magicLink = `https://andela-hris.vercel.app/#dashboard?token=${token}`;
                  const htmlEmail = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                      <h2 style="color: #7a1f2b;">Tugas Penilaian KPI 360 Baru</h2>
                      <p>Halo <strong>${penilai}</strong>,</p>
                      <p>HRD telah menugaskan Anda untuk menilai <strong>${dinilaiList.length} karyawan</strong> pada periode <strong>${periode}</strong>.</p>
                      <p>Mohon selesaikan penilaian ini sebelum <strong>${fmtDateShort(deadlineISO)}</strong> (3 Hari dari sekarang).</p>
                      <a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Buka Sistem & Mulai Menilai</a>
                      <p style="margin-top:15px; font-size:11px; color:#94a3b8;">Tautan akses ini bersifat aman dan sekali pakai.</p>
                    </div>
                  `;
                  sendEmailNotif(penilaiEmail, "Tugas Penilaian KPI 360", htmlEmail).catch(e => console.warn(e));
               }

               toast("Tugas Penilaian berhasil didistribusikan.", "success");
               closeModal();
               await loadKpi360(); 
            } catch (e) {
               toast("Gagal mendistribusikan KPI: " + e.message, "error");
               btn.disabled = false; btn.textContent = "Kirim Tugas Penilaian";
            }
         }
      }
    });
  }

  async function loadHasil() {
    await renderCrudModule(panels.hasil, {
      title: "Hasil Penilaian KPI",
      collectionName: COL.LOG_PENILAIAN_KPI,
      canCreate: false, canEdit: false, canDelete: false,
      searchFields: ["nama_dinilai", "penilai"],
      columns: [
        { key: "tanggal", label: "Tanggal Selesai", type: "date" },
        { key: "nama_dinilai", label: "Dinilai" },
        { key: "penilai", label: "Penilai" },
        { key: "total_skor", label: "Total Skor Akhir" },
        { key: "keputusan", label: "Keputusan", type: "badge", badgeTone: (v) => v === "Sangat Baik" ? "green" : v === "Baik" ? "blue" : "amber" },
      ]
    });
  }

  async function loadEvaluasi() {
    await renderCrudModule(panels.evaluasi, {
      title: "Evaluasi Kontrak",
      subtitle: "Rekomendasi perpanjangan/pemutusan kontrak.",
      collectionName: COL.EVALUASI_KONTRAK,
      idPrefix: "EVK",
      searchFields: ["nama_pekerja"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_pekerja", label: "Karyawan" },
        { key: "skor", label: "Skor" },
        { key: "rekomendasi", label: "Rekomendasi", type: "badge", badgeTone: (v) => (v || "").toLowerCase().includes("lanjut") ? "green" : "red" },
        { key: "penilai", label: "Penilai" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "nama_pekerja", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "skor", label: "Skor (0-100)", type: "number", required: true },
        { name: "rekomendasi", label: "Rekomendasi", type: "select", options: ["Perpanjang Kontrak", "Angkat Tetap", "Tidak Diperpanjang"], required: true },
        { name: "catatan_evaluasi", label: "Catatan Evaluasi", type: "textarea", full: true },
        { name: "penilai", label: "Penilai", type: "text", default: session.nama },
      ]
    });
  }

  await loadKontrak(); loaded.kontrak = true;

  container.querySelectorAll(".pk-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ntab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".pk-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "kpi360") await loadKpi360();
        if (tab === "hasil") await loadHasil();
        if (tab === "evaluasi") await loadEvaluasi();
      }
    });
  });

  return { unmount() {} };
}
