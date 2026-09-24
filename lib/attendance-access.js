const { requireFirebaseAuth, enforceRateLimit, normalizeBranch, writeAuditLog, isFirestoreQuotaError } = require('./security.js');
const { supabaseEnabled } = require('./supabase.js');
const { listAttendance, upsertAttendance, deleteAttendance } = require('./attendance-supabase.js');
const { listFingerprintMappings, fingerprintAttendanceById, fingerprintAttendanceByIds, planManualFingerprintRows,
  validateManualMapping, saveFingerprintMapping, revokeFingerprintMapping } = require('./fingerprint-mappings.js');

const PRIVILEGED_ROLES = new Set(['HRD', 'SUPERADMIN', 'ADMIN']);

function safeTime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`Format jam tidak valid: ${text}`);
  return text;
}

function safeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function safeLimit(value) {
  return Math.min(5000, Math.max(1, Number(value || 2500)));
}

function attendanceIdentity(row = {}) {
  const nik = String(row.nik || row.nik_karyawan || '').trim().toUpperCase();
  const tanggal = String(row.tanggal || '').trim();
  if (nik && tanggal) return `${nik}|${tanggal}`;
  return `ID|${String(row.id || row._docId || '').trim()}`;
}

function fingerprintIdentity(row = {}) {
  const fingerId = String(row.fingerprint_user_id || row.fingerprint_no_id || '').trim().toUpperCase();
  const date = String(row.tanggal || '').trim();
  const branch = normalizeBranch(row.cabang);
  return fingerId && date && branch
    ? `${branch}|${date}|${fingerId}` : '';
}

function sameMachineAccount(first = {}, second = {}) {
  if (!first.tanggal || first.tanggal !== second.tanggal ||
      normalizeBranch(first.cabang) !== normalizeBranch(second.cabang)) return false;
  const identifiers = row => [
    String(row.fingerprint_user_id || row.fingerprint_emp_no || row.emp_no || '').trim().toUpperCase(),
    String(row.fingerprint_no_id || row.no_id || '').trim().toUpperCase()
  ];
  const [firstUser, firstPin] = identifiers(first);
  const [secondUser, secondPin] = identifiers(second);
  return Boolean((firstUser && secondUser && firstUser === secondUser) ||
    (firstPin && secondPin && firstPin === secondPin));
}

function fingerprintOwner(row = {}) {
  return String(row.fingerprint_name || row.nama_finger || row.nama || '')
    .replace(/\(BELUM DIPETAKAN\)/gi, '')
    .trim().replace(/\s+/g, ' ').toUpperCase();
}

function sameFingerprintOwner(first, second) {
  const left = fingerprintOwner(first);
  const right = fingerprintOwner(second);
  return Boolean(left && right) && (left === right ||
    (left.length >= 3 && right.startsWith(`${left} `)) ||
    (right.length >= 3 && left.startsWith(`${right} `)));
}

function mappedFingerprintOwner(row, candidates) {
  const matches = candidates.filter(candidate =>
    !isPendingIdentity(candidate) && sameMachineAccount(row, candidate) &&
    sameFingerprintOwner(row, candidate)
  );
  // A machine ID can be reassigned. Never choose between distinct NIKs.
  return matches.length && new Set(matches.map(candidate => String(candidate.nik || candidate.nik_karyawan || '').trim().toUpperCase())).size === 1
    ? matches[0] : null;
}

function hasMappedFingerprintOwner(row, candidates) {
  return Boolean(mappedFingerprintOwner(row, candidates));
}

function isPendingIdentity(row = {}) {
  return /^FINGER-/i.test(String(row.nik || row.nik_karyawan || '')) ||
    String(row.klasifikasi_scan || '').toUpperCase() === 'IDENTITY_PENDING';
}

function rowPriority(row = {}) {
  const source = String(row.sumber || '').toUpperCase();
  const id = String(row.id || row._docId || '');
  let score = row.__provider === 'supabase' ? 30 : 0;
  if (source.includes('KOREKSI')) score += 40;
  else if (source.includes('FINGERPRINT')) score += 25;
  else if (source.includes('IMPORT')) score += 10;
  if (id.startsWith('ABS-FP-') || id.startsWith('ABS-MANUAL-')) score += 8;
  if (row.scan_masuk) score += 2;
  if (row.scan_keluar || row.scan_pulang) score += 2;
  return score;
}

