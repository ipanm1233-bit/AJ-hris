import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_TYPES,
  buildEmployeeContractPatch,
  contractTypeFromEmployeeStatus,
  isContractActive,
  isContractClosed,
  nextContractNumber,
  normalizeContractType,
  selectActiveContract,
  selectLatestContract,
  toDateOnly
} from "../js/contract-sync.mjs";

/* CS-01 ----------------------------------------------------------------- */
test("CS-01 jenis kontrak dinormalkan dari berbagai penulisan lama", () => {
  assert.equal(normalizeContractType("PKWTT"), CONTRACT_TYPES.PKWTT);
  assert.equal(normalizeContractType("Karyawan Tetap"), CONTRACT_TYPES.PKWTT);
  assert.equal(normalizeContractType("KONTRAK"), CONTRACT_TYPES.PKWT);
  assert.equal(normalizeContractType("pkwt"), CONTRACT_TYPES.PKWT);
  assert.equal(normalizeContractType("Masa Percobaan"), CONTRACT_TYPES.PROBATION);
  assert.equal(normalizeContractType("magang"), CONTRACT_TYPES.MAGANG);
  assert.equal(normalizeContractType("Buruh Harian"), CONTRACT_TYPES.BURUH_HARIAN);
  assert.equal(normalizeContractType("outsourcing"), CONTRACT_TYPES.OUTSOURCING);
  assert.equal(normalizeContractType("", CONTRACT_TYPES.PKWT), CONTRACT_TYPES.PKWT);
  assert.equal(normalizeContractType("entah", CONTRACT_TYPES.PKWT), CONTRACT_TYPES.LAINNYA);
});

/* CS-02 ----------------------------------------------------------------- */
test("CS-02 status karyawan lama menentukan jenis kontrak bawaan", () => {
  assert.equal(contractTypeFromEmployeeStatus("PKWTT"), CONTRACT_TYPES.PKWTT);
  assert.equal(contractTypeFromEmployeeStatus("KONTRAK"), CONTRACT_TYPES.PKWT);
  assert.equal(contractTypeFromEmployeeStatus(""), CONTRACT_TYPES.PKWT);
  assert.equal(contractTypeFromEmployeeStatus(null), CONTRACT_TYPES.PKWT);
});

/* CS-03 ----------------------------------------------------------------- */
test("CS-03 tanggal ISO dibaca tanpa pergeseran zona waktu", () => {
  assert.equal(toDateOnly("2027-01-31"), "2027-01-31");
  assert.equal(toDateOnly("2027-01-31T23:30:00.000Z"), "2027-01-31");
  assert.equal(toDateOnly(new Date("2027-02-01T00:00:00.000Z")), "2027-02-01");
  assert.equal(toDateOnly(""), "");
  assert.equal(toDateOnly("bukan tanggal"), "");
});

/* CS-04 ----------------------------------------------------------------- */
test("CS-04 kontrak yang sudah berakhir atau ditutup tidak aktif", () => {
  const today = "2027-06-30";
  assert.equal(isContractActive({ tanggal_mulai: "2027-01-01", tanggal_akhir: "2027-12-31" }, today), true);
  assert.equal(isContractActive({ tanggal_mulai: "2027-01-01", tanggal_akhir: "2027-06-29" }, today), false);
  assert.equal(isContractActive({ tanggal_mulai: "2027-07-01", tanggal_akhir: "2027-12-31" }, today), false);
  assert.equal(isContractActive({ tanggal_mulai: "2026-01-01", tanggal_akhir: "2026-12-31", status_kolom_kontrak: "DONE" }, today), false);
  assert.equal(isContractActive({ tanggal_mulai: "2026-01-01", status_kolom_kontrak: "DPERPANJANG" }, today), true);
  assert.equal(isContractActive({ tanggal_mulai: "2027-01-01", status_kolom_kontrak: "PKWTT" }, today), true);
  assert.equal(isContractClosed({ status_kolom_kontrak: "Tidak Diperpanjang" }), true);
  assert.equal(isContractClosed({ status_kolom_kontrak: "AKTIF" }), false);
});

