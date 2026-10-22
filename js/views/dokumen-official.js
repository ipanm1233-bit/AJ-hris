/**
 * =====================================================================
 * DOKUMEN-OFFICIAL.JS — Template dokumen resmi HRD (format baku)
 * ---------------------------------------------------------------------
 * Sumber format:
 *  - Adendum PKWT Sales (Eko Miharjo)
 *  - Perjanjian Kerja Waktu Tertentu / Probation (Ayu Risna Yuliana)
 *  - Surat Komitmen Kerja (Ayu Risna Yuliana)
 *  - SK Pengangkatan Karyawan Tetap (Gelora Claudio)
 *  - Perpanjangan PKWTT (Gelora Claudio)
 *  - Surat Peringatan (Arif Jabidi)
 *
 * Modul ini sengaja tidak mengimpor utils.js/firebase agar dapat dipakai
 * untuk preview, cetak, ekspor Word, dan pengujian visual tanpa browser.
 * =====================================================================
 */
import { letterheadHtml, COMPANY_NAME } from "../branding.js";

export const OFFICIAL_DOC_TYPES = {
  KONTRAK_PKWT: {
    label: "Perjanjian Kerja Karyawan (PKWT / Probation)",
    title: "PERJANJIAN KERJA WAKTU TERTENTU",
    category: "KONTRAK"
  },
  ADENDUM_PKWT_SALES: {
    label: "Adendum / Perpanjangan Kontrak Sales (PKWT)",
    title: "ADENDUM PERJANJIAN KERJA WAKTU TERTENTU",
    category: "KONTRAK"
  },
  PERPANJANGAN_PKWTT: {
    label: "Perpanjangan Perjanjian Kerja PKWTT (Karyawan Tetap)",
    title: "SURAT PERJANJIAN KERJA WAKTU TIDAK TERTENTU",
    category: "KONTRAK"
  },
  SK_PENGANGKATAN: {
    label: "SK Pengangkatan Karyawan Tetap",
    title: "SURAT KEPUTUSAN PENGANGKATAN KARYAWAN TETAP",
    category: "KONTRAK"
  },
  KOMITMEN_KERJA: {
    label: "Surat Komitmen Kerja (Probation)",
    title: "SURAT KOMITMEN KERJA",
    category: "KETERANGAN"
  },
  SP_1: {
    label: "Surat Peringatan 1 (SP-1)",
    title: "SURAT PERINGATAN",
    category: "SP"
  },
  SP_2: {
    label: "Surat Peringatan 2 (SP-2)",
    title: "SURAT PERINGATAN",
    category: "SP"
  },
  SP_3: {
    label: "Surat Peringatan 3 (SP-3)",
    title: "SURAT PERINGATAN",
    category: "SP"
  }
};

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function esc(value) {
  return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function parseYmd(value) {
  if (!value) return null;
  if (typeof value === "object" && value !== null) {
    if (typeof value.seconds === "number") {
      const d = new Date(value.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value.toDate === "function") {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
  }
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d;
  if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  else {
    d = new Date(value);
    if (isNaN(d.getTime())) return null;
  }
  return isNaN(d.getTime()) ? null : d;
}

function isoDate(value) {
  const d = parseYmd(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tanggal(value, { withDay = false, fallback = "-" } = {}) {
  const d = parseYmd(value);
  if (!d) return fallback;
  const hasil = `${String(d.getDate()).padStart(2, "0")} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  return withDay ? `${HARI[d.getDay()]}, ${hasil}` : hasil;
}

function angka(value) {
  if (typeof value === "number") return Math.max(0, Math.floor(value));
  const cleaned = String(value || "").replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function rupiah(value) {
  const n = angka(value);
  return n ? "Rp " + n.toLocaleString("id-ID") : "-";
}

function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "Nol";
  const satuan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  if (n < 12) return satuan[n];
  if (n < 20) return terbilang(n - 10) + " Belas";
  if (n < 100) return (terbilang(Math.floor(n / 10)) + " Puluh " + terbilang(n % 10)).trim();
  if (n < 200) return ("Seratus " + terbilang(n - 100)).trim();
  if (n < 1000) return (terbilang(Math.floor(n / 100)) + " Ratus " + terbilang(n % 100)).trim();
  if (n < 2000) return ("Seribu " + terbilang(n - 1000)).trim();
  if (n < 1e6) return (terbilang(Math.floor(n / 1000)) + " Ribu " + terbilang(n % 1000)).trim();
  if (n < 1e9) return (terbilang(Math.floor(n / 1e6)) + " Juta " + terbilang(n % 1e6)).trim();
  if (n < 1e12) return (terbilang(Math.floor(n / 1e9)) + " Miliar " + terbilang(n % 1e9)).trim();
  return (terbilang(Math.floor(n / 1e12)) + " Triliun " + terbilang(n % 1e12)).trim();
}

function rupiahKata(value) {
  const n = angka(value);
  return n ? `${terbilang(n)} Rupiah` : "-";
}

function cf(doc, key, fallback = "") {
  const custom = doc?.custom_fields || {};
  const value = custom[key];
  if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  const lower = String(key || "").toLowerCase();
  if (doc?.[lower] !== undefined && doc?.[lower] !== null && String(doc[lower]).trim() !== "") return String(doc[lower]).trim();
  return fallback;
}

function dataAtau(doc, key, fallback = "-") {
  const value = cf(doc, key, "");
  return value || fallback;
}

function kota(doc) {
  const penempatan = `${cf(doc, "KOTA", "")} ${cf(doc, "LOKASI_KERJA", "")} ${doc?.cabang || ""}`.trim();
  const haystack = (penempatan || doc?.alamat || "").toLowerCase();
  return haystack.includes("malang") ? "Malang" : "Cirebon";
}

function alamatKantor(doc) {
  const haystack = `${doc?.cabang || ""} ${cf(doc, "LOKASI_KERJA", "")}`.toLowerCase();
  return haystack.includes("malang")
    ? "Jln. Tenaga Baru I No. 3, Blimbing, Kota Malang"
    : "Jln. Jendral Sudirman No. 58, Penggung – Kota Cirebon";
}

function namaKaryawan(doc) {
  return dataAtau(doc, "NAMA_KARYAWAN", doc?.nama_karyawan || "-");
}

function jabatanKaryawan(doc) {
  return dataAtau(doc, "JABATAN", doc?.jabatan || "-");
}

function ktpKaryawan(doc) {
  const direct = cf(doc, "NO_KTP", "");
  if (direct && direct !== "-") return direct;
  const fallback = String(doc?.no_ktp || "").trim();
  return fallback && fallback !== "-" ? fallback : "-";
}

function genderKaryawan(doc) {
  return dataAtau(doc, "JENIS_KELAMIN", "-");
}

function atasanNama(doc) {
  return dataAtau(doc, "ATASAN_LANGSUNG", cf(doc, "PIHAK1_NAMA", "HRD"));
}

function atasanJabatan(doc) {
  return dataAtau(doc, "ATASAN_JABATAN", "Atasan Langsung");
}

function signerNama(doc) {
  return dataAtau(doc, "PIHAK1_NAMA", doc?.created_by || "Human Resource Department");
}

function signerJabatan(doc) {
  return dataAtau(doc, "PIHAK1_JABATAN", "HRD");
}

function pasal(judul, isi) {
  return `
    <div class="doc-pasal">
      <div class="doc-pasal-title">Pasal ${esc(judul)}</div>
      ${isi}
    </div>`;
}

function daftar(items, { type = "number", start = 1, html = false } = {}) {
  const list = (Array.isArray(items) ? items : [])
    .map(item => String(item || "").trim())
    .filter(Boolean);
  if (!list.length) return "";
  return `<ol class="doc-list" type="${type === "alpha" ? "a" : "1"}" start="${start}">${list.map(item => `<li>${html ? item : esc(item)}</li>`).join("")}</ol>`;
}

function paragraf(html) {
  return `<p class="doc-paragraph">${html}</p>`;
}

function titleBlock(title, number) {
  return `
    <div class="aj-title doc-title-official">
      <h1>${esc(title)}</h1>
      <div class="aj-number">Nomor: ${esc(number || "-")}</div>
    </div>`;
}

function signatureDuaPihak(doc, leftRole = "PIHAK PERTAMA,", rightRole = "PIHAK KEDUA,") {
  const signatureUrl = doc?.tanda_tangan_url ? String(doc.tanda_tangan_url) : "";
  const employeeSignature = signatureUrl
    ? `<img src="${esc(signatureUrl)}" alt="Tanda tangan ${esc(namaKaryawan(doc))}" style="display:inline-block;max-height:58px;max-width:190px;object-fit:contain;" />`
    : "";
  return `
    <table class="aj-signature doc-signature-2">
      <tr>
        <td>
          <div class="doc-sign-role">${esc(leftRole)}</div>
          <div class="doc-sign-space"></div>
          <div class="doc-sign-name">${esc(signerNama(doc))}</div>
          <div class="doc-sign-sub">${esc(signerJabatan(doc))}</div>
        </td>
        <td>
          <div class="doc-sign-role">${esc(rightRole)}</div>
          <div class="doc-sign-space">${employeeSignature}</div>
          <div class="doc-sign-name">${esc(namaKaryawan(doc))}</div>
          <div class="doc-sign-sub">${esc(jabatanKaryawan(doc))}</div>
        </td>
      </tr>
    </table>`;
}

function defaultResponsibilities(jabatan) {
  const pos = String(jabatan || "").toLowerCase();
  if (/finance|akunt|accounting|kasir/.test(pos)) {
    return [
      "Memastikan keakuratan dan ketepatan data keuangan yang diinput kasir ke dalam sistem.",
      "Melaksanakan standar operasional prosedur keuangan berjalan dengan baik.",
      "Melakukan analisis sederhana terhadap piutang kepada customer serta membuka atau memblokir toko berdasarkan kredit limit dan/atau Over Due.",
      "Mengelola dokumen keuangan dan menyimpannya dengan rapi.",
      "Menyediakan informasi atau dokumen yang diperlukan saat proses audit atau pemeriksaan.",
      "Mencocokkan data dari admin sales dan data kasir.",
      "Melakukan konfirmasi ke toko mengenai pembayaran customer dan pembagian CN.",
      "Menyimpan semua invoice customer (termasuk Kontra Bon) yang akan ditagih.",
      "Memeriksa kembali invoice & TBP yang tidak tertagih.",
      "Monitoring Collection & Over Due Customer.",
      "Mempersiapkan data yang harus dibawa oleh sales (Collection Plan, Invoice, TBP).",
      "Melakukan verifikasi NOO dan mem-backup kasir jika diperlukan."
    ];
  }
  if (/sales|kanvas|marketing|account executive/.test(pos)) {
    return [
      "Mencapai target penjualan yang ditetapkan perusahaan.",
      "Melakukan kunjungan dan pembinaan kepada toko/pelanggan secara rutin.",
      "Memastikan penagihan dan administrasi penjualan berjalan sesuai SOP.",
      "Menjaga hubungan baik dengan pelanggan serta reputasi perusahaan.",
      "Membuat laporan aktivitas penjualan secara berkala kepada atasan langsung."
    ];
  }
  return [
    "Melaksanakan tugas dan tanggung jawab sesuai jabatan yang diberikan.",
    "Mematuhi seluruh Peraturan Perusahaan, SOP, dan instruksi atasan langsung.",
    "Menjaga kerahasiaan data perusahaan serta nama baik perusahaan.",
    "Melaksanakan tugas lain yang diberikan atasan sesuai kebutuhan operasional."
  ];
}

function responsibilities(doc) {
  const custom = cf(doc, "TANGGUNG_JAWAB", "");
  if (custom) return custom.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return defaultResponsibilities(jabatanKaryawan(doc));
}

/* =====================================================================
 * 1. PERJANJIAN KERJA WAKTU TERTENTU (PKWT / PROBATION)
 * ===================================================================== */
function buildPerjanjianKerja(doc) {
  const mulai = doc?.tanggal_mulai;
  const selesai = doc?.tanggal_selesai;
  const gaji = cf(doc, "GAJI_POKOK", doc?.gaji_pokok || "");
  const atasan = atasanNama(doc);
  const atasanJab = atasanJabatan(doc);
  const provinsi = kota(doc) === "Malang" ? "Jawa Timur" : "Jawa Barat";

  return `
    <div class="aj-doc doc-official">
      ${letterheadHtml()}
      ${titleBlock("PERJANJIAN KERJA WAKTU TERTENTU", doc?.nomor_surat)}

      <p class="doc-paragraph">Pada hari ini, <b>${esc(tanggal(doc?.tanggal_surat, { withDay: true }))}</b>, bertempat di kantor ${esc(COMPANY_NAME)}, kami yang bertanda tangan di bawah ini:</p>

      <ol class="doc-list doc-list-party" type="1">
        <li><b>${esc(COMPANY_NAME)}</b>, suatu badan hukum yang didirikan berdasarkan hukum Republik Indonesia, bergerak di bidang perdagangan bahan-bahan konstruksi, berkedudukan di Kota ${esc(kota(doc))}, ${esc(provinsi)}; dalam hal ini diwakili oleh <b>${esc(signerNama(doc))}</b>, yang bertindak dalam kedudukannya sebagai <b>${esc(signerJabatan(doc))}</b>, dari dan karenanya bertindak untuk dan atas nama ${esc(COMPANY_NAME)}, selanjutnya disebut <b>“Perusahaan”</b>.</li>
        <li><b>${esc(namaKaryawan(doc))}</b>, seorang karyawan swasta yang beralamat di <b>${esc(dataAtau(doc, "ALAMAT", doc?.alamat || "-"))}</b>, lahir di ${esc(dataAtau(doc, "TEMPAT_LAHIR", "-"))}, ${esc(tanggal(dataAtau(doc, "TANGGAL_LAHIR", ""), { fallback: "-" }))}, berjenis kelamin ${esc(genderKaryawan(doc))}, dengan Nomor Induk Kependudukan <b>${esc(ktpKaryawan(doc))}</b>, selanjutnya disebut <b>“Karyawan”</b>.</li>
      </ol>

      <p class="doc-paragraph">Perusahaan dan Karyawan secara bersama-sama disebut sebagai <b>“Para Pihak”</b> dan masing-masing secara terpisah disebut <b>“Pihak”</b>, dengan ini menerangkan hal-hal sebagai berikut:</p>
      ${daftar([
        "Bahwa Perusahaan membutuhkan tenaga kerja untuk pekerjaan yang jangka waktunya bersifat tetap/pekerjaan dalam waktu tertentu;",
        "Berdasarkan alasan yang disebutkan di atas, Perusahaan merekrut Karyawan sebagai seorang pekerja untuk memperkuat angkatan kerja Perusahaan; dan",
        "Bahwa pada saat Kontrak Kerja ini dilaksanakan, Karyawan tidak terikat dalam hubungan ketenagakerjaan serupa di Perusahaan mana pun, baik yang berstatus sebagai badan hukum, non-badan hukum, dan/atau usaha milik perseorangan, dan memiliki niat dan keinginan untuk mengikatkan dirinya dalam suatu hubungan kerja dan melaksanakan pekerjaan dalam waktu tertentu pada Perusahaan dengan keterampilan, keahlian, dan pengalaman yang dibutuhkan oleh Perusahaan."
      ])}

      <p class="doc-paragraph">Para Pihak dengan ini sepakat untuk mengikatkan diri dalam Perjanjian Kerja ini, dengan ketentuan-ketentuan sebagai berikut:</p>

      ${pasal("1", `
        <div class="doc-pasal-sub">RUANG LINGKUP PEKERJAAN</div>
        ${daftar([
          `Selama terikat dalam hubungan kerja yang timbul dari Perjanjian Kerja ini, Karyawan memegang jabatan sebagai ${jabatanKaryawan(doc)}, dan dengan dipegangnya jabatan tersebut Karyawan memiliki kewajiban untuk melaporkan kepada ${atasan} sebagai ${atasanJab}.`,
          "Tanggung jawab Karyawan selama memegang jabatan akan tercantum pada perjanjian kerja ini.",
          "Perusahaan memiliki hak penuh menambahkan atau mengurangi tanggung jawab Karyawan secara sepihak berdasarkan kebutuhan komersial dan operasional Perusahaan."
        ])}
      `)}

      ${pasal("2", `
        <div class="doc-pasal-sub">PENEMPATAN KERJA</div>
        ${daftar([
          `Karyawan setuju dan akan bekerja di Perusahaan yang beralamat di ${alamatKantor(doc)} atau alamat lain sesuai dengan domisili atau wilayah kerja Perusahaan di waktu yang akan datang.`,
          "Perusahaan sepenuhnya berhak untuk memindahkan Karyawan ke kantor-kantor cabangnya atau bagian usaha lainnya yang ada, dan demikian Karyawan harus bersedia untuk dipindahkan ke tempat kerja dan/atau bagian usaha yang berbeda-beda sesuai dengan kebutuhan Perusahaan.",
          "Karyawan berhak untuk menerima tunjangan berdasarkan jumlah yang telah diatur dalam Peraturan Perusahaan."
        ])}
      `)}

      ${pasal("3", `
        <div class="doc-pasal-sub">JANGKA WAKTU DAN PERPANJANGAN PERJANJIAN KERJA</div>
        ${daftar([
          `Perjanjian kerja ini adalah perjanjian untuk masa percobaan karyawan yang berlaku untuk jangka waktu 3 (tiga) bulan terhitung sejak ${tanggal(mulai, { withDay: true })} sampai dengan ${tanggal(selesai, { withDay: true })}.`,
          `Atas dasar penilaian karyawan yang akan dilakukan sebelum masa kerja karyawan berakhir, Perjanjian Kerja akan berakhir dengan sendirinya pada ${tanggal(selesai, { withDay: true })} tanpa adanya kewajiban dari Perusahaan untuk melakukan pembayaran apa pun kepada Karyawan selain upah bulanan yang berjalan.`,
          "Jika Karyawan dalam masa percobaan selama 3 (tiga) bulan tersebut menunjukkan performa yang baik dengan dibuktikan dari penilaian KPI (Key Performance Indicator) di atas 80%, maka Karyawan akan dinaikkan status sebagai Karyawan Tetap dengan Perjanjian Kerja Waktu Tidak Tertentu (PKWTT)."
        ])}
      `)}

      ${pasal("4", `
        <div class="doc-pasal-sub">HARI KERJA DAN CUTI</div>
        ${daftar([
          "Hari kerja yang berlaku bagi Karyawan dimulai pada hari Senin sampai dengan Sabtu pada setiap minggu dalam suatu bulan, dengan detail jam kerja sebagai berikut:",
          "Senin: dimulai pada pukul 08.00 WIB sampai 17.00 WIB.",
          "Selasa – Jumat: dimulai pada pukul 08.00 WIB sampai 16.00 WIB.",
          "Sabtu: dimulai pada pukul 08.00 WIB sampai 12.00 WIB.",
          "Dalam keadaan yang dibutuhkan untuk dilakukan pekerjaan di luar jam kerja yang sudah ditentukan di atas, maka Karyawan diwajibkan untuk melakukan pekerjaan tersebut sesuai dengan perintah atasan.",
          "Karyawan berhak atas istirahat tahunan dengan perhitungan 1 (satu) hari kerja setiap bulannya atau 12 (dua belas) hari kerja secara kumulatif setiap tahunnya. Hak atas istirahat tahunan tersebut dapat Karyawan gunakan atas izin Atasan dan bagian Personalia.",
          "Karyawan dalam masa percobaan tidak berhak mendapatkan jatah cuti hingga dinyatakan lolos masa percobaan, dan jatah cuti yang belum diambil dalam masa percobaan akan diakumulasikan pada bulan selanjutnya apabila Karyawan dinyatakan lolos.",
          "Perusahaan dapat mempertimbangkan tetapi tidak wajib mengabulkan izin Karyawan untuk meninggalkan pekerjaan tanpa pembayaran upah untuk keperluan Karyawan.",
          "Karyawan berhak untuk absen pada hari kerja karena sakit yang dialaminya apabila izin ketidakhadirannya dilampirkan dengan surat keterangan sakit dari dokter, namun izin ketidakhadiran Karyawan pada hari kerja tanpa dilampirkan surat keterangan sakit dari dokter dihitung sebagai cuti tanpa upah."
        ])}
      `)}

      ${pasal("5", `
        <div class="doc-pasal-sub">UPAH DAN CARA PEMBAYARAN</div>
        ${daftar([
          `Karyawan berhak untuk menerima upah bruto dari Perusahaan setiap bulan sebesar <b>${esc(rupiah(gaji))}</b> (${esc(rupiahKata(gaji))}).`,
          "Pada kontrak pertama ini Karyawan berhak untuk didaftarkan BPJS Ketenagakerjaan.",
          "Sesuai dengan Peraturan BPJS Ketenagakerjaan, Perusahaan akan memotong sebesar 2% + 1% dari total upah bulanan yang diterima oleh Karyawan sebagaimana diatur dalam Ayat 1 Pasal ini (selanjutnya disebut sebagai “Upah”), untuk pembayaran premi Jaminan Hari Tua dan Jaminan Pensiun. Perusahaan akan membayarkan 6,24% dari Upah sebagai pembayaran premi program Jaminan Kecelakaan Kerja, Jaminan Kematian, Jaminan Hari Tua, dan Jaminan Pensiun.",
          "Karyawan berhak untuk menerima Tunjangan Hari Raya (THR) dari Perusahaan, sebagaimana telah ditentukan dalam Pasal 2 Ayat 1 Peraturan Menteri Ketenagakerjaan Nomor 6 Tahun 2016, apabila Karyawan telah bekerja selama 1 (satu) bulan atau lebih secara terus menerus; dalam hal tersebut, jumlah THR yang diterima Karyawan dihitung oleh Perusahaan secara proporsional.",
          "Apabila Karyawan telah bekerja selama 12 (dua belas) bulan secara terus menerus untuk Perusahaan, Karyawan akan menerima THR dengan jumlah sebesar 1 (satu) bulan Upah.",
          "THR akan dibayarkan paling lambat 7 (tujuh) hari sebelum jatuhnya Hari Raya Idul Fitri setiap tahunnya.",
          "Ketentuan mengenai THR tidak berlaku bagi pekerja dalam hubungan waktu tertentu yang jangka waktu kerjanya berakhir sebelum tanggal jatuhnya hari raya tersebut.",
          "Perusahaan akan memotong setiap pembayaran upah dan penghasilan Karyawan yang diterima olehnya sebagai karyawan Perusahaan untuk melakukan pembayaran Pajak Penghasilan."
        ], { html: true })}
      `)}

      ${pasal("6", `
        <div class="doc-pasal-sub">TUNJANGAN, BONUS DAN FASILITAS TAMBAHAN</div>
        ${paragraf("Tunjangan, bonus, dan fasilitas tambahan yang diberikan oleh Perusahaan kepada Karyawan tidak bersifat wajib, dan Perusahaan berhak sepenuhnya untuk mengubah atau meniadakan bentuk tunjangan, bonus, dan fasilitas tambahan yang diterima oleh Karyawan atas dasar apa pun.")}
      `)}

      ${pasal("7", `
        <div class="doc-pasal-sub">TUGAS DAN TANGGUNG JAWAB</div>
        ${paragraf("Atas diberikannya jabatan dan pekerjaan kepada Karyawan, maka Karyawan wajib untuk memenuhi tugas dan tanggung jawab sebagai berikut:")}
        ${daftar(responsibilities(doc))}
      `)}

      ${pasal("8", `
        <div class="doc-pasal-sub">SANKSI</div>
        ${daftar([
          "Bilamana Karyawan ternyata tidak memenuhi kewajiban-kewajiban tersebut di atas, Perusahaan berwenang memberikan teguran atau peringatan baik lisan maupun tulisan kepada Karyawan.",
          "Apabila Karyawan tidak mengindahkan teguran atau peringatan tersebut, maka Karyawan dapat dikenakan pemutusan hubungan kerja sebelum masa kontrak berakhir.",
          "Apabila Karyawan terlambat maka Karyawan dikenakan sanksi kedisiplinan berupa pembayaran secara cash kepada Kasir, dengan perhitungan sebagai berikut:",
          "Terlambat 1–5 menit: denda Rp 5.000 (Lima Ribu Rupiah).",
          "Terlambat lebih dari 5 menit: berlaku penambahan Rp 1.000 (Seribu Rupiah) setiap menitnya.",
          "Jika terlambat lebih dari 25 menit maka keterlambatan tersebut termasuk Cuti Setengah Hari, dan akan memotong jatah cuti tahunan Karyawan."
        ])}
      `)}

      ${pasal("9", `
        <div class="doc-pasal-sub">STATUS KETENAGAKERJAAN</div>
        ${daftar([
          "Karyawan berstatus sebagai karyawan dengan masa percobaan selama 3 (tiga) bulan.",
          "Karyawan harus mematuhi dan menaati setiap peraturan yang berlaku di Perusahaan selama terikat dalam hubungan pekerjaan dengan Perusahaan.",
          "Karyawan wajib mengikuti dan menaati seluruh petunjuk atau perintah kerja yang layak dari atasannya.",
          "Karyawan dengan segera wajib memberitahukan ketidakhadirannya kepada Atasan Karyawan dan Personalia apabila tidak hadir pada hari kerja.",
          "Jika Karyawan hendak mengakhiri Perjanjian Kerja dan mengundurkan diri sebelum jangka waktu Perjanjian berakhir, Karyawan harus memberitahukan kehendaknya tersebut kepada Perusahaan selambat-lambatnya 30 (tiga puluh) hari kalender sebelum waktu pengakhiran yang diajukan oleh Karyawan secara tertulis.",
          "Jika Karyawan tidak melakukan pemberitahuan kehendaknya untuk melakukan pengunduran diri, Perusahaan dibebaskan dari kewajiban untuk memberikan Surat Referensi Kerja kepada Karyawan.",
          "Karyawan tetap melaksanakan kewajibannya sampai dengan tanggal efektif pengunduran diri dan melakukan serah terima pekerjaan dengan Atasan Langsung atau karyawan lain yang ditunjuk Atasan Langsung untuk melakukan serah terima pekerjaan tersebut."
        ])}
      `)}

      ${pasal("10", `
        <div class="doc-pasal-sub">INFORMASI RAHASIA</div>
        ${daftar([
          "Karyawan wajib menjaga kerahasiaan semua informasi yang bersifat rahasia termasuk akan tetapi tidak terbatas pada data, keterangan berkenaan dengan klien, pelanggan, pemasok, formula, dan metode dagang yang diperolehnya atau diketahuinya baik langsung maupun tidak langsung sehubungan dengan pelaksanaan pekerjaannya di Perusahaan.",
          "Karyawan tidak berhak dan karenanya dilarang keras untuk membongkar atau memberitahukan semua data yang bersifat rahasia dalam bentuk dan karena alasan apa pun kepada pihak lain tanpa izin tertulis dari Perusahaan baik selama berlakunya jangka waktu maupun sesudah berakhirnya hubungan kerja.",
          "Ketentuan lebih rinci mengenai kewajiban Karyawan untuk menjaga informasi rahasia diatur lebih lanjut dalam lampiran Perjanjian ini atau dalam suatu perjanjian lain yang berdiri sendiri."
        ])}
      `)}

      ${pasal("11", `
        <div class="doc-pasal-sub">GANTI RUGI AKIBAT KELALAIAN</div>
        ${paragraf("Karyawan wajib mengganti setiap kerugian atau kerusakan material yang diderita oleh Perusahaan akibat kelalaian atau kesalahan dari Karyawan. Apabila Karyawan lalai atau menolak membayarkan penggantian kerugian tersebut maka Perusahaan berhak memperhitungkannya dengan memotong upah bulanan Karyawan hingga penggantian tersebut dilunaskan oleh Karyawan.")}
      `)}

      ${pasal("12", `
        <div class="doc-pasal-sub">PENGEMBALIAN BARANG MILIK PERUSAHAAN</div>
        ${daftar([
          "Setelah jangka waktu Perjanjian Kerja berakhir, Karyawan wajib untuk menyerahkan kepada Perusahaan seluruh dokumen, berkas laporan, catatan dan bahan yang berada di bawah penguasaan Karyawan, termasuk namun tidak terbatas pada semua peralatan, alat-alat dan/atau perangkat yang dipercayakan kepada Karyawan selambat-lambatnya 7 (tujuh) hari setelah Perjanjian Kerja ini berakhir.",
          "Perusahaan berhak menahan sebagian atau seluruh upah Karyawan sebagai ganti rugi barang-barang milik Perusahaan yang rusak atau hilang karena kelalaian Karyawan atau sebagai pelunasan kewajiban atau utang Karyawan kepada Perusahaan yang belum terpenuhi."
        ])}
      `)}

      ${pasal("13", `
        <div class="doc-pasal-sub">BERAKHIRNYA PERJANJIAN KERJA</div>
        ${paragraf("Perusahaan dapat mengakhiri Perjanjian Kerja ini sebelum berakhirnya jangka waktu apabila:")}
        ${daftar([
          "Karyawan meninggal dunia;",
          "Perusahaan tutup karena alasan apa pun;",
          "Karyawan melanggar ketentuan dalam Perjanjian Kerja ini dan/atau melanggar ketentuan Peraturan Perusahaan;",
          "Walaupun telah diberikan kesempatan terakhir akan tetapi Karyawan gagal dalam memenuhi tuntutan prestasi atau pelaksanaan pekerjaan yang diminta oleh Perusahaan;",
          "Karyawan yang telah melakukan kesalahan fatal dan/atau serius antara lain:",
          "Melakukan penipuan, pencurian dan penggelapan barang dan/atau teman sejawat Karyawan di Perusahaan;",
          "Memberikan keterangan palsu atau yang dipalsukan sehingga merugikan Perusahaan;",
          "Mabuk, meminum minuman keras yang memabukkan, memakai dan/atau mengedarkan narkotika, psikotropika, dan zat adiktif lainnya di lingkungan kerja;",
          "Melakukan perbuatan asusila atau melakukan perjudian di tempat kerja;",
          "Terbukti mengikuti Pinjaman Online dan Judi Online yang menyebabkan penurunan produktivitas karyawan;",
          "Menyerang, menganiaya, mengancam atau mengintimidasi petugas Perusahaan, keluarga petugas Perusahaan, atau teman sejawat di lingkungan kerja;",
          "Membujuk petugas Perusahaan atau teman sekerja untuk melakukan perbuatan yang bertentangan dengan peraturan perundang-undangan dan Peraturan Perusahaan yang berlaku;",
          "Melakukan segala bentuk tindakan yang dapat merugikan Perusahaan baik secara materiil ataupun imaterial;",
          "Dengan ceroboh atau sengaja merusak atau membiarkan dalam keadaan bahaya barang milik Perusahaan dan/atau klien Perusahaan yang menimbulkan kerugian bagi Perusahaan dan/atau klien Perusahaan;",
          "Dengan ceroboh atau sengaja membiarkan teman sekerja atau pengusaha dalam keadaan bahaya di tempat kerja;",
          "Membongkar atau membocorkan rahasia Perusahaan dan/atau klien Perusahaan atau keluarga pengusaha yang seharusnya dirahasiakan kecuali untuk kepentingan negara; atau",
          "Melakukan perbuatan lainnya di lingkungan Perusahaan yang diancam pidana penjara 5 (lima) tahun atau lebih;",
          "Karyawan absen atau mangkir 5 (lima) hari berturut-turut atau lebih tanpa alasan yang dapat diterima dan bukti yang sah, serta dipanggil sebanyak 2 (dua) kali oleh Perusahaan tetapi tidak pernah menanggapi panggilan tersebut;",
          "Karyawan diketahui memiliki catatan kejahatan atau pernah melakukan suatu tindak pidana; atau",
          "Karyawan mengalami sakit berat yang mengakibatkan Karyawan tidak dapat masuk kerja selama 6 (enam) bulan berturut-turut, tanpa adanya bukti berupa surat keterangan sakit dokter."
        ])}
        ${paragraf("Apabila hubungan kerja berakhir karena Karyawan melakukan perbuatan-perbuatan yang diatur dalam Pasal 11 Ayat 1 Huruf c, e, dan f, maka Perusahaan dibebaskan dari kewajiban untuk membayar sisa Upah yang belum diterima oleh Karyawan maupun segala bentuk kompensasi yang seharusnya diberikan sebagai konsekuensi atau diakhirinya perjanjian kerja ini, dengan mengacu kepada ketentuan-ketentuan yang diatur di dalam Peraturan Perusahaan, Undang-Undang Nomor 13 Tahun 2003 tentang Ketenagakerjaan dan peraturan perundang-undangan Republik Indonesia lainnya yang relevan.")}
      `)}

      ${pasal("14", `
        <div class="doc-pasal-sub">KETERPISAHAN</div>
        ${daftar([
          "Dalam hal suatu ketentuan yang terdapat dalam perjanjian ini dinyatakan sebagai tidak sah atau tidak dapat diberlakukan secara hukum baik secara keseluruhan maupun sebagian, maka ketidaksahan atau ketidakberlakuan tersebut hanya berkaitan pada ketentuan itu atau sebagian dari padanya saja. Sedangkan ketentuan lainnya dari Perjanjian ini akan tetap berlaku dan mempunyai kekuatan hukum secara penuh.",
          "Pada pihak selanjutnya setuju bahwa ketentuan yang tidak sah atau tidak dapat diberlakukan sebagaimana dimaksud dalam Ayat 1 Pasal ini akan diganti dengan ketentuan yang sah menurut hukum atau sejauh serta sedapat mungkin mencerminkan maksud dan tujuan dibuatnya ketentuan tersebut oleh Para Pihak."
        ])}
      `)}

      ${pasal("15", `
        <div class="doc-pasal-sub">HUKUM YANG BERLAKU</div>
        ${paragraf("Perjanjian Kerja serta lampiran-lampirannya dan setiap perubahan terkait dengan Perjanjian Kerja ini diatur dan ditafsirkan menggunakan hukum Republik Indonesia.")}
      `)}

      ${pasal("16", `
        <div class="doc-pasal-sub">PERUBAHAN DALAM PERATURAN PERUNDANG-UNDANGAN</div>
        ${paragraf("Dalam hal setelah ditandatanganinya Perjanjian Kerja ini terjadi suatu perubahan dalam peraturan perundang-undangan yang secara material dapat mendatangkan kerugian kepada salah satu pihak, maka Para Pihak sepakat untuk mengadakan perundingan kembali sehingga dapat menghilangkan atau memperkecil kerugian yang diderita oleh salah satu pihak.")}
      `)}

      ${pasal("17", `
        <div class="doc-pasal-sub">KESELURUHAN PERJANJIAN</div>
        ${daftar([
          "Perjanjian ini merupakan keseluruhan Perjanjian antara Para Pihak berkenaan dengan materi yang diperjanjikan.",
          "Perjanjian ini membatalkan dan menggantikan seluruh kesepakatan yang sebelumnya oleh Para Pihak dilakukan secara lisan maupun tulisan."
        ])}
      `)}

      ${pasal("18", `
        <div class="doc-pasal-sub">PENUTUP</div>
        ${daftar([
          "Ketentuan-ketentuan yang diatur dalam Perjanjian Kerja tidak mengurangi atau menggantikan aturan-aturan lainnya yang ditetapkan oleh Perusahaan, baik dalam Peraturan Perusahaan dan/atau peraturan serta kebijakan lain yang ditetapkan oleh Perusahaan dari waktu ke waktu.",
          "Apabila terdapat hal yang belum atau tidak cukup diatur dalam Perjanjian Kerja ini, Perusahaan akan merujuk ketentuan-ketentuan Peraturan Perusahaan atau Peraturan Perundang-undangan Republik Indonesia yang berlaku, dan/atau akan diatur secara mutatis mutandis dalam addendum, amandemen, modifikasi, atau perubahan yang terpisah namun tetap merupakan satu kesatuan dari Perjanjian Kerja ini."
        ])}
      `)}

      <p class="doc-paragraph doc-closing">Demikianlah Perjanjian ini dibuat atau kesepakatan Perusahaan dan Karyawan tanpa ada tekanan dari pihak mana pun.</p>
      <p class="doc-paragraph" style="text-align:right;">${esc(kota(doc))}, ${esc(tanggal(doc?.tanggal_surat, { fallback: "-" }))}</p>
      ${signatureDuaPihak(doc, "CV. Andela Jaya,", "Karyawan,")}
    </div>`;
}

/* =====================================================================
 * 2. ADENDUM PKWT SALES
 * ===================================================================== */
function buildAdendumPkwtSales(doc) {
  const gaji = cf(doc, "GAJI_POKOK", doc?.gaji_pokok || "");
  const tunjangan = cf(doc, "TUNJANGAN_SEWA", "");
  const sewaGaji = cf(doc, "UANG_SEWA_GAJI", "");
  const sewaTunai = cf(doc, "UANG_SEWA_TUNAI", "");
  const pkwtNo = cf(doc, "NOMOR_KONTRAK_SEBELUMNYA", "");
  const pkwtTgl = cf(doc, "TANGGAL_KONTRAK_SEBELUMNYA", "");
  const addNo = cf(doc, "NOMOR_ADENDUM_SEBELUMNYA", "");
  const addTgl = cf(doc, "TANGGAL_ADENDUM_SEBELUMNYA", "");

  return `
    <div class="aj-doc doc-official">
      ${letterheadHtml()}
      ${titleBlock("ADENDUM PERJANJIAN KERJA WAKTU TERTENTU", doc?.nomor_surat)}

      <p class="doc-paragraph">Yang bertanda tangan di bawah ini:</p>
      <table class="doc-identity-block">
        <tr><td class="lbl">Nama</td><td class="sep">:</td><td class="val">${esc(signerNama(doc))}</td></tr>
        <tr><td class="lbl">Jabatan</td><td class="sep">:</td><td class="val">${esc(signerJabatan(doc))}</td></tr>
        <tr><td class="lbl">Perusahaan</td><td class="sep">:</td><td class="val">${esc(COMPANY_NAME)}</td></tr>
        <tr><td class="lbl">Alamat</td><td class="sep">:</td><td class="val">${esc(alamatKantor(doc))}</td></tr>
      </table>
      <p class="doc-paragraph">Selanjutnya disebut sebagai <b>PIHAK PERTAMA</b>.</p>

      <table class="doc-identity-block">
        <tr><td class="lbl">Nama</td><td class="sep">:</td><td class="val">${esc(namaKaryawan(doc))}</td></tr>
        <tr><td class="lbl">Jabatan</td><td class="sep">:</td><td class="val">${esc(jabatanKaryawan(doc))}</td></tr>
        <tr><td class="lbl">Alamat</td><td class="sep">:</td><td class="val">${esc(dataAtau(doc, "ALAMAT", doc?.alamat || "-"))}</td></tr>
      </table>
      <p class="doc-paragraph">Selanjutnya disebut sebagai <b>PIHAK KEDUA</b>.</p>
      <p class="doc-paragraph">PIHAK PERTAMA dan PIHAK KEDUA yang secara bersama-sama untuk selanjutnya disebut <b>“PARA PIHAK”</b>.</p>

      <p class="doc-paragraph">PARA PIHAK sebelumnya menyatakan sebagai berikut:</p>
      ${daftar([
        `Bahwa PARA PIHAK telah membuat dan menandatangani Perjanjian Kerja Waktu Tertentu Nomor: ${pkwtNo || "-"} pada tanggal ${tanggal(pkwtTgl, { fallback: "-" })} (untuk selanjutnya disebut “PKWT”);`,
        `Bahwa PARA PIHAK telah membuat dan menandatangani Adendum Perjanjian Kerja Waktu Tertentu Nomor: ${addNo || "-"}${addTgl ? ` pada tanggal ${tanggal(addTgl)}` : ""} (untuk selanjutnya disebut “Adendum”);`,
        "Bahwa PARA PIHAK sepakat untuk melakukan perubahan ketentuan di dalam PKWT menjadi sebagaimana diatur dalam Adendum PKWT ini."
      ])}

      <p class="doc-paragraph">Oleh karenanya, dengan mempertimbangkan hal tersebut di atas PARA PIHAK sepakat untuk mengikatkan diri dalam Adendum PKWT ini, dengan syarat-syarat dan ketentuan di bawah ini:</p>

      ${pasal("3", `
        <div class="doc-pasal-sub">JANGKA WAKTU DAN PERPANJANGAN PERJANJIAN KERJA</div>
        <p class="doc-paragraph">PARA PIHAK sepakat untuk mengubah ketentuan masa periode kerja yang tercantum pada Pasal 3 tentang Jangka Waktu dan Perpanjangan Perjanjian Kerja, sehingga Pasal 3 secara keseluruhan berubah menjadi dan harus dibaca sebagai berikut:</p>
        ${daftar([
          `PIHAK PERTAMA mempekerjakan PIHAK KEDUA untuk jabatan ${jabatanKaryawan(doc)};`,
          `Posisi ini bersifat waktu tertentu dengan masa periode kerja dimulai pada tanggal ${tanggal(doc?.tanggal_mulai)} dan berakhir pada tanggal ${tanggal(doc?.tanggal_selesai)};`,
          `Lokasi kerja PIHAK KEDUA berada di wilayah ${cf(doc, "LOKASI_KERJA", doc?.cabang || kota(doc))}, tetapi PIHAK KEDUA bisa jadi perlu berpergian ke lokasi lain dalam melakukan tugasnya;`,
          "PIHAK KEDUA dapat dipindahkan ke lokasi lain dan/atau daftar jadwal kerja lainnya sesuai dengan kebijakan dan/atau kebutuhan PIHAK PERTAMA."
        ])}
      `)}

      ${pasal("5", `
        <div class="doc-pasal-sub">UPAH DAN CARA PEMBAYARAN</div>
        <p class="doc-paragraph">PARA PIHAK sepakat untuk mengubah ketentuan Tunjangan Sewa Motor yang tercantum di dalam Pasal 5 ayat 1 dan 2 tentang Upah dan Cara Pembayaran, sehingga Pasal 5 ayat 1 dan 2 secara keseluruhan berubah menjadi dan harus dibaca sebagai berikut:</p>
        ${daftar([
          `Karyawan berhak untuk menerima upah bruto dari Perusahaan setiap bulan sebesar <b>${esc(rupiah(gaji))}</b> (${esc(rupiahKata(gaji))}).`,
          `Tunjangan Sewa Motor sebesar <b>${esc(rupiah(tunjangan))}</b> (${esc(rupiahKata(tunjangan))}) dengan ketentuan sebagai berikut:`,
          "PIHAK PERTAMA memberikan fasilitas penunjang operasional kepada PIHAK KEDUA berupa Uang Sewa dan Perawatan Kendaraan (Sepeda Motor).",
          `PIHAK PERTAMA membagi menjadi 2 (dua) sistem pemberian Fasilitas Uang Sewa dan Perawatan Kendaraan; Pertama, pencairan Uang Sewa diberikan bersamaan dengan pencairan Gaji Bulanan sebesar ${esc(rupiah(sewaGaji))}; Kedua, pencairan Uang Sewa diberikan secara tunai sebesar ${esc(rupiah(sewaTunai))} yang bisa PIHAK KEDUA klaim kepada Kasir dengan memberikan bukti transaksi service motor dengan ketentuan bukti transaksi tersebut adalah bukti transaksi (nota) yang sah dikeluarkan oleh Bengkel/Penyedia Jasa perbaikan kendaraan dengan dibuktikan adanya cap/stempel yang menjelaskan logo serta nama Bengkel/Penyedia Jasa perbaikan kendaraan.`,
          "Fasilitas sebagaimana dimaksud bukan merupakan komponen Upah, melainkan tunjangan operasional bersyarat. PIHAK KEDUA wajib memastikan kendaraan miliknya selalu dalam kondisi prima, terawat, dan layak jalan.",
          "Pencairan fasilitas ini akan dievaluasi secara berkala. PIHAK PERTAMA berhak penuh untuk menunda atau tidak mencairkan fasilitas sewa dan perawatan kendaraan apabila kendaraan operasional yang digunakan PIHAK KEDUA sering mengalami kerusakan atau mogok sehingga mengganggu kinerja dan mengakibatkan tidak tercapainya target serta menimbulkan ketidakhadiran PIHAK KEDUA.",
          `Pada kondisi dimana Uang Sewa dan Perawatan Kendaraan yang diberikan tunai dengan nominal ${esc(rupiah(sewaTunai))} yang tersebut di atas tidak dipergunakan oleh PIHAK KEDUA dan hingga akhir tahun berjalan masih tersedia saldo tersisa, maka sisa saldo Uang Sewa dan Perawatan Kendaraan tersebut akan dikembalikan kepada PIHAK KEDUA.`
        ], { html: true })}
      `)}

      ${pasal("18", `
        <div class="doc-pasal-sub">LAIN-LAIN</div>
        <p class="doc-paragraph">PARA PIHAK sepakat untuk menambahkan ketentuan Lain-lain yang tercantum di dalam Adendum Perjanjian Kerja Waktu Tertentu, sehingga Pasal 18 ini selanjutnya secara keseluruhan menjadi dan harus dibaca sebagai berikut:</p>
        ${daftar([
          "PERJANJIAN ini dapat diputus oleh PERUSAHAAN sewaktu-waktu karena KARYAWAN melakukan kesalahan mendesak sesuai Peraturan Perusahaan dan kesalahan lain dalam bentuk apa pun yang menurut pertimbangan PERUSAHAAN dapat dilakukan pengakhiran hubungan kerja termasuk namun tidak terbatas pada pelanggaran Kode Etik Perusahaan, dan KARYAWAN hanya mendapatkan sisa upah dan uang penggantian hak yang masih tersisa, sesuai dengan ketentuan ketenagakerjaan yang berlaku serta melepaskan haknya untuk melakukan gugatan atau pencatatan perselisihan di Pengadilan Negeri atau Pengadilan Hubungan Industrial.",
          "Memperhatikan kualifikasi skala usaha Perusahaan, serta mengacu pada ketentuan Pasal 61A Undang-Undang Nomor 11 Tahun 2020 tentang Cipta Kerja jo. Pasal 16 Peraturan Pemerintah Nomor 35 Tahun 2021 yang memberikan pengecualian terkait besaran uang kompensasi bagi usaha mikro dan kecil, maka PARA PIHAK secara sadar, sukarela, dan tanpa paksaan dari pihak mana pun sepakat bahwa besaran Uang Kompensasi pengakhiran masa kerja ditetapkan dengan formula perhitungan: (Masa Kerja / 12) x 50% (Lima Puluh Persen) dari Gaji Pokok.",
          "PIHAK KEDUA dengan ini menyatakan menerima besaran perhitungan kompensasi tersebut sebagai kesepakatan yang sah dan mengikat, serta melepaskan haknya untuk menuntut sisa kekurangan maupun perhitungan uang kompensasi dalam bentuk atau nilai lain kepada PIHAK PERTAMA di kemudian hari.",
          "Bagi Karyawan yang tidak memenuhi kewajibannya dalam bekerja atau tidak masuk kerja dengan alasan yang tidak dibenarkan menurut ketentuan ketenagakerjaan, maka PERUSAHAAN tidak akan membayar upah sebagai konsekuensinya (No Work No Pay).",
          "Hal-hal yang belum diatur dalam PERJANJIAN ini akan merujuk pada Peraturan Perusahaan dan ketentuan perundang-undangan yang berlaku, dimana setiap perselisihan yang mungkin timbul terkait PERJANJIAN ini akan diselesaikan PARA PIHAK secara musyawarah.",
          "Ketentuan-ketentuan yang menyertai PERJANJIAN ini di kemudian hari merupakan satu kesatuan dan tidak terpisahkan serta mempunyai kekuatan hukum yang sama dengan PERJANJIAN ini.",
          "Perjanjian Kerja ini tidak dapat ditarik kembali dan/atau diubah, kecuali atas persetujuan tertulis dari kedua belah pihak.",
          "Perubahan dan/atau tambahan berkenaan dengan keterangan dan syarat dalam Perjanjian Kerja ini hanya berlaku secara sah apabila perubahan atau tambahan itu dibuat secara tertulis serta ditandatangani oleh kedua belah pihak.",
          `Adendum PKWT ini merupakan satu kesatuan dan tidak terpisahkan dengan PKWT yang dibuat dan telah disepakati tertanggal ${tanggal(pkwtTgl, { fallback: "-" })}.`,
          "Segala syarat dan ketentuan yang ditetapkan dalam Perjanjian tetap berlaku dan mengikat kepada PARA PIHAK, dan Adendum ini merupakan satu kesatuan dan merupakan bagian tidak terpisahkan dari perjanjian."
        ])}
      `)}

      <p class="doc-paragraph">Demikian Adendum PKWT ini dibuat. Adendum PKWT ini berlaku pada Tanggal Efektif dan dapat ditandatangani dalam beberapa rangkap, yang masing-masing merupakan satu kesatuan yang tidak dapat dipisahkan. Penandatanganan, pemindaian (scan), dan/atau transmisi secara elektronik serta tanda tangan elektronik atas Adendum PKWT ini akan dianggap sebagai tanda tangan yang sah serta memiliki kekuatan hukum yang mengikat.</p>
      <p class="doc-paragraph">Dalam hal Perjanjian ini ditandatangani dengan tanda tangan elektronik yang menjadikan Perjanjian ini belum disertai dengan pembayaran bea materai, apabila di kemudian hari terdapat keadaan dan/atau kepentingan yang mengharuskan untuk dilakukan pembayaran bea materai, maka atas Perjanjian ini dapat dilakukan pemateraian kemudian sesuai dengan tata cara yang diatur dalam ketentuan peraturan perundang-undangan yang berlaku.</p>

      <p class="doc-paragraph" style="text-align:right;">Ditetapkan di ${esc(kota(doc))}, pada tanggal ${esc(tanggal(doc?.tanggal_surat))}</p>
      ${signatureDuaPihak(doc, "PIHAK PERTAMA,", "PIHAK KEDUA,")}
    </div>`;
}

/* =====================================================================
 * 3. PERPANJANGAN PKWTT
 * ===================================================================== */
function buildPerpanjanganPkwtt(doc) {
  const priorNo = cf(doc, "NOMOR_KONTRAK_SEBELUMNYA", "");
  const priorDate = cf(doc, "TANGGAL_KONTRAK_SEBELUMNYA", "");
  const skNo = cf(doc, "NOMOR_SK", "");
  const skTgl = cf(doc, "TANGGAL_SK", "");

  return `
    <div class="aj-doc doc-official">
      ${letterheadHtml()}
      ${titleBlock("SURAT PERJANJIAN KERJA WAKTU TIDAK TERTENTU", doc?.nomor_surat)}

      <p class="doc-paragraph">Yang bertanda tangan di bawah ini:</p>
      <table class="doc-identity-block">
        <tr><td class="lbl">Nama</td><td class="sep">:</td><td class="val">${esc(signerNama(doc))}</td></tr>
        <tr><td class="lbl">Jabatan</td><td class="sep">:</td><td class="val">${esc(signerJabatan(doc))}</td></tr>
        <tr><td class="lbl">Perusahaan</td><td class="sep">:</td><td class="val">${esc(COMPANY_NAME)}</td></tr>
        <tr><td class="lbl">Alamat</td><td class="sep">:</td><td class="val">${esc(alamatKantor(doc))}</td></tr>
      </table>
      <p class="doc-paragraph">Selanjutnya disebut sebagai <b>PIHAK PERTAMA</b>.</p>

      <table class="doc-identity-block">
        <tr><td class="lbl">Nama</td><td class="sep">:</td><td class="val">${esc(namaKaryawan(doc))}</td></tr>
        <tr><td class="lbl">Jabatan</td><td class="sep">:</td><td class="val">${esc(jabatanKaryawan(doc))}</td></tr>
        <tr><td class="lbl">Alamat</td><td class="sep">:</td><td class="val">${esc(dataAtau(doc, "ALAMAT", doc?.alamat || "-"))}</td></tr>
      </table>
      <p class="doc-paragraph">Selanjutnya disebut sebagai <b>PIHAK KEDUA</b>.</p>

      <p class="doc-paragraph">PIHAK PERTAMA dan PIHAK KEDUA dengan ini sepakat untuk melakukan perpanjangan kontrak kerja dengan ketentuan sebagai berikut:</p>

      <div class="doc-section">
        <h2>1. Perpanjangan Kontrak</h2>
        <p class="doc-paragraph">PIHAK PERTAMA dan PIHAK KEDUA sepakat untuk merubah status karyawan dari yang sebelumnya sebagai karyawan dengan perjanjian Probation (masa percobaan) menjadi Karyawan Tetap dengan status PKWTT (Perjanjian Kerja Waktu Tidak Tertentu) sesuai dengan Surat Keputusan Pengangkatan Karyawan Tetap No. <b>${esc(skNo || "-")}</b>${skTgl ? ` tanggal <b>${esc(tanggal(skTgl))}</b>` : ""}.</p>
      </div>

      <div class="doc-section">
        <h2>2. Ruang Lingkup Kerja</h2>
        <p class="doc-paragraph">Ruang lingkup kerja PIHAK KEDUA tetap sesuai dengan perjanjian kerja sebelumnya tanpa ada perubahan.</p>
      </div>

      <div class="doc-section">
        <h2>3. Kewajiban Karyawan</h2>
        <p class="doc-paragraph">Kewajiban karyawan sebagai karyawan dengan jabatan <b>${esc(jabatanKaryawan(doc))}</b> tetap sesuai dengan perjanjian kerja sebelumnya tanpa adanya perubahan.</p>
      </div>

      <div class="doc-section">
        <h2>4. Ketentuan Lainnya</h2>
        <ol class="doc-list" type="1">
          <li>Seluruh ketentuan dan syarat-syarat yang tercantum dalam perjanjian kerja sebelumnya${priorNo ? ` Nomor: <b>${esc(priorNo)}</b>` : ""}${priorDate ? ` yang ditandatangani pada tanggal <b>${esc(tanggal(priorDate))}</b>` : ""} tetap berlaku dan mengikat bagi kedua belah pihak.</li>
          <li>Perjanjian Kerja ini akan direview setiap periode oleh atasan dan tim HRD sesuai dengan kondisi performance kerja karyawan.</li>
          <li>Surat Perjanjian Kerja Waktu Tidak Tertentu ini merupakan bagian yang tidak terpisahkan dari perjanjian kerja sebelumnya dan harus dibaca serta dipahami sebagai satu kesatuan.</li>
        </ol>
      </div>

      <div class="doc-section">
        <h2>5. Penutup</h2>
        <ol class="doc-list" type="1">
          <li>Ketentuan-ketentuan yang diatur dalam Perjanjian Kerja tidak mengurangi atau menggantikan aturan-aturan lainnya yang ditetapkan oleh Perusahaan, baik dalam Peraturan Perusahaan dan/atau peraturan serta kebijakan lain yang ditetapkan oleh Perusahaan dari waktu ke waktu.</li>
          <li>Apabila terdapat hal yang belum atau tidak cukup diatur dalam Perjanjian Kerja ini, Perusahaan akan merujuk ketentuan-ketentuan Peraturan Perusahaan atau Peraturan Perundang-undangan Republik Indonesia yang berlaku, dan/atau akan diatur secara mutatis mutandis dalam addendum, amandemen, modifikasi, atau perubahan yang terpisah namun tetap merupakan satu kesatuan dari Perjanjian Kerja ini.</li>
        </ol>
      </div>

      <p class="doc-paragraph doc-closing">Demikianlah Perjanjian ini dibuat atau kesepakatan Perusahaan dan Karyawan tanpa ada tekanan dari pihak mana pun.</p>
      <p class="doc-paragraph" style="text-align:right;">Ditetapkan di ${esc(kota(doc))}, pada tanggal ${esc(tanggal(doc?.tanggal_surat))}</p>
      ${signatureDuaPihak(doc, "PIHAK PERTAMA,", "PIHAK KEDUA,")}
    </div>`;
}

/* =====================================================================
 * 4. SK PENGANGKATAN KARYAWAN TETAP
 * ===================================================================== */
function buildSkPengangkatan(doc) {
  const tglEfektif = doc?.tanggal_mulai || doc?.tanggal_surat;
  const kotaSk = cf(doc, "KOTA", kota(doc));
  const ttdNama = cf(doc, "ATASAN_LANGSUNG", cf(doc, "PIHAK1_NAMA", "Branch Manager"));
  const ttdJabatan = cf(doc, "ATASAN_JABATAN", "Branch Manager");
  const signatureUrl = doc?.tanda_tangan_url ? String(doc.tanda_tangan_url) : "";
  const visual = signatureUrl
    ? `<img src="${esc(signatureUrl)}" alt="Tanda tangan" style="display:inline-block;max-height:58px;max-width:190px;object-fit:contain;" />`
    : "";

  return `
    <div class="aj-doc doc-official">
      ${letterheadHtml()}
      <div class="aj-title doc-title-official">
        <h1 style="text-decoration:none;">SURAT KEPUTUSAN</h1>
        <h1 style="margin-top:2px;">PENGANGKATAN KARYAWAN TETAP</h1>
        <div class="aj-number">No: ${esc(doc?.nomor_surat || "-")}</div>
        <div class="doc-company-line">${esc(COMPANY_NAME)}</div>
      </div>

      <table class="doc-consideration">
        <tr>
          <td class="label">Menimbang</td>
          <td class="sep">:</td>
          <td>
            <div>a. Kebutuhan Perusahaan guna mencapai tujuan operasional untuk meningkatkan efektivitas dan efisiensi kerja secara terpadu.</div>
            <div>b. Perlu adanya surat keputusan secara tertulis sebagai pedoman bersama.</div>
          </td>
        </tr>
        <tr>
          <td class="label">Mengingat</td>
          <td class="sep">:</td>
          <td>
            <div>a. Hasil Evaluasi Masa Percobaan.</div>
            <div>b. Peraturan Perusahaan ${esc(COMPANY_NAME)}.</div>
          </td>
        </tr>
        <tr>
          <td class="label">Memperhatikan</td>
          <td class="sep">:</td>
          <td>
            <div>a. Kebijakan perusahaan mengenai perencanaan pengembangan sumber daya manusia ${esc(COMPANY_NAME)}.</div>
          </td>
        </tr>
      </table>

      <div class="doc-memutuskan">MEMUTUSKAN</div>
      <p class="doc-paragraph">Menetapkan dan mengangkat saudara:</p>

      <table class="doc-identity-block">
        <tr><td class="lbl">Nama Lengkap</td><td class="sep">:</td><td class="val">${esc(namaKaryawan(doc))}</td></tr>
        <tr><td class="lbl">No. KTP</td><td class="sep">:</td><td class="val">${esc(ktpKaryawan(doc))}</td></tr>
        <tr><td class="lbl">Alamat Lengkap</td><td class="sep">:</td><td class="val">${esc(dataAtau(doc, "ALAMAT", doc?.alamat || "-"))}</td></tr>
      </table>

      <p class="doc-paragraph">sebagai <b>Karyawan Tetap</b> terhitung mulai tanggal <b>${esc(tanggal(tglEfektif))}</b> dan menempati posisi sebagai <b>${esc(jabatanKaryawan(doc))}</b>, namun akan dipindahkan posisi sesuai dengan penilaian atasan dan kebutuhan perusahaan yang akan ditetapkan oleh surat keputusan.</p>

      <p class="doc-paragraph">Hal-hal yang berkaitan dengan hak dan kewajiban karyawan, hubungan kerja sama, dan tata tertib diatur dalam perjanjian kerja dan Peraturan Perusahaan.</p>
      <p class="doc-paragraph">Kami berharap keputusan pengangkatan saudara menjadi karyawan tetap dapat memberikan dampak yang baik bagi kemajuan perusahaan. Selamat berkarya.</p>

      <div class="doc-sk-place">
        <div>Ditetapkan di : ${esc(kotaSk)}</div>
        <div>Pada Tanggal : ${esc(tanggal(doc?.tanggal_surat))}</div>
      </div>

      <div class="doc-signature-one">
        <div class="doc-sign-role">${esc(COMPANY_NAME)}</div>
        <div class="doc-sign-space">${visual}</div>
        <div class="doc-sign-name">${esc(ttdNama)}</div>
        <div class="doc-sign-sub">${esc(ttdJabatan)}</div>
      </div>
    </div>`;
}

/* =====================================================================
 * 5. SURAT KOMITMEN KERJA
 * ===================================================================== */
function buildKomitmenKerja(doc) {
  const masa = cf(doc, "MASA_PROBATION", "3 (tiga) bulan");
  const mulai = doc?.tanggal_mulai;

  return `
    <div class="aj-doc doc-official">
      ${letterheadHtml()}
      ${titleBlock("SURAT KOMITMEN KERJA", doc?.nomor_surat)}

      <p class="doc-paragraph">Saya yang bertanda tangan di bawah ini:</p>
      <table class="doc-identity-block">
        <tr><td class="lbl">Nama</td><td class="sep">:</td><td class="val">${esc(namaKaryawan(doc))}</td></tr>
        <tr><td class="lbl">Tempat, Tanggal Lahir</td><td class="sep">:</td><td class="val">${esc(dataAtau(doc, "TEMPAT_LAHIR", "-"))}, ${esc(tanggal(dataAtau(doc, "TANGGAL_LAHIR", ""), { fallback: "-" }))}</td></tr>
        <tr><td class="lbl">Alamat</td><td class="sep">:</td><td class="val">${esc(dataAtau(doc, "ALAMAT", doc?.alamat || "-"))}</td></tr>
        <tr><td class="lbl">Nomor KTP</td><td class="sep">:</td><td class="val">${esc(ktpKaryawan(doc))}</td></tr>
      </table>

      <p class="doc-paragraph">Dengan ini menyatakan bahwa saya bersedia dan berkomitmen untuk bekerja di ${esc(COMPANY_NAME)} sekurang-kurangnya selama masa probation <b>${esc(masa)}</b> sejak tanggal mulai bekerja${mulai ? `, yaitu ${esc(tanggal(mulai, { withDay: true }))}` : ""}.</p>
      <p class="doc-paragraph">Saya memahami bahwa selama masa probation tersebut:</p>
      ${daftar([
        "Biaya Medical Check Up (MCU) untuk keperluan rekrutmen sepenuhnya ditanggung oleh perusahaan.",
        `Apabila saya mengundurkan diri secara sepihak sebelum masa probation ${masa} berakhir, maka saya bersedia mengganti biaya MCU sesuai nominal invoice dari laboratorium tempat pemeriksaan dilakukan, sebagai bentuk pertanggungjawaban pribadi terhadap biaya yang telah dikeluarkan oleh perusahaan.`,
        "Penggantian biaya tersebut wajib diselesaikan maksimal 7 (tujuh) hari kerja setelah tanggal pengunduran diri disetujui/dinyatakan efektif."
      ])}

      <p class="doc-paragraph">Demikian surat pernyataan ini saya buat dengan sadar, tanpa paksaan dari pihak manapun, sebagai bentuk komitmen pribadi saya terhadap pekerjaan yang saya emban di ${esc(COMPANY_NAME)}.</p>

      <div class="doc-signature-one">
        <div class="doc-sign-place">${esc(kota(doc))}, ${esc(tanggal(doc?.tanggal_surat))}</div>
        <div class="doc-sign-role">Yang Membuat Pernyataan,</div>
        <div class="doc-sign-space">${doc?.tanda_tangan_url ? `<img src="${esc(doc.tanda_tangan_url)}" alt="Tanda tangan" style="display:inline-block;max-height:58px;max-width:190px;object-fit:contain;" />` : ""}</div>
        <div class="doc-sign-name">${esc(namaKaryawan(doc))}</div>
        <div class="doc-sign-sub">${esc(jabatanKaryawan(doc))}</div>
      </div>
    </div>`;
}

/* =====================================================================
 * 6. SURAT PERINGATAN (SP-1 / SP-2 / SP-3)
 * ===================================================================== */
function spMeta(type) {
  if (type === "SP_2") {
    return {
      urutan: "kedua",
      label: "Kedua",
      next: "Surat Peringatan Ketiga (SP-3)",
      period: "6 (enam) bulan",
      consequence: "Apabila dalam kurun waktu tersebut Saudara/i kembali melakukan tindakan pelanggaran, maka Saudara/i akan mendapatkan Surat Peringatan Ketiga (SP-3) sebagai peringatan terakhir."
    };
  }
  if (type === "SP_3") {
    return {
      urutan: "ketiga",
      label: "Ketiga",
      next: "Pemutusan Hubungan Kerja (PHK)",
      period: "6 (enam) bulan",
      consequence: "Apabila dalam kurun waktu tersebut Saudara/i kembali melakukan tindakan pelanggaran, maka perusahaan akan memproses Pemutusan Hubungan Kerja (PHK) sesuai ketentuan Peraturan Perusahaan dan peraturan perundang-undangan yang berlaku."
    };
  }
  return {
    urutan: "pertama",
    label: "Pertama",
    next: "Surat Peringatan Kedua (SP-2)",
    period: "6 (enam) bulan",
    consequence: "Apabila dalam kurun waktu tersebut Saudara/i kembali melakukan tindakan pelanggaran, maka Saudara/i akan mendapatkan Surat Peringatan Kedua (SP-2)."
  };
}

function buildSuratPeringatan(doc, type) {
  const meta = spMeta(type);
  const lampiran = cf(doc, "LAMPIRAN", "1 (satu) berkas");
  const perihal = cf(doc, "PERIHAL", `Surat Peringatan ${meta.label} (${String(type).replace("_", "-")})`);
  const masa = cf(doc, "MASA_BERLAKU", meta.period);
  const pelanggaranRaw = cf(doc, "PELANGGARAN", doc?.alasan_sp || "");
  const dampakRaw = cf(doc, "DAMPAK", "");
  const pelanggaran = pelanggaranRaw
    ? String(pelanggaranRaw).split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    : ["Pelanggaran terhadap prosedur operasional dan/atau Peraturan Perusahaan yang berlaku."];
  const dampak = dampakRaw
    ? String(dampakRaw).split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    : [
      "Menimbulkan risiko administrasi dan keuangan perusahaan.",
      "Melemahkan sistem pengendalian internal."
    ];

  const ketentuan = [
    `Surat peringatan ${meta.urutan} berlaku untuk ${masa} ke depan sejak diterbitkan.`,
    `Apabila dalam kurun waktu ${masa} ke depan sejak tanggal diterbitkan surat peringatan ${meta.urutan} Saudara/i tidak melakukan tindakan pelanggaran yang menjadi dasar atas diterbitkannya surat peringatan ini, maka surat peringatan ${meta.urutan} Saudara/i dinyatakan sudah tidak berlaku.`,
    meta.consequence
  ];

  const signatureUrl = doc?.tanda_tangan_url ? String(doc.tanda_tangan_url) : "";
  const employeeVisual = signatureUrl
    ? `<img src="${esc(signatureUrl)}" alt="Tanda tangan ${esc(namaKaryawan(doc))}" style="display:inline-block;max-height:52px;max-width:150px;object-fit:contain;" />`
    : "";

  return `
    <div class="aj-doc doc-official">
      ${letterheadHtml()}
      ${titleBlock("SURAT PERINGATAN", doc?.nomor_surat)}

      <table class="doc-meta">
        <tr><td class="lbl">Lampiran</td><td class="sep">:</td><td>${esc(lampiran)}</td></tr>
        <tr><td class="lbl">Perihal</td><td class="sep">:</td><td><b>${esc(perihal)}</b></td></tr>
      </table>

      <p class="doc-paragraph">Surat peringatan ini dibuat oleh perusahaan dan ditujukan kepada:</p>
      <table class="doc-identity-block">
        <tr><td class="lbl">Nama</td><td class="sep">:</td><td class="val">${esc(namaKaryawan(doc))}</td></tr>
        <tr><td class="lbl">Jabatan</td><td class="sep">:</td><td class="val">${esc(jabatanKaryawan(doc))}</td></tr>
      </table>

      <p class="doc-paragraph">Sehubungan dengan hasil evaluasi dan laporan yang diterima manajemen, ditemukan adanya ketidaksesuaian prosedur dalam pelaksanaan kegiatan operasional yang Saudara/i lakukan.</p>
      <p class="doc-paragraph">Adapun pelanggaran yang dimaksud adalah:</p>
      ${daftar(pelanggaran)}

      <p class="doc-paragraph">Tindakan tersebut tidak sesuai dengan prosedur operasional dan kebijakan perusahaan yang berlaku, serta berpotensi:</p>
      ${daftar(dampak)}

      <p class="doc-paragraph">Sehubungan dengan hal tersebut di atas, maka dengan ini perusahaan memberikan <b>Surat Peringatan ${esc(meta.label)}</b> dengan ketentuan sebagai berikut:</p>
      ${daftar(ketentuan)}

      <p class="doc-paragraph">Demikian Surat Peringatan ini disampaikan untuk menjadi perhatian dan dilaksanakan sebagaimana mestinya.</p>

      <div class="doc-sp-date">${esc(kota(doc))}, ${esc(tanggal(doc?.tanggal_surat))}</div>
      <table class="doc-signature-3">
        <tr>
          <td>
            <div class="doc-sign-role">Yang Menerima,</div>
            <div class="doc-sign-space">${employeeVisual}</div>
            <div class="doc-sign-name">${esc(namaKaryawan(doc))}</div>
            <div class="doc-sign-sub">${esc(jabatanKaryawan(doc))}</div>
          </td>
          <td>
            <div class="doc-sign-role">Mengetahui,</div>
            <div class="doc-sign-space"></div>
            <div class="doc-sign-name">${esc(signerNama(doc))}</div>
            <div class="doc-sign-sub">${esc(signerJabatan(doc))}</div>
          </td>
          <td>
            <div class="doc-sign-role">Menyetujui,</div>
            <div class="doc-sign-space"></div>
            <div class="doc-sign-name">${esc(atasanNama(doc))}</div>
            <div class="doc-sign-sub">${esc(atasanJabatan(doc))}</div>
          </td>
        </tr>
      </table>
    </div>`;
}

/* =====================================================================
 * FIELD SCHEMA UNTUK EDITOR
 * ===================================================================== */
const SP_FIELDS = [
  { key: "LAMPIRAN", label: "Lampiran", type: "text", placeholder: "1 (satu) berkas" },
  { key: "PERIHAL", label: "Perihal", type: "text", placeholder: "Surat Peringatan Kesatu (SP-1)" },
  { key: "MASA_BERLAKU", label: "Masa Berlaku SP", type: "text", placeholder: "6 (enam) bulan" },
  { key: "PELANGGARAN", label: "Rincian Pelanggaran (satu baris = satu poin)", type: "textarea", full: true, placeholder: "Tuliskan pelanggaran, satu poin per baris..." },
  { key: "DAMPAK", label: "Potensi Dampak (satu baris = satu poin)", type: "textarea", full: true, placeholder: "Tuliskan dampak, satu poin per baris..." },
  { key: "ATASAN_LANGSUNG", label: "Nama Atasan / Penyetuju", type: "text" },
  { key: "ATASAN_JABATAN", label: "Jabatan Atasan / Penyetuju", type: "text" },
  { key: "PIHAK1_NAMA", label: "Nama HRD / Mengetahui", type: "text" },
  { key: "PIHAK1_JABATAN", label: "Jabatan HRD / Mengetahui", type: "text" }
];

const OFFICIAL_FIELD_SCHEMA = {
  KONTRAK_PKWT: [
    { key: "TEMPAT_LAHIR", label: "Tempat Lahir", type: "text" },
    { key: "TANGGAL_LAHIR", label: "Tanggal Lahir", type: "date" },
    { key: "JENIS_KELAMIN", label: "Jenis Kelamin", type: "select", options: ["LAKI-LAKI", "PEREMPUAN"] },
    { key: "ATASAN_LANGSUNG", label: "Nama Atasan Langsung", type: "text" },
    { key: "ATASAN_JABATAN", label: "Jabatan Atasan Langsung", type: "text" },
    { key: "LOKASI_KERJA", label: "Lokasi Kerja", type: "text" },
    { key: "TANGGUNG_JAWAB", label: "Tugas & Tanggung Jawab (satu baris = satu poin)", type: "textarea", full: true, placeholder: "Kosongkan untuk memakai daftar standar sesuai jabatan..." },
    { key: "PIHAK1_NAMA", label: "Nama Penandatangan Perusahaan", type: "text" },
    { key: "PIHAK1_JABATAN", label: "Jabatan Penandatangan", type: "text" }
  ],
  ADENDUM_PKWT_SALES: [
    { key: "NOMOR_KONTRAK_SEBELUMNYA", label: "No. PKWT Sebelumnya", type: "text" },
    { key: "TANGGAL_KONTRAK_SEBELUMNYA", label: "Tanggal PKWT Sebelumnya", type: "date" },
    { key: "NOMOR_ADENDUM_SEBELUMNYA", label: "No. Adendum Sebelumnya", type: "text" },
    { key: "TANGGAL_ADENDUM_SEBELUMNYA", label: "Tanggal Adendum Sebelumnya", type: "date" },
    { key: "LOKASI_KERJA", label: "Lokasi Kerja", type: "text" },
    { key: "TUNJANGAN_SEWA", label: "Tunjangan Sewa Motor", type: "text" },
    { key: "UANG_SEWA_GAJI", label: "Sewa via Gaji", type: "text" },
    { key: "UANG_SEWA_TUNAI", label: "Sewa Tunai", type: "text" },
    { key: "PIHAK1_NAMA", label: "Nama Pihak Pertama", type: "text" },
    { key: "PIHAK1_JABATAN", label: "Jabatan Pihak Pertama", type: "text" }
  ],
  PERPANJANGAN_PKWTT: [
    { key: "NOMOR_SK", label: "No. SK Pengangkatan", type: "text" },
    { key: "TANGGAL_SK", label: "Tanggal SK Pengangkatan", type: "date" },
    { key: "NOMOR_KONTRAK_SEBELUMNYA", label: "No. Perjanjian Sebelumnya (opsional)", type: "text" },
    { key: "TANGGAL_KONTRAK_SEBELUMNYA", label: "Tanggal Perjanjian Sebelumnya", type: "date" },
    { key: "LOKASI_KERJA", label: "Lokasi Kerja", type: "text" },
    { key: "PIHAK1_NAMA", label: "Nama Pihak Pertama", type: "text" },
    { key: "PIHAK1_JABATAN", label: "Jabatan Pihak Pertama", type: "text" }
  ],
  SK_PENGANGKATAN: [
    { key: "NO_KTP", label: "No. KTP", type: "text" },
    { key: "ALAMAT", label: "Alamat Lengkap", type: "textarea", full: true },
    { key: "KOTA", label: "Kota Penetapan", type: "text" },
    { key: "ATASAN_LANGSUNG", label: "Nama Penandatangan", type: "text" },
    { key: "ATASAN_JABATAN", label: "Jabatan Penandatangan", type: "text" }
  ],
  KOMITMEN_KERJA: [
    { key: "TEMPAT_LAHIR", label: "Tempat Lahir", type: "text" },
    { key: "TANGGAL_LAHIR", label: "Tanggal Lahir", type: "date" },
    { key: "ALAMAT", label: "Alamat Lengkap", type: "textarea", full: true },
    { key: "NO_KTP", label: "No. KTP", type: "text" },
    { key: "MASA_PROBATION", label: "Lama Masa Probation", type: "text", placeholder: "3 (tiga) bulan" }
  ],
  SP_1: SP_FIELDS,
  SP_2: SP_FIELDS,
  SP_3: SP_FIELDS
};

export function isOfficialDocType(type) {
  return Boolean(OFFICIAL_DOC_TYPES[String(type || "").toUpperCase()]);
}

export function officialDocMeta(type) {
  return OFFICIAL_DOC_TYPES[String(type || "").toUpperCase()] || null;
}

export function officialDocTitle(type) {
  return officialDocMeta(type)?.title || "DOKUMEN RESMI HRD";
}

export function officialDocCategory(type) {
  return officialDocMeta(type)?.category || "KUSTOM";
}

export function officialFieldSchema(type) {
  return OFFICIAL_FIELD_SCHEMA[String(type || "").toUpperCase()] || [];
}

function pilihKota(cabang) {
  return String(cabang || "").toLowerCase().includes("malang") ? "Malang" : "Cirebon";
}

function jabatanSigner(session) {
  const role = String(session?.role || "").toUpperCase();
  if (/BRANCH MANAGER|KEPALA CABANG/.test(role)) return "Branch Manager";
  if (/HRGA|HRD|SUPERADMIN/.test(role)) return "HRGA";
  return session?.jabatan || "HRD";
}

function ktpDari(emp) {
  const candidates = [emp?.nik_ktp, emp?.no_ktp, emp?.ktp, emp?.nik_e_ktp, emp?.no_e_ktp];
  const direct = candidates.find(value => value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim() !== "-");
  if (direct) return String(direct).trim();
  const nik = String(emp?.nik || "").trim();
  return /^\d{16}$/.test(nik) ? nik : "";
}

export function officialFieldDefaults(type, employee, session) {
  const emp = employee || {};
  const cab = emp.cabang_penempatan || emp.cabang || "";
  const city = pilihKota(cab || emp.alamat || emp.alamat_domisili || "");
  const ktp = ktpDari(emp);
  const gaji = angka(emp.gaji_pokok) ? rupiah(emp.gaji_pokok) : "";

  const common = {
    PIHAK1_NAMA: session?.nama || "IPAN MAULANA",
    PIHAK1_JABATAN: jabatanSigner(session),
    ATASAN_LANGSUNG: emp.atasan || emp.atasan_langsung || emp.nama_atasan || "",
    ATASAN_JABATAN: "",
    TEMPAT_LAHIR: emp.tempat_lahir || city,
    TANGGAL_LAHIR: isoDate(emp.tanggal_lahir),
    JENIS_KELAMIN: emp.jenis_kelamin || "",
    NO_KTP: ktp,
    ALAMAT: emp.alamat || emp.alamat_domisili || "",
    GAJI_POKOK: gaji,
    LOKASI_KERJA: cab || city,
    KOTA: city,
    LAMPIRAN: "1 (satu) berkas",
    MASA_BERLAKU: "6 (enam) bulan",
    MASA_PROBATION: "3 (tiga) bulan",
    TUNJANGAN_SEWA: "Rp 300.000",
    UANG_SEWA_GAJI: "Rp 200.000",
    UANG_SEWA_TUNAI: "Rp 100.000"
  };

  const t = String(type || "").toUpperCase();
  if (t === "SP_1") {
    common.PERIHAL = "Surat Peringatan Kesatu (SP-1)";
    common.ATASAN_JABATAN = "Atasan Langsung";
  } else if (t === "SP_2") {
    common.PERIHAL = "Surat Peringatan Kedua (SP-2)";
    common.ATASAN_JABATAN = "Atasan Langsung";
  } else if (t === "SP_3") {
    common.PERIHAL = "Surat Peringatan Ketiga (SP-3)";
    common.ATASAN_JABATAN = "Atasan Langsung";
  } else if (t === "SK_PENGANGKATAN") {
    common.ATASAN_LANGSUNG = emp.atasan || emp.atasan_langsung || session?.nama || "Branch Manager";
    common.ATASAN_JABATAN = "Branch Manager";
    common.KOTA = city;
  } else if (t === "PERPANJANGAN_PKWTT") {
    if (city === "Malang" && !common.ATASAN_LANGSUNG) {
      common.ATASAN_LANGSUNG = "Yudin Ismana";
      common.ATASAN_JABATAN = "Branch Manager";
    }
  } else if (t === "ADENDUM_PKWT_SALES") {
    common.TUNJANGAN_SEWA = "Rp 300.000";
  }

  return common;
}

/**
 * Bangun HTML dokumen resmi. Mengembalikan null untuk tipe non-resmi.
 */
export function buildOfficialDocument(doc) {
  const type = String(doc?.template_type || "").toUpperCase();
  if (!isOfficialDocType(type)) return null;
  if (type === "KONTRAK_PKWT") return buildPerjanjianKerja(doc);
  if (type === "ADENDUM_PKWT_SALES") return buildAdendumPkwtSales(doc);
  if (type === "PERPANJANGAN_PKWTT") return buildPerpanjanganPkwtt(doc);
  if (type === "SK_PENGANGKATAN") return buildSkPengangkatan(doc);
  if (type === "KOMITMEN_KERJA") return buildKomitmenKerja(doc);
  if (type === "SP_1" || type === "SP_2" || type === "SP_3") return buildSuratPeringatan(doc, type);
  return null;
}
