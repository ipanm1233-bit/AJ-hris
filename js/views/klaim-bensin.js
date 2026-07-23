import { COL } from "../firebase-config.js";
import { fsAdd, fsGetAll, fsUpdate, genId, toast, sendEmailNotif, getTargetsForRole, createLoginToken, escapeHtml } from "../utils.js";

export async function mount(container, { session }) {
  const tbody = container.querySelector("#kb-tbody");
  const grandTotalEl = container.querySelector("#kb-grand-total");
  const addRowBtn = container.querySelector("#kb-add-row");
  const cabangSelect = container.querySelector("#kb-cabang-select");

  const tabFormBtn = container.querySelector("#tab-kb-form");
  const tabAdminBtn = container.querySelector("#tab-kb-admin");
  const panelForm = container.querySelector("#panel-kb-form");
  const panelAdmin = container.querySelector("#panel-kb-admin");

  const btnAdminCirebon = container.querySelector("#admin-tab-cirebon");
  const btnAdminMalang = container.querySelector("#admin-tab-malang");
  const badgeCirebon = container.querySelector("#badge-count-cirebon");
  const badgeMalang = container.querySelector("#badge-count-malang");
  const branchTitle = container.querySelector("#admin-branch-title");
  const adminSearch = container.querySelector("#admin-search-kb");
  const adminTbody = container.querySelector("#admin-kb-tbody");
  const totalApprovedNominalEl = container.querySelector("#admin-total-approved-nominal");

  let currentBranch = "Cirebon";
  let allKlaimData = [];

  // Konfigurasi Harga Bensin & Rasio KM (Dapat disesuaikan)
  const HARGA_BENSIN = 10000;
  const RASIO_KM = 25;
  let rowCount = 0;

  // TAB SWITCHING (FORM vs ADMIN)
  if (tabFormBtn && tabAdminBtn) {
     tabFormBtn.onclick = () => {
        panelForm.classList.remove("hidden");
        panelAdmin.classList.add("hidden");
        tabFormBtn.className = "px-4 py-2 text-xs font-bold rounded-lg bg-white text-maroon-700 shadow-sm transition";
        tabAdminBtn.className = "px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-800 transition";
     };

     tabAdminBtn.onclick = async () => {
        panelForm.classList.add("hidden");
        panelAdmin.classList.remove("hidden");
        tabAdminBtn.className = "px-4 py-2 text-xs font-bold rounded-lg bg-white text-maroon-700 shadow-sm transition";
        tabFormBtn.className = "px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-800 transition";
        await loadAdminKlaimData();
     };
  }

  // CABANG ADMIN SWITCHING (CIREBON vs MALANG)
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";
  if (!isHrd && tabAdminBtn) {
     tabAdminBtn.style.display = "none";
  }

  const infoNama = container.querySelector("#kb-info-nama");
  const infoArea = container.querySelector("#kb-info-area");
  if (infoNama) infoNama.textContent = session.nama;
  if (infoArea) infoArea.textContent = cabangSelect ? cabangSelect.value : (session.cabang || "Cirebon");
  if (cabangSelect) {
     cabangSelect.onchange = () => {
        if (infoArea) infoArea.textContent = cabangSelect.value;
     };
  }
  if (btnAdminCirebon && btnAdminMalang) {
     btnAdminCirebon.onclick = () => {
        currentBranch = "Cirebon";
        btnAdminCirebon.className = "px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 text-white shadow-sm transition flex items-center gap-2";
        btnAdminMalang.className = "px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition flex items-center gap-2";
        branchTitle.textContent = "Rekap Klaim Bensin — Cabang Cirebon";
        renderAdminKlaimTable();
     };

     btnAdminMalang.onclick = () => {
        currentBranch = "Malang";
        btnAdminMalang.className = "px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-sm transition flex items-center gap-2";
        btnAdminCirebon.className = "px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition flex items-center gap-2";
        branchTitle.textContent = "Rekap Klaim Bensin — Cabang Malang";
        renderAdminKlaimTable();
     };
  }

  if (adminSearch) {
     adminSearch.oninput = () => renderAdminKlaimTable();
  }

  async function loadAdminKlaimData() {
     if (!adminTbody) return;
     adminTbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Memuat data klaim bensin...</td></tr>`;
     const allPengajuan = await fsGetAll(COL.DATA_PENGAJUAN);
     allKlaimData = allPengajuan.filter(x => x.form_id === "F-KLAIM-BENSIN" || x.nama_form?.toLowerCase().includes("bensin"));
     
     const cirebonData = allKlaimData.filter(x => (x.cabang || x.detail?.cabang || "Cirebon").toLowerCase() === "cirebon");
     const malangData = allKlaimData.filter(x => (x.cabang || x.detail?.cabang || "Cirebon").toLowerCase() === "malang");

     if (badgeCirebon) badgeCirebon.textContent = cirebonData.length;
     if (badgeMalang) badgeMalang.textContent = malangData.length;

     renderAdminKlaimTable();
  }

  const adminStatusFilter = container.querySelector("#admin-status-filter");
  const adminBtnPrintRekap = container.querySelector("#admin-btn-print-rekap");

  if (adminStatusFilter) {
     adminStatusFilter.onchange = () => renderAdminKlaimTable();
  }

  if (adminBtnPrintRekap) {
     adminBtnPrintRekap.onclick = () => printRekapCabang();
  }

  function printRekapCabang() {
     const statusVal = adminStatusFilter?.value || "ALL";
     const branchData = allKlaimData.filter(x => {
        const c = (x.cabang || x.detail?.cabang || "Cirebon").toLowerCase();
        if (c !== currentBranch.toLowerCase()) return false;
        if (statusVal !== "ALL" && (x.status_final || "MENUNGGU") !== statusVal) return false;
        return true;
     });

     if (branchData.length === 0) {
        toast("Tidak ada data klaim untuk dicetak pada cabang ini", "warning");
        return;
     }

     const totalNominal = branchData.reduce((sum, item) => sum + Number(item.detail?.total_klaim || item.detail?.grand_total || 0), 0);

     const printWin = window.open("", "_blank", "width=900,height=700");
     if (!printWin) {
        toast("Izin popup diblokir oleh browser. Izinkan popup untuk mencetak.", "error");
        return;
     }

     const rowsHtml = branchData.map((item, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
           <td style="padding: 8px; text-align: center;">${idx + 1}</td>
           <td style="padding: 8px;">${escapeHtml(item.tgl ? item.tgl.substring(0, 10) : "-")}</td>
           <td style="padding: 8px; font-weight: bold;">${escapeHtml(item.nama_pemohon)} <br><span style="font-size: 9px; color: #64748b;">NIK: ${escapeHtml(item.nik || "-")}</span></td>
           <td style="padding: 8px; text-align: center;">${escapeHtml(item.cabang || currentBranch)}</td>
           <td style="padding: 8px; text-align: center;">${escapeHtml(item.status_final || "MENUNGGU")}</td>
           <td style="padding: 8px; text-align: right; font-weight: bold; font-family: monospace;">Rp ${Number(item.detail?.total_klaim || item.detail?.grand_total || 0).toLocaleString("id-ID")}</td>
        </tr>
     `).join("");

     printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
           <title>Rekap Klaim Bensin - Cabang ${escapeHtml(currentBranch)}</title>
           <style>
              body { font-family: Arial, sans-serif; padding: 25px; color: #1e293b; }
              .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
              .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; }
              .header p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
              th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 8px; font-size: 11px; text-align: left; }
              .total-box { text-align: right; font-size: 13px; font-weight: bold; margin-bottom: 35px; background: #f1f5f9; padding: 10px; border-radius: 6px; }
              .signatures { display: flex; justify-content: space-around; margin-top: 40px; text-align: center; }
              .sig-box { width: 28%; font-size: 11px; }
              .sig-space { height: 60px; }
              .sig-name { font-weight: bold; border-top: 1px solid #94a3b8; padding-top: 4px; }
              @media print {
                 body { padding: 0; }
                 button { display: none; }
              }
           </style>
        </head>
        <body>
           <div class="header">
              <h2>PT. ANDELA JAYA SENTOSA</h2>
              <p>DOKUMEN REKAP KLAIM BENSIN & OPERASIONAL — CABANG ${escapeHtml(currentBranch).toUpperCase()}</p>
              <p>Tanggal Cetak: ${new Date().toLocaleDateString("id-ID", { dateStyle: "full" })}</p>
           </div>

           <table>
              <thead>
                 <tr>
                    <th style="text-align: center;">No</th>
                    <th>Tanggal Ajuan</th>
                    <th>Pemohon / Sales</th>
                    <th style="text-align: center;">Cabang</th>
                    <th style="text-align: center;">Status</th>
                    <th style="text-align: right;">Nominal (Rp)</th>
                 </tr>
              </thead>
              <tbody>
                 ${rowsHtml}
              </tbody>
           </table>

           <div class="total-box">
              GRAND TOTAL REKAP KLAIM (${branchData.length} VOUCHER): Rp ${totalNominal.toLocaleString("id-ID")}
           </div>

           <div class="signatures">
              <div class="sig-box">
                 <p>Admin Cabang</p>
                 <div class="sig-space"></div>
                 <div class="sig-name">( ${escapeHtml(session.nama || "Admin Cabang")} )</div>
              </div>
              <div class="sig-box">
                 <p>Kasir (Pencairan)</p>
                 <div class="sig-space"></div>
                 <div class="sig-name">( Kasir Cabang )</div>
              </div>
              <div class="sig-box">
                 <p>Accounting (Approver Akhir)</p>
                 <div class="sig-space"></div>
                 <div class="sig-name">( Finance / Accounting )</div>
              </div>
           </div>

           <script>
              window.onload = function() { window.print(); };
           </script>
        </body>
        </html>
     `);
     printWin.document.close();
  }

  function printSingleSalesClaim(item) {
     const printWin = window.open("", "_blank", "width=850,height=700");
     if (!printWin) {
        toast("Izin popup diblokir browser. Izinkan popup untuk mencetak.", "error");
        return;
     }

     const detailList = item.detail?.rincian_tabel || [];
     const total = Number(item.detail?.total_klaim || item.detail?.grand_total || 0);
     const cabangArea = item.cabang || item.detail?.cabang || currentBranch || "Cirebon";

     const tripRowsHtml = detailList.length > 0 ? detailList.map((r, i) => {
        const kmAwal = Number(r.km_awal || 0);
        const kmAkhir = Number(r.km_akhir || 0);
        const trip = Math.max(0, kmAkhir - kmAwal);
        const petrolRp = Math.round(trip * (HARGA_BENSIN / RASIO_KM));
        const parkirRp = Number(r.parkir || 0);

        return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
           <td style="padding: 8px; text-align: center;">${i + 1}</td>
           <td style="padding: 8px;">${escapeHtml(r.tanggal || "-")}</td>
           <td style="padding: 8px; text-align: right;">${kmAwal.toLocaleString("id-ID")}</td>
           <td style="padding: 8px; text-align: right;">${kmAkhir.toLocaleString("id-ID")}</td>
           <td style="padding: 8px; text-align: right; font-weight: bold;">${trip} KM</td>
           <td style="padding: 8px; text-align: right;">Rp ${petrolRp.toLocaleString("id-ID")}</td>
           <td style="padding: 8px; text-align: right;">Rp ${parkirRp.toLocaleString("id-ID")}</td>
           <td style="padding: 8px;">${escapeHtml(r.tujuan || r.kunjungan || "-")}</td>
        </tr>
     `;}).join("") : `
        <tr><td colspan="8" style="padding: 12px; text-align: center; color: #94a3b8;">Tidak ada detail rincian perjalanan</td></tr>
     `;

     printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
           <title>Form Claim Sales - ${escapeHtml(item.nama_pemohon)}</title>
           <style>
              body { font-family: Arial, sans-serif; padding: 25px; color: #0f172a; }
              .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; text-align: center; }
              .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; font-weight: bold; }
              .header h3 { margin: 4px 0 0; font-size: 15px; color: #334155; }
              .meta-box { margin-bottom: 20px; font-size: 12px; background: #f8fafc; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; }
              .meta-box p { margin: 4px 0; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; font-size: 10px; text-align: left; text-transform: uppercase; }
              td { border: 1px solid #cbd5e1; }
              .grand-total { text-align: right; font-size: 14px; font-weight: bold; background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 30px; }
              .signatures { margin-top: 40px; }
              .sig-date { text-align: right; font-size: 12px; font-weight: bold; margin-bottom: 20px; }
              .sig-grid { display: flex; justify-content: space-between; text-align: center; }
              .sig-box { width: 30%; font-size: 11px; }
              .sig-space { height: 60px; }
              .sig-name { font-weight: bold; border-top: 1px solid #94a3b8; padding-top: 4px; }
              @media print {
                 body { padding: 0; }
              }
           </style>
        </head>
        <body>
           <div class="header">
              <h2>CV ANDELA JAYA</h2>
              <h3>FORM CLAIM SALES</h3>
           </div>

           <div class="meta-box">
              <p><strong>Nama :</strong> ${escapeHtml(item.nama_pemohon)}</p>
              <p><strong>Area :</strong> ${escapeHtml(cabangArea)}</p>
              <p><strong>Jenis BBM :</strong> Pertalite</p>
           </div>

           <table>
              <thead>
                 <tr>
                    <th style="text-align: center; width: 30px;">NO</th>
                    <th>TGL</th>
                    <th style="text-align: right;">KM AWAL</th>
                    <th style="text-align: right;">KM AKHIR</th>
                    <th style="text-align: right;">JARAK TEMPUH</th>
                    <th style="text-align: right;">PETROL (Rp)</th>
                    <th style="text-align: right;">PARKIR (Rp)</th>
                    <th>TUJUAN / DAFTAR KUNJUNGAN</th>
                 </tr>
              </thead>
              <tbody>
                 ${tripRowsHtml}
              </tbody>
           </table>

           <div class="grand-total">
              TOTAL CLAIM BENSIN SALES: Rp ${total.toLocaleString("id-ID")}
           </div>

           <div class="signatures">
              <div class="sig-date">${escapeHtml(cabangArea)}, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
              <div class="sig-grid">
                 <div class="sig-box">
                    <p>Yang Mengajukan,</p>
                    <div class="sig-space"></div>
                    <div class="sig-name">( ${escapeHtml(item.nama_pemohon)} )<br><span style="font-weight: normal; font-size: 10px;">Sales</span></div>
                 </div>
                 <div class="sig-box">
                    <p>Mengetahui,</p>
                    <div class="sig-space"></div>
                    <div class="sig-name">( SPV Sales )<br><span style="font-weight: normal; font-size: 10px;">Supervisor</span></div>
                 </div>
                 <div class="sig-box">
                    <p>Dicek Oleh,</p>
                    <div class="sig-space"></div>
                    <div class="sig-name">( HR Staff )<br><span style="font-weight: normal; font-size: 10px;">HRD / Finance</span></div>
                 </div>
              </div>
           </div>

           <script>
              window.onload = function() { window.print(); };
           </script>
        </body>
        </html>
     `);
     printWin.document.close();
  }

  function renderAdminKlaimTable() {
     if (!adminTbody) return;
     const query = (adminSearch?.value || "").toLowerCase().trim();
     const statusVal = adminStatusFilter?.value || "ALL";

     const filteredByBranch = allKlaimData.filter(x => {
        const c = (x.cabang || x.detail?.cabang || "Cirebon").toLowerCase();
        if (c !== currentBranch.toLowerCase()) return false;
        if (statusVal !== "ALL" && (x.status_final || "MENUNGGU") !== statusVal) return false;
        return true;
     });

     const approvedNominal = filteredByBranch
        .filter(x => x.status_final === "DISETUJUI")
        .reduce((sum, item) => sum + (Number(item.detail?.total_klaim || item.detail?.grand_total || 0)), 0);

     if (totalApprovedNominalEl) {
        totalApprovedNominalEl.textContent = `Rp ${approvedNominal.toLocaleString("id-ID")}`;
     }

     const searchFiltered = filteredByBranch.filter(x => {
        return (x.nama_pemohon || "").toLowerCase().includes(query) || (x.nik || "").toLowerCase().includes(query);
     });

     if (searchFiltered.length === 0) {
        adminTbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada data klaim bensin untuk cabang ${currentBranch}.</td></tr>`;
        return;
     }

     adminTbody.innerHTML = searchFiltered.map(item => {
        const total = Number(item.detail?.total_klaim || item.detail?.grand_total || 0);
        const status = item.status_final || "MENUNGGU";
        let statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Menunggu Review</span>`;
        if (status === "DISETUJUI") statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Disetujui</span>`;
        if (status === "DITOLAK") statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800">Ditolak</span>`;

        return `
           <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
              <td class="p-3 font-mono text-slate-600">${item.tgl ? item.tgl.substring(0,10) : "-"}</td>
              <td class="p-3 font-semibold text-slate-800">
                 ${escapeHtml(item.nama_pemohon)}
                 <p class="text-[10px] text-slate-400 font-normal">NIK: ${escapeHtml(item.nik || "-")}</p>
              </td>
              <td class="p-3 font-medium text-slate-700">${escapeHtml(item.cabang || item.detail?.cabang || currentBranch)}</td>
              <td class="p-3 text-right font-mono font-bold text-slate-800">Rp ${total.toLocaleString("id-ID")}</td>
              <td class="p-3 text-center">${statusBadge}</td>
              <td class="p-3 text-center">
                 <div class="flex items-center justify-center gap-1.5">
                    <button data-admin-act="approve" data-id="${item.id}" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg shadow-sm transition">
                       Setujui
                    </button>
                    <button data-admin-act="reject" data-id="${item.id}" class="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg shadow-sm transition">
                       Tolak
                    </button>
                 </div>
              </td>
              <td class="p-3 text-center">
                 <button data-print-single="${item.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] rounded-lg transition border border-slate-200 flex items-center gap-1 mx-auto">
                    <span>🖨️ Cetak Sales</span>
                 </button>
              </td>
           </tr>
        `;
     }).join("");

     adminTbody.querySelectorAll("[data-print-single]").forEach(btn => {
        btn.onclick = () => {
           const id = btn.dataset.printSingle;
           const targetItem = allKlaimData.find(x => x.id === id);
           if (targetItem) printSingleSalesClaim(targetItem);
        };
     });

     adminTbody.querySelectorAll("[data-admin-act]").forEach(btn => {
        btn.onclick = async () => {
           const id = btn.dataset.id;
           const act = btn.dataset.adminAct;
           const nextStatus = act === "approve" ? "DISETUJUI" : "DITOLAK";
           
           if (confirm(`Apakah Anda yakin ingin ${act === "approve" ? "MENYETUJUI" : "MENOLAK"} klaim bensin ini?`)) {
              try {
                 await fsUpdate(COL.DATA_PENGAJUAN, id, { status_final: nextStatus });
                 toast(`Klaim bensin berhasil di-update menjadi ${nextStatus}`, "success");
                 await loadAdminKlaimData();
              } catch (e) {
                 toast("Gagal update status: " + e.message, "error");
              }
           }
        };
     });
  }

  function addRow() {
    rowCount++;
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-50";
    tr.innerHTML = `
      <td class="p-2"><input type="date" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-xs" data-field="tanggal" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-xs" data-field="km_awal" value="0" min="0" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-xs" data-field="km_akhir" value="0" min="0" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-xs" data-field="parkir" value="0" min="0"></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-xs" data-field="denda" value="0" min="0"></td>
      <td class="p-2"><input type="text" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-xs" data-field="tujuan" placeholder="Daftar toko / kunjungan"></td>
      <td class="p-2 text-right"><span class="kb-row-total font-semibold text-slate-700 text-xs">0</span></td>
      <td class="p-2 text-center">
        <button type="button" class="kb-delete text-slate-300 hover:text-red-600 transition" title="Hapus baris ini">✖</button>
      </td>
    `;
    
    tr.querySelectorAll(".kb-input").forEach(input => {
      input.addEventListener("input", calculateTotal);
    });
    
    tr.querySelector(".kb-delete").addEventListener("click", () => {
      tr.remove();
      calculateTotal();
    });
    
    tbody.appendChild(tr);
  }

  if (addRowBtn) {
    addRowBtn.addEventListener("click", addRow);
  }

  function calculateTotal() {
    let grandTotal = 0;
    
    tbody.querySelectorAll("tr").forEach(tr => {
      const getValue = (field) => parseFloat(tr.querySelector(`[data-field="${field}"]`).value) || 0;
      
      const kmAwal = Math.max(0, getValue("km_awal"));
      const kmAkhir = Math.max(0, getValue("km_akhir"));
      const parkir = Math.max(0, getValue("parkir"));
      const denda = Math.max(0, getValue("denda"));
      
      let trip = kmAkhir - kmAwal;
      if (trip < 0) trip = 0; 
      
      const totalPetrol = trip * (HARGA_BENSIN / RASIO_KM);
      const rowTotal = totalPetrol + parkir - denda; 
      
      const rowTotalEl = tr.querySelector(".kb-row-total");
      if (rowTotalEl) rowTotalEl.textContent = Math.round(rowTotal).toLocaleString("id-ID");
      grandTotal += rowTotal;
    });
    
    if (grandTotalEl) grandTotalEl.textContent = `Rp ${Math.round(grandTotal).toLocaleString("id-ID")}`;
  }

  container.querySelector("#kb-submit")?.addEventListener("click", async () => {
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr");
    
    if (rows.length === 0) {
      toast("Tambahkan minimal 1 baris perjalanan", "warning");
      return;
    }

    let isValid = true;
    rows.forEach(tr => {
      if (!tr.querySelector(`[data-field="tanggal"]`).value) isValid = false;
    });
    if (!isValid) {
      toast("Pastikan semua kolom tanggal telah terisi", "warning");
      return;
    }
    
    const detailKlaim = [];
    let totalKlaim = 0;
    const selectedCabang = cabangSelect ? cabangSelect.value : "Cirebon";
    
    rows.forEach(tr => {
      const getValue = (field) => parseFloat(tr.querySelector(`[data-field="${field}"]`).value) || 0;
      const tgl = tr.querySelector(`[data-field="tanggal"]`).value;
      const tujuan = tr.querySelector(`[data-field="tujuan"]`)?.value || "-";
      
      const trip = Math.max(0, getValue("km_akhir") - getValue("km_awal"));
      const petrol = trip * (HARGA_BENSIN / RASIO_KM);
      const rowTotal = petrol + getValue("parkir") - getValue("denda"); 
      
      detailKlaim.push({
        tanggal: tgl,
        km_awal: getValue("km_awal"),
        km_akhir: getValue("km_akhir"),
        parkir: getValue("parkir"),
        denda: getValue("denda"),
        tujuan: tujuan,
        total_baris: Math.round(rowTotal)
      });
      
      totalKlaim += rowTotal;
    });
    
    const submitBtn = container.querySelector("#kb-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Mengirim...";
    
    const payload = {
      id: genId("TRX-KLAIM"),
      tgl: new Date().toISOString(),
      nik: session.nik || "-",
      nama_pemohon: session.nama,
      cabang: selectedCabang,
      form_id: "F-KLAIM-BENSIN",
      nama_form: `Klaim Bensin Operasional (${selectedCabang})`,
      detail: {
        cabang: selectedCabang,
        total_klaim: Math.round(totalKlaim),
        rincian_tabel: detailKlaim 
      },
      approval_flow: ["ATASAN", "HRD", "FINANCE"],
      approval_steps: ["PENDING", "PENDING", "PENDING"],
      status_final: "MENUNGGU",
      catatan_penolakan: []
    };
    
    try {
      await fsAdd(COL.DATA_PENGAJUAN, payload, payload.id);
      toast(`Klaim bensin Cabang ${selectedCabang} berhasil diajukan`, "success");
      
      if (typeof sendEmailNotif === 'function') {
        try {
          const targets = await getTargetsForRole("ATASAN", payload.nama_pemohon);
          
          for (const target of targets) {
             const token = await createLoginToken(target.username);
             const magicLink = `https://andela-hris.vercel.app/#approval?token=${token}`;
             const htmlEmail = `
               <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                 <h2 style="color: #7a1f2b;">Pengajuan Baru: ${payload.nama_form}</h2>
                 <p><strong>Diajukan Oleh:</strong> ${payload.nama_pemohon} (${selectedCabang})</p>
                 <p><strong>Total Klaim:</strong> Rp ${Math.round(totalKlaim).toLocaleString("id-ID")}</p>
                 <p>Pengajuan ini membutuhkan persetujuan Anda sebagai <strong>ATASAN</strong>.</p>
                 <a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Akses Langsung & Setujui</a>
               </div>
             `;
             
             sendEmailNotif(target.email, `Persetujuan Dibutuhkan: ${payload.nama_form}`, htmlEmail).catch(e => console.warn("Email warning:", e));
          }
        } catch (emailErr) {
          console.warn("Gagal mengirim/meresolve email atasan:", emailErr);
        }
      }
      
      tbody.innerHTML = "";
      addRow();
      calculateTotal();
      
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
      window.location.hash = "#dashboard";
      
    } catch (e) {
      toast("Gagal mengajukan klaim: " + e.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
    }
  });

  addRow();
  return { unmount() {} };
}
