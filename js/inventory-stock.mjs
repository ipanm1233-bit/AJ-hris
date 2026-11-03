/**
 * Logika murni Stock Opname inventaris.
 *
 * Prinsip utama:
 * - Angka hasil cek fisik yang diinput admin adalah STOK BARU (absolute),
 *   bukan penambahan/pengurangan terhadap stok sistem.
 * - Selisih dihitung dari stok sistem sebelumnya agar riwayat opname tetap
 *   akurat, namun stok master selalu memakai angka fisik terbaru.
 */

const STOCK_EPSILON = 0.000001;

/** Ubah nilai stok apa pun menjadi angka >= 0, atau 0 bila tidak valid. */
export function toStockNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  let raw = String(value).trim();
  if (!raw) return 0;
  raw = raw.replace(/[^\d.,\-\s]/g, "").replace(/\s/g, "");
  if (!raw) return 0;
  // Titik yang diikuti tepat tiga digit dianggap pemisah ribuan.
  const cleaned = raw.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Validasi input stok fisik. Mengembalikan null bila kosong / bukan angka /
 * negatif, sehingga pemanggil bisa menampilkan pesan yang jelas.
 */
export function parsePhysicalStock(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  let raw = String(value).trim();
  if (!raw) return null;
  if (!/^[\d.,\-\s]+$/.test(raw)) return null;
  raw = raw.replace(/\s/g, "");
  const cleaned = raw.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Hitung stok sebelum, stok baru, dan selisih.
 * Stok baru selalu persis angka hasil cek fisik.
 */
export function computeStockOpname({ currentStock, physicalStock } = {}) {
  const stokSebelumnya = toStockNumber(currentStock);
  const stokBaru = parsePhysicalStock(physicalStock);
  if (stokBaru === null) {
    throw new Error("Jumlah stok fisik harus berupa angka valid (>= 0).");
  }
  let selisih = Math.round((stokBaru - stokSebelumnya) * 1000) / 1000;
  if (Math.abs(selisih) < STOCK_EPSILON) selisih = 0;
  const status = selisih === 0 ? "SESUAI" : selisih > 0 ? "LEBIH" : "KURANG";
  return { stokSebelumnya, stokBaru, selisih, status };
}

/** Label selisih dengan tanda + / - agar mudah dibaca di tabel. */
export function formatStockDiff(selisih) {
  const n = Number(selisih) || 0;
  if (n === 0) return "0";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("id-ID", { maximumFractionDigits: 3 })}`;
}

/** Payload update master inventaris: stok memakai hasil fisik terbaru. */
export function buildMasterStockUpdate({ physicalStock, date, condition } = {}) {
  const stokBaru = parsePhysicalStock(physicalStock);
  if (stokBaru === null) {
    throw new Error("Jumlah stok fisik harus berupa angka valid (>= 0).");
  }
  const update = { stok_saat_ini: stokBaru };
  if (date) update.terakhir_diaudit = date;
  if (condition) update.kondisi = condition;
  return update;
}

/** Susun satu baris log Stock Opname yang konsisten dengan master. */
export function buildStockOpnameRecord({
  asset = {},
  physicalStock,
  currentStock,
  date = "",
  officer = "",
  notes = "",
  condition = ""
} = {}) {
  const previous = currentStock !== undefined ? currentStock : asset.stok_saat_ini;
  const { stokSebelumnya, stokBaru, selisih } = computeStockOpname({
    currentStock: previous,
    physicalStock
  });
  const idBarang = String(asset.id_item || asset.id || asset.id_barang || "").trim();
  const namaBarang = String(asset.nama_barang || "").trim();
  const diffText = formatStockDiff(selisih);

  return {
    tanggal: date || "",
    nama_barang: namaBarang,
    id_barang: idBarang,
    jumlah_ambil: stokBaru,
    stok_sebelumnya: stokSebelumnya,
    selisih,
    stok_sesudah: stokBaru,
    kondisi: condition || asset.kondisi || "",
    nama_karyawan: officer || "",
    keperluan: notes || `Stock opname fisik: stok ${stokSebelumnya} → ${stokBaru} (selisih ${diffText}).`
  };
}
