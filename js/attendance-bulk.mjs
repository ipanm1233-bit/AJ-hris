export function attendanceSelectionKey(row) {
  return row?.is_status_only
    ? `STATUS:${String(row?.nik || row?.id || "")}:${String(row?.tanggal || "")}`
    : `DATA:${String(row?.id || "")}`;
}

export function selectedDeletableAttendanceRows(rows = [], selectedKeys = new Set()) {
  const keys = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
  return rows.filter(row =>
    row?.id &&
    !row?.is_status_only &&
    !row?._archive_source &&
    keys.has(attendanceSelectionKey(row))
  );
}
