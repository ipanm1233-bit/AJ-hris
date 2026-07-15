import { db, COL, collection, onSnapshot, doc, updateDoc, storage, ref, uploadBytes, getDownloadURL } from "../firebase-config.js";
import { fsAdd, fsUpdate, openModal, closeModal, toast, escapeHtml, genId, fmtDateShort } from "../utils.js";
import { avatar, emptyState, badge, icon } from "../components.js";

const KANBAN_STAGES = [
  { id: "Applied", label: "Pelamar Baru (Applied)" },
  { id: "Screening", label: "Screening & AI" },
  { id: "Interview", label: "Interview" },
  { id: "Offered", label: "Offering / PKWT" },
  { id: "Rejected", label: "Ditolak (Rejected)" }
];

export async function mount(container, { session }) {
  container.innerHTML = `
    <div class="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Rekrutmen & ATS (AI-Powered)</h1>
          <p class="text-sm text-slate-500 mt-1">Sistem pelacakan pelamar kerja. Tarik dan lepas (Drag & Drop) kartu untuk memindahkan status.</p>
        </div>
        <button id="ats-new" class="flex items-center gap-1.5 bg-maroon-700 hover:bg-maroon-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Tambah Kandidat
        </button>
      </div>
      <div id="ats-kanban-board" class="flex gap-4 overflow-x-auto pb-4 items-start min-h-[600px]"></div>
    </div>
  `;

  const boardEl = container.querySelector("#ats-kanban-board");
  let unsubscribe = null;
  let allCandidates = [];

  function renderKanban() {
    boardEl.innerHTML = KANBAN_STAGES.map(stage => `
      <div class="flex-shrink-0 w-80 bg-slate-100/50 border border-slate-200 rounded-2xl flex flex-col max-h-[75vh]" data-stage="${stage.id}">
        <div class="p-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-100 rounded-t-2xl">
          <h3 class="font-bold text-slate-700 text-sm tracking-wide">${stage.label}</h3>
          <span class="bg-white text-slate-600 text-xs px-2 py-0.5 rounded-full shadow-sm font-bold">${allCandidates.filter(c => c.status === stage.id).length}</span>
        </div>
        <div class="p-3 flex-1 overflow-y-auto space-y-3 kanban-dropzone min-h-[100px]" data-dropzone="${stage.id}">
          ${allCandidates.filter(c => c.status === stage.id).map(c => {
            const aiScore = c.ai_score;
            let aiBadge = "";
            if (aiScore !== undefined) {
               const color = aiScore >= 80 ? "text-emerald-700 bg-emerald-100 border-emerald-200" : aiScore >= 60 ? "text-amber-700 bg-amber-100 border-amber-200" : "text-red-700 bg-red-100 border-red-200";
               aiBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border ${color}">✨ AI Match: ${aiScore}%</span>`;
            } else if (c.cv_url) {
               aiBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border text-blue-700 bg-blue-100 border-blue-200 animate-pulse">⚙️ Sedang dianalisa AI...</span>`;
            }

            return `
            <div draggable="true" data-kandidat-id="${c.id}" class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm cursor-grab hover:border-maroon-300 hover:shadow-md transition">
              <div class="flex justify-between items-start mb-2">
                <p class="text-sm font-bold text-slate-800">${escapeHtml(c.nama)}</p>
                <span class="text-[10px] text-slate-400 font-medium">${fmtDateShort(c.tanggal_lamar)}</span>
              </div>
              <p class="text-xs text-slate-500 font-medium mb-3">${escapeHtml(c.posisi_dilamar)}</p>
              <div class="flex justify-between items-center">
                 ${aiBadge}
                 <button type="button" class="text-[10px] text-maroon-700 font-bold hover:underline">Detail</button>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
    `).join("");

    // WIRING DRAG AND DROP LOKAL
    boardEl.querySelectorAll("[draggable]").forEach(card => {
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", card.dataset.kandidatId);
        card.classList.add("opacity-50");
      });
      card.addEventListener("dragend", () => card.classList.remove("opacity-50"));
      card.addEventListener("click", () => openDetailModal(allCandidates.find(x => x.id === card.dataset.kandidatId)));
    });

    boardEl.querySelectorAll(".kanban-dropzone").forEach(zone => {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("bg-maroon-50/50"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("bg-maroon-50/50"));
      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.classList.remove("bg-maroon-50/50");
        const kandidatId = e.dataTransfer.getData("text/plain");
        const newStatus = zone.dataset.dropzone;
        const kandidat = allCandidates.find(c => c.id === kandidatId);
        
        if (kandidat && kandidat.status !== newStatus) {
           kandidat.status = newStatus; // Update UI langsung biar smooth
           renderKanban(); 
           try { await updateDoc(doc(db, COL.REKRUTMEN_PELAMAR, kandidatId), { status: newStatus }); } 
           catch (err) { toast("Gagal memindah status", "error"); }
        }
      });
    });
  }

  // Listener Real-time Firestore untuk ATS
  unsubscribe = onSnapshot(collection(db, COL.REKRUTMEN_PELAMAR), (snap) => {
    allCandidates = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.tanggal_lamar) - new Date(a.tanggal_lamar));
    renderKanban();
  });

  // MODAL TAMBAH PELAMAR & UPLOAD CV
  container.querySelector("#ats-new").addEventListener("click", () => {
    openModal({
      title: "Tambah Kandidat & Upload CV",
      size: "md",
      bodyHtml: `
        <form id="form-ats-add" class="space-y-4">
          <div class="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-2">
             <p class="text-xs text-blue-800 font-medium leading-relaxed">✨ Setelah CV berformat PDF diunggah, <b>AI Engine (Gemini)</b> akan berjalan di latar belakang untuk menganalisa kecocokan kandidat secara otomatis.</p>
          </div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1">Nama Kandidat</label><input type="text" id="ats-nama" required class="w-full px-3 py-2 text-sm border rounded outline-none focus:border-maroon-400"></div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1">Posisi yang Dilamar</label><input type="text" id="ats-posisi" placeholder="Cth: Sales Staff, Admin" required class="w-full px-3 py-2 text-sm border rounded outline-none focus:border-maroon-400"></div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1">Kualifikasi Target (Instruksi untuk AI)</label><textarea id="ats-kualifikasi" rows="2" placeholder="Contoh: Minimal S1, pengalaman 2 tahun, menguasai Excel." required class="w-full px-3 py-2 text-sm border rounded outline-none focus:border-maroon-400"></textarea></div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1">File CV (Wajib PDF)</label><input type="file" id="ats-cv-file" accept="application/pdf" required class="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"></div>
        </form>
      `,
      footerHtml: `
        <button id="btn-ats-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-ats-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 text-sm font-bold rounded-lg shadow transition">Simpan & Analisa AI</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-ats-batal").onclick = closeModal;
        m.querySelector("#btn-ats-simpan").onclick = async () => {
           const form = m.querySelector("#form-ats-add");
           if(!form.reportValidity()) return;
           const btn = m.querySelector("#btn-ats-simpan");
           btn.disabled = true; btn.textContent = "Mengunggah Data...";

           try {
              const kandidatId = genId("ATSC");
              const posisi = m.querySelector("#ats-posisi").value.trim();
              const kualifikasi = m.querySelector("#ats-kualifikasi").value.trim();
              const fileInput = m.querySelector("#ats-cv-file").files[0];

              // 1. Upload File ke Storage
              let cv_url = null;
              if (fileInput) {
                  btn.textContent = "Mengunggah File PDF...";
                  const storageRef = ref(storage, `cv_pelamar/${kandidatId}_${fileInput.name.replace(/[^a-zA-Z0-9.]/g, "")}`);
                  const metadata = { customMetadata: { pelamar_id: kandidatId, posisi_dilamar: posisi, kualifikasi: kualifikasi } };
                  await uploadBytes(storageRef, fileInput, metadata);
                  cv_url = await getDownloadURL(storageRef);
              }

              // 2. Simpan Database Firestore
              btn.textContent = "Menyimpan ke Database...";
              await fsAdd(COL.REKRUTMEN_PELAMAR, {
                  nama: m.querySelector("#ats-nama").value.trim(),
                  posisi_dilamar: posisi,
                  sumber: "Portal HRIS",
                  status: "Applied",
                  tanggal_lamar: new Date().toISOString(),
                  cv_url: cv_url,
                  kualifikasi_target: kualifikasi
              }, kandidatId);

              toast("Kandidat berhasil ditambahkan. AI sedang memproses CV...", "success");
              closeModal();
           } catch(e) {
              toast("Gagal menyimpan: " + e.message, "error");
              btn.disabled = false; btn.textContent = "Simpan & Analisa AI";
           }
        };
      }
    });
  });

  // MODAL DETAIL & HASIL AI
  function openDetailModal(c) {
    if(!c) return;
    const aiData = c.ai_analisis || null;

    let aiHtml = `<div class="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center"><span class="animate-pulse text-slate-500 font-medium">⚙️ AI sedang membaca dan menganalisa CV...</span><p class="text-[11px] text-slate-400 mt-2">Kartu ini akan otomatis ter-update saat proses selesai.</p></div>`;
    
    if (aiData) {
       aiHtml = `
         <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4">
            <div class="flex justify-between items-start mb-3 border-b border-emerald-100 pb-3">
               <h3 class="font-bold text-emerald-900 flex items-center gap-1">✨ Hasil Analisa AI Gemini</h3>
               <div class="text-right">
                 <p class="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Skor Kecocokan</p>
                 <p class="text-3xl font-black text-emerald-700">${c.ai_score}%</p>
               </div>
            </div>
            <div class="space-y-3 text-sm">
               <div>
                 <span class="font-bold text-emerald-800 text-xs uppercase block mb-1">👍 Kelebihan & Kesesuaian</span>
                 <p class="text-emerald-900 leading-relaxed">${escapeHtml(aiData.kelebihan || "-")}</p>
               </div>
               <div>
                 <span class="font-bold text-red-800 text-xs uppercase block mb-1">⚠️ Kekurangan / Gap</span>
                 <p class="text-red-900 leading-relaxed">${escapeHtml(aiData.kekurangan_gap || "-")}</p>
               </div>
               <div class="pt-3 border-t border-emerald-200/50">
                 <span class="font-bold text-slate-800 text-xs uppercase block mb-1">💡 Kesimpulan & Rekomendasi</span>
                 <p class="text-slate-700 font-medium">${escapeHtml(aiData.kesimpulan_rekomendasi || "-")}</p>
               </div>
            </div>
         </div>
       `;
    }

    openModal({
       title: "Profil Kandidat",
       size: "lg",
       bodyHtml: `
         <div class="flex items-start justify-between mb-5">
            <div>
               <h2 class="text-xl font-bold text-slate-800">${escapeHtml(c.nama)}</h2>
               <p class="text-slate-500 font-medium">${escapeHtml(c.posisi_dilamar)}</p>
               <p class="text-[11px] text-slate-400 mt-1">Lamar Tgl: ${fmtDateShort(c.tanggal_lamar)}</p>
            </div>
            ${c.cv_url ? `<a href="${c.cv_url}" target="_blank" class="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded shadow transition">📥 Download CV Asli</a>` : ''}
         </div>
         ${aiHtml}
       `,
       footerHtml: `<button id="btn-tutup-kandidat" class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition">Tutup Detail</button>`,
       onMount: m => m.querySelector("#btn-tutup-kandidat").onclick = closeModal
    });
  }

  return { unmount() { if (unsubscribe) unsubscribe(); } };
}
