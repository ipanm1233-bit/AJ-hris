#!/usr/bin/env node
/**
 * =====================================================================
 * UPDATE KONTRAK KARYAWAN DARI CSV -> FIRESTORE
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Skrip admin satu kali pakai (idempoten) untuk:
 *   1. Membaca rekap kontrak dari file CSV (pemisah ";").
 *   2. Menormalkan tanggal, tipe kontrak, dan status.
 *   3. Mengarsipkan riwayat kontrak lama karyawan yang ada di CSV.
 *   4. Menulis ulang riwayat kontrak dari CSV.
 *   5. Menyinkronkan master_karyawan (status, kontrak ke-, tanggal kontrak).
 *
 * Mode aman:
 *   node scripts/update-kontrak.js --csv "Data Kontrak AJ.csv"            (dry-run)
 *   node scripts/update-kontrak.js --csv "Data Kontrak AJ.csv" --apply    (tulis)
 *
 * Autentikasi:
 *   Set FIREBASE_ACCESS_TOKEN (access token OAuth2 yang punya akses IAM
 *   ke project Firestore). Contoh:
 *     $env:FIREBASE_ACCESS_TOKEN = (gcloud auth print-access-token)
 *
 * Opsi:
 *   --project <id>       default dari firebase-applet-config.json
 *   --database <id>      default dari firebase-applet-config.json
 *   --backup-dir <dir>   default backups/kontrak-<runId>
 *   --apply              benar-benar menulis ke Firestore
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
const CSV_PATH = path.resolve(argValue("--csv", path.join(ROOT, "Data Kontrak AJ.csv")));
const TOKEN = process.env.FIREBASE_ACCESS_TOKEN || "";

const RUN_ID = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const NOW = new Date().toISOString();
const TODAY = NOW.slice(0, 10);
const BACKUP_DIR = path.resolve(argValue("--backup-dir", path.join(ROOT, "backups", `kontrak-${RUN_ID}`)));
const ARCHIVE_COLLECTION = "master_kontrak_archive";
const SOURCE_FILE = path.basename(CSV_PATH);
const DRY_RUN = !APPLY;

if (!TOKEN) {
  console.error("FATAL: FIREBASE_ACCESS_TOKEN belum diisi.");
  console.error("Contoh PowerShell: $env:FIREBASE_ACCESS_TOKEN = (gcloud auth print-access-token)");
  process.exit(1);
}

/* ---------------------------------------------------------------------
 * UTILITAS
 * ------------------------------------------------------------------- */
const pad = (n) => String(n).padStart(2, "0");

function normName(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, " ").trim();
}

// Kunci perbandingan nama: hanya huruf/angka, spasi tunggal.
function nameKey(value) {
  return normName(value)
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function nameSimilarity(a, b) {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

const DAY_MS = 86400000;
const toTime = (iso) => Date.parse(`${iso}T00:00:00Z`);

// Bukti tanggal: mulai berdekatan (<= 7 hari) atau rentang tumpang tindih
// minimal 60% dari rentang yang lebih pendek.
function contractDateEvidence(docStart, docEnd, rows) {
  if (!docStart) return null;
  let best = null;
  for (const row of rows) {
    if (!row.start) continue;
    const startDiff = Math.abs(toTime(docStart) - toTime(row.start)) / DAY_MS;
    if (startDiff <= 7) {
      if (!best || startDiff < best.startDiff) {
        best = { row, startDiff, overlapRatio: docEnd && row.end ? overlapRatio(docStart, docEnd, row.start, row.end) : 1 };
      }
      continue;
    }
    if (docEnd && row.end) {
      const ratio = overlapRatio(docStart, docEnd, row.start, row.end);
      if (ratio >= 0.6 && (!best || ratio > best.overlapRatio)) {
        best = { row, startDiff, overlapRatio: ratio };
      }
    }
  }
  return best;
}

function overlapRatio(aStart, aEnd, bStart, bEnd) {
  const a1 = toTime(aStart);
  const a2 = toTime(aEnd);
  const b1 = toTime(bStart);
  const b2 = toTime(bEnd);
  if (![a1, a2, b1, b2].every(Number.isFinite)) return 0;
  const overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)) / DAY_MS;
  const shortest = Math.max(1, Math.min(a2 - a1, b2 - b1) / DAY_MS);
  return overlap / shortest;
}

