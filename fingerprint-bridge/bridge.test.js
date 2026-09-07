const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { normalizeDeviceLog, attendanceRows, localDateTime, signedHeaders } = require('./bridge.js');

test('normalizes node-zklib attendance records for the HRIS endpoint', () => {
  const result = normalizeDeviceLog({
    deviceUserId: '0007',
    recordTime: new Date(2026, 8, 7, 7, 51, 12),
    punchState: 0
  });
  assert.deepEqual(result, {
    deviceUserId: '0007',
    recordTime: '2026-09-07 07:51:12',
    punchState: 0
  });
});

test('accepts node-zklib response wrappers and common aliases', () => {
  assert.deepEqual(attendanceRows({ data: [{ userSn: 9 }] }), [{ userSn: 9 }]);
  assert.equal(normalizeDeviceLog({ userSn: 9, timestamp: '2026-09-07 08:00:00' }).deviceUserId, '9');
  assert.equal(localDateTime('2026-09-07 08:00:00'), '2026-09-07 08:00:00');
});

test('signs the exact request body using the configured bridge secret', () => {
  process.env.FINGERPRINT_BRIDGE_SECRET = 'test-secret-which-is-not-used-in-production';
  const body = JSON.stringify({ logs: [{ deviceUserId: '1' }] });
  const headers = signedHeaders(body);
  const expected = crypto.createHmac('sha256', process.env.FINGERPRINT_BRIDGE_SECRET)
    .update(`${headers['x-bridge-timestamp']}.${body}`)
    .digest('hex');
  assert.equal(headers['x-bridge-signature'], expected);
});
