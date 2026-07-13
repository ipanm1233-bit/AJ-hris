import { db, COL, collection, query, where, getDocs } from "../firebase-config.js";
import { fsGetAll, fsUpdate, openModal, closeModal, toast, fmtDateTime, escapeHtml, sendEmailNotif, getTargetsForRole, createLoginToken } from "../utils.js";
import { icon, badge, emptyState, skeletonRows } from "../components.js";

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
        ${(r.approval_flow || []).map((step, i) => {
          const st = (r.approval_steps || [])[i];
          const cls = st === "APPROVE" ? "bg-emerald-100 text-emerald-700" : st === "REJECT" ? "bg-red-100 text-red-700" : i === idx ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" : "bg-slate-100 text-slate-400";
          return `<span class="px-2.5 py-1 rounded-full text-xs font-medium ${cls}">${i + 1}. ${escapeHtml(step)}</span>`;
        }).join('<span class="text-slate-300">→</span>')}
      </div>

      <div class="mt-4 flex items-center justify-between">
        <!-- PERBAIKAN: Melemparkan variabel session ke fungsi showDetail agar bisa mendeteksi role HRD -->
        <button data-detail="${r.id}" class="text-xs text-maroon-700 font-medium hover:underline">Lihat Detail Pengajuan</button>
        ${tab === "pending" ? `
        <div class="flex gap-2">
          <button data-reject="${r.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition">Tolak</button>
          <button data-approve="${r.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-maroon-700 text-white hover:bg-maroon-800 transition">Setujui</button>
        </div>` : ""}
      </div>
    </div>`;
  }).join("");

  // Binding Event Listener dengan Session
  listEl.querySelectorAll("[data-detail]").forEach(btn => btn.addEventListener("click", () => showDetail(rows.find(r => r.id === btn.dataset.detail), session)));
  listEl.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", () => actionModal(rows.find(r => r.id === btn.dataset.approve), "APPROVE", session, container, tab)));
  listEl.querySelectorAll("[data-reject]").forEach(btn => btn.addEventListener("click", () => actionModal(rows.find(r => r.id === btn.dataset.reject), "REJECT", session, container, tab)));
}

// PERBAIKAN: Fungsi Show Detail yang mendeteksi Role HRD untuk Edit Klaim Bensin
function showDetail(row, session) {
  const detail = row.detail || {};
  
  // Deteksi kelayakan Edit: Jika yang login adalah HRD, formnya adalah Klaim Bensin, dan statusnya masih menunggu
  const isHrd = session.role === "HRD";
  const isKlaimBensin = row.form_id === "F-KLAIM-BENSIN" || (row.nama_form || "").toLowerCase().includes("bensin");
  const isPending = row.status_final === "MENUNGGU";
  const canEdit = isHrd && isKlaimBensin && isPending;

  const renderValue = (key, val) => {
    // KONDISI 1: JIKA HRD MENGEDIT TABEL KLAIM BENSIN
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

    // KONDISI 2: RENDER TABEL ARRAY BIASA (READ-ONLY)
    if (Array.isArray(val)) {
      if (val.length > 0 && typeof val[0] === 'object') {
        const headers = Object.keys(val[0]);
        let tableHtml = `<div class="overflow-x-auto mt-2 border border-slate-200 rounded-lg">
          <table class="w-full text-xs text-left whitespace-nowrap">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>`;
        headers.forEach(h => {
          tableHtml += `<th class="p-2 font-medium text-slate-500 capitalize">${escapeHtml(h.replace(/_/g, " "))}</th>`;
        });
        tableHtml += `</tr></thead><tbody class="divide-y divide-slate-100">`;
        
        val.forEach(item => {
          tableHtml += `<tr>`;
          headers.forEach(h => {
            let cellVal = item[h];
            if (typeof cellVal === 'number' && (h.includes('total') || h.includes('parkir') || h.includes('denda') || h.includes('biaya'))) {
              cellVal = "Rp " + cellVal.toLocaleString('id-ID');
            }
            // Highlight khusus jika ada catatan revisi dari HRD
            if (h === 'catatan_hrd' && cellVal) {
               tableHtml += `<td class="p-2 text-amber-700 font-medium bg-amber-50">${escapeHtml(String(cellVal))}</td>`;
            } else {
               tableHtml += `<td class="p-2 text-slate-700">${escapeHtml(String(cellVal || '-'))}</td>`;
            }
          });
          tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table></div>`;
        return tableHtml;
      }
      return `<span class="text-slate-800 font-medium text-right">${escapeHtml(val.join(", "))}</span>`;
    }

    // KONDISI 3: Format Rupiah untuk angka total tunggal
    if (typeof val === 'number' && (key.includes('total') || key.includes('biaya') || key.includes('harga') || key.includes('kasbon'))) {
       return `<span class="text-slate-800 font-medium text-right font-mono text-sm" ${key==='total_klaim' && canEdit ? 'id="edit-klaim-grandtotal"' : ''}>Rp ${val.toLocaleString('id-ID')}</span>`;
    }

    // Default Teks
    return `<span class="text-slate-800 font-medium text-right">${escapeHtml(String(val))}</span>`;
  };

  const body = `
    <div class="space-y-4">
      ${Object.entries(detail).map(([k, v]) => {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
          return `
            <div class="text-sm border-b border-slate-50 pb-3">
              <span class="text-slate-500 capitalize block mb-1 font-medium">${escapeHtml(k.replace(/_/g, " "))}</span>
              ${renderValue(k, v)}
            </div>`;
        }
        return `
          <div class="flex justify-between items-center gap-4 text-sm border-b border-slate-50 pb-2">
            <span class="text-slate-500 capitalize">${escapeHtml(k.replace(/_/g, " "))}</span>
            ${renderValue(k, v)}
          </div>`;
      }).join("")}
    </div>`;

  // TOMBOL FOOTER DINAMIS (Jika Mode Edit, tambahkan tombol Simpan Revisi)
  let footerHtml = `<button id="detail-close" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Tutup</button>`;
  if (canEdit) {
     footerHtml += `<button id="detail-save" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition shadow-md">Simpan Revisi HRD</button>`;
  }

  openModal({ 
    title: `Detail — ${row.nama_form}`, 
    bodyHtml: body, 
    size: canEdit ? "xl" : "lg", 
    footerHtml: footerHtml,
    onMount: (m) => {
      m.querySelector("#detail-close").onclick = closeModal;
      
      // LOGIKA PENYIMPANAN REVISI OLEH HRD
      if (canEdit) {
        const table = m.querySelector("#edit-klaim-table");
        const grandTotalEl = m.querySelector("#edit-klaim-grandtotal");
        const HARGA_BENSIN = 10000;
        const RASIO_KM = 25;

        // Fungsi Hitung Real-time saat HRD mengetik koreksi
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
                const rowTotal = (trip * (HARGA_BENSIN/RASIO_KM)) + parkir + denda;

                tr.querySelector(".klaim-row-total").textContent = Math.round(rowTotal).toLocaleString("id-ID");
                grandTotal += rowTotal;
            });
            if (grandTotalEl) grandTotalEl.textContent = `Rp ${Math.round(grandTotal).toLocaleString("id-ID")}`;
        }

        table.querySelectorAll(".klaim-input").forEach(input => {
            input.addEventListener("input", calc);
        });

        // Eksekusi Penyimpanan Revisi
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
                const rowTotal = Math.round((trip * (HARGA_BENSIN/RASIO_KM)) + parkir + denda);

                detailKlaim.push({
                    tanggal: tgl,
                    km_awal: kmAwal,
                    km_akhir: kmAkhir,
                    parkir: parkir,
                    denda: denda,
                    total_baris: rowTotal,
                    catatan_hrd: catatan // Menyimpan catatan spesifik dari HRD
                });
                totalKlaim += rowTotal;
            });

            // Timpa rincian tabel lama dengan rincian tabel hasil revisi HRD
            const newDetail = { ...row.detail, total_klaim: totalKlaim, rincian_tabel: detailKlaim };

            const btnSave = m.querySelector("#detail-save");
            btnSave.disabled = true;
            btnSave.textContent = "Menyimpan Revisi...";

            try {
                await fsUpdate(COL.DATA_PENGAJUAN, row.id, { detail: newDetail });
                row.detail = newDetail; // update memory cache agar tak perlu reload halaman
                toast("Data revisi klaim berhasil disimpan", "success");
                closeModal();
            } catch(e) {
                toast("Gagal menyimpan revisi: " + e.message, "error");
                btnSave.disabled = false;
                btnSave.textContent = "Simpan Revisi HRD";
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
      <p class="text-sm text-slate-600 mb-3">Anda akan <b>${isApprove ? "menyetujui" : "menolak"}</b> pengajuan <b>${escapeHtml(row.nama_form)}</b> dari <b>${escapeHtml(row.nama_pemohon)}</b>. Ini bertindak sebagai tanda tangan digital Anda.</p>
      <textarea id="action-note" rows="3" placeholder="Catatan (opsional)" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition"></textarea>`,
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

  try {
    await fsUpdate(COL.DATA_PENGAJUAN, row.id, { approval_steps: steps, status_final: statusFinal, catatan_penolakan: catatan });
    Object.assign(row, { approval_steps: steps, status_final: statusFinal, catatan_penolakan: catatan });
    toast(action === "APPROVE" ? "Pengajuan disetujui" : "Pengajuan ditolak", action === "APPROVE" ? "success" : "warning");

    // ====================================================
    // LOGIKA EMAIL BERANTAI & FINAL BROADCAST
    // ====================================================
    if (typeof sendEmailNotif === 'function') {
      try {
        if (action === "APPROVE") {
          
          if (idx === steps.length - 1) {
            // [A] APPROVE FINAL -> SEBAR KE PARTISIPAN & PEMOHON
            let rolesToNotify = ["PEMOHON"];
            if (row.form_id === "F-KLAIM-BENSIN" || (row.nama_form||"").toLowerCase().includes("klaim")) { rolesToNotify.push("FINANCE", "ACCOUNTING"); }
            else if ((row.nama_form||"").toLowerCase().includes("cuti")) { rolesToNotify.push("HRD", "ATASAN"); } 
            else { rolesToNotify.push("HRD"); }

            let finalTargets = [];
            for (const role of rolesToNotify) {
                const t = await getTargetsForRole(role, row.nama_pemohon);
                finalTargets.push(...t);
            }
            finalTargets = finalTargets.filter((v,i,a)=>a.findIndex(v2=>(v2.username===v.username))===i);

            for (const target of finalTargets) {
               const token = await createLoginToken(target.username);
               const htmlFinal = `
                 <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                   <h2 style="color: #15803d;">Pengajuan Selesai: ${row.nama_form}</h2>
                   <p>Pengajuan dari <strong>${row.nama_pemohon}</strong> telah <strong>disetujui sepenuhnya</strong>.</p>
                   <a href="https://andela-hris.vercel.app/#dashboard?token=${token}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Buka Sistem HRIS</a>
                 </div>
               `;
               sendEmailNotif(target.email, `[APPROVED] ${row.nama_form}`, htmlFinal);
            }

          } else {
            // [B] NEXT APPROVER -> LEMPAR KE PENYETUJU SELANJUTNYA
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
          // [C] DITOLAK -> KABARI PEMOHON
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