function attendanceDedupeKey(row = {}) {
  const branch = normalizeBranch(row.cabang) || 'UNKNOWN';
  const tanggal = String(row.tanggal || '').trim();
  const fingerId = String(row.fingerprint_user_id || row.fingerprint_no_id || '').trim().toUpperCase();
  const nik = String(row.nik || row.nik_karyawan || '').trim().toUpperCase();
  return `${branch}|${tanggal}|${fingerId ? `FINGER:${fingerId}` : `NIK:${nik}`}`;
}

function timeMinutes(value) {
  const match = String(value || '').slice(0, 5).match(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
  return match ? Number(match[0].slice(0, 2)) * 60 + Number(match[0].slice(3, 5)) : null;
}

function buildAttendanceDedupePlan(rows = [], minWorkGapMinutes = 120) {
  const groups = new Map();
  rows.forEach(row => {
    const key = attendanceDedupeKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...row });
  });

  const updates = [];
  const deleteIds = [];
  groups.forEach(group => {
    if (group.length < 2) return;
    const ranked = [...group].sort((a, b) => {
      const identityScore = row => (/^FINGER-/i.test(String(row.nik || '')) ? 0 : 100) + (row.auto_assign === true ? 20 : 0);
      return (identityScore(b) + rowPriority(b)) - (identityScore(a) + rowPriority(a));
    });
    const canonical = ranked[0];
    const times = group.flatMap(row => [row.scan_masuk, row.scan_keluar || row.scan_pulang])
      .map(value => ({ value: String(value || '').slice(0, 5), minutes: timeMinutes(value) }))
      .filter(item => item.minutes !== null)
      .sort((a, b) => a.minutes - b.minutes);
    const first = times[0] || null;
    const last = times[times.length - 1] || null;
    const hasWorkdayPair = first && last && last.minutes - first.minutes >= minWorkGapMinutes;
    updates.push({
      ...canonical,
      scan_masuk: first ? first.value : null,
      scan_keluar: hasWorkdayPair ? last.value : (canonical.scan_keluar || canonical.scan_pulang || null),
      perlu_koreksi: hasWorkdayPair ? false : canonical.perlu_koreksi,
      alasan_koreksi: hasWorkdayPair ? '' : canonical.alasan_koreksi,
      klasifikasi_scan: hasWorkdayPair ? 'DEDUPLICATED_COMPLETE' : canonical.klasifikasi_scan
    });
    group.forEach(row => {
      if (String(row.id || '') && String(row.id) !== String(canonical.id || '')) deleteIds.push(String(row.id));
    });
  });
  return { updates, deleteIds: [...new Set(deleteIds)], groups: updates.length };
}

function dedupeAttendanceRows(rows = []) {
  const merged = new Map();
  const copies = rows.map(row => ({ ...row }));
  const mappedRows = copies.filter(row => !isPendingIdentity(row));
  const visible = copies.filter(row => {
    // A resolved scan supersedes its temporary machine identity, even when
    // the provisional NIK differs from the employee's actual NIK.
    if (isPendingIdentity(row)) {
      const mapped = mappedFingerprintOwner(row, mappedRows);
      if (mapped) {
        const morningScans = [mapped.scan_masuk, row.scan_masuk].filter(Boolean).sort();
        mapped.scan_masuk = morningScans[0] || null;
        mapped.scan_keluar ||= row.scan_keluar || row.scan_pulang || null;
        return false;
      }
    }
    return true;
  });
  visible.forEach(row => {
    const key = attendanceIdentity(row);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, row);
      return;
    }
    const preferred = rowPriority(row) >= rowPriority(current) ? row : current;
    const fallback = preferred === row ? current : row;
    merged.set(key, {
      ...fallback,
      ...preferred,
      scan_masuk: preferred.scan_masuk || fallback.scan_masuk || null,
      scan_keluar: preferred.scan_keluar || preferred.scan_pulang || fallback.scan_keluar || fallback.scan_pulang || null
    });
  });
  return [...merged.values()].map(row => {
    const clean = { ...row };
    delete clean.__provider;
    return clean;
  });
}

function isPrivileged(context) {
  return PRIVILEGED_ROLES.has(String(context?.user?.role || '').toUpperCase());
}

