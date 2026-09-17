import { resolveWorkSchedule } from "./work-schedule.mjs";
import { applyHalfDayWorkWindow, isHalfDayLeave } from "./leave-attendance.mjs";
import { applyIzinWorkWindow, isPartialDayIzin, partialIzinStatus } from "./izin-attendance.mjs";
import { calculateAttendancePenalty, formatAttendancePenalty } from "./attendance-penalty.mjs";

function key(value) {
  return String(value || "").trim().toUpperCase();
}

function approved(record) {
  const status = key(record?.status_final || record?.status);
  if (!status) return Boolean(record?.type_cuti || record?.jenis_cuti || record?.kategori_cuti);
  if (/DITOLAK|REJECT|MENUNGGU|PENDING/.test(status)) return false;
  return /APPROVED|DISETUJUI|SELESAI/.test(status);
}

function isAbsenceRecord(record) {
  const identity = key([
    record?.form_id, record?.tipe_form, record?.kategori, record?.nama_form,
    record?.type_cuti, record?.jenis_cuti, record?.jenis_izin,
    record?.detail?.jenis_cuti, record?.detail?.jenis_izin
  ].filter(Boolean).join(" "));
  return /CUTI|IZIN|SAKIT|DINAS|TUGAS LUAR/.test(identity);
}

function identity(record) {
  const nik = key(record?.nik || record?.nik_karyawan || record?.nik_pemohon || record?.detail?.nik);
  if (nik) return `NIK:${nik}`;
  const name = key(record?.nama_karyawan || record?.nama || record?.nama_pemohon || record?.pemohon || record?.detail?.nama_karyawan);
  return name ? `NAMA:${name}` : "";
}

function employeeIdentities(employee) {
  const result = [];
  [employee?.id, employee?.nik, employee?.nik_karyawan].map(key).filter(Boolean)
    .forEach(value => result.push(`NIK:${value}`));
  [employee?.nama_karyawan, employee?.nama].map(key).filter(Boolean)
    .forEach(value => result.push(`NAMA:${value}`));
  return result;
}

