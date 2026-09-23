const test = require('node:test');
const assert = require('node:assert/strict');
const { salesTrackingSupabaseEnabled } = require('../lib/supabase.js');
const {
  visitToSupabase, visitFromSupabase, getSalesVisitsByIds, odometerToSupabase, odometerFromSupabase
} = require('../lib/sales-tracking-supabase.js');
const { loadProviderRows, loadVisitsForPatch, writeProviderRows, mergeRows, applyScope } = require('../lib/sales-tracking-access.js');

const configuredEnv = {
  SALES_TRACKING_DB_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://aj-hris.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(60)
};

function withSalesEnv(fn) {
  const keys = Object.keys(configuredEnv);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, configuredEnv);
  return Promise.resolve().then(fn).finally(() => keys.forEach(key => {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }));
}

test('sales tracking provider has an independent migration switch', () => {
  assert.equal(salesTrackingSupabaseEnabled(configuredEnv), true);
  assert.equal(salesTrackingSupabaseEnabled({ ...configuredEnv, SALES_TRACKING_DB_PROVIDER: 'firestore' }), false);
});

test('visit and odometer mappings preserve operational route fields', () => {
  const visit = visitToSupabase({ id: 'V1', sales_nik: 'S01', sales_nama: 'Ani', cabang: 'cirebon', tanggal: '2026-09-22', lat: '-6.7', lng: '108.5', toko_outlet: 'Toko A', is_effective_call: true });
  assert.equal(visit.cabang, 'CIREBON');
  assert.equal(visit.lat, -6.7);
  assert.equal(visit.is_effective_call, true);
  assert.equal(visitFromSupabase(visit).toko_outlet, 'Toko A');
  const odometer = odometerToSupabase({ sales_nik: 'S01', tanggal: '2026-09-22', km_awal: 100, km_akhir: 125, start_gps: '-6.7,108.5' });
  assert.equal(odometer.id, 'ODM-S01-2026-09-22');
  assert.equal(odometerFromSupabase(odometer).km_akhir, 125);
});

test('dual read merges Firestore and Supabase without duplicating visits', async () => withSalesEnv(async () => {
  const result = await loadProviderRows({ db: {} }, 'visits', {}, {
    listSupabase: async () => [{ id: 'V1', tanggal: '2026-09-22', sales_nik: 'S01', status_kunjungan: 'EC' }],
    listFirestore: async () => [{ id: 'V1', tanggal: '2026-09-22', sales_nik: 'S01', toko_outlet: 'Toko A' }, { id: 'V2', tanggal: '2026-09-22', sales_nik: 'S01' }],
    upsertSupabase: async rows => rows
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find(row => row.id === 'V1').toko_outlet, 'Toko A');
  assert.equal(result.rows.find(row => row.id === 'V1').status_kunjungan, 'EC');
  assert.equal(result.provider, 'supabase+firestore');
}));

test('Supabase read and write failures safely fall back to Firestore', async () => withSalesEnv(async () => {
  const fallback = await loadProviderRows({ db: {} }, 'visits', {}, {
    listSupabase: async () => { throw new Error('permission denied'); },
    listFirestore: async () => [{ id: 'V1', tanggal: '2026-09-22', sales_nik: 'S01' }]
  });
  assert.equal(fallback.provider, 'firestore-fallback');
  const writes = [];
  const db = {
    batch: () => ({ set: (ref, payload) => writes.push({ ref, payload }), commit: async () => {} }),
    collection: () => ({ doc: id => ({ id }) })
  };
  await writeProviderRows({ db }, 'visits', [{ id: 'V1', tanggal: '2026-09-22', sales_nik: 'S01' }], {
    writeSupabase: async () => { throw new Error('permission denied'); }
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ref.id, 'V1');
}));

test('row merge keeps one odometer per sales employee and date', () => {
  const rows = mergeRows(
    [{ id: 'OLD', sales_nik: 'S01', tanggal: '2026-09-22', km_awal: 100 }],
    [{ id: 'ODM-S01-2026-09-22', sales_nik: 'S01', tanggal: '2026-09-22', km_akhir: 125 }],
    row => `${row.sales_nik}|${row.tanggal}`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].km_awal, 100);
  assert.equal(rows[0].km_akhir, 125);
});

test('leader scope trusts employee master branch, not browser supplied branch', async () => {
  const db = { collection: () => ({ get: async () => ({ docs: [
    { data: () => ({ nik_karyawan: 'S01', cabang: 'MALANG' }) },
    { data: () => ({ nik_karyawan: 'S02', cabang: 'CIREBON' }) }
  ] }) }) };
  const rows = await applyScope(
    { db, user: { role: 'SPV', branch: 'MALANG' } },
    [
      { id: 'V1', sales_nik: 'S01', cabang: 'CIREBON' },
      { id: 'V2', sales_nik: 'S02', cabang: 'MALANG' }
    ]
  );
  assert.deepEqual(rows.map(row => row.id), ['V1']);
});

test('employee scope permits only the authenticated NIK', async () => {
  const rows = await applyScope(
    { db: {}, user: { role: 'KARYAWAN', nik: 'S01' } },
    [{ id: 'V1', sales_nik: 'S01' }, { id: 'V2', sales_nik: 'S02' }]
  );
  assert.deepEqual(rows.map(row => row.id), ['V1']);
});

test('patch lookup fetches only requested IDs and avoids Firestore when Supabase has them', async () => withSalesEnv(async () => {
  const requested = [];
  const result = await loadVisitsForPatch({ db: {} }, ['V1', 'V2'], {
    getPrimary: async ids => { requested.push(...ids); return ids.map(id => ({ id, sales_nik: 'S01' })); },
    getLegacy: async () => { throw new Error('Firestore should not be read'); }
  });
  assert.deepEqual(requested, ['V1', 'V2']);
  assert.equal(result.size, 2);
}));

test('patch lookup reads only missing visit documents from legacy storage', async () => withSalesEnv(async () => {
  const requested = [];
  const result = await loadVisitsForPatch({ db: {} }, ['V1', 'V2'], {
    getPrimary: async () => [{ id: 'V1', sales_nik: 'S01' }],
    getLegacy: async ids => { requested.push(...ids); return [{ id: 'V2', sales_nik: 'S02' }]; }
  });
  assert.deepEqual(requested, ['V2']);
  assert.equal(result.get('V2').sales_nik, 'S02');
}));

test('Supabase patch lookup filters by visit IDs instead of reading the whole table', async () => withSalesEnv(async () => {
  let requestedUrl;
  await getSalesVisitsByIds(['V1', 'V2'], {
    fetchImpl: async url => {
      requestedUrl = new URL(url);
      return { ok: true, text: async () => '[]' };
    }
  });
  assert.equal(requestedUrl.pathname, '/rest/v1/sales_visits');
  assert.equal(requestedUrl.searchParams.get('id'), 'in.("V1","V2")');
  assert.equal(requestedUrl.searchParams.get('select'), '*');
}));
