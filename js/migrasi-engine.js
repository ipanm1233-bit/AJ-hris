/**
 * =====================================================================
 * MIGRASI-ENGINE.JS — Mesin Super Migrasi Excel → Firestore
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Menggunakan ulang firebase-config.js & utils.js yang sama dengan
 * aplikasi utama agar skema data 100% konsisten.
 * =====================================================================
 */
import { db, COL, collection, doc, getDocs, writeBatch, query, limit } from "./firebase-config.js";
import { toSnakeCase, smartParseDate, sha256, genId } from "./utils.js";

/* ---------------------------------------------------------------------
 * PETA SHEET EXCEL -> KOLEKSI FIRESTORE
 * dateFields   : kolom (snake_case) yang WAJIB melalui Smart Date Parser
 * jsonFields   : kolom berisi string JSON yang perlu di-parse jadi object/array
 * skip         : true jika sheet ini sengaja dilewati (pivot/staging/usang)
 * idField      : kolom snake_case dipakai sebagai ID dokumen Firestore
 * transform    : fungsi kustom opsional untuk penyesuaian akhir per-baris
 * ------------------------------------------------------------------- */
const SHEET_MAP = {
  "Master Karyawan": {
    collection: COL.MASTER_KARYAWAN, idField: "nik_karyawan",
    dateFields: ["tanggal_lahir", "tanggal_join", "kontrak_habis"],
  },
  "Master Cuti": {
    collection: COL.MASTER_CUTI, idField: "record_id_cuti",
    dateFields: ["tanggal"],
  },
  "MASTER JATAH CUTI": { skip: true, note: "Data sudah tercakup pada kolom jatah_* di Master Karyawan." },
  "Master Kendaraan": {
    collection: COL.MASTER_KENDARAAN, idField: "no_polisi",
    dateFields: ["tgl_stnk_tahunan", "tgl_pajak_5_thn", "tgl_kir"],
  },
  "Master Inventory": {
    collection: COL.MASTER_INVENTORY, idField: "id_item",
  },
  "MASTER KONTRAK": {
    collection: COL.MASTER_KONTRAK, idField: "record_id",
    dateFields: ["tanggal_mulai", "tanggal_akhir"],
  },
  "Users": {
    collection: COL.USERS, idField: "username",
    transform: async (row) => {
      if (row.password) { row.password_hash = await sha256(String(row.password)); delete row.password; }
      if (row.username) row.username = String(row.username).toUpperCase();
      return row;
    }
  },
  "Form_Config": {
    collection: COL.FORM_CONFIG, idField: "id_form",
    jsonFields: ["approval_flow", "fields_json"],
  },
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
  "Login_Tokens": { skip: true, note: "Token sesi lama sistem sebelumnya — tidak relevan & sensitif, tidak dimigrasi." },
  "Sheet23": { skip: true, note: "Sheet kerja/staging internal, bukan data final." },
  "Pivot Table 1": { skip: true, note: "Tabel pivot, bukan data mentah." },
  "Sheet14": { skip: true, note: "Sheet kerja/staging internal, bukan data final." },
};

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
      statusEl.innerHTML = `<span class="text-amber-600">●</span> Terhubung ke Firestore, namun Security Rules menolak akses. Pastikan Rules mengizinkan tulis untuk proses migrasi (bisa diperketat kembali setelahnya).`;
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
    const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
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
    const rowCount = Math.max(rows.length - 1, 0);
    const map = SHEET_MAP[name];
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
 * TIPE DATA CERDAS: string angka -> Number, tanggal -> Smart Date Parser
 * ------------------------------------------------------------------- */
function smartConvertValue(rawValue, colKey, mapCfg) {
  if (rawValue === null || rawValue === undefined) return null;
  if (rawValue === "#N/A" || rawValue === "-" || rawValue === "") return null;

  const isDateCol = (mapCfg.dateFields || []).includes(colKey);
  const isJsonCol = (mapCfg.jsonFields || []).includes(colKey);

  if (isDateCol) {
    const d = smartParseDate(rawValue);
    return d ? d.toISOString() : null;
  }
  if (isJsonCol) {
    if (typeof rawValue !== "string") return rawValue;
    try { return JSON.parse(rawValue); } catch { return null; }
  }
  if (rawValue instanceof Date) return rawValue.toISOString();
  if (typeof rawValue === "number") return rawValue;
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed) && trimmed.length < 16) return parseFloat(trimmed);
    return trimmed;
  }
  return rawValue;
}

function sheetRowsToObjects(sheetName) {
  const rows = workbookData[sheetName];
  if (!rows || rows.length < 2) return [];
  const rawHeaders = rows[0];
  const headers = rawHeaders.map(h => toSnakeCase(h || ""));
  const mapCfg = SHEET_MAP[sheetName];
  const objects = [];
  for (let i = 1; i < rows.length; i++) {
    const rawRow = rows[i];
    if (!rawRow || rawRow.every(c => c === null || c === "")) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = smartConvertValue(rawRow[idx], h, mapCfg);
    });
    objects.push(obj);
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
    const mapCfg = SHEET_MAP[sheetName];
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
      if (mapCfg.idField && obj[mapCfg.idField]) {
        docId = sanitizeDocId(String(obj[mapCfg.idField]));
      } else {
        docId = genId(sheetName.replace(/\s+/g, "").slice(0, 6).toUpperCase());
      }
      const ref = doc(db, mapCfg.collection, docId);
      batch.set(ref, { ...obj, _migrated_at: new Date().toISOString(), _source_sheet: sheetName }, { merge: true });
      opCount++; written++;
      if (opCount >= 450) {
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
  logTo("migrate-log", `🎉 Seluruh proses migrasi selesai.`, "green");
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
    seedCollection(COL.SIKLUS_KARYAWAN, [], "SK"), // kosong, akan terisi natural via modul
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
  logTo("seed-log", `🎉 Seluruh data dummy modul baru berhasil dibuat / dipastikan tersedia.`, "green");
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
document.getElementById("file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});
document.getElementById("btn-migrate").addEventListener("click", runMigration);
document.getElementById("btn-seed").addEventListener("click", runSeeder);
