import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ohBrandFamily,
  ACH_VOLUME_KEYS,
  parseOhAchievementWorkbook,
  parseArAchievementWorkbook,
  parseTargetVsAchievementWorkbook,
  parseTrackingSalesWorkbook,
  parseSalesMonthlyWorkbook,
  buildSalesAchievementDocs,
  buildSalesVolumeDocs,
  dailyAchievementValuesFromRow,
  monthlyAchievementValuesFromRow,
  monthlyVolumeAchievementValuesFromRow,
  monthlyMergedAchievementValues
} from "../js/sales-achievement-import.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ---- Mock minimal window.XLSX untuk sheetMatrix ---- */
function colLabelToIndex(s) {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function colIndexToLabel(c) {
  let s = "";
  c += 1;
  while (c > 0) {
    const rem = (c - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}
const XLSX = {
  utils: {
    encode_cell({ r, c }) { return `${colIndexToLabel(c)}${r + 1}`; },
    decode_range(ref) {
      const m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      return { s: { r: Number(m[2]) - 1, c: colLabelToIndex(m[1]) }, e: { r: Number(m[4]) - 1, c: colLabelToIndex(m[3]) } };
    },
    encode_range({ s, e }) { return `${colIndexToLabel(s.c)}${s.r + 1}:${colIndexToLabel(e.c)}${e.r + 1}`; }
  }
};
globalThis.window = { XLSX };

function makeSheet(rows) {
  const sheet = {};
  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val === undefined || val === null || val === "") return;
      sheet[XLSX.utils.encode_cell({ r, c })] = { v: val };
    });
  });
  const lastCol = Math.max(0, ...rows.map((row) => row.length - 1));
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: lastCol } });
  return sheet;
}

test("klasifikasi baris OH ke keluarga produk volume", () => {
  assert.equal(ohBrandFamily("CATYLAC EXTERIOR", "MID", "DS CTY EX"), "catylac");
  assert.equal(ohBrandFamily("MAXILITE NEW", "LOW", "MS MXLT"), "maxilite");
  assert.equal(ohBrandFamily("", "AQS", "DS AQS TICOR"), "aquashield");
  assert.equal(ohBrandFamily("AQUASHIELD BASE", "TOP", "DLX VIS AQUASHIELD"), "aquashield");
  assert.equal(ohBrandFamily("", "PRIMA", "KUAS CAT PRIMA 833"), "prima");
  assert.equal(ohBrandFamily("", "DCOTA", "SHOWER SWD 03"), "dcota");
  assert.equal(ohBrandFamily("", "TOP", "DLX ACOTONE TINTER"), "dulux");
  assert.equal(ohBrandFamily("WS CORE DUALSHIELD", "TOP", "DS WSC"), "dulux");
});

test("kunci volume ICI sesuai empat produk", () => {
  assert.deepEqual(ACH_VOLUME_KEYS, ["volume_dulux", "volume_catylac", "volume_maxilite", "volume_aquashield"]);
});

test("parse OH menangani tanggal sebagai serial Excel dan objek Date", () => {
  const header = [
    "SR No.", "SR Date", "SO No.", "SO Date", "DO No.", "DO Date", "Delivery Date",
    "Cust Code", "Cust Name", "Product Code", "Product Name", "Product Size",
    "Brand Desc", "Brand", "Alok", "Volume", "Weight", "AR Amt / Item", "Salesman", "Status", "Ket"
  ];
  // Serial Excel 46328.339108796295 = 2026-11-02 08:08:19.
  const rows = [
    header,
    ["", "", "SO1", "", "SP1", "", 46328.339108796295, "290564", "RIMBA", "A912", "DS CTY EX 2G BASE", "25", "CATYLAC EXTERIOR", "MID", "5", 100, 125, 3320833, "AAS", "INVOICE", ""],
    ["", "", "SO2", "", "SP2", "", new Date(Date.UTC(2026, 10, 2, 8, 8, 19)), "290999", "TOKO B", "A927", "MS MXLT PUTIH", "4", "MAXILITE NEW", "LOW", "8", 10, 15, 880001, "AAS", "INVOICE", ""]
  ];
  const wb = { SheetNames: ["Sheet3"], Sheets: { Sheet3: makeSheet(rows) } };
  const parsed = parseOhAchievementWorkbook(wb);
  assert.equal(parsed.periode, "2026-11");
  const aas = parsed.daily.find((d) => d.alias === "AAS");
  assert.ok(aas);
  assert.equal(aas.tanggal, "2026-11-02");
  assert.equal(aas.volume_catylac, 0.125);
  assert.equal(aas.volume_maxilite, 0.015);
  assert.equal(aas.ao_ici, 2);
});

