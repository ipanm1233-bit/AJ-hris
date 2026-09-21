import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("attendance screens do not read the entire attendance collection", () => {
  for (const path of ["js/views/absensi.js", "js/views/absensi-saya.js", "js/views/dashboard.js", "js/views/lembur-kasbon.js"]) {
    assert.doesNotMatch(read(path), /fsGetAll\(COL\.DATA_ABSENSI/);
  }
  assert.match(read("js/views/absensi.js"), /attendanceAccessApi\("attendance_list"/);
  assert.match(read("js/views/absensi-saya.js"), /listAttendance\(\{ nik, limit: 5000 \}\)/);
  assert.match(read("js/views/dashboard.js"), /listAttendance\(\{/);
  assert.match(read("js/views/lembur-kasbon.js"), /listAttendance\(\{/);
});
