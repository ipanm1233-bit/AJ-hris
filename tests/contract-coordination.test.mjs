import test from "node:test";
import assert from "node:assert/strict";
import { summarizeReviewTasks, resolveCoordinationStage } from "../js/contract-coordination.mjs";

test("only the selected renewal's completed reviews contribute to its score", () => {
  const tasks = [
    { evaluation_id: "current", status: "DONE", skor_akhir: 80 },
    { evaluation_id: "current", status: "DONE", skor_akhir: 100 },
    { evaluation_id: "old", status: "PENDING", skor_akhir: null }
  ];
  assert.deepEqual(summarizeReviewTasks(tasks, "current"), {
    tasks: tasks.slice(0, 2), completed: 2, average: 90, ready: true
  });
  assert.equal(summarizeReviewTasks(tasks, "old").ready, false);
  assert.equal(summarizeReviewTasks([{ evaluation_id: "current", status: "DONE", skor_akhir: null }], "current").ready, false);
  assert.equal(summarizeReviewTasks([], "current").ready, false);
});

test("review, GM, and director approvals advance in order", () => {
  const complete = {
    reviewReady: true, recommendation: "Perpanjang 6 bulan", reviewDate: "2026-09-25",
    evidence: "Rekap KPI September 2026", supervisorName: "Atasan", supervisorDecision: "SETUJU",
    supervisorDate: "2026-09-26", gmDate: "2026-09-26",
    directorDate: "2026-09-27", directorDecision: "DISETUJUI_PERPANJANG"
  };
  assert.equal(resolveCoordinationStage({ ...complete, reviewReady: false }), "REVIEW_HRD");
  assert.equal(resolveCoordinationStage({ ...complete, evidence: "" }), "REVIEW_HRD");
  assert.equal(resolveCoordinationStage({ ...complete, gmDate: "" }), "KOORDINASI_GM");
  assert.equal(resolveCoordinationStage({ ...complete, supervisorDecision: "TIDAK_SETUJU" }), "KOORDINASI_GM");
  assert.equal(resolveCoordinationStage({ ...complete, directorDecision: "PENDING" }), "APPROVAL_DIREKTUR");
  assert.equal(resolveCoordinationStage(complete), "DRAFT_KONTRAK");
  assert.equal(resolveCoordinationStage({ ...complete, finished: true }), "SELESAI");
});
