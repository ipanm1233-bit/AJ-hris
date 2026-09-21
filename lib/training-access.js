const { enforceRateLimit, requireFirebaseAuth, writeAuditLog, isSameBranch } = require('./security.js');

const COLLECTIONS = Object.freeze({
  campaigns: 'training_tna_campaigns', assignments: 'training_tna_assignments',
  needs: 'training_needs', plans: 'training_tna_plans', progress: 'training_tna_progress'
});
const HRD = ['HRD', 'SUPERADMIN'];
const LEADERS = ['HRD', 'SUPERADMIN', 'GM', 'DIREKTUR', 'MANAGER', 'BRANCH MANAGER', 'SPV', 'ATASAN'];
const HIGH_MANAGEMENT = ['HRD', 'SUPERADMIN', 'GM', 'DIREKTUR'];
const OWN_FIELDS = new Set(['plan_id', 'nik', 'nama', 'cabang', 'divisi', 'pretest_score', 'pretest_at', 'posttest_score', 'posttest_at', 'feedback_score', 'feedback_note', 'feedback_at']);
const BEHAVIOR_FIELDS = new Set(['behavior_score', 'behavior_note', 'behavior_reviewed_by', 'behavior_reviewed_at']);

function cleanId(value) {
  const result = String(value || '').trim();
  if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(result)) throw new Error('ID data pelatihan tidak valid.');
  return result;
}
function isHrd(user) { return HRD.includes(user.role); }
function isLeader(user) { return LEADERS.includes(user.role); }
function owns(user, data = {}) { return Boolean(user.nik) && String(data.nik || '') === String(user.nik); }
function onlyKeys(data, allowed) { return Object.keys(data || {}).every(key => allowed.has(key)); }
function serialize(snapshot) {
  const value = snapshot.data() || {};
  return { ...value, id: snapshot.id, created_at: value.created_at?.toDate?.()?.toISOString?.() || value.created_at || null, updated_at: value.updated_at?.toDate?.()?.toISOString?.() || value.updated_at || null };
}
function readable(user, type, data) {
  if (type === 'campaigns' || type === 'plans' || isHrd(user) || HIGH_MANAGEMENT.includes(user.role)) return true;
  if (owns(user, data)) return true;
  return isLeader(user) && isSameBranch(user, data.cabang);
}
function sanitizePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Payload tidak valid.');
  const result = { ...value };
  delete result.id; delete result._docId; delete result.created_at; delete result.updated_at;
  return result;
}
async function listAll(db, user) {
  const entries = await Promise.all(Object.entries(COLLECTIONS).map(async ([type, name]) => {
    let ref = db.collection(name);
    if (!HIGH_MANAGEMENT.includes(user.role) && type !== 'campaigns' && type !== 'plans') {
      ref = isLeader(user) && user.branch ? ref.where('cabang', '==', user.branch) : ref.where('nik', '==', user.nik || '__NONE__');
    }
    const snapshot = await ref.limit(2000).get();
    return [type, snapshot.docs.map(serialize).filter(row => readable(user, type, row))];
  }));
  return Object.fromEntries(entries);
}
async function createRecord(db, user, type, id, input) {
  const data = sanitizePayload(input);
  if (type === 'campaigns' || type === 'plans' || type === 'assignments') {
    if (!isHrd(user)) throw new Error('Hanya HRD yang dapat membuat data ini.');
  } else if (type === 'needs' || type === 'progress') {
    if (!owns(user, data) && !isHrd(user)) throw new Error('Anda hanya dapat membuat data pelatihan milik sendiri.');
    if (type === 'progress' && !isHrd(user) && !onlyKeys(data, OWN_FIELDS)) throw new Error('Field evaluasi tidak diizinkan.');
  } else throw new Error('Jenis data tidak diizinkan.');
  const ref = db.collection(COLLECTIONS[type]).doc(cleanId(id));
  await ref.create({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return ref.id;
}
async function updateRecord(db, user, type, id, input) {
  const ref = db.collection(COLLECTIONS[type] || '__invalid__').doc(cleanId(id));
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    if (type === 'progress') return createRecord(db, user, type, id, input);
    throw new Error('Data pelatihan tidak ditemukan.');
  }
  const current = snapshot.data() || {}, data = sanitizePayload(input), keys = new Set(Object.keys(data));
  if (isHrd(user)) {
    // HRD manages the complete workflow.
  } else if (type === 'assignments' && owns(user, current) && onlyKeys(data, new Set(['status', 'responses', 'submitted_at']))) {
    // Employee submits their own survey.
  } else if (type === 'needs' && isLeader(user) && isSameBranch(user, current.cabang) && onlyKeys(data, new Set(['current_level', 'urgency', 'manager_note', 'validation_status', 'validated_by_nik', 'validated_at']))) {
    // Direct manager validates a branch need.
  } else if (type === 'plans' && ['GM', 'DIREKTUR'].includes(user.role) && onlyKeys(data, new Set(['status', 'gm_status', 'gm_by', 'gm_at']))) {
    // GM approval.
  } else if (type === 'plans' && user.role === 'FINANCE' && onlyKeys(data, new Set(['status', 'finance_status', 'finance_by', 'finance_at']))) {
    // Budget approval.
  } else if (type === 'progress' && owns(user, current) && onlyKeys(data, OWN_FIELDS)) {
    // Employee assessment and feedback.
  } else if (type === 'progress' && isLeader(user) && isSameBranch(user, current.cabang) && onlyKeys(data, BEHAVIOR_FIELDS)) {
    // Manager follow-up evaluation.
  } else throw new Error('Anda tidak berhak mengubah data tersebut.');
  await ref.set({ ...data, updated_at: new Date().toISOString() }, { merge: true });
  return ref.id;
}

async function handleTrainingAccess(req, res, body = {}) {
  const context = await requireFirebaseAuth(req, res);
  if (!context) return true;
  if (!enforceRateLimit(req, res, { namespace: 'training', key: context.user.uid, limit: 600, windowMs: 60 * 60_000 })) return true;
  const action = String(body.action || '').replace(/^training_/, '');
  try {
    if (action === 'list') {
      res.status(200).json({ success: true, data: await listAll(context.db, context.user) });
      return true;
    }
    if (action === 'bulk_assignments') {
      if (!isHrd(context.user) || !Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500) throw new Error('Distribusi survey tidak diizinkan.');
      const batch = context.db.batch();
      body.rows.forEach(item => {
        const data = sanitizePayload(item.data), ref = context.db.collection(COLLECTIONS.assignments).doc(cleanId(item.id));
        batch.set(ref, { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      });
      await batch.commit();
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_SURVEY_DISTRIBUTED', module: 'TRAINING', recordId: body.campaignId || '', metadata: { count: body.rows.length } });
      res.status(200).json({ success: true, count: body.rows.length });
      return true;
    }
    if (action === 'create') {
      const id = await createRecord(context.db, context.user, body.type, body.id, body.data);
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_RECORD_CREATED', module: 'TRAINING', recordId: id, metadata: { type: body.type } });
      res.status(200).json({ success: true, id });
      return true;
    }
    if (action === 'update') {
      const id = await updateRecord(context.db, context.user, body.type, body.id, body.data);
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_RECORD_UPDATED', module: 'TRAINING', recordId: id, metadata: { type: body.type } });
      res.status(200).json({ success: true, id });
      return true;
    }
    res.status(400).json({ success: false, error: 'Aksi tidak dikenali.' });
    return true;
  } catch (error) {
    console.error('[training]', error);
    res.status(400).json({ success: false, error: error.message || 'Operasi pelatihan gagal.' });
    return true;
  }
}

module.exports = { handleTrainingAccess, _test: { readable, owns, onlyKeys, sanitizePayload } };
