import { db, COL, collection, getDoc, getDocs, doc, updateDoc, addDoc, setDoc, deleteDoc, query, where, limit } from "../firebase-config.js";
import { fsGetAll, fsUpdate, fsDelete, escapeHtml, toast, genId, notifyUser, openModal, closeModal, confirmDialog, promptDialog, calculateAge, calculateTenure, cascadeEmployeeChanges, syncAllEmployeesAcrossCollections, fmtDateShort, localDateStr, toNumber, getCalculatedJatahCuti, calculateCarryoverJatah, downloadHtmlAsPdf } from "../utils.js";
import { renderCrudModule, badge, emptyState, icon, skeletonRows } from "../components.js";
import { uploadFileToDrive } from "../gas-integration.js";
import { divisionOptionsFromSources } from "../division-options.mjs";
import { normalizeEmail, isValidEmail } from "../employee-email.mjs";

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
 { name: "nik_karyawan", label: "NIK Karyawan", type: "text", required: true, maxLength: 30, placeholder: "ID internal karyawan" },
 { name: "nama_karyawan", label: "Nama Lengkap Karyawan", type: "text", required: true, maxLength: 120, placeholder: "Sesuai dokumen identitas" },
 { 
 name: "cabang", label: "Cabang Penempatan", type: "datalist", required: true,
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
 name: "divisi", label: "Divisi / Unit Kerja", type: "datalist", required: true,
 getOptions: async () => {
 const emps = await fsGetAll(COL.MASTER_KARYAWAN);
 return divisionOptionsFromSources({ employees: emps });
 }
 },
 { name: "jenis_kelamin", label: "Jenis Kelamin", type: "select", options: ["LAKI-LAKI", "PEREMPUAN"], required: true },
 { name: "nik_ktp", label: "NIK KTP (16 digit)", type: "text", pattern: "[0-9]{16}", maxLength: 16, inputMode: "numeric", placeholder: "16 digit sesuai e-KTP", title: "NIK KTP harus terdiri dari 16 digit angka." },
 { name: "no_kk", label: "No. Kartu Keluarga (16 digit)", type: "text", pattern: "[0-9]{16}", maxLength: 16, inputMode: "numeric", placeholder: "16 digit nomor KK", title: "Nomor KK harus terdiri dari 16 digit angka." },
 { name: "npwp", label: "NPWP", type: "text", inputMode: "numeric" },
 { name: "bpjs_tk", label: "No. BPJS Ketenagakerjaan", type: "text", inputMode: "numeric" },
 { name: "bpjs_kes", label: "No. BPJS Kesehatan", type: "text", inputMode: "numeric" },
 { name: "status_karyawan", label: "Status Hubungan Kerja", type: "select", options: ["PKWTT (Karyawan Tetap)", "PKWT (Karyawan Kontrak)", "Probation (Masa Percobaan)", "Magang", "Buruh Harian", "Outsourcing", "Lainnya"], required: true },
 { name: "tanggal_lahir", label: "Tanggal Lahir", type: "date", required: true },
 { name: "usia", label: "Usia (Tahun)", type: "number" },
 { name: "tanggal_join", label: "Tanggal Bergabung (Join)", type: "date", required: true },
 { name: "kontrak_habis", label: "Tanggal Kontrak Berakhir", type: "date" },
 { name: "masa_kerja", label: "Masa Kerja", type: "text" },
 { name: "pendidikan", label: "Pendidikan Terakhir", type: "select", options: ["SMA/SMK", "D1", "D2", "D3", "S1", "S2", "S3", "SMP", "SD", "Lainnya"] },
 { name: "agama", label: "Agama", type: "select", options: ["ISLAM", "KRISTEN", "KATHOLIK", "HINDU", "BUDDHA", "KHONGHUCU", "LAINNYA"] },
 { name: "golongan_darah", label: "Golongan Darah", type: "select", options: ["A", "B", "AB", "O", "-"] },
 { name: "no_hp_aktif", label: "No. HP Aktif", type: "tel", inputMode: "tel", maxLength: 25, placeholder: "08xxxxxxxxxx" },
 { name: "email", label: "Email Aktif (untuk notifikasi)", type: "email", required: true, maxLength: 120, autocomplete: "email", placeholder: "nama@perusahaan.com", title: "Alamat email aktif wajib diisi agar notifikasi HRIS dapat diterima." },
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
 { name: "sisa_cuti_tahun_lalu", label: "Sisa Cuti Tahun Lalu", type: "number", default: 0 },
 { name: "alamat", label: "Alamat Lengkap", type: "textarea", full: true },
 ];
 fields.idFromField = "nik_karyawan";

  const beforeSaveEmp = async (data, existing = null) => {
    const trimText = (value) => String(value ?? "").trim();
    const normalizeNik = (value) => trimText(value).replace(/\s+/g, "");

    data.nik_karyawan = normalizeNik(data.nik_karyawan || data.nik);
    data.nama_karyawan = trimText(data.nama_karyawan);
    data.cabang = trimText(data.cabang);
    data.jabatan = trimText(data.jabatan);
    data.divisi = trimText(data.divisi);
    data.status_karyawan = trimText(data.status_karyawan);
    data.aktif_tdk_aktif = trimText(data.aktif_tdk_aktif || data["aktif/tidak_aktif"] || "AKTIF").toUpperCase();
    data.email = normalizeEmail(data.email);
    data.no_hp_aktif = trimText(data.no_hp_aktif).replace(/\s+/g, "");
    data.nik_ktp = trimText(data.nik_ktp || data.no_ktp).replace(/\D/g, "");
    data.no_kk = trimText(data.no_kk || data.no_kartu_keluarga).replace(/\D/g, "");

    if (!data.nik_karyawan) throw new Error("NIK Karyawan wajib diisi.");
    if (!data.nama_karyawan) throw new Error("Nama lengkap karyawan wajib diisi.");
    if (!data.cabang) throw new Error("Cabang penempatan wajib diisi.");
    if (!data.jabatan) throw new Error("Jabatan wajib diisi.");
    if (!data.divisi) throw new Error("Divisi / unit kerja wajib diisi.");
    if (!data.status_karyawan) throw new Error("Status hubungan kerja wajib diisi.");
    if (!data.tanggal_join) throw new Error("Tanggal bergabung (join) wajib diisi.");
    if (!data.tanggal_lahir) throw new Error("Tanggal lahir wajib diisi.");
    if (data.aktif_tdk_aktif === "AKTIF" && !data.email) {
      throw new Error("Email aktif wajib diisi untuk karyawan aktif agar notifikasi HRIS dapat dikirim.");
    }
    if (data.email && !isValidEmail(data.email)) {
      throw new Error("Format email aktif tidak valid. Contoh: nama@perusahaan.com");
    }
    if (data.nik_ktp && !/^\d{16}$/.test(data.nik_ktp)) {
      throw new Error("NIK KTP harus terdiri dari 16 digit angka.");
    }
    if (data.no_kk && !/^\d{16}$/.test(data.no_kk)) {
      throw new Error("Nomor Kartu Keluarga harus terdiri dari 16 digit angka.");
    }

    const joinDate = data.tanggal_join ? new Date(data.tanggal_join) : null;
    const contractEnd = data.kontrak_habis ? new Date(data.kontrak_habis) : null;
    if (joinDate && !Number.isNaN(joinDate.getTime()) && contractEnd && !Number.isNaN(contractEnd.getTime()) && contractEnd < joinDate) {
      throw new Error("Tanggal kontrak berakhir tidak boleh lebih awal dari tanggal bergabung.");
    }

    const existingId = String(existing?.id || "").trim();
    const existingNik = String(existing?.nik_karyawan || existing?.nik || "").trim();
    const duplicate = (await fsGetAll(COL.MASTER_KARYAWAN).catch(() => [])).find((employee) => {
      const employeeId = String(employee.id || "").trim();
      const employeeNik = String(employee.nik_karyawan || employee.nik || "").trim();
      if (existingId && employeeId === existingId) return false;
      if (existingNik && employeeNik === existingNik) return false;
      const sameNik = data.nik_karyawan && employeeNik === data.nik_karyawan;
      const sameKtp = data.nik_ktp && String(employee.nik_ktp || employee.no_ktp || "").replace(/\D/g, "") === data.nik_ktp;
      return sameNik || sameKtp;
    });
    if (duplicate) {
      throw new Error(`Data karyawan duplikat: NIK/NIK KTP sudah dipakai oleh ${duplicate.nama_karyawan || duplicate.nama || duplicate.id}.`);
    }

    data.nik = data.nik_karyawan;
    if (data.jatah_tahunan !== undefined) {
      data.jatah_tahunan = toNumber(data.jatah_tahunan);
      data.jatah_cuti_tahunan = data.jatah_tahunan;
    }
    if (data.jatah_khusus !== undefined) {
      data.jatah_khusus = toNumber(data.jatah_khusus);
      data.jatah_cuti_khusus = data.jatah_khusus;
    }
    if (data.jatah_akumulasi !== undefined) {
      data.jatah_akumulasi = toNumber(data.jatah_akumulasi);
      data.jatah_cuti_akumulasi = data.jatah_akumulasi;
    }
    if (data.sisa_cuti_tahun_lalu !== undefined) {
      data.sisa_cuti_tahun_lalu = toNumber(data.sisa_cuti_tahun_lalu);
    }
    if (data.jatah_cuti_tahunan !== undefined && data.jatah_tahunan === undefined) data.jatah_tahunan = data.jatah_cuti_tahunan;
    if (data.jatah_cuti_khusus !== undefined && data.jatah_khusus === undefined) data.jatah_khusus = data.jatah_cuti_khusus;
    if (data.jatah_cuti_akumulasi !== undefined && data.jatah_akumulasi === undefined) data.jatah_akumulasi = data.jatah_cuti_akumulasi;
    if (data.tanggal_lahir) {
      const age = calculateAge(data.tanggal_lahir);
      if (age !== null) data.usia = age;
    }
    if (data.tanggal_join) {
      const tenure = calculateTenure(data.tanggal_join);
      if (tenure) data.masa_kerja = tenure;
    }
    if (data.nik_ktp) data.no_ktp = data.nik_ktp;
    if (data.no_kk) data.no_kartu_keluarga = data.no_kk;
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
    data.updated_at = new Date().toISOString();
    if (!existing) data.created_at = data.updated_at;
    return data;
  };

  async function openEmployeeDetailAndEditModal(initialEmp, reloadFn, startTab = "detail") {
    if (!initialEmp) return;
    let currentEmp = { ...initialEmp };
    let activeTab = startTab || "detail";

    let allEmps = [];
    let allCutiRecords = [];
    try {
      const [emps, cutis] = await Promise.all([
        fsGetAll(COL.MASTER_KARYAWAN),
        fsGetAll(COL.MASTER_CUTI).catch(() => [])
      ]);
      allEmps = emps || [];
      allCutiRecords = cutis || [];
    } catch (e) {
      allEmps = [];
      allCutiRecords = [];
    }

    const freshEmp = allEmps.find(e => 
      (currentEmp.id && e.id === currentEmp.id) || 
      (currentEmp.nik_karyawan && (e.nik_karyawan === currentEmp.nik_karyawan || e.nik === currentEmp.nik_karyawan)) ||
      (currentEmp.nama_karyawan && e.nama_karyawan === currentEmp.nama_karyawan)
    );
    if (freshEmp) {
      currentEmp = { ...freshEmp, ...currentEmp };
    }

    // ==== KOLOM TAMBAHAN (CUSTOM FIELDS) ====
    // Skema (daftar kolom) disimpan terpusat di doc app_settings/karyawan_custom_fields,
    // sedangkan nilai per-karyawan disimpan di map `custom_fields` pada dokumen master_karyawan.
    const CF_DEF_DOC_ID = "karyawan_custom_fields";
    const CF_INPUT_TYPE = {
      "Teks Singkat": "text",
      "Teks Panjang": "textarea",
      "Angka": "number",
      "Tanggal": "date",
      "Pilihan": "select"
    };
    let customFieldDefs = [];
    try {
      const snapDef = await getDoc(doc(db, COL.APP_SETTINGS, CF_DEF_DOC_ID));
      if (snapDef.exists()) customFieldDefs = Array.isArray(snapDef.data().fields) ? snapDef.data().fields : [];
    } catch (e) {
      console.warn("Gagal memuat skema kolom tambahan karyawan:", e);
    }
    customFieldDefs.sort((a, b) =>
      (toNumber(a.order ?? 0) - toNumber(b.order ?? 0)) ||
      String(a.label || "").localeCompare(String(b.label || ""), "id")
    );

    function getCfValue(empData, def) {
      const v = empData?.custom_fields?.[def.id];
      return (v === null || v === undefined) ? "" : String(v);
    }

    function renderCustomFieldsDetailCard(empData) {
      if (!customFieldDefs.length) return "";
      const rows = customFieldDefs.map(f => {
        const raw = getCfValue(empData, f);
        let display = raw;
        if (raw !== "") {
          if (f.type === "Tanggal") display = fmtDateShort(raw) || raw;
        } else {
          display = "-";
        }
        return `
          <div>
            <dt class="text-[10.5px] text-slate-400">${escapeHtml(f.label || f.id)}</dt>
            <dd class="text-slate-800 font-medium mt-0.5">${escapeHtml(display)}</dd>
          </div>`;
      }).join("");
      return `
        <!-- 5. KOLUM TAMBAHAN (DIKELOLA HRD) -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
          <div class="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
            <div class="flex items-center gap-2 text-maroon-800 font-bold text-xs uppercase tracking-wider">
              ${icon("database", "w-4 h-4 text-maroon-700")}
              Informasi Tambahan (Kolom HRD)
            </div>
            <span class="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">${customFieldDefs.length} kolom</span>
          </div>
          <dl class="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">${rows}</dl>
        </div>
      `;
    }

    function getEmployeeLeaveBalance(empData) {
      const empCuti = allCutiRecords.filter(c => 
        (empData.nama_karyawan && c.nama_karyawan === empData.nama_karyawan) || 
        (empData.nik_karyawan && (c.nik_karyawan === empData.nik_karyawan || c.nik === empData.nik_karyawan)) ||
        (empData.nik && (c.nik === empData.nik || c.nik_karyawan === empData.nik))
      );
      const calc = getCalculatedJatahCuti(empData, empCuti);
      return {
        jatahTahunan: calc.jatahTahunan,
        jatahKhusus: calc.jatahKhusus,
        jatahAkumulasi: calc.jatahAkumulasi,
        usedTahunan: calc.usedTahunan,
        usedKhusus: calc.usedKhusus,
        usedAkumulasi: calc.usedAkumulasi,
        sisaTahunan: calc.sisaTahunan,
        sisaKhusus: calc.sisaKhusus,
        sisaAkumulasi: calc.sisaAkumulasi,
        sisaLalu: parseFloat(empData.sisa_cuti_tahun_lalu) || 0
      };
    }

    // ==== CETAK & PDF DETAIL KARYAWAN ====
    function buildEmployeePrintHtml() {
      const emp = currentEmp;
      const bal = getEmployeeLeaveBalance(emp);
      const nama = emp.nama_karyawan || "-";
      const fileSafeName = `Detail_Karyawan_${String(emp.nama_karyawan || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      const usiaTampil = emp.tanggal_lahir ? (calculateAge(emp.tanggal_lahir) ?? emp.usia ?? "-") : (emp.usia ?? "-");
      const masaKerjaTampil = emp.tanggal_join ? calculateTenure(emp.tanggal_join) : (emp.masa_kerja || "-");
      const fd = (d) => d ? (fmtDateShort(d) || String(d)) : "-";
      const prow = (label, val) => `<tr><td class="lb">${escapeHtml(label)}</td><td class="sp">:</td><td class="vl">${escapeHtml(((val ?? "") + "").trim() === "" ? "-" : String(val))}</td></tr>`;
      const idRows = [
        prow("Nama Lengkap", nama),
        prow("NIK Karyawan", emp.nik_karyawan || emp.nik),
        prow("Jenis Kelamin", emp.jenis_kelamin),
        prow("Tanggal Lahir", `${fd(emp.tanggal_lahir)}${usiaTampil !== "-" ? ` (Usia ${usiaTampil} thn)` : ""}`),
        prow("Agama", emp.agama),
        prow("Pendidikan Terakhir", emp.pendidikan),
        prow("Golongan Darah", emp.golongan_darah),
        prow("Status Pajak / PTKP", emp.status_pajak),
        prow("Anak / Tanggungan", (emp.tanggungan ?? emp.anak) !== undefined ? `${emp.tanggungan ?? emp.anak} Orang` : "")
      ].join("");
      const pegRows = [
        prow("Jabatan", emp.jabatan),
        prow("Divisi / Unit", emp.divisi),
        prow("Cabang", emp.cabang),
        prow("Status Karyawan", emp.status_karyawan),
        prow("Tanggal Join", fd(emp.tanggal_join)),
        prow("Masa Kerja", masaKerjaTampil),
        prow("Kontrak Habis", fd(emp.kontrak_habis)),
        prow("Jam Kerja", emp.jam_kerja),
        prow("Nama Atasan Langsung", emp.atasan),
        prow("Finger Name", emp.finger_name),
        prow("Status Keaktifan", emp.aktif_tdk_aktif || emp["aktif/tidak_aktif"])
      ].join("");
      const kontakRows = [
        prow("No. HP Aktif", emp.no_hp_aktif),
        prow("Email Aktif", emp.email),
        prow("Nama Kontak Darurat", emp.kontak_darurat_nama || emp.nama_kontak_darurat),
        prow("No. HP Kontak Darurat", emp.kontak_darurat_hp || emp.kontak_darurat),
        prow("Alamat Lengkap", String(emp.alamat || "").replace(/\n/g, " — "))
      ].join("");
      const dokRows = [
        prow("NIK KTP", emp.nik_ktp || emp.no_ktp),
        prow("No. Kartu Keluarga", emp.no_kk || emp.no_kartu_keluarga),
        prow("NPWP", emp.npwp),
        prow("No. BPJS Ketenagakerjaan", emp.bpjs_tk || emp.no_bpjs_tk),
        prow("No. BPJS Kesehatan", emp.bpjs_kes || emp.no_bpjs_kes)
      ].join("");
      const cutiRows = [
        prow("Cuti Tahunan — Jatah", `${bal.jatahTahunan} hari (Terpakai: ${bal.usedTahunan} — Sisa: ${bal.sisaTahunan})`),
        prow("Cuti Khusus — Jatah", `${bal.jatahKhusus} hari (Terpakai: ${bal.usedKhusus} — Sisa: ${bal.sisaKhusus})`),
        prow("Cuti Akumulasi — Jatah", `${bal.jatahAkumulasi} hari (Terpakai: ${bal.usedAkumulasi} — Sisa: ${bal.sisaAkumulasi})`),
        prow("Sisa Cuti Tahun Lalu (Basis)", `${bal.sisaLalu} hari`)
      ].join("");
      const cfRows = customFieldDefs.length
        ? customFieldDefs.map(f => {
            const raw = getCfValue(emp, f);
            return prow(f.label || f.id, f.type === "Tanggal" ? fd(raw) : raw);
          }).join("")
        : `<tr><td colspan="3" class="cf-none">Belum ada kolom tambahan.</td></tr>`;
      const todayStr = fmtDateShort(new Date().toISOString().substring(0, 10));

      return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Detail Karyawan — ${escapeHtml(nama)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #eef1f5; color: #1e293b; }
  .page { max-width: 800px; margin: 16px auto; background: #fff; padding: 28px 34px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #6b1125; padding-bottom: 12px; }
  .company { font-size: 20px; font-weight: 800; color: #6b1125; letter-spacing: .5px; }
  .company-sub { font-size: 10.5px; color: #64748b; }
  .doc-title { text-align: right; font-weight: 800; font-size: 14px; letter-spacing: 1px; color: #1e293b; }
  .doc-meta { text-align: right; font-size: 10px; color: #64748b; margin-top: 2px; }
  .sec-head { background: #6b1125; color: #fff; font-size: 10.5px; font-weight: 700; letter-spacing: 1px; padding: 5px 10px; margin: 18px 0 0 0; border-radius: 3px; }
  .grid { width: 100%; border-collapse: collapse; }
  .grid td { padding: 4.5px 6px; font-size: 11.5px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .grid td.lb { width: 200px; color: #475569; }
  .grid td.sp { width: 10px; }
  .grid td.vl { font-weight: 600; }
  .grid td.cf-none { color: #94a3b8; font-style: italic; }
  .footnote { margin-top: 26px; padding-top: 10px; border-top: 1px dashed #cbd5e1; font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between; }
  .toolbar { max-width: 800px; margin: 10px auto 30px; display: flex; gap: 10px; }
  .toolbar button { border: 0; border-radius: 8px; padding: 10px 18px; font-weight: 700; font-size: 12.5px; cursor: pointer; }
  .btn-print { background: #6b1125; color: #fff; }
  .btn-pdf { background: #334155; color: #fff; }
  .toolbar button:hover { opacity: .9; }
  @media print {
    .noprint { display: none !important; }
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; max-width: none; border-radius: 0; padding: 10px 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="doc-head">
    <div>
      <div class="company">CV ANDELA JAYA</div>
      <div class="company-sub">Detail Profil Karyawan — Sumber Data: Database Induk Karyawan (HRIS)</div>
    </div>
    <div>
      <div class="doc-title">DETAIL PROFIL KARYAWAN</div>
      <div class="doc-meta">Nama: ${escapeHtml(String(nama).toUpperCase())} &middot; NIK: ${escapeHtml(emp.nik_karyawan || emp.nik || "-")}<br>Dicetak: ${escapeHtml(todayStr)}</div>
    </div>
  </div>

  <div class="sec-head">I. IDENTITAS &amp; DATA POKOK</div>
  <table class="grid">${idRows}</table>

  <div class="sec-head">II. KEPEGAWAIAN &amp; PENEMPATAN</div>
  <table class="grid">${pegRows}</table>

  <div class="sec-head">III. KONTAK PRIBADI, KELUARGA &amp; ALAMAT</div>
  <table class="grid">${kontakRows}</table>

  <div class="sec-head">IV. DOKUMEN &amp; PERPAJAKAN</div>
  <table class="grid">${dokRows}</table>

  <div class="sec-head">V. HAK &amp; KUOTA CUTI</div>
  <table class="grid">${cutiRows}</table>

  <div class="sec-head">VI. KOLUM TAMBAHAN (HRD)</div>
  <table class="grid">${cfRows}</table>

  <div class="footnote">
    <span>*Dokumen ini dicetak otomatis dari sistem HRIS CV Andela Jaya.</span>
    <span>Dokumen Internal — HRIS Andela</span>
  </div>
</div>

<div class="toolbar noprint">
  <button class="btn-print" onclick="window.print()">&#128424; Cetak Detail</button>
  <button class="btn-pdf" onclick="downloadThisPdf()">&#11015; Unduh PDF</button>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
<script>
function downloadThisPdf() {
  var el = document.querySelector('.page');
  if (!el || typeof html2pdf === 'undefined') { window.print(); return; }
  html2pdf().set({
    margin: [8, 10, 8, 10],
    filename: ${JSON.stringify(fileSafeName)},
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(el).save();
}
<\/script>
</body>
</html>`;
    }

    const empNames = [...new Set(allEmps.map(e => e.nama_karyawan).filter(Boolean))].sort();
    const atasanOpts = empNames;
    const cabangOpts = [...new Set(["HEAD OFFICE", "CABANG BANDUNG", "CABANG SURABAYA", "CABANG SEMARANG", "CABANG BALI", "WORKSHOP", ...allEmps.map(e => e.cabang).filter(Boolean)])].sort();
    const jabatanOpts = [...new Set(["DIREKTUR", "MANAGER HRD", "SUPERVISOR", "STAFF HRD", "STAFF FINANCE", "STAFF OPERASIONAL", "DRIVER", "SECURITY", "HEAD STORE", "STORE ASSOCIATE", ...allEmps.map(e => e.jabatan).filter(Boolean)])].sort();
    const divisiOpts = divisionOptionsFromSources({ employees: allEmps });

    function getInitials(name) {
      if (!name) return "K";
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function renderDetailContent(empData) {
      const isAktif = (empData.aktif_tdk_aktif || empData["aktif/tidak_aktif"] || "AKTIF").toUpperCase() === "AKTIF";
      const tenureStr = empData.tanggal_join ? calculateTenure(empData.tanggal_join) : (empData.masa_kerja || "-");
      const ageStr = empData.tanggal_lahir ? (calculateAge(empData.tanggal_lahir) ?? empData.usia ?? "-") : (empData.usia ?? "-");
      const bal = getEmployeeLeaveBalance(empData);

      return `
        <div class="space-y-5">
          <!-- TOP HERO / HEADER CARD -->
          <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-maroon-950 text-white rounded-2xl p-5 border border-slate-700/60 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div class="flex items-center gap-4 min-w-0">
              <div class="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xl font-black text-amber-300 shadow-inner shrink-0">
                ${escapeHtml(getInitials(empData.nama_karyawan))}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-xl font-bold text-white tracking-tight truncate">${escapeHtml(empData.nama_karyawan || "-")}</h3>
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isAktif ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
                    ${isAktif ? "● AKTIF" : " TIDAK AKTIF"}
                  </span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-400/20 text-amber-200 border border-amber-400/30">
                    ${escapeHtml(empData.status_karyawan || "Karyawan")}
                  </span>
                  ${empData.email ? "" : `
                  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/40">
                    Email belum diisi
                  </span>`}
                </div>
                <div class="flex items-center gap-3 text-xs text-slate-300 mt-1 flex-wrap">
                  <span>NIK: <b class="font-mono text-white">${escapeHtml(empData.nik_karyawan || empData.nik || "-")}</b></span>
                  <span>•</span>
                  <span>Jabatan: <b class="text-white">${escapeHtml(empData.jabatan || "-")}</b></span>
                  <span>•</span>
                  <span>Cabang: <b class="text-white">${escapeHtml(empData.cabang || "-")}</b></span>
                  <span>•</span>
                  <span>Divisi: <b class="text-white">${escapeHtml(empData.divisi || "-")}</b></span>
                </div>
              </div>
            </div>
            <button type="button" id="btn-hero-switch-edit" class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-white text-maroon-900 hover:bg-amber-50 hover:shadow-md transition cursor-pointer shrink-0">
              ${icon("edit", "w-4 h-4 text-maroon-700")}
              Edit Data Karyawan
            </button>
          </div>

          <!-- 4 CARDS GRID -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- 1. DATA POKOK & IDENTITAS -->
            <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-slate-100 text-maroon-800 font-bold text-xs uppercase tracking-wider">
                ${icon("user", "w-4 h-4 text-maroon-700")}
                Data Pokok & Identitas
              </div>
              <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt class="text-[10.5px] text-slate-400">NIK Karyawan</dt>
                  <dd class="font-mono font-bold text-slate-800 mt-0.5">${escapeHtml(empData.nik_karyawan || empData.nik || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">NIK KTP</dt>
                  <dd class="font-mono text-slate-700 mt-0.5">${escapeHtml(empData.nik_ktp || empData.no_ktp || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">No. Kartu Keluarga (KK)</dt>
                  <dd class="font-mono text-slate-700 mt-0.5">${escapeHtml(empData.no_kk || empData.no_kartu_keluarga || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">NPWP</dt>
                  <dd class="font-mono text-slate-700 mt-0.5">${escapeHtml(empData.npwp || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">BPJS Ketenagakerjaan</dt>
                  <dd class="font-mono text-slate-700 mt-0.5">${escapeHtml(empData.bpjs_tk || empData.no_bpjs_tk || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">BPJS Kesehatan</dt>
                  <dd class="font-mono text-slate-700 mt-0.5">${escapeHtml(empData.bpjs_kes || empData.no_bpjs_kes || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Jenis Kelamin</dt>
                  <dd class="text-slate-800 font-medium mt-0.5">${escapeHtml(empData.jenis_kelamin || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Tanggal Lahir / Usia</dt>
                  <dd class="text-slate-800 mt-0.5">${empData.tanggal_lahir ? fmtDateShort(empData.tanggal_lahir) : "-"} (${ageStr} Thn)</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Agama / Gol. Darah</dt>
                  <dd class="text-slate-800 mt-0.5">${escapeHtml(empData.agama || "-")} / Gol. ${escapeHtml(empData.golongan_darah || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Pendidikan Terakhir</dt>
                  <dd class="text-slate-800 font-medium mt-0.5">${escapeHtml(empData.pendidikan || "-")}</dd>
                </div>
                <div class="col-span-2 pt-1 border-t border-slate-50">
                  <dt class="text-[10.5px] text-slate-400">Alamat Tinggal / Domisili</dt>
                  <dd class="text-slate-700 text-xs mt-0.5 leading-relaxed">${escapeHtml(empData.alamat || "-")}</dd>
                </div>
              </dl>
            </div>

            <!-- 2. KEPEGAWAIAN & PENEMPATAN -->
            <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-slate-100 text-maroon-800 font-bold text-xs uppercase tracking-wider">
                ${icon("briefcase", "w-4 h-4 text-maroon-700")}
                Kepegawaian & Penempatan
              </div>
              <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt class="text-[10.5px] text-slate-400">Cabang Penempatan</dt>
                  <dd class="font-bold text-slate-800 mt-0.5">${escapeHtml(empData.cabang || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Jabatan</dt>
                  <dd class="font-bold text-slate-800 mt-0.5">${escapeHtml(empData.jabatan || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Divisi / Unit Kerja</dt>
                  <dd class="text-slate-700 mt-0.5">${escapeHtml(empData.divisi || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Status Hubungan Kerja</dt>
                  <dd class="text-slate-800 font-semibold mt-0.5">${escapeHtml(empData.status_karyawan || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Tanggal Bergabung (Join)</dt>
                  <dd class="text-slate-800 font-medium mt-0.5">${empData.tanggal_join ? fmtDateShort(empData.tanggal_join) : "-"}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Masa Kerja</dt>
                  <dd class="text-slate-800 font-bold mt-0.5 text-maroon-800">${escapeHtml(tenureStr)}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Habis Kontrak</dt>
                  <dd class="text-slate-700 mt-0.5">${empData.kontrak_habis ? fmtDateShort(empData.kontrak_habis) : "-"}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Jam Kerja Standar</dt>
                  <dd class="text-slate-700 font-mono mt-0.5">${escapeHtml(empData.jam_kerja || "08:00 - 17:00")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Atasan Langsung</dt>
                  <dd class="text-slate-800 font-medium mt-0.5">${escapeHtml(empData.atasan || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">ID / Nama Fingerprint</dt>
                  <dd class="font-mono text-slate-700 mt-0.5">${escapeHtml(empData.finger_name || "-")}</dd>
                </div>
              </dl>
            </div>

            <!-- 3. KONTAK, KELUARGA & PAJAK -->
            <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-slate-100 text-maroon-800 font-bold text-xs uppercase tracking-wider">
                ${icon("phone", "w-4 h-4 text-maroon-700")}
                Kontak, Keluarga & Pajak
              </div>
              <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt class="text-[10.5px] text-slate-400">Nomor HP Aktif</dt>
                  <dd class="font-mono font-semibold text-slate-800 mt-0.5">${escapeHtml(empData.no_hp_aktif || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Email Aktif (notifikasi HRIS)</dt>
                  <dd class="text-slate-800 break-all mt-0.5">${empData.email
                    ? `${escapeHtml(empData.email)} <span class="inline-flex ml-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Terhubung</span>`
                    : `<span class="text-rose-600 font-semibold">Belum diisi — email tidak akan terkirim</span>`}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Status Pajak / PTKP</dt>
                  <dd class="font-mono font-bold text-slate-800 mt-0.5">${escapeHtml(empData.status_pajak || "TK/0")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Tanggungan / Anak</dt>
                  <dd class="text-slate-800 font-medium mt-0.5">${empData.tanggungan ?? empData.anak ?? 0} Orang</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">Nama Kontak Darurat</dt>
                  <dd class="text-slate-800 font-medium mt-0.5">${escapeHtml(empData.kontak_darurat_nama || empData.nama_kontak_darurat || "-")}</dd>
                </div>
                <div>
                  <dt class="text-[10.5px] text-slate-400">No. HP Kontak Darurat</dt>
                  <dd class="font-mono text-slate-700 mt-0.5">${escapeHtml(empData.kontak_darurat_hp || empData.kontak_darurat || "-")}</dd>
                </div>
              </dl>
            </div>

            <!-- 4. HAK & KUOTA CUTI -->
            <div class="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <div class="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                <div class="flex items-center gap-2 text-maroon-800 font-bold text-xs uppercase tracking-wider">
                  ${icon("calendar", "w-4 h-4 text-maroon-700")}
                  Hak & Kuota Cuti Karyawan
                </div>
                <span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Sinkron Kelola Cuti
                </span>
              </div>
              <div class="grid grid-cols-3 gap-2.5">
                <div class="p-2.5 bg-blue-50/50 rounded-xl border border-blue-100 text-center">
                  <div class="text-[10px] uppercase font-bold text-blue-900">Cuti Tahunan</div>
                  <div class="text-lg font-black text-blue-700 font-mono mt-0.5">${bal.sisaTahunan} <span class="text-[10px] font-normal text-slate-500">Hari</span></div>
                  <div class="text-[10px] text-slate-500 mt-0.5">Jatah: <b class="text-slate-700">${bal.jatahTahunan}</b> | Pakai: <b class="text-amber-700">${bal.usedTahunan}</b></div>
                </div>
                <div class="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-100 text-center">
                  <div class="text-[10px] uppercase font-bold text-emerald-900">Cuti Khusus</div>
                  <div class="text-lg font-black text-emerald-700 font-mono mt-0.5">${bal.sisaKhusus} <span class="text-[10px] font-normal text-slate-500">Hari</span></div>
                  <div class="text-[10px] text-slate-500 mt-0.5">Jatah: <b class="text-slate-700">${bal.jatahKhusus}</b> | Pakai: <b class="text-amber-700">${bal.usedKhusus}</b></div>
                </div>
                <div class="p-2.5 bg-amber-50/50 rounded-xl border border-amber-100 text-center">
                  <div class="text-[10px] uppercase font-bold text-amber-900">Akumulasi</div>
                  <div class="text-lg font-black text-amber-700 font-mono mt-0.5">${bal.sisaAkumulasi} <span class="text-[10px] font-normal text-slate-500">Hari</span></div>
                  <div class="text-[10px] text-slate-500 mt-0.5">Jatah: <b class="text-slate-700">${bal.jatahAkumulasi}</b> | Pakai: <b class="text-amber-700">${bal.usedAkumulasi}</b></div>
                </div>
              </div>
              <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Sisa Cuti Tahun Lalu (Basis Carryover): <b class="text-slate-700 font-mono">${bal.sisaLalu} Hari</b></span>
                <a href="#cuti" class="text-maroon-700 hover:text-maroon-800 font-bold hover:underline inline-flex items-center gap-1 text-[11px]" onclick="document.querySelector('#nav-link-cuti')?.click()">
                  Buka di Kelola Cuti &rarr;
                </a>
              </div>
            </div>
          </div>

          <!-- 5. KOLUM TAMBAHAN (DIKELOLA HRD) -->
          ${renderCustomFieldsDetailCard(empData)}

          <!-- FOOTER ACTION INSIDE DETAIL -->
          <div class="pt-2 flex items-center justify-between border-t border-slate-100">
            <span class="text-xs text-slate-400">Data ini tersinkronisasi otomatis ke seluruh modul HRD & Operasional.</span>
            <button type="button" id="btn-bottom-switch-edit" class="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white transition shadow-sm cursor-pointer">
              ${icon("edit", "w-4 h-4")}
              Buka Form Edit Data
            </button>
          </div>
        </div>
      `;
    }

    function renderEditFormContent(empData) {
      const bal = getEmployeeLeaveBalance(empData);
      function renderInput(name, label, type, val, opts = {}, extra = {}) {
        const baseClass = "w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-maroon-600 focus:ring-2 focus:ring-maroon-100 outline-none transition";
        const attrs = [
          extra.required ? "required" : "",
          extra.readonly ? "readonly" : "",
          extra.pattern ? `pattern="${escapeHtml(extra.pattern)}"` : "",
          extra.title ? `title="${escapeHtml(extra.title)}"` : "",
          extra.maxLength ? `maxlength="${Number(extra.maxLength)}"` : "",
          extra.inputMode ? `inputmode="${escapeHtml(extra.inputMode)}"` : "",
          extra.autocomplete ? `autocomplete="${escapeHtml(extra.autocomplete)}"` : "",
          extra.step ? `step="${extra.step}"` : "",
          extra.min ? `min="${extra.min}"` : "",
          extra.max ? `max="${extra.max}"` : ""
        ].filter(Boolean).join(" ");
        let inputHtml = "";
        if (type === "textarea") {
          inputHtml = `<textarea name="${name}" rows="2" class="${baseClass}" placeholder="${escapeHtml(extra.placeholder || `Ketik ${label}...`)}" ${attrs}>${escapeHtml(val ?? "")}</textarea>`;
        } else if (type === "select") {
          inputHtml = `
            <select name="${name}" class="${baseClass}" ${attrs}>
              <option value="">-- Pilih ${label} --</option>
              ${(opts.options || []).map(o => `<option value="${escapeHtml(o)}" ${String(o).trim() === String(val ?? "").trim() ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
            </select>`;
        } else if (type === "datalist") {
          const dlId = `dl-${name}-${Math.random().toString(36).substring(2, 6)}`;
          inputHtml = `
            <input type="text" name="${name}" list="${dlId}" value="${escapeHtml(val ?? "")}" placeholder="${escapeHtml(extra.placeholder || `Ketik / pilih ${label}`)}" class="${baseClass}" ${attrs}>
            <datalist id="${dlId}">
              ${(opts.options || []).map(o => `<option value="${escapeHtml(o)}"></option>`).join("")}
            </datalist>`;
        } else if (type === "date") {
          const dv = val ? localDateStr(val) : "";
          inputHtml = `<input type="date" name="${name}" value="${dv}" class="${baseClass}" ${attrs}>`;
        } else if (type === "number") {
          inputHtml = `<input type="number" name="${name}" value="${val !== undefined && val !== null ? val : (extra.default ?? 0)}" class="${baseClass}" ${attrs}>`;
        } else {
          const inputType = ["email", "tel", "url"].includes(type) ? type : "text";
          inputHtml = `<input type="${inputType}" name="${name}" value="${escapeHtml(val ?? "")}" placeholder="${escapeHtml(extra.placeholder || `Ketik ${label}`)}" class="${baseClass}" ${attrs}>`;
        }

        return `
          <div class="${extra.full ? "col-span-full" : ""}">
            <label class="block text-[11px] font-bold text-slate-700 mb-1">${label} ${extra.required ? '<span class="text-red-500">*</span>' : ""}</label>
            ${inputHtml}
            ${extra.hint ? `<p class="text-[10px] text-slate-400 mt-1">${escapeHtml(extra.hint)}</p>` : ""}
          </div>
        `;
      }

      return `
        <form id="form-edit-emp" class="space-y-5">
          <!-- GROUP 1: IDENTITAS & DATA POKOK -->
          <div class="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-maroon-800 pb-2 mb-3 border-b border-slate-200/60 flex items-center gap-1.5">
              ${icon("user", "w-4 h-4 text-maroon-700")}
              1. Identitas & Data Pokok Karyawan
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              ${renderInput("nik_karyawan", "NIK Karyawan", "text", empData.nik_karyawan || empData.nik, {}, { required: true, maxLength: 30, placeholder: "ID internal karyawan" })}
              ${renderInput("nama_karyawan", "Nama Lengkap Karyawan", "text", empData.nama_karyawan, {}, { required: true, maxLength: 120, placeholder: "Sesuai dokumen identitas" })}
              ${renderInput("jenis_kelamin", "Jenis Kelamin", "select", empData.jenis_kelamin, { options: ["LAKI-LAKI", "PEREMPUAN"] }, { required: true })}
              ${renderInput("nik_ktp", "NIK KTP (16 digit)", "text", empData.nik_ktp || empData.no_ktp, {}, { pattern: "[0-9]{16}", maxLength: 16, inputMode: "numeric", placeholder: "16 digit sesuai e-KTP", title: "NIK KTP harus terdiri dari 16 digit angka." })}
              ${renderInput("no_kk", "No. Kartu Keluarga (16 digit)", "text", empData.no_kk || empData.no_kartu_keluarga, {}, { pattern: "[0-9]{16}", maxLength: 16, inputMode: "numeric", placeholder: "16 digit nomor KK", title: "Nomor KK harus terdiri dari 16 digit angka." })}
              ${renderInput("npwp", "NPWP", "text", empData.npwp, {}, { inputMode: "numeric" })}
              ${renderInput("bpjs_tk", "No. BPJS Ketenagakerjaan", "text", empData.bpjs_tk || empData.no_bpjs_tk, {}, { inputMode: "numeric" })}
              ${renderInput("bpjs_kes", "No. BPJS Kesehatan", "text", empData.bpjs_kes || empData.no_bpjs_kes, {}, { inputMode: "numeric" })}
              ${renderInput("tanggal_lahir", "Tanggal Lahir", "date", empData.tanggal_lahir, {}, { required: true })}
              ${renderInput("usia", "Usia (Tahun)", "number", empData.tanggal_lahir ? (calculateAge(empData.tanggal_lahir) ?? empData.usia ?? 0) : (empData.usia ?? 0))}
              ${renderInput("agama", "Agama", "select", empData.agama, { options: ["ISLAM", "KRISTEN", "KATHOLIK", "HINDU", "BUDDHA", "KHONGHUCU", "LAINNYA"] })}
              ${renderInput("golongan_darah", "Golongan Darah", "select", empData.golongan_darah, { options: ["A", "B", "AB", "O", "-"] })}
              ${renderInput("pendidikan", "Pendidikan Terakhir", "select", empData.pendidikan, { options: ["SMA/SMK", "D1", "D2", "D3", "S1", "S2", "S3", "SMP", "SD", "Lainnya"] })}
            </div>
          </div>

          <!-- GROUP 2: KEPEGAWAIAN & PENEMPATAN -->
          <div class="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-maroon-800 pb-2 mb-3 border-b border-slate-200/60 flex items-center gap-1.5">
              ${icon("briefcase", "w-4 h-4 text-maroon-700")}
              2. Kepegawaian & Penempatan Kerja
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              ${renderInput("cabang", "Cabang Penempatan", "datalist", empData.cabang, { options: cabangOpts }, { required: true })}
              ${renderInput("jabatan", "Jabatan", "datalist", empData.jabatan, { options: jabatanOpts }, { required: true })}
              ${renderInput("divisi", "Divisi / Unit Kerja", "datalist", empData.divisi, { options: divisiOpts }, { required: true })}
              ${renderInput("status_karyawan", "Status Hubungan Kerja", "select", empData.status_karyawan, { options: ["PKWTT (Karyawan Tetap)", "PKWT (Karyawan Kontrak)", "Probation (Masa Percobaan)", "Magang", "Buruh Harian", "Outsourcing", "Lainnya"] }, { required: true })}
              ${renderInput("tanggal_join", "Tanggal Bergabung (Join)", "date", empData.tanggal_join, {}, { required: true })}
              ${renderInput("masa_kerja", "Masa Kerja", "text", empData.tanggal_join ? calculateTenure(empData.tanggal_join) : (empData.masa_kerja || ""), {}, { readonly: true })}
              ${renderInput("kontrak_habis", "Tanggal Kontrak Berakhir", "date", empData.kontrak_habis)}
              ${renderInput("jam_kerja", "Jam Kerja", "text", empData.jam_kerja || "08:00 - 17:00")}
              ${renderInput("atasan", "Nama Atasan Langsung", "datalist", empData.atasan, { options: atasanOpts })}
              ${renderInput("finger_name", "Finger Name", "text", empData.finger_name)}
              ${renderInput("aktif_tdk_aktif", "Status Keaktifan", "select", empData.aktif_tdk_aktif || empData["aktif/tidak_aktif"] || "AKTIF", { options: ["AKTIF", "TIDAK AKTIF"] }, { required: true })}
            </div>
          </div>

          <!-- GROUP 3: KONTAK, KELUARGA & PAJAK -->
          <div class="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-maroon-800 pb-2 mb-3 border-b border-slate-200/60 flex items-center gap-1.5">
              ${icon("phone", "w-4 h-4 text-maroon-700")}
              3. Kontak Pribadi, Keluarga & Pajak
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              ${renderInput("no_hp_aktif", "No. HP Aktif", "tel", empData.no_hp_aktif, {}, { inputMode: "tel", maxLength: 25, placeholder: "08xxxxxxxxxx" })}
              ${renderInput("email", "Email Aktif (untuk notifikasi)", "email", empData.email, {}, { required: true, maxLength: 120, autocomplete: "email", placeholder: "nama@perusahaan.com", hint: "Email ini dipakai untuk notifikasi dokumen, cuti, dan siklus karyawan." })}
              ${renderInput("status_pajak", "Status Pajak / PTKP", "select", empData.status_pajak || "TK/0", { options: ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3", "K/I/0", "K/I/1", "K/I/2", "K/I/3"] })}
              ${renderInput("tanggungan", "Anak / Tanggungan", "number", empData.tanggungan ?? empData.anak ?? 0)}
              ${renderInput("kontak_darurat_nama", "Nama Kontak Darurat", "text", empData.kontak_darurat_nama || empData.nama_kontak_darurat)}
              ${renderInput("kontak_darurat_hp", "No. HP Kontak Darurat", "text", empData.kontak_darurat_hp || empData.kontak_darurat)}
            </div>
          </div>

          <!-- GROUP 4: JATAH CUTI & ALAMAT -->
          <div class="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4">
            <div class="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60">
              <h4 class="text-xs font-bold uppercase tracking-wider text-maroon-800 flex items-center gap-1.5">
                ${icon("calendar", "w-4 h-4 text-maroon-700")}
                4. Hak & Kuota Cuti (Terhubung Langsung dengan Kelola Cuti)
              </h4>
              <span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                Sinkron Real-time
              </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              ${renderInput("jatah_tahunan", "Jatah Cuti Tahunan (Awal)", "number", bal.jatahTahunan, {}, { step: "0.5", min: "0" })}
              ${renderInput("jatah_khusus", "Jatah Cuti Khusus (Awal)", "number", bal.jatahKhusus, {}, { step: "0.5", min: "0" })}
              ${renderInput("jatah_akumulasi", "Jatah Cuti Akumulasi", "number", bal.jatahAkumulasi, {}, { step: "0.5", min: "0" })}
              ${renderInput("sisa_cuti_tahun_lalu", "Sisa Cuti Thn Lalu (Basis)", "number", empData.sisa_cuti_tahun_lalu ?? 0, {}, { step: "0.5", min: "0" })}
            </div>
            <div class="p-2.5 bg-white rounded-xl border border-slate-200/80 text-[11px] text-slate-600 mb-3 flex flex-wrap items-center justify-between gap-2">
              <div class="space-x-1">
                <span class="font-bold text-slate-700">Pemakaian Berjalan:</span>
                <span>Tahunan: <b class="text-amber-700 font-mono">${bal.usedTahunan} hari</b> (Sisa: <b class="text-blue-700 font-mono">${bal.sisaTahunan}</b>)</span>
                <span>•</span>
                <span>Khusus: <b class="text-amber-700 font-mono">${bal.usedKhusus} hari</b> (Sisa: <b class="text-emerald-700 font-mono">${bal.sisaKhusus}</b>)</span>
                <span>•</span>
                <span>Akumulasi: <b class="text-amber-700 font-mono">${bal.usedAkumulasi} hari</b> (Sisa: <b class="text-amber-700 font-mono">${bal.sisaAkumulasi}</b>)</span>
              </div>
            </div>
            <div>
              ${renderInput("alamat", "Alamat Lengkap Karyawan", "textarea", empData.alamat, {}, { full: true })}
            </div>
          </div>

          <!-- GROUP 5: KOLUM TAMBAHAN (DIKELOLA HRD) -->
          <div class="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4">
            <div class="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60">
              <h4 class="text-xs font-bold uppercase tracking-wider text-maroon-800 flex items-center gap-1.5">
                ${icon("database", "w-4 h-4 text-maroon-700")}
                5. Kolom Tambahan (Dikelola HRD)
              </h4>
              <button type="button" id="btn-manage-cf" class="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-700 hover:bg-slate-800 text-white transition cursor-pointer">
                ${icon("user-plus", "w-3.5 h-3.5")}
                Tambah / Kelola Kolom
              </button>
            </div>
            ${customFieldDefs.length ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              ${customFieldDefs.map(f => renderInput(
                `cf_${f.id}`,
                f.label || f.id,
                CF_INPUT_TYPE[f.type] || "text",
                getCfValue(empData, f),
                f.type === "Pilihan" ? { options: f.options || [] } : {}
              )).join("")}
            </div>` : `
            <p class="text-[11px] text-slate-500 italic">Belum ada kolom tambahan. Klik "Tambah / Kelola Kolom" untuk membuat kolom baru (mis. No. SIM, No. Rekening, Ukuran Seragam, dsb.) yang akan tersimpan di data karyawan ini dan tampil di tab Detail &amp; halaman cetak.</p>`}
          </div>

          <!-- FORM ACTIONS -->
          <div class="pt-3 flex items-center justify-between border-t border-slate-200">
            <button type="button" id="btn-cancel-edit-form" class="px-4 py-2.5 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition cursor-pointer">
              Batal / Kembali ke Detail
            </button>
            <button type="submit" id="btn-save-emp-form" class="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white shadow-sm hover:shadow transition cursor-pointer">
              ${icon("check", "w-4 h-4")}
              Simpan Perubahan Data Karyawan
            </button>
          </div>
        </form>
      `;
    }

    const modalBodyHtml = `
      <div id="modal-emp-wrapper" class="space-y-4">
        <!-- TABS NAV -->
        <div class="flex items-center border-b border-slate-200 gap-1 pb-1">
          <button id="tab-btn-detail" type="button" class="px-4 py-2.5 text-xs font-bold border-b-2 border-maroon-700 text-maroon-800 flex items-center gap-2 transition cursor-pointer">
            ${icon("user", "w-4 h-4 text-maroon-700")}
            Detail Profil Karyawan
          </button>
          <button id="tab-btn-edit" type="button" class="px-4 py-2.5 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 transition cursor-pointer">
            ${icon("edit", "w-4 h-4")}
            Edit Data Karyawan
          </button>
        </div>

        <!-- PANE 1: DETAIL -->
        <div id="pane-detail" class="${activeTab === 'detail' ? "" : "hidden"}">
          ${renderDetailContent(currentEmp)}
        </div>

        <!-- PANE 2: EDIT -->
        <div id="pane-edit" class="${activeTab === 'edit' ? "" : "hidden"}">
          ${renderEditFormContent(currentEmp)}
        </div>
      </div>
    `;

    const modalFooterHtml = `
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <button id="btn-print-emp" type="button" title="Cetak detail karyawan (formulir A4)" class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-600 hover:bg-slate-700 text-white transition cursor-pointer">
            ${icon("printer", "w-4 h-4")}
            Cetak Detail
          </button>
          <button id="btn-pdf-emp" type="button" title="Unduh detail karyawan sebagai PDF" class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer">
            ${icon("download", "w-4 h-4")}
            Unduh PDF
          </button>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-400">ID Dokumen: <span class="font-mono">${escapeHtml(currentEmp.id || currentEmp.nik_karyawan || "-")}</span></span>
          <button id="btn-close-emp-modal" type="button" class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer">
            Tutup
          </button>
        </div>
      </div>
    `;

    openModal({
      title: "Profil & Edit Data Karyawan",
      size: "xl",
      bodyHtml: modalBodyHtml,
      footerHtml: modalFooterHtml,
      onMount: (modalEl) => {
        const tabBtnDetail = modalEl.querySelector("#tab-btn-detail");
        const tabBtnEdit = modalEl.querySelector("#tab-btn-edit");
        const paneDetail = modalEl.querySelector("#pane-detail");
        const paneEdit = modalEl.querySelector("#pane-edit");
        const btnClose = modalEl.querySelector("#btn-close-emp-modal");

        if (btnClose) btnClose.onclick = () => closeModal();

        function setTab(tab) {
          activeTab = tab;
          if (tab === "detail") {
            tabBtnDetail.classList.add("border-maroon-700", "text-maroon-800", "font-bold");
            tabBtnDetail.classList.remove("border-transparent", "text-slate-500", "font-semibold");
            tabBtnEdit.classList.remove("border-maroon-700", "text-maroon-800", "font-bold");
            tabBtnEdit.classList.add("border-transparent", "text-slate-500", "font-semibold");
            paneDetail.classList.remove("hidden");
            paneEdit.classList.add("hidden");
          } else {
            tabBtnEdit.classList.add("border-maroon-700", "text-maroon-800", "font-bold");
            tabBtnEdit.classList.remove("border-transparent", "text-slate-500", "font-semibold");
            tabBtnDetail.classList.remove("border-maroon-700", "text-maroon-800", "font-bold");
            tabBtnDetail.classList.add("border-transparent", "text-slate-500", "font-semibold");
            paneEdit.classList.remove("hidden");
            paneDetail.classList.add("hidden");
          }
        }

        tabBtnDetail.onclick = () => setTab("detail");
        tabBtnEdit.onclick = () => setTab("edit");

        function refreshPanes() {
          paneDetail.innerHTML = renderDetailContent(currentEmp);
          paneEdit.innerHTML = renderEditFormContent(currentEmp);
          attachDetailEvents();
          attachEditEvents();
        }

        async function saveCfDefs(okMsg) {
          await setDoc(doc(db, COL.APP_SETTINGS, CF_DEF_DOC_ID), {
            fields: customFieldDefs,
            updated_at: new Date().toISOString()
          }, { merge: true });
          if (okMsg) toast(okMsg, "success");
        }

        // Modal bertumpuk (kecil) — openModal() generik hanya mendukung 1 modal aktif,
        // jadi manajer kolom memakai backdrop sendiri agar modal karyawan tetap terbuka.
        function openStackedModal({ title, bodyHtml, footerHtml = "", onMount = null }) {
          const backdrop = document.createElement("div");
          backdrop.id = "app-modal-stacked-backdrop";
          backdrop.className = "fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4";
          backdrop.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" id="app-modal-stacked-panel">
              <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 class="text-base font-semibold text-slate-800">${escapeHtml(title)}</h3>
                <button id="stacked-modal-close" class="text-slate-400 hover:text-maroon-700 hover:bg-slate-100 rounded-lg w-8 h-8 flex items-center justify-center transition cursor-pointer">${icon("x", "w-5 h-5")}</button>
              </div>
              <div class="px-6 py-4 overflow-y-auto">${bodyHtml}</div>
              ${footerHtml ? `<div class="px-6 py-3 border-t border-slate-100 flex items-center justify-end gap-2">${footerHtml}</div>` : ""}
            </div>`;
          document.body.appendChild(backdrop);
          const close = () => backdrop.remove();
          const mEl = backdrop.querySelector("#app-modal-stacked-panel");
          mEl.querySelector("#stacked-modal-close").onclick = close;
          if (onMount) onMount(mEl, close);
          return close;
        }

        // ==== MANAJER KOLOM TAMBAHAN (HRD) ====
        function openCustomFieldManager() {
          const listHtml = () => customFieldDefs.length ? customFieldDefs.map(f => `
            <div class="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl">
              <div class="min-w-0">
                <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(f.label || f.id)}</div>
                <div class="text-[10px] text-slate-400">${escapeHtml(f.type)}${f.type === "Pilihan" && (f.options || []).length ? " &bull; " + escapeHtml(f.options.join(", ")) : ""}</div>
              </div>
              <button type="button" data-cf-del="${escapeHtml(f.id)}" title="Hapus kolom ini dari skema" class="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition cursor-pointer">
                ${icon("trash", "w-3 h-3")} Hapus
              </button>
            </div>`).join("") : `<p class="text-[11px] text-slate-500 italic">Belum ada kolom tambahan.</p>`;

          openStackedModal({
            title: "Kelola Kolom Tambahan Karyawan",
            size: "sm",
            bodyHtml: `
              <form id="cf-form" class="space-y-3">
                <div class="p-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-[11px] text-blue-900">
                  Kolom baru berlaku untuk <b>semua karyawan</b> dan isinya per orang diisi pada Form Edit Data Karyawan. Nilai yang sudah terisi tidak hilang walau kolom dihapus (hanya tidak tampil lagi).
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-700 mb-1">Nama Kolom Baru <span class="text-red-500">*</span></label>
                  <input id="cf-label" type="text" placeholder="Contoh: No. SIM Gada Pratama" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-maroon-600 focus:ring-2 focus:ring-maroon-100 outline-none transition" required>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-700 mb-1">Tipe Pengisian</label>
                  <select id="cf-type" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:border-maroon-600 outline-none transition">
                    <option value="Teks Singkat">Teks Singkat (input 1 baris)</option>
                    <option value="Teks Panjang">Teks Panjang (paragraf)</option>
                    <option value="Angka">Angka (number)</option>
                    <option value="Tanggal">Tanggal (date picker)</option>
                    <option value="Pilihan">Pilihan (dropdown)</option>
                  </select>
                </div>
                <div id="cf-options-wrap" class="hidden">
                  <label class="block text-[11px] font-bold text-slate-700 mb-1">Opsi Pilihan <span class="text-slate-400 font-normal">(pisahkan dengan koma)</span></label>
                  <input id="cf-options" type="text" placeholder="Contoh: SIKP A, SIUP AKP, BELUM PUNYA" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-maroon-600 outline-none transition">
                </div>
                <button type="submit" id="cf-add" class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white transition cursor-pointer">
                  ${icon("user-plus", "w-4 h-4")} Tambah Kolom
                </button>
              </form>
              <div class="mt-4 pt-3 border-t border-slate-200">
                <div class="text-[11px] font-bold uppercase text-slate-500 mb-2">Daftar Kolom Aktif</div>
                <div id="cf-list" class="space-y-2">${listHtml()}</div>
              </div>
            `,
            footerHtml: `
              <button id="cf-done" type="button" class="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer">Selesai</button>
            `,
            onMount: (mEl, closeMgr) => {
              mEl.querySelector("#cf-done").onclick = () => closeMgr();
              const typeSel = mEl.querySelector("#cf-type");
              const optWrap = mEl.querySelector("#cf-options-wrap");
              const optionsInput = mEl.querySelector("#cf-options");
              const syncOpts = () => optWrap.classList.toggle("hidden", typeSel.value !== "Pilihan");
              typeSel.onchange = syncOpts;
              syncOpts();

              const refreshList = () => {
                mEl.querySelector("#cf-list").innerHTML = listHtml();
                mEl.querySelectorAll("[data-cf-del]").forEach(btn => {
                  btn.onclick = async () => {
                    if (!confirm("Hapus kolom ini dari skema? Nilai lama pada karyawan tidak dihapus, hanya berhenti ditampilkan.")) return;
                    const delId = btn.getAttribute("data-cf-del");
                    try {
                      customFieldDefs = customFieldDefs.filter(x => x.id !== delId);
                      await saveCfDefs("Kolom tambahan berhasil dihapus.");
                      refreshList();
                      refreshPanes();
                    } catch (e) {
                      console.error("Gagal menghapus kolom tambahan:", e);
                      toast("Gagal menghapus kolom tambahan: " + (e.message || e), "error");
                    }
                  };
                });
              };
              refreshList();

              mEl.querySelector("#cf-form").onsubmit = async (evt) => {
                evt.preventDefault();
                const label = mEl.querySelector("#cf-label").value.trim();
                const type = typeSel.value;
                const options = optionsInput.value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
                if (!label) { toast("Nama kolom wajib diisi.", "warning"); return; }
                if (type === "Pilihan" && !options.length) { toast("Isi minimal satu opsi untuk tipe Pilihan.", "warning"); return; }
                if (customFieldDefs.some(f => String(f.label || "").trim().toLowerCase() === label.toLowerCase())) {
                  toast("Kolom dengan nama tersebut sudah ada.", "warning");
                  return;
                }
                const btnAdd = mEl.querySelector("#cf-add");
                try {
                  btnAdd.disabled = true;
                  btnAdd.innerHTML = "Menyimpan...";
                  customFieldDefs = [...customFieldDefs, { id: genId("cf"), label, type, options, order: customFieldDefs.length }];
                  await saveCfDefs(`Kolom "${label}" berhasil ditambahkan.`);
                  mEl.querySelector("#cf-label").value = "";
                  optionsInput.value = "";
                  refreshList();
                  refreshPanes();
                } catch (e) {
                  console.error("Gagal menambah kolom tambahan:", e);
                  toast("Gagal menambah kolom: " + (e.message || e), "error");
                } finally {
                  btnAdd.disabled = false;
                  btnAdd.innerHTML = `${icon("user-plus", "w-4 h-4")} Tambah Kolom`;
                }
              };
            }
          });
        }

        // ==== CETAK & PDF DETAIL KARYAWAN ====
        const btnPrintEmp = modalEl.querySelector("#btn-print-emp");
        if (btnPrintEmp) btnPrintEmp.onclick = () => {
          try {
            const w = window.open("", "_blank", "width=980,height=1150");
            if (!w) {
              toast("Popup diblokir oleh browser. Izinkan popup untuk situs ini agar bisa mencetak.", "warning");
              return;
            }
            w.document.open();
            w.document.write(buildEmployeePrintHtml());
            w.document.close();
            w.focus();
          } catch (e) {
            console.error("Gagal membuka halaman cetak:", e);
            toast("Gagal membuka halaman cetak: " + (e.message || e), "error");
          }
        };

        const btnPdfEmp = modalEl.querySelector("#btn-pdf-emp");
        if (btnPdfEmp) btnPdfEmp.onclick = async () => {
          const btn = btnPdfEmp;
          const btnHtml = btn.innerHTML;
          try {
            btn.disabled = true;
            btn.innerHTML = `${icon("refresh", "w-4 h-4 animate-spin")} Menyiapkan PDF...`;
            const fileSafe = String(currentEmp.nama_karyawan || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_");
            await downloadHtmlAsPdf(buildEmployeePrintHtml(), `Detail_${fileSafe}.pdf`, "portrait");
            toast("PDF detail karyawan berhasil diunduh.", "success");
          } catch (e) {
            console.error("Gagal mengunduh PDF detail karyawan:", e);
            toast("Gagal mengunduh PDF: " + (e.message || e), "error");
          } finally {
            btn.disabled = false;
            btn.innerHTML = btnHtml;
          }
        };

        function attachDetailEvents() {
          const btnHeroEdit = modalEl.querySelector("#btn-hero-switch-edit");
          const btnBottomEdit = modalEl.querySelector("#btn-bottom-switch-edit");
          if (btnHeroEdit) btnHeroEdit.onclick = () => setTab("edit");
          if (btnBottomEdit) btnBottomEdit.onclick = () => setTab("edit");
        }

        function attachEditEvents() {
          const form = modalEl.querySelector("#form-edit-emp");
          const btnCancel = modalEl.querySelector("#btn-cancel-edit-form");
          if (btnCancel) btnCancel.onclick = () => setTab("detail");

          if (!form) return;

          const btnManageCf = form.querySelector("#btn-manage-cf");
          if (btnManageCf) btnManageCf.onclick = () => openCustomFieldManager();

          const inputBirth = form.querySelector('input[name="tanggal_lahir"]');
          const inputUsia = form.querySelector('input[name="usia"]');
          if (inputBirth && inputUsia) {
            inputBirth.addEventListener("change", () => {
              if (inputBirth.value) {
                const age = calculateAge(inputBirth.value);
                if (age !== null) inputUsia.value = age;
              }
            });
          }

          const inputJoin = form.querySelector('input[name="tanggal_join"]');
          const inputTenure = form.querySelector('input[name="masa_kerja"]');
          if (inputJoin && inputTenure) {
            inputJoin.addEventListener("change", () => {
              if (inputJoin.value) {
                const tenure = calculateTenure(inputJoin.value);
                if (tenure) inputTenure.value = tenure;
              }
            });
          }

          const inSisaLalu = form.querySelector('input[name="sisa_cuti_tahun_lalu"]');
          const inAkumulasi = form.querySelector('input[name="jatah_akumulasi"]');
          if (inSisaLalu && inAkumulasi) {
            inSisaLalu.addEventListener("change", () => {
              const val = parseFloat(inSisaLalu.value) || 0;
              if (val > 0) {
                const autoAkum = calculateCarryoverJatah(val, currentEmp.tanggal_join);
                inAkumulasi.value = autoAkum;
              }
            });
          }

          form.onsubmit = async (evt) => {
            evt.preventDefault();
            if (!form.reportValidity()) return;

            const fd = new FormData(form);
            let updatedData = {};
            fields.forEach(f => {
              let v = fd.get(f.name);
              if (f.type === "number") v = toNumber(v);
              updatedData[f.name] = v;
            });

            if (fd.has("jatah_tahunan")) updatedData.jatah_tahunan = toNumber(fd.get("jatah_tahunan"));
            if (fd.has("jatah_khusus")) updatedData.jatah_khusus = toNumber(fd.get("jatah_khusus"));
            if (fd.has("jatah_akumulasi")) updatedData.jatah_akumulasi = toNumber(fd.get("jatah_akumulasi"));
            if (fd.has("sisa_cuti_tahun_lalu")) updatedData.sisa_cuti_tahun_lalu = toNumber(fd.get("sisa_cuti_tahun_lalu"));

            try {
              updatedData = await beforeSaveEmp(updatedData, currentEmp);
            } catch (validationError) {
              toast(validationError.message || "Data karyawan belum valid.", "error");
              return;
            }

            // Kolom tambahan (HRD) → nilai dikumpulkan ke map custom_fields
            if (customFieldDefs.length) {
              const cfMap = {};
              for (const f of customFieldDefs) {
                let v = fd.get(`cf_${f.id}`);
                if (v !== null && CF_INPUT_TYPE[f.type] === "number") v = toNumber(v);
                cfMap[f.id] = (v === null ? "" : v);
              }
              updatedData.custom_fields = { ...(currentEmp.custom_fields || {}), ...cfMap };
            }

            // Calculate fresh leave balances to keep all modules perfectly in sync
            const freshEmpForCalc = { ...currentEmp, ...updatedData };
            const empCuti = allCutiRecords.filter(c => 
              (freshEmpForCalc.nama_karyawan && c.nama_karyawan === freshEmpForCalc.nama_karyawan) || 
              (freshEmpForCalc.nik_karyawan && (c.nik_karyawan === freshEmpForCalc.nik_karyawan || c.nik === freshEmpForCalc.nik_karyawan)) ||
              (freshEmpForCalc.nik && (c.nik === freshEmpForCalc.nik || c.nik_karyawan === freshEmpForCalc.nik))
            );
            const freshCalc = getCalculatedJatahCuti(freshEmpForCalc, empCuti);
            updatedData.terpakai_tahunan = freshCalc.usedTahunan;
            updatedData.terpakai_khusus = freshCalc.usedKhusus;
            updatedData.terpakai_akumulasi = freshCalc.usedAkumulasi;
            updatedData.cuti_terpakai_tahunan = freshCalc.usedTahunan;
            updatedData.cuti_terpakai_khusus = freshCalc.usedKhusus;
            updatedData.cuti_terpakai_akumulasi = freshCalc.usedAkumulasi;
            updatedData.sisa_cuti_tahunan = freshCalc.sisaTahunan;
            updatedData.sisa_cuti_khusus = freshCalc.sisaKhusus;
            updatedData.sisa_cuti_akumulasi = freshCalc.sisaAkumulasi;

            const btnSave = form.querySelector("#btn-save-emp-form");
            if (btnSave) {
              btnSave.disabled = true;
              btnSave.innerHTML = `${icon("refresh", "w-4 h-4 animate-spin")} Menyimpan...`;
            }

            try {
              const targetDocId = currentEmp.id || currentEmp.nik_karyawan;
              await fsUpdate(COL.MASTER_KARYAWAN, targetDocId, updatedData);
              
              // Synchronize across duplicate/alternate docs by NIK or name if any
              try {
                const empNik = (currentEmp.nik || currentEmp.nik_karyawan || "").toString().trim();
                const empName = (currentEmp.nama_karyawan || "").toString().trim();
                if (empNik || empName) {
                  const qColl = collection(db, COL.MASTER_KARYAWAN);
                  const matches = [];
                  if (empNik) {
                    const snapNik = await getDocs(query(qColl, where("nik_karyawan", "==", empNik)));
                    snapNik.forEach(d => { if (d.id !== String(targetDocId)) matches.push(d.id); });
                    const snapNikAlt = await getDocs(query(qColl, where("nik", "==", empNik)));
                    snapNikAlt.forEach(d => { if (d.id !== String(targetDocId)) matches.push(d.id); });
                  }
                  if (empName) {
                    const snapName = await getDocs(query(qColl, where("nama_karyawan", "==", empName)));
                    snapName.forEach(d => { if (d.id !== String(targetDocId)) matches.push(d.id); });
                  }
                  const uniqueOtherDocIds = [...new Set(matches)];
                  for (const otherId of uniqueOtherDocIds) {
                    await updateDoc(doc(db, COL.MASTER_KARYAWAN, otherId), updatedData).catch(() => {});
                  }
                }
              } catch (altErr) {
                console.warn("Sinkronisasi doc alternatif:", altErr);
              }

              try {
                await cascadeEmployeeChanges(currentEmp, updatedData);
              } catch (cascErr) {
                console.warn("Cascade error on update:", cascErr);
              }

              currentEmp = { ...currentEmp, ...updatedData };
              toast("Data karyawan & kuota cuti berhasil diperbarui dan tersinkronisasi!", "success");

              if (typeof reloadFn === "function") {
                try { reloadFn(); } catch (e) { console.warn("Reload table error:", e); }
              }

              paneDetail.innerHTML = renderDetailContent(currentEmp);
              paneEdit.innerHTML = renderEditFormContent(currentEmp);
              attachDetailEvents();
              attachEditEvents();
              setTab("detail");
            } catch (err) {
              console.error("Gagal simpan data karyawan:", err);
              toast("Gagal menyimpan data karyawan: " + (err.message || err), "error");
            } finally {
              if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = `${icon("check", "w-4 h-4")} Simpan Perubahan Data Karyawan`;
              }
            }
          };
        }

        attachDetailEvents();
        attachEditEvents();
      }
    });
  }

  const crudRes = await renderCrudModule(panels.karyawan, {
    title: "Database Induk Karyawan",
    subtitle: "Sumber data utama seluruh karyawan CV Andela Jaya. Klik baris data karyawan untuk melihat popup detail profil & mengedit data.",
    collectionName: COL.MASTER_KARYAWAN,
    orderByField: "nama_karyawan",
    size: "2xl",
    searchFields: ["nama_karyawan", "nik_karyawan", "jabatan", "cabang", "divisi", "status_karyawan", "finger_name", "nik_ktp", "no_kk", "bpjs_tk", "bpjs_kes", "npwp", "email", "no_hp_aktif", "atasan"],
    onRowClick: (emp, helpers) => openEmployeeDetailAndEditModal(emp, helpers?.reload, "detail"),
    onEditClick: (emp, helpers) => openEmployeeDetailAndEditModal(emp, helpers?.reload, "edit"),
    // Kolom tambahan (HRD) ikut di-export: diambil dari skema app_settings,
    // valuenya dibaca dari map custom_fields per baris melalui getter virtual.
    getExportExtras: async () => {
      let defs = [];
      try {
        const snapDef = await getDoc(doc(db, COL.APP_SETTINGS, "karyawan_custom_fields"));
        if (snapDef.exists()) defs = Array.isArray(snapDef.data().fields) ? snapDef.data().fields : [];
      } catch (e) {
        console.warn("Gagal memuat skema kolom tambahan untuk export:", e);
      }
      const detailExports = [
        { key: "jenis_kelamin", label: "Jenis Kelamin" },
        { key: "nik_ktp", label: "NIK KTP", getValue: (row) => row.nik_ktp || row.no_ktp || "" },
        { key: "no_kartu_keluarga", label: "No. Kartu Keluarga", getValue: (row) => row.no_kartu_keluarga || row.no_kk || "" },
        { key: "no_bpjs_tk", label: "No. BPJS Ketenagakerjaan", getValue: (row) => row.no_bpjs_tk || row.bpjs_tk || row.bpjs_ketenagakerjaan || "" },
        { key: "no_bpjs_kes", label: "No. BPJS Kesehatan", getValue: (row) => row.no_bpjs_kes || row.bpjs_kes || row.bpjs_kesehatan || "" },
        { key: "tanggal_lahir", label: "Tanggal Lahir" },
        { key: "usia", label: "Usia", getValue: (row) => row.tanggal_lahir ? (calculateAge(row.tanggal_lahir) ?? row.usia ?? "") : (row.usia ?? "") },
        { key: "masa_kerja", label: "Masa Kerja", getValue: (row) => row.tanggal_join ? calculateTenure(row.tanggal_join) : (row.masa_kerja || "") },
        { key: "pendidikan", label: "Pendidikan Terakhir" },
        { key: "agama", label: "Agama" },
        { key: "golongan_darah", label: "Golongan Darah" },
        { key: "alamat", label: "Alamat Lengkap" },
        { key: "kontak_darurat", label: "No. HP Kontak Darurat", getValue: (row) => row.kontak_darurat || row.kontak_darurat_hp || "" },
        { key: "nama_kontak_darurat", label: "Nama Kontak Darurat", getValue: (row) => row.nama_kontak_darurat || row.kontak_darurat_nama || "" },
        { key: "npwp", label: "NPWP" },
        { key: "status_pajak", label: "Status Pajak / PTKP" },
        { key: "anak", label: "Anak / Tanggungan", getValue: (row) => row.anak ?? row.tanggungan ?? 0 },
        { key: "jam_kerja", label: "Jam Kerja" },
        { key: "finger_name", label: "Finger Name" },
        { key: "jatah_tahunan", label: "Jatah Cuti Tahunan" },
        { key: "jatah_khusus", label: "Jatah Cuti Khusus" },
        { key: "jatah_akumulasi", label: "Jatah Cuti Akumulasi" },
        { key: "atasan", label: "Atasan Langsung" },
        { key: "template_kpi", label: "Template KPI" },
        { key: "akses_menu", label: "Akses Menu" }
      ];
      return [
        ...detailExports,
        ...defs.map(f => ({
          key: `custom_fields.${f.id}`,
          label: `Kolom HRD: ${f.label || f.id}`,
          getValue: (row) => {
            const v = row?.custom_fields?.[f.id];
            return (v === null || v === undefined) ? "" : v;
          }
        }))
      ];
    },
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
    beforeSave: beforeSaveEmp,
 columns: [
 { key: "nik_karyawan", label: "NIK Karyawan" },
 { key: "nama_karyawan", label: "Nama Karyawan" },
 { key: "cabang", label: "Cabang" },
 { key: "divisi", label: "Divisi / Unit" },
 { key: "jabatan", label: "Jabatan" },
 { key: "status_karyawan", label: "Status Kerja", type: "badge" },
 { key: "tanggal_join", label: "Tanggal Join", type: "date" },
 { key: "kontrak_habis", label: "Kontrak Berakhir", type: "date" },
 { key: "email", label: "Email Aktif", format: (v) => v ? escapeHtml(String(v)) : '<span class="text-rose-600 font-semibold text-[11px]">Belum diisi</span>' },
 { key: "no_hp_aktif", label: "No. HP" },
 { key: "aktif_tdk_aktif", label: "Status Keaktifan", format: (v, r) => r.aktif_tdk_aktif || r["aktif/tidak_aktif"] || v || "AKTIF", type: "badge", badgeTone: (v) => (v === "AKTIF" || v === "Active") ? "green" : "red" }
 ],
 formFields: fields
 });

  panels.karyawan.querySelector("#btn-sync-all-karyawan")?.addEventListener("click", async () => {
    const ok = await confirmDialog("Sinkronkan seluruh nama & data karyawan dari Master Database ke seluruh modul (Absensi, Pengajuan, Tracking Sales, KPI, dsb)?", { title: "Sinkronisasi Master Karyawan Global" });
    if (!ok) return;

    openModal({
      title: "Sinkronisasi Seluruh Modul",
      size: "md",
      bodyHtml: `
        <div class="space-y-4 py-2" id="sync-progress-container">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress Sinkronisasi</span>
            <span id="sync-percentage-text" class="text-sm font-extrabold text-maroon-700">0%</span>
          </div>
          
          <!-- Progress Bar Track -->
          <div class="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
            <div id="sync-progress-bar" class="bg-gradient-to-r from-maroon-600 to-maroon-800 h-full rounded-full transition-all duration-200 ease-out" style="width: 0%;"></div>
          </div>

          <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500">Karyawan Terproses:</span>
              <span id="sync-count-text" class="font-bold text-slate-800">0 / 0 Karyawan</span>
            </div>
            <div class="flex items-start justify-between text-xs gap-2">
              <span class="text-slate-500 shrink-0">Sedang Memproses:</span>
              <span id="sync-current-emp" class="font-semibold text-slate-700 truncate text-right">Menyiapkan data...</span>
            </div>
          </div>

          <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>Sinkronisasi otomatis ke modul Absensi, Pengajuan, Cuti, Kontrak PKWT, KPI & Sales.</span>
          </div>
        </div>
      `,
      footerHtml: `
        <button id="btn-close-sync-modal" class="w-full px-4 py-2.5 bg-slate-100 text-slate-400 font-semibold rounded-lg text-xs cursor-not-allowed transition" disabled>
          Sedang Menyinkronkan Data...
        </button>
      `,
      onMount: async (mEl) => {
        const pBar = mEl.querySelector("#sync-progress-bar");
        const pText = mEl.querySelector("#sync-percentage-text");
        const cText = mEl.querySelector("#sync-count-text");
        const empText = mEl.querySelector("#sync-current-emp");
        const btnClose = mEl.querySelector("#btn-close-sync-modal");

        try {
          const count = await syncAllEmployeesAcrossCollections(({ current, total, percentage, currentEmployee }) => {
            if (pBar) pBar.style.width = `${percentage}%`;
            if (pText) pText.textContent = `${percentage}%`;
            if (cText) cText.textContent = `${current} / ${total} Karyawan`;
            if (empText) empText.textContent = currentEmployee;
          });

          if (pBar) {
            pBar.style.width = "100%";
            pBar.classList.remove("from-maroon-600", "to-maroon-800");
            pBar.classList.add("from-emerald-500", "to-emerald-600");
          }
          if (pText) {
            pText.textContent = "100% Selesai";
            pText.className = "text-sm font-extrabold text-emerald-600";
          }
          if (empText) empText.textContent = "Seluruh modul berhasil tersinkron!";
          
          if (btnClose) {
            btnClose.disabled = false;
            btnClose.className = "w-full px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 transition shadow-sm cursor-pointer";
            btnClose.textContent = "Selesai & Tutup";
            btnClose.onclick = () => {
              closeModal();
              crudRes.reload();
            };
          }

          toast(`Sukses menyinkronkan ${count} data karyawan ke seluruh modul sistem!`, "success");
          setTimeout(() => {
            crudRes.reload();
          }, 1200);

        } catch (e) {
          if (pText) {
            pText.textContent = "Gagal";
            pText.className = "text-sm font-extrabold text-rose-600";
          }
          if (empText) empText.textContent = "Terjadi kesalahan: " + e.message;
          if (btnClose) {
            btnClose.disabled = false;
            btnClose.className = "w-full px-4 py-2.5 bg-rose-600 text-white font-bold rounded-lg text-xs hover:bg-rose-700 transition cursor-pointer";
            btnClose.textContent = "Tutup";
            btnClose.onclick = () => closeModal();
          }
          toast("Gagal sinkronisasi: " + e.message, "error");
        }
      }
    });
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
 await notifyUser(targetUser, "Tanda Tangani Dokumen", `Admin mengunggah dokumen baru "${judul}" untuk Anda tanda tangani.`, "/#riwayat", { manual: true });
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
 { key: COL.GIMMICK_SOP, label: "Arsip Lama SOP & Gimmick (gimmick_sop)" },
 { key: COL.SOP_DOKUMEN, label: "Dokumen SOP (sop_dokumen)" },
 { key: COL.SOP_AUDIT, label: "Audit Kepatuhan SOP (sop_audit)" },
 { key: COL.GIMMICK_MASTER, label: "Master Barang Gimmick (master_gimmick)" },
 { key: COL.GIMMICK_STOK, label: "Alokasi Stok Gimmick (gimmick_stok)" },
 { key: COL.GIMMICK_DISTRIBUSI, label: "Distribusi Gimmick (gimmick_distribusi)" },
 { key: COL.GIMMICK_EFEKTIVITAS, label: "Efektivitas Gimmick (gimmick_efektivitas)" },
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
