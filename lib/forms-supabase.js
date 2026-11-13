'use strict';

const { supabaseRequest } = require('./supabase.js');

const text = value => String(value || '').trim();
const LIST_COLUMNS = 'id,form_id,google_form_id,submitted_at,respondent_email,respondent_name,answers,mapped,status,imported_id,import_error,received_at';
const DEFINITION_COLUMNS = 'id,nama_form,google_form_id,google_form_url,field_map,schema_fields,active,created_by,updated_by,created_at,updated_at';

function toStringArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function definitionToRow(definition = {}) {
  const id = text(definition.id);
  if (!id) throw new Error('ID formulir HRIS wajib diisi.');
  return {
    id,
    nama_form: text(definition.nama_form || definition.namaForm).slice(0, 200) || id,
    google_form_id: text(definition.google_form_id || definition.googleFormId).slice(0, 200),
    google_form_url: text(definition.google_form_url || definition.googleFormUrl).slice(0, 500),
    field_map: Array.isArray(definition.field_map || definition.fieldMap) ? (definition.field_map || definition.fieldMap) : [],
    schema_fields: Array.isArray(definition.schema_fields || definition.schemaFields) ? (definition.schema_fields || definition.schemaFields) : [],
    webhook_secret: text(definition.webhook_secret || definition.webhookSecret).slice(0, 200),
    active: definition.active !== false,
    created_by: text(definition.created_by || definition.createdBy).slice(0, 120),
    updated_by: text(definition.updated_by || definition.updatedBy).slice(0, 120)
  };
}

