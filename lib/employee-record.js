const {
  EMAIL_FIELDS,
  normalizeEmail,
  employeeEmailCandidates,
  employeeMatchesEmail,
  isEmployeeActive,
  cleanText
} = require('./employee-profile.js');

const EMPLOYEE_COLLECTION = 'master_karyawan';
const USER_COLLECTION = 'users';

function remember(map, snapshot) {
  if (!snapshot?.exists) return;
  map.set(snapshot.id, { id: snapshot.id, ref: snapshot.ref, data: snapshot.data() || {} });
}

function collectSnapshot(map, snapshot) {
  if (!snapshot) return;
  snapshot.forEach(doc => remember(map, doc));
}

function employeeScore(entry, targetEmail) {
  const data = entry?.data || {};
  let score = 0;
  if (isEmployeeActive(data)) score += 30;
  if (employeeMatchesEmail(data, targetEmail)) score += 20;
  if (normalizeEmail(data.email) === normalizeEmail(targetEmail)) score += 10;
  return score;
}

function userScore(entry, email) {
  const data = entry?.data || {};
  let score = 0;
  if (data.active !== false && String(data.status_akun || '').toUpperCase() !== 'NONAKTIF') score += 20;
  if (normalizeEmail(data.email) === normalizeEmail(email)) score += 15;
  if (normalizeEmail(data.email_google) === normalizeEmail(email)) score += 15;
  if (String(data.firebase_uid || '').trim()) score += 5;
  return score;
}

function bestEntry(map, scorer) {
  return [...map.values()].sort((a, b) => scorer(b) - scorer(a))[0] || null;
}

function emailVariants(email) {
  const raw = String(email || '').trim();
  return [...new Set([normalizeEmail(raw), raw, raw.toUpperCase()].filter(Boolean))];
}

async function queryEmailFields(db, collectionName, email) {
  const matches = new Map();
  const variants = emailVariants(email);
  if (!variants.length) return matches;

  // Satu query "in" per field lebih hemat round-trip daripada query terpisah
  // untuk setiap variasi huruf/format email.
  const snapshots = await Promise.all(EMAIL_FIELDS.map(field =>
    db.collection(collectionName).where(field, 'in', variants).limit(3).get()
  ));
  snapshots.forEach(snapshot => collectSnapshot(matches, snapshot));
  return matches;
}

async function findEmployeeByEmail(db, email) {
  const target = normalizeEmail(email);
  if (!target) return null;

  let matches = await queryEmailFields(db, EMPLOYEE_COLLECTION, email);
  if (!matches.size) {
    // Data lama dapat menyimpan email dengan spasi/huruf campur. Scan hanya
    // dipakai sebagai fallback agar login normal tetap hemat pembacaan.
    const snap = await db.collection(EMPLOYEE_COLLECTION).get();
    snap.forEach(doc => {
      if (employeeMatchesEmail(doc.data(), target)) remember(matches, doc);
    });
  }

  return bestEntry(matches, entry => employeeScore(entry, target));
}

async function findEmployeeForUser(db, user = {}) {
  const matches = new Map();
  const directIds = [...new Set([
    user.nik,
    user.id,
    user.username
  ].map(value => cleanText(value, 160)).filter(Boolean))];

  for (const id of directIds) {
    const snap = await db.collection(EMPLOYEE_COLLECTION).doc(id).get();
    remember(matches, snap);
  }

  if (user.uid) {
    const snap = await db.collection(EMPLOYEE_COLLECTION).where('firebase_uid', '==', user.uid).limit(3).get();
    collectSnapshot(matches, snap);
  }

  const nik = cleanText(user.nik, 40);
  if (nik) {
    for (const field of ['nik', 'nik_karyawan']) {
      const snap = await db.collection(EMPLOYEE_COLLECTION).where(field, '==', nik).limit(3).get();
      collectSnapshot(matches, snap);
    }
  }

  if (!matches.size && user.email) {
    const byEmail = await findEmployeeByEmail(db, user.email);
    if (byEmail) matches.set(byEmail.id, byEmail);
  }

  if (!matches.size && user.nama) {
    const snap = await db.collection(EMPLOYEE_COLLECTION).where('nama_karyawan', '==', String(user.nama).trim()).limit(3).get();
    collectSnapshot(matches, snap);
  }

  return bestEntry(matches, entry => employeeScore(entry, user.email));
}

async function findUserByEmail(db, email) {
  const target = normalizeEmail(email);
  if (!target) return null;

  let matches = await queryEmailFields(db, USER_COLLECTION, email);
  if (!matches.size) {
    const snap = await db.collection(USER_COLLECTION).get();
    snap.forEach(doc => {
      const data = doc.data() || {};
      if (employeeEmailCandidates(data).includes(target)) remember(matches, doc);
    });
  }

  return bestEntry(matches, entry => userScore(entry, target));
}

function sameNik(a, b) {
  const left = cleanText(a?.data?.nik || a?.nik, 40);
  const right = cleanText(b?.data?.nik || b?.nik, 40);
  return Boolean(left && right && left === right);
}

async function findUserForEmployee(db, employee, email = '', firebaseUid = '') {
  const employeeData = employee?.data || {};
  const matches = new Map();
  const directIds = [...new Set([
    employee?.id,
    employeeData.nik_karyawan,
    employeeData.nik,
    employeeData.username
  ].map(value => cleanText(value, 160)).filter(Boolean))];

  for (const id of directIds) {
    const snap = await db.collection(USER_COLLECTION).doc(id).get();
    remember(matches, snap);
  }

  if (firebaseUid) {
    const snap = await db.collection(USER_COLLECTION).where('firebase_uid', '==', firebaseUid).limit(3).get();
    collectSnapshot(matches, snap);
  }

  const nik = cleanText(employeeData.nik_karyawan || employeeData.nik || employee?.id, 40);
  if (nik) {
    const snap = await db.collection(USER_COLLECTION).where('nik', '==', nik).limit(3).get();
    collectSnapshot(matches, snap);
  }

  if (email) {
    const snap = await queryEmailFields(db, USER_COLLECTION, email);
    snap.forEach(entry => matches.set(entry.id, entry));
  }

  if (!matches.size) {
    const target = normalizeEmail(email);
    const snap = await db.collection(USER_COLLECTION).get();
    snap.forEach(doc => {
      const data = doc.data() || {};
      const sameEmail = target && employeeEmailCandidates(data).includes(target);
      const sameEmployeeNik = nik && cleanText(data.nik, 40) === nik;
      if (sameEmail || sameEmployeeNik) remember(matches, doc);
    });
  }

  // Prioritaskan dokumen yang memang milik karyawan ini, bukan dokumen lain
  // yang kebetulan memiliki email/firebase_uid sama.
  return bestEntry(matches, entry => {
    let score = userScore(entry, email);
    const data = entry?.data || {};
    if (cleanText(data.nik, 40) === nik) score += 40;
    if (firebaseUid && cleanText(data.firebase_uid, 160) === cleanText(firebaseUid, 160)) score += 30;
    return score;
  });
}

module.exports = {
  findEmployeeByEmail,
  findEmployeeForUser,
  findUserByEmail,
  findUserForEmployee,
  sameNik
};
