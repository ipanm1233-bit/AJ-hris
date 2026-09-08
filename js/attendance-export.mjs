import { resolveWorkSchedule } from "./work-schedule.mjs";

function key(value) {
  return String(value || "").trim().toUpperCase();
}

function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (!Number.isNaN(cursor.getTime()) && cursor <= last) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function approvedLeave(leave) {
  const status = key(leave?.status_final || leave?.status);
  if (!status) return true;
  if (status.includes("REJECT") || status.includes("DITOLAK") || status.includes("MENUNGGU") || status.includes("PENDING")) return false;
  return status.includes("APPROVED") || status.includes("DISETUJUI") || status.includes("SELESAI");
}

function employeeMatchesLeave(employee, leave) {
  const employeeNik = key(employee?.nik || employee?.nik_karyawan || employee?.id);
  const leaveNik = key(leave?.nik || leave?.nik_karyawan);
  if (employeeNik && leaveNik && employeeNik === leaveNik) return true;
  return key(employee?.nama_karyawan || employee?.nama) === key(leave?.nama_karyawan || leave?.nama);
}

function leaveForDate(employee, leaves, date) {
  return leaves.find(leave => {
    if (!approvedLeave(leave) || !employeeMatchesLeave(employee, leave)) return false;
    const start = String(leave.tanggal || leave.tanggal_mulai || leave.tgl_mulai || "").slice(0, 10);
    const end = String(leave.tanggal_selesai || leave.tgl_selesai || start).slice(0, 10);
    return start && date >= start && date <= end;
  });
}

function activeEmployee(employee) {
  const status = key(employee?.aktif_tdk_aktif || employee?.status_karyawan || "AKTIF");
  return !status.includes("TIDAK AKTIF") && !status.includes("NONAKTIF") && !status.includes("RESIGN");
}

function attendanceEmployeeKey(row) {
  return key(row?.nik || row?.nik_karyawan) || `NAMA:${key(row?.nama || row?.nama_karyawan)}`;
}

function employeeKey(employee) {
  return key(employee?.nik || employee?.nik_karyawan || employee?.id) || `NAMA:${key(employee?.nama_karyawan || employee?.nama)}`;
}

function leaveLabel(leave) {
  return String(leave?.type_cuti || leave?.jenis_cuti || leave?.kategori_cuti || "CUTI / IZIN").trim();
}

