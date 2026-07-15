import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";

export async function mount(container) {
  await renderCrudModule(container.querySelector("#gs-panel"), {
    title: "Gimmick & SOP",
    subtitle: "Dokumen regulasi mutu, prosedur operasional standar, dan materi gimmick perusahaan.",
    collectionName: COL.GIMMICK_SOP,
    idPrefix: "DOC",
    orderByField: "judul",
    searchFields: ["judul", "kategori"],
    columns: [
      { key: "judul", label: "Judul Dokumen" },
      { key: "kategori", label: "Kategori", type: "badge" },
      { key: "versi", label: "Versi" },
      { key: "tanggal_terbit", label: "Tgl Terbit", type: "date" },
      { key: "status", label: "Status", type: "badge", badgeTone: (v) => v === "Aktif" ? "green" : "slate" },
      { key: "file_url", label: "File", type: "link" },
    ],
    formFields: [
      { name: "judul", label: "Judul Dokumen", type: "text", required: true, full: true },
      { name: "kategori", label: "Kategori", type: "select", options: ["SOP", "Gimmick", "Kebijakan", "Panduan"], required: true },
      { name: "deskripsi", label: "Deskripsi Singkat", type: "textarea", full: true },
      { name: "versi", label: "Versi", type: "text", default: "1.0" },
      { name: "tanggal_terbit", label: "Tanggal Terbit", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["Aktif", "Revisi", "Kedaluwarsa"], default: "Aktif" },
      { name: "file_url", label: "URL File Dokumen", type: "text", full: true },
    ]
  });
  return { unmount() {} };
}
