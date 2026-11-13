'use strict';

const crypto = require('crypto');
const { requireFirebaseAuth, enforceRateLimit, enforceDistributedRateLimit, writeAuditLog } = require('./security.js');
const { supabaseConfigured } = require('./supabase.js');
const { FORM_INTEGRATION_LIMITS, clampPageSize, clampBatchSize, payloadWithinLimit } = require('./free-tier.js');
const {
  FORM_ID_RE,
  normalizeGoogleFormId,
  normalizeFieldDefinitions,
  buildDefaultFieldMap,
  normalizeSubmissionPayload,
  verifyFormSignature,
  buildAppsScript
} = require('./form-integration.js');
const {
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
} = require('./forms-supabase.js');
const { pruneRateLimitBuckets } = require('./rate-limit.js');

const text = (value, max = 500) => String(value === null || value === undefined ? '' : value).trim().slice(0, max);

function requestOrigin(req) {
  const configured = String(process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configured)) return configured;
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').trim();
  return host ? `${proto}://${host}` : '';
}

function webhookUrlFor(req) {
  return `${requestOrigin(req)}/api/sync-absen`;
}

function publicDefinition(definition) {
  if (!definition) return null;
  return {
    id: definition.id,
    nama_form: definition.nama_form,
    google_form_id: definition.google_form_id,
    google_form_url: definition.google_form_url,
    field_map: definition.field_map,
    schema_fields: definition.schema_fields,
    active: definition.active,
    has_secret: definition.has_secret,
    created_by: definition.created_by,
    updated_by: definition.updated_by,
    created_at: definition.created_at,
    updated_at: definition.updated_at
  };
}

function scriptBundle(req, definition) {
  const fields = Array.isArray(definition.schema_fields) && definition.schema_fields.length
    ? definition.schema_fields
    : definition.field_map;
  return buildAppsScript({
    webhookUrl: webhookUrlFor(req),
    secret: definition.webhook_secret,
    formId: definition.id,
    formName: definition.nama_form,
    fields
  });
}

function normalizeFlow(value) {
  if (Array.isArray(value)) return value.map(item => text(item, 40).toUpperCase()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map(item => text(item, 40).toUpperCase()).filter(Boolean);
  }
  return [];
}

function docIdForSubmission(submissionId) {
  const raw = `TRX-GF-${submissionId}`;
  if (raw.length <= 180) return raw;
  return `TRX-GF-${crypto.createHash('sha1').update(raw).digest('hex')}`;
}

function pickFirst(...values) {
  for (const value of values) {
    const normalized = text(value, 320);
    if (normalized) return normalized;
  }
  return '';
}

async function resolveRespondent(db, submission, mapped = {}) {
  const explicitNik = pickFirst(mapped.nik, mapped.nik_karyawan, mapped.nik_pemohon);
  const explicitName = pickFirst(mapped.nama_karyawan, mapped.nama, mapped.nama_pemohon, submission.respondent_name);
  const email = pickFirst(mapped.email, mapped.email_karyawan, submission.respondent_email).toLowerCase();

  let employee = null;
  let employeeDocId = '';
  if (explicitNik) {
    const snapshot = await db.collection('master_karyawan').doc(explicitNik).get().catch(() => null);
    if (snapshot && snapshot.exists) { employee = snapshot.data(); employeeDocId = snapshot.id; }
  }
  if (!employee && email) {
    const snapshot = await db.collection('master_karyawan').where('email', '==', email).limit(1).get().catch(() => null);
    if (snapshot && !snapshot.empty) { employee = snapshot.docs[0].data(); employeeDocId = snapshot.docs[0].id; }
  }
  if (!employee && explicitName) {
    const snapshot = await db.collection('master_karyawan').where('nama_karyawan', '==', explicitName).limit(1).get().catch(() => null);
    if (snapshot && !snapshot.empty) { employee = snapshot.docs[0].data(); employeeDocId = snapshot.docs[0].id; }
  }

  return {
    employee,
    nik: text(employee?.nik_karyawan || employee?.nik || employeeDocId || explicitNik || '-', 80) || '-',
    name: text(employee?.nama_karyawan || employee?.nama || explicitName || submission.respondent_email || 'Responden Google Form', 200),
    email: text(employee?.email || email, 320),
    branch: text(employee?.cabang || employee?.branch, 120),
    division: text(employee?.divisi || employee?.division, 120),
    position: text(employee?.jabatan || employee?.position, 120)
  };
}

