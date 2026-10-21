import test from "node:test";
import assert from "node:assert/strict";
import { logoImgTag, isoDocHeaderTable, letterheadHtml, officialDocStyles } from "../js/branding.js";

test("logo dokumen tetap rapi di dalam kotak header ISO", () => {
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
});

test("kop surat memakai identitas Andela Jaya dan dua alamat resmi", () => {
  const letterhead = letterheadHtml();
  assert.match(letterhead, /ANDELA JAYA/);
  assert.match(letterhead, /Jl\. Jend\. Sudirman No\. 58, Cirebon/);
  assert.match(letterhead, /Jl\. Tenaga Baru I No\. 3, Blimbing, Kota Malang/);
  assert.match(letterhead, /0231 - 489345 \/ 489346/);
  assert.match(letterhead, /0341 - 400139/);
  assert.match(letterhead, /border-top:4px solid #000000/);
});

test("ukuran logo mengikuti parameter dan tidak memakai URL eksternal", () => {
  const tag = logoImgTag(64);
  assert.match(tag, /width="64"/);
  assert.match(tag, /height="64"/);
  assert.match(tag, /src="data:image\/png;base64,/);
  assert.doesNotMatch(tag, /https?:\/\//);
});

test("seluruh dokumen resmi memakai Arial yang seragam", () => {
  const styles = officialDocStyles();
  assert.match(styles, /\.aj-doc\s*\{[^}]*font-family: Arial, Helvetica, sans-serif/);
  assert.doesNotMatch(styles, /Times New Roman/i);
});
