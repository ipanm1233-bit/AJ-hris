'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planFingerprintReconciliation } = require('../lib/attendance-reconcile.js');

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