async function importSubmissionToFirestore(context, definition, submission, actor) {
  const db = context.db;
  const trxId = docIdForSubmission(submission.id);
  const existing = await db.collection('data_pengajuan').doc(trxId).get().catch(() => null);
  if (existing && existing.exists) {
    return { importedId: trxId, duplicate: true };
  }

  const formSnapshot = await db.collection('form_config').doc(definition.id).get().catch(() => null);
  const formCfg = formSnapshot && formSnapshot.exists ? formSnapshot.data() : {};
  const approvalFlow = normalizeFlow(formCfg.approval_flow);
  const mapped = submission.mapped && typeof submission.mapped === 'object' ? submission.mapped : {};
  const respondent = await resolveRespondent(db, submission, mapped);
  const requiresLpj = formCfg.requires_lpj === true;
  const lpjDeadlineDays = Number(formCfg.lpj_deadline_days) || 7;
  const statusFinal = approvalFlow.length ? 'MENUNGGU' : 'APPROVED FINAL';
  const lpjDueDate = requiresLpj && !approvalFlow.length
    ? new Date(new Date(submission.submitted_at || Date.now()).getTime() + lpjDeadlineDays * 24 * 60 * 60_000).toISOString()
    : null;

  const payload = {
    id: trxId,
    tgl: submission.submitted_at || new Date().toISOString(),
    nik: respondent.nik,
    nama_pemohon: respondent.name,
    email_pemohon: respondent.email,
    cabang: respondent.branch,
    divisi: respondent.division,
    jabatan: respondent.position,
    form_id: definition.id,
    nama_form: text(formCfg.nama_form || definition.nama_form, 200),
    detail: mapped,
    lampiran_url: mapped.url_pdf || mapped.lampiran || null,
    approval_flow: approvalFlow,
    approval_steps: approvalFlow.map(() => 'PENDING'),
    status_final: statusFinal,
    catatan_penolakan: [],
    notification_status: approvalFlow.length ? 'MENUNGGU_PENGIRIMAN_MANUAL' : null,
    requires_lpj: requiresLpj,
    lpj_deadline_days: requiresLpj ? lpjDeadlineDays : null,
    lpj_fields_json: requiresLpj ? (Array.isArray(formCfg.lpj_fields_json) ? formCfg.lpj_fields_json : []) : [],
    lpj_status: requiresLpj ? 'BELUM' : null,
    lpj_due_date: lpjDueDate,
    lpj_detail: null,
    notify_user_rules: Array.isArray(formCfg.notify_user_rules) ? formCfg.notify_user_rules : [],
    notify_specific_users: Array.isArray(formCfg.notify_specific_users) ? formCfg.notify_specific_users : [],
    notify_targets: formCfg.notify_targets || null,
    sumber: 'GOOGLE_FORM',
    google_form_id: definition.google_form_id || '',
    google_submission_id: submission.id,
    diimpor_oleh: actor?.uid || 'SYSTEM',
    diimpor_pada: new Date().toISOString()
  };

  await db.collection('data_pengajuan').doc(trxId).set(payload, { merge: false });
  return { importedId: trxId, duplicate: false, payload };
}

