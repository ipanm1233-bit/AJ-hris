import { COL } from "../firebase-config.js";
import { toNumber } from "../utils.js";
import { renderCrudModule } from "../components.js";

export async function mount(container, { session }) {
  await renderCrudModule(container.querySelector("#um-panel"), {
    title: "Uang Makan Expedisi",
    subtitle: "Total dihitung otomatis: Jumlah Hari × Tarif Harian.",
    collectionName: COL.UANG_MAKAN_EXPEDISI,
    idPrefix: "UM",
    searchFields: ["nama_driver", "tujuan"],
    columns: [
      { key: "tanggal", label: "Tanggal", type: "date" },
      { key: "nama_driver", label: "Nama / Tim" },
      { key: "tujuan", label: "Tujuan" },
      { key: "jumlah_hari", label: "Jml Hari", type: "number" },
      { key: "tarif_harian", label: "Tarif/Hari", type: "currency" },
      { key: "total", label: "Total", type: "currency" },
      { key: "status", label: "Status", type: "badge", badgeTone: (v) => v === "Dibayar" ? "green" : "amber" },
    ],
    formFields: [
      { name: "tanggal", label: "Tanggal", type: "date", required: true },
      { name: "nama_driver", label: "Nama Karyawan / Tim", type: "text", required: true, full: true },
      { name: "tujuan", label: "Tujuan Expedisi", type: "text" },
      { name: "jumlah_hari", label: "Jumlah Hari", type: "number", required: true, default: 1 },
      { name: "tarif_harian", label: "Tarif per Hari (Rp)", type: "number", required: true, default: 35000 },
      { name: "status", label: "Status Pembayaran", type: "select", options: ["Diajukan", "Diverifikasi", "Dibayar"], default: "Diajukan" },
    ],
    beforeSave: (data) => ({
      ...data,
      total: toNumber(data.jumlah_hari) * toNumber(data.tarif_harian),
      dicatat_oleh: session.nama
    })
  });
  return { unmount() {} };
}
