import { db, COL, collection, query, where, getDocs, limit } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, toast, genId, fmtDateShort, escapeHtml, sendEmailNotif, createLoginToken } from "../utils.js";
import { renderCrudModule, badge, emptyState, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  const panels = {
    kontrak: container.querySelector("#pk-panel-kontrak"),
    kpi360: container.querySelector("#pk-panel-kpi360"),
    hasil: container.querySelector("#pk-panel-hasil"),
    evaluasi: container.querySelector("#pk-panel-evaluasi"),
    template: container.querySelector("#pk-panel-template"),
  };
  const loaded = {};

  async function loadKontrak() {
    await renderCrudModule(panels.kontrak, {
      title: "Kontrak Kerja Karyawan",
      subtitle: "Pantau masa berlaku ikatan dinas & status kontrak.",
      collectionName: COL.MASTER_KONTRAK,
      idPrefix: "KTR",
      searchFields: ["nama_karyawan", "jabatan", "cabang"],
      columns: [
        { key: "nama_karyawan", label: "Karyawan" },
        { key: "jabatan", label: "Jabatan" },
        { key: "kontrak_ke", label: "Kontrak Ke", type: "number" },
        { key: "tanggal_mulai", label: "Mulai", type: "date" },
        { key: "tanggal_akhir", label: "Berakhir", type: "date" },
        { key: "status_kolom_kontrak", label: "Status", type: "badge" },
      ],
      formFields: [
        { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "cabang", label: "Cabang", type: "text" },
        { name: "jabatan", label: "Jabatan", type: "text" },
        { name: "divisi", label: "Divisi", type: "text" },
        { name: "kontrak_ke", label: "Kontrak Ke-", type: "number", default: 1 },
        { name: "tanggal_mulai", label: "Tanggal Mulai", type: "date", required: true },
        { name: "tanggal_akhir", label: "Tanggal Akhir", type: "date", required: true },
        { name: "status_kolom_kontrak", label: "Status Kontrak", type: "select", options: ["AKTIF", "SEGERA HABIS", "DONE", "DIPERPANJANG"], default: "AKTIF" },
        { name: "link_dokumen", label: "Link Dokumen", type: "text", full: true },
      ]
    });
  }

  // ==========================================
  // MODUL MANAJEMEN TEMPLATE KPI (DENGAN FITUR IMPORT EXCEL)
  // ==========================================
  async function loadTemplateKpi() {
    const wrap = panels.template;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;

    const templates = await fsGetAll(COL.MASTER_SOAL_KPI);

    let html = `
        <div class="mb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
             <h2 class="text-xl font-semibold text-slate-800">Master Template KPI</h2>
             <p class="text-sm text-slate-500">Buat set indikator penilaian (Contoh: Template Sales, Admin) untuk digunakan berulang kali.</p>
          </div>
          <div class="flex gap-2">
             <!-- Input File Tersembunyi -->
             <input type="file" id="kpi-excel-upload" accept=".xlsx, .xls" class="hidden">
             
             <!-- Tombol Import Excel -->
             <button id="btn-import-template" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
               Import Excel
             </button>
             
             <!-- Tombol Buat Manual -->
             <button id="btn-add-template" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
               Buat Manual
             </button>
          </div>
        </div>
    `;

    if (!templates.length) {
        html += emptyState("Belum ada Template Soal KPI", "Klik tombol Import Excel atau Buat Manual di atas.");
    } else {
        html += `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr><th class="px-4 py-3 text-left">Nama Template / Jabatan</th><th class="px-4 py-3 text-center">Jml Indikator</th><th class="px-4 py-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              ${templates.map(t => {
                const isLegacy = !t.nama_template || !t.soal_json;
                const nama = t.nama_template || "Data Migrasi Lama (Tanpa Nama)";
                const count = isLegacy ? "-" : (t.soal_json || []).length;
                return `
                <tr class="border-t border-slate-50 hover:bg-slate-50 transition">
                  <td class="px-4 py-3 font-medium ${isLegacy ? 'text-red-500' : 'text-slate-700'}">
                     ${escapeHtml(nama)}
                     ${isLegacy ? '<span class="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Format Lama (Hapus)</span>' : ''}
                  </td>
                  <td class="px-4 py-3 text-center">${count} Indikator</td>
                  <td class="px-4 py-3 text-right">
                    ${!isLegacy ? `<button data-edit-tpl="${t.id}" class="text-maroon-700 hover:underline mr-3 font-medium text-xs">Edit</button>` : ''}
                    <button data-del-tpl="${t.id}" class="text-red-500 hover:underline font-medium text-xs">Hapus</button>
                  </td>
                </tr>
              `}).join("")}
            </tbody>
          </table>
        </div>`;
    }
    wrap.innerHTML = html;

    // EVENT LISTENER IMPORT EXCEL
    const btnImport = wrap.querySelector("#btn-import-template");
    const inputExcel = wrap.querySelector("#kpi-excel-upload");
    
    if (btnImport && inputExcel) {
       btnImport.onclick = () => inputExcel.click();
       inputExcel.onchange = (e) => handleExcelImport(e.target.files[0]);
    }

    const btnAdd = wrap.querySelector("#btn-add-template");
    if(btnAdd) btnAdd.onclick = () => openTemplateModal();

    wrap.querySelectorAll("[data-edit-tpl]").forEach(btn => {
        btn.onclick = () => {
            const t = templates.find(x => x.id === btn.dataset.editTpl);
            openTemplateModal(t);
        }
    });
    wrap.querySelectorAll("[data-del-tpl]").forEach(btn => {
        btn.onclick = async () => {
            if(confirm("Apakah Anda yakin ingin menghapus data ini?")) {
                await fsDelete(COL.MASTER_SOAL_KPI, btn.dataset.delTpl);
                toast("Template berhasil dihapus", "success");
                loadTemplateKpi();
            }
        }
    });
  }

  // LOGIKA PEMBACAAN EXCEL KE JSON
  async function handleExcelImport(file) {
    if (!file) return;
    
    // Pastikan library SheetJS sudah ter-load dari app.html
    if (typeof window.XLSX === "undefined") {
        toast("Sistem sedang memuat library Excel. Silakan tunggu beberapa detik dan coba lagi.", "warning");
        return;
    }

    const btn = panels.template.querySelector("#btn-import-template");
    btn.innerHTML = `Membaca File...`;
    btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = window.XLSX.read(data, {type: 'array'});
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Konversi Excel ke Array of Objects
            const rows = window.XLSX.utils.sheet_to_json(worksheet, {raw: false});
            const groupedTemplates = {};

            rows.forEach(row => {
                // Pencari nama kolom yang fleksibel (mengatasi huruf besar/kecil/spasi)
                const getVal = (keys) => {
                    for(let k of Object.keys(row)) {
                        if(keys.some(x => k.toUpperCase().includes(x))) return row[k];
                    }
                    return "";
                };

                const jabatan = getVal(["JABATAN", "POSISI"]);
                const aspek = getVal(["ASPEK"]);
                const indikator = getVal(["INDIKATOR", "PERTANYAAN"]);
                // Tangkap kolom bobot (bisa bernama BOBOT, BOB, dll)
                const bobot = parseFloat(getVal(["BOBOT", "BOB"])) || 0;

                if (!jabatan || !indikator) return; // Abaikan baris kosong

                // Buat grup baru berdasarkan JABATAN
                if (!groupedTemplates[jabatan]) {
                    groupedTemplates[jabatan] = {
                        nama_template: jabatan,
                        soal_json: []
                    };
                }

                // Masukkan indikator ke dalam grup jabatan tersebut
                groupedTemplates[jabatan].soal_json.push({
                    aspek: aspek || "Umum",
                    indikator: indikator,
                    bobot: bobot,
                    nilai_diberikan: 0
                });
            });

            const templateNames = Object.keys(groupedTemplates);
            if (templateNames.length === 0) {
                throw new Error("Format Excel tidak sesuai. Pastikan ada kolom JABATAN, ASPEK, INDIKATOR, dan BOBOT.");
            }

            btn.innerHTML = `Menyimpan ke Database...`;

            // Simpan setiap Template (Jabatan) ke Firestore
            for (const name of templateNames) {
                let totalB = groupedTemplates[name].soal_json.reduce((acc, curr) => acc + curr.bobot, 0);
                if(totalB !== 100) {
                    console.warn(`Peringatan: Template ${name} total bobotnya ${totalB}% (Bukan 100%)`);
                }
                await fsAdd(COL.MASTER_SOAL_KPI, groupedTemplates[name], genId("TPL-KPI"));
            }

            toast(`Berhasil meng-import ${templateNames.length} Template Jabatan dari Excel!`, "success");
            
            // Segarkan UI
            loadTemplateKpi();

        } catch(err) {
            toast("Gagal memproses Excel: " + err.message, "error");
            btn.innerHTML = `Import Excel`;
            btn.disabled = false;
        }
    };
    reader.readAsArrayBuffer(file);
  }

  function openTemplateModal(existingData = null) {
    openModal({
        title: existingData ? "Edit Template KPI" : "Buat Template KPI Baru",
        size: "lg",
        bodyHtml: `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-medium text-slate-500 mb-1.5">Nama Template (Cth: Template KPI Sales Staff)</label>
                    <input type="text" id="tpl-nama" value="${existingData ? escapeHtml(existingData.nama_template) : ''}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
                </div>
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div class="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                       <label class="text-xs font-bold text-slate-700 uppercase tracking-wide">Rancang Indikator & Bobot (Wajib Total 100%)</label>
                       <span id="tpl-bobot-total" class="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">Total Bobot: 0%</span>
                    </div>
                    <div id="tpl-soal-list" class="space-y-3 mb-3"></div>
                    <button type="button" id="btn-tpl-add" class="text-xs text-maroon-700 font-medium hover:underline flex items-center gap-1">
                       <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Tambah Indikator Baru
                    </button>
                </div>
            </div>
        `,
        footerHtml: `
            <button id="btn-tpl-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
            <button id="btn-tpl-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Simpan Template</button>
        `,
        onMount: (m) => {
            const soalList = m.querySelector("#tpl-soal-list");
            const badgeBobot = m.querySelector("#tpl-bobot-total");

            function calcTotalBobot() {
                let total = 0;
                m.querySelectorAll(".soal-bobot").forEach(input => total += parseFloat(input.value) || 0);
                badgeBobot.textContent = `Total Bobot: ${total}%`;
                if (total === 100) badgeBobot.className = "text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded";
                else badgeBobot.className = "text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded";
                return total;
            }

            function addSoalUI(data = { aspek: "", indikator: "", bobot: "" }) {
                const div = document.createElement("div");
                div.className = "flex gap-2 items-start bg-white p-2 rounded-lg border border-slate-200 shadow-sm";
                div.innerHTML = `
                  <div class="flex-1 space-y-2">
                     <input type="text" placeholder="Aspek (Cth: Perilaku Kerja)" value="${escapeHtml(data.aspek)}" class="soal-aspek w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400" required>
                     <input type="text" placeholder="Indikator (Cth: Kedisiplinan waktu)" value="${escapeHtml(data.indikator)}" class="soal-indikator w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400" required>
                  </div>
                  <div class="w-20">
                     <input type="number" placeholder="Bobot %" value="${data.bobot}" class="soal-bobot w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400 text-center" required min="1" max="100">
                  </div>
                  <button type="button" class="text-slate-300 hover:text-red-500 mt-1.5 p-1" title="Hapus">✖</button>
                `;
                div.querySelector(".soal-bobot").addEventListener("input", calcTotalBobot);
                div.querySelector("button").addEventListener("click", () => { div.remove(); calcTotalBobot(); });
                soalList.appendChild(div);
                calcTotalBobot();
            }

            if (existingData && existingData.soal_json) {
                existingData.soal_json.forEach(s => addSoalUI(s));
            } else {
                addSoalUI(); 
            }

            m.querySelector("#btn-tpl-add").onclick = () => addSoalUI();
            m.querySelector("#btn-tpl-batal").onclick = closeModal;
            
            m.querySelector("#btn-tpl-simpan").onclick = async () => {
                const nama = m.querySelector("#tpl-nama").value.trim();
                if (!nama) return toast("Nama Template wajib diisi", "warning");

                const totalSkor = calcTotalBobot();
                if (totalSkor !== 100) return toast("Total bobot harus tepat 100% untuk menghindari error skoring!", "warning");

                const soalArray = [];
                soalList.querySelectorAll(".flex.gap-2").forEach(row => {
                   soalArray.push({
                      aspek: row.querySelector(".soal-aspek").value.trim(),
                      indikator: row.querySelector(".soal-indikator").value.trim(),
                      bobot: parseFloat(row.querySelector(".soal-bobot").value) || 0,
                      nilai_diberikan: 0
                   });
                });

                try {
                    if (existingData) {
                        await fsUpdate(COL.MASTER_SOAL_KPI, existingData.id, { nama_template: nama, soal_json: soalArray });
                    } else {
                        await fsAdd(COL.MASTER_SOAL_KPI, { nama_template: nama, soal_json: soalArray }, genId("TPL-KPI"));
                    }
                    toast("Template berhasil disimpan", "success");
                    closeModal();
                    loadTemplateKpi();
                } catch(e) { toast("Gagal menyimpan: " + e.message, "error"); }
            }
        }
    });
  }

  // ==========================================
  // DISTRIBUSI KPI 
  // ==========================================
  async function loadKpi360() {
    const wrap = panels.kpi360;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    const tasks = await fsGetAll(COL.TUGAS_KPI_360);
    const isHrd = session.role === "HRD";

    let htmlContent = ``;
    if (isHrd) {
      htmlContent += `
        <div class="mb-4 flex justify-end">
          <button id="btn-distribusi-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Distribusi Penilaian 360
          </button>
        </div>
      `;
    }

    if (!tasks.length) { 
      wrap.innerHTML = htmlContent + emptyState("Belum ada tugas penilaian 360", "Buat penugasan penilaian baru untuk memulai."); 
    } else {
      wrap.innerHTML = htmlContent + `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
                <th class="px-4 py-3 text-left">Periode</th><th class="px-4 py-3 text-left">Penilai (Assessor)</th>
                <th class="px-4 py-3 text-left">Dinilai (Assessee)</th><th class="px-4 py-3 text-left">Batas Waktu</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Skor</th>
              </tr></thead>
              <tbody>${tasks.map(t => `
                <tr class="border-t border-slate-50 hover:bg-slate-50/60 transition">
                  <td class="px-4 py-3">${escapeHtml(t.periode || "-")}</td>
                  <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(t.nama_penilai || "-")}</td>
                  <td class="px-4 py-3">${escapeHtml(t.nama_dinilai || "-")}</td>
                  <td class="px-4 py-3 text-xs text-slate-500">${t.deadline ? fmtDateShort(t.deadline) : "-"}</td>
                  <td class="px-4 py-3">${badge(t.status || "PENDING", t.status === "DONE" ? "green" : "amber")}</td>
                  <td class="px-4 py-3 font-semibold text-slate-700">${t.skor_akhir || "-"}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    if (isHrd) {
      const btn = wrap.querySelector("#btn-distribusi-kpi");
      if (btn) btn.addEventListener("click", () => openDistribusiModal());
    }
  }

  async function openDistribusiModal() {
    const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
    const active = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
    const optKaryawan = active.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} — ${escapeHtml(k.jabatan || "")}</option>`).join("");

    const templates = await fsGetAll(COL.MASTER_SOAL_KPI);
    const validTemplates = templates.filter(t => t.nama_template && t.soal_json && t.soal_json.length > 0);
    const optTemplates = validTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.nama_template)}</option>`).join("");

    openModal({
      title: "Distribusi Penilaian KPI 360",
      size: "lg",
      bodyHtml: `
        <form id="form-distribusi" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Periode Penilaian</label>
              <input type="text" id="kpi-periode" placeholder="Cth: Q3 2026" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih PENILAI (Assessor)</label>
              <select id="kpi-penilai" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
                 <option value="">Pilih Karyawan Penilai...</option>
                 ${optKaryawan}
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih Karyawan yang DINILAI (Bisa lebih dari 1)</label>
            <select id="kpi-dinilai" multiple required size="4" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
               ${optKaryawan}
            </select>
          </div>
          
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
            <div class="flex justify-between items-center mb-3 border-b border-slate-200 pb-3">
               <label class="text-xs font-bold text-slate-700 uppercase tracking-wide mt-2">Rancang Indikator & Bobot</label>
               
               <select id="kpi-template-picker" class="w-48 px-2 py-1.5 text-xs rounded border border-maroon-300 bg-maroon-50 text-maroon-700 focus:border-maroon-500 outline-none cursor-pointer font-medium">
                  <option value="">-- Muat Dari Template --</option>
                  ${optTemplates}
               </select>
            </div>
            
            <div id="soal-list" class="space-y-3 mb-3"></div>
            <button type="button" id="btn-add-soal" class="text-xs text-maroon-700 font-medium hover:underline flex items-center gap-1">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Tambah Indikator Manual
            </button>
            <div class="mt-3 text-right">
              <span id="indikator-bobot-total" class="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">Total Bobot: 0%</span>
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-batal-kpi" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Kirim Tugas Penilaian</button>
      `,
      onMount: (m) => {
         const soalList = m.querySelector("#soal-list");
         const badgeBobot = m.querySelector("#indikator-bobot-total");

         function calcTotalBobot() {
            let total = 0;
            m.querySelectorAll(".soal-bobot").forEach(input => total += parseFloat(input.value) || 0);
            badgeBobot.textContent = `Total Bobot: ${total}%`;
            if (total === 100) badgeBobot.className = "text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded";
            else badgeBobot.className = "text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded";
            return total;
         }

         function addSoalUI(data = { aspek: "", indikator: "", bobot: "" }) {
            const div = document.createElement("div");
            div.className = "flex gap-2 items-start bg-white p-2 rounded-lg border border-slate-200 shadow-sm";
            div.innerHTML = `
              <div class="flex-1 space-y-2">
                 <input type="text" placeholder="Aspek" value="${escapeHtml(data.aspek)}" class="soal-aspek w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400" required>
                 <input type="text" placeholder="Indikator Kinerja" value="${escapeHtml(data.indikator)}" class="soal-indikator w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400" required>
              </div>
              <div class="w-20">
                 <input type="number" placeholder="Bobot %" value="${data.bobot}" class="soal-bobot w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-maroon-400 text-center" required min="1" max="100">
              </div>
              <button type="button" class="text-slate-300 hover:text-red-500 mt-1.5 p-1" title="Hapus">✖</button>
            `;
            div.querySelector(".soal-bobot").addEventListener("input", calcTotalBobot);
            div.querySelector("button").addEventListener("click", () => { div.remove(); calcTotalBobot(); });
            soalList.appendChild(div);
            calcTotalBobot();
         }
         
         addSoalUI(); // Default 1 row
         m.querySelector("#btn-add-soal").onclick = () => addSoalUI();

         m.querySelector("#kpi-template-picker").addEventListener("change", (e) => {
            const tplId = e.target.value;
            const tplData = templates.find(t => t.id === tplId);
            if (tplData && tplData.soal_json) {
                soalList.innerHTML = ""; 
                tplData.soal_json.forEach(s => addSoalUI(s));
            }
         });

         m.querySelector("#btn-batal-kpi").onclick = closeModal;
         
         m.querySelector("#btn-save-kpi").onclick = async () => {
            const form = m.querySelector("#form-distribusi");
            if (!form.reportValidity()) return;

            const totalSkor = calcTotalBobot();
            if (totalSkor !== 100) return toast("Total bobot wajib pas 100%!", "warning");

            const periode = m.querySelector("#kpi-periode").value.trim();
            const penilai = m.querySelector("#kpi-penilai").value;
            const dinilaiList = Array.from(m.querySelector("#kpi-dinilai").selectedOptions).map(opt => opt.value);

            if(dinilaiList.includes(penilai)) return toast("Penilai tidak boleh mengevaluasi dirinya sendiri!", "warning");
            if(soalList.children.length === 0) return toast("Tambahkan minimal 1 indikator penilaian!", "warning");

            const soalArray = [];
            soalList.querySelectorAll(".flex.gap-2").forEach(row => {
               soalArray.push({
                  aspek: row.querySelector(".soal-aspek").value.trim(),
                  indikator: row.querySelector(".soal-indikator").value.trim(),
                  bobot: parseFloat(row.querySelector(".soal-bobot").value) || 0,
                  nilai_diberikan: 0
               });
            });

            // Deadline 3 Hari
            const deadlineDate = new Date();
            deadlineDate.setDate(deadlineDate.getDate() + 3);
            const deadlineISO = deadlineDate.toISOString();

            const btn = m.querySelector("#btn-save-kpi");
            btn.disabled = true; btn.textContent = "Menyebarkan...";

            try {
               const qU = query(collection(db, COL.USERS), where("nama", "==", penilai), limit(1));
               const snapU = await getDocs(qU);
               let penilaiEmail = "", penilaiUsername = "";
               if (!snapU.empty) {
                  penilaiEmail = snapU.docs[0].data().email;
                  penilaiUsername = snapU.docs[0].id;
               }

               for (const dinilai of dinilaiList) {
                  await fsAdd(COL.TUGAS_KPI_360, {
                     periode: periode,
                     nama_penilai: penilai,
                     nama_dinilai: dinilai,
                     soal_json: soalArray,
                     status: "PENDING",
                     skor_akhir: 0,
                     tanggal: new Date().toISOString(),
                     deadline: deadlineISO
                  }, genId("KPI"));
               }

               if (penilaiEmail && penilaiUsername && typeof sendEmailNotif === 'function') {
                  const token = await createLoginToken(penilaiUsername);
                  const magicLink = `https://andela-hris.vercel.app/#dashboard?token=${token}`;
                  const htmlEmail = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                      <h2 style="color: #7a1f2b;">Tugas Penilaian KPI Baru</h2>
                      <p>Halo <strong>${penilai}</strong>,</p>
                      <p>Anda ditugaskan untuk menilai <strong>${dinilaiList.length} karyawan</strong> pada periode <strong>${periode}</strong>.</p>
                      <p>Mohon selesaikan penilaian ini sebelum <strong>${fmtDateShort(deadlineISO)}</strong>.</p>
                      <a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Akses & Mulai Menilai</a>
                    </div>
                  `;
                  sendEmailNotif(penilaiEmail, "Tugas Penilaian KPI 360", htmlEmail).catch(e => console.warn(e));
               }

               toast("Tugas Penilaian berhasil didistribusikan.", "success");
               closeModal();
               await loadKpi360(); 
            } catch (e) {
               toast("Gagal mendistribusikan KPI: " + e.message, "error");
               btn.disabled = false; btn.textContent = "Kirim Tugas Penilaian";
            }
         }
      }
    });
  }

  // ==========================================
  // CETAK HASIL PENILAIAN KE PDF
  // ==========================================
  async function loadHasil() {
    const wrap = panels.hasil;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    
    try {
      const logs = await fsGetAll(COL.LOG_PENILAIAN_KPI);
      logs.sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
      
      if (!logs.length) {
         wrap.innerHTML = emptyState("Belum ada data hasil penilaian"); return;
      }

      wrap.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
                <th class="px-4 py-3 text-left">Tanggal</th>
                <th class="px-4 py-3 text-left">Dinilai</th>
                <th class="px-4 py-3 text-left">Penilai</th>
                <th class="px-4 py-3 text-left">Skor Akhir</th>
                <th class="px-4 py-3 text-left">Kategori</th>
                <th class="px-4 py-3 text-right">Aksi</th>
              </tr></thead>
              <tbody>${logs.map(r => `
                <tr class="border-t border-slate-50 hover:bg-slate-50/60 transition">
                  <td class="px-4 py-3">${fmtDateShort(r.tanggal)}</td>
                  <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(r.nama_dinilai)}</td>
                  <td class="px-4 py-3">${escapeHtml(r.penilai)}</td>
                  <td class="px-4 py-3 font-semibold text-slate-800">${r.total_skor}</td>
                  <td class="px-4 py-3">${badge(r.keputusan, r.keputusan === "Sangat Baik" ? "green" : r.keputusan === "Baik" ? "blue" : "red")}</td>
                  <td class="px-4 py-3 text-right">
                    <button data-print="${r.id}" class="text-xs font-medium bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded transition shadow-sm flex items-center gap-1 ml-auto">
                       <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                       Cetak PDF
                    </button>
                  </td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;

      wrap.querySelectorAll("[data-print]").forEach(btn => {
         btn.onclick = () => {
             const row = logs.find(x => x.id === btn.dataset.print);
             printKpiToHtml(row);
         };
      });

    } catch (e) {
      wrap.innerHTML = emptyState("Gagal memuat hasil penilaian");
    }
  }

  function printKpiToHtml(row) {
    const printWindow = window.open('', '_blank');
    let tbody = '';
    
    (row.detail_json || []).forEach(item => {
        let weighted = (item.nilai_diberikan * (item.bobot / 100)).toFixed(2);
        tbody += `<tr>
            <td>${escapeHtml(item.aspek)}</td>
            <td>${escapeHtml(item.indikator)}</td>
            <td style="text-align: center;">${item.bobot}%</td>
            <td style="text-align: center;">${item.nilai_diberikan}</td>
            <td style="text-align: center;"><strong>${weighted}</strong></td>
        </tr>`;
    });

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Laporan Penilaian KPI - ${escapeHtml(row.nama_dinilai)}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #1e293b; line-height: 1.5; padding: 40px; }
                .header { text-align: center; border-bottom: 2px solid #7a1f2b; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { margin: 0; color: #7a1f2b; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
                .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
                .info-table { width: 100%; margin-bottom: 30px; font-size: 13px; }
                .info-table td { padding: 6px 8px; vertical-align: top; }
                .info-table .label { font-weight: bold; width: 140px; color: #475569; }
                .data-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px; }
                .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 12px 10px; }
                .data-table th { background-color: #f8fafc; text-align: left; color: #334155; font-weight: bold; }
                .catatan-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 15px; margin-bottom: 30px; background: #f8fafc; }
                .catatan-box h4 { margin: 0 0 8px 0; color: #334155; font-size: 13px; }
                .catatan-box p { margin: 0; font-size: 13px; color: #475569; white-space: pre-wrap; }
                .summary { width: 320px; float: right; border: 2px solid #e2e8f0; border-radius: 6px; padding: 20px; background: #f8fafc; }
                .summary h3 { margin: 0 0 15px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; color: #334155; }
                .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 15px; }
                .summary-row strong { color: #7a1f2b; font-size: 18px; }
                .clear { clear: both; }
                .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
            <div class="header">
                <h1>Laporan Penilaian Kinerja Karyawan</h1>
                <p>CV Andela Jaya</p>
            </div>
            
            <table class="info-table">
                <tr>
                    <td class="label">Nama Karyawan</td><td>: <strong>${escapeHtml(row.nama_dinilai)}</strong></td>
                    <td class="label">Periode</td><td>: ${escapeHtml(row.periode || '-')}</td>
                </tr>
                <tr>
                    <td class="label">Nama Penilai</td><td>: ${escapeHtml(row.penilai)}</td>
                    <td class="label">Tanggal Dikeluarkan</td><td>: ${fmtDateShort(row.tanggal)}</td>
                </tr>
            </table>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>Aspek Penilaian</th>
                        <th>Indikator</th>
                        <th style="text-align: center; width: 60px;">Bobot</th>
                        <th style="text-align: center; width: 90px;">Nilai (0-100)</th>
                        <th style="text-align: center; width: 90px;">Skor Berbobot</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>

            <div class="catatan-box">
                <h4>Catatan / Ulasan Penilai:</h4>
                <p>${escapeHtml(row.catatan_penilai || 'Tidak ada catatan tambahan yang diberikan.')}</p>
            </div>

            <div class="summary">
                <h3>Hasil Evaluasi Akhir</h3>
                <div class="summary-row">
                    <span>Total Skor:</span>
                    <strong>${row.total_skor}</strong>
                </div>
                <div class="summary-row" style="margin-top: 10px;">
                    <span>Kategori / Predikat:</span>
                    <strong style="color: #1e293b;">${row.keputusan}</strong>
                </div>
            </div>
            <div class="clear"></div>

            <div class="footer">
                Dokumen resmi ini dicetak dari Sistem HRIS pada ${new Date().toLocaleString('id-ID')}
            </div>
        </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  async function loadEvaluasi() {
    await renderCrudModule(panels.evaluasi, {
      title: "Evaluasi Kontrak",
      subtitle: "Rekomendasi perpanjangan/pemutusan kontrak.",
      collectionName: COL.EVALUASI_KONTRAK,
      idPrefix: "EVK",
      searchFields: ["nama_pekerja"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_pekerja", label: "Karyawan" },
        { key: "skor", label: "Skor" },
        { key: "rekomendasi", label: "Rekomendasi", type: "badge", badgeTone: (v) => (v || "").toLowerCase().includes("lanjut") ? "green" : "red" },
        { key: "penilai", label: "Penilai" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "nama_pekerja", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "skor", label: "Skor (0-100)", type: "number", required: true },
        { name: "rekomendasi", label: "Rekomendasi", type: "select", options: ["Perpanjang Kontrak", "Angkat Tetap", "Tidak Diperpanjang"], required: true },
        { name: "catatan_evaluasi", label: "Catatan Evaluasi", type: "textarea", full: true },
        { name: "penilai", label: "Penilai", type: "text", default: session.nama },
      ]
    });
  }

  await loadKontrak(); loaded.kontrak = true;

  container.querySelectorAll(".pk-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ntab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".pk-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "kpi360") await loadKpi360();
        if (tab === "hasil") await loadHasil();
        if (tab === "evaluasi") await loadEvaluasi();
        if (tab === "template") await loadTemplateKpi(); // Load tab baru
      }
    });
  });

  return { unmount() {} };
}
