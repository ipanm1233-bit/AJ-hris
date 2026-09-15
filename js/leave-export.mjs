export function leaveInputTimestamp(record = {}) {
  return [record.createdAt, record.created_at, record.tanggal_pengajuan, record.tanggal_input]
    .find(value => value !== null && value !== undefined && value !== "") ?? null;
}

function parsedInputDate(record) {
  const raw = leaveInputTimestamp(record);
  if (!raw) return null;
  const value = typeof raw.toDate === "function" ? raw.toDate() : raw;
  const localDate = typeof value === "string" && value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const date = localDate
    ? new Date(`${localDate[3]}-${String(localDate[2]).padStart(2, "0")}-${String(localDate[1]).padStart(2, "0")}T00:00:00+07:00`)
    : value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function leaveInputDate(record = {}) {
  const date = parsedInputDate(record);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export function leaveInputDisplay(record = {}) {
  const date = parsedInputDate(record);
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(date) + " WIB";
}

export function matchesLeaveExportPeriod(record, { basis = "leave", start = "", end = "", leaveStart, leaveEnd } = {}) {
  if (basis === "input") {
    const day = leaveInputDate(record);
    if (!day) return false;
    return (!start || day >= start) && (!end || day <= end);
  }
  const first = leaveStart || "";
  const last = leaveEnd || first;
  if (!first) return false;
  return (!start || last >= start) && (!end || first <= end);
}
