import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, openModal, closeModal, toast, genId, smartParseDate, escapeHtml } from "../utils.js";
import { renderCrudModule, badge, emptyState, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  const panels = {
    kontrak: container.querySelector("#pk-panel-kontrak"),
    kpi360: container.querySelector("#pk-panel-kpi360"),
    hasil: container.querySelector("#pk-panel-hasil"),
    evaluasi: container.querySelector("#pk-panel-evaluasi"),
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

  async function loadKpi360() {
    const wrap = panels.kpi360;
    wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
    const tasks = await fsGetAll(COL.TUGAS_KPI_360);
    if (!tasks.length) { wrap.innerHTML = emptyState("Belum ada tugas penilaian 360°", "Buat penugasan penilaian baru untuk memulai."); return; }
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
              <th class="px-4 py-3 text-left">Periode</th><th class="px-4 py-3 text-left">Penilai</th>
              <th class="px-4 py-3 text-left">Dinilai</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3 text-left">Skor</th>
            </tr></thead>
            <tbody>${tasks.map(t => `
              <tr class="border-t border-slate-50">
                <td class="px-4 py-3">${escapeHtml(t.periode || "-")}</td>
                <td class="px-4 py-3">${escapeHtml(t.nama_penilai || "-")}</td>
                <td class="px-4 py-3">${escapeHtml(t.nama_dinilai || "-")}</td>
                <td class="px-4 py-3">${badge(t.status || "PENDING", t.status === "DONE" ? "green" : "amber")}</td>
                <td class="px-4 py-3">${t.skor_akhir || "-"}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  async function loadHasil() {
    await renderCrudModule(panels.hasil, {
      title: "Hasil Penilaian KPI",
      collectionName: COL.LOG_PENILAIAN_KPI,
      canCreate: false, canEdit: false, canDelete: false,
      searchFields: ["nama_dinilai", "penilai"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_dinilai", label: "Dinilai" },
        { key: "penilai", label: "Penilai" },
        { key: "total_skor", label: "Total Skor" },
        { key: "keputusan", label: "Keputusan", type: "badge" },
      ]
    });
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
      }
    });
  });

  return { unmount() {} };
}