function parseDateLoose(value) {
  const s = String(value == null ? "" : value).trim();
  if (!s) return null;
  if (/^(TIDAK AKTIF|AKTIF|~|-|—)$/i.test(s)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if (/^\d{5}$/.test(s)) {
    const n = Number(s);
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  const a = Date.UTC(...fromIso.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...toIso.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
}

function parseKe(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value == null ? "" : value).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const words = {
    pertama: 1, kedua: 2, ketiga: 3, keempat: 4, kelima: 5, keenam: 6,
    ketujuh: 7, kedelapan: 8, kesembilan: 9, kesepuluh: 10,
    satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7,
  };
  for (const [word, num] of Object.entries(words)) if (s.includes(word)) return num;
  const digit = s.match(/\d+/);
  return digit ? Number(digit[0]) : null;
}

function nikValue(nik) {
  const s = String(nik || "").trim();
  if (!/^\d+$/.test(s)) return s;
  if (s.length > 1 && s.startsWith("0")) return s;
  return Number(s);
}

function safeDocId(id) {
  return String(id || "").replace(/[\/\\\.\#\$\[\]]/g, "-").trim().slice(0, 300) || `DOC-${crypto.randomBytes(6).toString("hex")}`;
}

function archiveDocId(id) {
  const base = safeDocId(id);
  const candidate = `${base}__${RUN_ID}`;
  if (candidate.length <= 300) return candidate;
  return `${base.slice(0, 220)}__${crypto.createHash("sha1").update(id).digest("hex")}__${RUN_ID}`;
}

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
  const data = {
    _id: doc.name.split("/").pop(),
    _createTime: doc.createTime,
    _updateTime: doc.updateTime,
  };
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
    await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: chunk }),
    });
    console.log(`   commit ${Math.min(i + CHUNK, writes.length)}/${writes.length}`);
  }
}

function writeUpdate(collection, id, fields, fieldPaths) {
  const write = { update: { name: docName(collection, id), fields: toFields(fields) } };
  if (fieldPaths && fieldPaths.length) write.updateMask = { fieldPaths };
  return write;
}

function writeDelete(collection, id) {
  return { delete: docName(collection, id) };
}

/* ---------------------------------------------------------------------
 * BACA CSV
 * ------------------------------------------------------------------- */
function readCsv(file) {
  if (!fs.existsSync(file)) throw new Error(`File CSV tidak ditemukan: ${file}`);
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) throw new Error("CSV kosong.");
  const header = lines[0].split(";").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(";");
    const obj = {};
    header.forEach((key, idx) => {
      if (key) obj[key] = String(cells[idx] == null ? "" : cells[idx]).trim();
    });
    if (obj["NIK KARYAWAN"]) rows.push({ ...obj, _line: i + 1 });
  }
  return rows;
}

function contractType(row) {
  const ke = String(row["KONTRAK-KE"] || "").toUpperCase();
  const jenis = String(row["Jenis Kontrak (Format)"] || "").toUpperCase();
  if (ke.includes("PKWTT") || jenis.includes("PKWTT")) return "PKWTT";
  if (ke.includes("PROBATION") || jenis.includes("PROBATION") || jenis.includes("PERCOBAAN")) return "PROBATION";
  return "PKWT";
}

