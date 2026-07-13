import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, openModal, closeModal, toast, genId, fmtDateShort, escapeHtml } from "../utils.js";
import { renderKanban } from "../components.js";

const COLUMNS = [
  { key: "Applied", label: "Lamaran Masuk" },
  { key: "Screening", label: "Screening" },
  { key: "Interview", label: "Interview" },
  { key: "Offer", label: "Penawaran" },
  { key: "Hired", label: "Diterima" },
  { key: "Rejected", label: "Ditolak" },
];

export async function mount(container) {
  const kanbanEl = container.querySelector("#ats-kanban");
  let pelamar = await fsGetAll(COL.REKRUTMEN_PELAMAR);

  function draw() {
    renderKanban(kanbanEl, {
      columns: COLUMNS,
      items: pelamar.map(p => ({ id: p.id, status: p.status || "Applied", title: p.nama, subtitle: p.posisi_dilamar })),
      onCardClick: (card) => openDetail(pelamar.find(p => p.id === card.id)),
      onDrop: async (cardId, newStatus) => {
        const p = pelamar.find(x => x.id === cardId);
        if (!p || p.status === newStatus) return;
        p.status = newStatus;
        draw();
        await fsUpdate(COL.REKRUTMEN_PELAMAR, cardId, { status: newStatus });
        toast(`Status ${p.nama} diperbarui ke "${COLUMNS.find(c => c.key === newStatus)?.label}"`, "success");
      }
    });
  }
  draw();

  function openDetail(p) {
    openModal({
      title: p.nama,
      bodyHtml: `
        <div class="space-y-3 text-sm">
          <div class="flex justify-between border-b border-slate-50 pb-2"><span class="text-slate-500">Posisi Dilamar</span><span class="font-medium">${escapeHtml(p.posisi_dilamar || "-")}</span></div>
          <div class="flex justify-between border-b border-slate-50 pb-2"><span class="text-slate-500">Sumber</span><span class="font-medium">${escapeHtml(p.sumber || "-")}</span></div>
          <div class="flex justify-between border-b border-slate-50 pb-2"><span class="text-slate-500">Tanggal Lamar</span><span class="font-medium">${fmtDateShort(p.tanggal_lamar)}</span></div>
          <div class="flex justify-between border-b border-slate-50 pb-2"><span class="text-slate-500">PIC</span><span class="font-medium">${escapeHtml(p.pic || "-")}</span></div>
          <div class="flex justify-between border-b border-slate-50 pb-2"><span class="text-slate-500">CV</span>${p.cv_url ? `<a href="${p.cv_url}" target="_blank" class="text-maroon-700 hover:underline">Lihat CV</a>` : '<span class="text-slate-400">-</span>'}</div>
          <div><p class="text-slate-500 mb-1">Catatan</p><p class="text-slate-700">${escapeHtml(p.catatan || "-")}</p></div>
        </div>`,
      footerHtml: `<button id="ats-close" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>`,
      onMount: (m) => { m.querySelector("#ats-close").onclick = closeModal; }
    });
  }

  container.querySelector("#ats-new").addEventListener("click", () => {
    openModal({
      title: "Tambah Pelamar Baru",
      bodyHtml: `
        <form id="ats-form" class="space-y-4">
          <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Nama Lengkap</label><input name="nama" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Posisi Dilamar</label><input name="posisi_dilamar" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Sumber Lamaran</label>
            <select name="sumber" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"><option>Referral</option><option>Job Portal</option><option>Walk-in</option><option>Sosial Media</option></select>
          </div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Link CV</label><input name="cv_url" placeholder="https://..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></div>
        </form>`,
      footerHtml: `
        <button id="ats-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="ats-save" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition">Simpan</button>`,
      onMount: (m) => {
        m.querySelector("#ats-cancel").onclick = closeModal;
        m.querySelector("#ats-save").onclick = async () => {
          const form = m.querySelector("#ats-form");
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          data.status = "Applied";
          data.tanggal_lamar = new Date().toISOString();
          const id = genId("ATS");
          await fsAdd(COL.REKRUTMEN_PELAMAR, data, id);
          pelamar.push({ id, ...data });
          draw();
          toast("Pelamar baru berhasil ditambahkan", "success");
          closeModal();
        };
      }
    });
  });

  return { unmount() {} };
}
