import { db, COL, collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, genId, openModal, closeModal, toast, fmtDate, fmtDateShort, escapeHtml, sendEmailNotif, getTargetsForRole, createLoginToken, notifyUser } from "../utils.js";
import { badge, emptyState, skeletonRows } from "../components.js";
import { uploadFileToDrive } from "../gas-integration.js";
import { isoDocHeaderTable, letterheadHtml, COMPANY_NAME, logoImgTag, LOGO_DATA_URI } from "../branding.js";

export const JENIS_IZIN_MAP = {
 IZIN_TERLAMBAT: {
 key: "IZIN_TERLAMBAT",
 label: "Izin Datang Terlambat",
 icon: "⏰",
 badgeClass: "bg-amber-100 text-amber-800 border-amber-200"
 },
 IZIN_PULANG_CEPAT: {
 key: "IZIN_PULANG_CEPAT",
 label: "Izin Pulang Cepat",
 icon: "",
 badgeClass: "bg-blue-100 text-blue-800 border-blue-200"
 },
 IZIN_KELUAR_KANTOR: {
 key: "IZIN_KELUAR_KANTOR",
 label: "Izin Keluar Kantor / Dinas Samping",
 icon: "",
 badgeClass: "bg-purple-100 text-purple-800 border-purple-200"
 }
};

