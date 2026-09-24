'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mappingForScan, planManualFingerprintRows, validateManualMapping } = require('../lib/fingerprint-mappings.js');

const employee = { nik: '1052204600', nama_karyawan: 'PHILIP TAMZIR', cabang: 'CIREBON' };
const input = { cabang: 'CIREBON', empNo: '80', noId: '211', fingerName: 'PHILIP TAMZIR',
  nik: employee.nik, effectiveFrom: '2026-09-24', reason: 'Diverifikasi langsung oleh HRD pada mesin' };
const saved = { ...validateManualMapping(input, [employee]), id: 'manual-1', active: true };

test('HR mapping is branch, machine account, name, and effective-date specific', () => {
  const scan = { branch: 'CIREBON', empNo: '80', noId: '211', fingerName: 'PHILIP TAMZIR', date: '2026-09-24' };
  assert.equal(mappingForScan([saved], scan), saved);
  assert.equal(mappingForScan([saved], { ...scan, branch: 'MALANG' }), null);
  assert.equal(mappingForScan([saved], { ...scan, noId: '28' }), null);
  assert.equal(mappingForScan([saved], { ...scan, fingerName: 'IRINE' }), null);
  assert.equal(mappingForScan([saved], { ...scan, date: '2026-09-23' }), null);
  assert.equal(mappingForScan([saved, { ...saved, id: 'second' }], scan), null);
});

test('HR cannot map a NIK outside the branch or overlap a reused machine ID', () => {
  assert.throws(() => validateManualMapping({ ...input, nik: '9999' }, [employee]), /NIK/);
  assert.throws(() => validateManualMapping({ ...input, reason: 'singkat' }, [employee]), /alasan/);
  assert.throws(() => validateManualMapping({ ...input, fingerName: 'BARU' }, [employee], [saved]), /pemetaan aktif/);
  assert.throws(() => validateManualMapping(input, [employee], [saved]), /Sudah ada/);
  assert.equal(validateManualMapping({ ...input, effectiveFrom: '2026-09-25' }, [employee], [{ ...saved, effective_to: '2026-09-24' }]).nik, employee.nik);
});

test('manual mapping retains the first machine scan and never overwrites another NIK', () => {
  const pending = { id: 'PENDING', nik: 'FINGER-CIREBON-80', nama: 'PHILIP TAMZIR (BELUM DIPETAKAN)',
    cabang: 'CIREBON', tanggal: '2026-09-24', fingerprint_user_id: '80', fingerprint_no_id: '211', fingerprint_name: 'PHILIP TAMZIR', scan_masuk: '07:36' };
  const mapped = { id: 'MAPPED', nik: employee.nik, nama: employee.nama_karyawan, cabang: 'CIREBON',
    tanggal: '2026-09-24', fingerprint_no_id: '211', scan_masuk: '07:59' };
  const plan = planManualFingerprintRows([pending, mapped], saved);
  assert.equal(plan.updates[0].id, 'MAPPED');
  assert.equal(plan.updates[0].scan_masuk, '07:36');
  assert.deepEqual(plan.deleteIds, ['PENDING']);
  assert.equal(planManualFingerprintRows([pending, { ...mapped, nik: '9999' }], saved).updates.length, 0);
  assert.equal(planManualFingerprintRows([pending, { ...mapped, cabang: 'MALANG' }], saved).updates[0].nik, employee.nik);
});
