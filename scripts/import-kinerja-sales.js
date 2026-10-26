#!/usr/bin/env node
/**
 * =====================================================================
 * IMPORT KINERJA SALES (INSENTIF) -> FIRESTORE
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Membaca JSON hasil scripts/export-kinerja-sales.py (sheet 'Data' +
 * sheet ringkasan insentif 01..08 dari file Scheme Incentive) lalu
 * menulis koleksi `sales_kinerja_bulanan` per (periode, area, alias).
 *
 * Pemakaian:
 *   python scripts/export-kinerja-sales.py "<xlsx>" <extract.json>
 *   node scripts/import-kinerja-sales.js --extract <extract.json>          (dry-run)
 *   node scripts/import-kinerja-sales.js --extract <extract.json> --apply  (tulis)
 *
 * Autentikasi:
 *   $env:FIREBASE_ACCESS_TOKEN = (gcloud auth print-access-token)
 *
 * Pemetaan alias nama sales (AAS, ARIF, DIAN, ...) -> NIK memakai:
 *   1. default di bawah (AUTO_ALIAS_MAP, sediakan NIK) 
 *   2. koleksi `sales_alias_map` di Firestore (id = alias, field nik_karyawan,
 *      nama_karyawan) sebagai override manual.
 * Baris dengan alias tak terpetakan tetap ditulis (nik kosong) dan dilaporkan.
 *
 * Opsi:
 *   --project <id> --database <id> --backup-dir <dir> --apply
 * =====================================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const APP_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase-applet-config.json"), "utf8"));

const argv = process.argv.slice(2);
function argValue(name, fallback = "") {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const APPLY = argv.includes("--apply");
const PROJECT = argValue("--project", APP_CONFIG.projectId);
const DATABASE = argValue("--database", APP_CONFIG.firestoreDatabaseId || "(default)");
const EXTRACT_PATH = path.resolve(argValue("--extract", path.join(ROOT, "backups", "kinerja-sales", "extract.json")));
const TOKEN = process.env.FIREBASE_ACCESS_TOKEN || "";

const RUN_ID = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const NOW = new Date().toISOString();
const BACKUP_DIR = path.resolve(argValue("--backup-dir", path.join(ROOT, "backups", `kinerja-sales-${RUN_ID}`)));
const DRY_RUN = !APPLY;

const COLLECTION = "sales_kinerja_bulanan";
const ALIAS_MAP_COLLECTION = "sales_alias_map";

if (!TOKEN) {
  console.error("FATAL: FIREBASE_ACCESS_TOKEN belum diisi.");
  console.error('Contoh: $env:FIREBASE_ACCESS_TOKEN = (gcloud auth print-access-token)');
  process.exit(1);
}

/* Pemetaan alias default. Silakan diperiksa/dikoreksi melalui koleksi
 * `sales_alias_map` tanpa menyentuh skrip ini. */
const AUTO_ALIAS_MAP = {
  AAS: "1062503910",      // AAS ASNAWI
  ASHIF: "1072505980",    // ASHIF SYIFAUL QULUB (KODYA CIREBON)
  SURYA: "1072602040",    // SURYA MAULANA DWI SAHPUTRA
  RIFKI: "1112410850",    // RIFKI AKHSAN LESMANA (KOORDINATOR SALES)
  DAYAT: "1092210890",    // SAPUTRA HIDAYAT (SPV SALES, memandu TJ KNG & CA)
  YULI: "109250781",      // YEYET YULIATY (CBB)
  YEYET: "109250781",     // YEYET YULIATY (nama asli di file DSR)
  EKO: "1042511940",      // EKO MIHARJO (KODYA TEGAL)
  ANGGA: "1062408930",    // ANGGA ARDIANSAH (TEGAL)
  ARIF: "1082503870",     // ARIF JABIDI (MAJALENGKA s.d. Jul, digantikan SURYA)
  IMAM: "1012612890",     // ZAENURUL IMAM (CIREBON TIMUR)
  DIAN: "1072505910",     // RIESDIANTO (alias 'DIAN' di sheet Data, IDM)
};

/* ---------------------------------------------------------------------
 * UTILITAS FIRESTORE (pasar REST, pola update-kontrak.js)
 * ------------------------------------------------------------------- */
function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toValue(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

function fromValue(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromValue);
  if ("mapValue" in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = fromValue(v);
    return out;
  }
  return null;
}

function docToData(doc) {
  const data = { _id: doc.name.split("/").pop(), _createTime: doc.createTime, _updateTime: doc.updateTime };
  for (const [k, v] of Object.entries(doc.fields || {})) data[k] = fromValue(v);
  return data;
}

