import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("shared uploader never falls back to embedding a Data URL in Firestore", () => {
  const source = readFileSync(new URL("../js/gas-integration.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /return\s+`data:/);
  assert.match(source, /Respons Apps Script tidak menyertakan URL file/);
});

test("Broadcast does not continue after a failed attachment upload", () => {
  const source = readFileSync(new URL("../js/views/broadcast.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /melanjutkan tanpa lampiran/);
  assert.match(source, /lampiranUrl\s*=\s*await uploadFileToDrive/);
});
