/**
 * =====================================================================
 * MIGRASI-ENGINE.JS — Mesin Super Migrasi Excel → Firestore (Smart Version)
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Menggunakan ulang firebase-config.js & utils.js yang sama dengan
 * aplikasi utama agar skema data 100% konsisten.
 * =====================================================================
 */
import { db, COL, collection, doc, getDocs, writeBatch, query, limit, setDoc } from "./firebase-config.js";
import { toSnakeCase, smartParseDate, genId, localDateStr, calculateAge, calculateTenure } from "./utils.js";

/* ---------------------------------------------------------------------
 * PETA SHEET EXCEL -> KOLEKSI FIRESTORE
 * dateFields   : kolom (snake_case) yang WAJIB melalui Smart Date Parser
 * jsonFields   : kolom berisi string JSON yang perlu di-parse jadi object/array
 * skip         : true jika sheet ini sengaja dilewati (pivot/staging/usang)
 * idField      : kolom snake_case dipakai sebagai ID dokumen Firestore
 * transform    : fungsi kustom opsional untuk penyesuaian akhir per-baris
 * ------------------------------------------------------------------- */
const SHEET_MAP = {
  "Master Karyawan": { collection: COL.MASTER_KARYAWAN, idField: "nik_karyawan", dateFields: ["tanggal_lahir", "tanggal_join", "kontrak_habis"] },
  "Master Cabang": { collection: COL.MASTER_CABANG, idField: "id_cabang" },
  "Master Outlet": { collection: COL.MASTER_CABANG, idField: "id_cabang" },
  "Outlets": { collection: COL.MASTER_CABANG, idField: "id_cabang" },
  "Master Inventory": { collection: COL.MASTER_INVENTORY, idField: "id_item" },
  "Master Item": { collection: COL.MASTER_INVENTORY, idField: "id_item" },
  "Master Barang": { collection: COL.MASTER_INVENTORY, idField: "id_item" },
  "Items": { collection: COL.MASTER_INVENTORY, idField: "id_item" },
  "Absensi": { collection: "absensi", idField: "id_absensi", dateFields: ["tanggal", "jam_masuk", "jam_keluar"] },
  "Data Absensi": { collection: "absensi", idField: "id_absensi", dateFields: ["tanggal", "jam_masuk", "jam_keluar"] },
  "Log Absensi": { collection: "absensi", idField: "id_absensi", dateFields: ["tanggal", "jam_masuk", "jam_keluar"] },
  "Master Shift": { collection: "master_shift", idField: "id_shift" },
  "Shift": { collection: "master_shift", idField: "id_shift" },
  "Master Jabatan": { collection: "master_jabatan", idField: "id_jabatan" },
  "Master Divisi": { collection: "master_divisi", idField: "id_divisi" },
  "Payroll": { collection: "payroll", idField: "id_payroll", dateFields: ["periode", "tanggal"] },
  "Data Payroll": { collection: "payroll", idField: "id_payroll", dateFields: ["periode", "tanggal"] },
  "Master Cuti": { collection: COL.MASTER_CUTI, idField: "record_id_cuti", dateFields: ["tanggal"] },
  "MASTER JATAH CUTI": { skip: true, note: "Data sudah tercakup pada kolom jatah_* di Master Karyawan." },
  "Master Kendaraan": { collection: COL.MASTER_KENDARAAN, idField: "no_polisi", dateFields: ["tgl_stnk_tahunan", "tgl_pajak_5_thn", "tgl_kir"] },
  "MASTER KONTRAK": { collection: COL.MASTER_KONTRAK, idField: "record_id", dateFields: ["tanggal_mulai", "tanggal_akhir"] },
  "Users": {
    collection: COL.USERS, idField: "username",
    transform: async (row) => {
      if (row.password) {
        delete row.password;
        row.requires_auth_provisioning = true;
      }
      if (row.username) row.username = String(row.username).toUpperCase();
      return row;
    }
  },
  "Form_Config": { collection: COL.FORM_CONFIG, idField: "id_form", jsonFields: ["approval_flow", "fields_json"] },
  "Form_Configs": { skip: true, note: "Duplikat dari sheet Form_Config, dilewati agar tidak dobel." },
  "Data_Pengajuan": {
    collection: COL.DATA_PENGAJUAN, idField: "id",
    dateFields: ["tgl"],
    jsonFields: ["detail_json", "approval_flow_json", "approval_steps_json"],
    transform: (row) => {
      row.detail = row.detail_json || {};
      row.approval_flow = row.approval_flow_json || [];
      row.approval_steps = row.approval_steps_json || [];
      row.catatan_penolakan = row.catatan_penolakan ? String(row.catatan_penolakan).split("\n").filter(Boolean) : [];
      delete row.detail_json; delete row.approval_flow_json; delete row.approval_steps_json;
      return row;
    }
  },
  "Broadcast": { collection: COL.BROADCAST, idField: "id", dateFields: ["tanggal"], jsonFields: ["target_list_json"] },
  "Log_SP_Konseling": { collection: COL.LOG_SP_KONSELING, idField: "id_log", dateFields: ["tanggal"] },
  "Data_Pemanggilan": { skip: true, note: "Sheet sumber kosong/tidak berisi header data pada file asli." },
  "Master Soal KPI": { collection: COL.MASTER_SOAL_KPI, idField: null },
  "Log_Penilaian_KPI": { collection: COL.LOG_PENILAIAN_KPI, idField: "id_penilaian", dateFields: ["tanggal"], jsonFields: ["detail_json"] },
  "Tugas_KPI_360": { collection: COL.TUGAS_KPI_360, idField: "id_tugas", dateFields: ["tanggal"], jsonFields: ["soal_json"] },
  "Log_Kendaraan_Fuel": { collection: COL.LOG_KENDARAAN_FUEL, idField: "id_log", dateFields: ["tanggal"] },
  "Log_Kendaraan_Service": { collection: COL.LOG_KENDARAAN_SERVICE, idField: "id_log", dateFields: ["tanggal", "masa_berlaku"] },
  "Log_Kendaraan_Compliance": { collection: COL.LOG_KENDARAAN_COMPLIANCE, idField: null, dateFields: ["tanggal_bayar", "berlaku_hingga"] },
  "Log_Inventory_Pengambilan": { collection: COL.LOG_INVENTORY_PENGAMBILAN, idField: "id_log", dateFields: ["tanggal"] },
  "Stock_Opname": { collection: COL.STOCK_OPNAME, idField: "id_opname", dateFields: ["tanggal"] },
  "Evaluasi_Kontrak": { collection: COL.EVALUASI_KONTRAK, idField: null, dateFields: ["tanggal"] },
  "Log_Offboarding": { collection: COL.LOG_OFFBOARDING, idField: "id_offboarding", dateFields: ["tgl_proses", "tgl_efektif"], jsonFields: ["checklist_json"] },
  "Konfigurasi_Email": { collection: COL.KONFIGURASI_EMAIL, idField: null },
  "Log Inspeksi": { collection: "log_inspeksi", idField: "id_inspeksi", dateFields: ["tanggal"] },
  "Kanal Data": { collection: "kanal_data", idField: "id" },
  "Login_Tokens": { skip: true, note: "Token sesi lama sistem sebelumnya — tidak relevan & sensitif, tidak dimigrasi." },
  "Sheet23": { skip: true, note: "Sheet kerja/staging internal, bukan data final." },
  "Pivot Table 1": { skip: true, note: "Tabel pivot, bukan data mentah." },
  "Sheet14": { skip: true, note: "Sheet kerja/staging internal, bukan data final." },
};

