'use strict';

const crypto = require('crypto');
const { FORM_INTEGRATION_LIMITS } = require('./free-tier.js');

const FORM_ID_RE = /^[A-Za-z0-9_-]{3,120}$/;
const SUBMISSION_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;
const QUESTION_KEY_MAX = 160;

function text(value, max = 500) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max);
}

function normalizeGoogleFormId(value) {
  const raw = text(value, 1_000);
  if (!raw) return '';
  const fromUrl = raw.match(/\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]{10,})/);
  if (fromUrl) return fromUrl[1];
  const fromOpen = raw.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (fromOpen) return fromOpen[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return '';
}

function normalizeQuestionKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, QUESTION_KEY_MAX);
}

function sanitizeField(field = {}) {
  const label = text(field.label || field.name, 200);
  const name = text(field.name, 120).replace(/[^A-Za-z0-9_]+/g, '_') || 'kolom';
  const type = text(field.type || 'text', 40).toLowerCase();
  return {
    name,
    label: label || name,
    type,
    required: field.required === true,
    options: Array.isArray(field.options)
      ? field.options.map(option => text(option, 120)).filter(Boolean).slice(0, 50)
      : []
  };
}

function normalizeFieldDefinitions(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .slice(0, FORM_INTEGRATION_LIMITS.maxFieldsPerForm)
    .map(sanitizeField)
    .filter(field => field.name && field.label);
}

function buildDefaultFieldMap(fields, existingMap = []) {
  const normalizedFields = normalizeFieldDefinitions(fields);
  const saved = new Map();
  (Array.isArray(existingMap) ? existingMap : []).forEach(item => {
    const target = text(item?.target, 120);
    if (!target) return;
    saved.set(target, {
      target,
      question: text(item?.question || item?.label, 200),
      label: text(item?.label || item?.question, 200),
      required: item?.required === true
    });
  });
  return normalizedFields.map(field => {
    const previous = saved.get(field.name);
    return {
      target: field.name,
      label: field.label,
      question: previous?.question || field.label,
      required: field.required
    };
  });
}

function normalizeAnswers(rawAnswers) {
  const items = [];
  if (Array.isArray(rawAnswers)) {
    rawAnswers.slice(0, FORM_INTEGRATION_LIMITS.maxAnswersPerSubmission).forEach(item => {
      if (!item) return;
      const question = text(item.question || item.title || item.label || item.name, 200);
      let answer = item.answer !== undefined ? item.answer : item.value;
      if (Array.isArray(answer)) answer = answer.map(value => text(value, 500)).filter(Boolean);
      else if (answer !== null && typeof answer === 'object') answer = text(JSON.stringify(answer), 5_000);
      else answer = typeof answer === 'number' || typeof answer === 'boolean' ? answer : text(answer, 5_000);
      if (question) items.push({ question, answer });
    });
    return items;
  }
  if (rawAnswers && typeof rawAnswers === 'object') {
    Object.entries(rawAnswers)
      .slice(0, FORM_INTEGRATION_LIMITS.maxAnswersPerSubmission)
      .forEach(([question, value]) => {
        let answer = value;
        if (Array.isArray(answer)) answer = answer.map(item => text(item, 500)).filter(Boolean);
        else if (answer !== null && typeof answer === 'object') answer = text(JSON.stringify(answer), 5_000);
        else answer = typeof answer === 'number' || typeof answer === 'boolean' ? answer : text(answer, 5_000);
        if (question) items.push({ question: text(question, 200), answer });
      });
  }
  return items;
}

function indexAnswers(answers) {
  const index = new Map();
  answers.forEach(item => {
    const exact = String(item.question || '').trim();
    const slug = normalizeQuestionKey(exact);
    if (exact && !index.has(exact)) index.set(exact, item.answer);
    if (slug && !index.has(`#${slug}`)) index.set(`#${slug}`, item.answer);
  });
  return index;
}

