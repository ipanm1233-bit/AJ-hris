import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, deleteBroadcastMemoAndNotifs, openModal, closeModal, toast, genId, escapeHtml, fmtDateTime, sendEmailNotif, buildStandardEmailHtml, sendFCMNotif } from "../utils.js";
// PERUBAHAN: lampiran memo kini diupload ke Google Drive, bukan Firebase Storage.
import { uploadFileToDrive } from "../gas-integration.js";
import { authFetch } from "../api-client.js";
import { avatar, badge, emptyState, skeletonRows } from "../components.js";

// Batas mentah 3 MB menjaga payload base64 tetap di bawah batas request
// serverless. File yang lebih besar tetap dikirim sebagai tautan Drive.
const MAX_EMAIL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const EMAIL_ATTACHMENT_MIME_BY_EXTENSION = {
 pdf: "application/pdf",
 jpg: "image/jpeg",
 jpeg: "image/jpeg",
 png: "image/png",
 doc: "application/msword",
 docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 xls: "application/vnd.ms-excel",
 xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function buildEmailAttachment(file) {
 return new Promise((resolve, reject) => {
 const extension = String(file?.name || "").split(".").pop().toLowerCase();
 const contentType = String(file?.type || EMAIL_ATTACHMENT_MIME_BY_EXTENSION[extension] || "").toLowerCase();
 if (!contentType || !Object.values(EMAIL_ATTACHMENT_MIME_BY_EXTENSION).includes(contentType)) {
 reject(new Error("Tipe file tidak didukung sebagai lampiran email."));
 return;
 }

 const reader = new FileReader();
 reader.onload = () => resolve({
 filename: file.name,
 content: String(reader.result || "").split(",")[1] || "",
 encoding: "base64",
 contentType
 });
 reader.onerror = () => reject(new Error("File gagal dibaca untuk lampiran email."));
 reader.readAsDataURL(file);
 });
}

async function runInBatches(items, batchSize, task) {
 const results = [];
 for (let index = 0; index < items.length; index += batchSize) {
 const batch = items.slice(index, index + batchSize);
 results.push(...await Promise.allSettled(batch.map(task)));
 }
 return results;
}

async function uploadBroadcastAttachment(file, publicationId) {
 let uploadFile = file;
 if (file.size > 3 * 1024 * 1024 && String(file.type || "").startsWith("image/")) {
 uploadFile = await compressBroadcastImage(file);
 }
 if (uploadFile.size > 3 * 1024 * 1024) {
 throw new Error("Ukuran dokumen maksimal 3 MB. Untuk gambar, sistem akan mengompresnya secara otomatis.");
 }
 const encoded = await new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
 reader.onerror = () => reject(new Error("File lampiran gagal dibaca."));
 reader.readAsDataURL(uploadFile);
 });
 try {
 const response = await authFetch("/api/send-email", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "upload_broadcast", publicationId, fileName: uploadFile.name, mimeType: uploadFile.type || "application/octet-stream", base64: encoded })
 });
 const result = await response.json().catch(() => null);
 if (!response.ok || result?.success !== true || !result?.url) throw new Error(result?.error || `Upload gagal (HTTP ${response.status}).`);
 return result.url;
 } catch (serverError) {
 console.warn("Upload backend gagal; mencoba cadangan Google Drive.", serverError);
 return uploadFileToDrive(file, `Broadcast/${publicationId}`);
 }
}

