import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULE_GOOGLE_FORM,
  buildKpiDistributionFields,
  buildModuleFormConfig,
  buildTnaSurveyFields,
  extractGoogleFormId,
  moduleFormId,
  moduleKey
} from "../js/google-form-module.mjs";

/* GF-01 ----------------------------------------------------------------- */
test("GF-01 skema survey TNA memuat identitas dan 4 pertanyaan per kompetensi", () => {
  const { fields, meta } = buildTnaSurveyFields({
    id: "TNA-1",
    title: "TNA Semester I",
    competencies: [
      { name: "Komunikasi Efektif", expected_level: 4, business_impact: 5 },
      { name: "Microsoft Excel", expected_level: 4, business_impact: 4 }
    ]
  });

  assert.equal(meta.campaign_id, "TNA-1");
  assert.equal(meta.competencies.length, 2);
  assert.equal(fields.length, 5 + 2 * 4);
  assert.equal(fields[0].name, "nik_karyawan");
  assert.equal(fields[0].required, true);
  assert.ok(fields.some(field => field.name === "level_komunikasi_efektif"));
  assert.ok(fields.some(field => field.name === "urgency_microsoft_excel"));
  assert.ok(fields.some(field => field.name === "impact_komunikasi_efektif"));
  assert.ok(fields.some(field => field.name === "reason_microsoft_excel"));
  const scale = fields.find(field => field.name === "level_komunikasi_efektif");
  assert.deepEqual(scale.options, ["1", "2", "3", "4", "5"]);
});

/* GF-02 ----------------------------------------------------------------- */
test("GF-02 kompetensi tanpa nama tidak menghasilkan pertanyaan kosong", () => {
  const { fields, meta } = buildTnaSurveyFields({ id: "TNA-2", competencies: [{ name: "" }, { name: "Leadership" }] });
  assert.equal(meta.competencies.length, 1);
  assert.equal(fields.filter(field => field.name.startsWith("level_")).length, 1);
});

/* GF-03 ----------------------------------------------------------------- */
test("GF-03 skema distribusi KPI mengikuti urutan indikator template", () => {
  const template = {
    id: "TPL-X",
    nama_template: "Template Uji",
    soal_json: [
      { aspek: "Kinerja", indikator: "Omzet", bobot: 60 },
      { aspek: "Perilaku", indikator: "Kolaborasi", bobot: 40 }
    ]
  };
  const { fields, meta } = buildKpiDistributionFields({ template, periode: "Semester 1 2027" });

  assert.equal(meta.template_id, "TPL-X");
  assert.equal(meta.periode, "Semester 1 2027");
  assert.equal(meta.indicators.length, 2);
  assert.equal(meta.indicators[0].bobot, 60);
  assert.equal(meta.indicators[0].code, moduleKey("Kinerja_1"));
  assert.equal(fields.filter(field => field.name.startsWith("skor_")).length, 2);
  assert.ok(fields.every(field => !field.name.startsWith("skor_") || field.required === true));
  assert.ok(fields.some(field => field.name === "nik_penilai"));
  assert.ok(fields.some(field => field.name === "periode"));
});

/* GF-04 ----------------------------------------------------------------- */
test("GF-04 konfigurasi form modul tidak memakai alur approval pengajuan", () => {
  const config = buildModuleFormConfig({
    id: "KPI-TPL-X",
    namaForm: "Distribusi KPI",
    modul: "kpi",
    meta: { template_id: "TPL-X" },
    fields: [{ name: "nik_penilai", label: "NIK Penilai", type: "text", required: true }]
  });
  assert.equal(config.id, "KPI-TPL-X");
  assert.equal(config.modul, MODULE_GOOGLE_FORM.KPI);
  assert.deepEqual(config.approval_flow, []);
  assert.equal(config.allowed_users, "ALL");
  assert.equal(config.requires_lpj, false);
  assert.deepEqual(config.module_meta, { template_id: "TPL-X" });
});

/* GF-05 ----------------------------------------------------------------- */
test("GF-05 ID Google Form dibaca dari semua bentuk tautan", () => {
  assert.equal(extractGoogleFormId("https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit"), "1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890");
  assert.equal(extractGoogleFormId("https://docs.google.com/forms/d/e/1FAIpQLScDEF456/viewform"), "1FAIpQLScDEF456");
  assert.equal(extractGoogleFormId("https://docs.google.com/forms/d/1FAIpQLScDEF456"), "1FAIpQLScDEF456");
  assert.equal(extractGoogleFormId("1FAIpQLScDEF456"), "1FAIpQLScDEF456");
  assert.equal(extractGoogleFormId("bukan id"), "");
  assert.equal(extractGoogleFormId(""), "");
});

/* GF-06 ----------------------------------------------------------------- */
test("GF-06 ID formulir modul dibatasi dan dibersihkan", () => {
  assert.equal(moduleFormId("TNA", "TNA-1"), "TNA-TNA-1");
  assert.equal(moduleFormId("KPI", "tpl x/2027"), "KPI-tpl-x-2027");
  assert.ok(moduleFormId("KPI", "x".repeat(200)).length <= 120);
});

/* GF-07 ----------------------------------------------------------------- */
test("GF-07 moduleKey menormalkan nama kompetensi menjadi kunci stabil", () => {
  assert.equal(moduleKey("Komunikasi Efektif"), "komunikasi_efektif");
  assert.equal(moduleKey("  Microsoft Excel "), "microsoft_excel");
  assert.equal(moduleKey("K3 & Keselamatan"), "k3_keselamatan");
  assert.equal(moduleKey(""), "item");
});