function getMapConfigForSheet(sheetName) {
  if (SHEET_MAP[sheetName]) return SHEET_MAP[sheetName];

  const norm = (sheetName || "").toLowerCase().trim();
  if (norm.includes("outlet") || norm.includes("cabang")) {
    return { collection: COL.MASTER_CABANG, idField: "id_cabang" };
  }
  if (norm.includes("item") || norm.includes("barang") || norm.includes("inventory")) {
    return { collection: COL.MASTER_INVENTORY, idField: "id_item" };
  }
  if (norm.includes("absen") || norm.includes("attend")) {
    return { collection: "absensi", idField: "id_absensi", dateFields: ["tanggal", "jam_masuk", "jam_keluar"] };
  }
  if (norm.includes("shift")) {
    return { collection: "master_shift", idField: "id_shift" };
  }
  if (norm.includes("jabatan")) {
    return { collection: "master_jabatan", idField: "id_jabatan" };
  }
  if (norm.includes("divisi")) {
    return { collection: "master_divisi", idField: "id_divisi" };
  }
  if (norm.includes("payroll") || norm.includes("gaji")) {
    return { collection: "payroll", idField: "id_payroll", dateFields: ["periode", "tanggal"] };
  }
  if (norm.includes("inspeksi")) {
    return { collection: "log_inspeksi", idField: "id_inspeksi", dateFields: ["tanggal"] };
  }
  if (norm.includes("kanal")) {
    return { collection: "kanal_data", idField: "id" };
  }
  if (norm.includes("karyawan") || norm.includes("employee")) {
    return { collection: COL.MASTER_KARYAWAN, idField: "nik_karyawan", dateFields: ["tanggal_lahir", "tanggal_join", "kontrak_habis"] };
  }

  // Dynamic fallback mapping
  const targetCol = toSnakeCase(sheetName) || "data_migrasi";
  return { collection: targetCol, idField: null, dateFields: ["tanggal", "created_at", "updated_at"] };
}

let workbookData = {}; // { sheetName: [rows as array-of-arrays] }
let selectedSheets = new Set();