export async function mount(container, { session }) {
 const userRole = (session.role || "").toUpperCase();
 const isHrdOrAdmin = ["HRD", "SUPERADMIN", "ADMIN", "ADMINISTRATOR", "DIREKTUR", "GM"].includes(userRole);
 const isAtasan = isHrdOrAdmin || ["MANAGER", "SPV", "KOORDINATOR", "BRANCH MANAGER"].includes(userRole);

 let allIzinRecords = [];
 let filterJenis = "ALL";
 let filterStatus = "ALL";
 let searchKeyword = "";

 const tbody = container.querySelector("#tbl-izin-body");
 const emptyWrap = container.querySelector("#izin-empty-wrap");

 // Load Data
 async function loadData() {
 tbody.innerHTML = `<tr><td colspan="7" class="p-4">${skeletonRows(3)}</td></tr>`;
 try {
 const qI = query(collection(db, COL.DATA_PENGAJUAN));
 const snap = await getDocs(qI);
 
 const rawLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
 allIzinRecords = rawLogs.filter(r => 
 r.form_id === "F-ISO-IZIN" || 
 r.tipe_form === "FORM_IZIN" || 
 r.kategori === "IZIN" ||
 (r.nama_form || "").toLowerCase().includes("izin")
 ).sort((a, b) => new Date(b.tanggal_pengajuan || b.tgl || b.created_at || 0) - new Date(a.tanggal_pengajuan || a.tgl || a.created_at || 0));

 // Filter by role if not HRD/Admin
 if (!isHrdOrAdmin) {
 const myNameLower = (session.nama || "").trim().toLowerCase();
 allIzinRecords = allIzinRecords.filter(r => {
 const pemohonNameLower = (r.nama_pemohon || r.pemohon || "").trim().toLowerCase();
 const atasanNameLower = (r.atasan_langsung || r.penanggung_jawab || "").trim().toLowerCase();
 const isMine = pemohonNameLower === myNameLower;
 const isAtasanTarget = atasanNameLower === myNameLower;
 return isMine || isAtasanTarget;
 });
 }

 updateMetrics();
 renderTable();
 } catch (err) {
 console.error("Error loading izin data:", err);
 tbody.innerHTML = "";
 emptyWrap.innerHTML = emptyState("Gagal memuat data pengajuan izin.", err.message);
 }
 }

 function updateMetrics() {
 let tTotal = allIzinRecords.length;
 let tTerlambat = allIzinRecords.filter(r => r.jenis_izin === "IZIN_TERLAMBAT").length;
 let tPulangCepat = allIzinRecords.filter(r => r.jenis_izin === "IZIN_PULANG_CEPAT").length;
 let tKeluar = allIzinRecords.filter(r => r.jenis_izin === "IZIN_KELUAR_KANTOR").length;

 const elTotal = container.querySelector("#stat-total-izin");
 const elTerlambat = container.querySelector("#stat-izin-terlambat");
 const elPulangCepat = container.querySelector("#stat-izin-pulang-cepat");
 const elKeluar = container.querySelector("#stat-izin-keluar");

 if (elTotal) elTotal.textContent = tTotal;
 if (elTerlambat) elTerlambat.textContent = tTerlambat;
 if (elPulangCepat) elPulangCepat.textContent = tPulangCepat;
 if (elKeluar) elKeluar.textContent = tKeluar;
 }

 function renderTable() {
 let filtered = allIzinRecords.filter(r => {
 if (filterJenis !== "ALL" && r.jenis_izin !== filterJenis) return false;
 
 const st = (r.status_final || r.status || "PENDING").toUpperCase();
 if (filterStatus === "APPROVED" && !st.includes("APPROVED") && !st.includes("DISETUJUI")) return false;
 if (filterStatus === "REJECTED" && !st.includes("REJECTED") && !st.includes("DITOLAK")) return false;
 if (filterStatus === "PENDING" && (st.includes("APPROVED") || st.includes("DISETUJUI") || st.includes("REJECTED") || st.includes("DITOLAK"))) return false;

 if (searchKeyword) {
 const k = searchKeyword.toLowerCase();
 const refStr = (r.no_referensi || r.id || "").toLowerCase();
 const nameStr = (r.nama_pemohon || "").toLowerCase();
 const reasonStr = (r.alasan_izin || r.alasan || "").toLowerCase();
 if (!refStr.includes(k) && !nameStr.includes(k) && !reasonStr.includes(k)) return false;
 }
 return true;
 });

 if (!filtered.length) {
 tbody.innerHTML = "";
 emptyWrap.innerHTML = emptyState("Belum Ada Pengajuan Izin", "Silakan buat permohonan izin baru dengan menekan tombol 'Buat Pengajuan Izin'.");
 return;
 }

 emptyWrap.innerHTML = "";
 tbody.innerHTML = filtered.map(r => {
 const jCfg = JENIS_IZIN_MAP[r.jenis_izin] || JENIS_IZIN_MAP.IZIN_TERLAMBAT;
 const st = (r.status_final || r.status || "PENDING").toUpperCase();

 let stBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⏳ PENDING</span>`;
 if (st.includes("APPROVED") || st.includes("DISETUJUI")) {
 stBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">APPROVED</span>`;
 } else if (st.includes("REJECTED") || st.includes("DITOLAK")) {
 stBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">REJECTED</span>`;
 }

 const isMyRecord = (r.nama_pemohon || "").toLowerCase() === (session.nama || "").toLowerCase();
 const canApprove = (isAtasan || isHrdOrAdmin) && (st === "PENDING" || st === "MENUNGGU PERSETUJUAN");

 return `
 <tr class="hover:bg-slate-50 transition">
 <td class="px-4 py-3">
 <span class="font-bold text-slate-800 block">${escapeHtml(r.no_referensi || r.id)}</span>
 <span class="text-[10px] text-slate-400 block">${fmtDate(r.tanggal_izin || r.tanggal_pengajuan || r.created_at)}</span>
 </td>
 <td class="px-4 py-3">
 <span class="font-bold text-slate-800 block">${escapeHtml(r.nama_pemohon || "-")}</span>
 <span class="text-[10px] text-slate-500">${escapeHtml(r.jabatan || r.posisi || "-")} (${escapeHtml(r.cabang || "-")})</span>
 </td>
 <td class="px-4 py-3">
 <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${jCfg.badgeClass}">
 ${jCfg.icon} ${jCfg.label}
 </span>
 </td>
 <td class="px-4 py-3 font-semibold text-slate-700">
 ${escapeHtml(r.jam_izin || r.durasi_jam || "-")}
 </td>
 <td class="px-4 py-3 text-slate-600 max-w-xs truncate" title="${escapeHtml(r.alasan_izin || r.alasan || '-')}">
 ${escapeHtml(r.alasan_izin || r.alasan || "-")}
 </td>
 <td class="px-4 py-3">
 ${stBadge}
 </td>
 <td class="px-4 py-3 text-right">
 <div class="flex items-center justify-end gap-1.5">
 <button data-print-izin="${r.id}" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition shadow-2xs" title="Cetak Surat Izin Resmi">
 Cetak Surat
 </button>
 ${canApprove ? `
 <button data-approve-izin="${r.id}" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition" title="Setujui Pengajuan">
 [v]
 </button>
 <button data-reject-izin="${r.id}" class="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition" title="Tolak Pengajuan">
 [X]
 </button>
 ` : ''}
 ${(isMyRecord || isHrdOrAdmin) ? `
 <button data-del-izin="${r.id}" class="px-2 py-1 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg font-bold text-[11px] border border-slate-200 transition" title="Hapus">
 
 </button>
 ` : ''}
 </div>
 </td>
 </tr>`;
 }).join("");

 // Bind Action Buttons
 tbody.querySelectorAll("[data-print-izin]").forEach(btn => {
 btn.onclick = () => {
 const row = allIzinRecords.find(x => x.id === btn.dataset.printIzin);
 if (row) openPrintIzinModal(row, allIzinRecords);
 };
 });

 tbody.querySelectorAll("[data-approve-izin]").forEach(btn => {
 btn.onclick = async () => {
 const row = allIzinRecords.find(x => x.id === btn.dataset.approveIzin);
 if (!row) return;
 if (confirm(`Apakah Anda yakin ingin MENYETUJUI pengajuan izin untuk "${row.nama_pemohon}"?`)) {
 await fsUpdate(COL.DATA_PENGAJUAN, row.id, {
 status_final: "APPROVED",
 status: "APPROVED",
 approved_by: session.nama,
 tanggal_approved: new Date().toISOString()
 });
 toast("Pengajuan izin berhasil disetujui!", "success");
 await loadData();
 }
 };
 });

 tbody.querySelectorAll("[data-reject-izin]").forEach(btn => {
 btn.onclick = async () => {
 const row = allIzinRecords.find(x => x.id === btn.dataset.rejectIzin);
 if (!row) return;
 const note = prompt("Alasan penolakan pengajuan izin:");
 if (note !== null) {
 await fsUpdate(COL.DATA_PENGAJUAN, row.id, {
 status_final: "REJECTED",
 status: "REJECTED",
 rejected_by: session.nama,
 catatan_penolakan: note,
 tanggal_rejected: new Date().toISOString()
 });
 toast("Pengajuan izin telah ditolak.", "info");
 await loadData();
 }
 };
 });

 tbody.querySelectorAll("[data-del-izin]").forEach(btn => {
 btn.onclick = async () => {
 const row = allIzinRecords.find(x => x.id === btn.dataset.delIzin);
 if (!row) return;
 if (confirm(`Apakah Anda yakin ingin menghapus catatan pengajuan izin "${row.no_referensi || row.id}"?`)) {
 await fsDelete(COL.DATA_PENGAJUAN, row.id);
 toast("Pengajuan izin berhasil dihapus.", "success");
 await loadData();
 }
 };
 });
 }

 // Open Form Modal Pengajuan Izin Baru
 async function openBuatIzinModal() {
 let allEmployees = [];
 try {
 allEmployees = await fsGetAll(COL.MASTER_KARYAWAN);
 } catch(e) {}

 const myNik = session.nik || "";
 let myKaryawan = allEmployees.find(k => String(k.nik || k.nik_karyawan) === String(myNik)) || null;

 const todayStr = new Date().toISOString().split("T")[0];

 const optAtasanHtml = allEmployees.map(k => `
 <option value="${escapeHtml(k.nama_karyawan)}" ${ (myKaryawan && (myKaryawan.atasan_langsung === k.nama_karyawan || myKaryawan.atasan === k.nama_karyawan)) ? 'selected' : '' }>
 ${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || 'Atasan')} (${escapeHtml(k.cabang || '-')})
 </option>
 `).join("");

 const optPemohonHtml = allEmployees.map(k => `
 <option value="${escapeHtml(k.nama_karyawan)}" ${ (k.nama_karyawan || "").toLowerCase() === (session.nama || "").toLowerCase() ? 'selected' : '' }>
 ${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || 'Karyawan')} (${escapeHtml(k.cabang || '-')})
 </option>
 `).join("");

 openModal({
 title: "Buat Pengajuan Izin Karyawan",
 size: "lg",
 bodyHtml: `
 <form id="form-permohonan-izin" class="space-y-4 text-left">
 <div class="p-3 bg-maroon-50 border border-maroon-200 rounded-xl text-xs text-maroon-900 leading-relaxed">
 <strong class="font-bold block text-maroon-950 text-sm mb-0.5">Formulir Permohonan Izin Resmi Perusahaan</strong>
 Gunakan formulir ini untuk mengajukan izin kedatangan terlambat, pulang sebelum jam kerja usai, atau keluar kantor untuk urusan mendesak/dinas samping. Dokumen izin resmi dapat dicetak setelah pengajuan dibuat.
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Jenis Izin <span class="text-rose-500">*</span></label>
 <select id="f-jenis-izin" required class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-maroon-500 bg-white">
 <option value="IZIN_TERLAMBAT">⏰ Izin Datang Terlambat</option>
 <option value="IZIN_PULANG_CEPAT">Izin Pulang Cepat</option>
 <option value="IZIN_KELUAR_KANTOR">Izin Keluar Kantor / Dinas Samping</option>
 </select>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Izin <span class="text-rose-500">*</span></label>
 <input type="date" id="f-tanggal-izin" value="${todayStr}" required class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-maroon-500">
 </div>
 </div>

 <!-- DYNAMIC TIME / DURATION FIELDS -->
 <div id="dynamic-time-fields" class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
 <!-- Rendered by event listener -->
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Nama Pemohon (Karyawan) <span class="text-rose-500">*</span></label>
 ${isHrdOrAdmin ? `
 <select id="f-nama-pemohon" required class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-maroon-500 bg-white">
 <option value="">-- Pilih Karyawan Pemohon --</option>
 ${optPemohonHtml}
 </select>
 ` : `
 <input type="text" id="f-nama-pemohon-static" value="${escapeHtml(session.nama || '-')}" readonly class="w-full px-3 py-2 text-xs font-bold border border-slate-200 bg-slate-100 rounded-xl text-slate-600">
 `}
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Atasan Langsung / Penanggung Jawab <span class="text-rose-500">*</span></label>
 <select id="f-atasan-langsung" required class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-maroon-500 bg-white">
 <option value="">-- Pilih Atasan Langsung --</option>
 ${optAtasanHtml}
 </select>
 </div>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Alasan & Keperluan Izin <span class="text-rose-500">*</span></label>
 <textarea id="f-alasan-izin" rows="3" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-500 font-medium" placeholder="Tuliskan secara jelas alasan atau keperluan permohonan izin Anda..."></textarea>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-700 mb-1">Lampiran / Bukti Pendukung (Opsional)</label>
 <input type="file" id="f-lampiran-file" accept="image/*,.pdf,.doc,.docx" class="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-maroon-50 file:text-maroon-700 hover:file:bg-maroon-100 cursor-pointer border border-slate-200 rounded-xl p-1">
 <span class="text-[10px] text-slate-400 mt-1 block">Contoh: Surat Dokter, Undangan Dinas, Bukti Kendala Kendaraan, dll.</span>
 </div>
 </form>
 `,
 footerHtml: `
 <div class="flex items-center justify-end gap-2 w-full">
 <button id="btn-cancel-izin" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition">Batal</button>
 <button id="btn-submit-izin" class="px-5 py-2 bg-maroon-700 text-white rounded-lg text-xs font-bold hover:bg-maroon-800 transition shadow-sm flex items-center gap-1.5">Kirim Pengajuan Izin</button>
 </div>
 `,
 onMount: (m) => {
 const selJenis = m.querySelector("#f-jenis-izin");
 const timeWrap = m.querySelector("#dynamic-time-fields");
 const selPemohon = m.querySelector("#f-nama-pemohon");
 const selAtasan = m.querySelector("#f-atasan-langsung");

 if (selPemohon && selAtasan) {
 selPemohon.addEventListener("change", () => {
 const chosenName = selPemohon.value;
 if (!chosenName) return;
 const empObj = allEmployees.find(k => (k.nama_karyawan || "").toLowerCase() === chosenName.toLowerCase());
 if (empObj) {
 const directAtasan = empObj.atasan_langsung || empObj.atasan || "";
 if (directAtasan) {
 const optMatch = Array.from(selAtasan.options).find(o => o.value.toLowerCase() === directAtasan.toLowerCase());
 if (optMatch) selAtasan.value = optMatch.value;
 }
 }
 });
 }

 function renderTimeFields() {
 const val = selJenis.value;
 if (val === "IZIN_TERLAMBAT") {
 timeWrap.innerHTML = `
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-amber-900 mb-1">Jam Jam Kerja Normal</label>
 <input type="text" value="08:00 WIB" readonly class="w-full px-3 py-1.5 text-xs font-bold border border-amber-200 bg-amber-50/50 rounded-lg text-amber-900">
 </div>
 <div>
 <label class="block text-xs font-bold text-amber-900 mb-1">Estimasi Jam Tiba di Kantor <span class="text-rose-500">*</span></label>
 <input type="time" id="f-jam-tiba" required class="w-full px-3 py-1.5 text-xs font-bold border border-amber-300 rounded-lg outline-none focus:border-amber-600 bg-white" value="09:00">
 </div>
 </div>`;
 } else if (val === "IZIN_PULANG_CEPAT") {
 timeWrap.innerHTML = `
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-blue-900 mb-1">Jam Pulang Normal</label>
 <input type="text" value="17:00 WIB" readonly class="w-full px-3 py-1.5 text-xs font-bold border border-blue-200 bg-blue-50/50 rounded-lg text-blue-900">
 </div>
 <div>
 <label class="block text-xs font-bold text-blue-900 mb-1">Estimasi Jam Pulang / Meninggalkan Kantor <span class="text-rose-500">*</span></label>
 <input type="time" id="f-jam-pulang" required class="w-full px-3 py-1.5 text-xs font-bold border border-blue-300 rounded-lg outline-none focus:border-blue-600 bg-white" value="15:00">
 </div>
 </div>`;
 } else {
 timeWrap.innerHTML = `
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-bold text-purple-900 mb-1">Jam Keluar Kantor <span class="text-rose-500">*</span></label>
 <input type="time" id="f-jam-keluar" required class="w-full px-3 py-1.5 text-xs font-bold border border-purple-300 rounded-lg outline-none focus:border-purple-600 bg-white" value="10:00">
 </div>
 <div>
 <label class="block text-xs font-bold text-purple-900 mb-1">Estimasi Jam Kembali ke Kantor <span class="text-rose-500">*</span></label>
 <input type="time" id="f-jam-kembali" required class="w-full px-3 py-1.5 text-xs font-bold border border-purple-300 rounded-lg outline-none focus:border-purple-600 bg-white" value="13:00">
 </div>
 </div>`;
 }
 }

 renderTimeFields();
 selJenis.addEventListener("change", renderTimeFields);

 m.querySelector("#btn-cancel-izin").onclick = closeModal;
 m.querySelector("#btn-submit-izin").onclick = async () => {
 const form = m.querySelector("#form-permohonan-izin");
 if (!form.reportValidity()) return toast("Mohon isi semua kolom yang wajib diisi!", "warning");

 const jenisVal = selJenis.value;
 const tglVal = m.querySelector("#f-tanggal-izin").value;
 const atasanVal = m.querySelector("#f-atasan-langsung").value;
 const alasanVal = m.querySelector("#f-alasan-izin").value.trim();

 let targetEmpNama = session.nama;
 let targetEmpNik = session.nik || "-";
 let targetEmpJabatan = session.posisi || myKaryawan?.jabatan || "-";
 let targetEmpCabang = session.cabang || myKaryawan?.cabang || "Pusat";

 if (isHrdOrAdmin && selPemohon && selPemohon.value) {
 targetEmpNama = selPemohon.value;
 const matchedEmp = allEmployees.find(k => (k.nama_karyawan || "").toLowerCase() === targetEmpNama.toLowerCase());
 if (matchedEmp) {
 targetEmpNik = matchedEmp.nik || matchedEmp.nik_karyawan || "-";
 targetEmpJabatan = matchedEmp.jabatan || "-";
 targetEmpCabang = matchedEmp.cabang || "Pusat";
 }
 }

 let jamStr = "";
 if (jenisVal === "IZIN_TERLAMBAT") {
 const jamTiba = m.querySelector("#f-jam-tiba") ? m.querySelector("#f-jam-tiba").value : "";
 jamStr = `Estimasi Tiba: ${jamTiba} WIB (Jam Masuk: 08:00)`;
 } else if (jenisVal === "IZIN_PULANG_CEPAT") {
 const jamPulang = m.querySelector("#f-jam-pulang") ? m.querySelector("#f-jam-pulang").value : "";
 jamStr = `Estimasi Pulang: ${jamPulang} WIB (Jam Pulang Normal: 17:00)`;
 } else {
 const jamKeluar = m.querySelector("#f-jam-keluar") ? m.querySelector("#f-jam-keluar").value : "";
 const jamKembali = m.querySelector("#f-jam-kembali") ? m.querySelector("#f-jam-kembali").value : "";
 jamStr = `Jam Keluar: ${jamKeluar} WIB s/d Jam Kembali: ${jamKembali} WIB`;
 }

 const fileInput = m.querySelector("#f-lampiran-file");
 let fileUrl = "";
 if (fileInput && fileInput.files && fileInput.files[0]) {
 try {
 toast("Mengunggah lampiran pendukung...", "info");
 fileUrl = await uploadFileToDrive(fileInput.files[0]);
 } catch(fErr) {
 console.warn("Upload lampiran error:", fErr);
 }
 }

 const btn = m.querySelector("#btn-submit-izin");
 btn.disabled = true; btn.textContent = "Mengirim Pengajuan...";

 try {
 const nowIso = new Date().toISOString();
 const genNoRef = `IZIN/ANDELA/${new Date().getFullYear()}/${String(new Date().getMonth()+1).padStart(2, "0")}/${genId("IZN").slice(-4)}`;

 const payload = {
 id: genNoRef,
 no_referensi: genNoRef,
 tgl: nowIso,
 form_id: "F-ISO-IZIN",
 id_form: "F-ISO-IZIN",
 tipe_form: "FORM_IZIN",
 kategori: "IZIN",
 nama_form: "Formulir Permohonan Izin Karyawan",
 jenis_izin: jenisVal,
 tanggal_izin: tglVal,
 tanggal_pengajuan: nowIso,
 jam_izin: jamStr,
 alasan_izin: alasanVal,
 alasan: alasanVal,
 nama_pemohon: targetEmpNama,
 pemohon: targetEmpNama,
 nik: targetEmpNik,
 nik_pemohon: targetEmpNik,
 jabatan: targetEmpJabatan,
 cabang: targetEmpCabang,
 atasan_langsung: atasanVal,
 penanggung_jawab: atasanVal,
 lampiran_url: fileUrl,
 status: "MENUNGGU",
 status_final: "MENUNGGU",
 approval_flow: ["ATASAN", "HRD"],
 approval_steps: ["PENDING", "PENDING"],
 catatan_penolakan: [],
 detail: {
 jenis_izin: JENIS_IZIN_MAP[jenisVal]?.label || jenisVal,
 tanggal_izin: tglVal,
 jam_izin: jamStr,
 alasan: alasanVal,
 atasan_langsung: atasanVal
 },
 created_at: nowIso,
 createdAt: nowIso
 };

 await fsAdd(COL.DATA_PENGAJUAN, payload, genNoRef);

 // Send Notifications to Atasan & Target Employee
 try {
 const notifTitle = `Pengajuan Izin Baru: ${targetEmpNama}`;
 const notifMsg = `${targetEmpNama} (${targetEmpJabatan}) mengajukan ${JENIS_IZIN_MAP[jenisVal]?.label || 'Izin'} untuk tanggal ${tglVal}. Membutuhkan persetujuan Anda.`;
 const notifLink = `#approval?id=${genNoRef}`;

 if (atasanVal) {
 await notifyUser(atasanVal, notifTitle, notifMsg, notifLink);
 }

 let atasanTargets = await getTargetsForRole("ATASAN", targetEmpNama);
 for (const t of atasanTargets) {
 if (t.username && t.username !== atasanVal) {
 await notifyUser(t.username, notifTitle, notifMsg, notifLink);
 }
 }

 if (targetEmpNama !== session.nama) {
 await notifyUser(
 targetEmpNama,
 `ℹ️ Pengajuan Izin Dibuatkan oleh HRD`,
 `Pengajuan ${JENIS_IZIN_MAP[jenisVal]?.label || 'Izin'} Anda untuk tanggal ${tglVal} telah dibuatkan oleh HRD (${session.nama}) dan dikirimkan ke atasan (${atasanVal}).`,
 `#izin`
 );
 }
 } catch (nErr) {
 console.warn("Gagal mengirim notifikasi izin:", nErr);
 }

 toast("Pengajuan izin berhasil dibuat!", "success");
 closeModal();
 await loadData();
 } catch(err) {
 toast("Gagal menyimpan pengajuan: " + err.message, "error");
 btn.disabled = false; btn.textContent = "Kirim Pengajuan Izin";
 }
 };
 }
 });
 }

 // Bind Events
 container.querySelector("#btn-buat-izin")?.addEventListener("click", openBuatIzinModal);

 container.querySelector("#filter-jenis-izin")?.addEventListener("change", (e) => {
 filterJenis = e.target.value;
 renderTable();
 });

 container.querySelector("#filter-status-izin")?.addEventListener("change", (e) => {
 filterStatus = e.target.value;
 renderTable();
 });

 container.querySelector("#search-izin-input")?.addEventListener("input", (e) => {
 searchKeyword = e.target.value.trim();
 renderTable();
 });

 await loadData();
}