/* CS-05 ----------------------------------------------------------------- */
test("CS-05 kontrak aktif dipilih dari tanggal mulai terbaru", () => {
  const contracts = [
    { id: "A", tanggal_mulai: "2025-01-01", tanggal_akhir: "2025-12-31", kontrak_ke: 1 },
    { id: "B", tanggal_mulai: "2026-01-01", tanggal_akhir: "2026-12-31", kontrak_ke: 2 },
    { id: "C", tanggal_mulai: "2027-01-01", tanggal_akhir: "2027-12-31", kontrak_ke: 3 }
  ];
  assert.equal(selectActiveContract(contracts, "2027-03-01").id, "C");
  assert.equal(selectActiveContract(contracts, "2026-03-01").id, "B");
  assert.equal(selectActiveContract(contracts, "2028-03-01"), null);
  assert.equal(selectLatestContract(contracts).id, "C");
});

/* CS-06 ----------------------------------------------------------------- */
test("CS-06 patch master memakai PKWT/PKWTT dari jenis kontrak, bukan label KONTRAK", () => {
  const pkwt = buildEmployeeContractPatch(
    { status_karyawan: "PKWT" },
    [{ tanggal_mulai: "2027-01-01", tanggal_akhir: "2027-12-31", jenis_kontrak: "PKWT", kontrak_ke: 2 }],
    { today: "2027-05-01" }
  );
  assert.equal(pkwt.patch.status_karyawan, "PKWT");
  assert.equal(pkwt.patch.aktif_tdk_aktif, "AKTIF");
  assert.equal(pkwt.patch.tgl_akhir_kontrak, "2027-12-31");
  assert.equal(pkwt.patch.kontrak_ke, 2);
  assert.equal(pkwt.expired, false);

  const pkwtt = buildEmployeeContractPatch(
    { status_karyawan: "PKWT" },
    [{ tanggal_mulai: "2027-01-01", jenis_kontrak: "PKWTT", kontrak_ke: 3 }],
    { today: "2027-05-01" }
  );
  assert.equal(pkwtt.patch.status_karyawan, "PKWTT");
  assert.equal(pkwtt.patch.aktif_tdk_aktif, "AKTIF");
  assert.equal(pkwtt.patch.tgl_akhir_kontrak, null);
});

/* CS-07 ----------------------------------------------------------------- */
test("CS-07 kontrak terakhir yang berakhir menonaktifkan karyawan non-PKWTT", () => {
  const result = buildEmployeeContractPatch(
    { status_karyawan: "PKWT" },
    [{ tanggal_mulai: "2026-01-01", tanggal_akhir: "2026-12-31", jenis_kontrak: "PKWT", kontrak_ke: 1 }],
    { today: "2027-01-15" }
  );
  assert.equal(result.patch.status_karyawan, "PKWT");
  assert.equal(result.patch.aktif_tdk_aktif, "TIDAK AKTIF");
  assert.equal(result.patch.tgl_akhir_kontrak, "2026-12-31");
  assert.equal(result.expired, true);

  const permanent = buildEmployeeContractPatch(
    { status_karyawan: "PKWTT" },
    [{ tanggal_mulai: "2020-01-01", tanggal_akhir: "2020-12-31", jenis_kontrak: "PKWTT", kontrak_ke: 1 }],
    { today: "2027-01-15" }
  );
  assert.equal(permanent.patch.aktif_tdk_aktif, "AKTIF", "PKWTT tidak boleh otomatis dinonaktifkan");
});

/* CS-08 ----------------------------------------------------------------- */
test("CS-08 tanpa kontrak, tanggal master dibersihkan tanpa mengubah status karyawan", () => {
  const result = buildEmployeeContractPatch({ status_karyawan: "PKWT" }, [], { today: "2027-05-01" });
  assert.equal(result.patch.tgl_mulai_kontrak, null);
  assert.equal(result.patch.tgl_akhir_kontrak, null);
  assert.equal(result.patch.kontrak_ke, null);
  assert.equal("status_karyawan" in result.patch, false);
  assert.equal("aktif_tdk_aktif" in result.patch, false);
  assert.equal(result.latestContract, null);
});

/* CS-09 ----------------------------------------------------------------- */
test("CS-09 nomor kontrak berikutnya mengikuti riwayat tertinggi", () => {
  assert.equal(nextContractNumber([]), 1);
  assert.equal(nextContractNumber([{ kontrak_ke: 2 }, { kontrak_ke: 5 }, {}]), 6);
  assert.equal(nextContractNumber(null), 1);
});
