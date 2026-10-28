const { enforceRateLimit, requireFirebaseAuth, writeAuditLog, isSameBranch, isFirestoreQuotaError } = require('./security.js');

const COLLECTIONS = Object.freeze({
  campaigns: 'training_tna_campaigns', assignments: 'training_tna_assignments',
  needs: 'training_needs', plans: 'training_tna_plans', progress: 'training_tna_progress',
  materials: 'training_materials'
});
const HRD = ['HRD', 'SUPERADMIN'];
const LEADERS = ['HRD', 'SUPERADMIN', 'GM', 'DIREKTUR', 'MANAGER', 'BRANCH MANAGER', 'SPV', 'ATASAN'];
const HIGH_MANAGEMENT = ['HRD', 'SUPERADMIN', 'GM', 'DIREKTUR'];
const OWN_FIELDS = new Set(['plan_id', 'nik', 'username', 'email', 'nama', 'cabang', 'divisi', 'pretest_score', 'pretest_at', 'posttest_score', 'posttest_at', 'feedback_score', 'feedback_note', 'feedback_at']);
const BEHAVIOR_FIELDS = new Set(['behavior_score', 'behavior_note', 'behavior_reviewed_by', 'behavior_reviewed_at']);

function cleanId(value) {
  const result = String(value || '').trim();
  if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(result)) throw new Error('ID data pelatihan tidak valid.');
  return result;
}
function isHrd(user) { return HRD.includes(user.role); }
function isLeader(user) { return LEADERS.includes(user.role); }
function normalizeIdentity(value) { return String(value || '').trim().toLowerCase(); }
function owns(user, data = {}) {
  const pairs = [
    [user.nik, data.nik],
    [user.username, data.username],
    [user.email, data.email]
  ];
  return pairs.some(([left, right]) => normalizeIdentity(left) && normalizeIdentity(left) === normalizeIdentity(right));
}
function onlyKeys(data, allowed) { return Object.keys(data || {}).every(key => allowed.has(key)); }
function serialize(snapshot) {
  const value = snapshot.data() || {};
  return { ...value, id: snapshot.id, created_at: value.created_at?.toDate?.()?.toISOString?.() || value.created_at || null, updated_at: value.updated_at?.toDate?.()?.toISOString?.() || value.updated_at || null };
}
function readable(user, type, data) {
  if (type === 'campaigns') return true;
  if (type === 'materials') return true;
  if (type === 'plans') return planVisibleTo(user, data);
  if (isHrd(user) || HIGH_MANAGEMENT.includes(user.role)) return true;
  if (owns(user, data)) return true;
  return isLeader(user) && isSameBranch(user, data.cabang);
}
function sanitizePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Payload tidak valid.');
  const result = { ...value };
  delete result.id; delete result._docId; delete result.created_at; delete result.updated_at;
  return result;
}
function numberInRange(value, min, max, label, { nullable = false } = {}) {
  if (value === undefined) return;
  if (nullable && (value === null || value === '')) return;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} harus berupa angka ${min}–${max}.`);
}
function finiteNumber(value, label) {
  if (value === undefined || value === null || value === '') return;
  if (!Number.isFinite(Number(value))) throw new Error(`${label} harus berupa angka yang valid.`);
}
function assertText(value, label, maxLength = 2000) {
  if (value === undefined) return;
  if (typeof value !== 'string') throw new Error(`${label} harus berupa teks.`);
  if (value.length > maxLength) throw new Error(`${label} terlalu panjang (maksimal ${maxLength} karakter).`);
}
function assertArray(value, label) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${label} harus berupa daftar.`);
}
function validateNeed(data, creating = false) {
  if (creating && !String(data.competency_name || '').trim()) throw new Error('Nama kompetensi wajib diisi.');
  assertText(data.competency_name, 'Nama kompetensi', 300);
  assertText(data.reason, 'Alasan kebutuhan', 2000);
  assertText(data.manager_note, 'Catatan atasan', 2000);
  numberInRange(data.expected_level, 1, 5, 'Level harapan');
  numberInRange(data.current_level, 1, 5, 'Level saat ini');
  numberInRange(data.urgency, 1, 5, 'Urgensi');
  numberInRange(data.business_impact, 1, 5, 'Dampak bisnis');
  if (creating && [data.expected_level, data.current_level, data.urgency].some(value => value === undefined || value === '')) throw new Error('Level harapan, level saat ini, dan urgensi wajib diisi.');
  if (data.validation_status !== undefined && !['PENDING', 'VALIDATED', 'REJECTED'].includes(data.validation_status)) throw new Error('Status validasi kebutuhan tidak valid.');
}
function validateProgress(data, creating = false) {
  numberInRange(data.pretest_score, 0, 100, 'Nilai pre-test');
  numberInRange(data.posttest_score, 0, 100, 'Nilai post-test');
  numberInRange(data.feedback_score, 1, 5, 'Nilai feedback');
  numberInRange(data.behavior_score, 1, 5, 'Nilai perilaku');
  assertText(data.feedback_note, 'Catatan feedback', 2000);
  assertText(data.behavior_note, 'Catatan perilaku', 2000);
  assertText(data.plan_id, 'ID program', 180);
  if (creating) {
    if (!String(data.plan_id || '').trim()) throw new Error('Program pelatihan wajib diisi.');
    if (!String(data.nik || data.username || data.email || '').trim()) throw new Error('Identitas peserta wajib diisi.');
  }
}
function validatePlan(data, creating = false) {
  assertText(data.title, 'Nama program', 300);
  assertText(data.objective, 'Tujuan program', 3000);
  assertText(data.result_metric, 'Metrik hasil', 300);
  assertText(data.result_unit, 'Satuan metrik', 80);
  assertText(data.result_note, 'Catatan hasil', 2000);
  numberInRange(data.budget_estimate, 0, 1_000_000_000_000, 'Estimasi biaya');
  numberInRange(data.actual_cost, 0, 1_000_000_000_000, 'Biaya aktual');
  numberInRange(data.passing_grade, 0, 100, 'Nilai kelulusan');
  finiteNumber(data.baseline_value, 'Baseline');
  finiteNumber(data.target_value, 'Target');
  finiteNumber(data.actual_value, 'Hasil aktual');
  assertArray(data.participants, 'Peserta');
  assertArray(data.participant_niks, 'NIK peserta');
  assertArray(data.participant_branches, 'Cabang peserta');
  assertArray(data.need_ids, 'ID kebutuhan');
  assertArray(data.campaign_ids, 'ID survey');
  assertArray(data.assessment_questions, 'Pertanyaan asesmen');
  if (data.plan_origin !== undefined && !['TNA', 'MANDATORY', 'OTHER'].includes(data.plan_origin)) throw new Error('Jenis program tidak valid.');
  if (creating) {
    if (!String(data.title || '').trim()) throw new Error('Nama program wajib diisi.');
    if (!String(data.start_date || '').trim()) throw new Error('Tanggal mulai wajib diisi.');
    if (!Array.isArray(data.participants) || !data.participants.length) throw new Error('Peserta program wajib dipilih.');
    if (!Array.isArray(data.participant_niks) || !data.participant_niks.length) throw new Error('NIK peserta program wajib diisi.');
  }
}
function validateAssignment(data) {
  assertArray(data.responses, 'Respons survey');
  assertArray(data.competencies, 'Kompetensi survey');
  if (data.status !== undefined && !['PENDING', 'SUBMITTED'].includes(data.status)) throw new Error('Status survey tidak valid.');
  if (data.matrix_key !== undefined && !['ROLE', 'CAMPAIGN'].includes(data.matrix_key)) throw new Error('Sumber matrix kompetensi tidak valid.');
  (Array.isArray(data.responses) ? data.responses : []).forEach((response, index) => {
    if (!String(response?.competency_name || '').trim()) throw new Error(`Nama kompetensi pada respons ${index + 1} wajib diisi.`);
    numberInRange(response?.expected_level, 1, 5, `Level harapan respons ${index + 1}`);
    numberInRange(response?.current_level, 1, 5, `Level saat ini respons ${index + 1}`);
    numberInRange(response?.urgency, 1, 5, `Urgensi respons ${index + 1}`);
    numberInRange(response?.business_impact, 1, 5, `Dampak bisnis respons ${index + 1}`);
    assertText(response?.reason, `Alasan respons ${index + 1}`, 2000);
  });
  (Array.isArray(data.competencies) ? data.competencies : []).forEach((competency, index) => {
    if (!String(competency?.name || '').trim()) throw new Error(`Nama kompetensi pada daftar ${index + 1} wajib diisi.`);
    numberInRange(competency?.expected_level, 1, 5, `Level harapan kompetensi ${index + 1}`);
    numberInRange(competency?.business_impact, 1, 5, `Dampak bisnis kompetensi ${index + 1}`);
  });
}
function validateMaterial(data, creating = false) {
  assertText(data.title, 'Judul modul', 300);
  assertText(data.description, 'Deskripsi modul', 4000);
  assertText(data.file_url, 'Link materi', 2000);
  assertText(data.category, 'Kategori materi', 80);
  assertText(data.file_type, 'Tipe materi', 80);
  assertText(data.author, 'Penyusun', 200);
  assertText(data.file_name, 'Nama file', 300);
  assertText(data.storage_provider, 'Penyimpanan file', 40);
  if (data.file_url && !/^https?:\/\/(drive|docs)\.google\.com\//i.test(String(data.file_url).trim())) {
    throw new Error('Link materi harus berupa tautan Google Drive (drive.google.com atau docs.google.com). File tidak diunggah ke Firestore/Supabase.');
  }
  if (creating && !String(data.title || '').trim()) throw new Error('Judul modul wajib diisi.');
}

