import { db, COL, doc, getDoc, setDoc, query, collection, where, getDocs } from "../firebase-config.js";
import { fsGetAll, openModal, closeModal, toast, fmtDateShort, fmtRupiah, escapeHtml, genId, notifyUser, getTargetsForRole } from "../utils.js";
import { uploadFileToDrive } from "../gas-integration.js";
import { badge } from "../components.js";

const DEFAULT_KASBON_CATEGORIES = [
  {
    id: "SPP_SEKOLAH",
    name: "Pembayaran SPP / Biaya Sekolah Anak",
    need_file: true,
    file_label: "Surat Tagihan Resmi Sekolah & Bukti Kwitansi Pembayaran",
    multiple_files: true,
    min_files: 2,
    description: "Wajib melampirkan minimal 2 dokumen: Surat tagihan resmi sekolah/kampus dan bukti rincian kwitansi pembayaran biaya pendidikan anak."
  },
  {
    id: "PERALATAN_SEKOLAH",
    name: "Pembelian Keperluan & Peralatan Sekolah / Kerja",
    need_file: true,
    file_label: "Nota / Kwitansi Pembelian Alat & Rincian Estimasi",
    multiple_files: true,
    min_files: 2,
    description: "Sistem Reimbursement: Pengajuan kasbon memerlukan minimal 2 lampiran (Nota pembelian asli + Bukti fisik alat / rincian pendukung)."
  },
  {
    id: "KESEHATAN_DARURAT",
    name: "Pengobatan & Darurat Kesehatan",
    need_file: true,
    file_label: "Kwitansi Berobat / Rincian Medis RS",
    need_file: true,
    multiple_files: false,
    min_files: 1,
    description: "Wajib melampirkan kwitansi pembayaran atau rincian kuitansi biaya pengobatan dari rumah sakit / klinik."
  },
  {
    id: "RENOVASI_MUSIBAH",
    name: "Renovasi Rumah / Bencana Alam / Musibah",
    need_file: true,
    file_label: "Foto Kerusakan & Estimasi Biaya",
    multiple_files: true,
    min_files: 2,
    description: "Melampirkan minimal 2 bukti dokumen: Foto kondisi fisik kerusakan + Rincian RAB estimasi perbaikan."
  },
  {
    id: "LAINNYA_MENDESAK",
    name: "Kebutuhan Mendesak Lainnya",
    need_file: false,
    multiple_files: false,
    min_files: 0,
    file_label: "Lampiran Pendukung (Opsional)",
    description: "Jelaskan alasan kebutuhan mendesak secara rinci pada kolom alasan."
  }
];

