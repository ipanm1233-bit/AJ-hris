import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNeeds, campaignTargetsEmployee, competencyGap, learningGain,
  needPriorityScore, participantMatchesSession, priorityLabel, safeParticipantSnapshot, trainingMetrics
} from '../js/training-tna.mjs';

test('campaign targets employees by branch and division', () => {
  const employee = { nik: '01', nama_karyawan: 'Ani', cabang: 'Malang', divisi: 'Warehouse' };
  assert.equal(campaignTargetsEmployee({ target_branch: 'Malang', target_division: 'Warehouse' }, employee), true);
  assert.equal(campaignTargetsEmployee({ target_branch: 'Cirebon', target_division: 'Semua' }, employee), false);
});

test('campaign supports checkbox targets and an explicit employee selection', () => {
  const employee = { nik: '01', nama_karyawan: 'Ani', cabang: 'Malang', divisi: 'Warehouse', jabatan: 'Admin' };
  assert.equal(campaignTargetsEmployee({
    target_branches: ['Cirebon', 'Malang'], target_divisions: ['Warehouse'],
    target_positions: ['Admin'], target_niks: ['01', '02']
  }, employee), true);
  assert.equal(campaignTargetsEmployee({ target_branches: ['Malang'], target_niks: ['02'] }, employee), false);
  assert.equal(campaignTargetsEmployee({ target_branches: [], target_divisions: [], target_positions: [], target_niks: [] }, employee), true);
});

test('employee training tasks match a stable account identity', () => {
  assert.equal(participantMatchesSession({ nik: '001' }, { nik: '001' }), true);
  assert.equal(participantMatchesSession({ username: 'ani.staff' }, { username: 'ANI.STAFF' }), true);
  assert.equal(participantMatchesSession({ email: 'ani@andela.id' }, { email: 'ANI@ANDELA.ID' }), true);
  assert.equal(participantMatchesSession({ nik: '001', nama: 'Nama Sama' }, { nik: '002', nama: 'Nama Sama' }), false);
  assert.equal(participantMatchesSession({ nik: '001', nama: 'Ipan Maulana' }, { nik: '009', nama: 'IPAN MAULANA', role: 'HRD' }), true);
  assert.equal(participantMatchesSession({ nik: '001', nama: 'Nama Sama' }, { nik: '002', nama: 'Nama Sama', role: 'STAFF' }), false);
});

test('TNA gap and priority never invert expected minus current', () => {
  assert.equal(competencyGap(5, 2), 3);
  assert.equal(competencyGap(2, 5), 0);
  const score = needPriorityScore({ expected_level: 5, current_level: 1, urgency: 5, business_impact: 5 });
  assert.equal(priorityLabel(score), 'KRITIS');
});

test('aggregates needs for management analytics', () => {
  const rows = [
    { competency_name: 'Excel', expected_level: 4, current_level: 2, urgency: 4, business_impact: 4 },
    { competency_name: 'Excel', expected_level: 5, current_level: 3, urgency: 3, business_impact: 5 },
    { competency_name: 'K3', expected_level: 4, current_level: 3, urgency: 2, business_impact: 4 }
  ];
  const result = aggregateNeeds(rows);
  assert.equal(result[0].key, 'Excel');
  assert.equal(result[0].count, 2);
  assert.equal(result[0].averageGap, 2);
});

test('reports response rate and learning gain', () => {
  assert.equal(learningGain(40, 85), 45);
  const metrics = trainingMetrics({
    assignments: [{ status: 'SUBMITTED' }, { status: 'PENDING' }],
    needs: [{}, {}], plans: [{ status: 'COMPLETED' }],
    progress: [{ pretest_score: 40, posttest_score: 80 }]
  });
  assert.equal(metrics.responseRate, 50);
  assert.equal(metrics.averageLearningGain, 40);
});

test('participant identity is stored with NIK and organization snapshot', () => {
  assert.deepEqual(safeParticipantSnapshot({ nik_karyawan: '99', nama_karyawan: 'Budi', cabang: 'Cirebon', divisi: 'Sales', jabatan: 'Salesman' }), {
    nik: '99', nama: 'Budi', cabang: 'Cirebon', divisi: 'Sales', jabatan: 'Salesman', atasan: '', email: ''
  });
});
