export const TRAINING_STATUS = Object.freeze({
  DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', CLOSED: 'CLOSED',
  PENDING_GM: 'PENDING_GM', PENDING_FINANCE: 'PENDING_FINANCE',
  SCHEDULED: 'SCHEDULED', ONGOING: 'ONGOING', COMPLETED: 'COMPLETED',
  REJECTED_GM: 'REJECTED_GM', REJECTED_FINANCE: 'REJECTED_FINANCE', CANCELLED: 'CANCELLED'
});

export const TNA_RESPONSE_STANDARD = Object.freeze({
  minResponseRate: 60,
  minRespondents: 3
});

export const TNA_COMPETENCY_TEMPLATES = Object.freeze({
  lengkap: {
    label: 'Paket Lengkap Pengembangan Karyawan',
    competencies: [
      ['Komunikasi Efektif', 4, 5], ['Microsoft Excel', 4, 5], ['Microsoft Word & Dokumentasi', 4, 4],
      ['Leadership & Pengambilan Keputusan', 4, 5], ['Kolaborasi Lintas Divisi', 4, 5],
      ['Problem Solving', 4, 5], ['Manajemen Waktu & Prioritas', 4, 4], ['Adaptasi terhadap Perubahan', 4, 4]
    ]
  },
  komunikasi: {
    label: 'Komunikasi & Pelayanan',
    competencies: [['Komunikasi Efektif', 4, 5], ['Presentasi Profesional', 4, 4], ['Negosiasi', 4, 5], ['Pelayanan Pelanggan', 4, 5], ['Penanganan Konflik', 4, 4]]
  },
  digital: {
    label: 'Digital & Administrasi Perkantoran',
    competencies: [['Microsoft Excel', 4, 5], ['Microsoft Word & Dokumentasi', 4, 4], ['Microsoft PowerPoint', 3, 3], ['Pengolahan & Analisis Data', 4, 5], ['Ketelitian Administrasi', 5, 5]]
  },
  leadership: {
    label: 'Leadership & Supervisory',
    competencies: [['Leadership', 4, 5], ['Delegasi & Monitoring', 4, 5], ['Pengambilan Keputusan', 4, 5], ['Coaching & Feedback', 4, 4], ['Manajemen Konflik Tim', 4, 4]]
  },
  collaboration: {
    label: 'Kolaborasi & Efektivitas Kerja',
    competencies: [['Kolaborasi Lintas Divisi', 4, 5], ['Kerja Sama Tim', 4, 5], ['Problem Solving', 4, 5], ['Manajemen Waktu & Prioritas', 4, 4], ['Adaptasi terhadap Perubahan', 4, 4]]
  },
  sales: {
    label: 'Sales & Customer Management',
    competencies: [['Product Knowledge', 5, 5], ['Teknik Penjualan', 4, 5], ['Negosiasi Penjualan', 4, 5], ['Pengelolaan Piutang & Collection', 4, 5], ['Perencanaan Kunjungan & Area', 4, 4]]
  },
  operasional: {
    label: 'Operasional, Warehouse & K3',
    competencies: [['Kepatuhan SOP', 5, 5], ['Keselamatan dan Kesehatan Kerja (K3)', 5, 5], ['Manajemen Persediaan', 4, 5], ['Ketelitian Barang & Dokumen', 5, 5], ['Koordinasi Pengiriman', 4, 4]]
  }
});

/**
 * Matriks awal kompetensi per kelompok jabatan. Template ini menjadi acuan
 * level harapan minimum; HRD tetap dapat menyesuaikan daftar di survey.
 * Urutan penting: jabatan leadership diprioritaskan sebelum fungsi teknis.
 */
