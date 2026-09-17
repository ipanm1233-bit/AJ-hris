function key(value) {
  return String(value || "").trim().toUpperCase();
}

export function izinType(record) {
  return key(record?.jenis_izin || record?.detail?.jenis_izin);
}

export function isPartialDayIzin(record) {
  const type = izinType(record);
  return ["IZIN_TERLAMBAT", "IZIN_PULANG_CEPAT", "IZIN_KELUAR_KANTOR"].includes(type) ||
    /IZIN DATANG TERLAMBAT|IZIN PULANG CEPAT|IZIN KELUAR KANTOR/.test(type);
}

function times(record) {
  const explicit = [
    record?.jam_tiba, record?.jam_pulang, record?.jam_keluar, record?.jam_kembali,
    record?.detail?.jam_tiba, record?.detail?.jam_pulang, record?.detail?.jam_keluar, record?.detail?.jam_kembali
  ].filter(Boolean).map(String);
  const text = `${explicit.join(" ")} ${record?.jam_izin || record?.detail?.jam_izin || ""}`;
  return [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(match => `${match[1].padStart(2, "0")}:${match[2]}`);
}

export function applyIzinWorkWindow(row, record) {
  if (!isPartialDayIzin(record)) return row;
  const type = izinType(record);
  const found = times(record);
  if (type.includes("TERLAMBAT") && found[0]) {
    return { ...row, jadwal_masuk: found[0], izin_work_window: "LATE_ARRIVAL" };
  }
  if (type.includes("PULANG_CEPAT") && found[0]) {
    return { ...row, jadwal_keluar: found[0], izin_work_window: "EARLY_DEPARTURE" };
  }
  return { ...row, izin_work_window: "OFFICE_EXIT" };
}

export function partialIzinStatus(row, absence) {
  if (!absence?.record || !isPartialDayIzin(absence.record)) return null;
  const hasIn = Boolean(row.scan_masuk);
  const hasOut = Boolean(row.scan_keluar || row.scan_pulang);
  if (hasIn && hasOut) {
    return {
      attendance_status: `${absence.label} — HADIR DENGAN IZIN`,
      status_kind: "permission",
      perlu_koreksi: Boolean(row.perlu_koreksi),
      alasan_koreksi: row.alasan_koreksi || ""
    };
  }
  return {
    attendance_status: `${absence.label} — SCAN BELUM LENGKAP`,
    status_kind: "review",
    perlu_koreksi: true,
    alasan_koreksi: row.alasan_koreksi || "Izin parsial telah disetujui, tetapi scan masuk atau scan pulang belum lengkap."
  };
}
