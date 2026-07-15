import { db, COL } from "../firebase-config.js";
import { fsGetAll, fmtDateTime, escapeHtml, openModal, closeModal } from "../utils.js";
import { badge, emptyState, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  container.innerHTML = `<div class="max-w-7xl mx-auto pb-10"><h1 class="text-2xl font-bold text-slate-800 mb-6">Riwayat Pengajuan</h1><div id="riwayat-list">${skeletonRows(4)}</div></div>`;
  
  const listEl = container.querySelector("#riwayat-list");
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";

  try {
    const allReq = await fsGetAll(COL.DATA_PENGAJUAN);
    // FILTER: Hanya tampilkan milik pemohon, KECUALI dia adalah HRD
    const myReq = allReq.filter(r => isHrd || r.nama_pemohon === session.nama).sort((a,b) => new Date(b.tgl) - new Date(a.tgl));

    if (!myReq.length) {
       listEl.innerHTML = emptyState("Belum ada riwayat pengajuan", "Data kosong.");
       return { unmount() {} };
    }

    listEl.innerHTML = myReq.map(r => {
       const tone = r.status_final?.includes("APPROVED") ? "green" : r.status_final?.includes("REJECT") ? "red" : "amber";
       return `
       <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 flex items-center justify-between hover:border-maroon-200 transition">
          <div>
             <p class="font-bold text-slate-700">${escapeHtml(r.nama_form)}</p>
             <p class="text-xs text-slate-500 mt-1">${isHrd ? `Pemohon: <b>${escapeHtml(r.nama_pemohon)}</b> • ` : ''}Tgl: ${fmtDateTime(r.tgl)}</p>
          </div>
          <div class="flex flex-col items-end gap-2">
             ${badge(r.status_final, tone)}
             <button data-id="${r.id}" class="text-xs font-medium text-maroon-700 hover:underline">Lihat Detail</button>
          </div>
       </div>`;
    }).join("");

    listEl.querySelectorAll("button[data-id]").forEach(btn => {
       btn.onclick = () => {
          const row = myReq.find(x => x.id === btn.dataset.id);
          let html = Object.entries(row.detail).map(([k,v]) => `<div class="border-b py-2 text-sm"><span class="block text-xs text-slate-400 capitalize">${k.replace(/_/g," ")}</span><b>${escapeHtml(String(v))}</b></div>`).join("");
          if(row.catatan_penolakan && row.catatan_penolakan.length > 0) {
             html += `<div class="mt-4 p-3 bg-red-50 text-red-800 text-xs rounded border border-red-200"><b>Log Proses:</b><br/>${row.catatan_penolakan.join("<br/>")}</div>`;
          }
          openModal({ title: `Detail Pengajuan`, bodyHtml: html, footerHtml: `<button id="btn-tutup-riwayat" class="px-4 py-2 bg-slate-100 rounded text-sm">Tutup</button>`, onMount: m => m.querySelector("#btn-tutup-riwayat").onclick = closeModal });
       };
    });
  } catch(e) { listEl.innerHTML = `<p class="text-red-500">Error: ${e.message}</p>`; }

  return { unmount() {} };
}