function dates(record) {
  const detail = record?.detail || {};
  const start = String(
    record?.tanggal_izin || record?.tanggal_mulai || record?.tgl_mulai || record?.tanggal_berangkat ||
    record?.tanggal_keberangkatan || record?.tanggal || detail?.tanggal_izin || detail?.tanggal_mulai ||
    detail?.tanggal_berangkat || detail?.tanggal_keberangkatan || record?.tgl || ""
  ).slice(0, 10);
  const end = String(
    record?.tanggal_selesai || record?.tanggal_akhir || record?.tgl_selesai || record?.tanggal_kembali ||
    record?.tanggal_pulang || detail?.tanggal_selesai || detail?.tanggal_akhir || detail?.tanggal_kembali ||
    detail?.tanggal_pulang || start
  ).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
  const result = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && result.length < 366) {
    result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function label(record) {
  const detail = record?.detail || {};
  return String(
    record?.type_cuti || record?.jenis_cuti || detail?.jenis_cuti ||
    detail?.jenis_izin || record?.jenis_izin || record?.nama_form || record?.kategori || "CUTI / IZIN"
  ).trim();
}

function minutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function fingerOwnerConflict(row, employee) {
  const machine = key(row?.fingerprint_name || row?.nama_finger);
  if (!machine || !employee || !/FINGERPRINT|IMPORT_EXCEL/.test(key(row.sumber))) return false;
  const aliases = [employee.finger_name, employee.nama_karyawan, employee.nama].map(key).filter(Boolean);
  return aliases.length > 0 && !aliases.some(alias => machine === alias ||
    (machine.length >= 3 && (alias.startsWith(`${machine} `) || machine.startsWith(`${alias} `))));
}

function statusForRow(row, absence) {
  const izinStatus = partialIzinStatus(row, absence);
  if (izinStatus) return izinStatus;
  const hasIn = Boolean(row.scan_masuk);
  const hasOut = Boolean(row.scan_keluar || row.scan_pulang);
  if (absence?.record && isHalfDayLeave(absence.record)) {
    const base = `${absence.label} — ${row.half_day_status || "CUTI SETENGAH HARI"}`;
    return {
      attendance_status: hasIn && hasOut ? base : `${base}; SCAN BELUM LENGKAP — PERLU KOREKSI HRD`,
      status_kind: hasIn && hasOut ? "half-day" : "review",
      perlu_koreksi: !(hasIn && hasOut),
      alasan_koreksi: hasIn && hasOut ? "" : "Cuti setengah hari terdata, tetapi scan masuk atau scan pulang belum lengkap."
    };
  }
  if (absence?.label) {
    return {
      attendance_status: hasIn || hasOut ? `${absence.label} — ADA SCAN, PERLU KOREKSI HRD` : absence.label,
      status_kind: hasIn || hasOut ? "review" : "absence",
      perlu_koreksi: Boolean(hasIn || hasOut || row.perlu_koreksi),
      alasan_koreksi: hasIn || hasOut ? (row.alasan_koreksi || "Ada scan pada hari cuti/izin/dinas; perlu diperiksa HRD.") : (row.alasan_koreksi || "")
    };
  }
  if (row.perlu_koreksi || !hasIn || !hasOut) {
    return {
      attendance_status: row.alasan_koreksi || "SCAN BELUM LENGKAP — PERLU KOREKSI HRD",
      status_kind: "review",
      perlu_koreksi: true,
      alasan_koreksi: row.alasan_koreksi || "Scan masuk atau scan pulang belum lengkap."
    };
  }
  return { attendance_status: "HADIR", status_kind: "present", perlu_koreksi: false, alasan_koreksi: "" };
}

function reclassifyLegacySingleScan(row) {
  if (!row.scan_masuk || row.scan_keluar || row.scan_pulang) return row;
  const scan = minutes(row.scan_masuk);
  const start = minutes(row.jadwal_masuk);
  const end = minutes(row.jadwal_keluar);
  if (scan === null || start === null || end === null || end <= start || scan < start + ((end - start) / 2)) return row;
  return {
    ...row,
    scan_masuk: "",
    scan_keluar: row.scan_masuk,
    perlu_koreksi: true,
    klasifikasi_scan: "SINGLE_SCAN_OUT",
    alasan_koreksi: "Hanya ada satu scan sore; diperkirakan scan pulang. Scan masuk perlu dikoreksi HRD."
  };
}

export function buildAttendanceStatusRows({ attendanceRows = [], employees = [], absenceRecords = [], schedules = [] }) {
  const employeeByIdentity = new Map();
  employees.forEach(employee => employeeIdentities(employee).forEach(id => {
    if (!employeeByIdentity.has(id)) employeeByIdentity.set(id, employee);
  }));

  const absenceByEmployeeDate = new Map();
  absenceRecords.filter(record => approved(record) && isAbsenceRecord(record)).forEach(record => {
    const employee = employeeByIdentity.get(identity(record));
    if (!employee) return;
    const employeeId = employeeIdentities(employee)[0];
    dates(record).forEach(date => {
      const mapKey = `${employeeId}|${date}`;
      if (!absenceByEmployeeDate.has(mapKey)) absenceByEmployeeDate.set(mapKey, { employee, date, label: label(record), record });
    });
  });

  const usedAbsences = new Set();
  const actual = attendanceRows.map(original => {
    let row = reclassifyLegacySingleScan(original);
    const employee = employeeIdentities(row).map(id => employeeByIdentity.get(id)).find(Boolean) || row;
    if (fingerOwnerConflict(row, employee)) row = {
      ...row, perlu_koreksi: true,
      alasan_koreksi: "Nama finger berbeda dari identitas karyawan; bandingkan ID dan log mesin sebelum mengoreksi."
    };
    const employeeId = employeeIdentities(employee)[0];
    const absenceKey = `${employeeId}|${row.tanggal}`;
    const absence = absenceByEmployeeDate.get(absenceKey);
    if (absence) usedAbsences.add(absenceKey);
    if (absence?.record && isHalfDayLeave(absence.record)) row = applyHalfDayWorkWindow(row, absence.record);
    if (absence?.record && isPartialDayIzin(absence.record)) row = applyIzinWorkWindow(row, absence.record);
    const attendanceStatus = statusForRow(row, absence);
    const penalty = calculateAttendancePenalty(row, employee);
    const canApplyPenalty = !absence?.label || isHalfDayLeave(absence?.record) || isPartialDayIzin(absence?.record);
    const hasValidScans = Boolean(row.scan_masuk && (row.scan_keluar || row.scan_pulang) && !row.perlu_koreksi);
    if (canApplyPenalty && hasValidScans && penalty.late_minutes > 0) {
      attendanceStatus.attendance_status = `${attendanceStatus.attendance_status} — TERLAMBAT ${formatAttendancePenalty(penalty)}`;
      attendanceStatus.status_kind = penalty.half_day_leave ? "late-half-day" : "late";
    }
    return {
      ...row,
      ...attendanceStatus,
      ...penalty,
      ketidakhadiran: absence?.label || (penalty.half_day_leave ? "C1/2 - Terlambat >25 menit" : "")
    };
  });

  absenceByEmployeeDate.forEach((absence, absenceKey) => {
    if (usedAbsences.has(absenceKey)) return;
    const { employee, date } = absence;
    const shift = resolveWorkSchedule(employee, schedules, date);
    let statusOnlyRow = {
      id: `STATUS-${key(employee.nik || employee.nik_karyawan || employee.id).replace(/[^A-Z0-9_-]/g, "_")}-${date}`,
      nik: employee.nik || employee.nik_karyawan || employee.id || "",
      nama: employee.nama_karyawan || employee.nama || "",
      nama_finger: employee.finger_name || "",
      cabang: employee.cabang || "",
      divisi: employee.divisi || employee.departemen || "",
      jabatan: employee.jabatan || employee.posisi || "",
      emp_no: employee.finger_emp_no || employee.emp_no || "",
      no_id: employee.finger_id || employee.no_finger || employee.id_finger || employee.pin || "",
      auto_assign_label: "Tidak",
      tanggal: date,
      jam_kerja: shift.jamKerja,
      jadwal_masuk: shift.masuk,
      jadwal_keluar: shift.pulang,
      scan_masuk: "",
      scan_keluar: "",
      attendance_status: absence.label,
      ketidakhadiran: absence.label,
      status_kind: "absence",
      perlu_koreksi: false,
      alasan_koreksi: "",
      ...calculateAttendancePenalty({}, employee),
      is_status_only: true
    };
    if (isHalfDayLeave(absence.record)) {
      statusOnlyRow = applyHalfDayWorkWindow(statusOnlyRow, absence.record);
      statusOnlyRow.attendance_status = `${absence.label} — ${statusOnlyRow.half_day_status}; TIDAK ADA SCAN — PERLU KOREKSI HRD`;
      statusOnlyRow.status_kind = "review";
      statusOnlyRow.perlu_koreksi = true;
      statusOnlyRow.alasan_koreksi = "Cuti setengah hari terdata, tetapi tidak ada scan pada jam kerja parsial.";
    } else if (isPartialDayIzin(absence.record)) {
      statusOnlyRow = applyIzinWorkWindow(statusOnlyRow, absence.record);
      statusOnlyRow.attendance_status = `${absence.label} — TIDAK ADA SCAN`;
      statusOnlyRow.status_kind = "review";
      statusOnlyRow.perlu_koreksi = true;
      statusOnlyRow.alasan_koreksi = "Izin parsial telah disetujui, tetapi tidak ada scan kehadiran pada hari tersebut.";
    }
    actual.push(statusOnlyRow);
  });

  return actual;
}
