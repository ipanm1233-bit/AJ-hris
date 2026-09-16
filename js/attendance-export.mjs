import { resolveWorkSchedule } from "./work-schedule.mjs";
import { applyHalfDayWorkWindow, isHalfDayLeave } from "./leave-attendance.mjs";

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

function absenceRecord(leave) {
  const marker = key([
    leave?.form_id, leave?.tipe_form, leave?.kategori, leave?.nama_form,
    leave?.type_cuti, leave?.jenis_cuti, leave?.jenis_izin,
    leave?.detail?.jenis_cuti, leave?.detail?.jenis_izin
  ].filter(Boolean).join(" "));
  return /CUTI|IZIN|SAKIT|DINAS|TUGAS LUAR|GANTI HARI KERJA/.test(marker);
}

function employeeMatchesLeave(employee, leave) {
  const employeeNik = key(employee?.nik || employee?.nik_karyawan || employee?.id);
  const leaveNik = key(leave?.nik || leave?.nik_karyawan || leave?.nik_pemohon || leave?.detail?.nik);
  if (employeeNik && leaveNik) return employeeNik === leaveNik;
  return key(employee?.nama_karyawan || employee?.nama) === key(leave?.nama_karyawan || leave?.nama || leave?.nama_pemohon || leave?.pemohon);
}

