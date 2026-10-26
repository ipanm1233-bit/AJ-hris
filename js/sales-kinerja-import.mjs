/**
 * =====================================================================
 * PARSER KINERJA SALES (SCHEME INCENTIVE + DSR ASR)
 * Portal HRIS & Operasional CV Andela Jaya
 * =====================================================================
 * Dipakai modal "Impor Kinerja Sales" di menu Penilaian Kontrak. HRD
 * mengunggah file Excel langsung dari browser; hasilnya ditulis ke:
 *   - sales_kinerja_bulanan  (Sheet 'Data' + sheet 01..08 Scheme Incentive)
 *   - sales_dsr_bulanan      (file DSR ASR / CLAIM BENSIN: call & EC harian)
 *
 * Struktur & pemetaan kolom selalu mengikuti format scheme 2026; bila
 * format berubah tahun depan, cukup sesuaikan konstanta peta kolom di
 * bawah. Pemetaan alias nama (AAS, ARIF, DIAN..) memakai dua sumber:
 * default skrip + koleksi `sales_alias_map` (override manual HRD).
 */

export const SALES_ALIAS_DEFAULT_NIK = {
  AAS: "1062503910",      // AAS ASNAWI
  ASHIF: "1072505980",    // ASHIF SYIFAUL QULUB (KODYA CIREBON)
  SURYA: "1072602040",    // SURYA MAULANA DWI SAHPUTRA
  RIFKI: "1112410850",    // RIFKI AKHSAN LESMANA (KOORDINATOR SALES)
  DAYAT: "1092210890",    // SAPUTRA HIDAYAT (SPV SALES)
  YULI: "109250781",      // YEYET YULIATY (CBB)
  YEYET: "109250781",     // YEYET YULIATY (nama asli di file DSR)
  EKO: "1042511940",      // EKO MIHARJO (KODYA TEGAL)
  ANGGA: "1062408930",    // ANGGA ARDIANSAH (TEGAL)
  ARIF: "1082503870",     // ARIF JABIDI
  IMAM: "1012612890",     // ZAENURUL IMAM
  DIAN: "1072505910",     // RIESDIANTO
};

// kolom sheet 'Data' Scheme Incentive (indeks 0-based setelah sheet_to_json header:1)
const SCHEME_COLUMN_MAP = {
  2: ["target", "dulux_liter"], 3: ["target", "catylac_liter"], 4: ["target", "maxilite_liter"],
  5: ["target", "aqs_liter"], 6: ["target", "prima_rp"], 7: ["target", "dcota_rp"],
  8: ["target", "ao_ici"], 9: ["target", "ao_prima"], 10: ["target", "ao_dcota"],
  11: ["target", "value_ici_rp"], 12: ["target", "od_rp"],
  13: ["capaian", "dulux_liter"], 14: ["capaian", "catylac_liter"], 15: ["capaian", "maxilite_liter"],
  16: ["capaian", "aqs_liter"], 17: ["capaian", "prima_rp"], 18: ["capaian", "dcota_rp"],
  19: ["capaian", "ao_ici"], 20: ["capaian", "ao_prima"], 21: ["capaian", "ao_dcota"],
  22: ["capaian", "value_ici_rp"], 23: ["capaian", "od_rp"],
  24: ["penjualan_baru", "grade"], 25: ["effective_call", "grade"], 26: ["absensi", "grade"],
  27: ["penjualan_baru", "outlet_baru"], 28: ["effective_call", "target"], 29: ["effective_call", "realisasi"],
  30: ["effective_call", "persen"],
  31: ["absensi", "hadir"], 32: ["absensi", "absen"], 33: ["absensi", "sakit"], 34: ["absensi", "cuti"],
  35: ["absensi", "alpa"], 36: ["absensi", "persen_hadir"], 37: ["absensi", "hari_kerja"],
  38: ["absensi", "um_luar_kota"], 39: ["absensi", "day"], 40: ["absensi", "diff_absen"],
};

const SUMMARY_EXTRA_HEADERS = {
  "UM LUAR KOTA 2025": "um_luar_kota",
  "UM LUAR KOTA 2026": "um_luar_kota",
  "REVISI INSENTIF AO JAN 2026": "revisi_insentif_ao",
  "Q1 2026": "bonus_q1",
  "Q2": "bonus_q2",
  "ADJUTSMENT JUNI 2026": "adjustment_juni",
  "ADJUSTMENT JUNI 2026": "adjustment_juni",
};

