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

test("Apps Script uploads allow the ContentService response host and a realistic timeout", () => {
  const integration = readFileSync(new URL("../js/gas-integration.js", import.meta.url), "utf8");
  const vercelConfig = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(integration, /setTimeout\(\(\) => controller\.abort\(\),\s*180000\)/);
  assert.match(vercelConfig, /https:\/\/script\.googleusercontent\.com/);
});

test("Broadcast email includes the uploaded file and a Google Drive fallback link", () => {
  const broadcast = readFileSync(new URL("../js/views/broadcast.js", import.meta.url), "utf8");
  const emailApi = readFileSync(new URL("../api/send-email.js", import.meta.url), "utf8");
  assert.match(broadcast, /emailAttachments\s*=\s*\[await buildEmailAttachment\(file\)\]/);
  assert.match(broadcast, /Buka.*lampiran.*Google Drive/s);
  assert.match(broadcast, /sendEmailNotif\([\s\S]*emailAttachments/);
  assert.match(emailApi, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
});
