'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planFingerprintReconciliation } = require('../lib/attendance-reconcile.js');
const { loadReconciliationEmployees } = require('../lib/attendance-access.js');

test('Firestore quota allows verified Supabase reconciliation; other database errors still fail', async () => {
  const db = error => ({ collection: () => ({ get: async () => { throw error; } }) });
  const quota = await loadReconciliationEmployees(db({ code: 8, details: 'Quota exceeded.' }));
  assert.deepEqual(quota, { employees: [], masterUnavailable: true });
  await assert.rejects(() => loadReconciliationEmployees(db(new Error('permission denied'))), /permission denied/);
});

test('reconciles uniquely named current owner and preserves an existing morning scan', () => {
  const rows = [
    { id: 'TEMP-81', nik: 'FINGER-CIREBON-81', nama: 'ANGGA (BELUM DIPETAKAN)', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_user_id: '81', fingerprint_name: 'ANGGA', scan_keluar: '16:02', klasifikasi_scan: 'IDENTITY_PENDING' },
    { id: 'ABS-REAL', nik: '1062489830', nama: 'ANGGA ARDIANSAH', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_name: 'ANGGA', scan_masuk: '07:35' }
  ];
  const plan = planFingerprintReconciliation(rows, [{ nik: '1062489830', nama_karyawan: 'ANGGA ARDIANSAH', finger_name: 'ANGGA', cabang: 'CIREBON' }]);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, 'ABS-REAL');
  assert.equal(plan.updates[0].scan_masuk, '07:35');
  assert.equal(plan.updates[0].scan_keluar, '16:02');
  assert.deepEqual(plan.deleteIds, ['TEMP-81']);
});

test('reused ID 95 stays pending when old owner IRINE disagrees with MALATRI', () => {
  const rows = [
    { id: 'TEMP-95', nik: 'FINGER-CIREBON-95', nama: 'MALATRI (BELUM DIPETAKAN)', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_user_id: '95', fingerprint_name: 'MALATRI', scan_masuk: '07:58' },
    { id: 'OLD-95', nik: '1082204940', nama: 'IRINE APRILIA DEWI', tanggal: '2026-09-16', cabang: 'CIREBON', fingerprint_user_id: '95', fingerprint_name: 'IRINE' }
  ];
  const plan = planFingerprintReconciliation(rows, [{ nik: '1082204940', nama_karyawan: 'IRINE APRILIA DEWI', finger_name: 'IRINE', finger_id: '95', cabang: 'CIREBON' }]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unresolved, 1);
  assert.deepEqual(plan.deleteIds, []);
});

test('reconciles a provisional scan using No. ID and retains the earliest PHILIP scan', () => {
  const rows = [
    { id: 'PENDING-80', nik: 'FINGER-CIREBON-80', nama: 'PHILIP TAMZIR (BELUM DIPETAKAN)', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_user_id: '80', fingerprint_no_id: '211', fingerprint_name: 'PHILIP TAMZIR', scan_masuk: '07:36' },
    { id: 'MAPPED-80', nik: '1052204600', nama: 'PHILIP TAMZIR', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_no_id: '211', fingerprint_name: 'PHILIP TAMZIR', scan_masuk: '07:59' }
  ];
  const plan = planFingerprintReconciliation(rows, [{ nik: '1052204600', nama_karyawan: 'PHILIP TAMZIR', cabang: 'CIREBON' }]);
  assert.equal(plan.unresolved, 0);
  assert.equal(plan.updates[0].id, 'MAPPED-80');
  assert.equal(plan.updates[0].scan_masuk, '07:36');
  assert.deepEqual(plan.deleteIds, ['PENDING-80']);
});

test('another employee with No. ID 80 does not block PHILIP Emp No. 80', () => {
  const rows = [
    { id: 'PENDING-80', nik: 'FINGER-CIREBON-80', nama: 'PHILIP TAMZIR (BELUM DIPETAKAN)', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_user_id: '80', fingerprint_no_id: '211', fingerprint_name: 'PHILIP TAMZIR', scan_masuk: '07:36' },
    { id: 'OTHER', nik: '1234567890', nama: 'KARYAWAN LAIN', tanggal: '2026-09-23', cabang: 'CIREBON', fingerprint_user_id: '90', fingerprint_no_id: '80', fingerprint_name: 'KARYAWAN LAIN' }
  ];
  const plan = planFingerprintReconciliation(rows, [{ nik: '1052204600', nama_karyawan: 'PHILIP TAMZIR', cabang: 'CIREBON' }]);
  assert.equal(plan.unresolved, 0);
  assert.equal(plan.updates[0].nik, '1052204600');
});

test('Firestore quota fallback merges only a confirmed same-day Supabase pair', () => {
  const rows = [
    { id: 'TEMP-80', nik: 'FINGER-CIREBON-80', nama: 'PHILIP TAMZIR (BELUM DIPETAKAN)', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_user_id: '80', fingerprint_no_id: '211', fingerprint_name: 'PHILIP TAMZIR', scan_masuk: '07:36' },
    { id: 'REAL-80', nik: '1052204600', nama: 'PHILIP TAMZIR', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_no_id: '211', fingerprint_name: 'PHILIP TAMZIR', auto_assign: true, scan_masuk: '07:59' },
    { id: 'OLD-80', nik: '1234567890', nama: 'PEMILIK LAMA', tanggal: '2026-09-21', cabang: 'CIREBON', fingerprint_user_id: '80', fingerprint_name: 'PEMILIK LAMA' }
  ];
  const plan = planFingerprintReconciliation(rows, [], { verifiedRowsOnly: true });
  assert.equal(plan.unresolved, 0);
  assert.equal(plan.updates[0].nik, '1052204600');
  assert.equal(plan.updates[0].scan_masuk, '07:36');
  assert.deepEqual(plan.deleteIds, ['TEMP-80']);
  assert.equal(planFingerprintReconciliation(rows, [], { verifiedRowsOnly: false }).updates.length, 0);
});

test('quota fallback keeps ID 95 and ambiguous No. ID owners pending', () => {
  const pending = { id: 'TEMP-95', nik: 'FINGER-CIREBON-95', nama: 'MALATRI (BELUM DIPETAKAN)', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_user_id: '95', fingerprint_no_id: '28', fingerprint_name: 'MALATRI' };
  const mala = { id: 'MALA', nik: '1022612010', nama: 'MALA TRI AYUNINGSIH', tanggal: '2026-09-24', cabang: 'CIREBON', fingerprint_user_id: '94', fingerprint_no_id: '26', fingerprint_name: 'MALA', auto_assign: true };
  assert.equal(planFingerprintReconciliation([pending, mala], [], { verifiedRowsOnly: true }).unresolved, 1);
  const samePin = { ...mala, fingerprint_no_id: '28', fingerprint_name: 'MALATRI', nama: 'MALATRI' };
  const conflicting = { ...samePin, id: 'OTHER', nik: '9999999' };
  assert.equal(planFingerprintReconciliation([pending, samePin, conflicting], [], { verifiedRowsOnly: true }).updates.length, 0);
  assert.equal(planFingerprintReconciliation([pending, { ...samePin, auto_assign: false }], [], { verifiedRowsOnly: true }).updates.length, 0);
});
