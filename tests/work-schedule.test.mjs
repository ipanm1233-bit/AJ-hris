import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkSchedule, scheduleAppliesToDate } from '../js/work-schedule.mjs';

test('applies an Indonesian weekday range to the attendance date', () => {
  assert.equal(scheduleAppliesToDate('Senin - Jumat', '2026-09-08'), true);
  assert.equal(scheduleAppliesToDate('Senin - Jumat', '2026-09-13'), false);
});

test('resolves scheduled check-in and check-out by position and date', () => {
  const result = resolveWorkSchedule(
    { jabatan: 'Staff Finance' },
    [
      { jabatan: 'Staff Finance', hari: 'Senin - Jumat', masuk: '08:15', pulang: '17:15' },
      { jabatan: 'Semua Jabatan', hari: 'Sabtu', masuk: '08:00', pulang: '13:00' }
    ],
    '2026-09-08'
  );
  assert.deepEqual(result, { masuk: '08:15', pulang: '17:15', jamKerja: '08:15 - 17:15' });
});

test('does not invent dummy hours when no configured schedule matches', () => {
  assert.deepEqual(
    resolveWorkSchedule({ jabatan: 'Unknown' }, [], '2026-09-08'),
    { masuk: '', pulang: '', jamKerja: '' }
  );
});
