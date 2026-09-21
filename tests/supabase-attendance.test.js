const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanBaseUrl, getSupabaseConfig, supabaseEnabled, encodeQuery } = require('../lib/supabase.js');
const { attendanceToSupabase, attendanceFromSupabase } = require('../lib/attendance-supabase.js');
const { loadAttendance } = require('../lib/attendance-access.js');

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
      firestoreAttendance: async () => [{ id: 'ABS-1', nik: '001', cabang: 'CIREBON' }]
    });
    assert.equal(rows.length, 1);
    assert.equal(rows._provider, 'firestore-fallback');
  } finally {
    if (previousProvider === undefined) delete process.env.ATTENDANCE_DB_PROVIDER; else process.env.ATTENDANCE_DB_PROVIDER = previousProvider;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousFallback === undefined) delete process.env.ATTENDANCE_FIRESTORE_FALLBACK; else process.env.ATTENDANCE_FIRESTORE_FALLBACK = previousFallback;
  }
});
