import test from "node:test";
import assert from "node:assert/strict";
import {
  CASE_CATEGORIES,
  normalizeCaseRecord,
  normalizeActionPlanRecord,
  normalizeFollowupRecord,
  activeActionPlans
} from "../js/konseling-standards.mjs";

test("seluruh jenis dan kategori kasus menggunakan Bahasa Indonesia", () => {
  assert.ok(CASE_CATEGORIES.Konseling.includes("Masalah pribadi"));
  assert.ok(CASE_CATEGORIES["Pembinaan Disiplin"].includes("Keterlambatan"));
  assert.ok(CASE_CATEGORIES["Tindak Lanjut Surat Peringatan"].includes("Peringatan formal lainnya"));
});

test("data lama berbahasa Inggris dinormalisasi tanpa migrasi destruktif", () => {
  const normalized = normalizeCaseRecord({
    case_type: "Disciplinary",
    category: "Late attendance",
    source: "Attendance",
    status: "Open",
    priority: "Critical",
    confidentiality: "Highly Confidential",
    hr_assessment: { root_cause: "Discipline" }
  });
  assert.equal(normalized.case_type, "Pembinaan Disiplin");
  assert.equal(normalized.category, "Keterlambatan");
  assert.equal(normalized.source, "Data Absensi");
  assert.equal(normalized.status, "Asesmen Awal");
  assert.equal(normalized.priority, "Kritis");
  assert.equal(normalized.confidentiality, "Sangat Rahasia");
  assert.equal(normalized.hr_assessment.root_cause, "Kedisiplinan");
});

test("status rencana dan hasil pemantauan lama dinormalisasi", () => {
  assert.equal(normalizeActionPlanRecord({ status: "In Progress" }).status, "Berjalan");
  assert.equal(normalizeFollowupRecord({ improvement_status: "No Improvement" }).improvement_status, "Belum Ada Perbaikan");
  assert.equal(activeActionPlans([{ status: "Completed" }, { status: "Berjalan" }]).length, 1);
});
