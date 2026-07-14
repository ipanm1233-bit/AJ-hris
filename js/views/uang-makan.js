// js/views/uang-makan.js
import { COL } from "../firebase-config.js";
import { toNumber, fsGetAll } from "../utils.js";
import { renderCrudModule } from "../components.js";

export async function mount(container, { session }) {
  // 1. Ambil list karyawan aktif & list plat mobil
  const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeKaryawan = allKaryawan.filter(k => k.aktif_tdk_aktif === "AKTIF").map(k => k.nama_karyawan);
  
  const allKendaraan = await fsGetAll(COL.MASTER_KENDARAAN);
  const platMobil = allKendaraan.map(k => k.no_polisi);

  await renderCrudModule(container.querySelector("#um-panel"), {
    title: "Uang Makan Expedisi",
    subtitle: "Kalkulasi uang makan driver (Rp35.000) dan helper (Rp25.000).",
    collectionName: COL.UANG_MAKAN_EXPEDISI,
    idPrefix: "UM",
    searchFields: ["nama_driver", "nama_helper", "tujuan", "plat_mobil"],
    columns: [
      { key: "tanggal", label: "Tanggal", type: "date" },
      { key: "plat_mobil", label: "Plat Mobil" },
      { key: "nama_driver", label: "Driver" },
      { key: "nama_helper", label: "Helper" },
      { key: "tujuan", label: "Tujuan/Area" },
      { key: "total", label: "Total Uang Makan", type: "currency" },
    ],
    formFields: [
      { name: "tanggal", label: "Tanggal", type: "date", required: true },
      { name: "plat_mobil", label: "Plat Mobil", type: "select", options: platMobil, required: true },
      { name: "nama_driver", label: "Nama Driver", type: "select", options: activeKaryawan, required: true },
      { name: "nama_helper", label: "Nama Helper (Opsional)", type: "select", options: activeKaryawan },
      { name: "tujuan", label: "Area Pengiriman", type: "text", required: true },
      { name: "total_toko_tugas", label: "Total Toko Ditugaskan", type: "number", required: true },
      { name: "total_toko_sukses", label: "Total Toko Terkirim", type: "number", required: true },
      { name: "jam_berangkat", label: "Jam Berangkat (HH:MM)", type: "text" },
      { name: "jam_tiba", label: "Jam Tiba (HH:MM)", type: "text" },
      { name: "keterangan", label: "Alasan / Keterangan", type: "textarea", full: true },
    ],
    beforeSave: (data) => {
      // Kalkulasi otomatis: Driver 35rb, Helper 25rb
      let totalBiaya = 0;
      if (data.nama_driver) totalBiaya += 35000;
      if (data.nama_helper) totalBiaya += 25000;
      
      return {
        ...data,
        total: totalBiaya,
        dicatat_oleh: session.nama
      };
    }
  });
  return { unmount() {} };
}
