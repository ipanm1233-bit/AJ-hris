const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanBaseUrl, getSupabaseConfig, supabaseEnabled, encodeQuery } = require('../lib/supabase.js');
const { attendanceToSupabase, attendanceFromSupabase } = require('../lib/attendance-supabase.js');

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