export async function mount(container, { session }) {
  const isHrd = ["HRD", "SUPERADMIN", "FINANCE"].includes((session.role || "").toUpperCase());
  
  const btnSettings = container.querySelector("#btn-kasbon-settings");
  const btnOpen = container.querySelector("#btn-open-kasbon-modal");
  const tblBody = container.querySelector("#tbl-my-kasbon");
  const elTenure = container.querySelector("#st-tenure-badge");
  const elLoan = container.querySelector("#st-loan-badge");

  if (isHrd && btnSettings) btnSettings.classList.remove("hidden");

  let categories = DEFAULT_KASBON_CATEGORIES;
  let myKasbonRecords = [];
  let isEligible = true;

  async function loadData() {
    try {
      // 1. Fetch Categories from APP_SETTINGS
      try {
        const setSnap = await getDoc(doc(db, COL.APP_SETTINGS, "kasbon_categories"));
        if (setSnap.exists() && Array.isArray(setSnap.data().items) && setSnap.data().items.length) {
          categories = setSnap.data().items;
        }
      } catch (e) {
        console.warn("Using default kasbon categories");
      }

      // Automatically check for identical category names to set multiple_files flag
      const nameCounts = {};
      categories.forEach(c => {
        const cleanName = (c.name || "").trim().toLowerCase();
        nameCounts[cleanName] = (nameCounts[cleanName] || 0) + 1;
      });

      categories = categories.map(c => {
        const cleanName = (c.name || "").trim().toLowerCase();
        const isIdenticalName = nameCounts[cleanName] > 1;
        if (isIdenticalName) {
          return { ...c, multiple_files: true, min_files: 2, need_file: true };
        }
        return c;
      });

      // 2. Fetch Employee's Tenure & Active Loans
      let tenureMonths = 12;
      let hasActiveLoan = false;

      if (session.nik) {
        const kSnap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)));
        if (kSnap.exists()) {
          const k = kSnap.data();
          if (k.tanggal_masuk) {
            const joinDate = new Date(k.tanggal_masuk);
            const now = new Date();
            tenureMonths = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
          }
        }
      }

      if (tenureMonths < 12) {
        isEligible = false;
        elTenure.innerHTML = `<span class="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold">⚠️ Masa Kerja < 1 Tahun (${tenureMonths} Bln)</span>`;
      } else {
        elTenure.innerHTML = `<span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">✅ Lolos (Masa Kerja ${Math.floor(tenureMonths/12)} Thn ${tenureMonths%12} Bln)</span>`;
      }

      // Check Active Loan in LOG_KASBON
      const q = query(
        collection(db, COL.LOG_KASBON),
        where("pemohon", "==", session.nama)
      );
      const snap = await getDocs(q);
      myKasbonRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      hasActiveLoan = myKasbonRecords.some(r => {
        const st = (r.status || "").toUpperCase();
        return st.includes("PENDING") || st.includes("SETUJU") || st.includes("BELUM LUNAS");
      });

      if (hasActiveLoan) {
        elLoan.innerHTML = `<span class="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg text-xs font-bold">❌ Ada Pinjaman Aktif</span>`;
      } else {
        elLoan.innerHTML = `<span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">✅ Bebas Pinjaman Aktif</span>`;
      }

      myKasbonRecords.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      renderTable();
    } catch (err) {
      console.error("Error loading kasbon data:", err);
      tblBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-500">Gagal memuat data kasbon: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderTable() {
    if (!myKasbonRecords.length) {
      tblBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada riwayat pengajuan kasbon. Klik tombol di atas untuk mengajukan.</td></tr>`;
      return;
    }

    tblBody.innerHTML = myKasbonRecords.map(r => {
      const st = (r.status || "PENDING").toUpperCase();
      let stBadge = badge("Pending HRD", "amber");
      if (st.includes("SETUJU") || st.includes("APPROVED") || st.includes("LUNAS")) stBadge = badge("Disetujui", "green");
      else if (st.includes("TOLAK") || st.includes("REJECTED")) stBadge = badge("Ditolak", "red");

      const urls = (r.lampiran_url || "").split(",").map(s => s.trim()).filter(Boolean);
      let docLink = `<span class="text-slate-400">-</span>`;
      if (urls.length > 0) {
        docLink = urls.map((u, i) => `
          <a href="${u}" target="_blank" class="inline-block px-2 py-0.5 text-[10px] font-bold bg-maroon-50 text-maroon-700 hover:bg-maroon-100 rounded border border-maroon-200 mr-1 mb-1">
            📄 Doc ${urls.length > 1 ? i + 1 : ''}
          </a>
        `).join("");
      }

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="p-3 font-mono font-bold text-slate-800">${escapeHtml(r.no_referensi || r.id)}</td>
          <td class="p-3 font-semibold text-slate-800">
            ${escapeHtml(r.kategori_kasbon || "Kasbon Routine")}
          </td>
          <td class="p-3 font-medium text-slate-700">${fmtDateShort(r.createdAt || r.tanggal)}</td>
          <td class="p-3">
            <span class="font-bold font-mono text-slate-900 block">${fmtRupiah(r.nominal)}</span>
            <span class="text-[11px] text-slate-500">Tenor: ${r.tenor_bulan || 1} Bulan</span>
          </td>
          <td class="p-3">${docLink}</td>
          <td class="p-3">${stBadge}</td>
          <td class="p-3 text-center">
            <button data-id="${r.id}" class="btn-view-detail-kasbon px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">
              Detail
            </button>
          </td>
        </tr>`;
    }).join("");

    tblBody.querySelectorAll(".btn-view-detail-kasbon").forEach(btn => {
      btn.onclick = () => {
        const item = myKasbonRecords.find(x => x.id === btn.dataset.id);
        if (item) openDetailModal(item);
      };
    });
  }

  function openDetailModal(item) {
    const urls = (item.lampiran_url || "").split(",").map(s => s.trim()).filter(Boolean);

    openModal({
      title: `Detail Kasbon — ${item.no_referensi || item.id}`,
      size: "md",
      bodyHtml: `
        <div class="space-y-3 text-left text-xs">
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5">
            <div class="flex justify-between"><span class="text-slate-500">Pemohon:</span><span class="font-bold text-slate-800">${escapeHtml(item.pemohon)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Kategori:</span><span class="font-semibold text-maroon-700">${escapeHtml(item.kategori_kasbon)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Nominal Kasbon:</span><span class="font-bold font-mono text-slate-900 text-sm">${fmtRupiah(item.nominal)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Tenor Angsuran:</span><span class="font-semibold text-slate-800">${item.tenor_bulan || 1} Bulan</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Cicilan Per Bulan:</span><span class="font-mono font-bold text-slate-800">${fmtRupiah((item.nominal || 0) / (item.tenor_bulan || 1))}</span></div>
          </div>
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <span class="text-slate-500 block font-semibold mb-1">Alasan Penggunaan:</span>
            <p class="text-slate-800 leading-relaxed">${escapeHtml(item.alasan || '-')}</p>
          </div>
          ${urls.length > 0 ? `
            <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200 space-y-2">
              <span class="font-semibold text-emerald-900 block">Bukti Persyaratan Kategori (${urls.length} Berkas):</span>
              <div class="flex flex-wrap gap-2">
                ${urls.map((u, i) => `
                  <a href="${u}" target="_blank" class="px-3 py-1 bg-emerald-700 text-white rounded-lg font-bold text-[11px] hover:bg-emerald-800 flex items-center gap-1">
                    📄 Buka File ${urls.length > 1 ? i + 1 : ''}
                  </a>
                `).join('')}
              </div>
            </div>` : ''}
        </div>`
    });
  }

  // -------------------------------------------------------------
  // FORM MODAL PENGAJUAN KASBON BERBASIS KATEGORI
  // -------------------------------------------------------------
  function openFormKasbonModal() {
    openModal({
      title: "Formulir Pengajuan Kasbon Karyawan",
      size: "lg",
      bodyHtml: `
        <form id="form-kasbon-cat" class="space-y-4 text-left">
          <!-- KATEGORI KASBON -->
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Pilih Kategori Kasbon HRD *</label>
            <select id="fk-kategori" required class="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-semibold text-slate-800 bg-slate-50">
              <option value="">-- Pilih Kategori Penggunaan Kasbon --</option>
              ${categories.map(c => `<option value="${c.id}">${c.name} ${c.multiple_files ? ' (Wajib >1 Lampiran)' : ''}</option>`).join("")}
            </select>
          </div>

          <!-- HRD GUIDANCE & CONDITIONAL FILE ATTACHMENT BOX -->
          <div id="fk-guide-wrap" class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 hidden">
            <div class="flex items-start gap-2">
              <span class="text-amber-600 text-base">ℹ️</span>
              <div>
                <h5 class="font-bold text-xs text-amber-900" id="fk-guide-title">Ketentuan Kategori</h5>
                <p class="text-[11px] text-amber-800 mt-0.5 leading-relaxed" id="fk-guide-desc">-</p>
              </div>
            </div>

            <div id="fk-upload-wrap" class="pt-2 border-t border-amber-200/80">
              <label class="block text-xs font-bold text-amber-900 mb-1" id="fk-upload-label">Upload Berkas Persyaratan *</label>
              <input type="file" id="fk-file" accept="image/*,.pdf" multiple class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-maroon-700 file:text-white hover:file:bg-maroon-800">
              <p class="text-[10px] text-amber-700 mt-1" id="fk-upload-hint">Tekan Ctrl/Shift saat memilih file untuk melampirkan lebih dari 1 dokumen.</p>
            </div>
          </div>

          <!-- NOMINAL & TENOR -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-800 mb-1">Nominal Kasbon Diajukan (Rp) *</label>
              <input type="number" id="fk-nominal" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-mono font-bold text-maroon-700" placeholder="Cth: 2000000">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-800 mb-1">Tenor Angsuran (Bulan) *</label>
              <select id="fk-tenor" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400 font-semibold text-slate-800">
                <option value="1">1 Bulan (Potong Gaji Bulan Depan)</option>
                <option value="2">2 Bulan</option>
                <option value="3">3 Bulan</option>
                <option value="6">6 Bulan</option>
              </select>
            </div>
          </div>

          <!-- REASON -->
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Alasan Pengajuan & Rincian Kebutuhan *</label>
            <textarea id="fk-alasan" rows="3" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-400" placeholder="Jelaskan secara rinci penggunaan dana kasbon..."></textarea>
          </div>

          <div class="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
            <button type="submit" id="btn-submit-kasbon" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow-xs flex items-center gap-2">
              Kirim Pengajuan Kasbon
            </button>
          </div>
        </form>`
    });

    const catSelect = document.getElementById("fk-kategori");
    const guideWrap = document.getElementById("fk-guide-wrap");
    const guideTitle = document.getElementById("fk-guide-title");
    const guideDesc = document.getElementById("fk-guide-desc");
    const uploadLabel = document.getElementById("fk-upload-label");
    const uploadHint = document.getElementById("fk-upload-hint");
    const fileInput = document.getElementById("fk-file");

    catSelect.onchange = () => {
      const val = catSelect.value;
      const catObj = categories.find(c => c.id === val);
      if (!catObj) {
        guideWrap.classList.add("hidden");
        fileInput.required = false;
        return;
      }

      guideWrap.classList.remove("hidden");
      guideTitle.textContent = catObj.name;
      guideDesc.textContent = catObj.description || "Harus melampirkan berkas bukti fisik sesuai kategori yang dipilih.";
      
      const isMulti = catObj.multiple_files || (catObj.min_files && catObj.min_files > 1);

      if (isMulti) {
        uploadLabel.textContent = `Upload Berkas Persyaratan (Wajib Minimal ${catObj.min_files || 2} File Lampiran) *`;
        uploadHint.textContent = "Kategori ini memerlukan lebih dari 1 lampiran dokumen bukti fisik. Gunakan Ctrl/Shift saat memilih file.";
        fileInput.required = true;
      } else {
        uploadLabel.textContent = `${catObj.file_label || 'Upload Berkas Persyaratan'} ${catObj.need_file ? '*' : '(Opsional)'}`;
        uploadHint.textContent = "Lampirkan berkas bukti pendukung dalam format Gambar/PDF.";
        fileInput.required = !!catObj.need_file;
      }
    };

    document.getElementById("form-kasbon-cat").onsubmit = async (e) => {
      e.preventDefault();
      const btnSubmit = document.getElementById("btn-submit-kasbon");

      const catVal = catSelect.value;
      const catObj = categories.find(c => c.id === catVal) || {};
      const isMulti = catObj.multiple_files || (catObj.min_files && catObj.min_files > 1);

      if (isMulti && fileInput.files.length < (catObj.min_files || 2)) {
        toast(`Kategori ini mengharuskan Anda melampirkan minimal ${catObj.min_files || 2} berkas/file lampiran!`, "warning");
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.textContent = "Mengupload & Menyimpan...";

      try {
        let uploadedUrls = [];
        if (fileInput.files && fileInput.files.length > 0) {
          for (let i = 0; i < fileInput.files.length; i++) {
            const url = await uploadFileToDrive(fileInput.files[i], `Kasbon/${session.username}`);
            if (url) uploadedUrls.push(url);
          }
        }
        const uploadedUrl = uploadedUrls.join(", ");

        const nominal = parseFloat(document.getElementById("fk-nominal").value) || 0;
        const tenor = parseInt(document.getElementById("fk-tenor").value) || 1;
        const refNo = genId("KSB");
        const nowIso = new Date().toISOString();

        const payload = {
          id: refNo,
          no_referensi: refNo,
          tipe_form: "KASBON",
          id_form: "KASBON",
          nama_form: "Pengajuan Kasbon Karyawan",
          pemohon: session.nama,
          nama_pemohon: session.nama,
          nik_pemohon: session.nik || "",
          cabang: session.cabang || "-",
          kategori_kasbon: catObj.name || catVal,
          nominal,
          tenor_bulan: tenor,
          cicilan_per_bulan: nominal / tenor,
          alasan: document.getElementById("fk-alasan").value.trim(),
          lampiran_url: uploadedUrl,
          approval_flow: ["HRD", "FINANCE"],
          approval_steps: ["PENDING", "PENDING"],
          status_final: "MENUNGGU",
          status: "PENDING",
          createdAt: nowIso
        };

        // Save to LOG_KASBON & DATA_PENGAJUAN
        await Promise.all([
          setDoc(doc(db, COL.LOG_KASBON, refNo), payload),
          setDoc(doc(db, COL.DATA_PENGAJUAN, refNo), payload)
        ]);

        toast("Pengajuan kasbon berhasil dikirim!", "success");
        closeModal();
        await loadData();
      } catch (err) {
        console.error("Error submitting kasbon:", err);
        toast(`Gagal mengirim kasbon: ${err.message}`, "error");
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Kirim Pengajuan Kasbon";
      }
    };
  }

  // -------------------------------------------------------------
  // HRD CATEGORY MANAGER MODAL
  // -------------------------------------------------------------
  function openCategoryManagerModal() {
    openModal({
      title: "Kelola Kategori & Persyaratan Kasbon HRD",
      size: "lg",
      bodyHtml: `
        <div class="space-y-4 text-left">
          <p class="text-xs text-slate-500">Atur kategori kasbon, petunjuk aturan, dan jumlah berkas yang wajib dilampirkan oleh karyawan. Jika terdapat nama kategori identik, sistem mewajibkan lebih dari 1 lampiran.</p>
          
          <div class="space-y-3 max-h-[350px] overflow-y-auto pr-1" id="cat-list-wrap">
            ${categories.map((c, idx) => `
              <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">${escapeHtml(c.name)}</span>
                  <span class="px-2 py-0.5 rounded-md ${c.multiple_files ? 'bg-purple-100 text-purple-800' : c.need_file ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'} text-[10px] font-bold">
                    ${c.multiple_files ? 'Wajib >1 Lampiran (Multi File)' : c.need_file ? 'Wajib Upload File' : 'Upload Opsional'}
                  </span>
                </div>
                <p class="text-slate-600 text-[11px] leading-relaxed">${escapeHtml(c.description)}</p>
                <div class="text-[11px] font-semibold text-slate-500">Syarat File: ${escapeHtml(c.file_label || '-')}</div>
              </div>
            `).join("")}
          </div>

          <div class="pt-3 border-t border-slate-200 flex justify-between">
            <button id="btn-add-cat-item" class="px-3.5 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg">
              + Tambah Kategori Baru
            </button>
            <button onclick="closeModal()" class="px-4 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 rounded-lg">Tutup</button>
          </div>
        </div>`
    });

    document.getElementById("btn-add-cat-item").onclick = () => {
      openAddCategoryModal();
    };
  }

  function openAddCategoryModal() {
    openModal({
      title: "Tambah Kategori Kasbon HRD",
      size: "md",
      bodyHtml: `
        <form id="form-add-cat" class="space-y-3 text-left">
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Nama Kategori *</label>
            <input type="text" id="fac-name" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="Cth: Bayar Biaya Kursus / Pelatihan">
            <p class="text-[10px] text-slate-400 mt-0.5">Catatan: Jika nama kategori identik dengan yang sudah ada, sistem otomatis mengharuskan karyawan melampirkan lebih dari 1 file.</p>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Label Lampiran File *</label>
            <input type="text" id="fac-label" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="Cth: Kwitansi Pembayaran Kursus">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Apakah Wajib Upload File? *</label>
            <select id="fac-need" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
              <option value="true_multi">Wajib Lebih dari 1 File Lampiran (Multiple Documents)</option>
              <option value="true">Wajib Upload File (Minimal 1 File)</option>
              <option value="false">Opsional (Boleh Tanpa File)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-800 mb-1">Petunjuk / Ketentuan Aturan HRD *</label>
            <textarea id="fac-desc" rows="3" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="Jelaskan rincian aturan bagi karyawan..."></textarea>
          </div>
          <div class="pt-3 flex justify-end gap-2">
            <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500">Batal</button>
            <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl">Simpan Kategori</button>
          </div>
        </form>`
    });

    document.getElementById("form-add-cat").onsubmit = async (e) => {
      e.preventDefault();
      const catName = document.getElementById("fac-name").value.trim();
      const needVal = document.getElementById("fac-need").value;

      const isIdentical = categories.some(c => (c.name || "").trim().toLowerCase() === catName.toLowerCase());
      const isMulti = needVal === "true_multi" || isIdentical;

      const newCat = {
        id: "CAT_" + Date.now(),
        name: catName,
        file_label: document.getElementById("fac-label").value.trim(),
        need_file: needVal !== "false",
        multiple_files: isMulti,
        min_files: isMulti ? 2 : (needVal === "true" ? 1 : 0),
        description: document.getElementById("fac-desc").value.trim()
      };

      categories.push(newCat);

      // If identical category exists, mark all identical categories with multiple_files = true
      categories = categories.map(c => {
        if ((c.name || "").trim().toLowerCase() === catName.toLowerCase()) {
          return { ...c, multiple_files: true, min_files: 2, need_file: true };
        }
        return c;
      });

      await setDoc(doc(db, COL.APP_SETTINGS, "kasbon_categories"), { items: categories }, { merge: true });
      toast("Kategori kasbon baru berhasil disimpan", "success");
      closeModal();
      await loadData();
    };
  }

  if (btnSettings) btnSettings.onclick = openCategoryManagerModal;
  btnOpen.onclick = openFormKasbonModal;

  await loadData();
  return { unmount() {} };
}
