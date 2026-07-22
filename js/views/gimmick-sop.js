import { COL } from "../firebase-config.js";
import { fsGetAll, openModal, closeModal, toast } from "../utils.js";
import { renderCrudModule, emptyState } from "../components.js";

function escapeHtml(unsafe) {
    return (unsafe || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Konfigurasi AI Gemini kini terpusat di js/ai-config.js

export async function mount(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Manajemen Gimmick & SOP</h1>
        <p class="text-sm text-slate-500 mt-1">Pusat dokumentasi SOP perusahaan dan alokasi gimmick (merchandise) ke area/toko.</p>
      </div>
      <div class="flex items-center gap-2 border-b border-slate-100 overflow-x-auto">
        <button data-gtab="gimmick" class="gs-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap">Distribusi Gimmick</button>
        <button data-gtab="sop" class="gs-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">Database SOP</button>
      </div>
      <div id="gs-panel-gimmick" class="hidden"></div>
      <div id="gs-panel-sop"></div>
    </div>
  `;

  const panelGimmick = container.querySelector("#gs-panel-gimmick");
  const panelSOP = container.querySelector("#gs-panel-sop");
  const loaded = {};

  async function loadGimmick() {
    await renderCrudModule(panelGimmick, {
      title: "Alokasi Gimmick (Merchandise)",
      collectionName: "master_gimmick", idPrefix: "GMK",
      searchFields: ["nama_item", "principle", "alokasi_toko"],
      columns: [
        { key: "nama_item", label: "Nama Gimmick" },
        { key: "principle", label: "Principle", type: "badge", badgeTone: (v) => v === "ICI" ? "blue" : v === "DCOTA" ? "amber" : "green" },
        { key: "alokasi_toko", label: "Toko / Area" },
        { key: "jumlah", label: "Jumlah (Pcs)", type: "number" },
        { key: "tanggal_distribusi", label: "Tgl Distribusi", type: "date" },
      ],
      formFields: [
        { name: "nama_item", label: "Nama Item Gimmick", type: "text", required: true, full: true },
        { name: "principle", label: "Principle", type: "select", options: ["ICI", "DCOTA", "PRIMA"], required: true },
        { name: "jumlah", label: "Jumlah Stok (Pcs)", type: "number", required: true },
        { name: "alokasi_toko", label: "Alokasi Toko / Area Target", type: "text", required: true },
        { name: "pic_sales", label: "PIC Sales (Pembawa)", type: "text" },
        { name: "tanggal_distribusi", label: "Rencana Distribusi", type: "date", required: true },
        { name: "keterangan", label: "Keterangan", type: "textarea", full: true },
      ]
    });
  }

  async function loadSOP() {
    await renderCrudModule(panelSOP, {
      title: "Database SOP",
      subtitle: "Input alur proses HR untuk otomatis di-generate menjadi struktur SOP.",
      collectionName: COL.GIMMICK_SOP, idPrefix: "SOP",
      searchFields: ["judul", "kategori"],
      columns: [
        { key: "judul", label: "Judul SOP" },
        { key: "departemen", label: "Departemen" },
        { key: "versi", label: "Versi", type: "badge" },
        { key: "status", label: "Status", type: "badge", badgeTone: (v) => v === "Aktif" ? "green" : "slate" },
        { key: "file_url", label: "Dokumen Resmi", type: "link" },
      ],
      formFields: [
        { name: "judul", label: "Judul Prosedur (SOP)", type: "text", required: true, full: true },
        { name: "departemen", label: "Departemen Terkait", type: "select", options: ["HRD", "FINANCE", "SALES", "WAREHOUSE", "LOGISTIC", "ALL"], required: true },
        { name: "versi", label: "Versi / Revisi", type: "text", default: "1.0" },
        { name: "status", label: "Status Dokumen", type: "select", options: ["Aktif", "Revisi", "Draft"], default: "Aktif" },
        { name: "alur_proses", label: "Alur Proses (Ketik bebas langkah-langkahnya di sini)", type: "textarea", full: true },
        { name: "file_url", label: "Link Lampiran Lengkap (opsional)", type: "text", full: true },
      ],
      extraToolbarHtml: `<button id="btn-auto-flowchart" class="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-lg text-sm font-semibold hover:opacity-95 transition shadow-sm flex items-center gap-2">⚡ Automatic Flowchart Generator</button>`
    });

    const btnFlowchart = container.querySelector("#btn-auto-flowchart");
    if (btnFlowchart) {
       btnFlowchart.addEventListener("click", openAutoFlowchartModal);
    }
  }

  async function openAutoFlowchartModal() {
     const allSOP = await fsGetAll(COL.GIMMICK_SOP);
     if (allSOP.length === 0) {
        toast("Belum ada SOP yang terdaftar. Buat SOP terlebih dahulu.", "warning");
        return;
     }

     const optSOP = allSOP.map(s => `<option value="${s.id}">${escapeHtml(s.judul)} [${escapeHtml(s.departemen)}]</option>`).join("");

     openModal({
        title: "⚡ Automatic SOP Flowchart Generator",
        size: "lg",
        bodyHtml: `
           <div class="space-y-4">
              <div class="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed flex items-center justify-between gap-3">
                 <div>
                    <strong>Flowchart Otomatis:</strong> Pilih SOP di bawah ini, sistem akan secara otomatis mengurai teks alur proses dan memvisualisasikannya menjadi diagram alir profesional tanpa perlu membuka aplikasi luar.
                 </div>
                 <button id="btn-print-fc" class="shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow transition flex items-center gap-1">
                    🖨️ Cetak / Simpan PDF
                 </button>
              </div>
              
              <div>
                 <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Pilih SOP untuk Didiagramkan:</label>
                 <select id="auto-sop-selector" class="w-full px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition">
                    ${optSOP}
                 </select>
              </div>

              <div id="flowchart-render-box" class="p-6 bg-slate-900 rounded-2xl border border-slate-800 text-white min-h-[420px] shadow-inner overflow-x-auto">
                 <!-- Flowchart otomatis dirender di sini -->
              </div>
           </div>
        `,
        footerHtml: `
           <button id="btn-tutup-fc" class="px-5 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">Tutup</button>
        `,
        onMount: (m) => {
           m.querySelector("#btn-tutup-fc").onclick = closeModal;
           
           const selector = m.querySelector("#auto-sop-selector");
           const renderBox = m.querySelector("#flowchart-render-box");
           const btnPrint = m.querySelector("#btn-print-fc");

           function renderFlowchartForSOP(sopId) {
              const sop = allSOP.find(x => x.id === sopId);
              if (!sop) return;

              const rawAlur = (sop.alur_proses || "").trim();
              let steps = [];

              if (rawAlur) {
                 // Split by newlines or numbers like "1.", "2.", "Langkah 1:", "- "
                 steps = rawAlur.split(/\r?\n+/)
                    .map(s => s.replace(/^(\d+[\.\)]\s*|langkah\s*\d+\s*:\s*|-\s*|\*\s*)/i, "").trim())
                    .filter(Boolean);
              }

              if (steps.length === 0) {
                 steps = [
                    `Pemohon mengisi formulir pengajuan ${sop.judul}`,
                    `Atasan melakukan review & pertimbangan awal`,
                    `Departemen ${sop.departemen} memproses verifikasi berkas`,
                    `Approval pihak berwenang & penyelesaian prosedur`
                 ];
              }

              let diagramHtml = `
                 <div id="printable-flowchart" class="max-w-2xl mx-auto space-y-4 font-sans text-left">
                    <div class="text-center pb-4 border-b border-slate-800">
                       <span class="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[11px] font-bold uppercase tracking-wider">SOP RESMI ${escapeHtml(sop.departemen)}</span>
                       <h3 class="text-xl font-bold text-white mt-2">${escapeHtml(sop.judul)}</h3>
                       <p class="text-xs text-slate-400 mt-1">Versi Dokumen: ${escapeHtml(sop.versi || "1.0")} | Status: <span class="text-emerald-400 font-semibold">${escapeHtml(sop.status || "Aktif")}</span></p>
                    </div>

                    <!-- NODE 1: START -->
                    <div class="flex flex-col items-center">
                       <div class="w-48 py-2.5 bg-emerald-600 text-white rounded-full text-xs font-bold text-center tracking-widest uppercase shadow-lg shadow-emerald-900/50 border border-emerald-400">
                          ▶ MULAI / START
                       </div>
                       <div class="w-0.5 h-6 bg-emerald-500/60 my-0.5"></div>
                       <div class="text-emerald-400 text-xs font-bold">▼</div>
                    </div>
              `;

              steps.forEach((stepText, idx) => {
                 const stepNum = idx + 1;
                 const isLast = idx === steps.length - 1;
                 const isDecision = /apakah|jika|bila|setuju|sanggah|revisi/i.test(stepText);

                 if (isDecision) {
                    diagramHtml += `
                       <div class="flex flex-col items-center my-1">
                          <div class="w-80 p-4 bg-gradient-to-br from-amber-900/60 to-amber-950/80 border-2 border-amber-500/60 rounded-2xl text-center shadow-lg transform rotate-0">
                             <div class="flex items-center justify-between mb-1">
                                <span class="text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-500/30 text-amber-300 rounded">Langkah ${stepNum} (Keputusan)</span>
                                <span class="text-amber-400 font-mono text-xs">❖</span>
                             </div>
                             <p class="text-xs font-semibold text-amber-100 leading-relaxed">${escapeHtml(stepText)}</p>
                          </div>
                          <div class="w-0.5 h-6 bg-amber-500/60 my-0.5"></div>
                          <div class="text-amber-400 text-xs font-bold">▼</div>
                       </div>
                    `;
                 } else {
                    diagramHtml += `
                       <div class="flex flex-col items-center my-1">
                          <div class="w-full bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl p-4 shadow-md transition">
                             <div class="flex items-start gap-3">
                                <div class="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                   ${stepNum}
                                </div>
                                <div class="flex-1">
                                   <p class="text-xs font-semibold text-slate-100 leading-relaxed">${escapeHtml(stepText)}</p>
                                </div>
                             </div>
                          </div>
                          ${!isLast ? `
                             <div class="w-0.5 h-6 bg-slate-700 my-0.5"></div>
                             <div class="text-slate-500 text-xs font-bold">▼</div>
                          ` : ""}
                       </div>
                    `;
                 }
              });

              diagramHtml += `
                    <!-- NODE END -->
                    <div class="flex flex-col items-center pt-2">
                       <div class="w-0.5 h-6 bg-emerald-500/60 my-0.5"></div>
                       <div class="text-emerald-400 text-xs font-bold mb-1">▼</div>
                       <div class="w-48 py-2.5 bg-red-700 text-white rounded-full text-xs font-bold text-center tracking-widest uppercase shadow-lg shadow-red-950/50 border border-red-500">
                          ■ SELESAI / END
                       </div>
                    </div>
                 </div>
              `;

              renderBox.innerHTML = diagramHtml;
           }

           selector.onchange = () => renderFlowchartForSOP(selector.value);
           renderFlowchartForSOP(selector.value);

           btnPrint.onclick = () => {
              const el = m.querySelector("#printable-flowchart");
              if (!el) return;
              const w = window.open("", "_blank");
              w.document.write(`
                 <html>
                    <head>
                       <title>Flowchart SOP - Andela Jaya</title>
                       <script src="https://cdn.tailwindcss.com"></script>
                    </head>
                    <body class="bg-slate-900 text-white p-8">
                       ${el.outerHTML}
                       <script>setTimeout(() => { window.print(); }, 500);</script>
                    </body>
                 </html>
              `);
              w.document.close();
           };
        }
     });
  }

  await loadSOP(); loaded.sop = true;

  container.querySelectorAll(".gs-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.gtab;
      panelGimmick.classList.toggle("hidden", tab !== "gimmick");
      panelSOP.classList.toggle("hidden", tab !== "sop");
      container.querySelectorAll(".gs-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if (tab === "gimmick" && !loaded.gimmick) { loaded.gimmick = true; await loadGimmick(); }
    });
  });

  return { unmount() {} };
}
