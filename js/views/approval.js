import { db, COL, collection, query, where, getDocs } from "../firebase-config.js";
import { fsGetAll, fsUpdate, fsAdd, genId, openModal, closeModal, toast, fmtDateTime, escapeHtml, sendEmailNotif, buildStandardEmailHtml, getTargetsForRole, createLoginToken, notifyUser, renderPengajuanDetailHtml, printSalesKlaimForm, generateAndSaveCutiDocument, printFormCutiFisik, getCutiDeductionCategory } from "../utils.js";
import { badge, emptyState, skeletonRows } from "../components.js";

const CUTI_RULES = {
  "C - Cuti Tahunan": { jenis: "Tahunan", count: 1 },
  "C1/2 - Cuti Setengah Hari": { jenis: "Tahunan", count: 0.5 },
  "C+ - Cuti Khusus": { jenis: "Khusus", count: 1 },
  "S - Sakit dgn Surat Dokter": { jenis: "Tidak Dipotong", count: 0 }, 
  "S- - Sakit tanpa Surat Dokter": { jenis: "Tahunan", count: 1 },
  "CB - Cuti Bersama": { jenis: "Tahunan", count: 1 },
  "C- - Potong Gaji": { jenis: "Potong Gaji", count: 1 },
  "CS - Cuti Sisa": { jenis: "Akumulasi", count: 1 },
  "C+1/2 - Cuti Khusus Setengah Hari": { jenis: "Khusus", count: 0.5 },
  "D - Dinas Luar Kota": { jenis: "Tidak Dipotong", count: 0 },
  "C-BESAR - Cuti Besar": { jenis: "Tidak Dipotong", count: 0 }
};

const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

let allPengajuan = [], karyawanByNama = {};

export async function mount(container, { session }) {
 const listEl = container.querySelector("#approval-list");
 listEl.innerHTML = skeletonRows(3);
 
 const [pengajuanRows, karyawanRows] = await Promise.all([
 fsGetAll(COL.DATA_PENGAJUAN),
 fsGetAll(COL.MASTER_KARYAWAN)
 ]);
 
 allPengajuan = pengajuanRows;
 karyawanByNama = Object.fromEntries(karyawanRows.map(k => [k.nama_karyawan, k]));
 
 let activeTab = "pending";
 renderList(container, session, activeTab);
 
 container.querySelectorAll(".approval-tab-btn").forEach(btn => {
 btn.addEventListener("click", () => {
 activeTab = btn.dataset.tab;
 container.querySelectorAll(".approval-tab-btn").forEach(b => {
 b.classList.toggle("bg-maroon-700", b === btn);
 b.classList.toggle("text-white", b === btn);
 b.classList.toggle("text-slate-600", b !== btn);
 });
 renderList(container, session, activeTab);
 });
 });
 
 return { unmount() {} };
}

function currentStepIndex(row) {
 const steps = row.approval_steps || ["PENDING", "PENDING"];
 return steps.findIndex(s => s === "PENDING");
}

function isEligible(row, session) {
 const idx = currentStepIndex(row);
 if (idx === -1) return false;
 
 const flow = row.approval_flow || ["ATASAN", "HRD"];
 const stepLabel = (flow[idx] || "").trim();
 if (!stepLabel) return false;
 
 const stepUpper = stepLabel.toUpperCase();
 const myRole = (session.role || "").toUpperCase().trim();
 const myNameLower = (session.nama || "").trim().toLowerCase();
 const myPosisi = (session.posisi || session.jabatan || "").toUpperCase().trim();

 if (stepUpper === "ATASAN") {
 const pemohon = karyawanByNama[row.nama_pemohon] || {};
 const atasanInMaster = (pemohon.atasan || pemohon.atasan_langsung || pemohon.nama_atasan || "").trim().toLowerCase();
 const atasanInRow = (row.atasan_langsung || row.penanggung_jawab || "").trim().toLowerCase();

 const isDirectAtasan = (atasanInRow && atasanInRow === myNameLower) || (atasanInMaster && atasanInMaster === myNameLower);
 const isSuperAdmin = myRole === "SUPERADMIN";

 return isDirectAtasan || isSuperAdmin || myRole === "ATASAN";
 }

 if (stepUpper === "GM" || stepUpper === "GENERAL MANAGER") {
 const isGm = myRole === "GM" || myRole === "GENERAL MANAGER" || myPosisi.includes("GM") || myPosisi.includes("GENERAL MANAGER");
 return isGm || myRole === "SUPERADMIN";
 }

 if (stepUpper === "HRD" || stepUpper === "HR") {
 const isHrd = myRole === "HRD" || myRole === "ADMIN" || myRole === "ADMINISTRATOR" || myRole === "SUPERADMIN";
 return isHrd;
 }

 if (stepUpper === "FINANCE" || stepUpper === "ACCOUNTING") {
 const isFin = myRole === "FINANCE" || myRole === "ACCOUNTING" || myRole === "SUPERADMIN";
 return isFin;
 }

 if (stepUpper === "SPV" || stepUpper === "SUPERVISOR") {
 const isSpv = myRole === "SPV" || myRole === "SUPERVISOR" || myPosisi.includes("SPV") || myPosisi.includes("SUPERVISOR");
 return isSpv || myRole === "SUPERADMIN";
 }

 if (stepUpper === "MANAGER" || stepUpper === "MANAJER") {
 const isMgr = myRole === "MANAGER" || myRole === "MANAJER" || myPosisi.includes("MANAGER") || myPosisi.includes("MANAJER");
 return isMgr || myRole === "SUPERADMIN";
 }

 return stepUpper === myRole || myRole === "SUPERADMIN" || myPosisi.includes(stepUpper) || myNameLower === stepLabel.toLowerCase();
}

