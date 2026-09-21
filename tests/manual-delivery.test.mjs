import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("production schedules leave digests and daily scheduled information email delivery", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.crons, [
    { path: "/api/cron-rekap-cuti", schedule: "45 0 * * *" },
    { path: "/api/cron-rekap-cuti", schedule: "0 10 * * *" },
    { path: "/api/send-email", schedule: "15 0 * * *" }
  ]);

  const handler = readFileSync(new URL("../api/cron-rekap-cuti.js", import.meta.url), "utf8");
  assert.match(handler, /cronSchedule === "45 0 \* \* \*"[\s\S]*\? "morning"/);
  assert.match(handler, /cronSchedule === "0 10 \* \* \*" \? "evening"/);
  assert.match(handler, /const isScheduledInvocation = Boolean\(scheduledType\)/);
  assert.equal((handler.match(/\|\| forceSend \|\| isScheduledInvocation/g) || []).length, 2);

  const informationHandler = readFileSync(new URL("../api/send-email.js", import.meta.url), "utf8");
  assert.match(informationHandler, /requireCronSecret\(req, res\)/);
  assert.match(informationHandler, /kirim_email_terjadwal/);
  assert.match(informationHandler, /email_sent_at/);
  assert.match(informationHandler, /bcc: group/);
  assert.match(informationHandler, /req\.method === 'GET'/);
});

test("shared email and notification helpers require an explicit manual action", () => {
  const source = readFileSync(new URL("../js/utils.js", import.meta.url), "utf8");
  assert.match(source, /sendEmailNotif[\s\S]*options\?\.manual\s*!==\s*true/);
  assert.match(source, /notifyUser[\s\S]*opts\.manual\s*!==\s*true/);
});

test("TNA survey distribution uses searchable checkbox targets and explicit email delivery", () => {
  const source = readFileSync(new URL("../js/views/training.js", import.meta.url), "utf8");
  assert.match(source, /data-target-group="branches"/);
  assert.match(source, /data-target-group="divisions"/);
  assert.match(source, /data-target-group="positions"/);
  assert.match(source, /data-target-group="employees"/);
  assert.match(source, /id="c-employee-search"/);
  assert.match(source, /id="c-email-on-publish"/);
  assert.match(source, /email_on_publish:\s*root\.querySelector/);
  assert.match(source, /campaign\.email_on_publish === true/);
  assert.match(source, /data-send-one/);
  assert.match(source, /Kirim ke yang dipilih/);
  assert.match(source, /\{ manual: true, sendEmail: true \}/);
});

test("TNA surveys support templates, clickable scales, deletion, and management exports", () => {
  const source = readFileSync(new URL("../js/views/training.js", import.meta.url), "utf8");
  assert.match(source, /id="c-template"/);
  assert.match(source, /id="apply-competency-template"/);
  assert.match(source, /templateCompetencyText\(templateKey\)/);
  assert.match(source, /function clickableScale/);
  assert.match(source, /type="radio"/);
  assert.match(source, /data-export-xlsx/);
  assert.match(source, /data-export-pdf/);
  assert.match(source, /data-delete-survey/);
  assert.match(source, /action: "delete_campaign"/);
  assert.match(source, /downloadHtmlAsPdf/);
  assert.match(source, /XLSX\.writeFile/);
});

test("mass publication delivery is batched and does not overload browser transactions", () => {
  const source = readFileSync(new URL("../js/views/broadcast.js", import.meta.url), "utf8");
  assert.match(source, /runInBatches\(targetUserIds, 10/);
  assert.match(source, /runInBatches\(targetEmails, 5/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /SEBAGIAN_GAGAL/);
});

test("memo editor exposes a reusable editable table insertion control", () => {
  const source = readFileSync(new URL("../js/views/broadcast.js", import.meta.url), "utf8");
  assert.match(source, /id="bc-insert-table"/);
  assert.match(source, /class MemoTableBlot extends BlockEmbed/);
  assert.match(source, /Quill\.register\(MemoTableBlot, true\)/);
  assert.match(source, /function insertTableIntoEditor\(quillInstance\)/);
  assert.match(source, /'table-btn': function\(\) \{\s*insertTableIntoEditor\(this\.quill\);/);
  assert.match(source, /table-layout:fixed/);
  assert.match(source, /Math\.min\(parsedRows, 15\)/);
  assert.match(source, /Math\.min\(parsedColumns, 8\)/);
  assert.match(source, /insertEmbed\(insertionIndex, "memo-table"/);
  assert.match(source, /setAttribute\("contenteditable", "true"\)/);
  assert.match(source, /Isi setiap sel tabel dapat diedit langsung/);
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
