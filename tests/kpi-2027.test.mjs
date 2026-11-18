import test from "node:test";
import assert from "node:assert/strict";
import {
  KPI_2027_VERSION,
  KPI_DIRECTIONS,
  KPI_ITEM_STATUS,
  KPI_MASTER_SEED,
  KPI_SCORECARD_TEMPLATES_SEED,
  MAX_INDICATOR_SCORE,
  aggregateBranchResults,
  buildScorecardFromTemplate,
  calculateScorecard,
  getProposedRating,
  normalizeDirection,
  resolveTemplateForEmployee,
  scoreIndicator,
  summarizeScorecard,
  validateScorecardForApproval,
  validateWeights
} from "../js/kpi-2027.mjs";

const item = (overrides = {}) => ({
  kpi_code: "T-01",
  kpi_name: "Uji",
  weight_percent: 100,
  target_value: 100,
  actual_value: 100,
  measurement_direction: KPI_DIRECTIONS.HIGHER_BETTER,
  evidence_reference: "Laporan uji",
  ...overrides
});

/* T-01 ------------------------------------------------------------------ */
test("T-01 validasi bobot menerima total 100% dan menolak selisih", () => {
  assert.equal(validateWeights([{ weight_percent: 40 }, { weight_percent: 60 }]).valid, true);
  assert.equal(validateWeights([{ weight_percent: 50 }, { weight_percent: 40 }]).valid, false);
  assert.equal(validateWeights([]).valid, false);
  assert.equal(validateWeights([{ weight_percent: -10 }, { weight_percent: 110 }]).valid, false);
  assert.equal(validateWeights([{ weight_percent: 99.999 }]).valid, true, "toleransi pembulatan 0,01");
});

/* T-02 ------------------------------------------------------------------ */
test("T-02 formula HIGHER_BETTER memakai aktual dibagi target", () => {
  const result = scoreIndicator({ target_value: 200, actual_value: 150, direction: "HIGHER_BETTER" });
  assert.equal(result.status, KPI_ITEM_STATUS.SCORED);
  assert.equal(result.score, 75);
  assert.equal(result.capped, false);
});

/* T-03 ------------------------------------------------------------------ */
test("T-03 formula LOWER_BETTER dibalik dan dibatasi skor maksimum 120", () => {
  const result = scoreIndicator({ target_value: 100, actual_value: 80, direction: "LOWER_BETTER" });
  assert.equal(result.score, 120);
  assert.equal(result.raw_score, 125);
  assert.equal(result.capped, true);
  assert.equal(result.cap_score, MAX_INDICATOR_SCORE);
});

/* T-04 ------------------------------------------------------------------ */
test("T-04 formula BINARY hanya mengenal terpenuhi/tidak terpenuhi", () => {
  assert.equal(scoreIndicator({ target_value: 1, actual_value: 1, direction: "BINARY" }).score, 100);
  assert.equal(scoreIndicator({ target_value: 1, actual_value: 0, direction: "BINARY" }).score, 0);
});

/* T-05 ------------------------------------------------------------------ */
test("T-05 formula MILESTONE dan RATIO_TO_BUDGET dihitung proporsional", () => {
  assert.equal(scoreIndicator({ target_value: 4, actual_value: 3, direction: "MILESTONE" }).score, 75);
  assert.equal(scoreIndicator({ target_value: 100, actual_value: 110, direction: "RATIO_TO_BUDGET" }).score, 110);
});

/* T-06 ------------------------------------------------------------------ */
test("T-06 data aktual atau target kosong selalu PENDING, bukan nol", () => {
  const noActual = scoreIndicator({ target_value: 100, actual_value: "" });
  assert.equal(noActual.status, KPI_ITEM_STATUS.PENDING);
  assert.equal(noActual.score, null);

  const noTarget = scoreIndicator({ target_value: null, actual_value: 10 });
  assert.equal(noTarget.status, KPI_ITEM_STATUS.PENDING);
  assert.equal(noTarget.score, null);
});

/* T-07 ------------------------------------------------------------------ */
test("T-07 target nol membutuhkan aturan khusus sebelum dinilai", () => {
  const pending = scoreIndicator({ target_value: 0, actual_value: 10 });
  assert.equal(pending.status, KPI_ITEM_STATUS.PENDING);
  assert.equal(pending.needs_rule, true);

  const scored = scoreIndicator({ target_value: 0, actual_value: 10, zero_target_score: 100 });
  assert.equal(scored.status, KPI_ITEM_STATUS.SCORED);
  assert.equal(scored.score, 100);
});

