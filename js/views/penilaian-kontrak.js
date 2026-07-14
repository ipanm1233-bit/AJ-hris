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
             <input type="file" id="kpi-excel-upload" accept=".xlsx, .xls" class="hidden">
             <button id="btn-import-template" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
               Import Excel
             </button>
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

    const btnImport = wrap.querySelector("#btn-import-template");
    const inputExcel = wrap.querySelector("#kpi-excel-upload");
    if (btnImport && inputExcel) {
       btnImport.onclick = () => inputExcel.click();
       inputExcel.onchange = (e) => handleExcelImport(e.target.files[0]);
    }
    const btnAdd = wrap.querySelector("#btn-add-template");
    if(btnAdd) btnAdd.onclick = () => openTemplateModal();

    wrap.querySelectorAll("[data-edit-tpl]").forEach(btn => {
        btn.onclick = () => openTemplateModal(templates.find(x => x.id === btn.dataset.editTpl));
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

  async function handleExcelImport(file) {
    if (!file || typeof window.XLSX === "undefined") return;
    const btn = panels.template.querySelector("#btn-import-template");
    btn.innerHTML = `Membaca File...`; btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = window.XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = window.XLSX.utils.sheet_to_json(worksheet, {raw: false});
            const groupedTemplates = {};

            rows.forEach(row => {
                const getVal = (keys) => {
                    for(let k of Object.keys(row)) { if(keys.some(x => k.toUpperCase().includes(x))) return row[k]; }
                    return "";
                };
                const jabatan = getVal(["JABATAN", "POSISI"]);
                const aspek = getVal(["ASPEK"]);
                const indikator = getVal(["INDIKATOR", "PERTANYAAN"]);
                const bobot = parseFloat(getVal(["BOBOT", "BOB"])) || 0;

                if (!jabatan || !indikator) return;
                if (!groupedTemplates[jabatan]) groupedTemplates[jabatan] = { nama_template: jabatan, soal_json: [] };
                groupedTemplates[jabatan].soal_json.push({ aspek: aspek || "Umum", indikator, bobot, nilai_diberikan: 0 });
            });

            const templateNames = Object.keys(groupedTemplates);
            for (const name of templateNames) {
                await fsAdd(COL.MASTER_SOAL_KPI, groupedTemplates[name], genId("TPL-KPI"));
            }
            toast(`Berhasil meng-import ${templateNames.length} Template dari Excel!`, "success");
            loadTemplateKpi();
        } catch(err) { toast("Gagal: " + err.message, "error"); }
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
                     <input type="text" placeholder="Aspek" value="${escapeHtml(data.aspek)}" class="soal-aspek w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none" required>
                     <input type="text" placeholder="Indikator" value="${escapeHtml(data.indikator)}" class="soal-indikator w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none" required>
                  </div>
                  <div class="w-20">
                     <input type="number" placeholder="Bobot %" value="${data.bobot}" class="soal-bobot w-full px-2 py-1.5 text-xs border border-slate-200 rounded text-center" required min="1" max="100">
                  </div>
                  <button type="button" class="text-slate-300 hover:text-red-500 mt-1.5 p-1">✖</button>
                `;
                div.querySelector(".soal-bobot").addEventListener("input", calcTotalBobot);
                div.querySelector("button").addEventListener("click", () => { div.remove(); calcTotalBobot(); });
                soalList.appendChild(div); calcTotalBobot();
            }

            if (existingData && existingData.soal_json) existingData.soal_json.forEach(s => addSoalUI(s));
            else addSoalUI();

            m.querySelector("#btn-tpl-add").onclick = () => addSoalUI();
            m.querySelector("#btn-tpl-batal").onclick = closeModal;
            m.querySelector("#btn-tpl-simpan").onclick = async () => {
                const nama = m.querySelector("#tpl-nama").value.trim();
                if (!nama || calcTotalBobot() !== 100) return toast("Lengkapi nama & pastikan total bobot tepat 100%!", "warning");

                const soalArray = [];
                soalList.querySelectorAll(".flex.gap-2").forEach(row => {
                   soalArray.push({
                      aspek: row.querySelector(".soal-aspek").value.trim(),
                      indikator: row.querySelector(".soal-indikator").value.trim(),
                      bobot: parseFloat(row.querySelector(".soal-bobot").value) || 0,
                      nilai_diberikan: 0
                   });
                });

                if (existingData) await fsUpdate(COL.MASTER_SOAL_KPI, existingData.id, { nama_template: nama, soal_json: soalArray });
                else await fsAdd(COL.MASTER_SOAL_KPI, { nama_template: nama, soal_json: soalArray }, genId("TPL-KPI"));
                toast("Template disimpan", "success"); closeModal(); loadTemplateKpi();
            }
        }
    });
  }

  async function loadKpi360() {
    const wrap = panels.kpi360;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    const tasks = await fsGetAll(COL.TUGAS_KPI_360);
    const isHrd = session.role === "HRD";

    let htmlContent = isHrd ? `
        <div class="mb-4 flex justify-end">
          <button id="btn-distribusi-kpi" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Distribusi Penilaian 360
          </button>
        </div>` : ``;

    if (!tasks.length) { wrap.innerHTML = htmlContent + emptyState("Belum ada penugasan"); }
    else {
      wrap.innerHTML = htmlContent + `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
                <th class="px-4 py-3 text-left">Periode</th><th class="px-4 py-3 text-left">Penilai</th><th class="px-4 py-3 text-left">Dinilai</th><th class="px-4 py-3 text-left">Batas Waktu</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Skor</th>
              </tr></thead>
              <tbody>${tasks.map(t => `
                <tr class="border-t border-slate-50 hover:bg-slate-50 transition">
                  <td class="px-4 py-3">${escapeHtml(t.periode || "-")}</td>
                  <td class="px-4 py-3 font-medium">${escapeHtml(t.nama_penilai || "-")}</td>
                  <td class="px-4 py-3">${escapeHtml(t.nama_dinilai || "-")}</td>
                  <td class="px-4 py-3 text-xs text-slate-500">${t.deadline ? fmtDateShort(t.deadline) : "-"}</td>
                  <td class="px-4 py-3">${badge(t.status || "PENDING", t.status === "DONE" ? "green" : "amber")}</td>
                  <td class="px-4 py-3 font-semibold">${t.skor_akhir || "-"}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    }
    if (isHrd && wrap.querySelector("#btn-distribusi-kpi")) wrap.querySelector("#btn-distribusi-kpi").onclick = openDistribusiModal;
  }

  // =====================================================================
  // MODAL DISTRIBUSI PINTAR: IMPLEMENTASI FITUR SEARCH & LIST CHECKBOX
  // =====================================================================
  async function openDistribusiModal() {
    const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
    const activeK = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
    const optKaryawanSelect = activeK.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} — ${escapeHtml(k.jabatan || "")}</option>`).join("");

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
              <label class="block text-xs font-medium text-slate-500 mb-1">Periode Penilaian</label>
              <input type="text" id="kpi-periode" placeholder="Cth: Q3 2026" required class="w-full px-3 py-2 text-sm rounded-lg border outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1">Pilih PENILAI (Assessor)</label>
              <select id="kpi-penilai" required class="w-full px-3 py-2 text-sm rounded-lg border outline-none">
                 <option value="">Pilih Karyawan Penilai...</option>
                 ${optKaryawanSelect}
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Pilih Karyawan yang DINILAI (Bisa Centang Banyak)</label>
            <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
               <div class="p-2.5 bg-slate-50 border-b border-slate-200">
                  <input type="text" id="kpi-search-box" placeholder="Ketik nama karyawan untuk mencari..." class="w-full px-3 py-1.5 text-xs rounded border border-slate-200 outline-none focus:border-maroon-500">
               </div>
               <div id="kpi-checkbox-list" class="max-h-40 overflow-y-auto divide-y divide-slate-100 p-1 bg-white space-y-0.5">
                  </div>
            </div>
          </div>
          
          <div class="bg-slate-50 p-4 rounded-xl border mt-2">
            <div class="flex justify-between items-center mb-3 border-b pb-3">
               <label class="text-xs font-bold text-slate-700 uppercase">Rancang Indikator & Bobot</label>
               <select id="kpi-template-picker" class="w-48 px-2 py-1.5 text-xs rounded border bg-white outline-none font-medium cursor-pointer">
                  <option value="">-- Muat Dari Template --</option>
                  ${optTemplates}
               </select>
            </div>
            <div id="soal-list" class="space-y-3 mb-3"></div>
            <button type="button" id="btn-add-soal" class="text-xs text-maroon-700 font-medium hover:underline flex items-center gap-1">✖ Tambah Indikator Manual</button>
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
         const listContainer = m.querySelector("#kpi-checkbox-list");
         const searchBox = m.querySelector("#kpi-search-box");
         const soalList = m.querySelector("#soal-list");
         const badgeBobot = m.querySelector("#indikator-bobot-total");

         // Loop Render Checkbox Berdasarkan Array Pencarian
         function drawCheckboxes(filterText = "") {
             const term = filterText.toLowerCase();
             listContainer.innerHTML = activeK.map(k => {
                 const match = k.nama_karyawan.toLowerCase().includes(term) || (k.jabatan || "").toLowerCase().includes(term);
                 if(!match) return "";
                 return `
                   <label class="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition select-none">
                      <input type="checkbox" name="dinilai-checkbox" value="${escapeHtml(k.nama_karyawan)}" class="w-4 h-4 text-maroon-600 border-slate-300 rounded focus:ring-maroon-500 cursor-pointer">
                      <div class="text-xs">
                         <p class="font-semibold text-slate-700">${escapeHtml(k.nama_karyawan)}</p>
                         <p class="text-slate-400 text-[10px]">${escapeHtml(k.jabatan || "-")} • ${escapeHtml(k.cabang || "-")}</p>
                      </div>
                   </label>
                 `;
             }).join("");
         }
         drawCheckboxes(); // Init render pertama

         searchBox.oninput = (e) => drawCheckboxes(e.target.value);

         function calcTotalBobot() {
            let total = 0; m.querySelectorAll(".soal-bobot").forEach(input => total += parseFloat(input.value) || 0);
            badgeBobot.textContent = `Total Bobot: ${total}%`;
            badgeBobot.className = total === 100 ? "text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded" : "text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded";
            return total;
         }

         function addSoalUI(data = { aspek: "", indikator: "", bobot: "" }) {
            const div = document.createElement("div"); div.className = "flex gap-2 items-start bg-white p-2 rounded-lg border shadow-sm";
            div.innerHTML = `
              <div class="flex-1 space-y-2">
                 <input type="text" placeholder="Aspek" value="${escapeHtml(data.aspek)}" class="soal-aspek w-full px-2 py-1.5 text-xs border rounded outline-none" required>
                 <input type="text" placeholder="Indikator Kinerja" value="${escapeHtml(data.indikator)}" class="soal-indikator w-full px-2 py-1.5 text-xs border rounded outline-none" required>
              </div>
              <div class="w-20"><input type="number" placeholder="Bobot" value="${data.bobot}" class="soal-bobot w-full px-2 py-1.5 text-xs border rounded text-center" required></div>
              <button type="button" class="text-slate-300 hover:text-red-500 mt-1.5 p-1">✖</button>
            `;
            div.querySelector(".soal-bobot").oninput = calcTotalBobot;
            div.querySelector("button").onclick = () => { div.remove(); calcTotalBobot(); };
            soalList.appendChild(div); calcTotalBobot();
         }
         addSoalUI();

         m.querySelector("#kpi-template-picker").onchange = (e) => {
            const tpl = validTemplates.find(t => t.id === e.target.value);
            if (tpl && tpl.soal_json) { soalList.innerHTML = ""; tpl.soal_json.forEach(s => addSoalUI(s)); }
         };

         m.querySelector("#btn-add-soal").onclick = () => addSoalUI();
         m.querySelector("#btn-batal-kpi").onclick = closeModal;
         
         m.querySelector("#btn-save-kpi").onclick = async () => {
            const form = m.querySelector("#form-distribusi");
            if (!form.reportValidity() || calcTotalBobot() !== 100) return toast("Lengkapi form & pastikan total bobot tepat 100%!", "warning");

            const periode = m.querySelector("#kpi-periode").value.trim();
            const penilai = m.querySelector("#kpi-penilai").value;
            
            // Ekstrak nama karyawan yang dicentang dari modul checkbox list
            const checkedBoxes = m.querySelectorAll('input[name="dinilai-checkbox"]:checked');
            const dinilaiList = Array.from(checkedBoxes).map(box => box.value);

            if(!dinilaiList.length) return toast("Centang minimal 1 karyawan yang akan dinilai!", "warning");
            if(dinilaiList.includes(penilai)) return toast("Penilai tidak boleh berada di dalam daftar centang yang dinilai!", "warning");

            const soalArray = [];
            soalList.querySelectorAll(".flex.gap-2").forEach(row => {
               soalArray.push({
                  aspek: row.querySelector(".soal-aspek").value.trim(),
                  indikator: row.querySelector(".soal-indikator").value.trim(),
                  bobot: parseFloat(row.querySelector(".soal-bobot").value) || 0,
                  nilai_diberikan: 0
               });
            });

            const deadlineDate = new Date(); deadlineDate.setDate(deadlineDate.getDate() + 3);
            const deadlineISO = deadlineDate.toISOString();

            const btn = m.querySelector("#btn-save-kpi");
            btn.disabled = true; btn.textContent = "Menyebarkan Tugas...";

            try {
               const qU = query(collection(db, COL.USERS), where("nama", "==", penilai), limit(1));
               const snapU = await getDocs(qU);
               let penilaiEmail = "", penilaiUsername = "";
               if (!snapU.empty) { penilaiEmail = snapU.docs[0].data().email; penilaiUsername = snapU.docs[0].id; }

               for (const dinilai of dinilaiList) {
                  await fsAdd(COL.TUGAS_KPI_360, { periode, nama_penilai: penilai, nama_dinilai: dinilai, soal_json: soalArray, status: "PENDING", skor_akhir: 0, tanggal: new Date().toISOString(), deadline: deadlineISO }, genId("KPI"));
               }

               if (penilaiEmail && penilaiUsername && typeof sendEmailNotif === 'function') {
                  const token = await createLoginToken(penilaiUsername);
                  const magicLink = `https://andela-hris.vercel.app/#dashboard?token=${token}`;
                  const htmlEmail = `<div style="font-family: Arial; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;"><h2 style="color: #7a1f2b;">Tugas Penilaian KPI Baru</h2><p>Halo <strong>${penilai}</strong>,</p><p>Anda ditugaskan menilai <strong>${dinilaiList.length} karyawan</strong> periode <strong>${periode}</strong>.</p><a href="${magicLink}" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Mulai Menilai</a></div>`;
                  sendEmailNotif(penilaiEmail, "Tugas Penilaian KPI 360", htmlEmail).catch(e => console.warn(e));
               }

               toast("Tugas Penilaian berhasil didistribusikan.", "success"); closeModal(); await loadKpi360(); 
            } catch (e) { toast("Gagal: " + e.message, "error"); btn.disabled = false; }
         }
      }
    });
  }

  async function loadHasil() {
    const wrap = panels.hasil; wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    try {
      const logs = await fsGetAll(COL.LOG_PENILAIAN_KPI);
      logs.sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
      if (!logs.length) { wrap.innerHTML = emptyState("Belum ada data hasil"); return; }

      wrap.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
                <th class="px-4 py-3 text-left">Tanggal</th><th class="px-4 py-3 text-left">Dinilai</th><th class="px-4 py-3 text-left">Penilai</th><th class="px-4 py-3 text-left">Skor Akhir</th><th class="px-4 py-3 text-left">Kategori</th><th class="px-4 py-3 text-right">Aksi</th>
              </tr></thead>
              <tbody>${logs.map(r => `
                <tr class="border-t border-slate-50 hover:bg-slate-50 transition">
                  <td class="px-4 py-3">${fmtDateShort(r.tanggal)}</td>
                  <td class="px-4 py-3 font-medium">${escapeHtml(r.nama_dinilai)}</td>
                  <td class="px-4 py-3">${escapeHtml(r.penilai)}</td>
                  <td class="px-4 py-3 font-semibold">${r.total_skor}</td>
                  <td class="px-4 py-3">${badge(r.keputusan, r.keputusan === "Sangat Baik" ? "green" : "blue")}</td>
                  <td class="px-4 py-3 text-right">
                    <button data-print="${r.id}" class="text-xs bg-slate-800 text-white px-3 py-1.5 rounded flex items-center gap-1 ml-auto">Cetak PDF</button>
                  </td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`;

      wrap.querySelectorAll("[data-print]").forEach(btn => {
         btn.onclick = () => printKpiToHtml(logs.find(x => x.id === btn.dataset.print));
      });
    } catch (e) { wrap.innerHTML = emptyState("Gagal memuat"); }
  }

  function printKpiToHtml(row) {
    const printWindow = window.open('', '_blank');
    let tbody = '';
    (row.detail_json || []).forEach(item => {
        let weighted = (item.nilai_diberikan * (item.bobot / 100)).toFixed(2);
        tbody += `<tr><td>${escapeHtml(item.aspek)}</td><td>${escapeHtml(item.indikator)}</td><td style="text-align: center;">${item.bobot}%</td><td style="text-align: center;">${item.nilai_diberikan}</td><td style="text-align: center;"><strong>${weighted}</strong></td></tr>`;
    });

    const html = `<html><head><title>KPI - ${escapeHtml(row.nama_dinilai)}</title><style>body { font-family: Arial; padding: 40px; } table { width:100%; border-collapse:collapse; margin-top:20px; } th, td { border:1px solid #cbd5e1; padding:10px; } th { background:#f8fafc; }</style></head><body onload="window.print(); window.close();"><h2>Laporan KPI Karyawan</h2><p>Nama: ${escapeHtml(row.nama_dinilai)}</p><p>Penilai: ${escapeHtml(row.penilai)}</p><table><thead><tr><th>Aspek</th><th>Indikator</th><th>Bobot</th><th>Nilai</th><th>Skor Akhir</th></tr></thead><tbody>${tbody}</tbody></table></body></html>`;
    printWindow.document.write(html); printWindow.document.close();
  }

  async function loadEvaluasi() {
    await renderCrudModule(panels.evaluasi, {
      title: "Evaluasi Kontrak",
      collectionName: COL.EVALUASI_KONTRAK,
      idPrefix: "EVK",
      searchFields: ["nama_pekerja"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_pekerja", label: "Karyawan" },
        { key: "skor", label: "Skor" },
        { key: "rekomendasi", label: "Rekomendasi", type: "badge" },
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "nama_pekerja", label: "Nama Karyawan", type: "text", required: true },
        { name: "skor", label: "Skor (0-100)", type: "number", required: true },
        { name: "rekomendasi", label: "Rekomendasi", type: "select", options: ["Perpanjang Kontrak", "Angkat Tetap", "Tidak Diperpanjang"], required: true },
      ]
    });
  }

  await loadKontrak(); loaded.kontrak = true;

  container.querySelectorAll(".pk-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ntab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".pk-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "kpi360") await loadKpi360();
        if (tab === "hasil") await loadHasil();
        if (tab === "evaluasi") await loadEvaluasi();
        if (tab === "template") await loadTemplateKpi();
      }
    });
  });

  return { unmount() {} };
}
