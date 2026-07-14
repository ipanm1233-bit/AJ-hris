import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";

export async function mount(container, { session }) {
  const panelSp = container.querySelector("#pm-panel-sp");
  const panelPanggil = container.querySelector("#pm-panel-panggil");
  const loaded = {};

  async function loadSp() {
    await renderCrudModule(panelSp, {
      title: "SP & Konseling",
      subtitle: "Riwayat surat peringatan dan rekam jejak konseling karyawan.",
      collectionName: COL.LOG_SP_KONSELING,
      idPrefix: "SP",
      searchFields: ["nama_karyawan", "jenis", "alasan"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_karyawan", label: "Karyawan" },
        { key: "jenis", label: "Jenis", type: "badge", badgeTone: (v) => (v || "").toLowerCase().includes("konseling") ? "blue" : "red" },
        { key: "alasan", label: "Alasan" },
        { key: "status", label: "Status", type: "badge" },
        { key: "link_dokumen", label: "Dokumen", type: "link" },
      ],
      formFields: [
        { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "nik", label: "NIK", type: "text" },
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "jenis", label: "Jenis", type: "select", options: ["SP 1", "SP 2", "SP 3 (Terakhir)", "Konseling"], required: true },
        { name: "alasan", label: "Alasan", type: "text", full: true },
        { name: "catatan", label: "Catatan Detail", type: "textarea", full: true },
        { name: "status", label: "Status", type: "select", options: ["Aktif", "Selesai", "Dicabut"], default: "Aktif" },
        { name: "link_dokumen", label: "Link Dokumen (opsional)", type: "text", full: true },
      ],
      beforeSave: (data) => ({ ...data, dibuat_oleh: session.nama })
    });
  }

  async function loadPanggil() {
    await renderCrudModule(panelPanggil, {
      title: "Pemanggilan Karyawan",
      subtitle: "Catatan pemanggilan resmi terhadap karyawan.",
      collectionName: COL.DATA_PEMANGGILAN,
      idPrefix: "PGL",
      searchFields: ["nama_karyawan", "jenis_pemanggilan", "alasan"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_karyawan", label: "Karyawan" },
        { key: "jenis_pemanggilan", label: "Jenis" },
        { key: "alasan", label: "Alasan" },
        { key: "status", label: "Status", type: "badge" },
      ],
      formFields: [
        { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
        { name: "nik", label: "NIK", type: "text" },
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "jenis_pemanggilan", label: "Jenis Pemanggilan", type: "text", required: true },
        { name: "alasan", label: "Alasan", type: "textarea", full: true },
        { name: "tindak_lanjut", label: "Tindak Lanjut", type: "textarea", full: true },
        { name: "status", label: "Status", type: "select", options: ["Terjadwal", "Selesai", "Dibatalkan"], default: "Terjadwal" },
      ],
      beforeSave: (data) => ({ ...data, dibuat_oleh: session.nama })
    });
  }

  await loadSp(); loaded.sp = true;

  container.querySelectorAll(".pm-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ptab;
      panelSp.classList.toggle("hidden", tab !== "sp");
      panelPanggil.classList.toggle("hidden", tab !== "panggil");
      container.querySelectorAll(".pm-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      if (tab === "panggil" && !loaded.panggil) { loaded.panggil = true; await loadPanggil(); }
    });
  });

  return { unmount() {} };
}
