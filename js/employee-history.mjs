const normalized = value => String(value ?? "").trim().toLocaleUpperCase("id-ID");

export function belongsToEmployee(row, employee) {
  const employeeNik = normalized(employee.nik_karyawan || employee.nik);
  const rowNik = normalized(row.nik_dinilai || row.nik_karyawan || row.nik || row.nik_pemohon);
  if (employeeNik && rowNik) return employeeNik === rowNik;
  const employeeName = normalized(employee.nama_karyawan || employee.nama);
  const rowName = normalized(row.nama_dinilai || row.nama_karyawan || row.nama || row.nama_pemohon);
  if (!employeeName || !rowName || employeeName !== rowName) return false;
  const employeeBranch = normalized(employee.cabang);
  const rowBranch = normalized(row.cabang || row.cabang_dinilai);
  return !employeeBranch || !rowBranch || employeeBranch === rowBranch;
}

export function employeeHistoryRows(rows, employee) {
  return (rows || []).filter(row => belongsToEmployee(row, employee));
}
