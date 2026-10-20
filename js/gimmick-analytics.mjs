/**
 * =====================================================================
 * GIMMICK-ANALYTICS.MJS — Logika stok, alokasi & efektivitas gimmick
 * =====================================================================
 * Bebas DOM/Firestore agar bisa diuji dan dipakai ulang oleh view.
 *
 * Model data:
 *  - master gimmick   : nama item, principle, stok awal, min stok
 *  - gimmick_stok     : alokasi ke SALES / SPV SALES / PRINCIPLE / AREA / GUDANG
 *  - gimmick_distribusi: penyerahan ke sales/SPV/principle lalu ke toko/customer
 *  - gimmick_efektivitas: evaluasi order & engagement toko setelah gimmick
 */

export const PENERIMA_TIPE = Object.freeze(["SALES", "SPV SALES", "PRINCIPLE", "TOKO / CUSTOMER"]);

export const ALOKASI_TIPE = Object.freeze(["SALES", "SPV SALES", "PRINCIPLE", "AREA", "GUDANG"]);

export const PRINCIPLES = Object.freeze(["ICI", "DCOTA", "PRIMA", "LAINNYA"]);

export const DISTRIBUSI_STATUSES = Object.freeze(["Draft", "Diserahkan", "Diterima", "Direalisasikan", "Dibatalkan"]);

/** Status distribusi yang dianggap sudah mengurangi stok alokasi. */
export const CONSUMED_STATUSES = Object.freeze(["Diserahkan", "Diterima", "Direalisasikan"]);

export const ENGAGEMENT_LEVELS = Object.freeze(["Tinggi", "Sedang", "Rendah"]);

export const EFFECTIVENESS_STATUSES = Object.freeze(["Efektif", "Cukup", "Tidak Efektif"]);

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function round2(value) {
  return Math.round(numeric(value) * 100) / 100;
}

export function allocationKey(itemName, tipe, nama) {
  return [norm(itemName), norm(tipe), norm(nama)].join("|");
}

/** Label lokasi stok yang ramah dibaca. */
export function allocationLabel(tipe, nama) {
  const t = String(tipe || "").toUpperCase();
  if (t === "AREA") return `Area ${nama || "-"}`;
  if (t === "GUDANG") return `Gudang ${nama || "Utama"}`;
  return `${tipe || "Alokasi"} - ${nama || "-"}`;
}

/**
 * Hitung sisa stok per baris alokasi setelah dikurangi distribusi.
 * Distribusi dicocokkan berdasarkan item + tipe/nama PEMBERI (pemegang
 * alokasi). Data lama tanpa field pemberi memakai penerima sebagai fallback.
 */
export function computeAllocationLedger(allocations = [], distributions = []) {
  const map = new Map();

  (Array.isArray(allocations) ? allocations : []).forEach(row => {
    const key = allocationKey(row.item_nama, row.alokasi_tipe, row.alokasi_nama);
    if (!map.has(key)) {
      map.set(key, {
        ...row,
        key,
        item_nama: String(row.item_nama || "").trim(),
        alokasi_tipe: String(row.alokasi_tipe || "").toUpperCase(),
        alokasi_nama: String(row.alokasi_nama || "").trim(),
        qty_alokasi: numeric(row.qty_alokasi ?? row.jumlah, 0),
        qty_terdistribusi: 0
      });
    } else {
      const current = map.get(key);
      current.qty_alokasi += numeric(row.qty_alokasi ?? row.jumlah, 0);
    }
  });

  (Array.isArray(distributions) ? distributions : []).forEach(dist => {
    if (!CONSUMED_STATUSES.includes(String(dist.status || "Diterima"))) return;
    // Distribusi mengurangi stok pihak PEMBERI (pemegang alokasi). Bila field
    // pemberi belum diisi (data lama), fallback ke penerima.
    const holderTipe = dist.pemberi_tipe || dist.penerima_tipe;
    const holderNama = dist.pemberi_nama || dist.penerima_nama;
    const key = allocationKey(dist.item_nama, holderTipe, holderNama);
    const qty = numeric(dist.qty, 0);
    if (!map.has(key)) {
      map.set(key, {
        id: `virtual_${key}`,
        key,
        item_nama: String(dist.item_nama || "").trim(),
        alokasi_tipe: String(holderTipe || "").toUpperCase(),
        alokasi_nama: String(holderNama || "").trim(),
        area: dist.area || "",
        qty_alokasi: 0,
        qty_terdistribusi: qty,
        virtual: true
      });
    } else {
      map.get(key).qty_terdistribusi += qty;
    }
  });

  return Array.from(map.values()).map(row => ({
    ...row,
    qty_sisa: row.qty_alokasi - row.qty_terdistribusi,
    over_allocated: row.qty_terdistribusi > row.qty_alokasi,
    label: allocationLabel(row.alokasi_tipe, row.alokasi_nama)
  })).sort((a, b) => a.item_nama.localeCompare(b.item_nama, "id") || a.label.localeCompare(b.label, "id"));
}