async function compressBroadcastImage(file) {
 const bitmap = await createImageBitmap(file);
 const maxSide = 1920;
 const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
 const canvas = document.createElement("canvas");
 canvas.width = Math.max(1, Math.round(bitmap.width * scale));
 canvas.height = Math.max(1, Math.round(bitmap.height * scale));
 const context = canvas.getContext("2d");
 context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
 bitmap.close?.();
 let quality = 0.84;
 let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
 while (blob && blob.size > 2.8 * 1024 * 1024 && quality > 0.5) {
 quality -= 0.1;
 blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
 }
 if (!blob) throw new Error("Gambar gagal dikompres.");
 const baseName = String(file.name || "gambar").replace(/\.[^.]+$/, "");
 return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export async function mount(container, { session }) {
 const listEl = container.querySelector("#bc-list");
 listEl.innerHTML = skeletonRows(3);
 const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
 const users = await fsGetAll(COL.USERS);

 async function load() {
 const allRows = await fsGetAll(COL.BROADCAST);
 allRows.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
 
 const userRole = (session?.role || "").toUpperCase();
 const isHrd = ["HRD", "SUPERADMIN", "ADMIN", "ADMINISTRATOR", "DIREKTUR", "GM", "FINANCE"].includes(userRole);

 const isRecipient = (r) => {
 if (isHrd) return true;
 if (r.dibuat_oleh && r.dibuat_oleh.toLowerCase() === String(session?.nama || "").toLowerCase()) return true;
 if (!r.target_type || r.target_type === "ALL") return true;
 if (r.target_type === "SPESIFIK") {
 const list = (r.target_list || []).map(x => String(x || "").trim().toLowerCase());
 const myName = String(session?.nama || "").trim().toLowerCase();
 const myUsername = String(session?.username || "").trim().toLowerCase();
 const myNik = String(session?.nik || "").trim().toLowerCase();
 return list.some(target => 
 target === myName || 
 target === myUsername || 
 (myNik && target === myNik) ||
 (myName && (target.includes(myName) || myName.includes(target)))
 );
 }
 return true;
 };

 const rows = allRows.filter(isRecipient);
 
 if (!rows.length) { listEl.innerHTML = emptyState("Belum ada publikasi yang diterbitkan"); return; }
 
 listEl.innerHTML = rows.map(r => `
 <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
 <div class="flex items-start gap-3">
 ${avatar(r.dibuat_oleh || "?", "w-10 h-10")}
 <div class="flex-1 min-w-0">
 <div class="flex items-center justify-between gap-2 flex-wrap">
 <div class="flex items-center gap-2 flex-wrap"><p class="font-semibold text-slate-800">${escapeHtml(r.judul)}</p>${badge(r.jenis_publikasi === "INFORMASI" ? (r.kategori_informasi || "Informasi") : "Memo", r.jenis_publikasi === "INFORMASI" ? "blue" : "maroon")}</div>
 <div class="flex items-center gap-2">
 <span class="text-xs text-slate-400">${fmtDateTime(r.tanggal)}</span>
 ${isHrd || (r.dibuat_oleh && r.dibuat_oleh.toLowerCase() === String(session?.nama || "").toLowerCase()) ? `
 <button class="btn-delete-bc text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition flex items-center gap-1 shrink-0" data-bc-id="${escapeHtml(r.id)}" data-bc-title="${escapeHtml(r.judul)}">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
 Hapus Memo
 </button>
 ` : ''}
 </div>
 </div>
 <div class="text-sm text-slate-600 mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 quill-content">
 ${r.isi}
 </div>
 ${r.lampiran_url ? `<a href="${escapeHtml(r.lampiran_url)}" target="_blank" class="inline-flex items-center gap-1 mt-2 text-xs font-medium text-maroon-700 hover:underline"><svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg><span>Lihat Lampiran</span></a>` : ''}
 <div class="flex items-center gap-2 mt-3">
 ${badge(r.target_type === "SPESIFIK" ? `${(r.target_list || []).length} Karyawan Terpilih` : "Seluruh Karyawan", "maroon")}
 <span class="text-xs text-slate-400">oleh ${escapeHtml(r.dibuat_oleh || "-")} • Berakhir: ${r.tanggal_berakhir || "Tanpa Batas"}${r.mode_email === "TERJADWAL" ? ` • Email: ${r.email_sent_at ? "terkirim" : `terjadwal ${fmtDateTime(r.jadwal_email)}`}` : ""}</span>
 </div>
 </div>
 </div>
 </div>`).join("");

 listEl.querySelectorAll(".btn-delete-bc").forEach(btn => {
 btn.onclick = async () => {
 const bcId = btn.dataset.bcId;
 const bcTitle = btn.dataset.bcTitle;
 if (!bcId) return;
 if (confirm(`Apakah Anda yakin ingin MENGHAPUS memo pengumuman "${bcTitle}" dari database? Memo tidak akan dapat diakses lagi oleh karyawan.`)) {
 try {
 await deleteBroadcastMemoAndNotifs(bcId);
 toast(`Memo "${bcTitle}" berhasil dihapus dari database.`, "success");
 await load();
 } catch (err) {
 toast("Gagal menghapus memo: " + err.message, "error");
 }
 }
 };
 });
 }
 
 await load();
 container.querySelector("#bc-new").addEventListener("click", () => openComposeModal(container, session, karyawan, users, load));
 return { unmount() {} };
}

function openComposeModal(container, session, karyawan, users, reload) {
 openModal({
 title: "Buat Publikasi Baru",
 size: "lg",
 bodyHtml: `
 <form id="bc-form" class="space-y-4">
 <div>
 <label class="block text-xs font-medium text-slate-500 mb-1.5">Judul Publikasi</label>
 <input name="judul" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
 </div>
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label class="block text-xs font-medium text-slate-500 mb-1.5">Jenis Publikasi</label>
 <select id="bc-publication-type" name="jenis_publikasi" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
 <option value="MEMO">Memo / Pengumuman</option>
 <option value="INFORMASI">Informasi Karyawan</option>
 </select>
 </div>
 <div id="bc-info-category-wrap" class="hidden">
 <label class="block text-xs font-medium text-slate-500 mb-1.5">Kategori Informasi</label>
 <select name="kategori_informasi" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
 <option value="UMUM">Umum</option><option value="LIBUR_NASIONAL">Libur Nasional</option><option value="TIPS_KEUANGAN">Tips Keuangan</option><option value="KESEHATAN">Kesehatan</option><option value="PENGEMBANGAN">Pengembangan Diri</option><option value="LAINNYA">Lainnya</option>
 </select>
 </div>
 </div>
 <div>
 <label class="block text-xs font-medium text-slate-500 mb-1.5">Isi Publikasi</label>
 <div id="editor-container" class="w-full text-sm rounded-lg border border-slate-200" style="height: 220px; background: white;"></div>
 </div>
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Mulai Tayang</label><input type="datetime-local" id="bc-tanggal-tayang" name="tanggal_tayang" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></div>
 <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Pengiriman Email</label><select id="bc-email-mode" name="mode_email" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"><option value="LANGSUNG">Kirim sekarang</option><option value="TERJADWAL">Kirim terjadwal</option><option value="TIDAK_KIRIM">Tidak kirim email</option></select></div>
 </div>
 <div id="bc-email-schedule-wrap" class="hidden"><label class="block text-xs font-medium text-slate-500 mb-1.5">Mulai Jadwal Email</label><input type="datetime-local" id="bc-email-schedule" name="jadwal_email" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"><p class="text-[11px] text-slate-400 mt-1">Email yang sudah jatuh tempo diproses otomatis setiap pagi sekitar 07.15 WIB.</p></div>
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label class="block text-xs font-medium text-slate-500 mb-1.5">Target Penerima</label>
 <select id="bc-target-type" name="target_type" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
 <option value="ALL">Seluruh Karyawan</option>
 <option value="SPESIFIK">Karyawan Tertentu</option>
 </select>
 </div>
 <div>
 <label class="block text-xs font-medium text-slate-500 mb-1.5">Deadline Tayang di Dashboard</label>
 <input type="date" id="bc-tanggal-berakhir" name="tanggal_berakhir" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
 </div>
 </div>
 <div id="bc-target-list-wrap" class="hidden space-y-2">
 <div class="flex items-center justify-between">
 <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih Karyawan Penerima Memo</label>
 <span id="bc-selected-count" class="text-xs font-bold text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded-full border border-maroon-200">0 Terpilih</span>
 </div>
 <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
 <div class="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
 <input type="text" id="bc-search-box" placeholder="Cari nama, jabatan, atau cabang..." class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-maroon-500 bg-white">
 <button type="button" id="bc-toggle-all" class="text-xs font-bold text-maroon-700 hover:bg-maroon-50 px-2.5 py-1 rounded-lg shrink-0 border border-maroon-200 transition">Pilih Semua</button>
 </div>
 <div id="bc-checkbox-list" class="max-h-48 overflow-y-auto divide-y divide-slate-100 p-1 bg-white">
 </div>
 </div>
 </div>
 <div>
 <label class="block text-xs font-medium text-slate-500 mb-1.5">Lampiran File (opsional)</label>
 <input type="file" name="lampiran_file" id="bc-lampiran-file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none bg-white">
 <p class="text-[11px] text-slate-400 mt-1">Foto akan dikompres otomatis. PDF atau dokumen Office maksimal 3MB.</p>
 </div>
 </form>`,
 footerHtml: `
 <button id="bc-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="bc-send" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition shadow-md">Publikasikan</button>`,
 onMount: (m) => {
 // Set Default Deadline (7 Hari dari Sekarang)
 const dateInput = m.querySelector("#bc-tanggal-berakhir");
 const nextWeek = new Date();
 nextWeek.setDate(nextWeek.getDate() + 7);
 dateInput.value = nextWeek.toISOString().split('T')[0];
 const toLocalInputValue = (date) => {
 const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
 return shifted.toISOString().slice(0, 16);
 };
 m.querySelector("#bc-tanggal-tayang").value = toLocalInputValue(new Date());
 const publicationType = m.querySelector("#bc-publication-type");
 publicationType.onchange = () => m.querySelector("#bc-info-category-wrap").classList.toggle("hidden", publicationType.value !== "INFORMASI");
 const emailMode = m.querySelector("#bc-email-mode");
 const scheduleInput = m.querySelector("#bc-email-schedule");
 emailMode.onchange = () => {
 const scheduled = emailMode.value === "TERJADWAL";
 m.querySelector("#bc-email-schedule-wrap").classList.toggle("hidden", !scheduled);
 scheduleInput.required = scheduled;
 if (scheduled && !scheduleInput.value) scheduleInput.value = toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000));
 };

 const listContainer = m.querySelector("#bc-checkbox-list");
 const searchBox = m.querySelector("#bc-search-box");
 const countBadge = m.querySelector("#bc-selected-count");
 const btnToggleAll = m.querySelector("#bc-toggle-all");

 // Filter active employees with valid names and sort A-Z
 const validKaryawan = karyawan.filter(k => k.nama_karyawan || k.nama);
 validKaryawan.sort((a, b) => {
 const nameA = String(a.nama_karyawan || a.nama || "");
 const nameB = String(b.nama_karyawan || b.nama || "");
 return nameA.localeCompare(nameB, "id", { sensitivity: "base" });
 });

 const selectedEmpSet = new Set();

 function updateCount() {
 countBadge.textContent = `${selectedEmpSet.size} Terpilih`;
 }

 function drawCheckboxes(filterText = "") {
 const term = String(filterText || "").toLowerCase().trim();
 
 listContainer.innerHTML = validKaryawan.map(k => {
 const nama = String(k.nama_karyawan || k.nama || "");
 const jabatan = String(k.jabatan || "");
 const cabang = String(k.cabang || "");

 const match = !term || nama.toLowerCase().includes(term) || jabatan.toLowerCase().includes(term) || cabang.toLowerCase().includes(term);
 if (!match || !nama) return "";

 const isChecked = selectedEmpSet.has(nama);

 return `
 <label class="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition select-none">
 <input type="checkbox" name="bc-emp-checkbox" value="${escapeHtml(nama)}" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-maroon-600 border-slate-300 rounded focus:ring-maroon-500 cursor-pointer">
 <div class="text-xs">
 <p class="font-semibold text-slate-800">${escapeHtml(nama)}</p>
 <p class="text-slate-400 text-[10px]">${escapeHtml(jabatan)} ${cabang ? `• ${escapeHtml(cabang)}` : ''}</p>
 </div>
 </label>
 `;
 }).join("");

 listContainer.querySelectorAll('input[name="bc-emp-checkbox"]').forEach(cb => {
 cb.addEventListener("change", () => {
 if (cb.checked) {
 selectedEmpSet.add(cb.value);
 } else {
 selectedEmpSet.delete(cb.value);
 }
 updateCount();
 });
 });
 updateCount();
 }

 drawCheckboxes();
 searchBox.oninput = (e) => drawCheckboxes(e.target.value);

 let allChecked = false;
 btnToggleAll.onclick = () => {
 allChecked = !allChecked;
 const term = String(searchBox ? searchBox.value : "").toLowerCase().trim();
 if (allChecked) {
 validKaryawan.forEach(k => {
 const nama = String(k.nama_karyawan || k.nama || "");
 if (!nama) return;
 const match = !term || nama.toLowerCase().includes(term) || (k.jabatan || "").toLowerCase().includes(term) || (k.cabang || "").toLowerCase().includes(term);
 if (match) selectedEmpSet.add(nama);
 });
 } else {
 if (!term) {
 selectedEmpSet.clear();
 } else {
 validKaryawan.forEach(k => {
 const nama = String(k.nama_karyawan || k.nama || "");
 if (!nama) return;
 const match = nama.toLowerCase().includes(term) || (k.jabatan || "").toLowerCase().includes(term) || (k.cabang || "").toLowerCase().includes(term);
 if (match) selectedEmpSet.delete(nama);
 });
 }
 }
 drawCheckboxes(searchBox ? searchBox.value : "");
 btnToggleAll.textContent = allChecked ? "Batal Semua" : "Pilih Semua";
 };

 const quill = new window.Quill(m.querySelector('#editor-container'), {
 theme: 'snow',
 placeholder: 'Ketik isi memo di sini...',
 modules: {
 toolbar: {
 container: [
 ['bold', 'italic', 'underline', 'strike'],
 [{ 'header': [1, 2, 3, false] }],
 [{ 'list': 'ordered' }, { 'list': 'bullet' }],
 [{ 'align': [] }],
 ['link', 'table-btn'],
 ['clean']
 ],
 handlers: {
 'table-btn': function() {
 const rows = prompt("Jumlah Baris (misal: 3)", "3");
 if (!rows) return;
 const cols = prompt("Jumlah Kolom (misal: 3)", "3");
 if (!cols) return;
 
 const r = Math.max(parseInt(rows) || 2, 1);
 const c = Math.max(parseInt(cols) || 2, 1);
 
 let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:12px 0; border:1px solid #cbd5e1;"><tbody>';
 for (let i = 0; i < r; i++) {
 tableHtml += '<tr>';
 for (let j = 0; j < c; j++) {
 if (i === 0) {
 tableHtml += '<th style="border:1px solid #cbd5e1; padding:8px 12px; background-color:#f8fafc; font-weight:600; text-align:left;">Judul ' + (j + 1) + '</th>';
 } else {
 tableHtml += '<td style="border:1px solid #cbd5e1; padding:8px 12px;">Data ' + i + '.' + (j + 1) + '</td>';
 }
 }
 tableHtml += '</tr>';
 }
 tableHtml += '</tbody></table><p><br></p>';
 
 const tempDiv = document.createElement("div");
 tempDiv.innerHTML = tableHtml;
 const editorRoot = this.quill.root;
 editorRoot.appendChild(tempDiv.firstElementChild);
 const p = document.createElement("p");
 p.innerHTML = "<br>";
 editorRoot.appendChild(p);
 }
 }
 }
 }
 });

 // Custom icon for table button
 const tableBtn = m.querySelector('.ql-table-btn');
 if (tableBtn) {
 tableBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18M9 3v18M15 3v18M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/></svg>`;
 tableBtn.title = "Sisipkan Tabel";
 }

 m.querySelector("#bc-target-type").addEventListener("change", (e) => {
 m.querySelector("#bc-target-list-wrap").classList.toggle("hidden", e.target.value !== "SPESIFIK");
 });
 
 m.querySelector("#bc-cancel").onclick = closeModal;
 m.querySelector("#bc-send").onclick = async () => {
 const form = m.querySelector("#bc-form");
 if (!form.reportValidity()) return;

 const fd = new FormData(form);
 const targetType = fd.get("target_type");
 const publicationKind = String(fd.get("jenis_publikasi") || "MEMO");
 const emailDeliveryMode = String(fd.get("mode_email") || "LANGSUNG");
 const publishAt = new Date(String(fd.get("tanggal_tayang")));
 const scheduledAt = fd.get("jadwal_email") ? new Date(String(fd.get("jadwal_email"))) : null;
 if (Number.isNaN(publishAt.getTime())) { toast("Waktu mulai tayang tidak valid.", "warning"); return; }
 if (emailDeliveryMode === "TERJADWAL" && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) { toast("Jadwal email harus berada di waktu mendatang.", "warning"); return; }

 let targetList = [];
 if (targetType === "SPESIFIK") {
 targetList = Array.from(selectedEmpSet);
 if (targetList.length === 0) {
 toast("Centang minimal 1 karyawan penerima memo!", "warning");
 return;
 }
 }

 const htmlContent = quill.root.innerHTML;
 const plainText = quill.getText().trim();

 if (plainText.length === 0) { toast("Isi memo tidak boleh kosong!", "warning"); return; }

 const btnSend = m.querySelector("#bc-send");
 try {
 btnSend.disabled = true; btnSend.innerHTML = "Sedang Mengirim...";

 const id = genId("BC");

 // Upload lampiran (jika ada file dipilih) ke Google Drive
 let lampiranUrl = null;
 let emailAttachments = [];
 const fileInput = m.querySelector("#bc-lampiran-file");
 const file = fileInput.files && fileInput.files[0];
 if (file) {
 if (file.size > 10 * 1024 * 1024) { toast("Ukuran file lampiran maksimal 10MB", "warning"); btnSend.disabled = false; btnSend.innerHTML = "Kirim Memo"; return; }
 btnSend.innerHTML = "Mengupload Lampiran...";
 lampiranUrl = await uploadBroadcastAttachment(file, id);
 if (file.size <= MAX_EMAIL_ATTACHMENT_BYTES) {
 try {
 emailAttachments = [await buildEmailAttachment(file)];
 } catch (attachmentError) {
 console.warn("Lampiran email tidak dapat disiapkan; tautan Drive tetap disertakan.", attachmentError);
 }
 }
 btnSend.innerHTML = "Sedang Mengirim...";
 }

 const payload = {
 judul: fd.get("judul"),
 isi: htmlContent,
 jenis_publikasi: publicationKind,
 kategori_informasi: publicationKind === "INFORMASI" ? fd.get("kategori_informasi") : "",
 target_type: targetType,
 target_list: targetList,
 tanggal_berakhir: fd.get("tanggal_berakhir"),
 tanggal_tayang: publishAt.toISOString(),
 mode_email: emailDeliveryMode,
 kirim_email_terjadwal: emailDeliveryMode === "TERJADWAL",
 jadwal_email: scheduledAt ? scheduledAt.toISOString() : "",
 email_status: emailDeliveryMode === "TERJADWAL" ? "TERJADWAL" : (emailDeliveryMode === "TIDAK_KIRIM" ? "TIDAK_DIKIRIM" : "MENUNGGU"),
 lampiran_url: lampiranUrl,
 lampiran_nama: file?.name || "",
 lampiran_tipe: file?.type || "",
 tanggal: new Date().toISOString(),
 dibuat_oleh: session.nama
 };

 await fsAdd(COL.BROADCAST, payload, id);

 // Match target users & karyawan
 const fcmTokensSet = new Set();
 const targetEmailsSet = new Set();
 const targetUserIdsSet = new Set();

 const isMatch = (name, uname, nik) => {
 if (targetType === "ALL") return true;
 return targetList.some(t => {
 const term = String(t || "").toLowerCase();
 const n = String(name || "").toLowerCase();
 const u = String(uname || "").toLowerCase();
 const nk = String(nik || "").toLowerCase();
 return n === term || u === term || nk === term || (n && n.includes(term)) || (n && term.includes(n));
 });
 };

 users.forEach(u => {
 const matched = isMatch(u.nama, u.username, u.nik);
 if (matched) {
 if (u.id || u.username) targetUserIdsSet.add(u.id || u.username);
 if (Array.isArray(u.fcm_tokens)) u.fcm_tokens.forEach(t => t && fcmTokensSet.add(t));
 if (u.fcm_token) fcmTokensSet.add(u.fcm_token); // kompatibilitas data lama
 if (u.email) targetEmailsSet.add(u.email);
 }
 });

 karyawan.forEach(k => {
 const matched = isMatch(k.nama_karyawan || k.nama, k.username, k.nik_karyawan || k.nik);
 if (matched) {
 if (k.username || k.nik) targetUserIdsSet.add(k.username || k.nik);
 if (Array.isArray(k.fcm_tokens)) k.fcm_tokens.forEach(t => t && fcmTokensSet.add(t));
 if (k.fcm_token) fcmTokensSet.add(k.fcm_token); // kompatibilitas data lama
 if (k.email) targetEmailsSet.add(k.email);

 // Cross-match dengan user doc
 const matchingUser = users.find(u => 
 (k.username && u.username === k.username) || 
 (k.nik && (u.nik === k.nik || u.username === k.nik)) ||
 (k.nama_karyawan && u.nama && u.nama.toLowerCase() === k.nama_karyawan.toLowerCase())
 );
 if (matchingUser) {
 if (Array.isArray(matchingUser.fcm_tokens)) matchingUser.fcm_tokens.forEach(t => t && fcmTokensSet.add(t));
 if (matchingUser.fcm_token) fcmTokensSet.add(matchingUser.fcm_token); // kompatibilitas data lama
 if (matchingUser.id || matchingUser.username) targetUserIdsSet.add(matchingUser.id || matchingUser.username);
 }
 }
 });

 // Notif in-app (lonceng). Diproses bertahap agar publikasi massal tidak
 // membuka terlalu banyak transaksi Firestore sekaligus di browser.
 const targetUserIds = Array.from(targetUserIdsSet);
 btnSend.innerHTML = "Menyimpan Notifikasi...";
 const notificationResults = await runInBatches(targetUserIds, 10, uname => fsAdd(COL.NOTIFICATIONS, {
 username_target: uname,
 judul: `${publicationKind === "INFORMASI" ? "Informasi Baru" : "Memo Baru"}: ${payload.judul}`,
 pesan: plainText.substring(0, 80) + '...',
 dibaca: false,
 tanggal: payload.tanggal,
 link: `/#broadcast?memo_id=${id}`,
 memo_id: id
 }, genId("NTF")));
 const notificationFailures = notificationResults.filter(result => result.status === "rejected");
 if (notificationFailures.length) console.warn(`${notificationFailures.length} notifikasi publikasi gagal disimpan.`, notificationFailures[0]?.reason);

 // Email
 const targetEmails = Array.from(targetEmailsSet);
 let emailSuccessCount = 0;
 let emailFailureCount = 0;
 if (emailDeliveryMode === "LANGSUNG" && targetEmails.length > 0) {
 btnSend.innerHTML = `Mengirim Email (0/${targetEmails.length})...`;
 const attachmentLinkHtml = lampiranUrl ? `
   <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px;margin:16px 0;">
     <div style="font-size:12px;font-weight:700;color:#9a3412;margin-bottom:6px;">📎 Lampiran Memo</div>
     <a href="${escapeHtml(lampiranUrl)}" target="_blank" rel="noopener noreferrer" style="color:#7a1f2b;font-size:13px;font-weight:700;text-decoration:underline;">
       Buka ${escapeHtml(file?.name || "lampiran")} di Google Drive
     </a>
   </div>
 ` : "";
 const emailTemplate = buildStandardEmailHtml({
   badgeText: publicationKind === "INFORMASI" ? "Informasi Karyawan" : "Memo Internal",
   badgeVariant: "maroon",
   title: payload.judul,
   introText: `Pengumuman resmi dari <strong>${escapeHtml(session.nama || "Manajemen")}</strong>:`,
   bodyHtml: `
     <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 16px 0; color: #1e293b; font-size: 13.5px; line-height: 1.7;">
       ${htmlContent}
     </div>
     ${attachmentLinkHtml}
   `,
   actionUrl: `${window.location.origin}/#broadcast?memo_id=${id}`,
   actionText: "Lihat Memo di Portal HRIS →",
   secondaryNote: emailAttachments.length
     ? "File memo dilampirkan langsung pada email ini. Tautan Google Drive juga disediakan sebagai akses cadangan."
     : (lampiranUrl
       ? "Lampiran tersedia melalui tautan Google Drive di atas. File berukuran lebih dari 3 MB tidak dilampirkan langsung ke email."
       : "Memo ini ditujukan kepada karyawan di lingkungan CV Andela Jaya.")
 });
 const emailResults = await runInBatches(targetEmails, 5, async email => {
 const sent = await sendEmailNotif(
 email,
 `[${publicationKind === "INFORMASI" ? "Informasi" : "Memo"} HRIS] ${payload.judul}`,
 emailTemplate,
 "",
 emailAttachments,
 { manual: true }
 );
 if (!sent) throw new Error(`Email ke ${email} gagal dikirim.`);
 emailSuccessCount += 1;
 btnSend.innerHTML = `Mengirim Email (${emailSuccessCount}/${targetEmails.length})...`;
 return true;
 });
 emailFailureCount = emailResults.filter(result => result.status === "rejected").length;
 await fsUpdate(COL.BROADCAST, id, {
 email_status: emailFailureCount === 0 ? "TERKIRIM" : (emailSuccessCount > 0 ? "SEBAGIAN_GAGAL" : "GAGAL"),
 email_sent_at: emailSuccessCount > 0 ? new Date().toISOString() : "",
 email_recipient_count: targetEmails.length,
 email_success_count: emailSuccessCount,
 email_failure_count: emailFailureCount
 });
 } else if (emailDeliveryMode === "LANGSUNG") {
 await fsUpdate(COL.BROADCAST, id, { email_status: "TIDAK_ADA_PENERIMA", email_recipient_count: 0 });
 }

 // Push notification ke HP (FCM)
 const targetTokens = Array.from(fcmTokensSet).filter(Boolean);
 if (targetTokens.length > 0 && publishAt.getTime() <= Date.now()) {
 await sendFCMNotif(targetTokens, `${publicationKind === "INFORMASI" ? "Informasi Baru" : "Memo Baru"}: ${payload.judul}`, plainText.substring(0, 80) + '...', `/#broadcast?memo_id=${id}`).catch(error => console.warn("Push publikasi gagal dikirim:", error));
 }

 const deliveryNote = emailDeliveryMode === "TERJADWAL"
 ? " Email telah dijadwalkan."
 : (emailDeliveryMode === "LANGSUNG" && targetEmails.length ? ` Email terkirim ${emailSuccessCount}/${targetEmails.length}.` : "");
 toast(`Publikasi berhasil disimpan.${deliveryNote}${notificationFailures.length ? ` ${notificationFailures.length} notifikasi perlu dicoba ulang.` : ""}`, emailFailureCount ? "warning" : "success");
 closeModal();
 reload();
 } catch (e) {
 const prefix = String(e?.message || "").toLowerCase().includes("upload") || String(e?.message || "").toLowerCase().includes("apps script")
   ? "Gagal mengunggah lampiran"
   : "Gagal mengirim memo";
 toast(prefix + ": " + e.message, "error");
 btnSend.disabled = false; btnSend.innerHTML = "Publikasikan";
 }
 };
 }
 });
}
