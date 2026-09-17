function token(value) {
  return String(value || "").trim().toUpperCase();
}

function rowIdentity(row = {}) {
  return token(row.nik || row.nik_karyawan) || `NAMA:${token(row.nama || row.nama_karyawan)}`;
}

function preferredRow(current, candidate) {
  if (!current) return candidate;
  const score = row => (row.scan_masuk ? 2 : 0) + ((row.scan_keluar || row.scan_pulang) ? 2 : 0) + (!row.perlu_koreksi ? 1 : 0);
  return score(candidate) > score(current) ? candidate : current;
}

export function buildAttendanceAnalytics(rows = [], filters = {}) {
  const month = String(filters.month || "").slice(0, 7);
  const branch = token(filters.branch);
  const division = token(filters.division);
  const filtered = rows.filter(row => {
    if (month && !String(row.tanggal || "").startsWith(month)) return false;
    if (branch && token(row.cabang) !== branch) return false;
    if (division && token(row.divisi || row.departemen) !== division) return false;
    return Boolean(row.tanggal && rowIdentity(row));
  });

  const employeeDays = new Map();
  filtered.forEach(row => {
    const mapKey = `${rowIdentity(row)}|${row.tanggal}`;
    employeeDays.set(mapKey, preferredRow(employeeDays.get(mapKey), row));
  });
  const records = [...employeeDays.values()];
  const uniqueEmployees = new Set(records.map(rowIdentity));
  const present = row => Boolean(row.scan_masuk || row.scan_keluar || row.scan_pulang);
  const complete = row => Boolean(row.scan_masuk && (row.scan_keluar || row.scan_pulang));
  const absence = row => Boolean(row.ketidakhadiran) && !String(row.ketidakhadiran).startsWith("C1/2 - Terlambat");

  const totals = {
    employees: uniqueEmployees.size,
    employee_days: records.length,
    present_days: records.filter(present).length,
    complete_days: records.filter(complete).length,
    on_time_days: records.filter(row => complete(row) && Number(row.late_minutes || 0) === 0).length,
    late_days: records.filter(row => Number(row.late_minutes || 0) > 0).length,
    waived_days: records.filter(row => row.late_penalty_waived === true).length,
    half_day_penalty_days: records.filter(row => row.half_day_leave === true).length,
    absence_days: records.filter(absence).length,
    review_days: records.filter(row => row.perlu_koreksi === true).length,
    total_late_minutes: records.reduce((sum, row) => sum + Number(row.late_minutes || 0), 0),
    total_penalty: records.reduce((sum, row) => sum + Number(row.late_penalty || 0), 0),
    spreadsheet_rows: records.filter(row => row._archive_source === true).length
  };
  totals.completeness_rate = totals.employee_days ? Math.round((totals.complete_days / totals.employee_days) * 1000) / 10 : 0;

  const dailyMap = new Map();
  const divisionMap = new Map();
  const employeeMap = new Map();
  records.forEach(row => {
    const daily = dailyMap.get(row.tanggal) || { date: row.tanggal, complete: 0, late: 0, absence: 0, review: 0 };
    if (complete(row)) daily.complete++;
    if (Number(row.late_minutes || 0) > 0) daily.late++;
    if (absence(row)) daily.absence++;
    if (row.perlu_koreksi) daily.review++;
    dailyMap.set(row.tanggal, daily);

    const divisionName = String(row.divisi || row.departemen || "Belum diatur").trim() || "Belum diatur";
    const div = divisionMap.get(divisionName) || { division: divisionName, employee_days: 0, complete: 0, late: 0, absence: 0, review: 0, penalty: 0 };
    div.employee_days++;
    if (complete(row)) div.complete++;
    if (Number(row.late_minutes || 0) > 0) div.late++;
    if (absence(row)) div.absence++;
    if (row.perlu_koreksi) div.review++;
    div.penalty += Number(row.late_penalty || 0);
    divisionMap.set(divisionName, div);

    if (Number(row.late_minutes || 0) > 0) {
      const employeeKey = rowIdentity(row);
      const emp = employeeMap.get(employeeKey) || {
        nik: row.nik || row.nik_karyawan || "-", name: row.nama || row.nama_karyawan || "-",
        branch: row.cabang || "-", division: divisionName, occurrences: 0, minutes: 0, penalty: 0, half_days: 0, waived: 0
      };
      emp.occurrences++;
      emp.minutes += Number(row.late_minutes || 0);
      emp.penalty += Number(row.late_penalty || 0);
      if (row.half_day_leave) emp.half_days++;
      if (row.late_penalty_waived) emp.waived++;
      employeeMap.set(employeeKey, emp);
    }
  });

  const divisions = [...divisionMap.values()].map(item => ({
    ...item,
    completeness_rate: item.employee_days ? Math.round((item.complete / item.employee_days) * 1000) / 10 : 0
  })).sort((a, b) => b.employee_days - a.employee_days || a.division.localeCompare(b.division, "id"));

  return {
    totals,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    divisions,
    top_late: [...employeeMap.values()].sort((a, b) => b.minutes - a.minutes || b.occurrences - a.occurrences).slice(0, 10),
    records
  };
}
