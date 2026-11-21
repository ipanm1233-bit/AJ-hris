import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_STATUS,
  REPORT_STATUS,
  FIELD_VISIT_REMINDER,
  addDays,
  buildVisitCsv,
  computeReportDeadline,
  daysBetween,
  effectiveReportStatus,
  nextDocumentNumber,
  parseStoreCsv,
  reminderTypeFor,
  summarizeFieldVisits,
  toDateOnly,
  validateVisitReport,
  validateVisitRequest,
  wibDateStr,
  wibTimeStr
} from "../js/kunjungan-lapangan.mjs";

const req = overrides => ({
  approval_status: APPROVAL_STATUS.APPROVED_FINAL,
  report_status: REPORT_STATUS.PENDING_REPORT,
  start_date: "2026-11-20",
  end_date: "2026-11-20",
  visit_type: "JOINT_VISIT",
  report_deadline_at: computeReportDeadline("2026-11-20"),
  ...overrides
});

test("KL-01 tanggal dan jam operasional dihitung dalam WIB", () => {
  const utc = new Date("2026-11-20T17:30:00Z"); // 21 Nov 00:30 WIB
  assert.equal(wibDateStr(utc), "2026-11-21");
  assert.equal(wibTimeStr(utc), "00:30");
  assert.equal(toDateOnly("2026-11-21T00:30:00+07:00"), "2026-11-21");
  assert.equal(addDays("2026-11-20", 1), "2026-11-21");
  assert.equal(daysBetween("2026-11-20", "2026-11-21"), 1);
});

test("KL-02 nomor dokumen KJN berurutan per tanggal", () => {
  const existing = ["KJN-20261121-001", "KJN-20261121-003"];
  assert.equal(nextDocumentNumber("2026-11-21", existing), "KJN-20261121-002");
  assert.equal(nextDocumentNumber("2026-11-22", existing), "KJN-20261122-001");
});

test("KL-03 deadline laporan H+1 pukul 10:00 WIB", () => {
  assert.equal(computeReportDeadline("2026-11-20"), "2026-11-21T10:00:00+07:00");
  assert.equal(computeReportDeadline(""), "");
  // 09:59 WIB belum terlambat, 10:00 WIB sudah melewati
  assert.equal(effectiveReportStatus(req(), new Date("2026-11-21T02:59:00Z")), REPORT_STATUS.PENDING_REPORT);
  assert.equal(effectiveReportStatus(req(), new Date("2026-11-21T03:00:01Z")), REPORT_STATUS.OVERDUE);
});

test("KL-04 validasi pengajuan menolak data tidak lengkap", () => {
  const base = {
    visit_type: "JOINT_VISIT",
    start_date: "2026-11-21",
    end_date: "2026-11-21",
    branch: "CIREBON",
    planned_sales_niks: ["S-01"],
    planned_store_ids: ["291625"],
    purpose_notes: "Audit toko jarang dikunjungi dan coaching sales."
  };
  assert.deepEqual(validateVisitRequest(base), []);
  const errors = validateVisitRequest({ ...base, start_date: "", end_date: "", planned_sales_niks: [], planned_store_ids: [] });
  assert.ok(validateVisitRequest({ ...base, visit_type: "" }).some(message => message.includes("Jenis kunjungan")));
  assert.ok(errors.some(message => message.includes("Tanggal mulai")));
  assert.ok(errors.some(message => message.includes("Tanggal selesai")));
  assert.ok(errors.some(message => message.includes("Sales")));
  assert.ok(errors.some(message => message.includes("toko")));
  // Audit lapangan oleh HRGA tidak wajib mendampingi sales.
  assert.deepEqual(validateVisitRequest({ ...base, visit_type: "AUDIT_LAPANGAN", planned_sales_niks: [] }), []);
});

test("KL-05 validasi laporan mewajibkan foto untuk toko terkunjungi", () => {
  const base = {
    executive_summary: "Kunjungan berjalan lancar.",
    items: [{
      store_id: "291625",
      sales_nik: "S-01",
      visit_outcome: "TERKUNJUNGI",
      findings_notes: "Display produk rapi.",
      photo_urls: ["https://drive.google.com/file/d/abc/view"]
    }]
  };
  assert.deepEqual(validateVisitReport(base), []);
  const errors = validateVisitReport({ ...base, items: [{ ...base.items[0], photo_urls: [], visit_outcome: "TIDAK_TERKUNJUNGI" }] });
  assert.ok(errors.some(message => message.includes("alasan")));
  assert.ok(!errors.some(message => message.includes("foto")));
  const photoErrors = validateVisitReport({ ...base, items: [{ ...base.items[0], photo_urls: [] }] });
  assert.ok(photoErrors.some(message => message.includes("foto")));
});

