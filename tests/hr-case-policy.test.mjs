import test from "node:test";
import assert from "node:assert/strict";
import { POLICY_ARTICLES, assessPolicyDecision } from "../js/hr-case-policy.mjs";

test("pasal rujukan kedisiplinan dan prosedur SP tersedia pada dokumen arsip", () => {
  assert.ok(POLICY_ARTICLES.some(a => a.id === "37"));
  assert.ok(POLICY_ARTICLES.some(a => a.id === "42"));
  assert.ok(POLICY_ARTICLES.some(a => a.id === "43"));
});

test("coaching dan konseling tetap dapat dicatat tanpa dasar pelanggaran", () => {
  assert.deepEqual(assessPolicyDecision({ basis: "Tidak terkait pelanggaran", decision: "Coaching / konseling" }), []);
});

test("usulan SP memerlukan pasal atau SOP, bukti, klarifikasi, alasan, serta verifikasi aturan", () => {
  const input = { basis: "Peraturan Perusahaan dan SOP", decision: "Tinjau untuk SP" };
  assert.equal(assessPolicyDecision(input).length, 6);
  assert.deepEqual(assessPolicyDecision({ ...input, articleId: "37", sopReference: "SOP-01 rev 2 butir 4", evidence: "Log kehadiran", employeeStatement: "Klarifikasi 23/09", rationale: "Berulang setelah pembinaan", currentRuleConfirmed: true }), []);
  assert.ok(assessPolicyDecision({ ...input, articleId: "999", sopReference: "SOP-01", evidence: "Log", employeeStatement: "Klarifikasi", rationale: "Alasan", currentRuleConfirmed: true }).includes("pilih pasal PP"));
});
