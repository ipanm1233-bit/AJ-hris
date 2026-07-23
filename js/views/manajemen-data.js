import { db, COL, collection, getDocs, doc, updateDoc, addDoc, setDoc, deleteDoc, query, where, limit } from "../firebase-config.js";
import { fsGetAll, escapeHtml, toast, genId, notifyUser, openModal, closeModal } from "../utils.js";
import { renderCrudModule, badge, emptyState, icon, skeletonRows } from "../components.js";
import { uploadFileToDrive } from "../gas-integration.js";

export async function mount(container) {
  const panels = {
    karyawan: container.querySelector("#md-panel-karyawan"),
    rekap: container.querySelector("#md-panel-rekap"),
    dokumen: container.querySelector("#md-panel-dokumen"),
    signdoc: container.querySelector("#md-panel-signdoc"),
  };
  const loaded = {};

  async function loadKaryawanTab() {
    const fields = [
      { name: "nik_karyawan", label: "NIK Karyawan", type: "text", required: true },
      { name: "nama_karyawan", label: "Nama Lengkap", type: "text", required: true },
      { name: "cabang", label: "Cabang", type: "text" },
      { name: "jabatan", label: "Jabatan", type: "text", required: true },
      { name: "divisi", label: "Divisi", type: "text" },
      { name: "jenis_kelamin", label: "Jenis Kelamin", type: "select", options: ["LAKI-LAKI", "PEREMPUAN"] },
      { name: "status_karyawan", label: "Status Karyawan", type: "select", options: ["PKWT", "PKWTT", "KONTRAK", "PROBATION"] },
      { name: "tanggal_join", label: "Tanggal Join", type: "date" },
      { name: "kontrak_habis", label: "Kontrak Habis", type: "date" },
      { name: "no_hp_aktif", label: "No HP Aktif", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "atasan", label: "Nama Atasan Langsung", type: "text" },
      { name: "jatah_tahunan", label: "Jatah Cuti Tahunan", type: "number", default: 12 },
      { name: "jatah_khusus", label: "Jatah Cuti Khusus", type: "number", default: 4 },
      { name: "jatah_akumulasi", label: "Jatah Cuti Akumulasi", type: "number", default: 0 },
      { name: "aktif_tdk_aktif", label: "Status Aktif", type: "select", options: ["AKTIF", "TIDAK AKTIF"], default: "AKTIF" },
      { name: "alamat", label: "Alamat", type: "textarea", full: true },
    ];
    fields.idFromField = "nik_karyawan";

    await renderCrudModule(panels.karyawan, {
      title: "Database Induk Karyawan",
      subtitle: "Sumber data utama seluruh karyawan CV Andela Jaya.",
      collectionName: COL.MASTER_KARYAWAN,
      orderByField: "nama_karyawan",
      searchFields: ["nama_karyawan", "nik_karyawan", "jabatan", "cabang", "divisi", "status_karyawan"],
      columns: [
        { key: "nik_karyawan", label: "NIK" },
        { key: "nama_karyawan", label: "Nama" },
        { key: "cabang", label: "Cabang" },
        { key: "divisi", label: "Divisi" },
        { key: "jabatan", label: "Jabatan" },
        { key: "jenis_kelamin", label: "Gender" },
        { key: "status_karyawan", label: "Status", type: "badge" },
        { key: "tanggal_join", label: "Join" },
        { key: "kontrak_habis", label: "Kontrak" },
        { key: "no_hp_aktif", label: "No HP" },
        { key: "email", label: "Email" },
        { key: "atasan", label: "Atasan" },
        { key: "aktif_tdk_aktif", label: "Aktif", type: "badge", badgeTone: (v) => v === "AKTIF" ? "green" : "red" },
        { key: "alamat", label: "Alamat" }
      ],
      formFields: fields
    });
  }

  async function loadRekapTab() {
    await renderCrudModule(panels.rekap, {
      title: "Rekap Pengajuan Seluruh Staf",
      subtitle: "Rekapitulasi seluruh transaksi pengajuan (read-only).",
      collectionName: COL.DATA_PENGAJUAN,
      canCreate: false, canEdit: false, canDelete: false,
      searchFields: ["nama_pemohon", "nama_form", "id"],
      columns: [
        { key: "id", label: "No. Transaksi" },
        { key: "tgl", label: "Tanggal", type: "date" },
        { key: "nama_pemohon", label: "Pemohon" },
        { key: "nama_form", label: "Jenis Form" },
        { key: "status_final", label: "Status", type: "badge", badgeTone: (v) => (v || "").includes("APPROVED") ? "green" : (v || "").includes("REJECT") ? "red" : "amber" },
      ]
    });
  }

  async function loadDokumenTab() {
    panels.dokumen.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    
    let karyawan = [];
    try {
      karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
    } catch (err) {
      console.error("Gagal memuat karyawan untuk dokumen:", err);
    }

    const docs = ["dokumen_ktp", "dokumen_kk", "dokumen_npwp", "dokumen_bpjs", "dokumen_kontrak"];
    const docLabels = { 
      dokumen_ktp: "KTP", 
      dokumen_kk: "Kartu Keluarga", 
      dokumen_npwp: "NPWP", 
      dokumen_bpjs: "BPJS / JKN",
      dokumen_kontrak: "Kontrak Kerja" 
    };

    panels.dokumen.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="p-5 border-b border-slate-50">
          <h3 class="font-semibold text-slate-800">Dokumen Operasional & Kepegawaian Karyawan</h3>
          <p class="text-sm text-slate-500 mt-1">Kelola & unggah dokumen legal, identitas (KTP, KK, NPWP, BPJS) serta Kontrak Kerja Karyawan langsung ke Google Drive.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Karyawan</th>
                ${docs.map(d => `<th class="px-4 py-3 text-center font-medium">${docLabels[d]}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${karyawan.length ? karyawan.map(k => {
                const nik = k.nik_karyawan || k.nik || "";
                return `
                <tr class="border-t border-slate-50 hover:bg-slate-50/50 transition">
                  <td class="px-4 py-3 font-medium text-slate-700">
                    <div class="font-bold">${escapeHtml(k.nama_karyawan)}</div>
                    <div class="text-[10px] text-slate-400">NIK: ${escapeHtml(nik)} | ${escapeHtml(k.jabatan || "-")}</div>
                  </td>
                  ${docs.map(d => {
                    const hasDoc = !!k[d];
                    return `
                    <td class="px-4 py-3 text-center">
                      <div class="flex flex-col items-center justify-center gap-1.5">
                        ${hasDoc ? `
                          <a href="${k[d]}" target="_blank" class="bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 border border-red-200 transition">
                            👁️ Lihat
                          </a>
                        ` : `
                          <span class="text-slate-400 text-xs">-</span>
                        `}
                        <button class="btn-upload-doc text-[10px] text-maroon-700 hover:underline font-semibold" data-nik="${escapeHtml(nik)}" data-doc-type="${d}">
                          ${hasDoc ? "Ganti File" : "📤 Unggah"}
                        </button>
                      </div>
                    </td>`;
                  }).join("")}
                </tr>`;
              }).join("") : `<tr><td colspan="${docs.length + 1}" class="p-8 text-center text-slate-400">Belum ada data karyawan</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    // Bind document upload actions
    panels.dokumen.querySelectorAll(".btn-upload-doc").forEach(btn => {
      btn.onclick = () => {
        const nik = btn.dataset.nik;
        const docType = btn.dataset.docType;

        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if(!file) return;

          toast(`Sedang mengunggah ${file.name} ke Google Drive...`, "info");
          btn.disabled = true;
          const origText = btn.innerHTML;
          btn.textContent = "⏳...";

          try {
            const driveUrl = await uploadFileToDrive(file, `Dokumen_Karyawan/${nik}`);

            const q = query(collection(db, COL.MASTER_KARYAWAN), where("nik_karyawan", "==", nik));
            const snap = await getDocs(q);
            if(!snap.empty) {
              await updateDoc(doc(db, COL.MASTER_KARYAWAN, snap.docs[0].id), {
                [docType]: driveUrl
              });
              toast("Dokumen berhasil disimpan ke Google Drive & dihubungkan!", "success");
              await loadDokumenTab();
            } else {
              toast("Karyawan tidak ditemukan", "error");
            }
          } catch (err) {
            toast("Gagal mengunggah: " + err.message, "error");
          }
          btn.disabled = false;
          btn.innerHTML = origText;
        };
        input.click();
      };
    });
  }

  async function loadSignDocTab() {
    panels.signdoc.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;

    let listDocs = [];
    try {
       listDocs = await fsGetAll(COL.SIGN_DOCUMENTS);
    } catch (e) {
       console.error("Gagal mengambil daftar SignDoc:", e);
    }

    panels.signdoc.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="p-5 border-b border-slate-50 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 class="font-semibold text-slate-800">Sign Doc (Tanda Tangan Digital)</h3>
            <p class="text-sm text-slate-500 mt-1">Kelola dokumen perusahaan yang membutuhkan tanda tangan digital dari karyawan secara real-time.</p>
          </div>
          <button id="btn-add-signdoc" class="bg-maroon-700 hover:bg-maroon-800 text-white font-medium px-4 py-2 rounded-xl text-sm shadow transition flex items-center gap-1.5">
            ➕ Buat Pengajuan TTD Baru
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Karyawan</th>
                <th class="px-4 py-3 text-left font-medium">Judul Dokumen</th>
                <th class="px-4 py-3 text-center font-medium">Tanggal Dibuat</th>
                <th class="px-4 py-3 text-center font-medium">Draft File</th>
                <th class="px-4 py-3 text-center font-medium">Status TTD</th>
                <th class="px-4 py-3 text-center font-medium">Tanda Tangan</th>
                <th class="px-4 py-3 text-center font-medium">Tanggal TTD</th>
                <th class="px-4 py-3 text-center font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${listDocs.length ? listDocs.map(d => `
                <tr class="border-t border-slate-50 hover:bg-slate-50/50 transition">
                  <td class="px-4 py-3 font-medium text-slate-700">
                    <div class="font-bold">${escapeHtml(d.nama_penerima || "-")}</div>
                    <div class="text-[10px] text-slate-400">NIK: ${escapeHtml(d.nik_penerima || "-")}</div>
                  </td>
                  <td class="px-4 py-3 text-slate-600 font-medium">${escapeHtml(d.judul || "-")}</td>
                  <td class="px-4 py-3 text-center text-slate-500 text-xs">${d.tanggal_buat ? d.tanggal_buat.substring(0, 10) : "-"}</td>
                  <td class="px-4 py-3 text-center">
                    ${d.file_url ? `<a href="${d.file_url}" target="_blank" class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border border-blue-200 transition">👁️ Lihat Draft</a>` : '<span class="text-slate-300">-</span>'}
                  </td>
                  <td class="px-4 py-3 text-center">
                    ${d.status === "SIGNED" ? badge("SUDAH TTD", "green") : badge("PENDING TTD", "amber")}
                  </td>
                  <td class="px-4 py-3 text-center flex justify-center">
                    ${d.tanda_tangan_url ? `
                      <img src="${d.tanda_tangan_url}" class="h-10 w-auto border border-slate-200 bg-white p-0.5 rounded shadow-sm hover:scale-110 transition cursor-zoom-in" onclick="window.open('${d.tanda_tangan_url}', '_blank')">
                    ` : '<span class="text-slate-300 text-xs">-</span>'}
                  </td>
                  <td class="px-4 py-3 text-center text-slate-500 text-xs">${d.tanggal_ttd ? d.tanggal_ttd.substring(0, 10) : "-"}</td>
                  <td class="px-4 py-3 text-center">
                    <button class="btn-delete-signdoc text-xs text-red-600 hover:text-red-800 font-semibold" data-id="${escapeHtml(d.id)}">Hapus</button>
                  </td>
                </tr>`).join("") : `<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada dokumen untuk tanda tangan digital</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    // Bind Add button
    panels.signdoc.querySelector("#btn-add-signdoc").onclick = async () => {
       const listKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
       const activeKaryawan = listKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF") === "AKTIF")
                                          .sort((a,b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || ""));

       openModal({
          title: "Buat Pengajuan Tanda Tangan Baru",
          bodyHtml: `
             <form id="form-add-signdoc" class="space-y-4 text-left">
                <div>
                   <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Pilih Karyawan Penerima</label>
                   <select id="sd-karyawan" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-maroon-500">
                      <option value="">-- Pilih Karyawan --</option>
                      ${activeKaryawan.map(k => `<option value="${escapeHtml(k.nik_karyawan)}" data-nama="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} (${escapeHtml(k.nik_karyawan)})</option>`).join("")}
                   </select>
                </div>
                <div>
                   <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Judul Dokumen</label>
                   <input type="text" id="sd-judul" placeholder="Cth: Surat Perjanjian Kontrak Kerja CV AJ" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-maroon-500">
                </div>
                <div>
                   <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Upload Berkas Draft Dokumen (.pdf, .doc, .docx)</label>
                   <input type="file" id="sd-file" accept=".pdf,.doc,.docx" class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-maroon-50 file:text-maroon-700 hover:file:bg-maroon-100">
                </div>
             </form>
          `,
          footerHtml: `
             <button id="btn-sd-cancel" class="px-4 py-2 text-slate-500 text-sm hover:bg-slate-100 rounded-lg transition">Batal</button>
             <button id="btn-sd-submit" class="bg-maroon-700 hover:bg-maroon-800 text-white font-semibold text-sm px-5 py-2 rounded-lg shadow transition">Kirim Pengajuan</button>
          `,
          onMount: m => {
             m.querySelector("#btn-sd-cancel").onclick = closeModal;
             m.querySelector("#btn-sd-submit").onclick = async () => {
                const selectKaryawan = m.querySelector("#sd-karyawan");
                const nik = selectKaryawan.value;
                const nama = selectKaryawan.selectedOptions[0]?.dataset.nama || "";
                const judul = m.querySelector("#sd-judul").value.trim();
                const fileInput = m.querySelector("#sd-file");
                const file = fileInput.files[0];

                if (!nik || !judul || !file) {
                   return toast("Mohon lengkapi semua field & pilih file dokumen!", "warning");
                }

                const btn = m.querySelector("#btn-sd-submit");
                btn.disabled = true; btn.textContent = "Mengunggah Draft...";

                try {
                   const driveUrl = await uploadFileToDrive(file, `SignDocs/${nik}`);

                   const newId = genId("SDC");
                   const payload = {
                      id: newId,
                      nik_penerima: nik,
                      nama_penerima: nama,
                      judul: judul,
                      file_url: driveUrl,
                      status: "PENDING",
                      tanda_tangan_url: null,
                      tanggal_buat: new Date().toISOString(),
                      tanggal_ttd: null
                   };

                   await setDoc(doc(db, COL.SIGN_DOCUMENTS, newId), payload);

                   toast("Pengajuan TTD berhasil dibuat & diunggah!", "success");
                   closeModal();
                   loadSignDocTab();

                   // Send push & in-app notification to employee
                   const userQ = query(collection(db, COL.USERS), where("nama", "==", nama), limit(1));
                   const userSnap = await getDocs(userQ);
                   if (!userSnap.empty) {
                      const targetUser = userSnap.docs[0].id;
                      await notifyUser(targetUser, "Tanda Tangani Dokumen", `Admin mengunggah dokumen baru "${judul}" untuk Anda tanda tangani.`, "/#riwayat");
                   }
                } catch (err) {
                   toast("Gagal membuat pengajuan: " + err.message, "error");
                }
                btn.disabled = false; btn.textContent = "Kirim Pengajuan";
             };
          }
       });
    };

    // Bind Delete buttons
    panels.signdoc.querySelectorAll(".btn-delete-signdoc").forEach(btn => {
       btn.onclick = async () => {
          if (!confirm("Apakah Anda yakin ingin menghapus pengajuan tanda tangan digital ini?")) return;
          const id = btn.dataset.id;
          try {
             await deleteDoc(doc(db, COL.SIGN_DOCUMENTS, id));
             toast("Pengajuan berhasil dihapus", "success");
             loadSignDocTab();
          } catch (err) {
             toast("Gagal menghapus: " + err.message, "error");
          }
       };
    });
  }

  await loadKaryawanTab();
  loaded.karyawan = true;

  container.querySelectorAll(".md-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.mtab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".md-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "rekap") await loadRekapTab();
        if (tab === "dokumen") await loadDokumenTab();
        if (tab === "signdoc") await loadSignDocTab();
      }
    });
  });

  return { unmount() {} };
}
