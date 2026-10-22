import test from "node:test";
import assert from "node:assert/strict";
import { logoImgTag, isoDocHeaderTable, letterheadHtml, officialDocStyles } from "../js/branding.js";
import { buildOfficialDocument, isOfficialDocType } from "../js/views/dokumen-official.js";

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

test("template resmi HRD menghasilkan format baku tanpa tag HTML bocor", () => {
  const sample = {
    nomor_surat: "003/HRGA-AJ-PROB/IX/2026",
    judul: "DOKUMEN RESMI",
    tanggal_surat: "2026-09-14",
    tanggal_mulai: "2026-09-14",
    tanggal_selesai: "2026-12-14",
    nama_karyawan: "AYU RISNA YULIANA",
    nik_karyawan: "AJ-021",
    jabatan: "Finance Staff",
    divisi: "Finance",
    cabang: "Cirebon",
    alamat: "Blok Desa, Cirebon",
    no_ktp: "3209186606920005",
    gaji_pokok: "Rp 4.500.000",
    custom_fields: {
      PIHAK1_NAMA: "Ipan Maulana",
      PIHAK1_JABATAN: "HRGA",
      TEMPAT_LAHIR: "Cirebon",
      TANGGAL_LAHIR: "1992-06-26",
      JENIS_KELAMIN: "PEREMPUAN",
      ATASAN_LANGSUNG: "Ipan Maulana",
      ATASAN_JABATAN: "HRGA",
      PELANGGARAN: "Pelanggaran pertama.\nPelanggaran kedua.",
      DAMPAK: "Risiko administrasi."
    }
  };

  const types = ["KONTRAK_PKWT", "ADENDUM_PKWT_SALES", "PERPANJANGAN_PKWTT", "SK_PENGANGKATAN", "KOMITMEN_KERJA", "SP_1", "SP_2", "SP_3"];
  for (const type of types) {
    assert.equal(isOfficialDocType(type), true, type);
    const html = buildOfficialDocument({ ...sample, template_type: type });
    assert.ok(html && html.length > 1000, type);
    assert.match(html, /ANDELA JAYA/, type);
    assert.doesNotMatch(html, /&lt;b&gt;/, `${type} tidak boleh menampilkan tag bold sebagai teks`);
  }

  const pkwt = buildOfficialDocument({ ...sample, template_type: "KONTRAK_PKWT" });
  assert.match(pkwt, /PERJANJIAN KERJA WAKTU TERTENTU/);
  assert.match(pkwt, /Pasal 18/);
  assert.match(pkwt, /Rp 4\.500\.000/);
  assert.match(pkwt, /CV\. Andela Jaya,/);

  const adendum = buildOfficialDocument({ ...sample, template_type: "ADENDUM_PKWT_SALES" });
  assert.match(adendum, /Tunjangan Sewa Motor/);
  assert.match(adendum, /<b>Rp 4\.500\.000<\/b>/);

  const sk = buildOfficialDocument({ ...sample, template_type: "SK_PENGANGKATAN" });
  assert.match(sk, /MEMUTUSKAN/);
  assert.match(sk, /PENGANGKATAN KARYAWAN TETAP/);

  const sp2 = buildOfficialDocument({ ...sample, template_type: "SP_2" });
  assert.match(sp2, /Surat Peringatan Kedua/);
  assert.match(sp2, /Surat Peringatan Ketiga/);
});