function definitionFromRow(row = {}, options = {}) {
  const base = {
    id: row.id,
    nama_form: row.nama_form || '',
    google_form_id: row.google_form_id || '',
    google_form_url: row.google_form_url || '',
    field_map: toStringArray(row.field_map),
    schema_fields: toStringArray(row.schema_fields),
    active: row.active !== false,
    has_secret: Boolean(row.webhook_secret),
    created_by: row.created_by || '',
    updated_by: row.updated_by || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
  if (options.includeSecret === true) base.webhook_secret = row.webhook_secret || '';
  return base;
}

function submissionToRow(submission = {}) {
  const id = text(submission.id);
  const formId = text(submission.form_id || submission.formId);
  if (!id || !formId) throw new Error('Respons Google Form memerlukan ID dan ID formulir.');
  return {
    id,
    form_id: formId,
    google_form_id: text(submission.google_form_id || submission.googleFormId).slice(0, 200),
    submitted_at: submission.submitted_at || submission.submittedAt || new Date().toISOString(),
    respondent_email: text(submission.respondent_email || submission.respondentEmail).slice(0, 320),
    respondent_name: text(submission.respondent_name || submission.respondentName).slice(0, 200),
    answers: Array.isArray(submission.answers) ? submission.answers : [],
    mapped: submission.mapped && typeof submission.mapped === 'object' ? submission.mapped : {},
    status: ['RECEIVED', 'IMPORTED', 'REJECTED', 'ERROR'].includes(submission.status) ? submission.status : 'RECEIVED',
    imported_id: text(submission.imported_id || submission.importedId).slice(0, 200),
    import_error: text(submission.import_error || submission.importError).slice(0, 500),
    payload: submission.payload && typeof submission.payload === 'object' ? submission.payload : {}
  };
}

function submissionFromRow(row = {}, options = {}) {
  const base = {
    id: row.id,
    form_id: row.form_id,
    google_form_id: row.google_form_id || '',
    submitted_at: row.submitted_at,
    respondent_email: row.respondent_email || '',
    respondent_name: row.respondent_name || '',
    answers: toStringArray(row.answers),
    mapped: row.mapped && typeof row.mapped === 'object' ? row.mapped : {},
    status: row.status || 'RECEIVED',
    imported_id: row.imported_id || '',
    import_error: row.import_error || '',
    received_at: row.received_at || null
  };
  if (options.includePayload === true) base.payload = row.payload || {};
  return base;
}

async function listFormDefinitions(options = {}) {
  const rows = await supabaseRequest('form_definitions', {
    query: {
      select: DEFINITION_COLUMNS,
      order: 'updated_at.desc',
      limit: Math.min(200, Math.max(1, Number(options.limit || 200)))
    },
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return (rows || []).map(row => definitionFromRow(row));
}

async function getFormDefinition(id, options = {}) {
  const value = text(id);
  if (!value) return null;
  const rows = await supabaseRequest('form_definitions', {
    query: {
      select: options.includeSecret === true ? '*' : DEFINITION_COLUMNS,
      id: `eq.${value}`,
      limit: 1
    },
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  if (!rows || !rows.length) return null;
  return definitionFromRow(rows[0], { includeSecret: options.includeSecret === true });
}

async function saveFormDefinition(definition, options = {}) {
  const rows = await supabaseRequest('form_definitions', {
    method: 'POST',
    query: { on_conflict: 'id' },
    prefer: 'resolution=merge-duplicates,return=representation',
    body: definitionToRow(definition),
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return rows && rows.length ? definitionFromRow(rows[0], { includeSecret: true }) : null;
}

async function updateFormDefinition(id, patch = {}, options = {}) {
  const value = text(id);
  if (!value) throw new Error('ID formulir HRIS tidak valid.');
  const body = {};
  if (patch.nama_form !== undefined) body.nama_form = text(patch.nama_form).slice(0, 200);
  if (patch.google_form_id !== undefined) body.google_form_id = text(patch.google_form_id).slice(0, 200);
  if (patch.google_form_url !== undefined) body.google_form_url = text(patch.google_form_url).slice(0, 500);
  if (patch.field_map !== undefined) body.field_map = Array.isArray(patch.field_map) ? patch.field_map : [];
  if (patch.schema_fields !== undefined) body.schema_fields = Array.isArray(patch.schema_fields) ? patch.schema_fields : [];
  if (patch.webhook_secret !== undefined) body.webhook_secret = text(patch.webhook_secret).slice(0, 200);
  if (patch.active !== undefined) body.active = patch.active !== false;
  if (patch.updated_by !== undefined) body.updated_by = text(patch.updated_by).slice(0, 120);
  if (!Object.keys(body).length) return getFormDefinition(value, { includeSecret: options.includeSecret === true });
  const rows = await supabaseRequest('form_definitions', {
    method: 'PATCH',
    query: { id: `eq.${value}`, select: '*' },
    prefer: 'return=representation',
    body,
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return rows && rows.length ? definitionFromRow(rows[0], { includeSecret: true }) : null;
}

async function insertFormSubmission(submission, options = {}) {
  const rows = await supabaseRequest('form_submissions', {
    method: 'POST',
    query: { on_conflict: 'id' },
    prefer: 'resolution=ignore-duplicates,return=representation',
    body: submissionToRow(submission),
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return rows && rows.length ? submissionFromRow(rows[0], { includePayload: true }) : null;
}

async function listFormSubmissions(filters = {}, options = {}) {
  const query = {
    select: LIST_COLUMNS,
    order: 'received_at.desc',
    limit: Math.min(200, Math.max(1, Number(filters.limit || 50))),
    offset: Math.max(0, Number(filters.offset || 0))
  };
  if (filters.formId) query.form_id = `eq.${text(filters.formId)}`;
  if (filters.status) query.status = `eq.${text(filters.status)}`;
  const rows = await supabaseRequest('form_submissions', {
    query,
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return (rows || []).map(row => submissionFromRow(row));
}

async function getFormSubmission(id, options = {}) {
  const value = text(id);
  if (!value) return null;
  const rows = await supabaseRequest('form_submissions', {
    query: { select: '*', id: `eq.${value}`, limit: 1 },
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return rows && rows.length ? submissionFromRow(rows[0], { includePayload: true }) : null;
}

async function updateFormSubmission(id, patch = {}, options = {}) {
  const value = text(id);
  if (!value) throw new Error('ID respons Google Form tidak valid.');
  const body = {};
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.imported_id !== undefined) body.imported_id = text(patch.imported_id).slice(0, 200);
  if (patch.import_error !== undefined) body.import_error = text(patch.import_error).slice(0, 500);
  if (patch.mapped !== undefined) body.mapped = patch.mapped && typeof patch.mapped === 'object' ? patch.mapped : {};
  if (!Object.keys(body).length) return getFormSubmission(value, options);
  const rows = await supabaseRequest('form_submissions', {
    method: 'PATCH',
    query: { id: `eq.${value}`, select: LIST_COLUMNS },
    prefer: 'return=representation',
    body,
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return rows && rows.length ? submissionFromRow(rows[0]) : null;
}

async function deleteFormSubmissions(ids, options = {}) {
  const values = [...new Set((ids || []).map(text).filter(Boolean))].slice(0, 500);
  if (!values.length) return [];
  const encoded = values.map(value => `"${value.replace(/["\\]/g, '')}"`).join(',');
  return supabaseRequest('form_submissions', {
    method: 'DELETE',
    query: { id: `in.(${encoded})`, select: 'id' },
    prefer: 'return=representation',
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
}

async function listPrunableSubmissionIds(beforeIso, limit = 500, options = {}) {
  const rows = await supabaseRequest('form_submissions', {
    query: {
      select: 'id',
      status: 'in.(IMPORTED,REJECTED)',
      received_at: `lt.${text(beforeIso)}`,
      limit: Math.min(500, Math.max(1, Number(limit || 500)))
    },
    timeoutMs: options.timeoutMs || 8_000,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  return (rows || []).map(row => row.id);
}

module.exports = {
  definitionToRow,
  definitionFromRow,
  submissionToRow,
  submissionFromRow,
  listFormDefinitions,
  getFormDefinition,
  saveFormDefinition,
  updateFormDefinition,
  insertFormSubmission,
  listFormSubmissions,
  getFormSubmission,
  updateFormSubmission,
  deleteFormSubmissions,
  listPrunableSubmissionIds
};
