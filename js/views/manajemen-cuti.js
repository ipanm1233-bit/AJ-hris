import { db, COL, collection, doc, updateDoc, getDocs, query, where } from "../firebase-config.js";
import { fsGetAll, toast, escapeHtml, smartParseDate, toNumber, getCalculatedJatahCuti, getCarryoverPercentage, calculateCarryoverJatah, openModal, closeModal } from "../utils.js";
import { emptyState } from "../components.js";

export async function mount(container, { session }) {
  // Memastikan library pembaca Excel (SheetJS) ter-load dengan aman
  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    document.head.appendChild(script);
  }

  const tbody = container.querySelector("#cuti-tbody");
  const btnImport = container.querySelector("#btn-import-excel");
  const fileInput = container.querySelector("#excel-upload");
  const btnReset = container.querySelector("#btn-reset-tahunan");

  const userRole = (session?.role || "").toUpperCase();
  const isHrdRole = ["HRD", "SUPERADMIN", "ADMIN"].includes(userRole);

  if (!isHrdRole) {
    if (btnImport) btnImport.style.display = "none";
    if (fileInput) fileInput.style.display = "none";
    if (btnReset) btnReset.style.display = "none";
    const excelBox = container.querySelector(".bg-blue-50");
    if (excelBox) excelBox.style.display = "none";
  }

  let allKaryawan = [];
  let allCuti = [];

  const searchInput = container.querySelector("#manajemen-cuti-search");
  const countDisplay = container.querySelector("#manajemen-cuti-count");

  // Helper untuk menyimpan perubahan jatah cuti karyawan ke Firestore secara robust (termasuk sinkronisasi doc duplikat jika ada)
  async function syncSaveEmployeeLeave(emp, payload) {
    const cleanPayload = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) {
        cleanPayload[k] = v;
      }
    }

    if (emp.id) {
      await updateDoc(doc(db, COL.MASTER_KARYAWAN, String(emp.id)), cleanPayload);
    }

    try {
      const empNik = (emp.nik || emp.nik_karyawan || "").toString().trim();
      const empName = (emp.nama_karyawan || "").toString().trim();
      if (empNik || empName) {
        const qColl = collection(db, COL.MASTER_KARYAWAN);
        const matches = [];
        if (empNik) {
          const snapNik = await getDocs(query(qColl, where("nik_karyawan", "==", empNik)));
          snapNik.forEach(d => { if (d.id !== emp.id) matches.push(d.id); });
          const snapNikAlt = await getDocs(query(qColl, where("nik", "==", empNik)));
          snapNikAlt.forEach(d => { if (d.id !== emp.id) matches.push(d.id); });
        }
        if (empName) {
          const snapName = await getDocs(query(qColl, where("nama_karyawan", "==", empName)));
          snapName.forEach(d => { if (d.id !== emp.id) matches.push(d.id); });
        }
        const uniqueOtherDocIds = [...new Set(matches)];
        for (const otherId of uniqueOtherDocIds) {
          await updateDoc(doc(db, COL.MASTER_KARYAWAN, otherId), cleanPayload).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Sinkronisasi dokumen alternatif:", err);
    }

    Object.assign(emp, cleanPayload);
    for (const other of allKaryawan) {
      if (other !== emp) {
        const oNik = (other.nik || other.nik_karyawan || "").toString().trim();
        const oName = (other.nama_karyawan || "").toString().trim();
        const empNik = (emp.nik || emp.nik_karyawan || "").toString().trim();
        const empName = (emp.nama_karyawan || "").toString().trim();
        if ((empNik && oNik === empNik) || (empName && oName === empName)) {
          Object.assign(other, cleanPayload);
        }
      }
    }
  }

  function openEditModal(k) {
    const empCuti = allCuti.filter(c => c.nama_karyawan === k.nama_karyawan || (k.nik && c.nik === k.nik));
    let calc = getCalculatedJatahCuti(k, empCuti);

    openModal({
      title: `Edit Jatah Cuti: ${k.nama_karyawan}`,
      size: "lg",
      bodyHtml: `
        <div class="space-y-4">
          <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-950 text-xs">
            <span class="font-bold">Form Pengaturan Jatah Cuti Manual HRD</span>
            <p class="text-[11px] text-amber-800 mt-0.5">Ubah kuota hak cuti karyawan. Perubahan akan langsung tersimpan ke database induk karyawan.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Jatah Cuti Tahunan (Awal)</label>
              <div class="relative">
                <input type="number" id="inp-modal-tahunan" step="0.5" min="0" required value="${calc.jatahTahunan}" class="w-full px-3 py-2 text-sm font-bold text-blue-800 border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white">
                <span class="absolute right-3 top-2 text-xs text-slate-400 font-medium">Hari</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Terpakai: <b>${calc.usedTahunan} Hari</b></p>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Jatah Cuti Khusus (Awal)</label>
              <div class="relative">
                <input type="number" id="inp-modal-khusus" step="0.5" min="0" required value="${calc.jatahKhusus}" class="w-full px-3 py-2 text-sm font-bold text-emerald-800 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white">
                <span class="absolute right-3 top-2 text-xs text-slate-400 font-medium">Hari</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Terpakai: <b>${calc.usedKhusus} Hari</b></p>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Jatah Akumulasi (Carryover)</label>
              <div class="relative">
                <input type="number" id="inp-modal-akumulasi" step="0.5" min="0" required value="${calc.jatahAkumulasi}" class="w-full px-3 py-2 text-sm font-bold text-amber-800 border border-slate-200 rounded-lg outline-none focus:border-amber-500 bg-white">
                <span class="absolute right-3 top-2 text-xs text-slate-400 font-medium">Hari</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Terpakai: <b>${calc.usedAkumulasi} Hari</b></p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Sisa Cuti Tahun Lalu (Manual HRD)</label>
              <input type="number" id="inp-modal-sisa-lalu" step="0.5" min="0" value="${k.sisa_cuti_tahun_lalu ?? ""}" placeholder="Opsional (basis kalkulasi carryover)" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 bg-white">
              <p class="text-[10px] text-slate-400 mt-1">Jika diisi, jatah akumulasi dapat otomatis dihitung sesuai masa kerja.</p>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Batas Kedaluwarsa Cuti Akumulasi</label>
              <input type="text" id="inp-modal-expired" value="${escapeHtml(k.cuti_akumulasi_expired || '')}" placeholder="Contoh: 30 Juni 2026" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-maroon-400 bg-white">
              <p class="text-[10px] text-slate-400 mt-1">Default sesuai SK: 30 Juni tahun berjalan.</p>
            </div>
          </div>

          <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <div class="text-[11px] font-bold text-slate-600 mb-2 uppercase tracking-wide">Pratinjau Sisa Saldo Setelah Disimpan:</div>
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-white p-2 rounded-lg border border-blue-100">
                <span class="text-[10px] text-slate-400 block font-medium">Sisa Tahunan</span>
                <span id="preview-sisa-tahunan" class="text-base font-extrabold text-blue-700 font-mono">${calc.sisaTahunan} Hari</span>
              </div>
              <div class="bg-white p-2 rounded-lg border border-emerald-100">
                <span class="text-[10px] text-slate-400 block font-medium">Sisa Khusus</span>
                <span id="preview-sisa-khusus" class="text-base font-extrabold text-emerald-700 font-mono">${calc.sisaKhusus} Hari</span>
              </div>
              <div class="bg-white p-2 rounded-lg border border-amber-100">
                <span class="text-[10px] text-slate-400 block font-medium">Sisa Akumulasi</span>
                <span id="preview-sisa-akumulasi" class="text-base font-extrabold text-amber-700 font-mono">${calc.sisaAkumulasi} Hari</span>
              </div>
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <button id="btn-modal-batal" class="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-modal-simpan" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-xs font-bold shadow transition flex items-center gap-1.5"><i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan Jatah</button>
      `,
      onMount: (m) => {
        const inT = m.querySelector("#inp-modal-tahunan");
        const inK = m.querySelector("#inp-modal-khusus");
        const inA = m.querySelector("#inp-modal-akumulasi");
        const inLalu = m.querySelector("#inp-modal-sisa-lalu");
        const inExp = m.querySelector("#inp-modal-expired");
        const btnSave = m.querySelector("#btn-modal-simpan");
        const btnCancel = m.querySelector("#btn-modal-batal");

        const prevT = m.querySelector("#preview-sisa-tahunan");
        const prevK = m.querySelector("#preview-sisa-khusus");
        const prevA = m.querySelector("#preview-sisa-akumulasi");

        const updatePreviews = () => {
          const vT = parseFloat(inT?.value) || 0;
          const vK = parseFloat(inK?.value) || 0;
          const vA = parseFloat(inA?.value) || 0;
          if (prevT) prevT.textContent = `${Math.max(0, vT - calc.usedTahunan)} Hari`;
          if (prevK) prevK.textContent = `${Math.max(0, vK - calc.usedKhusus)} Hari`;
          if (prevA) prevA.textContent = `${Math.max(0, vA - calc.usedAkumulasi)} Hari`;
        };

        if (inT) inT.oninput = updatePreviews;
        if (inK) inK.oninput = updatePreviews;
        if (inA) inA.oninput = updatePreviews;

        if (inLalu) {
          inLalu.onchange = () => {
            const val = inLalu.value === "" ? null : (parseFloat(inLalu.value) || 0);
            if (val !== null && val > 0 && inA) {
              const autoAkum = calculateCarryoverJatah(val, k.tanggal_join);
              inA.value = autoAkum;
              updatePreviews();
            }
          };
        }

        if (btnCancel) btnCancel.onclick = closeModal;

        if (btnSave) {
          btnSave.onclick = async () => {
            btnSave.disabled = true;
            btnSave.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

            try {
              const valTahunan = parseFloat(inT.value) || 0;
              const valKhusus = parseFloat(inK.value) || 0;
              const valAkumulasi = parseFloat(inA.value) || 0;
              const valSisaLalu = inLalu.value === "" ? null : (parseFloat(inLalu.value) || 0);
              const valExpired = inExp.value.trim();

              const payload = {
                jatah_cuti_tahunan: valTahunan,
                jatah_tahunan: valTahunan,
                jatah_cuti_khusus: valKhusus,
                jatah_khusus: valKhusus,
                jatah_cuti_akumulasi: valAkumulasi,
                jatah_akumulasi: valAkumulasi,
                sisa_cuti_tahun_lalu: valSisaLalu,
                cuti_akumulasi_expired: valExpired || null
              };

              await syncSaveEmployeeLeave(k, payload);
              renderRows();
              closeModal();
              toast(`Jatah cuti ${k.nama_karyawan} berhasil diperbarui!`, "success");
            } catch (err) {
              console.error(err);
              toast("Gagal menyimpan jatah cuti: " + err.message, "error");
            } finally {
              btnSave.disabled = false;
              btnSave.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan Jatah`;
            }
          };
        }
      }
    });
  }

  function renderRows() {
    const searchTerm = (searchInput?.value || "").trim().toLowerCase();
    const filtered = allKaryawan.filter(k => {
      if (!searchTerm) return true;
      const name = (k.nama_karyawan || "").toLowerCase();
      const nik = (k.nik || k.nik_karyawan || "").toLowerCase();
      const jabatan = (k.jabatan || "").toLowerCase();
      return name.includes(searchTerm) || nik.includes(searchTerm) || jabatan.includes(searchTerm);
    });

    if (countDisplay) {
      countDisplay.textContent = `${filtered.length} / ${allKaryawan.length} Karyawan`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">${emptyState("Tidak ada data karyawan yang cocok dengan pencarian.")}</td></tr>`;
      return;
    }

    const now = new Date();
    tbody.innerHTML = filtered.map(k => {
      let masaKerjaStr = "-";
      if (k.tanggal_join) {
        const join = smartParseDate(k.tanggal_join);
        if (join) {
          const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
          const yrs = Math.floor(diffMonths / 12);
          const mths = diffMonths % 12;
          masaKerjaStr = yrs > 0 ? `${yrs} Thn ${mths} Bln` : `${mths} Bln`;
        }
      }

      const empCuti = allCuti.filter(c => c.nama_karyawan === k.nama_karyawan || (k.nik && c.nik === k.nik));
      const calc = getCalculatedJatahCuti(k, empCuti);

      return `
      <tr class="hover:bg-slate-50/70 transition">
        <td class="py-3 px-4">
          <p class="font-bold text-slate-800 text-xs">${escapeHtml(k.nama_karyawan)}</p>
          <p class="text-[11px] text-slate-400 font-medium">${escapeHtml(k.nik || k.nik_karyawan || "-")}</p>
        </td>
        <td class="py-3 px-4 text-slate-600 font-medium text-xs whitespace-nowrap">${masaKerjaStr}</td>
        
        <!-- CUTI TAHUNAN -->
        <td class="py-3 px-4 text-center">
          <div class="inline-flex flex-col items-center">
            <div class="flex items-center gap-1">
              ${isHrdRole ? `
              <input type="number" step="0.5" min="0" data-edit-tahunan="${k.id}" value="${calc.jatahTahunan}" 
                class="w-14 text-center font-bold text-blue-800 border border-blue-200 rounded px-1 py-0.5 text-xs bg-blue-50/50 focus:bg-white focus:border-blue-500 outline-none" title="Klik untuk ubah jatah tahunan langsung">
              ` : `<span class="font-bold text-blue-900 text-xs">${calc.jatahTahunan}</span>`}
              <span class="text-[11px] text-slate-500">/ <b class="text-amber-700">${calc.usedTahunan}</b> / <b class="text-blue-700 font-mono">${calc.sisaTahunan}</b></span>
            </div>
            <span class="text-[10px] text-slate-400 mt-0.5">Sisa: <strong class="text-blue-700">${calc.sisaTahunan} Hari</strong></span>
          </div>
        </td>

        <!-- CUTI KHUSUS -->
        <td class="py-3 px-4 text-center">
          <div class="inline-flex flex-col items-center">
            <div class="flex items-center gap-1">
              ${isHrdRole ? `
              <input type="number" step="0.5" min="0" data-edit-khusus="${k.id}" value="${calc.jatahKhusus}" 
                class="w-14 text-center font-bold text-emerald-800 border border-emerald-200 rounded px-1 py-0.5 text-xs bg-emerald-50/50 focus:bg-white focus:border-emerald-500 outline-none" title="Klik untuk ubah jatah khusus langsung">
              ` : `<span class="font-bold text-emerald-900 text-xs">${calc.jatahKhusus}</span>`}
              <span class="text-[11px] text-slate-500">/ <b class="text-amber-700">${calc.usedKhusus}</b> / <b class="text-emerald-700 font-mono">${calc.sisaKhusus}</b></span>
            </div>
            <span class="text-[10px] text-slate-400 mt-0.5">Sisa: <strong class="text-emerald-700">${calc.sisaKhusus} Hari</strong></span>
          </div>
        </td>

        <!-- CARRYOVER AKUMULASI -->
        <td class="py-3 px-4 text-center">
          <div class="inline-flex flex-col items-center">
            <div class="flex items-center gap-1">
              ${isHrdRole ? `
              <input type="number" step="0.5" min="0" data-edit-akumulasi="${k.id}" value="${calc.jatahAkumulasi}" 
                class="w-14 text-center font-bold text-amber-800 border border-amber-200 rounded px-1 py-0.5 text-xs bg-amber-50/50 focus:bg-white focus:border-amber-500 outline-none" title="Klik untuk ubah jatah akumulasi langsung">
              ` : `<span class="font-bold text-amber-900 text-xs">${calc.jatahAkumulasi}</span>`}
              <span class="text-[11px] text-slate-500">/ <b class="text-amber-700">${calc.usedAkumulasi}</b> / <b class="text-amber-800 font-mono">${calc.sisaAkumulasi}</b></span>
            </div>
            <span class="text-[10px] text-slate-400 mt-0.5">Sisa: <strong class="text-amber-700">${calc.sisaAkumulasi} Hari</strong></span>
          </div>
        </td>

        <!-- SISA CUTI TAHUN LALU (INPUT MANUAL) -->
        <td class="py-3 px-4 text-center">
          ${isHrdRole ? `
          <input type="number" step="0.5" min="0" data-sisa-lalu="${k.id}"
            value="${k.sisa_cuti_tahun_lalu ?? ""}" placeholder="0"
            class="w-16 text-center px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-maroon-400 text-xs font-semibold text-slate-700">
          ` : `<span>${k.sisa_cuti_tahun_lalu ?? "-"}</span>`}
        </td>

        <!-- AKSI -->
        <td class="py-3 px-4 text-center whitespace-nowrap">
          ${isHrdRole ? `
          <button data-btn-edit-karyawan-jatah="${k.id}" class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-maroon-700 bg-maroon-50 hover:bg-maroon-100 border border-maroon-200 rounded-lg transition shadow-2xs">
            <i class="fa-solid fa-pen-to-square"></i> Edit Jatah
          </button>
          ` : `<span class="text-slate-400 text-xs">-</span>`}
        </td>
      </tr>
      `;
    }).join("");

    // Event listener inline edit tahunan
    tbody.querySelectorAll("[data-edit-tahunan]").forEach(inp => {
      inp.addEventListener("change", async () => {
        const id = inp.dataset.editTahunan;
        const val = parseFloat(inp.value) || 0;
        try {
          const emp = allKaryawan.find(k => k.id === id);
          if (emp) {
            await syncSaveEmployeeLeave(emp, { 
              jatah_cuti_tahunan: val,
              jatah_tahunan: val
            });
            renderRows();
            toast(`Jatah Cuti Tahunan ${emp.nama_karyawan} diperbarui: ${val} Hari`, "success");
          }
        } catch (e) {
          toast("Gagal menyimpan: " + e.message, "error");
        }
      });
    });

    // Event listener inline edit khusus
    tbody.querySelectorAll("[data-edit-khusus]").forEach(inp => {
      inp.addEventListener("change", async () => {
        const id = inp.dataset.editKhusus;
        const val = parseFloat(inp.value) || 0;
        try {
          const emp = allKaryawan.find(k => k.id === id);
          if (emp) {
            await syncSaveEmployeeLeave(emp, { 
              jatah_cuti_khusus: val,
              jatah_khusus: val
            });
            renderRows();
            toast(`Jatah Cuti Khusus ${emp.nama_karyawan} diperbarui: ${val} Hari`, "success");
          }
        } catch (e) {
          toast("Gagal menyimpan: " + e.message, "error");
        }
      });
    });

    // Event listener inline edit akumulasi
    tbody.querySelectorAll("[data-edit-akumulasi]").forEach(inp => {
      inp.addEventListener("change", async () => {
        const id = inp.dataset.editAkumulasi;
        const val = parseFloat(inp.value) || 0;
        try {
          const emp = allKaryawan.find(k => k.id === id);
          if (emp) {
            await syncSaveEmployeeLeave(emp, { 
              jatah_cuti_akumulasi: val,
              jatah_akumulasi: val
            });
            renderRows();
            toast(`Jatah Cuti Akumulasi ${emp.nama_karyawan} diperbarui: ${val} Hari`, "success");
          }
        } catch (e) {
          toast("Gagal menyimpan: " + e.message, "error");
        }
      });
    });

    // Event listener inline edit sisa cuti tahun lalu
    tbody.querySelectorAll("[data-sisa-lalu]").forEach(inp => {
      inp.addEventListener("change", async () => {
        const id = inp.dataset.sisaLalu;
        const val = inp.value === "" ? null : (parseFloat(inp.value) || 0);
        try {
          const emp = allKaryawan.find(k => k.id === id);
          if (emp) {
            let jAkumulasiBaru = 0;
            if (val !== null && val > 0) {
              jAkumulasiBaru = calculateCarryoverJatah(val, emp.tanggal_join);
            }
            await syncSaveEmployeeLeave(emp, { 
              sisa_cuti_tahun_lalu: val,
              jatah_cuti_akumulasi: jAkumulasiBaru,
              jatah_akumulasi: jAkumulasiBaru
            });
            renderRows();
            toast(`Sisa cuti tahun lalu ${emp.nama_karyawan} diperbarui`, "success");
          }
        } catch (e) {
          toast("Gagal menyimpan: " + e.message, "error");
        }
      });
    });

    // Event listener tombol modal edit
    tbody.querySelectorAll("[data-btn-edit-karyawan-jatah]").forEach(btn => {
      btn.onclick = () => {
        const emp = allKaryawan.find(k => k.id === btn.dataset.btnEditKaryawanJatah);
        if (emp) openEditModal(emp);
      };
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderRows();
    });
  }

  // ==========================================
  // 1. MEMUAT & MENAMPILKAN DATA KARYAWAN
  // ==========================================
  async function loadData() {
    const [dataKaryawan, dataCuti] = await Promise.all([
      fsGetAll(COL.MASTER_KARYAWAN),
      fsGetAll(COL.MASTER_CUTI)
    ]);
    allKaryawan = dataKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF" && k.nama_karyawan && k.nama_karyawan.trim() !== "");
    allKaryawan.sort((a,b) => (a.nama_karyawan||"").localeCompare(b.nama_karyawan||"", "id", { sensitivity: "base" }));
    allCuti = dataCuti || [];

    if (allKaryawan.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">${emptyState("Belum ada data karyawan aktif.")}</td></tr>`;
      return;
    }

    renderRows();
  }

  // ==========================================
  // 2. PROSES IMPORT FILE EXCEL
  // ==========================================
  if (btnImport && fileInput) {
    btnImport.onclick = () => fileInput.click();
    
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, {type: 'array'});
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(worksheet);

          if (json.length === 0) throw new Error("File Excel kosong.");

          btnImport.disabled = true;
          btnImport.textContent = "Memproses...";

          const getVal = (row, names) => {
            const rowKeys = Object.keys(row);
            for (const n of names) {
              const cleanN = n.toLowerCase().replace(/[^a-z0-9]/g, "");
              for (const k of rowKeys) {
                const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (cleanK === cleanN) return row[k];
              }
            }
            for (const n of names) {
              const cleanN = n.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (!cleanN) continue;
              for (const k of rowKeys) {
                const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (cleanK.includes(cleanN) || cleanN.includes(cleanK)) return row[k];
              }
            }
            return undefined;
          };

          const parseNum = (v) => {
            if (v === undefined || v === null || v === "") return null;
            if (typeof v === "number") return isNaN(v) ? null : v;
            const str = String(v).trim().replace(",", ".");
            const m = str.match(/-?\d+(\.\d+)?/);
            if (m) {
              const res = parseFloat(m[0]);
              return isNaN(res) ? null : res;
            }
            return null;
          };

          let updateCount = 0;

          for (const row of json) {
            const nikRaw = getVal(row, ["nik", "no induk", "no. induk", "nomor induk", "id karyawan", "nip", "no karyawan", "kode karyawan", "id"]);
            const namaRaw = getVal(row, ["nama karyawan", "nama", "nama lengkap", "karyawan", "nama_karyawan", "nama pemohon"]);

            const cleanNik = nikRaw !== undefined && nikRaw !== null ? String(nikRaw).trim() : "";
            const cleanNama = namaRaw !== undefined && namaRaw !== null ? String(namaRaw).trim().toLowerCase().replace(/\s+/g, " ") : "";

            if (!cleanNik && !cleanNama) continue;

            let targetEmp = null;
            if (cleanNik) {
              const pureNik = cleanNik.replace(/^0+/, "");
              targetEmp = allKaryawan.find(k => {
                const kNik = (k.nik || k.nik_karyawan || "").toString().trim();
                return kNik && (kNik === cleanNik || kNik.replace(/^0+/, "") === pureNik);
              });
            }
            if (!targetEmp && cleanNama) {
              targetEmp = allKaryawan.find(k => (k.nama_karyawan || "").trim().toLowerCase().replace(/\s+/g, " ") === cleanNama);
              if (!targetEmp && cleanNama.length >= 4) {
                targetEmp = allKaryawan.find(k => {
                  const kN = (k.nama_karyawan || "").trim().toLowerCase().replace(/\s+/g, " ");
                  return kN.includes(cleanNama) || cleanNama.includes(kN);
                });
              }
            }

            if (!targetEmp) continue;

            const jTahunan = parseNum(getVal(row, ["jatah cuti tahunan", "jatah tahunan", "jatah tahunan awal", "jatah cuti tahunan awal", "cuti tahunan", "tahunan", "hak cuti tahunan", "saldo cuti tahunan", "sisa cuti tahunan"]));
            const jKhusus = parseNum(getVal(row, ["jatah cuti khusus", "jatah khusus", "jatah khusus awal", "jatah cuti khusus awal", "cuti khusus", "khusus", "hak cuti khusus", "saldo cuti khusus", "sisa cuti khusus"]));
            const jAkumulasi = parseNum(getVal(row, ["jatah cuti akumulasi", "jatah akumulasi", "jatah akumulasi carryover", "carryover akumulasi", "carryover", "akumulasi", "cuti akumulasi", "hak cuti akumulasi", "saldo cuti akumulasi", "sisa cuti akumulasi"]));
            const sisaLalu = parseNum(getVal(row, ["sisa cuti tahun lalu", "sisa cuti tahun lalu manual hrd", "sisa cuti tahun lalu input manual hrd", "sisa tahun lalu", "sisa cuti lalu", "sisa lalu", "sisa cuti tahun sebelumnya", "cuti tahun lalu"]));

            const payload = {};
            let hasChange = false;

            if (jTahunan !== null) {
              payload.jatah_cuti_tahunan = jTahunan;
              payload.jatah_tahunan = jTahunan;
              hasChange = true;
            }
            if (jKhusus !== null) {
              payload.jatah_cuti_khusus = jKhusus;
              payload.jatah_khusus = jKhusus;
              hasChange = true;
            }
            if (jAkumulasi !== null) {
              payload.jatah_cuti_akumulasi = jAkumulasi;
              payload.jatah_akumulasi = jAkumulasi;
              hasChange = true;
            }
            if (sisaLalu !== null) {
              payload.sisa_cuti_tahun_lalu = sisaLalu;
              if (jAkumulasi === null) {
                const calcAkum = calculateCarryoverJatah(sisaLalu, targetEmp.tanggal_join);
                payload.jatah_cuti_akumulasi = calcAkum;
                payload.jatah_akumulasi = calcAkum;
              }
              hasChange = true;
            }

            if (hasChange) {
              await syncSaveEmployeeLeave(targetEmp, payload);
              updateCount++;
            }
          }

          toast(`Berhasil mengupdate jatah cuti ${updateCount} karyawan dari file Excel!`, "success");
          await loadData();
        } catch (err) {
          console.error(err);
          toast("Gagal membaca Excel: " + err.message, "error");
        } finally {
          btnImport.disabled = false;
          btnImport.innerHTML = `<i class="fa-solid fa-file-import opacity-80"></i> Import Excel`;
          fileInput.value = ""; 
        }
      };
      reader.readAsArrayBuffer(file);
    };
  }

  // ==========================================
  // 3. KALKULASI & RESET OTOMATIS (SK 018)
  // ==========================================
  if (btnReset) {
    btnReset.onclick = async () => {
      if (!confirm("Apakah Anda yakin ingin me-reset jatah cuti seluruh karyawan aktif?\n\nSistem akan menggunakan 'Sisa Cuti Tahun Lalu' (input manual HRD / Import Excel) dikalikan persentase masa kerja sebagai basis carryover cuti akumulasi (sesuai SK No.018/HRGA-AJ/XII/2024):\n- 0 s/d < 3 tahun: 0%\n- 3 s/d < 5 tahun: 50%\n- 5 tahun ke atas: 100%\n\nLanjutkan?")) return;

      btnReset.disabled = true;
      btnReset.textContent = "Mengkalkulasi...";

      try {
        const now = new Date();
        const nextYear = now.getFullYear() + 1;

        const allCutiLog = await fsGetAll(COL.MASTER_CUTI);
        const tahunLalu = now.getFullYear() - 1;
        const terpakaiTahunLalu = {};
        allCutiLog.forEach(r => {
          const key = r.nama_karyawan;
          if (!key) return;
          const rowYear = parseInt(r.tahun) || (r.tanggal ? new Date(r.tanggal).getFullYear() : null);
          if (rowYear !== tahunLalu) return;
          if (!terpakaiTahunLalu[key]) terpakaiTahunLalu[key] = { Tahunan: 0, Akumulasi: 0 };
          if (r.potong_jatah === "Tahunan" || r.potong_jatah === "Akumulasi") {
            terpakaiTahunLalu[key][r.potong_jatah] += parseFloat(r.count) || 0;
          }
        });

        for (const emp of allKaryawan) {
          let jTahunanBaru = 12;
          let jKhusus = 4;
          let jAkumulasiBaru = 0;

          const jatahTahunanLama = toNumber(emp.jatah_cuti_tahunan ?? emp.jatah_tahunan ?? 12);
          const used = terpakaiTahunLalu[emp.nama_karyawan] || { Tahunan: 0, Akumulasi: 0 };

          const sisaLaluManual = emp.sisa_cuti_tahun_lalu;
          const adaInputManual = sisaLaluManual !== undefined && sisaLaluManual !== null && sisaLaluManual !== "";
          const sisaTahunanAktual = Math.max(jatahTahunanLama - used.Tahunan, 0);
          const totalSisaUntukCarry = adaInputManual ? toNumber(sisaLaluManual) : sisaTahunanAktual;

          if (emp.tanggal_join) {
            const join = smartParseDate(emp.tanggal_join);
            if (join) {
              const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
              const tenureYears = diffMonths / 12;

              if (diffMonths >= 12) {
                if (tenureYears >= 10 || diffMonths >= 120) jTahunanBaru = 16;
                else if (tenureYears >= 8 || diffMonths >= 96) jTahunanBaru = 14;
                else if (tenureYears >= 6 || diffMonths >= 72) jTahunanBaru = 13;
                else jTahunanBaru = 12;
              } else if (diffMonths >= 3) {
                jTahunanBaru = diffMonths;
              } else {
                jTahunanBaru = 0;
              }

              if (tenureYears >= 5 || diffMonths >= 60) {
                jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 1.0);
              } else if (tenureYears >= 3 || diffMonths >= 36) {
                jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 0.5);
              } else {
                jAkumulasiBaru = 0;
              }
            } else {
              jTahunanBaru = 12;
              jAkumulasiBaru = 0;
            }
          } else {
            jTahunanBaru = 12;
            jAkumulasiBaru = 0;
          }

          await syncSaveEmployeeLeave(emp, {
            jatah_cuti_tahunan: jTahunanBaru, jatah_tahunan: jTahunanBaru,
            jatah_cuti_khusus: jKhusus, jatah_khusus: jKhusus,
            jatah_cuti_akumulasi: jAkumulasiBaru, jatah_akumulasi: jAkumulasiBaru,
            sisa_cuti_tahun_lalu: null,
            cuti_akumulasi_expired: `30 Juni ${nextYear}`
          });
        }

        toast("Kalkulasi & Reset Tahunan Selesai Berhasil (mengacu SK No.018/HRGA-AJ/XII/2024)!", "success");
        await loadData();
      } catch (err) {
        console.error(err);
        toast("Terjadi kesalahan saat mereset data.", "error");
      } finally {
        btnReset.disabled = false;
        btnReset.innerHTML = `<i class="fa-solid fa-rotate opacity-80"></i> Reset Otomatis`;
      }
    };
  }

  await loadData();
  return { unmount() {} };
}
