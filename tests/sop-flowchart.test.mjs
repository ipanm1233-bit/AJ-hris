import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sanitizeMermaidLabel, sanitizeMermaidId, normalizeCategory, normalizeSteps, stepsFromText,
  resolveSteps, buildMermaidCode, buildFlowchartSvg, buildSopNumber, formatSopNumber,
  isSopReviewDue, summarizeSops, SOP_STEP_CATEGORIES, SOP_STEP_CATEGORY_LABELS
} from "../js/sop-flowchart.mjs";

test("sanitizeMermaidLabel membersihkan karakter sintaks Mermaid", () => {
  assert.equal(
    sanitizeMermaidLabel('Halo "dunia" (tes) [x] {y}\\z'),
    "Halo dunia tes x y z"
  );
  assert.equal(sanitizeMermaidLabel("baris satu<br/>baris dua"), "baris satu baris dua");
  assert.equal(sanitizeMermaidLabel("Ya | Tidak <tag>"), "Ya Tidak tag");
  assert.equal(sanitizeMermaidLabel("x".repeat(200)).length, 160);
});

test("sanitizeMermaidId menghasilkan ID node yang aman", () => {
  assert.equal(sanitizeMermaidId("S01"), "S01");
  assert.equal(sanitizeMermaidId("S 01"), "S_01");
  assert.equal(sanitizeMermaidId("01"), "S_01");
  assert.equal(sanitizeMermaidId(""), "STEP");
  assert.equal(sanitizeMermaidId("tahap (awal)"), "tahap_awal");
});

test("normalizeCategory menerima alias kategori", () => {
  assert.equal(normalizeCategory("keputusan"), "DECISION");
  assert.equal(normalizeCategory("document"), "DOKUMEN");
  assert.equal(normalizeCategory("mulai"), "START");
  assert.equal(normalizeCategory("selesai"), "END");
  assert.equal(normalizeCategory("apa saja"), "PROCESS");
});

test("kategori langkah menyediakan START, PROSES, DECISION, DOKUMEN, END, dan LAINNYA", () => {
  for (const category of ["START", "PROCESS", "DECISION", "DOKUMEN", "END", "LAINNYA"]) {
    assert.ok(SOP_STEP_CATEGORIES.includes(category), `${category} harus tersedia`);
    assert.ok(SOP_STEP_CATEGORY_LABELS[category], `${category} harus punya label`);
  }
  assert.equal(normalizeCategory("lainnya"), "LAINNYA");
  assert.equal(normalizeCategory("other"), "LAINNYA");
  const code = buildMermaidCode("SOP Lainnya", normalizeSteps([
    { category: "LAINNYA", nama_aktivitas: "Langkah kategori lain" }
  ]));
  assert.match(code, /otherStyle/);
});

test("normalizeSteps mengisi nilai default dan mempertahankan urutan", () => {
  const steps = normalizeSteps([{ title: "Langkah A" }, null, { category: "decision", nama_aktivitas: "Valid?" }]);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].id, "step_1");
  assert.equal(steps[0].step_id, "S01");
  assert.equal(steps[0].nama_aktivitas, "Langkah A");
  assert.equal(steps[1].category, "DECISION");
  assert.equal(steps[1].step_id, "S02");
});

test("normalizeSteps menerima skema SOP Generator (Step_ID, Shape_Type, PIC, SLA, Next_Step)", () => {
  const steps = normalizeSteps([{
    Step_ID: "S07",
    Process_Name: "Verifikasi berkas",
    Activity_Detail: "Periksa kelengkapan dokumen",
    Shape_Type: "DOCUMENT",
    PIC: "Staf HRD",
    SLA: "1 hari kerja",
    Output_Document: "Form verifikasi",
    Next_Step_Yes: "S08",
    Next_Step_No: "S06",
    Label_Yes: "Lengkap",
    Label_No: "Kurang"
  }]);

  assert.equal(steps[0].step_id, "S07");
  assert.equal(steps[0].category, "DOKUMEN");
  assert.equal(steps[0].nama_aktivitas, "Verifikasi berkas");
  assert.equal(steps[0].detail_proses, "Periksa kelengkapan dokumen");
  assert.equal(steps[0].actor, "Staf HRD");
  assert.equal(steps[0].sla, "1 hari kerja");
  assert.equal(steps[0].output_document, "Form verifikasi");
  assert.equal(steps[0].next_step_yes, "S08");
  assert.equal(steps[0].next_step_no, "S06");
  assert.equal(steps[0].decision_yes, "Lengkap");
  assert.equal(steps[0].decision_no, "Kurang");
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
  assert.match(code, /S02\{"Disetujui\?"\}:::decisionStyle/);
  assert.match(code, /S01 --> S02/);
  assert.match(code, /S02 -->\|"Ya"\| S03/);
  assert.match(code, /S02 -\.->\|"Tidak"\| S01/);
  assert.match(code, /classDef decisionStyle/);
  assert.doesNotMatch(code, /SOP "Test"/);
});

