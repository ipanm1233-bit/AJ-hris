import test from "node:test";
import assert from "node:assert/strict";
import {
  clampScore, normalizeFinding, normalizeChecklist, computeAuditScore,
  gradeAudit, isFollowUpOverdue, summarizeChecklist, summarizeAudit,
  summarizeAudits, standardChecklistFor, SCORE_MAX
} from "../js/sop-audit.mjs";

test("clampScore membatasi skor 0-4 dan membulatkan", () => {
  assert.equal(SCORE_MAX, 4);
  assert.equal(clampScore(3.6), 4);
  assert.equal(clampScore(-2), 0);
  assert.equal(clampScore(9), 4);
  assert.equal(clampScore("2"), 2);
});

test("normalizeFinding mengisi default dan status tindak lanjut", () => {
  const good = normalizeFinding({ skor: 4, bobot: 2 });
  assert.equal(good.severity, "Observasi");
  assert.equal(good.status_tindak_lanjut, "Selesai");
  assert.equal(good.bobot, 2);

  const bad = normalizeFinding({ skor: 2, severity: "Mayor", status_tindak_lanjut: "Open" }, 3);
  assert.equal(bad.id, "chk_4");
  assert.equal(bad.severity, "Mayor");
  assert.equal(bad.status_tindak_lanjut, "Open");

  const invalid = normalizeFinding({ severity: "Bukan Severity" });
  assert.equal(invalid.severity, "Observasi");
  assert.equal(invalid.skor, 0);
});

test("computeAuditScore menghitung skor berbobot 0-100", () => {
  assert.equal(computeAuditScore([]), 0);
  assert.equal(
    computeAuditScore([
      { bobot: 1, skor: 4 },
      { bobot: 1, skor: 2 }
    ]),
    75
  );
  assert.equal(
    computeAuditScore([
      { bobot: 3, skor: 4 },
      { bobot: 1, skor: 0 }
    ]),
    75
  );
  assert.equal(computeAuditScore([{ bobot: 0, skor: 3 }]), 75);
});

test("gradeAudit memetakan skor ke grade A-E", () => {
  assert.equal(gradeAudit(95).grade, "A");
  assert.equal(gradeAudit(90).grade, "A");
  assert.equal(gradeAudit(89.99).grade, "B");
  assert.equal(gradeAudit(80).grade, "B");
  assert.equal(gradeAudit(70).grade, "C");
  assert.equal(gradeAudit(60).grade, "D");
  assert.equal(gradeAudit(59.99).grade, "E");
});

test("isFollowUpOverdue hanya untuk temuan belum selesai", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  assert.equal(isFollowUpOverdue({ deadline: "2026-05-01", status_tindak_lanjut: "Open" }, now), true);
  assert.equal(isFollowUpOverdue({ deadline: "2026-05-01", status_tindak_lanjut: "Selesai" }, now), false);
  assert.equal(isFollowUpOverdue({ deadline: "2026-07-01", status_tindak_lanjut: "Open" }, now), false);
  assert.equal(isFollowUpOverdue({ status_tindak_lanjut: "Open" }, now), false);
});

test("summarizeChecklist menghitung temuan, open, dan overdue", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const summary = summarizeChecklist([
    { skor: 4, status_tindak_lanjut: "Selesai" },
    { skor: 2, temuan: "Belum ada bukti", status_tindak_lanjut: "Open", deadline: "2026-05-15", severity: "Mayor" },
    { skor: 3, status_tindak_lanjut: "Progres", deadline: "2026-07-01", severity: "Minor" }
  ], now);

  assert.equal(summary.totalItems, 3);
  assert.equal(summary.withFinding, 2);
  assert.equal(summary.open, 2);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.bySeverity.Mayor, 1);
  assert.equal(summary.bySeverity.Minor, 1);
  assert.equal(summary.score, 75);
  assert.equal(summary.grade.grade, "C");
});

test("summarizeAudit dan summarizeAudits menyiapkan data rekap", () => {
  const audit = summarizeAudit({
    divisi: "SALES",
    checklist: [{ bobot: 1, skor: 4 }, { bobot: 1, skor: 2, temuan: "Tidak lengkap", status_tindak_lanjut: "Open" }]
  });
  assert.equal(audit.skor, 75);
  assert.equal(audit.grade, "C");
  assert.equal(audit.totalItems, 2);
  assert.equal(audit.findings, 1);

  const summary = summarizeAudits([
    { divisi: "SALES", checklist: [{ bobot: 1, skor: 4 }] },
    { divisi: "SALES", checklist: [{ bobot: 1, skor: 2, temuan: "X", status_tindak_lanjut: "Open" }] },
    { divisi: "HRD", checklist: [] }
  ]);

  assert.equal(summary.totalAudits, 3);
  assert.equal(summary.byDivisi.length, 2);
  assert.equal(summary.byDivisi.find(row => row.divisi === "SALES").total, 2);
  assert.equal(summary.byDivisi.find(row => row.divisi === "SALES").averageScore, 75);
  assert.equal(summary.openFindings, 1);
});

test("standardChecklistFor menambahkan item sesuai divisi", () => {
  assert.equal(standardChecklistFor("SALES").length, 7);
  assert.ok(standardChecklistFor("SALES").some(row => row.klausul === "Gimmick"));
  assert.equal(standardChecklistFor("HRD").length, 7);
  assert.ok(standardChecklistFor("HRD").some(row => row.klausul === "Data Karyawan"));
  assert.equal(standardChecklistFor("IT").length, 5);
  assert.ok(standardChecklistFor("IT").every(row => row.status_tindak_lanjut === "Open"));
});

test("standardChecklistFor mengenali nama divisi master Andela Jaya", () => {
  assert.ok(standardChecklistFor("HRD & GA").some(row => row.klausul === "Data Karyawan"));
  assert.ok(standardChecklistFor("FINANCE & ACCOUNTING").some(row => row.klausul === "Rekonsiliasi"));
  assert.ok(standardChecklistFor("MARKETING & SALES").some(row => row.klausul === "Gimmick"));
  assert.ok(standardChecklistFor("SALES & DISTRIBUTION").some(row => row.klausul === "Gimmick"));
  assert.ok(standardChecklistFor("LOGISTIK & GUDANG").some(row => row.klausul === "FIFO/FEFO"));
});