async function permissionFor(context) {
  const keys = [...new Set([context.user.username, context.user.nik, context.user.uid].filter(Boolean).map(String))];
  const snapshots = await Promise.all(keys.map(key => context.db.collection('user_permissions').doc(key).get()));
  const rows = snapshots.filter(snap => snap.exists).map(snap => ({ id: snap.id, ...snap.data() }));
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return rows.find(row =>
    String(row.username || '') === String(context.user.username || '') &&
    String(row.nik || '') === String(context.user.nik || '') &&
    row.allowed_menus_set === true && Array.isArray(row.allowed_menus) && row.allowed_menus.includes('absensi')
  ) || null;
}

function hasAction(permission, action) {
  return Boolean(permission && Array.isArray(permission.allowed_actions) && permission.allowed_actions.includes(action));
}

async function loadReconciliationEmployees(db) {
  try {
    const snapshot = await db.collection('master_karyawan').get();
    return { employees: snapshot.docs.map(item => ({ ...item.data(), _docId: item.id })), masterUnavailable: false };
  } catch (error) {
    if (!isFirestoreQuotaError(error)) throw error;
    console.warn('[attendance-access] Master karyawan quota exhausted; reconciling only confirmed Supabase pairs.');
    return { employees: [], masterUnavailable: true };
  }
}

async function firestoreAttendance(db, filters = {}) {
  const branch = String(filters.branch || '').trim();
  let snapshot;
  if (branch) {
    const title = branch.toLowerCase().replace(/\b\p{L}/gu, letter => letter.toUpperCase());
    const values = [...new Set([branch, branch.toUpperCase(), branch.toLowerCase(), title])].filter(Boolean);
    const snapshots = await Promise.all(values.map(value => db.collection('data_absensi').where('cabang', '==', value).get()));
    const docs = new Map();
    snapshots.forEach(result => result.docs.forEach(item => docs.set(item.id, item)));
    snapshot = { docs: [...docs.values()] };
  } else if (filters.fromDate) {
    let request = db.collection('data_absensi').where('tanggal', '>=', filters.fromDate);
    if (filters.toDate) request = request.where('tanggal', '<=', filters.toDate);
    snapshot = await request.orderBy('tanggal', 'desc').limit(safeLimit(filters.limit)).get();
  } else if (filters.nik) {
    snapshot = await db.collection('data_absensi').where('nik', '==', filters.nik).get();
  } else {
    snapshot = await db.collection('data_absensi').limit(safeLimit(filters.limit)).get();
  }
  return snapshot.docs
    .map(item => ({ id: item.id, _docId: item.id, ...item.data() }))
    .filter(row => !filters.fromDate || String(row.tanggal || '') >= filters.fromDate)
    .filter(row => !filters.toDate || String(row.tanggal || '') <= filters.toDate)
    .filter(row => !filters.nik || String(row.nik || row.nik_karyawan || '') === filters.nik)
    .slice(0, safeLimit(filters.limit));
}

