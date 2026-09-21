const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../lib/notification-access.js');

test('notification ownership accepts NIK, username, or UID target', () => {
  const user = { nik: '001', username: 'IPAN', uid: 'firebase-1' };
  assert.equal(_test.ownsNotification(user, { nik_target: '001' }), true);
  assert.equal(_test.ownsNotification(user, { username_target: 'ipan' }), true);
  assert.equal(_test.ownsNotification(user, { user_uid: 'firebase-1' }), true);
  assert.equal(_test.ownsNotification(user, { nik_target: '999' }), false);
});
