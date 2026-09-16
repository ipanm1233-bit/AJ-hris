const CENTRAL_LEAVE_ROLES = new Set(['HRD', 'SUPERADMIN', 'DIREKTUR', 'GM']);

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase();
}

export function resolveLeaveBranchScope({ role, branch, canViewAll }) {
  const normalizedRole = normalizeToken(role);
  const normalizedBranch = String(branch || '').trim();
  if (!canViewAll || !normalizedBranch || normalizedBranch === '-' || CENTRAL_LEAVE_ROLES.has(normalizedRole)) return '';
  return normalizedBranch;
}

export function filterEmployeesForLeaveBranch(employees, branch) {
  const target = normalizeToken(branch);
  if (!target) return [...(employees || [])];
  return (employees || []).filter(employee => normalizeToken(employee.cabang) === target);
}

export function filterLeaveRowsForEmployees(rows, employees) {
  const allowedNiks = new Set();
  const allowedNames = new Set();
  (employees || []).forEach(employee => {
    const nik = normalizeToken(employee.nik || employee.nik_karyawan);
    const name = normalizeToken(employee.nama_karyawan || employee.nama);
    if (nik) allowedNiks.add(nik);
    if (name) allowedNames.add(name);
  });
  return (rows || []).filter(row => {
    const nik = normalizeToken(row.nik || row.nik_karyawan);
    const name = normalizeToken(row.nama_karyawan || row.nama);
    return Boolean((nik && allowedNiks.has(nik)) || (name && allowedNames.has(name)));
  });
}

export function filterLeaveRowsForBranch(rows, employees, branch) {
  const target = normalizeToken(branch);
  if (!target) return [...(rows || [])];

  const allowedRows = new Set(filterLeaveRowsForEmployees(rows, employees));

  return (rows || []).filter(row => {
    const rowBranch = normalizeToken(row.cabang);
    if (rowBranch) return rowBranch === target;
    return allowedRows.has(row);
  });
}
