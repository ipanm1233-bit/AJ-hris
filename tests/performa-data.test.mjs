import test from "node:test";
import assert from "node:assert/strict";
import {
  RENEWAL_WINDOW_DAYS,
  buildPerformaIndex,
  contractDaysLeft,
  contractUrgency,
  renewalQueue,
  summarizePerformaContracts
} from "../js/performa-data.mjs";

const TODAY = "2027-01-01";

const employees = [
  {
    id: "emp-1",
    nik_karyawan: "A-001",
    nama_karyawan: "Andi Kontrak",
    jabatan: "Sales",
    cabang: "Bandung",
    status_karyawan: "PKWT"
  },
  {
    id: "emp-2",
    nik_karyawan: "A-002",
    nama_karyawan: "Budi Tetap",
    jabatan: "Manager",
    cabang: "Jakarta",
    status_karyawan: "PKWTT"
  },
  {
    id: "emp-3",
    nik_karyawan: "A-003",
    nama_karyawan: "Citra Tanpa NIK Kontrak",
    jabatan: "Admin",
    cabang: "Bandung",
    status_karyawan: "KONTRAK"
  },
  {
    id: "emp-4",
    nik_karyawan: "A-004",
    nama_karyawan: "Dewi Habis",
    jabatan: "Kasir",
    cabang: "Bandung",
    status_karyawan: "PKWT"
  },
  {
    id: "emp-5",
    nik_karyawan: "A-005",
    nama_karyawan: "Eka Jauh",
    jabatan: "Staff",
    cabang: "Jakarta",
    status_karyawan: "PKWT"
  }
];

const contracts = [
  { id: "k-1", nik_karyawan: "A-001", nama_karyawan: "Andi Kontrak", jenis_kontrak: "PKWT", tanggal_mulai: "2026-02-01", tanggal_akhir: "2027-01-31", kontrak_ke: 1 },
  { id: "k-1b", nik_karyawan: "A-001", nama_karyawan: "Andi Kontrak", jenis_kontrak: "PKWT", tanggal_mulai: "2026-12-01", tanggal_akhir: "2027-03-01", kontrak_ke: 2 },
  { id: "k-2", nik_karyawan: "A-002", nama_karyawan: "Budi Tetap", jenis_kontrak: "PKWTT", tanggal_mulai: "2020-01-01", tanggal_akhir: "", kontrak_ke: 1 },
  { id: "k-3", nama_karyawan: "Citra Tanpa NIK Kontrak", jenis_kontrak: "PKWT", tanggal_mulai: "2026-04-01", tanggal_akhir: "2027-01-15", kontrak_ke: 1 },
  { id: "k-4", nik_karyawan: "A-004", nama_karyawan: "Dewi Habis", jenis_kontrak: "PKWT", tanggal_mulai: "2026-01-01", tanggal_akhir: "2026-12-31", kontrak_ke: 1 },
  { id: "k-5", nik_karyawan: "A-005", nama_karyawan: "Eka Jauh", jenis_kontrak: "PKWT", tanggal_mulai: "2026-06-01", tanggal_akhir: "2027-06-01", kontrak_ke: 1 }
];

const scorecards = [
  { id: "s-1", employee_nik: "A-001", employee_name: "Andi Kontrak", period_year: "2026", status: "APPROVED", final_score: 88, updated_at: "2026-12-01" },
  { id: "s-2", employee_nik: "A-001", employee_name: "Andi Kontrak", period_year: "2027", status: "DRAFT", updated_at: "2027-02-01", items: [] },
  { id: "s-3", employee_name: "Citra Tanpa NIK Kontrak", period_year: "2026", status: "APPROVED", final_score: 75, updated_at: "2026-11-01" }
];

test("PD-01 sisa hari kontrak dihitung dalam UTC tanpa pergeseran zona waktu", () => {
  assert.equal(contractDaysLeft("2027-01-31", TODAY), 30);
  assert.equal(contractDaysLeft("2026-12-31", TODAY), -1);
  assert.equal(contractDaysLeft("", TODAY), null);
  assert.equal(contractDaysLeft("bukan tanggal", TODAY), null);
});

test("PD-02 urgensi kontrak mengikuti ambang pipeline perpanjangan", () => {
  assert.equal(contractUrgency(-1), "KADALUARSA");
  assert.equal(contractUrgency(0), "KRITIS");
  assert.equal(contractUrgency(14), "KRITIS");
  assert.equal(contractUrgency(15), "WASPADA");
  assert.equal(contractUrgency(30), "WASPADA");
  assert.equal(contractUrgency(31), "PERSIAPAN");
  assert.equal(contractUrgency(45), "PERSIAPAN");
  assert.equal(contractUrgency(46), "AMAN");
  assert.equal(contractUrgency(null), "TANPA BATAS");
});

