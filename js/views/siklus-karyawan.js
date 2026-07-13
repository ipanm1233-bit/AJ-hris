import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";

export async function mount(container, { session }) {
  await renderCrudModule(container.querySelector("#sk-panel"), {
    title: "Siklus Karyawan",
    subtitle: "Riwayat perubahan status kepegawaian karyawan.",
    collectionName: COL.SIKLUS_KARYAWAN,
    idPrefix: "SK",
    searchFields: ["nama_karyawan", "jenis"],
    columns: [
      { key: "tanggal_efektif", label: "Tgl Efektif", type: "date" },
      { key: "nama_karyawan", label: "Karyawan" },
      { key: "jenis", label: "Jenis", type: "badge", badgeTone: (v) => ({ Promosi: "green", Demosi: "red", Mutasi: "blue", Onboarding: "maroon", Offboarding: "slate" }[v] || "slate") },
      { key: "dari", label: "Dari" },
      { key: "ke", label: "Menjadi" },
      { key: "status", label: "Status", type: "badge" },
    ],
    formFields: [
      { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
      { name: "nik", label: "NIK", type: "text" },
      { name: "jenis", label: "Jenis Perubahan", type: "select", options: ["Onboarding", "Mutasi", "Promosi", "Demosi", "Offboarding"], required: true },
      { name: "dari", label: "Dari (Jabatan/Cabang Lama)", type: "text" },
      { name: "ke", label: "Menjadi (Jabatan/Cabang Baru)", type: "text" },
      { name: "tanggal_efektif", label: "Tanggal Efektif", type: "date", required: true },
      { name: "keterangan", label: "Keterangan", type: "textarea", full: true },
      { name: "status", label: "Status Proses", type: "select", options: ["Diajukan", "Diproses", "Selesai"], default: "Diajukan" },
    ],
    beforeSave: (data) => ({ ...data, dicatat_oleh: session.nama })
  });
  return { unmount() {} };
}
