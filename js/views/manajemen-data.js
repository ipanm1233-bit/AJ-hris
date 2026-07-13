import { COL } from "../firebase-config.js";
import { fsGetAll, escapeHtml } from "../utils.js";
import { renderCrudModule, badge, emptyState, icon, skeletonRows } from "../components.js";

export async function mount(container) {
  const panels = {
    karyawan: container.querySelector("#md-panel-karyawan"),
    rekap: container.querySelector("#md-panel-rekap"),
    dokumen: container.querySelector("#md-panel-dokumen"),
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
      searchFields: ["nama_karyawan", "nik_karyawan", "jabatan", "cabang"],
      columns: [
        { key: "nik_karyawan", label: "NIK" },
        { key: "nama_karyawan", label: "Nama" },
        { key: "jabatan", label: "Jabatan" },
        { key: "cabang", label: "Cabang" },
        { key: "status_karyawan", label: "Status", type: "badge" },
        { key: "aktif_tdk_aktif", label: "Aktif", type: "badge", badgeTone: (v) => v === "AKTIF" ? "green" : "red" },
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
    const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
    const docs = ["dokumen_ktp", "dokumen_kk", "dokumen_bpjs", "dokumen_npwp"];
    const docLabels = { dokumen_ktp: "KTP", dokumen_kk: "Kartu Keluarga", dokumen_bpjs: "BPJS", dokumen_npwp: "NPWP" };
    panels.dokumen.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="p-5 border-b border-slate-50">
          <h3 class="font-semibold text-slate-800">Dokumen Operasional Karyawan</h3>
          <p class="text-sm text-slate-500 mt-1">Tautan dokumen legal & administrasi per karyawan (KTP, KK, BPJS, NPWP). Kontrak kerja & evaluasi lihat menu Penilaian & Kontrak.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr><th class="px-4 py-3 text-left font-medium">Karyawan</th>${docs.map(d => `<th class="px-4 py-3 text-center font-medium">${docLabels[d]}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${karyawan.length ? karyawan.map(k => `
                <tr class="border-t border-slate-50">
                  <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(k.nama_karyawan)}</td>
                  ${docs.map(d => `<td class="px-4 py-3 text-center">${k[d] ? `<a href="${k[d]}" target="_blank" class="text-maroon-700 hover:underline text-xs">Lihat</a>` : '<span class="text-slate-300 text-xs">-</span>'}</td>`).join("")}
                </tr>`).join("") : `<tr><td colspan="${docs.length + 1}" class="p-8 text-center text-slate-400">Belum ada data karyawan</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
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
      }
    });
  });

  return { unmount() {} };
}
