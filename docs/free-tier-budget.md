# Anggaran & penjagaan free tier

Aplikasi ini dirancang agar seluruh platform tetap berada di paket gratis.
Angka batas di bawah adalah **plafon konservatif** yang dipakai kode, bukan
angka pemasaran platform.

## Plafon platform (referensi)

| Platform | Kuota gratis | Catatan |
| --- | --- | --- |
| Firebase Firestore | 50.000 baca/hari, 20.000 tulis/hari, 1 GiB, 10 GiB egress/bulan | Sumber kebenaran data HRIS |
| Supabase | 500 MiB database, 5 GiB egress/bulan | Hanya tabel integrasi + rate limit |
| Vercel | 100 GB transfer, 1 juta invokasi function/bulan | Tetap 12 function |
| Google Apps Script | 20.000 UrlFetch/hari, 90 menit/hari | Jembatan Google Form |
| Gmail SMTP | ±500 email/hari | Notifikasi manual |

## Batas yang ditegakkan aplikasi

| Batas | Nilai | Lokasi |
| --- | --- | --- |
| Respons Google Form / formulir / menit | 120 | `lib/form-access.js` |
| Respons Google Form / formulir / hari | 3.000 | `lib/form-access.js` |
| Impor per tindakan | 100 | `lib/free-tier.js` |
| Impor per jam per HRD | 60 | `lib/form-access.js` |
| Ukuran payload webhook | 512 KB | `lib/free-tier.js` |
| Jumlah kolom formulir | 100 | `lib/form-integration.js` |
| Jawaban per respons | 200 | `lib/form-integration.js` |
| Halaman kotak masuk | 200 | `lib/free-tier.js` |
| Retensi respons | 90 hari | `form_prune` |
| Login | 7 percobaan / 15 menit | `api/auth-login.js` |
| Admin formulir | 180 aksi / jam | `lib/form-access.js` |

## Dua lapis rate limiter

1. **Memori proses** (`lib/rate-limit.js`) — selalu aktif, tanpa biaya.
2. **Supabase terdistribusi** — dipakai untuk login dan webhook/impor agar
   batas tidak bisa diakali dengan memecah permintaan ke banyak instance Vercel.

Jika Supabase sedang gangguan, lapisan memori tetap menahan permintaan. Sistem
tidak menjadi tanpa batas.

Fungsi SQL `consume_rate_limit` menyimpan satu baris per kombinasi
`namespace + key`. Baris lama dibersihkan oleh `form_prune` atau
`prune_rate_limit_buckets`.

## Prinsip desain hemat kuota

- Daftar respons memakai kolom terpilih (bukan `select=*`) dan maksimal 200 baris.
- Kunci webhook tidak ikut terkirim pada daftar definisi.
- Import memakai 1 baca cek duplikat + 1 tulis per respons.
- Penghapusan data lama dilakukan bertahap (maksimal 500 baris sekali jalan).
- Tidak ada polling; sinkronisasi Google Form bersifat push dari Apps Script.
- Asset browser memakai versi query (`?v=`) agar cache tidak membebani server.

## Pemantauan

- Vercel → Functions → `sync-absen` untuk melihat invocation dan error.
- Supabase → Database → Query `select count(*) from form_submissions;` dan
  `select count(*) from rate_limit_buckets;`.
- Firestore → Usage untuk baca/tulis harian.
- Google Apps Script → Executions untuk memastikan trigger tidak ganda.

Jika salah satu mendekati 70% kuota, jalankan `form_prune`, kurangi frekuensi
impor, atau nonaktifkan integrasi formulir yang tidak dipakai.