/**
 * =====================================================================
 * PRINT SURAT IZIN FORMAT HEMAT KERTAS (1/2 A4 LANDSCAPE - 2 SLIP PER SHEET)
 * =====================================================================
 */
export function renderIzinCardHtml(record, copyLabel = "LEMBAR PEMOHON") {
 if (!record) {
 return `
 <div style="height: 100%; border: 2px dashed #94a3b8; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #64748b; padding: 20px; box-sizing: border-box;">
 <div style="font-size: 32px; margin-bottom: 8px;"></div>
 <div style="font-weight: bold; font-size: 13px; color: #334155;">Slot Izin 2 Kosong</div>
 <div style="font-size: 10px; margin-top: 4px; color: #64748b;">(Dapat dipotong dua untuk digunakan nanti)</div>
 </div>
 `;
 }

 const jCfg = JENIS_IZIN_MAP[record.jenis_izin] || JENIS_IZIN_MAP.IZIN_TERLAMBAT;
 const noRef = record.no_referensi || record.id || "HR5";

 // Indonesian Day and Date Formatter
 let dayDateStr = "-";
 if (record.tanggal_izin) {
 const d = new Date(record.tanggal_izin);
 if (!isNaN(d.getTime())) {
 const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
 const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
 dayDateStr = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
 } else {
 dayDateStr = record.tanggal_izin;
 }
 }

 // Submission Date Formatter for City line
 let cityDateStr = "CIREBON, " + fmtDate(record.tanggal_pengajuan || record.created_at || new Date());

 const nama = record.nama_pemohon || "-";
 const jabatan = record.jabatan || "-";
 const unitKerja = record.unit_kerja || record.cabang || "ADMIN";
 const jam = record.jam_izin || record.durasi_jam || "08:00";
 const alasan = record.alasan_izin || record.alasan || "-";

 let titleHeader = "FORMULIR IZIN DATANG TERLAMBAT/PULANG AWAL";
 if (record.jenis_izin === "IZIN_KELUAR") {
 titleHeader = "FORMULIR IZIN KELUAR KANTOR / TUGAS";
 } else if (record.jenis_izin === "SIT IN") {
 titleHeader = "FORMULIR IZIN SIT IN / TUGAS LUAR";
 } else if (record.jenis_izin === "TUGAS_LUAR") {
 titleHeader = "FORMULIR IZIN TUGAS LUAR / DINAS";
 }

 return `
 <div style="box-sizing: border-box; width: 100%; height: 100%; border: 1.5px solid #000; padding: 10px 12px; font-family: Arial, sans-serif; font-size: 10.5px; color: #000; background: #fff; display: flex; flex-direction: column; justify-content: space-between;">
 <div>
 <!-- ISO HEADER TABLE -->
 <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 10px; font-size: 10px;">
 <tr>
 <!-- LOGO BOX -->
 <td style="width: 75px; border-right: 1px solid #000; text-align: center; vertical-align: middle; padding: 4px; background: #fff;">
 <img src="${LOGO_DATA_URI}" alt="Logo CV ANDELA JAYA" style="width: 48px; height: 48px; object-fit: contain; margin: 0 auto; display: block;" />
 </td>
 <!-- RIGHT SUB-TABLE -->
 <td style="padding: 0; vertical-align: top;">
 <table style="width: 100%; border-collapse: collapse;">
 <tr>
 <td colspan="4" style="background: #dbeafe; text-align: center; font-weight: bold; font-size: 10.5px; border-bottom: 1px solid #000; padding: 3px 4px; text-transform: uppercase; color: #000;">
 ${titleHeader}
 </td>
 </tr>
 <tr>
 <td colspan="4" style="text-align: center; font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding: 2.5px 4px; color: #000;">
 ${COMPANY_NAME}
 </td>
 </tr>
 <tr style="font-size: 8.5px; text-align: center;">
 <td style="border-right: 1px solid #000; padding: 2px 4px; width: 25%;">Hal : 1 dari 1</td>
 <td style="border-right: 1px solid #000; padding: 2px 4px; width: 25%;">No Dok : ${escapeHtml(noRef)}</td>
 <td style="border-right: 1px solid #000; padding: 2px 4px; width: 25%;">Terbit/ Revisi : 1/0</td>
 <td style="padding: 2px 4px; width: 25%;">Tgl terbit : 16 Mei 2023</td>
 </tr>
 </table>
 </td>
 </tr>
 </table>

 <!-- BODY CONTENT -->
 <div style="margin-bottom: 6px; font-size: 10.5px; line-height: 1.5;">
 <div style="margin-bottom: 4px;">Yang bertanda tangan dibawah ini :</div>
 
 <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 3px;">
 <tr>
 <td style="width: 90px; vertical-align: bottom; padding: 1.5px 0;">Nama</td>
 <td style="width: 12px; vertical-align: bottom; padding: 1.5px 0;">:</td>
 <td style="border-bottom: 1px solid #000; font-weight: bold; vertical-align: bottom; padding: 1.5px 4px;">${escapeHtml(nama)}</td>
 </tr>
 <tr>
 <td style="vertical-align: bottom; padding: 1.5px 0;">Jabatan</td>
 <td style="vertical-align: bottom; padding: 1.5px 0;">:</td>
 <td style="border-bottom: 1px solid #000; font-weight: bold; vertical-align: bottom; padding: 1.5px 4px;">${escapeHtml(jabatan)}</td>
 </tr>
 <tr>
 <td style="vertical-align: bottom; padding: 1.5px 0;">Unit Kerja</td>
 <td style="vertical-align: bottom; padding: 1.5px 0;">:</td>
 <td style="border-bottom: 1px solid #000; font-weight: bold; vertical-align: bottom; padding: 1.5px 4px;">${escapeHtml(unitKerja)}</td>
 </tr>
 </table>

 <div style="margin-top: 4px; margin-bottom: 3px;">
 Mohon izin datang terlambat/pulang lebih awal *), pada hari <span style="border-bottom: 1px solid #000; font-weight: bold; padding: 0 8px; display: inline-block;">${escapeHtml(dayDateStr)}</span> pukul <span style="border-bottom: 1px solid #000; font-weight: bold; padding: 0 8px; display: inline-block;">${escapeHtml(jam)}</span>
 </div>

 <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 3px; margin-bottom: 8px;">
 <tr>
 <td style="width: 90px; vertical-align: bottom; padding: 1.5px 0;">dengan alasan</td>
 <td style="width: 12px; vertical-align: bottom; padding: 1.5px 0;">:</td>
 <td style="border-bottom: 1px solid #000; font-weight: bold; vertical-align: bottom; padding: 1.5px 4px;">${escapeHtml(alasan)}</td>
 </tr>
 </table>

 <div style="margin-bottom: 4px;">Atas perhatian Bapak/Ibu, kami ucapkan terima kasih.</div>
 <div style="border-bottom: 1px solid #000; display: inline-block; font-weight: bold; min-width: 180px; margin-bottom: 6px;">${escapeHtml(cityDateStr)}</div>
 </div>
 </div>

 <!-- FOOTER & SIGNATURE SECTION -->
 <div>
 <div style="font-weight: normal; margin-bottom: 4px; font-size: 10px;">Menyetujui :</div>

 <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 10px;">
 <tr>
 <td style="width: 33.33%; vertical-align: top;">
 <div>Atasan Langsung,</div>
 <div style="height: 35px;"></div>
 <div style="border-top: 1px solid #000; width: 80%; margin: 0 auto; padding-top: 2px;"></div>
 </td>
 <td style="width: 33.33%; vertical-align: top;">
 <div>HRD,</div>
 <div style="height: 35px;"></div>
 <div style="border-top: 1px solid #000; width: 80%; margin: 0 auto; padding-top: 2px;"></div>
 </td>
 <td style="width: 33.33%; vertical-align: top;">
 <div>Mengajukan,<br/>Pemohon Ijin,</div>
 <div style="height: 22px;"></div>
 <div style="border-top: 1px solid #000; width: 85%; margin: 0 auto; padding-top: 2px; font-weight: bold;">${escapeHtml(nama)}</div>
 </td>
 </tr>
 </table>

 <div style="font-size: 8px; font-style: italic; margin-top: 4px; color: #000;">
 *coret yang tidak perlu
 </div>
 </div>
 </div>
 `;
}