function renderList(container, session, tab) {
 const listEl = container.querySelector("#approval-list");
 let rows;
 
 if (tab === "pending") {
 rows = allPengajuan.filter(r => {
 const st = (r.status_final || r.status || "MENUNGGU").toUpperCase();
 const isPendingStatus = st === "MENUNGGU" || st === "PENDING" || st.includes("MENUNGGU");
 return isPendingStatus && isEligible(r, session);
 });
 } else {
 rows = allPengajuan.filter(r => (r.catatan_penolakan || []).some(c => String(c).includes(session.nama)) || (r.approved_by && r.approved_by === session.nama));
 }
 
 rows.sort((a, b) => new Date(b.tgl) - new Date(a.tgl));
 
 if (!rows.length) {
 listEl.innerHTML = emptyState(tab === "pending" ? "Tidak ada pengajuan menunggu persetujuan Anda" : "Belum ada riwayat proses persetujuan", "Semua sudah beres!");
 return;
 }
 
 listEl.innerHTML = rows.map(r => {
 const idx = currentStepIndex(r);
 const tone = r.status_final?.includes("APPROVED") ? "green" : r.status_final?.includes("REJECT") ? "red" : "amber";
 
 const stepsHtml = (r.approval_flow || []).map((step, i) => {
 const st = (r.approval_steps || [])[i];
 const cls = st === "APPROVE" ? "bg-emerald-100 text-emerald-700" : st === "REJECT" ? "bg-red-100 text-red-700" : i === idx ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" : "bg-slate-100 text-slate-400";
 return "<span class=\"px-2.5 py-1 rounded-full text-xs font-medium " + cls + "\">" + (i + 1) + ". " + escapeHtml(step) + "</span>";
 }).join('<span class="text-slate-300"> </span>');
 
 const isPotongGaji = r.is_potong_gaji || r.potong_gaji || (r.detail && (r.detail.is_potong_gaji || r.detail.potong_gaji)) || (r.kategori_cuti || "").includes("Potong Gaji");
    const potongHari = r.potong_gaji_hari || (r.detail && r.detail.potong_gaji_hari) || r.jumlah_hari || 1;

    return `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${isPotongGaji ? "ring-2 ring-rose-300 bg-rose-50/20" : ""}">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-semibold text-slate-800">${escapeHtml(r.nama_form)}</p>
            ${isPotongGaji ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">⚠️ POTONG GAJI (${potongHari} HARI)</span>` : ""}
          </div>
 <p class="text-sm text-slate-500 mt-0.5">Diajukan oleh <span class="font-medium text-slate-700">${escapeHtml(r.nama_pemohon)}</span> • ${fmtDateTime(r.tgl)}</p>
 </div>
 ${badge(r.status_final, tone)}
 </div>
 <div class="flex items-center gap-2 mt-4 flex-wrap">
 ${stepsHtml}
 </div>
 <div class="mt-4 flex items-center justify-between">
 <button data-detail="${r.id}" class="text-xs text-maroon-700 font-medium hover:underline">Lihat Detail Pengajuan</button>
 ${tab === "pending" ? `
 <div class="flex gap-2">
 <button data-reject="${r.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition">Tolak</button>
 <button data-approve="${r.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-maroon-700 text-white hover:bg-maroon-800 transition">Setujui</button>
 </div>` : ""}
 </div>
 </div>`;
 }).join("");
 
 listEl.querySelectorAll("[data-detail]").forEach(btn => btn.addEventListener("click", () => showDetail(rows.find(r => r.id === btn.dataset.detail), session)));
 listEl.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", () => actionModal(rows.find(r => r.id === btn.dataset.approve), "APPROVE", session, container, tab)));
 listEl.querySelectorAll("[data-reject]").forEach(btn => btn.addEventListener("click", () => actionModal(rows.find(r => r.id === btn.dataset.reject), "REJECT", session, container, tab)));

 // Auto-open modal jika URL Hash mengandung id tertentu (mis. dari Klik Notifikasi)
 const idMatch = window.location.hash.match(/id=([a-zA-Z0-9_-]+)/);
 if (idMatch && idMatch[1]) {
 const targetRow = rows.find(x => x.id === idMatch[1]);
 if (targetRow) {
 setTimeout(() => showDetail(targetRow, session), 200);
 }
 }
}

function showDetail(row, session) {
 const detail = row.detail || {};
 const isHrd = session.role === "HRD";
 const isKlaimBensin = row.form_id === "F-KLAIM-BENSIN" || (row.nama_form || "").toLowerCase().includes("bensin");
 const isPending = row.status_final === "MENUNGGU";
 const canEdit = isHrd && isKlaimBensin && isPending;
 
 let body = "";
 if (!canEdit) {
 body = renderPengajuanDetailHtml(row, session);
 } else {
 const renderValue = (key, val) => {
 if (key === "rincian_tabel") {
 let tableHtml = `<div class="overflow-x-auto mt-2 border border-slate-200 rounded-lg">
 <table class="w-full text-xs text-left whitespace-nowrap" id="edit-klaim-table">
 <thead class="bg-slate-50 border-b border-slate-200">
 <tr>
 <th class="p-2 font-medium text-slate-500">Tanggal</th>
 <th class="p-2 font-medium text-slate-500">KM Awal</th>
 <th class="p-2 font-medium text-slate-500">KM Akhir</th>
 <th class="p-2 font-medium text-slate-500">Parkir (Rp)</th>
 <th class="p-2 font-medium text-slate-500">Denda (Rp)</th>
 <th class="p-2 font-medium text-slate-500">Total Petrol (Rp)</th>
 <th class="p-2 font-medium text-amber-600 bg-amber-50">Catatan Revisi HRD</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-100">`;
 
 val.forEach((item, index) => {
 tableHtml += `
 <tr data-index="${index}">
 <td class="p-2"><input type="date" class="klaim-input border border-slate-200 rounded p-1.5 w-full outline-none focus:border-maroon-400" data-field="tanggal" value="${item.tanggal}"></td>
 <td class="p-2"><input type="number" class="klaim-input border border-slate-200 rounded p-1.5 w-20 outline-none focus:border-maroon-400" data-field="km_awal" value="${item.km_awal}"></td>
 <td class="p-2"><input type="number" class="klaim-input border border-slate-200 rounded p-1.5 w-20 outline-none focus:border-maroon-400" data-field="km_akhir" value="${item.km_akhir}"></td>
 <td class="p-2"><input type="number" class="klaim-input border border-slate-200 rounded p-1.5 w-20 outline-none focus:border-maroon-400" data-field="parkir" value="${item.parkir}"></td>
 <td class="p-2"><input type="number" class="klaim-input border border-slate-200 rounded p-1.5 w-20 outline-none focus:border-maroon-400" data-field="denda" value="${item.denda}"></td>
 <td class="p-2 text-right"><span class="klaim-row-total font-semibold text-slate-700">${item.total_baris.toLocaleString('id-ID')}</span></td>
 <td class="p-2 bg-amber-50/30"><input type="text" class="klaim-input border border-amber-200 rounded p-1.5 w-32 outline-none focus:border-amber-400 bg-white" data-field="catatan_hrd" value="${item.catatan_hrd || ''}" placeholder="Cth: KM Akhir direvisi"></td>
 </tr>
 `;
 });
 tableHtml += `</tbody></table></div>`;
 return tableHtml;
 }
 if (typeof val === 'number' && (key.includes('total') || key.includes('biaya') || key.includes('harga') || key.includes('kasbon'))) {
 return `<span class="text-slate-800 font-medium text-right font-mono text-sm" ${key==='total_klaim' ? 'id="edit-klaim-grandtotal"' : ''}>Rp ${val.toLocaleString('id-ID')}</span>`;
 }
 return `<span class="text-slate-800 font-medium text-right">${escapeHtml(String(val))}</span>`;
 };

 body = `
 <div class="space-y-4">
 ${Object.entries(detail).map(([k, v]) => {
 if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
 return `<div class="text-sm border-b border-slate-50 pb-3"><span class="text-slate-500 capitalize block mb-1 font-medium">${escapeHtml(k.replace(/_/g, " "))}</span>${renderValue(k, v)}</div>`;
 }
 return `<div class="flex justify-between items-center gap-4 text-sm border-b border-slate-50 pb-2"><span class="text-slate-500 capitalize">${escapeHtml(k.replace(/_/g, " "))}</span>${renderValue(k, v)}</div>`;
 }).join("")}
 </div>`;
 }
 
 let footerHtml = `<button id="detail-close" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>`;
 if (isKlaimBensin) {
 footerHtml = `<button id="detail-print-klaim" class="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition shadow-sm mr-auto flex items-center gap-1.5">Cetak / Download Form Klaim</button>` + footerHtml;
 }
 if (canEdit) {
 footerHtml += `<button id="detail-save" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition shadow-md">Simpan Revisi HRD</button>`;
 }

 openModal({ 
 title: `Detail Pengajuan • ${escapeHtml(row.nama_form || "Pengajuan")}`, 
 bodyHtml: body, 
 size: canEdit || isKlaimBensin ? "xl" : "lg", 
 footerHtml: footerHtml,
 onMount: (m) => {
 m.querySelector("#detail-close").onclick = closeModal;
 const printBtn = m.querySelector("#detail-print-klaim");
 if (printBtn) {
 printBtn.onclick = () => printSalesKlaimForm(row);
 }
 if (canEdit) {
 const table = m.querySelector("#edit-klaim-table");
 const grandTotalEl = m.querySelector("#edit-klaim-grandtotal");
 const HARGA_BENSIN = 10000;
 const RASIO_KM = 25;

 function calc() {
 let grandTotal = 0;
 table.querySelectorAll("tbody tr").forEach(tr => {
 const getValue = (f) => parseFloat(tr.querySelector(`[data-field="${f}"]`).value) || 0;
 const kmAwal = Math.max(0, getValue("km_awal"));
 const kmAkhir = Math.max(0, getValue("km_akhir"));
 const parkir = Math.max(0, getValue("parkir"));
 const denda = Math.max(0, getValue("denda"));
 let trip = kmAkhir - kmAwal;
 if (trip < 0) trip = 0;
 
 // PERBAIKAN: Denda dikurangi (-)
 const rowTotal = (trip * (HARGA_BENSIN/RASIO_KM)) + parkir - denda;
 
 tr.querySelector(".klaim-row-total").textContent = Math.round(rowTotal).toLocaleString("id-ID");
 grandTotal += rowTotal;
 });
 if (grandTotalEl) grandTotalEl.textContent = `Rp ${Math.round(grandTotal).toLocaleString("id-ID")}`;
 }
 
 table.querySelectorAll(".klaim-input").forEach(input => input.addEventListener("input", calc));

 m.querySelector("#detail-save").onclick = async () => {
 const detailKlaim = [];
 let totalKlaim = 0;
 
 table.querySelectorAll("tbody tr").forEach(tr => {
 const getValue = (f) => parseFloat(tr.querySelector(`[data-field="${f}"]`).value) || 0;
 const tgl = tr.querySelector(`[data-field="tanggal"]`).value;
 const catatan = tr.querySelector(`[data-field="catatan_hrd"]`).value;
 const kmAwal = Math.max(0, getValue("km_awal"));
 const kmAkhir = Math.max(0, getValue("km_akhir"));
 const parkir = Math.max(0, getValue("parkir"));
 const denda = Math.max(0, getValue("denda"));
 let trip = kmAkhir - kmAwal;
 if (trip < 0) trip = 0;
 
 // PERBAIKAN: Denda dikurangi (-)
 const rowTotal = Math.round((trip * (HARGA_BENSIN/RASIO_KM)) + parkir - denda);

 detailKlaim.push({
 tanggal: tgl, km_awal: kmAwal, km_akhir: kmAkhir,
 parkir: parkir, denda: denda, total_baris: rowTotal, catatan_hrd: catatan 
 });
 totalKlaim += rowTotal;
 });

 const newDetail = { ...row.detail, total_klaim: totalKlaim, rincian_tabel: detailKlaim };
 const btnSave = m.querySelector("#detail-save");
 btnSave.disabled = true; btnSave.textContent = "Menyimpan Revisi...";

 try {
 await fsUpdate(COL.DATA_PENGAJUAN, row.id, { detail: newDetail });
 row.detail = newDetail; 
 toast("Data revisi klaim berhasil disimpan", "success");
 closeModal();
 } catch(e) {
 toast("Gagal menyimpan revisi: " + e.message, "error");
 btnSave.disabled = false; btnSave.textContent = "Simpan Revisi HRD";
 }
 };
 }
 }
 });
}