test("parse OH menggabungkan volume per salesman per tanggal dan menghitung AO", () => {
  const header = [
    "SR No.", "SR Date", "SO No.", "SO Date", "DO No.", "DO Date", "Delivery Date",
    "Cust Code", "Cust Name", "Product Code", "Product Name", "Product Size",
    "Brand Desc", "Brand", "Alok", "Volume", "Weight", "AR Amt / Item", "Salesman", "Status", "Ket"
  ];
  const rows = [
    header,
    ["", "", "SO1", "", "SP1", "", "2026-11-02 08:00:00", "290564", "RIMBA", "A324", "DLX ACOTONE TINTER", "1", "", "TOP", "2", 2, 2, 400000, "AAS", "INVOICE", ""],
    ["", "", "SO2", "", "SP2", "", "2026-11-02 08:00:00", "290564", "RIMBA", "A912", "DS CTY EX 2G BASE", "25", "CATYLAC EXTERIOR", "MID", "5", 100, 125, 3320833, "AAS", "INVOICE", ""],
    ["", "", "SO3", "", "SP3", "", "2026-11-02 08:00:00", "290999", "TOKO B", "A927", "MS MXLT PUTIH", "4", "MAXILITE NEW", "LOW", "8", 10, 15, 880001, "AAS", "INVOICE", ""],
    ["", "", "SO4", "", "SP4", "", "2026-11-02 08:00:00", "290999", "TOKO B", "A965", "DS AQS TICOR", "1", "", "AQS", "1", 1, 1.2, 100000, "AAS", "INVOICE", ""],
    ["", "", "SO5", "", "SP5", "", "2026-11-03 08:00:00", "290476", "TOKO C", "KC-8334", "KUAS CAT PRIMA 833", "1", "", "PRIMA", "1", 1, 0.5, 10000, "DIAN", "INVOICE", ""],
    ["", "", "SO6", "", "SP6", "", "2026-11-02 08:00:00", "290111", "TOKO D", "SWD-03", "SHOWER SWD 03", "1", "", "DCOTA", "1", 1, 1, 1000, "VACANT_CBT", "INVOICE", ""]
  ];
  const wb = { SheetNames: ["Sheet1"], Sheets: { Sheet1: makeSheet(rows) } };
  const parsed = parseOhAchievementWorkbook(wb);
  assert.equal(parsed.periode, "2026-11");

  const aas = parsed.daily.find((d) => d.alias === "AAS");
  assert.ok(aas);
  assert.equal(aas.volume_dulux, 0.002);
  assert.equal(aas.volume_catylac, 0.125);
  assert.equal(aas.volume_maxilite, 0.015);
  assert.equal(aas.volume_aquashield, 0.0012);
  assert.equal(aas.total_volume_ici, 0.1432);
  assert.equal(aas.ao_ici, 2);
  assert.equal(aas.ao_prima, 0);
  assert.equal(aas.ao_dcota, 0);

  const dian = parsed.daily.find((d) => d.alias === "DIAN");
  assert.ok(dian);
  assert.equal(dian.ao_prima, 1);
  assert.equal(dian.ao_ici, 0);

  // VACANT_CBT tidak dimasukkan.
  assert.equal(parsed.daily.some((d) => d.alias === "VACANT_CBT"), false);
});

