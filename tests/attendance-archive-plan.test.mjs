import test from 'node:test';
import assert from 'node:assert/strict';
import { planAttendanceArchive } from '../js/attendance-archive-plan.mjs';

test('archive copies only old distinct rows, retains source, and sends bounded spreadsheet fields', () => {
  const rows = [
    { id: 'old-1', nik: '101', nama: 'A', tanggal: '2026-07-24', scan_masuk: '08:00', payload: { private: 'do not send' } },
    { id: 'old-1', nik: '101', tanggal: '2026-07-24' },
    { id: 'old-2', nik: '102', tanggal: '2026-07-25' },
    { id: 'recent', nik: '103', tanggal: '2026-07-26' }
  ];
  const plan = planAttendanceArchive(rows, '2026-07-26', { chunkSize: 1 });
  assert.equal(plan.count, 2);
  assert.deepEqual(plan.chunks.map(chunk => chunk.map(row => row.id)), [['old-1'], ['old-2']]);
  assert.equal(rows.length, 4);
  assert.equal('payload' in plan.chunks[0][0], false);
  assert.throws(() => planAttendanceArchive(rows, '2026-07-26', { limit: 4 }), /Terlalu banyak/);
  assert.throws(() => planAttendanceArchive([{ nik: '101', tanggal: '2026-07-24' }], '2026-07-26'), /tanpa ID/);
});
