const fs = require('fs');
const path = require('path');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } = require('firebase/firestore');

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ajhris-security',
    firestore: { rules: fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8') }
  });
});

after(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

async function seed(collection, id, data) {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), collection, id), data);
  });
}

function claims(overrides = {}) {
  return {
    active: true,
    role: 'STAFF',
    username: 'EMP01',
    nik: '001',
    branch: 'Cirebon',
    ...overrides
  };
}

test('anonymous and token without active claim are denied', async () => {
  await seed('master_karyawan', '001', { nik_karyawan: '001' });
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'master_karyawan', '001')));
  const inactive = env.authenticatedContext('inactive', { role: 'HRD' }).firestore();
  await assertFails(getDoc(doc(inactive, 'master_karyawan', '001')));
});

test('only HRD can manage legacy account profiles', async () => {
  const hrd = env.authenticatedContext('hrd', claims({ role: 'HRD' })).firestore();
  const employee = env.authenticatedContext('employee', claims()).firestore();
  await assertSucceeds(setDoc(doc(hrd, 'users', 'NEWUSER'), { username: 'NEWUSER' }));
  await assertFails(setDoc(doc(employee, 'users', 'NEWUSER2'), { username: 'NEWUSER2' }));
});

test('employee can read own submission but not another employee submission', async () => {
  await seed('data_pengajuan', 'own', { nik_pemohon: '001', cabang: 'Cirebon' });
  await seed('data_pengajuan', 'other', { nik_pemohon: '002', cabang: 'Cirebon' });
  const employee = env.authenticatedContext('employee', claims()).firestore();
  await assertSucceeds(getDoc(doc(employee, 'data_pengajuan', 'own')));
  await assertFails(getDoc(doc(employee, 'data_pengajuan', 'other')));
});

test('staff attendance PIC reads only assigned branch with an explicit identity-bound grant', async () => {
  await seed('data_absensi', 'own', { nik: '001', cabang: 'MALANG', tanggal: '2026-09-16' });
  await seed('data_absensi', 'colleague', { nik: '002', cabang: 'MALANG', tanggal: '2026-09-16' });
  await seed('data_absensi', 'outside', { nik: '003', cabang: 'CIREBON', tanggal: '2026-09-16' });
  const pic = env.authenticatedContext('gelora', claims({ username: 'GELORA', nik: '001', branch: 'MALANG' })).firestore();
  const malang = query(collection(pic, 'data_absensi'), where('cabang', '==', 'MALANG'));
  await assertFails(getDocs(malang));
  await seed('user_permissions', 'GELORA', {
    username: 'GELORA', nik: '001', allowed_menus_set: true,
    allowed_menus: ['absensi'], allowed_actions: ['absensi.data.view_all']
  });
  await assertSucceeds(getDoc(doc(pic, 'data_absensi', 'colleague')));
  const result = await assertSucceeds(getDocs(malang));
  if (result.size !== 2) throw new Error(`Expected only Malang attendance, got ${result.size}`);
  await assertFails(getDocs(collection(pic, 'data_absensi')));
  await assertFails(getDoc(doc(pic, 'data_absensi', 'outside')));
  await assertFails(setDoc(doc(pic, 'data_absensi', 'colleague'), { scan_keluar: '17:00' }, { merge: true }));
  const otherStaff = env.authenticatedContext('other', claims({ username: 'OTHER', nik: '009', branch: 'MALANG' })).firestore();
  await assertFails(getDocs(query(collection(otherStaff, 'data_absensi'), where('cabang', '==', 'MALANG'))));
  await assertFails(getDoc(doc(otherStaff, 'data_absensi', 'colleague')));
});

