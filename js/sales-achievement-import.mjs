/**
 * =====================================================================
 * PARSER CAPAIAN (ACHIEVEMENT) SALES — OH + AR HARIAN
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Dua file Excel menjadi dasar data capaian sales:
 *   1. OH (Order Handling)  -> volume penjualan per brand (Ton) & AO
 *                              (Active Outlet) per salesman per hari.
 *   2. AR (Account Receivable) Harian -> penjualan tertagih (Paid) &
 *                              overdue piutang per salesman per bulan.
 *
 * Hasil impor disimpan ke koleksi `sales_achievement_import` dan dipakai
 * untuk mengisi otomatis form penilaian harian (volume & AO) serta
 * realisasi bulanan (penjualan tertagih & overdue) pada menu Penilaian
 * Kontrak.
 *
 * Pemetaan nama salesman memakai `SALES_ALIAS_DEFAULT_NIK` (sama dengan
 * impor Scheme Incentive) dan dapat di-override lewat `sales_alias_map`.
 */

import { SALES_ALIAS_DEFAULT_NIK } from "./sales-kinerja-import.mjs";

const BULAN_TOKENS = {
  JAN: 1, JANUARI: 1, FEB: 2, FEBRUARI: 2, MAR: 3, MARET: 3, APR: 4, APRIL: 4,
  MEI: 5, JUN: 6, JUNI: 6, JUL: 7, JULI: 7, AGS: 8, AGT: 8, AGUSTUS: 8, AUG: 8,
  SEP: 9, SEPT: 9, SEPTEMBER: 9, OKT: 10, OCT: 10, OKTOBER: 10,
  NOV: 11, NOVEMBER: 11, DES: 12, DEC: 12, DESEMBER: 12,
};

// Empat produk volume ICI yang menjadi dasar Total Volume ICI.
export const ACH_VOLUME_KEYS = ["volume_dulux", "volume_catylac", "volume_maxilite", "volume_aquashield"];

// Angka bulanan (bulan berjalan) yang berasal dari file AR.
export const ACH_MONTHLY_VALUE_KEYS = ["value_penjualan_tertagih", "value_prima", "value_dcota", "overdue_piutang"];

const cleanText = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 32 && cp !== 0xfffd && !(cp >= 0xfff0 && cp <= 0xffff)) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
};