function timeValue(value) {
  const match = String(value || "").match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

function mergeAttendanceRows(rows) {
  const fingerprintRows = rows.filter(row => {
    const source = key(row?.sumber || row?.source);
    return source.includes("FINGERPRINT") || row?.fingerprint_user_id || row?.fingerprint_name || row?.nama_finger;
  });
  const candidates = fingerprintRows.length ? fingerprintRows : rows;
  const base = candidates.find(row => row.scan_masuk && (row.scan_keluar || row.scan_pulang)) || candidates[0] || {};
  const incoming = candidates.map(row => row.scan_masuk).filter(value => timeValue(value) !== null)
    .sort((a, b) => timeValue(a) - timeValue(b));
  const outgoing = candidates.map(row => row.scan_keluar || row.scan_pulang).filter(value => timeValue(value) !== null)
    .sort((a, b) => timeValue(b) - timeValue(a));
  return {
    ...base,
    scan_masuk: incoming[0] || base.scan_masuk || "",
    scan_keluar: outgoing[0] || base.scan_keluar || base.scan_pulang || ""
  };
}

function exportObject(row, employee, shift, description) {
  return {
    "Emp No.": row?.emp_no || row?.fingerprint_emp_no || employee?.finger_emp_no || employee?.emp_no || "",
    "No. ID": row?.no_id || row?.fingerprint_no_id || row?.fingerprint_user_id || employee?.finger_id || employee?.no_finger || employee?.id_finger || employee?.pin || "",
    "NIK": row?.nik || row?.nik_karyawan || employee?.nik || employee?.nik_karyawan || "",
    "Nama Finger": row?.nama_finger || row?.fingerprint_name || employee?.finger_name || "",
    "Nama Karyawan": row?.nama || row?.nama_karyawan || employee?.nama_karyawan || employee?.nama || "",
    "Auto-Assign": row ? (row.auto_assign_label || (row.auto_assign === false ? "Tidak" : "Ya")) : "Tidak",
    "Tanggal": row?.tanggal || "",
    "Jam Kerja": row?.jam_kerja || shift.jamKerja || "",
    "Jam Masuk": row?.jadwal_masuk || shift.masuk || "",
    "Jam Pulang": row?.jadwal_keluar || shift.pulang || "",
    "Scan Masuk": row?.scan_masuk || "",
    "Scan Pulang": row?.scan_keluar || row?.scan_pulang || "",
    "Keterangan": description
  };
}

export function buildRawAttendanceExport({ attendanceRows = [], employees = [], leaves = [], schedules = [], start, end, branch = "", division = "" }) {
  const selectedEmployees = employees.filter(employee => {
    if (!activeEmployee(employee)) return false;
    if (branch && key(employee.cabang) !== key(branch)) return false;
    if (division && key(employee.divisi || employee.departemen) !== key(division)) return false;
    return true;
  });
  const employeeMap = new Map(selectedEmployees.map(employee => [employeeKey(employee), employee]));
  const nameMap = new Map(selectedEmployees.map(employee => [`NAMA:${key(employee.nama_karyawan || employee.nama)}`, employee]));
  const actualByDay = new Map();

  attendanceRows.forEach(row => {
    const rowKey = `${attendanceEmployeeKey(row)}|${row.tanggal}`;
    if (!actualByDay.has(rowKey)) actualByDay.set(rowKey, []);
    actualByDay.get(rowKey).push(row);
  });

  const result = [];
  const consumed = new Set();
  for (const date of dateRange(start, end)) {
    for (const employee of selectedEmployees) {
      const eKey = employeeKey(employee);
      const rows = actualByDay.get(`${eKey}|${date}`) || actualByDay.get(`NAMA:${key(employee.nama_karyawan || employee.nama)}|${date}`) || [];
      const leave = leaveForDate(employee, leaves, date);
      const shift = resolveWorkSchedule(employee, schedules, date);

      if (rows.length) {
        rows.forEach(row => consumed.add(row));
        const row = mergeAttendanceRows(rows);
        const hasIn = Boolean(row.scan_masuk);
        const hasOut = Boolean(row.scan_keluar || row.scan_pulang);
        let description = hasIn && hasOut ? "HADIR" : "SCAN BELUM LENGKAP - PERLU PEMERIKSAAN MANUAL";
        if (leave) description = `${leaveLabel(leave)}${hasIn || hasOut ? " - ADA SCAN, PERLU PEMERIKSAAN MANUAL" : ""}`;
        result.push(exportObject(row, employee, shift, description));
      } else {
        const description = leave
          ? leaveLabel(leave)
          : shift.masuk || shift.pulang
            ? "TIDAK ADA SCAN - PERLU PEMERIKSAAN MANUAL"
            : "TIDAK ADA JADWAL / LIBUR - PERLU PEMERIKSAAN MANUAL";
        result.push(exportObject({ tanggal: date }, employee, shift, description));
      }
    }
  }

  // Pertahankan data scan yang tidak lagi memiliki pasangan di master karyawan.
  attendanceRows.filter(row => !consumed.has(row)).forEach(row => {
    const employee = employeeMap.get(attendanceEmployeeKey(row)) || nameMap.get(`NAMA:${key(row.nama)}`) || row;
    const shift = resolveWorkSchedule(employee, schedules, row.tanggal);
    const leave = leaveForDate(employee, leaves, row.tanggal);
    const description = leave ? leaveLabel(leave) : row.scan_masuk && row.scan_keluar ? "HADIR" : "PERLU PEMERIKSAAN MANUAL";
    result.push(exportObject(row, employee, shift, description));
  });

  return result.sort((a, b) => a.Tanggal.localeCompare(b.Tanggal) || a["Nama Karyawan"].localeCompare(b["Nama Karyawan"], "id"));
}
