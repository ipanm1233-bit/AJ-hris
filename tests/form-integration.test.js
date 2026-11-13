const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeGoogleFormId,
  normalizeFieldDefinitions,
  buildDefaultFieldMap,
  normalizeAnswers,
  matchAnswersToFields,
  normalizeSubmissionPayload,
  signFormPayload,
  verifyFormSignature,
  buildAppsScript
} = require('../lib/form-integration.js');
const {
  definitionFromRow,
  submissionToRow,
  submissionFromRow
} = require('../lib/forms-supabase.js');
const { consumeMemoryBucket, consumeDistributedBucket, resetMemoryBuckets } = require('../lib/rate-limit.js');
const { clampBatchSize, clampPageSize, payloadWithinLimit, FORM_INTEGRATION_LIMITS } = require('../lib/free-tier.js');
const { _test: formAccessTest } = require('../lib/form-access.js');

function fakeFirestore({ formCfg = {}, employee = null, existingPengajuan = null, formExists = true } = {}) {
  const writes = [];
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name === 'data_pengajuan') {
                return {
                  id,
                  exists: Boolean(existingPengajuan),
                  data: () => existingPengajuan || {}
                };
              }
              if (name === 'form_config') {
                return {
                  id,
                  exists: formExists,
                  data: () => formCfg
                };
              }
              return {
                id,
                exists: Boolean(employee) && employee.nik_karyawan === id,
                data: () => employee || {}
              };
            },
            async set(payload) {
              writes.push({ name, id, payload });
            }
          };
        },
        where() {
          return {
            limit() {
              return {
                async get() {
                  return employee
                    ? { empty: false, docs: [{ id: employee.nik_karyawan, data: () => employee }] }
                    : { empty: true, docs: [] };
                }
              };
            }
          };
        }
      };
    }
  };
  return { db, writes };
}

function submissionFixture(overrides = {}) {
  return {
    id: 'RESP-1',
    submitted_at: '2026-11-10T03:00:00.000Z',
    respondent_email: 'budi@andela.co.id',
    respondent_name: 'Budi',
    mapped: { nama_karyawan: 'Budi Santoso', alasan: 'Keluarga' },
    ...overrides
  };
}

test('normalizeGoogleFormId menerima URL edit, URL isian, open?id, dan ID mentah', () => {
  assert.equal(normalizeGoogleFormId('https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit'), '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890');
  assert.equal(normalizeGoogleFormId('https://docs.google.com/forms/d/e/1FAIpQLScDEF456/viewform'), '1FAIpQLScDEF456');
  assert.equal(normalizeGoogleFormId('https://docs.google.com/forms/d/1FAIpQLScDEF456/viewform?usp=sf_link'), '1FAIpQLScDEF456');
  assert.equal(normalizeGoogleFormId('https://docs.google.com/forms/d/1FAIpQLScDEF456'), '1FAIpQLScDEF456');
  assert.equal(normalizeGoogleFormId('1FAIpQLScDEF456'), '1FAIpQLScDEF456');
  assert.equal(normalizeGoogleFormId('bukan id'), '');
});

test('normalizeFieldDefinitions membersihkan nama variabel dan membatasi opsi', () => {
  const fields = normalizeFieldDefinitions([
    { name: 'Nama Karyawan!', label: 'Nama Karyawan', type: 'text', required: true },
    { name: '', label: 'Tanpa Nama', type: 'radio', options: ['A', 'B', ''] }
  ]);
  assert.equal(fields.length, 2);
  assert.equal(fields[0].name, 'Nama_Karyawan_');
  assert.equal(fields[0].required, true);
  assert.deepEqual(fields[1].options, ['A', 'B']);
});

test('buildDefaultFieldMap memakai label HRIS dan mempertahankan pemetaan tersimpan', () => {
  const fields = [
    { name: 'nama', label: 'Nama Lengkap', type: 'text', required: true },
    { name: 'alasan', label: 'Alasan', type: 'textarea' }
  ];
  const map = buildDefaultFieldMap(fields, [
    { target: 'nama', question: 'Nama sesuai KTP', required: true }
  ]);
  assert.equal(map[0].question, 'Nama sesuai KTP');
  assert.equal(map[1].question, 'Alasan');
  assert.equal(map[0].required, true);
});

test('matchAnswersToFields mencocokkan judul persis, mirip, dan menandai wajib yang kosong', () => {
  const answers = normalizeAnswers([
    { question: 'Nama Lengkap', answer: 'Budi' },
    { question: 'Alasan Cuti?', answer: 'Keluarga' }
  ]);
  const result = matchAnswersToFields([
    { target: 'nama', question: 'Nama Lengkap', required: true },
    { target: 'alasan', question: 'Alasan Cuti', required: true },
    { target: 'nik', question: 'NIK', required: true }
  ], answers);
  assert.equal(result.mapped.nama, 'Budi');
  assert.equal(result.mapped.alasan, 'Keluarga');
  assert.deepEqual(result.missing, ['nik']);
  assert.equal(result.answeredCount, 2);
});