export function openPrintIzinModal(record1, allRecords = []) {
 if (!record1) return;

 const otherRecords = allRecords.filter(r => r.id !== record1.id);
 const otherOptionsHtml = otherRecords.map(r => `
 <option value="${r.id}">${escapeHtml(r.nama_pemohon)} - ${escapeHtml(r.jenis_izin)} (${fmtDateShort(r.tanggal_izin || r.created_at)})</option>
 `).join("");

 openModal({
 title: "Opsi Cetak Surat Izin (Format 1/2 A4 Landscape Hemat Kertas)",
 size: "md",
 bodyHtml: `
 <div class="space-y-4 text-left">
 <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed flex items-start gap-2.5">
 <span class="text-lg"></span>
 <div>
 <strong class="font-bold text-slate-900 block mb-0.5">Format 1 Kertas A4 = 2 Slip Izin Landscape (Top & Bottom)</strong>
 Masing-masing surat izin berbentuk landscape melebar (seperti dokumen resmi), disusun atas & bawah pada 1 kertas A4 dengan garis potong di tengah.
 </div>
 </div>

 <div class="space-y-3">
 <div class="p-3 bg-slate-100 rounded-xl border border-slate-200">
 <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">Slip Atas (Position 1):</span>
 <div class="font-bold text-xs text-slate-800">${escapeHtml(record1.nama_pemohon)}</div>
 <div class="text-[11px] text-slate-500">${escapeHtml(record1.no_referensi || record1.id)} - ${escapeHtml(record1.jenis_izin)}</div>
 </div>

 <div>
 <label class="block text-xs font-bold text-slate-800 mb-1">Pilih Isi Slip Bawah (Position 2) <span class="text-rose-500">*</span></label>
 <select id="sel-slot2-type" class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-maroon-500 bg-white">
 <option value="COPY_HRD">Rangkap 2 (${escapeHtml(record1.nama_pemohon)}: Lembar Karyawan + Lembar HRD)</option>
 <option value="OTHER_EMP">Gabungkan Izin Karyawan Lain (1 Kertas 2 Karyawan)</option>
 <option value="EMPTY">Biarkan Slip Bawah Kosong (Dipotong Nanti)</option>
 </select>
 </div>

 <div id="wrap-other-emp" class="hidden">
 <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Pengajuan Izin Karyawan Ke-2:</label>
 <select id="sel-other-emp-id" class="w-full px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl outline-none focus:border-maroon-500 bg-white">
 ${otherOptionsHtml.length ? otherOptionsHtml : '<option value="">(Tidak ada pengajuan izin lain)</option>'}
 </select>
 </div>
 </div>
 </div>
 `,
 footerHtml: `
 <div class="flex items-center justify-end gap-2 w-full">
 <button id="btn-cancel-print-opt" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition">Batal</button>
 <button id="btn-do-print-izin" class="px-5 py-2 bg-maroon-700 text-white rounded-lg text-xs font-bold hover:bg-maroon-800 transition shadow-sm flex items-center gap-1.5">Cetak / Preview PDF A4</button>
 </div>
 `,
 onMount: (m) => {
 const selType = m.querySelector("#sel-slot2-type");
 const wrapOther = m.querySelector("#wrap-other-emp");

 selType.onchange = () => {
 if (selType.value === "OTHER_EMP") {
 wrapOther.classList.remove("hidden");
 } else {
 wrapOther.classList.add("hidden");
 }
 };

 m.querySelector("#btn-cancel-print-opt").onclick = closeModal;
 m.querySelector("#btn-do-print-izin").onclick = () => {
 let record2 = null;
 let label1 = "LEMBAR PEMOHON / KARYAWAN";
 let label2 = "LEMBAR ARSIP HRD";

 if (selType.value === "OTHER_EMP") {
 const selOtherId = m.querySelector("#sel-other-emp-id").value;
 record2 = otherRecords.find(x => x.id === selOtherId) || null;
 label1 = "LEMBAR PEMOHON 1";
 label2 = "LEMBAR PEMOHON 2";
 } else if (selType.value === "EMPTY") {
 record2 = null;
 label1 = "LEMBAR PEMOHON";
 label2 = "SLOT KOSONG";
 } else {
 record2 = record1;
 }

 closeModal();
 printSuratIzin(record1, record2, label1, label2);
 };
 }
 });
}

