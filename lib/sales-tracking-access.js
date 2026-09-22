'use strict';

const { requireFirebaseAuth, enforceRateLimit, normalizeBranch, writeAuditLog } = require('./security.js');
const { salesTrackingSupabaseEnabled } = require('./supabase.js');
const {
  listSalesVisits, upsertSalesVisits, deleteSalesVisits,
  listSalesOdometers, upsertSalesOdometers
} = require('./sales-tracking-supabase.js');

const PRIVILEGED = new Set(['HRD', 'SUPERADMIN', 'ADMIN', 'DIREKTUR', 'DIRECTOR', 'GM']);
const LEADERS = new Set(['SPV', 'SUPERVISOR', 'KOORDINATOR', 'MANAGER', 'BRANCH MANAGER']);
const clean = value => String(value || '').trim();
const safeDate = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : '';
const safeLimit = value => Math.min(10000, Math.max(1, Number(value || 5000)));
const fallbackEnabled = () => String(process.env.SALES_TRACKING_FIRESTORE_FALLBACK || 'true').toLowerCase() !== 'false';

function isPrivileged(user = {}) { return PRIVILEGED.has(clean(user.role).toUpperCase()); }
function isLeader(user = {}) {
  const role = clean(user.role).toUpperCase();
  const position = clean(user.position || user.posisi || user.jabatan).toUpperCase();
  return LEADERS.has(role) || [...LEADERS].some(value => position.includes(value));
}

function visitIdentity(row = {}) { return clean(row.id || row._docId); }
function odometerIdentity(row = {}) { return `${clean(row.sales_nik).toUpperCase()}|${clean(row.tanggal)}`; }
function mergeRows(firestoreRows = [], supabaseRows = [], identity = visitIdentity) {
  const rows = new Map();
  firestoreRows.forEach(row => rows.set(identity(row), row));
  supabaseRows.forEach(row => {
    const key = identity(row);
    rows.set(key, { ...(rows.get(key) || {}), ...row });
  });
  rows.delete('');
  return [...rows.values()];
}

async function firestoreRows(db, collectionName, filters = {}) {
  let snapshot;
  if (filters.fromDate) snapshot = await db.collection(collectionName).where('tanggal', '>=', filters.fromDate).get();
  else snapshot = await db.collection(collectionName).limit(safeLimit(filters.limit)).get();
  return snapshot.docs.map(doc => ({ id: doc.id, _docId: doc.id, ...doc.data() }))
    .filter(row => !filters.toDate || clean(row.tanggal) <= filters.toDate)
    .filter(row => !filters.nik || clean(row.sales_nik) === filters.nik)
    .slice(0, safeLimit(filters.limit));
}

async function loadProviderRows(context, type, filters = {}, dependencies = {}) {
  const isVisit = type === 'visits';
  const listSupabase = dependencies.listSupabase || (isVisit ? listSalesVisits : listSalesOdometers);
  const upsertSupabase = dependencies.upsertSupabase || (isVisit ? upsertSalesVisits : upsertSalesOdometers);
  const listFirestore = dependencies.listFirestore || ((db, request) => firestoreRows(db, isVisit ? 'kanal_checkins' : 'sales_odometer', request));
  const identity = isVisit ? visitIdentity : odometerIdentity;
  if (!salesTrackingSupabaseEnabled()) {
    const legacy = await listFirestore(context.db, filters);
    return { rows: mergeRows(legacy, [], identity), provider: 'firestore' };
  }
  let primary;
  try {
    primary = await listSupabase(filters);
  } catch (error) {
    if (!fallbackEnabled()) throw error;
    console.warn(`[sales-tracking] Supabase ${type} read unavailable, using Firestore fallback:`, error.message);
    const legacy = await listFirestore(context.db, filters);
    return { rows: mergeRows(legacy, [], identity), provider: 'firestore-fallback' };
  }
  let legacy;
  try {
    legacy = await listFirestore(context.db, filters);
  } catch (error) {
    console.warn(`[sales-tracking] Firestore ${type} fallback unavailable, using Supabase only:`, error.message);
    return { rows: primary.slice(0, safeLimit(filters.limit)), provider: 'supabase' };
  }
  const primaryKeys = new Set(primary.map(identity));
  const missing = legacy.filter(row => !primaryKeys.has(identity(row)));
  if (missing.length) {
    try {
      for (let index = 0; index < missing.length; index += 500) await upsertSupabase(missing.slice(index, index + 500));
    } catch (error) {
      if (!fallbackEnabled()) throw error;
      console.warn(`[sales-tracking] ${type} backfill deferred:`, error.message);
    }
  }
  return { rows: mergeRows(legacy, primary, identity).slice(0, safeLimit(filters.limit)), provider: 'supabase+firestore' };
}

