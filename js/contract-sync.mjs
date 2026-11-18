/**
 * Sinkronisasi data kontrak ke data master karyawan.
 *
 * Modul ini murni (tanpa DOM/Firestore) supaya aturan berikut dapat diuji:
 *  - PKWTT/PKWT diturunkan dari jenis kontrak, bukan selalu "KONTRAK".
 *  - Kontrak yang sudah berakhir tidak lagi dianggap aktif.
 *  - Tanggal, nomor kontrak, dan status karyawan di data master selalu
 *    mengikuti kontrak terbaru yang masih berlaku.
 */

export const CONTRACT_TYPES = Object.freeze({
  PKWTT: "PKWTT",
  PKWT: "PKWT",
  PROBATION: "PROBATION",
  MAGANG: "MAGANG",
  BURUH_HARIAN: "BURUH HARIAN",
  OUTSOURCING: "OUTSOURCING",
  LAINNYA: "LAINNYA"
});

export const CONTRACT_TYPE_OPTIONS = Object.freeze([
  { value: CONTRACT_TYPES.PKWT, label: "PKWT (Karyawan Kontrak)" },
  { value: CONTRACT_TYPES.PKWTT, label: "PKWTT (Karyawan Tetap)" },
  { value: CONTRACT_TYPES.PROBATION, label: "Probation (Masa Percobaan)" },
  { value: CONTRACT_TYPES.MAGANG, label: "Magang" },
  { value: CONTRACT_TYPES.BURUH_HARIAN, label: "Buruh Harian" },
  { value: CONTRACT_TYPES.OUTSOURCING, label: "Outsourcing" },
  { value: CONTRACT_TYPES.LAINNYA, label: "Lainnya" }
]);

const CLOSED_STATUS = new Set([
  "DONE",
  "SELESAI",
  "TIDAK DIPERPANJANG",
  "TIDAK DIPERPANJANG (PUTUS KONTRAK)",
  "DIBATALKAN",
  "BATAL",
  "ARSIP"
]);

/** Ubah nilai bebas (PKWTT, TETAP, KONTRAK, dsb.) menjadi jenis kontrak baku. */
export function normalizeContractType(value, fallback = CONTRACT_TYPES.PKWT) {
  const text = String(value ?? "").toUpperCase().trim();
  if (!text) return fallback;
  if (text.includes("PKWTT") || text.includes("TETAP")) return CONTRACT_TYPES.PKWTT;
  if (text.includes("PKWT") || text.includes("KONTRAK")) return CONTRACT_TYPES.PKWT;
  if (text.includes("PROBATION") || text.includes("PERCOBAAN")) return CONTRACT_TYPES.PROBATION;
  if (text.includes("MAGANG") || text.includes("INTERN")) return CONTRACT_TYPES.MAGANG;
  if (text.includes("BURUH") || text.includes("HARIAN")) return CONTRACT_TYPES.BURUH_HARIAN;
  if (text.includes("OUTSOURCING")) return CONTRACT_TYPES.OUTSOURCING;
  return CONTRACT_TYPES.LAINNYA;
}

/** Jenis kontrak bawaan dari status karyawan yang tersimpan di data master. */
export function contractTypeFromEmployeeStatus(status) {
  return normalizeContractType(status, CONTRACT_TYPES.PKWT);
}

export function isPermanentContractType(value) {
  return normalizeContractType(value) === CONTRACT_TYPES.PKWTT;
}

/** Ambil tanggal ISO (YYYY-MM-DD) tanpa pergeseran zona waktu. */
export function toDateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function todayOnly(today) {
  return toDateOnly(today || new Date());
}

export function isContractClosed(contract) {
  const status = String(contract?.status_kolom_kontrak || "").toUpperCase().trim();
  return CLOSED_STATUS.has(status);
}

export function contractTypeOf(contract, employee = {}) {
  return normalizeContractType(
    contract?.jenis_kontrak
      || contract?.status_kompail
      || contract?.status_kompilasi
      || contract?.status_kolom_kontrak,
    contractTypeFromEmployeeStatus(employee?.status_karyawan)
  );
}

