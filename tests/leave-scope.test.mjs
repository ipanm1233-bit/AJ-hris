import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLeaveBranchScope,
  filterEmployeesForLeaveBranch,
  filterLeaveRowsForEmployees,
  filterLeaveRowsForBranch
} from '../js/leave-scope.mjs';

test('branch PIC with cuti.view_all is scoped to the account branch', () => {
  assert.equal(resolveLeaveBranchScope({ role: 'STAFF', branch: 'Malang', canViewAll: true }), 'Malang');
  assert.equal(resolveLeaveBranchScope({ role: 'STAFF', branch: 'Malang', canViewAll: false }), '');
  assert.equal(resolveLeaveBranchScope({ role: 'HRD', branch: 'Malang', canViewAll: true }), '');
});

test('Malang PIC only receives Malang employees and their leave rows', () => {
  const employees = [
    { nik: 'M-01', nama_karyawan: 'Gelora', cabang: 'MALANG' },
    { nik: 'C-01', nama_karyawan: 'Karyawan Cirebon', cabang: 'CIREBON' }
  ];
  const scopedEmployees = filterEmployeesForLeaveBranch(employees, 'Malang');
  assert.deepEqual(scopedEmployees.map(row => row.nik), ['M-01']);

  const leaveRows = [
    { id: '1', nik: 'M-01', nama_karyawan: 'Gelora', cabang: 'MALANG' },
    { id: '2', nik: 'C-01', nama_karyawan: 'Karyawan Cirebon', cabang: 'CIREBON' },
    { id: '3', nik: 'M-01', nama_karyawan: 'Gelora' },
    { id: '4', nik: 'UNKNOWN', nama_karyawan: 'Tidak Dikenal' }
  ];
  assert.deepEqual(filterLeaveRowsForBranch(leaveRows, scopedEmployees, 'Malang').map(row => row.id), ['1', '3']);
  assert.deepEqual(filterLeaveRowsForEmployees(leaveRows, scopedEmployees).map(row => row.id), ['1', '3']);
});