async function writeFirestore(db, collectionName, rows) {
  for (let index = 0; index < rows.length; index += 400) {
    const batch = db.batch();
    rows.slice(index, index + 400).forEach(row => {
      const id = clean(row.id || row._docId);
      const payload = { ...row }; delete payload.id; delete payload._docId;
      batch.set(db.collection(collectionName).doc(id), payload, { merge: true });
    });
    await batch.commit();
  }
}

async function writeProviderRows(context, type, rows, dependencies = {}) {
  const isVisit = type === 'visits';
  const writeSupabase = dependencies.writeSupabase || (isVisit ? upsertSalesVisits : upsertSalesOdometers);
  if (salesTrackingSupabaseEnabled()) {
    try { return await writeSupabase(rows); }
    catch (error) {
      if (!fallbackEnabled()) throw error;
      console.warn(`[sales-tracking] Supabase ${type} write unavailable, using Firestore fallback:`, error.message);
    }
  }
  return writeFirestore(context.db, isVisit ? 'kanal_checkins' : 'sales_odometer', rows);
}

async function removeVisits(context, ids, dependencies = {}) {
  const removeSupabase = dependencies.deleteSupabase || deleteSalesVisits;
  if (salesTrackingSupabaseEnabled()) {
    try { return await removeSupabase(ids); }
    catch (error) {
      if (!fallbackEnabled()) throw error;
      console.warn('[sales-tracking] Supabase delete unavailable, using Firestore fallback:', error.message);
    }
  }
  for (let index = 0; index < ids.length; index += 400) {
    const batch = context.db.batch();
    ids.slice(index, index + 400).forEach(id => batch.delete(context.db.collection('kanal_checkins').doc(id)));
    await batch.commit();
  }
}

async function employeeBranchMap(db) {
  const snapshot = await db.collection('master_karyawan').get();
  const map = new Map();
  snapshot.docs.forEach(doc => {
    const row = doc.data() || {};
    const nik = clean(row.nik_karyawan || row.nik);
    if (nik) map.set(nik, clean(row.cabang));
  });
  return map;
}

async function applyScope(context, rows) {
  if (isPrivileged(context.user)) return rows;
  if (!isLeader(context.user)) {
    const nik = clean(context.user.nik);
    return rows.filter(row => nik && clean(row.sales_nik) === nik);
  }
  const branch = normalizeBranch(context.user.branch);
  if (!branch) return [];
  const branches = await employeeBranchMap(context.db);
  // The employee master is authoritative for leaders. A branch supplied by
  // the browser must never let a leader write another branch's employee data.
  return rows.filter(row => normalizeBranch(branches.get(clean(row.sales_nik))) === branch);
}

function validateVisit(row = {}) {
  const item = { ...row, id: clean(row.id || row._docId), tanggal: safeDate(row.tanggal) };
  delete item._docId;
  if (!item.id || !item.tanggal) throw new Error('ID dan tanggal kunjungan wajib valid.');
  return item;
}

function validateOdometer(row = {}) {
  const item = { ...row, id: clean(row.id || `ODM-${clean(row.sales_nik)}-${clean(row.tanggal)}`), sales_nik: clean(row.sales_nik), tanggal: safeDate(row.tanggal) };
  delete item._docId;
  if (!item.sales_nik || !item.tanggal) throw new Error('NIK sales dan tanggal odometer wajib valid.');
  return item;
}

