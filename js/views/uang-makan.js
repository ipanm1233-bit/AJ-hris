import { COL } from "../firebase-config.js";
import { fsGetAll } from "../utils.js";
import { renderCrudModule } from "../components.js";

export async function mount(container) {
  // 1. Ambil data karyawan yang statusnya AKTIF
  const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeEmpNames = karyawan
    .filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF")
    .map(k => k.nama_karyawan)
    .sort();

  container.innerHTML = `<div id="um-panel"></div>`;
  
  await renderCrudModule(container.querySelector("#um-panel"), {
    title: "Uang Makan Expedisi",
    subtitle: "Pencatatan & kalkulasi otomatis jatah makan tim lapangan.",
    collectionName: COL.UANG_MAKAN_EXPEDISI,
    idPrefix: "UME",
    searchFields: ["driver", "helper", "tujuan"],
    columns: [
      { key: "tanggal", label: "Tanggal", type: "date" },
      { key: "driver", label: "Driver" },
      { key: "helper", label: "Helper" },
      { key: "tujuan", label: "Tujuan" },
      { key: "uang_makan", label: "Total UM", type: "currency" }
    ],
    formFields: [
      { name: "tanggal", label: "Tanggal", type: "date", required: true },
      // 2. Terapkan ke Dropdown Select
      { name: "driver", label: "Nama Driver", type: "select", options: activeEmpNames, required: true },
      { name: "helper", label: "Nama Helper", type: "select", options: ["Tidak Ada", ...activeEmpNames], default: "Tidak Ada" },
      { name: "tujuan", label: "Tujuan / Rute", type: "text", required: true, full: true },
      { name: "uang_makan", label: "Total Uang Makan (Rp)", type: "number", required: true }
    ]
  });

  return { unmount() {} };
}