const BULAN = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const DSR_BULAN_TOKENS = {
  JAN: 1, JANUARI: 1, FEB: 2, FEBRUARI: 2, MAR: 3, MARET: 3, APR: 4, APRIL: 4,
  MEI: 5, JUN: 6, JUNI: 6, JUL: 7, JULI: 7, AGS: 8, AGT: 8, AGUSTUS: 8, AUG: 8,
  SEP: 9, SEPT: 9, SEPTEMBER: 9, OKT: 10, OCT: 10, OKTOBER: 10,
  NOV: 11, NOVEMBER: 11, DES: 12, DEC: 12, DESEMBER: 12,
};

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
  if (!s) return null;
  if (/^#/.test(s)) return null; // #DIV/0!, #N/A, dst.
  if (/^-?\d+(?:[.,]\d+)?%$/.test(s)) return Math.round(parseFloat(s.replace("%", "").replace(",", ".")) * 1e4) / 1e6;
  const n = Number(s.replace(/Rp/g, "").replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
};

// nilai sel: angka bila numerik, teks bila grade/huruf
const cellValue = (v) => {
  const n = numValue(v);
  if (n !== null) return n;
  const t = cleanText(v);
  return t || null;
};

const normKey = (v) => cleanText(v).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").trim();

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

/* ---------------------------------------------------------------------
 * SCHEME INCENTIVE
 * ------------------------------------------------------------------- */
export function parseSchemeIncentiveWorkbook(wb) {
  const dataSheetName = wb.SheetNames.find((n) => n.toUpperCase() === "DATA") || wb.SheetNames[0];
  const matrix = sheetMatrix(wb.Sheets[dataSheetName]);
  let tahun = new Date().getFullYear();
  for (const line of matrix.slice(0, 3)) {
    const match = /(\d{4})/.test(cleanText(line[0])) ? cleanText(line[0]).match(/(\d{4})/) : null;
    if (match) { tahun = Number(match[1]); break; }
  }

  const dataBlocks = [];
  let i = 0;
  while (i < matrix.length) {
    const label = cleanText(matrix[i][0]).toUpperCase();
    if (BULAN.includes(label) || (label && Object.keys(DSR_BULAN_TOKENS).includes(label.replace(/\s.*/, "")))) {
      const headerIdx = i + 1;
      const headerArea = cleanText(matrix[headerIdx]?.[0] || "").toUpperCase();
      if (headerArea !== "AREA") { i += 1; continue; }
      const rows = [];
      let j = headerIdx + 1;
      while (j < matrix.length) {
        const area = cleanText(matrix[j][0]);
        const alias = cleanText(matrix[j][1]);
        if (!area || headerArea !== "AREA") break;
        if (!area) break;
        const groups = {};
        for (const [idx, [g, field]] of Object.entries(SCHEME_COLUMN_MAP)) {
          const gi = Number(idx);
          const value = cellValue(matrix[j][gi]);
          (groups[g] = groups[g] || {})[field] = value;
        }
        rows.push({ area, alias, groups });
        j += 1;
      }
      const bulanIdx = BULAN.indexOf(label) >= 0 ? BULAN.indexOf(label) : DSR_BULAN_TOKENS[label.split(/\s+/)[0]] - 1;
      dataBlocks.push({ bulan: label, periode: `${tahun}-${String(bulanIdx + 1).padStart(2, "0")}`, rows });
      i = j;
    } else {
      i += 1;
    }
  }

  const summarySheets = [];
  for (const name of wb.SheetNames) {
    if (!/^\d{2}$/.test(name.trim())) continue;
    const bulanNum = Number(name.trim());
    if (bulanNum < 1 || bulanNum > 12) continue;
    const matrixS = sheetMatrix(wb.Sheets[name]);
    let headerIdx = -1;
    for (let r = 0; r < matrixS.length; r += 1) {
      const vals = matrixS[r].map(c => cleanText(c).toUpperCase());
      if (vals.includes("AREA") && vals.some(v => v.startsWith("ASR"))) { headerIdx = r; break; }
    }
    if (headerIdx < 0) continue;
    const header = matrixS[headerIdx];
    const headerPrev = matrixS[headerIdx - 1] || [];
    const colMap = {};
    header.forEach((c, idx) => {
      const label = cleanText(c).toUpperCase();
      if (label === "ASR") colMap.alias = idx;
      else if (label === "POIN") colMap.poin = idx;
      else if (/^POINT A/.test(label)) colMap.point_a = idx;
      else if (/^POINT B/.test(label)) colMap.point_b = idx;
      else if (/^POINT C/.test(label)) colMap.point_c = idx;
      else if (/^POINT D/.test(label)) colMap.point_d = idx;
      else if (/^POINT E/.test(label)) colMap.point_e = idx;
      else if (/^POINT F/.test(label)) colMap.point_f = idx;
      else if (label === "TOTAL") colMap.total = idx;
      else if (SUMMARY_EXTRA_HEADERS[label]) colMap[SUMMARY_EXTRA_HEADERS[label]] = idx;
    });
    headerPrev.forEach((c, idx) => {
      const label = cleanText(c).toUpperCase();
      if (/^INSENTIF @ ?ADMIN/.test(label) && colMap.insentif_admin === undefined && idx < header.length) colMap.insentif_admin = idx;
      if (/^INSENTIF @ ?FINANCE/.test(label) && colMap.insentif_finance === undefined && idx < header.length) colMap.insentif_finance = idx;
    });
    const rows = [];
    let j = headerIdx + 1;
    while (j < matrixS.length) {
      const area = cleanText(matrixS[j][0]);
      if (!area) { j += 1; continue; }
      if (/^SALESMAN/.test(cleanText(matrixS[j][0]).toUpperCase())) { j += 1; continue; }
      const rowOut = { area };
      for (const [field, idx] of Object.entries(colMap)) rowOut[field] = cellValue(matrixS[j][idx]);
      rows.push(rowOut);
      j += 1;
      const berikut = [matrixS[j]?.[0], matrixS[j + 1]?.[0]].map(cleanText);
      if (berikut.every(b => !b)) break;
    }
    summarySheets.push({ sheet: name, bulanNum, rows });
  }

  return { tahun, dataBlocks, summarySheets };
}

/* ---------------------------------------------------------------------
 * DSR ASR (CLAIM BENSIN)
 * ------------------------------------------------------------------- */
function dsrPeriodeFromSheet(name, tahunHint) {
  const clean = cleanText(name).toUpperCase().replace(/’|'/g, " ");
  const yearMatch = clean.match(/(20\s?\d{2})|['’]\s?(\d{2})\s/);
  let tahun = tahunHint;
  if (yearMatch) {
    const y = (yearMatch[1] || yearMatch[2]).replace(/\s/g, "");
    const numeric = y.length === 4 ? Number(y) : 2000 + Number(y);
    if (numeric >= 2020 && numeric <= 2035) tahun = numeric;
  }
  const tokens = clean.split(/[^A-Z0-9]+/).filter(Boolean);
  let bulan = null;
  for (const t of tokens) {
    if (DSR_BULAN_TOKENS[t]) { bulan = DSR_BULAN_TOKENS[t]; break; }
  }
  if (!bulan) return null;
  return `${tahun}-${String(bulan).padStart(2, "0")}`;
}

export function parseDsrWorkbook(wb, tahunHint) {
  const hasil = [];
  for (const name of wb.SheetNames) {
    const matrix = sheetMatrix(wb.Sheets[name]);
    // cari baris berlabel 'Call'
    let callRow = -1;
    for (let r = 0; r < matrix.length; r += 1) {
      if (matrix[r].some(c => /^CALL$/.test(cleanText(c).toUpperCase()))) { callRow = r; break; }
    }
    if (callRow < 0) continue;
    const callLine = matrix[callRow];
    const startCol = callLine.findIndex(c => /^CALL$/i.test(cleanText(c).toUpperCase()));
    if (startCol < 0) continue;
    // nama orang: scan ke atas dari baris Call; ambil sel TERATAS yang
    // lolos bukan label generik (baris bawah biasanya label area, mis.
    // 'ASHIF' / 'KODYA CRB' / 'EC INSENTIF' / 'Call')
    const pairs = [];
    for (let c = startCol; c < callLine.length; c += 1) {
      if (!/^CALL$/i.test(cleanText(callLine[c]) || "")) continue;
      let nama = "";
      for (let up = callRow - 1; up >= 0; up -= 1) {
        const val = cleanText(matrix[up][c]);
        if (!val || /^(EC ?INSENTIF|EC|ICI|HARI|TANGGAL|DATE|TOTAL|NO|NAMA)$/i.test(val)) continue;
        nama = val;
      }
      pairs.push({ colCall: c, colEc: c + 1, nama });
    }
    const periode = dsrPeriodeFromSheet(name, tahunHint);
    const people = new Map();
    let titleHint = "";
    for (const line of matrix.slice(0, 5)) {
      const t = line.map(cleanText).join(" ");
      const y = t.match(/20\d{2}/);
      if (y) { titleHint = y[0]; break; }
    }
    const periodeFix = periode || (titleHint ? `${titleHint}-00` : null);
    for (let r = callRow + 1; r < matrix.length; r += 1) {
      const dayVal = numValue(matrix[r][0]) ?? numValue(matrix[r][1]);
      if (dayVal === null || dayVal < 1 || dayVal > 31 || !Number.isInteger(dayVal)) continue;
      for (const p of pairs) {
        const aliasKey = normKey(p.nama);
        if (!aliasKey) continue;
        const person = people.get(aliasKey) || { alias: cleanText(p.nama), days: {} };
        person.days[dayVal] = {
          call: numValue(matrix[r][p.colCall]),
          ec: numValue(matrix[r][p.colEc]),
        };
        people.set(aliasKey, person);
      }
    }
    if (people.size) hasil.push({ sheet: name, periode: periodeFix, people: [...people.values()] });
  }
  return { sheets: hasil, tahunHint: tahunHint || new Date().getFullYear() };
}

/* ---------------------------------------------------------------------
 * PEMETAAN ORANG + BANGUN DOKUMEN
 * ------------------------------------------------------------------- */
function resolveAlias(aliasKey, masterList, overrideMap) {
  const aliasUpper = aliasKey.replace(/_/g, " ");
  // alias majemuk seperti 'ASHIF_KODYA_CRB' atau 'RIZKY_CRBB' juga dicoba
  // dengan nama orang di depan ('ASHIF', 'RIZKY') bila penuh tidak ketemu.
  const kandidat = [...new Set([aliasKey, aliasKey.split("_")[0]])].filter(Boolean);
  let over = null, source = "default";
  for (const k of kandidat) {
    if (overrideMap.get(k)) { over = overrideMap.get(k); source = "sales_alias_map"; break; }
  }
  let nik = "";
  if (over && over.nik_karyawan) nik = over.nik_karyawan;
  else for (const k of kandidat) { if (SALES_ALIAS_DEFAULT_NIK[k]) { nik = SALES_ALIAS_DEFAULT_NIK[k]; break; } }
  const master = masterList.find(k => String(k.nik_karyawan || "") === String(nik).trim()) || null;
  const nama = master?.nama_karyawan || (over && over.nama_karyawan) || aliasUpper;
  return { nik: nik || null, nama, master, source };
}

function pct(actual, target) {
  const a = Number(actual), t = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(t) || t <= 0) return null;
  return Math.round((a / t) * 1000) / 10;
}

const ID_SALES_METRICS = ["dulux_liter", "catylac_liter", "maxilite_liter", "aqs_liter", "prima_rp", "dcota_rp", "value_ici_rp", "ao_ici", "ao_prima", "ao_dcota"];

function statusData(groups) {
  const hasAch = Object.values(groups.capaian || {}).some(v => v !== null && Number.isFinite(Number(v)));
  return { hasAch };
}

export function buildSalesKinerjaDocs(parsed, masterList, overrideMap, opts = {}) {
  const docs = [];
  const unmapped = [];
  const wadahSummary = new Map();
  for (const s of parsed.summarySheets || []) {
    const periode = `${String(parsed.tahun).padStart(4, "0")}-${String(s.bulanNum).padStart(2, "0")}`;
    for (const row of s.rows) wadahSummary.set(`${periode}|${normKey(row.area)}|${normKey(row.alias)}`, { ...row, sheet: s.sheet });
  }
  for (const block of parsed.dataBlocks || []) {
    for (const row of block.rows) {
      const areaKey = normKey(row.area), aliasKey = normKey(row.alias);
      const resolved = resolveAlias(aliasKey, masterList, overrideMap);
      if (!resolved.nik) unmapped.push(`${block.periode} ${row.area} / ${row.alias}`);
      const key = `${block.periode}|${areaKey}|${aliasKey}`;
      const grup = row.groups || {};
      const capaianPersen = {};
      for (const k of ID_SALES_METRICS) {
        const p = pct((grup.capaian || {})[k], (grup.target || {})[k]);
        if (p !== null) capaianPersen[k] = p;
      }
      const st = statusData(grup);
      const ringkasan = wadahSummary.get(key) || null;
      const fields = {
        periode: block.periode,
        tahun: Number(block.periode.slice(0, 4)),
        bulan_nama: block.bulan,
        area: row.area,
        alias: (row.alias || "").toUpperCase(),
        role: areaKey.includes("SPV") ? "SPV" : areaKey.includes("KOOR") ? "KOORDINATOR" : "ASR",
        nik_karyawan: resolved.nik,
        nama_karyawan: resolved.nama,
        jabatan_master: resolved.master?.jabatan || null,
        divisi_master: resolved.master?.divisi || null,
        cabang_master: resolved.master?.cabang || null,
        status_data: ringkasan ? "FINAL" : (st.hasAch ? "ACHIEVEMENT_PARSIAL" : "TARGET_SAJA"),
        target: grup.target || {},
        capaian: grup.capaian || {},
        capaian_persen: capaianPersen,
        effective_call: grup.effective_call || {},
        penjualan_baru: grup.penjualan_baru || {},
        absensi: grup.absensi || {},
        sumber_file: opts.sourceFile || null,
        updated_at: new Date().toISOString(),
      };
      if (ringkasan) {
        fields.status_data = "FINAL";
        fields.ringkasan_insentif = {
          sheet_asal: ringkasan.sheet,
          poin: ringkasan.poin ?? null,
          point_a: ringkasan.point_a ?? null,
          point_b: ringkasan.point_b ?? null,
          point_c: ringkasan.point_c ?? null,
          point_d: ringkasan.point_d ?? null,
          point_e: ringkasan.point_e ?? null,
          point_f: ringkasan.point_f ?? null,
          um_luar_kota: ringkasan.um_luar_kota ?? null,
          bonus_q1: ringkasan.bonus_q1 ?? null,
          bonus_q2: ringkasan.bonus_q2 ?? null,
          revisi_insentif_ao: ringkasan.revisi_insentif_ao ?? null,
          adjustment_juni: ringkasan.adjustment_juni ?? null,
          total_insentif: ringkasan.total ?? null,
          insentif_admin: ringkasan.insentif_admin ?? null,
          insentif_finance: ringkasan.insentif_finance ?? null,
        };
      }
      docs.push({ id: `KIN-${block.periode}-${normKey(`${areaKey}_${aliasKey}`)}`, fields });
    }
  }
  return { docs, unmapped };
}

export function buildDsrDocs(parsed, masterList, overrideMap, opts = {}) {
  const docs = [];
  const unmapped = [];
  for (const sheet of parsed.sheets || []) {
    for (const person of sheet.people) {
      const aliasKey = normKey(person.alias);
      const resolved = resolveAlias(aliasKey, masterList, overrideMap);
      if (!resolved.nik) unmapped.push(`${sheet.periode || "(?)"} / ${person.alias}`);
      let totalCall = 0, totalEc = 0, hariLapor = 0;
      const days = {};
      for (const [d, v] of Object.entries(person.days || {})) {
        days[d] = { call: v.call ?? null, ec: v.ec ?? null };
        if (v.call === null && v.ec === null) continue;
        hariLapor += 1;
        totalCall += Number(v.call) || 0;
        totalEc += Number(v.ec) || 0;
      }
      const period = (sheet.periode || "").replace("-00", "");
      if (!/^\d{4}-\d{2}$/.test(period)) continue;
      docs.push({
        id: `DSR-${period}-${aliasKey}`,
        fields: {
          periode: period,
          tahun: Number(period.slice(0, 4)),
          sheet_asal: sheet.sheet,
          alias: (person.alias || "").toUpperCase(),
          nik_karyawan: resolved.nik,
          nama_karyawan: resolved.nama,
          jabatan_master: resolved.master?.jabatan || null,
          total_call: totalCall,
          total_ec: totalEc,
          hari_lapor: hariLapor,
          rasio_ec: totalCall > 0 ? Math.round((totalEc / totalCall) * 1000) / 10 : null,
          detail_harian: days,
          sumber_file: opts.sourceFile || null,
          updated_at: new Date().toISOString(),
        },
      });
    }
  }
  return { docs, unmapped };
}
