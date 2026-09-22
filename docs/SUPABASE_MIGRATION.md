# Migrasi Supabase: Absensi dan Tracking Sales

Dokumen ini adalah runbook operasional tanpa nilai rahasia. Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` di Git, browser, atau JavaScript frontend.

## Cakupan

- Supabase menjadi database utama untuk `attendance`, `sales_visits`, dan `sales_odometer`.
- Firebase Authentication, FCM, CRON/email, serta modul HRIS lain tetap berjalan seperti sebelumnya.
- Firestore tetap menjadi fallback sementara selama masa validasi migrasi.
- Arsip spreadsheet lama tidak dihapus.

## Urutan penerapan

1. Jalankan `supabase/migrations/001_attendance.sql` di Supabase SQL Editor.
2. Jalankan `supabase/migrations/002_sales_tracking.sql`.
3. Pastikan tabel berikut tersedia: `attendance`, `sales_visits`, dan `sales_odometer`.
4. Pastikan RLS aktif dan role `anon`/`authenticated` tidak memiliki akses langsung.
5. Pasang variabel server-only di Vercel:

   ```text
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ATTENDANCE_DB_PROVIDER=supabase
   SALES_TRACKING_DB_PROVIDER=supabase
   ATTENDANCE_FIRESTORE_FALLBACK=true
   SALES_TRACKING_FIRESTORE_FALLBACK=true
   ```

6. Redeploy production agar revisi environment baru dipakai.

## Cara data lama berpindah

API melakukan dual-read selama fallback aktif. Saat halaman absensi atau Tracking Sales dibuka, data yang masih hanya ada di Firestore akan di-upsert ke Supabase berdasarkan identitas unik:

- Absensi: `nik + tanggal`.
- Kunjungan sales: `id` kunjungan.
- Odometer: `sales_nik + tanggal`.

Proses ini idempotent: membuka periode yang sama lagi tidak membuat baris ganda. Supabase diprioritaskan ketika versi data berbeda.

## Verifikasi setelah deployment

1. Buka data absensi untuk satu rentang tanggal dan satu cabang.
2. Pastikan baris tampil tanpa pesan `permission denied for table attendance`.
3. Edit satu jam masuk/pulang, muat ulang, lalu pastikan perubahan tetap ada.
4. Buka Tracking Sales, ubah titik awal/akhir satu hari, dan pastikan hari lain tidak berubah.
5. Impor satu batch kecil kunjungan dan pastikan jumlah baris tidak bertambah ganda saat impor diulang.
6. Di Supabase, bandingkan jumlah baris per tanggal/cabang dengan tampilan HRIS.

Contoh query verifikasi:

```sql
select tanggal, upper(cabang) as cabang, count(*)
from public.attendance
group by tanggal, upper(cabang)
order by tanggal desc, cabang;

select tanggal, upper(cabang) as cabang, count(*)
from public.sales_visits
group by tanggal, upper(cabang)
order by tanggal desc, cabang;
```

## Rollback aman

Jika Supabase bermasalah, ubah provider ke Firestore lalu redeploy:

```text
ATTENDANCE_DB_PROVIDER=firestore
SALES_TRACKING_DB_PROVIDER=firestore
```

Jangan hapus tabel atau data Supabase saat rollback. Setelah penyebab selesai, aktifkan kembali per modul dan validasi periode terbaru.

## Setelah masa validasi

Matikan fallback hanya setelah seluruh periode operasional yang dibutuhkan sudah tervalidasi dan tidak ada selisih data:

```text
ATTENDANCE_FIRESTORE_FALLBACK=false
SALES_TRACKING_FIRESTORE_FALLBACK=false
```

Pertahankan backup dan audit log sebelum melakukan penghapusan data lama.