async function loadAttendance(context, filters, dependencies = {}) {
  const listFromSupabase = dependencies.listAttendance || listAttendance;
  const listFromFirestore = dependencies.firestoreAttendance || firestoreAttendance;
  const migrateToSupabase = dependencies.upsertAttendance || upsertAttendance;
  if (!supabaseEnabled()) {
    const rows = dedupeAttendanceRows(await listFromFirestore(context.db, filters));
    rows._provider = 'firestore';
    return rows;
  }

  const fallbackEnabled = String(process.env.ATTENDANCE_FIRESTORE_FALLBACK || 'true').toLowerCase() !== 'false';
  // Start both providers together; waiting for Supabase before starting the
  // legacy query used to add their round-trip times on every page opening.
  const legacyRequest = fallbackEnabled
    ? listFromFirestore(context.db, filters).then(rows => ({ rows }), error => ({ error }))
    : null;
  let supabaseRows;
  try {
    supabaseRows = await listFromSupabase(filters);
    supabaseRows._provider = 'supabase';
  } catch (error) {
    if (!fallbackEnabled) throw error;
    console.warn('[attendance-access] Supabase read unavailable, using Firestore fallback:', error.message);
    const legacy = await legacyRequest;
    if (legacy.error) throw legacy.error;
    const rows = dedupeAttendanceRows(legacy.rows);
    rows._provider = 'firestore-fallback';
    return rows;
  }
  if (!fallbackEnabled) {
    const rows = dedupeAttendanceRows(supabaseRows).slice(0, safeLimit(filters.limit));
    rows._provider = 'supabase';
    return rows;
  }

  try {
    const legacy = await legacyRequest;
    if (legacy.error) throw legacy.error;
    const legacyRows = legacy.rows;

    const migratedKeys = new Set(supabaseRows.map(attendanceIdentity));
    const missingRows = dedupeAttendanceRows(legacyRows.filter(row =>
      !migratedKeys.has(attendanceIdentity(row)) &&
      !(isPendingIdentity(row) && hasMappedFingerprintOwner(row, [...supabaseRows, ...legacyRows]))
    ));
    if (missingRows.length) {
      try {
        for (let index = 0; index < missingRows.length; index += 500) await migrateToSupabase(missingRows.slice(index, index + 500));
      } catch (error) {
        if (!fallbackEnabled) throw error;
        console.warn('[attendance-access] Supabase attendance backfill deferred:', error.message);
      }
    }

    const rows = dedupeAttendanceRows([
      ...legacyRows.map(row => ({ ...row, __provider: 'firestore' })),
      ...supabaseRows.map(row => ({ ...row, __provider: 'supabase' }))
    ]).slice(0, safeLimit(filters.limit));
    rows._provider = 'supabase+firestore';
    return rows;
  } catch (error) {
    // Firestore is only a temporary migration fallback. Supabase must remain
    // available even when the legacy quota is exhausted or Firestore is down.
    console.warn('[attendance-access] Legacy Firestore fallback unavailable:', error.message);
    const rows = dedupeAttendanceRows(supabaseRows).slice(0, safeLimit(filters.limit));
    rows._provider = 'supabase';
    return rows;
  }
}

async function writeAttendance(context, rows, dependencies = {}) {
  const writeSupabase = dependencies.upsertAttendance || upsertAttendance;
  if (dependencies.requireSupabase && !supabaseEnabled()) {
    throw new Error('Supabase absensi belum dikonfigurasi; impor tidak disimpan.');
  }
  if (supabaseEnabled()) {
    try {
      const saved = await writeSupabase(rows);
      if (dependencies.requireSupabase && (!Array.isArray(saved) || saved.length !== rows.length)) {
        throw new Error(`Supabase hanya mengonfirmasi ${Array.isArray(saved) ? saved.length : 0} dari ${rows.length} baris impor.`);
      }
      return saved;
    } catch (error) {
      if (dependencies.requireSupabase) throw error;
      const fallbackEnabled = String(process.env.ATTENDANCE_FIRESTORE_FALLBACK || 'true').toLowerCase() !== 'false';
      if (!fallbackEnabled) throw error;
      console.warn('[attendance-access] Supabase write unavailable, using Firestore fallback:', error.message);
    }
  }
  for (let index = 0; index < rows.length; index += 400) {
    const batch = context.db.batch();
    rows.slice(index, index + 400).forEach(row => {
      const id = String(row.id || '').trim();
      const payload = { ...row };
      delete payload.id;
      delete payload._docId;
      batch.set(context.db.collection('data_absensi').doc(id), payload, { merge: true });
    });
    await batch.commit();
  }
}

async function removeAttendance(context, ids, dependencies = {}) {
  const removeSupabase = dependencies.deleteAttendance || deleteAttendance;
  if (supabaseEnabled()) {
    try {
      return await removeSupabase(ids);
    } catch (error) {
      const fallbackEnabled = String(process.env.ATTENDANCE_FIRESTORE_FALLBACK || 'true').toLowerCase() !== 'false';
      if (!fallbackEnabled) throw error;
      console.warn('[attendance-access] Supabase delete unavailable, using Firestore fallback:', error.message);
    }
  }
  for (let index = 0; index < ids.length; index += 400) {
    const batch = context.db.batch();
    ids.slice(index, index + 400).forEach(id => batch.delete(context.db.collection('data_absensi').doc(id)));
    await batch.commit();
  }
  return ids;
}

