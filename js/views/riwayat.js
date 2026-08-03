import { db, COL } from "../firebase-config.js";
import {
 fsGetAll, fsUpdate, fmtDateTime, escapeHtml, openModal, closeModal, toast,
 dynFieldWrapperHtml, wireDynFormLogic, collectDynFormDetail, sendEmailNotif, getTargetsForRole,
 renderPengajuanDetailHtml, printSalesKlaimForm, printFormCutiFisik
} from "../utils.js";
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
 const lpjOverdue = r.requires_lpj && r.lpj_status === "BELUM" && r.lpj_due_date && new Date(r.lpj_due_date) < new Date();
 let lpjBadgeHtml = "";
 if (r.requires_lpj) {
 if (r.lpj_status === "SELESAI") lpjBadgeHtml = badge("LPJ Selesai", "green");
 else lpjBadgeHtml = badge(lpjOverdue ? "LPJ Terlambat" : "LPJ Belum Diisi", lpjOverdue ? "red" : "amber");
 }
 const showFillBtn = r.requires_lpj && r.lpj_status === "BELUM" && r.nama_pemohon === session.nama;
 const isKlaimBensin = r.form_id === "F-KLAIM-BENSIN" || (r.nama_form || "").toLowerCase().includes("bensin");
 const isCutiForm = r.form_id === "F-ISO-CUTI" || (r.nama_form || "").toLowerCase().includes("cuti") || !!r.kategori_cuti;
 const isApproved = (r.status_final || "").includes("APPROVED");

 return `
 <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 flex items-center justify-between hover:border-maroon-200 transition flex-wrap gap-2">
 <div>
 <p class="font-bold text-slate-700">${escapeHtml(r.nama_form)}</p>
 <p class="text-xs text-slate-500 mt-1">${isHrd ? `Pemohon: <b>${escapeHtml(r.nama_pemohon)}</b> • ` : ''}Tgl: ${fmtDateTime(r.tgl)}</p>
 </div>
 <div class="flex flex-col items-end gap-2">
 <div class="flex items-center gap-2">${badge(r.status_final, tone)}${lpjBadgeHtml}</div>
 <div class="flex items-center gap-3">
 ${isKlaimBensin ? `<button data-print-klaim="${r.id}" class="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1">Cetak Form</button>` : ""}
 ${isCutiForm && isApproved ? `<button data-print-cuti="${r.id}" class="text-xs font-bold text-maroon-700 hover:underline flex items-center gap-1">Form Cuti Fisik</button>` : ""}
 ${showFillBtn ? `<button data-lpj="${r.id}" class="text-xs font-bold text-amber-700 hover:underline">Isi LPJ</button>` : ""}
 <button data-id="${r.id}" class="text-xs font-medium text-maroon-700 hover:underline">Lihat Detail</button>
 </div>
 </div>
 </div>`;
 }).join("");

 listEl.querySelectorAll("button[data-print-klaim]").forEach(btn => {
 btn.onclick = () => {
 const row = myReq.find(x => x.id === btn.dataset.printKlaim);
 if (row) printSalesKlaimForm(row);
 };
 });

 listEl.querySelectorAll("button[data-print-cuti]").forEach(btn => {
 btn.onclick = () => {
 const row = myReq.find(x => x.id === btn.dataset.printCuti);
 if (row) printFormCutiFisik(row);
 };
 });

 listEl.querySelectorAll("button[data-id]").forEach(btn => {
 btn.onclick = () => {
 const row = myReq.find(x => x.id === btn.dataset.id);
 let html = renderPengajuanDetailHtml(row, session);
 if (row.requires_lpj) {
 html += `<div class="mt-4 p-3 rounded border text-xs ${row.lpj_status === "SELESAI" ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}">
 <b>Status LPJ:</b> ${row.lpj_status === "SELESAI" ? "Sudah diisi" : "Belum diisi"} ${row.lpj_due_date ? `• Batas: ${fmtDateTime(row.lpj_due_date)}` : ""}
 </div>`;
 if (row.lpj_status === "SELESAI" && row.lpj_detail) {
 html += Object.entries(row.lpj_detail).map(([k,v]) => {
 const isUrl = typeof v === "string" && /^https?:\/\//.test(v);
 return `<div class="border-b py-2 text-sm flex justify-between items-center"><span class="text-xs text-slate-500 capitalize">${k.replace(/_/g," ")}</span>${isUrl ? `<button type="button" onclick="openAttachment('${escapeHtml(String(v))}')" class="text-maroon-700 font-bold hover:underline text-xs">Lihat Lampiran</button>` : `<b class="text-slate-800">${escapeHtml(String(v))}</b>`}</div>`;
 }).join("");
 }
 }
 if(row.catatan_penolakan && row.catatan_penolakan.length > 0) {
 html += `<div class="mt-4 p-3 bg-red-50 text-red-800 text-xs rounded border border-red-200"><b>Log Proses:</b><br/>${row.catatan_penolakan.join("<br/>")}</div>`;
 }
 openModal({ title: `Detail Pengajuan — ${escapeHtml(row.nama_form)}`, size: "lg", bodyHtml: html, footerHtml: `<button id="btn-tutup-riwayat" class="px-4 py-2 bg-slate-100 rounded text-sm font-semibold">Tutup</button>`, onMount: m => m.querySelector("#btn-tutup-riwayat").onclick = closeModal });
 };
 });

 listEl.querySelectorAll("button[data-lpj]").forEach(btn => {
 btn.onclick = () => {
 const row = myReq.find(x => x.id === btn.dataset.lpj);
 openLpjModal(row, session, () => mount(container, { session }));
 };
 });

 // Auto-open modal jika URL Hash mengandung id tertentu (mis. dari Klik Notifikasi)
 const idMatch = window.location.hash.match(/id=([a-zA-Z0-9_-]+)/);
 if (idMatch && idMatch[1]) {
 const targetReq = myReq.find(x => x.id === idMatch[1]);
 if (targetReq) {
 setTimeout(() => {
 const btn = listEl.querySelector(`button[data-id="${targetReq.id}"]`);
 if (btn) btn.click();
 }, 200);
 }
 }
 } catch(e) { listEl.innerHTML = `<p class="text-red-500">Error: ${e.message}</p>`; }

 return { unmount() {} };
}

