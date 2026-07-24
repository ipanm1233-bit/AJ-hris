import { db, COL, collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, genId, openModal, closeModal, toast, fmtDate, fmtDateShort, escapeHtml, notifyUser } from "../utils.js";
import { badge, emptyState } from "../components.js";

// Default clause templates
const DEFAULT_CLAUSES = {
  KONTRAK_PKWT: [
    {
      judul: "Pasal 1: Maksud dan Hubungan Kerja",
      isi: "Pihak Pertama (CV Andela Jaya) menerima Pihak Kedua ({NAMA_KARYAWAN}) sebagai Karyawan Kontrak (PKWT) untuk posisi {JABATAN} di lokasi {CABANG}. Pihak Kedua bersedia melaksanakan tugas dan kewajiban sesuai petunjuk manajemen."
    },
    {
      judul: "Pasal 2: Jangka Waktu Kontrak & Evaluasi",
      isi: "Perjanjian Kerja Waktu Tertentu ini berlaku terhitung mulai tanggal {TANGGAL_MULAI} sampai dengan {TANGGAL_SELESAI}. Evaluasi kinerja dilakukan secara berkala setiap 3 (tiga) bulan oleh atasan langsung."
    },
    {
      judul: "Pasal 3: Hak Gaji dan Tunjangan",
      isi: "Pihak Kedua berhak menerima Imbalan Kerja / Gaji Pokok sebesar {GAJI_POKOK} per bulan, serta tunjangan harian/kehadiran yang dibayarkan setiap tanggal penggajian yang berlaku di perusahaan."
    },
    {
      judul: "Pasal 4: Kewajiban & Jam Kerja",
      isi: "Pihak Kedua wajib mematuhi seluruh Peraturan Perusahaan, SOP Operasional, jam kerja kantor (08:00 WIB), serta menjaga nama baik CV Andela Jaya."
    },
    {
      judul: "Pasal 5: Kerahasiaan Data & Aset",
      isi: "Pihak Kedua dilarang membocorkan rahasia dagang, resep/formula produk, data keuangan, daftar outlet/pelanggan kepada pihak luar tanpa izin tertulis dari Direksi."
    },
    {
      judul: "Pasal 6: Pemutusan Perjanjian & Sanksi",
      isi: "Perjanjian ini dapat diakhiri sewaktu-waktu oleh Pihak Pertama apabila Pihak Kedua melakukan pelanggaran berat, tindakan pidana, atau kinerja tidak memenuhi standar setelah diberikan Surat Peringatan."
    }
  ],
  KONTRAK_PKWTT: [
    {
      judul: "Pasal 1: Status Kepegawaian Tetap",
      isi: "Pihak Pertama mengangkat Pihak Kedua ({NAMA_KARYAWAN}) sebagai Karyawan Tetap (PKWTT) pada jabatan {JABATAN} unit kerja {DIVISI} di cabang {CABANG} terhitung sejak {TANGGAL_MULAI}."
    },
    {
      judul: "Pasal 2: Masa Percobaan (Probation)",
      isi: "Pihak Kedua menjalani Masa Percobaan paling lama 3 (tiga) bulan terhitung sejak tanggal penetapan. Selama masa percobaan, masing-masing pihak dapat mengakhiri hubungan kerja dengan pemberitahuan tertulis."
    },
    {
      judul: "Pasal 3: Kompensasi, Benefit, & BPJS",
      isi: "Pihak Kedua memperoleh Gaji Pokok {GAJI_POKOK}, Tunjangan Jabatan, Fasilitas BPJS Kesehatan & BPJS Ketenagakerjaan sesuai ketentuan yang berlaku."
    },
    {
      judul: "Pasal 4: Kerahasiaan & Etika Profesi",
      isi: "Pihak Kedua terikat kewajiban menjaga kerahasiaan informasi internal CV Andela Jaya dan dilarang terlibat dalam kegiatan persaingan bisnis sejenis selama bekerja."
    }
  ],
  SP_1: [
    {
      judul: "Pasal 1: Jenis Pelanggaran & Latar Belakang",
      isi: "Surat Peringatan Pertama (SP-1) ini diterbitkan kepada {NAMA_KARYAWAN} (NIK: {NIK}, Jabatan: {JABATAN}) atas tindakan pelanggaran kedisiplinan berupa: {ALASAN_SP} pada tanggal {TANGGAL_SURAT}."
    },
    {
      judul: "Pasal 2: Masa Berlaku Surat Peringatan",
      isi: "Surat Peringatan Pertama ini berlaku selama 6 (enam) bulan terhitung sejak tanggal diterbitkan ({TANGGAL_SURAT}). Apabila dalam kurun waktu tersebut Karyawan melakukan pelanggaran kembali, maka Perusahaan akan menerbitkan Surat Peringatan Kedua (SP-2)."
    },
    {
      judul: "Pasal 3: Sanksi & Pengurangan Poin KPI",
      isi: "Dampak dari penerbitan SP-1 ini meliput: Pemotongan nilai poin Review Kedisiplinan sebesar 15%, serta penangguhan penyesuaian gaji/bonus berkala."
    },
    {
      judul: "Pasal 4: Kewajiban Perbaikan Perilaku",
      isi: "Pihak Karyawan diminta untuk melakukan koreksi diri, meningkatkan tingkat disiplin jam kerja, dan mematuhi seluruh petunjuk SOP yang telah ditetapkan."
    }
  ],
  SP_2: [
    {
      judul: "Pasal 1: Dasar Penerbitan SP-2",
      isi: "Dikarenakan Saudara/i {NAMA_KARYAWAN} belum menunjukkan perbaikan sikap dan kembali melakukan pelanggaran kedisiplinan selama masa berlaku SP-1, maka Perusahaan secara resmi menerbitkan Surat Peringatan Kedua (SP-2)."
    },
    {
      judul: "Pasal 2: Rincian Pelanggaran Berulang",
      isi: "Bentuk pelanggaran yang melandasi SP-2 ini adalah: {ALASAN_SP}."
    },
    {
      judul: "Pasal 3: Masa Berlaku & Konsekuensi",
      isi: "SP-2 ini berlaku selama 6 (enam) bulan. Selama periode ini, Karyawan tidak berhak atas insentif variabel bulanan dan tunjangan kedisiplinan."
    }
  ],
  SP_3: [
    {
      judul: "Pasal 1: Surat Peringatan Ketiga & Terakhir",
      isi: "Surat Peringatan Ketiga (SP-3 / Peringatan Terakhir) diterbitkan kepada {NAMA_KARYAWAN} atas pelanggaran berat / tidak adanya perbaikan kinerja setelah SP-1 dan SP-2."
    },
    {
      judul: "Pasal 2: Ancaman Pemutusan Hubungan Kerja (PHK)",
      isi: "Apabila Karyawan kembali melanggar aturan Perusahaan selama masa SP-3 berlaku, Perusahaan akan langsung melakukan proses Pemutusan Hubungan Kerja (PHK) tanpa pesangon sesuai Peraturan Perusahaan."
    }
  ],
  PEMANGGILAN: [
    {
      judul: "Pasal 1: Maksud Pemanggilan",
      isi: "Perusahaan memanggil Saudara/i {NAMA_KARYAWAN} untuk menghadiri sesi wawancara klarifikasi dan konseling kedisiplinan mengenai: {ALASAN_SP}."
    },
    {
      judul: "Pasal 2: Waktu & Tempat Pelaksanaan",
      isi: "Sesi pemanggilan dilaksanakan pada tanggal {TANGGAL_SURAT} di Ruang HRD / Kantor Cabang {CABANG} dihadiri oleh Tim HRD & Atasan Langsung."
    }
  ],
  KETERANGAN_KERJA: [
    {
      judul: "Pasal 1: Pernyataan Hubungan Kerja",
      isi: "Dengan ini CV. Andela Jaya menerangkan bahwa Saudara/i {NAMA_KARYAWAN} (NIK: {NIK}) pernah bekerja pada perusahaan kami sejak {TANGGAL_MULAI} sampai dengan {TANGGAL_SELESAI} dengan jabatan terakhir sebagai {JABATAN} unit {DIVISI} di cabang {CABANG}."
    },
    {
      judul: "Pasal 2: Apresiasi & Dedikasi Kerja",
      isi: "Selama masa kerjanya, Saudara/i {NAMA_KARYAWAN} telah menunjukkan dedikasi, loyalitas, serta kontribusi kerja yang baik bagi kemajuan CV. Andela Jaya."
    },
    {
      judul: "Pasal 3: Penutup & Harapan",
      isi: "Surat Keterangan Kerja ini diterbitkan atas permintaan yang bersangkutan untuk dipergunakan sebagaimana mestinya. Kami mengucapkan terima kasih atas jasa-jasa yang telah diberikan."
    }
  ],
  SURAT_TUGAS: [
    {
      judul: "Pasal 1: Penugasan Resmi HRD",
      isi: "Manajemen CV. Andela Jaya memberikan penugasan resmi kepada Saudara/i {NAMA_KARYAWAN} (NIK: {NIK}, Jabatan: {JABATAN}) untuk melaksanakan tugas khusus di lokasi {LOKASI_PENUGASAN} terhitung sejak {TANGGAL_MULAI} sampai {TANGGAL_SELESAI}."
    },
    {
      judul: "Pasal 2: Rincian Tugas & Fasilitas",
      isi: "Tugas utama meliputi {ALASAN_SP}. Perusahaan menyediakan tunjangan perjalanan/dinas dan fasilitas operasional sesuai ketentuan perusahaan."
    }
  ]
};

