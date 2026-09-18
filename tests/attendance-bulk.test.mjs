import test from "node:test";
import assert from "node:assert/strict";
import { attendanceSelectionKey, selectedDeletableAttendanceRows } from "../js/attendance-bulk.mjs";

test("bulk attendance deletion keeps only selected persisted Firebase rows", () => {
  const rows = [
    { id: "ABS-1", nik: "1", tanggal: "2026-09-18" },
    { id: "STATUS-2", nik: "2", tanggal: "2026-09-18", is_status_only: true },
    { id: "ARCHIVE-3", nik: "3", tanggal: "2026-09-18", _archive_source: true },
    { id: "ABS-4", nik: "4", tanggal: "2026-09-18" }
  ];
  const selected = new Set(rows.slice(0, 3).map(attendanceSelectionKey));
  const deletable = selectedDeletableAttendanceRows(rows, selected);
  assert.deepEqual(deletable.map(row => row.id), ["ABS-1"]);
});

test("virtual absence rows use a stable selection key", () => {
  assert.equal(attendanceSelectionKey({ id: "STATUS-X", nik: "100", tanggal: "2026-09-18", is_status_only: true }), "STATUS:100:2026-09-18");
});