/** Modal untuk pemohon mengisi Laporan Pertanggungjawaban (LPJ) atas transaksi yang sudah disetujui. */
function openLpjModal(row, session, onDone) {
 const fields = Array.isArray(row.lpj_fields_json) ? row.lpj_fields_json : [];
 if (!fields.length) { toast("Formulir LPJ untuk transaksi ini belum dikonfigurasi HRD.", "warning"); return; }

 openModal({
 title: `Isi LPJ — ${row.nama_form}`,
 size: "md",
 bodyHtml: `
 <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
 Lengkapi laporan pertanggungjawaban untuk transaksi <b>${escapeHtml(row.id)}</b> ini.
 ${row.lpj_due_date ? `Batas waktu: <b>${new Date(row.lpj_due_date).toLocaleDateString('id-ID', { dateStyle: 'long' })}</b>.` : ""}
 </div>
 <form id="lpj-form" class="space-y-4">
 ${fields.map(f => dynFieldWrapperHtml(f)).join("")}
 </form>`,
 footerHtml: `
 <button id="lpj-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="lpj-submit" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 transition shadow-md">Kirim LPJ</button>`,
 onMount: (m) => {
 const form = m.querySelector("#lpj-form");
 wireDynFormLogic(form, fields);
 m.querySelector("#lpj-cancel").onclick = closeModal;
 m.querySelector("#lpj-submit").onclick = async () => {
 if (!form.reportValidity()) return;
 const submitBtn = m.querySelector("#lpj-submit");
 submitBtn.disabled = true;
 submitBtn.textContent = "Mengirim...";
 try {
 const lpjDetail = await collectDynFormDetail(form, fields, `LPJ/${row.id}`);
 await fsUpdate(COL.DATA_PENGAJUAN, row.id, {
 lpj_status: "SELESAI",
 lpj_detail: lpjDetail,
 lpj_submitted_at: new Date().toISOString()
 });
 toast("LPJ berhasil dikirim, terima kasih!", "success");
 closeModal();
 if (onDone) onDone();

 // Beri tahu HRD bahwa LPJ sudah masuk
 const hrdTargets = await getTargetsForRole("HRD");
 for (const target of hrdTargets) {
 sendEmailNotif(target.email, `[LPJ Masuk] ${row.nama_form} — ${session.nama}`,
 `<div style="font-family:Arial,sans-serif;padding:20px;"><h3>LPJ Baru Diterima</h3><p><b>${escapeHtml(session.nama)}</b> telah mengirimkan LPJ untuk transaksi <b>${escapeHtml(row.id)}</b> (${escapeHtml(row.nama_form)}).</p></div>`
 ).catch(e => console.warn(e));
 }
 } catch (e) {
 toast(e.message || "Gagal mengirim LPJ", "error");
 submitBtn.disabled = false;
 submitBtn.textContent = "Kirim LPJ";
 }
 };
 }
 });
}
