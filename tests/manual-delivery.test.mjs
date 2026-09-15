import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("production configuration contains no automatic operational cron", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.crons, []);
});

test("shared email and notification helpers require an explicit manual action", () => {
  const source = readFileSync(new URL("../js/utils.js", import.meta.url), "utf8");
  assert.match(source, /sendEmailNotif[\s\S]*options\?\.manual\s*!==\s*true/);
  assert.match(source, /notifyUser[\s\S]*opts\.manual\s*!==\s*true/);
});

test("leave and approval screens expose manual delivery controls", () => {
  const leave = readFileSync(new URL("../js/views/cuti.js", import.meta.url), "utf8");
  const approval = readFileSync(new URL("../js/views/approval.js", import.meta.url), "utf8");
  assert.match(leave, /Kirim ke Karyawan/);
  assert.match(leave, /Kirim ke Atasan/);
  assert.match(leave, /Kirim ke Rekan/);
  assert.match(approval, /data-manual-notify/);
  assert.match(approval, /Kirim Email &amp; Notifikasi/);
});
