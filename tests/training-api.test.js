const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
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

test('training API validates numeric ranges by data type', () => {
  assert.throws(() => _test.validateRecord('needs', { competency_name: 'Excel', expected_level: 6, current_level: 2, urgency: 3 }, true), /Level harapan/);
  assert.throws(() => _test.validateRecord('needs', { expected_level: 4, current_level: 2, urgency: 3 }, true), /Nama kompetensi/);
  assert.throws(() => _test.validateRecord('progress', { plan_id: 'PLAN_1', nik: '001', posttest_score: 101 }, false), /post-test/);
  assert.throws(() => _test.validateRecord('plans', {
    title: 'Program', start_date: '2026-01-01', plan_origin: 'TNA', participants: [{ nik: '001', cabang: 'Cirebon' }],
    participant_niks: ['001'], participant_branches: ['Cirebon'], budget_estimate: -1
  }, true), /Estimasi biaya/);
  assert.throws(() => _test.validateRecord('assignments', { status: 'PENDING', responses: [{ competency_name: 'Excel', current_level: 0, urgency: 3 }] }, true), /Level saat ini/);
  assert.throws(() => _test.validateRecord('assignments', { status: 'DONE' }, false), /Status survey/);
});

test('training API restricts plan reads to HRD, high management, branch scope, or participants', () => {
  const plan = {
    cabang: 'Cirebon', participant_niks: ['001'], participant_branches: ['Cirebon'],
    participants: [{ nik: '001', name: 'Ani', cabang: 'Cirebon' }]
  };
  const hrd = { role: 'HRD', nik: '009', branch: '' };
  const gm = { role: 'GM', nik: '010', branch: 'Malang' };
  const staff = { role: 'STAFF', nik: '001', branch: 'Cirebon' };
  const otherStaff = { role: 'STAFF', nik: '099', branch: 'Cirebon' };
  const branchManager = { role: 'BRANCH MANAGER', nik: '020', branch: 'Cirebon' };
  const finance = { role: 'FINANCE', nik: '030', branch: '' };
  assert.equal(_test.readable(hrd, 'plans', plan), true);
  assert.equal(_test.readable(gm, 'plans', plan), true);
  assert.equal(_test.readable(staff, 'plans', plan), true);
  assert.equal(_test.readable(branchManager, 'plans', plan), true);
  assert.equal(_test.readable(finance, 'plans', plan), true);
  assert.equal(_test.readable(otherStaff, 'plans', plan), false);
});

test('branch manager can create a branch plan, but staff and cross-branch proposals cannot', () => {
  const branchManager = { role: 'BRANCH MANAGER', nik: '020', branch: 'Cirebon' };
  const staff = { role: 'STAFF', nik: '001', branch: 'Cirebon' };
  const plan = { cabang: 'Cirebon', participants: [{ nik: '001', cabang: 'Cirebon' }], participant_niks: ['001'] };
  assert.equal(_test.canCreatePlan(branchManager, plan), true);
  assert.equal(_test.canCreatePlan({ role: 'HRD', branch: '' }, { ...plan, cabang: '' }), true);
  assert.equal(_test.canCreatePlan(branchManager, { ...plan, cabang: 'Malang' }), false);
  assert.equal(_test.canCreatePlan(branchManager, {
    ...plan, participants: [{ nik: '001', cabang: 'Cirebon' }, { nik: '002', cabang: 'Malang' }]
  }), false);
  assert.equal(_test.canCreatePlan(staff, plan), false);
});

test('training API provides HRD-only cascading survey deletion with audit logging', () => {
  const source = readFileSync(require.resolve('../lib/training-access.js'), 'utf8');
  assert.match(source, /if \(!isHrd\(user\)\) throw new Error\('Hanya HRD yang dapat menghapus survey\.'/);
  assert.match(source, /COLLECTIONS\.assignments\)\.where\('campaign_id', '==', id\)/);
  assert.match(source, /COLLECTIONS\.needs\)\.where\('campaign_id', '==', id\)/);
  assert.match(source, /action === 'delete_campaign'/);
  assert.match(source, /TRAINING_SURVEY_DELETED/);
});