async function handleIngest(req, res, body) {
  if (!supabaseConfigured()) {
    return res.status(503).json({ success: false, error: 'Integrasi Google Form belum diaktifkan di server.' });
  }

  const formId = text(body?.form_id, 120);
  if (!FORM_ID_RE.test(formId)) {
    return res.status(400).json({ success: false, error: 'ID formulir HRIS tidak valid.' });
  }
  if (!payloadWithinLimit(req.rawBody || body)) {
    return res.status(413).json({ success: false, error: 'Payload respons Google Form terlalu besar.' });
  }

  // Batas per IP di memori lebih dulu: murah, tidak menyentuh database, dan
  // mencegah pihak luar menghabiskan kuota harian formulir tanpa kunci HMAC.
  if (!enforceRateLimit(req, res, {
    namespace: 'form-ingest-ip',
    limit: 60,
    windowMs: 60_000
  })) return false;

  const definition = await getFormDefinition(formId, { includeSecret: true });
  if (!definition || definition.active === false) {
    return res.status(404).json({ success: false, error: 'Formulir HRIS belum terhubung ke Google Form.' });
  }

  const signature = req.headers?.['x-form-signature'] || req.headers?.['x-hris-signature'];
  if (!definition.webhook_secret || !verifyFormSignature(definition.webhook_secret, req.rawBody, signature)) {
    return res.status(401).json({ success: false, error: 'Tanda tangan webhook tidak valid.' });
  }

  const perMinute = await enforceDistributedRateLimit(req, res, {
    namespace: 'form-ingest-minute',
    key: formId,
    limit: FORM_INTEGRATION_LIMITS.maxSubmissionsPerMinutePerForm,
    windowMs: 60_000
  });
  if (!perMinute) return false;

  const perDay = await enforceDistributedRateLimit(req, res, {
    namespace: 'form-ingest-day',
    key: formId,
    limit: FORM_INTEGRATION_LIMITS.maxSubmissionsPerFormPerDay,
    windowMs: 24 * 60 * 60_000
  });
  if (!perDay) return false;

  let submission;
  try {
    submission = normalizeSubmissionPayload(body, definition);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const inserted = await insertFormSubmission({
    id: submission.id,
    form_id: submission.formId,
    google_form_id: submission.googleFormId,
    submitted_at: submission.submittedAt,
    respondent_email: submission.respondentEmail,
    respondent_name: submission.respondentName,
    answers: submission.answers,
    mapped: submission.mapped,
    status: 'RECEIVED',
    payload: submission.payload
  });

  if (!inserted) {
    return res.status(200).json({ success: true, duplicate: true, id: submission.id });
  }

  return res.status(200).json({
    success: true,
    id: submission.id,
    mapped_fields: Object.keys(submission.mapped).length,
    missing_required: submission.missing
  });
}

async function requireFormAdmin(req, res) {
  const context = await requireFirebaseAuth(req, res, { roles: ['HRD', 'SUPERADMIN'] });
  if (!context) return null;
  if (!enforceRateLimit(req, res, {
    namespace: 'form-admin',
    key: context.user.uid,
    limit: 180,
    windowMs: 60 * 60_000
  })) return null;
  return context;
}

async function buildDefinitionFromInput(req, body, context, existing) {
  const formId = text(body.formId || body.form_id || existing?.id, 120);
  if (!FORM_ID_RE.test(formId)) throw new Error('ID formulir HRIS tidak valid.');

  const fields = normalizeFieldDefinitions(body.fields || body.schema_fields || existing?.schema_fields);
  if (!fields.length) throw new Error('Formulir harus memiliki minimal satu kolom sebelum dihubungkan.');
  if (fields.length > FORM_INTEGRATION_LIMITS.maxFieldsPerForm) throw new Error('Jumlah kolom formulir melebihi batas.');

  const googleFormId = normalizeGoogleFormId(body.googleFormId || body.google_form_id || existing?.google_form_id);
  const fieldMap = buildDefaultFieldMap(fields, body.fieldMap || body.field_map || existing?.field_map);
  const secret = existing?.webhook_secret || crypto.randomBytes(32).toString('hex');

  return {
    id: formId,
    nama_form: text(body.namaForm || body.nama_form || existing?.nama_form || formId, 200),
    google_form_id: googleFormId,
    google_form_url: text(body.googleFormUrl || body.google_form_url || existing?.google_form_url
      || (googleFormId ? `https://docs.google.com/forms/d/${googleFormId}/edit` : ''), 500),
    field_map: fieldMap,
    schema_fields: fields,
    webhook_secret: secret,
    active: body.active !== false,
    created_by: existing?.created_by || context.user.uid,
    updated_by: context.user.uid
  };
}

async function handleSubmitList(req, res, context) {
  const definitions = await listFormDefinitions({ limit: 200 });
  return res.status(200).json({
    success: true,
    configured: true,
    definitions: definitions.map(publicDefinition),
    limits: FORM_INTEGRATION_LIMITS
  });
}

async function handleRegister(req, res, body, context) {
  let existing = null;
  let definition = null;
  try {
    existing = await getFormDefinition(text(body.formId || body.form_id), { includeSecret: true });
    definition = await buildDefinitionFromInput(req, body, context, existing);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  const saved = await saveFormDefinition(definition);
  if (!saved) return res.status(500).json({ success: false, error: 'Definisi integrasi gagal disimpan.' });
  await writeAuditLog(context.db, req, context.user, {
    action: existing ? 'FORM_INTEGRATION_UPDATED' : 'FORM_INTEGRATION_CREATED',
    module: 'FORM_BUILDER',
    recordId: saved.id,
    metadata: { google_form_id: saved.google_form_id, fields: saved.schema_fields.length }
  });
  return res.status(200).json({
    success: true,
    definition: publicDefinition(saved),
    webhookUrl: webhookUrlFor(req),
    appsScript: scriptBundle(req, saved)
  });
}

async function handleUpdate(req, res, body, context) {
  const formId = text(body.formId || body.form_id, 120);
  if (!FORM_ID_RE.test(formId)) return res.status(400).json({ success: false, error: 'ID formulir HRIS tidak valid.' });
  const existing = await getFormDefinition(formId, { includeSecret: true });
  if (!existing) return res.status(404).json({ success: false, error: 'Integrasi formulir belum terdaftar.' });

  const patch = { updated_by: context.user.uid };
  if (body.googleFormId !== undefined || body.google_form_id !== undefined) {
    patch.google_form_id = normalizeGoogleFormId(body.googleFormId || body.google_form_id);
  }
  if (body.googleFormUrl !== undefined || body.google_form_url !== undefined) {
    patch.google_form_url = text(body.googleFormUrl || body.google_form_url, 500);
  }
  if (body.active !== undefined) patch.active = body.active !== false;
  if (body.fields || body.schema_fields) {
    const fields = normalizeFieldDefinitions(body.fields || body.schema_fields);
    if (!fields.length) return res.status(400).json({ success: false, error: 'Formulir harus memiliki minimal satu kolom.' });
    patch.schema_fields = fields;
    patch.field_map = buildDefaultFieldMap(fields, body.fieldMap || body.field_map || existing.field_map);
  } else if (body.fieldMap || body.field_map) {
    patch.field_map = buildDefaultFieldMap(existing.schema_fields, body.fieldMap || body.field_map);
  }
  if (body.namaForm || body.nama_form) patch.nama_form = text(body.namaForm || body.nama_form, 200);

  const saved = await updateFormDefinition(formId, patch);
  if (!saved) return res.status(404).json({ success: false, error: 'Integrasi formulir tidak ditemukan.' });
  await writeAuditLog(context.db, req, context.user, {
    action: 'FORM_INTEGRATION_UPDATED', module: 'FORM_BUILDER', recordId: formId,
    metadata: { active: saved?.active !== false }
  });
  return res.status(200).json({
    success: true,
    definition: publicDefinition(saved),
    webhookUrl: webhookUrlFor(req),
    appsScript: scriptBundle(req, saved)
  });
}

async function handleRotateSecret(req, res, body, context) {
  const formId = text(body.formId || body.form_id, 120);
  if (!FORM_ID_RE.test(formId)) return res.status(400).json({ success: false, error: 'ID formulir HRIS tidak valid.' });
  const existing = await getFormDefinition(formId, { includeSecret: true });
  if (!existing) return res.status(404).json({ success: false, error: 'Integrasi formulir belum terdaftar.' });

  const secret = crypto.randomBytes(32).toString('hex');
  const saved = await updateFormDefinition(formId, { webhook_secret: secret, updated_by: context.user.uid });
  if (!saved) return res.status(404).json({ success: false, error: 'Integrasi formulir tidak ditemukan.' });
  await writeAuditLog(context.db, req, context.user, {
    action: 'FORM_WEBHOOK_SECRET_ROTATED', module: 'FORM_BUILDER', recordId: formId
  });
  return res.status(200).json({
    success: true,
    definition: publicDefinition(saved),
    webhookUrl: webhookUrlFor(req),
    appsScript: scriptBundle(req, saved)
  });
}

async function handleUnlink(req, res, body, context) {
  const formId = text(body.formId || body.form_id, 120);
  if (!FORM_ID_RE.test(formId)) return res.status(400).json({ success: false, error: 'ID formulir HRIS tidak valid.' });
  const saved = await updateFormDefinition(formId, {
    google_form_id: '',
    google_form_url: '',
    active: false,
    updated_by: context.user.uid
  });
  if (!saved) return res.status(404).json({ success: false, error: 'Integrasi formulir tidak ditemukan.' });
  await writeAuditLog(context.db, req, context.user, {
    action: 'FORM_INTEGRATION_UNLINKED', module: 'FORM_BUILDER', recordId: formId
  });
  return res.status(200).json({ success: true, definition: publicDefinition(saved) });
}

async function handleSubmissions(req, res, body) {
  const submissions = await listFormSubmissions({
    formId: text(body.formId || body.form_id, 120),
    status: text(body.status, 20).toUpperCase(),
    limit: clampPageSize(body.limit, 50),
    offset: Math.max(0, Number(body.offset || 0))
  });
  return res.status(200).json({ success: true, submissions });
}

async function handleImport(req, res, body, context) {
  const formId = text(body.formId || body.form_id, 120);
  if (!FORM_ID_RE.test(formId)) return res.status(400).json({ success: false, error: 'ID formulir HRIS tidak valid.' });
  const allowed = await enforceDistributedRateLimit(req, res, {
    namespace: 'form-import',
    key: context.user.uid,
    limit: FORM_INTEGRATION_LIMITS.maxImportsPerHour,
    windowMs: 60 * 60_000
  });
  if (!allowed) return false;

  const definition = await getFormDefinition(formId);
  if (!definition) return res.status(404).json({ success: false, error: 'Integrasi formulir belum terdaftar.' });

  let ids = Array.isArray(body.submissionIds) ? body.submissionIds.map(id => text(id, 200)).filter(Boolean) : [];
  ids = [...new Set(ids)].slice(0, clampBatchSize(body.batchSize || FORM_INTEGRATION_LIMITS.maxImportBatch));

  if (!ids.length && body.importAll === true) {
    const pending = await listFormSubmissions({
      formId,
      status: 'RECEIVED',
      limit: FORM_INTEGRATION_LIMITS.maxImportBatch
    });
    ids = pending.map(item => item.id);
  }
  if (!ids.length) return res.status(400).json({ success: false, error: 'Tidak ada respons yang dipilih untuk diimpor.' });

  const results = [];
  let imported = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      const submission = await getFormSubmission(id);
      if (!submission || submission.form_id !== formId) {
        results.push({ id, success: false, error: 'Respons tidak ditemukan untuk formulir ini.' });
        failed += 1;
        continue;
      }
      if (submission.status === 'IMPORTED' && submission.imported_id) {
        results.push({ id, success: true, duplicate: true, importedId: submission.imported_id });
        continue;
      }
      const result = await importSubmissionToFirestore(context, definition, submission, context.user);
      await updateFormSubmission(id, {
        status: 'IMPORTED',
        imported_id: result.importedId,
        import_error: ''
      });
      await writeAuditLog(context.db, req, context.user, {
        action: 'FORM_SUBMISSION_IMPORTED', module: 'FORM_BUILDER',
        recordId: result.importedId,
        metadata: { form_id: formId, submission_id: id, duplicate: result.duplicate === true }
      });
      imported += 1;
      results.push({ id, success: true, importedId: result.importedId, duplicate: result.duplicate === true });
    } catch (error) {
      failed += 1;
      await updateFormSubmission(id, { status: 'ERROR', import_error: error.message }).catch(() => null);
      results.push({ id, success: false, error: error.message });
    }
  }

  return res.status(200).json({ success: failed === 0, imported, failed, results });
}

