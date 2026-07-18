# Ringkasan Pengembangan — AJ HRIS (CV Andela Jaya)

Dokumen ini merangkum seluruh pembahasan dan perbaikan yang telah dilakukan pada sistem HRIS, dari awal sampai akhir, sebagai catatan/dokumentasi teknis.

---

## 1. Perbaikan Menu & Hak Akses

**Masalah awal:** Beberapa menu (Uang Makan Expedisi, Lembur & Kasbon, Kedisiplinan & SP, Manajemen Inventory & ATK, Manajemen Gimmick & SOP, Manajemen Kendaraan, Manajemen SOP) hilang/error 404 saat diklik.

**Penyebab:** Nama `route` di `js/auth.js` (daftar menu) tidak sama persis dengan nama file view sebenarnya (`views/*.html` & `js/views/*.js`). Router mencocokkan berdasarkan nama string, jadi kalau beda satu huruf saja langsung 404.

**Perbaikan:** Nama route diselaraskan dengan nama file yang sebenarnya ada.

**Rombak struktur menu (permintaan lanjutan):** Menu dipetakan ulang jadi 3 kelompok sesuai urutan yang diminta:
- **Menu Utama** — Home & Dashboard, Buat Pengajuan, Klaim Bensin, Riwayat Pengajuan
- **Modul HRD** — Kalender HR, Penilaian & Kontrak, Rekrutmen (ATS), Siklus Karyawan, Jatah Cuti Karyawan, Uang Makan Expedisi, Lembur & Kasbon, Kedisiplinan & SP, Manajemen Inventory & ATK, Manajemen Gimmick & SOP, Manajemen Kendaraan, Manajemen Data, Akses & Pengguna, Konfigurasi Sistem
- **Modul Manajemen** — Antrean Persetujuan, Broadcast Memo, Manajemen Absensi, Manajemen Cuti

**Bug tersembunyi yang ikut ditemukan & diperbaiki:** Sistem lama mengecek akses lewat kategori kasar (`role === "HRD"` persis), sehingga **SUPERADMIN dan DIREKTUR sebenarnya terblokir dari hampir semua menu HRD** meskipun namanya ada di daftar `roles` masing-masing menu. Diperbaiki agar setiap menu dicek langsung dari `roles`-nya sendiri. Efek samping: fitur "atur menu per-user" di halaman Akses & Pengguna (yang checkbox-nya tidak tersambung ke apa pun / selalu `undefined`) ikut jadi berfungsi karena ditambahkan field `id` yang stabil ke tiap menu.

---

## 2. Manajemen Cuti & Kontrak — Hak Akses Bertingkat

- **HRD/SUPERADMIN/DIREKTUR**: akses penuh — bisa tambah, **edit, dan hapus** riwayat cuti tiap karyawan (sebelumnya cuma bisa lihat).
- **Atasan (MANAGER/SPV/KOORDINATOR)**: akses **lihat saja**, dan **hanya menampilkan karyawan yang menjadi bawahan langsungnya** (dicocokkan lewat field `atasan` di Master Karyawan). Pola yang sama diterapkan juga di modul Kontrak.
- Daftar karyawan di kedua modul (dan beberapa modul master lain: Master Karyawan, Data Kendaraan, Manajemen Pengguna, Gimmick/SOP) diurutkan **A–Z**.

## 3. Perhitungan Jatah Cuti (sesuai SK No. 018/HRGA-AJ/XII/2024)

Logika kalkulasi di menu **Jatah Cuti Karyawan** dibetulkan total:
- Cuti tahunan kini **proporsional** untuk karyawan dengan masa kerja di bawah 12 bulan (1 hari terakumulasi per bulan kerja), bukan langsung diberi 12 hari penuh.
- Tambahan **Cuti Penghargaan Masa Kerja** diperbaiki batasannya: 6 th (+1), 8 th (+2), 10 th (+3), **di atas** 10 th (+4) — sebelumnya salah ambang di 11 tahun.
- Cuti Khusus tetap 4 hari/tahun (sudah benar).
- **Carryover sisa cuti** tahun lalu sekarang dihitung dari **sisa yang benar-benar belum terpakai** (jatah dikurangi realisasi pemakaian tahun berjalan), bukan dari total jatah awal seperti sebelumnya.

## 4. Logo Perusahaan & Dokumen Ber-standar ISO

