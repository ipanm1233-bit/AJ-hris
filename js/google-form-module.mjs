/**
 * Skema Google Form untuk modul selain Form Builder (TNA & KPI 360).
 *
 * Fungsi di sini murni (tanpa DOM/Firestore) supaya:
 *  - pertanyaan Google Form selalu sama dengan field yang dibaca server,
 *  - kode indikator/kompetensi dapat diuji otomatis.
 */

export const MODULE_GOOGLE_FORM = Object.freeze({
  TNA: "TNA",
  KPI: "KPI"
});

export function moduleKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "item";
}

const SCALE_OPTIONS = ["1", "2", "3", "4", "5"];

function competencyCode(item, index) {
  return moduleKey(item?.code || item?.name || `kompetensi_${index + 1}`);
}

export function buildTnaSurveyFields(campaign = {}) {
  const campaignId = String(campaign.id || campaign.campaign_id || "").trim();
  const competencies = (Array.isArray(campaign.competencies) ? campaign.competencies : [])
    .map((item, index) => ({
      code: competencyCode(item, index),
      name: String(item?.name || "").trim(),
      expected_level: Number(item?.expected_level || 3),
      business_impact: Number(item?.business_impact || 3)
    }))
    .filter(item => item.name);

  const fields = [
    { name: "nik_karyawan", label: "NIK Karyawan", type: "text", required: true },
    { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true },
    { name: "cabang", label: "Cabang", type: "text", required: false },
    { name: "divisi", label: "Divisi", type: "text", required: false },
    { name: "jabatan", label: "Jabatan", type: "text", required: false }
  ];

  competencies.forEach(item => {
    fields.push(
      { name: `level_${item.code}`, label: `Level saat ini — ${item.name}`, type: "select", required: true, options: SCALE_OPTIONS },
      { name: `urgency_${item.code}`, label: `Urgensi — ${item.name}`, type: "select", required: true, options: SCALE_OPTIONS },
      { name: `impact_${item.code}`, label: `Dampak bisnis — ${item.name}`, type: "select", required: true, options: SCALE_OPTIONS },
      { name: `reason_${item.code}`, label: `Alasan kebutuhan — ${item.name}`, type: "textarea", required: false }
    );
  });

  return {
    fields,
    meta: {
      campaign_id: campaignId,
      campaign_title: String(campaign.title || campaign.nama || "").trim(),
      competencies
    }
  };
}

export function buildKpiDistributionFields({ template = {}, periode = "", tasks = [] } = {}) {
  const soal = Array.isArray(template.soal_json) ? template.soal_json : [];
  const indicators = soal.map((item, index) => ({
    code: moduleKey(`${item.aspek || item.indikator || "indikator"}_${index + 1}`),
    label: String(item.indikator || item.aspek || `Indikator ${index + 1}`).trim(),
    aspect: String(item.aspek || "").trim(),
    bobot: Number(item.bobot || 0)
  }));

  const fields = [
    { name: "nik_penilai", label: "NIK Penilai / Evaluator", type: "text", required: true },
    { name: "nama_penilai", label: "Nama Penilai / Evaluator", type: "text", required: false },
    { name: "nik_dinilai", label: "NIK Karyawan yang Dinilai", type: "text", required: true },
    { name: "nama_dinilai", label: "Nama Karyawan yang Dinilai", type: "text", required: false },
    { name: "periode", label: "Periode Penilaian", type: "text", required: true }
  ];

  indicators.forEach(item => {
    fields.push({
      name: `skor_${item.code}`,
      label: `${item.aspect ? `[${item.aspect}] ` : ""}${item.label}${item.bobot ? ` (bobot ${item.bobot}%)` : ""}`,
      type: "number",
      required: true
    });
  });

  fields.push(
    { name: "catatan_baik", label: "Hal-hal yang sudah baik", type: "textarea", required: false },
    { name: "catatan_perbaikan", label: "Hal-hal yang harus diperbaiki", type: "textarea", required: false },
    { name: "catatan_penilai", label: "Catatan & rekomendasi penilai", type: "textarea", required: false }
  );

  return {
    fields,
    meta: {
      template_id: String(template.id || template.template_id || "").trim(),
      template_name: String(template.nama_template || template.position_name || "").trim(),
      periode: String(periode || "").trim(),
      indicators,
      task_count: Array.isArray(tasks) ? tasks.length : 0
    }
  };
}

export function buildModuleFormConfig({ id, namaForm, modul, meta = {}, fields = [] } = {}) {
  const formId = String(id || "").trim();
  if (!formId) throw new Error("ID formulir modul wajib diisi.");
  return {
    id: formId,
    nama_form: String(namaForm || formId).trim().slice(0, 200),
    modul: String(modul || "").toUpperCase(),
    module_meta: meta,
    fields_json: fields,
    approval_flow: [],
    allowed_users: "ALL",
    allowed_rules: "",
    requires_lpj: false,
    lpj_deadline_days: 7,
    lpj_fields_json: [],
    notify_specific_users: [],
    notify_user_rules: [],
    notify_targets: null
  };
}

/** Ambil ID Google Form dari URL edit/view/share maupun ID mentah. */
export function extractGoogleFormId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const fromPath = raw.match(/\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]{10,})/);
  if (fromPath) return fromPath[1];
  const fromOpen = raw.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (fromOpen) return fromOpen[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return "";
}

export function moduleFormId(prefix, reference) {
  const safe = String(reference || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return `${prefix}-${safe || Date.now()}`.slice(0, 120);
}