test('PIC corrections require an explicit action and cannot change identity or other branches', async () => {
  await seed('data_absensi', 'inside', { nik: '002', cabang: 'MALANG', scan_masuk: '08:00' });
  await seed('data_absensi', 'outside', { nik: '003', cabang: 'CIREBON', scan_masuk: '08:00' });
  await seed('user_permissions', 'GELORA', {
    username: 'GELORA', nik: '001', allowed_menus_set: true,
    allowed_menus: ['absensi'], allowed_actions: ['absensi.data.view_all', 'absensi.data.edit']
  });
  const pic = env.authenticatedContext('gelora', claims({ username: 'GELORA', nik: '001', branch: 'MALANG' })).firestore();
  await assertSucceeds(updateDoc(doc(pic, 'data_absensi', 'inside'), { scan_masuk: '08:15' }));
  await assertFails(updateDoc(doc(pic, 'data_absensi', 'inside'), { nik: '999' }));
  await assertFails(updateDoc(doc(pic, 'data_absensi', 'outside'), { scan_masuk: '08:15' }));
  await assertFails(setDoc(doc(pic, 'data_absensi', 'fake'), { nik: '002', cabang: 'MALANG', sumber: 'KOREKSI PIC' }));
  await assertSucceeds(setDoc(doc(pic, 'data_absensi', 'ABS-MANUAL-002-2026-09-16'), {
    nik: '002', nama: 'Staf Malang', tanggal: '2026-09-16', cabang: 'MALANG',
    sumber: 'KOREKSI PIC', scan_masuk: '08:00'
  }));
  await assertFails(setDoc(doc(pic, 'data_absensi', 'ABS-MANUAL-003-2026-09-16'), {
    nik: '003', nama: 'Staf Cirebon', tanggal: '2026-09-16', cabang: 'CIREBON', sumber: 'KOREKSI PIC'
  }));
});

test('staff can read only own permission override, while HRD can manage the catalog', async () => {
  await seed('user_permissions', 'GELORA', { username: 'GELORA', nik: '001' });
  await seed('user_permissions', 'OTHER', { username: 'OTHER', nik: '002' });
  const staff = env.authenticatedContext('gelora', claims({ username: 'GELORA', nik: '001', branch: 'MALANG' })).firestore();
  const hrd = env.authenticatedContext('hrd', claims({ role: 'HRD' })).firestore();
  await assertSucceeds(getDoc(doc(staff, 'user_permissions', 'GELORA')));
  await assertFails(getDoc(doc(staff, 'user_permissions', 'OTHER')));
  await assertFails(getDocs(collection(staff, 'user_permissions')));
  await assertSucceeds(getDocs(collection(hrd, 'user_permissions')));
});

test('manager branch access is fail-closed for HR case data', async () => {
  await seed('hr_cases', 'same', { cabang: 'Cirebon' });
  await seed('hr_cases', 'other', { cabang: 'Malang' });
  const spv = env.authenticatedContext('spv', claims({ role: 'SPV' })).firestore();
  await assertSucceeds(getDoc(doc(spv, 'hr_cases', 'same')));
  await assertFails(getDoc(doc(spv, 'hr_cases', 'other')));
});

test('only HRD can mark a coaching case for SP review or confirm the current rule', async () => {
  const spv = env.authenticatedContext('spv', claims({ role: 'SPV' })).firestore();
  const hrd = env.authenticatedContext('hrd', claims({ role: 'HRD' })).firestore();
  const base = { cabang: 'Cirebon', description: 'Klarifikasi absensi', policy_review: { basis: 'Peraturan Perusahaan', decision: 'Belum ditentukan', current_rule_confirmed: false } };
  await assertSucceeds(setDoc(doc(spv, 'hr_cases', 'case1'), base));
  await assertFails(setDoc(doc(spv, 'hr_cases', 'case2'), { ...base, policy_review: { ...base.policy_review, decision: 'Tinjau untuk SP' } }));
  await assertFails(updateDoc(doc(spv, 'hr_cases', 'case1'), { 'policy_review.current_rule_confirmed': true }));
  await assertSucceeds(updateDoc(doc(spv, 'hr_cases', 'case1'), { description: 'Klarifikasi lanjutan' }));
  await assertSucceeds(updateDoc(doc(hrd, 'hr_cases', 'case1'), { 'policy_review.decision': 'Tinjau untuk SP', 'policy_review.current_rule_confirmed': true }));
  await assertFails(updateDoc(doc(spv, 'hr_cases', 'case1'), { 'policy_review.decision': 'Coaching / konseling' }));
});