test("parse AR menggabungkan penjualan tertagih dan overdue per salesman", () => {
  const header = [
    "Outlet ID", "Outlet Name", "Salesman ID", "Salesman Name", "Principle", "SP#/SN#",
    "Due Date", "Over Due", "AR Amount", "Paid", "AR Balance", "Keterangan", "Daily Update", ""
  ];
  const rows = [
    ["", "", "", "", "", "", "", "TOTAL :", 1, 1, 1, "", "", ""],
    header,
    ["290960", "ABADI", "001B001", "AAS", "ICI", "SP1", "2026-10-07", 44, 1488289, 1488289, 0, "", ""],
    ["290960", "ABADI", "001B001", "AAS", "ICI", "SP2", "2026-10-07", 0, 1914529, 0, 1914529, "", ""],
    ["290960", "ABADI", "001B001", "AAS", "PRIMA", "SP3", "2026-10-07", 5, 1000000, 200000, 800000, "", ""],
    ["291573", "TOKO", "001B002", "IMAM", "DCOTA", "SP4", "2026-08-29", 10, 500000, 300000, 200000, "", ""]
  ];
  const wb = { SheetNames: ["Update AR Harian Bulan November 2026"], Sheets: { "Update AR Harian Bulan November 2026": makeSheet(rows) } };
  const parsed = parseArAchievementWorkbook(wb, 2026);
  assert.equal(parsed.periode, "2026-11");

  const aas = parsed.monthly.find((m) => m.alias === "AAS");
  assert.ok(aas);
  assert.equal(aas.value_penjualan_tertagih, 1688289);
  assert.equal(aas.value_prima, 200000);
  assert.equal(aas.value_dcota, 0);
  assert.equal(aas.overdue_piutang, 800000);

  const imam = parsed.monthly.find((m) => m.alias === "IMAM");
  assert.ok(imam);
  assert.equal(imam.value_penjualan_tertagih, 300000);
  assert.equal(imam.value_dcota, 300000);
  assert.equal(imam.overdue_piutang, 200000);
});

test("buildSalesAchievementDocs memetakan NIK dan membangun dokumen harian + bulanan", () => {
  const masterList = [
    { nik_karyawan: "1062503910", nama_karyawan: "AAS ASNAWI" },
    { nik_karyawan: "1012612890", nama_karyawan: "ZAENURUL IMAM" }
  ];
  const overrideMap = new Map();
  const oh = { daily: [
    { alias: "AAS", tanggal: "2026-11-02", periode: "2026-11", volume_dulux: 0.002, volume_catylac: 0.125, volume_maxilite: 0.015, volume_aquashield: 0.0012, total_volume_ici: 0.1432, ao_ici: 2, ao_prima: 0, ao_dcota: 0 },
    { alias: "IKA", tanggal: "2026-11-02", periode: "2026-11", volume_dulux: 1, volume_catylac: 0, volume_maxilite: 0, volume_aquashield: 0, total_volume_ici: 1, ao_ici: 1, ao_prima: 0, ao_dcota: 0 }
  ] };
  const ar = { monthly: [
    { alias: "IMAM", periode: "2026-11", value_penjualan_tertagih: 300000, value_prima: 0, value_dcota: 300000, overdue_piutang: 200000, total_ar_amount: 500000, total_ar_balance: 200000 }
  ] };
  const result = buildSalesAchievementDocs({ oh, ar }, masterList, overrideMap, { ohFile: "OH.xlsx", arFile: "AR.xlsx" });

  const dailyAas = result.dailyDocs.find((d) => d.fields.alias === "AAS");
  assert.equal(dailyAas.id, "ACH-2026-11-D2026-11-02-AAS");
  assert.equal(dailyAas.fields.nik_karyawan, "1062503910");
  assert.equal(dailyAas.fields.nama_karyawan, "AAS ASNAWI");
  assert.equal(dailyAas.fields.jenis, "HARIAN");
  assert.equal(dailyAas.fields.sumber_file, "OH.xlsx");

  const monthlyImam = result.monthlyDocs.find((d) => d.fields.alias === "IMAM");
  assert.equal(monthlyImam.id, "ACH-2026-11-IMAM");
  assert.equal(monthlyImam.fields.nik_karyawan, "1012612890");
  assert.equal(monthlyImam.fields.jenis, "BULANAN");

  // IKA tidak ada di peta NIK -> tercatat sebagai unmapped.
  assert.ok(result.unmapped.some((u) => u.includes("IKA")));
});

