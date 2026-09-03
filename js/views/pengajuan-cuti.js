import { db, COL, doc, getDoc, setDoc, query, collection, where, getDocs } from "../firebase-config.js";
import { fsGetAll, openModal, closeModal, toast, fmtDateShort, escapeHtml, genId, toNumber, sendEmailNotif, getTargetsForRole, createLoginToken, notifyUser, getCalculatedJatahCuti, confirmDialog, getEmployeeTenureInfo, countLeaveWorkingDays, getLeaveWorkingDaysDetail, isIndonesianNationalHoliday, sendBranchInstantAlert, localDateStr } from "../utils.js";
import { uploadFileToDrive } from "../gas-integration.js";
import { badge } from "../components.js";

const DEFAULT_LEAVE_TYPES = [
  { id: "C - Cuti Tahunan", name: "Cuti Tahunan", potong_jatah: "Tahunan", count: 1 },
  { id: "C1/2 - Cuti Setengah Hari", name: "Cuti Setengah Hari", potong_jatah: "Tahunan", count: 0.5 },
  { id: "CS - Cuti Sisa", name: "Cuti Sisa / Akumulasi Tahun Lalu", potong_jatah: "Akumulasi", count: 1 },
  { id: "C+ - Cuti Khusus", name: "Cuti Khusus / Alasan Penting", potong_jatah: "Khusus", count: 1, has_subcategory: true },
  { id: "S - Sakit dgn Surat Dokter", name: "Sakit dengan Surat Dokter (Tidak Potong Cuti)", potong_jatah: "Tidak Dipotong", count: 0, need_file: true, file_label: "Surat Keterangan Dokter / RS" },
  { id: "S- - Sakit tanpa Surat Dokter", name: "Sakit tanpa Surat Dokter (Potong Cuti)", potong_jatah: "Tahunan", count: 1 },
  { id: "CB - Cuti Bersama", name: "Cuti Bersama", potong_jatah: "Tahunan", count: 1 },
  { id: "C- - Potong Gaji", name: "Cuti Potong Gaji / Unpaid Leave", potong_jatah: "Potong Gaji", count: 1 },
  { id: "C-BESAR - Cuti Besar", name: "Cuti Besar (Umroh / Haji / Masa Kerja)", potong_jatah: "Tidak Dipotong", count: 0, has_subcategory: true },
  { id: "D - Dinas Luar Kota", name: "Dinas Luar Kota / Tugas Lapangan", potong_jatah: "Tidak Dipotong", count: 0 }
];