export function printSuratIzin(record1, record2 = null, label1 = "LEMBAR PEMOHON", label2 = "LEMBAR ARSIP HRD") {
 if (!record1) return;

 const card1Html = renderIzinCardHtml(record1, label1);
 const card2Html = renderIzinCardHtml(record2, label2);

 const printHtml = `
 <!DOCTYPE html>
 <html lang="id">
 <head>
 <meta charset="UTF-8">
 <title>Surat Izin Karyawan - 1/2 A4 Landscape - ${escapeHtml(record1.nama_pemohon)}</title>
 <style>
 @page {
 size: A4 portrait;
 margin: 6mm 10mm;
 }
 * { box-sizing: border-box; }
 body {
 font-family: Arial, Helvetica, sans-serif;
 margin: 0;
 padding: 6px;
 background: #f8fafc;
 color: #000;
 -webkit-print-color-adjust: exact;
 print-color-adjust: exact;
 }
 .a4-wrapper {
 width: 100%;
 max-width: 190mm;
 min-height: 275mm;
 margin: 0 auto;
 background: #ffffff;
 display: flex;
 flex-direction: column;
 justify-content: space-between;
 }
 .card-slip-landscape {
 width: 100%;
 height: 132mm;
 box-sizing: border-box;
 background: #ffffff;
 }
 .cut-divider-horizontal {
 width: 100%;
 height: 8mm;
 display: flex;
 align-items: center;
 justify-content: center;
 border-top: 1.5px dashed #64748b;
 color: #475569;
 font-size: 8.5px;
 font-weight: bold;
 letter-spacing: 2px;
 text-align: center;
 margin: 2mm 0;
 }
 .no-print {
 margin-bottom: 12px;
 text-align: right;
 }
 @media print {
 body { padding: 0; background: #fff; }
 .a4-wrapper { border: none; box-shadow: none; min-height: 100vh; }
 .no-print { display: none !important; }
 }
 </style>
 </head>
 <body>
 <div class="no-print">
 <button onclick="window.print()" style="background: #800000; color: white; border: none; padding: 10px 20px; font-size: 12px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
 Cetak / Simpan PDF (1/2 A4 Landscape - 2 Izin per Kertas A4)
 </button>
 </div>

 <div class="a4-wrapper">
 <!-- SLOT ATAS -->
 <div class="card-slip-landscape">
 ${card1Html}
 </div>

 <!-- GARIS POTONG MIDWAY (HORIZONTAL) -->
 <div class="cut-divider-horizontal">
 <span>- - - - - - - - - - GARIS POTONG / CUT HERE (1/2 A4 LANDSCAPE) - - - - - - - - - - </span>
 </div>

 <!-- SLOT BAWAH -->
 <div class="card-slip-landscape">
 ${card2Html}
 </div>
 </div>
 </body>
 </html>
 `;

 const win = window.open("", "_blank", "width=950,height=800");
 if (win) {
 win.document.open();
 win.document.write(printHtml);
 win.document.close();
 } else {
 alert("Popup terblokir oleh browser. Harap izinkan popup untuk mencetak surat izin.");
 }
}