test("pemetaan nilai capaian ke kunci indikator harian & bulanan", () => {
  const daily = dailyAchievementValuesFromRow({
    volume_dulux: 1, volume_catylac: 2, volume_maxilite: 3, volume_aquashield: 4,
    ao_ici: 5, ao_prima: 6, ao_dcota: 7
  });
  assert.equal(daily.volume_dulux, 1);
  assert.equal(daily.ao_ici, 5);
  assert.equal(daily.volume_catylac, 2);

  const monthly = monthlyAchievementValuesFromRow({
    value_penjualan_tertagih: 100, value_prima: 20, value_dcota: 30, overdue_piutang: 40
  });
  assert.equal(monthly.target_value_penjualan, 100);
  assert.equal(monthly.target_overdue_piutang, 40);
  // Value prima/dcota tidak lagi diambil dari AR (sumbernya file Target vs Achievement).
  assert.equal(monthly.target_value_prima, undefined);
  assert.equal(monthly.target_value_dcota, undefined);
});

test("pemetaan nilai volume/AO/value dari Target vs Achievement", () => {
  const monthly = monthlyVolumeAchievementValuesFromRow({
    volume_dulux: 0.111, volume_catylac: 1.331, volume_maxilite: 0, volume_aquashield: 0.025,
    ao_ici: 7, ao_prima: 3, ao_dcota: 0, value_prima: 2069397, value_dcota: 0
  });
  assert.equal(monthly.target_volume_dulux, 0.111);
  assert.equal(monthly.target_volume_catylac, 1.331);
  assert.equal(monthly.target_ao_ici, 7);
  assert.equal(monthly.target_ao_prima, 3);
  assert.equal(monthly.target_value_prima, 2069397);
  assert.equal(monthly.target_value_dcota, 0);
});