export const TNA_ROLE_COMPETENCY_MATRIX = Object.freeze({
  leadership: {
    label: 'Leadership & Supervisory',
    template: 'leadership',
    keywords: ['manager', 'manajer', 'supervisor', 'spv', 'kepala', 'head', 'gm', 'direktur', 'leader']
  },
  sales: {
    label: 'Sales & Customer Management',
    template: 'sales',
    keywords: ['sales', 'penjualan', 'marketing', 'pemasaran', 'account executive', 'canvasser']
  },
  warehouse: {
    label: 'Operasional, Warehouse & K3',
    template: 'operasional',
    keywords: ['warehouse', 'gudang', 'logistik', 'inventory', 'persediaan', 'produksi', 'operator', 'teknik', 'driver', 'supir']
  },
  customer: {
    label: 'Komunikasi & Pelayanan',
    template: 'komunikasi',
    keywords: ['customer', 'service', 'pelayanan', 'front office', 'cs', 'kasir']
  },
  admin: {
    label: 'Digital & Administrasi',
    template: 'digital',
    keywords: ['admin', 'administrasi', 'keuangan', 'finance', 'accounting', 'hrd', 'personalia', 'sekretaris']
  },
  default: {
    label: 'Pengembangan Umum',
    template: 'lengkap',
    keywords: []
  }
});

export function roleCompetencyKey(employee = {}) {
  const text = [employee.jabatan, employee.posisi, employee.divisi, employee.departemen].filter(Boolean).join(' ').toLowerCase();
  if (!text) return 'default';
  for (const [key, group] of Object.entries(TNA_ROLE_COMPETENCY_MATRIX)) {
    if (key === 'default') continue;
    if (group.keywords.some(keyword => text.includes(keyword))) return key;
  }
  return 'default';
}

export function competenciesForEmployee(employee = {}, fallbackCompetencies = []) {
  const group = TNA_ROLE_COMPETENCY_MATRIX[roleCompetencyKey(employee)] || TNA_ROLE_COMPETENCY_MATRIX.default;
  const template = TNA_COMPETENCY_TEMPLATES[group.template];
  const source = template?.competencies?.length
    ? template.competencies
    : (Array.isArray(fallbackCompetencies) ? fallbackCompetencies : []);
  return source
    .map(row => {
      if (Array.isArray(row)) return { name: row[0], expected_level: Number(row[1] || 3), business_impact: Number(row[2] || 3) };
      return { name: row?.name, expected_level: Number(row?.expected_level || 3), business_impact: Number(row?.business_impact || 3) };
    })
    .filter(item => String(item.name || '').trim())
    .map(item => ({ ...item, name: String(item.name).trim(), expected_level: Math.min(5, Math.max(1, item.expected_level)), business_impact: Math.min(5, Math.max(1, item.business_impact)) }));
}

export function templateCompetencyText(templateKey) {
  const template = TNA_COMPETENCY_TEMPLATES[templateKey];
  return template ? template.competencies.map(row => row.join(' | ')).join('\n') : '';
}

export function respondentKey(row = {}) {
  return String(row.nik || row.username || row.email || row.nama || row.id || '').trim().toLowerCase();
}

export function uniqueRespondentCount(rows = []) {
  return new Set(rows.map(respondentKey).filter(Boolean)).size;
}

export function responseStandardMet({ assignments = [], needs = [] } = {}) {
  const total = Array.isArray(assignments) ? assignments.length : 0;
  const submitted = total ? assignments.filter(item => item.status === 'SUBMITTED').length : 0;
  const rate = total ? Math.round(submitted / total * 100) : 0;
  const respondents = uniqueRespondentCount(needs);
  return {
    total,
    submitted,
    rate,
    respondents,
    minResponseRate: TNA_RESPONSE_STANDARD.minResponseRate,
    minRespondents: TNA_RESPONSE_STANDARD.minRespondents,
    hasAssignments: total > 0,
    ok: total > 0 && rate >= TNA_RESPONSE_STANDARD.minResponseRate && respondents >= TNA_RESPONSE_STANDARD.minRespondents
  };
}

