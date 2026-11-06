import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERIOD,
  normalizeNik,
  normalizePersonName,
  toDateKey,
  rowDateKey,
  periodLabel,
  recentPeriodOptions,
  isActiveEmployee,
  matchesEmployee,
  filterRowsByPeriod,
  findMonthlyTarget,
  overallAttainment,
  buildEmployeeDashboardData,
  buildDashboardRows,
  dashboardTotals,
  buildDisciplineTimeline,
  buildNotesTimeline
} from "../js/employee-achievement-dashboard.mjs";

const employee = {
  nik_karyawan: "A001",
  nama_karyawan: "AAS ASNAWI",
  jabatan: "Salesman",
  cabang: "Malang",
  divisi: "Sales",
  status_karyawan: "PKWTT (Karyawan Tetap)",
  aktif_tdk_aktif: "AKTIF",
  atasan: "Budi Santoso"
};

const otherEmployee = {
  nik_karyawan: "A002",
  nama_karyawan: "BUDI LAIN",
  jabatan: "Staff",
  cabang: "Malang",
  divisi: "Operasional",
  aktif_tdk_aktif: "AKTIF"
};

function makeSources() {
  return {
    dailyLogs: [
      { id: "L1", nik_karyawan: "A001", nama_karyawan: "AAS ASNAWI", tanggal: "2026-11-02", total_skor: 80, predikat: "Baik", catatan_harian: "Hadir tepat waktu", catatan_baik: "Proaktif", penilai: "HRD", kategori: "SALES" },
      { id: "L2", nama_karyawan: "AAS ASNAWI", tanggal: "2026-11-05", total_skor: 90, catatan_perbaikan: "Lengkapi laporan", kategori: "SALES" },
      { id: "L3", nik_karyawan: "A001", tanggal: "2026-11-07", total_skor: 70, catatan_harian: "" },
      { id: "L4", nik_karyawan: "A001", tanggal: "2026-10-30", total_skor: 60, catatan_harian: "Bulan lalu" },
      { id: "L5", nik_karyawan: "A002", tanggal: "2026-11-03", total_skor: 50, catatan_harian: "Karyawan lain" }
    ],
    targets: [
      {
        id: "T1", nik_karyawan: "A001", periode: "2026-10", kategori: "SALES",
        target_volume_dulux: 1, target_volume_catylac: 1, target_volume_maxilite: 1, target_volume_aquashield: 1,
        target_total_volume_ici: 4, target_value_penjualan: 500000, target_value_prima: 250000,
        target_value_dcota: 250000, target_overdue_piutang: 50000, target_ao_ici: 5,
        target_ao_prima: 3, target_ao_dcota: 2,
        capaian_bulanan: { nilai: {} }
      },
      {
        id: "T2", nik_karyawan: "A001", nama_karyawan: "AAS ASNAWI", periode: "2026-11", kategori: "SALES",
        target_volume_dulux: 2, target_volume_catylac: 1, target_volume_maxilite: 1, target_volume_aquashield: 1,
        target_value_penjualan: 1000000, target_value_prima: 500000, target_value_dcota: 500000,
        target_overdue_piutang: 100000, target_ao_ici: 10, target_ao_prima: 5, target_ao_dcota: 5,
        capaian_bulanan: {
          nilai: {
            target_volume_dulux: 1, target_volume_catylac: 1, target_volume_maxilite: 0.5,
            target_volume_aquashield: 0.5, target_value_penjualan: 800000, target_value_prima: 400000,
            target_value_dcota: 350000, target_overdue_piutang: 50000, target_ao_ici: 8,
            target_ao_prima: 4, target_ao_dcota: 4
          }
        }
      }
    ],
    reviews: [
      {
        nik: "A001", nama_karyawan: "AAS ASNAWI", periode: "Semester 2 2026", tanggal: "2026-11-10",
        skor_akhir: 88, grade: "A", kelebihan: "Disiplin", area_pengembangan: "Laporan",
        rekomendasi: "Pertahankan", sumber_bukti: "KPI & absensi"
      }
    ],
    kpiLogs: [
      { nik_dinilai: "A001", periode: "2026-11", tanggal: "2026-11-11", skor_akhir: 85, penilai: "Atasan", catatan_baik: "Kolaboratif" }
    ],
    spRows: [
      { nama_karyawan: "AAS ASNAWI", tanggal: "2026-11-04", tingkat_sp: "SP 1", pelanggaran: "Terlambat", pasal_pp: "Pasal 10", masa_berlaku: "2027-02-04" },
      { nama_karyawan: "AAS ASNAWI", tanggal: "2026-09-01", tingkat_sp: "Teguran Lisan", pelanggaran: "Lupa absen" }
    ],
    callRows: [
      { nama_karyawan: "AAS ASNAWI", tanggal_panggilan: "2026-11-06", perihal: "Klarifikasi absensi", status: "Hadir", waktu: "09:00" }
    ],
    cases: [
      { nama_karyawan: "AAS ASNAWI", case_number: "HRC-1", case_type: "Pembinaan Disiplin", category: "Keterlambatan", priority: "Tinggi", status: "Pemantauan", incident_date: "2026-11-03", description: "Terlambat 3 kali", action_taken: "Coaching", hr_assessment: { assessment_notes: "Perlu pemantauan" } },
      { nama_karyawan: "AAS ASNAWI", case_number: "HRC-2", case_type: "Konseling", category: "Motivasi", priority: "Sedang", status: "Selesai", incident_date: "2026-11-01", description: "Konseling rutin" },
      { nama_karyawan: "AAS ASNAWI", case_number: "HRC-3", case_type: "Konseling", category: "Lainnya", priority: "Rendah", status: "Selesai", incident_date: "2026-08-01", description: "Lama" }
    ],
    contractEvals: [
      { nik_karyawan: "A001", tgl_review_hrd: "2026-11-12", tgl_akhir_kontrak: "2026-12-31", tahap: "REVIEW_HRD", rekomendasi_hrd: "Perpanjang Kontrak 12 Bulan (1 Tahun)", catatan_hrd: "Kinerja baik" }
    ],
    pipPrograms: [
      { karyawan_nik: "A001", nama_karyawan: "AAS ASNAWI", nomor_perjanjian: "PIP/01", tanggal_mulai: "2026-11-01", durasi_bulan: 3, status: "AKTIF", catatan: "Pendampingan", sp_records: [{ level: 1 }] }
    ]
  };
}