test("parse Target vs Achievement menggabungkan volume, AO & value bulanan", () => {
  // ICI Daily -> volume
  const iciHeader = new Array(38).fill("");
  iciHeader[0] = "SPV"; iciHeader[1] = "Area"; iciHeader[2] = "Sales Code"; iciHeader[3] = "Sales";
  iciHeader[4] = "TOP - in KL "; iciHeader[10] = "MID - in KL"; iciHeader[16] = "LOW - in KL"; iciHeader[22] = "AQS - in KL";
  const iciSub = new Array(38).fill("");
  [4, 10, 16, 22].forEach((b) => { iciSub[b] = "Target"; iciSub[b + 1] = "INV"; iciSub[b + 2] = "DO"; iciSub[b + 3] = "Total"; iciSub[b + 4] = "% Achieve"; iciSub[b + 5] = "GAP"; });
  const iciRow = new Array(38).fill("");
  iciRow[0] = "DAYAT"; iciRow[1] = "KUNINGAN"; iciRow[2] = "001B001"; iciRow[3] = "AAS";
  iciRow[4] = 2.15; iciRow[7] = 0.111;
  iciRow[10] = 8.67; iciRow[13] = 1.33182;
  iciRow[16] = 0.01; iciRow[19] = 0;
  iciRow[22] = 1.3; iciRow[25] = 0.025616;

  // Prima Daily -> value prima + ao prima
  const primaHeader = ["SPV", "AREA", "Sales Code", "Sales", "2026-11-01 00:00:00"];
  const primaSub = ["", "", "", "", "Target Value", "INV - DPP", "Est. value Barang belum Kirim ( DO ) - DPP", "Total Achieve - DPP", "%", "GAP ", "Target AO", "Achieve AO", "% Achieve", "GAP AO"];
  const primaRow = ["DAYAT", "KUNINGAN", "001B001", "AAS", 11000000, 0, 2069397, 2069397, 0.188127, 8930603, 20, 3, 0.15, 17];

  // Dcota Daily -> value dcota + ao dcota
  const dcotaHeader = ["SPV", "Area", "Sales Code", "Sales", "Achievement DCOTA - NOVEMBER 2026"];
  const dcotaSub = ["", "", "", "", "Target Value", "Invoice -  ( DPP )", "Barang Belum Kirim ( DO ) - ( DPP )", "Total ( DPP )", "Grand total     ( incl ppn )", "% Achieve", "GAP", "Target AO", "Achieve AO", "% Achieve", "GAP AO"];
  const dcotaRow = ["DAYAT", "KUNINGAN", "001B001", "AAS", 11100000, 0, 0, 0, 0, 0, 11100000, 20, 0, 0, 20];

  // Target -> peta sales code -> alias
  const targetHeader = ["Sales", "Sales Id", "Area", "TOP", "MID", "LOW", "AQS", "Total", "AO", "Value", "AO", "Value", "AO"];
  const targetRow = ["AAS", "001B001", "KNG", 2.15, 8.67, 0.01, 1.3, 12.13, 40, 11000000, 20, 11100000, 20];

  // Rekap detail -> AO ICI (outlet dengan volume ICI > 0)
  const rekHeader = new Array(20).fill("");
  rekHeader[0] = "OUTLET Code"; rekHeader[1] = "Description"; rekHeader[2] = "Sales"; rekHeader[3] = "TOP"; rekHeader[6] = "MID"; rekHeader[9] = "SC"; rekHeader[12] = "LOW"; rekHeader[15] = "AQS"; rekHeader[18] = "PRIMA";
  const rekLtr = new Array(20).fill(""); rekLtr[3] = "(Ltr)"; rekLtr[6] = "(Ltr)"; rekLtr[9] = "(Ltr)"; rekLtr[12] = "(Ltr)"; rekLtr[15] = "(Ltr)"; rekLtr[18] = "VALUE";
  const rekSub = new Array(20).fill(""); [3, 6, 9, 12, 15].forEach((b) => { rekSub[b] = "Inv"; rekSub[b + 1] = "OS"; rekSub[b + 2] = "Total"; });
  const rekRow1 = new Array(20).fill(""); rekRow1[0] = "290960"; rekRow1[2] = "001B001"; rekRow1[8] = 223.46; rekRow1[17] = 12.296;
  const rekRow2 = new Array(20).fill(""); rekRow2[0] = "290961"; rekRow2[2] = "001B001";

  const wb = {
    SheetNames: ["Target vs Achievement", "ICI Daily ", "Prima Daily", "Dcota Daily", "Rekap detail", "Target"],
    Sheets: {
      "Target vs Achievement": makeSheet([["x"]]),
      "ICI Daily ": makeSheet([["Kolom E sd AJ sudah rumus"], ["", "AJ - CIREBON"], ["ACHIEVEMENT"], iciHeader, iciSub, iciRow]),
      "Prima Daily": makeSheet([["Kolom E sd N sudah rumus"], primaHeader, primaSub, primaRow]),
      "Dcota Daily": makeSheet([["Kolom E sd O sudah rumus"], dcotaHeader, dcotaSub, dcotaRow]),
      "Rekap detail": makeSheet([[""], ["", "", "AO"], ["", "", "Total"], rekHeader, rekLtr, rekSub, rekRow1, rekRow2]),
      "Target": makeSheet([["", "", "JUNI"], ["", "", "ICI"], targetHeader, targetRow]),
    }
  };

  const parsed = parseTargetVsAchievementWorkbook(wb);
  assert.equal(parsed.periode, "2026-11");

  const aas = parsed.monthly.find((m) => m.alias === "AAS");
  assert.ok(aas);
  assert.equal(aas.volume_dulux, 0.111);
  assert.equal(aas.volume_catylac, 1.3318);
  assert.equal(aas.volume_maxilite, 0);
  assert.equal(aas.volume_aquashield, 0.0256);
  assert.equal(aas.total_volume_ici, 1.4684);
  assert.equal(aas.ao_ici, 1);
  assert.equal(aas.ao_prima, 3);
  assert.equal(aas.ao_dcota, 0);
  assert.equal(aas.value_prima, 2069397);
  assert.equal(aas.value_dcota, 0);
});

