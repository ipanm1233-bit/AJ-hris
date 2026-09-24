import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAttendanceArchive } from '../js/attendance-archive-merge.mjs';

test('archive does not revive a pending row resolved by No. ID', () => {
  const live = [{ id: 'MAPPED', nik: '1052204600', nama: 'PHILIP TAMZIR', fingerprint_no_id: '211', tanggal: '2026-09-24', cabang: 'CIREBON' }];
  const archive = [{ id: 'PENDING', nik: 'FINGER-CIREBON-80', nama: 'PHILIP TAMZIR (BELUM DIPETAKAN)', fingerprint_user_id: '80', fingerprint_no_id: '211', tanggal: '2026-09-24', cabang: 'CIREBON' }];
  assert.deepEqual(mergeAttendanceArchive(live, archive), live);
  assert.equal(mergeAttendanceArchive(live, [{ ...archive[0], nama: 'IRINE (BELUM DIPETAKAN)' }]).length, 2);
});