async function handleSalesTrackingAccess(req, res, body = {}) {
  if (!enforceRateLimit(req, res, { namespace: 'sales-tracking', limit: 100, windowMs: 60_000 })) return;
  const context = await requireFirebaseAuth(req, res);
  if (!context) return;
  try {
    const action = clean(body.action);
    const filters = { fromDate: safeDate(body.fromDate), toDate: safeDate(body.toDate), nik: clean(body.nik), branch: clean(body.branch), limit: safeLimit(body.limit) };
    if (!isPrivileged(context.user)) { filters.branch = ''; filters.nik = ''; }

    if (action === 'sales_track_list') {
      const [visitsResult, odometersResult] = await Promise.all([
        loadProviderRows(context, 'visits', filters), loadProviderRows(context, 'odometers', filters)
      ]);
      const [visits, odometers] = await Promise.all([applyScope(context, visitsResult.rows), applyScope(context, odometersResult.rows)]);
      return res.status(200).json({ success: true, provider: `${visitsResult.provider}/${odometersResult.provider}`, visits, odometers });
    }

    // Sales employees may submit/correct only their own route data; applyScope
    // below enforces that NIK boundary. Leaders remain branch-scoped.
    const canWrite = isPrivileged(context.user) || isLeader(context.user) || Boolean(clean(context.user.nik));
    if (!canWrite) return res.status(403).json({ success: false, error: 'Identitas NIK akun belum dikonfigurasi.' });

    if (action === 'sales_track_upsert_visits') {
      const rows = (Array.isArray(body.rows) ? body.rows : []).map(validateVisit);
      if (!rows.length || rows.length > 2000) return res.status(400).json({ success: false, error: 'Jumlah kunjungan harus 1–2.000 baris.' });
      const allowed = await applyScope(context, rows);
      if (allowed.length !== rows.length) throw new Error('Ada data kunjungan di luar kewenangan cabang.');
      await writeProviderRows(context, 'visits', rows);
      await writeAuditLog(context.db, req, context.user, { action: 'SALES_VISITS_UPSERT', module: 'sales_tracking', recordId: `${rows.length}_rows` });
      return res.status(200).json({ success: true, count: rows.length });
    }

    if (action === 'sales_track_patch_visits') {
      const changes = Array.isArray(body.changes) ? body.changes : [];
      if (!changes.length || changes.length > 500) return res.status(400).json({ success: false, error: 'Jumlah koreksi harus 1–500 baris.' });
      const current = await loadProviderRows(context, 'visits', { limit: 10000 });
      const currentById = new Map(current.rows.map(row => [clean(row.id), row]));
      const rows = changes.map(change => validateVisit({ ...(currentById.get(clean(change.id)) || {}), ...change }));
      const allowed = await applyScope(context, rows);
      if (allowed.length !== rows.length) throw new Error('Ada data kunjungan di luar kewenangan cabang.');
      await writeProviderRows(context, 'visits', rows);
      await writeAuditLog(context.db, req, context.user, { action: 'SALES_VISITS_PATCH', module: 'sales_tracking', recordId: `${rows.length}_rows` });
      return res.status(200).json({ success: true, count: rows.length });
    }

    if (action === 'sales_track_upsert_odometer') {
      const rows = (Array.isArray(body.rows) ? body.rows : []).map(validateOdometer);
      if (!rows.length || rows.length > 500) return res.status(400).json({ success: false, error: 'Jumlah odometer harus 1–500 baris.' });
      const allowed = await applyScope(context, rows);
      if (allowed.length !== rows.length) throw new Error('Ada data odometer di luar kewenangan cabang.');
      await writeProviderRows(context, 'odometers', rows);
      await writeAuditLog(context.db, req, context.user, { action: 'SALES_ODOMETER_UPSERT', module: 'sales_tracking', recordId: `${rows.length}_rows` });
      return res.status(200).json({ success: true, count: rows.length });
    }

    if (action === 'sales_track_delete_visits') {
      if (!isPrivileged(context.user)) return res.status(403).json({ success: false, error: 'Hanya HRD/Admin yang dapat menghapus kunjungan.' });
      const ids = [...new Set((body.ids || []).map(clean).filter(Boolean))];
      if (!ids.length || ids.length > 2000) return res.status(400).json({ success: false, error: 'Jumlah ID harus 1–2.000.' });
      await removeVisits(context, ids);
      await writeAuditLog(context.db, req, context.user, { action: 'SALES_VISITS_DELETE', module: 'sales_tracking', recordId: `${ids.length}_rows` });
      return res.status(200).json({ success: true, count: ids.length });
    }

    return res.status(400).json({ success: false, error: 'Tindakan Tracking Sales tidak dikenali.' });
  } catch (error) {
    console.error('[sales-tracking]', error);
    return res.status(400).json({ success: false, error: error.message || 'Permintaan Tracking Sales gagal.' });
  }
}

module.exports = { handleSalesTrackingAccess, loadProviderRows, writeProviderRows, mergeRows, visitIdentity, odometerIdentity, applyScope };