test("buildSalesVolumeDocs membangun dokumen BULANAN_VOLUME dengan NIK", () => {
  const masterList = [{ nik_karyawan: "1062503910", nama_karyawan: "AAS ASNAWI" }];
  const parsed = { monthly: [
    { alias: "AAS", periode: "2026-11", volume_dulux: 0.111, volume_catylac: 1.3318, volume_maxilite: 0, volume_aquashield: 0.0256, total_volume_ici: 1.4684, ao_ici: 1, ao_prima: 3, ao_dcota: 0, value_prima: 2069397, value_dcota: 0 },
    { alias: "IKA", periode: "2026-11", volume_dulux: 1, volume_catylac: 0, volume_maxilite: 0, volume_aquashield: 0, total_volume_ici: 1, ao_ici: 1, ao_prima: 0, ao_dcota: 0, value_prima: 0, value_dcota: 0 }
  ] };
  const result = buildSalesVolumeDocs(parsed, masterList, new Map(), { tvaFile: "TVA.xlsx" });

  const aas = result.docs.find((d) => d.fields.alias === "AAS");
  assert.equal(aas.id, "ACHV-2026-11-AAS");
  assert.equal(aas.fields.jenis, "BULANAN_VOLUME");
  assert.equal(aas.fields.nik_karyawan, "1062503910");
  assert.equal(aas.fields.sumber_file, "TVA.xlsx");
  assert.equal(aas.fields.volume_dulux, 0.111);
  assert.equal(aas.fields.ao_prima, 3);

  assert.ok(result.unmapped.some((u) => u.includes("IKA")));
});

