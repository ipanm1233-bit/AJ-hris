const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanBaseUrl, getSupabaseConfig, supabaseEnabled, encodeQuery, supabaseRequest } = require('../lib/supabase.js');
const { attendanceToSupabase, attendanceFromSupabase } = require('../lib/attendance-supabase.js');
const { loadAttendance, writeAttendance, dedupeAttendanceRows, buildAttendanceDedupePlan } = require('../lib/attendance-access.js');

test('Supabase attendance provider only enables with complete server configuration', () => {
  const env = { ATTENDANCE_DB_PROVIDER: 'supabase', SUPABASE_URL: 'https://aj-hris.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(60) };
  assert.equal(supabaseEnabled(env), true);
  assert.equal(getSupabaseConfig(env).url, 'https://aj-hris.supabase.co');
  assert.equal(supabaseEnabled({ ...env, ATTENDANCE_DB_PROVIDER: 'firestore' }), false);
  assert.throws(() => cleanBaseUrl('http://example.com'), /HTTPS/);
});

test('Supabase query encoder keeps PostgREST filters encoded', () => {
  assert.equal(encodeQuery({ nik: 'eq.001', order: 'tanggal.desc' }), '?nik=eq.001&order=tanggal.desc');
});

test('new Supabase secret key is sent as apikey and never as a bearer JWT', async () => {
  let request;
  await supabaseRequest('attendance', {
    env: { SUPABASE_URL: 'https://aj-hris.supabase.co', SUPABASE_SECRET_KEY: `sb_secret_${'x'.repeat(48)}` },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, text: async () => '[]' };
    }
  });
  assert.match(request.options.headers.apikey, /^sb_secret_/);
  assert.equal(request.options.headers.authorization, undefined);
});

test('Supabase server configuration rejects publishable and legacy anon keys', () => {
  const base = { SUPABASE_URL: 'https://aj-hris.supabase.co' };
  assert.throws(
    () => getSupabaseConfig({ ...base, SUPABASE_SERVICE_ROLE_KEY: `sb_publishable_${'x'.repeat(48)}` }),
    /Secret key/
  );
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
  assert.throws(
    () => getSupabaseConfig({ ...base, SUPABASE_SERVICE_ROLE_KEY: `${header}.${payload}.${'x'.repeat(48)}` }),
    /service_role key/
  );
});

test('attendance mapping preserves operational fields and normalizes time', () => {
  const row = attendanceToSupabase({ id: 'A1', nik_karyawan: '001', nama: 'Budi', tanggal: '2026-09-18', scan_masuk: '08:01:10', scan_pulang: '17:03', cabang: 'cirebon' });
  assert.equal(row.nik, '001');
  assert.equal(row.scan_masuk, '08:01');
  assert.equal(row.scan_keluar, '17:03');
  assert.equal(row.cabang, 'CIREBON');
  const restored = attendanceFromSupabase({ ...row, scan_masuk: '08:01:00', scan_keluar: '17:03:00' });
  assert.equal(restored.scan_masuk, '08:01');
  assert.equal(restored.scan_keluar, '17:03');
});

test('attendance read falls back to Firestore when Supabase rejects access', async () => {
  const previousProvider = process.env.ATTENDANCE_DB_PROVIDER;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFallback = process.env.ATTENDANCE_FIRESTORE_FALLBACK;
  process.env.ATTENDANCE_DB_PROVIDER = 'supabase';
  process.env.SUPABASE_URL = 'https://aj-hris.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(60);
  process.env.ATTENDANCE_FIRESTORE_FALLBACK = 'true';
  try {
    const rows = await loadAttendance({ db: {} }, { branch: 'Cirebon' }, {
      listAttendance: async () => { throw new Error('Supabase: permission denied for table attendance'); },
      firestoreAttendance: async () => [
        { id: 'ABS-1', nik: '001', tanggal: '2026-09-18', cabang: 'CIREBON', scan_masuk: '08:00' },
        { id: 'ABS-OLD', nik: '001', tanggal: '2026-09-18', cabang: 'CIREBON', scan_keluar: '17:00' }
      ]
    });
    assert.equal(rows.length, 1);
    assert.equal(rows._provider, 'firestore-fallback');
    assert.equal(rows[0].scan_masuk, '08:00');
    assert.equal(rows[0].scan_keluar, '17:00');
  } finally {
    if (previousProvider === undefined) delete process.env.ATTENDANCE_DB_PROVIDER; else process.env.ATTENDANCE_DB_PROVIDER = previousProvider;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousFallback === undefined) delete process.env.ATTENDANCE_FIRESTORE_FALLBACK; else process.env.ATTENDANCE_FIRESTORE_FALLBACK = previousFallback;
  }
});

