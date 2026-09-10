import { resolveWorkSchedule } from "./work-schedule.mjs";

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

function statusForRow(row, absenceLabel) {
  const hasIn = Boolean(row.scan_masuk);
  const hasOut = Boolean(row.scan_keluar || row.scan_pulang);
  if (absenceLabel) {
    return {
      attendance_status: hasIn || hasOut ? `${absenceLabel} — ADA SCAN, PERLU KOREKSI HRD` : absenceLabel,
      status_kind: hasIn || hasOut ? "review" : "absence",
      perlu_koreksi: Boolean(hasIn || hasOut || row.perlu_koreksi),
      alasan_koreksi: hasIn || hasOut ? "Ada scan pada hari cuti/izin/dinas; perlu diperiksa HRD." : (row.alasan_koreksi || "")
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
      if (!absenceByEmployeeDate.has(mapKey)) absenceByEmployeeDate.set(mapKey, { employee, date, label: label(record) });
    });
  });

  const usedAbsences = new Set();
  const actual = attendanceRows.map(original => {
    const row = reclassifyLegacySingleScan(original);
    const employee = employeeIdentities(row).map(id => employeeByIdentity.get(id)).find(Boolean) || row;
    const employeeId = employeeIdentities(employee)[0];
    const absenceKey = `${employeeId}|${row.tanggal}`;
    const absence = absenceByEmployeeDate.get(absenceKey);
    if (absence) usedAbsences.add(absenceKey);
    return { ...row, ...statusForRow(row, absence?.label) };
  });

  absenceByEmployeeDate.forEach((absence, absenceKey) => {
    if (usedAbsences.has(absenceKey)) return;
    const { employee, date } = absence;
    const shift = resolveWorkSchedule(employee, schedules, date);
    actual.push({
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
      status_kind: "absence",
      perlu_koreksi: false,
      alasan_koreksi: "",
      is_status_only: true
    });
  });

  return actual;
}
