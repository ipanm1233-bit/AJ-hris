import test from "node:test";
import assert from "node:assert/strict";
import {
  allocationKey, allocationLabel, computeAllocationLedger, computeGimmickStock,
  computeEffectiveness, summarizeEffectiveness, summarizeGimmick, buildReceiptNumber
} from "../js/gimmick-analytics.mjs";

test("allocationKey dan allocationLabel konsisten", () => {
  assert.equal(allocationKey(" Gimmick A ", "sales", " Budi "), "gimmick a|sales|budi");
  assert.equal(allocationLabel("AREA", "Cirebon"), "Area Cirebon");
  assert.equal(allocationLabel("GUDANG", ""), "Gudang Utama");
  assert.equal(allocationLabel("SALES", "Budi"), "SALES - Budi");
});

test("computeAllocationLedger mengurangi stok pihak pemberi", () => {
  const ledger = computeAllocationLedger(
    [
      { item_nama: "Gimmick A", alokasi_tipe: "SALES", alokasi_nama: "Budi", qty_alokasi: 10 },
      { item_nama: "Gimmick A", alokasi_tipe: "SALES", alokasi_nama: "Budi", qty_alokasi: 5 }
    ],
    [
      { item_nama: "Gimmick A", qty: 4, pemberi_tipe: "SALES", pemberi_nama: "Budi", penerima_tipe: "TOKO / CUSTOMER", penerima_nama: "Toko A", status: "Diterima" },
      { item_nama: "Gimmick A", qty: 2, pemberi_tipe: "SALES", pemberi_nama: "Budi", status: "Dibatalkan" }
    ]
  );

  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].qty_alokasi, 15);
  assert.equal(ledger[0].qty_terdistribusi, 4);
  assert.equal(ledger[0].qty_sisa, 11);
  assert.equal(ledger[0].over_allocated, false);
});

test("computeAllocationLedger fallback ke penerima untuk data lama", () => {
  const ledger = computeAllocationLedger(
    [{ item_nama: "Gimmick B", alokasi_tipe: "SPV SALES", alokasi_nama: "Sari", qty_alokasi: 8 }],
    [{ item_nama: "Gimmick B", qty: 3, penerima_tipe: "SPV SALES", penerima_nama: "Sari", status: "Diterima" }]
  );

  assert.equal(ledger[0].qty_terdistribusi, 3);
  assert.equal(ledger[0].qty_sisa, 5);
});

test("computeAllocationLedger membuat baris virtual & menandai over alokasi", () => {
  const ledger = computeAllocationLedger(
    [],
    [{ item_nama: "Gimmick C", qty: 4, pemberi_tipe: "GUDANG", pemberi_nama: "Utama", status: "Diterima" }]
  );

  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].virtual, true);
  assert.equal(ledger[0].qty_alokasi, 0);
  assert.equal(ledger[0].qty_terdistribusi, 4);
  assert.equal(ledger[0].qty_sisa, -4);
  assert.equal(ledger[0].over_allocated, true);
});

test("computeGimmickStock menghitung sisa gudang dan status stok", () => {
  const stock = computeGimmickStock(
    [
      { nama_item: "Gimmick A", principle: "ICI", stok_awal: 10, min_stok: 2 },
      { nama_item: "Gimmick B", principle: "DCOTA", stok_awal: 5, min_stok: 0 }
    ],
    [
      { item_nama: "Gimmick A", alokasi_tipe: "SALES", alokasi_nama: "Budi", qty_alokasi: 10, qty_terdistribusi: 4 },
      { item_nama: "Gimmick B", alokasi_tipe: "AREA", alokasi_nama: "Cirebon", qty_alokasi: 7, qty_terdistribusi: 0 }
    ]
  );

  const a = stock.find(row => row.nama_item === "Gimmick A");
  const b = stock.find(row => row.nama_item === "Gimmick B");

  assert.equal(a.stok_gudang, 0);
  assert.equal(a.stok_di_tangan, 6);
  assert.equal(a.low_stock, true);
  assert.equal(a.status_stok, "Menipis");

  assert.equal(b.stok_gudang, -2);
  assert.equal(b.status_stok, "Over Alokasi");
  assert.equal(b.low_stock, false);
});