/* T-08 ------------------------------------------------------------------ */
test("T-08 aktual nol pada lower-is-better butuh aturan, bukan pembagian", () => {
  const pending = scoreIndicator({ target_value: 0.2, actual_value: 0, direction: "LOWER_BETTER" });
  assert.equal(pending.status, KPI_ITEM_STATUS.PENDING);
  assert.equal(pending.needs_rule, true);

  const scored = scoreIndicator({
    target_value: 0.2,
    actual_value: 0,
    direction: "LOWER_BETTER",
    zero_actual_score: 120
  });
  assert.equal(scored.status, KPI_ITEM_STATUS.SCORED);
  assert.equal(scored.score, 120);
});

/* T-09 ------------------------------------------------------------------ */
test("T-09 nilai negatif dan arah tidak dikenal ditangani aman", () => {
  assert.equal(scoreIndicator({ target_value: -1, actual_value: 5 }).status, KPI_ITEM_STATUS.INVALID);
  assert.equal(normalizeDirection("lower is better"), KPI_DIRECTIONS.LOWER_BETTER);
  assert.equal(normalizeDirection("tidak dikenal"), KPI_DIRECTIONS.HIGHER_BETTER);
  assert.equal(normalizeDirection(""), KPI_DIRECTIONS.HIGHER_BETTER);
});

/* T-10 ------------------------------------------------------------------ */
test("T-10 scorecard tidak final saat masih ada indikator PENDING", () => {
  const items = [
    item({ kpi_code: "A", weight_percent: 50, target_value: 100, actual_value: 100 }),
    item({ kpi_code: "B", weight_percent: 50, target_value: 100, actual_value: null })
  ];
  const result = calculateScorecard(items);
  assert.equal(result.status, KPI_ITEM_STATUS.PENDING);
  assert.equal(result.final_score, null);
  assert.equal(result.provisional, true);
  assert.equal(result.provisional_score, 100);
  assert.equal(result.pending_items.length, 1);
});

/* T-11 ------------------------------------------------------------------ */
test("T-11 scorecard lengkap menghitung nilai akhir dan predikat usulan", () => {
  const items = [
    item({ kpi_code: "A", weight_percent: 50, target_value: 100, actual_value: 120 }),
    item({ kpi_code: "B", weight_percent: 50, target_value: 100, actual_value: 80 })
  ];
  const result = calculateScorecard(items);
  assert.equal(result.status, "SCORED");
  assert.equal(result.final_score, 100);
  assert.equal(result.provisional, false);
  assert.equal(result.rating.label, "Baik");

  assert.equal(getProposedRating(112).label, "Sangat Baik");
  assert.equal(getProposedRating(95).label, "Cukup");
  assert.equal(getProposedRating(80).label, "Perlu Perbaikan");
  assert.equal(getProposedRating(null).label, "PENDING");
});

/* T-12 ------------------------------------------------------------------ */
test("T-12 pengesahan ditolak tanpa bukti, bobot valid, atau saat LOCKED", () => {
  const base = [
    item({ kpi_code: "A", weight_percent: 60, target_value: 100, actual_value: 100, evidence_reference: "Bukti A" }),
    item({ kpi_code: "B", weight_percent: 40, target_value: 100, actual_value: 90, evidence_reference: "Bukti B" })
  ];
  assert.equal(validateScorecardForApproval({ items: base }).valid, true);

  const noEvidence = validateScorecardForApproval({
    items: [base[0], { ...base[1], evidence_reference: "" }]
  });
  assert.equal(noEvidence.valid, false);
  assert.ok(noEvidence.errors.some(message => message.includes("bukti")));

  const weightBroken = validateScorecardForApproval({
    items: [{ ...base[0], weight_percent: 50 }, base[1]]
  });
  assert.equal(weightBroken.valid, false);

  const locked = validateScorecardForApproval({ items: base, status: "LOCKED" });
  assert.equal(locked.valid, false);
  assert.ok(locked.errors.some(message => message.includes("LOCKED")));
});