function leaveForDate(employee, leaves, date) {
  return leaves.find(leave => {
    if (!absenceRecord(leave) || !approvedLeave(leave) || !employeeMatchesLeave(employee, leave)) return false;
    const detail = leave?.detail || {};
    const start = String(leave.tanggal_izin || leave.tanggal_mulai || leave.tgl_mulai || leave.tanggal_berangkat || leave.tanggal_keberangkatan || leave.tanggal || detail.tanggal_izin || detail.tanggal_mulai || detail.tanggal_berangkat || detail.tanggal_keberangkatan || "").slice(0, 10);
    const end = String(leave.tanggal_selesai || leave.tanggal_akhir || leave.tgl_selesai || leave.tanggal_kembali || leave.tanggal_pulang || detail.tanggal_selesai || detail.tanggal_akhir || detail.tanggal_kembali || detail.tanggal_pulang || start).slice(0, 10);
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
  return String(leave?.type_cuti || leave?.jenis_cuti || leave?.detail?.jenis_cuti || leave?.detail?.jenis_izin || leave?.jenis_izin || leave?.kategori_cuti || leave?.nama_form || "CUTI / IZIN").trim();
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

function conflictingFingerOwner(row, employee) {
  if (!row || !employee || !/FINGERPRINT|IMPORT_EXCEL/i.test(String(row.sumber || ""))) return false;
  const machine = key(row.fingerprint_name || row.nama_finger);
  const aliases = [employee.finger_name, employee.nama_karyawan, employee.nama].map(key).filter(Boolean);
  if (!machine || !aliases.length) return false;
  return !aliases.some(alias => machine === alias || (machine.length >= 3 && (
    alias.startsWith(`${machine} `) || machine.startsWith(`${alias} `)
  )));
}

function exportObject(row, employee, shift, { absence = "", review = "", reason = "" } = {}) {
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
    "Keterangan Izin/Cuti": absence,
    "Perlu Koreksi HRD": review ? "Ya" : "Tidak",
    "Alasan Koreksi": reason
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
  const nameMap = new Map();
  selectedEmployees.forEach(employee => {
    const name = `NAMA:${key(employee.nama_karyawan || employee.nama)}`;
    if (!nameMap.has(name)) nameMap.set(name, employee);
    else if (nameMap.get(name) !== employee) nameMap.set(name, null);
  });
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
      const fallbackName = `NAMA:${key(employee.nama_karyawan || employee.nama)}`;
      const rows = actualByDay.get(`${eKey}|${date}`) ||
        (nameMap.get(fallbackName) === employee ? actualByDay.get(`${fallbackName}|${date}`) : null) || [];
      const leave = leaveForDate(employee, leaves, date);
      const shift = resolveWorkSchedule(employee, schedules, date);

      if (rows.length) {
        rows.forEach(row => consumed.add(row));
        const fingerIds = new Set(rows.map(row => key(row.fingerprint_user_id || row.fingerprint_no_id || row.no_id)).filter(Boolean));
        const identityConflict = fingerIds.size > 1 || rows.some(row =>
          conflictingFingerOwner(row, employee) ||
          (row.nama && row.nik && key(row.nama) !== key(employee.nama_karyawan || employee.nama))
        );
        if (identityConflict) {
          rows.forEach(row => result.push(exportObject(row, employee, shift, {
            absence: leave ? leaveLabel(leave) : "",
            review: "Ya",
            reason: "ID/nama finger tidak konsisten pada karyawan dan tanggal ini; jangan gabungkan scan sebelum HRD memeriksa mesin."
          })));
          continue;
        }
        let row = mergeAttendanceRows(rows);
        if (leave && isHalfDayLeave(leave)) row = applyHalfDayWorkWindow(row, leave);
        const hasIn = Boolean(row.scan_masuk);
        const hasOut = Boolean(row.scan_keluar || row.scan_pulang);
        const absence = leave ? `${leaveLabel(leave)}${isHalfDayLeave(leave) ? ` - ${row.half_day_status || "CUTI SETENGAH HARI"}` : ""}` : "";
        const suspectedImportedSchedule = key(row.sumber) === "IMPORT_EXCEL" && hasIn && key(row.scan_masuk) === key(row.jadwal_masuk) && !hasOut;
        const review = !hasIn || !hasOut || Boolean(leave && (hasIn || hasOut) && !isHalfDayLeave(leave)) || suspectedImportedSchedule || Boolean(row.perlu_koreksi);
        const reason = row.alasan_koreksi || (suspectedImportedSchedule
          ? "Scan dari impor Excel sama dengan jam jadwal dan tidak ada scan pulang; periksa log mesin agar tidak dianggap finger nyata."
          : leave && (hasIn || hasOut) && !isHalfDayLeave(leave) ? "Ada scan di hari cuti/izin/dinas; perlu verifikasi HRD."
          : !hasIn || !hasOut ? "Scan masuk atau pulang belum lengkap; perlu pemeriksaan manual." : "");
        result.push(exportObject(row, employee, shift, { absence, review: review ? "Ya" : "", reason }));
      } else {
        const reason = leave && !isHalfDayLeave(leave) ? "" : shift.masuk || shift.pulang
          ? "Tidak ada scan; perlu pemeriksaan manual." : "Tidak ada jadwal/libur; periksa bila seharusnya bekerja.";
        const emptyRow = leave && isHalfDayLeave(leave)
          ? applyHalfDayWorkWindow({ tanggal: date, jadwal_masuk: shift.masuk, jadwal_keluar: shift.pulang, jam_kerja: shift.jamKerja }, leave)
          : { tanggal: date };
        result.push(exportObject(emptyRow, employee, shift, { absence: leave ? leaveLabel(leave) : "", review: reason ? "Ya" : "", reason }));
      }
    }
  }

  // Pertahankan data scan yang tidak lagi memiliki pasangan di master karyawan.
  attendanceRows.filter(row => !consumed.has(row)).forEach(row => {
    const employee = employeeMap.get(attendanceEmployeeKey(row)) || nameMap.get(`NAMA:${key(row.nama)}`) || row;
    const shift = resolveWorkSchedule(employee, schedules, row.tanggal);
    const leave = leaveForDate(employee, leaves, row.tanggal);
    result.push(exportObject(row, employee, shift, {
      absence: leave ? leaveLabel(leave) : "",
      review: "Ya",
      reason: conflictingFingerOwner(row, employee) ? "Nama finger tidak cocok dengan identitas master; periksa HRD."
        : "Scan belum dapat dipasangkan dengan master karyawan; perlu pemeriksaan manual."
    }));
  });

  return result.sort((a, b) => a.Tanggal.localeCompare(b.Tanggal) || a["Nama Karyawan"].localeCompare(b["Nama Karyawan"], "id"));
}
