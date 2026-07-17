import { db, COL, collection, query, where, getDocs } from "../firebase-config.js";
import { fsGetAll, fsUpdate, fsAdd, genId, openModal, closeModal, toast, fmtDateTime, escapeHtml, sendEmailNotif, getTargetsForRole, createLoginToken } from "../utils.js";
import { badge, emptyState, skeletonRows } from "../components.js";

const CUTI_RULES = {
  "C - Cuti Tahunan": { jenis: "Tahunan", count: 1 },
  "C1/2 - Cuti Setengah Hari": { jenis: "Tahunan", count: 0.5 },
  "C+ - Cuti Khusus": { jenis: "Khusus", count: 1 },
  "S - Sakit dgn Surat Dokter": { jenis: "Khusus", count: 0 }, 
  "S- - Sakit tanpa Surat Dokter": { jenis: "Tahunan", count: 1 },
  "CB - Cuti Bersama": { jenis: "Tahunan", count: 1 },
  "C- - Potong Gaji": { jenis: "Potong Gaji", count: 1 },
  "CS - Cuti Sisa": { jenis: "Tahunan", count: 1 },
  "C+1/2 - Cuti Khusus Setengah Hari": { jenis: "Khusus", count: 0.5 },
  "D - Dinas Luar Kota": { jenis: "Dinas", count: 0 },
  "C-BESAR - Cuti Besar": { jenis: "Cuti Besar", count: 0 }
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
  const steps = row.approval_steps || [];
  return steps.findIndex(s => s === "PENDING");
}

function isEligible(row, session) {
  const idx = currentStepIndex(row);
  if (idx === -1) return false;
  
  const stepLabel = (row.approval_flow || [])[idx];
  if (!stepLabel) return false;
  
  if (stepLabel.toUpperCase() === "ATASAN") {
    const pemohon = karyawanByNama[row.nama_pemohon];
    return pemohon && pemohon.atasan === session.nama;
  }
  
  return stepLabel.toUpperCase() === session.role.toUpperCase();
}

