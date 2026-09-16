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
  return {
    tanggal: attendanceImportField(row, ["Tanggal", "Date"]),
    nik: attendanceImportField(row, ["NIK", "NIK Karyawan"]),
    nama: attendanceImportField(row, ["Nama Karyawan", "Nama", "Name"]),
    fingerName: attendanceImportField(row, ["Nama Finger", "Fingerprint Name"]),
    fingerId: attendanceImportField(row, ["No. ID", "Fingerprint No ID", "ID Finger"]),
    cabang: attendanceImportField(row, ["Cabang", "Branch"]),
    jadwalMasuk: attendanceImportField(row, ["Jam Masuk", "Jadwal Masuk", "Jam Kerja Masuk"]),
    jadwalPulang: attendanceImportField(row, ["Jam Pulang", "Jadwal Pulang", "Jam Kerja Keluar"]),
    scanMasuk: attendanceImportField(row, ["Scan Masuk", "Scan Check In", "Check In"]),
    scanPulang: attendanceImportField(row, ["Scan Pulang", "Scan Keluar", "Scan Check Out", "Check Out"])
  };
}

export function attendanceImportScan(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}
