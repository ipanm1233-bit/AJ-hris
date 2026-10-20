import test from "node:test";
import assert from "node:assert/strict";
import { logoImgTag, isoDocHeaderTable, letterheadHtml } from "../js/branding.js";

test("logo dokumen selalu berada di tengah kotak header", () => {
  const tag = logoImgTag(52);
  assert.match(tag, /<img /);
  assert.match(tag, /display:block/);
  assert.match(tag, /margin:0 auto/);
  assert.match(tag, /object-fit:contain/);

  const header = isoDocHeaderTable({
    judul: "TANDA TERIMA GIMMICK MARKETING",
    noDok: "TT-001"
  });
  assert.match(header, /text-align:center/);
  assert.match(header, /align-items:center/);
  assert.match(header, /justify-content:center/);
  assert.match(header, /logo/i);

  const letterhead = letterheadHtml();
  assert.match(letterhead, /margin:0 auto/);
  assert.match(letterhead, /text-align:center/);
});

test("ukuran logo mengikuti parameter dan tidak memakai URL eksternal", () => {
  const tag = logoImgTag(64);
  assert.match(tag, /width="64"/);
  assert.match(tag, /height="64"/);
  assert.match(tag, /src="data:image\/png;base64,/);
  assert.doesNotMatch(tag, /https?:\/\//);
});
