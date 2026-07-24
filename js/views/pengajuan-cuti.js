import { db, COL, doc, getDoc, setDoc, query, collection, where, getDocs } from "../firebase-config.js";
import { fsGetAll, openModal, closeModal, toast, fmtDateShort, escapeHtml, genId, toNumber, sendEmailNotif, getTargetsForRole, createLoginToken, notifyUser } from "../utils.js";
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

      // 2. Fetch Master Karyawan for Handover selection & current employee's quota
      allEmployees = await fsGetAll(COL.MASTER_KARYAWAN);
      
      let kData = null;
      if (session.nik && session.nik !== "null" && session.nik !== "undefined") {
        kData = allEmployees.find(k => String(k.nik || k.nik_karyawan) === String(session.nik));
      }
      if (!kData && session.nama) {
        kData = allEmployees.find(k => (k.nama_karyawan || "").toLowerCase() === (session.nama || "").toLowerCase());
      }

      let jatahTahunan = kData ? (toNumber(kData.jatah_tahunan ?? kData.jatah_cuti_tahunan) || 12) : 12;
      let jatahAkumulasi = kData ? (toNumber(kData.jatah_akumulasi ?? kData.jatah_cuti_akumulasi) || 0) : 0;
      let jatahKhusus = kData ? (toNumber(kData.jatah_khusus ?? kData.jatah_cuti_khusus) || 0) : 0;

      // 3. Fetch current employee's actual usage from MASTER_CUTI
      let terpakaiTahunan = 0;
      let terpakaiAkumulasi = 0;
      let terpakaiKhusus = 0;

      const currentYear = new Date().getFullYear();
      let masterCutiLogs = [];

      try {
        const qMC = query(collection(db, COL.MASTER_CUTI), where("nama_karyawan", "==", session.nama));
        const snapMC = await getDocs(qMC);
        masterCutiLogs = snapMC.docs.map(d => ({ id: d.id, ...d.data(), source: "MASTER_CUTI" }));

        masterCutiLogs.forEach(d => {
          const rowYear = parseInt(d.tahun) || (d.tanggal ? new Date(d.tanggal).getFullYear() : currentYear);
          if (rowYear !== currentYear) return;
          const p = d.potong_jatah || "Tahunan";
          const cnt = parseFloat(d.count) || 1;
          if (p === "Tahunan") terpakaiTahunan += cnt;
          else if (p === "Akumulasi") terpakaiAkumulasi += cnt;
          else if (p === "Khusus") terpakaiKhusus += cnt;
        });
      } catch (err) {
        console.warn("Error reading MASTER_CUTI usage:", err);
      }

      const sisaTahunan = Math.max(0, jatahTahunan - terpakaiTahunan);
      const sisaAkumulasi = Math.max(0, jatahAkumulasi - terpakaiAkumulasi);
      const sisaKhusus = Math.max(0, jatahKhusus - terpakaiKhusus);

      if (elTahunanJatah) elTahunanJatah.textContent = jatahTahunan;
      if (elTahunanTerpakai) elTahunanTerpakai.textContent = `${terpakaiTahunan} Hari`;
      if (elTahunanSisa) elTahunanSisa.textContent = sisaTahunan;

      if (elAkumulasiJatah) elAkumulasiJatah.textContent = jatahAkumulasi;
      if (elAkumulasiTerpakai) elAkumulasiTerpakai.textContent = `${terpakaiAkumulasi} Hari`;
      if (elAkumulasiSisa) elAkumulasiSisa.textContent = sisaAkumulasi;

      if (elKhususJatah) elKhususJatah.textContent = jatahKhusus;
      if (elKhususTerpakai) elKhususTerpakai.textContent = `${terpakaiKhusus} Hari`;
      if (elKhususSisa) elKhususSisa.textContent = sisaKhusus;

      // 4. Fetch Employee's Leave Submissions from DATA_PENGAJUAN
      let pengajuanLogs = [];
      try {
        const qP = query(
          collection(db, COL.DATA_PENGAJUAN),
          where("nama_pemohon", "==", session.nama)
        );
        const snapP = await getDocs(qP);
        pengajuanLogs = snapP.docs.map(d => ({ id: d.id, ...d.data(), source: "DATA_PENGAJUAN" }))
          .filter(r => r.form_id === "F-ISO-CUTI" || r.tipe_form === "FORM_CUTI" || (r.nama_form || "").toLowerCase().includes("cuti"));
      } catch (err) {
        console.warn("Error reading DATA_PENGAJUAN:", err);
      }

      // Merge DATA_PENGAJUAN and MASTER_CUTI seamlessly for history
      const mergedMap = new Map();

      pengajuanLogs.forEach(p => {
        mergedMap.set(p.no_referensi || p.id, p);
      });

      masterCutiLogs.forEach(m => {
        const refKey = m.no_referensi || m.id;
        if (mergedMap.has(refKey)) {
          const existing = mergedMap.get(refKey);
          existing.status_final = "APPROVED FINAL";
        } else {
          // Direct HRD entry
          mergedMap.set(refKey, {
            id: refKey,
            no_referensi: refKey,
            form_id: "F-ISO-CUTI",
            nama_form: "Master Cuti HRD",
            nama_pemohon: m.nama_karyawan,
            kategori_cuti: m.type_cuti || "Cuti",
            jenis_cuti: m.type_cuti || "Cuti",
            tanggal_mulai: m.tanggal,
            tanggal_selesai: m.tanggal_selesai || m.tanggal,
            jumlah_hari: m.count || 1,
            alasan: m.keterangan_cuti || m.keterangan || "Catatan HRD",
            status_final: "APPROVED FINAL",
            createdAt: m.tanggal || new Date().toISOString()
          });
        }
      });

      myLeaveRecords = Array.from(mergedMap.values());
      myLeaveRecords.sort((a, b) => new Date(b.tgl || b.createdAt || b.tanggal_mulai || 0) - new Date(a.tgl || a.createdAt || a.tanggal_mulai || 0));

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

      const docLink = r.lampiran_url 
        ? `<a href="${r.lampiran_url}" target="_blank" class="text-maroon-700 font-bold hover:underline">📄 Lihat Lampiran</a>`
        : `<span class="text-slate-400">-</span>`;

      const dt = r.detail || {};

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 font-mono font-bold text-slate-800">${escapeHtml(r.no_referensi || r.id)}</td>
          <td class="p-3 font-semibold text-slate-800">
            ${escapeHtml(r.kategori_cuti || r.jenis_cuti || dt.jenis_cuti || "Cuti")}
            ${(r.sub_kategori || dt.sub_kategori) ? `<span class="block text-[11px] font-normal text-slate-500">${escapeHtml(r.sub_kategori || dt.sub_kategori)}</span>` : ''}
          </td>
          <td class="p-3 font-medium text-slate-700">
            ${fmtDateShort(r.tanggal_mulai || dt.tanggal_mulai || r.tgl)} ${(r.tanggal_selesai || dt.tanggal_akhir) && (r.tanggal_selesai || dt.tanggal_akhir) !== (r.tanggal_mulai || dt.tanggal_mulai) ? `s/d ${fmtDateShort(r.tanggal_selesai || dt.tanggal_akhir)}` : ''}
          </td>
          <td class="p-3 font-bold font-mono text-slate-800">${r.jumlah_hari || dt.jumlah_hari || r.count || 1} Hari</td>
          <td class="p-3">${docLink}</td>
          <td class="p-3">${stBadge}</td>
          <td class="p-3 text-center">
            <button data-id="${r.id}" class="btn-view-detail-leave px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">
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
    openModal({
      title: `Detail Pengajuan Cuti — ${item.no_referensi || item.id}`,
      size: "md",
      bodyHtml: `
        <div class="space-y-3 text-left text-xs">
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
            <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200 flex items-center justify-between">
              <span class="font-semibold text-emerald-900">Dokumen Lampiran Terlampir:</span>
              <a href="${item.lampiran_url}" target="_blank" class="px-3 py-1 bg-emerald-700 text-white rounded-lg font-bold text-[11px] hover:bg-emerald-800">
                Buka File 📄
              </a>
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
          <!-- KATEGORI CUTI SELECTION -->
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Pilih Jenis / Kategori Cuti *</label>
            <select id="fc-kategori" required class="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-semibold text-slate-800 bg-slate-50">
              <option value="">-- Pilih Jenis Cuti --</option>
              ${leaveCategories.map(c => `<option value="${escapeHtml(c.id || c.name)}">${escapeHtml(c.name || c.id)}</option>`).join("")}
            </select>
          </div>

          <!-- DYNAMIC CONDITIONAL SECTION (Sub-Category & File Upload) -->
          <div id="fc-dynamic-wrap" class="space-y-3 p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl hidden">
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
            </div>
          </div>

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
            <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
            <button type="submit" id="btn-submit-cuti" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow-xs flex items-center gap-2">
              Kirim Pengajuan Cuti
            </button>
          </div>
        </form>`
    });

    const catSelect = document.getElementById("fc-kategori");
    const dynWrap = document.getElementById("fc-dynamic-wrap");
    const subcatWrap = document.getElementById("fc-subcat-wrap");
    const subcatLabel = document.getElementById("fc-subcat-label");
    const subcatSelect = document.getElementById("fc-subcat");
    const uploadWrap = document.getElementById("fc-upload-wrap");
    const uploadLabel = document.getElementById("fc-upload-label");
    const uploadHint = document.getElementById("fc-upload-hint");
    const fileInput = document.getElementById("fc-file");

    const tglMulai = document.getElementById("fc-tgl-mulai");
    const tglSelesai = document.getElementById("fc-tgl-selesai");
    const txtDurasi = document.getElementById("fc-durasi");

    // Dynamic Date Calculation
    function calcDays() {
      if (!tglMulai.value || !tglSelesai.value) return;
      const d1 = new Date(tglMulai.value);
      const d2 = new Date(tglSelesai.value);
      if (d2 < d1) {
        txtDurasi.value = "Tanggal Tidak Valid";
        return;
      }
      const val = catSelect.value || "";
      if (val.includes("Setengah Hari") || val.includes("1/2")) {
        txtDurasi.value = "0.5 Hari Kerja";
        return;
      }

      let count = 0;
      let cur = new Date(d1);
      while (cur <= d2) {
        if (cur.getDay() !== 0) count++; // Exclude Sundays
        cur.setDate(cur.getDate() + 1);
      }
      txtDurasi.value = `${count} Hari Kerja`;
    }

    tglMulai.onchange = calcDays;
    tglSelesai.onchange = calcDays;

    // Handle Dynamic Category Change & Rules
    catSelect.onchange = () => {
      const val = catSelect.value || "";
      dynWrap.classList.add("hidden");
      subcatWrap.classList.add("hidden");
      uploadWrap.classList.add("hidden");
      fileInput.required = false;

      calcDays();

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
      const btnSubmit = document.getElementById("btn-submit-cuti");
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Sedang Mengupload & Menyimpan...";

      try {
        const catVal = catSelect.value;
        const catObj = leaveCategories.find(c => c.id === catVal || c.name === catVal) || {};
        const catName = catObj.name || catObj.id || catVal;
        const subCat = !subcatWrap.classList.contains("hidden") ? subcatSelect.value : "";

        let uploadedUrls = [];
        if (fileInput.files && fileInput.files.length > 0) {
          for (let i = 0; i < fileInput.files.length; i++) {
            const url = await uploadFileToDrive(fileInput.files[i], `Cuti/${session.username}`);
            if (url) uploadedUrls.push(url);
          }
        }
        const uploadedUrl = uploadedUrls.join(", ");

        const d1 = new Date(tglMulai.value);
        const d2 = new Date(tglSelesai.value);
        let count = 0;
        if (catName.includes("Setengah Hari") || catName.includes("1/2")) {
          count = 0.5;
        } else {
          let cur = new Date(d1);
          while (cur <= d2) {
            if (cur.getDay() !== 0) count++;
            cur.setDate(cur.getDate() + 1);
          }
          if (count === 0) count = 1;
        }

        const refNo = genId("CUTI");
        const nowIso = new Date().toISOString();
        const approvalFlow = ["ATASAN", "HRD"];

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
          tanggal_mulai: tglMulai.value,
          tanggal_selesai: tglSelesai.value,
          jumlah_hari: count,
          pejabat_pengganti: document.getElementById("fc-pengganti").value,
          no_telepon: document.getElementById("fc-phone").value.trim(),
          alasan: document.getElementById("fc-alasan").value.trim(),
          lampiran_url: uploadedUrl || null,
          detail: {
            jenis_cuti: catVal,
            sub_kategori: subCat,
            tanggal_mulai: tglMulai.value,
            tanggal_akhir: tglSelesai.value,
            jumlah_hari: count,
            alasan: document.getElementById("fc-alasan").value.trim(),
            pejabat_pengganti: document.getElementById("fc-pengganti").value,
            no_telepon: document.getElementById("fc-phone").value.trim(),
            cabang: session.cabang || "-"
          },
          approval_flow: approvalFlow,
          approval_steps: ["PENDING", "PENDING"],
          status_final: "MENUNGGU",
          catatan_penolakan: [],
          createdAt: nowIso
        };

        await setDoc(doc(db, COL.DATA_PENGAJUAN, refNo), payload);

        // Notify first approver (ATASAN)
        try {
          const targets = await getTargetsForRole("ATASAN", session.nama);
          for (const target of targets) {
            await notifyUser(
              target.username,
              `⏳ Persetujuan Cuti Dibutuhkan`,
              `Pengajuan Cuti baru dari ${session.nama} (${catName}).`,
              `/#approval`
            );
            if (typeof sendEmailNotif === 'function' && target.email) {
              const token = await createLoginToken(target.username);
              const magicLink = `https://andela-hris.vercel.app/#approval?token=${token}`;
              const htmlEmail = `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                  <h2 style="color: #7a1f2b;">Pengajuan Cuti Baru: ${session.nama}</h2>
                  <p><strong>Jenis Cuti:</strong> ${catName}</p>
                  <p><strong>Tanggal:</strong> ${tglMulai.value} s/d ${tglSelesai.value} (${count} Hari)</p>
                  <p>Pengajuan ini membutuhkan persetujuan Anda sebagai <strong>Atasan Direct</strong>.</p>
                  <a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Akses Langsung & Setujui</a>
                </div>
              `;
              sendEmailNotif(target.email, `Persetujuan Dibutuhkan: Cuti ${session.nama}`, htmlEmail).catch(() => {});
            }
          }
        } catch (eNotif) {
          console.warn("Notification error:", eNotif);
        }

        toast("Pengajuan cuti berhasil dikirim & masuk ke antrean persetujuan!", "success");
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
