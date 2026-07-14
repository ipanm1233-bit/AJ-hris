import { COL } from "../firebase-config.js";
import { fsGetAll, exportToCsv, toast } from "../utils.js";
import { icon } from "../components.js";

const LABELS = {
  [COL.MASTER_KARYAWAN]: "Master Karyawan",
  [COL.MASTER_CUTI]: "Master Cuti",
  [COL.MASTER_KENDARAAN]: "Master Kendaraan",
  [COL.MASTER_INVENTORY]: "Master Inventory",
  [COL.MASTER_KONTRAK]: "Master Kontrak",
  [COL.DATA_PENGAJUAN]: "Data Pengajuan",
  [COL.BROADCAST]: "Broadcast Memo",
  [COL.LOG_SP_KONSELING]: "SP & Konseling",
  [COL.DATA_PEMANGGILAN]: "Data Pemanggilan",
  [COL.LOG_PENILAIAN_KPI]: "Log Penilaian KPI",
  [COL.TUGAS_KPI_360]: "Tugas KPI 360",
  [COL.LOG_KENDARAAN_FUEL]: "Log BBM Kendaraan",
  [COL.LOG_KENDARAAN_SERVICE]: "Log Service Kendaraan",
  [COL.EVALUASI_KONTRAK]: "Evaluasi Kontrak",
  [COL.LOG_OFFBOARDING]: "Log Offboarding",
  [COL.REKRUTMEN_PELAMAR]: "Data Pelamar (ATS)",
  [COL.GIMMICK_SOP]: "Gimmick & SOP",
  [COL.SIKLUS_KARYAWAN]: "Siklus Karyawan",
  [COL.UANG_MAKAN_EXPEDISI]: "Uang Makan Expedisi",
  [COL.USERS]: "Data Akun Pengguna",
};

export async function mount(container) {
  const select = container.querySelector("#export-select");
  select.innerHTML = Object.entries(LABELS).map(([val, label]) => `<option value="${val}">${label}</option>`).join("");

  const countEl = container.querySelector("#export-count");
  async function updateCount() {
    countEl.textContent = "Menghitung jumlah data...";
    const rows = await fsGetAll(select.value);
    countEl.textContent = `${rows.length} baris data siap diekspor.`;
    return rows;
  }
  let currentRows = await updateCount();
  select.addEventListener("change", async () => { currentRows = await updateCount(); });

  container.querySelector("#export-btn").addEventListener("click", async () => {
    if (!currentRows.length) { toast("Tidak ada data pada koleksi ini", "warning"); return; }
    exportToCsv(`${select.value}_${new Date().toISOString().slice(0,10)}.csv`, currentRows);
    toast("File CSV berhasil diunduh", "success");
  });

  return { unmount() {} };
}