function normalizeRows(rawRows) {
  const groups = new Map();
  for (const row of rawRows) {
    const nik = String(row["NIK KARYAWAN"] || "").trim();
    if (!groups.has(nik)) groups.set(nik, []);
    groups.get(nik).push(row);
  }

  const employees = [];
  const anomalies = {
    serialDates: [],
    missingStart: [],
    computedEnd: [],
    endBeforeStart: [],
    multipleRawActive: [],
    latestActiveExpired: [],
    noActive: [],
    pkwttActiveNoEnd: [],
  };

  for (const [nik, groupRows] of groups.entries()) {
    const name = groupRows[0]["NAMA KARYAWAN"] || "";
    const normalized = groupRows.map((row, index) => {
      const type = contractType(row);
      const urutanRaw = row["Urutan ke-"] || row["KONTRAK-KE"] || String(index + 1);
      const urutan = parseKe(urutanRaw) || index + 1;
      const startRaw = row["TGL MULAI KONTRAK"] || "";
      const endRaw = row["TGL AKHIR KONTRAK"] || "";
      const start = parseDateLoose(startRaw);
      let end = parseDateLoose(endRaw);
      const months = /^\d+$/.test(String(row["DURASI KONTRAK"] || "").trim())
        ? Number(row["DURASI KONTRAK"])
        : null;
      const durationRaw = String(row["DURASI KONTRAK"] || "").trim().toUpperCase();
      const rawStatus = String(row["Status (Terisi)"] || row["STATUS KONTRAK"] || "").trim().toUpperCase();
      const statusBase = rawStatus === "AKTIF" ? "AKTIF" : "TIDAK AKTIF";

      if (/^\d{5}$/.test(startRaw) || /^\d{5}$/.test(endRaw)) {
        anomalies.serialDates.push({ nik, name, line: row._line, startRaw, endRaw, start, end });
      }
      if (!start) anomalies.missingStart.push({ nik, name, line: row._line, urutan, type });
      if (!end && months && start) {
        end = addMonths(start, months);
        anomalies.computedEnd.push({ nik, name, line: row._line, urutan, start, months, end });
      }
      if (type === "PKWTT" && statusBase === "AKTIF") {
        if (end) anomalies.pkwttActiveNoEnd.push({ nik, name, line: row._line, urutan, csvEnd: end });
        end = null;
      }
      if (start && end && end < start) {
        anomalies.endBeforeStart.push({ nik, name, line: row._line, urutan, start, end });
      }

      return {
        line: row._line,
        nik,
        name,
        cabang: row.CABANG || "",
        divisi: row.DIVISI || "",
        jabatan: row.JABATAN || "",
        urutan,
        type,
        start,
        end,
        months,
        durationRaw,
        rawStatus,
        statusBase,
        sourceRow: row,
      };
    });

    normalized.sort((a, b) => a.urutan - b.urutan || String(a.start || "").localeCompare(String(b.start || "")));
    const latestIndex = normalized.length - 1;
    const rawActiveCount = normalized.filter((r) => r.statusBase === "AKTIF").length;
    if (rawActiveCount > 1) {
      anomalies.multipleRawActive.push({
        nik,
        name,
        count: rawActiveCount,
        rows: normalized.filter((r) => r.statusBase === "AKTIF").map((r) => `ke-${r.urutan} ${r.start || "?"}..${r.end || "?"}`),
      });
    }

    normalized.forEach((row, idx) => {
      const isLatest = idx === latestIndex;
      const isActive = isLatest && row.statusBase === "AKTIF";
      const days = row.end ? daysBetween(TODAY, row.end) : null;
      let statusKolom = "TIDAK AKTIF";
      if (isActive) {
        if (row.type === "PKWTT") statusKolom = "AKTIF";
        else if (days !== null && days < 0) statusKolom = "TIDAK AKTIF";
        else if (days !== null && days <= 30) statusKolom = "SEGERA HABIS";
        else statusKolom = "AKTIF";
      }

      let keterangan = null;
      if (!isLatest) {
        if (row.durationRaw === "RESIGN") keterangan = "RESIGN";
        else if (row.durationRaw === "PHK") keterangan = "PHK";
        else if (days !== null && days < 0) keterangan = "EXPIRED";
        else if (days !== null) keterangan = "DIGANTIKAN";
      } else if (!isActive) {
        if (row.durationRaw === "RESIGN") keterangan = "RESIGN";
        else if (row.durationRaw === "PHK") keterangan = "PHK";
        else if (days !== null && days < 0) keterangan = "EXPIRED";
        else if (days !== null) keterangan = "TIDAK AKTIF";
      } else if (row.type === "PKWTT") {
        keterangan = "PKWTT";
      } else if (days !== null && days < 0) {
        keterangan = "EXPIRED";
      } else if (days !== null && days <= 30) {
        keterangan = "SEGERA HABIS";
      } else if (days !== null) {
        keterangan = "AMAN";
      }

      row.isLatest = isLatest;
      row.isActive = isActive;
      row.statusKolom = statusKolom;
      row.keterangan = keterangan;
      row.sisaHari = isActive && row.type === "PKWTT" ? null : days;
      row.days = days;
      row.recordId = `KTR-${safeDocId(nik)}-${String(row.urutan).padStart(2, "0")}`;
    });

    const latest = normalized[latestIndex];
    if (latest.statusBase === "AKTIF" && latest.days !== null && latest.days < 0 && latest.type !== "PKWTT") {
      anomalies.latestActiveExpired.push({ nik, name, urutan: latest.urutan, start: latest.start, end: latest.end, days: latest.days });
    }
    if (!normalized.some((r) => r.statusBase === "AKTIF")) {
      anomalies.noActive.push({ nik, name, lastKe: latest.urutan, lastStart: latest.start, lastEnd: latest.end, lastDuration: latest.durationRaw });
    }

    employees.push({
      nik,
      name,
      rows: normalized,
      latest,
      rawActive: normalized.some((r) => r.statusBase === "AKTIF"),
    });
  }

  // Pastikan record ID unik
  const used = new Set();
  for (const emp of employees) {
    for (const row of emp.rows) {
      let id = row.recordId;
      let suffix = 2;
      while (used.has(id)) id = `${row.recordId}-${suffix++}`;
      row.recordId = id;
      used.add(id);
    }
  }

  return { employees, anomalies };
}

/* ---------------------------------------------------------------------
 * RENCANA PERUBAHAN
 * ------------------------------------------------------------------- */
function scorePreserved(doc) {
  let score = 0;
  if (doc.link_dokumen) score += 8;
  if (doc.record_id) score += 4;
  if (doc.alamat) score += 2;
  if (doc.created_at) score += 1;
  return score;
}

