import test from "node:test";
import assert from "node:assert/strict";
import {
  PP_META, PP_BABS, PP_ARTICLES, PP_CATEGORIES, PP_DISCIPLINE_CATEGORIES,
  PP_COMPLIANCE_SUMMARY, PP_COMPLIANCE_MATRIX, PP_MANAGEMENT_DECISIONS,
  PP_COMPARISONS, PP_LEGAL_BASIS, PP_KEY_FINDINGS,
  getPpArticle, ppArticleLabel, disciplinePpArticles, searchPpArticles, ppStats,
  ppArticleReferences, mergePpCatalog, normalizePpArticle, ppCategories,
  mergePpBabs, normalizePpBab, isPpBabRow
} from "../js/peraturan-perusahaan.mjs";
import { PP_2026_POLICY_ARTICLES, ALL_POLICY_ARTICLES, policyPeriodForArticle, findPolicyArticle, buildPp2026PolicyArticles } from "../js/hr-case-policy.mjs";

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

test("override Firestore dapat mengedit pasal bawaan tanpa mengubah katalog dasar", () => {
  const merged = mergePpCatalog([{
    pasal: 44,
    bab: 13,
    judul: "Judul Hasil Edit",
    kategori: "Disiplin",
    ayat: ["(1) Isi pasal hasil edit."],
    ringkasan: "Ringkasan hasil edit.",
    dasar_hukum: ["UU 13/2003"],
    disiplin: { tingkat: "SP 2", jenis: ["Pelanggaran berat"], catatan: "Uji" }
  }]);
  assert.equal(merged.length, PP_ARTICLES.length);
  const article = getPpArticle(44, merged);
  assert.equal(article.judul, "Judul Hasil Edit");
  assert.equal(article.ayat[0], "(1) Isi pasal hasil edit.");
  assert.equal(article.disiplin.tingkat, "SP 2");
  assert.notEqual(getPpArticle(44).judul, "Judul Hasil Edit");
});

test("pasal bawaan dapat disembunyikan dan pasal baru dapat ditambahkan", () => {
  const hidden = mergePpCatalog([{ pasal: 43, deleted: true }]);
  assert.equal(hidden.length, PP_ARTICLES.length - 1);
  assert.equal(getPpArticle(43, hidden), null);

  const custom = mergePpCatalog([{
    pasal: 76,
    bab: 15,
    judul: "Pasal Tambahan",
    kategori: "Ketentuan Lain",
    ayat: ["(1) Pasal tambahan untuk pengujian."],
    tags: ["uji"],
    disiplin: { tingkat: "Teguran", jenis: ["Pelanggaran uji"] }
  }]);
  assert.equal(custom.length, PP_ARTICLES.length + 1);
  const article = getPpArticle(76, custom);
  assert.equal(article.is_custom, true);
  assert.equal(article.label, "Pasal 76 — Pasal Tambahan");
  assert.equal(ppStats(custom).total, PP_ARTICLES.length + 1);
  assert.ok(ppCategories(custom).includes("Ketentuan Lain"));
  assert.ok(searchPpArticles({ query: "pengujian", articles: custom }).some(a => a.pasal === 76));
  const policyOptions = buildPp2026PolicyArticles(disciplinePpArticles(custom));
  assert.ok(policyOptions.some(option => option.id === "pp-76"));
});

test("Superadmin dapat menambah bab baru dan pasal mengikuti bab tersebut", () => {
  const rows = [
    { type: "bab", nomor: 16, judul: "Perlindungan Data", kategori: "Perlindungan & Kepatuhan" },
    { type: "bab", nomor: 15, judul: "Penutup (Revisi)", kategori: "Penutup" },
    {
      pasal: 76,
      bab: 16,
      judul: "Kerahasiaan Data",
      kategori: "Perlindungan & Kepatuhan",
      ayat: ["(1) Data pekerja wajib dilindungi."],
      disiplin: { tingkat: "Teguran", jenis: ["Pelanggaran kerahasiaan"] }
    }
  ];

  assert.equal(isPpBabRow(rows[0]), true);
  assert.equal(isPpBabRow(rows[2]), false);
  assert.equal(normalizePpBab({ nomor: 16, judul: "Uji" }).is_custom, true);

  const babs = mergePpBabs(rows, PP_BABS);
  assert.equal(babs.length, 16);
  assert.equal(babs.find(bab => bab.nomor === 15).judul, "Penutup (Revisi)");
  assert.equal(babs.find(bab => bab.nomor === 15).is_custom, false);
  assert.equal(babs.find(bab => bab.nomor === 16).judul, "Perlindungan Data");
  assert.equal(babs.find(bab => bab.nomor === 16).is_custom, true);

  const catalog = mergePpCatalog(rows, PP_ARTICLES, babs);
  const article = getPpArticle(76, catalog);
  assert.equal(article.bab, 16);
  assert.equal(article.bab_judul, "Perlindungan Data");
  assert.equal(article.is_custom, true);
  assert.equal(mergePpBabs(rows, PP_BABS, catalog).find(bab => bab.nomor === 16).jumlah_pasal, 1);
  assert.equal(ppStats(catalog, babs).bab, 16);
});

test("normalisasi menolak pasal tanpa nomor, judul, atau ayat", () => {
  assert.equal(normalizePpArticle({ judul: "Tanpa nomor", ayat: ["(1) Uji"] }), null);
  assert.equal(normalizePpArticle({ pasal: 76, ayat: ["(1) Uji"] }), null);
  assert.equal(normalizePpArticle({ pasal: 76, judul: "Tanpa ayat" }), null);
  assert.ok(normalizePpArticle({ pasal: 76, judul: "Valid", ayat: ["(1) Uji"] }));
});

test("UI menyediakan pengelolaan katalog dan aturan Firestore untuk Superadmin", async () => {
  const fs = await import("node:fs");
  const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const view = read("js/views/peraturan-perusahaan.js");
  const html = read("views/peraturan-perusahaan.html");
  const auth = read("js/auth.js");
  const rules = read("firestore.rules");
  const pemanggilan = read("js/views/pemanggilan.js");
  const konseling = read("js/views/konseling-coaching.js");

  assert.match(html, /data-pptab="kelola"/);
  assert.match(view, /peraturan_perusahaan\.edit/);
  assert.match(view, /Tambah Bab/);
  assert.match(view, /pp-manage-add-bab/);
  assert.match(view, /pp-bab-/);
  assert.match(view, /mergePpBabs/);
  assert.match(view, /fsUpdate\(COL\.PERATURAN_PERUSAHAAN/);
  assert.match(view, /fsDelete\(COL\.PERATURAN_PERUSAHAAN/);
  assert.match(auth, /peraturan_perusahaan\.edit/);
  assert.match(rules, /match \/peraturan_perusahaan\/\{id\}/);
  assert.match(rules, /hasScopedAction\('peraturan_perusahaan\.edit'\)/);
  assert.match(pemanggilan, /mergePpCatalog/);
  assert.match(konseling, /ppPolicyArticleOptions/);
  assert.match(konseling, /buildPp2026PolicyArticles/);
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
