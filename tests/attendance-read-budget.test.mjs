import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("attendance screens do not read the entire attendance collection", () => {
  for (const path of ["js/views/absensi.js", "js/views/absensi-saya.js", "js/views/dashboard.js", "js/views/lembur-kasbon.js"]) {
    assert.doesNotMatch(read(path), /fsGetAll\(COL\.DATA_ABSENSI/);
  }
  assert.match(read("js/views/absensi.js"), /where\("tanggal",\s*">=",\s*thresholdStr\)/);
  assert.match(read("js/views/absensi.js"), /getDocsFromCache/);
});