- Logo asli CV Andela Jaya dipasang di satu sumber terpusat: `js/branding.js` (base64, teroptimasi ukurannya).
- Ditambahkan helper `isoDocHeaderTable()` yang mereplikasi **persis** kop dokumen resmi (Logo | Judul | Nama Perusahaan | Hal/No Dok/Terbit-Revisi/Tgl Terbit) — divalidasi dengan merender ulang & membandingkan piksel-per-piksel terhadap 2 PDF template asli yang dikirim (Form Cuti Full Day & Setengah Hari).
- **Form Cuti** dirombak total supaya field, urutan, dan gaya (teks polos tanpa garis tabel di bagian Data Karyawan/Keterangan Cuti, warna merah pada teks "SETENGAH HARI") **identik** dengan template asli.
- Logo & kop ISO yang sama dipasang juga di dokumen tergenerate lain: Laporan KPI Kontrak, Tanda Terima Barang (Inventory), Tanda Terima Uang Makan, Surat Peringatan (SP) & Surat Panggilan (Kedisiplinan), Tanda Terima Lembur/Kasbon.

## 5. Notifikasi (Lonceng) & Widget Dashboard

- Lonceng notifikasi sebelumnya hanya berfungsi kalau sedang berada di halaman Dashboard (klik pertama cuma pindah halaman). Diperbaiki jadi **global** — bisa diklik dari halaman manapun, terhubung ke `js/app.js`.
- Kategori notifikasi: Pengumuman, Antrean Persetujuan, Tugas KPI 360, Warning Kontrak (khusus HRD), dan (fitur baru) **LPJ Belum Diisi / Terlambat**.
- Widget "Karyawan Segera Habis Kontrak" tetap khusus HRD. Ditambahkan panel di **Konfigurasi Sistem** agar HRD bisa mengatur widget apa saja yang tampil di dashboard karyawan biasa (Saldo Cuti, Tugas KPI, Cuti Hari Ini, Pengumuman).

## 6. AI Gemini (Rekrutmen & Gimmick/SOP)

Ditemukan **2 penyebab pasti** fitur AI selalu gagal:
1. Nama model `gemini-1.5-flash` sudah **resmi dipensiunkan Google** (selalu 404) — diganti ke alias `gemini-flash-latest` yang otomatis mengikuti model stabil terbaru.
2. API key berformat `"AQ."` — format baru Google yang saat ini bermasalah dan sering ditolak (401) untuk pemanggilan REST langsung seperti yang dipakai sistem ini.

Konfigurasi dipusatkan di `js/ai-config.js` dengan pesan error yang jelas kalau key/model bermasalah. **Perlu tindakan manual:** generate API key baru di aistudio.google.com/apikey, pastikan diawali `AIzaSy...`.

## 7. Mesin Alur Kerja (Workflow Engine) — Form Builder

Form Builder ditingkatkan agar sistem bukan sekadar tempat input data, tapi bisa mengatur alur kerja kondisional:

- **Field kondisional** (`show_if`) — tiap kolom formulir sekarang punya toggle "Tampilkan Kolom Ini Hanya Jika...", sehingga bisa dibuat aturan seperti: Kasbon untuk "Renovasi Rumah" → wajib upload foto rumah; Kasbon untuk "Sekolah Anak" → wajib isi daftar barang.
- **Tipe field baru: Upload Foto/File** — upload langsung ke Firebase Storage.
- **Laporan Pertanggungjawaban (LPJ)** — form bisa ditandai "Wajib LPJ", dengan kolom LPJ sendiri (foto bukti, nominal realisasi, dst.) dan batas waktu (hari). Begitu pengajuan disetujui final: sistem otomatis hitung tenggat, kirim email pengingat ke pemohon, tandai transaksi di Riwayat Pengajuan sampai diisi, dan muncul di lonceng notifikasi (HRD juga dapat notifikasi kalau ada yang telat).

## 8. Siklus Karyawan — Onboarding & Email Otomatis

