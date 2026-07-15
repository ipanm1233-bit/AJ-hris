import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";

export async function mount(container, { session }) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Kedisiplinan & Analisa SP</h1>
          <p class="text-sm text-slate-500 mt-1">Penegakan kedisiplinan dan Analisa kesesuaian sanksi berdasarkan Peraturan Perusahaan (PP).</p>
        </div>
        <button id="btn-ai-analyze" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow flex items-center gap-2">
          ✨ Analisa Kasus Pelanggaran (AI)
        </button>
      </div>
      <div class="flex items-center gap-2 border-b border-slate-100">
        <button data-ptab="sp" class="pm-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700">SP & Konseling</button>
        <button data-ptab="panggil" class="pm-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700">Pemanggilan</button>
      </div>
      <div id="pm-panel-sp"></div>
      <div id="pm-panel-panggil" class="hidden"></div>
      
      <!-- AI ANALYZER PANEL (Hidden by Default) -->
      <div id="ai-panel" class="hidden bg-blue-50 border border-blue-200 rounded-2xl p-6">
         <h3 class="font-bold text-blue-900 mb-2">✨ AI Policy Analyzer (Beta)</h3>
         <p class="text-sm text-blue-700 mb-4">Ketik kronologi pelanggaran karyawan, sistem akan mengecek kesesuaian dengan Pasal 43 & 53 PP Andela Jaya serta UU Ketenagakerjaan.</p>
         <textarea id="ai-kronologi" rows="4" class="w-full p-3 text-sm border border-blue-200 rounded-lg outline-none mb-3" placeholder="Contoh: Karyawan A ketahuan meminum minuman keras di area gudang pada jam kerja..."></textarea>
         <button id="btn-run-ai" class="bg-blue-700 text-white font-medium px-5 py-2 rounded-lg hover:bg-blue-800">Mulai Analisa</button>
         <div id="ai-result" class="mt-4 hidden p-4 bg-white rounded-lg border border-blue-100 text-sm text-slate-700"></div>
      </div>
    </div>
  `;

  const panelSp = container.querySelector("#pm-panel-sp");
  const panelPanggil = container.querySelector("#pm-panel-panggil");
  const aiPanel = container.querySelector("#ai-panel");
  const loaded = {};

  container.querySelector("#btn-ai-analyze").addEventListener("click", () => {
      aiPanel.classList.toggle("hidden");
  });

  container.querySelector("#btn-run-ai").addEventListener("click", () => {
      const txt = container.querySelector("#ai-kronologi").value.toLowerCase();
      const res = container.querySelector("#ai-result");
      res.classList.remove("hidden");
      res.innerHTML = `<span class="animate-pulse">Menghubungkan ke Knowledge Base Peraturan Perusahaan...</span>`;
      
      // Simulasi AI Logic berdasarkan teks input dan[cite: 5]
      setTimeout(() => {
          if (txt.includes("minum") || txt.includes("mabuk") || txt.includes("judi") || txt.includes("curi")) {
              res.innerHTML = `<b>🚨 Kesimpulan Analisa: PELANGGARAN BERAT</b><br/>Berdasarkan <b>Pasal 53 Peraturan Perusahaan CV Andela Jaya</b>, tindakan ini termasuk Kesalahan Berat (Mabuk/Judi/Mencuri).<br/><br/><b>Rekomendasi Tindakan:</b><br/>Perusahaan dapat melakukan Pemutusan Hubungan Kerja (PHK) seketika tanpa Pesangon. Karyawan hanya berhak mendapatkan Uang Pisah (Pasal 62) dan Uang Penggantian Hak (Pasal 60).<br/><br/><i>Syarat: Bukti harus didukung pengakuan atau laporan pihak berwenang dengan min. 2 saksi.</i>`;
          } else if (txt.includes("mangkir") || txt.includes("absen")) {
              res.innerHTML = `<b>⚠️ Kesimpulan Analisa: MANGKIR / INDISIPLINER</b><br/>Berdasarkan <b>Pasal 52 PP Andela Jaya</b>, jika karyawan mangkir 5 hari berturut-turut tanpa ijin resmi dan telah dipanggil 2x secara patut, maka dikualifikasikan Mengundurkan Diri.<br/><br/><b>Rekomendasi Tindakan:</b><br/>1. Terbitkan Surat Pemanggilan Pertama.<br/>2. Jika masuk 1-2 hari, berikan SP.<br/>3. Hak jika ter-PHK: Uang Pisah (Pasal 61).`;
          } else {
              res.innerHTML = `<b>📝 Kesimpulan Analisa: PELANGGARAN TATA TERTIB UMUM</b><br/>Berdasarkan <b>Pasal 43 PP Andela Jaya</b>, tindakan indisipliner umum diselesaikan melalui pemberian Surat Peringatan (SP) berjenjang.<br/><br/><b>Rekomendasi Tindakan:</b><br/>Terbitkan Surat Peringatan 1 (Berlaku 6 bulan). Lakukan sesi Konseling (Bimbingan) oleh Atasan.`;
          }
      }, 1500);
  });

  async function loadSp() {
    await renderCrudModule(panelSp, {
      title: "Log SP & Konseling",
      collectionName: COL.LOG_SP_KONSELING, idPrefix: "SP",
      searchFields: ["nama_karyawan", "jenis", "alasan"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_karyawan", label: "Karyawan" },
        { key: "jenis", label: "Jenis", type: "badge", badgeTone: (v) => (v || "").toLowerCase().includes("konseling") ? "blue" : "red" },
        { key: "alasan", label: "Alasan" }
      ],
      formFields: [
        { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "jenis", label: "Jenis", type: "select", options: ["SP 1", "SP 2", "SP 3 (Terakhir)", "Konseling"], required: true },
        { name: "alasan", label: "Alasan Pelanggaran", type: "textarea", full: true }
      ]
    });
  }

  async function loadPanggil() {
    await renderCrudModule(panelPanggil, {
      title: "Data Pemanggilan",
      collectionName: "data_pemanggilan", idPrefix: "PGL",
      searchFields: ["nama_karyawan", "jenis_pemanggilan"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_karyawan", label: "Karyawan" },
        { key: "jenis_pemanggilan", label: "Jenis Panggilan" },
        { key: "status", label: "Status", type: "badge" },
      ],
      formFields: [
        { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "tanggal", label: "Tanggal Panggilan", type: "date", required: true },
        { name: "jenis_pemanggilan", label: "Jenis Pemanggilan", type: "text", required: true },
        { name: "status", label: "Status", type: "select", options: ["Terjadwal", "Selesai"], default: "Terjadwal" }
      ]
    });
  }

  await loadSp(); loaded.sp = true;

  container.querySelectorAll(".pm-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ptab;
      panelSp.classList.toggle("hidden", tab !== "sp");
      panelPanggil.classList.toggle("hidden", tab !== "panggil");
      container.querySelectorAll(".pm-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if (tab === "panggil" && !loaded.panggil) { loaded.panggil = true; await loadPanggil(); }
    });
  });

  return { unmount() {} };
}