/* ---------------------------------------------------------------------
 * UI HELPERS
 * ------------------------------------------------------------------- */
function logTo(elId, message, tone = "slate") {
  const el = document.getElementById(elId);
  el.classList.remove("hidden");
  const colors = { slate: "text-slate-300", green: "text-emerald-400", red: "text-red-400", amber: "text-amber-400" };
  const line = document.createElement("div");
  line.className = `log-line ${colors[tone] || colors.slate}`;
  line.textContent = `${new Date().toLocaleTimeString("id-ID")} — ${message}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
function unlockStep(n) {
  document.getElementById(`step-${n}`).classList.remove("opacity-50", "pointer-events-none");
  document.getElementById(`step-badge-${n}`).classList.remove("bg-slate-100", "text-slate-400");
  document.getElementById(`step-badge-${n}`).classList.add("bg-maroon-700", "text-white");
}

/* ---------------------------------------------------------------------
 * STEP 1 — CEK KONEKSI FIREBASE
 * ------------------------------------------------------------------- */
async function checkFirebaseConnection() {
  const statusEl = document.getElementById("firebase-status");
  try {
    await getDocs(query(collection(db, "app_settings"), limit(1)));
    statusEl.innerHTML = `<span class="text-emerald-600">●</span> Terhubung ke Firestore dengan baik. Silakan lanjut ke langkah berikutnya.`;
    unlockStep(2);
  } catch (e) {
    console.error(e);
    if (String(e.code).includes("permission-denied")) {
      statusEl.innerHTML = `<span class="text-amber-600">●</span> Terhubung ke Firestore, namun Security Rules menolak akses. Pastikan Rules mengizinkan tulis untuk proses migrasi.`;
      unlockStep(2);
    } else {
      statusEl.innerHTML = `<span class="text-red-600">●</span> Gagal terhubung ke Firebase. Periksa kembali kredensial pada <code class="bg-slate-100 px-1 rounded">js/firebase-config.js</code>. Detail: ${e.message}`;
    }
  }
}

/* ---------------------------------------------------------------------
 * STEP 2 — BACA & PETAKAN FILE EXCEL
 * ------------------------------------------------------------------- */
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(e.target.result, { type: "array", cellDates: true, raw: true });
    workbookData = {};
    wb.SheetNames.forEach(name => {
      workbookData[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    });
    renderSheetPreview();
  };
  reader.readAsArrayBuffer(file);
}

function renderSheetPreview() {
  const wrap = document.getElementById("sheet-preview");
  wrap.classList.remove("hidden");
  const listEl = document.getElementById("sheet-list");
  selectedSheets = new Set();

  listEl.innerHTML = Object.keys(workbookData).map(name => {
    const rows = workbookData[name];
    const headerIdx = findHeaderRowIndex(rows);
    const rowCount = Math.max(rows.length - (headerIdx + 1), 0);
    const map = getMapConfigForSheet(name);
    const skip = !map || map.skip;
    if (!skip) selectedSheets.add(name);
    return `
      <label class="flex items-center gap-3 p-3 rounded-xl border ${skip ? "border-slate-100 bg-slate-50" : "border-slate-100 hover:bg-maroon-50/40"} transition cursor-pointer">
        <input type="checkbox" data-sheet="${name}" ${skip ? "disabled" : "checked"} class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-400">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-slate-700 truncate">${name}</p>
          <p class="text-xs text-slate-400">${rowCount} baris data ${skip ? `• <span class="text-amber-600">Dilewati: ${map?.note || "tidak dipetakan"}</span>` : `→ koleksi <code class="text-maroon-700">${map.collection}</code>`}</p>
        </div>
      </label>`;
  }).join("");

  listEl.querySelectorAll("[data-sheet]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedSheets.add(cb.dataset.sheet); else selectedSheets.delete(cb.dataset.sheet);
    });
  });

  document.getElementById("btn-select-all").onclick = () => {
    const allChecked = listEl.querySelectorAll("[data-sheet]:not(:disabled)").length === selectedSheets.size;
    listEl.querySelectorAll("[data-sheet]:not(:disabled)").forEach(cb => {
      cb.checked = !allChecked;
      if (cb.checked) selectedSheets.add(cb.dataset.sheet); else selectedSheets.delete(cb.dataset.sheet);
    });
  };

  unlockStep(3);
}

/* ---------------------------------------------------------------------
 * DETEKSI HEURISTIK BARIS HEADER
 * ------------------------------------------------------------------- */
function findHeaderRowIndex(rows) {
  if (!rows || !rows.length) return 0;
  const keywords = ["nik", "nama", "id", "kode", "tanggal", "tgl", "status", "cabang", "jabatan", "divisi", "no", "email", "hp", "telepon", "outlet", "item", "barang"];
  
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const stringCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== "");
    if (stringCells.length < 2) continue;

    const rowStr = stringCells.map(c => String(c).toLowerCase()).join(" ");
    const matchCount = keywords.filter(kw => rowStr.includes(kw)).length;
    if (matchCount >= 1) return i;
  }
  return 0;
}

/* ---------------------------------------------------------------------
 * TIPE DATA CERDAS: ID/NIK -> ALWAYS STRING, ANGKA -> NUMBER, DATE -> SMART PARSER
 * ------------------------------------------------------------------- */
const STRING_ONLY_FIELDS = [
  "nik", "nik_karyawan", "nik_ktp", "no_kk", "bpjs_tk", "bpjs_kes", "npwp", 
  "no_hp", "no_hp_aktif", "no_telepon", "phone", "whatsapp", "wa", "hp", "telepon",
  "nopol", "no_polisi", "username", "user", "id", "kode", "nip", "rekening", "bank", 
  "finger_name", "id_cabang", "id_item", "id_absensi", "id_payroll", "id_shift", 
  "id_jabatan", "id_divisi", "id_outlet", "id_barang", "kode_item", "kode_barang",
  "kontak_darurat_hp", "password", "password_hash", "nokk", "kartu_keluarga",
  "bpjs", "ketenagakerjaan", "kesehatan", "ktp", "e_ktp"
];

const NUMERIC_FIELDS = [
  "gaji", "gaji_pokok", "tunjangan", "potongan", "nominal", "jumlah", "stok", 
  "harga", "usia", "tanggungan", "jatah_tahunan", "jatah_khusus", "jatah_akumulasi", 
  "kuantitas", "qty", "level", "poin", "bobot", "rate", "persen", "total"
];

function smartConvertValue(rawValue, colKey, mapCfg) {
  if (rawValue === null || rawValue === undefined) return null;
  if (rawValue === "#N/A" || rawValue === "-" || rawValue === "") return null;

  const keyLower = String(colKey || "").toLowerCase();
  const isDateCol = (mapCfg.dateFields || []).includes(colKey) || keyLower.includes("tanggal") || keyLower.includes("tgl") || keyLower.includes("date");
  const isJsonCol = (mapCfg.jsonFields || []).includes(colKey) || keyLower.includes("_json");

  // Force string for code/ID/phone/NIK/KK/BPJS/KTP/NPWP fields
  const isStringOnly = STRING_ONLY_FIELDS.some(s => 
    keyLower === s || 
    keyLower.includes("nik") || 
    keyLower.includes("kk") || 
    keyLower.includes("bpjs") || 
    keyLower.includes("ktp") || 
    keyLower.includes("npwp") || 
    keyLower.includes("no_hp") || 
    keyLower.includes("phone") || 
    keyLower.includes("telepon") || 
    keyLower.includes("wa") ||
    keyLower.includes("rekening")
  );

  if (isStringOnly && !isDateCol && !isJsonCol) {
    let strVal = String(rawValue).trim();
    if (strVal.includes("e") || strVal.includes("E")) {
      try {
        if (typeof rawValue === "number") {
          strVal = BigInt(Math.round(rawValue)).toString();
        }
      } catch (e) {}
    }
    if (strVal.endsWith(".0")) strVal = strVal.slice(0, -2);
    return strVal;
  }

  if (isDateCol) {
    const d = smartParseDate(rawValue);
    return d ? localDateStr(d) : String(rawValue).trim();
  }
  if (isJsonCol) {
    if (typeof rawValue !== "string") return rawValue;
    try { return JSON.parse(rawValue); } catch { return null; }
  }
  if (rawValue instanceof Date) return rawValue.toISOString();
  
  // If explicitly numeric or number type
  if (typeof rawValue === "number") return rawValue;

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    const isNumericField = NUMERIC_FIELDS.some(n => keyLower.includes(n));
    if (isNumericField && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    return trimmed;
  }
  return rawValue;
}

/* ---------------------------------------------------------------------
 * UTIS NORMALIZE RECORD KEYS & DUAL-WRITING ALIASES
 * ------------------------------------------------------------------- */
function normalizeRecordKeys(obj, sheetName, mapCfg) {
  const out = { ...obj };

  // Helper untuk mengambil nilai dari beberapa variasi nama kolom
  const getVal = (aliases) => {
    for (const a of aliases) {
      if (out[a] !== undefined && out[a] !== null && out[a] !== "") return out[a];
    }
    // Cari secara fuzzy jika tidak ketemu persis
    for (const k of Object.keys(out)) {
      const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const a of aliases) {
        if (kNorm === a.toLowerCase().replace(/[^a-z0-9]/g, "")) return out[k];
      }
    }
    return null;
  };

  // 1. DUAL-WRITE NIK & NAMA (Sangat krusial untuk Master Karyawan & Relasinya)
  const nikVal = getVal(["nik_karyawan", "nik", "no_nik", "id_karyawan", "no_induk", "no_induk_karyawan", "nip", "id_pegawai"]);
  if (nikVal) {
    const cleanNik = String(nikVal).trim();
    out.nik_karyawan = cleanNik;
    out.nik = cleanNik;
  }

  const namaVal = getVal(["nama_karyawan", "nama", "nama_lengkap", "nama_pegawai"]);
  if (namaVal) {
    const cleanNama = String(namaVal).trim();
    out.nama_karyawan = cleanNama;
    out.nama = cleanNama;
  }

  // 2. NIK KTP / NO KTP
  const nikKtpVal = getVal(["nik_ktp", "no_ktp", "nikktp", "noktp", "e_ktp", "nik_e_ktp", "no_e_ktp", "nik_sesuai_ktp", "ktp", "id_ktp"]);
  if (nikKtpVal) {
    let cleanKtp = String(nikKtpVal).trim();
    if (cleanKtp.endsWith(".0")) cleanKtp = cleanKtp.slice(0, -2);
    out.nik_ktp = cleanKtp;
    out.no_ktp = cleanKtp;
  }

  // 3. NO KARTU KELUARGA (NO KK)
  const noKkVal = getVal(["no_kk", "nokk", "no_kartu_keluarga", "kartu_keluarga", "no_k_k", "no_kk_karyawan", "kartu_keluarga_no", "no_kk_ktp"]);
  if (noKkVal) {
    let cleanKk = String(noKkVal).trim();
    if (cleanKk.endsWith(".0")) cleanKk = cleanKk.slice(0, -2);
    out.no_kk = cleanKk;
    out.no_kartu_keluarga = cleanKk;
  }

  // 4. BPJS KETENAGAKERJAAN (BPJS TK)
  const bpjsTkVal = getVal(["bpjs_tk", "bpjstk", "no_bpjs_tk", "bpjs_ketenagakerjaan", "no_bpjs_ketenagakerjaan", "bpjs_tk_karyawan", "bpjs_tenaga_kerja", "ketenagakerjaan", "no_bpjstk", "no_bpjs_tenaga_kerja", "bpjstk_no"]);
  if (bpjsTkVal) {
    let cleanBpjsTk = String(bpjsTkVal).trim();
    if (cleanBpjsTk.endsWith(".0")) cleanBpjsTk = cleanBpjsTk.slice(0, -2);
    out.bpjs_tk = cleanBpjsTk;
    out.no_bpjs_tk = cleanBpjsTk;
    out.bpjs_ketenagakerjaan = cleanBpjsTk;
  }

  // 5. BPJS KESEHATAN (BPJS KES)
  const bpjsKesVal = getVal(["bpjs_kes", "bpjskes", "no_bpjs_kes", "bpjs_kesehatan", "no_bpjs_kesehatan", "bpjs_kes_karyawan", "no_bpjskes", "jkn", "no_jkn", "kis", "no_kis", "bpjskes_no"]);
  if (bpjsKesVal) {
    let cleanBpjsKes = String(bpjsKesVal).trim();
    if (cleanBpjsKes.endsWith(".0")) cleanBpjsKes = cleanBpjsKes.slice(0, -2);
    out.bpjs_kes = cleanBpjsKes;
    out.no_bpjs_kes = cleanBpjsKes;
    out.bpjs_kesehatan = cleanBpjsKes;
  }

  // 6. NPWP
  const npwpVal = getVal(["npwp", "no_npwp", "nonpwp", "npwp_karyawan"]);
  if (npwpVal) {
    let cleanNpwp = String(npwpVal).trim();
    if (cleanNpwp.endsWith(".0")) cleanNpwp = cleanNpwp.slice(0, -2);
    out.npwp = cleanNpwp;
    out.no_npwp = cleanNpwp;
  }

  // 7. TANGGAL LAHIR & USIA (AUTO CALCULATE)
  const tglLahirVal = getVal(["tanggal_lahir", "tgl_lahir", "tgl_lahir_karyawan", "dob", "date_of_birth", "tgl_lahir_pegawai"]);
  if (tglLahirVal) {
    const dLahir = smartParseDate(tglLahirVal);
    if (dLahir) {
      out.tanggal_lahir = localDateStr(dLahir);
      out.tgl_lahir = out.tanggal_lahir;
      const age = calculateAge(dLahir);
      if (age !== null) {
        out.usia = age;
      }
    }
  } else if (out.tanggal_lahir) {
    const age = calculateAge(out.tanggal_lahir);
    if (age !== null) out.usia = age;
  }

  // 8. TANGGAL JOIN & MASA KERJA (AUTO CALCULATE)
  const tglJoinVal = getVal(["tanggal_join", "tgl_join", "tanggal_masuk", "tgl_masuk", "tanggal_masuk_kerja", "tgl_masuk_kerja", "date_join", "join_date", "tgl_bergabung"]);
  if (tglJoinVal) {
    const dJoin = smartParseDate(tglJoinVal);
    if (dJoin) {
      out.tanggal_join = localDateStr(dJoin);
      out.tgl_join = out.tanggal_join;
      const tenure = calculateTenure(dJoin);
      if (tenure) {
        out.masa_kerja = tenure;
      }
    }
  } else if (out.tanggal_join) {
    const tenure = calculateTenure(out.tanggal_join);
    if (tenure) out.masa_kerja = tenure;
  }

  // 9. CABANG / OUTLET
  const cabangVal = getVal(["cabang", "cabang_area", "outlet", "lokasi", "lokasi_kerja", "penempatan", "nama_cabang", "nama_outlet"]);
  if (cabangVal) {
    const cleanCab = String(cabangVal).trim();
    out.cabang = cleanCab;
    out.outlet = cleanCab;
    out.cabang_area = cleanCab;
  }

  // 10. JABATAN / POSISI
  const jabatanVal = getVal(["jabatan", "posisi", "jabatan_posisi", "role", "profesi", "nama_jabatan"]);
  if (jabatanVal) {
    const cleanJab = String(jabatanVal).trim();
    out.jabatan = cleanJab;
    out.posisi = cleanJab;
  }

  // 11. DIVISI / DEPARTEMEN
  const divisiVal = getVal(["divisi", "departemen", "bagian", "sektor", "nama_divisi"]);
  if (divisiVal) {
    const cleanDiv = String(divisiVal).trim();
    out.divisi = cleanDiv;
    out.departemen = cleanDiv;
  }

  // 12. NO HP / WHATSAPP
  const hpVal = getVal(["no_hp_aktif", "no_hp", "no_telepon", "whatsapp", "wa", "hp", "handphone", "telepon"]);
  if (hpVal) {
    let cleanHp = String(hpVal).trim();
    if (cleanHp.startsWith("8")) cleanHp = "0" + cleanHp;
    out.no_hp_aktif = cleanHp;
    out.no_hp = cleanHp;
    out.whatsapp = cleanHp;
  }

  // 13. STATUS AKTIF
  const statusAktifVal = getVal(["aktif_tdk_aktif", "status_aktif", "status", "aktif"]);
  if (statusAktifVal) {
    const stUpper = String(statusAktifVal).toUpperCase().trim();
    if (["AKTIF", "Y", "YES", "1", "TRUE"].includes(stUpper)) {
      out.aktif_tdk_aktif = "AKTIF";
    } else if (["TIDAK AKTIF", "NON AKTIF", "N", "NO", "0", "FALSE"].includes(stUpper)) {
      out.aktif_tdk_aktif = "TIDAK AKTIF";
    }
  } else if (mapCfg.collection === COL.MASTER_KARYAWAN) {
    out.aktif_tdk_aktif = "AKTIF";
  }

  // 14. STATUS KARYAWAN (PKWT / PKWTT / DLL)
  const statusKaryawanVal = getVal(["status_karyawan", "status_kepegawaian", "status_kerja"]);
  if (statusKaryawanVal) {
    out.status_karyawan = String(statusKaryawanVal).trim();
  }

  return out;
}

function sheetRowsToObjects(sheetName) {
  const rows = workbookData[sheetName];
  if (!rows || rows.length < 2) return [];

  const headerIdx = findHeaderRowIndex(rows);
  const rawHeaders = rows[headerIdx];
  if (!rawHeaders || !Array.isArray(rawHeaders)) return [];

  const headers = rawHeaders.map(h => toSnakeCase(h || ""));
  const mapCfg = getMapConfigForSheet(sheetName);
  const objects = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const rawRow = rows[i];
    if (!rawRow || !Array.isArray(rawRow) || rawRow.every(c => c === null || c === undefined || String(c).trim() === "")) continue;

    const rawObj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      const val = smartConvertValue(rawRow[idx], h, mapCfg);
      if (val !== null && val !== undefined) {
        rawObj[h] = val;
      }
    });

    const normalized = normalizeRecordKeys(rawObj, sheetName, mapCfg);
    if (Object.keys(normalized).length > 0) {
      objects.push(normalized);
    }
  }

  return objects;
}

/* ---------------------------------------------------------------------
 * STEP 3 — TULIS KE FIRESTORE (BATCH, MAX 450/BATCH)
 * ------------------------------------------------------------------- */
async function runMigration() {
  const btn = document.getElementById("btn-migrate");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Memigrasikan...`;
  document.getElementById("migrate-progress-wrap").classList.remove("hidden");
  const bar = document.getElementById("migrate-progress-bar");
  const label = document.getElementById("migrate-progress-label");

  const sheetsToRun = Array.from(selectedSheets);
  let done = 0;

  for (const sheetName of sheetsToRun) {
    const mapCfg = getMapConfigForSheet(sheetName);
    if (!mapCfg || mapCfg.skip) { done++; continue; }

    label.textContent = `Memproses sheet "${sheetName}"...`;
    logTo("migrate-log", `Mulai memproses sheet "${sheetName}" → koleksi "${mapCfg.collection}"`);

    let objects = sheetRowsToObjects(sheetName);
    if (mapCfg.transform) {
      objects = await Promise.all(objects.map(o => mapCfg.transform(o)));
    }

    if (!objects.length) {
      logTo("migrate-log", `Sheet "${sheetName}" tidak memiliki baris data, dilewati.`, "amber");
      done++; bar.style.width = `${Math.round((done / sheetsToRun.length) * 100)}%`;
      continue;
    }

    let batch = writeBatch(db);
    let opCount = 0;
    let written = 0;

    for (const obj of objects) {
      let docId;

      // Smart ID Selection berdasarkan tipe koleksi
      if (mapCfg.collection === COL.MASTER_KARYAWAN) {
        docId = sanitizeDocId(String(obj.nik_karyawan || obj.nik || obj.no_nik || obj.id_karyawan || obj.nama_karyawan || genId("EMP")));
      } else if (mapCfg.collection === COL.USERS) {
        docId = sanitizeDocId(String(obj.username || obj.user || obj.nik || obj.nik_karyawan || genId("USR")).toUpperCase());
      } else if (mapCfg.collection === COL.MASTER_CABANG) {
        docId = sanitizeDocId(String(obj.id_cabang || obj.id_outlet || obj.kode_cabang || obj.kode || obj.id || genId("CAB")));
      } else if (mapCfg.collection === COL.MASTER_INVENTORY) {
        docId = sanitizeDocId(String(obj.id_item || obj.id_barang || obj.kode_item || obj.kode || obj.id || genId("INV")));
      } else if (mapCfg.collection === COL.MASTER_KENDARAAN) {
        docId = sanitizeDocId(String(obj.no_polisi || obj.nopol || obj.plat_nomor || obj.id_kendaraan || genId("VHC")));
      } else if (mapCfg.idField && obj[mapCfg.idField]) {
        docId = sanitizeDocId(String(obj[mapCfg.idField]));
      } else {
        docId = sanitizeDocId(String(obj.id || obj.kode || obj.nik || obj.username || genId(sheetName.replace(/\s+/g, "").slice(0, 6).toUpperCase())));
      }

      const ref = doc(db, mapCfg.collection, docId);
      batch.set(ref, { ...obj, _migrated_at: new Date().toISOString(), _source_sheet: sheetName }, { merge: true });
      opCount++; written++;

      // Otomatis buatkan akun pengguna USERS jika migrasi Master Karyawan agar langsung bisa login
      if (mapCfg.collection === COL.MASTER_KARYAWAN && (obj.nik_karyawan || obj.nik)) {
        const userUname = String(obj.nik_karyawan || obj.nik).toUpperCase();
        const userRef = doc(db, COL.USERS, userUname);
        
        let userRole = "STAFF";
        const jabUpper = String(obj.jabatan || obj.posisi || "").toUpperCase();
        if (jabUpper.includes("MANAGER")) userRole = "MANAGER";
        else if (jabUpper.includes("SUPERVISOR") || jabUpper.includes("SPV")) userRole = "SPV";
        else if (jabUpper.includes("DRIVER")) userRole = "DRIVER";
        else if (jabUpper.includes("SALES")) userRole = "SALES";
        else if (jabUpper.includes("WAREHOUSE") || jabUpper.includes("GUDANG")) userRole = "WAREHOUSE";
        else if (jabUpper.includes("FINANCE")) userRole = "FINANCE";
        else if (jabUpper.includes("HRD")) userRole = "HRD";

        batch.set(userRef, {
          username: userUname,
          nama: obj.nama_karyawan || obj.nama || "Karyawan",
          nik: obj.nik_karyawan || obj.nik,
          role: userRole,
          posisi: obj.jabatan || obj.posisi || "Staf",
          email: obj.email || "",
          no_hp: obj.no_hp_aktif || obj.no_hp || "",
          requires_auth_provisioning: true,
          updated_at: new Date().toISOString()
        }, { merge: true });
        opCount++;
      }

      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();

    logTo("migrate-log", `✔ Sheet "${sheetName}" selesai — ${written} dokumen ditulis ke "${mapCfg.collection}".`, "green");
    done++;
    bar.style.width = `${Math.round((done / sheetsToRun.length) * 100)}%`;
  }

  label.textContent = `Migrasi selesai! ${sheetsToRun.length} sheet telah diproses.`;
  logTo("migrate-log", `Seluruh proses migrasi selesai. Data NIK, Nama, dan Relasi telah dinormalisasi 100%.`, "green");
  btn.disabled = false;
  btn.textContent = "Migrasi Selesai — Jalankan Ulang?";
  unlockStep(4);
}

function sanitizeDocId(str) {
  return str.replace(/[\/\\\.\#\$\[\]]/g, "-").trim().slice(0, 300) || genId("DOC");
}

/* ---------------------------------------------------------------------
 * STEP 4 — SEEDER DATA DUMMY UNTUK MODUL BARU (belum ada di Excel)
 * ------------------------------------------------------------------- */
async function runSeeder() {
  const btn = document.getElementById("btn-seed");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Membuat data dummy...`;

  const tasks = [
    seedCollection(COL.REKRUTMEN_PELAMAR, [
      { nama: "Budi Santoso", posisi_dilamar: "Sales Executive", sumber: "Job Portal", status: "Applied", tanggal_lamar: new Date().toISOString(), catatan: "Kandidat contoh (dummy seed)." },
      { nama: "Siti Rahayu", posisi_dilamar: "Staff Admin", sumber: "Referral", status: "Interview", tanggal_lamar: new Date().toISOString(), catatan: "Kandidat contoh (dummy seed)." },
    ], "ATS"),
    seedCollection(COL.GIMMICK_SOP, [
      { judul: "SOP Pengajuan Cuti Karyawan", kategori: "SOP", versi: "1.0", status: "Aktif", tanggal_terbit: new Date().toISOString(), deskripsi: "Prosedur standar pengajuan cuti seluruh karyawan." },
      { judul: "Gimmick Ulang Tahun Karyawan", kategori: "Gimmick", versi: "1.0", status: "Aktif", tanggal_terbit: new Date().toISOString(), deskripsi: "Panduan pemberian gimmick ulang tahun karyawan." },
    ], "DOC"),
    seedCollection(COL.KALENDER_HR, [
      { judul: "Rapat Koordinasi Bulanan HRD", tanggal_mulai: new Date().toISOString(), jenis: "Agenda", keterangan: "Contoh agenda (dummy seed)." },
    ], "EVT"),
    seedCollection(COL.SIKLUS_KARYAWAN, [], "SK"),
    seedCollection(COL.UANG_MAKAN_EXPEDISI, [], "UM"),
    seedCollection(COL.FORM_CONFIG, [
      {
        id_form_custom: "F-ISO-LEMBUR", nama_form: "Pengajuan Lembur", approval_flow: ["ATASAN", "HRD"],
        allowed_rules: "ALL", allowed_users: "ALL",
        fields_json: [
          { name: "tanggal_lembur", label: "Tanggal Lembur", type: "date", required: true },
          { name: "jam_mulai", label: "Jam Mulai", type: "text", required: true },
          { name: "jam_selesai", label: "Jam Selesai", type: "text", required: true },
          { name: "alasan_lembur", label: "Alasan Lembur", type: "textarea", required: true },
        ]
      },
      {
        id_form_custom: "F-ISO-KASBON", nama_form: "Pengajuan Kasbon", approval_flow: ["ATASAN", "HRD", "FINANCE"],
        allowed_rules: "ALL", allowed_users: "ALL",
        fields_json: [
          { name: "jumlah_kasbon", label: "Jumlah Kasbon (Rp)", type: "number", required: true },
          { name: "keperluan", label: "Keperluan", type: "textarea", required: true },
          { name: "rencana_pelunasan", label: "Rencana Pelunasan", type: "text", required: true },
        ]
      },
    ], "FORM", "id_form_custom"),
  ];

  await Promise.all(tasks);
  logTo("seed-log", `Seluruh data dummy modul baru berhasil dibuat / dipastikan tersedia.`, "green");
  btn.disabled = false;
  btn.textContent = "Seeder Selesai — Jalankan Ulang?";
}

async function seedCollection(colName, sampleRows, idPrefix, customIdField = null) {
  try {
    const existing = await getDocs(query(collection(db, colName), limit(1)));
    if (!existing.empty) {
      logTo("seed-log", `Koleksi "${colName}" sudah memiliki data, dilewati.`, "amber");
      return;
    }
    if (!sampleRows.length) {
      logTo("seed-log", `Koleksi "${colName}" disiapkan (skema siap, akan terisi otomatis melalui aplikasi).`);
      return;
    }
    const batch = writeBatch(db);
    sampleRows.forEach(row => {
      const id = customIdField && row[customIdField] ? row[customIdField] : genId(idPrefix);
      if (customIdField) delete row[customIdField];
      batch.set(doc(db, colName, id), row);
    });
    await batch.commit();
    logTo("seed-log", `✔ Koleksi "${colName}" berhasil diisi ${sampleRows.length} data contoh.`, "green");
  } catch (e) {
    logTo("seed-log", `✘ Gagal membuat data dummy untuk "${colName}": ${e.message}`, "red");
  }
}

/* ---------------------------------------------------------------------
 * INIT
 * ------------------------------------------------------------------- */
checkFirebaseConnection();
document.getElementById("file-input")?.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});
document.getElementById("btn-migrate")?.addEventListener("click", runMigration);
document.getElementById("btn-seed")?.addEventListener("click", runSeeder);
