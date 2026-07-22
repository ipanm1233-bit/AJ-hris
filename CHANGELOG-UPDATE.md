# Changelog Update — AJ-HRIS (CV Andela Jaya)

Ringkasan seluruh perubahan yang diminta pada permintaan update ini.

## 1. Form Klaim Bensin dipindah ke Modul Sales
**File:** `js/auth.js`
- Menu "Klaim Bensin" dipindahkan dari kategori "Menu Utama" ke kategori **"Modul Sales"** di sidebar.
- Tetap bisa diakses oleh semua role (`roles: ["ALL"]`) karena klaim bensin juga dipakai untuk operasional cabang non-sales.

## 2. Manajemen Admin Cabang (Klaim Bensin) — khusus HRD
**File:** `js/views/klaim-bensin.js`, `views/klaim-bensin.html`
- Tab **"⛽ Manajemen Admin Cabang"** pada halaman Klaim Bensin sekarang disembunyikan otomatis untuk role selain `HRD` dan `SUPERADMIN`.
- Karyawan Sales / role lain hanya melihat tab **"📝 Form Ajukan Klaim"**.

## 3. Kolom "Tujuan / Daftar Kunjungan" pada Klaim Bensin
**File:** `views/klaim-bensin.html`, `js/views/klaim-bensin.js`
- Ditambahkan kolom baru per baris tanggal untuk mencatat outlet/lokasi yang dikunjungi sales pada hari itu.
- Data ini juga muncul di kolom **"TUJUAN"** pada dokumen cetak/unduh.

## 4. Form Claim Sales — Cetak & Unduh oleh Sales
**File:** `js/utils.js` (fungsi baru `buildFormClaimSalesHtml`, `printFormClaimSales`, `downloadFormClaimSales`), dipakai di `js/views/klaim-bensin.js` (panel admin) dan `js/views/riwayat.js` (riwayat pengajuan milik karyawan sendiri).
- Format dokumen sesuai permintaan persis:
  - Header **"FORM CLAIM SALES"** dengan nama perusahaan **CV ANDELA JAYA**.
  - Field **Nama**, **Area**, **Jenis BBM** (default Pertalite).
  - Tabel: **TGL | KM AWAL | KM AKHIR | JARAK TEMPUH | PETROL (Rp) | PARKIR (Rp) | TUJUAN**.
  - Baris lokasi & tanggal cetak (`Cirebon/Malang, ...`).
  - Tanda tangan 3 kolom: **Yang Mengajukan** (Nama Sales) / **Mengetahui** (SPV Sales) / **Dicek Oleh** (HR Staff).
- Sales kini punya tombol **🖨️ Cetak** dan **⬇️ Unduh** pada halaman **Riwayat Pengajuan** untuk klaim bensin miliknya sendiri, tanpa perlu akses admin.
- Nama perusahaan pada seluruh dokumen cetak Klaim Bensin (termasuk rekap cabang) diperbaiki dari "PT. Andela Jaya Sentosa" menjadi **CV ANDELA JAYA**.

## 5. Approval di tampilan mobile (Atasan & HRD)
**File:** `index.html`, `js/app.js`
- Ditambahkan tab **"Approval"** baru pada bottom navigation mobile.
- Tab ini otomatis muncul hanya untuk role yang berhak approve (HRD, Finance, SUPERADMIN, dan siapapun yang tercatat sebagai atasan/punya bawahan), sehingga mereka bisa langsung menyetujui pengajuan dari HP tanpa membuka sidebar.

## 6. Tombol Attendance di mobile — karyawan hanya lihat data sendiri
**File:** `js/auth.js` (menu baru `absensi-saya`), `views/absensi-saya.html` + `js/views/absensi-saya.js` (baru), `js/app.js`
- Tab **Attendance** di bottom nav mobile sekarang diarahkan secara dinamis:
  - **HRD/SUPERADMIN** → halaman "Manajemen Absensi" (penuh, seperti sebelumnya).
  - **Karyawan lain** → halaman baru **"Absensi Saya"**: hanya menampilkan rekap kehadiran milik karyawan yang login sendiri (difilter berdasarkan NIK), lengkap dengan ringkasan total hadir, hadir bulan ini, dan status belum scan pulang.
- Menu "Absensi Saya" juga muncul di sidebar (kategori "Kehadiran & Cuti") untuk semua role, jadi tidak hanya bisa diakses lewat mobile.

## 7. Widget "Evaluasi Kinerja" & Training di Dashboard Home
**File:** `js/views/dashboard.js`, `views/dashboard.html`
- Widget **"Evaluasi Kinerja Saya"** yang sudah ada tetap menampilkan skor terakhir, grade, tren, dan link ke halaman detail penilaian kinerja.
- Ditambahkan widget baru **"Training & Sertifikasi Saya"** — daftar training yang pernah/sedang diikuti karyawan yang login, dengan:
  - **Status kelulusan**: LULUS / TIDAK LULUS (berdasarkan skor post-test ≥ 70), SEDANG BERLANGSUNG, atau BELUM MULAI.
  - **Tanggal sertifikasi**: tanggal training bila dinyatakan LULUS.

## 8. Sidebar tambahan khusus Sales & Branch Manager
**File:** `js/auth.js`, `js/views/pengaturan.js`
- Kategori sidebar **"Modul Sales"** (Order Penjualan, Master Outlet, Master Item, Tugas Sales, Summary Track) kini hanya tampil untuk role:
  **`SALES`, `SPV SALES`, `KOORDINATOR SALES`, `BRANCH MANAGER`** (dan `SUPERADMIN` sebagai akses penuh sistem).
- Role baru **"SPV SALES"**, **"KOORDINATOR SALES"**, **"BRANCH MANAGER"** ditambahkan ke dropdown Role pada halaman **Akses & Pengguna**, supaya HRD bisa langsung menetapkan role tersebut ke karyawan terkait.

## 9. "Karyawan Cuti / Izin Hari Ini" dipindah ke atas
**File:** `views/dashboard.html`
- Widget ini sekarang berada tepat di bawah kartu identitas karyawan (`dash-profile-card`), sebelum banner personalisasi dan kartu saldo cuti — sesuai posisi yang diminta.

---

## ⚠️ Catatan Penting Sebelum Deploy

1. **Role karyawan existing perlu disesuaikan.** Role `"SPV SALES"`, `"KOORDINATOR SALES"`, dan `"BRANCH MANAGER"` adalah string baru yang sebelumnya tidak ada di sistem (sebelumnya hanya ada `"SPV"` generik). Supervisor/koordinator sales dan branch manager yang sudah terdaftar perlu diedit rolenya lewat menu **Akses & Pengguna** agar sidebar Modul Sales otomatis muncul untuk mereka.
2. **User dengan "Permission Override" custom** (whitelist menu manual yang pernah diset HRD per-user) tidak otomatis mendapat menu baru (`absensi-saya`, item Modul Sales, dll). HRD perlu menambahkannya secara manual ke `allowed_menus` user tersebut bila override itu masih aktif.
3. Belum ada migrasi data untuk klaim bensin lama yang belum memiliki field `tujuan` atau `jenis_bbm` — data lama akan tampil dengan nilai default ("-" / "Pertalite") saat dicetak, tanpa error.
4. Perubahan ini murni di sisi front-end (HTML/JS). Tidak ada perubahan skema Firestore yang mengharuskan migrasi, hanya field baru opsional (`tujuan`, `jenis_bbm`) pada dokumen baru di koleksi `data_pengajuan`.
