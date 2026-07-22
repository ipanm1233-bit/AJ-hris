import { db, COL, doc, getDoc } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, fsDelete, toast, fmtDateShort, fmtRupiah,
  escapeHtml, genId, confirmDialog, toNumber
} from "../utils.js";
import { icon, emptyState, openExportPicker } from "../components.js";

const COLUMNS = [
  { key: "tanggal", label: "Tanggal", type: "date" },
  { key: "tujuan", label: "Area / Kota Tujuan" },
  { key: "no_polisi", label: "Plat Nomor Kendaraan" },
  { key: "driver", label: "Nama Driver" },
  { key: "um_driver", label: "Uang Makan Driver", type: "currency" },
  { key: "helper", label: "Nama Helper" },
  { key: "um_helper", label: "Uang Makan Helper", type: "currency" },
  { key: "jml_toko", label: "Jml Toko" },
  { key: "realisasi_toko", label: "Realisasi" },
  { key: "keterangan_selisih", label: "Keterangan Selisih" },
  { key: "uang_makan", label: "Total Uang Makan", type: "currency" },
];

export async function mount(container) {
  const [karyawan, kendaraan, settingsSnap] = await Promise.all([
    fsGetAll(COL.MASTER_KARYAWAN),
    fsGetAll(COL.MASTER_KENDARAAN),
    getDoc(doc(db, COL.APP_SETTINGS, "main")),
  ]);

  const activeEmpNames = karyawan
    .filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF")
    .map(k => k.nama_karyawan)
    .sort();

  const platNomor = kendaraan.map(k => k.no_polisi).filter(Boolean).sort();

  const tarif = (settingsSnap.exists() ? settingsSnap.data().tarif : {}) || {};
  const rateDriver = toNumber(tarif.um_driver) || 0;
  const rateHelper = toNumber(tarif.um_helper) || 0;

  let rows = [];
  let editId = null;

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">Uang Makan Ekspedisi — Input Per Trip</h1>
          <p class="text-sm text-slate-500 mt-1">Pencatatan & kalkulasi otomatis jatah makan tim lapangan.</p>
        </div>
        <button id="um-btn-refresh" class="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition">${icon("refresh","w-4 h-4")} Segarkan</button>
      </div>

      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 id="um-form-title" class="font-semibold text-slate-700 mb-4 flex items-center gap-2">${icon("doc-plus","w-4 h-4")} Form Input Trip Pengiriman</h3>
        <form id="um-form" class="space-y-5">
          <input type="hidden" name="edit_id">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Tanggal Pengiriman <span class="text-red-500">*</span></label>
              <input type="date" name="tanggal" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Area / Kota Tujuan <span class="text-red-500">*</span></label>
              <input type="text" name="tujuan" required placeholder="Contoh: Majalengka, Indramayu" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none">
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Plat Nomor Kendaraan <span class="text-red-500">*</span></label>
            <select name="no_polisi" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none">
              <option value="">${platNomor.length ? "Pilih kendaraan..." : "Belum ada data kendaraan"}</option>
              ${platNomor.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
            </select>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Berangkat</label>
              <input type="time" name="jam_berangkat" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Tiba</label>
              <input type="time" name="jam_tiba" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Jml Toko</label>
              <input type="number" name="jml_toko" min="0" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">Realisasi</label>
              <input type="number" name="realisasi_toko" min="0" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
            </div>
          </div>

          <div class="bg-blue-50/60 border border-blue-100 rounded-xl p-4">
            <p class="text-xs font-semibold text-blue-800 mb-3">Driver</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">Nama Driver <span class="text-red-500">*</span></label>
                <input type="text" name="driver" list="um-dl-nama" required placeholder="Cari nama driver..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">Uang Makan Driver (Rp)</label>
                <input type="text" id="um-display-driver" disabled value="${fmtRupiah(rateDriver)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-100 text-slate-500 outline-none">
              </div>
            </div>
          </div>

          <div class="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4">
            <p class="text-xs font-semibold text-emerald-800 mb-3">Helper</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">Nama Helper</label>
                <input type="text" name="helper" list="um-dl-nama" placeholder="Cari nama helper (opsional)..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">Uang Makan Helper (Rp)</label>
                <input type="text" id="um-display-helper" disabled value="Rp 0" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-100 text-slate-500 outline-none">
              </div>
            </div>
          </div>

          <datalist id="um-dl-nama">
            ${activeEmpNames.map(n => `<option value="${escapeHtml(n)}">`).join("")}
          </datalist>

          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Keterangan / Alasan Selisih Toko</label>
            <input type="text" name="keterangan_selisih" placeholder="Tulis alasan jika Jumlah Toko ≠ Realisasi" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none">
          </div>

          <div class="flex gap-2">
            <button type="submit" id="um-btn-submit" class="flex-1 flex items-center justify-center gap-2 bg-maroon-800 hover:bg-maroon-900 text-white font-semibold py-3 rounded-lg transition">
              ${icon("check-circle","w-4 h-4")} Simpan Trip (Driver + Helper Sekaligus)
            </button>
            <button type="button" id="um-btn-cancel-edit" class="hidden px-4 py-3 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">Batal Edit</button>
          </div>
        </form>
      </div>

      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 class="font-semibold text-slate-700">Riwayat Trip</h3>
          <button id="um-btn-export" class="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition" title="Export">${icon("download","w-4 h-4")}</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Tanggal</th>
                <th class="px-4 py-3 text-left font-medium">Tujuan</th>
                <th class="px-4 py-3 text-left font-medium">Kendaraan</th>
                <th class="px-4 py-3 text-left font-medium">Driver</th>
                <th class="px-4 py-3 text-left font-medium">Helper</th>
                <th class="px-4 py-3 text-left font-medium">Toko (Target/Real)</th>
                <th class="px-4 py-3 text-left font-medium">Total UM</th>
                <th class="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody id="um-tbody"></tbody>
          </table>
        </div>
        <div id="um-empty"></div>
      </div>
    </div>`;

  const form = container.querySelector("#um-form");
  const tbody = container.querySelector("#um-tbody");
  const emptyEl = container.querySelector("#um-empty");
  const displayDriver = container.querySelector("#um-display-driver");
  const displayHelper = container.querySelector("#um-display-helper");
  const btnSubmit = container.querySelector("#um-btn-submit");
  const btnCancelEdit = container.querySelector("#um-btn-cancel-edit");
  const formTitle = container.querySelector("#um-form-title");

  form.helper.addEventListener("input", () => {
    displayHelper.value = form.helper.value.trim() ? fmtRupiah(rateHelper) : fmtRupiah(0);
  });

  function resetForm() {
    form.reset();
    form.edit_id.value = "";
    editId = null;
    displayDriver.value = fmtRupiah(rateDriver);
    displayHelper.value = fmtRupiah(0);
    btnSubmit.innerHTML = `${icon("check-circle","w-4 h-4")} Simpan Trip (Driver + Helper Sekaligus)`;
    btnCancelEdit.classList.add("hidden");
    formTitle.textContent = "Form Input Trip Pengiriman";
  }

  function startEdit(row) {
    editId = row.id;
    form.edit_id.value = row.id;
    form.tanggal.value = row.tanggal ? String(row.tanggal).slice(0, 10) : "";
    form.tujuan.value = row.tujuan || "";
    form.no_polisi.value = row.no_polisi || "";
    form.jam_berangkat.value = row.jam_berangkat || "";
    form.jam_tiba.value = row.jam_tiba || "";
    form.jml_toko.value = row.jml_toko ?? "";
    form.realisasi_toko.value = row.realisasi_toko ?? "";
    form.driver.value = row.driver || "";
    form.helper.value = row.helper || "";
    form.keterangan_selisih.value = row.keterangan_selisih || "";
    displayDriver.value = fmtRupiah(row.um_driver ?? rateDriver);
    displayHelper.value = fmtRupiah(row.um_helper ?? 0);
    btnSubmit.innerHTML = `${icon("check-circle","w-4 h-4")} Update Trip`;
    btnCancelEdit.classList.remove("hidden");
    formTitle.textContent = `Edit Trip — ${row.tujuan || ""}`;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  btnCancelEdit.addEventListener("click", resetForm);

  function renderRows() {
    if (!rows.length) {
      tbody.innerHTML = "";
      emptyEl.innerHTML = emptyState("Belum ada data trip", "Klik Simpan pada form di atas untuk menambah data.");
      return;
    }
    emptyEl.innerHTML = "";
    tbody.innerHTML = rows.map(r => `
      <tr class="border-t border-slate-50 hover:bg-slate-50/60 transition">
        <td class="px-4 py-3 text-slate-700">${fmtDateShort(r.tanggal)}</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(r.tujuan || "-")}</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(r.no_polisi || "-")}</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(r.driver || "-")}</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(r.helper || "-")}</td>
        <td class="px-4 py-3 text-slate-700">${r.jml_toko ?? "-"} / ${r.realisasi_toko ?? "-"}</td>
        <td class="px-4 py-3 font-mono text-blue-700 font-semibold">${fmtRupiah(r.uang_makan)}</td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <button data-edit="${r.id}" class="text-slate-400 hover:text-maroon-700 p-1.5 rounded-lg hover:bg-maroon-50 transition">${icon("edit","w-4 h-4")}</button>
          <button data-del="${r.id}" class="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition">${icon("trash","w-4 h-4")}</button>
        </td>
      </tr>`).join("");

    tbody.querySelectorAll("[data-edit]").forEach(btn => {
      btn.onclick = () => startEdit(rows.find(r => r.id === btn.dataset.edit));
    });
    tbody.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = async () => {
        const ok = await confirmDialog("Data trip yang dihapus tidak dapat dikembalikan. Lanjutkan?");
        if (!ok) return;
        await fsDelete(COL.UANG_MAKAN_EXPEDISI, btn.dataset.del);
        toast("Data trip berhasil dihapus", "success");
        if (editId === btn.dataset.del) resetForm();
        await load();
      };
    });
  }

  async function load() {
    rows = await fsGetAll(COL.UANG_MAKAN_EXPEDISI);
    rows.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    renderRows();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const jmlToko = form.jml_toko.value === "" ? null : toNumber(form.jml_toko.value);
    const realisasi = form.realisasi_toko.value === "" ? null : toNumber(form.realisasi_toko.value);
    const keterangan = form.keterangan_selisih.value.trim();

    if (jmlToko !== null && realisasi !== null && jmlToko !== realisasi && !keterangan) {
      toast("Jml Toko dan Realisasi berbeda — mohon isi Keterangan/Alasan Selisih Toko", "warning");
      return;
    }

    const helperName = form.helper.value.trim();
    const umDriver = rateDriver;
    const umHelper = helperName ? rateHelper : 0;

    const payload = {
      tanggal: form.tanggal.value,
      tujuan: form.tujuan.value.trim(),
      no_polisi: form.no_polisi.value,
      jam_berangkat: form.jam_berangkat.value,
      jam_tiba: form.jam_tiba.value,
      jml_toko: jmlToko,
      realisasi_toko: realisasi,
      driver: form.driver.value.trim(),
      um_driver: umDriver,
      helper: helperName,
      um_helper: umHelper,
      keterangan_selisih: keterangan,
      uang_makan: umDriver + umHelper,
    };

    try {
      if (editId) {
        await fsUpdate(COL.UANG_MAKAN_EXPEDISI, editId, payload);
        toast("Data trip berhasil diperbarui", "success");
      } else {
        await fsAdd(COL.UANG_MAKAN_EXPEDISI, payload, genId("UME"));
        toast("Trip berhasil disimpan (driver + helper sekaligus)", "success");
      }
      resetForm();
      await load();
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan data: " + err.message, "error");
    }
  });

  container.querySelector("#um-btn-refresh")?.addEventListener("click", load);
  container.querySelector("#um-btn-export")?.addEventListener("click", () => {
    if (!rows.length) { toast("Tidak ada data untuk diekspor", "warning"); return; }
    openExportPicker("Uang Makan Expedisi", COLUMNS, rows);
  });

  resetForm();
  await load();

  return { unmount() {} };
}