function actionModal(row, action, session, container, tab) {
 const isApprove = action === "APPROVE";
 openModal({
 title: isApprove ? "Setujui Pengajuan" : "Tolak Pengajuan",
 bodyHtml: `
 <p class="text-sm text-slate-600 mb-3">Anda akan <b>${isApprove ? "menyetujui" : "menolak"}</b> pengajuan <b>${escapeHtml(row.nama_form)}</b> dari <b>${escapeHtml(row.nama_pemohon)}</b>.</p>
 <textarea id="action-note" rows="3" placeholder="Catatan (opsional)" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition"></textarea>`,
 footerHtml: `
 <button id="action-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="action-confirm" class="px-4 py-2 rounded-lg text-sm font-medium text-white ${isApprove ? "bg-maroon-700 hover:bg-maroon-800" : "bg-red-700 hover:bg-red-800"} transition">${isApprove ? "Ya, Setujui" : "Ya, Tolak"}</button>`,
 onMount: (m) => {
 m.querySelector("#action-cancel").onclick = closeModal;
 m.querySelector("#action-confirm").onclick = async () => {
 const note = m.querySelector("#action-note").value.trim() || "ok";
 await processAction(row, action, note, session);
 closeModal();
 renderList(container, session, tab);
 };
 }
 });
}