function renderList(container, session, tab) {
  const listEl = container.querySelector("#approval-list");
  let rows;
  
  if (tab === "pending") {
    rows = allPengajuan.filter(r => r.status_final === "MENUNGGU" && isEligible(r, session));
  } else {
    rows = allPengajuan.filter(r => (r.catatan_penolakan || []).some(c => c.includes(session.nama)));
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
    
    return `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="font-semibold text-slate-800">${escapeHtml(r.nama_form)}</p>
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
}

function showDetail(row, session) {
  const detail = row.detail || {};
  const isHrd = session.role === "HRD";
  const isKlaimBensin = row.form_id === "F-KLAIM-BENSIN" || (row.nama_form || "").toLowerCase().includes("bensin");
  const isPending = row.status_final === "MENUNGGU";
  const canEdit = isHrd && isKlaimBensin && isPending;
  
  const renderValue = (key, val) => {
    if (key === "rincian_tabel" && canEdit) {
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
    
    if (Array.isArray(val)) {
      if (val.length > 0 && typeof val[0] === 'object') {
        const headers = Object.keys(val[0]);
        let tableHtml = `<div class="overflow-x-auto mt-2 border border-slate-200 rounded-lg">
          <table class="w-full text-xs text-left whitespace-nowrap">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>`;
        headers.forEach(h => { tableHtml += `<th class="p-2 font-medium text-slate-500 capitalize">${escapeHtml(h.replace(/_/g, " "))}</th>`; });
        tableHtml += `</tr></thead><tbody class="divide-y divide-slate-100">`;
        
        val.forEach(item => {
          tableHtml += `<tr>`;
          headers.forEach(h => {
            let cellVal = item[h];
            if (typeof cellVal === 'number' && (h.includes('total') || h.includes('parkir') || h.includes('denda') || h.includes('biaya'))) cellVal = "Rp " + cellVal.toLocaleString('id-ID');
            if (h === 'catatan_hrd' && cellVal) tableHtml += `<td class="p-2 text-amber-700 font-medium bg-amber-50">${escapeHtml(String(cellVal))}</td>`;
            else tableHtml += `<td class="p-2 text-slate-700">${escapeHtml(String(cellVal || '-'))}</td>`;
          });
          tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table></div>`;
        return tableHtml;
      }
      return `<span class="text-slate-800 font-medium text-right">${escapeHtml(val.join(", "))}</span>`;
    }
    
    if (typeof val === 'number' && (key.includes('total') || key.includes('biaya') || key.includes('harga') || key.includes('kasbon'))) {
       return `<span class="text-slate-800 font-medium text-right font-mono text-sm" ${key==='total_klaim' && canEdit ? 'id="edit-klaim-grandtotal"' : ''}>Rp ${val.toLocaleString('id-ID')}</span>`;
    }
    return `<span class="text-slate-800 font-medium text-right">${escapeHtml(String(val))}</span>`;
  };

  const body = `
    <div class="space-y-4">
      ${Object.entries(detail).map(([k, v]) => {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
          return `<div class="text-sm border-b border-slate-50 pb-3"><span class="text-slate-500 capitalize block mb-1 font-medium">${escapeHtml(k.replace(/_/g, " "))}</span>${renderValue(k, v)}</div>`;
        }
        return `<div class="flex justify-between items-center gap-4 text-sm border-b border-slate-50 pb-2"><span class="text-slate-500 capitalize">${escapeHtml(k.replace(/_/g, " "))}</span>${renderValue(k, v)}</div>`;
      }).join("")}
    </div>`;
    
  let footerHtml = `<button id="detail-close" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>`;
  if (canEdit) footerHtml += `<button id="detail-save" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition shadow-md">Simpan Revisi HRD</button>`;

  openModal({ 
     title: `Detail • ${row.nama_form}`, 
     bodyHtml: body, 
     size: canEdit ? "xl" : "lg", 
     footerHtml: footerHtml,
    onMount: (m) => {
      m.querySelector("#detail-close").onclick = closeModal;
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
            
            await fsAdd(COL.MASTER_CUTI, {
                tanggal: row.detail.tanggal_mulai || row.tgl,
                nama_karyawan: row.nama_pemohon,
                cabang: row.detail.cabang || "-", 
                type_cuti: jenisVal,
                potong_jatah: rule.jenis, 
                keterangan_cuti: row.detail.alasan || row.detail.keterangan || "Disetujui by System",
                count: totalDeduction,
                tahun: new Date(row.tgl).getFullYear(),
                bulan: BULAN_ID[new Date(row.tgl).getMonth()]
            }, genId("CUTI"));
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
                      htmlFinal = `
                      <div style="font-family: 'Times New Roman', Times, serif; padding: 30px; border: 2px solid #000; max-width: 650px; margin: auto; background: white; color: black;">
                          <h3 style="text-align: center; text-decoration: underline; margin-bottom: 30px; letter-spacing: 1px;">FORM IJIN MENINGGALKAN JAM KERJA</h3>
                          <table style="width: 100%; margin-top: 20px; font-size: 14px; line-height: 1.8;">
                              <tr><td width="30%">Nama</td><td width="2%">:</td><td><strong>${row.nama_pemohon}</strong></td></tr>
                              <tr><td>Departemen</td><td>:</td><td>${row.detail.departemen || row.detail.divisi || "-"}</td></tr>
                              <tr><td>Hari/Tanggal</td><td>:</td><td>${formatTglMulai}</td></tr>
                              <tr><td>Jam Keluar</td><td>:</td><td>${row.detail.jam_keluar || "-"}</td></tr>
                              <tr><td>Jam Kembali</td><td>:</td><td>${row.detail.jam_kembali || "-"}</td></tr>
                              <tr><td>Alasan/Keperluan</td><td>:</td><td>${row.detail.alasan || row.detail.keterangan || "-"}</td></tr>
                          </table>
                          <br/><br/>
                          <table style="width: 100%; text-align: center; margin-top: 40px; font-size: 14px;">
                              <tr>
                                  <td width="33%">Pemohon</td>
                                  <td width="33%">Menyetujui (Atasan)</td>
                                  <td width="33%">Mengetahui (HRD)</td>
                              </tr>
                              <tr>
                                  <td style="padding-top: 50px;"><strong>${row.nama_pemohon}</strong></td>
                                  <td style="padding-top: 50px; color: #166534; font-style: italic; font-weight: bold;">(Approved by System)</td>
                                  <td style="padding-top: 50px; color: #166534; font-style: italic; font-weight: bold;">(Approved by System)</td>
                              </tr>
                          </table>
                      </div>
                      `;
                  } else {
                      htmlFinal = `
                      <div style="font-family: 'Times New Roman', Times, serif; padding: 30px; border: 2px solid #000; max-width: 650px; margin: auto; background: white; color: black;">
                          <h3 style="text-align: center; text-decoration: underline; margin-bottom: 30px; letter-spacing: 1px;">FORM CUTI KARYAWAN</h3>
                          <table style="width: 100%; margin-top: 20px; font-size: 14px; line-height: 1.8;">
                              <tr><td width="30%">Nama</td><td width="2%">:</td><td><strong>${row.nama_pemohon}</strong></td></tr>
                              <tr><td>Jabatan / Divisi</td><td>:</td><td>${row.detail.jabatan || "-"} / ${row.detail.divisi || "-"}</td></tr>
                              <tr><td>Jenis Cuti</td><td>:</td><td><strong>${jenisVal}</strong></td></tr>
                              <tr><td>Mulai Tanggal</td><td>:</td><td>${formatTglMulai}</td></tr>
                              <tr><td>S/d Tanggal</td><td>:</td><td>${formatTglSelesai}</td></tr>
                              <tr><td valign="top">Alasan/Keperluan</td><td valign="top">:</td><td>${row.detail.alasan || row.detail.keterangan || "-"}</td></tr>
                          </table>
                          <br/><br/>
                          <table style="width: 100%; text-align: center; margin-top: 40px; font-size: 14px;">
                              <tr>
                                  <td width="33%">Pemohon</td>
                                  <td width="33%">Menyetujui (Atasan)</td>
                                  <td width="33%">Mengetahui (HRD)</td>
                              </tr>
                              <tr>
                                  <td style="padding-top: 50px;"><strong>${row.nama_pemohon}</strong></td>
                                  <td style="padding-top: 50px; color: #166534; font-style: italic; font-weight: bold;">(Approved by System)</td>
                                  <td style="padding-top: 50px; color: #166534; font-style: italic; font-weight: bold;">(Approved by System)</td>
                              </tr>
                          </table>
                      </div>
                      `;
                  }
               } 
               else {
                  const jabatanPemohon = karyawanByNama[row.nama_pemohon]?.jabatan || "-";
                  
                  let detailHtml = `<table style="width: 100%; border-collapse: collapse; font-size: 12px; font-family: Arial, sans-serif;">`;
                  for (const [key, val] of Object.entries(row.detail || {})) {
                      const formattedKey = escapeHtml(key.replace(/_/g, " ").toUpperCase());
                      
                      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
                          const headers = Object.keys(val[0]);
                          let nestedTable = `<table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10px; border: 1px solid #cbd5e1;">`;
                          nestedTable += `<thead style="background-color: #f8fafc;"><tr>`;
                          headers.forEach(h => nestedTable += `<th style="border: 1px solid #cbd5e1; padding: 6px; text-transform: uppercase; color: #64748b;">${escapeHtml(h.replace(/_/g, " "))}</th>`);
                          nestedTable += `</tr></thead><tbody>`;
                          val.forEach(item => {
                              nestedTable += `<tr>`;
                              headers.forEach(h => {
                                  let cellVal = item[h];
                                  if (typeof cellVal === 'number' && (h.includes('total') || h.includes('biaya') || h.includes('parkir') || h.includes('denda'))) {
                                       cellVal = "Rp " + cellVal.toLocaleString('id-ID');
                                  }
                                  nestedTable += `<td style="border: 1px solid #cbd5e1; padding: 6px;">${escapeHtml(String(cellVal || '-'))}</td>`;
                              });
                              nestedTable += `</tr>`;
                          });
                          nestedTable += `</tbody></table>`;
                          detailHtml += `<tr><td style="padding: 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: bold; width: 35%; vertical-align: top; border-right: 1px solid #f1f5f9;">${formattedKey}</td><td style="padding: 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; color: #1e293b;">${nestedTable}</td></tr>`;
                      } 
                      else {
                          let displayVal = val;
                          if (typeof val === 'number' && (key.includes('total') || key.includes('biaya') || key.includes('harga') || key.includes('kasbon'))) {
                              displayVal = "Rp " + val.toLocaleString('id-ID');
                          }
                          detailHtml += `<tr><td style="padding: 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: bold; width: 35%; vertical-align: top; border-right: 1px solid #f1f5f9;">${formattedKey}</td><td style="padding: 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; color: #1e293b;">${escapeHtml(String(displayVal))}</td></tr>`;
                      }
                  }
                  detailHtml += `</table>`;

                  const notesHtml = (catatan || []).map(c => escapeHtml(c)).join("<br/>");
                  const flowStatus = (row.approval_flow || []).map((r, i) => `<strong>${r}</strong>: ${(steps || [])[i]}`).join(" &bull; ");

                  htmlFinal = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px;">
                      <div style="background-color: #be123c; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                          <div style="background-color: white; color: #be123c; width: 48px; height: 48px; border-radius: 50%; display: inline-block; text-align: center; line-height: 48px; font-size: 24px; font-weight: bold; margin: 0 auto 15px auto;">&#10003;</div>
                          <h2 style="margin: 0; font-size: 22px;">Pengajuan Disetujui</h2>
                          <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;">Portal HR & Operasional Internal</p>
                      </div>
                      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; background-color: #ffffff;">
                          <div style="border: 1px solid #fecaca; background-color: #fff5f5; padding: 15px; border-radius: 6px; margin-bottom: 24px;">
                              <p style="font-size: 11px; color: #9ca3af; margin: 0 0 4px 0;">${row.id}</p>
                              <h3 style="font-size: 16px; color: #881337; margin: 0;">${escapeHtml(row.nama_form)}</h3>
                          </div>
                          
                          <div style="margin-bottom: 24px;">
                              <p style="font-size: 11px; color: #9ca3af; margin: 0 0 4px 0; font-weight: bold; text-transform: uppercase;">PEMOHON</p>
                              <p style="font-size: 14px; color: #1e293b; margin: 0; font-weight: bold;">${escapeHtml(row.nama_pemohon)} - ${escapeHtml(jabatanPemohon)}</p>
                          </div>

                          <div style="margin-bottom: 24px;">
                              <p style="font-size: 11px; color: #9ca3af; margin: 0 0 8px 0; font-weight: bold; text-transform: uppercase;">DETAIL PENGAJUAN</p>
                              <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                                  ${detailHtml}
                              </div>
                          </div>

                          <div style="margin-bottom: 24px;">
                              <p style="font-size: 11px; color: #9ca3af; margin: 0 0 8px 0; font-weight: bold; text-transform: uppercase;">CATATAN OTORISASI / APPROVER</p>
                              <div style="border: 1px solid #fde047; background-color: #fef9c3; color: #854d0e; padding: 12px; border-radius: 6px; font-size: 12px; font-family: monospace; line-height: 1.5;">
                                  ${notesHtml || "Tidak ada catatan."}
                              </div>
                          </div>

                          <div>
                              <div style="border: 1px solid #bbf7d0; background-color: #f0fdf4; color: #166534; padding: 15px; border-radius: 6px;">
                                  <p style="font-size: 13px; font-weight: bold; margin: 0 0 4px 0;">Status Final: Approved Final</p>
                                  <p style="font-size: 11px; margin: 0; opacity: 0.8;">${flowStatus}</p>
                              </div>
                          </div>
                          
                          <div style="margin-top: 24px; text-align: center;">
                              <a href="https://andela-hris.vercel.app/#dashboard?token=${token}" style="display:inline-block; padding:10px 20px; background-color:#f1f5f9; color:#475569; text-decoration:none; border-radius:6px; font-size:12px; font-weight:bold; border: 1px solid #e2e8f0;">Buka Sistem HRIS</a>
                          </div>
                      </div>
                  </div>
                  `;
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
                const htmlLpj = `
                  <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #fde68a; background:#fffbeb; border-radius: 8px; max-width:560px; margin:0 auto;">
                    <h2 style="color: #92400e; margin-top:0;">Jangan Lupa Laporan Pertanggungjawaban (LPJ)</h2>
                    <p>Pengajuan <strong>${escapeHtml(row.nama_form)}</strong> (${escapeHtml(row.id)}) Anda telah <strong>disetujui</strong>.</p>
                    <p>Sesuai ketentuan, Anda perlu melengkapi <strong>LPJ</strong> (bukti penggunaan/realisasi) paling lambat:</p>
                    <p style="font-size:16px; font-weight:bold; color:#92400e;">${dueStr}</p>
                    <a href="https://andela-hris.vercel.app/#riwayat?token=${tokenLpj}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#92400e; color:#fff; text-decoration:none; border-radius:5px;">Isi LPJ Sekarang</a>
                    <p style="margin-top:15px; font-size:11px; color:#a16207;">Buka menu Riwayat Pengajuan untuk mengisi LPJ pada transaksi ini.</p>
                  </div>
                `;
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
               const htmlNext = `
                 <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                   <h2 style="color: #7a1f2b;">Persetujuan Lanjutan: ${row.nama_form}</h2>
                   <p>Pengajuan dari <strong>${row.nama_pemohon}</strong> membutuhkan persetujuan Anda sebagai <strong>${nextRole}</strong>.</p>
                   <a href="https://andela-hris.vercel.app/#approval?token=${token}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Akses Langsung & Setujui</a>
                 </div>
               `;
               sendEmailNotif(target.email, `Menunggu Persetujuan Anda: ${row.nama_form}`, htmlNext);
            }
          }
        } else if (action === "REJECT") {
          const pemohonTargets = await getTargetsForRole("PEMOHON", row.nama_pemohon);
          for (const target of pemohonTargets) {
             const token = await createLoginToken(target.username);
             const htmlReject = `
               <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #fecaca; border-radius: 8px; background-color: #fef2f2;">
                 <h2 style="color: #b91c1c;">Pengajuan Ditolak: ${row.nama_form}</h2>
                 <p>Pengajuan Anda telah <strong>ditolak</strong> oleh <strong>${session.nama}</strong>.</p>
                 <p><strong>Catatan:</strong> ${note || "Tidak ada catatan."}</p>
                 <a href="https://andela-hris.vercel.app/#riwayat?token=${token}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#b91c1c; color:#fff; text-decoration:none; border-radius:5px;">Lihat Riwayat</a>
               </div>
             `;
             sendEmailNotif(target.email, `[REJECTED] ${row.nama_form}`, htmlReject);
          }
        }
      } catch (errEmail) {
        console.warn("Gagal mengirim email rantai persetujuan:", errEmail);
      }
    }
    
  } catch (e) {
    console.error(e);
    toast("Gagal memproses persetujuan: " + e.message, "error");
  }
}