test("PD-03 satu karyawan memakai kontrak terbaru dan identitas yang sama", () => {
  const rows = buildPerformaIndex({ employees, contracts, scorecards, today: TODAY });
  const andi = rows.find(row => row.nik === "A-001");

  assert.equal(andi.key, "a-001");
  assert.equal(andi.employee_name, "Andi Kontrak");
  assert.equal(andi.contracts.length, 2);
  assert.equal(andi.kontrak.id, "k-1b");
  assert.equal(andi.contract_end, "2027-03-01");
  assert.equal(andi.days_left, 59);
  assert.equal(andi.urgency, "AMAN");
  assert.equal(andi.renewal_due, true);
  assert.equal(andi.is_permanent, false);
});

test("PD-04 PKWTT tidak pernah masuk antrean perpanjangan", () => {
  const rows = buildPerformaIndex({ employees, contracts, today: TODAY });
  const budi = rows.find(row => row.nik === "A-002");

  assert.equal(budi.is_permanent, true);
  assert.equal(budi.contract_end, "");
  assert.equal(budi.days_left, null);
  assert.equal(budi.renewal_due, false);
});

test("PD-05 kontrak tanpa NIK tetap tercocokkan lewat nama karyawan", () => {
  const rows = buildPerformaIndex({ employees, contracts, scorecards, today: TODAY });
  const citra = rows.find(row => row.nik === "A-003");

  assert.equal(citra.kontrak.id, "k-3");
  assert.equal(citra.days_left, 14);
  assert.equal(citra.urgency, "KRITIS");
  assert.equal(citra.renewal_due, true);
  assert.equal(citra.latest_scorecard.id, "s-3");
});

test("PD-06 kontrak kadaluarsa tetap masuk antrean perpanjangan", () => {
  const rows = buildPerformaIndex({ employees, contracts, today: TODAY });
  const dewi = rows.find(row => row.nik === "A-004");

  assert.equal(dewi.days_left, -1);
  assert.equal(dewi.urgency, "KADALUARSA");
  assert.equal(dewi.renewal_due, true);
});

test("PD-07 kontrak yang masih jauh tidak memicu penilaian perpanjangan", () => {
  const rows = buildPerformaIndex({ employees, contracts, today: TODAY });
  const eka = rows.find(row => row.nik === "A-005");

  assert.equal(eka.days_left, 151);
  assert.equal(eka.renewal_due, false);
  assert.equal(eka.is_contract, true);
});

test("PD-08 scorecard terbaru dipilih per karyawan", () => {
  const rows = buildPerformaIndex({ employees, contracts, scorecards, today: TODAY });
  const andi = rows.find(row => row.nik === "A-001");

  assert.equal(andi.scorecard_count, 2);
  assert.equal(andi.latest_scorecard.id, "s-2");
  assert.equal(andi.latest_scorecard.period_year, "2027");
});

test("PD-09 ringkasan kontrak menghitung status dan kelengkapan scorecard", () => {
  const rows = buildPerformaIndex({ employees, contracts, scorecards, today: TODAY });
  const summary = summarizePerformaContracts(rows);

  assert.equal(summary.total, 5);
  assert.equal(summary.permanent, 1);
  assert.equal(summary.contract, 4);
  assert.equal(summary.renewal_due, 3);
  assert.equal(summary.expired, 1);
  assert.equal(summary.with_scorecard, 2);
});

test("PD-10 antrean perpanjangan hanya berisi kontrak dalam jendela waktu", () => {
  const rows = buildPerformaIndex({ employees, contracts, today: TODAY });
  const queue = renewalQueue(rows);

  assert.deepEqual(queue.map(row => row.nik), ["A-004", "A-003", "A-001"]);
  assert.equal(queue.every(row => row.days_left <= RENEWAL_WINDOW_DAYS), true);
  assert.equal(queue.some(row => row.nik === "A-002"), false);
  assert.equal(queue.some(row => row.nik === "A-005"), false);
});

test("PD-11 jendela perpanjangan dapat diubah tanpa mengubah data sumber", () => {
  const rows = buildPerformaIndex({ employees, contracts, today: TODAY });
  const queue = renewalQueue(rows, { windowDays: 180 });

  assert.equal(queue.length, 5 - 1);
  assert.equal(queue.some(row => row.nik === "A-005"), true);
  assert.equal(rows.find(row => row.nik === "A-005").renewal_due, false);
});

test("PD-12 status karyawan PKWTT tanpa kontrak tetap dianggap tetap", () => {
  const rows = buildPerformaIndex({
    employees: [{ nik_karyawan: "B-001", nama_karyawan: "Tetap Tanpa Kontrak", status_karyawan: "Karyawan Tetap" }],
    contracts: [],
    today: TODAY
  });

  assert.equal(rows[0].is_permanent, true);
  assert.equal(rows[0].is_contract, false);
  assert.equal(rows[0].renewal_due, false);
});
