import { COL } from "../firebase-config.js";
import { fsGetAll, exportToCsv, toast, formatUangJalanEkspedisiRows, calculateAge, calculateTenure } from "../utils.js";
import { icon, openExportPicker } from "../components.js";

const MASTER_KARYAWAN_COLUMNS = [
 { key: "nik_karyawan", label: "nik_karyawan" },
 { key: "nama_karyawan", label: "nama_karyawan" },
 { key: "cabang", label: "cabang" },
 { key: "jabatan", label: "jabatan" },
 { key: "divisi", label: "divisi" },
 { key: "jenis_kelamin", label: "jenis_kelamin" },
 { key: "nik_ktp", label: "nik_ktp", format: (v, r) => r.nik_ktp || r.no_ktp || v || "-" },
 { key: "no_kartu_keluarga", label: "no_kartu_keluarga", format: (v, r) => r.no_kartu_keluarga || r.no_kk || v || "-" },
 { key: "no_bpjs_tk", label: "no_bpjs_tk", format: (v, r) => r.no_bpjs_tk || r.bpjs_tk || r.bpjs_ketenagakerjaan || v || "-" },
 { key: "no_bpjs_kes", label: "no_bpjs_kes", format: (v, r) => r.no_bpjs_kes || r.bpjs_kes || r.bpjs_kesehatan || v || "-" },
 { key: "status_karyawan", label: "status_karyawan" },
 { key: "tanggal_lahir", label: "tanggal_lahir" },
 { key: "usia", label: "usia", format: (v, r) => (r.tanggal_lahir ? (calculateAge(r.tanggal_lahir) ?? v ?? "-") : (v ?? "-")) },
 { key: "tanggal_join", label: "tanggal_join" },
 { key: "kontrak_habis", label: "kontrak_habis", format: (v, r) => r.kontrak_habis || "-" },
 { key: "masa_kerja", label: "masa_kerja", format: (v, r) => (r.tanggal_join ? calculateTenure(r.tanggal_join) : (v || "-")) },
 { key: "pendidikan", label: "pendidikan" },
 { key: "alamat", label: "alamat" },
 { key: "agama", label: "agama" },
 { key: "golongan_darah", label: "golongan_darah" },
 { key: "no_hp_aktif", label: "no_hp_aktif" },
 { key: "email", label: "email" },
 { key: "kontak_darurat", label: "kontak_darurat", format: (v, r) => r.kontak_darurat || r.kontak_darurat_hp || v || "-" },
 { key: "nama_kontak_darurat", label: "nama_kontak_darurat", format: (v, r) => r.nama_kontak_darurat || r.kontak_darurat_nama || v || "-" },
 { key: "npwp", label: "npwp", format: (v, r) => r.npwp || v || "-" },
 { key: "status_pajak", label: "status_pajak" },
 { key: "anak", label: "anak", format: (v, r) => r.anak ?? r.tanggungan ?? v ?? 0 },
 { key: "jam_kerja", label: "jam_kerja" },
 { key: "aktif/tidak_aktif", label: "aktif/tidak_aktif", format: (v, r) => r["aktif/tidak_aktif"] || r.aktif_tdk_aktif || v || "AKTIF" },
 { key: "finger_name", label: "finger_name" },
 { key: "jatah_tahunan", label: "jatah_tahunan", format: (v, r) => r.jatah_tahunan ?? 12 },
 { key: "jatah_khusus", label: "jatah_khusus", format: (v, r) => r.jatah_khusus ?? 4 },
 { key: "jatah_akumulasi", label: "jatah_akumulasi", format: (v, r) => r.jatah_akumulasi ?? 0 },
 { key: "terpakai_tahunan", label: "terpakai_tahunan", format: (v, r) => r.terpakai_tahunan ?? r.cuti_terpakai_tahunan ?? 0 },
 { key: "terpakai_khusus", label: "terpakai_khusus", format: (v, r) => r.terpakai_khusus ?? r.cuti_terpakai_khusus ?? 0 },
 { key: "terpakai_akumulasi", label: "terpakai_akumulasi", format: (v, r) => r.terpakai_akumulasi ?? r.cuti_terpakai_akumulasi ?? 0 },
 { key: "dokumen_ktp", label: "dokumen_ktp", format: (v, r) => r.dokumen_ktp ? "Ada" : "-" },
 { key: "dokumen_kk", label: "dokumen_kk", format: (v, r) => r.dokumen_kk ? "Ada" : "-" },
 { key: "dokumen_bpjs", label: "dokumen_bpjs", format: (v, r) => r.dokumen_bpjs ? "Ada" : "-" },
 { key: "dokumen_npwp", label: "dokumen_npwp", format: (v, r) => r.dokumen_npwp ? "Ada" : "-" },
 { key: "atasan", label: "atasan" },
 { key: "template_kpi", label: "template_kpi", format: (v, r) => r.template_kpi || "-" },
 { key: "akses_menu", label: "akses_menu", format: (v, r) => r.akses_menu || "-" }
];

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
 [COL.LOG_LEMBUR]: "Data Lembur",
 [COL.LOG_KASBON]: "Data Kasbon",
 [COL.USERS]: "Data Akun Pengguna",
};

export async function mount(container) {
 const select = container.querySelector("#export-select");
 if (!select) return { unmount() {} };

 select.innerHTML = Object.entries(LABELS).map(([val, label]) => `<option value="${val}">${label}</option>`).join("");

 const countEl = container.querySelector("#export-count");
 async function updateCount() {
 if (countEl) countEl.textContent = "Menghitung jumlah data...";
 const rows = await fsGetAll(select.value);
 if (countEl) countEl.textContent = `${rows.length} baris data siap diekspor.`;
 return rows;
 }
 let currentRows = await updateCount();
 select.addEventListener("change", async () => { currentRows = await updateCount(); });

 container.querySelector("#export-btn")?.addEventListener("click", () => {
 if (!currentRows.length) { toast("Tidak ada data pada koleksi ini", "warning"); return; }
 let rowsToExport = currentRows;
 if (select.value === COL.UANG_MAKAN_EXPEDISI) {
 rowsToExport = formatUangJalanEkspedisiRows(currentRows);
 }
 const cols = select.value === COL.MASTER_KARYAWAN ? MASTER_KARYAWAN_COLUMNS : [];
 openExportPicker(LABELS[select.value] || select.value, cols, rowsToExport);
 });

 return { unmount() {} };
}