test("normalizeNik dan normalizePersonName membersihkan identitas", () => {
  assert.equal(normalizeNik(" a-001 / 02 "), "A00102");
  assert.equal(normalizePersonName("  Aas   Asnawi, S.E. "), "AAS ASNAWI S E");
  assert.equal(normalizePersonName(null), "");
});

test("toDateKey membaca ISO, dd/mm/yyyy, Date, Firestore timestamp, dan serial Excel", () => {
  assert.equal(toDateKey("2026-11-05"), "2026-11-05");
  assert.equal(toDateKey("2026-11-05T10:30:00Z"), "2026-11-05");
  assert.equal(toDateKey("05/11/2026"), "2026-11-05");
  assert.equal(toDateKey(new Date(2026, 10, 5)), "2026-11-05");
  assert.equal(toDateKey({ seconds: 1793800000 }), "2026-11-04");
  assert.equal(toDateKey(46300), "2026-10-05");
  assert.equal(toDateKey("bukan tanggal"), "");
  assert.equal(rowDateKey({ tanggal: "", created_at: "2026-11-05T01:00:00Z" }, ["tanggal", "created_at"]), "2026-11-05");
});

test("periodLabel dan recentPeriodOptions konsisten", () => {
  assert.equal(periodLabel("2026-11"), "November 2026");
  assert.equal(periodLabel(ALL_PERIOD), "Semua Periode");
  const options = recentPeriodOptions(new Date(2026, 10, 15), 3);
  assert.deepEqual(options.map(item => item.value), ["2026-11", "2026-10", "2026-09"]);
});

test("isActiveEmployee menolak status nonaktif/resign", () => {
  assert.equal(isActiveEmployee({ aktif_tdk_aktif: "AKTIF" }), true);
  assert.equal(isActiveEmployee({ aktif_tdk_aktif: "NONAKTIF" }), false);
  assert.equal(isActiveEmployee({ status_karyawan: "Resign" }), false);
});

test("matchesEmployee memprioritaskan NIK dan fallback ke nama", () => {
  assert.equal(matchesEmployee({ nik_karyawan: "A001", nama_karyawan: "NAMA BEDA" }, employee), true);
  assert.equal(matchesEmployee({ nik_karyawan: "A999", nama_karyawan: "AAS ASNAWI" }, employee), false);
  assert.equal(matchesEmployee({ nama_karyawan: "AAS ASNAWI" }, employee), true);
  assert.equal(matchesEmployee({ nama_karyawan: "AAS ASNAWI, SE" }, employee), true);
  assert.equal(matchesEmployee({ nama_karyawan: "AAS" }, employee), false);
});

test("filterRowsByPeriod hanya menyertakan baris tanpa tanggal pada mode semua periode", () => {
  const rows = [{ tanggal: "2026-11-01" }, { tanggal: "2026-10-01" }, { created_at: "" }];
  assert.equal(filterRowsByPeriod(rows, ["tanggal", "created_at"], "2026-11").length, 1);
  assert.equal(filterRowsByPeriod(rows, ["tanggal", "created_at"], ALL_PERIOD).length, 3);
});

test("findMonthlyTarget memilih target periode terbaru", () => {
  const sources = makeSources();
  assert.equal(findMonthlyTarget(sources.targets, employee, "2026-11").id, "T2");
  assert.equal(findMonthlyTarget(sources.targets, employee, "2026-10").id, "T1");
  assert.equal(findMonthlyTarget(sources.targets, employee, ALL_PERIOD).id, "T2");
  assert.equal(findMonthlyTarget(sources.targets, employee, "2026-01"), null);
});

