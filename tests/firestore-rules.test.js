const fs = require('fs');
const path = require('path');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, query, setDoc, where } = require('firebase/firestore');

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

test('manager branch access is fail-closed for HR case data', async () => {
  await seed('hr_cases', 'same', { cabang: 'Cirebon' });
  await seed('hr_cases', 'other', { cabang: 'Malang' });
  const spv = env.authenticatedContext('spv', claims({ role: 'SPV' })).firestore();
  await assertSucceeds(getDoc(doc(spv, 'hr_cases', 'same')));
  await assertFails(getDoc(doc(spv, 'hr_cases', 'other')));
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