async function handleAttendanceAccess(req, res, body = {}) {
  if (!enforceRateLimit(req, res, { namespace: 'attendance-access', limit: 80, windowMs: 60_000 })) return;
  const context = await requireFirebaseAuth(req, res);
  if (!context) return;

  try {
    const privileged = isPrivileged(context);
    const permission = privileged ? null : await permissionFor(context);
    const userBranch = String(context.user.branch || '').trim();
    const canViewBranch = hasAction(permission, 'absensi.data.view_all');

    if (body.action === 'attendance_list') {
      const fromDate = safeDate(body.fromDate);
      const toDate = safeDate(body.toDate);
      let branch = privileged ? String(body.branch || '').trim() : '';
      let nik = privileged ? String(body.nik || '').trim() : '';
      if (!privileged && canViewBranch) {
        if (!userBranch || userBranch === '-') return res.status(403).json({ success: false, error: 'Cabang akun PIC belum dikonfigurasi.' });
        branch = userBranch;
      } else if (!privileged) {
        nik = String(context.user.nik || '').trim();
        if (!nik) return res.status(200).json({ success: true, branch: userBranch, rows: [] });
      }
      if (body.requireSupabase === true && !supabaseEnabled()) throw new Error('Supabase absensi belum dikonfigurasi; ekspor dihentikan.');
      const offset = Number(body.offset || 0);
      if (body.requireSupabase === true && (!Number.isInteger(offset) || offset < 0 || offset > 5000)) throw new Error('Offset arsip absensi tidak valid.');
      const rows = body.requireSupabase === true
        ? await listAttendance({ fromDate, toDate, branch, nik, limit: safeLimit(body.limit), offset })
        : await loadAttendance(context, { fromDate, toDate, branch, nik, limit: safeLimit(body.limit) });
      return res.status(200).json({ success: true, provider: rows._provider || (supabaseEnabled() ? 'supabase' : 'firestore'), branch, rows });
    }

    const canEdit = privileged || (hasAction(permission, 'absensi.data.edit') && permission.read_only !== true);
    if (['attendance_mapping_list', 'attendance_mapping_save', 'attendance_mapping_save_bulk', 'attendance_mapping_revoke'].includes(body.action)) {
      if (!privileged) return res.status(403).json({ success: false, error: 'Pemetaan finger hanya dapat dikelola HRD/Admin.' });
      if (!supabaseEnabled()) throw new Error('Supabase absensi belum dikonfigurasi.');
      if (body.action === 'attendance_mapping_list') {
        const mappings = await listFingerprintMappings(String(body.branch || '').trim());
        return res.status(200).json({ success: true, mappings });
      }
      if (body.action === 'attendance_mapping_revoke') {
        const id = String(body.id || '').trim();
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('ID pemetaan tidak valid.');
        await revokeFingerprintMapping(id, context.user.uid || context.user.username || 'HRD');
        await writeAuditLog(context.db, req, context.user, { action: 'FINGERPRINT_MAPPING_REVOKE', module: 'absensi', recordId: id });
        return res.status(200).json({ success: true });
      }
      if (body.action === 'attendance_mapping_save_bulk') {
        const inputs = Array.isArray(body.mappings) ? body.mappings : [];
        if (!inputs.length || inputs.length > 10 || inputs.some(item => !item || typeof item !== 'object')) throw new Error('Pilih 1–10 identitas mesin per proses.');
        const pendingRows = await fingerprintAttendanceByIds(inputs.map(item => String(item.pendingId || '')));
        const byId = new Map(pendingRows.map(row => [String(row.id), row]));
        const { employees, masterUnavailable } = await loadReconciliationEmployees(context.db);
        if (masterUnavailable) throw new Error('Master karyawan Firestore sedang terkena batas kuota; pemetaan ditunda hingga NIK dapat diverifikasi.');
        const current = await listFingerprintMappings();
        if (current.length >= 1000) throw new Error('Daftar pemetaan terlalu besar; hubungi pengelola sistem.');
        const drafts = [];
        for (const input of inputs) {
          const pending = byId.get(String(input.pendingId));
          if (!pending || !/^FINGER-/i.test(String(pending.nik || ''))) throw new Error('Ada baris yang tidak lagi berstatus belum terpetakan. Muat ulang tabel.');
          const record = validateManualMapping({
            cabang: pending.cabang,
            empNo: pending.fingerprint_user_id || pending.fingerprint_emp_no || pending.emp_no,
            noId: pending.fingerprint_no_id || pending.no_id,
            fingerName: pending.fingerprint_name || pending.nama_finger,
            nik: input.nik, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo,
            reason: input.reason
          }, employees, [...current, ...drafts.map(draft => ({ ...draft, active: true }))]);
          drafts.push(record);
        }
        const results = [];
        for (const record of drafts) {
          try {
            const saved = await saveFingerprintMapping({ ...record, created_by: context.user.uid || context.user.username || 'HRD' });
            let mapped = 0;
            let skipped = 0;
            let warning = '';
            try {
              const rows = await listAttendance({ fromDate: record.effective_from,
                toDate: record.effective_to || new Date().toISOString().slice(0, 10), branch: record.cabang, limit: 5000 });
              if (rows.length >= 5000) throw new Error('Lebih dari 5.000 baris; arsip lama perlu diproses per periode.');
              const plan = planManualFingerprintRows(rows, { ...saved, active: true });
              for (let index = 0; index < plan.updates.length; index += 200) await upsertAttendance(plan.updates.slice(index, index + 200));
              if (plan.deleteIds.length) await deleteAttendance(plan.deleteIds);
              mapped = plan.updates.length;
              skipped = plan.skipped;
            } catch (error) { warning = `Riwayat ${record.finger_name} belum selesai diperbarui: ${error.message}`; }
            results.push({ pendingId: inputs[drafts.indexOf(record)].pendingId, saved: true, mapped, skipped, warning });
            try {
              await writeAuditLog(context.db, req, context.user, { action: 'FINGERPRINT_MAPPING_SAVE', module: 'absensi', recordId: saved.id,
                metadata: { branch: record.cabang, emp_no: record.emp_no, no_id: record.no_id, nik: record.nik,
                  from_date: record.effective_from, to_date: record.effective_to, mapped, skipped, backfill_error: Boolean(warning) } });
            } catch (error) { console.warn('[attendance-access] Finger mapping audit failed:', error.message); }
          } catch (error) {
            results.push({ pendingId: inputs[drafts.indexOf(record)].pendingId, saved: false, error: error.message });
          }
        }
        return res.status(200).json({ success: true, results });
      }
      const pending = await fingerprintAttendanceById(String(body.pendingId || ''));
      if (!pending || !/^FINGER-/i.test(String(pending.nik || ''))) throw new Error('Baris finger belum terpetakan tidak ditemukan di Supabase.');
      const { employees, masterUnavailable } = await loadReconciliationEmployees(context.db);
      if (masterUnavailable) throw new Error('Master karyawan Firestore sedang terkena batas kuota; tunggu hingga master dapat dibaca sebelum menetapkan NIK secara manual.');
      const empNo = String(pending.fingerprint_user_id || pending.fingerprint_emp_no || pending.emp_no || '').trim();
      const noId = String(pending.fingerprint_no_id || pending.no_id || '').trim();
      const fingerName = String(pending.fingerprint_name || pending.nama_finger || '').trim();
      const current = await listFingerprintMappings(pending.cabang);
      if (current.length >= 1000) throw new Error('Daftar pemetaan terlalu besar; hubungi pengelola sistem.');
      const record = validateManualMapping({
        cabang: pending.cabang, empNo, noId, fingerName,
        nik: body.nik, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo,
        reason: body.reason
      }, employees, current);
      const saved = await saveFingerprintMapping({ ...record, created_by: context.user.uid || context.user.username || 'HRD' });
      let mapped = 0;
      let skipped = 0;
      let backfillError = '';
      try {
        const rows = await listAttendance({ fromDate: record.effective_from,
          toDate: record.effective_to || new Date().toISOString().slice(0, 10), branch: record.cabang, limit: 5000 });
        if (rows.length >= 5000) throw new Error('Lebih dari 5.000 baris; arsip lama perlu diproses per periode.');
        const plan = planManualFingerprintRows(rows, { ...saved, active: true });
        for (let index = 0; index < plan.updates.length; index += 200) await upsertAttendance(plan.updates.slice(index, index + 200));
        if (plan.deleteIds.length) await deleteAttendance(plan.deleteIds);
        mapped = plan.updates.length;
        skipped = plan.skipped;
      } catch (error) {
        console.warn('[attendance-access] Manual mapping saved; backfill deferred:', error.message);
        backfillError = 'Pemetaan tersimpan untuk sinkronisasi berikutnya, tetapi riwayat belum selesai diperbarui: ' + error.message;
      }
      await writeAuditLog(context.db, req, context.user, {
        action: 'FINGERPRINT_MAPPING_SAVE', module: 'absensi', recordId: saved.id,
        metadata: { branch: record.cabang, emp_no: empNo, no_id: noId, nik: record.nik,
          from_date: record.effective_from, to_date: record.effective_to, mapped, skipped, backfill_error: Boolean(backfillError) }
      });
      return res.status(200).json({ success: true, mapping: saved, mapped, skipped, backfillError });
    }
    if (body.action === 'attendance_upsert') {
      if (!canEdit) return res.status(403).json({ success: false, error: 'Izin menyimpan absensi belum diberikan.' });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length || rows.length > 2000) return res.status(400).json({ success: false, error: 'Jumlah data harus 1–2.000 baris.' });
      rows.forEach(row => {
        if (!row.id || !row.nik || !safeDate(row.tanggal)) throw new Error('ID, NIK, dan tanggal absensi wajib valid.');
        if (!privileged && normalizeBranch(row.cabang) !== normalizeBranch(userBranch)) throw new Error('Ada data di luar cabang PIC.');
        row.scan_masuk = safeTime(row.scan_masuk);
        row.scan_keluar = safeTime(row.scan_keluar || row.scan_pulang);
      });
      await writeAttendance(context, rows, { requireSupabase: body.requireSupabase === true });
      await writeAuditLog(context.db, req, context.user, { action: 'ATTENDANCE_UPSERT', module: 'absensi', recordId: `${rows.length}_rows`, metadata: { provider: supabaseEnabled() ? 'supabase' : 'firestore' } });
      return res.status(200).json({ success: true, count: rows.length });
    }

    if (body.action === 'attendance_delete') {
      const canDelete = privileged || (hasAction(permission, 'absensi.data.delete') && permission.read_only !== true);
      if (!canDelete) return res.status(403).json({ success: false, error: 'Izin menghapus absensi belum diberikan.' });
      const ids = [...new Set((body.ids || []).map(value => String(value || '').trim()).filter(Boolean))];
      if (!ids.length || ids.length > 2000) return res.status(400).json({ success: false, error: 'Jumlah ID harus 1–2.000 baris.' });
      if (!privileged) {
        const rows = await loadAttendance(context, { branch: userBranch, limit: 5000 });
        const allowedIds = new Set(rows.map(row => row.id));
        if (ids.some(id => !allowedIds.has(id))) throw new Error('Ada data di luar cabang PIC.');
      }
      await removeAttendance(context, ids);
      await writeAuditLog(context.db, req, context.user, { action: 'BULK_ATTENDANCE_DELETE', module: 'absensi', recordId: `${ids.length}_rows`, metadata: { provider: supabaseEnabled() ? 'supabase' : 'firestore' } });
      return res.status(200).json({ success: true, count: ids.length });
    }

    if (body.action === 'attendance_dedupe') {
      if (!privileged) return res.status(403).json({ success: false, error: 'Pembersihan duplikasi hanya dapat dilakukan HRD/Admin.' });
      const fromDate = safeDate(body.fromDate);
      const toDate = safeDate(body.toDate);
      const branch = String(body.branch || '').trim();
      const rawRows = supabaseEnabled()
        ? await listAttendance({ fromDate, toDate, branch, limit: 5000 })
        : await firestoreAttendance(context.db, { fromDate, toDate, branch, limit: 5000 });
      const plan = buildAttendanceDedupePlan(rawRows);
      if (plan.updates.length) await writeAttendance(context, plan.updates);
      if (plan.deleteIds.length) await removeAttendance(context, plan.deleteIds);
      await writeAuditLog(context.db, req, context.user, {
        action: 'ATTENDANCE_DEDUPLICATE', module: 'absensi', recordId: `${plan.deleteIds.length}_rows`,
        metadata: { branch, from_date: fromDate, to_date: toDate, groups: plan.groups, provider: supabaseEnabled() ? 'supabase' : 'firestore' }
      });
      return res.status(200).json({ success: true, groups: plan.groups, removed: plan.deleteIds.length });
    }

    if (body.action === 'attendance_reconcile') {
      if (!privileged) return res.status(403).json({ success: false, error: 'Pemetaan finger hanya dapat dilakukan HRD/Admin.' });
      if (!supabaseEnabled()) throw new Error('Supabase absensi belum dikonfigurasi.');
      const fromDate = safeDate(body.fromDate);
      const toDate = safeDate(body.toDate);
      if (!fromDate || !toDate || fromDate > toDate) throw new Error('Pilih rentang tanggal yang valid untuk pemetaan.');
      const branch = String(body.branch || '').trim();
      const rows = await listAttendance({ fromDate, toDate, branch, limit: 5000 });
      if (rows.length >= 5000) throw new Error('Lebih dari 5.000 baris; persempit tanggal atau cabang untuk pemetaan.');
      const { employees, masterUnavailable } = await loadReconciliationEmployees(context.db);
      const { planFingerprintReconciliation } = require('./attendance-reconcile.js');
      const plan = planFingerprintReconciliation(rows, employees, { verifiedRowsOnly: masterUnavailable });
      for (let index = 0; index < plan.updates.length; index += 200) await upsertAttendance(plan.updates.slice(index, index + 200));
      if (plan.deleteIds.length) await deleteAttendance(plan.deleteIds);
      await writeAuditLog(context.db, req, context.user, { action: 'FINGERPRINT_RECONCILE', module: 'absensi', recordId: `${plan.updates.length}_rows`, metadata: { branch, from_date: fromDate, to_date: toDate, unresolved: plan.unresolved, master_unavailable: masterUnavailable } });
      return res.status(200).json({ success: true, mapped: plan.updates.length, unresolved: plan.unresolved, masterUnavailable });
    }

    if (body.action !== 'attendance_patch') return res.status(400).json({ success: false, error: 'Tindakan absensi tidak dikenali.' });
    if (!canEdit) return res.status(403).json({ success: false, error: 'Izin koreksi absensi belum diberikan atau akun hanya-baca.' });
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (!changes.length || changes.length > 400) return res.status(400).json({ success: false, error: 'Jumlah koreksi harus 1–400 baris.' });

    const ids = changes.map(item => String(item.id || '').trim());
    if (ids.some(id => !id)) return res.status(400).json({ success: false, error: 'ID absensi tidak valid.' });
    const existingRows = await loadAttendance(context, { branch: privileged ? '' : userBranch, limit: 5000 });
    const existingById = new Map(existingRows.map(row => [String(row.id), row]));
    const rows = changes.map(item => {
      const existing = existingById.get(String(item.id));
      if (!existing && !String(item.id).startsWith('ABS-MANUAL-')) throw new Error('Data absensi tidak ditemukan.');
      const cabang = String(existing?.cabang || item.cabang || userBranch).trim();
      if (!privileged && normalizeBranch(cabang) !== normalizeBranch(userBranch)) throw new Error('Ada data di luar cabang PIC.');
      return {
        ...(existing || {}), id: String(item.id),
        nik: String(existing?.nik || item.nik || '').trim(),
        nama: String(existing?.nama || item.nama || '').trim(),
        tanggal: String(existing?.tanggal || item.tanggal || '').trim(),
        cabang, divisi: String(existing?.divisi || item.divisi || '').trim(),
        jabatan: String(existing?.jabatan || item.jabatan || '').trim(),
        sumber: String(existing?.sumber || (privileged ? 'KOREKSI HRD' : 'KOREKSI PIC')),
        scan_masuk: safeTime(item.scan_masuk), scan_keluar: safeTime(item.scan_keluar),
        ...(privileged ? {
          late_penalty_waived: item.late_penalty_waived === true,
          late_penalty_note: item.late_penalty_waived === true ? String(item.late_penalty_note || '').trim() : '',
          late_penalty_updated_by: context.user.name || context.user.username || 'HRD',
          late_penalty_updated_at: new Date().toISOString()
        } : {})
      };
    });
    await writeAttendance(context, rows);
    await writeAuditLog(context.db, req, context.user, { action: 'BULK_ATTENDANCE_CORRECTION', module: 'absensi', recordId: `${changes.length}_rows`, metadata: { branch: privileged ? '' : userBranch, provider: supabaseEnabled() ? 'supabase' : 'firestore' } });
    return res.status(200).json({ success: true, count: changes.length });
  } catch (error) {
    console.error('[attendance-access]', error);
    return res.status(400).json({ success: false, error: error.message || 'Permintaan absensi gagal.' });
  }
}

module.exports = {
  handleAttendanceAccess, firestoreAttendance, loadAttendance, writeAttendance, removeAttendance,
  attendanceIdentity, dedupeAttendanceRows, attendanceDedupeKey, buildAttendanceDedupePlan,
  loadReconciliationEmployees
};
