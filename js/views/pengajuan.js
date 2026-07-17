import { db, COL, collection, query, where, getDocs, storage, ref, uploadBytes, getDownloadURL } from "../firebase-config.js";
import { fsGetAll, fsAdd, openModal, closeModal, toast, genId, escapeHtml, evalFormula, fmtDateShort } from "../utils.js";
import { badge, emptyState, skeletonRows } from "../components.js";
import { canAccessForm } from "../auth.js";

export async function mount(container, { session }) {
  const catEl = container.querySelector("#pengajuan-catalog");
  const recentEl = container.querySelector("#pengajuan-recent");
  
  catEl.innerHTML = `<div class="col-span-full">${skeletonRows(2)}</div>`;
  recentEl.innerHTML = skeletonRows(3);

  // Load database resources (for db_select)
  const masterKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeEmpNames = masterKaryawan.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF").map(k => k.nama_karyawan).sort();
  const masterKendaraan = await fsGetAll(COL.MASTER_KENDARAAN);
  const kendaraanNames = masterKendaraan.map(k => `${k.no_polisi} - ${k.merk}`).sort();
  const masterInventory = await fsGetAll(COL.MASTER_INVENTORY);
  const invNames = masterInventory.map(i => i.nama_barang).sort();

  // Load Form Configs
  const forms = await fsGetAll(COL.FORM_CONFIG);
  const allowedForms = [];
  for (const f of forms) {
    if (await canAccessForm(f, session)) allowedForms.push(f);
  }

  function renderCatalog(filter = "") {
    const list = allowedForms.filter(f => (f.nama_form || f.id).toLowerCase().includes(filter));
    if (!list.length) { catEl.innerHTML = `<div class="col-span-full">${emptyState("Tidak ada formulir", filter ? "Coba kata kunci lain." : "Katalog pengajuan kosong.")}</div>`; return; }
    
    catEl.innerHTML = list.map(f => `
      <div data-form="${f.id}" class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-maroon-300 hover:shadow-md transition cursor-pointer flex flex-col items-start gap-2 group">
        <div class="w-10 h-10 rounded-xl bg-maroon-50 text-maroon-700 flex items-center justify-center group-hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-3-3v6m5 5H7a2 2 0 01-2-2V4a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
        <div>
          <h3 class="font-bold text-slate-800 text-sm group-hover:text-maroon-700 transition">${escapeHtml(f.nama_form || f.id)}</h3>
          <p class="text-[11px] text-slate-400 mt-1">${(f.approval_flow || []).length} Tahap Persetujuan ${f.wajib_lpj ? '• <b>Wajib LPJ</b>' : ''}</p>
        </div>
      </div>`).join("");
      
    catEl.querySelectorAll("[data-form]").forEach(card => {
      card.addEventListener("click", () => openSubmissionForm(allowedForms.find(x => x.id === card.dataset.form)));
    });
  }

  renderCatalog();
  container.querySelector("#pengajuan-search").addEventListener("input", (e) => renderCatalog(e.target.value.toLowerCase().trim()));

  // Load Recent Pengajuan
  try {
    const q = query(collection(db, COL.DATA_PENGAJUAN), where("nama_pemohon", "==", session.nama));
    const snap = await getDocs(q);
    const recent = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.tgl) - new Date(a.tgl)).slice(0, 5);
    
    if (!recent.length) { recentEl.innerHTML = emptyState("Belum ada pengajuan", "Riwayat pengajuan terbaru Anda akan muncul di sini."); } 
    else {
      recentEl.innerHTML = recent.map(r => {
        const tone = r.status_final?.includes("APPROVED") ? "green" : r.status_final?.includes("REJECT") ? "red" : "amber";
        return `
          <div class="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
            <div>
              <p class="font-semibold text-slate-800 text-sm">${escapeHtml(r.nama_form || r.form_id)}</p>
              <p class="text-xs text-slate-500 mt-0.5">${fmtDateShort(r.tgl)} • ID: ${r.id}</p>
            </div>
            ${badge(r.status_final, tone)}
          </div>`;
      }).join("");
    }
  } catch (e) { recentEl.innerHTML = emptyState("Gagal memuat riwayat", e.message); }

  function getDbOptions(source) {
      if (source === "master_karyawan") return activeEmpNames;
      if (source === "master_kendaraan") return kendaraanNames;
      if (source === "inventory") return invNames;
      return [];
  }

  function openSubmissionForm(fConfig) {
    const fields = typeof fConfig.fields_json === "string" ? JSON.parse(fConfig.fields_json) : fConfig.fields_json;
    
    const fieldsHtml = fields.map(f => {
      let inputHtml = "";
      const baseClass = "dyn-input w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition bg-white";
      const req = f.required ? "required" : "";

      if (f.type === "textarea") {
        inputHtml = `<textarea name="${f.name}" ${req} rows="3" class="${baseClass}"></textarea>`;
      } else if (f.type === "select") {
        inputHtml = `<select name="${f.name}" ${req} class="${baseClass}"><option value="">-- Pilih --</option>${(f.options || []).map(o => `<option value="${o}">${o}</option>`).join("")}</select>`;
      } else if (f.type === "db_select") {
        const opts = getDbOptions(f.db_source);
        inputHtml = `<select name="${f.name}" ${req} class="${baseClass}"><option value="">-- Pilih dari Database --</option>${opts.map(o => `<option value="${o}">${o}</option>`).join("")}</select>`;
      } else if (f.type === "upload") {
        inputHtml = `<input type="file" name="${f.name}" ${req} class="dyn-input w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer border border-slate-200 rounded-lg p-1">`;
      } else if (f.type === "formula") {
        inputHtml = `<input type="number" name="${f.name}" data-formula="${escapeHtml(f.formula)}" readonly class="dyn-input w-full px-3 py-2.5 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 font-bold outline-none font-mono" placeholder="Dihitung Otomatis...">`;
      } else {
        // text, number, date
        inputHtml = `<input type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" name="${f.name}" ${req} class="${baseClass}">`;
      }

      const panduanHtml = f.panduan ? `<div class="mt-1 mb-2 p-2 bg-blue-50/50 border-l-2 border-blue-400 text-xs text-blue-700 font-medium leading-relaxed">SOP/Panduan: ${escapeHtml(f.panduan)}</div>` : '';

      return `
        <div class="mb-4">
          <label class="block text-xs font-bold text-slate-600 mb-1">${escapeHtml(f.label)} ${f.required ? '<span class="text-red-500">*</span>' : ''}</label>
          ${panduanHtml}
          ${inputHtml}
        </div>`;
    }).join("");

    openModal({
      title: `Form: ${fConfig.nama_form}`,
      size: "md",
      bodyHtml: `
        <div class="bg-slate-50 p-4 border-b border-slate-100 mb-4 rounded-t-lg">
           <p class="text-xs text-slate-500 mb-1">Diajukan oleh: <strong>${session.nama}</strong></p>
           <p class="text-xs text-slate-500">Alur Persetujuan: ${(fConfig.approval_flow || []).join(" ➔ ")}</p>
           ${fConfig.wajib_lpj ? `<div class="mt-2 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded inline-block">⚠️ Form ini Mewajibkan Laporan Pertanggungjawaban (LPJ)</div>` : ''}
        </div>
        <form id="dyn-form">${fieldsHtml}</form>
      `,
      footerHtml: `
        <button id="dyn-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="dyn-submit" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-medium shadow transition">Ajukan Formulir</button>
      `,
      onMount: (m) => {
        const formEl = m.querySelector("#dyn-form");
        const inputs = Array.from(formEl.querySelectorAll(".dyn-input"));
        const formulaFields = inputs.filter(i => i.hasAttribute("data-formula"));

        // Setup Formula Calculation Engine
        if (formulaFields.length > 0) {
           formEl.addEventListener("input", () => {
              const currentValues = {};
              inputs.forEach(i => { if(i.name) currentValues[i.name] = i.value; });
              
              formulaFields.forEach(fField => {
                 const formula = fField.dataset.formula;
                 const result = evalFormula(formula, currentValues);
                 if (result !== null) fField.value = result;
              });
           });
        }

        m.querySelector("#dyn-cancel").onclick = closeModal;
        m.querySelector("#dyn-submit").onclick = async () => {
          if (!formEl.reportValidity()) return;

          const btn = m.querySelector("#dyn-submit");
          btn.disabled = true; btn.textContent = "Memproses...";

          const fd = new FormData(formEl);
          const detail = {};

          try {
              // 1. Tangani Upload File ke Firebase Storage
              for (const field of fields) {
                 if (field.type === "upload") {
                    const fileInput = formEl.querySelector(`input[name="${field.name}"]`);
                    const file = fileInput.files[0];
                    if (file) {
                        btn.textContent = `Mengupload ${field.label}...`;
                        const fileExt = file.name.split('.').pop();
                        const fileName = `lampiran/${session.nama.replace(/\s+/g,'_')}_${Date.now()}.${fileExt}`;
                        const storageRef = ref(storage, fileName);
                        await uploadBytes(storageRef, file);
                        const downloadUrl = await getDownloadURL(storageRef);
                        detail[field.name] = downloadUrl; // Simpan link hasil upload
                    } else {
                        detail[field.name] = null;
                    }
                 } else {
                    detail[field.name] = fd.get(field.name);
                 }
              }
              
              btn.textContent = "Mengirim Pengajuan...";

              // 2. Susun Payload
              const payload = {
                tgl: new Date().toISOString(),
                nik: session.nik || "-",
                nama_pemohon: session.nama,
                cabang_pemohon: session.cabang || "-",
                form_id: fConfig.id,
                nama_form: fConfig.nama_form,
                detail: detail,
                approval_flow: fConfig.approval_flow || [],
                approval_steps: (fConfig.approval_flow || []).map(() => "PENDING"),
                status_final: "MENUNGGU",
                wajib_lpj: fConfig.wajib_lpj || false,
                status_lpj: fConfig.wajib_lpj ? "BELUM_KIRIM" : "TIDAK_WAJIB",
                catatan_penolakan: []
              };

              // 3. Simpan ke Firestore
              await fsAdd(COL.DATA_PENGAJUAN, payload, genId("TRX"));
              toast("Pengajuan berhasil dikirim!", "success");
              
              closeModal();
              mount(container, { session }); // Refresh UI
          } catch(e) {
              toast("Gagal mengajukan: " + e.message, "error");
              btn.disabled = false; btn.textContent = "Ajukan Formulir";
          }
        };
      }
    });
  }

  return { unmount() {} };
}
