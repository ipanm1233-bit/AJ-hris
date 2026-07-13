import { COL } from "../firebase-config.js";
import { fsGetAll, fsUpdate, openModal, closeModal, toast, toNumber, escapeHtml } from "../utils.js";
import { renderCrudModule, badge, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  const tbody = container.querySelector("#cuti-jatah-tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="p-4"><div class="space-y-2">${skeletonRows(3)}</div></td></tr>`;
  
  const [karyawan, cutiLog] = await Promise.all([fsGetAll(COL.MASTER_KARYAWAN), fsGetAll(COL.MASTER_CUTI)]);
  
  const terpakaiMap = {};
  cutiLog.forEach(r => {
    const key = r.nama_karyawan;
    if (!terpakaiMap[key]) terpakaiMap[key] = { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
    if (r.potong_jatah && terpakaiMap[key][r.potong_jatah] !== undefined) terpakaiMap[key][r.potong_jatah] += toNumber(r.count) || 1;
  });

  function renderTable(list) {
    if (!list.length) { tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Tidak ada data karyawan.</td></tr>`; return; }
    tbody.innerHTML = list.map(k => {
      const used = terpakaiMap[k.nama_karyawan] || { Tahunan: 0, Khusus: 0, Akumulasi: 0 };
      const cell = (jatah, used_, tone) => {
        const sisa = Math.max(toNumber(jatah) - used_, 0);
        return `<div class="text-center"><span class="font-semibold text-slate-700">${sisa}</span><span class="text-slate-400 text-xs"> / ${toNumber(jatah)}</span></div>`;
      };
      return `
        <tr class="border-t border-slate-50 hover:bg-slate-50/60 transition">
          <td class="px-4 py-3">
            <p class="font-medium text-slate-700">${escapeHtml(k.nama_karyawan)}</p>
            <p class="text-xs text-slate-400">${escapeHtml(k.jabatan || "-")}</p>
          </td>
          <td class="px-4 py-3 text-slate-500">${escapeHtml(k.cabang || "-")}</td>
          <td class="px-4 py-3">${cell(k.jatah_tahunan, used.Tahunan)}</td>
          <td class="px-4 py-3">${cell(k.jatah_khusus, used.Khusus)}</td>
          <td class="px-4 py-3">${cell(k.jatah_akumulasi, used.Akumulasi)}</td>
          <td class="px-4 py-3 text-right">
            <button data-edit-jatah="${k.id}" class="text-xs font-medium text-maroon-700 hover:underline">Atur Jatah</button>
          </td>
        </tr>`;
    }).join("");
    
    tbody.querySelectorAll("[data-edit-jatah]").forEach(btn => {
      btn.addEventListener("click", () => openJatahModal(karyawan.find(k => k.id === btn.dataset.editJatah), tbody, renderTable, karyawan));
    });
  }
  
  renderTable(karyawan);
  
  container.querySelector("#cuti-search").addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    renderTable(karyawan.filter(k => (k.nama_karyawan || "").toLowerCase().includes(term)));
  });

  const panelJatah = container.querySelector("#cuti-panel-jatah");
  const panelLog = container.querySelector("#cuti-panel-log");
  
  container.querySelectorAll(".cuti-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const active = btn.dataset.ctab === "jatah";
      panelJatah.classList.toggle("hidden", !active);
      panelLog.classList.toggle("hidden", active);
      
      container.querySelectorAll(".cuti-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      
      if (!active && !panelLog.dataset.loaded) {
        panelLog.dataset.loaded = "1";
        await renderCrudModule(panelLog, {
          title: "Log Pengambilan Cuti",
          subtitle: "Seluruh histori cuti/izin karyawan hasil migrasi & input manual.",
          collectionName: COL.MASTER_CUTI,
          idPrefix: "CUTI",
          searchFields: ["nama_karyawan", "cabang", "keterangan_cuti"],
          columns: [
            { key: "tanggal", label: "Tanggal", type: "date" },
            { key: "nama_karyawan", label: "Karyawan" },
            { key: "cabang", label: "Cabang" },
            { key: "type_cuti", label: "Tipe", type: "badge" },
            { key: "potong_jatah", label: "Potong Jatah", type: "badge" },
            { key: "keterangan_cuti", label: "Keterangan" },
            { key: "count", label: "Jml Hari", type: "number" },
          ],
          formFields: [
            { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
            { name: "cabang", label: "Cabang", type: "text" },
            { name: "jabatan", label: "Jabatan", type: "text" },
            { name: "tanggal", label: "Tanggal", type: "date", required: true },
            { name: "type_cuti", label: "Tipe Cuti", type: "text" },
            { name: "potong_jatah", label: "Potong Jatah", type: "select", options: ["Tahunan", "Khusus", "Akumulasi"], required: true },
            { name: "count", label: "Jumlah Hari", type: "number", default: 1, required: true },
            { name: "keterangan_cuti", label: "Keterangan", type: "textarea", full: true },
          ]
        });
      }
    });
  });
  return { unmount() {} };
}

function openJatahModal(karyawan, tbody, renderTable, allKaryawan) {
  if (!karyawan) return;
  openModal({
    title: `Atur Jatah Cuti — ${karyawan.nama_karyawan}`,
    bodyHtml: `
      <form id="jatah-form" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Jatah Cuti Tahunan (hari)</label>
          <input type="number" name="jatah_tahunan" value="${toNumber(karyawan.jatah_tahunan)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Jatah Cuti Khusus (hari)</label>
          <input type="number" name="jatah_khusus" value="${toNumber(karyawan.jatah_khusus)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Jatah Cuti Akumulasi (hari)</label>
          <input type="number" name="jatah_akumulasi" value="${toNumber(karyawan.jatah_akumulasi)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
      </form>`,
    footerHtml: `
      <button id="jatah-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="jatah-save" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition">Simpan Perubahan</button>`,
    onMount: (m) => {
      m.querySelector("#jatah-cancel").onclick = closeModal;
      m.querySelector("#jatah-save").onclick = async () => {
        const fd = new FormData(m.querySelector("#jatah-form"));
        const data = {
          jatah_tahunan: toNumber(fd.get("jatah_tahunan")),
          jatah_khusus: toNumber(fd.get("jatah_khusus")),
          jatah_akumulasi: toNumber(fd.get("jatah_akumulasi")),
        };
        try {
          // PERBAIKAN: Gunakan ID dokumen asli (bukan sekedar NIK yang mungkin undefined)
          await fsUpdate(COL.MASTER_KARYAWAN, String(karyawan.id), data);
          Object.assign(karyawan, data);
          toast("Jatah cuti berhasil diperbarui", "success");
          closeModal();
          renderTable(allKaryawan);
        } catch (e) { toast("Gagal menyimpan: " + e.message, "error"); }
      };
    }
  });
}
