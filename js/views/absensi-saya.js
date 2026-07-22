import { COL } from "../firebase-config.js";
import { fsGetAll, escapeHtml, fmtDateShort } from "../utils.js";
import { badge, emptyState } from "../components.js";

export async function mount(container, { session }) {
  const tbody = container.querySelector("#as-tbody");
  const filterStart = container.querySelector("#as-filter-start");
  const filterEnd = container.querySelector("#as-filter-end");
  const btnReset = container.querySelector("#as-btn-reset");
  const elTotalHadir = container.querySelector("#as-total-hadir");
  const elTotalBulanIni = container.querySelector("#as-total-bulan-ini");
  const elTotalBelumPulang = container.querySelector("#as-total-belum-pulang");
  const elPeriodeLabel = container.querySelector("#as-periode-label");

  tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 text-sm">Memuat data absensi Anda...</td></tr>`;

  let myRecords = [];
  try {
    const all = await fsGetAll(COL.DATA_ABSENSI);
    // Karyawan hanya boleh melihat rekap absensi miliknya sendiri (berdasarkan NIK, fallback ke nama).
    myRecords = all.filter(r => {
      if (session.nik && r.nik) return String(r.nik) === String(session.nik);
      return (r.nama || "").trim().toLowerCase() === (session.nama || "").trim().toLowerCase();
    }).sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500 text-sm">Gagal memuat data: ${escapeHtml(e.message)}</td></tr>`;
    return;
  }

  function render() {
    const start = filterStart.value;
    const end = filterEnd.value;
    const filtered = myRecords.filter(r => {
      if (start && r.tanggal < start) return false;
      if (end && r.tanggal > end) return false;
      return true;
    });

    elPeriodeLabel.textContent = (start || end) ? `${start ? fmtDateShort(start) : "Awal"} - ${end ? fmtDateShort(end) : "Sekarang"}` : "Seluruh data";

    const now = new Date();
    const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    elTotalHadir.textContent = myRecords.length;
    elTotalBulanIni.textContent = myRecords.filter(r => (r.tanggal || "").startsWith(curYm)).length;
    elTotalBelumPulang.textContent = myRecords.filter(r => r.scan_masuk && !r.scan_keluar).length;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="4">${emptyState("Belum ada rekap absensi pada periode ini", "Data akan muncul otomatis setelah proses absensi/sinkronisasi oleh HRD.")}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      let statusBadge;
      if (r.scan_masuk && r.scan_keluar) statusBadge = badge("Hadir Lengkap", "green");
      else if (r.scan_masuk && !r.scan_keluar) statusBadge = badge("Belum Scan Pulang", "amber");
      else statusBadge = badge("Data Tidak Lengkap", "slate");

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(fmtDateShort(r.tanggal) || r.tanggal || "-")}</td>
          <td class="px-4 py-3 text-center font-mono">${escapeHtml(r.scan_masuk || "-")}</td>
          <td class="px-4 py-3 text-center font-mono">${escapeHtml(r.scan_keluar || "-")}</td>
          <td class="px-4 py-3 text-center">${statusBadge}</td>
        </tr>`;
    }).join("");
  }

  filterStart.onchange = render;
  filterEnd.onchange = render;
  btnReset.onclick = () => { filterStart.value = ""; filterEnd.value = ""; render(); };

  render();
}