test("buildMermaidCode memakai Step_ID dan tujuan percabangan eksplisit", () => {
  const steps = normalizeSteps([
    { Step_ID: "S01", Process_Name: "Mulai", Shape_Type: "START" },
    { Step_ID: "S02", Process_Name: "Lengkap?", Shape_Type: "DECISION", Next_Step_Yes: "S04", Next_Step_No: "S03", Label_Yes: "Lengkap", Label_No: "Revisi" },
    { Step_ID: "S03", Process_Name: "Perbaiki berkas", Shape_Type: "PROCESS", Next_Step_Yes: "S02" },
    { Step_ID: "S04", Process_Name: "Selesai", Shape_Type: "END" }
  ]);
  const code = buildMermaidCode("SOP Cabang", steps);

  assert.match(code, /S01\(\["START: Mulai"\]\)/);
  assert.match(code, /S02\{"Lengkap\?"\}:::decisionStyle/);
  assert.match(code, /S02 -->\|"Lengkap"\| S04/);
  assert.match(code, /S02 -\.->\|"Revisi"\| S03/);
  assert.match(code, /S03 --> S02/);
  assert.doesNotMatch(code, /S04 -->/);
});

test("buildMermaidCode tetap menghasilkan diagram saat langkah kosong", () => {
  const code = buildMermaidCode("SOP Kosong", []);
  assert.match(code, /N1\(\["START: Mulai Prosedur"\]\)/);
  assert.match(code, /N1 --> N2 --> N3/);
});

test("buildFlowchartSvg menghasilkan diagram SVG lokal tanpa layanan eksternal", () => {
  const svg = buildFlowchartSvg({ judul: "SOP & Uji" }, normalizeSteps([
    { category: "START", nama_aktivitas: "Mulai", actor: "Staf HRD" },
    { category: "DECISION", nama_aktivitas: "Apakah lengkap?", decision_yes: "Ya", decision_no: "Tidak" },
    { category: "DOKUMEN", nama_aktivitas: "Cetak formulir" },
    { category: "LAINNYA", nama_aktivitas: "Langkah khusus" },
    { category: "END", nama_aktivitas: "Selesai" }
  ]));

  assert.match(svg, /<svg[\s>]/);
  assert.match(svg, /SOP &amp; Uji/);
  assert.match(svg, /START - Mulai/);
  assert.match(svg, /DECISION - Keputusan/);
  assert.match(svg, /DOKUMEN - Dokumen/);
  assert.match(svg, /LAINNYA - Kategori lain/);
  assert.match(svg, /marker-end="url\(#sop-arrow\)"/);
  assert.match(svg, /S01 · START - Mulai/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /kroki/i);
});

test("editor langkah SOP menyediakan ID, detail, PIC, SLA, output, dan percabangan", () => {
  const source = readFileSync(new URL("../js/views/sop.js", import.meta.url), "utf8");
  for (const marker of [
    "data-step-id",
    "data-step-cat",
    "data-step-toggle",
    "data-step-detail",
    "data-step-actor",
    "data-step-sla",
    "data-step-output",
    "data-step-next-yes",
    "data-step-next-no",
    "data-step-yes-label",
    "data-step-no-label",
    "editorNextStepId",
    "openStepEditor(created",
    "flowchart_steps: updatedSteps",
    "ID langkah"
  ]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `editor harus memiliki ${marker}`);
  }
  assert.match(source, /normalizeCategory/);
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