async function processAction(row, action, note, session) {
 const idx = currentStepIndex(row);
 const steps = [...(row.approval_steps || [])];
 steps[idx] = action;
 
 let statusFinal = row.status_final;
 if (action === "REJECT") {
 statusFinal = "REJECTED";
 } else if (idx === steps.length - 1) {
 statusFinal = "APPROVED FINAL";
 } else {
 statusFinal = "MENUNGGU";
 }
 
 const catatan = [...(row.catatan_penolakan || []), `[${session.nama} - ${action}]: ${note}`];

 // Jika pengajuan ini butuh Laporan Pertanggungjawaban (LPJ) dan baru saja mencapai
 // status APPROVED FINAL, hitung batas waktu pengumpulan LPJ-nya sekarang.
 const updatePayload = { approval_steps: steps, status_final: statusFinal, catatan_penolakan: catatan };
 if (statusFinal === "APPROVED FINAL" && row.requires_lpj && row.lpj_status === "BELUM" && !row.lpj_due_date) {
 const due = new Date();
 due.setDate(due.getDate() + (parseInt(row.lpj_deadline_days) || 7));
 updatePayload.lpj_due_date = due.toISOString();
 row.lpj_due_date = updatePayload.lpj_due_date;
 }

 try {
 await fsUpdate(COL.DATA_PENGAJUAN, row.id, updatePayload);
 Object.assign(row, updatePayload);
 toast(action === "APPROVE" ? "Pengajuan disetujui" : "Pengajuan ditolak", action === "APPROVE" ? "success" : "warning");
 
 const isCuti = (row.form_id === "F-ISO-CUTI" || (row.nama_form || "").toLowerCase().includes("cuti"));
 
 if (statusFinal === "APPROVED FINAL" && isCuti) {
 let jenisVal = row.detail.jenis_cuti || row.detail.jenis || Object.values(row.detail).find(v => typeof v === 'string' && v.includes("Cuti"));
 let rule = CUTI_RULES[jenisVal];
 
 if (rule) {
 let multiplier = 1;
 if (row.detail.jumlah_hari) {
 multiplier = parseFloat(row.detail.jumlah_hari);
 } else if (row.detail.tanggal_mulai && row.detail.tanggal_akhir) {
 const t1 = new Date(row.detail.tanggal_mulai);
 const t2 = new Date(row.detail.tanggal_akhir);
 const diff = Math.round((t2 - t1) / 86400000) + 1;
 if (diff > 0) multiplier = diff;
 }
 const totalDeduction = rule.count * multiplier;
 
 const isPotongGaji = row.is_potong_gaji || row.potong_gaji || (row.detail && (row.detail.is_potong_gaji || row.detail.potong_gaji)) || (row.kategori_cuti || "").includes("Potong Gaji");
      const potongGajiHari = row.potong_gaji_hari || (row.detail && row.detail.potong_gaji_hari) || multiplier;

      const cutiDocId = `CUTI_${row.no_referensi || row.id}`;
      const tMulai = row.detail.tanggal_mulai || row.tgl;
      const tAkhir = row.detail.tanggal_akhir || tMulai;
      await fsAdd(COL.MASTER_CUTI, {
        id: cutiDocId,
        no_referensi: row.no_referensi || row.id,
        tanggal: tMulai,
        tanggal_selesai: tAkhir,
        nama_karyawan: row.nama_pemohon,
        cabang: row.detail.cabang || "-", 
        type_cuti: jenisVal,
        potong_jatah: isPotongGaji ? "Potong Gaji" : (rule ? rule.jenis : getCutiDeductionCategory({ type_cuti: jenisVal }).category),
        is_potong_gaji: isPotongGaji,
        potong_gaji_hari: isPotongGaji ? potongGajiHari : 0,
        keterangan_cuti: row.detail.alasan || row.detail.keterangan || (isPotongGaji ? "Cuti Potong Gaji (Unpaid Leave)" : "Disetujui by System"),
        count: totalDeduction,
        tahun: new Date(tMulai).getFullYear(),
        bulan: BULAN_ID[new Date(tMulai).getMonth()]
      }, cutiDocId);
 }

 // GENERATE DOKUMEN FORM CUTI FISIK SECARA OTOMATIS
 try {
 await generateAndSaveCutiDocument(row);
 toast("Dokumen Form Cuti Fisik berhasil tergenerate otomatis", "success");
 } catch (docErr) {
 console.warn("Gagal tergenerate dokumen fisik cuti:", docErr);
 }
 }

 // ----------------------------------------------------
 // EMAIL NOTIFICATION SYSTEM
 // ----------------------------------------------------
 if (typeof sendEmailNotif === 'function') {
 try {
 if (action === "APPROVE") {
 
 // JIKA INI ADALAH APPROVAL TERAKHIR (APPROVED FINAL)
 if (idx === steps.length - 1) {
 let rolesToNotify = ["PEMOHON"];
 if (row.form_id === "F-KLAIM-BENSIN" || (row.nama_form||"").toLowerCase().includes("klaim")) { rolesToNotify.push("FINANCE", "ACCOUNTING"); }
 else if (isCuti) { rolesToNotify.push("HRD", "ATASAN"); } 
 else { rolesToNotify.push("HRD"); }
 
 let finalTargets = [];
 for (const role of rolesToNotify) {
 const t = await getTargetsForRole(role, row.nama_pemohon);
 finalTargets.push(...t);
 }
 finalTargets = finalTargets.filter((v,i,a)=>a.findIndex(v2=>(v2.username===v.username))===i);
 
 for (const target of finalTargets) {
 const token = await createLoginToken(target.username);
 let htmlFinal = "";
 
 if (isCuti) {
 let jenisVal = row.detail.jenis_cuti || row.detail.jenis || "-";
 const isHalfDay = jenisVal.includes("1/2");
 const formatTglMulai = new Date(row.detail.tanggal_mulai || row.tgl).toLocaleDateString('id-ID');
 const formatTglSelesai = new Date(row.detail.tanggal_akhir || row.tgl).toLocaleDateString('id-ID');
 
 if (isHalfDay) {
 htmlFinal = buildStandardEmailHtml({
   badgeText: "Disetujui Final",
   badgeVariant: "green",
   title: "Ijin Meninggalkan Jam Kerja Disetujui",
   recipientName: target.nama || row.nama_pemohon,
   introText: `Pengajuan ijin setengah hari / meninggalkan jam kerja untuk <strong>${escapeHtml(row.nama_pemohon)}</strong> telah disetujui penuh oleh seluruh pihak terkait.`,
   infoList: [
     { label: "Nomor Dokumen", value: row.id },
     { label: "Nama Pemohon", value: row.nama_pemohon },
     { label: "Departemen / Divisi", value: row.detail.departemen || row.detail.divisi || "-" },
     { label: "Hari / Tanggal", value: formatTglMulai },
     { label: "Jam Ijin", value: `${row.detail.jam_keluar || "-"} s/d ${row.detail.jam_kembali || "-"}` },
     { label: "Alasan / Keperluan", value: row.detail.alasan || row.detail.keterangan || "-" }
   ],
   actionUrl: `${window.location.origin}/#riwayat?token=${token}`,
   actionText: "Lihat Detail di Portal HRIS →",
   secondaryNote: "Status: Disetujui (Approved by System)."
 });
 } else {
 htmlFinal = buildStandardEmailHtml({
   badgeText: "Disetujui Final",
   badgeVariant: "green",
   title: "Pengajuan Cuti Disetujui",
   recipientName: target.nama || row.nama_pemohon,
   introText: `Pengajuan cuti untuk <strong>${escapeHtml(row.nama_pemohon)}</strong> telah disetujui penuh oleh seluruh pihak terkait.`,
   infoList: [
     { label: "Nomor Dokumen", value: row.id },
     { label: "Nama Pemohon", value: row.nama_pemohon },
     { label: "Jabatan / Divisi", value: `${row.detail.jabatan || "-"} / ${row.detail.divisi || "-"}` },
     { label: "Jenis Cuti", value: jenisVal },
     { label: "Periode Cuti", value: `${formatTglMulai} s/d ${formatTglSelesai}` },
     { label: "Alasan / Keperluan", value: row.detail.alasan || row.detail.keterangan || "-" }
   ],
   actionUrl: `${window.location.origin}/#riwayat?token=${token}`,
   actionText: "Lihat Detail di Portal HRIS →",
   secondaryNote: "Status: Disetujui (Approved by System)."
 });
 }
 } 
 else {
 const jabatanPemohon = karyawanByNama[row.nama_pemohon]?.jabatan || "-";
 const flowStatus = (row.approval_flow || []).map((r, i) => `${r}: ${(steps || [])[i]}`).join(" • ");
 const notesStr = (catatan || []).length > 0 ? (catatan || []).join(" | ") : "-";

 const generalInfoList = [
   { label: "Nomor Dokumen", value: row.id },
   { label: "Nama Pengajuan", value: row.nama_form },
   { label: "Pemohon", value: `${row.nama_pemohon} (${jabatanPemohon})` },
   { label: "Alur Persetujuan", value: flowStatus }
 ];

 if (notesStr !== "-") {
   generalInfoList.push({ label: "Catatan Approver", value: notesStr });
 }

 htmlFinal = buildStandardEmailHtml({
   badgeText: "Disetujui Final",
   badgeVariant: "green",
   title: `Pengajuan Disetujui: ${row.nama_form}`,
   recipientName: target.nama || row.nama_pemohon,
   introText: `Pengajuan <strong>${escapeHtml(row.nama_form)}</strong> telah menyelesaikan seluruh tahapan persetujuan dan dinyatakan <strong>DISANGGUPKAN / DISETUJUI FINAL</strong>.`,
   infoList: generalInfoList,
   actionUrl: `${window.location.origin}/#dashboard?token=${token}`,
   actionText: "Buka Portal HRIS →",
   secondaryNote: "Dokumen ini telah tercatat secara resmi di sistem HRIS & Operasional CV Andela Jaya."
 });
 }
 
 sendEmailNotif(target.email, `[APPROVED FINAL] ${row.nama_form}`, htmlFinal);
 }

 // ------------------------------------------------------------
 // PENGINGAT LPJ (Laporan Pertanggungjawaban) — dikirim khusus ke
 // PEMOHON jika form ini dikonfigurasi wajib LPJ di Form Builder.
 // ------------------------------------------------------------
 if (row.requires_lpj) {
 const pemohonTargets = await getTargetsForRole("PEMOHON", row.nama_pemohon);
 const dueStr = row.lpj_due_date ? new Date(row.lpj_due_date).toLocaleDateString('id-ID', { dateStyle: 'long' }) : "-";
 for (const target of pemohonTargets) {
 const tokenLpj = await createLoginToken(target.username);
 const htmlLpj = buildStandardEmailHtml({
   badgeText: "Wajib LPJ",
   badgeVariant: "amber",
   title: "Pengingat Laporan Pertanggungjawaban (LPJ)",
   recipientName: target.nama || row.nama_pemohon,
   introText: `Pengajuan <strong>${escapeHtml(row.nama_form)}</strong> (<code>${escapeHtml(row.id)}</code>) Anda telah disetujui secara final. Sesuai ketentuan operasional, Anda wajib melampirkan Laporan Pertanggungjawaban (LPJ) beserta bukti pengeluaran.`,
   infoList: [
     { label: "Nomor Dokumen", value: row.id },
     { label: "Nama Pengajuan", value: row.nama_form },
     { label: "Batas Waktu LPJ", value: dueStr }
   ],
   actionUrl: `${window.location.origin}/#riwayat?token=${tokenLpj}`,
   actionText: "Isi & Unggah Bukti LPJ Sekarang →",
   secondaryNote: "Buka menu Riwayat Pengajuan di HRIS untuk mengunggah bukti realisasi."
 });
 sendEmailNotif(target.email, `[Wajib LPJ] ${row.nama_form} — batas ${dueStr}`, htmlLpj).catch(e => console.warn(e));
 }
 }
 } 
 // JIKA MASIH ADA APPROVER SELANJUTNYA
 else {
 const nextRole = row.approval_flow[idx + 1];
 const nextTargets = await getTargetsForRole(nextRole, row.nama_pemohon);
 
 for (const target of nextTargets) {
 const token = await createLoginToken(target.username);
 const htmlNext = buildStandardEmailHtml({
   badgeText: "Approval Dibutuhkan",
   badgeVariant: "maroon",
   title: `Persetujuan: ${row.nama_form}`,
   recipientName: target.nama || `Bapak/Ibu ${nextRole}`,
   introText: `Pengajuan dari <strong>${escapeHtml(row.nama_pemohon)}</strong> saat ini menunggu peninjauan dan persetujuan Anda sebagai <strong>${escapeHtml(nextRole)}</strong>:`,
   infoList: [
     { label: "Nomor Dokumen", value: row.id },
     { label: "Nama Form", value: row.nama_form },
     { label: "Pemohon", value: row.nama_pemohon },
     { label: "Tahap Otorisasi", value: `Tahap ${idx + 2} dari ${steps.length} (${nextRole})` }
   ],
   actionUrl: `${window.location.origin}/#approval?token=${token}`,
   actionText: "Akses Langsung & Otorisasi Pengajuan →",
   secondaryNote: "Tautan ini aman dan memungkinkan Anda menyetujui langsung tanpa mengetik ulang kata sandi."
 });
 sendEmailNotif(target.email, `Menunggu Persetujuan Anda: ${row.nama_form}`, htmlNext);
 }
 }
 } else if (action === "REJECT") {
 const pemohonTargets = await getTargetsForRole("PEMOHON", row.nama_pemohon);
 for (const target of pemohonTargets) {
 const token = await createLoginToken(target.username);
 const htmlReject = buildStandardEmailHtml({
   badgeText: "Ditolak",
   badgeVariant: "red",
   title: `Pengajuan Ditolak: ${row.nama_form}`,
   recipientName: target.nama || row.nama_pemohon,
   introText: `Pengajuan Anda telah <strong>ditolak</strong> oleh <strong>${escapeHtml(session.nama)}</strong>.`,
   infoList: [
     { label: "Nomor Dokumen", value: row.id },
     { label: "Nama Pengajuan", value: row.nama_form },
     { label: "Ditolak Oleh", value: `${session.nama} (${session.role})` },
     { label: "Catatan Penolakan", value: note || "Tidak ada catatan." }
   ],
   actionUrl: `${window.location.origin}/#riwayat?token=${token}`,
   actionText: "Lihat Detail di Riwayat Pengajuan →",
   secondaryNote: "Silakan periksa catatan revisi di atas sebelum mengajukan kembali jika diperlukan."
 });
 sendEmailNotif(target.email, `[REJECTED] ${row.nama_form}`, htmlReject);
 }
 }
 } catch (errEmail) {
 console.warn("Gagal mengirim email rantai persetujuan:", errEmail);
 }
 }

 // ----------------------------------------------------
 // REAL-TIME IN-APP & HP PUSH NOTIFICATIONS SYSTEM
 // ----------------------------------------------------
 try {
 const pemohonTargetList = await getTargetsForRole("PEMOHON", row.nama_pemohon);
 const pemohonUsername = pemohonTargetList[0]?.username || row.nama_pemohon;

 if (action === "REJECT") {
 await notifyUser(
 pemohonUsername,
 `[DITOLAK] ${row.nama_form}`,
 `Pengajuan ${row.nama_form} (${row.id}) Anda ditolak oleh ${session.nama}. Catatan: ${note || "Tidak ada catatan."}`,
 `#riwayat?id=${row.id}`
 );
 } else if (action === "APPROVE") {
 if (statusFinal === "APPROVED FINAL") {
 // 1. Notifikasi Full Approved ke Pemohon
 await notifyUser(
 pemohonUsername,
 `[FULL APPROVED] ${row.nama_form}`,
 `Selamat! Pengajuan ${row.nama_form} (${row.id}) Anda telah disetujui penuh oleh ${session.nama}. Klik untuk membuka formulir.`,
 `#riwayat?id=${row.id}`
 );

 // 2. Notifikasi ke Atasan, Bawahan, dan Rekan Kerja terkait jika Cuti/Izin
 if (isCuti) {
 const masterKaryawan = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);
 const pemohonData = masterKaryawan.find(k => (k.nama_karyawan || k.nama) === row.nama_pemohon) || {};
 const userList = await fsGetAll(COL.USERS).catch(() => []);
 const userByNama = {};
 userList.forEach(u => { if (u.nama) userByNama[u.nama] = u.username; });

 const tglRange = row.detail?.tanggal_mulai ? `${row.detail.tanggal_mulai}${row.detail.tanggal_akhir ? ' s/d ' + row.detail.tanggal_akhir : ''}` : (row.tgl || "");

 // Atasan Pemohon
 if (pemohonData.atasan && userByNama[pemohonData.atasan]) {
 await notifyUser(
 userByNama[pemohonData.atasan],
 `[Info Cuti Bawahan] ${row.nama_pemohon}`,
 `Bawahan Anda (${row.nama_pemohon}) telah disetujui Cuti/Izin (${tglRange}).`,
 `#dashboard`
 );
 }

 // Bawahan Pemohon
 const subordinates = masterKaryawan.filter(k => k.atasan === row.nama_pemohon);
 for (const sub of subordinates) {
 const subUser = userByNama[sub.nama_karyawan || sub.nama];
 if (subUser) {
 await notifyUser(
 subUser,
 `[Info Cuti Atasan] ${row.nama_pemohon}`,
 `Atasan Anda (${row.nama_pemohon}) akan Cuti/Izin (${tglRange}).`,
 `#dashboard`
 );
 }
 }

 // Rekan kerja se-divisi / cabang
 const peers = masterKaryawan.filter(k => (k.nama_karyawan || k.nama) !== row.nama_pemohon && ((k.divisi && k.divisi === pemohonData.divisi) || (k.cabang && k.cabang === pemohonData.cabang)));
 for (const peer of peers.slice(0, 10)) {
 const peerUser = userByNama[peer.nama_karyawan || peer.nama];
 if (peerUser) {
 await notifyUser(
 peerUser,
 `[Info Cuti Rekan Kerja] ${row.nama_pemohon}`,
 `Rekan se-divisi/cabang (${row.nama_pemohon}) disetujui Cuti/Izin (${tglRange}).`,
 `#dashboard`
 );
 }
 }
 }

 // 3. Notifikasi ke Finance & Accounting jika Dinas Luar Kota / Klaim
 const isDinas = (row.form_id === "F-ISO-DINAS" || (row.nama_form || "").toLowerCase().includes("dinas") || (row.nama_form || "").toLowerCase().includes("operasional"));
 const isKlaim = (row.form_id === "F-KLAIM-BENSIN" || (row.nama_form || "").toLowerCase().includes("klaim"));

 if (isDinas || isKlaim) {
 const finTargets = await getTargetsForRole("FINANCE", row.nama_pemohon);
 const accTargets = await getTargetsForRole("ACCOUNTING", row.nama_pemohon);
 const finAll = [...finTargets, ...accTargets].filter((v, i, a) => a.findIndex(v2 => v2.username === v.username) === i);

 for (const fin of finAll) {
 await notifyUser(
 fin.username,
 `[${isDinas ? 'Dinas Disetujui' : 'Klaim Disetujui'}] ${row.nama_pemohon}`,
 `Pengajuan ${row.nama_form} oleh ${row.nama_pemohon} (${karyawanByNama[row.nama_pemohon]?.jabatan || 'Sales/SPV'}) telah disetujui final. Rincian uang jalan/klaim siap diproses.`,
 `#riwayat?id=${row.id}`
 );
 }
 }
 } else {
 // Status intermediate approval -> Notify Pemohon & Next Approver
 const nextRole = row.approval_flow[idx + 1];
 await notifyUser(
 pemohonUsername,
 `[Update Progress] ${row.nama_form}`,
 `Pengajuan ${row.nama_form} Anda disetujui oleh ${session.nama} (${row.approval_flow[idx] || "Approver"}). Progress: Step ${idx+1}/${row.approval_flow.length}. Menunggu: ${nextRole || 'Approver Selanjutnya'}.`,
 `#riwayat?id=${row.id}`
 );

 if (nextRole) {
 const nextTargets = await getTargetsForRole(nextRole, row.nama_pemohon);
 for (const target of nextTargets) {
 await notifyUser(
 target.username,
 `Menunggu Persetujuan Anda: ${row.nama_form}`,
 `Pengajuan dari ${row.nama_pemohon} membutuhkan persetujuan Anda sebagai ${nextRole}.`,
 `#approval?id=${row.id}`
 );
 }
 }
 }

 // Send notification to custom target employees configured in Form Builder
 const formCfg = (await fsGetAll(COL.FORM_CONFIG).catch(() => [])).find(f => f.id === row.form_id);
 const specificTargets = row.notify_specific_users || formCfg?.notify_specific_users || row.notify_targets?.specific_users || [];
 if (Array.isArray(specificTargets) && specificTargets.length > 0) {
 for (const targetName of specificTargets) {
 if (targetName && targetName.trim() && targetName.toUpperCase() !== (session.nama || "").toUpperCase()) {
 await notifyUser(
 targetName,
 `[Update Pengajuan] ${row.nama_form}`,
 `Pengajuan ${row.nama_form} dari ${row.nama_pemohon} telah diperbarui status persetujuannya: ${isFinalApproved ? 'APPROVED FINAL' : 'Persetujuan Tahap ' + (idx + 1)}.`,
 `#riwayat?id=${row.id}`
 ).catch(e => console.warn("Notif target khusus approval gagal:", e));
 }
 }
 }
 }
 } catch (errNotif) {
 console.warn("Gagal mengirim push / in-app notification:", errNotif);
 }
 
 } catch (e) {
 console.error(e);
 toast("Gagal memproses persetujuan: " + e.message, "error");
 }
}
