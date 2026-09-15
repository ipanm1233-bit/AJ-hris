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

test("employee leave email contains details without a Form Cuti attachment", () => {
  const leave = readFileSync(new URL("../js/views/cuti.js", import.meta.url), "utf8");
  const employee = leave.split("// 5a. Email ke Karyawan")[1]?.split("// 5b. Email ke Atasan")[0];
  const supervisor = leave.split("// 5b. Email ke Atasan")[1]?.split("// 5c. Email ke Rekan")[0];
  assert.ok(employee && supervisor);
  assert.match(employee, /label: "Tanggal Cuti"/);
  assert.match(employee, /label: "Pemotongan Saldo"/);
  assert.doesNotMatch(employee, /Form Terlampir|Dokumen Terlampir|Form Cuti Resmi|: attachments,/);
  assert.match(employee, /emailBodyKaryawan,\s*"",\s*null,\s*\{ manual: true \}/);
  assert.match(supervisor, /sickRecord \? null : attachments/);
  assert.match(leave, /const needsFormPdf = !sickRecord && \(publishDocument \|\| audiences\.has\("supervisor"\)\)/);
  assert.match(leave, /if \(!sickRecord && audiences\.has\("supervisor"\)\) try \{/);
});