function buildPlan(existingKontrak, existingKaryawan, employees) {
  const csvNiks = new Set(employees.map((e) => e.nik));
  const csvNames = new Set(employees.map((e) => normName(e.name)));
  const csvNameKeys = new Set(employees.map((e) => nameKey(e.name)));
  // Dokumen lama tanpa NIK tetapi namanya salah ketik (mis. NASRULLAH vs
  // NASRULLOH) hanya dianggap milik karyawan CSV bila nama sangat mirip DAN
  // tanggal kontraknya berdekatan/bertumpang tindih. Untuk dokumen tanpa
  // tanggal sama sekali, hanya diarsipkan bila nama salah ketik yang sama
  // sudah terbukti lewat tanggal pada dokumen lain.
  const FUZZY_THRESHOLD = 0.86;
  const fuzzyMatches = [];
  const fuzzyByDocId = new Map();
  const isMissingNik = (doc) => {
    const n = String(doc.nik == null ? "" : doc.nik).trim();
    return !n || n === "0";
  };
  const findFuzzyCandidates = (doc, withDates) => {
    if (!isMissingNik(doc)) return [];
    const docName = nameKey(doc.nama_karyawan || doc.nama);
    if (!docName) return [];
    const docStart = parseDateLoose(doc.tanggal_mulai);
    const docEnd = parseDateLoose(doc.tanggal_akhir);
    if (withDates && !docStart) return [];
    const out = [];
    for (const emp of employees) {
      const key = nameKey(emp.name);
      const sim = nameSimilarity(docName, key);
      if (sim < FUZZY_THRESHOLD) continue;
      const evidence = withDates ? contractDateEvidence(docStart, docEnd, emp.rows) : null;
      out.push({ emp, key, sim, evidence });
    }
    return out;
  };
  const recordFuzzy = (doc, match, noDate) => {
    fuzzyByDocId.set(doc._id, match);
    fuzzyMatches.push({
      id: doc._id,
      oldName: doc.nama_karyawan || doc.nama || "-",
      newNik: match.emp.nik,
      newName: match.emp.name,
      similarity: Number(match.sim.toFixed(3)),
      nameKey: match.key,
      noDate: Boolean(noDate),
      oldStart: parseDateLoose(doc.tanggal_mulai),
      oldEnd: parseDateLoose(doc.tanggal_akhir),
      csvStart: match.evidence?.row.start || null,
      csvEnd: match.evidence?.row.end || null,
      startDiffDays: match.evidence ? match.evidence.startDiff : null,
      overlap: match.evidence ? Number(match.evidence.overlapRatio.toFixed(2)) : null,
    });
  };

  const affected = [];
  for (const doc of existingKontrak) {
    const docNik = String(doc.nik == null ? "" : doc.nik).trim();
    const docNameRaw = doc.nama_karyawan || doc.nama;
    const docName = normName(docNameRaw);
    if ((docNik && csvNiks.has(docNik)) || (docName && csvNames.has(docName)) || csvNameKeys.has(nameKey(docNameRaw))) {
      affected.push(doc);
      continue;
    }
    const candidates = findFuzzyCandidates(doc, true);
    if (!candidates.length) continue;
    candidates.sort(
      (a, b) =>
        b.sim - a.sim ||
        (b.evidence?.overlapRatio || 0) - (a.evidence?.overlapRatio || 0) ||
        (a.evidence?.startDiff ?? 999) - (b.evidence?.startDiff ?? 999)
    );
    const best = candidates[0];
    recordFuzzy(doc, best, false);
    affected.push(doc);
  }

  // Dokumen tanpa tanggal: cocokkan hanya bila kombinasi nama salah ketik +
  // karyawan sudah terbukti pada dokumen lain yang punya tanggal.
  const confirmedTypoKeys = new Set(fuzzyMatches.map((m) => `${m.nameKey}|${m.newNik}`));
  for (const doc of existingKontrak) {
    if (affected.some((a) => a._id === doc._id)) continue;
    if (parseDateLoose(doc.tanggal_mulai) || parseDateLoose(doc.tanggal_akhir)) continue;
    const key = nameKey(doc.nama_karyawan || doc.nama);
    if (!key) continue;
    const candidates = findFuzzyCandidates(doc, false).filter((c) => confirmedTypoKeys.has(`${c.key}|${c.emp.nik}`));
    if (candidates.length !== 1) continue;
    recordFuzzy(doc, candidates[0], true);
    affected.push(doc);
  }

  const affectedIds = new Set(affected.map((doc) => doc._id));

  const byNikKe = new Map();
  const byNameKe = new Map();
  const byNikStart = new Map();
  const byNameStart = new Map();
  const push = (map, key, doc) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(doc);
  };
  for (const doc of affected) {
    const docNik = String(doc.nik == null ? "" : doc.nik).trim();
    const docName = fuzzyByDocId.get(doc._id)?.key || nameKey(doc.nama_karyawan || doc.nama);
    const ke = parseKe(doc.kontrak_ke);
    const start = parseDateLoose(doc.tanggal_mulai);
    if (docNik && ke) push(byNikKe, `${docNik}|${ke}`, doc);
    if (docName && ke) push(byNameKe, `${docName}|${ke}`, doc);
    if (docNik && start) push(byNikStart, `${docNik}|${start}`, doc);
    if (docName && start) push(byNameStart, `${docName}|${start}`, doc);
  }
  const pick = (list) => {
    if (!list || !list.length) return null;
    return [...list].sort((a, b) => scorePreserved(b) - scorePreserved(a) || String(b._updateTime).localeCompare(String(a._updateTime)))[0];
  };
  const findPreserved = (row) => {
    const key = nameKey(row.name);
    const candidates = [
      pick(byNikKe.get(`${row.nik}|${row.urutan}`)),
      pick(byNameKe.get(`${key}|${row.urutan}`)),
      pick(byNikStart.get(`${row.nik}|${row.start}`)),
      pick(byNameStart.get(`${key}|${row.start}`)),
    ].filter(Boolean);
    if (!candidates.length) return null;
    return candidates.sort((a, b) => scorePreserved(b) - scorePreserved(a))[0];
  };

  const kontrakDocs = [];
  for (const emp of employees) {
    for (const row of emp.rows) {
      const preserved = findPreserved(row);
      kontrakDocs.push({
        id: row.recordId,
        row,
        fields: {
          record_id: preserved?.record_id || row.recordId,
          nik: nikValue(row.nik),
          nik_karyawan: row.nik,
          nama_karyawan: row.name,
          cabang: row.cabang,
          divisi: row.divisi,
          jabatan: row.jabatan,
          kontrak_ke: row.urutan,
          jenis_kontrak: row.type,
          status_kompail: row.type,
          status_kompilasi: row.type,
          status_kolom_kontrak: row.statusKolom,
          tanggal_mulai: row.start,
          tanggal_akhir: row.end,
          durasi_bulan: row.months,
          keterangan_otomatis: row.keterangan,
          sisa_hari_ke_akhir: row.sisaHari,
          link_dokumen: preserved?.link_dokumen || null,
          alamat: preserved?.alamat || null,
          created_at: preserved?.created_at || NOW,
          updated_at: NOW,
          _migrated_at: NOW,
          _source_sheet: "MASTER KONTRAK",
          _source_file: SOURCE_FILE,
          _run_id: RUN_ID,
        },
        preservedFrom: preserved?._id || null,
      });
    }
  }

  // Master karyawan
  const byNik = new Map();
  const byName = new Map();
  for (const doc of existingKaryawan) {
    const nik = String(doc.nik_karyawan || doc.nik || doc._id || "").trim();
    if (nik) byNik.set(nik, doc);
    const name = normName(doc.nama_karyawan || doc.nama);
    if (name) byName.set(name, doc);
  }

  const masterUpdates = [];
  const masterCreates = [];
  const missingMaster = [];
  for (const emp of employees) {
    const latest = emp.latest;
    const existing = byNik.get(emp.nik) || byName.get(normName(emp.name)) || null;
    const isPermanentActive = latest.type === "PKWTT" && latest.statusBase === "AKTIF";
    const masterFields = {
      status_karyawan: latest.type,
      aktif_tdk_aktif: latest.statusBase === "AKTIF" ? "AKTIF" : "TIDAK AKTIF",
      kontrak_ke: latest.urutan,
      tgl_mulai_kontrak: latest.start,
      tgl_akhir_kontrak: isPermanentActive ? null : latest.end,
      kontrak_habis: isPermanentActive ? null : latest.end,
      updated_at: NOW,
    };
    if (existing) {
      masterUpdates.push({ id: existing._id, doc: existing, fields: masterFields, nik: emp.nik, name: emp.name });
    } else {
      missingMaster.push({ nik: emp.nik, name: emp.name });
      masterCreates.push({
        id: safeDocId(emp.nik),
        fields: {
          nik_karyawan: emp.nik,
          nik: nikValue(emp.nik),
          nama_karyawan: emp.name,
          nama: emp.name,
          cabang: latest.cabang || "",
          divisi: latest.divisi || "",
          jabatan: latest.jabatan || "",
          ...masterFields,
          tanggal_join: emp.rows.find((r) => r.start)?.start || null,
          created_at: NOW,
          _migrated_at: NOW,
          _source_sheet: "MASTER KONTRAK",
          _source_file: SOURCE_FILE,
          _run_id: RUN_ID,
        },
        nik: emp.nik,
        name: emp.name,
      });
    }
  }

  const csvNikSet = new Set(employees.map((e) => e.nik));
  const masterNotInCsv = existingKaryawan
    .filter((doc) => {
      const nik = String(doc.nik_karyawan || doc.nik || doc._id || "").trim();
      return !csvNikSet.has(nik);
    })
    .map((doc) => `${doc.nik_karyawan || doc.nik || doc._id} ${doc.nama_karyawan || doc.nama || ""}`.trim());

  const untouchedKontrak = existingKontrak
    .filter((doc) => !affectedIds.has(doc._id))
    .map((doc) => `${doc.nik || "-"} ${doc.nama_karyawan || "-"} (${doc._id})`);

  return {
    csvNiks,
    csvNames,
    affected,
    fuzzyMatches,
    kontrakDocs,
    masterUpdates,
    masterCreates,
    missingMaster,
    masterNotInCsv,
    untouchedKontrak,
  };
}

