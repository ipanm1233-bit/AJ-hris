import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, openModal, closeModal, toast } from "../utils.js";
import { renderCrudModule } from "../components.js";

function escapeHtml(unsafe) {
    return (unsafe || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export async function mount(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Manajemen Gimmick & SOP</h1>
        <p class="text-sm text-slate-500 mt-1">Pusat dokumentasi SOP perusahaan dan generator flowchart otomatis berbasis Mermaid & Kroki.io / Draw.io.</p>
      </div>
      <div class="flex items-center gap-2 border-b border-slate-100 overflow-x-auto">
        <button data-gtab="gimmick" class="gs-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap">Distribusi Gimmick</button>
        <button data-gtab="sop" class="gs-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">Database SOP & Flowchart Generator</button>
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
      title: "Database SOP Perusahaan",
      subtitle: "Input & Kelola Prosedur Operasional Standar (SOP) lengkap dengan Generator Flowchart Mermaid, Kroki.io & Draw.io.",
      collectionName: COL.GIMMICK_SOP, idPrefix: "SOP",
      searchFields: ["judul", "kategori", "departemen"],
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
        { name: "tujuan", label: "Tujuan Prosedur (SOP)", type: "textarea", full: true },
        { name: "ruang_lingkup", label: "Ruang Lingkup", type: "text", full: true },
        { name: "alur_proses", label: "Alur Proses / Langkah Kerja (Ketik per baris)", type: "textarea", full: true },
        { name: "file_url", label: "Link Lampiran Lengkap (opsional)", type: "text", full: true },
      ],
      extraToolbarHtml: `<button id="btn-auto-flowchart" class="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-lg text-sm font-semibold hover:opacity-95 transition shadow-sm flex items-center gap-2">⚡ Flowchart Generator (Mermaid & Kroki)</button>`
    });

    const btnFlowchart = container.querySelector("#btn-auto-flowchart");
    if (btnFlowchart) {
       btnFlowchart.addEventListener("click", openAutoFlowchartModal);
    }
  }

  // Generate Mermaid Syntax from Steps array
  function buildMermaidCode(sopJudul, steps) {
     if (!steps || steps.length === 0) {
        return `flowchart TD\n    A(["🟢 START: Mulai Prosedur"]) --> B["🟦 Proses Standar"] --> C(["🔴 END: Selesai Prosedur"])`;
     }

     const clean = (str) => {
        if (!str) return "";
        return str.toString().replace(/["'{}()\[\]\\]/g, " ").replace(/\n+/g, "<br/>").trim();
     };

     let code = `flowchart TD\n`;
     code += `    %% Mermaid Flowchart - ${clean(sopJudul)}\n`;
     code += `    classDef startStyle fill:#059669,stroke:#047857,color:#ffffff,font-weight:bold,rx:20px;\n`;
     code += `    classDef processStyle fill:#1e293b,stroke:#475569,color:#f8fafc,rx:8px;\n`;
     code += `    classDef decisionStyle fill:#78350f,stroke:#d97706,color:#fef3c7,rx:8px;\n`;
     code += `    classDef docStyle fill:#083344,stroke:#06b6d4,color:#e0f2fe,rx:8px;\n`;
     code += `    classDef endStyle fill:#991b1b,stroke:#dc2626,color:#ffffff,font-weight:bold,rx:20px;\n\n`;

     // Declare Nodes
     steps.forEach((st, idx) => {
        const id = `NODE_${idx + 1}`;
        const name = clean(st.nama_aktivitas || st.title || `Aktivitas ${idx + 1}`);
        const detail = clean(st.detail_proses || st.description || "");
        const actor = clean(st.actor || "");
        const cat = (st.category || st.shape || "PROCESS").toUpperCase();

        let label = `<b>${name}</b>`;
        if (actor) label += `<br/>👤 <i>${actor}</i>`;
        if (detail) label += `<br/><small>${detail}</small>`;

        switch (cat) {
           case "START":
              code += `    ${id}(["🟢 START: ${name}"]):::startStyle\n`;
              break;
           case "DECISION":
              code += `    ${id}{"❖ ${name}?"}:::decisionStyle\n`;
              break;
           case "DOKUMEN":
              code += `    ${id}[/"📄 ${label}"/]::docStyle\n`;
              break;
           case "END":
              code += `    ${id}(["🔴 END: ${name}"]):::endStyle\n`;
              break;
           case "PROCESS":
           default:
              code += `    ${id}["🟦 ${label}"]:::processStyle\n`;
              break;
        }
     });

     code += `\n    %% Connectors & Flow\n`;
     steps.forEach((st, idx) => {
        if (idx === steps.length - 1 && st.category !== "DECISION") return;
        const currId = `NODE_${idx + 1}`;
        const nextId = idx < steps.length - 1 ? `NODE_${idx + 2}` : `NODE_${steps.length}`;
        const cat = (st.category || st.shape || "PROCESS").toUpperCase();

        if (cat === "DECISION") {
           const yesText = clean(st.decision_yes || "Ya / Disetujui");
           const noText = clean(st.decision_no || "Tidak / Revisi");
           code += `    ${currId} -->|"${yesText}"| ${nextId}\n`;
           // Point NO branch to previous step or node 1
           const targetNo = idx > 0 ? `NODE_${idx}` : currId;
           code += `    ${currId} -.->|"${noText}"| ${targetNo}\n`;
        } else if (idx < steps.length - 1) {
           code += `    ${currId} --> ${nextId}\n`;
        }
     });

     return code;
  }

  // Parse raw text SOP lines into structured step items
  function parseInitialSteps(sop) {
     if (sop.flowchart_steps && Array.isArray(sop.flowchart_steps) && sop.flowchart_steps.length > 0) {
        return [...sop.flowchart_steps];
     }

     const rawAlur = (sop.alur_proses || "").trim();
     let rawLines = [];

     if (rawAlur) {
        rawLines = rawAlur.split(/\r?\n+/)
           .map(s => s.replace(/^(\d+[\.\)]\s*|langkah\s*\d+\s*:\s*|-\s*|\*\s*)/i, "").trim())
           .filter(Boolean);
     }

     if (rawLines.length === 0) {
        rawLines = [
           `Pengajuan formulir permohonan ${sop.judul}`,
           `Verifikasi dan kelengkapan dokumen pendukung oleh tim HRD`,
           `Apakah permohonan telah memenuhi syarat dan disetujui?`,
           `Penerbitan dokumen/surat keputusan resmi`,
           `Selesai dan pengarsipan berkas SOP`
        ];
     }

     const total = rawLines.length;

     return rawLines.map((lineText, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === total - 1;
        const isDecision = /apakah|jika|bila|setuju|sanggah|revisi|valid\?/i.test(lineText);
        const isDoc = /dokumen|formulir|berkas|laporan|surat|cetak/i.test(lineText);

        let cat = "PROCESS";
        if (isFirst) cat = "START";
        else if (isLast) cat = "END";
        else if (isDecision) cat = "DECISION";
        else if (isDoc) cat = "DOKUMEN";

        let actor = "Tim " + (sop.departemen || "HRD");
        if (/pemohon|karyawan|staf/i.test(lineText)) actor = "Pemohon (Karyawan)";
        if (/atasan|manajer|kabag|direktur/i.test(lineText)) actor = "Atasan / Manajer";

        return {
           id: "step_" + (idx + 1),
           category: cat,
           nama_aktivitas: isFirst ? `Mulai: ${lineText}` : isLast ? `Selesai: ${lineText}` : lineText,
           actor: actor,
           detail_proses: lineText,
           decision_yes: "Lanjut ke proses berikutnya",
           decision_no: "Dikembalikan ke pemohon (Revisi)"
        };
     });
  }

  async function openAutoFlowchartModal() {
     const allSOP = await fsGetAll(COL.GIMMICK_SOP);
     if (allSOP.length === 0) {
        toast("Belum ada SOP yang terdaftar. Buat SOP terlebih dahulu.", "warning");
        return;
     }

     const optSOP = allSOP.map(s => `<option value="${s.id}">${escapeHtml(s.judul)} [${escapeHtml(s.departemen)}]</option>`).join("");

     openModal({
        title: "⚡ Generator Flowchart HRD (Mermaid, Kroki.io & Draw.io)",
        size: "lg",
        bodyHtml: `
           <div class="space-y-4 text-left">
              <!-- TOP NOTICE BANNER -->
              <div class="bg-gradient-to-r from-emerald-900 to-slate-900 p-4 border border-emerald-500/30 rounded-2xl text-xs text-emerald-100 leading-relaxed flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
                 <div>
                    <strong class="text-sm block text-emerald-300 font-bold mb-0.5">Flowchart SOP HRD & Bahasa Mermaid:</strong>
                    Atur alur proses berdasarkan kategorisasi <b>START, PROCESS, DECISION, DOKUMEN, END</b>. Sistem secara otomatis menghasilkan bahasa Mermaid & me-render visual Kroki.io.
                 </div>
                 <div class="flex items-center gap-2 shrink-0">
                    <button id="btn-edit-steps" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl font-bold text-xs shadow transition flex items-center gap-1.5">
                       ⚙️ Atur Langkah & Category SOP
                    </button>
                    <button id="btn-print-fc" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl font-bold text-xs shadow transition flex items-center gap-1">
                       🖨️ Cetak / PDF
                    </button>
                 </div>
              </div>

              <!-- CONTROLS ROW -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                 <div class="md:col-span-2">
                    <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Pilih Prosedur SOP:</label>
                    <select id="auto-sop-selector" class="w-full px-3.5 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition">
                       ${optSOP}
                    </select>
                 </div>
                 <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Mode Tampilan:</label>
                    <div class="grid grid-cols-3 p-1 bg-slate-100 rounded-xl text-xs font-bold text-center">
                       <button id="view-mode-kroki" class="py-1.5 rounded-lg bg-white text-emerald-800 shadow-xs">Visual Diagram</button>
                       <button id="view-mode-mermaid" class="py-1.5 rounded-lg text-slate-600 hover:text-slate-900">Mermaid Code</button>
                       <button id="view-mode-doc" class="py-1.5 rounded-lg text-slate-600 hover:text-slate-900">Dokumen SOP</button>
                    </div>
                 </div>
              </div>

              <!-- LEGEND OF SHAPES -->
              <div class="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between gap-2 overflow-x-auto text-[10px] text-slate-300 font-medium shadow-inner">
                 <span class="font-bold text-emerald-400 uppercase tracking-wider shrink-0 mr-1">Kategori Node:</span>
                 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-900/80 border border-emerald-500/50 text-emerald-300 font-bold">🟢 START (Oval Awal)</span>
                 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 font-bold">🟦 PROCESS (Persegi)</span>
                 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/60 text-amber-300 font-bold">❖ DECISION (Belah Ketupat)</span>
                 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/60 text-cyan-300 font-bold">📄 DOKUMEN (Dokumen Output)</span>
                 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/60 text-rose-300 font-bold">🔴 END (Oval Akhir)</span>
              </div>

              <!-- MAIN RENDER CONTAINER -->
              <div id="flowchart-render-box" class="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-white min-h-[460px] shadow-inner overflow-x-auto relative">
                 <!-- Dynamically rendered visual / code / document -->
              </div>

              <!-- EXTERNAL GENERATOR TOOLS TOOLBAR -->
              <div id="external-tools-bar" class="p-3 bg-slate-100 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                 <div class="flex items-center gap-2">
                    <span class="font-extrabold text-slate-700">Integrasi Generator:</span>
                    <button id="btn-copy-mermaid" class="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold shadow-xs transition flex items-center gap-1">
                       📋 Salin Bahasa Mermaid
                    </button>
                    <button id="btn-open-drawio" class="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg font-bold shadow-xs transition flex items-center gap-1">
                       🎨 Buka di Draw.io
                    </button>
                    <button id="btn-download-svg" class="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold shadow-xs transition flex items-center gap-1">
                       📥 Unduh SVG Flowchart
                    </button>
                 </div>
                 <span class="text-[11px] text-slate-500 italic">Powered by Kroki.io & Mermaid Syntax</span>
              </div>
           </div>
        `,
        footerHtml: `
           <button id="btn-tutup-fc" class="px-5 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">Tutup Modal</button>
        `,
        onMount: (m) => {
           m.querySelector("#btn-tutup-fc").onclick = closeModal;

           const selector = m.querySelector("#auto-sop-selector");
           const renderBox = m.querySelector("#flowchart-render-box");
           const btnPrint = m.querySelector("#btn-print-fc");
           const btnEditSteps = m.querySelector("#btn-edit-steps");
           const btnViewKroki = m.querySelector("#view-mode-kroki");
           const btnViewMermaid = m.querySelector("#view-mode-mermaid");
           const btnViewDoc = m.querySelector("#view-mode-doc");

           const btnCopyMermaid = m.querySelector("#btn-copy-mermaid");
           const btnOpenDrawio = m.querySelector("#btn-open-drawio");
           const btnDownloadSvg = m.querySelector("#btn-download-svg");

           let activeMode = "KROKI"; // KROKI | MERMAID | DOC
           let currentSOP = null;
           let currentSteps = [];
           let currentMermaidCode = "";
           let currentSvgContent = "";

           async function renderUI() {
              currentSOP = allSOP.find(x => x.id === selector.value);
              if (!currentSOP) return;

              currentSteps = parseInitialSteps(currentSOP);
              currentMermaidCode = buildMermaidCode(currentSOP.judul, currentSteps);

              if (activeMode === "KROKI") {
                 await renderKrokiView();
              } else if (activeMode === "MERMAID") {
                 renderMermaidCodeView();
              } else {
                 renderDocumentView();
              }
           }

           async function renderKrokiView() {
              renderBox.innerHTML = `
                 <div class="flex flex-col items-center justify-center min-h-[400px] text-center space-y-3">
                    <div class="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <p class="text-xs font-bold text-emerald-400">Menghasilkan Flowchart SVG via Kroki.io...</p>
                    <p class="text-[11px] text-slate-400">Memproses sintaks Mermaid ke diagram alir standar HRD</p>
                 </div>
              `;

              try {
                 const res = await fetch("https://kroki.io/mermaid/svg", {
                    method: "POST",
                    headers: { "Content-Type": "text/plain" },
                    body: currentMermaidCode
                 });

                 if (res.ok) {
                    currentSvgContent = await res.text();
                    renderBox.innerHTML = `
                       <div class="max-w-4xl mx-auto space-y-4 font-sans text-left">
                          <div class="flex items-center justify-between pb-3 border-b border-slate-800">
                             <div>
                                <span class="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-bold uppercase tracking-wider">FLOWCHART DARI KROKI.IO</span>
                                <h3 class="text-lg font-black text-white mt-1">${escapeHtml(currentSOP.judul)}</h3>
                             </div>
                             <div class="text-right text-[11px] text-slate-400">
                                <span>Total Node: <b class="text-emerald-400">${currentSteps.length} Step</b></span>
                             </div>
                          </div>

                          <!-- SVG CONTAINER -->
                          <div class="p-6 bg-slate-900 rounded-2xl border border-slate-800 flex justify-center items-center overflow-x-auto shadow-2xl">
                             <div class="w-full max-w-full flex justify-center scale-100 hover:scale-[1.01] transition-transform">
                                ${currentSvgContent}
                             </div>
                          </div>
                       </div>
                    `;
                 } else {
                    throw new Error("Kroki response not OK");
                 }
              } catch (err) {
                 console.warn("Kroki API fallback to HTML renderer:", err);
                 renderHtmlFallbackDiagram();
              }
           }

           function renderHtmlFallbackDiagram() {
              let html = `
                 <div class="max-w-3xl mx-auto space-y-5 font-sans text-left">
                    <div class="text-center pb-4 border-b border-slate-800 space-y-1">
                       <span class="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-[11px] font-bold uppercase tracking-wider">FLOWCHART SOP INTERAKTIF ${escapeHtml(currentSOP.departemen)}</span>
                       <h3 class="text-xl font-black text-white mt-2">${escapeHtml(currentSOP.judul)}</h3>
                    </div>
              `;

              currentSteps.forEach((st, idx) => {
                 const isLast = idx === currentSteps.length - 1;
                 const stepNum = idx + 1;
                 const cat = (st.category || st.shape || "PROCESS").toUpperCase();

                 if (cat === "START") {
                    html += `
                       <div class="flex flex-col items-center my-2">
                          <div class="w-64 py-2.5 bg-emerald-600 text-white rounded-full text-xs font-extrabold text-center tracking-widest uppercase shadow-lg border border-emerald-400">
                             🟢 START: ${escapeHtml(st.nama_aktivitas || `Langkah ${stepNum}`)}
                          </div>
                          <div class="w-0.5 h-6 bg-emerald-500/60 my-0.5"></div>
                          <div class="text-emerald-400 text-xs font-bold">▼</div>
                       </div>
                    `;
                 } else if (cat === "DECISION") {
                    html += `
                       <div class="flex flex-col items-center my-2 relative">
                          <div class="w-96 p-4 bg-gradient-to-br from-amber-950/90 to-amber-900/70 border-2 border-amber-500/70 rounded-2xl shadow-xl">
                             <div class="flex items-center justify-between mb-1.5">
                                <span class="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-amber-500/30 text-amber-300 rounded border border-amber-500/40">❖ DECISION (Langkah ${stepNum})</span>
                                <span class="text-amber-300 text-[10px] font-bold bg-amber-900/80 px-2 py-0.5 rounded">${escapeHtml(st.actor)}</span>
                             </div>
                             <p class="text-xs font-bold text-amber-100 leading-relaxed text-center my-2">${escapeHtml(st.nama_aktivitas)}</p>
                             <p class="text-[11px] text-amber-200/80 text-center mb-2 italic">${escapeHtml(st.detail_proses)}</p>

                             <div class="grid grid-cols-2 gap-2 border-t border-amber-500/30 pt-2 text-[10px] mt-2">
                                <div class="p-1.5 bg-emerald-950/60 rounded border border-emerald-500/40 text-emerald-300 text-center font-bold">
                                   ✔ YA ➔ ${escapeHtml(st.decision_yes || "Lanjut")}
                                </div>
                                <div class="p-1.5 bg-rose-950/60 rounded border border-rose-500/40 text-rose-300 text-center font-bold">
                                   ✖ TIDAK ➔ ${escapeHtml(st.decision_no || "Revisi / Ditolak")}
                                </div>
                             </div>
                          </div>
                          <div class="w-0.5 h-6 bg-amber-500/60 my-0.5"></div>
                          <div class="text-amber-400 text-xs font-bold">▼</div>
                       </div>
                    `;
                 } else if (cat === "DOKUMEN") {
                    html += `
                       <div class="flex flex-col items-center my-2">
                          <div class="w-full bg-cyan-950/80 hover:bg-cyan-950 border-2 border-cyan-500/60 rounded-xl rounded-b-3xl p-4 shadow-lg transition">
                             <div class="flex items-start justify-between gap-3 mb-1">
                                <div class="flex items-center gap-2">
                                   <span class="w-6 h-6 rounded-lg bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 font-bold text-xs flex items-center justify-center shrink-0">📄</span>
                                   <span class="text-xs font-extrabold text-cyan-200">${escapeHtml(st.nama_aktivitas)}</span>
                                </div>
                                <span class="text-[10px] font-bold text-cyan-300 bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-700/50">${escapeHtml(st.actor)}</span>
                             </div>
                             <p class="text-xs font-semibold text-slate-100 leading-relaxed pl-8">${escapeHtml(st.detail_proses)}</p>
                          </div>
                          ${!isLast ? `
                             <div class="w-0.5 h-6 bg-cyan-500/60 my-0.5"></div>
                             <div class="text-cyan-400 text-xs font-bold">▼</div>
                          ` : ""}
                       </div>
                    `;
                 } else if (cat === "END") {
                    html += `
                       <div class="flex flex-col items-center my-2">
                          <div class="w-64 py-2.5 bg-rose-700 text-white rounded-full text-xs font-extrabold text-center tracking-widest uppercase shadow-lg border border-rose-500">
                             🔴 END: ${escapeHtml(st.nama_aktivitas || "Selesai Prosedur")}
                          </div>
                       </div>
                    `;
                 } else {
                    // PROCESS
                    html += `
                       <div class="flex flex-col items-center my-2">
                          <div class="w-full bg-slate-800/90 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-md transition">
                             <div class="flex items-start justify-between gap-3 mb-1">
                                <div class="flex items-center gap-2">
                                   <span class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center justify-center shrink-0">${stepNum}</span>
                                   <span class="text-xs font-extrabold text-slate-200">🟦 ${escapeHtml(st.nama_aktivitas)}</span>
                                </div>
                                <span class="text-[10px] font-bold text-emerald-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">${escapeHtml(st.actor)}</span>
                             </div>
                             <p class="text-xs font-semibold text-slate-100 leading-relaxed pl-8">${escapeHtml(st.detail_proses)}</p>
                          </div>
                          ${!isLast ? `
                             <div class="w-0.5 h-6 bg-slate-700 my-0.5"></div>
                             <div class="text-slate-500 text-xs font-bold">▼</div>
                          ` : ""}
                       </div>
                    `;
                 }
              });

              html += `</div>`;
              renderBox.innerHTML = html;
           }

           function renderMermaidCodeView() {
              renderBox.innerHTML = `
                 <div class="space-y-3 font-mono text-xs">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                       <span class="font-bold text-emerald-400 font-sans">Kode Bahasa Mermaid Diagram (Dapat langsung di-copy ke Kroki / Draw.io)</span>
                       <button id="btn-copy-mermaid-inner" class="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-sans font-bold text-xs">
                          📋 Salin Kode
                       </button>
                    </div>
                    <textarea id="mermaid-code-textarea" readonly class="w-full h-96 p-4 bg-slate-900 text-emerald-300 rounded-xl font-mono text-xs border border-slate-800 outline-none leading-relaxed resize-none">${escapeHtml(currentMermaidCode)}</textarea>
                 </div>
              `;

              renderBox.querySelector("#btn-copy-mermaid-inner").onclick = () => {
                 navigator.clipboard.writeText(currentMermaidCode);
                 toast("Kode Mermaid berhasil disalin!", "success");
              };
           }

           function renderDocumentView() {
              let html = `
                 <div id="printable-sop-area" class="max-w-3xl mx-auto p-8 bg-white text-slate-900 rounded-2xl shadow-xl font-sans text-xs space-y-6 text-left">
                    <!-- KOP DOKUMEN SOP -->
                    <div class="border-b-4 border-slate-900 pb-4 flex items-center justify-between">
                       <div>
                          <h2 class="text-xl font-black text-maroon-800 tracking-wider">CV. ANDELA JAYA</h2>
                          <p class="text-xs text-slate-600 font-bold mt-0.5">PROSEDUR OPERASIONAL STANDAR (STANDARD OPERATING PROCEDURE)</p>
                       </div>
                       <div class="text-right">
                          <span class="px-3 py-1 bg-maroon-100 text-maroon-900 font-extrabold text-xs rounded-lg uppercase">SOP RESMI ${escapeHtml(currentSOP.departemen)}</span>
                       </div>
                    </div>

                    <!-- METADATA SOP TABLE -->
                    <table class="w-full border-collapse border border-slate-300 text-xs">
                       <tr>
                          <td class="p-2 border border-slate-300 bg-slate-100 font-bold w-32">JUDUL PROSEDUR:</td>
                          <td class="p-2 border border-slate-300 font-extrabold text-slate-900 text-sm" colspan="3">${escapeHtml(currentSOP.judul)}</td>
                       </tr>
                       <tr>
                          <td class="p-2 border border-slate-300 bg-slate-100 font-bold">NO. DOKUMEN:</td>
                          <td class="p-2 border border-slate-300 font-mono font-bold">SOP-${escapeHtml(currentSOP.id)}</td>
                          <td class="p-2 border border-slate-300 bg-slate-100 font-bold w-28">VERSI / STATUS:</td>
                          <td class="p-2 border border-slate-300 font-bold">${escapeHtml(currentSOP.versi || "1.0")} / ${escapeHtml(currentSOP.status || "Aktif")}</td>
                       </tr>
                       <tr>
                          <td class="p-2 border border-slate-300 bg-slate-100 font-bold">DEPARTEMEN:</td>
                          <td class="p-2 border border-slate-300 font-semibold">${escapeHtml(currentSOP.departemen)}</td>
                          <td class="p-2 border border-slate-300 bg-slate-100 font-bold">RUANG LINGKUP:</td>
                          <td class="p-2 border border-slate-300">${escapeHtml(currentSOP.ruang_lingkup || "Seluruh Operasional Perusahaan")}</td>
                       </tr>
                    </table>

                    <!-- TUJUAN -->
                    <div>
                       <h4 class="font-extrabold text-slate-900 text-xs uppercase border-b-2 border-slate-200 pb-1 mb-2">1. TUJUAN PROSEDUR</h4>
                       <p class="text-slate-700 leading-relaxed">${escapeHtml(currentSOP.tujuan || `Prosedur ini disusun sebagai acuan kerja resmi dalam melaksanakan ${currentSOP.judul} di CV Andela Jaya.`)}</p>
                    </div>

                    <!-- PROSEDUR LANGKAH-LANGKAH -->
                    <div>
                       <h4 class="font-extrabold text-slate-900 text-xs uppercase border-b-2 border-slate-200 pb-1 mb-2">2. RINCIAN ALUR & KATEGORI PROCESS</h4>
                       <table class="w-full border-collapse border border-slate-300 text-xs">
                          <thead class="bg-slate-100 text-slate-700 font-bold uppercase">
                             <tr>
                                <th class="p-2 border border-slate-300 text-center w-12">No</th>
                                <th class="p-2 border border-slate-300 w-28 text-center">Kategori</th>
                                <th class="p-2 border border-slate-300 w-36">Pelaksana / Actor</th>
                                <th class="p-2 border border-slate-300">Nama Aktivitas & Detail SOP</th>
                             </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-200">
                             ${currentSteps.map((st, i) => `
                                <tr>
                                   <td class="p-2 border border-slate-300 text-center font-bold">${i + 1}</td>
                                   <td class="p-2 border border-slate-300 text-center font-bold">
                                      <span class="px-2 py-0.5 rounded text-[10px] ${st.category === 'START' ? 'bg-emerald-100 text-emerald-800' : st.category === 'DECISION' ? 'bg-amber-100 text-amber-800' : st.category === 'DOKUMEN' ? 'bg-cyan-100 text-cyan-800' : st.category === 'END' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'}">${st.category || 'PROCESS'}</span>
                                   </td>
                                   <td class="p-2 border border-slate-300 font-semibold text-slate-800">${escapeHtml(st.actor)}</td>
                                   <td class="p-2 border border-slate-300 text-slate-800 leading-relaxed">
                                      <b class="block text-slate-900">${escapeHtml(st.nama_aktivitas)}</b>
                                      <span>${escapeHtml(st.detail_proses)}</span>
                                   </td>
                                </tr>
                             `).join("")}
                          </tbody>
                       </table>
                    </div>

                    <!-- LEMBAR PENGESAHAN -->
                    <div class="pt-6 border-t border-slate-300">
                       <h4 class="font-extrabold text-slate-900 text-xs uppercase mb-4 text-center">3. LEMBAR PERSETUJUAN & PENGESAHAN HRD</h4>
                       <div class="grid grid-cols-3 gap-4 text-center">
                          <div class="p-3 border border-slate-200 rounded-xl">
                             <p class="text-[10px] text-slate-500 uppercase font-bold mb-10">Dibuat Oleh,</p>
                             <p class="font-bold text-slate-900 underline">Staf / HRD Specialist</p>
                             <p class="text-[9px] text-slate-400 mt-0.5">CV. Andela Jaya</p>
                          </div>
                          <div class="p-3 border border-slate-200 rounded-xl">
                             <p class="text-[10px] text-slate-500 uppercase font-bold mb-10">Ditinjau Oleh,</p>
                             <p class="font-bold text-slate-900 underline">HRD & Finance Manager</p>
                             <p class="text-[9px] text-slate-400 mt-0.5">CV. Andela Jaya</p>
                          </div>
                          <div class="p-3 border border-slate-200 rounded-xl">
                             <p class="text-[10px] text-slate-500 uppercase font-bold mb-10">Disetujui Oleh,</p>
                             <p class="font-bold text-slate-900 underline">Direktur Operasional</p>
                             <p class="text-[9px] text-slate-400 mt-0.5">CV. Andela Jaya</p>
                          </div>
                       </div>
                    </div>
                 </div>
              `;

              renderBox.innerHTML = html;
           }

           // Toggle view modes
           btnViewKroki.onclick = () => {
              activeMode = "KROKI";
              btnViewKroki.className = "py-1.5 rounded-lg bg-white text-emerald-800 shadow-xs";
              btnViewMermaid.className = "py-1.5 rounded-lg text-slate-600 hover:text-slate-900";
              btnViewDoc.className = "py-1.5 rounded-lg text-slate-600 hover:text-slate-900";
              renderUI();
           };

           btnViewMermaid.onclick = () => {
              activeMode = "MERMAID";
              btnViewMermaid.className = "py-1.5 rounded-lg bg-white text-emerald-800 shadow-xs";
              btnViewKroki.className = "py-1.5 rounded-lg text-slate-600 hover:text-slate-900";
              btnViewDoc.className = "py-1.5 rounded-lg text-slate-600 hover:text-slate-900";
              renderUI();
           };

           btnViewDoc.onclick = () => {
              activeMode = "DOC";
              btnViewDoc.className = "py-1.5 rounded-lg bg-white text-emerald-800 shadow-xs";
              btnViewKroki.className = "py-1.5 rounded-lg text-slate-600 hover:text-slate-900";
              btnViewMermaid.className = "py-1.5 rounded-lg text-slate-600 hover:text-slate-900";
              renderUI();
           };

           // External generator actions
           btnCopyMermaid.onclick = () => {
              navigator.clipboard.writeText(currentMermaidCode);
              toast("Bahasa Mermaid berhasil disalin ke clipboard!", "success");
           };

           btnOpenDrawio.onclick = () => {
              navigator.clipboard.writeText(currentMermaidCode);
              toast("Kode Mermaid telah disalin! Buka Draw.io -> Insert -> Advanced -> Mermaid untuk menempel.", "info");
              window.open("https://app.diagrams.net/", "_blank");
           };

           btnDownloadSvg.onclick = () => {
              if (!currentSvgContent) {
                 toast("SVG belum siap. Mengunduh kode Mermaid...", "info");
                 const blob = new Blob([currentMermaidCode], { type: "text/plain" });
                 const url = URL.createObjectURL(blob);
                 const a = document.createElement("a");
                 a.href = url;
                 a.download = `flowchart-${currentSOP.id}.mmd`;
                 a.click();
                 return;
              }
              const blob = new Blob([currentSvgContent], { type: "image/svg+xml" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `flowchart-${currentSOP.id}.svg`;
              a.click();
              toast("SVG Flowchart berhasil diunduh!", "success");
           };

           // Open Step Configurator
           btnEditSteps.onclick = () => {
              openStepsEditorModal(currentSOP, currentSteps, async (updatedSteps) => {
                 currentSteps = updatedSteps;
                 currentSOP.flowchart_steps = updatedSteps;
                 await fsUpdate(COL.GIMMICK_SOP, currentSOP.id, { flowchart_steps: updatedSteps });
                 toast("Langkah-langkah SOP berhasil diperbarui & disimpan!", "success");
                 renderUI();
              });
           };

           selector.onchange = () => renderUI();
           renderUI();

           btnPrint.onclick = () => {
              const el = m.querySelector("#printable-sop-area") || renderBox;
              if (!el) return;
              const w = window.open("", "_blank");
              w.document.write(`
                 <html>
                    <head>
                       <title>Dokumen SOP Flowchart - ${escapeHtml(currentSOP?.judul || "Andela Jaya")}</title>
                       <script src="https://cdn.tailwindcss.com"></script>
                    </head>
                    <body class="bg-white text-slate-900 p-8">
                       ${el.outerHTML}
                       <script>setTimeout(() => { window.print(); }, 800);</script>
                    </body>
                 </html>
              `);
              w.document.close();
           };
        }
     });
  }

  // Modal Step Configurator for START, PROCESS, DECISION, DOKUMEN, END
  function openStepsEditorModal(sop, existingSteps, onSave) {
     let steps = JSON.parse(JSON.stringify(existingSteps || []));

     openModal({
        title: `⚙️ Builder Langkah SOP & Category: ${sop.judul}`,
        size: "lg",
        bodyHtml: `
           <div class="space-y-4 text-left text-xs">
              <div class="bg-slate-100 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                 <p class="text-slate-600 font-medium">
                    Pilih kategori untuk setiap langkah: <b>START, PROCESS, DECISION, DOKUMEN, END</b>. Isi Nama Aktivitas dan Detail Proses SOP.
                 </p>
                 <button id="btn-add-step-item" class="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition shrink-0 flex items-center gap-1">
                    ➕ Tambah Langkah
                 </button>
              </div>

              <div id="steps-editor-list" class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                 <!-- populated dynamically -->
              </div>
           </div>
        `,
        footerHtml: `
           <div class="flex items-center justify-between w-full">
              <button id="btn-steps-cancel" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
              <button id="btn-steps-save" class="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow">Generate & Simpan Flowchart</button>
           </div>
        `,
        onMount: m => {
           const listContainer = m.querySelector("#steps-editor-list");

           function renderStepsList() {
              listContainer.innerHTML = steps.map((st, i) => {
                 const cat = (st.category || st.shape || "PROCESS").toUpperCase();

                 return `
                    <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 relative">
                       <div class="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                          <div class="flex items-center gap-2">
                             <span class="w-6 h-6 rounded-full bg-slate-900 text-emerald-400 font-extrabold text-xs flex items-center justify-center">${i + 1}</span>
                             <span class="font-extrabold text-slate-800 text-xs">Langkah Ke-${i + 1}</span>
                          </div>
                          <div class="flex items-center gap-1">
                             ${i > 0 ? `<button data-step-up="${i}" class="p-1 text-slate-500 hover:text-slate-800 text-xs font-bold" title="Naik">⬆️</button>` : ''}
                             ${i < steps.length - 1 ? `<button data-step-down="${i}" class="p-1 text-slate-500 hover:text-slate-800 text-xs font-bold" title="Turun">⬇️</button>` : ''}
                             <button data-step-del="${i}" class="p-1 text-rose-500 hover:bg-rose-100 rounded text-xs font-bold" title="Hapus">🗑️ Hapus</button>
                          </div>
                       </div>

                       <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <!-- KATEGORI STEP -->
                          <div>
                             <label class="block font-bold text-slate-700 mb-1">Kategori Process Step <span class="text-rose-500">*</span></label>
                             <select data-step-cat="${i}" class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 font-bold bg-white text-xs">
                                <option value="START" ${cat === 'START' ? 'selected' : ''}>🟢 START (Oval Awal Prosedur)</option>
                                <option value="PROCESS" ${cat === 'PROCESS' ? 'selected' : ''}>🟦 PROCESS (Persegi Utama)</option>
                                <option value="DECISION" ${cat === 'DECISION' ? 'selected' : ''}>❖ DECISION (Keputusan / Diamond)</option>
                                <option value="DOKUMEN" ${cat === 'DOKUMEN' ? 'selected' : ''}>📄 DOKUMEN (Dokumen Output / Form)</option>
                                <option value="END" ${cat === 'END' ? 'selected' : ''}>🔴 END (Oval Akhir Prosedur)</option>
                             </select>
                          </div>

                          <!-- NAMA AKTIVITAS -->
                          <div>
                             <label class="block font-bold text-slate-700 mb-1">Nama Aktivitas / Proses <span class="text-rose-500">*</span></label>
                             <input type="text" data-step-name="${i}" value="${escapeHtml(st.nama_aktivitas || st.title || '')}" placeholder="Cth: Verifikasi Berkas Karyawan" class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 font-bold bg-white text-xs">
                          </div>

                          <!-- PELAKSANA / ACTOR -->
                          <div>
                             <label class="block font-bold text-slate-700 mb-1">Pelaksana / Actor (PIC)</label>
                             <input type="text" data-step-actor="${i}" value="${escapeHtml(st.actor || '')}" placeholder="Cth: Staf HRD, Supervisor, Pemohon" class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 font-semibold bg-white text-xs">
                          </div>
                       </div>

                       <!-- DETAIL PROSES SOP -->
                       <div>
                          <label class="block font-bold text-slate-700 mb-1">Detail Proses SOP (Instruksi Kerja)</label>
                          <textarea data-step-detail="${i}" rows="2" placeholder="Tuliskan rincian instruksi kerja atau penjelasan prosedur untuk langkah ini..." class="w-full p-2 rounded-xl border border-slate-300 outline-none focus:border-emerald-500 bg-white text-xs">${escapeHtml(st.detail_proses || st.description || '')}</textarea>
                       </div>

                       <!-- CABANG JIKA DECISION -->
                       ${cat === 'DECISION' ? `
                          <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                             <div>
                                <label class="block font-bold text-emerald-800 mb-1">✔ Cabang YA / DISETUJUI</label>
                                <input type="text" data-step-yes="${i}" value="${escapeHtml(st.decision_yes || '')}" placeholder="Cth: Lanjut ke penerbitan surat" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
                             </div>
                             <div>
                                <label class="block font-bold text-rose-800 mb-1">✖ Cabang TIDAK / DITOLAK</label>
                                <input type="text" data-step-no="${i}" value="${escapeHtml(st.decision_no || '')}" placeholder="Cth: Dikembalikan ke pemohon" class="w-full p-2 rounded-lg border border-slate-300 outline-none bg-white">
                             </div>
                          </div>
                       ` : ''}
                    </div>
                 `;
              }).join("");

              // Event Binds
              listContainer.querySelectorAll("[data-step-cat]").forEach(el => {
                 el.onchange = () => {
                    const idx = parseInt(el.dataset.stepCat);
                    steps[idx].category = el.value;
                    steps[idx].shape = el.value;
                    renderStepsList();
                 };
              });
              listContainer.querySelectorAll("[data-step-name]").forEach(el => {
                 el.oninput = () => { steps[parseInt(el.dataset.stepName)].nama_aktivitas = el.value; };
              });
              listContainer.querySelectorAll("[data-step-actor]").forEach(el => {
                 el.oninput = () => { steps[parseInt(el.dataset.stepActor)].actor = el.value; };
              });
              listContainer.querySelectorAll("[data-step-detail]").forEach(el => {
                 el.oninput = () => { steps[parseInt(el.dataset.stepDetail)].detail_proses = el.value; };
              });
              listContainer.querySelectorAll("[data-step-yes]").forEach(el => {
                 el.oninput = () => { steps[parseInt(el.dataset.stepYes)].decision_yes = el.value; };
              });
              listContainer.querySelectorAll("[data-step-no]").forEach(el => {
                 el.oninput = () => { steps[parseInt(el.dataset.stepNo)].decision_no = el.value; };
              });

              listContainer.querySelectorAll("[data-step-del]").forEach(btn => {
                 btn.onclick = () => {
                    steps.splice(parseInt(btn.dataset.stepDel), 1);
                    renderStepsList();
                 };
              });
              listContainer.querySelectorAll("[data-step-up]").forEach(btn => {
                 btn.onclick = () => {
                    const idx = parseInt(btn.dataset.stepUp);
                    const temp = steps[idx]; steps[idx] = steps[idx - 1]; steps[idx - 1] = temp;
                    renderStepsList();
                 };
              });
              listContainer.querySelectorAll("[data-step-down]").forEach(btn => {
                 btn.onclick = () => {
                    const idx = parseInt(btn.dataset.stepDown);
                    const temp = steps[idx]; steps[idx] = steps[idx + 1]; steps[idx + 1] = temp;
                    renderStepsList();
                 };
              });
           }

           m.querySelector("#btn-add-step-item").onclick = () => {
              steps.push({
                 id: "step_" + (steps.length + 1),
                 category: "PROCESS",
                 nama_aktivitas: "Aktivitas Prosedur Baru",
                 actor: "Tim " + (sop.departemen || "HRD"),
                 detail_proses: "Tuliskan deskripsi detail prosedur kerja di sini...",
                 decision_yes: "Lanjut ke proses berikutnya",
                 decision_no: "Dikembalikan (Revisi)"
              });
              renderStepsList();
           };

           renderStepsList();

           m.querySelector("#btn-steps-cancel").onclick = closeModal;
           m.querySelector("#btn-steps-save").onclick = () => {
              closeModal();
              if (onSave) onSave(steps);
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