export async function mount(container, { session }) {
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";

  let allDrafts = [];
  let currentFilter = "ALL";
  let searchKeyword = "";

  const panels = {
    drafts: container.querySelector("#doc-panel-drafts"),
    signed: container.querySelector("#doc-panel-signed"),
    templates: container.querySelector("#doc-panel-templates"),
    placeholders: container.querySelector("#doc-panel-placeholders"),
  };
  const loaded = { drafts: false, signed: false, templates: false, placeholders: false };

  const listEl = container.querySelector("#doc-drafts-list");
  const searchInput = container.querySelector("#doc-search-input");
  const filterBtns = container.querySelectorAll(".doc-filter-btn");

  // Tab navigation
  const tabBtns = container.querySelectorAll(".doc-main-tab");
  tabBtns.forEach(btn => {
    btn.onclick = async () => {
      const tab = btn.dataset.docTab;
      tabBtns.forEach(b => {
        const isTarget = b === btn;
        b.className = `doc-main-tab px-4 py-2.5 rounded-t-2xl text-xs font-bold border-b-2 transition flex items-center gap-2 ${isTarget ? 'border-maroon-700 text-maroon-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`;
      });
      Object.keys(panels).forEach(k => {
        if (panels[k]) panels[k].classList.toggle("hidden", k !== tab);
      });

      if (tab === "signed" && !loaded.signed) {
        await loadSignedDocsTab();
        loaded.signed = true;
      } else if (tab === "templates" && !loaded.templates) {
        await loadMasterTemplatesTab();
        loaded.templates = true;
      } else if (tab === "placeholders" && !loaded.placeholders) {
        await loadPlaceholdersTab();
        loaded.placeholders = true;
      }
    };
  });

  async function loadData() {
    listEl.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Memuat berkas draft dokumen...</div>`;
    try {
      allDrafts = await fsGetAll("drafts_dokumen").catch(() => []);
      allDrafts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      renderList();
      loaded.drafts = true;
    } catch (e) {
      listEl.innerHTML = `<div class="p-6 text-center text-xs text-rose-500">Gagal memuat draft: ${e.message}</div>`;
    }
  }

  function renderList() {
    let filtered = allDrafts;

    if (currentFilter !== "ALL") {
      filtered = filtered.filter(d => (d.tipe_kategori || "").toUpperCase() === currentFilter);
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      filtered = filtered.filter(d => 
        (d.judul || "").toLowerCase().includes(kw) ||
        (d.nama_karyawan || "").toLowerCase().includes(kw) ||
        (d.nik_karyawan || "").toLowerCase().includes(kw) ||
        (d.nomor_surat || "").toLowerCase().includes(kw)
      );
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="p-12 text-center text-slate-400">
          <p class="text-2xl font-bold text-slate-300">📄</p>
          <p class="text-xs font-semibold text-slate-500 mt-2">Belum ada draft dokumen yang sesuai.</p>
          <p class="text-[11px] text-slate-400 mt-1">Klik tombol "Buat Draft Dokumen Baru" di atas untuk membuat dokumen resmi pertamamu.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map(d => {
      const isPublished = d.status === "PUBLISHED" || d.status === "SENT";
      const isSigned = d.status === "SIGNED";
      return `
        <div class="p-4 bg-slate-50/70 hover:bg-slate-100/80 rounded-2xl border border-slate-100 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-md text-[10px] font-bold ${getTipeColor(d.tipe_kategori)}">${escapeHtml(d.tipe_kategori || "KONTRAK")}</span>
              <span class="text-xs font-extrabold text-slate-800 truncate">${escapeHtml(d.judul || "Draft Dokumen")}</span>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${isSigned ? 'bg-emerald-100 text-emerald-800' : isPublished ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}">
                ${isSigned ? '✍️ SUDAH TTD' : isPublished ? '📩 TERBIT' : 'DRAFT'}
              </span>
            </div>
            <p class="text-xs text-slate-600 font-medium">
              Target: <strong class="text-slate-800">${escapeHtml(d.nama_karyawan || "-")}</strong> (NIK: ${escapeHtml(d.nik_karyawan || "-")}) • ${escapeHtml(d.jabatan || "-")}
            </p>
            <p class="text-[10px] text-slate-400">
              No. Surat: <b>${escapeHtml(d.nomor_surat || "-")}</b> • Dibuat oleh ${escapeHtml(d.created_by || "HRD")} pada ${fmtDateShort(d.created_at)}
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0 flex-wrap">
            <button data-action="preview" data-id="${d.id}" class="px-3 py-1.5 bg-white border border-slate-200 hover:border-maroon-300 text-slate-700 hover:text-maroon-700 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm">
              👁️ Lihat & Cetak PDF
            </button>
            <button data-action="edit" data-id="${d.id}" class="px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm">
              ✏️ Edit Klausul
            </button>
            <button data-action="publish" data-id="${d.id}" class="px-3 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1">
              📩 ${isPublished || isSigned ? 'Kirim Ulang' : 'Rilis & Kirim ke Karyawan'}
            </button>
            <button data-action="delete" data-id="${d.id}" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition" title="Hapus Draft">
              🗑️
            </button>
          </div>
        </div>`;
    }).join("");

    // Bind event handlers
    listEl.querySelectorAll("[data-action='preview']").forEach(btn => {
      btn.onclick = () => previewDocumentModal(allDrafts.find(d => d.id === btn.dataset.id));
    });

    listEl.querySelectorAll("[data-action='edit']").forEach(btn => {
      btn.onclick = () => openDocEditorModal(allDrafts.find(d => d.id === btn.dataset.id), session, loadData);
    });

    listEl.querySelectorAll("[data-action='publish']").forEach(btn => {
      btn.onclick = () => publishAndSendToEmployee(allDrafts.find(d => d.id === btn.dataset.id), session, loadData);
    });

    listEl.querySelectorAll("[data-action='delete']").forEach(btn => {
      btn.onclick = async () => {
        if (confirm("Apakah Anda yakin ingin menghapus draft dokumen ini secara permanen?")) {
          await fsDelete("drafts_dokumen", btn.dataset.id);
          toast("Draft dokumen berhasil dihapus!", "success");
          loadData();
        }
      };
    });
  }

  // --- TAB 2: LOAD SIGNED DOCUMENTS ---
  async function loadSignedDocsTab() {
    const wrap = container.querySelector("#doc-signed-list");
    wrap.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Memuat dokumen TTD...</div>`;

    try {
      const signDocsList = await fsGetAll(COL.SIGN_DOCUMENTS).catch(() => []);
      const draftDocsList = await fsGetAll("drafts_dokumen").catch(() => []);

      const merged = signDocsList.map(sd => {
        const matchingDraft = draftDocsList.find(d => d.id === sd.id);
        return {
          ...sd,
          draftData: matchingDraft || null
        };
      });

      merged.sort((a, b) => new Date(b.tanggal_ttd || b.tanggal_buat || 0) - new Date(a.tanggal_ttd || a.tanggal_buat || 0));

      const searchInputSigned = container.querySelector("#signed-doc-search");
      
      function renderSignedList(items) {
        if (!items.length) {
          wrap.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Belum ada dokumen TTD karyawan.</div>`;
          return;
        }

        wrap.innerHTML = `
          <table class="w-full text-xs text-left">
            <thead class="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th class="p-3">Karyawan Target</th>
                <th class="p-3">Judul Dokumen</th>
                <th class="p-3 text-center">Tanggal Dibuat</th>
                <th class="p-3 text-center">Status TTD</th>
                <th class="p-3 text-center">Pratinjau TTD</th>
                <th class="p-3 text-center">Waktu TTD</th>
                <th class="p-3 text-center">Aksi HRD</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${items.map(d => {
                const isSigned = d.status === "SIGNED";
                return `
                  <tr class="hover:bg-slate-50/70 transition">
                    <td class="p-3 font-semibold text-slate-800">
                      <div>${escapeHtml(d.nama_penerima || d.nama_karyawan || "-")}</div>
                      <div class="text-[10px] text-slate-400 font-mono">NIK: ${escapeHtml(d.nik_penerima || d.nik_karyawan || "-")}</div>
                    </td>
                    <td class="p-3 text-slate-700 font-bold">
                      <div>${escapeHtml(d.judul || "-")}</div>
                    </td>
                    <td class="p-3 text-center text-slate-500">${d.tanggal_buat ? d.tanggal_buat.substring(0,10) : "-"}</td>
                    <td class="p-3 text-center">
                      ${isSigned ? badge("SUDAH TTD", "green") : badge("PENDING TTD", "amber")}
                    </td>
                    <td class="p-3 text-center">
                      ${d.tanda_tangan_url ? `
                        <img src="${d.tanda_tangan_url}" class="h-9 w-auto border border-slate-200 bg-white p-0.5 rounded shadow-sm hover:scale-110 transition cursor-zoom-in mx-auto" onclick="window.open('${d.tanda_tangan_url}', '_blank')">
                      ` : '<span class="text-slate-300">-</span>'}
                    </td>
                    <td class="p-3 text-center text-slate-500">${d.tanggal_ttd ? fmtDateShort(d.tanggal_ttd) : "-"}</td>
                    <td class="p-3 text-center">
                      <button data-view-signed="${d.id}" class="px-2.5 py-1 bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg font-bold text-[11px] shadow transition">
                        👁️ Pratinjau & Cetak PDF TTD
                      </button>
                    </td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>`;

        wrap.querySelectorAll("[data-view-signed]").forEach(btn => {
          btn.onclick = () => {
            const item = merged.find(i => i.id === btn.dataset.viewSigned);
            if (item) {
              const previewObj = item.draftData || {
                id: item.id,
                judul: item.judul,
                nama_karyawan: item.nama_penerima,
                nik_karyawan: item.nik_penerima,
                tanggal_surat: item.tanggal_buat,
                nomor_surat: "SDC-" + item.id,
                tanda_tangan_url: item.tanda_tangan_url,
                tanggal_ttd: item.tanggal_ttd,
                klausul: [
                  { judul: "Pasal 1: Pengesahan Dokumen", isi: `Dokumen "${item.judul}" telah dibaca, disetujui, dan ditandatangani secara elektronik oleh ${item.nama_penerima}.` }
                ]
              };
              if (item.tanda_tangan_url) previewObj.tanda_tangan_url = item.tanda_tangan_url;
              previewDocumentModal(previewObj);
            }
          };
        });
      }

      renderSignedList(merged);

      if (searchInputSigned) {
        searchInputSigned.oninput = (e) => {
          const kw = e.target.value.toLowerCase();
          const filtered = merged.filter(m => 
            (m.nama_penerima || "").toLowerCase().includes(kw) ||
            (m.nik_penerima || "").toLowerCase().includes(kw) ||
            (m.judul || "").toLowerCase().includes(kw)
          );
          renderSignedList(filtered);
        };
      }
    } catch (e) {
      wrap.innerHTML = `<div class="p-6 text-center text-xs text-rose-500">Gagal memuat dokumen TTD: ${e.message}</div>`;
    }
  }

  // --- TAB 3: MASTER TEMPLATES HRD ---
  async function loadMasterTemplatesTab() {
    const wrap = container.querySelector("#master-templates-list-container");
    wrap.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Memuat master template kustom HRD...</div>`;

    try {
      const customTemplates = await fsGetAll("custom_doc_templates").catch(() => []);

      const btnAddTpl = container.querySelector("#btn-add-master-template");
      if (btnAddTpl) {
        btnAddTpl.onclick = () => openMasterTemplateEditorModal(null, loadMasterTemplatesTab);
      }

      if (customTemplates.length === 0) {
        wrap.innerHTML = `
          <div class="p-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <p class="text-2xl font-bold text-slate-300">📂</p>
            <p class="text-xs font-bold text-slate-600 mt-2">Belum ada Master Template Kustom HRD</p>
            <p class="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">Klik "Buat Master Template Kustom Baru" untuk menyimpan template surat kustom perusahaan (Paklaring, Surat Mutasi, NDA, Rekomendasi, dll) dengan struktur klausul & placeholder lengkap.</p>
            <button id="btn-empty-add-tpl" class="mt-4 px-4 py-2 bg-maroon-700 text-white rounded-xl text-xs font-bold shadow hover:bg-maroon-800 transition">
              ➕ Buat Master Template Pertama
            </button>
          </div>`;
        const btnEmpty = wrap.querySelector("#btn-empty-add-tpl");
        if (btnEmpty) btnEmpty.onclick = () => openMasterTemplateEditorModal(null, loadMasterTemplatesTab);
        return;
      }

      wrap.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${customTemplates.map(t => `
            <div class="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 hover:border-maroon-300 transition shadow-sm flex flex-col justify-between gap-3">
              <div>
                <div class="flex items-center justify-between gap-2">
                  <span class="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-maroon-100 text-maroon-800 uppercase tracking-wider">${escapeHtml(t.tipe_kategori || "KUSTOM")}</span>
                  <span class="text-[10px] text-slate-400">${t.klausul?.length || 0} Pasal / Klausul</span>
                </div>
                <h3 class="text-sm font-extrabold text-slate-800 mt-2">${escapeHtml(t.nama_template || t.judul)}</h3>
                <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(t.deskripsi || "Template dokumen resmi kustom HRD.")}</p>
              </div>

              <div class="flex items-center justify-between border-t border-slate-200/80 pt-3 mt-1">
                <button data-use-template="${t.id}" class="px-3 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1">
                  ✨ Gunakan & Buat Draft
                </button>
                <div class="flex items-center gap-1">
                  <button data-edit-template="${t.id}" class="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg text-xs" title="Edit Template">✏️ Edit</button>
                  <button data-del-template="${t.id}" class="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg text-xs" title="Hapus Template">🗑️ Hapus</button>
                </div>
              </div>
            </div>
          `).join("")}
        </div>`;

      // Event bindings
      wrap.querySelectorAll("[data-use-template]").forEach(btn => {
        btn.onclick = () => {
          const tpl = customTemplates.find(x => x.id === btn.dataset.useTemplate);
          if (tpl) {
            openDocEditorModal({
              template_type: tpl.id,
              judul: tpl.judul || tpl.nama_template,
              klausul: tpl.klausul || []
            }, session, loadData);
          }
        };
      });

      wrap.querySelectorAll("[data-edit-template]").forEach(btn => {
        btn.onclick = () => {
          const tpl = customTemplates.find(x => x.id === btn.dataset.editTemplate);
          if (tpl) openMasterTemplateEditorModal(tpl, loadMasterTemplatesTab);
        };
      });

      wrap.querySelectorAll("[data-del-template]").forEach(btn => {
        btn.onclick = async () => {
          if (confirm("Apakah Anda yakin ingin menghapus master template kustom ini?")) {
            await fsDelete("custom_doc_templates", btn.dataset.delTemplate);
            toast("Master template berhasil dihapus", "success");
            loadMasterTemplatesTab();
          }
        };
      });

    } catch (e) {
      wrap.innerHTML = `<div class="p-6 text-center text-xs text-rose-500">Gagal memuat template kustom: ${e.message}</div>`;
    }
  }

  // --- TAB 4: LOAD & MANAGE CUSTOM PLACEHOLDERS ---
  async function loadPlaceholdersTab() {
    const wrap = container.querySelector("#placeholders-list-container");
    wrap.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Memuat konfigurasi placeholder...</div>`;

    const defaultBuiltIn = [
      { key: "NAMA_KARYAWAN", label: "Nama Lengkap Karyawan Target", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "NIK", label: "Nomor Induk Karyawan (NIK)", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "JABATAN", label: "Jabatan Pekerjaan", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "CABANG", label: "Lokasi Cabang Kerja", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "DIVISI", label: "Divisi / Departemen", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "ALAMAT", label: "Alamat Tempat Tinggal", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "NO_KTP", label: "Nomor Induk Kependudukan (KTP)", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "NO_REKENING", label: "Nomor Rekening Bank Karyawan", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "TANGGAL_MASUK", label: "Tanggal Masuk / Awal Kerja", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "BPJS_KES", label: "Nomor Kartu BPJS Kesehatan", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "BPJS_TK", label: "Nomor BPJS Ketenagakerjaan", desc: "Otomatis diisi dari database karyawan", is_system: true },
      { key: "TANGGAL_MULAI", label: "Tanggal Efektif / Mulai Kontrak", desc: "Diinput pada form pembuat dokumen", is_system: true },
      { key: "TANGGAL_SELESAI", label: "Tanggal Akhir / Sanksi", desc: "Diinput pada form pembuat dokumen", is_system: true },
      { key: "GAJI_POKOK", label: "Nominal Gaji Pokok", desc: "Diinput pada form pembuat dokumen", is_system: true },
      { key: "ALASAN_SP", label: "Alasan SP / Catatan Khusus", desc: "Diinput pada form pembuat dokumen", is_system: true },
      { key: "NOMOR_SURAT", label: "Nomor Dokumen Resmi", desc: "Diinput pada form pembuat dokumen", is_system: true },
      { key: "LOKASI_PENUGASAN", label: "Alamat / Kota Penugasan Dinas", desc: "Placeholder kustom HRD", is_system: false },
    ];

    try {
      const cfgSnap = await getDoc(doc(db, COL.APP_SETTINGS, "doc_placeholders")).catch(() => null);
      let customList = cfgSnap?.exists() ? (cfgSnap.data().list || []) : [];

      let combined = [...defaultBuiltIn];
      customList.forEach(c => {
        if (!combined.some(x => x.key === c.key)) {
          combined.push(c);
        }
      });

      function renderPlaceholdersUI() {
        wrap.innerHTML = `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${combined.map(p => `
              <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-xs bg-maroon-100 text-maroon-800 px-2 py-0.5 rounded-md">{${escapeHtml(p.key)}}</span>
                    ${p.is_system ? `<span class="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[9px] font-bold">Bawaan Sistem</span>` : `<span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[9px] font-bold">Kustom HRD</span>`}
                  </div>
                  <p class="text-xs font-bold text-slate-800 mt-1.5">${escapeHtml(p.label)}</p>
                  <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(p.desc || "-")}</p>
                </div>
                ${!p.is_system ? `
                  <button data-del-ph="${p.key}" class="p-1 text-rose-500 hover:bg-rose-100 rounded-lg text-xs" title="Hapus Placeholder">🗑️</button>
                ` : ''}
              </div>
            `).join("")}
          </div>`;

        wrap.querySelectorAll("[data-del-ph]").forEach(btn => {
          btn.onclick = async () => {
            const keyToDel = btn.dataset.delPh;
            if (confirm(`Hapus placeholder {${keyToDel}}?`)) {
              customList = customList.filter(x => x.key !== keyToDel);
              combined = combined.filter(x => x.key !== keyToDel);
              await setDoc(doc(db, COL.APP_SETTINGS, "doc_placeholders"), { list: customList }, { merge: true });
              toast("Placeholder berhasil dihapus", "success");
              renderPlaceholdersUI();
            }
          };
        });
      }

      renderPlaceholdersUI();

      const btnAddPh = container.querySelector("#btn-add-custom-placeholder");
      if (btnAddPh) {
        btnAddPh.onclick = () => {
          openModal({
            title: "Tambah Placeholder Kustom Baru",
            bodyHtml: `
              <div class="space-y-4 text-left">
                <div>
                  <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Kode Placeholder (Singkat, Tanpa Spasi)</label>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-mono font-bold text-slate-400">{</span>
                    <input type="text" id="ph-key-input" placeholder="CTH: TUNJANGAN_TRANSPORT" class="w-full px-3 py-2 text-xs font-mono font-bold uppercase border border-slate-200 rounded-xl outline-none focus:border-maroon-500">
                    <span class="text-sm font-mono font-bold text-slate-400">}</span>
                  </div>
                  <p class="text-[10px] text-slate-400 mt-1">Gunakan huruf kapital dan garis bawah (_) sebagai pengganti spasi.</p>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Label Deskripsi</label>
                  <input type="text" id="ph-label-input" placeholder="Cth: Nominal Tunjangan Transportasi Harian" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-maroon-500">
                </div>
              </div>`,
            footerHtml: `
              <button id="btn-ph-cancel" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
              <button id="btn-ph-save" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl shadow">Simpan Placeholder</button>`,
            onMount: m => {
              m.querySelector("#btn-ph-cancel").onclick = closeModal;
              m.querySelector("#btn-ph-save").onclick = async () => {
                const rawKey = m.querySelector("#ph-key-input").value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
                const labelStr = m.querySelector("#ph-label-input").value.trim();

                if (!rawKey || !labelStr) {
                  return toast("Mohon isi kode placeholder dan label deskripsi!", "warning");
                }

                if (combined.some(x => x.key === rawKey)) {
                  return toast(`Placeholder {${rawKey}} sudah ada!`, "warning");
                }

                const newObj = { key: rawKey, label: labelStr, desc: "Placeholder kustom HRD", is_system: false };
                customList.push(newObj);
                combined.push(newObj);

                try {
                  await setDoc(doc(db, COL.APP_SETTINGS, "doc_placeholders"), { list: customList }, { merge: true });
                  toast(`Placeholder {${rawKey}} berhasil ditambahkan!`, "success");
                  closeModal();
                  renderPlaceholdersUI();
                } catch (err) {
                  toast("Gagal menyimpan placeholder: " + err.message, "error");
                }
              };
            }
          });
        };
      }
    } catch (e) {
      wrap.innerHTML = `<div class="p-6 text-center text-xs text-rose-500">Gagal memuat placeholder: ${e.message}</div>`;
    }
  }

  function getTipeColor(tipe) {
    switch ((tipe || "").toUpperCase()) {
      case "SP": return "bg-rose-100 text-rose-800";
      case "PEMANGGILAN": return "bg-amber-100 text-amber-800";
      case "KETERANGAN_KERJA": return "bg-emerald-100 text-emerald-800";
      case "SURAT_TUGAS": return "bg-purple-100 text-purple-800";
      default: return "bg-blue-100 text-blue-800";
    }
  }

  // Filter Buttons event binding
  filterBtns.forEach(btn => {
    btn.onclick = () => {
      currentFilter = btn.dataset.docFilter;
      filterBtns.forEach(b => {
        b.className = "doc-filter-btn px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition";
      });
      btn.className = "doc-filter-btn px-3.5 py-1.5 rounded-xl text-xs font-bold bg-maroon-700 text-white transition";
      renderList();
    };
  });

  // Search input binding
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchKeyword = e.target.value;
      renderList();
    };
  }

  // Button create draft
  container.querySelector("#btn-create-doc-draft").onclick = () => {
    openDocEditorModal(null, session, loadData);
  };

  // Button Google Doc Templates & Placeholders
  const btnGDoc = container.querySelector("#btn-gdoc-templates");
  if (btnGDoc) {
    btnGDoc.onclick = () => {
      openGDocTemplateModal(session);
    };
  }

  await loadData();
  return { unmount() {} };
}

