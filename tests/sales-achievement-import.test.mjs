import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ohBrandFamily,
  ACH_VOLUME_KEYS,
  parseOhAchievementWorkbook,
  parseArAchievementWorkbook,
  buildSalesAchievementDocs,
  dailyAchievementValuesFromRow,
  monthlyAchievementValuesFromRow
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
  assert.equal(monthly.target_value_prima, 20);
  assert.equal(monthly.target_value_dcota, 30);
  assert.equal(monthly.target_overdue_piutang, 40);
});

test("modal impor capaian sales dan tombol isi otomatis terpasang di view", () => {
  const source = read("js/views/penilaian-kontrak.js");
  assert.match(source, /openImportSalesAchievementModal/);
  assert.match(source, /btn-import-sales-achievement/);
  assert.match(source, /SALES_ACHIEVEMENT_IMPORT/);
  assert.match(source, /btn-fill-from-import/);
  assert.match(source, /monthly-achievement-fill/);
  assert.match(source, /loadSalesAchievementDaily/);
  assert.match(source, /loadSalesAchievementMonthly/);
  assert.match(source, /dailyAchievementValuesFromRow/);
  assert.match(source, /monthlyAchievementValuesFromRow/);
});

test("koleksi capaian sales terdaftar di konfigurasi Firestore", () => {
  const source = read("js/firebase-config.js");
  assert.match(source, /SALES_ACHIEVEMENT_IMPORT: "sales_achievement_import"/);
});