- **Onboarding** sebelumnya cuma memilih dari karyawan yang *sudah* ada di database (tidak masuk akal untuk karyawan baru). Diubah jadi form input data karyawan baru dari nol (nama, NIK, email, jabatan, atasan, dll) — begitu disimpan, otomatis membuat record Master Karyawan baru **dan** mengirim **welcoming letter** ke email karyawan baru.
- **Mutasi/Promosi/Demosi/Offboarding**: ditemukan kode lama cuma `console.log("Mock Email Sent")` (tidak benar-benar mengirim email). Sekarang semua jenis siklus terhubung ke jalur email resmi sistem dan otomatis mengirim notifikasi ke email karyawan bersangkutan.

## 9. Broadcast Memo — Upload File dari Komputer

Field "Lampiran URL" (harus copy-paste link manual) diganti jadi `<input type="file">` — file diupload langsung ke Firebase Storage saat memo dikirim, tidak perlu link manual lagi.

## 10. Export Data — Kolom Sesuai Tampilan & Bisa Dipilih Urutannya

**Masalah:** Tombol Export (CSV) di semua modul (Manajemen Data, Inventory, Kendaraan, dll.) sebelumnya men-dump **seluruh field mentah** dari database apa adanya (termasuk field internal yang tidak relevan), urutan kolom acak mengikuti Firestore — tidak cocok dengan tampilan tabel di layar.

**Perbaikan:** Tombol Export sekarang membuka modal pemilih kolom — user bisa centang kolom mana saja yang mau diikutkan **dan** seret untuk mengatur urutannya, sebelum diunduh sebagai CSV. Karena ini diperbaiki di komponen bersama (`renderCrudModule`), otomatis berlaku ke **semua modul** yang memakainya.

## 11. Isu Infrastruktur (Bukan Bug Kode)

- **404 saat deploy ke GitHub Pages** — ternyata folder `views/`/`js/` tidak ikut ter-upload dengan benar ke repo (masalah cara upload, disarankan pakai `git push` daripada upload manual via web).
- **CORS error saat upload lampiran ke Firebase Storage** — bucket Storage belum dikonfigurasi mengizinkan origin `https://andela-hris.vercel.app`. Perlu dijalankan sekali lewat Google Cloud Shell:
  ```bash
  gsutil cors set cors.json gs://andela-hris-bc9ed.firebasestorage.app
  ```
  (isi `cors.json` dan langkah lengkap ada di riwayat chat). Ini bersifat konfigurasi akun Google Cloud, bukan sesuatu yang bisa diperbaiki lewat kode.

---

## File-file Kunci yang Diubah/Ditambahkan

| File | Perubahan Utama |
|---|---|
| `js/auth.js` | Struktur menu, RBAC per-item, helper akses atasan/bawahan |
| `js/branding.js` | **Baru** — logo terpusat + kop dokumen ISO |
| `js/ai-config.js` | **Baru** — konfigurasi Gemini terpusat |
| `js/utils.js` | Helper field dinamis (`dynFieldWrapperHtml`, `wireDynFormLogic`, `collectDynFormDetail`), export CSV kolom-terpilih |
| `js/components.js` | Notifikasi global, tombol print generik (`printFn`), modal pemilih kolom export |
| `js/views/cuti.js` | Hak akses bertingkat, form cetak sesuai template asli |
| `js/views/manajemen-cuti.js` | Rumus jatah cuti sesuai SK |
| `js/views/form-builder.js` | Field kondisional, tipe file, konfigurasi LPJ |
| `js/views/pengajuan.js` | Dukungan upload file, denormalisasi LPJ saat submit |
| `js/views/approval.js` | Hitung tenggat LPJ + email pengingat saat disetujui final |
| `js/views/riwayat.js` | Status & form pengisian LPJ |
| `js/views/siklus-karyawan.js` | Onboarding karyawan baru + email nyata semua jenis siklus |
| `js/views/broadcast.js` | Upload file lampiran |
| `js/views/{inventory,pemanggilan,uang-makan,lembur-kasbon,penilaian-kontrak}.js` | Tombol cetak dokumen ISO |

---

## Yang Masih Perlu Tindakan Manual dari Kamu

1. **Ganti API key Gemini** di `js/ai-config.js` dengan key baru yang valid (format `AIzaSy...`).
2. **Setel CORS bucket Firebase Storage** (lihat bagian 11 di atas) — sekali saja, berlaku untuk semua fitur upload.
3. **Konfigurasi contoh Kasbon kondisional** (field "Tujuan Kasbon" + field kondisional foto/list) lewat menu Form Builder — ini data konfigurasi, bukan kode, jadi harus diisi lewat UI.