/* T-13 ------------------------------------------------------------------ */
test("T-13 agregasi cabang memakai bobot target, bukan rata-rata sederhana", () => {
  const result = aggregateBranchResults([
    { branch: "Cirebon", target: 900, actual: 810 },
    { branch: "Malang", target: 100, actual: 50 },
    { branch: "Kosong", target: null, actual: 10 }
  ]);
  assert.equal(result.target, 1000);
  assert.equal(result.actual, 860);
  assert.equal(result.score, 86);
  assert.equal(result.branches.length, 2);
  assert.equal(aggregateBranchResults([]).status, KPI_ITEM_STATUS.PENDING);
});

/* T-14 ------------------------------------------------------------------ */
test("T-14 pemilihan template mengikuti jabatan dan cabang", () => {
  const templates = KPI_SCORECARD_TEMPLATES_SEED;
  assert.equal(resolveTemplateForEmployee({ jabatan: "General Manager" }, templates).template_id, "TPL-GM");
  assert.equal(resolveTemplateForEmployee({ jabatan: "Sales Supervisor Cirebon–Malang" }, templates).template_id, "TPL-SS");
  assert.equal(resolveTemplateForEmployee({ jabatan: "Admin Sales", cabang: "Malang" }, templates).template_id, "TPL-AS");
  assert.equal(resolveTemplateForEmployee({ jabatan: "Admin Sales", cabang: "Cirebon" }, templates).template_id, "TPL-SA");
  assert.equal(resolveTemplateForEmployee({ jabatan: "Finance & Accounting" }, templates).template_id, "TPL-FA");
  assert.equal(resolveTemplateForEmployee({ jabatan: "HR Generalist" }, templates).template_id, "TPL-HR");
  assert.equal(resolveTemplateForEmployee({ jabatan: "" }, templates), null);
});

/* T-15 ------------------------------------------------------------------ */
test("T-15 scorecard dari template selalu mulai DRAFT dengan semua item PENDING", () => {
  const template = KPI_SCORECARD_TEMPLATES_SEED.find(row => row.template_id === "TPL-SL");
  const scorecard = buildScorecardFromTemplate(template, {
    nik: "M001",
    nama: "Sales Uji",
    cabang: "Malang",
    jabatan: "Salesman"
  }, { period_year: 2027 });

  assert.equal(scorecard.status, "DRAFT");
  assert.equal(scorecard.employee_nik, "M001");
  assert.equal(scorecard.period_year, 2027);
  assert.equal(scorecard.items.length, template.items.length);
  assert.ok(scorecard.items.every(row => row.status === KPI_ITEM_STATUS.PENDING));
  assert.ok(scorecard.items.every(row => row.actual_value === null));

  const summary = summarizeScorecard(scorecard);
  assert.equal(summary.status_label, "Draft");
  assert.equal(summary.final_score, null);
  assert.equal(summary.pending_count, template.items.length);
});

/* T-16 ------------------------------------------------------------------ */
test("T-16 seed master dan template konsisten serta masih berstatus DRAFT", () => {
  assert.equal(KPI_SCORECARD_TEMPLATES_SEED.length, 13);
  assert.equal(KPI_MASTER_SEED.length, 94);

  const codes = new Set();
  for (const template of KPI_SCORECARD_TEMPLATES_SEED) {
    assert.equal(template.status, "DRAFT", `${template.template_id} harus DRAFT`);
    assert.equal(template.proposed, true);
    assert.equal(template.version, KPI_2027_VERSION);
    assert.equal(validateWeights(template.items).valid, true, `${template.template_id} bobot harus 100%`);
    for (const row of template.items) {
      assert.ok(row.kpi_code, "kode KPI wajib ada");
      codes.add(row.kpi_code);
    }
  }

  assert.equal(codes.size, KPI_MASTER_SEED.length);
  assert.ok(KPI_MASTER_SEED.every(row => row.status === "DRAFT" && row.proposed === true));
  assert.ok(KPI_MASTER_SEED.every(row => row.effective_from === "2027-01-01"));
});

/* T-17 ------------------------------------------------------------------ */
test("T-17 skor akhir tidak pernah melebihi batas maksimum", () => {
  const items = [
    item({ kpi_code: "A", weight_percent: 100, target_value: 100, actual_value: 500, cap_score: 150 })
  ];
  const result = calculateScorecard(items);
  assert.equal(result.final_score, 120);
  assert.ok(result.final_score <= MAX_INDICATOR_SCORE);
});