test('normalizeSubmissionPayload menghasilkan baris idempoten dan menolak payload tidak valid', () => {
  const definition = {
    id: 'F-CUTI',
    google_form_id: '1FAIpQLScDEF456',
    field_map: [{ target: 'nama', question: 'Nama', required: true }]
  };
  const submission = normalizeSubmissionPayload({
    submission_id: 'RESP-001',
    submitted_at: '2026-11-10T03:00:00.000Z',
    respondent_email: 'Budi@Andela.co.id',
    answers: [{ question: 'Nama', answer: 'Budi' }]
  }, definition);
  assert.equal(submission.id, 'RESP-001');
  assert.equal(submission.formId, 'F-CUTI');
  assert.equal(submission.respondentEmail, 'budi@andela.co.id');
  assert.equal(submission.mapped.nama, 'Budi');
  assert.equal(submission.status, 'RECEIVED');

  assert.throws(() => normalizeSubmissionPayload({ answers: [{ question: 'Nama', answer: 'Budi' }] }, definition), /ID respons/);
  assert.throws(() => normalizeSubmissionPayload({ submission_id: 'RESP-002', answers: [] }, definition), /jawaban/);
});

test('signFormPayload dan verifyFormSignature memakai HMAC-SHA256 timing-safe', () => {
  const raw = JSON.stringify({ action: 'form_ingest', id: 'X1' });
  const signature = signFormPayload('rahasia', raw);
  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.equal(verifyFormSignature('rahasia', raw, signature), true);
  assert.equal(verifyFormSignature('rahasia', raw, `sha256=${signature}`), true);
  assert.equal(verifyFormSignature('rahasia', raw, signature.toUpperCase()), true);
  assert.equal(verifyFormSignature('salah', raw, signature), false);
  assert.equal(verifyFormSignature('rahasia', raw, 'tidak-valid'), false);
});

test('buildAppsScript menghasilkan skrip Apps Script yang valid dan memuat HMAC', () => {
  const script = buildAppsScript({
    webhookUrl: 'https://hris.andelajaya.co.id/api/sync-absen',
    secret: 'abc123',
    formId: 'F-CUTI',
    formName: 'Formulir Cuti',
    fields: [
      { name: 'nama', label: 'Nama', type: 'text', required: true },
      { name: 'alasan', label: 'Alasan', type: 'textarea' }
    ]
  });
  assert.match(script, /function setupCreateForm\(\)/);
  assert.match(script, /function onFormSubmit\(e\)/);
  assert.match(script, /computeHmacSha256Signature/);
  assert.match(script, /https:\/\/hris\.andelajaya\.co\.id\/api\/sync-absen/);
  assert.match(script, /F-CUTI/);
  assert.doesNotThrow(() => new Function(script));
});

test('definitionFromRow menyembunyikan kunci webhook kecuali diminta', () => {
  const row = {
    id: 'F-CUTI', nama_form: 'Cuti', google_form_id: 'GF1', google_form_url: '',
    field_map: [{ target: 'nama', question: 'Nama' }], schema_fields: [], active: true,
    webhook_secret: 'secret-value', created_at: '2026-11-10T00:00:00Z'
  };
  const publicView = definitionFromRow(row);
  assert.equal(publicView.has_secret, true);
  assert.equal(publicView.webhook_secret, undefined);
  assert.equal(definitionFromRow(row, { includeSecret: true }).webhook_secret, 'secret-value');
});

test('submissionToRow dan submissionFromRow menjaga idempotensi dan status', () => {
  const row = submissionToRow({
    id: 'RESP-1', form_id: 'F-CUTI', submitted_at: '2026-11-10T03:00:00.000Z',
    respondent_email: 'A@B.COM', answers: [{ question: 'Nama', answer: 'A' }],
    mapped: { nama: 'A' }, status: 'IMPORTED', imported_id: 'TRX-GF-RESP-1'
  });
  assert.equal(row.status, 'IMPORTED');
  assert.equal(row.imported_id, 'TRX-GF-RESP-1');
  const parsed = submissionFromRow({ ...row, received_at: '2026-11-10T03:01:00Z' });
  assert.equal(parsed.mapped.nama, 'A');
  assert.equal(parsed.answers[0].question, 'Nama');
});

test('rate limiter memori mereset bucket setelah jendela berakhir', () => {
  resetMemoryBuckets();
  const first = consumeMemoryBucket({ namespace: 'test', key: 'ip', limit: 2, windowMs: 1_000, now: 1_000 });
  const second = consumeMemoryBucket({ namespace: 'test', key: 'ip', limit: 2, windowMs: 1_000, now: 1_001 });
  const third = consumeMemoryBucket({ namespace: 'test', key: 'ip', limit: 2, windowMs: 1_000, now: 1_002 });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  const afterWindow = consumeMemoryBucket({ namespace: 'test', key: 'ip', limit: 2, windowMs: 1_000, now: 2_500 });
  assert.equal(afterWindow.allowed, true);
  assert.equal(afterWindow.remaining, 1);
  resetMemoryBuckets();
});