export async function mount(container, { session }) {
  const btnOpen = container.querySelector("#btn-open-cuti-modal");
  const tblBody = container.querySelector("#tbl-my-leaves");

  // Balance Card Elements
  const elTahunanJatah = container.querySelector("#bal-tahunan-jatah");
  const elTahunanTerpakai = container.querySelector("#bal-tahunan-terpakai");
  const elTahunanSisa = container.querySelector("#bal-tahunan-sisa");

  const elAkumulasiJatah = container.querySelector("#bal-akumulasi-jatah");
  const elAkumulasiTerpakai = container.querySelector("#bal-akumulasi-terpakai");
  const elAkumulasiSisa = container.querySelector("#bal-akumulasi-sisa");

  const elKhususJatah = container.querySelector("#bal-khusus-jatah");
  const elKhususTerpakai = container.querySelector("#bal-khusus-terpakai");
  const elKhususSisa = container.querySelector("#bal-khusus-sisa");

  let leaveCategories = DEFAULT_LEAVE_TYPES;
  let myLeaveRecords = [];
  let allEmployees = [];
  let calendarEvents = [];
  let currentEmpData = null;
  let employeeTenure = { tenureYears: 0, diffMonths: 0, tenureText: "0 Bulan", maxLeaveDays: 2, bracketLabel: "0 - 5 Tahun" };
  let userBalances = { sisaTahunan: 0, sisaKhusus: 0, sisaAkumulasi: 0 };

  // Load employee's leave balance & history
  async function loadData() {
    try {
      // 1. Fetch Leave Types from Settings if available
      try {
        const setSnap = await getDoc(doc(db, COL.APP_SETTINGS, "leave_types"));
        if (setSnap.exists()) {
          const sData = setSnap.data();
          if (Array.isArray(sData.types) && sData.types.length) {
            leaveCategories = sData.types;
          } else if (Array.isArray(sData.items) && sData.items.length) {
            leaveCategories = sData.items;
          }
        }
      } catch (e) {
        console.warn("Using default leave categories");
      }

      // 2. Fetch Master Karyawan for Handover selection & current employee's quota & tenure
      allEmployees = await fsGetAll(COL.MASTER_KARYAWAN);
      const curEmp = allEmployees.find(e => 
        (e.nama_karyawan && e.nama_karyawan.toLowerCase() === session.nama.toLowerCase()) ||
        (e.nik && e.nik === session.nik) ||
        (e.username && e.username === session.username)
      );
      currentEmpData = curEmp;
      employeeTenure = getEmployeeTenureInfo(curEmp);

      // Fetch calendar events (for national holidays & agenda)
      calendarEvents = await fsGetAll(COL.KALENDER_HR).catch(() => []);

      // 3. Fetch Master Cuti to compute actual balances
      const allCutiRecords = await fsGetAll(COL.MASTER_CUTI);
      const myCutiDocs = allCutiRecords.filter(c => 
        c.nama_karyawan?.toLowerCase() === session.nama?.toLowerCase() ||
        c.nik === session.nik
      );

      // Calculate Official Balances
      userBalances = getCalculatedJatahCuti(curEmp, myCutiDocs);

      // Update Mini Dashboard Cards
      if (elTahunanJatah) elTahunanJatah.textContent = `${userBalances.jatahTahunan ?? 0}`;
      if (elTahunanTerpakai) elTahunanTerpakai.textContent = `${userBalances.terpakaiTahunan ?? 0} Hari`;
      if (elTahunanSisa) {
        elTahunanSisa.textContent = `${userBalances.sisaTahunan ?? 0}`;
        elTahunanSisa.className = `text-2xl font-black font-mono ${userBalances.sisaTahunan <= 0 ? 'text-rose-600' : 'text-blue-700'}`;
      }

      if (elAkumulasiJatah) elAkumulasiJatah.textContent = `${userBalances.jatahAkumulasi ?? 0}`;
      if (elAkumulasiTerpakai) elAkumulasiTerpakai.textContent = `${userBalances.terpakaiAkumulasi ?? 0} Hari`;
      if (elAkumulasiSisa) {
        elAkumulasiSisa.textContent = `${userBalances.sisaAkumulasi ?? 0}`;
        elAkumulasiSisa.className = `text-2xl font-black font-mono ${userBalances.sisaAkumulasi <= 0 ? 'text-rose-600' : 'text-sky-700'}`;
      }

      if (elKhususJatah) elKhususJatah.textContent = `${userBalances.jatahKhusus ?? 0}`;
      if (elKhususTerpakai) elKhususTerpakai.textContent = `${userBalances.terpakaiKhusus ?? 0} Hari`;
      if (elKhususSisa) {
        elKhususSisa.textContent = `${userBalances.sisaKhusus ?? 0}`;
        elKhususSisa.className = `text-2xl font-black font-mono ${userBalances.sisaKhusus <= 0 ? 'text-rose-600' : 'text-purple-700'}`;
      }

      // 4. Fetch My Leave Submissions
      const allPengajuan = await fsGetAll(COL.DATA_PENGAJUAN);
      myLeaveRecords = allPengajuan.filter(p => {
        const isMe = (p.nama_pemohon?.toLowerCase() === session.nama?.toLowerCase()) || 
                     (p.pemohon?.toLowerCase() === session.nama?.toLowerCase()) ||
                     (p.nik_pemohon && p.nik_pemohon === session.nik) ||
                     (p.nik && p.nik === session.nik);
        const isCuti = p.form_id === "F-ISO-CUTI" || (p.nama_form || "").toLowerCase().includes("cuti") || !!p.kategori_cuti;
        return isMe && isCuti;
      });

      myLeaveRecords.sort((a, b) => new Date(b.tgl || b.createdAt || 0) - new Date(a.tgl || a.createdAt || 0));

      renderTable();
    } catch (err) {
      console.error("Error loading leave module data:", err);
      tblBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-500">Gagal memuat data pengajuan cuti: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderTable() {
    if (!myLeaveRecords.length) {
      tblBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada riwayat pengajuan cuti. Klik tombol di atas untuk mengajukan.</td></tr>`;
      return;
    }

    tblBody.innerHTML = myLeaveRecords.map(r => {
      const st = (r.status_final || r.status || "MENUNGGU").toUpperCase();
      let stBadge = badge("Menunggu Persetujuan", "amber");
      if (st.includes("APPROVED") || st.includes("SETUJU")) stBadge = badge("Disetujui", "green");
      else if (st.includes("REJECT") || st.includes("TOLAK")) stBadge = badge("Ditolak", "red");

      const docLink = (st.includes("APPROVED") || st.includes("SETUJU"))
        ? `<div class="flex items-center gap-2">
            <button type="button" onclick="window.downloadFormCutiPdf(${escapeHtml(JSON.stringify(r))})" class="text-maroon-700 font-bold hover:underline inline-flex items-center gap-1 text-xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Download PDF
            </button>
            <button type="button" onclick="window.printFormCutiFisik(${escapeHtml(JSON.stringify(r))})" class="text-slate-500 font-medium hover:underline text-xs">Cetak</button>
          </div>`
        : r.lampiran_url 
        ? `<a href="${r.lampiran_url}" target="_blank" class="text-maroon-700 font-bold hover:underline">Lihat Lampiran</a>`
        : `<span class="text-slate-400">-</span>`;

      const dt = r.detail || {};
      const isPotongGaji = r.is_potong_gaji || r.potong_gaji || dt.is_potong_gaji || (r.kategori_cuti || "").includes("Potong Gaji");
      const potongGajiHari = r.potong_gaji_hari || dt.potong_gaji_hari || r.jumlah_hari || 1;

      return `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 font-mono font-bold text-slate-800">${escapeHtml(r.no_referensi || r.id)}</td>
        <td class="p-3 font-semibold text-slate-800">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span>${escapeHtml(r.kategori_cuti || r.jenis_cuti || dt.jenis_cuti || "Cuti")}</span>
            ${isPotongGaji ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">Potong Gaji (${potongGajiHari} Hari)</span>` : ''}
          </div>
          ${(r.sub_kategori || dt.sub_kategori) ? `<span class="block text-[11px] font-normal text-slate-500">${escapeHtml(r.sub_kategori || dt.sub_kategori)}</span>` : ''}
        </td>
        <td class="p-3 font-medium text-slate-700">
          ${fmtDateShort(r.tanggal_mulai || dt.tanggal_mulai || r.tgl)} ${(r.tanggal_selesai || dt.tanggal_akhir) && (r.tanggal_selesai || dt.tanggal_akhir) !== (r.tanggal_mulai || dt.tanggal_mulai) ? `s/d ${fmtDateShort(r.tanggal_selesai || dt.tanggal_akhir)}` : ''}
        </td>
        <td class="p-3 font-bold font-mono text-slate-800">${r.jumlah_hari || dt.jumlah_hari || r.count || 1} Hari</td>
        <td class="p-3">${docLink}</td>
        <td class="p-3">${stBadge}</td>
        <td class="p-3 text-center">
          <button data-id="${r.id}" class="btn-view-detail-leave px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer">
            Detail
          </button>
        </td>
      </tr>`;
    }).join("");

    tblBody.querySelectorAll(".btn-view-detail-leave").forEach(btn => {
      btn.onclick = () => {
        const item = myLeaveRecords.find(x => x.id === btn.dataset.id);
        if (item) openDetailModal(item);
      };
    });
  }

  function openDetailModal(item) {
    const dt = item.detail || {};
    const isPotongGaji = item.is_potong_gaji || item.potong_gaji || dt.is_potong_gaji || (item.kategori_cuti || "").includes("Potong Gaji");
    const potongGajiHari = item.potong_gaji_hari || dt.potong_gaji_hari || item.jumlah_hari || 1;

    openModal({
      title: `Detail Pengajuan Cuti — ${item.no_referensi || item.id}`,
      size: "md",
      bodyHtml: `
      <div class="space-y-3 text-left text-xs">
        ${isPotongGaji ? `
        <div class="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2.5 text-rose-950">
          <div class="p-1.5 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div>
            <span class="font-bold uppercase block text-rose-900">Perhatian: Pengajuan Cuti Potong Gaji (Unpaid Leave)</span>
            <span class="text-[11px] block mt-0.5 text-rose-800 font-medium leading-relaxed">
              Jatah cuti pemohon telah habis/tidak cukup saat pengajuan. Cuti ini disetujui memotong gaji sebanyak <b>${potongGajiHari} Hari Kerja</b>.
            </span>
          </div>
        </div>
        ` : ''}

        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5">
          <div class="flex justify-between"><span class="text-slate-500">Pemohon:</span><span class="font-bold text-slate-800">${escapeHtml(item.nama_pemohon || item.pemohon)}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Jenis Cuti:</span><span class="font-semibold text-maroon-700">${escapeHtml(item.kategori_cuti || item.jenis_cuti || dt.jenis_cuti)}</span></div>
          ${(item.sub_kategori || dt.sub_kategori) ? `<div class="flex justify-between"><span class="text-slate-500">Sub-Kategori:</span><span class="font-semibold text-slate-800">${escapeHtml(item.sub_kategori || dt.sub_kategori)}</span></div>` : ''}
          <div class="flex justify-between"><span class="text-slate-500">Tanggal Cuti:</span><span class="font-bold text-slate-800">${fmtDateShort(item.tanggal_mulai || dt.tanggal_mulai || item.tgl)} ${(item.tanggal_selesai || dt.tanggal_akhir) ? `s/d ${fmtDateShort(item.tanggal_selesai || dt.tanggal_akhir)}` : ''} (${item.jumlah_hari || dt.jumlah_hari || 1} Hari)</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Pejabat Pengganti:</span><span class="font-semibold text-slate-800">${escapeHtml(item.pejabat_pengganti || dt.pejabat_pengganti || '-')}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">No. HP Selama Cuti:</span><span class="font-mono text-slate-800">${escapeHtml(item.no_telepon || dt.no_telepon || '-')}</span></div>
        </div>
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
          <span class="text-slate-500 block font-semibold mb-1">Alasan / Keterangan Cuti:</span>
          <p class="text-slate-800 leading-relaxed">${escapeHtml(item.alasan || dt.alasan || '-')}</p>
        </div>
        ${item.lampiran_url ? `
        <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center justify-between">
          <span class="font-semibold text-blue-900">Dokumen Lampiran Terlampir:</span>
          <a href="${item.lampiran_url}" target="_blank" class="px-3 py-1 bg-blue-700 text-white rounded-lg font-bold text-[11px] hover:bg-blue-800">
            Buka File
          </a>
        </div>` : ''}
        ${(item.status_final || "").includes("APPROVED") ? `
        <div class="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 flex items-center justify-between">
          <div class="text-xs text-emerald-900">
            <p class="font-bold">Dokumen Form Cuti Fisik (Full Approved)</p>
            <p class="text-[11px] text-emerald-700">Form Cuti HR4 resmi telah tergenerate secara otomatis.</p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.downloadFormCutiPdf(${escapeHtml(JSON.stringify(item))})" class="px-3.5 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer inline-flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Download PDF
            </button>
            <button type="button" onclick="window.printFormCutiFisik(${escapeHtml(JSON.stringify(item))})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg cursor-pointer">
              Cetak
            </button>
          </div>
        </div>` : ''}
      </div>`
    });
  }

  // -------------------------------------------------------------
  // DYNAMIC COMPLEX LEAVE REQUEST FORM MODAL (RESMI ANDELA JAYA)
  // -------------------------------------------------------------
  function openFormCutiModal() {
    const empOptions = allEmployees.map(e => `<option value="${escapeHtml(e.nama_karyawan)}">${escapeHtml(e.nama_karyawan)} (${escapeHtml(e.jabatan || 'Karyawan')})</option>`).join("");

    openModal({
      title: "Formulir Pengajuan Cuti Karyawan (F-ISO-CUTI)",
      size: "lg",
      bodyHtml: `
      <form id="form-cuti-complex" class="space-y-4 text-left">
        <!-- KETENTUAN MASA KERJA & BATAS PENGAMBILAN CUTI -->
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Masa Kerja Anda:</span>
              <span class="px-2 py-0.5 rounded text-xs font-black bg-maroon-100 text-maroon-800 font-mono">${escapeHtml(employeeTenure.tenureText)} (${escapeHtml(employeeTenure.bracketLabel)})</span>
            </div>
            <div class="text-xs text-slate-700">
              Batas Maks. Pengambilan Cuti: <b class="font-bold text-maroon-700 font-mono text-sm">${employeeTenure.maxLeaveDays} Hari Kerja</b>
            </div>
          </div>
          <div class="text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200 leading-relaxed">
            <span class="font-semibold text-slate-700">Ketentuan Batas Cuti per Pengajuan:</span> 0 s/d &lt; 6 thn: <b>maks. 2 hari</b> | 6 s/d &lt; 11 thn: <b>maks. 3 hari</b> | &ge; 11 thn: <b>maks. 5 hari</b> per bulan (tidak termasuk hari Minggu & Libur Nasional/Perusahaan). <i>Pengajuan yang melebihi ketentuan akan otomatis ditolak (Auto Reject).</i>
          </div>
        </div>

        <!-- SALDO CUTI MINI SUMMARY CARDS -->
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Sisa Saldo Jatah Cuti Anda Saat Ini:</span>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-white p-2 rounded-lg border border-slate-200 text-center shadow-2xs">
              <span class="block text-[10px] text-slate-500 font-medium uppercase">Cuti Tahunan</span>
              <span class="block text-sm font-black ${userBalances.sisaTahunan <= 0 ? 'text-rose-600' : 'text-maroon-700'} font-mono" id="fc-info-sisa-tahunan">${userBalances.sisaTahunan || 0} Hari</span>
            </div>
            <div class="bg-white p-2 rounded-lg border border-slate-200 text-center shadow-2xs">
              <span class="block text-[10px] text-slate-500 font-medium uppercase">Cuti Khusus</span>
              <span class="block text-sm font-black ${userBalances.sisaKhusus <= 0 ? 'text-rose-600' : 'text-amber-700'} font-mono" id="fc-info-sisa-khusus">${userBalances.sisaKhusus || 0} Hari</span>
            </div>
            <div class="bg-white p-2 rounded-lg border border-slate-200 text-center shadow-2xs">
              <span class="block text-[10px] text-slate-500 font-medium uppercase">Cuti Sisa/Akumulasi</span>
              <span class="block text-sm font-black ${userBalances.sisaAkumulasi <= 0 ? 'text-rose-600' : 'text-blue-700'} font-mono" id="fc-info-sisa-akumulasi">${userBalances.sisaAkumulasi || 0} Hari</span>
            </div>
          </div>
        </div>

        <!-- KATEGORI CUTI SELECTION -->
        <div>
          <label class="block text-xs font-bold text-slate-800 mb-1">Pilih Jenis / Kategori Cuti *</label>
          <select id="fc-kategori" required class="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-semibold text-slate-800 bg-slate-50">
            <option value="">-- Pilih Jenis Cuti --</option>
            ${leaveCategories.map(c => `<option value="${escapeHtml(c.id || c.name)}">${escapeHtml(c.name || c.id)}</option>`).join("")}
          </select>
        </div>

        <!-- DYNAMIC CONDITIONAL SECTION (Sub-Category, Half-Day & File Upload) -->
        <div id="fc-dynamic-wrap" class="space-y-3 p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl hidden">
          <!-- HALF-DAY LEAVE INPUTS -->
          <div id="fc-halfday-wrap" class="hidden space-y-3 border-b border-amber-200/60 pb-3">
            <div>
              <label class="block text-xs font-bold text-amber-900 mb-1.5">Pilihan Sesi Cuti Setengah Hari *</label>
              <div class="grid grid-cols-2 gap-2">
                <label class="flex items-center gap-2 p-2.5 bg-white border border-amber-300 rounded-xl cursor-pointer hover:bg-amber-100/50 transition">
                  <input type="radio" name="fc_halfday_session" value="Cuti Pagi" checked class="text-maroon-700 focus:ring-maroon-500">
                  <div>
                    <span class="block text-xs font-bold text-slate-800">Cuti Pagi</span>
                    <span class="block text-[10px] text-slate-500">Masuk Siang (08:00 - 12:00)</span>
                  </div>
                </label>
                <label class="flex items-center gap-2 p-2.5 bg-white border border-amber-300 rounded-xl cursor-pointer hover:bg-amber-100/50 transition">
                  <input type="radio" name="fc_halfday_session" value="Cuti Siang" class="text-maroon-700 focus:ring-maroon-500">
                  <div>
                    <span class="block text-xs font-bold text-slate-800">Cuti Siang</span>
                    <span class="block text-[10px] text-slate-500">Pulang Awal (12:00 - 17:00)</span>
                  </div>
                </label>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-amber-900 mb-1">Waktu Keluar / Jam Absen Cuti *</label>
                <input type="time" id="fc-jam-keluar" value="08:00" class="w-full px-3 py-2 text-xs border border-amber-300 rounded-xl outline-none bg-white font-semibold text-slate-800 focus:border-maroon-500">
              </div>
              <div>
                <label class="block text-xs font-bold text-amber-900 mb-1">Waktu Masuk / Jam Kembali Kerja *</label>
                <input type="time" id="fc-jam-masuk" value="12:00" class="w-full px-3 py-2 text-xs border border-amber-300 rounded-xl outline-none bg-white font-semibold text-slate-800 focus:border-maroon-500">
              </div>
            </div>
          </div>

          <div id="fc-subcat-wrap" class="hidden">
            <label class="block text-xs font-bold text-amber-900 mb-1" id="fc-subcat-label">Pilih Sub-Kategori Cuti *</label>
            <select id="fc-subcat" class="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg outline-none bg-white font-medium text-slate-800">
              <!-- Dynamically populated -->
            </select>
          </div>

          <div id="fc-upload-wrap" class="hidden">
            <label class="block text-xs font-bold text-amber-900 mb-1" id="fc-upload-label">Upload Lampiran Dokumen Bukti *</label>
            <p id="fc-upload-hint" class="text-[11px] text-amber-800 mb-1.5">Wajib melampirkan berkas bukti fisik dalam format PDF/Gambar (Maks 10MB).</p>
            <input type="file" id="fc-file" accept="image/*,.pdf" multiple class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-maroon-700 file:text-white hover:file:bg-maroon-800">
          </div>
        </div>

        <!-- DATES & DURATION -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Tanggal Mulai *</label>
            <input type="date" id="fc-tgl-mulai" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Tanggal Selesai *</label>
            <input type="date" id="fc-tgl-selesai" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Hitungan Hari Kerja</label>
            <input type="text" id="fc-durasi" readonly class="w-full px-3 py-2 text-xs border border-slate-200 bg-slate-100 rounded-xl font-bold font-mono text-slate-800" value="0 Hari">
            <div id="fc-detail-hari" class="text-[11px] text-slate-500 mt-1"></div>
          </div>
        </div>

        <!-- QUOTA EXHAUSTED / POTONG GAJI REAL-TIME WARNING BANNER -->
        <div id="fc-quota-warning-wrap" class="hidden"></div>

        <!-- HANDOVER & PHONE -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Pejabat / Rekan Pengganti (Handover)</label>
            <select id="fc-pengganti" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400">
              <option value="">-- Pilih Rekan Kerja --</option>
              ${empOptions}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">No. Telepon / WA Aktif Selama Cuti *</label>
            <input type="text" id="fc-phone" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400" placeholder="081234567890">
          </div>
        </div>

        <!-- ALASAN DETAIL -->
        <div>
          <label class="block text-xs font-bold text-slate-800 mb-1">Alasan & Keterangan Lengkap Cuti *</label>
          <textarea id="fc-alasan" rows="3" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400" placeholder="Jelaskan alasan pengajuan cuti secara lengkap..."></textarea>
        </div>

        <div class="pt-3 flex justify-end gap-2 border-t border-slate-100">
          <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer">Batal</button>
          <button type="submit" id="btn-submit-cuti" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer">
            Kirim Pengajuan Cuti
          </button>
        </div>
      </form>`
    });

    const catSelect = document.getElementById("fc-kategori");
    const dynWrap = document.getElementById("fc-dynamic-wrap");
    const halfdayWrap = document.getElementById("fc-halfday-wrap");
    const subcatWrap = document.getElementById("fc-subcat-wrap");
    const subcatLabel = document.getElementById("fc-subcat-label");
    const subcatSelect = document.getElementById("fc-subcat");
    const uploadWrap = document.getElementById("fc-upload-wrap");
    const uploadLabel = document.getElementById("fc-upload-label");
    const uploadHint = document.getElementById("fc-upload-hint");
    const fileInput = document.getElementById("fc-file");

    const jamKeluar = document.getElementById("fc-jam-keluar");
    const jamMasuk = document.getElementById("fc-jam-masuk");

    const tglMulai = document.getElementById("fc-tgl-mulai");
    const tglSelesai = document.getElementById("fc-tgl-selesai");
    const txtDurasi = document.getElementById("fc-durasi");
    const warnWrap = document.getElementById("fc-quota-warning-wrap");

    function syncHalfdayTimes() {
      const selectedSesi = document.querySelector('input[name="fc_halfday_session"]:checked')?.value || "Cuti Pagi";
      if (selectedSesi === "Cuti Pagi") {
        if (!jamKeluar.value || jamKeluar.value === "12:00") jamKeluar.value = "08:00";
        if (!jamMasuk.value || jamMasuk.value === "17:00") jamMasuk.value = "12:00";
      } else {
        if (!jamKeluar.value || jamKeluar.value === "08:00") jamKeluar.value = "12:00";
        if (!jamMasuk.value || jamMasuk.value === "12:00") jamMasuk.value = "17:00";
      }
    }

    document.querySelectorAll('input[name="fc_halfday_session"]').forEach(radio => {
      radio.onchange = () => {
        syncHalfdayTimes();
        checkQuotaAndAlert();
      };
    });

    // Dynamic Date Calculation (Excluding Sundays and Indonesian National Holidays)
    function calcDays() {
      const detailEl = document.getElementById("fc-detail-hari");
      if (!tglMulai.value) {
        if (detailEl) detailEl.textContent = "";
        return 0;
      }
      const val = catSelect.value || "";
      if (val.includes("Setengah Hari") || val.includes("1/2")) {
        tglSelesai.value = tglMulai.value;
        txtDurasi.value = "0.5 Hari Kerja";
        if (detailEl) detailEl.innerHTML = `<span class="text-blue-600 font-medium">Cuti Setengah Hari (0.5 Hari Kerja)</span>`;
        return 0.5;
      }
      if (!tglSelesai.value) {
        if (detailEl) detailEl.textContent = "";
        return 0;
      }
      const d1 = new Date(tglMulai.value);
      const d2 = new Date(tglSelesai.value);
      if (d2 < d1) {
        txtDurasi.value = "Tanggal Tidak Valid";
        if (detailEl) detailEl.innerHTML = `<span class="text-rose-600 font-medium">Tanggal selesai tidak boleh sebelum tanggal mulai</span>`;
        return 0;
      }

      const detail = getLeaveWorkingDaysDetail(tglMulai.value, tglSelesai.value, calendarEvents);
      txtDurasi.value = `${detail.totalWorkingDays} Hari Kerja`;
      if (detailEl) {
        if (detail.sundaysCount > 0 || detail.holidaysCount > 0) {
          const holList = detail.skippedHolidays.map(h => `${h.name} (${h.date})`).join(", ");
          detailEl.innerHTML = `<span class="text-emerald-700 font-semibold">✓ ${detail.totalWorkingDays} Hari Kerja Dihitung</span> <span class="text-slate-500">(Melewatkan ${detail.sundaysCount > 0 ? `${detail.sundaysCount} hari Minggu` : ''}${detail.sundaysCount > 0 && detail.holidaysCount > 0 ? ' & ' : ''}${detail.holidaysCount > 0 ? `${detail.holidaysCount} libur: ${holList}` : ''})</span>`;
        } else {
          detailEl.innerHTML = `<span class="text-slate-500 font-medium">Total: ${detail.totalWorkingDays} Hari Kerja (tidak termasuk Minggu & Libur Nasional/Perusahaan)</span>`;
        }
      }
      return detail.totalWorkingDays;
    }

    // Check Quota and Display Real-time Alert
    function checkQuotaAndAlert() {
      const val = catSelect.value || "";
      if (!val) {
        warnWrap.classList.add("hidden");
        warnWrap.innerHTML = "";
        return;
      }

      const isHalf = val.includes("Setengah Hari") || val.includes("1/2");
      const durasiNum = isHalf ? 0.5 : (countLeaveWorkingDays(tglMulai.value, tglSelesai.value, calendarEvents) || (parseFloat(txtDurasi.value) || 0));

      // 1. CEK KETENTUAN MASA KERJA (AUTO REJECT JIKA MELEBIHI BATAS MAKSIMAL)
      if (durasiNum > employeeTenure.maxLeaveDays) {
        warnWrap.classList.remove("hidden");
        warnWrap.innerHTML = `
          <div class="p-3.5 bg-rose-50 border-2 border-rose-500 rounded-xl space-y-2 text-left animate-pulse-once">
            <div class="flex items-start gap-2.5">
              <div class="p-2 bg-rose-100 rounded-xl text-rose-700 shrink-0 mt-0.5">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                </svg>
              </div>
              <div class="flex-1">
                <h4 class="text-xs font-black text-rose-900 uppercase tracking-wide flex items-center gap-1.5">
                  ⛔ MELEBIHI BATAS MAKSIMAL CUTI (AUTO REJECT SISTEM)
                </h4>
                <div class="text-[11.5px] text-rose-800 mt-1 leading-relaxed space-y-1.5">
                  <p>
                    Masa kerja Anda: <b class="font-mono text-rose-950 px-1.5 py-0.5 bg-white rounded border border-rose-200">${escapeHtml(employeeTenure.tenureText)} (${escapeHtml(employeeTenure.bracketLabel)})</b>.
                  </p>
                  <p>
                    Batas maksimal cuti berturut-turut per bulan: <b class="font-mono text-rose-950 px-1.5 py-0.5 bg-white rounded border border-rose-200">${employeeTenure.maxLeaveDays} Hari Kerja</b> (tidak termasuk hari Minggu & Libur Nasional/Perusahaan).
                  </p>
                  <p>
                    Durasi yang Anda ajukan saat ini: <b class="font-mono text-rose-950 px-1.5 py-0.5 bg-white rounded border border-rose-300 font-bold">${durasiNum} Hari Kerja</b>.
                  </p>
                  <div class="p-2 bg-rose-100 rounded-lg border border-rose-300 font-bold text-rose-950 text-xs">
                    ⚠️ Pengajuan ini melebihi batas ketentuan SOP cuti perusahaan (${durasiNum} &gt; ${employeeTenure.maxLeaveDays} Hari) dan akan <u>OTOMATIS DITOLAK (AUTO REJECT)</u> oleh sistem jika dikirimkan.
                  </div>

                  <!-- TABEL KETENTUAN MASA KERJA -->
                  <div class="mt-2 overflow-x-auto rounded-lg border border-rose-200 bg-white">
                    <div class="px-2 py-1 bg-rose-100/70 border-b border-rose-200 text-[10.5px] font-bold text-rose-900">
                      Tabel Batas Cuti Berdasarkan Masa Kerja (Lampiran SOP):
                    </div>
                    <table class="w-full text-[11px] text-left">
                      <thead class="bg-rose-50 text-rose-900 border-b border-rose-100 text-[10px]">
                        <tr>
                          <th class="p-1.5">Masa Kerja</th>
                          <th class="p-1.5 text-center">Tambahan Cuti</th>
                          <th class="p-1.5 text-center">Batas Maks. / Bln</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-rose-100 text-rose-800 text-[10.5px]">
                        <tr class="${employeeTenure.ambangTahun === 0 ? 'bg-rose-100/80 font-bold text-rose-950' : ''}">
                          <td class="p-1.5">0 s/d &lt; 6 Tahun ${employeeTenure.ambangTahun === 0 ? '← (Anda)' : ''}</td>
                          <td class="p-1.5 text-center">0 Hari</td>
                          <td class="p-1.5 text-center font-bold">Maks 2 Hari</td>
                        </tr>
                        <tr class="${employeeTenure.ambangTahun === 6 ? 'bg-rose-100/80 font-bold text-rose-950' : ''}">
                          <td class="p-1.5">6 s/d &lt; 8 Tahun ${employeeTenure.ambangTahun === 6 ? '← (Anda)' : ''}</td>
                          <td class="p-1.5 text-center">+1 Hari</td>
                          <td class="p-1.5 text-center font-bold">Maks 3 Hari</td>
                        </tr>
                        <tr class="${employeeTenure.ambangTahun === 8 ? 'bg-rose-100/80 font-bold text-rose-950' : ''}">
                          <td class="p-1.5">8 s/d &lt; 10 Tahun ${employeeTenure.ambangTahun === 8 ? '← (Anda)' : ''}</td>
                          <td class="p-1.5 text-center">+2 Hari</td>
                          <td class="p-1.5 text-center font-bold">Maks 3 Hari</td>
                        </tr>
                        <tr class="${employeeTenure.ambangTahun === 10 ? 'bg-rose-100/80 font-bold text-rose-950' : ''}">
                          <td class="p-1.5">10 s/d &lt; 11 Tahun ${employeeTenure.ambangTahun === 10 ? '← (Anda)' : ''}</td>
                          <td class="p-1.5 text-center">+3 Hari</td>
                          <td class="p-1.5 text-center font-bold">Maks 3 Hari</td>
                        </tr>
                        <tr class="${employeeTenure.ambangTahun === 11 ? 'bg-rose-100/80 font-bold text-rose-950' : ''}">
                          <td class="p-1.5">&ge; 11 Tahun ${employeeTenure.ambangTahun === 11 ? '← (Anda)' : ''}</td>
                          <td class="p-1.5 text-center">+4 Hari</td>
                          <td class="p-1.5 text-center font-bold">Maks 5 Hari</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      const catObj = leaveCategories.find(c => c.id === val || c.name === val) || {};
      const catPotong = catObj.potong_jatah || (
        val.includes("Khusus") || val.startsWith("C+ -") ? "Khusus" :
        val.includes("Akumulasi") || val.includes("Cuti Sisa") || val.startsWith("CS -") ? "Akumulasi" :
        val.includes("Potong Gaji") || val.startsWith("C- -") ? "Potong Gaji" :
        val.includes("Surat Dokter") || val.startsWith("S -") || val.includes("Dinas") || val.startsWith("D -") || val.includes("Cuti Besar") || val.startsWith("C-BESAR") ? "Tidak Dipotong" : "Tahunan"
      );

      // If category is "Tidak Dipotong", hide warning
      if (catPotong === "Tidak Dipotong") {
        warnWrap.classList.add("hidden");
        warnWrap.innerHTML = "";
        return;
      }

      // If explicitly chosen Potong Gaji
      if (catPotong === "Potong Gaji" || val.includes("Potong Gaji")) {
        warnWrap.classList.remove("hidden");
        warnWrap.innerHTML = `
          <div class="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-xl space-y-2 text-left">
            <div class="flex items-start gap-2.5">
              <div class="p-1.5 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <div>
                <p class="text-xs font-black text-rose-900 uppercase">PENGAJUAN CUTI POTONG GAJI (UNPAID LEAVE)</p>
                <p class="text-[11.5px] text-rose-800 mt-0.5 leading-relaxed">
                  Pengajuan ini adalah cuti tidak berbayar dan akan <b>MEMOTONG GAJI BULANAN ANDA</b> secara prorata sebesar durasi pengajuan (<b class="font-mono">${durasiNum} Hari</b>).
                </p>
              </div>
            </div>
            <label class="flex items-start gap-2 p-2 bg-white/90 border border-rose-200 rounded-lg cursor-pointer hover:bg-white transition">
              <input type="checkbox" id="fc-force-potong-gaji" checked class="mt-0.5 w-4 h-4 text-rose-600 rounded cursor-pointer accent-rose-600">
              <span class="text-[11px] font-bold text-rose-900">Saya memahami dan menyetujui pemotongan gaji (Unpaid Leave) untuk pengajuan ini.</span>
            </label>
          </div>
        `;
        return;
      }

      // Check balance for quota-deducting categories
      let available = 0;
      let quotaLabel = "Cuti Tahunan";
      if (catPotong === "Khusus") {
        available = userBalances.sisaKhusus || 0;
        quotaLabel = "Cuti Khusus";
      } else if (catPotong === "Akumulasi") {
        available = userBalances.sisaAkumulasi || 0;
        quotaLabel = "Cuti Sisa/Akumulasi";
      } else {
        available = userBalances.sisaTahunan || 0;
        quotaLabel = "Cuti Tahunan";
      }

      if (available <= 0 || (durasiNum > 0 && durasiNum > available)) {
        const isHabis = available <= 0;
        const excessDays = isHabis ? durasiNum : (durasiNum - available);
        warnWrap.classList.remove("hidden");
        warnWrap.innerHTML = `
          <div class="p-3.5 bg-rose-50 border-2 border-rose-400 rounded-xl space-y-2.5 text-left animate-pulse-once">
            <div class="flex items-start gap-2.5">
              <div class="p-2 bg-rose-100 rounded-xl text-rose-700 shrink-0 mt-0.5">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <div class="flex-1">
                <h4 class="text-xs font-black text-rose-900 uppercase tracking-wide">
                  ⚠️ PERINGATAN: JATAH ${quotaLabel.toUpperCase()} ${isHabis ? 'TELAH HABIS (0 HARI)' : 'TIDAK MENCUKUPI'}!
                </h4>
                <div class="text-[11.5px] text-rose-800 mt-1 leading-relaxed space-y-1">
                  <p>
                    Sisa jatah ${quotaLabel} Anda: <b class="font-mono text-rose-950 px-1.5 py-0.5 bg-white rounded border border-rose-200">${available} Hari</b> • Durasi yang diajukan: <b class="font-mono text-rose-950 px-1.5 py-0.5 bg-white rounded border border-rose-200">${durasiNum} Hari</b>.
                  </p>
                  <p class="font-bold text-rose-950 bg-rose-100/90 p-2 rounded-lg border border-rose-200">
                    ${isHabis 
                      ? `Karena jatah cuti Anda habis, jika tetap memaksa mengajukan, maka SELURUH pengajuan (${durasiNum} Hari) otomatis dialihkan sebagai CUTI POTONG GAJI (Unpaid Leave).`
                      : `Terdapat kelebihan ${excessDays} Hari yang tidak tercover saldo cuti Anda. Kelebihan ini otomatis diproses sebagai CUTI POTONG GAJI (Unpaid Leave).`}
                  </p>
                </div>
              </div>
            </div>

            <label class="flex items-start gap-2.5 p-2.5 bg-white border-2 border-rose-300 rounded-xl cursor-pointer hover:bg-rose-50/70 transition shadow-2xs">
              <input type="checkbox" id="fc-force-potong-gaji" class="mt-0.5 w-4 h-4 text-rose-600 rounded cursor-pointer accent-rose-600">
              <div class="text-[11px] text-rose-950">
                <span class="font-bold block">Saya MENYETUJUI pemotongan gaji (Unpaid Leave) untuk ${isHabis ? durasiNum : excessDays} hari kerja ini.</span>
                <span class="text-[10px] text-slate-500 block">Saya memahami konsekuensi pemotongan gaji bulanan sesuai peraturan ketenagakerjaan dan SOP HRD CV Andela Jaya.</span>
              </div>
            </label>
          </div>
        `;
      } else {
        warnWrap.classList.add("hidden");
        warnWrap.innerHTML = "";
      }
    }

    tglMulai.onchange = () => {
      calcDays();
      checkQuotaAndAlert();
    };
    tglSelesai.onchange = () => {
      calcDays();
      checkQuotaAndAlert();
    };

    // Handle Dynamic Category Change & Rules
    catSelect.onchange = () => {
      const val = catSelect.value || "";
      dynWrap.classList.add("hidden");
      halfdayWrap.classList.add("hidden");
      subcatWrap.classList.add("hidden");
      uploadWrap.classList.add("hidden");
      fileInput.required = false;

      calcDays();

      const isHalfDay = val.includes("Setengah Hari") || val.includes("1/2");
      if (isHalfDay) {
        dynWrap.classList.remove("hidden");
        halfdayWrap.classList.remove("hidden");
        if (tglMulai.value) tglSelesai.value = tglMulai.value;
        syncHalfdayTimes();
      }

      if (val.includes("Sakit dgn Surat Dokter") || val.includes("SAKIT_DOKTER") || val.startsWith("S -")) {
        dynWrap.classList.remove("hidden");
        uploadWrap.classList.remove("hidden");
        uploadLabel.textContent = "Upload Surat Keterangan Dokter / Klinik *";
        uploadHint.textContent = "Wajib melampirkan foto/PDF surat keterangan sakit resmi dari dokter/rumah sakit.";
        fileInput.required = true;
      } 
      else if (val.includes("Cuti Besar") || val.includes("CUTI_BESAR")) {
        dynWrap.classList.remove("hidden");
        subcatWrap.classList.remove("hidden");
        subcatLabel.textContent = "Kategori Cuti Besar *";
        subcatSelect.innerHTML = `
          <option value="Cuti Besar Umroh / Haji">Cuti Besar Umroh / Haji</option>
          <option value="Masa Kerja 10+ Tahun">Masa Kerja Panjang (10+ Tahun)</option>
          <option value="Lainnya">Lainnya</option>
        `;
        handleSubcatChange();
        subcatSelect.onchange = handleSubcatChange;
      }
      else if (val.includes("Cuti Khusus") || val.includes("CUTI_KHUSUS") || val.startsWith("C+ -")) {
        dynWrap.classList.remove("hidden");
        subcatWrap.classList.remove("hidden");
        uploadWrap.classList.remove("hidden");
        subcatLabel.textContent = "Kategori Cuti Khusus / Alasan Penting *";
        subcatSelect.innerHTML = `
          <option value="Pernikahan Karyawan [3 Hari]">Pernikahan Karyawan (3 Hari)</option>
          <option value="Pernikahan Anak [2 Hari]">Pernikahan Anak Karyawan (2 Hari)</option>
          <option value="Istri Melahirkan / Keguguran [2 Hari]">Istri Melahirkan / Keguguran (2 Hari)</option>
          <option value="Khitanan / Pembaptisan Anak [2 Hari]">Khitanan / Pembaptisan Anak (2 Hari)</option>
          <option value="Duka Anggota Keluarga Inti [2 Hari]">Duka Anggota Keluarga Inti (2 Hari)</option>
          <option value="Duka Anggota Keluarga Serumah [1 Hari]">Duka Anggota Keluarga Serumah (1 Hari)</option>
        `;
        uploadLabel.textContent = "Upload Bukti Pendukung (Undangan / Surat Ket. Dokter / Surat Duka) *";
        uploadHint.textContent = "Melampirkan bukti fisik pendukung untuk verifikasi jatah cuti khusus.";
        fileInput.required = true;
      }

      checkQuotaAndAlert();
    };

    function handleSubcatChange() {
      if (subcatSelect.value.includes("Umroh") || subcatSelect.value.includes("Haji")) {
        uploadWrap.classList.remove("hidden");
        uploadLabel.textContent = "Upload Bukti Pendaftaran Haji / Umroh *";
        uploadHint.textContent = "Wajib melampirkan tanda bukti pendaftaran resmi dari travel umroh/Kemenag.";
        fileInput.required = true;
      } else {
        uploadWrap.classList.add("hidden");
        fileInput.required = false;
      }
    }

    // Submit Handler
    document.getElementById("form-cuti-complex").onsubmit = async (e) => {
      e.preventDefault();

      const catVal = catSelect.value;
      const catObj = leaveCategories.find(c => c.id === catVal || c.name === catVal) || {};
      const catName = catObj.name || catObj.id || catVal;
      const isHalfDay = catName.includes("Setengah Hari") || catName.includes("1/2");

      let count = 0;
      if (isHalfDay) {
        count = 0.5;
        tglSelesai.value = tglMulai.value;
      } else {
        count = countLeaveWorkingDays(tglMulai.value, tglSelesai.value, calendarEvents);
        if (count === 0) count = 1;
      }

      // KETENTUAN MASA KERJA - AUTO REJECT IF EXCEEDED
      const isAutoReject = count > employeeTenure.maxLeaveDays;
      if (isAutoReject) {
        const confirmAutoReject = await confirmDialog(
          `⛔ PERINGATAN AUTO REJECT SISTEM\n\n` +
          `Sesuai ketentuan SOP Perusahaan:\n` +
          `• Masa Kerja Anda: ${employeeTenure.tenureText} (${employeeTenure.bracketLabel})\n` +
          `• Batas Maksimal Pengambilan Cuti: ${employeeTenure.maxLeaveDays} Hari Kerja (tidak termasuk Minggu & Libur Nasional)\n` +
          `• Jumlah Hari yang Diajukan: ${count} Hari Kerja\n\n` +
          `Pengajuan ini MELEBIHI KETENTUAN dan akan DITOLAK OTOMATIS (AUTO REJECT) oleh sistem dengan status REJECTED.\n\n` +
          `Apakah Anda ingin tetap memproses pengajuan ini (langsung tercatat ditolak di riwayat)?`,
          { title: "Konfirmasi Auto Reject", danger: true }
        );
        if (!confirmAutoReject) {
          toast("Pengajuan cuti dibatalkan.", "info");
          return;
        }
      }

      const catPotong = catObj.potong_jatah || (
        catVal.includes("Khusus") || catVal.startsWith("C+ -") ? "Khusus" :
        catVal.includes("Akumulasi") || catVal.includes("Cuti Sisa") || catVal.startsWith("CS -") ? "Akumulasi" :
        catVal.includes("Potong Gaji") || catVal.startsWith("C- -") ? "Potong Gaji" :
        catVal.includes("Surat Dokter") || catVal.startsWith("S -") || catVal.includes("Dinas") || catVal.startsWith("D -") || catVal.includes("Cuti Besar") || catVal.startsWith("C-BESAR") ? "Tidak Dipotong" : "Tahunan"
      );

      let availableQuota = 0;
      if (catPotong === "Khusus") availableQuota = userBalances.sisaKhusus || 0;
      else if (catPotong === "Akumulasi") availableQuota = userBalances.sisaAkumulasi || 0;
      else if (catPotong === "Tahunan") availableQuota = userBalances.sisaTahunan || 0;

      const isDirectPotongGaji = catPotong === "Potong Gaji" || catVal.includes("Potong Gaji");
      const isQuotaExceeded = (catPotong !== "Tidak Dipotong" && !isDirectPotongGaji) && (availableQuota <= 0 || count > availableQuota);
      const isPotongGajiApplied = isQuotaExceeded || isDirectPotongGaji;
      const excessDays = isDirectPotongGaji ? count : (availableQuota <= 0 ? count : (count - availableQuota));

      // VALIDATION ALERT & CONFIRMATION DIALOG IF QUOTA EXHAUSTED OR INSUFFICIENT
      if (!isAutoReject && isPotongGajiApplied) {
        const chkAgree = document.getElementById("fc-force-potong-gaji");
        if (!chkAgree || !chkAgree.checked) {
          const okConfirm = await confirmDialog(
            `⚠️ PERINGATAN PEMOTONGAN GAJI (UNPAID LEAVE)\n\n` +
            `Jatah cuti Anda ${availableQuota <= 0 ? 'telah HABIS (0 Hari)' : 'tidak mencukupi (Sisa jatah: ' + availableQuota + ' Hari)'}.\n` +
            `Total durasi yang diajukan: ${count} Hari Kerja\n` +
            `Jumlah hari yang akan MEMOTONG GAJI: ${excessDays} Hari Kerja\n\n` +
            `Apakah Anda tetap ingin memaksakan pengajuan cuti ini dengan konsekuensi PEMOTONGAN GAJI BULANAN?`,
            { title: "Konfirmasi Pemotongan Gaji", danger: true }
          );
          if (!okConfirm) {
            toast("Pengajuan cuti dibatalkan karena tidak menyetujui pemotongan gaji.", "info");
            return;
          }
        }
      }

      const btnSubmit = document.getElementById("btn-submit-cuti");
      btnSubmit.disabled = true;
      btnSubmit.textContent = isAutoReject ? "Sedang Memproses Penolakan Otomatis..." : "Sedang Mengupload & Menyimpan...";

      try {
        const subCat = !subcatWrap.classList.contains("hidden") ? subcatSelect.value : "";

        let uploadedUrls = [];
        if (fileInput.files && fileInput.files.length > 0) {
          for (let i = 0; i < fileInput.files.length; i++) {
            const url = await uploadFileToDrive(fileInput.files[i], `Cuti/${session.username}`);
            if (url) uploadedUrls.push(url);
          }
        }
        const uploadedUrl = uploadedUrls.join(", ");

        const selectedSesi = isHalfDay ? (document.querySelector('input[name="fc_halfday_session"]:checked')?.value || "Cuti Pagi") : "";
        const waktuKeluar = isHalfDay ? (jamKeluar.value || "08:00") : "";
        const waktuMasuk = isHalfDay ? (jamMasuk.value || "12:00") : "";

        const refNo = genId("CUTI");
        const nowIso = new Date().toISOString();
        const approvalFlow = ["ATASAN", "HRD"];

        const autoRejectNote = isAutoReject
          ? `[AUTO REJECT SISTEM]: Jumlah hari cuti yang diajukan (${count} hari kerja, tidak termasuk Minggu & Libur Nasional) melebihi batas maksimal ketentuan masa kerja (${employeeTenure.maxLeaveDays} hari untuk kategori ${employeeTenure.bracketLabel} [${employeeTenure.tenureText}]). Sesuai ketentuan SOP perusahaan, pengajuan ini otomatis ditolak.`
          : null;

        const potongGajiNote = isPotongGajiApplied
          ? `Jatah cuti ${availableQuota <= 0 ? 'habis (0 hari)' : 'tidak mencukupi (sisa ' + availableQuota + ' hari)'}. Diajukan potong gaji sebanyak ${excessDays} hari kerja.`
          : null;

        const payload = {
          id: refNo,
          no_referensi: refNo,
          tgl: nowIso,
          nik: session.nik || "-",
          nik_pemohon: session.nik || "-",
          nama_pemohon: session.nama,
          pemohon: session.nama,
          cabang: session.cabang || "-",
          form_id: "F-ISO-CUTI",
          id_form: "F-ISO-CUTI",
          tipe_form: "FORM_CUTI",
          nama_form: "Pengajuan Cuti Karyawan",
          kategori_cuti: catName,
          jenis_cuti: catVal,
          sub_kategori: subCat,
          sesi_cuti: selectedSesi,
          jam_keluar: waktuKeluar,
          jam_masuk: waktuMasuk,
          jam_kembali: waktuMasuk,
          waktu_keluar: waktuKeluar,
          waktu_masuk: waktuMasuk,
          tanggal_mulai: tglMulai.value,
          tanggal_selesai: isHalfDay ? tglMulai.value : tglSelesai.value,
          jumlah_hari: count,
          pejabat_pengganti: document.getElementById("fc-pengganti").value,
          no_telepon: document.getElementById("fc-phone").value.trim(),
          alasan: document.getElementById("fc-alasan").value.trim(),
          lampiran_url: uploadedUrl || null,
          sisa_tahunan: userBalances.sisaTahunan || 0,
          sisa_khusus: userBalances.sisaKhusus || 0,
          sisa_akumulasi: userBalances.sisaAkumulasi || 0,

          // Masa Kerja & Validasi Ketentuan
          masa_kerja: employeeTenure.tenureText,
          masa_kerja_tahun: employeeTenure.tenureYears,
          kategori_masa_kerja: employeeTenure.bracketLabel,
          max_cuti_diperbolehkan: employeeTenure.maxLeaveDays,
          is_auto_reject: isAutoReject,
          auto_reject_reason: autoRejectNote,

          // Status & Detail Potong Gaji
          is_potong_gaji: isPotongGajiApplied,
          potong_gaji: isPotongGajiApplied,
          potong_gaji_hari: isPotongGajiApplied ? excessDays : 0,
          tipe_potong: isPotongGajiApplied ? "Potong Gaji" : catPotong,
          catatan_potong_gaji: potongGajiNote,

          detail: {
            jenis_cuti: catVal,
            sub_kategori: subCat,
            sesi_cuti: selectedSesi,
            jam_keluar: waktuKeluar,
            jam_masuk: waktuMasuk,
            jam_kembali: waktuMasuk,
            waktu_keluar: waktuKeluar,
            waktu_masuk: waktuMasuk,
            tanggal_mulai: tglMulai.value,
            tanggal_akhir: isHalfDay ? tglMulai.value : tglSelesai.value,
            jumlah_hari: count,
            alasan: document.getElementById("fc-alasan").value.trim(),
            pejabat_pengganti: document.getElementById("fc-pengganti").value,
            no_telepon: document.getElementById("fc-phone").value.trim(),
            cabang: session.cabang || "-",
            sisa_tahunan: userBalances.sisaTahunan || 0,
            sisa_khusus: userBalances.sisaKhusus || 0,
            sisa_akumulasi: userBalances.sisaAkumulasi || 0,
            masa_kerja: employeeTenure.tenureText,
            kategori_masa_kerja: employeeTenure.bracketLabel,
            max_cuti_diperbolehkan: employeeTenure.maxLeaveDays,
            is_auto_reject: isAutoReject,
            auto_reject_reason: autoRejectNote,
            is_potong_gaji: isPotongGajiApplied,
            potong_gaji: isPotongGajiApplied,
            potong_gaji_hari: isPotongGajiApplied ? excessDays : 0,
            catatan_potong_gaji: potongGajiNote
          },
          approval_flow: approvalFlow,
          approval_steps: isAutoReject ? ["REJECTED", "REJECTED"] : ["PENDING", "PENDING"],
          status_final: isAutoReject ? "REJECTED" : "MENUNGGU",
          status: isAutoReject ? "REJECTED" : "MENUNGGU",
          catatan_penolakan: isAutoReject ? [autoRejectNote] : [],
          createdAt: nowIso
        };

        await setDoc(doc(db, COL.DATA_PENGAJUAN, refNo), payload);

        if (isAutoReject) {
          try {
            await notifyUser(
              session.username || session.nama,
              "⛔ [AUTO REJECT] Pengajuan Cuti Ditolak Sistem",
              `Pengajuan cuti Anda (${count} hari) otomatis ditolak sistem karena melebihi batas maksimal masa kerja (${employeeTenure.maxLeaveDays} hari untuk ${employeeTenure.tenureText}).`,
              `/#riwayat?id=${refNo}`
            );
          } catch (eNotif) {
            console.warn("Auto reject notification error:", eNotif);
          }

          toast(`⛔ Pengajuan Cuti Ditolak Otomatis (Auto Reject): Durasi ${count} hari kerja melebihi batas maksimal masa kerja Anda (${employeeTenure.maxLeaveDays} hari).`, "error");
        } else {
          // Notify first approver (ATASAN / HRD) without duplicates
          try {
            let targets = await getTargetsForRole("ATASAN", session.nama);
            if (!targets || targets.length === 0) {
              targets = await getTargetsForRole("HRD", session.nama);
            }
            const sentKeys = new Set();
            const notifTitle = isPotongGajiApplied ? "Persetujuan Cuti (Potong Gaji) Dibutuhkan" : "Persetujuan Cuti Dibutuhkan";
            const notifBody = isPotongGajiApplied
              ? `Pengajuan Cuti baru dari ${session.nama} (${catName}) sebanyak ${count} hari [POTONG GAJI: ${excessDays} Hari]. Membutuhkan verifikasi Anda.`
              : `Pengajuan Cuti baru dari ${session.nama} (${catName}${selectedSesi ? ' - ' + selectedSesi : ''}) sebanyak ${count} hari (${tglMulai.value}). Membutuhkan verifikasi Anda.`;

            for (const target of targets) {
              const key = typeof target === 'object' ? (target.email || target.username || target.nama) : target;
              if (!key || sentKeys.has(key)) continue;
              sentKeys.add(key);
              await notifyUser(
                target,
                notifTitle,
                notifBody,
                `/#approval?id=${refNo}`
              );
            }
          } catch (eNotif) {
            console.warn("Notification error:", eNotif);
          }

          // Sepanjang hari: Kirim alert instan ke email cabang jika merupakan Cuti Mendadak / H-0 / Darurat
          try {
            const todayWibStr = localDateStr(new Date());
            const isSudden = (tglMulai.value <= todayWibStr) || isHalfDay || catVal.includes("S -") || catVal.includes("S-") || catVal.includes("C-") || catVal.toLowerCase().includes("mendadak") || (payload.alasan || "").toLowerCase().includes("mendadak") || (payload.alasan || "").toLowerCase().includes("darurat");
            if (isSudden) {
              sendBranchInstantAlert({
                type: "CUTI_MENDADAK",
                record: payload,
                session
              }).catch(eAlert => console.warn("Sudden leave branch alert error:", eAlert));
            }
          } catch (eSudden) {
            console.warn("Check sudden leave branch alert error:", eSudden);
          }

          toast(isPotongGajiApplied 
            ? "Pengajuan cuti potong gaji berhasil dikirim & masuk antrean persetujuan!" 
            : "Pengajuan cuti berhasil dikirim & masuk ke antrean persetujuan!", 
            "success"
          );
        }

        closeModal();
        await loadData();
      } catch (err) {
        console.error("Error submitting leave request:", err);
        toast(`Gagal mengirim pengajuan cuti: ${err.message}`, "error");
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Kirim Pengajuan Cuti";
      }
    };
  }

  btnOpen.onclick = openFormCutiModal;
  await loadData();

  return { unmount() {} };
}