export function surveyReportRows(campaign = {}, assignments = []) {
  return assignments.flatMap(assignment => {
    const responses = Array.isArray(assignment.responses) ? assignment.responses : [];
    if (!responses.length) return [{
      survey: campaign.title || '', period: campaign.period || '', nik: assignment.nik || '', nama: assignment.nama || '',
      cabang: assignment.cabang || '', divisi: assignment.divisi || '', jabatan: assignment.jabatan || '', status: assignment.status || 'PENDING',
      competency: '', expected_level: '', current_level: '', gap: '', urgency: '', business_impact: '', priority_score: '', reason: '', submitted_at: assignment.submitted_at || ''
    }];
    return responses.map(response => ({
      survey: campaign.title || '', period: campaign.period || '', nik: assignment.nik || '', nama: assignment.nama || '',
      cabang: assignment.cabang || '', divisi: assignment.divisi || '', jabatan: assignment.jabatan || '', status: assignment.status || '',
      competency: response.competency_name || '', expected_level: Number(response.expected_level || 0), current_level: Number(response.current_level || 0),
      gap: competencyGap(response.expected_level, response.current_level), urgency: Number(response.urgency || 0), business_impact: Number(response.business_impact || 0),
      priority_score: needPriorityScore(response), reason: response.reason || '', submitted_at: assignment.submitted_at || ''
    }));
  });
}

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

export function participantMatchesSession(participant = {}, session = {}) {
  const identityPairs = [
    [participant.nik, session.nik || session.nik_karyawan],
    [participant.username, session.username],
    [participant.email, session.email]
  ];
  if (identityPairs.some(([left, right]) => normalizeToken(left) && normalizeToken(left) === normalizeToken(right))) return true;
  const privilegedSelfPreview = ['HRD', 'SUPERADMIN'].includes(normalizeToken(session.role))
    && normalizeToken(participant.nama)
    && normalizeToken(participant.nama) === normalizeToken(session.nama);
  if (privilegedSelfPreview) return true;
  const participantHasStableIdentity = identityPairs.some(([left]) => normalizeToken(left));
  const sessionHasStableIdentity = identityPairs.some(([, right]) => normalizeToken(right));
  return !participantHasStableIdentity && !sessionHasStableIdentity && normalizeToken(participant.nama) === normalizeToken(session.nama);
}

function normalizedTargets(values, legacyValue) {
  const source = Array.isArray(values) ? values : [legacyValue];
  return source.map(normalizeToken).filter(value => value && value !== 'SEMUA');
}

export function campaignTargetsEmployee(campaign = {}, employee = {}) {
  const branches = normalizedTargets(campaign.target_branches, campaign.target_branch);
  const divisions = normalizedTargets(campaign.target_divisions, campaign.target_division);
  const positions = normalizedTargets(campaign.target_positions, campaign.target_position);
  const niks = normalizedTargets(campaign.target_niks, '');
  const employeeNikValue = normalizeToken(employeeNik(employee));
  const employeePosition = normalizeToken(employee.jabatan || employee.posisi);
  return (!branches.length || branches.includes(normalizeToken(employeeBranch(employee))))
    && (!divisions.length || divisions.includes(normalizeToken(employeeDivision(employee))))
    && (!positions.length || positions.includes(employeePosition))
    && (!niks.length || niks.includes(employeeNikValue));
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
    const current = groups.get(key) || { key, count: 0, gapTotal: 0, priorityTotal: 0, respondentKeys: new Set() };
    current.count += 1;
    const respondent = respondentKey(row);
    if (respondent) current.respondentKeys.add(respondent);
    current.gapTotal += competencyGap(row.expected_level, row.current_level);
    current.priorityTotal += needPriorityScore(row);
    groups.set(key, current);
  });
  return [...groups.values()].map(({ respondentKeys, ...item }) => ({
    ...item,
    respondents: respondentKeys.size,
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
    uniqueRespondents: uniqueRespondentCount(needs),
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
