import { COL } from "../firebase-config.js";
import { fsGetAll, openModal, closeModal, toast } from "../utils.js";
import { renderCrudModule, emptyState } from "../components.js";

// Fungsi pelindung teks bawaan (Bulletproof)
function escapeHtml(unsafe) {
    return (unsafe || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// KUNCI API AI GEMINI
const GEMINI_API_KEY = "AQ." + "Ab8RN6Kc20rPvvEi-hFtL4XTyLUVN40Lgt1jB5fiz9LKZrANXg";

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
      extraToolbarHtml: `<button id="btn-generate-flowchart" class="p-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm flex items-center gap-1.5">✨ AI Flowchart Generator</button>`
    });

    const btnGen = container.querySelector("#btn-generate-flowchart");
    if (btnGen) {
       btnGen.addEventListener("click", openAIFlowchartModal);
    }
  }

  // FITUR AI FLOWCHART GENERATOR
  async function openAIFlowchartModal() {
     const allSOP = await fsGetAll(COL.GIMMICK_SOP);
     const validSOP = allSOP.filter(s => s.alur_proses && s.alur_proses.length > 10);

     if (validSOP.length === 0) {
        toast("Belum ada SOP yang memiliki Alur Proses yang cukup panjang untuk digenerate.", "warning");
        return;
     }

     const optSOP = validSOP.map(s => `<option value="${s.id}">${escapeHtml(s.judul)}</option>`).join("");

     openModal({
        title: "✨ AI Flowchart Generator",
        size: "lg",
        bodyHtml: `
           <div class="bg-blue-50 p-4 border border-blue-200 rounded-xl mb-4 text-sm text-blue-800">
              Pilih SOP di bawah ini. AI Gemini akan membaca teks <b>Alur Proses</b> yang Anda ketikkan sebelumnya dan menyulapnya menjadi <b>Diagram Visual (Flowchart)</b> yang rapi secara otomatis.
           </div>
           <label class="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Pilih SOP yang ingin digambar:</label>
           <select id="sop-selector" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 mb-4">
              ${optSOP}
           </select>
           <div id="flowchart-result" class="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl min-h-[200px] flex flex-col items-center justify-center">
              <span class="text-slate-400 text-sm">Flowchart akan muncul di sini...</span>
           </div>
        `,
        footerHtml: `
           <button id="btn-tutup-ai" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>
           <button id="btn-proses-ai" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow transition flex items-center gap-2">Generate Flowchart</button>
        `,
        onMount: (m) => {
           m.querySelector("#btn-tutup-ai").onclick = closeModal;
           m.querySelector("#btn-proses-ai").onclick = async () => {
              
              const btn = m.querySelector("#btn-proses-ai");
              const resultEl = m.querySelector("#flowchart-result");
              const selectedId = m.querySelector("#sop-selector").value;
              const targetSOP = validSOP.find(s => s.id === selectedId);

              btn.disabled = true;
              btn.textContent = "AI Sedang Berpikir...";
              resultEl.innerHTML = `<span class="animate-pulse text-blue-600 font-medium">✨ Membaca teks SOP dan menghubungkan ke Google...</span>`;

              try {
                  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
                  
                  const prompt = `Anda adalah ahli pembuat SOP perusahaan. Baca teks alur proses ini: "${targetSOP.alur_proses}".
                  Ubah teks tersebut menjadi langkah-langkah prosedural yang terstruktur rapi.
                  Kembalikan respon murni dalam format JSON array (TANPA backtick markdown \`\`\`json) seperti contoh ini:
                  [
                    { "step": 1, "actor": "Nama Jabatan/Pelaku", "action": "Judul Tindakan Singkat", "detail": "Penjelasan detail" }
                  ]`;

                  const response = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                  });

                  if (!response.ok) {
                      const errData = await response.json();
                      throw new Error(errData.error?.message || \`HTTP Error \${response.status}\`);
                  }

                  const data = await response.json();
                  let textResponse = data.candidates[0].content.parts[0].text;
                  textResponse = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
                  
                  const stepsArray = JSON.parse(textResponse);

                  let flowchartHtml = `<h2 class="font-bold text-lg text-slate-800 mb-6 text-center border-b pb-2 w-full uppercase">${escapeHtml(targetSOP.judul)}</h2><div class="flex flex-col items-center w-full max-w-lg mx-auto">`;
                  
                  stepsArray.forEach((s, index) => {
                      flowchartHtml += `
                         <div class="w-full bg-white border-2 border-blue-500 rounded-xl p-4 shadow-sm text-center relative">
                            <span class="absolute -top-3 -left-3 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold border-2 border-white shadow">${s.step}</span>
                            <p class="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">${escapeHtml(s.actor)}</p>
                            <p class="font-bold text-slate-800 text-sm mb-2">${escapeHtml(s.action)}</p>
                            <p class="text-xs text-slate-500 leading-relaxed">${escapeHtml(s.detail)}</p>
                         </div>
                      `;
                      if (index < stepsArray.length - 1) {
                         flowchartHtml += `
                            <div class="flex flex-col items-center my-1">
                               <div class="w-1 h-6 bg-blue-300"></div>
                               <div class="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-blue-500"></div>
                            </div>
                         `;
                      }
                  });

                  flowchartHtml += `</div>`;
                  resultEl.innerHTML = flowchartHtml;
                  resultEl.classList.replace("bg-slate-50", "bg-white");

              } catch(e) {
                  console.error("AI Error Detail:", e);
                  resultEl.innerHTML = `
                    <div class="bg-red-50 border border-red-200 p-4 rounded-xl text-left w-full">
                       <p class="text-red-800 font-bold mb-1">🚨 Gagal Memproses AI</p>
                       <p class="text-xs text-red-700 font-mono mb-3 bg-white p-2 rounded border border-red-100">${escapeHtml(e.message)}</p>
                    </div>
                  `;
              }

              btn.disabled = false;
              btn.textContent = "Generate Ulang";
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