function validateRecord(type, data, creating = false) {
  if (!COLLECTIONS[type]) throw new Error('Jenis data tidak diizinkan.');
  if (type === 'needs') validateNeed(data, creating);
  if (type === 'progress') validateProgress(data, creating);
  if (type === 'plans') validatePlan(data, creating);
  if (type === 'assignments') validateAssignment(data);
  if (type === 'materials') validateMaterial(data, creating);
}
function canCreatePlan(user, data) {
  if (isHrd(user)) return true;
  if (user.role !== 'BRANCH MANAGER' || !user.branch || !isSameBranch(user, data.cabang)) return false;
  const participants = Array.isArray(data.participants) ? data.participants : [];
  return participants.length > 0 && participants.every(person => !person.cabang || isSameBranch(user, person.cabang));
}
function planVisibleTo(user, data = {}) {
  if (isHrd(user) || HIGH_MANAGEMENT.includes(user.role) || user.role === 'FINANCE') return true;
  if (isLeader(user)) {
    if (isSameBranch(user, data.cabang)) return true;
    if ((Array.isArray(data.participant_branches) ? data.participant_branches : []).some(branch => isSameBranch(user, branch))) return true;
  }
  if ((Array.isArray(data.participant_niks) ? data.participant_niks : []).some(nik => normalizeIdentity(nik) && normalizeIdentity(nik) === normalizeIdentity(user.nik))) return true;
  return (Array.isArray(data.participants) ? data.participants : []).some(person => owns(user, person));
}
function auditValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return `[${value.length} item]`;
  if (typeof value === 'object') return '[object]';
  return String(value).slice(0, 240);
}
function changedFields(before, after) {
  const changes = {};
  Object.keys(after).forEach(key => {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) return;
    changes[key] = { from: auditValue(before[key]), to: auditValue(after[key]) };
  });
  return changes;
}
async function listAll(db, user) {
  const entries = await Promise.all(Object.entries(COLLECTIONS).map(async ([type, name]) => {
    let ref = db.collection(name);
    if (type === 'plans' && !HIGH_MANAGEMENT.includes(user.role)) {
      if (isLeader(user) && user.branch) {
        const snapshot = await ref.limit(2000).get();
        return [type, snapshot.docs.map(serialize).filter(row => readable(user, type, row))];
      }
      const nik = String(user.nik || '').trim();
      if (!nik) return [type, []];
      const variants = [/^\d+$/.test(nik) ? [nik, Number(nik)] : [nik]].flat();
      const snapshots = await Promise.all(variants.map(value => ref.where('participant_niks', 'array-contains', value).limit(2000).get()));
      const rows = new Map();
      snapshots.forEach(snapshot => snapshot.docs.forEach(doc => rows.set(doc.id, serialize(doc))));
      return [type, [...rows.values()].filter(row => readable(user, type, row))];
    }
    if (!HIGH_MANAGEMENT.includes(user.role) && type !== 'campaigns' && type !== 'materials') {
      if (isLeader(user) && user.branch) {
        ref = ref.where('cabang', '==', user.branch);
      } else {
        const identities = [];
        const addIdentity = (field, value, variants = []) => {
          if (!normalizeIdentity(value)) return;
          [value, ...variants].forEach(candidate => {
            if (!identities.some(([savedField, savedValue]) => savedField === field && savedValue === candidate)) identities.push([field, candidate]);
          });
        };
        const nik = String(user.nik || '').trim();
        addIdentity('nik', nik, /^\d+$/.test(nik) ? [Number(nik)] : []);
        addIdentity('username', user.username, [String(user.username || '').toLowerCase(), String(user.username || '').toUpperCase()]);
        addIdentity('email', user.email, [String(user.email || '').toLowerCase()]);
        if (!identities.length) return [type, []];
        const snapshots = await Promise.all(identities.map(([field, value]) => ref.where(field, '==', value).limit(2000).get()));
        const rows = new Map();
        snapshots.forEach(snapshot => snapshot.docs.forEach(doc => rows.set(doc.id, serialize(doc))));
        return [type, [...rows.values()].filter(row => readable(user, type, row))];
      }
    }
    const snapshot = await ref.limit(2000).get();
    return [type, snapshot.docs.map(serialize).filter(row => readable(user, type, row))];
  }));
  return Object.fromEntries(entries);
}
async function createRecord(db, user, type, id, input) {
  const data = sanitizePayload(input);
  if (!COLLECTIONS[type]) throw new Error('Jenis data tidak diizinkan.');
  if (type === 'campaigns' || type === 'assignments') {
    if (!isHrd(user)) throw new Error('Hanya HRD yang dapat membuat data ini.');
  } else if (type === 'plans') {
    if (!canCreatePlan(user, data)) throw new Error('Hanya HRD atau Branch Manager untuk cabang terkait yang dapat membuat program.');
  } else if (type === 'needs' || type === 'progress') {
    if (!owns(user, data) && !isHrd(user)) throw new Error('Anda hanya dapat membuat data pelatihan milik sendiri.');
    if (type === 'progress' && !isHrd(user) && !onlyKeys(data, OWN_FIELDS)) throw new Error('Field evaluasi tidak diizinkan.');
  } else if (type === 'materials') {
    if (!isHrd(user)) throw new Error('Hanya HRD yang dapat menambahkan modul & deck training.');
  }
  validateRecord(type, data, true);
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
  } else if (type === 'needs' && isLeader(user) && isSameBranch(user, current.cabang) && onlyKeys(data, new Set(['current_level', 'urgency', 'manager_note', 'validation_status', 'validated_by_nik', 'validated_at', 'plan_id', 'planned_at']))) {
    // Direct manager validates a branch need or links it to a branch plan.
  } else if (type === 'plans' && ['GM', 'DIREKTUR'].includes(user.role) && onlyKeys(data, new Set(['status', 'gm_status', 'gm_by', 'gm_at']))) {
    // GM approval.
  } else if (type === 'plans' && user.role === 'FINANCE' && onlyKeys(data, new Set(['status', 'finance_status', 'finance_by', 'finance_at']))) {
    // Budget approval.
  } else if (type === 'progress' && owns(user, current) && onlyKeys(data, OWN_FIELDS)) {
    // Employee assessment and feedback.
  } else if (type === 'progress' && isLeader(user) && isSameBranch(user, current.cabang) && onlyKeys(data, BEHAVIOR_FIELDS)) {
    // Manager follow-up evaluation.
  } else throw new Error('Anda tidak berhak mengubah data tersebut.');
  validateRecord(type, data, false);
  await ref.set({ ...data, updated_at: new Date().toISOString() }, { merge: true });
  return { id: ref.id, changes: changedFields(current, data) };
}