/** Stok per item gimmick: stok awal, dialokasikan, terdistribusi, sisa gudang. */
export function computeGimmickStock(master = [], ledger = []) {
  const rows = new Map();

  (Array.isArray(master) ? master : []).forEach(item => {
    const key = norm(item.nama_item || item.kode);
    rows.set(key, {
      id: item.id,
      kode: item.kode || item.id || "",
      nama_item: String(item.nama_item || "").trim(),
      principle: String(item.principle || "").toUpperCase(),
      kategori: item.kategori || "",
      satuan: item.satuan || "Pcs",
      stok_awal: numeric(item.stok_awal ?? item.stok_total ?? item.jumlah, 0),
      min_stok: numeric(item.min_stok, 0),
      allocated: 0,
      distributed: 0
    });
  });

  (Array.isArray(ledger) ? ledger : []).forEach(row => {
    const key = norm(row.item_nama);
    if (!rows.has(key)) {
      rows.set(key, {
        id: "",
        kode: "",
        nama_item: String(row.item_nama || "").trim(),
        principle: "",
        kategori: "",
        satuan: "Pcs",
        stok_awal: 0,
        min_stok: 0,
        allocated: 0,
        distributed: 0
      });
    }
    const target = rows.get(key);
    target.allocated += numeric(row.qty_alokasi, 0);
    target.distributed += numeric(row.qty_terdistribusi, 0);
  });

  return Array.from(rows.values()).map(row => {
    const stokGudang = row.stok_awal - row.allocated;
    const stokDiTangan = row.allocated - row.distributed;
    return {
      ...row,
      stok_gudang: stokGudang,
      stok_di_tangan: stokDiTangan,
      low_stock: row.min_stok > 0 && stokGudang <= row.min_stok,
      status_stok: stokGudang < 0
        ? "Over Alokasi"
        : (row.min_stok > 0 && stokGudang <= row.min_stok ? "Menipis" : "Aman")
    };
  }).sort((a, b) => a.nama_item.localeCompare(b.nama_item, "id"));
}

function upliftPercent(before, after) {
  if (before > 0) return ((after - before) / before) * 100;
  return after > 0 ? 100 : 0;
}

function engagementScore(level) {
  const value = String(level || "Sedang");
  if (value === "Tinggi") return 100;
  if (value === "Rendah") return 25;
  return 60;
}

/**
 * Hitung efektivitas satu catatan:
 * 50% pertumbuhan order, 30% pertumbuhan nilai order, 20% engagement toko.
 */
export function computeEffectiveness(row = {}) {
  const orderBefore = numeric(row.order_sebelum, 0);
  const orderAfter = numeric(row.order_sesudah, 0);
  const valueBefore = numeric(row.value_sebelum, 0);
  const valueAfter = numeric(row.value_sesudah, 0);

  const orderDelta = orderAfter - orderBefore;
  const valueDelta = valueAfter - valueBefore;
  const orderUpliftPct = round2(upliftPercent(orderBefore, orderAfter));
  const valueUpliftPct = round2(upliftPercent(valueBefore, valueAfter));

  const orderScore = clamp(50 + orderUpliftPct);
  const valueScore = clamp(50 + valueUpliftPct);
  const engScore = engagementScore(row.engagement);
  const score = Math.round(orderScore * 0.5 + valueScore * 0.3 + engScore * 0.2);

  const status = score >= 70 ? "Efektif" : score >= 45 ? "Cukup" : "Tidak Efektif";
  const tone = status === "Efektif" ? "green" : status === "Cukup" ? "amber" : "red";

  return {
    orderDelta,
    valueDelta,
    orderUpliftPct,
    valueUpliftPct,
    score,
    status,
    tone
  };
}