test("parse TRACKING SALES membaca tabel datar per metrik & salesman", () => {
  const header = ["Area", "Sales", "Metric", "TARGET", "ACH"];
  const row = (area, sales, metric, target, ach) => [area, sales, metric, target, ach];
  const rows = [
    header,
    row("KUNINGAN", "AAS", "TOP", 2.15, 0.111),
    row("KUNINGAN", "AAS", "MID", 8.67, 1.33182),
    row("KUNINGAN", "AAS", "LOW", 0.01, ""),
    row("KUNINGAN", "AAS", "AQS", 1.3, 0.025616),
    row("KUNINGAN", "AAS", "TOTAL", 12.13, 1.468436),
    row("KUNINGAN", "AAS", "AO ICI", 40, 14),
    row("KUNINGAN", "AAS", "VALUE PRIMA", 11000000, 2069397),
    row("KUNINGAN", "AAS", "AO PRIMA", 20, 3),
    row("KUNINGAN", "AAS", "VALUE DCOTA", 11100000, ""),
    row("KUNINGAN", "AAS", "AO DCOTA", 20, ""),
    row("KUNINGAN", "AAS", "Penjualan Tertagih", "", ""),
    row("KUNINGAN", "AAS", "Overdue Piutang (batas maksimum)", "", ""),
    row("KUNINGAN", "VACANT_CT", "TOP", 2.64, 0.086),
    row("CIREBON", "DIAN", "TOP", 20, 18.2965),
    row("CIREBON", "DIAN", "Penjualan Tertagih", "", 5000000),
    row("CIREBON", "DIAN", "Overdue Piutang (batas maksimum)", "", 700000),
  ];
  const wb = {
    SheetNames: ["TRACKING SALES NOVEMBER 2026"],
    Sheets: { "TRACKING SALES NOVEMBER 2026": makeSheet(rows) },
  };

  const parsed = parseTrackingSalesWorkbook(wb);
  assert.equal(parsed.periode, "2026-11");
  assert.equal(parsed.monthly.length, 2);

  const aas = parsed.monthly.find((m) => m.alias === "AAS");
  assert.equal(aas.volume_dulux, 0.111);
  assert.equal(aas.volume_catylac, 1.3318);
  assert.equal(aas.volume_maxilite, 0);
  assert.equal(aas.volume_aquashield, 0.0256);
  assert.equal(aas.total_volume_ici, 1.4684);
  assert.equal(aas.ao_ici, 14);
  assert.equal(aas.ao_prima, 3);
  assert.equal(aas.value_prima, 2069397);
  assert.equal(aas.value_penjualan_tertagih, null);
  assert.equal(aas.target_volume_dulux, 2.15);

  const dian = parsed.monthly.find((m) => m.alias === "DIAN");
  assert.equal(dian.volume_dulux, 18.2965);
  assert.equal(dian.value_penjualan_tertagih, 5000000);
  assert.equal(dian.overdue_piutang, 700000);

  // VACANT dilewati.
  assert.ok(!parsed.monthly.some((m) => /VACANT/.test(m.alias)));
});

test("parseSalesMonthlyWorkbook mendeteksi format TRACKING SALES & fallback Target vs Achievement", () => {
  const trackingWb = {
    SheetNames: ["TRACKING SALES NOVEMBER 2026"],
    Sheets: {
      "TRACKING SALES NOVEMBER 2026": makeSheet([
        ["Area", "Sales", "Metric", "TARGET", "ACH"],
        ["KUNINGAN", "AAS", "TOP", 2.15, 0.111],
      ]),
    },
  };
  const tracking = parseSalesMonthlyWorkbook(trackingWb);
  assert.equal(tracking.sumber, "tracking");
  assert.equal(tracking.monthly[0].volume_dulux, 0.111);

  // Workbook bergaya Target vs Achievement: hanya ICI Daily yang tersedia.
  const iciHeader = new Array(30).fill("");
  iciHeader[0] = "SPV"; iciHeader[1] = "Area"; iciHeader[2] = "Sales Code"; iciHeader[3] = "Sales";
  iciHeader[4] = "TOP - in KL "; iciHeader[10] = "MID - in KL";
  const iciSub = new Array(30).fill("");
  [4, 10].forEach((b) => { iciSub[b] = "Target"; iciSub[b + 1] = "INV"; iciSub[b + 2] = "DO"; iciSub[b + 3] = "Total"; });
  const iciRow = new Array(30).fill("");
  iciRow[0] = "DAYAT"; iciRow[1] = "KUNINGAN"; iciRow[2] = "001B001"; iciRow[3] = "AAS";
  iciRow[4] = 2.15; iciRow[7] = 0.111;
  const tvaWb = {
    SheetNames: ["ICI Daily", "Prima Daily"],
    Sheets: {
      "ICI Daily": makeSheet([[""], [""], [""], iciHeader, iciSub, iciRow]),
      "Prima Daily": makeSheet([["", "", "", "", "2026-11-01 00:00:00"], ["SPV", "Area", "Sales Code", "Sales"]]),
    },
  };
  const tva = parseSalesMonthlyWorkbook(tvaWb);
  assert.equal(tva.sumber, "target_vs_achievement");
  assert.equal(tva.monthly.find((m) => m.alias === "AAS").volume_dulux, 0.111);
});

