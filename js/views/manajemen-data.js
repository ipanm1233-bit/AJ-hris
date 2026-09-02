import { db, COL, collection, getDocs, doc, updateDoc, addDoc, setDoc, deleteDoc, query, where, limit } from "../firebase-config.js";
import { fsGetAll, fsDelete, escapeHtml, toast, genId, notifyUser, openModal, closeModal, confirmDialog, promptDialog, calculateAge, calculateTenure, cascadeEmployeeChanges, syncAllEmployeesAcrossCollections } from "../utils.js";
import { renderCrudModule, badge, emptyState, icon, skeletonRows } from "../components.js";
import { uploadFileToDrive } from "../gas-integration.js";

export async function mount(container) {
 const panels = {
 karyawan: container.querySelector("#md-panel-karyawan"),
 rekap: container.querySelector("#md-panel-rekap"),
 dokumen: container.querySelector("#md-panel-dokumen"),
 signdoc: container.querySelector("#md-panel-signdoc"),
 alldb: container.querySelector("#md-panel-alldb"),
 };
 const loaded = {};

 async function loadKaryawanTab() {
 const getEmpList = async () => {
 try {
 const emps = await fsGetAll(COL.MASTER_KARYAWAN);
 return [...new Set(emps.map(e => e.nama_karyawan).filter(Boolean))].sort();
 } catch (e) { return []; }
 };

 const fields = [
 { name: "nik_karyawan", label: "NIK Karyawan", type: "text", required: true },
 { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true },
 { 
 name: "cabang", label: "Cabang", type: "datalist",
 getOptions: async () => {
 const emps = await fsGetAll(COL.MASTER_KARYAWAN);
 const defaults = ["HEAD OFFICE", "CABANG BANDUNG", "CABANG SURABAYA", "CABANG SEMARANG", "CABANG BALI", "WORKSHOP"];
 const existing = emps.map(e => e.cabang).filter(Boolean);
 return [...new Set([...defaults, ...existing])].sort();
 }
 },
 { 
 name: "jabatan", label: "Jabatan", type: "datalist", required: true,
 getOptions: async () => {
 const emps = await fsGetAll(COL.MASTER_KARYAWAN);
 const defaults = ["DIREKTUR", "MANAGER HRD", "SUPERVISOR", "STAFF HRD", "STAFF FINANCE", "STAFF OPERASIONAL", "DRIVER", "SECURITY", "HEAD STORE", "STORE ASSOCIATE"];
 const existing = emps.map(e => e.jabatan).filter(Boolean);
 return [...new Set([...defaults, ...existing])].sort();
 }
 },
 { 
 name: "divisi", label: "Divisi", type: "datalist",
 getOptions: async () => {
 const emps = await fsGetAll(COL.MASTER_KARYAWAN);
 const defaults = ["HRD & GA", "FINANCE & ACCOUNTING", "OPERASIONAL", "MARKETING & SALES", "IT & DIGITAL", "LOGISTIK", "PRODUKSI"];
 const existing = emps.map(e => e.divisi).filter(Boolean);
 return [...new Set([...defaults, ...existing])].sort();
 }
 },
 { name: "jenis_kelamin", label: "Jenis Kelamin", type: "select", options: ["LAKI-LAKI", "PEREMPUAN"] },
 { name: "nik_ktp", label: "NIK KTP", type: "text" },
 { name: "no_kk", label: "No Kartu Keluarga", type: "text" },
 { name: "npwp", label: "NPWP", type: "text" },
 { name: "bpjs_tk", label: "No BPJS TK", type: "text" },
 { name: "bpjs_kes", label: "No BPJS KES", type: "text" },
 { name: "status_karyawan", label: "Status Karyawan", type: "select", options: ["PKWTT (Karyawan Tetap)", "PKWT (Karyawan Kontrak)", "Probation (Masa Percobaan)", "Magang", "Buruh Harian", "Outsourcing", "Lainnya"] },
 { name: "tanggal_lahir", label: "Tanggal Lahir", type: "date" },
 { name: "usia", label: "Usia (Tahun)", type: "number" },
 { name: "tanggal_join", label: "Tanggal Join", type: "date" },
 { name: "kontrak_habis", label: "Kontrak Habis", type: "date" },
 { name: "masa_kerja", label: "Masa Kerja", type: "text" },
 { name: "pendidikan", label: "Pendidikan", type: "select", options: ["SMA/SMK", "D1", "D2", "D3", "S1", "S2", "S3", "SMP", "SD", "Lainnya"] },
 { name: "agama", label: "Agama", type: "select", options: ["ISLAM", "KRISTEN", "KATHOLIK", "HINDU", "BUDDHA", "KHONGHUCU", "LAINNYA"] },
 { name: "golongan_darah", label: "Golongan Darah", type: "select", options: ["A", "B", "AB", "O", "-"] },
 { name: "no_hp_aktif", label: "No HP Aktif", type: "text" },
 { name: "email", label: "Email Aktif", type: "text" },
 { name: "atasan", label: "Nama Atasan Langsung", type: "datalist", getOptions: getEmpList },
 { name: "kontak_darurat_nama", label: "Nama Kontak Darurat", type: "text" },
 { name: "kontak_darurat_hp", label: "Kontak Darurat (No HP)", type: "text" },
 { name: "status_pajak", label: "Status Pajak", type: "select", options: ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3", "K/I/0", "K/I/1", "K/I/2", "K/I/3"] },
 { name: "tanggungan", label: "Anak / Tanggungan", type: "number", default: 0 },
 { name: "jam_kerja", label: "Jam Kerja", type: "text", default: "08:00 - 17:00" },
 { name: "aktif_tdk_aktif", label: "Aktif / Tdk Aktif", type: "select", options: ["AKTIF", "TIDAK AKTIF"], default: "AKTIF" },
 { name: "finger_name", label: "Finger Name", type: "text" },
 { name: "jatah_tahunan", label: "Jatah Cuti Tahunan", type: "number", default: 12 },
 { name: "jatah_khusus", label: "Jatah Cuti Khusus", type: "number", default: 4 },
 { name: "jatah_akumulasi", label: "Jatah Cuti Akumulasi", type: "number", default: 0 },
 { name: "alamat", label: "Alamat Lengkap", type: "textarea", full: true },
 ];
 fields.idFromField = "nik_karyawan";

 const crudRes = await renderCrudModule(panels.karyawan, {
 title: "Database Induk Karyawan",
 subtitle: "Sumber data utama seluruh karyawan CV Andela Jaya. Perubahan nama & profil di sini otomatis memperbarui seluruh modul.",
 collectionName: COL.MASTER_KARYAWAN,
 orderByField: "nama_karyawan",
 size: "2xl",
 searchFields: ["nama_karyawan", "nik_karyawan", "jabatan", "cabang", "divisi", "status_karyawan", "finger_name", "nik_ktp", "no_kk", "bpjs_tk", "bpjs_kes", "npwp"],
 extraToolbarHtml: `
 <button id="btn-sync-all-karyawan" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-maroon-300 text-maroon-700 bg-maroon-50 hover:bg-maroon-100 transition shadow-2xs cursor-pointer" title="Sinkronkan nama seluruh karyawan ke semua modul HRD & Operasional">
 ${icon("refresh", "w-4 h-4 text-maroon-600")}
 Sinkronkan Seluruh Modul
 </button>
 `,
 afterSave: async (data, isNew, savedId, existing) => {
 try {
 await cascadeEmployeeChanges(existing, data);
 } catch (err) {
 console.warn("Cascade error:", err);
 }
 },
 beforeSave: (data) => {
 if (data.tanggal_lahir) {
 const age = calculateAge(data.tanggal_lahir);
 if (age !== null) data.usia = age;
 }
 if (data.tanggal_join) {
 const tenure = calculateTenure(data.tanggal_join);
 if (tenure) data.masa_kerja = tenure;
 }
 if (data.no_kk) data.no_kartu_keluarga = data.no_kk;
 if (data.no_kartu_keluarga) data.no_kk = data.no_kartu_keluarga;
 if (data.bpjs_tk) data.no_bpjs_tk = data.bpjs_tk;
 if (data.no_bpjs_tk) data.bpjs_tk = data.no_bpjs_tk;
 if (data.bpjs_kes) data.no_bpjs_kes = data.bpjs_kes;
 if (data.no_bpjs_kes) data.bpjs_kes = data.no_bpjs_kes;
 if (data.kontak_darurat_hp) data.kontak_darurat = data.kontak_darurat_hp;
 if (data.kontak_darurat) data.kontak_darurat_hp = data.kontak_darurat;
 if (data.kontak_darurat_nama) data.nama_kontak_darurat = data.kontak_darurat_nama;
 if (data.nama_kontak_darurat) data.kontak_darurat_nama = data.nama_kontak_darurat;
 if (data.tanggungan !== undefined) data.anak = data.tanggungan;
 if (data.anak !== undefined) data.tanggungan = data.anak;
 if (data["aktif/tidak_aktif"] && !data.aktif_tdk_aktif) {
   data.aktif_tdk_aktif = data["aktif/tidak_aktif"];
 }
 delete data["aktif/tidak_aktif"];
 return data;
 },
 columns: [
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
 { key: "status_karyawan", label: "status_karyawan", type: "badge" },
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
 { key: "aktif_tdk_aktif", label: "aktif/tidak_aktif", format: (v, r) => r.aktif_tdk_aktif || r["aktif/tidak_aktif"] || v || "AKTIF", type: "badge", badgeTone: (v) => (v === "AKTIF" || v === "Active") ? "green" : "red" },
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
 ],
 formFields: fields
 });

 panels.karyawan.querySelector("#btn-sync-all-karyawan")?.addEventListener("click", async () => {
 const ok = await confirmDialog("Sinkronkan seluruh nama & data karyawan dari Master Database ke seluruh modul (Absensi, Pengajuan, Tracking Sales, KPI, dsb)?", { title: "Sinkronisasi Master Karyawan Global" });
 if (!ok) return;
 try {
 toast("Sedang menyinkronkan data karyawan ke seluruh modul...", "info");
 const count = await syncAllEmployeesAcrossCollections();
 toast(`Sukses menyinkronkan ${count} data karyawan ke seluruh modul sistem!`, "success");
 crudRes.reload();
 } catch (e) {
 toast("Gagal sinkronisasi: " + e.message, "error");
 }
 });
 }

 async function loadRekapTab() {
 await renderCrudModule(panels.rekap, {
 title: "Rekap Pengajuan Seluruh Staf",
 subtitle: "Rekapitulasi seluruh transaksi pengajuan (HRD dapat mengelola & menghapus record jika diperlukan).",
 collectionName: COL.DATA_PENGAJUAN,
 canCreate: false, canEdit: false, canDelete: true,
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
 
 let karyawan = [];
 try {
 karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
 } catch (err) {
 console.error("Gagal memuat karyawan untuk dokumen:", err);
 }

 const docs = ["dokumen_ktp", "dokumen_kk", "dokumen_npwp", "dokumen_bpjs", "dokumen_kontrak"];
 const docLabels = { 
 dokumen_ktp: "KTP", 
 dokumen_kk: "Kartu Keluarga", 
 dokumen_npwp: "NPWP", 
 dokumen_bpjs: "BPJS / JKN",
 dokumen_kontrak: "Kontrak Kerja" 
 };

 panels.dokumen.innerHTML = `
 <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
 <div class="p-5 border-b border-slate-50">
 <h3 class="font-semibold text-slate-800">Dokumen Operasional & Kepegawaian Karyawan</h3>
 <p class="text-sm text-slate-500 mt-1">Kelola & unggah dokumen legal, identitas (KTP, KK, NPWP, BPJS) serta Kontrak Kerja Karyawan langsung ke Google Drive.</p>
 </div>
 <div class="overflow-x-auto">
 <table class="w-full text-sm">
 <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
 <tr>
 <th class="px-4 py-3 text-left font-medium">Karyawan</th>
 ${docs.map(d => `<th class="px-4 py-3 text-center font-medium">${docLabels[d]}</th>`).join("")}
 </tr>
 </thead>
 <tbody>
 ${karyawan.length ? karyawan.map(k => {
 const nik = k.nik_karyawan || k.nik || "";
 return `
 <tr class="border-t border-slate-50 hover:bg-slate-50/50 transition">
 <td class="px-4 py-3 font-medium text-slate-700">
 <div class="font-bold">${escapeHtml(k.nama_karyawan)}</div>
 <div class="text-[10px] text-slate-400">NIK: ${escapeHtml(nik)} | ${escapeHtml(k.jabatan || "-")}</div>
 </td>
 ${docs.map(d => {
 const hasDoc = !!k[d];
 return `
 <td class="px-4 py-3 text-center">
 <div class="flex flex-col items-center justify-center gap-1.5">
 ${hasDoc ? `
 <a href="${k[d]}" target="_blank" class="bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 border border-red-200 transition">
 Lihat
 </a>
 ` : `
 <span class="text-slate-400 text-xs">-</span>
 `}
 <button class="btn-upload-doc text-[10px] text-maroon-700 hover:underline font-semibold" data-nik="${escapeHtml(nik)}" data-doc-type="${d}">
 ${hasDoc ? "Ganti File" : "Unggah"}
 </button>
 </div>
 </td>`;
 }).join("")}
 </tr>`;
 }).join("") : `<tr><td colspan="${docs.length + 1}" class="p-8 text-center text-slate-400">Belum ada data karyawan</td></tr>`}
 </tbody>
 </table>
 </div>
 </div>`;

 // Bind document upload actions
 panels.dokumen.querySelectorAll(".btn-upload-doc").forEach(btn => {
 btn.onclick = () => {
 const nik = btn.dataset.nik;
 const docType = btn.dataset.docType;

 const input = document.createElement("input");
 input.type = "file";
 input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
 input.onchange = async (e) => {
 const file = e.target.files[0];
 if(!file) return;

 toast(`Sedang mengunggah ${file.name} ke Google Drive...`, "info");
 btn.disabled = true;
 const origText = btn.innerHTML;
 btn.textContent = "Loading...";

 try {
 const driveUrl = await uploadFileToDrive(file, `Dokumen_Karyawan/${nik}`);

 const q = query(collection(db, COL.MASTER_KARYAWAN), where("nik_karyawan", "==", nik));
 const snap = await getDocs(q);
 if(!snap.empty) {
 await updateDoc(doc(db, COL.MASTER_KARYAWAN, snap.docs[0].id), {
 [docType]: driveUrl
 });
 toast("Dokumen berhasil disimpan ke Google Drive & dihubungkan!", "success");
 await loadDokumenTab();
 } else {
 toast("Karyawan tidak ditemukan", "error");
 }
 } catch (err) {
 toast("Gagal mengunggah: " + err.message, "error");
 }
 btn.disabled = false;
 btn.innerHTML = origText;
 };
 input.click();
 };
 });
 }

 async function loadSignDocTab() {
 panels.signdoc.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;

 let listDocs = [];
 try {
 listDocs = await fsGetAll(COL.SIGN_DOCUMENTS);
 } catch (e) {
 console.error("Gagal mengambil daftar SignDoc:", e);
 }

 panels.signdoc.innerHTML = `
 <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
 <div class="p-5 border-b border-slate-50 flex items-center justify-between gap-4 flex-wrap">
 <div>
 <h3 class="font-semibold text-slate-800">Sign Doc (Tanda Tangan Digital)</h3>
 <p class="text-sm text-slate-500 mt-1">Kelola dokumen perusahaan yang membutuhkan tanda tangan digital dari karyawan secara real-time.</p>
 </div>
 <button id="btn-add-signdoc" class="bg-maroon-700 hover:bg-maroon-800 text-white font-medium px-4 py-2 rounded-xl text-sm shadow transition flex items-center gap-1.5">
 Buat Pengajuan TTD Baru
 </button>
 </div>
 <div class="overflow-x-auto">
 <table class="w-full text-sm">
 <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
 <tr>
 <th class="px-4 py-3 text-left font-medium">Karyawan</th>
 <th class="px-4 py-3 text-left font-medium">Judul Dokumen</th>
 <th class="px-4 py-3 text-center font-medium">Tanggal Dibuat</th>
 <th class="px-4 py-3 text-center font-medium">Draft File</th>
 <th class="px-4 py-3 text-center font-medium">Status TTD</th>
 <th class="px-4 py-3 text-center font-medium">Tanda Tangan</th>
 <th class="px-4 py-3 text-center font-medium">Tanggal TTD</th>
 <th class="px-4 py-3 text-center font-medium">Aksi</th>
 </tr>
 </thead>
 <tbody>
 ${listDocs.length ? listDocs.map(d => `
 <tr class="border-t border-slate-50 hover:bg-slate-50/50 transition">
 <td class="px-4 py-3 font-medium text-slate-700">
 <div class="font-bold">${escapeHtml(d.nama_penerima || "-")}</div>
 <div class="text-[10px] text-slate-400">NIK: ${escapeHtml(d.nik_penerima || "-")}</div>
 </td>
 <td class="px-4 py-3 text-slate-600 font-medium">${escapeHtml(d.judul || "-")}</td>
 <td class="px-4 py-3 text-center text-slate-500 text-xs">${d.tanggal_buat ? d.tanggal_buat.substring(0, 10) : "-"}</td>
 <td class="px-4 py-3 text-center">
 ${d.file_url ? `<a href="${d.file_url}" target="_blank" class="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border border-blue-200 transition">Lihat Draft</a>` : '<span class="text-slate-300">-</span>'}
 </td>
 <td class="px-4 py-3 text-center">
 ${d.status === "SIGNED" ? badge("SUDAH TTD", "green") : badge("PENDING TTD", "amber")}
 </td>
 <td class="px-4 py-3 text-center flex justify-center">
 ${d.tanda_tangan_url ? `
 <img src="${d.tanda_tangan_url}" class="h-10 w-auto border border-slate-200 bg-white p-0.5 rounded shadow-sm hover:scale-110 transition cursor-zoom-in" onclick="window.open('${d.tanda_tangan_url}', '_blank')">
 ` : '<span class="text-slate-300 text-xs">-</span>'}
 </td>
 <td class="px-4 py-3 text-center text-slate-500 text-xs">${d.tanggal_ttd ? d.tanggal_ttd.substring(0, 10) : "-"}</td>
 <td class="px-4 py-3 text-center">
 <button class="btn-delete-signdoc text-xs text-red-600 hover:text-red-800 font-semibold" data-id="${escapeHtml(d.id)}">Hapus</button>
 </td>
 </tr>`).join("") : `<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada dokumen untuk tanda tangan digital</td></tr>`}
 </tbody>
 </table>
 </div>
 </div>`;

 // Bind Add button
 panels.signdoc.querySelector("#btn-add-signdoc").onclick = async () => {
 const listKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
 const activeKaryawan = listKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF") === "AKTIF")
 .sort((a,b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || ""));

 openModal({
 title: "Buat Pengajuan Tanda Tangan Baru",
 bodyHtml: `
 <form id="form-add-signdoc" class="space-y-4 text-left">
 <div>
 <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Pilih Karyawan Penerima</label>
 <select id="sd-karyawan" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-maroon-500">
 <option value="">-- Pilih Karyawan --</option>
 ${activeKaryawan.map(k => `<option value="${escapeHtml(k.nik_karyawan)}" data-nama="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} (${escapeHtml(k.nik_karyawan)})</option>`).join("")}
 </select>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Judul Dokumen</label>
 <input type="text" id="sd-judul" placeholder="Cth: Surat Perjanjian Kontrak Kerja CV AJ" class="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-maroon-500">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-600 mb-1 uppercase">Upload Berkas Draft Dokumen (.pdf, .doc, .docx)</label>
 <input type="file" id="sd-file" accept=".pdf,.doc,.docx" class="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-maroon-50 file:text-maroon-700 hover:file:bg-maroon-100">
 </div>
 </form>
 `,
 footerHtml: `
 <button id="btn-sd-cancel" class="px-4 py-2 text-slate-500 text-sm hover:bg-slate-100 rounded-lg transition">Batal</button>
 <button id="btn-sd-submit" class="bg-maroon-700 hover:bg-maroon-800 text-white font-semibold text-sm px-5 py-2 rounded-lg shadow transition">Kirim Pengajuan</button>
 `,
 onMount: m => {
 m.querySelector("#btn-sd-cancel").onclick = closeModal;
 m.querySelector("#btn-sd-submit").onclick = async () => {
 const selectKaryawan = m.querySelector("#sd-karyawan");
 const nik = selectKaryawan.value;
 const nama = selectKaryawan.selectedOptions[0]?.dataset.nama || "";
 const judul = m.querySelector("#sd-judul").value.trim();
 const fileInput = m.querySelector("#sd-file");
 const file = fileInput.files[0];

 if (!nik || !judul || !file) {
 return toast("Mohon lengkapi semua field & pilih file dokumen!", "warning");
 }

 const btn = m.querySelector("#btn-sd-submit");
 btn.disabled = true; btn.textContent = "Mengunggah Draft...";

 try {
 const driveUrl = await uploadFileToDrive(file, `SignDocs/${nik}`);

 const newId = genId("SDC");
 const payload = {
 id: newId,
 nik_penerima: nik,
 nama_penerima: nama,
 judul: judul,
 file_url: driveUrl,
 status: "PENDING",
 tanda_tangan_url: null,
 tanggal_buat: new Date().toISOString(),
 tanggal_ttd: null
 };

 await setDoc(doc(db, COL.SIGN_DOCUMENTS, newId), payload);

 toast("Pengajuan TTD berhasil dibuat & diunggah!", "success");
 closeModal();
 loadSignDocTab();

 // Send push & in-app notification to employee
 const userQ = query(collection(db, COL.USERS), where("nama", "==", nama), limit(1));
 const userSnap = await getDocs(userQ);
 if (!userSnap.empty) {
 const targetUser = userSnap.docs[0].id;
 await notifyUser(targetUser, "Tanda Tangani Dokumen", `Admin mengunggah dokumen baru "${judul}" untuk Anda tanda tangani.`, "/#riwayat");
 }
 } catch (err) {
 toast("Gagal membuat pengajuan: " + err.message, "error");
 }
 btn.disabled = false; btn.textContent = "Kirim Pengajuan";
 };
 }
 });
 };

 // Bind Delete buttons
 panels.signdoc.querySelectorAll(".btn-delete-signdoc").forEach(btn => {
 btn.onclick = async () => {
 if (!confirm("Apakah Anda yakin ingin menghapus pengajuan tanda tangan digital ini?")) return;
 const id = btn.dataset.id;
 try {
 await deleteDoc(doc(db, COL.SIGN_DOCUMENTS, id));
 toast("Pengajuan berhasil dihapus", "success");
 loadSignDocTab();
 } catch (err) {
 toast("Gagal menghapus: " + err.message, "error");
 }
 };
 });
 }

 async function loadAllDbTab() {
 const collectionsList = [
 { key: COL.BROADCAST, label: "Memo Pengumuman Broadcast (broadcast)" },
 { key: COL.MASTER_KARYAWAN, label: "Master Database Karyawan (master_karyawan)" },
 { key: COL.DATA_PENGAJUAN, label: "Data Pengajuan HRIS Staf (data_pengajuan)" },
 { key: COL.DATA_ABSENSI, label: "Data Absensi Karyawan (data_absensi)" },
 { key: COL.LOG_LEMBUR, label: "Log Pengajuan Lembur (log_lembur)" },
 { key: COL.LOG_KASBON, label: "Log Kasbon & Pinjaman (log_kasbon)" },
 { key: COL.MASTER_CUTI, label: "Pengajuan & Log Cuti (master_cuti)" },
 { key: COL.SIGN_DOCUMENTS, label: "Dokumen TTD Digital (sign_documents)" },
 { key: COL.LOG_PENILAIAN_KPI, label: "Log Hasil Penilaian KPI (log_penilaian_kpi)" },
 { key: COL.TUGAS_KPI_360, label: "Penugasan Soal KPI 360 (tugas_kpi_360)" },
 { key: COL.MASTER_SOAL_KPI, label: "Bank Soal & Template KPI (master_soal_kpi)" },
 { key: COL.EVALUASI_KONTRAK, label: "Evaluasi Kontrak Kerja (evaluasi_kontrak)" },
 { key: COL.MASTER_KONTRAK, label: "Master Riwayat Kontrak (master_kontrak)" },
 { key: COL.MASTER_KENDARAAN, label: "Master Kendaraan (master_kendaraan)" },
 { key: COL.LOG_KENDARAAN_FUEL, label: "Log Kendaraan BBM (log_kendaraan_fuel)" },
 { key: COL.LOG_KENDARAAN_SERVICE, label: "Log Kendaraan Service (log_kendaraan_service)" },
 { key: COL.LOG_KENDARAAN_COMPLIANCE, label: "Log Pajak Kendaraan (log_kendaraan_compliance)" },
 { key: COL.MASTER_INVENTORY, label: "Master Inventaris Aset (master_inventory)" },
 { key: COL.LOG_INVENTORY_PENGAMBILAN, label: "Log Ambil Inventaris (log_inventory_pengambilan)" },
 { key: COL.STOCK_OPNAME, label: "Log Stock Opname ATK (stock_opname)" },
 { key: COL.REKRUTMEN_PELAMAR, label: "Rekrutmen Pelamar (rekrutmen_pelamar)" },
 { key: COL.KALENDER_HR, label: "Event Kalender HR (kalender_hr_events)" },
 { key: COL.GIMMICK_SOP, label: "Quiz SOP & Gimmick (gimmick_sop)" },
 { key: COL.DATA_TRAINING, label: "Data Training Pelatihan (data_training)" },
 { key: COL.LOG_SP_KONSELING, label: "Log SP & Konseling (log_sp_konseling)" },
 { key: COL.DATA_PEMANGGILAN, label: "Data Pemanggilan Staf (data_pemanggilan)" },
 { key: COL.SIKLUS_KARYAWAN, label: "Siklus Karyawan (siklus_karyawan)" },
 { key: COL.UANG_MAKAN_EXPEDISI, label: "Uang Makan Expedisi (uang_makan_expedisi)" },
 { key: COL.NOTIFICATIONS, label: "Notifikasi Sistem (notifications)" },
 { key: "kanal_checkins", label: "Check-in Sales Toko (kanal_checkins)" },
 { key: "kanal_data", label: "Log Sync API Kanal (kanal_data)" },
 { key: "drafts_dokumen", label: "Draft Dokumen HR (drafts_dokumen)" },
 { key: "custom_doc_templates", label: "Template Dokumen Custom (custom_doc_templates)" },
 { key: COL.USERS, label: "User Login System (users)" },
 { key: COL.USER_PERMISSIONS, label: "Hak Akses User (user_permissions)" },
 { key: COL.FORM_CONFIG, label: "Konfigurasi Custom Form (form_config)" },
 { key: COL.APP_SETTINGS, label: "Pengaturan Aplikasi (app_settings)" }
 ];

 let currentSelectedCol = COL.BROADCAST;
 let currentRows = [];

 async function fetchAndRenderDb(colKey) {
 currentSelectedCol = colKey;
 const selectAllCb = panels.alldb.querySelector("#cb-select-all-db");
 if (selectAllCb) selectAllCb.checked = false;
 const dbTableBody = panels.alldb.querySelector("#db-table-body");
 if (dbTableBody) dbTableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center">${skeletonRows(3)}</td></tr>`;
 
 try {
 currentRows = await fsGetAll(colKey);
 } catch (err) {
 console.error("Gagal mengambil koleksi:", colKey, err);
 currentRows = [];
 }

 renderTable(currentRows);
 }

 function renderTable(rows) {
 const searchTerm = (panels.alldb.querySelector("#db-search-input")?.value || "").toLowerCase().trim();
 const countEl = panels.alldb.querySelector("#db-record-count");
 
 const filtered = rows.filter(r => {
 if (!searchTerm) return true;
 const searchableText = [
  r._docId, r.id, r.nama, r.nama_karyawan, r.nama_pemohon, r.nama_penilai,
  r.nik, r.nik_karyawan, r.jabatan, r.cabang, r.divisi, r.email, r.judul,
  r.toko_outlet, r.status, r.status_karyawan, r.finger_name
 ].filter(Boolean).join(" ").toLowerCase();
 return searchableText.includes(searchTerm);
 });

 if (countEl) countEl.textContent = `${filtered.length} / ${rows.length} Record`;

 const tbody = panels.alldb.querySelector("#db-table-body");
 if (!tbody) return;

 if (filtered.length === 0) {
 tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 italic">Tidak ada data ditemukan pada koleksi ini</td></tr>`;
 return;
 }

 tbody.innerHTML = filtered.map((r, idx) => {
 const docIdVal = r._docId || r.id;
 const rawDocId = docIdVal ? String(docIdVal) : `ROW-${idx}`;
 const docIdDisplay = escapeHtml(rawDocId);
 const title = escapeHtml(r.judul || r.nama || r.nama_karyawan || r.nama_pemohon || r.nama_penilai || r.toko_outlet || r.email || rawDocId || "Record");
 const subInfo = escapeHtml(r.dibuat_oleh || r.nik || r.nik_karyawan || r.status || r.tanggal || r.created_at || "-");
 const dateVal = r.tanggal || r.tanggal_buat || r.created_at || r.updated_at || "-";

 return `
 <tr class="border-t border-slate-50 hover:bg-slate-50/50 transition text-xs">
 <td class="px-3 py-3 text-center">
 <input type="checkbox" class="cb-db-row w-4 h-4 rounded text-maroon-700 cursor-pointer" data-docid="${escapeHtml(rawDocId)}">
 </td>
 <td class="px-4 py-3 font-mono font-bold text-slate-600 select-all">${docIdDisplay}</td>
 <td class="px-4 py-3">
 <div class="font-bold text-slate-800">${title}</div>
 <div class="text-[10px] text-slate-400">Info: ${subInfo}</div>
 </td>
 <td class="px-4 py-3 text-slate-500">${escapeHtml(dateVal)}</td>
 <td class="px-4 py-3 text-center">
 <button class="btn-json-preview text-blue-600 hover:text-blue-800 hover:underline font-semibold cursor-pointer" data-idx="${idx}">Lihat Raw JSON</button>
 </td>
 <td class="px-4 py-3 text-center">
 <button class="btn-delete-row text-rose-600 hover:text-rose-800 font-bold hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition cursor-pointer" data-docid="${escapeHtml(rawDocId)}">Hapus</button>
 </td>
 </tr>
 `;
 }).join("");

 // Bind Json Viewers
 tbody.querySelectorAll(".btn-json-preview").forEach(btn => {
 btn.onclick = () => {
 const item = filtered[btn.dataset.idx];
 openModal({
 title: `Raw JSON - ${item.id || 'Record'}`,
 bodyHtml: `<pre class="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs overflow-auto max-h-96 font-mono">${escapeHtml(JSON.stringify(item, null, 2))}</pre>`,
 footerHtml: `<button onclick="closeModal()" class="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg cursor-pointer">Tutup</button>`
 });
 };
 });

 // Bind Individual Row Deletes
 tbody.querySelectorAll(".btn-delete-row").forEach(btn => {
 btn.onclick = async () => {
 const id = btn.dataset.docid;
 if (!id || id.startsWith("ROW-")) {
 toast("Record ini tidak memiliki ID Firestore yang valid.", "warning");
 return;
 }
 const ok = await confirmDialog(`Apakah Anda yakin ingin MENGHAPUS record ID '${id}' dari koleksi '${currentSelectedCol}'?`, { title: "Konfirmasi Hapus Record" });
 if (ok) {
 try {
 await fsDelete(currentSelectedCol, id);
 toast(`Record '${id}' berhasil dihapus dari database`, "success");
 await fetchAndRenderDb(currentSelectedCol);
 } catch (e) {
 toast("Gagal menghapus record: " + e.message, "error");
 }
 }
 };
 });
 }

 panels.alldb.innerHTML = `
 <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-6 space-y-4">
 <div class="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-slate-100">
 <div>
 <h3 class="font-bold text-slate-800 text-lg">Pusat Inspeksi & Pembersihan Database HRD</h3>
 <p class="text-xs text-slate-500 mt-0.5">Pilih tabel koleksi database di bawah untuk melihat seluruh data tersimpan & menghapus record yang tidak lagi diperlukan.</p>
 </div>
 <div class="flex items-center gap-2">
 <button id="btn-bulk-delete-db" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition flex items-center gap-1 cursor-pointer">
 Hapus Record Terpilih
 </button>
 <button id="btn-clear-collection-db" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition flex items-center gap-1 cursor-pointer">
 Kosongkan Koleksi Ini
 </button>
 <span id="db-record-count" class="px-3 py-1 bg-maroon-50 text-maroon-700 font-bold text-xs rounded-full border border-maroon-200">0 Record</span>
 </div>
 </div>

 <div class="flex items-center justify-between gap-3 flex-wrap">
 <div class="flex items-center gap-2 w-full sm:w-auto">
 <label class="text-xs font-bold text-slate-600 uppercase tracking-wide shrink-0">Pilih Tabel Koleksi:</label>
 <select id="db-collection-select" class="px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-maroon-500 cursor-pointer min-w-[280px]">
 ${collectionsList.map(c => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`).join("")}
 </select>
 </div>

 <div class="flex items-center gap-2 w-full sm:w-auto">
 <input type="text" id="db-search-input" placeholder="Cari ID / Keyword..." class="px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-white w-full sm:w-64">
 <button id="btn-refresh-db" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">Refresh</button>
 </div>
 </div>

 <div class="overflow-x-auto border border-slate-100 rounded-xl mt-4">
 <table class="w-full text-left border-collapse">
 <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
 <tr>
 <th class="px-3 py-3 text-center w-10">
 <input type="checkbox" id="cb-select-all-db" class="w-4 h-4 rounded text-maroon-700 cursor-pointer" title="Pilih Semua">
 </th>
 <th class="px-4 py-3 font-semibold">Document ID</th>
 <th class="px-4 py-3 font-semibold">Judul / Identitas Utama</th>
 <th class="px-4 py-3 font-semibold">Tanggal / Waktu</th>
 <th class="px-4 py-3 text-center font-semibold">JSON Data</th>
 <th class="px-4 py-3 text-center font-semibold">Aksi HRD</th>
 </tr>
 </thead>
 <tbody id="db-table-body">
 <tr><td colspan="6" class="p-8 text-center text-slate-400">Memuat data...</td></tr>
 </tbody>
 </table>
 </div>
 </div>
 `;

 const selectEl = panels.alldb.querySelector("#db-collection-select");
 const searchEl = panels.alldb.querySelector("#db-search-input");
 const refreshBtn = panels.alldb.querySelector("#btn-refresh-db");
 const selectAllCb = panels.alldb.querySelector("#cb-select-all-db");
 const bulkDeleteBtn = panels.alldb.querySelector("#btn-bulk-delete-db");
 const clearColBtn = panels.alldb.querySelector("#btn-clear-collection-db");

 selectEl.onchange = () => fetchAndRenderDb(selectEl.value);
 searchEl.oninput = () => renderTable(currentRows);
 refreshBtn.onclick = () => fetchAndRenderDb(selectEl.value);

 selectAllCb.onchange = (e) => {
 const isChecked = e.target.checked;
 panels.alldb.querySelectorAll(".cb-db-row").forEach(cb => { cb.checked = isChecked; });
 };

 bulkDeleteBtn.onclick = async () => {
 const selectedCbs = Array.from(panels.alldb.querySelectorAll(".cb-db-row:checked"));
 if (selectedCbs.length === 0) {
 return toast("Pilih minimal satu record dengan mencentang kotak di tabel!", "warning");
 }
 const ids = selectedCbs.map(cb => cb.dataset.docid).filter(id => id && !id.startsWith("ROW-"));
 if (ids.length === 0) {
 return toast("Tidak ada Document ID valid yang terpilih.", "warning");
 }
 const ok = await confirmDialog(`Apakah Anda yakin ingin MENGHAPUS ${ids.length} record terpilih dari koleksi '${currentSelectedCol}'?`, { title: "Konfirmasi Hapus Massal" });
 if (ok) {
 try {
 await Promise.all(ids.map(id => fsDelete(currentSelectedCol, id)));
 toast(`${ids.length} record berhasil dihapus dari database!`, "success");
 await fetchAndRenderDb(currentSelectedCol);
 } catch (e) {
 toast("Gagal menghapus beberapa record: " + e.message, "error");
 }
 }
 };

 clearColBtn.onclick = async () => {
 if (currentRows.length === 0) {
 return toast("Koleksi ini sudah kosong.", "warning");
 }
 const confirmInput = await promptDialog(
 `PERINGATAN! Anda akan MENGHAPUS SELURUH ${currentRows.length} DATA dari koleksi '${currentSelectedCol}'.\n\nKetik nama koleksi '${currentSelectedCol}' di bawah ini untuk mengonfirmasi:`,
 "",
 { title: "Kosongkan Koleksi Database", placeholder: currentSelectedCol }
 );
 if (confirmInput === currentSelectedCol) {
 try {
 const validIds = currentRows.map(r => r._docId || r.id).filter(id => id && !String(id).startsWith("ROW-"));
 await Promise.all(validIds.map(id => fsDelete(currentSelectedCol, id)));
 toast(`Seluruh data pada koleksi '${currentSelectedCol}' berhasil dikosongkan!`, "success");
 await fetchAndRenderDb(currentSelectedCol);
 } catch (e) {
 toast("Gagal mengosongkan koleksi: " + e.message, "error");
 }
 } else if (confirmInput !== null) {
 toast("Konfirmasi pembatalan. Nama koleksi yang diketik tidak cocok.", "error");
 }
 };

 await fetchAndRenderDb(selectEl.value);
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
 if (tab === "signdoc") await loadSignDocTab();
 if (tab === "alldb") await loadAllDbTab();
 }
 });
 });

 return { unmount() {} };
}