// ----------------------------------------------------------------------
// BUILDER & CLAUSE EDITOR MODAL
// ----------------------------------------------------------------------
async function openDocEditorModal(existingData, session, onDone) {
  const masterKaryawan = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);
  const activeKaryawan = masterKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF") === "AKTIF")
                                       .sort((a,b) => (a.nama_karyawan || a.nama || "").localeCompare(b.nama_karyawan || b.nama || ""));

  const customTemplatesList = await fsGetAll("custom_doc_templates").catch(() => []);

  let clauses = existingData?.klausul ? [...existingData.klausul] : [...DEFAULT_CLAUSES.KONTRAK_PKWT];
  let customFieldsValues = existingData?.custom_fields ? { ...existingData.custom_fields } : {};

  openModal({
    title: existingData ? "Edit Draft & Klausul Dokumen" : "Buat Draft Dokumen Baru",
    size: "lg",
    bodyHtml: `
      <div class="space-y-5 text-left">
        <!-- 1. TIPE DOKUMEN & KARYAWAN TARGET -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Jenis / Template Dokumen</label>
            <select id="doc-type-select" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-white font-semibold">
              <optgroup label="Template Bawaan Sistem">
                <option value="KONTRAK_PKWT" ${existingData?.template_type === 'KONTRAK_PKWT' ? 'selected' : ''}>Kontrak Kerja PKWT (Waktu Tertentu)</option>
                <option value="KONTRAK_PKWTT" ${existingData?.template_type === 'KONTRAK_PKWTT' ? 'selected' : ''}>Kontrak Kerja PKWTT (Tetap / Permanen)</option>
                <option value="SP_1" ${existingData?.template_type === 'SP_1' ? 'selected' : ''}>Surat Peringatan 1 (SP-1)</option>
                <option value="SP_2" ${existingData?.template_type === 'SP_2' ? 'selected' : ''}>Surat Peringatan 2 (SP-2)</option>
                <option value="SP_3" ${existingData?.template_type === 'SP_3' ? 'selected' : ''}>Surat Peringatan 3 (SP-3)</option>
                <option value="PEMANGGILAN" ${existingData?.template_type === 'PEMANGGILAN' ? 'selected' : ''}>Surat Pemanggilan & Konseling</option>
                <option value="KETERANGAN_KERJA" ${existingData?.template_type === 'KETERANGAN_KERJA' ? 'selected' : ''}>Surat Keterangan Kerja (Paklaring)</option>
                <option value="SURAT_TUGAS" ${existingData?.template_type === 'SURAT_TUGAS' ? 'selected' : ''}>Surat Penugasan / Dinas Resmi</option>
              </optgroup>
              ${customTemplatesList.length > 0 ? `
                <optgroup label="Master Template Kustom HRD">
                  ${customTemplatesList.map(ct => `
                    <option value="CUST_${ct.id}" ${existingData?.template_type === `CUST_${ct.id}` ? 'selected' : ''}>📂 ${escapeHtml(ct.nama_template || ct.judul)}</option>
                  `).join("")}
                </optgroup>
              ` : ''}
              <optgroup label="Custom / Kosong">
                <option value="NEW_CUSTOM" ${existingData?.template_type === 'NEW_CUSTOM' ? 'selected' : ''}>✨ + Buat Template / Draft Kustom Baru dari Awal</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Karyawan Dituju (Target)</label>
            <select id="doc-target-karyawan" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-white font-semibold">
              <option value="">-- Pilih Karyawan Target --</option>
              ${activeKaryawan.map(k => `
                <option value="${escapeHtml(k.nik_karyawan || k.nik)}" ${existingData?.nik_karyawan === (k.nik_karyawan || k.nik) ? 'selected' : ''}>
                  ${escapeHtml(k.nama_karyawan || k.nama)} (${escapeHtml(k.nik_karyawan || k.nik)}) - ${escapeHtml(k.jabatan || "-")}
                </option>
              `).join("")}
            </select>
          </div>
        </div>

        <!-- 2. PARAMETER UTAMA -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Judul / Perihal Dokumen</label>
            <input type="text" id="doc-title" value="${escapeHtml(existingData?.judul || 'SURAT PERJANJIAN KERJA WAKTU TERTENTU')}" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500">
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Nomor Surat / Dokumen</label>
            <input type="text" id="doc-number" value="${escapeHtml(existingData?.nomor_surat || `00${Math.floor(Math.random()*90)+10}/HRD-AJ/${new Date().getFullYear()}`)}" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 font-mono">
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Tanggal Surat / Terbit</label>
            <input type="date" id="doc-date" value="${existingData?.tanggal_surat || new Date().toISOString().substring(0, 10)}" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500">
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Tanggal Mulai / Berlaku</label>
            <input type="date" id="doc-date-start" value="${existingData?.tanggal_mulai || new Date().toISOString().substring(0, 10)}" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500">
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">Tanggal Selesai / Sanksi (Opsional)</label>
            <input type="date" id="doc-date-end" value="${existingData?.tanggal_selesai || ''}" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500">
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Catatan / Alasan / Gaji Tambahan ({ALASAN_SP} atau {GAJI_POKOK})</label>
          <input type="text" id="doc-extra-note" value="${escapeHtml(existingData?.alasan_sp || existingData?.gaji_pokok || '')}" placeholder="Contoh: Terlambat berturut-turut 5x ATAU Rp 4.500.000,-" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500">
        </div>

        <!-- DYNAMIC CUSTOM PLACEHOLDERS INPUT AREA -->
        <div id="dynamic-custom-fields-box" class="hidden p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2">
          <p class="text-xs font-bold text-blue-900 flex items-center gap-1.5">
            <span>⚙️</span> Value Placeholder Kustom Terdeteksi:
          </p>
          <div id="dynamic-custom-fields-inputs" class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <!-- populated dynamically -->
          </div>
        </div>

        <!-- 3. KLAUSUL EDITOR INTERAKTIF -->
        <div class="border-t border-slate-100 pt-4 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>📝</span> Penyesuaian Klausul / Pasal-Pasal Dokumen
              </h3>
              <p class="text-[10px] text-slate-400">Klik tag di bawah ini untuk menyisipkan placeholder ke dalam pasal.</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button id="btn-save-as-template" class="text-[11px] font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1">
                💾 Simpan Master Template
              </button>
              <button id="btn-reset-clauses" class="text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition">
                ↺ Reset Default
              </button>
              <button id="btn-add-clause" class="text-[11px] font-bold text-white bg-maroon-700 hover:bg-maroon-800 px-3 py-1.5 rounded-xl transition">
                ➕ Tambah Klausul
              </button>
            </div>
          </div>

          <!-- PLACEHOLDER TOOLBAR PICKER -->
          <div class="p-2.5 bg-slate-100/80 rounded-xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto text-[11px]">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">Sisipkan:</span>
            ${[
              "{NAMA_KARYAWAN}", "{NIK}", "{JABATAN}", "{CABANG}", "{DIVISI}", "{ALAMAT}", "{NO_KTP}", "{NO_REKENING}", "{TANGGAL_MULAI}", "{TANGGAL_SELESAI}", "{GAJI_POKOK}", "{ALASAN_SP}", "{LOKASI_PENUGASAN}"
            ].map(tag => `
              <button class="btn-insert-tag shrink-0 px-2 py-1 bg-white hover:bg-maroon-50 hover:border-maroon-300 border border-slate-200 rounded-lg text-maroon-800 font-mono font-bold transition shadow-2xs" data-tag="${tag}">
                ${tag}
              </button>
            `).join("")}
          </div>

          <div id="clauses-container" class="space-y-3 max-h-80 overflow-y-auto pr-1">
            <!-- populated by JS -->
          </div>
        </div>
      </div>`,
    footerHtml: `
      <div class="flex items-center justify-between w-full">
        <button id="btn-doc-cancel" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition">Batal</button>
        <div class="flex items-center gap-2">
          <button id="btn-doc-save-draft" class="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Simpan Draft</button>
          <button id="btn-doc-save-publish" class="px-4 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow">Simpan & Rilis ke Karyawan</button>
        </div>
      </div>`,
    onMount: m => {
      const typeSelect = m.querySelector("#doc-type-select");
      const titleInput = m.querySelector("#doc-title");
      const clausesContainer = m.querySelector("#clauses-container");
      const customFieldsBox = m.querySelector("#dynamic-custom-fields-box");
      const customFieldsInputs = m.querySelector("#dynamic-custom-fields-inputs");
      let activeTextArea = null;

      function detectCustomPlaceholdersInClauses() {
        const textAll = clauses.map(c => (c.judul || "") + " " + (c.isi || "")).join(" ");
        const found = textAll.match(/\{([A-Z0-9_]+)\}/g) || [];
        const uniqueKeys = [...new Set(found.map(x => x.replace(/[\{\}]/g, "")))];

        // System auto-handled keys
        const systemKeys = ["NAMA_KARYAWAN", "NIK", "JABATAN", "CABANG", "DIVISI", "TANGGAL_SURAT", "TANGGAL_MULAI", "TANGGAL_SELESAI", "ALASAN_SP", "GAJI_POKOK", "NOMOR_SURAT"];
        const extraCustomKeys = uniqueKeys.filter(k => !systemKeys.includes(k));

        if (extraCustomKeys.length === 0) {
          customFieldsBox.classList.add("hidden");
          return;
        }

        customFieldsBox.classList.remove("hidden");
        customFieldsInputs.innerHTML = extraCustomKeys.map(key => `
          <div>
            <label class="block text-[10px] font-bold text-slate-600 mb-0.5">{${key}}</label>
            <input type="text" data-custom-key="${key}" value="${escapeHtml(customFieldsValues[key] || '')}" placeholder="Isi nilai {${key}}..." class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-maroon-500 bg-white">
          </div>
        `).join("");

        customFieldsInputs.querySelectorAll("[data-custom-key]").forEach(input => {
          input.oninput = () => {
            customFieldsValues[input.dataset.customKey] = input.value;
          };
        });
      }

      function renderClausesUI() {
        clausesContainer.innerHTML = clauses.map((c, i) => `
          <div class="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-sm relative group">
            <div class="flex items-center justify-between gap-2">
              <input type="text" data-clause-title="${i}" value="${escapeHtml(c.judul)}" class="w-full text-xs font-bold text-slate-800 border-b border-slate-200 focus:border-maroon-500 outline-none pb-1" placeholder="Judul Pasal...">
              <div class="flex items-center gap-1 shrink-0">
                ${i > 0 ? `<button data-clause-up="${i}" class="p-1 text-slate-400 hover:text-slate-700 text-xs" title="Naik">⬆️</button>` : ''}
                ${i < clauses.length - 1 ? `<button data-clause-down="${i}" class="p-1 text-slate-400 hover:text-slate-700 text-xs" title="Turun">⬇️</button>` : ''}
                <button data-clause-del="${i}" class="p-1 text-rose-500 hover:bg-rose-50 rounded text-xs" title="Hapus Klausul">🗑️</button>
              </div>
            </div>
            <textarea data-clause-body="${i}" rows="3" class="w-full p-2 text-xs text-slate-700 border border-slate-100 rounded-lg outline-none focus:border-maroon-400 bg-slate-50/50 leading-relaxed">${escapeHtml(c.isi)}</textarea>
          </div>
        `).join("");

        clausesContainer.querySelectorAll("[data-clause-title]").forEach(el => {
          el.oninput = () => {
            clauses[parseInt(el.dataset.clauseTitle)].judul = el.value;
            detectCustomPlaceholdersInClauses();
          };
        });
        clausesContainer.querySelectorAll("[data-clause-body]").forEach(el => {
          el.onfocus = () => { activeTextArea = el; };
          el.oninput = () => {
            clauses[parseInt(el.dataset.clauseBody)].isi = el.value;
            detectCustomPlaceholdersInClauses();
          };
        });

        clausesContainer.querySelectorAll("[data-clause-del]").forEach(btn => {
          btn.onclick = () => {
            const idx = parseInt(btn.dataset.clauseDel);
            clauses.splice(idx, 1);
            renderClausesUI();
            detectCustomPlaceholdersInClauses();
          };
        });
        clausesContainer.querySelectorAll("[data-clause-up]").forEach(btn => {
          btn.onclick = () => {
            const idx = parseInt(btn.dataset.clauseUp);
            const temp = clauses[idx];
            clauses[idx] = clauses[idx - 1];
            clauses[idx - 1] = temp;
            renderClausesUI();
          };
        });
        clausesContainer.querySelectorAll("[data-clause-down]").forEach(btn => {
          btn.onclick = () => {
            const idx = parseInt(btn.dataset.clauseDown);
            const temp = clauses[idx];
            clauses[idx] = clauses[idx + 1];
            clauses[idx + 1] = temp;
            renderClausesUI();
          };
        });

        detectCustomPlaceholdersInClauses();
      }

      // Bind Insert Tag Buttons
      m.querySelectorAll(".btn-insert-tag").forEach(btn => {
        btn.onclick = () => {
          const tag = btn.dataset.tag;
          if (activeTextArea) {
            const start = activeTextArea.selectionStart || 0;
            const end = activeTextArea.selectionEnd || 0;
            const val = activeTextArea.value;
            activeTextArea.value = val.substring(0, start) + tag + val.substring(end);
            const idx = parseInt(activeTextArea.dataset.clauseBody);
            if (!isNaN(idx) && clauses[idx]) clauses[idx].isi = activeTextArea.value;
            detectCustomPlaceholdersInClauses();
          } else {
            navigator.clipboard.writeText(tag);
            toast(`Tag ${tag} disalin ke clipboard!`, "info");
          }
        };
      });

      typeSelect.onchange = () => {
        const val = typeSelect.value;
        if (val.startsWith("CUST_")) {
          const custId = val.replace("CUST_", "");
          const foundCust = customTemplatesList.find(x => x.id === custId);
          if (foundCust) {
            clauses = JSON.parse(JSON.stringify(foundCust.klausul || []));
            titleInput.value = foundCust.judul || foundCust.nama_template;
            renderClausesUI();
            toast(`Master template "${foundCust.nama_template}" berhasil dimuat!`, "info");
          }
        } else if (val === "NEW_CUSTOM") {
          clauses = [{
            judul: "Pasal 1: Ketentuan Khusus",
            isi: "Isi ketentuan atau klausul dokumen kustom di sini dengan tag placeholder seperti {NAMA_KARYAWAN}, {JABATAN}, {LOKASI_PENUGASAN}."
          }];
          titleInput.value = "SURAT KETENTUAN KUSTOM HRD";
          renderClausesUI();
        } else if (DEFAULT_CLAUSES[val]) {
          clauses = JSON.parse(JSON.stringify(DEFAULT_CLAUSES[val]));
          if (val === "KONTRAK_PKWT") titleInput.value = "PERJANJIAN KERJA WAKTU TERTENTU (PKWT)";
          else if (val === "KONTRAK_PKWTT") titleInput.value = "PERJANJIAN KERJA WAKTU TIDAK TERTENTU (PKWTT)";
          else if (val.startsWith("SP")) titleInput.value = `SURAT PERINGATAN ${val.replace('_', ' ')}`;
          else if (val === "PEMANGGILAN") titleInput.value = "SURAT PEMANGGILAN KONSILING KEDISIPLINAN";
          else if (val === "KETERANGAN_KERJA") titleInput.value = "SURAT KETERANGAN KERJA (PAKLARING)";
          else if (val === "SURAT_TUGAS") titleInput.value = "SURAT PENUGASAN DINAS RESMI";
          renderClausesUI();
        }
      };

      m.querySelector("#btn-reset-clauses").onclick = () => {
        const val = typeSelect.value;
        if (DEFAULT_CLAUSES[val]) {
          clauses = JSON.parse(JSON.stringify(DEFAULT_CLAUSES[val]));
          renderClausesUI();
          toast("Klausul di-reset ke template standar!", "info");
        }
      };

      m.querySelector("#btn-add-clause").onclick = () => {
        clauses.push({
          judul: `Pasal ${clauses.length + 1}: Klausul Tambahan Khusus`,
          isi: "Isi klausul atau ketentuan khusus sesuai kesepakatan tertulis."
        });
        renderClausesUI();
      };

      // Save as Master Template
      m.querySelector("#btn-save-as-template").onclick = () => {
        const currentTitle = titleInput.value.trim() || "Template Kustom Baru";
        openMasterTemplateEditorModal({
          nama_template: currentTitle,
          judul: currentTitle,
          klausul: clauses
        }, () => {
          toast("Master template berhasil disimpan!", "success");
        });
      };

      renderClausesUI();

      m.querySelector("#btn-doc-cancel").onclick = closeModal;

      async function saveDocumentProcess(isPublish = false) {
        const targetNik = m.querySelector("#doc-target-karyawan").value;
        const targetKaryawanData = masterKaryawan.find(k => (k.nik_karyawan || k.nik) === targetNik);

        if (!targetNik || !targetKaryawanData) {
          return toast("Silakan pilih karyawan target terlebih dahulu!", "warning");
        }

        const templateType = typeSelect.value;
        const judul = titleInput.value.trim() || "DOKUMEN HRD";
        const nomorSurat = m.querySelector("#doc-number").value.trim();
        const tglSurat = m.querySelector("#doc-date").value;
        const tglMulai = m.querySelector("#doc-date-start").value;
        const tglSelesai = m.querySelector("#doc-date-end").value;
        const extraNote = m.querySelector("#doc-extra-note").value.trim();

        let tipeKat = "KONTRAK";
        if (templateType.startsWith("SP")) tipeKat = "SP";
        if (templateType === "PEMANGGILAN") tipeKat = "PEMANGGILAN";
        if (templateType === "KETERANGAN_KERJA") tipeKat = "KETERANGAN_KERJA";
        if (templateType === "SURAT_TUGAS") tipeKat = "SURAT_TUGAS";

        const docId = existingData?.id || genId("DOCDRAFT");

        const payload = {
          id: docId,
          template_type: templateType,
          tipe_kategori: tipeKat,
          judul,
          nomor_surat: nomorSurat,
          tanggal_surat: tglSurat,
          tanggal_mulai: tglMulai,
          tanggal_selesai: tglSelesai,
          alasan_sp: extraNote,
          gaji_pokok: extraNote,
          nik_karyawan: targetNik,
          nama_karyawan: targetKaryawanData.nama_karyawan || targetKaryawanData.nama,
          jabatan: targetKaryawanData.jabatan || "-",
          divisi: targetKaryawanData.divisi || "-",
          cabang: targetKaryawanData.cabang || "-",
          alamat: targetKaryawanData.alamat || targetKaryawanData.alamat_domisili || "-",
          no_ktp: targetKaryawanData.no_ktp || targetKaryawanData.nik || "-",
          no_rekening: targetKaryawanData.no_rekening || "-",
          custom_fields: customFieldsValues,
          klausul: clauses,
          status: isPublish ? "PUBLISHED" : (existingData?.status || "DRAFT"),
          updated_at: new Date().toISOString(),
          created_at: existingData?.created_at || new Date().toISOString(),
          created_by: session.nama
        };

        try {
          if (existingData) {
            await fsUpdate("drafts_dokumen", docId, payload);
          } else {
            await fsAdd("drafts_dokumen", payload, docId);
          }

          if (isPublish) {
            await fsAdd("sign_documents", {
              id: docId,
              judul: `${judul} (${nomorSurat})`,
              nik_penerima: targetNik,
              nama_penerima: targetKaryawanData.nama_karyawan || targetKaryawanData.nama,
              tanggal_buat: tglSurat,
              status: "PENDING",
              file_url: "#"
            }, docId);

            const userList = await fsGetAll(COL.USERS).catch(() => []);
            const targetUser = userList.find(u => u.nik === targetNik || u.nama === (targetKaryawanData.nama_karyawan || targetKaryawanData.nama));
            if (targetUser) {
              await notifyUser(
                targetUser.username,
                `📄 [Dokumen HRD Baru] ${judul}`,
                `HRD telah menerbitkan ${judul} (${nomorSurat}) untuk Anda. Buka profil Anda untuk membaca & menandatangani secara digital.`,
                `#profile?tab=documents&doc_id=${docId}`
              );
            }
          }

          toast(`Draft dokumen berhasil ${isPublish ? 'dirilis ke karyawan' : 'disimpan'}!`, "success");
          closeModal();
          if (onDone) onDone();
        } catch (e) {
          toast("Gagal menyimpan dokumen: " + e.message, "error");
        }
      }

      m.querySelector("#btn-doc-save-draft").onclick = () => saveDocumentProcess(false);
      m.querySelector("#btn-doc-save-publish").onclick = () => saveDocumentProcess(true);
    }
  });
}