/* ---------------------------------------------------------------------
 * LAPORAN
 * ------------------------------------------------------------------- */
function reportMarkdown(plan, anomalies, existingKontrak, existingKaryawan) {
  const lines = [];
  const add = (s = "") => lines.push(s);
  add(`# Laporan Update Kontrak Karyawan`);
  add();
  add(`- Waktu: ${NOW}`);
  add(`- Project: \`${PROJECT}\``);
  add(`- Database: \`${DATABASE}\``);
  add(`- Sumber: \`${CSV_PATH}\``);
  add(`- Mode: **${DRY_RUN ? "DRY RUN (tidak menulis)" : "APPLY (menulis ke Firestore)"}**`);
  add(`- Run ID: \`${RUN_ID}\``);
  add();
  add(`## Ringkasan`);
  add();
  add(`| Item | Jumlah |`);
  add(`|---|---:|`);
  add(`| Karyawan di CSV | ${plan.csvNiks.size} |`);
  add(`| Baris kontrak di CSV | ${plan.kontrakDocs.length} |`);
  add(`| Dokumen master_kontrak saat ini | ${existingKontrak.length} |`);
  add(`| Dokumen master_karyawan saat ini | ${existingKaryawan.length} |`);
  add(`| Dokumen lama yang diarsipkan/dihapus | ${plan.affected.length} |`);
  add(`| master_karyawan diperbarui | ${plan.masterUpdates.length} |`);
  add(`| master_karyawan baru | ${plan.masterCreates.length} |`);
  add(`| Karyawan master tidak ada di CSV (dibiarkan) | ${plan.masterNotInCsv.length} |`);
  add(`| Dokumen kontrak lain (dibiarkan) | ${plan.untouchedKontrak.length} |`);
  add();
  add(`## Dokumen Lama Tanpa NIK yang Dicocokkan via Nama (Fuzzy)`);
  add();
  if (!plan.fuzzyMatches.length) add(`- Tidak ada.`);
  plan.fuzzyMatches.forEach((m) =>
    add(
      `- \`${m.id}\` "${m.oldName}" -> ${m.newNik} ${m.newName} ` +
        `(kemiripan ${m.similarity}; ` +
        (m.noDate
          ? `tanpa tanggal, nama salah ketik sudah terbukti pada dokumen lain)`
          : `${m.oldStart || "-"} s/d ${m.oldEnd || "-"} vs ${m.csvStart} s/d ${m.csvEnd || "-"}; ` +
            `selisih mulai ${m.startDiffDays.toFixed(1)} hari, overlap ${m.overlap})`)
    )
  );
  add();
  add(`## Anomali & Normalisasi`);
  add();
  add(`- Tanggal Excel serial dikonversi: **${anomalies.serialDates.length}**`);
  anomalies.serialDates.forEach((a) => add(`  - ${a.nik} ${a.name}: ${a.startRaw} -> ${a.start || "-"}, ${a.endRaw} -> ${a.end || "-"}`));
  add(`- Baris tanpa tanggal mulai: **${anomalies.missingStart.length}**`);
  anomalies.missingStart.forEach((a) => add(`  - ${a.nik} ${a.name} (baris ${a.line}, kontrak ke-${a.urutan})`));
  add(`- Tanggal akhir dihitung dari durasi: **${anomalies.computedEnd.length}**`);
  anomalies.computedEnd.forEach((a) => add(`  - ${a.nik} ${a.name}: ${a.start} + ${a.months} bulan = ${a.end}`));
  add(`- Tanggal akhir lebih awal dari tanggal mulai: **${anomalies.endBeforeStart.length}**`);
  anomalies.endBeforeStart.forEach((a) => add(`  - ${a.nik} ${a.name} (kontrak ke-${a.urutan}): ${a.start} s/d ${a.end}`));
  add(`- Baris AKTIF ganda (dinormalkan hanya kontrak terakhir yang AKTIF): **${anomalies.multipleRawActive.length}**`);
  anomalies.multipleRawActive.forEach((a) => add(`  - ${a.nik} ${a.name}: ${a.count} baris -> ${a.rows.join(" | ")}`));
  add(`- Kontrak terakhir AKTIF tetapi sudah lewat tanggal akhir: **${anomalies.latestActiveExpired.length}**`);
  anomalies.latestActiveExpired.forEach((a) => add(`  - ${a.nik} ${a.name}: ke-${a.urutan}, ${a.start} s/d ${a.end} (${a.days} hari)`));
  add(`- Karyawan tanpa baris AKTIF: **${anomalies.noActive.length}**`);
  anomalies.noActive.forEach((a) => add(`  - ${a.nik} ${a.name}: terakhir ke-${a.lastKe}, ${a.lastStart || "-"} s/d ${a.lastEnd || "-"}, durasi ${a.lastDuration || "-"}`));
  add(`- PKWTT AKTIF: tanggal akhir dikosongkan: **${anomalies.pkwttActiveNoEnd.length}**`);
  add();
  add(`## Karyawan Baru (master_karyawan)`);
  add();
  if (!plan.masterCreates.length) add(`- Tidak ada.`);
  plan.masterCreates.forEach((m) => add(`- ${m.nik} ${m.name}`));
  add();
  add(`## master_karyawan yang Tidak Ada di CSV (dibiarkan)`);
  add();
  if (!plan.masterNotInCsv.length) add(`- Tidak ada.`);
  plan.masterNotInCsv.forEach((s) => add(`- ${s}`));
  add();
  add(`## Dokumen Kontrak Lama yang Diarsipkan`);
  add();
  add(`Total: **${plan.affected.length}** dokumen.`);
  const byEmp = new Map();
  for (const doc of plan.affected) {
    const key = normName(doc.nama_karyawan || doc.nama || "-");
    const current = byEmp.get(key) || { nik: "", name: doc.nama_karyawan || doc.nama || "-", count: 0 };
    if (!current.nik && doc.nik) current.nik = String(doc.nik);
    current.count += 1;
    byEmp.set(key, current);
  }
  for (const item of [...byEmp.values()].sort((a, b) => a.name.localeCompare(b.name, "id"))) {
    add(`- ${item.nik ? `${item.nik} ` : ""}${item.name}: ${item.count} dokumen`);
  }
  add();
  add(`## Catatan`);
  add();
  add(`- Dokumen lama tidak dihapus permanen: disalin ke koleksi \`${ARCHIVE_COLLECTION}\` dengan run ID \`${RUN_ID}\`.`);
  add(`- Backup JSON lengkap tersedia di \`${BACKUP_DIR}\`.`);
  add(`- Status kontrak: hanya baris terakhir per karyawan yang dapat berstatus AKTIF/SEGERA HABIS.`);
  add(`- PKWTT aktif disimpan tanpa tanggal akhir dan tanpa kontrak_habis.`);
  add(`- Data karyawan lain di luar CSV tidak diubah.`);
  add();
  return lines.join("\n");
}

