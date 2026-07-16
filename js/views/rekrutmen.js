import { db, COL, doc, updateDoc, deleteDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, openModal, closeModal, toast, genId, escapeHtml, fmtDateShort } from "../utils.js";
import { renderKanban, icon, emptyState } from "../components.js";
import { callGeminiJSON } from "../ai-config.js"; // Import AI yang benar

export async function mount(container) {
  const KANBAN_COLS = [
    { key: "Applied", label: "Pelamar Baru" },
    { key: "Interview", label: "Tahap Interview" },
    { key: "Offering", label: "Offering (Penawaran)" },
    { key: "Hired", label: "Diterima (Hired)" },
    { key: "Rejected", label: "Ditolak" }
  ];

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Rekrutmen (ATS)</h1>
          <p class="text-sm text-slate-500 mt-1">Sistem pelacakan pelamar kerja digital. Seret kartu antar kolom untuk mengubah status.</p>
        </div>
        <button id="ats-new" class="flex items-center gap-1.5 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition shadow-sm">
          ${icon("user-plus", "w-4 h-4")} Tambah Pelamar
        </button>
      </div>
      <div id="ats-kanban" class="min-h-[500px] w-full"></div>
    </div>
  `;

  const kanbanEl = container.querySelector("#ats-kanban");
  let allPelamar = [];

  async function loadData() {
    kanbanEl.innerHTML = `<div class="p-10 text-center text-slate-400 animate-pulse">Memuat data pelamar...</div>`;
    try {
      allPelamar = await fsGetAll(COL.REKRUTMEN_PELAMAR);
      const items = allPelamar.map(p => ({
        id: p.id,
        title: p.nama || "Tanpa Nama",
        subtitle: `${p.posisi_dilamar || "-"} • ${p.sumber || "-"}`,
        status: p.status || "Applied",
        data: p
      }));

      renderKanban(kanbanEl, {
        columns: KANBAN_COLS,
        items: items,
        onCardClick: (item) => openDetailModal(item.data),
        onDrop: async (cardId, newStatus) => {
           try {
             await updateDoc(doc(db, COL.REKRUTMEN_PELAMAR, cardId), { status: newStatus });
             toast(`Status dipindahkan ke ${newStatus}`, "success");
             loadData();
           } catch(e) {
             toast("Gagal mengubah status: " + e.message, "error");
             loadData(); // revert UI
           }
        }
      });
    } catch(e) {
      kanbanEl.innerHTML = emptyState("Gagal memuat data ATS: " + e.message);
    }
  }

  function openDetailModal(p) {
    openModal({
      title: "Detail Pelamar",
      size: "md",
      bodyHtml: `
        <div class="space-y-4">
           <div class="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                 <p class="text-lg font-bold text-slate-800">${escapeHtml(p.nama)}</p>
                 <p class="text-sm text-slate-500">${escapeHtml(p.posisi_dilamar)}</p>
              </div>
              <span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase">${escapeHtml(p.status)}</span>
           </div>
           <div class="grid grid-cols-2 gap-4 text-sm">
              <div><span class="block text-xs text-slate-400">Tanggal Melamar</span> <span class="font-medium text-slate-700">${fmtDateShort(p.tanggal_lamar)}</span></div>
              <div><span class="block text-xs text-slate-400">Sumber Info</span> <span class="font-medium text-slate-700">${escapeHtml(p.sumber || "-")}</span></div>
              <div class="col-span-2"><span class="block text-xs text-slate-400">No HP / Kontak</span> <span class="font-medium text-slate-700">${escapeHtml(p.kontak || "-")}</span></div>
              <div class="col-span-2">
                 <span class="block text-xs text-slate-400 mb-1">Catatan HRD / Review</span> 
                 <div class="p-3 bg-slate-50 rounded-lg border border-slate-100 text-slate-600 whitespace-pre-wrap">${escapeHtml(p.catatan || "Tidak ada catatan.")}</div>
              </div>
           </div>
        </div>
      `,
      footerHtml: `
        <button id="btn-del-pelamar" class="px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition mr-auto">Hapus Data</button>
        <button id="btn-close-pelamar" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>
      `,
      onMount: (m) => {
         m.querySelector("#btn-close-pelamar").onclick = closeModal;
         m.querySelector("#btn-del-pelamar").onclick = async () => {
            if(confirm("Hapus data pelamar ini permanen?")) {
               await deleteDoc(doc(db, COL.REKRUTMEN_PELAMAR, p.id));
               toast("Data dihapus", "success");
               closeModal();
               loadData();
            }
         };
      }
    });
  }

  container.querySelector("#ats-new").onclick = () => {
    openModal({
      title: "Tambah Pelamar Baru",
      size: "lg",
      bodyHtml: `
        <form id="form-ats" class="space-y-4">
           <div class="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-4">
              <p class="text-xs text-blue-800 font-bold mb-1 flex items-center gap-1">${icon("star", "w-4 h-4")} Asisten AI Pengekstrak CV</p>
              <p class="text-[11px] text-blue-700 mb-2">Tempel (Paste) teks mentah dari CV pelamar di bawah ini. AI akan otomatis mengisi kolom formulir secara pintar.</p>
              <textarea id="ai-cv-text" rows="3" class="w-full text-xs p-2 rounded border border-blue-300 outline-none" placeholder="Paste teks CV di sini..."></textarea>
              <button type="button" id="btn-ai-parse" class="mt-2 bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow transition hover:bg-blue-700">Ekstrak dengan AI</button>
           </div>
           
           <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2 sm:col-span-1">
                 <label class="block text-xs font-medium text-slate-500 mb-1">Nama Lengkap</label>
                 <input type="text" id="ats-nama" required class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
              </div>
              <div class="col-span-2 sm:col-span-1">
                 <label class="block text-xs font-medium text-slate-500 mb-1">Posisi Dilamar</label>
                 <input type="text" id="ats-posisi" required class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
              </div>
              <div class="col-span-2 sm:col-span-1">
                 <label class="block text-xs font-medium text-slate-500 mb-1">No HP / Email</label>
                 <input type="text" id="ats-kontak" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
              </div>
              <div class="col-span-2 sm:col-span-1">
                 <label class="block text-xs font-medium text-slate-500 mb-1">Sumber Info / Referensi</label>
                 <input type="text" id="ats-sumber" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Jobstreet, LinkedIn, dll">
              </div>
              <div class="col-span-2">
                 <label class="block text-xs font-medium text-slate-500 mb-1">Catatan / Summary</label>
                 <textarea id="ats-catatan" rows="3" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400"></textarea>
              </div>
           </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-ats" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-ats" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-medium shadow transition">Simpan Pelamar</button>
      `,
      onMount: (m) => {
         const btnAi = m.querySelector("#btn-ai-parse");
         btnAi.onclick = async () => {
             const txt = m.querySelector("#ai-cv-text").value.trim();
             if(!txt) return toast("Tempel teks CV terlebih dahulu!", "warning");
             
             btnAi.disabled = true; btnAi.textContent = "AI Sedang Menganalisa...";
             try {
                 const prompt = `Ekstrak informasi berikut dari teks CV ini: "${txt}". Kembalikan dalam format JSON murni TANPA markdown backtick dengan keys: "nama" (string), "posisi" (string, tebak jika tidak ada), "kontak" (string email/no hp), "sumber" (string, beri "Tidak diketahui" jika tidak ada), "summary" (string ringkasan keahlian singkat max 2 kalimat).`;
                 const result = await callGeminiJSON(prompt);
                 
                 if(result) {
                     m.querySelector("#ats-nama").value = result.nama || "";
                     m.querySelector("#ats-posisi").value = result.posisi || "";
                     m.querySelector("#ats-kontak").value = result.kontak || "";
                     m.querySelector("#ats-sumber").value = result.sumber || "";
                     m.querySelector("#ats-catatan").value = result.summary || "";
                     toast("AI berhasil mengekstrak data!", "success");
                 }
             } catch(e) {
                 toast("Gagal mengekstrak AI: " + e.message, "error");
             }
             btnAi.disabled = false; btnAi.textContent = "Ekstrak dengan AI";
         };

         m.querySelector("#btn-cancel-ats").onclick = closeModal;
         m.querySelector("#btn-save-ats").onclick = async () => {
             const form = m.querySelector("#form-ats");
             if(!form.reportValidity()) return;
             
             const btn = m.querySelector("#btn-save-ats");
             btn.disabled = true; btn.textContent = "Menyimpan...";
             
             const payload = {
                 nama: m.querySelector("#ats-nama").value.trim(),
                 posisi_dilamar: m.querySelector("#ats-posisi").value.trim(),
                 kontak: m.querySelector("#ats-kontak").value.trim(),
                 sumber: m.querySelector("#ats-sumber").value.trim(),
                 catatan: m.querySelector("#ats-catatan").value.trim(),
                 status: "Applied",
                 tanggal_lamar: new Date().toISOString()
             };
             
             try {
                 await fsAdd(COL.REKRUTMEN_PELAMAR, payload, genId("APP"));
                 toast("Pelamar berhasil ditambahkan", "success");
                 closeModal();
                 loadData();
             } catch(e) {
                 toast(e.message, "error");
                 btn.disabled = false; btn.textContent = "Simpan Pelamar";
             }
         };
      }
    });
  };

  loadData();
  return { unmount() {} };
}