test('rate limiter terdistribusi memanggil RPC Supabase dengan parameter benar', async () => {
  let captured = null;
  const result = await consumeDistributedBucket(
    { namespace: 'form-ingest-minute', key: 'F-CUTI', limit: 120, windowMs: 60_000 },
    {
      request: async (path, options) => {
        captured = { path, options };
        return [{ allowed: false, remaining: 0, reset_at: '2026-11-10T03:01:00.000Z' }];
      }
    }
  );
  assert.equal(captured.path, 'rpc/consume_rate_limit');
  assert.equal(captured.options.method, 'POST');
  assert.deepEqual(captured.options.body, {
    p_namespace: 'form-ingest-minute',
    p_key: 'F-CUTI',
    p_limit: 120,
    p_window_seconds: 60
  });
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
});

test('batas free tier membatasi batch, halaman, dan ukuran payload', () => {
  assert.equal(clampBatchSize(500), FORM_INTEGRATION_LIMITS.maxImportBatch);
  assert.equal(clampBatchSize(-1), 0);
  assert.equal(clampPageSize(999), FORM_INTEGRATION_LIMITS.maxInboxPageSize);
  assert.equal(clampPageSize(0, 50), 50);
  assert.equal(payloadWithinLimit('x'.repeat(100)), true);
  assert.equal(payloadWithinLimit('x'.repeat(FORM_INTEGRATION_LIMITS.maxPayloadBytes + 1)), false);
});

test('impor Google Form membuat pengajuan MENUNGGU yang kompatibel dengan menu Approval', async () => {
  const { importSubmissionToFirestore } = formAccessTest;
  const employee = { nik_karyawan: '320101', nama_karyawan: 'Budi Santoso', email: 'budi@andela.co.id', cabang: 'Cirebon' };
  const { db, writes } = fakeFirestore({
    employee,
    formCfg: {
      nama_form: 'Formulir Cuti',
      approval_flow: 'ATASAN, HRD',
      requires_lpj: true,
      lpj_deadline_days: 5
    }
  });
  const definition = { id: 'F-CUTI', nama_form: 'Formulir Cuti', google_form_id: 'GF-1' };
  const result = await importSubmissionToFirestore(
    { db },
    definition,
    submissionFixture(),
    { uid: 'HRD-1' }
  );

  assert.equal(result.importedId, 'TRX-GF-RESP-1');
  assert.equal(result.duplicate, false);
  const payload = writes[0].payload;
  assert.equal(payload.nik, '320101');
  assert.equal(payload.nama_pemohon, 'Budi Santoso');
  assert.equal(payload.status_final, 'MENUNGGU');
  assert.deepEqual(payload.approval_flow, ['ATASAN', 'HRD']);
  assert.deepEqual(payload.approval_steps, ['PENDING', 'PENDING']);
  assert.equal(payload.notification_status, 'MENUNGGU_PENGIRIMAN_MANUAL');
  assert.equal(payload.lpj_status, 'BELUM');
  assert.equal(payload.lpj_due_date, null);
  assert.equal(payload.detail.alasan, 'Keluarga');
  assert.equal(payload.sumber, 'GOOGLE_FORM');
  assert.equal(payload.google_submission_id, 'RESP-1');
});

test('impor Google Form tanpa alur approval langsung final dan memasang tenggat LPJ', async () => {
  const { importSubmissionToFirestore } = formAccessTest;
  const { db, writes } = fakeFirestore({
    formCfg: { nama_form: 'Formulir Absen', approval_flow: [], requires_lpj: true, lpj_deadline_days: 3 }
  });
  const definition = { id: 'F-ABSEN', nama_form: 'Formulir Absen', google_form_id: '' };
  await importSubmissionToFirestore({ db }, definition, submissionFixture(), { uid: 'HRD-1' });

  const payload = writes[0].payload;
  assert.equal(payload.status_final, 'APPROVED FINAL');
  assert.deepEqual(payload.approval_steps, []);
  assert.equal(payload.notification_status, null);
  assert.equal(
    payload.lpj_due_date,
    new Date('2026-11-13T03:00:00.000Z').toISOString()
  );
});

test('impor Google Form bersifat idempoten terhadap dokumen pengajuan yang sudah ada', async () => {
  const { importSubmissionToFirestore } = formAccessTest;
  const { db, writes } = fakeFirestore({ existingPengajuan: { id: 'TRX-GF-RESP-1' } });
  const result = await importSubmissionToFirestore(
    { db },
    { id: 'F-CUTI', nama_form: 'Cuti' },
    submissionFixture(),
    { uid: 'HRD-1' }
  );
  assert.equal(result.duplicate, true);
  assert.equal(result.importedId, 'TRX-GF-RESP-1');
  assert.equal(writes.length, 0);
});
