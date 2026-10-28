import test from "node:test";
import assert from "node:assert/strict";
import {
  itemMatchesSession, canFillItem, itemVisibleTo, computeAnalysisValue, analysisGrade,
  nextStatus, isValidTransition, summarizeItems, autoSopNumber, buildSopDocument,
  normalizeWorkSteps, normalizeCommunicationFlow, normalizeOutputs
} from "../js/sop-project.mjs";

const session = {
  nik: "KRY001",
  username: "budi",
  nama: "Budi Santoso",
  email: "budi@andela.co.id",
  divisi: "Gudang",
  posisi: "Admin Gudang",
  cabang: "CIREBON"
};

test("PIC langsung dikenali dari NIK, username, nama, atau email", () => {
  for (const key of ["pic_nik", "pic_username", "pic_nama", "pic_email"]) {
    const value = key === "pic_nik" ? "KRY001" : key === "pic_username" ? "budi" : key === "pic_nama" ? "Budi Santoso" : "budi@andela.co.id";
    assert.equal(itemMatchesSession(session, { [key]: value }), true, key);
  }
  assert.equal(itemMatchesSession(session, { pic_nama: "Orang Lain" }), false);
});

test("penugasan per divisi menghormati cabang", () => {
  assert.equal(itemMatchesSession(session, { penugasan_tipe: "DIVISI", divisi: "Gudang", cabang: "CIREBON" }), true);
  assert.equal(itemMatchesSession(session, { penugasan_tipe: "DIVISI", divisi: "Gudang", cabang: "MALANG" }), false);
  assert.equal(itemMatchesSession(session, { penugasan_tipe: "DIVISI", divisi: "Gudang", cabang: "SEMUA" }), true);
  assert.equal(itemMatchesSession(session, { penugasan_tipe: "DIVISI", divisi: "Keuangan", cabang: "CIREBON" }), false);
  assert.equal(itemMatchesSession(session, { penugasan_tipe: "DIVISI", divisi: "Semua Divisi", cabang: "CIREBON" }), true);
});

test("penugasan per jabatan dan akses HRD", () => {
  assert.equal(itemMatchesSession(session, { penugasan_tipe: "JABATAN", jabatan: "Admin Gudang", cabang: "CIREBON" }), true);
  assert.equal(itemMatchesSession(session, { penugasan_tipe: "JABATAN", jabatan: "Kasir", cabang: "CIREBON" }), false);
  assert.equal(canFillItem(session, { penugasan_tipe: "JABATAN", jabatan: "Kasir" }, { isHrd: true }), true);
});

test("item tersosialisasi/ditetapkan terlihat oleh semua karyawan", () => {
  assert.equal(itemVisibleTo(session, { status: "SOCIALIZED", pic_nama: "Lain" }), true);
  assert.equal(itemVisibleTo(session, { status: "ESTABLISHED", pic_nama: "Lain" }), true);
  assert.equal(itemVisibleTo(session, { status: "DRAFT", pic_nama: "Lain" }), false);
});

test("nilai analisa HRD 1-5 menjadi skala 0-100", () => {
  assert.equal(computeAnalysisValue(5, 5), 100);
  assert.equal(computeAnalysisValue(4, 4), 80);
  assert.equal(computeAnalysisValue(3, 4), 70);
  assert.equal(computeAnalysisValue(0, 4), 0);
  assert.equal(computeAnalysisValue(6, 5), 0);
  assert.equal(analysisGrade(80).grade, "B");
});

test("transisi status workflow valid", () => {
  assert.equal(nextStatus("DRAFT", "submit"), "SUBMITTED");
  assert.equal(nextStatus("REVISION", "submit"), "SUBMITTED");
  assert.equal(nextStatus("SUBMITTED", "verify"), "VERIFIED");
  assert.equal(nextStatus("SUBMITTED", "revise"), "REVISION");
  assert.equal(nextStatus("VERIFIED", "socialize"), "SOCIALIZED");
  assert.equal(nextStatus("SOCIALIZED", "establish"), "ESTABLISHED");
  assert.equal(isValidTransition("DRAFT", "establish"), false);
});

test("ringkasan item menghitung progres penetapan", () => {
  const summary = summarizeItems([
    { status: "DRAFT" }, { status: "SUBMITTED" }, { status: "REVISION" },
    { status: "VERIFIED" }, { status: "SOCIALIZED" }, { status: "ESTABLISHED" }, { status: "ESTABLISHED" }
  ]);
  assert.equal(summary.total, 7);
  assert.equal(summary.counts.ESTABLISHED, 2);
  assert.equal(summary.pendingVerification, 1);
  assert.equal(summary.needRevision, 1);
  assert.equal(summary.progress, 29);
});

test("nomor SOP otomatis mengikuti divisi dan urutan", () => {
  assert.equal(autoSopNumber({ divisi: "Gudang & Logistik", urut: 3, tahun: 2026 }), "SOP/GUDANG-LOGISTIK/2026/003");
});

test("normalisasi langkah, flow komunikasi, dan output", () => {
  const steps = normalizeWorkSteps([
    { aktivitas: "Terima barang", pelaksana: "Admin", output: "BAST", waktu: "10 menit" },
    { aktivitas: "" }
  ]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].aktivitas, "Terima barang");
  assert.equal(normalizeCommunicationFlow([{ dari: "Supplier", ke: "Gudang", media: "WA" }]).length, 1);
  assert.equal(normalizeOutputs([{ nama: "BAST", bentuk: "Dokumen" }]).length, 1);
});

test("buildSopDocument memetakan langkah menjadi flowchart & status aktif", () => {
  const document = buildSopDocument({
    id: "ITM1",
    project_id: "PRJ1",
    nama_proses: "Penerimaan Barang",
    divisi: "Gudang",
    tujuan: "Memastikan barang diterima sesuai PO",
    langkah: [
      { aktivitas: "Cek PO", pelaksana: "Admin", output: "PO" },
      { aktivitas: "Hitung fisik", pelaksana: "Admin", output: "Berita Acara" },
      { aktivitas: "Simpan stok", pelaksana: "Admin", output: "Kartu Stok" }
    ],
    flow_komunikasi: [{ dari: "Supplier", ke: "Admin Gudang", media: "Email", frekuensi: "Harian", tujuan: "Konfirmasi kiriman" }],
    output: [{ nama: "Berita Acara", bentuk: "Dokumen", penerima: "Finance" }]
  }, {
    nomor_dokumen: "SOP/GUDANG/2026/001",
    versi: "1.0",
    tanggal_terbit: "2026-11-01",
    penyetuju: "HRD"
  });

  assert.equal(document.status, "Aktif");
  assert.equal(document.nomor_dokumen, "SOP/GUDANG/2026/001");
  assert.equal(document.flowchart_steps.length, 3);
  assert.equal(document.flowchart_steps[0].category, "START");
  assert.equal(document.flowchart_steps[2].category, "END");
  assert.equal(document.flow_komunikasi.length, 1);
  assert.equal(document.output_proses.length, 1);
  assert.equal(document.sumber, "AUDIT_SOP");
});