/* ---------------------------------------------------------------------
 * MAIN
 * ------------------------------------------------------------------- */
async function main() {
  console.log(`\n=== UPDATE KONTRAK ===`);
  console.log(`Mode      : ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`Project   : ${PROJECT}`);
  console.log(`Database  : ${DATABASE}`);
  console.log(`CSV       : ${CSV_PATH}`);
  console.log(`Run ID    : ${RUN_ID}\n`);

  const rawRows = readCsv(CSV_PATH);
  console.log(`Baris CSV terbaca: ${rawRows.length}`);
  const { employees, anomalies } = normalizeRows(rawRows);
  console.log(`Karyawan unik    : ${employees.length}`);
  console.log(`Baris kontrak    : ${employees.reduce((sum, e) => sum + e.rows.length, 0)}\n`);

  console.log(`Membaca Firestore...`);
  const [existingKontrak, existingKaryawan] = await Promise.all([
    listAll("master_kontrak"),
    listAll("master_karyawan"),
  ]);
  console.log(`master_kontrak   : ${existingKontrak.length}`);
  console.log(`master_karyawan  : ${existingKaryawan.length}\n`);

  const plan = buildPlan(existingKontrak, existingKaryawan, employees);

  // Validasi
  const errors = [];
  const docIds = new Set();
  for (const doc of plan.kontrakDocs) {
    if (docIds.has(doc.id)) errors.push(`ID kontrak duplikat: ${doc.id}`);
    docIds.add(doc.id);
    if (!doc.row.nik) errors.push(`Kontrak tanpa NIK: ${doc.id}`);
    if (!doc.row.name) errors.push(`Kontrak tanpa nama: ${doc.id}`);
  }
  const masterIds = new Set();
  for (const doc of plan.masterUpdates) {
    if (masterIds.has(doc.id)) errors.push(`ID master duplikat: ${doc.id}`);
    masterIds.add(doc.id);
  }
  for (const doc of plan.masterCreates) {
    if (masterIds.has(doc.id)) errors.push(`ID master baru duplikat: ${doc.id}`);
    masterIds.add(doc.id);
  }
  for (const doc of plan.kontrakDocs) {
    if (!plan.affected.some((a) => a._id === doc.id) && existingKontrak.some((e) => e._id === doc.id)) {
      errors.push(`ID kontrak baru bentrok dengan dokumen lama di luar cakupan: ${doc.id}`);
    }
  }
  if (errors.length) {
    console.error("VALIDASI GAGAL:");
    errors.forEach((e) => console.error(` - ${e}`));
    process.exit(1);
  }

  console.log(`Rencana:`);
  console.log(`  arsip/hapus dokumen lama : ${plan.affected.length}`);
  console.log(`  tulis dokumen kontrak    : ${plan.kontrakDocs.length}`);
  console.log(`  update master_karyawan   : ${plan.masterUpdates.length}`);
  console.log(`  buat master_karyawan     : ${plan.masterCreates.length}`);
  console.log(`  master tidak di CSV      : ${plan.masterNotInCsv.length}`);
  console.log(`  kontrak lain dibiarkan   : ${plan.untouchedKontrak.length}\n`);

  const report = reportMarkdown(plan, anomalies, existingKontrak, existingKaryawan);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, "report.md"), report, "utf8");
  fs.writeFileSync(path.join(BACKUP_DIR, "master_kontrak-before.json"), JSON.stringify(existingKontrak, null, 2), "utf8");
  fs.writeFileSync(path.join(BACKUP_DIR, "master_karyawan-before.json"), JSON.stringify(existingKaryawan, null, 2), "utf8");
  fs.writeFileSync(
    path.join(BACKUP_DIR, "plan.json"),
    JSON.stringify(
      {
        runId: RUN_ID,
        now: NOW,
        project: PROJECT,
        database: DATABASE,
        csv: CSV_PATH,
        applied: APPLY,
        affected: plan.affected,
        fuzzyMatches: plan.fuzzyMatches,
        kontrakDocs: plan.kontrakDocs.map((d) => ({ id: d.id, fields: d.fields, preservedFrom: d.preservedFrom })),
        masterUpdates: plan.masterUpdates,
        masterCreates: plan.masterCreates,
        anomalies,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Laporan & backup: ${BACKUP_DIR}\n`);

  if (DRY_RUN) {
    console.log("DRY RUN selesai. Tidak ada data yang ditulis.");
    console.log("Periksa report.md lalu jalankan ulang dengan --apply.\n");
    return;
  }

  console.log("Mengarsipkan dokumen lama...");
  const archiveWrites = plan.affected.map((doc) => {
    const { _id, _createTime, _updateTime, ...data } = doc;
    return writeUpdate(ARCHIVE_COLLECTION, archiveDocId(_id), {
      ...data,
      _original_id: _id,
      _original_create_time: _createTime || null,
      _original_update_time: _updateTime || null,
      _archived_at: NOW,
      _archive_run_id: RUN_ID,
      _archive_source: "update-kontrak.js",
    });
  });
  await commitWrites(archiveWrites);

  console.log("Menghapus dokumen lama dari master_kontrak...");
  await commitWrites(plan.affected.map((doc) => writeDelete("master_kontrak", doc._id)));

  console.log("Menulis riwayat kontrak baru...");
  await commitWrites(plan.kontrakDocs.map((doc) => writeUpdate("master_kontrak", doc.id, doc.fields)));

  console.log("Memperbarui master_karyawan...");
  await commitWrites(
    plan.masterUpdates.map((doc) =>
      writeUpdate("master_karyawan", doc.id, doc.fields, [
        "status_karyawan",
        "aktif_tdk_aktif",
        "kontrak_ke",
        "tgl_mulai_kontrak",
        "tgl_akhir_kontrak",
        "kontrak_habis",
        "updated_at",
      ])
    )
  );

  console.log("Membuat master_karyawan baru...");
  await commitWrites(plan.masterCreates.map((doc) => writeUpdate("master_karyawan", doc.id, doc.fields)));

  console.log("\nVerifikasi...");
  const [afterKontrak, afterKaryawan] = await Promise.all([
    listAll("master_kontrak"),
    listAll("master_karyawan"),
  ]);
  const written = afterKontrak.filter((doc) => doc._run_id === RUN_ID).length;
  const newMasters = afterKaryawan.filter((doc) => doc._run_id === RUN_ID).length;
  console.log(`  master_kontrak sekarang : ${afterKontrak.length} (baru/run ini: ${written})`);
  console.log(`  master_karyawan sekarang: ${afterKaryawan.length} (baru/run ini: ${newMasters})`);

  const expectedKontrak = existingKontrak.length - plan.affected.length + plan.kontrakDocs.length;
  if (afterKontrak.length !== expectedKontrak) {
    console.warn(`  PERINGATAN: jumlah master_kontrak ${afterKontrak.length}, perkiraan ${expectedKontrak}.`);
  }
  if (written !== plan.kontrakDocs.length) {
    console.warn(`  PERINGATAN: dokumen run ini ${written}, seharusnya ${plan.kontrakDocs.length}.`);
  }
  if (afterKaryawan.length !== existingKaryawan.length + plan.masterCreates.length) {
    console.warn(`  PERINGATAN: jumlah master_karyawan ${afterKaryawan.length}, perkiraan ${existingKaryawan.length + plan.masterCreates.length}.`);
  }

  fs.writeFileSync(path.join(BACKUP_DIR, "verification.json"), JSON.stringify({ afterKontrak, afterKaryawan }, null, 2), "utf8");
  console.log(`\nSELESAI. Backup & laporan: ${BACKUP_DIR}\n`);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
