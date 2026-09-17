import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("production schedules leave digests and daily scheduled information email delivery", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.crons, [
    { path: "/api/cron-rekap-cuti", schedule: "45 0 * * *" },
    { path: "/api/cron-rekap-cuti", schedule: "0 10 * * *" },
    { path: "/api/cron-informasi", schedule: "15 0 * * *" }
  ]);

  const handler = readFileSync(new URL("../api/cron-rekap-cuti.js", import.meta.url), "utf8");
  assert.match(handler, /cronSchedule === "45 0 \* \* \*"[\s\S]*\? "morning"/);
  assert.match(handler, /cronSchedule === "0 10 \* \* \*" \? "evening"/);
  assert.match(handler, /const isScheduledInvocation = Boolean\(scheduledType\)/);
  assert.equal((handler.match(/\|\| forceSend \|\| isScheduledInvocation/g) || []).length, 2);

  const informationHandler = readFileSync(new URL("../api/cron-informasi.js", import.meta.url), "utf8");
  assert.match(informationHandler, /requireCronSecret\(req, res\)/);
  assert.match(informationHandler, /kirim_email_terjadwal/);
  assert.match(informationHandler, /email_sent_at/);
  assert.match(informationHandler, /bcc: group/);
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

test("submitting an izin explicitly delivers approver notifications", () => {
  const izin = readFileSync(new URL("../js/views/izin.js", import.meta.url), "utf8");
  const utils = readFileSync(new URL("../js/utils.js", import.meta.url), "utf8");
  const deliveryBlock = izin.split("// Send Notifications to Atasan & Target Employee")[1]?.split("toast(\"Pengajuan izin berhasil dibuat!\"")[0];
  assert.ok(deliveryBlock);
  assert.match(deliveryBlock, /notifyUser\(atasanVal,[\s\S]*\{ manual: true \}\)/);
  assert.match(deliveryBlock, /notifyUser\(t,[\s\S]*\{ manual: true \}\)/);
  assert.match(utils, /sendBranchInstantAlert/);
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
