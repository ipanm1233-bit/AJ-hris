export const TRAINING_STATUS = Object.freeze({
  DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', CLOSED: 'CLOSED',
  PENDING_GM: 'PENDING_GM', PENDING_FINANCE: 'PENDING_FINANCE',
  SCHEDULED: 'SCHEDULED', ONGOING: 'ONGOING', COMPLETED: 'COMPLETED',
  REJECTED_GM: 'REJECTED_GM', REJECTED_FINANCE: 'REJECTED_FINANCE', CANCELLED: 'CANCELLED'
});

export function normalizeToken(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function employeeNik(employee = {}) {
  return String(employee.nik || employee.nik_karyawan || employee.no_induk || '').trim();
}

export function employeeName(employee = {}) {
  return String(employee.nama_karyawan || employee.nama || '').trim();
}

export function employeeBranch(employee = {}) {
  return String(employee.cabang || employee.branch || '').trim();
}

export function employeeDivision(employee = {}) {
  return String(employee.divisi || employee.departemen || employee.department || '').trim();
}

export function campaignTargetsEmployee(campaign = {}, employee = {}) {
  const branch = normalizeToken(campaign.target_branch);
  const division = normalizeToken(campaign.target_division);
  const position = normalizeToken(campaign.target_position);
  const employeePosition = normalizeToken(employee.jabatan || employee.posisi);
  return (!branch || branch === 'SEMUA' || branch === normalizeToken(employeeBranch(employee)))
    && (!division || division === 'SEMUA' || division === normalizeToken(employeeDivision(employee)))
    && (!position || position === 'SEMUA' || position === employeePosition);
}

export function competencyGap(expected, current) {
  return Math.max(0, Number(expected || 0) - Number(current || 0));
}

export function needPriorityScore(need = {}) {
  const gap = competencyGap(need.expected_level, need.current_level);
  const urgency = Math.min(5, Math.max(1, Number(need.urgency || 3)));
  const impact = Math.min(5, Math.max(1, Number(need.business_impact || 3)));
  return gap * 4 + urgency * 2 + impact * 2;
}

export function priorityLabel(score) {
  if (score >= 28) return 'KRITIS';
  if (score >= 20) return 'TINGGI';
  if (score >= 12) return 'MENENGAH';
  return 'RENDAH';
}

export function learningGain(pretest, posttest) {
  if (!Number.isFinite(Number(pretest)) || !Number.isFinite(Number(posttest))) return null;
  return Number(posttest) - Number(pretest);
}

export function aggregateNeeds(rows = [], dimension = 'competency_name') {
  const groups = new Map();
  rows.forEach(row => {
    const key = String(row[dimension] || 'Belum ditentukan').trim() || 'Belum ditentukan';
    const current = groups.get(key) || { key, count: 0, gapTotal: 0, priorityTotal: 0 };
    current.count += 1;
    current.gapTotal += competencyGap(row.expected_level, row.current_level);
    current.priorityTotal += needPriorityScore(row);
    groups.set(key, current);
  });
  return [...groups.values()].map(item => ({
    ...item,
    averageGap: item.count ? item.gapTotal / item.count : 0,
    averagePriority: item.count ? item.priorityTotal / item.count : 0
  })).sort((a, b) => b.averagePriority - a.averagePriority || b.count - a.count);
}

export function trainingMetrics({ assignments = [], needs = [], plans = [], progress = [] } = {}) {
  const submitted = assignments.filter(item => item.status === 'SUBMITTED').length;
  const completedPlans = plans.filter(item => item.status === TRAINING_STATUS.COMPLETED).length;
  const gains = progress.map(item => learningGain(item.pretest_score, item.posttest_score)).filter(Number.isFinite);
  return {
    assigned: assignments.length,
    submitted,
    responseRate: assignments.length ? Math.round(submitted / assignments.length * 100) : 0,
    needs: needs.length,
    plans: plans.length,
    completedPlans,
    averageLearningGain: gains.length ? gains.reduce((sum, value) => sum + value, 0) / gains.length : 0
  };
}

export function safeParticipantSnapshot(employee = {}) {
  return {
    nik: employeeNik(employee),
    nama: employeeName(employee),
    cabang: employeeBranch(employee),
    divisi: employeeDivision(employee),
    jabatan: String(employee.jabatan || employee.posisi || '').trim(),
    atasan: String(employee.atasan || '').trim(),
    email: String(employee.email_perusahaan || employee.email || '').trim()
  };
}
