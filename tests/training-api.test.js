const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../lib/training-access.js');

const employee = { role: 'STAFF', nik: '001', branch: 'Cirebon' };
const manager = { role: 'SPV', nik: '010', branch: 'Cirebon' };

test('training API scopes employee and manager reads', () => {
  assert.equal(_test.readable(employee, 'needs', { nik: '001', cabang: 'Cirebon' }), true);
  assert.equal(_test.readable(employee, 'needs', { nik: '002', cabang: 'Cirebon' }), false);
  assert.equal(_test.readable(manager, 'needs', { nik: '002', cabang: 'Cirebon' }), true);
  assert.equal(_test.readable(manager, 'needs', { nik: '003', cabang: 'Malang' }), false);
});

test('training API recognizes an employee assignment through username or email fallback', () => {
  assert.equal(_test.owns({ nik: '', username: 'ani.staff', email: '' }, { nik: '001', username: 'ANI.STAFF' }), true);
  assert.equal(_test.owns({ nik: '', username: '', email: 'ani@andela.id' }, { nik: '001', email: 'ANI@ANDELA.ID' }), true);
  assert.equal(_test.owns({ nik: '009', username: 'budi' }, { nik: '001', username: 'ani' }), false);
});

test('training API field allowlist rejects manager identity changes', () => {
  const allowed = new Set(['behavior_score', 'behavior_note']);
  assert.equal(_test.onlyKeys({ behavior_score: 4, behavior_note: 'Meningkat' }, allowed), true);
  assert.equal(_test.onlyKeys({ behavior_score: 4, nik: '999' }, allowed), false);
});

test('training API strips client-controlled metadata', () => {
  assert.deepEqual(_test.sanitizePayload({ id: 'forged', _docId: 'x', created_at: 'x', title: 'Program' }), { title: 'Program' });
});