/**
 * Kontrak dianggap aktif bila belum ditutup, sudah dimulai, dan (kecuali
 * PKWTT tanpa tanggal akhir) belum melewati tanggal akhir.
 */
export function isContractActive(contract, today = new Date()) {
  if (!contract || isContractClosed(contract)) return false;
  const date = todayOnly(today);
  const start = toDateOnly(contract.tanggal_mulai);
  if (start && start > date) return false;
  const type = contractTypeOf(contract);
  if (type === CONTRACT_TYPES.PKWTT && !contract.tanggal_akhir) return true;
  const end = toDateOnly(contract.tanggal_akhir);
  if (end && end < date) return false;
  return true;
}

function byStartDesc(a, b) {
  const dateCompare = toDateOnly(b.tanggal_mulai).localeCompare(toDateOnly(a.tanggal_mulai));
  if (dateCompare !== 0) return dateCompare;
  return (Number(b.kontrak_ke) || 0) - (Number(a.kontrak_ke) || 0);
}

export function selectActiveContract(contracts = [], today = new Date()) {
  const list = (Array.isArray(contracts) ? contracts : []).filter(Boolean);
  return list.filter(contract => isContractActive(contract, today)).sort(byStartDesc)[0] || null;
}

export function selectLatestContract(contracts = []) {
  const list = (Array.isArray(contracts) ? contracts : []).filter(Boolean);
  return [...list].sort((a, b) => {
    const endCompare = toDateOnly(b.tanggal_akhir).localeCompare(toDateOnly(a.tanggal_akhir));
    if (endCompare !== 0) return endCompare;
    return byStartDesc(a, b);
  })[0] || null;
}

/**
 * Hitung patch untuk dokumen master_karyawan berdasarkan seluruh kontrak
 * karyawan. Patch hanya berisi field kontrak sehingga aman dipakai dengan
 * `merge: true` dan tidak menimpa data lain.
 *
 * @returns {{ patch: object, activeContract: object|null, latestContract: object|null, expired: boolean }}
 */
export function buildEmployeeContractPatch(employee = {}, contracts = [], { today = new Date() } = {}) {
  const list = (Array.isArray(contracts) ? contracts : []).filter(Boolean);
  const activeContract = selectActiveContract(list, today);
  const latestContract = activeContract || selectLatestContract(list);

  if (!latestContract) {
    return {
      patch: { tgl_mulai_kontrak: null, tgl_akhir_kontrak: null, kontrak_ke: null },
      activeContract: null,
      latestContract: null,
      expired: false
    };
  }

  const type = contractTypeOf(latestContract, employee);
  // PKWTT adalah karyawan tetap: tanggal akhir lama (bila ada) tidak boleh
  // membuat sistem menonaktifkan karyawan secara otomatis.
  const permanent = type === CONTRACT_TYPES.PKWTT;
  const patch = {
    tgl_mulai_kontrak: toDateOnly(latestContract.tanggal_mulai) || null,
    tgl_akhir_kontrak: toDateOnly(latestContract.tanggal_akhir) || null,
    kontrak_ke: Number(latestContract.kontrak_ke) || 1,
    status_karyawan: type
  };

  if (activeContract) {
    patch.aktif_tdk_aktif = "AKTIF";
  } else if (permanent) {
    patch.aktif_tdk_aktif = "AKTIF";
  } else {
    // Kontrak non-permanen terakhir sudah lewat tanggal akhir atau ditutup.
    patch.aktif_tdk_aktif = "TIDAK AKTIF";
  }

  return {
    patch,
    activeContract,
    latestContract,
    expired: !activeContract && !permanent
  };
}

/** Nomor kontrak berikutnya berdasarkan riwayat yang ada. */
export function nextContractNumber(contracts = []) {
  const highest = (Array.isArray(contracts) ? contracts : [])
    .reduce((max, row) => Math.max(max, Number(row?.kontrak_ke) || 0), 0);
  return highest + 1;
}