function docName(collection, id) {
  return `projects/${PROJECT}/databases/${DATABASE}/documents/${collection}/${encodeURIComponent(id)}`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}\n${text.slice(0, 1000)}`);
  return text ? JSON.parse(text) : {};
}

async function listAll(collection) {
  let pageToken = "";
  const docs = [];
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents/${collection}`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const json = await fetchJson(url.toString());
    docs.push(...(json.documents || []).map(docToData));
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return docs;
}

async function commitWrites(writes) {
  const CHUNK = 400;
  for (let i = 0; i < writes.length; i += CHUNK) {
    const chunk = writes.slice(i, i + CHUNK);
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents:commit`;
    await fetchJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writes: chunk }) });
    console.log(`   commit ${Math.min(i + CHUNK, writes.length)}/${writes.length}`);
  }
}

function writeUpdate(collection, id, fields) {
  return { update: { name: docName(collection, id), fields: toFields(fields) } };
}

function safeDocId(id) {
  return String(id || "").replace(/[\/\\\.\#\$\[\]]/g, "-").trim().slice(0, 300) || `DOC-${crypto.randomBytes(6).toString("hex")}`;
}

/* ---------------------------------------------------------------------
 * BANGUN DOKUMEN
 * ------------------------------------------------------------------- */
const normKey = (v) => String(v || "").toUpperCase().replace(/\uFFFD/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").trim();

function pct(actual, target) {
  const a = Number(actual);
  const t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t) || t <= 0) return null;
  return Math.round((a / t) * 1000) / 10;
}

function statusData(periode, groups, hasSummary) {
  const capaian = groups.capaian || {};
  const hasAch = Object.values(capaian).some((v) => v !== null && Number.isFinite(Number(v)));
  if (hasSummary) return "FINAL";
  if (hasAch) return "ACHIEVEMENT_PARSIAL";
  return "TARGET_SAJA";
}

function buildDocs(extract, masterByNik, aliasOverrides, namaFromKontrak) {
  const docs = [];
  const unmapped = [];
  const mappedAliases = new Map();
  // index ringkasan insentif per (periode, area, alias)
  const summaryIndex = new Map();
  for (const s of extract.summary_sheets || []) {
    const periode = `${String(extract.tahun).padStart(4, "0")}-${String(s.bulan_num).padStart(2, "0")}`;
    for (const row of s.rows) {
      summaryIndex.set(`${periode}|${normKey(row.area)}|${normKey(row.alias)}`, { ...row, sheet: s.sheet });
    }
  }

  for (const block of extract.data_blocks || []) {
    for (const row of block.rows) {
      const areaKey = normKey(row.area);
      const aliasKey = normKey(row.alias);
      const aliasUpper = String(row.alias || "").toUpperCase().trim();
      let nik = (aliasOverrides.get(aliasKey) || {}).nik_karyawan || AUTO_ALIAS_MAP[aliasUpper] || "";
      let nama = "";
      if (aliasKey) mappedAliases.set(aliasKey, aliasUpper);
      if (nik) {
        const m = masterByNik.get(String(nik).trim());
        if (m) {
          nama = m.nama_karyawan || "";
        } else if (namaFromKontrak && namaFromKontrak.get(String(nik).trim())) {
          nama = namaFromKontrak.get(String(nik).trim());
        } else {
          masalahNik.push(`${aliasUpper} (${nik})`);
        }
      } else {
        nik = "";
        nama = "";
        unmapped.push(`${block.periode} ${row.area} / ${aliasUpper}`);
      }
      const master = masterByNik.get(String(nik).trim()) || null;
      const role = areaKey.includes("SPV") ? "SPV" : areaKey.includes("KOOR") ? "KOORDINATOR" : "ASR";
      const groups = {};
      for (const [g, map] of Object.entries(row.groups || {})) groups[g] = map;

      const capaianPersen = {};
      const keyTargets = [
        "dulux_liter", "catylac_liter", "maxilite_liter", "aqs_liter",
        "prima_rp", "dcota_rp", "value_ici_rp", "ao_ici", "ao_prima", "ao_dcota",
      ];
      for (const k of keyTargets) {
        const p = pct((groups.capaian || {})[k], (groups.target || {})[k]);
        if (p !== null) capaianPersen[k] = p;
      }

      const g = row.groups || {};
      const id = `KIN-${block.periode}-${safeDocId(`${areaKey}_${aliasKey}`)}`;
      const doc = {
        id,
        fields: {
          periode: block.periode,
          tahun: Number(block.periode.slice(0, 4)),
          bulan_nama: block.bulan,
          area: row.area,
          alias: aliasUpper,
          role,
          nik_karyawan: nik ? nik : null,
          nama_karyawan: master?.nama_karyawan || nama || (aliasUpper ? `${aliasUpper} (${row.area})` : row.area) || row.area,
          jabatan_master: master?.jabatan || null,
          divisi_master: master?.divisi || null,
          cabang_master: master?.cabang || null,
          status_data: statusData(block.periode, groups, summaryIndex.has(`${block.periode}|${areaKey}|${aliasKey}`)),
          target: groups.target || {},
          capaian: groups.capaian || {},
          capaian_persen: capaianPersen,
          effective_call: g.effective_call || {},
          penjualan_baru: g.penjualan_baru || {},
          absensi: g.absensi || {},
        },
      };
      const simpan = summaryIndex.get(`${block.periode}|${areaKey}|${aliasKey}`);
      if (simpan) {
        doc.fields.ringkasan_insentif = {
          sheet_asal: simpan.sheet,
          poin: simpan.poin ?? null,
          point_a: simpan.point_a ?? null,
          point_b: simpan.point_b ?? null,
          point_c: simpan.point_c ?? null,
          point_d: simpan.point_d ?? null,
          point_e: simpan.point_e ?? null,
          point_f: simpan.point_f ?? null,
          um_luar_kota: simpan.um_luar_kota ?? null,
          bonus_q1: simpan.bonus_q1 ?? null,
          bonus_q2: simpan.bonus_q2 ?? null,
          revisi_insentif_ao: simpan.revisi_insentif_ao ?? null,
          adjustment_juni: simpan.adjustment_juni ?? null,
          total_insentif: simpan.total ?? null,
          insentif_admin: simpan.insentif_admin ?? null,
          insentif_finance: simpan.insentif_finance ?? null,
        };
      }
      doc.fields.updated_at = NOW;
      doc.fields._run_id = RUN_ID;
      doc.fields.sumber_file = extract.source_file;
      docs.push(doc);
    }
  }
  if (masalahNik.length) {
    unmapped.push(`* ${[...new Set(masalahNik)].join(", ")} (alias terpetakan tetapi NIK tidak ditemukan di master_karyawan)`);
  }
  return { docs, unmapped };
}

let masalahNik = [];

/* ---------------------------------------------------------------------
 * LAPORAN
 * ------------------------------------------------------------------- */
function reportMarkdown({ plan, existing, masterByNik, aliasOverrides, extract }) {
  const lines = [];
  const add = (s = "") => lines.push(s);
  add(`# Laporan Import Kinerja Sales (Insentif)`);
  add();
  add(`- Waktu: ${NOW}`);
  add(`- Project: \`${PROJECT}\``);
  add(`- Database: \`${DATABASE}\``);
  add(`- Sumber: \`${extract.source_file}\``);
  add(`- Ekstrak: \`${EXTRACT_PATH}\``);
  add(`- Mode: **${DRY_RUN ? "DRY RUN (tidak menulis)" : "APPLY (menulis ke Firestore)"}**`);
  add(`- Run ID: \`${RUN_ID}\``);
  add();
  add(`## Ringkasan`);
  add();
  add(`| Item | Jumlah |`);
  add(`|---|---:|`);
  add(`| Blok bulanan | ${(extract.data_blocks || []).length} |`);
  add(`| Dokumen akan ditulis | ${plan.docs.length} |`);
  add(`| Koleksi ${COLLECTION} saat ini | ${existing.length} |`);
  add(`| Alias terpetakan | ${plan.mappedAliasCount} |`);
  add(`| Baris tanpa pemetaan | ${plan.unmapped.length} |`);
  add();
  add(`## Pemetaan Alias`);
  add();
  add(`| Alias | NIK | Nama | Sumber |`);
  add(`|---|---|---|---|`);
  for (const [alias, info] of plan.aliasTable.entries()) {
    add(`| ${alias} | ${info.nik || "-"} | ${info.nama || "-"} | ${info.source} |`);
  }
  add();
  add(`## Baris Tanpa Pemetaan NIK`);
  add();
  if (!plan.unmapped.length) add(`- Tidak ada.`);
  plan.unmapped.forEach((u) => add(`- ${u}`));
  add();
  add(`## Status Data per Periode`);
  add();
  const statusCount = {};
  for (const d of plan.docs) statusCount[d.fields.status_data] = (statusCount[d.fields.status_data] || 0) + 1;
  for (const [k, v] of Object.entries(statusCount)) add(`- ${k}: ${v} dokumen`);
  add();
  add(`> Catatan: capaian bulan berjalan masih berubah sampai closing insentif. Sheet ringkasan insentif (01..08) berlaku s.d. Agustus 2026.`);
  add();
  return lines.join("\n");
}

/* ---------------------------------------------------------------------
 * MAIN
 * ------------------------------------------------------------------- */
(async () => {
  console.log(`=== IMPORT KINERJA SALES ===`);
  console.log(`Mode      : ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Project   : ${PROJECT}`);
  console.log(`Database  : ${DATABASE}`);
  console.log(`Ekstrak   : ${EXTRACT_PATH}`);
  console.log(`Run ID    : ${RUN_ID}\n`);

  if (!fs.existsSync(EXTRACT_PATH)) throw new Error(`File ekstrak tidak ada: ${EXTRACT_PATH}\nJalankan: python scripts/export-kinerja-sales.py "<xlsx>" "${EXTRACT_PATH}"`);
  const extract = JSON.parse(fs.readFileSync(EXTRACT_PATH, "utf8"));

  console.log(`Membaca Firestore...`);
  const [existing, master, aliasOverridesDocs, kontrak] = await Promise.all([
    listAll(COLLECTION),
    listAll("master_karyawan"),
    listAll(ALIAS_MAP_COLLECTION).catch(() => []),
    listAll("master_kontrak"),
  ]);
  const masterByNik = new Map(master.map((m) => [String(m.nik_karyawan || m.nik || m._id || "").trim(), m]));
  const namaFromKontrak = new Map();
  for (const d of kontrak) {
    const nik = String(d.nik_karyawan || d.nik || "").trim();
    const nama = String(d.nama_karyawan || "").trim();
    if (nik && nama && !namaFromKontrak.has(nik)) namaFromKontrak.set(nik, nama);
  }
  const aliasOverrides = new Map();
  for (const d of aliasOverridesDocs) {
    aliasOverrides.set(normKey(d._id), {
      nik_karyawan: d.nik_karyawan ?? d.nik ?? "",
      nama_karyawan: d.nama_karyawan ?? "",
      source: "sales_alias_map",
    });
  }
  console.log(`${COLLECTION} : ${existing.length}`);
  console.log(`master_karyawan : ${master.length}`);
  console.log(`sales_alias_map : ${aliasOverridesDocs.length}\n`);

  const { docs, unmapped } = buildDocs(extract, masterByNik, aliasOverrides, namaFromKontrak);

  const aliasTable = new Map();
  for (const alias of Object.keys(AUTO_ALIAS_MAP)) {
    const over = aliasOverrides.get(normKey(alias));
    const nik = (over || {}).nik_karyawan || AUTO_ALIAS_MAP[alias];
    const master = masterByNik.get(String(nik).trim());
    aliasTable.set(alias, {
      nik,
      nama: master?.nama_karyawan || (over || {}).nama_karyawan || "-",
      source: over ? "sales_alias_map" : "default skrip",
    });
  }
  for (const d of aliasOverridesDocs) {
    const key = normKey(d._id);
    if (!aliasTable.has(key)) {
      const master = masterByNik.get(String(d.nik_karyawan || "").trim());
      aliasTable.set(String(d._id).toUpperCase(), {
        nik: d.nik_karyawan || "-",
        nama: master?.nama_karyawan || d.nama_karyawan || "-",
        source: "sales_alias_map",
      });
    }
  }
  const mappedAliasCount = [...aliasTable.keys()].filter((k) => aliasTable.get(k).nik).length;

  const ids = new Set(docs.map((d) => d.id));
  const existingIds = new Set(existing.map((d) => d._id));
  const overwrite = [...ids].filter((i) => existingIds.has(i)).length;

  console.log(`Rencana:`);
  console.log(`  dokumen kinerja   : ${docs.length}`);
  console.log(`  baru              : ${docs.length - overwrite}`);
  console.log(`  timpa (re-import) : ${overwrite}\n`);

  const plan = { docs, unmapped, aliasTable, mappedAliasCount };
  const report = reportMarkdown({ plan, existing, masterByNik, aliasOverrides, extract });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, "report.md"), report, "utf8");
  fs.writeFileSync(path.join(BACKUP_DIR, "before.json"), JSON.stringify(existing, null, 2), "utf8");
  fs.writeFileSync(
    path.join(BACKUP_DIR, "plan.json"),
    JSON.stringify({ runId: RUN_ID, now: NOW, project: PROJECT, database: DATABASE, applied: APPLY, docs: docs.map((d) => ({ id: d.id, fields: d.fields })) }, null, 2),
    "utf8"
  );
  console.log(`Laporan & backup: ${BACKUP_DIR}\n`);

  if (DRY_RUN) {
    console.log("DRY RUN selesai. Tidak ada data yang ditulis.");
    console.log("Tambahkan --apply untuk menulis ke Firestore.\n");
    return;
  }

  console.log("Menulis dokumen kinerja sales...");
  await commitWrites(docs.map((doc) => writeUpdate(COLLECTION, doc.id, doc.fields)));
  console.log("\nSELESAI.");
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});
