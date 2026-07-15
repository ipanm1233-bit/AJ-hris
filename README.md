# Portal HRIS & Operasional — CV Andela Jaya

Single Page Application (SPA) modular berbasis **HTML5 + Tailwind CSS + Firebase Cloud Firestore**, dengan client-side hash routing (`#dashboard`, `#pengajuan`, dst) sehingga perpindahan antar-menu instan tanpa reload halaman.

---

## 1. Struktur Proyek

```
andela-hris/
├─ app.html                  ← Shell utama SPA (header, sidebar, mount point)
├─ super-migrasi.html        ← Alat migrasi data Excel → Firestore
├─ firestore.rules           ← Contoh Security Rules (WAJIB disesuaikan sebelum go-live)
├─ css/
│  └─ style.css              ← Pelengkap Tailwind: animasi, state sidebar, dsb
├─ js/
│  ├─ firebase-config.js     ← Konfigurasi Firebase + daftar nama koleksi (COL)
│  ├─ utils.js                ← Smart Date Parser, formatter, toast, modal, CRUD wrapper
│  ├─ auth.js                  ← Login, sesi, mesin RBAC (menu & form)
│  ├─ components.js            ← Komponen UI reusable (ikon, tabel CRUD generik, timeline, kanban)
│  ├─ app.js                    ← Router utama (hash-based)
│  ├─ migrasi-engine.js         ← Logika di balik super-migrasi.html
│  └─ views/                    ← Satu file controller JS per menu (mount/unmount)
│     ├─ login.js, dashboard.js, pengajuan.js, riwayat.js, approval.js, cuti.js, ...
└─ views/                     ← Satu file HTML fragment per menu (di-fetch oleh router)
   ├─ login.html, dashboard.html, pengajuan.html, ...
```

**Pola arsitektur setiap menu:** `views/{route}.html` (markup) + `js/views/{route}.js` (logika, mengekspor fungsi `mount(container, {session, params})` yang mengembalikan `{ unmount() }`). Router (`js/app.js`) men-fetch HTML lalu meng-import JS-nya secara dinamis setiap kali hash berubah — inilah yang membuat navigasi terasa instan dan tanpa kedipan.

---

## 2. Cara Menjalankan

