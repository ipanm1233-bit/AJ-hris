import { resolveWorkSchedule } from "./work-schedule.mjs";

function key(value) {
  return String(value || "").trim().toUpperCase();
}

function timeMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function activeEmployee(employee, date) {
  const status = key(employee?.aktif_tdk_aktif || employee?.status_aktif || employee?.status_karyawan || "AKTIF");
  if (/TIDAK AKTIF|NONAKTIF|NON AKTIF|RESIGN|KELUAR/.test(status)) return false;
  const joinedAt = String(employee?.tanggal_masuk || employee?.tgl_masuk || employee?.tanggal_join || employee?.join_date || "").slice(0, 10);
  const endedAt = String(employee?.tanggal_keluar || employee?.tgl_keluar || employee?.tanggal_resign || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(joinedAt) && joinedAt > date) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(endedAt) && endedAt < date) return false;
  return true;
}

function employeeRows(employee, attendanceRows, date) {
  const nikKeys = [employee?.nik, employee?.nik_karyawan, employee?.id].map(key).filter(Boolean);
  const nameKey = key(employee?.nama_karyawan || employee?.nama);
  return attendanceRows.filter(row => {
    if (String(row?.tanggal || "").slice(0, 10) !== date) return false;
    const rowNik = key(row?.nik || row?.nik_karyawan);
    if (rowNik && nikKeys.includes(rowNik)) return true;
    return !rowNik && nameKey && key(row?.nama || row?.nama_karyawan) === nameKey;
  });
}

export function buildMissingAttendanceToday({
  employees = [],
  attendanceRows = [],
  schedules = [],
  date = "",
  currentTime = "23:59",
  branch = "",
  division = ""
} = {}) {
  const nowMinutes = timeMinutes(currentTime);
  return employees
    .filter(employee => activeEmployee(employee, date))
    .filter(employee => !branch || key(employee?.cabang) === key(branch))
    .filter(employee => !division || key(employee?.divisi || employee?.departemen) === key(division))
    .map(employee => {
      const shift = resolveWorkSchedule(employee, schedules, date);
      const scheduledStart = timeMinutes(shift.masuk);
      if (scheduledStart === null || (nowMinutes !== null && scheduledStart > nowMinutes)) return null;

      const rows = employeeRows(employee, attendanceRows, date);
      const hasAnyScan = rows.some(row => Boolean(row?.scan_masuk || row?.scan_keluar || row?.scan_pulang));
      const fullDayAbsence = rows.some(row => row?.status_kind === "absence" && row?.ketidakhadiran);
      if (hasAnyScan || fullDayAbsence) return null;

      const reviewRow = rows.find(row => row?.perlu_koreksi || row?.status_kind === "review");
      return {
        nik: employee?.nik || employee?.nik_karyawan || employee?.id || "",
        name: employee?.nama_karyawan || employee?.nama || "-",
        branch: employee?.cabang || "-",
        division: employee?.divisi || employee?.departemen || "-",
        position: employee?.jabatan || employee?.posisi || "-",
        scheduled_start: shift.masuk || "-",
        status: reviewRow?.attendance_status || "Belum ada scan masuk",
        needs_review: Boolean(reviewRow)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.branch.localeCompare(b.branch, "id", { sensitivity: "base" }) || a.name.localeCompare(b.name, "id", { sensitivity: "base" }));
}