async function handleReject(req, res, body, context) {
  const formId = text(body.formId || body.form_id, 120);
  const ids = Array.isArray(body.submissionIds)
    ? [...new Set(body.submissionIds.map(id => text(id, 200)).filter(Boolean))].slice(0, FORM_INTEGRATION_LIMITS.maxImportBatch)
    : [];
  if (!FORM_ID_RE.test(formId) || !ids.length) {
    return res.status(400).json({ success: false, error: 'Formulir atau respons yang dipilih tidak valid.' });
  }
  const updated = [];
  for (const id of ids) {
    const submission = await getFormSubmission(id);
    if (!submission || submission.form_id !== formId || submission.status === 'IMPORTED') continue;
    updated.push(await updateFormSubmission(id, { status: 'REJECTED', import_error: '' }));
  }
  await writeAuditLog(context.db, req, context.user, {
    action: 'FORM_SUBMISSIONS_REJECTED', module: 'FORM_BUILDER', recordId: formId,
    metadata: { count: updated.length }
  });
  return res.status(200).json({ success: true, rejected: updated.length });
}

async function handleScript(req, res, body, context) {
  const formId = text(body.formId || body.form_id, 120);
  if (!FORM_ID_RE.test(formId)) return res.status(400).json({ success: false, error: 'ID formulir HRIS tidak valid.' });
  const existing = await getFormDefinition(formId, { includeSecret: true });
  if (!existing) return res.status(404).json({ success: false, error: 'Integrasi formulir belum terdaftar.' });
  return res.status(200).json({
    success: true,
    definition: publicDefinition(existing),
    webhookUrl: webhookUrlFor(req),
    appsScript: scriptBundle(req, existing),
    updatedAt: existing.updated_at,
    requestedBy: context.user.uid
  });
}