const numValue = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
  if (typeof v === "boolean") return null;
  const s = cleanText(v);
  if (!s || /^#/.test(s)) return null;
  const n = Number(s.replace(/Rp/g, "").replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
};

const normKey = (v) => cleanText(v).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").trim();

// Normalisasi nilai tanggal dari sheet menjadi string "YYYY-MM-DD".
// Menangani tiga kemungkinan: objek Date, nomor serial Excel (sel berformat
// tanggal), dan teks "YYYY-MM-DD HH:mm:ss".
function dateString(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 60000) {
    // Serial Excel: hari sejak 1899-12-30. 25569 = serial 1970-01-01.
    const dt = new Date(Math.round((v - 25569) * 86400000));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  const s = cleanText(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function sheetMatrix(ws) {
  const XL = typeof window !== "undefined" ? window.XLSX : null;
  if (!ws || !XL) return [];
  const ref = ws["!ref"] ? XL.utils.decode_range(ws["!ref"]) : null;
  if (!ref) return [];
  const rows = [];
  for (let r = ref.s.r; r <= ref.e.r; r += 1) {
    const line = [];
    for (let c = ref.s.c; c <= ref.e.c; c += 1) {
      const cellX = ws[XL.utils.encode_cell({ r, c })];
      line.push(cellX ? cellX.v : null);
    }
    rows.push(line);
  }
  return rows;
}

// Cari indeks kolom berdasarkan nama header (case-insensitive, longgar).
function headerIndexMap(headerRow) {
  const map = {};
  (headerRow || []).forEach((cell, idx) => {
    const label = normKey(cell);
    if (!label) return;
    if (!map[label]) map[label] = idx;
  });
  return map;
}

function findHeaderRow(matrix, tokens) {
  const wanted = tokens.map((t) => normKey(t));
  for (let r = 0; r < Math.min(matrix.length, 8); r += 1) {
    const labels = (matrix[r] || []).map((c) => normKey(c));
    if (wanted.every((w) => labels.includes(w))) return r;
  }
  return -1;
}

/**
 * Klasifikasikan satu baris OH ke keluarga produk (volume ICI / PRIMA / DCOTA).
 * Prioritas: Aquashield > Maxilite > Catylac > PRIMA > DCOTA > Dulux.
 */
export function ohBrandFamily(brandDesc = "", brand = "", productName = "") {
  const bd = cleanText(brandDesc).toUpperCase();
  const b = cleanText(brand).toUpperCase();
  const pn = cleanText(productName).toUpperCase();
  if (/AQUASHIELD/.test(bd) || /AQUASHIELD/.test(pn) || b === "AQS") return "aquashield";
  if (/MAXILITE/.test(bd) || /MAXILITE/.test(pn) || b === "LOW") return "maxilite";
  if (/CATYLAC/.test(bd) || /CATYLAC/.test(pn) || b === "MID") return "catylac";
  if (b === "PRIMA" || /^KC-|PRIMA/.test(pn)) return "prima";
  if (b === "DCOTA" || /^SWD-|^DFL-/.test(pn)) return "dcota";
  if (b === "WM") return "wm";
  return "dulux"; // TOP / DLX / Pentalite / Weathershield / dsb.
}

function periodFromDate(value, fallback) {
  const s = cleanText(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return fallback;
}

function periodFromFileName(name, tahunHint) {
  const clean = cleanText(name).toUpperCase().replace(/’|'/g, " ");
  const yearMatch = clean.match(/(20\d{2})/);
  let tahun = yearMatch ? Number(yearMatch[1]) : tahunHint || new Date().getFullYear();
  const tokens = clean.split(/[^A-Z0-9]+/).filter(Boolean);
  let bulan = null;
  for (const t of tokens) {
    if (BULAN_TOKENS[t]) { bulan = BULAN_TOKENS[t]; break; }
  }
  if (!bulan) return null;
  return `${tahun}-${String(bulan).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------------
 * OH — VOLUME & AO HARIAN
 * ------------------------------------------------------------------- */
export function parseOhAchievementWorkbook(wb) {
  // Gabungkan sheet data (Sheet1, Sheet3, ...); abaikan "PO TERBLOKIR".
  const dataSheets = wb.SheetNames.filter((n) => !/TERBLOKIR/i.test(n));
  const aggregate = new Map(); // key: alias|tanggal
  let periode = null;

  for (const sheetName of dataSheets) {
    const matrix = sheetMatrix(wb.Sheets[sheetName]);
    if (!matrix.length) continue;
    const headerRow = findHeaderRow(matrix, ["Salesman", "Delivery Date", "Weight"]);
    if (headerRow < 0) continue;
    const map = headerIndexMap(matrix[headerRow]);
    const col = {
      salesman: map.SALESMAN,
      date: map.DELIVERY_DATE,
      weight: map.WEIGHT,
      volume: map.VOLUME,
      cust: map.CUST_CODE,
      brandDesc: map.BRAND_DESC,
      brand: map.BRAND,
      product: map.PRODUCT_NAME,
      status: map.STATUS,
    };

    for (let r = headerRow + 1; r < matrix.length; r += 1) {
      const row = matrix[r] || [];
      const alias = cleanText(row[col.salesman]).toUpperCase();
      if (!alias || alias === "VACANT_CBT") continue;

      const tanggal = dateString(row[col.date]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) continue;
      if (!periode) periode = tanggal.slice(0, 7);

      const family = ohBrandFamily(
        row[col.brandDesc],
        row[col.brand],
        row[col.product]
      );
      const cust = cleanText(row[col.cust]);

      // Volume dalam Ton: pakai Weight (kg) / 1000, fallback Volume (liter) / 1000.
      const weight = numValue(row[col.weight]);
      const volume = numValue(row[col.volume]);
      const ton = weight !== null ? weight / 1000 : volume !== null ? volume / 1000 : 0;

      const key = `${alias}|${tanggal}`;
      const agg = aggregate.get(key) || {
        alias, tanggal,
        volume_dulux: 0, volume_catylac: 0, volume_maxilite: 0, volume_aquashield: 0,
        ao_ici: new Set(), ao_prima: new Set(), ao_dcota: new Set(),
      };

      if (family === "dulux") agg.volume_dulux += ton;
      else if (family === "catylac") agg.volume_catylac += ton;
      else if (family === "maxilite") agg.volume_maxilite += ton;
      else if (family === "aquashield") agg.volume_aquashield += ton;

      if (cust) {
        if (["dulux", "catylac", "maxilite", "aquashield"].includes(family)) agg.ao_ici.add(cust);
        else if (family === "prima") agg.ao_prima.add(cust);
        else if (family === "dcota") agg.ao_dcota.add(cust);
      }

      aggregate.set(key, agg);
    }
  }

  const daily = [...aggregate.values()].map((agg) => ({
    alias: agg.alias,
    tanggal: agg.tanggal,
    periode: agg.tanggal.slice(0, 7),
    volume_dulux: Math.round(agg.volume_dulux * 1e4) / 1e4,
    volume_catylac: Math.round(agg.volume_catylac * 1e4) / 1e4,
    volume_maxilite: Math.round(agg.volume_maxilite * 1e4) / 1e4,
    volume_aquashield: Math.round(agg.volume_aquashield * 1e4) / 1e4,
    total_volume_ici: Math.round((agg.volume_dulux + agg.volume_catylac + agg.volume_maxilite + agg.volume_aquashield) * 1e4) / 1e4,
    ao_ici: agg.ao_ici.size,
    ao_prima: agg.ao_prima.size,
    ao_dcota: agg.ao_dcota.size,
  }));

  return { periode, daily };
}

/* ---------------------------------------------------------------------
 * AR — PENJUALAN TERTAGIH & OVERDUE BULANAN
 * ------------------------------------------------------------------- */
export function parseArAchievementWorkbook(wb, tahunHint) {
  const aggregate = new Map(); // key: alias
  let periode = periodFromFileName(wb.SheetNames[0] || "", tahunHint);

  for (const sheetName of wb.SheetNames) {
    const matrix = sheetMatrix(wb.Sheets[sheetName]);
    if (!matrix.length) continue;
    const headerRow = findHeaderRow(matrix, ["Salesman Name", "Over Due", "Paid"]);
    if (headerRow < 0) continue;
    const map = headerIndexMap(matrix[headerRow]);
    const col = {
      salesman: map.SALESMAN_NAME,
      principle: map.PRINCIPLE,
      overDue: map.OVER_DUE,
      amount: map.AR_AMOUNT,
      paid: map.PAID,
      balance: map.AR_BALANCE,
    };

    for (let r = headerRow + 1; r < matrix.length; r += 1) {
      const row = matrix[r] || [];
      const alias = cleanText(row[col.salesman]).toUpperCase();
      if (!alias) continue;
      const principle = cleanText(row[col.principle]).toUpperCase();
      const overDue = numValue(row[col.overDue]);
      const amount = numValue(row[col.amount]) ?? 0;
      const paid = numValue(row[col.paid]) ?? 0;
      const balance = numValue(row[col.balance]) ?? 0;

      const agg = aggregate.get(alias) || {
        alias,
        value_penjualan_tertagih: 0,
        value_prima: 0,
        value_dcota: 0,
        overdue_piutang: 0,
        total_ar_amount: 0,
        total_ar_balance: 0,
      };

      agg.value_penjualan_tertagih += paid;
      agg.total_ar_amount += amount;
      agg.total_ar_balance += balance;
      if (principle === "PRIMA") agg.value_prima += paid;
      if (principle === "DCOTA") agg.value_dcota += paid;
      if (overDue !== null && overDue > 0) agg.overdue_piutang += balance;

      aggregate.set(alias, agg);
    }
  }

  if (!periode) {
    const now = new Date();
    periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const monthly = [...aggregate.values()].map((agg) => ({
    alias: agg.alias,
    periode,
    value_penjualan_tertagih: Math.round(agg.value_penjualan_tertagih),
    value_prima: Math.round(agg.value_prima),
    value_dcota: Math.round(agg.value_dcota),
    overdue_piutang: Math.round(agg.overdue_piutang),
    total_ar_amount: Math.round(agg.total_ar_amount),
    total_ar_balance: Math.round(agg.total_ar_balance),
  }));

  return { periode, monthly };
}

/* ---------------------------------------------------------------------
 * PEMETAAN ORANG + BANGUN DOKUMEN
 * ------------------------------------------------------------------- */
function resolveAliasInfo(aliasKey, masterList, overrideMap) {
  const aliasUpper = aliasKey.replace(/_/g, " ");
  const kandidat = [...new Set([aliasKey, aliasKey.split("_")[0]])].filter(Boolean);
  let nik = "";
  let source = "default";
  const over = kandidat.map((k) => overrideMap.get(k)).find(Boolean);
  if (over && over.nik_karyawan) { nik = over.nik_karyawan; source = "sales_alias_map"; }
  if (!nik) {
    for (const k of kandidat) {
      if (SALES_ALIAS_DEFAULT_NIK[k]) { nik = SALES_ALIAS_DEFAULT_NIK[k]; break; }
    }
  }
  const master = masterList.find((k) => String(k.nik_karyawan || "").trim() === String(nik).trim()) || null;
  const nama = master?.nama_karyawan || (over && over.nama_karyawan) || aliasUpper;
  return { nik: nik || null, nama, master, source };
}

/**
 * Bangun dokumen capaian sales dari hasil parse OH + AR.
 * Mengembalikan { dailyDocs, monthlyDocs, unmapped } siap ditulis ke
 * koleksi `sales_achievement_import`.
 */
export function buildSalesAchievementDocs(parsed, masterList, overrideMap, opts = {}) {
  const { oh, ar } = parsed || {};
  const dailyDocs = [];
  const monthlyDocs = [];
  const unmapped = [];

  for (const row of oh?.daily || []) {
    const aliasKey = normKey(row.alias);
    const resolved = resolveAliasInfo(aliasKey, masterList, overrideMap);
    if (!resolved.nik) unmapped.push(`OH ${row.tanggal} ${row.alias}`);
    dailyDocs.push({
      id: `ACH-${row.periode}-D${row.tanggal}-${aliasKey}`,
      fields: {
        jenis: "HARIAN",
        periode: row.periode,
        tanggal: row.tanggal,
        alias: row.alias,
        nik_karyawan: resolved.nik,
        nama_karyawan: resolved.nama,
        volume_dulux: row.volume_dulux,
        volume_catylac: row.volume_catylac,
        volume_maxilite: row.volume_maxilite,
        volume_aquashield: row.volume_aquashield,
        total_volume_ici: row.total_volume_ici,
        ao_ici: row.ao_ici,
        ao_prima: row.ao_prima,
        ao_dcota: row.ao_dcota,
        sumber_file: opts.ohFile || null,
        updated_at: new Date().toISOString(),
      },
    });
  }

  for (const row of ar?.monthly || []) {
    const aliasKey = normKey(row.alias);
    const resolved = resolveAliasInfo(aliasKey, masterList, overrideMap);
    if (!resolved.nik) unmapped.push(`AR ${row.periode} ${row.alias}`);
    monthlyDocs.push({
      id: `ACH-${row.periode}-${aliasKey}`,
      fields: {
        jenis: "BULANAN",
        periode: row.periode,
        alias: row.alias,
        nik_karyawan: resolved.nik,
        nama_karyawan: resolved.nama,
        value_penjualan_tertagih: row.value_penjualan_tertagih,
        value_prima: row.value_prima,
        value_dcota: row.value_dcota,
        overdue_piutang: row.overdue_piutang,
        total_ar_amount: row.total_ar_amount,
        total_ar_balance: row.total_ar_balance,
        sumber_file: opts.arFile || null,
        updated_at: new Date().toISOString(),
      },
    });
  }

  return { dailyDocs, monthlyDocs, unmapped };
}

/**
 * Petakan nilai capaian bulanan (dari file AR) ke kunci target bulanan KPI.
 * Kunci `target_value_penjualan`, `target_value_prima`, `target_value_dcota`,
 * `target_overdue_piutang` dipakai agar langsung cocok dengan form realisasi.
 */
export function monthlyAchievementValuesFromRow(row) {
  if (!row) return {};
  return {
    target_value_penjualan: row.value_penjualan_tertagih,
    target_value_prima: row.value_prima,
    target_value_dcota: row.value_dcota,
    target_overdue_piutang: row.overdue_piutang,
  };
}

/**
 * Petakan nilai capaian harian (dari file OH) ke kunci indikator harian KPI.
 */
export function dailyAchievementValuesFromRow(row) {
  if (!row) return {};
  return {
    volume_dulux: row.volume_dulux,
    volume_catylac: row.volume_catylac,
    volume_maxilite: row.volume_maxilite,
    volume_aquashield: row.volume_aquashield,
    ao_ici: row.ao_ici,
    ao_prima: row.ao_prima,
    ao_dcota: row.ao_dcota,
  };
}