test("KL-06 pengingat mengikuti jadwal 16:00 dan 08:00 WIB", () => {
  // 20 Nov 16:00 WIB = 09:00 UTC
  assert.equal(reminderTypeFor(req(), new Date("2026-11-20T09:00:00Z")), FIELD_VISIT_REMINDER.EVENING);
  // 21 Nov 08:00 WIB = 01:00 UTC (H+1)
  assert.equal(reminderTypeFor(req(), new Date("2026-11-21T01:00:00Z")), FIELD_VISIT_REMINDER.MORNING);
  // 22 Nov 08:00 WIB = 01:00 UTC (H+2, overdue escalation)
  assert.equal(reminderTypeFor(req({ report_status: REPORT_STATUS.OVERDUE }), new Date("2026-11-22T01:00:00Z")), FIELD_VISIT_REMINDER.OVERDUE);
  // Sudah submit → berhenti
  assert.equal(reminderTypeFor(req({ report_status: REPORT_STATUS.SUBMITTED }), new Date("2026-11-22T01:00:00Z")), "");
});

test("KL-07 ringkasan dashboard menghitung SLA dan eskalasi", () => {
  const requests = [
    req({ document_number: "KJN-20261120-001" }),
    req({ document_number: "KJN-20261120-002", approval_status: APPROVAL_STATUS.PENDING_HRD }),
    req({ document_number: "KJN-20261120-003", approval_status: APPROVAL_STATUS.APPROVED_FINAL, report_status: REPORT_STATUS.SUBMITTED }),
    req({ document_number: "KJN-20261120-004", approval_status: APPROVAL_STATUS.APPROVED_FINAL, report_status: REPORT_STATUS.OVERDUE, report_deadline_at: computeReportDeadline("2026-11-18") })
  ];
  const reports = [
    { is_late: false, submitted_at: "2026-11-20T12:00:00Z" },
    { is_late: true, submitted_at: "2026-11-22T12:00:00Z" }
  ];
  const followups = [
    { action_type: "MANDIRI", status: "OPEN" },
    { action_type: "ESKALASI_MANAJEMEN", status: "IN_PROGRESS" },
    { action_type: "ESKALASI_MANAJEMEN", status: "DONE" }
  ];
  const summary = summarizeFieldVisits(requests, reports, followups, new Date("2026-11-22T03:00:00Z"));
  assert.equal(summary.total, 4);
  assert.equal(summary.pending_hrd, 1);
  assert.equal(summary.submitted, 1);
  assert.equal(summary.overdue, 2); // satu berstatus OVERDUE, satu PENDING_REPORT yang lewat deadline
  assert.equal(summary.on_time_rate, 50);
  assert.equal(summary.open_followups, 2);
  assert.equal(summary.escalation_open, 1);
});

test("KL-08 import CSV master toko menerima header Indonesia dan upsert kode", () => {
  const csv = `kode,nama,alamat,kota,cabang,nik_sales,status
291625,FERDY JAYA KERAMIK,"Jl. Contoh No. 1, RT 02",Cirebon,CIREBON,S-01,Aktif
291626,TOKO MAJU,Jl. Melati 5,Malang,MALANG,,Tidak Aktif`;
  const { rows, errors } = parseStoreCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].store_code, "291625");
  assert.equal(rows[0].address, "Jl. Contoh No. 1, RT 02");
  assert.equal(rows[0].branch, "CIREBON");
  assert.equal(rows[1].is_active, false);
});

test("KL-09 CSV rekap meng-escape nilai berisi koma", () => {
  const csv = buildVisitCsv([{
    document_number: "KJN-20261120-001",
    visit_type_label: "Joint Visit / Pendampingan Sales",
    start_date: "2026-11-20",
    end_date: "2026-11-20",
    branch: "CIREBON",
    nama_pemohon: "Andi",
    nik_pemohon: "A-001",
    approval_status_label: "Disetujui Final",
    report_status_label: "Selesai Dilaporkan",
    report_deadline_at: "2026-11-21T10:00:00+07:00",
    sales_label: "Sales A, Sales B",
    stores_label: "Toko 1",
    findings: "Display rapi, stok aman",
    followup_label: "Coaching",
    escalation_label: "-"
  }]);
  assert.match(csv, /"Sales A, Sales B"/);
  assert.match(csv, /"Display rapi, stok aman"/);
});

test("KL-10 laporan tidak relevan sebelum pengajuan disetujui final", () => {
  const pending = req({ approval_status: APPROVAL_STATUS.PENDING_HRD });
  assert.equal(effectiveReportStatus(pending, new Date("2026-11-22T03:00:00Z")), REPORT_STATUS.NOT_APPLICABLE);
  assert.equal(reminderTypeFor(pending, new Date("2026-11-20T09:00:00Z")), "");
});
