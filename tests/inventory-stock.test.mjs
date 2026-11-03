import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parsePhysicalStock,
  computeStockOpname,
  buildMasterStockUpdate,
  buildStockOpnameRecord,
  formatStockDiff
} from "../js/inventory-stock.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("parsePhysicalStock menerima angka, desimal, dan pemisah ribuan", () => {
  assert.equal(parsePhysicalStock(12), 12);
  assert.equal(parsePhysicalStock("0"), 0);
  assert.equal(parsePhysicalStock("12.5"), 12.5);
  assert.equal(parsePhysicalStock("1.000"), 1000);
  assert.equal(parsePhysicalStock("1.000,5"), 1000.5);
});

test("parsePhysicalStock menolak kosong, negatif, dan teks", () => {
  assert.equal(parsePhysicalStock(""), null);
  assert.equal(parsePhysicalStock("   "), null);
  assert.equal(parsePhysicalStock(-1), null);
  assert.equal(parsePhysicalStock("-5"), null);
  assert.equal(parsePhysicalStock("dua belas"), null);
});

test("stok baru yang diinput menjadi stok akhir, bukan penambahan", () => {
  const kurang = computeStockOpname({ currentStock: 10, physicalStock: "8" });
  assert.deepEqual(kurang, { stokSebelumnya: 10, stokBaru: 8, selisih: -2, status: "KURANG" });

  const lebih = computeStockOpname({ currentStock: 10, physicalStock: "12" });
  assert.deepEqual(lebih, { stokSebelumnya: 10, stokBaru: 12, selisih: 2, status: "LEBIH" });

  const sesuai = computeStockOpname({ currentStock: 10, physicalStock: "10" });
  assert.deepEqual(sesuai, { stokSebelumnya: 10, stokBaru: 10, selisih: 0, status: "SESUAI" });
});

test("selisih nol tidak menyisakan pecahan floating point", () => {
  assert.equal(computeStockOpname({ currentStock: 0.3, physicalStock: "0.3" }).selisih, 0);
});

test("update master memakai angka fisik terbaru secara absolute", () => {
  const update = buildMasterStockUpdate({
    physicalStock: "7",
    date: "2026-11-03",
    condition: "Damaged (Rusak)"
  });
  assert.deepEqual(update, {
    stok_saat_ini: 7,
    terakhir_diaudit: "2026-11-03",
    kondisi: "Damaged (Rusak)"
  });
});

test("log opname mencatat stok sistem, stok baru, dan selisih", () => {
  const record = buildStockOpnameRecord({
    asset: { id_item: "INV-001", nama_barang: "Laptop", stok_saat_ini: 10, kondisi: "Good (Baik)" },
    physicalStock: "8",
    date: "2026-11-03",
    officer: "Petugas GA",
    notes: "Cek fisik gudang"
  });
  assert.equal(record.id_barang, "INV-001");
  assert.equal(record.nama_barang, "Laptop");
  assert.equal(record.stok_sebelumnya, 10);
  assert.equal(record.jumlah_ambil, 8);
  assert.equal(record.stok_sesudah, 8);
  assert.equal(record.selisih, -2);
  assert.equal(record.nama_karyawan, "Petugas GA");
  assert.equal(record.keperluan, "Cek fisik gudang");
});

test("label selisih memakai tanda + dan -", () => {
  assert.equal(formatStockDiff(3), "+3");
  assert.equal(formatStockDiff(-2), "-2");
  assert.equal(formatStockDiff(0), "0");
});

test("tab Stock Opname menyediakan input langsung dan sinkronisasi stok master", () => {
  const source = read("js/views/inventory.js");
  assert.match(source, /from "\.\.\/inventory-stock\.mjs"/);
  assert.match(source, /id="btn-input-opname"/);
  assert.match(source, /idFromField: "id_opname"/);
  assert.match(source, /beforeSave: async \(data, existing\)/);
  assert.match(source, /afterSave: async \(data, isNew, savedId, existing\)/);
  assert.match(source, /buildStockOpnameRecord\(/);
  assert.match(source, /buildMasterStockUpdate\(/);
  assert.match(source, /openStockOpnameInputModal\(container, activeEmpNames, session\)/);
  assert.match(source, /parsePhysicalStock\(qtyInput\.value\)/);
  assert.match(source, /computeStockOpname\(/);
  assert.match(source, /id="stock-real-diff-preview"/);
});

test("form opname memakai stok baru dan menghindari id_barang sebagai ID dokumen", () => {
  const source = read("js/views/inventory.js");
  assert.match(source, /label: "Jumlah Hasil Cek Fisik = Stok Baru"/);
  assert.match(source, /name: "id_barang", label: "ID \/ Kode Aset/);
  // id_barang tidak boleh dipakai sebagai ID dokumen stock_opname.
  assert.match(source, /idFromField: "id_opname"/);
});