test("buildEmployeeDashboardData merangkum pencapaian dan seluruh catatan periode", () => {
  const sources = makeSources();
  const data = buildEmployeeDashboardData({ employee, period: "2026-11", sources });

  assert.equal(data.identity.nama, "AAS ASNAWI");
  assert.equal(data.summary.dailyCount, 3);
  assert.equal(data.summary.dailyAverage, 80);
  assert.equal(data.summary.latestDailyScore, 70);
  assert.equal(data.summary.reviewLatestScore, 88);
  assert.equal(data.summary.reviewLatestGrade, "A");
  assert.equal(data.summary.kpiLatestScore, 85);
  assert.equal(data.target.id, "T2");
  assert.equal(data.metrics.length, 12);
  assert.equal(data.overallAttainment, 72);
  assert.equal(data.dailyTrend.length, 3);
  assert.equal(data.summary.disciplineCount, 4);
  assert.equal(data.summary.spCount, 1);
  assert.equal(data.summary.callCount, 1);
  assert.equal(data.summary.caseCount, 2);
  assert.equal(data.summary.openCaseCount, 1);
  assert.equal(data.summary.noteCount, 6);
  assert.equal(data.discipline[0].date, "2026-11-06");
  assert.ok(data.notes.some(entry => entry.kind === "Review Kinerja"));
  assert.ok(data.notes.some(entry => entry.kind === "Evaluasi Kontrak"));
  assert.ok(data.notes.some(entry => entry.kind === "PIP"));
  assert.ok(data.notes.some(entry => entry.kind === "Penilaian KPI"));
});

test("buildEmployeeDashboardData mode semua periode memuat catatan lama", () => {
  const sources = makeSources();
  const data = buildEmployeeDashboardData({ employee, period: ALL_PERIOD, sources });
  assert.equal(data.summary.dailyCount, 4);
  assert.equal(data.summary.disciplineCount, 6);
  assert.equal(data.summary.openCaseCount, 1);
  assert.equal(data.summary.noteCount, 7);
  assert.equal(data.target.id, "T2");
});

test("timeline disiplin dan catatan mengurutkan tanggal terbaru lebih dulu", () => {
  const sources = makeSources();
  const discipline = buildDisciplineTimeline({
    employee,
    period: "2026-11",
    spRows: sources.spRows,
    callRows: sources.callRows,
    cases: sources.cases
  });
  assert.deepEqual(discipline.map(entry => entry.date), ["2026-11-06", "2026-11-04", "2026-11-03", "2026-11-01"]);

  const notes = buildNotesTimeline({
    employee,
    period: "2026-11",
    dailyLogs: sources.dailyLogs,
    reviews: sources.reviews,
    contractEvals: sources.contractEvals,
    pipPrograms: sources.pipPrograms,
    kpiLogs: sources.kpiLogs
  });
  const dates = notes.map(entry => entry.date);
  assert.deepEqual(dates, dates.slice().sort().reverse());
});

test("buildNotesTimeline memuat instruksi tugas KPI 360 dan catatan realisasi bulanan", () => {
  const sources = makeSources();
  sources.kpiTasks = [{
    nik_dinilai: "A001", periode: "2026-11", tanggal_diselesaikan: "2026-11-13",
    tipe_relasi: "Atasan", nama_penilai: "Budi Santoso", skor_akhir: 90,
    catatan_hrd: "Fokus kedisiplinan", catatan_penilai: "Baik", status: "DONE"
  }];
  sources.targets[1].capaian_bulanan.catatan = "Realisasi dari impor";
  sources.targets[1].capaian_bulanan.dicatat_oleh = "HRD";
  sources.targets[1].capaian_bulanan.dicatat_pada = "2026-11-15T08:00:00Z";

  const data = buildEmployeeDashboardData({ employee, period: "2026-11", sources });
  assert.equal(data.summary.kpiTaskCount, 1);
  assert.equal(data.summary.noteCount, 8);
  assert.ok(data.notes.some(entry => entry.kind === "Tugas KPI 360" && entry.detail.includes("Instruksi HRD")));
  assert.ok(data.notes.some(entry => entry.kind === "Realisasi Bulanan" && entry.detail === "Realisasi dari impor"));
});

test("buildDashboardRows membangun baris untuk semua karyawan dan dashboardTotals menjumlahkan", () => {
  const sources = makeSources();
  const rows = buildDashboardRows({ employees: [employee, otherEmployee], period: "2026-11", sources });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.identity.nama), ["AAS ASNAWI", "BUDI LAIN"]);

  const totals = dashboardTotals(rows);
  assert.equal(totals.employees, 2);
  assert.equal(totals.assessed, 2);
  assert.equal(totals.discipline, 4);
  assert.equal(totals.openCases, 1);
  assert.equal(totals.notes, 7);
  assert.equal(totals.averageDaily, 65);
});

test("overallAttainment mengabaikan metrik turunan dan overdue", () => {
  const value = overallAttainment([
    { attainment: 80, derived: false, lowerIsBetter: false },
    { attainment: 20, derived: true, lowerIsBetter: false },
    { attainment: 50, derived: false, lowerIsBetter: true },
    { attainment: 100, derived: false, lowerIsBetter: false }
  ]);
  assert.equal(value, 90);
  assert.equal(overallAttainment([]), null);
});
