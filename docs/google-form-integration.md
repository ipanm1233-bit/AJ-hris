# Integrasi Google Form (gratis, tanpa Google Forms API)

Integrasi ini menghubungkan Form Builder HRIS dengan Google Form menggunakan
**Google Apps Script** sebagai jembatan. Tidak ada biaya tambahan, tidak perlu
mengaktifkan Google Forms API, dan tidak perlu service account Google Cloud.

## Arsitektur

```
Google Form
   │  onFormSubmit (Apps Script)
   ▼
POST /api/sync-absen  { action: "form_ingest", ... }
   │  HMAC-SHA256 + rate limit
   ▼
Supabase: form_submissions  (kotak masuk, idempoten)
   │  HRD klik "Impor"
   ▼
Firestore: data_pengajuan   (pengajuan MENUNGGU seperti biasa)
```

- **Firestore tetap sumber kebenaran** untuk `form_config` dan `data_pengajuan`.
- **Supabase hanya menyimpan**: definisi integrasi (`form_definitions`),
  respons mentah (`form_submissions`), dan penghitung rate limit
  (`rate_limit_buckets`).
- **Tidak ada Supabase Auth.** Semua aksi admin memakai token Firebase yang
  sudah ada; webhook publik memakai HMAC per formulir.
- Endpoint baru tidak ditambahkan. Semua aksi `form_*` dialihkan melalui
  `api/sync-absen.js` agar jumlah Vercel Function tetap 12.

## Langkah aktivasi (sekali saja)

1. Jalankan `supabase/migrations/005_google_forms.sql` di Supabase SQL Editor.
2. Pastikan environment Vercel berisi:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (disarankan, format `sb_secret_...`) atau
     `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ORIGIN` (contoh `https://hris.andelajaya.co.id`) agar URL webhook di
     skrip selalu benar.
3. Buka **Form Builder** → pilih formulir → bagian **Integrasi Google Form**.
4. Isi ID/URL Google Form bila sudah ada. Jika belum, kosongkan dulu.
5. Klik **Simpan Integrasi**. HRIS membuat kunci webhook dan skrip Apps Script.
6. Klik **Salin Skrip**, lalu di Google Form buka **Ekstensi → Apps Script**,
   tempel skrip, dan simpan.
7. Jalankan salah satu:
   - `setupCreateForm()` — membuat Google Form baru sesuai kolom HRIS,
     memasang trigger, dan menampilkan ID/URL form di log.
   - `installTrigger()` — memakai Google Form yang sudah ada; jalankan dari
     form tersebut (buka form → Ekstensi → Apps Script).
8. Setujui izin Google (Form, Trigger, UrlFetch). Ini gratis.
9. Salin ID/URL Google Form dari log ke kolom **ID / URL Google Form** di HRIS,
   lalu **Simpan Integrasi** lagi.
10. Kirim satu respons uji. Buka **Kotak Masuk Respons** dan klik **Impor**.

> Jika kunci webhook bocor, klik **Putar Kunci Webhook**, lalu ganti skrip di
> Apps Script dengan skrip baru. Skrip lama langsung tidak berlaku.

## Cara pemetaan jawaban

- Setiap kolom HRIS punya `name` (variabel sistem) dan `label`.
- Kolom **Judul Pertanyaan Google Form** diisi otomatis dari label HRIS.
- Saat respons masuk, HRIS mencocokkan dengan urutan:
  1. judul pertanyaan persis,
  2. judul yang dinormalisasi (huruf kecil, tanpa tanda baca),
  3. nama variabel sistem,
  4. label HRIS.
- Kolom wajib yang tidak ditemukan dicatat di `missing_required` pada respons
  webhook, tetapi respons tetap disimpan agar HRD bisa memeriksa.
- Setelah diimpor, jawaban menjadi `detail` pada `data_pengajuan` dan mengikuti
  alur approval formulir HRIS. Jika formulir belum punya alur, default `HRD`.

## Keamanan

- Webhook menolak permintaan tanpa tanda tangan HMAC-SHA256 yang valid.
- Kunci disimpan hanya di server (Supabase) dan tidak pernah dikirim pada
  `form_list`. Kunci hanya muncul di skrip yang diminta HRD/SUPERADMIN.
- Perbandingan tanda tangan memakai `crypto.timingSafeEqual`.
- Semua aksi admin dibatasi role `HRD`/`SUPERADMIN` dan diaudit ke `audit_logs`.
- Submission bersifat idempoten berdasarkan `submission_id` Google, sehingga
  trigger ganda atau retry tidak membuat data dobel.

## Batas free tier

| Batas | Nilai | Penegakan |
| --- | --- | --- |
| Respons per formulir per menit | 120 | Rate limit memori + Supabase |
| Respons per formulir per hari | 3.000 | Rate limit Supabase (window 24 jam) |
| Impor per tindakan | 100 respons | `clampBatchSize` |
| Impor per jam per HRD | 60 tindakan | Rate limit Supabase |
| Ukuran payload | 512 KB | `payloadWithinLimit` |
| Kolom per formulir | 100 | `normalizeFieldDefinitions` |
| Jawaban per respons | 200 | `normalizeAnswers` |
| Retensi respons | 90 hari | `form_prune` |

Jalankan pembersihan manual bila perlu:

```
POST /api/sync-absen
{ "action": "form_prune", "keepDays": 90 }
```

Pembersihan menghapus maksimal 500 respons lama per pemanggilan dan sekaligus
membersihkan bucket rate limit yang sudah kedaluwarsa.

## Troubleshooting

- **"Supabase belum dikonfigurasi"** — isi `SUPABASE_URL` dan
  `SUPABASE_SECRET_KEY` di Vercel, lalu redeploy.
- **HTTP 401 dari webhook** — skrip memakai kunci lama. Klik **Putar Kunci
  Webhook** dan ganti skrip.
- **HTTP 404** — formulir belum terdaftar atau integrasi dinonaktifkan.
- **Respons masuk tetapi tidak terpetakan** — samakan judul pertanyaan Google
  Form dengan label HRIS, lalu simpan integrasi.
- **HTTP 429** — batas per menit/hari tercapai. Tunggu atau periksa apakah ada
  trigger ganda di Apps Script.
- **HTTP 503** — migrasi `005_google_forms.sql` belum dijalankan atau kunci
  Supabase salah.