### A. Setup Firebase
1. Buat project baru di [Firebase Console](https://console.firebase.google.com).
2. Aktifkan **Cloud Firestore** (mode production atau test, bebas — rules akan diatur manual).
3. Buka **Project Settings → General → Your apps → Web app**, salin konfigurasi, lalu tempel ke `js/firebase-config.js` menggantikan seluruh nilai `GANTI_...`.
4. (Opsional tapi disarankan) Deploy `firestore.rules` lewat Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```

### B. Migrasi Data dari Excel
1. Jalankan proyek ini di web server lokal (module JS **tidak bisa** dibuka langsung via `file://`, wajib via HTTP server). Contoh cepat:
   ```bash
   npx serve .
   # atau
   python3 -m http.server 8080
   ```
2. Buka `http://localhost:8080/super-migrasi.html`.
3. Pastikan status koneksi Firestore hijau (langkah 1 otomatis berjalan).
4. Unggah file Excel sumber Anda (mis. `Data_Pengajuan.xlsx`) pada langkah 2 — sistem otomatis memetakan tiap sheet ke koleksi Firestore yang sesuai.
5. Klik **Mulai Migrasi Data** (langkah 3).
6. Klik **Buat Data Dummy Sekarang** (langkah 4) untuk mengisi modul-modul baru yang belum ada datanya di Excel (Rekrutmen, Gimmick & SOP, Kalender HR, dsb) agar sistem tidak kosong.

### C. Menjalankan Aplikasi Utama
Buka `http://localhost:8080/app.html`. Login menggunakan username & password dari sheet **Users** yang sudah dimigrasi (password otomatis di-hash SHA-256 saat migrasi).

### D. Deploy ke Hosting
Karena ini murni file statis (HTML/CSS/JS), bisa langsung di-deploy ke **Firebase Hosting**, Netlify, Vercel static, GitHub Pages, dsb. Contoh Firebase Hosting:
```bash
npm install -g firebase-tools
firebase init hosting   # pilih folder ini sebagai public dir
firebase deploy
```

---

## 3. Smart Date Parser — Anti "US Date Confusion"

Fungsi `smartParseDate()` di `js/utils.js` menangani 3 kemungkinan bentuk tanggal:
1. **Excel Serial Date** (angka mentah, mis. `45825`) → dihitung dari epoch Excel `1899-12-30`.
2. **String format Indonesia** `DD/MM/YYYY` atau `DD-MM-YYYY` → hari **selalu dibaca lebih dulu** dari bulan, sehingga `01/11/2023` selalu dimaknai **1 November 2023**, bukan 11 Januari.
3. **String ISO 8601** (`2026-06-26T04:45:32.971Z`) → langsung diparse native.

Fungsi ini dipakai konsisten di seluruh aplikasi (`super-migrasi.html` maupun tampilan dashboard/laporan) sehingga tidak ada celah tanggal salah baca.

---

## 4. Skema Firestore (Ringkasan Koleksi)

| Koleksi | Sumber Excel | ID Dokumen | Keterangan |
|---|---|---|---|
| `master_karyawan` | Master Karyawan | `nik_karyawan` | Data induk kepegawaian lengkap |
| `master_cuti` | Master Cuti | auto/`record_id_cuti` | Log pengambilan cuti per transaksi |
| `master_kendaraan` | Master Kendaraan | `no_polisi` | Data armada |
| `master_inventory` | Master Inventory | `id_item` | Katalog barang/ATK |
| `master_kontrak` | MASTER KONTRAK | `record_id` | Riwayat kontrak kerja |
| `users` | Users | `username` | Akun login (password di-hash SHA-256) |
| `user_permissions` | *(baru)* | `username` | Override RBAC per-personil (menu & form) |
| `form_config` | Form_Config | `id_form` | Skema formulir ISO (dipakai Form Builder & Katalog Pengajuan) |
| `data_pengajuan` | Data_Pengajuan | `id` (TRX-...) | Transaksi pengajuan + status approval berjenjang |
| `broadcast` | Broadcast | auto | Memo internal |
| `log_sp_konseling` | Log_SP_Konseling | auto | SP & konseling |
| `data_pemanggilan` | *(skema baru)* | auto | Pemanggilan disiplin |
| `master_soal_kpi` | Master Soal KPI | auto | Bank soal penilaian KPI per jabatan |
| `log_penilaian_kpi` | Log_Penilaian_KPI | auto | Hasil penilaian |
| `tugas_kpi_360` | Tugas_KPI_360 | auto | Penugasan penilaian 360° |
| `log_kendaraan_fuel/service/compliance` | Log_Kendaraan_* | auto | Operasional armada |
| `log_inventory_pengambilan`, `stock_opname` | Log_Inventory_*, Stock_Opname | auto | Mutasi stok |
| `evaluasi_kontrak` | Evaluasi_Kontrak | auto | Rekomendasi lanjut/putus kontrak |
| `log_offboarding` | Log_Offboarding | auto | Proses keluar karyawan |
| `rekrutmen_pelamar` | *(skema baru)* | auto | Pipeline ATS |
| `gimmick_sop` | *(skema baru)* | auto | Dokumen SOP/Gimmick |
| `kalender_hr_events` | *(skema baru)* | auto | Agenda manual (ulang tahun/anniversary dihitung otomatis dari `master_karyawan`) |
| `siklus_karyawan` | *(skema baru)* | auto | Mutasi/promosi/demosi/on-off boarding |
| `uang_makan_expedisi` | *(skema baru)* | auto | Kalkulasi uang makan tim lapangan |
| `notifications` | *(skema baru)* | auto | Notifikasi sistem (dipicu Broadcast Memo) |

Lihat objek `COL` pada `js/firebase-config.js` untuk daftar lengkap & nama koleksi pasti.

---

## 5. Mesin RBAC ("RBAC Sakti")

Didefinisikan di `js/auth.js` melalui `MENU_CONFIG` (satu sumber kebenaran untuk seluruh menu sistem):

- **Grup ALL** — tampil untuk semua karyawan yang login.
- **Grup HRD** — hanya tampil jika `session.role === 'HRD'`.
- **Grup MANAJEMEN** — tampil jika role termasuk `SPV/HRD/GM/FINANCE/MANAGER`, **atau** karyawan tersebut terdeteksi sebagai atasan (ada karyawan lain di `master_karyawan` dengan field `atasan` = namanya).

**Override per-personil oleh HRD** disimpan di koleksi `user_permissions`:
- `allowed_menus: string[]` — jika diisi, JADI WHITELIST MUTLAK menu yang tampil untuk user tersebut (menimpa aturan role di atas). Dikelola lewat menu **Pengaturan Sistem → Akses Menu (RBAC)**.
- `allowed_forms: string[]` — override akses ke Katalog Pengajuan ISO per personil, di luar aturan `Allowed_Users`/`Allowed_Rules` bawaan tiap formulir. Dikelola lewat tab **Akses Formulir Pengajuan**.

---

## 6. Form Builder & Formula Kalkulasi Otomatis

Menu **Form Builder** (khusus HRD) memungkinkan merakit formulir baru secara visual: tambah kolom (teks/angka/tanggal/pilihan/rumus), drag untuk mengurutkan ulang, atur alur approval bertahap, serta kolom **Rumus** yang dihitung otomatis secara real-time menggunakan sintaks:

```
([km_akhir] - [km_awal]) * (10000/25)
```

Mesin evaluasi ada di `evalFormula()` (`js/utils.js`) — hanya mengizinkan karakter matematika (`0-9 + - * / ( ) .`) demi keamanan (tidak ada eval kode arbitrer).

---

## 7. Catatan Keamanan Produksi

1. **Password**: sistem ini melakukan hashing SHA-256 di sisi klien sebagai peningkatan minimum dari plaintext. Untuk keamanan kelas produksi penuh, migrasikan ke **Firebase Authentication** (lihat komentar di `firestore.rules`).
2. **Firestore Security Rules**: file `firestore.rules` yang disertakan masih dalam **mode terbuka** (`allow read, write: if true`) untuk mempermudah tahap migrasi & development. **WAJIB diperketat** sebelum sistem dipakai produksi — lihat contoh rules berbasis custom claims di dalam file yang sama.
3. **API Key Firebase** yang terekspos di client adalah hal normal (bukan rahasia rahasia) selama Security Rules sudah benar — proteksi sesungguhnya ada di Rules, bukan di API key.

---

## 8. Ekstensi / Pengembangan Lanjutan

Modul-modul manajemen sederhana (Inventory, Kendaraan, Gimmick & SOP, Uang Makan, dst) dibangun di atas satu factory generik `renderCrudModule()` (`js/components.js`) — untuk menambah modul CRUD baru, cukup panggil factory ini dengan konfigurasi kolom & form baru, tanpa menulis ulang boilerplate tabel/modal/pencarian/export CSV.