function isEmptyAnswer(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

function matchAnswersToFields(fieldMap, answers) {
  const map = Array.isArray(fieldMap) ? fieldMap : [];
  const index = indexAnswers(Array.isArray(answers) ? answers : []);
  const mapped = {};
  const missing = [];

  map.forEach(field => {
    const target = text(field?.target, 120);
    if (!target) return;
    const candidates = [
      text(field.question, 200),
      `#${normalizeQuestionKey(field.question)}`,
      target,
      `#${normalizeQuestionKey(target)}`,
      text(field.label, 200),
      `#${normalizeQuestionKey(field.label)}`
    ].filter(Boolean);

    let value;
    for (const candidate of candidates) {
      if (index.has(candidate)) { value = index.get(candidate); break; }
    }
    if (isEmptyAnswer(value)) {
      if (field.required === true) missing.push(target);
      return;
    }
    mapped[target] = value;
  });

  return { mapped, missing, answeredCount: Object.keys(mapped).length };
}

function normalizeSubmissionPayload(body = {}, definition = {}, options = {}) {
  const formId = text(definition.id || body.form_id, 120);
  if (!FORM_ID_RE.test(formId)) throw new Error('ID formulir HRIS tidak valid.');

  const submissionId = text(body.submission_id || body.response_id || body.id, 200);
  if (!SUBMISSION_ID_RE.test(submissionId)) {
    throw new Error('ID respons Google Form tidak valid atau kosong.');
  }

  const submittedAtRaw = body.submitted_at || body.timestamp || '';
  const submittedAtDate = submittedAtRaw ? new Date(submittedAtRaw) : new Date(options.now || Date.now());
  const submittedAt = Number.isNaN(submittedAtDate.getTime())
    ? new Date(options.now || Date.now())
    : submittedAtDate;

  const answers = normalizeAnswers(body.answers);
  if (!answers.length) throw new Error('Respons Google Form tidak memiliki jawaban.');

  const fieldMap = Array.isArray(definition.field_map) ? definition.field_map : [];
  const { mapped, missing } = matchAnswersToFields(fieldMap, answers);

  return {
    id: submissionId,
    formId,
    googleFormId: normalizeGoogleFormId(definition.google_form_id || body.google_form_id || ''),
    submittedAt: submittedAt.toISOString(),
    respondentEmail: text(body.respondent_email || body.email, 320).toLowerCase(),
    respondentName: text(body.respondent_name || body.name, 200),
    answers,
    mapped,
    missing,
    status: 'RECEIVED',
    payload: {
      form_id: formId,
      google_form_id: normalizeGoogleFormId(definition.google_form_id || body.google_form_id || ''),
      submission_id: submissionId,
      submitted_at: submittedAt.toISOString(),
      respondent_email: text(body.respondent_email || body.email, 320).toLowerCase(),
      answers
    }
  };
}

function signFormPayload(secret, rawBody) {
  return crypto.createHmac('sha256', String(secret || '')).update(String(rawBody || '')).digest('hex');
}

function verifyFormSignature(secret, rawBody, signature) {
  const expected = signFormPayload(secret, rawBody);
  const actual = String(signature || '').trim().toLowerCase().replace(/^sha256=/, '');
  if (!/^[a-f0-9]{64}$/.test(actual)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function appsScriptItemType(type) {
  switch (String(type || '').toLowerCase()) {
    case 'textarea':
    case 'list':
      return 'PARAGRAPH';
    case 'radio':
    case 'select':
      return 'MULTIPLE_CHOICE';
    case 'checkbox':
      return 'CHECKBOX';
    case 'date':
      return 'DATE';
    case 'time':
      return 'TIME';
    case 'scale':
      return 'SCALE';
    case 'file':
      return 'FILE_UPLOAD';
    default:
      return 'TEXT';
  }
}

function buildAppsScript(options = {}) {
  const webhookUrl = text(options.webhookUrl, 1_000);
  const secret = text(options.secret, 200);
  const formId = text(options.formId, 120);
  const formName = text(options.formName || formId, 200);
  const fields = normalizeFieldDefinitions(options.fields);
  const schema = fields.map(field => ({
    name: field.name,
    label: field.label,
    type: appsScriptItemType(field.type),
    required: field.required,
    options: field.options
  }));

  const config = JSON.stringify({
    webhookUrl,
    secret,
    formId,
    formName,
    schema
  }, null, 2);

  return `/**
 * AJ HRIS - integrasi Google Form (gratis, tanpa Google Forms API).
 * Tempel skrip ini di Google Form > menu Ekstensi > Apps Script.
 *
 * 1) Jalankan setupCreateForm() untuk membuat Google Form baru sesuai
 *    formulir HRIS, atau installTrigger() untuk memakai form yang sudah ada.
 * 2) Setujui izin yang diminta Google (hanya Form, Trigger, UrlFetch).
 * 3) Salin URL/ID Google Form yang tampil di log ke halaman Form Builder HRIS.
 */

const HRIS_FORM = ${config};

function setupCreateForm() {
  const form = FormApp.create(HRIS_FORM.formName);
  form.setDescription("Formulir dibuat otomatis dari AJ HRIS. Jangan ubah urutan pertanyaan tanpa memperbarui pemetaan di HRIS.");

  HRIS_FORM.schema.forEach(function (field) {
    let item;
    if (field.type === "PARAGRAPH") item = form.addParagraphTextItem();
    else if (field.type === "MULTIPLE_CHOICE") item = form.addMultipleChoiceItem();
    else if (field.type === "CHECKBOX") item = form.addCheckboxItem();
    else if (field.type === "DATE") item = form.addDateItem();
    else if (field.type === "TIME") item = form.addTimeItem();
    else if (field.type === "SCALE") item = form.addScaleItem().setBounds(1, 5);
    else if (field.type === "FILE_UPLOAD") item = form.addFileUploadItem();
    else item = form.addTextItem();

    item.setTitle(field.label);
    item.setRequired(field.required === true);
    if (field.options && field.options.length && item.setChoiceValues) {
      item.setChoiceValues(field.options);
    }
  });

  installTrigger_(form);
  Logger.log("ID Google Form: " + form.getId());
  Logger.log("URL Google Form: " + form.getPublishedUrl());
  Logger.log("Tempel ID/URL di atas ke Form Builder HRIS > Integrasi Google Form.");
}

function installTrigger() {
  installTrigger_(FormApp.getActiveForm());
}

function installTrigger_(form) {
  ScriptApp.getUserTriggers(form).forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "onFormSubmit") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("onFormSubmit").forForm(form).onFormSubmit().create();
  Logger.log("Trigger onFormSubmit terpasang.");
}

function onFormSubmit(e) {
  const response = e.response;
  const answers = response.getItemResponses().map(function (item) {
    const value = item.getResponse();
    return { question: item.getItem().getTitle(), answer: value };
  });

  const payload = {
    action: "form_ingest",
    form_id: HRIS_FORM.formId,
    submission_id: response.getId(),
    submitted_at: response.getTimestamp().toISOString(),
    respondent_email: response.getRespondentEmail ? (response.getRespondentEmail() || "") : "",
    answers: answers
  };

  const raw = JSON.stringify(payload);
  const signature = bytesToHex_(Utilities.computeHmacSha256Signature(raw, HRIS_FORM.secret));
  const res = UrlFetchApp.fetch(HRIS_FORM.webhookUrl, {
    method: "post",
    contentType: "application/json",
    headers: { "x-form-signature": signature },
    payload: raw,
    muteHttpExceptions: true
  });
  Logger.log("AJ HRIS: HTTP " + res.getResponseCode() + " " + res.getContentText());
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    const value = (b < 0 ? b + 256 : b).toString(16);
    return value.length === 1 ? "0" + value : value;
  }).join("");
}
`;
}

module.exports = {
  FORM_ID_RE,
  SUBMISSION_ID_RE,
  normalizeGoogleFormId,
  normalizeQuestionKey,
  normalizeFieldDefinitions,
  buildDefaultFieldMap,
  normalizeAnswers,
  matchAnswersToFields,
  normalizeSubmissionPayload,
  signFormPayload,
  verifyFormSignature,
  appsScriptItemType,
  buildAppsScript
};
