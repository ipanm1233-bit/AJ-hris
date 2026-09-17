function token(value) {
  return String(value || "").trim().toUpperCase();
}

function timeInSeconds(value) {
  const match = String(value || "").match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return (hours * 3600) + (minutes * 60) + seconds;
}

export function attendanceEmployeeGroup(employee = {}) {
  const identity = token([
    employee.role, employee.jabatan, employee.posisi,
    employee.divisi, employee.departemen
  ].filter(Boolean).join(" "));
  if (/SALES|SALESMAN/.test(identity)) return "SALES";
  if (/WAREHOUSE|GUDANG/.test(identity)) return "WAREHOUSE";
  return "BACK OFFICE";
}

export function attendanceDeductionSource(employee = {}) {
  const branch = token(employee.cabang || employee.branch);
  const group = attendanceEmployeeGroup(employee);

  if (group === "SALES" && branch.includes("CIREBON")) return "BBM mingguan";
  if (group === "SALES" && branch.includes("MALANG")) return "Insentif bulanan";
  if (group === "WAREHOUSE" && branch.includes("MALANG")) return "Uang bongkaran (3 bulanan)";
  if ((group === "WAREHOUSE" || group === "BACK OFFICE") && (branch.includes("CIREBON") || branch.includes("MALANG"))) {
    return "Lembur; jika tidak ada lembur, bayar cash ke kasir";
  }
  return "Perlu penetapan HRD";
}

export function calculateAttendancePenalty(row = {}, employee = row) {
  const scheduled = timeInSeconds(row.jadwal_masuk);
  const scanned = timeInSeconds(row.scan_masuk);
  const deductionSource = attendanceDeductionSource({
    ...employee,
    ...row,
    cabang: row.cabang || employee.cabang || employee.branch || "",
    role: row.role || employee.role || "",
    jabatan: row.jabatan || row.posisi || employee.jabatan || employee.posisi || "",
    divisi: row.divisi || row.departemen || employee.divisi || employee.departemen || ""
  });
  if (scheduled === null || scanned === null || scanned <= scheduled) {
    return {
      late_minutes: 0,
      late_penalty: 0,
      late_consequence: "Tepat waktu",
      deduction_source: deductionSource,
      half_day_leave: false
    };
  }

  const lateMinutes = Math.ceil((scanned - scheduled) / 60);
  const waived = row.late_penalty_waived === true;
  if (waived) {
    return {
      late_minutes: lateMinutes,
      late_penalty: 0,
      late_consequence: "Dibebaskan HRD",
      deduction_source: "Tidak ada — dibebaskan HRD",
      half_day_leave: false,
      late_penalty_waived: true,
      late_penalty_note: String(row.late_penalty_note || "").trim()
    };
  }
  if (lateMinutes > 25) {
    return {
      late_minutes: lateMinutes,
      late_penalty: 0,
      late_consequence: "Cuti 1/2 hari",
      deduction_source: "Jatah cuti tahunan 0,5 hari",
      half_day_leave: true
    };
  }

  return {
    late_minutes: lateMinutes,
    late_penalty: lateMinutes <= 5 ? 5000 : 5000 + ((lateMinutes - 5) * 1000),
    late_consequence: "Denda keterlambatan",
    deduction_source: deductionSource,
    half_day_leave: false
  };
}

export function formatAttendancePenalty(penalty = {}) {
  if (!penalty.late_minutes) return "Tepat waktu";
  if (penalty.late_penalty_waived) return `${penalty.late_minutes} menit — Dibebaskan HRD`;
  if (penalty.half_day_leave) return `${penalty.late_minutes} menit — Cuti 1/2 hari`;
  return `${penalty.late_minutes} menit — Rp ${Number(penalty.late_penalty || 0).toLocaleString("id-ID")}`;
}
