#!/usr/bin/env node
/**
 * audit-rules.mjs — Penjaga agar firestore.rules tidak tertinggal dari kode.
 *
 * Masalah yang dicegah: koleksi baru dipakai di UI (fsGetAll/fsAdd/...), tetapi
 * blok `match /<koleksi>/{id}` belum ada di firestore.rules. Karena rules
 * berakhir dengan `match /{document=**} { allow read, write: if false }`,
 * pembacaan langsung gagal dengan "Missing or insufficient permissions."
 *
 * Pemakaian:
 *   node tools/audit-rules.mjs .
 *   node tools/audit-rules.mjs . --strict   # exit 1 bila ada koleksi tanpa aturan
 *
 * Koleksi yang memang sengaja hanya ditulis lewat API (Admin SDK) dapat
 * didaftarkan di IZIN_KHUSUS di bawah supaya tidak dianggap temuan.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || ".");
const STRICT = process.argv.includes("--strict");

// Koleksi yang memang tidak dibaca langsung dari browser.
const IZIN_KHUSUS = new Map([
  // contoh: ["nama_koleksi", "hanya ditulis lewat /api/... (Admin SDK)"]
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".vercel", "work", "perbaikan"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const rulesFile = files.find(f => path.basename(f) === "firestore.rules");
const configFile = files.find(f => path.basename(f) === "firebase-config.js");
if (!rulesFile) {
  console.error("✖ firestore.rules tidak ditemukan di", ROOT);
  process.exit(2);
}
if (!configFile) {
  console.error("✖ js/firebase-config.js tidak ditemukan di", ROOT);
  process.exit(2);
}

// 1. Koleksi yang punya blok aturan eksplisit.
const rules = fs.readFileSync(rulesFile, "utf8");
const ruleCollections = new Set();
for (const m of rules.matchAll(/match\s+\/([A-Za-z0-9_]+)\s*\/\{/g)) ruleCollections.add(m[1]);

// 1b. Koleksi yang dicakup blok wildcard, mis.
//     match /{collectionName}/{id} { allow read: if collectionName in ['hr_cases', ...] }
//     Tanpa ini, tool memberi false positive "tanpa aturan".
const wildcardCollections = new Set();
for (const m of rules.matchAll(/collectionName\s+in\s*\[([^\]]*)\]/g)) {
  for (const q of m[1].matchAll(/['"]([A-Za-z0-9_]+)['"]/g)) wildcardCollections.add(q[1]);
}

const denyAll = /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false/.test(rules);

// 2. Peta COL -> nama koleksi.
const cfg = fs.readFileSync(configFile, "utf8");
const colMap = new Map();
const start = cfg.indexOf("export const COL");
if (start > -1) {
  const block = cfg.slice(start, cfg.indexOf("};", start));
  for (const m of block.matchAll(/([A-Z0-9_]+)\s*:\s*"([^"]+)"/g)) colMap.set(m[1], m[2]);
}

// 3. Pemakaian koleksi di seluruh JS aplikasi.
const jsFiles = files.filter(f => f.endsWith(".js") || f.endsWith(".mjs"));
const usage = new Map();
const add = (col, where) => {
  if (!usage.has(col)) usage.set(col, new Set());
  usage.get(col).add(path.relative(ROOT, where).replace(/\\/g, "/"));
};
for (const f of jsFiles) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/COL\.([A-Z0-9_]+)/g)) {
    const col = colMap.get(m[1]);
    if (col) add(col, f);
  }
  for (const m of text.matchAll(/fs(?:GetAll|Add|Update|Delete|GetOne)\(\s*["']([a-z0-9_]+)["']/g)) add(m[1], f);
  for (const m of text.matchAll(/collection\(\s*db\s*,\s*["']([a-z0-9_]+)["']/g)) add(m[1], f);
}

const missing = [...usage.keys()]
  .filter(c => !ruleCollections.has(c) && !wildcardCollections.has(c) && !IZIN_KHUSUS.has(c))
  .sort();

console.log("firestore.rules      :", path.relative(ROOT, rulesFile));
console.log("blok match koleksi   :", ruleCollections.size);
console.log("dicakup blok wildcard:", wildcardCollections.size);
console.log("default-deny catch-all:", denyAll ? "ADA (koleksi tanpa blok = ditolak)" : "tidak ada");
console.log("koleksi dipakai kode :", usage.size);
console.log("koleksi tanpa aturan :", missing.length);
console.log("");

if (!missing.length) {
  console.log("✔ Semua koleksi yang dipakai UI punya blok aturan.");
  process.exit(0);
}

console.log("✖ Koleksi berikut akan ditolak Firestore (Missing or insufficient permissions):");
for (const col of missing) {
  console.log("  • " + col);
  for (const w of usage.get(col)) console.log("      dipakai di " + w);
}
if (denyAll) {
  console.log("\nTambahkan blok `match /<koleksi>/{id} { allow read: ... }` di firestore.rules,");
  console.log("lalu deploy ke SEMUA database Firestore yang dipakai aplikasi:");
  console.log("  firebase deploy --only firestore");
}
process.exit(STRICT ? 1 : 0);
