function normalizedHeader(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function attendanceImportField(row, headers) {
  const entries = Object.entries(row || {}).map(([name, value]) => [normalizedHeader(name), value]);
  for (const header of headers) {
    const found = entries.find(([name]) => name === normalizedHeader(header));
    if (found && found[1] !== null && found[1] !== undefined && String(found[1]).trim() !== "") return found[1];
  }
  return null;
}

export function attendanceImportValues(row) {
  const jadwalMasuk = attendanceImportField(row, ["Jadwal Masuk", "Jam Kerja Masuk"]);
  const jadwalPulang = attendanceImportField(row, ["Jadwal Pulang", "Jam Kerja Keluar"]);
  const jamMasuk = attendanceImportField(row, ["Jam Masuk"]);
  const jamKeluar = attendanceImportField(row, ["Jam Keluar", "Jam Pulang"]);
  const scanMasuk = attendanceImportField(row, ["Scan Masuk", "Scan Check In", "Check In"]);
  const scanPulang = attendanceImportField(row, ["Scan Pulang", "Scan Keluar", "Scan Check Out", "Check Out"]);

  return {
    tanggal: attendanceImportField(row, ["Tanggal", "Date"]),
    nik: attendanceImportField(row, ["NIK", "NIK Karyawan"]),
    nama: attendanceImportField(row, ["Nama Karyawan", "Nama", "Name"]),
    fingerName: attendanceImportField(row, ["Nama Finger", "Fingerprint Name"]),
    fingerId: attendanceImportField(row, ["No. ID", "Fingerprint No ID", "ID Finger"]),
    empNo: attendanceImportField(row, ["Emp No.", "Emp No", "Fingerprint Emp No"]),
    cabang: attendanceImportField(row, ["Cabang", "Branch"]),
    // Format lama memakai Jam Masuk/Pulang sebagai jadwal dan Scan Masuk/Pulang
    // sebagai scan. Format rekap Malang memakai Jam Kerja sebagai jadwal dan
    // Jam Masuk/Keluar sebagai scan aktual. Prioritas ini mendukung keduanya.
    jadwalMasuk: jadwalMasuk || jamMasuk,
    jadwalPulang: jadwalPulang || jamKeluar,
    scanMasuk: scanMasuk || (jadwalMasuk ? jamMasuk : null),
    scanPulang: scanPulang || (jadwalPulang ? jamKeluar : null)
  };
}

function identityKey(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, ' ');
}

function matchingFingerName(employee, fingerName) {
  const name = identityKey(fingerName);
  if (!name) return true;
  return [employee.finger_name, employee.nama_karyawan, employee.nama]
    .map(identityKey).filter(Boolean).some(alias => alias === name ||
      (name.length >= 3 && (alias.startsWith(`${name} `) || name.startsWith(`${alias} `))));
}

export function resolveAttendanceImportIdentity(values, employees = []) {
  const branch = identityKey(values.cabang);
  const nik = identityKey(values.nik);
  const fingerId = identityKey(values.fingerId);
  const fingerName = identityKey(values.fingerName);
  const rawName = identityKey(values.nama).replace(/\s*\(BELUM DIPETAKAN\)$/, '');
  const candidates = employees.filter(employee => !branch || identityKey(employee.cabang) === branch);
  const unique = matches => matches.length === 1 ? matches[0] : null;
  const byNik = nik && !nik.startsWith('FINGER-') ? candidates.filter(e => identityKey(e.nik || e.nik_karyawan) === nik) : [];
  const byId = fingerId ? candidates.filter(e =>
    [e.finger_id, e.kode_finger, e.no_finger, e.id_finger, e.pin, e.fingerprint_user_id, e.fingerprint_no_id]
      .some(id => identityKey(id) === fingerId)) : [];
  const byName = rawName ? candidates.filter(e => identityKey(e.nama_karyawan || e.nama) === rawName) : [];
  const byFingerName = fingerName ? candidates.filter(e => matchingFingerName(e, fingerName)) : [];
  const employee = unique(byNik) || unique(byId) || unique(byName) || unique(byFingerName);
  const conflict = Boolean(employee && (
    (nik && !nik.startsWith('FINGER-') && identityKey(employee.nik || employee.nik_karyawan) !== nik) ||
    (byNik.length && !byNik.includes(employee)) ||
    (byId.length && !byId.includes(employee)) ||
    (byName.length && !byName.includes(employee)) ||
    (fingerName && !matchingFingerName(employee, fingerName))
  ));
  return { employee: conflict ? null : employee, conflict, provisional: nik.startsWith('FINGER-') };
}

export function attendanceImportDate(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.substring(0, 10);

  let match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;

  // Format tampilan Excel seperti 1-Aug-26 pada file fingerprint Malang.
  match = value.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2}|\d{4})$/);
  if (match) {
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const monthIndex = monthNames.indexOf(match[2].toUpperCase());
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const day = Number(match[1]);
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, monthIndex, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex && date.getUTCDate() === day) {
        return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    return null;
  }

  if (/^\d{4,6}$/.test(value)) {
    const serial = Number(value);
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() > 1990 && date.getUTCFullYear() < 2100) {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function attendanceImportScan(value) {
  const raw = String(value || '').trim();
  // Terima waktu murni maupun waktu dengan catatan sumber, misalnya
  // "09:23:16 C 1/2", "16:29 ONLINE", atau "ONLINE 16:14".
  const match = raw.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s+.*)?$/)
    || raw.match(/^.*?\s(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}