test("monthlyMergedAchievementValues tidak menimpa nilai AR dengan kolom kosong", () => {
  const arRow = { value_penjualan_tertagih: 5000000, overdue_piutang: 700000 };
  const volumeRow = {
    volume_dulux: 0.111, volume_catylac: 1.3318, volume_maxilite: 0, volume_aquashield: 0.0256,
    ao_ici: 14, ao_prima: 3, ao_dcota: 0, value_prima: 2069397, value_dcota: 0,
    value_penjualan_tertagih: null, overdue_piutang: null,
  };
  const merged = monthlyMergedAchievementValues(arRow, volumeRow);
  assert.equal(merged.target_volume_dulux, 0.111);
  assert.equal(merged.target_ao_ici, 14);
  assert.equal(merged.target_value_prima, 2069397);
  assert.equal(merged.target_value_penjualan, 5000000);
  assert.equal(merged.target_overdue_piutang, 700000);
});

test("resolveAliasInfo memetakan nama lengkap dari TRACKING SALES ke NIK", () => {
  const masterList = [
    { nik_karyawan: "1062503910", nama_karyawan: "AAS ASNAWI" },
    { nik_karyawan: "1092210890", nama_karyawan: "SAPUTRA HIDAYAT" },
    { nik_karyawan: "1012612890", nama_karyawan: "ZAENURUL IMAM" },
    { nik_karyawan: "1072505910", nama_karyawan: "RIESDIANTO" },
    { nik_karyawan: "109250781", nama_karyawan: "YEYET YULIATY" },
  ];
  const parsed = {
    monthly: [
      "AAS ASNAWI",
      "SAPUTRA HIDAYAT",
      "ZAENURUL IMAM",
      "RIESDIANTO",
      "YEYET YULIATY",
    ].map((alias) => ({
      alias, periode: "2026-11", volume_dulux: 1, volume_catylac: 0,
      volume_maxilite: 0, volume_aquashield: 0, total_volume_ici: 1,
      ao_ici: 1, ao_prima: 0, ao_dcota: 0, value_prima: 0, value_dcota: 0,
    })),
  };
  const result = buildSalesVolumeDocs(parsed, masterList, new Map());
  assert.equal(result.docs.length, 5);
  assert.deepEqual(result.unmapped, []);

  const byAlias = Object.fromEntries(result.docs.map((d) => [d.fields.alias, d.fields]));
  assert.equal(byAlias["SAPUTRA HIDAYAT"].nik_karyawan, "1092210890");
  assert.equal(byAlias["ZAENURUL IMAM"].nik_karyawan, "1012612890");
  assert.equal(byAlias["RIESDIANTO"].nik_karyawan, "1072505910");
  assert.equal(byAlias["AAS ASNAWI"].nama_karyawan, "AAS ASNAWI");
});

test("modal impor capaian sales dan tombol isi otomatis terpasang di view", () => {
  const source = read("js/views/penilaian-kontrak.js");
  assert.match(source, /openImportSalesAchievementModal/);
  assert.match(source, /btn-import-sales-achievement/);
  assert.match(source, /SALES_ACHIEVEMENT_IMPORT/);
  assert.match(source, /impa-tva/);
  assert.match(source, /parseSalesMonthlyWorkbook/);
  assert.match(source, /monthly-achievement-fill/);
  assert.match(source, /loadSalesAchievementMonthly/);
  assert.match(source, /loadSalesAchievementVolumeMonthly/);
  assert.match(source, /monthlyMergedAchievementValues/);
  assert.match(source, /btn-target-from-import/);
  // Isi otomatis harian (OH) sudah dihapus; pencapaian sales kini bulanan.
  assert.doesNotMatch(source, /btn-fill-from-import/);
  assert.doesNotMatch(source, /loadSalesAchievementDaily/);
});

test("koleksi capaian sales terdaftar di konfigurasi Firestore", () => {
  const source = read("js/firebase-config.js");
  assert.match(source, /SALES_ACHIEVEMENT_IMPORT: "sales_achievement_import"/);
});
