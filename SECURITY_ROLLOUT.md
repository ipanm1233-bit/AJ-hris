# Security rollout — AJ HRIS

Dokumen ini wajib diikuti berurutan. Jangan deploy `firestore.rules` ke production sebelum preview login Firebase berhasil, karena rules baru menolak sesi login lama.

## 1. Tindakan pemilik akun

1. Buat backup Firestore production dan lakukan uji restore ke project staging.
2. Ubah repository menjadi private.
3. Rotasi credential Kanal, token fingerprint, Gmail App Password, Gemini key, dan Firebase service account yang pernah dibagikan.
4. Aktifkan GitHub secret scanning, push protection, Dependabot, branch protection, dan 2FA.
5. Buat Firebase project dan Vercel project staging yang terpisah dari production.

## 2. Environment Variables Vercel

Isi untuk Preview terlebih dahulu, lalu Production setelah pengujian:

- Atur Node.js Runtime ke versi 22 atau lebih baru.

- `FIREBASE_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `FIRESTORE_DATABASE_ID`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `GEMINI_API_KEY`
- `KANAL_API_KEY`
- `KANAL_SECRET_KEY`
- `KANAL_ACCESS_TOKEN`
- `FINGERPRINT_BRIDGE_SECRET`
- `FINGERPRINT_TIMEZONE=Asia/Jakarta`
- `FINGERPRINT_MIN_WORK_GAP_MINUTES=120`
- `CRON_SECRET` (minimal 32 karakter acak)
- `APP_ORIGIN` (origin penuh tanpa slash di belakang)
- `REQUIRE_APP_CHECK=false` selama tahap awal

Jangan menyalin credential production ke Preview.

## 3. Firebase Authentication

1. Firebase Console → Authentication → Sign-in method.
2. Aktifkan Email/Password.
3. Tambahkan domain production dan preview ke Authorized domains.
4. Login pertama dengan NIK/username dan password lama akan memigrasikan akun ke Firebase Auth, menghapus `password`/`password_hash` dari dokumen lama, membuat `auth_profiles/{uid}`, dan memasang custom claims.
5. Akun baru harus dibuat dari menu Manajemen Pengguna; browser akan memanggil endpoint admin dan tidak menyimpan password ke Firestore.
6. Gunakan status akun `false` untuk menonaktifkan akun. Penghapusan langsung akun sengaja dimatikan.

## 4. Urutan deployment

1. Deploy branch ini ke Vercel Preview.
2. Login menggunakan satu akun HRD uji.
3. Uji login ulang setelah akun bermigrasi.
4. Uji ganti password dan logout seluruh sesi.
5. Migrasikan akun uji untuk setiap role dan cabang.
6. Jalankan pengujian fungsional seluruh menu di Preview.
7. Deploy Firestore dan Storage Rules ke project staging:

   `npx firebase-tools deploy --only firestore:rules,storage`

8. Jalankan matriks pengujian negatif pada staging.
9. Merge kode production dalam maintenance window.
10. Baru deploy rules production setelah deployment aplikasi berstatus Ready.

## 5. Firebase App Check

1. Firebase Console → App Check → Apps → pilih aplikasi web.
2. Daftarkan reCAPTCHA Enterprise.
3. Masukkan site key publik pada `recaptchaSiteKey` di konfigurasi web.
4. Pantau metrik request valid/tidak valid tanpa enforcement.
5. Setelah semua browser produksi mengirim token, aktifkan enforcement untuk Firestore dan Storage.
6. Ubah `REQUIRE_APP_CHECK=true` di Vercel dan redeploy.

Jangan mengaktifkan enforcement sebelum site key tersedia dan Preview sudah lulus.

## 6. Fingerprint bridge

Bridge harus menandatangani payload yang sama persis dengan body JSON:

1. `timestamp = Date.now()`
2. `message = timestamp + "." + JSON.stringify(body)`
3. `signature = HMAC_SHA256(FINGERPRINT_BRIDGE_SECRET, message)` dalam format hex
4. Kirim header `X-Bridge-Timestamp` dan `X-Bridge-Signature`

Server menolak signature salah dan request yang lebih tua dari lima menit.

Payload dapat memakai array `logs`, `records`, `attendance`, atau `data`. Setiap log minimal harus memiliki ID pengguna mesin (misalnya `deviceUserId`, `userId`, `enrollNumber`, atau `pin`) dan waktu scan (misalnya `recordTime`, `timestamp`, `checkTime`, atau `punchTime`). Waktu berbentuk `YYYY-MM-DD HH:mm:ss` dianggap sebagai waktu lokal mesin dan tidak digeser lagi oleh zona waktu server.

Endpoint mencocokkan ID mesin terhadap document ID/NIK serta field `finger_id`, `finger_name`, `kode_finger`, `no_finger`, `id_finger`, atau `pin` pada `master_karyawan`. Periksa `unmatchedFingerprintIds` pada respons bridge; ID yang muncul di sana harus dipetakan ke master karyawan sebelum go-live.

Dua scan tanpa penanda masuk/pulang baru dianggap satu hari kerja lengkap jika jaraknya minimal `FINGERPRINT_MIN_WORK_GAP_MINUTES`. Nilai awal 120 menit mencegah scan ulang 2–5 menit setelah masuk salah dibaca sebagai jam pulang.

## 7. Verifikasi cron

1. Vercel → Settings → Cron Jobs.
2. Pastikan seluruh cron memakai `CRON_SECRET` yang sama dengan environment production.
3. Buka View Logs setelah jadwal berjalan.
4. Pastikan koleksi `cron_locks` mencatat pengiriman per tanggal, jenis, dan cabang agar retry tidak menggandakan email.

## 8. Vercel Firewall

Rate limiter di kode membatasi satu instance fungsi. Tambahkan aturan Vercel Firewall untuk perlindungan terdistribusi:

- `/api/auth-login`: 7 request per 15 menit per IP.
- `/api/gemini`: 20 request per jam per pengguna/IP.
- `/api/send-email`: 30 request per jam per pengguna/IP.
- `/api/kanal-proxy`: hanya method POST dan rate limit.
- Blok negara yang tidak relevan jika kebijakan perusahaan mengizinkan.

## 9. Acceptance test wajib

- Request Firestore tanpa login ditolak.
- Karyawan tidak dapat membaca absensi/pengajuan milik orang lain.
- SPV Cirebon tidak dapat mengakses data cabang Malang.
- Mengubah role di localStorage tidak memberikan hak API.
- Endpoint email, push, Gemini, dan Kanal menolak request tanpa Firebase token.
- Cron menolak request tanpa `CRON_SECRET`.
- API Kanal menolak host selain `api.kanal.work`.
- Proxy gambar menolak HTTP, localhost, IP privat, dan domain di luar allowlist Google.
- Password plaintext/hash lama hilang setelah migrasi.
- Perubahan role atau penonaktifan akun mencabut sesi lama.
- Audit log tercatat dan tidak dapat diubah dari browser.

## 10. Rollback

Jika produksi bermasalah, rollback deployment aplikasi dan rules sebagai satu paket. Jangan rollback salah satunya saja. Pertahankan backup Firestore sebelum migrasi dan jangan menghapus `auth_profiles` selama investigasi.