test('browser cannot forge audit logs', async () => {
  const hrd = env.authenticatedContext('hrd', claims({ role: 'HRD' })).firestore();
  await assertFails(setDoc(doc(hrd, 'audit_logs', 'forged'), { action: 'FORGED' }));
  await assertFails(setDoc(doc(hrd, 'audit_edit_logs', 'forged'), { action: 'FORGED' }));
});

test('public career portal only queries published vacancies', async () => {
  await seed('data_rekrutmen', 'open', { status: 'Open', posisi: 'Sales' });
  await seed('data_rekrutmen', 'draft', { status: 'Draft', posisi: 'Finance' });
  const publicDb = env.unauthenticatedContext().firestore();
  const published = query(collection(publicDb, 'data_rekrutmen'), where('status', 'in', ['Open', 'OPEN', 'AKTIF', 'Aktif', 'Dibuka', 'DIBUKA']));
  const result = await assertSucceeds(getDocs(published));
  if (result.size !== 1) throw new Error(`Expected one public vacancy, got ${result.size}`);
  await assertFails(getDocs(collection(publicDb, 'data_rekrutmen')));
});

test('public applicant creation is validated and existing applications stay private', async () => {
  const publicDb = env.unauthenticatedContext().firestore();
  const application = doc(publicDb, 'pelamar_ats', 'candidate');
  await assertSucceeds(setDoc(application, { nama: 'Pelamar Uji', email: 'pelamar@example.com', resume_text: '', catatan: '' }));
  await assertFails(getDoc(application));
  await assertFails(setDoc(doc(publicDb, 'pelamar_ats', 'oversized'), {
    nama: 'Pelamar Uji', email: 'pelamar@example.com', resume_text: '', catatan: 'x'.repeat(5001)
  }));
});

test('KPI evaluator can query own tasks by NIK but cannot query all tasks', async () => {
  await seed('tugas_kpi_360', 'own', { nik_penilai: '001', nik_dinilai: '010', cabang_penilai: 'Cirebon', cabang_dinilai: 'Cirebon', status: 'PENDING' });
  await seed('tugas_kpi_360', 'other', { nik_penilai: '002', nik_dinilai: '011', cabang_penilai: 'Malang', cabang_dinilai: 'Malang', status: 'PENDING' });
  const employee = env.authenticatedContext('employee', claims()).firestore();
  const ownQuery = query(collection(employee, 'tugas_kpi_360'), where('nik_penilai', '==', '001'));
  const result = await assertSucceeds(getDocs(ownQuery));
  if (result.size !== 1) throw new Error(`Expected one KPI task, got ${result.size}`);
  await assertFails(getDocs(collection(employee, 'tugas_kpi_360')));
});

test('KPI evaluator may submit score fields but cannot change task identity', async () => {
  await seed('tugas_kpi_360', 'task', { nik_penilai: '001', nik_dinilai: '010', cabang_penilai: 'Cirebon', cabang_dinilai: 'Cirebon', status: 'PENDING' });
  const employee = env.authenticatedContext('employee', claims()).firestore();
  await assertSucceeds(updateDoc(doc(employee, 'tugas_kpi_360', 'task'), { status: 'DONE', skor_akhir: 88 }));
  await assertFails(updateDoc(doc(employee, 'tugas_kpi_360', 'task'), { nik_dinilai: '999' }));
});

test('KPI subject can read own result and audit records are immutable', async () => {
  await seed('log_penilaian_kpi', 'own', { nik_penilai: '002', nik_dinilai: '001', cabang_dinilai: 'Cirebon', total_skor: 90 });
  const employee = env.authenticatedContext('employee', claims()).firestore();
  await assertSucceeds(getDoc(doc(employee, 'log_penilaian_kpi', 'own')));
  const audit = doc(employee, 'kpi_audit_logs', 'audit-1');
  await assertSucceeds(setDoc(audit, { actor_nik: '001', action: 'SUBMIT_EVALUATION' }));
  await assertFails(updateDoc(audit, { action: 'FORGED' }));
});