/** Ringkasan analisa efektivitas: rata-rata uplift, tingkat efektif, item/area terbaik. */
export function summarizeEffectiveness(rows = []) {
  const list = (Array.isArray(rows) ? rows : []).map(row => ({ ...row, ...computeEffectiveness(row) }));
  if (!list.length) {
    return {
      total: 0,
      averageScore: 0,
      effectiveRate: 0,
      averageOrderUplift: 0,
      averageValueUplift: 0,
      totalOrderDelta: 0,
      totalValueDelta: 0,
      effectiveCount: 0,
      bestItem: null,
      bestArea: null,
      rows: list
    };
  }

  const byItem = new Map();
  const byArea = new Map();
  let scoreSum = 0;
  let orderUpliftSum = 0;
  let valueUpliftSum = 0;
  let totalOrderDelta = 0;
  let totalValueDelta = 0;
  let effectiveCount = 0;

  list.forEach(row => {
    scoreSum += row.score;
    orderUpliftSum += row.orderUpliftPct;
    valueUpliftSum += row.valueUpliftPct;
    totalOrderDelta += row.orderDelta;
    totalValueDelta += row.valueDelta;
    if (row.status === "Efektif") effectiveCount += 1;

    const itemKey = norm(row.item_nama) || "-";
    const areaKey = norm(row.area) || "-";
    [byItem, byArea].forEach((store, index) => {
      const key = index === 0 ? itemKey : areaKey;
      if (!store.has(key)) store.set(key, { name: index === 0 ? row.item_nama : row.area, total: 0, score: 0 });
      const bucket = store.get(key);
      bucket.total += 1;
      bucket.score += row.score;
    });
  });

  const pickBest = store => {
    const sorted = Array.from(store.values())
      .filter(entry => entry.name)
      .map(entry => ({ name: entry.name, total: entry.total, averageScore: round2(entry.score / entry.total) }))
      .sort((a, b) => b.averageScore - a.averageScore || b.total - a.total);
    return sorted[0] || null;
  };

  const total = list.length;
  return {
    total,
    averageScore: round2(scoreSum / total),
    effectiveRate: round2((effectiveCount / total) * 100),
    averageOrderUplift: round2(orderUpliftSum / total),
    averageValueUplift: round2(valueUpliftSum / total),
    totalOrderDelta,
    totalValueDelta,
    effectiveCount,
    bestItem: pickBest(byItem),
    bestArea: pickBest(byArea),
    rows: list
  };
}

/** Gabungan ringkasan untuk dashboard gimmick. */
export function summarizeGimmick({ master = [], allocations = [], distributions = [], effectiveness = [] } = {}) {
  const ledger = computeAllocationLedger(allocations, distributions);
  const stock = computeGimmickStock(master, ledger);
  const effect = summarizeEffectiveness(effectiveness);
  const totalStokAwal = stock.reduce((sum, row) => sum + row.stok_awal, 0);
  const totalDialokasikan = stock.reduce((sum, row) => sum + row.allocated, 0);
  const totalTerdistribusi = stock.reduce((sum, row) => sum + row.distributed, 0);
  const lowStock = stock.filter(row => row.low_stock || row.status_stok === "Over Alokasi");
  const consumedQty = (Array.isArray(distributions) ? distributions : [])
    .filter(row => CONSUMED_STATUSES.includes(String(row.status || "Diterima")))
    .reduce((sum, row) => sum + numeric(row.qty, 0), 0);

  return {
    stock,
    ledger,
    effect,
    totals: {
      items: stock.length,
      stokAwal: totalStokAwal,
      dialokasikan: totalDialokasikan,
      terdistribusi: consumedQty || totalTerdistribusi,
      sisaGudang: totalStokAwal - totalDialokasikan,
      sisaDiTangan: totalDialokasikan - totalTerdistribusi,
      lowStock: lowStock.length
    },
    lowStock,
    byPrinciple: stock.reduce((acc, row) => {
      const key = row.principle || "LAINNYA";
      acc[key] = (acc[key] || 0) + row.stok_awal;
      return acc;
    }, {})
  };
}

/** Nomor tanda terima: TT-GMK/<YYYYMMDD>/<urut 3 digit>. */
export function buildReceiptNumber(dateValue, sequence = 1) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const stamp = [
    safe.getFullYear(),
    String(safe.getMonth() + 1).padStart(2, "0"),
    String(safe.getDate()).padStart(2, "0")
  ].join("");
  return `TT-GMK/${stamp}/${String(Math.max(1, Math.trunc(Number(sequence) || 1))).padStart(3, "0")}`;
}
