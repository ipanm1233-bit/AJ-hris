import test from "node:test";
import assert from "node:assert/strict";
import {
  PP_META, PP_BABS, PP_ARTICLES, PP_CATEGORIES, PP_DISCIPLINE_CATEGORIES,
  PP_COMPLIANCE_SUMMARY, PP_COMPLIANCE_MATRIX, PP_MANAGEMENT_DECISIONS,
  PP_COMPARISONS, PP_LEGAL_BASIS, PP_KEY_FINDINGS,
  getPpArticle, ppArticleLabel, disciplinePpArticles, searchPpArticles, ppStats,
  ppArticleReferences
} from "../js/peraturan-perusahaan.mjs";
import { PP_2026_POLICY_ARTICLES, ALL_POLICY_ARTICLES, policyPeriodForArticle, findPolicyArticle } from "../js/hr-case-policy.mjs";

test("katalog Peraturan Perusahaan memuat 75 pasal dalam 15 bab", () => {
  assert.equal(PP_ARTICLES.length, 75);
  assert.equal(PP_BABS.length, 15);
  assert.equal(PP_META.total_articles, 75);
  assert.equal(PP_META.total_bab, 15);
});

test("setiap pasal memiliki nomor, judul, ayat, dan label", () => {
  const seen = new Set();
  for (const article of PP_ARTICLES) {
    assert.ok(article.pasal >= 1 && article.pasal <= 75, `pasal ${article.pasal} di luar rentang`);
    assert.ok(article.judul && article.judul.length > 1, `pasal ${article.pasal} tanpa judul`);
    assert.ok(Array.isArray(article.ayat) && article.ayat.length > 0, `pasal ${article.pasal} tanpa ayat`);
    assert.equal(article.label, `Pasal ${article.pasal} — ${article.judul}`);
    assert.ok(!seen.has(article.pasal), `pasal ${article.pasal} duplikat`);
    seen.add(article.pasal);
  }
});

test("naskah 2026 ditandai sebagai draf yang belum berkekuatan hukum", () => {
  assert.match(PP_META.status, /Draf/i);
  assert.match(PP_META.approved_note, /Belum berkekuatan hukum/i);
});

test("pencarian pasal mendukung kata kunci dan filter bab", () => {
  const cuti = searchPpArticles({ query: "cuti" }).map(a => a.pasal);
  assert.ok(cuti.includes(39));
  assert.ok(cuti.includes(40));
  assert.ok(cuti.includes(41));
  const bab13 = searchPpArticles({ bab: 13 });
  assert.ok(bab13.length > 0);
  assert.ok(bab13.every(a => a.bab === 13));
  const disiplinOnly = searchPpArticles({ disciplineOnly: true });
  assert.ok(disiplinOnly.length >= 10);
  assert.ok(disiplinOnly.every(a => a.disiplin));
});

test("pasal terkait disiplin mencakup SP, mangkir, dan pelanggaran mendesak", () => {
  const pasal = disciplinePpArticles().map(a => a.pasal);
  for (const n of [9, 10, 11, 12, 13, 14, 15, 38, 43, 44, 49, 53, 54, 70]) {
    assert.ok(pasal.includes(n), `pasal ${n} harus terkait disiplin`);
  }
  const sp = getPpArticle("Pasal 44");
  assert.ok(sp, "getPpArticle harus menerima label pasal");
  assert.equal(sp.pasal, 44);
  assert.equal(ppArticleLabel(sp), sp.label);
});

test("referensi internal pasal mengarah ke pasal yang benar-benar ada", () => {
  for (const article of PP_ARTICLES) {
    for (const ref of ppArticleReferences(article)) {
      assert.ok(ref.pasal >= 1 && ref.pasal <= 75);
      assert.notEqual(ref.pasal, article.pasal);
    }
  }
});

test("statistik katalog konsisten", () => {
  const stats = ppStats();
  assert.equal(stats.total, PP_ARTICLES.length);
  assert.equal(stats.bab, PP_BABS.length);
  assert.equal(stats.disiplin, disciplinePpArticles().length);
  assert.ok(PP_CATEGORIES.length >= 10);
  assert.ok(PP_DISCIPLINE_CATEGORIES.length >= 5);
});

test("matriks kepatuhan memuat 76 butir dan rekap status", () => {
  assert.equal(PP_COMPLIANCE_MATRIX.length, 76);
  const total = PP_COMPLIANCE_SUMMARY.find(r => r.status === "TOTAL");
  assert.ok(total);
  const parts = PP_COMPLIANCE_SUMMARY.filter(r => r.status !== "TOTAL");
  assert.equal(parts.reduce((s, r) => s + r.jumlah, 0), 76);
  assert.ok(PP_KEY_FINDINGS.length >= 5);
  assert.ok(PP_MANAGEMENT_DECISIONS.length >= 5);
  assert.ok(PP_COMPARISONS.length >= 10);
  assert.ok(PP_LEGAL_BASIS.length >= 10);
});

test("katalog tidak memicu pembayaran atau upgrade layanan", () => {
  const forbidden = /(createCheckout|createSubscription|upgradeTier|billing|payment|midtrans|xendit|stripe)/i;
  const serialized = JSON.stringify(PP_ARTICLES).concat(JSON.stringify(PP_META));
  assert.ok(!forbidden.test(serialized));
});

test("modul baru tidak menyentuh API pembayaran, Supabase, atau Vercel", async () => {
  const fs = await import("node:fs");
  const files = [
    "js/peraturan-perusahaan.mjs",
    "js/views/peraturan-perusahaan.js",
    "views/peraturan-perusahaan.html"
  ];
  const forbidden = /(supabase|vercel|stripe|midtrans|xendit|createCheckout|createSubscription|upgradeTier|billing)/i;
  for (const file of files) {
    const raw = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!forbidden.test(source), `${file} tidak boleh memuat integrasi pembayaran/tier`);
  }
});

test("integrasi Disiplin & SP memakai pasal 2026 tanpa menabrak id arsip", () => {
  assert.ok(PP_2026_POLICY_ARTICLES.length >= 10);
  assert.ok(PP_2026_POLICY_ARTICLES.every(a => a.id.startsWith("pp-")));
  assert.ok(ALL_POLICY_ARTICLES.some(a => a.id === "43"), "id arsip 43 harus tetap ada");
  assert.ok(ALL_POLICY_ARTICLES.some(a => a.id === "pp-44"));
  assert.equal(policyPeriodForArticle("pp-44"), PP_META.period_label);
  assert.equal(policyPeriodForArticle("43"), "2024–2026");
  assert.ok(findPolicyArticle("pp-54"));
});
