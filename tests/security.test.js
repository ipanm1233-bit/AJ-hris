const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertAllowedKeys,
  enforceRateLimit,
  requireCronSecret,
  normalizeRole,
  normalizeBranch
} = require('../lib/security.js');
const { _test: izinAccessTest } = require('../lib/izin-access.js');

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('normalizes role and branch values', () => {
  assert.equal(normalizeRole(' hrd '), 'HRD');
  assert.equal(normalizeBranch(' Cirebon '), 'cirebon');
});

test('rejects unexpected request fields', () => {
  assert.throws(() => assertAllowedKeys({ username: 'A', role: 'HRD' }, ['username']), /role/);
});

test('rate limiter rejects calls above limit', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.1' } };
  assert.equal(enforceRateLimit(req, responseMock(), { namespace: 'test', limit: 1 }), true);
  const res = responseMock();
  assert.equal(enforceRateLimit(req, res, { namespace: 'test', limit: 1 }), false);
  assert.equal(res.statusCode, 429);
});

test('cron secret uses bearer authorization', () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret-value-123456789';
  try {
    const okReq = { headers: { authorization: 'Bearer test-secret-value-123456789' } };
    assert.equal(requireCronSecret(okReq, responseMock()), true);
    const res = responseMock();
    assert.equal(requireCronSecret({ headers: {} }, res), false);
    assert.equal(res.statusCode, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test('attendance PIC endpoint enforces auth, explicit actions, branch scope, and batch limit', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'attendance-access.js'), 'utf8');
  const endpoint = fs.readFileSync(path.join(__dirname, '..', 'api', 'sync-absen.js'), 'utf8');
  assert.match(source, /requireFirebaseAuth\(req, res\)/);
  assert.match(source, /absensi\.data\.view_all/);
  assert.match(source, /absensi\.data\.edit/);
  assert.match(source, /normalizeBranch\(cabang\).*normalizeBranch\(userBranch\)/s);
  assert.match(source, /changes\.length > 400/);
  assert.match(source, /BULK_ATTENDANCE_CORRECTION/);
  assert.match(endpoint, /startsWith\('attendance_'\)/);
});

test('izin endpoint validates calendar dates and uses authenticated server access', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'izin-access.js'), 'utf8');
  const endpoint = fs.readFileSync(path.join(__dirname, '..', 'api', 'sync-absen.js'), 'utf8');
  assert.equal(izinAccessTest.isYmd('2026-09-16'), true);
  assert.equal(izinAccessTest.isYmd('2026-02-30'), false);
  assert.match(source, /requireFirebaseAuth\(req, res\)/);
  assert.match(source, /Anda tidak berhak membuat izin atas nama karyawan lain/);
  assert.match(source, /IZIN_CREATED/);
  assert.match(endpoint, /startsWith\('izin_'\)/);
});

test('training workflow uses scoped Firestore rules instead of signed-in global writes', () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  assert.match(rules, /match \/training_tna_assignments\/\{id\}/);
  assert.match(rules, /match \/training_needs\/\{id\}/);
  assert.match(rules, /match \/training_plans\/\{id\}/);
  assert.match(rules, /match \/training_progress\/\{id\}/);
  assert.match(rules, /training_plans[\s\S]*role\(\) in \['GM', 'DIREKTUR'\][\s\S]*role\(\) == 'FINANCE'/);
  assert.doesNotMatch(rules, /collectionName in \['training_plans', 'training_progress'\]/);
  assert.doesNotMatch(rules, /'uang_makan_expedisi', 'data_training'/);
});
