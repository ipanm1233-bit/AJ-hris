import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeMermaidLabel, normalizeCategory, normalizeSteps, stepsFromText,
  resolveSteps, buildMermaidCode, buildSopNumber, formatSopNumber,
  isSopReviewDue, summarizeSops
} from "../js/sop-flowchart.mjs";

test("sanitizeMermaidLabel membersihkan karakter sintaks Mermaid", () => {
  assert.equal(
    sanitizeMermaidLabel('Halo "dunia" (tes) [x] {y}\\z'),
    "Halo dunia tes x y z"
  );
  assert.equal(sanitizeMermaidLabel("baris satu<br/>baris dua"), "baris satu baris dua");
  assert.equal(sanitizeMermaidLabel("x".repeat(200)).length, 160);
});

test("normalizeCategory menerima alias kategori", () => {
  assert.equal(normalizeCategory("keputusan"), "DECISION");
  assert.equal(normalizeCategory("document"), "DOKUMEN");
  assert.equal(normalizeCategory("mulai"), "START");
  assert.equal(normalizeCategory("selesai"), "END");
  assert.equal(normalizeCategory("apa saja"), "PROCESS");
});

test("normalizeSteps mengisi nilai default dan mempertahankan urutan", () => {
  const steps = normalizeSteps([{ title: "Langkah A" }, null, { category: "decision", nama_aktivitas: "Valid?" }]);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].id, "step_1");
  assert.equal(steps[0].nama_aktivitas, "Langkah A");
  assert.equal(steps[1].category, "DECISION");
});

test("stepsFromText menurunkan kategori START / DECISION / DOKUMEN / END", () => {
  const steps = stepsFromText([
    "1. Terima permohonan",
    "2. Apakah dokumen lengkap?",
    "3. Cetak laporan",
    "4. Arsipkan berkas"
  ].join("\n"), { divisi: "SALES", judul: "Permohonan Toko" });

  assert.equal(steps.length, 4);
  assert.equal(steps[0].category, "START");
  assert.match(steps[0].nama_aktivitas, /^Mulai:/);
  assert.equal(steps[1].category, "DECISION");
  assert.equal(steps[2].category, "DOKUMEN");
  assert.equal(steps[3].category, "END");
  assert.match(steps[3].nama_aktivitas, /^Selesai:/);
});

test("stepsFromText membuat alur default bila teks kosong", () => {
  const steps = stepsFromText("", { divisi: "HRD", judul: "Rekrutmen" });
  assert.ok(steps.length >= 5);
  assert.equal(steps[0].category, "START");
  assert.equal(steps[steps.length - 1].category, "END");
});

test("resolveSteps memprioritaskan flowchart_steps tersimpan", () => {
  const sop = {
    alur_proses: "Satu\nDua",
    flowchart_steps: [{ category: "START", nama_aktivitas: "Mulai custom" }]
  };
  const steps = resolveSteps(sop);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].nama_aktivitas, "Mulai custom");
});

test("buildMermaidCode menghasilkan node, percabangan, dan style", () => {
  const steps = normalizeSteps([
    { category: "START", nama_aktivitas: "Mulai" },
    { category: "DECISION", nama_aktivitas: "Disetujui?", decision_yes: "Ya", decision_no: "Tidak" },
    { category: "END", nama_aktivitas: "Selesai" }
  ]);
  const code = buildMermaidCode({ judul: 'SOP "Test"' }, steps);

  assert.match(code, /^flowchart TD/);
  assert.match(code, /N2\{"Disetujui\?"\}:::decisionStyle/);
  assert.match(code, /N2 -->\|"Ya"\| N3/);
  assert.match(code, /N2 -\.->\|"Tidak"\| N1/);
  assert.match(code, /classDef decisionStyle/);
  assert.doesNotMatch(code, /SOP "Test"/);
});

test("buildMermaidCode tetap menghasilkan diagram saat langkah kosong", () => {
  const code = buildMermaidCode("SOP Kosong", []);
  assert.match(code, /N1\(\["START: Mulai Prosedur"\]\)/);
  assert.match(code, /N1 --> N2 --> N3/);
});

test("nomor SOP mengikuti format SOP/DIVISI/TAHUN/URUT", () => {
  assert.equal(buildSopNumber("sales & marketing", "2026-05-01", 3), "SOP/SALES-MARKETING/2026/003");
  assert.equal(formatSopNumber({ divisi: "HRD", tanggal_terbit: "2026-01-10" }, 1), "SOP/HRD/2026/001");
  assert.equal(formatSopNumber({ nomor_dokumen: "SOP/HRD/2025/009" }), "SOP/HRD/2025/009");
});

test("isSopReviewDue mendeteksi review dalam 30 hari", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(isSopReviewDue({ tanggal_review: "2026-01-15" }, now), true);
  assert.equal(isSopReviewDue({ tanggal_review: "2025-12-20" }, now), true);
  assert.equal(isSopReviewDue({ tanggal_review: "2026-06-01" }, now), false);
  assert.equal(isSopReviewDue({}, now), false);
});

test("summarizeSops menghitung status dan review", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const summary = summarizeSops([
    { divisi: "HRD", status: "Aktif", tanggal_review: "2026-01-10" },
    { divisi: "HRD", status: "Draft" },
    { divisi: "SALES", status: "Obsolete" }
  ], now);

  assert.equal(summary.total, 3);
  assert.equal(summary.aktif, 1);
  assert.equal(summary.draft, 1);
  assert.equal(summary.obsolete, 1);
  assert.equal(summary.perluReview, 1);
  assert.equal(summary.byDivisi.HRD, 2);
  assert.equal(summary.byDivisi.SALES, 1);
});