// ----------------------------------------------------------------------
// MASTER TEMPLATE EDITOR MODAL
// ----------------------------------------------------------------------
function openMasterTemplateEditorModal(existingTemplate, onSaveDone) {
  let clauses = existingTemplate?.klausul ? [...existingTemplate.klausul] : [
    { judul: "Pasal 1: Maksud dan Tujuan", isi: "Isi klausul template dengan tag placeholder seperti {NAMA_KARYAWAN}, {NIK}, {JABATAN}." }
  ];

  openModal({
    title: existingTemplate ? "Edit Master Template Kustom" : "Buat Master Template Kustom Baru",
    size: "lg",
    bodyHtml: `
      <div class="space-y-4 text-left text-xs">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1 uppercase">Nama Template</label>
            <input type="text" id="tpl-name" value="${escapeHtml(existingTemplate?.nama_template || '')}" placeholder="Cth: Surat Keterangan Kerja (Paklaring)" class="w-full p-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 font-bold">
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1 uppercase">Kategori Dokumen</label>
            <select id="tpl-category" class="w-full p-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 font-semibold bg-white">
              <option value="KONTRAK" ${existingTemplate?.tipe_kategori === 'KONTRAK' ? 'selected' : ''}>Kontrak Kerja</option>
              <option value="SP" ${existingTemplate?.tipe_kategori === 'SP' ? 'selected' : ''}>Surat Peringatan</option>
              <option value="KETERANGAN" ${existingTemplate?.tipe_kategori === 'KETERANGAN' ? 'selected' : ''}>Surat Keterangan / Paklaring</option>
              <option value="PENUGASAN" ${existingTemplate?.tipe_kategori === 'PENUGASAN' ? 'selected' : ''}>Surat Penugasan / Mutasi</option>
              <option value="KUSTOM" ${existingTemplate?.tipe_kategori === 'KUSTOM' ? 'selected' : ''}>Dokumen Kustom Lainnya</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1 uppercase">Deskripsi Ringkas</label>
          <input type="text" id="tpl-desc" value="${escapeHtml(existingTemplate?.deskripsi || '')}" placeholder="Penjelasan kapan template ini digunakan..." class="w-full p-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500">
        </div>

        <div class="border-t border-slate-200 pt-3 space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="font-extrabold text-slate-800 text-xs uppercase">Struktur Klausul / Pasal Master</h4>
            <button id="btn-tpl-add-clause" class="px-3 py-1 bg-maroon-700 text-white rounded-lg font-bold text-xs">➕ Tambah Pasal</button>
          </div>

          <div id="tpl-clauses-box" class="space-y-2 max-h-72 overflow-y-auto">
            <!-- populated by JS -->
          </div>
        </div>
      </div>`,
    footerHtml: `
      <div class="flex items-center justify-between w-full">
        <button id="btn-tpl-cancel" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
        <button id="btn-tpl-save" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl shadow">Simpan Master Template</button>
      </div>`,
    onMount: m => {
      const box = m.querySelector("#tpl-clauses-box");

      function renderTplClauses() {
        box.innerHTML = clauses.map((c, i) => `
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between gap-2">
              <input type="text" data-tpl-title="${i}" value="${escapeHtml(c.judul)}" class="w-full text-xs font-bold text-slate-800 border-b border-slate-200 focus:border-maroon-500 outline-none pb-0.5" placeholder="Judul Pasal...">
              <button data-tpl-del="${i}" class="p-1 text-rose-500 hover:bg-rose-100 rounded text-xs">🗑️</button>
            </div>
            <textarea data-tpl-body="${i}" rows="3" class="w-full p-2 text-xs text-slate-700 border border-slate-200 rounded-lg outline-none focus:border-maroon-400 bg-white">${escapeHtml(c.isi)}</textarea>
          </div>
        `).join("");

        box.querySelectorAll("[data-tpl-title]").forEach(el => {
          el.oninput = () => { clauses[parseInt(el.dataset.tplTitle)].judul = el.value; };
        });
        box.querySelectorAll("[data-tpl-body]").forEach(el => {
          el.oninput = () => { clauses[parseInt(el.dataset.tplBody)].isi = el.value; };
        });
        box.querySelectorAll("[data-tpl-del]").forEach(btn => {
          btn.onclick = () => {
            clauses.splice(parseInt(btn.dataset.tplDel), 1);
            renderTplClauses();
          };
        });
      }

      m.querySelector("#btn-tpl-add-clause").onclick = () => {
        clauses.push({ judul: `Pasal ${clauses.length + 1}: Ketentuan Khusus`, isi: "Isi klausul template..." });
        renderTplClauses();
      };

      renderTplClauses();

      m.querySelector("#btn-tpl-cancel").onclick = closeModal;

      m.querySelector("#btn-tpl-save").onclick = async () => {
        const nameStr = m.querySelector("#tpl-name").value.trim();
        const catStr = m.querySelector("#tpl-category").value;
        const descStr = m.querySelector("#tpl-desc").value.trim();

        if (!nameStr) return toast("Nama master template wajib diisi!", "warning");
        if (clauses.length === 0) return toast("Sertakan minimal 1 klausul/pasal!", "warning");

        const tplId = existingTemplate?.id || genId("TPL");
        const payload = {
          id: tplId,
          nama_template: nameStr,
          judul: nameStr.toUpperCase(),
          tipe_kategori: catStr,
          deskripsi: descStr,
          klausul: clauses,
          created_at: existingTemplate?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        try {
          if (existingTemplate) {
            await fsUpdate("custom_doc_templates", tplId, payload);
          } else {
            await fsAdd("custom_doc_templates", payload, tplId);
          }
          toast("Master template kustom berhasil disimpan!", "success");
          closeModal();
          if (onSaveDone) onSaveDone();
        } catch (e) {
          toast("Gagal menyimpan template: " + e.message, "error");
        }
      };
    }
  });
}

// ----------------------------------------------------------------------
// PREVIEW & PRINT PDF MODAL
// ----------------------------------------------------------------------
function previewDocumentModal(docData) {
  if (!docData) return;

  const replaceVars = (str) => {
    if (!str) return "";
    let res = str;

    if (docData.custom_fields && typeof docData.custom_fields === "object") {
      for (const [k, v] of Object.entries(docData.custom_fields)) {
        res = res.replaceAll(`{${k}}`, v || "-");
      }
    }

    res = res
      .replaceAll("{NAMA_KARYAWAN}", docData.nama_karyawan || "-")
      .replaceAll("{NIK}", docData.nik_karyawan || "-")
      .replaceAll("{JABATAN}", docData.jabatan || "-")
      .replaceAll("{DIVISI}", docData.divisi || "-")
      .replaceAll("{CABANG}", docData.cabang || "-")
      .replaceAll("{ALAMAT}", docData.alamat || docData.custom_fields?.ALAMAT || "-")
      .replaceAll("{NO_KTP}", docData.no_ktp || docData.custom_fields?.NO_KTP || "-")
      .replaceAll("{NO_REKENING}", docData.no_rekening || docData.custom_fields?.NO_REKENING || "-")
      .replaceAll("{TANGGAL_SURAT}", fmtDate(docData.tanggal_surat))
      .replaceAll("{TANGGAL_MULAI}", fmtDate(docData.tanggal_mulai))
      .replaceAll("{TANGGAL_SELESAI}", docData.tanggal_selesai ? fmtDate(docData.tanggal_selesai) : "-")
      .replaceAll("{ALASAN_SP}", docData.alasan_sp || "-")
      .replaceAll("{GAJI_POKOK}", docData.gaji_pokok || "Sesuai Standar UMR/Perusahaan")
      .replaceAll("{NOMOR_SURAT}", docData.nomor_surat || "-");

    res = res.replace(/\{([A-Z0-9_]+)\}/g, (match, p1) => {
      if (docData[p1.toLowerCase()] !== undefined) return docData[p1.toLowerCase()];
      return match;
    });

    return res;
  };

  openModal({
    title: "Preview & Cetak Dokumen Resmi",
    size: "lg",
    bodyHtml: `
      <div id="print-doc-area" class="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-slate-900 font-serif leading-relaxed text-sm space-y-6 max-h-[70vh] overflow-y-auto">
        <!-- KOP SURAT ANDELA JAYA -->
        <div class="border-b-4 border-slate-900 pb-4 flex items-center justify-between text-left font-sans">
          <div>
            <h2 class="text-xl font-black text-maroon-800 tracking-wider">CV. ANDELA JAYA</h2>
            <p class="text-xs text-slate-600 font-medium mt-0.5">Produsen & Distributor Makanan Berkualitas • Wilayah Jawa Barat</p>
            <p class="text-[10px] text-slate-500">Jl. Industri Raya No. 88, Sumedang - Jawa Barat | Telp: (022) 8765-4321</p>
          </div>
          <div class="text-right">
            <span class="px-3 py-1 bg-maroon-50 border border-maroon-200 text-maroon-800 font-bold text-xs rounded-lg uppercase">Dokumen Resmi HRD</span>
          </div>
        </div>

        <!-- TITLE & NUMBER -->
        <div class="text-center space-y-1 font-sans">
          <h3 class="text-base font-extrabold text-slate-900 uppercase underline tracking-wide">${escapeHtml(docData.judul)}</h3>
          <p class="text-xs text-slate-600 font-bold font-mono">Nomor: ${escapeHtml(docData.nomor_surat)}</p>
        </div>

        <!-- IDENTITAS PARA PIHAK -->
        <div class="space-y-3 font-sans text-xs">
          <p>Pada hari ini, <b>${fmtDate(docData.tanggal_surat)}</b>, bertempat di kantor CV Andela Jaya cabang <b>${escapeHtml(docData.cabang || "Pusat")}</b>, disepakati oleh dan antara para pihak:</p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <p class="font-bold text-slate-800 uppercase border-b border-slate-200 pb-1 mb-2">Pihak Pertama (Perusahaan):</p>
              <p><b>Nama:</b> CV. ANDELA JAYA</p>
              <p><b>Diwakili Oleh:</b> ${escapeHtml(docData.created_by || "Tim HRD")}</p>
              <p><b>Jabatan:</b> Human Resource Department</p>
            </div>
            <div>
              <p class="font-bold text-slate-800 uppercase border-b border-slate-200 pb-1 mb-2">Pihak Kedua (Karyawan):</p>
              <p><b>Nama Lengkap:</b> ${escapeHtml(docData.nama_karyawan)}</p>
              <p><b>NIK Karyawan:</b> ${escapeHtml(docData.nik_karyawan)}</p>
              <p><b>Jabatan:</b> ${escapeHtml(docData.jabatan)} (${escapeHtml(docData.divisi)})</p>
            </div>
          </div>
        </div>

        <!-- KLAUSUL PASAL-PASAL -->
        <div class="space-y-4 font-sans text-xs pt-2">
          ${(docData.klausul || []).map(c => `
            <div class="space-y-1">
              <h4 class="font-bold text-slate-900 uppercase">${escapeHtml(c.judul)}</h4>
              <p class="text-slate-700 leading-relaxed text-justify pl-3 border-l-2 border-slate-300">${escapeHtml(replaceVars(c.isi))}</p>
            </div>
          `).join("")}
        </div>

        <!-- TANDA TANGAN SECTION -->
        <div class="grid grid-cols-2 gap-8 text-center font-sans text-xs pt-8 border-t border-slate-200">
          <div>
            <p class="text-slate-500 font-bold uppercase mb-16">Pihak Pertama (HRD),</p>
            <p class="font-bold text-slate-900 underline">${escapeHtml(docData.created_by || "HRD Manager")}</p>
            <p class="text-[10px] text-slate-500">CV. ANDELA JAYA</p>
          </div>
          <div>
            <p class="text-slate-500 font-bold uppercase mb-16">Pihak Kedua (Karyawan),</p>
            ${docData.tanda_tangan_url ? `
              <div class="my-2">
                <img src="${docData.tanda_tangan_url}" class="h-12 w-auto mx-auto border border-slate-200 p-0.5 rounded">
                <p class="text-[9px] text-emerald-600 font-bold">✔ TTD DIGITAL SAH (${fmtDateShort(docData.tanggal_ttd)})</p>
              </div>
            ` : ''}
            <p class="font-bold text-slate-900 underline">${escapeHtml(docData.nama_karyawan)}</p>
            <p class="text-[10px] text-slate-500">NIK: ${escapeHtml(docData.nik_karyawan)}</p>
          </div>
        </div>
      </div>`,
    footerHtml: `
      <div class="flex items-center justify-between w-full flex-wrap gap-2">
        <button id="btn-preview-close" class="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition">Tutup</button>
        <div class="flex items-center gap-2 flex-wrap">
          <button id="btn-copy-gdoc-text" class="px-3.5 py-2 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition flex items-center gap-1.5 shadow-sm">
            📋 Salin Teks Dokumen
          </button>
          <button id="btn-preview-print" class="px-4 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
            🖨️ Cetak / Simpan PDF
          </button>
        </div>
      </div>`,
    onMount: m => {
      m.querySelector("#btn-preview-close").onclick = closeModal;

      m.querySelector("#btn-copy-gdoc-text").onclick = () => {
        const area = m.querySelector("#print-doc-area");
        if (!area) return;
        const textContent = area.innerText;
        navigator.clipboard.writeText(textContent);
        toast("Teks dokumen resmi dengan placeholder terisi berhasil disalin!", "success");
      };

      m.querySelector("#btn-preview-print").onclick = () => {
        const printContent = m.querySelector("#print-doc-area").innerHTML;
        const win = window.open('', '_blank');
        win.document.write(`
          <html>
            <head>
              <title>${docData.judul} - ${docData.nama_karyawan}</title>
              <script src="https://cdn.tailwindcss.com"></script>
              <style>
                body { padding: 20px; font-family: serif; }
                @media print { body { padding: 0; } }
              </style>
            </head>
            <body>
              ${printContent}
              <script>
                setTimeout(() => { window.print(); window.close(); }, 800);
              </script>
            </body>
          </html>
        `);
      };
    }
  });
}

// ----------------------------------------------------------------------
// GOOGLE DOC TEMPLATE & PLACEHOLDER MANAGER MODAL
// ----------------------------------------------------------------------
async function openGDocTemplateModal(session) {
  let gdocConfigs = {};
  try {
    const list = await fsGetAll("gdoc_templates").catch(() => []);
    list.forEach(item => { gdocConfigs[item.id] = item.url; });
  } catch (e) {
    console.warn("GDoc config load err:", e);
  }

  const defaultTemplates = {
    KONTRAK_PKWT: gdocConfigs.KONTRAK_PKWT || "https://docs.google.com/document/d/1_PKWT_TEMPLATE/edit",
    KONTRAK_PKWTT: gdocConfigs.KONTRAK_PKWTT || "https://docs.google.com/document/d/1_PKWTT_TEMPLATE/edit",
    SP_1: gdocConfigs.SP_1 || "https://docs.google.com/document/d/1_SP1_TEMPLATE/edit",
    SP_2: gdocConfigs.SP_2 || "https://docs.google.com/document/d/1_SP2_TEMPLATE/edit",
    SP_3: gdocConfigs.SP_3 || "https://docs.google.com/document/d/1_SP3_TEMPLATE/edit",
    PEMANGGILAN: gdocConfigs.PEMANGGILAN || "https://docs.google.com/document/d/1_PEMANGGILAN_TEMPLATE/edit"
  };

  openModal({
    title: "Template Google Doc & Daftar Placeholder Resmi",
    size: "lg",
    bodyHtml: `
      <div class="space-y-6 text-left text-xs">
        <div class="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl leading-relaxed text-blue-900">
          <p class="font-bold text-sm mb-1">Pengaturan Template Google Doc Perusahaan</p>
          <p>Anda dapat memasukkan tautan **Google Doc resmi perusahaan** untuk masing-masing jenis surat/dokumen di bawah ini. Ketika HRD atau sistem membuat dokumen, placeholder seperti <code class="bg-blue-100 px-1 py-0.5 rounded font-mono font-bold text-blue-900">{NAMA_KARYAWAN}</code> akan otomatis diganti dengan data asli karyawan target.</p>
        </div>

        <!-- CONFIG FORM FOR TEMPLATE URLS -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
          <h4 class="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
            Tautan Master Google Doc Perusahaan
          </h4>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Kontrak Kerja PKWT</label>
              <input type="url" id="gdoc-url-PKWT" value="${escapeHtml(defaultTemplates.KONTRAK_PKWT)}" placeholder="https://docs.google.com/document/d/..." class="w-full p-2 text-xs rounded-xl border border-slate-200 font-mono outline-none focus:border-maroon-500 bg-white">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Kontrak Kerja PKWTT (Tetap)</label>
              <input type="url" id="gdoc-url-PKWTT" value="${escapeHtml(defaultTemplates.KONTRAK_PKWTT)}" placeholder="https://docs.google.com/document/d/..." class="w-full p-2 text-xs rounded-xl border border-slate-200 font-mono outline-none focus:border-maroon-500 bg-white">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Surat Peringatan 1 (SP-1)</label>
              <input type="url" id="gdoc-url-SP1" value="${escapeHtml(defaultTemplates.SP_1)}" placeholder="https://docs.google.com/document/d/..." class="w-full p-2 text-xs rounded-xl border border-slate-200 font-mono outline-none focus:border-maroon-500 bg-white">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Surat Peringatan 2 (SP-2)</label>
              <input type="url" id="gdoc-url-SP2" value="${escapeHtml(defaultTemplates.SP_2)}" placeholder="https://docs.google.com/document/d/..." class="w-full p-2 text-xs rounded-xl border border-slate-200 font-mono outline-none focus:border-maroon-500 bg-white">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Surat Peringatan 3 (SP-3)</label>
              <input type="url" id="gdoc-url-SP3" value="${escapeHtml(defaultTemplates.SP_3)}" placeholder="https://docs.google.com/document/d/..." class="w-full p-2 text-xs rounded-xl border border-slate-200 font-mono outline-none focus:border-maroon-500 bg-white">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Surat Pemanggilan & Konseling</label>
              <input type="url" id="gdoc-url-PEMANGGILAN" value="${escapeHtml(defaultTemplates.PEMANGGILAN)}" placeholder="https://docs.google.com/document/d/..." class="w-full p-2 text-xs rounded-xl border border-slate-200 font-mono outline-none focus:border-maroon-500 bg-white">
            </div>
          </div>
        </div>

        <!-- PLACEHOLDERS CHEATSHEET -->
        <div class="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              Daftar Placeholder Yang Didukung
            </h4>
            <span class="text-[10px] text-slate-400">Klik tag untuk menyalin</span>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            ${[
              { tag: "{NAMA_KARYAWAN}", label: "Nama Lengkap Karyawan" },
              { tag: "{NIK}", label: "Nomor Induk Karyawan" },
              { tag: "{JABATAN}", label: "Jabatan / Posisi Kerja" },
              { tag: "{CABANG}", label: "Lokasi Cabang / Penempatan" },
              { tag: "{DIVISI}", label: "Divisi / Departemen" },
              { tag: "{ALAMAT}", label: "Alamat Tempat Tinggal" },
              { tag: "{NO_KTP}", label: "Nomor KTP Karyawan" },
              { tag: "{NO_REKENING}", label: "Nomor Rekening Bank" },
              { tag: "{TANGGAL_SURAT}", label: "Tanggal Terbit Surat" },
              { tag: "{TANGGAL_MULAI}", label: "Tanggal Mulai Kontrak/Sanksi" },
              { tag: "{TANGGAL_SELESAI}", label: "Tanggal Berakhir Kontrak" },
              { tag: "{GAJI_POKOK}", label: "Gaji Pokok / Imbalan Kerja" },
              { tag: "{ALASAN_SP}", label: "Pelanggaran / Perihal Surat" },
              { tag: "{NOMOR_SURAT}", label: "Nomor Registrasi Surat" },
              { tag: "{LOKASI_PENUGASAN}", label: "Lokasi Dinas / Mutasi" }
            ].map(p => `
              <button class="btn-copy-placeholder flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50 hover:bg-maroon-50 hover:border-maroon-200 transition text-left group" data-tag="${p.tag}">
                <div>
                  <code class="font-mono font-bold text-maroon-700 text-[11px] block">${p.tag}</code>
                  <span class="text-[10px] text-slate-500 block truncate">${p.label}</span>
                </div>
                <span class="text-[10px] text-slate-400 group-hover:text-maroon-700 font-bold opacity-0 group-hover:opacity-100 transition">Copy</span>
              </button>
            `).join("")}
          </div>
        </div>
      </div>`,
    footerHtml: `
      <div class="flex items-center justify-between w-full">
        <button id="btn-gdoc-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition">Batal</button>
        <button id="btn-gdoc-save" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow">Simpan Konfigurasi Template</button>
      </div>`,
    onMount: m => {
      m.querySelector("#btn-gdoc-close").onclick = closeModal;

      m.querySelectorAll(".btn-copy-placeholder").forEach(btn => {
        btn.onclick = () => {
          const tag = btn.dataset.tag;
          navigator.clipboard.writeText(tag);
          toast(`Placeholder ${tag} berhasil disalin ke clipboard!`, "info");
        };
      });

      m.querySelector("#btn-gdoc-save").onclick = async () => {
        const payload = {
          KONTRAK_PKWT: m.querySelector("#gdoc-url-PKWT").value.trim(),
          KONTRAK_PKWTT: m.querySelector("#gdoc-url-PKWTT").value.trim(),
          SP_1: m.querySelector("#gdoc-url-SP1").value.trim(),
          SP_2: m.querySelector("#gdoc-url-SP2").value.trim(),
          SP_3: m.querySelector("#gdoc-url-SP3").value.trim(),
          PEMANGGILAN: m.querySelector("#gdoc-url-PEMANGGILAN").value.trim()
        };

        try {
          for (const [key, val] of Object.entries(payload)) {
            await fsAdd("gdoc_templates", { id: key, url: val, updated_at: new Date().toISOString() }, key);
          }
          toast("Konfigurasi Template Google Doc berhasil disimpan!", "success");
          closeModal();
        } catch (e) {
          toast("Gagal menyimpan konfigurasi: " + e.message, "error");
        }
      };
    }
  });
}

async function publishAndSendToEmployee(docData, session, onDone) {
  if (!confirm(`Apakah Anda yakin ingin merilis dokumen "${docData.judul}" dan mengirimkannya ke karyawan ${docData.nama_karyawan}?`)) return;

  try {
    await fsUpdate("drafts_dokumen", docData.id, {
      status: "PUBLISHED",
      updated_at: new Date().toISOString()
    });

    await fsAdd("sign_documents", {
      id: docData.id,
      judul: `${docData.judul} (${docData.nomor_surat})`,
      nik_penerima: docData.nik_karyawan,
      nama_penerima: docData.nama_karyawan,
      tanggal_buat: docData.tanggal_surat,
      status: "PENDING",
      file_url: "#"
    }, docData.id);

    const userList = await fsGetAll(COL.USERS).catch(() => []);
    const targetUser = userList.find(u => u.nik === docData.nik_karyawan || u.nama === docData.nama_karyawan);
    if (targetUser) {
      await notifyUser(
        targetUser.username,
        `📄 [Dokumen HRD Baru] ${docData.judul}`,
        `HRD telah menerbitkan ${docData.judul} (${docData.nomor_surat}) untuk Anda. Buka profil Anda untuk membaca & menandatangani secara digital.`,
        `#profile?tab=documents&doc_id=${docData.id}`
      );
    }

    toast("Dokumen berhasil dirilis & notifikasi terkirim ke karyawan!", "success");
    if (onDone) onDone();
  } catch (e) {
    toast("Gagal merilis dokumen: " + e.message, "error");
  }
}