async function handlePrune(req, res, body, context) {
  const keepDays = Math.max(7, Math.min(365, Number(body.keepDays) || FORM_INTEGRATION_LIMITS.pruneKeepDays));
  const before = new Date(Date.now() - keepDays * 24 * 60 * 60_000).toISOString();
  const ids = await listPrunableSubmissionIds(before, FORM_INTEGRATION_LIMITS.pruneMaxRowsPerRun);
  if (ids.length) await deleteFormSubmissions(ids);
  let buckets = 0;
  try {
    buckets = Number(await pruneRateLimitBuckets({ before: new Date(Date.now() - 24 * 60 * 60_000).toISOString() })) || 0;
  } catch (error) {
    console.warn('[forms] Rate limit prune skipped:', error.message);
  }
  await writeAuditLog(context.db, req, context.user, {
    action: 'FORM_INTEGRATION_PRUNED', module: 'FORM_BUILDER',
    metadata: { submissions: ids.length, rateBuckets: buckets, keepDays }
  });
  return res.status(200).json({ success: true, deletedSubmissions: ids.length, deletedRateBuckets: buckets, keepDays });
}

async function handleFormAccess(req, res, body = {}) {
  const action = text(body?.action, 60);

  if (action === 'form_ingest') return handleIngest(req, res, body);
  if (!action.startsWith('form_')) return false;

  if (!supabaseConfigured()) {
    res.status(503).json({
      success: false,
      error: 'Integrasi Google Form memerlukan SUPABASE_URL dan SUPABASE_SECRET_KEY di server.'
    });
    return true;
  }

  const context = await requireFormAdmin(req, res);
  if (!context) return true;

  try {
    if (action === 'form_list') { await handleSubmitList(req, res, context); return true; }
    if (action === 'form_register') { await handleRegister(req, res, body, context); return true; }
    if (action === 'form_update') { await handleUpdate(req, res, body, context); return true; }
    if (action === 'form_script') { await handleScript(req, res, body, context); return true; }
    if (action === 'form_rotate_secret') { await handleRotateSecret(req, res, body, context); return true; }
    if (action === 'form_unlink') { await handleUnlink(req, res, body, context); return true; }
    if (action === 'form_submissions') { await handleSubmissions(req, res, body); return true; }
    if (action === 'form_import') { await handleImport(req, res, body, context); return true; }
    if (action === 'form_reject') { await handleReject(req, res, body, context); return true; }
    if (action === 'form_prune') { await handlePrune(req, res, body, context); return true; }

    res.status(400).json({ success: false, error: 'Tindakan integrasi Google Form tidak dikenali.' });
    return true;
  } catch (error) {
    console.error('[forms] Action failed:', error);
    res.status(500).json({ success: false, error: error.message || 'Gagal memproses integrasi Google Form.' });
    return true;
  }
}

module.exports = {
  handleFormAccess,
  _test: {
    requestOrigin,
    webhookUrlFor,
    publicDefinition,
    normalizeFlow,
    docIdForSubmission,
    importSubmissionToFirestore
  }
};
