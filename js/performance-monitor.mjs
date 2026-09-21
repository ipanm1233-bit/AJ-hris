function clean(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeEmploymentStatus(value) {
  const status = clean(value);
  if (/PKWTT|TETAP|KARTAP/.test(status)) return "TETAP";
  if (/PROBATION|PERCOBAAN/.test(status)) return "PROBATION";
  if (/MAGANG|INTERN|PKL/.test(status)) return "MAGANG";
  if (/PKWT|KONTRAK/.test(status)) return "KONTRAK";
  return "LAINNYA";
}

export function isApprovedRecord(record = {}) {
  const status = clean(record.status_final || record.status || record.approval_status);
  return !status || status.includes("APPROVED") || status.includes("DISETUJUI") || status.includes("SETUJU");
}

export function isAlphaRecord(record = {}) {
  const detail = record.detail || {};
  const text = clean([
    record.type_cuti, record.jenis_cuti, record.kategori_cuti, record.keterangan_cuti,
    detail.jenis_cuti, detail.kategori_cuti
  ].join(" "));
  return record.is_alfa === true || record.discipline_impact === true || /(^|\s)A\s*-|ALFA|MANGKIR/.test(text);
}

export function disciplineScore({ alphaDays = 0, lateIncidents = 0 } = {}) {
  return Math.max(0, Math.min(100, 100 - Number(alphaDays || 0) * 10 - Number(lateIncidents || 0) * 2));
}

function employeeIdentity(employee = {}) {
  return {
    nik: clean(employee.nik_karyawan || employee.nik),
    name: clean(employee.nama_karyawan || employee.nama)
  };
}

function belongsTo(record = {}, employee = {}) {
  const emp = employeeIdentity(employee);
  const nik = clean(record.nik_dinilai || record.nik_karyawan || record.nik || record.nik_pemohon);
  const name = clean(record.nama_dinilai || record.nama_karyawan || record.nama || record.nama_pemohon);
  if (emp.nik && nik) return emp.nik === nik;
  return Boolean(emp.name && name && emp.name === name);
}

function recordDate(record = {}) {
  return String(record.tanggal || record.tanggal_mulai || record.tgl_mulai || record.created_at || record.createdAt || record.tgl || "").slice(0, 10);
}

function inMonth(record, month) {
  return !month || recordDate(record).startsWith(month);
}

function numericScore(record = {}) {
  for (const key of ["total_skor", "skor_akhir", "nilai_akhir", "score"]) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== "") {
      const value = Number(record[key]);
      if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
    }
  }
  return null;
}

export function buildPerformanceMonitorRows({ employees = [], kpiLogs = [], dailyLogs = [], leaveRecords = [], attendanceRecords = [], period = "" } = {}) {
  return employees.map(employee => {
    const employeeKpi = kpiLogs.filter(row => belongsTo(row, employee) && inMonth(row, period)).map(numericScore).filter(Number.isFinite);
    const employeeDaily = dailyLogs.filter(row => belongsTo(row, employee) && inMonth(row, period));
    const dailyScores = employeeDaily.map(numericScore).filter(Number.isFinite);
    const alphaRows = leaveRecords.filter(row => belongsTo(row, employee) && inMonth(row, period) && isApprovedRecord(row) && isAlphaRecord(row));
    const alphaDays = alphaRows.reduce((sum, row) => sum + Number(row.alpha_days || row.jumlah_hari || row.detail?.jumlah_hari || 1), 0);
    const attendanceRows = attendanceRecords.filter(row => belongsTo(row, employee) && inMonth(row, period));
    const lateIncidents = attendanceRows.filter(row => Number(row.terlambat_menit || row.late_minutes || row.menit_terlambat || 0) > 0).length
      + employeeDaily.filter(row => Number(row.terlambat_menit || row.late_minutes || 0) > 0).length;
    const discipline = disciplineScore({ alphaDays, lateIncidents });
    const performance = employeeKpi.length ? employeeKpi.reduce((sum, value) => sum + value, 0) / employeeKpi.length
      : dailyScores.length ? dailyScores.reduce((sum, value) => sum + value, 0) / dailyScores.length : null;
    const supportValues = employeeDaily.flatMap(row => {
      const scores = row.indikator_skor || {};
      return [scores.sop_tugas, scores.respon_divisi, scores.inisiatif_team].map(Number).filter(Number.isFinite);
    });
    const support = supportValues.length ? supportValues.reduce((sum, value) => sum + value, 0) / supportValues.length : null;
    const weightedParts = [{ value: performance, weight: 50 }, { value: discipline, weight: 30 }, { value: support, weight: 20 }].filter(part => Number.isFinite(part.value));
    const overall = weightedParts.length ? weightedParts.reduce((sum, part) => sum + part.value * part.weight, 0) / weightedParts.reduce((sum, part) => sum + part.weight, 0) : 0;
    return {
      nik: employee.nik_karyawan || employee.nik || "",
      nama: employee.nama_karyawan || employee.nama || "",
      cabang: employee.cabang || "",
      divisi: employee.divisi || employee.departemen || "",
      jabatan: employee.jabatan || employee.posisi || "",
      status: normalizeEmploymentStatus(employee.status_karyawan || employee.status_kepegawaian || employee.status),
      disciplineScore: Math.round(discipline * 10) / 10,
      alphaDays: Math.round(alphaDays * 10) / 10,
      lateIncidents,
      performanceScore: performance === null ? null : Math.round(performance * 10) / 10,
      supportScore: support === null ? null : Math.round(support * 10) / 10,
      overallScore: Math.round(overall * 10) / 10,
      evidenceCount: employeeKpi.length + employeeDaily.length + alphaRows.length + attendanceRows.length
    };
  });
}