async function deleteDocuments(db, refs = []) {
  for (let index = 0; index < refs.length; index += 450) {
    const batch = db.batch();
    refs.slice(index, index + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteCampaign(db, user, campaignId) {
  if (!isHrd(user)) throw new Error('Hanya HRD yang dapat menghapus survey.');
  const id = cleanId(campaignId);
  const campaignRef = db.collection(COLLECTIONS.campaigns).doc(id);
  const campaign = await campaignRef.get();
  if (!campaign.exists) throw new Error('Survey tidak ditemukan.');
  const [assignments, needs] = await Promise.all([
    db.collection(COLLECTIONS.assignments).where('campaign_id', '==', id).limit(2000).get(),
    db.collection(COLLECTIONS.needs).where('campaign_id', '==', id).limit(5000).get()
  ]);
  await deleteDocuments(db, [...assignments.docs.map(doc => doc.ref), ...needs.docs.map(doc => doc.ref), campaignRef]);
  return { id, assignments: assignments.size, needs: needs.size };
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
        const data = sanitizePayload(item.data);
        validateRecord('assignments', data, true);
        const ref = context.db.collection(COLLECTIONS.assignments).doc(cleanId(item.id));
        batch.set(ref, { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      });
      await batch.commit();
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_SURVEY_DISTRIBUTED', module: 'TRAINING', recordId: body.campaignId || '', metadata: { count: body.rows.length } });
      res.status(200).json({ success: true, count: body.rows.length });
      return true;
    }
    if (action === 'create') {
      const id = await createRecord(context.db, context.user, body.type, body.id, body.data);
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_RECORD_CREATED', module: 'TRAINING', recordId: id, metadata: { type: body.type, fields: Object.keys(sanitizePayload(body.data || {})).slice(0, 40) } });
      res.status(200).json({ success: true, id });
      return true;
    }
    if (action === 'update') {
      const result = await updateRecord(context.db, context.user, body.type, body.id, body.data);
      const id = typeof result === 'string' ? result : result.id;
      const changes = typeof result === 'object' ? result.changes : {};
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_RECORD_UPDATED', module: 'TRAINING', recordId: id, metadata: { type: body.type, changed_fields: Object.keys(changes || {}), changes } });
      res.status(200).json({ success: true, id });
      return true;
    }
    if (action === 'delete_campaign') {
      const deleted = await deleteCampaign(context.db, context.user, body.campaignId);
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_SURVEY_DELETED', module: 'TRAINING', recordId: deleted.id, metadata: deleted });
      res.status(200).json({ success: true, deleted });
      return true;
    }
    if (action === 'delete_material') {
      if (!isHrd(context.user)) throw new Error('Hanya HRD yang dapat menghapus modul & deck training.');
      const id = cleanId(body.id);
      await context.db.collection(COLLECTIONS.materials).doc(id).delete();
      await writeAuditLog(context.db, req, context.user, { action: 'TRAINING_MATERIAL_DELETED', module: 'TRAINING', recordId: id });
      res.status(200).json({ success: true, id });
      return true;
    }
    res.status(400).json({ success: false, error: 'Aksi tidak dikenali.' });
    return true;
  } catch (error) {
    console.error('[training]', error);
    const quotaExceeded = isFirestoreQuotaError(error);
    res.status(quotaExceeded ? 503 : 400).json({ success: false, error: quotaExceeded
      ? 'Kuota baca Firestore sedang habis. Data pelatihan tidak dapat dimuat sampai kuota pulih.'
      : error.message || 'Operasi pelatihan gagal.' });
    return true;
  }
}

module.exports = { handleTrainingAccess, _test: { readable, owns, onlyKeys, sanitizePayload, validateRecord, planVisibleTo, canCreatePlan } };