test('attendance merge removes duplicate employee-date rows across providers', async () => {
  const previousProvider = process.env.ATTENDANCE_DB_PROVIDER;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ATTENDANCE_DB_PROVIDER = 'supabase';
  process.env.SUPABASE_URL = 'https://aj-hris.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(60);
  try {
    const rows = await loadAttendance({ db: {} }, { fromDate: '2026-09-22', toDate: '2026-09-22' }, {
      listAttendance: async () => [{ id: 'SUPA-1', nik: '001', tanggal: '2026-09-22', scan_masuk: '07:45', sumber: 'FINGERPRINT' }],
      firestoreAttendance: async () => [{ id: 'OLD-RANDOM-ID', nik: '001', tanggal: '2026-09-22', scan_keluar: '16:02', sumber: 'IMPORT' }],
      upsertAttendance: async () => []
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'SUPA-1');
    assert.equal(rows[0].scan_masuk, '07:45');
    assert.equal(rows[0].scan_keluar, '16:02');
  } finally {
    if (previousProvider === undefined) delete process.env.ATTENDANCE_DB_PROVIDER; else process.env.ATTENDANCE_DB_PROVIDER = previousProvider;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('dedupe keeps separate dates but one row for the same NIK and date', () => {
  const rows = dedupeAttendanceRows([
    { id: 'A', nik: '001', tanggal: '2026-09-21' },
    { id: 'B', nik: '001', tanggal: '2026-09-22', scan_masuk: '08:00' },
    { id: 'C', nik: '001', tanggal: '2026-09-22', scan_keluar: '17:00', sumber: 'FINGERPRINT' }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.tanggal === '2026-09-22').scan_masuk, '08:00');
  assert.equal(rows.find(row => row.tanggal === '2026-09-22').scan_keluar, '17:00');
});

test('attendance read keeps the mapped ARIP scan and does not backfill a provisional copy', async () => {
  const keys = ['ATTENDANCE_DB_PROVIDER', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ATTENDANCE_FIRESTORE_FALLBACK'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    ATTENDANCE_DB_PROVIDER: 'supabase', SUPABASE_URL: 'https://aj-hris.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(60), ATTENDANCE_FIRESTORE_FALLBACK: 'true'
  });
  const pending = { id: 'ABS-FP-FINGER-CIREBON-66-2026-09-23', nik: 'FINGER-CIREBON-66',
    nama: 'ARIP (BELUM DIPETAKAN)', tanggal: '2026-09-23', cabang: 'CIREBON',
    fingerprint_user_id: '66', sumber: 'FINGERPRINT', klasifikasi_scan: 'IDENTITY_PENDING', scan_masuk: '07:30' };
  const mapped = { id: 'ABS-FP-1022009980-2026-09-23', nik: '1022009980',
    nama: 'ARIP RIYANTO', tanggal: '2026-09-23', cabang: 'CIREBON',
    fingerprint_user_id: '66', sumber: 'FINGERPRINT', auto_assign: true, scan_masuk: '07:30' };
  const migrated = [];
  try {
    const rows = await loadAttendance({ db: {} }, { fromDate: '2026-09-23' }, {
      listAttendance: async () => [pending, mapped],
      firestoreAttendance: async () => [pending],
      upsertAttendance: async values => { migrated.push(...values); return []; }
    });
    assert.deepEqual(rows.map(row => row.nama), ['ARIP RIYANTO']);
    assert.equal(migrated.length, 0);
  } finally {
    keys.forEach(key => previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key]);
  }
});

test('keeps both rows when machine name and historical owner disagree', () => {
  const rows = dedupeAttendanceRows([
    { id: 'PENDING-95', nik: 'FINGER-CIREBON-95', nama: 'MALATRI (BELUM DIPETAKAN)',
      fingerprint_name: 'MALATRI', fingerprint_user_id: '95', tanggal: '2026-09-22', cabang: 'CIREBON', sumber: 'FINGERPRINT' },
    { id: 'IRINE-95', nik: '1082204940', nama: 'IRINE APRILIA DEWI',
      fingerprint_name: 'IRINE', fingerprint_user_id: '95', tanggal: '2026-09-22', cabang: 'CIREBON', sumber: 'FINGERPRINT' }
  ]);
  assert.equal(rows.length, 2);
});

test('dedupe plan merges provisional and mapped fingerprint rows into a complete workday', () => {
  const plan = buildAttendanceDedupePlan([
    {
      id: 'ABS-FP-FINGER-CIREBON-110-2026-09-21', nik: 'FINGER-CIREBON-110', tanggal: '2026-09-21',
      cabang: 'CIREBON', fingerprint_user_id: '110', scan_masuk: '07:45', auto_assign: false
    },
    {
      id: 'ABS-FP-1112307980-2026-09-21', nik: '1112307980', tanggal: '2026-09-21',
      cabang: 'CIREBON', fingerprint_user_id: '110', scan_keluar: '16:03', auto_assign: true, sumber: 'FINGERPRINT'
    }
  ]);
  assert.equal(plan.groups, 1);
  assert.deepEqual(plan.deleteIds, ['ABS-FP-FINGER-CIREBON-110-2026-09-21']);
  assert.equal(plan.updates[0].nik, '1112307980');
  assert.equal(plan.updates[0].scan_masuk, '07:45');
  assert.equal(plan.updates[0].scan_keluar, '16:03');
});

test('attendance correction falls back to Firestore when Supabase write is denied', async () => {
  const previousProvider = process.env.ATTENDANCE_DB_PROVIDER;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ATTENDANCE_DB_PROVIDER = 'supabase';
  process.env.SUPABASE_URL = 'https://aj-hris.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(60);
  const writes = [];
  const db = {
    batch: () => ({
      set: (ref, payload) => writes.push({ ref, payload }),
      commit: async () => {}
    }),
    collection: () => ({ doc: id => ({ id }) })
  };
  try {
    await writeAttendance({ db }, [{ id: 'ABS-1', nik: '001', tanggal: '2026-09-22', scan_masuk: '08:00' }], {
      upsertAttendance: async () => { throw new Error('Supabase: permission denied for table attendance'); }
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].ref.id, 'ABS-1');
    assert.equal(writes[0].payload.scan_masuk, '08:00');
  } finally {
    if (previousProvider === undefined) delete process.env.ATTENDANCE_DB_PROVIDER; else process.env.ATTENDANCE_DB_PROVIDER = previousProvider;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
