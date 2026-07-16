import { COL } from "../firebase-config.js";
import { fsGetAll, openModal, closeModal, toast } from "../utils.js";
import { renderCrudModule, emptyState } from "../components.js";
import { callGeminiJSON } from "../ai-config.js"; // Import AI yang benar

function escapeHtml(unsafe) {
    return (unsafe || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

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
        { name: "departemen", label: "Departemen Terkait", type: "select", options: ["HRD", "GA", "FINANCE", "MARKETING", "OPERASIONAL", "ALL"] },
        { name: "versi", label: "Versi", type: "text", default: "v1.0" },
        { name: "status", label: "Status", type: "select", options: ["Aktif", "Draft", "Revisi", "Usang"] },
        { name: "file_url", label: "Link G-Drive Dokumen Resmi", type: "text", full: true },
        { name: "alur_proses", label: "Catatan Alur Proses (Teks Mentah)", type: "textarea", full: true },
      ],
      customActions: (row) => `<button type="button" data-ai-sop="${row.id}" class="text-emerald-700 hover:underline font-medium ml-3 text-xs flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15 8L22 9L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9L9 8L12 2Z"/></svg> Generate AI</button>`
    });

    const tbody = panelSOP.querySelector("tbody");
    if (tbody) {
      tbody.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-ai-sop]");
        if (!btn) return;
        const sops = await fsGetAll(COL.GIMMICK_SOP);
        const targetSOP = sops.find(s => s.id === btn.dataset.aiSop);
        if (!targetSOP || !targetSOP.alur_proses) {
            toast("Harap isi Catatan Alur Proses (Teks Mentah) terlebih dahulu sebelum generate AI.", "warning");
            return;
        }

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner border-emerald-700"></span> <span class="text-slate-500">Membaca SOP & Menyusun Data...</span>`;

        try {
            const prompt = `Anda adalah ahli pembuat SOP perusahaan. Baca teks alur proses ini: "${targetSOP.alur_proses}". Ubah teks tersebut menjadi langkah-langkah prosedural yang terstruktur rapi. Kembalikan respon murni dalam format JSON array (TANPA backtick markdown \`\`\`json) dengan struktur: [{"step_no": 1, "tindakan": "Deskripsi", "pic": "Siapa yang melakukan"}]. Jangan ada teks lain selain JSON.`;
            const aiData = await callGeminiJSON(prompt);

            if (aiData && aiData.length) {
                const htmlSteps = aiData.map(st => `
                   <div class="mb-3 border-l-2 border-emerald-500 pl-3">
                      <p class="text-xs font-bold text-emerald-800">Langkah ${st.step_no} (PIC: ${st.pic})</p>
                      <p class="text-sm text-slate-700 mt-1">${st.tindakan}</p>
                   </div>
                `).join("");

                openModal({
                    title: "Draft AI Prosedur SOP",
                    size: "md",
                    bodyHtml: `
                      <div class="mb-4 bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex items-start gap-2">
                         <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15 8L22 9L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9L9 8L12 2Z"/></svg>
                         <p class="text-xs text-emerald-800">SOP berikut di-generate otomatis oleh AI berdasarkan catatan mentah Anda. Silakan salin (Copy) hasil ini ke dokumen resmi.</p>
                      </div>
                      <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl max-h-96 overflow-y-auto" id="ai-sop-content">
                         <h3 class="font-bold text-slate-800 text-lg mb-4 text-center underline uppercase">${escapeHtml(targetSOP.judul)}</h3>
                         ${htmlSteps}
                      </div>
                    `,
                    footerHtml: `<button class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm" onclick="navigator.clipboard.writeText(document.getElementById('ai-sop-content').innerText); alert('Teks SOP disalin!');">Copy Teks</button>`
                });
            } else {
                toast("AI gagal mengenali struktur SOP.", "error");
            }
        } catch (err) {
            toast(err.message, "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
      });
    }
  }

  container.querySelectorAll(".gs-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.gtab;
      panelGimmick.classList.toggle("hidden", tab !== "gimmick");
      panelSOP.classList.toggle("hidden", tab !== "sop");
      container.querySelectorAll(".gs-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      if (tab === "gimmick" && !loaded.gimmick) { loadGimmick(); loaded.gimmick = true; }
      if (tab === "sop" && !loaded.sop) { loadSOP(); loaded.sop = true; }
    });
  });

  // Load default tab
  loadSOP(); loaded.sop = true;

  return { unmount() {} };
}
