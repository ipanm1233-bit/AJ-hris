import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, openModal, closeModal, toast, genId, smartParseDate, escapeHtml } from "../utils.js";
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

    // Tombol Distribusi Khusus HRD
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
                <th class="px-4 py-3 text-left">Dinilai (Assessee)</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Skor</th>
              </tr></thead>
              <tbody>${tasks.map(t => `
                <tr class="border-t border-slate-50 hover:bg-slate-50/60 transition">
                  <td class="px-4 py-3">${escapeHtml(t.periode || "-")}</td>
                  <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(t.nama_penilai || "-")}</td>
                  <td class="px-4 py-3">${escapeHtml(t.nama_dinilai || "-")}</td>
                  <td class="px-4 py-3">${badge(t.status || "PENDING", t.status === "DONE" ? "green" : "amber")}</td>
                  <td class="px-4 py-3 font-semibold text-slate-700">${t.skor_akhir || "-"}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    // Pasang event listener untuk modal distribusi
    if (isHrd) {
      const btn = wrap.querySelector("#btn-distribusi-kpi");
      if (btn) btn.addEventListener("click", () => openDistribusiModal());
    }
  }
  async function openDistribusiModal() {
    // Ambil Karyawan Aktif
    const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
    const active = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
    const optKaryawan = active.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} — ${escapeHtml(k.jabatan || "")}</option>`).join("");
    
    // Ambil default pertanyaan dari Master Soal (jika ada)
    const masterSoal = await fsGetAll(COL.MASTER_SOAL_KPI).catch(() => []);
    const defaultPertanyaan = masterSoal.map(s => s.pertanyaan).filter(Boolean).join("\n");

    openModal({
      title: "Distribusi Penilaian KPI 360",
      size: "lg",
      bodyHtml: `
        <form id="form-distribusi" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Periode Penilaian</label>
            <input type="text" id="kpi-periode" placeholder="Cth: Q3 2026 atau Akhir Tahun 2026" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih PENILAI (Siapa yang memberikan nilai?)</label>
            <select id="kpi-penilai" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
               <option value="">Pilih Karyawan Penilai...</option>
               ${optKaryawan}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih Karyawan yang DINILAI (Bisa pilih lebih dari 1 - Tahan tombol CTRL/CMD)</label>
            <select id="kpi-dinilai" multiple required size="6" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
               ${optKaryawan}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Pertanyaan/Soal KPI (Pisahkan per baris/enter)</label>
            <textarea id="kpi-soal" rows="5" placeholder="1. Bagaimana komunikasi karyawan ini?\n2. Bagaimana kedisiplinannya?" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">${escapeHtml(defaultPertanyaan)}</textarea>
            <p class="text-[11px] text-slate-400 mt-1">Soal otomatis terisi dari Master Soal KPI jika tersedia. HRD dapat merubahnya sesuai kebutuhan.</p>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-batal-kpi" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Distribusikan Tugas</button>
      `,
      onMount: (m) => {
         m.querySelector("#btn-batal-kpi").onclick = closeModal;
         m.querySelector("#btn-save-kpi").onclick = async () => {
            const form = m.querySelector("#form-distribusi");
            if (!form.reportValidity()) return;

            const periode = m.querySelector("#kpi-periode").value.trim();
            const penilai = m.querySelector("#kpi-penilai").value;
            const soalText = m.querySelector("#kpi-soal").value.trim();
            
            // Ambil array yang dinilai
            const selectDinilai = m.querySelector("#kpi-dinilai");
            const dinilaiList = Array.from(selectDinilai.selectedOptions).map(opt => opt.value);

            if(dinilaiList.includes(penilai)) {
                return toast("Penilai tidak boleh menilai dirinya sendiri!", "warning");
            }

            // Ubah teks soal per-baris menjadi Array of Objects
            const soalArray = soalText.split('\n').filter(s => s.trim().length > 0).map(s => ({ pertanyaan: s.trim(), jawaban: 0 }));

            const btn = m.querySelector("#btn-save-kpi");
            btn.disabled = true; btn.textContent = "Menyebarkan...";

            try {
               // Buat tugas (document) untuk masing-masing karyawan yang dinilai
               for (const dinilai of dinilaiList) {
                  await fsAdd(COL.TUGAS_KPI_360, {
                     periode: periode,
                     nama_penilai: penilai,
                     nama_dinilai: dinilai,
                     soal_json: soalArray,
                     status: "PENDING",
                     skor_akhir: 0,
                     tanggal: new Date().toISOString()
                  }, genId("KPI"));
               }
               toast(`${dinilaiList.length} Tugas Penilaian berhasil didistribusikan kepada ${penilai}.`, "success");
               closeModal();
               await loadKpi360(); // Refresh tabel
            } catch (e) {
               toast("Gagal mendistribusikan KPI: " + e.message, "error");
               btn.disabled = false; btn.textContent = "Distribusikan Tugas";
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
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_dinilai", label: "Dinilai" },
        { key: "penilai", label: "Penilai" },
        { key: "total_skor", label: "Total Skor" },
        { key: "keputusan", label: "Keputusan", type: "badge" },
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