test("computeEffectiveness memberi skor sesuai bobot", () => {
  const naik = computeEffectiveness({
    order_sebelum: 10,
    order_sesudah: 15,
    value_sebelum: 1000000,
    value_sesudah: 1500000,
    engagement: "Tinggi"
  });
  assert.equal(naik.orderUpliftPct, 50);
  assert.equal(naik.valueUpliftPct, 50);
  assert.equal(naik.score, 100);
  assert.equal(naik.status, "Efektif");
  assert.equal(naik.tone, "green");

  const turun = computeEffectiveness({
    order_sebelum: 10,
    order_sesudah: 5,
    value_sebelum: 1000000,
    value_sesudah: 500000,
    engagement: "Rendah"
  });
  assert.equal(turun.orderDelta, -5);
  assert.equal(turun.orderUpliftPct, -50);
  assert.equal(turun.score, 5);
  assert.equal(turun.status, "Tidak Efektif");

  const tanpaData = computeEffectiveness({});
  assert.equal(tanpaData.score, 52);
  assert.equal(tanpaData.status, "Cukup");
});

test("summarizeEffectiveness merangkum item dan area terbaik", () => {
  const summary = summarizeEffectiveness([
    { item_nama: "Gimmick A", area: "Cirebon", order_sebelum: 10, order_sesudah: 20, value_sebelum: 100, value_sesudah: 200, engagement: "Tinggi" },
    { item_nama: "Gimmick A", area: "Kuningan", order_sebelum: 10, order_sesudah: 10, value_sebelum: 100, value_sesudah: 100, engagement: "Sedang" },
    { item_nama: "Gimmick B", area: "Cirebon", order_sebelum: 10, order_sesudah: 5, value_sebelum: 100, value_sesudah: 50, engagement: "Rendah" }
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.bestItem.name, "Gimmick A");
  assert.equal(summary.bestArea.name, "Cirebon");
  assert.ok(summary.averageScore > 0);
  assert.equal(summary.rows.length, 3);
  assert.equal(summarizeEffectiveness([]).total, 0);
});

test("summarizeGimmick menggabungkan stok, ledger, dan efektivitas", () => {
  const summary = summarizeGimmick({
    master: [{ nama_item: "Gimmick A", principle: "ICI", stok_awal: 20, min_stok: 1 }],
    allocations: [{ item_nama: "Gimmick A", alokasi_tipe: "SALES", alokasi_nama: "Budi", qty_alokasi: 12 }],
    distributions: [{ item_nama: "Gimmick A", qty: 5, pemberi_tipe: "SALES", pemberi_nama: "Budi", status: "Diterima" }],
    effectiveness: [{ item_nama: "Gimmick A", area: "Cirebon", order_sebelum: 10, order_sesudah: 15, engagement: "Tinggi" }]
  });

  assert.equal(summary.totals.items, 1);
  assert.equal(summary.totals.stokAwal, 20);
  assert.equal(summary.totals.dialokasikan, 12);
  assert.equal(summary.totals.terdistribusi, 5);
  assert.equal(summary.totals.sisaGudang, 8);
  assert.equal(summary.totals.sisaDiTangan, 7);
  assert.equal(summary.byPrinciple.ICI, 20);
  assert.equal(summary.effect.total, 1);
});

test("buildReceiptNumber memakai tanggal lokal dan urutan 3 digit", () => {
  assert.equal(buildReceiptNumber(new Date(2026, 9, 20), 3), "TT-GMK/20261020/003");
  assert.equal(buildReceiptNumber("2026-01-05T10:00:00", 0), "TT-GMK/20260105/001");
});
